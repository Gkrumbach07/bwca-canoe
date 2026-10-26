#!/usr/bin/env node
// d1 rapids: the real white water and the rocks in the lakes, as a runtime table for the game (src/rapids.json).
//
//   BWCA_CACHE=/path/to/data-cache node scripts/rapids.mjs [--data public/data] [--out src/rapids.json] [--refresh]
//        [--report file.json]
//
// The sources (fetched once into <cache>/nhd-rapids/, kept there; --refresh fetches again):
// - USGS NHD for Minnesota (hosted by the MPCA): NHDPoint rapids (FCode 43100), waterfalls (48700) and rocks above the
//   water (44101); NHDLine rapids and waterfalls (short lines across the river). Public domain.
// - OpenStreetMap (ODbL, already the game's map): waterway=waterfall / rapids / cascade from the cached Minnesota extract,
//   read with osmium: the names NHD lacks (Curtain, Rebecca, Basswood, Kawishiwi Falls...).
// - USGS GNIS (geonames layer 7, class Falls and Rapids) and Geographic Names Ontario (LIO, Open Government Licence -
//   Ontario; entity Falls and Rapids): more names, and the Quetico side, which NHD stops short of.
//
// What it makes, against a release's own tiles (and its graded river levels, src/water-grade.bin), read by src/rapids.js:
// - `white`: each falls or rapids once (the NHD points and lines within 60 m joined, OSM's within 120 m, a name from
//   OSM, else GNIS, Ontario or NHD), snapped onto the game's rivers: the channel through the steepest river water near
//   it (searched outward along the river, keeping to the middle, from the lake above to the lake below), its middle
//   where its real place projects onto that channel (a falls in the lake above: at the outlet), its line across from
//   shore to shore (a, b), the way the water runs (dir: radians, atan2(dz, dx)), the drop (m), the lakes above and
//   below (the release's ids). A name the game has no river for is kept where it is, `hidden` (nothing drawn).
// - `rows`: the river levels made over so the water falls where the drops really are (the PATCH section below), as
//   runs of cell changes the tile worker applies with the bed (rapids.js patchTile), each carrying the level its first
//   cell had, so another bake's water is left alone.
// - `rocks`: NHD's rocks above the water (44101), all of those in the grid, as half-metre integers delta-coded along
//   the list (x, z, x, z, ...); the game stands those whose cell is water.
// Positions are world metres of the bake's projection (config.mjs, the bwca box); the drops, lakes and rows are this
// release's (`for` holds its bake time). A new bake (round D2) should take the PATCH step into its own grading.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { CFG, log, makeProjection, makeGrid, sleep } from './config.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', CFG.outDir).replace(/\/?$/, '/');
const outFile = arg('--out', 'src/rapids.json');
const gradeFile = arg('--grade', 'src/water-grade.bin');
const reportFile = arg('--report', null);
const refresh = process.argv.includes('--refresh');
const cache = path.join(CFG.cacheDir, 'nhd-rapids');
fs.mkdirSync(cache, { recursive: true });

const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const proj = makeProjection(index.bbox), grid = makeGrid(index.bbox, proj);
const g = index.grid;
if (grid.width !== g.width || grid.originX !== g.originX || proj.lat0 !== index.proj.lat0) throw new Error('the index grid does not match config.mjs');
const box = index.bbox, BOX = `${box.west},${box.south},${box.east},${box.north}`;

// ---- the sources ------------------------------------------------------------------------------------------------
const NHD = 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_pca/water_national_hydrography_data/FeatureServer';
const GNIS = 'https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer/7';
const ONT = 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/36';

