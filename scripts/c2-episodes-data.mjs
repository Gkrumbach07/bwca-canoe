#!/usr/bin/env node
// The cheap open data checks for stream E (docs/story/60-side-stories.md §14; campaign-design Part 4 Round 2's doc gaps),
// against the release the game runs (public-data-v9) and the bake's own caches. Node, light (a few tiles).
//
//   check 8   Mummo's shore: the US side of Inlet Bay, west of P194's north end. The ruin point against the OSM
//             US–Canada line (data-cache/quetico-osm/border-*.json, projected as the bake does) and against the game's
//             own edge table (src/edge.bin: the point must be zone 1, the wilderness, not Quetico's out-of-bounds);
//             the route from P194's north end along the US shore to the ruin stays on the US side
//   check 10  Alice's beach rock: the water 10–15 m off the C1690 landing, its depth by the release's bed (the lake's
//             level less the cell's height), the ray nearest 8 ft (2.4 m)
//   check 13  the lilacs' window (about 1–20 June ± 5 days): printed for the owner (the phenology itself is a citation,
//             not data the bake holds)
//
//   node scripts/c2-episodes-data.mjs [--data <dir>] [--json]
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MAIN = (() => { try { return path.resolve(execSync('git rev-parse --git-common-dir', { cwd: ROOT }).toString().trim(), '..'); } catch { return ROOT; } })();
const find = (rel) => [path.resolve(ROOT, rel), path.resolve(MAIN, rel)].find((p) => fs.existsSync(p)) || path.resolve(ROOT, rel);
const DATA = find(arg('--data', 'public-data-v9'));
const JSON_OUT = argv.includes('--json');
const report = { checks: {} };
const result = (name, pass, more = {}) => { report.checks[name] = { pass: pass === 'warn' ? 'warn' : !!pass, ...more }; if (!JSON_OUT) console.log(pass === 'warn' ? 'WARN' : pass ? 'PASS' : 'FAIL', name, JSON.stringify(more)); };

const v9 = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
const g = v9.grid, T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, NC = SIDE * SIDE;
const tiles = new Map();
function tileAt(tx, ty) {
  const k = ty * g.ntx + tx;
  if (tiles.has(k)) return tiles.get(k);
  let t = null;
  try {
    const raw = zlib.gunzipSync(fs.readFileSync(path.join(DATA, 'tiles', `${tx}_${ty}.bin`)));
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    t = { h: new Int16Array(buf, 0, NC), lake: new Uint16Array(buf, NC * 2, NC), sd: new Int16Array(buf, NC * 4, NC) };
  } catch { t = null; }
  tiles.set(k, t);
  return t;
}
function cell(x, z) {
  const i = Math.floor((x - g.originX) / g.cell), j = Math.floor((z - g.originZ) / g.cell);
  if (i < 0 || j < 0 || i >= g.width || j >= g.height) return null;
  const t = tileAt((i / T) | 0, (j / T) | 0); if (!t) return null;
  const c = ((j % T) + HALO) * SIDE + (i % T) + HALO;
  return { lake: t.lake[c], sd: t.sd[c] / 10, h: t.h[c] / 10 };
}
const lakeOf = (id) => (id > 0 ? v9.lakes[id - 1] : null);
const P = v9.proj, toXZ = (lat, lon) => [(lon - P.lon0) * P.mPerDegLon, -(lat - P.lat0) * P.mPerDegLat];
const r1 = (v) => Math.round(v * 10) / 10;

// --- the game's edge table ------------------------------------------------------------------------------------------------
const EDGE = (() => {
  try {
    let raw = fs.readFileSync(path.join(ROOT, 'src', 'edge.bin'));
    if (raw.readUInt32LE(0) !== 0x31474445) raw = zlib.gunzipSync(raw);
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const E = { cell: dv.getUint16(6, true), x0: dv.getInt32(8, true), z0: dv.getInt32(12, true), W: dv.getUint16(16, true), H: dv.getUint16(18, true) };
    let o = 20;
    const varint = () => { let v = 0, m = 1, b; do { b = dv.getUint8(o++); v += (b & 127) * m; m *= 128; } while (b & 128); return v; };
    const N = E.W * E.H, zones = new Uint8Array(N), runs = varint();
    for (let r = 0, k = 0; r < runs; r++) { const v = dv.getUint8(o++), n = varint(); zones.fill(v, k, Math.min(N, k + n)); k += n; }
    E.zones = zones;
    return E;
  } catch (e) { return { err: e.message }; }
})();
const zoneAt = (x, z) => { if (!EDGE.zones) return null; const i = Math.floor((x - EDGE.x0) / EDGE.cell), j = Math.floor((z - EDGE.z0) / EDGE.cell); return i < 0 || j < 0 || i >= EDGE.W || j >= EDGE.H ? null : EDGE.zones[j * EDGE.W + i]; };

