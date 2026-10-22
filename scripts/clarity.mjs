// Lake clarity: the DNR's Lakes of Phosphorus Sensitivity layer carries a mean Secchi depth (metres) and
// mean total phosphorus for most lakes over 10 acres, and the Watershed Health lake scores a mean water
// clarity for more. Both are polygons keyed by DOW number; the ones inside the bake area are fetched once
// through the Geospatial Commons REST service and cached.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { CFG, log, sleep } from './config.mjs';

const H = 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_dnr';
const SOURCES = [
  { name: 'lpss', url: `${H}/env_lakes_phosphorus_sensitivity/FeatureServer/0`, fields: 'dowlknum,pw_basin_name,mean_secchi,mean_tp,acres', secchi: 'mean_secchi' },
  { name: 'health', url: `${H}/env_watershed_health_lake_scores/FeatureServer/0`, fields: 'dowlknum,pw_basin_name,mean_waterclarity,mean_tp,acres', secchi: 'mean_waterclarity' },
];
const PAGE = 2000;

async function getJson(url) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': CFG.ua } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
      return j;
    } catch (e) { lastErr = e; await sleep(1500 * 2 ** attempt); }
  }
  throw lastErr;
}

// Returns { lakes: [{ dow, name, secchi (m), tp, acres, source, rings: [[[lat, lon], ...], ...] }] }
export async function loadClarity(bbox) {
  const dir = path.join(CFG.cacheDir, 'clarity');
  await fsp.mkdir(dir, { recursive: true });
  const key = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const cacheFile = path.join(dir, `clarity-${key}.json`);
  try { return JSON.parse(await fsp.readFile(cacheFile, 'utf8')); } catch {}
  const geometry = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
  const byDow = new Map();
  for (const src of SOURCES) {
    let offset = 0;
    for (;;) {
      const q = new URLSearchParams({
        where: '1=1', geometry, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
        outFields: src.fields, outSR: '4326', f: 'geojson', resultOffset: String(offset), resultRecordCount: String(PAGE),
      });
      const j = await getJson(`${src.url}/query?${q}`);
      const feats = j.features || [];
      for (const f of feats) {
        const p = f.properties || {}, g = f.geometry;
        const secchi = +p[src.secchi];
        if (!g || !(secchi > 0)) continue;
        const dow = String(p.dowlknum || '');
        if (byDow.has(dow)) continue; // the first source wins
        const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
        const rings = [];
        for (const poly of polys) for (const ring of poly) rings.push(ring.map(([lon, lat]) => [lat, lon]));
        if (!rings.length) continue;
        byDow.set(dow, { dow, name: p.pw_basin_name || null, secchi: +secchi.toFixed(2), tp: p.mean_tp != null ? +p.mean_tp : null, acres: p.acres != null ? +p.acres.toFixed(1) : null, source: src.name, rings });
      }
      offset += feats.length;
      const more = (j.properties && j.properties.exceededTransferLimit) || feats.length === PAGE;
      if (!feats.length || !more) break;
    }
    log(`clarity: ${byDow.size} lakes after ${src.name}`);
  }
  const out = { bbox, lakes: [...byDow.values()], source: SOURCES.map((s) => s.url), fetched: new Date().toISOString() };
  await fsp.writeFile(cacheFile, JSON.stringify(out));
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('clarity.mjs')) {
  const { AREAS } = await import('./config.mjs');
  const r = await loadClarity(AREAS[process.argv[2] || 'bwca']);
  const s = r.lakes.map((l) => l.secchi).sort((a, b) => a - b);
  log(`${r.lakes.length} lakes with clarity; secchi min ${s[0]} median ${s[Math.floor(s.length / 2)]} max ${s[s.length - 1]} m`);
  log('clearest:', r.lakes.slice().sort((a, b) => b.secchi - a.secchi).slice(0, 8).map((l) => `${l.name} ${l.secchi}`).join(' | '));
  log('most stained:', r.lakes.slice().sort((a, b) => a.secchi - b.secchi).slice(0, 8).map((l) => `${l.name} ${l.secchi}`).join(' | '));
}
