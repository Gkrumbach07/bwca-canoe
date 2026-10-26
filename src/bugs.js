// The bugs (the consequences pass, stream C: "bugs at dusk"; the owner, 2026-10-25: "a bear at camp if the food isn't
// hung, wind-bound days, and bugs at dusk, so the camp routines matter"). The real Boundary Waters' bugs:
// - blackflies by day from mid-May to the end of June, worst late May and early June, gone by early July;
// - mosquitoes at dusk and at dawn, and fewer through a calm night, from late May through August, worst mid-June to late
//   July, a few in September until the frosts;
// - both worst in calm warm air, in the woods and by still shallow water; a breeze grounds them (a breezy point is the
//   old trick for a camp), and hard rain and a cold night put them down.
// The world shows them first: the whine at your ears (audio-beds.js reads `whine`) and a few dark specks round your head,
// then the walker swats now and then, and then the cost, small, through energy.js's hook (`mods`): the bar drains a
// little, rest brings it back slower and warm air is less of a comfort; and a worse night in a tent left open (the fly
// off) or under the stars. The counters: the head net or a bug jacket (content C's kit), a smoky fire near (its smoke
// lies downwind), the wind where you stand, and the tent closed (the fly on, you inside it: the Rest dial or the night).
// One teaching moment each, the first time they matter (main.js registers `moments()` with hints.js).
//
//   bugs.attach({ player, day, weather, wind, world, energy, camp, fires, kit, canoe, scene, audio, inventory })
//   bugs.update()        each frame (main.js: in shop.update's chain, after kit.update, before energy.update)
//   bugs.afterPose(dt)   after canoe.update (main.js): the swat
//   bugs.mods            { drain, rest, comfort } (energy.js bugMods): the bar a game hour, its recovery, warm air's gain
//   bugs.now             { level, felt, guard, mosq, fly, wind, place, smoke, refuge } where you stand, as of the last look
//   bugs.whine           { mosq, fly } 0..1 as heard (head net or not: you hear them round it)
//   bugs.sleepNight()    → { rest, felt, shelter } | null   (energy.sleep: what the night in an open tent cost)
//   bugs.morning()       → a line for the morning after a bad night, once
//   bugs.moments()       'bugs' (the mosquitoes, content C's id, so a season that learned it keeps it) and 'blackflies'
import * as THREE from 'three';
import { GROUND } from './terrain-build.js';
import { shelterOf, insideTent, TENT_BUGS } from './tent.js';
import { hold } from './hold.js';
import { familyOf } from './kit.js';
import { env } from './audio-kit.js';
import { clamp, smoothstep } from './rng.js';

const LOOK = 0.25;          // real seconds between two reckonings of the bugs where you stand
const PROBE = 1.2;          // real seconds between two looks at the site (the trees, the water upwind, the shallows)
// what they cost unguarded at full strength: the bar a game hour, the share of rest's recovery and of warm air's comfort
// they take; what the head net and a bug jacket let through; how much a fire's smoke keeps off where it lies thickest
export const BUG = { drain: 0.02, rest: 0.5, comfort: 0.5, net: 0.35, jacket: 0.1, smoke: 0.75 };
// the night (sleepNight): the share of a night's rest they take at full strength, in a tent with the fly off and under
// the stars; what a head net or a bug jacket worn to sleep lets through; the wind after dark (it eases), the night's cooling
export const NIGHT_BUG = { open: 0.3, stars: 0.45, net: 0.5, jacket: 0.3, wind: 0.6, cool: 4, bad: 0.05 };
// the smoke of a fire (fires.near): all of it within NEAR metres, and DRIFT more downwind in a breeze
const SMOKE = { near: 3.5, drift: 5 };
const BUG_GONE = 0.5;       // game hours the bugs must be gone before their moment's episode ends (content join)
const SWAT = { from: 0.25, gap: [3, 9], dur: 0.62, hit: 0.22 }; // felt over `from`: a swat every gap s (fewer when felt is low)
const SWAT_MOVES = new Set(['idle', 'walk', 'wade', 'sit']); // player.move kinds a swat goes with
// (the cons join) the head net worn: a dark mesh veil from under the hat's brim to the collar, in head-bone space (the
// hat's brim is at about 0.15 up, 0.18 out), shown while the bugs are out (level over `from`) and the net is with you
// (not with a bug jacket, not asleep, not in first person, where the camera is inside it). Before, the net in reach let
// a third of them through and nothing on the walker showed it was on.
export const VEIL = { top: 0.152, bottom: -0.07, rTop: 0.172, rBot: 0.128, x: -0.006, color: 0x26261f, opacity: 0.4, from: 0.12 };

