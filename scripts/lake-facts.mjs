#!/usr/bin/env node
// d1 lakes (the owner, 2026-10-26: "i honestly would like to do all of this"): the facts the agencies publish about
// each lake, joined to the release's lakes, for src/lake-facts.json. No re-bake: the game reads the table at load.
//
//   node scripts/lake-facts.mjs [--cache data-cache/lakefinder] [--data public/data] [--out src/lake-facts.json]
//                               [--fetch-only] [--offline] [--pause 400]
//
// Sources (every response cached under --cache, so a rerun reads the disk; --offline never touches the network):
// - MN DNR LakeFinder, search.cgi on a grid over the box (lakes, DOW numbers, a point and a bbox each, max depth,
//   littoral acres, the species ever recorded) and detail.cgi?type=lake_survey per lake (every survey's catch per net,
//   CPUE, by species and gear, with the DNR's interquartile range of the CPUE for lakes of its class)
// - MN DNR State Climatology, ice_out_by_lake.cgi and ice_in_by_lake.cgi (the 50 and 26 box lakes with records)
// - MN DNR Wildlife, Wild Rice Lakes (biota_wild_rice_lakes_dnr_wld): the acres of rice by lake
// - NOAA NCEI, 1991-2020 monthly normals for Ely 25E (USC00212555, beside Lake One)
// - USGS NWIS 05124480, Kawishiwi River near Ely: monthly mean water temperature (00010) and flow (00060)
// The DNR data carries its General Geographic Data License (cite the DNR); NOAA and USGS are public domain.
//
// The join: LakeFinder's lakes are DNR basins (DOW numbers); the release's lakes are OSM polygons. Each DNR lake's
// point (inside its basin) is looked up in the release's own fine tiles; a point on land or on another lake looks for
// the nearest water cell within its bbox whose lake's name agrees, else the nearest of a size that agrees. A DNR lake
// can cover several OSM polygons (a bay drawn on its own): those take its facts too when they lie inside its bbox,
// carry its name and touch the matched lake's basin.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { AREAS } from './config.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
const CACHE = arg('--cache', 'data-cache/lakefinder').replace(/\/$/, '');
const dataDir = arg('--data', 'public/data').replace(/\/?$/, '/');
const outFile = arg('--out', 'src/lake-facts.json');
const PAUSE = +arg('--pause', 400);
const OFFLINE = flag('--offline');
const BOX = AREAS.bwca;
const UA = 'bwca-canoe-game/0.2 (lake facts script; gkrumbach07.github.io/bwca-canoe)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

fs.mkdirSync(CACHE, { recursive: true });
for (const d of ['search', 'survey', 'iceout', 'icein']) fs.mkdirSync(path.join(CACHE, d), { recursive: true });

// one cached GET: the file if it is there, else the URL (politely: a pause after every request, three tries)
let fetched = 0;
async function cached(file, url, { text = false } = {}) {
  const f = path.join(CACHE, file);
  if (fs.existsSync(f)) { const s = fs.readFileSync(f, 'utf8'); return text ? s : JSON.parse(s); }
  if (OFFLINE) return null;
  let err = null;
  for (let t = 0; t < 3; t++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const s = await res.text();
      const v = text ? s : JSON.parse(s);
      fs.writeFileSync(f, s);
      fetched++;
      await sleep(PAUSE);
      return v;
    } catch (e) { err = e; await sleep(PAUSE * 4 * (t + 1)); }
  }
  log('gave up on', url, String(err && err.message));
  return null;
}

// ---- fetch ---------------------------------------------------------------------------------------------------------
const LF = 'https://maps.dnr.state.mn.us/cgi-bin/lakefinder';
const inBox = (lon, lat) => lon >= BOX.west && lon <= BOX.east && lat >= BOX.south && lat <= BOX.north;

