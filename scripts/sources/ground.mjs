#!/usr/bin/env node
// Source stream D1-ground: what the ground is, per 10 m cell, from agency data instead of noise.
//
// Fetches and derives only (no game code). Round D2's bake reads the products from data-cache/ground/:
//   <tx>_<ty>.kind.bin    u8  ground kind (legend in manifest.json): bogs, swamps, marsh, wet meadow,
//                             emergent and aquatic beds, rock, boulders, sand, open water, upland; 0 = no survey
//   <tx>_<ty>.rock.bin    u8  SSURGO map unit rock outcrop % (0..100); 255 = no SSURGO
//   <tx>_<ty>.stone.bin   u8  SSURGO surface stone and boulder cover, 254*sqrt(cover fraction); 255 = no SSURGO
//   <tx>_<ty>.peat.bin    u8  SSURGO map unit Histosol (peat and muck) %; 255 = no SSURGO. Masked by the NWI
//                             kinds it is MN DNR's "Potentially Wet Histosols" (NWI x soils) on the grid
//   manifest.json             grid, layout, legends, precedence, citations, tiles written
// Each .bin is gzip of the tile's core 256x256 cells (no halo), row-major, row 0 = north edge, on the
// AREAS.bwca grid of scripts/config.mjs (the same origin, cell and tile index as bake.mjs). A tile with
// nothing surveyed (Ontario) is not written; fill it with each channel's nodata.
//
// Sources (fetched once by REST, cached compactly in data-cache/ground/raw/, resumable per 4x4-tile block):
//   - NWI for Minnesota, 2009-14 update (MN DNR): Cowardin class + plant community, per polygon
//   - SSURGO via Soil Data Access (USDA NRCS): map unit polygons clipped per block, plus each map unit's
//     components (rock outcrop, Histosols, surface stone phases and cover)
//   - OSM natural=beach/sand/bare_rock/rock/scree areas from the bake's own cached Minnesota extract
//
// Usage: node scripts/sources/ground.mjs [--tiles lakeone | --tiles tx0-tx1,ty0-ty1] [--fetch-only]
//        [--no-fetch] [--refetch] [--png] [--png-only] [--check]
//   Run from the repo root (or set BWCA_CACHE) so data-cache/ is the main checkout's.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { CFG, AREAS, log, sleep, makeProjection, makeGrid } from '../config.mjs';
import { readPbf } from '../osmpbf.mjs';

// ---------- sources ------------------------------------------------------------------------

const NWI_URL = 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_dnr/water_nat_wetlands_inv_2009_2014/FeatureServer/0';
const HIST_URL = 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_dnr/geos_potentially_wet_histosols/FeatureServer/0';
const SDA_URL = 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest';
// open water bigger than this is a lake the bake already has from OSM: leave it out of the fetch (it is heavy)
const NWI_WHERE = "cow_class1 <> 'UB' OR acres < 100";
const SIMPLIFY_DEG = 0.00002; // ~2 m: server-side generalisation, well under the 10 m cell
const MIN_FREE_GB = 15;

// ---------- the legend -----------------------------------------------------------------------

export const KIND = {
  none: 0, upland: 1, openBog: 2, coniferBog: 3, shrubSwamp: 4, marsh: 5, wetMeadow: 6, hardwoodSwamp: 7,
  emergent: 8, aquaticBed: 9, rock: 10, boulders: 11, sand: 12, water: 13,
};
const LEGEND = [
  [KIND.none, 'none', '#d9d9d9', 'No survey here (Ontario, outside NWI and SSURGO): keep the game\'s own fields'],
  [KIND.upland, 'upland', '#ebe5d3', 'Surveyed dry land: no NWI wetland, no mapped rock, sand or boulder field. Use rock/stone for how rocky'],
  [KIND.openBog, 'open bog', '#c9ae4f', 'NWI "Open Bog" (scrub-shrub, Circular 39 type 8): sphagnum and leatherleaf, a few stunted spruce'],
  [KIND.coniferBog, 'conifer bog', '#35603d', 'NWI "Coniferous Bog" (forested, type 8): black spruce and tamarack on peat'],
  [KIND.shrubSwamp, 'shrub swamp', '#8ea05a', 'NWI "Shrub Wetland" (type 6): alder and willow thickets, shrub carr'],
  [KIND.marsh, 'marsh', '#5fa596', 'NWI "Shallow Marsh" (PEM1, type 3): cattail, bulrush, sedge in shallow standing water'],
  [KIND.wetMeadow, 'wet meadow', '#c6d474', 'NWI "Seasonally Flooded/Saturated Emergent" (types 1-2): sedge meadows and beaver meadows, wet but not standing water'],
  [KIND.hardwoodSwamp, 'hardwood swamp', '#7b5b3b', 'NWI "Hardwood Wetland" (forested, type 7): black ash and other lowland hardwoods'],
  [KIND.emergent, 'in-lake emergent', '#e0453a', 'NWI emergent in open water: L2EM and R2EM (lakes and rivers) and PEM2 "Deep Marsh" (ponds): wild rice, bulrush, pickerelweed, reeds'],
  [KIND.aquaticBed, 'aquatic bed', '#e38bd0', 'NWI aquatic bed: L2AB, R2AB and PAB: water lilies and pondweed'],
  [KIND.rock, 'rock outcrop', '#7c7c86', 'Mapped bare rock: OSM natural=bare_rock or rock areas, NWI rocky shore (RS). SSURGO alone never sets it (no map unit here is over 35 % rock): see rock'],
  [KIND.boulders, 'boulder field', '#9d6ad0', 'OSM natural=scree areas, or a SSURGO map unit at least half rubbly (stones and boulders cover 15-50 %+ of the surface) with no NWI wetland on it'],
  [KIND.sand, 'sand', '#f0cd5e', 'Mapped beach or sand only: OSM natural=beach or sand areas, NWI unconsolidated sand shore (US2). Nothing is inferred'],
  [KIND.water, 'open water', '#8db6dc', 'NWI open water under 100 acres (ponds, beaver ponds, unvegetated shallows: UB) or a SSURGO "Water" map unit. Bigger lakes are the bake\'s own (OSM)'],
];

