#!/usr/bin/env node
// round A join: the graded-levels table (water-grade-fix.mjs) cut into pieces a tile worker fetches only as it needs
// them, by HTTP range requests on the one file (src/water-levels.js). The whole table was 818 KB that every tile worker
// waited for before its first tile; the start now reads its index and the 10 to 15 pieces round you, about 30 KB.
//
//   node scripts/water-grade-pack.mjs [--in src/water-grade.bin] [--out src/water-grade.bin]   (a version 2 table in,
//   version 3 out; a version 3 file in is left as it is)
//
// Version 3 (little-endian; not gzipped as a whole):
//   u32 magic 'WGR1', u16 version 3, u16 the block (fine tiles per side of a piece), u32 pieces, u32 0, f64 bake time
//   per piece: u8 kind (0: the fine tiles of block bx, by; 1: far tile x, y), u8 0, u16 x, u16 y, u16 0, u32 offset,
//   u32 length
//   then the pieces, each a gzip of a version 2 table (water-grade-fix.mjs) holding that block's or far tile's records.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const BLOCK = 4;
const MAGIC = 0x31524757;

// a version 2 table's records: [{ level, tx, ty, bytes }]
function records(raw) {
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (dv.getUint32(0, true) !== MAGIC || dv.getUint16(4, true) !== 2) throw new Error('not a version 2 water-grade table');
  const count = dv.getUint32(8, true) + dv.getUint32(12, true), bake = dv.getFloat64(16, true);
  let o = 24;
  const out = [];
  for (let r = 0; r < count; r++) {
    const level = dv.getUint8(o), tx = dv.getUint16(o + 2, true), ty = dv.getUint16(o + 4, true);
    const nRuns = dv.getUint32(o + 12, true), nCells = dv.getUint32(o + 16, true), start = o;
    o += 20 + nRuns * 6 + nCells * (level ? 2 : 1);
    out.push({ level, tx, ty, bytes: raw.subarray(start, o) });
  }
  return { bake, recs: out };
}

// version 2 (raw, not gzipped) -> version 3
export function pack(raw, block = BLOCK) {
  const { bake, recs } = records(raw);
  const groups = new Map();
  for (const r of recs) {
    const kind = r.level ? 1 : 0, x = r.level ? r.tx : Math.floor(r.tx / block), y = r.level ? r.ty : Math.floor(r.ty / block);
    const k = `${kind}:${x},${y}`;
    if (!groups.has(k)) groups.set(k, { kind, x, y, recs: [] });
    groups.get(k).recs.push(r);
  }
  const pieces = [...groups.values()].sort((a, b) => a.kind - b.kind || a.y - b.y || a.x - b.x);
  for (const p of pieces) {
    const head = Buffer.alloc(24), fine = p.recs.filter((r) => !r.level).length;
    head.writeUInt32LE(MAGIC, 0); head.writeUInt16LE(2, 4); head.writeUInt32LE(fine, 8); head.writeUInt32LE(p.recs.length - fine, 12); head.writeDoubleLE(bake, 16);
    p.gz = zlib.gzipSync(Buffer.concat([head, ...p.recs.map((r) => r.bytes)]), { level: 9 });
  }
  const head = Buffer.alloc(24 + pieces.length * 16);
  head.writeUInt32LE(MAGIC, 0); head.writeUInt16LE(3, 4); head.writeUInt16LE(block, 6); head.writeUInt32LE(pieces.length, 8); head.writeDoubleLE(bake, 16);
  let off = head.length;
  pieces.forEach((p, i) => {
    const o = 24 + i * 16;
    head.writeUInt8(p.kind, o); head.writeUInt16LE(p.x, o + 2); head.writeUInt16LE(p.y, o + 4);
    head.writeUInt32LE(off, o + 8); head.writeUInt32LE(p.gz.length, o + 12);
    off += p.gz.length;
  });
  return { buf: Buffer.concat([head, ...pieces.map((p) => p.gz)]), pieces: pieces.length, index: head.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const inFile = arg('--in', 'src/water-grade.bin'), outFile = arg('--out', inFile);
  const file = fs.readFileSync(inFile);
  if (file.readUInt32LE(0) === MAGIC && file.readUInt16LE(4) === 3) { console.log(`${inFile} is version 3 already`); process.exit(0); }
  const raw = zlib.gunzipSync(file);
  const { buf, pieces, index } = pack(raw);
  fs.writeFileSync(outFile, buf);
  console.log(`wrote ${outFile}: ${pieces} pieces, the index ${index} bytes, ${(buf.length / 1024).toFixed(0)} KB (was ${(file.length / 1024).toFixed(0)} KB gzipped whole)`);
}
