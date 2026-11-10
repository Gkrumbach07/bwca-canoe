#!/usr/bin/env node
// The story layer's places against the release the game runs (docs/build/campaign-design.md §7.1; stream L, Round 1).
// Node, light (two index files and a handful of tiles), as world-fixes.mjs does it: every place, site and portage the
// story names is found in the release by name and nearest x/z, never by the doc's v3 index, and its `resolved` block is
// written (src/story-places.json `resolved`, src/walt-sites.js RESOLVED). The runtime reads only those, and only for the
// release they were made for (`for`: the release's bake time).
//
//   node scripts/story-places.mjs [--write] [--json] [--v3 <dir>] [--data <dir>]
//     --v3    the data-v3 release the docs' ids are from (default: public/data, in this checkout or the main one)
//     --data  the release the game runs (default: public-data-v9)
//
// The checks (90-game-needs §13, 10-notebook §9, 03-places §9), each PASS / FAIL; exit 1 on a FAIL:
//   sites      every starred site found on its own lake within 250 m of the v3 site, with a landing
//   gull       no starred stone within 2 km of Gull's landing (−19835, 26740)
//   check 3    P289 (64 r), P645 (140 r), P188 (185 r) found by name and x/z, their rods as the game shows them (names.js
//              applies the USFS rods), each within a day's reach of its outfitter (≤ 30 km from the entry point)
//   check 4    the 205/50 pair unique: exactly one carry of 205 rods and one of 50 that share a lake, and they are P255+P256
//   check 11   P210's Big Moose end 2–4.5 km from EP 8 (Moose River South)
//   crews      the crews' landing on Bald Eagle's west shore: the crib in the water, the landing rock at the edge, the
//              pine, the grade and the second pine on land; no campsite within 600 m and no portage within 1.2 km (§1a:
//              "the quietest stretch of that shore")
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const WRITE = argv.includes('--write'), JSON_OUT = argv.includes('--json');
// the data lives in the main checkout (a worktree has none): look here first, then there
const MAIN = (() => { try { return path.resolve(execSync('git rev-parse --git-common-dir', { cwd: ROOT }).toString().trim(), '..'); } catch { return ROOT; } })();
const find = (rel) => [path.resolve(ROOT, rel), path.resolve(MAIN, rel)].find((p) => fs.existsSync(p)) || path.resolve(ROOT, rel);
const V3 = find(arg('--v3', 'public/data')), DATA = find(arg('--data', 'public-data-v9'));
const report = { checks: {} };
const result = (name, pass, more = {}) => { report.checks[name] = { pass: pass === 'warn' ? 'warn' : !!pass, ...more }; if (!JSON_OUT) console.log(pass === 'warn' ? 'WARN' : pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };

const v3 = JSON.parse(fs.readFileSync(path.join(V3, 'index.json'), 'utf8'));
const v9 = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
if (v3.version !== 3) throw new Error(`${V3} is not the data-v3 release (version ${v3.version})`);
const FOR = v9.source && v9.source.baked;
const lakeName = (id) => { const l = id > 0 ? v9.lakes[id - 1] : null; return l ? l.displayName || l.name || null : null; };
const lakeIds = (name) => v9.lakes.filter((l) => l && (l.name === name || l.displayName === name)).map((l) => l.id);
const r1 = (v) => Math.round(v * 10) / 10;

// --- the release's tiles: lake id and signed shore distance (dm; < 0 is water) per 10 m cell ---------------------------
const g = v9.grid, T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, NC = SIDE * SIDE;
const tiles = new Map();
function tileAt(tx, ty) {
  const k = ty * g.ntx + tx;
  if (tiles.has(k)) return tiles.get(k);
  let t = null;
  try {
    const raw = zlib.gunzipSync(fs.readFileSync(path.join(DATA, 'tiles', `${tx}_${ty}.bin`)));
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    t = { h: new Int16Array(buf, 0, NC), lake: new Uint16Array(buf, NC * 2, NC), sd: new Int16Array(buf, NC * 4, NC) };
  } catch { t = null; }
  tiles.set(k, t);
  return t;
}
function cell(x, z) {
  const i = Math.floor((x - g.originX) / g.cell), j = Math.floor((z - g.originZ) / g.cell);
  if (i < 0 || j < 0 || i >= g.width || j >= g.height) return null;
  const t = tileAt((i / T) | 0, (j / T) | 0); if (!t) return null;
  const c = ((j % T) + HALO) * SIDE + (i % T) + HALO;
  return { lake: t.lake[c], sd: t.sd[c] / 10, h: t.h[c] / 10 };
}
// bilinear shore distance (m; < 0 water), by the cell centres
function sdAt(x, z) {
  const fx = (x - g.originX) / g.cell - 0.5, fz = (z - g.originZ) / g.cell - 0.5, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const at = (a, b) => { const c = cell(g.originX + (a + 0.5) * g.cell, g.originZ + (b + 0.5) * g.cell); return c ? c.sd : 3000; };
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}
// the nearest point of a lake's shoreline to (x, z), within reach: { x, z, n: [nx, nz] inland, u: [ux, uz] along }
function shoreOf(x, z, ids, reach = 300) {
  let best = null, bd = Infinity;
  for (let dz = -reach; dz <= reach; dz += g.cell) for (let dx = -reach; dx <= reach; dx += g.cell) {
    const px = x + dx, pz = z + dz, c = cell(px, pz);
    if (!c || c.sd >= 0 || !ids.includes(c.lake)) continue;
    const d = Math.hypot(dx, dz) + Math.abs(c.sd) * 0; // the water cell nearest the asked spot
    if (d < bd) { bd = d; best = [px, pz]; }
  }
  if (!best) return null;
  // walk inland along the shore distance's gradient to its zero
  let [px, pz] = best;
  const grad = (a, b) => { const e = 4; const gx = sdAt(a + e, b) - sdAt(a - e, b), gz = sdAt(a, b + e) - sdAt(a, b - e), L = Math.hypot(gx, gz) || 1; return [gx / L, gz / L]; };
  for (let k = 0; k < 40; k++) { const s = sdAt(px, pz); if (Math.abs(s) < 0.15) break; const [nx, nz] = grad(px, pz); px -= nx * s * 0.8; pz -= nz * s * 0.8; }
  const n = grad(px, pz);
  return { x: r1(px), z: r1(pz), n: [+n[0].toFixed(4), +n[1].toFixed(4)], u: [+(-n[1]).toFixed(4), +n[0].toFixed(4)], off: Math.round(Math.hypot(px - x, pz - z)) };
}

// --- campsites: a v3 id → the v9 site on that lake, and its landing (camp-access.json's way up, its water end) --------
const access = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'camp-access.json'), 'utf8')); } catch { return null; } })();
const accessOk = access && access.for === FOR;
function landingOf(c) {
  const e = accessOk ? access.sites[`${Math.round(c.x)}:${Math.round(c.z)}`] : null;
  if (e && e.l && e.l.length >= 4) {
    const rx = Math.round(c.x), rz = Math.round(c.z), n = e.l.length;
    const L = [rx + e.l[n - 2] / 10, rz + e.l[n - 1] / 10], P = [rx + e.l[n - 4] / 10, rz + e.l[n - 3] / 10];
    const d = Math.hypot(P[0] - L[0], P[1] - L[1]) || 1;
    return { landing: [r1(L[0]), r1(L[1])], up: [+((P[0] - L[0]) / d).toFixed(4), +((P[1] - L[1]) / d).toFixed(4)], how: 'way' };
  }
  const s = shoreOf(c.x, c.z, c.lake ? [c.lake] : [], 120);
  return s ? { landing: [s.x, s.z], up: s.n, how: 'shore' } : null;
}
function siteOf(v3id, lake, reach = 250) {
  const m = /^C(\d+)$/.exec(v3id); if (!m) return null;
  const o = v3.campsites[+m[1]]; if (!o) return { why: `no v3 ${v3id}` };
  const ids = lake ? lakeIds(lake) : [];
  let best = null, bd = Infinity;
  v9.campsites.forEach((c, i) => {
    const d = Math.hypot(c.x - o.x, c.z - o.z);
    if (d > reach) return;
    const same = !ids.length || ids.includes(c.lake);
    const score = d + (same ? 0 : 1000);
    if (score < bd) { bd = score; best = { i, c, d: Math.round(d), same }; }
  });
  if (!best) return { why: `no v9 site within ${reach} m of v3 ${v3id} (${Math.round(o.x)}, ${Math.round(o.z)})` };
  if (!best.same) return { why: `the nearest v9 site to ${v3id} is on ${lakeName(best.c.lake)}, not ${lake}` };
  return { site: best.i, x: r1(best.c.x), z: r1(best.c.z), lakeId: best.c.lake, d: best.d };
}

