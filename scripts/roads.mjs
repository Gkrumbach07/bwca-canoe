#!/usr/bin/env node
// The roads in 3D (stream E3, docs/build/edge-and-roads.md; the owner 2026-11-08: "still put the roads in"): the last
// stretch of the real road into each entry point's lot and each outfitter's yard, from OpenStreetMap, written as a small
// table, src/roads.json, that the game draws as gravel and blacktop ribbons in the tiles' own trail decal (props.js),
// grades into the ground (road-grade.js), keeps the forest off (props.js exclusionsFor) and drives the truck on
// (truck.js).
//
//   node scripts/roads.mjs [--osm DIR] [--data public/data] [--fixes src/ep-fixes.json] [--out src/roads.json]
//                          [--len 1500] [--join 3500] [--no-heights] [--report out.json]
//
// --osm: a folder with the drivable ways as GeoJSON sequences (*-roads.geojsonseq), made from the cached Geofabrik
// extracts (data-cache/osm-2026-11-01/osm/*.cut.osm.pbf) with osmium:
//   osmium tags-filter <pbf> w/highway=motorway,trunk,primary,secondary,tertiary,unclassified,residential,service,track,\
//     motorway_link,trunk_link,primary_link,secondary_link,tertiary_link -o roads.pbf
//   osmium export roads.pbf -f geojsonseq --geometry-types=linestring -o <name>-roads.geojsonseq
// (default data-cache/roads; when that has none and osmium is on the PATH, the script makes them there.)
//
// The routes (light, any machine): for each start (a trailhead's lot or its landing, an outfitter's dock, an outfitter's
// own portage-first lot) the nearest drivable way, and from there the way out toward town: the cheapest path on the OSM
// graph (tracks and service roads dearer than the county roads) to a county road or better at least TARGET_MIN out,
// scored by its cost plus how far that point still is from the nearest town, cut at --len metres (the owner call: 1.5 km
// from the lot). Starts within --join metres of each other are joined by the road between them when that is short
// (the owner call: "lots joined by the road corridor"). No road for a boat-in start (EP 1 Trout Lake stays a boat-in lodge,
// EP 4's outfitter boat) nor for an entry point that puts in at another's landing (ep.shares).
//
// Round 4 (the adversarial check of loop-r4: the truck drove through water and trunks on the made two-tracks): a start
// off its road (an outfitter's stand behind its store, a lot back in the trees or by the map's edge, a landing below the
// road's end) gets a made two-track found on the release's ground (a search over a GRID m lattice: water and the
// waterline all but shut, steep ground dear, a store's own footprint shut), to the nearest drivable way within REACH m
// (tracks dearer than roads), or, for a lot by the map's edge whose real road lies off the map, out to the edge toward
// it (the truck comes in from there). An outfitter's start is its stand behind the store as the truck parks there
// (src/outfitter-places.json: the store, its door toward the water), and its route begins there (`stand`). Every
// route says whether the truck can drive it (`drive`). The heights near the water are the ground's own as the game
// grades it (detail-build.js: no road grade within 4 m of the shore; never under the lake's level by the shore).
//
// The heights (on a host with the release: never on the Mac, it starts Vite's module loader): each road resampled every
// STEP m, the ground the game draws there (the 2 m LiDAR, else the 10 m mesh) read along it, smoothed to a forest road's
// grade (a Gaussian SMOOTH m along), bridged level over water (a culvert's crossing), and a shoulder as wide as the cut
// or fill wants. Without --data (or with --no-heights) the table is written flat (h 0) and the game grades nothing.
//
// The table: { for (the release's baked stamp), about, roads: [{ k (1 gravel, 2 blacktop, 3 two-track), hw (half width
// m), line (a centre line), name, p (flat ints, deltas after the first: x dm, z dm, h cm, w dm; w < 0 over water) }],
// routes: [{ key ('25', 'h6'), ep, at ('store' | 'lot' | 'landing'), snap (m from the start to the road), p (flat dm
// deltas: x, z: the truck's way out, from the road's end at the start) }] }.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const osmDir = path.resolve(arg('--osm', path.join(root, 'data-cache/roads')));
const dataDir = path.resolve(arg('--data', path.join(root, 'public/data'))) + '/';
const fixesFile = path.resolve(arg('--fixes', path.join(root, 'src/ep-fixes.json')));
const placesFile = path.resolve(arg('--places', path.join(root, 'src/outfitter-places.json')));
const outFile = path.resolve(arg('--out', path.join(root, 'src/roads.json')));
const reportFile = arg('--report', null);
const LEN = Number(arg('--len', 1500));         // metres of road out from each start
const JOIN = Number(arg('--join', 3500));       // starts this close (straight line) are joined by their road, when short
const SNAP_MAX = 1200;                          // no road within this of a start: none drawn (reported)
const REACH = 1500;                             // a made two-track's search: this far round its start
const GRID = 4;                                 // the search's lattice (m)
const EDGE_IN = 30;                             // a two-track out to the map's edge ends this far in
const STAND_BACK = 12.5;                        // the truck's stand behind a store (truck.js: the yard's back, 4.5 m past it)
const DENSE = 20;                               // the graph's ways cut to pieces no longer than this (m)
const TARGET_MIN = 2500;                        // the way out heads for a county road at least this far from the start
// (round 5: the game keeps its ground at the water's level within 30 m of the shore, detail-build.js chunkGround, on
// every 2 m vertex; a road a little past 30 m but under a lake's level had its vertices within 30 m stood up to the
// level through it, EP 50's two-track 0.74 m. The road is kept at the level out to LV_REACH m, a vertex's reach past 30.)
const LV_REACH = 37;
const STEP = 6, SMOOTH = 14;                    // the heights: a sample every STEP m, smoothed over a Gaussian of SMOOTH m
const SHOULDER = (cut) => Math.min(10, 2.5 + 2.2 * Math.abs(cut));
const OUTFITTERS = [51, 64, 49, 69, 40, 38, 36, 67, 25, 31, 6, 16, 1, 12]; // (src/outfitters.js OUTFITTERS)
const NO_ROAD = new Set([1]);                   // the owner 2026-11-08: Trout Lake stays a boat-in lodge
// the towns the roads lead to (lat, lon): the way out from a start heads toward the nearest
const TOWNS = [['Ely', 47.9032, -91.8671], ['Tower', 47.8055, -92.2746], ['Crane Lake', 48.2669, -92.4896], ['Isabella', 47.6169, -91.3557],
  ['Grand Marais', 47.7505, -90.3343], ['Hovland', 47.8399, -89.9701], ['Finland', 47.4144, -91.2488], ['Babbitt', 47.7085, -91.9446], ['Orr', 48.0544, -92.8313]];

