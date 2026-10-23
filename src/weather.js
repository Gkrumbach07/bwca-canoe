import * as THREE from 'three';
import { mulberry32, smoothstep, noise2 } from './rng.js';
import { daysInYear, monthDay, MONTHS, sunTimes } from './astro.js';
import { Precip } from './rain.js';

// The weather (docs/roadmap.md, phase 3): seven states, a seeded forecast that evolves over hours, and the look of
// each one handed to the day cycle, which keys it with the sun so the light, the sky, the fog, the clouds and the
// grade move together.
//
//   the states    clear, fair (broken cumulus), overcast, fog (on the water at dawn, burning off by mid-morning),
//                 light rain, steady rain, thunderstorm. Below about 1 C the rain falls as snow (flurries, snow, a
//                 squall), from the temperature of the day and hour.
//   the forecast  built a year at a time from the seed, hour by hour, out of weather systems the way the Boundary
//                 Waters gets them: high pressure for one to four days (clear nights, fair-weather cumulus on warm
//                 afternoons, fog on calm mornings, most in late summer and fall when the lakes are warmer than the
//                 air, a thunderstorm on some humid summer afternoons), then a front (high cloud thickening to
//                 overcast as the wind backs to the south-east and rises, light rain, steady rain, in summer a storm on
//                 the cold front, then clearing behind it on a gusty north-west wind), and in late fall now and then a
//                 grey spell of low overcast and drizzle on an east wind. A function of the date and hour, so setting
//                 the clock gives the same weather every time and a saved trip needs nothing saved.
//   the look      a vector per state (LOOKS) blended between the hours (each change takes an hour), read by the day
//                 cycle (DayCycle.applyWeather): cloud cover, the deck and its darkness, the anvils, the sun's share
//                 of the light, the sky fill, the shadows' strength and softness, the fog's reach and how grey it
//                 goes, the grade's desaturation and cooling, the rain, the low fog layer, the lightning, and the wind
//                 (Wind.update reads windTarget).
//   the effects   here: the rain or snow round the camera (rain.js), the rings on the water (water.js uRain), the
//                 wetness (WEATHER.uWetness), the lightning's flash (the day cycle adds it to the sky fill, the sky,
//                 the clouds and the fog) and its thunder, and the sound cues.
//
// Debug: __game.weather.set('storm') holds a state (blend: seconds to cross over), .set('snow') snow flurries,
// .set('building') thunderheads before a storm, .release() back to the forecast, .state / .label / .info() what is on
// now, .forecast(24) the next hours, .strike() lightning now.
export const WEATHER_STATES = ['clear', 'fair', 'overcast', 'fog', 'light-rain', 'rain', 'storm'];
// internal states: the seven, and 7, thunderheads building before a summer storm (reported as fair)
const S = { clear: 0, fair: 1, overcast: 2, fog: 3, lightRain: 4, rain: 5, storm: 6, building: 7 };
const PUBLIC = [0, 1, 2, 3, 4, 5, 6, 1];
const LABELS = ['Clear', 'Fair, broken cumulus', 'Overcast', 'Fog on the water', 'Light rain', 'Steady rain', 'Thunderstorm', 'Thunderheads building'];
const SNOW_LABELS = { 4: 'Snow flurries', 5: 'Snow', 6: 'Snow squall' };

// Global uniforms for any material: how wet the world is (0 dry .. 1 soaked: rises in minutes of rain, dries over an
// hour or three after it, faster in sun and wind). The look materials can read it to darken and deepen porous
// surfaces (glslWet below); nothing reads it yet.
export const WEATHER = {
  uWetness: { value: 0 },
};
// wetAlbedo(colour, porosity): a surface's albedo wet. Porous ground, duff and bark darken to about half and
// saturate a little; rock less (porosity 0.5); 0 leaves it as it is.
export const glslWet = /* glsl */ `
  uniform float uWetness;
  vec3 wetAlbedo(vec3 c, float porosity) {
    float k = uWetness * porosity;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return mix(c, max(mix(vec3(l), c, 1.2), 0.0) * 0.52, k);
  }
`;

