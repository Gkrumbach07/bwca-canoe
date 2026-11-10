// The cast in the world (docs/build/campaign-design.md §5.1; stream T, Round 1): named people placed by their schedules
// (story-data/cast.js), outdoors through npcs.standAt (the porch foot, the truck in the lot) and on a porch's bench or
// beside a counter through npcs.extraAt; their scenes (story-data/porch-act1.js) played through topics.js. Loaded only
// under STORY_ON. A co-op guest's story is off (mirror): nothing is staged for them (the feed drops walkout on a guest,
// and every placement asks story.mode).
//
//   cast.attach({ story, npcs, talk, topics, beats, outfitter, profile, day, world, player, hud, onboarding,
//                 inventory, truck: () => Truck (a pickup of his own, for a store with no porch), ridesTruck })
//   cast.update(dt)               the seats by schedule (porch:<ep>, counter:home), the staged person's walk-by
//   cast.walkout(ep)              (story 'walkout', host only): the first walkout slot that holds, within the push budget
//   cast.storeEnter(ep)           (story 'store:enter'): Josie's R1/R1b at the home counter
//   cast.talk(who) → bool         E on them: their scene from where the story stands
//   cast.p1(ep, landing) → node   P1 the counter (onboarding.p1): the keeper by manner, Josie by the week, the bundle
//   cast.josieClose(v)            the return's close at home (20 §5.2): "There's been an old guy out on the porch…"
//   cast.staged() → [{ who, ep, slot, at, x, z, talked, done }]   cast.debug.stage(who, ep, slotId) (rigs)
//   SPOT_OF(L, kind) → { x, z, heading }   the porch foot / the bench / the counter, in world metres
import { CAST } from './story-data/cast.js';
import { PORCH, JOSIE, P1, HERE, WALK_AWAY } from './story-data/porch-act1.js';
import { SceneRun, T, MANNERS } from './topics.js';
import { storeLayout, storeLayouts } from './props.js';
import { castPorch } from './grounding.js';

const NEAR = 120;            // m: stores this near have their seats kept (npcs settles a roster within 70)
const BARK_R = 9;            // m: the staged person's first word as you come this near
const WALK_PAST = 12;        // m: the porch's "[Keep walking]": T1b
const WALK_OFF = 26;         // m: walked off: X1 (declined), or the stop is over
const GONE_R = 32;           // m: after the scene, he goes once you are this far, or back inside
const TICK = 0.5;            // s between schedule checks
const PRE_T3 = new Set(['T1', 'T1b', 'T2', 'R3', 'changed']);

// a spot by the store: the porch foot (beside the steps, looking out), the bench, beside the counter
export function SPOT_OF(L, kind) {
  if (!L) return null;
  const A = L.axes && L.axes.a, B = L.axes && L.axes.b;
  const head = (dx, dz) => Math.atan2(-dz, dx);
  if (kind === 'foot') {
    const f = L.stepsFoot || L.door;
    if (!f || !A || !B) return null;
    return { x: f.x + A.x * 1.7 + B.x * 0.6, z: f.z + A.z * 1.7 + B.z * 0.6, heading: head(B.x, B.z) };
  }
  if (kind === 'bench') {
    const s = L.seats && L.seats[0];
    return s ? { x: s.x, z: s.z, y: s.y, heading: s.heading, sit: true } : null;
  }
  if (kind === 'counter') {
    const k = L.keeper; if (!k) return null;
    const h = Number.isFinite(k.heading) ? k.heading : 0;
    return { x: k.x + Math.sin(h) * 1.1, z: k.z + Math.cos(h) * 1.1, heading: h, y: L.floorY };
  }
  return null;
}