// The order a cell's kind is decided in (first that applies wins). Kept here and in the manifest.
const PRECEDENCE = [
  'NWI aquatic bed (9), then NWI in-lake emergent (8): the beds in the water, from the polygon that holds them',
  'OSM mapped areas: sand (12, natural=beach/sand), rock outcrop (10, natural=bare_rock/rock), boulder field (11, natural=scree): small, precisely placed, so they win over the coarser NWI polygons they sit in',
  'NWI palustrine wetlands: open bog (2), conifer bog (3), shrub swamp (4), marsh (5), wet meadow (6), hardwood swamp (7)',
  'NWI shore and water: rocky shore RS -> rock outcrop (10), sand shore US2 -> sand (12), open water UB under 100 acres -> open water (13)',
  'SSURGO map unit: "Water" -> open water (13); at least half its components rubbly -> boulder field (11); otherwise upland (1)',
  'Nothing surveyed -> none (0)',
];

// Surface fragment cover by phase when a component has no cosurffrags row (Soil Survey Manual classes, % of the surface)
const PHASE_COVER = [['very rubbly', 75], ['rubbly', 32], ['extremely bouldery', 9], ['extremely stony', 9], ['very bouldery', 1.5], ['very stony', 1.5], ['bouldery', 0.05], ['stony', 0.05]];
const encStone = (pct) => Math.min(254, Math.round(254 * Math.sqrt(Math.max(0, pct) / 100)));

// ---------- CLI ------------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { tiles: null, fetch: true, raster: true, refetch: false, png: false, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tiles') o.tiles = argv[++i];
    else if (a === '--fetch-only') o.raster = false;
    else if (a === '--no-fetch') o.fetch = false;
    else if (a === '--refetch') o.refetch = true;
    else if (a === '--png') o.png = true;
    else if (a === '--png-only') { o.png = true; o.fetch = false; o.raster = false; }
    else if (a === '--check') o.check = true;
    else if (a === '--help') { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 26).join('\n')); process.exit(0); }
    else throw new Error('unknown argument ' + a);
  }
  return o;
}

const AREA = 'bwca';
const bbox = AREAS[AREA];
export const proj = makeProjection(bbox);
export const grid = makeGrid(bbox, proj);
const T = CFG.tile, BT = 4, BS = BT * T; // fetch and rasterise in blocks of 4x4 tiles (10.24 km)
export const OUT = path.join(CFG.cacheDir, 'ground');
export const RAW = path.join(OUT, 'raw');

// Tiles wanted: all, an AREAS name (the tiles covering it), or "tx0-tx1,ty0-ty1".
function selectTiles(spec) {
  const all = (tx, ty) => tx >= 0 && ty >= 0 && tx < grid.ntx && ty < grid.nty;
  let tx0 = 0, tx1 = grid.ntx - 1, ty0 = 0, ty1 = grid.nty - 1;
  if (spec && AREAS[spec]) {
    const b = AREAS[spec];
    const [xw, zn] = proj.toLocal(b.north, b.west), [xe, zs] = proj.toLocal(b.south, b.east);
    tx0 = Math.floor(grid.ci(xw) / T); tx1 = Math.floor(grid.ci(xe) / T);
    ty0 = Math.floor(grid.cj(zn) / T); ty1 = Math.floor(grid.cj(zs) / T);
  } else if (spec) {
    const m = /^(\d+)(?:-(\d+))?,(\d+)(?:-(\d+))?$/.exec(spec);
    if (!m) throw new Error('--tiles wants an area name or tx0-tx1,ty0-ty1');
    tx0 = +m[1]; tx1 = m[2] ? +m[2] : tx0; ty0 = +m[3]; ty1 = m[4] ? +m[4] : ty0;
  }
  const out = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (all(tx, ty)) out.push([tx, ty]);
  return out;
}

// A block's lat/lon envelope, padded ~50 m. The local projection is linear in lat and lon, so a block of
// cells is exactly a lat/lon rectangle.
export function blockEnvelope(bx, by, pad = 0.0005) {
  const i0 = bx * BS, j0 = by * BS, i1 = Math.min(grid.width, i0 + BS), j1 = Math.min(grid.height, j0 + BS);
  const [n, w] = proj.toLatLon(grid.originX + i0 * grid.cell, grid.originZ + j0 * grid.cell);
  const [s, e] = proj.toLatLon(grid.originX + i1 * grid.cell, grid.originZ + j1 * grid.cell);
  return { s: s - pad, w: w - pad, n: n + pad, e: e + pad, i0, j0, i1, j1 };
}

function freeGB(dir) {
  const st = fs.statfsSync(dir);
  return (st.bavail * st.bsize) / 1e9;
}
function guardDisk() {
  const gb = freeGB(CFG.cacheDir);
  if (gb < MIN_FREE_GB) { log(`only ${gb.toFixed(1)} GB free (< ${MIN_FREE_GB}): stopping`); process.exit(2); }
  return gb;
}

// ---------- compact polygon packs ---------------------------------------------------------------
// A pack is gzip of: 'GPK1', u32 header length, header JSON {strings, count}, then per feature
// u32 key, u16 a, u16 b, u32 ring count, and per ring u32 point count + Int32 (lon, lat) in 1e-6 degrees,
// delta-coded after the first point. a and b index the header's strings (attributes).

function writePack(file, feats) {
  const strings = [], sIdx = new Map();
  const si = (s) => { s = s ?? ''; if (!sIdx.has(s)) { sIdx.set(s, strings.length); strings.push(s); } return sIdx.get(s); };
  let n = 0;
  for (const f of feats) { n += 12; for (const r of f.rings) n += 4 + r.length * 4; si(f.a); si(f.b); }
  const body = Buffer.alloc(n);
  let p = 0;
  for (const f of feats) {
    body.writeUInt32LE(f.key >>> 0, p); body.writeUInt16LE(si(f.a), p + 4); body.writeUInt16LE(si(f.b), p + 6); body.writeUInt32LE(f.rings.length, p + 8); p += 12;
    for (const r of f.rings) { // r: flat [lon, lat, lon, lat, ...]
      body.writeUInt32LE(r.length / 2, p); p += 4;
      let plon = 0, plat = 0;
      for (let k = 0; k < r.length; k += 2) {
        const qlon = Math.round(r[k] * 1e6), qlat = Math.round(r[k + 1] * 1e6);
        body.writeInt32LE(qlon - plon, p); body.writeInt32LE(qlat - plat, p + 4); p += 8;
        plon = qlon; plat = qlat;
      }
    }
  }
  const head = Buffer.from(JSON.stringify({ strings, count: feats.length }));
  const pre = Buffer.alloc(8); pre.write('GPK1', 0); pre.writeUInt32LE(head.length, 4);
  const tmp = file + '.part';
  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.concat([pre, head, body]), { level: 9 }));
  fs.renameSync(tmp, file);
}

