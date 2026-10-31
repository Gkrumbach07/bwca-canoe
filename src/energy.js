import { clamp, smoothstep } from './rng.js';
import { monthDay } from './astro.js';
import { LIFE } from './pace.js';
import { itemDef, NEED, check, timerWords, isBag } from './items.js';
import { dayMean, daySwing } from './weather.js'; // d1 lakes: the NOAA normals
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
  const parts = [hot ? n(hot, 'hot meal') : '', meals ? `${n(meals, 'meal')} to cook` : '', snacks ? n(snacks, 'snack') : ''].filter(Boolean); // (a raw meal wants the pot first, and says so: polish B)
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
//   +0.6, a fish +0.3 (the content join). (The plan said 16 h: a June day is 16 h from the dawn meal to the dusk one, so two meals a day left
//   every June evening hungry and each day starting lower; at 24 h two meals keep you fed in any month, and an empty
//   pack still has you hungry by the next afternoon.)
// - water (fb3 B, the owner's 2026-10-25 round: nothing is drunk for you): the thirst need falls on its own, 8 game
//   hours from full to empty (5⅓ paddling hard, carrying 30 kg or more, or on a July or August afternoon), and comes
//   back only when you drink from the bottle in the book (drink: a gulp of 0.25 L, or the rest of it), BODY litres from
//   empty to full. The 2 L bottle is an item in the pockets (inventory.js); on foot at the shore E fills it (camp.js),
//   a tablet per fill (inventory.useOne), drinkable after half an hour; with no tablet the water goes in untreated (water,
//   2026-10-26: the whole bottle, until a tablet, the filter or a boil in the pot makes it safe; drunk, it may turn the
//   stomach for half a day, UPSET); at any outfitter's counter you drink at the tap and the bottle is filled, free and at
//   once. A low need says to drink (needNotes).
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
// each, and now together.) (2026-10-31: the green under the ceiling is stamina now, below;
// a need run out keeps growing its chunk, OUT_H.) energy.chunks() gives the HUD each need's chunk in the
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
// Stamina (the owner, 2026-10-31: "I'd rather have the green bar not go down and just have the other attributes push it
// smaller ... it's basically like your stamina bar"): the needs' chunks still set the ceiling, and the green is now
// stamina under it, in real seconds. Only a jog or a sprint, paddling hard and a hard swim spend it (STAMINA); eased
// off, it comes back in a few seconds. A higher ceiling (fed, watered, warm, rested) is a longer run. Run to empty you
// are winded: Shift does nothing until it is back to STAMINA.winded of the ceiling (player.hustleKey). The day's work
// tires you through the rest need instead (TRAVEL_AWAKE). "Spent" (the hour of grace, then the evacuation) is now the
// ceiling run down to nothing; a need run out keeps eating the ceiling (OUT_H) until it is met. energy.value is the
// stamina; energy.ceiling is what the readout, the hints and the journal mean by "your energy".
//
// The contract (streams A and C read these):
//   energy.value, energy.needs { rest, food, water, warmth }, energy.ceiling, energy.low ('tired' | 'hungry' | 'thirsty'
//   | 'cold' | null), energy.chunks() ([{ key, size, growing, need }]: fb2 F), energy.heldBy ("held down by thirst",
//   "held down by tiredness and cold", or ''), energy.soaked (0–1, wet through), energy.bottle (litres, 0–2), energy.drinkable, energy.treating,
//   energy.fill(litres, waitHours) (→ litres added; waitHours 0: drinkable now, as at a counter), energy.bottleWords(),
//   energy.drink(litres) → { ok, why, words } (fb3 B: a gulp; Infinity drinks the bottle up), energy.drinkCheck(),
//   energy.untreated (water: litres of lake water as it comes), energy.treatAll(hours), energy.treatCheck(), energy.treat()
//   (a tablet in afterwards), energy.upsetNow (an upset stomach under way: UPSET),
//   energy.changeClothes(entry) / changeCheck(entry) (the dry set on after a soaking), energy.bagInReach(),
//   energy.meal(kind), energy.sleep(q, hours) (after the clock has jumped; without hours: a night in a bunk, with
//   breakfast and a full bottle), energy.bunk(), energy.fresh() (a trip put in), energy.rescued() (an evacuation's
//   food and water), energy.spend(x), energy.restBoost, energy.food (days of rations), energy.awake, energy.onEvac,
//   energy.atCounter, and the meal clock energy.lastHours, energy.lastMealAbs, energy.lastMealKind. energy.needs is
//   live: energy.needs.food = 1 feeds you, energy.needs.water = 1 waters you, energy.needs.warmth = 1 warms you.
//   For warmth main.js sets energy.fires (fire.js: fires.near, the lit fire nearest the eye) and energy.indoors (() =>
//   inside a store); it reads the weather from day.weather, the wind from update's, wet gear from trip.state.wet.

