// The starter routes (the start round, 2026-11-05; the owner: "Maybe each outfitter has a starter route and task that
// gets you a little bit more money. That's literally just one night and you go out."). For each of the fourteen hosting
// outfitters, one easy first night: from the outfitter's own landing, a short paddle to a real campsite that is good to
// land at and camp on, and back the next day. Picked by script from the release itself, in a headless Chromium on the
// running game (its world, its tiles, its parties):
//   - the way: a search over the water's own cells (any water, rivers and creeks too) from the put-in to the site's
//     landing (world.js c.access, else the water by the site), the portages joining water to water at a cost (each one
//     dear, a long one dearer); its length, the carries on it (index, rods) and the beaver dams it passes (creeks.js);
//   - the site: its bank (camp-access.json b), a landing and a way up, how often the parties camp there (parties.js, a
//     summer of blocks under three seeds: a party-heavy site is no first night), its kind of shore (tasks.js
//     siteFeature: the point, the island, the bay);
//   - the score: no carry best, one short one at most where the outfitter's water has no site of its own; 2–5 km, a
//     little more or less where that is all there is; a quiet site, a gentle bank; the best few then visited (teleport,
//     the tile's site layout built: a tent pad and a fire ring) and the first that has both kept.
// Writes src/starter-routes.json: { about, for, routes: { ep: { site, key, lake, lakeId, km, portages: [{ i, rods }],
// dams, feature, usfs, nights, bank, way: [[x, z], ...] (the pencil's line, every ~60 m), why } } }.
//
//   npx vite --port 5204 --strictPort &
//   APP=http://localhost:5204 node scripts/r2-starter-routes.mjs [--only 25,38]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5204';
const ONLY = arg('only', null) ? arg('only').split(',').map(Number) : null;
const OUT = path.resolve('src/starter-routes.json');
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

