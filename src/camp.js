import { tentPose } from './props.js';
import { save } from './save.js';
import { clock12, longDate, plural, fmtDays, compassLong, word } from './hud.js';
import { daysInYear } from './astro.js';
import { sheets } from './sheets.js'; // hubs 2D: the dusk word names only a site your map shows
import { Chores } from './chores.js'; // hubs 3A / camp 2: the fire, the wood, the cooking, the latrine, the wake-time card
import { hold } from './hold.js'; // camp 1: held work, with its ring
import { TentStages, TentGhost, TENT_FLY, kindOf, tentOf } from './tent.js'; // camp 1: the tent in its phases (the A-frame's own, camp join)
import { Hang } from './hang.js'; // camp 1: the barrel hung from a limb
import { inventory as INVENTORY } from './inventory.js';
import { itemDef } from './items.js';

// Camp and night (the trip core, stream C; redone on the owner's feedback of 2026-10-24: "setting up your camp in your
// own little way"). Nothing at camp happens by itself.
//   - The tent is pitched where you choose. With a tent in a container in the camp's reach (inventory.campReach), on
//     foot and standing a moment on a site's ground (or anywhere flat in Sandbox), a ghost tent stands where it would
//     go, its door to you: green on good ground, red where it can't (on rock, on a slope over 12°, among trunks, a log
//     or a stump, on the portage trail, by the fire ring, the bench or the latrine, at the water's edge, outside the
//     site's area in Adventure), the reason on the action line. Hold E (hold.js) and it goes up phase by phase
//     (tent.js): the footprint staked, the poles up, the tent up, the rain fly on. Let go and it stops at the phase
//     finished; hold E at it to carry on. The tent comes out of its pack when the footprint is staked; the site is
//     yours from then until it is struck.
//   - At your tent: by day, hold E to strike it, the phases backwards (the fly off, the tent down, the poles down,
//     rolled up), back into a container in the camp's reach, or rolled up on the ground if nothing has room. From dusk
//     E sleeps (the wake-time card, chores.js) and a held Q strikes; a half-pitched tent takes E to carry on, Q to take
//     it down. Only the tent with its fly on sleeps best; without the fly a night's rain soaks you.
//   - The barrel is hung from a limb with a held E (hang.js).
//   - Launching strikes nothing, puts out nothing and packs nothing: a note says what is still ashore (the tent, the
//     fire, the barrel hung, the things set out), and it all stays as it is, across reloads, until you come back.
// In Adventure you camp at the designated sites only (hubs phase 1: "that's not allowed, so not even camp"). The night
// gives the bar its rest by the tent (profile.sleepQ / player.gear.sleep; damp gear x0.8, no fly x0.9) and by the hours
// slept (energy.sleep(q, hours)). On foot at the water's edge E fills the bottle when no other prompt holds E. An hour
// before sunset, in Adventure, a note names the nearest free site; once it is dark a note suggests the headlamp (H).
// The fire, the firewood, the cooking, the eating and the latrine are chores.js's (camp stream 2): its update sets its
// own prompts (with their key) ahead of the site's, and chores.ashore() names what it leaves burning.
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
const AT_TENT = 3.2;        // metres from the tent's middle within which E is the tent's
const HULL_REACH = 3;       // player.js: within this of the canoe on the ground E is the canoe's
const GHOST_AHEAD = 2.1;    // metres ahead of the walker the ghost tent's middle stands, its door to him
const GHOST_STILL = [0.35, 1.0]; // seconds standing still before the ghost shows: at a site, and off one (Sandbox)
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
const TENTS = { aframe: 0.85, 'a-frame': 0.85, dome: 1, fourseason: 1, 'four-season': 1, '4season': 1 }; // sleep quality by the profile's kit.tent
const START_TENT = 0.85;    // the starting kit's A-frame, when there is no profile to ask
const PAD = 0.05;           // a sleeping pad adds this
const WET = 0.8;            // a night in damp gear sleeps this much as well
const NO_FLY = 0.9;         // and a night with no fly on (dew through the mesh)
const RAINY = new Set(['light-rain', 'rain', 'storm']);
const FILTERS = { tablets: 0.5, pump: 5 / 60, gravity: 5 / 60 }; // game hours before the water is drinkable, by kit.filter
const AT_WATER = 2.5;       // metres from the waterline (world.shoreAt) within which E fills the bottle
const BOTTLE_ASK = 1.8;     // litres: the bottle is offered a fill below this
const DRY_HOURS = 0.5;      // game hours by a fire that dry wet gear
const REST_SITE = 40;       // metres from a site's centre that count as at a campsite for resting
const lower = (s) => (/^[A-Z]-/.test(String(s)) ? String(s) : String(s).charAt(0).toLowerCase() + String(s).slice(1)); // "A-frame" keeps its capital
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const listOf = (a) => (a.length <= 1 ? a[0] || '' : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const thingName = (d) => (d ? (/^(Duluth|Johnson|Blue)/.test(d.name) ? d.name.replace(/^Blue barrel.*/, 'blue barrel') : lower(d.name)) : 'thing');

export class CampRegistry {
  constructor(world) {
    this.world = world;
    this.holders = new Map(); // key -> holder id
    this.onChange = null;     // (key, holder or null) after a claim or a release
    this._sites = null;
  }
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
      if (d < r && (!best || d < best.d)) { const key = campKey(c); if (this.isFree(key) && (!ok || ok(c))) best = { site: c, key, d }; }
    }
    return best;
  }
}

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
    this.lastMode = null; this.booted = false; this.pending = null;
    this.still = 0; this.dry = 0; this.lastNow = null;
    this.nudged = null; this.lampHinted = null;
    this.profileOf = null;    // () => the profile (stream A), set by main.js
    this.restT = 0; this.atSite = false;
    this.area = null; this.areaT = 0; // the camp's reach where you stand (reachArea), every quarter second
    this.spot = null;         // the ghost's last reading: { x, z, fdx, fdz, pose, ok, why, px, pz, h, t }
    this.morningNote = null;  // a line for the morning (a bear in the night)
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
    if (this.busy || (this.card && this.card.active) || (ch && ch.card && ch.card.open)) this.player.input.paused = true;
  }

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
    if (cs) cs.crouch = (this.busy && LOW_CHORES.has(this.busy.kind) && p.mode === 'walk') || (hold.active && hold.active.crouch) ? 1 : 0;
    if (this.morningNote && !this.night && !(this.veil && this.veil.active)) { this.note(this.morningNote, 9); this.morningNote = null; }
    if (this.busy) { this.ghost.park(); this.working(dt); return; }
    if (this.night || hold.active) { this.ghost.park(); return; }
    if (this.chores && this.chores.card && this.chores.card.open) { this.ghost.park(); p.prompt = null; return; } // the wake-time card holds the keys
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

  // an hour before sunset in Adventure: the nearest free site your map shows (a sheet you own, or near where you have
  // been: sheets.js), never one off it; once dark: the headlamp
  notes() {
    const d = this.day, p = this.player, { set } = d.sunriseSunset;
    const stamp = d.year * 1000 + d.doy, evening = d.hours >= 12 ? stamp : stamp - 1;
    if (this.adventure && !this.camp && set != null && d.hours >= set - 1 && d.hours < set && this.nudged !== stamp && !this.atSite) {
      this.nudged = stamp;
      const n = this.registry.nearestFree(p.x, p.z, 6000, (c) => sheets.showsDetail(c.x, c.z));
      if (n) {
        const dx = n.site.x - p.x, dz = n.site.z - p.z, deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
        const far = n.d < 1000 ? `${Math.max(50, Math.round(n.d / 50) * 50)} m` : `${(n.d / 1000).toFixed(1)} km`;
        const id = p.nearWater ? p.nearWater(n.site.x, n.site.z, 8) : 0, lake = id ? this.world.lakeName(id) : null;
        this.note(`An hour of light left. The nearest free campsite is ${far} ${compassLong(deg)}${lake ? `, on ${lake}` : ''}.`, 9);
      } else this.note('An hour of light left, and no free campsite on your map near here. Find one before dark.', 9);
    }
    // (not under the store's lamp: the word waits until you step back out of the door)
    const indoors = !!(this.outfitter && this.outfitter.visit && this.outfitter.visit.inside);
    if (this.lamp && !this.lamp.on && this.dark && !indoors && this.lampHinted !== evening) {
      this.lampHinted = evening;
      this.note('Dark now. H for the headlamp.', 6);
    }
  }

  // --- prompts --------------------------------------------------------------------------------------------------
  // E with a line, when E is free here: on foot, the canoe out of reach, no one else's E showing
  offer(action, info, fn) {
    this.player.prompt = { key: 'E', text: info ? `${action} · ${info}` : action };
    if (this.player.input.pressed('KeyE')) fn();
  }
  say(text) { this.player.prompt = { key: null, text }; }

  prompts() {
    const p = this.player, soft = p.prompt && p.prompt.soft ? p.prompt : null;
    this.ghostOn = false;
    // the walker is held (a panel, a card, camp 2's sit to eat or the pot going on) or chores.js owns the line: its words
    // stay, and no ghost
    if (p.input.paused || (p.prompt && p.prompt.own === 'chores')) { this.ghost.park(); return; }
    this.sitePrompts(soft);
    if (!this.ghostOn) this.ghost.park();
    // a thing carried away from the canoe offers only Q (packs.js): the camp's E takes the line and keeps the Q
    if (soft && p.prompt && p.prompt !== soft && soft.tail) p.prompt = { ...p.prompt, text: `${p.prompt.text}${soft.tail}`, tail: soft.tail };
  }
  sitePrompts(soft) {
    const p = this.player;
    if (p.mode !== 'walk') return;
    const drop = p.carry && p.carry.drop;
    if (drop && Math.hypot(drop.x - p.x, drop.z - p.z) <= HULL_REACH) return; // the canoe's E (player.js, packs.js)
    // a pack's, a dock's, a portage's, the fire's or the wood's (chores.js sets its own with its key)
    if (!soft && p.prompt && (p.prompt.key || /<kbd>/.test(p.prompt.text || ''))) return;
    const site = this.nearestSite(p.x, p.z, SITE_R, true);
    if (this.bottlePrompt(site)) return; // at the water's edge the water's E comes before the site's
    if (site) this.atSitePrompts(site, !!soft);
    else this.offSitePrompts(!!soft);
  }

  // --- the bottle (hubs 1B) --------------------------------------------------------------------------------------
  // On foot at the water's edge, on an Adventure under way, with the bottle down a little: E fills it. At a site the
  // grate's and the tent's own E stay theirs.
  bottlePrompt(site) {
    const p = this.player, e = this.energy, w = this.world;
    if (!e || !e.fill || !e.live || e.bottle > BOTTLE_ASK) return false;
    const f = p.forward, edge = w.shoreAt(p.x, p.z) <= AT_WATER || w.shoreAt(p.x + f.x * 1.6, p.z + f.z * 1.6) < 0;
    if (!edge) return false;
    if (site && site.layout) {
      const L = site.layout;
      if (Math.hypot(L.fire.x - p.x, L.fire.z - p.z) < 2.4) return false;
      if (this.camp && Math.hypot(this.camp.x - p.x, this.camp.z - p.z) < AT_TENT) return false;
    }
    const wait = this.filterWait(), left = e.bottle <= 0.02 ? 'dry' : `${e.bottle.toFixed(1)} L left`;
    this.offer('Fill the bottle', `${left} · ${wait >= 0.25 ? 'a tablet: drinkable in half an hour' : 'through the filter, a few minutes'}`, () => this.fillBottle(wait));
    return true;
  }
  fillBottle(wait = this.filterWait()) {
    if (this.energy.bottle >= 2 - 0.001) { this.note('The bottle is full.'); return; }
    this.chore('fill', () => this.filled(wait));
  }
  filled(wait) {
    const got = this.energy.fill(2, wait);
    if (this.audio && this.audio.paddleDip) this.audio.paddleDip();
    if (got <= 0) { this.note('The bottle is full.'); return; }
    this.note(wait >= 0.25 ? 'You fill the bottle and drop in a tablet. Drinkable in half an hour.' : 'You pump the bottle full. Drinkable in a few minutes.');
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
    let q = k ? (TENTS[k] ?? (/four|dome/.test(k) ? 1 : START_TENT)) : START_TENT;
    if (pr && pr.has && (pr.has('pad') || pr.has('sleeping-pad'))) q += PAD;
    return Math.min(1, q);
  }
  // game hours before the water just filled is drinkable: tablets half an hour, a filter a few minutes
  filterWait() { const k = this.kitOf('filter'); return FILTERS[k] ?? (/pump|gravity|filter/.test(k) ? FILTERS.pump : FILTERS.tablets); }

  // At a site E belongs to the nearest thing that wants it: the fire, the wood and the latrine first (chores.js, already
  // set), then your tent, the barrel and its tree (hang.js), and the ghost where you would pitch.
  atSitePrompts(site, soft) {
    const p = this.player, key = campKey(site), holder = this.registry.holder(key), c = this.camp;
    if (holder && holder !== PLAYER) { this.say(`${this.siteName(site)} · Taken: another party is camped here`); return; }
    if (c && (c.key === key || !c.key) && Math.hypot(c.x - p.x, c.z - p.z) < AT_TENT) { this.tentPrompts(site, soft); return; }
    if (this.hang.prompts()) return;
    if (!c) this.pitchPrompts(site);
    else if (c.key !== key && this.still >= GHOST_STILL[0]) this.say(`${this.siteName(site)} · ${this.tentAway(c)}`);
  }
  // your tent standing at another site, in a few words: "your tent is up 1.2 km east, at Campsite · Lake One"
  tentAway(c) {
    const p = this.player, d = Math.hypot(c.x - p.x, c.z - p.z), deg = ((Math.atan2(c.x - p.x, -(c.z - p.z)) * 180) / Math.PI + 360) % 360;
    const far = d < 1000 ? `${Math.max(50, Math.round(d / 50) * 50)} m` : `${(d / 1000).toFixed(1)} km`;
    const id = c.site && p.nearWater ? p.nearWater(c.site.x, c.site.z, 6) : 0, lake = id ? this.world.lakeName(id) : null;
    const at = c.site ? (c.site.name ? `, at the ${c.site.name} campsite` : lake ? `, at the campsite on ${lake}` : ', at a campsite') : '';
    return `your tent is ${c.stage >= 4 ? 'up' : 'half pitched'} ${far} ${compassLong(deg)}${at}: strike it there to pitch it here`;
  }
  offSitePrompts(soft) {
    const p = this.player, c = this.camp;
    if (c && !c.key && Math.hypot(c.x - p.x, c.z - p.z) < AT_TENT) { this.tentPrompts(null, soft); return; }
    if (this.hang.prompts()) return;
    // Sandbox: a tent anywhere flat and dry (Adventure: designated sites only, no tent and no bivouac off a site); not
    // about an outfitter's yard
    if (!c && this.sandbox && !(this.outfitter && this.outfitter.visit)) this.pitchPrompts(null);
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
  // the ghost: the tent a couple of metres ahead (the A-frame end on, a little farther for its vestibule), its door to
  // you, on the drawn ground; and what is wrong with the spot, if anything. item: the tent's (its kind's size)
  ghostSpot(site, item = 'aframe') {
    const p = this.player, w = this.world, f = p.forward, size = tentOf(item).size, ahead = size.ahead || GHOST_AHEAD;
    const x = p.x + f.x * ahead, z = p.z + f.z * ahead;
    if (!w.isReady(x, z)) return null;
    const o = this.spot, now = performance.now(), kind = kindOf(item);
    if (o && o.kind === kind && Math.hypot(o.px - p.x, o.pz - p.z) < 0.08 && Math.abs(Math.atan2(Math.sin(o.h - p.heading), Math.cos(o.h - p.heading))) < 0.03 && now - o.t < 400 && o.site === site) return o;
    const fdx = -f.x, fdz = -f.z, ground = (gx, gz) => this.tiles.groundAt(gx, gz);
    const pose = tentPose(ground, x, z, fdx, fdz, size);
    const why = this.pitchProblem(x, z, fdx, fdz, site, size);
    this.spot = { x, z, fdx, fdz, pose, ok: !why, why, px: p.x, pz: p.z, h: p.heading, t: now, site, kind };
    return this.spot;
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
  // the ghost and E held to pitch (true when it set the prompt)
  pitchPrompts(site) {
    const tent = this.tentInReach();
    if (!tent || this.still < GHOST_STILL[site ? 0 : 1]) return false;
    const s = this.ghostSpot(site, tent.def.id);
    if (!s) return false;
    this.ghost.show(s.pose.matrix, s.ok, s.kind); this.ghostOn = true;
    if (s.ok) hold.offer('Pitch the tent here', `the ${lower(tent.def.name)}`, this.pitchOpts(s, tent, site));
    else this.say(`No tent here · ${s.why}`);
    return true;
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
      id: 'tent', label: 'Pitching the tent', phases: K.pitch, at: 0, near: { x: p.x, z: p.z, r: 1.5 },
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
        this.note(`${cap(K.words[job.done])}. Hold E at it to carry on.`, 3);
      },
    };
  }
  // the hold that carries a half-pitched tent on from where it stands
  pitchOnOpts() {
    const c = this.camp, p = this.player, K = tentOf(c.item);
    return {
      id: 'tent', label: 'Pitching the tent', phases: K.pitch, at: c.stage, near: { x: p.x, z: p.z, r: 1.5 },
      onTick: (at) => { if (this.camp === c) c.stages.set(at); },
      onPhase: (i) => { this.setStage(c, i + 1); if (i === 3) this.pitched(); },
      onStop: (job) => { if (this.camp === c) { this.setStage(c, job.done); this.note(`${cap(K.words[job.done])}. Hold E at it to carry on.`, 3); } },
    };
  }
  // the hold that strikes it, from the stage it stands at back to rolled up and in a pack
  strikeOpts() {
    const c = this.camp, from = c.stage, p = this.player, K = tentOf(c.item);
    return {
      id: 'strike', label: 'Striking the tent', phases: K.strike.slice(4 - from), at: 0, near: { x: p.x, z: p.z, r: 1.5 },
      onTick: (at) => { if (this.camp === c) c.stages.set(from - at); },
      onPhase: (i) => { const st = from - (i + 1); if (st <= 0) this.packTent(); else this.setStage(c, st); },
      // (half struck, Q takes the rest down and E pitches it again: tentPrompts)
      onStop: (job) => { if (this.camp === c) { this.setStage(c, from - job.done); if (job.done > 0) this.note(`${cap(K.words[c.stage])}. ${c.stage === 3 && this.sleepy ? 'Q to sleep without the fly, or hold E to put it back on.' : 'Hold Q to take the rest down, or E to pitch it again.'}`, 4); } },
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

  // At your tent. Half pitched: E carries on, Q takes it down (both held). Pitched, by day: E held strikes it. From
  // dusk (or worn out): E sleeps (the wake-time card), Q held strikes. With the tent up but no fly, Q sleeps without it.
  // (Q is the packs' while you carry something: then it sets that down.)
  tentPrompts(site = null, soft = false) {
    const c = this.camp, p = this.player, inp = p.input, d = this.day, { rise, set } = d.sunriseSunset, h = d.hours;
    const from = (set ?? 19) - SLEEP_FROM, night = this.night0, sleepy = this.sleepy;
    const ch = this.chores, wake = night ? `until first light, about ${clock12(this.wakeTime('first').at)}` : `worn out: until about ${clock12(this.wakeTime().at)}`;
    const q = !soft;
    if (c.stage < 4) {
      const sleepNoFly = c.stage === 3 && sleepy && q;
      p.say(`Your tent · ${tentOf(c.item).words[c.stage]}`, ['E', `${c.stage === 3 ? 'Put the fly on' : 'Carry on pitching'} · hold`], q ? (sleepNoFly ? ['Q', 'Sleep without the fly'] : ['Q', 'Take it down · hold']) : null);
      if (inp.pressed('KeyE')) hold.begin(this.pitchOnOpts());
      else if (q && inp.pressed('KeyQ')) { if (sleepNoFly) this.turnIn(site, night); else hold.begin({ ...this.strikeOpts(), key: 'KeyQ' }); }
      return;
    }
    if (sleepy) {
      if (ch && night) ch.offered(site);
      p.say(null, ['E', `Sleep · ${wake}${night && ch ? ' · <kbd>←</kbd><kbd>→</kbd> later' : ''}`], q ? ['Q', 'Strike the tent · hold'] : null);
      if (inp.pressed('KeyE')) this.turnIn(site, night);
      else if (q && inp.pressed('KeyQ')) hold.begin({ ...this.strikeOpts(), key: 'KeyQ' });
      return;
    }
    hold.offer('Strike the tent', `you can turn in from ${clock12(from)}`, this.strikeOpts());
  }
  turnIn(site, night) {
    const ch = this.chores;
    if (night && ch && ch.openWake) ch.openWake(site, 0); else this.sleep('tent');
  }
  // from an hour and a half before sunset to sunrise the tent takes you (night0), and by day too when worn out (sleepy)
  get night0() { const d = this.day, { rise, set } = d.sunriseSunset, h = d.hours; return h >= (set ?? 19) - SLEEP_FROM || h < (rise ?? 6); }
  get sleepy() { return this.night0 || this.wornOut; }
  // done in by day (a site reached at dawn after a night on the water): the tent takes you anyway
  get wornOut() { const e = this.energy; return !!(e && e.live && e.needs && e.needs.rest < WORN_OUT); }

  // a chore (CHORES): the walker holds still while its time passes on the clock, then `done`
  chore(kind, done = null) { this.busy = { t: 0, passed: 0, kind, done }; }
  // the chore under way, per frame (real seconds): its hours spread over its seconds
  working(dt) {
    const b = this.busy, C = CHORES[b.kind] || CHORE;
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
    this.dropDraft();
    if (this.camp) this.strike({ quiet, stash: true });
    this.persist();
  }
  // pushing off: nothing is struck, put out or packed. A word of what is still ashore at the camp you leave: the tent,
  // the fire (chores.ashore), the barrel hung, the things set out. Each is marked so the inventory's own "left behind"
  // word does not say it again.
  leaving() {
    const p = this.player, inv = this.inv, parts = [], c = this.camp;
    hold.cancel(); this.dropDraft();
    const camp = c && Math.hypot(c.x - p.x, c.z - p.z) < ASHORE_NOTE ? c : null;
    const area = this.areaAt(p.x, p.z, AREA_R + 15) || (camp ? { x: camp.site ? camp.site.layout.fire.x : camp.x, z: camp.site ? camp.site.layout.fire.z : camp.z, r: AREA_R } : null);
    if (camp) parts.push(camp.stage >= 4 ? 'the tent is still up' : `the tent stands half pitched, ${tentOf(camp.item).words[camp.stage]}`);
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
      if (out.some((k) => k.item === 'pile')) named.push('some things on the ground');
      if (named.length) parts.push(`${listOf(named)} ${named.length > 1 ? 'are' : 'is'} set out`);
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
  wakeTime(choice = 'first') {
    const d = this.day, { rise: r, set } = d.sunriseSunset, rise = r ?? 6;
    if (d.hours >= rise && d.hours < (set ?? 19) - SLEEP_FROM) { const at = Math.min(23.5, d.hours + SLEEP_IN); return { at, hours: at - d.hours, day: true }; } // a sleep by day, worn out
    if (Number.isFinite(choice)) { const at = choice % 24; return { at, hours: ((at - d.hours) % 24 + 24) % 24 || 24 }; }
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
    if (kind === 'tent' && c && c.stage < 3) { this.note('The tent isn’t up yet: hold E at it to carry on pitching.'); return; }
    // turning in before sunset: the night's jump would carry the clock past the dusk meal (energy.js eats only the
    // breakfast of a jump), so supper is eaten now, unless one was had in the last few hours (a cooked one, say)
    const { at: wakeAt, hours, day: byDay } = this.wakeTime(choice);
    if (!byDay && set != null && d.hours < set && d.hours > 12 && e && e.autoMeal) e.autoMeal('Supper before bed');
    const fly = !c || c.stage >= 4, rain = !fly && this.rainyNight(hours);
    const q = this.tentQuality() * (this.wet ? WET : 1) * (fly ? 1 : NO_FLY) * (rain ? WET : 1);
    const W = this.weather, fc0 = W && W.forecast ? W.forecast(Math.max(1, Math.ceil(hours))) : [];
    // the weather now leads the night's line (as rainyNight counts it): rain falling at bedtime is a wet night's first
    const fc = W && W.state && (!fc0.length || fc0[0].state !== W.state) ? [{ state: W.state }, ...fc0] : fc0;
    const n = this.tripDay(!byDay && d.hours < 12 ? d.doy - 1 : d.doy); // the night of the evening's day (a sleep by day: today)
    const where = c && c.site ? this.siteName(c.site) : (p.placeName || 'Camp');
    const hh = Math.max(1, Math.floor(hours + 0.01)); // a short night is under seven hours: six and a half is 'six'
    const damp = this.wet || rain;
    const night = byDay ? `${word(hh)} ${plural(hh, 'hour')} by day${damp ? ' in wet gear' : ''}` : hours >= 7 ? (damp ? 'a damp night in wet gear' : fly ? 'a full night\'s sleep' : 'a full night, no fly on') : `a short night, ${word(hh)} ${plural(hh, 'hour')}${damp ? ' in wet gear' : ''}`;
    const card = {
      kicker: `${n ? `${byDay ? 'Day' : 'Night'} ${n} · ` : ''}${where}`,
      text: byDay ? 'Out like a light in the middle of the day, the fly zipped against the sun.' : nightLine(fc, d.season, fly),
      sub: `${clock12(d.hours)} to ${clock12(wakeAt)} · ${night}`,
    };
    this.night = { kind, q, hours, wakeAt, x: p.x, z: p.z, rain };
    const onDark = () => this.wake();
    const done = () => this.morning();
    if (this.veil && this.veil.card) this.veil.card({ ...card, onDark }).then(done, done);
    else { if (!this.card) this.card = new NightCard(); this.card.show({ ...card, onDark }).then(done, done); }
  }
  // at full dark: the clock to the waking hour (sunrise + a quarter hour, or later after a late night), the energy
  // back, the lamp off; rain through the mesh soaks the gear when the fly was off; a bear may find food on the ground
  wake() {
    const n = this.night, d = this.day;
    if (!n) return;
    if (this.lamp) this.lamp.toggle(false);
    this.jump(n.hours);
    if (Number.isFinite(n.wakeAt)) d.setClock(d.year, d.doy, n.wakeAt);
    const e = this.energy;
    if (e.sleep) e.sleep(n.q, n.hours); else e.value = Math.max(e.value, n.q); // the night's quality and its hours (energy.js)
    const lines = [];
    if (n.rain && this.state) { this.state.wet = true; lines.push('Rain came through the mesh in the night with no fly on: your gear is soaked.'); }
    else if (this.wet && this.player.gear && this.player.gear.sleepDry) { this.state.wet = false; lines.push('The gear dried overnight in the vestibule.'); } // hubs 2B: the four-season tent
    const bear = this.hang.bearNight(n.x, n.z);
    if (bear) lines.push(bear);
    this.morningNote = lines.length ? lines.join(' ') : null;
    this.log('sleep', { kind: n.kind, key: this.camp ? this.camp.key : null, q: +n.q.toFixed(2), hours: Math.round(n.hours * 10) / 10, fly: !n.rain && (!this.camp || this.camp.stage >= 4) });
    this.persist();
  }
  // after the card: the day's card (the HUD skips jumps)
  morning() {
    this.night = null;
    const d = this.day, h = this.hud, p = this.player, w = this.world, e = this.energy;
    const rise = d.sunriseSunset.rise, wind = this.wind, dayN = this.tripDay(d.doy);
    const here = p.placeName || w.lakeName(p.lakeId) || 'Open country';
    const hung = !this.sandbox && e.hungFood ? e.hungFood().words : ''; // the barrel hung overnight
    const food = this.sandbox ? '' : e.foodWords ? `${e.foodWords()} with you${hung ? ` · ${hung}` : ''}` : e.food > 0 ? `${fmtDays(e.food)} ${plural(e.food <= 1 ? 1 : 2, 'day')} of food` : 'the food pack is empty';
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
      if (!site || !this.registry.claim(s.key, PLAYER)) { this.pending = null; this.persist(); return; }
    }
    this.pending = null;
    const item = s.item === undefined ? null : s.item, stages = this.stagesFor(item || 'aframe');
    const c = { key: s.key || null, site, x: s.x, z: s.z, fdx: s.fdx, fdz: s.fdz, since: s.since ?? this.now, stage: 0, item, from: s.from || null, colour: stages.colour, stages };
    this.camp = c;
    this.poseTent(c);
    this.setStage(c, Number.isFinite(s.stage) ? s.stage : 4);
  }
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
