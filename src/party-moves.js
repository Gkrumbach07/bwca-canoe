// The parties on the move (p2 C: people phase 2, docs/plans/people.md "How you meet them", on the water and on a
// portage). The owner, 2026-10-26: "move onto moving parties".
//
// parties.js plans each party's travel day (legPlan: away from their site or the landing, the water legs and the carries
// between, lunch, in at the next site, all on the clock and the same on every reload). This module follows the legs that
// come within MOVES.simR of you and draws them through the actor layer (actors.js), whose ranges and budgets hold: their
// people within 60 m (eight at most, a canoe's crew whole, what is in view first), the hulls whole within 250 m, a far
// hull to 1.2 km, nothing past that. Beyond, a party is only a place along its plan.
//
//   - In the morning they load at their site's landing (the canoes in the water by the bank, the people beside them),
//     get in and push off at the leave hour; the camp's tents go once nobody looks (party-camps.js has the hand-off).
//   - On the water they paddle a path over the lake (a search over the water's own cells, the basin they are in, kept off
//     the banks; from the release's tiles, the ones loaded or fetched, so the path is the same on every client), the
//     canoes a few lengths apart, a stroke a canoe, at their pace on the clock; a stop afloat at lunch.
//   - At a carry: out at the landing, over the trail in a line nine metres apart (the canoes overhead, the packs on
//     backs: the canoe's middle keeps to the tread and its ends swing), the canoes set in the water at the far end, and
//     back for the second load where they have more packs than hands; lunch at the carry nearest midday.
//   - In the afternoon they come in at their next night's site; the camp comes up as they unload, the canoes go up the
//     bank and the people to the fire (party-camps.js), the fire later.
//
// Meeting them:
//   - On the water by day (not 22:00–6:00), within MOVES.greetR, one of them may say a word once a day (the camps' own
//     greetings, rarer far from a store). Closer than MOVES.holdR they hold off you: a soft steer away, nothing solid
//     (and a canoe pushed off another's hull at MOVES.touch). E on one within MOVES.talkR (the dot, pointer.js) is a word
//     about their trip (phase 1's lines), and they stop a moment while it is said.
//   - On a portage the loaded carry has the trail: a party about to cross waits at the landing while you carry; if you
//     stand on the tread ahead of them they stop and wait (nobody passes); one walking back empty, or anyone while you
//     are the one loaded, steps off the tread and lets you by. The first time a loaded party comes at you on a trail, a
//     moment says it (hints.js 'partytrail'). The waits go on their clock (a lag, made up while you are not by them).
//
//   const moves = new PartyMoves({ world, parties, actors, tiles, player, day, camera, people, dialogue, partyCamps })
//   moves.update(dt)      before actors.update (main.js p2 C), dt the actors' (the clock's time-lapse in it)
//   moves.targets         pointer.js partyTargets: what the dot can point at (people on foot, canoes on the water)
//   moves.moments()       the 'partytrail' moment for hints.js
//   moves.lagOf(id)       hours a party is behind its plan (party-camps.js)
//   moves.stats(), moves.active (Map plan id -> the followed leg)
import * as THREE from 'three';
import { MOVE } from './parties.js';
import { trailOf } from './actors.js';
import { FLOAT_OFFSET } from './poses.js';
import { PRI } from './dialogue.js';
import { mulberry32 } from './rng.js';
import { CLOCK } from './pace.js'; // r2: the one clock (game seconds a real one): a boarding's steps are timed in real seconds
import { SEATS, floorAt } from './hull.js';

export const MOVES = {
  simR: 1500,        // m: legs whose bounds come this near you are followed
  dropR: 1800,       // and let go past this
  sync: 0.5,         // s between the passes that choose them
  greetR: 80,        // m: a word on the water (or a trail) by day, once a day
  holdR: 25,         // m: closer than this on the water they steer off you
  holdOff: 9,        // m: the most they swing aside for you
  touch: 1.7,        // m from a party's keel line within which your canoe is eased off it
  talkR: 4,          // m: E on a canoe this near (the dot)
  talkFor: 8,        // s (real) they stop while a word is said
  quiet: [22, 6],
  word: [0.55, 0.22], store: [3000, 15000], // the chance of a word, by a store and far from one (party-camps.js CAMPS)
  ahead: 11,         // m ahead of one of them on the tread within which you hold them up
  tread: 1.3,        // m off the trail's line that is standing on the tread
  clear: 1.9,        // m off it that is clear of it
  aside: 1.4,        // m one of them steps off the tread to let you by
  teachR: 30,        // m: a loaded party coming at you on a trail this near: the moment
  slot: 2.6,         // m between canoes at a landing (side by side, bows to the bank)
  spread: 8,         // m between canoes crossing open water
  stagger: 9,        // m one behind the next out there
  catchUp: 0.6,      // game hours of delay made up an hour while you are not by them
  near: 150,         // m: by them (a delay is not made up)
  fixR: 320,         // m (r2 2): a landing's places checked for trunks and steep ground this near you (its tiles in, its people not yet drawn)
  pathMs: 1.5,       // ms a frame for the water paths' searches
  actR: 1300,        // m: a party this near is in the actor layer (its far hulls show to 1.2 km)
  dormR: 1400,       // and let go of it past this
};
const RAW_MAX = 36;
// r2 (NPC motion, the owner 2026-11-05: "lined up in a perfect row ... they like teleport into the canoes, and they do this
// weird non-physics based sort of paddle away"): the canoes lie along the bank, each crew by its own hull at jobs (packs
// carried down to it, kneeling to load, a hand on the gunwale, a word with someone); they get in one at a time, the bow
// first, the stern last and pushing off, each a walk to the side, a step over the gunwale and down to the kneel, the
// hull rocking; and out again the same way. Real seconds (the clock's game seconds over CLOCK).
const BOARD = { walk: 3.2, step: 1.6, gap: 0.1, first: 3.4, total: 11 }; // s: the walk to the side, each step in, the board's length
// r2 2: the last in (the stern) pushes her off first: hands on the gunwale, a step after her as she goes, the bank foot
// pushing; she slides out PUSH.out m off the bank before they step in (s, m)
const PUSH = { dur: 1.6, out: 0.85, step: 0.4 };
// r2 2: the hand-over with the camp: a canoe carried up or down at HAND.carry m/s (real), lifted or set down over
// HAND.lift s, the walk to her HAND.reach s; the others walk at HAND.walk, out of a tent after HAND.emerge s, and those
// the camp does not draw into one over the landing's last HAND.tent s
const HAND = { carry: 1.0, lift: 0.6, reach: 2.8, walk: 1.1, emerge: 1.2, tent: 14, flip: 1.4 }; // (flip: r2 2 verify, s to roll her up onto the shoulders or down off them)
const OUT = { first: 2.0, step: 1.5, gap: 0.15, walk: 3.0 };            // s: the first out, each step out, the walk to their place
const SEAT_X = { stern: SEATS.stern.x, bow: SEATS.bow.x, mid: -0.42 };
const SLOT_ALONG = 6.2;      // m between canoes lying along the bank
const ORDER = { bow: 0, mid: 1, stern: 2 }; // who gets in first (the bow) and out first (the bow)
const FIRM = { max: 0.8, ok: 0.7, reach: 2.4 }; // r2 2: ground steeper than max is not stood on: the nearest no steeper than ok, within reach (m)
export const PATH_DEBUG = { on: false, log: [] }; // (the tests')    // fine tiles fetched for the paths beyond those loaded, kept
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const headingOf = (dx, dz) => Math.atan2(-dz, dx); // the player's heading convention: forward (cos h, -sin h)
const hashStr = (s) => { let h = 2166136261; for (const c of String(s || '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// --- the water's own cells: the lake ids and shore distances of the fine tiles (the loaded ones the world holds, the
// rest fetched as the tile worker fetches them), so a path is the same whatever is loaded round you ----------------
class Masks {
  constructor(world) { this.w = world; this.raw = new Map(); this.wait = new Set(); this.failed = new Set(); }
  tile(tx, ty) {
    const w = this.w;
    if (tx < 0 || ty < 0 || tx >= w.ntx || ty >= w.nty) return NONE;
    const k = ty * w.ntx + tx, s = w.slots[k];
    if (s) return s;
    const r = this.raw.get(k);
    if (r) { r.t = performance.now(); return r; }
    if (this.failed.has(k)) return NONE;
    if (!this.wait.has(k)) this.fetch(tx, ty, k);
    return null;
  }
  async fetch(tx, ty, k) {
    this.wait.add(k);
    try {
      const res = await fetch(this.w.tileUrl(tx, ty));
      if (!res.ok) throw new Error(String(res.status));
      const buf = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const n = this.w.side * this.w.side;
      this.raw.set(k, { lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n), t: performance.now() });
      if (this.raw.size > RAW_MAX) { let old = null; for (const [kk, v] of this.raw) if (!old || v.t < old[1].t) old = [kk, v]; if (old) this.raw.delete(old[0]); }
    } catch (e) { this.failed.add(k); console.warn('party-moves: tile', tx, ty, e); } finally { this.wait.delete(k); }
  }
  // every fine tile under a box is here (else a fetch is under way for the missing)
  ready(x0, z0, x1, z1) {
    const w = this.w, M = w.tileMetres, a = Math.floor((x0 - w.originX) / M), b = Math.floor((z0 - w.originZ) / M), c = Math.floor((x1 - w.originX) / M), d = Math.floor((z1 - w.originZ) / M);
    let ok = true;
    for (let ty = b; ty <= d; ty++) for (let tx = a; tx <= c; tx++) if (!this.tile(tx, ty)) ok = false;
    return ok;
  }
  // a cell's lake id and shore distance (m: + land, - water); call ready() over the box first
  cell(i, j, out) {
    const w = this.w, T = w.tile, t = this.tile(Math.floor(i / T), Math.floor(j / T));
    if (!t || !t.lake) { out.lake = 0; out.sd = 100; return out; }
    const k = ((((j % T) + T) % T) + w.halo) * w.side + (((i % T) + T) % T) + w.halo;
    out.lake = t.lake[k]; out.sd = t.sd[k] * 0.1;
    return out;
  }
}
const NONE = { lake: null, sd: null };

// --- a path over a basin's water ------------------------------------------------------------------------------
// from a to b (landing points), a search over the cells of the basin's water at least 8 m off the banks (then any of
// its water), pulled straight where the water allows and its corners rounded: { pts, cum, L }; null for no way; 'wait'.
// A generator: it yields every few thousand cells, so a long one is spread over frames (PartyMoves.pathOf, MOVES.pathMs a frame)
// (a box round the two first; then, where the water between goes round out of it, a lake's narrow arm opening far off,
// a box three times the size)
function* waterPath(masks, world, basinOf, a, b, basin) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  // (and, a river or a creek narrower than the coarse cells, at every cell)
  for (const [pad, most, fine] of [[Math.max(260, d * 0.3), 260000, false], [Math.max(260, d * 0.3), 700000, true], [Math.max(1600, d * 1.2), 700000, false]]) {
    if (fine && d <= 1600) continue; // (the first was at every cell already)
    const r = yield* waterPathIn(masks, world, basinOf, a, b, basin, pad, most, fine);
    if (r !== null) return r;
  }
  return null;
}
function* waterPathIn(masks, world, basinOf, a, b, basin, pad, most, fine = false) {
  let ops = 0;
  const w = world, c = w.cell, d = Math.hypot(b.x - a.x, b.z - a.z);
  const x0 = Math.min(a.x, b.x) - pad, z0 = Math.min(a.z, b.z) - pad, x1 = Math.max(a.x, b.x) + pad, z1 = Math.max(a.z, b.z) + pad;
  if (!masks.ready(x0, z0, x1, z1)) return 'wait';
  let st = d > 1600 && !fine ? 2 : 1;
  const i0 = Math.floor((x0 - w.originX) / c), j0 = Math.floor((z0 - w.originZ) / c);
  let nx = Math.ceil((x1 - x0) / c / st), nz = Math.ceil((z1 - z0) / c / st);
  while (nx * nz > most) { st++; nx = Math.ceil((x1 - x0) / c / st); nz = Math.ceil((z1 - z0) / c / st); }
  const N = nx * nz, wet = new Uint8Array(N), q = { lake: 0, sd: 0 };
  for (let gj = 0; gj < nz; gj++) for (let gi = 0; gi < nx; gi++) {
    if ((++ops & 8191) === 0) yield;
    masks.cell(i0 + gi * st, j0 + gj * st, q);
    wet[gj * nx + gi] = q.lake && basinOf(q.lake) === basin ? (q.sd <= -8 ? 2 : q.sd < 0 ? 1 : 0) : 0;
  }
  const at = (gi, gj) => ({ x: w.originX + (i0 + gi * st + 0.5) * c, z: w.originZ + (j0 + gj * st + 0.5) * c });
  const snap = (p, lvl) => {
    const ci = Math.round(((p.x - w.originX) / c - 0.5 - i0) / st), cj = Math.round(((p.z - w.originZ) / c - 0.5 - j0) / st);
    const R = Math.ceil(90 / (c * st));
    for (let r = 0; r <= R; r++) {
      let best = -1, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const gi = ci + di, gj = cj + dj; if (gi < 0 || gj < 0 || gi >= nx || gj >= nz || wet[gj * nx + gi] < lvl) continue;
        const dd = di * di + dj * dj; if (dd < bd) { bd = dd; best = gj * nx + gi; }
      }
      if (best >= 0) return best;
    }
    return -1;
  };
  let cells = null, lvl = 2;
  for (; lvl >= 1 && !cells; lvl--) {
    const s = snap(a, lvl), t = snap(b, lvl);
    if (PATH_DEBUG.on) PATH_DEBUG.log.push({ pad, st, nx, nz, lvl, s, t, wet2: wet.reduce((n, v) => n + (v === 2), 0), wet1: wet.reduce((n, v) => n + (v >= 1), 0) });
    if (s < 0 || t < 0) continue;
    const prev = new Int32Array(N).fill(-2); prev[s] = -1;
    const Q = new Int32Array(N); let qh = 0, qt = 0; Q[qt++] = s;
    while (qh < qt) {
      if ((++ops & 8191) === 0) yield;
      const k = Q[qh++]; if (k === t) break;
      const gi = k % nx, gj = (k / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const A = gi + di, B = gj + dj; if (A < 0 || B < 0 || A >= nx || B >= nz) continue;
        const m = B * nx + A; if (wet[m] < lvl || prev[m] !== -2) continue;
        if (di && dj && (wet[gj * nx + A] < lvl || wet[B * nx + gi] < lvl)) continue; // (no corner cut across a point)
        prev[m] = k; Q[qt++] = m;
      }
    }
    if (prev[t] === -2) continue;
    cells = []; for (let k = t; k >= 0; k = prev[k]) cells.push(k); cells.reverse();
  }
  if (!cells) return null;
  lvl++; // (the level it was found at)
  const raw = cells.map((k) => at(k % nx, (k / nx) | 0));
  // pulled straight where the water allows (sampled every 4 m on the fine cells, kept off the banks)
  const keep = lvl === 2 ? 5 : 0.5, P0 = { x: a.x, z: a.z }, P1 = { x: b.x, z: b.z };
  const clear = (p, r) => {
    const L = Math.hypot(r.x - p.x, r.z - p.z), n = Math.max(1, Math.ceil(L / 4));
    for (let k = 0; k <= n; k++) {
      const x = p.x + ((r.x - p.x) * k) / n, z = p.z + ((r.z - p.z) * k) / n;
      masks.cell(Math.floor((x - w.originX) / c), Math.floor((z - w.originZ) / c), q);
      if (!q.lake || basinOf(q.lake) !== basin || q.sd > -keep) return false;
    }
    return true;
  };
  // (each step the farthest point in sight, found by doubling then halving: the water's sight is near enough monotone)
  const pulled = [raw[0]], n = raw.length;
  for (let i = 0; i < n - 1;) {
    yield;
    let lo = 1, hi = 1;
    while (i + hi * 2 < n && clear(raw[i], raw[i + hi * 2])) { lo = hi * 2; hi *= 2; }
    hi = Math.min(n - 1 - i, hi * 2);
    if (lo < 1 || !clear(raw[i], raw[i + lo])) lo = 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (clear(raw[i], raw[i + m])) lo = m; else hi = m; }
    const j = i + (hi > lo && i + hi < n && clear(raw[i], raw[i + hi]) ? hi : lo);
    pulled.push(raw[j]); i = j;
  }
  const pts = [P0, ...pulled, P1].map((p) => [p.x, p.z]);
  // the corners rounded where the rounding stays on the water
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], [cx, cz] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, bz - az), l2 = Math.hypot(cx - bx, cz - bz), r = Math.min(30, l1 / 3, l2 / 3);
    if (!(r > 1)) { out.push(pts[i]); continue; }
    const p0 = [bx + ((ax - bx) / l1) * r, bz + ((az - bz) / l1) * r], p2 = [bx + ((cx - bx) / l2) * r, bz + ((cz - bz) / l2) * r];
    const arc = [];
    let ok = true;
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, u = 1 - t, x = u * u * p0[0] + 2 * u * t * bx + t * t * p2[0], z = u * u * p0[1] + 2 * u * t * bz + t * t * p2[1];
      masks.cell(Math.floor((x - w.originX) / c), Math.floor((z - w.originZ) / c), q);
      if (!q.lake || q.sd > -1) { ok = false; break; }
      arc.push([x, z]);
    }
    if (ok) out.push(...arc); else out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  const cum = [0];
  for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  return { pts: out, cum, L: cum[cum.length - 1], lvl };
}
// the point s metres along a polyline { pts, cum } into out { x, z, tx, tz } (the way ahead, unit)
function along(P, s, out, ahead = 1.5) {
  const pts = P.pts, cum = P.cum, n = pts.length;
  if (n < 2) { out.x = pts[0][0]; out.z = pts[0][1]; out.tx = 1; out.tz = 0; return out; }
  s = clamp(s, 0, P.L);
  let lo = 1, hi = n - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
  const i = lo, t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
  out.x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t; out.z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
  // the way ahead: toward the point `ahead` metres on (so a bend is rounded, the hull's ends swinging)
  const s2 = Math.min(P.L, s + ahead);
  let j = i; while (j < n - 1 && cum[j] < s2) j++;
  const t2 = (s2 - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]);
  let dx = pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * t2 - out.x, dz = pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * t2 - out.z;
  let l = Math.hypot(dx, dz);
  if (l < 1e-4) { dx = pts[n - 1][0] - pts[n - 2][0]; dz = pts[n - 1][1] - pts[n - 2][1]; l = Math.hypot(dx, dz) || 1; }
  out.tx = dx / l; out.tz = dz / l;
  return out;
}
const polyline = (pts) => { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { pts, cum, L: cum[cum.length - 1] }; };
// the nearest point of a polyline to (x, z): { s (m along), d (m off it), side (+1 left of the way, -1 right) }
function nearestOn(P, x, z) {
  const pts = P.pts; let best = { s: 0, d: Infinity, side: 1 };
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], az = pts[i - 1][1], dx = pts[i][0] - ax, dz = pts[i][1] - az, L2 = dx * dx + dz * dz || 1e-6;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { s: P.cum[i - 1] + t * Math.sqrt(L2), d, side: dx * (z - az) - dz * (x - ax) > 0 ? 1 : -1 };
  }
  return best;
}
// progress 0..1 through a leg of D seconds that gets under way over r and stops over r (a trapezoid of speed)
function ramp01(t, D, r) {
  r = Math.min(r, D / 2); t = clamp(t, 0, D);
  const span = D - r; if (!(span > 0)) return t / Math.max(1e-6, D);
  const s = t < r ? (t * t) / (2 * r) : t <= D - r ? t - r / 2 : span - ((D - t) * (D - t)) / (2 * r);
  return clamp(s / span, 0, 1);
}
function rampRate(t, D, r) { r = Math.min(r, D / 2); const span = D - r; if (!(span > 0)) return 1 / Math.max(1e-6, D); return (t < r ? t / r : t <= D - r ? 1 : (D - t) / r) / span; }

