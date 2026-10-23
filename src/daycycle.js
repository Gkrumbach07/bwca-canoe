import * as THREE from 'three';
import { fogState, setFogColor, sampleRamp, FOG_REACH } from './fog.js';
import { CURVE_STEPS } from './post.js';
import { smoothstep } from './rng.js';
import { MONTHS, monthDay, julianDay, utcOffsetHours, sunPosition, moonPosition, skyVector, daysInYear, sunTimes, siderealDeg } from './astro.js';
import { orientStars } from './stars.js';
import { seasonAt } from './season.js';

// Time of day and the calendar. The sun and moon stand where they really would over the Boundary Waters
// for the date and the clock; everything that depends on light is keyed on sun elevation (degrees): deep
// night, late dusk, the horizon, golden hour, morning, full day. Values are interpolated between keys, all
// in update(): the light, the sky, both fog ramps, the god rays and the grade's curves share the keys and the
// one blend, so a change of hour moves them together (Campo Santo's interpolation manager, docs/look.md).
// The weather (weather.js, attached as day.weather) runs inside the same update and its look is laid over what the
// tables set (applyWeather), so the sun's share, the fill, the fog, the sky, the clouds and the grade under cloud,
// rain or fog are keyed by the sun's height like everything else (the wx* rows say how much of the weather's grade
// each key takes).
const KEYS = [-15, -5, -1, 3, 10, 35];
const T = {
  // the key and the fill: one warm sun, one cool sky. While the sun is up the key is strong and warm and the
  // sky fill cool and dim, so lit and shaded surfaces split into two clear families (docs/look.md, rule 3):
  // the fill stays blue right down to the horizon, with the golden hour in the key and the sky's own band
  sunColor: [0x000000, 0x000000, 0xff7a3a, 0xffb05c, 0xffc884, 0xffe6bc],
  sunInt: [0, 0, 0.6, 2.0, 2.1, 2.2],
  hemiSky: [0x121a2a, 0x263347, 0x7088ac, 0x7898c4, 0x84a8d4, 0x82b0e2],
  hemiGround: [0x0b0e12, 0x1a1d1a, 0x4a3e3a, 0x6a5a50, 0x7a7462, 0x847e68], // by day the bounce off sunlit ground is warm and not small
  // the fill carries every shaded side by itself now the toon ramp's floor (a quarter of the key on any face
  // turned from the sun) is gone: about a third of the key on flat ground by day (pass 1, smooth light)
  // the golden-hour keys (3 and 10 degrees) carry a little more fill than the light alone would, so ground in full
  // shade at 16:30-17:30 in October reads as cool shade, not a hole, while the key's warm side keeps its contrast
  hemiInt: [0.35, 0.45, 0.85, 1.2, 1.3, 1.2],
  // the air (fog.js): two colour ramps by distance, one looking away from the sun and one looking into it. Each
  // key gives each ramp a mid colour (the band a few hundred metres out, where the haze starts to take things)
  // and a far colour (where the far shore goes flat); the amount follows AMOUNT below with its distances
  // scaled by fogReach (under 1 the air is thicker). Away from the sun the far shore goes cool and pale (a pale
  // blue, never lilac), into a low sun warm (orange-yellow) and bright. The far colours sit a step darker than
  // the sky's horizon so the far shore stays a shape against it. fogSky is the haze looking up; fogDesat how
  // much the mid band greys what it covers.
  fogMid: [0x131a2a, 0x26314e, 0x7688aa, 0x94a8c6, 0xa0b4cc, 0x9fb8d0],
  fogFar: [0x1b2639, 0x283450, 0x94a2bc, 0xbcc6d4, 0xbccad8, 0xb4cce0],
  fogSunMid: [0x131a2a, 0x3a3858, 0xd09078, 0xf0b878, 0xe4cca0, 0xc4ccd0],
  fogSunFar: [0x1b2639, 0x4e4462, 0xe8a888, 0xffd498, 0xf2dcb8, 0xd8e0e4],
  fogSky: [0x070d18, 0x14223a, 0x3e5a86, 0x5b7fb0, 0x6b97c4, 0x74a4d2],
  fogReach: [1.25, 1.1, 0.9, 0.85, 0.95, 1.0],
  fogDesat: [0.3, 0.4, 0.5, 0.5, 0.55, 0.6],
  // the blend toward the sun-ward ramp: pow(cos(angle to the sun), sunwardPow) * sunwardAmt
  sunwardPow: [4, 3, 3, 3, 4, 6],
  sunwardAmt: [0, 0.4, 0.9, 1.0, 0.9, 0.6],
  airHeight: [60, 60, 70, 75, 90, 110],
  // the dome in three stops: the warm band on the horizon, a pale middle, the blue overhead; a low sun glows,
  // and toward it the warm bands reach higher (skyLift). By day every warm stop is yellow-orange (green well above
  // blue) and every cool one cyan-blue (green above red), so no blend between them can go violet; pink and violet
  // are the sky's at dusk and night only (keys -5 and -1)
  zenith: [0x060c1a, 0x0f1f3a, 0x2a4278, 0x3468b4, 0x3878c2, 0x2f80dc],
  skyMid: [0x0a1224, 0x1c2d4c, 0xc49a94, 0xdcd6b4, 0xbcd2e6, 0x8cbcec],
  horizon: [0x222f46, 0x2e3d58, 0xe49464, 0xf2bc7c, 0xeedcb8, 0xe6e4d8],
  skyGlowAmt: [0, 0.3, 0.6, 0.3, 0.14, 0.08],
  skyGlowPow: [8, 3, 3, 4, 6, 8],
  skyLift: [0, 0.6, 1.0, 0.9, 0.5, 0.1], // how much higher the warm bands reach looking toward the sun (sky.js)
  skySun: [0x000000, 0x5a3a48, 0xff9858, 0xffd080, 0xffe4b4, 0xfff2cc],
  ground: [0x0d1210, 0x1e241e, 0x5e5a4a, 0x80765a, 0x8e9a7e, 0x9aa58a],
  cloudTop: [0x1f2634, 0x2e3648, 0xffb080, 0xffcfa0, 0xfbe9d2, 0xfbf8f1],
  cloudBase: [0x101522, 0x1c2434, 0x7c6a6c, 0x8c96a8, 0x9fb0cc, 0xa6bfd9],
  moonInt: [0.3, 0.22, 0.08, 0, 0, 0],
  stars: [1, 0.6, 0.05, 0, 0, 0],
  // the grade (post.js), in display values after the tone map: exposure, saturation, and a five-point curve
  // per channel (out at in = 0, 1/4, 1/2, 3/4, 1). Lifting a channel's low end tints the shade, its top end the
  // lights: by day the shade lifts blue (blue most, green a little above red, so it stays between 200 and 225
  // degrees and never goes violet) under mids and lights warmed orange-yellow (red, then green, over blue); at the
  // golden hour and dusk the reds lift further through the mids; blue hour and night lean blue-violet as before.
  // At the golden-hour keys (3 and 10 degrees) the toe is lifted evenly in all three channels (+0.008 at black, about
  // +0.022 at a quarter), with the fill above, so full shade stays a readable cool value under the warm lights.
  // A curve that holds green below both red and blue anywhere turns every grey there magenta; at the black point
  // green lifts as much as blue, or dim warm browns (lit ground at a low sun) pass through magenta on their way.
  gain: [0.95, 0.95, 1.0, 1.05, 1.02, 1.02],
  saturation: [0.9, 0.95, 1.08, 1.12, 1.08, 1.08],
  curveR: [[0.025, 0.255, 0.49, 0.735, 0.97], [0.035, 0.27, 0.505, 0.748, 0.985], [0.035, 0.262, 0.55, 0.79, 1], [0.038, 0.28, 0.55, 0.79, 1], [0.038, 0.277, 0.525, 0.77, 1], [0.03, 0.258, 0.512, 0.762, 1]],
  curveG: [[0.03, 0.262, 0.5, 0.745, 0.98], [0.032, 0.26, 0.495, 0.742, 0.985], [0.052, 0.268, 0.51, 0.755, 0.985], [0.058, 0.289, 0.52, 0.765, 0.99], [0.056, 0.284, 0.51, 0.758, 0.995], [0.046, 0.265, 0.508, 0.756, 1]],
  curveB: [[0.06, 0.295, 0.535, 0.775, 1], [0.065, 0.305, 0.54, 0.77, 1], [0.052, 0.295, 0.5, 0.72, 0.95], [0.058, 0.312, 0.49, 0.715, 0.95], [0.056, 0.305, 0.5, 0.735, 0.97], [0.046, 0.28, 0.5, 0.742, 0.985]],
  // god rays from the sun disc through whatever stands in front of it (post.js): none once the sun is down
  rays: [0, 0, 0.35, 1.0, 0.8, 0.35],
  foam: [0x2a3340, 0x3e4a5c, 0xe8c8a8, 0xf2dfc4, 0xf4efe4, 0xf2f6f6],
  // the weather's grade (applyWeather): how much of its desaturation and of its cool cast each key takes (little of
  // the cooling at night, which is blue already), and the exposure under a full grey sky (a camera opens up a little)
  wxDesat: [0.3, 0.5, 0.8, 1, 1, 1],
  wxCool: [0.1, 0.25, 0.55, 0.9, 1, 1],
  wxGain: [1, 1, 1.02, 1.05, 1.07, 1.08],
};
const NUMERIC = new Set(['sunInt', 'hemiInt', 'fogReach', 'fogDesat', 'sunwardPow', 'sunwardAmt', 'airHeight', 'skyGlowAmt', 'skyGlowPow', 'skyLift', 'moonInt', 'stars', 'gain', 'saturation', 'rays', 'wxDesat', 'wxCool', 'wxGain']);
const CURVES = new Set(['curveR', 'curveG', 'curveB']);
const colors = {};

