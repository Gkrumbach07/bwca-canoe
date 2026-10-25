import { clamp, smoothstep } from './rng.js';
import { monthDay } from './astro.js';
import { LIFE } from './pace.js';
import { itemDef } from './items.js';
// an item's food family for the readout: 'meal' (raw, to cook), 'snack', 'forage', 'hot' (cooked: camp 2's hot:* and
// fried:*), or its own kind
const FOOD_KIND = (id) => { const d = itemDef(id); return !d ? '' : d.kind === 'food' && d.cooked ? 'hot' : d.kind; };
// the meals, snacks and hot meals in some containers, and their words ("a hot meal, 3 meals and 1 snack", or '')
function poolWords(pool) {
  let meals = 0, snacks = 0, hot = 0;
  for (const c of pool) for (const e of c.grid) {
    if (e.box) continue;
    const k = FOOD_KIND(e.id);
    if (k === 'meal') meals += e.qty; else if (k === 'snack' || k === 'forage') snacks += e.qty; else if (k === 'hot') hot += e.qty;
  }
  const n = (x, one) => `${x === 1 ? (one === 'hot meal' ? 'a' : '1') : x} ${one}${x === 1 ? '' : 's'}`;
  const parts = [hot ? n(hot, 'hot meal') : '', meals ? n(meals, 'meal') : '', snacks ? n(snacks, 'snack') : ''].filter(Boolean);
  return { meals, snacks, hot, words: parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || '' };
}

// Energy: one bar from 0 to 1, and in Adventure three needs that pull it down (rest, food, water), the way Wild n
// Chill's single bar works. The bar drains slowly with the clock, faster with the paddle (speed, hustle, a wind on the
// bow), on the portages (by the load on your back, player.loadKg, when the packs set it) and after dark; it comes back
// when you sit or stand still, faster at a campsite (restBoost) and after a meal.
// Food is items (the owner's feedback of 2026-10-24, stream A: items.js, inventory.js). A meal (oatmeal, rice and
// lentils, a freeze-dried supper) or a kept fish is only eaten cooked: camp 2's cook.js puts it on the grate of a burning
// fire with water from the bottle (useWater) for a short wait, and what comes off (items.js hot:*, fried:*) is eaten at
// the fire or kept a few hours as leftovers (eatItem; onEat lets cook.js sit you down to it); a snack or a berry is eaten
// from the inventory, standing still, on foot or in the canoe (inventory.eat → eatItem). There is no G and, on a trip, no
// meal on its own at dawn or dusk: hunger asks you to eat. energy.food is the days of food with you (the meals in reach,
// two a day); writing it places or takes meals. meal(kind) is the old whole meal at once (no trip, Sandbox's tests).
//
// The needs (Adventure, while a trip is under way; each 0 to 1):
// - rest: what the last night gave (the tent's quality × min(1, hours slept / 7)), falling the longer you are awake;
//   only sleep brings it back.
// - food: falls from full to empty over 24 game hours awake (a third as fast asleep). A cold meal gives +0.5, a hot one
//   or a fish +0.6. (The plan said 16 h: a June day is 16 h from the dawn meal to the dusk one, so two meals a day left
//   every June evening hungry and each day starting lower; at 24 h two meals keep you fed in any month, and an empty
//   pack still has you hungry by the next afternoon.)
// - water: a 2 L bottle drunk on its own: a litre lasts 6 game hours, 4 when paddling hard or carrying a heavy load,
//   or on a July or August afternoon. The need only falls once the bottle is dry (8 h to empty, 5⅓ h hard), and a
//   parched need takes up to 1⅓ L to drink back. On foot at the shore E fills it (camp.js), with tablets drinkable
//   after half an hour; at any outfitter's counter you drink at the tap and the bottle is filled, free and at once.
// - warmth (fb2 F, the owner's second 2026-10-24 round: a gentle fourth need, Wild n Chill's cold): it falls when the air
//   you feel is colder than COMFORT (13 °C): the air (weather.js temp), less the wind afloat (half of it ashore), the rain
//   on you, and 3 °C more after dark; twice and a half as fast wet through (rain on you, a swim; wet gear a little), a
//   little more than half as fast while you paddle or walk; and fast in the water (a swim, a capsize: by the water's
//   temperature, with a gasp of it on going in). It comes back by a fire (within 6 m, by its heat), inside a store, in
//   warm air (slowly), and with a night in the tent and the bag (sleep: all of it dry, less in wet gear, less with no
//   bag in reach). Tuned by the season: a July day and night barely touch it (a capsize in July water costs about a
//   tenth); an October evening away from the fire takes a tenth to a quarter of it, wet through half of it, and an
//   October capsize half of it in a minute or two of swimming.
// How they pull the bar (fb2 F, Wild n Chill's bar): each need takes a chunk off the bar's top end, W × (1 − need)
// (W: rest 1, food 0.4, water 0.4, warmth 0.35), and the bar recovers only up to the ceiling, 1 − the chunks. (It was
// min(rest, 0.4 + 0.6 × food, 0.4 + 0.6 × water): only the lowest need counted, so the bar could not show each need's
// share. Rest keeps its whole weight, so a day's tiredness costs what the pace tuned; the others count a little less
// each, and now together.) A bar standing above the ceiling is pulled down to it (0.06 a game hour); a need below 0.3
// drains it 1.5 times as fast; a need at 0 stops its recovery. energy.chunks() gives the HUD each need's chunk in the
// bar's order (cold, sleep, hunger, thirst from left to right), and whether it is growing (dashed on the bar): growing
// faster than its everyday rate, or growing while the need is low. An empty bar ends an Adventure, as the owner put it ("if it goes all the way down,
// you're done"): an hour of the clock at 0 to stop and eat, drink or rest, then an evacuation (onEvac) named for the
// need that ran you down. In Sandbox the needs stay full, the food keeps and nothing is forced; with no trip at all (energy.trip
// null) it behaves as it always did: the food runs down and an empty bar calls onEvac.
// Balance (the pace, 2026-10-23; docs/trip-core.md): every rate is per game hour. A July day of 23 km and four portages
// (6.5 game hours of travel at Trip pace) took the bar from 0.85 after a night in the A-frame to about 0.4 by the end of
// the paddle, and a first day from 1.0 to 0.55; the camp's rest then brings it up to what the rest need allows by supper
// (about 0.55 to 0.6). A long day of 10 hours or more runs it near empty.
//
// The contract (streams A and C read these):
//   energy.value, energy.needs { rest, food, water, warmth }, energy.ceiling, energy.low ('tired' | 'hungry' | 'thirsty'
//   | 'cold' | null), energy.chunks() ([{ key, size, growing, need }]: fb2 F), energy.heldBy ("held down by thirst",
//   "held down by tiredness and cold", or ''), energy.soaked (0–1, wet through), energy.bottle (litres, 0–2), energy.drinkable, energy.treating,
//   energy.fill(litres, waitHours) (→ litres added; waitHours 0: drinkable now, as at a counter), energy.bottleWords(),
//   energy.meal(kind), energy.sleep(q, hours) (after the clock has jumped; without hours: a night in a bunk, with
//   breakfast and a full bottle), energy.bunk(), energy.fresh() (a trip put in), energy.rescued() (an evacuation's
//   food and water), energy.spend(x), energy.restBoost, energy.food (days of rations), energy.awake, energy.onEvac,
//   energy.atCounter, and the meal clock energy.lastHours, energy.lastMealAbs, energy.lastMealKind. energy.needs is
//   live: energy.needs.food = 1 feeds you, energy.needs.water = 1 waters you, energy.needs.warmth = 1 warms you.
//   For warmth main.js sets energy.fires (fire.js: fires.near, the lit fire nearest the eye) and energy.indoors (() =>
//   inside a store); it reads the weather from day.weather, the wind from update's, wet gear from trip.state.wet.