export function readPack(file) {
  const buf = zlib.gunzipSync(fs.readFileSync(file));
  if (buf.toString('latin1', 0, 4) !== 'GPK1') throw new Error('not a pack: ' + file);
  const hl = buf.readUInt32LE(4);
  const { strings, count } = JSON.parse(buf.toString('utf8', 8, 8 + hl));
  let p = 8 + hl;
  const feats = [];
  for (let k = 0; k < count; k++) {
    const key = buf.readUInt32LE(p), a = strings[buf.readUInt16LE(p + 4)], b = strings[buf.readUInt16LE(p + 6)], nr = buf.readUInt32LE(p + 8); p += 12;
    const rings = [];
    for (let r = 0; r < nr; r++) {
      const np = buf.readUInt32LE(p); p += 4;
      const ring = new Float64Array(np * 2);
      let lon = 0, lat = 0;
      for (let q = 0; q < np; q++) { lon += buf.readInt32LE(p); lat += buf.readInt32LE(p + 4); p += 8; ring[q * 2] = lon * 1e-6; ring[q * 2 + 1] = lat * 1e-6; }
      rings.push(ring);
    }
    feats.push({ key, a, b, rings });
  }
  return feats;
}

// ---------- fetching -----------------------------------------------------------------------------

async function getJson(url, init, what) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'User-Agent': CFG.ua, ...(init?.headers || {}) }, signal: AbortSignal.timeout(180000) });
      const txt = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${txt.slice(0, 200)}`);
      const j = JSON.parse(txt);
      if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 300));
      return j;
    } catch (err) {
      if (attempt >= 5) throw new Error(`${what}: ${err.message}`);
      log(`  ${what}: ${err.message.slice(0, 120)}; retry ${attempt} in ${attempt * 5} s`);
      await sleep(attempt * 5000);
    }
  }
}

const flatRing = (pts) => { const r = new Array(pts.length * 2); for (let k = 0; k < pts.length; k++) { r[k * 2] = pts[k][0]; r[k * 2 + 1] = pts[k][1]; } return r; };

// Every polygon of an ArcGIS layer meeting an envelope, paged (the server stops short of resultRecordCount
// and sets exceededTransferLimit), generalised to ~2 m on the server.
async function fetchArcgisBlock(url, where, fields, env, attrs) {
  const feats = [];
  for (let offset = 0; ;) {
    const q = new URLSearchParams({
      where, geometry: `${env.w},${env.s},${env.e},${env.n}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', outFields: fields, geometryPrecision: '6',
      maxAllowableOffset: String(SIMPLIFY_DEG), orderByFields: 'objectid', resultOffset: String(offset), resultRecordCount: '1000', f: 'json',
    });
    const j = await getJson(`${url}/query`, { method: 'POST', body: q, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, url.split('/').slice(-3, -2)[0]);
    for (const f of j.features || []) if (f.geometry?.rings?.length) feats.push({ ...attrs(f.attributes), rings: f.geometry.rings.map(flatRing) });
    const got = (j.features || []).length;
    offset += got;
    if (!j.exceededTransferLimit || !got) break;
    await sleep(300);
  }
  return feats;
}
const fetchNwiBlock = (env) => fetchArcgisBlock(NWI_URL, NWI_WHERE, 'objectid,attribute,spcc_desc', env, (a) => ({ key: a.objectid, a: a.attribute || '', b: a.spcc_desc || '' }));

// Minimal WKT reader: the polygons of a POLYGON, MULTIPOLYGON or GEOMETRYCOLLECTION (lines and points
// from a clip are dropped). Returns one flat ring list (even-odd fill makes parts and holes work).
function wktRings(s) {
  let p = 0;
  const rings = [];
  const ws = () => { while (p < s.length && (s[p] === ' ' || s[p] === '\n' || s[p] === '\t')) p++; };
  const word = () => { ws(); const st = p; while (p < s.length && /[A-Za-z]/.test(s[p])) p++; return s.slice(st, p).toUpperCase(); };
  const expect = (c) => { ws(); if (s[p] !== c) throw new Error(`WKT: expected ${c} at ${p}`); p++; };
  const empty = () => { ws(); if (s.startsWith('EMPTY', p)) { p += 5; return true; } return false; };
  const coords = () => { expect('('); const e = s.indexOf(')', p); const nums = s.slice(p, e).split(/[\s,]+/).filter(Boolean).map(Number); p = e + 1; return nums; };
  const list = (fn) => { expect('('); for (;;) { fn(); ws(); if (s[p] === ',') { p++; continue; } break; } expect(')'); };
  const polygon = () => { if (!empty()) list(() => { const r = coords(); if (r.length >= 6) rings.push(r); }); };
  const skip = () => { ws(); if (empty()) return; let d = 0; do { if (s[p] === '(') d++; else if (s[p] === ')') d--; p++; } while (d > 0 && p < s.length); };
  const geom = () => {
    const t = word();
    if (t === 'POLYGON') polygon();
    else if (t === 'MULTIPOLYGON') { if (!empty()) list(polygon); }
    else if (t === 'GEOMETRYCOLLECTION') { if (!empty()) list(geom); }
    else skip();
  };
  geom();
  return rings;
}

async function sda(sql, what) {
  const j = await getJson(SDA_URL, { method: 'POST', body: JSON.stringify({ query: sql, format: 'JSON+COLUMNNAME' }), headers: { 'Content-Type': 'application/json' } }, what);
  const t = j.Table || [];
  const head = t[0] || [];
  return t.slice(1).map((row) => Object.fromEntries(head.map((h, k) => [h, row[k]])));
}

async function fetchSsurgoBlock(env) {
  const box = `POLYGON((${env.w} ${env.s}, ${env.e} ${env.s}, ${env.e} ${env.n}, ${env.w} ${env.n}, ${env.w} ${env.s}))`;
  const G = `geometry::STGeomFromText('${box}', 4326)`;
  const rows = await sda(`SELECT P.mukey, P.mupolygonkey, P.mupolygongeo.STIntersection(${G}).Reduce(${SIMPLIFY_DEG}).STAsText() AS wkt
    FROM mupolygon P WHERE P.mupolygongeo.STIntersects(${G}) = 1`, 'SSURGO polygons');
  const feats = [];
  for (const r of rows) {
    const rings = wktRings(r.wkt || '');
    if (rings.length) feats.push({ key: +r.mukey, a: String(r.mupolygonkey), b: '', rings });
  }
  return feats;
}