// Every rate is per game hour, paid on the hours the clock passes (day.hoursPerTick: the pace's time-lapse, pace.js), so
// what a stretch of travel costs follows the game hours it takes, whichever the pace.
// Balance (the pace, 2026-10-23): a day of travel is now 6 to 8 game hours for 20 to 25 km (it was 12 to 14 for 4 or 5),
// so an hour of it costs about twice what it did, and a day of it still ends tired: 0.4 to 0.5 by the end of the paddle
// from the 0.85 an A-frame gives, the camp's rest bringing it back up to what the rest need allows by supper.
export const BASE_H = 0.009;   // a game hour of doing nothing: a day of it costs about a fifth of the bar
const PADDLE_H = 0.045;    // a game hour at a cruise in calm air
const CRUISE = LIFE.cruise; // m/s at life: what W holds in calm air (player.js); hustling past it costs more, drifting less
export const CARRY_H = 0.055; // a game hour walking a portage with 40 kg on you (or one day of food, no load known)
const LOAD_REF = 40;       // kg: the carry drain scales with player.loadKg / LOAD_REF
const SWIM_H = 0.045;
const MEALS = { cold: 0.3, hot: 0.45, fish: 0.45 }; // what a meal gives the bar back (up to the ceiling); a fish counts as hot and saves a ration
const FEED = { cold: 0.5, hot: 0.6, fish: 0.6 };    // and what it gives the food need
const FED_HOURS = 2;       // game hours a meal keeps the recovery doubled
const SLOT_HOURS = 3;      // a meal had this recently takes the place of the next one at dawn or dusk
const WARN_AT = 0.15;
const DARK_ELEV = -6;      // degrees: past civil dusk, travel costs NIGHT times as much
const NIGHT = 1.3;
// the needs
const LOW = 0.3;           // a need under this shows its mark (and its chunk is "growing" at any rate)
const EMPTY = 0.005;       // a need this low has run out: its chunk keeps growing (OUT_H)
const SPENT_GRACE = 1;     // game hours at an empty ceiling before someone comes out for you (Adventure)
const SPENT_OVER = 0.02;   // spent at 0, the ceiling is spent until it is back over this
const NEARLY = 0.08;      // a word, once, as the bar nears empty
const FOOD_HOURS = 24;     // game hours awake from a full food need to an empty one
const ASLEEP = 1 / 3;      // the needs fall at this rate asleep (and across any jump of the clock longer than JUMP)
const JUMP = 2;            // game hours: a longer jump of the clock is a night, not a stretch of the day
export const BOTTLE = 2;   // litres
const USE = 1 / 6, USE_HARD = 1 / 4; // litres a game hour the body uses: thirst falls 1/8 an hour, 3/16 paddling hard, carrying heavy or on a hot afternoon
const BODY = 4 / 3;        // litres from an empty water need to a full one (fb3 B: drunk by hand; the need lasts 8 h, 5⅓ h hard)
export const GULP = 0.25;  // litres a Drink takes from the bottle (thirst +19 %)
// water (the owner, 2026-10-26: "if i fill water up without a tablet, it is instantly clean even tho warnign says its
// not"): lake water as it comes is untreated (energy.untreated, litres) until a tablet, the filter or a boil in the pot
// makes it safe, and a drop of it in the bottle makes the whole bottle untreated. It quenches thirst like any water, with
// a real risk: each litre drunk may turn the stomach (`risk` a litre), `onset` game hours later, for `hours`: a chunk off
// the bar's ceiling (`chunk`, drawn with hunger's, never taking the ceiling under `floor` by itself, so it never spends
// you), hunger and thirst falling `food` and `water` times as fast. Said once, plainly, when it hits. (It was: a fill
// with no tablet drinkable at once, and hunger ×1.5 for 6 h whether you drank it or not.)
export const UPSET = { risk: 0.3, onset: [0.4, 1.2], hours: 10, chunk: 0.12, floor: 0.2, food: 1.5, water: 1.3 };
const UPSET_WORDS = 'Your stomach turns: the untreated water. It passes in half a day.';
const NO_BAG_REST = 0.6;   // a night in the tent with no sleeping bag in reach gives this much of the night's rest
const DRY_BOOST = 2, DRY_BOOST_HOURS = 2; // warmth comes back this much faster, this long, after a change into dry clothes
const WET_SET_FIRE_H = 0.5, WET_SET_AIR_H = 8; // game hours the wet set takes to dry by a fire, or in the open air (a night does it too)
const NIGHT_HOURS = 7;     // a night this long gives the tent's whole quality
const WAKE_WINDOW = 0.1;   // game hours after waking in which the bar rises to the ceiling (needs set just after a sleep count)
export const TABLETS = 0.5; // game hours before water treated with a tablet is drinkable
const HARD_EFFORT = 1.15;  // paddle effort (1 at a calm cruise) from which it counts as hard
const HEAVY_KG = 30;       // a carry at least this heavy counts as hard
// taste (the owner's call, 2026-10-26: "fishing sitting still drains energy far less than paddling"; a five-hour sit in
// the lee had taken the bar from 0.78 to 0.55, as paddling would). The bar sits at the ceiling the needs allow, so what
// an hour costs is what the needs lose in it: sitting still with the rod up (the canoe still, or standing to fish from
// the shore) is light work, and the hours awake count `awake` of themselves for the rest need (awakeSince moves on, as
// a nap's or a coffee's does), hunger falls at `food` and thirst at `water` of the awake rate. A fish on the line costs
// a little more while the fight lasts: the needs at the full rate, `fight` a game hour of effort and no rest.
export const FISHING = { awake: 0.35, food: 0.5, water: 0.4, fight: 0.03 };
// stamina, a real second (of the whole bar): spent jogging (on foot, more under a load or the canoe), paddling hard,
// swimming hard; back once you ease off (after `delay` s), faster standing still; winded at 0 until back to `winded` of
// the ceiling. At a full ceiling a jog lasts about 22 s; at half of it, 11 s.
export const STAMINA = { jog: 1 / 22, carry: 1 / 15, paddle: 1 / 30, swim: 1 / 16, back: 0.14, backStill: 0.22, delay: 0.8, winded: 0.3 };
const TRAVEL_AWAKE = 0.35; // an hour of travel at a cruise counts this much more awake (the rest need): the day's work tires you
const OUT_H = 0.025;       // a game hour with a need run out: its chunk grows this much more (starving, parched, freezing)
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
const DARK_C = 3;          // °C colder felt after dark (civil dusk; the owner, 2026-10-31: the night should bite)
const WIND_C = 0.6;        // °C felt colder per m/s of wind over WIND_FROM, afloat (half ashore, among the trees)
const WIND_FROM = 2, WIND_MAX_C = 6;
const RAIN_C = 2;          // °C colder felt in full rain
const WATER_COMFORT = 20;  // °C: water warmer than this costs no warmth to swim in
const WATER_SPAN = 14;     // °C under WATER_COMFORT for a water chill of 1
const SWIM_COLD_H = 3;     // warmth a game hour in the water at a water chill of 1 (an October lake is 1.15)
const GASP = 0.1;          // warmth at once going in, at a water chill of 1
const WADE_COLD_H = 0.5;   // warmth a game hour wading (the legs in), at a water chill of 1, times how deep (to 1 m)
const WADE_SOAK = 0.35;    // wading leaves you this wet through at least (wet boots and trousers)
const SOAK_H = 1.5;        // wet through a game hour in full rain
const DRY_H = 0.25, DRY_SUN_H = 0.4, DRY_FIRE_H = 2; // dried a game hour: in the air, more in sun, by a fire
const FIRE_H = 0.8;        // warmth back a game hour by a fire at full heat (the coals half of it)
const FIRE_NEAR = 3, FIRE_FAR = 6; // metres: the whole of a fire's warmth within the first, none past the second
const INDOOR_H = 1.2;      // warmth back a game hour inside a store
const WARM_H = 0.15;       // warmth back a game hour in air 8 °C over COMFORT (a quarter of it just over; half wet)
const NIGHT_BAG = 1, NIGHT_WET = 0.8, NIGHT_NO_BAG = 0.6; // warmth after a night in the tent: the bag, damp gear, no bag in reach

const litres = (x) => `${x >= 1.95 ? '2' : x.toFixed(1)} L`; // fb4 C
// content C: what the kit with you does to the needs and the bar (kit.js mods; main.js sets energy.kit): the rain jacket
// (soak, rainChill), the toque (chill), the canoe chair (rest: the bar's recovery; drain: a game hour), the
// headlamp after dark (night: travel's cost); and the bag's night (kit.sleepNight)
const KIT0 = { soak: 1, rainChill: 1, chill: 1, rest: 1, drain: 0, night: NIGHT };
// cons C: the bugs where you are (bugs.js mods; main.js sets energy.bugs): the bar's drain a game hour, the share of
// rest's recovery left, the share of warm air's comfort they take; and the night's (bugs.sleepNight: a tent left open)
const BUG0 = { drain: 0, rest: 1, comfort: 0 };

export class Energy {
  constructor(player, day) {
    this.player = player; this.day = day;
    this.inventory = null;  // inventory.js, once main.js attaches it: then the food is its meals
    this._food = 0;
    this.value = 1; this.food = 0; this.fedUntil = -1;
    this.lastHours = day.hours; this.warned = false; this.warnTimer = 0;
    this.onEvac = null; this.onNote = null; this.onEat = null; // onEat(eat, name): camp 2's cook.js
    this.spentAt = null;    // when the bar hit 0 (game hours), while it is still spent: the hour of grace runs from it
    this.trip = null;       // the trip's rules (trip.js), set by the trip
    this.exertion = 0;      // what the paddle cost this frame, for the HUD
    this.winded = false;    // stamina run out: Shift does nothing until it is back to STAMINA.winded of the ceiling
    this.restT = 0;         // real seconds since the last effort that spent stamina
    this.out = { rest: 0, food: 0, water: 0, warmth: 0 }; // game hours each need has been run out (OUT_H)
    this.trend = { dir: 0, why: '', rate: 0 }; // warmth's way now (warmthTrend), for the HUD
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
    this.untreated = 0;      // water: litres of lake water as it comes (the whole bottle when any: drinkable and treating 0)
    this.upsetAt = -1e9; this.upsetUntil = -1e9; this.upsetSaid = true; // water: an upset stomach from it, from when to when (UPSET)
    this.dryUntil = -1e9;    // fb3 B: changed into dry clothes: warmth comes back faster until then
    this.wetSetH = 0;        // fb3 B: game hours the wet set of clothes has been drying
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
  get kitMods() { return (this.kit && this.kit.mods) || KIT0; } // content C
  get bugMods() { return (this.bugs && this.bugs.mods) || BUG0; } // cons C
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
  // (water: an upset stomach adds its chunk to hunger's, drawn under the hunger icon)
  chunkOf(key) { return this.needChunk(key) + (key === 'food' ? this.upsetChunk() : 0); }
  needChunk(key) { return this.live ? CHUNK_W[key] * (1 - clamp(this.needs[key], 0, 1)) + OUT_H * (this.out[key] || 0) : 0; }
  // water: the upset stomach under way now, and its chunk: UPSET.chunk, less where the needs' own chunks leave the
  // ceiling under UPSET.floor (it never spends you by itself)
  get upsetNow() { const n = this.now; return n >= this.upsetAt && n < this.upsetUntil; }
  upsetChunk() {
    if (!this.live || !this.upsetNow) return 0;
    let c = 1; for (const k of NEED_KEYS) c -= this.needChunk(k);
    return clamp(Math.min(UPSET.chunk, c - UPSET.floor), 0, UPSET.chunk);
  }
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
    const word = (key) => (key === 'food' && this.upsetChunk() > this.needChunk('food') ? 'an upset stomach' : HELD_WORD[key]); // (water)
    return `held down by ${word(k)}${second ? ` and ${word(second.key)}` : ''}`;
  }
  get bottle() { return this.drinkable + this.treating + this.untreated; }
  // a hot afternoon: July and August, noon to six, under the sun (not under cloud, fog or rain: weather.js)
  get hot() {
    const { month } = monthDay(this.day.year, this.day.doy), h = this.day.hours, w = this.day.weather;
    return (month === 6 || month === 7) && h >= 12 && h < 18 && !(w && /overcast|fog|rain|storm/.test(w.state || ''));
  }
  get warning() { return !this.hasFood && this.ceiling < WARN_AT && !(this.hungFood().days > 0) && !this.foodNearby(); } // (fb5 join: not "No food… make for an outfitter" with supper hung in the barrel at camp)
  // food of yours close by but out of reach: the pack in the canoe beside the shore, a pack set down by the fire, a fish
  // in a hand (the content join: "No food, and not much left in you. Make for an outfitter." came 7 m from the canoe with
  // three meals in it, and two walleyes in the hands)
  foodNearby(r = 60) {
    const i = this.inv, p = this.player; if (!i || !p) return false;
    const d = p.carry && p.carry.drop, FOOD = ['meal', 'snack', 'food', 'fish', 'forage'];
    for (const c of i.containers) {
      const w = typeof i.rootWhere === 'function' ? i.rootWhere(c) : c.where;
      if (w === 'stash') continue;
      const at = w === 'canoe' ? (d || p) : (w === 'ground' || w === 'hung') ? c.at : p;
      if (at && Math.hypot(at.x - p.x, at.z - p.z) > r) continue;
      if (c.grid.some((e) => !e.box && FOOD.includes((itemDef(e.id) || {}).kind))) return true;
    }
    return false;
  }
  get still() { const p = this.player; return (p.mode === 'paddle' || p.mode === 'carry' || p.mode === 'walk') && !p.landing && (p.mode === 'paddle' || Math.abs(p.speed) < 0.25); } // (2026-10-31: drifting in the canoe counts as still)
  // the rest multiplier: the camp sets it (3 at a site, 4 by a lit fire); until anything does, a campsite nearby gives 3
  get restBoost() { return this._boost; }
  set restBoost(v) { this._boost = Number.isFinite(v) ? Math.max(0, v) : 1; this.boostSet = true; }

