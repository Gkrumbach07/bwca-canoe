// The start (the start round, 2026-11-05). The owner: "In the intro, it should be very easy and take you on a very simple
// route. So maybe a suggested route the outfitter gives you. Maybe each outfitter has a starter route and task that gets
// you a little bit more money. That's literally just one night and you go out." And: "sometimes just randomly you can
// start and it will be raining or something like that."
//
// The route. Each of the fourteen hosting outfitters has one easy first night (src/starter-routes.json, picked from the
// release by scripts/r2-starter-routes.mjs): from its own landing a short paddle, no carry where the water allows, to a
// real campsite with a landing and a pad that the parties seldom take, and back the next day. The first time you are at
// an outfitter in a season, someone there suggests it in a line or two of plain talk and pencils the site and the way on
// your map (a person marking it for you, because they are suggesting it): at home, the keeper as the season's first
// talk ends (onboarding.js), elsewhere the keeper when you ask ("First time here. Somewhere easy for a night?", their
// talk's first choice, npcs.js extraChoices). With it a small paid job, offered with a yes: look over the site's grate,
// latrine and tent pad (the 'starter' notice kind, task-kinds-2.js, the campsite check's own steps), $20, three days. It
// is a suggestion: no marker, no nag, the player goes where they like; if they go elsewhere the notice just lapses (its
// day passes like any notice's). Once per outfitter per season. The site is held for you while the suggestion stands
// (parties.js mine, reaching back STARTER.clearH: the parties' sweep puts any party there, already camped or to come,
// on another site, as for a site you have left things at), so the first night is not spoiled by a party camped there.
//
// The weather (weather.js GENTLE): the season's own seed (main.js), so a season can start grey or wet; over the first
// trip (the start day and the two after, cut as the first trip with a night out ends) no thunderstorm and no wind that
// raises whitecaps. gentle() is the window, in abs hours (trip.js absDay × 24 + the hour).
//
//   starter.attach({ tasks, profile, outfitter, npcs, onboarding, parties, weather, trip, day, world, hud })
//   starter.route(ep) → the route, or null           starter.available(ep) → bool (a route, not yet suggested this season)
//   starter.talk(ep, done, { by }) → a talk node: the suggestion, the pencil, then the job offered with a yes; done() → the
//     node after it (the onboarding's close, the keeper's own choices)
//   starter.take(ep) → the notice taken, or null      starter.notes() → the map's pencilled ways (map-book.js marks)
//   starter.holds() → [{ i, key, since }] (parties.js mine)     starter.gentle() → { from, to } | null
//   starter.update(dt): the weather's window, once a second
// Saved per season (save.js `bwca-canoe:starter`): { v: 1, season, offered: { ep: abs hours }, taken: { ep: task id },
// firstOut: abs hours | null (the first trip with a night out ended) }.
import { save } from './save.js';
import { absDay } from './trip.js';
import { miles } from './units.js';
import ROUTES from './starter-routes.json';

