// The guide (round 3, 2026-11-05; docs/build/r3-contract.md). One registry of what the player has on the go, shared by
// the journal's Tasks page (journal.js), the pop-up tracker on the left and the golden locator over a person, place or
// thing. The owner (2026-11-05): "tasks that you pick up from the task board, or tasks that are related to the campaign
// ... they both should show up in our journal ... a little Sims-like golden pointy, like, hey, go over here to this
// person ... we can use that same locator bit to like go to different areas or check off certain things."
//
// Nothing here is saved: every entry is worked out again from the module that owns it (a source), a few times a second,
// and the guide says what changed (events). A source is a function returning entry specs; the built-in ones read the
// board's notices and the starter job (tasks.js, the 'starter' kind), the ranger's tickets (permits.js) and the home
// counter's first talk (onboarding.js). Stream A replaces 'onboarding' with the whole main path
// (guide.source('onboarding', fn)); a story module adds its own the same way.
//
//   guide.attach({ tasks, permits, onboarding, outfitter, player, profile, title })
//   guide.source(name, fn) → off       fn() → [spec]; a name already there is replaced (the built-ins: 'board',
//                                      'tickets', 'onboarding')
//   guide.add(spec) / guide.finish(id) / guide.remove(id): a hand-held entry (kept until removed; not saved)
//   guide.sync() → the entries (run by update every GUIDE.syncS; call it to see a change at once)
//   guide.update(dt)                   main.js, each frame in the game (after tasks.update): the sync and the near/far edges
//   guide.list({ done = true } = {}) → [entry] in the journal's order: open first; story, side, starter, ticket, board
//   guide.get(id) → entry | null       guide.current() → the main path's step (the first open story entry) | null
//   guide.reach(entry) → { pos, d, show, fade, inStore } | null   (show: the locator may draw it; fade 0..1)
//   guide.marks() → [{ id, entry, pos, fade, main, d }], at most GUIDE.marksMax: what the locator draws this frame
//   guide.spot(ep, key) → () => { x, y, z } | null: a store's spot ('counter', 'keeper', 'board', 'wall', 'maps',
//     'food', 'tackle', 'gear', 'door', 'dock', 'canoe') as a target's pos
//   guide.speakerPos(speaker) → () => { x, y, z } | null: over a talk speaker's head (onboarding.speaker, npcs.js handles)
//   guide.on(evt, fn) → off            fn(entry, detail)
//     'add'    a new entry ({ initial }: true for what a page load restores, the first sync in the game, or while the
//              title is up, so the tracker stays quiet; a new season's entries are never initial)
//     'change' its title or next line changed ({ fields: ['next'] })
//     'target' its target's kind:key changed, appeared or went (the locator moves)
//     'done'   it turned done (still listed: a notice done and not yet paid)
//     'gone'   it left its source (paid, dropped, missed, a step passed): no longer listed
//     'near'   its target came within reach (reach().show turned true) ({ d }) · 'far' the other way
//     '*'      every event, fn(evt, entry, detail)
//   guide.stats() → { open, done, story, current, marks, sources } (the rigs)
//
// An entry: { id, kind: 'story' | 'side' | 'starter' | 'ticket' | 'board', title, next (one plain line: what to do now,
//   ending in a full stop), target: { kind: 'person' | 'place' | 'thing', key, label, pos() → { x, y, z } | null (the
//   top of it: the locator floats above), near (m, at most GUIDE.nearMax), store (an entry point: also shown anywhere
//   in or about that store, or 'any': any store) } | null, tutorial, order, done, source, ref (the owner's own id),
//   added (performance.now() when first seen) }
// A spec is the same, id required; the rest is filled in (kind 'board', next '', target null, order 0).