// Every rate is per game hour, paid on the hours the clock passes (day.hoursPerTick: the pace's time-lapse, pace.js), so
// what a stretch of travel costs follows the game hours it takes, whichever the pace and the game speed.
// Balance (the pace, 2026-10-23): a day of travel is now 6 to 8 game hours for 20 to 25 km (it was 12 to 14 for 4 or 5),
// so an hour of it costs about twice what it did, and a day of it still ends tired: 0.4 to 0.5 by the end of the paddle
// from the 0.85 an A-frame gives, the camp's rest bringing it back up to what the rest need allows by supper.
export const BASE_H = 0.009;   // a game hour of doing nothing: a day of it costs about a fifth of the bar
const PADDLE_H = 0.045;    // a game hour at a cruise in calm air
const CRUISE = LIFE.cruise; // m/s at life: what W holds in calm air (player.js); hustling past it costs more, drifting less
export const CARRY_H = 0.055; // a game hour walking a portage with 40 kg on you (or one day of food, no load known)
const LOAD_REF = 40;       // kg: the carry drain scales with player.loadKg / LOAD_REF
const SWIM_H = 0.045;
const REST_H = 0.03;       // a game hour sitting still; x restBoost at camp, x2 after a meal
const MEALS = { cold: 0.3, hot: 0.45, fish: 0.45 }; // what a meal gives the bar back (up to the ceiling); a fish counts as hot and saves a ration
const FEED = { cold: 0.5, hot: 0.6, fish: 0.6 };    // and what it gives the food need
const FED_HOURS = 2;       // game hours a meal keeps the recovery doubled
const SLOT_HOURS = 3;      // a meal had this recently takes the place of the next one at dawn or dusk
const WARN_AT = 0.15;
const DARK_ELEV = -6;      // degrees: past civil dusk, travel costs NIGHT times as much
const NIGHT = 1.3;
// the needs
const LOW = 0.3;           // a need under this drains the bar LOW_DRAIN times as fast, and shows its mark
const LOW_DRAIN = 1.5;
const PULL_H = 0.06;       // a game hour: a bar above the ceiling is pulled down to it
const EMPTY = 0.005;       // a need this low stops the bar's recovery
const SPENT_GRACE = 1;     // game hours at an empty bar before someone comes out for you (Adventure)
const NEARLY = 0.08;      // a word, once, as the bar nears empty
const FOOD_HOURS = 24;     // game hours awake from a full food need to an empty one
const ASLEEP = 1 / 3;      // the needs fall at this rate asleep (and across any jump of the clock longer than JUMP)
const JUMP = 2;            // game hours: a longer jump of the clock is a night, not a stretch of the day
export const BOTTLE = 2;   // litres
const USE = 1 / 6, USE_HARD = 1 / 4; // litres a game hour: a litre lasts 6 h, 4 h paddling hard, carrying heavy or on a hot afternoon
const BODY = 4 / 3;        // litres from an empty water need to a full one: with the bottle dry the need lasts 8 h (5⅓ h hard)
const SIP = 2;             // the water need drunk back up at most this much a game hour
const NIGHT_HOURS = 7;     // a night this long gives the tent's whole quality
const WAKE_WINDOW = 0.1;   // game hours after waking in which the bar rises to the ceiling (needs set just after a sleep count)
export const TABLETS = 0.5; // game hours before water treated with a tablet is drinkable
const HARD_EFFORT = 1.15;  // paddle effort (1 at a calm cruise) from which it counts as hard
const HEAVY_KG = 30;       // a carry at least this heavy counts as hard
// the rest need, by hours awake, before the night's quality scales it: whole for the first couple of hours, about half
// by a long day's end (16 h), a third after 20 h, empty after 31½ h; only sleep resets it
export const restCeiling = (awake) => clamp(1.05 - awake / 30, 0, 1);
const NEED_WORD = { rest: 'tired', food: 'hungry', water: 'thirsty', warmth: 'cold' };
const HELD_WORD = { rest: 'tiredness', food: 'hunger', water: 'thirst', warmth: 'cold' };
// fb2 F: the chunks, in the bar's order from its green end to its right end (Wild n Chill's: cold, sleep, hunger, thirst)
export const NEED_KEYS = ['warmth', 'rest', 'food', 'water'];
export const CHUNK_W = { warmth: 0.35, rest: 1, food: 0.4, water: 0.4 }; // what each need, run out, takes off the ceiling
// a chunk is growing (dashed) when it grows faster than this a game hour (each a little over its everyday rate: the rest
// need's 0.028 awake after an A-frame night, the food's 0.017; the water's 0.05 once the bottle is dry, the cold's
// whenever you are losing warmth at all), or at all while its need is under LOW
const GROW_H = { warmth: 0.012, rest: 0.045, food: 0.03, water: 0.03 };
const GROW_EASE = 1.5;     // real seconds: how fast the chunks' rates follow (the dashes come and go without flicker)
// warmth (fb2 F)
const COMFORT = 12;        // °C felt: dressed for the trip, air at least this warm costs no warmth
const CHILL_SPAN = 10;     // °C under COMFORT for a chill of 1
const CHILL_H = 0.12;      // warmth a game hour at a chill of 1, standing about, dry
const WET_CHILL = 2.5;     // wet through: the chill this many times
const GEAR_WET = 0.4;      // wet gear (trip.state.wet: no dry layer to put on) counts as this much wet through
const MOVING_CHILL = 0.55; // paddling or walking makes its own heat
const DARK_C = 2;          // °C colder felt after dark (civil dusk)
const WIND_C = 0.6;        // °C felt colder per m/s of wind over WIND_FROM, afloat (half ashore, among the trees)
const WIND_FROM = 2, WIND_MAX_C = 6;
const RAIN_C = 2;          // °C colder felt in full rain
const WATER_COMFORT = 20;  // °C: water warmer than this costs no warmth to swim in
const WATER_SPAN = 14;     // °C under WATER_COMFORT for a water chill of 1
const SWIM_COLD_H = 3;     // warmth a game hour in the water at a water chill of 1 (an October lake is 1.15)
const GASP = 0.1;          // warmth at once going in, at a water chill of 1
const SOAK_H = 1.5;        // wet through a game hour in full rain
const DRY_H = 0.25, DRY_SUN_H = 0.4, DRY_FIRE_H = 2; // dried a game hour: in the air, more in sun, by a fire
const FIRE_H = 0.8;        // warmth back a game hour by a fire at full heat (the coals half of it)
const FIRE_NEAR = 3, FIRE_FAR = 6; // metres: the whole of a fire's warmth within the first, none past the second
const INDOOR_H = 1.2;      // warmth back a game hour inside a store
const WARM_H = 0.15;       // warmth back a game hour in air 8 °C over COMFORT (a quarter of it just over; half wet)
const NIGHT_BAG = 1, NIGHT_WET = 0.8, NIGHT_NO_BAG = 0.6; // warmth after a night in the tent: the bag, damp gear, no bag in reach

