import * as THREE from 'three';
import { buildTentMesh, tentPose, TENT_COLOURS } from './props.js';
import { save } from './save.js';
import { clock12, longDate, plural, fmtDays, compassLong } from './hud.js';
import { SPECIES } from './fishing.js';
import { daysInYear } from './astro.js';

// Camp and night (the trip core, stream C). On foot at a campsite: pitch your tent at the site's pad (props.js
// c.layout), light a fire in the grate (fire.js), cook a hot meal on it, sleep in the tent to morning under a night
// card; launching strikes the tent and drowns the fire. Off a site after dark, in Adventure, a bivouac under the
// canoe (not allowed in the BWCA: a ranger's note in the morning); in sandbox a tent goes up anywhere flat and dry.
// An hour before sunset, in Adventure, a note names the nearest free site; once it is dark a note suggests the
// headlamp (headlamp.js, H).
//
// The registry says who holds each site: keys are `Math.round(x):Math.round(z)` (the index's sites have no ids). The
// player holds with 'player'; later the parties met on the water hold with their own ids, and the player's prompt at
// a held site reads "Taken". Only the player's claim is saved: in trip.state.camp when there is a trip (trip.js),
// otherwise under its own key (save.js 'camp').
//
// What it reads from the other streams, feature-detected: trip (null: sandbox rules), trip.adventure, trip.state
// (.camp, .wet), trip.log; day.advance(hours) (else setClock with the midnight rollover); energy.sleep(q),
// energy.meal(kind), energy.restBoost; packs.unload({ x, z, heading }); veil.card({ kicker, text, sub, onDark }).

export const PLAYER = 'player';
export const campKey = (c) => `${Math.round(c.x)}:${Math.round(c.z)}`;

