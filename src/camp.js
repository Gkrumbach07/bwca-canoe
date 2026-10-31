import { tentPose } from './props.js';
import { save } from './save.js';
import { clock12, longDate, plural, fmtDays, compassLong, word } from './hud.js';
import { daysInYear } from './astro.js';
import { sheets } from './sheets.js'; // the dusk word names only a site on a sheet you own (fb2 D: owned, not carried)
import { Chores } from './chores.js'; // hubs 3A / camp 2: the fire, the wood, the cooking, the latrine, the wake-time card
import { hold } from './hold.js'; // camp 1: held work, with its ring
import { TentStages, TentGhost, TENT_FLY, kindOf, tentOf } from './tent.js'; // camp 1: the tent in its phases (the A-frame's own, camp join)
import { Hang } from './hang.js'; // camp 1: the barrel hung from a limb
import { inventory as INVENTORY } from './inventory.js';
import { itemDef, isBag } from './items.js';

// Camp and night (the trip core, stream C; redone on the owner's feedback of 2026-10-24: "setting up your camp in your
// own little way"). Nothing at camp happens by itself.
//   - The tent is pitched where you choose (fb2 A: from the book, the owner's second feedback of 2026-10-24: "go into
//     my inventory ... right click and say pitch. Or if it's on the ground, right click and say pitch"). Pitch on the
//     tent in a container in the camp's reach (inventory.campReach) or on the ground (nearby.itemActions) closes the
//     book and puts a ghost tent where the dot meets the ground (pointer.js), its door to you: green on good ground,
//     red where it can't (on rock, on a slope over 12 degrees, among trunks, a log or a stump, on the portage trail, by
//     the fire ring, the bench or the latrine, at the water's edge, outside the site's area in Adventure), the reason
//     on the action line. E or a click there, held (hold.js), and it goes up phase by phase (tent.js): the footprint
//     staked, the poles up, the tent up, the rain fly on. Let go and it stops at the phase finished; E or a click
//     again carries on, or its panel in the book does. The tent comes out of its pack when the footprint is staked;
//     the site is yours from then until it is struck.
//   - Your tent is on the dot (wc A, the world cards, the owner's third round of 2026-10-24: "why cant i go in tent and
//     sleep, should be allowed as a way to skip through the day. like witcher i can rest for some part of time to get to
//     certain parts of the day"): pointed at, it has two keys (tentActions, nearby.js): half pitched "E Carry on
//     pitching · hold, Q Strike · hold"; the fly still off "E Put the fly on · hold, Q Rest until…"; up "E Rest until… ·
//     Q Strike · hold". Rest until… opens the dial (RestDial, restDial()): first light, 7:00, 9:00, noon, 4 pm, dusk,
//     10 pm, or any hour by ← →, day or night; a rest that spans no night is a nap (the rest comes back some, less than
//     a night: nap()). The strike runs the phases backwards, back into a container in the camp's reach, or rolled up on
//     the ground if nothing has room. Only the tent with its fly on sleeps best; without the fly a night's rain soaks you.
//   - The barrel is hung from a limb, held, on the dot (hang.js).
//   - Launching strikes nothing, puts out nothing and packs nothing: a note says what is still ashore (the tent, the
//     fire, the barrel hung, the things set out), and it all stays as it is, across reloads, until you come back.
// In Adventure you camp at the designated sites only (hubs phase 1: "that's not allowed, so not even camp"). The night
// gives the bar its rest by the tent (profile.sleepQ / player.gear.sleep; damp gear x0.8, no fly x0.9) and by the hours
// slept (energy.sleep(q, hours)). On foot at the water's edge the book's water panel fills the bottle. An hour
// before sunset, in Adventure, a note names the nearest free site; once it is dark a note suggests the headlamp (H).
// The fire, the firewood, the cooking, the eating and the latrine are chores.js's (camp stream 2), worked from the book
// too (nearby.js), and chores.ashore() names what it leaves burning. Nothing here takes E (pointer.js has it).
//
// The registry says who holds each site: keys are `Math.round(x):Math.round(z)` (the index's sites have no ids). The
// player holds with 'player'; the parties met on the water hold with their own ids, and the player's prompt at a held
// site reads "Taken". Only the player's camp is saved: in trip.state.camp when there is a trip (trip.js), otherwise
// under its own key (save.js 'camp').
//
// What it reads from the other streams, feature-detected: trip (null: sandbox rules), trip.adventure, trip.state (.camp,
// .wet), trip.log; day.advance(hours) (else setClock with the midnight rollover); energy.sleep(q, hours),
// energy.restBoost, energy.fill(litres, waitHours), energy.bottle, energy.live; veil.card({ kicker, text, sub, onDark });
// the profile through camp.profileOf (main.js), trip.profile or __game.profile; the inventory (inventory.js).

export const PLAYER = 'player';
export const campKey = (c) => `${Math.round(c.x)}:${Math.round(c.z)}`;

