#!/usr/bin/env node
// The runtime correction table for a published data release: runs the bake's landing and portage code
// (world-links.mjs) on that release's own tiles and lake table, and writes src/world-fixes.json, which world.js applies
// to that release only (matched by its bake time). A new bake does all of this itself and needs no table.
//
//   BWCA_CACHE=/path/to/data-cache node scripts/world-fixes.mjs [--data public/data] [--out src/world-fixes.json]
//
// It needs the OSM extract the release was baked from (data-cache/osm/extract-v2-<box>.json, as bake.mjs caches it).
// d1 names (2026-10-26): with the place-name sources fetched (scripts/names-fetch.mjs → data-cache/names), it also adds
// the official campsites OpenStreetMap lacks (`campsites`) and the clear USFS-only portages (appended to `portages`,
// after the connected ones, so saved portage indices hold). Then run scripts/names.mjs and scripts/site-lakes.mjs.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { CFG, log, makeProjection, makeGrid } from './config.mjs';
import { loadOsm } from './osm-extract.mjs';
import { makeWater, placeLandings, linkPortages, chainsFrom } from './world-links.mjs';
import { loadSources, usfsSites, matchSites, usfsTrails, matchPortages, wildernessTest, portageName } from './names-lib.mjs'; // d1 names

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', CFG.outDir).replace(/\/?$/, '/');
const outFile = arg('--out', 'src/world-fixes.json');

