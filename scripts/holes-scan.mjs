// Holes scan: where the drawn world can come apart along the water (the owner, 2026-10-27, playing v4: "giant holes
// sometimes, mostly in streams/creeks/rivers, especially in conjunction with a rapid or a waterfall"). Reads every fine
// tile of a release with the game's own decoders (grid.js TileGrid, terrain-build.js meshHeightAt) and measures, per
// core cell along the water:
//   edge     the near water patch (water.js) is drawn where the shore distance is under 0.6 m, at the level of its atlas
//            (bilinear; a land cell holds the level of the water a flood fill reaches it from first: --rule new, a land
//            corner takes the mean of the water corners round it, as grid.levelAt; --rule min, the lowest); the terrain
//            mesh there is the shore band shaped to grid.levelAt. Where the sheet's rim (shore distance 0 to 0.6 m, on the
//            land side of the waterline) stands over the terrain mesh it hangs in the air with the void under it: W - T.
//   farEdge  the same for the far water mesh's rim (water-build.js: a land vertex takes the highest level of the water
//            round it; --rule new or min, the lowest), its triangles and their shore distance as buildWaterChunk makes them
//   step     a level step between two neighbouring water cells (m), and whether a drop of rapids.json is within 150 m;
//            the steps away from any drop by what meets there (lake, river, creek: a waterway line's rasterized channel)
//   bed      a water cell whose bed stands over its own surface
//   bank     a land cell beside water lower than that water (the bake's shoreLandUnderWater)
//   nodata   a water cell whose level is no level (outside 100-800 m)
//   lidar    against the LiDAR (data-cache/lidar, --lidar dir): land within 60 m of water, the drawn ground's departure
//            from the LiDAR's ground; water, its level's from the LiDAR's water; walls, a drop over 8 m between
//            neighbouring land cells where the LiDAR's is under 4 m
//   seam     a tile's halo cells that differ from the core of the tile owning them (a crack along the tile edge)
// Sites: the worst cells, merged within 250 m, named for the nearest drop (rapids.json v4) and the water there.
//   node scripts/holes-scan.mjs [data dir] [--top 30] [--json out.json] [--only tx_ty,...] [--rule old|new]
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileGrid } from '../src/grid.js';
import { meshHeightAt } from '../src/terrain-build.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DATA = args[0] && !args[0].startsWith('--') ? args[0] : path.join(here, '../public/data');
const TOP = +opt('--top', 30);
const RULE = opt('--rule', 'old'); // old: the game as v4 shipped; new: the land-corner rules of this fix (min: the patch's land corners the lowest water, not the mean)
const ONLY = opt('--only', null) ? new Set(opt('--only').split(',')) : null;
const index = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
const G = index.grid, P = index.proj;
const RAPIDS = JSON.parse(fs.readFileSync(path.join(here, '../src/rapids.json'), 'utf8'));
const DROPS = (index.version >= 4 && RAPIDS.v4 ? RAPIDS.v4.white : RAPIDS.white) || [];
const lakeName = new Map(index.lakes.filter(Boolean).map((l) => [l.id, l.displayName || l.name]));
const isRiver = new Map(index.lakes.filter(Boolean).map((l) => [l.id, l.creek ? 'creek' : l.river ? 'river' : 'lake']));
const levelById = new Float32Array(index.lakes.length + 2);
for (const l of index.lakes.filter(Boolean)) levelById[l.id] = l.level;
const latLon = (x, z) => [+(P.lat0 - z / P.mPerDegLat).toFixed(4), +(P.lon0 + x / P.mPerDegLon).toFixed(4)];
const dropNear = (x, z, r) => { let b = null, bd = r; for (const w of DROPS) { const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; b = w; } } return b ? { w: b, d: bd } : null; };

// the patch's atlas level over a tile: water cells their own, land cells the first water a 4-way flood fill reaches
function floodLevel(grid) {
  const S = grid.side, N = S * S, L = new Float32Array(N).fill(NaN), q = new Int32Array(N);
  let head = 0, tail = 0;
  for (let m = 0; m < N; m++) if (grid.lake[m]) { L[m] = grid.lvl[m] * 0.1; q[tail++] = m; }
  while (head < tail) {
    const k = q[head++], x = k % S, y = (k - x) / S, v = L[k];
    if (x > 0 && Number.isNaN(L[k - 1])) { L[k - 1] = v; q[tail++] = k - 1; }
    if (x < S - 1 && Number.isNaN(L[k + 1])) { L[k + 1] = v; q[tail++] = k + 1; }
    if (y > 0 && Number.isNaN(L[k - S])) { L[k - S] = v; q[tail++] = k - S; }
    if (y < S - 1 && Number.isNaN(L[k + S])) { L[k + S] = v; q[tail++] = k + S; }
  }
  return L;
}

