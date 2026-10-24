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
//
// Saved in its own namespace (`bwca-canoe:inventory`), tied to the profile's season (profile.seasonId). A season from
// before the items migrates once (migrate()): the kit and the owned items, the packs, the days of food, the lures, the
// leeches and the stringer become items in containers in the canoe.
import { ITEMS, itemDef, sizeOf, fishKg, LEGACY, STARTER_KIT, FOOD_KINDS } from './items.js';
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
const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);
const ok = (words = '') => ({ ok: true, why: null, words });
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
    this.dirty = true;
    for (const fn of this.handlers) { try { fn(what, this); } catch (e) { console.warn('inventory.onChange', e); } }
  }
  write() {
    this.dirty = false; this.saveT = 0;
    save.write(NS, this.serialize());
  }
  serialize() {
    return { v: VERSION, season: this.season, n: this.n, containers: this.containers.map((c) => ({ ...c, grid: c.grid.map((e) => ({ ...e })), at: c.at ? { ...c.at } : null })), long: this.long.map((l) => ({ ...l, at: l.at ? { ...l.at } : null })) };
  }
  restore(s) {
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
  // the pockets and the outfitters' crate are always there
  ensureFixed() {
    if (!this.containers.some((c) => c.item === 'pockets')) this.containers.unshift(this.mk('pockets', 'pockets'));
    if (!this.containers.some((c) => c.item === 'crate')) this.containers.push(this.mk('crate', 'stash'));
  }
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
  accepts(c, d) {
    if (!c || !d) return false;
    const s = this.spec(c);
    if (d.kind === 'container') return !!d.nest && c.item !== 'pockets' && !s.accepts;
    if (d.kind === 'long') return false;
    if (c.item === 'pockets' && d.w * d.h > 1) return false;
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
  place(itemId, qty = 1, { prefer = [], data = null, crate = false, all = false, quiet = false, exclude = [] } = {}) {
    const d = itemDef(itemId);
    if (!d) return { ok: false, placed: 0, why: 'unknown', cId: null, uid: null };
    if (d.kind === 'container') {
      const c = this.addContainer(itemId, this.atStash || !this.attached ? 'stash' : this.nearCanoe() ? 'canoe' : 'stash', null, { quiet });
      return { ok: true, placed: 1, cId: c.id, uid: c.id, why: null };
    }
    if (d.kind === 'long') { const l = this.addLong(itemId, this.atStash || !this.attached ? 'stash' : 'canoe', null, { quiet }); return { ok: true, placed: 1, cId: null, uid: l.uid, why: null }; }
    const pool = (all || !this.attached ? this.containers : this.reachable()).filter((c) => c.item !== 'crate' && c.item !== 'pile' && !exclude.includes(c.id) && this.accepts(c, d));
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
    if (!e || e.box) return null;
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
    const e = from.grid.find((q) => q.uid === uid); if (!e) return false;
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
    for (const c of this.containers) { if (c.item !== 'pockets' && c.item !== 'crate' && c.item !== 'pile') s.add(c.item); for (const e of c.grid) if (!e.box) s.add(e.id); }
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
  // the containers whose food counts for a meal now: what is in reach, and what is set out at the camp you are at
  // (camp.js lays the packs out by the tent door and cooks at the grate a few steps off)
  foodPool() {
    const r = this.reachable(), p = this.player;
    for (const c of this.containers) {
      if (r.includes(c)) continue;
      const k = this.root(c);
      if (k.where === 'ground' && k.at && k.at.camp && p && Math.hypot(k.at.x - p.x, k.at.z - p.z) <= CAMP_REACH) r.push(c);
    }
    return r;
  }
  countIn(cs, kind) { let n = 0; for (const c of cs) for (const e of c.grid) if (!e.box && (itemDef(e.id) || {}).kind === kind) n += e.qty; return n; }
  meals() { return this.countIn(this.foodPool(), 'meal'); }
  snacks() { return this.countIn(this.reachable(), 'snack') + this.countIn(this.reachable(), 'forage'); }
  foodWords() {
    const m = this.meals(), s = this.snacks();
    const a = m ? `${m} meal${m === 1 ? '' : 's'}` : '', b = s ? `${s} snack${s === 1 ? '' : 's'}` : '';
    return a && b ? `${a} and ${b}` : a || b || 'no food';
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
      const r = this.place(id, 1, { crate: this.atStash, quiet: true });
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
    if (!sand) this.take(hit.c.id, hit.e.uid, 1);
    const left = this.count(d.id);
    return ok(sand ? `${d.name}. The food keeps in Sandbox.` : `${d.name}${left ? `: ${left} left` : ''}.`);
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
    const wear = t.def.wear || [], canHand = t.kind === 'long' || t.def.hand;
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
  setDown(ref, at = null, { left = true, quiet = false } = {}) {
    const t = this.thing(ref), p = this.player;
    if (!t) return no('gone', 'That is not here.');
    if (t.def.fixed) return no('fixed', '');
    if (!this.thingReachable(t)) return no('far', `${t.def.name} is out of reach.`);
    if (!at) { if (!p || !p.onFoot) return no('afloat', 'Not from the canoe: go ashore first.'); at = this.spotNear(p.x, p.z, p.heading); }
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
    const e = c.grid.find((q) => q.uid === uid); if (!e) return no('gone', '');
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
    // afloat in your own canoe, whatever you carried is in the hull (a swim from shore leaves things where they are)
    if (p && p.mode !== this.prevMode) {
      if (p.mode === 'paddle') this.stowCarried(true);
      this.prevMode = p.mode;
    }
    if (this.fishing && Array.isArray(this.fishing.stringer)) this.syncStringer();
    this.bridgeLeeches();
    // empty piles go
    for (let i = this.containers.length - 1; i >= 0; i--) { const c = this.containers[i]; if (c.item === 'pile' && !c.grid.length) { this.containers.splice(i, 1); this.dirty = true; } }
    if (this.dirty && (this.saveT += dt) > SAVE_EVERY) this.write();
  }
  // what you carry goes into the canoe (a launch, a teleport, a ride, an evacuation), and the packs set out at camp
  // with it (a launch strikes the camp; a ride or an evacuation takes them along)
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
  }
  // The hubs' shop (shop.js) counts the leeches itself (shop.s.leeches) until stream B's shop reads the inventory
  // (shop.usesInventory): while it does, the inventory's leeches follow its count.
  oldLeeches() { const sh = this.shop; return sh && sh.s && typeof sh.s.leeches === 'number' && !sh.usesInventory ? sh.s.leeches : null; }
  bridgeLeeches() {
    const n = this.oldLeeches(); if (n == null) { this.seenLeeches = null; return; }
    if (this.seenLeeches == null) { this.seenLeeches = n; return; }
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