// The fog ramps per key, sampled once: the amount by distance (metres of air at sea-level density, at fogReach
// 1), and the colour from the mid colour to the far one between 250 m and 1.4 km.
const AMOUNT = [[0, 0], [80, 0], [200, 0.05], [400, 0.26], [650, 0.55], [950, 0.79], [1500, 0.9], [3000, 0.96], [8000, 0.985]];
function along(stops, s) {
  if (!(s < stops[stops.length - 1][0])) return stops[stops.length - 1][1];
  let i = 0;
  while (s > stops[i + 1][0]) i++;
  return stops[i][1] + (stops[i + 1][1] - stops[i][1]) * smoothstep(stops[i][0], stops[i + 1][0], s);
}
const RAMPS = { away: [], sunward: [] };

// The grade's curves per key: each channel's five points through a monotone cubic (Fritsch-Carlson, so a
// curve never overshoots its points), sampled to CURVE_STEPS, interleaved r, g, b.
function monotone(ys, x) {
  const n = ys.length, h = 1 / (n - 1), d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / h);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], q = a * a + b * b;
    if (q > 9) { const t = 3 / Math.sqrt(q); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const i = Math.min(n - 2, Math.floor(x / h)), t = (x - i * h) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
}
const LUTS = [];

// Builds the colours, the fog ramps and the curves from the tables. Runs once here; to tune by eye, change a
// row of DAY_TABLES.T in the console and call DAY_TABLES.rebuild() (the next frame shows it).
function buildTables() {
  for (const k of Object.keys(T)) if (!NUMERIC.has(k) && !CURVES.has(k)) colors[k] = T[k].map((h) => new THREE.Color(h));
  RAMPS.away.length = 0; RAMPS.sunward.length = 0; LUTS.length = 0;
  for (let k = 0; k < KEYS.length; k++) {
    const reach = T.fogReach[k];
    const ramp = (mid, far) => sampleRamp((s) => along(AMOUNT, s / reach), (s, c) => c.copy(mid).lerp(far, smoothstep(250, 1400, s / reach)));
    RAMPS.away.push(ramp(colors.fogMid[k], colors.fogFar[k]));
    RAMPS.sunward.push(ramp(colors.fogSunMid[k], colors.fogSunFar[k]));
    const lut = new Float32Array(CURVE_STEPS * 3);
    [T.curveR[k], T.curveG[k], T.curveB[k]].forEach((pts, ch) => { for (let i = 0; i < CURVE_STEPS; i++) lut[i * 3 + ch] = monotone(pts, i / (CURVE_STEPS - 1)); });
    LUTS.push(lut);
  }
}
buildTables();
export const DAY_TABLES = { KEYS, T, AMOUNT, rebuild: buildTables };

