// Co-op phase 3, stream C (docs/plans/coop.md, "Phase 3 as planned"): Adventure in co-op. Until now a room was Sandbox
// only; here an Adventure season can be shared, and the trip, the boards and the rides become the group's:
//
//   - Invite friends in an Adventure season too (coop.js canInvite). A guest takes the host's mode; their purse and their
//     things are the visit's, kept by the host (coop-give.js), and in Adventure the shelves charge (shop.js free is
//     Sandbox's), so a guest buys with their own money and the host's purse is never touched.
//   - Arriving: a guest whose host is on foot at an outfitter is tied up at that store's dock in a free berth
//     (outfitter.berthFor skips the host's canoe) and stands at its door; a host out in the wild is joined at their side
//     as in Sandbox (coop.js enterAsGuest).
//   - The stores are each player's: the shelves, the counter and the keeper are local, priced to your own purse.
//   - The boards are the host's. A guest's boards are a mirror of the host's tasks (tasks.serialize, merged notice by
//     notice so the props stay put); a guest never writes a notice of its own (tasks.write is the host's). Taking a notice
//     asks the host first (one claim: whoever's request reaches it first; the other is told it is gone), then runs the
//     kind's onTake on the taker's own browser (a Secchi disk lent goes into the taker's pack). A notice's progress is
//     anyone's (whoever finds the lost paddle), a "done" never goes back, and the taker's own browser is the authority
//     for the rest of its progress. Pay goes to whoever claims it at the board (their own purse, as the claim runs on
//     their browser); the host is then told it is gone (`gone`) and clears its pin without paying itself.
//   - The trip is one, the host's. The guest's trip core mirrors it (active, since, from) and never pushes off, comes in
//     or writes the logbook itself: the push-off happens when any player leaves a landing (a guest says `push`, the host
//     runs outfitter.start), and the trip comes in (or is taken back) only when every player is ashore at an
//     outfitter's landing. The log carries `who`; a guest's lakes, portages, capsizes and evacuations are logged by the
//     host under their name (`tlog`). The trip card at the end and the record are the host's alone.
//   - A ride or the bunkhouse is a group jump: whoever asks at the counter makes a proposal; everyone must be at that
//     store and tick Ready (the card at the top of the screen: each name, here or not, ready or not); then the host says
//     go and every browser runs its own ride or night (its own fare, its own energy), the clock advanced by the host
//     alone (a guest's day.advance is held during the jump and the host's clock comes to it); the ride ends with each
//     player tied up in their own berth (by their place in the group).
//   - An evacuation is one player's: the energy spent moves that player to the nearest outfitter they know, on the
//     group's clock (no jump, for anyone), rested; the trip goes on for the others (and on the host it stays open).
//   - Single player, and a room with nobody else in it, is unchanged: everything here asks `grouped` first.
//
// The wire (coop.on / coop.send):
//   trip     host → all/one  { mode, at, st: { active, id, since, from, away, ep, fromName, startAbs }, who, out }
//   tripq    guest → host    {}                                  (on the way in: the host's trip, mode and where it is)
//   push     guest → host    { ep }                              (the guest has left that landing: push off)
//   tlog     guest → host    { kind, data }                      (a guest's lake, portage, capsize, evacuation)
//   tasks    host → all/one  { d: tasks.serialize() }            (the boards and the notices, on a change, ≤ 4 Hz)
//   tasksq   guest → host    { ep? }                             (send the boards; with ep: write that board up)
//   ttake    guest → host    { id, rid } → ttaker { rid, ok }    (one claim: first come)
//   tprog    guest → host    { n }                               (a notice's progress, done, or let go)
//   gone     guest → host    { id }                              (claimed and paid on the guest's browser)
//   jumpq    guest → host    { kind: 'ride' | 'bunk', fe, te }  (a proposal: from and to entry points; `from` is the relay's)
//   jumpt    any → host      { id, on, cancel? }                 (a tick, or Not this time)
//   jump     host → all      { p: { id, kind, from, to, by, ticks } | null }
//   jumpgo   host → all      { id, kind, fe, te, order: [ids] }
//
//   const ct = new CoopTrip(coop)   (main.js, after the co-op's other modules)
//   ct.grouped · ct.propose(kind, from, to) · ct.tick(on) · ct.cancel() · ct.stats()
import { quoteBetween, rideTime } from './rides.js';
import { outfitterProfile, roadOf } from './outfitters.js';

const NEAR = 25;          // outfitter.js: metres from a landing that are still at it afloat
const COME_IN = 30;       // outfitter.js: on foot this near a landing, a trip has come in
const AWAY = 90;          // outfitter.js: this far from the landing it left, a trip is a trip
const REMOTE_AT = 130;    // a friend on foot this near a landing's own spot is at it (the host may not have their store built)
const AT_STORE = 60;      // metres from a landing (distTo) that count as at its store, for a group jump
const TASKS_EVERY = 250;  // ms between the host's tasks messages
const ASK_EVERY = 2500;   // ms between a guest's asks for a board
const FORWARD = new Set(['lake', 'portage', 'capsize', 'evac', 'camp']);
const LATE = 21, EARLY = 5;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const IDLE = { active: false, ep: null, days: 0, started: null, startAbs: 0, turnedIn: 0 };