// --- the curves ---------------------------------------------------------------------------------------------------
const bump = (h, c, w) => Math.exp(-(((h - c) / w) ** 2));
// day of year: mosquitoes from late May, worst June to late July, thinning through August, a few into September until
// the frosts; blackflies from mid-May, worst late May and early June, gone by early July
export const mosqSeason = (doy) => smoothstep(138, 158, doy) * (1 - 0.75 * smoothstep(205, 245, doy)) * (1 - smoothstep(252, 275, doy));
export const flySeason = (doy) => smoothstep(132, 146, doy) * (1 - smoothstep(165, 188, doy));
// the hour: mosquitoes rise at dusk (worst half an hour after sunset) and dawn, hang about a calm night, and keep to
// the shade by day; blackflies are day biters, busiest in the morning and the early evening, gone at dark
export function mosqTime(h, rise = 5, set = 21) {
  return Math.max(bump(h, set + 0.5, 1.2), 0.7 * bump(h, rise + 0.3, 0.9), h > set + 1.5 || h < rise ? 0.45 : 0.16);
}
export function flyTime(h, rise = 5, set = 21) {
  const light = smoothstep(rise + 0.3, rise + 1.5, h) * (1 - smoothstep(set - 1, set + 0.3, h));
  return light * (0.75 + 0.25 * Math.max(bump(h, rise + 3, 2), bump(h, set - 2.5, 2)));
}
// the air: they fly above about 10 °C; hard rain grounds the mosquitoes, any rain the blackflies; a breeze where you
// stand grounds both (mosquitoes, weak fliers, by 3 m/s; blackflies a little later)
const warmM = (t) => smoothstep(7, 13, t), warmF = (t) => smoothstep(8, 14, t);
const wetM = (r) => 1 - 0.7 * smoothstep(0.35, 0.9, r), wetF = (r) => 1 - 0.85 * smoothstep(0.1, 0.6, r);
const calmM = (w) => 1 - 0.92 * smoothstep(0.8, 3, w), calmF = (w) => 1 - 0.85 * smoothstep(1.2, 4.5, w);

// how treed the ground is at a point, 0..1 (the cover's class and its canopy shade, as the soundscape reads them)
const TREED = new Set(['forest', 'forestLight', 'forestDark']);
function treesAt(w, x, z) {
  const cv = w.coverCell(w.cellI(x), w.cellJ(z));
  if (!cv) return 0.5; // not streamed in yet: the Boundary Waters are mostly woods
  const cls = GROUND[(cv >> 16) & 255] || '', shade = ((cv >>> 24) & 15) / 15;
  return TREED.has(cls) ? 0.55 + 0.45 * shade : cls === 'burn' ? 0.4 : cls === 'meadow' ? 0.12 : /^rock/.test(cls) ? 0.15 + 0.4 * shade : 0;
}

const JACKET = (id) => familyOf(id) === 'jacket';
const realNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
const NONE = { level: 0, felt: 0, guard: 1, mosq: 0, fly: 0, feltM: 0, feltF: 0, wind: 0, place: 0, smoke: 0, refuge: false };