export class Energy {
  constructor(player, day) {
    this.player = player; this.day = day;
    this.inventory = null;  // inventory.js, once main.js attaches it: then the food is its meals
    this._food = 0;
    this.value = 1; this.food = 0; this.fedUntil = -1;
    this.lastHours = day.hours; this.warned = false; this.warnTimer = 0;
    this.onEvac = null; this.onNote = null; this.onEat = null; // onEat(eat, name): camp 2's cook.js
    this.trip = null;       // the trip's rules (trip.js), set by the trip
    this.exertion = 0;      // what the paddle cost this frame, for the HUD
    this.awakeSince = this.now;
    this.lastMealAbs = -1e9; this.lastMealKind = null; this.lastMealAuto = false;
    this._boost = 1; this.boostSet = false;
    // the needs: rest0 is what the last night gave, the rest need falls from it with the hours awake
    this.rest0 = 1; this.need = { food: 1, water: 1, warmth: 1 };
    // fb2 F: warmth's world (main.js): the fires (fire.js fires.near) and whether you are inside a store; wet through
    this.fires = null; this.indoors = null; this.soaked = 0; this.wasIn = false;
    this.grow = { warmth: 0, rest: 0, food: 0, water: 0 }; this.lastChunks = null; // the chunks' rates, a game hour
    this.chill = 0;          // what the cold costs now, warmth a game hour (0 when it is coming back), for the readout
    this.drinkable = BOTTLE; this.treating = 0; this.readyAt = -1e9; // the bottle: litres drinkable, litres under a tablet, when they will be
    this.lastNow = this.now; this.hard = false;
    this.wokeAt = -1e9;     // when the last sleep ended: for a few minutes after, the bar comes up to whatever the needs allow
    this.noted = { rest: false, food: false, water: false, warmth: false, dry: false, spent: false };
    this.atCounter = null;  // () => true at an outfitter's counter, where the bottle is filled free (main.js)
    // energy.needs: read 0 to 1 (all 1 in Sandbox and between trips); written through, so energy.needs.food = 1 feeds you
    // and energy.needs.rest = x sets the night's rest so that the need is x now
    const self = this;
    this._needs = Object.defineProperties({}, {
      rest: { enumerable: true, get() { return self.live ? self.restNeed : 1; }, set(v) { const c = restCeiling(self.awake); self.rest0 = clamp(c > 0.01 ? (+v || 0) / c : +v || 0, 0, 1); } },
      food: { enumerable: true, get() { return self.live ? self.need.food : 1; }, set(v) { self.need.food = clamp(+v || 0, 0, 1); } },
      water: { enumerable: true, get() { return self.live ? self.need.water : 1; }, set(v) { self.need.water = clamp(+v || 0, 0, 1); } },
      warmth: { enumerable: true, get() { return self.live ? self.need.warmth : 1; }, set(v) { self.need.warmth = clamp(+v || 0, 0, 1); } },
    });
  }
  get now() { return this.day.doy * 24 + this.day.hours; }
  // hours since the last sleep (across a new year too)
  get awake() { let a = this.now - this.awakeSince; if (a < -1000) a += 365 * 24; return Math.max(0, a); }
  get adventure() { const t = this.trip; return !!(t && t.adventure && t.active); }
  get sandbox() { const t = this.trip; return !!(t && t.sandbox); }
  get live() { return this.adventure; } // the needs fall only on an Adventure under way
  get hasFood() { return this.sandbox || this.food >= 0.5; }
  // days of food with you: the meals in reach (and set out at your camp), two a day; without the inventory a number
  get inv() { const i = this.inventory; return i && i.attached ? i : null; }
  get food() { const i = this.inv; return i ? i.meals() / 2 : this._food; }
  set food(v) { const i = this.inv; v = Math.max(0, Number(v) || 0); if (i) i.setMeals(v * 2); else this._food = v; }
  // what there is to eat with you, in words ("5 meals and 2 snacks", "a hot supper and 3 meals"), for the readout. camp 2:
  // at your camp it is the camp's reach (stream 1's inventory.campReach: the barrel by the tent, the pot on the grate),
  // so the readout by the fire does not say "no food" while the barrel at the tent has berries in it
  foodWords() {
    const i = this.inv;
    if (!i) return this._food > 0 ? `${this._food} day${this._food === 1 ? '' : 's'} of food` : 'no food';
    let pool;
    try { pool = typeof i.campReach === 'function' ? i.campReach() : i.foodPool(); } catch { pool = null; }
    if (!pool) return i.foodWords();
    return poolWords(pool).words || 'no food';
  }
  // camp join: the food in the barrels hung at your camp (inventory.hungAtCamp), counted apart from what is to hand:
  // { days (two meals a day), words ("3 meals and 1 snack hung in the barrel", or '') }. The HUD's food mark and the
  // readout count it, so a barrel hung for the night does not read as "No food".
  hungFood() {
    const i = this.inv;
    if (!i || typeof i.hungAtCamp !== 'function') return { days: 0, words: '' };
    const hung = i.hungAtCamp();
    if (!hung.length) return { days: 0, words: '' };
    const w = poolWords(hung);
    return { days: (w.meals + w.hot) / 2, words: w.words ? `${w.words} hung in the ${hung.length > 1 ? 'barrels' : 'barrel'}` : '' };
  }
  // a ration out of the pack for a meal on the grate (supper in the evening): false when there is none
  useRation(kind) {
    const i = this.inv;
    if (!i) { this._food = Math.max(0, this._food - 0.5); return true; }
    const set = this.day.sunriseSunset && this.day.sunriseSunset.set, evening = set != null && this.day.hours > 14;
    return !!i.takeMeal(evening);
  }
  // a ration back in the pack (a fish was the meal after all)
  returnRation() {
    const i = this.inv;
    if (!i) { this._food += 0.5; return; }
    i.place('meal:supper', 1, { crate: i.atStash });
  }
  // the four needs, 0 to 1 (full in Sandbox and between trips)
  get needs() { return this._needs; }
  // the need that ran the bar down, for the evacuation's words: 'awake' (rest), 'food', 'water' or 'cold' (warmth: the
  // trip's words for it fall back to "spent" until trip.js has its own)
  spentWhy() {
    const k = this.biggest();
    return k === 'rest' ? 'awake' : k === 'warmth' ? 'cold' : k;
  }
  get restNeed() { return clamp(this.rest0 * restCeiling(this.awake), 0, 1); }
  // fb2 F: what a need takes off the bar's top end now (0 when it is full, its weight when it has run out)
  chunkOf(key) { return this.live ? CHUNK_W[key] * (1 - clamp(this.needs[key], 0, 1)) : 0; }
  // the need with the biggest chunk
  biggest() { let k = 'rest'; for (const key of NEED_KEYS) if (this.chunkOf(key) > this.chunkOf(k)) k = key; return k; }
  // what rest can bring the bar back to now: the bar less every need's chunk
  get ceiling() {
    if (!this.live) return 1;
    let c = 1; for (const key of NEED_KEYS) c -= this.chunkOf(key);
    return clamp(c, 0, 1);
  }
  // fb2 F: the chunks for the HUD, in the bar's order (cold, sleep, hunger, thirst): { key, size (of the bar, together
  // never more than 1), growing (dashed: growing faster than its everyday rate, or at all while its need is low), need }
  chunks() {
    const out = []; let sum = 0;
    for (const key of NEED_KEYS) { const size = this.chunkOf(key); sum += size; out.push({ key, size, need: this.live ? this.needs[key] : 1, growing: false }); }
    const k = sum > 1 ? 1 / sum : 1;
    for (const c of out) { c.size *= k; const g = this.grow[c.key] || 0; c.growing = this.live && c.size > 0.004 && (g > GROW_H[c.key] || (g > 0.002 && c.need < LOW)); }
    return out;
  }
  // the lowest need, when it is under LOW: its key ('rest' | 'food' | 'water' | 'warmth') and its word
  get lowKey() {
    if (!this.live) return null;
    const n = this.needs; let k = null;
    for (const key of ['rest', 'food', 'water', 'warmth']) if (n[key] < LOW && (!k || n[key] < n[k])) k = key;
    return k;
  }
  get low() { const k = this.lowKey; return k ? NEED_WORD[k] : null; }
  // the needs that hold the bar down, in words for the readout ('' when nothing does): the low one, or the biggest
  // chunk, and a second chunk that is big too ("held down by tiredness and cold")
  get heldBy() {
    if (!this.live) return '';
    const by = NEED_KEYS.map((key) => ({ key, c: this.chunkOf(key) })).sort((a, b) => b.c - a.c);
    let k = this.lowKey;
    if (!k) {
      k = by[0].key;
      if (by[0].c <= 0.03) return '';
      if (k === 'rest' && this.awake < 4 && !(by[1].c >= 0.08)) return 'held down by last night'; // the tent's quality, or the hours slept
    }
    const second = by.find((b) => b.key !== k && b.c >= 0.08);
    return `held down by ${HELD_WORD[k]}${second ? ` and ${HELD_WORD[second.key]}` : ''}`;
  }
  get bottle() { return this.drinkable + this.treating; }
  // a hot afternoon: July and August, noon to six, under the sun (not under cloud, fog or rain: weather.js)
  get hot() {
    const { month } = monthDay(this.day.year, this.day.doy), h = this.day.hours, w = this.day.weather;
    return (month === 6 || month === 7) && h >= 12 && h < 18 && !(w && /overcast|fog|rain|storm/.test(w.state || ''));
  }
  get warning() { return !this.hasFood && this.value < WARN_AT; }
  get still() { const p = this.player; return (p.mode === 'paddle' || p.mode === 'carry' || p.mode === 'walk') && !p.landing && Math.abs(p.speed) < 0.25; }
  // the rest multiplier: the camp sets it (3 at a site, 4 by a lit fire); until anything does, a campsite nearby gives 3
  get restBoost() { return this._boost; }
  set restBoost(v) { this._boost = Number.isFinite(v) ? Math.max(0, v) : 1; this.boostSet = true; }