export class CoopTrip {
  constructor(coop) {
    this.coop = coop;
    this.prop = null;            // the proposal (a ride, a bunk night): { id, kind, from, to, by, ticks: { peerId: bool } }
    this.jumping = null;         // a jump under way here: { id, kind, to, slot, t0 }
    this.holdClock = false;      // a guest's own day.advance is held (the host's clock comes)
    this.tripSig = ''; this.tasksSig = ''; this.tasksT = 0; this.tasksDirty = false;
    this.hostTrip = null;        // a guest: the host's trip as last heard
    this.mirrored = false;       // a guest: the host's tasks are in (the first restore done)
    this.asked = new Map();      // a guest: ep → when the host was last asked to write that board
    this.takes = new Map();      // a guest: rid → { id, resolve }
    this.pushT = 0; this.whoNext = null; this.applying = false; this.arrive = null;
    this.log = [];
    this.wire();
    this.hook();
    this.card = null;
  }
  get g() { return this.coop.g; }
  get myName() { return this.coop.visitor.name || 'A friend'; }
  get myVid() { return this.coop.visitor.id; }
  // a room with someone else in it, in Adventure: the group's rules. Alone (or Sandbox) nothing here applies.
  get grouped() { const t = this.g.trip; return !!(this.coop.live && this.coop.role && this.coop.remotes.size > 0 && t && t.adventure); }
  get host() { return this.coop.role === 'host'; }
  get guest() { return this.coop.role === 'guest'; }
  // a guest in an Adventure room: the boards are the host's, mirrored here
  get mirroring() { const t = this.g.trip; return !!(this.guest && this.coop.live && t && t.adventure); }
  hostPeer() { return this.coop.peers().find((p) => p.host) || null; }
  nameOf(id) { if (id === this.coop.id) return this.myName; const r = this.coop.remotes.get(id); return r ? r.name : 'a friend'; }
  note(t, s = 5) { const h = this.g.hud; if (h && h.note && t) h.note(t, s); this.log.push(t); if (this.log.length > 30) this.log.shift(); }
  toHost(m) { const h = this.hostPeer(); return h ? this.coop.send({ ...m, to: h.id }) : false; }
  // every player in the room: [{ id, name, me, x, z, m }] (the others where they are drawn now)
  everyone() {
    const p = this.g.player, out = [{ id: this.coop.id, name: this.myName, me: true, x: p.x, z: p.z, m: p.mode }];
    for (const r of this.coop.remotes.values()) { const a = r.drawnAt; out.push({ id: r.id, name: r.name, me: false, x: a ? a.x : NaN, z: a ? a.z : NaN, m: a ? a.m : null }); }
    return out;
  }

  // --- the wire --------------------------------------------------------------------------------------------------------
  wire() {
    const c = this.coop;
    c.on('trip', (m) => this.onTrip(m));
    c.on('tripq', (m) => { if (this.host) this.sendTrip(m.from); });
    c.on('push', (m) => this.onPush(m));
    c.on('tlog', (m) => this.onLog(m));
    c.on('tasks', (m) => this.onTasks(m));
    c.on('tasksq', (m) => this.onTasksQ(m));
    c.on('ttake', (m) => this.onTake(m));
    c.on('ttaker', (m) => { const w = this.takes.get(m.rid); if (w) { this.takes.delete(m.rid); w.resolve(!!m.ok); } });
    c.on('tprog', (m) => this.onProg(m));
    c.on('gone', (m) => this.onGone(m));
    c.on('jumpq', (m) => { if (this.host) this.openProp({ kind: m.kind, from: m.fe, to: m.te }, m.from); });
    c.on('jumpt', (m) => this.onTick(m));
    c.on('jump', (m) => { if (this.guest) { this.prop = m.p || null; this.render(); } });
    c.on('jumpgo', (m) => this.go(m));
    c.onPeers((what, peer) => {
      if (what === 'join' && this.host) { this.sendTrip(peer.id); this.tasksDirty = true; this.tasksSig = ''; }
      if (what === 'leave' && this.host && this.prop) { delete this.prop.ticks[peer.id]; this.sendProp(); this.check(); }
      if (what === 'gone') { this.prop = null; this.render(); this.mirrored = false; this.hostTrip = null; }
    });
    c.tick((now) => this.frame(now));
  }