// The look of each state. cover: the cumulus share; deck: the overcast layer; dark: how dark the cloud is; anvil: a
// storm's towers; sun: the sun's share of its light; fill: the sky fill's gain; shadow, soft: the shadows' strength
// and softness; reach: the fog's distances (under 1 it closes in); grey: how far the fog and the fill go to grey;
// bright: the grey's brightness; desat, cool: the grade; rain: the precipitation; fog: the low layer on the water
// (scaled by the sun's height, see _lookOf); lightning: strikes; windMin (m/s), windMul, gust: the wind.
const LOOKS = [
  { cover: 0.12, deck: 0, dark: 0, anvil: 0, sun: 1, fill: 1, shadow: 1, soft: 0, reach: 1, grey: 0, bright: 1, desat: 0, cool: 0, rain: 0, fog: 0, lightning: 0, windMin: 0, windMul: 1, gust: 1 },
  { cover: 0.75, deck: 0, dark: 0.06, anvil: 0, sun: 0.95, fill: 1.04, shadow: 0.95, soft: 0.1, reach: 0.95, grey: 0.04, bright: 1, desat: 0.03, cool: 0.05, rain: 0, fog: 0, lightning: 0, windMin: 0, windMul: 1.1, gust: 1.2 },
  { cover: 0, deck: 1, dark: 0.3, anvil: 0, sun: 0.16, fill: 1.5, shadow: 0.3, soft: 1, reach: 0.7, grey: 0.65, bright: 0.9, desat: 0.32, cool: 0.65, rain: 0, fog: 0, lightning: 0, windMin: 2.5, windMul: 1.1, gust: 1 },
  { cover: 0.05, deck: 0.1, dark: 0.1, anvil: 0, sun: 0.7, fill: 1.15, shadow: 0.7, soft: 0.5, reach: 0.7, grey: 0.4, bright: 1.12, desat: 0.15, cool: 0.3, rain: 0, fog: 1, lightning: 0, windMin: 0, windMul: 0.12, gust: 0.5 },
  { cover: 0, deck: 1, dark: 0.45, anvil: 0, sun: 0.08, fill: 1.45, shadow: 0.05, soft: 1, reach: 0.42, grey: 0.78, bright: 0.72, desat: 0.4, cool: 0.8, rain: 0.35, fog: 0, lightning: 0, windMin: 4, windMul: 1.15, gust: 1.1 },
  { cover: 0, deck: 1, dark: 0.6, anvil: 0, sun: 0.04, fill: 1.35, shadow: 0, soft: 1, reach: 0.3, grey: 0.86, bright: 0.55, desat: 0.45, cool: 0.9, rain: 0.75, fog: 0, lightning: 0, windMin: 5.5, windMul: 1.2, gust: 1.3 },
  { cover: 0, deck: 1, dark: 0.88, anvil: 0, sun: 0.03, fill: 1.15, shadow: 0, soft: 1, reach: 0.32, grey: 0.86, bright: 0.38, desat: 0.4, cool: 1, rain: 1, fog: 0, lightning: 1, windMin: 8, windMul: 1.3, gust: 2.3 },
  { cover: 0.55, deck: 0, dark: 0.25, anvil: 1, sun: 0.85, fill: 1.08, shadow: 0.85, soft: 0.2, reach: 0.9, grey: 0.12, bright: 0.95, desat: 0.06, cool: 0.15, rain: 0, fog: 0, lightning: 0.15, windMin: 0, windMul: 1.2, gust: 1.3 },
];
const FIELDS = Object.keys(LOOKS[0]);

