// Round 5, stream R (the owner 2026-11-10: "Roads aren't everywhere. I go outside the boundary waters and I don't see any
// roads, which there should be. Just put roads where you see roads. The trucks float in the air."). Headless Chromium
// against a running Vite; each check PASS or FAIL, a screenshot at each look:
//   0 the cost: the bytes before the title (src/roads.bin's index only), and at each look the draw calls, triangles and
//     shader programs with the roads and (a second page) with ?roads=off
//   1 the roads are everywhere OSM has them: at each look (Ely, Winton, the Echo Trail, the Fernberg, the Gunflint Trail,
//     the Grade, the Crane Lake Road, the Sawbill Trail, the Arrowhead Trail, the Kawishiwi Trail) the tile's roads installed, a blacktop or gravel road
//     within 60 m of the place, and every road point round the look (on land past the water's edge, the 2 m detail)
//     graded: the drawn ground within 0.3 m of the road's height; no trunk on a road's core; a shot along the road
//   2 the truck on its wheels, frame by frame: every route posed every 0.3 m (a frame at its top speed), each of the four
//     tyres' contact against the ground drawn under it (tiles.groundAt or a bridge's deck): none more than 0.10 m off it
//     nor pressed in more than 0.10 m; the body's underside (0.45 m) over the ground under its middle
//   3 the known spots of round 4 (EP 50's tilt, EP 80's wheel gap, EP 49's junction, EP 40's bridge end, the Moose Lake
//     Boat Access): shots of the truck there, their worst tyres logged
//   4 no page errors
//
//   APP=http://localhost:5701 node scripts/r5-roads-test.mjs [--only 40,50] [--shots <dir>] [--looks ely,gunflint] [--off]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5701';
const ONLY = arg('only', null) ? arg('only').split(',') : null;
const LOOKS = arg('looks', null) ? arg('looks').split(',') : null;
const SHOTS = arg('shots', path.join(tmpdir(), 'r5-roads-shots'));
const OFF = process.argv.includes('--off'); // (the baseline's own run: the looks and the truck only, no road checks judged)
mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 2400)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, H = window.__r5r = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.ready = async (x, z, r = 200, ms = 90000) => { const t0 = performance.now(); if (g.tiles.ensure) await g.tiles.ensure(x, z, r); while (performance.now() - t0 < ms) { H.step(10); await H.wait(40); const e = g.tiles.tiles.get(g.tiles.key(...g.world.tileOf(x, z))); if (e && e.state === 'ready') break; } H.step(30); };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  H.look = (x, z, tx, tz) => { H.standAt(x, z, Math.atan2(-(tz - z), tx - x)); const c = g.chase; if (c) { c.viewYaw = g.player.heading; c.forwardYaw = g.player.heading; if (c.snap) c.snap(); } H.step(20); };
  H.closeAll = () => { const o = g.outfitter; if (o.open) o.hide(); if (o.shelfOpen) o.shelf.close(); if (g.record && g.record.shown != null) { if (g.record.close) g.record.close(); else if (g.record.hide) g.record.hide(); } if (g.veil && g.veil.active && g.veil.skip) g.veil.skip(); };
  // go somewhere and wait for its ground: the tile, then the detail (the 2 m or 5 m chunk) at (x, z)
  H.goNear = async (x, z) => {
    H.standAt(x, z); await H.ready(x, z, 220);
    for (let w = 0; w < 80 && !(g.tiles.detail && g.tiles.detail.at(x, z)); w++) { H.step(4); await H.wait(50); }
    H.step(10);
  };
  H.deckTop = (x, z) => { const R = g.world.roads; let top = -Infinity; if (R) for (const B of R.bridges) { const ex = B.bx - B.ax, ez = B.bz - B.az, L2 = ex * ex + ez * ez, t = L2 > 1e-9 ? ((x - B.ax) * ex + (z - B.az) * ez) / L2 : 0; const Lb = Math.sqrt(L2) || 1; if (t < -2 / Lb || t > 1 + 2 / Lb) continue; const tc = Math.max(0, Math.min(1, t)); if (Math.hypot(x - B.ax - ex * tc, z - B.az - ez * tc) <= B.hw + 0.3) top = Math.max(top, B.ah + (B.bh - B.ah) * tc + 0.06); } return top; };
  H.deck = (x, z) => { const R = g.world.roads; if (!R || !R.bridges.length) return -Infinity; for (const B of R.bridges) { const ex = B.bx - B.ax, ez = B.bz - B.az, L2 = ex * ex + ez * ez, t = L2 > 1e-9 ? ((x - B.ax) * ex + (z - B.az) * ez) / L2 : 0; if (t < -0.05 || t > 1.05) continue; const tc = Math.max(0, Math.min(1, t)); if (Math.hypot(x - B.ax - ex * tc, z - B.az - ez * tc) <= B.hw + 0.3) return 1; } return -Infinity; };
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(home = 38) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${home}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(async () => { const H = window.__r5r; H.closeAll(); for (let i = 0; i < 30; i++) { H.step(10); await H.wait(30); } const d = window.__game.day; if (d.setClock && d.hours < 9) d.setClock(d.year, d.doy, 13); H.step(10); });
  return page;
}
const shot = async (page, name) => { const f = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: f }); log('shot', f); };

