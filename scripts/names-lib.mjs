// d1 names (2026-10-26): the shared pieces of the names scripts. scripts/names.mjs makes the runtime tables
// (src/names-sites.json, src/names-portages.json, src/names-places.json); scripts/world-fixes.mjs adds the official
// campsites OpenStreetMap lacks and the clear USFS-only portages. A rebake (round D2) can call the same functions from
// bake.mjs: usfsSites + matchSites for the numbers and the missing sites, usfsTrails + matchPortages for the portages.
// Sources (data-cache/names, fetched by scripts/names-fetch.mjs): see docs/data-sources/places.md.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const RODS = 5.0292; // metres in a rod
export const SITE_NEAR = 100, SITE_FAR = 250; // m: a USFS site takes the OSM site within NEAR, or within FAR on the same water
export const PORTAGE_MATCH = 30; // m: the median distance from a drawn portage to a USFS trail that makes it that trail

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
export function loadSources(cacheDir) {
  const dir = path.join(cacheDir, 'names'), out = {};
  for (const k of ['campsites', 'trails', 'wilderness', 'gnis', 'ontario']) {
    const f = path.join(dir, `${k}.json`);
    if (!fs.existsSync(f)) throw new Error(`${f} is missing: run node scripts/names-fetch.mjs first`);
    out[k] = readJson(f);
  }
  const rec = path.join(dir, 'fetched.json');
  out.fetched = fs.existsSync(rec) ? readJson(rec) : {};
  return out;
}

// --- the release: its index and its fine tiles (lake id and signed shore distance per 10 m cell) --------------------
export function releaseReader(dataDir) {
  const index = readJson(path.join(dataDir, 'index.json'));
  const g = index.grid, p = index.proj, T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, n = SIDE * SIDE;
  const tiles = new Map();
  const tileOf = (tx, ty) => {
    const k = ty * g.ntx + tx;
    let t = tiles.get(k);
    if (t === undefined) {
      try {
        const raw = zlib.gunzipSync(fs.readFileSync(path.join(dataDir, 'tiles', `${tx}_${ty}.bin`)));
        const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
        t = { lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n) };
      } catch { t = null; }
      if (tiles.size > 500) tiles.clear();
      tiles.set(k, t);
    }
    return t;
  };
  const cellOf = (i, j) => {
    if (i < 0 || j < 0 || i >= g.width || j >= g.height) return null;
    const t = tileOf((i / T) | 0, (j / T) | 0);
    return t ? [t, ((j % T) + HALO) * SIDE + (i % T) + HALO] : null;
  };
  const ci = (x) => Math.floor((x - g.originX) / g.cell), cj = (z) => Math.floor((z - g.originZ) / g.cell);
  const lakeAt = (i, j) => { const c = cellOf(i, j); return c ? c[0].lake[c[1]] : 0; };
  const sdAt = (i, j) => { const c = cellOf(i, j); return c ? c[0].sd[c[1]] / 10 : 3000; };
  const lakeXZ = (x, z) => lakeAt(ci(x), cj(z));
  const sdXZ = (x, z) => sdAt(ci(x), cj(z));
  // the nearest water cell's lake within r metres: { id, d, x, z } or null
  const nearestWater = (x, z, r, ok = null) => {
    const i0 = ci(x), j0 = cj(z), R = Math.ceil(r / g.cell);
    let best = null;
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const d = Math.hypot(di, dj) * g.cell; if (d > r || (best && d >= best.d)) continue;
      const id = lakeAt(i0 + di, j0 + dj); if (!id || (ok && !ok(id))) continue;
      best = { id, d, x: g.originX + (i0 + di + 0.5) * g.cell, z: g.originZ + (j0 + dj + 0.5) * g.cell };
    }
    return best;
  };
  const lake = (id) => (id > 0 ? index.lakes[id - 1] : null);
  const lakeName = (id) => { const l = lake(id); return l ? l.displayName || l.name || null : null; };
  const toLocal = (lat, lon) => [(lon - p.lon0) * p.mPerDegLon, -(lat - p.lat0) * p.mPerDegLat];
  const inGrid = (x, z, m = 20) => x > g.originX + m && z > g.originZ + m && x < g.originX + g.width * g.cell - m && z < g.originZ + g.height * g.cell - m;
  return { index, grid: g, ci, cj, lakeAt, sdAt, lakeXZ, sdXZ, nearestWater, lake, lakeName, toLocal, inGrid };
}

