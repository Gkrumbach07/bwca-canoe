#!/usr/bin/env node
// d2 bake: checks a v4 release against itself and against the release before it.
//
//   node scripts/v4-check.mjs [--data public-data-v4] [--old public/data] [--fixes src/world-fixes.json] [--out report.json]
//
// - water and land agree: no land cell lies under the water beside it, every water cell's bed is under its surface;
//   no step in the ground at the LiDAR's edge (the border, the flight's end) beyond what the ground does elsewhere
// - no lake lost: every named lake of the old release is in the new one by its osm id, about as big
// - the entry points: all there, on water of the lake they were on (data-v3's corrected landings, world-fixes.json)
// - the campsites and the portages: counted, each site's lake, each portage's ends on water
// - the channels: what each holds, in cells
import fs from 'node:fs';
import zlib from 'node:zlib';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', 'public-data-v4').replace(/\/?$/, '/');
const oldDir = arg('--old', 'public/data').replace(/\/?$/, '/');
const fixesFile = arg('--fixes', 'src/world-fixes.json');
const outFile = arg('--out', null);
const log = (...a) => console.log(...a);

const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const g = index.grid, T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, n = SIDE * SIDE, W = g.width, H = g.height;
const fields = index.fields || ['height', 'lake', 'sdist', 'level'];
const report = { version: index.version, baked: index.source.baked };