// --- portages: a v3 id → the v9 carry by its ends; the rods the game shows (names.js's USFS rods) ----------------------
const namesP = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'names-portages.json'), 'utf8')); } catch { return null; } })();
const key2 = (x, z) => `${Math.round(x)}:${Math.round(z)}`;
const usfs = new Map();
if (namesP) for (const r of namesP.rows) { usfs.set(`${key2(r[0], r[1])}:${key2(r[2], r[3])}`, r); usfs.set(`${key2(r[2], r[3])}:${key2(r[0], r[1])}`, r); }
function shownRods(p) { const a = p.pts[0], b = p.pts[p.pts.length - 1], r = usfs.get(`${key2(a[0], a[1])}:${key2(b[0], b[1])}`); return r && r[6] && !p.posted ? r[6] : p.rods; }
function portageOf(v3id) {
  const m = /^P(\d+)$/.exec(v3id); if (!m) return null;
  const o = v3.portages[+m[1]]; if (!o) return { why: `no v3 ${v3id}` };
  const a = o.pts[0], b = o.pts[o.pts.length - 1];
  let best = -1, bd = Infinity;
  v9.portages.forEach((q, j) => {
    const qa = q.pts[0], qb = q.pts[q.pts.length - 1];
    const d = Math.min(Math.hypot(qa[0] - a[0], qa[1] - a[1]) + Math.hypot(qb[0] - b[0], qb[1] - b[1]), Math.hypot(qb[0] - a[0], qb[1] - a[1]) + Math.hypot(qa[0] - b[0], qa[1] - b[1]));
    if (d < bd) { bd = d; best = j; }
  });
  if (best < 0 || bd > 400) return { why: `no v9 carry near v3 ${v3id} (${o.name})` };
  const q = v9.portages[best];
  return { i: best, name: q.name, rods: shownRods(q), drawnRods: q.rods, v3name: o.name, off: Math.round(bd), launch: (q.launch || []).map((l) => ({ x: l.x, z: l.z, lake: l.lake, name: lakeName(l.lake) })) };
}