  // --- the hooks into the single-player modules (each asks `grouped`, or the role, first) ------------------------------
  hook() {
    const g = this.g, c = this.coop;
    // a guest: in at the host's store, the host's trip, mode and boards asked for on the way in
    const enter = c.enterAsGuest.bind(c);
    c.enterAsGuest = async (w) => {
      const r = await enter(w);
      const core = g.trip, o = g.outfitter;
      if (core) core.reset(core.mode); // the guest's own season's trip is not this one (nothing is written: kv is frozen)
      if (o) { o.trip = { ...IDLE }; o.port = null; }
      this.mirrored = false; this.hostTrip = null; this.arrive = { pending: true, t: performance.now() };
      this.toHost({ t: 'tripq' });
      this.toHost({ t: 'tasksq' });
      return r;
    };
    // the clock: a guest's own advance is held during a group jump (the host's comes to it)
    const day = g.day;
    if (day && !day.coopHeld) {
      const adv = day.advance.bind(day);
      day.advance = (h) => (this.holdClock && this.guest ? undefined : adv(h));
      day.coopHeld = true;
    }
    this.hookTrip(); this.hookOutfitter(); this.hookTasks(); this.hookRides();
  }
  hookTrip() {
    const core = this.g.trip; if (!core) return;
    // the log carries who: the host's own events are the host's, a push-off asked by a guest is theirs
    const log = core.log.bind(core);
    core.log = (kind, data = {}) => {
      if (!this.grouped) return log(kind, data);
      if (this.guest) {
        if (FORWARD.has(kind) && !this.applying) this.toHost({ t: 'tlog', kind, data });
        return log(kind, { who: this.myName, ...data });
      }
      return log(kind, { who: this.whoNext || this.myName, ...data });
    };
    // an evacuation is the player's own (below)
    const evac = core.evacuate.bind(core);
    core.evacuate = (why) => (this.grouped ? this.evacuate(why) : evac(why));
  }
  hookOutfitter() {
    const o = this.g.outfitter; if (!o) return;
    const upd = o.updateTrip.bind(o);
    o.updateTrip = () => { if (!this.grouped) return upd(); return this.host ? this.hostUpdateTrip() : this.guestUpdateTrip(); };
    // a group jump's berths: each player's own, by their place in the group, so two tie-ups at once never share one
    const berthFor = o.berthFor.bind(o);
    o.berthFor = (L) => {
      const J = this.jumping;
      if (J && J.slot != null && L && L.ep === J.to) { const list = o.berths(L); return list[Math.min(J.slot, list.length - 1)]; }
      return berthFor(L);
    };
    const bunk = o.bunk.bind(o);
    o.bunk = () => {
      if (!this.grouped || (this.jumping && this.jumping.kind === 'bunk')) return bunk();
      if (o.at) this.propose('bunk', o.at.ep, o.at.ep);
      return undefined;
    };
  }
  hookRides() {
    const R = this.g.rides; if (!R) return;
    const take = R.take.bind(R);
    R.take = (ep) => {
      if (!this.grouped) return take(ep);
      const from = R.here(), to = R.landing(ep);
      if (!from || !to) return take(ep); // (the refusals' own words)
      const r = R.offer(from.ep).find((x) => x.ep === to.ep);
      if (!r) return take(ep);
      this.propose('ride', from.ep, to.ep);
      return false;
    };
  }
  hookTasks() {
    const T = this.g.tasks; if (!T) return;
    const mirror = () => this.mirroring && this.mirrored;
    // a guest never writes a notice: the host writes its boards, and the guest asks for one it has not got (or a new day's)
    const write = T.write.bind(T);
    T.write = (ep) => (this.mirroring ? this.askBoard(ep) : write(ep));
    const board = T.board.bind(T);
    T.board = (ep) => {
      if (!this.mirroring) return board(ep);
      const b = T.boards[ep];
      if (!b || T.today() > b.day || (b.pending && b.pending.length)) this.askBoard(ep);
      return b ? b.slots.map((id) => (id == null ? null : T.ads.get(id) || null)) : [null, null, null, null];
    };
    // taking a notice: one claim, the host's (a guest asks first, then the kind's onTake runs here)
    const take = T.take.bind(T);
    T.take = (id) => {
      if (this.host && this.grouped) { const ok = take(id); if (ok) { const t = T.ads.get(+id); if (t) { t.by = this.myName; t.byId = this.myVid; } } return ok; }
      if (!mirror()) return take(id);
      const t = T.ads.get(+id);
      if (!t || t.status !== 'offered') return false;
      this.askTake(+id);
      return false;
    };
    // a notice someone else took is theirs to let go; the pile says whose it is
    const drop = T.drop.bind(T);
    T.drop = (id) => {
      const t = T.ads.get(+id);
      if (this.grouped && t && t.by && t.by !== this.myName) { this.note(`That one is ${t.by}’s to let go.`, 4); return false; }
      return drop(id);
    };
    const pileCard = T.pileCard.bind(T);
    T.pileCard = (t, ...a) => {
      let h = pileCard(t, ...a);
      if (this.grouped && t && t.by && t.by !== this.myName) h = h.replace('<span class="tk-say">', `<span class="tk-say">${esc(t.by)}’s · `).replace(/<button[^>]*data-id="drop:[^"]*"[^>]*>[^<]*<\/button>/, '');
      return h;
    };
    // the guest's changes go to the host (progress, done, let go, claimed); the host's go out to everyone
    const changed = T.changed.bind(T);
    T.changed = () => { changed(); if (this.applying) return; if (this.host) this.tasksDirty = true; else if (mirror()) this.guestDiff(); };
    const bc = T.boardChanged.bind(T);
    T.boardChanged = () => { bc(); if (!this.applying && this.host) this.tasksDirty = true; };
  }

