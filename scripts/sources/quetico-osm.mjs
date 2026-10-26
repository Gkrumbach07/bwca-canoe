#!/usr/bin/env node
// Source stream D1-quetico-lakes, part 1: the Ontario side's OpenStreetMap.
//
// The bake reads only Geofabrik's Minnesota extract, which stops a few kilometres into Ontario, so most of
// Quetico's lakes, portages and islands are missing. This fetches Geofabrik's Ontario extract once, cuts it to
// the bake's grid box with osmium (the 1 GB province file is deleted after the cut), and runs the bake's own
// extractor (osm-extract.mjs loadOsm) over it, so the result has exactly the form the bake already reads:
//
//   data-cache/quetico-osm/
//     ontario-latest-<key>.cut.osm.pbf   the cut (osmium --strategy smart, the grid box + 0.02°), ~9 MB
//     extract-v2-ontario-<key>.json       loadOsm() over the Ontario cut alone
//     extract-v2-<key>.json               loadOsm() over Minnesota + Ontario together: a drop-in for
//                                         data-cache/osm/extract-v2-<key>.json (Minnesota wins where both have
//                                         an object, so the US side is unchanged; campsites and POIs de-duplicated)
//     islands-<key>.json                  every place=island/islet, with the ones the water polygons would
//                                         drown (no inner ring cut for them) flagged and given their rings
//     border-<key>.json                   the US-Canada line inside the box (admin_level 2 member ways)
//     report-<key>.json                   what the merge changes against the Minnesota-only extract
//     fetched.json                        what was downloaded, when, and from where (the resumable record)
//     manifest.json                       products, fields, legend and citation
//   shots/d1-quetico/osm-*.png            quick looks (whole box, Lake One, a Quetico close-up)
//
// <key> is the bake's padded grid box for the area, "S,W,N,E", the same key osm-extract.mjs uses.
//
// Usage: node scripts/sources/quetico-osm.mjs [--area bwca] [--tiles x0-x1,y0-y1] [--keep-raw] [--no-shots]
//   --tiles cuts and extracts only those bake tiles (for testing); outputs are keyed by the smaller box.
// Needs osmium (brew install osmium-tool). Idempotent: every step is skipped when its output exists.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PNG } from 'pngjs';
import { CFG, AREAS, log, makeProjection, makeGrid } from '../config.mjs';
import { loadOsm } from '../osm-extract.mjs';
import { readPbf } from '../osmpbf.mjs';

const SRC = 'quetico-osm';
const ONTARIO = 'north-america/canada/ontario';
const MINNESOTA = 'north-america/us/minnesota';
const MARGIN = 0.02; // osm-extract.mjs cuts the grid box plus this many degrees

// ---------- arguments and the bake's grid ------------------------------------------------------------

function parseArgs(argv) {
  const o = { area: 'bwca', tiles: null, keepRaw: false, shots: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--area') o.area = argv[++i];
    else if (a === '--tiles') o.tiles = parseTiles(argv[++i]);
    else if (a === '--keep-raw') o.keepRaw = true;
    else if (a === '--no-shots') o.shots = false;
    else if (a === '--help') { console.log('node scripts/sources/quetico-osm.mjs [--area bwca] [--tiles x0-x1,y0-y1] [--keep-raw] [--no-shots]'); process.exit(0); }
  }
  return o;
}
export function parseTiles(s) {
  const [xs, ys] = String(s).split(',');
  const r = (t) => { const [a, b] = t.split('-').map(Number); return [a, Number.isFinite(b) ? b : a]; };
  const [x0, x1] = r(xs), [y0, y1] = r(ys ?? xs);
  return { x0, x1, y0, y1 };
}

// The bake's grid for an area, and the padded lat/lon box it fetches data for (bake.mjs main()).
export function bakeGrid(area) {
  const bbox = AREAS[area];
  if (!bbox) throw new Error('unknown area ' + area);
  const proj = makeProjection(bbox);
  const grid = makeGrid(bbox, proj);
  const { width: W, height: H, cell } = grid;
  const [latS, lonW] = proj.toLatLon(grid.originX, grid.originZ + H * cell);
  const [latN, lonE] = proj.toLatLon(grid.originX + W * cell, grid.originZ);
  const gridBox = { south: latS - 0.005, west: lonW - 0.01, north: latN + 0.005, east: lonE + 0.01 };
  return { bbox, proj, grid, gridBox };
}
// A lat/lon box around a range of tiles (plus the bake's halo and the same padding as the grid box).
export function tilesBox(g, t) {
  const T = CFG.tile * CFG.cell, h = CFG.halo * CFG.cell;
  const x0 = g.grid.originX + t.x0 * T - h, x1 = g.grid.originX + (t.x1 + 1) * T + h;
  const z0 = g.grid.originZ + t.y0 * T - h, z1 = g.grid.originZ + (t.y1 + 1) * T + h;
  const [latS, lonW] = g.proj.toLatLon(x0, z1);
  const [latN, lonE] = g.proj.toLatLon(x1, z0);
  return { south: latS - 0.005, west: lonW - 0.01, north: latN + 0.005, east: lonE + 0.01 };
}
export const boxKey = (b) => `${b.south},${b.west},${b.north},${b.east}`;