async function fetchMapunits(mukeys, file) {
  const have = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const need = mukeys.filter((k) => !have[k]);
  for (let s = 0; s < need.length; s += 150) {
    const ks = need.slice(s, s + 150).join(',');
    const mus = await sda(`SELECT mu.mukey, mu.muname, mu.mukind, l.areasymbol FROM mapunit mu JOIN legend l ON l.lkey = mu.lkey WHERE mu.mukey IN (${ks})`, 'SSURGO map units');
    const comps = await sda(`SELECT c.mukey, c.compname, c.comppct_r, c.compkind, c.localphase, c.taxorder, c.taxsuborder, c.drainagecl,
      (SELECT SUM(sfragcov_r) FROM cosurffrags f WHERE f.cokey = c.cokey) AS sfcov FROM component c WHERE c.mukey IN (${ks})`, 'SSURGO components');
    for (const m of mus) have[m.mukey] = { name: m.muname, kind: m.mukind, area: m.areasymbol, comps: [] };
    for (const c of comps) have[c.mukey]?.comps.push({ name: c.compname, pct: +c.comppct_r || 0, kind: c.compkind, phase: c.localphase, order: c.taxorder, suborder: c.taxsuborder, drainage: c.drainagecl, sfcov: c.sfcov == null ? null : +(+c.sfcov).toFixed(2) });
    await sleep(300);
  }
  fs.writeFileSync(file, JSON.stringify(have));
  return have;
}

// OSM areas from the bake's cached extract: natural=beach/sand/bare_rock/rock/scree (closed ways and multipolygons).
const OSM_KIND = { beach: KIND.sand, sand: KIND.sand, bare_rock: KIND.rock, rock: KIND.rock, scree: KIND.boulders };
function osmPbfFile() {
  const key = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const f = path.join(CFG.cacheDir, 'osm', `minnesota-latest-${key}.cut.osm.pbf`);
  return fs.existsSync(f) ? f : null;
}
function extractOsm(file) {
  const isArea = (t) => !!t && OSM_KIND[t.natural] !== undefined;
  const rels = [];
  readPbf(file, { relation: (id, members, tags) => { if (isArea(tags) && tags.type === 'multipolygon') rels.push({ id, members, tags }); } });
  const memberWays = new Set();
  for (const r of rels) for (const m of r.members) if (m.type === 'way') memberWays.add(m.ref);
  const ways = new Map();
  readPbf(file, { way: (id, refs, tags) => { if (memberWays.has(id) || (isArea(tags) && refs.length >= 4 && refs[0] === refs[refs.length - 1])) ways.set(id, { refs, tags }); } });
  const need = new Set();
  for (const w of ways.values()) for (const r of w.refs) need.add(r);
  const coord = new Map();
  readPbf(file, { node: (id, lat, lon) => { if (need.has(id)) coord.set(id, [lon, lat]); } });
  const ringOf = (refs) => { const pts = refs.map((r) => coord.get(r)).filter(Boolean); return pts.length >= 4 ? flatRing(pts) : null; };
  const inBox = (rg) => { for (let k = 0; k < rg.length; k += 2) if (rg[k + 1] >= bbox.south && rg[k + 1] <= bbox.north && rg[k] >= bbox.west && rg[k] <= bbox.east) return true; return false; };
  const feats = [];
  for (const [id, w] of ways) {
    if (!isArea(w.tags)) continue;
    const r = ringOf(w.refs);
    if (r && inBox(r)) feats.push({ key: id % 4294967296, a: w.tags.natural, b: `way/${id}`, rings: [r] });
  }
  for (const rel of rels) {
    // stitch member ways into closed rings by shared end nodes
    const parts = rel.members.filter((m) => m.type === 'way' && ways.has(m.ref)).map((m) => ways.get(m.ref).refs.slice());
    const rings = [];
    while (parts.length) {
      let ring = parts.pop(), guard = 0;
      while (ring[0] !== ring[ring.length - 1] && guard++ < 10000) {
        const end = ring[ring.length - 1];
        const k = parts.findIndex((q) => q[0] === end || q[q.length - 1] === end);
        if (k < 0) break;
        const q = parts.splice(k, 1)[0];
        ring = ring.concat(q[0] === end ? q.slice(1) : q.reverse().slice(1));
      }
      const r = ringOf(ring);
      if (r) rings.push(r);
    }
    if (rings.length && rings.some(inBox)) feats.push({ key: rel.id % 4294967296, a: rel.tags.natural, b: `relation/${rel.id}`, rings });
  }
  return feats;
}

// ---------- classification ----------------------------------------------------------------------------

// NWI polygon -> kind, from its Cowardin code (attribute) and Minnesota plant community (spcc_desc).
export function nwiKind(attr, spcc) {
  const sys = attr[0], cls = /^[LPR]\d?([A-Z]{2})(\d?)/.exec(attr) || [];
  const c = cls[1], sub = cls[2];
  if (c === 'AB') return KIND.aquaticBed;
  if (c === 'EM' && (sys === 'L' || sys === 'R' || sub === '2' || spcc === 'Deep Marsh')) return KIND.emergent;
  if (spcc === 'Open Bog') return KIND.openBog;
  if (spcc === 'Coniferous Bog') return KIND.coniferBog;
  if (spcc === 'Shrub Wetland') return KIND.shrubSwamp;
  if (spcc === 'Hardwood Wetland') return KIND.hardwoodSwamp;
  if (spcc === 'Shallow Marsh') return KIND.marsh;
  if (spcc && spcc.startsWith('Seasonally Flooded')) return KIND.wetMeadow;
  if (c === 'EM') return KIND.marsh;
  if (c === 'FO') return KIND.coniferBog;
  if (c === 'SS') return KIND.shrubSwamp;
  if (c === 'RS') return KIND.rock;
  if (c === 'US') return /US2/.test(attr) ? KIND.sand : KIND.water;
  if (c === 'UB' || c === 'RB') return KIND.water;
  return 0;
}
const NWI_RANK = { [KIND.aquaticBed]: 9, [KIND.emergent]: 8, [KIND.openBog]: 7, [KIND.coniferBog]: 6, [KIND.shrubSwamp]: 5, [KIND.marsh]: 4, [KIND.wetMeadow]: 3, [KIND.hardwoodSwamp]: 2, [KIND.rock]: 1, [KIND.sand]: 1, [KIND.water]: 0 };
const isNwiWetland = (k) => k >= KIND.openBog && k <= KIND.hardwoodSwamp;
const isNwiInWater = (k) => k === KIND.emergent || k === KIND.aquaticBed;

