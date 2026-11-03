#!/usr/bin/env node
// Source stream "nhd-hr" (2026-11-03, the owner on Cummings Lake: "NHD+ seems better"): the lake and pond outlines of
// USGS NHDPlus High Resolution (NHDWaterbody), islands as holes. Fetches only; the bake reads the product
// (scripts/nhd-lakes.mjs swaps a lake's OpenStreetMap outline for NHDPlus HR's where the two are the same water).
//
//   data-cache/nhd-hr/waterbodies.json
//     { fetched, source, box, bodies: [{ id (permanent identifier), nhdplusid, fcode, name, km2, rings: [[[lat, lon], ...], ...] }] }
//     fcode 39000 lake/pond · 39004 perennial · 39001 intermittent · 39009–39012 perennial by stage · 436xx reservoir
//     rings: every ring of the polygon as the service gives it (outer rings and island holes); the bake fills them
//     even-odd, so which is which does not matter
//
// Usage: node scripts/sources/nhd-hr.mjs [--refresh]
import fs from 'node:fs';
import path from 'node:path';
import { CFG, AREAS, log, sleep } from '../config.mjs';

const SVC = 'https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/9';
const OUT = path.join(CFG.cacheDir, 'nhd-hr');
const refresh = process.argv.includes('--refresh');
// the bwca box with a margin wider than the bake grid's padding (the grid box is about 0.02° past the area)
const b = AREAS.bwca, M = 0.05;
const BOX = [b.west - M, b.south - M, b.east + M, b.north + M];
const r6 = (v) => Math.round(v * 1e6) / 1e6; // ~0.1 m

async function page(offset) {
  const q = new URLSearchParams({
    where: '1=1', geometry: BOX.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'objectid,permanent_identifier,nhdplusid,fcode,gnis_name,areasqkm',
    orderByFields: 'objectid', resultOffset: String(offset), resultRecordCount: '500', geometryPrecision: '6', f: 'json',
  });
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${SVC}/query`, { method: 'POST', body: q, headers: { 'user-agent': CFG.ua, 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(300000) });
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
      return j;
    } catch (e) { if (attempt >= 6) throw e; log(`  retry ${attempt}: ${e.message.slice(0, 120)}`); await sleep(attempt * 5000); }
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'waterbodies.json');
  if (!refresh && fs.existsSync(file)) { log(`nhd-hr: ${file} exists (--refresh to fetch again)`); return; }
  const bodies = [];
  for (let offset = 0; ;) {
    const j = await page(offset);
    const feats = j.features || [];
    for (const f of feats) {
      const a = f.attributes, rings = (f.geometry?.rings || []).map((rg) => rg.map(([lon, lat]) => [r6(lat), r6(lon)])).filter((rg) => rg.length >= 4);
      if (!rings.length) continue;
      bodies.push({ id: a.permanent_identifier, nhdplusid: a.nhdplusid, fcode: a.fcode, name: a.gnis_name || null, km2: a.areasqkm, rings });
    }
    offset += feats.length;
    log(`nhd-hr: ${offset} waterbodies`);
    if (!feats.length || !j.exceededTransferLimit) break;
    await sleep(300);
  }
  const by = {}; for (const w of bodies) by[w.fcode] = (by[w.fcode] || 0) + 1;
  fs.writeFileSync(file, JSON.stringify({ fetched: new Date().toISOString(), source: `${SVC} (USGS NHDPlus High Resolution, NHDWaterbody; public domain)`, box: BOX, bodies }));
  log(`nhd-hr: ${bodies.length} waterbodies, ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`, JSON.stringify(by));
}
main().catch((e) => { console.error(e); process.exit(1); });
