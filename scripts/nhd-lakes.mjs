// NHDPlus HR lake outlines (2026-11-03, the owner on Cummings Lake: "NHD+ seems better"). The bake's water polygons
// come from OpenStreetMap; most US lakes there are the 2009–2010 import of the older, coarser NHD. This swaps a lake's
// OpenStreetMap rings for NHDPlus HR's (scripts/sources/nhd-hr.mjs) where the two are the same water, and adds the
// lakes and ponds NHDPlus HR has that OpenStreetMap has no water for at all.
//
// The same water: on the bake's 10 m grid, the NHD polygons with at least SAME of their cells under one OpenStreetMap
// lake are its pieces (one, or several where NHDPlus HR splits a lake: Carp Lake and its bay); together they must cover
// at least COVER of the lake's cells, else (a lake NHDPlus HR cuts at the border, Basswood, Saganaga, Lac La Croix…)
// it is left as OpenStreetMap draws it, as are the river polygons. A swapped lake
// keeps its place in the list, its OpenStreetMap id and its name, so no lake id moves (the saves' lake ids,
// src/migrate/*.json); it gains `nhd` (the NHD permanent identifier).
//
// Added: an NHD polygon with under NEW_WET of its cells on any OpenStreetMap water, not intermittent (fcode 39001), at
// least NEW_MIN cells. They go after every other polygon (osm `nhd/<id>`), so again no id before them moves.
//
//   loadNhdLakes(cacheDir, log) -> bodies | null
//   matchNhd(lakes, bodies, grid, proj, log) -> { added: [lake], report }
//     lakes: the bake's list in local metres ({ osm, name, river, creek, rings, minX, maxX, minZ, maxZ }), changed in place
import fs from 'node:fs';
import path from 'node:path';

const SAME = 0.85, COVER = 0.92, NEW_WET = 0.1, NEW_MIN = 10;

export function loadNhdLakes(cacheDir, log) {
  const f = path.join(cacheDir, 'nhd-hr', 'waterbodies.json');
  if (!fs.existsSync(f)) { log('nhd-hr: no NHDPlus HR outlines (node scripts/sources/nhd-hr.mjs): lakes as OpenStreetMap draws them'); return null; }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  log(`nhd-hr: ${j.bodies.length} NHDPlus HR waterbodies (fetched ${j.fetched})`);
  return j.bodies;
}

// even-odd scanline spans of a polygon's rings on the grid: cb(j, ia, ib) for each run of cells whose centres are inside
export function polygonSpans(rings, minZ, maxZ, grid, cb) {
  const { width, height, cell, originX, originZ } = grid;
  const j0 = Math.max(0, Math.floor((minZ - originZ) / cell)), j1 = Math.min(height - 1, Math.ceil((maxZ - originZ) / cell));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const zc = originZ + (j + 0.5) * cell;
    xs.length = 0;
    for (const rg of rings) for (let i = 0, n = rg.length; i < n; i++) {
      const [x1, z1] = rg[i], [x2, z2] = rg[(i + 1) % n];
      if ((z1 <= zc) !== (z2 <= zc)) xs.push(x1 + ((zc - z1) * (x2 - x1)) / (z2 - z1));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const ia = Math.max(0, Math.ceil((xs[k] - originX) / cell - 0.5)), ib = Math.min(width - 1, Math.floor((xs[k + 1] - originX) / cell - 0.5));
      if (ia <= ib) cb(j, ia, ib);
    }
  }
}

const boundsOf = (rings) => {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const rg of rings) for (const [x, z] of rg) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
  return { minX, maxX, minZ, maxZ };
};