export class Cast {
  constructor() { this.c = {}; this.live = new Map(); this.t = 0; this.offs = []; this.debug = this.makeDebug(); this.ownTruck = null; }
  attach(c = {}) {
    Object.assign(this.c, c);
    const s = this.c.story;
    if (s) {
      this.offs.push(s.on('walkout', (e) => this.walkout(e && e.ep)));
      this.offs.push(s.on('store:enter', (e) => this.storeEnter(e && e.ep)));
      this.offs.push(s.on('season', () => this.clear()));
      // the cast's own sensors: the day's dice for a person (dayhash(tauno,5)=0), Walt's pack on you
      s.sensor('dayhash', (arg) => { const a = arg || {}; const t = s.time(); return (s.hash(`${a.who}:${t.abs}:${s.doc && s.doc.season}`) % Math.max(1, a.n || 1)); });
      s.sensor('carrying', () => this.carrying());
    }
    return this;
  }
  get story() { return this.c.story || null; }
  get on() { const s = this.story; return !!(s && s.mode !== 'mirror' && s.doc); }
  home() { const pr = this.c.profile; return pr && pr.started ? Number(pr.home) : null; }
  carrying() {
    const inv = this.c.inventory; if (!inv || !inv.containers) return false;
    return inv.containers.some((k) => k.item === 'waltpack' && (k.where === 'back' || k.where === 'hands'));
  }
  args(ep) {
    const n = this.c.npcs, F = n && typeof n.groundCtx === 'function' ? (() => { try { return n.groundCtx(); } catch { return null; } })() : null;
    const month = F ? F.month : 6;
    const home = this.home();
    return { ep: Number(ep), home: Number(ep) === home, farm: Number(ep) === 31, raining: !!(F && F.raining), snowing: !!(F && F.snowing), cold: !!(F && (F.snowing || F.snow > 0.15 || month <= 4 || month >= 11)) };
  }
  when(expr, args) { const s = this.story; return !expr || !!(s && s.when(expr, args)); }
  nameOf(who) { const R = CAST[who], s = this.story; if (!R) return who; if (!R.known || (s && s.has(R.known))) return R.first || R.name; return R.unknown || R.first; }

  // --- where they are -------------------------------------------------------------------------------------------------
  clear() { for (const k of [...this.live.keys()]) this.unstage(k); }
  key(who, ep) { return `${who}:${ep}`; }
  // stand someone at a store: the porch foot (walkout), the bench (porch:), beside the counter
  stage(who, ep, slot, { kind = 'foot' } = {}) {
    if (!this.on) return null;
    const k = this.key(who, ep);
    if (this.live.has(k)) return this.live.get(k);
    for (const [k2, st] of this.live) if (st.who === who) this.unstage(k2); // (one of each person in the world)
    const n = this.c.npcs, L = storeLayout(ep), R = CAST[who];
    if (!n || !L || !R) return null;
    const porch = castPorch(L, R.noPorch || 'truck') === 'porch'; // (grounding.js: a porch only where the store has one)
    let spot = null, truck = null;
    if (kind === 'counter') spot = SPOT_OF(L, 'counter');
    else if (porch) spot = SPOT_OF(L, kind === 'bench' ? 'bench' : 'foot') || SPOT_OF(L, 'foot');
    if (!spot && R.noPorch === 'truck' && kind !== 'counter') { truck = this.truckAt(ep); spot = truck ? truck.stand : SPOT_OF(L, 'foot'); }
    if (!spot) return null;
    const rec = { key: `cast:${who}:${ep}`, name: this.nameOf(who), role: R.role || '', look: R.look, talk: () => (this.talk(who) ? true : null) };
    let h = null;
    try {
      if (spot.sit && typeof n.extraAt === 'function') h = n.extraAt(ep, { ...rec, spot: 'bench' });
      else if (typeof n.standAt === 'function') h = n.standAt({ x: spot.x, z: spot.z, y: kind === 'counter' ? spot.y : undefined, heading: spot.heading }, { ...rec, ep });
    } catch (e) { console.warn('cast: stage', who, e); h = null; }
    if (!h) return null;
    const st = { who, ep: Number(ep), slot, at: kind, h, x: spot.x, z: spot.z, talked: false, barked: false, past: false, done: false, run: null, truck: !!truck, t: 0 };
    this.live.set(k, st);
    if (slot && slot.fact) this.story.rules.apply({ id: `cast:${slot.id}`, then: [`f:${slot.fact}`] }, {});
    return st;
  }
  unstage(k) {
    const st = this.live.get(k); if (!st) return;
    this.live.delete(k);
    try { if (st.h && typeof st.h.remove === 'function') st.h.remove(); } catch { /* the store's gone */ }
    if (st.truck && this.ownTruck && typeof this.ownTruck.hide === 'function') this.ownTruck.hide();
    if (this.c.talk && this.c.talk.talkingTo && this.c.talk.convo && this.c.talk.convo.speaker && this.c.talk.convo.speaker.key === `cast:${st.who}:${st.ep}`) { try { this.c.talk.close(false); } catch { /* closed */ } }
  }
  // his pickup in the lot (a store with no porch, 20 §6.6): his own truck where the store's truck would stand, which
  // keeps away from that store while his is there
  truckAt(ep) {
    const RT = this.c.ridesTruck, make = this.c.truck;
    if (!RT || typeof RT.spot !== 'function' || typeof make !== 'function') return null;
    let S = null;
    try { S = RT.spot(ep); } catch { S = null; }
    if (!S || !Number.isFinite(S.x)) return null;
    try { RT.hide(); RT.gone = String(ep); } catch { /* the store's truck */ }
    const T = this.ownTruck || (this.ownTruck = make());
    if (!T || typeof T.pose !== 'function') return null;
    try { T.pose(S.path, S.s0); if (T.setRack) T.setRack(false); } catch (e) { console.warn('cast: his truck', e); return null; }
    // he stands at the tailgate, a little to the side (the truck's forward is (sin h, cos h): truck.js spot)
    const fx = Math.sin(S.heading || 0), fz = Math.cos(S.heading || 0), rx = fz, rz = -fx;
    return { stand: { x: S.x - fx * 3.3 + rx * 0.7, z: S.z - fz * 3.3 + rz * 0.7, heading: Math.atan2(-fz, fx) + Math.PI } };
  }

