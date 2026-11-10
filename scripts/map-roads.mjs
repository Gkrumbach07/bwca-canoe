#!/usr/bin/env node
// The map's minor roads from the 3D world's own (round 5 join; the owner 2026-11-10: "Just put roads where you see
// roads"): src/map-roads.bin keeps scripts/edge.mjs's highways and county roads (classes 0 and 1, lettered, with the
// towns and the exits), and its class 2 (the spurs to the lots) is replaced by every road src/roads.bin draws in 3D that
// is not one of those: the forest roads, gravel, two-tracks and streets as class 2, the driveways and lots' aisles as
// class 3 (drawn only close in: edge.js paintRoads). So the map and the world show the same roads.
//
//   node scripts/map-roads.mjs [--bin src/roads.bin] [--map src/map-roads.bin] [--tol 10]
//
// Light (plain node, any machine). scripts/edge.mjs runs it after writing map-roads.bin; run it again after
// scripts/roads.mjs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binFile = path.resolve(arg('--bin', path.join(root, 'src/roads.bin')));
const mapFile = path.resolve(arg('--map', path.join(root, 'src/map-roads.bin')));
const TOL = Number(arg('--tol', 10));  // the line simplified to this (m)
const ON_MAJOR = 22;                   // a point this near a highway or county road line is that road
const { decodePiece } = await import(path.join(root, 'src/roads.js'));

// every chain of the pieces, joined back whole: a chain id's points from every tile's piece, by their distance along it
const buf = fs.readFileSync(binFile), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
if (dv.getUint32(0, true) !== 0x31534452) throw new Error(`${binFile}: not a roads.bin`);
const n = dv.getUint32(8, true), sl = dv.getUint16(16, true), head = (18 + sl + 3) & ~3;
const byId = new Map();
for (let i = 0; i < n; i++) {
  const o = head + i * 12, a = dv.getUint32(o + 4, true), l = dv.getUint32(o + 8, true);
  const raw = zlib.gunzipSync(buf.subarray(a, a + l));
  for (const c of decodePiece(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength))) {
    let R = byId.get(c.id);
    if (!R) byId.set(c.id, (R = { k: c.k, svc: c.svc, line: c.line, at: new Map() }));
    let s = c.s0;
    for (let j = 0; j < c.n; j++) {
      if (j) s += Math.hypot(c.p[j * 4] - c.p[j * 4 - 4], c.p[j * 4 + 1] - c.p[j * 4 - 3]);
      R.at.set(Math.round(s), [c.p[j * 4], c.p[j * 4 + 1]]);
    }
  }
}

const doc = JSON.parse(zlib.gunzipSync(fs.readFileSync(mapFile)).toString('utf8'));
const decode = (f) => { const pts = []; let x = 0, z = 0; for (let p = 3; p + 1 < f.length; p += 2) { x += f[p]; z += f[p + 1]; pts.push([x, z]); } return pts; };
const major = doc.lines.filter((f) => f[0] <= 1);
// the highways' and county roads' segments in 200 m bins, for "is this point on one"
const BIN = 200, bins = new Map();
for (const f of major) {
  const pts = decode(f);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    for (let gz = Math.floor((Math.min(az, bz) - ON_MAJOR) / BIN); gz <= Math.floor((Math.max(az, bz) + ON_MAJOR) / BIN); gz++)
      for (let gx = Math.floor((Math.min(ax, bx) - ON_MAJOR) / BIN); gx <= Math.floor((Math.max(ax, bx) + ON_MAJOR) / BIN); gx++) {
        const k = gx * 100000 + gz; const L = bins.get(k); if (L) L.push([ax, az, bx, bz]); else bins.set(k, [[ax, az, bx, bz]]);
      }
  }
}
const onMajor = (x, z) => {
  const L = bins.get(Math.floor(x / BIN) * 100000 + Math.floor(z / BIN));
  if (!L) return false;
  for (const [ax, az, bx, bz] of L) {
    const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez, u = L2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
    if (Math.hypot(x - ax - ex * u, z - az - ez * u) < ON_MAJOR) return true;
  }
  return false;
};
function simplify(a, tol) {
  if (a.length < 3) return a;
  const keep = new Uint8Array(a.length); keep[0] = keep[a.length - 1] = 1;
  const stack = [[0, a.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop(), [x0, z0] = a[i0], [x1, z1] = a[i1], dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
    let best = -1, bd = tol * tol;
    for (let i = i0 + 1; i < i1; i++) { const [x, z] = a[i]; const t = L2 ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2)) : 0, d = (x - x0 - t * dx) ** 2 + (z - z0 - t * dz) ** 2; if (d > bd) { bd = d; best = i; } }
    if (best > 0) { keep[best] = 1; stack.push([i0, best], [best, i1]); }
  }
  return a.filter((_, i) => keep[i]);
}

