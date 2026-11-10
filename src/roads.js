// The roads in 3D (stream E3, docs/build/edge-and-roads.md; the owner 2026-11-08: "still put the roads in"; round 5, the
// owner 2026-11-10: "Roads aren't everywhere ... Just put roads where you see roads"). Every drivable way OpenStreetMap
// has in the box (scripts/roads.mjs, for one release): highways, county and forest roads, gravel, two-tracks, driveways.
//   src/roads.bin   every road, a piece per fine tile (each road's points within 80 m of the tile), fetched by an HTTP
//                   range request as its tile is built (tileRoads, in the tile worker: its ground graded and its forest
//                   kept off; the decoded piece comes back with the tile and is installed here: installTileRoads)
//   src/roads.json  read once at load (world.js setRoads) into world.roads:
//     routes  Map key → { key, ep, at ('store' | 'lot' | 'landing'), snap, p: Float32Array [x, z], stand, drive, edge }: the
//             truck's way out from the road's end at the start (key: the entry point, 'h<ep>' an outfitter's own
//             portage-first lot); round 4: stand (a store's route begins where the truck stands behind it), drive (the
//             truck can drive it), edge (it runs out at the map's edge, toward the real road off the map)
//     bridges [{ ax, az, ah, bx, bz, bh, hw, k }]: every road's run over water from bank to bank (props.js roadBridges,
//             deckAt)
//     list    the stretches the routes run on, with their heights (scripts/edge.mjs, scripts/cabins.mjs and the rigs;
//             not drawn: the tiles' pieces are)
//     tiles   Map tile index → { chains } for the installed tiles; a chain: { id, s0, total, k (KIND), hw (half width m),
//             line (a centre line), svc (a driveway or an aisle), fadeA, fadeB (m at the road's ends), n, p:
//             Float32Array [x, z, h, w] per point (w < 0 over water: no grade there), bbox }
// What reads it: props.js (the ribbon in each tile's trail decal, bridges), road-grade.js (the ground), the tile worker
// (the ground and the forest's clearing), truck.js (the truck), cabins.js (nearestRoad), thicket.js and mire-relief.js
// (road-grade.js roadClearGap). `?roads=off` leaves them all out.
import { SEG, ROAD_SHOULDER, addTileGrade, dropTileGrade } from './road-grade.js';

export const KIND = { gravel: 1, blacktop: 2, track: 3 };
// the corridor kept off the road's centreline (a forest road's cut), past its half width: trees, brush and rocks kept
// off, the grass let through (a lawn: props.js exclusionsFor)
export const ROAD_CLEAR = 3.2;
// a gravel or blacktop road is bare (no grass on it: a positive radius, and at least ROAD_BARE so placement.js plants no
// trail's green tunnel beside it); a two-track a lawn (its crown grows grass); a driveway a narrower bare cut
export const ROAD_BARE = 6.5;
const clearOf = (c) => (c.k === KIND.track ? -(c.hw + ROAD_CLEAR) : c.svc ? c.hw + 2.4 : Math.max(ROAD_BARE, c.hw + 2.4));

export function roadsOff() { return typeof location !== 'undefined' && /[?&]roads=off\b/.test(location.search); }