  note(t) { if (this.onNote) this.onNote(t); }
  reset() { this.value = 1; this.food = 0; this.fedUntil = -1; this.warned = false; this.awakeSince = this.now; this.lastMealAbs = -1e9; this.upsetAt = this.upsetUntil = -1e9; this.upsetSaid = true; this.fresh(); }
  // the needs full and the bottle filled (a trip put in, a new season)
  fresh() {
    this.rest0 = 1; this.need.food = 1; this.need.water = 1; this.need.warmth = 1; this.soaked = 0;
    this.drinkable = BOTTLE; this.treating = 0; this.readyAt = -1e9; this.untreated = 0;
    this.lastNow = this.now; this.unnote(); this.lastChunks = null; this.spentAt = null; this.clearOut();
  }
  clearOut() { for (const k in this.out) this.out[k] = 0; }
  unnote() { for (const k in this.noted) this.noted[k] = false; }
  // fetched in by an evacuation: whoever came out brought hot food and water, and a blanket (main.js, on the trip's 'evac')
  rescued() { this.need.food = 1; this.need.water = 1; this.need.warmth = 1; this.soaked = 0; this.fill(BOTTLE, 0); this.unnote(); this.lastChunks = null; this.spentAt = null; this.clearOut(); }

  // --- the bottle ----------------------------------------------------------------------------------------------
  // Fill it: up to `litres` more, to the 2 L it holds. waitHours: how long the water takes to be drinkable (tablets
  // half an hour); 0 for water that is drinkable now (an outfitter's tap), which also clears what was being treated.
  // Returns the litres added (water: or put through the filter or under the tablet).
  // water: untreated water in the bottle goes through the filter or under the tablet with the new (the whole bottle is
  // treated); at a tap or a pump it is poured out first. With no tablet the new water goes in as it comes, and the whole
  // bottle is untreated.
  fill(litres = BOTTLE, waitHours = TABLETS) {
    if (!(waitHours > 0)) { // drinkable now: the tap, the pump
      this.untreated = 0;
      const add = Math.min(Math.max(0, litres), BOTTLE - this.bottle);
      this.drinkable = Math.min(BOTTLE, this.drinkable + this.treating + Math.max(0, add));
      this.treating = 0;
      this.noted.dry = false;
      return Math.max(0, add);
    }
    const add = Math.min(Math.max(0, litres), BOTTLE - this.bottle), raw = this.untreated;
    if (add <= 0.001 && raw <= 0.001) return 0;
    // fb3 B: a tablet per fill, from the tablets in reach (the pump and the gravity filter wait less than a tablet's half
    // hour and use none)
    const tablet = waitHours >= TABLETS - 0.01 && !this.sandbox;
    if (tablet) {
      const i = this.inv, r = i && typeof i.useOne === 'function' ? i.useOne('tablets') : { ok: true };
      if (!r.ok) {
        if (add <= 0.001) return 0;
        // water: no tablet: lake water as it comes, and the whole bottle with it (the moment 'untreated' says what to do)
        this.untreated = this.bottle + add; this.drinkable = 0; this.treating = 0;
        const away = i && typeof i.usesLeft === 'function' && i.usesLeft('tablets', { reachable: false }) > 0; // (the fb3 join: the tube left in a pack out of reach)
        this.note(`${away ? 'No tablet to hand' : 'No tablets left'}: lake water as it comes.`);
        this.noted.dry = false;
        return add;
      }
      if (Number.isFinite(r.left) && r.left <= 3) this.note(r.left ? `${r.left} ${r.left === 1 ? 'tablet' : 'tablets'} left.` : 'That was the last tablet.'); // fb5 E: the count only when it runs low (camp.js says the fill; the first time, the moments teach it)
    }
    this.treating += add + raw; this.untreated = 0; this.readyAt = this.now + waitHours;
    this.noted.dry = false;
    return Math.max(0, add) + raw;
  }
  // crafting (2026-10-31, the owner: "I fill up water at the shore. I don't want it to automatically put a tablet in
  // because there are options"): E at the water's edge fills the bottle with lake water as it comes, and nothing more.
  // What makes it safe is a choice made after: Treat it (a tablet, half an hour), or poured into a pot and boiled on
  // the fire (recipes.js), or the pump or the gravity bag (kit.js, a Q at the shore). A drop of lake water in the bottle
  // makes the whole bottle untreated. Returns the litres added.
  fillRaw(litres = BOTTLE) {
    const add = Math.min(Math.max(0, litres), BOTTLE - this.bottle);
    if (add <= 0.001) return 0;
    this.untreated = this.bottle + add; this.drinkable = 0; this.treating = 0;
    this.noted.dry = false;
    return add;
  }
  // clean water poured in (out of a pot, boiled): drinkable, unless the bottle holds lake water (then it is too)
  addClean(litres) {
    const add = Math.min(Math.max(0, litres), BOTTLE - this.bottle);
    if (add <= 0.001) return 0;
    if (this.untreated > 0.001) this.untreated += add; else this.drinkable += add;
    this.noted.dry = false;
    return add;
  }
  // the bottle poured out into a pot: up to `litres`, → { l, lake } (lake: untreated, or still under its tablet)
  pourOut(litres = BOTTLE) {
    const l = Math.min(Math.max(0, litres), this.bottle);
    if (l <= 0.001) return { l: 0, lake: false };
    const lake = this.untreated > 0.001 || this.treating > 0.001;
    this.useWater(l);
    return { l, lake };
  }
  // water: what is untreated, made safe: in `hours` (under a tablet, through the gravity bag), or now (0: boiled)
  treatAll(hours = TABLETS) {
    const raw = this.untreated;
    if (!(raw > 0.001)) return 0;
    this.untreated = 0;
    if (hours > 0) { this.treating += raw; this.readyAt = this.now + hours; } else this.drinkable = Math.min(BOTTLE, this.drinkable + raw);
    return raw;
  }
  // water: a tablet dropped in afterwards (the bottle's or the tablets' Treat it): { enabled, why, needs, next }
  treatCheck() {
    if (!(this.untreated > 0.001)) return check(false, 'Nothing to treat', [], '');
    const i = this.inv, tabs = i && typeof i.usesLeft === 'function' ? i.usesLeft('tablets') : 1;
    if (!(tabs > 0)) return check(false, 'No tablet to hand', [NEED.qty('A tablet', 0, 1, '', { chip: 'a tablet', item: 'tablets' })], 'A boil in the pot makes it safe too, or tablets from any outfitter');
    return check(true, null, [], '');
  }
  treat() {
    const c = this.treatCheck();
    if (!c.enabled) return { ok: false, why: c.why, words: `${c.why}.` };
    const i = this.inv, r = this.sandbox || !i || typeof i.useOne !== 'function' ? { ok: true } : i.useOne('tablets');
    if (!r.ok) return { ok: false, why: 'No tablet to hand', words: 'No tablet to hand.' };
    this.treatAll(TABLETS);
    const words = Number.isFinite(r.left) && r.left <= 3 ? `A tablet in. ${r.left ? `${r.left} ${r.left === 1 ? 'tablet' : 'tablets'} left.` : 'That was the last tablet.'}` : 'A tablet in.';
    this.note(words);
    return { ok: true, why: null, words };
  }
  // fb3 B: Drink (the bottle's verb in the book): `litres` of what is drinkable (GULP a gulp; Infinity drinks it up),
  // the thirst need up by what the body takes of it. → { ok, why, words }
  // fb4 C: as a checklist ({ ok, why, needs, next }: the treating's timer in game seconds, the water have of need)
  drinkCheck() {
    if (this.drinkable <= 0.02 && !(this.untreated > 0.02)) { // (water: lake water as it comes is drunk too, with its risk)
      if (this.treating > 0.001) {
        const sec = this.treatingSec();
        return { ok: false, why: `Treating: drinkable in ${timerWords(sec)}`, needs: [NEED.timer('Treating', sec, true, { note: `${litres(this.treating)} under a tablet` })], next: `Wait ${timerWords(sec)}: the tablet is working` };
      }
      return { ok: false, why: 'The bottle is dry', needs: [NEED.qty('Water in the bottle', 0, GULP, 'L')], next: 'Fill it at the water’s edge: on foot, face the water and press E' };
    }
    return { ok: true, why: null, needs: [], next: '' };
  }
  // game seconds until what is under a tablet is drinkable
  treatingSec() { return this.treating > 0.001 ? Math.max(0, (this.readyAt - this.now) * 3600) : 0; }
  // fb4 C: E at the water's edge (nearby.js reads it): { enabled, why, needs, next, wait }. wait: the filter's hours
  // (camp.filterWait: a tablet's half hour, a pump's minutes)
  fillCheck(wait = TABLETS) {
    // (crafting, 2026-10-31: E fills it as it comes; the tablet is the bottle's own Treat it, after)
    if (wait >= TABLETS - 0.01) {
      const room = Math.max(0, BOTTLE - this.bottle);
      if (room <= 0.05) return { ...check(false, 'The bottle is full', [NEED.qty('Room in the bottle', +room.toFixed(2), GULP, 'L')], 'Drink first: the bottle in your pockets, right-click › Drink'), wait: 0 };
      return { ...check(true, null, [NEED.qty('Room in the bottle', +room.toFixed(2), GULP, 'L')], 'Fill it: lake water as it comes. Treat it after: a tablet, or boil it in a pot'), wait: 0 };
    }
    const i = this.inv, tabletKind = wait >= TABLETS - 0.01 && !this.sandbox;
    const tabs = tabletKind && i && typeof i.usesLeft === 'function' ? i.usesLeft('tablets') : null;
    // (water: untreated water in the bottle is room where a filter or a tablet is to hand: it goes through with the new)
    const room = Math.max(0, BOTTLE - this.bottle + (!tabletKind || tabs > 0 ? this.untreated : 0));
    if (room <= 0.05) return { ...check(false, 'The bottle is full', [NEED.qty('Room in the bottle', +room.toFixed(2), GULP, 'L')], 'Drink first: the bottle in your pockets, right-click › Drink'), wait };
    const needs = [NEED.qty('Room in the bottle', +room.toFixed(2), GULP, 'L')];
    if (tabletKind) needs.push(NEED.qty('A tablet in reach', tabs > 0 ? 1 : 0, 1, '', { note: tabs > 0 ? `${tabs} left` : 'none: lake water as it comes, untreated' }));
    needs.push(NEED.timer('Drinkable after', (tabletKind && !(tabs > 0) ? 0 : wait) * 3600, false));
    const next = !tabletKind ? `Fill it: through the filter, drinkable in ${timerWords(wait * 3600)}` : tabs > 0 ? 'Fill it: a tablet in, drinkable in 30 min' : 'Fill it as it comes, or bring the tablets within reach first (in a pack you carry)';
    return { ...check(true, null, needs, next), wait };
  }
  // fb4 C: the bottle's entry as a status (inventory.status): treating with its timer, empty, low, or null when fine
  bottleStatus() {
    const now = this.now;
    if (this.treating > 0.001) {
      const sec = this.treatingSec();
      return { label: 'Treating', mark: 'treating', timer: Math.round(sec), running: true, until: now + sec / 3600, next: `${this.drinkable > 0.02 ? `${litres(this.drinkable)} drinkable now; ` : ''}${litres(this.treating)} drinkable in ${timerWords(sec)}` };
    }
    if (this.bottle <= 0.02) return { label: 'Needs filling', mark: 'empty', next: 'Empty: fill it at the water’s edge (on foot, face the water and press E), or free at any counter' };
    // water: lake water as it comes, the word and its mark (no standing line: the moment 'untreated' says it once)
    if (this.untreated > 0.001) return { label: 'Untreated', mark: 'untreated', next: 'A tablet, the filter, or a boil in the pot makes it safe' };
    if (this.drinkable < 0.5) return { label: `${litres(this.drinkable)} left`, mark: 'low', next: 'Fill it at the water’s edge before you set off' };
    return null;
  }
  drink(litres = GULP) {
    const d = this.drinkCheck();
    if (!d.ok) return { ok: false, why: d.why, words: `${d.why[0].toUpperCase()}${d.why.slice(1)}.` };
    // (water: the bottle untreated, its lake water is what you drink, and the risk with it)
    const raw = this.drinkable <= 0.02 && this.untreated > 0.02, had = raw ? this.untreated : this.drinkable;
    const l = Math.min(had, Math.max(0.01, litres));
    if (raw) { this.untreated = Math.max(0, this.untreated - l); if (this.untreated <= 0.001) this.untreated = 0; this.risk(l); } else this.drinkable = Math.max(0, this.drinkable - l);
    this.need.water = clamp(this.need.water + l / BODY, 0, 1); // (the content join: a drink between trips counts too)
    this.lastDrink = { l, at: this.now, raw };
    const words = `${l >= had - 0.001 && litres > GULP ? 'You drink the bottle up' : l >= 0.9 ? `${l.toFixed(1)} L down` : 'A gulp'}: ${this.bottleWords()}.`;
    this.note(words);
    return { ok: true, why: null, words };
  }
  // water: `l` litres of untreated water drunk: the stomach may turn (UPSET), an hour or so on; nothing more while it is
  // coming or under way
  risk(l) {
    if (this.sandbox || !(l > 0) || this.now < this.upsetUntil) return false;
    if (Math.random() >= 1 - Math.pow(1 - UPSET.risk, l)) return false;
    const [a, b] = UPSET.onset;
    this.upsetAt = this.now + a + Math.random() * (b - a); this.upsetUntil = this.upsetAt + UPSET.hours; this.upsetSaid = false;
    return true;
  }
  treatingWords() { const min = Math.max(1, Math.ceil(((this.readyAt - this.now) * 60) / 5) * 5); return `drinkable in ${min} min`; }
  // camp 2: water out of the bottle for the pot (cook.js: a dehydrated meal wants its water; boiled, lake water is safe, so
  // what is still under a tablet goes first). Returns whether there was enough (none is taken when there was not).
  // (water: the untreated first, then what is under a tablet, then what is drinkable: all of it is boiled)
  useWater(litres) {
    const l = Math.max(0, Number(litres) || 0);
    if (this.bottle < l - 0.001) return false;
    const u = Math.min(this.untreated, l), a = Math.min(this.treating, l - u);
    this.untreated -= u; this.treating -= a; this.drinkable = Math.max(0, this.drinkable - (l - u - a));
    if (this.untreated <= 0.001) this.untreated = 0;
    if (this.treating <= 0.001) this.treating = 0;
    return true;
  }
  // "1.4 L in the bottle", "2 L in the bottle, drinkable in 20 min", "the bottle is dry" (water: "1.8 L of lake water in
  // the bottle")
  bottleWords() {
    const l = (x) => `${x >= 1.95 ? '2' : x.toFixed(1)} L`;
    if (this.bottle <= 0.02) return 'the bottle is dry';
    if (this.untreated > 0.001) return `${l(this.untreated)} of lake water in the bottle`;
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
    if (Number.isFinite(eat.warm) && this.live) this.need.warmth = clamp(this.need.warmth + eat.warm, 0, 1); // content C: chili mac warms you
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
    if (this.trip) { this.note('Eat from the inventory (I): a snack when you are still, a meal cooked on the grate at a fire.'); return; }
    if (!this.still) { this.note('Hold still to eat.'); return; }
    if (!this.meal('cold', 'You eat')) this.note(this.adventure ? 'The food pack is empty.' : 'The food pack is empty. Any outfitter will fill it.');
  }

