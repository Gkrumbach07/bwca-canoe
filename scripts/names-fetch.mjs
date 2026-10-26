#!/usr/bin/env node
// d1 names (2026-10-26): the place-name authorities, fetched once and cached for scripts/names.mjs.
//
//   node scripts/names-fetch.mjs [--force] [--only campsites,trails,wilderness,gnis,ontario]
//
// Writes data-cache/names/<source>.json (GeoJSON, or attribute rows for Ontario) and data-cache/names/fetched.json
// (what came from where, when, how many). Each source is fetched only when its file is missing, unless --force.
// The services are paged (1000 rows a request) with a pause between pages. Sources, from docs/data-sources/places.md:
//   campsites   USFS Superior NF "BWCA Wilderness Campsites Public": 1,947 sites, CSITENO + LAKE_NAME (public domain)
//   trails      USFS EDW NFS Trails, the box, hiker-only TERRA (portages and foot trails): trail_no, trail_name,
//               trail_class, gis_miles (public domain)
//   wilderness  USFS EDW National Wilderness Areas: the BWCAW polygon, for inside/outside tests (public domain)
//   gnis        USGS GNIS via MnGeo: the names in the box (no restrictions; USGS acknowledgement appreciated)
//   ontario     Geographic Names Ontario (LIO Open09/36), the box, attributes only (Open Government Licence – Ontario)
import fs from 'node:fs';
import path from 'node:path';
import { CFG, AREAS, log } from './config.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const force = process.argv.includes('--force');
const only = arg('--only', null);
const dir = path.join(CFG.cacheDir, 'names');
fs.mkdirSync(dir, { recursive: true });
const B = AREAS.bwca, BOX = `${B.west},${B.south},${B.east},${B.north}`;

const SOURCES = {
  campsites: {
    url: 'https://services1.arcgis.com/gGHDlz6USftL5Pau/arcgis/rest/services/R09_SNF_BWCA_Wilderness_Campsites/FeatureServer/0',
    where: '1=1', fields: 'CSITENO,LAKE_NAME,STATUS,District,DOWNUM,LAND_UNIT_ID,REC_SITE_TYPE,last_edited_date', box: false,
    cite: 'USDA Forest Service, Superior National Forest: BWCA Wilderness Campsites Public (public domain)',
  },
  trails: {
    url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/0',
    where: "trail_type='TERRA' AND allowed_terra_use='1'", fields: 'trail_no,trail_name,trail_class,gis_miles,segment_length', box: true,
    cite: 'USDA Forest Service EDW: National Forest System Trails (public domain)',
  },
  wilderness: {
    url: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_Wilderness_02/MapServer/0',
    where: "wildernessname LIKE 'Boundary Waters%'", fields: 'wildernessname,gis_acres', box: false,
    cite: 'USDA Forest Service EDW: National Wilderness Areas (public domain)',
  },
  gnis: {
    url: 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/loc_geographic_names_usgs_gnis/FeatureServer/0',
    // (the geometry is a statewide multipoint: filter on the primary coordinates instead)
    where: `prim_lat_dec >= ${B.south} AND prim_lat_dec <= ${B.north} AND prim_long_dec >= ${B.west} AND prim_long_dec <= ${B.east}`,
    fields: 'feature_id,feature_name,feature_class,county_name,map_name,prim_lat_dec,prim_long_dec', box: false, geometry: false,
    cite: 'U.S. Geological Survey, Geographic Names Information System, via MnGeo (no restrictions)',
  },
  ontario: {
    url: 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/36',
    where: '1=1', fields: 'OGF_ID,OFFICIAL_NAME,ENTITY_TYPE,GEONAME_STATUS,GEONAME_ORIGIN,LATITUDE_DECIMAL_DEGREES,LONGITUDE_DECIMAL_DEGREES', box: true, geometry: false,
    cite: 'Ontario Ministry of Natural Resources: Geographic Names Ontario (Open Government Licence – Ontario)',
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, tries = 4) {
  for (let t = 0; ; t++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': CFG.ua } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const d = await res.json();
      if (d.error) throw new Error(JSON.stringify(d.error));
      return d;
    } catch (e) {
      if (t >= tries - 1) throw e;
      log(`  retry ${t + 1}: ${e.message}`);
      await sleep(2000 * (t + 1));
    }
  }
}

async function fetchLayer(key, s) {
  const feats = [];
  for (let off = 0; ; off += 1000) {
    const q = new URLSearchParams({ where: s.where, outFields: s.fields, outSR: '4326', f: s.geometry === false ? 'json' : 'geojson', resultOffset: String(off), resultRecordCount: '1000', returnGeometry: s.geometry === false ? 'false' : 'true' });
    if (s.box) { q.set('geometry', BOX); q.set('geometryType', 'esriGeometryEnvelope'); q.set('inSR', '4326'); q.set('spatialRel', 'esriSpatialRelIntersects'); }
    const d = await getJson(`${s.url}/query?${q}`);
    const page = s.geometry === false ? (d.features || []).map((f) => ({ type: 'Feature', geometry: null, properties: f.attributes })) : d.features || [];
    feats.push(...page);
    log(`  ${key}: ${feats.length}`);
    const more = d.exceededTransferLimit || (d.properties && d.properties.exceededTransferLimit);
    if (!page.length || (page.length < 1000 && !more)) break;
    await sleep(800); // polite
  }
  return { type: 'FeatureCollection', features: feats };
}

const recFile = path.join(dir, 'fetched.json');
const rec = fs.existsSync(recFile) ? JSON.parse(fs.readFileSync(recFile, 'utf8')) : {};
for (const [key, s] of Object.entries(SOURCES)) {
  if (only && !only.split(',').includes(key)) continue;
  const file = path.join(dir, `${key}.json`);
  if (fs.existsSync(file) && !force) { log(`${key}: cached (${file})`); continue; }
  log(`${key}: ${s.url}`);
  const fc = await fetchLayer(key, s);
  fs.writeFileSync(file, JSON.stringify(fc));
  rec[key] = { url: s.url, where: s.where, box: s.box ? BOX : null, n: fc.features.length, bytes: fs.statSync(file).size, fetched: new Date().toISOString(), cite: s.cite };
  fs.writeFileSync(recFile, JSON.stringify(rec, null, 1));
  log(`${key}: ${fc.features.length} features, ${(rec[key].bytes / 1024).toFixed(0)} KB`);
  await sleep(500);
}
