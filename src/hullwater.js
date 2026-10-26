import * as THREE from 'three';
import { glslSurface } from './water.js';
import { glslFoamLight, foamUniforms } from './wake.js';
import { HULL, HULL_COLORS, outerAt, keelAt, innerHalfWidth, floorAt } from './hull.js';

// Where the hull meets the water: a thin soft line hugging the waterline, a small bow wave and a stern eddy
// that grow with speed, next to nothing when the canoe sits still. It replaces the old flat white band.
// The strip rides the swell exactly as the water patch renders it (glslSurface's renderedWave) and slides
// up and down the hull's side with it, so the line stays on the hull as the waves pass. Soft, thin, fading
// white, the same register as the wake and the paddle splashes (wake.js), and lit as they are: a white albedo
// (uColor) under the water's own light (wake.js foamLight: the key by its height in the sun's shadow, and the
// sky fill), so it greys at dusk and under cloud instead of keeping the day table's foam colour, which at an
// overcast dusk made the stern wash the brightest thing in the frame (polish A). Nothing is drawn while the
// hull is rolled over (a capsize) or lifted off the water (set down, carried): the strip would be laid flat
// onto the surface under or beside it.

const vert = /* glsl */ `
  uniform float uWaterTime, uSpeed, uTime, uRest;
  attribute vec3 aOut;      // outward along the water, in the hull's frame
  attribute vec3 aUp;       // up the hull's side per metre of rise
  attribute vec2 aEdge;     // x: 0 at the hull, 1 at the outer edge; y: along the hull, -1 stern .. 1 bow
  varying vec2 vEdge;
  varying float vAlpha;
  varying float vSpeed;
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
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
    // the hull rolled past 60 degrees (a capsize) or its pivot lifted well off the water (set down, carried): nothing
    vec3 hullUp = normalize(vec3(modelMatrix[1]));
    float lift = modelMatrix[3].y - waterAt(modelMatrix[3].xz);
    vAlpha *= step(0.5, hullUp.y) * (1.0 - smoothstep(0.45, 0.7, lift));
    vec4 worldPosition = wp;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
    #include <shadowmap_vertex>
  }
`;

const frag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime, uOpacity;
  varying vec2 vEdge;
  varying float vAlpha;
  varying float vSpeed;
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <shadowmap_pars_fragment>
  ${glslFoamLight}
  float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
  void main() {
    float e = vEdge.x;
    // brightest just off the hull, fading out over the width; a soft broken edge that drifts aft with speed
    float fall = pow(1.0 - smoothstep(0.0, 1.0, e), 1.6) * smoothstep(0.0, 0.08, e + 0.02);
    float brk = n1(vEdge.y * 46.0 + uTime * (0.6 + 4.0 * vSpeed)) * 0.6 + n1(vEdge.y * 13.0 - uTime * 0.7) * 0.4;
    float a = vAlpha * fall * mix(0.65, 1.15, brk) * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor * foamLight(), a);
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
  // uColor: the foam's albedo (the light comes from foamLight, as the wake's)
  const own = { uColor: { value: new THREE.Color(0xe4ecee) }, uSpeed: { value: 0 }, uTime: { value: 0 }, uRest: { value: 0.022 }, uOpacity: { value: 1 } };
  const uniforms = water ? foamUniforms(water, own) : { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...own };
  const material = new THREE.ShaderMaterial({
    vertexShader: water ? vert : 'void main() { gl_Position = vec4(2.0); }',
    fragmentShader: water ? frag : 'void main() { discard; }',
    uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, lights: !!water,
  });
  material.color = uniforms.uColor.value; // the albedo, for anyone who wants to tint it
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 11;
  mesh.userData.update = (dt, speed) => {
    uniforms.uTime.value += dt;
    uniforms.uSpeed.value += (speed - uniforms.uSpeed.value) * (1 - Math.exp(-dt * 3));
  };
  return mesh;
}