// --- the whole grid's cells (the tiles' cores): height, lake, level, and the channels' counts
const N = W * H;
const h = new Int16Array(N), lake = new Uint16Array(N), lvl = new Int16Array(N), sd = new Int16Array(N);
const counts = Object.fromEntries(fields.slice(4).map((f) => [f, new Map()]));
const cliffAtEdge = { lidar: 0 };
let bytes = 0;
const t0 = Date.now();
for (let ty = 0; ty < g.nty; ty++) for (let tx = 0; tx < g.ntx; tx++) {
  const f = `${dataDir}tiles/${tx}_${ty}.bin`, comp = fs.readFileSync(f);
  bytes += comp.length;
  const raw = zlib.gunzipSync(comp), buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const th = new Int16Array(buf, 0, n), tl = new Uint16Array(buf, n * 2, n), ts = new Int16Array(buf, n * 4, n), tv = new Int16Array(buf, n * 6, n);
  const planes = fields.slice(4).map((name, q) => [name, new Uint8Array(buf, n * (8 + q), n)]);
  for (let r = 0; r < T; r++) {
    const m0 = (r + HALO) * SIDE + HALO, k0 = (ty * T + r) * W + tx * T;
    h.set(th.subarray(m0, m0 + T), k0); lake.set(tl.subarray(m0, m0 + T), k0); lvl.set(tv.subarray(m0, m0 + T), k0); sd.set(ts.subarray(m0, m0 + T), k0);
    for (const [name, a] of planes) { const c = counts[name]; for (let q = 0; q < T; q++) { const v = a[m0 + q]; c.set(v, (c.get(v) || 0) + 1); } }
  }
}
report.tiles = { count: g.ntx * g.nty, mb: +(bytes / 1048576).toFixed(1) };
log(`read ${g.ntx * g.nty} tiles (${report.tiles.mb} MB) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// --- water and land agree
{
  let landUnder = 0, landUnderWorst = 0, bedAbove = 0, waterCells = 0;
  const gaps = { river: [], lake: [] }, worst = [];
  const isRiver = (id) => { const l = index.lakes[id - 1]; return !!(l && l.river); };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (lake[k]) { waterCells++; if (h[k] >= lvl[k]) bedAbove++; continue; }
    let m = -32768, by = 0;
    for (const q of [i > 0 ? k - 1 : -1, i < W - 1 ? k + 1 : -1, j > 0 ? k - W : -1, j < H - 1 ? k + W : -1]) if (q >= 0 && lake[q] && lvl[q] > m) { m = lvl[q]; by = lake[q]; }
    if (m > -32768 && h[k] < m) {
      const gap = (m - h[k]) / 10;
      landUnder++; landUnderWorst = Math.max(landUnderWorst, gap);
      gaps[isRiver(by) ? 'river' : 'lake'].push(gap);
      if (gap > 2) worst.push([gap, g.originX + (i + 0.5) * g.cell, g.originZ + (j + 0.5) * g.cell, by]);
    }
  }
  const pct = (a, p) => { if (!a.length) return null; const s = Float32Array.from(a).sort(); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2); };
  const lat = (x, z) => [+(index.proj.lat0 - z / index.proj.mPerDegLat).toFixed(4), +(index.proj.lon0 + x / index.proj.mPerDegLon).toFixed(4)];
  worst.sort((a, b) => b[0] - a[0]);
  report.water = { waterCells, bedAtOrAboveSurface: bedAbove, shoreLandUnderWater: landUnder, worstM: landUnderWorst,
    besideRivers: { n: gaps.river.length, p50: pct(gaps.river, 0.5), p95: pct(gaps.river, 0.95) }, besideLakes: { n: gaps.lake.length, p50: pct(gaps.lake, 0.5), p95: pct(gaps.lake, 0.95) },
    over2m: worst.length, worst: worst.slice(0, 15).map(([gp, x, z, id]) => ({ gap: gp, x: Math.round(x), z: Math.round(z), latLon: lat(x, z), water: (index.lakes[id - 1] || {}).displayName || null })) };
  log(`water: ${waterCells} cells, ${bedAbove} with the bed at or above the surface; ${landUnder} shore land cells under the water beside them (worst ${landUnderWorst.toFixed(1)} m): beside rivers ${gaps.river.length} (p50 ${report.water.besideRivers.p50}, p95 ${report.water.besideRivers.p95} m), beside lakes ${gaps.lake.length} (p50 ${report.water.besideLakes.p50}, p95 ${report.water.besideLakes.p95} m); ${worst.length} over 2 m`);
  for (const w of report.water.worst.slice(0, 6)) log(`  ${w.gap} m at ${w.latLon} beside ${w.water}`);
}
// the ground's steps: land neighbours with the LiDAR on one side and not on the other (the cliff byte 0 against non-0:
// the edge of the flight and the border), against land neighbours anywhere (a sample)
{
  const stepsAll = [], stepsEdge = [];
  // the LiDAR's edge: the cliff byte is 0 (no LiDAR) beside a non-zero one; read it again, tile by tile, from the cores
  const cl = new Uint8Array(N);
  const qc = fields.indexOf('cliff');
  if (qc >= 0) {
    for (let ty = 0; ty < g.nty; ty++) for (let tx = 0; tx < g.ntx; tx++) {
      const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}tiles/${tx}_${ty}.bin`));
      const a = new Uint8Array(raw.buffer, raw.byteOffset + n * (8 + qc - 4), n);
      for (let r = 0; r < T; r++) cl.set(a.subarray((r + HALO) * SIDE + HALO, (r + HALO) * SIDE + HALO + T), (ty * T + r) * W + tx * T);
    }
  }
  let rng = 12345;
  const rnd = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = j * W + i;
    if (lake[k] || lake[k + 1]) continue;
    const d = Math.abs(h[k + 1] - h[k]) / 10;
    if (qc >= 0 && (cl[k] === 0) !== (cl[k + 1] === 0)) stepsEdge.push(d);
    else if (rnd() < 0.002) stepsAll.push(d);
  }
  const pct = (a, p) => { if (!a.length) return null; const s = Float32Array.from(a).sort(); return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(2); };
  report.edge = { pairs: stepsEdge.length, p50: pct(stepsEdge, 0.5), p95: pct(stepsEdge, 0.95), p99: pct(stepsEdge, 0.99), max: pct(stepsEdge, 1),
    elsewhere: { pairs: stepsAll.length, p50: pct(stepsAll, 0.5), p95: pct(stepsAll, 0.95), p99: pct(stepsAll, 0.99) } };
  log(`the LiDAR's edge: ${stepsEdge.length} land pairs across it, step p50 ${report.edge.p50} m, p95 ${report.edge.p95}, p99 ${report.edge.p99}, max ${report.edge.max}; elsewhere p50 ${report.edge.elsewhere.p50}, p95 ${report.edge.elsewhere.p95}, p99 ${report.edge.elsewhere.p99}`);
}