// the looks (lat, lon): a place on or by a road outside the wilderness
const PLACES = { // (the middles of the OSM ways, data-cache/edge/roads.json)
  ely: [47.9033, -91.8668], winton: [47.9318, -91.8007], echo: [48.1432, -92.3638], fernberg: [47.9569, -91.6336],
  gunflint: [48.0636, -90.5387], grade: [47.8384, -90.7670], cranelake: [48.0564, -92.4799], sawbill: [47.8291, -90.8893],
  arrowhead: [47.9424, -89.9881], kawishiwi: [47.8850, -91.7292],
};
const RIG = () => {
  const g = window.__game, H = window.__r5r, w = g.world;
  H.xz = (lat, lon) => { const P = w.meta.proj; return [(lon - P.lon0) * P.mPerDegLon, -(lat - P.lat0) * P.mPerDegLat]; };
  H.calls = () => { H.step(2); const i = g.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, programs: i.programs.length }; };
  // the chains of the tile (x, z) is in (roads.js tileChains), the nearest drivable point on them (gravel or blacktop first)
  H.chains = (x, z) => { const R = w.roads; if (!R || !R.tiles) return []; const [tx, ty] = w.tileOf(x, z), T = R.tiles.get(ty * w.ntx + tx); return T ? T.chains : []; };
  H.nearestOn = (x, z, max = 400) => {
    let best = null;
    for (const c of H.chains(x, z)) for (let i = 0; i < c.n; i++) {
      if (c.p[i * 4 + 3] < 0) continue;
      const d = Math.hypot(c.p[i * 4] - x, c.p[i * 4 + 1] - z) + (c.k === 3 || c.svc ? 150 : 0);
      if (d < max && (!best || d < best.d)) best = { d, c, i };
    }
    return best;
  };
  // the truck's four tyres against the ground: { gap (the most one is off it), sink (the most one is pressed in), belly
  // (the ground under its middle above the underside: > 0 is the ground through the body) }
  H.tyres = () => {
    const T = g.truck, m = T.mesh.matrix.elements, out = { gap: -Infinity, sink: -Infinity, belly: -Infinity };
    const G = (x, z) => Math.max(g.tiles.groundAt(x, z), H.deck(x, z));
    const P = (lx, ly, lz) => [m[0] * lx + m[4] * ly + m[8] * lz + m[12], m[1] * lx + m[5] * ly + m[9] * lz + m[13], m[2] * lx + m[6] * ly + m[10] * lz + m[14]];
    for (const a of [1.72, -1.63]) for (const s of [-0.93, 0.93]) {
      const [x, y, z] = P(s, 0, a), d = y - G(x, z);
      out.gap = Math.max(out.gap, d); out.sink = Math.max(out.sink, -d);
    }
    for (const a of [-0.6, 0.05, 0.7]) { const [x, y, z] = P(0, 0.45, a); out.belly = Math.max(out.belly, G(x, z) - y); }
    return out;
  };
};