export function matchNhd(lakes, bodies, grid, proj, log) {
  const { width: W, height: H, cell } = grid;
  const inGrid = (b) => !(b.maxX < grid.originX || b.minX > grid.originX + W * cell || b.maxZ < grid.originZ || b.minZ > grid.originZ + H * cell);
  // OpenStreetMap's water on the grid, by place in the list (1-based; later polygons win, as the bake draws them)
  const osmAt = new Uint16Array(W * H), osmArea = new Uint32Array(lakes.length + 1);
  lakes.forEach((l, n) => {
    if (!l.rings.length) return;
    polygonSpans(l.rings, l.minZ, l.maxZ, grid, (j, ia, ib) => { const o = j * W; for (let i = ia; i <= ib; i++) osmAt[o + i] = n + 1; });
  });
  for (let k = 0; k < osmAt.length; k++) if (osmAt[k]) osmArea[osmAt[k]]++;
  const pieces = new Map(); // place -> [{ b, rings, ov }]: the NHD polygons lying (SAME or more of them) in that lake
  const added = [];
  const report = { bodies: bodies.length, inGrid: 0, swapped: 0, pieces: 0, islandsKept: 0, added: 0, kept: { short: 0, river: 0, small: 0, intermittent: 0, partial: 0 }, swappedLakes: [] };
  for (const b of bodies) {
    const rings = b.rings.map((rg) => rg.map(([lat, lon]) => proj.toLocal(lat, lon)));
    const bounds = boundsOf(rings);
    if (!inGrid(bounds)) continue;
    report.inGrid++;
    let cells = 0, wet = 0;
    const under = new Map();
    polygonSpans(rings, bounds.minZ, bounds.maxZ, grid, (j, ia, ib) => {
      const o = j * W;
      for (let i = ia; i <= ib; i++) { cells++; const p = osmAt[o + i]; if (p) { wet++; under.set(p, (under.get(p) || 0) + 1); } }
    });
    if (!cells) continue;
    let best = 0, ov = 0;
    for (const [p, c] of under) if (c > ov) { ov = c; best = p; }
    if (best && ov >= SAME * cells) {
      const l = lakes[best - 1];
      if (l.river || l.creek) { report.kept.river++; continue; }
      if (!pieces.has(best)) pieces.set(best, []);
      pieces.get(best).push({ b, rings, ov, cells });
    } else if (wet < NEW_WET * cells) {
      if (b.fcode === 39001) { report.kept.intermittent++; continue; }
      if (cells < NEW_MIN) { report.kept.small++; continue; }
      added.push({ osm: `nhd/${b.id}`, nhd: b.id, name: b.name, river: false, rings, ...bounds });
    } else report.kept.partial++; // spread over several OpenStreetMap waters, or mostly on land
  }
  // a lake takes the union of its pieces when together they cover COVER of it (Carp Lake is two NHD polygons, the lake
  // and its US bay: either alone would drop water OpenStreetMap and the USFS have); a lake NHD cuts at the border is short
  for (const [p, list] of pieces) {
    const l = lakes[p - 1], before = osmArea[p], ov = list.reduce((s, q) => s + q.ov, 0), cells = list.reduce((s, q) => s + q.cells, 0);
    if (ov < COVER * before) { report.kept.short++; continue; }
    const rings = list.flatMap((q) => q.rings);
    // and OpenStreetMap's islands NHDPlus HR lacks (on Poplar Lake it has 17 of OpenStreetMap's 21): an OpenStreetMap hole
    // whose cells NHDPlus HR has as water is kept as a hole; one NHDPlus HR has as land already is not (two holes would
    // cancel to water)
    const keep = osmIslandsMissing(l.rings, rings, grid);
    report.islandsKept += keep.length;
    l.osmRings = l.rings; l.rings = [...rings, ...keep]; Object.assign(l, boundsOf(rings)); l.nhd = list.map((q) => q.b.id).join(',');
    report.swapped++; report.pieces += list.length;
    if (l.name || before > 2000) report.swappedLakes.push([l.name || l.osm, before, cells, list.length, Math.round((100 * ov) / Math.max(before, cells))]);
  }
  report.added = added.length;
  report.swappedLakes.sort((a, b) => b[1] - a[1]);
  log(`nhd-hr: ${report.inGrid} NHDPlus HR waterbodies on the grid; ${report.swapped} OpenStreetMap lakes take NHDPlus HR's outline (${report.pieces} NHD polygons, ${report.islandsKept} OpenStreetMap islands it lacks kept), ${report.added} lakes and ponds OpenStreetMap lacks added; kept as OpenStreetMap: ${JSON.stringify(report.kept)}`);
  return { added, report };
}

const inRing = (rg, x, z) => { let c = false; for (let a = 0, b = rg.length - 1; a < rg.length; b = a++) { const [x1, z1] = rg[a], [x2, z2] = rg[b]; if ((z1 > z) !== (z2 > z) && x < ((x2 - x1) * (z - z1)) / (z2 - z1) + x1) c = !c; } return c; };
// The holes of `osm` (rings inside an odd number of its other rings: islands) that are water in `nhd` (filled even-odd)
// over at least ISLE_WET of their cells: the islands NHDPlus HR does not have.
const ISLE_WET = 0.6;
function osmIslandsMissing(osm, nhd, grid) {
  if (osm.length < 2) return [];
  const holes = osm.filter((r, n) => { const [x, z] = r[0]; let d = 0; for (let m = 0; m < osm.length; m++) if (m !== n && inRing(osm[m], x, z)) d++; return d & 1; });
  if (!holes.length) return [];
  const W = grid.width, b = boundsOf(holes), cell = grid.cell;
  const i0 = Math.max(0, Math.floor((b.minX - grid.originX) / cell) - 1), j0 = Math.max(0, Math.floor((b.minZ - grid.originZ) / cell) - 1);
  const i1 = Math.min(W - 1, Math.ceil((b.maxX - grid.originX) / cell) + 1), j1 = Math.min(grid.height - 1, Math.ceil((b.maxZ - grid.originZ) / cell) + 1);
  if (i1 < i0 || j1 < j0) return []; // (holes off the grid)
  const bw = i1 - i0 + 1, wet = new Uint8Array(bw * (j1 - j0 + 1));
  polygonSpans(nhd, b.minZ, b.maxZ, grid, (j, ia, ib) => { if (j < j0 || j > j1) return; const o = (j - j0) * bw - i0; for (let i = Math.max(ia, i0); i <= Math.min(ib, i1); i++) wet[o + i] = 1; });
  const out = [];
  for (const h of holes) {
    const hb = boundsOf([h]);
    let n = 0, w = 0;
    polygonSpans([h], hb.minZ, hb.maxZ, grid, (j, ia, ib) => { if (j < j0 || j > j1) return; const o = (j - j0) * bw - i0; for (let i = Math.max(ia, i0); i <= Math.min(ib, i1); i++) { n++; if (wet[o + i]) w++; } });
    if (n && w >= ISLE_WET * n) out.push(h);
  }
  return out;
}