export class Bugs {
  constructor() {
    this.t = {};
    this.mods = { drain: 0, rest: 1, comfort: 0 };
    this.now = { ...NONE };
    this.whine = { mosq: 0, fly: 0 };
    this.site = { woods: 0.5, exposure: 0.5, still: 0, at: null, wind: null, t: -1e9 };
    this.lookT = 0; this.last = realNow();
    this.bed = null;          // the night ahead, read at bedtime: { felt, shelter, doy, at }
    this.lastNight = null;    // what the last night cost: { rest, felt, shelter, at, told }
    this.swat = null;         // a swat under way: { t, side, kind, hit }
    this.swatIn = 4;          // real seconds to the next
    this.bugsAt = -1e9; this.fliesAt = -1e9; // when each was last thick on you (game hours), for the moments' episodes
    this.swats = 0;
  }
  attach(o = {}) {
    Object.assign(this.t, o);
    if (this.t.scene && !this.swarm) this.swarm = new Swarm(this.t.scene);
    if (!this.veil) this.veil = buildVeil();
    TENT_BUGS.out = () => this.now.level > 0.25; // tent.js: the Rest with no fly says the bugs get in
    return this;
  }

  // --- each frame -------------------------------------------------------------------------------------------------
  update() {
    const t1 = realNow(), dt = Math.min(0.5, Math.max(0, t1 - this.last)); this.last = t1;
    const d = this.t.day, abs = d ? d.doy * 24 + d.hours : 0;
    if (Math.abs(abs - (this.lastAbs ?? abs)) > 0.05) this.lookT = 0; // the clock jumped (a night, a nap): look again now
    this.lastAbs = abs;
    if ((this.lookT -= dt) <= 0) { this.lookT = LOOK; this.reckon(t1); }
    // the night ahead, the moment the night's card goes up (camp.js night)
    const cp = this.t.camp, n = cp && cp.night;
    if (n && !n.bugBed) { n.bugBed = true; this.bed = this.nightAhead(n); }
    const c = this.t.canoe, hb = c && c.figure && c.figure.bones ? c.figure.bones.head : null;
    if (this.swarm) {
      if (hb) hb.getWorldPosition(HEAD);
      this.swarm.update(dt, this.now, this.t.player, !!(n || (cp && cp.dialOpen)), hb ? HEAD : null);
    }
    // the head net on while they are out (VEIL)
    if (this.veil && hb) {
      if (this.veil.parent !== hb) hb.add(this.veil);
      const k = this.t.kit, ch = typeof window !== 'undefined' && window.__game ? window.__game.chase : null;
      this.veil.visible = !!(k && k.has('headnet') && !k.has(JACKET) && this.now.level > VEIL.from && !n && !(ch && ch.mode === 'first'));
    }
  }
  reckon(t1) {
    const s = this.state(t1);
    this.now = s;
    const m = this.mods;
    m.drain = BUG.drain * s.felt; m.rest = 1 - BUG.rest * s.felt; m.comfort = BUG.comfort * s.felt;
    this.whine.mosq = s.mosq; this.whine.fly = s.fly;
    const e = this.t.energy;
    if (e && e.live) { if (s.feltM > 0.22) this.bugsAt = e.now; if (s.feltF > 0.22) this.fliesAt = e.now; }
  }