// ---------- download and cut ----------------------------------------------------------------------------

async function download(url, file, record) {
  if (fs.existsSync(file)) return;
  const part = file + '.part';
  const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  log('downloading', url, have ? `(resuming at ${(have / 1e6).toFixed(0)} MB)` : '');
  const res = await fetch(url, { headers: { 'User-Agent': CFG.ua, ...(have ? { Range: `bytes=${have}-` } : {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const append = have && res.status === 206;
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(part, { flags: append ? 'a' : 'w' }));
  await fsp.rename(part, file);
  Object.assign(record, { url, resolved: res.url, bytes: fs.statSync(file).size, lastModified: res.headers.get('last-modified'), downloaded: new Date().toISOString() });
}

function osmiumCut(input, box, out) {
  const b = `${box.west - MARGIN},${box.south - MARGIN},${box.east + MARGIN},${box.north + MARGIN}`;
  log('osmium extract', path.basename(input), '->', path.basename(out));
  execFileSync('osmium', ['extract', '--bbox', b, '--strategy', 'smart', '--overwrite', '-o', out + '.part.osm.pbf', input], { stdio: 'inherit' });
  fs.renameSync(out + '.part.osm.pbf', out);
}

function replicationInfo(file) {
  try {
    const t = execFileSync('osmium', ['fileinfo', '-g', 'header.option.osmosis_replication_timestamp', file], { encoding: 'utf8' }).trim();
    return t || null;
  } catch { return null; }
}

// ---------- the bake's own extractor over chosen cuts -------------------------------------------------

// loadOsm() looks for "<name>-latest.osm.pbf" and its "-<key>.cut.osm.pbf" in CFG.cacheDir/osm. A staging
// directory with an empty placeholder for the province file and a link to the cut makes it read exactly the
// cuts given, in order. Later files win on objects both hold (ways, relations and node positions are kept in
// maps), so Minnesota goes last to keep the US side as the bake has it today.
async function extractWith(dir, box, cuts) {
  const key = boxKey(box);
  const stage = path.join(dir, `stage-${process.pid}`);
  await fsp.rm(stage, { recursive: true, force: true });
  await fsp.mkdir(path.join(stage, 'osm'), { recursive: true });
  for (const c of cuts) {
    const base = c.name.split('/').pop() + '-latest.osm.pbf';
    await fsp.writeFile(path.join(stage, 'osm', base), '');
    await fsp.symlink(path.resolve(c.file), path.join(stage, 'osm', base.replace(/\.osm\.pbf$/, `-${key}.cut.osm.pbf`)));
  }
  const saved = CFG.cacheDir;
  CFG.cacheDir = stage;
  let r;
  try { r = await loadOsm(box, cuts.map((c) => c.name)); } finally { CFG.cacheDir = saved; await fsp.rm(stage, { recursive: true, force: true }); }
  // a node in both cuts is reported once per file: keep the first of each position
  const uniq = (arr) => { const seen = new Set(); return arr.filter((p) => { const k = `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
  const nc = r.campsites.length, np = r.pois.length;
  r.campsites = uniq(r.campsites);
  r.pois = uniq(r.pois);
  if (nc !== r.campsites.length || np !== r.pois.length) log(`de-duplicated ${nc - r.campsites.length} campsites and ${np - r.pois.length} POIs held by both cuts`);
  return r;
}

// ---------- geometry helpers (lat/lon rings) -----------------------------------------------------------

function ringsBBox(rings) {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const rg of rings) for (const [la, lo] of rg) { if (la < s) s = la; if (la > n) n = la; if (lo < w) w = lo; if (lo > e) e = lo; }
  return { s, w, n, e };
}
// even-odd point in polygon across all rings
function inRings(rings, la, lo) {
  let inside = false;
  for (const rg of rings) for (let a = 0, n = rg.length, b = n - 1; a < n; b = a++) {
    const [y1, x1] = rg[a], [y2, x2] = rg[b];
    if ((y1 > la) !== (y2 > la) && lo < x1 + ((la - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside;
  }
  return inside;
}
// a point surely inside a ring: the middle of the widest span on the ring's middle latitude
function interiorPoint(ring) {
  const { s, n } = ringsBBox([ring]);
  let best = null;
  for (const f of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const la = s + (n - s) * f, xs = [];
    for (let a = 0, m = ring.length, b = m - 1; a < m; b = a++) {
      const [y1, x1] = ring[a], [y2, x2] = ring[b];
      if ((y1 > la) !== (y2 > la)) xs.push(x1 + ((la - y1) * (x2 - x1)) / (y2 - y1));
    }
    xs.sort((p, q) => p - q);
    for (let q = 0; q + 1 < xs.length; q += 2) if (!best || xs[q + 1] - xs[q] > best.w) best = { w: xs[q + 1] - xs[q], la, lo: (xs[q] + xs[q + 1]) / 2 };
    if (best) break;
  }
  return best ? [best.la, best.lo] : ring[0];
}
const ringAreaM2 = (ring, proj) => {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) { const [x1, z1] = proj.toLocal(...ring[i]), [x2, z2] = proj.toLocal(...ring[(i + 1) % n]); a += x1 * z2 - x2 * z1; }
  return Math.abs(a) / 2;
};
// even-odd area: a ring nested inside an odd number of others is a hole
const polyAreaM2 = (rings, proj) => {
  if (rings.length === 1) return ringAreaM2(rings[0], proj);
  let a = 0;
  rings.forEach((rg, i) => {
    const [la, lo] = rg[0];
    let depth = 0;
    rings.forEach((other, j) => { if (j !== i && inRings([other], la, lo)) depth++; });
    a += (depth % 2 ? -1 : 1) * ringAreaM2(rg, proj);
  });
  return Math.max(0, a);
};
// Chain ids depend on the order ways are read, so a portage is matched by its vertices instead: "same" when
// most of its nodes are nodes of the Minnesota extract's portages.
const vKey = ([la, lo]) => `${la.toFixed(7)},${lo.toFixed(7)}`;
function portageMatcher(mnPortages) {
  const s = new Set();
  for (const p of mnPortages) for (const q of p.pts) s.add(vKey(q));
  return (p) => { let n = 0; for (const q of p.pts) if (s.has(vKey(q))) n++; const f = n / p.pts.length; return f >= 0.999 ? 'same' : f >= 0.5 ? 'extended' : 'new'; };
}
const lineKm = (pts, proj) => { let d = 0; for (let i = 1; i < pts.length; i++) { const [x1, z1] = proj.toLocal(...pts[i - 1]), [x2, z2] = proj.toLocal(...pts[i]); d += Math.hypot(x2 - x1, z2 - z1); } return d / 1000; };

// bucket index of polygons by lat/lon box
function makeIndex(items, getBox, cellDeg = 0.05) {
  const m = new Map();
  const k = (i, j) => i * 100000 + j;
  items.forEach((it, idx) => {
    const b = getBox(it);
    for (let i = Math.floor(b.w / cellDeg); i <= Math.floor(b.e / cellDeg); i++) for (let j = Math.floor(b.s / cellDeg); j <= Math.floor(b.n / cellDeg); j++) {
      const key = k(i, j); let a = m.get(key); if (!a) m.set(key, (a = [])); a.push(idx);
    }
  });
  return (la, lo) => m.get(k(Math.floor(lo / cellDeg), Math.floor(la / cellDeg))) || [];
}

// ---------- islands and the border, straight from the cuts ------------------------------------------------

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
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

// place=island/islet polygons and the admin_level 2 border ways, from the given cuts (later cuts win)
function islandsAndBorder(files) {
  const isIsland = (t) => !!t && (t.place === 'island' || t.place === 'islet');
  const rels = new Map(), border = new Set();
  for (const f of files) readPbf(f, { relation: (id, members, t) => {
    if (isIsland(t) && t.type === 'multipolygon') rels.set(id, { id, members, tags: t });
    if (t && t.boundary === 'administrative' && t.admin_level === '2') for (const m of members) if (m.type === 'way') border.add(m.ref);
  } });
  const memberWays = new Set();
  for (const r of rels.values()) for (const m of r.members) if (m.type === 'way') memberWays.add(m.ref);
  const ways = new Map();
  for (const f of files) readPbf(f, { way: (id, refs, t) => { if (isIsland(t) || memberWays.has(id) || border.has(id)) ways.set(id, { id, refs, tags: t }); } });
  const need = new Set();
  for (const w of ways.values()) for (const r of w.refs) need.add(r);
  const nodes = new Map();
  for (const f of files) readPbf(f, { node: (id, la, lo, t) => {
    if (need.has(id)) nodes.set(id, [la, lo]);
    if (isIsland(t)) nodes.set('p' + id, { la, lo, t });
  } });
  const coords = (refs) => refs.map((r) => nodes.get(r)).filter(Boolean);
  const islands = [];
  for (const w of ways.values()) {
    if (!isIsland(w.tags) || w.refs[0] !== w.refs[w.refs.length - 1]) continue;
    const ring = coords(w.refs);
    if (ring.length >= 4) islands.push({ osm: `way/${w.id}`, name: w.tags.name || null, place: w.tags.place, rings: [ring] });
  }
  for (const r of rels.values()) {
    const outer = r.members.filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => ways.get(m.ref)?.refs).filter(Boolean);
    const rings = assembleRings(outer).map(coords).filter((rg) => rg.length >= 4);
    if (rings.length) islands.push({ osm: `relation/${r.id}`, name: r.tags.name || null, place: r.tags.place, rings });
  }
  const islandNodes = [];
  for (const [k, v] of nodes) if (typeof k === 'string') islandNodes.push({ osm: `node/${k.slice(1)}`, name: v.t.name || null, place: v.t.place, lat: v.la, lon: v.lo });
  const borderLines = [...border].map((id) => ways.get(id)).filter(Boolean).map((w) => coords(w.refs)).filter((l) => l.length >= 2);
  return { islands, islandNodes, borderLines };
}

// Which side of the border a point is on. Everything at the box's south edge is in Minnesota, so a ray from
// the point due south crosses the border an odd number of times exactly when the point is in Canada.
function makeSide(borderLines) {
  const segs = [];
  for (const l of borderLines) for (let i = 1; i < l.length; i++) segs.push([l[i - 1], l[i]]);
  const byLon = makeIndex(segs, ([[a1, o1], [a2, o2]]) => ({ s: Math.min(a1, a2), n: Math.max(a1, a2), w: Math.min(o1, o2), e: Math.max(o1, o2) }), 0.02);
  // bucket by longitude only: query every latitude bucket south of the point
  return (la, lo) => {
    let n = 0;
    const seen = new Set();
    for (let lat = la; lat > 47.6; lat -= 0.02) for (const si of byLon(lat, lo)) {
      if (seen.has(si)) continue; seen.add(si);
      const [[a1, o1], [a2, o2]] = segs[si];
      if ((o1 > lo) === (o2 > lo)) continue;
      const cross = a1 + ((lo - o1) * (a2 - a1)) / (o2 - o1);
      if (cross < la) n++;
    }
    return n % 2 ? 'CA' : 'US';
  };
}

// ---------- the report ----------------------------------------------------------------------------------

function compare(mn, merged, proj, side, inGridBox) {
  const byOsm = new Map(mn.lakes.map((l) => [l.osm, l]));
  const pts = (l) => l.rings.reduce((s, rg) => s + rg.length, 0);
  const newLakes = [], changed = [];
  for (const l of merged.lakes) {
    const old = byOsm.get(l.osm);
    if (!old) newLakes.push(l);
    else if (pts(old) !== pts(l) || old.rings.length !== l.rings.length) changed.push({ osm: l.osm, name: l.name, ringsBefore: old.rings.length, ringsAfter: l.rings.length, ptsBefore: pts(old), ptsAfter: pts(l), areaKm2Before: +(polyAreaM2(old.rings, proj) / 1e6).toFixed(2), areaKm2After: +(polyAreaM2(l.rings, proj) / 1e6).toFixed(2) });
  }
  const lakeInfo = (l) => { const p = interiorPoint(l.rings[0]); return { osm: l.osm, name: l.name, river: l.river || undefined, areaKm2: +(polyAreaM2(l.rings, proj) / 1e6).toFixed(3), side: side(...p), inGrid: inGridBox(...p) }; };
  const nl = newLakes.map(lakeInfo).filter((l) => l.inGrid);
  const wwOld = new Set(mn.waterways.map((w) => w.id));
  const nw = merged.waterways.filter((w) => !wwOld.has(w.id));
  const match = portageMatcher(mn.portages);
  const mid = (p) => p.pts[Math.floor(p.pts.length / 2)];
  const portSide = (arr) => { const o = { US: 0, CA: 0 }; for (const p of arr) o[side(...mid(p))]++; return o; };
  const inG = (arr) => arr.filter((p) => inGridBox(...mid(p)));
  const np = inG(merged.portages.filter((p) => match(p) === 'new'));
  const ext = inG(merged.portages.filter((p) => match(p) === 'extended'));
  const sum = (arr, f) => +arr.reduce((s, x) => s + f(x), 0).toFixed(1);
  const campKey = (c) => `${c.lat.toFixed(7)},${c.lon.toFixed(7)}`;
  const cOld = new Set(mn.campsites.map(campKey));
  const poiOld = new Set(mn.pois.map(campKey));
  return {
    lakes: {
      minnesota: mn.lakes.length, merged: merged.lakes.length,
      newInGrid: nl.length, newInGridBySide: { US: nl.filter((l) => l.side === 'US').length, CA: nl.filter((l) => l.side === 'CA').length },
      newNamed: nl.filter((l) => l.name).length,
      newAreaKm2: sum(nl, (l) => l.areaKm2), newAreaKm2Canada: sum(nl.filter((l) => l.side === 'CA'), (l) => l.areaKm2),
      biggestNew: nl.slice().sort((a, b) => b.areaKm2 - a.areaKm2).slice(0, 40),
      changedGeometry: changed.sort((a, b) => b.ptsAfter - a.ptsAfter),
    },
    waterways: { minnesota: mn.waterways.length, merged: merged.waterways.length, new: nw.length, newKm: sum(nw, (w) => lineKm(w.pts, proj)) },
    portages: {
      minnesota: { chains: inG(mn.portages).length, km: sum(inG(mn.portages), (p) => lineKm(p.pts, proj)), bySide: portSide(inG(mn.portages)) },
      merged: { chains: inG(merged.portages).length, km: sum(inG(merged.portages), (p) => lineKm(p.pts, proj)), bySide: portSide(inG(merged.portages)) },
      newChains: np.length, newKm: sum(np, (p) => lineKm(p.pts, proj)), newBySide: portSide(np),
      extendedChains: ext.length, extendedBySide: portSide(ext),
      newNamed: np.filter((p) => p.names.length).map((p) => p.names.join(' / ')).sort(),
    },
    campsites: { minnesota: mn.campsites.length, merged: merged.campsites.length, new: merged.campsites.filter((c) => !cOld.has(campKey(c))).map((c) => ({ lat: c.lat, lon: c.lon, name: c.name, side: side(c.lat, c.lon) })) },
    pois: { minnesota: mn.pois.length, merged: merged.pois.length, new: merged.pois.filter((p) => !poiOld.has(campKey(p))).length },
  };
}

// ---------- quick looks -------------------------------------------------------------------------------

function quickLook(file, view, layers) {
  const { W, H, toPx } = view;
  const png = new PNG({ width: W, height: H });
  const put = (x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4; png.data[o] = c[0]; png.data[o + 1] = c[1]; png.data[o + 2] = c[2]; png.data[o + 3] = 255; };
  for (let k = 0; k < W * H; k++) { png.data[k * 4] = 236; png.data[k * 4 + 1] = 232; png.data[k * 4 + 2] = 220; png.data[k * 4 + 3] = 255; }
  const fill = (rings, c) => {
    const pr = rings.map((rg) => rg.map(([la, lo]) => toPx(la, lo)));
    let y0 = Infinity, y1 = -Infinity;
    for (const rg of pr) for (const [, y] of rg) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (let y = Math.max(0, Math.ceil(y0 - 0.5)); y <= Math.min(H - 1, Math.floor(y1 - 0.5)); y++) {
      const yc = y + 0.5, xs = [];
      for (const rg of pr) for (let a = 0, n = rg.length; a < n; a++) { const [x1, z1] = rg[a], [x2, z2] = rg[(a + 1) % n]; if ((z1 <= yc) !== (z2 <= yc)) xs.push(x1 + ((yc - z1) * (x2 - x1)) / (z2 - z1)); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) for (let x = Math.max(0, Math.ceil(xs[q] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[q + 1] - 0.5)); x++) put(x, y, c);
    }
  };
  const line = (pts, c, wide) => {
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = toPx(...pts[i - 1]), [x2, y2] = toPx(...pts[i]);
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2));
      for (let s = 0; s <= n; s++) { const x = x1 + ((x2 - x1) * s) / n, y = y1 + ((y2 - y1) * s) / n; put(x, y, c); if (wide) { put(x + 1, y, c); put(x, y + 1, c); } }
    }
  };
  for (const L of layers) {
    if (L.fill) for (const it of L.items) fill(it.rings, L.color);
    if (L.line) for (const it of L.items) line(it.pts || it, L.color, L.wide);
    if (L.dot) for (const [la, lo] of L.items) { const [x, y] = toPx(la, lo); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) put(x + dx, y + dy, L.color); }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
  log('quick look', file, `${W} x ${H}`);
}
function viewOf(g, latlonBox, mPerPx) {
  const [x0, z0] = g.proj.toLocal(latlonBox.north, latlonBox.west), [x1, z1] = g.proj.toLocal(latlonBox.south, latlonBox.east);
  const W = Math.round((x1 - x0) / mPerPx), H = Math.round((z1 - z0) / mPerPx);
  return { W, H, toPx: (la, lo) => { const [x, z] = g.proj.toLocal(la, lo); return [(x - x0) / mPerPx, (z - z0) / mPerPx]; } };
}

// ---------- main ------------------------------------------------------------------------------------------

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const g = bakeGrid(opt.area);
  const fullBox = g.gridBox, fullKey = boxKey(fullBox);
  const box = opt.tiles ? tilesBox(g, opt.tiles) : fullBox;
  const key = boxKey(box);
  const dir = path.join(CFG.cacheDir, SRC);
  await fsp.mkdir(path.join(dir, 'raw'), { recursive: true });
  const recFile = path.join(dir, 'fetched.json');
  const rec = fs.existsSync(recFile) ? JSON.parse(fs.readFileSync(recFile, 'utf8')) : {};

  // 1. the Ontario cut for the whole grid box (the province file is deleted once cut)
  const fullCut = path.join(dir, `ontario-latest-${fullKey}.cut.osm.pbf`);
  if (!fs.existsSync(fullCut)) {
    const raw = path.join(dir, 'raw', 'ontario-latest.osm.pbf');
    rec.ontario = rec.ontario || {};
    await download(CFG.geofabrik(ONTARIO), raw, rec.ontario);
    rec.ontario.replicationTimestamp = replicationInfo(raw) || rec.ontario.replicationTimestamp || null;
    osmiumCut(raw, fullBox, fullCut);
    rec.ontario.cut = { file: path.basename(fullCut), bytes: fs.statSync(fullCut).size, box: fullBox, margin: MARGIN, strategy: 'smart', made: new Date().toISOString() };
    if (!opt.keepRaw) { await fsp.rm(raw, { force: true }); rec.ontario.rawDeleted = true; log('deleted the province file'); }
    await fsp.writeFile(recFile, JSON.stringify(rec, null, 2));
  }
  if (!rec.ontario?.replicationTimestamp) { rec.ontario = rec.ontario || {}; rec.ontario.replicationTimestamp = replicationInfo(fullCut); await fsp.writeFile(recFile, JSON.stringify(rec, null, 2)); }
  const mnFull = path.join(CFG.cacheDir, 'osm', `minnesota-latest-${fullKey}.cut.osm.pbf`);
  if (!fs.existsSync(mnFull)) throw new Error(`the bake's Minnesota cut is missing: ${mnFull} (run npm run bake:all once)`);
  let onCut = fullCut, mnCut = mnFull;
  if (opt.tiles) {
    const sub = path.join(dir, 'test');
    await fsp.mkdir(sub, { recursive: true });
    onCut = path.join(sub, `ontario-latest-${key}.cut.osm.pbf`);
    mnCut = path.join(sub, `minnesota-latest-${key}.cut.osm.pbf`);
    if (!fs.existsSync(onCut)) osmiumCut(fullCut, box, onCut);
    if (!fs.existsSync(mnCut)) osmiumCut(mnFull, box, mnCut);
  }
  const outDir = opt.tiles ? path.join(dir, 'test') : dir;

  // 2. the extracts, through the bake's own loadOsm()
  const fOn = path.join(outDir, `extract-v2-ontario-${key}.json`);
  const fMerged = path.join(outDir, `extract-v2-${key}.json`);
  const fMn = path.join(CFG.cacheDir, 'osm', `extract-v2-${key}.json`);
  const readOr = async (f, make) => { try { return JSON.parse(await fsp.readFile(f, 'utf8')); } catch {} const r = await make(); await fsp.writeFile(f, JSON.stringify(r)); return r; };
  await readOr(fOn, () => extractWith(outDir, box, [{ name: ONTARIO, file: onCut }])); // the Ontario side alone, for reference
  const merged = await readOr(fMerged, async () => {
    const r = await extractWith(outDir, box, [{ name: ONTARIO, file: onCut }, { name: MINNESOTA, file: mnCut }]);
    r.sourceDates = { [ONTARIO]: rec.ontario?.replicationTimestamp || null, [MINNESOTA]: replicationInfo(mnCut) };
    return r;
  });
  // the Minnesota-only extract to compare with: the bake's own cache for the full box, else made the same way
  const mn = opt.tiles ? await readOr(path.join(outDir, `extract-v2-minnesota-${key}.json`), () => extractWith(outDir, box, [{ name: MINNESOTA, file: mnCut }])) : JSON.parse(await fsp.readFile(fMn, 'utf8'));

  // 3. islands and the border
  const { islands, islandNodes, borderLines } = islandsAndBorder([onCut, mnCut]);
  const side = makeSide(borderLines);
  const lakeIdx = makeIndex(merged.lakes, (l) => ringsBBox(l.rings));
  for (const isl of islands) {
    const [la, lo] = interiorPoint(isl.rings[0]);
    isl.point = [+la.toFixed(7), +lo.toFixed(7)];
    isl.areaM2 = Math.round(polyAreaM2(isl.rings, g.proj));
    isl.side = side(la, lo);
    const hit = lakeIdx(la, lo).find((i) => inRings(merged.lakes[i].rings, la, lo));
    isl.drowned = hit !== undefined ? merged.lakes[hit].osm : false;
  }
  const inBox = (la, lo) => la >= box.south && la <= box.north && lo >= box.west && lo <= box.east;
  const islOut = islands.filter((i) => inBox(...i.point)).map((i) => ({ ...i, rings: i.drowned ? i.rings : undefined }));
  await fsp.writeFile(path.join(outDir, `islands-${key}.json`), JSON.stringify({
    box, legend: { drowned: 'false, or the osm id of the water polygon that covers the island (it has no inner ring for it): the bake would draw it as water', point: '[lat, lon] inside the island', areaM2: 'island area', side: 'US or CA' },
    islands: islOut, islandNodes: islandNodes.filter((n) => inBox(n.lat, n.lon)).map((n) => ({ ...n, side: side(n.lat, n.lon) })),
  }));
  await fsp.writeFile(path.join(outDir, `border-${key}.json`), JSON.stringify({ box, what: 'US-Canada boundary (OSM admin_level 2 member ways) inside the box, [lat, lon]', lines: borderLines }));

  // 4. the report
  const [gx0, gz0] = [g.grid.originX, g.grid.originZ], gx1 = gx0 + g.grid.width * g.grid.cell, gz1 = gz0 + g.grid.height * g.grid.cell;
  const inGridBox = (la, lo) => { if (!inBox(la, lo)) return false; const [x, z] = g.proj.toLocal(la, lo); return x >= gx0 && x <= gx1 && z >= gz0 && z <= gz1; };
  const report = compare(mn, merged, g.proj, side, inGridBox);
  const iIn = islOut;
  report.islands = {
    polygons: iIn.length, bySide: { US: iIn.filter((i) => i.side === 'US').length, CA: iIn.filter((i) => i.side === 'CA').length },
    drowned: iIn.filter((i) => i.drowned).length, drownedOver400m2: iIn.filter((i) => i.drowned && i.areaM2 >= 400).length,
    drownedBySide: { US: iIn.filter((i) => i.drowned && i.side === 'US').length, CA: iIn.filter((i) => i.drowned && i.side === 'CA').length },
    drownedAreaKm2: +(iIn.filter((i) => i.drowned).reduce((s, i) => s + i.areaM2, 0) / 1e6).toFixed(2),
    biggestDrowned: iIn.filter((i) => i.drowned).sort((a, b) => b.areaM2 - a.areaM2).slice(0, 15).map((i) => ({ osm: i.osm, name: i.name, areaM2: i.areaM2, side: i.side, in: i.drowned })),
    pointsOnly: islandNodes.filter((n) => inBox(n.lat, n.lon)).length,
  };
  report.border = { lines: borderLines.length, km: +borderLines.reduce((s, l) => s + lineKm(l, g.proj), 0).toFixed(1) };
  report.box = box; report.key = key; report.made = new Date().toISOString();
  await fsp.writeFile(path.join(outDir, `report-${key}.json`), JSON.stringify(report, null, 2));
  log(`lakes ${report.lakes.minnesota} -> ${report.lakes.merged} (${report.lakes.newInGrid} new in the grid, ${report.lakes.newAreaKm2} km², ${report.lakes.changedGeometry.length} Minnesota polygons completed or changed)`);
  log(`portages in the grid ${report.portages.minnesota.chains} chains / ${report.portages.minnesota.km} km -> ${report.portages.merged.chains} / ${report.portages.merged.km} km; new ${report.portages.newChains} (${JSON.stringify(report.portages.newBySide)})`);
  log(`waterways +${report.waterways.new} (${report.waterways.newKm} km); campsites +${report.campsites.new.length}; islands ${report.islands.polygons}, drowned ${report.islands.drowned} (${report.islands.drownedOver400m2} over 400 m²); border ${report.border.km} km`);

  // 5. manifest
  const size = (f) => (fs.existsSync(f) ? fs.statSync(f).size : null);
  const manifest = {
    source: SRC, stream: 'D1-quetico-lakes', script: 'scripts/sources/quetico-osm.mjs', made: new Date().toISOString(),
    citation: '© OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright); extracts by Geofabrik GmbH, download.geofabrik.de',
    fetched: rec,
    grid: { area: opt.area, cell: CFG.cell, tile: CFG.tile, originX: g.grid.originX, originZ: g.grid.originZ, width: g.grid.width, height: g.grid.height, ntx: g.grid.ntx, nty: g.grid.nty, gridBox: fullBox, key: fullKey },
    kind: 'vector (lat/lon); the bake rasterizes it as it does the Minnesota extract',
    products: {
      [`ontario-latest-${fullKey}.cut.osm.pbf`]: { bytes: size(fullCut), what: `Geofabrik ${ONTARIO} cut to the grid box + ${MARGIN}° with osmium --strategy smart` },
      [`extract-v2-ontario-${fullKey}.json`]: { bytes: size(path.join(dir, `extract-v2-ontario-${fullKey}.json`)), form: 'osm-extract.mjs loadOsm() output over the Ontario cut alone' },
      [`extract-v2-${fullKey}.json`]: { bytes: size(path.join(dir, `extract-v2-${fullKey}.json`)), form: 'osm-extract.mjs loadOsm() output over the Ontario and Minnesota cuts: a drop-in for data-cache/osm/extract-v2-<key>.json' },
      [`islands-${fullKey}.json`]: { bytes: size(path.join(dir, `islands-${fullKey}.json`)), what: 'place=island/islet polygons and points; drowned ones carry rings' },
      [`border-${fullKey}.json`]: { bytes: size(path.join(dir, `border-${fullKey}.json`)), what: 'the US-Canada line in the box' },
      [`report-${fullKey}.json`]: { what: 'counts: Minnesota-only against merged' },
    },
    fields: {
      lakes: '[{ osm: "way/<id>" | "relation/<id>", name, river: bool, rings: [[[lat, lon], ...], ...] }] biggest first; even-odd rings (islands are inner rings)',
      waterways: '[{ id, name, kind: river|stream|canal, pts: [[lat, lon], ...] }] drawn downstream',
      portages: '[{ id (first way id), names: [...], pts: [[lat, lon], ...] }] ways chained at degree-2 ends',
      campsites: '[{ lat, lon, name }]',
      pois: '[{ lat, lon, tags }] slipways, put-ins, landings and named parking',
    },
    legend: { quickLook: { land: '#ece8dc', water: '#7aa6c2 (Minnesota extract)', waterNew: '#2f8f7f (added by the Ontario extract)', portage: '#202020 (Minnesota extract)', portageNew: '#d02020 (added)', border: '#8a6d9a', drownedIsland: '#e000e0 dot' } },
  };
  if (!opt.tiles) await fsp.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // 6. quick looks: whole box, Lake One, and a Quetico close-up
  if (opt.shots) {
    const oldLakes = new Set(mn.lakes.map((l) => l.osm)), match = portageMatcher(mn.portages);
    const layers = [
      { fill: true, items: merged.lakes.filter((l) => oldLakes.has(l.osm)), color: [122, 166, 194] },
      { fill: true, items: merged.lakes.filter((l) => !oldLakes.has(l.osm)), color: [47, 143, 127] },
      { line: true, items: borderLines, color: [138, 109, 154] },
      { line: true, items: merged.portages.filter((p) => match(p) === 'same'), color: [32, 32, 32] },
      { line: true, wide: true, items: merged.portages.filter((p) => match(p) !== 'same'), color: [208, 32, 32] },
      { dot: true, items: islOut.filter((i) => i.drowned).map((i) => i.point), color: [224, 0, 224] },
    ];
    const shots = path.join('shots', 'd1-quetico');
    const tag = opt.tiles ? `-tiles-${opt.tiles.x0}-${opt.tiles.x1}_${opt.tiles.y0}-${opt.tiles.y1}` : '';
    quickLook(path.join(shots, `osm-box${tag}.png`), viewOf(g, box, opt.tiles ? 20 : 80), layers);
    if (!opt.tiles) {
      quickLook(path.join(shots, 'osm-lakeone.png'), viewOf(g, AREAS.lakeone, 10), layers);
      quickLook(path.join(shots, 'osm-quetico.png'), viewOf(g, { south: 48.12, west: -91.85, north: 48.41, east: -91.2 }, 25), layers);
      const ql = path.join(dir, 'quicklook');
      await fsp.mkdir(ql, { recursive: true });
      for (const f of ['osm-box.png', 'osm-lakeone.png', 'osm-quetico.png']) await fsp.copyFile(path.join(shots, f), path.join(ql, f));
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('quetico-osm.mjs')) main().catch((e) => { console.error(e); process.exit(1); });
