#!/usr/bin/env node
// The edge round (docs/build/edge-and-roads.md, E1 + E2): what scripts/edge.mjs needs from OpenStreetMap, pulled once
// into a small cache (data-cache/edge): the drivable roads and the towns from the Geofabrik extracts the bake already
// uses, and Quetico Provincial Park's outline (relation 14520069, from the Overpass API once: the cut extracts hold
// only the pieces of its ways inside the box, so its rings would not close).
//
//   node scripts/edge-osm.mjs [--pbf 'a.osm.pbf|b.osm.pbf'] [--out data-cache/edge] [--refresh-quetico]
//
// Writes roads.json ({ ways: [{ id, hw, name, ref, surface, pts: [[lon, lat], ...] }] }), places.json ([{ name,
// place, lon, lat, pop }]) and quetico.json (the relation as Overpass gives it, `out geom`).
// © OpenStreetMap contributors, ODbL.
import fs from 'node:fs';
import path from 'node:path';
import { readPbf } from './osmpbf.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const BOX = '47.77418637905845,-92.56521527000024,48.40581362094156,-89.86478472999977';
const dflt = [`data-cache/osm-2026-11-01/osm/minnesota-latest-${BOX}.cut.osm.pbf`, `data-cache/osm-2026-11-01/osm/ontario-latest-${BOX}.cut.osm.pbf`].join('|');
const files = arg('--pbf', dflt).split('|').filter(Boolean);
const outDir = arg('--out', 'data-cache/edge');
fs.mkdirSync(outDir, { recursive: true });

// the roads a truck could take (OSM highway=*), with the link roads; paths, footways and the like left out
const DRIVE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'track', 'road',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const PLACES = new Set(['city', 'town', 'village', 'hamlet']);

const ways = [], need = new Set(), places = [];
for (const f of files) {
  readPbf(f, {
    way: (id, refs, t) => {
      if (!t || !DRIVE.has(t.highway)) return;
      if (t.area === 'yes') return;
      ways.push({ id, hw: t.highway.replace(/_link$/, ''), link: /_link$/.test(t.highway) || undefined, name: t.name || undefined, ref: t.ref || undefined, surface: t.surface || undefined, access: t.access || undefined, service: t.service || undefined, refs });
      for (const r of refs) need.add(r);
    },
  });
}
const seen = new Set();
const uniq = ways.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)));
const coord = new Map();
for (const f of files) {
  readPbf(f, {
    node: (id, lat, lon, t) => {
      if (need.has(id) && !coord.has(id)) coord.set(id, [+lon.toFixed(6), +lat.toFixed(6)]);
      if (t && PLACES.has(t.place) && t.name) places.push({ name: t.name, place: t.place, lon: +lon.toFixed(5), lat: +lat.toFixed(5), pop: Number(t.population) || null });
    },
  });
}
let pts = 0;
const outWays = [];
for (const w of uniq) {
  const p = w.refs.map((r) => coord.get(r)).filter(Boolean);
  if (p.length < 2) continue;
  pts += p.length;
  const { refs, ...rest } = w;
  outWays.push({ ...rest, nodes: refs.filter((r) => coord.has(r)), pts: p });
}
fs.writeFileSync(path.join(outDir, 'roads.json'), JSON.stringify({ source: '© OpenStreetMap contributors, ODbL (Geofabrik extracts)', files: files.map((f) => path.basename(f)), ways: outWays }));
const pu = new Map(); for (const p of places) if (!pu.has(p.name + p.place)) pu.set(p.name + p.place, p);
fs.writeFileSync(path.join(outDir, 'places.json'), JSON.stringify([...pu.values()], null, 1));
console.log(`roads: ${outWays.length} ways, ${pts} points; places: ${pu.size}`);

const q = path.join(outDir, 'quetico.json');
if (has('--refresh-quetico') || !fs.existsSync(q)) {
  const body = new URLSearchParams({ data: '[out:json][timeout:90];relation(14520069);out geom;' });
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body, headers: { 'User-Agent': 'bwca-canoe-edge-script/1.0' } });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  fs.writeFileSync(q, await res.text());
  console.log(`quetico: fetched -> ${q}`);
}