  // --- where you stand ------------------------------------------------------------------------------------------
  // the site, every PROBE seconds or a few metres moved: how treed it is, how open to the wind (water upwind reaches
  // you; trees upwind break it), and how much still shallow water is near
  probe(t1) {
    const S = this.site, w = this.t.world, p = this.t.player, wind = this.t.wind;
    if (!w || !p || typeof w.shoreAt !== 'function') return S;
    const from = wind ? (wind.from * Math.PI) / 180 : null;
    const moved = !S.at || Math.hypot(S.at.x - p.x, S.at.z - p.z) > 6, turned = from !== null && S.wind !== null && Math.abs(Math.atan2(Math.sin(from - S.wind), Math.cos(from - S.wind))) > 0.4;
    if (!moved && !turned && t1 - S.t < PROBE) return S;
    S.t = t1; S.at = { x: p.x, z: p.z }; S.wind = from;
    const x = p.x, z = p.z;
    // the water close by (shallow counts whole, deep half) and how enclosed it is: open water far off all round is a big
    // lake's, which the wind works; a bay or a small lake shut in by its shores is still water
    let trees = treesAt(w, x, z) * 2, tw = 2, near = 0, nn = 0, far = 0, fn = 0;
    for (let k = 0; k < 8; k++) {
      const a = ((k + 0.5) / 8) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      const lx = x + cx * 12, lz = z + cz * 12;
      if (w.shoreAt(lx, lz) > 0) { trees += treesAt(w, lx, lz); tw++; }
      for (const r of [20, 45]) {
        const sx = x + cx * r, sz = z + cz * r; nn++;
        if (w.shoreAt(sx, sz) >= 0) continue;
        const i = w.cellI(sx), j = w.cellJ(sz);
        near += w.lakeCell(i, j) && w.levelCell(i, j) - w.heightAt(sx, sz) < 2.5 ? 1 : 0.5;
      }
      for (const r of [150, 300]) { fn++; if (w.shoreAt(x + cx * r, z + cz * r) < 0) far++; }
    }
    S.woods = clamp(trees / tw, 0, 1);
    // upwind: open water at these distances lets the wind at you; treed land in the first 30 m breaks it
    let open = 0, ws = 0, block = 0;
    if (wind) {
      const d = wind.dir, ux = -d.x, uz = -d.z;
      for (const [r, k] of [[6, 1], [14, 1], [30, 1], [60, 0.8], [120, 0.6], [240, 0.4]]) {
        const sx = x + ux * r, sz = z + uz * r; ws += k;
        if (w.shoreAt(sx, sz) < 0) open += k; else if (r <= 30) block = Math.max(block, treesAt(w, sx, sz));
      }
    }
    S.exposure = ws ? clamp((open / ws) * (1 - 0.8 * block), 0, 1) : 0.5;
    S.still = clamp((near / nn) * 2, 0, 1) * (1 - far / fn) * (1 - 0.5 * S.exposure);
    return S;
  }
  // the bugs where you are now: { level (0..1, unguarded), felt (what gets through), guard, mosq, fly (each species'
  // level), feltM, feltF, wind (m/s where you stand), place, smoke, refuge }
  state(t1 = realNow()) {
    const d = this.t.day, p = this.t.player;
    if (!d || !p) return { ...NONE };
    const doy = d.doy, sm = mosqSeason(doy), sf = flySeason(doy);
    if (sm <= 0.01 && sf <= 0.01) return { ...NONE };
    const E = this.t.energy, cp = this.t.camp;
    // inside a store, or in the tent with its fly on: none
    const shelter = shelterOf(cp), refuge = (insideTent(cp) && shelter === 'closed') || !!(E && typeof E.inside === 'function' && E.inside());
    if (refuge) return { ...NONE, refuge: true };
    const S = this.probe(t1), h = d.hours, ss = d.sunriseSunset || {}, set = Number.isFinite(ss.set) ? ss.set : 21, rise = Number.isFinite(ss.rise) ? ss.rise : 5;
    const W = this.t.weather || d.weather, L = W && W.look ? W.look : null;
    const temp = L && Number.isFinite(L.temp) ? L.temp : 15, rain = L ? L.rain || 0 : 0;
    const afloat = p.mode === 'paddle' || p.mode === 'swim';
    const ws = this.t.wind ? this.t.wind.speed : 2, wind = ws * (afloat ? 0.65 + 0.35 * S.exposure : 0.2 + 0.8 * S.exposure);
    // the place: on foot by the woods and the still water; afloat, close to shore (they come off the land a little way,
    // the blackflies further), and a canoe under way leaves the mosquitoes behind
    let pm, pf;
    if (p.mode === 'paddle') {
      const w = this.t.world, off = w && typeof w.shoreAt === 'function' ? -w.shoreAt(p.x, p.z) : 100, near = 1 - smoothstep(10, 60, off);
      const way = smoothstep(0.5, 2, Math.abs(p.speed || 0));
      pm = (0.08 + 0.42 * near) * (0.7 + 0.3 * S.still) * (1 - 0.6 * way); pf = (0.15 + 0.45 * near) * (1 - 0.4 * way);
    } else if (p.mode === 'swim') { pm = 0.3; pf = 0.3; }
    else { pm = clamp(0.45 + 0.35 * S.woods + 0.35 * S.still, 0.3, 1); pf = clamp(0.6 + 0.3 * S.woods, 0.3, 1); }
    const smoke = this.smokeAt(p, ws), kill = 1 - BUG.smoke * smoke;
    const mosq = clamp(sm * mosqTime(h, rise, set) * warmM(temp) * wetM(rain) * calmM(wind) * pm * kill, 0, 1);
    const fly = clamp(sf * flyTime(h, rise, set) * warmF(temp) * wetF(rain) * calmF(wind) * pf * kill, 0, 1);
    const level = 1 - (1 - mosq) * (1 - fly), guard = this.guard();
    return { level, felt: level * guard, guard, mosq, fly, feltM: mosq * guard, feltF: fly * guard, wind: +wind.toFixed(2), place: +pm.toFixed(2), smoke: +smoke.toFixed(2), refuge: false };
  }
  // what gets through: a bug jacket (an outfitter's signature, its family 'jacket'), else the head net, else all of them
  guard() {
    const k = this.t.kit;
    if (!k || typeof k.has !== 'function') return 1;
    return k.has(JACKET) ? BUG.jacket : k.has('headnet') ? BUG.net : 1;
  }
  // a fire's smoke where you stand, 0..1: a burning fire smokes more than its coals; within NEAR metres all round it,
  // and DRIFT metres more downwind in a breeze (the smoke lies along the ground that way)
  smokeAt(p, ws) {
    const F = this.t.fires, f = F && F.near;
    if (!f) return 0;
    const s0 = Math.max(f.heat || 0, 0.6 * (f.embers || 0));
    if (s0 < 0.05) return 0;
    const dx = p.x - f.x, dz = p.z - f.z, d = Math.hypot(dx, dz), wd = this.t.wind ? this.t.wind.dir : { x: 0, z: 1 };
    const down = d > 0.01 ? clamp((dx * wd.x + dz * wd.z) / d, 0, 1) : 1;
    const reach = SMOKE.near + SMOKE.drift * down * smoothstep(0.4, 2.5, ws);
    return (0.35 + 0.65 * s0) * (1 - smoothstep(reach * 0.6, reach, d));
  }