// OpenStreetMap's water round the portage ends, on the lakes that took NHDPlus HR's outline: a trail is mapped to
// OpenStreetMap's shore (its end node is often the lake's own), and where NHDPlus HR's shore stops short of a cove's head
// (Trout Lake – Lake Vermilion: 30 m) the bake carried the trail 340 m on to other water. Cells within R m of an end that
// OpenStreetMap's rings (even-odd: its islands stay land) have as water and nothing has yet become that lake's water.
export function restoreAtEnds(lakes, ends, grid, lakeId, R = 60) {
  const W = grid.width, cell = grid.cell, B = 200, buckets = new Map();
  for (const [x, z] of ends) { const k = `${Math.floor(x / B)}:${Math.floor(z / B)}`; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push([x, z]); }
  const near = (x, z) => { const i0 = Math.floor(x / B), j0 = Math.floor(z / B); for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) for (const [ex, ez] of buckets.get(`${i}:${j}`) || []) if ((ex - x) ** 2 + (ez - z) ** 2 <= R * R) return true; return false; };
  let cells = 0, n = 0;
  for (const l of lakes) {
    if (!l.osmRings) continue;
    const b = boundsOf(l.osmRings);
    const mine = ends.filter(([x, z]) => x >= b.minX - R && x <= b.maxX + R && z >= b.minZ - R && z <= b.maxZ + R);
    if (!mine.length) continue;
    let got = 0;
    for (const [ex, ez] of mine) polygonSpans(l.osmRings, ez - R, ez + R, grid, (j, ia, ib) => {
      const o = j * W, zc = grid.originZ + (j + 0.5) * cell;
      for (let i = Math.max(ia, Math.floor((ex - R - grid.originX) / cell)); i <= Math.min(ib, Math.ceil((ex + R - grid.originX) / cell)); i++) {
        const k = o + i;
        if (lakeId[k]) continue;
        const xc = grid.originX + (i + 0.5) * cell;
        if (near(xc, zc)) { lakeId[k] = l.id; got++; }
      }
    });
    if (got) { cells += got; n++; }
  }
  return { cells, lakes: n };
}

// Islands: the land inside a water polygon's holes (even ring depth of 2 or more: an island, an island in a lake on an
// island…), where nothing drew water over it. Returns a Uint16Array, the lake id of the water round each island cell.
export function islandCells(lakes, grid, lakeId) {
  const { width: W, cell, originX, originZ } = grid;
  const islandOf = new Uint16Array(lakeId.length);
  let cells = 0, polys = 0;
  for (const l of lakes) {
    if (l.creek || l.rings.length < 2) continue;
    const i0 = Math.max(0, Math.floor((l.minX - originX) / cell) - 1), i1 = Math.min(W - 1, Math.ceil((l.maxX - originX) / cell) + 1);
    const j0 = Math.max(0, Math.floor((l.minZ - originZ) / cell) - 1), j1 = Math.min(grid.height - 1, Math.ceil((l.maxZ - originZ) / cell) + 1);
    const bw = i1 - i0 + 1, depth = new Uint8Array(bw * (j1 - j0 + 1));
    for (const rg of l.rings) polygonSpans([rg], l.minZ, l.maxZ, grid, (j, ia, ib) => { const o = (j - j0) * bw - i0; for (let i = Math.max(ia, i0); i <= Math.min(ib, i1); i++) if (depth[o + i] < 255) depth[o + i]++; });
    let any = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = depth[(j - j0) * bw + i - i0], k = j * W + i;
      if (d >= 2 && !(d & 1) && !lakeId[k] && !islandOf[k]) { islandOf[k] = l.id; cells++; any = true; }
    }
    if (any) polys++;
  }
  return { islandOf, cells, polys };
}