  note(t) { if (this.onNote) this.onNote(t); }
  reset() { this.value = 1; this.food = 0; this.fedUntil = -1; this.warned = false; this.awakeSince = this.now; this.lastMealAbs = -1e9; this.fresh(); }
  // the needs full and the bottle filled (a trip put in, a new season)
  fresh() {
    this.rest0 = 1; this.need.food = 1; this.need.water = 1; this.need.warmth = 1; this.soaked = 0;
    this.drinkable = BOTTLE; this.treating = 0; this.readyAt = -1e9;
    this.lastNow = this.now; this.unnote(); this.lastChunks = null;
  }
  unnote() { for (const k in this.noted) this.noted[k] = false; }
  // fetched in by an evacuation: whoever came out brought hot food and water, and a blanket (main.js, on the trip's 'evac')
  rescued() { this.need.food = 1; this.need.water = 1; this.need.warmth = 1; this.soaked = 0; this.fill(BOTTLE, 0); this.unnote(); this.lastChunks = null; }

  // --- the bottle ----------------------------------------------------------------------------------------------
  // Fill it: up to `litres` more, to the 2 L it holds. waitHours: how long the water takes to be drinkable (tablets
  // half an hour); 0 for water that is drinkable now (an outfitter's tap), which also clears what was being treated.
  // Returns the litres added.
  fill(litres = BOTTLE, waitHours = TABLETS) {
    const add = Math.min(Math.max(0, litres), BOTTLE - this.bottle);
    if (waitHours > 0) {
      if (add <= 0.001) return 0;
      this.treating += add; this.readyAt = this.now + waitHours;
    } else {
      this.drinkable = Math.min(BOTTLE, this.drinkable + this.treating + Math.max(0, add));
      this.treating = 0;
    }
    this.noted.dry = false;
    return Math.max(0, add);
  }
  // camp 2: water out of the bottle for the pot (cook.js: a dehydrated meal wants its water; boiled, lake water is safe, so
  // what is still under a tablet goes first). Returns whether there was enough (none is taken when there was not).
  useWater(litres) {
    const l = Math.max(0, Number(litres) || 0);
    if (this.bottle < l - 0.001) return false;
    const a = Math.min(this.treating, l);
    this.treating -= a; this.drinkable = Math.max(0, this.drinkable - (l - a));
    if (this.treating <= 0.001) this.treating = 0;
    return true;
  }
  // "1.4 L in the bottle", "2 L in the bottle, drinkable in 20 min", "the bottle is dry"
  bottleWords() {
    const l = (x) => `${x >= 1.95 ? '2' : x.toFixed(1)} L`;
    if (this.bottle <= 0.02) return 'the bottle is dry';
    if (this.treating > 0.001) {
      const min = Math.max(1, Math.ceil(((this.readyAt - this.now) * 60) / 5) * 5);
      return `${l(this.bottle)} in the bottle${this.drinkable > 0.05 ? ` (${l(this.treating)} drinkable in ${min} min)` : `, drinkable in ${min} min`}`;
    }
    return `${l(this.drinkable)} in the bottle`;
  }