  // --- the night --------------------------------------------------------------------------------------------------
  // at bedtime: the mosquitoes through the hours to be slept here (the wind easing after dark, the air cooling), and
  // what keeps them off: the tent closed (none), open (the fly off) or none at all (under the stars); a head net or a bug
  // jacket at the camp, worn to sleep
  nightAhead(n) {
    const d = this.t.day, cp = this.t.camp, shelter = shelterOf(cp);
    const out = { felt: 0, shelter, doy: d ? d.doy : 0, at: this.t.energy ? this.t.energy.now : 0, nap: !!(n && n.nap) };
    if (!d || shelter === 'closed') return out;
    const sm = mosqSeason(d.doy);
    if (sm <= 0.01) return out;
    const S = this.site, ss = d.sunriseSunset || {}, set = Number.isFinite(ss.set) ? ss.set : 21, rise = Number.isFinite(ss.rise) ? ss.rise : 5;
    const W = this.t.weather || d.weather, L = W && W.look ? W.look : null, t0 = L && Number.isFinite(L.temp) ? L.temp : 15, rain = L ? L.rain || 0 : 0;
    const ws = (this.t.wind ? this.t.wind.speed : 2) * NIGHT_BUG.wind * (0.2 + 0.8 * S.exposure);
    const hours = n && Number.isFinite(n.hours) ? n.hours : 9, pm = clamp(0.45 + 0.35 * S.woods + 0.35 * S.still, 0.3, 1);
    let sum = 0;
    for (let k = 0; k < 8; k++) {
      const u = (k + 0.5) / 8, h = (d.hours + u * hours) % 24;
      sum += mosqTime(h, rise, set) * warmM(t0 - NIGHT_BUG.cool * u) * wetM(rain) * calmM(ws);
    }
    const k = this.t.kit, inCamp = (q) => !!(k && typeof k.inCamp === 'function' && k.inCamp(q));
    const guard = inCamp(JACKET) ? NIGHT_BUG.jacket : inCamp('headnet') ? NIGHT_BUG.net : 1;
    out.felt = clamp(sm * pm * (sum / 8) * guard, 0, 1);
    return out;
  }
  // energy.sleep: what the night cost in rest (the bed read at bedtime, within the last day)
  sleepNight() {
    const b = this.bed, e = this.t.energy;
    if (!b || b.nap || (e && Math.abs(e.now - b.at) > 30)) return null;
    this.bed = null;
    const k = b.shelter === 'stars' ? NIGHT_BUG.stars : b.shelter === 'open' ? NIGHT_BUG.open : 0;
    const rest = 1 - k * b.felt;
    this.lastNight = { rest: +rest.toFixed(3), felt: +b.felt.toFixed(3), shelter: b.shelter, at: e ? e.now : 0, told: false };
    return { rest, felt: b.felt, shelter: b.shelter };
  }
  // a line for the morning (main.js adds it to camp.js's morning note), once, after a night they cost you
  morning() {
    const n = this.lastNight;
    if (!n || n.told || 1 - n.rest < NIGHT_BUG.bad) return null;
    n.told = true;
    return n.shelter === 'stars' ? 'Mosquitoes all night under the open sky: you slept in snatches.' : 'With the fly off, the mosquitoes found a way in: a poor night’s sleep.';
  }

