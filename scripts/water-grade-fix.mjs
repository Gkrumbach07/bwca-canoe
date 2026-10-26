#!/usr/bin/env node
// p2 B: the runtime correction of a published data release's river and creek levels (water-grade.mjs): reads that
// release's own tiles and index, grades the levels on the whole grid exactly as a new bake does, and writes
// src/water-grade.bin, which the tile worker applies to each tile as it arrives (src/water-levels.js). Each tile's entry
// carries a hash of the tile's level field as the release has it, so any other bake is left as it is. A new bake grades
// its levels itself and needs no table.
//
//   node --max-old-space-size=8192 scripts/water-grade-fix.mjs [--data public/data] [--out src/water-grade.bin]
//        [--fixes src/world-fixes.json] [--box x0,z0,x1,z1 (a test: grade only the water there)] [--report file.json]
//
// The file (gzip of little-endian binary):
//   u32 magic 'WGR1', u16 version 2, u16 0, u32 fine tiles, u32 far tiles, f64 the release's bake time (ms since 1970)
//   per tile: u8 level (0 fine, 1 far), u8 0, u16 tx, u16 ty, u16 0, u32 hash (FNV-1a of the level field's 16-bit
//   words, the whole tile with its halo, as baked), u32 runs, u32 cells, then runs x (u16 row, u16 col, u16 length) in
//   the tile's own cells (halo included), then per cell a fine tile's change (dm, to the height and the level both: the
//   water and its bed move together) or a far tile's change of height and of level, each an i8 difference from the
//   same value of the cell before it in its run (the first of a run from 0): the changes run smooth along a channel.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { gradeLevels, GRADE } from './water-grade.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', 'public/data').replace(/\/?$/, '/');
const outFile = arg('--out', 'src/water-grade.bin');
const fixesFile = arg('--fixes', 'src/world-fixes.json');
const box = arg('--box', null) ? arg('--box').split(',').map(Number) : null;
const reportFile = arg('--report', null);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const g = index.grid, W = g.width, H = g.height, N = W * H, T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, n = SIDE * SIDE;
const FAR = g.far.factor, FT = g.far.tile, FH = g.far.halo, FS = FT + 2 * FH, farW = g.far.width, farH = g.far.height;
export const fnv = (a) => { let h = 0x811c9dc5; for (let i = 0; i < a.length; i++) { h ^= a[i] & 0xffff; h = Math.imul(h, 0x01000193); } return h >>> 0; };

// --- the whole grid from the tiles' cores
const lakeId = new Uint16Array(N), hgt = new Int16Array(N), lvl = new Int16Array(N);
const readTile = (file) => { const raw = zlib.gunzipSync(fs.readFileSync(file)); return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength); };
const tileHash = new Map();
for (let ty = 0; ty < g.nty; ty++) for (let tx = 0; tx < g.ntx; tx++) {
  const buf = readTile(`${dataDir}tiles/${tx}_${ty}.bin`);
  const h = new Int16Array(buf, 0, n), l = new Uint16Array(buf, n * 2, n), v = new Int16Array(buf, n * 6, n);
  tileHash.set(`${tx},${ty}`, fnv(v));
  for (let lj = 0; lj < T; lj++) {
    const j = ty * T + lj; if (j >= H) break;
    for (let li = 0; li < T; li++) {
      const i = tx * T + li; if (i >= W) break;
      const m = (lj + HALO) * SIDE + li + HALO, k = j * W + i;
      lakeId[k] = l[m]; hgt[k] = h[m]; lvl[k] = v[m];
    }
  }
}
log(`read ${g.ntx * g.nty} tiles`);
const isRiver = new Uint8Array(index.lakes.length + 1);
for (const l of index.lakes) if (l && l.river) isRiver[l.id] = 1;
const inBox = (k) => { if (!box) return true; const i = k % W, j = (k - i) / W, x = g.originX + (i + 0.5) * g.cell, z = g.originZ + (j + 0.5) * g.cell; return x >= box[0] && x <= box[2] && z >= box[1] && z <= box[3]; };
const river = [];
for (let k = 0; k < N; k++) if (lakeId[k] && isRiver[lakeId[k]] && inBox(k)) river.push(k);
log(`${river.length} river and creek cells${box ? ' in the box' : ''}`);