// --- the lakes against the old release
{
  let old = null;
  try { old = JSON.parse(fs.readFileSync(oldDir + 'index.json', 'utf8')); } catch {}
  if (old) {
    const byOsm = new Map();
    for (const l of index.lakes) if (l && l.osm) byOsm.set(l.osm, l);
    let named = 0, lost = [], shrunk = [], grew = [], levels = [];
    for (const l of old.lakes) {
      if (!l || !l.name || l.creek) continue;
      named++;
      const m = byOsm.get(l.osm);
      if (!m) { lost.push(`${l.name} (${l.osm}, ${l.cells} cells)`); continue; }
      const r = m.cells / l.cells;
      if (r < 0.9) shrunk.push(`${l.name} ${l.cells} -> ${m.cells}`);
      if (r > 1.1) grew.push(`${l.name} ${l.cells} -> ${m.cells}`);
      if (!l.river && l.cells >= 2000) levels.push(m.level - l.level);
    }
    levels.sort((a, b) => a - b);
    const newNamed = index.lakes.filter((l) => l && l.name && !l.creek).length;
    report.lakes = { oldNamed: named, newNamed, lost, shrunk, grew: grew.length, levelChange: { p5: +(levels[Math.floor(levels.length * 0.05)] || 0).toFixed(2), p50: +(levels[levels.length >> 1] || 0).toFixed(2), p95: +(levels[Math.floor(levels.length * 0.95)] || 0).toFixed(2) } };
    log(`lakes: ${named} named in the old release, ${lost.length} lost${lost.length ? ': ' + lost.slice(0, 12).join('; ') : ''}; ${shrunk.length} shrank by over 10 %${shrunk.length ? ': ' + shrunk.slice(0, 8).join('; ') : ''}; ${grew.length} grew; ${newNamed} named now; level change (lakes >= 20 ha) p5 ${report.lakes.levelChange.p5} p50 ${report.lakes.levelChange.p50} p95 ${report.lakes.levelChange.p95} m`);
    report.counts = { old: { lakes: old.lakes.length, portages: old.portages.length, campsites: old.campsites.length, entryPoints: old.entryPoints.length }, now: { lakes: index.lakes.length, portages: index.portages.length, campsites: index.campsites.length, entryPoints: index.entryPoints.length } };
    log(`counts: ${JSON.stringify(report.counts)}`);
    // the entry points: data-v3 corrected (world-fixes.json) against these
    let fixes = null;
    try { fixes = JSON.parse(fs.readFileSync(fixesFile, 'utf8')); } catch {}
    const eps = [];
    const name = (L, id) => { const l = id > 0 ? L[id - 1] : null; return l ? l.displayName || l.name || null : null; };
    for (const e of index.entryPoints) {
      const was = (fixes && fixes.entryPoints || []).find((x) => x.ep === e.ep) || old.entryPoints.find((x) => x.ep === e.ep);
      const k = Math.floor((e.z - g.originZ) / g.cell) * W + Math.floor((e.x - g.originX) / g.cell);
      const onWater = !!lake[k];
      const nm = name(index.lakes, e.lake), wasName = was ? was.lakeName ?? name(old.lakes, was.lake) : null;
      eps.push({ ep: e.ep, name: e.name, lake: nm, wasLake: wasName, moved: was ? Math.round(Math.hypot(was.x - e.x, was.z - e.z)) : null, onWater });
    }
    const bad = eps.filter((e) => !e.onWater || e.lake !== e.wasLake || e.moved === null || e.moved > 50);
    report.entryPoints = { count: eps.length, problems: bad };
    log(`entry points: ${eps.length}; ${bad.length} moved over 50 m, off the water or on other water${bad.length ? ': ' + bad.map((e) => `EP ${e.ep} ${e.name} ${e.wasLake} -> ${e.lake} ${e.moved} m${e.onWater ? '' : ' (dry)'}`).join('; ') : ''}`);
  }
}
// --- the sites and the portages
{
  const noLake = index.campsites.filter((c) => !c.lake).length;
  let dryEnds = 0;
  for (const p of index.portages) for (const L of p.launch || []) { const k = Math.floor((L.z - g.originZ) / g.cell) * W + Math.floor((L.x - g.originX) / g.cell); if (!lake[k]) dryEnds++; }
  report.sites = { campsites: index.campsites.length, withoutLake: noLake, added: index.campsites.filter((c) => c.added).length };
  report.portages = { count: index.portages.length, launchesOffWater: dryEnds, usfs: index.portages.filter((p) => p.fix === 'usfs').length };
  log(`campsites: ${report.sites.campsites} (${report.sites.added} official added), ${noLake} with no water within 400 m; portages: ${report.portages.count} (${report.portages.usfs} USFS-only), ${dryEnds} launch points off the water`);
}
// --- the channels
{
  report.channels = {};
  for (const [name, c] of Object.entries(counts)) {
    const top = [...c].sort((a, b) => b[1] - a[1]);
    report.channels[name] = { distinct: c.size, top: top.slice(0, 12).map(([v, k]) => [v, k]) };
    log(`  ${name.padEnd(7)} ${c.size} values; ${top.slice(0, 10).map(([v, k]) => `${v}:${(k / 1e6).toFixed(2)}M`).join(' ')}`);
  }
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
