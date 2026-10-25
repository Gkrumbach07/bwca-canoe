import * as THREE from 'three';
import { glslSurface } from './water.js';

// GPU-driven water particles: foam bubbles shed from the hull, and splash droplets from the paddle.
// Everything lives in instance attributes and ages in the shader; spawning is the only CPU cost.
// Surface-bound particles sample the swell exactly as the water patch renders it, so they ride it.
// Positions are kept relative to the water's floating origin (the mesh sits at that origin) for
// float32 precision.

const MAX = 1400;

// What a ring or a bubble lying on the water needs from it (wake.js Ripples, fauna-rings.js RiseRings):
//   drawnWave   the swell exactly as the near patch draws it: the patch is a 3.2 m grid of two triangles a
//               quad (PlaneGeometry's split, from the quad's (0, 1) corner to its (1, 0) one), each vertex
//               carrying surfaceWave, so between vertices the surface is flat triangles, not the bilinear
//               blend renderedWave gives (a few centimetres apart on a chop). A flat quad at the swell of its
//               centre went under the crests round it, which cut rings into arcs; these quads are subdivided
//               and every vertex follows the drawn triangles. Past the patch, renderedWave (the far mesh is
//               near it, and that far off a centimetre does not show).
//   foamLight   the light on something white lying flat on the water, as the water's own body takes it: the
//               key (the sun, or the moon at night) by its height, in the sun's shadow, and the sky fill, all
//               read by reference from the water's uniforms (WaterSystem.update sets them from the lights the
//               day cycle and the weather drive), so a splash or a rise ring is lit like the water round it and
//               goes grey at dusk and dark at night instead of glowing a fixed white.
// Needs glslSurface (water.js) and, for the shadow, <common>, <packing> and <shadowmap_pars_fragment>.
export const glslDrawn = /* glsl */ `
  float drawnWave(vec2 rel, float t) {
    vec2 origin = uPatchLocal - vec2(uPatchHalf);
    vec2 f = (rel - origin) / uPatchRes;
    float n = 2.0 * uPatchHalf / uPatchRes;
    if (f.x < 0.0 || f.y < 0.0 || f.x >= n || f.y >= n) return renderedWave(rel, t);
    vec2 fi = floor(f), a = f - fi;
    vec2 p00 = origin + fi * uPatchRes, p10 = p00 + vec2(uPatchRes, 0.0), p01 = p00 + vec2(0.0, uPatchRes);
    float s;
    float w10 = surfaceWave(p10, t, patchBorder(p10), s), w01 = surfaceWave(p01, t, patchBorder(p01), s);
    if (a.x + a.y < 1.0) { float w00 = surfaceWave(p00, t, patchBorder(p00), s); return w00 + a.x * (w10 - w00) + a.y * (w01 - w00); }
    vec2 p11 = p00 + vec2(uPatchRes);
    float w11 = surfaceWave(p11, t, patchBorder(p11), s);
    return w11 + (1.0 - a.x) * (w01 - w11) + (1.0 - a.y) * (w10 - w11);
  }
`;
export const glslFoamLight = /* glsl */ `
  uniform vec3 uSunLight, uSkyLight, uSunDir;
  // white lying flat on the water: about the brightness the day tables' foam had at noon, and the light's own
  // colour and strength at every other hour and in every weather
  const float FOAM_GAIN = 2.0;
  vec3 foamLight() {
    float shadow = 1.0;
    #if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
      shadow = getSunShadow(sunShadowMap[0], sunLightShadows[0], 0);
    #endif
    return (uSunLight * max(uSunDir.y, 0.0) * shadow + uSkyLight) * FOAM_GAIN;
  }
`;
// The uniforms a foam material takes: the fog, the lights (for the sun's shadow map), the surface, and the
// water's light by reference.
export function foamUniforms(water, own) {
  const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights, own]);
  const w = water.uniforms;
  Object.assign(u, water.surfaceUniforms(), { uSunLight: w.uSunLight, uSkyLight: w.uSkyLight, uSunDir: w.uSunDir });
  return u;
}
// A unit quad in the xy plane, subdivided so a ring or a bubble can follow the swell across it
export function foamQuad(segments) {
  const base = new THREE.PlaneGeometry(1, 1, segments, segments);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  return geo;
}