  // --- meals ---------------------------------------------------------------------------------------------------
  // A meal: 'cold' (a ration), 'hot' (cooked at camp) or 'fish' (cooked, and no ration spent). It counts as the
  // meal of the hour: had within SLOT_HOURS of the next dawn or dusk it takes that one's place, and a cooked one just
  // after a cold one had on the clock makes that one hot instead of being a second. False when the pack is empty.
  meal(kind = 'cold', when = null) {
    const gain = MEALS[kind] ?? MEALS.cold, feed = FEED[kind] ?? FEED.cold, ration = kind !== 'fish', now = this.now;
    const recent = now >= this.lastMealAbs && now - this.lastMealAbs < SLOT_HOURS;
    if (recent && this.lastMealAuto && this.lastMealKind === 'cold' && gain > MEALS.cold) {
      this.feed(feed - FEED.cold); this.lift(gain - MEALS.cold);
      if (!ration && !this.sandbox) this.returnRation(); // the fish was the meal: the ration goes back in the pack
      this.lastMealKind = kind; this.lastMealAuto = false; this.fedUntil = now + FED_HOURS;
      if (when) this.note(`${when}: ${this.foodLeft()}.`);
      return true;
    }
    if (ration && !this.hasFood) return false;
    if (ration && !this.sandbox && !this.useRation(kind)) return false;
    this.feed(feed); this.lift(gain);
    this.fedUntil = now + FED_HOURS; this.lastMealAbs = now; this.lastMealKind = kind; this.lastMealAuto = false;
    if (when) this.note(`${when}${this.player.mode === 'carry' ? ' on the trail' : this.atCamp ? ' at the campsite' : this.player.mode === 'walk' ? '' : ' in the canoe'}: ${this.foodLeft()}.`);
    return true;
  }
  feed(x) { this.need.food = clamp(this.need.food + x, 0, 1); }
  // Eat a thing from the inventory (inventory.eat): eat is the item's { food, lift, hot } (items.js). A snack feeds a
  // little and lifts the bar a little; a cooked meal counts as the meal of the hour.
  eatItem(eat = {}, name = '') {
    const food = Number.isFinite(eat.food) ? eat.food : 0.2, gain = Number.isFinite(eat.lift) ? eat.lift : food * 0.5, now = this.now;
    this.feed(food); this.lift(gain);
    this.fedUntil = Math.max(this.fedUntil, now + (eat.hot ? FED_HOURS : FED_HOURS / 2));
    if (eat.hot || food >= 0.45) { this.lastMealAbs = now; this.lastMealKind = eat.hot ? 'hot' : 'cold'; this.lastMealAuto = false; }
    if (name) this.lastEaten = { name, at: now };
    if (this.onEat) { try { this.onEat(eat, name); } catch (e) { console.warn('energy.onEat', e); } } // camp 2: a hot meal near the bench is eaten sitting (cook.js)
    return true;
  }
  // the bar up by x, but not past the ceiling (unless it already stood above it)
  lift(x) { const cap = Math.max(this.value, this.ceiling); this.value = Math.min(cap, this.value + x); }
  foodLeft() {
    if (this.sandbox) return 'the pack keeps';
    if (this.inv) { const w = this.inv.foodWords(); return w === 'no food' ? 'no food left with you' : `${w} left`; }
    return this.food <= 0 ? 'the pack is empty' : `${this.food % 1 ? `${Math.floor(this.food) || ''}½` : this.food} day${this.food <= 1 ? '' : 's'} of food left`;
  }
  // the old call: a cold meal
  eat(when = null) { return this.meal('cold', when || 'You eat'); }
  // the meal of a dawn or a dusk, unless one was had just before: only with no trip at all (the old free paddle); on a
  // trip hunger asks you to eat (the owner, 2026-10-24: no automatic meals)
  autoMeal(when) {
    if (this.trip) return;
    const now = this.now;
    if (now >= this.lastMealAbs && now - this.lastMealAbs < SLOT_HOURS) return;
    if (this.meal('cold', when)) this.lastMealAuto = true;
  }
  // the old G (gone from the keys): on a trip, a word about where the food is eaten now
  manualEat() {
    if (this.trip) { this.note('Eat from the inventory (J): a snack when you are still, a meal cooked on the grate at a fire.'); return; }
    if (!this.still) { this.note('Hold still to eat.'); return; }
    if (!this.meal('cold', 'You eat')) this.note(this.adventure ? 'The food pack is empty.' : 'The food pack is empty. Any outfitter will fill it.');
  }

