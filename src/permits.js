// Permits (the game-loop round, stream A; docs/build/game-loop-brief.md, docs/plans/campaigns.md "Permits"). Trips are
// the unit and permits move time: every overnight trip needs a paid permit for one entry point and one entry day,
// bought at an outfitter's permit desk (permit-desk.js) from a calendar of what is left. Buying one for a later day
// skips to it (one bunkhouse card however many nights). Day use is free and automatic: a push-off with no permit for
// that landing and that day is a day trip, and still out after dark a ranger stops you: when the trip ends (the tally,
// a push-off taken back, an evacuation) a ticket is written, $20 (r2 tickets, the owner 2026-11-05: "when you come back,
// it gives you a ticket ... goes into your task list ... you can pay it if you have the money"). It sits on the journal's
// Tasks page as its own paper (a Forest Service violation notice, flyers.js ticketHtml) and is paid from there, anywhere,
// with the money in hand (payTicket); nothing pays it by itself. While one is open (or a fine is still to be written on
// the trip under way) the desk sells no overnight or PMA permit, money or not; day use stays free. A PMA permit allows camping off the designated sites in one primitive management area (pma.js).
// Every permit is one flat price, every day of the year (the owner's call 2026-11-05): the busy months are dear only in
// what is left, through the quotas and BOOK, never in dollars. The first permit is free (stream C's onboarding grants
// it). Quetico per-night permits: not yet.
//
// What is left of a day: QUOTA[ep] (parties.js, recreation.gov's real daily quotas) less the parties booked in less the
// permits you hold there that day. Booked: the share of the quota parties.js sends in that day before its render
// thinning (count / PARTIES.start / quota; count already folds in the season's fill, the weekday, the Traffic setting
// and a seeded jitter), through BOOK's curve so the busy days fill and the quiet ones stay open; never fewer than the
// parties actually drawn going in. A July Saturday at Moose Lake is gone; a Tuesday in September is wide open. Ice
// days are closed.
//
// A permit: { id, kind: 'overnight' | 'pma', ep, abs, pma, from (the selling outfitter's ep), price, bought, why }.
// Good for a push-off at `ep` on day `abs` only (the trip then lasts as long as you like: the real rule); unused, it
// lapses after that day with a line at the desk next time and no refund.
//
// Saved per season in `bwca-canoe:permits` { v: 1, season, pmaSet, held: [], used: [], fines: [], lapsed: [], nextId, told,
// redrawn? }; missing, or another season's, is a blank one. pmaSet: the primitive areas' table its ids are from (2: the
// real twelve; an older season's are carried over by migrate-pma.js, which leaves `redrawn`: the held permits it changed,
// a line each at the desk, takeRedrawn).
//
//   permits.available(ep, abs) → { quota, booked, held, left, closed, mine } (booked + held ≤ quota; mine: you hold one)
//   permits.calendar(ep, fromAbs, days = 28) → [{ abs, left, quota, price, closed, mine }]
//   permits.price(kind, abs) → dollars (PRICES: the same every day)
//   permits.buy({ ep, abs, kind = 'overnight', pma = null, at }) → { ok, permit, why, words, skip (a Promise when it skips) }
//   permits.grant({ ep, abs, kind = 'overnight', pma = null, from, why }) → permit (free)
//   permits.held() → [permit] · permits.forTrip(ep, abs) → permit | null · permits.use(permit)
//   permits.owed() → dollars (every unpaid fine, written up or not: the desk's gate) · permits.fines → [{ id, n, why, abs,
//     ep, place, issued, paid, paidOn }] · permits.tickets() → the open ones written up (the journal's) · permits.issue()
//     → n written (trip.js close / takeBack) · permits.payTicket(id) → { ok, why, words } · permits.payFines() → bool (all)
//   permits.skipTo(abs, { landing }) → Promise<bool>
//   permits.pmas() · permits.pmaAt(x, z) · permits.allowsOffsite(x, z)
//   permits.on('bought' | 'used' | 'lapsed' | 'fine' | 'ticket' | 'paid' | 'skip', fn) → off
//   permits.update(dt) each frame (main.js gl-a): the lapses and the day-use fine
//   permits.holdsQuetico() -> bool (a Quetico permit for the trip under way: none are sold yet, so false) ·
//     permits.queticoNight() -> bool (a tent pitched in Quetico without one: a ranger's ticket, once a trip; camp.js)
import { save } from './save.js';
import { QUOTA, PARTIES, FILL, WEEKDAY } from './parties.js';
import { seasonAt } from './season.js';
import { absDay, dateOfAbs } from './trip.js';
import { shortDate, weekdayOf, plural, word } from './hud.js';
import { PMAS, pmaAt as pmaAtXZ, pmaById } from './pma.js';
import { PMA_SET } from './migrate-pma.js'; // r2: the primitive areas' table a season's ids are from (the old saves)