function segment(e) {
  if (e <= KEYS[0]) return [0, 0, 0];
  if (e >= KEYS[KEYS.length - 1]) return [KEYS.length - 1, KEYS.length - 1, 0];
  let i = 0;
  while (e > KEYS[i + 1]) i++;
  return [i, i + 1, smoothstep(KEYS[i], KEYS[i + 1], e)];
}

export class DayCycle {
  // targets: { scene, sun, hemi, moon, sky, clouds, water, post, stars, mist, ripples, hullFoam, moonDisc }
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
  // one of the per-key arrays (fog ramps, curves) interpolated into out
  lerpArray(perKey, out) {
    const [a, b, t] = this._seg, A = perKey[a], B = perKey[b];
    for (let i = 0; i < out.length; i++) out[i] = A[i] + (B[i] - A[i]) * t;
    return out;
  }

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
    // the stars turn with the sky about the pole (stars.js), set for the real date, clock and longitude
    if (this.t.stars) orientStars(this.t.stars, this.place.lat, siderealDeg(jd, this.place.lon));
    this._seg = segment(sun.elevation);
    const W = this.weather ? this.weather.update(dt, this) : null; // the weather's look for this frame (weather.js)
    const c = this._c, t = this.t;
    t.sun.color.copy(this.lerpColor('sunColor', c));
    // The lights never come and go: the sun, the fill and the moon stay in the scene with their intensity driven to
    // zero, because a change in the number of lights (or of shadow casters) recompiles every lit material at once,
    // which is what dropped the frame rate at sunset, sunrise, moonrise and moonset. With the sun down its shadows
    // fade out (so the moonlit water is not masked by a stale map) and main.js stops redrawing the map.
    t.sun.intensity = this.lerpNum('sunInt');
    t.sun.visible = true;
    const sh = this._shadow || (this._shadow = { intensity: t.sun.shadow.intensity, radius: t.sun.shadow.radius });
    t.sun.shadow.intensity = sh.intensity * smoothstep(0.0, 0.05, t.sun.intensity);
    t.sun.shadow.radius = sh.radius;
    t.hemi.color.copy(this.lerpColor('hemiSky', c));
    t.hemi.groundColor.copy(this.lerpColor('hemiGround', c));
    t.hemi.intensity = this.lerpNum('hemiInt');
    t.moon.intensity = this.lerpNum('moonInt') * smoothstep(-2, 1, moon.elevation);
    t.moon.visible = true;
    // the air: the two ramps, the sun-ward blend, the haze overhead, its height
    this.lerpArray(RAMPS.away, fogState.away);
    this.lerpArray(RAMPS.sunward, fogState.sunward);
    setFogColor(fogState.sky, this.lerpColor('fogSky', c));
    fogState.sunDir[0] = this.sunDir.x; fogState.sunDir[1] = this.sunDir.y; fogState.sunDir[2] = this.sunDir.z;
    fogState.params[0] = this.lerpNum('sunwardPow'); fogState.params[1] = this.lerpNum('sunwardAmt'); fogState.params[2] = this.lerpNum('fogDesat');
    fogState.air[1] = this.lerpNum('airHeight');
    t.scene.fog.color.copy(this.lerpColor('fogFar', c)); // not read by the shader; the far colour for anything that asks
    t.scene.background.copy(t.scene.fog.color);
    // sky dome, sun disc, moon and clouds
    const su = t.sky.material.uniforms;
    su.uZenith.value.copy(this.lerpColor('zenith', c));
    su.uHorizon.value.copy(this.lerpColor('horizon', c));
    if (su.uMid) su.uMid.value.copy(this.lerpColor('skyMid', c));
    if (su.uGlow) su.uGlow.value.set(this.lerpNum('skyGlowAmt'), this.lerpNum('skyGlowPow'), this.lerpNum('skyLift'));
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
    const cu = (t.clouds.userData.material || t.clouds.children[0]?.material)?.uniforms;
    if (cu) { cu.uTop.value.copy(this.lerpColor('cloudTop', c)); cu.uBase.value.copy(this.lerpColor('cloudBase', c)); cu.uSky.value.copy(su.uZenith.value); cu.uSunDir.value.copy(this.sunDir); }
    if (t.stars) t.stars.material.uniforms.uOpacity.value = this.lerpNum('stars');
    // water: the foam, the ice and the sun's glint (its colour is the sky dome and the shore it mirrors, water.js); the
    // wake's and the fish's rings take the water's light themselves (wake.js foamLight)
    const wu = t.water.uniforms;
    wu.uFoam.value.copy(this.lerpColor('foam', c));
    if (wu.uIce) wu.uIce.value = this.season.ice;
    if (t.hullFoam) t.hullFoam.color.copy(wu.uFoam.value);
    wu.uSunDir.value.copy(this.sunDir.y > 0.02 ? this.sunDir : this.moonDir);
    // the grade and the god rays (post.js)
    if (t.post) {
      const L = t.post.look;
      L.exposure = this.lerpNum('gain');
      L.saturation = this.lerpNum('saturation');
      this.lerpArray(LUTS, L.curve);
      L.rays = this.lerpNum('rays');
      L.rayColor.copy(su.uSunColor.value);
      L.sunDir.copy(this.sunDir);
    }
    if (t.mist) { t.mist.setAmount(this.mist); t.mist.setColor(this.lerpColor('fogFar', c).lerp(_white, 0.55)); }
    fogState.air[0] = FOG_REACH;
    fogState.layer[3] = 0;
    if (W) this.applyWeather(W);
  }

  // The weather's look (weather.js) laid over what the tables set this frame. Everything is set afresh each frame, so
  // nothing accumulates. hide is how much of the sun the cloud takes; grey how far the fill, the fog and the sky go
  // to a neutral grey (the deck's colour, DC, is the table's cloud underside greyed, so it is keyed with the sun: pale
  // grey at noon, warm-grey at a low sun, near black at night); fog the low layer on the water.
  applyWeather(W) {
    const t = this.t, c = this._c, su = t.sky.material.uniforms, wx = this.weather;
    const hide = 1 - W.sun, grey = W.grey, deck = W.deck, fog = W.fog, f = W.flash, fc = wx.flashColor;
    // by night the cloud's darkness counts for less (an overcast night is darker than a clear one, not black), and a
    // flash counts for more (lightning lights a dark night like day for an instant)
    const night = 1 - smoothstep(-8, 4, this.elevation);
    const bright = W.bright + (1 - W.bright) * night * 0.7;
    // the light: the sun's share, its shadows fainter and softer under cloud, none in rain; the sky fill brighter,
    // greyer, and the bounce off the ground dimmer without the sun on it
    t.sun.intensity *= W.sun;
    const sh = this._shadow;
    t.sun.shadow.intensity *= W.shadow;
    t.sun.shadow.radius = sh.radius * (1 + 2.5 * W.soft);
    t.hemi.intensity *= W.fill;
    toGrey(t.hemi.color, grey * 0.75, 1);
    t.hemi.groundColor.multiplyScalar(1 - 0.4 * hide * grey);
    t.moon.intensity *= 1 - 0.8 * deck;
    // the cloud's own colour
    const DC = toGrey(_dc.copy(colors.cloudBase[this._seg[0]]).lerp(colors.cloudBase[this._seg[1]], this._seg[2]), 1, 1.05 * bright);
    // the air: the ramps closed in (reach) and greyed, the sun's side of them fading as the sun goes in, more of what
    // the haze covers greyed; the haze overhead toward the deck
    fogState.air[0] = FOG_REACH * W.reach;
    fogState.params[1] *= 1 - 0.9 * hide * (1 - 0.6 * fog);
    fogState.params[2] += (0.85 - fogState.params[2]) * grey * 0.6;
    for (const ramp of [fogState.away, fogState.sunward]) {
      for (let i = 0; i < ramp.length; i += 4) {
        const l = (0.2126 * ramp[i] + 0.7152 * ramp[i + 1] + 0.0722 * ramp[i + 2]) * bright;
        ramp[i] += (l * 0.95 - ramp[i]) * grey + fc.r * f * 0.12;
        ramp[i + 1] += (l * 0.99 - ramp[i + 1]) * grey + fc.g * f * 0.12;
        ramp[i + 2] += (l * 1.06 - ramp[i + 2]) * grey + fc.b * f * 0.12;
      }
    }
    const far = _far.setRGB(fogState.away[60], fogState.away[61], fogState.away[62]);
    setFogColor(fogState.sky, c.setRGB(fogState.sky[0], fogState.sky[1], fogState.sky[2]).lerp(DC, deck * 0.8));
    t.scene.fog.color.copy(far); t.scene.background.copy(far);
    // the low layer on the water: thick at dawn, thinning and rising as the sun climbs; lit like the far haze (a step
    // paler and greyer), with a glow toward the sun
    const layer = toGrey(_layer.copy(far), 0.35, 1.1);
    if (fog > 0.01) {
      fogState.layer[0] = 0.026 * Math.pow(fog, 1.3);
      fogState.layer[1] = W.level - 1;
      fogState.layer[2] = 5 + 10 * (1 - fog);
      fogState.layer[3] = 1;
      setFogColor(fogState.layerColor, layer);
      setFogColor(fogState.layerSun, c.copy(su.uSunColor.value).multiplyScalar(0.4 * fog * (1 - 0.7 * hide)));
    }
    // the dome: the deck's grey overhead and the haze's far colour on the horizon, so the far shore and the deck's rim
    // dissolve into it; the low sun's glow and the disc go in with the sun
    su.uZenith.value.lerp(c.copy(DC).multiplyScalar(0.9), deck);
    su.uMid.value.lerp(DC, deck).lerp(layer, fog * 0.4);
    su.uHorizon.value.lerp(c.copy(far).multiplyScalar(1.04), Math.max(deck * 0.9, grey * 0.5)).lerp(layer, fog * 0.9);
    su.uGlow.value.x *= 1 - hide;
    su.uSunColor.value.multiplyScalar(1 - 0.85 * hide);
    const disc = this._disc || (this._disc = su.uDisc.value.clone());
    su.uDisc.value.set(disc.x, disc.y * (1 - hide) * (1 - hide), disc.z * (1 - 0.8 * hide));
    if (f > 0) {
      t.hemi.intensity += f * (2.2 + 2.5 * night);
      t.hemi.color.lerp(fc, Math.min(1, f * 0.5));
      for (const u of [su.uZenith, su.uMid, su.uHorizon]) u.value.add(c.copy(fc).multiplyScalar(f * 0.3));
    }
    // the clouds: the cumulus greyed and darkened toward the deck, a storm's nearly black underneath; the deck; the
    // cover, the wind and the water level for updateClouds (sky.js)
    const cd = t.clouds.userData, cu = cd.material.uniforms, du = cd.deckMat.uniforms;
    cu.uTop.value.lerp(c.copy(DC).multiplyScalar(1.15), grey * 0.85).multiplyScalar(1 - 0.5 * W.dark);
    cu.uBase.value.lerp(c.copy(DC).multiplyScalar(0.75), grey).multiplyScalar(1 - 0.62 * W.dark);
    cu.uSky.value.copy(su.uZenith.value);
    cu.uFlash.value.copy(fc).multiplyScalar(f * 0.5);
    // a thunderhead: lit as a cloud top is (greyed only as the sky greys), its shade and its base a dark slate, the
    // cloud's grey turned a little toward the sky's blue (cyan-blue, never violet)
    const au = cd.anvilMaterial.uniforms;
    au.uTop.value.copy(this.lerpColor('cloudTop', _anvil)).lerp(c.copy(DC).multiplyScalar(1.1), 0.12 + grey * 0.5);
    au.uBase.value.copy(DC).lerp(su.uZenith.value, 0.25).multiplyScalar(0.2);
    au.uSky.value.copy(su.uZenith.value); au.uSunDir.value.copy(this.sunDir); au.uFlash.value.copy(cu.uFlash.value);
    du.uLit.value.copy(DC).multiplyScalar(1.08);
    du.uDark.value.copy(DC).multiplyScalar(0.62 - 0.3 * W.dark);
    du.uSunDir.value.copy(this.sunDir);
    du.uSunColor.value.copy(su.uSunColor.value);
    du.uFlash.value.copy(fc).multiplyScalar(f * 0.6);
    const wind = wx.wind, cw = cd.weather || (cd.weather = {});
    cw.cover = W.cover; cw.deck = deck; cw.dark = W.dark; cw.anvil = W.anvil * (1 - 0.95 * deck); cw.base = W.level;
    if (W.snap) { cw.snap = true; W.snap = false; }
    if (wind) { const d = wind.dir; cw.windX = d.x; cw.windZ = d.z; cw.windSpeed = wind.speed; } else { cw.windX = 1; cw.windZ = 0; cw.windSpeed = 2; }
    if (t.stars) t.stars.material.uniforms.uOpacity.value *= (1 - deck) * (1 - 0.8 * fog);
    if (t.moonDisc && deck > 0.6) t.moonDisc.visible = false;   // the deck's rim fades out low in the sky; the moon goes behind it
    // the grade: greyer, a cool cast (every channel toward green's curve, then blue a little over it and red under:
    // cyan-blue, never violet), a touch more exposure; no god rays behind cloud
    if (t.post) {
      const L = t.post.look;
      L.saturation *= 1 - 0.75 * W.desat * this.lerpNum('wxDesat');
      L.exposure *= 1 + (this.lerpNum('wxGain') - 1) * grey;
      L.rays *= (1 - hide) * (1 - hide);
      const k = W.cool * this.lerpNum('wxCool'), cv = L.curve, n = cv.length / 3;
      if (k > 0.001) for (let i = 0; i < n; i++) {
        const x = i / (n - 1), bump = 4 * x * (1 - x), g = cv[i * 3 + 1];
        cv[i * 3] += (g - 0.012 * bump - cv[i * 3]) * k;
        cv[i * 3 + 1] += 0.002 * bump * k;
        cv[i * 3 + 2] += (g + 0.02 * bump - cv[i * 3 + 2]) * k;
      }
    }
    // the mist sheets on the water (mist.js): the dawn's wisps go in the rain; in the fog they thicken and rise as
    // it lifts
    if (t.mist) {
      const m = t.mist, base = this._mistLift || (this._mistLift = m.layers.map((l) => l.uniforms.uLift.value));
      m.setAmount(Math.max(this.mist * (1 - Math.min(1, W.rain * 3 + deck * 0.5)), fog));
      m.layers.forEach((l, i) => { l.uniforms.uLift.value = base[i] + (fog > 0.02 ? (1 - fog) * 5 : 0); });
      if (fog > 0.01) m.setColor(c.copy(layer).multiplyScalar(1.1));
      else if (grey > 0.01) m.layers.forEach((l) => l.uniforms.uColor.value.multiplyScalar(1 - 0.5 * grey));   // no sun on the wisps under cloud
    }
  }
}

const _white = new THREE.Color(1, 1, 1), _dc = new THREE.Color(), _far = new THREE.Color(), _layer = new THREE.Color(), _g = new THREE.Color(), _anvil = new THREE.Color();
// a colour toward the neutral (a breath of blue in it) of its own luminance times bright, by k
function toGrey(col, k, bright = 1) {
  const l = (0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b) * bright;
  return col.lerp(_g.setRGB(l * 0.95, l * 0.99, l * 1.06), k);
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
