// Drives and pickups (game-loop round, stream B; rides up the road since hubs phase 2). No fast travel: the truck.
//
// Drives. From an outfitter's counter the truck goes to any entry point, an outfitter's or a trailhead's (the owner,
// 2026-11-02: "any outfitter drives you to any entry point for a fee by road distance"); its own landing is a walk down
// to the dock, never a drive. The road is the road graph's (outfitters.js roadKm: the trunk roads and highways, the
// spurs in to each landing), the time 0.5 h + km / 40 at the one clock, the price $5 + $0.50 a km, rounded to $5. The
// canoe rides on the roof and the packs in the back: you arrive with everything. At an outfitter, tied up at its dock
// and in at its door (outfitter.js arrival); at a trailhead, in its lot with the canoe set down at its landing
// (outfitter.js updateTrailArrival). A drive that would get in after 21:00 (or before 5:00) is a bunk night: at the
// far end where that is an outfitter (up at 7:30, as before), else at the outfitter you left from, the truck going
// at seven. Sandbox: free and instant.
//
// Pickups. At a trailhead's sign (outfitter.js showPickup) the outfitters who will come for you, each with its fare and
// the wait: free when the entry point is in the reach of the outfitter that sold this trip's permit (trip.state.permit
// .from; a day-use trip: the outfitter that drove you to the put-in or saw you off its own landing, trip.state.via /
// outfitter.via, else home) and that outfitter is the one coming; any other outfitter, or from farther, priced like a
// drive. The truck comes out (the wait: a drive's time), and takes you back (its time again) to that outfitter's door.
// Never stuck: the free one is always on the list when there is one; when none is free and you are short, the truck
// takes what is in your hand (never a debt). [owner call, game-loop round]
//
//   rides.offer(fromEp) → [{ ep, name, place, lake, road, km, hours, price, outfitter, unknown, late }]   (by road km)
//   rides.quote(fromEp, toEp) → { km, hours, price }, quoteBetween(a, b) (a, b: { ep, x, z }), rideTime(h) → words
//   rides.take(ep) → false (refused) | Promise (arrived)            rides.act(id), rides.section(ep) (the counter's)
//   rides.pickups(atEp) → [{ by, name, place, price, free, hours, km, short, takesAll }]
//   rides.callPickup(atEp, byEp) → Promise<bool>                    rides.pickupSection(atEp) (the sign's paper)
//   rides.seller() → the outfitter whose pickups are free now
//
// It hides the counter itself before the fade (so the counter's own close afterwards does nothing), and on arrival
// sets outfitter.arrivedBy = 'ride' for the counter's greeting (keeperLine(profile, 'ride')).
import { outfitterProfile, keeperLine, roadOf, roadKm, roadWay, isOutfitter, reachOf, hostOf, nearWords } from './outfitters.js';
import { miles } from './units.js';
import { landingEp } from './ep-start.js'; // round 2: an entry point that puts in at an outfitter's own landing is a walk from its counter

export const ROAD = 1.4;          // road km for a km of straight line, where the road graph has no answer
const BASE_H = 0.5, KMH = 40;     // the time: half an hour, then 40 km an hour
const BASE_$ = 5, PER_KM = 0.5, ROUND = 5;
const LATE = 21, EARLY = 5, WAKE = 7.5, GO = 7; // a drive in after 21:00 (or before 5:00) is a bunk night; up at 7:30, the truck at 7
const AT_COUNTER = 40;            // metres from a landing that count as at its counter, when no counter is open
let WORLD = null;                 // the world the road graph is read from (set by the Rides)

