// Wetlands (2026-10-31; docs/wetland-data.md): what each OpenStreetMap creek really is, the beaver dams, and each
// lake's place in the water, for bake.mjs.
//
// The owner: "i think this is a good way to see river boundaries and creek boundaries as well. we assume all are
// navigable right now when thats not the case ... some of it is seasonal too". Before this every OSM waterway was cut
// into the ground as paddleable water, 15 m wide for a stream and 22 m for a river. Of the 4,871 km of streams, 506 km
// lay in mapped open water, 1,680 km in marsh and shrub swamp, and 1,446 km in dry woods or forested bog.
//
// Each waterway is walked every STEP metres and each point read against the NWI under it (d1-ground's kind, wet and
// wcls bytes) and the NHD stream line beside it (scripts/sources/streams.mjs):
//   river   an NWI river polygon, open water, a lily or wild-rice bed (or an OSM river on a perennial NHD line):
//           paddled as before, at the old widths
//   marsh   a creek through marsh, wet meadow or shrub swamp: paddled, but a narrow channel (MARSH_HW)
//   brook   through woods, forested bog or upland: not water. Drawn on the land by the game (creeks.json brooks)
//   none    no survey (Ontario): as before
// The classes are smoothed along the line (a majority over SMOOTH points, then no run shorter than MIN_RUN) so a channel
// doesn't blink in and out. Every waterway keeps its place in the lakes list, so the lake ids don't move.
import fs from 'node:fs';
import path from 'node:path';
import { readPack, parseNwi } from './sources/ground.mjs';

export const STEP = 10;          // m between the points a waterway is read at
const SMOOTH = 3;                // points either side in the majority filter (a 70 m window)
const MIN_RUN = 5;               // points: a shorter run joins its neighbour (50 m)
export const MARSH_HW = 7.5;     // m: a marsh channel's half-width: over 7.07 m so a diagonal line's cells meet edge to edge on
                                 // the 10 m grid (at 6 m they touched only at the corners and the water broke)
const NHD_REACH = 2;             // cells an NHD line is felt beside it (20 m)
const BROOK_STEP = 20;           // m between a brook's points in creeks.json
const ANCHOR_M = 60;             // m: a creek this near a portage's end is paddled from there
const ANCHOR_REACH = 1500;       // m: how far along the creek from a portage's end, to the next open water
const GAP_M = 500;               // m: a brook stretch no longer than this between paddled ones is paddled too

const C = { brook: 0, marsh: 1, river: 2, none: 3 };
export const CREEK_CLASS = ['brook', 'marsh', 'river', 'none'];
// the NHD lines on the grid: 1 perennial, 2 intermittent or ephemeral, 3 a path through a lake or wetland, 4 connector
const NHD_CLASS = { 46006: 1, 46003: 2, 46007: 2, 55800: 3, 33400: 4, 33600: 4 };
const NHD_RANK = [0, 4, 1, 3, 2];

export function loadNhd(cacheDir, grid, proj, log) {
  const f = path.join(cacheDir, 'streams', 'nhd-flowlines.json');
  if (!fs.existsSync(f)) { log('wetlands: no NHD flowlines (node scripts/sources/streams.mjs): creeks told by the NWI alone'); return null; }
  const { lines } = JSON.parse(fs.readFileSync(f, 'utf8'));
  const W = grid.width, H = grid.height, nhd = new Uint8Array(W * H);
  let n = 0;
  for (const l of lines) {
    const cls = NHD_CLASS[l.fcode];
    if (!cls) continue;
    const pts = l.pts.map(([lat, lon]) => proj.toLocal(lat, lon));
    for (let s = 1; s < pts.length; s++) {
      const [x1, z1] = pts[s - 1], [x2, z2] = pts[s], d = Math.hypot(x2 - x1, z2 - z1), steps = Math.max(1, Math.ceil(d / 5));
      for (let q = 0; q <= steps; q++) {
        const i0 = grid.ci(x1 + ((x2 - x1) * q) / steps), j0 = grid.cj(z1 + ((z2 - z1) * q) / steps);
        for (let dj = -NHD_REACH; dj <= NHD_REACH; dj++) for (let di = -NHD_REACH; di <= NHD_REACH; di++) {
          const i = i0 + di, j = j0 + dj;
          if (i < 0 || j < 0 || i >= W || j >= H) continue;
          const k = j * W + i;
          if (NHD_RANK[cls] > NHD_RANK[nhd[k]]) nhd[k] = cls;
        }
      }
    }
    n++;
  }
  log(`wetlands: ${n} NHD lines on the grid`);
  return nhd;
}