// the year's seasons, 0..1 by day of the year
const warmth = (d) => smoothstep(110, 160, d) * (1 - smoothstep(250, 290, d));          // fair-weather cumulus
const summer = (d) => smoothstep(150, 172, d) * (1 - smoothstep(232, 252, d));          // thunderstorms
const fogSeason = (d) => smoothstep(215, 240, d) * (1 - smoothstep(300, 322, d)) + 0.3 * smoothstep(128, 140, d) * (1 - smoothstep(160, 175, d));
const greySeason = (d) => 0.12 + 0.33 * smoothstep(290, 312, d) * (1 - smoothstep(345, 360, d)) + 0.12 * (1 - smoothstep(90, 120, d));
// air temperature, C: a fit to Ely's monthly means (-14 in late January, 19 in late July), the day's swing (smaller
// under cloud), a slow seeded anomaly of a few degrees, and the chill of rain
function airTemp(seed, year, doy, hours, grey = 0, rain = 0) {
  const mean = 2.5 - 16.5 * Math.cos((2 * Math.PI * (doy - 25)) / 365.25);
  const swing = 5.5 * (1 - 0.65 * grey) * Math.sin((2 * Math.PI * (hours - 9)) / 24);
  const anomaly = (noise2((year * 366 + doy + hours / 24) / 3.2, 0.5, seed) - 0.5) * 6;
  return mean + swing + anomaly - 1.5 * rain;
}

// The forecast for a year, hour by hour from 1 January 00:00 into the first two days of the next: the state and the
// wind it brings (from: the bearing it steers toward, NaN to let the day's wind wander; min: a floor, m/s; mul: on the
// day's wind; gust: on the gusts).
function buildYear(seed, year, place) {
  const days = daysInYear(year), N = (days + 2) * 24;
  const st = new Uint8Array(N), from = new Float32Array(N).fill(NaN), min = new Float32Array(N), mul = new Float32Array(N).fill(1), gust = new Float32Array(N).fill(1);
  const rng = mulberry32((Math.imul(seed, 2654435761) ^ Math.imul(year, 40503)) >>> 0);
  const R = (a, b) => a + (b - a) * rng();
  const I = (a, b) => Math.floor(R(a, b + 1));
  const doyOf = (h) => Math.min(days, Math.max(1, 1 + Math.floor(h / 24)));
  const put = (h, s, f = NaN, mn = 0, ml = 1, g = 1) => { if (h >= 0 && h < N) { st[h] = s; from[h] = f; min[h] = mn; mul[h] = ml; gust[h] = g; } };
  const run = (h, n, s, f, mn, ml, g) => { for (let k = 0; k < n; k++) put(h + k, s, f, mn, ml, g); return h + n; };
  const sunrise = (doy) => sunTimes(year, doy, place.lat, place.lon).rise ?? 6.5;
  // high pressure: day by day
  const high = (h0, firstAfterFront) => {
    const d0 = doyOf(h0), dur = Math.round(I(30, 100) * (1 + 0.3 * warmth(d0)));
    let h = h0, end = h0 + dur, first = firstAfterFront;
    while (h < end) {
      const day = Math.floor(h / 24), doy = doyOf(h), w = warmth(doy);
      const cu = rng() < 0.25 + 0.55 * w;
      const strat = !cu && rng() < 0.25 * (1 - w);   // a cold-season high under stratocumulus
      const storm = cu && rng() < 0.3 * summer(doy);
      const stormAt = I(14, 18), stormLen = I(1, 2);
      const fog = rng() < (0.05 + 0.45 * fogSeason(doy)) * (first ? 0.35 : 1);
      const fogEnd = fog ? Math.round(sunrise(doy) + 2.6) : 0;
      for (let local = h - day * 24; local < 24 && h < end; local++, h++) {
        if (fog && local >= 1 && local < fogEnd) put(h, S.fog, NaN, 0, 0.12, 0.5);
        else if (storm && local >= stormAt && local < stormAt + stormLen) put(h, S.storm, R(275, 310), 8, 1.3, 2.3);
        else if (storm && local === stormAt + stormLen) put(h, S.lightRain, 300, 4, 1.1, 1.5);
        else if (storm && local >= stormAt - 2 && local < stormAt) put(h, S.building, NaN, 0, 1.2, 1.3);
        else if ((cu || storm) && local >= 11 && local < 19) put(h, S.fair, NaN, 0, 1, 1.15);
        else if (strat && local >= 8 && local < 20) put(h, S.fair, NaN, 0, 1, 1);
        else put(h, S.clear, first && local < 12 ? 315 : NaN, 0, 0.9, 1);
      }
      first = false;
    }
    return end;
  };
  // a front passing: the cloud thickens, the wind backs and rises, rain, clearing behind on the north-west wind
  const front = (h) => {
    const doy = doyOf(h), sm = summer(doy);
    h = run(h, I(3, 6), S.fair, 150, 2, 1.1, 1);
    h = run(h, I(4, 10), S.overcast, 160, 3.5, 1.2, 1);
    h = run(h, I(1, 4), S.lightRain, 180, 4.5, 1.15, 1.1);
    h = run(h, I(2, 7) + (sm > 0.5 ? 0 : I(0, 3)), S.rain, R(195, 225), 5.5, 1.2, 1.3);
    if (rng() < 0.5 * sm + 0.1 * warmth(doy)) h = run(h, I(1, 3), S.storm, R(270, 300), 8.5, 1.3, 2.3);
    h = run(h, I(0, 2), S.lightRain, 290, 5, 1.15, 1.3);
    h = run(h, I(1, 4), S.overcast, 300, 5, 1.15, 1.3);
    h = run(h, I(6, 14), S.fair, R(305, 330), 6, 1.2, 1.6);
    return run(h, I(3, 8), S.clear, 320, 3.5, 1.1, 1.3);
  };
  // a grey spell: low overcast and drizzle on an east wind
  const grey = (h) => {
    const n = I(14, 44), f = R(55, 95);
    for (let k = 0; k < n; k += 3) h = run(h, 3, rng() < 0.32 ? S.lightRain : S.overcast, f, 3, 1, 1);
    return h;
  };
  let h = -I(0, 60), afterFront = false;
  while (h < N) {
    h = high(h, afterFront);
    h = rng() < greySeason(doyOf(h)) ? grey(h) : front(h);
    afterFront = true;
  }
  return { st, from, min, mul, gust, N };
}

