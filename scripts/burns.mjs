#!/usr/bin/env node
// Real burns (the owner, 2026-10-26: "we should be using real data for burns"): every fire, prescribed burn and the 1999
// blowdown the agencies have mapped inside the game's box, written as a small runtime table, src/burns.bin, that the
// tile worker and the main thread read (src/burns.js). It replaces the fbm noise fields.js burnAt was.
//
// Sources (all public domain or the DNR's GIS licence; every one queried live over REST in the game's box,
// scripts/config.mjs AREAS.bwca):
//   - USFS Enterprise Data Warehouse, Final Fire Perimeter (All Years), EDW_FireOccurrenceAndPerimeter_01 MapServer/10:
//     the wildfires 1923-2021 (Pagami Creek, Ham Lake, Cavity Lake, Little Indian Sioux, Brule Lake ...).
//   - NIFC WFIGS Interagency Perimeters (FeatureServer/0): the fires from 2020 on, the July 2026 fires among them (Bear
//     Trap, Thumb, Wolfpack, Sioux, Camp, Little Knife), each its latest perimeter with its discovery date.
//   - USFS FACTS Hazardous Fuels Treatments, fire (EDW_HazardousFuelsTreatments_01 MapServer/3): the prescribed burns,
//     broadcast burns and underburns only (no pile burns, no "planned treatment burned in wildfire").
//   - MN DNR Most Recent Fast Forest Disturbances v4 (env_fast_forest_disturbances FeatureServer/0), agent 6 (wind),
//     1999-2001: the 4 July 1999 blowdown, as kind "blowdown".
// Kept per event: kind, name, year and start day only. Never a cause, an origin point or any investigation detail
// (docs/data-sources.md, "Not used, ever").
//
//   node scripts/burns.mjs [--refresh] [--cache data-cache/burns] [--data public/data] [--out src/burns.bin]
//        [--tol 20] [--report file.json]
//
// --refresh queries the services again (else the cached answers in data-cache/burns are used, and fetched if missing).
//
// What is done to them:
//   - projected to the game's metres (index.json proj: x east, z south) and simplified (Douglas-Peucker) to --tol m (the
//     blowdown, traced from 30 m Landsat pixels, to 30 m), rings that fall under a tenth of a hectare dropped;
//   - the same fire in EDW and WFIGS kept once (EDW's final perimeter); duplicate FACTS polygons (one unit entered under
//     two activities) kept once; the blowdown's 1999-2001 detections are one event, 4 July 1999;
//   - land: the table keeps the perimeters whole (a hole for every lake inside Pagami Creek would double it) and the
//     game clips them to land where it reads them, by its own shore distance (burns.js: water is never burned). An event
//     with no land at all on the 80 m far grid is dropped here.
//
// The table (little-endian, gzipped as a whole):
//   u32 magic 'BRN1', u16 version 1, u16 records, u32 names bytes, u32 source bytes, f64 built (ms since 1970)
//   the sources (utf-8), the names (utf-8, one per line; a record's name index counts from 1, 0 = none)
//   per record: u8 kind (1 wildfire, 2 prescribed, 3 blowdown), u8 flags (1: the start day is a guess), u16 year,
//   u16 start day of the year, u16 name, u32 acres (as the agency gives them), u32 rings; per ring a varint point count,
//   then the points as zigzag varints in whole metres, the first absolute, the rest the step from the one before.
// The spatial index (a coarse grid of cells, each with the events and the perimeter edges that touch it) is built from
// this when it loads (burns.js), so the file holds only the shapes.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { AREAS } from './config.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const cacheDir = arg('--cache', 'data-cache/burns');
const dataDir = arg('--data', 'public/data').replace(/\/?$/, '/');
const outFile = arg('--out', 'src/burns.bin');
const TOL = Number(arg('--tol', 20)), TOL_WIND = Math.max(TOL, 30);
const reportFile = arg('--report', null);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const BOX = AREAS.bwca;
const ENVELOPE = `${BOX.west},${BOX.south},${BOX.east},${BOX.north}`;
const SOURCES = {
  edw: { url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_FireOccurrenceAndPerimeter_01/MapServer/10/query', fields: 'objectid,firename,fireyear,discoverydatetime,gisacres,totalacres,featurecat' },
  wfigs: { url: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query', fields: 'OBJECTID,poly_IncidentName,attr_IncidentName,poly_FeatureCategory,poly_GISAcres,poly_PolygonDateTime,attr_FireDiscoveryDateTime,attr_IncidentTypeCategory,attr_UniqueFireIdentifier' },
  facts: { url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_HazardousFuelsTreatments_01/MapServer/3/query', fields: 'objectid,activity,treatment_type,activity_unit_name,date_completed,fiscal_year_completed,gis_acres' },
  wind: { url: 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_dnr/env_fast_forest_disturbances/FeatureServer/0/query', fields: 'objectid,year,agent,Shape__Area', where: 'agent=6 AND year>=1999 AND year<=2001' },
};
const CITE = 'USFS EDW Final Fire Perimeter (All Years); NIFC WFIGS Interagency Perimeters; USFS FACTS Hazardous Fuels Treatments (fire: broadcast burns and underburns); MN DNR Most Recent Fast Forest Disturbances v4 (wind, 1999-2001). Public domain / MN DNR GIS licence.';

// --- fetching (cached) -----------------------------------------------------------------------------------------------
async function query(name) {
  const S = SOURCES[name], file = path.join(cacheDir, `${name}.geojson`);
  if (!has('--refresh') && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).features;
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const q = new URLSearchParams({
      where: S.where || '1=1', geometry: ENVELOPE, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: S.fields, outSR: '4326', resultOffset: String(offset), resultRecordCount: '1000', orderByFields: S.fields.split(',')[0], f: 'geojson',
    });
    const res = await fetch(`${S.url}?${q}`);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(`${name}: ${JSON.stringify(j.error)}`);
    const fs1 = j.features || [];
    out.push(...fs1);
    log(`${name}: ${out.length}`);
    if (fs1.length < 1000 && !(j.properties && j.properties.exceededTransferLimit) && !j.exceededTransferLimit) break;
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', fetched: new Date().toISOString(), features: out }));
  return out;
}

// --- the game's metres -------------------------------------------------------------------------------------------------
const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const P = index.proj, G = index.grid;
const toXZ = ([lon, lat]) => [(lon - P.lon0) * P.mPerDegLon, -(lat - P.lat0) * P.mPerDegLat];
const ringsOf = (geom) => {
  if (!geom) return [];
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys.flat().map((r) => r.map(toXZ));
};
const area = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2; };
// Douglas-Peucker on a closed ring (its first point kept, the closing duplicate dropped)
function simplify(ring, tol) {
  let pts = ring.slice();
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  if (pts.length < 4) return pts;
  // split at the point furthest from the first, so the two halves are open polylines
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
        let d;
        if (L2 === 0) d = (x - x0) ** 2 + (z - z0) ** 2;
        else { const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2)); d = (x - x0 - t * dx) ** 2 + (z - z0 - t * dz) ** 2; }
        if (d > bd) { bd = d; best = i; }
      }
      if (best > 0) { keep[best] = 1; stack.push([i0, best], [best, i1]); }
    }
    return a.filter((_, i) => keep[i]);
  };
  const A = dp(pts.slice(0, far + 1)), B = dp([...pts.slice(far), pts[0]]);
  return [...A, ...B.slice(1, -1)];
}
const titleCase = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const doyOf = (ms) => { const d = new Date(ms); return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000); };
const yearOf = (ms) => new Date(ms).getUTCFullYear();