  // --- the swat -----------------------------------------------------------------------------------------------------
  // after the pose (main.js wraps canoe.update): now and then, while they are biting, the free hand slaps the neck or
  // the cheek, or waves them off the face; a slap's sound when it lands. On foot only, not mid-chore, not with both
  // hands full, not under the canoe or with the rod up.
  afterPose(dt) {
    const p = this.t.player, c = this.t.canoe;
    if (!p || !c || !c.figure || !c.figure.poser) return;
    // behind the title card update() does not run: no swarm frozen where it was, and no swat
    if (realNow() - this.last > 1) { if (this.swarm) this.swarm.pts.visible = false; this.swat = null; return; }
    const rdt = Math.min(0.1, Math.max(0, dt / (p.timeScale || 1)));
    if (!this.swat) {
      const f = this.now.felt;
      if (f < SWAT.from || !this.canSwat()) { this.swatIn = Math.max(this.swatIn, 1.5); return; }
      if ((this.swatIn -= rdt * (0.4 + f)) > 0) return;
      const side = this.freeHand();
      this.swatIn = SWAT.gap[0] + Math.random() * (SWAT.gap[1] - SWAT.gap[0]);
      if (!side) return;
      const r = Math.random(), kind = r < 0.45 ? 'neck' : r < 0.75 ? 'cheek' : 'wave';
      this.swat = { t: 0, side, kind, hit: false };
      this.swats++;
    }
    const s = this.swat;
    s.t += rdt;
    if (s.t >= SWAT.dur || !this.canSwat(true)) { this.swat = null; return; }
    if (!s.hit && s.kind !== 'wave' && s.t >= SWAT.hit) { s.hit = true; this.slap(); }
    this.poseSwat(s);
  }
  canSwat(going = false) {
    const p = this.t.player, c = this.t.canoe, cp = this.t.camp, st = c && c.state;
    if (!p || p.mode !== 'walk' || p.teleporting || p.landing) return false;
    if (st && (st.fishing || (st.crouch || 0) > 0.2)) return false;
    if (!going && (hold.active || (cp && (cp.busy || cp.night || cp.dialOpen)))) return false;
    const mv = p.move; if (mv && mv.kind && !SWAT_MOVES.has(mv.kind)) return false; // (not mid-vault, mid-climb or jogging)
    return true;
  }
  // 'R' or 'L', the hand with nothing in it (the right first), or null
  freeHand() {
    const inv = this.t.inventory, h = inv && inv.attached ? inv.hands : null;
    if (!h) return 'R';
    return !h[0] ? 'R' : !h[1] ? 'L' : null;
  }
  // the arm to the neck, the cheek or across the face, eased in and out over the pose the walk made
  poseSwat(s) {
    const fig = this.t.canoe.figure, P = fig.poser, J = fig.joints, B = fig.bones, side = s.side, sg = side === 'L' ? -1 : 1;
    const names = ARM[side];
    for (let i = 0; i < names.length; i++) Q0[i].copy(B[names[i]].quaternion);
    const t = s.t, inW = smoothstep(0, SWAT.hit, t), outW = 1 - smoothstep(SWAT.hit + 0.1, SWAT.dur, t), w = Math.min(inW, outW);
    if (w <= 0.001) return;
    const sh = J['arm' + side].p, hd = J.head.p, nk = J.neck.p, wind = 1 - smoothstep(0, SWAT.hit, t); // wind: drawn back before it lands
    if (s.kind === 'neck') {
      TGT.set(nk.x - 0.035 - 0.04 * wind, nk.y + 0.06 + 0.08 * wind, nk.z + sg * (0.075 + 0.1 * wind));
      AXIS.set(-0.3, 1, 0); POLE.set(sh.x + 0.08, sh.y + 0.3, sh.z + sg * 0.32); PALM.set(0.2, 0, -sg); // (the elbow up and out)
    } else if (s.kind === 'cheek') {
      TGT.set(hd.x + 0.07 + 0.06 * wind, hd.y - 0.02, hd.z + sg * (0.085 + 0.12 * wind));
      AXIS.set(0.2, 1, 0); POLE.set(sh.x + 0.05, sh.y - 0.35, sh.z + sg * 0.4); PALM.set(-0.2, 0, -sg);
    } else { // a wave across the face, from the side over to the other cheek and back
      const u = Math.sin(Math.PI * smoothstep(0.05, SWAT.dur - 0.1, t));
      TGT.set(hd.x + 0.24, hd.y - 0.01 + 0.03 * u, hd.z + sg * (0.2 - 0.3 * u));
      AXIS.set(0, 1, 0.2 * sg); POLE.set(sh.x + 0.1, sh.y - 0.4, sh.z + sg * 0.35); PALM.set(-1, 0, -0.3 * sg);
    }
    try { P.arm(side, TGT, AXIS, POLE, PALM); } catch { this.swat = null; return; }
    for (let i = 0; i < names.length; i++) { const b = B[names[i]]; Q1.copy(b.quaternion); b.quaternion.slerpQuaternions(Q0[i], Q1, w); } // (not in place: slerpQuaternions copies its first argument over itself first)
  }
  // the slap: a short smack of skin at the head
  slap() {
    const au = this.t.audio;
    if (!au || !au.ctx || !au.enabled || typeof au.voice !== 'function') return;
    try {
      const c = this.t.canoe, hb = c.figure.bones.head; hb.getWorldPosition(HEAD);
      const v = au.voice({ x: HEAD.x, y: HEAD.y, z: HEAD.z, gain: 0.16, ref: 3, wet: 0.06, air: false, pri: 0 });
      if (!v) return;
      const t = v.t, R = au.rand || Math.random, k = 0.9 + R() * 0.25;
      const b = v.filter('bandpass', 1500 * k, 0.8), g = v.gain(0); v.noise('white', b); b.connect(g); g.connect(v.input);
      env(g.gain, t, 0.001, 1, 0, 0.035);
      const lo = v.filter('lowpass', 420, 0.7), g2 = v.gain(0); v.noise('pink', lo); lo.connect(g2); g2.connect(v.input);
      env(g2.gain, t, 0.002, 0.7, 0, 0.05);
      v.until(t + 0.12);
      au.count('bug-swat');
    } catch { /* a nicety */ }
  }

