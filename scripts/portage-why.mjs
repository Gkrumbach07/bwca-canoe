#!/usr/bin/env node
// Which portages break the creek at a place (creeks.mjs portageBreaks), for checking the season round's portage fix by
// hand: node scripts/portage-why.mjs <x> <z> [radius m]   (BWCA_CACHE as for the bake)
import fs from 'node:fs';
import path from 'node:path';
import { CFG, AREAS, makeProjection } from './config.mjs';
import { PORT } from './creeks.mjs';
import { loadSources, usfsTrails, wildernessTest } from './names-lib.mjs';

const [X, Z, R = 60] = process.argv.slice(2).map(Number);
const bbox = AREAS.bwca, proj = makeProjection(bbox);
const dir = path.join(CFG.cacheDir, 'osm');
const f = fs.readdirSync(dir).find((n) => n.startsWith('extract-v2-ontario+minnesota-'));
const osm = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const lines = osm.portages.map((p) => ({ tag: `osm ${(p.names || []).join('/') || p.name || ''}`, pts: p.pts.map(([la, lo]) => proj.toLocal(la, lo)) }));
const src = loadSources(CFG.cacheDir);
const osmEnds = lines.flatMap((l) => [l.pts[0], l.pts[l.pts.length - 1]]), nearOsm = ([x, z]) => osmEnds.some((e) => Math.abs(e[0] - x) < 80 && Math.abs(e[1] - z) < 80); // (as bake.mjs)
for (const t of usfsTrails(src, (la, lo) => proj.toLocal(la, lo), wildernessTest(src.wilderness))) if (t.lakeToLake && t.miles < 3) for (const ln of t.lines) if (!nearOsm(ln[0]) && !nearOsm(ln[ln.length - 1])) lines.push({ tag: `usfs ${t.no} ${t.raw}`, pts: ln });
for (const l of lines) {
  const cum = [0];
  for (let s = 1; s < l.pts.length; s++) cum.push(cum[s - 1] + Math.hypot(l.pts[s][0] - l.pts[s - 1][0], l.pts[s][1] - l.pts[s - 1][1]));
  const L = cum[cum.length - 1], end = Math.min(PORT.end, 0.2 * L);
  let best = Infinity, at = 0;
  for (let s = 1; s < l.pts.length; s++) {
    const [ax, az] = l.pts[s - 1], [bx, bz] = l.pts[s], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((X - ax) * dx + (Z - az) * dz) / L2)), d = Math.hypot(ax + dx * t - X, az + dz * t - Z);
    if (d < best) { best = d; at = cum[s - 1] + t * Math.sqrt(L2); }
  }
  if (best <= Math.max(R, PORT.reach) && at > end && at < L - end) console.log(`${l.tag}: ${best.toFixed(0)} m off, ${at.toFixed(0)} of ${L.toFixed(0)} m along; ends ${l.pts[0].map(Math.round)} ${l.pts[l.pts.length - 1].map(Math.round)}`);
}
