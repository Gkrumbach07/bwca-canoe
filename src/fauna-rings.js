import * as THREE from 'three';
import { glslSurface } from './water.js';
import { glslDrawn, glslFoamLight, foamUniforms, foamQuad } from './wake.js';

// Rise rings: the clean, widening circles a fish leaves when it takes something off the surface, the kind you
// see all over a calm bay at dusk (fauna.js Fish). The wake's lace bubbles (wake.js) are the wrong shape for
// it, so these are their own small pool: one instanced quad per ring, everything in instance attributes and
// aged in the shader, riding the drawn swell, in the shared haze. A rise draws a main ring with a fainter one
// inside it; spawning is the only CPU cost, and the pool is one draw call. The quad is subdivided and each vertex
// sits on the swell as the patch draws it (wake.js drawnWave), so no crest cuts a ring into arcs.
//
// A rise ring is not foam: it is a little wave, seen because its crest catches more of the light than the flat water
// round it and its trough less. So a ring brightens the water already drawn under it by a factor (and darkens it a
// little just inside), with a faint film of white lit as the paddle's splashes are (wake.js foamLight): it takes
// the water's own light, the sun, the sky fill, the sky it mirrors, the weather and the haze, so it shows at dusk as
// the water does and never glows. The blend: colour + destination x alpha (alpha is the factor, over one: the scene
// target is half float, so nothing clamps it).

const MAX = 48;

const vert = /* glsl */ `
  uniform float uTime, uWaterTime;
  attribute vec4 aRing;   // x, z relative to the floating origin, birth, size (the final diameter)
  attribute vec2 aLife;   // life (s), the water level
  varying vec2 vUv;
  varying float vAge;
  varying float vSeed;
  varying float vShore;
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
  ${glslSurface}
  ${glslDrawn}
  void main() {
    float age = uTime - aRing.z, t = clamp(age / aLife.x, 0.0, 1.0);
    if (age < 0.0 || age > aLife.x) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }   // a spent slot
    vec3 local = vec3(aRing.x, 0.0, aRing.y) + vec3(position.x, 0.0, position.y) * aRing.w;
    local.y = aLife.y + drawnWave(local.xz, uWaterTime) + 0.012;
    vShore = smoothstep(-0.15, -0.9, shoreAt(local.xz));   // the ring dies out where the water thins to the shore
    vUv = position.xy * 2.0;
    vAge = t;
    vSeed = fract(aRing.z * 3.17);
    vec4 worldPosition = modelMatrix * vec4(local, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
    #include <shadowmap_vertex>
  }
`;

const frag = /* glsl */ `
  uniform vec3 uColor, uSkyMid, uSkyHorizon;
  varying vec2 vUv;
  varying float vAge;
  varying float vSeed;
  varying float vShore;
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <shadowmap_pars_fragment>
  ${glslFoamLight}
  void main() {
    float r = length(vUv), aa = fwidth(r) * 1.2;
    // the ring runs out fast then slows, thinning as it goes; a fainter ring follows inside it
    float c = 0.12 + 0.86 * sqrt(vAge), w = mix(0.05, 0.012, vAge);
    float ring = smoothstep(c - w - aa, c - w * 0.3, r) * (1.0 - smoothstep(c + w * 0.3, c + w + aa, r));
    float c2 = c * 0.62, w2 = w * 0.7;
    float ring2 = smoothstep(c2 - w2 - aa, c2, r) * (1.0 - smoothstep(c2, c2 + w2 + aa, r));
    // the trough just inside each crest, a little darker
    float cT = c - 2.2 * w, trough = smoothstep(cT - w - aa, cT, r) * (1.0 - smoothstep(cT, cT + w + aa, r));
    float k = pow(1.0 - vAge, 1.4) * smoothstep(0.0, 0.04, vAge) * (1.0 - smoothstep(0.96, 1.0, r)) * vShore;
    float lift = (ring * 1.2 + ring2 * 0.5) * k, dim = trough * 0.25 * k;
    if (lift + dim < 0.003) discard;
    float clear = 1.0;
    #ifdef USE_FOG
      clear = 1.0 - fogAt(vFogDir).a;   // in the haze the ring goes with what it lies on
    #endif
    // and the crest's far slope mirrors more of the low sky toward the eye than the flat water does: the dome's own
    // colours, so in the dusk it is the sky's light the ring catches, never more
    vec3 sky = mix(uSkyMid, uSkyHorizon, 0.6) * (ring * 0.14 + ring2 * 0.06);
    gl_FragColor = vec4((uColor * foamLight() * (ring * 0.16 + ring2 * 0.06) + sky) * k * clear, 1.0 + (lift - dim) * clear);
  }
`;

export class RiseRings {
  constructor(water) {
    this.water = water;
    this.origin = { x: water.origin.x, z: water.origin.z };
    const geo = foamQuad(14);   // ~0.25 m a step on a 3.5 m ring: the patch's triangles are 3.2 m
    geo.instanceCount = MAX;
    this.ring = new Float32Array(MAX * 4);
    this.life = new Float32Array(MAX * 2).fill(1);
    for (let i = 0; i < MAX; i++) this.ring[i * 4 + 2] = -1e6;
    this.aRing = new THREE.InstancedBufferAttribute(this.ring, 4).setUsage(THREE.DynamicDrawUsage);
    this.aLife = new THREE.InstancedBufferAttribute(this.life, 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aRing', this.aRing);
    geo.setAttribute('aLife', this.aLife);
    // uColor: the albedo (the light comes from foamLight, as the wake's)
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: { ...foamUniforms(water, { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xdde6ea) } }), uSkyMid: water.uniforms.uSkyMid, uSkyHorizon: water.uniforms.uSkyHorizon },
      transparent: true, depthWrite: false, fog: true, lights: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.position.set(this.origin.x, 0, this.origin.z);
    this.mesh.name = 'rise rings';
    this.head = 0; this.time = 0; this.live = 0; this.dirty = false;
  }
  spawn(x, y, z, size, life = 4) {
    const i = this.head; this.head = (this.head + 1) % MAX;
    this.ring[i * 4] = x - this.origin.x; this.ring[i * 4 + 1] = z - this.origin.z; this.ring[i * 4 + 2] = this.time; this.ring[i * 4 + 3] = size;
    this.life[i * 2] = life; this.life[i * 2 + 1] = y;
    this.live = Math.max(this.live, this.time + life);
    this.dirty = true;
  }
  update(dt) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    this.mesh.visible = this.time < this.live; // nothing to draw once the last ring has gone
    const o = this.water.origin;
    if (o.x !== this.origin.x || o.z !== this.origin.z) {
      const dx = this.origin.x - o.x, dz = this.origin.z - o.z;
      for (let i = 0; i < MAX; i++) { this.ring[i * 4] += dx; this.ring[i * 4 + 1] += dz; }
      this.origin.x = o.x; this.origin.z = o.z;
      this.mesh.position.set(o.x, 0, o.z);
      this.dirty = true;
    }
    if (this.dirty) { this.aRing.needsUpdate = true; this.aLife.needsUpdate = true; this.dirty = false; }
  }
}