// --- check 8: Mummo's ------------------------------------------------------------------------------------------------------
{
  const borderF = fs.readdirSync(find('data-cache/quetico-osm')).find((f) => /^border-.*\.json$/.test(f));
  const B = borderF ? JSON.parse(fs.readFileSync(path.join(find('data-cache/quetico-osm'), borderF), 'utf8')) : null;
  const segs = [];
  for (const line of (B && B.lines) || []) { const pts = line.map(([lat, lon]) => toXZ(lat, lon)); for (let k = 1; k < pts.length; k++) segs.push([pts[k - 1], pts[k]]); }
  // the signed distance to the line: + on the US side (south of the line here: the US cell is the one at larger z, the
  // border running east–west across Basswood), by the nearest segment's side
  const side = (x, z) => {
    let best = null;
    for (const [a, b] of segs) {
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
      const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, cross: dx * (z - a[1]) - dz * (x - a[0]), a, b };
    }
    return best;
  };
  // which sign of the cross product is the US: a point well inside the US (Moose Lake 25's landing) fixes it
  const ep25 = v9.entryPoints.find((e) => e.ep === 25), ref = ep25 ? side(ep25.x, ep25.z) : null, usSign = ref ? Math.sign(ref.cross) : 1;
  const usDist = (x, z) => { const s = side(x, z); return s ? Math.sign(s.cross) * usSign * s.d : null; };
  // the ruin: the US shore nearest the doc's point (−17500, 3750), on Basswood (60 S7, 03-places)
  const bass = v9.lakes.filter((l) => l && l.name === 'Basswood Lake').map((l) => l.id);
  let shore = null;
  for (let dz = -250; dz <= 250; dz += 10) for (let dx = -250; dx <= 250; dx += 10) {
    const x = -17500 + dx, z = 3750 + dz, c = cell(x, z);
    if (!c || c.sd < 1 || c.sd > 6) continue; // (land just up from the water line)
    const w = cell(x + 0, z + 0); if (!w) continue;
    // its water: a Basswood cell within 20 m
    let wet = false; for (const [ox, oz] of [[10, 0], [-10, 0], [0, 10], [0, -10], [20, 0], [-20, 0], [0, 20], [0, -20]]) { const q = cell(x + ox, z + oz); if (q && q.sd < 0 && bass.includes(q.lake)) wet = true; }
    if (!wet) continue;
    const d = Math.hypot(dx, dz);
    if (!shore || d < shore.d) shore = { x, z, d, sd: c.sd };
  }
  const p194 = { x: -16720, z: 4231 }, c593 = { x: -17635, z: 3577 };
  const along = [];
  if (shore) for (let t = 0; t <= 1.0001; t += 0.1) { const x = p194.x + (shore.x - p194.x) * t, z = p194.z + (shore.z - p194.z) * t; along.push({ t: r1(t), us: r1(usDist(x, z)), zone: zoneAt(x, z) }); }
  const ruin = shore ? { x: shore.x, z: shore.z, sd: shore.sd, us: r1(usDist(shore.x, shore.z)), zone: zoneAt(shore.x, shore.z), off: r1(shore.d) } : null;
  const c593us = r1(usDist(c593.x, c593.z)), p194us = r1(usDist(p194.x, p194.z));
  const ok = ruin && ruin.us > 100 && ruin.zone === 1 && along.every((a) => a.us > 0) && c593us > 0;
  result('check 8: Mummo\'s on the US side of Inlet Bay in v9 (the OSM line and the game\'s edge table)', ok, { border: borderF ? 'osm' : 'missing', ruin, c593us, p194us, alongMin: along.length ? Math.min(...along.map((a) => a.us)) : null, alongZones: [...new Set(along.map((a) => a.zone))], km: shore ? r1(Math.hypot(shore.x - p194.x, shore.z - p194.z) / 1000) : null, edge: EDGE.err || `zone table ${EDGE.W}×${EDGE.H}` });
  report.mummos = ruin;
}

// --- check 10: Alice's beach rock ---------------------------------------------------------------------------------------
{
  const site = v9.campsites.find((c) => c && Math.abs(c.x - -237.4) < 2 && Math.abs(c.z - 15082.4) < 2);
  const lake = lakeOf(site ? site.lake : 61), level = lake ? lake.level : null;
  // the landing (walt-sites.js RESOLVED ws.c1690: the way up's water end)
  const L = { x: -233.4, z: 15091.2 };
  const rays = [];
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a), pts = [];
    let ok = true;
    for (const m of [10, 12, 14, 15]) { const c = cell(L.x + dx * m, L.z + dz * m); if (!c || c.sd >= 0 || c.lake !== lake.id) { ok = false; break; } pts.push({ m, depth: r1(level - c.h) }); }
    if (!ok) continue;
    const at12 = pts.find((p) => p.m === 12);
    rays.push({ deg: Math.round((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360, dir: [+dx.toFixed(3), +dz.toFixed(3)], pts, off: Math.abs(at12.depth - 2.44) });
  }
  rays.sort((a, b) => a.off - b.off);
  const best = rays[0] || null;
  const pass = best && best.pts.some((p) => p.depth >= 1.8 && p.depth <= 3.2);
  result('check 10: Alice\'s beach rock, about 8 ft (2.4 m) of water 10–15 m off it', pass ? true : 'warn', { lake: lake && lake.name, level, secchi: lake && lake.secchi, rays: rays.length, best: best && { deg: best.deg, dir: best.dir, pts: best.pts }, next: rays.slice(1, 4).map((r) => ({ deg: r.deg, d12: r.pts[1].depth })), bed: 'the release keeps no lake-bed substrate per cell (NWI/SSURGO stop at the water line): the sand is the doc\'s, unchecked' });
  report.alice = best ? { x: r1(L.x + best.dir[0] * 12), z: r1(L.z + best.dir[1] * 12), dir: best.dir, depth: best.pts[1].depth } : null;
}

// --- check 13: the lilacs ---------------------------------------------------------------------------------------------------
result('check 13: the lilac window (season.js lilacBloom: 1–20 June, the year\'s start seeded ±5 days)', 'warn', { why: 'phenology, not bake data: see the stream report (USA-NPN / extension service dates for NE Minnesota)' });

if (JSON_OUT) console.log(JSON.stringify(report));
const fails = Object.values(report.checks).filter((c) => c.pass === false).length;
console.log(fails ? `c2-episodes-data: ${fails} FAIL` : 'c2-episodes-data: no FAIL');
process.exit(fails ? 1 : 0);