  // --- the trip: one, the host's ---------------------------------------------------------------------------------------
  tripState() {
    const g = this.g, core = g.trip, o = g.outfitter, s = core.state, t = o ? o.trip : IDLE, p = g.player;
    return {
      mode: core.mode, at: o && o.visit && p.onFoot ? o.visit.ep : null,
      st: { active: !!s.active, id: s.id, since: s.since, from: s.from, away: !!t.away, ep: t.ep, fromName: t.fromName || null, startAbs: t.startAbs || 0 },
      who: this.lastWho || null, out: s.outcome || null,
    };
  }
  sendTrip(to = null) {
    if (!this.host) return;
    const m = { t: 'trip', ...this.tripState() };
    if (to) m.to = to;
    this.coop.send(m);
  }
  onTrip(m) {
    if (!this.guest) return;
    const g = this.g, core = g.trip, o = g.outfitter;
    if (!core) return;
    const was = this.hostTrip;
    this.hostTrip = m;
    if (core.mode !== m.mode) { core.setMode(m.mode); if (g.profile && g.profile.s) g.profile.s.mode = m.mode; }
    // in at the host's store (Adventure): tied up at a free berth of its dock, at its door
    if (this.arrive && this.arrive.pending) {
      this.arrive.pending = false;
      if (core.adventure && o && m.at != null && o.landing(m.at)) { o.arrival = { why: 'coop', ep: m.at, t: 0 }; o.pendingShow = false; }
    }
    if (m.mode !== 'adventure') return; // (a Sandbox room: each browser's own trip core, as in phases 1 and 2)
    const st = m.st || {}, s = core.state;
    const on = !!st.active, wasOn = !!s.active;
    this.applying = true;
    try {
      s.active = on; s.id = st.id || null; s.since = st.since || null; s.from = st.from ?? null;
      if (on) { s.outcome = null; if (!wasOn) { s.log = []; s.camp = null; } }
      if (o) o.trip = on ? { ...IDLE, active: true, ep: st.ep ?? st.from, days: o.foodRoom, startAbs: st.startAbs || 0, fromName: st.fromName || '', away: !!st.away } : { ...IDLE, days: o.foodRoom };
    } finally { this.applying = false; }
    if (!was) return; // the first word on the way in: no title for a trip already under way
    if (on && !wasOn) {
      const l = o ? o.landing(st.from) : null, lake = l ? o.lakeOf(l) : '';
      if (g.stats && g.stats.reset) g.stats.reset();
      if (o) o.port = null;
      if (g.hud && g.hud.showPlace && l) g.hud.showPlace(`Pushing off · ${l.name}`, lake, m.who && m.who !== this.myName ? `${m.who} pushed off · come in at any outfitter` : 'Come in at any outfitter', 6);
    } else if (!on && wasOn) {
      const out = m.out, l = out && out.ep != null && o ? o.landing(out.ep) : null;
      if (out && out.k === 'completed' && l) this.note(`The group came in at ${l.name}. The trip is in ${this.coop.hostName || 'your friend'}’s logbook.`, 6);
    }
  }
  // a guest: on foot by a landing it is your port; paddling off from it (or into the canoe there) asks the host to push off
  guestUpdateTrip() {
    const g = this.g, p = g.player, o = g.outfitter, t = o.trip;
    if (p.teleporting || o.arrival || o.bunking || o.docking || this.jumping || (g.trip && g.trip.evacuating) || (o.veil && o.veil.active)) return;
    const walking = p.mode === 'walk' || p.mode === 'carry';
    if (walking) { const n = o.nearest(p.x, p.z); if (n && n.d < COME_IN) o.port = n.l; }
    else if (p.mode === 'paddle' && !t.active && o.port) {
      const now = performance.now();
      if ((o.portWalked || o.distTo(o.port, p.x, p.z) > NEAR) && now - this.pushT > 3000) { this.pushT = now; this.toHost({ t: 'push', ep: o.port.ep }); }
    }
    o.portWalked = walking && !!o.port;
  }
  // the host: a push-off when anyone leaves a landing (the host itself, or a guest's push); in only when everyone is
  // ashore at an outfitter's landing (else nothing: the trip goes on), taken back when nobody went anywhere
  hostUpdateTrip() {
    const g = this.g, p = g.player, o = g.outfitter, core = g.trip, t = o.trip;
    if (p.teleporting || o.arrival || o.evac || o.bunking || o.docking || this.jumping || (core && core.evacuating) || (o.veil && o.veil.active)) return;
    const walking = p.mode === 'walk' || p.mode === 'carry';
    if (walking) { const n = o.nearest(p.x, p.z); if (n && n.d < COME_IN) o.port = n.l; }
    if (t.active) {
      const from = o.landing(t.ep), all = this.everyone();
      if (!t.away && from && all.some((q) => Number.isFinite(q.x) && o.distTo(from, q.x, q.z) > AWAY)) { t.away = true; o.save(); }
      const ats = all.map((q) => this.ashoreAt(q));
      if (ats.every(Boolean)) {
        const mine = ats[0], at = mine || ats.find(Boolean);
        if (t.away || ats.some((a) => a.ep !== t.ep)) { this.whoNext = null; o.comeIn(at); } else o.takeBack(at);
      }
    } else if (p.mode === 'paddle' && o.port) {
      if (o.portWalked || o.distTo(o.port, p.x, p.z) > NEAR) { o.at = o.port; this.lastWho = this.myName; o.start(); }
    }
    o.portWalked = walking && !!o.port;
  }
  // the landing a player is ashore at (on foot near it), or null; a friend with no pose yet counts as ashore
  ashoreAt(q) {
    const o = this.g.outfitter;
    if (!q.me && q.m == null) return o.trip.ep != null ? o.landing(o.trip.ep) : null;
    if (!(q.m === 'walk' || q.m === 'carry' || q.m === 'sit')) return null;
    if (!Number.isFinite(q.x)) return null;
    const n = o.nearest(q.x, q.z);
    if (n && n.d < COME_IN) return n.l;
    if (!q.me) { for (const l of o.landings) if (Math.hypot(l.x - q.x, l.z - q.z) < REMOTE_AT) return l; }
    return null;
  }
  onPush(m) {
    if (!this.host || !this.grouped) return;
    const o = this.g.outfitter, l = o && o.landing(Number(m.ep));
    if (!l || o.trip.active) return;
    o.at = l; o.port = l;
    this.whoNext = this.nameOf(m.from); this.lastWho = this.whoNext;
    try { o.start(); } finally { this.whoNext = null; }
  }
  onLog(m) {
    if (!this.host || !FORWARD.has(m.kind)) return;
    const core = this.g.trip; if (!core || !core.active) return;
    const data = m.data && typeof m.data === 'object' ? m.data : {};
    if (m.kind === 'lake' && core.state.log.some((e) => e.k === 'lake' && e.id === data.id)) return;
    this.whoNext = this.nameOf(m.from);
    try { core.log(m.kind, { ...data, who: this.whoNext }); } finally { this.whoNext = null; }
  }