// shore points of a lake round (x, z): every water cell of it with land next to it, walked onto the water line
function shoreCands(x, z, ids, reach) {
  const out = [], seen = new Set();
  for (let dz = -reach; dz <= reach; dz += g.cell) for (let dx = -reach; dx <= reach; dx += g.cell) {
    const px = x + dx, pz = z + dz, c = cell(px, pz);
    if (!c || c.sd >= 0 || !ids.includes(c.lake) || Math.hypot(dx, dz) > reach) continue;
    if (![[g.cell, 0], [-g.cell, 0], [0, g.cell], [0, -g.cell]].some(([a, b]) => { const q = cell(px + a, pz + b); return q && q.sd >= 0; })) continue;
    const s = shoreOf(px, pz, ids, g.cell);
    if (!s) continue;
    const k = `${Math.round(s.x / 4)}:${Math.round(s.z / 4)}`; if (seen.has(k)) continue; seen.add(k);
    s.off = Math.round(Math.hypot(s.x - x, s.z - z));
    out.push(s);
  }
  return out;
}
// a place's props and lanes from an anchor s ({ x, z, n inland, u along }) → { R: { props, lanes }, bad: [why] }
function stage(pl, s) {
  const R = { props: {}, lanes: [] }, bad = [];
  const P = (a, b) => [r1(s.x + s.u[0] * a + s.n[0] * b), r1(s.z + s.u[1] * a + s.n[1] * b)];
  const facing = Math.atan2(-s.n[0], -s.n[1]); // the heading toward the water (atan2(x, z), as the game's headings)
  for (const pr of pl.props || []) if (pr.at) { const [x, z] = P(pr.at[0], pr.at[1]); R.props[pr.id] = { x, z, heading: +facing.toFixed(4) }; }
  for (const ln of pl.lanes || []) {
    const from = R.props[ln.from]; if (!from) { bad.push(`lane from ${ln.from}?`); continue; }
    const dx = ln.toward[0] - from.x, dz = ln.toward[1] - from.z, d = Math.hypot(dx, dz) || 1;
    const L = { a: [from.x, from.z], b: [r1(from.x + (dx / d) * ln.len), r1(from.z + (dz / d) * ln.len)], r: ln.r, dir: [+(dx / d).toFixed(4), +(dz / d).toFixed(4)] };
    for (let t = 0; t <= ln.len; t += 5) { const v = sdAt(from.x + (dx / d) * t, from.z + (dz / d) * t); if (!(v > 2)) { bad.push(`lane ${R.lanes.length} wet at ${t} m (${v.toFixed(1)})`); break; } }
    R.lanes.push(L);
  }
  for (const pr of pl.props || []) {
    if (pr.at || pr.lane == null) continue;
    const L = R.lanes[pr.lane]; if (!L) { bad.push(`${pr.id} on lane ${pr.lane}?`); continue; }
    const side = pr.side || 0, x = L.a[0] + L.dir[0] * pr.along - L.dir[1] * side, z = L.a[1] + L.dir[1] * pr.along + L.dir[0] * side;
    R.props[pr.id] = { x: r1(x), z: r1(z), heading: +Math.atan2(-L.dir[0], -L.dir[1]).toFixed(4) };
  }
  for (const pr of pl.props || []) {
    const q = R.props[pr.id]; if (!q) continue;
    q.sd = +sdAt(q.x, q.z).toFixed(1);
    const want = pr.wet === true ? q.sd < -0.4 : pr.wet === 'edge' ? q.sd > -3 && q.sd < 2.5 : q.sd > 2;
    if (!want) bad.push(`${pr.id} at ${q.sd} m from the water line`);
  }
  return { R, bad };
}