try {
  // ---- 0 the bytes before the title -----------------------------------------------------------------------------------
  const bytes = { total: 0, roadsBin: 0, roadsJson: 0, n: 0 };
  const page = await (async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    let titled = false;
    p.on('requestfinished', async (rq) => { if (titled) return; try { const s = await rq.sizes(); const n = s.responseBodySize + s.responseHeadersSize; bytes.total += n; bytes.n++; if (/roads\.bin/.test(rq.url())) bytes.roadsBin += n; if (/roads\.json/.test(rq.url())) bytes.roadsJson += n; } catch { /* gone */ } });
    p.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
    p.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
    await p.goto(APP, { timeout: 180000 });
    await p.waitForFunction(() => { const g = window.__game; return g && g.title && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
    titled = true;
    await p.close(); await ctx.close();
    return open();
  })();
  log('bytes before the title', JSON.stringify(bytes));
  await page.evaluate(RIG);
  let off = null;
  if (!OFF) { // (a second page with ?roads=off for the cost's other half)
    const save = APP;
    off = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    off.on('pageerror', (e) => log('pageerror (off)', e.message));
    await off.goto(`${save}/?roads=off`, { timeout: 180000 });
    await off.waitForFunction(() => { const g = window.__game; return g && g.title && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
    await off.evaluate(HELPERS);
    await off.evaluate(() => window.__game.title.askNewSeason('adventure'));
    await off.waitForFunction(() => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0, null, { timeout: 120000 });
    await off.waitForTimeout(400);
    await off.click('.startmap .pin[data-ep="38"]');
    await off.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
    await off.click('#btn-start');
    await off.waitForFunction(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting; }, null, { timeout: 180000 });
    await off.evaluate(RIG);
  }

  // ---- 1 the roads at each look -----------------------------------------------------------------------------------------
  const looks = {}, cost = {};
  for (const name of LOOKS || Object.keys(PLACES)) {
    const [lat, lon] = PLACES[name];
    const look = async (p) => p.evaluate(async ([lat, lon]) => {
      const g = window.__game, H = window.__r5r, w = g.world;
      H.closeAll();
      const [x0, z0] = H.xz(lat, lon);
      await H.goNear(x0, z0);
      const near = H.nearestOn(x0, z0, 2000);
      const probe = await fetch(new URL('/src/roads.bin', location.href), { headers: { Range: 'bytes=0-31' } }).then((r) => r.status, (e) => String(e));
      const out = { at: [Math.round(x0), Math.round(z0)], roads: !!w.roads, bin: w.roads && w.roads.bin, probe, tilesIn: w.roads && w.roads.tiles ? w.roads.tiles.size : null, tile: w.tileOf(x0, z0), chains: H.chains(x0, z0).length, near: near ? { d: Math.round(near.d), k: near.c.k, svc: near.c.svc } : null, graded: { pts: 0, off: [], trunks: [] } };
      let vx = x0, vz = z0, tx = x0 + 30, tz = z0;
      if (near) {
        const c = near.c, i = near.i, j = Math.min(c.n - 1, i + 8), i0 = Math.max(0, i - 3);
        vx = c.p[i0 * 4]; vz = c.p[i0 * 4 + 1]; tx = c.p[j * 4]; tz = c.p[j * 4 + 1];
        await H.goNear(vx, vz);
        for (let q = 0; q < 30; q++) { H.step(4); await H.wait(40); }
        // every road point within 120 m: graded, no trunk on its core
        for (const r of H.chains(vx, vz)) for (let k = 0; k < r.n; k++) {
          const px = r.p[k * 4], pz = r.p[k * 4 + 1], ph = r.p[k * 4 + 2];
          if (r.p[k * 4 + 3] < 0 || Math.hypot(px - vx, pz - vz) > 120 || w.shoreAt(px, pz) < 4.5 || ((g.tiles.detail && g.tiles.detail.at(px, pz)) || {}).r !== 2) continue;
          out.graded.pts++;
          const d = g.tiles.groundAt(px, pz) - ph; if (Math.abs(d) > 0.3) out.graded.off.push([Math.round(px), Math.round(pz), +d.toFixed(2), r.k]);
          if (g.tiles.treesNear(px, pz, r.hw + 1).some((t) => !t.rock && Math.hypot(t.x - px, t.z - pz) < r.hw)) out.graded.trunks.push([Math.round(px), Math.round(pz), r.k]);
        }
      }
      // stand on the road's shoulder, a little back, looking along it
      const dx = tx - vx, dz = tz - vz, L = Math.hypot(dx, dz) || 1;
      H.look(vx - (dx / L) * 6 + (dz / L) * 4, vz - (dz / L) * 6 - (dx / L) * 4, tx, tz);
      const c = g.chase; if (c && 'pitch' in c) c.pitch = 0.12;
      for (let q = 0; q < 20; q++) { H.step(3); await H.wait(30); }
      out.cost = H.calls();
      { const ms = [...g.tiles.tiles.values()].flatMap((e) => e.installMs || []).sort((a, b) => b - a); out.cost.installMax = ms[0] || 0; out.cost.install95 = ms[Math.floor(ms.length * 0.05)] || 0;
        let wv = 0; for (const e of g.tiles.tiles.values()) (e.installMs || []).forEach((v, i) => { if (v > wv) { wv = v; out.cost.installWorst = [e.key, i, v, e.installMs.length]; } }); } // (the install's steps, ms: tiles.js INSTALL_BUDGET)
      return out;
    }, [lat, lon]);
    looks[name] = await look(page);
    await shot(page, `r5-1-${name}`);
    if (off) { cost[name] = { on: looks[name].cost, off: (await look(off)).cost }; await shot(off, `r5-1-${name}-off`); }
    log(name, JSON.stringify(looks[name]).slice(0, 900));
  }
  if (!OFF) {
    const bad = Object.entries(looks).filter(([, L]) => !L.near || L.near.d > 60 || L.graded.off.length > Math.max(2, L.graded.pts * 0.02) || L.graded.trunks.length);
    result('1 roads at every look outside the wilderness: the tile\'s roads in, one within 60 m, graded (the detail within 0.3 m), no trunk on a core', bad.length === 0,
      { looks: Object.fromEntries(Object.entries(looks).map(([k, L]) => [k, { chains: L.chains, near: L.near, pts: L.graded.pts, off: L.graded.off.slice(0, 4), offN: L.graded.off.length, trunks: L.graded.trunks.slice(0, 3) }])) });
    const progs = Object.values(cost).every((c) => c.on.programs <= c.off.programs + 0);
    result('0 the cost: no new shader program at any look; the bytes before the title', progs && bytes.roadsBin < 64 * 1024, { bytes, cost });
  }

  // ---- 2 the truck, frame by frame ------------------------------------------------------------------------------------
  const keys = await page.evaluate(() => [...window.__game.world.roads.routes.keys()]);
  const drives = {};
  for (const key of (ONLY || keys).filter((k) => keys.includes(k))) {
    drives[key] = await page.evaluate(async (key) => {
      const g = window.__game, H = window.__r5r, T = g.truck, S0 = T.spot(key, true);
      if (!S0) return { key, none: true };
      await H.goNear(S0.x, S0.z);
      const S = T.spot(key, true), out = { key, m: Math.round(S.path.len), frames: 0, gap: 0, sink: 0, belly: -9, worst: null, over: [] };
      let here = [S.x, S.z];
      for (let s = S.s0; s <= S.path.len - 2; s += 0.3) {
        T.pose(S.path, s);
        if (Math.hypot(T.x - here[0], T.z - here[1]) > 140) { await H.goNear(T.x, T.z); here = [T.x, T.z]; T.pose(S.path, s); }
        const t = H.tyres(); out.frames++;
        if (t.gap > out.gap) { out.gap = t.gap; out.worst = [Math.round(T.x), Math.round(T.z), +t.gap.toFixed(2), 'gap']; }
        if (t.sink > out.sink) out.sink = t.sink;
        if (t.belly > out.belly) out.belly = t.belly;
        if ((t.gap > 0.1 || t.sink > 0.1 || t.belly > 0) && out.over.length < 6) out.over.push([Math.round(T.x), Math.round(T.z), +t.gap.toFixed(2), +t.sink.toFixed(2), +t.belly.toFixed(2)]);
      }
      out.gap = +out.gap.toFixed(3); out.sink = +out.sink.toFixed(3); out.belly = +out.belly.toFixed(2);
      T.hide();
      return out;
    }, key);
    log('truck', key, JSON.stringify(drives[key]));
  }
  const badT = Object.values(drives).filter((r) => r.none || r.gap > 0.1 || r.sink > 0.1 || r.belly > 0);
  result('2 the truck on its four tyres every 0.3 m of every route: none 0.10 m off the ground drawn under it, none 0.10 m in, the ground never through the body', badT.length === 0,
    { routes: Object.keys(drives).length, frames: Object.values(drives).reduce((t, r) => t + (r.frames || 0), 0), worstGap: Math.max(...Object.values(drives).map((r) => r.gap || 0)), worstSink: Math.max(...Object.values(drives).map((r) => r.sink || 0)), bad: badT.map((r) => ({ key: r.key, none: r.none, gap: r.gap, sink: r.sink, belly: r.belly, over: r.over })) });

  // ---- 3 the known spots: the truck there, a shot ---------------------------------------------------------------------
  for (const key of ['40', '50', '80', '49', '25']) {
    if (ONLY && !ONLY.includes(key)) continue;
    const r = drives[key];
    if (!r || !r.worst) continue;
    await page.evaluate(async ([key, wx, wz]) => {
      const g = window.__game, H = window.__r5r, T = g.truck, S = T.spot(key, true);
      let bs = 0, bd = Infinity;
      for (let s = S.s0; s <= S.path.len; s += 0.5) { const p = S.path; let lo = 0, hi = p.pts.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.cum[m] <= s) lo = m; else hi = m; } const d = Math.hypot(p.pts[lo][0] - wx, p.pts[lo][1] - wz); if (d < bd) { bd = d; bs = s; } }
      await H.goNear(wx, wz);
      T.pose(S.path, bs);
      H.look(T.x + 7, T.z + 5, T.x, T.z);
      const c = g.chase; if (c && 'pitch' in c) c.pitch = 0.05;
      for (let q = 0; q < 10; q++) { H.step(2); await H.wait(30); }
      T.pose(S.path, bs);
      H.step(1);
    }, [key, r.worst[0], r.worst[1]]);
    await shot(page, `r5-3-truck-${key}`);
  }
  result('4 no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  log('ERROR', e.stack || e.message);
  results.push({ name: 'run', pass: false });
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.pass);
  log(`${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
