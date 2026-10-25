// The kit (content pass 1, stream C: "item upgrades, different unique items, varied items", the owner, 2026-10-25): what
// the things you have with you do, beyond the numbers shop.js's applyGear puts in player.gear for what you own. Each
// effect is real in code and read in one place by the system it touches (energy.js, fishing.js, camp.js, chores.js,
// fire.js, trip.js read `kit.mods` or call a hook; main.js's `// content C:` block wires them). Nothing here writes a
// standing line: the thing that needs something says so (the stove's own verb, the bugs' moment, the fish lost at the
// side), and the item's tooltip only says what it does to you (items.js).
//
// With you means in reach (inventory.reachable: on you, in a hand, in the canoe you are in or beside, set down within
// 3 m, or anything kept at the outfitters while you are at one); at camp means in the camp's reach (inventory.campReach).
//
//   kit.attach({ player, inventory, energy, fishing, camp, fires, day, weather, wind, hud, profile, lamp, shop, hints })
//   kit.update()              each frame (main.js, after shop.update): what is with you, a few times a second; the lamp
//   kit.mods                  { soak, rainChill, chill, rest, drain, night, bite, snap, bugs } (energy.js, fishing.js)
//   kit.has(id | fn), kit.inCamp(id | fn), kit.bugs() → { level, felt, guard }
//   kit.sleepNight({ bunk, wet }) → { rest, warmth, restAdd, cold, low, rating } | null   (energy.sleep: the bag's night)
//   kit.filterHere() → 'pump' | 'gravity' | 'tablets', kit.filterWait(), kit.fillBottle()   (camp.js's bottle)
//   kit.atTheSide(fish) → words | null   (fishing.js land: a big fish thrown at the side with no net)
//   kit.dryKit() → bool                   (trip.js capsize: the bag and the clothes in a waterproof pack)
//   kit.verb(id, ref) → { enabled, why, needs, next, run } | null   ('stove', 'brew', 'clean', 'sit': inventory.verb's)
//   kit.moments()                          the moments hints.js gets (main.js registers them)
import { itemDef, isBag, FILLET_SHARE, fishKg, NEED } from './items.js';
import { LAMP } from './headlamp.js';
import { FIRE_KIT } from './fire.js';
import { COOK } from './cook.js';
import { PADDLE_LOOKS, ROD_LOOKS, recolor } from './gear.js';
import { clamp, smoothstep } from './rng.js';

const POLL = 0.4;            // real seconds between looks at what is with you
// the headlamps (items.js headlamp2, headlamp3): the beam's reach (m), its brightness (× the cap's), travel after dark
const LAMPS = [['headlamp3', { distance: 55, power: 2.1, night: 1.1 }], ['headlamp2', { distance: 40, power: 1.45, night: 1.2 }]];
const CAP_LAMP = { distance: 30, power: 1, night: 1.3 };
// the bugs (June and July, worst at dusk; real Boundary Waters mosquitoes and blackflies): what they cost unguarded at
// full strength, a game hour, and what a head net or a bug jacket lets through
const BUG = { drain: 0.02, rest: 0.5, net: 0.35, jacket: 0.1, smoke: 0.5 };
const BUG_SEASON = [135, 158, 205, 240]; // day of year: they come mid-May, are at their worst June to mid-July, gone by late August
// the night in the bag (kit.sleepNight): rest and warmth lost per °C the night is colder than the bag is good to
const NIGHT = { restPer: 0.035, restMax: 0.35, warmPer: 0.05, warmMin: 0.45, dampSynth: 2, dampDown: 6, fourseason: 2, site: 0.08 };
const GRAVITY_H = 5 / 60;    // game hours the gravity bag takes to drip a bottle through at the shore
const BREW_L = 0.25;         // litres a cup takes from the bottle
const RING_NEAR = 4;         // m: a lit fire this near heats a cup
const STOVE_K = 0.6;         // the stove cooks a meal in this share of the grate's minutes
const FILLET_MIN = 3;        // game minutes a fish takes to fillet
const SIT_BOOST = 1.6;       // the bar's recovery sat in the canoe chair, over sitting anywhere else
const SIDE = { from: 1.5, to: 5, most: 0.35 }; // kg: a fish this heavy may throw the hook at the side with no net (up to most)