const NS = 'permits';
const V = 1;
const QUOTA_ELSE = 3;              // parties.js's own for an entry point not in the table
const WAKE = 7;                    // the hour a skip wakes you at, in the bunkhouse
const DUSK = 0.5;                  // hours after sunset that are civil dusk: day use ends
const KEEP_USED = 60;              // used and lapsed permits kept for the record
const KEEP_FINES = 30;
const ICE_ELSE = { out: 120, in: 329 }; // a lake with no ice dates (season.js LOCAL_ICE's own defaults)

// Tuning, in one table: what a permit costs, and the ranger's fine. One flat price for either kind, any day of the year
// (the owner's call 2026-11-05: scarcity in the busy months is how many are left, not the price).
export const PRICES = {
  overnight: 6,
  pma: 6,
  fine: 20,                                  // still out after dark on a day-use trip
  quetico: 50,                               // the edge round: a night camped in Quetico without a Quetico permit (owner's call to tune)
};
// How full a day is booked, from the share of the quota the parties' schedule sends in that day (count / PARTIES.start
// / quota): [share, booked share] pieces between, flat past the ends. Under a quarter of the quota going in books no more
// than goes in; three quarters books it out. (Straight count / start left a mid-September Tuesday at Moose Lake 63–85 %
// open and a July Saturday 0–6 left; the brief asks ≥ 80 % and ≤ 3.)
export const BOOK = [[0, 0], [0.25, 0.04], [0.45, 0.3], [0.7, 0.92], [0.9, 1]];
// The late season (loop tasks, 2026-11-08; docs/build/campaign-design.md Part 3, owner call 3): from 1 October the desk
// sells no permits. An overnight permit (and a primitive area's) is free and self-issued, as in life: no quota, filled
// out at the landing's box as you push off (trip.js start, selfIssue) or picked up at a desk for a later day. Till the
// ice: an iced day is closed as before. The year's own permits run out with September, so the desk's "Look at next
// year's permits" (permit-desk.js, season-turn.js) comes forward from then.
export const SELF = { month: 10, day: 1, left: 99 };
export const selfFrom = (year) => Math.round(Date.UTC(year, SELF.month - 1, SELF.day) / 86400000);
export const selfIssued = (abs) => { const { year } = dateOfAbs(Math.round(abs)); return Math.round(abs) >= selfFrom(year); };
export const KINDS = { overnight: 'Overnight', pma: 'Primitive area' };

const blank = (season = null) => ({ v: V, season, pmaSet: PMA_SET, held: [], used: [], fines: [], lapsed: [], nextId: 1, told: {} });
const curve = (T, x) => {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const a = T[i - 1], b = T[i]; return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]); }
  return T[T.length - 1][1];
};
// parties.js fillOn, for the fallback with no schedule
const fillOn = (doy) => curve(FILL, doy);
export const dateWords = (abs, { weekday = true } = {}) => { const { year, doy } = dateOfAbs(abs); return weekday ? `${weekdayOf(year, doy)} ${shortDate(year, doy)}` : shortDate(year, doy); };