// ---- the release: its projection, entry points (with ep-fixes.json's starts) ----------------------------------------
const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const P = index.proj;
const toXZ = (lon, lat) => [(lon - P.lon0) * P.mPerDegLon, -(lat - P.lat0) * P.mPerDegLat];
const fixes = fs.existsSync(fixesFile) ? JSON.parse(fs.readFileSync(fixesFile, 'utf8')) : null;
const fixOf = new Map(((fixes && fixes.entryPoints) || []).map((f) => [f.ep, f]));
const eps = index.entryPoints.map((e) => ({ ...e, ...(fixOf.get(e.ep) || {}) }));
const places = fs.existsSync(placesFile) ? JSON.parse(fs.readFileSync(placesFile, 'utf8')) : null;
const placeOf = (n) => (places && places.for === (index.source && index.source.baked) ? places.places[String(n)] : null);
const lotOf = (key) => (places && places.lots && places.for === (index.source && index.source.baked) ? places.lots[String(key)] || null : null);
const starts = [];
for (const e of eps) {
  if (NO_ROAD.has(e.ep) || e.shares) continue;
  if (OUTFITTERS.includes(e.ep)) {
    const pl = placeOf(e.ep);
    if (pl) { // the stand behind the store, away from its door (the water)
      const bx = pl.door[0] - pl.store[0], bz = pl.door[1] - pl.store[1], bl = Math.hypot(bx, bz) || 1;
      starts.push({ key: String(e.ep), ep: e.ep, name: e.name, at: 'store', stand: true, x: pl.store[0] - (bx / bl) * STAND_BACK, z: pl.store[1] - (bz / bl) * STAND_BACK, store: pl.store, dock: pl.dock });
    } else starts.push({ key: String(e.ep), ep: e.ep, name: e.name, at: 'store', x: e.x, z: e.z });
    if (e.head && e.head.lot) { const T = lotOf(`h${e.ep}`); starts.push({ key: `h${e.ep}`, ep: e.ep, name: e.name, at: 'lot', x: T ? T.lot[0] : e.head.lot.x, z: T ? T.lot[1] : e.head.lot.z, keep: T }); }
  } else {
    if (e.drop === 'boat') continue;
    const L = e.lot || null, T = lotOf(e.ep); // (round 4: the lot as the game plans it, a landing's too)
    if (T) starts.push({ key: String(e.ep), ep: e.ep, name: e.name, at: 'lot', x: T.lot[0], z: T.lot[1], keep: T });
    else starts.push({ key: String(e.ep), ep: e.ep, name: e.name, at: L ? 'lot' : 'landing', x: L ? L.x : e.x, z: L ? L.z : e.z });
  }
}
const towns = TOWNS.map(([n, lat, lon]) => { const [x, z] = toXZ(lon, lat); return { n, x, z }; });
const townDist = (x, z) => Math.min(...towns.map((t) => Math.hypot(t.x - x, t.z - z)));

// ---- the OSM ways ------------------------------------------------------------------------------------------------
function ensureOsm() {
  const have = fs.existsSync(osmDir) ? fs.readdirSync(osmDir).filter((f) => f.endsWith('-roads.geojsonseq')) : [];
  if (have.length) return have.map((f) => path.join(osmDir, f));
  const src = path.join(root, 'data-cache/osm-2026-11-01/osm');
  const pbfs = fs.existsSync(src) ? fs.readdirSync(src).filter((f) => f.endsWith('.cut.osm.pbf')) : [];
  if (!pbfs.length) throw new Error(`roads: no *-roads.geojsonseq in ${osmDir} and no extracts in ${src}`);
  fs.mkdirSync(osmDir, { recursive: true });
  const hw = 'w/highway=motorway,trunk,primary,secondary,tertiary,unclassified,residential,service,track,motorway_link,trunk_link,primary_link,secondary_link,tertiary_link';
  return pbfs.map((f) => {
    const name = f.split('-latest')[0], tmp = path.join(osmDir, `${name}-roads.pbf`), out = path.join(osmDir, `${name}-roads.geojsonseq`);
    execFileSync('osmium', ['tags-filter', path.join(src, f), hw, '-o', tmp, '--overwrite']);
    execFileSync('osmium', ['export', tmp, '-f', 'geojsonseq', '--geometry-types=linestring', '-o', out, '--overwrite']);
    return out;
  });
}
const RANK = { motorway: 1, trunk: 1, primary: 1, secondary: 2, tertiary: 3, unclassified: 4, residential: 5, service: 6, track: 7 };
const COST = [0, 1, 1, 1, 1.15, 1.3, 1.6, 2.5];
const PAVED = new Set(['asphalt', 'paved', 'concrete', 'chipseal', 'concrete:plates', 'paving_stones']);
const DIRT = new Set(['ground', 'dirt', 'grass', 'sand', 'earth', 'mud', 'grass_paver']);
function kindOf(t, rank) {
  const s = t.surface || '';
  if (PAVED.has(s) || (!s && rank <= 2)) return 2;
  if (t.highway === 'track') return (s === 'gravel' || s === 'compacted' || t.tracktype === 'grade1') ? 1 : 3;
  if (DIRT.has(s)) return 3;
  return 1;
}
const halfWidth = (k, rank, svc) => (svc ? 1.7 : k === 3 ? 1.5 : k === 2 ? (rank <= 3 ? 3.4 : 2.8) : rank <= 4 ? 2.8 : 2.3);
// round 5 (the owner 2026-11-10: "Roads aren't everywhere ... Just put roads where you see roads"): every drivable way in
// the box is drawn, not only the last stretch into each lot. A service way that is a driveway, a lot's aisle or an
// alley is drawn narrow (svc); the box's own edge: a way is drawn to EDGE_CUT m short of it (no ground past the box)
const SVC = new Set(['driveway', 'parking_aisle', 'alley', 'drive-through', 'emergency_access']);
const BOX = { x0: index.grid.originX, z0: index.grid.originZ, x1: index.grid.originX + index.grid.width * index.grid.cell, z1: index.grid.originZ + index.grid.height * index.grid.cell };
const edgeDist = (x, z) => Math.min(x - BOX.x0, BOX.x1 - x, z - BOX.z0, BOX.z1 - z);
const EDGE_CUT = 25;

const nodes = []; // { x, z, adj: [edge ids] }
const nodeKey = new Map();
const edges = []; // { a, b, len, cost, k, hw, rank, name, line }
const BIN = 200, bins = new Map(); // (a bin of the nodes for the nearest-node search)
const node = (x, z) => {
  const key = `${Math.round(x * 100)},${Math.round(z * 100)}`;
  let i = nodeKey.get(key);
  if (i === undefined) {
    i = nodes.length; nodes.push({ x, z, adj: [], rank: 9 }); nodeKey.set(key, i);
    const k = `${Math.floor(x / BIN)},${Math.floor(z / BIN)}`; let l = bins.get(k); if (!l) bins.set(k, (l = [])); l.push(i);
  }
  return i;
};
let ways = 0;
for (const file of ensureOsm()) {
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const s = line.replace(/^\x1e/, '').trim();
    if (!s) continue;
    const f = JSON.parse(s), t = f.properties || {}, c = f.geometry && f.geometry.coordinates;
    const base = String(t.highway || '').replace(/_link$/, ''), rank = RANK[base];
    if (!rank || !c || c.length < 2) continue;
    if (t.area === 'yes') continue;
    if (t.ice_road === 'yes' || t.winter_road === 'yes' || t.seasonal === 'winter') continue; // (round 5: the lakes' ice roads, Vermilion's, are winter's)
    // (round 5: a gated way, access=no, is drawn all the same, it is there; the truck's way out keeps off it)
    const xz = c.map(([lon, lat]) => toXZ(lon, lat));
    ways++;
    const svc = base === 'service' && SVC.has(t.service || '');
    const k = kindOf(t, rank), hw = halfWidth(k, rank, svc), priv = t.access === 'no' ? 6 : t.access === 'private' ? 2 : 1;
    const name = t.name || t.ref || '';
    let prev = node(...xz[0]);
    for (let i = 1; i < xz.length; i++) {
      const [x1, z1] = xz[i], p = nodes[prev], L = Math.hypot(x1 - p.x, z1 - p.z), n = Math.max(1, Math.ceil(L / DENSE));
      for (let q = 1; q <= n; q++) {
        const cur = q === n ? node(x1, z1) : node(p.x + ((x1 - p.x) * q) / n, p.z + ((z1 - p.z) * q) / n);
        if (cur === prev) continue;
        const a = nodes[prev], b = nodes[cur], len = Math.hypot(b.x - a.x, b.z - a.z), id = edges.length;
        const out = edgeDist(a.x, a.z) < EDGE_CUT || edgeDist(b.x, b.z) < EDGE_CUT; // (past the box's edge: in the graph, never drawn)
        edges.push({ a: prev, b: cur, len, cost: len * COST[rank] * priv, k, hw, rank, name, line: k === 2 && rank <= 3, svc, out });
        a.adj.push(id); b.adj.push(id); a.rank = Math.min(a.rank, rank); b.rank = Math.min(b.rank, rank);
        prev = cur;
      }
    }
  }
}
console.log(`roads: ${ways} ways, ${nodes.length} nodes, ${edges.length} edges, ${starts.length} starts`);
// (round 4: a store standing on an OSM way, Thimbleberry's (6) on North Arm Road: the way's pieces through its footprint and
// dock are let go, so no road runs through a store and the truck reaches it by its stand; the road ends at the yard)
{
  let cut = 0;
  const shut = OUTFITTERS.map((n) => placeOf(n)).filter(Boolean).flatMap((pl) => [[pl.store[0], pl.store[1], 10], [pl.dockLand[0], pl.dockLand[1], 5]]);
  const segD = (e, x, z) => { const a = nodes[e.a], b = nodes[e.b], ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez, t = L2 ? Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / L2)) : 0; return Math.hypot(x - a.x - ex * t, z - a.z - ez * t); };
  edges.forEach((e, id) => {
    if (!shut.some(([x, z, r]) => Math.abs(nodes[e.a].x - x) < 60 && Math.abs(nodes[e.a].z - z) < 60 && segD(e, x, z) < r)) return;
    for (const k of [e.a, e.b]) nodes[k].adj = nodes[k].adj.filter((q) => q !== id);
    e.shut = true; cut++;
  });
  console.log(`roads: ${cut} pieces of way let go under the stores`);
}