// cons B (the owner, 2026-10-25: "spray and swamping: water comes over the gunwale. The hull's water line rises and it
// slows"): the water in the hull. A sheet lying in the bottom of the canoe, its edge on the inside of the hull at the
// level the water stands (BILGE.depth deep amidships when swamped, BILGE.litres), shallower toward the ends where the
// floor rises. It keeps level as the hull rolls and pitches, a little late (a damped slosh, so a roll sends it to the low
// side and back), with a light chop on it, tea-coloured over the green of the floor where it is deep, the floor showing
// through where it is shallow, the sky in it at a glance and a pale meniscus at the hull. Drawn opaque before the lid
// (canoe.js: the lid writes only depth at the gunwales, so the lake never shows inside the hull, and a transparent
// sheet would be hidden by it); nothing is drawn while the hull is dry (a draw range of none, the program compiled at
// the start with everything else). userData.update(dt, fill): fill 0 dry .. 1 swamped (player.js bilge).
export const BILGE = { depth: 0.12, litres: 263, slosh: { w: 2.6, damp: 0.22 }, tea: 0x3a2810 };
const NXT = 72, NYT = 30, NU = 30, NS = 11;
let TABLE = null;
// the hull's inside as tables: the half-width at a station and a height, the floor, the water's volume under a level
function bilgeTable() {
  if (TABLE) return TABLE;
  const half = HULL.L / 2, x0 = -half * 0.985, x1 = half * 0.985, f0 = floorAt(0), y0 = f0 - 0.005, y1 = f0 + 0.26;
  const hw = new Float32Array(NXT * NYT), fl = new Float32Array(NXT), vol = new Float32Array(NYT);
  const dx = (x1 - x0) / (NXT - 1), dy = (y1 - y0) / (NYT - 1);
  for (let i = 0; i < NXT; i++) {
    const x = x0 + dx * i;
    fl[i] = floorAt(x);
    for (let k = 0; k < NYT; k++) hw[i * NYT + k] = innerHalfWidth(x, y0 + dy * k);
  }
  for (let k = 1; k < NYT; k++) { let a = 0; for (let i = 0; i < NXT; i++) a += hw[i * NYT + k - 1] + hw[i * NYT + k]; vol[k] = vol[k - 1] + a * dx * dy; }
  TABLE = { x0, x1, y0, y1, dx, dy, hw, fl, vol, f0 };
  return TABLE;
}
function hwAt(T, x, y) {
  const fi = (x - T.x0) / T.dx, fk = (y - T.y0) / T.dy;
  if (fi < 0 || fi > NXT - 1 || fk < 0) return 0;
  const i = Math.min(NXT - 2, Math.floor(fi)), a = fi - i, kk = Math.min(fk, NYT - 1), k = Math.min(NYT - 2, Math.floor(kk)), b = kk - k;
  const h = T.hw, r0 = i * NYT, r1 = r0 + NYT;
  return (h[r0 + k] * (1 - a) + h[r1 + k] * a) * (1 - b) + (h[r0 + k + 1] * (1 - a) + h[r1 + k + 1] * a) * b;
}
function flAt(T, x) {
  const fi = Math.min(NXT - 1, Math.max(0, (x - T.x0) / T.dx)), i = Math.min(NXT - 2, Math.floor(fi)), a = fi - i;
  return T.fl[i] * (1 - a) + T.fl[i + 1] * a;
}
function volAt(T, y) {
  const fk = Math.min(NYT - 1, Math.max(0, (y - T.y0) / T.dy)), k = Math.min(NYT - 2, Math.floor(fk)), a = fk - k;
  return T.vol[k] * (1 - a) + T.vol[k + 1] * a;
}
// the level (canoe frame) the water stands at with fill (0..1) of a swamped hull aboard
function levelOf(T, fill) {
  const want = fill * volAt(T, T.f0 + BILGE.depth);
  let k = 1;
  while (k < NYT - 1 && T.vol[k] < want) k++;
  const a = (want - T.vol[k - 1]) / Math.max(1e-9, T.vol[k] - T.vol[k - 1]);
  return T.y0 + T.dy * (k - 1 + Math.min(1, Math.max(0, a)));
}