// SSURGO map unit -> the numbers the cells carry.
export function mapunitFacts(mu) {
  let rock = 0, hist = 0, rubbly = 0, stone = 0, water = 0, total = 0;
  for (const c of mu.comps) {
    total += c.pct;
    if (c.name === 'Rock outcrop') { rock += c.pct; continue; }
    if (c.name === 'Water') { water += c.pct; continue; }
    if (c.order === 'Histosols') hist += c.pct;
    const ph = (c.phase || '').toLowerCase();
    if (ph.includes('rubbly')) rubbly += c.pct;
    let cov = c.sfcov;
    if (cov == null) { const m = PHASE_COVER.find(([w]) => ph.includes(w)); cov = m ? m[1] : 0; }
    stone += (c.pct / 100) * cov;
  }
  const isWater = water >= 50 || /^water$/i.test(mu.name || '');
  return { rock: Math.min(100, rock), hist: Math.min(100, hist), rubbly, stone, isWater, total };
}

// ---------- rasterisation (cell-centre rule, even-odd across a feature's rings, as bake.mjs does) ----------

export function rasterize(feature, env, cb) {
  const W = env.i1 - env.i0, H = env.j1 - env.j0;
  const rings = feature.rings.map((r) => {
    const out = new Float64Array(r.length);
    for (let k = 0; k < r.length; k += 2) {
      const [x, z] = proj.toLocal(r[k + 1], r[k]);
      out[k] = (x - grid.originX) / grid.cell - env.i0; // in block cell units
      out[k + 1] = (z - grid.originZ) / grid.cell - env.j0;
    }
    return out;
  });
  let zmin = Infinity, zmax = -Infinity;
  for (const r of rings) for (let k = 1; k < r.length; k += 2) { if (r[k] < zmin) zmin = r[k]; if (r[k] > zmax) zmax = r[k]; }
  const ja = Math.max(0, Math.ceil(zmin - 0.5)), jb = Math.min(H - 1, Math.floor(zmax - 0.5));
  const xs = [];
  for (let j = ja; j <= jb; j++) {
    const zc = j + 0.5;
    xs.length = 0;
    for (const r of rings) {
      const n = r.length / 2;
      for (let q = 0; q < n; q++) {
        const x1 = r[q * 2], z1 = r[q * 2 + 1], q2 = (q + 1) % n, x2 = r[q2 * 2], z2 = r[q2 * 2 + 1];
        if ((z1 <= zc) !== (z2 <= zc)) xs.push(x1 + ((zc - z1) * (x2 - x1)) / (z2 - z1));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const ia = Math.max(0, Math.ceil(xs[k] - 0.5)), ib = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let i = ia; i <= ib; i++) cb(j * W + i);
    }
  }
}

// ---------- main ---------------------------------------------------------------------------------

const CHANNELS = {
  kind: { type: 'u8', nodata: KIND.none },
  rock: { type: 'u8', nodata: 255 },
  stone: { type: 'u8', nodata: 255 },
  peat: { type: 'u8', nodata: 255 },
};