// every feature of an ArcGIS layer in the box (paged, politely), as GeoJSON-ish { attrs, geom } in lat/lon
async function query(layer, where, fields, { geometry = true, page = 1000 } = {}) {
  const out = [];
  for (let offset = 0; ; offset += page) {
    const q = new URLSearchParams({
      where, geometry: BOX, geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: fields, returnGeometry: String(geometry), resultOffset: String(offset), resultRecordCount: String(page), orderByFields: fields.split(',')[0], f: 'json',
    });
    const res = await fetch(`${layer}/query?${q}`, { headers: { 'user-agent': CFG.ua } });
    if (!res.ok) throw new Error(`${res.status} from ${layer}`);
    const j = await res.json();
    if (j.error) throw new Error(`${layer}: ${JSON.stringify(j.error)}`);
    for (const f of j.features || []) out.push({ attrs: f.attributes, geom: f.geometry || null });
    if (!(j.features || []).length || (!j.exceededTransferLimit && j.features.length < page)) break;
    await sleep(400);
  }
  return out;
}
async function cached(name, get) {
  const file = path.join(cache, name);
  if (!refresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  log(`fetching ${name}`);
  const v = await get();
  fs.writeFileSync(file, JSON.stringify(v));
  return v;
}
const nhdPoints = await cached('nhd-points.json', () => query(`${NHD}/1`, 'fcode in (43100,48700,44101)', 'objectid,fcode,gnis_name,permanent_identifier'));
const nhdLines = await cached('nhd-lines.json', () => query(`${NHD}/4`, 'fcode in (43100,48700)', 'objectid,fcode,gnis_name,permanent_identifier'));
const gnis = await cached('gnis.json', () => query(GNIS, "gaz_featureclass in ('Falls','Rapids')", 'gaz_id,gaz_name,gaz_featureclass'));
const ontario = await cached('ontario.json', () => query(ONT, "ENTITY_TYPE in ('Falls','Rapids')", 'OGF_ID,OFFICIAL_NAME,ENTITY_TYPE,LATITUDE_DECIMAL_DEGREES,LONGITUDE_DECIMAL_DEGREES,GEONAME_STATUS', { geometry: false }));
// OSM: the extract the game is baked from, cut to the box (osm-extract.mjs caches it); osmium reads it in seconds
const osm = await cached('osm.json', () => {
  const pbf = fs.readdirSync(path.join(CFG.cacheDir, 'osm')).filter((f) => f.endsWith('.cut.osm.pbf')).map((f) => path.join(CFG.cacheDir, 'osm', f)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
  if (!pbf) throw new Error('no cut OSM extract in the cache (run the bake once)');
  const tmp = path.join(cache, 'ww.osm.pbf'), gj = path.join(cache, 'ww.geojson');
  execFileSync('osmium', ['tags-filter', '-O', '-o', tmp, pbf, 'waterway=waterfall,rapids,cascade']);
  execFileSync('osmium', ['export', '-O', '-o', gj, tmp]);
  const j = JSON.parse(fs.readFileSync(gj, 'utf8'));
  fs.rmSync(tmp); fs.rmSync(gj);
  return j.features.filter((f) => f.properties.waterway).map((f) => ({ id: f.id || f.properties['@id'] || null, kind: f.properties.waterway, name: f.properties.name || null, alt: f.properties.alt_name || f.properties.loc_name || null, height: f.properties.height || null, geom: f.geometry }));
});
log(`NHD ${nhdPoints.length} points, ${nhdLines.length} lines; OSM ${osm.length}; GNIS ${gnis.length}; Ontario ${ontario.length}`);

// ---- the release's cells, with its graded river levels ---------------------------------------------------------
const T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, n = SIDE * SIDE;
const MAGIC = 0x31524757;
const fnv = (a) => { let h = 0x811c9dc5; for (let i = 0; i < a.length; i++) { h ^= a[i] & 0xffff; h = Math.imul(h, 0x01000193); } return h >>> 0; };
// water-grade.bin (version 3: an index, then gzipped version 2 pieces): the fine tiles' records, as water-levels.js reads them
const grades = new Map();
try {
  const raw = fs.readFileSync(gradeFile), dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (dv.getUint32(0, true) === MAGIC && dv.getUint16(4, true) === 3) {
    const np = dv.getUint32(8, true);
    for (let p = 0; p < np; p++) {
      const o = 24 + p * 16;
      if (dv.getUint8(o) !== 0) continue; // far tiles: not needed here
      const off = dv.getUint32(o + 8, true), len = dv.getUint32(o + 12, true);
      const piece = zlib.gunzipSync(raw.subarray(off, off + len)), pv = new DataView(piece.buffer, piece.byteOffset, piece.byteLength);
      const count = pv.getUint32(8, true) + pv.getUint32(12, true);
      let q = 24;
      for (let r = 0; r < count; r++) {
        const level = pv.getUint8(q), tx = pv.getUint16(q + 2, true), ty = pv.getUint16(q + 4, true), hash = pv.getUint32(q + 8, true);
        const nRuns = pv.getUint32(q + 12, true), nCells = pv.getUint32(q + 16, true);
        q += 20;
        const runs = []; for (let k = 0; k < nRuns * 3; k++, q += 2) runs.push(pv.getUint16(q, true));
        const per = level ? 2 : 1, vals = new Int16Array(nCells);
        for (let a = 0, c = 0; a < runs.length; a += 3) { let p0 = 0; for (let m = 0; m < runs[a + 2]; m++, c++) { p0 += pv.getInt8(q++); vals[c] = p0; if (per === 2) q++; } }
        if (!level) grades.set(`${tx},${ty}`, { hash, runs, vals });
      }
    }
  }
} catch (e) { log(`no graded levels (${e.message}): the release's own`); }
const tiles = new Map();
const tileOf = (tx, ty) => {
  if (tx < 0 || ty < 0 || tx >= g.ntx || ty >= g.nty) return null;
  const k = ty * g.ntx + tx;
  let t = tiles.get(k);
  if (t === undefined) {
    try {
      const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}tiles/${tx}_${ty}.bin`));
      const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
      t = { h: new Int16Array(buf, 0, n), lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n), lvl: new Int16Array(buf, n * 6, n) };
      const gr = grades.get(`${tx},${ty}`);
      if (gr && fnv(t.lvl) === gr.hash) {
        let c = 0;
        for (let a = 0; a < gr.runs.length; a += 3) { const m0 = gr.runs[a] * SIDE + gr.runs[a + 1]; for (let m = m0; m < m0 + gr.runs[a + 2]; m++, c++) { t.h[m] += gr.vals[c]; t.lvl[m] += gr.vals[c]; } }
        t.graded = true;
      }
    } catch { t = null; }
    if (tiles.size > 400) tiles.clear();
    tiles.set(k, t);
  }
  return t;
};
const cellOf = (i, j) => { const t = tileOf(Math.floor(i / T), Math.floor(j / T)); return t ? [t, ((j - Math.floor(j / T) * T) + HALO) * SIDE + (i - Math.floor(i / T) * T) + HALO] : null; };
const ci = (x) => Math.floor((x - g.originX) / g.cell), cj = (z) => Math.floor((z - g.originZ) / g.cell);
const cx = (i) => g.originX + (i + 0.5) * g.cell, cz = (j) => g.originZ + (j + 0.5) * g.cell;
const lakeCell = (i, j) => { const c = cellOf(i, j); return c ? c[0].lake[c[1]] : 0; };
const sdCell = (i, j) => { const c = cellOf(i, j); return c ? c[0].sd[c[1]] / 10 : 3000; };
const lvlCell = (i, j) => { const c = cellOf(i, j); return c ? c[0].lvl[c[1]] / 10 : 0; };
const bil = (f, x, z) => {
  const fx = (x - g.originX) / g.cell - 0.5, fz = (z - g.originZ) / g.cell - 0.5, i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
  return (f(i, j) * (1 - ax) + f(i + 1, j) * ax) * (1 - az) + (f(i, j + 1) * (1 - ax) + f(i + 1, j + 1) * ax) * az;
};
const shoreAt = (x, z) => bil(sdCell, x, z);
const lakeAt = (x, z) => lakeCell(ci(x), cj(z));
// the water level at a point (grid.js levelAt: bilinear over the water corners), or null off the water
const levelAt = (x, z) => {
  const fx = (x - g.originX) / g.cell - 0.5, fz = (z - g.originZ) / g.cell - 0.5, i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
  const c = [[i, j, (1 - ax) * (1 - az)], [i + 1, j, ax * (1 - az)], [i, j + 1, (1 - ax) * az], [i + 1, j + 1, ax * az]];
  let s = 0, w = 0;
  for (const [a, b, k] of c) if (lakeCell(a, b)) { s += lvlCell(a, b) * k; w += k; }
  return w > 0 ? s / w : null;
};
const lakeRec = (id) => (id > 0 ? index.lakes[id - 1] : null);
const lakeName = (id) => { const l = lakeRec(id); return l ? l.displayName || l.name || null : null; };

// ---- the features ------------------------------------------------------------------------------------------------
const local = (lat, lon) => proj.toLocal(lat, lon);
const inGrid = (x, z, m = 0) => x > g.originX + m && z > g.originZ + m && x < g.originX + g.width * g.cell - m && z < g.originZ + g.height * g.cell - m;
const KIND = { 43100: 'rapids', 48700: 'falls' };
const raw = [];
for (const p of nhdPoints) if (KIND[p.attrs.fcode] && p.geom) { const [x, z] = local(p.geom.y, p.geom.x); raw.push({ kind: KIND[p.attrs.fcode], pts: [[x, z]], src: 'nhd', id: p.attrs.permanent_identifier, name: p.attrs.gnis_name || null }); }
for (const l of nhdLines) if (KIND[l.attrs.fcode] && l.geom && l.geom.paths) for (const path_ of l.geom.paths) raw.push({ kind: KIND[l.attrs.fcode], pts: path_.map(([lon, lat]) => local(lat, lon)), line: true, src: 'nhd', id: l.attrs.permanent_identifier, name: l.attrs.gnis_name || null });
const osmFeats = [];
for (const f of osm) {
  const kind = f.kind === 'waterfall' ? 'falls' : 'rapids';
  const coords = f.geom.type === 'Point' ? [f.geom.coordinates] : f.geom.type === 'LineString' ? f.geom.coordinates : [];
  const pts = coords.map(([lon, lat]) => local(lat, lon)).filter(([x, z]) => inGrid(x, z, 50));
  if (pts.length) osmFeats.push({ kind, pts, src: 'osm', id: f.id, name: f.name, alt: f.alt, height: f.height ? parseFloat(f.height) : null });
}
const names = [];
for (const f of gnis) if (f.geom) { const [x, z] = local(f.geom.y, f.geom.x); if (inGrid(x, z)) names.push({ kind: f.attrs.gaz_featureclass === 'Rapids' ? 'rapids' : 'falls', x, z, name: f.attrs.gaz_name, src: 'gnis' }); }
for (const f of ontario) { const a = f.attrs, [x, z] = local(a.LATITUDE_DECIMAL_DEGREES, a.LONGITUDE_DECIMAL_DEGREES); if (inGrid(x, z) && /approved|official/i.test(a.GEONAME_STATUS || 'Approved')) names.push({ kind: a.ENTITY_TYPE === 'Rapids' ? 'rapids' : 'falls', x, z, name: a.OFFICIAL_NAME, src: 'ontario' }); }

const mid = (pts) => { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const near = (a, b) => Math.min(...a.pts.flatMap((p) => b.pts.map((q) => dist(p, q))));
// NHD's points and lines of one drop (a rapids drawn as a line and a point, a falls as two lines a few metres apart)
// joined: same kind within 60 m
const JOIN = 60;
const groups = [];
for (const f of raw) {
  if (!inGrid(...mid(f.pts), 50)) continue;
  const gr = groups.find((q) => q.kind === f.kind && q.parts.some((p) => near(p, f) < JOIN));
  if (gr) gr.parts.push(f); else groups.push({ kind: f.kind, parts: [f] });
}
// an OSM feature joins the NHD drop it lies on (within 120 m), else stands as a drop of its own (a falls NHD has as a
// rapids keeps NHD's kind unless OSM names it a falls)
const OSM_JOIN = 120;
for (const f of osmFeats) {
  let best = null, bd = OSM_JOIN;
  for (const q of groups) { const d = Math.min(...q.parts.map((p) => near(p, f))); if (d < bd) { bd = d; best = q; } }
  if (best) { best.parts.push(f); if (f.kind === 'falls' && f.name) best.kind = 'falls'; } else groups.push({ kind: f.kind, parts: [f] });
}
// several OSM features of one drop (Basswood Falls is five nodes) join each other likewise
for (let a = 0; a < groups.length; a++) for (let b = groups.length - 1; b > a; b--) {
  const A = groups[a], B = groups[b];
  if (A.parts.every((p) => p.src === 'nhd') && B.parts.every((p) => p.src === 'nhd')) continue;
  const d = Math.min(...A.parts.flatMap((p) => B.parts.map((q) => near(p, q))));
  if (d < JOIN && (A.kind === B.kind || A.parts.concat(B.parts).some((p) => p.src === 'osm' && p.name && A.parts.concat(B.parts).filter((q) => q.name === p.name).length > 1))) { A.parts.push(...B.parts); if (B.kind === 'falls') A.kind = 'falls'; groups.splice(b, 1); }
}

// the names: each to the nearest drop of its kind within 250 m (or of the other kind within 125 m); a name that finds
// none is a drop of its own (it stands only if it snaps onto a river below)
for (const nm of names) {
  let best = null, bd = Infinity;
  for (const q of groups) { const d = Math.min(...q.parts.map((p) => Math.min(...p.pts.map((t) => dist(t, [nm.x, nm.z]))))) * (q.kind === nm.kind ? 1 : 2); if (d < bd) { bd = d; best = q; } }
  const part = { kind: nm.kind, pts: [[nm.x, nm.z]], src: nm.src, name: nm.name, label: true };
  if (best && bd < 250) { best.parts.push(part); if (nm.kind === 'falls') best.kind = 'falls'; } else groups.push({ kind: nm.kind, parts: [part], named: true });
}
// a drop's name: OSM's first, then GNIS's, Ontario's, NHD's own
const RANK = { osm: 0, gnis: 1, ontario: 2, nhd: 3 };
for (const q of groups) {
  const named = q.parts.filter((p) => p.name).sort((a, b) => RANK[a.src] - RANK[b.src]);
  q.name = named.length ? named[0].name : null;
  if (q.name && /rapids$/i.test(q.name)) q.kind = 'rapids'; else if (q.name && /(falls|cascade|cascades|kettle)$/i.test(q.name)) q.kind = 'falls';
  // where it really is: NHD's lines, else its points, else OSM's, else the name's (GNIS and Ontario place a name roughly)
  const by = (f) => q.parts.filter(f).flatMap((p) => p.pts);
  const at = [by((p) => p.src === 'nhd' && p.line), by((p) => p.src === 'nhd'), by((p) => p.src === 'osm'), by(() => true)].find((a) => a.length);
  q.at = mid(at);
}

// ---- snapped onto the game's rivers ---------------------------------------------------------------------------
const isRiver = (id) => { const l = lakeRec(id); return !!(l && l.river); };
// the graded water's fall at a cell: the largest difference to a water cell one or two off, per metre
function slopeCell(i, j) {
  if (!lakeCell(i, j)) return 0;
  const l = lvlCell(i, j);
  let s = 0;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const k of [1, 2]) if (lakeCell(i + di * k, j + dj * k)) s = Math.max(s, Math.abs(l - lvlCell(i + di * k, j + dj * k)) / (10 * k));
  return s;
}
// the river cell within r of p where the water runs steepest (nearer ones first), else the nearest river cell
function seedNear(px, pz, r = 130) {
  const i0 = ci(px), j0 = cj(pz), R = Math.ceil(r / g.cell);
  let best = null, bs = 0, near_ = null, nd = Infinity;
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
    const i = i0 + di, j = j0 + dj, id = lakeCell(i, j);
    if (!id || !isRiver(id)) continue;
    const x = cx(i), z = cz(j), d = Math.hypot(x - px, z - pz);
    if (d > r) continue;
    if (d < nd) { nd = d; near_ = [x, z]; }
    const s = slopeCell(i, j) * Math.exp(-d / 70);
    if (s > bs) { bs = s; best = [x, z]; }
  }
  return bs > 0.004 ? { at: best, steep: true } : near_ ? { at: near_, steep: false } : null;
}
// The channel through a river cell: the river's cells round it (out to `R` m along the water) searched outward from it,
// a step costing more the shallower the cell (so the way keeps to the middle of the channel); its ends are where it
// meets a lake (a mouth: the lake's level) or the edge of the search (the cell's own level). The channel runs from the
// highest end through the cell to the lowest, smoothed and taken every 5 m: [{ s, x, z, l, id, river }], s = 0 at the
// cell, increasing downstream (each end one sample into its lake, when it is a mouth). null when it has no fall and
// no second end.
function channel(sx, sz, R = 450) {
  const i0 = ci(sx), j0 = cj(sz), N = Math.ceil(R / g.cell) + 2, side = 2 * N + 1, M = side * side;
  const key = (i, j) => (j - j0 + N) * side + (i - i0 + N);
  const cost = new Float64Array(M).fill(Infinity), from = new Int32Array(M).fill(-1), done = new Uint8Array(M);
  const heap = [[0, key(i0, j0)]];
  cost[key(i0, j0)] = 0;
  const ends = [];
  const push = (c, k) => { heap.push([c, k]); let n = heap.length - 1; while (n > 0) { const p = (n - 1) >> 1; if (heap[p][0] <= heap[n][0]) break; [heap[p], heap[n]] = [heap[n], heap[p]]; n = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let n = 0; for (;;) { const l = 2 * n + 1, r = l + 1; let m = n; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === n) break; [heap[m], heap[n]] = [heap[n], heap[m]]; n = m; } } return top; };
  while (heap.length) {
    const [c, k] = pop();
    if (done[k]) continue;
    done[k] = 1;
    const i = (k % side) + i0 - N, j = Math.floor(k / side) + j0 - N;
    let mouth = null;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const a = i + di, b = j + dj, id = lakeCell(a, b);
      if (!id) continue;
      if (!isRiver(id)) { if (!mouth) mouth = { id, l: lvlCell(a, b), x: cx(a), z: cz(b) }; continue; }
      if (Math.abs(a - i0) >= N || Math.abs(b - j0) >= N) continue;
      const q = key(a, b);
      if (done[q]) continue;
      const step = Math.hypot(di, dj) * g.cell, deep = Math.max(0, -sdCell(a, b));
      const nc = c + step * (1 + 4 / (1 + deep));
      if (nc < cost[q]) { cost[q] = nc; from[q] = k; push(nc, q); }
    }
    const d = Math.hypot(cx(i) - sx, cz(j) - sz);
    if (mouth || d >= R - 2 * g.cell) ends.push({ k, i, j, l: mouth ? mouth.l : lvlCell(i, j), mouth, d });
  }
  if (ends.length < 1) return null;
  // the highest end and the lowest (a mouth's level is its lake's), the lowest one apart from the highest
  ends.sort((p, q) => q.l - p.l || p.d - q.d);
  const top = ends[0];
  const low = ends.filter((e) => e !== top && (Math.hypot(cx(e.i) - cx(top.i), cz(e.j) - cz(top.j)) > 15 || (e.mouth && top.mouth && e.mouth.id !== top.mouth.id))).sort((p, q) => p.l - q.l || p.d - q.d)[0];
  if (!low) return null;
  const walk = (k) => { const out = []; for (let n = k; n >= 0; n = from[n]) out.push(n); return out; }; // the cells from k back to the start
  const cellsUp = walk(top.k), cellsDown = walk(low.k);
  const keys = [...cellsUp, ...cellsDown.reverse().slice(1)]; // top -> start -> low
  let pts = keys.map((k) => [(k % side) + i0 - N, Math.floor(k / side) + j0 - N]).map(([i, j]) => [cx(i), cz(j)]);
  if (top.mouth) pts.unshift([top.mouth.x, top.mouth.z]);
  if (low.mouth) pts.push([low.mouth.x, low.mouth.z]);
  // smoothed (a running mean over 5 cells, the ends kept), then every 5 m
  pts = pts.map((p, n) => { if (n === 0 || n === pts.length - 1) return p; let x = 0, z = 0, w = 0; for (let m = Math.max(0, n - 2); m <= Math.min(pts.length - 1, n + 2); m++) { x += pts[m][0]; z += pts[m][1]; w++; } return [x / w, z / w]; });
  const out = [];
  let acc = 0, sStart = 0;
  for (let n = 0; n < pts.length; n++) {
    if (n) acc += dist(pts[n - 1], pts[n]);
    if (n === cellsUp.length - 1 + (top.mouth ? 1 : 0)) sStart = acc; // the start cell's place along the way
    pts[n].s = acc;
  }
  for (let s = 0; s <= acc; s += 5) {
    let n = 1;
    while (n < pts.length - 1 && pts[n].s < s) n++;
    const p = pts[n - 1], q = pts[n], t = q.s > p.s ? Math.min(1, (s - p.s) / (q.s - p.s)) : 0;
    const x = p[0] + (q[0] - p[0]) * t, z = p[1] + (q[1] - p[1]) * t, id = lakeAt(x, z);
    out.push({ s: s - sStart, x, z, l: levelAt(x, z), id, river: isRiver(id) });
  }
  out.top = top.l; out.low = low.l; out.topLake = top.mouth ? top.mouth.id : 0; out.lowLake = low.mouth ? low.mouth.id : 0;
  return out;
}
// from (x, z) along (ux, uz) while on the water: the distance to the shore (sd 0), up to max
function toShore(x, z, ux, uz, max = 200) {
  let prev = shoreAt(x, z);
  if (prev >= 0) return 0;
  for (let s = 1; s <= max; s += 1) {
    const q = shoreAt(x + ux * s, z + uz * s);
    if (q >= 0) return s - 1 + (-prev) / Math.max(1e-6, q - prev);
    prev = q;
  }
  return max;
}
// a polyline's point at arc length s, and its unit tangent there (over +-8 m)
function along(path, s) {
  let k = 1;
  while (k < path.length - 1 && path[k].s < s) k++;
  const p = path[k - 1], q = path[k], t = q.s > p.s ? Math.min(1, Math.max(0, (s - p.s) / (q.s - p.s))) : 0;
  return [p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t];
}
function tangent(path, s) {
  const a = along(path, s - 8), b = along(path, s + 8), d = dist(a, b) || 1;
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
}
// the nearest point of a polyline to p: { s, d }
function project(path, p, s0 = -Infinity, s1 = Infinity) {
  let best = { s: path[0].s, d: Infinity };
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    if (b.s < s0 || a.s > s1) continue;
    const ex = b.x - a.x, ez = b.z - a.z, L2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a.x) * ex + (p[1] - a.z) * ez) / L2));
    const d = Math.hypot(a.x + ex * t - p[0], a.z + ez * t - p[1]);
    if (d < best.d) best = { s: a.s + (b.s - a.s) * t, d };
  }
  return best;
}

// Each drop on its channel: the channel traced up and down from the steepest river water near where the sources put it,
// the drop's middle where its real place projects onto that channel (a falls in the lake above at its outlet), the line
// across there from shore to shore, and the way the water runs.
const SNAP = { reach: 130, far: 150 };
const drops = [];
for (const q of groups) {
  const seed = seedNear(q.at[0], q.at[1], SNAP.reach);
  if (!seed) { q.miss = 'no river within reach'; continue; }
  const [sx, sz] = seed.at;
  const path = channel(sx, sz);
  if (!path || path.length < 3) { q.miss = 'no channel'; continue; }
  const pr = project(path, q.at);
  if (pr.d > SNAP.far) { q.miss = `${Math.round(pr.d)} m off the channel`; continue; }
  const rivers = path.filter((p) => p.river), sMin = rivers[0].s, sMax = rivers.at(-1).s;
  const s = Math.min(sMax - 2, Math.max(sMin + 2, pr.s));
  let [mx, mz] = along(path, s);
  const [tx, tz] = tangent(path, s);
  let ux = -tz, uz = tx;
  // re-centre across the channel, then the ends at the shores
  const sa = toShore(mx, mz, -ux, -uz), sb = toShore(mx, mz, ux, uz), shift = (sb - sa) / 2;
  if (Math.abs(shift) < 40) { mx += ux * shift; mz += uz * shift; }
  const ha = toShore(mx, mz, -ux, -uz), hb = toShore(mx, mz, ux, uz);
  drops.push({ q, path, s, x: mx, z: mz, dir: Math.atan2(tz, tx), a: [mx - ux * ha, mz - uz * ha], b: [mx + ux * hb, mz + uz * hb], width: ha + hb, off: pr.d, steep: seed.steep });
  if (process.env.DEBUG && q.name && q.name.includes(process.env.DEBUG)) console.log(q.name, 'at', q.at.map(Math.round), 'seed', seed, 's', s.toFixed(1), 'top', path.top, path.topLake, 'low', path.low, path.lowLake, '\n', path.map((p) => `${p.s}:${p.l == null ? '-' : p.l.toFixed(1)}${p.river ? '' : 'L' + p.id}@${Math.round(p.x)},${Math.round(p.z)}`).join(' '));
}

// ---- the drop made where it really is ---------------------------------------------------------------------------
// The graded levels (water-grade.mjs) spread each step of the bake into a gentle ramp (half a per cent) or kept it at a
// portage, wherever that was; the real falls and rapids are somewhere else. The drops on one channel are taken together
// (a chain: each lies within 30 m of the channel of the first), and along that channel, out to `reach` past the first
// and the last (or to the lake it leaves or enters), the water keeps its levels at the two ends and takes its fall at
// the drops: only `gentle` per metre (at most `share` of the fall) between them, the rest shared among the drops (a
// falls twice a rapids' share), a falls all at its line (the cells either side of it a step apart: the water drawn
// bilinear makes that a slope of one cell, 10 m), a rapids over a run `run` long (its fall over it at most
// run.slope, the runs kept apart). Every river cell of the channel takes the level of its place along it (the bed with
// it: the depth is kept); lakes never change.
const PATCH = { reach: 220, gentle: 0.002, share: 0.25, minDrop: 0.3, pad: 12, near: 30, weight: { falls: 2, rapids: 1 }, run: { slope: 0.07, min: 25, max: 90 }, falls: { most: 10, cascade: 0.3 } };
const patched = new Map(); // global cell k -> the level (dm) a chain has given it (later chains build on earlier ones)
const lvlNow = (i, j) => { const k = j * g.width + i; return patched.has(k) ? patched.get(k) / 10 : lvlCell(i, j); };
const white = [];
const chains = [];
for (const d of drops) {
  const c = chains.find((ch) => project(ch.path, [d.x, d.z]).d < PATCH.near);
  if (c) c.members.push(d); else chains.push({ path: d.path, members: [d] });
}
const changesAll = [];
for (const ch of chains) {
  const { path } = ch;
  for (const d of ch.members) d.sc = project(path, [d.x, d.z]).s;
  ch.members.sort((a, b) => a.sc - b.sc);
  const rivers = path.filter((p) => p.river);
  const s0 = ch.members[0].sc, s1 = ch.members.at(-1).sc;
  const sa = Math.max(rivers[0].s - 2.5, s0 - PATCH.reach), sb = Math.min(rivers.at(-1).s + 2.5, s1 + PATCH.reach);
  // the levels at the ends (as chains before this one left them): the lake's at a mouth, else the river cell's own
  const lvAt = (s) => { const [x, z] = along(path, s), i = ci(x), j = cj(z); return lakeCell(i, j) ? lvlNow(i, j) : levelAt(x, z); };
  const La = sa <= rivers[0].s - 2 && path.top != null && !path[0].river ? path.top : lvAt(sa);
  const Lb = sb >= rivers.at(-1).s + 2 && path.low != null && !path.at(-1).river ? path.low : lvAt(sb);
  const D = La - Lb;
  const upLake = path.topLake || lakeAt(...along(path, sa)), downLake = path.lowLake || lakeAt(...along(path, sb));
  const outs = ch.members.map((d) => ({
    kind: d.q.kind, name: d.q.name, x: d.x, z: d.z, a: d.a, b: d.b, dir: d.dir, drop: 0, width: d.width,
    up: upLake, down: downLake, src: [...new Set(d.q.parts.map((p) => p.src))], off: d.off, cells: 0, sc: d.sc,
  }));
  white.push(...outs);
  if (!(D >= PATCH.minDrop)) { for (const o of outs) o.flat = true; continue; }
  // the drops' shares, and each rapids' run (kept within half the gap to its neighbours and inside the reach)
  const len = sb - sa, gentle = Math.min(D * PATCH.share, PATCH.gentle * len), main = D - gentle;
  const wsum = outs.reduce((s, o) => s + PATCH.weight[o.kind], 0);
  outs.forEach((o, n) => {
    o.drop = (main * PATCH.weight[o.kind]) / wsum;
    const lo = n ? (outs[n - 1].sc + o.sc) / 2 : sa + 2, hi = n < outs.length - 1 ? (outs[n + 1].sc + o.sc) / 2 : sb - 2;
    if (o.kind === 'falls') {
      // a falls takes at most falls.most in its one step; the rest goes down a cascade below it, at most falls.cascade a metre
      o.step = Math.min(o.drop, PATCH.falls.most); o.below = o.drop - o.step;
      o.c1 = Math.max(o.sc + 1, Math.min(hi, o.sc + Math.max(10, o.below / PATCH.falls.cascade)));
      return;
    }
    {
      const want = Math.max(PATCH.run.min, Math.min(PATCH.run.max, o.drop / PATCH.run.slope));
      let r0 = o.sc - want / 2, r1 = o.sc + want / 2;
      if (r0 < lo) { r1 = Math.min(hi, r1 + lo - r0); r0 = lo; }
      if (r1 > hi) { r0 = Math.max(lo, r0 - (r1 - hi)); r1 = hi; }
      o.r0 = r0; o.r1 = Math.max(r1, r0 + 1);
      o.run = [o.r0 - o.sc, o.r1 - o.sc];
    }
  });
  const prof = (s) => {
    let l = La - (gentle * Math.min(1, Math.max(0, (s - sa) / len)));
    for (const o of outs) {
      if (o.kind === 'falls') l -= o.step * (s >= o.sc ? 1 : 0) + o.below * Math.min(1, Math.max(0, (s - o.sc) / (o.c1 - o.sc)));
      else l -= o.drop * Math.min(1, Math.max(0, (s - o.r0) / (o.r1 - o.r0)));
    }
    return l;
  };
  // the channel's river cells: within the half width and a pad of the channel between the reach's ends, of a river the
  // channel runs through
  const seg = path.filter((p) => p.s >= sa - 5 && p.s <= sb + 5);
  const ids = new Set(seg.filter((p) => p.river).map((p) => p.id));
  const halfW = (s) => { const [x, z] = along(path, s), [tx, tz] = tangent(path, s); return Math.max(toShore(x, z, -tz, tx, 120), toShore(x, z, tz, -tx, 120)); };
  const widths = seg.map((p) => halfW(p.s));
  let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
  seg.forEach((p, k) => { const r = widths[k] + PATCH.pad; xmin = Math.min(xmin, p.x - r); xmax = Math.max(xmax, p.x + r); zmin = Math.min(zmin, p.z - r); zmax = Math.max(zmax, p.z + r); });
  const changes = [];
  for (let j = cj(zmin); j <= cj(zmax); j++) for (let i = ci(xmin); i <= ci(xmax); i++) {
    const id = lakeCell(i, j);
    if (!id || !ids.has(id)) continue;
    const pr = project(path, [cx(i), cz(j)], sa, sb);
    if (!(pr.s > sa + 0.5 && pr.s < sb - 0.5)) continue;
    const k = seg.findIndex((q2) => q2.s >= pr.s), w = widths[Math.max(0, k)] ?? 30;
    if (pr.d > w + PATCH.pad) continue;
    // near a falls the step follows the falls's own straight line across (the channel's bends drew it as a zigzag)
    let sAt = pr.s;
    for (const d of ch.members) {
      if (d.q.kind !== 'falls') continue;
      const ux = Math.cos(d.dir), uz = Math.sin(d.dir), dx = cx(i) - d.x, dz = cz(j) - d.z, sl = dx * ux + dz * uz, ul = -dx * uz + dz * ux;
      if (Math.abs(sl) < 15 && Math.abs(ul) < d.width / 2 + 15) { sAt = d.sc + sl; break; }
    }
    const now = Math.round(lvlNow(i, j) * 10), want = Math.round(prof(sAt) * 10);
    if (want !== now) changes.push([i, j, want - now, now]);
  }
  for (const [i, j, dv, now] of changes) patched.set(j * g.width + i, now + dv);
  changesAll.push(...changes);
  for (const o of outs) o.cells = changes.length;
  if (process.env.DEBUG && outs.some((o) => o.name && o.name.includes(process.env.DEBUG))) console.log('chain', outs.map((o) => `${o.kind} ${o.name} s ${o.sc.toFixed(0)} drop ${o.drop.toFixed(2)}`), { sa, sb, La, Lb, D, gentle, cells: changes.length });
}

// a falls's drawn drop is its one step (the cascade below it is the water's own slope)
for (const o of white) if (o.kind === 'falls' && o.step != null) { o.cascade = o.below; o.drop = o.step; }
// the named drops the game has no river for (the Quetico side's creeks, a falls on a stream the map leaves out): their
// names where they are, nothing drawn
for (const q of groups) if (q.miss && q.name && inGrid(q.at[0], q.at[1], 50)) white.push({ kind: q.kind, name: q.name, x: q.at[0], z: q.at[1], a: null, b: null, dir: 0, drop: 0, width: 0, up: lakeAt(...q.at), down: 0, src: [...new Set(q.parts.map((p) => p.src))], off: 0, cells: 0, hidden: true });
// one name once: two drops of one name within 500 m (OSM marks some falls twice, a falls in two channels) keep it on the
// bigger drop
for (const o of white) for (const p of white) if (o !== p && o.name && o.name === p.name && Math.hypot(o.x - p.x, o.z - p.z) < 500) { const keep = (o.hidden ? 0 : 1) * 100 + o.drop >= (p.hidden ? 0 : 1) * 100 + p.drop ? o : p; (keep === o ? p : o).name = null; }

// The changes as rows the tile worker applies (rapids.js patchTile): runs of cells along a grid row, cut wherever a
// tile's cells (with its halo) begin or end, so each run lies wholly inside or wholly outside any tile, each carrying
// the level its first cell had (dm): a tile whose cell holds another level (another bake) leaves the run alone.
// A run: [j, i0, level0, change0, change1, ...] (dm). Later drops' changes to a cell are summed with earlier ones.
const net = new Map(); // k -> { i, j, d, base }
for (const [i, j, dv, now] of changesAll) {
  const k = j * g.width + i, e = net.get(k);
  if (e) e.d += dv; else net.set(k, { i, j, d: dv, base: now });
}
const cut = (i) => { const m = ((i % T) + T) % T; return m === T - HALO || m === HALO; };
const cells = [...net.values()].filter((e) => e.d !== 0).sort((a, b) => a.j - b.j || a.i - b.i);
const rows = [];
for (const e of cells) {
  const r = rows.at(-1);
  if (r && r[0] === e.j && r[1] + (r.length - 3) === e.i && !cut(e.i)) r.push(e.d);
  else rows.push([e.j, e.i, e.base, e.d]);
}

// ---- the rocks ---------------------------------------------------------------------------------------------------
// NHD's rocks above the water, all of them in the grid, one per 4 m (NHD has the odd one twice): the game stands each one
// where its cell is water (rapids.js), so the Quetico side's (two thirds of them: NHD maps the border lakes, the game's
// Minnesota extract has no water there yet) come in with a bake that has those lakes. Counted here: how many lie on
// this release's water.
const rocks = [];
let rocksDup = 0;
for (const p of nhdPoints) {
  if (p.attrs.fcode !== 44101 || !p.geom) continue;
  const [x, z] = local(p.geom.y, p.geom.x);
  if (inGrid(x, z, 30)) rocks.push({ x, z });
}
rocks.sort((a, b) => a.z - b.z || a.x - b.x);
const keptRocks = [];
for (const r of rocks) { if (keptRocks.some((q) => Math.abs(q.z - r.z) < 4 && Math.hypot(q.x - r.x, q.z - r.z) < 4)) { rocksDup++; continue; } keptRocks.push(r); }
const rocksWet = keptRocks.filter((r) => shoreAt(r.x, r.z) < 1.5).length;
// half-metre integers, delta-coded: x0, z0, x1 - x0, z1 - z0, ...
const xz = [];
{ let px = 0, pz = 0; for (const r of keptRocks) { const qx = Math.round(r.x * 2), qz = Math.round(r.z * 2); xz.push(qx - px, qz - pz); px = qx; pz = qz; } }

// ---- out ---------------------------------------------------------------------------------------------------------
white.sort((p, q) => p.z - q.z || p.x - q.x);
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;
const table = {
  for: index.source.baked,
  source: 'USGS NHD (Minnesota, via the MPCA: rapids, waterfalls and rocks above the water); names from OpenStreetMap (ODbL), USGS GNIS and Geographic Names Ontario (Open Government Licence - Ontario). scripts/rapids.mjs',
  white: white.map((w) => ({
    kind: w.kind, name: w.name, x: r1(w.x), z: r1(w.z), ...(w.a ? { a: w.a.map(r1), b: w.b.map(r1) } : {}), dir: r3(w.dir), drop: r1(w.drop), up: w.up || 0, down: w.down || 0,
    ...(w.run ? { run: w.run.map(r1) } : {}), ...(w.cascade > 0.05 ? { cascade: r1(w.cascade) } : {}), ...(w.flat ? { flat: 1 } : {}), ...(w.hidden ? { hidden: 1 } : {}), src: w.src.join('+'),
  })),
  rows,
  rocks: { q: 0.5, xz },
};
fs.writeFileSync(outFile, JSON.stringify(table));
const size = fs.statSync(outFile).size, gz = zlib.gzipSync(fs.readFileSync(outFile)).length;
log(`${white.length} falls and rapids (${white.filter((w) => w.kind === 'falls').length} falls, ${white.filter((w) => w.name).length} named, ${white.filter((w) => w.flat).length} on level water, ${white.filter((w) => w.hidden).length} named where the game has no river); ${cells.length} river cells re-levelled in ${rows.length} runs; ${keptRocks.length} rocks (${rocksWet} on this release's water, ${rocksDup} twice) -> ${outFile} ${(size / 1024).toFixed(1)} KB (${(gz / 1024).toFixed(1)} KB gzipped)`);
const misses = groups.filter((q) => q.miss);
if (misses.length) log(`${misses.length} not on a river: ${misses.map((q) => `${q.name || q.kind} (${q.parts.map((p) => p.src).join('+')}: ${q.miss})`).join('; ')}`);
if (reportFile) {
  fs.writeFileSync(reportFile, JSON.stringify(white.map((w) => ({ ...w, upName: lakeName(w.up), downName: lakeName(w.down), width: r1(w.width), off: r1(w.off), lat: proj.toLatLon(w.x, w.z) })), null, 1));
  log(`report -> ${reportFile}`);
}