// the new meals' and the fillets' minutes on the grate (cook.js COOK; the stove takes STOVE_K of them)
Object.assign(COOK, {
  'meal:pancakes': { minutes: 12, water: 0.3 },
  'meal:chili': { minutes: 10, water: 0.5 },
  'meal:bannock': { minutes: 15, water: 0.1 },
});
for (const sp of ['walleye', 'pike', 'smallmouth', 'laketrout', 'perch', 'crappie']) COOK[`fillet:${sp}`] = { minutes: 6, water: 0 };

const NETS = (id) => id === 'net' || (itemDef(id) || {}).family === 'net';
const BUG_JACKETS = (id) => (itemDef(id) || {}).family === 'jacket';
const realNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
const bump = (h, c, w) => Math.exp(-(((h - c) / w) ** 2));
const no = (why, needs = [], next = '') => ({ enabled: false, why, needs: needs.filter(Boolean), next, run: () => ({ ok: false, words: why }) });
const go = (run, needs = [], next = '') => ({ enabled: true, why: null, needs: needs.filter(Boolean), next, run });

export class Kit {
  constructor() {
    this.t = {};
    this.mods = { soak: 1, rainChill: 1, chill: 1, rest: 1, drain: 0, night: CAP_LAMP.night, bite: 1, snap: 1, bugs: 0 };
    this.ids = new Set(); this.campIds = new Set(); // what is with you, and at camp, as of the last poll
    this.pollT = 0; this.last = realNow();
    this.bed = null;         // the air at bedtime: { temp, h, grey, at } (the night's low is read from it)
    this.lastNight = null;   // what the bag made of the last night: { low, rating, cold, at }
    this.lostSide = null;    // when a fish last threw the hook at the side (real s), for the moment
    this.filleted = 0;       // fish filleted this session (the moment)
    this.lamp0 = null;
  }
  attach(o = {}) { Object.assign(this.t, o); if (this.t.lamp && !this.lamp0) this.lamp0 = { intensity: LAMP.intensity, distance: this.t.lamp.light ? this.t.lamp.light.distance : LAMP.distance }; return this; }
  get inv() { const i = this.t.inventory; return i && i.attached ? i : null; }

  // --- what is with you ------------------------------------------------------------------------------------------
  poll() {
    const inv = this.inv; this.ids.clear(); this.campIds.clear();
    if (!inv) return;
    try {
      for (const c of inv.reachable()) for (const e of c.grid) if (!e.box) this.ids.add(e.id);
      for (const l of inv.long || []) if (inv.longReachable(l)) this.ids.add(l.id);
      for (const c of inv.campReach()) for (const e of c.grid) if (!e.box) this.campIds.add(e.id);
    } catch (err) { console.warn('kit.poll', err); }
  }
  has(q) { if (typeof q === 'function') { for (const id of this.ids) if (q(id)) return true; return false; } return this.ids.has(q); }
  inCamp(q) { const s = this.campIds.size ? this.campIds : this.ids; if (typeof q === 'function') { for (const id of s) if (q(id)) return true; return false; } return s.has(q); }
  // anywhere you own it (the stash too): the keepers know the brooch whether it is on you or in the crate
  owns(id) { const inv = this.inv; return !!(inv && inv.count(id, { reachable: false }) > 0); }