  // --- the walkout (host only: the feed drops it on a guest) ------------------------------------------------------------
  walkout(ep) {
    if (!this.on || ep == null) return null;
    ep = Number(ep);
    if ([...this.live.values()].some((st) => st.ep === ep && st.at === 'foot' && !st.done)) return null; // (already there)
    const a = this.args(ep), B = this.c.beats;
    for (const [who, R] of Object.entries(CAST)) {
      for (const slot of R.where) {
        if (slot.at !== 'walkout') continue;
        if (!this.when(slot.when, a)) continue;
        if (slot.push && B && !B.can(slot.push)) continue;
        const st = this.stage(who, ep, slot, { kind: 'foot' });
        if (!st) continue;
        if (slot.push && B) B.push(slot.push);
        return st;
      }
    }
    return null;
  }
  storeEnter(ep) {
    if (!this.on || ep == null) return;
    ep = Number(ep);
    const s = this.story;
    void s; // (20 §6.1 armed by the return: rules-talk.js t.armed)
    if (ep === this.home()) this.seat('josie', ep, true);
  }

  // --- the seats by schedule (each tick: the stores near you) -----------------------------------------------------------
  update(dt) {
    if (!this.on) return;
    this.t += dt;
    for (const st of this.live.values()) this.watch(st, dt);
    if (this.t < TICK) return;
    this.t = 0;
    const p = this.c.player; if (!p) return;
    const homeEp = this.home();
    for (const L of storeLayouts()) {
      const d = Math.hypot(L.centre.x - p.x, L.centre.z - p.z);
      if (d > NEAR) continue;
      this.seat('tauno', L.ep);
      if (L.ep === homeEp) this.seat('josie', L.ep);
    }
    // put away what is out of reach or out of its hours
    for (const [k, st] of [...this.live]) {
      const L = storeLayout(st.ep);
      if (!L || Math.hypot(L.centre.x - p.x, L.centre.z - p.z) > NEAR + 30) { this.unstage(k); continue; }
      if (st.at !== 'foot' && st.slot && !st.slot.fact && !st.talking && !this.when(st.slot.when, this.args(st.ep))) this.unstage(k); // (a once-ever slot is spent as it's staged: it stays the visit)
    }
  }
  // a porch or counter slot of this person at this store, if one holds now (with its push, if it has one)
  seat(who, ep, entering = false) {
    const R = CAST[who]; if (!R) return null;
    const a = this.args(ep), B = this.c.beats, ob = this.c.onboarding;
    if (who === 'josie' && ob && typeof ob.pending === 'function' && ob.pending(ep)) return null; // (the onboarding's own staffer stands there)
    const k = this.key(who, ep);
    let cur = this.live.get(k);
    if (cur && cur.at === 'foot' && cur.done && !cur.talking) { this.unstage(k); cur = null; } // (a stop that is over gives way to his seat)
    for (const slot of R.where) {
      if (slot.at === 'walkout') continue;
      const atHere = slot.at === `porch:${ep}` || (slot.at === 'porch:home' && a.home) || (slot.at === 'counter:home' && a.home);
      if (!atHere || !this.when(slot.when, a)) continue;
      if (cur && !cur.done && cur.at !== 'foot') { if (cur.slot !== slot && slot.push && entering && B && B.can(slot.push)) { B.push(slot.push); cur.slot = slot; cur.barked = false; if (slot.fact) this.story.rules.apply({ id: `cast:${slot.id}`, then: [`f:${slot.fact}`] }, {}); } return cur; }
      if (cur) return cur;
      if (slot.push && (!entering || !B || !B.can(slot.push))) continue; // (a push only as you come in: never popping in later)
      const st = this.stage(who, ep, slot, { kind: slot.at.startsWith('counter') ? 'counter' : 'bench' });
      if (st && slot.push && B) B.push(slot.push);
      return st;
    }
    return null;
  }
  // the staged person and you: the first word as you come near; the porch's walk-by; going once it's over
  watch(st, dt) {
    const p = this.c.player; if (!p) return;
    st.t += dt;
    const d = Math.hypot(st.x - p.x, st.z - p.z), talking = this.talkingTo(st);
    st.talking = talking;
    if (talking) return;
    const slot = st.slot || {};
    if (!st.barked && slot.bark && d < BARK_R && !st.done) { st.barked = true; this.say(st, T(slot.bark)); }
    if (slot.walk && !st.talked && !st.done && st.barked) {
      if (!st.past && d > WALK_PAST) { st.past = true; this.say(st, T('20:T1b.1')); }
      else if (st.past && d > WALK_OFF) { this.decline(); st.done = true; this.say(st, T('20:X1.1')); }
    }
    const o = this.c.outfitter, inside = !!(o && o.visit && o.visit.ep === st.ep && o.visit.inside);
    if (st.at === 'foot' && (st.done || (st.barked && !slot.walk && d > WALK_OFF)) && (d > GONE_R || inside)) this.unstage(this.key(st.who, st.ep));
  }
  talkingTo(st) { const t = this.c.talk; return !!(t && t.convo && t.convo.speaker && t.convo.speaker.key === `cast:${st.who}:${st.ep}`); }
  say(st, text) { if (!text || !st.h) return; try { st.h.say(text); } catch { /* not drawn */ } }
  decline() {
    const s = this.story;
    s.rules.apply({ id: 'cast:decline', then: [s.has('tauno.porch.declined1') ? 'f:tauno.porch.declined2' : 'f:tauno.porch.declined1'] }, {});
  }

