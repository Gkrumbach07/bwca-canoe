// Offline OpenStreetMap extract: downloads the Geofabrik state/province file(s) once, cuts them to the bake
// bbox (with osmium when it is installed, otherwise by scanning the whole file in Node) and pulls out the
// water polygons, portage trails, campsites and points of interest. The result is cached as JSON.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CFG, log } from './config.mjs';
import { readPbf } from './osmpbf.mjs';

const osmDir = () => path.join(CFG.cacheDir, 'osm');

async function download(url, file) {
  if (fs.existsSync(file)) return;
  log('downloading', url);
  const res = await fetch(url, { headers: { 'User-Agent': CFG.ua } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file + '.part'));
  await fsp.rename(file + '.part', file);
}

function hasOsmium() {
  return spawnSync('osmium', ['--version'], { stdio: 'ignore' }).status === 0;
}

const isWaterTags = (t) => !!t && ((t.natural === 'water' && t.water !== 'wetland') || t.waterway === 'riverbank' || t.landuse === 'reservoir');
const isRiverTags = (t) => !!t && (['river', 'stream', 'canal', 'drain', 'ditch', 'rapids'].includes(t.water || '') || t.waterway === 'riverbank');
// creeks and rivers mapped as lines (drawn downstream by OSM convention)
const isWaterwayTags = (t) => !!t && ['river', 'stream', 'canal'].includes(t.waterway) && t.intermittent !== 'yes' && !t.tunnel;
export const isPortageTags = (t) => !!t && (t.highway === 'portage' || t.canoe === 'portage' || ['designated', 'yes', 'permissive'].includes(t.portage));
const isCampTags = (t) => !!t && t.tourism === 'camp_site';
const entryRe = /entry\s*point|\bE\.?P\.?\s*#?\s*\d+|boat\s*(launch|landing|ramp)|canoe\s*(launch|landing)|public\s*access/i;
const isPoiTags = (t) => !!t && (t.leisure === 'slipway' || t.canoe === 'put_in' || t.waterway === 'access_point' || (!!t.name && entryRe.test(t.name)) || (t.amenity === 'parking' && !!t.name));

// Sorted unique Float64Array of ids for binary-search membership.
function sortedUnique(arr) {
  const a = Float64Array.from(arr).sort();
  let n = 0;
  for (let i = 0; i < a.length; i++) if (i === 0 || a[i] !== a[i - 1]) a[n++] = a[i];
  return a.subarray(0, n);
}
function indexOfSorted(a, v) {
  let lo = 0, hi = a.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else if (a[m] > v) hi = m - 1; else return m; }
  return -1;
}