export class Weather {
  // opts: { day, wind, scene, camera, audio, water, player, world, seed }. Attaches itself to the day cycle (which calls
  // update each frame and applies the look) and to the wind (which reads windTarget).
  constructor({ day, wind, scene, camera, audio, water, player, world, seed = 23 } = {}) {
    Object.assign(this, { day, wind, camera, audio, water, player, world, seed });
    this.precip = new Precip();
    if (scene) scene.add(this.precip.mesh);
    this.look = { ...LOOKS[0], snow: 0, flash: 0, level: 446, temp: 10, snap: true }; // snap: the look jumped (a set, a clock change): the clouds follow at once
    this.flashColor = new THREE.Color(0.75, 0.8, 1.0);
    this.windTarget = { min: 0, mul: 1, gust: 1, from: NaN };
    this.forced = null;          // { state, snow, from (look), t, blend }
    this.stateIndex = 0; this.publicIndex = 0;
    this.wetness = 0;
    this._years = new Map();
    this._lastAbs = NaN;
    this._strikeIn = 6;
    this._strikes = [];          // { t: seconds since, amp }
    this._thunder = [];          // { at: seconds to go, x, y, z, size }
    this._rainSent = -1; this._rainTimer = 0;
    this._levelTimer = 0;
    this._light = new THREE.Color();
    this._rng = mulberry32(seed * 977 + 1);
    if (day) day.weather = this;
    if (wind) wind.weather = this;
  }

