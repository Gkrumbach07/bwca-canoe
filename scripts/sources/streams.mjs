#!/usr/bin/env node
// Source stream "streams" (wetlands, 2026-10-31; docs/wetland-data.md): the NHD's stream lines with their flow, so the
// bake can tell a river from a marsh channel from a brook. Fetches only; bake.mjs reads the product.
//
//   data-cache/streams/nhd-flowlines.json  { fetched, source, lines: [{ id, fcode, name, pts: [[lat, lon], ...] }] }
//     fcode 46006 stream/river, perennial · 46003 intermittent · 46007 ephemeral · 55800 artificial path (the line
//     through a lake or a wetland) · 33400 connector · 33600 canal/ditch · 56600 coastline (none here)
//   data-cache/streams/nhd-waterbodies.json  the NHD's own waterbody kinds, as points: { lines: [{ id, fcode, name, pts:
//     [[lat, lon]] }] }: 39004 perennial lake, 39001 intermittent lake, 46600 swamp/marsh, 43600 reservoir
//
// Usage: node scripts/sources/streams.mjs [--refresh]
import fs from 'node:fs';
import path from 'node:path';
import { CFG, AREAS, log, sleep } from '../config.mjs';

const NHD = 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_pca/water_national_hydrography_data/FeatureServer';
const OUT = path.join(CFG.cacheDir, 'streams');
const refresh = process.argv.includes('--refresh');
const b = AREAS.bwca, BOX = `${b.west},${b.south},${b.east},${b.north}`;

async function query(layer, where, fields, extra = {}) {
  const out = [];
  for (let offset = 0; ;) {
    const q = new URLSearchParams({
      where, geometry: BOX, geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: fields, orderByFields: 'objectid', resultOffset: String(offset), resultRecordCount: '1000', f: 'json', ...extra,
    });
    let j;
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`${NHD}/${layer}/query`, { method: 'POST', body: q, headers: { 'user-agent': CFG.ua, 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(180000) });
        j = await res.json();
        if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
        break;
      } catch (e) { if (attempt >= 5) throw e; log(`  retry ${attempt}: ${e.message.slice(0, 100)}`); await sleep(attempt * 4000); }
    }
    const got = (j.features || []).length;
    for (const f of j.features || []) out.push(f);
    offset += got;
    if (!got || !j.exceededTransferLimit) break;
    await sleep(300);
  }
  return out;
}
const r5 = (v) => Math.round(v * 1e5) / 1e5;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const lf = path.join(OUT, 'nhd-flowlines.json');
  if (refresh || !fs.existsSync(lf)) {
    log('NHD flowlines…');
    const feats = await query(5, 'fcode in (46003,46006,46007,55800,33400,33600)', 'objectid,permanent_identifier,fcode,gnis_name', { maxAllowableOffset: '0.00002', geometryPrecision: '5' });
    const lines = [];
    for (const f of feats) for (const p of f.geometry?.paths || []) lines.push({ id: f.attributes.permanent_identifier, fcode: f.attributes.fcode, name: f.attributes.gnis_name || null, pts: p.map(([lon, lat]) => [r5(lat), r5(lon)]) });
    fs.writeFileSync(lf, JSON.stringify({ fetched: new Date().toISOString(), source: `${NHD}/5 (USGS NHD, hosted by the MPCA; public domain)`, lines }));
    const by = {}; for (const l of lines) by[l.fcode] = (by[l.fcode] || 0) + 1;
    log(`  ${lines.length} lines`, JSON.stringify(by));
  }
  const wf = path.join(OUT, 'nhd-waterbodies.json');
  if (refresh || !fs.existsSync(wf)) {
    log('NHD waterbodies…');
    const feats = await query(14, 'fcode in (39000,39001,39004,46600,43600)', 'objectid,permanent_identifier,fcode,gnis_name', { returnCentroid: 'true', returnGeometry: 'false' });
    const lines = feats.filter((f) => f.centroid).map((f) => ({ id: f.attributes.permanent_identifier, fcode: f.attributes.fcode, name: f.attributes.gnis_name || null, pts: [[r5(f.centroid.y), r5(f.centroid.x)]] }));
    fs.writeFileSync(wf, JSON.stringify({ fetched: new Date().toISOString(), source: `${NHD}/14`, lines }));
    log(`  ${lines.length} waterbodies`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