  // --- their scene -------------------------------------------------------------------------------------------------------
  entry(who, st) {
    const s = this.story, slot = st.slot || {};
    if (who === 'josie') {
      if (slot.scene) return slot.scene;
      return null;
    }
    let e = slot.scene || 'auto';
    if (e === 'R4' && s.has('crews.seen')) e = 'auto';
    if (e !== 'auto') return e;
    if (!s.has('tauno.porch.done')) return s.has('tauno.porch.declined2') ? 'changed' : 'T1';
    if (!s.has('door.crews.taken') && !s.has('door.crews.declined')) return 'resume';
    if (s.has('crews.seen') && !s.has('tauno.turn')) return s.keys('tauno.said.u1.').length ? 'resumeU1' : 'U1';
    if (s.has('tauno.turn') && !s.has('tauno.killed')) return 'resumeU4';
    if (s.has('tauno.killed') && !s.has('tauno.doors')) return 'resumeU5';
    if (s.has('door.crews.declined') && !s.has('door.crews.taken') && !s.has('crews.seen')) return 'R5';
    return 'seat';
  }
  talk(who) {
    if (!this.on) return false;
    const st = [...this.live.values()].find((x) => x.who === who);
    const dlg = this.c.talk, s = this.story;
    if (!st || !dlg || typeof dlg.open !== 'function') return false;
    if (who === 'josie') return this.josieTalk(st);
    const start = this.entry(who, st);
    st.talked = true;
    s.rules.apply({ id: 'cast:talk', then: [`f:${who}.talk`] }, {});
    s.meet(who, 'cast');
    const a = this.args(st.ep);
    a.first = !s.has('tauno.said.seat31') && st.ep === 31;
    if (st.ep === 31) s.rules.apply({ id: 'cast:seat31', then: ['f:tauno.said.seat31'] }, {});
    const n = this.c.npcs;
    const run = new SceneRun(this.c.topics, PORCH, { who, args: a, mark: n && n.mark ? (t) => n.mark(t) : null,
      hooks: {
        here: () => HERE[st.ep] || null,
        decline: () => this.decline(),
        done: () => { st.done = true; },
      },
      onNode: (id) => { if (id === 'T6' || id === 'X1' || id === 'X2' || id === 'U6') st.done = true; },
      onEnd: () => { st.done = true; } });
    st.run = run;
    const sp = st.h.speaker;
    return dlg.open({ speaker: sp, name: this.nameOf(who), role: '', room: st.ep,
      start: () => run.node(start),
      bye: () => this.bye(st) });
  }
  // walking off mid-scene: before T3 it is "[Keep walking]" (declined); after, "That's enough for today." (kept)
  bye(st) {
    const run = st.run; if (!run || st.done) return null;
    if (PRE_T3.has(run.at)) { this.decline(); st.done = true; return T('20:X1.1'); }
    if (/^R[457]$/.test(run.at) || run.at === 'seat') { st.done = true; return null; }
    return T(WALK_AWAY);
  }
  // Josie at the home counter: R1, R1b, then the topic that stays; else a word of hers by stage (70 §4.4)
  josieTalk(st) {
    const dlg = this.c.talk, s = this.story, slot = st.slot || {}, n = this.c.npcs, amb = this.c.ambient;
    const take = () => { const ob = this.c.onboarding; if (ob && typeof ob.takeLater === 'function') ob.takeLater(); s.rules.apply({ id: 'josie:take', then: ['f:bundle.later', 'f:bundle.taken'] }, {}); };
    let start = slot.scene;
    if (!start && s.has('bundle.shelf') && !s.has('bundle.later') && s.has('rehook.R1b')) start = 'still';
    const run = new SceneRun(this.c.topics, JOSIE, { who: 'josie', args: this.args(st.ep), mark: n && n.mark ? (t) => n.mark(t) : null, hooks: { take } });
    st.run = run; st.talked = true;
    if (slot.scene) st.slot = (CAST.josie.where.find((w) => w.id === 'counter')) || slot; // (a re-hook said is said)
    const sp = st.h.speaker;
    const word = () => {
      const pick = amb && typeof amb.pick === 'function' ? amb.pick('josie', { ep: st.ep }) : null;
      const say = pick ? pick.text : (T('20:5.2.14') || '…');
      if (n && n.mark) n.mark(say);
      const ch = [];
      if (s.has('bundle.shelf') && !s.has('bundle.later') && s.has('rehook.R1b')) { const q = T('20:9.2#R1b.1'); if (q) ch.push({ text: q, go: () => run.node('still') }); }
      ch.push({ text: 'Goodbye.', kind: 'bye', go: () => null });
      return { say, choices: ch };
    };
    return dlg.open({ speaker: sp, name: this.nameOf('josie'), role: CAST.josie.role, room: st.ep,
      start: () => (start ? run.node(start) : word()), bye: () => null });
  }

