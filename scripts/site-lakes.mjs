#!/usr/bin/env node
// round A-F: the water each campsite is on, for the parties' schedule (src/parties.js). The index's campsites carry no
// lake, and a party's night on Lake One must be at a site on Lake One wherever you are and whatever tiles are loaded,
// so this reads the release's own fine tiles once: for each site, the lake of the nearest water cell within 400 m
// (the one its landing is on). It writes src/site-lakes.json, a lake id per campsite in the index's order, matched to
// the release by its bake time (parties.js falls back to the nearest lake by its size and middle on any other bake).
//
//   node scripts/site-lakes.mjs [--data public/data] [--out src/site-lakes.json]
import fs from 'node:fs';
import zlib from 'node:zlib';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', 'public/data').replace(/\/?$/, '/');
const outFile = arg('--out', 'src/site-lakes.json');

const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const g = index.grid, T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, n = SIDE * SIDE;
const tiles = new Map();
const tileOf = (tx, ty) => {
  const k = ty * g.ntx + tx;
  let t = tiles.get(k);
  if (t === undefined) {
    try {
      const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}tiles/${tx}_${ty}.bin`));
      const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
      t = new Uint16Array(buf, n * 2, n);
    } catch { t = null; }
    if (tiles.size > 400) tiles.clear();
    tiles.set(k, t);
  }
  return t;
};
const lakeCell = (i, j) => {
  if (i < 0 || j < 0 || i >= g.width || j >= g.height) return 0;
  const t = tileOf((i / T) | 0, (j / T) | 0);
  return t ? t[((j % T) + HALO) * SIDE + (i % T) + HALO] : 0;
};
const R = 40; // cells (10 m each)
const out = [];
let found = 0;
for (const c of index.campsites) {
  const ci = Math.floor((c.x - g.originX) / g.cell), cj = Math.floor((c.z - g.originZ) / g.cell);
  let best = 0, bd = Infinity;
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
    const d = di * di + dj * dj; if (d >= bd || d > R * R) continue;
    const id = lakeCell(ci + di, cj + dj); if (id) { bd = d; best = id; }
  }
  if (best) found++;
  out.push(best);
}
const doc = { about: 'round A-F (2026-10-26): the lake id of the nearest water cell to each campsite, in index.campsites order (0: none within 400 m). Made by scripts/site-lakes.mjs from the release baked at `for`; parties.js reads it.', for: index.source && index.source.baked, n: out.length, lakes: out };
fs.writeFileSync(outFile, JSON.stringify(doc));
console.log(`${found} of ${out.length} sites on a lake; wrote ${outFile} (${fs.statSync(outFile).size} bytes)`);
