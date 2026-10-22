import * as THREE from 'three';
import { fogState, setFogColor } from './fog.js';
import { smoothstep } from './rng.js';
import { MONTHS, monthDay, julianDay, utcOffsetHours, sunPosition, moonPosition, skyVector, daysInYear, sunTimes } from './astro.js';
import { seasonAt } from './season.js';

// Time of day and the calendar. The sun and moon stand where they really would over the Boundary Waters
// for the date and the clock; everything that depends on light is keyed on sun elevation (degrees): deep
// night, late dusk, the horizon, golden hour, morning, full day. Values are interpolated between keys.
const KEYS = [-15, -5, -1, 3, 10, 35];
const T = {
  // the key and the fill: one warm sun, one cool sky. While the sun is up the key is strong and warm and the
  // sky fill cool and dim, so lit and shaded surfaces split into two clear families (docs/look.md, rule 3):
  // the fill stays blue right down to the horizon, with the golden hour in the key and the sky's own band
  sunColor: [0x000000, 0x000000, 0xff7a3a, 0xffbc70, 0xffd098, 0xffeac4],
  sunInt: [0, 0, 0.6, 2.0, 2.1, 2.2],
  hemiSky: [0x121a2a, 0x263347, 0x7878a0, 0x7c94cc, 0x86a8d8, 0x82b0e2],
  hemiGround: [0x0b0e12, 0x1a1d1a, 0x4a3e3a, 0x6a5a50, 0x66685a, 0x5f6b58],
  hemiInt: [0.35, 0.4, 0.7, 0.8, 0.6, 0.55],
  // the air: the haze's colour at the horizon and overhead, its warmth toward the sun, its reach (the
  // distance at which it is two thirds of the picture) and the height over which it thins
  fogHorizon: [0x141c28, 0x2a3650, 0xd0a0a0, 0xdcb4a4, 0xcacfd4, 0xbed6e8],
  fogSky: [0x070d18, 0x14223a, 0x3e5a86, 0x5b7fb0, 0x6b97c4, 0x74a4d2],
  fogSun: [0x000000, 0x1a1a2a, 0xff9a58, 0xffbc80, 0xffd8a8, 0xffe9c4],
  glowPow: [10, 10, 4, 4, 6, 10],
  glowAmt: [0, 0.1, 0.8, 0.7, 0.4, 0.25],
  airDist: [1600, 1500, 1000, 850, 950, 1050],
  airHeight: [60, 60, 70, 75, 90, 110],
  // the dome in three stops: the warm band on the horizon, a pale middle, the blue overhead; a low sun glows
  zenith: [0x060c1a, 0x0f1f3a, 0x24416e, 0x3464a8, 0x3878c2, 0x4288d8],
  skyMid: [0x0a1224, 0x1c2d4c, 0x9a86a8, 0xc4cce0, 0xb4cce8, 0x8ab8e6],
  horizon: [0x141c28, 0x2b3a55, 0xe8a070, 0xf2b88a, 0xe8d8bc, 0xcadfee],
  skyGlowAmt: [0, 0.3, 0.6, 0.5, 0.2, 0.08],
  skyGlowPow: [8, 3, 3, 4, 6, 8],
  skySun: [0x000000, 0x000000, 0xffa060, 0xffc890, 0xffe0b0, 0xfff2cc],
  ground: [0x0d1210, 0x1e241e, 0x5e5a4a, 0x80765a, 0x8e9a7e, 0x9aa58a],
  water: [0x0c141e, 0x172636, 0x2f5268, 0x37647c, 0x326f8c, 0x2d7694],   // clear-lake water: darker than the sky, a saturated teal by day
  reflect: [0x101828, 0x202d44, 0xe09a70, 0xe2b68a, 0xcbd3d8, 0xc9dde8],
  cloudTop: [0x1f2634, 0x2e3648, 0xffb080, 0xffcfa0, 0xfbe9d2, 0xfbf8f1],
  cloudBase: [0x101522, 0x1c2434, 0x6e5a74, 0x9a7d8c, 0x9fb0cc, 0xa6bfd9],
  moonInt: [0.3, 0.22, 0.08, 0, 0, 0],
  stars: [1, 0.6, 0.05, 0, 0, 0],
  gain: [0.85, 0.9, 1.0, 1.05, 1.02, 1.02],
  // the colour grade (post.js): the tints turn the hue of the shade and the lights without changing their
  // value: violet shade under an orange light at the golden hour, blue shade under a cream light at midday
  shadowTint: [0x9aa8c8, 0x9aa8c8, 0xa8a8d4, 0xb0b4dc, 0xb4c4e4, 0xbcd0ea],
  highlightTint: [0xfff4e6, 0xfff4e6, 0xffd8b8, 0xffe0c0, 0xffecd4, 0xfff2e0],
  split: [0.45, 0.45, 0.6, 0.6, 0.5, 0.45],
  foam: [0x2a3340, 0x3e4a5c, 0xe8c8a8, 0xf2dfc4, 0xf4efe4, 0xf2f6f6],
};
const NUMERIC = new Set(['sunInt', 'hemiInt', 'glowPow', 'glowAmt', 'airDist', 'airHeight', 'skyGlowAmt', 'skyGlowPow', 'moonInt', 'stars', 'gain', 'split']);
const colors = {};
for (const k of Object.keys(T)) if (!NUMERIC.has(k)) colors[k] = T[k].map((h) => new THREE.Color(h));

