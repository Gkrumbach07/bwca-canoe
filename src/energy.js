import { clamp } from './rng.js';

// Energy: a meter from 0 to 1. It drains slowly with the clock, faster with the paddle (speed, hustle, a wind on
// the bow), and on the portages (more with a heavy pack); it comes back when you sit still, faster at a
// campsite and after a meal. Meals happen on their own at dawn and dusk while there is food, or by hand with
// F when the canoe is still. With the pack empty and the meter low the outfitter sends a boat: a short fade
// and you are back at the nearest landing with a fresh pack. Nothing else is lost.

const BASE = 0.00018;      // per second: a day of doing nothing costs about a fifth of the meter
const PADDLE = 0.0007;     // per second at a cruising 2 m/s in calm air
const CARRY = 0.0004;      // per second walking a portage with one day of food
const SWIM = 0.0009;
const REST = 0.0006;       // per second sitting still; x3 at a campsite, x2 after a meal; nothing once you are starving
const MEAL = 0.3;          // what a meal gives back
const FED_HOURS = 2;       // game hours a meal keeps the recovery doubled
const WARN_AT = 0.15;

export class Energy {
  constructor(player, day) {
    this.player = player; this.day = day;
    this.value = 1; this.food = 0; this.fedUntil = -1;
    this.lastHours = day.hours; this.warned = false; this.warnTimer = 0;
    this.onEvac = null; this.onNote = null;
    this.exertion = 0;      // what the paddle cost this frame, for the HUD
  }
  get now() { return this.day.doy * 24 + this.day.hours; }
  get warning() { return this.food < 0.5 && this.value < WARN_AT; }
  get still() { const p = this.player; return (p.mode === 'paddle' || p.mode === 'carry') && !p.landing && Math.abs(p.speed) < 0.25; }

  note(t) { if (this.onNote) this.onNote(t); }
  reset() { this.value = 1; this.food = 0; this.fedUntil = -1; this.warned = false; }

  eat(when = null) {
    if (this.food < 0.5) return false;
    this.food = Math.max(0, this.food - 0.5);
    this.value = Math.min(1, this.value + MEAL);
    this.fedUntil = this.now + FED_HOURS;
    const left = this.food <= 0 ? 'the pack is empty' : `${this.food % 1 ? `${Math.floor(this.food)}½` : this.food} day${this.food === 1 ? '' : 's'} of food left`;
    this.note(`${when || 'You eat'}${this.player.mode === 'carry' ? ' on the trail' : this.atCamp ? ' at the campsite' : ' in the canoe'}: ${left}.`);
    return true;
  }
  // F: a meal by hand, when the canoe is still
  manualEat() {
    if (!this.still) { this.note('Hold still to eat.'); return; }
    if (!this.eat()) this.note('The food pack is empty. Any outfitter will fill it.');
  }

  update(dt, wind = null, atCamp = false) {
    const p = this.player;
    this.atCamp = atCamp;
    // meals at sunrise and sunset, if there is food
    const { rise, set } = this.day.sunriseSunset, h = this.day.hours, prev = this.lastHours;
    const crossed = (t) => t != null && (prev <= h ? prev < t && h >= t : t > prev || t <= h);
    if (crossed(rise)) this.eat('Breakfast'); else if (crossed(set)) this.eat('Supper');
    this.lastHours = h;
    // the drain
    let drain = BASE, recover = 0;
    if (p.mode === 'paddle' && !p.landing && !p.teleporting) {
      const v = Math.abs(p.speed), power = p.canoe.state.power;
      if (power > 0.1 && v > 0.1) {
        let head = 0;
        if (wind) { const f = p.forward, wd = wind.dir; head = Math.max(0, -(f.x * wd.x + f.z * wd.z)) * wind.speed / 6; }
        const effort = Math.pow(v / 2, 1.5) * (p.input.held('ShiftLeft', 'ShiftRight') ? 1.25 : 1);
        drain += PADDLE * effort * (1 + 0.8 * head) * power;
      } else if (v < 0.3) recover = REST;
    } else if (p.mode === 'carry') {
      if (Math.abs(p.speed) > 0.1) drain += CARRY * (p.loadFactor || 1) * (p.carry && p.carry.drop ? 0.5 : 1);
      else recover = REST;
    } else if (p.mode === 'swim') drain += SWIM;
    if (recover) { if (atCamp) recover *= 3; if (this.now < this.fedUntil) recover *= 2; if (this.warning) recover = 0; } // an empty pack: rest no longer brings it back
    this.exertion = drain - BASE;
    this.value = clamp(this.value - drain * dt + recover * dt, 0, 1);
    if (this.value <= 0) {
      if (this.food >= 0.5) this.eat('You stop and eat');
      else if (this.onEvac) this.onEvac();
    }
    // a gentle word when the pack is empty and the meter low, not more than once a while
    this.warnTimer -= dt;
    if (this.warning && this.warnTimer <= 0) { this.warnTimer = 90; this.note('No food and not much left in you. Any outfitter will set you up again, or sit a while.'); }
  }

  serialize() { return { value: this.value, food: this.food, fedUntil: this.fedUntil }; }
  restore(d) { this.value = clamp(d.value ?? 1, 0, 1); this.food = Math.max(0, d.food ?? 0); this.fedUntil = d.fedUntil ?? -1; }
}