const KIND_ORDER = { story: 0, side: 1, starter: 2, ticket: 3, board: 4 };
export const GUIDE_KINDS = Object.keys(KIND_ORDER);
export const GUIDE = {
  syncS: 0.25,      // seconds between syncs
  near: 30,         // m: a target's reach when its spec gives none
  nearMax: 120,     // m: no target reaches further (never across the wilderness)
  storeR: 55,       // m from the target: in or about its store it shows (the store, its yard and dock)
  full: 0.6,        // of the reach: full strength inside this share of it, fading to nothing at its edge
  marksMax: 3,      // the locator draws at most this many at once (the main path's first)
  siteNear: 60,     // m: at a campsite to check, the next part is pointed at and named
  exactR: 150,      // m: a notice's own ring this tight is a place to point at (a beaver dam's, the old trail's)
};
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const stop = (s) => { const w = String(s || '').trim(); return !w ? '' : /[.!?)]$/.test(w) ? w : `${w}.`; };
const PART_LABEL = { grate: 'grate', latrine: 'latrine', pad: 'tent pad' };
const PARTS = ['grate', 'latrine', 'pad'];

export class Guide {
  constructor() {
    this.t = {};
    this.handlers = new Map();
    this.sources = new Map();
    this.manual = new Map();   // hand-held specs (add)
    this.entries = new Map();  // id → entry
    this.nearOn = new Set();   // ids whose target is in reach
    this._t = 1e9;             // (the first update syncs at once)
    this.seenGame = false;
    this.warned = new Set();
    this.source('board', () => this.boardSpecs());
    this.source('tickets', () => this.ticketSpecs());
    this.source('onboarding', () => this.onboardSpecs());
  }
  attach(t = {}) {
    Object.assign(this.t, t);
    const pr = this.t.profile;
    if (pr && typeof pr.onChange === 'function' && !this.heardSeason) {
      this.heardSeason = true;
      pr.onChange((what) => { if (what === 'season') this.reset(); });
    }
    return this;
  }
  // a new season: every entry was another season's (nothing is said of them going), and what comes now is news (not
  // initial: the tracker says it)
  reset() { this.entries.clear(); this.nearOn.clear(); this.manual.clear(); this._t = 1e9; this.seenGame = true; }