// =========================================================================================================================
const placesF = path.join(ROOT, 'src', 'story-places.json');
const PJ = JSON.parse(fs.readFileSync(placesF, 'utf8'));
const sitesMod = await import(pathToFileURL(path.join(ROOT, 'src', 'walt-sites.js')).href);
const OUT = { for: FOR, v: 'v9', places: {}, portages: {} }, SITES = { for: FOR, v: 'v9', sites: {} };

// --- the starred sites ----------------------------------------------------------------------------------------------
{
  const bad = [], far = [], held = [], notes = [];
  for (const r of sitesMod.WALT_SITES) {
    if (/^P\d+$/.test(r.v3)) { // a carry's landing rock (NB47 Little John: P309)
      const q = portageOf(r.v3);
      const ids = lakeIds(r.lake);
      if (!q || q.why) { bad.push(`${r.id}: ${q ? q.why : 'no id'}`); continue; }
      let L = q.launch.find((l) => ids.includes(l.lake)), how = 'carry';
      // (v9 may end the carry on a water of no name beside the lake: then the lake's shore nearest either end, within 1.5 km)
      if (!L) {
        let best = null;
        for (const e of q.launch) { const sh = shoreOf(e.x, e.z, ids, 1500); if (sh && (!best || sh.off < best.off)) best = { ...sh, lake: ids[0] }; }
        if (best) { L = { x: best.x, z: best.z, lake: best.lake }; how = 'carry-near'; notes.push(`${r.id}: ${r.v3} ends on ${q.launch.map((l) => l.name || 'water of no name').join(' / ')} in v9; the stone stands on ${r.lake}'s shore ${best.off} m from its end`); }
      }
      if (!L) { bad.push(`${r.id}: no ${r.lake} end on ${r.v3}`); continue; }
      const s = shoreOf(L.x, L.z, [L.lake], 60);
      SITES.sites[r.id] = { x: L.x, z: L.z, landing: s ? [s.x, s.z] : [L.x, L.z], up: s ? s.n : [0, 1], lakeId: L.lake, portage: q.i, how };
      continue;
    }
    if (r.hold) { held.push(`${r.id}: ${r.hold}`); continue; } // (a site the writers must pick again: no stone until then)
    let s = siteOf(r.v3, r.lake);
    for (const alt of r.alt || []) if (s && s.why) s = siteOf(alt, r.lake);
    if (!s || s.why) { bad.push(`${r.id}: ${s ? s.why : 'no id'}`); continue; }
    const L = landingOf(v9.campsites[s.site]);
    if (!L) { bad.push(`${r.id}: no landing for v9 site ${s.site}`); continue; }
    SITES.sites[r.id] = { x: s.x, z: s.z, landing: L.landing, up: L.up, lakeId: s.lakeId, site: s.site, how: L.how, d: s.d };
  }
  result('sites: every starred site placed on its own lake, with a landing', bad.length === 0, { placed: Object.keys(SITES.sites).length, of: sitesMod.WALT_SITES.length, bad, held, notes });
  const GULL = [-19835, 26740];
  for (const [id, q] of Object.entries(SITES.sites)) { const d = Math.hypot(q.landing[0] - GULL[0], q.landing[1] - GULL[1]); if (d < 2000) far.push(`${id}: ${Math.round(d)} m`); }
  result('gull: no starred stone within 2 km of Gull\'s landing', far.length === 0, { near: far });
}