// the table (src/roads.json) → world.roads, or null when it is for another release (or `?roads=off`)
export function readRoads(table, baked) {
  if (!table || !table.routes || roadsOff()) return null;
  if (table.for && baked && table.for !== baked) return null;
  const list = (table.roads || []).map((r) => {
    const a = r.p, n = Math.floor(a.length / 4), p = new Float32Array(n * 4);
    let x = 0, z = 0, h = 0;
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      x += a[i * 4]; z += a[i * 4 + 1]; h += a[i * 4 + 2];
      const X = x / 10, Z = z / 10;
      p[i * 4] = X; p[i * 4 + 1] = Z; p[i * 4 + 2] = h / 100; p[i * 4 + 3] = a[i * 4 + 3] / 10;
      if (X < box[0]) box[0] = X; if (Z < box[1]) box[1] = Z; if (X > box[2]) box[2] = X; if (Z > box[3]) box[3] = Z;
    }
    return { k: r.k, hw: r.hw, line: !!r.line, name: r.name || '', n, p, bbox: box };
  });
  const routes = new Map();
  for (const r of table.routes || []) {
    const a = r.p, n = Math.floor(a.length / 2), p = new Float32Array(n * 2);
    let x = 0, z = 0;
    for (let i = 0; i < n; i++) { x += a[i * 2]; z += a[i * 2 + 1]; p[i * 2] = x / 10; p[i * 2 + 1] = z / 10; }
    routes.set(String(r.key), { key: String(r.key), ep: r.ep, at: r.at, snap: r.snap, p, stand: !!r.stand, drive: r.drive == null ? null : !!r.drive, edge: !!r.edge });
  }
  const bridges = (table.bridges || []).map((b) => ({ ax: b.ax, az: b.az, ah: b.ah, bx: b.bx, bz: b.bz, bh: b.bh, hw: b.hw, k: b.k || 1, name: b.name || '' }));
  // (deckAt's bins: 64 m cells)
  const bb = new Map();
  bridges.forEach((b, i) => {
    const r = b.hw + 3;
    for (let z = Math.floor((Math.min(b.az, b.bz) - r) / 64); z <= Math.floor((Math.max(b.az, b.bz) + r) / 64); z++)
      for (let x = Math.floor((Math.min(b.ax, b.bx) - r) / 64); x <= Math.floor((Math.max(b.ax, b.bx) + r) / 64); x++) { const k = x * 65536 + z; const l = bb.get(k); if (l) l.push(i); else bb.set(k, [i]); }
  });
  const km = list.reduce((t, r) => { for (let i = 1; i < r.n; i++) t += Math.hypot(r.p[i * 4] - r.p[i * 4 - 4], r.p[i * 4 + 1] - r.p[i * 4 - 3]); return t; }, 0) / 1000;
  return { list, routes, bridges, bridgeBins: bb, km, bin: table.bin || null, tiles: new Map() };
}