  // ---- the forecast
  _year(year) {
    let y = this._years.get(year);
    if (!y) {
      y = buildYear(this.seed, year, this.day ? this.day.place : { lat: 47.94, lon: -91.46 });
      this._years.set(year, y);
      if (this._years.size > 3) this._years.delete(this._years.keys().next().value);
    }
    return y;
  }
  // the forecast's hour h of the year (h may run into the next year's first days)
  _hour(year, h) {
    let y = this._year(year);
    if (h < 0) { y = this._year(year - 1); h += daysInYear(year - 1) * 24; }
    h = Math.min(h, y.N - 1);
    return { s: y.st[h], from: y.from[h], min: y.min[h], mul: y.mul[h], gust: y.gust[h] };
  }

  // A state's look now: the fog thins and lifts as the sun climbs (gone by about 14 degrees, mid-morning in October),
  // so a fog hour after that is a clear one.
  _lookOf(s, out, elevation) {
    const L = LOOKS[s];
    if (s !== S.fog) { for (const k of FIELDS) out[k] = L[k]; return out; }
    const d = 1 - smoothstep(1, 14, elevation), C = LOOKS[0];
    for (const k of FIELDS) out[k] = C[k] + (L[k] - C[k]) * d;
    return out;
  }

  // what the forecast says for the next `hours`, from now: [{ at: 'Oct 22 14:00', state, label }], one per change
  forecast(hours = 24) {
    const d = this.day, out = [];
    let year = d.year, doy = d.doy, hour = Math.floor(d.hours), last = -1;
    for (let k = 0; k <= hours; k++) {
      const f = this._hour(year, (doy - 1) * 24 + hour);
      if (f.s !== last) {
        const { month, day } = monthDay(year, doy);
        out.push({ at: `${MONTHS[month]} ${day} ${String(hour).padStart(2, '0')}:00`, state: WEATHER_STATES[PUBLIC[f.s]], label: LABELS[f.s] });
        last = f.s;
      }
      if (++hour === 24) { hour = 0; if (++doy > daysInYear(year)) { doy = 1; year++; } }
    }
    return out;
  }

  // ---- debug and reading
  // Hold a state (one of WEATHER_STATES, or 'snow' for snow flurries); blend: seconds to cross over (0 at once).
  set(state, { blend = 0 } = {}) {
    if (state === null || state === undefined) return this.release();
    const snow = state === 'snow' || state === 'flurries';
    const name = snow ? 'light-rain' : state;
    const s = name === 'building' ? S.building : WEATHER_STATES.indexOf(name);
    if (s < 0) throw new Error(`weather: no state '${state}' (${WEATHER_STATES.join(', ')}, snow, building)`);
    this.forced = { s, snow, from: { ...this.look }, t: 0, blend };
    if (!blend) { this.wetness = LOOKS[s].rain > 0 && !snow ? 1 : this.wetness; this._lastAbs = NaN; this.look.snap = true; }
    return this.state;
  }
  release() { this.forced = null; this._lastAbs = NaN; this.look.snap = true; return this.state; }
  get state() { return WEATHER_STATES[this.publicIndex]; }
  get label() { return (this.look.snow > 0.5 && SNOW_LABELS[this.stateIndex]) || LABELS[this.stateIndex]; }
  get precipitation() { return this.look.rain < 0.02 ? null : this.look.snow > 0.5 ? 'snow' : 'rain'; }
  info() {
    const L = this.look, r = (v) => Math.round(v * 100) / 100;
    return { state: this.state, label: this.label, forced: !!this.forced, temp: r(L.temp), precipitation: this.precipitation, rain: r(L.rain), snow: r(L.snow), cover: r(L.cover), deck: r(L.deck), fog: r(L.fog), wetness: r(this.wetness), wind: this.wind ? r(this.wind.speed) : null, next: this.forecast(12).slice(1, 3) };
  }
  // lightning now (debug): dist metres off (random if not given)
  strike(dist) {
    const r = this._rng, d = dist ?? 900 + r() * 6500, a = r() * Math.PI * 2;
    const amp = 0.45 + 1.1 * (1 - smoothstep(600, 7500, d));
    this._strikes.push({ t: 0, amp, pulses: 2 + Math.floor(r() * 3), seed: r() });
    const e = this.camera ? this.camera.position : { x: 0, y: 0, z: 0 };
    this._thunder.push({ at: d / 343, x: e.x + Math.cos(a) * d, y: this.look.level + 800, z: e.z + Math.sin(a) * d, size: Math.min(1, amp) });
    return d;
  }