// --- the wilderness line -----------------------------------------------------------------------------------------------
export function wildernessTest(fc) {
  const polys = [];
  for (const f of fc.features) {
    const gm = f.geometry; if (!gm) continue;
    for (const poly of gm.type === 'Polygon' ? [gm.coordinates] : gm.coordinates) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of poly[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      polys.push({ rings: poly, box: [x0, y0, x1, y1] });
    }
  }
  return (lon, lat) => {
    for (const { rings, box } of polys) {
      if (lon < box[0] || lon > box[2] || lat < box[1] || lat > box[3]) continue;
      let ins = false;
      for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi) ins = !ins;
      }
      if (ins) return true;
    }
    return false;
  };
}

// --- campsites -----------------------------------------------------------------------------------------------------------
// "Basswood Lake - Back Bay" → "Basswood Lake – Back Bay" (the game's dash)
export const siteLakeWords = (s) => String(s || '').replace(/\s+-\s+/g, ' – ').replace(/\s+/g, ' ').trim();
export function usfsSites(src, toLocal) {
  return src.campsites.features.filter((f) => f.geometry && f.properties.STATUS !== 'closed').map((f) => {
    const [lon, lat] = f.geometry.coordinates, [x, z] = toLocal(lat, lon), q = f.properties;
    return { no: q.CSITENO, lake: siteLakeWords(q.LAKE_NAME), x, z, lat, lon, district: q.District, dow: q.DOWNUM };
  });
}
// One-to-one pairs of USFS sites (u) and the release's sites (s), nearest first: within SITE_NEAR always, out to
// SITE_FAR when both are on the same water (sameWater(u, s)). Returns { pairs: [{ u, s, d }], missing: [u...] (no
// release site within SITE_FAR at all), unmatched: [u...], spare: [s...] }.
export function matchSites(usfs, sites, sameWater = () => false) {
  const G = 500, grid = new Map();
  sites.forEach((c, i) => { const k = `${Math.floor(c.x / G)}:${Math.floor(c.z / G)}`; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); });
  const cands = [], anyNear = new Uint8Array(usfs.length);
  usfs.forEach((u, ui) => {
    const gx = Math.floor(u.x / G), gz = Math.floor(u.z / G);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const si of grid.get(`${gx + dx}:${gz + dz}`) || []) {
      const s = sites[si], d = Math.hypot(s.x - u.x, s.z - u.z);
      if (d > SITE_FAR) continue;
      anyNear[ui] = 1;
      cands.push({ u: ui, s: si, d });
    }
  });
  cands.sort((a, b) => a.d - b.d);
  const usedU = new Uint8Array(usfs.length), usedS = new Uint8Array(sites.length), pairs = [];
  for (const c of cands) {
    if (usedU[c.u] || usedS[c.s]) continue;
    if (c.d > SITE_NEAR && !sameWater(usfs[c.u], sites[c.s])) continue;
    usedU[c.u] = 1; usedS[c.s] = 1; pairs.push(c);
  }
  const missing = [], unmatched = [], spare = [];
  usfs.forEach((u, i) => { if (!usedU[i]) (anyNear[i] ? unmatched : missing).push(i); });
  sites.forEach((s, i) => { if (!usedS[i]) spare.push(i); });
  return { pairs, missing, unmatched, spare };
}

