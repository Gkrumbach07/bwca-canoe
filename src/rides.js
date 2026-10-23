// Rides up the road (hubs phase 2, stream C): fast travel between the outfitters, by truck, from a counter. About half
// the entry points are not joined to another by water within a dozen portages, so the road is how a season reaches
// them. From any counter the truck goes to the outfitters you know, and up the road to the nearest one you don't (on
// the same road while there is one, else the nearest anywhere); arriving makes that one known. No rides from the wild.
//
// A ride costs money and game time: the road is about 1.4 × the straight line, the time 0.5 h + km / 40, the price
// $5 + $0.50 a km, rounded to $5. The canoe rides on the roof and the packs in the back: you arrive afloat at the
// landing with everything (the same teleport as an evacuation), and that counter opens. A ride that would get in
// after 21:00 (or before 5:00) ends in a bunk night there, with breakfast, and you are up at 7:30. During a trip the
// trip goes on; between trips you push off from where the truck left you. Sandbox: free and instant.
//
//   rides.offer(fromEp) → [{ ep, name, place, lake, road, km, hours, price, unknown, late }]   (the unknown one first)
//   rides.quote(fromEp, toEp) → { km, hours, price }
//   rides.take(ep) → false (refused: short of money, a ride under way, not offered from here) | Promise (arrived)
//   rides.act(id), rides.section(ep) → the counter's "Ride up the road" (buttons data-act="ride" data-id="<ep>")
//   rides.attachCounter(): the phase-1 counter gets the section in its wall column, until a counter renders it itself
//
// It hides the counter itself before the fade (so the counter's own close afterwards does nothing), and on arrival
// sets outfitter.arrivedBy = 'ride' for the counter's greeting (keeperLine(profile, 'ride')).
import { outfitterProfile, keeperLine, roadOf } from './outfitters.js';

export const ROAD = 1.4;          // road km for a km of straight line
const BASE_H = 0.5, KMH = 40;     // the time: half an hour, then 40 km an hour
const BASE_$ = 5, PER_KM = 0.5, ROUND = 5;
const LATE = 21, EARLY = 5, WAKE = 7.5; // a ride in after 21:00 (or before 5:00) is a bunk night, up at 7:30
const AT_COUNTER = 40;            // metres from a landing that count as at its counter, when no counter is open