async function fetchAll() {
  // the search grid: 15 km circles 0.16 deg apart north-south and 0.22 east-west cover the box with overlap
  const lakes = new Map();
  for (let lat = 47.84; lat < BOX.north + 0.1; lat += 0.16) for (let lon = BOX.west + 0.05; lon < BOX.east + 0.15; lon += 0.22) {
    const k = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
    const r = await cached(`search/${k}.json`, `${LF}/search.cgi?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&radius=15000`);
    for (const l of (r && r.results) || []) {
      const p = l.point && l.point['epsg:4326'];
      if (!p || !inBox(p[0], p[1]) || lakes.has(l.id)) continue;
      lakes.set(l.id, l);
    }
  }
  log(`search: ${lakes.size} DNR lakes in the box`);
  let n = 0;
  for (const l of lakes.values()) {
    const r = l.resources || {};
    if (r.lakeSurvey) { await cached(`survey/${l.id}.json`, `${LF}/detail.cgi?type=lake_survey&id=${l.id}`); n++; }
    if (r.iceOut) await cached(`iceout/${l.id}.json`, `https://maps.dnr.state.mn.us/cgi-bin/climatology/ice_out_by_lake.cgi?id=${l.id}`);
    if (r.iceIn) await cached(`icein/${l.id}.json`, `https://maps.dnr.state.mn.us/cgi-bin/climatology/ice_in_by_lake.cgi?id=${l.id}`);
    if (n && n % 50 === 0 && r.lakeSurvey) log(`surveys: ${n} (${fetched} fetched this run)`);
  }
  const rice = 'https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_dnr/biota_wild_rice_lakes_dnr_wld/FeatureServer/0/query';
  await cached('wild-rice.json', `${rice}?where=1%3D1&geometry=${BOX.west},${BOX.south},${BOX.east},${BOX.north}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=dowlknum,dow_main,gnis_name,pw_basin_name,acres,wr_acres&returnGeometry=false&returnCentroid=true&outSR=4326&f=json`);
  await cached('noaa-USC00212555.json', 'https://www.ncei.noaa.gov/access/services/data/v1?dataset=normals-monthly-1991-2020&stations=USC00212555&format=json');
  await cached('usgs-05124480.rdb', 'https://waterservices.usgs.gov/nwis/stat/?format=rdb&sites=05124480&statReportType=monthly&statTypeCd=mean&parameterCd=00060,00010', { text: true });
  log(`fetched ${fetched} new responses into ${CACHE}`);
  return lakes;
}

const lakes = await fetchAll();
if (flag('--fetch-only')) process.exit(0);
const readCache = (file) => { try { return JSON.parse(fs.readFileSync(path.join(CACHE, file), 'utf8')); } catch { return null; } };

// ---- the release's lakes, read from its own fine tiles -------------------------------------------------------------
const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const g = index.grid, T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, NC = SIDE * SIDE;
const proj = index.proj;
const toXZ = (lon, lat) => [(lon - proj.lon0) * proj.mPerDegLon, -(lat - proj.lat0) * proj.mPerDegLat];
const nIds = index.lakes.length + 1;
const rec = (id) => (id > 0 ? index.lakes[id - 1] : null);
// per lake: its reach (the farthest a water cell lies from the shore, m) and how many of its cells lie how far from the
// shore (HB log bins, 5 m to 3 km), for the bowl's shape
const HB = 48, binOf = (d) => Math.max(0, Math.min(HB - 1, Math.floor((Math.log(Math.max(5, d) / 5) / Math.log(600)) * HB)));
const binMid = (b) => 5 * Math.pow(600, (b + 0.5) / HB);
const reach = new Float32Array(nIds), hist = new Map();
const lakeTiles = new Map(); // tile -> its lake ids (only the tiles with water), for the point lookups
log("reading the release's tiles…");
for (let ty = 0; ty < g.nty; ty++) for (let tx = 0; tx < g.ntx; tx++) {
  const f = `${dataDir}tiles/${tx}_${ty}.bin`;
  if (!fs.existsSync(f)) continue;
  const raw = zlib.gunzipSync(fs.readFileSync(f));
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const lake = new Uint16Array(buf, NC * 2, NC), sd = new Int16Array(buf, NC * 4, NC);
  let any = false;
  for (let j = HALO; j < HALO + T; j++) for (let i = HALO; i < HALO + T; i++) {
    const m = j * SIDE + i, id = lake[m];
    if (!id) continue;
    any = true;
    const d = -sd[m] / 10;
    if (d > reach[id]) reach[id] = d;
    let h = hist.get(id);
    if (!h) { h = new Uint32Array(HB); hist.set(id, h); }
    h[binOf(d)]++;
  }
  if (any) lakeTiles.set(ty * g.ntx + tx, lake);
}
const lakeCell = (i, j) => {
  if (i < 0 || j < 0 || i >= g.width || j >= g.height) return 0;
  const t = lakeTiles.get(((j / T) | 0) * g.ntx + ((i / T) | 0));
  return t ? t[((j % T) + HALO) * SIDE + (i % T) + HALO] : 0;
};
const cellOf = (x, z) => [Math.floor((x - g.originX) / g.cell), Math.floor((z - g.originZ) / g.cell)];