  // --- each frame ------------------------------------------------------------------------------------------------
  update() {
    const t1 = realNow(), dt = Math.min(0.5, Math.max(0, t1 - this.last)); this.last = t1;
    if ((this.pollT -= dt) <= 0) { this.pollT = POLL; this.poll(); this.recompute(); }
    // the air at bedtime, the moment the night's card goes up (camp.js night)
    const cp = this.t.camp, n = cp && cp.night;
    if (n && !n.kitBed) { n.kitBed = true; const L = this.look(); this.bed = { temp: L ? L.temp : null, h: this.t.day.hours, grey: L ? L.grey || 0 : 0, doy: this.t.day.doy }; }
  }
  look() { const W = this.t.weather || (this.t.day && this.t.day.weather); return W && W.look ? W.look : null; }
  recompute() {
    const m = this.mods, p = this.t.player;
    // the weather: the rain jacket keeps you dry, the toque warm
    const jacket = this.has('rainjacket');
    m.soak = jacket ? 0.15 : 1; m.rainChill = jacket ? 0.4 : 1;
    m.chill = this.has('toque') ? 0.8 : 1;
    // the rod: the lucky cap, the brass reel
    m.bite = this.has('luckycap') ? 1.08 : 1;
    m.snap = this.has('brassreel') ? 1.15 : 1;
    // the bugs and the chair: the bar's drain and its recovery
    const b = this.bugs();
    m.bugs = b.felt;
    m.drain = BUG.drain * b.felt;
    const chair = !!(p && p.seat && p.seat.kind === 'chair' && p.seat.phase === 'seated');
    m.rest = (1 - BUG.rest * b.felt) * (chair ? SIT_BOOST : 1);
    // the headlamp: the best one with you
    let L = CAP_LAMP;
    for (const [id, spec] of LAMPS) if (this.has(id)) { L = spec; break; }
    m.night = L.night; m.lampId = L === CAP_LAMP ? null : LAMPS.find(([, s]) => s === L)[0];
    const lamp = this.t.lamp;
    if (lamp && this.lamp0) { LAMP.intensity = this.lamp0.intensity * L.power; if (lamp.light) lamp.light.distance = L.distance; }
    // the match safe: dry matches catch on less (fire.js woodCount)
    FIRE_KIT.dryBonus = this.inCamp('matchsafe') || this.has('matchsafe') ? 1 : 0;
    this.looks();
  }
  // the paddle in use and the best rod you own, drawn as themselves (gear.js PADDLE_LOOKS, ROD_LOOKS: the paddler's paddle
  // and the rod recoloured in place)
  looks() {
    const pr = this.t.profile, canoe = this.t.canoe, f = this.t.fishing;
    const pid = pr && pr.kit ? pr.kit.paddle : 'ash', pd = itemDef(pid);
    const pl = PADDLE_LOOKS[pid] || (pd && pd.long === 'paddle' && /^sig:/.test(pid) ? PADDLE_LOOKS.ottertail : PADDLE_LOOKS.ash);
    if (canoe && canoe.paddle && pl !== (this.paddleLook || PADDLE_LOOKS.ash)) { recolor(canoe.paddle, this.paddleLook || PADDLE_LOOKS.ash, pl); this.paddleLook = pl; }
    const rid = this.owns('rodpro') ? 'rodpro' : this.owns('rodmh') ? 'rodmh' : 'rod', rl = ROD_LOOKS[rid];
    if (f && f.rod && rl !== (this.rodLook || ROD_LOOKS.rod)) { recolor(f.rod, this.rodLook || ROD_LOOKS.rod, rl); this.rodLook = rl; }
  }