// a polyline every `step` metres (the ends kept)
export function along(pts, step) {
  const out = [pts[0]];
  for (let s = 1; s < pts.length; s++) {
    const [x1, z1] = pts[s - 1], [x2, z2] = pts[s], d = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(d / step));
    for (let q = 1; q <= n; q++) out.push([x1 + ((x2 - x1) * q) / n, z1 + ((z2 - z1) * q) / n]);
  }
  return out;
}

// one point's class from the bytes under it. P: the products (gKind, gWet, gWcls); nhd as loadNhd
function pointClass(P, nhd, k, osmKind) {
  const kind = P.gKind ? P.gKind[k] : 0, wet = P.gWet ? P.gWet[k] : 0, cls1 = P.gWcls ? P.gWcls[k] >> 4 : 0;
  const sys = (wet >> 4) & 3, reg = wet & 7, n = nhd ? nhd[k] : 0;
  if (!kind && !wet) return C.none;
  if (sys === 3 || cls1 === 13 || cls1 === 12 || cls1 === 11 || kind === 13 || kind === 8 || kind === 9) return C.river;
  if (kind === 5 || kind === 6 || kind === 4) return C.marsh;
  if ((cls1 === 10 || cls1 === 5) && reg >= 2 && reg <= 4) return C.marsh;
  if (osmKind === 'river' && (n === 1 || n === 3)) return C.marsh; // a mapped river on a perennial line, through the woods
  return C.brook;
}