  // --- sleep -----------------------------------------------------------------------------------------------------
  // A night's sleep (camp.js, after the clock has jumped to the morning): q is the tent's quality (0–1) and hours the
  // hours slept. The rest need starts the day at q × min(1, hours / 7), the needs have fallen over the night at a third
  // of their waking rate, and the bar is back up to the ceiling. Without hours it is a night in a bunk at an outfitter
  // (an evacuation, or the end of a trip): a full night, then breakfast and a full bottle.
  sleep(q = 1, hours = null) {
    const bunk = !Number.isFinite(hours);
    q = clamp(q, 0, 1);
    if (this.live) this.passNeeds(Math.max(0, this.now - this.lastNow), true, false);
    this.lastNow = this.now;
    this.rest0 = q * Math.min(1, (bunk ? NIGHT_HOURS : hours) / NIGHT_HOURS);
    if (bunk) { this.need.food = 1; this.need.water = 1; this.fill(BOTTLE, 0); }
    // fb2 F: a night in the bag warms you through (a bunk, or the tent with the bag in the camp's reach), less in damp
    // gear, and the clothes are dry by morning; never colder than you went in
    const wet = !bunk && !!(this.trip && this.trip.state && this.trip.state.wet);
    this.need.warmth = Math.max(this.need.warmth, bunk ? 1 : !this.bagInReach() ? NIGHT_NO_BAG : wet ? NIGHT_WET : NIGHT_BAG);
    this.soaked = 0; this.lastChunks = null;
    this.awakeSince = this.now; this.warned = false; this.warnTimer = 0;
    this.unnote();
    this.value = Math.max(this.value, this.live ? this.ceiling : q);
    this.wokeAt = this.now;
  }
  bunk() { this.sleep(1); }
  // an effort paid at once (a capsize, a walk back fetched)
  spend(amount) { this.value = clamp(this.value - amount, 0, 1); }

  // the needs over dh game hours: the food falls, the bottle is drunk (and the water need falls once it is dry),
  // tablets finish their work. asleep: at a third of the rate, and no drinking until you wake.
  passNeeds(dh, asleep = false, hard = false) {
    if (this.treating > 0 && this.now >= this.readyAt) { this.drinkable = Math.min(BOTTLE, this.drinkable + this.treating); this.treating = 0; }
    if (!(dh > 0)) return;
    const k = asleep ? ASLEEP : 1;
    this.need.food = Math.max(0, this.need.food - (k * dh) / FOOD_HOURS);
    const use = (hard ? USE_HARD : USE) * k * dh;
    this.need.water = Math.max(0, this.need.water - use / BODY);
    if (this.need.water < 1 && this.drinkable > 0) {
      const g = Math.min(1 - this.need.water, asleep ? Infinity : SIP * dh, this.drinkable / BODY);
      this.need.water += g; this.drinkable = Math.max(0, this.drinkable - g * BODY);
    }
  }
  // --- warmth (fb2 F) --------------------------------------------------------------------------------------------
  // the air you feel, °C: the weather's (or, with none, the season's mean and the day's swing), less the wind (afloat;
  // half of it ashore), the rain on you and the dark
  feltTemp(wind) {
    const d = this.day, L = d.weather && d.weather.look, p = this.player;
    let t = L && Number.isFinite(L.temp) ? L.temp : 2.5 - 16.5 * Math.cos((2 * Math.PI * (d.doy - 25)) / 365.25) + 5.5 * Math.sin((2 * Math.PI * (d.hours - 9)) / 24);
    const ws = wind && Number.isFinite(wind.speed) ? wind.speed : 0, afloat = p.mode === 'paddle' || p.mode === 'swim';
    t -= Math.min(WIND_MAX_C, Math.max(0, ws - WIND_FROM) * WIND_C) * (afloat ? 1 : 0.5);
    t -= RAIN_C * this.rainOn();
    if (d.elevation < DARK_ELEV) t -= DARK_C;
    return t;
  }
  // the rain falling on you, 0–1 (snow wets you half as much; none indoors)
  rainOn() { const L = this.day.weather && this.day.weather.look; return !L || this.inside() ? 0 : clamp((L.rain || 0) * (1 - 0.5 * (L.snow || 0)), 0, 1); }
  // inside a store (main.js energy.indoors), or at its counter
  inside() { try { return !!(this.indoors && this.indoors()) || !!(this.atCounter && this.atCounter()); } catch { return false; } }
  // a fire's warmth where you stand, 0–1: by its heat (the coals half), the whole of it within FIRE_NEAR, none past FIRE_FAR
  fireHere() {
    const f = this.fires && this.fires.near, p = this.player;
    if (!f) return 0;
    const heat = Math.max(f.heat || 0, 0.5 * (f.embers || 0));
    return heat <= 0.05 ? 0 : heat * (1 - smoothstep(FIRE_NEAR, FIRE_FAR, Math.hypot(f.x - p.x, f.z - p.z)));
  }
  // the sleeping bag in the camp's reach (true when you own none at all: a save from before it)
  bagInReach() {
    const i = this.inv;
    if (!i) return true;
    try {
      if (typeof i.has === 'function' && !i.has('sleepingbag')) return true;
      const pool = typeof i.campReach === 'function' ? i.campReach() : i.reachable();
      return pool.some((c) => c.grid.some((e) => !e.box && e.id === 'sleepingbag'));
    } catch { return true; }
  }
  // warmth over dh game hours, and how wet through you are; moving: paddling or walking under way
  passWarmth(dh, wind, moving) {
    const p = this.player, n = this.need, S = this.day.season || {}, swim = p.mode === 'swim';
    const wchill = clamp((WATER_COMFORT - (Number.isFinite(S.waterTemp) ? S.waterTemp : 15)) / WATER_SPAN, 0, 1.4);
    if (swim && !this.wasIn) n.warmth = Math.max(0, n.warmth - GASP * wchill); // the gasp, going in
    this.wasIn = swim;
    if (swim) this.soaked = 1;
    if (!(dh > 0)) return;
    const inside = this.inside(), fire = inside ? 0 : this.fireHere(), rain = this.rainOn();
    if (!swim) { // the rain soaks you; the air dries you, the sun more, a fire most
      const L = this.day.weather && this.day.weather.look, sun = Math.max(0, this.day.sunDir ? this.day.sunDir.y : 0) * (1 - ((L && L.grey) || 0));
      if (rain > 0.02) this.soaked = Math.min(1, this.soaked + SOAK_H * rain * dh);
      else this.soaked = Math.max(0, this.soaked - (DRY_H + DRY_SUN_H * Math.min(1, sun * 2) + DRY_FIRE_H * fire + (inside ? 1 : 0)) * dh);
    }
    let loss = 0, gain = 0;
    if (swim) loss = SWIM_COLD_H * wchill;
    else if (inside) gain = INDOOR_H;
    else {
      const t = this.feltTemp(wind), wet = Math.max(this.soaked, this.trip && this.trip.state && this.trip.state.wet ? GEAR_WET : 0);
      if (t < COMFORT) loss = CHILL_H * ((COMFORT - t) / CHILL_SPAN) * (1 + (WET_CHILL - 1) * wet) * (moving ? MOVING_CHILL : 1) * (1 - fire);
      else gain = WARM_H * clamp((t - COMFORT) / 8, 0.25, 1) * (1 - 0.5 * wet);
      gain += FIRE_H * fire;
    }
    this.chill = Math.max(0, loss - gain);
    n.warmth = clamp(n.warmth + (gain - loss) * dh, 0, 1);
  }
  // how fast each chunk grows, a game hour, eased over GROW_EASE seconds (a jump of the clock, a night, starts afresh)
  trackChunks(dt, dh) {
    const c = {}; for (const k of NEED_KEYS) c[k] = this.chunkOf(k);
    const prev = this.lastChunks; this.lastChunks = c;
    if (!prev || dh > JUMP) { for (const k of NEED_KEYS) this.grow[k] = 0; return; }
    if (!(dh > 0) || !(dt > 0)) return;
    const a = 1 - Math.exp(-dt / GROW_EASE);
    for (const k of NEED_KEYS) this.grow[k] += (clamp((c[k] - prev[k]) / dh, -2, 2) - this.grow[k]) * a;
  }

