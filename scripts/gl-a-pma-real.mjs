// Game-loop calls (the owner's call 2026-11-05, "real primitive management areas"): writes src/pma.json from the Forest
// Service's own polygons, in place of scripts/gl-a-pma.mjs's drawn ones (approx: true).
//
// The source: data-cache/pma/pma-real.geojson (12 Polygon features, EPSG:4326 / CRS84) and its SOURCES.md, beside it.
// The USFS Enterprise Data Warehouse layer EDW_LandManagementPlanning_01/MapServer/2 (BdyPlan_LMP_ManagementArea),
// Superior National Forest (forest 0909), 2004 Forest Plan management area 5.1 "Pristine Wilderness": the BWCAW's
// twelve primitive management areas. The layer has no names; each was named by which polygon holds that PMA's listed
// lakes (GNIS points, point in polygon). A US federal work, public domain. data-cache is not tracked: the file lives in
// the main checkout (/Users/gkrumbac/Documents/bwca-canoe/data-cache/pma/); PMA_GEOJSON=path overrides.
//
// What it does, in a running game (window.__game.world): each polygon's ring to the world's metres (world.fromLatLon),
// simplified (Douglas-Peucker, SIMPLIFY m) but keeping its shape; kept if it overlaps the baked world (else reported as
// dropped). Named "<X> Lake primitive area"; `lake` the biggest game lake (not a river or creek) whose centre is inside,
// `lakes` how many are, `ha` their water in hectares, `areaHa` the polygon's own (the Forest Service's GIS acres);
// `centre` a point inside the polygon (the ring's centroid when it is inside, else the inside point nearest it), `near`
// the nearest of the round's outfitters (HOSTS). Ids are pma-<the PMA's number> (1 to 12, bwcawild's numbering).
//
//   APP=http://localhost:5196 node scripts/gl-a-pma-real.mjs        (writes src/pma.json)
import { createRequire } from 'node:module';
import { readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.env.APP || 'http://localhost:5196';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = [process.env.PMA_GEOJSON, path.join(ROOT, 'data-cache/pma/pma-real.geojson'), path.resolve(ROOT, '../../../data-cache/pma/pma-real.geojson'), '/Users/gkrumbac/Documents/bwca-canoe/data-cache/pma/pma-real.geojson'].filter(Boolean).find((p) => existsSync(p));
if (!SRC) throw new Error('pma-real.geojson not found (set PMA_GEOJSON)');
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());

// the round's outfitters (docs/build/game-loop-brief.md, stream B's table): a PMA's `near` (as gl-a-pma.mjs)
const HOSTS = [51, 64, 49, 69, 40, 38, 36, 67, 25, 31, 6, 16, 1, 12];
const SIMPLIFY = 40; // m: Douglas-Peucker tolerance (the source is coarse already: 51 to 165 vertices a PMA)
const SOURCE = 'USFS EDW_LandManagementPlanning_01 layer 2 (BdyPlan_LMP_ManagementArea), Superior National Forest (forest 0909), 2004 Forest Plan management area 5.1 "Pristine Wilderness": the BWCAW primitive management areas; names by lake-in-polygon match; public domain; converted by scripts/gl-a-pma-real.mjs';

