import * as THREE from 'three';
import { mulberry32, noise2, smoothstep, clamp } from './rng.js';

// The day's wind. Each morning rolls a character for the day (a dead-calm day, a breezy one, a blow), the
// breeze builds through the afternoon and eases at dusk, gusts ride on top, and the direction veers slowly.
// Speed is in metres per second at the water; direction is the compass bearing the wind blows FROM.
// The weather (weather.js, when it is attached as wind.weather) bends all of it through its windTarget: a floor under
// the speed (a front's steady blow, a storm's), a gain on the day's breeze (a calm foggy dawn), bigger and quicker
// gusts (a storm's, the gusty north-west wind behind a front), and a bearing the wind is steered toward (backing to
// the south-east ahead of a front, the north-west behind it). The debug override still wins.
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const POINTS_LONG = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const FRESH = 8;        // m/s: a fresh breeze (Beaufort 5) and up is when the wind matters

// The sway: the wind as everything that bends in it reads it (the trees and the understory in vegetation.js, the
// grass in groundcover.js, the reeds, the rice and the pads in aquatic.js), shared uniforms that Wind.updateSway
// sets once a frame. The gusts are a field over the world (swayGustAt) drifting downwind with the wind, so a gust
// rolls across a stand and the trees under it bend together, and a tile seam shows nothing. The drift is integrated
// here, never direction times time, so a veering wind cannot shake it. The sway clock wraps at SWAY_PERIOD and every
// sway frequency is rounded to whole cycles of it (swayOmega), so the wrap never shows and the shader never sees a
// large time.
export const SWAY_PERIOD = 600;          // seconds
const GUST_CELL = 64;                    // metres: the gust field's lattice
const GUST_WRAP = 1024 * GUST_CELL;      // the field repeats every 1024 cells, so the drift wraps there
export const SWAY = {
  // xy: the unit direction the wind blows toward (world x, z); z: the load, the wind's pressure against 12 m/s
  // (1 there, 0.03 at 2 m/s, steeper past 11 m/s, capped at 2.6: updateSway); w: the speed (m/s)
  uSwayWind: { value: new THREE.Vector4(0, 1, 0, 0) },
  // xy: how far the gust field has drifted (world metres, wrapped); z: the sway clock (s, wrapped); w: the gusts'
  // strength now, 1 on average (the day's gust signal)
  uSwayGust: { value: new THREE.Vector4(0, 0, 0, 1) },
};
export const glslSway = /* glsl */ `
  uniform vec4 uSwayWind, uSwayGust;
  float swayHash(vec2 c) {
    uvec2 q = uvec2(mod(c, 1024.0)) * uvec2(1597334677u, 3812015801u);
    uint n = (q.x ^ (q.y >> 3u)) * 1597334677u;
    n ^= n >> 15u;
    n *= 2246822519u;
    return float(n >> 8u) * (1.0 / 16777216.0);
  }
  float swayNoise(vec2 p) {
    vec2 i = floor(p), f = p - i, u = f * f * (3.0 - 2.0 * f);
    return mix(mix(swayHash(i), swayHash(i + vec2(1.0, 0.0)), u.x), mix(swayHash(i + vec2(0.0, 1.0)), swayHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // the gust field at world xz: 0 in a lull, 1 under a gust (whole-number octave so it wraps with the drift)
  float swayGustAt(vec2 pw) {
    vec2 q = (pw - uSwayGust.xy) * ${(1 / GUST_CELL).toFixed(6)};
    return smoothstep(0.3, 0.72, swayNoise(q) * 0.7 + swayNoise(q * 3.0 + vec2(5.2, 1.3)) * 0.3);
  }
  // the angular frequency nearest hz cycles a second that makes whole cycles of the wrapped clock
  float swayOmega(float hz) { return floor(hz * ${SWAY_PERIOD.toFixed(1)} + 0.5) * ${((2 * Math.PI) / SWAY_PERIOD).toFixed(9)}; }
  // a displacement in the instance's frame (tile axes, metres) taken back into the object's, for an instance
  // matrix that is a rotation times a scale (the vegetation's and the lake plants' are)
  vec3 swayToObject(mat3 M, vec3 d) { return (transpose(M) * d) / vec3(dot(M[0], M[0]), dot(M[1], M[1]), dot(M[2], M[2])); }
`;

export class Wind {
  constructor(seed = 11) {
    this.rng = mulberry32(seed);
    this.speed = 2.5;          // m/s, smoothed
    this.from = 300;           // degrees, compass bearing the wind comes from
    this.day = 0.8;            // today's character: 0.2 (glassy) .. 1.8 (a blow)
    this.override = null;      // debug: fixed speed
    this.t = 0;
    this.lastHours = -1;
    this.gust = 0;
    this.gustPhase = 0;        // the quick gusts' phase, integrated so a change of pace never jumps it
    this.sway = { x: 0, z: 0, t: 0 }; // the gust field's drift and the sway clock (see SWAY)
    this.weather = null;       // weather.js attaches itself here; its windTarget bends the day's wind
  }