  // a word, once, when the bottle runs dry or a need runs low (again once it has come back)
  needNotes() {
    const n = this.needs, o = this.noted;
    if (this.bottle <= 0.001 && !o.dry) { o.dry = true; this.note('The bottle is dry. Fill it at the shore: on foot, E at the water’s edge.'); }
    for (const k of ['water', 'food', 'rest', 'warmth']) {
      if (n[k] > LOW + 0.1) { o[k] = false; continue; }
      if (n[k] >= LOW || o[k]) continue;
      o[k] = true;
      if (k === 'water') this.note(this.bottle > 0.001 ? 'Thirsty. The bottle is treating; half an hour.' : 'Thirsty, and the bottle is dry. Fill it at the shore.');
      else if (k === 'food') this.note(this.inv ? (this.inv.snacks() ? 'Hungry. A snack from the pack (J, when you are still), or cook a meal at a fire.' : this.hasFood ? 'Hungry. Cook a meal on the grate at a fire.' : 'Hungry, and no food with you.') : this.hasFood ? 'Hungry. Cook a meal on the grate at a fire.' : 'Hungry, and the food pack is empty.');
      else if (k === 'warmth') this.note(this.soaked > 0.3 ? 'Cold, and wet through. Get to a fire, or into the tent and the bag.' : 'Cold. A fire would warm you, or the tent and the bag.');
      else this.note('Tired. Only a night’s sleep brings it back now: a campsite, or an outfitter’s bunk.');
    }
    if (n.rest <= EMPTY && !o.spent) { o.spent = true; this.note('Done in. Nothing brings you back now but a night’s sleep.'); }
    else if (n.rest > LOW) o.spent = false;
  }