  // ---- the frame
  // Called by the day cycle once a frame (dt in game seconds) after it has placed the sun; returns the look it applies.
  update(dt, day) {
    const L = this.look, year = day.year, doy = day.doy, hours = day.hours, elev = day.elevation;
    const h = (doy - 1) * 24 + Math.floor(hours), frac = hours - Math.floor(hours);
    const A = this._hour(year, h), B = this._hour(year, h + 1);
    const k = smoothstep(0, 1, frac);
    const a = this._lookOf(A.s, this._la || (this._la = {}), elev), b = this._lookOf(B.s, this._lb || (this._lb = {}), elev);
    for (const f of FIELDS) L[f] = a[f] + (b[f] - a[f]) * k;
    let s = k < 0.5 ? A.s : B.s, snowForced = null;
    const near = k < 0.5 ? A : B;
    this.windTarget.from = near.from; this.windTarget.min = A.min + (B.min - A.min) * k;
    this.windTarget.mul = A.mul + (B.mul - A.mul) * k; this.windTarget.gust = A.gust + (B.gust - A.gust) * k;
    const F = this.forced;
    if (F) {
      const t = this._lookOf(F.s, this._lf || (this._lf = {}), elev);
      F.t += dt;
      const m = F.blend > 0 ? smoothstep(0, 1, F.t / F.blend) : 1;
      for (const f of FIELDS) L[f] = F.from[f] + (t[f] - F.from[f]) * m;
      s = F.s; snowForced = F.snow ? 1 : null;
      this.windTarget.from = F.s === S.storm ? 290 : F.s === S.lightRain || F.s === S.rain ? 210 : NaN;
      this.windTarget.min = L.windMin; this.windTarget.mul = L.windMul; this.windTarget.gust = L.gust;
    }
    // the fog state reads as clear once burnt off
    this.stateIndex = s === S.fog && L.fog < 0.25 ? S.clear : s;
    this.publicIndex = PUBLIC[this.stateIndex];
    // rain or snow, from the temperature
    L.temp = airTemp(this.seed, year, doy, hours, L.grey, L.rain);
    L.snow = snowForced ?? 1 - smoothstep(0.3, 1.7, L.temp);
    // the water level under the player: the base of the fog layer, the deck and the anvils
    if ((this._levelTimer -= dt) <= 0 && this.world && this.player) {
      this._levelTimer = 0.5;
      const lv = this.world.levelAt(this.player.x, this.player.z, 12);
      if (Number.isFinite(lv)) L.level = lv;
    }
    this._wet(dt, day, A, h);
    this._lightning(dt);
    this._effects(dt, day);
    return L;
  }