// Stitch relation member ways into closed rings by shared end nodes.
function assembleRings(wayList) {
  const remaining = wayList.map((w) => w.slice()).filter((n) => n.length >= 2);
  const rings = [];
  while (remaining.length) {
    let ring = remaining.pop();
    let guard = 0;
    while (ring[0] !== ring[ring.length - 1] && guard++ < 10000) {
      const end = ring[ring.length - 1];
      let found = false;
      for (let i = 0; i < remaining.length; i++) {
        const w = remaining[i];
        if (w[0] === end) { ring = ring.concat(w.slice(1)); remaining.splice(i, 1); found = true; break; }
        if (w[w.length - 1] === end) { ring = ring.concat(w.slice(0, -1).reverse()); remaining.splice(i, 1); found = true; break; }
      }
      if (!found) break;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

// Join portage ways that meet end to end (degree-2 junctions) into single trails.
function chainPortages(ways) {
  const cands = [...ways.values()].filter((w) => isPortageTags(w.tags));
  const degree = new Map();
  for (const w of cands) for (const id of [w.refs[0], w.refs[w.refs.length - 1]]) degree.set(id, (degree.get(id) || 0) + 1);
  const used = new Set();
  const chains = [];
  for (const w of cands) {
    if (used.has(w.id)) continue;
    used.add(w.id);
    let nodes = w.refs.slice();
    const names = new Set(w.tags.name ? [w.tags.name] : []);
    let grew = true;
    while (grew) {
      grew = false;
      for (const w2 of cands) {
        if (used.has(w2.id)) continue;
        const a = nodes[0], b = nodes[nodes.length - 1];
        const a2 = w2.refs[0], b2 = w2.refs[w2.refs.length - 1];
        let next = null;
        if (b === a2 && degree.get(b) === 2) next = nodes.concat(w2.refs.slice(1));
        else if (b === b2 && degree.get(b) === 2) next = nodes.concat(w2.refs.slice(0, -1).reverse());
        else if (a === b2 && degree.get(a) === 2) next = w2.refs.slice(0, -1).concat(nodes);
        else if (a === a2 && degree.get(a) === 2) next = w2.refs.slice(1).reverse().concat(nodes);
        if (next) { nodes = next; used.add(w2.id); if (w2.tags.name) names.add(w2.tags.name); grew = true; }
      }
    }
    chains.push({ nodes, names: [...names], id: w.id });
  }
  return chains;
}

// Returns { lakes, portages, campsites, pois } with coordinates as [lat, lon].
export async function loadOsm(bbox, extracts = CFG.extracts) {
  await fsp.mkdir(osmDir(), { recursive: true });
  const key = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const cacheFile = path.join(osmDir(), `extract-v2-${key}.json`);
  try { return JSON.parse(await fsp.readFile(cacheFile, 'utf8')); } catch {}

  const margin = 0.02;
  const inBox = (lat, lon) => lat >= bbox.south - margin && lat <= bbox.north + margin && lon >= bbox.west - margin && lon <= bbox.east + margin;
  const files = [];
  for (const name of extracts) {
    const file = path.join(osmDir(), name.split('/').pop() + '-latest.osm.pbf');
    await download(CFG.geofabrik(name), file);
    files.push(file);
  }
  let sources = files;
  if (hasOsmium()) {
    // cut each extract down to the bbox first: the scan below then runs over a few megabytes instead of hundreds
    sources = [];
    for (const file of files) {
      const cut = file.replace(/\.osm\.pbf$/, `-${key}.cut.osm.pbf`);
      if (!fs.existsSync(cut)) {
        log('osmium extract', path.basename(file));
        const b = `${bbox.west - margin},${bbox.south - margin},${bbox.east + margin},${bbox.north + margin}`;
        execFileSync('osmium', ['extract', '--bbox', b, '--strategy', 'smart', '--overwrite', '-o', cut, file], { stdio: 'inherit' });
      }
      sources.push(cut);
    }
  } else log('osmium not found: scanning the full extract(s) in Node (slower, same result)');

  // pass 1: water relations
  const rels = new Map();
  for (const f of sources) readPbf(f, { relation: (id, members, tags) => { if (isWaterTags(tags)) rels.set(id, { id, members, tags }); } });
  const memberWays = new Set();
  for (const r of rels.values()) for (const m of r.members) if (m.type === 'way') memberWays.add(m.ref);
  log(`osm: ${rels.size} water relations`);

  // pass 2: ways of interest
  const ways = new Map();
  for (const f of sources) readPbf(f, { way: (id, refs, tags) => {
    if (memberWays.has(id) || isWaterTags(tags) || isWaterwayTags(tags) || isPortageTags(tags) || isCampTags(tags) || isPoiTags(tags)) ways.set(id, { id, refs, tags });
  } });
  const refList = [];
  for (const w of ways.values()) for (const r of w.refs) refList.push(r);
  const needed = sortedUnique(refList);
  refList.length = 0;
  log(`osm: ${ways.size} ways, ${needed.length} nodes to resolve`);

  // pass 3: node coordinates and tagged nodes
  const lat = new Float64Array(needed.length).fill(NaN), lon = new Float64Array(needed.length).fill(NaN);
  const taggedNodes = [];
  let cursor = 0;
  for (const f of sources) {
    cursor = 0;
    readPbf(f, { node: (id, la, lo, tags) => {
      // ids come sorted in practice; walk a cursor and fall back to a binary search otherwise
      if (cursor < needed.length && needed[cursor] < id) { while (cursor < needed.length && needed[cursor] < id) cursor++; }
      let idx = cursor < needed.length && needed[cursor] === id ? cursor : -1;
      if (idx < 0 && cursor > 0 && needed[cursor - 1] >= id) idx = indexOfSorted(needed, id);
      if (idx >= 0) { lat[idx] = la; lon[idx] = lo; }
      if (tags && (isCampTags(tags) || isPoiTags(tags)) && inBox(la, lo)) taggedNodes.push({ id, lat: la, lon: lo, tags });
    } });
  }
  const coord = (id) => { const i = indexOfSorted(needed, id); return i >= 0 && !Number.isNaN(lat[i]) ? [lat[i], lon[i]] : null; };
  const wayCoords = (refs) => refs.map(coord).filter(Boolean);

  // water polygons (big first so small ponds and islands' inner lakes rasterized later win)
  const lakes = [];
  for (const w of ways.values()) {
    if (!isWaterTags(w.tags) || memberWays.has(w.id)) continue;
    const ring = wayCoords(w.refs);
    if (ring.length >= 3 && ring.some(([a, b]) => inBox(a, b))) lakes.push({ osm: `way/${w.id}`, name: w.tags.name || null, river: isRiverTags(w.tags), rings: [ring] });
  }
  for (const r of rels.values()) {
    const outer = [], inner = [];
    for (const m of r.members) {
      if (m.type !== 'way') continue;
      const w = ways.get(m.ref);
      if (!w) continue;
      (m.role === 'inner' ? inner : outer).push(w.refs);
    }
    const rings = [...assembleRings(outer), ...assembleRings(inner)].map(wayCoords).filter((rg) => rg.length >= 3);
    if (rings.length && rings.some((rg) => rg.some(([a, b]) => inBox(a, b)))) lakes.push({ osm: `relation/${r.id}`, name: r.tags.name || null, river: isRiverTags(r.tags), rings });
  }
  const area = (rg) => { let a = 0; for (let i = 0, n = rg.length; i < n; i++) { const [y1, x1] = rg[i], [y2, x2] = rg[(i + 1) % n]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
  lakes.sort((a, b) => b.rings.reduce((s, rg) => s + area(rg), 0) - a.rings.reduce((s, rg) => s + area(rg), 0));

  // waterway centrelines: creeks that have no polygon become narrow channels, and every river line gives
  // the bake a profile to fit the water level along
  const waterways = [];
  for (const w of ways.values()) {
    if (!isWaterwayTags(w.tags)) continue;
    const pts = wayCoords(w.refs);
    if (pts.length >= 2 && pts.some(([a, b]) => inBox(a, b))) waterways.push({ id: w.id, name: w.tags.name || null, kind: w.tags.waterway, pts });
  }

  // portage trails
  const portages = [];
  for (const c of chainPortages(ways)) {
    const pts = wayCoords(c.nodes);
    if (pts.length >= 2 && pts.some(([a, b]) => inBox(a, b))) portages.push({ id: c.id, names: c.names, pts });
  }

  // campsites (nodes, and area centroids)
  const campsites = [];
  for (const n of taggedNodes) if (isCampTags(n.tags)) campsites.push({ lat: n.lat, lon: n.lon, name: n.tags.name || null });
  for (const w of ways.values()) {
    if (!isCampTags(w.tags)) continue;
    const pts = wayCoords(w.refs);
    if (!pts.length) continue;
    const la = pts.reduce((s, p) => s + p[0], 0) / pts.length, lo = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (inBox(la, lo)) campsites.push({ lat: la, lon: lo, name: w.tags.name || null });
  }

  // points of interest that may mark landings and entry points
  const pois = [];
  for (const n of taggedNodes) if (isPoiTags(n.tags)) pois.push({ lat: n.lat, lon: n.lon, tags: n.tags });
  for (const w of ways.values()) {
    if (!isPoiTags(w.tags) || isWaterTags(w.tags)) continue;
    const pts = wayCoords(w.refs);
    if (!pts.length) continue;
    const la = pts.reduce((s, p) => s + p[0], 0) / pts.length, lo = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (inBox(la, lo)) pois.push({ lat: la, lon: lo, tags: w.tags });
  }

  const out = { bbox, lakes, waterways, portages, campsites, pois, source: extracts, extracted: new Date().toISOString() };
  log(`osm: ${lakes.length} water polygons, ${waterways.length} waterway lines, ${portages.length} portage trails, ${campsites.length} campsites, ${pois.length} POIs`);
  await fsp.writeFile(cacheFile, JSON.stringify(out));
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('osm-extract.mjs')) {
  const { AREAS } = await import('./config.mjs');
  const area = AREAS[process.argv[2] || 'lakeone'];
  const t0 = Date.now();
  const r = await loadOsm(area);
  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s; named lakes: ${r.lakes.filter((l) => l.name).length}`);
}