// --- portages ----------------------------------------------------------------------------------------------------------
// The USFS trail numbers in the box, hiker-only TERRA: { no, raw, cls, rods, lines (local metres), inside (the BWCAW),
// lakeToLake (a name of two ends: "LAKE ONE-CONFUSION", "BREWIS TO HARBOR", "KORB/RIVER") }
export function usfsTrails(src, toLocal, inWild) {
  const by = new Map();
  for (const f of src.trails.features) {
    const q = f.properties, gm = f.geometry; if (!gm) continue;
    let t = by.get(q.trail_no);
    if (!t) by.set(q.trail_no, (t = { no: q.trail_no, raw: (q.trail_name || '').trim(), cls: new Map(), miles: 0, lines: [] }));
    t.miles += q.gis_miles || 0;
    t.cls.set(q.trail_class, (t.cls.get(q.trail_class) || 0) + (q.gis_miles || 0));
    for (const line of gm.type === 'MultiLineString' ? gm.coordinates : [gm.coordinates]) t.lines.push(line.map(([lon, lat]) => toLocal(lat, lon)));
    if (t.lon == null && gm.coordinates.length) { const c0 = gm.type === 'MultiLineString' ? gm.coordinates[0][0] : gm.coordinates[0]; t.lon = c0[0]; t.lat = c0[1]; }
  }
  for (const t of by.values()) {
    t.cls = Number([...t.cls].sort((a, b) => b[1] - a[1])[0][0]) || null; // the class most of its length is
    t.rods = Math.max(1, Math.round(t.miles * 320));
    t.inside = inWild(t.lon, t.lat);
    t.lakeToLake = /[A-Z]-[A-Z]|\/| TO /.test(t.raw);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const l of t.lines) for (const [x, z] of l) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    t.box = [x0, z0, x1, z1];
    t.samples = resample(t.lines, 10);
  }
  return [...by.values()];
}
// points every `step` metres along each line
export function resample(lines, step) {
  const out = [];
  for (const pts of lines) {
    out.push(pts[0]);
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], L = Math.hypot(x1 - x0, z1 - z0);
      let d = step - carry;
      while (d <= L) { out.push([x0 + ((x1 - x0) * d) / L, z0 + ((z1 - z0) * d) / L]); d += step; }
      carry = L - (d - step);
    }
    out.push(pts[pts.length - 1]);
  }
  return out;
}
const median = (a) => { if (!a.length) return Infinity; const s = [...a].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// distance from p to the nearest of pts (a 20 m hash of them, made once per set)
function nearIndex(pts, G = 40) {
  const grid = new Map();
  for (const p of pts) { const k = `${Math.floor(p[0] / G)}:${Math.floor(p[1] / G)}`; let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(p); }
  return (x, z, r = 400) => {
    const R = Math.ceil(r / G), gx = Math.floor(x / G), gz = Math.floor(z / G);
    let best = Infinity;
    for (let ring = 0; ring <= R; ring++) {
      for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        for (const [px, pz] of grid.get(`${gx + dx}:${gz + dz}`) || []) { const d = Math.hypot(px - x, pz - z); if (d < best) best = d; }
      }
      if (best <= ring * G) break;
    }
    return best;
  };
}
// Each drawn portage (pts in local metres) against the USFS trails: the trail whose samples lie nearest along it (the
// median of its 10 m samples' distances to that trail) when that is within PORTAGE_MATCH, and how much of the trail it
// covers. Returns [{ i, t (trail index), med, cover }] for the matched ones, and per trail the drawn portages near it.
export function matchPortages(portages, trails) {
  const idx = trails.map((t) => nearIndex(t.samples));
  const out = [], near = trails.map(() => []);
  portages.forEach((p, i) => {
    const S = resample([p.pts], 10);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of p.pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    let best = null;
    trails.forEach((t, ti) => {
      const [a0, b0, a1, b1] = t.box;
      if (a1 < x0 - 400 || a0 > x1 + 400 || b1 < z0 - 400 || b0 > z1 + 400) return;
      const med = median(S.map(([x, z]) => idx[ti](x, z)));
      if (med < 400) near[ti].push({ i, med });
      if (med <= PORTAGE_MATCH && (!best || med < best.med)) best = { i, t: ti, med };
    });
    if (best) {
      // how much of the trail this portage covers: its samples within 40 m of the drawn line
      const back = nearIndex(S), T = trails[best.t].samples;
      best.cover = T.filter(([x, z]) => back(x, z, 80) <= 40).length / T.length;
      out.push(best);
    }
  });
  return { matched: out, near };
}

