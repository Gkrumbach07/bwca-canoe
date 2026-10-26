#!/usr/bin/env node
// Source stream D1-quetico-lakes, part 2: every lake's own water colour.
//
// The bake gives each lake a Secchi depth from the DNR (272 lakes measured, the rest guessed from neighbours,
// clarity.mjs). The UMN LakeBrowser (Remote Sensing and Geospatial Analysis Lab, from Landsat and Sentinel-2)
// has, for 1,300-odd Minnesota lake basins in the box, a summer clarity (2018-2024 mean Secchi, m) and a
// late-summer CDOM (a440, the tea-brown stain of bog water, m^-1) and chlorophyll-a (ug/L) for every year since
// 2017. Its pixel rasters also reach across the border, so Quetico's lakes are sampled from those.
//
// For each water polygon the bake would draw from the merged Minnesota + Ontario extract (quetico-osm.mjs),
// in the bake's own order and rasterization, this works out secchi, cdom and chla and says where each came
// from: "lake" (LakeBrowser basin values, cell-weighted over the basins it overlaps), "dnr" (the bake's
// DNR in-situ Secchi, where LakeBrowser has none), "pixel" (the median of late-summer pixels at 1-3 interior
// points), or "near" (estimated from measured lakes within 15 km, with the size trend the measured lakes show).
//
//   data-cache/lake-colour/
//     lakebrowser-lakes-<key>.json     the LakeBrowser basins in the box with the values used (cache)
//     pixel-samples.jsonl              every identify answer, one line per point and service (resumable)
//     lake-colour-<key>.json           the table, keyed by osm id (and by the bake id the merged extract gives)
//     <tx>_<ty>.secchi.bin, .cdom.bin  per-cell bytes for water cells, basin by basin (bays differ)
//     manifest.json                    channels, legend, citation, the table's fields
//   shots/d1-quetico/colour-*.png      quick looks: secchi and cdom, the whole box and Lake One
//
// Usage: node scripts/sources/lake-colour.mjs [--area bwca] [--tiles x0-x1,y0-y1] [--no-pixels] [--no-shots]
//   --tiles samples pixels only for lakes touching those tiles and writes only those tiles (testing).
// Idempotent: the LakeBrowser pull and every pixel answer are cached; rerunning rebuilds the products.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { PNG } from 'pngjs';
import { CFG, AREAS, log, sleep } from '../config.mjs';
import { loadClarity } from '../clarity.mjs';
import { bakeGrid, boxKey, parseTiles } from './quetico-osm.mjs';

const SRC = 'lake-colour';
const LB = 'https://gis7.uspatial.umn.edu/arcgis/rest/services/LakeBrowser';
const LAKE_SERVICE = 'LakeBrowser_nrt_clarity_lake'; // every lake layer carries every field; the annual layer is used
const PIXEL_SERVICES = { secchi: 'LakeBrowser_nrt_clarity_pixel', cdom: 'LakeBrowser_nrt_cdom_pixel' };
const MONTHS = ['07', '08', '09']; // late summer, as the lake values (Jul 20 - Sep 20)
const PAGE = 250;
const MIN_PIXEL_CELLS = 400;  // 4 ha: smaller lakes are estimated
const MIN_INTERIOR_M = 45;    // a 30 m Landsat pixel needs water all round
const NEAR_KM = 15;
const CALIBRATION = 80;       // LakeBrowser lakes also sampled by pixel, to put both on one scale

// value encodings for the per-cell channels
const ENC = { secchi: 10, cdom: 20 }; // byte = round(value * ENC), 0 = not water

function parseArgs(argv) {
  const o = { area: 'bwca', tiles: null, pixels: true, shots: true, concurrency: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--area') o.area = argv[++i];
    else if (a === '--tiles') o.tiles = parseTiles(argv[++i]);
    else if (a === '--no-pixels') o.pixels = false;
    else if (a === '--no-shots') o.shots = false;
    else if (a === '--concurrency') o.concurrency = Math.max(1, Math.min(4, +argv[++i] || 2));
    else if (a === '--help') { console.log('node scripts/sources/lake-colour.mjs [--area bwca] [--tiles x0-x1,y0-y1] [--no-pixels] [--no-shots]'); process.exit(0); }
  }
  return o;
}