  // --- the bugs: mosquitoes at dusk and dawn in June and July, blackflies by day early on ------------------------
  // level 0..1 where you are now; guard what gets through (the head net, a bug jacket); felt the two together
  bugs() {
    const d = this.t.day, p = this.t.player;
    if (!d || !p) return { level: 0, felt: 0, guard: 1 };
    const [a0, a1, b0, b1] = BUG_SEASON, doy = d.doy, season = smoothstep(a0, a1, doy) * (1 - smoothstep(b0, b1, doy));
    if (season <= 0.01) return { level: 0, felt: 0, guard: 1 };
    const h = d.hours, ss = d.sunriseSunset || {}, set = Number.isFinite(ss.set) ? ss.set : 21, rise = Number.isFinite(ss.rise) ? ss.rise : 5;
    const time = Math.max(bump(h, set + 0.5, 1.2), 0.7 * bump(h, rise + 0.3, 0.9), h > set + 1.5 || h < rise ? 0.45 : 0.18);
    const L = this.look(), temp = L && Number.isFinite(L.temp) ? L.temp : 15, rain = L ? L.rain || 0 : 0;
    const cool = smoothstep(6, 12, temp), wind = this.t.wind ? this.t.wind.speed : 2, calm = 1 - 0.85 * smoothstep(1.5, 5, wind);
    let place = 1;
    const E = this.t.energy;
    if (E && typeof E.inside === 'function' && E.inside()) place = 0;
    else if (p.mode === 'paddle') { const w = this.t.world, s = w && typeof w.shoreAt === 'function' ? -w.shoreAt(p.x, p.z) : 100; place = 0.15 + 0.45 * (1 - smoothstep(15, 80, s)); }
    else if (p.mode === 'swim') place = 0.3;
    const smoke = E && typeof E.fireHere === 'function' ? 1 - BUG.smoke * E.fireHere() : 1;
    const level = clamp(season * time * cool * calm * place * (1 - 0.6 * rain) * smoke, 0, 1);
    const guard = this.has(BUG_JACKETS) ? BUG.jacket : this.has('headnet') ? BUG.net : 1;
    return { level, felt: level * guard, guard };
  }

  // --- the night in the bag --------------------------------------------------------------------------------------
  // the bag with you at camp (the warmest), the pads (the best), the tent, damp gear, and the night's low against what
  // the bag is good to: colder than that, the night rests you less and leaves you colder by morning
  sleepNight({ bunk = false, wet = false } = {}) {
    if (bunk) return null;
    let bag = null, pad = 0;
    for (const id of this.campIds.size ? this.campIds : this.ids) {
      const d = itemDef(id); if (!d) continue;
      if (d.bag && (!bag || d.bag.rating < bag.rating)) bag = d.bag;
      if (Number.isFinite(d.pad)) pad = Math.max(pad, d.pad);
    }
    const restAdd = this.atGuideSite() ? NIGHT.site : 0;
    if (!bag) { this.lastNight = null; return restAdd ? { rest: 1, warmth: null, restAdd, cold: 0 } : null; }
    const pr = this.t.profile, tent = pr && pr.kit ? pr.kit.tent : null;
    const rating = bag.rating - pad - (tent === 'fourseason' ? NIGHT.fourseason : 0) + (wet ? (bag.down ? NIGHT.dampDown : NIGHT.dampSynth) : 0);
    const low = this.nightLow(), cold = Math.max(0, rating - low);
    const out = { rest: 1 - Math.min(NIGHT.restMax, NIGHT.restPer * cold), warmth: Math.max(NIGHT.warmMin, 1 - NIGHT.warmPer * cold), restAdd, cold: +cold.toFixed(1), low: Math.round(low), rating: Math.round(bag.rating) };
    if (wet && bag.down) out.warmth = Math.min(out.warmth, 0.5); // down damp: half as warm
    this.lastNight = { ...out, at: this.t.energy ? this.t.energy.now : 0 };
    return out;
  }
  // °C, the coldest of the night just slept: from the air at bedtime and the day's swing (weather.js airTemp's), else
  // the season's mean night
  nightLow() {
    const b = this.bed, d = this.t.day;
    const swing = (h, grey) => 5.5 * (1 - 0.65 * grey) * Math.sin((2 * Math.PI * (h - 9)) / 24);
    if (b && Number.isFinite(b.temp) && Math.abs(d.doy - b.doy) <= 1) return b.temp - swing(b.h, b.grey) - 5.5 * (1 - 0.65 * b.grey);
    const mean = 2.5 - 16.5 * Math.cos((2 * Math.PI * (d.doy - 25)) / 365.25);
    return mean - 5.5;
  }
  // the camp's site is the one Arvid's map pencils (uniques.js)
  atGuideSite() {
    const u = this.t.uniques, cp = this.t.camp, c = cp && cp.camp;
    if (!u || !c || !this.owns('guidemap') || typeof u.guideSite !== 'function') return false;
    const s = u.guideSite();
    return !!(s && Math.hypot(s.x - c.x, s.z - c.z) < 40);
  }