// --- the events --------------------------------------------------------------------------------------------------------
const KIND = { wildfire: 1, prescribed: 2, blowdown: 3 };
const events = [];
const edw = await query('edw');
for (const f of edw) {
  const p = f.properties, rings = ringsOf(f.geometry);
  if (!rings.length || !p.fireyear) continue;
  const known = Number.isFinite(p.discoverydatetime) && yearOf(p.discoverydatetime) === p.fireyear;
  events.push({ kind: 'wildfire', src: 'edw', name: p.firename ? titleCase(p.firename) : null, year: p.fireyear, doy: known ? doyOf(p.discoverydatetime) : 200, guess: !known, acres: p.gisacres || p.totalacres || 0, rings });
}
const wfigs = await query('wfigs');
const edwKey = new Set(events.map((e) => `${e.year}:${(e.name || '').toLowerCase()}`));
for (const f of wfigs) {
  const p = f.properties, rings = ringsOf(f.geometry);
  if (!rings.length || p.attr_IncidentTypeCategory !== 'WF' || !Number.isFinite(p.attr_FireDiscoveryDateTime)) continue;
  const year = yearOf(p.attr_FireDiscoveryDateTime), name = titleCase(p.poly_IncidentName || p.attr_IncidentName || '');
  if (edwKey.has(`${year}:${name.toLowerCase()}`)) continue; // EDW holds its final perimeter
  if ((p.poly_GISAcres || 0) < 1) continue;                  // a spot fire a few metres across
  events.push({ kind: 'wildfire', src: 'wfigs', name: name || null, year, doy: doyOf(p.attr_FireDiscoveryDateTime), guess: false, acres: p.poly_GISAcres || 0, rings });
}
const facts = await query('facts');
const seenRx = new Set();
for (const f of facts) {
  const p = f.properties, rings = ringsOf(f.geometry);
  if (!rings.length || p.treatment_type !== 'Broadcast Burn' || !Number.isFinite(p.date_completed)) continue;
  const key = `${p.activity_unit_name}:${p.date_completed}:${Math.round(p.gis_acres || 0)}`;
  if (seenRx.has(key)) continue; // the same unit entered under two activities
  seenRx.add(key);
  // a unit's name when it is a place ("Acorn Lake", "Swamp River"), none for the rest ("1007 N OAKBB", "Fenske Cg Fuels")
  let name = (p.activity_unit_name || '').replace(/\b(PRESCRIBED BURN|PRESCRIBED|RX BURN|RX|BURN|UNITS?|UNDERBURN)\b/gi, '').trim();
  name = /^[a-z ]+ (lake|creek|river)$/i.test(name) ? titleCase(name) : null;
  events.push({ kind: 'prescribed', src: 'facts', name, year: yearOf(p.date_completed), doy: doyOf(p.date_completed), guess: false, acres: p.gis_acres || 0, rings });
}
const wind = await query('wind');
const blow = { kind: 'blowdown', src: 'dnr', name: 'Blowdown', year: 1999, doy: 185, guess: false, acres: 0, rings: [] }; // 4 July 1999
for (const f of wind) { blow.rings.push(...ringsOf(f.geometry)); blow.acres += (f.properties.Shape__Area || 0) / 4046.86; }
if (blow.rings.length) events.push(blow);
log(`events: ${events.length} (edw ${edw.length}, wfigs ${wfigs.length}, facts ${facts.length}, wind polygons ${wind.length})`);