// --- the portages as the game has them: the release's own, then the ones world-fixes.json connects
const portages = [...index.portages];
try {
  const f = JSON.parse(fs.readFileSync(fixesFile, 'utf8'));
  if (f.for === index.source.baked) for (const p of f.portages || []) portages.push(p);
} catch { /* no table */ }

const t0 = Date.now();
const res = gradeLevels({
  W, H, cell: g.cell, originX: g.originX, originZ: g.originZ,
  lake: (k) => lakeId[k], river: (id) => !!isRiver[id], level: (k) => lvl[k], height: (k) => hgt[k],
  riverCells: Int32Array.from(river), portages,
}, reportFile ? { sample: true } : {});
{ const { sample, ...st } = res.stats; void sample; log(`graded in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${JSON.stringify(st)}`); }
const delta = new Int16Array(N);
for (let a = 0; a < res.cells.length; a++) delta[res.cells[a]] = res.delta[a];

// --- the fine tiles' records: every cell of the tile (the halo replicates the grid's edge, as the bake writes it)
const recs = [];
const clampI = (i) => Math.max(0, Math.min(W - 1, i)), clampJ = (j) => Math.max(0, Math.min(H - 1, j));
let fineCells = 0;
for (let ty = 0; ty < g.nty; ty++) for (let tx = 0; tx < g.ntx; tx++) {
  const runs = [], vals = [];
  for (let lj = 0; lj < SIDE; lj++) {
    const j = clampJ(ty * T - HALO + lj);
    let start = -1;
    for (let li = 0; li <= SIDE; li++) {
      const d = li < SIDE ? delta[j * W + clampI(tx * T - HALO + li)] : 0;
      if (d && start < 0) start = li;
      if (!d && start >= 0) { runs.push(lj, start, li - start); start = -1; }
      if (d) vals.push(d);
    }
  }
  if (!vals.length) continue;
  fineCells += vals.length;
  recs.push({ level: 0, tx, ty, hash: tileHash.get(`${tx},${ty}`), runs, vals });
}
// --- the far field: each 80 m cell's level is the fine cell nearest the water's (the lowest shore distance, the first
// in reading order), its height the mean of its 64 cells (bake.mjs pass 2); checked against the far tiles as they are
const sdOf = new Int16Array(N);
for (let ty = 0; ty < g.nty; ty++) for (let tx = 0; tx < g.ntx; tx++) {
  const buf = readTile(`${dataDir}tiles/${tx}_${ty}.bin`), s = new Int16Array(buf, n * 4, n);
  for (let lj = 0; lj < T; lj++) { const j = ty * T + lj; if (j >= H) break; for (let li = 0; li < T; li++) { const i = tx * T + li; if (i >= W) break; sdOf[j * W + i] = s[(lj + HALO) * SIDE + li + HALO]; } }
}
const farDh = new Int16Array(farW * farH), farDl = new Int16Array(farW * farH), farOld = new Int16Array(farW * farH * 2);
let farCells = 0;
for (let fj = 0; fj < farH; fj++) for (let fi = 0; fi < farW; fi++) {
  let sh = 0, dsum = 0, minSd = 32767, kStar = -1, any = false;
  for (let dj = 0; dj < FAR; dj++) for (let di = 0; di < FAR; di++) {
    const k = (fj * FAR + dj) * W + fi * FAR + di;
    sh += hgt[k]; dsum += delta[k]; if (delta[k]) any = true;
    if (sdOf[k] < minSd) { minSd = sdOf[k]; kStar = k; }
  }
  const f = fj * farW + fi, h0 = Math.round(sh / (FAR * FAR));
  farOld[f * 2] = h0; farOld[f * 2 + 1] = minSd < 0 ? lvl[kStar] : h0;
  if (!any) continue;
  const h1 = Math.round((sh + dsum) / (FAR * FAR));
  farDh[f] = h1 - h0;
  farDl[f] = minSd < 0 ? delta[kStar] : h1 - h0;
  if (farDh[f] || farDl[f]) farCells++;
}
let farChecked = 0, farMismatch = 0;
const nF = FS * FS;
for (let fy = 0; fy < g.far.nty; fy++) for (let fx = 0; fx < g.far.ntx; fx++) {
  const file = `${dataDir}far/${fx}_${fy}.bin`;
  if (!fs.existsSync(file)) continue;
  const buf = readTile(file), h = new Int16Array(buf, 0, nF), v = new Int16Array(buf, nF * 6, nF);
  const runs = [], vals = [];
  for (let lj = 0; lj < FS; lj++) {
    const j = Math.max(0, Math.min(farH - 1, fy * FT - FH + lj));
    let start = -1;
    for (let li = 0; li <= FS; li++) {
      let d = false, f = -1;
      if (li < FS) {
        f = j * farW + Math.max(0, Math.min(farW - 1, fx * FT - FH + li));
        const m = lj * FS + li;
        farChecked++; if (h[m] !== farOld[f * 2] || v[m] !== farOld[f * 2 + 1]) farMismatch++;
        d = !!(farDh[f] || farDl[f]);
      }
      if (d && start < 0) start = li;
      if (!d && start >= 0) { runs.push(lj, start, li - start); start = -1; }
      if (d) vals.push(farDh[f], farDl[f]);
    }
  }
  if (!vals.length) continue;
  recs.push({ level: 1, tx: fx, ty: fy, hash: fnv(v), runs, vals });
}
log(`far field: ${farChecked} cells checked against the far tiles, ${farMismatch} differ from the recomputation; ${farCells} far cells change`);
if (farMismatch) log('  (the far tiles differ from what the fine tiles say: their levels are left as the tiles have them where they differ)');

