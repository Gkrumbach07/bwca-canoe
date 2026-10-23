import { clamp } from './rng.js';

// Energy: a meter from 0 to 1. It drains slowly with the clock, faster with the paddle (speed, hustle, a wind on
// the bow), on the portages (by the load on your back, player.loadKg, when the packs set it) and after dark; it comes
// back when you sit or stand still, faster at a campsite (restBoost) and after a meal. Meals happen on their own at
// dawn and dusk while there is food, or by hand with G when the canoe is still; a supper cooked at camp (meal('hot'))
// takes the place of the one at sunset. In Adventure (trip.js) rest refills the meter only up to a ceiling that falls
// the longer you have been awake, and only sleep fills it; with the pack empty and the meter run out the trip ends in
// an evacuation (onEvac). In Sandbox the food never runs down. With no trip at all (energy.trip null) it behaves as it
// always did: the food runs down and an empty meter calls onEvac.

const BASE = 0.00018;      // per second of the clock at its full rate: a day of doing nothing costs about a fifth of the meter
// the efforts, like the base, are per second of the clock at its full rate: while you travel in Adventure the clock
// runs at a third (trip.js), and so does what the effort costs, so a game day of travel costs the same in either mode
const PADDLE = 0.0007;     // at a cruising 2 m/s in calm air
const CARRY = 0.0004;      // walking a portage with one day of food (no load known), or with 40 kg on you
const LOAD_REF = 40;       // kg: the carry drain scales with player.loadKg / LOAD_REF
const SWIM = 0.0009;
const REST = 0.0006;       // per second of the clock at its full rate, sitting still; x restBoost at camp, x2 after a meal
const MEALS = { cold: 0.3, hot: 0.45, fish: 0.45 }; // what a meal gives back; a fish counts as hot and saves a ration
const FED_HOURS = 2;       // game hours a meal keeps the recovery doubled
const SLOT_HOURS = 3;      // a meal had this recently takes the place of the next one at dawn or dusk
const WARN_AT = 0.15;
const DARK_ELEV = -6;      // degrees: past civil dusk, travel costs NIGHT times as much
const NIGHT = 1.3;
// Adventure: the most that rest brings the meter back to, by hours awake (1 for the first couple of hours, about
// 0.6 by evening, a quarter after a day and a night); only sleep resets it
export const restCeiling = (awake) => clamp(1.05 - awake / 30, 0.15, 1);

export class Energy {
  constructor(player, day) {
    this.player = player; this.day = day;
    this.value = 1; this.food = 0; this.fedUntil = -1;
    this.lastHours = day.hours; this.warned = false; this.warnTimer = 0;
    this.onEvac = null; this.onNote = null;
    this.trip = null;       // the trip's rules (trip.js), set by the trip
    this.exertion = 0;      // what the paddle cost this frame, for the HUD
    this.awakeSince = this.now;
    this.lastMealAbs = -1e9; this.lastMealKind = null; this.lastMealAuto = false;
    this.tired = 0;         // the tiredness notes given since the last sleep
    this._boost = 1; this.boostSet = false;
  }
  get now() { return this.day.doy * 24 + this.day.hours; }
  // hours since the last sleep (across a new year too)
  get awake() { let a = this.now - this.awakeSince; if (a < -1000) a += 365 * 24; return Math.max(0, a); }
  get adventure() { const t = this.trip; return !!(t && t.adventure && t.active); }
  get sandbox() { const t = this.trip; return !!(t && t.sandbox); }
  get hasFood() { return this.sandbox || this.food >= 0.5; }
  // what rest can bring the meter back to now
  get ceiling() { return this.adventure ? restCeiling(this.awake) : 1; }
  get warning() { return !this.hasFood && this.value < WARN_AT; }
  get still() { const p = this.player; return (p.mode === 'paddle' || p.mode === 'carry' || p.mode === 'walk') && !p.landing && Math.abs(p.speed) < 0.25; }
  // the rest multiplier: the camp sets it (3 at a site, 4 by a lit fire); until anything does, a campsite nearby gives 3
  get restBoost() { return this._boost; }
  set restBoost(v) { this._boost = Number.isFinite(v) ? Math.max(0, v) : 1; this.boostSet = true; }

