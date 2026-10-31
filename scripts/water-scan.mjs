// Water scan (water edges, 2026-10-31; the owner playing v4 with the 2 m ground: "water does not go to the edge of what
// the lake bottom is", "some narrow rapids barely have any water and you get intermittent chunks of ripple", "narrow
// waterways (lakes and streams) are completely unnavigable"). Reads every fine tile of a release with the game's own
// decoders (grid.js TileGrid, terrain-build.js meshHeightAt) and measures:
//   edge     (a) land cells within 20 m of the water where the LiDAR (data-cache/lidar) has hydro-flat water or ground
//            under the water beside them by 0.3 m or more: the bed the 2 m ground draws there (detail-build.js holds it at
//            the water's level, a flat dry shelf) with no water drawn over it. Also water cells whose drawn bed stands
//            within 5 cm of their surface or over it (bedUp)
//   shallow  (b) river and creek cells (a waterway's channel, a river polygon) whose drawn depth (level - the terrain mesh
//            at the cell centre) is under 0.15 m; and isolated water cells (no water among the four round them: the
//            channel joined only at a corner, which the water sheet and the white water draw as separate patches)
//   nav      (c) along every OpenStreetMap waterway (canoe-routes.mjs: the flowlines and links of the canoe network,
//            rivers, streams), every 2 m, whether the canoe passes there as player.js updatePaddle lets it (the shore
//            distance under -1.2 m at the middle and under -0.5 m 2.3 m ahead and behind, heading along the line); a run
//            of blocked samples with passable water on both sides (or a junction with another line) is a block. Lines by
//            class: route (a canoe route by its tags), portage (an untagged stream with a portage end near both ends),
//            other (untagged streams). Also the least depth and least half-width (-shore distance) along the passable part.
//   node scripts/water-scan.mjs [data dir] [--top 25] [--json out.json] [--lidar dir]
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileGrid } from '../src/grid.js';
import { meshHeightAt } from '../src/terrain-build.js';
import { loadCanoeLines, taggedRoute, PORTAGE_REACH } from './canoe-routes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DATA = args[0] && !args[0].startsWith('--') ? args[0] : path.join(here, '../public/data');
const TOP = +opt('--top', 25);
const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
const G = index.grid, P = index.proj;
const LIDAR = opt('--lidar', path.join(process.env.BWCA_CACHE || path.join(here, '../data-cache'), 'lidar'));
const levelById = new Float32Array(index.lakes.length + 2);
for (const l of index.lakes.filter(Boolean)) levelById[l.id] = l.level;
const lakeRec = new Map(index.lakes.filter(Boolean).map((l) => [l.id, l]));
const kindOf = (id) => { const l = lakeRec.get(id); return !l ? '?' : l.creek ? 'creek' : l.river ? 'river' : 'lake'; };
const nameOf = (id) => { const l = lakeRec.get(id); return l ? l.displayName || l.name || '?' : '?'; };
const latLon = (x, z) => [+(P.lat0 - z / P.mPerDegLat).toFixed(5), +(P.lon0 + x / P.mPerDegLon).toFixed(5)];
const toLocal = (lat, lon) => [(lon - P.lon0) * P.mPerDegLon, (P.lat0 - lat) * P.mPerDegLat];

// tiles on demand (an LRU of decoded grids)
const tiles = new Map();
const tileAt = (tx, ty) => {
  const k = `${tx}_${ty}`;
  if (tiles.has(k)) { const t = tiles.get(k); tiles.delete(k); tiles.set(k, t); return t; }
  const f = path.join(DATA, 'tiles', k + '.bin');
  let t = null;
  if (fs.existsSync(f)) {
    const raw = zlib.gunzipSync(fs.readFileSync(f));
    t = new TileGrid({ cell: G.cell, originX: G.originX, originZ: G.originZ, tile: G.tile, halo: G.halo, fields: G.fields }, tx, ty, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), levelById);
    t.cache = new Map();
  }
  tiles.set(k, t);
  if (tiles.size > 24) tiles.delete(tiles.keys().next().value);
  return t;
};
const gridAt = (x, z) => {
  const i = Math.floor((x - G.originX) / G.cell), j = Math.floor((z - G.originZ) / G.cell);
  if (i < 0 || j < 0 || i >= G.width || j >= G.height) return null;
  return tileAt(Math.floor(i / G.tile), Math.floor(j / G.tile));
};
const shoreAt = (x, z) => { const g = gridAt(x, z); return g ? g.shoreAt(x, z) : 3000; };
const lidarTile = (tx, ty) => {
  const rd = (ch, Type) => { const f = path.join(LIDAR, `${tx}_${ty}.${ch}.bin`); if (!fs.existsSync(f)) return null; const r = zlib.gunzipSync(fs.readFileSync(f)); return new Type(r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength)); };
  const h = rd('height', Int16Array), mask = rd('mask', Uint8Array);
  return h && mask ? { h, mask } : null;
};