function segment(e) {
  if (e <= KEYS[0]) return [0, 0, 0];
  if (e >= KEYS[KEYS.length - 1]) return [KEYS.length - 1, KEYS.length - 1, 0];
  let i = 0;
  while (e > KEYS[i + 1]) i++;
  return [i, i + 1, smoothstep(KEYS[i], KEYS[i + 1], e)];
}

export class DayCycle {
  // targets: { scene, sun, hemi, moon, sky, clouds, water, grade, stars, mist, ripples, hullFoam, moonDisc }
  // place: { lat, lon } where the sky is computed (the start of the trip; the difference across the area is tiny)
  constructor(targets, place = { lat: 47.94, lon: -91.46 }, start = null) {
    this.t = targets;
    this.place = place;
    const now = new Date();
    this.year = start?.year ?? now.getFullYear();
    this.doy = start?.doy ?? Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    this.hours = start?.hours ?? now.getHours() + now.getMinutes() / 60;
    this.running = true;
    this.hoursPerSecond = 24 / (20 * 60); // a full day in 20 real minutes
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, 1, 0);
    this.elevation = 0;
    this.season = seasonAt(this.doy);
    this._c = new THREE.Color();
    this._times = null;
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'SELECT') return;
      if (e.code === 'BracketLeft') this.hours = (this.hours + 23) % 24;
      if (e.code === 'BracketRight') this.hours = (this.hours + 1) % 24;
      if (e.code === 'Minus') this.stepDays(e.shiftKey ? -30 : -1);
      if (e.code === 'Equal') this.stepDays(e.shiftKey ? 30 : 1);
      if (e.code === 'KeyP') this.running = !this.running;
    });
  }

  // set the calendar and the clock outright (a saved trip, a new one starting now)
  setClock(year, doy, hours) {
    this.year = year; this.doy = doy; this.hours = ((hours % 24) + 24) % 24; this._times = null;
    this.stepDays(0);
  }

  stepDays(n) {
    this.doy += n;
    while (this.doy > daysInYear(this.year)) { this.doy -= daysInYear(this.year); this.year++; }
    while (this.doy < 1) { this.year--; this.doy += daysInYear(this.year); }
    this._times = null;
  }

  get date() { const { month, day } = monthDay(this.year, this.doy); return `${MONTHS[month]} ${day}`; }
  get time() { const h = Math.floor(this.hours), m = Math.floor((this.hours - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
  get clock() { return `${this.date} · ${this.time}`; }
  get sunriseSunset() {
    if (!this._times) this._times = sunTimes(this.year, this.doy, this.place.lat, this.place.lon);
    return this._times;
  }

  // dawn mist: strongest in the hour before sunrise, heavier on cold mornings
  get mist() {
    const rise = this.sunriseSunset.rise ?? 5.5;
    return smoothstep(rise - 1.3, rise - 0.2, this.hours) * (1 - smoothstep(rise + 0.6, rise + 2.6, this.hours)) * (0.7 + 0.6 * this.season.cold);
  }

  lerpColor(key, out) {
    const [a, b, t] = this._seg;
    return out.copy(colors[key][a]).lerp(colors[key][b], t);
  }
  lerpNum(key) { const [a, b, t] = this._seg; return T[key][a] + (T[key][b] - T[key][a]) * t; }

  update(dt) {
    if (this.running) {
      this.hours += dt * this.hoursPerSecond;
      if (this.hours >= 24) { this.hours -= 24; this.stepDays(1); }
    }
    this.season = seasonAt(this.doy);
    // the real sky for this date and clock
    const { month, day } = monthDay(this.year, this.doy);
    const jd = julianDay(this.year, month + 1, day) + (this.hours - utcOffsetHours(this.year, this.doy)) / 24;
    const sun = sunPosition(jd, this.place.lat, this.place.lon);
    const moon = moonPosition(jd, this.place.lat, this.place.lon);
    this.elevation = sun.elevation;
    skyVector(sun.azimuth, sun.elevation, this.sunDir);
    skyVector(moon.azimuth, moon.elevation, this.moonDir);
    this.moonUp = moon.elevation > -2;
    this._seg = segment(sun.elevation);
    const c = this._c, t = this.t;
    t.sun.color.copy(this.lerpColor('sunColor', c));
    t.sun.intensity = this.lerpNum('sunInt');
    t.sun.visible = t.sun.intensity > 0.01;
    t.hemi.color.copy(this.lerpColor('hemiSky', c));
    t.hemi.groundColor.copy(this.lerpColor('hemiGround', c));
    t.hemi.intensity = this.lerpNum('hemiInt');
    t.moon.intensity = this.lerpNum('moonInt') * (this.moonUp ? 1 : 0);
    t.moon.visible = t.moon.intensity > 0.01;
    // fog
    t.scene.fog.color.copy(this.lerpColor('fogHorizon', c));
    setFogColor(fogState.sky, this.lerpColor('fogSky', c));
    setFogColor(fogState.sun, this.lerpColor('fogSun', c));
    fogState.sunDir[0] = this.sunDir.x; fogState.sunDir[1] = this.sunDir.y; fogState.sunDir[2] = this.sunDir.z;
    fogState.params[0] = this.lerpNum('glowPow'); fogState.params[1] = this.lerpNum('glowAmt');
    fogState.air[0] = this.lerpNum('airDist'); fogState.air[1] = this.lerpNum('airHeight');
    t.scene.background.copy(t.scene.fog.color);
    // sky dome, sun disc, moon and clouds
    const su = t.sky.material.uniforms;
    su.uZenith.value.copy(this.lerpColor('zenith', c));
    su.uHorizon.value.copy(this.lerpColor('horizon', c));
    if (su.uMid) su.uMid.value.copy(this.lerpColor('skyMid', c));
    if (su.uGlow) su.uGlow.value.set(this.lerpNum('skyGlowAmt'), this.lerpNum('skyGlowPow'));
    su.uSunColor.value.copy(this.lerpColor('skySun', c));
    su.uGround.value.copy(this.lerpColor('ground', c));
    su.uSunDir.value.copy(this.sunDir);
    if (t.moonDisc) {
      const md = t.moonDisc;
      md.position.copy(this.moonDir).multiplyScalar(6300);
      md.visible = this.moonUp;
      md.material.uniforms.uSunDir.value.copy(this.sunDir);
      md.material.uniforms.uDaylight.value = smoothstep(-6, 6, sun.elevation);
    }
    const cu = t.clouds.children[0]?.material.uniforms;
    if (cu) { cu.uTop.value.copy(this.lerpColor('cloudTop', c)); cu.uBase.value.copy(this.lerpColor('cloudBase', c)); cu.uSky.value.copy(su.uZenith.value); cu.uSunDir.value.copy(this.sunDir); }
    if (t.stars) t.stars.material.opacity = this.lerpNum('stars');
    // water
    const wu = t.water.uniforms;
    wu.uWater.value.copy(this.lerpColor('water', c));
    wu.uReflect.value.copy(this.lerpColor('reflect', c));
    wu.uWaterDeep.value.copy(wu.uWater.value).multiplyScalar(0.5);
    wu.uFoam.value.copy(this.lerpColor('foam', c));
    if (wu.uIce) wu.uIce.value = this.season.ice;
    if (t.ripples) t.ripples.material.uniforms.uColor.value.copy(wu.uFoam.value);
    if (t.hullFoam) t.hullFoam.color.copy(wu.uFoam.value);
    wu.uSunDir.value.copy(this.sunDir.y > 0.02 ? this.sunDir : this.moonDir);
    if (t.grade) {
      const gu = t.grade.uniforms;
      gu.uGain.value = this.lerpNum('gain');
      gu.uSplit.value = this.lerpNum('split');
      this.lerpColor('shadowTint', c); gu.uShadowTint.value.set(c.r, c.g, c.b);
      this.lerpColor('highlightTint', c); gu.uHighlightTint.value.set(c.r, c.g, c.b);
    }
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

// The moon: a small sphere on the sky dome lit by the real sun direction, so it shows the real phase.
// Faint earthshine on the dark side, and it fades against daylight.
export function buildMoon(radius = 105) {
  const geo = new THREE.SphereGeometry(radius, 24, 16);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uDaylight: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      void main() { vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform float uDaylight;
      varying vec3 vN;
      void main() {
        float lit = smoothstep(-0.02, 0.12, dot(normalize(vN), uSunDir));
        vec3 face = mix(vec3(0.05, 0.06, 0.08), vec3(0.93, 0.92, 0.86), lit);
        // against a bright sky only the lit part shows, as a pale shape
        if (uDaylight > 0.5 && lit < 0.5) discard;
        float a = mix(1.0, 0.75, uDaylight);
        gl_FragColor = vec4(face, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -8;
  m.frustumCulled = false;
  return m;
}