async function getJson(url) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': CFG.ua } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
      return j;
    } catch (e) { lastErr = e; await sleep(1500 * 2 ** attempt); }
  }
  throw lastErr;
}
const median = (a) => { const v = a.filter((x) => x > 0 && Number.isFinite(x)).sort((p, q) => p - q); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const r2 = (v) => (v == null ? null : +v.toFixed(2));

// ---------- LakeBrowser basins ----------------------------------------------------------------------------

async function loadLakeBrowser(dir, box) {
  const file = path.join(dir, `lakebrowser-lakes-${boxKey(box)}.json`);
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); } catch {}
  const svc = await getJson(`${LB}/${LAKE_SERVICE}/MapServer?f=json`);
  const layer = svc.layers.find((l) => /^clarity_lake_\d{4}$/.test(l.name));
  const meta = await getJson(`${LB}/${LAKE_SERVICE}/MapServer/${layer.id}?f=json`);
  const names = meta.fields.map((f) => f.name);
  const yearly = names.filter((n) => /^model_(sdm|cdom|chla)_\d{4}_0720_0920$/.test(n));
  const fields = ['objectid', 'unmlknum', 'dowlknum_1', 'rname_1', 'polyacres', 'clarity_summer_2018_2024', 'clarity_summer_2018_2020', ...yearly].filter((n) => names.includes(n));
  log(`LakeBrowser: layer ${layer.name} (${layer.id}), ${yearly.length} late-summer yearly fields`);
  const lakes = [];
  for (let offset = 0; ; offset += PAGE) {
    const q = new URLSearchParams({
      where: '1=1', geometry: `${box.west},${box.south},${box.east},${box.north}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: fields.join(','), outSR: '4326', orderByFields: 'objectid', resultOffset: String(offset), resultRecordCount: String(PAGE), f: 'geojson',
    });
    const j = await getJson(`${LB}/${LAKE_SERVICE}/MapServer/${layer.id}/query?${q}`);
    const feats = j.features || [];
    for (const f of feats) {
      const p = f.properties || {}, g = f.geometry;
      const polys = !g ? [] : g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
      const rings = [];
      for (const poly of polys) for (const ring of poly) rings.push(ring.map(([lon, lat]) => [+lat.toFixed(6), +lon.toFixed(6)]));
      if (!rings.length) continue;
      const yr = (kind) => { const o = {}; for (const n of yearly) { const m = n.match(new RegExp(`^model_${kind}_(\\d{4})_0720_0920$`)); if (m && p[n] > 0) o[m[1]] = +(+p[n]).toFixed(3); } return o; };
      const sdm = yr('sdm'), cdom = yr('cdom'), chla = yr('chla');
      const secchi = p.clarity_summer_2018_2024 > 0 ? p.clarity_summer_2018_2024 : median(Object.values(sdm)) || (p.clarity_summer_2018_2020 > 0 ? p.clarity_summer_2018_2020 : null);
      lakes.push({
        lb: p.unmlknum || String(p.objectid), dow: p.dowlknum_1 || null, name: p.rname_1 || null, acres: p.polyacres ? +(+p.polyacres).toFixed(1) : null,
        secchi: r2(secchi), cdom: r2(median(Object.values(cdom))), chla: r2(median(Object.values(chla))),
        years: { sdm, cdom, chla }, clarity2018_2020: p.clarity_summer_2018_2020 > 0 ? +p.clarity_summer_2018_2020 : null, rings,
      });
    }
    log(`LakeBrowser: ${lakes.length} basins`);
    const more = (j.properties && j.properties.exceededTransferLimit) || feats.length === PAGE;
    if (!feats.length || !more) break;
    await sleep(500);
  }
  const out = { box, service: `${LB}/${LAKE_SERVICE}/MapServer/${layer.id}`, layer: layer.name, fetched: new Date().toISOString(), lakes };
  await fsp.writeFile(file, JSON.stringify(out));
  return out;
}

// ---------- the bake's water polygons, rasterized as the bake does ----------------------------------------

// bake.mjs: osm.lakes (in order, inside the grid), then waterway centrelines as creeks; creeks rasterized
// first, then the polygons (even-odd scanline), so ids and cells match a bake of the same extract.
function bakeWater(osm, g) {
  const { grid, proj } = g;
  const { width: W, height: H, cell } = grid;
  const lakes = [];
  const inGrid = (minX, maxX, minZ, maxZ) => !(maxX < grid.originX || minX > grid.originX + W * cell || maxZ < grid.originZ || minZ > grid.originZ + H * cell);
  for (const l of osm.lakes) {
    const rings = l.rings.map((rg) => rg.map(([lat, lon]) => proj.toLocal(lat, lon)));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const rg of rings) for (const [x, z] of rg) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
    if (!inGrid(minX, maxX, minZ, maxZ)) continue;
    lakes.push({ osm: l.osm, name: l.name, river: !!l.river, rings, minX, maxX, minZ, maxZ });
  }
  const creeks = [];
  for (const w of osm.waterways || []) {
    const pts = w.pts.map(([lat, lon]) => proj.toLocal(lat, lon));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
    if (!inGrid(minX, maxX, minZ, maxZ)) continue;
    const c = { osm: `way/${w.id}`, name: w.name || null, kind: w.kind, river: true, creek: true, rings: [], pts, minX, maxX, minZ, maxZ };
    creeks.push(c); lakes.push(c);
  }
  lakes.forEach((l, i) => { l.id = i + 1; });
  const lakeId = new Uint16Array(W * H);
  for (const c of creeks) {
    const hw = c.kind === 'stream' ? 7.5 : 11;
    for (let s = 1; s < c.pts.length; s++) {
      const [x1, z1] = c.pts[s - 1], [x2, z2] = c.pts[s];
      const i0 = Math.max(0, grid.ci(Math.min(x1, x2) - hw)), i1 = Math.min(W - 1, grid.ci(Math.max(x1, x2) + hw));
      const j0 = Math.max(0, grid.cj(Math.min(z1, z2) - hw)), j1 = Math.min(H - 1, grid.cj(Math.max(z1, z2) + hw));
      const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) {
        const cz = grid.cz(j);
        for (let i = i0; i <= i1; i++) {
          const cx = grid.cx(i);
          const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cz - z1) * dz) / L2));
          const px = x1 + dx * t, pz = z1 + dz * t;
          if ((cx - px) * (cx - px) + (cz - pz) * (cz - pz) <= hw * hw) lakeId[j * W + i] = c.id;
        }
      }
    }
  }
  for (const lake of lakes) if (lake.rings.length) scanPolygon(lake.rings, lake.minZ, lake.maxZ, grid, (k) => { lakeId[k] = lake.id; });
  return { lakes, lakeId };
}

// even-odd scanline over the grid, as bake.mjs rasterizeLakes; calls fn(cellIndex) for every cell inside
function scanPolygon(rings, minZ, maxZ, grid, fn) {
  const { width, height, cell, originX, originZ } = grid;
  const xs = [];
  const j0 = Math.max(0, Math.floor((minZ - originZ) / cell)), j1 = Math.min(height - 1, Math.ceil((maxZ - originZ) / cell));
  for (let j = j0; j <= j1; j++) {
    const zc = originZ + (j + 0.5) * cell;
    xs.length = 0;
    for (const rg of rings) for (let i = 0, n = rg.length; i < n; i++) { const [x1, z1] = rg[i], [x2, z2] = rg[(i + 1) % n]; if ((z1 <= zc) !== (z2 <= zc)) xs.push(x1 + ((zc - z1) * (x2 - x1)) / (z2 - z1)); }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const ia = Math.max(0, Math.ceil((xs[k] - originX) / cell - 0.5)), ib = Math.min(width - 1, Math.floor((xs[k + 1] - originX) / cell - 0.5));
      for (let i = ia; i <= ib; i++) fn(j * width + i);
    }
  }
}
const localRings = (rings, proj) => {
  const lr = rings.map((rg) => rg.map(([la, lo]) => proj.toLocal(la, lo)));
  let minZ = Infinity, maxZ = -Infinity;
  for (const rg of lr) for (const [, z] of rg) { if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
  return { rings: lr, minZ, maxZ };
};

// Which bake polygons a measured polygon stands for: the cells it covers, by polygon id. A polygon takes the
// reading unless it holds only a sliver of the measured one and the measured one only a sliver of it (the
// bake's clarity rule, at full resolution).
function overlap(measured, g, lakeId, lakeArea, nCreekFrom) {
  const out = []; // [{ m (index), id, n }]
  measured.forEach((ml, m) => {
    const { rings, minZ, maxZ } = localRings(ml.rings, g.proj);
    const counts = new Map();
    let total = 0;
    scanPolygon(rings, minZ, maxZ, g.grid, (k) => { total++; const id = lakeId[k]; if (id && id < nCreekFrom) counts.set(id, (counts.get(id) || 0) + 1); });
    ml.cells = total;
    for (const [id, n] of counts) if (!(n < total * 0.15 && n < lakeArea[id] * 0.5)) out.push({ m, id, n });
  });
  return out;
}

// ---------- pixel sampling ---------------------------------------------------------------------------------

// interior points: chamfer distance to the polygon's edge inside its bounding box; the deepest cell, then up
// to two more far from the first (big lakes), all at least MIN_INTERIOR_M from shore
function interiorPoints(id, bb, g, lakeId, cells) {
  const { width: W } = g.grid;
  const i0 = bb[0] - 1, j0 = bb[2] - 1, w = bb[1] - bb[0] + 3, h = bb[3] - bb[2] + 3;
  const d = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = i0 + x, j = j0 + y;
    const inside = x > 0 && y > 0 && x < w - 1 && y < h - 1 && lakeId[j * W + i] === id;
    d[y * w + x] = inside ? 65535 : 0;
  }
  for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) { const k = y * w + x; if (!d[k]) continue; d[k] = Math.min(d[k], d[k - 1] + 3, d[k - w] + 3, d[k - w - 1] + 4, d[k - w + 1] + 4); }
  for (let y = h - 2; y >= 0; y--) for (let x = w - 2; x >= 1; x--) { const k = y * w + x; if (!d[k]) continue; d[k] = Math.min(d[k], d[k + 1] + 3, d[k + w] + 3, d[k + w + 1] + 4, d[k + w - 1] + 4); }
  const K = cells > 100000 ? 3 : cells > 10000 ? 2 : 1;
  const sep = Math.max(800, Math.sqrt(cells) * g.grid.cell / 3);
  const minD = (MIN_INTERIOR_M / g.grid.cell) * 3;
  const pts = [];
  for (let n = 0; n < K; n++) {
    let best = -1, bd = minD;
    for (let k = 0; k < w * h; k++) {
      if (d[k] < bd) continue;
      const x = k % w, y = (k - x) / w;
      if (pts.some((p) => Math.hypot((p.x - x) * g.grid.cell, (p.y - y) * g.grid.cell) < sep)) continue;
      if (d[k] > bd || best < 0) { bd = d[k]; best = k; }
    }
    if (best < 0) break;
    const x = best % w, y = (best - x) / w;
    pts.push({ x, y, dist: Math.round((d[best] / 3) * g.grid.cell) });
  }
  return pts.map((p) => { const [la, lo] = g.proj.toLatLon(g.grid.cx(i0 + p.x), g.grid.cz(j0 + p.y)); return { lat: +la.toFixed(6), lon: +lo.toFixed(6), dist: p.dist }; });
}

async function pixelLayers() {
  const out = {};
  for (const [ch, svc] of Object.entries(PIXEL_SERVICES)) {
    const j = await getJson(`${LB}/${svc}/MapServer?f=json`);
    const lay = j.layers.filter((l) => /_(\d{4})(\d{2})$/.test(l.name) && MONTHS.includes(l.name.slice(-2)));
    out[ch] = { svc, ids: lay.map((l) => l.id), names: Object.fromEntries(lay.map((l) => [l.id, l.name.slice(-6)])) };
  }
  return out;
}

function makeSampler(dir, layers, concurrency) {
  const file = path.join(dir, 'pixel-samples.jsonl');
  const cache = new Map();
  if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split('\n')) { if (!line) continue; try { const r = JSON.parse(line); cache.set(`${r.ch}|${r.lat}|${r.lon}`, r.vals); } catch {} }
  const ws = fs.createWriteStream(file, { flags: 'a' });
  let fetched = 0;
  async function one(ch, lat, lon) {
    const k = `${ch}|${lat}|${lon}`;
    if (cache.has(k)) return cache.get(k);
    const L = layers[ch];
    const q = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', sr: '4326', layers: `all:${L.ids.join(',')}`, tolerance: '1',
      mapExtent: `${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}`, imageDisplay: '400,400,96', returnGeometry: 'false', f: 'json' });
    const j = await getJson(`${LB}/${L.svc}/MapServer/identify?${q}`);
    const vals = {};
    for (const r of j.results || []) {
      const a = r.attributes || {};
      const v = parseFloat(a['Stretch.Pixel Value'] ?? a['Pixel Value']);
      if (Number.isFinite(v) && v > 0) vals[r.layerName.slice(-6)] = +v.toFixed(3);
    }
    cache.set(k, vals);
    ws.write(JSON.stringify({ ch, lat, lon, vals }) + '\n');
    fetched++;
    await sleep(150);
    return vals;
  }
  async function run(jobs, onDone) {
    let next = 0, done = 0;
    const t0 = Date.now();
    const worker = async () => { for (;;) { const i = next++; if (i >= jobs.length) return; const jb = jobs[i]; jb.vals = await one(jb.ch, jb.lat, jb.lon); done++; if (done % 200 === 0) log(`pixels: ${done}/${jobs.length} (${fetched} fetched, ${((Date.now() - t0) / 1000).toFixed(0)} s)`); if (onDone) onDone(jb); } };
    await Promise.all(Array.from({ length: concurrency }, worker));
  }
  return { run, close: () => new Promise((r) => ws.end(r)), fetched: () => fetched };
}

// ---------- quick looks ------------------------------------------------------------------------------------

const FONT = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111', '.': '000000000000010', ' ': '000000000000000', m: '000000111111101', '-': '000000111000000' };
function ramp(stops, v) {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i]; const t = (Math.log(v) - Math.log(a)) / (Math.log(b) - Math.log(a)); return ca.map((c, q) => Math.round(c + (cb[q] - c) * t)); }
  return stops[stops.length - 1][1];
}
const RAMPS = {
  secchi: [[0.5, [92, 70, 34]], [1, [128, 112, 52]], [2, [96, 132, 92]], [3, [52, 128, 138]], [5, [36, 98, 168]], [8, [24, 60, 140]]],
  cdom: [[0.5, [40, 90, 170]], [1, [70, 140, 170]], [2, [176, 156, 74]], [4, [160, 104, 40]], [8, [100, 56, 24]], [12, [60, 32, 16]]],
};
function quickLook(file, chan, g, lakeId, latlonBox, mPerPx, ticks) {
  const [x0, z0] = g.proj.toLocal(latlonBox.north, latlonBox.west), [x1, z1] = g.proj.toLocal(latlonBox.south, latlonBox.east);
  const W = Math.round((x1 - x0) / mPerPx), H = Math.round((z1 - z0) / mPerPx);
  const png = new PNG({ width: W, height: H });
  const { width: GW, height: GH } = g.grid;
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4; png.data[o] = c[0]; png.data[o + 1] = c[1]; png.data[o + 2] = c[2]; png.data[o + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = g.grid.ci(x0 + (x + 0.5) * mPerPx), j = g.grid.cj(z0 + (y + 0.5) * mPerPx);
    if (i < 0 || j < 0 || i >= GW || j >= GH) { put(x, y, [200, 200, 200]); continue; }
    const v = chan.data[j * GW + i];
    put(x, y, v ? ramp(RAMPS[chan.name], v / ENC[chan.name]) : lakeId[j * GW + i] ? [255, 0, 255] : [232, 228, 216]);
  }
  // legend: a bar with labelled ticks, bottom left
  const bx = 12, by = H - 34, bw = Math.min(360, W - 24), lo = RAMPS[chan.name][0][0], hi = RAMPS[chan.name].at(-1)[0];
  for (let y = by - 4; y < H - 4; y++) for (let x = bx - 4; x < bx + bw + 4; x++) put(x, y, [250, 250, 246]);
  for (let x = 0; x < bw; x++) { const v = Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * (x / (bw - 1))); for (let y = 0; y < 12; y++) put(bx + x, by + y, ramp(RAMPS[chan.name], v)); }
  for (const t of ticks) {
    const x = bx + Math.round(((Math.log(t) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (bw - 1));
    for (let y = 12; y < 15; y++) put(x, by + y, [20, 20, 20]);
    const s = String(t); let cx = x - s.length * 4 + 1; // 8 px per glyph (3 columns of 2 px, 2 px gap)
    for (const ch of s) { const f = FONT[ch] || FONT[' ']; for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (f[r * 3 + c] === '1') for (let q = 0; q < 2; q++) for (let p = 0; p < 2; p++) put(cx + c * 2 + p, by + 17 + r * 2 + q, [20, 20, 20]); cx += 8; }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
  log('quick look', file, `${W} x ${H}`);
}

// ---------- main ---------------------------------------------------------------------------------------------

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const g = bakeGrid(opt.area);
  const box = g.gridBox, key = boxKey(box);
  const { width: W, height: H, ntx, nty } = g.grid;
  const T = CFG.tile;
  const dir = path.join(CFG.cacheDir, SRC);
  await fsp.mkdir(dir, { recursive: true });

  // inputs: the merged extract (Minnesota + Ontario) when quetico-osm.mjs has made it
  const mergedFile = path.join(CFG.cacheDir, 'quetico-osm', `extract-v2-${key}.json`);
  const mnFile = path.join(CFG.cacheDir, 'osm', `extract-v2-${key}.json`);
  const extractFile = fs.existsSync(mergedFile) ? mergedFile : mnFile;
  log('water polygons from', extractFile);
  const osm = JSON.parse(await fsp.readFile(extractFile, 'utf8'));
  const lbData = await loadLakeBrowser(dir, box);
  const dnr = await loadClarity(box);

  const { lakes, lakeId } = bakeWater(osm, g);
  const nIds = lakes.length, creekFrom = lakes.findIndex((l) => l.creek) + 1 || nIds + 1;
  osm.lakes = null; osm.waterways = null;
  const lakeArea = new Uint32Array(nIds + 1), bb = new Int32Array((nIds + 1) * 4).fill(-1);
  const sumI = new Float64Array(nIds + 1), sumJ = new Float64Array(nIds + 1);
  for (let j = 0, k = 0; j < H; j++) for (let i = 0; i < W; i++, k++) {
    const id = lakeId[k]; if (!id) continue;
    lakeArea[id]++; sumI[id] += i; sumJ[id] += j;
    const b = id * 4;
    if (bb[b] < 0) { bb[b] = i; bb[b + 1] = i; bb[b + 2] = j; bb[b + 3] = j; } else { if (i < bb[b]) bb[b] = i; if (i > bb[b + 1]) bb[b + 1] = i; if (j > bb[b + 3]) bb[b + 3] = j; }
  }
  log(`${nIds} water polygons in the grid (${creekFrom - 1} polygons, ${nIds - creekFrom + 1} creeks)`);
  const inTiles = (id) => { if (!opt.tiles) return true; const t = opt.tiles; return bb[id * 4 + 1] >= t.x0 * T && bb[id * 4] < (t.x1 + 1) * T && bb[id * 4 + 3] >= t.y0 * T && bb[id * 4 + 2] < (t.y1 + 1) * T; };

  // per polygon: value accumulators
  const val = Array.from({ length: nIds + 1 }, () => null);
  const lbPairs = overlap(lbData.lakes, g, lakeId, lakeArea, creekFrom);
  {
    const acc = new Map();
    for (const { m, id, n } of lbPairs) {
      const L = lbData.lakes[m];
      let a = acc.get(id); if (!a) acc.set(id, (a = { s: 0, sn: 0, c: 0, cn: 0, h: 0, hn: 0, dows: new Set(), names: new Set(), n: 0 }));
      if (L.secchi) { a.s += n * L.secchi; a.sn += n; }
      if (L.cdom) { a.c += n * L.cdom; a.cn += n; }
      if (L.chla) { a.h += n * L.chla; a.hn += n; }
      if (L.dow) a.dows.add(L.dow);
      if (L.name) a.names.add(L.name);
      a.n += n;
    }
    for (const [id, a] of acc) {
      if (!a.sn && !a.cn) continue;
      val[id] = { secchi: a.sn ? a.s / a.sn : null, cdom: a.cn ? a.c / a.cn : null, chla: a.hn ? a.h / a.hn : null, src: 'lake', dow: [...a.dows], lbNames: [...a.names], cover: +(a.n / lakeArea[id]).toFixed(2) };
    }
    log(`LakeBrowser: ${lbData.lakes.length} basins, ${lbPairs.length} basin-polygon pairs, ${acc.size} polygons measured`);
  }
  // the bake's DNR in-situ Secchi, for comparison and where LakeBrowser has none
  const dnrBy = new Map();
  for (const { m, id, n } of overlap(dnr.lakes, g, lakeId, lakeArea, creekFrom)) { const b = dnrBy.get(id); if (!b || n > b.n) dnrBy.set(id, { n, secchi: dnr.lakes[m].secchi, dow: dnr.lakes[m].dow }); }
  let dnrOnly = 0;
  for (const [id, d] of dnrBy) {
    if (val[id]) { val[id].dnrSecchi = d.secchi; continue; }
    val[id] = { secchi: d.secchi, cdom: null, chla: null, src: 'dnr', dow: [d.dow], dnrSecchi: d.secchi };
    dnrOnly++;
  }
  log(`DNR in-situ Secchi: ${dnrBy.size} polygons, ${dnrOnly} with no LakeBrowser basin`);

  // pixels: unmeasured polygons of 4 ha or more, plus a calibration set of LakeBrowser lakes
  let calibration = null;
  if (opt.pixels) {
    const layers = await pixelLayers();
    const sampler = makeSampler(dir, layers, opt.concurrency);
    const targets = [];
    for (let id = 1; id < creekFrom; id++) if (lakeArea[id] >= MIN_PIXEL_CELLS && (!val[id] || val[id].src === 'dnr' || val[id].cdom == null) && inTiles(id)) targets.push(id);
    const lbIds = [];
    for (let id = 1; id < creekFrom; id++) if (lakeArea[id] >= 2000 && val[id]?.src === 'lake' && val[id].cover > 0.8) lbIds.push(id);
    const calIds = lbIds.filter((_, i) => i % Math.max(1, Math.floor(lbIds.length / CALIBRATION)) === 0).slice(0, CALIBRATION);
    const pts = new Map();
    for (const id of [...targets, ...calIds]) { const p = interiorPoints(id, [bb[id * 4], bb[id * 4 + 1], bb[id * 4 + 2], bb[id * 4 + 3]], g, lakeId, lakeArea[id]); if (p.length) pts.set(id, p); }
    const jobs = [];
    for (const [id, p] of pts) for (const q of p) for (const ch of Object.keys(PIXEL_SERVICES)) jobs.push({ id, ch, lat: q.lat, lon: q.lon });
    log(`pixels: ${targets.length} polygons to sample (${[...pts.keys()].filter((id) => targets.includes(id)).length} with an interior ${MIN_INTERIOR_M} m from shore), ${calIds.length} for calibration, ${jobs.length} identify calls (cached ones skipped)`);
    await sampler.run(jobs);
    await sampler.close();
    const pix = new Map();
    for (const jb of jobs) {
      const v = median(Object.values(jb.vals || {}));
      let e = pix.get(jb.id); if (!e) pix.set(jb.id, (e = { secchi: [], cdom: [], pts: new Set(), months: 0 }));
      if (v) e[jb.ch].push(v);
      e.pts.add(`${jb.lat},${jb.lon}`); e.months = Math.max(e.months, Object.keys(jb.vals || {}).length);
    }
    // calibration: pixel medians against LakeBrowser basin values for the same lakes, as a log ratio
    const ratios = { secchi: [], cdom: [] };
    for (const id of calIds) { const e = pix.get(id); if (!e) continue; for (const ch of ['secchi', 'cdom']) { const pv = median(e[ch]); const lv = val[id][ch]; if (pv && lv) ratios[ch].push(Math.log(lv / pv)); } }
    const corr = {};
    calibration = { lakes: calIds.length };
    for (const ch of ['secchi', 'cdom']) {
      const r = ratios[ch]; const med = median(r.map((x) => x + 10)) - 10; // median of logs (shifted positive)
      corr[ch] = Number.isFinite(med) ? Math.exp(med) : 1;
      const xs = [], ys = [];
      for (const id of calIds) { const e = pix.get(id); const pv = e && median(e[ch]); if (pv && val[id][ch]) { xs.push(Math.log(pv)); ys.push(Math.log(val[id][ch])); } }
      const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
      let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
      const absErr = r.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
      calibration[ch] = { n: r.length, factor: +corr[ch].toFixed(3), logCorrelation: +(sxy / Math.sqrt(sxx * syy)).toFixed(3), medianAbsLogErrorAfter: +(absErr[absErr.length >> 1] || 0).toFixed(3) };
    }
    log('calibration (lake value / pixel median):', JSON.stringify(calibration));
    let nPix = 0;
    for (const id of targets) {
      const e = pix.get(id); if (!e) continue;
      const s = median(e.secchi), c = median(e.cdom);
      if (!s && !c) continue;
      const old = val[id];
      if (old && old.src === 'dnr') { if (c) { old.cdom = c * corr.cdom; old.cdomSrc = 'pixel'; old.pts = e.pts.size; } continue; }
      if (old && old.src === 'lake') { if (c && old.cdom == null) { old.cdom = c * corr.cdom; old.cdomSrc = 'pixel'; } continue; }
      val[id] = { secchi: s ? s * corr.secchi : null, cdom: c ? c * corr.cdom : null, chla: null, src: 'pixel', pts: e.pts.size, months: e.months };
      nPix++;
    }
    log(`pixels: ${nPix} polygons measured from pixels; ${sampler.fetched()} identify calls made this run`);
  }

  // everything else: measured lakes within 15 km, on logs, with the size trend measured lakes show
  const measured = [];
  for (let id = 1; id < creekFrom; id++) { const v = val[id]; if (v && lakeArea[id]) measured.push({ id, x: sumI[id] / lakeArea[id], y: sumJ[id] / lakeArea[id], la: Math.log(lakeArea[id]), s: v.secchi ? Math.log(v.secchi) : null, c: v.cdom ? Math.log(v.cdom) : null, h: v.chla ? Math.log(v.chla) : null }); }
  const trend = {};
  for (const f of ['s', 'c', 'h']) {
    const pts = measured.filter((m) => m[f] != null);
    const mx = pts.reduce((s, p) => s + p.la, 0) / pts.length, my = pts.reduce((s, p) => s + p[f], 0) / pts.length;
    let sxy = 0, sxx = 0; for (const p of pts) { sxy += (p.la - mx) * (p[f] - my); sxx += (p.la - mx) ** 2; }
    const las = pts.map((p) => p.la).sort((a, b) => a - b);
    trend[f] = { slope: sxy / sxx, mx, my, lo: las[Math.floor(las.length * 0.02)], hi: las[Math.floor(las.length * 0.98)], n: pts.length };
  }
  const tr = (f, la) => trend[f].my + trend[f].slope * (Math.max(trend[f].lo, Math.min(trend[f].hi, la)) - trend[f].mx);
  const NB = (NEAR_KM * 1000) / g.grid.cell;
  const bucket = new Map(), BK = Math.ceil(NB);
  for (const m of measured) { const k = Math.floor(m.x / BK) * 100000 + Math.floor(m.y / BK); let a = bucket.get(k); if (!a) bucket.set(k, (a = [])); a.push(m); }
  const near = (x, y) => { const out = []; const bx = Math.floor(x / BK), by = Math.floor(y / BK); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const m of bucket.get((bx + dx) * 100000 + by + dy) || []) { const d = Math.hypot(m.x - x, m.y - y); if (d <= NB) out.push([m, d]); } return out; };
  let nNear = 0;
  for (let id = 1; id <= nIds; id++) {
    if (!lakeArea[id]) continue;
    const v = val[id];
    if (v && v.secchi != null && v.cdom != null && v.chla != null) continue;
    const x = sumI[id] / lakeArea[id], y = sumJ[id] / lakeArea[id], la = Math.log(lakeArea[id]);
    let nb = near(x, y);
    if (!nb.length) nb = measured.map((m) => [m, Math.hypot(m.x - x, m.y - y)]).sort((a, b) => a[1] - b[1]).slice(0, 8);
    const est = (f) => { let ws = 0, wsum = 0; for (const [m, d] of nb) { if (m[f] == null) continue; const w = 1 / (100 + d); ws += w * (m[f] - tr(f, m.la)); wsum += w; } return Math.exp((wsum ? ws / wsum : 0) + tr(f, la)); };
    const isRiver = lakes[id - 1].river;
    const e = { secchi: est('s') * (isRiver ? 0.8 : 1), cdom: est('c') * (isRiver ? 1.25 : 1), chla: est('h') };
    if (!v) { val[id] = { ...e, src: 'near' }; nNear++; } else for (const f of ['secchi', 'cdom', 'chla']) if (v[f] == null) { v[f] = e[f]; v[f + 'Src'] = 'near'; }
  }
  log(`estimated ${nNear} polygons from measured lakes within ${NEAR_KM} km; trend per doubling of area: secchi x${Math.exp(trend.s.slope * Math.LN2).toFixed(3)}, cdom x${Math.exp(trend.c.slope * Math.LN2).toFixed(3)}`);

  // the current release's ids, to compare with what ships today
  const relFile = path.join(CFG.outDir, 'index.json');
  const rel = new Map();
  if (fs.existsSync(relFile)) { const idx = JSON.parse(await fsp.readFile(relFile, 'utf8')); for (const l of idx.lakes) if (l) rel.set(l.osm, l); }

  // the table
  const table = [];
  for (let id = 1; id <= nIds; id++) {
    if (!lakeArea[id]) continue;
    const l = lakes[id - 1], v = val[id], r = rel.get(l.osm);
    table.push({
      osm: l.osm, id, rel: r ? r.id : undefined, name: l.name, river: l.river || undefined, creek: l.creek || undefined, cells: lakeArea[id],
      secchi: r2(v.secchi), cdom: r2(v.cdom), chla: r2(v.chla), src: v.src, cdomSrc: v.cdomSrc, chlaSrc: v.chlaSrc,
      dow: v.dow && v.dow.length ? v.dow : undefined, dnrSecchi: v.dnrSecchi, pts: v.pts, relSecchi: r ? r.secchi : undefined,
    });
  }
  const bySrc = {}; for (const t of table) bySrc[t.src] = (bySrc[t.src] || 0) + 1;
  const bySrcPoly = {}; for (const t of table) if (!t.creek) bySrcPoly[t.src] = (bySrcPoly[t.src] || 0) + 1;
  // agreement with what ships: the release's DNR-measured lakes against LakeBrowser
  const cmp = table.filter((t) => t.src === 'lake' && t.dnrSecchi);
  const lr = cmp.map((t) => Math.log(t.secchi / t.dnrSecchi));
  const stats = {
    polygons: table.filter((t) => !t.creek).length, creeks: table.filter((t) => t.creek).length, bySource: bySrc, polygonsBySource: bySrcPoly,
    lakeBrowserVsDnrSecchi: { n: cmp.length, medianRatio: +Math.exp(median(lr.map((x) => x + 10)) - 10).toFixed(3) },
    secchiRange: [Math.min(...table.map((t) => t.secchi)), Math.max(...table.map((t) => t.secchi))], cdomRange: [Math.min(...table.map((t) => t.cdom)), Math.max(...table.map((t) => t.cdom))],
    calibration, trend: Object.fromEntries(Object.entries(trend).map(([f, t]) => [{ s: 'secchi', c: 'cdom', h: 'chla' }[f], { perDoubling: +Math.exp(t.slope * Math.LN2).toFixed(3), n: t.n }])),
  };
  const tableOut = {
    key, box, extract: path.basename(path.dirname(extractFile)) + '/' + path.basename(extractFile), made: new Date().toISOString(),
    legend: {
      osm: 'the bake polygon\'s osm id ("way/<id>" or "relation/<id>"; creeks are the waterway\'s "way/<id>"): the stable join',
      id: 'the id a bake of this extract gives the polygon (bake.mjs order: osm.lakes inside the grid, then waterways)',
      rel: 'the polygon\'s id in the release in public/data today, where it exists',
      secchi: 'summer Secchi depth, m (LakeBrowser: mean of Jun-Sep 2018-2024)', cdom: 'late-summer CDOM a440, m^-1 (median of Jul 20 - Sep 20 across 2017-2026): under 1 clear blue, 1-3 light tea, 3-6 tea-brown, over 6 dark bog water', chla: 'late-summer chlorophyll-a, ug/L (median, same window)',
      src: 'lake = LakeBrowser basin values, cell-weighted over the basins the polygon overlaps; dnr = the DNR in-situ Secchi the bake uses today; pixel = median of late-summer LakeBrowser pixels at 1-3 interior points, scaled by the calibration factor; near = estimated from measured polygons within 15 km on logs with the size trend',
      cdomSrc: 'where cdom came from when not from src', chlaSrc: 'likewise for chla', dow: 'DNR lake numbers of the basins used', dnrSecchi: 'the DNR in-situ Secchi for comparison', pts: 'pixel points sampled', relSecchi: 'the Secchi the release ships today',
    },
    stats, lakes: table,
  };
  await fsp.writeFile(path.join(dir, `lake-colour-${key}.json`), JSON.stringify(tableOut));
  log('table:', JSON.stringify(stats));

  // per-cell channels: the polygon's value, with each LakeBrowser basin's own value inside it
  const chans = { secchi: new Uint8Array(W * H), cdom: new Uint8Array(W * H) };
  const enc = (ch, v) => Math.max(1, Math.min(255, Math.round(v * ENC[ch])));
  const byId = new Map(table.map((t) => [t.id, t]));
  for (let k = 0; k < W * H; k++) { const id = lakeId[k]; if (!id) continue; const t = byId.get(id); chans.secchi[k] = enc('secchi', t.secchi); chans.cdom[k] = enc('cdom', t.cdom); }
  const accepted = new Map(); for (const p of lbPairs) { let s = accepted.get(p.m); if (!s) accepted.set(p.m, (s = new Set())); s.add(p.id); }
  for (const [m, ids] of accepted) {
    const L = lbData.lakes[m];
    const { rings, minZ, maxZ } = localRings(L.rings, g.proj);
    scanPolygon(rings, minZ, maxZ, g.grid, (k) => { if (!ids.has(lakeId[k])) return; if (L.secchi) chans.secchi[k] = enc('secchi', L.secchi); if (L.cdom) chans.cdom[k] = enc('cdom', L.cdom); });
  }
  // basin edges are straight lines on the DNR's maps, and a lake runs on past its Minnesota basins at the
  // border: blend inside every polygon that holds more than one value (a masked box blur, three passes of
  // SMOOTH cells, so a seam fades over about 400 m) without reaching other water across the land
  const SMOOTH = 15;
  const seamIds = new Set();
  { const per = new Map(); for (const p of lbPairs) per.set(p.id, (per.get(p.id) || 0) + 1); for (const [id, n] of per) if (n > 1 || (val[id]?.cover ?? 1) < 0.97) seamIds.add(id); }
  for (const id of seamIds) {
    const i0 = bb[id * 4], i1 = bb[id * 4 + 1], j0 = bb[id * 4 + 2], j1 = bb[id * 4 + 3];
    const w = i1 - i0 + 1, h = j1 - j0 + 1;
    const mask = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (lakeId[(j0 + y) * W + i0 + x] === id) mask[y * w + x] = 1;
    const blur = (a) => {
      const tmp = new Float32Array(w * h);
      for (let pass = 0; pass < 3; pass++) {
        for (let y = 0; y < h; y++) { let s = 0; const o = y * w; for (let x = -SMOOTH; x < w + SMOOTH; x++) { if (x + SMOOTH < w) s += a[o + x + SMOOTH]; if (x - SMOOTH - 1 >= 0) s -= a[o + x - SMOOTH - 1]; if (x >= 0 && x < w) tmp[o + x] = s; } }
        for (let x = 0; x < w; x++) { let s = 0; for (let y = -SMOOTH; y < h + SMOOTH; y++) { if (y + SMOOTH < h) s += tmp[(y + SMOOTH) * w + x]; if (y - SMOOTH - 1 >= 0) s -= tmp[(y - SMOOTH - 1) * w + x]; if (y >= 0 && y < h) a[y * w + x] = s; } }
      }
    };
    const m = mask.slice(); blur(m);
    for (const ch of Object.keys(chans)) {
      const v = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) v[y * w + x] = Math.log(chans[ch][(j0 + y) * W + i0 + x] / ENC[ch]);
      blur(v);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = y * w + x; if (mask[k] && m[k] > 0) chans[ch][(j0 + y) * W + i0 + x] = enc(ch, Math.exp(v[k] / m[k])); }
    }
  }
  log(`smoothed the seams inside ${seamIds.size} polygons`);
  const written = [];
  let bytes = 0;
  const core = Buffer.alloc(T * T);
  for (let ty = 0; ty < nty; ty++) for (let tx = 0; tx < ntx; tx++) {
    if (opt.tiles && (tx < opt.tiles.x0 || tx > opt.tiles.x1 || ty < opt.tiles.y0 || ty > opt.tiles.y1)) continue;
    let any = false;
    for (let r = 0; r < T && !any; r++) { const o = (ty * T + r) * W + tx * T; for (let c = 0; c < T; c++) if (lakeId[o + c]) { any = true; break; } }
    for (const ch of Object.keys(chans)) {
      const f = path.join(dir, `${tx}_${ty}.${ch}.bin`);
      if (!any) { await fsp.rm(f, { force: true }); continue; }
      for (let r = 0; r < T; r++) { const o = (ty * T + r) * W + tx * T; core.set(chans[ch].subarray(o, o + T), r * T); }
      const gz = zlib.gzipSync(core, { level: 9 });
      fs.writeFileSync(f, gz); bytes += gz.length;
    }
    if (any) written.push(`${tx}_${ty}`);
  }
  log(`${written.length} tiles with water written, ${(bytes / 1e6).toFixed(2)} MB`);

  if (!opt.tiles) {
    const manifest = {
      source: SRC, stream: 'D1-quetico-lakes', script: 'scripts/sources/lake-colour.mjs', made: new Date().toISOString(),
      citation: {
        name: 'UMN LakeBrowser: Minnesota lake water quality from satellite imagery (clarity, CDOM, chlorophyll-a)',
        agency: 'University of Minnesota Remote Sensing and Geospatial Analysis Laboratory (Leif Olmanson) and U-Spatial',
        services: [lbData.service, ...Object.values(PIXEL_SERVICES).map((s) => `${LB}/${s}/MapServer`)],
        site: 'https://lakes.rs.umn.edu',
        license: 'No licence is stated on the services. Cite the lab; ask Leif Olmanson (olman002@umn.edu) before shipping the derived values in a public release.',
        also: 'Minnesota DNR Lakes of Phosphorus Sensitivity / Watershed Health lake scores (mean Secchi), as clarity.mjs; water polygons © OpenStreetMap contributors, ODbL',
      },
      grid: { area: opt.area, cell: CFG.cell, tile: T, originX: g.grid.originX, originZ: g.grid.originZ, width: W, height: H, ntx, nty, gridBox: box, key },
      layout: `data-cache/${SRC}/<tx>_<ty>.<channel>.bin: gzip of the tile core, 256 x 256 cells, no halo, row-major, row 0 = the tile's north edge (cell j = ty*256 + row, i = tx*256 + col), one byte per cell. Tiles not listed in \`tiles\` hold no water: every cell is 0.`,
      compression: 'gzip',
      water: `the cells are the water cells a bake of ${tableOut.extract} draws (bake.mjs creeks then polygons, even-odd); a bake of another extract must re-run this script`,
      channels: {
        secchi: { type: 'uint8', unit: 'm', scale: 1 / ENC.secchi, nodata: 0, legend: 'summer Secchi depth (value / 10 m); inside a LakeBrowser basin its own value, elsewhere the polygon\'s table value' },
        cdom: { type: 'uint8', unit: 'm^-1 (a440)', scale: 1 / ENC.cdom, nodata: 0, legend: 'late-summer CDOM (value / 20): under 1 clear blue, 1-3 light tea, 3-6 tea-brown, over 6 dark bog water; per basin as secchi' },
      },
      table: { file: `lake-colour-${key}.json`, fields: tableOut.legend, stats },
      products: { [`lakebrowser-lakes-${key}.json`]: 'the LakeBrowser basins in the box (values and rings)', 'pixel-samples.jsonl': 'every pixel identify answer (late-summer months per point)' },
      tiles: written,
    };
    await fsp.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }

  if (opt.shots) {
    const shots = path.join('shots', 'd1-quetico');
    const ql = path.join(dir, 'quicklook');
    await fsp.mkdir(ql, { recursive: true });
    const tag = opt.tiles ? `-tiles-${opt.tiles.x0}-${opt.tiles.x1}_${opt.tiles.y0}-${opt.tiles.y1}` : '';
    const views = opt.tiles ? [['box' + tag, (() => { const t = opt.tiles; const [s, w] = g.proj.toLatLon(g.grid.originX + t.x0 * T * CFG.cell, g.grid.originZ + (t.y1 + 1) * T * CFG.cell); const [n, e] = g.proj.toLatLon(g.grid.originX + (t.x1 + 1) * T * CFG.cell, g.grid.originZ + t.y0 * T * CFG.cell); return { south: s, west: w, north: n, east: e }; })(), 20]] : [['box', box, 80], ['lakeone', AREAS.lakeone, 10]];
    for (const [name, b, m] of views) {
      quickLook(path.join(shots, `colour-secchi-${name}.png`), { name: 'secchi', data: chans.secchi }, g, lakeId, b, m, [0.5, 1, 2, 4, 8]);
      quickLook(path.join(shots, `colour-cdom-${name}.png`), { name: 'cdom', data: chans.cdom }, g, lakeId, b, m, [0.5, 1, 2, 4, 8, 12]);
      if (!opt.tiles) for (const c of ['secchi', 'cdom']) await fsp.copyFile(path.join(shots, `colour-${c}-${name}.png`), path.join(ql, `colour-${c}-${name}.png`));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
