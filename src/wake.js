import * as THREE from 'three';
import { glslSurface } from './water.js';

// GPU-driven water particles: foam bubbles shed from the hull, and splash droplets from the paddle.
// Everything lives in instance attributes and ages in the shader; spawning is the only CPU cost.
// Surface-bound particles sample the same swell as the water patch, so they ride it exactly. Positions
// are kept relative to the water's floating origin (the mesh sits at that origin) for float32 precision.

const MAX = 1400;

const vert = /* glsl */ `
  uniform float uTime, uWaterTime;
  attribute vec3 aPos;
  attribute vec3 aVel;
  attribute vec4 aData;   // birth, life, size0, size1
  attribute float aKind;  // 1 droplet, 3 bubble
  varying vec2 vUv;
  varying float vFade;
  varying float vKind;
  #include <fog_pars_vertex>
  ${glslSurface}
  void main() {
    float age = uTime - aData.x;
    float t = clamp(age / max(aData.y, 0.001), 0.0, 1.0);
    float alive = step(0.0, age) * step(age, aData.y);
    float shore;
    float swell = surfaceWave(aPos.xz, uWaterTime, 1.0, shore);
    vec3 p = aPos;
    vec3 local;
    if (aKind < 2.0) {
      // droplet: ballistic from the surface, billboarded
      float size = mix(aData.z, aData.w, t) * alive;
      p.y += swell;
      p += aVel * age + vec3(0.0, -4.9 * age * age, 0.0);
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      local = p + (right * position.x + up * position.y) * size;
    } else {
      // bubble: drifts on the surface, swells a little, then fades
      float size = mix(aData.z, aData.w, sqrt(t)) * alive;
      p.xz += aVel.xz * age;
      float s2;
      p.y += surfaceWave(p.xz, uWaterTime, 1.0, s2);
      local = p + vec3(position.x, 0.0, position.y) * size;
    }
    vUv = position.xy;
    vFade = (aKind < 2.0 ? (1.0 - t) : (1.0 - smoothstep(0.55, 1.0, t))) * alive;
    vKind = aKind;
    vec4 mvPosition = modelViewMatrix * vec4(local, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vFade;
  varying float vKind;
  #include <fog_pars_fragment>
  void main() {
    float r = length(vUv) * 2.0;
    float a = (vKind < 2.0 ? 1.0 - smoothstep(0.55, 1.0, r) : 1.0 - smoothstep(0.6, 1.0, r)) * vFade;
    if (a < 0.02) discard;
    gl_FragColor = vec4(uColor, a * 0.85);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Ripples {
  constructor(water) {
    this.water = water;
    this.origin = { x: water.origin.x, z: water.origin.z };
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
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
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 }, uColor: { value: new THREE.Color(0xf1f6f6) }, ...water.surfaceUniforms() },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.position.set(this.origin.x, 0, this.origin.z);
    this.head = 0;
    this.time = 0;
    this.dirty = false;
  }

  spawn(kind, x, y, z, size0, size1, life, vx = 0, vy = 0, vz = 0) {
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