  // --- the evacuation: one player's, on the group's clock -------------------------------------------------------------
  evacuate(why = 'food') {
    const g = this.g, core = g.trip, o = g.outfitter;
    if (!core || !core.adventure || !core.active || core.evacuating) return false;
    core.evacuating = true;
    const to = core.nearestKnownOutfitter(), lake = to ? g.world.lakeName(to.lake) || to.place : null;
    core.log('evac', { why, to: to ? to.ep : null, alone: true });
    const others = [...this.coop.remotes.values()].map((r) => r.name).join(' and ') || 'the others';
    const card = {
      kicker: to ? `${to.name} · entry point ${to.ep}` : 'The outfitter',
      text: '“You were about done in out there. We brought you in to rest; your friends are still out.”',
      sub: `You come to at the ${lake ? `${lake} ` : ''}landing, rested, on the same clock as ${others}. The trip goes on: paddle out to meet them, or wait for them to come in. The stringer stayed out there.`,
      fadeIn: 1.6, hold: 4.5, fadeOut: 2.0,
      onDark: async () => {
        if (to && o && o.onTeleport) await o.onTeleport(to.x, to.z);
        if (to) core.learn(to.ep);
        const f = g.fishing; if (f && f.stringer) f.stringer.length = 0;
        const en = g.energy; if (en) { en.sleep(1, 8); en.value = 1; }
        if (o && o.open) o.hide();
      },
    };
    const done = () => { core.evacuating = false; if (o) o.afterEvac(to); };
    if (g.veil) g.veil.card(card).then(done, done);
    else Promise.resolve(card.onDark()).then(done, done);
    return true;
  }