export function quoteBetween(a, b) {
  const km = (Math.hypot(b.x - a.x, b.z - a.z) * ROAD) / 1000;
  return { km: +km.toFixed(1), hours: +(BASE_H + km / KMH).toFixed(3), price: Math.max(ROUND, Math.round((BASE_$ + PER_KM * km) / ROUND) * ROUND) };
}
// "40 min", "1 h 25"
export function rideTime(h) {
  const m = Math.max(5, Math.round((h * 60) / 5) * 5);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kmWords = (k) => (k < 10 ? k.toFixed(1) : String(Math.round(k)));

export class Rides {
  // { world, outfitter, day, veil, hud, energy, tasks, teleport (x, z) → Promise<bool> }
  constructor({ world, outfitter, day, veil = null, hud = null, energy = null, tasks = null, teleport = null }) {
    this.world = world; this.outfitter = outfitter; this.day = day; this.veil = veil; this.hud = hud; this.energy = energy; this.tasks = tasks;
    this.teleport = teleport || ((x, z) => (outfitter && outfitter.onTeleport ? outfitter.onTeleport(x, z) : Promise.resolve(false)));
    this.busy = false; this.last = null;
    injectCss();
  }
  get profile() { return (this.outfitter && this.outfitter.profile) || null; }
  get core() { return (this.outfitter && this.outfitter.core) || null; }
  get sandbox() { return !!(this.core && this.core.sandbox); }
  landing(ep) { const o = this.outfitter; return o ? o.landings.find((l) => l.ep === Number(ep)) || null : null; }
  knows(ep) { const pr = this.profile; return pr ? pr.knows(ep) : true; }
  note(t, s = 6) { if (this.hud && t) this.hud.note(t, s); }
  // the counter you are at: the open one, else a landing within reach
  here() {
    const o = this.outfitter; if (!o) return null;
    if (o.open && o.at) return this.landing(o.at.ep) || o.at;
    const p = o.player, n = p ? o.nearest(p.x, p.z) : null;
    return n && n.d < AT_COUNTER ? n.l : null;
  }

  quote(fromEp, toEp) { const a = this.landing(fromEp), b = this.landing(toEp); return a && b ? quoteBetween(a, b) : null; }
  // the nearest outfitter you don't know, up the same road while there is one there
  nextUnknown(fromEp) {
    const a = this.landing(fromEp), o = this.outfitter; if (!a || !o) return null;
    const road = roadOf(a.ep);
    let best = null;
    for (const l of o.landings) {
      if (l.ep === a.ep || this.knows(l.ep)) continue;
      const d = Math.hypot(l.x - a.x, l.z - a.z) * (roadOf(l.ep) === road ? 1 : 1e3);
      if (!best || d < best.d) best = { l, d };
    }
    return best ? best.l : null;
  }
  // the rides from a counter: the outfitters you know (every one in Sandbox), and the next unknown one up the road first
  offer(fromEp) {
    const a = this.landing(fromEp), o = this.outfitter; if (!a || !o) return [];
    const row = (l, unknown) => {
      const q = quoteBetween(a, l), h = this.day ? this.day.hours : 12, at = (h + q.hours) % 24;
      return { ep: l.ep, name: l.name, place: l.place, lake: this.world.lakeName ? this.world.lakeName(l.lake) || l.place : l.place, road: roadOf(l.ep), ...q,
        price: this.sandbox ? 0 : q.price, unknown, late: !this.sandbox && (at >= LATE || at < EARLY) };
    };
    const known = o.landings.filter((l) => l.ep !== a.ep && (this.sandbox || this.knows(l.ep))).map((l) => row(l, !this.knows(l.ep))).sort((x, y) => x.km - y.km);
    const next = this.nextUnknown(fromEp);
    return next && !known.some((r) => r.ep === next.ep) ? [row(next, true), ...known] : known;
  }

  // --- taking one ------------------------------------------------------------------------------------------------
  act(id) { return this.take(Number(id)); }
  take(ep) {
    const o = this.outfitter, from = this.here(), to = this.landing(ep), pr = this.profile, core = this.core;
    if (this.busy || !o || !to) return false;
    if (!from) { this.note('The truck goes from an outfitter’s counter. No rides from the wild.'); return false; }
    const r = this.offer(from.ep).find((x) => x.ep === to.ep);
    if (!r) { this.note(`No ride to ${to.name} from here: the truck goes to the outfitters you know, and up the road to the next one.`); return false; }
    if (!this.sandbox && r.price > 0) {
      if (!pr || !pr.spend(r.price, `the ride to ${to.name}`)) { this.note(`The ride to ${to.name} is $${r.price}: not enough in hand.`); if (o.open) o.render(); return false; }
    }
    this.busy = true;
    if (o.open) o.hide(); // the paper goes; the counter's own close after this does nothing
    const fromP = outfitterProfile(from.ep, this.world), toP = outfitterProfile(to.ep, this.world);
    const lake = r.lake || to.place;
    const sub = this.sandbox
      ? `Sandbox: the truck is free and the road takes no time. ${lake}, entry point ${to.ep}.`
      : `${kmWords(r.km)} km up ${r.road === roadOf(from.ep) ? r.road : 'the roads'} to ${lake}, ${rideTime(r.hours)}: $${r.price}. The canoe rides on the roof, the packs in the back.${r.late ? ` It’s late when you get in: a bunk at ${to.name}, and you’re up at half past seven.` : ''}`;
    const card = {
      kicker: `${from.name} → ${to.name}`,
      text: `“${keeperLine(fromP, 'goodbye')}”`,
      sub,
      fadeIn: this.sandbox ? 0.6 : 1.2, hold: this.sandbox ? 0.4 : 3.2, fadeOut: this.sandbox ? 0.8 : 1.8,
      onDark: () => this.arrive(from, to, r, toP),
    };
    const done = () => { this.busy = false; };
    if (this.veil) return this.veil.card(card).then(done, done);
    return Promise.resolve(card.onDark()).then(done, done);
  }
  // at full dark: the move, the clock, the night if it is late, the outfitter known, its counter up
  async arrive(from, to, r, toP) {
    const o = this.outfitter, pr = this.profile, core = this.core, d = this.day, en = this.energy;
    const ok = await this.teleport(to.x, to.z);
    if (!ok) { // the truck could not get through (no open water found at the landing): nothing moves, the fare back
      if (pr && r.price > 0) { pr.s.money += r.price; pr.s.spent -= r.price; pr.entry(r.price, `the ride to ${to.name}, refunded`); pr.changed('money'); }
      this.note(`The road to ${to.name} is closed today. The fare is back in your hand.`);
      o.lineKind = 'welcome'; o.pendingShow = true;
      return false;
    }
    let night = false;
    if (!this.sandbox && d) {
      const h0 = d.hours, at = (h0 + r.hours) % 24;
      if (at >= LATE || at < EARLY) {
        // a bunk night at the far end: the clock to 7:30, a full night's rest, breakfast and a full bottle
        const hours = Math.max(r.hours, (WAKE - h0 + 24) % 24 || 24);
        d.advance(hours);
        night = true;
        if (en) {
          en.sleep(1, Math.max(7, hours - r.hours)); en.value = 1;
          if ('lastHours' in en) en.lastHours = d.hours;
          if ('lastMealAbs' in en) { en.lastMealAbs = en.now; en.lastMealKind = 'hot'; }
          try { if (en.needs && typeof en.needs === 'object') { en.needs.food = 1; en.needs.water = 1; } } catch { /* the needs are energy.js's own */ }
          if (typeof en.fill === 'function') en.fill(2, 0);
        }
      } else d.advance(r.hours);
    }
    // known now (trip.js says so with a note), and the trip's log has the ride
    if (core && typeof core.learn === 'function') core.learn(to.ep); else if (pr) pr.learn(to.ep);
    if (core && typeof core.log === 'function') core.log('ride', { from: from.ep, to: to.ep, km: r.km, hours: r.hours, price: r.price, night });
    if (this.tasks && typeof this.tasks.onEvent === 'function') this.tasks.onEvent({ type: 'arrive', ep: to.ep, by: 'ride' }); // a fetch notice (later) hears it
    this.last = { from: from.ep, to: to.ep, ...r, night, at: d ? { year: d.year, doy: d.doy, hours: +d.hours.toFixed(2) } : null };
    // the counter there opens, the keeper greeting you off the truck (or at breakfast)
    o.lineKind = night ? 'morning' : 'welcome'; o.arrivedBy = night ? 'bunk' : 'ride'; o.pendingShow = true;
    if (typeof o.save === 'function') o.save();
    return true;
  }

  // --- the counter's section --------------------------------------------------------------------------------------
  section(ep, { shim = false } = {}) {
    injectCss();
    const rows = this.offer(ep), money = this.profile ? this.profile.money : Infinity;
    const sum = this.sandbox ? 'Sandbox: free, and no time on the road' : 'canoe on the roof, packs in the back';
    if (!rows.length) {
      return `<section class="rides"${shim ? ' data-shim="1"' : ''} aria-labelledby="rides-h"><div class="top"><h3 id="rides-h">Ride up the road</h3></div>
        <p class="soft">You know every outfitter there is. Nowhere left to drive to but here.</p></section>`;
    }
    const li = (r) => {
      const short = !this.sandbox && r.price > money;
      const meta = [`${esc(r.lake)}`, `${kmWords(r.km)} km`, rideTime(r.hours)];
      return `<li class="ride${r.unknown ? ' new' : ''}${short ? ' short' : ''}">
        <div class="to"><b>${esc(r.name)}</b><span>${meta.join(' · ')}${r.unknown ? ' · <i>new to you</i>' : ''}${r.late ? ' · a bunk night, up at 7:30' : ''}</span></div>
        <div class="go"><b class="fare">${this.sandbox ? 'free' : `$${r.price}`}</b><button type="button" class="stamp small" data-act="ride" data-id="${r.ep}"${short || this.busy ? ' disabled' : ''} aria-label="Ride to ${esc(r.name)}${this.sandbox ? '' : `, $${r.price}`}">Ride</button></div>
      </li>`;
    };
    const next = rows.find((r) => r.unknown && !this.sandbox);
    const lede = next ? `<p class="soft">Up ${esc(next.road)}, the next outfitter you don’t know: ${esc(next.place)}.</p>` : '';
    return `<section class="rides"${shim ? ' data-shim="1"' : ''} aria-labelledby="rides-h">
      <div class="top"><h3 id="rides-h">Ride up the road</h3><span class="sum">${sum}</span></div>
      ${lede}<ul>${rows.map(li).join('')}</ul>
    </section>`;
  }
  // The phase-1 counter (no rides section of its own): the section goes at the foot of the wall column, under the season
  // and what is sold only here, and its buttons take the ride. A counter that renders `.rides` itself is left alone.
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
#outfitter .rides li { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: 1px solid var(--edge); border-radius: 2px; background: var(--paper-card); }
#outfitter .rides li.new { border-left: 3px solid var(--map-red); }
#outfitter .rides li.short { opacity: .62; }
#outfitter .rides .to { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto; }
#outfitter .rides .to b { font: 600 14.5px/1.2 var(--serif); color: var(--ink); }
#outfitter .rides .to span { font-size: 12.5px; line-height: 1.3; color: var(--ink-soft); }
#outfitter .rides .to i { color: var(--map-red); font-style: italic; }
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
