#!/usr/bin/env node
// d1 names (2026-10-26): the runtime name tables, from the USFS and the place-name authorities (data-cache/names, made by
// scripts/names-fetch.mjs) against a release's own campsites, portages and lakes (and src/world-fixes.json's, for the
// release it was made for). Run scripts/world-fixes.mjs first (it adds the missing sites and the USFS-only portages),
// then this, then scripts/site-lakes.mjs.
//
//   BWCA_CACHE=/path/to/data-cache node scripts/names.mjs [--data public/data] [--report out.json]
//
// Writes, keyed by place (not by index) so a rebake of the same OpenStreetMap data still finds them:
//   src/names-sites.json     the official number and lake or bay of each campsite: "Basswood Lake – Back Bay" #91
//   src/names-portages.json  each drawn portage's USFS trail: number, name, length in rods, class (1–4)
//   src/names-places.json    bays, points, islands, narrows, summits and named portages from GNIS and Ontario
import fs from 'node:fs';
import { CFG, log } from './config.mjs';
import {
  loadSources, releaseReader, wildernessTest, usfsSites, matchSites, usfsTrails, matchPortages, portageName, titleWords,
  GNIS_KIND, ONTARIO_KIND, GNIS_PLACES, PLACE_SKIP, RODS,
} from './names-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', CFG.outDir);
const reportFile = arg('--report', null);
const R = releaseReader(dataDir), index = R.index, baked = index.source && index.source.baked;
const src = loadSources(CFG.cacheDir), inWild = wildernessTest(src.wilderness);
const fixesDoc = JSON.parse(fs.readFileSync('src/world-fixes.json', 'utf8'));
const fixes = fixesDoc.for === baked ? fixesDoc : null;
const toLatLon = (x, z) => [index.proj.lat0 - z / index.proj.mPerDegLat, index.proj.lon0 + x / index.proj.mPerDegLon];
const key = (x, z) => `${Math.round(x)}:${Math.round(z)}`;
const report = {};

// --- campsites -------------------------------------------------------------------------------------------------------------
const sites = [...index.campsites, ...((fixes && fixes.campsites) || [])];
const U = usfsSites(src, R.toLocal);
const waterMemo = new Map();
const waterOf = (p) => { const k = key(p.x, p.z); if (!waterMemo.has(k)) { const w = R.nearestWater(p.x, p.z, 150); waterMemo.set(k, w ? w.id : 0); } return waterMemo.get(k); };
const sm = matchSites(U, sites, (u, s) => { const a = waterOf(u); return !!a && a === waterOf(s); });
const siteLakes = [], li = new Map(), lakeIdx = (n) => { if (!li.has(n)) { li.set(n, siteLakes.length); siteLakes.push(n); } return li.get(n); };
const siteRows = sm.pairs.sort((a, b) => a.s - b.s).map(({ u, s }) => { const c = sites[s]; return [Math.round(c.x), Math.round(c.z), U[u].no, lakeIdx(U[u].lake)]; });
const dists = sm.pairs.map((p) => p.d).sort((a, b) => a - b);
report.sites = {
  usfs: U.length, release: index.campsites.length, added: sites.length - index.campsites.length, numbered: sm.pairs.length,
  within100: dists.filter((d) => d <= 100).length, within250sameWater: dists.filter((d) => d > 100).length, median: +dists[dists.length >> 1].toFixed(1),
  usfsUnplaced: sm.missing.map((i) => `${U[i].lake} #${U[i].no}`).concat(sm.unmatched.map((i) => `${U[i].lake} #${U[i].no} (an OSM site near, on other water or taken)`)),
  osmOnlyInWilderness: sm.spare.filter((i) => { const [la, lo] = toLatLon(sites[i].x, sites[i].z); return inWild(lo, la); }).length,
};
log(`sites: ${sm.pairs.length} of ${sites.length} numbered (${report.sites.within100} within 100 m, ${report.sites.within250sameWater} within 250 m on the same water; median ${report.sites.median} m); ${report.sites.osmOnlyInWilderness} OSM sites in the wilderness the USFS doesn't list`);