function readManifest() {
  try { return JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8')); } catch { return null; }
}

function writeManifest(tilesWritten, stats, fetched) {
  const old = readManifest();
  const tiles = new Set(old?.tiles || []);
  for (const [t, has] of tilesWritten) { if (has) tiles.add(t); else tiles.delete(t); }
  const m = {
    source: 'ground',
    stream: 'D1-ground (real-data round D1), scripts/sources/ground.mjs',
    generated: new Date().toISOString(),
    grid: {
      area: AREA, bbox, proj: { lat0: proj.lat0, lon0: proj.lon0, mPerDegLat: proj.mPerDegLat, mPerDegLon: proj.mPerDegLon, note: 'config.mjs makeProjection: x east, z south, metres from the bbox centre' },
      width: grid.width, height: grid.height, cell: grid.cell, originX: grid.originX, originZ: grid.originZ, tile: T, ntx: grid.ntx, nty: grid.nty,
    },
    layout: 'data-cache/ground/<tx>_<ty>.<channel>.bin: gzip of the tile core, 256 x 256 cells, no halo, row-major, row 0 = north edge (global cell i = tx*256 + col, j = ty*256 + row), one byte per cell. A tile not listed in `tiles` was not written: fill it with each channel\'s nodata.',
    compression: 'gzip',
    rasterisation: 'A cell takes a polygon when its centre is inside (even-odd across the polygon\'s rings), as bake.mjs rasterises lakes. Polygons are generalised to ~2 m on the server before that.',
    channels: {
      kind: { ...CHANNELS.kind, legend: Object.fromEntries(LEGEND.map(([v, name, color, desc]) => [v, { name, color, desc }])), precedence: PRECEDENCE },
      rock: { ...CHANNELS.rock, unit: '% of the SSURGO map unit that is the "Rock outcrop" component (0-100; in this box 0-35)', desc: 'How much of the ground here is bare bedrock, as a share: the map unit does not say where inside it the rock lies. Place it with LiDAR slope and roughness (D1-lidar) and the MGS D-02 mapped outcrops (D1-forest-rock).' },
      stone: { ...CHANNELS.stone, unit: 'byte = round(254 * sqrt(cover / 100)), cover = % of the ground surface covered by stones and boulders; decode cover % = 100 * (byte / 254)^2', desc: 'Expected surface stone and boulder cover of the map unit: the sum over its components of component % x surface fragment cover (SSURGO cosurffrags RV, or the phase class midpoint: bouldery/stony 0.05 %, very 1.5 %, extremely 9 %, rubbly 32 %, very rubbly 75 %). Bare rock is not counted.' },
      peat: { ...CHANNELS.peat, unit: '% of the SSURGO map unit that is Histosols (0-100)', desc: 'How much of the map unit is peat or muck soil, as a share, everywhere SSURGO maps (like rock and stone). Every Histosol component here is very poorly drained (Hemists, Saprists, Fibrists; no Folists), so it is wet ground. Masked to the NWI kinds (2-9, 13) it is MN DNR\'s Potentially Wet Histosols (NWI x soils). Off NWI it marks peat NWI did not map: mostly a 10-30 m fringe around NWI polygons (two surveys\' boundaries), and frequently flooded creek bottoms (Bowstring muck).' },
    },
    tiles: [...tiles].sort(),
    stats: stats ?? old?.stats ?? null, // from the last whole-box run; a --tiles run only logs its own
    fetched,
    citation: [
      'National Wetland Inventory for Minnesota, 2009-2014 update. MN DNR (with USFWS, Ducks Unlimited). gis.data.mn.gov item b02794b39e1e4125a3c89b059195f3dc; REST ' + NWI_URL + '. MN DNR General Geographic Data License: attribution, no warranty.',
      'Soil Survey Staff, NRCS, USDA. Soil Survey Geographic (SSURGO) Database via Soil Data Access (' + SDA_URL + '), survey areas MN031, MN075, MN613, MN617, MN621, MN627. Public domain.',
      'Potentially Wet Histosols in Minnesota, MN DNR (gis.data.mn.gov item 91ef630ab3794faaa850921f3eebe53f; ' + HIST_URL + '): NWI x gNATSGO; the peat channel inside NWI is the same product from current SSURGO, checked against it with --check.',
      'OpenStreetMap contributors, ODbL: natural=beach/sand/bare_rock/rock/scree areas from the bake\'s Geofabrik Minnesota extract.',
    ],
  };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(m, null, 1));
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  fs.mkdirSync(path.join(RAW, 'nwi'), { recursive: true });
  fs.mkdirSync(path.join(RAW, 'ssurgo'), { recursive: true });
  log(`grid ${grid.width} x ${grid.height}, ${grid.ntx} x ${grid.nty} tiles, blocks of ${BT}x${BT} tiles; ${guardDisk().toFixed(1)} GB free`);
  const tiles = selectTiles(opt.tiles);
  const blocks = new Map();
  for (const [tx, ty] of tiles) {
    const key = `${Math.floor(tx / BT)}_${Math.floor(ty / BT)}`;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push([tx, ty]);
  }
  log(`${tiles.length} tiles in ${blocks.size} blocks`);
  const fetchedFile = path.join(RAW, 'fetched.json');
  const fetched = fs.existsSync(fetchedFile) ? JSON.parse(fs.readFileSync(fetchedFile, 'utf8')) : { nwi: {}, ssurgo: {}, osm: null, mapunits: 0 };

  // 1. fetch: NWI and SSURGO per block, OSM once, then the map unit table
  if (opt.fetch) {
    let b = 0;
    for (const key of blocks.keys()) {
      b++;
      const [bx, by] = key.split('_').map(Number);
      const env = blockEnvelope(bx, by);
      for (const [src, fn] of [['nwi', fetchNwiBlock], ['ssurgo', fetchSsurgoBlock]]) {
        const file = path.join(RAW, src, `${key}.gpk.gz`);
        if (fs.existsSync(file) && !opt.refetch) continue;
        guardDisk();
        const t0 = Date.now();
        const feats = await fn(env);
        writePack(file, feats);
        fetched[src][key] = { features: feats.length, bytes: fs.statSync(file).size, at: new Date().toISOString() };
        fs.writeFileSync(fetchedFile, JSON.stringify(fetched, null, 1));
        log(`  block ${key} (${b}/${blocks.size}) ${src}: ${feats.length} polygons, ${(fs.statSync(file).size / 1e6).toFixed(2)} MB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        await sleep(300);
      }
    }
    const osmFile = path.join(RAW, 'osm.gpk.gz');
    if (!fs.existsSync(osmFile) || opt.refetch) {
      const pbf = osmPbfFile();
      if (pbf) {
        const feats = extractOsm(pbf);
        writePack(osmFile, feats);
        fetched.osm = { features: feats.length, from: path.basename(pbf), at: new Date().toISOString() };
        log(`  osm: ${feats.length} areas from ${path.basename(pbf)}`);
      } else log('  osm: no cached Minnesota extract (run the bake once); OSM areas skipped');
    }
    const mukeys = new Set();
    for (const f of fs.readdirSync(path.join(RAW, 'ssurgo'))) if (f.endsWith('.gpk.gz')) for (const ft of readPack(path.join(RAW, 'ssurgo', f))) mukeys.add(String(ft.key));
    const mus = await fetchMapunits([...mukeys], path.join(RAW, 'ssurgo-mapunits.json'));
    fetched.mapunits = Object.keys(mus).length;
    fs.writeFileSync(fetchedFile, JSON.stringify(fetched, null, 1));
    log(`  ${fetched.mapunits} map units described`);
  }

  // 2. rasterise per block and write the selected tiles
  if (opt.raster) {
    const mus = JSON.parse(fs.readFileSync(path.join(RAW, 'ssurgo-mapunits.json'), 'utf8'));
    const muList = [null], muIndex = new Map();
    for (const [k, mu] of Object.entries(mus)) { muIndex.set(k, muList.length); muList.push({ mukey: k, ...mu, facts: mapunitFacts(mu) }); }
    const osmFile = path.join(RAW, 'osm.gpk.gz');
    const osmFeats = fs.existsSync(osmFile) ? readPack(osmFile) : [];
    const stats = { cells: {}, osmAreas: {}, peatyUplandCells: 0, unknownNwi: {} };
    const written = [];
    let b = 0;
    for (const [key, btiles] of blocks) {
      b++;
      const [bx, by] = key.split('_').map(Number);
      const env = blockEnvelope(bx, by, 0);
      const W = env.i1 - env.i0, H = env.j1 - env.j0, N = W * H;
      const nwi = new Uint8Array(N), osm = new Uint8Array(N), mu = new Uint16Array(N);
      const nf = path.join(RAW, 'nwi', `${key}.gpk.gz`), sf = path.join(RAW, 'ssurgo', `${key}.gpk.gz`);
      if (!fs.existsSync(nf) || !fs.existsSync(sf)) { log(`  block ${key}: not fetched, skipped`); continue; }
      for (const f of readPack(sf)) { const m = muIndex.get(String(f.key)) || 0; if (m) rasterize(f, env, (c) => { mu[c] = m; }); }
      for (const f of readPack(nf)) {
        const k = nwiKind(f.a, f.b);
        if (!k) { stats.unknownNwi[`${f.a}|${f.b}`] = (stats.unknownNwi[`${f.a}|${f.b}`] || 0) + 1; continue; }
        const rk = NWI_RANK[k] + 1;
        rasterize(f, env, (c) => { if (!nwi[c] || NWI_RANK[nwi[c]] + 1 < rk) nwi[c] = k; });
      }
      const OSM_RANK = { [KIND.sand]: 3, [KIND.rock]: 2, [KIND.boulders]: 1 };
      for (const f of osmFeats) { const k = OSM_KIND[f.a]; rasterize(f, env, (c) => { if (!osm[c] || OSM_RANK[osm[c]] < OSM_RANK[k]) osm[c] = k; }); }

      const kind = new Uint8Array(N), rock = new Uint8Array(N), stone = new Uint8Array(N), peat = new Uint8Array(N);
      for (let c = 0; c < N; c++) {
        const n = nwi[c], o = osm[c], m = mu[c] ? muList[mu[c]].facts : null;
        let k;
        if (isNwiInWater(n)) k = n;
        else if (o) k = o;
        else if (isNwiWetland(n)) k = n;
        else if (n) k = n;
        else if (m) k = m.isWater ? KIND.water : m.rubbly >= 50 ? KIND.boulders : KIND.upland;
        else k = KIND.none;
        kind[c] = k;
        rock[c] = m ? Math.round(m.rock) : 255;
        stone[c] = m ? encStone(m.stone) : 255;
        peat[c] = m ? Math.round(m.hist) : 255;
        if (m && !n && !m.isWater && m.hist >= 50) stats.peatyUplandCells++;
      }
      for (const [tx, ty] of btiles) {
        const li0 = tx * T - env.i0, lj0 = ty * T - env.j0;
        const bufs = {}, out = { kind, rock, stone, peat };
        let any = false;
        for (const ch of Object.keys(CHANNELS)) bufs[ch] = Buffer.alloc(T * T);
        for (let r = 0; r < T; r++) for (let q = 0; q < T; q++) {
          const c = (lj0 + r) * W + li0 + q, o = r * T + q;
          for (const ch of Object.keys(CHANNELS)) bufs[ch][o] = out[ch][c];
          const kv = kind[c];
          if (kv) { any = true; stats.cells[kv] = (stats.cells[kv] || 0) + 1; }
          if (osm[c]) stats.osmAreas[osm[c]] = (stats.osmAreas[osm[c]] || 0) + 1;
        }
        for (const ch of Object.keys(CHANNELS)) {
          const file = path.join(OUT, `${tx}_${ty}.${ch}.bin`);
          if (any) fs.writeFileSync(file, zlib.gzipSync(bufs[ch], { level: 9 }));
          else if (fs.existsSync(file)) fs.unlinkSync(file);
        }
        written.push([`${tx}_${ty}`, any]);
      }
      if (b % 10 === 0 || b === blocks.size) log(`  rasterised ${b}/${blocks.size} blocks`);
    }
    // stats merge: a full run replaces, a partial one reports only its tiles
    const legendName = Object.fromEntries(LEGEND.map(([v, name]) => [v, name]));
    const named = (o) => Object.fromEntries(Object.entries(o).sort((a, c) => c[1] - a[1]).map(([k, v]) => [legendName[k] || k, +(v * 1e-4).toFixed(1)]));
    const runStats = {
      tiles: opt.tiles || 'all',
      km2ByKind: named(stats.cells),
      osmKm2: named(stats.osmAreas),
      peatyUplandKm2: +(stats.peatyUplandCells * 1e-4).toFixed(1),
      unknownNwi: stats.unknownNwi,
    };
    writeManifest(written, opt.tiles ? null : runStats, fetched);
    log('km2 by kind', JSON.stringify(runStats.km2ByKind));
    log('osm km2', JSON.stringify(runStats.osmKm2), 'peaty upland (histosol >= 50 % with no NWI) km2', runStats.peatyUplandKm2);
    if (Object.keys(stats.unknownNwi).length) log('unclassified NWI', JSON.stringify(stats.unknownNwi));
  }

  if (opt.check) await checkHistosols(blocks);
  if (opt.png) await quickLooks();
}

// ---------- --check: the peat channel against MN DNR's own Potentially Wet Histosols ---------------------

async function checkHistosols(blocks) {
  // rasterise the DNR's polygons (NWI x gNATSGO, each with its histosol_percent) on the same grid; compare cell by cell
  let n = 0, eq = 0, near = 0, mineOff = 0;
  const pairs = new Map();
  for (const [key, btiles] of blocks) {
    const [bx, by] = key.split('_').map(Number);
    const env = blockEnvelope(bx, by, 0), W = env.i1 - env.i0, H = env.j1 - env.j0;
    const feats = await fetchArcgisBlock(HIST_URL, '1=1', 'objectid,histosol_percent', blockEnvelope(bx, by), (a) => ({ key: a.objectid, a: String(a.histosol_percent ?? ''), b: '' }));
    const dnr = new Uint8Array(W * H).fill(255);
    for (const f of feats) { const v = +f.a; if (f.a !== '' && v >= 0 && v <= 100) rasterize(f, env, (c) => { dnr[c] = v; }); }
    for (const [tx, ty] of btiles) {
      const file = path.join(OUT, `${tx}_${ty}.peat.bin`);
      if (!fs.existsSync(file)) continue;
      const peat = zlib.gunzipSync(fs.readFileSync(file));
      for (let r = 0; r < T; r++) for (let q = 0; q < T; q++) {
        const d = dnr[(ty * T - env.j0 + r) * W + tx * T - env.i0 + q], m = peat[r * T + q];
        if (d === 255 || m === 255) continue;
        n++;
        if (d === m) eq++;
        if (Math.abs(d - m) <= 10) near++;
        else if (m === 0) mineOff++;
        else { const k = `${d}->${m}`; pairs.set(k, (pairs.get(k) || 0) + 1); }
      }
    }
    log(`  check block ${key}: ${feats.length} DNR polygons`);
    await sleep(300);
  }
  const top = [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${(v * 1e-4).toFixed(2)} km2`);
  const pc = (v) => ((100 * v) / Math.max(1, n)).toFixed(1) + ' %';
  const msg = `${(n * 1e-4).toFixed(1)} km2 where DNR and peat both have a value: equal ${pc(eq)}, within 10 points ${pc(near)}, peat 0 where DNR has some (SSURGO water or mineral soil there now) ${pc(mineOff)}; other DNR->peat pairs: ${top.join(', ')}`;
  log('check: ' + msg);
  return msg;
}


// ---------- quick-look PNGs (shots/ground-*.png) ------------------------------------------------------

async function quickLooks() {
  const { PNG } = await import('pngjs');
  const man = readManifest();
  if (!man) { log('no manifest: nothing to draw'); return; }
  const have = new Set(man.tiles);
  fs.mkdirSync('shots', { recursive: true });
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const kindRGB = Object.fromEntries(LEGEND.map(([v, , c]) => [v, hex(c)]));
  // the bake's lakes under the map, so the beds read against the shore (public/data from the live bake, if present)
  let bakeIdx = null;
  try { bakeIdx = JSON.parse(fs.readFileSync(path.join(CFG.outDir, 'index.json'), 'utf8')); } catch {}
  const bakeOk = bakeIdx && bakeIdx.grid.width === grid.width && bakeIdx.grid.originX === grid.originX && bakeIdx.grid.originZ === grid.originZ;
  const lakeCache = new Map();
  const lakeTile = (tx, ty) => {
    const key = `${tx}_${ty}`;
    if (!lakeCache.has(key)) {
      let v = null;
      if (bakeOk) {
        try {
          const buf = zlib.gunzipSync(fs.readFileSync(path.join(CFG.outDir, 'tiles', `${key}.bin`)));
          const S = T + 2 * bakeIdx.grid.halo;
          v = new Uint16Array(buf.buffer.slice(buf.byteOffset + S * S * 2, buf.byteOffset + S * S * 4));
          v.side = S; v.halo = bakeIdx.grid.halo;
        } catch {}
      }
      lakeCache.set(key, v);
    }
    return lakeCache.get(key);
  };
  const chCache = new Map();
  const chTile = (ch, tx, ty) => {
    const key = `${tx}_${ty}.${ch}`;
    if (!chCache.has(key)) chCache.set(key, have.has(`${tx}_${ty}`) ? zlib.gunzipSync(fs.readFileSync(path.join(OUT, `${key}.bin`))) : null);
    return chCache.get(key);
  };
  const cellOf = (ch, i, j) => {
    const tx = Math.floor(i / T), ty = Math.floor(j / T), t = chTile(ch, tx, ty);
    return t ? t[(j - ty * T) * T + (i - tx * T)] : CHANNELS[ch].nodata;
  };
  const lakeAt = (i, j) => {
    const tx = Math.floor(i / T), ty = Math.floor(j / T), t = lakeTile(tx, ty);
    return t ? t[(j - ty * T + t.halo) * t.side + (i - tx * T + t.halo)] : 0;
  };
  const WATER = [168, 196, 222], NODATA = [222, 226, 230];
  const ramp = (v, lo, hi, a, bcol) => { const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo))); return a.map((x, k) => Math.round(x + (bcol[k] - x) * t)); };
  const paint = {
    kind: (v, lake) => (lake && (v === KIND.none || v === KIND.upland || v === KIND.water) ? WATER : kindRGB[v] || [255, 0, 255]),
    rock: (v, lake) => (lake ? WATER : v === 255 ? NODATA : ramp(v, 0, 35, [240, 236, 226], [70, 64, 72])),
    stone: (v, lake) => (lake ? WATER : v === 255 ? NODATA : ramp(v, 0, 140, [240, 236, 226], [96, 40, 140])),
    peat: (v, lake) => (lake ? WATER : v === 255 ? NODATA : ramp(v, 0, 100, [240, 236, 226], [92, 58, 22])),
  };
  const views = [];
  {
    const b = AREAS.lakeone;
    const [xw, zn] = proj.toLocal(b.north, b.west), [xe, zs] = proj.toLocal(b.south, b.east);
    views.push({ name: 'lakeone', i0: grid.ci(xw), j0: grid.cj(zn), w: grid.ci(xe) - grid.ci(xw), h: grid.cj(zs) - grid.cj(zn), step: 1 });
  }
  views.push({ name: 'bwca', i0: 0, j0: 0, w: grid.width, h: grid.height, step: 8 });
  const files = [];
  for (const v of views) {
    const W = Math.floor(v.w / v.step), H = Math.floor(v.h / v.step);
    for (const ch of Object.keys(CHANNELS)) {
      const png = new PNG({ width: W, height: H });
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let val, lake;
        if (v.step === 1) { val = cellOf(ch, v.i0 + x, v.j0 + y); lake = lakeAt(v.i0 + x, v.j0 + y); }
        else {
          // a block's commonest value, with the rare placed kinds (beds, rock, boulders, sand) counted 4x so they show
          const cnt = new Map();
          let lakes = 0;
          for (let dy = 0; dy < v.step; dy += 2) for (let dx = 0; dx < v.step; dx += 2) {
            const i = v.i0 + x * v.step + dx, j = v.j0 + y * v.step + dy;
            const c = cellOf(ch, i, j), lk = lakeAt(i, j) ? 1 : 0;
            lakes += lk;
            const wgt = ch === 'kind' && c >= KIND.emergent && c <= KIND.sand ? 4 : 1;
            if (!lk || (ch === 'kind' && (c === KIND.emergent || c === KIND.aquaticBed))) cnt.set(c, (cnt.get(c) || 0) + wgt);
          }
          let best = CHANNELS[ch].nodata, bn = -1;
          for (const [c, n] of cnt) if (n > bn) { bn = n; best = c; }
          val = best; lake = lakes > (v.step * v.step) / 8 && !(ch === 'kind' && (best === KIND.emergent || best === KIND.aquaticBed));
        }
        const [r, g, bl] = paint[ch](val, lake);
        const o = (y * W + x) * 4;
        png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = bl; png.data[o + 3] = 255;
      }
      const file = path.join('shots', `ground-${v.name}-${ch}.png`);
      fs.writeFileSync(file, PNG.sync.write(png));
      files.push(path.resolve(file));
    }
  }
  // a legend strip for the kind maps: one swatch per kind, in legend order
  const sw = 40, lg = new PNG({ width: sw * LEGEND.length, height: sw });
  LEGEND.forEach(([, , c], k) => { const [r, g, b2] = hex(c); for (let y = 0; y < sw; y++) for (let x = 2; x < sw - 2; x++) { const o = (y * lg.width + k * sw + x) * 4; lg.data[o] = r; lg.data[o + 1] = g; lg.data[o + 2] = b2; lg.data[o + 3] = 255; } });
  fs.writeFileSync(path.join('shots', 'ground-legend.png'), PNG.sync.write(lg));
  files.push(path.resolve('shots/ground-legend.png'));
  log('quick-looks:', bakeOk ? '(lakes from the live bake)' : '(no matching bake: no lakes drawn)');
  for (const f of files) log('  ' + f);
}

// run when invoked directly; importing this module (round D2, checks) only gets the helpers above
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((err) => { console.error(err); process.exit(1); });
