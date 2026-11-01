// Co-op phase 3, stream A: the night together (docs/plans/coop.md, "Rest and sleep: everyone, and one wake time").
// The owner, 2026-11-01: "sleep only happens when everyone is sleeping then u can do it. and they all choose a wake up
// time together." Nothing here runs unless coop.live: single player is untouched.
//
// - The rest dial (camp.js restDial, E on your tent: Rest until…) in a room is the group's: the host keeps one proposal
//   { wakeAt, by, ticks }. The first player in sets the time; everyone else's dial opens on it. Turning the dial moves it
//   for everyone and clears every tick but the turner's; E ticks (again: unticks). A row a player: name, in the tent /
//   still up / no tent pitched / gone, and the tick. Esc, Q or a step away is leaving the tent: the tick comes off.
// - The night begins when every player is in their own tent (the dial open at it) and has ticked the same wake time. A
//   player gone from the room counts as asleep after GONE_MS; a player with no tent pitched is still up.
// - Those still up see one chip (chip.js): "Ada wants to turn in · up at first light". Nothing is forced.
// - The night: the host reckons it once (camp.wakeTime on its clock: the hours, nap or night), sends `night`, and runs
//   camp.sleep with the jump (camp.jump: one jump in the room); each guest runs camp.sleep with the host's hours and,
//   at dark, sets its clock to the host's wake time (camp.wake's clockTo: no jump of its own). Each browser sleeps from
//   its own tent (energy.sleep(q, hours), its own pad, bag, fly, rain and bear). The host's clock messages are held on
//   a guest from the `night` until its own card is dark, so the sky never turns over under a fading card.
// - The fetch (packs.js, Q at a portage: a jump) is not offered in a room (packs.inRoom).
//
// The wire (any lowercase type through the relay; coop.js):
//   nite   any player → all (the host acts on it): { op: 'st', in, tent, want } (in the tent or not, a tent pitched,
//          the hour their dial opened on), { op: 'set', at } (the dial turned), { op: 'tick', at, on }
//   nites  host → all, on a change and every RESEND_MS while a proposal stands: { p: { wakeAt, by, byName, moved } | null,
//          rows: [{ id, name, in, tent, tick, gone }], seq }
//   night  host → all: { seq, at (the hour), hours, nap, day, clk: { year, doy, hours } } (the wake clock; `to` is the relay's)
//
//   const night = new CoopNight(coop)   (main.js, once coop.g has the camp modules); night.stats() for the tests
import { chip } from './chip.js';
import { clock12 } from './hud.js';

const GONE_MS = 60 * 1000;    // a player dropped from the room this long counts as asleep in their tent
const RESEND_MS = 3000;       // the host's proposal again, a guest's own state again (a reload, a late joiner)
const HOLD_MS = 20000;        // a guest holds the host's clock at most this long for the night card
const SAME = 0.01;            // h: two wake times this close are the same
const CHIP = 'coop-night';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const ROWS_CSS = `
#rest-dial .who { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--edge); padding-top: 8px; }
#rest-dial .who .r { display: flex; gap: 10px; align-items: baseline; font: 15px/1.3 var(--serif); color: var(--ink-soft); }
#rest-dial .who .r b { font-weight: 600; color: var(--ink); min-width: 92px; }
#rest-dial .who .r .tk { margin-left: auto; font: 700 11px/1.3 var(--sc); letter-spacing: .1em; }
#rest-dial .who .r.ok .tk { color: var(--ink); }
`;