const stats = { tiles: 0, edge: { n: 0, over05: 0, over2: 0, over5: 0, max: 0 }, farEdge: { n: 0, over05: 0, over2: 0, over5: 0, max: 0 },
  step: { over1: 0, over3: 0, nearDrop: 0, awayOver1: 0, max: 0, kinds: {} }, bed: 0, bank: { n: 0, over2: 0, max: 0 },
  nodata: 0, seam: { cells: 0, h: 0, lake: 0, sd: 0, lvl: 0 },
  lidar: { land: 0, landOver5: 0, landOver10: 0, landOver20: 0, landMax: 0, water: 0, waterOver2: 0, waterOver5: 0, waterOver10: 0, waterMax: 0, walls: 0 } };
// the ground truth (the coordinator, 2026-10-27): the LiDAR's own 10 m products (data-cache/lidar/<tx>_<ty>.height.bin and
// .level.bin, Int16 dm, the 256-cell core of the same tiles; .mask.bin, valid where mask & 17 is 17), read where present
const LIDAR = opt('--lidar', path.join(process.env.BWCA_CACHE || path.join(here, '../../../../data-cache'), 'lidar'));
const lidarTile = (tx, ty) => {
  const rd = (ch, Type) => { const f = path.join(LIDAR, `${tx}_${ty}.${ch}.bin`); if (!fs.existsSync(f)) return null; const r = zlib.gunzipSync(fs.readFileSync(f)); return new Type(r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength)); };
  const h = rd('height', Int16Array), mask = rd('mask', Uint8Array);
  return h && mask ? { h, lvl: rd('level', Int16Array), mask } : null;
};
// a tile's four fields, for the seams: each halo cell against the core of the tile that owns it (a tile's edge vertices
// are built from its halo, its neighbour's from its core: any difference is a crack along the tile edge)
const fieldsCache = new Map();
const fieldsOf = (tx, ty) => {
  const k = `${tx}_${ty}`;
  if (fieldsCache.has(k)) return fieldsCache.get(k);
  const f = path.join(DATA, 'tiles', k + '.bin');
  let t = null;
  if (fs.existsSync(f)) {
    const raw = zlib.gunzipSync(fs.readFileSync(f)), b = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), n = (G.tile + 2 * G.halo) ** 2;
    t = { h: new Int16Array(b, 0, n), lake: new Uint16Array(b, n * 2, n), sd: new Int16Array(b, n * 4, n), lvl: new Int16Array(b, n * 6, n) };
  }
  if (fieldsCache.size > 200) fieldsCache.delete(fieldsCache.keys().next().value);
  fieldsCache.set(k, t);
  return t;
};
const worst = []; // { kind, gap, x, z }
const keep = (kind, gap, x, z, ids = null) => { if (gap > 1) worst.push({ kind, gap, x, z, ids }); };