// --- the file
const fine = recs.filter((r) => r.level === 0).length, far = recs.length - fine;
let size = 24;
for (const r of recs) size += 20 + r.runs.length * 2 + r.vals.length;
const out = Buffer.alloc(size);
let o = 0;
o = out.writeUInt32LE(0x31524757, o); o = out.writeUInt16LE(2, o); o = out.writeUInt16LE(0, o);
o = out.writeUInt32LE(fine, o); o = out.writeUInt32LE(far, o); o = out.writeDoubleLE(Date.parse(index.source.baked) || 0, o);
for (const r of recs) {
  o = out.writeUInt8(r.level, o); o = out.writeUInt8(0, o); o = out.writeUInt16LE(r.tx, o); o = out.writeUInt16LE(r.ty, o); o = out.writeUInt16LE(0, o);
  o = out.writeUInt32LE(r.hash, o); o = out.writeUInt32LE(r.runs.length / 3, o); o = out.writeUInt32LE(r.level ? r.vals.length / 2 : r.vals.length, o);
  for (const x of r.runs) o = out.writeUInt16LE(x, o);
  const per = r.level ? 2 : 1;
  for (let q = 0, c = 0; q < r.runs.length; q += 3) {
    const prev = [0, 0];
    for (let m = 0; m < r.runs[q + 2]; m++, c++) for (let e = 0; e < per; e++) {
      const x = r.vals[c * per + e], dd = x - prev[e];
      if (dd < -128 || dd > 127) throw new Error(`a change of ${dd} dm between neighbours does not fit the table`);
      o = out.writeInt8(dd, o); prev[e] = x;
    }
  }
}
const gz = zlib.gzipSync(out, { level: 9 });
fs.writeFileSync(outFile, gz);
log(`wrote ${outFile}: ${fine} fine tiles (${fineCells} cells with their halos), ${far} far tiles, ${(out.length / 1024).toFixed(0)} KB, ${(gz.length / 1024).toFixed(0)} KB gzipped`);
if (reportFile) fs.writeFileSync(reportFile, JSON.stringify({ grade: GRADE, stats: res.stats, cells: Array.from(res.cells), delta: Array.from(res.delta) }));