// Classify every waterway: sets c.run (Uint8Array of classes, one per c.walk point), c.walk (the points), c.seasonal,
// c.paddle (any of it paddled). Returns stats.
// anchors: [[x, z], ...] where a creek must be paddled (the portage trails' ends: a portage ends at water you paddle)
export function classifyCreeks(waterways, grid, P, nhd, log, anchors = []) {
  const AB = 100, abk = new Map();
  for (const [x, z] of anchors) { const key = `${Math.floor(x / AB)},${Math.floor(z / AB)}`; if (!abk.has(key)) abk.set(key, []); abk.get(key).push([x, z]); }
  const nearAnchor = (x, z) => {
    const bi = Math.floor(x / AB), bj = Math.floor(z / AB);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const [ax, az] of abk.get(`${bi + di},${bj + dj}`) || []) if ((ax - x) ** 2 + (az - z) ** 2 <= ANCHOR_M * ANCHOR_M) return true;
    return false;
  };
  let anchored = 0;
  const W = grid.width, H = grid.height, stats = { km: [0, 0, 0, 0], seasonalKm: 0 };
  for (const c of waterways) {
    const walk = along(c.pts, STEP), n = walk.length, raw = new Uint8Array(n), inter = new Uint8Array(n);
    for (let q = 0; q < n; q++) {
      const i = grid.ci(walk[q][0]), j = grid.cj(walk[q][1]);
      if (i < 0 || j < 0 || i >= W || j >= H) { raw[q] = C.none; continue; }
      const k = j * W + i;
      raw[q] = pointClass(P, nhd, k, c.kind);
      inter[q] = (nhd && nhd[k] === 2) || (P.gWet && (P.gWet[k] & 7) === 2 && raw[q] === C.marsh) ? 1 : 0;
    }
    // the majority in a window, then no short runs
    const run = new Uint8Array(n);
    for (let q = 0; q < n; q++) {
      const cnt = [0, 0, 0, 0];
      for (let r = Math.max(0, q - SMOOTH); r <= Math.min(n - 1, q + SMOOTH); r++) cnt[raw[r]]++;
      let best = raw[q];
      for (let v = 0; v < 4; v++) if (cnt[v] > cnt[best]) best = v;
      run[q] = best;
    }
    for (let pass = 0; pass < 2; pass++) {
      let a = 0;
      while (a < n) {
        let b = a; while (b + 1 < n && run[b + 1] === run[a]) b++;
        if (b - a + 1 < MIN_RUN && (a > 0 || b < n - 1)) { const v = a > 0 ? run[a - 1] : run[b + 1]; for (let q = a; q <= b; q++) run[q] = v; }
        a = b + 1;
      }
    }
    // a short dry stretch between two paddled ones is a channel the survey didn't map (through alder, under a beaver
    // dam's tail): paddled, narrow
    { let a = 0;
      while (a < n) {
        let b = a; while (b + 1 < n && run[b + 1] === run[a]) b++;
        if (run[a] === C.brook && a > 0 && b < n - 1 && (b - a + 1) * STEP <= GAP_M && run[a - 1] !== C.none && run[b + 1] !== C.none) for (let q = a; q <= b; q++) run[q] = C.marsh;
        a = b + 1;
      } }
    // a portage ends at water you paddle: from a portage's end, the creek is paddled along the line both ways (to the
    // next lake, or ANCHOR_REACH), its dry stretches narrow channels
    if (abk.size) {
      const hits = [];
      for (let q = 0; q < n; q++) if (nearAnchor(walk[q][0], walk[q][1])) hits.push(q);
      const reach = Math.round(ANCHOR_REACH / STEP);
      for (const h of hits) for (const dir of [-1, 1]) {
        for (let q = h, d = 0; q >= 0 && q < n && d <= reach; q += dir, d++) {
          if (run[q] === C.brook) { run[q] = C.marsh; anchored++; } else if (run[q] === C.river && d * STEP > 80) break; // (open water past the start: the lake or the river)
        }
      }
    }
    c.walk = walk; c.run = run;
    let seas = 0, wet = 0;
    for (let q = 0; q < n; q++) {
      const len = q ? Math.hypot(walk[q][0] - walk[q - 1][0], walk[q][1] - walk[q - 1][1]) : 0;
      stats.km[run[q]] += len / 1000;
      if (run[q] === C.marsh || run[q] === C.river) { wet++; if (inter[q]) { seas++; stats.seasonalKm += len / 1000; } }
    }
    c.paddle = wet > 0;
    c.seasonal = wet > 0 && seas / wet >= 0.5; // the paddled part mostly intermittent or seasonally flooded
  }
  log(`wetlands: ${(anchored * STEP / 1000).toFixed(1)} km of brook kept paddled from portage ends`);
  log(`wetlands: creeks walked: river ${stats.km[2].toFixed(0)} km, marsh channel ${stats.km[1].toFixed(0)} km, brook ${stats.km[0].toFixed(0)} km, unsurveyed ${stats.km[3].toFixed(0)} km; ${stats.seasonalKm.toFixed(0)} km of the paddled part seasonal`);
  return stats;
}

