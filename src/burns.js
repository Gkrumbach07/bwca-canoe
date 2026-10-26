// The real burns (the owner, 2026-10-26: "we should be using real data for burns"). Every wildfire, prescribed burn and
// the 1999 blowdown the agencies have mapped in the game's box, read from src/burns.bin (scripts/burns.mjs makes it):
//   - USFS EDW Final Fire Perimeter (All Years): the wildfires 1923-2021 (Pagami Creek 2011, Ham Lake 2007, Cavity Lake
//     2006, Little Indian Sioux 1971, Brule Lake 1929 ...)
//   - NIFC WFIGS Interagency Perimeters: the fires from 2020 on, the July 2026 fires among them (Bear Trap, Thumb,
//     Wolfpack, Sioux, Camp, Little Knife), each its latest perimeter and its discovery date
//   - USFS FACTS Hazardous Fuels Treatments: the prescribed burns (broadcast burns and underburns)
//   - MN DNR Most Recent Fast Forest Disturbances v4, wind 1999-2001: the blowdown of 4 July 1999
// Each event is a kind, a name, a year and a start day, and its perimeter simplified to about 20 m. Nothing else.
//
// What a point is: the most recent event over it whose start has come by the season's date (setBurnDate: a fire of the
// season's own year counts once the date is past its start day, so the July 2026 fires are there from their real
// starts in a 2026 season), and the one before it (the ground burned in 2006 and again in 2011). An event's edge is a
// soft band some tens of metres wide, broken by a noise so it runs ragged as a fire's edge does. Water is never burned:
// the perimeters are kept whole in the table and clipped to land by the game's own shore distance where they are read.
//
// What an event leaves, by its age (LOOK): the char, the open ground, the standing snags black then grey, the deadfall,
// the thicket of jack pine and aspen and its height, the young trees and theirs, what is left of the old understory,
// the bracken and the shrubs coming in, the grass and the fireweed, the berries. burnLook(x, z) blends them at a point
// (the edge, and the event before) into one plain object the terrain, the forest, the ground cover and the forage read:
//   char      0..1  black ground and ash (fresh)            ground  0..1  the tawny open ground of a burn (grass, ferns)
//   open      0..1  an open burn (the ground class 'burn') mature  0..1  share of the old forest's trees still standing alive
//   snags     per old tree, standing dead                  black   0..1  how black those still are (else grey)
//   scorch    0..1  char up the foot of the trunks         logs    down trunks per cell, more than the forest's own
//   logsKeep  share of the forest's own deadfall left     thicket stems of the regrowth per cell, `regrow` m tall
//   young     young trees per cell, `youngH` m tall         under   share of the old understory left
//   bracken   bracken per cell, added                        shrubs  shrubs per cell, added (raspberry, pin cherry, willow)
//   grass     the grass cover, at least                     fireweed 0..1 of it fireweed
//   berries   how much likelier a berry patch               pines   0..1  of the fir and spruce under the pines killed
//   kind, age, w, rec   the event that weighs most here (kind 0: none), and its record (name: burnName)
//
// In the tile worker (tile-worker.js loads it before its first build) and on the main thread (main.js: the forage, the
// burn's name the first time you are in it). The look is a pure function of the table, the date and the point, so
// two tiles built on the same date agree at their seam.
import { fbm, clamp, smoothstep } from './rng.js';

export const KIND = { none: 0, wildfire: 1, prescribed: 2, blowdown: 3 };
const KIND_NAME = ['none', 'wildfire', 'prescribed', 'blowdown'];
const URL_ = new URL('./burns.bin', import.meta.url);
const MAGIC = 0x314e5242;
// the soft edge: the band's half width and how far the noise pushes it about (m); MARGIN covers both
const EDGE = { band: 14, ragged: 26, scale: 0.012 };
const MARGIN = EDGE.band + EDGE.ragged + 2;
const CELL = 200; // m: the index's cells
// a day's share of a year
const YEAR_DAYS = 365.25;

export const BURNS = { ready: false, records: [], names: [], sources: '', built: 0, bytes: 0, ms: 0 };
const date = { year: 2026, doy: 200 };
export function setBurnDate(year, doy) { if (Number.isFinite(year) && Number.isFinite(doy)) { date.year = year; date.doy = doy; } }
export function burnDate() { return { year: date.year, doy: date.doy }; }