// --- one party's leg, followed -------------------------------------------------------------------------------------
class Leg {
  constructor(plan) {
    this.plan = plan; this.party = plan.party; this.id = plan.id;
    this.stations = null; this.paths = new Map(); this.ready = false; this.prep = 0;
    this.persons = []; this.boats = []; this.seg = null; this.segI = -1;
    this.aside = new Map(); this.off = new Map(); this.held = false; this.talkHold = 0; this.gone = 0; this.lastH = null;
    this.speakers = [];
  }
}

export class PartyMoves {
  constructor({ world, parties, actors, tiles = null, player, day, camera = null, people = null, dialogue = null, partyCamps = null }) {
    Object.assign(this, { world, parties, actors, tiles, player, day, camera, people, dialogue, partyCamps });
    this.masks = new Masks(world);
    this.basinOf = (id) => parties.basinOfLake(id);
    this.active = new Map(); this.lags = new Map();
    this.t = MOVES.sync; this.lastH = null; this.teachOn = false; this.cost = { ms: 0, n: 0, max: 0 }; this.paths = 0; this.pathMs = [];
    this.targets = (ray, near, water) => this.pointTargets(ray, near, water);
  }
  get now() { const d = this.day; return d ? d.hours : 0; }
  get rate() { const d = this.day; return d && d.running !== false ? d.rate || 1 : 0; }
  lagOf(id) { const l = this.lags.get(id); return l ? l.lag : 0; }
  get quiet() { const h = this.now; return h >= MOVES.quiet[0] || h < MOVES.quiet[1]; }

  // --- which legs to follow -----------------------------------------------------------------------------------
  choose() {
    const P = this.parties, T = P.today, h = this.now, p = this.player, want = new Map();
    for (const { party, k } of P.legsOn(T)) {
      const plan = P.legPlan(party, k);
      if (!plan) continue;
      const lag = this.lagOf(party.id), h0 = plan.segs[0].h0, h1 = plan.end + lag;
      if (h < h0 - 0.02 || h > h1 + 0.05) continue;
      const b = plan.box, dx = Math.max(b[0] - p.x, 0, p.x - b[2]), dz = Math.max(b[1] - p.z, 0, p.z - b[3]), d = Math.hypot(dx, dz);
      if (d < (this.active.has(plan.id) ? MOVES.dropR : MOVES.simR)) want.set(plan.id, plan);
    }
    for (const [id, L] of [...this.active]) if (!want.has(id) || want.get(id) !== L.plan) { if (this.canLetGo(L)) this.drop(L); }
    for (const [id, plan] of want) if (!this.active.has(id)) this.active.set(id, new Leg(plan));
  }
  // a leg ended (they came in, or out at the landing) goes once the camp has them, or once nobody sees them go
  canLetGo(L) {
    if (!L.ready) return true;
    const h = this.now - this.lagOf(L.party.id);
    if (h < L.plan.end) return !this.seen(L);
    if (L.plan.to.kind === 'site' && this.partyCamps) { const D = this.partyCamps.drawn.get(L.plan.to.key); if (D && D.canoesIn) return true; }
    return !this.seen(L) || (L.gone += MOVES.sync) > 6;
  }
  seen(L) {
    const p = this.player, cam = this.camera;
    for (const a of [...L.boats, ...L.persons]) {
      if (a.hidden || !(a.near || a.bind || a.hull)) continue;
      const dx = a.x - p.x, dz = a.z - p.z, d = Math.hypot(dx, dz);
      if (d < 40) return true;
      if (!cam) return true;
      const e = cam.matrixWorld.elements, fx = -e[8], fz = -e[10], fl = Math.hypot(fx, fz) || 1;
      if ((dx * fx + dz * fz) / (d * fl) > 0.34) return true;
    }
    return false;
  }
  drop(L) {
    for (const b of L.boats) b.remove();
    for (const a of L.persons) a.remove();
    L.boats = []; L.persons = [];
    if (L.plan.to.stay) this.parties.seenIn.delete(L.plan.to.stay.id);
    this.active.delete(L.id);
  }
  clear() { for (const L of [...this.active.values()]) this.drop(L); }