// The paddled stretches cut into the ground: river and unsurveyed at the old widths, marsh at MARSH_HW, brooks not at all
export function rasterizeClassified(creeks, grid, lakeId) {
  const { width, height } = grid;
  for (const c of creeks) {
    const P = c.walk || c.pts, run = c.run;
    for (let s = 1; s < P.length; s++) {
      const cls = run ? Math.max(run[s - 1], run[s]) : C.none;
      if (cls === C.brook) continue;
      const hw = cls === C.marsh ? MARSH_HW : c.kind === 'stream' ? 7.5 : 11;
      const [x1, z1] = P[s - 1], [x2, z2] = P[s];
      const i0 = Math.max(0, grid.ci(Math.min(x1, x2) - hw)), i1 = Math.min(width - 1, grid.ci(Math.max(x1, x2) + hw));
      const j0 = Math.max(0, grid.cj(Math.min(z1, z2) - hw)), j1 = Math.min(height - 1, grid.cj(Math.max(z1, z2) + hw));
      const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) {
        const cz = grid.cz(j);
        for (let i = i0; i <= i1; i++) {
          const cx = grid.cx(i);
          const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cz - z1) * dz) / L2));
          const px = x1 + dx * t, pz = z1 + dz * t;
          if ((cx - px) * (cx - px) + (cz - pz) * (cz - pz) <= hw * hw) lakeId[j * width + i] = c.id;
        }
      }
    }
  }
}

// The brooks for the game: [{ id, perennial, pts: [x0, z0, x1, z1, ...] (m, whole) }]
export function brooksOf(waterways, grid, nhd) {
  const out = [];
  for (const c of waterways) {
    if (!c.run) continue;
    const { walk, run } = c;
    let a = 0;
    while (a < run.length) {
      let b = a; while (b + 1 < run.length && run[b + 1] === run[a]) b++;
      if (run[a] === C.brook && b > a) {
        const pts = [], every = Math.max(1, Math.round(BROOK_STEP / STEP));
        let per = 0, tot = 0;
        for (let q = a; q <= b; q++) {
          if ((q - a) % every === 0 || q === b) pts.push(Math.round(walk[q][0]), Math.round(walk[q][1]));
          const i = grid.ci(walk[q][0]), j = grid.cj(walk[q][1]);
          if (nhd && i >= 0 && j >= 0 && i < grid.width && j < grid.height) { tot++; if (nhd[j * grid.width + i] === 1) per++; }
        }
        out.push({ id: c.id, perennial: tot ? per / tot >= 0.5 : false, pts });
      }
      a = b + 1;
    }
  }
  return out;
}