const bilgeVert = /* glsl */ `
  uniform float uTime, uChop;
  attribute vec2 aWet;      // x: 0 in the middle .. 1 at the hull; y: the depth there (m)
  varying vec2 vWet;
  varying vec3 vWorld;
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
  void main() {
    vec3 p = position;
    p.y += (1.0 - aWet.x * aWet.x) * uChop * 0.004 * (sin(p.x * 9.0 - uTime * 4.1) + 0.6 * sin(p.x * 5.3 + p.z * 11.0 + uTime * 3.3));
    vec4 worldPosition = modelMatrix * vec4(p, 1.0);
    vWorld = worldPosition.xyz;
    vWet = aWet;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    vec3 transformedNormal = normalMatrix * vec3(0.0, 1.0, 0.0);
    #include <fog_vertex>
    #include <shadowmap_vertex>
  }
`;
const bilgeFrag = /* glsl */ `
  uniform vec3 uFloor, uTea, uSkyZenith, uSkyHorizon;
  uniform float uTime, uChop;
  varying vec2 vWet;
  varying vec3 vWorld;
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <shadowmap_pars_fragment>
  ${glslFoamLight}
  void main() {
    float shadow = 1.0;
    #if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
      shadow = getSunShadow(sunShadowMap[0], sunLightShadows[0], 0);
    #endif
    vec3 lit = uSunLight * max(uSunDir.y, 0.0) * shadow + uSkyLight;
    vec2 q = vWorld.xz;
    float c = 0.35 + 0.65 * uChop;
    vec3 n = normalize(vec3((0.05 * sin(q.x * 13.0 + uTime * 3.7) + 0.04 * sin(q.y * 17.0 - uTime * 2.9)) * c, 1.0,
      (0.05 * cos(q.y * 11.0 + uTime * 3.1) + 0.04 * sin(q.x * 19.0 + uTime * 4.3)) * c));
    vec3 v = normalize(cameraPosition - vWorld);
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 R = reflect(-v, n);
    vec3 sky = mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 0.6, R.y));
    // the floor seen through the water: tea-brown where it is deep, the hull's own green where it is a skim
    vec3 col = mix(uTea, uFloor, exp(-vWet.y * 9.0)) * lit * 1.25;
    col = mix(col, sky, F * 0.7);
    col += uSunLight * pow(max(dot(R, uSunDir), 0.0), 160.0) * shadow * step(0.0, uSunDir.y) * 2.0;
    col += lit * 0.22 * smoothstep(0.86, 1.0, vWet.x);   // the meniscus at the hull
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildBilge(water) {
  const T = bilgeTable();
  const nv = NU * NS, pos = new Float32Array(nv * 3), wet = new Float32Array(nv * 2), idx = [];
  for (let j = 0; j < NU - 1; j++) for (let i = 0; i < NS - 1; i++) {
    const a = j * NS + i, b = a + 1, c = a + NS, d = c + 1;
    idx.push(a, b, c, b, d, c); // (facing up)
  }
  const geo = new THREE.BufferGeometry();
  const pAttr = new THREE.BufferAttribute(pos, 3), wAttr = new THREE.BufferAttribute(wet, 2);
  pAttr.setUsage(THREE.DynamicDrawUsage); wAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pAttr); geo.setAttribute('aWet', wAttr);
  geo.setIndex(idx);
  geo.setDrawRange(0, 0);
  const own = {
    uFloor: { value: new THREE.Color(HULL_COLORS.in) }, uTea: { value: new THREE.Color(BILGE.tea) },
    uTime: { value: 0 }, uChop: { value: 0 },
  };
  let material;
  if (water) {
    const uniforms = foamUniforms(water, own), w = water.uniforms;
    uniforms.uSkyZenith = w.uSkyZenith; uniforms.uSkyHorizon = w.uSkyHorizon;
    material = new THREE.ShaderMaterial({ vertexShader: bilgeVert, fragmentShader: bilgeFrag, uniforms, fog: true, lights: true });
  } else material = new THREE.MeshBasicMaterial({ color: BILGE.tea });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;      // before the lid (5)
  mesh.receiveShadow = true;
  const S = { ax: 0, az: 0, vx: 0, vz: 0, on: false, fill: 0, frames: 0 };
  // the water's level plane in the hull's frame: y = yb + ax x + az z
  const planeY = (yb, x, z) => yb + S.ax * x + S.az * z;
  mesh.userData.state = S;
  mesh.userData.update = (dt, fill) => {
    if (mesh.layers.mask !== 1) mesh.layers.set(0); // (main.js puts the whole rig on the mirror's layer: not this)
    S.fill = fill;
    // (hidden while dry, but only after the first frames: the start's prewarm compiles what is visible)
    mesh.visible = S.on || fill > 0.002 || ++S.frames < 4;
    if (!(fill > 0.002)) { if (S.on) { geo.setDrawRange(0, 0); S.on = false; S.ax = S.az = S.vx = S.vz = 0; } return; }
    dt = Math.min(Math.max(dt, 0), 0.1);
    own.uTime.value = (own.uTime.value + dt) % 600;
    // world up in the hull's frame: where level lies; the water's own tilt follows it on a damped spring (the slosh)
    const e = mesh.parent ? mesh.parent.matrixWorld.elements : null;
    let tx = 0, tz = 0;
    if (e) {
      const l0 = Math.hypot(e[0], e[1], e[2]) || 1, l1 = Math.hypot(e[4], e[5], e[6]) || 1, l2 = Math.hypot(e[8], e[9], e[10]) || 1;
      const ux = e[1] / l0, uy = e[5] / l1, uz = e[9] / l2;
      if (uy > 0.5) { tx = -ux / uy; tz = -uz / uy; }
    }
    const w = BILGE.slosh.w, z2 = 2 * BILGE.slosh.damp * w;
    if (!S.on) { S.ax = tx; S.az = tz; S.vx = S.vz = 0; }
    const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
    for (let k = 0; k < n; k++) {
      S.vx += (w * w * (tx - S.ax) - z2 * S.vx) * h; S.vz += (w * w * (tz - S.az) - z2 * S.vz) * h;
      S.ax += S.vx * h; S.az += S.vz * h;
    }
    S.ax = Math.max(-0.12, Math.min(0.12, S.ax)); S.az = Math.max(-0.3, Math.min(0.3, S.az));
    own.uChop.value = Math.min(1, 0.25 + 6 * Math.hypot(S.vx, S.vz) + 0.5 * fill);
    const yb = levelOf(T, fill);
    // how far the water runs toward each end: where the floor rises out of it
    const g = (x) => flAt(T, x) - planeY(yb, x, 0);
    if (g(0) >= 0) { geo.setDrawRange(0, 0); S.on = false; return; }
    const end = (lim) => { if (g(lim) < 0) return lim; let a = 0, b = lim; for (let k = 0; k < 18; k++) { const m = (a + b) / 2; if (g(m) < 0) a = m; else b = m; } return a; };
    const xb = end(T.x1), xs = end(T.x0);
    for (let j = 0; j < NU; j++) {
      const u = 0.5 - 0.5 * Math.cos((Math.PI * j) / (NU - 1)), x = xs + (xb - xs) * u, yc = planeY(yb, x, 0);
      // the edge on each side, where the tilted level meets the hull's inside
      let zs = hwAt(T, x, yc), zp = zs;
      for (let k = 0; k < 3; k++) { zs = hwAt(T, x, yc + S.az * zs); zp = hwAt(T, x, yc - S.az * zp); }
      zs *= 0.985; zp *= 0.985;
      const depth = Math.max(0, yc - flAt(T, x));
      for (let i = 0; i < NS; i++) {
        const s = -1 + (2 * i) / (NS - 1), z = s < 0 ? s * zp : s * zs, k = j * NS + i;
        pos[k * 3] = x; pos[k * 3 + 1] = yc + S.az * z + 0.0025; pos[k * 3 + 2] = z;
        wet[k * 2] = Math.abs(s); wet[k * 2 + 1] = depth;
      }
    }
    pAttr.needsUpdate = true; wAttr.needsUpdate = true;
    if (!S.on) { geo.setDrawRange(0, idx.length); S.on = true; }
  };
  return mesh;
}