// ---- the join ------------------------------------------------------------------------------------------------------
const STOP = new Set(['lake', 'lakes', 'the', 'of', 'no', 'number']);
const NUM = { mid: 'middle', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
const words = (s) => String(s || '').toLowerCase().replace(/[#.]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)).map((w) => NUM[w] || w);
const norm = (s) => words(s).join(' ');
// the DNR's name and the map's agree: every word of the DNR's is in the map's ("Knife" in "South Arm Knife Lake"), or
// the two run together the same ("Sea Gull" and "Seagull")
function sameName(dnr, osm) {
  const a = norm(dnr), b = norm(osm);
  if (!a || !b) return false;
  if (a.replace(/ /g, '') === b.replace(/ /g, '')) return true;
  const bw = new Set(b.split(' '));
  return a.split(' ').every((w) => bw.has(w));
}
const unnamed = (n) => !n || /^unnamed/i.test(n);
const ACRE = 4046.86;
const haOf = (id) => ((rec(id) && rec(id).cells) || 0) * g.cell * g.cell / 1e4;

// a DNR lake (point, bbox, name, acres) to the release's polygon it is
function match(L) {
  const [lon, lat] = L.point;
  const [x, z] = toXZ(lon, lat);
  const [ci, cj] = cellOf(x, z);
  const named = !unnamed(L.name), ha = (L.acres || 0) * ACRE / 1e4;
  const sizeOk = (id) => !ha || (haOf(id) > ha * 0.15 && haOf(id) < ha * 6);
  const ok = (id) => { const r = rec(id); if (!r || r.river) return false; return named && r.name ? sameName(L.name, r.name) : sizeOk(id); };
  const id0 = lakeCell(ci, cj);
  if (id0 && ok(id0)) return { id: id0, how: 'point' };
  // outward from the point, as far as the DNR's bbox reaches (300 m at least, 4 km at most)
  let R = 30;
  if (L.bbox) { const [x0, z1] = toXZ(L.bbox[0], L.bbox[1]), [x1, z0] = toXZ(L.bbox[2], L.bbox[3]); R = Math.min(400, Math.ceil(Math.max(300, x - x0, x1 - x, z - z0, z1 - z) / g.cell)); }
  let best = 0, bd = Infinity;
  for (let r = 1; r <= R && !best; r++) {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const id = lakeCell(ci + di, cj + dj);
      if (!id || !ok(id)) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = id; }
    }
  }
  if (best) return { id: best, how: 'near', m: Math.round(Math.sqrt(bd) * g.cell) };
  // a lake the map draws but names otherwise: the one under the point, if its size agrees
  if (id0 && !rec(id0).river && sizeOk(id0)) return { id: id0, how: 'size' };
  return null;
}
// the other polygons of the same lake: a bay or an arm the map draws on its own, with the lake's name, its middle
// inside the DNR's bbox
function partsOf(L, id) {
  const r = rec(id), out = [id];
  if (!r || !r.name || unnamed(L.name) || !L.bbox) return out;
  const [x0, z1] = toXZ(L.bbox[0], L.bbox[1]), [x1, z0] = toXZ(L.bbox[2], L.bbox[3]);
  for (const q of index.lakes) {
    if (!q || q.id === id || q.river || !q.name || q.name !== r.name) continue;
    if (q.cx >= x0 && q.cx <= x1 && q.cz >= z0 && q.cz <= z1) out.push(q.id);
  }
  return out;
}

// ---- the fish ------------------------------------------------------------------------------------------------------
// The game's six (fishing.js SPECIES) by the DNR's codes, and the net that samples each best: gill nets for walleye,
// pike, perch and lake trout, trap nets for crappie, the better of the two for smallmouth.
const GAME = [['walleye', 'WAE', 'gn'], ['smallmouth', 'SMB', 'both'], ['pike', 'NOP', 'gn'], ['laketrout', 'LAT', 'gn'], ['crappie', 'BLC', 'tn'], ['perch', 'YEP', 'gn']];
const FULL = new Set(['Standard Survey', 'Population Assessment', 'Re-Survey', 'Initial Survey', 'Large Lake Survey']);
const GN = 'Standard gill nets', TN = 'Standard trap nets';
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const quart = (s) => { const m = /^\s*([\d.]+)\s*-\s*([\d.]+)\s*$/.exec(String(s || '')); return m ? [+m[1], +m[2]] : null; };
const NAMES = { WAE: 'walleye', SMB: 'smallmouth bass', NOP: 'northern pike', LAT: 'lake trout', BLC: 'black crappie', YEP: 'yellow perch', WTS: 'white sucker', BLG: 'bluegill', RKB: 'rock bass', LMB: 'largemouth bass', PMK: 'pumpkinseed', TLC: 'cisco', BKT: 'brook trout', SPT: 'splake', RBT: 'rainbow trout', BUB: 'burbot', LKW: 'lake whitefish', MUE: 'muskellunge', BNT: 'brown trout', HSF: 'hybrid sunfish', GSF: 'green sunfish', BRB: 'brown bullhead', SHR: 'shorthead redhorse', GOS: 'golden shiner' };

// the latest full survey of a lake: per species its catch per net in gill and trap nets, the DNR's interquartile range
// for lakes of its class, and the species netted in the full surveys of the 30 years before it
function surveyOf(dow) {
  const j = readCache(`survey/${dow}.json`), r = j && j.result;
  if (!r || !Array.isArray(r.surveys)) return null;
  const full = r.surveys.filter((s) => FULL.has(s.surveySubType) && (s.fishCatchSummaries || []).some((c) => c.gear === GN || c.gear === TN))
    .sort((a, b) => String(b.surveyDate).localeCompare(String(a.surveyDate)));
  const out = { depthFt: num(r.maxDepthFeet), littoral: num(r.littoralAcres), acres: num(r.areaAcres), year: null, cpue: {}, quart: {}, seen: new Set() };
  if (!full.length) return out;
  const s = full[0], year = +String(s.surveyDate).slice(0, 4);
  out.year = year;
  for (const c of s.fishCatchSummaries || []) {
    if (c.gear !== GN && c.gear !== TN) continue;
    const k = c.gear === GN ? 0 : 1, v = num(c.CPUE);
    if (v === null) continue;
    (out.cpue[c.species] || (out.cpue[c.species] = [null, null]))[k] = v;
    const q = quart(c.quartileCount);
    if (q) (out.quart[c.species] || (out.quart[c.species] = [null, null]))[k] = q;
  }
  for (const t of full.slice(1)) {
    if (year - +String(t.surveyDate).slice(0, 4) > 30) continue;
    for (const c of t.fishCatchSummaries || []) if (num(c.CPUE) > 0) out.seen.add(c.species);
  }
  return out;
}

// ---- ice ------------------------------------------------------------------------------------------------------------
const doyOf = (d) => { const t = Date.parse(d + 'T00:00:00Z'); if (!Number.isFinite(t)) return null; const y = new Date(t).getUTCFullYear(); return Math.round((t - Date.UTC(y, 0, 1)) / 864e5) + 1; };
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
// the median date over the last 35 years (five records at least), else over every year since 1950; days into the year,
// ice-in counted past the new year as 365 +
function iceOf(file, late = false) {
  const j = readCache(file), r = j && j.result;
  if (!r || !Array.isArray(r.values)) return null;
  const vals = r.values.map((v) => ({ y: +String(v.date).slice(0, 4), d: doyOf(v.date) })).filter((v) => v.d && v.y >= 1950);
  const seen = new Map();
  for (const v of vals) if (!seen.has(v.y)) seen.set(v.y, late && v.d < 120 ? v.d + 365 : v.d); // one a year (two sources often agree)
  const all = [...seen.entries()];
  const recent = all.filter(([y]) => y >= 1991);
  const use = recent.length >= 5 ? recent : all;
  return use.length ? { doy: Math.round(median(use.map(([, d]) => d))), n: use.length, from: Math.min(...use.map(([y]) => y)) } : null;
}
// least squares, weighted
function fit(rows, w) {
  const k = rows[0].x.length, A = Array.from({ length: k }, () => new Float64Array(k)), b = new Float64Array(k);
  rows.forEach((r, n) => { for (let i = 0; i < k; i++) { b[i] += w[n] * r.x[i] * r.y; for (let j = 0; j < k; j++) A[i][j] += w[n] * r.x[i] * r.x[j]; } });
  for (let i = 0; i < k; i++) { // Gauss-Jordan
    let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = 0; r < k; r++) { if (r === i) continue; const f = A[r][i] / A[i][i]; for (let c = i; c < k; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  return Array.from(b, (v, i) => v / A[i][i]);
}

// ---- the bowl --------------------------------------------------------------------------------------------------------
// The release gave every lake without a DNR contour map one bed: 0.6 m + 9 % of the distance from the shore (plus 5 m),
// down to 14 m at most. A lake with a DNR max depth M gets the bowl instead: the depth at d metres from the shore is
// M × (1 − (1 − d/R)^p), R the lake's reach (its farthest cell from the shore), blended from the old ramp over the
// first 8–30 m so the shore band the mesh draws is as it was. p is chosen so the share of the lake shallower than 15 ft
// (4.57 m) is the DNR's littoral share; lake-facts.js bowlDepth is the same function.
const OLD = (d) => Math.min(14, 0.6 + 0.09 * (5 + d));
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bowl = (d, M, R, p) => { const t = Math.min(1, d / Math.max(10, R)); const b = M * (1 - Math.pow(1 - t, p)); const near = Math.min(0.6 + 0.09 * (5 + d), b); return Math.min(M, near + (b - near) * smooth(8, 30, d)); };
function bowlP(M, R, h, littoral) {
  if (!(littoral > 0) || M <= 4.6) return 2;
  const total = h.reduce((a, b) => a + b, 0);
  const share = (p) => { let s = 0; for (let b = 0; b < HB; b++) if (h[b] && bowl(binMid(b), M, R, p) < 4.572) s += h[b]; return s / total; };
  let lo = 0.7, hi = 8;
  const want = Math.min(0.98, Math.max(0.03, littoral));
  if (share(lo) <= want) return lo;
  if (share(hi) >= want) return hi;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (share(m) > want) lo = m; else hi = m; }
  return +((lo + hi) / 2).toFixed(2);
}

// ---- build ----------------------------------------------------------------------------------------------------------
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const facts = [];
const byId = new Map(); // release lake id -> its record (a polygon two DNR basins claim goes to the bigger)
let unmatched = 0;
const how = {};
for (const l of lakes.values()) {
  const m = l.morphology || {};
  const L = { dow: l.id, name: l.name, point: l.point['epsg:4326'], bbox: l.bbox && l.bbox['epsg:4326'], acres: m.area || 0 };
  const s = l.resources && l.resources.lakeSurvey ? surveyOf(l.id) : null;
  const depthFt = m.max_depth > 0 ? m.max_depth : s && s.depthFt > 0 ? s.depthFt : 0;
  const littoral = (m.littoral_area || (s && s.littoral) || 0) / (m.area || (s && s.acres) || 1);
  const io = l.resources && l.resources.iceOut ? iceOf(`iceout/${l.id}.json`) : null;
  const ii = l.resources && l.resources.iceIn ? iceOf(`icein/${l.id}.json`, true) : null;
  const species = String((l.fishSpecies || [])[0] || '').split(',').map((x) => x.trim()).filter(Boolean);
  const f = { dow: l.id, name: unnamed(l.name) ? null : l.name, acres: Math.round(L.acres) || undefined, depth: depthFt ? +(depthFt * 0.3048).toFixed(1) : undefined,
    littoral: depthFt && littoral > 0 ? r2(Math.min(1, littoral)) : undefined, lon: +L.point[0].toFixed(4), lat: +L.point[1].toFixed(4), border: l.border || undefined,
    survey: s && s.year ? s.year : undefined, cpue: s && s.year ? Object.fromEntries(Object.entries(s.cpue).map(([k, v]) => [k, v.map(r2)])) : undefined,
    species: species.length ? species : undefined, iceOut: io || undefined, iceIn: ii || undefined, _s: s };
  const mm = match(L);
  if (mm) { f.ids = partsOf(L, mm.id); how[mm.how] = (how[mm.how] || 0) + 1; } else { unmatched++; f.ids = []; }
  facts.push(f);
}
// two DNR basins on one polygon: the polygon is the bigger's
for (const f of facts.slice().sort((a, b) => (b.acres || 0) - (a.acres || 0))) for (const id of f.ids) if (!byId.has(id)) byId.set(id, f);
for (const f of facts) f.ids = f.ids.filter((id) => byId.get(id) === f);
log(`join: ${facts.length - unmatched} of ${facts.length} DNR lakes on a polygon (${JSON.stringify(how)}), ${byId.size} polygons`);

// the typical catch per net for each species and net in the box (the median of the lakes that netted it), for a
// survey row with no interquartile range
const typical = {};
for (const f of facts) if (f._s) for (const [k, v] of Object.entries(f._s.cpue)) for (let n = 0; n < 2; n++) if (v[n] > 0) ((typical[k] || (typical[k] = [[], []]))[n]).push(v[n]);
for (const k in typical) typical[k] = typical[k].map((a) => median(a));
// how many of a species there are for the game: its catch per net over the middle of the DNR's range for lakes of the
// class (the geometric mean of the quartiles), square-rooted and held to 0.3-2; netted before (30 years) or recorded
// in the lake but not in the last survey 0.25; never recorded 0
function abundance(s, species, code, gear) {
  const rel = (n) => {
    const v = s.cpue[code] && s.cpue[code][n];
    if (!(v > 0)) return 0;
    const q = s.quart[code] && s.quart[code][n];
    const mid = q && q[1] > 0 ? Math.sqrt(Math.max(q[0], q[1] * 0.1) * q[1]) : typical[code] && typical[code][n];
    return mid > 0 ? v / mid : 1;
  };
  const r = gear === 'gn' ? rel(0) : gear === 'tn' ? rel(1) : Math.max(rel(0), rel(1));
  const name = NAMES[code], known = s.seen.has(code) || species.some((x) => x === name || x.startsWith(name));
  // lake trout keep to the cold deep water the standard nets are not set in (the DNR samples them on their own): a
  // lake recorded as holding them has them in fair numbers
  const floor = code === 'LAT' && (r > 0 || known) ? 0.6 : 0.3;
  if (r > 0) return r2(Math.min(2, Math.max(floor, Math.sqrt(r))));
  if (known) return code === 'LAT' ? floor : 0.25;
  return 0;
}
let surveyed = 0;
for (const f of facts) {
  if (f._s && f._s.year) { f.fish = GAME.map(([, code, gear]) => abundance(f._s, f.species || [], code, gear)); surveyed++; }
  delete f._s;
}

// unsurveyed water: what the surveyed lakes of its size hold. By size class, the share of surveyed lakes with each
// species (fish > 0) and its mean abundance where it is
const CLASSES = [4, 20, 80, 400, Infinity]; // hectares
const clsOf = (ha) => CLASSES.findIndex((c) => ha < c);
const prior = GAME.map(() => CLASSES.map(() => [0, 0, 0])); // [lakes, present, sum]
for (const f of facts) if (f.fish) {
  const c = clsOf((f.acres || 0) * ACRE / 1e4);
  f.fish.forEach((a, k) => { const p = prior[k][c]; p[0]++; if (a > 0) { p[1]++; p[2] += a; } });
}
const priorOut = Object.fromEntries(GAME.map(([sp], k) => [sp, prior[k].map(([n, p, s]) => [r2(n ? p / n : 0), r2(p ? s / p : 0.8)])]));

// ice: the measured lakes' medians, and a fit of the date to where a lake is and how big and deep (the big deep lakes
// and the ones up the Gunflint go out last), for the rest. x = [1, degrees east of 91.5 W, log10 acres, log10 depth ft]
const iceRows = (key, late) => facts.filter((f) => f[key] && f[key].n >= 3 && f.acres > 0).map((f) => ({ x: [1, f.lon + 91.5, Math.log10(f.acres), Math.log10((f.depth || 6) / 0.3048 + 1)], y: f[key].doy, w: Math.min(15, f[key].n) }));
const iceFit = (key) => {
  const rows = iceRows(key);
  const full = fit(rows, rows.map((r) => r.w)), noDepth = fit(rows.map((r) => ({ x: r.x.slice(0, 3), y: r.y })), rows.map((r) => r.w));
  const rms = Math.sqrt(rows.reduce((a, r) => a + r.w * (r.y - r.x.reduce((s, v, i) => s + v * full[i], 0)) ** 2, 0) / rows.reduce((a, r) => a + r.w, 0));
  return { full: full.map((v) => +v.toFixed(3)), noDepth: noDepth.map((v) => +v.toFixed(3)), lakes: rows.length, rms: +rms.toFixed(1) };
};
const iceModel = { out: iceFit('iceOut'), in: iceFit('iceIn') };
for (const f of facts) for (const key of ['iceOut', 'iceIn']) {
  if (f[key] && f[key].n >= 3) { f[key] = { doy: f[key].doy, n: f[key].n }; continue; }
  const m = iceModel[key === 'iceOut' ? 'out' : 'in'];
  const x = [1, f.lon + 91.5, Math.log10(Math.max(1, f.acres || 1)), Math.log10((f.depth || 0) / 0.3048 + 1)];
  const c = f.depth ? m.full : m.noDepth;
  f[key] = { doy: Math.round(c.reduce((s, v, i) => s + v * x[i], 0)), n: 0 };
}

// wild rice: the DNR Wildlife list, its acres summed onto the main basin; a rice lake LakeFinder has no record of is
// joined by its own middle and name
const rice = readCache('wild-rice.json');
let riceLakes = 0;
for (const ft of (rice && rice.features) || []) {
  const a = ft.attributes, dow = String(a.dow_main || a.dowlknum || '').padStart(8, '0');
  let f = facts.find((x) => x.dow === dow);
  if (!f && ft.centroid) {
    const L = { dow, name: a.pw_basin_name || a.gnis_name, point: [ft.centroid.x, ft.centroid.y], bbox: null, acres: a.acres || 0 };
    const mm = match(L);
    const ids = mm ? partsOf(L, mm.id).filter((id) => !byId.has(id)) : [];
    if (!ids.length) continue;
    f = { dow, name: L.name, acres: Math.round(L.acres) || undefined, lon: +ft.centroid.x.toFixed(4), lat: +ft.centroid.y.toFixed(4), ids, riceOnly: true };
    for (const id of ids) byId.set(id, f);
    facts.push(f);
  }
  if (!f) continue;
  f.rice = (f.rice || 0) + (a.wr_acres || 0); // listed: rice there, 0 where the DNR gave no acres
  riceLakes++;
}

// the bowls: per polygon of a lake with a DNR depth and no contour map, its reach and the shape that gives the DNR's
// littoral share
let bowls = 0;
for (const f of facts) {
  if (!f.depth || !f.ids || !f.ids.length) continue;
  const b = [];
  for (const id of f.ids) {
    const r = rec(id);
    if (!r || r.maxDepth || !hist.has(id)) { b.push(0); continue; }
    b.push([Math.round(reach[id]), bowlP(f.depth, reach[id], hist.get(id), f.littoral)]);
    bowls++;
  }
  if (b.some((v) => v)) f.bowl = b;
}

// ---- climate and the river -------------------------------------------------------------------------------------------
const F2C = (f) => +(((f - 32) * 5) / 9).toFixed(1);
const noaa = readCache('noaa-USC00212555.json') || [];
const month = (k) => noaa.slice().sort((a, b) => +a.DATE - +b.DATE).map((r) => num(r[k]));
const climate = { station: 'USC00212555 Ely 25E', normals: '1991-2020', tmax: month('MLY-TMAX-NORMAL').map(F2C), tmin: month('MLY-TMIN-NORMAL').map(F2C) };
const rdb = (() => { try { return fs.readFileSync(path.join(CACHE, 'usgs-05124480.rdb'), 'utf8'); } catch { return ''; } })();
const byMonth = { '00010': Array.from({ length: 12 }, () => []), '00060': Array.from({ length: 12 }, () => []) };
let head = null;
for (const line of rdb.split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const c = line.split('\t');
  if (!head) { head = c; continue; }
  if (/^\d+s$/.test(c[0])) continue;
  const p = c[head.indexOf('parameter_cd')], mo = +c[head.indexOf('month_nu')], v = num(c[head.indexOf('mean_va')]);
  if (byMonth[p] && mo >= 1 && mo <= 12 && v !== null) byMonth[p][mo - 1].push(v);
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const river = { site: 'USGS 05124480 Kawishiwi River near Ely', tempC: byMonth['00010'].map((a) => r2(mean(a))), tempYears: byMonth['00010'].map((a) => a.length), flowCfs: byMonth['00060'].map((a) => Math.round(mean(a))) };

// ---- write -------------------------------------------------------------------------------------------------------------
const out = {
  about: 'd1 lakes (2026-10-26): what the agencies publish about each lake, joined to the release baked at `for` (scripts/lake-facts.mjs; read by src/lake-facts.js). Per DNR lake (dow): the release polygons it is (ids), max depth m, littoral share (under 15 ft), its last full survey year and catch per net [gill, trap] by DNR species code, the game\'s six (`fishOrder`) as abundance (1 = the middle of the DNR\'s range for lakes of its class, 0 = never recorded), median ice-out and ice-in as days of the year (n: years measured, 0: from `iceModel`), wild rice acres, and per polygon its bowl [reach m, shape p] for the lakes with no contour map.',
  for: index.source && index.source.baked,
  sources: {
    lakes: 'MN DNR LakeFinder (maps.dnr.state.mn.us/cgi-bin/lakefinder: search.cgi, detail.cgi?type=lake_survey)',
    ice: 'MN DNR State Climatology Office, ice-out and ice-in by lake',
    rice: 'MN DNR Wildlife, Wild Rice Lakes Identified by DNR Wildlife (wr_acres)',
    climate: 'NOAA NCEI 1991-2020 monthly normals, USC00212555 Ely 25E',
    river: 'USGS NWIS 05124480 Kawishiwi River near Ely, monthly means',
    license: 'DNR data under the MN DNR General Geographic Data License (cite the DNR); NOAA and USGS public domain',
  },
  fishOrder: GAME.map(([sp]) => sp),
  speciesCodes: NAMES,
  prior: { hectares: CLASSES.slice(0, -1), bySpecies: priorOut },
  iceModel: { x: '[1, degrees east of 91.5 W, log10 acres, log10 (max depth ft + 1)]', ...iceModel },
  climate, river,
  lakes: facts.filter((f) => f.ids && f.ids.length).map((f) => Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== undefined && !k.startsWith('_') && k !== 'riceOnly'))),
};
fs.writeFileSync(outFile, JSON.stringify(out));
const size = fs.statSync(outFile).size, gz = zlib.gzipSync(fs.readFileSync(outFile)).length;
log(`wrote ${outFile}: ${out.lakes.length} lakes on ${byId.size} polygons, ${surveyed} with a fish survey, ${bowls} bowls, ${riceLakes} rice records; ${(size / 1024).toFixed(0)} KB (${(gz / 1024).toFixed(0)} KB gzipped)`);
log('ice-out fit', JSON.stringify(iceModel.out), 'ice-in fit', JSON.stringify(iceModel.in));
log('climate', JSON.stringify(climate));
log('river', JSON.stringify(river));
if (flag('--report')) {
  const miss = facts.filter((f) => !f.ids || !f.ids.length);
  console.log('unmatched:', miss.length, miss.slice(0, 40).map((f) => `${f.dow} ${f.name} ${f.acres}ac`).join('; '));
}
