// The inventory (the owner's feedback of 2026-10-24, stream A): one physical inventory. Everything you own is an item
// in a container (items.js) or a long item (the rod, the paddle), and every container is somewhere: in the canoe, on
// your back or your chest, in a hand, on the ground, hung from a tree, or kept at the outfitters (the stash, as in
// Tarkov: anything not with you is kept by the outfitters, who ship it up the road to whichever counter you come in
// at). At an outfitter everything you own that is not out in the wild is in reach; in the wild only what you carry,
// what stands within about 3 m, and what is in the canoe you are in or beside. What you leave behind stays where it is,
// with what is in it, until you come back for it.
//
//   inventory.containers   [{ id, item, name, grid: [{ uid, id, x, y, rot, qty, data?, box? }], where, at, in, hand? }]
//                          where: 'back' | 'chest' | 'hands' | 'pockets' | 'canoe' | 'ground' | 'hung' | 'stash' | 'in'
//                          ('in': nested in the container `in`, whose grid has an entry { uid: this id, box: true })
//   inventory.long         [{ uid, id, where: 'hands' | 'canoe' | 'ground' | 'stash', at, inUse, hand? }]
//   inventory.hands        [thing | null, thing | null]: what is in each hand ({ long: uid } or { container: id })
//   inventory.reachable(player?), isReachable(cId), atStash, nearCanoe()
//   inventory.fits(cId, itemId, x, y, rot, ignoreUid), firstFit(cId, itemId)
//   inventory.put(cId, itemId, { x, y, rot, qty, data }) → bool          (no x, y: stacks first, then the first fit)
//   inventory.place(itemId, qty, { prefer, data, crate, all }) → { ok, placed, cId, uid, why }
//   inventory.take(cId, uidOrCell, qty) → the entry taken, or null
//   inventory.move(fromC, uid, toC, x, y, rot, qty) → bool               (split, merge, nest)
//   inventory.count(itemOrKind, { reachable = true }), has(itemId, { reachable = false }), find(itemId, opts)
//   inventory.eat(uid) → { ok, why, words }    (still; a snack, a berry, or food cooked; energy.eatItem)
//   inventory.weight(cId?) kg                  (no id: what you carry)
//   inventory.addContainer(itemId, where, at), addLong(itemId, where, at)
//   inventory.carry(ref, 'back' | 'chest' | 'hands' | 'auto'), setDown(ref, at), load(ref), stow(ref), hang(ref, at),
//   drop(cId, uid, qty)                        (each → { ok, why, words }; ref: a container id or a long item's uid)
//   inventory.onChange(fn) → off               (fn(what, inventory))
//   inventory.hasLure(lureId)                  (fishing.js's lure ids: 'jig', 'spinner', …, 'leech'; in reach)
//   inventory.meals(), snacks(), foodWords(), takeMeal(evening)
//   fb3 B (the owner's 2026-10-25 round: hands take anything, the fish to the hand, uses and servings, the bottle):
//   inventory.canHand(itemId), toHand(cId, uid, hand?, qty?), toHandNew(itemId, { data, qty }) → { ok, why, words, cId }
//   inventory.stringerInReach() → the stringer container or null, toStringer(cId, uid)
//   inventory.useOne(itemId) → { ok, left, n }   (a use off an item with uses: a tablet)
//   inventory.verb(id, ref) → { enabled, why, label?, run } | null   (the book's right-click for the verbs that are
//                                               the inventory's: hand, stringer, drink, drinkup, change, tarp;
//                                               ref: { cId, uid } an entry, { container: cId } | { long: uid } a thing)
//   fb4 C (the owner's second round of 2026-10-25: "if I can't use something, I want to know exactly why … when there are
//   things that have statuses like wet clothes … you need to know"): every verb's answer carries needs and next (items.js
//   check), and inventory.status(ref) → null | { label, next, mark, timer?, running?, until? } says an item's state and
//   the next step (wet, drying, treating, cooking, burning, hot, low, empty, ready). verb() answers eat, cook and tie too.
//   Wood is wet while its entry's data.wet (game hours of drying left in dry air) is over 0 (syncWet: rain on it in the
//   open, the ring's wetting by chores.js; it dries WOOD_DRY.air / WOOD_DRY.fire times faster by a lit fire).
//   inventory.now (abs game hours), inventory.timerWords(sec), inventory.wetRate(c).
//   The bottle rides fixed in the pockets' first cell (its entry's `left` is the litres in it, `treating` what is
//   under a tablet; nothing drinks for you: energy.drink). A loose item in a hand rides in the 'inhand' holder
//   (items.js, container.one); a fixed entry (e.fixed) is never taken, moved or dropped.
//
// Saved in its own namespace (`bwca-canoe:inventory`), tied to the profile's season (profile.seasonId). A season from
// before the items migrates once (migrate()): the kit and the owned items, the packs, the days of food, the lures, the
// leeches and the stringer become items in containers in the canoe.
import { ITEMS, itemDef, defineItem, sizeOf, fishKg, LEGACY, STARTER_KIT, FOOD_KINDS, NEED, check, timerWords, WOOD_DRY } from './items.js';
import { save } from './save.js';

const NS = 'inventory';
const VERSION = 1;
const DOC_KEY = 'bwca-canoe-trip';    // the outfitter's document (outfitter.js): the days of food and the stringer, read once
export const REACH = 3;               // m: a container on the ground or hung is in reach this near
export const HULL_REACH = 3;          // m from the canoe's keel line: beside it
export const CAMP_REACH = 25;         // m: food set out at your camp counts for the meals cooked at its grate (camp.js)
const CANOE_ROOM = 8;                 // containers a canoe takes (besides the long items)
const STILL = 0.25;                   // m/s: still enough to eat
const SAVE_EVERY = 6;                 // seconds of play between saves while something is dirty
const WHERE_RANK = { back: 0.4, chest: 0.35, hands: 0.3, pockets: 0.05, canoe: 0.2, stash: 0.1, ground: 0, hung: 0 };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lower = (s) => (/^(Duluth|Johnson|Mepps|Rapala|Lazy Ike|[A-Z]-)/.test(String(s)) ? String(s) : String(s).charAt(0).toLowerCase() + String(s).slice(1)); // (a name keeps its capital: "the Duluth #3")
const ok = (words = '') => ({ ok: true, why: null, words });
const isWood = (id) => { const d = itemDef(id); return !!(d && d.kind === 'firewood'); };
const OPEN = new Set(['firefuel', 'pile', 'woodarms', 'inhand', 'grate']); // fb4 C: containers the rain falls into
const WET_AFTER = 1 / 3;              // game hours of rain on open wood before it is wet through (chores.js RAIN.wetAfter)
const no = (why, words = '') => ({ ok: false, why, words });

export class Inventory {
  constructor() {
    this.containers = []; this.long = [];
    this.n = 1; this.handlers = new Set();
    this.player = null; this.profile = null; this.energy = null; this.outfitter = null; this.fishing = null; this.trip = null; this.hud = null; this.camp = null; this.shop = null;
    this.attached = false; this.dirty = false; this.saveT = 0; this.season = null;
    this.lastStringer = new Set(); this.seenLeeches = null; this.prevMode = null;
  }

