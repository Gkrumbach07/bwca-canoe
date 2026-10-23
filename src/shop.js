// The shop (hubs phase 2, stream B): what an outfitter sells, at that outfitter's prices, and what the gear does.
//
// CATALOG is everything on the shelves (the hubs plan's table): { id, name, kind, price, kg, words, effect } and, where
// it has one, the slot it takes in the kit (canoe, paddle, tent, filter: one in use, the rest on the rack) and the
// family it belongs to (two of one family do not stack: the best of each counts). kind is where it sits in the store:
// 'food' (the provisions shelf: food, suppers, the barrel and the water), 'tackle' (the tackle shelf: the rod and the
// bait), 'lure' (the pegboard lure wall), 'gear' (the gear shelf and the rafters: paddles, canoes, packs, tents, the
// saw and the camera), 'counter' (a night in the bunkhouse) and 'map' (the map sheets, sold at the counter: the
// outfitter's own sheet and its neighbours, from stream D's sheets.js). The words are the keeper's: what a thing does,
// never a number past the price and the weight. Each outfitter adds its own signature item (stream C's outfitters.js),
// and its prices are the table's × that outfitter's priceMul (×0.9 more at standing 3).
//
// What the gear does is small and felt, in player.gear, which player.js, energy.js, packs.js, camp.js and fishing.js
// each read in one line (with these defaults the game plays as it did before the shop):
//   { cruise: 1, effort: 1, stability: 1, carry: 1, sleep: 0.85, sleepDry: false, snap: 1, saw: false,
//     filter: 'tablets', camera: false, canoeKg: 34, foodRoom: 7 }
// cruise scales the canoe's top speed, effort what the paddle costs, stability the sea a hull can take broadside before
// it rolls, carry what a portage with the canoe costs, sleep the night's quality (the tent, plus a pad), sleepDry a
// tent that dries the gear overnight, snap how long a line holds in the red, canoeKg the hull on the portages and
// foodRoom the days of food the packs hold (a pack 7, a second pack 10 more, the barrel 14 in place of the pack's 7).
//
// The tackle box: the lures you own are the ones the rod can tie on (1–7 with the rod up; one not in the box is
// refused, and quiet on the strip). A snapped line loses that lure (fishing.js calls onSnap), never the last jig;
// a dozen leeches last a dozen fish on the bobber. A freeze-dried supper makes the dusk meal hot without a fire; the
// gravity filter keeps the bottle full at a pitched camp. Its own bits are saved in `bwca-canoe:shop`.
//
//   shop.stock(ep) → items priced for that outfitter, each { ...item, price, owned, inUse, afford, count }
//   shop.buy(id, ep) → { ok, why, words }       (through profile.spend and profile.give; slot items are equipped)
//   shop.equip(id) → bool                       (profile.use: the canoe, paddle, tent or filter in use)
//   shop.price(id, ep), shop.priceMul(ep), shop.outfitterProfile(ep), shop.keeperLine(ep, situation)
//   applyGear(profile, player) → player.gear
import { ITEMS } from './profile.js';
import { LURES, SPECIES } from './fishing.js';
import { save } from './save.js';

const NS = 'shop';
export const SHEET_PRICE = 8;
const DOZEN = 12;
const STANDING_DEAL = 3;   // standing at which an outfitter's prices drop
const DEAL = 0.9;
const CAMP_REACH = 40;     // metres from your pitched tent within which the gravity bag keeps the bottle full

// The other streams' modules, when they are in the build (C: the outfitters' characters; D: the map sheets). Loaded
// lazily so this file builds and runs without them, and so nothing they import is read before it is ready.
const LATER = import.meta.glob(['./outfitters.js', './sheets.js']);

export const GEAR0 = Object.freeze({ cruise: 1, effort: 1, stability: 1, carry: 1, sleep: 0.85, sleepDry: false, snap: 1, saw: false, filter: 'tablets', camera: false, canoeKg: 34, foodRoom: 7 });

