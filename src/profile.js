// The season: what you carry from trip to trip. Money (plain dollars, small amounts), the gear you own and the kit in
// use, the outfitters you know and your standing with each, the home entry point and the season's permit (a paper
// with a number, home and a date, stamped at the first counter). A season starts on the title (New season → the mode
// → home), with $40 and the starting kit: an aluminium canoe, an ash paddle, one Duluth pack, an A-frame tent, water
// tablets, a jig, a Mepps and a dozen leeches. You know only your home outfitter at first; another becomes known when
// you reach its landing (trip.js watches for that).
//
// Saved in its own namespace (`bwca-canoe:profile`). With none there, the first load builds one from the trip core's
// saves (the outfitter's document and the logbook): the Kevlar and the lure unlocks become owned items, money is $10
// for each task turned in (never less than the season's $40), home is the permit's entry point (or Lake One, 30), and
// the landings in the logbook become known outfitters.
//
//   profile.money, earn(n, why), spend(n, why) → bool, has(id), give(id), kit { canoe, paddle, tent, filter, packs },
//   knows(ep), learn(ep), known, home, outfitter(ep) → { rep }, raise(ep, d), onChange(fn) → off
//   (and: started, mode, permit, foodRoom, sleepQ, begin({ home, mode }), stamp(permit), use(slot, id), told, tell(ep, i))
//
// The owner's feedback of 2026-10-24 (stream A): what you own is items now (items.js), kept in the inventory
// (inventory.js, attached by main.js as profile.inventory). has(id) is the owned list or the inventory (anywhere, the
// stash too); give(id) of a thing puts it in the inventory (inventory.give: where it fits in reach, else kept at the
// outfitters); take(id) takes one away (a lure lost to a snapped line); owned is the list and the inventory's ids. The
// list keeps what is not a thing you carry: the canoes, the old Fisher maps, the map sheets and the signature items
// nobody has made an item of. The old ids answer through the inventory: 'pack' (a Duluth pack), 'pack2' (two), 'barrel'
// (a barrel), 'rod' (the medium-heavy rod), 'leeches'. seasonId ties the inventory's save to this season.
import { save } from './save.js';
import { itemDef, LEGACY } from './items.js';

const NS = 'profile';
const DOC_KEY = 'bwca-canoe-trip';   // the outfitter's document (outfitter.js), read for the migration
export const START_MONEY = 40;
export const FOOD_PRICE = 6;          // a day of food: two meals, 0.9 kg
const TASK_PAY_OLD = 10;              // what a task turned in before money is worth now
const REP_MAX = 5;
const LEDGER = 40;                    // money entries kept

// what can be owned: the label, its slot in the kit, and what it does where something reads it
export const ITEMS = {
  aluminium: { label: 'Aluminium canoe, 17 ft', slot: 'canoe', note: '34 kg on the portages' },
  kevlar: { label: 'Kevlar tripper, 17 ft', slot: 'canoe', note: '20 kg on the portages' },
  ash: { label: 'Ash paddle', slot: 'paddle' },
  pack: { label: 'Duluth pack', note: 'room for 7 days of food' },
  pack2: { label: 'A second Duluth pack', note: 'room for 10 more days; two carries on a portage' },
  barrel: { label: 'Food barrel and harness', note: 'room for 14 days' },
  aframe: { label: 'A-frame tent', slot: 'tent', sleep: 0.85 },
  tablets: { label: 'Water tablets', slot: 'filter', note: 'drinkable in half an hour' },
  'lure:jig': { label: 'Jig & twister tail' },
  'lure:mepps': { label: 'Mepps Aglia spinner' },
  'lure:daredevle': { label: 'Red-and-white Daredevle' },
  'lure:rapala': { label: 'Jointed Rapala' },
  'lure:silverminnow': { label: 'Johnson Silver Minnow' },
  'lure:lazyike': { label: 'Lazy Ike' },
  leeches: { label: 'A dozen leeches' },
  'maps:fisher': { label: 'The old Fisher map sheets' },
};
export const STARTER = ['aluminium', 'ash', 'pack', 'aframe', 'tablets', 'lure:jig', 'lure:mepps', 'leeches'];
const KIT0 = { canoe: 'aluminium', paddle: 'ash', tent: 'aframe', filter: 'tablets', packs: 1 };
// the old task board's unlocks (tasks.js UNLOCKS keys) as owned items
const UNLOCK_ITEM = { kevlar: 'kevlar', mepps: 'lure:mepps', daredevle: 'lure:daredevle', rapala: 'lure:rapala', jig: 'lure:jig', silverminnow: 'lure:silverminnow', lazyike: 'lure:lazyike', fisher: 'maps:fisher' };
const FOOD_ROOM = { pack: 7, pack2: 10, barrel: 14 }; // days of food each holds

