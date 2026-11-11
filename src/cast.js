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
import { PORCH, JOSIE, P1, HERE, WALK_AWAY, porchEntry, PRE_T3 } from './story-data/porch-act1.js';
import { SceneRun, T, MANNERS } from './topics.js';
import { storeLayout, storeLayouts } from './props.js';
import { castPorch } from './grounding.js';
import { RULES_TALK } from './story-data/rules-talk.js';
import { RETURN } from './story-data/topics-act1.js';

const NEAR = 120;            // m: stores this near have their seats kept (npcs settles a roster within 70)
const BARK_R = 9;            // m: the staged person's first word as you come this near
const WALK_PAST = 12;        // m: the porch's "[Keep walking]": T1b
const WALK_OFF = 26;         // m: walked off: X1 (declined), or the stop is over
const GONE_R = 32;           // m: after the scene, he goes once you are this far, or back inside
const TICK = 0.5;            // s between schedule checks
const TRUCK_NEAR = 10;       // m: his pickup only where the store's truck stands this near the door (chk-c1a 1: at 16, 67 and
                             // 38 it stands behind the building, 19–23 m off, and a player walking out never met him)

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
    // no porch: his pickup's tailgate where the lot's truck stands near the door (20 §6.1 "the edge of the lot"), else the
    // foot of the steps, where the player walking out meets him (T1 said as you come out)
    if (!spot && R.noPorch === 'truck' && kind !== 'counter') { const foot = SPOT_OF(L, 'foot'); truck = this.truckAt(ep, foot); spot = truck ? truck.stand : foot; }
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
  truckAt(ep, near = null) {
    const RT = this.c.ridesTruck, make = this.c.truck;
    if (!RT || typeof RT.spot !== 'function' || typeof make !== 'function') return null;
    let S = null;
    try { S = RT.spot(ep); } catch { S = null; }
    if (!S || !Number.isFinite(S.x)) return null;
    if (near && Math.hypot(S.x - near.x, S.z - near.z) > TRUCK_NEAR) return null; // (behind the store: out of sight of the door)
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
    for (const r of RULES_TALK) if (r.on === 'store:enter' && !s.has(r.then[0].slice(2)) && s.when(r.when, { ep })) s.rules.apply(r, { ep }); // (rules-talk.js t.armed: 20 §6.1, armed by the return)
    if (ep === this.home()) this.seat('josie', ep, true);
  }

  // --- the seats by schedule (each tick: the stores near you) -----------------------------------------------------------
  update(dt) {
    if (!this.on) return;
    this.t += dt;
    for (const st of this.live.values()) this.watch(st, dt);
    if (this.josieAfter && (this.josieAfter.t -= dt) <= 0) { // (Josie's line a moment after the keeper's opener)
      const st = this.live.get(this.key('josie', this.josieAfter.ep)); this.josieAfter = null;
      const j = T(RETURN.josie); if (st && j) { this.say(st, j); const n = this.c.npcs; if (n && n.mark) n.mark(j); }
    }
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
    if (slot.walk && !st.talked && !st.done && st.barked && !this.story.has('tauno.porch.done')) {
      if (!st.past && d > WALK_PAST) { st.past = true; this.say(st, T('20:T1b.1')); }
      else if (st.past && d > WALK_OFF) { this.decline(); st.done = true; this.say(st, T('20:X1.1')); }
    }
    const o = this.c.outfitter, inside = !!(o && o.visit && o.visit.ep === st.ep && o.visit.inside);
    if (st.at === 'foot' && (st.done || (st.barked && (!slot.walk || st.talked) && d > WALK_OFF)) && (d > GONE_R || inside)) this.unstage(this.key(st.who, st.ep)); // (talked with and walked off from: he goes once you're in or out of sight, 20 §6.3 T6)
  }
  talkingTo(st) { const t = this.c.talk; return !!(t && t.convo && t.convo.speaker && t.convo.speaker.key === `cast:${st.who}:${st.ep}`); }
  say(st, text) { if (!text || !st.h) return; try { st.h.say(text); } catch { /* not drawn */ } }
  decline() {
    const s = this.story;
    if (s.has('tauno.porch.done')) return; // (walked with him already: a walk-off after T3 is "That's enough for today.", never a decline: chk-c1a 2)
    s.rules.apply({ id: 'cast:decline', then: [s.has('tauno.porch.declined1') ? 'f:tauno.porch.declined2' : 'f:tauno.porch.declined1'] }, {});
  }

  // --- their scene -------------------------------------------------------------------------------------------------------
  entry(who, st) {
    const s = this.story, slot = st.slot || {};
    if (who === 'josie') {
      if (slot.scene) return slot.scene;
      return null;
    }
    return porchEntry(s, slot.scene); // (porch-act1.js: one table for the game and the solver, scripts/story-solve.mjs)
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
    return T(WALK_AWAY); // (he stays till you're gone in or out of sight (watch); E on him again picks up: porchEntry 'resume', "Where was I.")
  }
  // Josie at the home counter: R1, R1b, then the topic that stays; else a word of hers by stage (70 §4.4)
  josieTalk(st) {
    const dlg = this.c.talk, s = this.story, slot = st.slot || {}, n = this.c.npcs, amb = this.c.ambient;
    const take = () => { const ob = this.c.onboarding; if (ob && typeof ob.takeLater === 'function') ob.takeLater(); s.rules.apply({ id: 'josie:take', then: ['f:bundle.later', 'f:bundle.taken'] }, {}); };
    const start = slot.scene; // (after R1b: her word, and "That old pack still in back?" among the choices, asked or not: chk-c1a 6)
    const run = new SceneRun(this.c.topics, JOSIE, { who: 'josie', args: this.args(st.ep), mark: n && n.mark ? (t) => n.mark(t) : null, hooks: { take } });
    st.run = run; st.talked = true;
    if (slot.scene) st.slot = (CAST.josie.where.find((w) => w.id === 'counter')) || slot; // (a re-hook said is said)
    const sp = st.h.speaker;
    const word = () => {
      const pick = amb && typeof amb.pick === 'function' ? amb.pick('josie', { ep: st.ep }) : null;
      const say = pick ? pick.text : '…'; // (her own lines by stage, 70 §4.4; none that holds: a look up from the counter)
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
        // (a row that isn't "behind the …" (16's boathouse, 69's shed, 25's box) takes the whole place: "This was under a tarp
        // in the boathouse, …", never "on the high shelf under a tarp": chk-c1a 8)
        bundle: () => { const t = T('20:1.2.14'); if (!t) return null; const b = back ? back.replace(/^…\s*/, '').replace(/\.$/, '') : null; return { text: b ? (/^behind /.test(b) ? t.replace(/behind the \{[^}]*\}/, b) : t.replace(/on the high shelf behind the \{[^}]*\}/, b)) : t.replace(/ behind the \{[^}]*\}/, '') }; },
        extra: () => P1.extra[ep] || null,
        take: () => { ob.give(); set('bundle.taken'); },
        shelf: () => { if (typeof ob.shelf === 'function') ob.shelf(); set('bundle.shelf'); },
      } });
    return run.node('open');
  }
  // the return's opener (20 §5.2): the first time inside any outfitter after night one, the keeper by manner in place of
  // the hello (main.js wraps npcs.keeperSays), and at home Josie's after it ("You actually took the old stuff."). Once.
  returnHello(ep) {
    if (!this.on) return null;
    const s = this.story, n = this.c.npcs;
    if (!s.when('f:nb.found & !f:return.greeted')) return null;
    ep = Number(ep);
    s.rules.apply({ id: 'cast:return', then: ['f:return.greeted'] }, {});
    const ch = n && typeof n.charOf === 'function' ? n.charOf(ep) : null, manner = ch ? ch.manner : 'warm';
    const last = n && n.mem && typeof n.mem.lastTrip === 'function' ? n.mem.lastTrip() : null, nights = last && last.nights ? last.nights : null;
    let t = T(RETURN.opener[Math.max(0, MANNERS.indexOf(manner))], nights ? { n: nights } : null);
    if (t) t = t.replace(/[^.?!]*\{\w+\}[^.?!]*[.?!]\s*/g, '').trim(); // (no count of nights: "Welcome back. The canvas held?")
    if (ep === this.home()) this.josieAfter = { ep, t: 2.2 };
    return t || null;
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