export class Permits {
  // t: { world, day, profile, trip, outfitter, energy, veil, hud, parties }; anything may come later through attach()
  constructor(t = {}) {
    this.t = { ...t };
    this.handlers = new Map();
    this.s = blank();
    this.fineT = 0; this.lastToday = null;
    this.loaded = false;
  }
  attach(o = {}) {
    Object.assign(this.t, o);
    const pr = this.t.profile;
    if (!this.loaded) this.load();
    if (pr && !this.watching) {
      this.watching = true;
      // a new season (profile.begin) starts the permits over
      pr.onChange((what) => { if (what === 'season') { this.s = blank(pr.seasonId); this.write(); } });
    }
    return this;
  }
  load() {
    this.loaded = true;
    const d = save.read(NS), sid = this.t.profile ? this.t.profile.seasonId : null;
    if (!d || typeof d !== 'object' || (d.season && sid && d.season !== sid)) { this.s = blank(sid); return; }
    const b = blank(d.season || sid), arr = (a) => (Array.isArray(a) ? a.filter((x) => x && typeof x === 'object') : []);
    this.s = { ...b, ...d, v: V, held: arr(d.held), used: arr(d.used), fines: arr(d.fines), lapsed: arr(d.lapsed), told: d.told && typeof d.told === 'object' ? d.told : {} };
    if (!Number.isFinite(this.s.nextId)) this.s.nextId = 1 + this.s.held.length + this.s.used.length;
    // r2 tickets: a save from before tickets kept a fine owed at a counter; an unpaid one is an open ticket now (it was
    // written when it was given), a paid one stays paid
    for (const f of this.s.fines) {
      if (typeof f.issued !== 'boolean') f.issued = true;
      if (!f.id) f.id = `F${this.s.nextId++}`;
      if (!Number.isFinite(f.n)) f.n = PRICES.fine;
    }
  }
  write() { save.write(NS, this.s); }
  serialize() { return this.s; }

  // --- events ------------------------------------------------------------------------------------------------------
  on(kind, fn) {
    if (!this.handlers.has(kind)) this.handlers.set(kind, new Set());
    this.handlers.get(kind).add(fn);
    return () => this.handlers.get(kind).delete(fn);
  }
  emit(kind, e) { for (const k of [kind, '*']) for (const fn of this.handlers.get(k) || []) { try { fn(e, kind); } catch (err) { console.warn('permits.on', kind, err); } } }

  // --- the world as it stands -------------------------------------------------------------------------------------
  get today() { const d = this.t.day; return d ? absDay(d.year, d.doy) : 0; }
  get sandbox() { const tr = this.t.trip; return !!(tr && tr.sandbox); }
  entry(ep) {
    const o = this.t.outfitter, n = Number(ep);
    const e = o && typeof o.entry === 'function' ? o.entry(n) : null; // stream B's entries (trailheads too)
    if (e) return e;
    const w = this.t.world;
    const r = w && Array.isArray(w.entryPoints) ? w.entryPoints.find((q) => q.ep === n) : null;
    if (!r) return null;
    const l = o && Array.isArray(o.landings) ? o.landings.find((q) => q.ep === n) : null;
    return { ep: r.ep, name: l ? l.name : r.name, place: r.name, x: r.x, z: r.z, lake: r.lake, outfitter: !!l };
  }
  // the landing's lake, frozen on that day (its own ice-out and ice-in, lake-facts.js; else the season's)
  iced(ep, abs) {
    const e = this.entry(ep), w = this.t.world, { doy } = dateOfAbs(abs);
    let ice = null;
    try { ice = e && w && w.facts && typeof w.facts.iceOf === 'function' ? w.facts.iceOf(e.lake) : null; } catch { ice = null; }
    return seasonAt(doy, ice && Number.isFinite(ice.out) ? ice : ICE_ELSE).ice >= 0.5;
  }
  // the parties that go in at ep on abs, as parties.js schedules them (its render thinning undone)
  booked(ep, abs) {
    const P = this.t.parties, q = QUOTA[ep] ?? QUOTA_ELSE;
    let n;
    if (P && typeof P.count === 'function') n = P.count(ep, abs);
    else { const { doy } = dateOfAbs(abs); n = Math.round(q * fillOn(doy) * WEEKDAY[(((abs + 4) % 7) + 7) % 7] * PARTIES.start); } // (no schedule: the mean)
    // (the floor is the parties actually drawn: each of them holds a permit, wherever the curve puts the rest)
    const going = n / (PARTIES.start || 1), share = q > 0 ? going / q : 0;
    return Math.min(q, Math.max(n, Math.round(q * curve(BOOK, share))));
  }
  available(ep, abs) {
    ep = Number(ep); abs = Math.round(abs);
    const quota = QUOTA[ep] ?? QUOTA_ELSE, closed = this.iced(ep, abs) || abs < this.today;
    const held = this.s.held.filter((p) => p.ep === ep && p.abs === abs).length;
    // a permit you hold is one of the day's quota, the first trip's free one too (the outfitter held it back on a
    // sold-out day): the parties have the rest, so booked and held never add up past the quota (glf-3)
    if (selfIssued(abs)) return { quota, booked: closed ? quota : 0, held, left: closed ? 0 : SELF.left, closed, mine: held > 0, self: true }; // (the late season: no quota)
    const booked = closed ? quota : Math.min(this.booked(ep, abs), Math.max(0, quota - held));
    return { quota, booked, held, left: closed ? 0 : Math.max(0, quota - booked - held), closed, mine: held > 0 };
  }
  calendar(ep, fromAbs = this.today, days = 28) {
    const out = [];
    for (let i = 0; i < days; i++) {
      const abs = fromAbs + i, a = this.available(ep, abs);
      out.push({ abs, left: a.left, quota: a.quota, price: this.price('overnight', abs), closed: a.closed, mine: a.mine, self: !!a.self });
    }
    return out;
  }
  price(kind = 'overnight', abs = this.today) {
    if (selfIssued(abs)) return 0;
    return kind === 'pma' ? PRICES.pma : PRICES.overnight;
  }
  selfIssued(abs = this.today) { return selfIssued(abs); }
  // the box at the landing: a push-off with no permit on a self-issued day fills one out (trip.js start) → permit
  selfIssue(ep, abs = this.today, { kind = 'overnight', pma = null } = {}) {
    if (!selfIssued(abs)) return null;
    const permit = this.make({ ep, abs, kind, pma, from: ep, price: 0, why: 'self' });
    if (this.t.trip && typeof this.t.trip.log === 'function') this.t.trip.log('permit', { id: permit.id, kind: permit.kind, ep: permit.ep, abs: permit.abs, price: 0, self: true });
    this.emit('bought', { ...permit, free: true, self: true });
    return permit;
  }
  // the open-water season's last sold day and the year's ice at a landing: { year, lastSold (abs), iceIn (abs), iceOut
  // (next year's, abs) } (the desk's "Look at next year's permits", season-turn.js)
  yearOf(ep, abs = this.today) {
    const { year } = dateOfAbs(abs), e = this.entry(ep), w = this.t.world;
    let ice = null; try { ice = e && w && w.facts && typeof w.facts.iceOf === 'function' ? w.facts.iceOf(e.lake) : null; } catch { ice = null; }
    const out = ice && Number.isFinite(ice.out) ? ice.out : ICE_ELSE.out, inn = ice && Number.isFinite(ice.in) ? ice.in : ICE_ELSE.in;
    return { year, lastSold: selfFrom(year) - 1, iceIn: absDay(year, 0) + Math.round(inn), iceOut: absDay(year + 1, 0) + Math.round(out), outDoy: out, inDoy: inn };
  }