// --- simplify --------------------------------------------------------------------------------------------------------
let vin = 0, vout = 0;
for (const e of events) {
  const tol = e.kind === 'blowdown' ? TOL_WIND : TOL;
  const out = [];
  for (const r of e.rings) {
    vin += r.length;
    const s = simplify(r, tol).map(([x, z]) => [Math.round(x), Math.round(z)]);
    const d = s.filter((p, i) => i === 0 || p[0] !== s[i - 1][0] || p[1] !== s[i - 1][1]);
    if (d.length >= 3 && Math.abs(area(d)) >= 1000) { out.push(d); vout += d.length; } // a tenth of a hectare
  }
  e.rings = out;
}
log(`simplified ${vin} -> ${vout} points`);

// --- land: an event that lies wholly on the water is dropped (the game clips the rest itself) ---------------------------
const F = G.far, FS = F.tile + 2 * F.halo, fcell = G.cell * F.factor;
const landAt = (() => {
  const tiles = new Map();
  for (let fy = 0; fy < F.nty; fy++) for (let fx = 0; fx < F.ntx; fx++) {
    const file = `${dataDir}far/${fx}_${fy}.bin`;
    if (!fs.existsSync(file)) continue;
    const raw = zlib.gunzipSync(fs.readFileSync(file)), buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    tiles.set(`${fx},${fy}`, new Int16Array(buf, FS * FS * 4, FS * FS));
  }
  return (x, z) => {
    const i = Math.floor((x - G.originX) / fcell), j = Math.floor((z - G.originZ) / fcell);
    const fx = Math.floor(i / F.tile), fy = Math.floor(j / F.tile), sd = tiles.get(`${fx},${fy}`);
    if (!sd) return false;
    return sd[(j - fy * F.tile + F.halo) * FS + (i - fx * F.tile + F.halo)] > 0;
  };
})();
// the 80 m cells whose centre an event covers (even-odd over its rings), and how many of them are land
function landShare(e) {
  let n = 0, land = 0;
  let z0 = Infinity, z1 = -Infinity;
  for (const r of e.rings) for (const [, z] of r) { if (z < z0) z0 = z; if (z > z1) z1 = z; }
  for (let j = Math.ceil((z0 - G.originZ) / fcell - 0.5); G.originZ + (j + 0.5) * fcell <= z1; j++) {
    const z = G.originZ + (j + 0.5) * fcell, xs = [];
    for (const r of e.rings) for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
      const [xa, za] = r[a], [xb, zb] = r[b];
      if ((za > z) !== (zb > z)) xs.push(xa + ((z - za) / (zb - za)) * (xb - xa));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.ceil((xs[k] - G.originX) / fcell - 0.5); G.originX + (i + 0.5) * fcell < xs[k + 1]; i++) {
      n++; if (landAt(G.originX + (i + 0.5) * fcell, z)) land++;
    }
  }
  return { n, land };
}
const kept = [];
for (const e of events) {
  if (!e.rings.length) continue;
  const s = landShare(e);
  e.cells = s.n; e.landCells = s.land;
  if (s.n >= 2 && s.land === 0) { log(`dropped (all water): ${e.year} ${e.name}`); continue; }
  kept.push(e);
}
kept.sort((a, b) => a.year - b.year || a.doy - b.doy);