  // --- the bottle: the filter with you ------------------------------------------------------------------------------
  filterHere() { return this.has('pump') ? 'pump' : this.has('gravity') ? 'gravity' : 'tablets'; }
  filterWait() { const f = this.filterHere(); return f === 'pump' ? 0 : f === 'gravity' ? GRAVITY_H : 0.5; }
  // E at the water's edge (camp.js fillBottle, replaced in main.js): a pump is a few seconds of pumping and the water is
  // drinkable at once; the gravity bag drips it through in a few minutes; else a tablet (camp.js's own way, `base`)
  fillBottle(base) {
    const cp = this.t.camp, e = this.t.energy, f = this.filterHere();
    if (!cp || !e || f === 'tablets') return base ? base(0.5) : undefined;
    if (e.bottle >= 2 - 0.001) { cp.note('The bottle is full.'); return undefined; }
    const say = (w) => { if (cp.audio && cp.audio.paddleDip) cp.audio.paddleDip(); cp.note(w); };
    if (f === 'pump') cp.chore('fill', () => { e.fill(2, 0); say('Pumped full through the filter: drinkable now.'); }, { seconds: 3.2, hours: 4 / 60, say: 'Pumping the bottle full…' });
    else cp.chore('fill', () => { e.fill(2, GRAVITY_H); say('Into the gravity bag: the bottle drips full in 5 min.'); }, { seconds: 0.9, hours: 2 / 60, say: 'Filling the bag…' });
    return undefined;
  }

  // --- fishing ---------------------------------------------------------------------------------------------------
  // a big fish brought to the side thrashes and may throw the hook, with no landing net to get under it
  atTheSide(f) {
    if (!f || this.has(NETS)) return null;
    const w = Number.isFinite(f.weight) ? f.weight : 0, p = SIDE.most * smoothstep(SIDE.from, SIDE.to, w);
    if (!(p > 0) || Math.random() >= p) return null;
    this.lostSide = realNow();
    return 'It thrashed at the side and threw the hook.';
  }

  // --- a capsize: the bag and the clothes in a waterproof pack stay dry ----------------------------------------------
  dryKit() {
    const inv = this.inv; if (!inv) return false;
    let n = 0;
    for (const c of inv.containers) {
      if (c.where === 'stash') continue;
      for (const e of c.grid) {
        if (e.box || !(isBag(e.id) || e.id === 'clothes')) continue;
        n++;
        const d = itemDef(c.item);
        if (!(d && d.dry)) return false;
      }
    }
    return n > 0;
  }