function nearest(x, z, max, real = false) { // (real: the OSM's own nodes only, no made two-track's)
  let best = -1, bd = max;
  const r = Math.ceil(max / BIN), bx = Math.floor(x / BIN), bz = Math.floor(z / BIN);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    for (const i of bins.get(`${bx + dx},${bz + dz}`) || []) { if (real && (nodes[i].made || !nodes[i].adj.length)) continue; const d = Math.hypot(nodes[i].x - x, nodes[i].z - z); if (d < bd) { bd = d; best = i; } }
  }
  return best < 0 ? null : { i: best, d: bd };
}

// Dijkstra with a binary heap from node s; stop(i, cost) true ends it; returns { dist, via (edge into each) }
function dijkstra(s, maxCost, onSettle) {
  const dist = new Map([[s, 0]]), via = new Map(), done = new Set();
  const heap = [[0, s]];
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [c, i] = pop();
    if (done.has(i)) continue;
    done.add(i);
    if (c > maxCost) break;
    if (onSettle && onSettle(i, c)) break;
    for (const id of nodes[i].adj) {
      const e = edges[id], j = e.a === i ? e.b : e.a, nc = c + e.cost;
      if (nc < (dist.get(j) ?? Infinity)) { dist.set(j, nc); via.set(j, id); push([nc, j]); }
    }
  }
  return { dist, via, done };
}
const pathTo = (via, s, t) => { const out = []; let i = t; while (i !== s) { const id = via.get(i); if (id === undefined) return null; out.push(id); const e = edges[id]; i = e.a === i ? e.b : e.a; } return out.reverse(); };

// the release's ground (a host; function loadGround below)
let ground = null;
if (!has('--no-heights') && fs.existsSync(dataDir + 'tiles')) ground = await loadGround();

// ---- a made two-track (round 4): the cheapest way over the ground from a start to a drivable way, or out to the map's
// edge toward its real road; { pts, to (the OSM node it meets, or null at the edge), wet (m of water crossed), m } or null
function madeTrack(S, avoid) {
  const R = REACH, n = Math.ceil((2 * R) / GRID) + 1, ox = S.x - R, oz = S.z - R, N = n * n;
  const cx = (i) => ox + i * GRID, cz = (j) => oz + j * GRID;
  const target = new Map(); // cell -> { i (node), extra }
  const rb = Math.ceil(R / BIN), bx0 = Math.floor(S.x / BIN), bz0 = Math.floor(S.z / BIN);
  for (let dz = -rb; dz <= rb; dz++) for (let dx = -rb; dx <= rb; dx++) for (const i of bins.get(`${bx0 + dx},${bz0 + dz}`) || []) {
    const q = nodes[i]; if (q.made || q.rank > 7 || !q.adj.length) continue;
    const ci = Math.round((q.x - ox) / GRID), cj = Math.round((q.z - oz) / GRID);
    if (ci < 0 || cj < 0 || ci >= n || cj >= n || edgeDist(q.x, q.z) < EDGE_IN) continue;
    const extra = q.rank >= 7 ? 150 : q.rank >= 6 ? 40 : 0, k = cj * n + ci, t = target.get(k);
    if (!t || extra < t.extra) target.set(k, { i, extra });
  }
  const nearEdge = edgeDist(S.x, S.z) < R;
  const sdA = new Float32Array(N).fill(NaN), hA = new Float32Array(N);
  const G = (k) => { if (sdA[k] !== sdA[k]) { const g = ground.coarse(cx(k % n), cz((k / n) | 0)); sdA[k] = g.sd; hA[k] = g.h; } return k; };
  const blocked = (x, z) => edgeDist(x, z) < EDGE_IN - GRID || avoid.some((a) => Math.hypot(x - a[0], z - a[1]) < a[2]);
  const cost = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap = [];
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const s = Math.round(R / GRID) * n + Math.round(R / GRID);
  cost[s] = 0; push([0, s]);
  let best = null;
  while (heap.length) {
    const [c, k] = pop();
    if (c > cost[k]) continue;
    if (best && c > best.total) break;
    if (c > R * 4) break;
    const x = cx(k % n), z = cz((k / n) | 0);
    const t = target.get(k);
    if (t && (!best || c + t.extra < best.total)) best = { total: c + t.extra, k, to: t.i };
    if (nearEdge && edgeDist(x, z) < EDGE_IN) { // out at the map's edge, toward the real road off it
      const off = nearest(x, z, 4000, true), total = c + 0.4 * (off ? off.d : 4000) + 200;
      if (!best || total < best.total) best = { total, k, to: null };
      continue;
    }
    G(k);
    const i0 = k % n, j0 = (k / n) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const q = j * n + i, L = di && dj ? GRID * Math.SQRT2 : GRID;
      if (blocked(cx(i), cz(j))) continue;
      G(q);
      const sd = Math.min(sdA[q], sdA[k]), g = Math.abs(hA[q] - hA[k]) / L;
      const wetK = sd < 0.5 ? 40 : sd < 3 ? 4 : sd < 6 ? 1.5 : 1;
      const nc = c + L * (1 + 2 * g + (g > 0.1 ? 30 * (g - 0.1) : 0)) * wetK;
      if (nc < cost[q]) { cost[q] = nc; prev[q] = k; push([nc, q]); }
    }
  }
  if (!best) return null;
  const cells = []; for (let k = best.k; k >= 0; k = prev[k]) cells.push(k);
  cells.reverse();
  const raw = cells.map((k) => [cx(k % n), cz((k / n) | 0)]);
  raw[0] = [S.x, S.z];
  if (best.to != null) raw.push([nodes[best.to].x, nodes[best.to].z]);
  // drawn straight where it can be: a run kept straight while the line stays as dry as the search's way and within 2 m of
  // the ground under it (no cut through a hill), then the corners rounded a little
  const sdOf = (x, z) => ground.coarse(x, z);
  const minSd = (a, b) => { let m = Infinity; for (let q = a; q <= b; q++) m = Math.min(m, sdOf(raw[q][0], raw[q][1]).sd); return m; };
  const clear = (a, b) => {
    const [x0, z0] = raw[a], [x1, z1] = raw[b], L = Math.hypot(x1 - x0, z1 - z0), floor = Math.min(3, minSd(a, b));
    const h0 = sdOf(x0, z0).h, h1 = sdOf(x1, z1).h;
    for (let d = 2; d < L; d += 2) {
      const x = x0 + ((x1 - x0) * d) / L, z = z0 + ((z1 - z0) * d) / L, g = sdOf(x, z);
      if (g.sd < floor || blocked(x, z) || Math.abs(h0 + ((h1 - h0) * d) / L - g.h) > 2) return false;
    }
    return true;
  };
  const pts = [raw[0]];
  for (let a = 0; a < raw.length - 1;) {
    let b = a + 1;
    for (let c = Math.min(raw.length - 1, a + 80); c > a + 1; c--) if (clear(a, c)) { b = c; break; }
    pts.push(raw[b]); a = b;
  }
  let wet = 0, m = 0;
  for (let q = 1; q < pts.length; q++) {
    const [x0, z0] = pts[q - 1], [x1, z1] = pts[q], L = Math.hypot(x1 - x0, z1 - z0); m += L;
    for (let d = 1; d < L; d += 2) if (sdOf(x0 + ((x1 - x0) * d) / L, z0 + ((z1 - z0) * d) / L).sd < 0.5) wet += 2;
  }
  return { pts, to: best.to, wet, m };
}
// lay a made two-track into the graph: nodes every DENSE m along its line, the first one the start's own
function layTrack(pts, endNode) {
  const first = node(pts[0][0], pts[0][1]);
  nodes[first].made = true;
  let prev = first;
  for (let q = 1; q < pts.length; q++) {
    const [x0, z0] = pts[q - 1], [x1, z1] = pts[q], L = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.ceil(L / DENSE));
    for (let r = 1; r <= k; r++) {
      const last = q === pts.length - 1 && r === k;
      const cur = last && endNode != null ? endNode : node(x0 + ((x1 - x0) * r) / k, z0 + ((z1 - z0) * r) / k);
      if (cur === prev) continue;
      if (!(last && endNode != null)) nodes[cur].made = true;
      const a = nodes[prev], b = nodes[cur], len = Math.hypot(b.x - a.x, b.z - a.z), id = edges.length;
      edges.push({ a: prev, b: cur, len, cost: len * COST[7], k: 3, hw: 1.6, rank: 7, name: '', line: false, made: true });
      a.adj.push(id); b.adj.push(id); a.rank = Math.min(a.rank, 7); b.rank = Math.min(b.rank, 7);
      prev = cur;
    }
  }
  return first;
}