  // --- what you hold ------------------------------------------------------------------------------------------------
  held() { return this.s.held.slice(); }
  get fines() { return this.s.fines; }
  forTrip(ep, abs = this.today) {
    ep = Number(ep);
    const ok = this.s.held.filter((p) => p.ep === ep && p.abs === abs);
    return ok.find((p) => p.kind === 'pma') || ok[0] || null;
  }
  // a push-off took it (trip.js start)
  use(permit) {
    const i = this.s.held.findIndex((p) => p.id === (permit && permit.id));
    if (i < 0) return false;
    const [p] = this.s.held.splice(i, 1);
    p.usedOn = this.today;
    this.s.used.push(p); if (this.s.used.length > KEEP_USED) this.s.used.splice(0, this.s.used.length - KEEP_USED);
    this.write();
    this.emit('used', p);
    return true;
  }
  // a push-off taken back (trip.js takeBack): the permit is yours again, while its day lasts
  unuse(id) {
    const i = this.s.used.findIndex((p) => p.id === id && !p.lapsed);
    if (i < 0) return false;
    const [p] = this.s.used.splice(i, 1);
    delete p.usedOn;
    if (p.abs >= this.today) this.s.held.push(p); else { p.lapsed = true; this.s.used.push(p); }
    this.write();
    return true;
  }
  owed() { return this.visiting ? 0 : this.s.fines.filter((f) => !f.paid).reduce((s, f) => s + (f.n || 0), 0); }
  // --- tickets (r2) ----------------------------------------------------------------------------------------------------
  // a co-op guest on a visit: their own season's tickets are theirs, kept at home (every save of theirs is frozen while
  // they visit, coop.js), so none is shown, paid or gated on the host's trip
  get visiting() { const g = typeof window !== 'undefined' ? window.__game : null, c = g && g.coop; return !!(c && c.role === 'guest'); }
  // the open tickets: written up when the trip ended, not paid
  tickets() { return this.visiting ? [] : this.s.fines.filter((f) => f.issued && !f.paid); }
  ticket(id) { return this.s.fines.find((f) => f.id === id) || null; }
  // the trip is over (trip.js close, takeBack): every fine given on it is written up as a ticket
  issue() {
    const fresh = this.s.fines.filter((f) => !f.paid && !f.issued);
    if (!fresh.length) return 0;
    for (const f of fresh) { f.issued = true; f.issuedOn = this.today; }
    this.write();
    for (const f of fresh) this.emit('ticket', f);
    return fresh.length;
  }
  get money() { const pr = this.t.profile; return pr && typeof pr.money === 'number' ? pr.money : 0; }
  // paid from the book (or the desk), anywhere, with the money in hand: → { ok, why, words }
  payTicket(id) {
    const f = this.ticket(id);
    if (!f || f.paid) return { ok: false, why: 'none', words: 'Already paid.' };
    if (this.visiting) return { ok: false, why: 'away', words: 'Not on a friend’s trip.' };
    const pr = this.t.profile, n = f.n || 0;
    if (!this.sandbox && n > 0 && (!pr || this.money < n || !pr.spend(n, "a ranger's ticket"))) return { ok: false, why: 'money', words: `$${n}. You have $${Math.max(0, Math.floor(this.money))}.` };
    f.paid = true; f.issued = true; f.paidOn = this.today;
    this.write();
    if (this.t.outfitter && typeof this.t.outfitter.save === 'function') this.t.outfitter.save();
    this.emit('paid', { n, id: f.id, ticket: f });
    return { ok: true, words: `Paid: $${n}.` };
  }
  // every one at once (the desk's button; the tests): → bool
  payFines() {
    const n = this.owed(); if (!n) return true;
    const pr = this.t.profile;
    if (!this.sandbox && (!pr || this.money < n || !pr.spend(n, `a ranger's ticket${n > PRICES.fine ? 's' : ''}`))) return false;
    const was = this.s.fines.filter((f) => !f.paid);
    for (const f of was) { f.paid = true; f.issued = true; f.paidOn = this.today; }
    this.write();
    if (this.t.outfitter && typeof this.t.outfitter.save === 'function') this.t.outfitter.save();
    this.emit('paid', { n, ids: was.map((f) => f.id) });
    return true;
  }
  pmas() { return PMAS.slice(); }
  pmaAt(x, z) { return pmaAtXZ(x, z); }
  // camping off the designated sites here is allowed: inside the PMA of the trip under way's PMA permit
  allowsOffsite(x, z) {
    const tr = this.t.trip, s = tr && tr.state, p = s && s.permit;
    if (!tr || !tr.active || !p || p.kind !== 'pma' || !p.pma) return false;
    const a = pmaAtXZ(x, z);
    return !!(a && a.id === p.pma);
  }
  // the PMAs a desk at ep offers, nearest first
  pmasNear(ep, n = 3) {
    const e = this.entry(ep); if (!e) return PMAS.slice(0, n);
    return PMAS.slice().sort((a, b) => (a.near === ep ? -1e9 : 0) + Math.hypot(a.centre[0] - e.x, a.centre[1] - e.z) - ((b.near === ep ? -1e9 : 0) + Math.hypot(b.centre[0] - e.x, b.centre[1] - e.z))).slice(0, n);
  }