// --- in the page --------------------------------------------------------------------------------------------------
// The way over the water: Dijkstra over the fine cells in a box round the put-in (any water; the cells by the banks
// dearer), the portages as edges between their two ends. S.search(from, R) once per outfitter, then S.wayTo(x, z) per site
// → { pts, km, portages: [{ i, rods }], dams }, or null
export const PAGE = () => {
  const g = window.__game, w = g.world, c = w.cell, T = w.tile, side = w.side;
  const S = window.__starter = {};
  // the fine tiles' lake ids and shore distances, fetched as the tile worker fetches them and kept (the boxes here are
  // bigger than party-moves.js's own cache holds)
  const raw = new Map();
  const tileAt = async (tx, ty) => {
    const k = ty * w.ntx + tx;
    if (raw.has(k)) return raw.get(k);
    let t = null;
    if (tx >= 0 && ty >= 0 && tx < w.ntx && ty < w.nty && w.tileFlags[k]) {
      try {
        const res = await fetch(w.tileUrl(tx, ty));
        if (res.ok) { const buf = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer(); const n = side * side; t = { lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n) }; }
      } catch { t = null; }
    }
    raw.set(k, t);
    return t;
  };
  S.ready = async (x0, z0, x1, z1) => {
    const Mt = w.tileMetres, a = Math.floor((x0 - w.originX) / Mt), b = Math.floor((z0 - w.originZ) / Mt), cc = Math.floor((x1 - w.originX) / Mt), d = Math.floor((z1 - w.originZ) / Mt), jobs = [];
    for (let ty = b; ty <= d; ty++) for (let tx = a; tx <= cc; tx++) jobs.push(tileAt(tx, ty));
    await Promise.all(jobs);
    return true;
  };
  const M = { cell(i, j, out) {
    const t = raw.get(Math.floor(j / T) * w.ntx + Math.floor(i / T));
    if (!t) { out.lake = 0; out.sd = 100; return out; }
    const k = ((((j % T) + T) % T) + w.halo) * side + (((i % T) + T) % T) + w.halo;
    out.lake = t.lake[k]; out.sd = t.sd[k] * 0.1; return out;
  } };
  S.search = async (from, R, PORTAGE = { each: 1800, perM: 3 }) => {
    const x0 = from.x - R, z0 = from.z - R, x1 = from.x + R, z1 = from.z + R;
    if (!(await S.ready(x0, z0, x1, z1))) return null;
    const i0 = Math.floor((x0 - w.originX) / c), j0 = Math.floor((z0 - w.originZ) / c), nx = Math.ceil((x1 - x0) / c), nz = Math.ceil((z1 - z0) / c), N = nx * nz;
    const sd = new Float32Array(N).fill(100), q = { lake: 0, sd: 0 };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { M.cell(i0 + i, j0 + j, q); sd[j * nx + i] = q.lake ? q.sd : 100; }
    const at = (k) => ({ x: w.originX + (i0 + (k % nx) + 0.5) * c, z: w.originZ + (j0 + ((k / nx) | 0) + 0.5) * c });
    const snap = (x, z, r = 120) => {
      const ci = Math.floor((x - w.originX) / c) - i0, cj = Math.floor((z - w.originZ) / c) - j0, Rc = Math.ceil(r / c);
      let best = -1, bd = Infinity;
      for (let dj = -Rc; dj <= Rc; dj++) for (let di = -Rc; di <= Rc; di++) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nx || j >= nz || sd[j * nx + i] >= 0) continue;
        const d = di * di + dj * dj + (sd[j * nx + i] > -2 ? 4 : 0); if (d < bd) { bd = d; best = j * nx + i; }
      }
      return best;
    };
    // the portages in the box: an edge from end to end
    const edges = new Map();
    let carries = 0;
    w.portages.forEach((p, pi) => {
      if (!p.launch || p.launch.length < 2) return;
      const [a, b] = p.launch;
      if (Math.max(Math.abs(a.x - from.x), Math.abs(a.z - from.z), Math.abs(b.x - from.x), Math.abs(b.z - from.z)) > R - 50) return;
      const ka = snap(a.x, a.z, 60), kb = snap(b.x, b.z, 60);
      if (ka < 0 || kb < 0 || ka === kb) return;
      const m = p.lengthM || (p.rods || 0) * 5.03, cost = PORTAGE.each + PORTAGE.perM * m;
      for (const [u, v] of [[ka, kb], [kb, ka]]) { let l = edges.get(u); if (!l) edges.set(u, (l = [])); l.push({ v, cost, pi }); }
      carries++;
    });
    // the beaver dams (creeks.js): a haul-over from the water below to the water above, across the dam's line
    const dams = (w.creeks && w.creeks.dams) || [];
    let haul = 0;
    for (const d of dams) {
      if (d.old || Math.abs(d.x - from.x) > R - 50 || Math.abs(d.z - from.z) > R - 50) continue;
      const ux = -(d.az || 0), uz = d.ax || 0, k = 14;
      const ka = snap(d.x + ux * k, d.z + uz * k, 25), kb = snap(d.x - ux * k, d.z - uz * k, 25);
      if (ka < 0 || kb < 0 || ka === kb) continue;
      for (const [u, v] of [[ka, kb], [kb, ka]]) { let l = edges.get(u); if (!l) edges.set(u, (l = [])); l.push({ v, cost: 250, pi: -2 - d.i }); }
      haul++;
    }
    const s = snap(from.x, from.z, 160);
    if (s < 0) return { error: 'no water at the put-in' };
    const dist = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), via = new Int32Array(N).fill(-1); // via: a portage's index, -2 - a dam's, -1 the water
    // an indexed binary heap over the cells (each at most once, its cost lowered in place): its size never passes N
    const hv = new Int32Array(N), pos = new Int32Array(N).fill(-1);
    let hn = 0;
    const up = (i) => { const k = hv[i], d = dist[k]; while (i > 0) { const p = (i - 1) >> 1; if (dist[hv[p]] <= d) break; hv[i] = hv[p]; pos[hv[i]] = i; i = p; } hv[i] = k; pos[k] = i; };
    const push = (d, k) => { if (pos[k] >= 0) up(pos[k]); else { hv[hn] = k; pos[k] = hn; up(hn++); } };
    const top = [0, 0];
    const pop = () => {
      const k0 = hv[0]; top[0] = dist[k0]; top[1] = k0; pos[k0] = -2;
      const k = hv[--hn];
      if (hn > 0) {
        const d = dist[k]; let i = 0;
        for (;;) { const l = 2 * i + 1, r = l + 1; let m = -1, md = d; if (l < hn && dist[hv[l]] < md) { m = l; md = dist[hv[l]]; } if (r < hn && dist[hv[r]] < md) m = r; if (m < 0) break; hv[i] = hv[m]; pos[hv[i]] = i; i = m; }
        hv[i] = k; pos[k] = i;
      }
      return top;
    };
    dist[s] = 0; push(0, s);
    let ops = 0;
    while (hn > 0) {
      const [d, k] = pop();
      if (d > dist[k]) continue;
      if ((++ops & 65535) === 0) await new Promise((r) => setTimeout(r, 0));
      const i = k % nx, j = (k / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const m = b * nx + a; if (sd[m] >= 0) continue;
        if (di && dj && (sd[j * nx + a] >= 0 || sd[b * nx + i] >= 0)) continue;
        const nd = d + (di && dj ? 1.4142 : 1) * c * (sd[m] > -3 ? 1.6 : 1);
        if (nd < dist[m]) { dist[m] = nd; prev[m] = k; via[m] = -1; push(nd, m); }
      }
      const E = edges.get(k);
      if (E) for (const e of E) { const nd = d + e.cost; if (nd < dist[e.v]) { dist[e.v] = nd; prev[e.v] = k; via[e.v] = e.pi; push(nd, e.v); } }
    }
    S.last = { nx, nz, dist, prev, via, at, snap };
    return { ok: true, carries, haul };
  };
  S.wayTo = (x, z) => {
    const L = S.last; if (!L) return null;
    const t = L.snap(x, z, 120);
    if (t < 0 || !Number.isFinite(L.dist[t])) return null;
    const ks = []; for (let k = t; k >= 0; k = L.prev[k]) ks.push(k); ks.reverse();
    const portages = []; let water = 0, hauls = 0;
    const pts = ks.map((k) => L.at(k));
    for (let n = 1; n < ks.length; n++) {
      if (L.via[ks[n]] >= 0) { const p = w.portages[L.via[ks[n]]]; portages.push({ i: L.via[ks[n]], rods: p.rods || Math.round((p.lengthM || 0) / 5.03) }); continue; }
      if (L.via[ks[n]] <= -2) { hauls++; continue; }
      water += Math.hypot(pts[n].x - pts[n - 1].x, pts[n].z - pts[n - 1].z);
    }
    // the beaver dams the way passes over (a haul-over each): the ones it hauls over, and the ones it paddles past on
    const near = ((w.creeks && w.creeks.dams) || []).filter((d) => !d.old && pts.some((p) => Math.abs(p.x - d.x) < 14 && Math.abs(p.z - d.z) < 14 && Math.hypot(p.x - d.x, p.z - d.z) < 14)).length;
    const dams = Math.max(hauls, near);
    // the pencil's line: the cells thinned to every ~60 m, a portage's two ends kept
    const line = [];
    let acc = 0;
    for (let n = 0; n < ks.length; n++) {
      const p = pts[n];
      if (n > 0) acc += Math.hypot(p.x - pts[n - 1].x, p.z - pts[n - 1].z);
      const jump = n > 0 && L.via[ks[n]] !== -1, before = n + 1 < ks.length && L.via[ks[n + 1]] !== -1;
      if (n === 0 || n === ks.length - 1 || jump || before || acc >= 60) { line.push([Math.round(p.x), Math.round(p.z)]); acc = 0; }
    }
    return { pts: line, km: +(water / 1000).toFixed(2), portages, dams };
  };
  return true;
};

