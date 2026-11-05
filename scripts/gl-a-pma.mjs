// Game-loop stream A: draws src/pma.json, the primitive management areas a PMA permit camps in.
//
// SUPERSEDED (2026-11-05): src/pma.json is now the Forest Service's real twelve, written by scripts/gl-a-pma-real.mjs.
// This drew stand-ins (approx: true) and is kept only for the record; running it overwrites the real table.
//
// The Forest Service's own PMA layer (the BWCAW plan's twelve primitive management areas) is not published on any
// service this could fetch (2026-11-05: the EDW REST catalogue has wilderness boundaries but no PMA layer, and ArcGIS
// Online has none for the BWCAW), so these are drawn from the game's own data the way the real ones were chosen: the
// country inside the wilderness with no designated campsite and no maintained portage near its lakes. Every polygon is
// marked `approx: true`. When the real layer turns up, replace the table (same shape) and keep the ids.
//
// What it does, in a running game (it reads window.__game.world): every named lake of 8 ha or more with no campsite
// within SITE_FREE m and no portage landing within PORT_FREE m, inside the wilderness (a campsite within 9 km) and away
// from the roads (no entry point within EP_FREE m), is primitive; primitive lakes within LINK m of each other are one
// area; an area of three lakes or more becomes a convex hull padded PAD m. The biggest ten (spread over the map) are
// kept, each named for its biggest lake and tied to the nearest of the round's outfitters (`near`).
//
//   APP=http://localhost:5181 node scripts/gl-a-pma.mjs        (writes src/pma.json)
import { createRequire } from 'node:module';
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.APP || 'http://localhost:5181';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());

