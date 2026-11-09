// The late season and the winter turn (loop tasks, 2026-11-08; docs/build/campaign-design.md Part 3, owner call 3,
// which replaces §3.9's face). Three things:
//
// 1. Ice on a trip. Ice-in does not end a trip by force. When the lake you are on freezes (the day's season.ice, the
//    lake under you or nearest: main.js d1 lakes) with a trip under way, one line says so, and the journal's Tasks page
//    holds "Frozen in": carry and walk out to any landing (the walk over the ice is the player's, player.js), or send
//    for a rescue off the ice for a hefty fee (TURN.rescue, trip.evacuate('ice', { fee })). Short of the money, the
//    page says so and the walk is the way; the free evacuation when the energy bar is spent still stands under it all,
//    so nobody is stuck and there is no fail screen. Not offered on a co-op trip with company (the group walks out).
// 2. "Look at next year's permits" is the turn's face (permit-desk.js draws it): choosing one of next year's permits
//    ends this open-water season and skips to that permit's day next year (turnTo), the way buying a later date skips
//    to it, through one winter card instead of the bunkhouse. Same save, same story, rested.
// 3. The seam for the story's winter-turn hooks (its W stream, not built here): the events below.
//
//   seasonTurn.attach({ permits, trip, day, energy, outfitter, veil, hud, player, profile, guide, tasks })
//   seasonTurn.update(dt)                      main.js, each frame (after the trip)
//   seasonTurn.frozen() → bool                 the lake you are on is iced now
//   seasonTurn.rescue() → { ok, why, words }   the rescue off the ice (the journal's button)
//   seasonTurn.turnTo(abs, { landing, permit }) → Promise<bool>   permits.buy calls it for a permit in a later year
//   seasonTurn.canTurn() → null | why          ('trip', 'company', 'busy')
//   seasonTurn.on(evt, fn) → off               fn(e, evt); '*' hears all
//     'iced'          { abs, lake, trip }            a trip caught by the ice (once a trip)
//     'rescue'        { fee, abs, to }               the rescue sent for, paid
//     'season:close'  { year, abs, ep }              the open-water season ends (the winter card's dark, before the clock moves)
//     'year:open'     { year, abs, ep, permit, from }  up at seven on next year's permit's day (the clock moved)
import { dateOfAbs } from './trip.js';
import { dateWords } from './permits.js';

export const TURN = {
  rescue: 75,      // dollars: the rescue off the ice (permits are $6, a far notice $40-60)
  checkS: 2,       // seconds between looks at the ice under a trip
  wake: 7,         // the hour the turn wakes you at
  iced: 0.5,       // season.ice at or over this: frozen (player.js walks you over it from here)
  fallFrom: 182,   // and from 1 July on (day of the year): the freeze-up, not the spring's last ice
};
const GUIDE_ID = 'late:ice';