// --- places (first: the named portages give their names to the drawn portages near them) ---------------------------------
const places = [];
for (const f of src.gnis.features) {
  const q = f.properties, nm = q.feature_name;
  const kind = GNIS_PLACES[nm] || (q.feature_class !== 'Populated Place' ? GNIS_KIND[q.feature_class] : null);
  if (!kind || PLACE_SKIP.test(nm)) continue;
  const [x, z] = R.toLocal(q.prim_lat_dec, q.prim_long_dec);
  places.push({ kind, name: nm, x, z, src: 'gnis', id: q.feature_id });
}
for (const f of src.ontario.features) {
  const q = f.properties, nm = q.OFFICIAL_NAME, kind = ONTARIO_KIND[q.ENTITY_TYPE];
  if (!kind || !nm || PLACE_SKIP.test(nm) || (q.GEONAME_STATUS && !/approved|official/i.test(q.GEONAME_STATUS))) continue;
  const [x, z] = R.toLocal(q.LATITUDE_DECIMAL_DEGREES, q.LONGITUDE_DECIMAL_DEGREES);
  places.push({ kind, name: nm, x, z, src: 'ontario', id: q.OGF_ID, origin: q.GEONAME_ORIGIN ? String(q.GEONAME_ORIGIN).trim() : null });
}
// the same name of the same kind within 2 km, once (GNIS and Ontario both name the border's narrows and bays)
const kept = [];
for (const p of places) {
  if (!R.inGrid(p.x, p.z, 50)) continue;
  const twin = kept.find((q) => q.name.toLowerCase() === p.name.toLowerCase() && q.kind === p.kind && Math.hypot(q.x - p.x, q.z - p.z) < 2000);
  if (twin) { if (!twin.origin && p.origin) twin.origin = p.origin; continue; }
  kept.push(p);
}

// --- portages --------------------------------------------------------------------------------------------------------------
const fixPortages = ((fixes && fixes.portages) || []).filter((p) => p.pts && p.pts.length >= 2 && p.launch && !p.launch.some((l) => !index.lakes[l.lake - 1]));
const portages = [...index.portages, ...fixPortages];
const T = usfsTrails(src, R.toLocal, inWild);
const pm = matchPortages(portages, T);
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(ax + dx * t - x, az + dz * t - z); };
const lineD = (p, x, z) => { let d = Infinity; for (let k = 1; k < p.pts.length; k++) d = Math.min(d, segD(x, z, p.pts[k - 1][0], p.pts[k - 1][1], p.pts[k][0], p.pts[k][1])); return d; };
// a proper name a drawn portage keeps ("Stairway Portage", "Prairie Portage"): one word or more and Portage, no dash
const proper = (n) => /\bportage\b/i.test(n || '') && !/[–-]|#|\d{3}/.test(n) && !/^portage$/i.test(n.trim());
const named = new Map(); // portage index → a named portage place (Height of Land Portage) within 150 m of its line
for (const pl of kept.filter((q) => q.kind === 'portage')) {
  let best = null;
  portages.forEach((p, i) => { const d = lineD(p, pl.x, pl.z); if (d < 150 && (!best || d < best.d)) best = { i, d }; });
  if (best && (!named.has(best.i) || named.get(best.i).d > best.d)) named.set(best.i, { ...best, place: pl });
  pl.matched = !!best;
}
const prRows = [], prStats = { matched: 0, officialRods: 0, renamed: 0, properKept: 0, placeNamed: 0, fragments: 0 };
const ratioOk = (r) => r >= 0.67 && r <= 1.5;
const matchedOf = new Map(pm.matched.map((m) => [m.i, m]));
portages.forEach((p, i) => {
  let m = matchedOf.get(i);
  const pl = named.get(i);
  // a lake-to-lake trail far longer or shorter than what is drawn here: this is a piece of it, or it of this (the trail's
  // name would be wrong for it); a trail of one name (the 4-Mile Portage drawn in part) still names it
  if (m) { const t0 = T[m.t], r = t0.rods / Math.max(1, p.rods); if (t0.lakeToLake && (r < 0.4 || r > 2.5)) { m = null; prStats.fragments++; } }
  if (!m && !pl) return;
  const t = m ? T[m.t] : null;
  const ends = p.launch.map((l) => R.lakeName(l.lake));
  let name = null;
  if (pl) { name = pl.place.name; prStats.placeNamed++; }
  else if (proper(p.name)) { prStats.properKept++; }
  else if (t) name = portageName(t.raw, ends);
  if (name && name !== p.name) prStats.renamed++;
  const ratio = t ? t.rods / Math.max(1, p.rods) : 0;
  const rods = t && ratioOk(ratio) && m.cover >= 0.6 ? t.rods : null;
  if (rods) prStats.officialRods++;
  if (t) prStats.matched++;
  const a = p.pts[0], b = p.pts[p.pts.length - 1];
  prRows.push([Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), t ? String(t.no) : null, name, rods, t ? t.cls : null]);
});
const matchedT = new Set(pm.matched.map((m) => m.t));
const l2l = T.map((t, ti) => [t, ti]).filter(([t]) => t.inside && t.lakeToLake);
const osmOnly = portages.map((p, i) => [p, i]).filter(([p, i]) => {
  const mid = p.pts[p.pts.length >> 1], [la, lo] = toLatLon(mid[0], mid[1]);
  return inWild(lo, la) && !pm.near.some((n) => n.some((q) => q.i === i && q.med < 300));
});
report.portages = {
  drawn: portages.length, usfsTrails: T.length, usfsLakeToLakeInWilderness: l2l.length, ...prStats,
  usfsLakeToLakeMatched: l2l.filter(([, ti]) => matchedT.has(ti)).length,
  usfsOnly: l2l.filter(([, ti]) => !pm.near[ti].length).map(([t]) => `${t.no} ${t.raw} (${t.rods} rods)`),
  usfsNoDrawnWithin60: l2l.filter(([, ti]) => !pm.near[ti].some((q) => q.med <= 60)).map(([t]) => `${t.no} ${t.raw} (${t.rods} rods)`),
  osmOnlyInWilderness: osmOnly.map(([p, i]) => `#${i} ${p.name} (${p.rods} rods)`),
};
log(`portages: ${prStats.matched} of ${portages.length} drawn traced by a USFS trail (official rods on ${prStats.officialRods}), ${prStats.placeNamed} named by a named portage, ${prStats.properKept} keep their own name; USFS lake-to-lake in the wilderness ${l2l.length}, matched ${report.portages.usfsLakeToLakeMatched}, none within 400 m ${report.portages.usfsOnly.length}; drawn in the wilderness with no USFS trail within 300 m: ${osmOnly.length}`);