const priceOf = (km) => Math.max(ROUND, Math.round((BASE_$ + PER_KM * km) / ROUND) * ROUND);
// a drive between two places ({ ep, x, z }): the road graph's km where both are entry points it knows, else the old
// 1.4 × straight line
export function quoteBetween(a, b, world = WORLD) {
  let km = a && b && a.ep != null && b.ep != null && world ? roadKm(a.ep, b.ep, world) : null;
  if (!Number.isFinite(km)) km = (Math.hypot(b.x - a.x, b.z - a.z) * ROAD) / 1000;
  return { km: +km.toFixed(1), hours: +(BASE_H + km / KMH).toFixed(3), price: priceOf(km) };
}
// "40 min", "1 h 25"
export function rideTime(h) {
  const m = Math.max(5, Math.round((h * 60) / 5) * 5);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kmWords = (k) => miles(k); // (miles now, from km)
const miWords = (k) => { const m = k * 0.621371; return m < 10 ? m.toFixed(1) : String(Math.round(m)); }; // the counter's rows, in miles

export class Rides {
  // { world, outfitter, day, veil, hud, energy, tasks, teleport (x, z) → Promise<bool> }
  constructor({ world, outfitter, day, veil = null, hud = null, energy = null, tasks = null, teleport = null }) {
    this.world = world; this.outfitter = outfitter; this.day = day; this.veil = veil; this.hud = hud; this.energy = energy; this.tasks = tasks;
    WORLD = world;
    this.teleport = teleport || ((x, z) => (outfitter && outfitter.onTeleport ? outfitter.onTeleport(x, z) : Promise.resolve(false)));
    this.busy = false; this.last = null;
    this.grounded = null; // (words) => false when a line is untrue here and now (main.js: npcs.grounded, gl-e)
    injectCss();
  }
  // the keeper's own line for a moment (the drive's goodbye, the pickup's hello), drawn again, up to 24 times, while
  // the grounding refuses it, as the counter's outfitter.say is (main.js). (24, not 8: a pool of two lines with one
  // refused gave the refused one back after nine draws about once in 500 cards.)
  keeperWords(profile, moment) {
    const ctx = { hours: this.day ? this.day.hours : undefined }, ok = (w) => { try { return !this.grounded || this.grounded(w); } catch { return true; } };
    let w = keeperLine(profile, moment, ctx);
    for (let k = 0; k < 24 && w && !ok(w); k++) w = keeperLine(profile, moment, ctx);
    return w;
  }
  get profile() { return (this.outfitter && this.outfitter.profile) || null; }
  get core() { return (this.outfitter && this.outfitter.core) || null; }
  get sandbox() { return !!(this.core && this.core.sandbox); }
  // any entry point, an outfitter's or a trailhead's (outfitter.js entries)
  landing(ep) { const o = this.outfitter; if (!o) return null; return (typeof o.entry === 'function' ? o.entry(ep) : null) || o.landings.find((l) => l.ep === Number(ep)) || null; }
  knows(ep) { const pr = this.profile; return pr ? pr.knows(ep) : true; }
  note(t, s = 6) { if (this.hud && t) this.hud.note(t, s); }
  // the counter you are at: the open one (an outfitter's), else an outfitter's landing within reach
  here() {
    const o = this.outfitter; if (!o) return null;
    if (o.open && o.at && isOutfitter(o.at.ep)) return o.landing(o.at.ep) || o.at;
    const p = o.player, n = p ? o.nearest(p.x, p.z) : null;
    return n && n.d < AT_COUNTER ? n.l : null;
  }
  quote(fromEp, toEp) { const a = this.landing(fromEp), b = this.landing(toEp); return a && b ? quoteBetween(a, b, this.world) : null; }
  lakeOf(l) { return (this.world.lakeName ? this.world.lakeName(l.lake) : null) || l.place; }
  // the drives from a counter: every other entry point, nearest by road first
  offer(fromEp) {
    const a = this.landing(fromEp), o = this.outfitter; if (!a || !o) return [];
    const list = typeof o.entry === 'function' && Array.isArray(o.entries) ? o.entries : o.landings;
    const h = this.day ? this.day.hours : 12;
    return list.filter((l) => l.ep !== a.ep).map((l) => {
      const q = quoteBetween(a, l, this.world), at = (h + q.hours) % 24, out = isOutfitter(l.ep);
      return { ep: l.ep, name: l.name, place: l.place, lake: this.lakeOf(l), road: roadOf(l.ep), ...q, price: this.sandbox ? 0 : q.price, outfitter: out, host: hostOf(l.ep, this.world),
        unknown: out && !this.knows(l.ep), late: !this.sandbox && (at >= LATE || at < EARLY), walk: landingEp(this.world, l.ep) === a.ep };
    }).sort((x, y) => x.km - y.km);
  }

  // --- a drive ---------------------------------------------------------------------------------------------------
  act(id) { return this.take(Number(id)); }
  take(ep) {
    const o = this.outfitter, from = this.here(), to = this.landing(ep), pr = this.profile;
    if (this.busy || !o || !to) return false;
    if (!from) { this.note('The truck goes from an outfitter’s counter.'); return false; }
    if (from.ep === to.ep) { this.note(`${to.name}’s landing is down the yard: walk it.`); return false; }
    if (landingEp(this.world, to.ep) === from.ep) { this.note(`${to.name} puts in at this landing: walk down to the dock.`); return false; } // (round 2: a shared landing, EP 47/48 at 49's, 70 at 69's, 66 at 64's, 52 at 51's)
    const r = this.offer(from.ep).find((x) => x.ep === to.ep);
    if (!r) return false;
    if (!this.sandbox && r.price > 0) {
      if (!pr || !pr.spend(r.price, `the drive to ${to.name}`)) { this.note(`The drive to ${to.name} is $${r.price}: not enough in hand.`); if (o.open) o.render(); return false; }
    }
    this.busy = true;
    if (o.open) o.hide(); // the paper goes; the counter's own close after this does nothing
    const fromP = outfitterProfile(from.ep, this.world), toP = outfitterProfile(to.ep, this.world);
    const lake = r.lake || to.place, way = roadWay(from.ep, to.ep, this.world), via = way.length ? ` by ${way.join(', ')}` : '';
    const lateWords = !r.late ? '' : isOutfitter(to.ep) ? ` It’s late when you get in: a bunk at ${to.name}, and you’re up at half past seven.` : ` It’s late: a bunk here tonight, and the truck goes at seven.`;
    const sub = this.sandbox
      ? `Sandbox: the truck is free and the road takes no time. ${lake}, entry point ${to.ep}.`
      : `${kmWords(r.km)} miles${via} to ${lake}, ${rideTime(r.hours)}: $${r.price}. The canoe rides on the roof, the packs in the back.${lateWords}`;
    const card = {
      kicker: `${from.name} → ${to.name} · ${isOutfitter(to.ep) ? nearWords(to.ep, this.world) || `entry point ${to.ep}` : `entry point ${to.ep}`}`, // (round 2: an outfitter is near an entry point)
      text: `“${this.keeperWords(fromP, 'goodbye')}”`,
      sub,
      fadeIn: this.sandbox ? 0.6 : 1.2, hold: this.sandbox ? 0.4 : 3.2, fadeOut: this.sandbox ? 0.8 : 1.8,
      onDark: () => this.arrive(from, to, r, toP),
    };
    const done = () => { this.busy = false; };
    if (this.veil) return this.veil.card(card).then(done, done);
    return Promise.resolve(card.onDark()).then(done, done);
  }
  // the clock for a drive of `hours` starting now: { night } after moving it (a late one is a bunk night: at the far
  // end, or before the truck goes)
  clock(hours, { bunkFirst = false } = {}) {
    const d = this.day, en = this.energy; if (this.sandbox || !d) return { night: false };
    const h0 = d.hours, at = (h0 + hours) % 24;
    if (!(at >= LATE || at < EARLY)) { d.advance(hours); return { night: false }; }
    // a bunk night: the clock to 7:30 (or the truck at 7 and the drive after), a full night's rest, breakfast and a full bottle
    const wake = bunkFirst ? GO : WAKE, sleep = (wake - h0 + 24) % 24 || 24;
    d.advance(bunkFirst ? sleep + hours : Math.max(hours, sleep));
    if (en) {
      en.sleep(1, Math.max(7, (bunkFirst ? sleep : sleep - hours)), { bag: true }); en.value = 1;
      if ('lastHours' in en) en.lastHours = d.hours;
      if ('lastMealAbs' in en) { en.lastMealAbs = en.now; en.lastMealKind = 'hot'; }
      try { if (en.needs && typeof en.needs === 'object') { en.needs.food = 1; en.needs.water = 1; en.needs.warmth = 1; } } catch { /* the needs are energy.js's own */ }
      if (typeof en.fill === 'function') en.fill(2, 0);
    }
    return { night: true };
  }
  // at full dark: the move, the clock, the night if it is late, the outfitter known, its door or the trailhead's lot
  // Round 2 (entry points true to life): the truck to a portage-first start's lot, on land: on foot there, the canoe set
  // down in the lot (outfitter.js updateTrailArrival then puts it where the trailhead's layout says, once it is built)
  async toLot(to) {
    const o = this.outfitter, p = o && o.player, w = this.world, L = to.lot;
    if (!p || !L || typeof p.standAt !== 'function') return this.teleport(to.x, to.z);
    if (p.teleporting) return false;
    p.teleporting = true;
    try { if (w.tiles) await w.tiles.ensure(L.x, L.z, 130); } finally { p.teleporting = false; }
    const ok = p.standAt({ x: L.x, z: L.z, heading: 0, drop: { x: L.x + 3, z: L.z, heading: 0 } });
    if (ok && p.chase) p.chase.snap();
    return ok || this.teleport(to.x, to.z);
  }
  async arrive(from, to, r, toP) {
    void toP;
    const o = this.outfitter, pr = this.profile, core = this.core, d = this.day;
    const ok = to.lot ? await this.toLot(to) : await this.teleport(to.x, to.z); // (round 2: a portage-first start's lot is on land)
    if (!ok) { // the truck could not get through (no open water found at the landing): nothing moves, the fare back
      if (pr && r.price > 0) { pr.s.money += r.price; pr.s.spent -= r.price; pr.entry(r.price, `the drive to ${to.name}, refunded`); pr.changed('money'); }
      this.note(`The road to ${to.name} is closed today. The fare is back in your hand.`);
      o.lineKind = 'welcome'; o.pendingShow = true;
      return false;
    }
    const out = isOutfitter(to.ep), { night } = this.clock(r.hours, { bunkFirst: !out });
    // an outfitter is known on arrival (trip.js says so with a note); a trailhead is not one to know
    if (out) { if (core && typeof core.learn === 'function') core.learn(to.ep); else if (pr) pr.learn(to.ep); }
    if (core && typeof core.log === 'function') core.log('ride', { from: from.ep, to: to.ep, km: r.km, hours: r.hours, price: r.price, night });
    if (this.tasks && typeof this.tasks.onEvent === 'function') this.tasks.onEvent({ type: 'arrive', ep: to.ep, by: 'ride' }); // a fetch notice (later) hears it
    // who drove you: a pickup back from its reach is on it (the trip's via, outfitter.js start)
    o.via = from.ep;
    if (core && core.state) core.state.via = from.ep;
    this.last = { from: from.ep, to: to.ep, ...r, night, at: d ? { year: d.year, doy: d.doy, hours: +d.hours.toFixed(2) } : null };
    if (out) {
      // in at the store's door, the canoe tied at its dock, and the keeper's word for the road (or breakfast) as you go in
      o.lineKind = night ? 'morning' : 'welcome'; o.arrivedBy = night ? 'bunk' : 'ride';
      if (typeof o.layout === 'function' && typeof o.updateArrival === 'function') o.arrival = { why: 'ride', ep: to.ep, t: 0, pending: true };
      else o.pendingShow = true;
    } else o.arrival = { why: 'ride', ep: to.ep, t: 0 }; // into the lot (outfitter.js updateTrailArrival)
    if (typeof o.save === 'function') o.save();
    return true;
  }

  // --- pickups ---------------------------------------------------------------------------------------------------
  // the outfitter whose pickups are free now: the one that sold the trip's permit (stream A), else the one that saw the
  // trip off (its via), else home
  seller() {
    const core = this.core, st = core && core.state, o = this.outfitter, pr = this.profile;
    const pm = st && st.permit;
    if (pm && pm.from != null) return Number(pm.from);
    if (st && st.via != null) return Number(st.via);
    if (o && o.via != null) return Number(o.via);
    return pr && pr.home != null ? Number(pr.home) : null;
  }
  pickups(atEp) {
    const at = this.landing(atEp), o = this.outfitter; if (!at || !o) return [];
    const seller = this.seller(), money = this.profile ? this.profile.money : Infinity;
    const rows = o.landings.filter((l) => l.ep !== at.ep).map((l) => {
      const q = quoteBetween(l, at, this.world), free = this.sandbox || (l.ep === seller && reachOf(seller, this.world).includes(at.ep));
      return { by: l.ep, name: l.name, place: l.place, lake: this.lakeOf(l), km: q.km, hours: q.hours, price: free || this.sandbox ? 0 : q.price, free, short: false, takesAll: false };
    }).sort((x, y) => (y.free - x.free) || x.price - y.price || x.km - y.km);
    const anyFree = rows.some((r) => r.free);
    for (const r of rows) {
      r.short = !r.free && r.price > money;
      r.takesAll = r.short && !anyFree; // never stuck: the truck takes what is in your hand
    }
    return rows;
  }
  callPickup(atEp, byEp) {
    const o = this.outfitter, at = this.landing(atEp), pr = this.profile;
    if (this.busy || !o || !at) return Promise.resolve(false);
    const r = this.pickups(atEp).find((x) => x.by === Number(byEp)), by = r ? o.landing(r.by) : null;
    if (!r || !by) return Promise.resolve(false);
    let paid = r.price;
    if (!r.free && !this.sandbox) {
      if (r.short && !r.takesAll) { this.note(`${by.name} wants $${r.price} to come out here: not enough in hand.`); return Promise.resolve(false); }
      paid = r.takesAll ? (pr ? pr.money : 0) : r.price;
      if (paid > 0 && (!pr || !pr.spend(paid, `the pickup from ${by.name} at ${at.name}`))) return Promise.resolve(false);
    }
    this.busy = true;
    if (o.open) o.hide();
    const byP = outfitterProfile(by.ep, this.world), k = byP && byP.keeper ? byP.keeper.name : 'The truck', fare = this.sandbox ? 'Sandbox: free, and no wait.' : r.free ? 'On them: your trip was theirs.' : r.takesAll ? `It’s $${r.price}; they take the $${paid} you have and call it square.` : `$${paid}.`;
    const card = {
      kicker: `${at.name} → ${by.name} · entry point ${by.ep}`,
      text: `“${this.keeperWords(byP, 'ride')}”`,
      sub: `${k}’s truck comes out to the lot: about ${rideTime(r.hours)} of waiting, and the same back. ${fare} The canoe goes on the roof.`,
      fadeIn: this.sandbox ? 0.6 : 1.2, hold: this.sandbox ? 0.4 : 3.4, fadeOut: this.sandbox ? 0.8 : 1.8,
      onDark: () => this.pickedUp(at, by, r, paid),
    };
    const done = () => { this.busy = false; };
    // stream E3: the truck comes up the road into the lot and stops first, where there is a road and you are there to
    // see it (truck.js come; not in the sandbox, nor under a test driver, whose timing it would change)
    const T = this.truck, wait = T && !this.sandbox && !(typeof navigator !== 'undefined' && navigator.webdriver && !T.forceCome)
      ? Promise.race([T.come(at.ep), new Promise((r) => setTimeout(r, 14000))]).catch(() => false) : Promise.resolve(false);
    if (this.veil) return wait.then(() => this.veil.card(card)).then(() => { done(); return true; }, () => { done(); return false; });
    return wait.then(() => card.onDark()).then((v) => { done(); return v; }, () => { done(); return false; });
  }
  async pickedUp(at, by, r, paid) {
    const o = this.outfitter, core = this.core, pr = this.profile;
    const ok = await this.teleport(by.x, by.z);
    if (!ok) {
      if (pr && paid > 0) { pr.s.money += paid; pr.s.spent -= paid; pr.entry(paid, `the pickup from ${by.name}, refunded`); pr.changed('money'); }
      this.note(`${by.name}’s truck can’t get through today. The fare is back in your hand.`);
      return false;
    }
    const { night } = this.clock(r.hours * 2);
    if (core && typeof core.learn === 'function') core.learn(by.ep); else if (pr) pr.learn(by.ep);
    if (core && typeof core.log === 'function') core.log('ride', { from: at.ep, to: by.ep, km: r.km, hours: r.hours * 2, price: paid, night, pickup: true });
    if (this.tasks && typeof this.tasks.onEvent === 'function') this.tasks.onEvent({ type: 'arrive', ep: by.ep, by: 'pickup' });
    this.last = { pickup: true, from: at.ep, to: by.ep, km: r.km, hours: r.hours * 2, price: paid, free: r.free, night };
    o.lineKind = night ? 'morning' : 'welcome'; o.arrivedBy = night ? 'bunk' : 'ride';
    o.arrival = { why: 'ride', ep: by.ep, t: 0, pending: false };
    if (typeof o.save === 'function') o.save();
    return true;
  }

  // --- the counter's section, and the sign's ----------------------------------------------------------------------
  section(ep, { shim = false } = {}) {
    injectCss();
    const rows = this.offer(ep), money = this.profile ? this.profile.money : Infinity;
    const sum = this.sandbox ? 'Sandbox: free, and no time on the road' : 'canoe on the roof, packs in the back';
    const reach = new Set(reachOf(ep, this.world));
    const li = (r) => {
      const short = !this.sandbox && r.price > money;
      // the owner (2026-10-31): "you have to also show the number, the entry point number, instead of just the name"
      const meta = [`${esc(r.lake)}`, `${miWords(r.km)} mi`, rideTime(r.hours)];
      return `<li class="ride${r.outfitter ? ' out' : ' th'}${r.unknown ? ' new' : ''}${short ? ' short' : ''}" data-ep="${r.ep}">
        <span class="epno" title="Entry point ${r.ep}"><small>EP</small>${r.ep}</span>
        <div class="to"><b>${esc(r.name)}</b><span>${meta.join(' · ')}${r.outfitter ? ' · <i class="o">outfitter</i>' : reach.has(r.ep) ? ' · ours' : ''}${r.late ? ' · a bunk night first' : ''}</span></div>
        <div class="go"><b class="fare">${r.walk ? 'walk' : this.sandbox ? 'free' : `$${r.price}`}</b><button type="button" class="stamp small" data-act="ride" data-id="${r.ep}"${short || r.walk || this.busy ? ' disabled' : ''} aria-label="Drive to ${esc(r.name)}, entry point ${r.ep}${this.sandbox ? '' : `, $${r.price}`}">Drive</button></div>
      </li>`;
    };
    return `<section class="rides"${shim ? ' data-shim="1"' : ''} aria-labelledby="rides-h">
      <div class="top"><h3 id="rides-h">The truck</h3><span class="sum">${sum}</span></div>
      <ul>${rows.map(li).join('')}</ul>
    </section>`;
  }
  pickupSection(atEp) {
    injectCss();
    const rows = this.pickups(atEp);
    const li = (r) => `<li class="ride${r.free ? ' free' : ''}${r.short && !r.takesAll ? ' short' : ''}" data-ep="${r.by}">
        <span class="epno" title="Entry point ${r.by}"><small>EP</small>${r.by}</span>
        <div class="to"><b>${esc(r.name)}</b><span>${esc(r.lake)} · ${miWords(r.km)} mi · a wait of ${rideTime(r.hours)}${r.takesAll ? ' · what you have' : ''}</span></div>
        <div class="go"><b class="fare">${r.free || this.sandbox ? 'free' : `$${r.price}`}</b><button type="button" class="stamp small" data-act="pickup" data-id="${r.by}"${(r.short && !r.takesAll) || this.busy ? ' disabled' : ''}>Call</button></div>
      </li>`;
    return `<section class="rides pickups" aria-labelledby="pickup-h">
      <div class="top"><h3 id="pickup-h">Call a pickup</h3><span class="sum">to their door, the canoe on the roof</span></div>
      <ul>${rows.map(li).join('')}</ul>
    </section>`;
  }
  // The phase-1 counter (no rides section of its own): the section goes at the foot of the wall column. A counter that
  // renders `.rides` itself is left alone.
  attachCounter() {
    const o = this.outfitter;
    if (!o || o.ridesShim) return;
    o.ridesShim = true;
    const render = o.render.bind(o);
    o.render = (...args) => {
      const out = render(...args);
      const el = o.el && o.el.panel;
      if (!o.open || !o.at || !el || el.querySelector('.rides')) return out;
      const wall = el.querySelector('.wall'); if (!wall) return out;
      const box = document.createElement('div');
      box.innerHTML = this.section(o.at.ep, { shim: true });
      wall.appendChild(box.firstElementChild);
      return out;
    };
    const panel = o.el && o.el.panel;
    if (panel) panel.addEventListener('click', (e) => {
      const b = e.target.closest('.rides[data-shim] button[data-act="ride"]');
      if (b && !b.disabled) this.act(b.dataset.id);
    });
  }
}

// --- the look: Paper, like the board and the permit ---------------------------------------------------------------
const CSS = `
#outfitter .rides { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--edge-deep); padding-top: 12px; min-height: 0; flex: none; }
#outfitter .rides .top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; border: none; padding: 0; }
#outfitter .rides h3 { margin: 0; }
#outfitter .rides .sum { font-size: 13px; font-style: italic; color: var(--ink-soft); }
#outfitter .rides p.soft { margin: 0; font-size: 13.5px; line-height: 1.35; font-style: italic; color: var(--ink-soft); }
#outfitter .rides ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; max-height: 236px; overflow: auto; scrollbar-width: thin; }
#outfitter .rides.pickups ul { max-height: 380px; }
#outfitter .desk.pickup .rides { border-top: none; padding-top: 0; }
#outfitter .rides li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: 1px solid var(--edge); border-radius: 2px; background: var(--paper-card); }
#outfitter .rides li.th { padding: 4px 8px; }
#outfitter .rides li.th .epno { opacity: .8; }
#outfitter .rides li.new, #outfitter .rides li.free { border-left: 3px solid var(--map-red); }
#outfitter .rides li.short { opacity: .62; }
#outfitter .rides .to { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto; }
#outfitter .rides .to b { font: 600 14.5px/1.2 var(--serif); color: var(--ink); }
#outfitter .rides li.th .to b { font-weight: 500; font-size: 13.5px; }
#outfitter .rides .to span { font-size: 12.5px; line-height: 1.3; color: var(--ink-soft); }
#outfitter .rides .to i { color: var(--map-red); font-style: italic; }
#outfitter .rides .to i.o { color: var(--ink-soft); }
#outfitter .rides .go { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex: none; }
#outfitter .rides .fare { font: 500 21px/0.95 var(--pencil-font); color: var(--pencil); }
#outfitter .rides .stamp.small { font-size: 10.5px; padding: 4px 10px; }
`;
let cssIn = false;
function injectCss() {
  if (cssIn || typeof document === 'undefined') return;
  cssIn = true;
  const s = document.createElement('style'); s.id = 'rides-css'; s.textContent = CSS;
  document.head.appendChild(s);
}
