import * as THREE from 'three';
import { fogState, setFogColor } from './fog.js';
import { smoothstep } from './rng.js';

// Time of day. Everything that depends on light is keyed on sun elevation (degrees):
// deep night, late dusk, horizon, golden hour, full day. Values are interpolated between keys.
const KEYS = [-15, -4, 0, 8, 35];
const T = {
  sunColor: [0x000000, 0x000000, 0xff8a4a, 0xffc890, 0xfff1dc],
  sunInt: [0, 0, 0.55, 1.45, 1.7],
  hemiSky: [0x121a2a, 0x263347, 0x6f7fa0, 0x9fb8d6, 0xa9c6e0],
  hemiGround: [0x0b0e12, 0x1a1d1a, 0x5a5546, 0x6a7558, 0x6f7a60],
  hemiInt: [0.35, 0.4, 0.6, 0.75, 0.8],
  fogHorizon: [0x141c28, 0x2a3650, 0xe2a978, 0xd9c8ad, 0xbcd2e2],
  fogSky: [0x070d18, 0x14223a, 0x4a6690, 0x6b97c4, 0x6f9cc8],
  fogSun: [0x000000, 0x1a1a2a, 0xffa868, 0xffd3a0, 0xffe9c4],
  glowPow: [10, 10, 5, 7, 10],
  glowAmt: [0, 0.1, 0.8, 0.55, 0.3],
  zenith: [0x060c1a, 0x0f1f3a, 0x2c5280, 0x3c73b2, 0x4382c7],
  horizon: [0x141c28, 0x2b3a55, 0xf1b27a, 0xe6d4b2, 0xc9dceb],
  skySun: [0x000000, 0x000000, 0xffb070, 0xffe0b0, 0xfff2cc],
  ground: [0x0d1210, 0x1e241e, 0x6b6e5a, 0x8e9a7e, 0x9aa58a],
  water: [0x101a26, 0x1b2b3c, 0x6a8aa4, 0x7fafc6, 0x86b8cf],
  reflect: [0x101828, 0x202d44, 0xcf9f7a, 0xcbd3d8, 0xc9dde8],
  cloudTop: [0x1f2634, 0x2e3648, 0xffc29a, 0xfbe9d2, 0xfbf8f1],
  cloudBase: [0x101522, 0x1c2434, 0x7d6f94, 0x9fb0cc, 0xa6bfd9],
  moonInt: [0.3, 0.22, 0.05, 0, 0],
  stars: [1, 0.6, 0, 0, 0],
  gain: [0.85, 0.9, 1.0, 1.0, 1.0],
  foam: [0x2a3340, 0x3e4a5c, 0xe8d6c4, 0xf4efe4, 0xf2f6f6],
};
const colors = {};
for (const k of Object.keys(T)) if (typeof T[k][0] === 'number' && k !== 'sunInt' && k !== 'hemiInt' && k !== 'glowPow' && k !== 'glowAmt' && k !== 'moonInt' && k !== 'stars' && k !== 'gain') colors[k] = T[k].map((h) => new THREE.Color(h));

function segment(e) {
  if (e <= KEYS[0]) return [0, 0, 0];
  if (e >= KEYS[KEYS.length - 1]) return [KEYS.length - 1, KEYS.length - 1, 0];
  let i = 0;
  while (e > KEYS[i + 1]) i++;
  return [i, i + 1, smoothstep(KEYS[i], KEYS[i + 1], e)];
}