  // --- the boards: the host's ---------------------------------------------------------------------------------------
  sendTasks(to = null) {
    const T = this.g.tasks; if (!T || !this.host) return;
    const d = T.serialize(), s = JSON.stringify(d);
    if (!to && s === this.tasksSig) return;
    if (!to) this.tasksSig = s;
    const m = { t: 'tasks', d };
    if (to) m.to = to;
    this.coop.send(m);
  }
  onTasksQ(m) {
    if (!this.host) return;
    const T = this.g.tasks; if (!T) return;
    if (m.ep != null && Number.isFinite(Number(m.ep))) { try { T.board(Number(m.ep)); } catch (e) { console.warn('coop-trip board', e); } }
    this.sendTasks(m.from);
  }
  askBoard(ep) {
    const now = performance.now(), t = this.asked.get(ep) || 0;
    if (now - t > ASK_EVERY) { this.asked.set(ep, now); this.toHost({ t: 'tasksq', ep }); }
    return Promise.resolve();
  }
  // a guest: the host's tasks, merged notice by notice (the props and the kinds' local fields stay), or whole the first time
  onTasks(m) {
    if (!this.mirroring || !m.d) return;
    const T = this.g.tasks; if (!T) return;
    this.applying = true;
    try {
      if (!this.mirrored) { T.restore(m.d); this.mirrored = true; this.hostAds = new Map((m.d.ads || []).map((t) => [t.id, JSON.stringify(t)])); T.boardChanged(); return; }
      const ads = new Map((m.d.ads || []).map((t) => [t.id, t]));
      for (const id of [...T.ads.keys()]) if (!ads.has(id)) { T.removeProp(id); T.ads.delete(id); }
      for (const [id, h] of ads) {
        const l = T.ads.get(id);
        if (!l) { T.ads.set(id, { ...h }); continue; }
        // the taker's own progress is theirs; a done here is never undone by an older word from the host
        if (l.byId === this.myVid && l.status === 'open' && h.status === 'open') continue;
        if (l.status === 'done' && h.status === 'open') { this.coop.send({ t: 'tprog', to: m.from, n: l }); continue; }
        if (h.status === 'offered' && l.status !== 'offered') { delete l.taken; delete l.by; delete l.byId; }
        Object.assign(l, h);
      }
      const boards = {};
      for (const [ep, b] of Object.entries(m.d.boards || {})) if (b && Array.isArray(b.slots)) boards[ep] = { slots: b.slots.map((id) => (id != null && T.ads.has(id) ? id : null)), day: b.day || 0, n: b.n || 0, pending: [] };
      T.boards = boards;
      for (const k of ['tally', 'claimed']) if (m.d[k]) T[k] = m.d[k];
      T.seed = m.d.seed || T.seed; T.nextId = Math.max(T.nextId, m.d.nextId || 1);
      this.hostAds = new Map((m.d.ads || []).map((t) => [t.id, JSON.stringify(T.ads.get(t.id) || t)]));
      T.boardChanged();
    } finally { this.applying = false; }
    const o = this.g.outfitter; if (o && o.open) o.render();
  }
  // a guest: what changed here goes to the host (a notice moved on, done, let go; one claimed here is gone)
  guestDiff() {
    if (this.diffQ) return;
    this.diffQ = true;
    queueMicrotask(() => {
      this.diffQ = false;
      const T = this.g.tasks, H = this.hostAds; if (!T || !H) return;
      for (const [id, js] of H) {
        const l = T.ads.get(id);
        if (!l) { this.toHost({ t: 'gone', id }); H.delete(id); continue; }
        const now = JSON.stringify(l);
        if (now !== js) { this.toHost({ t: 'tprog', n: l }); H.set(id, now); }
      }
    });
  }
  askTake(id) {
    const rid = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const T = this.g.tasks;
    new Promise((resolve) => { this.takes.set(rid, { id, resolve }); setTimeout(() => { if (this.takes.delete(rid)) resolve(false); }, 4000); })
      .then((ok) => {
        const t = T.ads.get(id);
        if (!ok || !t) { this.note('Someone has that notice already.', 4); T.boardChanged(); return; }
        this.applying = true;
        try {
          t.status = 'open'; t.taken = T.today(); t.by = this.myName; t.byId = this.myVid;
          const k = T.kinds[t.kind];
          if (k && k.onTake) { try { k.onTake(T, t); } catch (e) { console.warn('the board: take', t.kind, e); } }
        } finally { this.applying = false; }
        if (this.hostAds) this.hostAds.set(id, JSON.stringify(t));
        this.toHost({ t: 'tprog', n: t });
        T.boardChanged();
        const o = this.g.outfitter; if (o && o.open) o.render();
      });
    this.toHost({ t: 'ttake', id, rid });
  }
  onTake(m) {
    if (!this.host) return;
    const T = this.g.tasks, t = T && T.ads.get(+m.id);
    const ok = !!(t && t.status === 'offered');
    if (ok) { t.status = 'open'; t.taken = T.today(); t.by = this.nameOf(m.from); t.byId = this.visitorOf(m.from); }
    this.coop.send({ t: 'ttaker', to: m.from, rid: m.rid, ok });
    if (ok) { this.note(`${t.by} took the notice “${t.title}”.`, 4); T.changed(); T.boardChanged(); }
  }
  visitorOf(peerId) { return `peer:${peerId}`; } // (the guest's own tprog brings its visitor id)
  onProg(m) {
    const g = m.n;
    if (!this.host || !g || g.id == null) return;
    const T = this.g.tasks, h = T && T.ads.get(+g.id); if (!h) return;
    const theirs = h.by === this.nameOf(m.from); // (the taker's browser is the authority for its notice)
    if (g.status === 'done' && h.status === 'open') Object.assign(h, g);
    else if (theirs && h.status !== 'done') {
      if (g.status === 'offered') { T.removeProp(h.id); h.status = 'offered'; delete h.taken; delete h.by; delete h.byId; if (h.cooler) h.cooler = []; }
      else Object.assign(h, g);
    } else return;
    T.changed(); T.boardChanged();
  }
  // claimed and paid on the guest's browser: the host clears the pin, without paying itself
  onGone(m) {
    if (!this.host) return;
    const T = this.g.tasks, t = T && T.ads.get(+m.id); if (!t) return;
    if (!(t.status === 'done' || t.by === this.nameOf(m.from))) return;
    T.tally[t.kind] = (T.tally[t.kind] || 0) + 1;
    T.claimed.push({ id: t.id, kind: t.kind, title: t.title, from: t.from, pay: t.pay || 0, day: T.today(), who: this.nameOf(m.from) });
    if (T.claimed.length > 30) T.claimed.splice(0, T.claimed.length - 30);
    T.removeProp(t.id); T.ads.delete(t.id);
    const b = T.boards[t.from]; if (b) { const i = b.slots.indexOf(t.id); if (i >= 0) b.slots[i] = null; }
    this.note(`${this.nameOf(m.from)} was paid $${t.pay || 0} for “${t.title}”.`, 4);
    T.changed(); T.boardChanged();
  }