// --- portage names ---------------------------------------------------------------------------------------------------------
// The USFS names are short, capitalised and cut at 30 characters ("LAKE ONE-CONFUSION", "KAW RIVER CAREFREE TO KAW
// RI", "N KAW RIVER/N KAW RIVER GREE"). Each end is matched to the water at that end of the drawn portage where it can
// be (its name then is the game's own lake name: "Confusion" → "Confusion Lake"), else written out in title case with
// the common short forms expanded. A cut name whose end can't be read stays the drawn portage's name (null here).
const SHORT = { KAW: 'Kawishiwi', KAWISH: 'Kawishiwi', KEK: 'Kekekabic', LK: 'Lake', N: 'North', S: 'South', E: 'East', W: 'West', NO: 'North', MT: 'Mount', LAC: 'Lac', LA: 'La' };
const RIVERISH = /^(R|RI|RIV|RIVE|RVER)$/;
const LOWER = new Set(['to', 'of', 'the', 'and', 'la', 'de']);
export function titleWords(s) {
  const w = String(s).trim().split(/\s+/).filter(Boolean);
  return w.map((x, k) => {
    if (k === w.length - 1 && RIVERISH.test(x) && k > 0) return 'River';
    if (SHORT[x] && (x.length > 1 || k === 0)) return SHORT[x];
    const t = x.toLowerCase().replace(/(^|[-'’])([a-z])/g, (m, a, b) => a + b.toUpperCase());
    return k > 0 && LOWER.has(x.toLowerCase()) && x.length > 1 ? x.toLowerCase() : t;
  }).join(' ');
}
const lev = (a, b) => {
  const m = a.length, n = b.length; if (Math.abs(m - n) > 3) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
};
const norm = (s) => String(s || '').toLowerCase().replace(/\b(lake|lakes|river|creek|pond|bay|the|lac)\b/g, '').replace(/[^a-z0-9]+/g, '');
export function portageName(raw, endNames) {
  const cut = raw.length >= 28; // (the field holds about 30 characters: "WHEELBARROW UPPER TO WHEELBARR", "KAW RIVER CAREFREE TO KAW RI")
  // the two ends: "A-B" (not "4-MILE": the left side must be a word), "A/B", "A TO B"
  const parts = raw.split(/(?<=[A-Z0-9.'][A-Z0-9.' ]{2,})-(?=[A-Z])|\s*\/\s*|\s+TO\s+/).map((s) => s.trim()).filter(Boolean);
  const lakes = endNames.filter(Boolean);
  if (parts.length !== 2) {
    if (parts.length !== 1 || cut) return null;
    // one name ("SIOUX RIVER", "ELM PORTAGE"): the water at an end when it is that ("Little Indian Sioux River")
    const pn = norm(titleWords(parts[0]));
    return (pn.length >= 4 && lakes.find((l) => norm(l) !== pn && (norm(l).endsWith(pn) || norm(l).startsWith(pn)))) || titleWords(parts[0]);
  }
  const out = parts.map((p, k) => {
    const pn = norm(titleWords(p));
    const hit = lakes.find((l) => norm(l) === pn) || (pn.length >= 4 && lakes.find((l) => norm(l).startsWith(pn) || pn.startsWith(norm(l)) && norm(l).length >= 4))
      || (pn.length >= 5 && lakes.find((l) => norm(l).endsWith(pn))) // (SIOUX RIVER: the Little Indian Sioux River)
      || (pn.length >= 5 && lakes.find((l) => lev(norm(l), pn) <= Math.max(1, Math.floor(pn.length / 6)))); // (BALE EAGLE: Bald Eagle Lake)
    if (hit) return hit;
    if (cut && k === parts.length - 1) { // the end was cut off and isn't a lake we know: its last word goes unless it reads
      const w = p.split(/\s+/), last = w[w.length - 1];
      if (RIVERISH.test(last) && w.length > 1) return titleWords(p);
      return w.length > 1 ? titleWords(w.slice(0, -1).join(' ')) : null;
    }
    return titleWords(p);
  });
  if (out.some((x) => !x)) return null;
  if (out[0] === out[1]) { // (Mulligan Pond – Mulligan Lake, Fourtown Lake – Fourtown Pond: both read as the one lake)
    const t = parts.map(titleWords);
    if (t[0] === t[1] || cut) return out[0];
    const own = t.map((x) => (/\b(Lake|Lakes|Pond|River|Creek|Bay)$/.test(x) ? x : out[0]));
    return own[0] === own[1] ? out[0] : `${own[0]} – ${own[1]}`;
  }
  return `${out[0]} – ${out[1]}`;
}

// --- place names -----------------------------------------------------------------------------------------------------------
// GNIS feature classes and Ontario entity types → the game's kinds. Falls and rapids are left to d1 rapids (rapids.json);
// lakes, streams and towns the game names already; the pictograph places (a plain name at most, and here none) and
// burial names are left out, as are classes the game has nothing to show for.
export const GNIS_KIND = { Bay: 'bay', Cape: 'point', Island: 'island', Channel: 'narrows', Gut: 'narrows', Gap: 'narrows', Bend: 'narrows', Valley: 'narrows', Summit: 'summit', Range: 'summit', Beach: 'point' };
export const ONTARIO_KIND = { Bay: 'bay', Arm: 'bay', Island: 'island', Point: 'point', Narrows: 'narrows', Elbow: 'narrows', 'Channel (3)': 'narrows', Portage: 'portage', Mountain: 'summit', Mount: 'summit', 'Bluff (2)': 'summit', Hill: 'summit' };
export const PLACE_SKIP = /picture|pictured|painted|warrior|grave|burial/i;
export const GNIS_PLACES = { 'Prairie Portage': 'portage', 'Forest Center': 'place' }; // the populated places worth a name: a portage and a ghost town