  // --- buying -----------------------------------------------------------------------------------------------------
  make({ ep, abs, kind = 'overnight', pma = null, from = null, price = 0, why = null }) {
    const p = { id: `P${this.s.nextId++}`, kind: kind === 'pma' ? 'pma' : 'overnight', ep: Number(ep), abs: Math.round(abs), pma: kind === 'pma' ? pma : null, from: from == null ? null : Number(from), price, bought: this.today, ...(why ? { why } : {}) };
    this.s.held.push(p);
    this.write();
    return p;
  }
  // why a permit can't be sold, in a word (null: it can)
  refusal({ ep, abs, kind = 'overnight', pma = null }) {
    const tr = this.t.trip;
    if (this.owed() > 0 && !selfIssued(abs)) return 'ticket'; // (day use needs no permit, so it stays open: the way to earn the money; a self-issued one asks nobody)
    if (dateOfAbs(abs).year > dateOfAbs(this.today).year && this.visiting) return 'company'; // (next year's: not on a friend's trip)
    if (abs < this.today) return 'past';
    if (abs > this.today && tr && tr.active) return 'trip'; // a later day skips to it: only between trips
    if (abs > this.today && this.grouped) return 'group';
    if (!this.entry(ep)) return 'ep';
    if (kind === 'pma' && !pmaById(pma)) return 'pma';
    if (this.s.held.some((p) => p.abs === abs)) return 'have';
    const a = this.available(ep, abs);
    if (a.closed) return 'closed';
    if (a.left <= 0) return 'full';
    return null;
  }
  words(why, { price = 0 } = {}) {
    return {
      ticket: 'An unpaid ticket. Pay it first.',
      past: 'That day is gone.',
      trip: 'Not while a trip is under way: come in first.',
      group: 'The group goes together: ask them first.',
      ep: 'No such entry point.',
      pma: 'Which primitive area?',
      have: 'You have a permit for that day already.',
      closed: 'The lake is still iced in then.',
      full: 'Sold out that day.',
      money: `Not enough in hand: it's $${price}.`,
      ice: 'The lakes are freezing up by then.',
      company: 'Not on a friend’s trip.',
    }[why] || 'Not today.';
  }
  get grouped() { const c = typeof window !== 'undefined' && window.__game ? window.__game.coopTrip : null; return !!(c && c.grouped); }
  buy({ ep, abs = this.today, kind = 'overnight', pma = null, at = null } = {}) {
    ep = Number(ep); abs = Math.round(abs);
    if (kind === 'pma' && !pma) { const n = this.pmasNear(at ?? ep, 1)[0]; pma = n ? n.id : null; }
    const why = this.refusal({ ep, abs, kind, pma });
    const price = this.sandbox ? 0 : this.price(kind, abs);
    if (why) return { ok: false, why, words: this.words(why, { price }) };
    const pr = this.t.profile, e = this.entry(ep);
    if (price && (!pr || !pr.spend(price, `a ${kind === 'pma' ? 'primitive area' : 'overnight'} permit, entry point ${ep}`))) return { ok: false, why: 'money', words: this.words('money', { price }) };
    const permit = this.make({ ep, abs, kind, pma, from: at ?? ep, price, why: selfIssued(abs) ? 'self' : null });
    if (this.t.trip && typeof this.t.trip.log === 'function') this.t.trip.log('permit', { id: permit.id, kind: permit.kind, ep, abs, price, bought: true });
    this.emit('bought', permit);
    const later = abs > this.today, turn = dateOfAbs(abs).year > dateOfAbs(this.today).year;
    const at0 = at != null ? this.entry(at) : null, L = (this.t.outfitter && this.t.outfitter.at) || at0 || e;
    // next year's permit ends this open-water season: the winter, then that day (season-turn.js); else the bunkhouse
    const skip = turn && this.turn ? this.turn.turnTo(abs, { landing: L, permit }) : later ? this.skipTo(abs, { landing: L }) : null;
    return { ok: true, permit, skip, turn, words: `${KINDS[permit.kind]} permit${permit.why === 'self' ? ' (self-issued)' : ''}, entry point ${ep} (${e ? e.place || e.name : ''}), ${dateWords(abs)}${turn ? `, ${dateOfAbs(abs).year}` : ''}.` };
  }
  grant({ ep, abs = this.today, kind = 'overnight', pma = null, from = null, why = null } = {}) {
    // r2 tickets: a keeper's gift is not a sale, so it is not gated; the free first permit is, should a ticket somehow be
    // open before it (it can't be: there is no trip before the first one)
    if ((why || 'gift') === 'first' && this.owed() > 0) return null;
    if (kind === 'pma' && !pma) { const n = this.pmasNear(from ?? ep, 1)[0]; pma = n ? n.id : null; }
    const permit = this.make({ ep, abs, kind, pma, from: from ?? ep, price: 0, why: why || 'gift' });
    if (this.t.trip && typeof this.t.trip.log === 'function') this.t.trip.log('permit', { id: permit.id, kind: permit.kind, ep: permit.ep, abs: permit.abs, price: 0, granted: why || true });
    this.emit('bought', { ...permit, free: true });
    return permit;
  }