  // --- the bus --------------------------------------------------------------------------------------------------------
  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
    return () => this.handlers.get(evt).delete(fn);
  }
  emit(evt, entry, detail = {}) {
    for (const fn of this.handlers.get(evt) || []) { try { fn(entry, detail); } catch (e) { console.warn('guide.on', evt, e); } }
    for (const fn of this.handlers.get('*') || []) { try { fn(evt, entry, detail); } catch (e) { console.warn('guide.on *', e); } }
  }

  // --- sources and hand-held entries -------------------------------------------------------------------------------------
  source(name, fn) {
    this.sources.set(name, fn);
    this._t = 1e9;
    return () => { if (this.sources.get(name) === fn) this.sources.delete(name); };
  }
  add(spec) { if (!spec || spec.id == null) return null; this.manual.set(String(spec.id), { ...spec, source: spec.source || 'manual' }); this.sync(); return this.get(spec.id); }
  finish(id) { const s = this.manual.get(String(id)); if (!s) return false; s.done = true; this.sync(); return true; }
  remove(id) { const had = this.manual.delete(String(id)); if (had) this.sync(); return had; }

  // --- the entries --------------------------------------------------------------------------------------------------------
  get(id) { return this.entries.get(String(id)) || null; }
  list({ done = true } = {}) {
    const out = [...this.entries.values()].filter((e) => done || !e.done);
    return out.sort((a, b) => (a.done - b.done) || (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || (b.tutorial - a.tutorial) || (a.order - b.order) || (a.added - b.added));
  }
  // the main path's step now: the open story entry, a tutorial one first, then the lowest order
  current() {
    let best = null;
    for (const e of this.entries.values()) {
      if (e.kind !== 'story' || e.done) continue;
      if (!best || (e.tutorial !== best.tutorial ? e.tutorial : e.order !== best.order ? e.order < best.order : e.added < best.added)) best = e;
    }
    return best;
  }
  norm(s, src) {
    const kind = KIND_ORDER[s.kind] != null ? s.kind : 'board';
    const g = s.target;
    const target = g && typeof g.pos === 'function' ? {
      kind: ['person', 'place', 'thing'].includes(g.kind) ? g.kind : 'place',
      key: String(g.key ?? s.id), label: String(g.label || ''), pos: g.pos,
      near: Math.min(GUIDE.nearMax, Number.isFinite(g.near) ? g.near : GUIDE.near),
      store: g.store === 'any' ? 'any' : g.store != null && Number.isFinite(Number(g.store)) ? Number(g.store) : null,
      // r3 replay: { x, z, r } a place the target belongs to (a campsite): anywhere inside it the target shows at full
      within: g.within && Number.isFinite(g.within.x) && Number.isFinite(g.within.z) ? { x: g.within.x, z: g.within.z, r: Math.min(GUIDE.nearMax, Number(g.within.r) || GUIDE.siteNear) } : null,
    } : null;
    return { id: String(s.id), kind, title: String(s.title || ''), next: cap(stop(s.next)), target, tutorial: !!s.tutorial, hold: !!s.hold, order: Number.isFinite(s.order) ? s.order : 0, done: !!s.done, source: s.source || src, ref: s.ref ?? null };
  }
  get loading() { const ti = this.t.title; return !!(ti && ti.state && ti.state !== 'game'); }
  sync() {
    const specs = new Map();
    const take = (list, src) => { for (const s of list || []) if (s && s.id != null && !specs.has(String(s.id))) specs.set(String(s.id), this.norm(s, src)); };
    for (const [name, fn] of this.sources) {
      try { take(fn(), name); } catch (e) { if (!this.warned.has(name)) { this.warned.add(name); console.warn('guide: source', name, e); } }
    }
    take([...this.manual.values()], 'manual');
    const initial = !this.seenGame;
    if (!this.loading) this.seenGame = true;
    const tgKey = (e) => (e.target ? `${e.target.kind}:${e.target.key}` : '');
    for (const [id, n] of specs) {
      const o = this.entries.get(id);
      if (!o) { n.added = performance.now(); this.entries.set(id, n); this.emit('add', n, { initial }); continue; }
      const fields = ['title', 'next'].filter((k) => o[k] !== n[k]);
      const moved = tgKey(o) !== tgKey(n), turned = !o.done && n.done;
      Object.assign(o, { ...n, added: o.added });
      if (fields.length) this.emit('change', o, { fields });
      if (moved) { this.nearOn.delete(id); this.emit('target', o, {}); }
      if (turned) this.emit('done', o, {});
    }
    for (const [id, o] of [...this.entries]) if (!specs.has(id)) { this.entries.delete(id); this.nearOn.delete(id); this.emit('gone', o, {}); }
    return this.list();
  }
  update(dt = 0) {
    if ((this._t += dt) >= GUIDE.syncS) { this._t = 0; this.sync(); }
    // the near and far edges (the tracker's "coming near a task's place")
    for (const e of this.entries.values()) {
      const r = e.done ? null : this.reach(e), on = !!(r && r.show);
      if (on && !this.nearOn.has(e.id)) { this.nearOn.add(e.id); this.emit('near', e, { d: r.d }); }
      else if (!on && this.nearOn.has(e.id)) { this.nearOn.delete(e.id); this.emit('far', e, {}); }
    }
  }

  // --- reach: where a target is, and whether it shows from here ---------------------------------------------------------
  reach(e) {
    const tg = e && e.target, p = this.t.player;
    if (!tg || !p) return null;
    let pos = null;
    try { pos = tg.pos(); } catch { pos = null; }
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
    if (!Number.isFinite(pos.y)) pos = { x: pos.x, y: this.groundY(pos.x, pos.z), z: pos.z };
    const d = Math.hypot(pos.x - p.x, pos.z - p.z);
    const v = this.t.outfitter && this.t.outfitter.visit;
    const inStore = !!(tg.store != null && v && (tg.store === 'any' || Number(v.ep) === tg.store) && d <= GUIDE.storeR);
    const W = tg.within, inside = !!(W && Math.hypot(W.x - p.x, W.z - p.z) <= W.r);
    const show = inStore || inside || d <= tg.near;
    const R = inStore ? GUIDE.storeR : tg.near;
    const fade = !show ? 0 : inside || d <= R * GUIDE.full ? 1 : Math.max(0, Math.min(1, (R - d) / (R * (1 - GUIDE.full))));
    return { pos, d, show, fade, inStore };
  }
  marks() {
    const out = [], cur = this.current();
    const push = (e, main) => { const r = this.reach(e); if (r && r.show && r.fade > 0) out.push({ id: e.id, entry: e, pos: r.pos, fade: r.fade, main, d: r.d }); };
    if (cur) push(cur, true);
    const rest = [];
    // (r3 replay: a tutorial step not yet the step gets no gem: one main gem, each step in its turn, as the tracker says it)
    for (const e of this.entries.values()) if (e !== cur && !e.done && e.target && !(e.kind === 'story' && e.tutorial)) rest.push(e);
    rest.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    for (const e of rest) { if (out.length >= GUIDE.marksMax) break; push(e, false); }
    return out;
  }
  stats() {
    const all = [...this.entries.values()], cur = this.current();
    return { open: all.filter((e) => !e.done).length, done: all.filter((e) => e.done).length, story: all.filter((e) => e.kind === 'story' && !e.done).length, current: cur ? cur.id : null, marks: this.marks().map((m) => m.id), sources: [...this.sources.keys()] };
  }

  // --- spots for targets ---------------------------------------------------------------------------------------------------
  groundY(x, z) { const p = this.t.player; try { return p && typeof p.groundAt === 'function' ? p.groundAt(x, z) : 0; } catch { return 0; } }
  layout(ep) { const o = this.t.outfitter; try { return o && typeof o.layout === 'function' ? o.layout(ep) : null; } catch { return null; } }
  // a store's spot as a pos function (worked out on each call: the layout comes with its tile, the canoe moves)
  spot(ep, key) {
    return () => {
      const p = this.t.player;
      if (key === 'canoe') { const d = p && p.carry && p.carry.drop; return d && Number.isFinite(d.x) ? { x: d.x, y: this.groundY(d.x, d.z) + 0.6, z: d.z } : null; }
      const L = this.layout(ep);
      if (!L) return null;
      const fy = Number.isFinite(L.floorY) ? L.floorY : null;
      const flat = (q, up) => (q && Number.isFinite(q.x) ? { x: q.x, y: (Number.isFinite(q.y) ? q.y : fy ?? this.groundY(q.x, q.z)) + up, z: q.z } : null);
      if (key === 'keeper') return flat(L.keeper && { x: L.keeper.x, z: L.keeper.z }, 1.95);
      if (key === 'door') return flat(L.door, 1.0);
      if (key === 'dock') { const q = L.dockSide || L.dockLand; return q ? { x: q.x, y: this.groundY(q.x, q.z) + 0.6, z: q.z } : null; }
      if (key === 'maps') return L.mapTable ? flat(L.mapTable.at || L.mapTable, 0.25) : null;
      if (key === 'food' || key === 'tackle' || key === 'gear') { const s = (L.shelves || []).find((q) => q.kind === key); return s ? flat(s.at || s, 1.0) : null; }
      const q = L[key];
      return q ? flat(q.at || q, 0.5) : null;
    };
  }
  speakerPos(sp) {
    const v = { x: NaN, y: 0, z: NaN, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } };
    return () => { try { const r = sp && typeof sp.pos === 'function' ? sp.pos(v) : null; return r && Number.isFinite(v.x) ? { x: v.x, y: v.y + 0.35, z: v.z } : null; } catch { return null; } };
  }

  // --- the built-in sources --------------------------------------------------------------------------------------------------
  // the board's notices taken (open, or done and not yet paid), a visitor's ask, and the starter job ('starter')
  boardSpecs() {
    const T = this.t.tasks;
    if (!T || !T.active) return [];
    const out = [];
    for (const t of T.active) {
      let next = '', target = null;
      try { next = this.taskNext(T, t); } catch { next = ''; }
      try { target = t.status === 'open' ? this.taskTarget(T, t) : null; } catch { target = null; }
      const due = typeof T.dueOf === 'function' ? T.dueOf(t) : null;
      out.push({ id: `task:${t.id}`, kind: t.kind === 'starter' ? 'starter' : 'board', title: t.title || t.clue || 'A notice', next, target, done: t.status === 'done', order: Number.isFinite(due) ? due : 0, ref: t.id });
    }
    return out;
  }
  // where each part of a campsite check is (task-kinds-2.js partsOf, through __game.taskKinds2)
  partsOf(t) {
    const K2 = typeof window !== 'undefined' && window.__game ? window.__game.taskKinds2 : null;
    try { return K2 && typeof K2.partsOf === 'function' ? K2.partsOf(t) : null; } catch { return null; }
  }
  // the next part of a campsite check still to look over (grate, latrine, tent pad), or null
  nextPart(t) {
    const at = this.partsOf(t), ch = t.checks || {};
    if (!at) return null;
    for (const k of PARTS) if (at[k] && !ch[k]) return { part: k, at: at[k] };
    return null;
  }
  taskNext(T, t) {
    if (t.status === 'done') return 'Paid when you come in';
    const k = (T.kinds || {})[t.kind];
    if (k && typeof k.next === 'function') { const w = k.next(T, t); if (w) return w; } // (a kind may say its own)
    if (t.kind === 'starter' || t.kind === 'campsite') {
      const s = T.world && T.world.campsites ? T.world.campsites[t.site] : null, p = this.t.player;
      // (r3 replay: at the site is near its middle or near the part still to check: a latrine up its trail is 60 m out)
      const np0 = s && p ? this.nextPart(t) : null, atPart = !!(np0 && Math.hypot(np0.at.x - p.x, np0.at.z - p.z) <= GUIDE.siteNear);
      if (!s || !p || (Math.hypot(s.x - p.x, s.z - p.z) > GUIDE.siteNear && !atPart)) {
        const r = typeof T.targetOf === 'function' ? T.targetOf(t) : null, label = ((r && r.label) || 'the campsite').replace(/: .*/, '');
        const lake = t.lakeId && typeof T.lakeName === 'function' ? T.lakeName(t.lakeId) : '';
        return `Paddle to ${label}${lake && !/lake/i.test(label) ? ` on ${lake}` : ''}`;
      }
      const np = this.nextPart(t);
      return np ? `Look over the ${PART_LABEL[np.part]}` : 'Look over the grate, the latrine and the tent pad';
    }
    if (k && k.handsIn && typeof T.fishFor === 'function' && T.fishFor(t)) {
      const L = typeof T.landing === 'function' ? T.landing(t.from) : null;
      return `Hand it over at the board${L ? ` at ${L.name}` : ''}`;
    }
    // (r3 replay: a catch notice not caught yet says what to do, not "Not caught yet · it goes to …")
    if (k && k.handsIn) {
      const L = typeof T.landing === 'function' ? T.landing(t.from) : null, n = Math.max(1, (t.need || 1) - (t.cooler ? t.cooler.length : 0));
      return `Catch ${n > 1 ? 'them' : 'one'}, then bring ${n > 1 ? 'them' : 'it'} to the board${L ? ` at ${L.name}` : ''}`;
    }
    const w = typeof T.progressOf === 'function' ? T.progressOf(t) : '';
    return w && w !== 'on the go' ? cap(w) : '';
  }
  taskTarget(T, t) {
    const k = (T.kinds || {})[t.kind];
    if (k && typeof k.guideTarget === 'function') { const g = k.guideTarget(T, t, this); if (g !== undefined) return g; } // (a kind may name its own)
    if (t.kind === 'starter' || t.kind === 'campsite') {
      const s = T.world && T.world.campsites ? T.world.campsites[t.site] : null;
      if (!s) return null;
      const np = this.nextPart(t);
      // (r3 replay: at the site every part shows at full: the latrine up its trail, 59 m off, read as nothing at 0.03)
      return { kind: 'thing', key: `${t.id}:${np ? np.part : 'site'}`, label: np ? `the ${PART_LABEL[np.part]}` : 'the campsite', near: GUIDE.siteNear, within: { x: s.x, z: s.z, r: GUIDE.siteNear },
        pos: () => { const n = this.nextPart(t), q = n ? n.at : s; return { x: q.x, y: this.groundY(q.x, q.z) + (n ? 0.5 : 1.4), z: q.z }; } };
    }
    if (k && k.handsIn && typeof T.fishFor === 'function' && T.fishFor(t)) return { kind: 'place', key: `board:${t.from}`, label: 'the board', store: t.from, near: 20, pos: this.spot(t.from, 'board') };
    const sp = typeof T.spotOf === 'function' ? T.spotOf(t) : null;
    if (!sp) {
      // (loop tasks, 2026-11-08: a notice of several places, or of one place not kept as its spot (the next beaver dam,
      // the next site of a last check, the Secchi's deep spot, the next bend of a primitive area's trail) is pointed at
      // where its own pencil ring is exact: tight, or no wider than GUIDE.exactR. A ring round a bay or a lake (the loon
      // count, the creel survey) says only "about here", so no gem for it)
      let r = null; try { r = k && typeof k.target === 'function' ? k.target(T, t) : null; } catch { r = null; }
      if (!r || !Number.isFinite(r.x) || !Number.isFinite(r.z) || !(r.tight || (r.r || Infinity) <= GUIDE.exactR)) return null;
      const x = r.x, z = r.z;
      return { kind: 'place', key: `${t.kind}:${Math.round(x)}:${Math.round(z)}`, label: r.label || '', near: 40, pos: () => ({ x, y: this.groundY(x, z) + 0.4, z }) };
    }
    return { kind: t.kind === 'item' ? 'thing' : 'place', key: `${t.kind}:${Math.round(sp.x)}:${Math.round(sp.z)}`, label: '', near: 40, pos: () => ({ x: sp.x, y: this.groundY(sp.x, sp.z) + 0.4, z: sp.z }) };
  }
  // the ranger's tickets written up: paid from the journal anywhere; in or about a store, its counter is pointed at
  ticketSpecs() {
    const P = this.t.permits, list = P && typeof P.tickets === 'function' ? P.tickets() : [];
    if (!list.length) return [];
    const money = Math.floor(P.money || 0), o = this.t.outfitter;
    return list.map((f) => {
      const n = f.n || 0;
      return {
        id: `ticket:${f.id}`, kind: 'ticket', title: 'A ranger’s ticket', ref: f.id, order: f.abs || 0,
        next: money >= n ? `Pay $${n} in your journal` : `$${n} to pay; you have $${money}`, // (r3 replay: the card's own line says I)
        target: { kind: 'place', key: 'counter', label: 'the counter', store: 'any', near: 0, pos: () => { const v = o && o.visit; return v ? this.spot(v.ep, 'counter')() : null; } },
      };
    });
  }
  // the main path until stream A writes its own: the home counter's first talk, while it is to come
  onboardSpecs() {
    const ob = this.t.onboarding;
    if (!ob || typeof ob.pending !== 'function' || !ob.pending()) return [];
    const ep = ob.home, sp = typeof ob.speaker === 'function' ? ob.speaker(ep) : null;
    const named = ob.extra && ob.extraEp === ep && typeof ob.staffName === 'function' ? ob.staffName(ep) : null;
    const who = named || 'the summer help';
    return [{ id: 'story:onboard:talk', kind: 'story', tutorial: true, order: 0, ref: 'onboard',
      title: `Talk to ${who}`, next: `Talk to ${who} at the counter`,
      target: sp ? { kind: 'person', key: sp.key || `staffer:${ep}`, label: who, store: ep, near: 30, pos: this.speakerPos(sp) } : null }];
  }
}

export const guide = new Guide();