  // --- the group jumps: a ride, a bunk night ---------------------------------------------------------------------------
  propose(kind, from, to) {
    if (!this.grouped) return false;
    if (this.prop) { this.note('Something is already being decided: see the card at the top.', 4); return false; }
    const why = this.whyNot({ kind, from, to });
    if (why) { this.note(why, 4); return false; }
    const o = this.g.outfitter; if (o && o.open) o.hide();
    if (this.host) this.openProp({ kind, from, to }, this.coop.id);
    else this.toHost({ t: 'jumpq', kind, fe: from, te: to });
    return true;
  }
  openProp({ kind, from, to }, by) {
    if (this.prop || !['ride', 'bunk'].includes(kind)) return;
    const o = this.g.outfitter;
    if (!o || !o.landing(Number(from)) || !o.landing(Number(to))) return;
    this.prop = { id: `${Date.now().toString(36)}`, kind, from: Number(from), to: Number(to), by, byName: this.nameOf(by), ticks: { [by]: true } };
    this.sendProp(); this.render(); this.check();
  }
  sendProp() { if (this.host) this.coop.send({ t: 'jump', p: this.prop }); }
  tick(on = true) {
    const P = this.prop; if (!P) return false;
    if (on && !this.canTick()) { this.note(this.whyNot() || 'Not here.', 4); return false; }
    if (this.host) { P.ticks[this.coop.id] = !!on; this.sendProp(); this.render(); this.check(); }
    else { P.ticks[this.coop.id] = !!on; this.render(); this.toHost({ t: 'jumpt', id: P.id, on: !!on }); }
    return true;
  }
  cancel() {
    const P = this.prop; if (!P) return;
    if (this.host) { this.prop = null; this.sendProp(); this.render(); this.note('Not this time.', 3); }
    else this.toHost({ t: 'jumpt', id: P.id, cancel: true });
  }
  onTick(m) {
    if (!this.host || !this.prop || m.id !== this.prop.id) return;
    if (m.cancel) { this.note(`${this.nameOf(m.from)}: not this time.`, 4); this.prop = null; this.sendProp(); this.render(); return; }
    this.prop.ticks[m.from] = !!m.on;
    this.sendProp(); this.render(); this.check();
  }
  // at the store the proposal is for, and able to pay for it
  here(ep) { const o = this.g.outfitter, p = this.g.player, l = o && o.landing(ep); return !!(l && p.onFoot && o.distTo(l, p.x, p.z) < AT_STORE); }
  fare(P = this.prop) {
    const g = this.g, o = g.outfitter, sandbox = g.trip && g.trip.sandbox;
    if (!P || sandbox) return 0;
    if (P.kind === 'bunk') return g.shop ? g.shop.price('bunk', P.from) : 8;
    const a = o.landing(P.from), b = o.landing(P.to);
    return a && b ? quoteBetween(a, b).price : 0;
  }
  whyNot(P = this.prop) {
    const o = this.g.outfitter, pr = this.g.profile; if (!P) return null;
    if (!this.here(P.from)) return `Come to ${o.landing(P.from).name} first.`;
    const f = this.fare(P); if (f && pr && pr.money < f) return `It’s $${f}, and you have $${pr.money}.`;
    return null;
  }
  canTick() { return !this.whyNot(); }
  check() {
    const P = this.prop; if (!this.host || !P) return;
    const ids = [this.coop.id, ...this.coop.remotes.keys()];
    if (!ids.every((id) => P.ticks[id])) return;
    const order = [this.coop.id, ...[...this.coop.remotes.keys()].sort()];
    const go = { t: 'jumpgo', id: P.id, kind: P.kind, fe: P.from, te: P.to, order };
    this.prop = null; this.sendProp();
    this.coop.send(go);
    this.go(go);
  }
  // everyone ready: each browser runs its own ride or night; the host's clock is the one that moves
  go(m) {
    if (this.jumping && this.jumping.id === m.id) return;
    this.prop = null; this.render();
    const slot = Math.max(0, (m.order || []).indexOf(this.coop.id));
    this.jumping = { id: m.id, kind: m.kind, to: Number(m.te), slot, t0: performance.now() };
    if (this.guest) this.holdClock = true;
    const done = () => { this.holdClock = false; if (this.jumping && this.jumping.id === m.id) this.jumping.done = performance.now(); };
    if (m.kind === 'ride') this.ride(Number(m.fe), Number(m.te)).then(done, done);
    else this.bunkNight(Number(m.fe)).then(done, done);
  }
  ride(fromEp, toEp) {
    const g = this.g, R = g.rides, o = g.outfitter, pr = g.profile, d = g.day;
    const from = o.landing(fromEp), to = o.landing(toEp);
    if (!R || !from || !to) return Promise.resolve(false);
    const sandbox = R.sandbox, q = quoteBetween(from, to), at = ((d ? d.hours : 12) + q.hours) % 24;
    const lake = g.world.lakeName ? g.world.lakeName(to.lake) || to.place : to.place;
    const r = { ep: to.ep, name: to.name, place: to.place, lake, road: roadOf(to.ep), ...q, price: sandbox ? 0 : q.price, unknown: !R.knows(to.ep), late: !sandbox && (at >= LATE || at < EARLY) };
    let paid = r.price;
    if (paid && !(pr && pr.spend(paid, `the ride to ${to.name}`))) paid = 0;
    r.price = paid; // (arrive refunds what was paid, should the road be closed)
    R.busy = true;
    if (o.open) o.hide();
    if (o.shelfOpen) o.shelf.close();
    const names = this.everyone().map((x) => x.name).join(', ');
    const card = {
      kicker: `${from.name} → ${to.name} · entry point ${to.ep}`,
      text: `“All of you? Climb in, there’s room in the back.”`,
      sub: `${names}: ${rideTime(r.hours)} up ${r.road === roadOf(from.ep) ? r.road : 'the roads'} to ${lake}${paid ? `, $${paid} each` : ''}. The canoes ride on the roof.${r.late ? ` It’s late when you get in: a bunk at ${to.name}, up at half past seven.` : ''}`,
      fadeIn: 1.2, hold: 3.2, fadeOut: 1.8,
      onDark: () => R.arrive(from, to, r, outfitterProfile(to.ep, g.world)),
    };
    const done = () => { R.busy = false; };
    if (g.veil) return g.veil.card(card).then(done, done);
    return Promise.resolve(card.onDark()).then(done, done);
  }
  bunkNight(ep) {
    const g = this.g, o = g.outfitter, l = o && o.landing(ep);
    if (!l) return Promise.resolve(false);
    o.at = l;
    return new Promise((res) => {
      o.bunk(); // (jumping: the outfitter's own bunk, paid from this player's purse)
      if (!o.bunking) { res(false); return; }
      const wait = () => { if (!o.bunking) res(true); else setTimeout(wait, 100); };
      wait();
    });
  }