  note(t) { if (this.onNote) this.onNote(t); }
  reset() { this.value = 1; this.food = 0; this.fedUntil = -1; this.warned = false; this.awakeSince = this.now; this.lastMealAbs = -1e9; this.tired = 0; }

  // A meal: 'cold' (a ration), 'hot' (cooked at camp) or 'fish' (cooked, and no ration spent). It counts as the
  // meal of the hour: had within SLOT_HOURS of the next dawn or dusk it takes that one's place, and a cooked one just
  // after a cold one had on the clock makes that one hot instead of being a second. False when the pack is empty.
  meal(kind = 'cold', when = null) {
    const gain = MEALS[kind] ?? MEALS.cold, ration = kind !== 'fish', now = this.now;
    const recent = now >= this.lastMealAbs && now - this.lastMealAbs < SLOT_HOURS;
    if (recent && this.lastMealAuto && this.lastMealKind === 'cold' && gain > MEALS.cold) {
      this.value = Math.min(1, this.value + gain - MEALS.cold);
      if (!ration && !this.sandbox) this.food += 0.5; // the fish was the meal: the ration goes back in the pack
      this.lastMealKind = kind; this.lastMealAuto = false; this.fedUntil = now + FED_HOURS;
      if (when) this.note(`${when}: ${this.foodLeft()}.`);
      return true;
    }
    if (ration && !this.hasFood) return false;
    if (ration && !this.sandbox) this.food = Math.max(0, this.food - 0.5);
    this.value = Math.min(1, this.value + gain);
    this.fedUntil = now + FED_HOURS; this.lastMealAbs = now; this.lastMealKind = kind; this.lastMealAuto = false;
    if (when) this.note(`${when}${this.player.mode === 'carry' ? ' on the trail' : this.atCamp ? ' at the campsite' : this.player.mode === 'walk' ? '' : ' in the canoe'}: ${this.foodLeft()}.`);
    return true;
  }
  foodLeft() {
    if (this.sandbox) return 'the pack keeps';
    return this.food <= 0 ? 'the pack is empty' : `${this.food % 1 ? `${Math.floor(this.food) || ''}½` : this.food} day${this.food <= 1 ? '' : 's'} of food left`;
  }
  // the old call: a cold meal
  eat(when = null) { return this.meal('cold', when || 'You eat'); }
  // the meal of a dawn or a dusk, unless one was had just before
  autoMeal(when) {
    const now = this.now;
    if (now >= this.lastMealAbs && now - this.lastMealAbs < SLOT_HOURS) return;
    if (this.meal('cold', when)) this.lastMealAuto = true;
  }
  // G: a meal by hand, when you are still
  manualEat() {
    if (!this.still) { this.note('Hold still to eat.'); return; }
    if (!this.meal('cold', 'You eat')) this.note(this.adventure ? 'The food pack is empty.' : 'The food pack is empty. Any outfitter will fill it.');
  }
  // a night's sleep (camp.js): the meter back to at least q, and the awake clock starts again
  sleep(q = 1) {
    this.value = Math.max(this.value, clamp(q, 0, 1));
    this.awakeSince = this.now; this.tired = 0; this.warned = false; this.warnTimer = 0;
  }
  // an effort paid at once (a capsize, a walk back fetched)
  spend(amount) { this.value = clamp(this.value - amount, 0, 1); }