// --- reading the table -----------------------------------------------------------------------------------------------
let loading = null;
export function loadBurns(url = URL_) {
  if (!loading) loading = (async () => {
    const t0 = performance.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
    const gz = await res.arrayBuffer();
    // (a server that already undid the gzip hands the raw table: its magic shows at once)
    const raw = new DataView(gz).getUint32(0, true) === MAGIC ? gz : await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    parse(raw);
    BURNS.bytes = gz.byteLength; BURNS.ms = performance.now() - t0; BURNS.ready = true;
    return BURNS;
  })().catch((e) => { console.warn('burns: the table did not load; no burns', e); BURNS.ready = true; return BURNS; });
  return loading;
}

function parse(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC || dv.getUint16(4, true) !== 1) throw new Error('burns.bin: not a version 1 table');
  const n = dv.getUint16(6, true), nameBytes = dv.getUint32(8, true), srcBytes = dv.getUint32(12, true);
  BURNS.built = dv.getFloat64(16, true);
  let o = 24;
  const dec = new TextDecoder();
  BURNS.sources = dec.decode(new Uint8Array(buf, o, srcBytes)); o += srcBytes;
  BURNS.names = nameBytes ? dec.decode(new Uint8Array(buf, o, nameBytes)).split('\n') : []; o += nameBytes;
  const varint = () => { let v = 0, m = 1, b; do { b = dv.getUint8(o++); v += (b & 127) * m; m *= 128; } while (b & 128); return v; };
  const zig = () => { const v = varint(); return v % 2 ? -(v + 1) / 2 : v / 2; };
  const recs = [];
  for (let r = 0; r < n; r++) {
    const kind = dv.getUint8(o), flags = dv.getUint8(o + 1), year = dv.getUint16(o + 2, true), doy = dv.getUint16(o + 4, true), name = dv.getUint16(o + 6, true);
    const acres = dv.getUint32(o + 8, true), nr = dv.getUint32(o + 12, true);
    o += 16;
    const rings = [];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < nr; k++) {
      const np = varint(), pts = new Float64Array(np * 2);
      let x = 0, z = 0;
      for (let p = 0; p < np; p++) {
        x += zig(); z += zig(); pts[p * 2] = x; pts[p * 2 + 1] = z;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      rings.push(pts);
    }
    recs.push({ id: r, kind, guess: !!(flags & 1), year, doy, name: name ? BURNS.names[name - 1] : null, acres, rings, box: [x0, z0, x1, z1], t: year + (doy - 1) / YEAR_DAYS });
  }
  BURNS.records = recs;
  buildIndex(recs);
}