async function main() {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror', e.message));
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function' && window.__game.moves, null, { timeout: 300000, polling: 500 });
  log('loaded');
  await page.evaluate(PAGE);
  // the parties' summer: nights each site is camped on over twelve weeks from mid-June, the mean of three seasons' seeds
  // (a season's parties differ; the busy sites are busy in every one)
  const nights = await page.evaluate(() => {
    const g = window.__game, P = g.parties, use = new Map(), seed0 = P.seed;
    const T0 = Math.round(Date.UTC(g.day.year, 0, 166) / 86400000);
    for (const sd of [seed0, 0x51a7e, 0x2c0ffee]) {
      P.seed = sd; P.blocks.clear();
      for (let T = T0; T < T0 + 84; T += 7) { const blk = P.block(T); for (const [s, i] of blk.site) if (i >= 0) use.set(i, (use.get(i) || 0) + Math.max(0, Math.min(s.end, T + 7) - Math.max(s.start, T)) / 3); }
    }
    P.seed = seed0; P.blocks.clear();
    return Object.fromEntries([...use].map(([i, n]) => [i, Math.round(n)]));
  });
  log('party nights for', Object.keys(nights).length, 'sites');
  const access = JSON.parse(readFileSync('src/camp-access.json', 'utf8')).sites;
  // the Forest Service's own sites (names-sites.json, by the site's key within 60 m): a site off that list is a lake's
  // outside the wilderness (Lake Vermilion's, Crane Lake's) or one only OpenStreetMap has
  const NS = JSON.parse(readFileSync('src/names-sites.json', 'utf8'));
  const usfsOf = (key) => { const [x, z] = key.split(':').map(Number); for (const q of NS.rows) if (Math.abs(q[0] - x) < 60 && Math.abs(q[1] - z) < 60 && Math.hypot(q[0] - x, q[1] - z) < 60) return { no: q[2], lake: NS.lakes[q[3]] }; return null; };
  const EPS = await page.evaluate(() => window.__game.outfitters.OUTFITTER_EPS);
  const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  const routes = ONLY && old ? { ...old.routes } : {};
  for (const ep of EPS) {
    if (ONLY && !ONLY.includes(ep)) continue;
    const cands = await page.evaluate(async ([ep, nights]) => {
      const g = window.__game, w = g.world, S = window.__starter, e = w.entryPoints.find((x) => x.ep === ep), P = g.parties;
      const R = 6500;
      // (r3 base: from the store's own dock, where a season, a ride and a pickup come in (outfitters.js placeOf, round 2
      // markers), not the entry point's put-in: Slim Lake's store stands 800 m off on another lake)
      const P0 = g.outfitters.placeOf(ep), from = P0 && P0.dock && Number.isFinite(P0.dock.x) ? P0.dock : e;
      const r = await S.search({ x: from.x, z: from.z }, R);
      if (!r || r.error) return { error: r ? r.error : 'tiles' };
      const out = [];
      w.campsites.forEach((s, i) => {
        const d = Math.hypot(s.x - from.x, s.z - from.z); if (d > R - 600) return;
        const A = s.access, lx = A && A.landing ? A.landing[0] : s.x, lz = A && A.landing ? A.landing[1] : s.z;
        const way = S.wayTo(lx, lz); if (!way) return;
        const lakeId = P.siteLake[i] || g.tasks.lakeNear(s.x, s.z);
        out.push({ i, key: s.key || `${Math.round(s.x)}:${Math.round(s.z)}`, d: Math.round(d), lakeId, lake: w.lakeName(lakeId), access: !!(A && A.way), latrine: !!(A && A.latrine), usfs: s.usfs ?? null, nights: nights[i] || 0, ...way });
      });
      return { ep, name: e.name, lake: w.lakeName(e.lake), cands: out };
    }, [ep, nights]);
    if (cands.error) { log(ep, 'FAILED', cands.error); continue; }
    for (const c of cands.cands) { const a = access[c.key]; c.bank = a && Number.isFinite(a.b) ? a.b : null; const u = usfsOf(c.key); c.usfs = u ? u.no : null; c.official = u ? u.lake : null; }
    const rods = (c) => c.portages.reduce((a, p) => a + (p.rods || 0), 0);
    const score = (c) => {
      let s = 0;
      s += c.portages.length * 6 + rods(c) / 25;                      // a carry is dear; a long one dearer
      s += c.km < 1.2 ? (1.2 - c.km) * 6 + 2 : c.km < 2 ? (2 - c.km) * 1.5 : c.km > 5 ? (c.km - 5) * 2.5 : 0; // 2–5 km
      s += Math.min(6, c.nights / 6);                                  // a quiet site (nights of 84 a summer)
      s += c.dams * 1.5;                                               // a haul-over each
      s += c.bank != null ? Math.max(0, c.bank - 0.12) * 12 : 1.5;     // a gentle bank
      s += c.access ? 0 : 3; s += c.latrine ? 0 : 1; s += c.lake ? 0 : 2;
      s += c.usfs != null ? 0 : 8;                                     // a Forest Service site (one in the wilderness)
      return +s.toFixed(2);
    };
    for (const c of cands.cands) c.score = score(c);
    const ranked = cands.cands.filter((c) => c.km <= 7 && c.portages.length <= 2).sort((a, b) => a.score - b.score);
    log(`${ep} ${cands.name} (${cands.lake}): ${cands.cands.length} sites by water; best ${ranked.slice(0, 5).map((c) => `${c.lake}#${c.usfs ?? '?'} ${c.km}km p${c.portages.map((p) => p.rods).join('+') || 0} d${c.dams} n${c.nights} b${c.bank} s${c.score}`).join(' | ')}`);
    // visit the best few: the site's layout (a tent pad, a fire ring) and its kind of shore
    let pick = null;
    for (const c of ranked.slice(0, 6)) {
      const v = await page.evaluate(async (c) => {
        const g = window.__game, w = g.world, s = w.campsites[c.i];
        if (g.title.state === 'title') g.title.close();
        if (g.outfitter && g.outfitter.open) g.outfitter.hide();
        await g.player.teleport(s.x, s.z);
        for (let k = 0; k < 80 && !s.layout; k++) { g.step(1 / 30, 10); await new Promise((r) => setTimeout(r, 100)); }
        const L = s.layout;
        let feature = null;
        try { const tg = await g.tasks.peek(s.x, s.z); feature = tg && g.siteFeature ? g.siteFeature(tg, s.x, s.z) : null; } catch (e) { feature = null; }
        return { layout: !!L, pad: !!(L && L.pad), fire: !!(L && L.fire), feature };
      }, c);
      log('  visit', c.lake, c.usfs, JSON.stringify(v));
      if (v.pad && v.fire) { pick = { ...c, feature: v.feature }; break; }
    }
    if (!pick) { log(ep, 'NO SITE PASSED'); continue; }
    const why = [`${pick.km} km${pick.portages.length ? `, ${pick.portages.map((p) => `a ${p.rods}-rod carry`).join(' and ')}` : ', no carry'}${pick.dams ? `, ${pick.dams} beaver dam${pick.dams > 1 ? 's' : ''}` : ''}`,
      pick.feature && pick.feature !== 'shore' ? `the ${pick.feature} site` : 'a shore site', pick.bank != null ? `bank ${pick.bank}` : 'no bank grade', pick.usfs != null ? `USFS #${pick.usfs}` : 'not a Forest Service site', `${pick.nights} party nights a summer`, `of ${ranked.length} by water`];
    routes[ep] = { site: pick.i, key: pick.key, lake: pick.lake, lakeId: pick.lakeId, km: pick.km, portages: pick.portages, dams: pick.dams, feature: pick.feature, usfs: pick.usfs, nights: pick.nights, bank: pick.bank, from: cands.name, way: pick.pts, why: why.join('; ') };
    log(`=> ${ep}: ${pick.lake} #${pick.usfs} (${routes[ep].why})`);
  }
  for (const r of Object.values(routes)) { const u = usfsOf(r.key); r.usfs = u ? u.no : null; r.official = u ? u.lake : null; }
  const about = 'The start round (2026-11-05): each hosting outfitter\'s starter route, one easy night out and back: from the put-in to a real campsite by water (km of paddling, the carries on the way by portage index and rods, the beaver dams passed), its shore (feature), how often parties camp there (nights of 84 a summer), the bank grade, and the pencil\'s line (way: [x, z] every ~60 m). Written by scripts/r2-starter-routes.mjs from the release baked at `for`; read by src/starter.js.';
  const forBaked = await page.evaluate(() => window.__game.world.meta.source && window.__game.world.meta.source.baked);
  writeFileSync(OUT, `${JSON.stringify({ about, for: forBaked, routes })}\n`);
  log('wrote', OUT, Object.keys(routes).length, 'routes');
  await browser.close();
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