  update(dt, wind = null, atCamp = false) {
    const p = this.player, day = this.day, now = this.now;
    const gh = dt * (day.hoursPerTick ?? day.hoursPerSecond * (day.rate ?? 1)); // the game hours this frame: what every rate is paid on
    this.atCamp = atCamp;
    // meals at sunrise and sunset, if there is food
    const { rise, set } = day.sunriseSunset, h = day.hours, prev = this.lastHours;
    const crossed = (t) => t != null && (prev <= h ? prev < t && h >= t : t > prev || t <= h);
    if (crossed(rise)) this.autoMeal('Breakfast'); else if (crossed(set)) this.autoMeal('Supper');
    this.lastHours = h;
    // an outfitter's counter: a drink at the tap, and the bottle filled, free and drinkable at once
    if (this.atCounter && this.atCounter()) {
      if (this.bottle < BOTTLE - 0.001 || this.treating > 0) this.fill(BOTTLE, 0);
      if (this.live) this.need.water = 1;
    }
    // the drain: the clock's share at the clock's own rate, the effort's per second of effort
    let travel = 0, recover = 0, hard = false;
    const moving = Math.abs(p.speed) > 0.1;
    if (p.mode === 'paddle' && !p.landing && !p.teleporting) {
      const v = Math.abs(p.speed), power = p.canoe.state.power;
      if (power > 0.1 && v > 0.1) {
        let head = 0;
        if (wind) { const f = p.forward, wd = wind.dir; head = Math.max(0, -(f.x * wd.x + f.z * wd.z)) * wind.speed / 6; }
        const g = p.gear, effort = Math.pow(v / (CRUISE * (g ? g.cruise : 1)), 1.5) * (p.input.held('ShiftLeft', 'ShiftRight') ? 1.25 : 1) * (1 + 0.8 * head) * (g ? g.effort : 1); // hubs 2B: a better paddle
        travel = PADDLE_H * effort * power;
        hard = effort * power >= HARD_EFFORT;
      } else if (v < 0.3) recover = REST_H;
    } else if (p.mode === 'carry' || p.mode === 'walk') {
      const kg = p.loadKg || 0;
      if (moving) {
        if (kg > 0) travel = CARRY_H * (kg / LOAD_REF) * (p.mode === 'carry' && p.gear ? p.gear.carry : 1); // hubs 2B: yoke pads under the canoe
        else if (p.mode === 'carry') travel = CARRY_H * (p.loadFactor || 1);
        hard = kg >= HEAVY_KG;
      } else recover = REST_H;
    } else if (p.mode === 'swim') { travel = SWIM_H; hard = true; }
    if (travel && day.elevation < DARK_ELEV) travel *= NIGHT; // after dark, by headlamp
    this.hard = hard;
    // the needs, over the game hours since the last frame (a jump of the clock longer than JUMP counts as a night)
    let dh = now - this.lastNow; this.lastNow = now;
    if (!(dh > 0) || dh > 24 * 3) dh = 0; // the clock set back (Sandbox), or a reload's leap
    if (this.live) {
      const jump = dh > JUMP;
      this.passNeeds(dh, jump, !jump && (hard || this.hot));
      this.passWarmth(jump ? 0 : dh, wind, moving && (p.mode === 'paddle' || p.mode === 'walk' || p.mode === 'carry')); // fb2 F
      this.needNotes();
    } else if (dh > 0) this.passNeeds(0); // tablets still finish between trips
    this.trackChunks(dt, dh); // fb2 F: the bar's chunks, growing or not
    const n = this.needs, lowest = Math.min(n.rest, n.food, n.water, n.warmth);
    // just woken: the bar is up to what the needs allow (a bunk night's breakfast, written just after sleep(), counts)
    if (this.live && now >= this.wokeAt && now - this.wokeAt < WAKE_WINDOW) this.value = Math.max(this.value, this.ceiling);
    if (recover) {
      recover *= this.boostSet ? this._boost : atCamp ? 3 : 1;
      if (this.now < this.fedUntil) recover *= 2;
      if (this.live ? lowest <= EMPTY : this.warning) recover = 0; // a need run out (or, outside a trip, an empty pack): rest no longer brings it back
    }
    let drain = BASE_H + travel; // a game hour: a day's travel costs what its hours cost, at any pace
    if (lowest < LOW) drain *= LOW_DRAIN;
    this.exertion = travel;
    let v = this.value - drain * gh;
    const cap = this.ceiling;
    if (recover && v < cap) v = Math.min(cap, v + recover * gh);
    else if (this.live && v > cap) v = Math.max(cap, v - PULL_H * gh); // the needs pull it down to what they allow
    this.value = clamp(v, 0, 1);
    if (this.live) {
      // The owner's rule: "if it goes all the way down, you're done". Spent, you have an hour of the clock to stop and
      // put it right (eat, drink, rest, or sleep at a site); still at 0 after it, someone comes out for you, for
      // whichever need ran you down. Nearly spent, a word first.
      if (this.value <= 0) {
        if (this.spentAt == null) { this.spentAt = now; this.note('Spent. Stop now: eat, drink or rest, or someone will come out for you.'); }
        else if (now - this.spentAt >= SPENT_GRACE && this.onEvac) { this.spentAt = null; this.onEvac(this.spentWhy()); }
      } else {
        if (this.spentAt != null && this.value > 0.02) this.spentAt = null;
        if (this.value < NEARLY && !this.noted.nearly) { this.noted.nearly = true; this.note('Nearly spent. Rest, eat or drink soon, or make for a site.'); }
        else if (this.value > NEARLY + 0.15) this.noted.nearly = false;
      }
    } else if (this.value <= 0) {
      if (this.hasFood) this.meal('cold', 'You stop and eat');
      else if (this.onEvac) this.onEvac('food');
    }
    // a gentle word when the pack is empty and the bar low: once, and again only after a while (once a game day on an
    // Adventure, where the bar can sit at 0 for as long as the bottle has water)
    this.warnTimer -= gh;
    if (!this.warning) this.warnTimer = Math.min(this.warnTimer, 0);
    else if (this.warnTimer <= 0) {
      this.warnTimer = this.live ? 24 : 1.8; // game hours: a day on an Adventure
      this.note(this.adventure ? 'No food and not much left in you. Make for an outfitter, or sit a while.' : 'No food and not much left in you. Any outfitter will set you up again, or sit a while.');
    }
  }

  serialize() {
    return {
      value: this.value, food: this.food, fedUntil: this.fedUntil, awakeSince: this.awakeSince, lastMealAbs: this.lastMealAbs, lastMealKind: this.lastMealKind, lastMealAuto: this.lastMealAuto,
      rest0: this.rest0, need: { ...this.need }, drinkable: this.drinkable, treating: this.treating, readyIn: this.treating > 0 ? Math.max(0, this.readyAt - this.now) : 0,
      soaked: this.soaked, // fb2 F (need.warmth rides in need)
    };
  }
  restore(d) {
    this.value = clamp(d.value ?? 1, 0, 1); this._food = Math.max(0, d.food ?? 0); this.fedUntil = d.fedUntil ?? -1; // with the inventory the food is its meals: the saved days are only the old count
    this.awakeSince = Number.isFinite(d.awakeSince) ? d.awakeSince : this.now;
    this.lastMealAbs = Number.isFinite(d.lastMealAbs) ? d.lastMealAbs : -1e9; this.lastMealKind = d.lastMealKind || null;
    this.lastMealAuto = !!d.lastMealAuto; // a cold meal at dawn or dusk that a cooked one may still take the place of
    // the needs (a save from before them comes back with them full)
    const num = (x, dflt) => (Number.isFinite(x) ? x : dflt);
    this.rest0 = clamp(num(d.rest0, 1), 0, 1);
    this.need = { food: clamp(num(d.need && d.need.food, 1), 0, 1), water: clamp(num(d.need && d.need.water, 1), 0, 1), warmth: clamp(num(d.need && d.need.warmth, 1), 0, 1) };
    this.soaked = clamp(num(d.soaked, 0), 0, 1); this.wasIn = this.player.mode === 'swim'; this.lastChunks = null; // fb2 F
    this.drinkable = clamp(num(d.drinkable, BOTTLE), 0, BOTTLE); this.treating = clamp(num(d.treating, 0), 0, BOTTLE - this.drinkable);
    this.readyAt = this.now + num(d.readyIn, 0);
    this.unnote(); const n = this.needs; for (const k of ['rest', 'food', 'water', 'warmth']) this.noted[k] = n[k] < LOW; this.noted.dry = this.bottle <= 0.001;
    this.lastHours = this.day.hours; // the saved clock is back: no dawn or dusk crossed by the reload, no meal
    this.lastNow = this.now;         // and no hours of need passed
  }
}