// ---- each start's way out ----------------------------------------------------------------------------------------
const used = new Set(), routes = [], report = [];
const avoidAll = OUTFITTERS.map((n) => placeOf(n)).filter(Boolean).flatMap((pl) => [[pl.store[0], pl.store[1], 9], [pl.dock[0], pl.dock[1], 5], [pl.dockLand[0], pl.dockLand[1], 4]]);
for (const S of starts) {
  const sn = nearest(S.x, S.z, SNAP_MAX, true) || { i: -1, d: Infinity };
  // a landing's or a dock's point lies at (or in) the water: the start is the first dry ground from it toward its road
  if (ground && S.at === 'landing') {
    // (round 4: the dry ground nearest the landing, 4 m up from the water, leaning toward its road: never a start out on
    // the water, nor one across it)
    const tx = sn.i >= 0 ? nodes[sn.i].x : S.x, tz = sn.i >= 0 ? nodes[sn.i].z : S.z;
    let b = null;
    for (let r = 0; r <= 250 && !b; r += 2) for (let a = 0; a < 360; a += r ? Math.max(3, 360 / (r * 1.5)) : 360) {
      const x = S.x + r * Math.cos((a * Math.PI) / 180), z = S.z + r * Math.sin((a * Math.PI) / 180);
      if (ground.coarse(x, z).sd <= 4) continue;
      // the straight way back to the landing crosses no other water
      let wetRun = false, ok = true; const L = Math.hypot(x - S.x, z - S.z);
      for (let d = 2; d < L && ok; d += 2) { const q = ground.coarse(x + ((S.x - x) * d) / L, z + ((S.z - z) * d) / L).sd; if (q < 0) wetRun = true; else if (wetRun) ok = false; }
      if (!ok) continue;
      const sc = r + 0.15 * Math.hypot(tx - x, tz - z);
      if (!b || sc < b.sc) b = { x, z, sc };
    }
    if (b) { S.x = b.x; S.z = b.z; }
    if (sn.i >= 0) sn.d = Math.hypot(tx - S.x, tz - S.z);
  }
  // a start off its road (a store's stand, a lot back in the trees or by the map's edge, a landing below the road's end):
  // a made two-track to it over the ground
  let s0 = sn.i, drive = sn.i >= 0 && sn.d <= 12, track = null;
  if (S.stand && sn.d <= 12 && sn.d > 1) { // (a store's stand by its road: a few metres of track onto it, so the route begins at the stand)
    track = { pts: [[S.x, S.z], [nodes[sn.i].x, nodes[sn.i].z]], to: sn.i, wet: 0, m: sn.d };
    s0 = layTrack(track.pts, sn.i);
  } else if ((!(sn.d <= 12) || (S.keep && sn.d > 3)) && ground) { // (a lot: always its own way out past its sign and box)
    track = madeTrack(S, S.keep ? avoidAll.concat([S.keep.sign, S.keep.box].filter(Boolean).map((q) => [q[0], q[1], 2.6])) : avoidAll);
    if (track) { s0 = layTrack(track.pts, track.to); drive = true; }
  } else if (!(sn.d <= 12) && sn.i >= 0 && sn.d <= 300) { // (no ground: the straight two-track of old, flat)
    track = { pts: [[S.x, S.z], [nodes[sn.i].x, nodes[sn.i].z]], to: sn.i, wet: 0, m: sn.d };
    s0 = layTrack(track.pts, sn.i); drive = true;
  }
  if (s0 < 0) { report.push({ key: S.key, name: S.name, at: S.at, road: null, why: `no drivable way within ${SNAP_MAX} m and no way over the ground` }); continue; }
  let best = null, bestScore = Infinity;
  const { via } = dijkstra(s0, 30000, (i, c) => {
    const n = nodes[i];
    if (n.rank > 3 || Math.hypot(n.x - S.x, n.z - S.z) < TARGET_MIN) return false;
    const sc = c + 0.7 * townDist(n.x, n.z);
    if (sc < bestScore) { bestScore = sc; best = i; }
    return c > bestScore; // (nothing cheaper can come after)
  });
  let ids = best != null ? pathTo(via, s0, best) : null;
  if (!ids) { // no county road out (a box edge, a dead-end net): the longest way the net has, out to LEN
    let far = -1, fd = 0;
    for (const [i] of via) { const d = Math.hypot(nodes[i].x - S.x, nodes[i].z - S.z); if (d > fd) { fd = d; far = i; } }
    ids = far >= 0 ? pathTo(via, s0, far) : [];
  }
  // cut at LEN along (past the made two-track)
  const pts = [[nodes[s0].x, nodes[s0].z]], keep = [];
  let s = 0, cur = s0;
  for (const id of ids) {
    if (s >= LEN + (track ? track.m : 0)) break;
    const e = edges[id]; cur = e.a === cur ? e.b : e.a;
    s += e.len; keep.push(id); pts.push([nodes[cur].x, nodes[cur].z]);
  }
  for (const id of keep) used.add(id);
  const names = [...new Set(keep.map((id) => edges[id].name).filter(Boolean))];
  const snap = track ? Math.round(track.m) : Math.round(sn.d);
  routes.push({ key: S.key, ep: S.ep, at: S.at, snap, stand: !!S.stand, drive, edge: !!(track && track.to == null), pts });
  report.push({ key: S.key, name: S.name, at: S.at, snap, track: track ? { m: Math.round(track.m), wet: track.wet, toEdge: track.to == null } : null, drive, km: +(s / 1000).toFixed(2), via: names, toward: best != null ? towns.reduce((a, t) => (Math.hypot(t.x - nodes[best].x, t.z - nodes[best].z) < Math.hypot(a.x - nodes[best].x, a.z - nodes[best].z) ? t : a)).n : null });
}
// the joins: two starts close by, the road between them when it is short
const joins = [];
for (let a = 0; a < routes.length; a++) for (let b = a + 1; b < routes.length; b++) {
  const A = routes[a], B = routes[b], d = Math.hypot(A.pts[0][0] - B.pts[0][0], A.pts[0][1] - B.pts[0][1]);
  if (d > JOIN || d < 1) continue;
  const sa = nearest(A.pts[0][0], A.pts[0][1], 1), sb = nearest(B.pts[0][0], B.pts[0][1], 1);
  if (!sa || !sb) continue;
  let hit = false;
  const { via } = dijkstra(sa.i, d * 2.5 + 1500, (i) => { if (i === sb.i) { hit = true; return true; } return false; });
  if (!hit) continue;
  const ids = pathTo(via, sa.i, sb.i), len = ids.reduce((t, id) => t + edges[id].len, 0);
  if (len > Math.min(4500, d * 1.6 + 500)) continue;
  for (const id of ids) used.add(id);
  joins.push({ a: A.key, b: B.key, km: +(len / 1000).toFixed(2) });
}

