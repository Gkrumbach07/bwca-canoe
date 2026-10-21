import * as THREE from 'three';

// GPU-driven water effects: expanding ripple rings, foam discs and splash droplets live entirely in
// instance attributes and age in the shader, so spawning is the only CPU cost.

const MAX = 900;

const vert = /* glsl */ `
  uniform float uTime;
  attribute vec3 aPos;
  attribute vec3 aVel;
  attribute vec4 aData;   // birth, life, size0, size1
  attribute float aKind;  // 0 ring, 1 droplet, 2 foam disc
  varying vec2 vUv;
  varying float vFade;
  varying float vKind;
  #include <fog_pars_vertex>
  void main() {
    float age = uTime - aData.x;
    float t = clamp(age / max(aData.y, 0.001), 0.0, 1.0);
    float alive = step(0.0, age) * step(age, aData.y);
    float size = mix(aData.z, aData.w, aKind > 0.5 && aKind < 1.5 ? t : sqrt(t)) * alive;
    vec3 p = aPos;
    vec3 world;
    if (aKind > 0.5 && aKind < 1.5) {
      p += aVel * age + vec3(0.0, -4.9 * age * age, 0.0);
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      world = p + (right * position.x + up * position.y) * size;
    } else {
      world = p + vec3(position.x, 0.0, position.y) * size;
    }
    vUv = position.xy;
    vFade = (1.0 - t) * alive;
    vKind = aKind;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
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
    float a;
    if (vKind < 0.5) a = (smoothstep(0.8, 0.9, r) * (1.0 - smoothstep(0.94, 1.0, r))) * 0.3;   // thin ring
    else if (vKind < 1.5) a = (1.0 - smoothstep(0.55, 1.0, r)) * 0.9;                            // droplet
    else a = (1.0 - smoothstep(0.1, 1.0, r)) * 0.28;                                            // soft foam
    a *= vFade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Ripples {
  constructor() {
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
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xeaf4f6) } }]),
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.head = 0;
    this.time = 0;
    this.dirty = false;
  }

  spawn(kind, x, y, z, size0, size1, life, vx = 0, vy = 0, vz = 0) {
    const i = this.head; this.head = (this.head + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.data[i * 4] = this.time; this.data[i * 4 + 1] = life; this.data[i * 4 + 2] = size0; this.data[i * 4 + 3] = size1;
    this.kind[i] = kind;
    this.dirty = true;
  }

  update(dt) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    if (this.dirty) { for (const a of Object.values(this.attrs)) a.needsUpdate = true; this.dirty = false; }
  }
}

// A single quad trailing the stern: two diverging wake arms and a churned centre band.
const wakeFrag = /* glsl */ `
  uniform float uTime, uSpeed;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    float x = 1.0 - vUv.x;            // 0 at the stern, 1 at the far end
    float y = (vUv.y - 0.5) * 2.0;    // -1..1 across
    float len = 0.35 + 0.65 * uSpeed;  // the wake only reaches as far as the speed earns
    float spread = 0.08 + 0.75 * x;
    float w = fwidth(y) * 1.5;
    // two crisp arms, dashed so they read as moving water, plus a short churn triangle at the stern
    // y is in half-widths (3.5 m), x in lengths (14 m): arms ~0.25 m thick, churn as wide as the hull
    float arms = smoothstep(0.035 + w, 0.035 - w, abs(abs(y) - spread));
    float dash = step(0.5, fract(x * 18.0 - uTime * 2.4));
    float churn = step(abs(y), 0.12 * (1.0 - x / 0.16)) * step(x, 0.16);
    float a = max(arms * dash, churn) * step(x, len) * uSpeed;
    if (a < 0.2) discard;
    gl_FragColor = vec4(0.94, 0.97, 0.97, 0.62);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const wakeVert = /* glsl */ `
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

export class WakeV {
  constructor() {
    const geo = new THREE.PlaneGeometry(14, 7, 6, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(-7, 0, 0); // local -x trails behind the stern
    this.material = new THREE.ShaderMaterial({
      vertexShader: wakeVert, fragmentShader: wakeFrag,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSpeed: { value: 0 } }]),
      transparent: true, depthWrite: false, depthTest: false, fog: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 13;
    this.mesh.frustumCulled = false;
  }
  update(dt, x, y, z, heading, speed, visible) {
    this.material.uniforms.uTime.value += dt;
    this.material.uniforms.uSpeed.value += (THREE.MathUtils.clamp(speed / 2.4, 0, 1) - this.material.uniforms.uSpeed.value) * (1 - Math.exp(-dt * 3));
    this.mesh.visible = visible;
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(0, heading, 0);
  }
}