const S = {
  edge: { land: 0, lidarWater: 0, lidarLow: 0, lidarLow1: 0, bedUp: 0, waterCells: 0 },
  shallow: { riverCells: 0, under15: 0, under30: 0, isolated: 0, isolatedRiver: 0 },
  nav: {},
};
const worst = [];
const keep = (kind, v, x, z, extra) => worst.push({ kind, v, x, z, ...extra });

// (a) and (b), tile by tile
const PARTS = opt('--parts', 'edge,shallow,nav');
const files = PARTS.includes('edge') || PARTS.includes('shallow') ? fs.readdirSync(path.join(DATA, 'tiles')).filter((f) => f.endsWith('.bin')) : [];
for (const f of files) {
  const [tx, ty] = f.slice(0, -4).split('_').map(Number);
  const grid = tileAt(tx, ty);
  if (!grid) continue;
  let any = false;
  for (let m = 0; m < grid.side * grid.side; m++) if (grid.lake[m]) { any = true; break; }
  if (!any) continue;
  const Ld = lidarTile(tx, ty), T = G.tile, i0 = tx * T, j0 = ty * T, cache = grid.cache;
  for (let lj = 0; lj < T; lj++) for (let li = 0; li < T; li++) {
    const i = i0 + li, j = j0 + lj, id = grid.lakeCell(i, j), sd = grid.sdCell(i, j), x = grid.cellX(i), z = grid.cellZ(j);
    if (id) {
      const L = grid.levelCell(i, j), bed = meshHeightAt(grid, x, z, cache), d = L - bed, k = kindOf(id);
      S.edge.waterCells++;
      if (d < 0.05) S.edge.bedUp++;
      let n4 = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (grid.lakeCell(i + di, j + dj)) n4++;
      if (!n4) { S.shallow.isolated++; if (k !== 'lake') S.shallow.isolatedRiver++; }
      if (k !== 'lake') {
        S.shallow.riverCells++;
        if (d < 0.3) { S.shallow.under30++; if (d < 0.15) { S.shallow.under15++; keep('shallow', 0.15 - d, x, z, { id, depth: +d.toFixed(2) }); } }
      }
      continue;
    }
    if (sd > 20 || !Ld) continue;
    const m = lj * T + li;
    if ((Ld.mask[m] & 17) !== 17 || Ld.h[m] === -32768) continue;
    // the level of the nearest water (the lowest of the nearest ring)
    let lv = Infinity, wid = 0;
    for (let r = 1; r <= 2 && lv === Infinity; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const q = grid.lakeCell(i + di, j + dj); if (q) { const v = grid.levelCell(i + di, j + dj); if (v < lv) { lv = v; wid = q; } } }
    if (lv === Infinity) continue;
    S.edge.land++;
    const low = lv - Ld.h[m] / 10;
    if (Ld.mask[m] & 2) S.edge.lidarWater++;
    if (low >= 0.3) { S.edge.lidarLow++; if (low >= 1) S.edge.lidarLow1++; keep('edge', low, x, z, { id: wid, flat: !!(Ld.mask[m] & 2) }); }
  }
}