  // --- the verbs: the stove, a cup, the knife, the chair -----------------------------------------------------------
  verb(id, ref) {
    try {
      if (id === 'stove') return this.stoveVerb();
      if (id === 'brew') return this.brewVerb(ref);
      if (id === 'clean') return this.cleanVerb();
      if (id === 'sit') return this.sitVerb(ref);
    } catch (err) { console.warn('kit.verb', id, err); return no('Not now'); }
    return null;
  }
  onFoot() { const p = this.t.player; return !!(p && p.mode === 'walk' && !p.landing && !p.teleporting && !p.seat); }
  pool() { const inv = this.inv; return inv ? inv.campReach() : []; }
  findIn(pool, test) { for (const c of pool) for (const e of c.grid) if (!e.box && test(e, itemDef(e.id), c)) return { c, e }; return null; }
  // the raw meal the stove would cook: supper in the evening, breakfast in the morning, else any
  mealFor(pool) {
    const h = this.t.day ? this.t.day.hours : 12, evening = h >= 14;
    const order = (d) => (!d ? 9 : /breakfast|pancakes|bannock/.test(d.id) ? (evening ? 2 : 0) : (evening ? 0 : 2));
    let best = null;
    for (const c of pool) for (const e of c.grid) { const d = !e.box && itemDef(e.id); if (d && d.kind === 'meal' && d.eat && d.eat.cook && !(e.data && e.data.cooked) && (!best || order(d) < order(best.d))) best = { c, e, d }; }
    return best;
  }
  stoveVerb() {
    const e = this.t.energy, inv = this.inv, pool = this.pool();
    if (!this.onFoot()) return no('On foot', [NEED.step('On foot', false, { chip: 'on foot' })], 'Go ashore first');
    const fuel = inv ? inv.usesLeft('fuel') : 0;
    if (!(fuel > 0)) return no('No fuel', [NEED.qty('Fuel', 0, 1, '', { chip: 'a fuel canister', item: 'fuel' })], 'A fuel canister, in reach: any outfitter’s provisions shelf has them');
    if (!this.findIn(pool, (q) => q.id === 'pot')) return no('No pot', [NEED.step('The pot', false, { chip: 'the pot', item: 'pot' })], 'The pot within reach');
    const m = this.mealFor(pool);
    if (!m) return no('Nothing to cook', [NEED.step('A meal to cook', false, { chip: 'a meal to cook' })], 'A meal from your food, within reach');
    const K = COOK[m.d.id] || COOK['meal:supper'], water = K.water || 0;
    if (water > 0 && e && e.bottle < water - 0.001) return no('Not enough water', [NEED.qty('Water', +e.bottle.toFixed(2), water, 'L', { item: 'bottle' })], 'Fill the bottle at the water first');
    const minutes = Math.max(3, Math.round(K.minutes * STOVE_K));
    return go(() => this.cookOnStove(m, K, minutes), [], `${m.d.name}: ${minutes} min`);
  }
  cookOnStove(m, K, minutes) {
    const cp = this.t.camp, e = this.t.energy, inv = this.inv;
    if (!cp || !inv) return { ok: false, words: 'Not now.' };
    const raw = m.d, out = raw.cooksTo || { 'meal:supper': 'hot:supper', 'meal:breakfast': 'hot:breakfast', 'meal:freeze': 'hot:freeze' }[raw.id] || 'hot:supper';
    cp.chore('stove', () => {
      const hit = inv.findUid ? inv.findUid(m.e.uid) : null;
      if (!hit && !this.mealFor(this.pool())) { cp.note('The meal is gone from where it was.'); return; }
      inv.take((hit || m).c.id, (hit || m).e.uid, 1);
      inv.useOne('fuel');
      if (K.water > 0 && e && !e.sandbox && typeof e.useWater === 'function') e.useWater(K.water);
      const now = e ? e.now : 0, d = itemDef(out), data = { cooked: +now.toFixed(3), until: +(now + ((d && d.keep) || 4)).toFixed(3) };
      const r = inv.toHandNew(out, { data });
      if (!r.ok) inv.place(out, 1, { data, pool: this.pool(), quiet: true });
      inv.emit('items');
      cp.note(`${d ? d.name : 'Supper'}: ready${r.ok ? ', in your hand' : ''}.`);
    }, { seconds: 2.4, hours: minutes / 60, say: 'The stove roars under the pot…', crouch: true });
    return { ok: true, words: '' };
  }
  // a cup of coffee or cocoa: hot water from a lit fire beside you, or the stove (a boil off the canister), and a
  // quarter litre from the bottle
  brewVerb(ref) {
    const inv = this.inv, e = this.t.energy, hit = ref && inv ? inv.refOf(ref) : null;
    const d = hit && hit.e ? itemDef(hit.e.id) : null;
    if (!d || !d.brew) return null;
    if (!this.onFoot()) return no('On foot', [NEED.step('On foot', false, { chip: 'on foot' })], 'Go ashore first');
    const fire = this.fireBeside(), stove = this.has('stove') && inv.usesLeft('fuel') > 0;
    if (!fire && !stove) return no('Needs hot water', [NEED.step('A fire or the stove', false, { chip: 'a fire or the stove' })], 'Stand by a lit fire, or have the stove and its fuel with you');
    if (e && e.drinkable < BREW_L - 0.001) return no('Not enough water', [NEED.qty('Water', +e.drinkable.toFixed(2), BREW_L, 'L', { item: 'bottle' })], 'Fill the bottle first');
    return go(() => this.brew(hit, d, !fire));
  }
  fireBeside() {
    const F = this.t.fires, f = F && F.near, p = this.t.player;
    return !!(f && p && (f.heat || 0) > 0.3 && Math.hypot(f.x - p.x, f.z - p.z) < RING_NEAR);
  }
  brew(hit, d, onStove) {
    const cp = this.t.camp, e = this.t.energy, inv = this.inv;
    if (!cp || !inv) return { ok: false, words: 'Not now.' };
    cp.chore('brew', () => {
      const h = inv.findUid ? inv.findUid(hit.e.uid) : hit; if (!h) return;
      if (onStove) inv.useOne('fuel');
      if (e) e.drinkable = Math.max(0, e.drinkable - BREW_L);
      // a serving off it (the entry's left), the last one takes the thing
      const n = d.servings || 1, left = (Number.isFinite(h.e.left) ? h.e.left : n) - 1;
      if (left > 0) h.e.left = left; else if (h.e.qty > 1) { h.e.qty -= 1; delete h.e.left; } else inv.take(h.c.id, h.e.uid, 1);
      inv.emit('items');
      const B = d.brew, live = e && e.live, morning = this.t.day && this.t.day.hours >= 4 && this.t.day.hours < 11;
      const k = B.morning && !morning ? 0.5 : 1;
      // coffee: you feel as if you had been up a couple of hours less (the rest need's ceiling, energy.js restCeiling)
      if (live && B.rest && Number.isFinite(e.awakeSince)) e.awakeSince = Math.min(e.now, e.awakeSince + B.rest * k * 30);
      if (live && B.warm) e.needs.warmth = Math.min(1, e.needs.warmth + B.warm);
      if (live && B.food) e.needs.food = Math.min(1, e.needs.food + B.food);
      if (e && B.lift) e.lift(B.lift * k);
      if (live) e.need.water = Math.min(1, e.need.water + BREW_L / (4 / 3)); // a cup is a drink too (energy.js BODY)
      cp.note(d.id === 'coffee' ? (morning ? 'Coffee, hot, on a cold morning rock. The day starts making sense.' : 'A cup of coffee.') : 'Hot cocoa. The warmth goes right down to the feet.');
    }, { seconds: 1.6, hours: onStove ? 0.1 : 0.08, say: onStove ? 'The stove hisses under a cup…' : 'A cup by the fire…', crouch: true });
    return { ok: true, words: '' };
  }
  // the knife: every whole raw fish with you, filleted (lighter, quicker on the grate); the fillets go where food goes
  cleanVerb() {
    if (!this.onFoot()) return no('On foot', [NEED.step('On foot, ashore', false, { chip: 'ashore' })], 'Go ashore first');
    const fish = this.wholeFish();
    if (!fish.length) return no('No fish to fillet', [NEED.step('A fish', false, { chip: 'a fish' })], 'Catch one first');
    return go(() => this.fillet(fish), [], `${fish.length} fish: ${fish.length * FILLET_MIN} min`);
  }
  wholeFish() {
    const inv = this.inv, out = []; if (!inv) return out;
    for (const c of inv.campReach()) for (const e of c.grid) { const d = !e.box && itemDef(e.id); if (d && d.kind === 'fish' && !d.fillet && !(e.data && e.data.cooked) && /^fish:/.test(e.id)) out.push({ c, e, d }); }
    return out;
  }
  fillet(list) {
    const cp = this.t.camp, inv = this.inv;
    if (!cp || !inv) return { ok: false, words: 'Not now.' };
    cp.chore('clean', () => {
      let n = 0;
      for (const f of this.wholeFish()) {
        const sp = f.d.species || f.e.id.slice(5), id = `fillet:${sp}`; if (!itemDef(id)) continue;
        const len = f.e.data && f.e.data.length, kg = +(fishKg(sp, len) * FILLET_SHARE).toFixed(2);
        const data = { ...(f.e.data || {}), cleaned: true, kg, from: f.e.id };
        inv.take(f.c.id, f.e.uid, 1);
        const prefer = inv.campReach().filter((c) => c.item !== 'stringer' && /barrel|pack/.test(c.item)).sort((a, b) => /barrel/.test(b.item) - /barrel/.test(a.item)).map((c) => c.id);
        const r = inv.place(id, 1, { prefer, data, quiet: true, exclude: inv.campReach().filter((c) => c.item === 'stringer').map((c) => c.id) });
        if (!r || !r.ok) inv.toHandNew(id, { data });
        n++;
      }
      this.filleted += n;
      inv.emit('items');
      cp.note(n ? `${n === 1 ? 'Filleted' : `${n} fish filleted`}: the fillets are in with the food.` : 'Nothing to fillet.');
    }, { seconds: 1.2 + 0.7 * list.length, hours: (FILLET_MIN * list.length) / 60, say: 'Filleting…', crouch: true });
    return { ok: true, words: '' };
  }
  // the chair: set down (or in reach), you sit in it where you stand; sat in it the bar comes back SIT_BOOST faster
  sitVerb(ref) {
    const p = this.t.player, inv = this.inv;
    if (p && p.seat) return no('Sitting already', [], 'E or a move key stands you up');
    if (!this.onFoot()) return no('On foot', [NEED.step('On foot', false, { chip: 'on foot' })], 'Go ashore first');
    const hit = ref && inv ? inv.refOf(ref) : null, c = hit && hit.c, r = c && inv.root ? inv.root(c) : null;
    const at = r && r.where === 'ground' && r.at ? r.at : null;
    return go(() => {
      // set down: you sit in it where it stands (walked to in front of it); else it is unfolded where you are
      const x = at ? at.x : p.x, z = at ? at.z : p.z, heading = at && Number.isFinite(at.heading) ? at.heading : p.heading;
      const ok = p.sitAt({ seat: { x, z, y: p.groundAt(x, z) + 0.3 }, heading, ...(at ? {} : { stand: { x: p.x, z: p.z } }), kind: 'chair', id: 'chair' });
      return ok ? { ok: true, words: '' } : { ok: false, words: 'Not here.' };
    });
  }

  // --- the moments (hints.js MOMENTS, their triggers): the bugs, a fish at the side, a cold night, the fish remains ---
  moments() {
    return [
      { id: 'bugs', prio: 2, recur: 'while', text: 'Mosquitoes. Wind, smoke or a head net keeps them off.', short: 'Bugs.',
        due: (rec) => { const f = this.mods.bugs; return (rec && rec.ep ? f > 0.22 : f >= 0.4) ? 1 - f : false; } },
      { id: 'side', prio: 1, recur: 'once', text: 'Big fish thrash at the side. A landing net holds them.',
        due: () => !!(this.lostSide && realNow() - this.lostSide < 25) },
      { id: 'coldnight', prio: 2, recur: 'once',
        due: () => { const n = this.lastNight, e = this.t.energy; if (!n || !(n.cold >= 2) || !e || e.now - n.at > 2) return false; return { lv: 1, text: `A cold night: the bag is good to ${n.rating} °C, and it went to ${n.low}.` }; } },
      { id: 'remains', prio: 1, recur: 'once', text: 'Fish remains: well back from shore and camp, where bears won’t find them.',
        due: () => this.filleted > 0 },
    ];
  }
}

export const kit = new Kit();