// Two more lures on the wall: the tackle the plan names as new. Each species reads a lure by its id, so every one of
// them gets a word for these two (fishing.js rateFor).
if (!LURES.some((l) => l.id === 'silverminnow')) {
  LURES.push(
    { id: 'silverminnow', name: 'Silver Minnow', short: 'Silver Minnow', sink: 0.45, run: 0.8, still: 0.2, slow: 1.05, fast: 0.95, colour: 0xc9ced2, weedless: true },
    { id: 'lazyike', name: 'Lazy Ike', short: 'Lazy Ike', sink: -0.3, run: 2.6, still: 0.15, slow: 1.15, fast: 0.8, colour: 0xd99a3a },
  );
  const add = { walleye: [0.5, 1.35], smallmouth: [0.85, 1.0], pike: [1.6, 0.9], laketrout: [0.3, 0.6], crappie: [0.3, 0.45], perch: [0.4, 0.45] };
  for (const [id, sp] of Object.entries(SPECIES)) { const [m, z] = add[id] || [0.5, 0.5]; sp.lures.silverminnow ??= m; sp.lures.lazyike ??= z; }
}
// the rod's lures as the keeper says them
const LURE_WORD = { jig: 'jig', spinner: 'Mepps', spoon: 'Daredevle', crankbait: 'Rapala', leech: 'leech', silverminnow: 'Silver Minnow', lazyike: 'Lazy Ike' };
const lureWord = (def) => (def ? LURE_WORD[def.id] || lower(def.name) : 'lure');
// the profile's items that are the rod's lures, by fishing.js's lure id
export const LURE_ITEM = { jig: 'lure:jig', spinner: 'lure:mepps', spoon: 'lure:daredevle', crankbait: 'lure:rapala', leech: 'leeches', silverminnow: 'lure:silverminnow', lazyike: 'lure:lazyike' };

// What the season starts with and what was always there: in the kit, never on a shelf.
const BASE = {
  aluminium: { id: 'aluminium', name: 'Aluminium canoe, 17 ft', kind: 'gear', price: 0, kg: 34, slot: 'canoe', words: 'The old aluminium seventeen-footer. Dents and all, it floats.', effect: { canoeKg: 34 } },
  ash: { id: 'ash', name: 'Ash paddle', kind: 'gear', price: 0, kg: 1.1, slot: 'paddle', words: 'A plain ash beavertail. It gets you there.', effect: {} },
  pack: { id: 'pack', name: 'Duluth pack', kind: 'gear', price: 0, kg: 2, family: 'pack', words: 'Canvas and leather, room for a week of food.', effect: {} },
  aframe: { id: 'aframe', name: 'A-frame tent', kind: 'gear', price: 0, kg: 3, slot: 'tent', words: 'Two poles and a fly. It sags when it rains.', effect: { sleep: 0.85 } },
};