const SITE_R = 22;          // metres from a site's fire ring within which you are at that site
const AT_GRATE = 2.4;       // metres from the ash within which E is the fire's
const AT_TENT = 3.2;        // and from the tent's middle within which it is the tent's
const HULL_REACH = 3;       // player.js: within this of the canoe on the ground E is the canoe's
const PITCH = { seconds: 1.6, hours: 0.25 }; // the tent goes up over 1.6 s while a quarter of an hour passes
const SLEEP_FROM = 1.5;     // hours before sunset the tent will take you
const WAKE_AT = 0.25;       // hours after sunrise you wake
const QUALITY = { tent: 1, wet: 0.8, bivouac: 0.7 };
const DRY_HOURS = 0.5;      // game hours by a fire that dry wet gear
const STRIKE_AFAR = 500;    // metres afloat from a pitched tent at which it is struck (a reload afloat, a teleport)
const REST_SITE = 40;       // metres from a site's centre that count as at a campsite for resting
const COOK_GAP = 4;         // game hours between two cooked meals

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
  nearestFree(x, z, r = Infinity) {
    let best = null;
    for (const c of this.world.campsites) {
      const dx = c.x - x, dz = c.z - z;
      if (dx > r || dx < -r || dz > r || dz < -r) continue;
      const d = Math.hypot(dx, dz);
      if (d < r && (!best || d < best.d)) { const key = campKey(c); if (this.isFree(key)) best = { site: c, key, d }; }
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
    Object.assign(this, { trip: null, veil: null, packs: null, weather: null, fishing: null, outfitter: null, audio: null, wind: null, lamp: null, fires: null, links: null }, o);
    this.registry = o.registry || new CampRegistry(this.world);
    this.tiles.dynamic = this.tiles.dynamic || [];
    this.tents = [];          // the pool: meshes not standing anywhere
    this.tents.push(this.makeTent()); // one now, behind the title card
    this.camp = null;         // the player's camp: { key, site, x, z, fdx, fdz, since, mesh, obstacle }
    this.busy = null;         // pitching: { t, passed }
    this.night = null;        // sleeping: { kind, q, hours, ... }
    this.card = null;         // the fallback night card (NightCard), made on first use
    this.lastMode = null; this.booted = false; this.pending = null;
    this.cookedAt = -Infinity; this.still = 0; this.dry = 0; this.lastNow = null;
    this.nudged = null; this.lampHinted = null; this.ranger = false;
    this.restT = 0; this.atSite = false;
    this.lit = new Set();     // the fires the player lit (keys): drowned when the player pushes off
  }

  // --- what the other streams give, or the sandbox -----------------------------------------------------------
  get adventure() { return !!(this.trip && this.trip.adventure); }
  get sandbox() { return !this.adventure; }
  get state() { return this.trip && this.trip.state ? this.trip.state : null; }
  get wet() { const s = this.state; return !!(s && s.wet); }
  get now() { return this.day.doy * 24 + this.day.hours; }
  get dark() { return this.day.elevation < -3; }
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
  // a little time passing, not a jump (the quarter hour of pitching, spread over its frames)
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

  // --- the frame ----------------------------------------------------------------------------------------------
  // before player.update: the walker holds still while the tent goes up or the night card is up
  before() {
    if (this.busy || (this.card && this.card.active)) this.player.input.paused = true;
  }

  // after player.update (and the outfitter's prompt): the camp's keys and prompts. dt: real seconds.
  update(dt) {
    const p = this.player, now = this.now;
    const dh = this.lastNow === null ? 0 : Math.min(0.5, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    if (!this.booted) {
      this.booted = true; this.lastMode = p.mode;
      if (this.links) { const l = this.links() || {}; this.trip = l.trip || null; this.veil = l.veil || null; this.packs = l.packs || null; }
      // a trip that ends (an evacuation, the end at a counter, abandoned) takes the camp down with it, quietly
      if (this.trip && this.trip.on) for (const k of ['exit', 'evac']) this.trip.on(k, () => this.leave({ quiet: true }));
      this.restore();
    }
    if (this.card) this.card.update(dt);
    if (p.teleporting) return;
    this.restorePending();
    // launching strikes the tent and drowns the fire (any change to the paddle: a launch, a teleport, an evac)
    if (this.lastMode !== 'paddle' && p.mode === 'paddle') this.leave();
    this.lastMode = p.mode;
    if (this.camp && p.mode === 'paddle' && Math.hypot(this.camp.x - p.x, this.camp.z - p.z) > STRIKE_AFAR) this.strike({ quiet: true });
    if (this.lamp && this.player.input.pressed('KeyH')) this.lamp.toggle();
    this.rest(dt, dh);
    if (this.busy) { this.pitching(dt); return; }
    if (this.night) return;
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

  // an hour before sunset in Adventure: the nearest free site; once dark: the headlamp
  notes() {
    const d = this.day, p = this.player, { set } = d.sunriseSunset;
    const stamp = d.year * 1000 + d.doy, evening = d.hours >= 12 ? stamp : stamp - 1;
    if (this.adventure && !this.camp && set != null && d.hours >= set - 1 && d.hours < set && this.nudged !== stamp && !this.atSite) {
      this.nudged = stamp;
      const n = this.registry.nearestFree(p.x, p.z, 6000);
      if (n) {
        const dx = n.site.x - p.x, dz = n.site.z - p.z, deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
        const far = n.d < 1000 ? `${Math.max(50, Math.round(n.d / 50) * 50)} m` : `${(n.d / 1000).toFixed(1)} km`;
        const id = p.nearWater ? p.nearWater(n.site.x, n.site.z, 8) : 0, lake = id ? this.world.lakeName(id) : null;
        this.note(`An hour of light left. The nearest free campsite is ${far} ${compassLong(deg)}${lake ? `, on ${lake}` : ''}.`, 9);
      } else this.note('An hour of light left, and no free campsite near. Find one before dark.', 9);
    }
    if (this.lamp && !this.lamp.on && this.dark && this.lampHinted !== evening) {
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
    const p = this.player;
    if (p.mode !== 'walk') return;
    const drop = p.carry && p.carry.drop;
    if (drop && Math.hypot(drop.x - p.x, drop.z - p.z) <= HULL_REACH) return; // the canoe's E (player.js)
    if (p.prompt && (p.prompt.key || /<kbd>/.test(p.prompt.text || ''))) return; // a pack's, a dock's, a portage's (its Q too: the walk back for a pack)
    const site = this.nearestSite(p.x, p.z, SITE_R, true);
    if (site) this.atSitePrompts(site);
    else this.offSitePrompts();
  }

  atSitePrompts(site) {
    const p = this.player, key = campKey(site), L = site.layout, holder = this.registry.holder(key);
    const name = this.siteName(site);
    if (holder && holder !== PLAYER) { this.say(`${name} · Taken: another party is camped here`); return; }
    const mine = !!(this.camp && this.camp.key === key);
    if (Math.hypot(L.fire.x - p.x, L.fire.z - p.z) < AT_GRATE && this.firePrompts(site, key)) return;
    if (mine) { if (Math.hypot(this.camp.x - p.x, this.camp.z - p.z) < AT_TENT) this.tentPrompts(); return; }
    this.offer('Pitch the tent', `${name}, free`, () => this.pitch(site));
  }

  firePrompts(site, key) {
    const F = this.fires, now = this.now;
    if (!F) return false;
    if (!F.isLit(key, now)) {
      const f = F.get(key);
      this.offer(f ? 'Build the fire up again' : 'Light the fire', f ? 'the embers are still warm' : null, () => this.lightFire(site));
      return true;
    }
    const meal = this.mealHere();
    if (meal) { this.offer(meal.label, meal.hint, () => this.cook(meal)); return true; }
    if (F.left(key, now) < 1) { this.offer('Add wood', 'the fire is burning low', () => { F.feed(key, now); this.persist(); }); return true; }
    return false;
  }

  tentPrompts() {
    const d = this.day, { rise, set } = d.sunriseSunset, h = d.hours;
    const from = (set ?? 19) - SLEEP_FROM;
    if (h >= from || h < (rise ?? 6)) this.offer('Sleep', `until morning, about ${clock12(((rise ?? 6) + WAKE_AT) % 24)}`, () => this.sleep('tent'));
    else this.say(`Your tent · you can turn in from ${clock12(from)}`);
  }

  offSitePrompts() {
    const p = this.player;
    if (this.camp) { if (!this.camp.key && Math.hypot(this.camp.x - p.x, this.camp.z - p.z) < AT_TENT) this.tentPrompts(); return; }
    if (this.adventure) {
      if (this.dark) this.offer('Bivouac here', 'off-site: not allowed in the BWCA', () => this.sleep('bivouac'));
      return;
    }
    // sandbox: a tent anywhere flat and dry, once you stand still a moment
    if (this.still > 1.2) { const spot = this.spotAhead(); if (spot) this.offer('Pitch the tent here', null, () => this.pitchAt(spot)); }
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

  // a flat, dry, clear spot for a tent 2.4 m ahead of the walker (sandbox): { x, z, fdx, fdz } or null
  spotAhead() {
    const p = this.player, w = this.world, f = p.forward, x = p.x + f.x * 2.4, z = p.z + f.z * 2.4;
    if (!w.isReady(x, z) || w.shoreAt(x, z) < 3) return null;
    let lo = Infinity, hi = -Infinity;
    for (const [u, v] of [[-1.3, -1], [1.3, -1], [1.3, 1], [-1.3, 1], [0, 0]]) { const h = this.tiles.groundAt(x + u, z + v); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (hi - lo > 0.45) return null;
    if (this.tiles.treesNear(x, z, 1.6).some((t) => !(t.top !== undefined && t.top - lo < 0.25))) return null;
    return { x, z, fdx: -f.x, fdz: -f.z };
  }

  // --- the tent -------------------------------------------------------------------------------------------------
  makeTent(colour = TENT_COLOURS[0]) {
    const m = buildTentMesh(colour);
    m.matrixAutoUpdate = false; m.visible = false;
    this.scene.add(m);
    return m;
  }
  // stand a tent for camp c (its pad), with its box for the walker; grow: from flat over the pitching
  raise(c) {
    const m = this.tents.pop() || this.makeTent();
    const pose = tentPose((x, z) => this.tiles.groundAt(x, z), c.x, c.z, c.fdx, c.fdz);
    c.mesh = m; c.pose = pose.matrix; c.obstacle = pose.obstacle; c.y = pose.y;
    this.setRise(c, 1);
    m.visible = true;
    this.tiles.dynamic.push(c.obstacle);
  }
  setRise(c, k) {
    const m = c.mesh, e = k * k * (3 - 2 * k);
    m.matrix.copy(c.pose);
    if (k < 1) m.matrix.multiply(new THREE.Matrix4().makeScale(1 + 0.15 * (1 - e), 0.06 + 0.94 * e, 1 + 0.15 * (1 - e)));
    m.matrixWorldNeedsUpdate = true;
  }
  lower(c) {
    if (c.mesh) { c.mesh.visible = false; this.tents.push(c.mesh); c.mesh = null; }
    const i = this.tiles.dynamic.indexOf(c.obstacle);
    if (i >= 0) this.tiles.dynamic.splice(i, 1);
  }

  pitch(site) {
    const key = campKey(site), L = site.layout.pad;
    if (this.camp) this.strike({ quiet: true });
    if (!this.registry.claim(key, PLAYER)) { this.note('Taken: another party has this site.'); return; }
    this.start({ key, site, x: L.x, z: L.z, fdx: L.fdx, fdz: L.fdz });
  }
  pitchAt(spot) {
    if (this.camp) this.strike({ quiet: true });
    this.start({ key: null, site: null, ...spot });
  }
  start(c) {
    c.since = this.now;
    this.camp = c;
    this.raise(c);
    this.setRise(c, 0);
    this.busy = { t: 0, passed: 0 };
    this.layOut(c);
    this.log('camp', { key: c.key, x: Math.round(c.x), z: Math.round(c.z), offsite: !c.key });
    this.persist();
  }
  // the packs out by the door, fronts to the fire (the packs keep nothing in a save: a camp that comes back up after
  // a reload sets them out again, while you are ashore)
  layOut(c) {
    if (!this.packs || !this.packs.unload || this.player.mode !== 'walk') return;
    const sx = -c.fdz, sz = c.fdx;
    this.packs.unload({ x: c.x + c.fdx * 1.75 + sx * 1.0, z: c.z + c.fdz * 1.75 + sz * 1.0, heading: Math.atan2(-c.fdz, c.fdx) });
  }
  // the quarter hour of pitching, over a second and a half
  pitching(dt) {
    const b = this.busy, c = this.camp;
    b.t += dt;
    const k = Math.min(1, b.t / PITCH.seconds), want = PITCH.hours * k;
    this.pass(want - b.passed); b.passed = want;
    if (c && c.mesh) this.setRise(c, k);
    this.say('Pitching the tent…');
    if (k >= 1) {
      this.busy = null;
      if (c && this.audio) this.audio.emit('tent-zip', { x: c.x + c.fdx * 0.9, y: c.y + 0.5, z: c.z + c.fdz * 0.9 });
    }
  }
  // take the camp down (the claim goes, the tent comes down)
  strike({ quiet = false } = {}) {
    const c = this.camp;
    if (!c) return;
    this.lower(c);
    if (c.key) this.registry.release(c.key, PLAYER);
    this.camp = null; this.busy = null;
    this.persist();
    if (!quiet) this.note('You strike the tent and pack up.');
  }
  // pushing off: strike the tent, drown the fires you lit (quiet: without a word, as when a trip ends)
  leave({ quiet = false } = {}) {
    const F = this.fires;
    let drowned = false;
    if (F) for (const key of this.lit) if (F.get(key)) { F.douse(key); drowned = true; }
    this.lit.clear();
    if (this.camp) { const had = this.camp; this.strike({ quiet: true }); if (!quiet) this.note(had.key ? `You strike the tent${drowned ? ' and drown the fire' : ''}. The site is free again.` : 'You strike the tent.'); }
    else if (drowned && !quiet) this.note('You drown the fire before you push off.');
    this.persist();
  }

  // --- the fire and the pot -----------------------------------------------------------------------------------
  lightFire(site) {
    const key = campKey(site), F = this.fires, now = this.now;
    if (F.get(key)) F.feed(key, now); else F.kindle(key, site.layout.fire, now);
    this.lit.add(key);
    this.persist();
  }
  // what E at a burning fire cooks now: the best fish on the stringer at any hour, else supper in the evening or
  // breakfast in the morning while there is food; null when nothing is due
  mealHere() {
    const now = this.now, d = this.day, h = d.hours, { rise, set } = d.sunriseSunset, e0 = this.energy;
    if (now - this.cookedAt < COOK_GAP) return null;
    if (e0 && e0.lastMealKind && e0.lastMealKind !== 'cold' && now - e0.lastMealAbs < COOK_GAP) return null; // the saved meal (a reload forgets cookedAt)
    const st = this.fishing && this.fishing.stringer;
    if (st && st.length) {
      let i = 0; for (let k = 1; k < st.length; k++) if (st[k].length > st[i].length) i = k;
      const name = (SPECIES[st[i].species] && SPECIES[st[i].species].name) || 'fish';
      return { fish: i, label: `Cook the ${name.toLowerCase()}`, hint: `${Math.round(st[i].length)} cm, off the stringer` };
    }
    const e = this.energy, food = this.sandbox || e.food >= 0.5;
    const evening = set != null && h >= set - 3 && h < set + 4, morning = rise != null && h >= rise - 1 && h < rise + 3;
    if (!evening && !morning) return null;
    if (!food) return { label: null };
    return { label: evening ? 'Cook supper' : 'Cook breakfast', hint: 'a hot meal on the grate', supper: evening };
  }
  cook(meal) {
    const e = this.energy;
    if (!meal.label) return;
    let ok, line;
    if (meal.fish !== undefined) {
      const f = this.fishing.stringer.splice(meal.fish, 1)[0], name = (SPECIES[f.species] && SPECIES[f.species].name.toLowerCase()) || 'fish';
      ok = e.meal ? e.meal('fish') !== false : (e.value = Math.min(1, e.value + 0.45), true);
      line = `You fry the ${Math.round(f.length)} cm ${name} on the grate. A ration saved.`;
    } else {
      ok = e.meal ? e.meal('hot') : e.eat(meal.supper ? 'Supper' : 'Breakfast');
      const left = e.food <= 0 ? 'the pack is empty' : `${fmtDays(e.food)} ${plural(e.food <= 1 ? 1 : 2, 'day')} of food left`;
      line = `A hot ${meal.supper ? 'supper' : 'breakfast'} by the fire${this.sandbox ? '' : `: ${left}`}.`;
    }
    if (!ok) { this.note('The food pack is empty.'); return; }
    this.cookedAt = this.now;
    if (e.meal || meal.fish !== undefined) this.note(line);
  }

  // --- the night ----------------------------------------------------------------------------------------------
  sleep(kind) {
    const d = this.day, p = this.player, rise = d.sunriseSunset.rise ?? 6;
    const hours = ((rise + WAKE_AT - d.hours) % 24 + 24) % 24 || 24;
    const q = kind === 'bivouac' ? QUALITY.bivouac : this.wet ? QUALITY.wet : QUALITY.tent;
    const fc = this.weather && this.weather.forecast ? this.weather.forecast(Math.max(1, Math.ceil(hours))) : [];
    const n = this.tripDay(d.hours < 12 ? d.doy - 1 : d.doy); // the night of the evening's day
    const where = kind === 'bivouac' ? 'Under the canoe, off-site' : this.camp && this.camp.site ? this.siteName(this.camp.site) : (p.placeName || 'Camp');
    const card = {
      kicker: `${n ? `Night ${n} · ` : ''}${where}`,
      text: nightLine(fc, d.season, kind),
      sub: `${clock12(d.hours)} to ${clock12((rise + WAKE_AT) % 24)} · ${kind === 'bivouac' ? 'a cold, cramped night on the ground' : this.wet ? 'a damp night in wet gear' : 'a full night\'s sleep'}`,
    };
    this.night = { kind, q, hours, x: p.x, z: p.z };
    const onDark = () => this.wake();
    const done = () => this.morning();
    if (this.veil && this.veil.card) this.veil.card({ ...card, onDark }).then(done, done);
    else { if (!this.card) this.card = new NightCard(); this.card.show({ ...card, onDark }).then(done, done); }
  }
  // at full dark: the clock to sunrise + a quarter hour, the energy back, the lamp off, the fire burned out
  wake() {
    const n = this.night, d = this.day;
    if (!n) return;
    if (this.lamp) this.lamp.toggle(false);
    this.jump(n.hours);
    const r = d.sunriseSunset.rise;
    if (r != null) d.setClock(d.year, d.doy, r + WAKE_AT);
    const e = this.energy;
    if (e.sleep) e.sleep(n.q); else e.value = Math.max(e.value, n.q);
    if (this.camp && this.camp.key && this.fires) this.fires.douse(this.camp.key);
    this.cookedAt = -Infinity;
    this.log('sleep', { kind: n.kind, key: this.camp ? this.camp.key : null, q: n.q, hours: Math.round(n.hours * 10) / 10 });
    if (n.kind === 'bivouac') { this.log('offsite', { x: Math.round(n.x), z: Math.round(n.z) }); this.ranger = true; }
    this.persist();
  }
  // after the card: the day's card (the HUD skips jumps), and after a bivouac the ranger's word
  morning() {
    this.night = null;
    const d = this.day, h = this.hud, p = this.player, w = this.world, e = this.energy;
    const rise = d.sunriseSunset.rise, wind = this.wind, dayN = this.tripDay(d.doy);
    const here = p.placeName || w.lakeName(p.lakeId) || 'Open country';
    const food = this.sandbox ? '' : e.food > 0 ? `${fmtDays(e.food)} ${plural(e.food <= 1 ? 1 : 2, 'day')} of food` : 'the food pack is empty';
    if (h && h.showPlace) {
      h.showPlace(`${longDate(d.year, d.doy)}${rise != null ? ` · sunrise ${clock12(rise)}` : ''}${wind ? ` · ${wind.label.toLowerCase()} from the ${wind.compassLong}` : ''}`, dayN ? `Day ${dayN}` : 'A new day', [here, food].filter(Boolean).join(' · '));
      h.lastDawnDoy = d.doy;
    }
    if (this.ranger) {
      this.ranger = false;
      this.note('A ranger paddling by at first light: “Morning. Next time use one of the designated sites, with the grate and the latrine. It keeps the shore wild.”', 11);
    }
  }

  // --- saving ---------------------------------------------------------------------------------------------------
  serialize() {
    const c = this.camp;
    if (!c) return null;
    const f = c.key && this.fires ? this.fires.get(c.key) : null;
    return { key: c.key, pitched: true, fireUntil: f ? f.until : null, since: c.since, x: c.x, z: c.z, fdx: c.fdx, fdz: c.fdz };
  }
  persist() {
    const s = this.serialize();
    if (this.state) { this.state.camp = s; if (this.outfitter && this.outfitter.save) this.outfitter.save(); } // in the trip's own document
    else save.write('camp', s);
  }
  restore() {
    const s = this.trip && this.trip.state ? this.trip.state.camp : save.read('camp');
    this.pending = s && s.pitched ? s : null;
  }
  // a saved camp goes back up once its site's tile has built (and its claim is still to be had)
  restorePending() {
    const s = this.pending;
    if (!s) return;
    let c;
    if (s.key) {
      const site = this.registry.site(s.key);
      if (!site) { this.pending = null; this.persist(); return; }
      if (!site.layout) return;
      if (!this.registry.claim(s.key, PLAYER)) { this.pending = null; this.persist(); return; }
      const L = site.layout.pad;
      c = { key: s.key, site, x: L.x, z: L.z, fdx: L.fdx, fdz: L.fdz };
      const now = this.now;
      if (this.fires && s.fireUntil != null && s.fireUntil > now) { const f = this.fires.kindle(s.key, site.layout.fire, now - 1, s.fireUntil - now + 1); f.until = s.fireUntil; this.lit.add(s.key); }
    } else {
      if (!this.world.isReady(s.x, s.z) || !this.tiles.locate(s.x, s.z)) return;
      c = { key: null, site: null, x: s.x, z: s.z, fdx: s.fdx, fdz: s.fdz };
    }
    this.pending = null;
    c.since = s.since ?? this.now;
    this.camp = c;
    this.raise(c);
    this.layOut(c);
  }
}

// The night's weather, in a line, from the forecast for the hours slept (weather.js forecast: one entry per change)
function nightLine(fc, season, kind) {
  const st = fc.map((f) => f.state), has = (k) => st.includes(k), first = st[0], last = st[st.length - 1];
  const cold = season && season.cold > 0.6, under = kind === 'bivouac' ? 'on the hull' : 'on the fly';
  if (has('storm')) return `Thunder walked down the lake in the night. The ${kind === 'bivouac' ? 'canoe' : 'fly'} held.`;
  if (has('rain')) return last === 'rain' ? `Rain ${under} all night.` : `Rain ${under} in the small hours, easing by first light.`;
  if (has('light-rain')) return `A light rain came and went ${under}.`;
  if (last === 'fog') return 'A still night. Fog on the water by first light.';
  if (first === 'overcast' && last === 'overcast') return 'A grey, quiet night under low cloud.';
  if (first === 'overcast') return 'The cloud broke up after midnight: stars, then a cold dawn.';
  if (cold) return `A clear, cold night. Frost ${kind === 'bivouac' ? 'on the hull' : 'on the fly'} at dawn.`;
  return 'A clear night, the stars down to the treeline. Loons out on the lake.';
}