export class CoopNight {
  constructor(coop) {
    this.coop = coop; this.g = coop.g;
    this.prop = null;          // the proposal as last heard (the host's own on the host)
    this.rows = [];            // the rows as last heard
    this.inTent = false;       // our dial is open, shared
    this.hold = null;          // a guest's night: { to, t0, woke } (the host's clock messages held until our card is dark)
    this.st = new Map();       // host: id → { in, tent, want, name }
    this.ticks = new Map();    // host: id → the wake time ticked
    this.gone = new Map();     // host: id → { at, name } dropped from the room
    this.seq = 0; this.lastSeq = -1; this.sentAt = 0; this.stAt = 0; this.dial = null; this.rowsEl = null;
    this.n = { nights: 0, jumps: 0, clockSets: 0, held: 0, nitesIn: 0, nightIn: 0 };
    const g = this.g, camp = g.camp;
    if (camp) {
      camp.shared = this;
      const jump = camp.jump.bind(camp);
      camp.jump = (h) => { if (this.live) this.n.jumps++; return jump(h); };
      const woke = camp.onWoke;
      camp.onWoke = (n) => { if (woke) woke(n); this.woke(n); };
    }
    if (g.packs) g.packs.inRoom = () => this.live;
    coop.holdClock = (m) => this.holding(m);
    coop.on('nite', (m) => { if (this.host) this.apply(m.from, m); });
    coop.on('nites', (m) => { if (!this.host) this.heard(m); });
    coop.on('night', (m) => { if (!this.host) this.begin(m); });
    coop.onPeers((what, peer) => this.peers(what, peer));
    coop.tick((now) => this.tick(now));
  }
  get live() { return !!this.coop.live; }
  get host() { return this.coop.role === 'host'; }
  get me() { return this.coop.id; }
  get myName() { return (this.coop.visitor && this.coop.visitor.name) || 'You'; }
  get pitched() { const c = this.g.camp && this.g.camp.camp; return !!(c && c.stage >= 3); }

  // --- the dial (camp.restDial asks: in a room it is the group's) ----------------------------------------------------
  openDial({ dial, kicker, opts, start, words }) {
    if (!this.live || !this.me) return false;
    this.dial = dial; this.opts = opts;
    const at = this.prop ? this.prop.wakeAt : start;
    dial.show({ kicker, opts, at, words, keep: true, onSet: (a) => this.turn(a), onPick: (a) => this.tickOn(a), onClose: () => this.out() });
    this.mountRows(dial);
    this.inTent = true;
    this.say({ op: 'st', in: true, tent: this.pitched, want: at });
    this.drawRows();
    return true;
  }
  mountRows(dial) {
    if (!document.getElementById('coop-night-css')) { const s = document.createElement('style'); s.id = 'coop-night-css'; s.textContent = ROWS_CSS; document.head.appendChild(s); }
    if (!this.rowsEl || this.rowsEl.parentNode !== dial.el) {
      this.rowsEl = document.createElement('div'); this.rowsEl.className = 'who';
      dial.el.insertBefore(this.rowsEl, dial.el.querySelector('.keys'));
    }
    this.rowsEl.hidden = false;
    const k = dial.el.querySelector('.keys');
    if (k && !k.dataset.solo) { k.dataset.solo = k.innerHTML; }
    if (k) k.innerHTML = '<kbd>←</kbd><kbd>→</kbd> any hour, for everyone <kbd>E</kbd> agree <kbd>Esc</kbd> get up<button type="button" class="stamp small" data-go="1">Agree</button>';
  }
  unmountRows() {
    if (this.rowsEl) this.rowsEl.hidden = true;
    const k = this.dial && this.dial.el.querySelector('.keys');
    if (k && k.dataset.solo) { k.innerHTML = k.dataset.solo; delete k.dataset.solo; }
  }
  turn(at) { if (this.inTent) this.say({ op: 'set', at }); }
  tickOn(at) {
    if (!this.inTent) return;
    const mine = this.rows.find((r) => r.id === this.me), on = !(mine && mine.tick != null && Math.abs(mine.tick - at) < SAME);
    this.say({ op: 'tick', at, on });
  }
  out() {
    if (!this.inTent) return;
    this.inTent = false; this.unmountRows();
    this.say({ op: 'st', in: false, tent: this.pitched });
  }
  // to the host (the host's own: at once)
  say(m) {
    if (!this.live) return;
    if (m.op === 'st') this.stAt = performance.now();
    if (this.host) this.apply(this.me, m);
    else this.coop.send({ t: 'nite', ...m });
  }