const files = fs.readdirSync(path.join(DATA, 'tiles')).filter((f) => f.endsWith('.bin'));
for (const f of files) {
  const key = f.slice(0, -4);
  if (ONLY && !ONLY.has(key)) continue;
  const [tx, ty] = key.split('_').map(Number);
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(DATA, 'tiles', f)));
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const grid = new TileGrid({ cell: G.cell, originX: G.originX, originZ: G.originZ, tile: G.tile, halo: G.halo, fields: G.fields }, tx, ty, buf, levelById);
  const S = grid.side;
  { // the seams
    const T = G.tile, Hh = G.halo;
    for (let lj = 0; lj < S; lj++) for (let li = 0; li < S; li++) {
      if (lj >= Hh && lj < Hh + T && li >= Hh && li < Hh + T) continue;
      const gi = tx * T + li - Hh, gj = ty * T + lj - Hh;
      if (gi < 0 || gj < 0 || gi >= G.width || gj >= G.height) continue;
      const ox = Math.floor(gi / T), oy = Math.floor(gj / T), o = fieldsOf(ox, oy);
      if (!o) continue;
      const m = lj * S + li, mo = (gj - oy * T + Hh) * S + (gi - ox * T + Hh);
      stats.seam.cells++;
      if (grid.h[m] !== o.h[mo]) stats.seam.h++;
      if (grid.lake[m] !== o.lake[mo]) stats.seam.lake++;
      if (grid.sd[m] !== o.sd[mo]) stats.seam.sd++;
      if (grid.lvl[m] !== o.lvl[mo] && (grid.lake[m] || o.lake[mo])) stats.seam.lvl++;
    }
  }
  let any = false;
  for (let m = 0; m < S * S; m++) if (grid.lake[m]) { any = true; break; }
  if (!any) continue;
  stats.tiles++;
  const idsNear = (i, j, r = 1) => { const o = new Set(); for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const id = grid.lakeCell(i + di, j + dj); if (id) o.add(id); } return [...o].slice(0, 3); };
  { // the LiDAR check: within 60 m of water, the drawn ground (the terrain mesh at each cell centre) against the LiDAR's
    // ground, the water's level against the LiDAR's water, and drops between neighbouring land cells the LiDAR lacks
    const Ld = lidarTile(tx, ty), mc = new Map();
    if (Ld) {
      const T = G.tile, ok = (m) => (Ld.mask[m] & 17) === 17 && Ld.h[m] !== -32768;
      const drawn = (i, j) => meshHeightAt(grid, grid.cellX(i), grid.cellZ(j), mc);
      for (let lj = 0; lj < T; lj++) for (let li = 0; li < T; li++) {
        const m = lj * T + li, i = tx * T + li, j = ty * T + lj;
        if (!ok(m)) continue;
        const sdc = grid.sdCell(i, j), id = grid.lakeCell(i, j), x = grid.cellX(i), z = grid.cellZ(j);
        if (id) {
          if (!Ld.lvl || Ld.lvl[m] === -32768) continue;
          const d = Math.abs(grid.levelCell(i, j) - Ld.lvl[m] / 10);
          stats.lidar.water++;
          if (d > 2) { stats.lidar.waterOver2++; if (d > 5) stats.lidar.waterOver5++; if (d > 10) stats.lidar.waterOver10++; }
          if (d > stats.lidar.waterMax) stats.lidar.waterMax = d;
          if (d > 5) keep('lidarWater', d, x, z, [id]);
          continue;
        }
        if (sdc > 60) continue;
        const hd = drawn(i, j), d = Math.abs(hd - Ld.h[m] / 10);
        stats.lidar.land++;
        if (d > 5) { stats.lidar.landOver5++; if (d > 10) stats.lidar.landOver10++; if (d > 20) stats.lidar.landOver20++; }
        if (d > stats.lidar.landMax) stats.lidar.landMax = d;
        if (d > 5) keep('lidarLand', d, x, z, idsNear(i, j, 6));
        for (const [di, dj] of [[1, 0], [0, 1]]) {
          const li2 = li + di, lj2 = lj + dj;
          if (li2 >= T || lj2 >= T || !ok(lj2 * T + li2) || grid.lakeCell(i + di, j + dj)) continue;
          const dg = Math.abs(drawn(i + di, j + dj) - hd), dl = Math.abs(Ld.h[lj2 * T + li2] - Ld.h[m]) / 10;
          if (dg > 8 && dl < 4) { stats.lidar.walls++; keep('wall', dg - dl, x, z, idsNear(i, j, 6)); }
        }
      }
    }
  }
  const FL = floodLevel(grid);
  const fl = (i, j) => FL[grid.local(i, j)];
  const patchLevel = (x, z) => { // water.js levelAt: bilinear over the atlas
    const fx = (x - grid.originX) / grid.cell - 0.5, fz = (z - grid.originZ) / grid.cell - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
    let l00 = fl(i, j), l10 = fl(i + 1, j), l01 = fl(i, j + 1), l11 = fl(i + 1, j + 1);
    if (RULE !== 'old') { // a land corner of a quad with water takes the mean of its water corners (grid.levelAt's rule), or the lowest
      const w00 = grid.sdCell(i, j) < 0, w10 = grid.sdCell(i + 1, j) < 0, w01 = grid.sdCell(i, j + 1) < 0, w11 = grid.sdCell(i + 1, j + 1) < 0, nw = w00 + w10 + w01 + w11;
      if (nw && nw < 4) {
        const m = RULE === 'min' ? Math.min(w00 ? l00 : Infinity, w10 ? l10 : Infinity, w01 ? l01 : Infinity, w11 ? l11 : Infinity)
          : ((w00 ? l00 : 0) + (w10 ? l10 : 0) + (w01 ? l01 : 0) + (w11 ? l11 : 0)) / nw;
        if (!w00) l00 = m; if (!w10) l10 = m; if (!w01) l01 = m; if (!w11) l11 = m;
      }
    }
    return (l00 * (1 - ax) + l10 * ax) * (1 - az) + (l01 * (1 - ax) + l11 * ax) * az;
  };
  const farVertex = (i, j) => { // water-build.js vertexLevel
    if (grid.lakeCell(i, j)) return grid.levelCell(i, j);
    let b = RULE !== 'old' ? Infinity : -Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (grid.lakeCell(i + di, j + dj)) b = RULE !== 'old' ? Math.min(b, grid.levelCell(i + di, j + dj)) : Math.max(b, grid.levelCell(i + di, j + dj));
    return Number.isFinite(b) ? b : -Infinity;
  };
  // the far sheet at a point of quad (i, j) (cell centres i..i+1, j..j+1) as buildWaterChunk triangulates it, and its
  // interpolated shore distance (the shader's vShore)
  const farAt = (i, j, u, w, out) => {
    const v = [farVertex(i, j), farVertex(i + 1, j), farVertex(i, j + 1), farVertex(i + 1, j + 1)];
    const s = [grid.sdCell(i, j), grid.sdCell(i + 1, j), grid.sdCell(i, j + 1), grid.sdCell(i + 1, j + 1)];
    const tri = (f) => { // a c b, b c d (even) / a c d, a d b (odd): barycentric on the unit square
      if (((i + j) & 1) === 0) return u + w <= 1 ? f[0] + (f[1] - f[0]) * u + (f[2] - f[0]) * w : f[3] + (f[2] - f[3]) * (1 - u) + (f[1] - f[3]) * (1 - w);
      return u >= w ? f[0] + (f[1] - f[0]) * u + (f[3] - f[1]) * w : f[0] + (f[2] - f[0]) * w + (f[3] - f[2]) * u;
    };
    out[0] = tri(v); out[1] = tri(s);
    return out;
  };
  const fo = [0, 0];

  const cache = new Map();
  const i0 = tx * G.tile, j0 = ty * G.tile;
  for (let j = j0; j < j0 + G.tile; j++) for (let i = i0; i < i0 + G.tile; i++) {
    const id = grid.lakeCell(i, j), x = grid.cellX(i), z = grid.cellZ(j), sdc = grid.sdCell(i, j);
    if (id) {
      const L = grid.levelCell(i, j);
      if (grid.hCell(i, j) > L + 0.05) stats.bed++;
      if (!(L > 100 && L < 800)) stats.nodata++; // a level no water here has (the release's levels run 180-700 m)
      for (const [di, dj] of [[1, 0], [0, 1]]) {
        const id2 = grid.lakeCell(i + di, j + dj);
        if (!id2) continue;
        const d = Math.abs(grid.levelCell(i + di, j + dj) - L);
        if (d > stats.step.max) stats.step.max = d;
        if (d > 1) {
          stats.step.over1++; if (d > 3) stats.step.over3++;
          if (dropNear(x, z, 150)) stats.step.nearDrop++;
          else {
            stats.step.awayOver1++; keep('step', d, x, z, [id, id2]);
            // what meets at the step: the polygons' kinds (lake, river, creek: a waterway line's channel) and whether one polygon
            const k = `${[isRiver.get(id), isRiver.get(id2)].sort().join('-')}${id === id2 ? ' (one polygon)' : ''}`;
            stats.step.kinds[k] = (stats.step.kinds[k] || 0) + 1;
          }
        }
      }
    } else if (sdc < 25) {
      let hi = -Infinity;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (grid.lakeCell(i + di, j + dj)) hi = Math.max(hi, grid.levelCell(i + di, j + dj));
      if (hi > -Infinity) {
        const g = hi - grid.hCell(i, j);
        if (g > 0) { stats.bank.n++; if (g > 2) stats.bank.over2++; if (g > stats.bank.max) stats.bank.max = g; }
      }
    }
    if (Math.abs(sdc) > 14) continue;
    // the patch's drawn rim (water.js discards past a shore distance of 0.6 m): sample the cell at 1.25 m, keep the
    // points on the land side of the shoreline it still draws, and how high the sheet stands over the terrain mesh there
    let worstE = 0;
    for (let b = 0; b < 8; b++) for (let a = 0; a < 8; a++) {
      const px = x - 5 + (a + 0.5) * 1.25, pz = z - 5 + (b + 0.5) * 1.25, sd = grid.shoreAt(px, pz);
      if (sd <= 0 || sd > 0.6) continue;
      const W = patchLevel(px, pz), T = meshHeightAt(grid, px, pz, cache), gap = W - T;
      stats.edge.n++;
      if (gap > worstE) worstE = gap;
    }
    if (worstE > 0.5) { stats.edge.over05++; if (worstE > 2) stats.edge.over2++; if (worstE > 5) stats.edge.over5++; }
    if (worstE > stats.edge.max) stats.edge.max = worstE;
    if (worstE > 1) keep('edge', worstE, x, z, idsNear(i, j));
    // the far mesh's rim the same way, over the quad from this cell's centre (water-build.js: a land vertex takes a level
    // from the water round it)
    let worstF = 0, anyF = false;
    for (let b = 0; b < 8; b++) for (let a = 0; a < 8; a++) {
      const u = (a + 0.5) / 8, w = (b + 0.5) / 8;
      farAt(i, j, u, w, fo);
      if (!(fo[1] > 0 && fo[1] <= 0.6) || !(fo[0] > -1e6)) continue;
      const g = fo[0] - meshHeightAt(grid, x + u * G.cell, z + w * G.cell, cache);
      anyF = true;
      if (g > worstF) worstF = g;
    }
    if (anyF) {
      stats.farEdge.n++;
      if (worstF > 0.5) { stats.farEdge.over05++; if (worstF > 2) stats.farEdge.over2++; if (worstF > 5) stats.farEdge.over5++; }
      if (worstF > stats.farEdge.max) stats.farEdge.max = worstF;
      if (worstF > 1) keep('farEdge', worstF, x, z, idsNear(i, j));
    }
  }
}