// ---- the drawn edges as chains (polylines), broken where the kind changes or the net branches -----------------------
// (round 5: every way in the box, not only the routes' and the joins' (routeUsed: what the routes run on, for the
// table's back-compatible `roads`, read by scripts/edge.mjs and scripts/cabins.mjs); --routes-only: the round 4 table)
const routeUsed = new Set(used);
if (!has('--routes-only')) edges.forEach((e, id) => { if (!e.shut && !e.out) used.add(id); });
const deg = new Map();
for (const id of used) { const e = edges[id]; deg.set(e.a, (deg.get(e.a) || 0) + 1); deg.set(e.b, (deg.get(e.b) || 0) + 1); }
const usedAt = (i) => nodes[i].adj.filter((id) => used.has(id));
const sameKind = (e, f) => e.k === f.k && e.hw === f.hw && e.line === f.line && !!e.svc === !!f.svc;
const brk = (i) => { const l = usedAt(i); return l.length !== 2 || !sameKind(edges[l[0]], edges[l[1]]); };
const taken = new Set(), chains = [];
const walk = (startNode, firstEdge) => {
  const e0 = edges[firstEdge], pts = [[nodes[startNode].x, nodes[startNode].z]], names = new Set(), ids = [];
  let cur = startNode, id = firstEdge;
  for (;;) {
    taken.add(id); ids.push(id);
    const e = edges[id]; if (e.name) names.add(e.name);
    cur = e.a === cur ? e.b : e.a;
    pts.push([nodes[cur].x, nodes[cur].z]);
    if (brk(cur)) break;
    const next = usedAt(cur).find((q) => !taken.has(q));
    if (next === undefined) break;
    id = next;
  }
  chains.push({ k: e0.k, hw: e0.hw, line: e0.line, svc: !!e0.svc, name: [...names][0] || '', pts, ids });
};
for (const i of deg.keys()) if (brk(i)) for (const id of usedAt(i)) if (!taken.has(id)) walk(i, id);
for (const id of used) if (!taken.has(id)) walk(edges[id].a, id); // (loops)
// (round 5: the chains walked in the order of the tiles they start in, so the ground's caches hold)
{ const T = 2560, key = (c) => Math.floor((c.pts[0][1] - BOX.z0) / T) * 1000 + Math.floor((c.pts[0][0] - BOX.x0) / T); chains.sort((a, b) => key(a) - key(b)); }
const total = chains.reduce((t, c) => t + c.pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - c.pts[i][0], p[1] - c.pts[i][1]), 0), 0);
console.log(`roads: ${routes.length} routes, ${joins.length} joins, ${chains.length} chains, ${(total / 1000).toFixed(1)} km`);

