#!/usr/bin/env node
// The wilderness's own edge for the map (the owner, 2026-10-31: "display ... the boundary waters border outline on the
// map"): the Boundary Waters Canoe Area Wilderness boundary as the Forest Service maps it, written as a small table,
// src/boundary.bin, that the map reads (src/map-render.js loadBoundary).
//
// Source: USFS Enterprise Data Warehouse, National Wilderness Areas (EDW_Wilderness_01 MapServer/0), the feature
// "Boundary Waters Canoe Area Wilderness" (public domain). Queried once and cached in data-cache/boundary.
//
//   node scripts/boundary.mjs [--refresh] [--index public/data/index.json | URL] [--out src/boundary.bin] [--tol 25]
//
// Projected to the game's metres (index.json proj: x east, z south) and simplified (Douglas-Peucker) to --tol m.
// The table (little-endian, gzipped as a whole): u32 magic 'BND1', u16 version 1, u16 rings, then per ring a u8 kind
// (0 outer, 1 hole), a varint point count and the points as zigzag varints in whole metres (the first absolute, the
// rest the step from the one before). The same encoding as src/burns.bin.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const cacheDir = arg('--cache', 'data-cache/boundary');
const indexArg = arg('--index', fs.existsSync('public/data/index.json') ? 'public/data/index.json' : 'https://data.gagekrumbach.com/bwca/v4/index.json');
const outFile = arg('--out', 'src/boundary.bin');
const TOL = Number(arg('--tol', 25));
const URL_ = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_Wilderness_01/MapServer/0/query';
const NAME = 'Boundary Waters Canoe Area Wilderness';
const MAGIC = 0x31444e42; // 'BND1'

const index = /^https?:/.test(indexArg) ? await (await fetch(indexArg)).json() : JSON.parse(fs.readFileSync(indexArg, 'utf8'));
const P = index.proj;
const toXZ = ([lon, lat]) => [(lon - P.lon0) * P.mPerDegLon, -(lat - P.lat0) * P.mPerDegLat];

const file = path.join(cacheDir, 'bwcaw.geojson');
let fc;
if (!has('--refresh') && fs.existsSync(file)) fc = JSON.parse(fs.readFileSync(file, 'utf8'));
else {
  const q = new URLSearchParams({ where: `wildernessname='${NAME}'`, outFields: 'wildernessname,gis_acres', outSR: '4326', f: 'geojson' });
  const res = await fetch(`${URL_}?${q}`);
  if (!res.ok) throw new Error(`wilderness: ${res.status}`);
  fc = await res.json();
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...fc, fetched: new Date().toISOString() }));
}
const geom = fc.features && fc.features[0] && fc.features[0].geometry;
if (!geom) throw new Error('wilderness: no feature');
const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;

// Douglas-Peucker on a closed ring (as scripts/burns.mjs)
function simplify(ring, tol) {
  let pts = ring.slice();
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  if (pts.length < 4) return pts;
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) { const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  const dp = (a) => {
    const keep = new Uint8Array(a.length); keep[0] = keep[a.length - 1] = 1;
    const stack = [[0, a.length - 1]];
    while (stack.length) {
      const [i0, i1] = stack.pop(), [x0, z0] = a[i0], [x1, z1] = a[i1], dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
      let best = -1, bd = tol * tol;
      for (let i = i0 + 1; i < i1; i++) {
        const [x, z] = a[i];
        const t = L2 ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2)) : 0, d = (x - x0 - t * dx) ** 2 + (z - z0 - t * dz) ** 2;
        if (d > bd) { bd = d; best = i; }
      }
      if (best > 0) { keep[best] = 1; stack.push([i0, best], [best, i1]); }
    }
    return a.filter((_, i) => keep[i]);
  };
  const A = dp(pts.slice(0, far + 1)), B = dp([...pts.slice(far), pts[0]]);
  return [...A, ...B.slice(1, -1)];
}
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; };

const rings = [];
let vin = 0;
for (const poly of polys) poly.forEach((r, k) => {
  vin += r.length;
  const s = simplify(r.map(toXZ), TOL).map(([x, z]) => [Math.round(x), Math.round(z)]);
  if (s.length >= 3 && Math.abs(area(s)) >= 20000) rings.push({ hole: k > 0, pts: s }); // two hectares
});

const bytes = [];
const u8 = (v) => bytes.push(v & 255);
const varint = (v) => { do { let b = v % 128; v = Math.floor(v / 128); if (v) b |= 128; u8(b); } while (v); };
const zig = (v) => varint(v < 0 ? -2 * v - 1 : 2 * v);
const head = Buffer.alloc(8); head.writeUInt32LE(MAGIC, 0); head.writeUInt16LE(1, 4); head.writeUInt16LE(rings.length, 6);
for (const r of rings) {
  u8(r.hole ? 1 : 0); varint(r.pts.length);
  let px = 0, pz = 0;
  for (const [x, z] of r.pts) { zig(x - px); zig(z - pz); px = x; pz = z; }
}
const out = zlib.gzipSync(Buffer.concat([head, Buffer.from(bytes)]), { level: 9 });
fs.writeFileSync(outFile, out);
console.log(`${NAME}: ${rings.length} rings, ${vin} -> ${rings.reduce((n, r) => n + r.pts.length, 0)} points, ${out.length} bytes -> ${outFile}`);