  // --- moving time: the bunkhouse until the permit's day --------------------------------------------------------------
  // One card however many nights: the clock to 07:00 on abs, rested and fed as a bunk night (outfitter.js night), the
  // gear dry. Only between trips, at a counter, never past freeze-up at the landing's lake, never a co-op guest alone.
  skipTo(abs, { landing = null } = {}) {
    const d = this.t.day, tr = this.t.trip, o = this.t.outfitter, veil = this.t.veil, en = this.t.energy;
    abs = Math.round(abs);
    const today = this.today, nights = abs - today;
    if (!d || nights <= 0) return Promise.resolve(nights === 0);
    if ((tr && tr.active) || this.grouped || this.skipping) return Promise.resolve(false);
    const L = landing || (o && (o.at || o.port)) || null;
    if (L && this.iced(L.ep, abs)) return Promise.resolve(false);
    this.skipping = true;
    if (o) { if (o.open && typeof o.hide === 'function') o.hide(); o.bunking = true; }
    const run = () => {
      const hours = (abs - this.today) * 24 + WAKE - d.hours;
      d.advance(hours);
      if (en) {
        if (typeof en.sleep === 'function') en.sleep(1, Math.max(7, Math.min(hours, 10)), { bag: true });
        en.value = 1;
        if ('lastHours' in en) en.lastHours = d.hours;
        if ('lastMealAbs' in en) { en.lastMealAbs = en.now; en.lastMealKind = 'hot'; }
        try { if (en.needs && typeof en.needs === 'object') { en.needs.food = 1; en.needs.water = 1; en.needs.warmth = 1; } } catch { /* energy.js's own */ }
        if (typeof en.fill === 'function') en.fill(2, 0);
      }
      if (tr && tr.state) tr.state.wet = false;
      this.lapse();
      if (tr && typeof tr.log === 'function') tr.log('skip', { nights, to: abs, ep: L ? L.ep : null });
      if (o && typeof o.save === 'function') o.save();
    };
    const keeper = o && L && typeof o.say === 'function' ? (() => { try { return o.say(L.ep, 'bunk'); } catch { return ''; } })() : '';
    const card = {
      kicker: `${L ? `${L.name} · ` : ''}the bunkhouse`,
      text: keeper ? `“${keeper}”` : nights === 1 ? 'A night in the bunkhouse.' : `${word(nights)[0].toUpperCase()}${word(nights).slice(1)} nights in the bunkhouse.`,
      sub: `${nights === 1 ? 'One night' : `${word(nights)[0].toUpperCase()}${word(nights).slice(1)} ${plural(nights, 'night')}`} till your permit's day. Up at seven on ${dateWords(abs)}, rested and fed.`,
      fadeIn: 1.4, hold: 3.5, fadeOut: 2.2, onDark: run,
    };
    const done = () => {
      this.skipping = false;
      if (o) { o.bunking = false; o.lineKind = 'morning'; if (o.visit || o.at) o.pendingShow = true; }
      this.emit('skip', { nights, abs });
      return true;
    };
    if (veil && typeof veil.card === 'function') return veil.card(card).then(done);
    run();
    return Promise.resolve(done());
  }