const vert = /* glsl */ `
  uniform float uTime, uWaterTime;
  attribute vec3 aPos;
  attribute vec3 aVel;
  attribute vec4 aData;   // birth, life, size0, size1
  attribute float aKind;  // 1 droplet, 3 bubble
  varying vec2 vUv;
  varying float vFade;
  varying float vKind;
  varying float vAge;
  varying float vSeed;
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
  ${glslSurface}
  ${glslDrawn}
  void main() {
    float age = uTime - aData.x;
    if (age < 0.0 || age > aData.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // a spent slot: nothing to draw
    float t = clamp(age / max(aData.y, 0.001), 0.0, 1.0);
    vec3 p = aPos;
    vec3 local;
    float fade;
    if (aKind < 2.0) {
      // droplet: ballistic from the surface, billboarded
      float size = mix(aData.z, aData.w, t);
      p.y += renderedWave(aPos.xz, uWaterTime);
      p += aVel * age + vec3(0.0, -4.9 * age * age, 0.0);
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      local = p + (right * position.x + up * position.y) * size;
      fade = 1.0 - t;
    } else {
      // bubble: drifts on the surface, swells a little, then fades; every vertex of it on the drawn swell (a
      // centimetre over it), and it thins out where the water does, so a ring meets a shore instead of being cut
      float size = mix(aData.z, aData.w, sqrt(t));
      p.xz += aVel.xz * age;
      local = p + vec3(position.x, 0.0, position.y) * size;
      local.y = aPos.y + drawnWave(local.xz, uWaterTime) + 0.012;
      fade = (1.0 - smoothstep(0.15, 0.85, t)) * smoothstep(0.0, 0.08, t) * smoothstep(-0.15, -0.9, shoreAt(local.xz));
    }
    vUv = position.xy;
    vFade = fade;
    vKind = aKind;
    vAge = t;
    vSeed = fract(aData.x * 7.31 + aPos.x * 0.37);
    vec4 worldPosition = modelMatrix * vec4(local, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
    #include <shadowmap_vertex>
  }
`;

// Soft white, thin and fading, like the shore's lines (water.js): a droplet is a small soft dot; a bubble left by
// the hull is a thin ring that widens and thins as it drifts, with a faint wash inside, gone in a second or two,
// so the wake reads as lace on the water rather than a trail of white discs. Lit as the water round it is
// (foamLight), hazed by the shared fog.
const frag = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vFade;
  varying float vKind;
  varying float vAge;
  varying float vSeed;
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <shadowmap_pars_fragment>
  ${glslFoamLight}
  void main() {
    float r = length(vUv) * 2.0;
    float a;
    if (vKind < 2.0) a = (1.0 - smoothstep(0.2, 1.0, r)) * 0.7;
    else {
      float w = mix(0.22, 0.08, vAge), c = mix(0.6, 0.86, vAge), aa = fwidth(r);
      float ring = smoothstep(c - w - aa, c - w * 0.3, r) * (1.0 - smoothstep(c + w * 0.3, c + w + aa, r));
      // thinned round its circumference, differently for each bubble, so the trail is lace and not a row of rings;
      // softly, and in more pieces than the two or three lobes that read as paw prints (polish A)
      float ang = atan(vUv.y, vUv.x);
      ring *= smoothstep(-0.1, 0.9, 0.5 + 0.5 * sin(ang * 3.0 + vSeed * 40.0) * sin(ang * 5.0 - vSeed * 23.0 + 1.3));
      // each bubble its own strength, none as strong as they were
      a = (ring * 0.2 + (1.0 - smoothstep(0.0, c, r)) * 0.05) * (0.55 + 0.45 * fract(vSeed * 7.7)) * (1.0 - smoothstep(0.9, 1.0, r));
    }
    a *= vFade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * foamLight(), a);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// The canoe's waterline foam (canoe.js draws it as a flat white band either side of the hull): faded from the