  // --- the host: the proposal ----------------------------------------------------------------------------------------
  members() {
    const out = [{ id: this.me, name: this.myName }];
    for (const p of this.coop.peers()) out.push({ id: p.id, name: p.name });
    return out;
  }
  nameOf(id) { if (id === this.me) return this.myName; const p = this.coop.peers().find((q) => q.id === id); return p ? p.name : (this.gone.get(id) || {}).name || 'A friend'; }
  apply(id, m) {
    if (id == null) return;
    if (m.op === 'st') {
      const s = { in: !!m.in, tent: !!m.tent, want: Number.isFinite(m.want) ? m.want : null };
      this.st.set(id, s);
      if (s.in && !this.prop && s.want != null) this.prop = { wakeAt: s.want, by: id, byName: this.nameOf(id), moved: id };
      if (!s.in) this.ticks.delete(id);
      if (this.prop && ![...this.st.values()].some((q) => q.in)) { this.prop = null; this.ticks.clear(); }
    } else if (m.op === 'set' && Number.isFinite(m.at)) {
      const mine = this.ticks.has(id);
      if (!this.prop) this.prop = { wakeAt: m.at, by: id, byName: this.nameOf(id), moved: id };
      else { this.prop.wakeAt = m.at; this.prop.moved = id; }
      this.ticks.clear(); // a tick always means "I agree to this time": every tick but the turner's comes off
      if (mine) this.ticks.set(id, m.at);
    } else if (m.op === 'tick' && Number.isFinite(m.at)) {
      if (m.on && this.prop && Math.abs(m.at - this.prop.wakeAt) < SAME && (this.st.get(id) || {}).in) this.ticks.set(id, this.prop.wakeAt);
      else if (!m.on) this.ticks.delete(id);
    } else return;
    this.publish();
    this.check();
  }
  publish() {
    const rows = this.members().map(({ id, name }) => {
      const s = this.st.get(id) || {};
      return { id, name, in: !!s.in, tent: id === this.me ? this.pitched : !!s.tent, tick: this.ticks.has(id) ? this.ticks.get(id) : null };
    });
    for (const [id, g] of this.gone) rows.push({ id, name: g.name, in: true, tent: true, tick: null, gone: Math.max(0, Math.ceil((GONE_MS - (performance.now() - g.at)) / 1000)) });
    const m = { t: 'nites', p: this.prop ? { ...this.prop } : null, rows, seq: ++this.seq };
    this.sentAt = performance.now();
    this.coop.send(m);
    this.heard(m);
  }
  // everyone in, everyone ticked the one time, nobody gone under a minute: the night
  check() {
    const P = this.prop;
    if (!P || !this.host || this.g.camp.night) return false;
    if (this.gone.size) return false;
    for (const { id } of this.members()) {
      const s = this.st.get(id);
      if (!s || !s.in || !s.tent || this.ticks.get(id) == null || Math.abs(this.ticks.get(id) - P.wakeAt) > SAME) return false;
    }
    this.night(P.wakeAt);
    return true;
  }
  night(at) {
    const camp = this.g.camp, d = this.g.day, w = camp.wakeTime(at);
    const abs = d.hours + w.hours, days = Math.floor(abs / 24);
    const m = { t: 'night', seq: ++this.seq, at: w.at, hours: w.hours, nap: !!w.nap, day: !!w.day, clk: { year: d.year, doy: d.doy + days, hours: w.at } }; // (not `to`: coop.js routes by it)
    this.prop = null; this.ticks.clear();
    for (const s of this.st.values()) s.in = false;
    this.coop.send(m);
    this.publish();
    this.n.nights++;
    this.close();
    camp.sleep('tent', w.at, { hours: w.hours, nap: w.nap, day: w.day }); // (the host's own: the jump, camp.jump)
  }

  // --- everyone: what the host says ----------------------------------------------------------------------------------
  heard(m) {
    const had = this.prop;
    if (!this.host) { if (m.seq <= this.lastSeq) return; this.lastSeq = m.seq; this.n.nitesIn++; }
    this.prop = m.p || null;
    if (!this.host && this.prop && !had && !this.inTent) this.say({ op: 'st', in: false, tent: this.pitched }); // (so our row says whether our tent is up)
    this.rows = Array.isArray(m.rows) ? m.rows : [];
    if (this.inTent && this.dial && this.dial.open && this.prop && Math.abs(this.dial.at - this.prop.wakeAt) > SAME) this.dial.put(this.prop.wakeAt);
    this.drawRows();
  }
  begin(m) {
    if (m.seq <= this.lastSeq) return;
    this.lastSeq = m.seq; this.n.nightIn++;
    this.prop = null; this.rows = [];
    this.close();
    const camp = this.g.camp;
    if (!this.pitched || camp.night || !m.clk) return; // (no tent, the clock simply comes: the host's next message)
    this.hold = { to: m.clk, t0: performance.now(), woke: false };
    this.n.nights++;
    camp.sleep('tent', m.at, { hours: m.hours, nap: m.nap, day: m.day, to: m.clk });
  }
  close() {
    const wasIn = this.inTent;
    this.inTent = false; this.unmountRows();
    if (wasIn && this.dial && this.dial.open) this.dial.hide();
    chip.clear(CHIP);
  }
  // camp.wake ran: the host's new clock goes out now; a guest's clock is the host's again
  woke(n) {
    if (!this.live) return;
    if (this.host) { this.coop.lastClock = 0; return; }
    if (n && n.clockTo) this.n.clockSets++;
    if (this.hold) { this.hold.woke = true; this.hold = null; this.coop.clockTs = null; }
  }
  holding() {
    const h = this.hold;
    if (!h || h.woke) return false;
    if (performance.now() - h.t0 > HOLD_MS) { this.hold = null; return false; }
    this.n.held++;
    return true;
  }