  // --- each frame -------------------------------------------------------------------------------------------------------
  // a day turned: permits for days gone lapse; on a day-use trip, civil dusk is a ranger's fine (once a trip)
  update(dt = 0) {
    const today = this.today;
    if (today !== this.lastToday) { this.lastToday = today; this.lapse(); }
    if ((this.fineT -= dt) > 0) return;
    this.fineT = 1;
    this.checkDusk();
  }
  lapse() {
    const today = this.today, gone = this.s.held.filter((p) => p.abs < today);
    if (!gone.length) return 0;
    this.s.held = this.s.held.filter((p) => p.abs >= today);
    for (const p of gone) { p.lapsed = true; this.s.used.push(p); this.s.lapsed.push(p.id); this.emit('lapsed', p); }
    if (this.s.used.length > KEEP_USED) this.s.used.splice(0, this.s.used.length - KEEP_USED);
    this.write();
    return gone.length;
  }
  // the lapsed permits the desk has yet to mention (and forgets them once said)
  // r2: the held permits the redrawn primitive areas changed (migrate-pma.js), each once: [{ ep, abs, to (a name | null) }]
  takeRedrawn() {
    const r = Array.isArray(this.s.redrawn) ? this.s.redrawn : []; if (!r.length) return [];
    delete this.s.redrawn; this.write();
    return r;
  }
  takeLapsed() {
    const ids = this.s.lapsed; if (!ids.length) return [];
    const out = this.s.used.filter((p) => ids.includes(p.id));
    this.s.lapsed = []; this.write();
    return out;
  }
  // the hour day use ends on the trip's day: sunset + DUSK
  duskOf() { const d = this.t.day, ss = d ? d.sunriseSunset : null; return (ss && Number.isFinite(ss.set) ? ss.set : 20.5) + DUSK; }
  // a day-use trip still out after dark: one fine a trip, logged, and one line; the ticket is written when it ends (issue)
  checkDusk() {
    const tr = this.t.trip, d = this.t.day, s = tr && tr.state, p = this.t.player || (tr && tr.player);
    if (!tr || !tr.active || !tr.adventure || !s || !s.dayUse || s.grandfathered || s.fined || !d) return false;
    if (tr.evacuating || (p && p.teleporting)) return false;
    // a co-op guest's trip is the host's (coop-trip.js mirrors it): the ranger stops the host's canoe (the join's group permit)
    const coop = typeof window !== 'undefined' && window.__game ? window.__game.coop : null;
    if (coop && coop.role === 'guest' && this.grouped) return false;
    const since = s.since ? absDay(s.since.year, s.since.doy) : this.today;
    if (!(this.today > since || d.hours >= this.duskOf())) return false;
    return this.fine('dayuse');
  }
  fine(why = 'dayuse', n = PRICES.fine) {
    const tr = this.t.trip, s = tr && tr.state;
    // where it was: the lake you were on, else the landing you left
    const p = this.t.player || (tr && tr.player), w = this.t.world;
    let place = '';
    try { const id = p && w && typeof w.lakeIdAt === 'function' ? w.lakeIdAt(p.x, p.z) : 0; place = (id > 0 && typeof w.lakeName === 'function' && w.lakeName(id)) || ''; } catch { place = ''; }
    if (!place && s && s.from != null) { const e = this.entry(s.from); place = e ? e.place || e.name || '' : ''; }
    const f = { id: `F${this.s.nextId++}`, n, why, abs: this.today, ep: s && s.from != null ? s.from : null, place, issued: false, paid: false, trip: s ? s.id : null };
    if (why === 'quetico') { f.qplace = place; f.place = place; } // (the edge round: the lake in Quetico it was on)
    this.s.fines.push(f); if (this.s.fines.length > KEEP_FINES) this.s.fines.splice(0, this.s.fines.length - KEEP_FINES);
    if (s) { if (why === 'quetico') s.finedQuetico = true; else s.fined = true; } // (each rule once a trip)
    this.write();
    if (tr && typeof tr.log === 'function') tr.log('fine', { n, why, id: f.id });
    const hud = this.t.hud;
    const said = why === 'quetico' ? `An Ontario Parks ranger paddles over: no Quetico permit for a night here. A $${n} ticket, written when you come in.` : `A ranger's canoe pulls alongside: day use ends at dark. A $${n} ticket, written when you come in.`;
    if (hud && typeof hud.note === 'function') hud.note(said, 8);
    this.emit('fine', f);
    if (this.t.outfitter && typeof this.t.outfitter.save === 'function') this.t.outfitter.save();
    return true;
  }

  // --- Quetico (the edge round, the owner 2026-11-08: "Quetico open ... camping there without one is a ticket") ---------
  // Quetico is open to paddle and to walk; it has no designated sites (you camp where you like, as its own rules say),
  // and a night in it wants a Quetico permit. The desk sells none yet (campaigns.md: paid per night, the story's
  // "The other side"); a held one (kind 'quetico', for the trip under way) is read here once it exists.
  holdsQuetico() {
    const tr = this.t.trip, s = tr && tr.state, p = s && s.permit;
    return !!(tr && tr.active && p && p.kind === 'quetico');
  }
  queticoNight() {
    const tr = this.t.trip, s = tr && tr.state;
    if (!tr || !tr.active || !tr.adventure || !s || s.finedQuetico || this.visiting || this.holdsQuetico()) return false;
    return this.fine('quetico', PRICES.quetico);
  }
  // for the console and the tests
  stats() { return { held: this.s.held.length, used: this.s.used.length, owed: this.owed(), fines: this.s.fines.length, tickets: this.tickets().length, season: this.s.season }; }
}