// sites: merge within 250 m per kind, worst first
const sites = [];
worst.sort((a, b) => b.gap - a.gap);
for (const w of worst) {
  const s = sites.find((s) => s.kind === w.kind && Math.hypot(s.x - w.x, s.z - w.z) < 250);
  if (s) { s.cells++; continue; }
  sites.push({ ...w, cells: 1 });
}
const named = (s) => {
  const d = dropNear(s.x, s.z, 400);
  return { kind: s.kind, gap: +s.gap.toFixed(1), cells: s.cells, x: Math.round(s.x), z: Math.round(s.z), latLon: latLon(s.x, s.z),
    drop: d ? `${d.w.name || '(unnamed ' + d.w.kind + ')'} ${d.w.kind} ${Math.round(d.d)} m, ${d.w.drop} m drop` : null,
    water: s.ids ? s.ids.map((id) => `${lakeName.get(id) || '?'} [${isRiver.get(id)} ${id}]`).join(' / ') : null };
};
for (const k of ['edge', 'farEdge']) { const e = stats[k]; e.max = +e.max.toFixed(1); }
stats.lidar.landMax = +stats.lidar.landMax.toFixed(1); stats.lidar.waterMax = +stats.lidar.waterMax.toFixed(1);
stats.step.max = +stats.step.max.toFixed(1); stats.bank.max = +stats.bank.max.toFixed(1);
const out = { data: DATA, rule: RULE, stats, top: {} };
for (const k of ['edge', 'farEdge', 'step', 'lidarLand', 'lidarWater', 'wall']) out.top[k] = sites.filter((s) => s.kind === k).slice(0, TOP).map(named);
console.log(JSON.stringify(stats, null, 1));
for (const k of Object.keys(out.top)) { console.log(`\n${k}:`); for (const s of out.top[k]) console.log(`  ${s.gap} m  x${s.cells}  (${s.x}, ${s.z})  ${s.latLon.join(',')}  ${s.drop || ''}${s.water ? '  ' + s.water : ''}`); }
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(out, null, 1));