const SITE_R = 22;          // metres from a site's fire ring within which its prompts are the site's
export const AREA_R = 25;   // and the site's area: what is set out within it is in the camp's reach (inventory.campReach)
const TENT_PANEL = 5;       // fb2 A: metres from the tent's middle within which its panel is in the book
const GHOST_AHEAD = 2.1;    // metres ahead of the walker the ghost tent's middle stands when the dot meets no ground
const GHOST_STILL = [0.35, 1.0]; // seconds standing still before a word of the site shows (the ghost is the book's Pitch now)
const MAX_SLOPE = 12;       // degrees: steeper ground won't take a tent
const BUMPS = 0.2;          // m: ground this far off the footprint's plane is too lumpy
const NEAR_FIRE = 1.4;      // m of clearance from the fire ring's stones to the tent's footprint
const SHOW_TENT = 2500;     // m: a tent farther than this is not drawn (it still stands)
const ASHORE_NOTE = 400;    // m: launching within this of your camp, the note says what is still there
// the chores that still take a moment while the walker holds still (the fire's, the pot's and the wood's are chores.js's)
const CHORES = {
  fill: { seconds: 0.7, hours: 5 / 60, say: 'Filling the bottle…' },
};
const CHORE = { seconds: 1, hours: 0.1, say: 'Working…' }; // any other a stream asks for (chores.js, forage.js)
const LOW_CHORES = new Set(['fill']); // done crouched (canoe.js state.crouch)
const SLEEP_FROM = 1.5;     // hours before sunset the tent will take you
const WAKE_AT = 0.25;       // hours after sunrise you wake
const LATE_NIGHT = 5;       // turning in with fewer hours than this to first light, you sleep in instead:
const SLEEP_IN = 7;         // this many hours,
const SLEEP_IN_BY = 9;      // and up by this hour at the latest (a site reached after midnight still gives a night)
const WORN_OUT = 0.3;       // a rest need under this (the 'tired' mark) lets the tent take you by day too, for SLEEP_IN hours
const NAP_UNDER = 5;        // wc A: a rest shorter than this many hours is a nap, not a night (nap())
const NAP_GAIN = 0.7;       // a nap gives this share of a night's rest for its hours (a 3 h nap about 0.3)
const NAP_NO_BAG = 0.6;     // a nap with no bag in the tent (energy.js NO_BAG_REST)
const NAP_AWAKE = 1.5;      // and takes this many hours off the hours awake for each hour napped (the rest's ceiling)
const TENTS = { aframe: 0.85, 'a-frame': 0.85, dome: 1, fourseason: 1, 'four-season': 1, '4season': 1 }; // sleep quality by the profile's kit.tent
const START_TENT = 0.85;    // the starting kit's A-frame, when there is no profile to ask
const PAD = 0.08;           // a sleeping pad in the tent adds this (the A-frame's 0.92 with a pad is a whole night's rest)
const NO_PAD = 0.88;        // and a night on the bare floor, no pad in the tent, sleeps this much as well
// (the bag: energy.js NO_BAG_REST, a night with no sleeping bag in the tent; the owner, 2026-10-31: the bag and the pad
// count only inside the pitched tent)
const WET = 0.8;            // a night in damp gear sleeps this much as well
const NO_FLY = 0.9;         // and a night with no fly on (dew through the mesh)
const RAINY = new Set(['light-rain', 'rain', 'storm']);
const FILTERS = { tablets: 0.5, pump: 5 / 60, gravity: 5 / 60 }; // game hours before the water is drinkable, by kit.filter
const AT_WATER = 2.5;       // metres from the waterline (world.shoreAt) within which E fills the bottle
const DRY_HOURS = 0.5;      // game hours by a fire that dry wet gear
const REST_SITE = 40;       // metres from a site's centre that count as at a campsite for resting
const lower = (s) => (/^(Duluth|Johnson|Mepps|Rapala|Lazy Ike|[A-Z]-)/.test(String(s)) ? String(s) : String(s).charAt(0).toLowerCase() + String(s).slice(1)); // "A-frame", "the Duluth #3" keep their capitals
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const listOf = (a) => (a.length <= 1 ? a[0] || '' : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const thingName = (d) => (d ? (/^(Duluth|Johnson|Blue)/.test(d.name) ? d.name.replace(/^Blue barrel.*/, 'blue barrel') : lower(d.name)) : 'thing');
// a grid's things as they are said, the same ones counted together: ['the foam pad', 'three pieces of firewood']
function entryNames(grid) {
  const by = new Map();
  for (const e of grid) { const d = itemDef(e.id); if (!d) continue; const n = thingName(d); by.set(n, (by.get(n) || 0) + (e.box ? 1 : e.qty || 1)); }
  const many = (n) => (/ of /.test(n) ? n.replace(/^(\S+?)s?( of )/, '$1s$2') : /s$/.test(n) ? n : `${n}s`); // ("pieces of birch bark")
  return [...by].map(([n, q]) => (q > 1 ? `${word(q)} ${many(n)}` : `the ${n}`));
}

export class CampRegistry {
  constructor(world) {
    this.world = world;
    this.holders = new Map(); // key -> holder id
    this.onChange = null;     // (key, holder or null) after a claim or a release
    this._sites = null;
    // round A-F: the parties (parties.js). spoken(key): a party lands there later today, so nearestFree (the dusk note's
    // free site) leaves it be; it is not held, and a tent of yours pitched there first sends them on to another site
    this.spoken = null;
  }
  // round A-F: the keys a holder whose id starts with `prefix` holds ('party:' for every party's camp)
  heldBy(prefix) { const out = []; for (const [k, h] of this.holders) if (String(h).startsWith(prefix)) out.push(k); return out; }
  key(site) { return campKey(site); }
  // the world's site under a key, or null
  site(key) {
    if (!this._sites) { this._sites = new Map(); for (const c of this.world.campsites) this._sites.set(campKey(c), c); }
    return this._sites.get(key) || null;
  }
  claim(key, holder) {
    const h = this.holders.get(key);
    if (h === holder) return true;
    if (h) return false;
    this.holders.set(key, holder);
    if (this.onChange) this.onChange(key, holder);
    return true;
  }
  // let a site go (only if `holder` holds it, when given)
  release(key, holder = null) {
    if (!this.holders.has(key) || (holder && this.holders.get(key) !== holder)) return false;
    this.holders.delete(key);
    if (this.onChange) this.onChange(key, null);
    return true;
  }
  holder(key) { return this.holders.get(key) ?? null; }
  isFree(key) { return !this.holders.has(key); }
  // the nearest site no one holds within r metres: { site, key, d } or null
  // (ok(site): only the sites it passes, such as the ones the map shows)
  nearestFree(x, z, r = Infinity, ok = null) {
    let best = null;
    for (const c of this.world.campsites) {
      const dx = c.x - x, dz = c.z - z;
      if (dx > r || dx < -r || dz > r || dz < -r) continue;
      const d = Math.hypot(dx, dz);
      if (d < r && (!best || d < best.d)) { const key = campKey(c); if (this.isFree(key) && !(this.spoken && this.spoken(key)) && (!ok || ok(c))) best = { site: c, key, d }; }
    }
    return best;
  }
}

// --- the Rest-until dial (wc A) --------------------------------------------------------------------------------------
// A small paper slip over the camp, as the wake-time card was (chores.js): E at the pitched tent opens it. Seven times
// to pick from (first light, 7:00, 9:00, noon, 4 pm, dusk, 10 pm) or any hour by ← →, day or night; the line under says
// how long that is and whether it is a nap or a night. E, Enter or the stamp rests; Esc (or Q, or a step away) lets it
// be. Its keys are taken in the capture phase, ahead of the game's and the pause card's.
const DIAL_CSS = `
#rest-dial { left: 50%; margin-left: -270px; bottom: 112px; width: 540px; padding: 15px 20px 13px; display: flex; flex-direction: column; gap: 10px; z-index: 6; }
#rest-dial .kick { font-size: 11.5px; letter-spacing: .16em; }
#rest-dial h4 { margin: 0; font: 500 24px/1.1 var(--serif); color: var(--ink); display: flex; align-items: baseline; gap: 14px; }
#rest-dial h4 .hour { margin-left: auto; font: 500 22px/1.1 var(--serif); color: var(--ink); display: inline-flex; align-items: center; gap: 10px; }
#rest-dial h4 .hour kbd { font-size: 11px; padding: 1px 6px; min-width: 18px; color: var(--ink-soft); border-color: var(--edge); }
#rest-dial h4 .hour b { min-width: 86px; text-align: center; font-weight: 500; }
#rest-dial .row { display: flex; gap: 7px; }
#rest-dial .opt { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 7px 4px 6px; border: 1.5px solid var(--edge); border-radius: 3px; background: transparent; color: var(--ink-soft); cursor: pointer; min-width: 0; }
#rest-dial .opt b { font: 600 16.5px/1.15 var(--serif); color: var(--ink); white-space: nowrap; }
#rest-dial .opt span { font: 700 10.5px/1.3 var(--sc); letter-spacing: .08em; white-space: nowrap; }
#rest-dial .opt.on { background: var(--ink); border-color: var(--ink); color: var(--paper-card); }
#rest-dial .opt.on b { color: var(--paper); }
#rest-dial .sub { font: italic 15.5px/1.3 var(--serif); color: var(--ink-soft); min-height: 1.3em; margin: 0; }
#rest-dial .keys { display: flex; align-items: center; gap: 7px; font: 700 11px/1.3 var(--sc); letter-spacing: .1em; color: var(--ink-soft); }
#rest-dial .keys .stamp { margin-left: auto; }
`;
let dialCss = false;
// the dial's keys ahead of the title's Escape and everyone else's: a capture listener made now, at load (as cards.js
// does), since title.js's own capture listener would otherwise fire first and open the pause card over the dial (the
// join, 2026-10-24)
let dialUp = null;
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => { if (dialUp && dialUp.isOpen) dialUp.onKey(e); }, true);
class RestDial {
  constructor() {
    if (!dialCss && typeof document !== 'undefined') { dialCss = true; const s = document.createElement('style'); s.id = 'rest-dial-css'; s.textContent = DIAL_CSS; document.head.appendChild(s); }
    dialUp = this;
    const el = this.el = document.createElement('div');
    el.id = 'rest-dial'; el.className = 'paper'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Rest until');
    el.innerHTML = '<div class="sc kick"></div><h4>Rest until <span class="hour"><kbd>←</kbd><b></b><kbd>→</kbd></span></h4><div class="row" role="radiogroup" aria-label="Rest until"></div><p class="sub"></p>'
      + '<div class="keys"><kbd>←</kbd><kbd>→</kbd> any hour <kbd>E</kbd> rest <kbd>Esc</kbd> not yet<button type="button" class="stamp small" data-go="1">Rest</button></div>';
    document.body.appendChild(el);
    this.kick = el.querySelector('.kick'); this.row = el.querySelector('.row'); this.sub = el.querySelector('.sub'); this.hourEl = el.querySelector('.hour b');
    this.isOpen = false; this.at = 7; this.opts = []; this.onPick = null; this.onClose = null; this.words = null;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-go]')) { this.confirm(); return; }
      const h = e.target.closest('.hour kbd'); if (h) { this.step(h.textContent === '←' ? -1 : 1); return; }
      const b = e.target.closest('button[data-i]');
      if (b) { this.set(this.opts[+b.dataset.i].at); if (e.detail >= 2) this.confirm(); }
    });
  }
  onKey(e) {
    if (!this.isOpen) return;
    const c = e.code;
    if (c === 'ArrowLeft' || c === 'KeyA') this.step(-1);
    else if (c === 'ArrowRight' || c === 'KeyD') this.step(1);
    else if (c === 'KeyE' || c === 'Enter' || c === 'Space') { if (!e.repeat) this.confirm(); }
    else if (c === 'Escape' || c === 'KeyQ' || c === 'Backspace') this.close();
    else { if (!/^(Shift|Control|Alt|Meta|Tab)/.test(c)) this.close(); return; } // a step away (W), the map: the dial goes
    e.preventDefault(); e.stopImmediatePropagation();
  }
  get open() { return this.isOpen; }
  // opts: [{ label, small, at (the hour) }]; at: the hour chosen to begin with; words(at) → the line under
  show({ kicker, opts, at, words, onPick, onClose = null }) {
    this.opts = opts; this.onPick = onPick; this.onClose = onClose; this.words = words;
    this.kick.textContent = kicker || 'Rest';
    this.row.innerHTML = opts.map((o, k) => `<button type="button" class="opt" role="radio" data-i="${k}"><b>${esc(o.label)}</b><span>${esc(o.small)}</span></button>`).join('');
    this.isOpen = true;
    this.set(at);
    this.el.classList.add('show');
  }
  // the hour by one, whole hours (first light and dusk are not on the hour: a step from them goes to the next whole one)
  step(d) { const h = this.at, w = d > 0 ? Math.floor(h + 1e-6) + 1 : Math.ceil(h - 1e-6) - 1; this.set(((w % 24) + 24) % 24); }
  set(at) {
    this.at = at;
    [...this.row.children].forEach((b, k) => { const on = Math.abs(this.opts[k].at - at) < 0.01; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    this.hourEl.textContent = clock12(at);
    this.sub.textContent = this.words ? this.words(at) : '';
  }
  confirm() { if (!this.isOpen) return; const at = this.at, f = this.onPick; this.hide(); if (f) f(at); }
  close() { if (!this.isOpen) return; const f = this.onClose; this.hide(); if (f) f(); }
  hide() { this.isOpen = false; this.el.classList.remove('show'); }
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The night card when no veil (veil.js) is there to show it: deep, a kicker, a line, a sub, faded per frame.
class NightCard {
  constructor() {
    const el = this.el = document.createElement('div');
    el.id = 'night-card';
    el.setAttribute('aria-live', 'polite');
    Object.assign(el.style, { position: 'fixed', inset: '0', background: 'var(--deep, #10161d)', opacity: '0', pointerEvents: 'none', zIndex: '7', display: 'none', alignItems: 'center', justifyContent: 'center', color: 'var(--cream, #f3ecdd)', fontFamily: 'var(--sans, sans-serif)', textAlign: 'center', padding: '0 8vw' });
    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:22px;max-width:760px"><div class="sc" style="font-size:13px;letter-spacing:.22em;color:rgba(243,236,221,.72)"></div><p style="font:italic 30px/1.45 var(--serif, serif);margin:0"></p><p style="margin:8px 0 0;font-size:16px;color:rgba(243,236,221,.66)"></p></div>';
    const [k, t, s] = el.querySelectorAll('.sc, p');
    this.k = k; this.t = t; this.s = s;
    document.body.appendChild(el);
    this.run = null;
  }
  get active() { return !!this.run; }
  show({ kicker, text, sub, fadeIn = 1.4, hold = 2.5, fadeOut = 2.2, onDark }) {
    this.k.textContent = kicker || ''; this.t.textContent = text || ''; this.s.textContent = sub || '';
    this.el.style.display = 'flex';
    return new Promise((resolve) => { this.run = { t: 0, fadeIn, hold, fadeOut, onDark, dark: false, ready: false, held: 0, resolve }; });
  }
  update(dt) {
    const r = this.run;
    if (!r) return;
    let o;
    if (!r.dark) {
      r.t += dt; o = Math.min(1, r.t / r.fadeIn);
      if (o >= 1) { r.dark = true; Promise.resolve(r.onDark ? r.onDark() : null).then(() => { r.ready = true; }, () => { r.ready = true; }); }
    } else if (!r.ready || r.held < r.hold) { r.held += dt; o = 1; }
    else {
      r.out = (r.out || 0) + dt; o = 1 - Math.min(1, r.out / r.fadeOut);
      if (o <= 0) { this.el.style.display = 'none'; this.run = null; r.resolve(); }
    }
    this.el.style.opacity = String(o * o * (3 - 2 * o));
  }
}

export class Camp {
  // { world, player, day, energy, hud, scene, tiles, fires, lamp, audio, weather, wind, fishing, outfitter, registry,
  //   links }. links: () => ({ trip, veil, packs }), read on the first frame (main.js may make them after the camp;
  //   any of them may be missing: then the sandbox, the camp's own night card, no packs).
  constructor(o) {
    Object.assign(this, { trip: null, veil: null, packs: null, weather: null, fishing: null, outfitter: null, audio: null, wind: null, lamp: null, fires: null, links: null, inventory: INVENTORY }, o);
    this.registry = o.registry || new CampRegistry(this.world);
    this.tiles.dynamic = this.tiles.dynamic || [];
    this.camp = null;         // your tent: { key, site, x, z, fdx, fdz, since, stage (1-4), item, from, colour, stages, pose, obstacle, y }
    this.draft = null;        // a pitch begun, before the footprint is staked: { spot, stages }
    this.pool = [new TentStages(this.scene, 'aframe', TENT_FLY.aframe)]; // one now, behind the title card; more as they are wanted
    this.ghost = new TentGhost(this.scene);
    this.busy = null;         // a chore under way: { t, passed, kind, done }
    this.night = null;        // sleeping: { kind, q, hours, ... }
    this.card = null;         // the fallback night card (NightCard), made on first use
    this.dial = null;         // wc A: the Rest-until dial (RestDial), made on first use
    this.lastMode = null; this.booted = false; this.pending = null;
    this.still = 0; this.dry = 0; this.lastNow = null;
    this.nudged = null; this.lampHinted = null;
    this.profileOf = null;    // () => the profile (stream A), set by main.js
    this.restT = 0; this.atSite = false;
    this.area = null; this.areaT = 0; // the camp's reach where you stand (reachArea), every quarter second
    this.spot = null;         // the ghost's last reading: { x, z, fdx, fdz, pose, ok, why, t, site, kind }
    this.pitching = null;     // fb2 A: a Pitch from the book under way: { uid, item, x, z } (the ghost follows the dot)
    this.pointer = null;      // fb2 A: pointer.js (main.js): where the dot meets the ground
    this.morningNote = null;  // a line for the morning (rain through the mesh; a bear says its own: bear.js)
    this.bear = this.bear || null; // cons A: bear.js (main.js), asked at bedtime and at waking
    hold.attach({ input: this.player.input, day: this.day, player: this.player });
    this.hang = new Hang(this, { inventory: this.inventory });
    this.chores = new Chores(this); // the fire, the wood, the pot, the latrine, the wake-time card (main.js sets .tasks)
  }

  // --- what the other streams give, or the sandbox -----------------------------------------------------------
  get adventure() { return !!(this.trip && this.trip.adventure); }
  get sandbox() { return !this.adventure; }
  get state() { return this.trip && this.trip.state ? this.trip.state : null; }
  get wet() { const s = this.state; return !!(s && s.wet); }
  get now() { return this.day.doy * 24 + this.day.hours; }
  get dark() { return this.day.elevation < -3; }
  get inv() { const i = this.inventory; return i && i.attached ? i : null; }
  log(kind, data) { if (this.trip && this.trip.log) this.trip.log(kind, data); }
  note(text, seconds) { if (this.hud && text) this.hud.note(text, seconds); }
  // the clock forward by h hours, as a jump (day.advance), or by hand over midnight
  jump(h) {
    const d = this.day;
    if (d.advance) { d.advance(h); return; }
    let hours = d.hours + h, days = 0;
    while (hours >= 24) { hours -= 24; days++; }
    d.setClock(d.year, d.doy + days, hours);
  }
  // a little time passing, not a jump (a chore's minutes, spread over its frames)
  pass(h) {
    const d = this.day;
    if (h <= 0) return;
    if (d.hours + h < 24) d.hours += h;
    else d.setClock(d.year, d.doy + 1, d.hours + h - 24);
  }
  // the trip's calendar day for day-of-year doy (1 on the day it was put in), or 0 with no trip under way
  tripDay(doy) {
    const o = this.outfitter, t = o && o.trip;
    if (!t || !t.active || t.startDoy == null) return 0;
    let n = doy - t.startDoy;
    if (n < -180) n += daysInYear(t.startYear || this.day.year);
    return Math.max(1, n + 1); // never before the put-in (Sandbox can set the date back)
  }
  siteName(site) {
    // d1 names: the Forest Service's number and lake or bay (names.js): "Campsite · Basswood Lake – Back Bay #91"
    if (site.usfs != null && site.official) return `Campsite · ${site.official} #${site.usfs}`;
    const id = this.player.nearWater ? this.player.nearWater(site.x, site.z, 6) : 0;
    return site.name ? `${site.name} campsite` : `Campsite${id ? ' · ' + (this.world.lakeName(id) || 'unnamed water') : ''}`;
  }

  // --- the camp's reach (inventory.campReach) ------------------------------------------------------------------
  // The area you are at, on foot: a site's (AREA_R round its fire ring, while it is free or yours), or round your own
  // tent pitched off a site (Sandbox): { x, z, r, key, site } or null. Read every quarter second (update).
  reachArea() {
    const p = this.player;
    if (!p || !p.onFoot) return null;
    // asked before the first frame's reading (a reload's "Back ashore" note, outfitter.boot): read it now
    if (!this.areaRead) { this.areaRead = true; this.area = this.areaAt(p.x, p.z); }
    return this.area;
  }
  areaAt(x, z, r = AREA_R) {
    const site = this.nearestSite(x, z, r, true);
    if (site) {
      const key = campKey(site), h = this.registry.holder(key);
      if (h && h !== PLAYER) return null;
      return { x: site.layout.fire.x, z: site.layout.fire.z, r: AREA_R, key, site };
    }
    const c = this.camp;
    if (c && !c.key && Math.hypot(c.x - x, c.z - z) < r) return { x: c.x, z: c.z, r: AREA_R, key: null, site: null };
    return null;
  }

  // --- the frame ----------------------------------------------------------------------------------------------
  // before player.update: the walker holds still while a held job runs (hold.js), a chore's moment passes, the night
  // card or the wake-time card is up (← → at the tent open that card, and stream 2's sit and eat: chores.before)
  before() {
    const ch = this.chores;
    if (ch && !this.busy && !this.night) ch.before();
    hold.before();
    if (this.busy || (this.card && this.card.active) || this.dialOpen) this.player.input.paused = true;
  }
  get dialOpen() { return !!(this.dial && this.dial.open); }

  // after player.update (and the outfitter's prompt): the camp's keys and prompts. dt: real seconds.
  update(dt) {
    const p = this.player, now = this.now;
    const dh = this.lastNow === null ? 0 : Math.min(0.5, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    if (!this.booted) {
      this.booted = true; this.lastMode = p.mode;
      if (this.links) { const l = this.links() || {}; this.trip = l.trip || null; this.veil = l.veil || null; this.packs = l.packs || null; }
      // a trip that ends (an evacuation, the end at a counter, abandoned) takes the tent down with it, quietly
      if (this.trip && this.trip.on) for (const k of ['exit', 'evac']) this.trip.on(k, () => this.leave({ quiet: true }));
      this.restore();
    }
    if (this.card) this.card.update(dt);
    if (p.teleporting) { hold.update(dt); this.ghost.park(); return; }
    this.restorePending();
    if ((this.areaT -= dt) <= 0) { this.areaT = 0.25; this.area = p.onFoot ? this.areaAt(p.x, p.z) : null; this.areaRead = true; }
    // launching leaves the camp as it stands: a word of what is still ashore
    if (this.lastMode !== 'paddle' && p.mode === 'paddle' && this.lastMode !== null) this.leaving();
    this.lastMode = p.mode;
    if (this.lamp && this.player.input.pressed('KeyH')) this.lamp.toggle();
    this.rest(dt, dh);
    if (this.chores) this.chores.update(dt); // camp 2: the fire, the wood, the pot, the latrine (it sets its own prompts)
    hold.update(dt);                          // camp 1: a held job, its ring on the action line
    this.hang.update();                       // the limbs and ropes of the barrels hung
    this.drawTent();
    const cs = p.canoe && p.canoe.state; // down on your heels for the low chores (canoe.js state.crouch)
    if (cs) cs.crouch = (this.busy && (LOW_CHORES.has(this.busy.kind) || (this.busy.spec && this.busy.spec.crouch)) && p.mode === 'walk') || (hold.active && hold.active.crouch) ? 1 : 0;
    if (this.morningNote && !this.night && !(this.veil && this.veil.active)) { this.note(this.morningNote, 9); this.morningNote = null; }
    if (this.busy) { this.ghost.park(); this.working(dt); return; }
    if (this.night || hold.active) { this.ghost.park(); return; }
    if (this.dialOpen) { this.ghost.park(); p.prompt = null; return; } // the dial holds the keys
    this.notes();
    this.still = Math.abs(p.speed) < 0.15 ? this.still + dt : 0;
    this.prompts();
  }

  // the rest boost (energy.js): x3 at a campsite, x4 by a burning fire; a fire dries wet gear in half an hour
  rest(dt, dh) {
    const p = this.player, e = this.energy, f = this.fires && this.fires.near;
    const byFire = !!(f && f.heat > 0.05 && Math.hypot(f.x - p.x, f.z - p.z) < 6);
    if ((this.restT -= dt) <= 0) { this.restT = 0.5; this.atSite = !!this.nearestSite(p.x, p.z, REST_SITE, false); }
    e.restBoost = byFire ? 4 : this.atSite ? 3 : 1;
    if (this.wet && byFire) {
      this.dry += dh;
      if (this.dry >= DRY_HOURS) { this.state.wet = false; this.dry = 0; this.note('Your gear is dry by the fire.'); this.persist(); }
    } else if (!this.wet) this.dry = 0;
  }

  // fb5 E: the evening's words ("an hour of light left", the nearest free site) and the headlamp's at dark are the
  // teaching moments now (hints.js: 'evening' two hours before sunset, 'dusk' at 45 min, 'lamp' once it is dark), the
  // full line the first time and a short one after; nothing is said here
  notes() {}

  // --- prompts --------------------------------------------------------------------------------------------------
  // fb2 A: nothing at camp is done on E (E is the pointer's: pick up, talk, open, get in; the jobs are the book's,
  // nearby.js). What is left here: the tent's ghost while a Pitch from the book is under way (at the dot, E or a click
  // and hold), the barrel's hang armed the same way (hang.js), and a few words where you stand.
  say(text) { this.player.prompt = { key: null, text }; }

  prompts() {
    const p = this.player;
    this.ghostOn = false;
    if (this.pitching) this.aimPitch();
    else if (this.hang.armed) this.hang.aim();
    else if (!p.input.paused) this.sitePrompts();
    if (!this.ghostOn) this.ghost.park();
  }
  // a word at a site, standing a moment, when no one has a key on the line: taken by another party, your tent elsewhere
  sitePrompts() {
    const p = this.player;
    if (p.mode !== 'walk' || this.still < GHOST_STILL[0]) return;
    if (p.prompt && (p.prompt.key || /<kbd>/.test(p.prompt.text || ''))) return; // the canoe's Q, a fetch
    const site = this.nearestSite(p.x, p.z, SITE_R, true);
    if (!site) return;
    const key = campKey(site), holder = this.registry.holder(key), c = this.camp;
    if (holder && holder !== PLAYER) this.say(`${this.siteName(site)} · Taken: another party is camped here`);
    else if (c && c.key !== key) this.say(`${this.siteName(site)} · ${this.tentAway(c)}`);
  }

  // --- the bottle (hubs 1B) --------------------------------------------------------------------------------------
  // On foot at the water's edge, on an Adventure under way, with the bottle down a little: the book's water panel fills
  // it (nearby.js; it was E). { left, wait, words } or null where it can't be filled here.
  bottleHere() {
    const p = this.player, e = this.energy, w = this.world;
    if (p.mode !== 'walk' || !e || !e.fill || !e.live || e.bottle > 2 - 0.05) return null;
    const f = p.forward, edge = w.shoreAt(p.x, p.z) <= AT_WATER || w.shoreAt(p.x + f.x * 1.6, p.z + f.z * 1.6) < 0;
    if (!edge) return null;
    const wait = this.filterWait(), left = e.bottle <= 0.02 ? 'dry' : `${e.bottle.toFixed(1)} L left`;
    // (the fb3 join: a tablet only from the tablets in reach, energy.fill; the tube left in the pack by the fire says so
    // here, before the bottle is filled with lake water as it comes)
    // (crafting, 2026-10-31: no tablet goes in by itself: lake water as it comes, treated after by choice)
    return { left: e.bottle, wait, words: `${left} · ${wait >= 0.25 ? 'lake water as it comes' : 'through the filter, a few minutes'}` };
  }
  fillBottle(wait = this.filterWait()) {
    if (this.energy.bottle >= 2 - 0.001) { this.note('The bottle is full.'); return; }
    this.chore('fill', () => this.filled(wait));
  }
  filled(wait) {
    // (crafting, 2026-10-31: the tablet's wait means no filter: lake water as it comes, the bottle's Treat it after)
    const raw = wait >= 0.25 && typeof this.energy.fillRaw === 'function';
    const got = raw ? this.energy.fillRaw(2) : this.energy.fill(2, wait);
    if (this.audio && this.audio.paddleDip) this.audio.paddleDip();
    if (got <= 0) { this.note('The bottle is full.'); return; }
    if (raw) { this.note('Filled with lake water, untreated.'); return; }
    if (wait >= 0.25 && !(this.energy.treating > 0.001) && !this.energy.sandbox) return; // no tablet in reach: energy.fill has said so
    this.note(wait >= 0.25 ? 'You fill the bottle and drop in a tablet.' : 'You pump the bottle full. Drinkable in a few minutes.'); // (fb5 join: the wait is the treating moment's, once; the bottle's tooltip has its timer)
  }
  // the profile (stream A), wherever it is to be had
  get profile() {
    const f = this.profileOf, g = typeof window !== 'undefined' ? window.__game : null;
    return (f && f()) || (this.trip && this.trip.profile) || (g && g.profile) || null;
  }
  kitOf(slot) { const pr = this.profile, k = pr && pr.kit ? pr.kit[slot] : null; return k ? String(k).toLowerCase() : ''; }
  // how well the tent sleeps (0 to 1): the profile's own word for it (profile.sleepQ), else the kit's tent and a pad
  tentQuality() {
    const k = this.kitOf('tent'), pr = this.profile, g = this.player.gear;
    if (g && Number.isFinite(g.sleep)) return Math.max(0, Math.min(1, g.sleep)); // hubs 2B: the tent and the pad (shop.js player.gear)
    if (pr && Number.isFinite(pr.sleepQ)) return Math.max(0, Math.min(1, pr.sleepQ));
    const q = k ? (TENTS[k] ?? (/four|dome/.test(k) ? 1 : START_TENT)) : START_TENT;
    return Math.min(1, q);
  }
  // What is in your tent to sleep on (inventory.js: the tent as a container), or on you to take in: { bag, pad } (the
  // defs, or null). The owner,
  // 2026-10-31: "I want that to be a requirement for getting the benefits of things like the sleeping bag and the sleeping
  // pad". Without an inventory (the tests) both are there.
  tentGear() {
    const inv = this.inv;
    if (!inv) return { bag: itemDef('sleepingbag'), pad: itemDef('pad') };
    let bag = null, pad = null;
    const ON = new Set(['back', 'chest', 'hands', 'pockets']); // (what you carry goes in with you: stowIntoTent)
    for (const c of inv.containers) {
      if (!inv.inTent(c) && !ON.has(inv.rootWhere(c))) continue;
      for (const e of c.grid) {
        if (e.box) continue;
        const d = itemDef(e.id); if (!d) continue;
        if (!bag && (e.id === 'sleepingbag' || isBag(e.id))) bag = d;
        if (!pad && (Number.isFinite(d.pad) || e.id === 'pad' || e.id === 'padair')) pad = d;
      }
    }
    return { bag, pad };
  }
  // the night's quality in the tent as it stands now, before the bag (energy.sleep): the tent, the pad, the fly, damp gear
  nightQuality(fly, rain) {
    const g = this.tentGear(), t = this.tentQuality();
    return (g.pad ? Math.min(1, t + PAD) : t * NO_PAD) * (this.wet ? WET : 1) * (fly ? 1 : NO_FLY) * (rain ? WET : 1);
  }
  // what is missing in the tent for a whole night's rest, in a few words each: ['no sleeping bag in the tent', …]
  tentShort() {
    const g = this.tentGear(), out = [];
    if (!g.bag) out.push('no sleeping bag in the tent');
    if (!g.pad) out.push('no pad in the tent');
    return out;
  }
  // game hours before the water just filled is drinkable: tablets half an hour, a filter a few minutes
  filterWait() { const k = this.kitOf('filter'); return FILTERS[k] ?? (/pump|gravity|filter/.test(k) ? FILTERS.pump : FILTERS.tablets); }

  // your tent standing at another site, in a few words: "your tent is up 1.2 km east, at Lake One #12"
  tentAway(c) {
    const p = this.player, d = Math.hypot(c.x - p.x, c.z - p.z), deg = ((Math.atan2(c.x - p.x, -(c.z - p.z)) * 180) / Math.PI + 360) % 360;
    const far = d < 1000 ? `${Math.max(50, Math.round(d / 50) * 50)} m` : `${(d / 1000).toFixed(1)} km`;
    const id = c.site && p.nearWater ? p.nearWater(c.site.x, c.site.z, 6) : 0, lake = id ? this.world.lakeName(id) : null;
    const at = c.site ? (c.site.usfs != null && c.site.official ? `, at ${c.site.official} #${c.site.usfs}` : c.site.name ? `, at the ${c.site.name} campsite` : lake ? `, at the campsite on ${lake}` : ', at a campsite') : ''; // (d1 names: the site's number)
    return `your tent is ${c.stage >= 4 ? 'up' : 'half pitched'} ${far} ${compassLong(deg)}${at}: strike it there to pitch it here`;
  }
  // the nearest site (within r of its fire ring, or of its centre with layout false) whose tile has built it
  nearestSite(x, z, r, layout = true) {
    let best = null, bd = r;
    for (const c of this.world.campsites) {
      const L = c.layout, cx = layout ? (L ? L.fire.x : NaN) : c.x, cz = layout ? (L ? L.fire.z : NaN) : c.z;
      const dx = cx - x, dz = cz - z;
      if (!(dx < bd && dx > -bd && dz < bd && dz > -bd)) continue;
      const d = Math.hypot(dx, dz);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // --- the tent: where it can go ---------------------------------------------------------------------------------
  // a tent in a container in the camp's reach: { c, e, def } (the kit's own tent first), or null
  tentInReach() {
    const inv = this.inv;
    if (!inv) return null;
    const want = this.kitOf('tent');
    let any = null;
    for (const c of inv.campReach()) for (const e of c.grid) {
      if (e.box) continue;
      const d = itemDef(e.id);
      if (!d || d.slot !== 'tent') continue;
      if (e.id === want) return { c, e, def: d };
      any = any || { c, e, def: d };
    }
    return any;
  }
  // the ghost at (x, z), its door to (fdx, fdz), for a tent item: its pose on the drawn ground and what is wrong with the
  // spot, if anything (kept a moment while nothing moves)
  ghostAt(site, item, x, z, fdx, fdz) {
    if (!this.world.isReady(x, z)) return null;
    const o = this.spot, now = performance.now(), kind = kindOf(item);
    if (o && o.kind === kind && o.site === site && Math.hypot(o.x - x, o.z - z) < 0.04 && Math.abs(o.fdx - fdx) + Math.abs(o.fdz - fdz) < 0.03 && now - o.t < 400) return o;
    const size = tentOf(item).size, pose = tentPose((gx, gz) => this.tiles.groundAt(gx, gz), x, z, fdx, fdz, size);
    const why = this.pitchProblem(x, z, fdx, fdz, site, size);
    this.spot = { x, z, fdx, fdz, pose, ok: !why, why, t: now, site, kind };
    return this.spot;
  }

  // --- the tent: pitched from the book (fb2 A) -----------------------------------------------------------------------
  // The owner, 2026-10-24: "I want to have to go into my inventory. Press the tent what's in my bag and right click and
  // say pitch. Or if it's on the ground, right click and say pitch." Pitch (nearby.itemActions) closes the book and puts
  // the ghost where the dot meets the ground, 1.4 to 4.5 m off, its door to you: green where it can stand, red (and why)
  // where it can't. E or a click there, held, pitches it phase by phase (hold.js: E or the mouse); let go and it stops at
  // the phase finished, and E or a click again carries on. Esc or a right-click stops; so does walking off.
  // The tent entry with uid in the camp's reach (a pack, a pile on the ground): { c, e, def } or null
  tentByUid(uid) {
    const inv = this.inv;
    if (!inv) return null;
    for (const c of inv.campReach()) for (const e of c.grid) if (e.uid === uid && !e.box) { const d = itemDef(e.id); return d && d.slot === 'tent' ? { c, e, def: d } : null; }
    return null;
  }
  // why that tent can't be pitched from here now, or null; site: the one you stand at (or null off one)
  pitchRefused(tent) {
    const p = this.player;
    if (!tent) return 'the tent is not within reach';
    if (p.mode !== 'walk') return 'on foot, ashore';
    if (this.outfitter && this.outfitter.visit) return 'not in an outfitter’s yard';
    if (this.camp) return this.camp.stage >= 4 ? 'your tent is up already: strike it to pitch it elsewhere' : 'your tent stands half pitched: carry on with it, or strike it';
    const site = this.nearestSite(p.x, p.z, AREA_R, true);
    if (this.adventure && !site) return 'only at a campsite in Adventure';
    if (site) { const h = this.registry.holder(campKey(site)); if (h && h !== PLAYER) return 'another party is camped here'; }
    return null;
  }
  // Pitch from the book: the ghost follows the dot until it is placed; { ok, words }
  beginPitch(uid) {
    const tent = this.tentByUid(uid), why = this.pitchRefused(tent);
    if (why) { this.note(`No pitching here: ${why}.`, 4); return { ok: false, words: why }; }
    const p = this.player;
    hold.cancel();
    if (this.hang.armed) this.hang.disarm();
    this.pitching = { uid, item: tent.def.id, x: p.x, z: p.z, placing: false, t: 0 };
    return { ok: true, words: '' };
  }
  cancelPitch(words = null) {
    if (!this.pitching) return false;
    this.pitching = null;
    if (hold.is('tent')) hold.cancel();
    this.ghost.park();
    if (words) this.note(words, 3);
    return true;
  }
  // each frame while pitching (prompts, when no hold runs): the ghost at the dot, and E or the mouse to start the hold
  aimPitch() {
    const P = this.pitching, p = this.player, inp = p.input, c = this.camp;
    const go = () => { const e = inp.pressed('KeyE'), m = inp.pressed('Mouse0'); return e || m; };
    if (p.mode !== 'walk' || p.teleporting || Math.hypot(p.x - P.x, p.z - P.z) > 30) { this.cancelPitch(); return; }
    // placed and let go part way: E or the mouse again at it carries on (the hold's own ring); up, it is done
    if (c && c.item === P.item) {
      if (c.stage >= 4) { this.pitching = null; return; }
      if (Math.hypot(c.x - p.x, c.z - p.z) > 6) { this.cancelPitch(); return; }
      this.say(`Your tent · ${tentOf(c.item).words[c.stage]} &nbsp;·&nbsp; hold <kbd>E</kbd>or click: carry on pitching &nbsp; <kbd>Esc</kbd>stop`);
      if (go()) hold.begin({ ...this.pitchOnOpts(), keys: ['KeyE', 'Mouse0'] });
      return;
    }
    if (c) { this.cancelPitch(); return; }
    const tent = this.tentByUid(P.uid);
    if (!tent) { this.cancelPitch('The tent is not within reach any more.'); return; }
    const site = this.nearestSite(p.x, p.z, AREA_R, true);
    // where the dot meets the ground, held between 1.4 and 4.5 m off; looking up, a couple of metres ahead
    const g = this.pointer && this.pointer.groundHit, f = p.forward;
    let x = p.x + f.x * GHOST_AHEAD, z = p.z + f.z * GHOST_AHEAD;
    if (g) {
      const dx = g.x - p.x, dz = g.z - p.z, d = Math.hypot(dx, dz) || 1, k = Math.max(1.4, Math.min(4.5, d)) / d;
      x = p.x + dx * k; z = p.z + dz * k;
    }
    let fdx = p.x - x, fdz = p.z - z; const fl = Math.hypot(fdx, fdz) || 1; fdx /= fl; fdz /= fl;
    const s = this.ghostAt(site, tent.def.id, x, z, fdx, fdz);
    if (!s) return;
    this.ghost.show(s.pose.matrix, s.ok, s.kind); this.ghostOn = true;
    const name = lower(tent.def.name);
    if (s.ok) {
      this.say(`Pitch the ${name} here &nbsp;·&nbsp; hold <kbd>E</kbd>or click &nbsp; <kbd>Esc</kbd>stop`);
      if (go()) hold.begin({ ...this.pitchOpts(s, tent, site), keys: ['KeyE', 'Mouse0'] });
    } else { this.say(`No tent here · ${s.why} &nbsp;·&nbsp; <kbd>Esc</kbd>stop`); go(); }
  }

  // why a tent of `size` (tent.js TENT_KINDS) can't stand at (x, z) with its door to (fdx, fdz), in a few words, or null
  // when it can
  pitchProblem(x, z, fdx, fdz, site, size = tentOf('aframe').size) {
    const w = this.world, T = this.tiles, p = this.player, TA = size.a, TB = size.b, front = (size.vest || 0) + 0.6;
    const Xx = -fdz, Xz = fdx; // along the tent; (fdx, fdz) across it, to the door
    const pt = (u, v) => [x + Xx * u + fdx * v, z + Xz * u + fdz * v];
    if (this.adventure) {
      if (!site || !site.layout) return 'only at a campsite in Adventure';
      if (Math.hypot(site.layout.fire.x - x, site.layout.fire.z - z) > AREA_R - 2) return 'outside the campsite';
    }
    // the water: every corner and the door well up the bank
    const pts = [];
    for (const u of [-TA, 0, TA]) for (const v of [-TB, 0, TB]) pts.push([u, v, ...pt(u, v)]);
    if (pts.some(([, , px, pz]) => w.shoreAt(px, pz) < 2.2) || w.shoreAt(...pt(0, TB + front)) < 1.2) return 'too near the water';
    // the slope: the plane through the footprint's nine points, and how far the ground strays from it
    const g = pts.map(([u, v, px, pz]) => [u, v, T.groundAt(px, pz)]);
    const mean = g.reduce((s, q) => s + q[2], 0) / g.length;
    let su = 0, sv = 0, suu = 0, svv = 0;
    for (const [u, v, h] of g) { su += u * (h - mean); sv += v * (h - mean); suu += u * u; svv += v * v; }
    const gu = su / suu, gv = sv / svv, deg = (Math.atan(Math.hypot(gu, gv)) * 180) / Math.PI;
    if (deg > MAX_SLOPE) return `too steep, ${Math.round(deg)}°`;
    if (g.some(([u, v, h]) => Math.abs(h - (mean + gu * u + gv * v)) > BUMPS)) return 'too lumpy';
    // the footprint's box, out to the A-frame's vestibule stake in front and its beak behind
    const VEST = size.vest || 0, BACK = size.back || 0;
    const boxDist = (cx, cz) => { const dx = cx - x, dz = cz - z, lu = Math.abs(dx * Xx + dz * Xz) - TA, dv = dx * fdx + dz * fdz, lv = dv > 0 ? dv - TB - VEST : -dv - TB - BACK; return Math.hypot(Math.max(0, lu), Math.max(0, lv)); };
    // the site's own things: the fire ring, the bench, the latrine
    if (site && site.layout) {
      const L = site.layout;
      if (boxDist(L.fire.x, L.fire.z) < 0.85 + NEAR_FIRE) return 'too near the fire ring';
      if (L.latrine && boxDist(L.latrine.x, L.latrine.z) < 1.0) return 'on the latrine';
      if (L.bench && boxDist(L.bench.x, L.bench.z) < 1.15) return 'on the bench';
    }
    // the trunks, the rocks, the down logs and the stumps where it would stand (tiles.js treesNear: the walker's own)
    for (const t of T.treesNear(x, z, Math.max(TA, TB + VEST) + 0.8)) {
      if (t.tent) continue;
      if (t.shape) {
        for (const [u, v, h] of g) { const [px, pz] = pt(u * 1.05, v * 1.05); if (t.shape.heightAt(px, pz) > h - 0.04) return t.log ? 'a log in the way' : t.stump ? 'a stump in the way' : 'on rock'; }
        for (const [u, v] of [[-TA / 2, -TB / 2], [TA / 2, -TB / 2], [-TA / 2, TB / 2], [TA / 2, TB / 2]]) { const [px, pz] = pt(u, v); if (t.shape.heightAt(px, pz) > T.groundAt(px, pz) - 0.04) return t.log ? 'a log in the way' : t.stump ? 'a stump in the way' : 'on rock'; }
        continue;
      }
      if (t.box) {
        for (const [u, v] of [[0, 0], [-TA, -TB], [TA, -TB], [-TA, TB], [TA, TB], [0, -TB], [0, TB], [-TA, 0], [TA, 0]]) {
          const [px, pz] = pt(u, v), dx = px - t.x, dz = pz - t.z;
          if (Math.abs(dx * t.ux + dz * t.uz) < t.hx + 0.1 && Math.abs(-dx * t.uz + dz * t.ux) < t.hz + 0.1) return 'something built in the way';
        }
        continue;
      }
      if (boxDist(t.x, t.z) < (t.r || 0.3) + 0.15) {
        if (site && site.layout && Math.hypot(t.x - site.layout.fire.x, t.z - site.layout.fire.z) < 0.3) return 'too near the fire ring';
        return 'among the trees';
      }
    }
    // a portage trail
    const tr = p.nearestTrail ? p.nearestTrail(x, z, 6) : null;
    if (tr && tr.dist < TB + 0.9) return 'on the portage trail';
    // the canoe lying there
    const d = p.carry && p.carry.drop;
    if (d && boxDist(d.x, d.z) < 1.4) return 'the canoe is in the way';
    return null;
  }
  // --- the tent: pitching and striking ---------------------------------------------------------------------------
  stagesFor(item) {
    const colour = TENT_FLY[item] ?? TENT_FLY.aframe, kind = kindOf(item);
    const i = this.pool.findIndex((s) => s.colour === colour && s.kind === kind);
    return i >= 0 ? this.pool.splice(i, 1)[0] : new TentStages(this.scene, kind, colour);
  }
  // the hold that pitches at the ghost's spot: the footprint (the tent comes out of its pack, the site is yours), the
  // poles, the tent, the fly
  pitchOpts(spot, tent, site) {
    const p = this.player, K = tentOf(tent.def.id);
    return {
      id: 'tent', label: 'Pitching the tent', phases: K.pitch, at: 0, clock: false, near: { x: p.x, z: p.z, r: 1.5 },
      onTick: (at) => {
        if (!this.camp && !this.draft) { const st = this.stagesFor(tent.def.id); st.place(spot.pose.matrix); this.draft = { spot, stages: st, item: tent.def.id }; }
        const st = this.camp ? this.camp.stages : this.draft && this.draft.stages;
        if (st) st.set(at);
      },
      onPhase: (i) => {
        if (i === 0) { if (!this.stake(spot, tent, site)) hold.cancel(); return; }
        this.setStage(this.camp, i + 1);
        if (i === 3) this.pitched();
      },
      onStop: (job) => {
        if (!this.camp) { this.dropDraft(); return; }
        this.setStage(this.camp, job.done);
        this.note(`${cap(K.words[job.done])}. ${this.pitching ? 'Hold E or a click to carry on.' : 'Hold E at the tent to carry on.'}`, 3);
      },
    };
  }
  // the hold that carries a half-pitched tent on from where it stands
  pitchOnOpts() {
    const c = this.camp, p = this.player, K = tentOf(c.item);
    return {
      id: 'tent', label: 'Pitching the tent', phases: K.pitch, at: c.stage, clock: false, near: { x: p.x, z: p.z, r: 1.5 },
      onTick: (at) => { if (this.camp === c) c.stages.set(at); },
      onPhase: (i) => { this.setStage(c, i + 1); if (i === 3) this.pitched(); },
      onStop: (job) => { if (this.camp === c) { this.setStage(c, job.done); this.note(`${cap(K.words[job.done])}. ${this.pitching ? 'Hold E or a click to carry on.' : 'Hold E at the tent to carry on.'}`, 3); } },
    };
  }
  // the hold that strikes it, from the stage it stands at back to rolled up and in a pack
  strikeOpts() {
    const c = this.camp, from = c.stage, p = this.player, K = tentOf(c.item);
    return {
      id: 'strike', label: 'Striking the tent', phases: K.strike.slice(4 - from), at: 0, clock: false, near: { x: p.x, z: p.z, r: 1.5 },
      onTick: (at) => { if (this.camp === c) c.stages.set(from - at); },
      onPhase: (i) => { const st = from - (i + 1); if (st <= 0) this.packTent(); else this.setStage(c, st); },
      // (half struck: the panel's Strike takes the rest down, Carry on pitching puts it back up)
      onStop: (job) => { if (this.camp === c) { this.setStage(c, from - job.done); if (job.done > 0) this.note(`${cap(K.words[c.stage])}. Strike takes the rest down; Carry on pitching puts it back up.`, 4); } },
    };
  }
  // the footprint staked: the tent out of its container, the site claimed, the camp begun
  stake(spot, tent, site) {
    const inv = this.inv, key = site ? campKey(site) : null;
    if (key && !this.registry.claim(key, PLAYER)) { this.note('Taken: another party has this site.'); this.dropDraft(); return false; }
    let from = null;
    if (inv) {
      const hit = inv.findUid(tent.e.uid);
      if (!hit) { if (key) this.registry.release(key, PLAYER); this.note('The tent is not to hand any more.'); this.dropDraft(); return false; }
      from = hit.c.id;
      inv.take(hit.c.id, tent.e.uid, 1);
    }
    const st = this.draft ? this.draft.stages : this.stagesFor(tent.def.id);
    this.draft = null;
    const c = { key, site: site || null, x: spot.x, z: spot.z, fdx: spot.fdx, fdz: spot.fdz, since: this.now, stage: 0, item: tent.def.id, from, colour: st.colour, stages: st };
    this.camp = c;
    this.poseTent(c);
    this.setStage(c, 1);
    this.log('camp', { key, x: Math.round(c.x), z: Math.round(c.z), offsite: !key, item: c.item });
    return true;
  }
  pitched() {
    const c = this.camp;
    if (!c) return;
    if (this.audio && this.audio.emit) this.audio.emit('tent-zip', { x: c.x + c.fdx * 0.9, y: (c.y || 0) + 0.5, z: c.z + c.fdz * 0.9 });
    this.note(`The ${lower(itemDef(c.item) ? itemDef(c.item).name : 'tent')} is up, the fly on and staked out.`, 4);
  }
  dropDraft() {
    const d = this.draft;
    if (!d) return;
    d.stages.hide(); this.pool.push(d.stages);
    this.draft = null;
  }
  // the tent's place on the drawn ground (props.js tentPose) and its box for the walker
  poseTent(c) {
    const pose = tentPose((x, z) => this.tiles.groundAt(x, z), c.x, c.z, c.fdx, c.fdz, tentOf(c.item).size);
    c.pose = pose.matrix; c.obstacle = pose.obstacle; c.y = pose.y;
    c.stages.place(c.pose);
  }
  // the tent at stage k: drawn so, a box for the walker once the poles are up, saved
  setStage(c, k) {
    if (!c) return;
    c.stage = Math.max(0, Math.min(4, k));
    if (c.stage < 3) this.tentOut(c); // (taken down past the tent: what was in it comes out by the door)
    c.stages.set(c.stage);
    const i = this.tiles.dynamic.indexOf(c.obstacle), want = c.stage >= 2;
    if (want && i < 0) this.tiles.dynamic.push(c.obstacle);
    else if (!want && i >= 0) this.tiles.dynamic.splice(i, 1);
    this.persist();
  }
  // a tent far off is not drawn
  drawTent() {
    const c = this.camp;
    if (!c || !c.stages) return;
    const far = Math.hypot(c.x - this.player.x, c.z - this.player.z) > SHOW_TENT;
    c.stages.group.visible = !far && c.stage > 0;
  }
  // rolled up: the meshes down, the site free, the tent back in a container in the camp's reach (the one it came out
  // of first), or rolled up on the ground where it stood when nothing has room
  packTent({ quiet = false, stash = false } = {}) {
    const c = this.camp;
    if (!c) return;
    this.tentOut(c, { stash, quiet });
    c.stages.hide(); this.pool.push(c.stages);
    const i = this.tiles.dynamic.indexOf(c.obstacle);
    if (i >= 0) this.tiles.dynamic.splice(i, 1);
    if (c.key) this.registry.release(c.key, PLAYER);
    this.camp = null;
    const inv = this.inv, d = itemDef(c.item);
    let words = '';
    if (inv && c.item && d) {
      if (stash) { inv.put(inv.crate, c.item, { quiet: true }); words = ''; }
      else {
        const pool = inv.campReach().filter((k) => k.item !== 'crate');
        const r = inv.place(c.item, 1, { pool, prefer: c.from ? [c.from] : [] });
        if (r.ok) words = ` It goes in the ${thingName(itemDef(inv.cont(r.cId).item))}.`;
        else {
          const pile = inv.addContainer('pile', 'ground', { x: c.x, z: c.z, y: this.tiles.groundAt(c.x, c.z), heading: Math.atan2(-c.fdz, c.fdx), left: true, ...(c.key ? { camp: c.key } : {}) }, { quiet: true });
          inv.put(pile, c.item, { quiet: true }); inv.emit('ground');
          words = ' Nothing has room for it: it lies rolled up where it stood.';
        }
      }
    }
    this.persist();
    this.log('strike', { key: c.key, item: c.item });
    if (!quiet) this.note(`The tent is down and rolled up.${words}${c.key ? ' The site is free again.' : ''}`, 5);
  }

  // the things in the tent out by its door (inventory.emptyTent), a word of it; stash: to the outfitters with the tent
  tentOut(c, { stash = false, quiet = false } = {}) {
    const inv = this.inv;
    if (!inv || typeof inv.emptyTent !== 'function') return 0;
    const n = inv.emptyTent(c, { stash });
    if (n && !quiet && !stash) this.note(`What was in the tent is out by the door: ${n === 1 ? 'one thing' : `${word(n)} things`}.`, 4);
    return n;
  }
  // wc A: your tent's two keys on the dot (nearby.js draws the target within TENT_PANEL of it): { e, q, label, hint,
  // stage }. Half pitched: E carries on pitching (held), Q strikes (held). The fly still off: E puts it on (held), Q
  // rests without it (rain comes through the mesh). Up: E Rest until… (the dial), Q strikes (held). o.key: the key held.
  tentActions() {
    const c = this.camp, p = this.player;
    if (!c || p.mode !== 'walk' || Math.hypot(c.x - p.x, c.z - p.z) > TENT_PANEL) return null;
    const K = tentOf(c.item), d = itemDef(c.item), keys = (o) => ({ key: (o && o.key) || 'KeyE', keys: [...new Set([(o && o.key) || 'KeyE', 'Mouse0', ...((o && o.keys) || [])])] });
    const busy = !!(hold.active || this.busy || this.night || this.dialOpen);
    const pitch = { verb: c.stage === 3 ? 'Put the fly on' : 'Carry on pitching', held: true, why: busy ? 'a moment' : null, run: (o) => hold.begin({ ...this.pitchOnOpts(), ...keys(o) }) };
    const strike = { verb: 'Strike', held: true, why: busy ? 'a moment' : null, run: (o) => hold.begin({ ...this.strikeOpts(), ...keys(o) }) };
    const rest = { verb: c.stage === 3 ? 'Rest until… (no fly)' : 'Rest until…', why: busy ? 'a moment' : null, run: () => this.restDial() };
    const e = c.stage >= 4 ? rest : pitch, q = c.stage >= 4 ? strike : c.stage === 3 ? rest : strike;
    return { e, q, label: `your ${lower(d ? d.name : 'tent')}`, hint: K.words[c.stage], stage: c.stage };
  }
  // the Rest-until dial: first light, 7:00, 9:00, noon, 4 pm, dusk, 10 pm, or any hour by ← →; E rests until then
  restDial() {
    const c = this.camp, d = this.day, { rise, set } = d.sunriseSunset;
    if (!c || c.stage < 3) { this.note('The tent isn’t up yet: carry on pitching it first.'); return false; }
    if (this.night || this.busy || hold.active) return false;
    if (!this.dial) this.dial = new RestDial();
    const first = ((rise ?? 6) + WAKE_AT) % 24, dusk = (set ?? 19) % 24;
    const opts = [
      { label: 'First light', small: clock12(first), at: first },
      { label: '7:00', small: 'am', at: 7 }, { label: '9:00', small: 'am', at: 9 }, { label: 'Noon', small: '12 pm', at: 12 }, { label: '4:00', small: 'pm', at: 16 },
      { label: 'Dusk', small: clock12(dusk), at: dusk }, { label: '10:00', small: 'pm', at: 22 },
    ];
    // the first of them after now (by an hour at least), as the one to begin with
    const h = d.hours, ahead = (at) => (((at - h) % 24) + 24) % 24;
    const start = opts.map((o) => o.at).filter((at) => ahead(at) >= 1).sort((a, b) => ahead(a) - ahead(b))[0] ?? first;
    const words = (at) => {
      const w = this.wakeTime(at), M = Math.round(w.hours * 60), H = Math.floor(M / 60), m = M % 60;
      const span = `${H ? `${H} h` : ''}${m ? ` ${m} min` : ''}`.trim() || 'no time at all';
      const kind = w.nap ? 'a nap: some of the rest comes back' : w.hours >= 7 ? 'a full night' : 'a short night: not all the rest comes back'; // (fb5 join: no percent, rule 3)
      const short = this.tentShort(); // (what the night is short of, said before it, not after)
      return `${span} · ${kind}${c.stage < 4 ? ' · no fly on' : ''}${short.length ? ` · ${short.join(', ')}` : ''}`;
    };
    this.dial.show({ kicker: `Rest · ${c.site ? this.siteName(c.site) : 'your tent'}`, opts, at: start, words, onPick: (at) => this.sleep('tent', at) });
    return true;
  }
  // from an hour and a half before sunset to sunrise the tent takes you (night0), and by day too when worn out (sleepy)
  get night0() { const d = this.day, { rise, set } = d.sunriseSunset, h = d.hours; return h >= (set ?? 19) - SLEEP_FROM || h < (rise ?? 6); }
  get sleepy() { return this.night0 || this.wornOut; }
  // done in by day (a site reached at dawn after a night on the water): the tent takes you anyway
  get wornOut() { const e = this.energy; return !!(e && e.live && e.needs && e.needs.rest < WORN_OUT); }

  // a chore (CHORES): the walker holds still while its time passes on the clock, then `done`
  chore(kind, done = null, spec = null) { this.busy = { t: 0, passed: 0, kind, done, spec }; } // (content C: spec { seconds, hours, say }, a chore's own length: kit.js's pump, stove, cup, knife)
  // the chore under way, per frame (real seconds): its hours spread over its seconds
  working(dt) {
    const b = this.busy, C = b.spec || CHORES[b.kind] || CHORE;
    b.t += dt;
    const k = Math.min(1, b.t / C.seconds), want = C.hours * k;
    this.pass(want - b.passed); b.passed = want;
    this.say(C.say);
    if (k >= 1) {
      this.busy = null;
      if (b.done) b.done();
    }
  }
  // take the tent down at once, without the hold (a trip that ends: the outfitters see to it)
  strike({ quiet = false, stash = false } = {}) { if (this.camp) this.packTent({ quiet, stash }); }
  // a trip that ends (an evacuation, the end at a counter): the tent goes to the outfitters, quietly; nothing else moves
  leave({ quiet = false } = {}) {
    hold.cancel();
    this.dropDraft(); this.pitching = null;
    if (this.camp) this.strike({ quiet, stash: true });
    this.persist();
  }
  // pushing off: nothing is struck, put out or packed. A word of what is still ashore at the camp you leave: the tent,
  // the fire (chores.ashore), the barrel hung, the things set out. Each is marked so the inventory's own "left behind"
  // word does not say it again.
  leaving() {
    const p = this.player, inv = this.inv, parts = [], c = this.camp;
    hold.cancel(); this.dropDraft(); this.pitching = null; if (this.hang.armed) this.hang.disarm();
    const camp = c && Math.hypot(c.x - p.x, c.z - p.z) < ASHORE_NOTE ? c : null;
    const area = this.areaAt(p.x, p.z, AREA_R + 15) || (camp ? { x: camp.site ? camp.site.layout.fire.x : camp.x, z: camp.site ? camp.site.layout.fire.z : camp.z, r: AREA_R } : null);
    if (camp) {
      // (what is in it, named: the owner, 2026-10-31, "it should tell me what that item is or items")
      const inside = inv ? [...inv.containers.filter((k) => k.where === 'tent').flatMap((k) => (k.item === 'pile' ? entryNames(k.grid) : [`the ${thingName(itemDef(k.item))}`])), ...inv.long.filter((l) => l.where === 'tent').map((l) => `the ${thingName(itemDef(l.id))}`)] : [];
      parts.push(camp.stage >= 4 ? `the tent is still up${inside.length ? `, ${listOf(inside)} in it` : ''}` : `the tent stands half pitched, ${tentOf(camp.item).words[camp.stage]}`);
    }
    if (this.chores && typeof this.chores.ashore === 'function') { try { for (const s of this.chores.ashore() || []) if (s) parts.push(s); } catch (e) { console.warn('chores.ashore', e); } }
    if (inv && area) {
      const near = (at) => at && Math.hypot(at.x - area.x, at.z - area.z) <= area.r + 10;
      const hung = [], out = [];
      for (const k of inv.containers) {
        const d = itemDef(k.item);
        if (!d || (d.fixed && k.item !== 'pile') || !near(k.at)) continue;
        if (k.where === 'hung') { hung.push(k); continue; }
        if (k.where === 'ground') out.push(k);
      }
      for (const l of inv.long) if (l.where === 'ground' && near(l.at)) out.push(l);
      if (hung.length) parts.push(`${hung.length > 1 ? 'the barrels are' : 'the barrel is'} hung`);
      const named = out.filter((k) => k.item !== 'pile').map((k) => `the ${thingName(itemDef(k.item || k.id))}`);
      // (fb4 join: "some things on the ground is set out" said the plural with "is"; a woodpile is named as one)
      const piles = out.filter((k) => k.item === 'pile'), woodpiles = piles.filter((k) => k.grid.length && k.grid.every((e) => /^wood:/.test(e.id)));
      if (woodpiles.length) named.push(woodpiles.length > 1 ? 'woodpiles' : 'a woodpile');
      // (the content join: a tent struck with no room lay in a pile, and "some things on the ground" let you paddle off
      // without it: a pile's things are named while they are one or two, a tent always)
      // (the owner, 2026-10-31: "when I leave a site and it says I'm missing something, it should tell me what that item
      // is or items": every thing in a pile is named, the same ones counted together)
      for (const k of piles) if (!woodpiles.includes(k) && k.grid.length) named.push(...entryNames(k.grid));
      const plural = named.length > 1 || /^(woodpiles|two|three|four|five|six|seven|eight|nine|ten|\d)/.test(named[0] || '');
      if (named.length) parts.push(`${listOf(named)} ${plural ? 'are' : 'is'} set out`);
      for (const k of [...hung, ...out]) if (k.at) k.at.noted = true;
    }
    if (!parts.length) return;
    this.note(`${cap(parts.join('; '))}. Everything stays as it is until you come back.`, 8);
  }

  // --- the night ----------------------------------------------------------------------------------------------
  // when a night begun now ends: a quarter hour after sunrise, or, turned in so late that first light is under five
  // hours off, seven hours on and no later than 9:00. { at: the hour, hours: how long }
  // choice (hubs 3A, the wake-time card): 'first' (that), or an hour of the clock to wake at (7 or 9): the next time
  // it comes round
  // wc A: an hour chosen on the dial (any hour, day or night) is the next time it comes round; a rest under NAP_UNDER
  // hours that spans no night (it starts and ends between sunrise and sunset) is a nap (nap), else a night (energy.sleep)
  wakeTime(choice = 'first') {
    const d = this.day, { rise: r, set } = d.sunriseSunset, rise = r ?? 6, dusk = set ?? 19;
    if (Number.isFinite(choice)) {
      const at = ((choice % 24) + 24) % 24, hours = ((at - d.hours) % 24 + 24) % 24 || 24;
      const byDay = (h) => h >= rise && h < dusk;
      const nap = hours < NAP_UNDER && byDay(d.hours) && byDay(at) && at > d.hours;
      return { at, hours, nap, day: nap };
    }
    if (d.hours >= rise && d.hours < dusk - SLEEP_FROM) { const at = Math.min(23.5, d.hours + SLEEP_IN); return { at, hours: at - d.hours, day: true }; } // a sleep by day, worn out
    let at = (rise + WAKE_AT) % 24, hours = ((at - d.hours) % 24 + 24) % 24 || 24;
    if (hours < LATE_NIGHT && d.hours < 12) { at = Math.max(at, Math.min(SLEEP_IN_BY, d.hours + SLEEP_IN)); hours = at - d.hours; }
    return { at, hours };
  }
  // whether the night ahead (hours of it) brings rain (weather.js forecast, and the rain falling now)
  rainyNight(hours) {
    const W = this.weather;
    if (!W) return false;
    const fc = W.forecast ? W.forecast(Math.max(1, Math.ceil(hours))) : [];
    return RAINY.has(W.state) || fc.some((f) => RAINY.has(f.state));
  }
  sleep(kind, choice = 'first') {
    const d = this.day, p = this.player, set = d.sunriseSunset.set, e = this.energy, c = this.camp;
    if (kind === 'tent' && c && c.stage < 3) { this.note('The tent isn’t up yet: carry on pitching it first.'); return; }
    // turning in before sunset: the night's jump would carry the clock past the dusk meal (energy.js eats only the
    // breakfast of a jump), so supper is eaten now, unless one was had in the last few hours (a cooked one, say)
    const { at: wakeAt, hours, day: byDay, nap } = this.wakeTime(choice);
    if (!byDay && set != null && d.hours < set && d.hours > 12 && e && e.autoMeal) e.autoMeal('Supper before bed');
    // in you go, and what you carry with you, as into the canoe (inventory.stowIntoTent)
    const inv = this.inv, S = kind === 'tent' && inv && typeof inv.stowIntoTent === 'function' ? inv.stowIntoTent() : null;
    if (S && (S.moved.length || S.out.length)) {
      const nm = (ds) => listOf(ds.map((d) => `the ${thingName(d)}`));
      this.morningIn = `${S.moved.length ? `${cap(nm(S.moved))} went into the tent with you.` : ''}${S.out.length ? ` No room inside for ${nm(S.out)}: left by the door.` : ''}`.trim();
    } else this.morningIn = null;
    const fly = !c || c.stage >= 4, rain = !fly && this.rainyNight(hours);
    const gear = this.tentGear(), q = this.nightQuality(fly, rain);
    const W = this.weather, fc0 = W && W.forecast ? W.forecast(Math.max(1, Math.ceil(hours))) : [];
    // the weather now leads the night's line (as rainyNight counts it): rain falling at bedtime is a wet night's first
    const fc = W && W.state && (!fc0.length || fc0[0].state !== W.state) ? [{ state: W.state }, ...fc0] : fc0;
    const n = this.tripDay(!byDay && d.hours < 12 ? d.doy - 1 : d.doy); // the night of the evening's day (a sleep by day: today)
    const where = c && c.site ? this.siteName(c.site) : (p.placeName || 'Camp');
    const hh = Math.max(1, Math.floor(hours + 0.01)); // a short night is under seven hours: six and a half is 'six'
    const damp = this.wet || rain;
    const night = nap ? `a nap, ${hours < 1 ? 'an hour or less' : `${word(hh)} ${plural(hh, 'hour')}`}` : byDay ? `${word(hh)} ${plural(hh, 'hour')} by day${damp ? ' in wet gear' : ''}` : hours >= 7 ? (damp ? 'a damp night in wet gear' : fly ? 'a full night\'s sleep' : 'a full night, no fly on') : `a short night, ${word(hh)} ${plural(hh, 'hour')}${damp ? ' in wet gear' : ''}`;
    const card = {
      kicker: `${n ? `${byDay ? 'Day' : 'Night'} ${n} · ` : ''}${where}`,
      text: nap ? napLine(d.hours, wakeAt, fly, W && W.state) : byDay ? 'Out like a light in the middle of the day, the fly zipped against the sun.' : nightLine(fc, d.season, fly),
      sub: `${clock12(d.hours)} to ${clock12(wakeAt)} · ${night}`,
      ...(nap ? { fadeIn: 1.0, hold: 1.6, fadeOut: 1.6 } : {}),
    };
    // cons A: a bear in the night (bear.js, main.js sets camp.bear): decided now, for a night's sleep (not a nap or a sleep
    // by day) whose hours hold the night's hour, with food not hung; the card is the visit, held while its sounds play
    const B = !nap && !byDay && this.bear && typeof this.bear.bedtime === 'function' ? this.bear.bedtime({ x: p.x, z: p.z, from: this.now, to: this.now + hours }) : null;
    if (B) { card.text = B.text; card.hold = B.hold; }
    this.night = { kind, q, hours, wakeAt, x: p.x, z: p.z, rain, nap, bear: !!B, bag: !!gear.bag, pad: !!gear.pad, fly, rest0: e && e.live && e.needs ? e.needs.rest : null };
    // (the bear at the tent: its onDark is a promise, the card held while you have the moment to shout: bear.js tentNight)
    const onDark = () => {
      let w = null;
      if (B && B.onDark) { try { w = B.onDark(); } catch (e) { console.warn('bear: the night', e); } }
      return Promise.resolve(w).catch((e) => console.warn('bear: the night', e)).then(() => this.wake());
    };
    const done = () => this.morning();
    if (this.veil && this.veil.card) this.veil.card({ ...card, onDark }).then(done, done);
    else { if (!this.card) this.card = new NightCard(); this.card.show({ ...card, onDark }).then(done, done); }
  }
  // at full dark: the clock to the waking hour (sunrise + a quarter hour, or later after a late night), the energy
  // back, the lamp off; rain through the mesh soaks the gear when the fly was off; a bear may have got into food not
  // hung (bear.js, cons A)
  wake() {
    const n = this.night, d = this.day;
    if (!n) return;
    if (this.lamp) this.lamp.toggle(false);
    this.jump(n.hours);
    if (Number.isFinite(n.wakeAt)) d.setClock(d.year, d.doy, n.wakeAt);
    const e = this.energy;
    // a bear at the tent in the night breaks it (bear.js restFactor: shouted off, a little; let in, most of it)
    n.bearRest = n.bear && this.bear && typeof this.bear.restFactor === 'function' ? this.bear.restFactor() : 1;
    if (n.nap) this.nap(n.q * (n.bag ? 1 : NAP_NO_BAG), n.hours);
    else if (e.sleep) e.sleep(n.q * n.bearRest, n.hours, { bag: n.bag }); else e.value = Math.max(e.value, n.q); // the night's quality and its hours (energy.js)
    if (n.nap) { this.log('nap', { key: this.camp ? this.camp.key : null, hours: Math.round(n.hours * 10) / 10 }); this.persist(); return; }
    const lines = [];
    if (this.morningIn) { lines.push(this.morningIn); this.morningIn = null; }
    const rested = this.restWords(n);
    if (rested) lines.push(rested);
    if (n.rain && this.state) { this.state.wet = true; lines.push('Rain came through the mesh in the night with no fly on: your gear is soaked.'); }
    else if (this.wet && this.player.gear && this.player.gear.sleepDry) { this.state.wet = false; lines.push('The gear dried overnight in the vestibule.'); } // hubs 2B: the four-season tent
    // cons A: the bear decided at bedtime does its damage now; its line waits for the mess to be seen (bear.js)
    if (n.bear && this.bear && typeof this.bear.morning === 'function') { try { this.bear.morning(n); } catch (e) { console.warn('bear: the morning', e); } }
    this.morningNote = lines.length ? lines.join(' ') : null;
    this.log('sleep', { kind: n.kind, key: this.camp ? this.camp.key : null, q: +n.q.toFixed(2), hours: Math.round(n.hours * 10) / 10, fly: !n.rain && (!this.camp || this.camp.stage >= 4) });
    this.persist();
  }
  // The morning's word on the night's rest (the owner, 2026-10-31: "Sleep feels weird. Like, I'd expect if I slept a full
  // night, my sleep would be pretty much 100% restored, but sometimes it doesn't do anything"): how rested, and what held
  // it back (no bag or pad in the tent, the fly off, a short night, wet gear, a cold night, the bugs), and when the bar
  // stays low for hunger or thirst rather than sleep, that. No percent (fb5 join, rule 3).
  restWords(n) {
    const e = this.energy;
    if (!e || !e.live || !e.needs) return null;
    const r = e.needs.rest, why = [], L = e.lastNight || {}, K = e.kit && e.kit.lastNight;
    if (!n.bag) why.push('no sleeping bag in the tent');
    if (!n.pad) why.push('no pad under you');
    if (!n.fly) why.push('no fly on');
    if (n.hours < 6.5) why.push(`only ${word(Math.max(1, Math.floor(n.hours + 0.01)))} ${plural(Math.max(1, Math.floor(n.hours + 0.01)), 'hour')}`);
    if (this.wet || n.rain) why.push('wet gear');
    if (K && K.cold >= 2) why.push('a night colder than the bag');
    if (L.bugs) why.push('the bugs');
    if (n.bearRest < 0.99) why.push('the bear at the tent');
    const how = r >= 0.95 ? 'Fully rested' : r >= 0.8 ? 'Well rested' : r >= 0.55 ? 'Rested, but not fully' : 'Barely rested';
    let words = `${how}${why.length && r < 0.95 ? `: ${listOf(why)}` : ''}.`;
    const nd = e.needs, held = nd.food < 0.35 ? 'hungry' : nd.water < 0.35 ? 'thirsty' : nd.warmth < 0.35 ? 'cold' : null;
    if (held) words += ` You're ${held}, and that holds you down until you ${held === 'hungry' ? 'eat' : held === 'thirsty' ? 'drink' : 'warm up'}.`;
    return words;
  }
  // the night card's words changed while it is up (bear.js: the bear at the tent), on the veil or the camp's own card
  cardSay(text, sub = null) {
    const v = this.veil;
    if (v && v.cur) { if (v.text) v.text.textContent = text; if (sub !== null && v.sub) v.sub.textContent = sub; return; }
    const c = this.card;
    if (c && c.run) { c.t.textContent = text; if (sub !== null) c.s.textContent = sub; }
  }
  // wc A: a nap (energy.js has only the night's sleep): the rest need comes back by NAP_GAIN of a night's share for the
  // hours napped, the hours awake fall by NAP_AWAKE an hour (the rest's ceiling), warmth comes back some in the bag, and
  // the bar is back up to what the needs allow, as after a night
  nap(q, hours) {
    const e = this.energy;
    if (!e) return;
    if (!e.live || !e.needs) { e.value = Math.max(e.value, Math.min(1, e.value + q * hours / 7)); return; }
    const before = e.needs.rest;
    if (Number.isFinite(e.awakeSince)) e.awakeSince = Math.min(e.now, e.awakeSince + NAP_AWAKE * hours);
    e.needs.rest = Math.min(1, Math.max(before, before + q * NAP_GAIN * Math.min(1, hours / 7)));
    if (e.need && Number.isFinite(e.need.warmth)) e.need.warmth = Math.min(1, e.need.warmth + 0.25 * Math.min(1, hours / 2));
    if (Number.isFinite(e.ceiling)) e.value = Math.max(e.value, e.ceiling);
    e.wokeAt = e.now; e.warned = false;
    if (typeof e.unnote === 'function') e.unnote();
  }
  // after the card: the day's card (the HUD skips jumps; after a nap, a word instead)
  morning() {
    const n = this.night;
    if (n && n.nap) { this.night = null; this.note(`Up at ${clock12(this.day.hours)}, ${n.hours < 1.5 ? 'a little' : 'a good deal'} more rested.`, 5); return; }
    this.night = null;
    const d = this.day, h = this.hud, p = this.player, w = this.world, e = this.energy;
    const rise = d.sunriseSunset.rise, wind = this.wind, dayN = this.tripDay(d.doy);
    const here = p.placeName || w.lakeName(p.lakeId) || 'Open country';
    const food = ''; // (the owner, 2026-10-31: no food count on the morning card: chatter)
    if (h && h.showPlace) {
      h.showPlace(`${longDate(d.year, d.doy)}${rise != null ? ` · sunrise ${clock12(rise)}` : ''}${wind ? ` · ${wind.label.toLowerCase()} from the ${wind.compassLong}` : ''}`, dayN ? `Day ${dayN}` : 'A new day', [here, food].filter(Boolean).join(' · '));
      h.lastDawnDoy = d.doy;
    }
  }

  // --- saving ---------------------------------------------------------------------------------------------------
  serialize() {
    const c = this.camp;
    if (!c || c.stage < 1) return null;
    return { key: c.key, pitched: true, stage: c.stage, item: c.item, from: c.from, since: c.since, x: c.x, z: c.z, fdx: c.fdx, fdz: c.fdz };
  }
  persist() {
    const s = this.serialize();
    if (this.state) { this.state.camp = s; if (this.outfitter && this.outfitter.save) this.outfitter.save(); } // in the trip's own document
    else save.write('camp', s);
  }
  restore() {
    const s = this.trip && this.trip.state ? this.trip.state.camp : save.read('camp');
    this.pending = s && s.pitched && Number.isFinite(s.x) && Number.isFinite(s.z) ? s : null;
  }
  // a saved tent goes back up where it stood, at the stage it was left at, once its ground is in (and its site's claim
  // is still to be had). A save from before the phases is a tent fully pitched whose item never left its pack.
  restorePending() {
    const s = this.pending;
    if (!s) return;
    if (!this.world.isReady(s.x, s.z) || !this.tiles.locate(s.x, s.z)) return;
    let site = null;
    if (s.key) {
      site = this.registry.site(s.key);
      if (!site || !this.registry.claim(s.key, PLAYER)) { this.pending = null; if (this.inv) this.inv.emptyTent(s); this.persist(); return; }
    }
    this.pending = null;
    const item = s.item === undefined ? null : s.item, stages = this.stagesFor(item || 'aframe');
    const c = { key: s.key || null, site, x: s.x, z: s.z, fdx: s.fdx, fdz: s.fdz, since: s.since ?? this.now, stage: 0, item, from: s.from || null, colour: stages.colour, stages };
    this.camp = c;
    this.poseTent(c);
    this.setStage(c, Number.isFinite(s.stage) ? s.stage : 4);
  }
}

// a nap's line, by the hour of the day and the weather now
function napLine(h, at, fly, state) {
  const rain = /rain|storm/.test(String(state || ''));
  if (rain) return fly ? 'Rain on the fly, and you doze off to it.' : 'Rain through the mesh, no fly on: a damp doze.';
  if (h < 10) return 'The morning sun on the tent, and you sleep in a while.';
  if (at >= 17) return 'You lie down in the afternoon and wake to the evening light, the lake gone still.';
  return 'Out like a light in the middle of the day, the fly zipped against the sun.';
}
// The night's weather, in a line, from the forecast for the hours slept (weather.js forecast: one entry per change);
// fly: whether the fly was on (without it the rain comes through the mesh)
function nightLine(fc, season, fly = true) {
  const st = fc.map((f) => f.state), has = (k) => st.includes(k), first = st[0], last = st[st.length - 1];
  const cold = season && season.cold > 0.6, under = fly ? 'on the fly' : 'through the mesh, no fly on';
  if (has('storm')) return fly ? 'Thunder walked down the lake in the night. The fly held.' : 'Thunder walked down the lake in the night, and the rain came straight through the mesh.';
  if (has('rain')) return last === 'rain' ? `Rain ${under} all night.` : `Rain ${under} in the small hours, easing by first light.`;
  if (has('light-rain')) return `A light rain came and went ${under}.`;
  if (last === 'fog') return 'A still night. Fog on the water by first light.';
  if (first === 'overcast' && last === 'overcast') return 'A grey, quiet night under low cloud.';
  if (first === 'overcast') return 'The cloud broke up after midnight: stars, then a cold dawn.';
  if (cold) return fly ? 'A clear, cold night. Frost on the fly at dawn.' : 'A clear, cold night, the stars through the mesh. Dew on everything at dawn.';
  return fly ? 'A clear night, the stars down to the treeline. Loons out on the lake.' : 'A clear night, the stars through the mesh. Loons out on the lake.';
}
