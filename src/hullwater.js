import * as THREE from 'three';
import { glslSurface } from './water.js';
import { HULL, outerAt, keelAt } from './hull.js';

// Where the hull meets the water: a thin soft line hugging the waterline, a small bow wave and a stern eddy
// that grow with speed, next to nothing when the canoe sits still. It replaces the old flat white band.
// The strip rides the swell exactly as the water patch renders it (glslSurface's renderedWave) and slides
// up and down the hull's side with it, so the line stays on the hull as the waves pass. Soft, thin, fading
// white, the same register as the wake and the paddle splashes (wake.js); its colour is the water's foam
// colour, which the day cycle sets (daycycle.js copies it into material.color).

const vert = /* glsl */ `
  uniform float uWaterTime, uSpeed, uTime, uRest;
  attribute vec3 aOut;      // outward along the water, in the hull's frame
  attribute vec3 aUp;       // up the hull's side per metre of rise
  attribute vec2 aEdge;     // x: 0 at the hull, 1 at the outer edge; y: along the hull, -1 stern .. 1 bow
  varying vec2 vEdge;
  varying float vAlpha;
  varying float vSpeed;
  #include <fog_pars_vertex>
  ${glslSurface}
  float waterAt(vec2 world) { vec2 rel = world - uOrigin; return levelAt(rel) + renderedWave(rel, uWaterTime); }
  void main() {
    float u = aEdge.y, e = aEdge.x;
    float v = clamp(uSpeed / 2.4, -1.0, 1.0), sp = abs(v);
    float lead = smoothstep(0.5, 0.95, u * sign(v + 1e-4));    // the end that leads
    float trail = smoothstep(0.55, 0.95, -u * sign(v + 1e-4)); // the end that trails
    // slide the hull point up or down its side to where the water is
    vec3 p = position;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    float dy = clamp(waterAt(wp.xz) - wp.y, -0.12, 0.12);
    p += aUp * dy;
    // the width: a hairline at rest, a bow wave at the leading end, an eddy trailing off the stern
    float w = uRest + 0.035 * sp + 0.22 * lead * sp * sp + 0.16 * trail * sp;
    float ripple = sin(u * 38.0 - uTime * (3.0 + 6.0 * sp)) * 0.5 + 0.5;
    w *= 1.0 + 0.25 * ripple * sp;
    vec3 dirOut = normalize(aOut - vec3(0.85 * lead * sp * sign(v + 1e-4), 0.0, 0.0) + vec3(-0.6 * trail * sp * sign(v + 1e-4), 0.0, 0.0));
    p += dirOut * (0.006 + w * e);
    wp = modelMatrix * vec4(p, 1.0);
    wp.y = waterAt(wp.xz) + 0.006 + 0.004 * (1.0 - e);
    vEdge = aEdge;
    vSpeed = sp;
    vAlpha = 0.22 + 0.25 * sp + 0.35 * lead * sp + 0.2 * trail * sp;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime, uOpacity;
  varying vec2 vEdge;
  varying float vAlpha;
  varying float vSpeed;
  #include <fog_pars_fragment>
  float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
  void main() {
    float e = vEdge.x;
    // brightest just off the hull, fading out over the width; a soft broken edge that drifts aft with speed
    float fall = pow(1.0 - smoothstep(0.0, 1.0, e), 1.6) * smoothstep(0.0, 0.08, e + 0.02);
    float brk = n1(vEdge.y * 46.0 + uTime * (0.6 + 4.0 * vSpeed)) * 0.6 + n1(vEdge.y * 13.0 - uTime * 0.7) * 0.4;
    float a = vAlpha * fall * mix(0.65, 1.15, brk) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// the waterline at rest (y = -floatOffset in the hull's frame): a closed loop round the hull
function waterline(yw, n = 34) {
  const half = HULL.L / 2;
  // where the keel line crosses the water at the ends
  let lo = 0.5, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (keelAt(m) < yw) lo = m; else hi = m; }
  const uEnd = lo;
  const pts = [];
  const side = (sg) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const s = -1 + (2 * i) / n, u = Math.sin((s * Math.PI) / 2) * uEnd, x = u * half;
      const o = outerAt(x, yw);
      // up the side: how far the waterline moves out per metre of rise
      const o2 = outerAt(x, yw + 0.02);
      out.push({ x, z: sg * o.z, u: u / uEnd, dzdy: sg * (o2.z - o.z) / 0.02 });
    }
    return out;
  };
  const stb = side(1), port = side(-1).reverse();
  // starboard stern -> bow, then port bow -> stern; the end points are shared (z = 0)
  for (const q of stb) pts.push(q);
  for (let i = 1; i < port.length - 1; i++) pts.push(port[i]);
  // the stem's rake at the ends: the waterline creeps forward as the water rises
  const rake = (end) => { const u0 = uEnd; let a = 0.5, b = 1; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (keelAt(m) < yw + 0.03) a = m; else b = m; } return ((a - u0) * half) / 0.03 * end; };
  return { pts, rakeBow: rake(1), rakeStern: rake(-1) };
}

export function buildHullWater(water, floatOffset) {
  const yw = -floatOffset;
  const { pts, rakeBow, rakeStern } = waterline(yw);
  const N = pts.length;
  const pos = new Float32Array(N * 2 * 3), outA = new Float32Array(N * 2 * 3), upA = new Float32Array(N * 2 * 3), edge = new Float32Array(N * 2 * 2);
  for (let i = 0; i < N; i++) {
    const q = pts[i], a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    // outward: the loop's normal in plan
    let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    let ox = tz, oz = -tx; // right of the direction of travel round the loop
    if (ox * q.x + oz * q.z < 0 && Math.abs(q.z) > 1e-4) { ox = -ox; oz = -oz; }
    if (Math.abs(q.z) < 1e-4) { ox = Math.sign(q.x); oz = 0; }
    const up = Math.abs(q.z) < 1e-4 ? [q.x > 0 ? rakeBow : rakeStern, 1, 0] : [0, 1, q.dzdy];
    for (let e = 0; e < 2; e++) {
      const k = i * 2 + e;
      pos.set([q.x, yw, q.z], k * 3); outA.set([ox, 0, oz], k * 3); upA.set(up, k * 3); edge.set([e, q.u], k * 2);
    }
  }
  const idx = [];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, a = i * 2, b = i * 2 + 1, c = j * 2, d = j * 2 + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aOut', new THREE.BufferAttribute(outA, 3));
  geo.setAttribute('aUp', new THREE.BufferAttribute(upA, 3));
  geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 2));
  geo.setIndex(idx);
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uColor: { value: new THREE.Color(0xf1f6f6) }, uSpeed: { value: 0 }, uTime: { value: 0 }, uRest: { value: 0.022 }, uOpacity: { value: 1 },
    ...(water ? water.surfaceUniforms() : {}),
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: water ? vert : 'void main() { gl_Position = vec4(2.0); }',
    fragmentShader: water ? frag : 'void main() { discard; }',
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  material.color = uniforms.uColor.value; // the day cycle writes the foam colour here
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  mesh.userData.update = (dt, speed) => {
    uniforms.uTime.value += dt;
    uniforms.uSpeed.value += (speed - uniforms.uSpeed.value) * (1 - Math.exp(-dt * 3));
  };
  return mesh;
}