// the round's outfitters (docs/build/game-loop-brief.md, stream B's table): a PMA's `near`
const HOSTS = [51, 64, 49, 69, 40, 38, 36, 67, 25, 31, 6, 16, 1, 12];
const P = { SITE_FREE: 1500, PORT_FREE: 600, EP_FREE: 4000, EP_NEAR: 16000, INSIDE: 9000, LINK: 3200, PAD: 700, MIN_HA: 5, KEEP: 12, SPREAD: 8000, IN: 800 };
// the wilderness's own outline (the three BWCAW units, a public feature service; the inside test)
const BOUNDARY_URL = 'https://services.arcgis.com/8df8p0NlLFEShl0r/arcgis/rest/services/boundary_waters_canoe_area_wilderness/FeatureServer/0/query?where=1%3D1&outFields=BWCA_UNIT&returnGeometry=true&outSR=4326&f=geojson&geometryPrecision=4&maxAllowableOffset=0.002';
const gj = await (await fetch(BOUNDARY_URL)).json();
const RINGS = gj.features.flatMap((f) => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map((p) => p[0]) : [f.geometry.coordinates[0]]));

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.world && window.__game.world.lakes, null, { timeout: 240000, polling: 500 });
  const out = await page.evaluate(({ P, HOSTS, RINGS }) => {
    const w = window.__game.world, cellHa = (w.cell || 10) ** 2 / 1e4;
    const near = (list, x, z, r) => list.some((q) => Math.abs(q.x - x) < r && Math.abs(q.z - z) < r && Math.hypot(q.x - x, q.z - z) < r);
    const inRing = (r, lon, lat) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c; } return c; };
    // inside the wilderness, and IN m from its edge (four points round the centre all in)
    const inside = (x, z) => [[0, 0], [P.IN, 0], [-P.IN, 0], [0, P.IN], [0, -P.IN]].every(([dx, dz]) => { const ll = w.toLatLon(x + dx, z + dz); return RINGS.some((r) => inRing(r, ll.lon, ll.lat)); });
    const lands = [];
    for (const p of w.portages) for (const l of p.launch || []) lands.push({ x: l.x, z: l.z });
    const free = [];
    w.lakes.forEach((l, i) => {
      if (!l) return;
      const id = i + 1, name = l.displayName || l.name, ha = (l.cells || 0) * cellHa;
      if (!name || ha < P.MIN_HA || l.river || l.creek) return;
      const x = l.cx, z = l.cz;
      if (near(w.campsites, x, z, P.SITE_FREE) || near(lands, x, z, P.PORT_FREE) || near(w.entryPoints, x, z, P.EP_FREE)) return;
      if (!near(w.campsites, x, z, P.INSIDE) || !near(w.entryPoints, x, z, P.EP_NEAR)) return;
      if (!inside(x, z)) return;
      free.push({ id, name, ha, x, z, r: Math.sqrt((ha * 1e4) / Math.PI) });
    });
    // single linkage
    const group = free.map((_, i) => i), find = (i) => (group[i] === i ? i : (group[i] = find(group[i])));
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) if (Math.hypot(free[i].x - free[j].x, free[i].z - free[j].z) < P.LINK) group[find(i)] = find(j);
    const by = new Map();
    free.forEach((f, i) => { const g = find(i); if (!by.has(g)) by.set(g, []); by.get(g).push(f); });
    const hull = (pts) => {
      pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], hi = [];
      for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
      for (const p of pts.slice().reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
      return lo.slice(0, -1).concat(hi.slice(0, -1));
    };
    const areas = [];
    for (const lakes of by.values()) {
      if (lakes.length < 3) continue;
      const pts = [];
      for (const l of lakes) { const r = l.r + P.PAD; for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; pts.push([l.x + Math.cos(a) * r, l.z + Math.sin(a) * r]); } }
      const poly = hull(pts).map(([x, z]) => [Math.round(x), Math.round(z)]);
      const big = lakes.slice().sort((a, b) => b.ha - a.ha)[0];
      const cx = lakes.reduce((s, l) => s + l.x * l.ha, 0) / lakes.reduce((s, l) => s + l.ha, 0), cz = lakes.reduce((s, l) => s + l.z * l.ha, 0) / lakes.reduce((s, l) => s + l.ha, 0);
      let hostEp = null, hd = Infinity;
      for (const e of w.entryPoints) { if (!HOSTS.includes(e.ep)) continue; const d = Math.hypot(e.x - cx, e.z - cz); if (d < hd) { hd = d; hostEp = e.ep; } }
      const ll = w.toLatLon(cx, cz);
      areas.push({ name: `${big.name} primitive area`, lake: big.id, lakes: lakes.length, ha: Math.round(lakes.reduce((s, l) => s + l.ha, 0)), cx: Math.round(cx), cz: Math.round(cz), lat: +ll.lat.toFixed(4), lon: +ll.lon.toFixed(4), near: hostEp, nearKm: +(hd / 1000).toFixed(1), poly });
    }
    areas.sort((a, b) => b.ha * b.lakes - a.ha * a.lakes);
    const keep = [];
    for (const a of areas) { if (keep.length >= P.KEEP) break; if (keep.some((k) => Math.hypot(k.cx - a.cx, k.cz - a.cz) < P.SPREAD)) continue; keep.push(a); }
    keep.sort((a, b) => a.cx - b.cx);
    return { free: free.length, candidates: areas.length, keep };
  }, { P, HOSTS, RINGS });
  const table = {
    v: 1,
    source: 'approx: drawn by scripts/gl-a-pma.mjs from the game data (lakes with no designated campsite or portage near them, inside the wilderness, away from the roads); the Forest Service PMA layer could not be fetched (2026-11-05)',
    params: P,
    pmas: out.keep.map((a, i) => ({ id: `pma-${i + 1}`, name: a.name, approx: true, near: a.near, lake: a.lake, lakes: a.lakes, ha: a.ha, centre: [a.cx, a.cz], lat: a.lat, lon: a.lon, poly: a.poly })),
  };
  writeFileSync(path.join(ROOT, 'src/pma.json'), `${JSON.stringify(table, null, 1)}\n`);
  console.log(`${out.free} primitive lakes, ${out.candidates} areas, kept ${out.keep.length}:`);
  for (const a of out.keep) console.log(`  ${a.name} · ${a.lakes} lakes, ${a.ha} ha of water · near ep ${a.near} (${a.nearKm} km) · ${a.lat}, ${a.lon}`);
} finally { await browser.close(); }