  // --- sleep -----------------------------------------------------------------------------------------------------
  // A night's sleep (camp.js, after the clock has jumped to the morning): q is the tent's quality (0–1) and hours the
  // hours slept. The rest need starts the day at q × min(1, hours / 7), the needs have fallen over the night at a third
  // of their waking rate, and the bar is back up to the ceiling. Without hours it is a night in a bunk at an outfitter
  // (an evacuation, or the end of a trip): a full night, then breakfast and a full bottle.
  // opts.bag: whether the bag was in the tent (camp.js tentGear: the owner, 2026-10-31, the bag counts only inside the
  // pitched tent); left out, a bag in the camp's reach counts (the rides, a bunk).
  sleep(q = 1, hours = null, opts = {}) {
    const bunk = !Number.isFinite(hours);
    q = clamp(q, 0, 1);
    if (this.live) this.passNeeds(Math.max(0, this.now - this.lastNow), true, false);
    this.lastNow = this.now;
    // fb3 B: the sleeping bag is the night's rest: without one in the camp's reach, NO_BAG_REST of it (its stats say so)
    const bag = bunk || (typeof opts.bag === 'boolean' ? opts.bag : this.bagInReach());
    if (!bag) q *= NO_BAG_REST;
    // content C: the bag's night (kit.js sleepNight): colder than the bag is good to, less rest and colder by morning;
    // a night at the site Arvid's map pencils rests you a little more
    const wet0 = !bunk && !!(this.trip && this.trip.state && this.trip.state.wet);
    let night = null; try { night = !bunk && this.kit && typeof this.kit.sleepNight === 'function' ? this.kit.sleepNight({ wet: wet0 }) : null; } catch (e) { night = null; }
    if (night) q = clamp(q * (bag ? night.rest : 1) + (night.restAdd || 0), 0, 1);
    // cons C: the bugs' night (bugs.js sleepNight): the fly off, or under the stars, they cost some of it
    let bugN = null; try { bugN = !bunk && this.bugs && typeof this.bugs.sleepNight === 'function' ? this.bugs.sleepNight() : null; } catch (e) { bugN = null; }
    if (bugN && Number.isFinite(bugN.rest)) q = clamp(q * bugN.rest, 0, 1);
    // (tuning: a short night never leaves you less rested than you lay down: a 4 h rest that crossed dusk counted as a
    // 4 h night and took the rest need from 0.77 to 0.48; the clock has jumped already, so the bedtime rest is the
    // ceiling of the hours awake before the night)
    // The sleep pass (the owner, 2026-10-31: "sometimes it doesn't do anything"): it was max(the bedtime rest, q × the
    // share of a night), so a night whose quality was under the bedtime rest (no bag in reach, a cold night, the bugs:
    // 0.92 × 0.6 × …) or a short one gave nothing at all. Now the night brings the rest from where you lay down toward
    // its quality by its share of a night: a whole night in the tent with the bag and the pad is a whole night's rest,
    // a short one some of the way, and a poor one never takes you lower than you lay down.
    const atBed = bunk ? 0 : clamp(this.rest0 * restCeiling(Math.max(0, this.awake - (hours || 0))), 0, 1);
    const share = Math.min(1, (bunk ? NIGHT_HOURS : hours) / NIGHT_HOURS);
    this.rest0 = Math.max(atBed, atBed + (q - atBed) * share);
    this.lastNight = { q: +q.toFixed(3), hours: bunk ? NIGHT_HOURS : hours, bag, bugs: !!(bugN && Number.isFinite(bugN.rest) && bugN.rest < 0.97) };
    this.wetSetH = Math.max(this.wetSetH, WET_SET_AIR_H); // the wet set of clothes dries overnight
    if (bunk) { this.need.food = 1; this.need.water = 1; this.fill(BOTTLE, 0); }
    // fb2 F: a night in the bag warms you through (a bunk, or the tent with the bag in the camp's reach), less in damp
    // gear, and the clothes are dry by morning; never colder than you went in (content C: unless the night was colder than the bag)
    const wet = !bunk && !!(this.trip && this.trip.state && this.trip.state.wet);
    this.need.warmth = Math.max(this.need.warmth, bunk ? 1 : !bag ? NIGHT_NO_BAG : wet ? NIGHT_WET : NIGHT_BAG);
    if (bag && night && Number.isFinite(night.warmth)) this.need.warmth = Math.min(this.need.warmth, night.warmth); // content C: a night colder than the bag leaves you cold by morning
    this.soaked = 0; this.lastChunks = null;
    this.awakeSince = this.now; this.warned = false; this.warnTimer = 0;
    this.unnote();
    this.value = Math.max(this.value, this.live ? this.ceiling : q);
    this.wokeAt = this.now;
  }
  bunk() { this.sleep(1); }
  // an effort paid at once (a capsize, a walk back fetched)
  spend(amount) { this.value = clamp(this.value - amount, 0, 1); }

