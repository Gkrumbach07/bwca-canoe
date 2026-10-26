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
// The file (version 3, scripts/water-grade-pack.mjs): an index, then pieces fetched by HTTP range requests as the tiles
// that need them arrive (round A join: the whole 818 KB table, gzipped as one, held up every tile worker's first tile;
// the start now reads the index and the dozen pieces round you, about 30 KB).
// - The index: u32 'WGR1', u16 version 3, u16 the block (fine tiles per side of a piece), u32 pieces, u32, f64 bake
//   time; per piece u8 kind (0 a block of fine tiles, 1 a far tile), u8, u16 x, u16 y, u16, u32 offset, u32 length.
// - A piece: a gzipped version 2 table. u32 'WGR1', u16 2, u16, u32 fine tiles, u32 far tiles, f64 bake time; per tile
//   u8 level (0 fine, 1 far), u8, u16 tx, u16 ty, u16, u32 hash, u32 runs, u32 cells, runs x (u16 row, u16 col, u16
//   length), then per cell its change in dm (fine: to the height and the level both) or two (far: the height, then the
//   level), each an i8 difference from the same value of the cell before it in its run.
// A server that answers a range with the whole file (200) is read from that one download.

const URL_ = new URL('./water-grade.bin', import.meta.url);
const MAGIC = 0x31524757;
let index = null;          // Promise<{ block, at: Map<'kind:x,y', [offset, length]>, whole: ArrayBuffer | null }>
const pieces = new Map();  // 'kind:x,y' -> Promise<Map<'level:tx,ty', { hash, runs: Uint16Array, vals: Int16Array }>>

// bytes [a, b) of the file, and the whole file when the server ignored the range
async function range(a, b) {
  const res = await fetch(URL_, { headers: { Range: `bytes=${a}-${b - 1}` } });
  if (!res.ok) throw new Error(`${res.status} fetching ${URL_}`);
  const buf = await res.arrayBuffer();
  return res.status === 206 ? { buf, whole: null } : { buf: buf.slice(a, b), whole: buf };
}
async function loadIndex() {
  let { buf, whole } = await range(0, 4096);
  let dv = new DataView(buf);
  if (dv.byteLength < 24 || dv.getUint32(0, true) !== MAGIC || dv.getUint16(4, true) !== 3) return { block: 4, at: new Map(), whole: null };
  const n = dv.getUint32(8, true), end = 24 + n * 16;
  if (end > buf.byteLength) { ({ buf, whole } = whole ? { buf: whole.slice(0, end), whole } : await range(0, end)); dv = new DataView(buf); }
  const at = new Map();
  for (let i = 0; i < n; i++) {
    const o = 24 + i * 16;
    at.set(`${dv.getUint8(o)}:${dv.getUint16(o + 2, true)},${dv.getUint16(o + 4, true)}`, [dv.getUint32(o + 8, true), dv.getUint32(o + 12, true)]);
  }
  return { block: dv.getUint16(6, true) || 4, at, whole };
}
async function loadPiece(I, [off, len]) {
  const gz = I.whole ? I.whole.slice(off, off + len) : (await range(off, off + len)).buf;
  const buf = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const dv = new DataView(buf), map = new Map();
  if (dv.getUint32(0, true) !== MAGIC || dv.getUint16(4, true) !== 2) return map;
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
// the record for one tile, or null (no piece holds it: nothing of it was graded)
async function recordOf(far, tx, ty) {
  if (!index) index = loadIndex().catch(() => ({ block: 4, at: new Map(), whole: null }));
  const I = await index;
  const key = far ? `1:${tx},${ty}` : `0:${Math.floor(tx / I.block)},${Math.floor(ty / I.block)}`, at = I.at.get(key);
  if (!at) return null;
  if (!pieces.has(key)) pieces.set(key, loadPiece(I, at).catch(() => new Map()));
  return (await pieces.get(key)).get(`${far ? 1 : 0}:${tx},${ty}`) || null;
}

// the index and a tile's piece asked for ahead, while the tile itself downloads (the tile worker, before its fetch)
export function gradeAhead(level, tx, ty) { recordOf(level === 'far', tx, ty).catch(() => {}); }

// FNV-1a over a tile's 16-bit level words, as water-grade-fix.mjs hashes them
export function levelHash(lvl) {
  let h = 0x811c9dc5;
  for (let i = 0; i < lvl.length; i++) { h ^= lvl[i] & 0xffff; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// Grade one tile's buffer in place ([height Int16][lake Uint16][shore Int16][level Int16], side^2 cells each). level:
// 'fine' or 'far'; grid: the index's grid (its tile, halo and far). Resolves true when the tile was graded.
export async function gradeTile(buf, level, tx, ty, grid) {
  const far = level === 'far', rec = await recordOf(far, tx, ty);
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