  // --- getting a leg ready: its landings, its water paths, its people and canoes ---------------------------------
  // (a landing: the water by the bank nearest the site, the trail's end or the put-in, its cell on the basin's water
  // 1.3–5 m off the bank, the bank's way and the shore's; from the release's cells, so the same on every client)
  landingAt(x, z, basin, ref = null, clearOf = 0) {
    const w = this.world, c = w.cell, R = 90, cx = ref ? ref.x : x, cz = ref ? ref.z : z;
    if (!this.masks.ready(cx - R - 20, cz - R - 20, cx + R + 20, cz + R + 20)) return 'wait';
    const ci = Math.floor((cx - w.originX) / c), cj = Math.floor((cz - w.originZ) / c), q = { lake: 0, sd: 0 }, r = Math.ceil(R / c);
    let best = null, bd = Infinity;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      this.masks.cell(ci + di, cj + dj, q);
      if (!q.lake || this.basinOf(q.lake) !== basin || q.sd > -1.3 || q.sd < -5) continue;
      if (clearOf > 0 && Math.hypot(w.originX + (ci + di + 0.5) * c - x, w.originZ + (cj + dj + 0.5) * c - z) < clearOf) continue; // (a store's dock)
      const d = di * di + dj * dj; if (d < bd) { bd = d; best = { i: ci + di, j: cj + dj, sd: q.sd }; }
    }
    if (!best) return null;
    const sdAt = (i, j) => this.masks.cell(i, j, q).sd;
    let gx = sdAt(best.i + 1, best.j) - sdAt(best.i - 1, best.j), gz = sdAt(best.i, best.j + 1) - sdAt(best.i, best.j - 1);
    let gl = Math.hypot(gx, gz);
    if (gl < 1e-3) { gx = cx - (w.originX + (best.i + 0.5) * c); gz = cz - (w.originZ + (best.j + 0.5) * c); gl = Math.hypot(gx, gz) || 1; }
    const ux = gx / gl, uz = gz / gl, X = w.originX + (best.i + 0.5) * c, Z = w.originZ + (best.j + 0.5) * c;
    // (the canoes' middles about 2.6 m off the bank, bows in)
    const off = -2.6 - best.sd;
    return { x: X + ux * off, z: Z + uz * off, ux, uz, tx: -uz, tz: ux, sd: -2.6, basin, shore: { x: X + ux * -best.sd, z: Z + uz * -best.sd } };
  }
  // a station: where a leg stops (a site, the landing, a carry's end): its landing and where the canoes and people go
  // (shift: m along the shore from the landing, so parties sharing a store's beach or a carry's landing in the same
  // hour each have their own stretch of it; a site is one party's)
  station(kind, at, basin, trail = null, shift = 0) {
    const ref = trail ? { x: trail.pts[0][0], z: trail.pts[0][1] } : null, clear = kind === 'ep' ? 18 : 0; // (at a store, off along the beach from its dock)
    let L = this.landingAt(at.x, at.z, basin, ref, clear);
    if (L === 'wait') return L;
    if (!L) {
      // (no water of the basin by the bank there, as the cells have it: the launch itself, facing the trail or the site)
      const tx = (ref ? ref.x : at.x + 1) - at.x, tz = (ref ? ref.z : at.z) - at.z, tl = Math.hypot(tx, tz) || 1;
      L = { x: at.x, z: at.z, ux: tx / tl, uz: tz / tl, tx: -tz / tl, tz: tx / tl, sd: -2.6, basin, shore: { x: at.x + (tx / tl) * 2.6, z: at.z + (tz / tl) * 2.6 } };
    }
    if (shift) {
      const S2 = this.landingAt(at.x, at.z, basin, { x: L.shore.x + L.tx * shift, z: L.shore.z + L.tz * shift }, clear);
      if (S2 === 'wait') return S2;
      if (S2 && Math.hypot(S2.x - L.x, S2.z - L.z) < Math.abs(shift) * 2 + 10) L = S2;
    }
    return { kind, at, basin, L, trail, slots: [], spots: [], checked: false };
  }
  // the canoes side by side at the bank, bows in (slot k of n), and the people standing above them (spot j of m)
  // (r2: lying along the bank, bow the way they go, where the water off the bank takes the hulls so; else bows in)
  slot(S, k, n, out) {
    const L = S.L;
    if (S.par == null) S.par = this.alongOk(S, n);
    if (S.par) { const o = (k - (n - 1) / 2) * SLOT_ALONG, sg = S.tsign || 1; out.x = L.x + L.tx * o; out.z = L.z + L.tz * o; out.h = headingOf(L.tx * sg, L.tz * sg); return out; }
    const o = (k - (n - 1) / 2) * MOVES.slot;
    out.x = L.x + L.tx * o; out.z = L.z + L.tz * o; out.h = headingOf(L.ux, L.uz);
    return out;
  }
  // the shore distance at (x, z) from the release's cells (bilinear; + land, - water), as the paths read them
  sdAt(x, z) {
    const w = this.world, c = w.cell, fx = (x - w.originX) / c - 0.5, fz = (z - w.originZ) / c - 0.5, i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j, q = { lake: 0, sd: 0 };
    const v = (a, b) => this.masks.cell(a, b, q).sd;
    return (v(i, j) * (1 - ax) + v(i + 1, j) * ax) * (1 - az) + (v(i, j + 1) * (1 - ax) + v(i + 1, j + 1) * ax) * az;
  }
  alongOk(S, n) {
    const L = S.L;
    for (let k = 0; k < n; k++) {
      const o = (k - (n - 1) / 2) * SLOT_ALONG, x = L.x + L.tx * o, z = L.z + L.tz * o;
      if (!(this.sdAt(x, z) < -1.4) || !(this.sdAt(x + L.tx * 2.5, z + L.tz * 2.5) < -0.6) || !(this.sdAt(x - L.tx * 2.5, z - L.tz * 2.5) < -0.6)) return false;
    }
    return true;
  }
  spot(S, j, out, Lg = null) {
    const L = S.L;
    if (S.spots[j]) { const s = S.spots[j]; out.x = s.x; out.z = s.z; out.h = s.h; return out; }
    let x, z, h;
    const seat = Lg && Lg.seatOf ? Lg.seatOf.get(j) : null;
    if (!S.trail && seat) {
      // r2: up the bank from their own canoe, by their seat's end of it, staggered (each a little higher or lower, to
      // one side), facing it or a little off: no row
      const r = mulberry32((hashStr(`${Lg.party.id}:${j}:${S.kind}`) ^ 0x51f7) >>> 0), n = Lg.plan.crew.boats.length, o = this.slot(S, seat.c, n, { x: 0, z: 0, h: 0 });
      const fx = Math.cos(o.h), fz = -Math.sin(o.h), sx = SEAT_X[seat.seat] ?? 0;
      const up = 1.1 + r() * 1.3, side = (r() * 2 - 1) * 0.5;
      x = o.x + fx * (sx * 0.8 + side) + L.ux * (2.6 + up); z = o.z + fz * (sx * 0.8 + side) + L.uz * (2.6 + up);
      for (let k = 0; k < 6 && this.sdAt(x, z) < 0.6; k++) { x += L.ux * 0.6; z += L.uz * 0.6; } // (on the bank, not in the water)
      h = headingOf(-L.ux, -L.uz) + (r() * 2 - 1) * 0.6;
      S.spots[j] = { x, z, h };
      out.x = x; out.z = z; out.h = h;
      return out;
    }
    if (S.trail) {
      // at a carry's end: between the waterline and the trail's end, a little off the line, facing the way they go
      const t0 = S.trail.pts[0], t1 = S.trail.pts[Math.min(3, S.trail.pts.length - 1)], sh = L.shore;
      const row = Math.floor(j / 2), f = Math.min(1, 0.25 + row * 0.22), side = j % 2 ? 1 : -1;
      const bx = sh.x + (t0[0] - sh.x) * f, bz = sh.z + (t0[1] - sh.z) * f;
      let dx = t1[0] - t0[0], dz = t1[1] - t0[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      x = bx - dz * side * 0.8 + L.ux * 0.6; z = bz + dx * side * 0.8 + L.uz * 0.6; h = headingOf(dx, dz);
    } else {
      // at a site or the put-in: a step up the bank above the canoes, facing the water
      const row = Math.floor(j / 4), col = (j % 4) - 1.5;
      x = L.shore.x + L.ux * (1.8 + row * 1.1) + L.tx * col * 1.05; z = L.shore.z + L.uz * (1.8 + row * 1.1) + L.tz * col * 1.05; h = headingOf(-L.ux, -L.uz);
    }
    S.spots[j] = { x, z, h };
    out.x = x; out.z = z; out.h = h;
    return out;
  }
  // a station's spots off the trunks once its trees are in (tiles.js treesNear), checked once you are by it
  checkSpots(S) {
    const T = this.tiles; if (S.checked || !T || typeof T.treesNear !== 'function') return;
    S.checked = true;
    for (const s of S.spots) {
      if (!s) continue;
      for (let k = 0; k < 6; k++) {
        const hit = T.treesNear(s.x, s.z, 1.2).some((t) => !t.shape && !t.tent && !t.box && Math.hypot(t.x - s.x, t.z - s.z) < (t.r || 0.3) + 0.45);
        if (!hit) break;
        s.x -= S.L.ux * 0.6; s.z -= S.L.uz * 0.6; // (down toward the water, clear of the trunk)
      }
      // r2 2: and off ground too steep to stand on (a foot cannot reach the bank's face under a slope over 0.8): the nearest
      // ground within 2.4 m that is on the bank, clear of trunks and no steeper than 0.7
      const f = this.firm(s.x, s.z, (x, z) => this.sdAt(x, z) > 0.6 && !T.treesNear(x, z, 1.2).some((t) => !t.shape && !t.tent && !t.box && Math.hypot(t.x - x, t.z - z) < (t.r || 0.3) + 0.45));
      if (f) { s.x = f.x; s.z = f.z; }
    }
  }
  // r2 2: the slope of the ground at (x, z) (rise over run, over a metre)
  slopeAt(x, z) { const T = this.tiles; if (!T || !T.groundAt) return 0; const G = (a, b) => T.groundAt(a, b); return Math.hypot(G(x + 0.5, z) - G(x - 0.5, z), G(x, z + 0.5) - G(x, z - 0.5)); }
  // a place to stand near (x, z) when the ground there is steeper than FIRM.max: the nearest no steeper than FIRM.ok
  // (and ok(x, z), when given) within FIRM.reach; null when (x, z) will do or nothing near will
  firm(x, z, ok = null) {
    if (!(this.slopeAt(x, z) > FIRM.max)) return null;
    for (let r = 0.4; r <= FIRM.reach + 1e-6; r += 0.4) {
      let best = null, bs = Infinity;
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, sl = this.slopeAt(px, pz); if (sl <= FIRM.ok && sl < bs && (!ok || ok(px, pz))) { bs = sl; best = { x: px, z: pz }; } }
      if (best) return best;
    }
    return null;
  }
  prepare(L) {
    const plan = L.plan, P = this.parties, w = this.world;
    if (!L.stations) {
      const basinAt = (a) => (a.kind === 'site' ? a.stay.basin : a.kind === 'ep' ? (P.eps.find((e) => e.ep === a.ep) || {}).basin : -1);
      const st = { from: null, to: null, carry: new Map() };
      const hs = hashStr(plan.party.id), shiftEp = (((plan.party.slot ?? 0) % 7) - 3) * 8, shiftCarry = ((hs % 5) - 2) * 6;
      st.from = this.station(plan.from.kind, plan.from, basinAt(plan.from), null, plan.from.kind === 'ep' ? shiftEp : 0);
      st.to = this.station(plan.to.kind, plan.to, basinAt(plan.to), null, plan.to.kind === 'ep' ? shiftEp : 0);
      for (const s of plan.segs) {
        if (s.kind !== 'carry') continue;
        // (a connected trail, world-fixes, draws only its own piece of tread: they walk the whole of it, launch to launch)
        const Pq = w.portages[s.p], tr = Pq.connected || Pq.tread ? Pq.pts.map((q) => [q[0], q[1]]) : trailOf(Pq), pts = s.end === 1 ? tr.slice().reverse() : tr;
        const trail = polyline(pts.map((q) => [q[0], q[1]])), back = polyline(pts.slice().reverse().map((q) => [q[0], q[1]]));
        const la = Pq.launch[s.end], lb = Pq.launch[1 - s.end];
        const A = this.station('carry', la, this.basinOf(la.lake), trail, shiftCarry), B = this.station('carry', lb, this.basinOf(lb.lake), back, shiftCarry);
        st.carry.set(s, { A, B, trail });
      }
      const all = [st.from, st.to, ...[...st.carry.values()].flatMap((c) => [c.A, c.B])];
      if (all.some((x) => x === 'wait')) return false;
      if (all.some((x) => !x)) { L.broken = true; return false; } // (no water by a landing: not drawn)
      // (r2: the canoes along the bank lie bow the way the party goes; at each landing, the way of the water leg they push
      // off on or came in by)
      { const gx = plan.to.x - plan.from.x, gz = plan.to.z - plan.from.z; for (const S of all) S.tsign = S.L.tx * gx + S.L.tz * gz >= 0 ? 1 : -1; }
      L.st = st;
      // the paddle pieces' landings: from the leg's start or the last carry's far end, to the next carry's near end or the end
      let cur = st.from;
      plan.segs.forEach((s, i) => {
        if (s.kind === 'launch') s.S = st.from;
        else if (s.kind === 'paddle' || s.kind === 'drift') {
          s.A = cur;
          let nxt = null; for (let j = i + 1; j < plan.segs.length; j++) if (plan.segs[j].kind === 'carry') { nxt = st.carry.get(plan.segs[j]).A; break; }
          s.B = nxt || st.to;
          { const gx = s.B.L.x - s.A.L.x, gz = s.B.L.z - s.A.L.z; if (Math.hypot(gx, gz) > 20) for (const S of [s.A, s.B]) S.tsign = S.L.tx * gx + S.L.tz * gz >= 0 ? 1 : -1; }
          s.pathKey = `${Math.round(s.A.L.x)},${Math.round(s.A.L.z)}>${Math.round(s.B.L.x)},${Math.round(s.B.L.z)}`;
        } else if (s.kind === 'carry') { const c = st.carry.get(s); s.A = c.A; s.B = c.B; s.trail = c.trail; cur = c.B; }
        else if (s.kind === 'landing') s.S = cur;
        else if (s.kind === 'land') s.S = st.to;
      });
      L.stations = true;
    }
    const party = L.party, v = this.people && this.people.partyPerson ? this.people.partyPerson(party) : null;
    L.who = v;
    L.seatOf = new Map(); plan.crew.boats.forEach((b, c) => b.forEach((i, j) => L.seatOf.set(i, { c, seat: ['stern', 'bow', 'mid'][Math.min(2, j)] })));
    L.ready = true;
    return true;
  }
  // the people and the canoes in the actor layer, made as the party comes within MOVES.actR of you and let go past
  // MOVES.dormR (beyond, a party is its place along the plan), from the people's figure pool's looks (npcs.js
  // partyPerson: the same as at their camp)
  makeActors(L) {
    const party = L.party, crew = L.plan.crew, v = L.who;
    L.persons = party.members.map((m, i) => this.actors.person({ key: `party:${party.id}#${i}`, look: v ? v.members[i].look : undefined, name: v ? v.members[i].name : null, life: true })); // (r2 verify: the idle with life and the look at you were never switched on for them)
    L.boats = crew.boats.map((b, c) => this.actors.boat({ key: `party:${party.id}/${c}`, hull: crew.hulls[c], crew: [], packs: 2 }));
    L.speakers = L.persons.map((a, i) => ({ key: `party:${party.id}#${i}`, person: `party:${party.id}`, name: v ? v.members[i].name : 'A paddler', role: '', hear: 95, pos: (out) => (a.removed ? null : a.headAt(out)) }));
    L.lastH = null;
  }
  freeActors(L) {
    for (const b of L.boats) b.remove();
    for (const a of L.persons) a.remove();
    L.boats = []; L.persons = []; L.speakers = []; L.aside.clear(); L.off.clear();
  }
  // about where the party is at hour h (a station, a point on a water leg, the middle of a carry): for the ranges
  whereAt(L, h) {
    const s = this.segAt(L, h);
    if (s.kind === 'paddle' || s.kind === 'drift') {
      const path = L.paths.get(s.pathKey), f = s.kind === 'drift' ? 1 : ramp01((h - s.h0) * 3600, (s.h1 - s.h0) * 3600, MOVE.ramp), u = s.kind === 'drift' ? s.u : s.u0 + (s.u1 - s.u0) * f;
      if (path) return along(path, u * path.L, _w);
      _w.x = s.A.L.x + (s.B.L.x - s.A.L.x) * u; _w.z = s.A.L.z + (s.B.L.z - s.A.L.z) * u; return _w;
    }
    if (s.kind === 'carry') { _w.x = (s.A.L.x + s.B.L.x) / 2; _w.z = (s.A.L.z + s.B.L.z) / 2; return _w; }
    _w.x = s.S.L.x; _w.z = s.S.L.z; return _w;
  }

  // --- where everyone is at an hour of the plan ----------------------------------------------------------------
  // A water leg's path (pathKey): searched when it is wanted (the leg on it, or the next one, within reach of you), a
  // few milliseconds a frame (MOVES.pathMs) till it is done; null meanwhile (their canoes are not drawn till it is)
  pathOf(L, s, budget) {
    const got = L.paths.get(s.pathKey);
    if (got) return got;
    if (!budget || performance.now() - budget.t0 > budget.ms) return null;
    if (!L.gen || L.genKey !== s.pathKey) { L.gen = waterPath(this.masks, this.world, this.basinOf, s.A.L, s.B.L, s.A.basin); L.genKey = s.pathKey; L.genMs = 0; }
    const tp = performance.now();
    let r = L.gen.next();
    while (!r.done && performance.now() - budget.t0 < budget.ms) r = L.gen.next();
    L.genMs += performance.now() - tp;
    if (!r.done) return null;
    L.gen = null;
    if (r.value === 'wait') return null;
    this.paths++;
    this.pathMs.push(+L.genMs.toFixed(2)); if (this.pathMs.length > 40) this.pathMs.shift();
    // (no way over the water found: a straight line, as the plan has it, but never drawn: no canoe crosses the land)
    const path = r.value || Object.assign(polyline([[s.A.L.x, s.A.L.z], [s.B.L.x, s.B.L.z]]), { none: true });
    L.paths.set(s.pathKey, path);
    // (r2 2 verify: the canoes come in to lie along the bank bow the way the way in runs at its end, not the way the
    // landings lie from each other: they had paddled in and then swung round on the spot at the bank, up to half a turn,
    // with their crews still in them. Set once the way is found, before they are there)
    if (!path.none && s.u1 === 1 && s.B && s.B.L && path.L > 30) {
      const q = along(path, path.L - 25, { x: 0, z: 0, tx: 0, tz: 0 }, 1.5), e = path.pts[path.pts.length - 1], gx = e[0] - q.x, gz = e[1] - q.z;
      if (Math.hypot(gx, gz) > 5) s.B.tsign = s.B.L.tx * gx + s.B.L.tz * gz >= 0 ? 1 : -1;
    }
    return path;
  }
  segAt(L, h) {
    const S = L.plan.segs;
    if (L.segI >= 0 && L.segI < S.length && S[L.segI].h0 <= h && h < S[L.segI].h1) return S[L.segI];
    let i = 0; while (i < S.length - 1 && h >= S[i].h1) i++;
    L.segI = i;
    return S[i];
  }
  // the canoe c of n on a water leg at hour h: { x, z, h (heading), v (m/s of game time) }
  boatOnWater(L, s, c, n, h, out, path) {
    const D = (s.h1 - s.h0) * 3600, t = (h - s.h0) * 3600;
    const f = s.kind === 'drift' ? 1 : ramp01(t, D, MOVE.ramp), u = s.kind === 'drift' ? s.u : s.u0 + (s.u1 - s.u0) * f;
    const env = s.kind === 'drift' ? 0 : Math.sin(Math.PI * f), sAt = u * path.L;
    const stagger = c * MOVES.stagger * env, lat = (c - (n - 1) / 2) * (MOVES.slot + (MOVES.spread - MOVES.slot) * env) + (L.off.get(c) || 0);
    const q = along(path, sAt - stagger, _p, 6);
    let x = q.x - q.tz * lat, z = q.z + q.tx * lat, hd = headingOf(q.tx, q.tz);
    // (the first and last 30 m: in from the slots at the bank, and out to them)
    const sl = (S, k) => this.slot(S, k, n, _s);
    if (s.u0 === 0 && sAt < 30 && s.kind !== 'drift') { const k = smooth(sAt / 30), o = sl(s.A, c); x = o.x + (x - o.x) * k; z = o.z + (z - o.z) * k; hd = o.h + wrapPi(hd - o.h) * smooth(sAt / 12); }
    if (s.u1 === 1 && path.L - sAt < 30 && s.kind !== 'drift') { const k = smooth((path.L - sAt) / 30), o = sl(s.B, c); x = o.x + (x - o.x) * k; z = o.z + (z - o.z) * k; hd = o.h + wrapPi(hd - o.h) * smooth((path.L - sAt) / 12); }
    out.x = x; out.z = z; out.h = hd;
    out.v = s.kind === 'drift' ? 0 : (s.u1 - s.u0) * path.L * rampRate(t, D, MOVE.ramp);
    // r2: for the hull's own paddling (actors.js simTick): a point ahead on the way to steer at (the slot itself at the
    // end) and the leg's steady speed (game m/s)
    out.cruise = s.kind === 'drift' ? 0 : ((s.u1 - s.u0) * path.L) / Math.max(1, D - Math.min(MOVE.ramp, D / 2));
    const la = 26, ahead = sAt - stagger + la, aim = out.aim || (out.aim = { x: 0, z: 0 });
    out.dock = false;
    if (s.u1 === 1 && path.L - sAt < la + 8 && s.kind !== 'drift') { const o = sl(s.B, c); aim.x = o.x; aim.z = o.z; out.dock = true; } // (r2 2 verify: dock: brought in to lie there)
    else { const q2 = along(path, ahead, _q, 6); aim.x = q2.x - q2.tz * lat; aim.z = q2.z + q2.tx * lat; }
    return out;
  }
  // --- r2: the people about their canoes ---------------------------------------------------------------------------
  // the hull of canoe c as it lies now (the drawn one; its slot at S when it is not)
  hullOf(L, c, S) {
    const b = L.boats[c];
    if (b && !b.hidden && Number.isFinite(b.x)) return { x: b.x, z: b.z, h: b.heading, y: b.y, b };
    const o = this.slot(S, c, L.boats.length, { x: 0, z: 0, h: 0 }), lv = this.world.levelAt ? this.world.levelAt(o.x, o.z) : 0;
    return { x: o.x, z: o.z, h: o.h, y: lv + 0.15, b: null };
  }
  // beside seat `seat` of canoe c on the bank's side (where one stands to load it or to step in), the seat itself, and
  // which way faces the hull from there
  sideOf(L, c, seat, S, i = -1) {
    const H = this.hullOf(L, c, S), fx = Math.cos(H.h), fz = -Math.sin(H.h), sx = SEAT_X[seat] ?? 0;
    // (the bank's side of her as she lies in her slot, kept while she swings: square to her keel)
    const o = this.slot(S, c, L.boats.length, _sd), ox = Math.cos(o.h), oz = -Math.sin(o.h), sd = -oz * S.L.ux + ox * S.L.uz;
    const sg = Math.abs(sd) < 0.3 ? 1 : Math.sign(sd), nx = -fz * sg, nz = fx * sg;
    const r = i >= 0 ? mulberry32((hashStr(`${L.party.id}:${i}:side`) ^ 0x3c6e) >>> 0) : null, off0 = r ? 0.72 + 0.3 * r() : 0.85, along0 = r ? (r() - 0.5) * 0.5 : 0; // (each their own place by her)
    // (r2 2: never on a bank steeper than FIRM.max: along her side, or a little further off her, to where a foot reaches;
    // chosen once each place, near you)
    let along = along0, off = off0;
    if (i >= 0 && S) {
      const key = `${S.kind}:${S.L.x | 0}:${c}:${seat}:${i}`, fixes = L.sideFix || (L.sideFix = new Map());
      let fx2 = fixes.get(key);
      if (!fx2 && Math.hypot(H.x - this.player.x, H.z - this.player.z) < MOVES.fixR && this.tiles && this.tiles.groundAt) {
        fx2 = { da: 0, dn: 0 };
        const at = (da, dn) => this.slopeAt(H.x + fx * (sx + along0 + da) + nx * (off0 + dn), H.z + fz * (sx + along0 + da) + nz * (off0 + dn));
        if (at(0, 0) > FIRM.max) {
          let best = null;
          for (const dn of [0, 0.3, -0.15, 0.6]) for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]) { const sl = at(da, dn); if (sl <= FIRM.ok && (!best || Math.abs(da) + Math.abs(dn) * 1.5 < best.c)) best = { da, dn, c: Math.abs(da) + Math.abs(dn) * 1.5 }; }
          if (best) { fx2.da = best.da; fx2.dn = best.dn; }
        }
        fixes.set(key, fx2);
      }
      if (fx2) { along += fx2.da; off += fx2.dn; }
    }
    return { x: H.x + fx * (sx + along) + nx * off, z: H.z + fz * (sx + along) + nz * off, face: headingOf(-nx, -nz), sx: H.x + fx * sx, sz: H.z + fz * sx, floor: H.y + floorAt(sx) + 0.02, h: H.h, side: Math.sign(nx * -fz + nz * fx) || 1, b: H.b };
  }
  // what one of them is doing at the bank t real seconds into it (from 'bank': their place up it, or 'hull': by the
  // canoe): carrying the packs down to the hull and stooping to load them (unload: up from it), kneeling at the hull,
  // or a word with someone. A pose for drive()
  jobAt(L, S, i, t, from = 'bank', unload = false, lunch = false) {
    const seat = L.seatOf.get(i), B = this.spot(S, i, { x: 0, z: 0, h: 0 }, L);
    const stand = (x, z, h, crouch = 0) => ({ x, z, heading: h, v: 0, mode: 'stand', pack: false, anim: crouch > 0 ? { crouch } : null });
    if (!seat) return stand(B.x, B.z, B.h);
    const r = mulberry32((hashStr(`${L.party.id}:${i}:job`) ^ 0x9e37) >>> 0), r1 = r(), r2 = r(), r3 = r(), r4 = r();
    const kind = lunch ? 'chat' : r1 < 0.62 ? 'ferry' : r1 < 0.84 ? 'load' : 'chat';
    const Hs = this.sideOf(L, seat.c, seat.seat, S, i), up = headingOf(S.L.ux, S.L.uz);
    if (kind === 'chat' && from === 'hull') { const w0 = Math.max(1.6, Math.hypot(Hs.x - B.x, Hs.z - B.z) / 1.1); if (t < w0) { const k = t / w0; return { x: Hs.x + (B.x - Hs.x) * k, z: Hs.z + (B.z - Hs.z) * k, heading: headingOf(B.x - Hs.x, B.z - Hs.z), v: Math.hypot(B.x - Hs.x, B.z - Hs.z) / w0, mode: 'walk', pack: true, anim: null }; } }
    if (kind === 'chat') {
      // facing whoever of them stands nearest
      let best = null, bd = Infinity;
      for (let j = 0; j < L.persons.length; j++) { if (j === i) continue; const o = this.spot(S, j, { x: 0, z: 0, h: 0 }, L), d = Math.hypot(o.x - B.x, o.z - B.z); if (d < bd) { bd = d; best = o; } }
      return stand(B.x, B.z, best && bd < 8 ? headingOf(best.x - B.x, best.z - B.z) : B.h);
    }
    if (kind === 'load') {
      const T = 12 + 8 * r2, u = (t + r3 * T) % T;
      if (from === 'bank' && t < 4) { const k = t / 4; return { x: B.x + (Hs.x - B.x) * k, z: B.z + (Hs.z - B.z) * k, heading: headingOf(Hs.x - B.x, Hs.z - B.z), v: Math.hypot(Hs.x - B.x, Hs.z - B.z) / 4, mode: 'walk', pack: false, anim: null }; }
      return stand(Hs.x, Hs.z, Hs.face + (r4 - 0.5) * 0.7, u < T - 3 ? 0.85 : 0);
    }
    // ferry: [0, b) at their place up the bank (bending to a pack), [b, b + w) down to the hull with it, [.., + a) loading
    // it in, [.., + w) back up for the next (unload: the other way)
    const w = Math.max(1.6, Math.hypot(Hs.x - B.x, Hs.z - B.z) / 1.1), a = 5 + 4 * r2, b = 2.5 + 2 * r3, T = a + b + 2 * w;
    let u = (t + (from === 'hull' ? b + w : 0) + r4 * 0) % T;
    if (u < b) return stand(B.x, B.z, up, u > 0.6 && u < b - 0.4 ? 0.9 : 0);
    u -= b;
    const walk = (P0, P1, k, pack) => ({ x: P0.x + (P1.x - P0.x) * k, z: P0.z + (P1.z - P0.z) * k, heading: headingOf(P1.x - P0.x, P1.z - P0.z), v: Math.hypot(P1.x - P0.x, P1.z - P0.z) / w, mode: 'walk', pack, anim: null });
    if (u < w) return walk(B, Hs, u / w, !unload);
    u -= w;
    if (u < a) return stand(Hs.x, Hs.z, Hs.face + (r4 - 0.5) * 0.7, u > 0.5 && u < a - 0.5 ? 0.9 : 0);
    u -= a;
    return walk(Hs, B, u / w, unload);
  }
  // stepping in over the gunwale (u 0..1 of the step): from beside the seat to it, down into a crouch, the feet onto the
  // hull's floor, turned to face the bow; out again with u run back
  stepPose(Hs, u) {
    const k = smooth(u), lift = smooth((u - 0.25) / 0.45);
    return { x: Hs.x + (Hs.sx - Hs.x) * k, z: Hs.z + (Hs.sz - Hs.z) * k, heading: Hs.face + wrapPi(Hs.h - Hs.face) * smooth((u - 0.2) / 0.7), v: 0.35 * Math.sin(Math.PI * u), mode: 'stand', pack: false, anim: { crouch: 0.35 + 0.55 * smooth(u * 1.4) }, footY: null, lift };
  }
  // the seconds canoe c's boarding (and getting out) runs behind the board's start: r2 2 verify, the canoes one after
  // another in an order of their own (three sterns had pushed off together, side by side in a row), each still in by
  // the board's end
  boardJit(L, c) {
    const J = L.jits || (L.jits = []);
    if (J[c] != null) return J[c];
    const boats = L.plan.crew.boats, n = boats.length, r = (k) => mulberry32((hashStr(`${L.party.id}:${k}:b`) ^ 0x2545) >>> 0)();
    const rank = [...Array(n).keys()].sort((a, b) => r(a) - r(b)).indexOf(c), seats = (boats[c] || []).length || 2;
    const cap = BOARD.total - 0.2 - (BOARD.first + (seats - 1) * (BOARD.step + BOARD.gap) + PUSH.dur + BOARD.step);
    return (J[c] = Math.max(-0.2, Math.min(cap, rank * 0.8 + (r(c) - 0.5) * 0.4)));
  }
  // r2: where person i is at hour h of seg s (null: the old ways, the carry's walks and the spots), or { seat } in the hull
  bankPose(L, s, i, h, seat, lag = 0) {
    if (!seat) return null;
    const kind = s.kind, n = L.persons.length;
    // the order in the canoe: the bow in first and out first, the stern last in (pushing off) and last out
    const crewOf = L.plan.crew.boats[seat.c] || [], order = crewOf.map((j) => L.seatOf.get(j)).sort((x, y) => ORDER[x.seat] - ORDER[y.seat]).map((q) => q.seat), k = Math.max(0, order.indexOf(seat.seat));
    const jit = this.boardJit(L, seat.c);
    const boardEnd = kind === 'launch' || kind === 'landing' ? s.h1 : null;
    if (boardEnd != null) {
      const S = s.S, tb = BOARD.total - (boardEnd - h) * 3600 / CLOCK; // (s into the boarding; < 0 before it)
      // (lag: r2 2, the real seconds of the morning's hand-over before their jobs at the landing begin; a stern who
      // carried her down begins by her)
      const from = lag && L.depart && L.depart.carry.has(i) ? 'hull' : 'bank';
      if (tb < 0) {
        const t0 = kind === 'launch' ? s.h0 : s.h0;
        return { job: this.jobAt(L, S, i, Math.max(0, (h - t0) * 3600 / CLOCK - lag), from, false, kind === 'landing' && s.lunch) };
      }
      const Hs = this.sideOf(L, seat.c, seat.seat, S, i), last = k === order.length - 1, push = last ? PUSH.dur : 0, stIn = BOARD.first + jit + k * (BOARD.step + BOARD.gap) + push;
      if (tb >= stIn + BOARD.step) return { seat: true };
      if (tb >= stIn) { const Hp = push ? this.pushStand(L, s, i, Hs, 1) : Hs; return { step: this.stepPose(Hp, (tb - stIn) / BOARD.step), Hs: Hp, u: (tb - stIn) / BOARD.step }; }
      // (r2 2: the push: by her stern, bent to the gunwale, a step after her as she slides off, the other foot pushing)
      if (push && tb >= stIn - push) {
        const u = (tb - stIn + push) / push, Hp = this.pushStand(L, s, i, Hs, u), st = smooth((u - 0.15) / 0.6);
        return { push: u, job: { x: Hp.x, z: Hp.z, heading: Hs.face, v: PUSH.step / (push * 0.6) * Math.sin(Math.PI * clamp((u - 0.15) / 0.6, 0, 1)) * (st < 1 ? 1 : 0), mode: 'stand', pack: false, anim: { crouch: 0.45 + 0.25 * Math.sin(Math.PI * u), arms: { kind: 'push', t: u * push }, push: u } } };
      }
      // to the side of the canoe from wherever the job had them, then a hand on the gunwale till it is their turn.
      // (r2 2 verify, the owner's "a perfect row half-seated at canoes": everyone had left their job on the same instant,
      // come to the side together and waited there crouched at 0.5, all facing her square, two to six of them in one
      // line along the bank for up to 2 s. Now each goes down when their own turn is near (the bow first, the stern
      // last), stands by her a moment their own way, and bends to the gunwale only just before stepping in)
      const rw = mulberry32((hashStr(`${L.party.id}:${i}:wait`) ^ 0x51ed) >>> 0), early = 0.5 + 1.1 * rw(), turn = (rw() - 0.5) * 0.7;
      const by = stIn - push, walkAt = Math.max(0, Math.min(by - BOARD.walk - early, BOARD.total - BOARD.walk));
      const t1 = (h0) => Math.max(0, (h0 - s.h0) * 3600 / CLOCK - lag);
      if (tb < walkAt) return { job: this.jobAt(L, S, i, t1(h), from, false, kind === 'landing' && s.lunch) };
      const P0 = this.jobAt(L, S, i, t1(boardEnd - (BOARD.total - walkAt) / 3600 * CLOCK), from, false, kind === 'landing' && s.lunch);
      const k2 = Math.min(1, (tb - walkAt) / BOARD.walk), d = Math.hypot(Hs.x - P0.x, Hs.z - P0.z);
      if (k2 < 1) return { job: { x: P0.x + (Hs.x - P0.x) * smooth(k2), z: P0.z + (Hs.z - P0.z) * smooth(k2), heading: d > 0.3 ? headingOf(Hs.x - P0.x, Hs.z - P0.z) : Hs.face, v: (d / BOARD.walk) * 1.5 * Math.sin(Math.PI * k2), mode: 'walk', pack: false, anim: null } };
      const bend = smooth((tb - (by - 0.75)) / 0.55);
      return { job: { x: Hs.x, z: Hs.z, heading: Hs.face + turn * (1 - bend), v: 0, mode: 'stand', pack: false, anim: bend > 0.01 ? { crouch: 0.5 * bend } : null } };
    }
    if (kind === 'carry' || kind === 'land') {
      const S = kind === 'carry' ? s.A : s.S, t = (h - s.h0) * 3600 / CLOCK, st = OUT.first + jit * 0.5 + k * (OUT.step + OUT.gap);
      if (t < st) return { seat: true };
      const Hs = this.sideOf(L, seat.c, seat.seat, S, i);
      if (t < st + OUT.step) return { step: this.stepPose(Hs, 1 - (t - st) / OUT.step), Hs, u: 1 - (t - st) / OUT.step, out: true };
      const t2 = t - st - OUT.step;
      if (kind === 'land') return { job: this.jobAt(L, S, i, t2, 'hull', true) };
      // (at a carry: up to their place by the trail's end, where the carry's walks begin)
      const o = this.spot(S, i, { x: 0, z: 0, h: 0 }, L);
      if (t2 >= OUT.walk) return null;
      const k2 = t2 / OUT.walk, d = Math.hypot(o.x - Hs.x, o.z - Hs.z);
      void n;
      return { job: { x: Hs.x + (o.x - Hs.x) * smooth(k2), z: Hs.z + (o.z - Hs.z) * smooth(k2), heading: d > 0.3 ? headingOf(o.x - Hs.x, o.z - Hs.z) : o.h, v: (d / OUT.walk) * 1.5 * Math.sin(Math.PI * k2), mode: 'walk', pack: false, anim: null } };
    }
    return null;
  }
  // --- r2 2: the hand-over with the camp (party-camps.js) ------------------------------------------------------------
  // The owner's leftover: the camp's canoes on the bank had gone and the party's had come in the water at the landing in
  // one frame (and back again as they came in), the people popping between the camp's places and the party's. Now: on
  // the morning they go, each canoe's stern lifts her off the bank where the camp had her and carries her down to the
  // water, setting her in by her place, and the others walk down from where the camp's people stood (or out of a tent's
  // door, those who were not up); on the afternoon they come in, each stern carries his canoe up to where the camp lays
  // it, the camp's people start where the party's stand, and those the camp does not draw walk into a tent.
  campOf(L, which) {
    const C = this.partyCamps, e = L.plan[which];
    if (!C || !e || e.kind !== 'site') return null;
    const D = C.drawn.get(e.key);
    return D && D.party === L.party ? D : null;
  }
  // the morning they go (made as the launch begins): each person comes from where the camp last drew them, once the camp
  // no longer does (or out of a tent's door, one it did not draw); each canoe's stern first to her on the bank, and when
  // all the sterns are by theirs they lift them together (the camp's canoes are one mesh) and carry them down
  departOf(L, s, h) {
    if (L.depart !== undefined) return L.depart;
    const D = this.campOf(L, 'from');
    // (only from the start of it: come on them later (a clock moved on, a teleport), their canoes are in the water already)
    if (!D || !D.canoeAt || (h - s.h0) * 3600 / CLOCK > 6) return (L.depart = null);
    const out = { D, tents: D.tentList || [], carry: new Map(), walk: new Map(), liftT: null };
    const n = L.plan.crew.boats.length;
    L.plan.crew.boats.forEach((crew, c) => {
      const cn = D.canoeAt[c], i = crew[0], seat = L.seatOf.get(i); if (!cn || !seat) return;
      const o = this.slot(s.S, c, n, { x: 0, z: 0, h: 0 }), Y = this.sideOf(L, c, 'mid', s.S), Hs = this.sideOf(L, c, seat.seat, s.S, i);
      const at = { x: cn.x - cn.wx * 0.75, z: cn.z - cn.wz * 0.75 }, d = Math.hypot(Y.x - at.x, Y.z - at.z), dur = Math.max(3, d / HAND.carry); // (by her on the land side)
      out.carry.set(i, { c, at, from: { x: at.x, z: at.z }, to: { x: Y.x, z: Y.z, h: o.h }, side: { x: Hs.x, z: Hs.z, h: Hs.face }, dur, camp: this.campPose(cn) });
    });
    D.holdCanoes = out.carry.size > 0; // (the camp keeps them on the bank till they are lifted)
    return (L.depart = out);
  }
  // where person i walks from, taken the frame the camp lets them go (t: real s into the launch)
  departWalk(L, s, i, t) {
    const X = L.depart, D = X.D, f = D.figs[i], cr = X.carry.get(i);
    let from = null, emerge = 0;
    if (f && f.placed && Number.isFinite(f.lastH) && Math.abs((this.day ? this.day.hours : 0) - f.lastH) < 0.02 && f.out !== undefined) from = { x: f.x, z: f.z };
    if (!from && X.tents.length) { const tn = X.tents[i % X.tents.length], din = tn.size.b * 0.45; from = { x: tn.x + tn.fdx * din, z: tn.z + tn.fdz * din }; emerge = HAND.emerge; }
    const to = cr ? cr.at : this.spot(s.S, i, { x: 0, z: 0, h: 0 }, L);
    if (!from) from = { x: to.x, z: to.z };
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    return { t0: t, from, to, emerge, dur: d > 0.3 ? Math.max(1.6, d / HAND.walk) : 0 };
  }
  // person i's pose in the first part of a launch from a site: { hide } while the camp still draws them; null once it is
  // over (the jobs at the landing go on)
  departPose(L, s, i, t) {
    const X = L.depart; if (!X) return null;
    const D = X.D, f = D.figs[i];
    let w = X.walk.get(i);
    if (!w) {
      if (f && D.v.figs.includes(f)) return { hide: true }; // (the camp's still)
      w = this.departWalk(L, s, i, t); X.walk.set(i, w);
      // (every stern by his canoe: the lift's moment, together)
      if (X.carry.size && [...X.carry.keys()].every((j) => X.walk.has(j))) X.liftT = Math.max(...[...X.carry.keys()].map((j) => { const q = X.walk.get(j); return q.t0 + q.emerge + q.dur; }), t) + 0.4;
    }
    const tw = t - w.t0;
    const walkPose = () => {
      if (tw < w.emerge) return { x: w.from.x, z: w.from.z, heading: headingOf(w.to.x - w.from.x, w.to.z - w.from.z), v: 0, mode: 'stand', pack: false, anim: { crouch: 0.9 } };
      const k = smooth((tw - w.emerge) / Math.max(1e-6, w.dur));
      return { x: w.from.x + (w.to.x - w.from.x) * k, z: w.from.z + (w.to.z - w.from.z) * k, heading: Math.hypot(w.to.x - w.from.x, w.to.z - w.from.z) > 0.3 ? headingOf(w.to.x - w.from.x, w.to.z - w.from.z) : 0, v: k < 1 ? (Math.hypot(w.to.x - w.from.x, w.to.z - w.from.z) / w.dur) * 1.5 * Math.sin(Math.PI * k) : 0, mode: k < 1 ? 'walk' : 'stand', pack: false, anim: k >= 1 ? { crouch: 0.6 } : null };
    };
    const cr = X.carry.get(i);
    if (cr) {
      if (X.liftT == null || t < X.liftT) { const q = walkPose(); if (q.mode === 'stand') q.heading = headingOf(cr.camp.fx, cr.camp.fz); return q; } // (to her, and a hand on her till the others are by theirs: r2 2 verify, facing along her, to roll her up over her keel)
      // (r2 2 verify: rolled up off the bank onto his shoulders over HAND.flip s, carried down, and rolled off them into the
      // water by her place over HAND.flip more; she had jumped from the bank to his shoulders, and from them into the water.
      // The camp's canoes let go a moment into the lift, his (the same, where they lie) drawn by then: a frame of none)
      const F = HAND.flip, tl = t - X.liftT;
      if (D.holdCanoes && tl > 0.1) { D.holdCanoes = false; if (this.partyCamps) this.partyCamps.canoesOn(D, false); }
      const down = F + cr.dur, set = down + F, settle = set + 1.6, hull = L.plan.crew.hulls[cr.c];
      if (tl >= settle) return null;
      if (tl >= set) { const k = smooth((tl - set) / (settle - set)); return { x: cr.to.x + (cr.side.x - cr.to.x) * k, z: cr.to.z + (cr.side.z - cr.to.z) * k, heading: cr.side.h, v: 0.5 * Math.sin(Math.PI * k), mode: 'walk', pack: false }; } // (to her stern)
      if (tl >= down) { const W = cr.water || (cr.water = this.waterPose(L, s, cr.c)); return { x: cr.to.x, z: cr.to.z, heading: cr.to.h, v: 0, mode: 'carry', pack: false, hull, anim: { carryFrom: { p: W.p, q: W.q, k: 1 - smooth((tl - down) / F) } } }; }
      const k = smooth((tl - F) / cr.dur), x = cr.from.x + (cr.to.x - cr.from.x) * k, z = cr.from.z + (cr.to.z - cr.from.z) * k;
      const hd = tl < F ? headingOf(cr.camp.fx, cr.camp.fz) : Math.hypot(cr.to.x - x, cr.to.z - z) > 0.6 ? headingOf(cr.to.x - x, cr.to.z - z) : cr.to.h;
      return { x, z, heading: hd, v: tl > F ? (Math.hypot(cr.to.x - cr.from.x, cr.to.z - cr.from.z) / cr.dur) * 1.5 * Math.sin(Math.PI * clamp((tl - F) / cr.dur, 0, 1)) : 0, mode: 'carry', pack: false, hull, anim: tl < F ? { carryFrom: { p: cr.camp.p, q: cr.camp.q, k: smooth(tl / F) } } : null };
    }
    if (tw < w.emerge + w.dur) return walkPose();
    return null;
  }
  // the seconds of the landing's jobs a person has lost to the morning's hand-over (their job clock starts when they are down)
  departLag(L, i) {
    const X = L.depart; if (!X) return 0; const w = X.walk.get(i); if (!w) return 0;
    const cr = X.carry.get(i); if (cr) return X.liftT == null ? 1e3 : X.liftT + 2 * HAND.flip + cr.dur + 1.6;
    return w.t0 + w.emerge + w.dur;
  }
  // the afternoon they come in: canoe c's carry up to the camp's place for her (t: real s left of the landing), or null
  arriveOf(L, s) {
    if (L.arrive !== undefined) return L.arrive;
    const D = this.campOf(L, 'to');
    if (!D || !D.canoeAt) return null; // (the camp not drawn yet: asked again next frame)
    const out = { D, carry: new Map(), tents: D.tentList || [], drawn: Math.min(3, L.persons.length) };
    const n = L.plan.crew.boats.length;
    L.plan.crew.boats.forEach((crew, c) => {
      const cn = D.canoeAt[c], i = crew[0], seat = L.seatOf.get(i); if (!cn || !seat) return;
      // (r2 2 verify: the carry, its two rolls and the walk to her all after they are out of the canoes and up the bank, a
      // long carry a little quicker: begun sooner, he had been taken from his seat to walk to her)
      const room = (s.h1 - s.h0) * 3600 / CLOCK - (OUT.first + 3 * (OUT.step + OUT.gap) + OUT.walk + 1) - 2 * HAND.flip - HAND.reach;
      const o = this.slot(s.S, c, n, { x: 0, z: 0, h: 0 }), Y = this.sideOf(L, c, 'mid', s.S), d = Math.hypot(Y.x - cn.x, Y.z - cn.z), dur = Math.max(3, d / 1.8, Math.min(d / HAND.carry, room));
      void o;
      // (r2 2 verify: set down from beside where she will lie, on her land side, not from under her)
      out.carry.set(i, { c, from: { x: Y.x, z: Y.z }, to: { x: cn.x - cn.wx * 0.75, z: cn.z - cn.wz * 0.75, h: headingOf(cn.tx, cn.tz) }, dur, up: dur + 2 * HAND.flip + HAND.reach, camp: this.campPose(cn) });
    });
    return (L.arrive = out);
  }
  arrivePose(L, s, i, tl, h) {
    const X = this.arriveOf(L, s); if (!X) return null;
    const cr = X.carry.get(i);
    if (cr) {
      // (up to her by her place in the water over HAND.reach s, lifted over HAND.lift, carried up over dur, and held there
      // till the camp has her: tl the landing's real seconds left)
      if (tl > cr.up) return null;
      // (by her middle as she lies, followed while he goes to her and taken as he lifts her)
      const F = HAND.flip, hull = L.plan.crew.hulls[cr.c];
      if (tl > cr.dur + 2 * F || !cr.fixed) {
        const Y = this.sideOf(L, cr.c, 'mid', s.S); cr.from = { x: Y.x, z: Y.z };
        if (tl <= cr.dur + 2 * F) { cr.fixed = true; const b = L.boats[cr.c]; cr.water = b && !b.hidden && b.root ? { p: { x: b.root.position.x, y: b.root.position.y, z: b.root.position.z }, q: b.root.quaternion.clone(), h: b.heading } : this.waterPose(L, s, cr.c); }
      }
      // (r2 2 verify: the last of the walk turned to lie along her, so the lift is a roll over her keel, not a swing of her end
      // up past his head)
      if (tl > cr.dur + 2 * F) { const J = this.jobPoseAt(L, s, i, h - (cr.up - tl) * CLOCK / 3600), k = smooth((cr.up - tl) / HAND.reach), bt = L.boats[cr.c], bh = bt && !bt.hidden ? bt.heading : null; return { x: J.x + (cr.from.x - J.x) * k, z: J.z + (cr.from.z - J.z) * k, heading: k > 0.75 && bh != null ? bh : headingOf(cr.from.x - J.x, cr.from.z - J.z), v: (Math.hypot(cr.from.x - J.x, cr.from.z - J.z) / HAND.reach) * 1.5 * Math.sin(Math.PI * k), mode: 'walk', pack: false }; }
      // (r2 2 verify: rolled up out of the water over HAND.flip, carried up, and rolled off his shoulders onto the bank where
      // the camp lays her over the last HAND.flip: the camp's canoe then is she, where she lies)
      const lift = tl > cr.dur + F, lower = tl <= F;
      const u = smooth(clamp(1 - (tl - F) / cr.dur, 0, 1)), px = cr.from.x + (cr.to.x - cr.from.x) * u, pz = cr.from.z + (cr.to.z - cr.from.z) * u;
      const hd = lift && cr.water ? cr.water.h : u < 0.9 ? headingOf(cr.to.x - cr.from.x, cr.to.z - cr.from.z) : cr.to.h;
      const cf = lift && cr.water ? { p: cr.water.p, q: cr.water.q, k: smooth((cr.dur + 2 * F - tl) / F) } : lower ? { p: cr.camp.p, q: cr.camp.q, k: smooth(tl / F) } : null;
      return { x: px, z: pz, heading: hd, v: u > 0 && u < 1 ? (Math.hypot(cr.to.x - cr.from.x, cr.to.z - cr.from.z) / cr.dur) * 1.5 * Math.sin(Math.PI * u) : 0, mode: 'carry', pack: false, hull, anim: cf ? { carryFrom: cf } : null };
    }
    // (those the camp does not draw: into a tent, the last moments)
    if (i >= X.drawn && X.tents.length && tl < HAND.tent) {
      const tn = X.tents[i % X.tents.length], din = tn.size.b * 0.45, P = { x: tn.x + tn.fdx * din, z: tn.z + tn.fdz * din };
      const J = this.jobPoseAt(L, s, i, h - (HAND.tent - tl) * CLOCK / 3600), u = smooth((HAND.tent - tl) / (HAND.tent - 1.2));
      return { x: J.x + (P.x - J.x) * u, z: J.z + (P.z - J.z) * u, heading: headingOf(P.x - J.x, P.z - J.z), v: u < 1 ? Math.hypot(P.x - J.x, P.z - J.z) / (HAND.tent - 1.2) : 0, mode: u < 1 ? 'walk' : 'stand', pack: false, anim: u >= 1 ? { crouch: 0.9 } : null };
    }
    return null;
  }
  // where a person's job at a landing has them at hour h (its walk's start for the hand-over's)
  jobPoseAt(L, s, i, h) { const seat = L.seatOf.get(i), bp = seat ? this.bankPose(L, s, i, h, seat) : null; if (bp && bp.job) return bp.job; if (bp && bp.step) return bp.step; const o = this.spot(s.S, i, { x: 0, z: 0, h: 0 }, L); return { x: o.x, z: o.z, heading: o.h }; }
  // is canoe c carried by its stern now (hidden from the water)?
  carriedNow(L, s, c, h) {
    if (s.kind === 'launch' && L.depart) { const X = L.depart; for (const cr of X.carry.values()) if (cr.c === c) return X.liftT == null || (h - s.h0) * 3600 / CLOCK < X.liftT + 2 * HAND.flip + cr.dur; }
    if (s.kind === 'land' && L.arrive) { const tl = (s.h1 - h) * 3600 / CLOCK; for (const cr of L.arrive.carry.values()) if (cr.c === c) return tl <= cr.dur + 2 * HAND.flip; }
    return false;
  }
  // r2 2 verify: who carries canoe c in the hand-over now (a person's index), and where she rides as he carries her (or
  // lifts or sets her down: his anim's carryFrom) when he is not drawn with her: the carried hull's place and turn as
  // poses.js carry has it, over his feet
  carrierOf(L, s, c) { const X = s.kind === 'launch' ? L.depart : s.kind === 'land' ? L.arrive : null; if (X) for (const [i, cr] of X.carry) if (cr.c === c) return i; return -1; }
  carriedPose(a) {
    const T = this.tiles, gy = T && T.groundAt ? T.groundAt(a.x, a.z) : 0, fx = Math.cos(a.heading), fz = -Math.sin(a.heading);
    const p = new THREE.Vector3(a.x + fx * 0.035, gy + 1.46, a.z + fz * 0.035), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, a.heading, 0.09, 'YZX'));
    const cf = a.anim && a.anim.carryFrom;
    if (cf && cf.k < 1) { const k = Math.max(0, cf.k); p.set(cf.p.x + (p.x - cf.p.x) * k, cf.p.y + (p.y - cf.p.y) * k, cf.p.z + (p.z - cf.p.z) * k); q.copy(new THREE.Quaternion(cf.q.x, cf.q.y, cf.q.z, cf.q.w).slerp(q, k)); }
    return { p, q };
  }
  // r2 2 verify: a canoe's pose (her pivot's place and turn) overturned on the bank where the camp lays her, and afloat in
  // her slot at a landing: the ends of a lift onto the shoulders or a set-down off them (poses.js carry's carryFrom)
  campPose(cn) { const q = cn.q || new THREE.Quaternion(); const f = new THREE.Vector3(1, 0, 0).applyQuaternion(q); return { p: { x: cn.x, y: cn.y ?? 0, z: cn.z }, q, fx: f.x, fz: f.z }; }
  waterPose(L, s, c) {
    const o = this.slot(s.S, c, L.boats.length, { x: 0, z: 0, h: 0 }), lv = this.world.levelAt ? this.world.levelAt(o.x, o.z) : 0;
    return { p: { x: o.x, y: lv + FLOAT_OFFSET, z: o.z }, q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.h), h: o.h };
  }
  // r2 2: where the stern stands pushing her off, u 0..1 through the push: from the bank beside her (where the push
  // began, kept: the hull slides away from it) a step after her toward her seat
  pushStand(L, s, i, Hs, u) {
    const A = L.pushAt || (L.pushAt = new Map()), key = `${s.h0}:${i}`;
    let a = A.get(key);
    if (!a) { a = { x: Hs.x, z: Hs.z }; A.set(key, a); if (A.size > 24) A.delete(A.keys().next().value); }
    const dx = Hs.sx - a.x, dz = Hs.sz - a.z, d = Math.hypot(dx, dz) || 1, k = PUSH.step * smooth((u - 0.15) / 0.6);
    return { ...Hs, x: a.x + (dx / d) * Math.min(k, d * 0.6), z: a.z + (dz / d) * Math.min(k, d * 0.6) };
  }
  // how far canoe c is pushed off the bank at hour h of a boarding seg s (0..1: its stern's push; 1 once she is pushed)
  pushOf(L, s, c, h) {
    if (s.kind !== 'launch' && s.kind !== 'landing') return 0;
    const crewOf = L.plan.crew.boats[c] || []; if (!crewOf.length) return 0;
    const seats = crewOf.map((j) => L.seatOf.get(j)).filter(Boolean).sort((x, y) => ORDER[x.seat] - ORDER[y.seat]), k = seats.length - 1;
    const jit = this.boardJit(L, c), tb = BOARD.total - (s.h1 - h) * 3600 / CLOCK;
    const t0 = BOARD.first + jit + k * (BOARD.step + BOARD.gap);
    return smooth((tb - t0) / PUSH.dur);
  }
  // a person's walk over a carry: [spot, ...the trail, spot] each way, its point and the way ahead
  walkLine(L, s, i, dir) {
    const key = `${s.p}:${i}:${dir}`, cache = L.walks || (L.walks = new Map());
    if (cache.has(key)) return cache.get(key);
    const a = this.spot(s.A, i, { x: 0, z: 0, h: 0 }), b = this.spot(s.B, i, { x: 0, z: 0, h: 0 });
    const pts = [[a.x, a.z], ...s.trail.pts, [b.x, b.z]], line = polyline(dir > 0 ? pts : pts.slice().reverse());
    cache.set(key, line);
    return line;
  }
  // everyone's place at hour h (of game time, the leg's own clock): written into the actors
  place(L, h, jump, budget) {
    const plan = L.plan, s = this.segAt(L, h), n = L.boats.length, rate = this.rate, crew = plan.crew;
    L.seg = s;
    // (r2 2: before they push off from a site the camp has them all, canoes and people: nothing of the party drawn, or
    // they had stood twice over for the last moments, at the fire and at the landing)
    const early = h < plan.segs[0].h0 && plan.from.kind === 'site' && !!this.campOf(L, 'from');
    for (const a of L.persons) a.hidden = early;
    if (early) { for (const b of L.boats) b.hide(); return; }
    if (s.kind === 'launch' && plan.from.kind === 'site' && L.seatOf) this.departOf(L, s, h);
    if (s.kind === 'land' && plan.to.kind === 'site' && L.seatOf) this.arriveOf(L, s);
    const water = s.kind === 'paddle' || s.kind === 'drift', path = water ? this.pathOf(L, s, budget) : null;
    // (the next water leg's path too, while there is time this frame)
    if (budget) { const i = plan.segs.indexOf(s); for (let j = i + 1; j < plan.segs.length && j < i + 4; j++) { const q = plan.segs[j]; if (q.kind === 'paddle') { this.pathOf(L, q, budget); break; } } }
    // the canoes
    for (let c = 0; c < n; c++) {
      const b = L.boats[c];
      let st = null;
      // (its route over the water still being searched: r2 2, held where she lies, the party waiting for it on its clock
      // (update: L.routeWait), so she goes off along it from where she is once it is found. She had been hidden, then
      // thrown onto it at the plan's place, 130 m on, in view; one not drawn yet stays hidden and is placed then. None
      // found at all: not drawn, no canoe crosses the land)
      if (water && !path && !b.hidden && b.ext) { L.routeWait = true; b.drive({ x: b.x, z: b.z, heading: b.heading, v: 0, sim: true, hold: true }); continue; }
      if (water && (!path || path.none)) { b.hide(); L.pathless = !path; continue; }
      if (water) st = this.boatOnWater(L, s, c, n, h, _b, path);
      else if (s.kind === 'carry') {
        const ci = L.plan.crew.boats[c][0], t = ((L.base ?? h) - s.h0) * 3600 - ((L.dl && L.dl.get(ci)) || 0), B = s.sched.boats[c]; // (the canoe's carrier's own clock)
        if (B && t >= B.lift && t < B.down) { b.hide(); continue; }
        const o = this.slot(B && t >= B.down ? s.B : s.A, c, n, _s); st = { x: o.x, z: o.z, h: o.h, v: 0 };
      } else {
        if (this.carriedNow(L, s, c, h)) { // (r2 2: on her stern's shoulders, down from the camp or up to it)
          // (r2 2 verify: drawn there only while he is drawn with her; past a figure's reach (60 m), or the figures all
          // lent elsewhere, she is drawn herself where he carries her: she had gone from the water for the whole carry,
          // 40 s and more, seen from 105 m)
          const a = L.persons[this.carrierOf(L, s, c)];
          if (!a || a.hidden || a.mode !== 'carry' || (a.hull && a.bind)) { b.hide(); continue; } // (the camp's still, or on his shoulders)
          const P = this.carriedPose(a); if (b.packsK == null) b.packsK = b.packs; b.packs = 0; // (empty, overturned)
          b.ext = null; b.hidden = false; b.placeAt({ x: P.p.x, z: P.p.z, heading: a.heading, y: P.p.y, q: P.q }); continue;
        }
        if (b.packsK != null) { b.packs = b.packsK; b.packsK = null; }
        const o = this.slot(s.S, c, n, _s); st = { x: o.x, z: o.z, h: o.h, v: 0 };
        // (r2 2: pushed off the bank by her stern before they paddle: out from it, rocking as the push starts)
        const pu = L.ready && L.seatOf ? this.pushOf(L, s, c, h) : 0;
        if (pu > 0) { st.x -= s.S.L.ux * PUSH.out * pu; st.z -= s.S.L.uz * PUSH.out * pu; }
        const pk = L.pushK || (L.pushK = new Map()); if (pu > 0.05 && !(pk.get(c) > 0.05) && !jump) b.impulse(0.12); pk.set(c, pu);
      }
      b.drive({ x: st.x, z: st.z, heading: st.h, v: L.held ? 0 : st.v * rate, snap: jump, sim: true, aim: water ? st.aim : null, dock: water && !!st.dock, cruise: water ? (st.cruise || 0) * rate : 0, hold: !water || L.held });
    }
    // the people
    const inBoat = s.kind === 'paddle' || s.kind === 'drift';
    const steps = L.steps || (L.steps = new Map());
    L.persons.forEach((a, i) => {
      const seat = L.seatOf.get(i);
      if (inBoat && seat) { a.walking = null; const b = L.boats[seat.c]; if (a.boat !== b || a.seat !== seat.seat) b.seatCrew(a, seat.seat); return; }
      // r2 2: the hand-over with the camp: down from it on the morning they go, up to it as they come in
      const HP = s.kind === 'launch' && L.depart ? this.departPose(L, s, i, (h - s.h0) * 3600 / CLOCK) : s.kind === 'land' && L.arrive ? this.arrivePose(L, s, i, (s.h1 - h) * 3600 / CLOCK, h) : null;
      if (HP && HP.hide) { a.hidden = true; a.walking = null; const o = this.spot(s.S, i, _s, L); a.drive({ x: o.x, z: o.z, heading: o.h, v: 0, mode: 'stand', snap: true }); return; }
      a.hidden = false;
      if (HP) { a.walking = null; steps.delete(i); a.drive({ x: HP.x, z: HP.z, heading: HP.heading, v: HP.v, mode: HP.mode, pack: HP.pack, hull: HP.hull, anim: HP.anim || null, snap: jump }); return; }
      // r2: at the bank: their job there, getting in one at a time, and out
      const bp = this.bankPose(L, s, i, h, seat, s.kind === 'launch' ? this.departLag(L, i) : 0);
      if (bp) {
        a.walking = null;
        const b = L.boats[seat.c];
        if (bp.seat) { steps.delete(i); if (a.boat !== b || a.seat !== seat.seat) b.seatCrew(a, seat.seat); return; }
        if (bp.step) {
          // (the weight onto the gunwale, the foot down in her, the rest in: the hull rocks, toward them; and out)
          const was = steps.get(i), u = bp.u;
          if (b && was != null && !jump) for (const m of [0.3, 0.75]) if ((was < m) !== (u < m)) b.impulse(0.22 * bp.Hs.side * (m < 0.5 ? 1 : 0.6) * (bp.out ? -1 : 1));
          steps.set(i, u);
          const P = bp.step, y = (this.tiles && this.tiles.groundAt ? this.tiles.groundAt(P.x, P.z) : 0), fy = y + (bp.Hs.floor - y) * P.lift;
          a.drive({ x: P.x, z: P.z, heading: P.heading, v: P.v, mode: 'stand', anim: P.anim, y: P.lift > 0.02 ? Math.max(y, fy) : null, snap: jump });
          return;
        }
        steps.delete(i);
        const J = bp.job;
        a.drive({ x: J.x, z: J.z, heading: J.heading, v: J.v, mode: J.mode, pack: J.pack, anim: J.anim, snap: jump });
        return;
      }
      if (s.kind === 'carry') {
        const t = ((L.base ?? h) - s.h0) * 3600 - ((L.dl && L.dl.get(i)) || 0), walks = s.sched.people.get(i) || [];
        let w = null, after = null;
        for (const q of walks) { if (t >= q.s && t < q.e) { w = q; break; } if (t >= q.e) after = q; }
        if (w) {
          const line = this.walkLine(L, s, i, w.dir), f = (t - w.s) / Math.max(1e-6, w.e - w.s), q = along(line, f * line.L, _p, w.kind === 'carry' ? 1.6 : 0.9);
          const side = L.aside.get(i) || 0, x = q.x - q.tz * side, z = q.z + q.tx * side;
          const still = L.held || (L.stop && L.stop.has(i)) || (side && !(L.passing && L.passing.has(i)));
          a.drive({ x, z, heading: headingOf(q.tx, q.tz), v: still ? 0 : (line.L / (w.e - w.s)) * rate, mode: w.kind, pack: w.pack, hull: w.canoe != null ? crew.hulls[w.canoe] : undefined, snap: jump });
          a.walking = { w, s: f * line.L, line };
          return;
        }
        a.walking = null;
        const atB = after && after.dir > 0, o = this.spot(atB ? s.B : s.A, i, _s, L);
        a.drive({ x: o.x, z: o.z, heading: atB ? headingOf(-s.B.L.ux, -s.B.L.uz) : o.h, v: 0, mode: 'stand', snap: jump });
        return;
      }
      a.walking = null;
      const S = s.kind === 'launch' || s.kind === 'land' || s.kind === 'landing' ? s.S : s.B || s.S, o = this.spot(S, i, _s, L);
      a.drive({ x: o.x, z: o.z, heading: o.h, v: 0, mode: 'stand', snap: jump });
    });
  }

  // --- the frame -------------------------------------------------------------------------------------------------
  update(dt) {
    const t0 = performance.now();
    if (!(dt >= 0)) dt = 0;
    const h = this.now, jumped = this.lastH == null || Math.abs(h - this.lastH) > 0.25;
    const gh = jumped ? 0 : Math.max(0, h - this.lastH); // game hours this frame
    this.lastH = h;
    if ((this.t += dt) >= MOVES.sync || jumped) { this.t = 0; this.choose(); this.greetings(); }
    const budget = { t0: performance.now(), ms: MOVES.pathMs }, p = this.player;
    this.teachOn = false;
    for (const L of this.active.values()) {
      if (L.broken) continue;
      if (!L.ready && !this.prepare(L)) continue;
      const lag = this.lags.get(L.party.id) || { lag: 0 };
      this.lags.set(L.party.id, lag);
      // the holds: the trail's etiquette, a word being said
      L.talkHold = Math.max(0, L.talkHold - dt);
      // (a carry's delays are each person's own (L.dl, game seconds): those stopped for you wait, the rest walk on; the
      // carry ends once the last is over, and its longest delay then goes on the party's clock)
      L.dl = L.dl || new Map();
      const dlMax = () => { let m = 0; for (const v of L.dl.values()) m = Math.max(m, v); return m; };
      if (L.dl.size && L.dlSeg && this.segAt(L, h - lag.lag - dlMax() / 3600) !== L.dlSeg) { lag.lag += dlMax() / 3600; L.dl.clear(); L.dlSeg = null; }
      L.held = this.holds(L, h - lag.lag - dlMax() / 3600, dt) || L.talkHold > 0 || this.trailBusy(L, h - lag.lag - dlMax() / 3600);
      if (!L.held && L.stop && L.stop.size && L.seg && L.seg.kind === 'carry') {
        L.dlSeg = L.seg;
        for (const i of L.stop) L.dl.set(i, (L.dl.get(i) || 0) + gh * 3600);
      }
      if (L.held) lag.lag += gh;
      else if (lag.lag > 0) {
        // made up: while you are not by them, or in a stop (the lunch, a drift)
        const s = L.seg, d = this.distTo(L);
        // (r2 2: and the time-lapse of it only out of sight: a carry seen 200 m off had walked half again as fast)
        const away = d > MOVES.near && !this.seen(L);
        if (away || (s && (s.kind === 'drift' || (s.kind === 'landing' && s.lunch)))) lag.lag = Math.max(0, lag.lag - gh * (away ? MOVES.catchUp : 1));
      }
      const he = h - lag.lag - dlMax() / 3600;
      L.base = h - lag.lag; // (a carry's people: each on this clock less their own delay)
      // (in, and the camp has them: its canoes up the bank and its people at the fire, from this frame)
      if (he >= L.plan.end && L.plan.to.kind === 'site' && this.partyCamps) { const D = this.partyCamps.drawn.get(L.plan.to.key); if (D && D.canoesIn) { this.drop(L); continue; } }
      // (far off: only its place along the plan; the actors made as it comes into range, let go as it leaves)
      // (r2 2: with its actors made, how far the nearest of them is: a long carry's middle had been taken for where the party
      // was, so a party carrying right by you, 1 km from that middle, was placed every third frame, each step three frames'
      // worth: 0.5 m and more a jump, 16 m/s and over seen)
      const at = this.whereAt(L, he), has = L.boats.length + L.persons.length > 0, far = Math.min(Math.hypot(at.x - p.x, at.z - p.z), has ? this.distTo(L) : Infinity);
      if (has && far > MOVES.dormR) this.freeActors(L);
      if (!has && far < MOVES.actR) this.makeActors(L);
      if (!L.boats.length && !L.persons.length) continue;
      // (well off, a far hull at most: placed every third frame, in turn)
      L.n = (L.n || 0) + 1;
      if (far > 320 && !jumped && L.lastH != null && !L.wasPathless && (L.n + L.party.slot) % 3 !== 0) continue;
      L.pathless = false; L.routeWait = false;
      this.place(L, he, jumped || L.lastH == null || L.wasPathless, budget);
      L.wasPathless = L.pathless;
      if (L.routeWait) lag.lag += gh; // (r2 2: waiting at the bank or afloat for the route: the plan waits with them)
      L.lastH = he;
      if (L.plan.to.stay) { if (L.seg && (L.seg.kind === 'land' || (L.seg.kind === 'paddle' && L.seg.u1 === 1)) && this.distTo(L) < 900) this.parties.seenIn.add(L.plan.to.stay.id); }
      if (L.st) for (const S of [L.st.from, L.st.to, ...[...L.st.carry.values()].flatMap((c) => [c.A, c.B])]) if (!S.checked && Math.hypot(S.L.x - p.x, S.L.z - p.z) < MOVES.fixR) this.checkSpots(S);
    }
    this.holdOff(dt);
    // (a delay of a party no longer followed is made up out of sight, then forgotten)
    if (this.lags.size) {
      const on = new Set([...this.active.values()].map((L) => L.party.id));
      for (const [id, l] of this.lags) { if (on.has(id)) continue; l.lag = Math.max(0, l.lag - gh * MOVES.catchUp); if (!l.lag) this.lags.delete(id); }
    }
    const ms = performance.now() - t0;
    this.cost.ms += ms; this.cost.n++; this.cost.max = Math.max(this.cost.max, ms);
  }
  distTo(L) { const p = this.player; let d = Infinity; for (const a of [...L.boats, ...L.persons]) { if (a.hidden || a.boat) continue; d = Math.min(d, Math.hypot(a.x - p.x, a.z - p.z)); } return d; }

  // The trail's etiquette at hour h of the leg's clock: true while they wait for you. On a carry of theirs: you carrying
  // on that trail and none of them out on it, they wait at the landing; one of them coming at you (or overtaking you)
  // on the tread within MOVES.ahead, they stop; one walking back empty, or any while you are the one loaded, steps off
  // the tread till you are by. The moment (hints.js 'partytrail') the first time a loaded one comes at you.
  holds(L, h, dt) {
    const s = L.seg, p = this.player;
    // (the step off the tread eased in and out: last frame's wants, over whoever is aside or wants to be)
    for (const i of new Set([...L.aside.keys(), ...(L.asideWant ? L.asideWant.keys() : [])])) { const v = L.aside.get(i) || 0, want = (L.asideWant && L.asideWant.get(i)) || 0, nv = v + clamp(want - v, -dt * 1.6, dt * 1.6); if (Math.abs(nv) < 1e-3 && !want) L.aside.delete(i); else L.aside.set(i, nv); }
    if (L.asideWant) L.asideWant.clear();
    L.passing = L.passing || new Set(); L.passing.clear();
    L.stop = L.stop || new Set(); L.stop.clear();
    if (!s || s.kind !== 'carry' || !p.onFoot) return false;
    const me = nearestOn(s.trail, p.x, p.z);
    if (me.d > 6 || Math.hypot(s.A.L.x - p.x, s.A.L.z - p.z) > s.trail.L + 60) return false;
    const onTread = me.d < MOVES.tread, carrying = p.mode === 'carry';
    let hold = false;
    const t = (h - s.h0) * 3600, walking = L.persons.filter((a) => a.walking);
    // waiting at the landing while you carry (nobody of theirs on the trail yet, someone about to go)
    if (carrying && me.d < 3 && !walking.length) {
      const soon = [...s.sched.people.values()].some((ws) => ws.some((q) => q.s >= t - 1 && q.s < t + 30));
      if (soon) hold = true;
    }
    L.asideWant = L.asideWant || new Map();
    // your way along the trail (m/s, + their way): standing, or coming at them, or going their way ahead of them
    const fx = Math.cos(p.heading), fz = -Math.sin(p.heading), sp = Math.abs(p.speed || 0) > 0.25 ? p.speed : 0;
    const stop = (i) => { L.stop.add(i); };
    L.persons.forEach((a, i) => {
      const W = a.walking; if (!W) return;
      const mine = nearestOn(W.line, p.x, p.z), ahead = mine.s - W.s; // (on their own line: + ahead of them)
      const loaded = W.w.kind === 'carry' || W.w.pack, q = along(W.line, W.s, _q), same = sp * (fx * q.tx + fz * q.tz) > 0.25;
      if (loaded && mine.d < MOVES.clear && !carrying && ahead > 0 && ahead < MOVES.teachR && !same) this.teachOn = true; // (in their way)
      const near = onTread && mine.d < MOVES.tread + 0.4 && ahead > -0.6 && ahead < MOVES.ahead;
      if (!near) {
        // (you by them, or off the tread: whoever stepped aside comes back once you are past)
        if (L.aside.has(i) && (ahead < -1.5 || mine.d > MOVES.clear || Math.abs(ahead) > MOVES.ahead + 4)) L.asideWant.set(i, 0);
        else if (L.aside.has(i) && !L.wasPassing?.has(i)) { L.asideWant.set(i, L.aside.get(i) > 0 ? MOVES.aside : -MOVES.aside); stop(i); }
        return;
      }
      // going their way ahead of them: they keep behind you (nobody passes on the trail)
      if (same) { stop(i); return; }
      // you loaded: they step off the tread and wait till you are by
      if (carrying) { stop(i); L.asideWant.set(i, L.aside.has(i) ? Math.sign(L.aside.get(i)) * MOVES.aside : this.asideSide(W, mine) * MOVES.aside); return; }
      // they loaded, you not: they stop and wait for you to step aside (the moment says it)
      if (loaded) { stop(i); return; }
      // neither loaded: one walking back empty steps round you without stopping
      if (ahead < 5) { L.passing.add(i); L.asideWant.set(i, L.aside.has(i) ? Math.sign(L.aside.get(i)) * 1.1 : this.asideSide(W, mine) * 1.1); }
    });
    L.wasPassing = new Set(L.passing);
    // (whoever is behind one stopped, going the same way, stops too: nobody passes in their own line either; and so
    // does whoever has not set off yet)
    if (L.stop.size) L.persons.forEach((a, i) => {
      if (L.stop.has(i)) return;
      const W = a.walking;
      if (!W) { L.stop.add(i); return; }
      for (const j of L.stop) { const V = L.persons[j].walking; if (V && V.w.dir === W.w.dir && V.s > W.s) { L.stop.add(i); break; } }
    });
    return hold;
  }
  // Between parties on one carry: one about to go onto the trail waits at its landing while another party is out on it
  // (from either end: nobody passes on the trail); two about to go at once, the one that came first goes first
  trailBusy(L, h) {
    const s = this.segAt(L, h);
    if (s.kind !== 'carry') return false;
    const on = (X, hx) => { const q = this.segAt(X, hx); if (q.kind !== 'carry' || q.p !== s.p) return null; const t = (hx - q.h0) * 3600; let walking = false, soon = false; for (const ws of q.sched.people.values()) for (const w of ws) { if (t >= w.s && t < w.e) walking = true; else if (w.s >= t && w.s < t + 30) soon = true; } return { q, walking, soon }; };
    const me = on(L, h);
    if (!me || me.walking || !me.soon) return false;
    for (const X of this.active.values()) {
      if (X === L || !X.ready) continue;
      const o = on(X, this.now - this.lagOf(X.party.id));
      if (!o) continue;
      if (o.walking) return true;
      if (o.soon && (o.q.h0 < s.h0 || (o.q.h0 === s.h0 && X.id < L.id))) return true;
    }
    return false;
  }
  // which side of the tread to step off to: away from you, and the side with no trunk in the way
  asideSide(W, mine) {
    const q = along(W.line, W.s, { x: 0, z: 0, tx: 1, tz: 0 }), T = this.tiles;
    const pref = mine.side > 0 ? -1 : 1, sides = [pref, -pref];
    for (const sd of sides) {
      const x = q.x - q.tz * sd * MOVES.aside, z = q.z + q.tx * sd * MOVES.aside;
      const hit = T && typeof T.treesNear === 'function' && T.treesNear(x, z, 1).some((t) => !t.shape && Math.hypot(t.x - x, t.z - z) < (t.r || 0.3) + 0.5);
      if (!hit) return sd;
    }
    return pref;
  }

  // On the water: within holdR they swing aside of you (a soft steer, eased); your canoe is eased off a hull it comes
  // against. On foot: you are held off their people as off anyone (npcs.js holdOff).
  holdOff(dt) {
    const p = this.player, k = 1 - Math.exp(-0.9 * dt);
    for (const L of this.active.values()) {
      if (!L.ready) continue;
      const s = L.seg, onWater = s && (s.kind === 'paddle');
      L.boats.forEach((b, c) => {
        let want = 0;
        if (onWater && p.mode === 'paddle' && !b.hidden) {
          const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
          if (d < MOVES.holdR) {
            const fx = Math.cos(b.heading), fz = -Math.sin(b.heading), side = fx * dz - fz * dx > 0 ? -1 : 1; // (away from you: across their way)
            want = side * Math.min(MOVES.holdOff, (MOVES.holdR - d) * 0.5);
            // (not into the bank)
            const w = this.world, nx = b.x + fz * want * -1, nz = b.z + fx * want;
            if (w.shoreAt && w.shoreAt(nx, nz) > -3) want *= 0.3;
          }
        }
        const o = L.off.get(c) || 0, n = o + (want - o) * k;
        if (Math.abs(n) < 0.01 && !want) L.off.delete(c); else L.off.set(c, n);
        // your canoe against theirs: eased off along the line between the keels
        if (p.mode === 'paddle' && !b.hidden && b.near) {
          const fx = Math.cos(b.heading), fz = -Math.sin(b.heading), dx = p.x - b.x, dz = p.z - b.z, u = clamp(dx * fx + dz * fz, -2.4, 2.4);
          const ox = dx - fx * u, oz = dz - fz * u, d = Math.hypot(ox, oz);
          if (d < MOVES.touch && d > 1e-3) { const push = (MOVES.touch - d) * Math.min(1, dt * 3); p.x += (ox / d) * push; p.z += (oz / d) * push; }
        }
      });
      if (p.onFoot) for (const a of L.persons) {
        if (!a.bind || a.boat) continue;
        const dx = p.x - a.x, dz = p.z - a.z, d = Math.hypot(dx, dz), keep = a.mode === 'carry' ? 0.6 : 0.45;
        if (d < keep && d > 1e-4) { p.x = a.x + (dx / d) * keep; p.z = a.z + (dz / d) * keep; }
      }
    }
  }

  // --- what they say --------------------------------------------------------------------------------------------
  // passing within greetR by day, once a day a party may say a word (fewer far from a store); the camps' greetings
  greetings() {
    const C = this.partyCamps, T = this.parties.today, p = this.player;
    if (!C || !this.dialogue || this.quiet) return;
    for (const L of this.active.values()) {
      if (!L.ready || C.greeted.get(L.party.id) === T) continue;
      let best = -1, bd = MOVES.greetR;
      // (one in a canoe is where the canoe is, its hull drawn; one on foot while drawn)
      L.persons.forEach((a, i) => { const o = a.boat ? (a.boat.hidden || !a.boat.near ? null : a.boat) : a.bind ? a : null; if (!o) return; const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bd) { bd = d; best = i; } });
      if (best < 0) continue;
      C.greeted.set(L.party.id, T);
      const rng = mulberry32((hashStr(L.party.id) ^ (T * 2654435761)) >>> 0), far = C.storeDistance ? C.storeDistance(L.persons[best].boat || L.persons[best]) : 8000;
      const pW = MOVES.word[0] + (MOVES.word[1] - MOVES.word[0]) * clamp((far - MOVES.store[0]) / (MOVES.store[1] - MOVES.store[0]), 0, 1);
      if (rng() >= pW) continue;
      const line = C.helloFor(L.party, rng);
      if (line) this.say(L, best, line, PRI.greet);
    }
  }
  say(L, i, text, pri) {
    if (!text || !this.dialogue) return null;
    if (this.partyCamps) this.partyCamps.markSaid(L.party, text);
    return this.dialogue.bark(L.speakers[i], text, { room: `party:${L.party.id}`, pri });
  }
  // E on one of them (the dot): a word about their trip, and they hold a moment while it is said
  talk(L, i) {
    const C = this.partyCamps; if (!C) return null;
    const T = this.parties.today, rng = mulberry32((hashStr(L.party.id) ^ 0xa11ce ^ (T * 977)) >>> 0);
    const line = C.tripLine(L.party, L.plan.to.kind === 'ep', rng);
    L.talkHold = MOVES.talkFor;
    C.greeted.set(L.party.id, T);
    this.say(L, i, line, PRI.reply);
    if (this.people && typeof this.people.emitTalk === 'function') this.people.emitTalk({ kind: 'party', partyId: L.party.id, moving: true }); // gl-e: people.onTalk (the lake: where you are)
    return line;
  }

  // --- the dot (pointer.js partyTargets) ---------------------------------------------------------------------------
  // on foot: one of them within reach (E Talk); on the water (water: true): a canoe of theirs within talkR (E Talk)
  pointTargets(ray, near, water = false) {
    const out = [], p = this.player;
    for (const L of this.active.values()) {
      if (!L.ready) continue;
      const v = L.who, name = v ? (v.kind === 'family' ? `the ${v.last}s` : null) : null;
      if (!water) {
        L.persons.forEach((a, i) => {
          if (!a.bind || a.boat || near.flat(a.x, a.z) > 2.3) return;
          // (r2: the rod from the feet to the head as the skeleton has it this frame, a crouch or a step in included; the
          // pool of light at the feet, laid on the ground's slope: pointer.js)
          const hd = a.headAt(_hv), foot = a.y, top = hd.y - 0.04, bot = foot + 0.22, hit = near.segment(a.x, bot, a.z, hd.x, top, hd.z, 0.42);
          if (!hit) return;
          out.push({ dist: hit.t, miss: hit.miss * 0.9, target: { kind: 'person', ref: `party:${L.party.id}#${i}`, label: L.speakers[i].name, e: { verb: 'Talk', run: () => this.talk(L, i) }, box: { x: a.x, y: (top + bot) / 2, z: a.z, hx: 0.3, hy: (top - bot) / 2, hz: 0.3, heading: a.heading, foot, ground: this.tiles && this.tiles.groundAt ? (x, z) => this.tiles.groundAt(x, z) : null } } });
        });
        continue;
      }
      L.boats.forEach((b) => {
        if (b.hidden || !b.near || !b.crew.length) return;
        const fx = Math.cos(b.heading), fz = -Math.sin(b.heading), dx = p.x - b.x, dz = p.z - b.z, u = clamp(dx * fx + dz * fz, -2.4, 2.4);
        if (Math.hypot(dx - fx * u, dz - fz * u) > MOVES.talkR) return;
        const hit = near.box({ x: b.x, y: b.y + 0.5, z: b.z, hx: 2.7, hy: 1.0, hz: 1.1, heading: b.heading });
        if (!hit) return;
        const i = L.persons.indexOf(b.crew[0]);
        out.push({ dist: hit.t, miss: hit.miss, target: { kind: 'person', ref: `party:${L.party.id}/boat`, label: name || L.speakers[Math.max(0, i)].name, e: { verb: 'Talk', run: () => this.talk(L, Math.max(0, i)) }, box: { x: b.x, y: b.y + 0.3, z: b.z, hx: 2.4, hy: 0.4, hz: 0.45, heading: b.heading } } });
      });
    }
    return out;
  }

  // --- the moment ---------------------------------------------------------------------------------------------------
  moments() {
    return [{ id: 'partytrail', prio: 1, recur: 'once', text: 'The loaded carry has the trail: step aside.', due: () => this.teachOn }];
  }

  // --- the console's and the tests' -----------------------------------------------------------------------------
  stats() {
    const c = this.cost, out = { active: this.active.size, ready: 0, paths: this.paths, pathMs: this.pathMs.slice(-12), mean: c.n ? +(c.ms / c.n).toFixed(4) : 0, max: +c.max.toFixed(3), legs: [] };
    for (const L of this.active.values()) {
      if (L.ready) out.ready++;
      const s = L.seg, p = this.player;
      out.legs.push({ id: L.id, kind: L.party.kind, size: L.party.size, seg: s ? s.kind : null, lag: +this.lagOf(L.party.id).toFixed(3), held: L.held, d: Number.isFinite(this.distTo(L)) ? Math.round(this.distTo(L)) : null,
        boats: L.boats.map((b) => (b.hidden ? 'carried' : `${Math.round(Math.hypot(b.x - p.x, b.z - p.z))}m${b.near ? '*' : ''}`)), people: L.persons.filter((a) => a.bind).length, broken: !!L.broken });
    }
    return out;
  }
  resetCost() { this.cost = { ms: 0, n: 0, max: 0 }; }
  // the tests': a water path between two points of a basin, searched to the end now ('wait' while tiles come)
  pathTest(a, b, basin, debug = false) {
    PATH_DEBUG.on = debug; PATH_DEBUG.log = [];
    const out = this._pathTest(a, b, basin);
    PATH_DEBUG.on = false;
    return debug ? { out, log: PATH_DEBUG.log } : out;
  }
  _pathTest(a, b, basin) { const gen = waterPath(this.masks, this.world, this.basinOf, a, b, basin); let r = gen.next(); while (!r.done) r = gen.next(); return r.value; }
}
const _hv = new THREE.Vector3(), _sd = { x: 0, z: 0, h: 0 };
const _p = { x: 0, z: 0, tx: 1, tz: 0 }, _q = { x: 0, z: 0, tx: 1, tz: 0 }, _w = { x: 0, z: 0, tx: 1, tz: 0 }, _s = { x: 0, z: 0, h: 0 }, _b = { x: 0, z: 0, h: 0, v: 0 };