// ---- heights on the release's ground (a host) ----------------------------------------------------------------------
function resample(pts, step, seg = null) { // (seg: filled with each point's piece of the line, 1-based; 0 the first point)
  const out = [pts[0].slice()];
  if (seg) seg.push(0);
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) { out.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]); if (seg) seg.push(i); }
  }
  return out;
}
async function loadGround() {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  let gridMod, terrain, detailBuild;
  try {
    gridMod = await vite.ssrLoadModule('/src/grid.js');
    terrain = await vite.ssrLoadModule('/src/terrain-build.js');
    detailBuild = await vite.ssrLoadModule('/src/detail-build.js');
  } catch (e) { await vite.close(); throw e; }
  const { TileGrid, GridQueries } = gridMod;
  const g = index.grid;
  const desc = { cell: g.cell, originX: g.originX, originZ: g.originZ, tile: g.tile, halo: g.halo, fields: index.version >= 4 ? index.fields : undefined };
  const levelById = new Float32Array(index.lakes.length + 1);
  for (const l of index.lakes) if (l) levelById[l.id] = l.level;
  const tiles = new Map();
  const tileGrid = (tx, ty) => {
    const k = `${tx},${ty}`;
    if (!tiles.has(k)) {
      let tg = null;
      try { const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}tiles/${tx}_${ty}.bin`)); tg = new TileGrid(desc, tx, ty, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), levelById); } catch { /* no tile */ }
      if (tiles.size > 360) tiles.delete(tiles.keys().next().value); // (round 5: the whole net walked a chain at a time)
      tiles.set(k, tg);
    }
    return tiles.get(k);
  };
  class WorldGrid extends GridQueries {
    constructor() { super(); this.cell = g.cell; this.originX = g.originX; this.originZ = g.originZ; this.tile = g.tile; }
    at(i, j) { return tileGrid(Math.min(g.ntx - 1, Math.max(0, Math.floor(i / g.tile))), Math.min(g.nty - 1, Math.max(0, Math.floor(j / g.tile)))); }
    hCell(i, j) { const t = this.at(i, j); return t ? t.hCell(i, j) : 0; }
    sdCell(i, j) { const t = this.at(i, j); return t ? t.sdCell(i, j) : 100; }
    lakeCell(i, j) { const t = this.at(i, j); return t ? t.lakeCell(i, j) : 0; }
    levelCell(i, j) { const t = this.at(i, j); return t ? t.levelCell(i, j) : 0; }
    levelOf(id) { return levelById[id]; }
  }
  const world = new WorldGrid();
  const cache = new Map();
  let detailIndex = null;
  try { detailIndex = JSON.parse(fs.readFileSync(dataDir + 'detail/index.json', 'utf8')); } catch { /* 10 m only */ }
  const raws = new Map();
  const lidar = (x, z) => { // the 2 m LiDAR's own height (the real road bench), else NaN
    if (!detailIndex) return NaN;
    const L = detailIndex.levels['2'], gox = g.originX + g.cell / 2, goz = g.originZ + g.cell / 2;
    const gx = Math.floor((x - gox) / L.size), gy = Math.floor((z - goz) / L.size), tx = Math.floor(gx / L.perTile), ty = Math.floor(gy / L.perTile);
    const name = `${tx}_${ty}_${gx - tx * L.perTile}_${gy - ty * L.perTile}`;
    if (!raws.has(name)) {
      let D = null;
      if ((detailIndex.chunks['2'] || {})[name]) { const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}detail/${L.dir}/${name}.bin`)); D = detailBuild.decodeChunk(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)); }
      if (raws.size > 300) raws.delete(raws.keys().next().value);
      raws.set(name, D);
    }
    const D = raws.get(name);
    if (!D) return NaN;
    const fx = (x - D.x0) / D.r, fz = (z - D.z0) / D.r, K = Math.floor(fx), M = Math.floor(fz);
    if (K < 0 || M < 0 || K >= D.n - 1 || M >= D.n - 1) return NaN;
    const u = fx - K, w = fz - M, h = (k, m) => D.h[m * D.n + k];
    return (h(K, M) * (1 - u) + h(K + 1, M) * u) * (1 - w) + (h(K, M + 1) * (1 - u) + h(K + 1, M + 1) * u) * w;
  };
  return {
    close: () => vite.close(),
    at: (x, z) => { if (cache.size > 2e6) cache.clear(); const sd = world.shoreAt(x, z), l = lidar(x, z); return { sd, h: l === l ? l : terrain.meshHeightAt(world, x, z, cache), lv: sd < 30 ? world.levelAt(x, z, 3) : sd < LV_REACH ? world.levelAt(x, z, 4) : NaN }; },
    coarse: (x, z) => ({ sd: world.shoreAt(x, z), h: terrain.meshHeightAt(world, x, z, cache) }), // (the made two-tracks' search)
  };
}
const enc = (rows, scales) => { const out = [], prev = scales.map(() => 0); for (const r of rows) r.forEach((v, i) => { const q = Math.round(v * scales[i]); out.push(i < 2 || i === 2 ? q - prev[i] : q); prev[i] = q; }); return out; };
const roads = [], crossings = [];
let wet = 0, cuts = [];
const built = [];
for (const c of chains) {
  const seg = [], pts = resample(c.pts, STEP, seg), n = pts.length;
  const h = new Float64Array(n), w = new Float64Array(n).fill(2.5), water = new Uint8Array(n), raw = new Float64Array(n).fill(NaN);
  if (ground) {
    pts.forEach(([x, z], i) => { const g = ground.at(x, z); if (g.sd > 0.5) raw[i] = g.h; else water[i] = 1; });
    // over water, level between the banks (a culvert, a causeway)
    for (let i = 0; i < n; i++) if (!(raw[i] === raw[i])) {
      let a = i - 1; while (a >= 0 && !(raw[a] === raw[a])) a--;
      let b = i + 1; while (b < n && !(raw[b] === raw[b])) b++;
      raw[i] = a >= 0 && b < n ? raw[a] + ((raw[b] - raw[a]) * (i - a)) / (b - a) : a >= 0 ? raw[a] : b < n ? raw[b] : 0;
    }
    const R = Math.ceil((SMOOTH * 2) / STEP);
    for (let i = 0; i < n; i++) {
      let sw = 0, sh = 0;
      for (let j = Math.max(0, i - R); j <= Math.min(n - 1, i + R); j++) { const d = (j - i) * STEP, k = Math.exp(-(d * d) / (2 * SMOOTH * SMOOTH)); sw += k; sh += k * raw[j]; }
      h[i] = sh / sw;
    }
  }
  built.push({ c, pts, n, h, w, water, raw, seg });
}
// the ends: a lone end (a lot, a cut end) meets the ground; where roads meet (round 4: the check found the made two-tracks
// and their roads 0.4-1 m apart at the junction, the ground a blend of both) every road there eased to one height, the
// mean of theirs, over its last JOIN_EASE m
const JOIN_EASE = 24;
if (ground) {
  const endKey = (p) => `${Math.round(p[0])},${Math.round(p[1])}`, at = new Map();
  for (const B of built) for (const e of [0, B.n - 1]) { const k = endKey(B.pts[e]); if (!at.has(k)) at.set(k, []); at.get(k).push({ B, e }); }
  const tgt = new Map();
  for (const [k, list] of at) {
    const dry = list.filter((q) => !q.B.water[q.e]);
    if (!dry.length) continue; // (an end in the water: the bridge's)
    const target = list.length > 1 ? dry.reduce((t, q) => t + q.B.h[q.e], 0) / dry.length : dry[0].B.raw[dry[0].e];
    tgt.set(k, target);
    for (const { B, e } of dry) {
      const d0 = target - B.h[e];
      for (let q = 0; q < B.n; q++) {
        const i = e === 0 ? q : B.n - 1 - q, d = q * STEP; if (d > JOIN_EASE) break;
        const t = 1 - d / JOIN_EASE; B.h[i] += d0 * t * t * (3 - 2 * t);
      }
    }
  }
  // round 5: a junction out on the water (a causeway's fork, a bridge's end at another road): every road there at one
  // height, the mean of the dry ends' when there are any, else of theirs all; each wet end's run over the water levelled
  // from its own bank to it (two decks meet there at one height)
  for (const [k, list] of at) {
    if (!tgt.has(k)) tgt.set(k, list.reduce((t, q) => t + q.B.h[q.e], 0) / list.length);
    const target = tgt.get(k);
    for (const { B, e } of list) {
      if (!B.water[e] || B.water.every((v) => v)) continue;
      let d = e; while (d >= 0 && d < B.n && B.water[d]) d += e === 0 ? 1 : -1;
      const L = Math.abs(d - e);
      for (let q = 0; q < L; q++) { const i = e === 0 ? q : B.n - 1 - q; B.h[i] = B.raw[i] = target + ((B.h[d] - target) * q) / L; }
    }
  }
  // a road all over the water (a bridge's piece between two junctions): level from one end's height to the other's
  for (const B of built) if (B.water.every((v) => v)) {
    const a = tgt.get(endKey(B.pts[0])), b = tgt.get(endKey(B.pts[B.n - 1]));
    if (a == null && b == null) continue;
    for (let i = 0; i < B.n; i++) B.h[i] = B.raw[i] = a != null && b != null ? a + ((b - a) * i) / Math.max(1, B.n - 1) : (a ?? b);
  }
}
// each chain's two ends (round 5, worked out here, no longer at load): joined to another road (no fade), at a start
// (faded in over a few metres: the lot's own gravel or the landing), at the box's edge (faded out over 30 m, so it reads
// as going on), or a real dead end (a driveway's, a turnaround: 8 m)
const endKey = (p) => `${Math.round(p[0])},${Math.round(p[1])}`, endsAt = new Map();
for (const B of built) for (const e of [0, B.n - 1]) { const k = endKey(B.pts[e]); endsAt.set(k, (endsAt.get(k) || 0) + 1); }
const junction = (p) => (endsAt.get(endKey(p)) || 0) > 1;
const startPts = routes.map((r) => r.pts[0]);
const fadeOf = (p) => (junction(p) ? 0 : startPts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 40) ? 5 : edgeDist(p[0], p[1]) < EDGE_CUT + 60 ? 30 : 8);
for (const B of built) { B.fadeA = fadeOf(B.pts[0]); B.fadeB = fadeOf(B.pts[B.n - 1]); }