// ---- the pieces (src/roads.bin): the index, then a piece per tile, by range ---------------------------------------------
const BIN_URL = new URL('./roads.bin', import.meta.url);
const MAGIC = 0x31534452; // 'RDS1'
let index = null;
const pieces = new Map();
async function range(a, b) {
  const res = await fetch(BIN_URL, { headers: { Range: `bytes=${a}-${b - 1}` } });
  if (!res.ok) throw new Error(`${res.status} fetching ${BIN_URL}`);
  const buf = await res.arrayBuffer();
  return res.status === 206 ? { buf, whole: null } : { buf: buf.slice(a, b), whole: buf };
}
async function loadIndex() {
  let { buf, whole } = await range(0, 16384);
  let dv = new DataView(buf);
  if (dv.byteLength < 20 || dv.getUint32(0, true) !== MAGIC || dv.getUint16(4, true) !== 1) return { at: new Map(), whole: null, stamp: null };
  const n = dv.getUint32(8, true), sl = dv.getUint16(16, true), headLen = (18 + sl + 3) & ~3, end = headLen + n * 12;
  const stamp = new TextDecoder().decode(new Uint8Array(buf, 18, sl));
  if (end > buf.byteLength) { ({ buf, whole } = whole ? { buf: whole.slice(0, end), whole } : await range(0, end)); dv = new DataView(buf); }
  const at = new Map();
  for (let i = 0; i < n; i++) { const o = headLen + i * 12; at.set(`${dv.getUint16(o, true)},${dv.getUint16(o + 2, true)}`, [dv.getUint32(o + 4, true), dv.getUint32(o + 8, true)]); }
  return { at, whole, stamp };
}
export function decodePiece(buf) {
  const b = new Uint8Array(buf);
  let o = 0;
  const vi = () => { let v = 0, m = 1, c; do { c = b[o++]; v += (c & 127) * m; m *= 128; } while (c & 128); return v; };
  const zz = () => { const v = vi(); return v % 2 ? -(v + 1) / 2 : v / 2; };
  const chains = [], nRuns = vi();
  for (let r = 0; r < nRuns; r++) {
    const id = vi(), s0 = vi() / 10, total = vi() / 10, k = b[o++], hw = b[o++] / 10, fl = b[o++], fadeA = b[o++], fadeB = b[o++], n = vi();
    const p = new Float32Array(n * 4), box = [Infinity, Infinity, -Infinity, -Infinity];
    let x = 0, z = 0, h = 0;
    for (let i = 0; i < n; i++) {
      x += zz(); z += zz(); h += zz();
      const w = b[o++], X = x / 10, Z = z / 10;
      p[i * 4] = X; p[i * 4 + 1] = Z; p[i * 4 + 2] = h / 100; p[i * 4 + 3] = (w & 128 ? -1 : 1) * (w & 127) / 10;
      if (X < box[0]) box[0] = X; if (Z < box[1]) box[1] = Z; if (X > box[2]) box[2] = X; if (Z > box[3]) box[3] = Z;
    }
    const na = vi(), ab = na ? new Uint8Array(n) : null; // (the abutments: by a bridge's end)
    for (let q = 0, at = 0; q < na; q++) { at += vi(); ab[at] = 1; }
    chains.push({ id, s0, total, k, hw, line: !!(fl & 1), svc: !!(fl & 2), fadeA, fadeB, n, p, ab, bbox: box });
  }
  return chains;
}
// a tile's roads: { chains, segs (road-grade.js's table), ex (the forest's clearing, placement.js's [x1, z1, x2, z2, r]
// segments), exGrass (the grass's: clearingOf) }, or null (none there, another release, `?roads=off`). baked: the release's stamp.
export async function tileRoads(tx, ty, baked = null) {
  if (roadsOff()) return null;
  if (!index) index = loadIndex().catch((e) => { console.warn('roads: the tiles\' roads did not load', e); return { at: new Map(), whole: null, stamp: null }; });
  const I = await index;
  if (baked && I.stamp && I.stamp !== baked) return null;
  const key = `${tx},${ty}`, at = I.at.get(key);
  if (!at) return null;
  if (!pieces.has(key)) {
    pieces.set(key, (async () => {
      const gz = I.whole ? I.whole.slice(at[0], at[0] + at[1]) : (await range(at[0], at[0] + at[1])).buf;
      const raw = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      const chains = decodePiece(raw);
      return { chains, segs: gradeOf(chains), ex: clearingOf(chains), exGrass: clearingOf(chains, true) };
    })().catch((e) => { console.warn(`roads: tile ${key}`, e); return null; }));
    while (pieces.size > 12) pieces.delete(pieces.keys().next().value); // (a worker's few: the tiles and the chunks it builds)
  }
  return pieces.get(key);
}
// the ground table (road-grade.js): every land segment of the chains
export function gradeOf(chains) {
  let n = 0;
  for (const c of chains) n += c.n - 1;
  const out = new Float32Array(n * SEG);
  let o = 0;
  for (const c of chains) {
    const p = c.p, core = c.hw + ROAD_SHOULDER, ex = clearOf(c);
    for (let i = 1; i < c.n; i++) {
      const a = (i - 1) * 4, b = i * 4;
      if (p[a + 3] < 0 || p[b + 3] < 0) continue; // (over water: the bed stays the bed)
      out[o++] = p[a]; out[o++] = p[a + 1]; out[o++] = p[a + 2]; out[o++] = p[a + 3];
      out[o++] = p[b]; out[o++] = p[b + 1]; out[o++] = p[b + 2]; out[o++] = p[b + 3]; out[o++] = core; out[o++] = ex;
      out[o++] = c.ab && (c.ab[i - 1] || c.ab[i]) ? 1 : 0; // (an abutment: graded to the water's edge)
    }
  }
  return out.subarray(0, o);
}
// the corridor (placement.js's exclusions): [x1, z1, x2, z2, radius] along each road, a segment every two points.
// grass: the grass's own (placement.js coverField; round 5): the tufts are drawn from the 10 m cells' cover read with a
// bilinear filter, so a gravel or blacktop road is kept bare out to every cell whose cover reaches its surface (its half
// width and a cell's half diagonal); a two-track stays a lawn
export const GRASS_OFF = 7.5;
export function clearingOf(chains, grass = false) {
  const out = [];
  for (const c of chains) {
    const p = c.p, rad = grass && c.k !== KIND.track ? c.hw + GRASS_OFF : clearOf(c);
    for (let i = 0; i + 1 < c.n; i += 2) {
      const j = Math.min(c.n - 1, i + 2);
      if (p[i * 4] === p[j * 4] && p[i * 4 + 1] === p[j * 4 + 1]) continue; // (never a point: site.js reads those as campsites)
      out.push(p[i * 4], p[i * 4 + 1], p[j * 4], p[j * 4 + 1], rad);
    }
  }
  return new Float32Array(out);
}
// a tile's roads in (tiles.js, as it installs the tile: its chains for the props, its grade for the main thread's
// ground) and out (evicted)
export function installTileRoads(world, tx, ty, r) {
  const R = world && world.roads;
  if (!R) return;
  R.tiles.set(ty * world.ntx + tx, { chains: r ? r.chains : [] });
  addTileGrade(tx, ty, r ? r.segs : null); // (a tile with none: none, never a neighbour's)
}
export function dropTileRoads(world, tx, ty) {
  const R = world && world.roads;
  if (!R) return;
  R.tiles.delete(ty * world.ntx + tx);
  dropTileGrade(tx, ty);
}
// the installed tiles' chains (each once per tile: a road near a seam is in both tiles' pieces)
export function tileChains(world, tx, ty) { const R = world && world.roads, T = R && R.tiles.get(ty * world.ntx + tx); return T ? T.chains : []; }
// the chains round (x, z) (the tile it is in: its piece holds every road within 80 m of it)
export function chainsNear(world, x, z) { const t = world && world.tileOf ? world.tileOf(x, z) : null; return t ? tileChains(world, t[0], t[1]) : []; }