  // --- the moments (hints.js MOMENTS, their triggers) ------------------------------------------------------------------
  moments() {
    // (the content join: a gust thins them for a minute and they're back, so an episode ends only once they've been gone
    // BUG_GONE game hours)
    const due = (key, at) => (rec) => {
      const f = this.now[key], e = this.t.energy; if (!e || !e.live) return false;
      if (rec && rec.ep) return e.now - (this[at] ?? -1e9) < BUG_GONE ? 1 - Math.max(f, 0.22) : false;
      return f >= 0.4 ? 1 - f : false;
    };
    return [
      { id: 'bugs', prio: 2, recur: 'while', text: 'Mosquitoes. A head net, the fire’s smoke, or the tent.', short: 'Bugs.', due: due('feltM', 'bugsAt') },
      { id: 'blackflies', prio: 2, recur: 'while', text: 'Blackflies. The head net keeps them off.', short: 'Blackflies.', due: due('feltF', 'fliesAt') },
    ];
  }
}

const HEAD = new THREE.Vector3(), TGT = new THREE.Vector3(), AXIS = new THREE.Vector3(), POLE = new THREE.Vector3(), PALM = new THREE.Vector3();
const ARM = { R: ['armR', 'elbowR', 'foreR', 'twistR', 'handR'], L: ['armL', 'elbowL', 'foreL', 'twistL', 'handL'] };
const Q0 = ARM.R.map(() => new THREE.Quaternion()), Q1 = new THREE.Quaternion();

