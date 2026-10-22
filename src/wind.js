import { mulberry32, noise2, smoothstep, clamp } from './rng.js';

// The day's wind. Each morning rolls a character for the day (a dead-calm day, a breezy one, a blow), the
// breeze builds through the afternoon and eases at dusk, gusts ride on top, and the direction veers slowly.
// Speed is in metres per second at the water; direction is the compass bearing the wind blows FROM.
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const POINTS_LONG = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const FRESH = 8;        // m/s: a fresh breeze (Beaufort 5) and up is when the wind matters

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
    this.lastHours = hours;
    // the diurnal shape: still at dawn, building late morning, strongest mid-afternoon, dying at dusk
    const diurnal = 0.25 + 0.75 * smoothstep(8.5, 14.5, hours) * (1 - smoothstep(16.5, 21, hours));
    const base = 1.2 + 7.5 * this.day * diurnal;
    this.gust = (noise2(this.t * 0.07, 3.1, 5) - 0.5) * 0.5 + (noise2(this.t * 0.6, 7.7, 8) - 0.5) * 0.25;
    const target = this.override ?? Math.max(0, base * (1 + this.gust));
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 0.4));
    this.from = (this.from + (noise2(this.t * 0.01, 1.5, 13) - 0.5) * 6 * dt + 360) % 360;
  }

  // debug nudges from the keyboard
  nudgeSpeed(d) { this.override = clamp((this.override ?? this.speed) + d, 0, 16); }
  nudgeDirection(d) { this.from = (this.from + d + 360) % 360; }
  release() { this.override = null; }
}