// --- the index ---------------------------------------------------------------------------------------------------------
// A grid of CELL m cells over the events' extent. Each cell lists the events that reach it: whether the cell's centre is
// inside the event, and the event's perimeter edges that come within MARGIN of the cell. A point is inside an event when
// the centre is, flipped once for every edge the line from the centre to the point crosses (only edges in the cell can);
// its distance to the edge is to the nearest of them (exact within MARGIN, the only distances the edge band needs).
let IX = null;
function buildIndex(recs) {
  if (!recs.length) { IX = null; return; }
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const r of recs) { x0 = Math.min(x0, r.box[0]); z0 = Math.min(z0, r.box[1]); x1 = Math.max(x1, r.box[2]); z1 = Math.max(z1, r.box[3]); }
  x0 -= MARGIN + CELL; z0 -= MARGIN + CELL;
  const nx = Math.ceil((x1 + MARGIN + CELL - x0) / CELL), nz = Math.ceil((z1 + MARGIN + CELL - z0) / CELL);
  // per (cell, event): the edges (flattened segments) and whether the centre is inside
  const lists = new Map(); // cell * 4096 + event -> { inside, segs: [] }
  const at = (c, r) => { const k = c * 4096 + r; let e = lists.get(k); if (!e) { e = { c, r, inside: 0, segs: [] }; lists.set(k, e); } return e; };
  for (const rec of recs) {
    for (const pts of rec.rings) {
      const np = pts.length / 2;
      for (let a = 0, b = np - 1; a < np; b = a++) {
        const ax = pts[b * 2], az = pts[b * 2 + 1], bx = pts[a * 2], bz = pts[a * 2 + 1];
        const i0 = Math.floor((Math.min(ax, bx) - MARGIN - x0) / CELL), i1 = Math.floor((Math.max(ax, bx) + MARGIN - x0) / CELL);
        const j0 = Math.floor((Math.min(az, bz) - MARGIN - z0) / CELL), j1 = Math.floor((Math.max(az, bz) + MARGIN - z0) / CELL);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          // (a long diagonal edge's box holds cells it passes well clear of: keep only those within MARGIN of it)
          const cx = x0 + (i + 0.5) * CELL, cz = z0 + (j + 0.5) * CELL;
          if (segDist(cx, cz, ax, az, bx, bz) > CELL * 0.7072 + MARGIN) continue;
          at(j * nx + i, rec.id).segs.push(ax, az, bx, bz);
        }
      }
    }
    // the centres inside, a row at a time (even-odd over every ring of the event)
    const ja = Math.max(0, Math.floor((rec.box[1] - z0) / CELL)), jb = Math.min(nz - 1, Math.floor((rec.box[3] - z0) / CELL));
    for (let j = ja; j <= jb; j++) {
      const z = z0 + (j + 0.5) * CELL, xs = [];
      for (const pts of rec.rings) {
        const np = pts.length / 2;
        for (let a = 0, b = np - 1; a < np; b = a++) {
          const za = pts[b * 2 + 1], zb = pts[a * 2 + 1];
          if ((za > z) !== (zb > z)) { const xa = pts[b * 2], xb = pts[a * 2]; xs.push(xa + ((z - za) / (zb - za)) * (xb - xa)); }
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let i = Math.max(0, Math.ceil((xs[k] - x0) / CELL - 0.5)); i < nx && x0 + (i + 0.5) * CELL < xs[k + 1]; i++) at(j * nx + i, rec.id).inside = 1;
      }
    }
  }
  // packed: per cell a run of entries [event, inside, first seg, seg count]
  const byCell = new Map();
  for (const e of lists.values()) { let a = byCell.get(e.c); if (!a) byCell.set(e.c, (a = [])); a.push(e); }
  const start = new Uint32Array(nx * nz + 1), entries = [], segs = [];
  const cells = [...byCell.keys()].sort((p, q) => p - q);
  let ci = 0;
  for (let c = 0; c < nx * nz; c++) {
    start[c] = entries.length / 4;
    if (ci < cells.length && cells[ci] === c) {
      // newest first, so a point stops at the first two events that cover it
      const list = byCell.get(c).sort((p, q) => recs[q.r].t - recs[p.r].t);
      for (const e of list) { entries.push(e.r, e.inside, segs.length / 4, e.segs.length / 4); segs.push(...e.segs); }
      ci++;
    }
  }
  start[nx * nz] = entries.length / 4;
  IX = { x0, z0, nx, nz, start, entries: new Int32Array(entries), segs: new Float32Array(segs) };
}
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