  // --- the room changes ----------------------------------------------------------------------------------------------
  peers(what, peer) {
    if (what === 'gone') { this.reset(); return; }
    if (!this.host && (what === 'welcome' || (what === 'join' && peer && peer.host))) this.lastSeq = -1; // (a host back after a reload counts afresh)
    if (!this.host) { if (what === 'welcome' && this.inTent) this.say({ op: 'st', in: true, tent: this.pitched, want: this.dial ? this.dial.at : null }); return; }
    if (what === 'leave' && peer) { this.st.delete(peer.id); this.ticks.delete(peer.id); this.gone.set(peer.id, { at: performance.now(), name: peer.name }); this.publish(); }
    else if (what === 'join' && peer) { this.gone.delete(peer.id); this.publish(); }
  }
  reset() {
    this.close();
    this.prop = null; this.rows = []; this.st.clear(); this.ticks.clear(); this.gone.clear(); this.hold = null; this.lastSeq = -1;
  }

  // --- every frame in a room -----------------------------------------------------------------------------------------
  tick(now) {
    // the dial closed by a hand other than ours (the night, a card): out of the tent
    if (this.inTent && this.dial && !this.dial.open) this.out();
    if (!this.host && now - this.stAt > RESEND_MS && (this.inTent || this.prop)) this.say({ op: 'st', in: this.inTent, tent: this.pitched, want: this.dial ? this.dial.at : null });
    if (this.host) {
      let changed = false;
      for (const [id, g] of this.gone) if (now - g.at > GONE_MS) { this.gone.delete(id); changed = true; }
      const mine = this.st.get(this.me);
      if (mine && mine.tent !== this.pitched) { mine.tent = this.pitched; changed = true; }
      if (changed || (this.prop && now - this.sentAt > RESEND_MS)) { this.publish(); this.check(); }
    }
    this.drawChip();
  }
  label(at) {
    const o = (this.opts || []).find((q) => Math.abs(q.at - at) < SAME);
    return o && /first light|dusk|noon/i.test(o.label) ? o.label.toLowerCase() : clock12(at);
  }
  drawChip() {
    const P = this.prop, camp = this.g.camp;
    if (!P || this.inTent || (camp && camp.night)) { chip.clear(CHIP); return; }
    const others = this.rows.filter((r) => r.id !== this.me);
    const allIn = others.length && others.every((r) => r.in);
    const who = allIn ? (others.length > 1 ? 'The others are in their tents' : `${others[0].name} is in the tent`) : `${P.by === this.me ? 'You' : P.byName} ${P.by === this.me ? 'want' : 'wants'} to turn in`;
    chip.set(CHIP, `${who} · up at ${this.label(P.wakeAt)}${this.pitched ? '' : ' · no tent up'}`);
  }
  drawRows() {
    const el = this.rowsEl;
    if (!el || el.hidden) return;
    const P = this.prop;
    el.innerHTML = this.rows.map((r) => {
      const ok = P && r.tick != null && Math.abs(r.tick - P.wakeAt) < SAME;
      const where = r.gone != null ? `gone · counted asleep in ${r.gone} s` : !r.tent ? 'still up · no tent pitched' : r.in ? 'in the tent' : 'still up';
      return `<div class="r${ok ? ' ok' : ''}"><b>${esc(r.id === this.me ? 'You' : r.name)}</b><span>${where}</span><span class="tk">${ok ? '✓ agreed' : r.gone != null ? '' : '· not yet'}</span></div>`;
    }).join('');
  }
  stats() {
    return { role: this.coop.role, prop: this.prop, rows: this.rows, inTent: this.inTent, hold: !!this.hold, n: { ...this.n }, chip: chip.current, night: !!(this.g.camp && this.g.camp.night) };
  }
}