// ---- the bridges: every run of a road over water between two banks (a dry point, or a junction's end), level from
// bank to bank (props.js roadBridges draws the deck, truck.js drives on it). A run ending at a dead end in the water is a
// boat landing's ramp: none.
const bridges = [], BRIDGE_MAX = 220; // (a longer run over water: a road the map has on the water, drawn on neither)
if (ground) for (const B of built) {
  const { c, pts, n, h, water } = B;
  for (let i = 0; i < n;) {
    if (!water[i]) { i++; continue; }
    let j = i; while (j < n && water[j]) j++;
    const a = i > 0 ? i - 1 : junction(pts[0]) ? 0 : -1, b = j < n ? j : junction(pts[n - 1]) ? n - 1 : -1;
    const span = a >= 0 && b > a ? Math.hypot(pts[b][0] - pts[a][0], pts[b][1] - pts[a][1]) : 0;
    if (a >= 0 && b > a && span <= BRIDGE_MAX) bridges.push({ ax: +pts[a][0].toFixed(1), az: +pts[a][1].toFixed(1), ah: +h[a].toFixed(2), bx: +pts[b][0].toFixed(1), bz: +pts[b][1].toFixed(1), bh: +h[b].toFixed(2), hw: Math.max(1.7, c.hw), k: c.k });
    i = j;
  }
}
// round 4: where a route crosses water off those (the ground read finer, every 2 m), a bridge of its own from bank to bank
const segGap = (q, x, z) => { const ex = q.bx - q.ax, ez = q.bz - q.az, L2 = ex * ex + ez * ez, t = L2 ? Math.max(0, Math.min(1, ((x - q.ax) * ex + (z - q.az) * ez) / L2)) : 0; return Math.hypot(x - q.ax - ex * t, z - q.az - ez * t); };
// (round 5: a route's bridge level with the road's own grade there, not the bank's ground: EP 40's dip at the bank)
const ptBins = new Map();
for (const B of built) B.pts.forEach(([x, z], i) => { const k = `${Math.floor(x / 32)},${Math.floor(z / 32)}`; let l = ptBins.get(k); if (!l) ptBins.set(k, (l = [])); l.push([B, i]); });
const pointsNear = (x, z, r) => { const out = []; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const q of ptBins.get(`${Math.floor(x / 32) + dx},${Math.floor(z / 32) + dz}`) || []) { const d = Math.hypot(q[0].pts[q[1]][0] - x, q[0].pts[q[1]][1] - z); if (d < r) out.push([q[0], q[1], d]); } return out; };
const levelNear = ([x, z], fallback) => { const l = pointsNear(x, z, 4).filter((q) => !q[0].water[q[1]]).sort((p, q) => p[2] - q[2]); return l.length ? l[0][0].h[l[0][1]] : fallback; };
let routeBridgeN = 0;
if (ground) for (const r of routes) {
  const pts = resample(r.pts, 2), wetA = pts.map(([x, z]) => ground.at(x, z).sd < 0.5);
  for (let i = 1; i < pts.length - 1;) {
    if (!wetA[i]) { i++; continue; }
    let j = i; while (j < pts.length && wetA[j]) j++;
    if (j < pts.length && (j - i) * 2 <= 80) {
      const A = pts[i - 1], Bp = pts[j], ha = levelNear(A, ground.at(A[0], A[1]).h), hb = levelNear(Bp, ground.at(Bp[0], Bp[1]).h), mx = (A[0] + Bp[0]) / 2, mz = (A[1] + Bp[1]) / 2;
      if (!bridges.some((q) => segGap(q, mx, mz) < 6)) { bridges.push({ ax: +A[0].toFixed(1), az: +A[1].toFixed(1), ah: +ha.toFixed(2), bx: +Bp[0].toFixed(1), bz: +Bp[1].toFixed(1), bh: +hb.toFixed(2), hw: 2.6, k: 1, key: r.key }); routeBridgeN++; }
    }
    i = j + 1;
  }
}
// round 5 (the owner's "the trucks float"; round 4's EP 40 bridge end): each bridge's ends met by the road's own grade,
// an abutment: the road's points within ABUT m of a bridge's end kept at the road's level (no fade to the bank's ground by
// the water), and drawn so (roads.bin marks them: road-grade.js grades them right to the water's edge)
const ABUT = 10;
for (const B of built) B.abut = new Uint8Array(B.n);
for (const q of bridges) for (const [x, z] of [[q.ax, q.az], [q.bx, q.bz]]) for (const [B, i] of pointsNear(x, z, ABUT)) if (!B.water[i]) B.abut[i] = 1;
for (const B of built) {
  const { c, pts, n, h, w, water, raw } = B;
  if (ground) {
    // round 4: by the water the ground the game draws (detail-build.js chunkGround): no road grade within 4 m of the shore
    // (eased in from 1 to 4 m), and never under the lake's level by the shore (sd < 30)
    pts.forEach(([x, z], i) => {
      if (water[i]) return;
      const g = ground.at(x, z), t = B.abut[i] ? 1 : Math.min(1, Math.max(0, (g.sd - 1) / 3)), k = t * t * (3 - 2 * t);
      h[i] = raw[i] + (h[i] - raw[i]) * k;
      if (g.lv === g.lv) h[i] = Math.max(h[i], g.lv + 0.04 * Math.min(g.sd, 5)); // (round 5: out to LV_REACH, past the game's 30 m: EP 50's bump)
    });
    for (let i = 0; i < n; i++) { const cut = h[i] - raw[i]; w[i] = SHOULDER(cut); if (!water[i]) cuts.push(Math.abs(cut)); }
    wet += water.reduce((t, v) => t + v, 0);
    for (let i = 0; i < n;) { // the water a road crosses (a culvert, a bridge: for the owner's list)
      if (!water[i]) { i++; continue; }
      let j = i; while (j < n && water[j]) j++;
      crossings.push({ name: c.name, k: c.k, m: (j - i) * STEP, end: i === 0 || j === n, x: Math.round(pts[i][0]), z: Math.round(pts[i][1]) });
      i = j;
    }
  }
  B.rows = pts.map(([x, z], i) => [x, z, h[i], water[i] ? -w[i] : w[i]]);
  B.cum = [0]; for (let i = 1; i < n; i++) B.cum.push(B.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
}
const bl = bridges.map((b) => Math.hypot(b.bx - b.ax, b.bz - b.az)).sort((a, b) => b - a);
console.log(`roads: ${bridges.length} bridges (${routeBridgeN} on the routes alone), the longest ${bl.slice(0, 5).map((m) => m.toFixed(0)).join(', ')} m`);
if (ground) await ground.close();
cuts.sort((a, b) => a - b);

// ---- the tables ---------------------------------------------------------------------------------------------------
// src/roads.bin (round 5): every road, cut into one piece per fine tile (each road's points within PAD m of the tile, so
// a tile's piece alone grades its own ground and its halo's), each piece gzipped and fetched by an HTTP range request
// as its tile is built (roads.js tileRoads). The file:
//   u32 'RDS1', u16 version 1, u16 PAD, u32 pieces, u32 the tile (m), u16 the stamp's length, the stamp (the release's
//   baked time), padded to 4; per piece u16 tx, u16 ty, u32 offset, u32 length; then the pieces.
// A piece (gzipped): varint runs; per run varint chain, varint s0 (dm along the chain to the run's first point), varint
// the chain's length (dm), u8 kind, u8 half width (dm), u8 flags (1 a centre line, 2 a driveway or an aisle), u8 fade at
// the chain's start, u8 at its end (m), varint points; the first point zigzag x, z (dm), h (cm), then each one's zigzag
// differences; and per point a u8 shoulder (dm, 0x80 over water); then varint abutments, each its point's index in the
// run (differences): the points by a bridge's end, graded right to the water's edge.
const binFile = path.resolve(arg('--bin', path.join(root, 'src/roads.bin')));
const PAD = 80, TILE_M = index.grid.tile * index.grid.cell;
const pieceRuns = new Map(); // 'tx,ty' -> [{ B, i0, i1 }]
for (const B of built) {
  const perTile = new Map();
  B.pts.forEach(([x, z], i) => {
    const tx0 = Math.max(0, Math.floor((x - PAD - BOX.x0) / TILE_M)), tx1 = Math.min(index.grid.ntx - 1, Math.floor((x + PAD - BOX.x0) / TILE_M));
    const ty0 = Math.max(0, Math.floor((z - PAD - BOX.z0) / TILE_M)), ty1 = Math.min(index.grid.nty - 1, Math.floor((z + PAD - BOX.z0) / TILE_M));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) { const k = `${tx},${ty}`; let l = perTile.get(k); if (!l) perTile.set(k, (l = [])); l.push(i); }
  });
  for (const [k, l] of perTile) {
    let r = null;
    const runs = pieceRuns.get(k) || []; pieceRuns.set(k, runs);
    for (const i of l) {
      if (r && i <= r.i1 + 2) r.i1 = i;
      else { if (r) runs.push(r); r = { B, i0: i, i1: i }; }
    }
    runs.push(r);
    for (const q of runs) if (q.B === B) { q.i0 = Math.max(0, q.i0 - 1); q.i1 = Math.min(B.n - 1, q.i1 + 1); }
  }
}
built.forEach((B, id) => { B.id = id; });
const varint = (out, v) => { v = Math.round(v); while (v >= 128) { out.push((v % 128) | 128); v = Math.floor(v / 128); } out.push(v); };
const zig = (out, v) => { v = Math.round(v); varint(out, v < 0 ? -2 * v - 1 : 2 * v); };
const stamp = Buffer.from(String((index.source && index.source.baked) || ''), 'utf8');
const pieceBufs = [];
let pieceBytes = 0, pieceRaw = 0, pieceKm = 0;
for (const k of [...pieceRuns.keys()].sort((a, b) => { const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number); return ay - by || ax - bx; })) {
  const runs = pieceRuns.get(k), out = [];
  varint(out, runs.length);
  for (const { B, i0, i1 } of runs) {
    varint(out, B.id); varint(out, B.cum[i0] * 10); varint(out, B.cum[B.n - 1] * 10);
    out.push(B.c.k, Math.round(B.c.hw * 10), (B.c.line ? 1 : 0) | (B.c.svc ? 2 : 0), B.fadeA, B.fadeB);
    varint(out, i1 - i0 + 1);
    let px = 0, pz = 0, ph = 0;
    for (let i = i0; i <= i1; i++) {
      const [x, z, h, w] = B.rows[i], X = Math.round(x * 10), Z = Math.round(z * 10), H = Math.round(h * 100);
      zig(out, X - px); zig(out, Z - pz); zig(out, H - ph); px = X; pz = Z; ph = H;
      out.push(Math.min(127, Math.round(Math.abs(w) * 10)) | (w < 0 ? 128 : 0));
      if (i > i0) pieceKm += Math.hypot(x - B.rows[i - 1][0], z - B.rows[i - 1][1]) / 1000;
    }
    const ab = []; for (let i = i0; i <= i1; i++) if (B.abut[i]) ab.push(i - i0);
    varint(out, ab.length); let pa = 0; for (const q of ab) { varint(out, q - pa); pa = q; }
  }
  const [tx, ty] = k.split(',').map(Number), gz = zlib.gzipSync(Buffer.from(out), { level: 9 });
  pieceBufs.push({ tx, ty, gz }); pieceBytes += gz.length; pieceRaw += out.length;
}
{
  const headLen = (18 + stamp.length + 3) & ~3, ixLen = pieceBufs.length * 12;
  const head = Buffer.alloc(headLen + ixLen);
  head.write('RDS1', 0, 'latin1'); head.writeUInt16LE(1, 4); head.writeUInt16LE(PAD, 6); head.writeUInt32LE(pieceBufs.length, 8); head.writeUInt32LE(TILE_M, 12);
  head.writeUInt16LE(stamp.length, 16); stamp.copy(head, 18);
  let off = head.length;
  pieceBufs.forEach((p, i) => { const o = headLen + i * 12; head.writeUInt16LE(p.tx, o); head.writeUInt16LE(p.ty, o + 2); head.writeUInt32LE(off, o + 4); head.writeUInt32LE(p.gz.length, o + 8); off += p.gz.length; });
  fs.writeFileSync(binFile, Buffer.concat([head, ...pieceBufs.map((p) => p.gz)]));
  console.log(`roads: ${binFile} ${(fs.statSync(binFile).size / 1024).toFixed(0)} KB: ${pieceBufs.length} pieces (${(pieceRaw / 1024).toFixed(0)} KB before gzip; the largest ${(Math.max(...pieceBufs.map((p) => p.gz.length)) / 1024).toFixed(1)} KB), ${pieceKm.toFixed(0)} km with the overlaps`);
}