  // the needs over dh game hours: the food falls (faster on a queasy stomach), the thirst falls (fb3 B: nothing is drunk
  // for you; drink() brings it back), tablets finish their work. asleep: at a third of the rate.
  passNeeds(dh, asleep = false, hard = false, light = null) {
    if (this.treating > 0 && this.now >= this.readyAt) { this.drinkable = Math.min(BOTTLE, this.drinkable + this.treating); this.treating = 0; }
    if (!(dh > 0)) return;
    const k = asleep ? ASLEEP : 1, upset = this.upsetNow; // (water: an upset stomach, UPSET)
    this.need.food = Math.max(0, this.need.food - (k * dh * (upset ? UPSET.food : 1) * (light ? light.food : 1)) / FOOD_HOURS);
    const use = (hard ? USE_HARD : USE) * k * dh * (light ? light.water : 1) * (upset ? UPSET.water : 1);
    this.need.water = Math.max(0, this.need.water - use / BODY);
    // taste: light work (FISHING): the hours awake count for less of the rest need
    if (light && Number.isFinite(this.awakeSince)) this.awakeSince = Math.min(this.now, this.awakeSince + (1 - light.awake) * dh);
  }
  // taste: 'still' with the rod up and the canoe still (or standing to fish from the shore), 'fight' with a fish on the
  // line, else null (FISHING)
  fishingNow() {
    const p = this.player, f = p && p.fishing;
    if (!f || !f.rodUp || p.teleporting || p.landing) return null;
    if (f.state === 'fight') return 'fight';
    if (p.mode === 'paddle') return Math.abs(p.speed) < 0.3 ? 'still' : null;
    return p.mode === 'walk' && Math.abs(p.speed) < 0.1 ? 'still' : null;
  }
  // --- warmth (fb2 F) --------------------------------------------------------------------------------------------
  // the air you feel, °C: the weather's (or, with none, the season's mean and the day's swing), less the wind (afloat;
  // half of it ashore), the rain on you and the dark
  feltTemp(wind) {
    const d = this.day, L = d.weather && d.weather.look, p = this.player;
    let t = L && Number.isFinite(L.temp) ? L.temp : dayMean(d.doy) + daySwing(d.doy) * Math.sin((2 * Math.PI * (d.hours - 9)) / 24); // (d1 lakes: the normals)
    const ws = wind && Number.isFinite(wind.speed) ? wind.speed : 0, afloat = p.mode === 'paddle' || p.mode === 'swim';
    const air = t, windC = this.inside() ? 0 : Math.min(WIND_MAX_C, Math.max(0, ws - WIND_FROM) * WIND_C) * (afloat ? 1 : 0.5);
    const rainC = RAIN_C * this.rainOn() * this.kitMods.rainChill; // (content C: the rain jacket)
    const darkC = d.elevation < DARK_ELEV ? DARK_C : 0;
    this.felt = { air, wind: windC, rain: rainC, dark: darkC }; // what makes it up, for warmthTrend's why
    return t - windC - rainC - darkC;
  }
  // the rain falling on you, 0–1 (snow wets you half as much; none indoors)
  // (fb4: and none under a pitched tarp, stream E's tarp.covers(x, z), when it is in the build)
  rainOn() { const L = this.day.weather && this.day.weather.look; return !L || this.inside() || this.underTarp() ? 0 : clamp((L.rain || 0) * (1 - 0.5 * (L.snow || 0)), 0, 1); }
  underTarp() {
    const g = typeof window !== 'undefined' ? window.__game : null, t = g && g.tarp, p = this.player;
    try { return !!(t && typeof t.covers === 'function' && p && p.onFoot !== false && p.mode !== 'paddle' && t.covers(p.x, p.z)); } catch { return false; }
  }
  // inside a store (main.js energy.indoors), or at its counter
  inside() { try { return !!(this.indoors && this.indoors()) || !!(this.atCounter && this.atCounter()); } catch { return false; } }
  // a fire's warmth where you stand, 0–1: by its heat (the coals half), the whole of it within FIRE_NEAR, none past FIRE_FAR
  fireHere() {
    const f = this.fires && this.fires.near, p = this.player;
    if (!f) return 0;
    const heat = Math.max(f.heat || 0, 0.5 * (f.embers || 0));
    return heat <= 0.05 ? 0 : heat * (1 - smoothstep(FIRE_NEAR, FIRE_FAR, Math.hypot(f.x - p.x, f.z - p.z)));
  }
  // the sleeping bag in the camp's reach (true with no inventory at all)
  bagInReach() {
    const i = this.inv;
    if (!i) return true;
    try {
      const pool = typeof i.campReach === 'function' ? i.campReach() : i.reachable();
      return pool.some((c) => c.grid.some((e) => !e.box && (e.id === 'sleepingbag' || isBag(e.id)))); // (content C: any bag)
    } catch { return true; }
  }
  // fb3 B: the clothes bag's Change (its verb in the book): after a capsize or a soaking, the dry set on: wet through no
  // more, the gear counts dry, and warmth comes back DRY_BOOST times as fast for DRY_BOOST_HOURS. The entry's `left`
  // (one dry set) goes to 0 and the wet set dries by a fire, inside, or overnight (wetSetH).
  // (fb4 C: as a checklist, { ok, why, needs, next }, the wet set's drying as a timer)
  changeCheck(e) {
    const left = e && Number.isFinite(e.left) ? e.left : 1;
    if (left <= 0) {
      const d = this.wetSetDrying();
      return { ok: false, why: 'The spare set is wet', needs: [NEED.timer('The spare set drying', d.sec, true, { note: d.byFire ? 'by the fire' : 'in the air: 30 min by a lit fire' })], next: d.byFire ? `Dry in ${timerWords(d.sec)}: stay by the fire` : `Stand by a lit fire: it dries in ${timerWords((d.sec * WET_SET_FIRE_H) / WET_SET_AIR_H)} (${timerWords(d.sec)} in the air, or overnight)` };
    }
    const wet = this.soaked > 0.25 || !!(this.trip && this.trip.state && this.trip.state.wet);
    if (!wet) return { ok: false, why: 'You are dry already', needs: [NEED.step('Wet through, or the gear wet', false, { note: this.soaked > 0.02 ? `${Math.round(this.soaked * 100)} % wet` : 'dry' })], next: 'Keep it for after a capsize or a soaking' };
    const p = this.player;
    if (p && p.mode !== 'walk' && p.mode !== 'carry' && !(this.inv && this.inv.atStash)) return { ok: false, why: 'Not in the canoe', needs: [NEED.step('On foot', false)], next: 'Go ashore first' };
    return { ok: true, why: null, needs: [], next: '' };
  }
  // fb4 C: the wet set drying now: { sec (game seconds left at the rate it dries now), byFire }
  wetSetDrying() {
    const inside = this.inside(), byFire = (inside ? 0 : this.fireHere()) > 0.3 || inside, rate = byFire ? WET_SET_AIR_H / WET_SET_FIRE_H : 1;
    return { sec: Math.max(0, ((WET_SET_AIR_H - this.wetSetH) / rate) * 3600), byFire };
  }
  // fb4 C: the clothes bag as a status: the wet set drying (by a fire or in the air), or a dry set to change into when you
  // are wet through; null when there is nothing to say
  clothesStatus(e) {
    const left = e && Number.isFinite(e.left) ? e.left : 1;
    if (left <= 0) {
      const d = this.wetSetDrying();
      // (fb4 join: by a fire, what is left of it, not always the 30 min a soaked set takes)
      const fireSec = (d.sec * WET_SET_FIRE_H) / WET_SET_AIR_H;
      return { label: d.byFire ? 'Drying' : 'Wet set', mark: d.byFire ? 'drying' : 'wet', timer: Math.round(d.sec), running: true, until: this.now + d.sec / 3600, next: d.byFire ? `Dry in ${timerWords(d.sec)}: stay by the fire` : `Dries by a lit fire in ${timerWords(fireSec)} (stand within 3 m of it); in the air ${timerWords(d.sec)}, or overnight` };
    }
    const wet = this.live && (this.soaked > 0.25 || !!(this.trip && this.trip.state && this.trip.state.wet));
    if (wet) return { label: 'A dry set', mark: 'ready', next: 'You are wet through: right-click › Change into dry clothes (on foot)' };
    return null;
  }
  changeClothes(e) {
    const c = this.changeCheck(e);
    if (!c.ok) return { ok: false, why: c.why, words: `${c.why[0].toUpperCase()}${c.why.slice(1)}.` };
    this.soaked = 0;
    if (this.trip && this.trip.state) this.trip.state.wet = false;
    this.dryUntil = this.now + DRY_BOOST_HOURS;
    this.wetSetH = 0;
    if (e) { e.left = 0; if (this.inv) this.inv.emit('items'); }
    const words = 'Dry clothes on, the wet ones wrung out and into the bag.'; // (fb5 join: no rate in the line, rule 3)
    this.note(words);
    return { ok: true, why: null, words };
  }
  // the wet set of clothes drying (by a fire, inside a store, in the air): its `left` back to 1 once it is dry
  dryWetSet(dh, fire, inside) {
    const i = this.inv; if (!i || !(dh > 0)) return;
    const hit = i.find('clothes', { reachable: false }).find(({ e }) => Number.isFinite(e.left) && e.left <= 0);
    if (!hit) { this.wetSetH = 0; return; }
    const byFire = fire > 0.3 || inside;
    this.wetSetH += dh * (byFire ? WET_SET_AIR_H / WET_SET_FIRE_H : 1);
    if (this.wetSetH >= WET_SET_AIR_H) { this.wetSetH = 0; delete hit.e.left; i.emit('items'); this.note('The wet clothes are dry again.'); }
  }
  // warmth over dh game hours, and how wet through you are; moving: paddling or walking under way
  passWarmth(dh, wind, moving) {
    const p = this.player, n = this.need, S = this.day.season || {}, swim = p.mode === 'swim';
    const wchill = clamp((WATER_COMFORT - (Number.isFinite(S.waterTemp) ? S.waterTemp : 15)) / WATER_SPAN, 0, 1.4);
    // wading (the owner, 2026-10-31: "if you're just wading, you'll get a little bit cold"): the legs in the lake
    const wade = !swim && (p.mode === 'walk' || p.mode === 'carry') && p.move ? clamp(((p.move.depth || 0) - 0.05) / 0.95, 0, 1) : 0;
    if (wade > 0) this.soaked = Math.max(this.soaked, WADE_SOAK * Math.min(1, wade * 3));
    if (swim && !this.wasIn) n.warmth = Math.max(0, n.warmth - GASP * wchill); // the gasp, going in
    this.wasIn = swim;
    if (swim) this.soaked = 1;
    if (!(dh > 0)) return;
    const inside = this.inside(), fire = inside ? 0 : this.fireHere(), rain = this.rainOn();
    if (!swim) { // the rain soaks you; the air dries you, the sun more, a fire most
      const L = this.day.weather && this.day.weather.look, sun = Math.max(0, this.day.sunDir ? this.day.sunDir.y : 0) * (1 - ((L && L.grey) || 0));
      if (rain > 0.02) this.soaked = Math.min(1, this.soaked + SOAK_H * rain * dh * this.kitMods.soak); // (content C: the rain jacket)
      else this.soaked = Math.max(0, this.soaked - (DRY_H + DRY_SUN_H * Math.min(1, sun * 2) + DRY_FIRE_H * fire + (inside ? 1 : 0)) * dh);
    }
    let loss = 0, gain = 0;
    let wet = 0;
    if (swim) loss = SWIM_COLD_H * wchill;
    else if (inside) gain = INDOOR_H;
    else {
      const t = this.feltTemp(wind); wet = Math.max(this.soaked, this.trip && this.trip.state && this.trip.state.wet ? GEAR_WET : 0);
      if (t < COMFORT) loss = CHILL_H * ((COMFORT - t) / CHILL_SPAN) * (1 + (WET_CHILL - 1) * wet) * (moving ? MOVING_CHILL : 1) * (1 - fire) * this.kitMods.chill; // (content C: the toque)
      else gain = WARM_H * clamp((t - COMFORT) / 8, 0.25, 1) * (1 - 0.5 * wet) * (1 - this.bugMods.comfort); // (cons C: the bugs spoil a warm evening)
      gain += FIRE_H * fire;
      if (wade > 0) loss += WADE_COLD_H * wchill * wade;
    }
    if (this.now < this.dryUntil) gain *= DRY_BOOST; // fb3 B: just changed into dry clothes
    this.chill = Math.max(0, loss - gain);
    this.trend = this.trendOf(gain - loss, { swim, wade, inside, fire, wet });
    n.warmth = clamp(n.warmth + (gain - loss) * dh, 0, 1);
    this.dryWetSet(dh, fire, inside);
  }
  // warmth's way now for the HUD (the owner, 2026-10-31: a heating icon by the fire, a wind icon when it is chilling
  // you): { dir: 1 warming, -1 chilling, 0 holding; why: 'fire' | 'indoors' | 'sun' | 'swim' | 'wade' | 'wet' | 'wind' |
  // 'night' | 'rain' | 'cold'; rate: warmth a game hour; words }
  trendOf(net, { swim, wade, inside, fire, wet }) {
    const full = this.need.warmth >= 0.999;
    if (Math.abs(net) < 0.008 || (net > 0 && full)) return { dir: 0, why: '', rate: 0, words: '' };
    if (net > 0) {
      const why = inside ? 'indoors' : fire > 0.05 ? 'fire' : this.now < this.dryUntil ? 'dry' : 'sun';
      return { dir: 1, why, rate: net, words: { indoors: 'Warming up indoors', fire: 'Warming by the fire', dry: 'Warming in dry clothes', sun: 'Warming in the mild air' }[why] };
    }
    const f = this.felt || { wind: 0, rain: 0, dark: 0 };
    let why = 'cold';
    if (swim) why = 'swim';
    else if (wade > 0.05) why = 'wade';
    else if (wet >= 0.5) why = 'wet';
    else { const top = Math.max(f.wind, f.rain, f.dark); if (top >= 1) why = top === f.wind ? 'wind' : top === f.rain ? 'rain' : 'night'; }
    const words = { swim: 'Chilling fast in the water', wade: 'Chilling: wading in cold water', wet: 'Chilling: wet through', wind: 'Chilling in the wind', rain: 'Chilling in the rain', night: 'Chilling: the night air', cold: 'Chilling: a cold day' }[why];
    return { dir: -1, why, rate: -net, words };
  }
  warmthTrend() { return this.live ? this.trend : { dir: 0, why: '', rate: 0, words: '' }; }
  // how fast each chunk grows, a game hour, eased over GROW_EASE seconds (a jump of the clock, a night, starts afresh)
  trackChunks(dt, dh) {
    const c = {}; for (const k of NEED_KEYS) c[k] = this.chunkOf(k);
    const prev = this.lastChunks; this.lastChunks = c;
    if (!prev || dh > JUMP) { for (const k of NEED_KEYS) this.grow[k] = 0; return; }
    if (!(dh > 0) || !(dt > 0)) return;
    const a = 1 - Math.exp(-dt / GROW_EASE);
    for (const k of NEED_KEYS) this.grow[k] += (clamp((c[k] - prev[k]) / dh, -2, 2) - this.grow[k]) * a;
  }