// --- places, finished: the water each is on or by, and those the game names already --------------------------------------
const WATER_KINDS = new Set(['bay', 'narrows']);
const lakeNames = [], ln = new Map(), lnIdx = (n) => { if (n == null) return -1; if (!ln.has(n)) { ln.set(n, lakeNames.length); lakeNames.push(n); } return ln.get(n); };
const namedLakes = index.lakes.filter((l) => l && (l.displayName || l.name));
const placeRows = [];
let dupLake = 0, noWater = 0;
const KINDS = ['bay', 'point', 'island', 'narrows', 'summit', 'portage', 'place'];
for (const p of kept) {
  if (p.kind === 'portage' && p.matched) continue; // its drawn portage carries the name
  // the game's own lake of that name close by (a bay drawn as its own water, "Back Bay"): already named
  if (namedLakes.some((l) => (l.displayName || l.name).toLowerCase() === p.name.toLowerCase() && Math.hypot(l.cx - p.x, l.cz - p.z) < 6000)) { dupLake++; continue; }
  const r = WATER_KINDS.has(p.kind) ? 300 : p.kind === 'summit' || p.kind === 'place' ? 1500 : 600;
  const w = R.lakeXZ(p.x, p.z) ? { id: R.lakeXZ(p.x, p.z), d: 0 } : R.nearestWater(p.x, p.z, r, (id) => !!R.lakeName(id));
  if (!w && WATER_KINDS.has(p.kind)) { noWater++; continue; }
  const lake = w ? R.lakeName(w.id) : null;
  const row = [KINDS.indexOf(p.kind), p.name, Math.round(p.x), Math.round(p.z), lnIdx(lake), p.src === 'ontario' ? 1 : 0];
  if (p.origin) row.push(p.origin);
  placeRows.push(row);
}
const byKind = {}; for (const r of placeRows) byKind[KINDS[r[0]]] = (byKind[KINDS[r[0]]] || 0) + 1;
report.places = { gnis: src.gnis.features.length, ontario: src.ontario.features.length, candidates: places.length, kept: placeRows.length, byKind, sameAsALake: dupLake, noWater, portagesOnADrawnPortage: kept.filter((q) => q.kind === 'portage' && q.matched).length };
log(`places: ${placeRows.length} (${JSON.stringify(byKind)}); ${dupLake} already a lake's name, ${noWater} water names with no water near, ${report.places.portagesOnADrawnPortage} named portages given to drawn ones`);

// --- write ------------------------------------------------------------------------------------------------------------------
const cite = (k) => (src.fetched[k] && src.fetched[k].cite) || k;
const write = (file, doc) => { fs.writeFileSync(file, JSON.stringify(doc)); log(`wrote ${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`); };
write('src/names-sites.json', {
  about: 'd1 names (2026-10-26): the USFS number and lake or bay of each campsite, keyed by the site\'s rounded x:z. rows: [x, z, number, lakes index]. Made by scripts/names.mjs; read by src/names.js.',
  source: cite('campsites'), for: baked, lakes: siteLakes, rows: siteRows,
});
write('src/names-portages.json', {
  about: 'd1 names (2026-10-26): the USFS trail of each drawn portage, keyed by its ends. rows: [x0, z0, x1, z1, trail number, name (null: keep the drawn one), rods (null: the drawn length; the trail is longer or shorter than what is drawn), class 1-4]. Made by scripts/names.mjs; read by src/names.js.',
  source: cite('trails'), for: baked, rodsPerMile: 320, metresPerRod: RODS, rows: prRows,
});
write('src/names-places.json', {
  about: 'd1 names (2026-10-26): named bays, points, islands, narrows, summits and portages. rows: [kind index, name, x, z, lakes index (the water it is on or by, -1 none), source (0 GNIS, 1 Ontario), origin (Ontario\'s own note, when it has one)]. Falls and rapids are d1 rapids\' (src/rapids.json). Made by scripts/names.mjs; read by src/names.js.',
  source: [cite('gnis'), cite('ontario')], kinds: KINDS, lakes: lakeNames, rows: placeRows,
});
if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 1));
void titleWords;
