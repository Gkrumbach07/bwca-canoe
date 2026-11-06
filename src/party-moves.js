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
  near: 150,         // m: by them (a delay is not made up, a landing's spots checked for trunks)
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
const BOARD = { walk: 3.2, step: 1.6, gap: 0.1, first: 3.4, total: 9 }; // s: the walk to the side, each step in, the board's length
const OUT = { first: 2.0, step: 1.5, gap: 0.15, walk: 3.0 };            // s: the first out, each step out, the walk to their place
const SEAT_X = { stern: SEATS.stern.x, bow: SEATS.bow.x, mid: -0.42 };
const SLOT_ALONG = 6.2;      // m between canoes lying along the bank
const ORDER = { bow: 0, mid: 1, stern: 2 }; // who gets in first (the bow) and out first (the bow)
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
    }
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
    if (s.u1 === 1 && path.L - sAt < la + 8 && s.kind !== 'drift') { const o = sl(s.B, c); aim.x = o.x; aim.z = o.z; }
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
    const r = i >= 0 ? mulberry32((hashStr(`${L.party.id}:${i}:side`) ^ 0x3c6e) >>> 0) : null, off = r ? 0.72 + 0.3 * r() : 0.85, along = r ? (r() - 0.5) * 0.5 : 0; // (each their own place by her)
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
  // r2: where person i is at hour h of seg s (null: the old ways, the carry's walks and the spots), or { seat } in the hull
  bankPose(L, s, i, h, seat) {
    if (!seat) return null;
    const kind = s.kind, n = L.persons.length;
    // the order in the canoe: the bow in first and out first, the stern last in (pushing off) and last out
    const crewOf = L.plan.crew.boats[seat.c] || [], order = crewOf.map((j) => L.seatOf.get(j)).sort((x, y) => ORDER[x.seat] - ORDER[y.seat]).map((q) => q.seat), k = Math.max(0, order.indexOf(seat.seat));
    const jit = (mulberry32((hashStr(`${L.party.id}:${seat.c}:b`) ^ 0x2545) >>> 0)() - 0.5) * 0.5;
    const boardEnd = kind === 'launch' || kind === 'landing' ? s.h1 : null;
    if (boardEnd != null) {
      const S = s.S, tb = BOARD.total - (boardEnd - h) * 3600 / CLOCK; // (s into the boarding; < 0 before it)
      if (tb < 0) {
        const t0 = kind === 'launch' ? s.h0 : s.h0;
        return { job: this.jobAt(L, S, i, (h - t0) * 3600 / CLOCK, 'bank', false, kind === 'landing' && s.lunch) };
      }
      const Hs = this.sideOf(L, seat.c, seat.seat, S, i), stIn = BOARD.first + jit + k * (BOARD.step + BOARD.gap);
      if (tb >= stIn + BOARD.step) return { seat: true };
      if (tb >= stIn) return { step: this.stepPose(Hs, (tb - stIn) / BOARD.step), Hs, u: (tb - stIn) / BOARD.step };
      // to the side of the canoe from wherever the job had them, then a hand on the gunwale till it is their turn
      const P0 = this.jobAt(L, S, i, (boardEnd - BOARD.total / 3600 * CLOCK - s.h0) * 3600 / CLOCK, 'bank', false, kind === 'landing' && s.lunch);
      const k2 = Math.min(1, tb / BOARD.walk), d = Math.hypot(Hs.x - P0.x, Hs.z - P0.z);
      if (k2 < 1) return { job: { x: P0.x + (Hs.x - P0.x) * smooth(k2), z: P0.z + (Hs.z - P0.z) * smooth(k2), heading: d > 0.3 ? headingOf(Hs.x - P0.x, Hs.z - P0.z) : Hs.face, v: (d / BOARD.walk) * 1.5 * Math.sin(Math.PI * k2), mode: 'walk', pack: false, anim: null } };
      return { job: { x: Hs.x, z: Hs.z, heading: Hs.face, v: 0, mode: 'stand', pack: false, anim: { crouch: 0.5 } } };
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
    const water = s.kind === 'paddle' || s.kind === 'drift', path = water ? this.pathOf(L, s, budget) : null;
    // (the next water leg's path too, while there is time this frame)
    if (budget) { const i = plan.segs.indexOf(s); for (let j = i + 1; j < plan.segs.length && j < i + 4; j++) { const q = plan.segs[j]; if (q.kind === 'paddle') { this.pathOf(L, q, budget); break; } } }
    // the canoes
    for (let c = 0; c < n; c++) {
      const b = L.boats[c];
      let st = null;
      if (water && (!path || path.none)) { b.hide(); L.pathless = !path; continue; } // (its path still being found, or none: not drawn)
      if (water) st = this.boatOnWater(L, s, c, n, h, _b, path);
      else if (s.kind === 'carry') {
        const ci = L.plan.crew.boats[c][0], t = ((L.base ?? h) - s.h0) * 3600 - ((L.dl && L.dl.get(ci)) || 0), B = s.sched.boats[c]; // (the canoe's carrier's own clock)
        if (B && t >= B.lift && t < B.down) { b.hide(); continue; }
        const o = this.slot(B && t >= B.down ? s.B : s.A, c, n, _s); st = { x: o.x, z: o.z, h: o.h, v: 0 };
      } else { const o = this.slot(s.S, c, n, _s); st = { x: o.x, z: o.z, h: o.h, v: 0 }; }
      b.drive({ x: st.x, z: st.z, heading: st.h, v: L.held ? 0 : st.v * rate, snap: jump, sim: true, aim: water ? st.aim : null, cruise: water ? (st.cruise || 0) * rate : 0, hold: !water || L.held });
    }
    // the people
    const inBoat = s.kind === 'paddle' || s.kind === 'drift';
    const steps = L.steps || (L.steps = new Map());
    L.persons.forEach((a, i) => {
      const seat = L.seatOf.get(i);
      if (inBoat && seat) { a.walking = null; const b = L.boats[seat.c]; if (a.boat !== b || a.seat !== seat.seat) b.seatCrew(a, seat.seat); return; }
      // r2: at the bank: their job there, getting in one at a time, and out
      const bp = this.bankPose(L, s, i, h, seat);
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
      L.pathless = false;
      this.place(L, he, jumped || L.lastH == null || L.wasPathless, budget);
      L.wasPathless = L.pathless;
      L.lastH = he;
      if (L.plan.to.stay) { if (L.seg && (L.seg.kind === 'land' || (L.seg.kind === 'paddle' && L.seg.u1 === 1)) && this.distTo(L) < 900) this.parties.seenIn.add(L.plan.to.stay.id); }
      if (L.st && this.distTo(L) < MOVES.near) for (const S of [L.st.from, L.st.to, ...[...L.st.carry.values()].flatMap((c) => [c.A, c.B])]) if (!S.checked && Math.hypot(S.L.x - p.x, S.L.z - p.z) < MOVES.near) this.checkSpots(S);
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