// hull outward and kept faint, so it is a soft line where the hull meets the water and not a white V at the bow.
// The band's vertices pair up along the hull; the one nearer the centreline is its inner edge.
export function softenHullFoam(mesh) {
  if (!mesh || !mesh.geometry) return;
  const g = mesh.geometry, pos = g.getAttribute('position'), n = pos.count;
  const key = (i) => `${pos.getX(i).toFixed(3)}|${Math.sign(pos.getZ(i))}`;
  const span = new Map();
  for (let i = 0; i < n; i++) {
    const k = key(i), z = Math.abs(pos.getZ(i)), r = span.get(k) || [Infinity, -Infinity];
    r[0] = Math.min(r[0], z); r[1] = Math.max(r[1], z); span.set(k, r);
  }
  const col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [lo, hi] = span.get(key(i)), t = hi > lo ? (Math.abs(pos.getZ(i)) - lo) / (hi - lo) : 0;
    col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1;
    col[i * 4 + 3] = 0.22 * (1 - t) * (1 - t);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  mesh.material.opacity = 1;
  mesh.material.needsUpdate = true;
}

export class Ripples {
  constructor(water) {
    this.water = water;
    this.origin = { x: water.origin.x, z: water.origin.z };
    const geo = foamQuad(6);
    geo.instanceCount = MAX;
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.data = new Float32Array(MAX * 4);
    this.kind = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) this.data[i * 4] = -1e6;
    this.attrs = {
      aPos: new THREE.InstancedBufferAttribute(this.pos, 3),
      aVel: new THREE.InstancedBufferAttribute(this.vel, 3),
      aData: new THREE.InstancedBufferAttribute(this.data, 4),
      aKind: new THREE.InstancedBufferAttribute(this.kind, 1),
    };
    for (const [k, a] of Object.entries(this.attrs)) { a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, a); }
    // uColor: the foam's albedo (the light comes from foamLight)
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: foamUniforms(water, { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xe4ecee) } }),
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true, lights: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.position.set(this.origin.x, 0, this.origin.z);
    this.head = 0;
    this.time = 0;
    this.dirty = false;
    // polish A: the travel's time-lapse (player.boost, main.js sets it each frame). The hull's bubbles are laid along
    // the track at the lapsed speed while this clock runs at life, so at Trip pace a two-second bubble lay 20 m back:
    // their life is cut by the lapse past 2.5 (their drift kept), so the trail fades within about 8 m at any pace;
    // and only every other one is kept, so the trail is a few bubbles a metre, not a dotted line
    this.lapse = 1;
    this.odd = false;
  }

  spawn(kind, x, y, z, size0, size1, life, vx = 0, vy = 0, vz = 0) {
    if (kind === 3) {
      if ((this.odd = !this.odd)) return;
      const k = Math.max(1, this.lapse / 2.5);
      life /= k; vx *= k; vz *= k;
    }
    const i = this.head; this.head = (this.head + 1) % MAX;
    this.pos[i * 3] = x - this.origin.x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z - this.origin.z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.data[i * 4] = this.time; this.data[i * 4 + 1] = life; this.data[i * 4 + 2] = size0; this.data[i * 4 + 3] = size1;
    this.kind[i] = kind;
    this.dirty = true;
  }

  update(dt) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    const o = this.water.origin;
    if (o.x !== this.origin.x || o.z !== this.origin.z) {
      // the floating origin moved: keep every live particle where it was
      const dx = this.origin.x - o.x, dz = this.origin.z - o.z;
      for (let i = 0; i < MAX; i++) { this.pos[i * 3] += dx; this.pos[i * 3 + 2] += dz; }
      this.origin.x = o.x; this.origin.z = o.z;
      this.mesh.position.set(o.x, 0, o.z);
      this.dirty = true;
    }
    if (this.dirty) { for (const a of Object.values(this.attrs)) a.needsUpdate = true; this.dirty = false; }
  }
}