  // wetness: soaks in over minutes of rain, dries over hours (faster in sun and wind); after a jump of the clock it is
  // worked out again from the forecast's last twelve hours
  _wet(dt, day, A, h) {
    const L = this.look, abs = day.year * 9000 + h + (day.hours % 1);
    const dry = (sun, wind) => 0.12 + 0.6 * sun + 0.02 * wind;   // per game hour: three hours on a still night, two in sun
    if (!(Math.abs(abs - this._lastAbs) < 0.5)) L.snap = true;
    if (!this.forced && !(Math.abs(abs - this._lastAbs) < 0.5)) {
      let w = 0;
      for (let k = 12; k >= 1; k--) {
        const f = this._hour(day.year, h - k), l = LOOKS[f.s];
        w = l.rain > 0 ? 1 : Math.max(0, w - dry(l.sun * 0.5, 3));
      }
      this.wetness = A && LOOKS[A.s].rain > 0 ? 1 : w;
    }
    this._lastAbs = abs;
    const dh = dt * day.hoursPerSecond;
    const rain = L.rain * (1 - L.snow);
    if (rain > 0.02) this.wetness = Math.min(1, this.wetness + dh * 7 * rain);
    else this.wetness = Math.max(0, this.wetness - dh * dry(L.sun * Math.max(0, day.sunDir.y), this.wind ? this.wind.speed : 3) * (1 - 0.6 * L.grey));
    WEATHER.uWetness.value = this.wetness;
  }

  // lightning: strikes every few seconds in a storm, each a few bright pulses over a quarter of a second, the thunder
  // following at the speed of sound
  _lightning(dt) {
    const L = this.look;
    if (L.lightning > 0.25) {
      this._strikeIn -= dt;
      if (this._strikeIn <= 0) { this.strike(); this._strikeIn = (3 + this._rng() * 16) / L.lightning; }
    }
    let flash = 0;
    for (const s of this._strikes) {
      s.t += dt;
      for (let p = 0; p < s.pulses; p++) {
        const at = p * (0.05 + 0.04 * ((s.seed * 7.3 + p * 0.61) % 1)), x = s.t - at;
        if (x >= 0) flash += s.amp * (p === 0 ? 1 : 0.55 + 0.35 * ((s.seed * 3.1 + p) % 1)) * Math.exp(-x / 0.035);
      }
    }
    this._strikes = this._strikes.filter((s) => s.t < 0.6);
    L.flash = Math.min(2, flash);
    const audio = this.audio;
    for (const t of this._thunder) {
      t.at -= dt;
      if (t.at <= 0 && audio && audio.emit) audio.emit('thunder', { x: t.x, y: t.y, z: t.z, size: t.size });
    }
    this._thunder = this._thunder.filter((t) => t.at > 0);
  }

  // the rain round the camera, the rings on the water, the rain's sound
  _effects(dt, day) {
    const L = this.look, t = day.t || {};
    const ice = day.season ? day.season.ice : 0;
    const amount = L.rain;
    if (this.camera && this.wind) {
      const hemi = t.hemi, light = this._light;
      if (hemi) light.copy(hemi.color).multiplyScalar(0.4 * hemi.intensity + 0.08); else light.setRGB(0.5, 0.52, 0.56);
      light.lerp(_white, 0.35 * L.snow).add(_tmp.copy(this.flashColor).multiplyScalar(L.flash * 0.6));
      const d = this.wind.dir;
      this.precip.update(dt, { amount, snow: L.snow, windX: d.x, windZ: d.z, windSpeed: this.wind.speed, eye: this.camera.position, light });
    }
    const wu = this.water && this.water.uniforms;
    if (wu && wu.uRain) { wu.uRain.value = amount * (1 - L.snow) * (1 - ice); wu.uGlint.value = L.sun * L.sun; }
    const audio = this.audio, rain = Math.round(amount * (1 - L.snow) * 50) / 50;
    this.rain = rain; // 0..1, read by the soundscape's rain bed through audio.tick's context
    this._rainTimer -= dt;
    if (audio && audio.emit && (rain !== this._rainSent || this._rainTimer <= 0) && (rain > 0 || this._rainSent > 0)) {
      audio.emit('rain', { intensity: rain });
      this._rainSent = rain; this._rainTimer = 2;
    }
  }
}
const _white = new THREE.Color(1, 1, 1), _tmp = new THREE.Color();