export class DayCycle {
  constructor(targets) {
    this.t = targets; // { sun, hemi, moon, sky, clouds, water, grade, stars, mist }
    this.hours = 17.4;        // start in golden hour
    this.running = true;
    this.hoursPerSecond = 24 / (20 * 60); // a full day in 20 real minutes
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.elevation = 0;
    this._c = new THREE.Color();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'BracketLeft') this.hours = (this.hours + 23) % 24;
      if (e.code === 'BracketRight') this.hours = (this.hours + 1) % 24;
      if (e.code === 'KeyP') this.running = !this.running;
    });
  }

  get clock() { const h = Math.floor(this.hours), m = Math.floor((this.hours - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

  // dawn mist: strongest around six in the morning
  get mist() { return smoothstep(4.3, 5.8, this.hours) * (1 - smoothstep(6.3, 8.6, this.hours)); }

  lerpColor(key, out) {
    const [a, b, t] = this._seg;
    return out.copy(colors[key][a]).lerp(colors[key][b], t);
  }
  lerpNum(key) { const [a, b, t] = this._seg; return T[key][a] + (T[key][b] - T[key][a]) * t; }

  update(dt) {
    if (this.running) this.hours = (this.hours + dt * this.hoursPerSecond) % 24;
    // summer sun at 48 N: up about 05:10, down about 21:00, 65 degrees at noon
    const f = (this.hours - 5.2) / 15.8;
    const e = 65 * Math.sin(Math.PI * f);
    const az = THREE.MathUtils.degToRad(65 + 230 * f), el = THREE.MathUtils.degToRad(e);
    this.elevation = e;
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this._seg = segment(e);
    const c = this._c, t = this.t;
    t.sun.color.copy(this.lerpColor('sunColor', c));
    t.sun.intensity = this.lerpNum('sunInt');
    t.sun.visible = t.sun.intensity > 0.01;
    t.hemi.color.copy(this.lerpColor('hemiSky', c));
    t.hemi.groundColor.copy(this.lerpColor('hemiGround', c));
    t.hemi.intensity = this.lerpNum('hemiInt');
    t.moon.intensity = this.lerpNum('moonInt');
    t.moon.visible = t.moon.intensity > 0.01;
    // fog
    t.scene.fog.color.copy(this.lerpColor('fogHorizon', c));
    setFogColor(fogState.sky, this.lerpColor('fogSky', c));
    setFogColor(fogState.sun, this.lerpColor('fogSun', c));
    fogState.sunDir[0] = this.sunDir.x; fogState.sunDir[1] = this.sunDir.y; fogState.sunDir[2] = this.sunDir.z;
    fogState.params[0] = this.lerpNum('glowPow'); fogState.params[1] = this.lerpNum('glowAmt');
    t.scene.background.copy(t.scene.fog.color);
    // sky dome and clouds
    const su = t.sky.material.uniforms;
    su.uZenith.value.copy(this.lerpColor('zenith', c));
    su.uHorizon.value.copy(this.lerpColor('horizon', c));
    su.uSunColor.value.copy(this.lerpColor('skySun', c));
    su.uGround.value.copy(this.lerpColor('ground', c));
    su.uSunDir.value.copy(this.sunDir);
    const cu = t.clouds.children[0]?.material.uniforms;
    if (cu) { cu.uTop.value.copy(this.lerpColor('cloudTop', c)); cu.uBase.value.copy(this.lerpColor('cloudBase', c)); cu.uSky.value.copy(su.uZenith.value); cu.uSunDir.value.copy(this.sunDir); }
    if (t.stars) t.stars.material.opacity = this.lerpNum('stars');
    // water
    const wu = t.water.uniforms;
    wu.uWater.value.copy(this.lerpColor('water', c));
    wu.uReflect.value.copy(this.lerpColor('reflect', c));
    wu.uWaterDeep.value.copy(wu.uWater.value).multiplyScalar(0.72);
    wu.uFoam.value.copy(this.lerpColor('foam', c));
    if (t.ripples) t.ripples.material.uniforms.uColor.value.copy(wu.uFoam.value);
    if (t.hullFoam) t.hullFoam.color.copy(wu.uFoam.value);
    wu.uSunDir.value.copy(this.sunDir.y > 0.02 ? this.sunDir : t.moon.position.clone().normalize());
    if (t.grade) t.grade.uniforms.uGain.value = this.lerpNum('gain');
    if (t.mist) { t.mist.setAmount(this.mist); t.mist.setColor(this.lerpColor('fogHorizon', c).lerp(new THREE.Color(0xffffff), 0.55)); }
  }
}

export function buildStars(radius = 6400, count = 1800, seed = 3) {
  const pos = new Float32Array(count * 3);
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < count; i++) {
    const u = rnd(), v = rnd();
    const th = u * Math.PI * 2, ph = Math.acos(1 - v * 0.95); // mostly above the horizon
    pos[i * 3] = Math.sin(ph) * Math.cos(th) * radius;
    pos[i * 3 + 1] = Math.cos(ph) * radius;
    pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xe8eef8, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -9;
  return pts;
}