// ---- beaver dams --------------------------------------------------------------------------------------------------
// From the NWI polygons with the beaver modifier (b): a pond (open water, a lily bed, or water standing all or most of
// the year) gets a dam at its outlet and, when it is big enough, a lodge; a beaver meadow that has drained (marsh, wet
// meadow, shrubs, seasonally flooded) an old dam, grassed over and breached. The outlet is where a creek leaves the
// polygon at its lowest crossing, else the polygon's lowest edge.
const LODGE_M2 = 2000;
const DAM_MIN_M2 = 400;
const DUP_M = 25;                // m: an old dam this near a live one is the same outlet
export function beaverDams(cacheDir, grid, proj, hraw, waterways, log) {
  const dir = path.join(cacheDir, 'ground', 'raw', 'nwi');
  if (!fs.existsSync(dir)) return [];
  const W = grid.width, H = grid.height;
  const hAt = (x, z) => { const i = grid.ci(x), j = grid.cj(z); return i >= 0 && j >= 0 && i < W && j < H ? hraw[j * W + i] : 32767; };
  // the waterways' walked points in 200 m buckets, with their class
  const B = 200, buckets = new Map();
  for (const c of waterways) {
    const P = c.walk || c.pts;
    for (let s = 1; s < P.length; s++) {
      const key = `${Math.floor(P[s][0] / B)},${Math.floor(P[s][1] / B)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push([c, s]);
    }
  }
  const seen = new Set(), dams = [];
  let active = 0, old = 0, lodges = 0, onRoute = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.gpk.gz')) continue;
    for (const ft of readPack(path.join(dir, f))) {
      if (seen.has(ft.key)) continue;
      seen.add(ft.key);
      const p = parseNwi(ft.a);
      if (!p || !p.mods.includes('b') || p.sys !== 'P') continue;
      const ring = ft.rings[0], m = ring.length / 2;
      if (m < 4) continue;
      const pts = new Array(m);
      for (let q = 0; q < m; q++) pts[q] = proj.toLocal(ring[q * 2 + 1], ring[q * 2]);
      let A = 0, cx = 0, cz = 0;
      for (let q = 0; q < m; q++) { const [x1, z1] = pts[q], [x2, z2] = pts[(q + 1) % m]; const cr = x1 * z2 - x2 * z1; A += cr; cx += (x1 + x2) * cr; cz += (z1 + z2) * cr; }
      A /= 2; if (Math.abs(A) < DAM_MIN_M2) continue;
      cx /= 6 * A; cz /= 6 * A; A = Math.abs(A);
      const i0 = grid.ci(cx), j0 = grid.cj(cz);
      if (i0 < 0 || j0 < 0 || i0 >= W || j0 >= H) continue;
      const pond = p.c1 === 'UB' || p.c1 === 'AB' || p.regime === 'H' || p.regime === 'F' || p.regime === 'K';
      // the lowest place a creek crosses the edge
      let best = null;
      for (let q = 0; q < m; q++) {
        const [ax, az] = pts[q], [bx, bz] = pts[(q + 1) % m];
        const keys = new Set([`${Math.floor(ax / B)},${Math.floor(az / B)}`, `${Math.floor(bx / B)},${Math.floor(bz / B)}`]);
        for (const key of keys) for (const [c, s] of buckets.get(key) || []) {
          const P = c.walk || c.pts, [px, pz] = P[s - 1], [qx, qz] = P[s];
          const d = (bx - ax) * (qz - pz) - (bz - az) * (qx - px);
          if (Math.abs(d) < 1e-9) continue;
          const t = ((px - ax) * (qz - pz) - (pz - az) * (qx - px)) / d, u = ((px - ax) * (bz - az) - (pz - az) * (bx - ax)) / d;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const x = ax + (bx - ax) * t, z = az + (bz - az) * t, h = hAt(x, z);
          if (!best || h < best.h) best = { x, z, h, yaw: Math.atan2(qx - px, qz - pz) + Math.PI / 2, c, cls: c.run ? c.run[Math.min(s, c.run.length - 1)] : 3 };
        }
      }
      if (!best) { // no creek crosses: the lowest edge
        for (let q = 0; q < m; q++) { const h = hAt(pts[q][0], pts[q][1]); if (!best || h < best.h) { const [nx, nz] = pts[(q + 1) % m]; best = { x: pts[q][0], z: pts[q][1], h, yaw: Math.atan2(nx - pts[q][0], nz - pts[q][1]), c: null, cls: 0 }; } }
      }
      const len = Math.max(6, Math.min(45, 5 + 0.12 * Math.sqrt(A)));
      const dam = { x: Math.round(best.x * 10) / 10, z: Math.round(best.z * 10) / 10, yaw: +best.yaw.toFixed(2), len: Math.round(len), old: !pond || undefined };
      if (best.c) { dam.way = best.c.id; if (pond && (best.cls === 1 || best.cls === 2)) { dam.route = true; onRoute++; } }
      // a lodge in the open water of a live pond, a third of the way from the dam to the middle
      if (pond && A >= LODGE_M2 && inside(pts, cx, cz)) {
        const lx = cx + (best.x - cx) * 0.35, lz = cz + (best.z - cz) * 0.35;
        if (inside(pts, lx, lz)) { dam.lodge = [Math.round(lx), Math.round(lz)]; lodges++; }
      }
      if (pond) active++; else old++;
      dams.push(dam);
    }
  }
  // an old dam on the same outlet as a live one (two NWI polygons, the pond and its drained meadow, share it): the live one
  const live = dams.filter((d) => !d.old), keep = [];
  let dup = 0;
  for (const d of dams) {
    if (d.old && live.some((l) => (l.x - d.x) ** 2 + (l.z - d.z) ** 2 < DUP_M * DUP_M)) { dup++; old--; continue; }
    keep.push(d);
  }
  dams.length = 0; dams.push(...keep);
  log(`wetlands: ${dup} old dams dropped on a live dam's outlet`);
  log(`wetlands: ${active} beaver dams on ponds (${lodges} lodges, ${onRoute} across a paddled creek), ${old} old dams on drained beaver meadows`);
  return dams;
}
function inside(pts, x, z) {
  let c = false;
  for (let q = 0, r = pts.length - 1; q < pts.length; r = q++) {
    const [xi, zi] = pts[q], [xj, zj] = pts[r];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// ---- each lake's place in the water ---------------------------------------------------------------------------------
// From the bake's own waterways (the NWI's lake flow codes are too sparse here to trust): for each basin, the creeks that
// leave it for somewhere lower (outflow) or come in from somewhere higher (inflow). 'chain' has both, 'headwater' only an
// outflow, 'terminal' only an inflow, 'landlocked' neither (a seepage lake).
export function lakeFlow(waterways, lakes, grid, lakeId, lakeBasin, basinLevel, lakeLevel, hraw) {
  const W = grid.width, H = grid.height, nb = basinLevel.length;
  const ins = new Uint16Array(nb), outs = new Uint16Array(nb);
  const isPond = (id) => id && !lakes[id - 1].creek && !lakes[id - 1].river;
  const basinNear = (x, z) => {
    const i0 = grid.ci(x), j0 = grid.cj(z);
    for (let r = 0; r <= 4; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= W || j >= H) continue;
      const id = lakeId[j * W + i];
      if (isPond(id)) return lakeBasin[id];
    }
    return -1;
  };
  const hAt = (x, z) => { const i = grid.ci(x), j = grid.cj(z); return i >= 0 && j >= 0 && i < W && j < H ? hraw[j * W + i] / 10 : NaN; };
  for (const c of waterways) {
    const a = c.pts[0], b = c.pts[c.pts.length - 1];
    const ba = basinNear(a[0], a[1]), bb = basinNear(b[0], b[1]);
    const la = ba >= 0 ? basinLevel[ba] : hAt(a[0], a[1]), lb = bb >= 0 ? basinLevel[bb] : hAt(b[0], b[1]);
    if (ba === bb || !(Number.isFinite(la) && Number.isFinite(lb))) continue;
    const mark = (from, other, lf, lo) => { if (from < 0) return; if (lo < lf - 0.2) outs[from]++; else if (lo > lf + 0.2) ins[from]++; else { ins[from]++; outs[from]++; } };
    mark(ba, bb, la, lb); mark(bb, ba, lb, la);
  }
  // rivers and creeks drawn as water: the basins each touches, and its own level against theirs
  const touch = new Map();
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const id = lakeId[j * W + i];
    if (!id || isPond(id)) continue;
    for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const o = lakeId[jj * W + ii];
      if (isPond(o)) { let t = touch.get(id); if (!t) touch.set(id, (t = new Set())); t.add(lakeBasin[o]); }
    }
  }
  for (const [rid, set] of touch) {
    const bs = [...set].sort((x, y) => basinLevel[y] - basinLevel[x]);
    if (bs.length === 1) { const b = bs[0], d = lakeLevel[rid] - basinLevel[b]; if (d < -0.2) outs[b]++; else if (d > 0.2) ins[b]++; continue; }
    bs.forEach((b, q) => { if (q < bs.length - 1) outs[b]++; if (q > 0) ins[b]++; });
  }
  const type = new Array(nb);
  for (let b = 0; b < nb; b++) type[b] = ins[b] && outs[b] ? 'chain' : outs[b] ? 'headwater' : ins[b] ? 'terminal' : 'landlocked';
  return type;
}
