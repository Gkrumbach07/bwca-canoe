// p2 B: the rivers' and creeks' graded water levels for the release already published (the owner, 2026-10-26: "creeks
// will have giant elevation changes and are abrupt. they are sorta like waterfalls in a way"). The release's bake gave
// each 10 m cell of a river its own level from a staircase fit, so creeks stepped down in walls of water a cell wide;
// scripts/water-grade.mjs grades them along their channels (ramps of half a per cent where they were steps, the
// rapids at the portages kept short and steep), and scripts/water-grade-fix.mjs ran it over that release's tiles into
// water-grade.bin: per tile, the change to each cell's level and, with it, the bed under it (dm). The tile worker
// applies it to each tile's buffer as it arrives (gradeTile), before anything is built from it, so the terrain, the
// far water, the patch's atlas, the plants and every levelAt read the graded surface. A tile whose level field is not
// the one the table was made from (its hash differs: another bake, which grades its own) is left as it is.
//
// The file (gzip): u32 'WGR1', u16 version 2, u16, u32 fine tiles, u32 far tiles, f64 bake time; per tile u8 level (0
// fine, 1 far), u8, u16 tx, u16 ty, u16, u32 hash, u32 runs, u32 cells, runs x (u16 row, u16 col, u16 length), then per
// cell its change in dm (fine: to the height and the level both) or two (far: the height, then the level), each an i8
// difference from the same value of the cell before it in its run.

const URL_ = new URL('./water-grade.bin', import.meta.url);
let table = null; // Promise<Map<string, { hash, runs: Uint16Array, vals: Int16Array }>>

async function load() {
  const res = await fetch(URL_);
  if (!res.ok) return new Map();
  const buf = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const dv = new DataView(buf), map = new Map();
  if (dv.getUint32(0, true) !== 0x31524757 || dv.getUint16(4, true) !== 2) return map;
  const count = dv.getUint32(8, true) + dv.getUint32(12, true);
  let o = 24;
  for (let r = 0; r < count; r++) {
    const level = dv.getUint8(o), tx = dv.getUint16(o + 2, true), ty = dv.getUint16(o + 4, true), hash = dv.getUint32(o + 8, true);
    const nRuns = dv.getUint32(o + 12, true), nCells = dv.getUint32(o + 16, true);
    o += 20;
    const runs = new Uint16Array(nRuns * 3);
    for (let k = 0; k < runs.length; k++, o += 2) runs[k] = dv.getUint16(o, true);
    const per = level ? 2 : 1, vals = new Int16Array(nCells * per);
    for (let q = 0, c = 0; q < runs.length; q += 3) {
      let p0 = 0, p1 = 0;
      for (let m = 0; m < runs[q + 2]; m++, c++) {
        p0 += dv.getInt8(o++); vals[c * per] = p0;
        if (per === 2) { p1 += dv.getInt8(o++); vals[c * per + 1] = p1; }
      }
    }
    map.set(`${level}:${tx},${ty}`, { hash, runs, vals });
  }
  return map;
}

// FNV-1a over a tile's 16-bit level words, as water-grade-fix.mjs hashes them
export function levelHash(lvl) {
  let h = 0x811c9dc5;
  for (let i = 0; i < lvl.length; i++) { h ^= lvl[i] & 0xffff; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// Grade one tile's buffer in place ([height Int16][lake Uint16][shore Int16][level Int16], side^2 cells each). level:
// 'fine' or 'far'; grid: the index's grid (its tile, halo and far). Resolves true when the tile was graded.
export async function gradeTile(buf, level, tx, ty, grid) {
  if (!table) table = load().catch(() => new Map());
  const T = await table;
  const far = level === 'far', rec = T.get(`${far ? 1 : 0}:${tx},${ty}`);
  if (!rec) return false;
  const side = far ? grid.far.tile + 2 * grid.far.halo : grid.tile + 2 * grid.halo, n = side * side;
  if (buf.byteLength < n * 8) return false;
  const h = new Int16Array(buf, 0, n), lvl = new Int16Array(buf, n * 6, n);
  if (levelHash(lvl) !== rec.hash) return false;
  const { runs, vals } = rec;
  let c = 0;
  for (let r = 0; r < runs.length; r += 3) {
    const m0 = runs[r] * side + runs[r + 1];
    for (let m = m0; m < m0 + runs[r + 2]; m++) {
      if (far) { h[m] += vals[c * 2]; lvl[m] += vals[c * 2 + 1]; } else { h[m] += vals[c]; lvl[m] += vals[c]; }
      c++;
    }
  }
  return true;
}