// The events at (x, z) by the date, newest first: up to two, each { rec, w (the edge's weight, 0..1) }, into `out`.
// Returns how many. (Water is the caller's to clip: these are the perimeters as mapped.)
const _hits = [{ rec: null, w: 0 }, { rec: null, w: 0 }];
export function eventsAt(x, z, out = _hits) {
  if (!IX) return 0;
  const i = Math.floor((x - IX.x0) / CELL), j = Math.floor((z - IX.z0) / CELL);
  if (i < 0 || j < 0 || i >= IX.nx || j >= IX.nz) return 0;
  const c = j * IX.nx + i, a = IX.start[c], b = IX.start[c + 1];
  if (a === b) return 0;
  const E = IX.entries, S = IX.segs, cx = IX.x0 + (i + 0.5) * CELL, cz = IX.z0 + (j + 0.5) * CELL, recs = BURNS.records;
  const Y = date.year, D = date.doy;
  let n = 0, rag = NaN;
  for (let q = a; q < b && n < 2; q++) {
    const rec = recs[E[q * 4]];
    if (rec.year > Y || (rec.year === Y && rec.doy > D)) continue; // not yet
    let inside = E[q * 4 + 1] === 1, d = Infinity;
    const s0 = E[q * 4 + 2], ns = E[q * 4 + 3];
    if (ns) {
      // the centre's side, flipped at each crossing of the line centre -> point (a vertex counts on one side only)
      const dx = x - cx, dz = z - cz;
      for (let s = s0; s < s0 + ns; s++) {
        const ax = S[s * 4], az = S[s * 4 + 1], bx = S[s * 4 + 2], bz = S[s * 4 + 3];
        const sa = dx * (az - cz) - dz * (ax - cx), sb = dx * (bz - cz) - dz * (bx - cx);
        if ((sa >= 0) !== (sb >= 0)) {
          // where the edge meets the line, along it from the centre (0) to the point (1)
          const u = sa / (sa - sb), px = ax + (bx - ax) * u - cx, pz = az + (bz - az) * u - cz;
          const t = (px * dx + pz * dz) / (dx * dx + dz * dz || 1);
          if (t >= 0 && t < 1) inside = !inside;
        }
        const e = segDist(x, z, ax, az, bx, bz);
        if (e < d) d = e;
      }
    }
    let w;
    if (d >= MARGIN) w = inside ? 1 : 0;
    else {
      if (rag !== rag) rag = (fbm(x * EDGE.scale + 17.3, z * EDGE.scale - 4.1, 3, 977) - 0.5) * 2 * EDGE.ragged;
      w = smoothstep(-EDGE.band, EDGE.band, (inside ? d : -d) + rag);
    }
    if (w <= 0.002) continue;
    out[n].rec = rec; out[n].w = w; n++;
  }
  return n;
}