export const CATALOG = [
  // --- the provisions shelf --------------------------------------------------------------------------------------
  { id: 'food', name: 'A day of food', kind: 'food', price: 6, kg: 0.9, use: 'food', words: 'Oatmeal for the morning and a supper of rice and lentils, bagged for the trail.' },
  { id: 'supper', name: 'Freeze-dried supper', kind: 'food', price: 5, kg: 0.2, use: 'supper', words: 'Boil the water, pour it in, wait. A hot supper on a night you can’t get a fire going.' },
  { id: 'barrel', name: 'Food barrel and harness', kind: 'food', price: 35, kg: 3, family: 'barrel', words: 'A blue barrel on a pack harness. The food rides dry and sealed, and twice what a pack will hold.', effect: {} },
  { id: 'tablets', name: 'Purifying tablets', kind: 'food', price: 2, kg: 0.05, slot: 'filter', words: 'A tablet in the bottle and half an hour’s wait. Cheap, and they always work.', effect: { filter: 'tablets' } },
  { id: 'pump', name: 'Pump filter', kind: 'food', price: 35, kg: 0.4, slot: 'filter', words: 'Pump it full at the shore and drink it then and there. No waiting on a tablet.', effect: { filter: 'pump' } },
  { id: 'gravity', name: 'Gravity filter', kind: 'food', price: 55, kg: 0.5, slot: 'filter', words: 'Hang the bag in a tree at camp and the bottle fills itself while you see to the fire.', effect: { filter: 'gravity' } },
  // --- the tackle shelf ------------------------------------------------------------------------------------------
  { id: 'leeches', name: 'A dozen leeches', kind: 'tackle', price: 4, kg: 0.3, use: 'bait', words: 'Fresh from the bait fridge, for the bobber rig. A walleye can’t leave one alone.' },
  { id: 'rod', name: 'Medium-heavy rod', kind: 'tackle', price: 45, kg: 0.5, family: 'rod', words: 'A stiffer rod and heavier line. A big pike can make his run and you’ll still have him.', effect: { snap: 1.4 } },
  // --- the lure wall ---------------------------------------------------------------------------------------------
  { id: 'lure:jig', name: 'Jig & twister tail', kind: 'lure', price: 3, kg: 0.01, words: 'A lead head and a curly tail. Hop it along the bottom for walleye.' },
  { id: 'lure:mepps', name: 'Mepps spinner', kind: 'lure', price: 6, kg: 0.01, words: 'The blade throws the light. Cast it along the weed edge and the bass come up for it.' },
  { id: 'lure:daredevle', name: 'Red-and-white Daredevle', kind: 'lure', price: 7, kg: 0.02, words: 'The spoon every pike in the country knows. Let it flutter down off a drop-off.' },
  { id: 'lure:rapala', name: 'Jointed Rapala', kind: 'lure', price: 12, kg: 0.02, words: 'A balsa minnow that swims deep on a steady crank. Trout and walleye both.' },
  { id: 'lure:silverminnow', name: 'Johnson Silver Minnow', kind: 'lure', price: 8, kg: 0.02, words: 'A weedless spoon. Drag it right through the cabbage where the pike lie.' },
  { id: 'lure:lazyike', name: 'Lazy Ike', kind: 'lure', price: 9, kg: 0.02, words: 'An old banana plug with a lazy wobble. Walleye in the dark-water lakes like it slow.' },
  // --- the gear shelf and the rafters ----------------------------------------------------------------------------
  { id: 'bentshaft', name: 'Bent-shaft laminate paddle', kind: 'gear', price: 40, kg: 0.9, slot: 'paddle', words: 'A bent-shaft laminate: easier on the shoulders, a touch quicker.', effect: { cruise: 1.05, effort: 0.95 } },
  { id: 'carbon', name: 'Carbon bent-shaft paddle', kind: 'gear', price: 110, kg: 0.5, slot: 'paddle', words: 'Carbon, bent at the throat and next to no weight. You’ll feel it by the second lake.', effect: { cruise: 1.09, effort: 0.9 } },
  { id: 'royalex', name: 'Royalex Prospector, 16 ft', kind: 'gear', price: 160, kg: 29, slot: 'canoe', words: 'Wide and forgiving. It shrugs off a beam sea, though it’s a little slower to push.', effect: { canoeKg: 29, stability: 1.3, cruise: 0.97 } },
  { id: 'kevlar', name: 'Kevlar tripper, 17 ft', kind: 'gear', price: 240, kg: 20, slot: 'canoe', words: 'Light enough to carry one-handed down the dock, and she runs a little quicker.', effect: { canoeKg: 20, cruise: 1.04 } },
  { id: 'pack2', name: 'A second Duluth pack', kind: 'gear', price: 25, kg: 2, family: 'pack2', words: 'Room for more days of food, and the old double portage: the gear one trip, the food the next.', effect: {} },
  { id: 'yokepads', name: 'Portage yoke pads', kind: 'gear', price: 15, kg: 0.4, family: 'yoke', words: 'Foam pads for the yoke. The canoe sits easier on the neck over a long carry.', effect: { carry: 0.85 } },
  { id: 'dome', name: 'Dome tent', kind: 'gear', price: 50, kg: 2.8, slot: 'tent', words: 'Stands up to the wind off the lake. You’ll sleep the whole night through.', effect: { sleep: 1 } },
  { id: 'fourseason', name: 'Four-season tent', kind: 'gear', price: 95, kg: 3.6, slot: 'tent', words: 'A good night in any weather, and room in the vestibule to hang the wet things: dry by morning.', effect: { sleep: 1, sleepDry: true } },
  { id: 'pad', name: 'Sleeping pad', kind: 'gear', price: 30, kg: 0.6, family: 'pad', words: 'Foam between you and the cold ground. A better night in any tent.', effect: { sleepAdd: 0.05 } },
  { id: 'saw', name: 'Folding saw', kind: 'gear', price: 18, kg: 0.4, family: 'saw', words: 'For the dead and down wood. An armful in no time at all.', effect: { saw: true } },
  { id: 'camera', name: 'Camera, 35 mm', kind: 'gear', price: 25, kg: 0.6, family: 'camera', words: 'A good little camera and a roll of film. The magazines pay for a sharp picture.', effect: { camera: true } },
  // --- at the counter -------------------------------------------------------------------------------------------
  { id: 'bunk', name: 'A night in the bunkhouse', kind: 'counter', price: 8, kg: 0, use: 'bunk', words: 'A real bed, soup on the stove and breakfast in the morning.' },
];
const BY_ID = new Map(CATALOG.map((it) => [it.id, it]));
// the lure wall's order, for the shelves
export const SHELVES = [
  { kind: 'food', name: 'Provisions', sub: 'food and water' },
  { kind: 'tackle', name: 'Tackle', sub: 'the rod and the bait' },
  { kind: 'gear', name: 'Gear', sub: 'paddles, canoes, packs and tents' },
];