const NS = 'starter';
export const STARTER = {
  pay: 20,           // $ for the site looked over (a carry on the way: CARRY more)
  carry: 5,
  gentleDays: 3,     // the start day and the two after: the first trip's kind weather, at most
  holdH: 72,         // game hours a suggested site is held for you from the suggestion (the notice's three days)
  noteH: 96,         // game hours the pencilled way stays on the map once its notice is gone (a suggestion not taken: this long)
  clearH: 240,       // game hours before the suggestion the hold reaches back: a party camped there then goes elsewhere
};
const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const compass = (dx, dz) => COMPASS[Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360) / 45) % 8];
const SITE_WORDS = { island: 'the island site', point: 'the site on the point', bay: 'the site back in the bay' };
const blank = (season = null) => ({ v: 1, season, offered: {}, taken: {}, firstOut: null });
const hashStr = (s) => { let h = 2166136261; for (const c of String(s || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
// the weather's seed for a season (an integer, never the default's 23 by chance alone)
export const seasonSeed = (id) => (id ? (hashStr(`sky:${id}`) % 2147483000) + 101 : 23);

export class Starter {
  constructor() { this.t = {}; this.state = null; this._t = 0; }
  attach(t = {}) {
    Object.assign(this.t, t);
    const pr = this.t.profile, s = save.read(NS);
    this.state = s && s.v === 1 && (!pr || !pr.seasonId || s.season === pr.seasonId) ? { ...blank(), ...s } : blank(pr ? pr.seasonId : null);
    if (pr && typeof pr.onChange === 'function') pr.onChange((what) => { if (what === 'season') this.newSeason(pr.seasonId); });
    const tr = this.t.trip;
    if (tr && typeof tr.on === 'function') tr.on('exit', () => this.tripOut());
    return this;
  }
  newSeason(id = null) { this.state = blank(id); this.write(); this.sync(); }
  write() { if (this.state && !this.guest) save.write(NS, this.state); }
  get guest() { const g = typeof window !== 'undefined' ? window.__game : null, c = g && g.coopTrip; return !!(c && c.mirroring); }
  get nowH() { const d = this.t.day; return d ? absDay(d.year, d.doy) * 24 + d.hours : 0; }
  get home() { const pr = this.t.profile; return pr && pr.started ? pr.home : null; }

  // --- the routes --------------------------------------------------------------------------------------------------
  route(ep) {
    const r = ROUTES && ROUTES.routes ? ROUTES.routes[Number(ep)] : null, w = this.t.world;
    if (!r || !w) return null;
    // (the release the routes were picked on: another one's site indices mean other sites)
    if (ROUTES.for && w.meta && w.meta.source && w.meta.source.baked && ROUTES.for !== w.meta.source.baked) return null;
    const site = w.campsites[r.site];
    return site ? { ...r, ep: Number(ep), siteRec: site } : null;
  }
  // a route to suggest here: one this season has not heard yet (not a co-op guest's: their host's season)
  available(ep) {
    const pr = this.t.profile;
    if (!this.state || this.guest || !pr || !pr.started || pr.mode === 'sandbox') return false;
    return !!this.route(ep) && this.state.offered[Number(ep)] == null;
  }
  // the words of the way: where the site is from the landing, how far, the carry
  words(ep) {
    const r = this.route(ep), w = this.t.world, L = this.landingOf(ep);
    if (!r || !L) return null;
    const s = r.siteRec, lake = r.lake || 'the lake', site = SITE_WORDS[r.feature] || 'the campsite';
    const dir = compass(s.x - L.x, s.z - L.z), mi = miles(Math.max(0.5, r.km));
    const own = L.lake && w && w.lakeName(L.lake) === r.lake;
    const cs = r.portages || [], carry = cs.length ? cs[0] : null;
    const carries = !carry ? '' : cs.length === 1 ? `One carry, ${carry.rods} rods` : `Two short carries, ${cs[0].rods} and ${cs[1].rods} rods`;
    const way = carry
      ? `${carries}, then ${lake}: ${site} there. About ${mi} miles all told.`
      : own ? `Paddle ${dir} up ${lake} to ${site}, about ${mi} miles.` : `Paddle ${dir} to ${site} on ${lake}, about ${mi} miles.`;
    const easy = r.dams ? 'Over a beaver dam or two, nothing worse.' : carry ? 'Easy after that.' : 'Easy water.';
    return { lake, site, dir, mi, way, easy, carry };
  }
  landingOf(ep) { const T = this.t.tasks; return T && typeof T.landing === 'function' ? T.landing(Number(ep)) : null; }

  // --- the talk ------------------------------------------------------------------------------------------------------
  // the suggestion: the way pencilled as it is said, then the job, with a yes
  talk(ep, done = () => null, { by = null } = {}) {
    const W = this.words(ep);
    if (!W || !this.available(ep)) return done();
    this.state.offered[Number(ep)] = Math.round(this.nowH * 100) / 100; this.write();
    const pay = this.payOf(ep), node = (say, choices) => (by ? { say, by, choices } : { say, choices });
    const after = (say) => node(say, [{ text: 'Thanks.', go: done }]);
    // (r2 join: an open ticket means no night permit at the desk: the keeper says so, once, with the way)
    const P = this.t.permits, owed = P && typeof P.owed === 'function' ? P.owed() : 0;
    const tk = owed > 0 ? ` That ticket of yours first, though: the desk sells no night with one open.` : '';
    return node(`First night out? ${W.way} ${W.easy} Back by lunch the next day. I’ve marked it on your map.${tk}`, [
      { text: 'I’ll go there.', go: () => node(`While you’re there, look over the grate, the latrine and the tent pad for me. $${pay} when you’re back.`, [
        { text: 'I’ll do that.', go: () => { this.take(ep); return after('Good. Back in two or three days, then.'); } },
        { text: 'I’ll just camp.', go: () => after('Fair enough. Enjoy it.') },
      ]) },
      { text: 'I might go somewhere else.', go: () => after('Suit yourself. It’s on your map if you want it.') },
    ]);
  }
  payOf(ep) { const r = this.route(ep); return STARTER.pay + (r && r.portages && r.portages.length ? STARTER.carry : 0); }
  // the job: a 'starter' notice from this outfitter, taken (tasks.js makeKind, take)
  async takeAsync(ep) {
    const T = this.t.tasks;
    if (!T || typeof T.makeKind !== 'function') return null;
    const t = await T.makeKind('starter', Number(ep), 'local');
    if (!t) return null;
    T.take(t.id);
    this.state.taken[Number(ep)] = t.id; this.write();
    return t;
  }
  take(ep) { const p = this.takeAsync(ep); this.pending = p; p.catch((e) => console.warn('starter: take', e)); return p; }
  taskOf(ep) { const T = this.t.tasks, id = this.state ? this.state.taken[Number(ep)] : null; return T && id != null && T.ads ? T.ads.get(id) || null : null; }

  // --- the map and the parties ---------------------------------------------------------------------------------------
  // a suggestion stands while its notice is on the go, else STARTER.noteH game hours from when it was made
  standing(ep) {
    const at = this.state ? this.state.offered[Number(ep)] : null;
    if (at == null) return false;
    const t = this.taskOf(ep);
    if (t) return t.status === 'open' || t.status === 'done';
    return this.nowH - at < STARTER.noteH;
  }
  // the pencilled ways on your map: { kind: 'starter', label, text, x, z, r, ep, by, way: [[x, z], ...] }
  notes() {
    if (!this.state) return [];
    const out = [], shop = this.t.outfitter && this.t.outfitter.shop;
    for (const k of Object.keys(this.state.offered)) {
      const ep = Number(k), r = this.route(ep);
      if (!r || !this.standing(ep) || !Array.isArray(r.way) || r.way.length < 2) continue;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of r.way) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const by = shop && typeof shop.keeperName === 'function' ? shop.keeperName(ep) : null;
      out.push({ kind: 'starter', label: 'first night out', text: (this.words(ep) || {}).way || '', lake: r.lake, ep, by, x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.max(150, Math.hypot(x1 - x0, z1 - z0) / 2), way: r.way, site: { x: r.siteRec.x, z: r.siteRec.z } });
    }
    return out;
  }
  // the sites held for you (parties.js mine's shape): from the hour it was suggested, while it stands and STARTER.holdH
  holds() {
    // (r2 join: not a co-op guest's: its own season is set aside on the visit, and the room's parties hold the host's)
    if (!this.state || this.guest) return [];
    const out = [];
    for (const k of Object.keys(this.state.offered)) {
      const ep = Number(k), r = this.route(ep), at = this.state.offered[k];
      if (!r || this.nowH - at > STARTER.holdH || !this.standing(ep)) continue;
      // (from before the suggestion: a party already camped there when it was made moves on too, out of sight, as the
      // sweep is made again; the one who suggested it would not send you to a site with a party on it)
      out.push({ i: r.site, key: r.siteRec.key || `${Math.round(r.siteRec.x)}:${Math.round(r.siteRec.z)}`, since: at - STARTER.clearH });
    }
    return out;
  }

  // --- the weather ---------------------------------------------------------------------------------------------------
  gentle() {
    const pr = this.t.profile, st = pr && pr.started ? pr.start : null;
    if (!st || !this.state || this.guest) return null;
    const from = absDay(st.year, st.doy) * 24, to0 = from + STARTER.gentleDays * 24;
    const to = this.state.firstOut != null ? Math.min(to0, Math.max(from, this.state.firstOut)) : to0;
    return to > from ? { from, to } : null;
  }
  // the first trip with a night out has ended: the kind weather ends with it
  tripOut() {
    if (!this.state || this.state.firstOut != null) return;
    const tr = this.t.trip, last = tr && tr.book && Array.isArray(tr.book.trips) ? tr.book.trips[tr.book.trips.length - 1] : null;
    if (!last || !(last.nights_out >= 1)) return;
    this.state.firstOut = Math.round(this.nowH * 100) / 100; this.write(); this.sync();
  }
  // a co-op guest's sky is the host's (coop-sky.js sets the seed and the window): never this season's own
  get skyFollows() { const g = typeof window !== 'undefined' ? window.__game : null, c = g && g.coopSky; return !!(c && c.following); }
  sync() {
    const wx = this.t.weather;
    if (!wx || this.guest || this.skyFollows) return;
    const pr = this.t.profile;
    if (pr && pr.seasonId && typeof wx.setSeed === 'function') wx.setSeed(seasonSeed(pr.seasonId));
    const g = this.gentle(), o = wx.gentle;
    if (!g) { if (o) { wx.gentle = null; wx._lastAbs = NaN; } return; }
    if (!o || o.from !== g.from || o.to !== g.to) { wx.gentle = g; wx._lastAbs = NaN; if (wx.look) wx.look.snap = true; }
  }
  update(dt) { if ((this._t += dt) < 1) return; this._t = 0; this.sync(); }
}

export const starter = new Starter();