// src/roads.json: the routes (the truck), the bridges, and (for scripts/edge.mjs, scripts/cabins.mjs and the rigs, not
// drawn by the game since round 5) the stretches of the roads the routes run on, with their heights
for (const B of built) {
  const on = B.c.ids.map((id) => routeUsed.has(id)), mark = B.seg.map((s) => (s > 0 ? on[s - 1] : on[0]));
  for (let i = 0; i < B.n;) {
    if (!mark[i]) { i++; continue; }
    let j = i; while (j < B.n && mark[j]) j++;
    const a = Math.max(0, i - 1), b = Math.min(B.n, j + 1);
    if (b - a >= 2) roads.push({ k: B.c.k, hw: B.c.hw, line: B.c.line ? 1 : 0, name: B.c.name, p: enc(B.rows.slice(a, b), [10, 10, 100, 10]) });
    i = j;
  }
}
const routeRows = routes.map((r) => ({ key: r.key, ep: r.ep, at: r.at, snap: r.snap, ...(r.stand ? { stand: 1 } : {}), drive: r.drive ? 1 : 0, ...(r.edge ? { edge: 1 } : {}), p: enc(resample(r.pts, 10).map(([x, z]) => [x, z]), [10, 10]) }));
const table = {
  for: index.source && index.source.baked,
  about: `The real roads (scripts/roads.mjs, OpenStreetMap via Geofabrik; round 5: every drivable way in the box, ${chains.length} roads, ${(total / 1000).toFixed(0)} km, in src/roads.bin by tile). Here: the truck's routes, the ${bridges.length} bridges, and the stretches the routes run on (${roads.length}). ${ground ? 'Graded on the release ground' : 'Flat (no heights)'}.`,
  bin: has('--routes-only') ? null : path.basename(binFile),
  roads, routes: routeRows, bridges,
};
fs.writeFileSync(outFile, JSON.stringify(table));
console.log(`roads: ${outFile} ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB; ${ground ? `over water ${wet} samples (${(wet * STEP / 1000).toFixed(2)} km), cut/fill median ${cuts[cuts.length >> 1]?.toFixed(2)} m, p95 ${cuts[Math.floor(cuts.length * 0.95)]?.toFixed(2)} m, max ${cuts[cuts.length - 1]?.toFixed(2)} m` : 'no heights'}`);
if (reportFile) fs.writeFileSync(reportFile, JSON.stringify({ starts: report, joins, crossings: crossings.sort((a, b) => b.m - a.m), bridges }, null, 1));
for (const r of report) if (!r.road && r.why) console.log(`  ${r.key} ${r.name}: ${r.why}`);
for (const r of report) if (r.track) console.log(`  ${r.key} ${r.name} (${r.at}): a made two-track ${r.track.m} m${r.track.toEdge ? ' out to the map\'s edge' : ''}${r.track.wet ? `, ${r.track.wet} m over water` : ''}${r.drive ? '' : ' (park only)'}`);