// --- what an event leaves, by its age -----------------------------------------------------------------------------------
// [age (years), value] knots, linear between them, flat past the ends
const K = (...knots) => knots;
const LOOK = {
  // a wildfire: black and bare the first year; fireweed, bracken and aspen suckers in the next two; then a thicket of
  // jack pine and aspen with the grey snags standing over it and the berries thick (a burn of 3-12 years is where the
  // blueberries are); then young aspen, birch and jack pine closing over, the snags coming down into deadfall; then a
  // young mixed forest with a few old snags; by 70 years or so, ordinary forest again
  [KIND.wildfire]: {
    char: K([0, 1], [0.9, 1], [2.5, 0.42], [5, 0.08], [8, 0]),
    ground: K([0, 0.1], [0.8, 0.2], [1.6, 0.7], [3, 1], [12, 1], [25, 0.5], [40, 0]),
    open: K([0, 1], [24, 1], [32, 0]),
    mature: K([0, 0.05], [30, 0.05], [70, 0.45], [100, 1]),
    snags: K([0, 0.95], [3, 0.92], [10, 0.55], [18, 0.2], [30, 0.07], [55, 0.025], [90, 0]),
    black: K([0, 1], [1.5, 0.92], [4, 0.3], [8, 0.06], [15, 0]),
    scorch: K([0, 1], [15, 0.9], [40, 0]),
    logs: K([0, 0.03], [2, 0.05], [8, 0.18], [18, 0.25], [35, 0.15], [60, 0.05], [90, 0]),
    logsKeep: K([0, 0.15], [2, 0.4], [8, 1]),
    thicket: K([0, 0], [0.8, 0], [2, 1.5], [4, 4.2], [11, 4.2], [13, 1.5], [16, 0.3], [19, 0]),
    regrow: K([0, 0.4], [2, 0.8], [5, 2.0], [12, 3.3]),
    young: K([0, 0], [10, 0], [13, 0.9], [40, 0.9], [70, 0.5], [100, 0]),
    youngH: K([10, 4], [30, 10], [70, 16]),
    under: K([0, 0], [1, 0.08], [3, 0.25], [12, 0.45], [30, 0.85], [50, 1]),
    bracken: K([0, 0], [1, 0.45], [3, 0.8], [12, 0.55], [25, 0.15], [40, 0]),
    shrubs: K([0, 0], [1, 0.25], [3, 0.4], [12, 0.35], [25, 0.08], [35, 0]),
    grass: K([0, 0.02], [0.7, 0.08], [1.6, 0.6], [12, 0.5], [30, 0.2], [45, 0]),
    fireweed: K([0, 0], [0.5, 0.1], [1.2, 0.85], [3, 0.9], [6, 0.3], [12, 0]),
    berries: K([0, 0.12], [1, 0.6], [2.5, 2.2], [4, 4], [12, 4], [20, 1.6], [30, 1]),
    pines: K([0, 0]),
  },
  // a prescribed burn (an underburn): the ground scorched, the understory opened, the fir and spruce under the pines
  // killed, the char up the foot of the trunks, the mature pines alive; grass and blueberries come in after
  [KIND.prescribed]: {
    char: K([0, 0.6], [0.5, 0.5], [1.5, 0.12], [3, 0]),
    ground: K([0, 0], [1, 0.3], [5, 0.3], [12, 0]),
    open: K([0, 0]),
    mature: K([0, 0.9], [20, 0.95], [40, 1]),
    snags: K([0, 0.07], [12, 0.05], [35, 0]),
    black: K([0, 0.8], [3, 0.4], [10, 0]),
    scorch: K([0, 1], [6, 0.8], [22, 0]),
    logs: K([0, 0]),
    logsKeep: K([0, 0.25], [15, 1]),
    thicket: K([0, 0], [1, 0.3], [6, 0.5], [14, 0]),
    regrow: K([0, 0.4], [3, 1.1], [10, 2.6]),
    young: K([0, 0]),
    youngH: K([0, 4]),
    under: K([0, 0.04], [1, 0.25], [5, 0.4], [15, 0.85], [25, 1]),
    bracken: K([0, 0], [1, 0.25], [6, 0.35], [15, 0]),
    shrubs: K([0, 0], [1, 0.15], [6, 0.2], [15, 0]),
    grass: K([0, 0.05], [1, 0.35], [6, 0.3], [15, 0]),
    fireweed: K([0, 0], [1, 0.25], [4, 0.1], [8, 0]),
    berries: K([0, 0.3], [1, 1.8], [8, 1.8], [15, 1]),
    pines: K([0, 0.75], [20, 0.55], [50, 0]),
  },
  // the blowdown (4 July 1999, a derecho out of the west-northwest): the old trees down in one direction, their root
  // plates torn up, a few left standing or snapped; fir, birch and aspen come up through the tangle; the trunks grey,
  // moss over and sink into the ground over a few decades
  [KIND.blowdown]: {
    char: K([0, 0]),
    ground: K([0, 0]),
    open: K([0, 0]),
    mature: K([0, 0.22], [40, 0.32], [80, 1]),
    snags: K([0, 0.22], [10, 0.18], [30, 0.05], [60, 0]),
    black: K([0, 0]),
    scorch: K([0, 0]),
    logs: K([0, 0.95], [5, 0.95], [20, 0.62], [30, 0.42], [45, 0.15], [70, 0]),
    logsKeep: K([0, 1]),
    thicket: K([0, 0], [2, 0.5], [5, 2.6], [14, 2.6], [20, 0.8], [28, 0]),
    regrow: K([0, 0.4], [5, 1.4], [14, 3.1]),
    young: K([0, 0], [12, 0], [16, 0.75], [35, 0.75], [70, 0.4], [90, 0]),
    youngH: K([12, 4], [35, 11], [70, 16]),
    under: K([0, 0.5], [5, 0.9], [20, 1]),
    bracken: K([0, 0], [3, 0.35], [20, 0.25], [40, 0]),
    shrubs: K([0, 0], [3, 0.4], [20, 0.25], [40, 0]),
    grass: K([0, 0], [2, 0.25], [12, 0.15], [25, 0]),
    fireweed: K([0, 0], [1, 0.35], [4, 0.35], [8, 0]),
    berries: K([0, 0.8], [3, 2.2], [15, 2.2], [25, 1.2], [35, 1]),
    pines: K([0, 0]),
  },
};
// what no event leaves: the ordinary forest
const NONE = { char: 0, ground: 0, open: 0, mature: 1, snags: 0, black: 0, scorch: 0, logs: 0, logsKeep: 1, thicket: 0, regrow: 0, young: 0, youngH: 0, under: 1, bracken: 0, shrubs: 0, grass: 0, fireweed: 0, berries: 1, pines: 0 };
const FIELDS = Object.keys(NONE);
// the values that are a size, not an amount: the blend takes the stronger event's
const SIZES = { regrow: 'thicket', youngH: 'young' };
const knot = (knots, a) => {
  if (a <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) if (a <= knots[i][0]) { const [a0, v0] = knots[i - 1], [a1, v1] = knots[i]; return v0 + ((v1 - v0) * (a - a0)) / (a1 - a0); }
  return knots[knots.length - 1][1];
};
// the look of one event at an age, into o; `before`: the event under it (a fire through a young burn or a blowdown
// finds less standing to kill and less to burn: fewer snags, less down wood, and the regrowth cut back)
export function lookOf(kind, age, o = {}, before = null) {
  const L = LOOK[kind];
  if (!L) { Object.assign(o, NONE); return o; }
  for (const f of FIELDS) o[f] = knot(L[f], age);
  if (before && kind === KIND.wildfire && before.age - age < 40 && before.kind !== KIND.prescribed) {
    o.snags *= 0.45; o.logs *= 0.6; o.thicket *= 0.8;
  }
  return o;
}