  update(dt, wind = null, atCamp = false) {
    const p = this.player, day = this.day, rate = day.rate ?? 1;
    this.atCamp = atCamp;
    // meals at sunrise and sunset, if there is food
    const { rise, set } = day.sunriseSunset, h = day.hours, prev = this.lastHours;
    const crossed = (t) => t != null && (prev <= h ? prev < t && h >= t : t > prev || t <= h);
    if (crossed(rise)) this.autoMeal('Breakfast'); else if (crossed(set)) this.autoMeal('Supper');
    this.lastHours = h;
    // the drain: the clock's share at the clock's own rate, the effort's per second of effort
    let travel = 0, recover = 0;
    const moving = Math.abs(p.speed) > 0.1;
    if (p.mode === 'paddle' && !p.landing && !p.teleporting) {
      const v = Math.abs(p.speed), power = p.canoe.state.power;
      if (power > 0.1 && v > 0.1) {
        let head = 0;
        if (wind) { const f = p.forward, wd = wind.dir; head = Math.max(0, -(f.x * wd.x + f.z * wd.z)) * wind.speed / 6; }
        const effort = Math.pow(v / 2, 1.5) * (p.input.held('ShiftLeft', 'ShiftRight') ? 1.25 : 1);
        travel = PADDLE * effort * (1 + 0.8 * head) * power;
      } else if (v < 0.3) recover = REST;
    } else if (p.mode === 'carry' || p.mode === 'walk') {
      const kg = p.loadKg || 0;
      if (moving) {
        if (kg > 0) travel = CARRY * (kg / LOAD_REF);
        else if (p.mode === 'carry') travel = CARRY * (p.loadFactor || 1);
      } else recover = REST;
    } else if (p.mode === 'swim') travel = SWIM;
    if (travel && day.elevation < DARK_ELEV) travel *= NIGHT; // after dark, by headlamp
    if (recover) {
      recover *= rate * (this.boostSet ? this._boost : atCamp ? 3 : 1);
      if (this.now < this.fedUntil) recover *= 2;
      if (this.warning) recover = 0; // an empty pack: rest no longer brings it back
    }
    const drain = (BASE + travel) * rate; // per second of the clock: in Adventure a day's travel costs what a day's travel always did
    this.exertion = travel;
    let v = this.value - drain * dt;
    if (recover) { const cap = this.ceiling; if (v < cap) v = Math.min(cap, v + recover * dt); }
    this.value = clamp(v, 0, 1);
    if (this.value <= 0) {
      if (this.hasFood) this.meal('cold', 'You stop and eat');
      else if (this.onEvac) this.onEvac('food');
    }
    // a gentle word when the pack is empty and the meter low, not more than once a while
    this.warnTimer -= dt;
    if (this.warning && this.warnTimer <= 0) {
      this.warnTimer = 90;
      this.note(this.adventure ? 'No food and not much left in you. Make for a landing, or sit a while.' : 'No food and not much left in you. Any outfitter will set you up again, or sit a while.');
    }
    // Adventure: a word when the day has gone on too long
    if (this.adventure) {
      const a = this.awake;
      if (a > 18 && this.tired < 1) { this.tired = 1; this.note('Up since yesterday. Resting only goes so far now: you need a night’s sleep.'); }
      if (a > 30 && this.tired < 2) { this.tired = 2; this.note('Thirty hours on your feet. Sleep soon, or someone will come out for you.'); }
    }
  }

  serialize() { return { value: this.value, food: this.food, fedUntil: this.fedUntil, awakeSince: this.awakeSince, lastMealAbs: this.lastMealAbs, lastMealKind: this.lastMealKind }; }
  restore(d) {
    this.value = clamp(d.value ?? 1, 0, 1); this.food = Math.max(0, d.food ?? 0); this.fedUntil = d.fedUntil ?? -1;
    this.awakeSince = Number.isFinite(d.awakeSince) ? d.awakeSince : this.now;
    this.lastMealAbs = Number.isFinite(d.lastMealAbs) ? d.lastMealAbs : -1e9; this.lastMealKind = d.lastMealKind || null;
    this.tired = this.awake > 30 ? 2 : this.awake > 18 ? 1 : 0;
    this.lastHours = this.day.hours; // the saved clock is back: no dawn or dusk crossed by the reload, no meal
  }
}