const newId = () => `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
function blank() {
  return { v: 1, id: newId(), started: false, mode: 'adventure', home: null, permit: null, money: 0, earned: 0, spent: 0, owned: [], kit: { ...KIT0 }, known: [], rep: {}, ledger: [], migrated: null, told: [] };
}
function readDoc() { try { const s = localStorage.getItem(DOC_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
const dollars = (n) => Math.max(0, Math.round(Number(n) || 0));

export class Profile {
  constructor() {
    this.handlers = new Set();
    const s = save.read(NS);
    if (s && s.v === 1) {
      this.s = { ...blank(), ...s, kit: { ...KIT0, ...(s.kit || {}) }, rep: { ...(s.rep || {}) }, told: Array.isArray(s.told) ? s.told.slice() : [] };
      if (!s.id) this.write(); // a season from before the items: its id is new, and the inventory migrates it once
    } else {
      const doc = readDoc();
      this.s = doc ? Profile.migrate(doc, save.read('logbook')) : blank();
      if (doc) this.write();
    }
  }
  // a profile from the trip core's saves: doc is the outfitter's document, book the logbook
  static migrate(doc, book) {
    const p = blank(), core = doc.core && doc.core.v >= 2 ? doc.core : null, tasks = doc.tasks || {};
    const tally = tasks.tally || {}, turned = (tally.item || 0) + (tally.survey || 0) + (tally.fish || 0);
    p.started = true;
    p.migrated = core ? `v${core.v}` : 'v1';
    p.mode = core ? (core.mode === 'sandbox' ? 'sandbox' : 'adventure') : 'sandbox'; // a document with no core loads as Sandbox
    const ep = core && core.permit && core.permit.ep != null ? core.permit.ep : doc.trip && doc.trip.ep != null ? doc.trip.ep : 30;
    p.home = Number(ep);
    p.owned = [...STARTER];
    for (const k of Array.isArray(tasks.unlocks) ? tasks.unlocks : []) { const id = UNLOCK_ITEM[k]; if (id && !p.owned.includes(id)) p.owned.push(id); }
    p.money = Math.max(START_MONEY, turned * TASK_PAY_OLD);
    const tasksWords = `${turned} task${turned === 1 ? '' : 's'} turned in before money`;
    p.ledger = [{ n: p.money, why: turned * TASK_PAY_OLD >= START_MONEY ? tasksWords : turned ? `the season’s start (${tasksWords})` : 'the season’s start' }];
    p.earned = turned * TASK_PAY_OLD;
    const kevlar = p.owned.includes('kevlar') && !(core && core.packs && core.packs.canoe === 'aluminium');
    p.kit = { ...KIT0, canoe: kevlar ? 'kevlar' : 'aluminium' };
    const seen = book && book.seen && Array.isArray(book.seen.eps) ? book.seen.eps : [];
    p.known = [...new Set([p.home, ...seen.map(Number)].filter(Number.isFinite))];
    // the permit loses its dates: its number, home and the day it was written
    const pm = core && core.permit;
    if (pm) p.permit = { no: pm.no || null, ep: pm.ep ?? p.home, entry: pm.entry ? { year: pm.entry.year, doy: pm.entry.doy, hours: pm.entry.hours ?? 8 } : null };
    return p;
  }

  // --- listening and saving ---------------------------------------------------------------------------------
  onChange(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  changed(what) {
    this.write();
    for (const fn of this.handlers) { try { fn(what, this); } catch (e) { console.warn('profile.onChange', e); } }
  }
  write() { save.write(NS, this.s); }
  serialize() { return this.s; }

  // --- the season -------------------------------------------------------------------------------------------
  get started() { return !!this.s.started; }
  get mode() { return this.s.mode; }
  get home() { return this.s.home; }
  get permit() { return this.s.permit; }
  get migrated() { return this.s.migrated; }
  get seasonId() { return this.s.id; }
  // a new season: $40, the starting kit, home known and nothing else; the permit is stamped at the first counter
  begin({ home, mode = 'adventure' } = {}) {
    const p = blank();
    p.started = true; p.mode = mode === 'sandbox' ? 'sandbox' : 'adventure'; p.home = Number(home);
    p.owned = [...STARTER]; p.money = START_MONEY; p.earned = 0;
    p.ledger = [{ n: START_MONEY, why: 'to start the season' }];
    p.known = Number.isFinite(p.home) ? [p.home] : [];
    this.s = p;
    // the starting kit as things in the canoe (inventory.newSeason); the list keeps the canoe
    const inv = this.inv;
    if (inv) { p.owned = ['aluminium']; inv.newSeason(); }
    this.changed('season');
  }
  stamp(permit) { this.s.permit = { no: permit.no || null, ep: permit.ep ?? this.s.home, entry: permit.entry || null }; this.changed('permit'); }
  forgetMigration() { if (this.s.migrated) { this.s.migrated = null; this.write(); } }

  // --- money ------------------------------------------------------------------------------------------------
  get money() { return this.s.money; }
  get earned() { return this.s.earned; } // what the boards have paid this season (not the $40 to start)
  get ledger() { return this.s.ledger; }
  entry(n, why) { const l = this.s.ledger; l.push({ n, why: why ? String(why) : '' }); if (l.length > LEDGER) l.splice(0, l.length - LEDGER); }
  earn(n, why = '') {
    const d = dollars(n); if (!d) return this.s.money;
    this.s.money += d; this.s.earned += d; this.entry(d, why);
    this.changed('money');
    return this.s.money;
  }
  // false when short, and nothing is spent
  spend(n, why = '') {
    const d = dollars(n);
    if (d > this.s.money) return false;
    if (!d) return true;
    this.s.money -= d; this.s.spent += d; this.entry(-d, why);
    this.changed('money');
    return true;
  }
  canAfford(n) { return dollars(n) <= this.s.money; }

  // --- gear -------------------------------------------------------------------------------------------------
  get inv() { const i = this.inventory; return i && i.attached ? i : null; }
  // a thing you carry (an item of items.js, or an old id that is one now), rather than a canoe or a paper
  static physical(id) { return !!(itemDef(LEGACY[id] || id) || id === 'leeches'); }
  has(id) {
    if (this.s.owned.includes(id)) return true;
    const inv = this.inv; if (!inv) return false;
    const n = (q) => inv.count(q, { reachable: false });
    if (id === 'pack') return n('pack3') + n('pack4') >= 1;
    if (id === 'pack2') return n('pack3') + n('pack4') >= 2;
    if (id === 'barrel') return n('barrel30') + n('barrel60') >= 1;
    if (id === 'rod') return n('rodmh') >= 1;
    return Profile.physical(id) ? n(id) >= 1 : false;
  }
  give(id) {
    if (!id) return false;
    const inv = this.inv;
    if (inv && Profile.physical(id)) { const ok = inv.give(LEGACY[id] || id); if (ok) this.changed('gear'); return ok; }
    if (this.has(id)) return false;
    this.s.owned.push(id); this.changed('gear'); return true;
  }
  // one of a thing gone (a lure lost to a snapped line): from the inventory, else the list
  take(id) {
    const inv = this.inv, i = this.s.owned.indexOf(id);
    if (i >= 0) { this.s.owned.splice(i, 1); this.changed('gear'); return true; }
    if (inv && Profile.physical(id) && inv.remove(id === 'leeches' ? 'leeches' : LEGACY[id] || id, id === 'leeches' ? inv.count('leeches', { reachable: false }) : 1)) { this.changed('gear'); return true; }
    return false;
  }
  get owned() {
    const out = new Set(this.s.owned), inv = this.inv;
    if (inv) {
      const ids = inv.ids();
      for (const id of ids) if (id !== 'rod') out.add(id); // 'rod' in the list is the old medium-heavy one (below)
      for (const old of ['pack', 'pack2', 'barrel', 'rod']) if (this.has(old)) out.add(old);
    }
    return [...out];
  }
  // what is in use: { canoe, paddle, tent, filter, packs } (packs: 1, or 2 with the second pack)
  get kit() { return { ...this.s.kit, packs: this.has('pack2') ? 2 : 1 }; }
  // put an owned item to use in its slot (the canoe at the counter, say)
  use(slot, id) {
    if (!this.has(id) || (ITEMS[id] && ITEMS[id].slot !== slot) || this.s.kit[slot] === id) return false;
    this.s.kit[slot] = id;
    if (slot === 'paddle' && this.inv) this.inv.useLong(id);
    this.changed('kit'); return true;
  }
  // days of food the packs hold: a Duluth pack 7, the second one 10 more, a barrel 14
  get foodRoom() { let d = FOOD_ROOM.pack; if (this.has('pack2')) d += FOOD_ROOM.pack2; if (this.has('barrel')) d += FOOD_ROOM.barrel; return d; }
  // the tent's night (camp.js may read it): the A-frame 0.85
  get sleepQ() { const t = ITEMS[this.s.kit.tent]; return t && t.sleep ? t.sleep : 0.85; }

  // --- the outfitters you know ------------------------------------------------------------------------------
  get known() { return this.s.known.slice(); }
  knows(ep) { return this.s.known.includes(Number(ep)); }
  learn(ep) { const n = Number(ep); if (!Number.isFinite(n) || this.knows(n)) return false; this.s.known.push(n); this.changed('known'); return true; }
  // the keepers' insider words you have been told this season, as "ep:i" (the i-th of that outfitter's hints,
  // outfitters.js): the map rings each one (hud.js)
  get told() { return this.s.told.slice(); }
  tell(ep, i) {
    const k = `${Number(ep)}:${Number(i)}`;
    if (!Number.isFinite(Number(ep)) || !Number.isFinite(Number(i)) || this.s.told.includes(k)) return false;
    this.s.told.push(k); this.changed('hints');
    return true;
  }
  // standing with an outfitter, 0–5
  outfitter(ep) { return { rep: this.s.rep[Number(ep)] || 0 }; }
  raise(ep, d = 1) {
    const k = Number(ep), r = Math.max(0, Math.min(REP_MAX, (this.s.rep[k] || 0) + (Number(d) || 0)));
    if (r === (this.s.rep[k] || 0)) return r;
    this.s.rep[k] = +r.toFixed(3); this.changed('rep');
    return r;
  }
}