// Register the catalogue with the profile's items (profile.js ITEMS: the label, the slot, a note), so the kit, the
// journal's Gear tab and profile.use know them. What the profile already has keeps its own label.
function register(it) {
  const have = ITEMS[it.id];
  if (have) { if (it.slot && !have.slot) have.slot = it.slot; return; }
  const e = it.effect || {};
  ITEMS[it.id] = { label: it.name, ...(it.slot ? { slot: it.slot } : {}), ...(Number.isFinite(e.sleep) ? { sleep: e.sleep } : {}), note: it.note || shortWords(it) };
}
const NOTE = { bentshaft: 'easier on the shoulders, a touch quicker', carbon: 'light and quick', royalex: 'steady in a sea', kevlar: '20 kg on the portages', pack2: 'room for more food; two carries',
  barrel: 'two weeks of food', yokepads: 'an easier carry', dome: 'a whole night’s sleep', fourseason: 'sleeps well; dries the gear', pad: 'a better night', pump: 'drinkable at once', gravity: 'fills itself at camp',
  rod: 'the line holds longer', saw: 'firewood in no time', camera: 'for the photo notices', 'lure:silverminnow': 'weedless', 'lure:lazyike': 'walleye, slow' };
function shortWords(it) { return NOTE[it.id] || ''; }
for (const it of [...Object.values(BASE), ...CATALOG]) if (!it.use) register(it);

// --- what the gear does ---------------------------------------------------------------------------------------------
// the better way for each field that stacks across families, and is the best of one within it
const BETTER = { cruise: 'max', stability: 'max', snap: 'max', effort: 'min', carry: 'min', sleepAdd: 'max' };
const MULT = ['cruise', 'effort', 'stability', 'carry', 'snap'];
let signatures = null;   // stream C's SIGNATURES (id → item), once its module is in
export function itemOf(id) {
  return BY_ID.get(id) || BASE[id] || (signatures && signatures[id]) || null;
}
// player.gear from what is owned and in use: the slot items in use (a spare on the rack does nothing), every other
// owned item, one per family (the best value of each field), multiplied across families; sleep is the tent's quality
// plus the pads and blankets, never past 1; the food room is the packs' and the barrel's.
export function applyGear(profile, player) {
  const g = { ...GEAR0 };
  if (profile) {
    const kit = profile.kit, fam = new Map();
    for (const id of profile.owned) {
      const it = itemOf(id); if (!it) continue;
      if (it.slot && kit[it.slot] !== id) continue;
      const e = it.effect || {};
      if (it.slot === 'canoe' && Number.isFinite(e.canoeKg)) g.canoeKg = e.canoeKg;
      if (it.slot === 'tent' && Number.isFinite(e.sleep)) g.sleep = e.sleep;
      if (it.slot === 'filter' && e.filter) g.filter = e.filter;
      if (e.sleepDry) g.sleepDry = true;
      if (e.saw) g.saw = true;
      if (e.camera) g.camera = true;
      const f = it.family || it.slot || id, best = fam.get(f) || {};
      for (const k in BETTER) if (Number.isFinite(e[k])) best[k] = best[k] === undefined ? e[k] : BETTER[k] === 'max' ? Math.max(best[k], e[k]) : Math.min(best[k], e[k]);
      fam.set(f, best);
    }
    let add = 0;
    for (const best of fam.values()) { for (const k of MULT) if (best[k] !== undefined) g[k] *= best[k]; if (best.sleepAdd) add += best.sleepAdd; }
    g.sleep = Math.min(1, g.sleep + add);
    g.foodRoom = (profile.has('barrel') ? 14 : 7) + (profile.has('pack2') ? 10 : 0);
    for (const k of MULT) g[k] = +g[k].toFixed(4);
  }
  if (player) player.gear = g;
  return g;
}