const lines = major.slice();
let km2 = 0, km3 = 0, nMinor = 0;
// the runs off the major roads (a forest road that joins a highway leaves it where it turns off), by class
const runs = { 2: [], 3: [] };
for (const R of byId.values()) {
  const pts = [...R.at.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  const cls = R.svc ? 3 : 2;
  let cur = [];
  for (const p of pts) { if (onMajor(p[0], p[1])) { if (cur.length > 1) runs[cls].push(cur); cur = []; } else cur.push(p); }
  if (cur.length > 1) runs[cls].push(cur);
}
// the roads come cut in short chains (at every junction, every change of kind): those of a class joined end to end
// again where they meet, the same stretch twice (a way drawn both ways) once
const key = (p) => `${Math.round(p[0])},${Math.round(p[1])}`;
for (const cls of [2, 3]) {
  const seen = new Set(), list = [];
  for (const r of runs[cls]) { const k = r.map(key).join(';'), k2 = r.slice().reverse().map(key).join(';'); if (seen.has(k) || seen.has(k2)) continue; seen.add(k); list.push(r); }
  const ends = new Map(), used = new Uint8Array(list.length);
  const at = (p) => ends.get(key(p)) || [];
  list.forEach((r, i) => { for (const p of [r[0], r[r.length - 1]]) { const k = key(p); const L = ends.get(k); if (L) L.push(i); else ends.set(k, [i]); } });
  for (let i = 0; i < list.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    let line = list[i].slice();
    for (const back of [false, true]) {
      for (;;) {
        const end = line[line.length - 1], nx = at(end).filter((j) => !used[j]);
        if (at(end).length !== 2 || nx.length !== 1) break; // (only through a plain joint: never across a junction)
        const j = nx[0]; used[j] = 1;
        const r = list[j], fwd = key(r[0]) === key(end);
        line = line.concat((fwd ? r : r.slice().reverse()).slice(1));
      }
      line.reverse();
    }
    let len = 0; for (let q = 1; q < line.length; q++) len += Math.hypot(line[q][0] - line[q - 1][0], line[q][1] - line[q - 1][1]);
    if (len < 3) continue;
    const sm = simplify(line, TOL).map(([x, z]) => [Math.round(x), Math.round(z)]);
    const flat = [cls, -1, 0]; let px = 0, pz = 0;
    for (const [x, z] of sm) { flat.push(x - px, z - pz); px = x; pz = z; }
    lines.push(flat); nMinor++;
    if (cls === 2) km2 += len / 1000; else km3 += len / 1000;
  }
}
doc.lines = lines;
doc.minor = 'src/roads.bin (scripts/map-roads.mjs)';
const out = zlib.gzipSync(Buffer.from(JSON.stringify(doc)), { level: 9 });
fs.writeFileSync(mapFile, out);
console.log(`map-roads: ${major.length} highway and county lines kept, ${nMinor} minor lines from ${byId.size} roads (${km2.toFixed(0)} km roads, ${km3.toFixed(0)} km driveways), ${out.length} bytes`);