// --- write -----------------------------------------------------------------------------------------------------------
const names = [...new Set(kept.map((e) => e.name).filter(Boolean))];
const nameIx = new Map(names.map((n, i) => [n, i + 1]));
const bytes = [];
const u8 = (v) => bytes.push(v & 255);
const u16 = (v) => { u8(v); u8(v >> 8); };
const u32 = (v) => { u16(v & 0xffff); u16((v >>> 16) & 0xffff); };
const varint = (v) => { while (v > 127) { u8((v & 127) | 128); v = Math.floor(v / 128); } u8(v); };
const zig = (v) => varint(v >= 0 ? v * 2 : -v * 2 - 1);
const srcBytes = Buffer.from(CITE, 'utf8'), nameBytes = Buffer.from(names.join('\n'), 'utf8');
u32(0x314e5242); u16(1); u16(kept.length); u32(nameBytes.length); u32(srcBytes.length);
const f64 = Buffer.alloc(8); f64.writeDoubleLE(Date.now()); for (const b of f64) u8(b);
for (const b of srcBytes) u8(b);
for (const b of nameBytes) u8(b);
for (const e of kept) {
  u8(KIND[e.kind]); u8(e.guess ? 1 : 0); u16(e.year); u16(e.doy); u16(e.name ? nameIx.get(e.name) : 0); u32(Math.round(e.acres)); u32(e.rings.length);
  for (const r of e.rings) {
    varint(r.length);
    let px = 0, pz = 0;
    for (const [x, z] of r) { zig(x - px); zig(z - pz); px = x; pz = z; }
  }
}
const raw = Buffer.from(bytes), gz = zlib.gzipSync(raw, { level: 9 });
fs.writeFileSync(outFile, gz);
log(`wrote ${outFile}: ${kept.length} events, ${vout} points, ${raw.length} bytes raw, ${gz.length} gzipped`);

const byKind = {};
for (const e of kept) { const k = byKind[e.kind] || (byKind[e.kind] = { n: 0, acres: 0 }); k.n++; k.acres += e.acres; }
for (const [k, v] of Object.entries(byKind)) log(`  ${k}: ${v.n} events, ${Math.round(v.acres)} acres`);
const big = kept.filter((e) => e.kind !== 'blowdown').sort((a, b) => b.acres - a.acres).slice(0, 16);
for (const e of big) log(`  ${e.year} ${e.name || '(unnamed)'} ${e.kind} ${Math.round(e.acres)} ac, day ${e.doy}${e.guess ? '?' : ''}, land ${e.landCells}/${e.cells} cells`);
if (reportFile) fs.writeFileSync(reportFile, JSON.stringify({ bytes: gz.length, raw: raw.length, points: vout, byKind, events: kept.map((e) => ({ kind: e.kind, name: e.name, year: e.year, doy: e.doy, guess: e.guess, acres: Math.round(e.acres), rings: e.rings.length, points: e.rings.reduce((s, r) => s + r.length, 0), cells: e.cells, land: e.landCells })) }, null, 1));