export class SeasonTurn {
  constructor() { this.t = {}; this.handlers = new Map(); this.checkT = 0; this.turning = false; }
  attach(t = {}) {
    Object.assign(this.t, t);
    if (this.t.permits) this.t.permits.turn = this;
    const G = this.t.guide;
    if (G && typeof G.source === 'function' && !this.sourced) { this.sourced = true; G.source('late', () => this.guideSpecs()); }
    return this;
  }
  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
    return () => this.handlers.get(evt).delete(fn);
  }
  emit(evt, e) { for (const k of [evt, '*']) for (const fn of this.handlers.get(k) || []) { try { fn(e, evt); } catch (err) { console.warn('seasonTurn.on', evt, err); } } }

  get coop() { const g = typeof window !== 'undefined' ? window.__game : null; return g ? { coop: g.coop || null, ct: g.coopTrip || null } : {}; }
  get grouped() { const c = this.coop; return !!(c.ct && c.ct.grouped); }
  get guest() { const c = this.coop; return !!(c.coop && c.coop.role === 'guest'); }
  get today() { const P = this.t.permits; return P ? P.today : 0; }
  // (loop-r4 join: the freeze-up only, never the spring: a trip that reaches a lake still holding its ice in May, a later
  // lake's ice-out than the landing's, was told "Ice is making: the lakes are closing" and offered the $75 rescue)
  frozen() { const d = this.t.day; return !!(d && d.season && d.season.ice >= TURN.iced && d.doy >= TURN.fallFrom); }

  // --- 1. ice on a trip ------------------------------------------------------------------------------------------------
  update(dt = 0) {
    if ((this.checkT -= dt) > 0) return;
    this.checkT = TURN.checkS;
    const tr = this.t.trip, p = this.t.player;
    if (!tr || !tr.active || !tr.adventure || tr.evacuating || (p && p.teleporting) || this.guest) return;
    const s = tr.state;
    if (s.iced || !this.frozen()) return;
    s.iced = this.today; // (saved with the trip's core: once a trip)
    const w = this.t.world || (tr && tr.world), lake = p && w && typeof w.lakeIdAt === 'function' ? w.lakeName(w.lakeIdAt(p.x, p.z) || 0) || '' : '';
    if (typeof tr.log === 'function') tr.log('iced', { lake });
    const hud = this.t.hud;
    if (hud && typeof hud.note === 'function') hud.note(`Ice is making${lake ? ` on ${lake}` : ''}: the lakes are closing. Carry and walk out to a landing, or send for a rescue (the journal, $${TURN.rescue}).`, 9);
    if (this.t.outfitter && typeof this.t.outfitter.save === 'function') this.t.outfitter.save();
    this.emit('iced', { abs: this.today, lake, trip: s.id });
  }
  get money() { const pr = this.t.profile; return pr && Number.isFinite(pr.money) ? Math.floor(pr.money) : 0; }
  // the journal's entry while a trip is caught by the ice
  guideSpecs() {
    const tr = this.t.trip;
    if (!tr || !tr.active || !tr.adventure || !tr.state || !tr.state.iced || this.guest) return [];
    const fee = TURN.rescue, short = this.grouped ? 'Not with company: walk out together.' : this.money < fee ? `$${fee} — you have $${this.money}. Walk out over the ice.` : null;
    return [{ id: GUIDE_ID, kind: 'ticket', title: 'Frozen in', next: `Carry and walk out to any landing, or send for a rescue ($${fee})`, order: -1,
      action: { label: `Send for a rescue · $${fee}`, short, run: () => this.rescue() } }];
  }
  rescue() {
    const tr = this.t.trip, pr = this.t.profile, fee = TURN.rescue;
    if (!tr || !tr.active || !tr.adventure || tr.evacuating) return { ok: false, why: 'trip', words: 'No trip under way.' };
    if (!tr.state.iced) return { ok: false, why: 'open', words: 'The water is still open.' };
    if (this.grouped || this.guest) return { ok: false, why: 'company', words: 'Not with company: walk out together.' };
    if (!pr || this.money < fee || !pr.spend(fee, 'a rescue off the ice')) return { ok: false, why: 'money', words: `$${fee}. You have $${this.money}.` };
    const to = typeof tr.nearestKnownOutfitter === 'function' ? tr.nearestKnownOutfitter() : null;
    const ok = tr.evacuate('ice', { fee });
    if (!ok) { pr.earn ? pr.earn(fee, 'the rescue, called off') : (pr.money += fee); return { ok: false, why: 'busy', words: 'Not now.' }; }
    this.emit('rescue', { fee, abs: this.today, to: to ? to.ep : null });
    return { ok: true, words: `The rescue is coming: $${fee}.` };
  }

  // --- 2. the turn: next year's permit's day --------------------------------------------------------------------------
  canTurn() {
    const tr = this.t.trip;
    if (tr && tr.active) return 'trip';
    if (this.grouped || this.guest) return 'company';
    if (this.turning || (this.t.permits && this.t.permits.skipping)) return 'busy';
    return null;
  }
  turnTo(abs, { landing = null, permit = null } = {}) {
    const d = this.t.day, P = this.t.permits, o = this.t.outfitter, veil = this.t.veil, en = this.t.energy, tr = this.t.trip;
    abs = Math.round(abs);
    const today = this.today, from = dateOfAbs(today), to = dateOfAbs(abs);
    if (!d || abs <= today || this.canTurn()) return Promise.resolve(false);
    const L = landing || (o && (o.at || o.port)) || null;
    if (L && P && P.iced(L.ep, abs)) return Promise.resolve(false);
    this.turning = true; if (P) P.skipping = true;
    if (o) { if (o.open && typeof o.hide === 'function') o.hide(); o.bunking = true; }
    const run = () => {
      this.emit('season:close', { year: from.year, abs: this.today, ep: L ? L.ep : null });
      const hours = (abs - this.today) * 24 + TURN.wake - d.hours;
      d.advance(hours);
      // rested and fed, the gear dry: a winter in town (as the bunkhouse's nights, permits.skipTo)
      if (en) {
        if (typeof en.sleep === 'function') en.sleep(1, 10, { bag: true });
        en.value = 1;
        if ('lastHours' in en) en.lastHours = d.hours;
        if ('awakeSince' in en) en.awakeSince = en.now;
        if ('lastMealAbs' in en) { en.lastMealAbs = en.now; en.lastMealKind = 'hot'; }
        if ('upsetAt' in en) en.upsetAt = null;
        try { if (en.needs && typeof en.needs === 'object') { en.needs.food = 1; en.needs.water = 1; en.needs.warmth = 1; } } catch { /* energy.js's own */ }
        if (typeof en.fill === 'function') en.fill(2, 0);
      }
      if (tr && tr.state) tr.state.wet = false;
      if (P) P.lapse();
      const T = this.t.tasks; if (T && typeof T.expire === 'function') { try { T.expire(); } catch (e) { console.warn('seasonTurn: the board', e); } }
      if (tr && typeof tr.log === 'function') tr.log('skip', { nights: abs - today, to: abs, ep: L ? L.ep : null, winter: true, year: to.year });
      if (o && typeof o.save === 'function') o.save();
    };
    const card = {
      kicker: `${L ? `${L.name} · ` : ''}winter`,
      text: 'The lakes close. The ice comes in, then the snow, and the long dark; the bunkhouse is shut till spring.',
      sub: `Up at seven on ${dateWords(abs)}, ${to.year}, rested, for your permit's day. Your gear, your maps and your money are as you left them.`,
      fadeIn: 1.6, hold: 5, fadeOut: 2.4, onDark: run,
    };
    const done = () => {
      this.turning = false; if (P) P.skipping = false;
      if (o) { o.bunking = false; o.lineKind = 'morning'; if (o.visit || o.at) o.pendingShow = true; }
      if (P) P.emit('skip', { nights: abs - today, abs, winter: true });
      this.emit('year:open', { year: to.year, abs, ep: L ? L.ep : null, permit: permit ? { ...permit } : null, from: from.year });
      return true;
    };
    if (veil && typeof veil.card === 'function') return veil.card(card).then(done);
    run();
    return Promise.resolve(done());
  }
  stats() { const tr = this.t.trip; return { frozen: this.frozen(), iced: !!(tr && tr.state && tr.state.iced), turning: this.turning, fee: TURN.rescue }; }
}

export const seasonTurn = new SeasonTurn();