// --- the shop -------------------------------------------------------------------------------------------------------
export class Shop {
  // world, player, profile (profile.js), energy, fishing, day, hud, camp (camp.js); outfitter (outfitter.js) sets itself
  constructor({ world, player, profile, energy = null, fishing = null, day = null, hud = null, camp = null }) {
    this.world = world; this.player = player; this.profile = profile; this.energy = energy; this.fishing = fishing; this.day = day; this.hud = hud; this.camp = camp;
    this.outfitter = null;
    this.C = null; this.D = null; // stream C's outfitters.js and stream D's sheets.js, when they are in
    this.cache = new Map();       // ep → the outfitter's profile (C's, or the plain one)
    const s = save.read(NS);
    this.s = { v: 1, suppers: 0, leeches: DOZEN, ...(s && s.v === 1 ? s : {}) };
    this.lastLure = 0; this.lastSupper = -1e9; this.gravityAt = -1e9; this.fishSeen = fishing ? fishing.log.length : 0; this.mealSeen = energy ? energy.lastMealAbs : -1e9;
    if (fishing) fishing.onSnap = (def, fish) => this.onSnap(def, fish);
    if (profile) profile.onChange((what) => { if (what === 'season') this.newSeason(); this.apply(); });
    this.apply();
    for (const [path, load] of Object.entries(LATER)) {
      load().then((m) => {
        if (path.includes('outfitters')) { this.C = m; signatures = m.SIGNATURES || null; if (signatures) for (const it of Object.values(signatures)) register(it); this.cache.clear(); }
        else { this.D = m; if (Array.isArray(m.SHEETS) && typeof m.sheetItem === 'function') for (const sh of m.SHEETS) { const it = m.sheetItem(sh.id); if (it) register(it); } }
        this.apply();
        if (this.outfitter && this.outfitter.open) this.outfitter.render();
      }, (e) => console.warn('shop: could not load', path, e));
    }
  }
  write() { save.write(NS, this.s); }
  newSeason() { this.s = { v: 1, suppers: 0, leeches: DOZEN }; this.write(); }
  apply() { return applyGear(this.profile, this.player); }
  get gear() { return this.player.gear || this.apply(); }
  get money() { return this.profile ? this.profile.money : 0; }
  get suppers() { return this.s.suppers || 0; }
  get leeches() { return this.profile && this.profile.has('leeches') ? Math.max(0, Math.min(DOZEN, this.s.leeches ?? DOZEN)) : 0; }

  // --- the outfitter's character (stream C), or a plain one -----------------------------------------------------
  landing(ep) { const o = this.outfitter; return o ? o.landing(Number(ep)) : null; }
  outfitterProfile(ep) {
    const n = Number(ep);
    if (this.cache.has(n)) return this.cache.get(n);
    let op = null;
    const C = this.C;
    if (C && typeof C.outfitterProfile === 'function') { try { op = C.outfitterProfile(n, this.world); } catch (e) { console.warn('shop: outfitterProfile', n, e); } }
    if (!op) { const l = this.landing(n); op = { ep: n, name: l ? l.name : `Entry point ${n}`, kind: null, keeper: null, priceMul: 1, signature: null }; }
    this.cache.set(n, op);
    return op;
  }
  // the keeper's words for a moment ('welcome', 'stranger', 'season', 'passing', 'morning', 'after', 'bunk', 'hello',
  // 'goodbye', 'chat', 'ride'), or null for the counter's own lines
  keeperLine(ep, situation) {
    const C = this.C; if (!C || typeof C.keeperLine !== 'function') return null;
    const rep = this.profile && ep != null ? this.profile.outfitter(ep).rep : 0, doy = this.day ? this.day.doy : undefined;
    try { return C.keeperLine(this.outfitterProfile(ep), situation, { rep, doy }) || null; } catch { return null; }
  }
  keeperName(ep) { const op = this.outfitterProfile(ep), k = op && op.keeper; return k && k.name ? k.name : null; }
  // the outfitter's signature item, sold only there
  signature(ep) {
    const C = this.C, op = this.outfitterProfile(ep);
    let it = null;
    if (C && typeof C.signatureItem === 'function') { try { it = C.signatureItem(Number(ep), this.world); } catch { it = null; } }
    if (!it && op && op.signature && signatures) it = signatures[op.signature] || null;
    if (!it) return null;
    if (!ITEMS[it.id]) register(it);
    const kind = ['food', 'tackle', 'lure', 'gear'].includes(it.kind) ? it.kind : it.lure || it.family === 'spoon' ? 'lure' : it.family === 'net' || it.family === 'rod' ? 'tackle' : 'gear';
    return { ...it, kind, signature: true };
  }

  // --- prices ---------------------------------------------------------------------------------------------------
  priceMul(ep) {
    const op = this.outfitterProfile(ep), m = op && Number.isFinite(op.priceMul) ? op.priceMul : 1;
    const rep = this.profile && ep != null ? this.profile.outfitter(ep).rep : 0;
    return m * (rep >= STANDING_DEAL ? DEAL : 1);
  }
  // Sandbox has no limits: the shelves are free there, as its food and its rides are
  get free() { const o = this.outfitter, t = o && o.core; return !!(t && t.sandbox); }
  priceOf(it, ep) { return it.price > 0 && !this.free ? Math.max(1, Math.round(it.price * this.priceMul(ep))) : 0; }
  price(id, ep) {
    if (String(id).startsWith('sheet:')) return this.free ? 0 : Math.max(1, Math.round(SHEET_PRICE * this.priceMul(ep)));
    const it = itemOf(id) || (this.signature(ep) && this.signature(ep).id === id ? this.signature(ep) : null);
    return it ? this.priceOf(it, ep) : 0;
  }