const gj = JSON.parse(readFileSync(SRC, 'utf8'));
const feats = gj.features.filter((f) => f.geometry && f.geometry.type === 'Polygon').map((f) => ({ props: f.properties, ring: f.geometry.coordinates[0] }));

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 800, height: 600 } })).newPage();
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.world && window.__game.world.lakes && window.__game.world.entryPoints, null, { timeout: 240000, polling: 500 });
  const out = await page.evaluate(({ feats, HOSTS, SIMPLIFY }) => {
    const w = window.__game.world, cellHa = (w.cell || 10) ** 2 / 1e4;
    const inPoly = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
    const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz; const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L)) : 0; return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz)); };
    const dp = (pts, tol) => {
      if (pts.length < 3) return pts;
      let best = 0, k = 0;
      for (let i = 1; i < pts.length - 1; i++) { const d = segD(pts[i], pts[0], pts[pts.length - 1]); if (d > best) { best = d; k = i; } }
      if (best <= tol) return [pts[0], pts[pts.length - 1]];
      return dp(pts.slice(0, k + 1), tol).slice(0, -1).concat(dp(pts.slice(k), tol));
    };
    const area = (poly) => { let s = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] * poly[i][1]) - (poly[i][0] * poly[j][1]); return s / 2; };
    const centroid = (poly) => { let a = 0, cx = 0, cz = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; a += f; cx += (poly[j][0] + poly[i][0]) * f; cz += (poly[j][1] + poly[i][1]) * f; } return [cx / (3 * a), cz / (3 * a)]; };
    const kept = [], dropped = [];
    for (const f of feats) {
      const P = f.props, num = Number(P.pma_number);
      let ring = f.ring.map(([lon, lat]) => { const q = w.fromLatLon(lat, lon); return [q.x, q.z]; });
      if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring = ring.slice(0, -1);
      // the closed ring split at the vertex farthest from the first, each half simplified (Douglas-Peucker wants two ends)
      let far = 0, fi = 0; for (let i = 1; i < ring.length; i++) { const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]); if (d > far) { far = d; fi = i; } }
      const a = dp(ring.slice(0, fi + 1), SIMPLIFY), b = dp(ring.slice(fi).concat([ring[0]]), SIMPLIFY);
      const poly = a.slice(0, -1).concat(b.slice(0, -1)).map(([x, z]) => [Math.round(x), Math.round(z)]);
      const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
      const box = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
      const name = `${String(P.name || `PMA ${num}`).replace(/\s+PMA$/i, '')} primitive area`;
      const overlap = box[2] > w.minX && box[0] < w.maxX && box[3] > w.minZ && box[1] < w.maxZ;
      // how much of it is in the baked world: a lattice of points in the polygon, the share inside the world's bounds
      let n = 0, nin = 0;
      for (let i = 0; i <= 30; i++) for (let j = 0; j <= 30; j++) { const x = box[0] + ((box[2] - box[0]) * i) / 30, z = box[1] + ((box[3] - box[1]) * j) / 30; if (!inPoly(poly, x, z)) continue; n++; if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ) nin++; }
      if (!overlap || !nin) { dropped.push({ num, name, why: 'outside the baked world', box }); continue; }
      // the lakes inside (their centres): the biggest names the `lake`
      const lakes = [];
      w.lakes.forEach((l, i) => { if (!l || l.river || l.creek) return; if (l.cx < box[0] || l.cx > box[2] || l.cz < box[1] || l.cz > box[3]) return; if (inPoly(poly, l.cx, l.cz)) lakes.push({ id: i + 1, name: l.displayName || l.name || null, ha: (l.cells || 0) * cellHa, x: l.cx, z: l.cz }); });
      lakes.sort((p, q) => q.ha - p.ha);
      // a point inside: the centroid, else the inside lattice point nearest it
      let c = centroid(poly);
      if (!inPoly(poly, c[0], c[1])) {
        let bd = Infinity, bc = null;
        for (let i = 0; i <= 60; i++) for (let j = 0; j <= 60; j++) { const x = box[0] + ((box[2] - box[0]) * i) / 60, z = box[1] + ((box[3] - box[1]) * j) / 60; if (!inPoly(poly, x, z)) continue; const d = Math.hypot(x - c[0], z - c[1]); if (d < bd) { bd = d; bc = [x, z]; } }
        c = bc || c;
      }
      let near = null, hd = Infinity;
      for (const e of w.entryPoints) { if (!HOSTS.includes(e.ep)) continue; const d = Math.hypot(e.x - c[0], e.z - c[1]); if (d < hd) { hd = d; near = e.ep; } }
      const ll = w.toLatLon(c[0], c[1]);
      kept.push({ num, name, near, nearKm: +(hd / 1000).toFixed(1), lake: lakes[0] ? lakes[0].id : null, lakeName: lakes[0] ? lakes[0].name : null, lakes: lakes.length, ha: Math.round(lakes.reduce((s, l) => s + l.ha, 0)),
        areaHa: Math.round(Number(P.acres) ? Number(P.acres) * 0.404686 : Math.abs(area(poly)) / 1e4), inWorld: +(nin / Math.max(1, n)).toFixed(2), centre: [Math.round(c[0]), Math.round(c[1])], lat: +ll.lat.toFixed(4), lon: +ll.lon.toFixed(4),
        verts: [f.ring.length, poly.length], official: P.official_id || null, poly });
    }
    kept.sort((p, q) => p.num - q.num);
    return { kept, dropped, bounds: [w.minX, w.minZ, w.maxX, w.maxZ] };
  }, { feats, HOSTS, SIMPLIFY });
  const table = {
    v: 1,
    source: SOURCE,
    params: { SIMPLIFY },
    pmas: out.kept.map((a) => ({ id: `pma-${a.num}`, name: a.name, approx: false, near: a.near, lake: a.lake, lakes: a.lakes, ha: a.ha, areaHa: a.areaHa, centre: a.centre, lat: a.lat, lon: a.lon, official: a.official, poly: a.poly })),
  };
  // (one area a line)
  const head = JSON.stringify({ ...table, pmas: [] }, null, 1).replace(/"pmas": \[\]\n}$/, '');
  writeFileSync(path.join(ROOT, 'src/pma.json'), `${head}"pmas": [\n${table.pmas.map((p) => `  ${JSON.stringify(p)}`).join(',\n')}\n ]\n}\n`);
  console.log(`from ${SRC}: kept ${out.kept.length}, dropped ${out.dropped.length}; world ${out.bounds.join(', ')}`);
  for (const a of out.kept) console.log(`  pma-${a.num} ${a.name} · ${a.verts[0]} → ${a.verts[1]} vertices · ${a.areaHa} ha · ${a.lakes} lakes (${a.ha} ha of water), biggest ${a.lakeName || '?'} (#${a.lake}) · near ep ${a.near} (${a.nearKm} km) · ${Math.round(a.inWorld * 100)} % in the world · ${a.lat}, ${a.lon}`);
  for (const d of out.dropped) console.log(`  DROPPED pma-${d.num} ${d.name}: ${d.why}`);
} finally { await browser.close(); }