// (c) along the waterway lines
const ports = [];
for (const p of index.portages) for (const e of [p.pts[0], p.pts[p.pts.length - 1]]) ports.push(e);
const portNear = (x, z, r) => ports.some(([px, pz]) => Math.abs(px - x) < r && Math.abs(pz - z) < r && Math.hypot(px - x, pz - z) < r);
const lines = loadCanoeLines();
const ends = new Map(); // node position -> count of lines ending or starting there (junctions)
const keyOf = ([la, lo]) => `${la.toFixed(6)},${lo.toFixed(6)}`;
for (const l of lines) { if (taggedRoute(l) < 0) continue; for (const e of [l.pts[0], l.pts[l.pts.length - 1]]) ends.set(keyOf(e), (ends.get(keyOf(e)) || 0) + 1); }
const inGrid = (x, z) => x > G.originX + 50 && z > G.originZ + 50 && x < G.originX + G.width * G.cell - 50 && z < G.originZ + G.height * G.cell - 50;
const navOk = (x, z, fx, fz) => shoreAt(x, z) < -1.2 && shoreAt(x + fx * 2.3, z + fz * 2.3) < -0.5 && shoreAt(x - fx * 2.3, z - fz * 2.3) < -0.5;
export function classify(l, a, b) {
  const t = taggedRoute(l);
  if (t > 0) return 'route';
  if (t < 0) return 'not';
  return portNear(a[0], a[1], PORTAGE_REACH) && portNear(b[0], b[1], PORTAGE_REACH) ? 'portage' : 'other';
}
for (const l of PARTS.includes('nav') ? lines : []) {
  const pts = l.pts.map(([la, lo]) => toLocal(la, lo));
  if (!pts.some(([x, z]) => inGrid(x, z))) continue;
  const cls = classify(l, pts[0], pts[pts.length - 1]);
  const st = (S.nav[cls] ||= { lines: 0, km: 0, wetKm: 0, blockedLines: 0, blocks: 0, blockedM: 0, under06: 0, halfUnder2: 0 });
  st.lines++;
  // samples every 2 m
  const smp = [];
  for (let s = 1; s < pts.length; s++) {
    const [x1, z1] = pts[s - 1], [x2, z2] = pts[s], L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 1e-6) continue;
    const fx = (x2 - x1) / L, fz = (z2 - z1) / L, n = Math.max(1, Math.ceil(L / 2));
    for (let q = 0; q < n; q++) { const t = q / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t; if (inGrid(x, z)) smp.push({ x, z, ok: navOk(x, z, fx, fz) }); }
  }
  if (smp.length < 2) continue;
  st.km += smp.length * 0.002;
  const startJ = (ends.get(keyOf(l.pts[0])) || 0) > 1, endJ = (ends.get(keyOf(l.pts[l.pts.length - 1])) || 0) > 1;
  let blocked = false, minD = Infinity, minHalf = Infinity, wet = 0;
  for (let a = 0; a < smp.length;) {
    if (smp[a].ok) {
      wet++;
      const g = gridAt(smp[a].x, smp[a].z), d = g.levelAt(smp[a].x, smp[a].z, 4) - meshHeightAt(g, smp[a].x, smp[a].z, g.cache), h = -g.shoreAt(smp[a].x, smp[a].z);
      if (d < minD) minD = d; if (h < minHalf) minHalf = h;
      a++; continue;
    }
    let b = a; while (b < smp.length && !smp[b].ok) b++;
    const interior = (a > 0 || startJ) && (b < smp.length || endJ) && wet + (smp.length - b) > 0;
    if (interior && (a > 0 || b < smp.length)) {
      const len = (b - a) * 2;
      blocked = true; st.blocks++; st.blockedM += len;
      const mid = smp[(a + b) >> 1];
      keep('nav', len, mid.x, mid.z, { cls, name: l.name, wkind: l.kind, osm: `way/${l.id}`, canoe: l.canoe, route: l.route });
    }
    a = b;
  }
  st.wetKm += wet * 0.002;
  if (blocked) st.blockedLines++;
  if (minD < 0.6) st.under06++;
  if (minHalf < 2) st.halfUnder2++;
}
for (const k of Object.keys(S.nav)) { const s = S.nav[k]; s.km = +s.km.toFixed(1); s.wetKm = +s.wetKm.toFixed(1); s.blockedKm = +(s.blockedM / 1000).toFixed(2); delete s.blockedM; }

// sites: merged within 200 m per kind, the worst first
const sites = [];
worst.sort((a, b) => b.v - a.v);
for (const w of worst) {
  const s = sites.find((s) => s.kind === w.kind && Math.abs(s.x - w.x) < 200 && Math.abs(s.z - w.z) < 200);
  if (s) { s.n++; if (w.kind === 'nav') s.total += w.v; continue; }
  sites.push({ ...w, n: 1, total: w.v });
}
const near = (x, z) => { const g = gridAt(x, z); if (!g) return ''; const i = g.cellI(x), j = g.cellJ(z); for (let r = 0; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const id = g.lakeCell(i + di, j + dj); if (id) return `${nameOf(id)} [${kindOf(id)} ${id}]`; } return ''; };
const out = { data: DATA, stats: S, top: {} };
for (const k of ['nav', 'shallow', 'edge']) {
  const list = sites.filter((s) => s.kind === k);
  if (k === 'nav') { list.sort((a, b) => b.total - a.total); const rt = list.filter((s) => s.cls === 'route' || s.cls === 'portage'); list.length = 0; list.push(...rt); } // the canoe routes' blocks (the rest are counted above)
  out.top[k] = list.slice(0, TOP).map((s) => ({ v: +s.v.toFixed(2), n: s.n, total: Math.round(s.total), x: Math.round(s.x), z: Math.round(s.z), latLon: latLon(s.x, s.z), what: s.kind === 'nav' ? `${s.name || '(unnamed)'} ${s.wkind} ${s.cls} ${s.osm} ${s.canoe ? 'canoe=' + s.canoe : ''} ${s.route || ''}`.trim() : near(s.x, s.z) + (s.flat ? ' (LiDAR water)' : '') }));
}
console.log(JSON.stringify(S, null, 1));
for (const k of Object.keys(out.top)) { console.log(`\n${k}:`); for (const s of out.top[k]) console.log(`  ${k === 'nav' ? s.total + ' m blocked' : s.v} x${s.n}  (${s.x}, ${s.z})  ${s.latLon.join(',')}  ${s.what}`); }
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