// (round 4's whole-table forms: the grade and the clearing now come with each tile's piece)
export function makeRoadGrade() { return new Float32Array(0); }
export function roadExclusions() { return []; }

// the top of a bridge's deck at (x, z), or -Infinity off every bridge (truck.js: it drives over, not through the creek)
export const DECK = 0.06; // the deck's top over the road's own height at the banks
export function deckAt(world, x, z) {
  const R = world && world.roads;
  if (!R || !R.bridges.length) return -Infinity;
  const l = R.bridgeBins.get(Math.floor(x / 64) * 65536 + Math.floor(z / 64));
  if (!l) return -Infinity;
  for (const i of l) {
    const b = R.bridges[i], ex = b.bx - b.ax, ez = b.bz - b.az, L2 = ex * ex + ez * ez;
    const t = L2 > 1e-9 ? ((x - b.ax) * ex + (z - b.az) * ez) / L2 : 0, L = Math.sqrt(L2);
    if (t < -2 / L || t > 1 + 2 / L) continue;
    const tc = Math.max(0, Math.min(1, t));
    if (Math.hypot(x - b.ax - ex * tc, z - b.az - ez * tc) > b.hw + 0.3) continue;
    return b.ah + (b.bh - b.ah) * tc + DECK;
  }
  return -Infinity;
}

// the road nearest (x, z) within max metres: { road, i (the point), d } or null
// (round 5: the roads of the tile (x, z) is in, installed; a tile not in yet: the routes' stretches)
export function nearestRoad(world, x, z, max = 30) {
  const R = world && world.roads;
  if (!R) return null;
  let best = null, bd = max;
  const t = world.tileOf ? world.tileOf(x, z) : null, T = t && R.tiles.get(t[1] * world.ntx + t[0]);
  for (const r of T ? T.chains : R.list) {
    const b = r.bbox;
    if (x < b[0] - max || x > b[2] + max || z < b[1] - max || z > b[3] + max) continue;
    for (let i = 0; i < r.n; i++) { const d = Math.hypot(r.p[i * 4] - x, r.p[i * 4 + 1] - z); if (d < bd) { bd = d; best = { road: r, i, d }; } }
  }
  return best;
}

// the truck's way out from a start (an entry point's number, or 'h<ep>'): [[x, z], ...] from the start's end of the
// road, or null
export function routeOf(world, key) {
  const R = world && world.roads, r = R && R.routes.get(String(key));
  if (!r) return null;
  const out = [];
  for (let i = 0; i < r.p.length; i += 2) out.push([r.p[i], r.p[i + 1]]);
  return { ...r, pts: out };
}