// The bugs themselves (the world shows state first): a few dark specks round your head while they are out, more the
// thicker they are, whether or not the net keeps them off you. Mosquitoes dance loosely about the head; blackflies are a
// tight, jittery knot close in at the ears and the neck. One Points object (content C's), in the scene from the start so
// the shader prewarm compiles it, hidden while there are none.
function buildVeil() {
  const V = VEIL, h = V.top - V.bottom;
  const geo = new THREE.CylinderGeometry(V.rTop, V.rBot, h, 22, 1, true);
  // (the tent's ghost's material: the same program, compiled at the start)
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: V.color, transparent: true, opacity: V.opacity, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(V.x, V.bottom + h / 2, 0); m.name = 'head net'; m.visible = false; m.castShadow = false; m.renderOrder = 2;
  return m;
}
const SWARM_N = 40;
class Swarm {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SWARM_N * 3), 3));
    // (the content join: a speck a few pixels across at any distance: sized in the world, one that came within a hand's
    // breadth of the camera was drawn as a black square 30 to 50 px across)
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x14120f, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }));
    this.pts.frustumCulled = false; this.pts.visible = false; this.pts.name = 'bugs'; this.pts.renderOrder = 14; // (after the water)
    this.seed = Array.from({ length: SWARM_N }, (_, i) => [Math.sin(i * 12.9898) * 43758.5453 % 1, Math.sin(i * 78.233) * 12345.678 % 1, Math.sin(i * 39.425) * 24634.6345 % 1]);
    this.t = 0; this.n = 0;
    scene.add(this.pts);
  }
  update(dt, s, p, hide, head = null) {
    const lv = s ? s.level : 0, total = !p || hide || !(lv > 0.12) ? 0 : Math.round(SWARM_N * clamp((lv - 0.12) / 0.7, 0.15, 1));
    const flies = total ? Math.round(total * (s.fly / Math.max(1e-3, s.fly + s.mosq))) : 0;
    this.n = total;
    this.pts.visible = total > 0;
    if (!total) return;
    this.t += dt;
    const g = this.pts.geometry, a = g.getAttribute('position'), cx = head ? head.x : p.x, cz = head ? head.z : p.z;
    const y0 = head ? head.y + 0.1 : typeof p.groundAt === 'function' ? p.groundAt(p.x, p.z) + 1.55 : 0;
    for (let i = 0; i < SWARM_N; i++) {
      if (i >= total) { a.setXYZ(i, cx, -1e4, cz); continue; }
      const [u, v, w] = this.seed[i];
      if (i < flies) { // a blackfly: close in, quick and jerky, low about the ears and the neck
        const t = this.t * (3.2 + 2.5 * Math.abs(u)), r = 0.12 + 0.16 * Math.abs(v), j = 0.03 * Math.sin(t * 13 + w * 5);
        a.setXYZ(i, cx + r * Math.sin(t + u * 9) + j, y0 - 0.12 + 0.12 * Math.sin(t * 1.7 + w * 6) + j, cz + r * Math.cos(t * 1.31 + v * 7));
      } else { // a mosquito: a looser dance about the head
        const t = this.t * (1.6 + 2.2 * Math.abs(u)), r = 0.25 + 0.45 * Math.abs(v);
        a.setXYZ(i, cx + r * Math.sin(t + u * 9) + 0.05 * Math.sin(t * 7.3 + v), y0 + 0.35 * Math.sin(t * 0.8 + w * 6) + 0.04 * Math.sin(t * 11 + u), cz + r * Math.cos(t * 1.13 + v * 7));
      }
    }
    a.needsUpdate = true;
  }
}

export const bugs = new Bugs();