const _a = {}, _b = {}, _h = [{ rec: null, w: 0 }, { rec: null, w: 0 }];
const ageOf = (rec) => date.year - rec.year + (date.doy - rec.doy) / YEAR_DAYS;
// The blended look at (x, z) (see the header), into `o` (a new object each call when none is given). `sd`: the shore
// distance there, when the caller has it (water is never burned).
export function burnLook(x, z, o = {}, sd = 1) {
  o.kind = 0; o.age = 0; o.w = 0; o.rec = null;
  const n = sd > 0 ? eventsAt(x, z, _h) : 0;
  if (!n) { Object.assign(o, NONE); return o; }
  const t = _h[0], p = n > 1 ? _h[1] : null;
  const ta = ageOf(t.rec), A = lookOf(t.rec.kind, ta, _a, p ? { kind: p.rec.kind, age: ageOf(p.rec) } : null);
  const wt = t.w, wp = p ? (1 - wt) * p.w : 0, wn = 1 - wt - wp;
  const B = p ? lookOf(p.rec.kind, ageOf(p.rec), _b) : null;
  for (const f of FIELDS) o[f] = A[f] * wt + (B ? B[f] * wp : 0) + NONE[f] * wn;
  for (const [f, by] of Object.entries(SIZES)) o[f] = B && B[by] * wp > A[by] * wt ? B[f] : A[f];
  const top = !p || wt >= wp ? t : p;
  o.kind = top.rec.kind; o.age = ageOf(top.rec); o.w = top === t ? wt : wp; o.rec = top.rec;
  o.before = p ? p.rec : null;
  return o;
}
// the open burn's share at a point, 0..1 (the ground class 'burn' at 0.5: terrain-build.js classify)
const _o = {};
export function burnOpenAt(x, z, sd = 1) { return burnLook(x, z, _o, sd).open; }

// the event's name as a line says it: "The Pagami Creek burn, 2011.", "The blowdown of July 1999.", "A prescribed burn,
// 2006." (null for an unnamed wildfire)
export function burnLine(rec) {
  if (!rec) return null;
  if (rec.kind === KIND.blowdown) return 'The blowdown of July 1999.';
  if (rec.kind === KIND.prescribed) return rec.name ? `The ${rec.name} prescribed burn, ${rec.year}.` : `A prescribed burn, ${rec.year}.`;
  if (!rec.name) return null;
  const n = rec.name.replace(/\s+fire$/i, '');
  return `The ${n} ${rec.year === date.year ? 'fire' : 'burn'}, ${rec.year}.`;
}
export const kindName = (k) => KIND_NAME[k] || 'none';
// for the console and the tests: the table at a glance
export function burnStats() {
  const by = {};
  for (const r of BURNS.records) { const k = KIND_NAME[r.kind]; const b = by[k] || (by[k] = { n: 0, acres: 0 }); b.n++; b.acres += r.acres; }
  return { ready: BURNS.ready, records: BURNS.records.length, bytes: BURNS.bytes, ms: Math.round(BURNS.ms), by, date: burnDate(), cells: IX ? IX.nx * IX.nz : 0, segs: IX ? IX.segs.length / 4 : 0 };
}