  // --- every frame in a room --------------------------------------------------------------------------------------------
  frame(now) {
    if (this.host) {
      const s = JSON.stringify(this.tripState());
      if (s !== this.tripSig) { this.tripSig = s; if (this.coop.remotes.size) this.sendTrip(); }
      if (this.tasksDirty && now - this.tasksT > TASKS_EVERY) { this.tasksDirty = false; this.tasksT = now; this.sendTasks(); }
    }
    // a guest still waiting for the host's word on the way in: ask again
    if (this.guest && this.arrive && this.arrive.pending && now - this.arrive.t > 3000) { this.arrive.t = now; this.toHost({ t: 'tripq' }); }
    if (this.mirroring && !this.mirrored && now - (this.tasksAskT || 0) > 3000) { this.tasksAskT = now; this.toHost({ t: 'tasksq' }); }
    // a proposal: untick yourself when you leave the store
    const P = this.prop;
    if (P && P.ticks[this.coop.id] && !this.here(P.from) && !this.jumping) this.tick(false);
    // a jump's own berth is kept until this player is tied up at the far end
    const J = this.jumping;
    if (J && (J.done && (now - J.done > 30000 || (this.g.outfitter.visit && this.g.outfitter.visit.ep === J.to && !this.g.outfitter.arrival)))) this.jumping = null;
    if (P && (!this.renderT || now - this.renderT > 500)) this.render();
  }

  // --- the card: who is here, who is ready --------------------------------------------------------------------------
  render() {
    this.renderT = performance.now();
    const P = this.prop;
    if (!P) { if (this.card) this.card.hidden = true; return; }
    if (!this.card) {
      injectCss();
      const el = this.card = document.createElement('div');
      el.id = 'coop-jump'; el.className = 'coop-jump';
      el.addEventListener('click', (e) => { const b = e.target.closest('button[data-j]'); if (!b) return; if (b.dataset.j === 'ready') this.tick(!(this.prop && this.prop.ticks[this.coop.id])); else this.cancel(); });
      document.body.appendChild(el);
    }
    const o = this.g.outfitter, from = o.landing(P.from), to = o.landing(P.to), f = this.fare(P);
    const what = P.kind === 'ride' ? `A ride to ${esc(to.name)} · entry point ${to.ep}` : `A night in the bunkhouse at ${esc(from.name)}`;
    const ids = [this.hostPeer() ? this.hostPeer().id : this.coop.id, ...this.everyone().map((x) => x.id)].filter((v, i, a) => a.indexOf(v) === i);
    const rows = ids.map((id) => {
      const me = id === this.coop.id, ready = !!P.ticks[id], name = this.nameOf(id);
      const at = me ? this.here(P.from) : (() => { const r = this.coop.remotes.get(id), a = r && r.drawnAt; return !!(a && from && o.distTo(from, a.x, a.z) < AT_STORE); })();
      return `<li class="${ready ? 'on' : ''}"><b>${esc(name)}${me ? ' (you)' : ''}</b><span>${ready ? '✓ ready' : at ? 'at the store' : 'not here'}</span></li>`;
    }).join('');
    const mine = !!P.ticks[this.coop.id], why = mine ? null : this.whyNot();
    this.card.hidden = false;
    this.card.innerHTML = `<div class="kick">${esc(P.byName || 'A friend')} asks · everyone at the store, ready</div>
      <div class="what">${what}${f ? ` · $${f} each` : ''}</div><ul>${rows}</ul>
      ${why ? `<p class="why">${esc(why)}</p>` : ''}
      <div class="row"><button type="button" data-j="ready" class="${mine ? 'on' : ''}">${mine ? 'Ready ✓' : 'Ready'}</button><button type="button" data-j="no">Not this time</button></div>`;
  }

  stats() {
    const g = this.g, core = g.trip, o = g.outfitter;
    return { grouped: this.grouped, role: this.coop.role, mode: core && core.mode, active: !!(core && core.active), tripId: core && core.state.id, otrip: o && { ...o.trip }, prop: this.prop, jumping: this.jumping, mirrored: this.mirrored, log: this.log.slice(-8) };
  }
}

const CSS = `
.coop-jump { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 60; min-width: 300px; max-width: min(460px, 92vw);
  background: #efe6cf; color: #2a2016; border: 1px solid #b9a77f; border-radius: 3px; box-shadow: 0 6px 22px rgba(0,0,0,.28); padding: 10px 14px 12px;
  font: 15px/1.35 Georgia, 'Times New Roman', serif; }
.coop-jump[hidden] { display: none; }
.coop-jump .kick { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #6b5a3e; }
.coop-jump .what { font-weight: 600; margin: 2px 0 6px; }
.coop-jump ul { list-style: none; margin: 0 0 6px; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.coop-jump li { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid #d8cbab; padding-top: 2px; }
.coop-jump li span { font-style: italic; color: #6b5a3e; }
.coop-jump li.on span { color: #2f6b34; font-style: normal; }
.coop-jump .why { margin: 0 0 6px; font-style: italic; color: #8a3020; font-size: 13.5px; }
.coop-jump .row { display: flex; gap: 8px; }
.coop-jump button { font: 600 12px/1 Georgia, serif; letter-spacing: .06em; text-transform: uppercase; padding: 6px 12px; border: 1px solid #2a2016; background: transparent; color: #2a2016; cursor: pointer; border-radius: 2px; }
.coop-jump button.on { background: #2f6b34; color: #efe6cf; border-color: #2f6b34; }
`;
let cssIn = false;
function injectCss() {
  if (cssIn || typeof document === 'undefined') return;
  cssIn = true;
  const s = document.createElement('style'); s.id = 'coop-jump-css'; s.textContent = CSS;
  document.head.appendChild(s);
}