  // --- the stock ------------------------------------------------------------------------------------------------
  // what an outfitter has on its shelves, priced there: the catalogue, its signature item and the map sheets of its
  // own country, each with whether you own it, have it in use, can afford it, and how many you have of a consumable
  stock(ep) {
    const pr = this.profile, kit = pr ? pr.kit : {}, money = this.money;
    const out = [];
    const add = (it) => {
      const price = this.priceOf(it, ep);
      const owned = !it.use && !!(pr && pr.has(it.id));
      const count = it.use === 'supper' ? this.suppers : it.use === 'bait' ? this.leeches : undefined;
      out.push({ ...it, price, owned, inUse: !!(owned && it.slot && kit[it.slot] === it.id), afford: price <= money, count });
    };
    for (const it of CATALOG) add(it);
    const sig = this.signature(ep);
    if (sig) add(sig);
    for (const s of this.sheetsFor(ep)) add(s);
    return out;
  }
  // the map sheets an outfitter stocks: the sheet its landing is on, and the sheets around it (stream D's sheets.js)
  sheetsFor(ep) {
    const D = this.D, l = this.landing(ep);
    if (!D || !l) return [];
    if (typeof D.stockFor === 'function' && typeof D.sheetItem === 'function') { // D's own stock: the landing's sheet, then its neighbours within reach
      let list = [];
      try { list = D.stockFor({ x: l.x, z: l.z }) || []; } catch { list = []; }
      return list.map((s, i) => { const it = D.sheetItem(s.id || s); return it ? { ...it, kind: 'map', here: i === 0 } : null; }).filter(Boolean);
    }
    if (typeof D.sheetAt !== 'function') return [];
    const home = D.sheetAt(l.x, l.z); if (!home) return [];
    const all = Array.isArray(D.SHEETS) ? D.SHEETS : D.SHEETS && typeof D.SHEETS === 'object' ? Object.values(D.SHEETS) : [];
    const idOf = (s) => (s && (s.id ?? s.no ?? s.key)), found = new Map([[String(idOf(home)), home]]);
    if (typeof D.neighbours === 'function') { for (const s of D.neighbours(idOf(home)) || []) { const t = typeof s === 'object' ? s : all.find((q) => String(idOf(q)) === String(s)); if (t) found.set(String(idOf(t)), t); } }
    else {
      const b = boundsOf(home);
      if (b) for (const s of all) { const q = boundsOf(s); if (q && q.x0 <= b.x1 + 1 && q.x1 >= b.x0 - 1 && q.z0 <= b.z1 + 1 && q.z1 >= b.z0 - 1) found.set(String(idOf(s)), s); }
      else for (const r of [9000, 18000]) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, s = D.sheetAt(l.x + Math.cos(a) * r, l.z + Math.sin(a) * r); if (s) found.set(String(idOf(s)), s); }
    }
    return [...found.values()].map((s) => {
      const id = String(idOf(s)), own = idOf(s) === idOf(home);
      return { id: `sheet:${id}`, sheet: id, name: s.name || s.title || `Sheet ${id}`, kind: 'map', price: SHEET_PRICE, kg: 0.05, here: own,
        words: own ? 'The sheet this landing is on: every campsite, every portage in rods, and the depths.' : 'The country next door: its campsites, its portages in rods, and the depths.' };
    });
  }

  // --- buying and using ---------------------------------------------------------------------------------------------
  // Buy one thing at an outfitter: refused when you own it already, when it is not stocked there, or when you are
  // short; otherwise paid through profile.spend and given through profile.give, and a canoe, a paddle, a tent or a
  // filter goes straight into use. Food and the bunk are the counter's own (outfitter.js); the supper and the
  // leeches are counted here. { ok, why: 'owned' | 'stock' | 'short' | 'counter', words }
  buy(id, ep) {
    const pr = this.profile; if (!pr) return { ok: false, why: 'stock', words: 'Nothing to buy with.' };
    const it = this.stock(ep).find((s) => s.id === id);
    if (!it) return { ok: false, why: 'stock', words: 'Not on these shelves.' };
    if (it.use === 'food' || it.use === 'bunk') return { ok: false, why: 'counter', words: 'Ask at the counter.' };
    if (it.owned) return { ok: false, why: 'owned', words: `Already in your kit: ${it.name}.` };
    if (it.use === 'bait' && this.leeches >= DOZEN) return { ok: false, why: 'owned', words: 'The leech bucket is full.' };
    const where = this.landing(ep), at = where ? ` at ${where.name}` : '';
    if (!pr.spend(it.price, `${it.name}${at}`)) return { ok: false, why: 'short', words: `Not enough in hand: ${it.name}, $${it.price}.` };
    const paid = it.price ? `, $${it.price}` : '';
    if (it.use === 'supper') { this.s.suppers = this.suppers + 1; this.write(); return { ok: true, words: `A freeze-dried supper${paid}: ${this.suppers === 1 ? 'one' : this.suppers} in the pack.` }; }
    if (it.use === 'bait') { this.s.leeches = DOZEN; this.write(); pr.give('leeches'); return { ok: true, words: `A dozen leeches${paid}, in the bucket.` }; }
    if (!ITEMS[it.id]) register(it);
    pr.give(it.id);
    if (it.slot) pr.use(it.slot, it.id);
    this.apply();
    return { ok: true, words: `${it.name}${paid}${it.slot ? ': in use now' : ''}. $${pr.money} in hand.` };
  }
  // put an owned canoe, paddle, tent or filter into use (and the one it replaces back on the rack)
  equip(id) {
    const pr = this.profile, it = itemOf(id); if (!pr || !it || !it.slot) return false;
    const ok = pr.use(it.slot, id);
    this.apply();
    return ok;
  }

  // --- the tackle box -----------------------------------------------------------------------------------------------
  // the lure ids (fishing.js) the box holds now
  box() {
    const pr = this.profile, out = new Set();
    if (!pr) { for (const l of LURES) out.add(l.id); return out; }
    for (const [lure, item] of Object.entries(LURE_ITEM)) if (pr.has(item) && (lure !== 'leech' || this.leeches > 0)) out.add(lure);
    for (const id of pr.owned) { const it = itemOf(id); if (it && it.lure) out.add(it.lure); }
    return out;
  }
  hasLure(i) { const l = LURES[i]; return !!l && this.box().has(l.id); }
  tieOn(lureId) {
    const f = this.fishing; if (!f || !lureId) return;
    const k = LURES.findIndex((l) => l.id === lureId);
    if (k >= 0 && (f.state === 'stowed' || f.state === 'ready')) { f.lureIndex = k; this.lastLure = k; }
  }
  // Fishing.js's hook when a line parts: the fish kept the lure, so it leaves the box (and the rod ties on the next
  // one in it). The last jig is never lost: there is always a spare in the bottom of the box. On the bobber rig it
  // is one leech of the dozen.
  onSnap(def, fish) {
    const f = this.fishing, pr = this.profile; if (!f || !pr || !def) return;
    const name = fish && SPECIES[fish.species] ? SPECIES[fish.species].name.toLowerCase() : 'fish';
    let words;
    if (def.id === 'leech') {
      this.s.leeches = Math.max(0, this.leeches - 1); this.write();
      words = `The line parted. The ${name} took the leech${this.leeches ? `: ${this.leeches} left in the bucket` : ', the last one'}.`;
      if (!this.leeches) drop(pr, 'leeches');
    } else {
      const item = LURE_ITEM[def.id], sig = pr.owned.find((id) => { const it = itemOf(id); return it && it.lure === def.id; });
      const others = [...this.box()].filter((l) => l !== def.id && l !== 'leech');
      if (def.id === 'jig' && !others.length && !sig) words = `The line parted and the ${name} kept the jig. There is a spare in the bottom of the box.`;
      else {
        const lose = item && pr.has(item) ? item : sig;
        if (lose) drop(pr, lose);
        const left = this.box().has(def.id);
        words = `The line parted. The ${name} kept the ${lureWord(def)}${left ? '; you tie on the other one' : ': there are more on any outfitter’s lure wall'}.`;
      }
    }
    if (!this.box().has(def.id)) this.nextLure();
    f.message = { text: words, t: 5 };
    this.apply();
  }
  nextLure() {
    const f = this.fishing; if (!f) return;
    const box = this.box();
    for (let i = 0; i < LURES.length; i++) { const k = (f.lureIndex + i) % LURES.length; if (box.has(LURES[k].id)) { f.lureIndex = k; this.lastLure = k; return; } }
    f.lureIndex = 0; this.lastLure = 0;
  }

  // --- each frame ---------------------------------------------------------------------------------------------------
  // after fishing.update, before the HUD: a lure tied on that is not in the box goes back (and says why); the lure
  // strip quiets what is not in the box; a dusk meal with a freeze-dried supper in the pack is hot; leeches go with
  // each fish caught on the bobber; the gravity bag keeps the bottle full at a pitched camp
  update() {
    const f = this.fishing, pr = this.profile;
    if (f && pr) {
      const box = this.box();
      if (!box.has(LURES[f.lureIndex] && LURES[f.lureIndex].id)) {
        const want = LURES[f.lureIndex];
        if (f.lureIndex !== this.lastLure && box.has(LURES[this.lastLure] && LURES[this.lastLure].id)) {
          f.lureIndex = this.lastLure;
          f.message = { text: want && want.id === 'leech' ? 'No leeches in the bucket. The tackle shelf at any outfitter has them.' : `No ${lureWord(want)} in the box. The lure wall at any outfitter has them.`, t: 2.4 };
        } else this.nextLure();
      } else this.lastLure = f.lureIndex;
      // the catch on the bobber: a leech gone
      const n = f.log.length;
      if (n > this.fishSeen) {
        for (let i = this.fishSeen; i < n; i++) if (f.log[i] && /leech/i.test(f.log[i].lure || '') && this.leeches > 0) { this.s.leeches = this.leeches - 1; if (!this.s.leeches) drop(pr, 'leeches'); this.write(); }
        this.fishSeen = n;
      } else if (n < this.fishSeen) this.fishSeen = n;
      if (f.rodUp) this.quietStrip(box);
    }
    const e = this.energy, d = this.day;
    if (e && d && this.suppers > 0 && e.lastMealAbs !== this.mealSeen) {
      this.mealSeen = e.lastMealAbs;
      const set = d.sunriseSunset && d.sunriseSunset.set;
      if (e.live && e.lastMealAuto && e.lastMealKind === 'cold' && set != null && Math.abs(d.hours - set) < 1 && e.meal('hot')) {
        this.s.suppers = this.suppers - 1; this.write();
        this.mealSeen = e.lastMealAbs;
        if (this.hud) this.hud.note(`A freeze-dried supper: boiling water and ten minutes, and it is hot.${this.suppers ? ` ${this.suppers === 1 ? 'One' : this.suppers} left.` : ''}`, 6);
      }
    } else if (e) this.mealSeen = e.lastMealAbs;
    const c = this.camp && this.camp.camp, p = this.player;
    if (e && c && this.gear.filter === 'gravity' && e.live && Math.hypot(c.x - p.x, c.z - p.z) < CAMP_REACH && e.bottle < 1.9) {
      const now = e.now;
      if (now - this.gravityAt > 0.5) { this.gravityAt = now; if (e.fill(2, 0) > 0.05 && this.hud) this.hud.note('The gravity bag in the spruce has filled the bottle.', 4); }
    }
  }
  // the lure strip (hud.js draws it from fishing.js's list): what is not in the box, faint
  quietStrip(box) {
    const el = typeof document !== 'undefined' ? document.getElementById('lures') : null; if (!el) return;
    const spans = el.children;
    for (let i = 0; i < spans.length && i < LURES.length; i++) { const on = box.has(LURES[i].id), s = spans[i].style; if ((s.opacity === '0.32') === on) s.opacity = on ? '' : '0.32'; }
  }
}

const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);
// the profile has give but no take: a lure lost takes it out of what is owned (profile.take when it has one, else
// the profile's own document, then its change and save)
function drop(pr, id) {
  if (pr && typeof pr.take === 'function') { pr.take(id); return; }
  const o = pr && pr.s && pr.s.owned; if (!Array.isArray(o)) return;
  const i = o.indexOf(id); if (i < 0) return;
  o.splice(i, 1);
  if (typeof pr.changed === 'function') pr.changed('gear'); else if (typeof pr.write === 'function') pr.write();
}
function boundsOf(s) {
  if (!s) return null;
  if ([s.x0, s.x1, s.z0, s.z1].every(Number.isFinite)) return { x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1), z0: Math.min(s.z0, s.z1), z1: Math.max(s.z0, s.z1) };
  const b = s.bounds || s.bbox;
  if (Array.isArray(b) && b.length === 4) return { x0: b[0], z0: b[1], x1: b[2], z1: b[3] };
  if (b && [b.x0, b.x1, b.z0, b.z1].every(Number.isFinite)) return b;
  if (b && [b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite)) return { x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ };
  return null;
}