  // --- P1 the counter (20 §1.2, §1.3) ----------------------------------------------------------------------------------
  p1(ep, landing) {
    if (!this.on) return null;
    const ob = this.c.onboarding, s = this.story, n = this.c.npcs, o = this.c.outfitter, shop = o && o.shop;
    if (!ob) return null;
    const keeper = shop && typeof shop.keeperName === 'function' ? shop.keeperName(ep) : null;
    const ch = n && typeof n.charOf === 'function' ? n.charOf(ep) : null, manner = ch ? ch.manner : 'warm';
    const d = this.c.day, doy = d ? d.doy : 180, week = Math.floor(doy / 7);
    const W = P1.week.find((w) => doy <= w.to) || P1.week[P1.week.length - 1];
    const back = P1.backroom[ep] ? T(P1.backroom[ep]) : null;
    const set = (k) => s.rules.apply({ id: 'p1', then: [`f:${k}`] }, {});
    const run = new SceneRun(this.c.topics, P1, { who: 'josie', args: this.args(ep), mark: n && n.mark ? (t) => n.mark(t) : null,
      cont: () => ob.after(ep, landing),
      hooks: {
        keeper: () => ({ id: P1.keeper[Math.max(0, MANNERS.indexOf(manner))], by: keeper || 'The keeper' }),
        week: () => (W.third && week % 3 === 0 ? W.third : W.id),
        // "…on the high shelf behind the {back-room thing}." with this store's (1.3): its words without the "…"
        bundle: () => { const t = T('20:1.2.14'); if (!t) return null; const b = back ? back.replace(/^…\s*/, '').replace(/\.$/, '') : null; return { text: b ? t.replace(/behind the \{[^}]*\}/, b) : t.replace(/ behind the \{[^}]*\}/, '') }; },
        extra: () => P1.extra[ep] || null,
        take: () => { ob.give(); set('bundle.taken'); },
        shelf: () => { if (typeof ob.shelf === 'function') ob.shelf(); set('bundle.shelf'); },
      } });
    return run.node('open');
  }
  // the return's close (20 §5.2), at home, by day, before the porch: Josie, as you turn to go (once a day)
  josieClose(v) {
    if (!this.on || !v || !v.keeper) return false;
    const s = this.story, ep = Number(v.ep), d = this.c.day;
    if (ep !== this.home() || !s.when('f:nb.found & !f:tauno.porch.done & !f:tauno.porch.declined1 & daylight')) return false;
    const stamp = d ? `${d.year}-${d.doy}` : '';
    if (this.closed === stamp) return false;
    const st = this.live.get(this.key('josie', ep)); if (!st) return false;
    this.closed = stamp;
    let t = T('20:5.2.19'); if (!t) return false;
    if (ep === 31) t = t.replace('all morning', 'most mornings');
    else if (d && d.hours >= 12) t = t.replace('all morning', 'all day');
    this.say(st, t);
    return true;
  }

  staged() { return [...this.live.values()].map((st) => ({ who: st.who, ep: st.ep, slot: st.slot ? st.slot.id : null, at: st.at, x: +st.x.toFixed(1), z: +st.z.toFixed(1), talked: st.talked, barked: st.barked, done: st.done, node: st.run ? st.run.at : null, truck: st.truck, past: st.past })); }
  makeDebug() {
    const self = this;
    return {
      stage(who, ep, id = null, kind = 'foot') { const R = CAST[who]; const slot = R && (R.where.find((w) => w.id === id) || R.where[0]); return self.stage(who, Number(ep), slot, { kind }) ? self.staged() : null; },
      clear() { self.clear(); },
      // why a walkout here would stage whom (each walkout slot: its condition, the budget's answer)
      why(ep) { const a = self.args(ep), B = self.c.beats; return Object.entries(CAST).flatMap(([who, R]) => R.where.filter((w) => w.at === 'walkout').map((w) => ({ who, id: w.id, when: self.when(w.when, a), push: w.push ? (B ? B.check(w.push) : null) : null }))).concat([{ live: self.staged(), trip: self.story && self.story.tripN() }]); },
      entry(who) { const st = [...self.live.values()].find((x) => x.who === who); return st ? self.entry(who, st) : null; },
    };
  }
}

export const cast = new Cast();