  // unit vector the wind blows TOWARD, in world xz (x east, z south)
  get dir() { const a = ((this.from + 180) * Math.PI) / 180; return { x: Math.sin(a), z: -Math.cos(a) }; }
  get point() { return Math.round(this.from / 45) % 8; }
  get compass() { return POINTS[this.point]; }
  get compassLong() { return POINTS_LONG[this.point]; }
  // the Beaufort name for the speed
  get label() { const s = this.speed; return s < 0.5 ? 'Calm' : s < 1.6 ? 'Light air' : s < 3.4 ? 'Light breeze' : s < 5.5 ? 'Gentle breeze' : s < 8 ? 'Moderate breeze' : s < 10.8 ? 'Fresh breeze' : s < 13.9 ? 'Strong breeze' : 'Near gale'; }
  get fresh() { return this.speed >= FRESH; }

  rollDay() { this.day = 0.2 + Math.pow(this.rng(), 1.4) * 1.6; this.from = (this.from + (this.rng() - 0.5) * 160 + 360) % 360; }

  update(dt, hours) {
    this.t += dt;
    if (this.lastHours >= 0 && hours < this.lastHours - 12) this.rollDay(); // the clock wrapped past midnight
    const dh = this.lastHours >= 0 ? Math.max(0, ((hours - this.lastHours + 36) % 24) - 12) : 0; // game hours this frame
    this.lastHours = hours;
    // the diurnal shape: still at dawn, building late morning, strongest mid-afternoon, dying at dusk
    const diurnal = 0.25 + 0.75 * smoothstep(8.5, 14.5, hours) * (1 - smoothstep(16.5, 21, hours));
    const wx = this.weather ? this.weather.windTarget : null;
    // under a weather the day's own character is held to a breeze at most: the blows come from the weather's floor
    let base = 1.2 + 7.5 * (wx ? Math.min(this.day, 1.1) : this.day) * diurnal;
    if (wx) base = Math.max(wx.min, base * wx.mul);
    const g = wx ? wx.gust : 1, stormy = smoothstep(1.2, 2.2, g);
    // a storm's gusts come quicker too (the second octave's phase runs faster), and its lulls never drop it below half
    this.gustPhase += dt * (0.6 + 0.5 * stormy);
    this.gust = ((noise2(this.t * 0.07, 3.1, 5) - 0.5) * 0.5 + (noise2(this.gustPhase, 7.7, 8) - 0.5) * 0.25) * g;
    if (this.gust < -0.45) this.gust = -0.45;
    const target = this.override ?? Math.min(22, Math.max(0, base * (1 + this.gust)));
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * (0.4 + 0.8 * stormy)));
    this.from = (this.from + (noise2(this.t * 0.01, 1.5, 13) - 0.5) * 6 * dt + 360) % 360;
    // the weather's bearing: turn toward it the short way round, at up to 40 degrees a game hour (or a degree a
    // second, whichever is more: a jump of the clock or a debug set comes round in a minute)
    if (wx && Number.isFinite(wx.from) && this.override === null) {
      const d = ((wx.from - this.from + 540) % 360) - 180;
      this.from = (this.from + Math.sign(d) * Math.min(Math.abs(d), Math.max(dt, 40 * dh)) + 360) % 360;
    }
  }

  // Hands the wind to everything that sways (SWAY): its direction, speed and gusts, the gust field carried
  // downwind (a little slower than the wind itself) and the sway clock moved on by dt. Once a frame, after update.
  updateSway(dt) {
    const d = this.dir, v = this.speed, s = this.sway;
    s.x = (s.x + d.x * v * 0.8 * dt) % GUST_WRAP;
    s.z = (s.z + d.z * v * 0.8 * dt) % GUST_WRAP;
    s.t = (s.t + dt) % SWAY_PERIOD;
    // the load: the wind's pressure against 12 m/s, and past a strong breeze steeper still, so a near gale leans the trees
    // and tosses the crowns (14 m/s 1.6, 16 m/s 2.5, capped at 2.6: the grass's lean is the load times 0.4 under a gust,
    // and past about 1.4 its tips would go under the ground, groundcover.js)
    const load = Math.min(2.6, (v / 12) * (v / 12) * (1 + 0.6 * smoothstep(11, 18, v)));
    SWAY.uSwayWind.value.set(d.x, d.z, load, v);
    SWAY.uSwayGust.value.set(s.x, s.z, s.t, clamp(1 + 1.6 * this.gust, 0.4, 1.6));
  }

  // debug nudges from the keyboard
  nudgeSpeed(d) { this.override = clamp((this.override ?? this.speed) + d, 0, 16); }
  nudgeDirection(d) { this.from = (this.from + d + 360) % 360; }
  release() { this.override = null; }
}
