// Minnesota DNR lake bathymetry: depth contours digitised from the DNR lake maps, served by the state's
// ArcGIS host (Lake Bathymetric Outlines, Contours, and DEM, MN Geospatial Commons). The contours inside the
// bake area are fetched once through the REST API in WGS84 and cached as JSON.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { CFG, log, sleep } from './config.mjs';

const SERVICE = 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_dnr/water_lake_bathymetry/MapServer/0';
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

// Returns { contours: [{ depthFt, dow, name, lines: [[[lat, lon], ...], ...] }], fetched }
export async function loadBathymetry(bbox) {
  const dir = path.join(CFG.cacheDir, 'bathy');
  await fsp.mkdir(dir, { recursive: true });
  const key = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const cacheFile = path.join(dir, `contours-${key}.json`);
  try { return JSON.parse(await fsp.readFile(cacheFile, 'utf8')); } catch {}
  const geometry = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
  const contours = [];
  let offset = 0;
  for (;;) {
    const q = new URLSearchParams({
      where: '1=1', geometry, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: 'depth,abs_depth,dowlknum,lake_name', outSR: '4326', f: 'geojson', resultOffset: String(offset), resultRecordCount: String(PAGE),
    });
    const j = await getJson(`${SERVICE}/query?${q}`);
    const feats = j.features || [];
    for (const f of feats) {
      const p = f.properties || {};
      const g = f.geometry;
      if (!g) continue;
      const parts = g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
      const lines = parts.map((ln) => ln.map(([lon, lat]) => [lat, lon])).filter((ln) => ln.length >= 2);
      if (!lines.length) continue;
      const depthFt = p.abs_depth != null ? Math.abs(+p.abs_depth) : Math.abs(+p.depth || 0);
      contours.push({ depthFt, dow: p.dowlknum || null, name: p.lake_name || null, lines });
    }
    log(`bathymetry: ${contours.length} contours so far`);
    offset += feats.length;
    const more = (j.properties && j.properties.exceededTransferLimit) || feats.length === PAGE;
    if (!feats.length || !more) break;
  }
  const out = { bbox, contours, source: SERVICE, fetched: new Date().toISOString() };
  await fsp.writeFile(cacheFile, JSON.stringify(out));
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('bathymetry.mjs')) {
  const { AREAS } = await import('./config.mjs');
  const area = AREAS[process.argv[2] || 'bwca'];
  const r = await loadBathymetry(area);
  const lakes = new Set(r.contours.map((c) => c.dow));
  const depths = [...new Set(r.contours.map((c) => c.depthFt))].sort((a, b) => a - b);
  let pts = 0; for (const c of r.contours) for (const l of c.lines) pts += l.length;
  log(`${r.contours.length} contours, ${lakes.size} lakes, ${pts} vertices, depths (ft): ${depths.slice(0, 12).join(',')} … max ${depths[depths.length - 1]}`);
  const byLake = new Map(); for (const c of r.contours) byLake.set(c.name, Math.max(byLake.get(c.name) || 0, c.depthFt));
  log('deepest:', [...byLake.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, d]) => `${n} ${d}ft`).join(' | '));
}