// --- the portages the story names -------------------------------------------------------------------------------------
{
  const bad = [], shown = [];
  for (const p of PJ.portages || []) {
    const q = portageOf(p.v3);
    if (!q || q.why) { bad.push(`${p.id}: ${q ? q.why : 'no id'}`); continue; }
    OUT.portages[p.id] = { i: q.i, name: q.name, rods: q.drawnRods, shown: q.rods, off: q.off, ends: q.launch.map((l) => [l.x, l.z, l.lake]) };
    if (p.name && q.name !== p.name) bad.push(`${p.id}: named "${q.name}" in v9, not "${p.name}"`);
    if (p.rods && q.drawnRods !== p.rods) bad.push(`${p.id}: drawn ${q.drawnRods} rods in v9, not ${p.rods}`);
    if (p.rods && q.rods !== p.rods) shown.push(`${p.id} (${q.name}): the sign and the trip log say ${q.rods} rods (names.js, the USFS figure), Walt's number is ${p.rods}`);
  }
  // check 3: the back cover's three, found, and within a day's reach of their outfitter
  const c3 = [], dist = {};
  for (const id of ['bc.64', 'bc.140', 'bc.186']) {
    const p = PJ.portages.find((x) => x.id === id), q = OUT.portages[id];
    if (!q) { c3.push(`${id}: not found`); continue; }
    const ep = v9.entryPoints.find((e) => e.ep === p.reach), m = v9.portages[q.i].pts[0];
    const km = ep ? Math.hypot(m[0] - ep.x, m[1] - ep.z) / 1000 : Infinity;
    dist[id] = { i: q.i, ep: p.reach, km: +km.toFixed(1) };
    if (!(km <= 30)) c3.push(`${id}: ${km.toFixed(1)} km from EP ${p.reach}`);
  }
  result('check 3: P289 / P645 / P188 found by name and x/z, rods as drawn, within a day of their outfitter', c3.length === 0 && !bad.some((b) => /^bc\./.test(b)), { dist, bad: [...c3, ...bad.filter((b) => /^bc\./.test(b))] });
  // check 4: the 205/50 pair unique, by the rods as drawn (the release's own); as shown is the WARN below
  const R = v9.portages.map((p) => p.rods);
  const lakesOf = (p) => new Set((p.launch || []).map((l) => l.lake));
  const pairs = [];
  v9.portages.forEach((a, i) => { if (R[i] !== 205) return; const la = lakesOf(a); v9.portages.forEach((b, j) => { if (R[j] !== 50 || i === j) return; for (const l of lakesOf(b)) if (la.has(l)) { pairs.push([i, j]); break; } }); });
  const want = [OUT.portages['pair.205'] && OUT.portages['pair.205'].i, OUT.portages['pair.50'] && OUT.portages['pair.50'].i];
  result('check 4: the 205/50 pair is unique to P255 + P256', pairs.length === 1 && pairs[0][0] === want[0] && pairs[0][1] === want[1], { pairs, want });
  // check 11: P210's Big Moose end and EP 8
  {
    const p = PJ.portages.find((x) => x.id === 'nb36.p210'), q = OUT.portages['nb36.p210'], ep = v9.entryPoints.find((e) => e.ep === p.ep);
    const ids = lakeIds(p.end), L = q && v9.portages[q.i].launch.find((l) => ids.includes(l.lake));
    const km = L && ep ? Math.hypot(L.x - ep.x, L.z - ep.z) / 1000 : null;
    result('check 11: P210\'s Big Moose end is about 3 km from EP 8', km != null && km >= p.km[0] && km <= p.km[1], { i: q && q.i, km: km && +km.toFixed(2), ep: ep && ep.name });
  }
  result('portages: every carry the story names found as named, its drawn rods Walt\'s', bad.length === 0, { found: Object.keys(OUT.portages).length, bad });
  // names.js puts the Forest Service's rods on a trail when the USFS table has it (the sign, the trip log, the HUD): where
  // that differs from Walt's back-cover number the player reads one number in the book and another on the sign. An owner
  // and writers' call, not a data fault: WARN (exit 0)
  result('rods as shown: the carries Walt numbers show his numbers on the sign', shown.length === 0 ? true : 'warn', { shown });
}