  // --- wiring --------------------------------------------------------------------------------------------------------
  // main.js (fb A) attaches the game's modules once they are built; the inventory comes back from its save, or is built
  // once from the season's older saves, or waits for a season to begin
  attach({ player = null, world = null, profile = null, energy = null, outfitter = null, fishing = null, trip = null, hud = null, camp = null, shop = null } = {}) {
    Object.assign(this, { player, world, profile, energy, outfitter, fishing, trip, hud, camp, shop });
    this.attached = true;
    if (profile) profile.inventory = this;
    const s = save.read(NS), season = profile ? profile.seasonId : null;
    if (s && s.v === VERSION && (!season || s.season === season)) this.restore(s);
    else if (profile && profile.started) this.migrate();
    else this.clear();
    if (energy) energy.inventory = this;
    this.seenLeeches = this.oldLeeches();
    if (fishing && Array.isArray(fishing.stringer)) this.syncStringer(true);
    if (typeof window !== 'undefined') {
      const flush = () => { if (this.dirty) this.write(); };
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    }
    this.emit('attach');
    return this;
  }
  onChange(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  emit(what) {
    this.dirty = true; this.ver = (this.ver || 0) + 1;
    for (const fn of this.handlers) { try { fn(what, this); } catch (e) { console.warn('inventory.onChange', e); } }
  }
  write() {
    this.dirty = false; this.saveT = 0;
    save.write(NS, this.serialize());
  }
  serialize() {
    // a signature item (sig:<ep>) is defined only once its store's profile is made: its definition rides in the save,
    // so it is there when the inventory restores, before any store is drawn
    const defs = {}, keep = (id) => { if (/^sig:/.test(id) && itemDef(id)) defs[id] = itemDef(id); };
    for (const c of this.containers) for (const e of c.grid) keep(e.id);
    for (const l of this.long) keep(l.id);
    return { v: VERSION, season: this.season, n: this.n, containers: this.containers.map((c) => ({ ...c, grid: c.grid.map((e) => ({ ...e })), at: c.at ? { ...c.at } : null })), long: this.long.map((l) => ({ ...l, at: l.at ? { ...l.at } : null })), defs };
  }
  restore(s) {
    for (const d of Object.values(s.defs || {})) if (d && d.id && !itemDef(d.id)) defineItem(d);
    this.season = s.season || (this.profile && this.profile.seasonId) || null;
    this.n = Math.max(1, s.n | 0);
    this.containers = (Array.isArray(s.containers) ? s.containers : []).filter((c) => c && itemDef(c.item)).map((c) => ({ id: c.id, item: c.item, name: c.name || itemDef(c.item).name, grid: Array.isArray(c.grid) ? c.grid.filter((e) => e && e.uid && (e.box || itemDef(e.id))).map((e) => ({ ...e, qty: Math.max(1, e.qty | 0) })) : [], where: c.where || 'stash', at: c.at || null, in: c.in || null, hand: c.hand ?? null }));
    this.long = (Array.isArray(s.long) ? s.long : []).filter((l) => l && itemDef(l.id)).map((l) => ({ uid: l.uid, id: l.id, where: l.where || 'stash', at: l.at || null, inUse: !!l.inUse, hand: l.hand ?? null }));
    // a box entry whose container is gone, or a nested container no grid holds, is put right
    for (const c of this.containers) c.grid = c.grid.filter((e) => !e.box || this.cont(e.uid));
    for (const c of this.containers) if (c.where === 'in' && !this.boxEntry(c.id)) { c.where = 'stash'; c.in = null; }
    this.ensureFixed();
    this.dirty = false;
  }
  clear() { this.containers = []; this.long = []; this.season = this.profile ? this.profile.seasonId : null; this.ensureFixed(); this.dirty = true; }
  // the pockets and the outfitters' crate are always there, and the bottle in the pockets' first cell (fb3 B: a save
  // from before it has the cell taken, maybe: that thing moves along, or waits in the crate)
  ensureFixed() {
    if (!this.containers.some((c) => c.item === 'pockets')) this.containers.unshift(this.mk('pockets', 'pockets'));
    if (!this.containers.some((c) => c.item === 'crate')) this.containers.push(this.mk('crate', 'stash'));
    const pk = this.pockets;
    if (pk && !pk.grid.some((e) => e.id === 'bottle')) {
      const bottle = { uid: this.uid(), id: 'bottle', x: 0, y: 0, rot: 0, qty: 1, fixed: true, left: 2 };
      const over = pk.grid.filter((e) => e.x === 0);
      for (const e of over) {
        pk.grid.splice(pk.grid.indexOf(e), 1);
        const spot = this.firstFit(pk, e.id, null, [bottle]);
        if (spot) { e.x = spot.x; e.y = spot.y; e.rot = spot.rot; pk.grid.push(e); }
        else this.put(this.crate, e.id, { qty: e.qty, data: e.data || null, quiet: true });
      }
      pk.grid.unshift(bottle);
      this.dirty = true;
    }
  }
  get bottleEntry() { const pk = this.pockets; return pk ? pk.grid.find((e) => e.id === 'bottle') || null : null; }
  uid(p = 'u') { return `${p}${this.n++}`; }
  mk(item, where, at = null) { const d = itemDef(item); return { id: this.uid('c'), item, name: d ? d.name : item, grid: [], where, at, in: null, hand: null }; }

  // --- a new season, and the migration of an older one -------------------------------------------------------------
  // The starting kit (items.js STARTER_KIT): a Duluth pack #3 with the tent, the bag, the clothes, the pot, the tarp,
  // the tablets and the tackle box (a jig and a Mepps); the leech bucket with a dozen; the stringer; the ash paddle and
  // the rod. All of it in the canoe, tied up at the home store's dock.
  newSeason() {
    this.containers = []; this.long = []; this.n = 1;
    this.season = this.profile ? this.profile.seasonId : null;
    this.ensureFixed();
    const K = STARTER_KIT, made = {};
    for (const it of K.canoe) made[it] = this.addContainer(it, 'canoe', null, { quiet: true });
    for (const [host, list] of Object.entries(K)) {
      if (host === 'canoe' || host === 'long') continue;
      for (const x of list) {
        const [id, qty] = Array.isArray(x) ? x : [x, 1];
        const d = itemDef(id);
        if (d && d.container) { const c = this.nestNew(made[host], id); if (c) made[id] = c; continue; }
        if (made[host]) this.put(made[host].id, id, { qty, quiet: true });
      }
    }
    for (const id of K.long) this.addLong(id, 'canoe', null, { quiet: true });
    this.refreshUse();
    this.emit('season');
    this.write();
  }
  // From a season before the items: profile.owned and the kit, the outfitter's document (the days of food in
  // energy.food, the stringer) and the shop's own save (freeze-dried suppers, leeches). Everything goes into the canoe:
  // the gear in the first pack, the food in the barrel (or the second pack, the food pack), the lures in the tackle box.
  migrate() {
    const pr = this.profile, raw = pr && pr.s ? pr.s : { owned: [], kit: {} }, owned = new Set(raw.owned || []), kit = raw.kit || {};
    const doc = readJSON(DOC_KEY), shopS = save.read('shop') || {};
    this.containers = []; this.long = []; this.n = 1;
    this.season = pr ? pr.seasonId : null;
    this.ensureFixed();
    const q = { quiet: true };
    const gear = this.addContainer('pack3', 'canoe', null, q);
    const food = owned.has('barrel') ? this.addContainer('barrel60', 'canoe', null, q) : owned.has('pack2') ? this.addContainer('pack4', 'canoe', null, q) : gear;
    if (owned.has('pack2') && food.item !== 'pack4') this.addContainer('pack4', 'canoe', null, q);
    const putIn = (id, qty = 1, data = null, first = [gear]) => {
      for (const c of [...first, ...this.containers.filter((k) => k.where === 'canoe')]) if (c && this.put(c.id, id, { qty, data, quiet: true })) return true;
      return this.put(this.crate.id, id, { qty, data, quiet: true });
    };
    // the gear: the tent in use first, then the other tents, the camp kit, the filters and the rest
    const tents = ['aframe', 'dome', 'fourseason'], kitTent = kit.tent && owned.has(kit.tent) ? kit.tent : 'aframe';
    putIn(kitTent);
    for (const t of tents) if (t !== kitTent && owned.has(t)) putIn(t, 1, null, [this.crate]);
    for (const id of ['sleepingbag', 'clothes', 'pot', 'tarp']) putIn(id);
    for (const id of ['tablets', 'pump', 'gravity']) if (owned.has(id) || (id === 'tablets' && (kit.filter || 'tablets') === 'tablets')) putIn(id);
    for (const id of ['pad', 'saw', 'camera', 'yokepads']) if (owned.has(id)) putIn(id);
    // the tackle box and the lures in it
    const box = this.nestNew(gear, 'tacklebox') || this.addContainer('tacklebox', 'canoe', null, q);
    for (const id of [...owned]) if (id.startsWith('lure:') && itemDef(id)) { if (!this.put(box.id, id, q)) putIn(id); }
    // the leeches (the shop counted them; a dozen if it never did)
    if (owned.has('leeches') || owned.has('bucket')) {
      const b = this.addContainer('bucket', 'canoe', null, q), n = clamp(Number.isFinite(shopS.leeches) ? shopS.leeches : 12, 0, 48);
      if (n > 0) this.put(b.id, 'leeches', { qty: n, quiet: true });
    } else this.addContainer('bucket', 'canoe', null, q);
    // the food: the days in the pack as meals, a breakfast and a supper a day; the freeze-dried suppers as they are
    const days = doc && doc.energy && Number.isFinite(doc.energy.food) ? Math.max(0, doc.energy.food) : 0;
    const meals = Math.round(days * 2);
    for (let i = 0; i < meals; i++) putIn(i % 2 ? 'meal:supper' : 'meal:breakfast', 1, null, [food]);
    for (let i = 0; i < Math.max(0, shopS.suppers | 0); i++) putIn('meal:freeze', 1, null, [food]);
    // the stringer and the fish on it
    const st = this.addContainer('stringer', 'canoe', null, q);
    for (const f of doc && Array.isArray(doc.stringer) ? doc.stringer : []) if (f && f.species) this.put(st.id, `fish:${f.species}`, { data: { length: +f.length || 30 }, quiet: true });
    // the long items: the paddle in use and the rod in the canoe, the spares kept at the outfitters
    const paddles = ['ash', 'bentshaft', 'carbon'].filter((id) => id === 'ash' || owned.has(id));
    const inUse = paddles.includes(kit.paddle) ? kit.paddle : 'ash';
    for (const id of paddles) this.addLong(id, id === inUse ? 'canoe' : 'stash', null, q);
    this.addLong(owned.has('rod') ? 'rodmh' : 'rod', 'canoe', null, q);
    if (owned.has('rod')) this.addLong('rod', 'stash', null, q);
    // the profile keeps the canoes and what is not a thing (the old Fisher maps, the map sheets B may not yet define)
    if (pr && pr.s && Array.isArray(pr.s.owned)) {
      const physical = (id) => !!(itemDef(id) || LEGACY[id] || id === 'leeches');
      pr.s.owned = pr.s.owned.filter((id) => !physical(id) || id === 'aluminium');
      if (typeof pr.write === 'function') pr.write();
    }
    this.migrated = { days, meals, from: pr && pr.migrated ? pr.migrated : 'profile' };
    this.pendingNote = 'Everything you own is a thing now, and it is in the canoe: the packs, the barrel, the bucket, the rod. I opens the book.';
    this.refreshUse();
    this.emit('migrate');
    this.write();
  }

  // --- finding things ------------------------------------------------------------------------------------------------
  cont(id) { return this.containers.find((c) => c.id === id) || null; }
  get crate() { return this.containers.find((c) => c.item === 'crate'); }
  get pockets() { return this.containers.find((c) => c.item === 'pockets'); }
  longOf(uid) { return this.long.find((l) => l.uid === uid) || null; }
  boxEntry(cId) { for (const c of this.containers) for (const e of c.grid) if (e.box && e.uid === cId) return { c, e }; return null; }
  root(c) { let k = c, guard = 0; while (k && k.where === 'in' && guard++ < 8) k = this.cont(k.in); return k || c; }
  rootWhere(c) { const r = this.root(c); return r ? r.where : c.where; }
  spec(c) { const d = itemDef(c.item); return (d && d.container) || { cols: 1, rows: 1 }; }
  // a container id or a long item's uid → { kind: 'container' | 'long', obj, def }
  thing(ref) {
    if (ref && typeof ref === 'object') ref = ref.container || ref.long || ref.id || ref.uid;
    const c = this.cont(ref); if (c) return { kind: 'container', obj: c, def: itemDef(c.item) };
    const l = this.longOf(ref); if (l) return { kind: 'long', obj: l, def: itemDef(l.id) };
    return null;
  }
  findUid(uid, { reachable = false } = {}) {
    for (const c of reachable ? this.reachable() : this.containers) for (const e of c.grid) if (e.uid === uid) return { c, e };
    return null;
  }

  // --- where the canoe is, and what is in reach ----------------------------------------------------------------------
  // at an outfitter's counter or about its store (outfitter.visit): the stash
  get atStash() { const o = this.outfitter; return !!(o && (o.open || o.visit)); }
  // the canoe: afloat with you, overhead, capsized beside you, or lying where it was set down
  canoeSpot() {
    const p = this.player; if (!p) return null;
    if (p.mode === 'paddle') return { x: p.x, z: p.z, heading: p.heading, afloat: true };
    if (p.mode === 'carry') return { x: p.x, z: p.z, heading: p.heading, overhead: true };
    const sw = p.swim;
    if (p.mode === 'swim' && sw) { const h = 'hull' in sw ? sw.hull : sw.cx != null ? sw : null; if (h) return { x: h.cx, z: h.cz, heading: h.heading || 0, capsized: true }; } // a capsize (stream C: swim.hull; a swim from shore leaves the canoe where it lay)
    const d = p.carry && p.carry.drop;
    return d ? { x: d.x, z: d.z, heading: d.heading || 0 } : null;
  }
  // in it, under it, or within HULL_REACH of its keel line
  nearCanoe() {
    const s = this.canoeSpot(), p = this.player; if (!s) return false;
    if (s.afloat || s.overhead) return true;
    return this.hullDist(s, p.x, p.z) <= HULL_REACH;
  }
  hullDist(s, x, z) {
    const fx = Math.cos(s.heading), fz = -Math.sin(s.heading), dx = x - s.x, dz = z - s.z;
    const t = clamp(dx * fx + dz * fz, -2.4, 2.4);
    return Math.hypot(dx - fx * t, dz - fz * t);
  }
  dist(at) { const p = this.player; return at && p ? Math.hypot(at.x - p.x, at.z - p.z) : Infinity; }
  ctx() { return { stash: this.atStash, canoe: this.nearCanoe() }; }
  inReach(c, k = this.ctx()) {
    const r = this.root(c);
    switch (r.where) {
      case 'back': case 'chest': case 'hands': case 'pockets': return true;
      case 'canoe': return k.canoe || k.stash;
      case 'stash': return k.stash;
      case 'ground': case 'hung': return this.dist(r.at) <= REACH;
      default: return false;
    }
  }
  // the containers you can use now (nested ones with their parent); the stash when at an outfitter
  reachable() {
    if (!this.attached) return [];
    const k = this.ctx();
    return this.containers.filter((c) => this.inReach(c, k));
  }
  isReachable(cId) { const c = this.cont(cId); return !!(c && this.inReach(c)); }
  longReachable(l, k = this.ctx()) {
    switch (l.where) {
      case 'hands': return true;
      case 'canoe': return k.canoe || k.stash;
      case 'stash': return k.stash;
      case 'ground': return this.dist(l.at) <= REACH;
      default: return false;
    }
  }
  thingReachable(t) { return t.kind === 'container' ? this.inReach(t.obj) : this.longReachable(t.obj); }
  // what is in each hand: [right, left]
  get hands() {
    const out = [null, null];
    for (const c of this.containers) if (c.where === 'hands' && (c.hand === 0 || c.hand === 1)) out[c.hand] = { container: c.id };
    for (const l of this.long) if (l.where === 'hands' && (l.hand === 0 || l.hand === 1)) out[l.hand] = { long: l.uid };
    return out;
  }
  freeHand() { const h = this.hands; return h[0] ? h[1] ? -1 : 1 : 0; }
  worn(slot) { return this.containers.find((c) => c.where === slot) || null; }

  // --- the grid --------------------------------------------------------------------------------------------------------
  // fb3 B: the pockets take things of up to two cells (a 1 × 2 goes in turned); a hand's holder (one) takes anything
  // but a container or a long thing, one entry at a time (fits)
  accepts(c, d) {
    if (!c || !d) return false;
    const s = this.spec(c);
    if (d.kind === 'container') return !!d.nest && c.item !== 'pockets' && !s.one && !s.accepts;
    if (d.kind === 'long') return false;
    if (c.item === 'pockets' && d.w * d.h > 2) return false;
    if (d.id === 'bottle' && c.item !== 'pockets') return false;
    return !s.accepts || s.accepts.includes(d.kind);
  }
  sizeOfEntry(e) { return sizeOf(e.id, e.rot); }
  overlaps(c, x, y, w, h, ignoreUid = null, extra = null) {
    for (const e of extra ? [...c.grid, ...extra] : c.grid) {
      if (e.uid === ignoreUid) continue;
      const s = this.sizeOfEntry(e);
      if (x < e.x + s.w && e.x < x + w && y < e.y + s.h && e.y < y + h) return true;
    }
    return false;
  }
  fits(cId, itemId, x, y, rot = 0, ignoreUid = null, extra = null) {
    const c = typeof cId === 'object' ? cId : this.cont(cId), d = itemDef(itemId);
    if (!c || !d || !this.accepts(c, d)) return false;
    const s = this.spec(c), { w, h } = sizeOf(itemId, rot);
    if (!(x >= 0 && y >= 0 && x + w <= s.cols && y + h <= s.rows)) return false;
    if (s.one && (c.grid.some((e) => e.uid !== ignoreUid) || (extra && extra.length))) return false; // a hand holds one thing
    return !this.overlaps(c, x, y, w, h, ignoreUid, extra);
  }
  // the first free spot for an item (left to right, top to bottom; turned if it only fits that way)
  firstFit(cId, itemId, ignoreUid = null, extra = null) {
    const c = typeof cId === 'object' ? cId : this.cont(cId), d = itemDef(itemId);
    if (!c || !d || !this.accepts(c, d)) return null;
    const s = this.spec(c);
    for (const rot of d.w === d.h ? [0] : [0, 1]) for (let y = 0; y < s.rows; y++) for (let x = 0; x < s.cols; x++) if (this.fits(c, itemId, x, y, rot, ignoreUid, extra)) return { x, y, rot };
    return null;
  }
  // Put qty of an item in a container: into its stacks first, then the first free spots (or at x, y). All or nothing.
  put(cId, itemId, { x = null, y = null, rot = 0, qty = 1, data = null, quiet = false } = {}) {
    const c = typeof cId === 'object' ? cId : this.cont(cId), d = itemDef(itemId);
    if (!c || !d) return false;
    if (d.kind === 'container') return !!this.nestNew(c, itemId, { x, y, rot, quiet });
    if (!this.accepts(c, d)) return false;
    qty = Math.max(1, qty | 0);
    const plan = [], adds = [];
    let left = qty;
    const stackable = d.stack > 1 && !data;
    if (stackable) {
      const targets = x != null ? c.grid.filter((e) => e.id === itemId && e.x === x && e.y === y && !e.data) : c.grid.filter((e) => e.id === itemId && !e.data);
      for (const e of targets) { const m = Math.min(left, d.stack - e.qty); if (m > 0) { plan.push([e, m]); left -= m; } if (!left) break; }
    }
    let first = x != null && !plan.length;
    while (left > 0) {
      const n = stackable ? Math.min(left, d.stack) : 1;
      let spot = null;
      if (first) { spot = this.fits(c, itemId, x, y, rot, null, adds) ? { x, y, rot } : null; first = false; if (!spot) return false; }
      else spot = this.firstFit(c, itemId, null, adds);
      if (!spot) return false;
      adds.push({ uid: `tmp${adds.length}`, id: itemId, x: spot.x, y: spot.y, rot: spot.rot, qty: n, ...(data ? { data: { ...data } } : {}) });
      left -= n;
    }
    for (const [e, m] of plan) e.qty += m;
    for (const a of adds) { a.uid = this.uid(); c.grid.push(a); }
    this.lastPut = adds.length ? adds[adds.length - 1].uid : plan.length ? plan[0][0].uid : null;
    if (!quiet) this.emit('items');
    return true;
  }
  // a new nestable container (a tackle box, a map case) inside another one
  nestNew(host, itemId, { x = null, y = null, rot = 0, quiet = true } = {}) {
    const h = typeof host === 'object' ? host : this.cont(host), d = itemDef(itemId);
    if (!h || !d || !d.container || !d.nest || !this.accepts(h, d)) return null;
    const spot = x != null ? (this.fits(h, itemId, x, y, rot) ? { x, y, rot } : null) : this.firstFit(h, itemId);
    if (!spot) return null;
    const c = this.mk(itemId, 'in'); c.in = h.id;
    this.containers.push(c);
    h.grid.push({ uid: c.id, id: itemId, x: spot.x, y: spot.y, rot: spot.rot, qty: 1, box: true });
    if (!quiet) this.emit('items');
    return c;
  }
  // Place qty of an item wherever it fits best in reach: the container made for it (the barrel for food, the bucket for
  // leeches, the tackle box for lures, the stringer for fish), then what you carry, the canoe, the stash; the pockets
  // take snacks and berries first. opts.prefer: container ids to try first; opts.crate: what does not fit waits in the
  // outfitters' crate; opts.all: any container you own, not only those in reach.
  place(itemId, qty = 1, { prefer = [], data = null, crate = false, all = false, quiet = false, exclude = [], pool: within = null } = {}) {
    const d = itemDef(itemId);
    if (!d) return { ok: false, placed: 0, why: 'unknown', cId: null, uid: null };
    if (d.kind === 'container') {
      const c = this.addContainer(itemId, this.atStash || !this.attached ? 'stash' : this.nearCanoe() ? 'canoe' : 'stash', null, { quiet });
      return { ok: true, placed: 1, cId: c.id, uid: c.id, why: null };
    }
    if (d.kind === 'long') { const l = this.addLong(itemId, this.atStash || !this.attached ? 'stash' : 'canoe', null, { quiet }); return { ok: true, placed: 1, cId: null, uid: l.uid, why: null }; }
    // (fb2 A: never into a station, the fire ring's fuel or the grate, unless asked for by name in `prefer`; fb3 B: never
    // into a hand's holder either: a hand takes only what you put in it)
    const pool = (within || (all || !this.attached ? this.containers : this.reachable())).filter((c) => c.item !== 'crate' && c.item !== 'pile' && !exclude.includes(c.id) && this.accepts(c, d) && !this.spec(c).one && (!(itemDef(c.item) || {}).station || prefer.includes(c.id)));
    const pre = prefer.map((id) => this.cont(id)).filter((c) => c && pool.includes(c));
    const rest = pool.filter((c) => !pre.includes(c)).sort((a, b) => this.score(b, d) - this.score(a, d));
    let left = Math.max(1, qty | 0), first = null, uid = null;
    const tryIn = (c) => {
      if (!left) return;
      if (this.put(c, itemId, { qty: left, data, quiet: true })) { first = first || c.id; uid = uid || this.lastPut; left = 0; return; }
      while (left > 0 && this.put(c, itemId, { qty: 1, data, quiet: true })) { first = first || c.id; uid = uid || this.lastPut; left--; }
    };
    for (const c of [...pre, ...rest]) tryIn(c);
    if (left && crate && this.crate) tryIn(this.crate);
    const placed = Math.max(1, qty | 0) - left;
    if (placed && !quiet) this.emit('items');
    return { ok: left === 0, placed, cId: first, uid, why: left ? (pool.length ? 'full' : 'nowhere') : null };
  }
  score(c, d) {
    const s = this.spec(c);
    let k = 0;
    if (s.accepts && s.accepts.includes(d.kind)) k += 4;
    if (c.item === 'pockets') k += d.kind === 'snack' || d.kind === 'forage' ? 3 : -2;
    return k + (WHERE_RANK[this.rootWhere(c)] || 0);
  }
  // Take from a container: the entry with this uid or covering this cell; qty fewer than it has splits it. A nested
  // container is not taken this way (carry, setDown or move it).
  take(cId, uidOrCell, qty = null) {
    const c = this.cont(cId); if (!c) return null;
    let e = null;
    if (uidOrCell && typeof uidOrCell === 'object') { const { x, y } = uidOrCell; e = c.grid.find((q) => { const s = this.sizeOfEntry(q); return x >= q.x && x < q.x + s.w && y >= q.y && y < q.y + s.h; }); }
    else e = c.grid.find((q) => q.uid === uidOrCell);
    if (!e || e.box || e.fixed) return null;
    const n = qty == null ? e.qty : Math.max(1, Math.min(e.qty, qty | 0));
    let out;
    if (n < e.qty) { e.qty -= n; out = { ...e, qty: n, data: e.data ? { ...e.data } : undefined }; }
    else { c.grid.splice(c.grid.indexOf(e), 1); out = e; }
    this.emit('items');
    return out;
  }
  // Move an entry (or qty of it) to toC at x, y, rot: onto the same item's stack it merges up to the stack; a nested
  // container's entry moves the container. With no fromC and uid a container's id, that container goes into toC.
  move(fromC, uid, toC, x, y, rot = 0, qty = null) {
    const to = this.cont(toC); if (!to) return false;
    if (fromC == null) { const c = this.cont(uid); return c ? this.nest(c, to, x, y, rot) : false; }
    const from = this.cont(fromC); if (!from) return false;
    const e = from.grid.find((q) => q.uid === uid); if (!e || e.fixed) return false;
    if (e.box) { const c = this.cont(e.uid); return c ? this.nest(c, to, x, y, rot) : false; }
    const d = itemDef(e.id); if (!d || !this.accepts(to, d)) return false;
    const n = qty == null ? e.qty : Math.max(1, Math.min(e.qty, qty | 0));
    const t = to.grid.find((q) => q !== e && q.id === e.id && q.x === x && q.y === y && !q.data && !e.data);
    if (t && d.stack > 1) {
      const m = Math.min(n, d.stack - t.qty); if (m <= 0) return false;
      t.qty += m; e.qty -= m;
      if (e.qty <= 0) from.grid.splice(from.grid.indexOf(e), 1);
      this.emit('items'); return true;
    }
    const whole = n === e.qty;
    if (!this.fits(to, e.id, x, y, rot, whole && from === to ? e.uid : null)) return false;
    if (whole) {
      from.grid.splice(from.grid.indexOf(e), 1);
      e.x = x; e.y = y; e.rot = rot ? 1 : 0; to.grid.push(e);
    } else {
      e.qty -= n;
      to.grid.push({ uid: this.uid(), id: e.id, x, y, rot: rot ? 1 : 0, qty: n, ...(e.data ? { data: { ...e.data } } : {}) });
    }
    this.emit('items');
    return true;
  }
  // a nestable container into another one (not into itself, nor into what it holds, nor one that holds containers)
  nest(c, to, x = null, y = null, rot = 0) {
    const d = itemDef(c.item);
    if (!d || !d.nest || !this.accepts(to, d) || c === to) return false;
    for (let k = to; k; k = k.where === 'in' ? this.cont(k.in) : null) if (k === c) return false;
    if (c.grid.some((e) => e.box)) return false;
    const cur = this.boxEntry(c.id);
    const same = cur && cur.c === to;
    const spot = x != null ? (this.fits(to, c.item, x, y, rot, same ? c.id : null) ? { x, y, rot } : null) : this.firstFit(to, c.item, same ? c.id : null);
    if (!spot) return false;
    if (cur) cur.c.grid.splice(cur.c.grid.indexOf(cur.e), 1);
    to.grid.push({ uid: c.id, id: c.item, x: spot.x, y: spot.y, rot: spot.rot ? 1 : 0, qty: 1, box: true });
    c.where = 'in'; c.in = to.id; c.at = null; c.hand = null;
    this.emit('items');
    return true;
  }
  unnest(c) {
    const cur = this.boxEntry(c.id);
    if (cur) cur.c.grid.splice(cur.c.grid.indexOf(cur.e), 1);
    c.in = null;
  }

  // --- counting ----------------------------------------------------------------------------------------------------------
  // How many: an item id (its entries' qty, its containers, its long items) or a kind ('meal', 'lure', …); in reach by
  // default.
  count(q, { reachable = true } = {}) {
    if (!this.attached && reachable) reachable = false;
    const isId = !!ITEMS[q] || String(q).includes(':');
    const cs = reachable ? this.reachable() : this.containers;
    let n = 0;
    for (const c of cs) {
      if (isId && c.item === q && c.item !== 'pockets' && c.item !== 'crate') n++;
      for (const e of c.grid) { if (e.box) continue; if (isId ? e.id === q : (itemDef(e.id) || {}).kind === q) n += e.qty; }
    }
    const k = reachable ? this.ctx() : null;
    for (const l of this.long) if ((isId ? l.id === q : q === 'long') && (!reachable || this.longReachable(l, k))) n++;
    return n;
  }
  has(itemId, { reachable = false } = {}) { return this.count(itemId, { reachable }) > 0; }
  find(itemId, { reachable = true } = {}) {
    const out = [];
    for (const c of reachable ? this.reachable() : this.containers) for (const e of c.grid) if (!e.box && e.id === itemId) out.push({ c, e });
    return out;
  }
  // every item id owned, anywhere (profile.owned reads it)
  ids() {
    const s = new Set();
    for (const c of this.containers) { if (c.item !== 'pockets' && c.item !== 'crate' && c.item !== 'pile' && c.item !== 'inhand') s.add(c.item); for (const e of c.grid) if (!e.box) s.add(e.id); }
    for (const l of this.long) s.add(l.id);
    return s;
  }
  // a long item of a family ('rod', 'paddle') in reach, or null
  longOf2(family, { reachable = true } = {}) { const k = this.ctx(); return this.long.find((l) => (itemDef(l.id) || {}).long === family && (!reachable || this.longReachable(l, k))) || null; }
  get rod() { return this.longOf2('rod'); }
  get paddle() { return this.long.find((l) => l.inUse) || this.longOf2('paddle', { reachable: false }); }
  // fishing.js's lure ids in reach (the tackle box, the pockets; the bucket's leeches)
  hasLure(lureId) {
    if (!this.attached) return true;
    for (const c of this.reachable()) for (const e of c.grid) if (!e.box && (itemDef(e.id) || {}).lure === lureId && e.qty > 0) return true;
    return false;
  }
  lures() { const s = new Set(); for (const c of this.reachable()) for (const e of c.grid) { const d = itemDef(e.id); if (!e.box && d && d.lure) s.add(d.lure); } return s; }

  // --- food --------------------------------------------------------------------------------------------------------------
  // The camp's reach (the camp redone, 2026-10-24: "food in reach should mean the camp's reach"). On foot at a campsite
  // that is free or yours (camp.js reachArea: within its area, about 25 m round its fire ring; or round your own tent
  // pitched off a site): what is in reach anyway, everything set down on the ground there, and the canoe lying there with
  // what is in it. A hung barrel only from under it, as anywhere (it is let down first). Elsewhere, what is in reach. The
  // camp's food and wood (energy.js, chores.js), the tent to pitch and its pack when struck (camp.js) come from it.
  campReach() {
    const r = this.reachable(), cp = this.camp, a = cp && typeof cp.reachArea === 'function' ? cp.reachArea() : null;
    if (!a) return r;
    const s = this.canoeSpot(), canoeIn = !!(s && !s.afloat && !s.overhead && Math.hypot(s.x - a.x, s.z - a.z) <= a.r), has = new Set(r);
    for (const c of this.containers) {
      if (has.has(c)) continue;
      const k = this.root(c);
      if ((k.where === 'ground' && k.at && Math.hypot(k.at.x - a.x, k.at.z - a.z) <= a.r) || (k.where === 'canoe' && canoeIn)) r.push(c);
    }
    return r;
  }
  inCampReach(cId) { const c = this.cont(cId); return !!(c && this.campReach().includes(c)); }
  // the barrels hung at the camp you are at (camp 1: on a limb within its area, out of reach until let down or stood
  // under): their food is the camp's, though nothing is cooked or eaten out of them up there (energy.hungFood)
  hungAtCamp() {
    const cp = this.camp, a = cp && typeof cp.reachArea === 'function' ? cp.reachArea() : null;
    if (!a) return [];
    const near = new Set(this.reachable());
    return this.containers.filter((c) => { const k = this.root(c); return k.where === 'hung' && k.at && !near.has(c) && Math.hypot(k.at.x - a.x, k.at.z - a.z) <= a.r + 5; });
  }
  // the containers whose food counts for a meal now: the camp's reach
  foodPool() { return this.campReach(); }
  countIn(cs, kind) { let n = 0; for (const c of cs) for (const e of c.grid) if (!e.box && (itemDef(e.id) || {}).kind === kind) n += e.qty; return n; }
  meals() { return this.countIn(this.foodPool(), 'meal'); }
  snacks() { const r = this.foodPool(); return this.countIn(r, 'snack') + this.countIn(r, 'forage'); }
  // "a hot meal, 3 meals to cook and 1 snack": a cooked thing kept as leftovers too (cook.js), as energy.js says it in
  // the readout; a raw meal is food that wants the pot first, and says so (polish B); "no food" only with nothing at all
  foodWords() {
    const m = this.meals(), s = this.snacks();
    let hot = 0;
    for (const c of this.foodPool()) for (const e of c.grid) { const d = !e.box && itemDef(e.id); if (d && d.kind === 'food' && d.cooked) hot += e.qty; }
    const parts = [hot ? (hot === 1 ? 'a hot meal' : `${hot} hot meals`) : '', m ? `${m} meal${m === 1 ? '' : 's'} to cook` : '', s ? `${s} snack${s === 1 ? '' : 's'}` : ''].filter(Boolean);
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || 'no food';
  }
  // A meal for the grate (energy.meal, camp.js's cooking): supper in the evening, breakfast otherwise, else any meal;
  // taken from the food in reach or set out at camp. Returns the item's def, or null when there is none.
  takeMeal(evening = false) {
    const pool = this.foodPool(), want = evening ? ['meal:supper', 'meal:freeze', 'meal:breakfast'] : ['meal:breakfast', 'meal:supper', 'meal:freeze'];
    for (const id of want) for (const c of pool) for (const e of c.grid) if (e.id === id) { this.take(c.id, e.uid, 1); return itemDef(id); }
    for (const c of pool) for (const e of c.grid) if (!e.box && (itemDef(e.id) || {}).kind === 'meal') { const d = itemDef(e.id); this.take(c.id, e.uid, 1); return d; }
    return null;
  }
  // Set the meals to n (energy.food = days, written by the old counter, a capsize's spoiling, a Sandbox repack): more
  // are placed in reach (what does not fit waits in the outfitters' crate when you are at one), fewer are taken.
  setMeals(n) {
    n = Math.max(0, Math.round(n));
    let have = this.meals();
    if (n < have) { while (have > n && this.takeMeal(have % 2 === 0)) have--; return; }
    for (let i = have; i < n; i++) {
      const id = i % 2 ? 'meal:supper' : 'meal:breakfast';
      const r = this.place(id, 1, { crate: this.atStash, quiet: true, pool: this.foodPool() });
      if (!r.ok) { if (this.hud) this.hud.note('No room for more food in what you have with you.', 4); break; }
    }
    this.emit('items');
  }
  still() {
    const p = this.player; if (!p) return false;
    if (!(p.mode === 'walk' || p.mode === 'paddle') || p.landing || p.ashore || p.teleporting) return false;
    if (p.foot && p.foot.air) return false;
    return Math.abs(p.speed || 0) < STILL;
  }
  // Eat one: a snack or a berry as it is, a meal or a fish only once it is cooked; standing still, on foot or in the
  // canoe. Sandbox's food keeps (nothing is used up) and you are never hungry there.
  eat(uid) {
    const hit = this.findUid(uid, { reachable: true }) || (() => { for (const c of this.foodPool()) for (const e of c.grid) if (e.uid === uid) return { c, e }; return null; })();
    if (!hit) return no('gone', 'That is not within reach.');
    const d = itemDef(hit.e.id);
    if (!d || !d.eat) return no('inedible', `${d ? d.name : 'That'} isn’t for eating.`);
    if (d.eat.cook && !(hit.e.data && hit.e.data.cooked)) return no('cook', d.kind === 'fish' ? 'Cook it first: on the grate, over a fire.' : `${d.name}: cook it first, on the grate over a fire.`);
    if (!this.still()) return no('moving', 'Hold still to eat.');
    const en = this.energy, sand = !!(en && en.sandbox);
    if (en && typeof en.eatItem === 'function') en.eatItem(d.eat, d.name);
    if (sand) return ok(`${d.name}. The food keeps in Sandbox.`);
    // fb3 B: a serving at a time (trail mix 6, jerky 4, a bar 2): the entry's `left` falls, and the last one eats the thing
    const n = d.servings || 1, e = hit.e;
    if (n > 1) {
      const left = (Number.isFinite(e.left) ? e.left : n) - 1;
      if (left > 0) { e.left = left; this.emit('items'); return ok(`${d.name}: ${left} of ${n} servings left.`); }
      if (e.qty > 1) { e.qty -= 1; delete e.left; this.emit('items'); return ok(`${d.name}: the bag finished; ${e.qty} more.`); }
    }
    this.take(hit.c.id, e.uid, 1);
    const left = this.count(d.id);
    return ok(`${d.name}${left ? `: ${left} left` : ''}.`);
  }
  // fb3 B: one use off an item with uses (a tablet per bottle): the entry's `left` falls, the last use takes the thing.
  // From what is in reach by default. → { ok, left, n }
  useOne(itemId, { reachable = true } = {}) {
    const d = itemDef(itemId), n = d && Number.isFinite(d.uses) ? d.uses : 1;
    const hit = this.find(itemId, { reachable })[0] || null;
    if (!hit) return { ok: false, left: 0, n };
    const e = hit.e, left = (Number.isFinite(e.left) ? e.left : n) - 1;
    if (left > 0) { e.left = left; this.emit('items'); return { ok: true, left, n }; }
    if (e.qty > 1) { e.qty -= 1; delete e.left; this.emit('items'); return { ok: true, left: n * e.qty, n }; }
    this.take(hit.c.id, e.uid, 1);
    return { ok: true, left: this.count(itemId, { reachable }) * n, n };
  }
  // what is left of an item's uses, in reach: the sum over its entries
  usesLeft(itemId, { reachable = true } = {}) {
    const d = itemDef(itemId), n = d && Number.isFinite(d.uses) ? d.uses : 1;
    let k = 0;
    for (const { e } of this.find(itemId, { reachable })) k += (Number.isFinite(e.left) ? e.left : n) + n * (e.qty - 1);
    return k;
  }

  // --- weight ------------------------------------------------------------------------------------------------------------
  entryKg(e) {
    const d = itemDef(e.id); if (!d) return 0;
    if (e.data && Number.isFinite(e.data.kg)) return e.data.kg * e.qty;
    if (d.kind === 'fish' && e.data && e.data.length) return fishKg(d.species || e.id.slice(5), e.data.length) * e.qty;
    return (d.kg || 0) * e.qty;
  }
  kgOf(c, guard = 0) {
    let kg = (itemDef(c.item) || {}).kg || 0;
    for (const e of c.grid) { if (e.box) { const k = this.cont(e.uid); if (k && guard < 6) kg += this.kgOf(k, guard + 1); } else kg += this.entryKg(e); }
    return kg;
  }
  weight(cId = null) {
    if (cId != null) { const t = this.thing(cId); return t ? t.kind === 'container' ? this.kgOf(t.obj) : t.def.kg || 0 : 0; }
    return this.carriedKg();
  }
  carriedKg() {
    let kg = 0;
    for (const c of this.containers) if (['back', 'chest', 'hands', 'pockets'].includes(c.where)) kg += this.kgOf(c);
    for (const l of this.long) if (l.where === 'hands') kg += (itemDef(l.id) || {}).kg || 0;
    return kg;
  }

  // --- adding things -----------------------------------------------------------------------------------------------------
  addContainer(itemId, where = 'stash', at = null, { quiet = false, hand = null } = {}) {
    const d = itemDef(itemId); if (!d || !d.container) return null;
    const c = this.mk(itemId, where, at);
    if (where === 'hands') c.hand = hand ?? Math.max(0, this.freeHand());
    this.containers.push(c);
    if (!quiet) this.emit('containers');
    return c;
  }
  addLong(itemId, where = 'stash', at = null, { quiet = false, hand = null } = {}) {
    const d = itemDef(itemId); if (!d || d.kind !== 'long') return null;
    const l = { uid: this.uid('l'), id: itemId, where, at, inUse: false, hand: where === 'hands' ? hand ?? Math.max(0, this.freeHand()) : null };
    this.long.push(l);
    this.refreshUse();
    if (!quiet) this.emit('long');
    return l;
  }
  // the paddle in use is the kit's (profile.kit.paddle), the first of its kind you own
  refreshUse() {
    const pr = this.profile, want = pr && pr.s && pr.s.kit ? pr.s.kit.paddle : 'ash';
    let found = false;
    for (const l of this.long) { const d = itemDef(l.id); l.inUse = !!(d && d.long === 'paddle' && l.id === want && !found); if (l.inUse) found = true; }
    if (!found) { const l = this.long.find((q) => (itemDef(q.id) || {}).long === 'paddle'); if (l) l.inUse = true; }
  }
  // A paddle put to use (profile.use): at an outfitter it goes into the canoe and the one it replaces is kept for you
  useLong(id) {
    const l = this.long.find((q) => q.id === id), was = this.long.find((q) => q.inUse);
    this.refreshUse();
    if (!l || !this.atStash || l.where === 'canoe' || l.where === 'hands') return;
    if (was && was !== l && was.where === 'canoe') { was.where = 'stash'; was.at = null; }
    l.where = 'canoe'; l.at = null; l.hand = null;
    this.emit('long');
  }
  // profile.give for a physical id: a container to the stash (or by you), a long item likewise, an item where it
  // fits best in reach, or the outfitters' crate
  give(id) {
    const d = itemDef(id); if (!d) return false;
    if (d.kind === 'container') { this.addContainer(id, this.atStash ? 'stash' : this.nearCanoe() ? 'canoe' : 'stash'); return true; }
    if (d.kind === 'long') { this.addLong(id, this.atStash ? 'stash' : 'canoe'); return true; }
    if (id === 'leeches') {
      const sh = this.shop;
      if (sh && sh.s && typeof sh.s.leeches === 'number' && !sh.usesInventory) return true; // the old shop counts them; the bridge in update() follows its count
      const have = this.count('leeches', { reachable: false });
      if (have >= 12) return false;
      if (!this.containers.some((c) => c.item === 'bucket')) this.addContainer('bucket', this.atStash ? 'stash' : 'canoe', null, { quiet: true });
      return this.place('leeches', 12 - have, { all: !this.attached, crate: true }).placed > 0;
    }
    return this.place(id, 1, { crate: true, all: !this.attached }).placed > 0;
  }
  // profile.take: one of an item gone (a lure lost to a snapped line), from what is in reach first
  remove(id, qty = 1) {
    let left = qty;
    for (const pool of [this.reachable(), this.containers]) for (const c of pool) for (const e of [...c.grid]) {
      if (!left) break;
      if (!e.box && e.id === id) { const n = Math.min(left, e.qty); this.take(c.id, e.uid, n); left -= n; }
    }
    if (left) {
      const i = this.long.findIndex((l) => l.id === id);
      if (i >= 0) { this.long.splice(i, 1); left--; this.refreshUse(); this.emit('long'); }
    }
    if (left) { const c = this.containers.find((k) => k.item === id && !k.grid.length && k.where !== 'in'); if (c) { this.containers.splice(this.containers.indexOf(c), 1); left--; this.emit('containers'); } }
    return left < qty;
  }

  // --- the world: carrying, setting down, loading, the stash ---------------------------------------------------------
  // Carry a container or a long item: on the back or the chest (a pack, a barrel), or in a hand (the rod, a paddle, the
  // bucket, the tackle box). 'auto' picks the back, then the chest, then a free hand. On foot only.
  carry(ref, slot = 'auto') {
    const t = this.thing(ref), p = this.player;
    if (!t) return no('gone', 'That is not here.');
    if (t.def.fixed) return no('fixed', `${t.def.name} stay where they are.`);
    if (p && !(p.mode === 'walk' || p.mode === 'carry') && !this.atStash) return no('afloat', 'In the canoe it rides in the hull.');
    if (!this.thingReachable(t)) return no('far', `${t.def.name} is out of reach.`);
    if (t.def.one) return no('fixed', ''); // a hand's holder is not a thing of its own
    const wear = t.def.wear || [], canHand = true; // fb3 B: hands take anything, a pack or a barrel too
    if (slot === 'auto') slot = wear.includes('back') && !this.worn('back') ? 'back' : wear.includes('chest') && !this.worn('chest') ? 'chest' : canHand && this.freeHand() >= 0 ? 'hands' : null;
    if (!slot) return no('full', 'Your back, your chest and your hands are full.');
    const o = t.obj;
    if (o.where === slot && slot !== 'hands') return ok();
    if (slot === 'back' || slot === 'chest') {
      if (t.kind !== 'container' || !wear.includes(slot)) return no('wear', `${t.def.name} doesn’t go on your ${slot}.`);
      const on = this.worn(slot); if (on && on !== o) return no('full', `${on.name} is on your ${slot} already.`);
    } else if (slot === 'hands') {
      if (!canHand) return no('wear', `${t.def.name} won’t go in one hand.`);
      if (o.where !== 'hands') { const h = this.freeHand(); if (h < 0) return no('full', 'Both hands are full.'); o.hand = h; }
    } else return no('slot', '');
    if (t.kind === 'container' && o.where === 'in') this.unnest(o);
    o.where = slot; o.at = null;
    if (slot !== 'hands') o.hand = null;
    this.emit('carry');
    return ok(slot === 'hands' ? `${t.def.name} in hand.` : `${t.def.name} on your ${slot}.`);
  }
  // Set it down on the ground at your feet (or at `at`): it stays there, with what is in it, until you come back for it
  setDown(ref, at = null, { left = true, quiet = false, force = false } = {}) {
    const t = this.thing(ref), p = this.player;
    if (!t) return no('gone', 'That is not here.');
    if (t.def.fixed) return no('fixed', '');
    if (t.def.one) return this.holderDown(t.obj, at, { quiet, force }); // fb3 B: the thing in the hand goes down, not the holder
    if (!force && !this.thingReachable(t)) return no('far', `${t.def.name} is out of reach.`);
    if (!at) {
      if (!p || !p.onFoot) return no('afloat', 'Not from the canoe: go ashore first.');
      at = this.spotNear(p.x, p.z, p.heading);
      // within a camp's area it is set out at camp (as packs.js Q does), from the book too
      const a = this.camp && typeof this.camp.reachArea === 'function' ? this.camp.reachArea() : null;
      if (a) at = { ...at, camp: a.key || 'camp' };
    }
    const o = t.obj;
    if (t.kind === 'container' && o.where === 'in') this.unnest(o);
    o.where = 'ground'; o.hand = null;
    o.at = { x: at.x, z: at.z, y: Number.isFinite(at.y) ? at.y : this.groundY(at.x, at.z), heading: Number.isFinite(at.heading) ? at.heading : p ? p.heading : 0, ...(left ? { left: true } : {}), ...(at.trail ? { trail: at.trail } : {}), ...(at.camp ? { camp: at.camp } : {}) };
    if (!quiet) this.emit('ground');
    return ok(`${t.def.name} set down.`);
  }
  // Into the canoe you are in or beside (at the outfitters, the canoe at the dock)
  load(ref) {
    const t = this.thing(ref), s = this.canoeSpot();
    if (!t) return no('gone', 'That is not here.');
    if (t.def.fixed) return no('fixed', '');
    if (t.def.one) return this.holderInto(t.obj, this.containers.filter((c) => c.where === 'canoe' && !this.spec(c).one && c.item !== 'stringer'), 'the canoe'); // fb3 B: the thing, into something in the canoe
    if (!s || (!this.nearCanoe() && !this.atStash)) return no('far', 'The canoe is not here.');
    if (s.overhead) return no('overhead', 'Not with the canoe on your shoulders.');
    if (!this.thingReachable(t)) return no('far', `${t.def.name} is out of reach.`);
    const o = t.obj;
    if (t.kind === 'container' && o.where !== 'canoe' && this.containers.filter((c) => c.where === 'canoe').length >= CANOE_ROOM) return no('full', 'The canoe is full.');
    if (t.kind === 'container' && o.where === 'in') this.unnest(o);
    o.where = 'canoe'; o.at = null; o.hand = null;
    this.emit('load');
    return ok(`${t.def.name} in the canoe.`);
  }
  // Leave it with the outfitters (at a store only): they keep it and ship it up the road
  stow(ref) {
    const t = this.thing(ref);
    if (!t) return no('gone', 'That is not here.');
    if (!this.atStash) return no('far', 'Only at an outfitter.');
    if (t.def.fixed) return no('fixed', '');
    if (t.def.one) return this.holderInto(t.obj, this.crate ? [this.crate] : [], 'the outfitters’ keeping'); // fb3 B
    const o = t.obj;
    if (t.kind === 'container' && o.where === 'in') this.unnest(o);
    o.where = 'stash'; o.at = null; o.hand = null;
    this.emit('stash');
    return ok(`${t.def.name}: kept for you at the outfitters.`);
  }
  // Hang a container from a tree (the food barrel, phase 2): at { x, y, z } (y the barrel's middle), the rope over a limb
  hang(ref, at) {
    const t = this.thing(ref); if (!t || t.kind !== 'container' || !at) return no('gone', '');
    const o = t.obj;
    if (o.where === 'in') this.unnest(o);
    o.where = 'hung'; o.hand = null; o.at = { x: at.x, y: at.y, z: at.z, heading: at.heading || 0, limb: Number.isFinite(at.limb) ? at.limb : at.y + 2.2 };
    this.emit('hung');
    return ok(`${t.def.name} hung.`);
  }
  // An item out onto the ground at your feet (a pile there, or the one already within a step)
  drop(cId, uid, qty = null) {
    const c = this.cont(cId), p = this.player; if (!c) return no('gone', '');
    const e = c.grid.find((q) => q.uid === uid); if (!e || e.fixed) return no('gone', '');
    if (e.box) return this.setDown(e.uid);
    if (!p || !p.onFoot) return no('afloat', 'Not from the canoe: go ashore first.');
    let pile = this.containers.find((k) => k.item === 'pile' && k.where === 'ground' && this.dist(k.at) < 1.5);
    if (!pile) { const s = this.spotNear(p.x, p.z, p.heading); pile = this.addContainer('pile', 'ground', { x: s.x, z: s.z, y: this.groundY(s.x, s.z), heading: p.heading, left: true }, { quiet: true }); }
    const n = qty == null ? e.qty : Math.min(e.qty, Math.max(1, qty | 0));
    if (!this.put(pile, e.id, { qty: n, data: e.data || null, quiet: true })) return no('full', 'No room there.');
    this.take(c.id, e.uid, n);
    return ok(`${itemDef(e.id).name} on the ground.`);
  }
  // the ground under a spot (the tiles' drawn ground, through the player)
  groundY(x, z) { const p = this.player; return p && typeof p.groundAt === 'function' ? p.groundAt(x, z) : 0; }

  // --- fb3 B: hands take anything, the fish to the hand, the stringer as a verb, the bottle, the verbs ----------------
  // Can this item go in a hand: any plain item (not a container or a long thing, which are carried whole: carry), on foot,
  // afloat (a catch) or at the stash
  canHand(itemId) {
    const d = itemDef(itemId);
    return !!(d && d.kind !== 'container' && d.kind !== 'long' && !d.fixed && d.id !== 'bottle');
  }
  // what holds a loose item in a hand: an armload for wood, the hand's holder for anything else
  holderFor(itemId) { const d = itemDef(itemId); return d && d.kind === 'firewood' ? 'woodarms' : 'inhand'; }
  // an entry (or qty of it) out of its container and into hand `hand` (0 the right, 1 the left; null: the free one)
  toHand(cId, uid, hand = null, qty = null) {
    const c = this.cont(cId); if (!c) return no('gone', 'That is not here.');
    const e = c.grid.find((q) => q.uid === uid); if (!e || e.fixed) return no('gone', 'That is not here.');
    if (e.box) { const k = this.cont(e.uid); const r = k ? this.carry(k.id, 'hands') : no('gone', ''); if (r.ok && hand != null && k) k.hand = this.handOf(k, hand); return r; }
    if (!this.canHand(e.id)) return no('wear', `${itemDef(e.id).name} won’t go in one hand.`);
    if (hand == null) hand = this.freeHand();
    if (hand < 0 || this.hands[hand]) return no('full', hand < 0 ? 'Both hands are full.' : 'That hand is full.');
    const h = this.addContainer(this.holderFor(e.id), 'hands', null, { quiet: true, hand });
    const spot = h ? this.firstFit(h, e.id) : null;
    if (!spot || !this.move(c.id, uid, h.id, spot.x, spot.y, spot.rot, qty)) { if (h) this.containers.splice(this.containers.indexOf(h), 1); return no('full', 'It won’t go in a hand.'); }
    this.emit('carry');
    return ok(`${itemDef(e.id).name}: in your ${hand === 1 ? 'left' : 'right'} hand.`);
  }
  // a new item (a fish just landed) into a free hand → { ok, why, words, cId }
  toHandNew(itemId, { data = null, qty = 1, hand = null } = {}) {
    if (!this.canHand(itemId)) return no('wear', '');
    if (hand == null) hand = this.freeHand();
    if (hand < 0 || this.hands[hand]) return no('full', 'Both hands are full.');
    const h = this.addContainer(this.holderFor(itemId), 'hands', null, { quiet: true, hand });
    if (!h || !this.put(h, itemId, { qty, data, quiet: true })) { if (h) this.containers.splice(this.containers.indexOf(h), 1); return no('full', ''); }
    this.emit('carry');
    return { ...ok(`${itemDef(itemId).name}: in your ${hand === 1 ? 'left' : 'right'} hand.`), cId: h.id };
  }
  handOf(c, want) { const other = this.hands[want]; return other && other.container !== c.id && other.long !== c.id ? c.hand : want; }
  // the thing in a hand's holder down on the ground (setDown on the holder): into the pile at your feet
  holderDown(h, at = null, { quiet = false, force = false } = {}) {
    const e = h.grid[0]; if (!e) return no('gone', '');
    const p = this.player;
    if (!force && !(p && p.onFoot)) return no('afloat', 'Not from the canoe: go ashore first.');
    const r = this.drop(h.id, e.uid);
    if (!r.ok) return r;
    if (!quiet) this.emit('ground');
    return r;
  }
  // the thing in a hand's holder into the first of `cs` with room (the canoe's containers, the crate)
  holderInto(h, cs, where) {
    const e = h.grid[0]; if (!e) return no('gone', '');
    for (const c of cs) { const s = this.firstFit(c, e.id); if (s && this.move(h.id, e.uid, c.id, s.x, s.y, s.rot)) return ok(`${itemDef(e.id).name}: into the ${lower(c.name)}.`); }
    return no('full', `Nothing in ${where} has room for it.`);
  }
  // the stringer within reach (in the canoe you are in or beside, in a hand, on the ground within a step, or in a pack
  // you carry), or null (decision 1: Put on the stringer is a verb only then)
  stringerInReach() { const k = this.ctx(); return this.containers.find((c) => c.item === 'stringer' && this.inReach(c, k)) || null; }
  toStringer(cId, uid) {
    const st = this.stringerInReach(); if (!st) return no('far', 'The stringer is not in reach.');
    const c = this.cont(cId), e = c && c.grid.find((q) => q.uid === uid);
    if (!e) return no('gone', '');
    if (c === st) return no('there', 'It is on the stringer.');
    const s = this.firstFit(st, e.id);
    if (!s) return no('full', 'The stringer is full.');
    return this.move(c.id, uid, st.id, s.x, s.y, s.rot) ? ok(`${itemDef(e.id).name}: on the stringer.`) : no('full', 'It won’t go on the stringer.');
  }
  // the book's right-click: the verbs that are the inventory's (hand on an entry, stringer, drink, drinkup, change,
  // tarp; fb4 C: eat, cook and tie too), each { enabled, why, label?, run, needs, next } (fb4 C: a greyed verb says why
  // as a checklist and the next step) or null for an id that is not ours
  verb(id, ref) {
    const r = this.refOf(ref);
    const en = this.energy, p = this.player;
    const grey = (why, needs = [], next = '', label = null) => ({ enabled: false, why, label, needs: needs.filter(Boolean), next, run: () => {} });
    const go = (fn, label = null, needs = [], next = '') => ({ enabled: true, why: null, label, needs: needs.filter(Boolean), next, run: fn });
    const fromCheck = (c, fn, label = null) => (c.ok || c.enabled ? go(fn, label, c.needs || [], c.next || '') : grey(c.why, c.needs || [], c.next || '', label));
    switch (id) {
      case 'hand': {
        if (!r || !r.e) return null;
        if (r.e.fixed) return grey('It stays where it is', [], r.e.id === 'bottle' ? 'Drink from it where it is: right-click › Drink' : '');
        if (r.c && this.spec(r.c).one) return grey('In your hand already', [NEED.step('In a hand', true)], 'Drag it into a pack to put it away, or onto the ground');
        if (!this.canHand(r.e.id) && !r.e.box) return grey('It won’t go in one hand', [], 'Carry it on your back or chest: drag its strap there');
        if (p && !(p.onFoot || p.mode === 'paddle') && !this.atStash) return grey('Not now', [NEED.step('On foot, or sitting in the canoe', false)], 'Finish what you are doing first');
        if (this.freeHand() < 0) return grey('Both hands are full', [NEED.qty('A free hand', 0, 1)], `Put down or away what is in a hand: ${this.handsWords() || 'drag it into a pack'}`);
        return go(() => this.toHand(r.c.id, r.e.uid), null, [NEED.qty('A free hand', 1, 1)]);
      }
      case 'stringer': {
        if (!r || !r.e) return null;
        const st = this.stringerInReach();
        if (!st) { const w = this.stringerWhere(); return grey('The stringer is not in reach', [NEED.step('The stringer in reach', false, w.note ? { note: w.note } : {})], w.next); }
        if (r.c === st) return grey('It is on the stringer', [NEED.step('On the stringer', true)], 'Fry it on the grate at a fire, or keep it there till supper');
        if (!this.firstFit(st, r.e.id)) return grey('The stringer is full', [NEED.step('Room on the stringer', false, { note: `${st.grid.length} fish on it` })], 'Cook one, or let one go first');
        return go(() => this.toStringer(r.c.id, r.e.uid), null, [NEED.step('The stringer in reach', true)]);
      }
      case 'drink': case 'drinkup': {
        if (!en || typeof en.drink !== 'function') return grey('Not now');
        const d = en.drinkCheck ? en.drinkCheck() : { ok: true };
        return fromCheck(d, () => en.drink(id === 'drinkup' ? Infinity : 0.25));
      }
      case 'change': {
        if (!r || !r.e || !en || typeof en.changeClothes !== 'function') return null;
        const d = en.changeCheck ? en.changeCheck(r.e) : { ok: true };
        return fromCheck(d, () => en.changeClothes(r.e));
      }
      case 'tarp': {
        // fb4 E's rig (tarp.js, window.__game.tarp.verb) when it is in the build; else last round's Pitch over…
        const g = typeof window !== 'undefined' ? window.__game : null, t = g && g.tarp;
        if (r && r.e && t && typeof t.verb === 'function') { try { return t.verb(r.c, r.e); } catch (err) { console.warn('tarp.verb', err); } }
        const ch = this.chores || (this.camp && this.camp.chores);
        if (!r || !r.e || !ch || typeof ch.tarpVerb !== 'function') return null;
        return ch.tarpVerb(r.c, r.e);
      }
      case 'eat': {
        if (!r || !r.e) return null;
        const d = itemDef(r.e.id);
        if (!d || !d.eat) return null;
        if (d.eat.cook && !(r.e.data && r.e.data.cooked)) {
          const k = this.fireNear(), c = k && k.cook && typeof k.cook.cookCheck === 'function' ? k.cook.cookCheck(k.site, k.key, d) : null;
          const needs = [NEED.step('Cooked first', false), ...(k && typeof k.cook.needsFor === 'function' ? k.cook.needsFor(k.key, d) : [NEED.step('A campsite’s fire ring within reach', false)])];
          return grey('Cook it first', needs, c ? (c.enabled ? 'Right-click › Cook, or drag it onto the grate in the fire’s card' : c.next) : `Cook it at a campsite’s fire ring: E at the ring opens the fire${d.kind === 'fish' ? '; it fries in the pot’s lid, or on a stick' : ''}`);
        }
        const reach = !!this.findUid(r.e.uid, { reachable: true }) || this.foodPool().some((c) => c.grid.includes(r.e));
        if (!reach) return grey('Out of reach', [NEED.step('In reach', false, { note: 'carried, within 3 m, or in the canoe beside you' })], 'Walk to it, or bring it with you');
        if (!this.still()) return grey('Hold still to eat', [NEED.step('Standing still', false)], 'Let go of the keys a moment, then Eat');
        const n = d.servings || 1, left = Number.isFinite(r.e.left) ? r.e.left : n;
        return go(() => this.eat(r.e.uid), null, [], n > 1 ? `A serving now: ${left - 1 > 0 ? `${left - 1} of ${n} left after` : 'the last one'}` : '');
      }
      case 'cook': {
        if (!r || !r.e) return null;
        const d = itemDef(r.e.id);
        if (!d || !d.eat || !d.eat.cook) return null;
        const k = this.fireNear();
        if (!k || !k.cook || typeof k.cook.cookCheck !== 'function') return grey('Only at a fire ring', [NEED.step('A campsite’s fire ring within 4 m', false)], 'Walk to a campsite’s fire ring: E at the ring opens the fire');
        const onGrate = !!(r.c && r.c.item === 'grate');
        const c = k.cook.cookCheck(k.site, k.key, onGrate ? null : d);
        if (!c.enabled) return grey(c.why, c.needs, c.next);
        const g = onGrate ? r.c : k.chores.grate(k.key, k.site);
        if (!onGrate && (!g || !this.firstFit(g, r.e.id))) return grey('The grate is full', [NEED.step('Room on the grate', false)], 'Take what is on the grate off it first');
        return go(() => {
          if (!onGrate) { const s2 = this.firstFit(g, r.e.id); if (!s2 || !this.move(r.c.id, r.e.uid, g.id, s2.x, s2.y, s2.rot, 1)) return no('full', 'No room on the grate.'); }
          return k.cook.cookNow(k.site, k.key) ? ok('') : no('not', 'Not now.');
        }, null, c.needs, c.next);
      }
      case 'tie': {
        if (!r || !r.e) return null;
        const d = itemDef(r.e.id), f = this.fishing, sh = this.shop;
        if (!d || !d.lure || !f) return null;
        const lure = sh && typeof sh.lureOf === 'function' ? sh.lureOf(r.e.id) : null;
        if (!f.rodUp) {
          const foot = !!(p && p.onFoot), inHand = foot && typeof f.rodInHand === 'function' ? f.rodInHand() : false;
          return grey('Take the rod up first', [...(foot ? [NEED.step('The rod in a hand', inHand)] : []), NEED.step('The rod up: F', false)], foot && !inHand ? 'The rod into a hand first (drag it to a hand), then F' : 'Press F to take the rod up, then Tie it on');
        }
        if (!lure || typeof sh.tieOn !== 'function') return null;
        return go(() => { sh.tieOn(lure); return ok(`Tied on: ${d.name}.`); }, null, [NEED.step('The rod up', true)]);
      }
      default: return null;
    }
  }
  // what is in your hands, in words ("the trail mix and the leech bucket")
  handsWords() {
    const out = [];
    for (const h of this.hands) {
      if (!h) continue;
      if (h.long) { const l = this.longOf(h.long); if (l) out.push(`the ${lower(itemDef(l.id).name)}`); continue; }
      const c = this.cont(h.container); if (!c) continue;
      const e = c.item === 'inhand' ? c.grid[0] : null;
      out.push(e ? `the ${lower(itemDef(e.id).name)}` : c.item === 'woodarms' ? 'the armload of wood' : `the ${lower(c.name)}`);
    }
    return out.join(' and ');
  }
  // where the stringer is, for its verb's checklist: { note, next }
  stringerWhere() {
    const st = this.containers.find((c) => c.item === 'stringer'), p = this.player;
    if (!st) return { note: 'you have none', next: 'A stringer comes with the canoe at the outfitters' };
    const r = this.root(st);
    if (r.where === 'canoe') { const sp = this.canoeSpot(), d = sp && p ? this.hullDist(sp, p.x, p.z) : null; return { note: d != null ? `in the canoe, ${d.toFixed(1)} m off: in reach within ${HULL_REACH} m` : 'in the canoe', next: 'Walk to the canoe (within 3 m of it), or take the stringer in a hand' }; }
    if (r.where === 'ground' || r.where === 'hung') return { note: `on the ground, ${this.dist(r.at).toFixed(1)} m off: in reach within ${REACH} m`, next: 'Walk to it, or take it in a hand' };
    if (r.where === 'stash') return { note: 'kept at the outfitters', next: 'Take it out at the counter next time in' };
    return { note: '', next: 'Take the stringer in a hand' };
  }
  // the fire ring within reach (a campsite's, free or yours), for Cook and Eat: { site, key, chores, cook } or null
  fireNear(r = 4) {
    const cp = this.camp, p = this.player, ch = this.chores || (cp && cp.chores);
    if (!cp || !p || !ch || typeof cp.nearestSite !== 'function' || p.mode !== 'walk') return null;
    const site = cp.nearestSite(p.x, p.z, r, true);
    if (!site || !site.layout || !site.layout.fire) return null;
    const key = `${Math.round(site.x)}:${Math.round(site.z)}`; // (camp.js campKey)
    const h = cp.registry && typeof cp.registry.holder === 'function' ? cp.registry.holder(key) : null;
    if (h && h !== 'player') return null;
    return { site, key, chores: ch, cook: ch.cook };
  }

  // --- fb4 C: an item's state and the next step (the book's tooltip and the mark on its icon) ---------------------------
  get now() { const en = this.energy; return en && Number.isFinite(en.now) ? en.now : 0; }
  timerWords(sec) { return timerWords(sec); }
  // ref: a grid entry, { cId, uid }, { container: cId } (a container's own state), a container, or { long: uid }
  status(ref) {
    if (!ref) return null;
    try {
      if (ref.item && Array.isArray(ref.grid)) return this.containerStatus(ref);
      if (ref.container || ref.long) { const t = this.thing(ref); return t && t.kind === 'container' ? this.containerStatus(t.obj) : null; }
      let c = null, e = null;
      if (ref.id != null && ref.uid != null && 'x' in ref) { e = ref; const hit = this.findUid(e.uid); c = hit ? hit.c : null; } else { const h = this.refOf(ref); if (h && h.e) { c = h.c; e = h.e; } }
      if (!e) return null;
      if (e.box) { const k = this.cont(e.uid); return k ? this.containerStatus(k) : null; }
      return this.entryStatus(c, e);
    } catch (err) { console.warn('inventory.status', err); return null; }
  }
  entryStatus(c, e) {
    const d = itemDef(e.id), en = this.energy, now = this.now;
    if (!d) return null;
    if (e.id === 'bottle') return en && typeof en.bottleStatus === 'function' ? en.bottleStatus() : null;
    if (e.id === 'clothes') return en && typeof en.clothesStatus === 'function' ? en.clothesStatus(e) : null;
    if (e.id === 'sleepingbag' && this.gearWet()) { const g = this.gearDrying(); return { label: 'Damp', mark: g.byFire ? 'drying' : 'wet', timer: g.sec, running: g.byFire, ...(g.byFire ? { until: now + g.sec / 3600 } : {}), next: `Your gear is damp: a night in it is 80 % as warm. ${g.byFire ? `Dry in ${timerWords(g.sec)} by the fire` : 'It dries by a lit fire in 30 min: stand within 6 m of it'}` }; }
    if (e.id === 'pot' && c && c.item === 'grate') { const ck = this.cookRef(); return ck && typeof ck.potStatus === 'function' ? ck.potStatus(c, e) : null; }
    if (d.kind === 'firewood') return this.woodStatus(c, e);
    if (d.cooked && e.data && Number.isFinite(e.data.until)) {
      const left = (e.data.until - now) * 3600;
      if (left <= 0) return null;
      const hot = Number.isFinite(e.data.cooked) && now - e.data.cooked < 1;
      return { label: hot ? 'Hot' : 'Leftovers', mark: hot ? 'hot' : null, timer: Math.round(left), running: true, until: e.data.until, next: `Eat it (right-click › Eat), or it goes off in ${timerWords(left)}` };
    }
    if (d.eat && d.eat.cook) return { label: 'Raw', mark: null, next: d.kind === 'fish' ? 'Fry it on the grate at a fire (in the pot’s lid, or on a stick); or Put on the stringer to keep it' : 'Cook it: the pot on the grate, this beside it, the fire burning (E at the ring)' };
    const n = Number.isFinite(d.servings) ? d.servings : Number.isFinite(d.uses) ? d.uses : 1;
    if (n > 1) {
      const left = Number.isFinite(e.left) ? e.left : n, unit = d.servings > 1 ? 'servings' : 'left';
      if (left <= Math.max(1, Math.floor(n * 0.2))) return { label: `${left} of ${n} ${unit === 'left' ? 'left' : unit}`, mark: 'low', next: d.id === 'tablets' ? 'More at any outfitter’s counter; one goes in each time you fill the bottle' : left <= 1 ? 'The last one' : 'Running low' };
      if (left < n) return { label: `${left} of ${n} ${unit === 'left' ? 'left' : unit}`, mark: null, next: d.servings > 1 ? 'A serving at a time: right-click › Eat, standing still' : d.id === 'tablets' ? 'One goes in each time you fill the bottle' : '' };
    }
    return null;
  }
  // wood: wet (with its drying at the rate it dries now), drying by a fire, or on a lit fire
  woodStatus(c, e) {
    const w = e.data && e.data.wet > 0 ? e.data.wet : 0, rate = this.wetRate(c), now = this.now;
    if (w > 0) {
      const sec = rate > 0 ? (w / rate) * 3600 : null, byFire = rate > 1.5;
      return { label: byFire ? 'Drying' : 'Wet', mark: byFire ? 'drying' : 'wet', ...(sec != null ? { timer: Math.round(sec), running: true, until: now + sec / 3600 } : {}), next: rate <= 0 ? 'Out of the rain first: under the tarp or into a pack, then 30 min by a lit fire' : byFire ? `Dry in ${timerWords(sec)}: it won’t light till then` : 'Wet: it won’t light. Dries by a lit fire in 30 min (on it or within 2 m), 3 h in dry air' };
    }
    const F = this.firesRef();
    if (c && c.item === 'firefuel' && c.at && F && F.isLit(c.at.fuel)) return { label: 'On the fire', mark: 'burning', next: 'Burns in turn: the fire takes the next piece itself at an hour left' };
    return null;
  }
  // a container's own state: rained on, in the rain now, or damp gear
  containerStatus(c) {
    const d = itemDef(c.item); if (!d) return null;
    const r = this.root(c), now = this.now;
    if (r.where === 'ground' && r.at && d.wear) {
      // (stream E's chores.js: at.wet once half an hour of rain is in it, at.rainH the hours of rain so far)
      if (r.at.wet || r.at.rainH >= 0.5) return { label: 'Rained on', mark: 'wet', next: 'The gear in it is wet: it dries by a lit fire in 30 min (stand within 6 m). A tarp over it keeps the rain off' };
      const rain = this.rainAt(c);
      if (rain > 0.3 && r.at.rainH > 0) { const sec = Math.max(0, ((0.5 - r.at.rainH) / rain) * 3600); return { label: 'In the rain', mark: 'wet', timer: Math.round(sec), running: true, until: now + sec / 3600, next: `Pick it up, or get the tarp over it: it soaks through ${sec < 60 ? 'any moment' : `in ${timerWords(sec)}`}` }; }
    }
    if (d.wear && this.gearWet() && r.where !== 'stash') { const g = this.gearDrying(); return { label: 'Damp gear', mark: g.byFire ? 'drying' : 'wet', timer: g.sec, running: g.byFire, ...(g.byFire ? { until: now + g.sec / 3600 } : {}), next: g.byFire ? `Dry in ${timerWords(g.sec)}: stay by the fire` : 'Dries by a lit fire in 30 min: stand within 6 m of it' }; }
    return null;
  }
  // the trip's gear wet (trip.state.wet: rain into a pack on the ground, a night with no fly), and its drying by a fire
  // (camp.js rest: half an hour within 6 m of a lit fire)
  gearWet() { const t = this.trip; return !!(t && t.adventure && t.state && t.state.wet); }
  gearDrying() {
    const cp = this.camp, F = this.firesRef(), p = this.player, f = F && F.near;
    const byFire = !!(f && p && f.heat > 0.05 && Math.hypot(f.x - p.x, f.z - p.z) < 6);
    const done = cp && Number.isFinite(cp.dry) ? cp.dry : 0;
    return { sec: Math.round(Math.max(0, 0.5 - done) * 3600), byFire };
  }
  firesRef() { const cp = this.camp, ch = this.chores || (cp && cp.chores); return (ch && ch.fires) || (cp && cp.fires) || null; }
  cookRef() { const cp = this.camp, ch = this.chores || (cp && cp.chores); return ch ? ch.cook : null; }

  // --- fb4 C: wet wood --------------------------------------------------------------------------------------------------
  // where a container is: { x, z } (on the ground or hung: its spot; carried: you; in the canoe: the canoe), or null
  posOf(c) {
    const r = this.root(c), p = this.player;
    if ((r.where === 'ground' || r.where === 'hung') && r.at) return { x: r.at.x, z: r.at.z };
    if (r.where === 'canoe') { const sp = this.canoeSpot(); return sp ? { x: sp.x, z: sp.z } : null; }
    if (['back', 'chest', 'hands', 'pockets'].includes(r.where) && p) return { x: p.x, z: p.z };
    return null;
  }
  // the rain falling on an open container (a ring's fuel, a pile, an armload, a hand), 0–1: none under the tarp (fb4 E's
  // tarp.covers, else last round's tarp over the ring or the pack)
  rainAt(c, pos = this.posOf(c)) {
    const r = this.root(c), en = this.energy, ch = this.chores || (this.camp && this.camp.chores);
    if (['back', 'chest', 'hands', 'pockets'].includes(r.where)) return en && typeof en.rainOn === 'function' ? en.rainOn() : 0;
    let rain = 0;
    try { rain = ch && typeof ch.rainNow === 'function' ? ch.rainNow() : en && typeof en.rainOn === 'function' ? en.rainOn() : 0; } catch { rain = 0; }
    if (!(rain > 0) || !pos) return 0;
    const g = typeof window !== 'undefined' ? window.__game : null, t = g && g.tarp;
    try {
      if (t && typeof t.covers === 'function') return t.covers(pos.x, pos.z) ? 0 : rain;
      if (ch && c.item === 'firefuel' && c.at && typeof ch.tarpOverRing === 'function' && ch.tarpOverRing(c.at.fuel)) return 0;
      if (ch && typeof ch.tarpOverContainer === 'function' && ch.tarpOverContainer(r)) return 0;
    } catch { /* the tarp is a nicety */ }
    return rain;
  }
  // how fast wet wood in c dries now: WOOD_DRY.air / WOOD_DRY.fire by a lit fire (its own ring, or one within 2 m), 1 in
  // dry air, 0 with rain on it (inside a pack the rain does not reach it)
  wetRate(c, pos = c ? this.posOf(c) : null) {
    if (!c) return 1;
    const F = this.firesRef(), fast = WOOD_DRY.air / WOOD_DRY.fire;
    if (OPEN.has(c.item) && this.rainAt(c, pos) > 0.3) return 0;
    if (c.item === 'firefuel' && c.at && F && F.isLit(c.at.fuel)) return fast;
    if (pos && F && F.fires) for (const f of F.fires.values()) if (F.isLit(f.key) && Math.hypot(f.at.x - pos.x, f.at.z - pos.z) < 2) return fast;
    return 1;
  }
  // A few times a second (update): the wood gets wet in the rain and dries. The ring's wood is wet when chores.js pushes
  // its wetUntil on (rain on an open ring for its wetAfter); a pile's or an armload's after WET_AFTER hours of rain on it.
  // A wet piece dries at wetRate; data.wet is game hours of drying left in dry air.
  syncWet(now) {
    const last = Number.isFinite(this.wetT) ? this.wetT : now, p = this.player;
    this.wetT = now;
    const dh = Math.max(0, Math.min(12, now - last));
    let wetted = 0, dried = 0, dirty = false;
    for (const c of this.containers) {
      if (!c.grid.some((e) => !e.box && isWood(e.id))) continue;
      const r = this.root(c);
      if (r.where === 'stash' || r.where === 'in' && !this.cont(c.in)) continue;
      const pos = this.posOf(c);
      if (pos && p && (Math.abs(pos.x - p.x) > 150 || Math.abs(pos.z - p.z) > 150)) continue; // far off: as it was
      let wetNow = false;
      if (c.item === 'firefuel' && c.at) {
        const wu = Number.isFinite(c.at.wetUntil) ? c.at.wetUntil : 0;
        if (wu > now && wu > (c.at.wetSeen || 0) + 1e-6) wetNow = true;
        c.at.wetSeen = wu;
      } else if (OPEN.has(c.item) && dh > 0) {
        const rain = this.rainAt(c, pos);
        if (rain > 0.3) { c.rainWood = (c.rainWood || 0) + dh * rain; if (c.rainWood >= WET_AFTER) wetNow = true; } else if (c.rainWood) c.rainWood = Math.max(0, c.rainWood - dh * 0.5);
      }
      const rate = wetNow ? 0 : this.wetRate(c, pos);
      for (const e of c.grid) {
        if (e.box || !isWood(e.id)) continue;
        if (wetNow) { if (!(e.data && e.data.wet >= WOOD_DRY.air - 1e-6)) { if (!(e.data && e.data.wet > 0) && c.item !== 'firefuel') wetted++; e.data = { ...(e.data || {}), wet: WOOD_DRY.air }; dirty = true; } continue; }
        if (e.data && e.data.wet > 0 && rate > 0 && dh > 0) {
          e.data.wet -= dh * rate; dirty = true;
          if (e.data.wet <= 1e-4) { delete e.data.wet; if (!Object.keys(e.data).length) delete e.data; dried++; }
        }
      }
    }
    if (wetted && this.hud) this.hud.note('The rain has wet the wood through: it won’t light until it dries (30 min by a lit fire, 3 h in dry air). A tarp keeps it dry.', 6);
    if (dried) { if (this.hud && !this.driedNoted) this.hud.note(`The wet wood has dried${dried > 1 ? `: ${dried} pieces` : ''}.`, 4); this.emit('items'); }
    else if (wetted || dirty) { if (wetted) this.emit('items'); else this.dirty = true; }
  }

  // a verb's ref → { c, e } (an entry) or { thing } (a container or a long item by its strap)
  refOf(ref) {
    if (!ref) return null;
    if (ref.uid != null) { const c = ref.cId != null ? this.cont(ref.cId) : null, e = c ? c.grid.find((q) => q.uid === ref.uid) : null; if (e) return { c, e }; const hit = this.findUid(ref.uid); return hit ? { c: hit.c, e: hit.e } : null; }
    const t = this.thing(ref.container || ref.long || ref);
    return t ? { thing: t } : null;
  }
  // the bottle's entry follows the bottle (energy.js): the litres in it and what is under a tablet, so the book's bar
  // shows it (fb3 B: nothing is drunk for you, so it changes on a Drink, a fill or the pot)
  syncBottle() {
    const en = this.energy, e = this.bottleEntry;
    if (!en || !e || !Number.isFinite(en.bottle)) return;
    const l = Math.round(en.bottle * 100) / 100, t = Math.round((en.treating || 0) * 100) / 100;
    if (e.left === l && (e.treating || 0) === t) return;
    e.left = l; if (t > 0) e.treating = t; else delete e.treating;
    this.emit('bottle');
  }
  // a clear spot beside you to set a thing down (packs.js knows the ground; without it, a step to the right)
  spotNear(x, z, heading, side = 1, fwd = 1) {
    const pk = this.player && this.player.packs;
    if (pk && typeof pk.spotNear === 'function') return pk.spotNear(x, z, heading, side, fwd);
    const rx = Math.sin(heading), rz = Math.cos(heading);
    return { x: x + rx * 0.9 * side, z: z + rz * 0.9 * side };
  }
  groundSpots() { const out = []; for (const c of this.containers) if (c.where === 'ground' && c.at) out.push(c.at); for (const l of this.long) if (l.where === 'ground' && l.at) out.push(l.at); return out; }

  // --- each frame (main.js fb A, after the packs) -------------------------------------------------------------------------
  update(dt) {
    if (!this.attached) return;
    const p = this.player;
    // fb3 B (the owner's 2026-10-25 round, decision 1: nothing moves by itself): what rides on your body stays there when
    // you push off; nothing is stowed into the hull for you any more (it was stowCarried on the change to 'paddle', and
    // again on any change while afloat). stowCarried stays for the rides, the evacuation and the teleports that mean it.
    if (p && p.mode !== this.prevMode) this.prevMode = p.mode;
    if (this.pendingNote && this.hud) { this.hud.note(this.pendingNote, 9); this.pendingNote = null; }
    if (this.fishing && Array.isArray(this.fishing.stringer)) this.syncStringer();
    this.bridgeLeeches();
    this.syncBottle();
    if ((this.wetTick = (this.wetTick || 0) - dt) <= 0) { this.wetTick = 0.25; try { this.syncWet(this.now); } catch (err) { console.warn('inventory.syncWet', err); } } // fb4 C
    // a hand's holder with nothing in it is no thing at all; one that left the hands (stream A's push-off puts what is
    // in the hands into the hull) gives its thing to something where it went
    for (let i = this.containers.length - 1; i >= 0; i--) {
      const c = this.containers[i];
      if (c.item !== 'inhand') continue;
      if (c.grid.length && c.where !== 'hands' && c.where !== 'in') { const r = this.holderInto(c, this.containers.filter((k) => k !== c && k.where === c.where && !this.spec(k).one && k.item !== 'stringer' && k.item !== 'crate' && (c.where !== 'ground' || (k.at && c.at && Math.hypot(k.at.x - c.at.x, k.at.z - c.at.z) < 2))), c.where); if (!r.ok && c.where === 'ground' && c.at) { const pile = this.addContainer('pile', 'ground', { ...c.at }, { quiet: true }); this.holderInto(c, [pile], 'the ground'); } }
      if (!c.grid.length) { this.containers.splice(i, 1); this.emit('containers'); }
    }
    // a word, once, as you paddle away from something left on the shore (it stays there until you come back for it)
    if (p && p.mode === 'paddle' && this.hud && (this.noteT = (this.noteT || 0) + dt) > 1) {
      this.noteT = 0;
      const left = [...this.containers.filter((c) => c.where === 'ground' && c.item !== 'pile'), ...this.long.filter((l) => l.where === 'ground')].filter((t) => t.at && !t.at.camp && !t.at.noted && this.dist(t.at) > 60);
      if (left.length) {
        for (const t of left) t.at.noted = true;
        const n = left.map((t) => { const nm = itemDef(t.item || t.id).name; return `the ${/^(Duluth|Johnson)/.test(nm) ? nm : lower(nm)}`; });
        this.hud.note(`Left behind on the shore: ${n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0]}. ${left.length > 1 ? 'They stay' : 'It stays'} there until you come back.`, 6);
      }
    }
    // empty piles go
    for (let i = this.containers.length - 1; i >= 0; i--) { const c = this.containers[i]; if (c.item === 'pile' && !c.grid.length) { this.containers.splice(i, 1); this.dirty = true; } }
    if (this.dirty && (this.saveT += dt) > SAVE_EVERY) this.write();
  }
  // what you carry goes into the canoe (a launch, a teleport, a ride, an evacuation); with camp true the packs set out
  // at a camp too (nothing asks that since the camp redone: what you leave at camp stays there until you fetch it)
  stowCarried(camp = false) {
    let moved = false;
    for (const c of this.containers) if (c.where === 'back' || c.where === 'chest' || c.where === 'hands' || (camp && c.where === 'ground' && c.at && c.at.camp && !c.at.left)) { c.where = 'canoe'; c.hand = null; c.at = null; moved = true; }
    for (const l of this.long) if (l.where === 'hands') { l.where = 'canoe'; l.hand = null; moved = true; }
    if (moved) this.emit('load');
    return moved;
  }
  // The stringer: fishing.js keeps fishing.stringer, a plain array of { species, length } (K pushes one, camp.js splices
  // one to cook, an evacuation empties it). It is rebuilt each frame from the stringer container's fish; a fish pushed
  // since goes onto the stringer (or into a container in reach that takes fish), one taken since leaves the inventory.
  syncStringer(first = false) {
    const arr = this.fishing.stringer;
    // nothing to do when no fish came or went and the inventory has not changed since the last time
    if (!first && this.stringerVer === this.ver && arr.length === this.lastStringer.size && arr.every((f) => f && f.uid && this.lastStringer.has(f.uid))) return;
    const st = this.containers.find((c) => c.item === 'stringer' && this.rootWhere(c) === 'canoe') || this.containers.find((c) => c.item === 'stringer');
    if (!first) {
      const present = new Set(arr.map((f) => f && f.uid).filter(Boolean));
      for (const uid of this.lastStringer) if (!present.has(uid)) { const hit = this.findUid(uid); if (hit) this.take(hit.c.id, uid); }
      for (const f of arr) if (f && !f.uid && f.species) {
        const id = `fish:${f.species}`, data = { length: +f.length || 30 };
        const r = st && this.put(st, id, { data, quiet: true }) ? { ok: true } : this.place(id, 1, { data, quiet: true });
        if (!r.ok && this.fishing) this.fishing.message = { text: 'No room to keep it: you let it go.', t: 3 };
        this.emit('fish');
      }
    }
    arr.length = 0;
    this.lastStringer = new Set();
    if (st) for (const e of st.grid) if (!e.box && (itemDef(e.id) || {}).kind === 'fish') { arr.push({ species: e.id.slice(5), length: e.data && e.data.length ? e.data.length : 30, uid: e.uid }); this.lastStringer.add(e.uid); }
    this.stringerVer = this.ver;
  }
  // The hubs' shop (shop.js) counts the leeches itself (shop.s.leeches) until stream B's shop reads the inventory
  // (shop.usesInventory): while it does, the inventory's leeches follow its count.
  oldLeeches() { const sh = this.shop; return sh && sh.s && typeof sh.s.leeches === 'number' && !sh.usesInventory ? sh.s.leeches : null; }
  bridgeLeeches() {
    const n = this.oldLeeches(); if (n == null) { this.seenLeeches = null; return; }
    if (this.seenLeeches == null || this.leechSeason !== this.season) { this.seenLeeches = n; this.leechSeason = this.season; return; } // a new season starts the shop's count over
    if (n === this.seenLeeches) return;
    const d = n - this.seenLeeches; this.seenLeeches = n;
    if (d < 0) this.remove('leeches', -d);
    else { if (!this.containers.some((c) => c.item === 'bucket')) this.addContainer('bucket', this.atStash ? 'stash' : 'canoe', null, { quiet: true }); this.place('leeches', d, { crate: true, all: true, prefer: this.containers.filter((c) => c.item === 'bucket').map((c) => c.id) }); }
  }

  // --- a summary for the readout and the tests -----------------------------------------------------------------------------
  describe(c) {
    const k = this.root(c), w = k.where;
    if (c.where === 'in') return `in the ${lower(this.cont(c.in) ? this.cont(c.in).name : 'pack')}`;
    return { back: 'on your back', chest: 'on your chest', hands: 'in hand', pockets: 'on you', canoe: 'in the canoe', stash: 'at the outfitters', hung: 'hung in a tree', ground: k.at && k.at.camp ? 'set out at camp' : 'on the ground' }[w] || w;
  }
  report() {
    return {
      containers: this.containers.map((c) => ({ id: c.id, item: c.item, where: c.where, in: c.in, at: c.at ? { x: Math.round(c.at.x), z: Math.round(c.at.z) } : null, n: c.grid.length, kg: +this.kgOf(c).toFixed(1), reach: this.inReach(c) })),
      long: this.long.map((l) => ({ uid: l.uid, id: l.id, where: l.where, inUse: l.inUse, reach: this.longReachable(l) })),
      carried: +this.carriedKg().toFixed(1), meals: this.meals(), snacks: this.snacks(),
    };
  }
}

function readJSON(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; } }

// the one inventory (stream B's inv-ui.js and the others import it; main.js attaches it)
export const inventory = new Inventory();
export { FOOD_KINDS };
