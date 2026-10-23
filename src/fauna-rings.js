import * as THREE from 'three';
import { glslSurface } from './water.js';

// Rise rings: the clean, widening circles a fish leaves when it takes something off the surface, the kind you
// see all over a calm bay at dusk (fauna.js Fish). The wake's lace bubbles (wake.js) are the wrong shape for
// it, so these are their own small pool: one instanced quad per ring, everything in instance attributes and
// aged in the shader, riding the drawn swell, in the shared haze. A rise draws a main ring with a fainter one
// inside it; spawning is the only CPU cost, and the pool is one draw call.

const MAX = 48;

const vert = /* glsl */ `
  uniform float uTime, uWaterTime;
  attribute vec4 aRing;   // x, z relative to the floating origin, birth, size (the final diameter)
  attribute vec2 aLife;   // life (s), the water level
  varying vec2 vUv;
  varying float vAge;
  varying float vSeed;
  #include <fog_pars_vertex>
  ${glslSurface}
  void main() {
    float age = uTime - aRing.z, t = clamp(age / aLife.x, 0.0, 1.0);
    float alive = step(0.0, age) * step(age, aLife.x);
    vec3 p = vec3(aRing.x, aLife.y + renderedWave(aRing.xy, uWaterTime) + 0.01, aRing.y);
    vec3 local = p + vec3(position.x, 0.0, position.y) * aRing.w * alive;
    vUv = position.xy * 2.0;
    vAge = t;
    vSeed = fract(aRing.z * 3.17);
    vec4 mvPosition = modelViewMatrix * vec4(local, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vAge;
  varying float vSeed;
  #include <fog_pars_fragment>
  void main() {
    float r = length(vUv), aa = fwidth(r) * 1.2;
    // the ring runs out fast then slows, thinning as it goes; a fainter ring follows inside it
    float c = 0.12 + 0.86 * sqrt(vAge), w = mix(0.05, 0.012, vAge);
    float ring = smoothstep(c - w - aa, c - w * 0.3, r) * (1.0 - smoothstep(c + w * 0.3, c + w + aa, r));
    float c2 = c * 0.62, w2 = w * 0.7;
    float ring2 = smoothstep(c2 - w2 - aa, c2, r) * (1.0 - smoothstep(c2, c2 + w2 + aa, r));
    float a = (ring * 0.55 + ring2 * 0.25) * pow(1.0 - vAge, 1.4) * smoothstep(0.0, 0.04, vAge);
    a *= 1.0 - smoothstep(0.96, 1.0, r);
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class RiseRings {
  constructor(water) {
    this.water = water;
    this.origin = { x: water.origin.x, z: water.origin.z };
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.instanceCount = MAX;
    this.ring = new Float32Array(MAX * 4);
    this.life = new Float32Array(MAX * 2).fill(1);
    for (let i = 0; i < MAX; i++) this.ring[i * 4 + 2] = -1e6;
    this.aRing = new THREE.InstancedBufferAttribute(this.ring, 4).setUsage(THREE.DynamicDrawUsage);
    this.aLife = new THREE.InstancedBufferAttribute(this.life, 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aRing', this.aRing);
    geo.setAttribute('aLife', this.aLife);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 }, uColor: { value: new THREE.Color(0xe9eef0) }, ...water.surfaceUniforms() },
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
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