  // a word, once, when the bottle runs dry or a need runs low (again once it has come back). fb5 E: these are cues; the
  // teaching moments (hints.js, energy.onCue) say them now, the first time in full and later short or not at all, and
  // a word of the bar's own shows only where nothing says them (a test page, Sandbox without the moments)
  cue(id, words) { if (this.onCue) { try { if (this.onCue(id, words)) return; } catch (e) { console.warn('energy.onCue', e); } } this.note(words); }
  needNotes() {
    const n = this.needs, o = this.noted;
    if (this.bottle <= 0.001 && !o.dry) { o.dry = true; this.cue('dry', 'The bottle is dry. Fill it at the water’s edge: E.'); }
    for (const k of ['water', 'food', 'rest', 'warmth']) {
      if (n[k] > LOW + 0.1) { o[k] = false; continue; }
      if (n[k] >= LOW || o[k]) continue;
      o[k] = true;
      this.cue(k, k === 'water' ? 'Thirsty. Drink from your bottle (I).' : k === 'food' ? 'Hungry. Eat from your pack (I).' : k === 'warmth' ? 'Cold. A fire, dry clothes or the sleeping bag.' : 'Tired. Rest in the tent.');
    }
    if (n.rest <= EMPTY && !o.spent) { o.spent = true; this.cue('donein', 'Done in. Only a night’s sleep brings you back now.'); }
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
      if (this.bottle < BOTTLE - 0.001 || this.treating > 0 || this.untreated > 0) this.fill(BOTTLE, 0); // (water: the lake water poured out)
      // (the content join: between trips too: coming in ends the trip, and the thirst you came in with was kept for the
      // next one, so a player who drank at the tap pushed off parched and was nearly spent by noon)
      this.need.water = 1;
    }
    // the effort: what an hour of it costs the rest need (TRAVEL_AWAKE), and whether it is hard (thirst)
    let travel = 0, hard = false;
    const moving = Math.abs(p.speed) > 0.1;
    if (p.mode === 'paddle' && !p.landing && !p.teleporting) {
      const v = Math.abs(p.speed), power = p.canoe.state.power;
      if (power > 0.1 && v > 0.1) {
        let head = 0;
        if (wind) { const f = p.forward, wd = wind.dir; head = Math.max(0, -(f.x * wd.x + f.z * wd.z)) * wind.speed / 6; }
        const g = p.gear, effort = Math.pow(v / (CRUISE * (g ? g.cruise : 1)), 1.5) * (p.input.held('ShiftLeft', 'ShiftRight') ? 1.25 : 1) * (1 + 0.8 * head) * (g ? g.effort : 1); // hubs 2B: a better paddle
        travel = PADDLE_H * effort * power;
        hard = effort * power >= HARD_EFFORT;
      }
    } else if (p.mode === 'carry' || p.mode === 'walk') {
      const kg = p.loadKg || 0;
      if (moving) {
        if (kg > 0) travel = CARRY_H * (kg / LOAD_REF) * (p.mode === 'carry' && p.gear ? p.gear.carry : 1); // hubs 2B: yoke pads under the canoe
        else if (p.mode === 'carry') travel = CARRY_H * (p.loadFactor || 1);
        hard = kg >= HEAVY_KG;
      }
    } else if (p.mode === 'swim') { travel = SWIM_H; hard = true; }
    const fishing = this.fishingNow(); // taste: a fish on the line costs a little, briefly (FISHING)
    if (fishing === 'fight') { travel = Math.max(travel, FISHING.fight); }
    if (travel && day.elevation < DARK_ELEV) travel *= this.kitMods.night; // after dark, by headlamp (content C: the one with you, kit.js)
    this.hard = hard;
    // the needs, over the game hours since the last frame (a jump of the clock longer than JUMP counts as a night)
    let dh = now - this.lastNow; this.lastNow = now;
    if (!(dh > 0) || dh > 24 * 3) dh = 0; // the clock set back (Sandbox), or a reload's leap
    // water: the stomach turns, said once when it does (asleep, in the morning)
    if (!this.upsetSaid && this.upsetNow) { this.upsetSaid = true; this.note(UPSET_WORDS); }
    if (this.live) {
      const jump = dh > JUMP;
      this.passNeeds(dh, jump, !jump && (hard || this.hot), !jump && fishing === 'still' ? FISHING : null); // (taste: sitting to fish is light work)
      this.passWarmth(jump ? 0 : dh, wind, moving && (p.mode === 'paddle' || p.mode === 'walk' || p.mode === 'carry')); // fb2 F
      this.needNotes();
    } else if (dh > 0) this.passNeeds(0); // tablets still finish between trips
    this.trackChunks(dt, dh); // fb2 F: the bar's chunks, growing or not
    // just woken: the bar is up to what the needs allow (a bunk night's breakfast, written just after sleep(), counts)
    if (this.live && now >= this.wokeAt && now - this.wokeAt < WAKE_WINDOW) this.value = Math.max(this.value, this.ceiling);
    // a need run out keeps eating the ceiling until it is met (OUT_H)
    if (this.live) { const n = this.needs, step = dh > 0 && dh <= JUMP ? dh : 0; for (const k of NEED_KEYS) this.out[k] = n[k] <= EMPTY ? this.out[k] + step : 0; }
    // the day's work tires you: travel counts extra hours awake (TRAVEL_AWAKE; the bar itself no longer drains with it)
    if (this.live && travel > 0 && dh > 0 && dh <= JUMP && Number.isFinite(this.awakeSince)) this.awakeSince -= TRAVEL_AWAKE * (travel / PADDLE_H) * dh;
    this.exertion = travel;
    this.updateStamina(dt, moving);
    const cap = this.ceiling;
    if (this.live) {
      // The owner's rule: "if it goes all the way down, you're done". Spent is the ceiling run down to nothing (the needs'
      // chunks fill the bar; 2026-10-31: the green is stamina now). Spent, you have an hour of the clock to stop and
      // put it right (eat, drink, rest, or sleep at a site); still spent after it, someone comes out for you, for
      // whichever need ran you down; it stays spent until the ceiling is back over SPENT_OVER. Nearly spent, a word first.
      if (this.spentAt == null) {
        if (cap <= 0.005) { this.spentAt = now; this.cue('spent', 'Spent. Eat, drink or rest now, or someone comes out for you.'); }
      } else if (cap >= SPENT_OVER) this.spentAt = null;
      else if (now - this.spentAt >= SPENT_GRACE && this.onEvac) { this.spentAt = null; this.onEvac(this.spentWhy()); }
      if (cap > 0.005) {
        if (cap < NEARLY && !this.noted.nearly) { this.noted.nearly = true; this.cue('nearly', 'Nearly spent. Rest, eat or drink soon, or make for a campsite.'); }
        else if (cap > NEARLY + 0.15) this.noted.nearly = false;
      }
    }
    // a gentle word when the pack is empty and the bar low: once, and again only after a while (once a game day on an
    // Adventure, where the bar can sit at 0 for as long as the bottle has water)
    this.warnTimer -= gh;
    if (!this.warning) this.warnTimer = Math.min(this.warnTimer, 0);
    else if (this.warnTimer <= 0) {
      this.warnTimer = this.live ? 24 : 1.8; // game hours: a day on an Adventure
      this.cue('nofood', this.adventure ? 'No food, and not much left in you. Make for an outfitter.' : 'No food and not much left in you. Any outfitter will set you up again, or sit a while.');
    }
  }

  // stamina (2026-10-31), a real second at a time: spent by a jog, paddling hard or a hard swim, back once you ease off,
  // never over the ceiling; winded at 0 until it is back to STAMINA.winded of the ceiling
  hustling(moving) {
    const p = this.player, st = p.canoe && p.canoe.state;
    if (p.teleporting || p.landing || this.winded) return 0;
    if (p.mode === 'paddle') return st && st.hustle && st.drive > 0 && Math.abs(p.speed) > 0.3 ? STAMINA.paddle : 0;
    if (p.mode === 'swim') return p.input.held('ShiftLeft', 'ShiftRight') && Math.abs(p.speed) > 0.3 ? STAMINA.swim : 0;
    if (p.mode === 'walk' || p.mode === 'carry') {
      if (!(st && st.hustle) || !moving) return 0;
      return p.mode === 'carry' || (p.loadKg || 0) >= HEAVY_KG ? STAMINA.carry : STAMINA.jog;
    }
    return 0;
  }
  updateStamina(dt, moving) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.25);
    const cap = this.ceiling, spend = this.hustling(moving);
    let v = this.value;
    if (spend > 0) { v -= spend * dt; this.restT = 0; }
    else {
      this.restT += dt;
      if (this.restT > STAMINA.delay) v += (Math.abs(this.player.speed) < 0.25 ? STAMINA.backStill : STAMINA.back) * dt;
    }
    v = clamp(Math.min(v, cap), 0, 1);
    if (v <= 0.001 && spend > 0) { this.winded = true; v = 0; }
    else if (this.winded && v >= Math.max(0.05, STAMINA.winded * cap)) this.winded = false;
    this.value = v;
  }
  // the stamina as a share of what the needs allow (1: full)
  get staminaShare() { const c = this.ceiling; return c > 0.001 ? clamp(this.value / c, 0, 1) : 0; }

  serialize() {
    return {
      value: this.value, food: this.food, fedUntil: this.fedUntil, awakeSince: this.awakeSince, lastMealAbs: this.lastMealAbs, lastMealKind: this.lastMealKind, lastMealAuto: this.lastMealAuto,
      rest0: this.rest0, need: { ...this.need }, drinkable: this.drinkable, treating: this.treating, readyIn: this.treating > 0 ? Math.max(0, this.readyAt - this.now) : 0,
      soaked: this.soaked, // fb2 F (need.warmth rides in need)
      upsetFor: Math.max(0, this.upsetUntil - this.now), dryFor: Math.max(0, this.dryUntil - this.now), wetSetH: this.wetSetH, // fb3 B
      untreated: this.untreated, upsetIn: Math.max(0, this.upsetAt - this.now), upsetSaid: this.upsetSaid, // water
      spentFor: this.spentAt == null ? null : Math.max(0, this.now - this.spentAt), // game hours spent so far: a reload does not restart the hour
      out: { ...this.out }, // 2026-10-31: the hours each need has been run out
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
    this.dryUntil = this.now + num(d.dryFor, 0); this.wetSetH = num(d.wetSetH, 0); // fb3 B
    // water: the lake water as it comes, and an upset stomach coming or under way. A save from before (no `untreated`)
    // marked a fill with no tablet by its 6 h of upset, drunk or not: that bottle's water is untreated now, and nothing
    // is upset until some of it is drunk
    this.untreated = clamp(num(d.untreated, 0), 0, Math.max(0, BOTTLE - this.drinkable - this.treating));
    if (d.untreated === undefined && num(d.upsetFor, 0) > 0) {
      if (this.treating <= 0.001 && this.drinkable > 0.001) { this.untreated = this.drinkable; this.drinkable = 0; }
      this.upsetAt = this.upsetUntil = -1e9; this.upsetSaid = true;
    } else if (num(d.upsetFor, 0) > 0) { this.upsetAt = this.now + num(d.upsetIn, 0); this.upsetUntil = this.now + num(d.upsetFor, 0); this.upsetSaid = d.upsetSaid !== false; }
    else { this.upsetAt = this.upsetUntil = -1e9; this.upsetSaid = true; }
    if (this.untreated > 0.001) { this.drinkable = 0; this.treating = 0; } // (the whole bottle)
    this.unnote(); const n = this.needs; for (const k of ['rest', 'food', 'water', 'warmth']) this.noted[k] = n[k] < LOW; this.noted.dry = this.bottle <= 0.001;
    this.lastHours = this.day.hours; // the saved clock is back: no dawn or dusk crossed by the reload, no meal
    this.lastNow = this.now;         // and no hours of need passed
    for (const k of NEED_KEYS) this.out[k] = Math.max(0, num(d.out && d.out[k], 0));
    this.winded = false; this.restT = 0;
    this.spentAt = Number.isFinite(d.spentFor) && this.ceiling < SPENT_OVER ? this.now - d.spentFor : null; // the hour of grace carries on
  }
}