// --- the places -------------------------------------------------------------------------------------------------------
{
  const bad = [], seen = {};
  for (const pl of PJ.places || []) {
    const R = { props: {}, lanes: [] };
    if (pl.trailhead) { // placed at runtime, beside the lot, when the trailhead is built (trailhead.js)
      if (!v9.entryPoints.some((e) => e.ep === pl.trailhead)) bad.push(`${pl.id}: no EP ${pl.trailhead}`);
      R.trailhead = pl.trailhead; OUT.places[pl.id] = R; continue;
    }
    if (pl.site) {
      const s = siteOf(pl.site, pl.lake);
      if (!s || s.why) { bad.push(`${pl.id}: ${s ? s.why : 'no site'}`); continue; }
      const L = landingOf(v9.campsites[s.site]);
      Object.assign(R, { x: s.x, z: s.z, lakeId: s.lakeId, site: s.site, landing: L ? L.landing : null });
      OUT.places[pl.id] = R; continue;
    }
    const ids = lakeIds(pl.lake);
    // the anchor: the shore point nearest the doc's x/z where the staging holds (every prop on its side of the water line
    // and the lanes on land the whole way: 20 §11.2's grade runs "dead straight south-west and uphill" into the trees)
    const cands = pl.shore ? shoreCands(pl.x, pl.z, ids, pl.search || 220) : [{ x: pl.x, z: pl.z, n: [0, 1], u: [1, 0], off: 0 }];
    let pick = null;
    for (const s of cands) { const q = stage(pl, s); if (!q.bad.length && (!pick || s.off < pick.s.off)) pick = { s, q }; }
    if (!pick && cands.length) { const s = cands.sort((a, b) => a.off - b.off)[0]; pick = { s, q: stage(pl, s) }; }
    if (!pick) { bad.push(`${pl.id}: no ${pl.lake} shore within ${pl.search || 220} m`); continue; }
    const s = pick.s;
    Object.assign(R, { x: s.x, z: s.z, n: s.n, u: s.u, lakeId: ids[0] || null, off: s.off, tried: cands.length }, pick.q.R);
    for (const q of Object.values(R.props)) { const c = cell(q.x, q.z); q.y = c ? c.h : null; }
    if (pick.q.bad.length) bad.push(`${pl.id}: no shore within reach stages it (${pick.q.bad.join('; ')})`);
    seen[pl.id] = Object.fromEntries(Object.entries(R.props).map(([k, q]) => [k, q.sd]));
    OUT.places[pl.id] = R;
  }
  result('places: every place found', bad.length === 0, { places: Object.keys(OUT.places), bad });
  // the crews' landing as 20 §11.2 stages it
  const C = OUT.places['crews.landing'];
  if (C) {
    const p = C.props, why = [];
    if (!(p['crews.crib'].sd < 0)) why.push(`the crib is on land (${p['crews.crib'].sd} m)`);
    if (!(p['crews.rock'].sd > -3 && p['crews.rock'].sd < 2.5)) why.push(`the landing rock is not at the edge (${p['crews.rock'].sd} m)`);
    for (const k of ['crews.pine', 'crews.grade', 'crews.pine2']) if (!(p[k].sd > 2)) why.push(`${k} is not on land (${p[k].sd} m)`);
    // the grade runs south-west (its bearing within 60° of SW: -x, +z)
    { const d = C.lanes[0].dir, sw = (-d[0] + d[1]) / Math.SQRT2; if (!(sw > 0.5)) why.push(`the grade does not run south-west (${d})`); }
    let site = Infinity, carry = Infinity;
    for (const c of v9.campsites) site = Math.min(site, Math.hypot(c.x - C.x, c.z - C.z));
    for (const q of v9.portages) for (const m of q.pts) carry = Math.min(carry, Math.hypot(m[0] - C.x, m[1] - C.z));
    if (site < 600) why.push(`a campsite ${Math.round(site)} m off`);
    if (carry < 1200) why.push(`a portage ${Math.round(carry)} m off`);
    // (the doc's "west shore" is the lake's west end, its south-west arm: 1.0 km from C908 and 1.9 km from a portage, as
    // 03 §1a measures it, holds in v9 at the doc's own x/z; the side of the arm is whichever stages the grade on land)
    result('crews: the landing staged as 20 §11.2 (crib in the water, rock at the edge, the rest on land, quiet shore)', why.length === 0, { at: [C.x, C.z], off: C.off, sd: seen['crews.landing'], site: Math.round(site), carry: Math.round(carry), why });
  }
}

PJ.resolved = OUT;
if (WRITE) {
  fs.writeFileSync(placesF, JSON.stringify(PJ, null, 2) + '\n');
  const wf = path.join(ROOT, 'src', 'walt-sites.js');
  const src = fs.readFileSync(wf, 'utf8');
  const a = src.indexOf('// ---- written by scripts/story-places.mjs'), b = src.indexOf('// ---- end of the written block ----');
  if (a < 0 || b < 0) throw new Error('walt-sites.js: the written block markers are gone');
  const head = src.slice(0, src.indexOf('\n', a) + 1);
  fs.writeFileSync(wf, `${head}export const RESOLVED = ${JSON.stringify(SITES)};\n${src.slice(b)}`);
  if (!JSON_OUT) console.log(`written: src/story-places.json (resolved for ${FOR}), src/walt-sites.js (${Object.keys(SITES.sites).length} sites)`);
}
const fails = Object.values(report.checks).filter((c) => c.pass === false).length;
if (JSON_OUT) console.log(JSON.stringify(report));
console.log(fails ? `story-places: ${fails} FAIL` : 'story-places: all pass');
process.exit(fails ? 1 : 0);