const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const proj = makeProjection(index.bbox), grid = makeGrid(index.bbox, proj);
const g = index.grid;
if (grid.width !== g.width || grid.originX !== g.originX || proj.lat0 !== index.proj.lat0) throw new Error('the index grid does not match config.mjs');
// the tiles' cells: (tile + 2 halo)^2 of [height Int16][lake Uint16][sdist Int16 dm][level Int16]
const T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, n = SIDE * SIDE;
const tiles = new Map();
const tileOf = (tx, ty) => {
  const k = ty * g.ntx + tx;
  let t = tiles.get(k);
  if (t === undefined) {
    try {
      const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}tiles/${tx}_${ty}.bin`));
      const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
      t = { lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n) };
    } catch { t = null; }
    if (tiles.size > 600) tiles.clear();
    tiles.set(k, t);
  }
  return t;
};
const cellOf = (i, j) => { const t = tileOf((i / T) | 0, (j / T) | 0); return t ? [t, ((j % T) + HALO) * SIDE + (i % T) + HALO] : null; };
const lakeAt = (i, j) => { const c = cellOf(i, j); return c ? c[0].lake[c[1]] : 0; };
const sdAt = (i, j) => { const c = cellOf(i, j); return c ? c[0].sd[c[1]] / 10 : 3000; };
const lakeRec = (id) => (id > 0 ? index.lakes[id - 1] : null);
const water = makeWater({ grid, lakeAt, sdAt, name: (id) => { const l = lakeRec(id); return l ? l.displayName || null : null; }, basin: (id) => { const l = lakeRec(id); return l ? l.basin : -1; }, big: (id) => { const l = lakeRec(id); return !!l && !l.creek && l.cells >= 50; } });

// --- portages: the release's own kept list must come out unchanged
const [latS, lonW] = proj.toLatLon(grid.originX, grid.originZ + grid.height * grid.cell);
const [latN, lonE] = proj.toLatLon(grid.originX + grid.width * grid.cell, grid.originZ);
const osm = await loadOsm({ south: latS - 0.005, west: lonW - 0.01, north: latN + 0.005, east: lonE + 0.01 });
const { kept, added, report } = linkPortages(chainsFrom(osm.portages, proj), water);
if (kept.length !== index.portages.length) throw new Error(`kept ${kept.length} portages, the release has ${index.portages.length}`);
kept.forEach((p, i) => {
  const q = index.portages[i];
  if (p.name !== q.name || p.pts.length !== q.pts.length || p.launch.some((l, k) => l.x !== q.launch[k].x || l.z !== q.launch[k].z || l.lake !== q.launch[k].lake)) throw new Error(`portage ${i} differs from the release: ${p.name} / ${q.name}`);
});

// --- landings
const list = JSON.parse(fs.readFileSync(new URL('./entrypoints.json', import.meta.url), 'utf8'));
const landings = placeLandings(list, water, proj, { portages: [...kept, ...added], campsites: index.campsites });
const rows = [];
for (const L of landings) {
  const old = index.entryPoints.find((e) => e.ep === L.ep), e = list.find((x) => x.ep === L.ep);
  const [ux, uz] = proj.toLocal(e.lat, e.lon);
  rows.push({ ep: L.ep, name: L.name, was: old ? Math.round(Math.hypot(old.x - ux, old.z - uz)) : null, now: L.off, how: L.how, lake: water.name(L.lake) });
  log(`EP ${L.ep} ${L.name}: ${old ? `${Math.round(Math.hypot(old.x - ux, old.z - uz))} m` : 'missing'} from the put-in before, ${L.off} m now, on ${water.name(L.lake) || 'unnamed water'} (${L.how})`);
}

log(`portages: ${report.candidates} trails in the extract, ${report.kept} kept by the first bake, ${report.dropped} dropped (${JSON.stringify(report.why)})`);
log(`  connected now: ${report.added} (${JSON.stringify(report.done)}); left out: ${report.left.length}`);
for (const l of report.left) log(`    left out: #${l.ci} ${l.names.join('/') || '-'}: ${l.why}`);
const conn = report.connectors.sort((a, b) => b.m - a.m);
log(`  ${report.joined || 0} pairs of halves joined; connectors: ${conn.length}, ${conn.map((c) => `${c.m} m (${c.names.join('/') || '#' + c.ci})`).join(', ')}`);

// --- d1 names: the official campsites OpenStreetMap lacks, and the clear USFS-only portages -------------------------
// A USFS site with no release site within 250 m (names-lib matchSites `missing`; Lake Four #11, Basswood – Back Bay
// #95–#100…) is added where the USFS puts it, nudged up off the water's edge to dry ground 5–25 m from the shore (the
// fire ring and the pad need land) and off the trails and landings. A USFS lake-to-lake portage inside the wilderness
// with no drawn portage within 400 m is added when its line, joined, passes the first bake's own rule (both ends within
// 70 m of water, 15 m to 2.5 km long): the campsite spurs and loops are not portages and are left out.
const usfsAdded = [], campsitesAdded = [], namesReport = {};
let src = null;
try { src = loadSources(CFG.cacheDir); } catch (e) { log(`d1 names: no place-name sources (${e.message}); no sites or USFS portages added`); }
if (src) {
  const toLocal = (lat, lon) => proj.toLocal(lat, lon), inWild = wildernessTest(src.wilderness);
  const U = usfsSites(src, toLocal), m = matchSites(U, index.campsites);
  const allP = [...kept, ...added];
  const trailNear = (x, z, r) => allP.some((p) => p.pts.some(([px, pz], k) => k && segD(x, z, p.pts[k - 1][0], p.pts[k - 1][1], px, pz) < r));
  const epNear = (x, z, r) => landings.some((l) => !l.missing && Math.hypot(l.x - x, l.z - z) < r);
  for (const ui of m.missing) {
    const u = U[ui], i0 = grid.ci(u.x), j0 = grid.cj(u.z);
    if (i0 < 2 || j0 < 2 || i0 >= grid.width - 2 || j0 >= grid.height - 2) { log(`  site left out: ${u.lake} #${u.no} (off the grid)`); continue; }
    let best = null;
    const ok = (i, j) => { const sd = sdAt(i, j); return sd >= 5 && sd <= 25 && !lakeAt(i, j); };
    if (sdAt(i0, j0) >= 4 && sdAt(i0, j0) <= 40 && !lakeAt(i0, j0) && !trailNear(u.x, u.z, 12)) best = { x: u.x, z: u.z, sd: sdAt(i0, j0), d: 0 };
    for (let r = 1; !best && r <= 9; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !ok(i0 + di, j0 + dj)) continue;
      const x = grid.cx(i0 + di), z = grid.cz(j0 + dj), d = Math.hypot(x - u.x, z - u.z);
      if (trailNear(x, z, 12)) continue;
      if (!best || d < best.d) best = { x, z, sd: sdAt(i0 + di, j0 + dj), d };
    }
    if (!best || epNear(best.x, best.z, 120)) { log(`  site left out: ${u.lake} #${u.no} (${best ? 'by a landing' : 'no dry ground within 90 m'})`); continue; }
    campsitesAdded.push({ x: +best.x.toFixed(1), z: +best.z.toFixed(1), name: `${u.lake} #${u.no}`, onWater: false, shore: +best.sd.toFixed(1), usfs: u.no, lake: u.lake, moved: Math.round(best.d) });
  }
  log(`d1 names: ${U.length} USFS campsites, ${m.pairs.length} on a release site, ${m.missing.length} with none within 250 m; added ${campsitesAdded.length} (moved off the water ${campsitesAdded.filter((c) => c.moved > 0).length}, median ${campsitesAdded.map((c) => c.moved).sort((a, b) => a - b)[campsitesAdded.length >> 1] || 0} m)`);
  // the portages
  const T = usfsTrails(src, toLocal, inWild), pm = matchPortages(allP, T);
  const lone = T.map((t, i) => [t, i]).filter(([t, i]) => t.inside && t.lakeToLake && !pm.near[i].length);
  namesReport.usfsOnly = [];
  for (const [t] of lone) {
    const why = /CAMPSITE|SPUR|LOOP|CUT-OFF|ACCESS|\bTRL\b/.test(t.raw) ? 'a campsite spur or a loop, not a portage' : null;
    let rec = null, whyNot = why;
    if (!why) {
      const pts = joinLines(t.lines);
      const res = linkPortages([{ pts, keys: pts.map(([x, z]) => `u${t.no}:${x.toFixed(1)},${z.toFixed(1)}`), names: [] }], water);
      rec = res.kept[0] || null;
      if (!rec) whyNot = `not kept by the bake's rule (${(res.report.why && Object.keys(res.report.why).join(', ')) || 'dry'})`;
    }
    if (rec) {
      const nm = portageName(t.raw, rec.launch.map((l) => water.name(l.lake)));
      if (nm) rec.name = nm;
      rec.rods = t.rods; rec.fix = 'usfs'; rec.usfs = t.no;
      usfsAdded.push(rec);
    }
    namesReport.usfsOnly.push({ no: t.no, name: t.raw, rods: t.rods, added: !!rec, why: whyNot || undefined });
    log(`  USFS-only ${t.no} ${t.raw} (${t.rods} rods): ${rec ? `added, ${rec.name}` : whyNot}`);
  }
  log(`d1 names: ${lone.length} USFS lake-to-lake portages with no drawn portage within 400 m; added ${usfsAdded.length}`);
}

const out = {
  about: 'fb E (2026-10-24): runtime corrections for the data release baked at `for` (data-v3): the entry point landings at the real put-ins, and the portages the first bake dropped, connected. Made by scripts/world-fixes.mjs; a new bake has them built in. d1 names (2026-10-26): `campsites`, the official USFS sites OpenStreetMap lacks, appended to the release\'s; the portages with fix "usfs" are the clear USFS-only ones, appended after the connected ones.',
  for: index.source.baked,
  entryPoints: landings.filter((l) => !l.missing).map((l) => ({ ep: l.ep, name: l.name, x: l.x, z: l.z, lake: l.lake, lakeName: water.name(l.lake) })),
  portages: [...added, ...usfsAdded],
  campsites: campsitesAdded,
  report: { landings: rows, portages: { candidates: report.candidates, kept: report.kept, dropped: report.dropped, why: report.why, connected: report.added, done: report.done, left: report.left.map((l) => `${l.names.join('/') || 'unnamed'}: ${l.why}`), total: report.total } },
};
if (src) out.report.names = { campsitesAdded: campsitesAdded.length, usfsOnly: namesReport.usfsOnly };
fs.writeFileSync(outFile, JSON.stringify(out));
log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB): ${out.entryPoints.length} landings, ${added.length} portages connected, ${usfsAdded.length} USFS-only portages, ${campsitesAdded.length} campsites`);

// a USFS trail's pieces (in no set order) joined end to end where they meet (within 15 m); the longest run
function joinLines(lines) {
  const runs = lines.map((l) => l.slice());
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 15;
  for (let joined = true; joined && runs.length > 1;) {
    joined = false;
    outer: for (let a = 0; a < runs.length; a++) for (let b = 0; b < runs.length; b++) {
      if (a === b) continue;
      const A = runs[a], Bv = runs[b];
      let r = null;
      if (close(A[A.length - 1], Bv[0])) r = [...A, ...Bv.slice(1)];
      else if (close(A[A.length - 1], Bv[Bv.length - 1])) r = [...A, ...Bv.slice(0, -1).reverse()];
      else if (close(A[0], Bv[Bv.length - 1])) r = [...Bv, ...A.slice(1)];
      else if (close(A[0], Bv[0])) r = [...Bv.slice().reverse(), ...A.slice(1)];
      if (r) { runs.splice(Math.max(a, b), 1); runs.splice(Math.min(a, b), 1, r); joined = true; break outer; }
    }
  }
  const len = (l) => l.reduce((s, p, k) => s + (k ? Math.hypot(p[0] - l[k - 1][0], p[1] - l[k - 1][1]) : 0), 0);
  return runs.sort((a, b) => len(b) - len(a))[0];
}
function segD(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
  return Math.hypot(ax + dx * t - x, az + dz * t - z);
}
