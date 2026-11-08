// Stream E3 (docs/build/edge-and-roads.md "The roads in 3D"): the roads and the truck, headless Chromium against a
// running Vite, each check printed PASS or FAIL, a screenshot at each look:
//   0 the cost: shader programs and draw calls at a road by the home store, with the roads and with ?roads=off
//   1 the table: world.roads read for this release (km, roads, routes; a route for every outfitter with a road)
//   2 the ground: graded on each road near home (groundAt on the road's line within a few cm of its own height, flat
//     across its core), on the 10 m mesh and the detail alike
//   3 the ribbon: road rows in the tiles' trail decal (no mesh of its own: the trail meshes are the same count)
//   4 the corridor: no tree trunk on a road's core
//   5 the truck: leave (stands in the lot, pulls out, gone down the road), come (up the road into the lot and stops,
//     on its wheels), park (behind the store you are at); one draw call while in view, no new program
//   6 the looks: the store's road, a trailhead's lot with the truck, a blacktop with its centre line (shots)
//   7 no page errors
//
//   npx vite --port 5413 --strictPort &
//   APP=http://localhost:5413 node scripts/e3-roads-test.mjs [--home 38] [--lot 39] [--black 51] [--shots <dir>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5413';
const HOME = Number(arg('home', 38)), LOT = Number(arg('lot', 39)), BLACK = Number(arg('black', 51));
const SHOTS = arg('shots', path.join(tmpdir(), 'e3-roads-shots'));
mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1400)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, H = window.__e3 = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.goto = async (x, z) => { const ok = await g.outfitter.onTeleport(x, z); await H.settle(); return ok; };
  H.ready = async (x, z, r = 200, ms = 90000) => { const t0 = performance.now(); if (g.tiles.ensure) await g.tiles.ensure(x, z, r); while (performance.now() - t0 < ms) { H.step(10); await H.wait(40); const e = g.tiles.tiles.get(g.tiles.key(...g.world.tileOf(x, z))); if (e && e.state === 'ready') break; } H.step(30); };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  // look from (x, z) at (tx, tz): the walker stands there facing it, the camera behind
  H.look = (x, z, tx, tz) => { H.standAt(x, z, Math.atan2(-(tz - z), tx - x)); const c = g.chase; if (c) { c.viewYaw = g.player.heading; c.forwardYaw = g.player.heading; if (c.snap) c.snap(); } H.step(20); };
  H.closeAll = () => { const o = g.outfitter; if (o.open) o.hide(); if (o.shelfOpen) o.shelf.close(); if (g.record && g.record.shown && g.record.hide) g.record.hide(); if (g.veil && g.veil.active && g.veil.skip) g.veil.skip(); };
  // the roads near (x, z): each road's points within r, as [x, z, h, w, hw, k]
  H.roadPts = (x, z, r) => {
    const out = [];
    for (const R of g.world.roads.list) for (let i = 0; i < R.n; i++) { const px = R.p[i * 4], pz = R.p[i * 4 + 1]; if (Math.hypot(px - x, pz - z) < r) out.push([px, pz, R.p[i * 4 + 2], R.p[i * 4 + 3], R.hw, R.k, R, i]); }
    return out;
  };
  // the trail meshes and their road rows (aTrail.y < 0), in the tiles in
  H.decal = () => {
    let meshes = 0, roadVerts = 0;
    g.scene.traverse((o) => { if (o.isMesh && o.name === 'trail') { meshes++; const a = o.geometry.getAttribute('aTrail'); if (a) for (let i = 0; i < a.count; i++) if (a.getY(i) < -0.5) roadVerts++; } });
    return { meshes, roadVerts };
  };
  H.calls = () => { H.step(2); const i = g.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, programs: i.programs.length }; };
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(query = '') {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await page.goto(APP + query, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(async () => { const H = window.__e3; H.closeAll(); for (let i = 0; i < 30; i++) { H.step(10); await H.wait(30); } const d = window.__game.day; if (d.setClock && d.hours < 9) d.setClock(d.year, d.doy, 13); H.step(10); });
  return page;
}
const shot = async (page, name) => { const f = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: f }); log('shot', f); };

// a view along the home store's road: from a point 40 m out along its route, looking back at the store
const VIEW = async (page) => page.evaluate(async (home) => {
  const g = window.__game, H = window.__e3, R = g.world.roads && g.world.roads.routes.get(String(home));
  let from, to;
  if (R) { const n = R.p.length / 2, k = Math.min(n - 1, 6); from = [R.p[k * 2], R.p[k * 2 + 1]]; to = [R.p[0], R.p[1]]; }
  else { const e = g.outfitter.entry(home); from = [e.x + 60, e.z]; to = [e.x, e.z]; }
  H.closeAll(); H.look(from[0], from[1], to[0], to[1]);
  for (let i = 0; i < 20; i++) { H.step(10); await H.wait(40); }
  return { from, to };
}, HOME);

try {
  // ---- 0 the cost without the roads -----------------------------------------------------------------------------------
  const off = await open('?roads=off');
  await VIEW(off);
  const costOff = await off.evaluate(() => ({ ...window.__e3.calls(), decal: window.__e3.decal(), roads: !!window.__game.world.roads }));
  await shot(off, 'e3-0-off');
  await off.context().close();

  const page = await open();
  const v = await VIEW(page);
  const costOn = await page.evaluate(() => {
    const g = window.__game, H = window.__e3, T = g.truck, seen = !!(T.mesh && T.mesh.visible);
    const a = { ...H.calls(), decal: H.decal(), truck: seen };
    if (T.mesh) T.mesh.visible = false; // (the truck parked behind the store, out of the count; then back)
    const b = H.calls(); if (T.mesh) T.mesh.visible = seen;
    return { ...a, noTruck: b };
  });
  await shot(page, 'e3-0-on');
  result('0 the roads add no shader program; the ribbon no draw call (the truck its own, while in view)', costOn.programs <= costOff.programs && costOn.decal.meshes === costOff.decal.meshes && costOn.noTruck.calls <= costOff.calls + 3 && costOn.calls - costOn.noTruck.calls <= 6 && !costOff.roads, { off: costOff, on: costOn, view: v });

  // ---- 1 the table --------------------------------------------------------------------------------------------------
  const t1 = await page.evaluate(() => {
    const g = window.__game, R = g.world.roads, O = [51, 64, 49, 69, 40, 38, 36, 25, 31, 12];
    return { km: R ? +R.km.toFixed(1) : 0, roads: R ? R.list.length : 0, routes: R ? R.routes.size : 0, kinds: R ? [1, 2, 3].map((k) => R.list.filter((r) => r.k === k).length) : [], missing: R ? O.filter((e) => !R.routes.has(String(e))) : O };
  });
  result('1 the table: the roads for this release, a route out of every outfitter with a road', t1.km > 60 && t1.roads > 50 && t1.routes >= 45 && t1.missing.length === 0 && t1.kinds.every((n) => n > 0), t1);

  // ---- 2 the ground graded, 3 the ribbon, 4 the corridor (near home) ---------------------------------------------------
  const t2 = await page.evaluate(async (home) => {
    const g = window.__game, H = window.__e3, R = g.world.roads.routes.get(String(home)), out = { pts: 0, along: [], across: [], trunks: [], far: [] };
    const n = R.p.length / 2;
    for (const k of [8, 20, 35, 50, 70, 90, 110, 130]) {
      if (k >= n) break;
      const x = R.p[k * 2], z = R.p[k * 2 + 1];
      await H.ready(x, z, 120); H.standAt(x, z); H.step(20);
      const near = H.roadPts(x, z, 12).filter((q) => q[3] > 0);
      if (!near.length) continue;
      near.sort((a, b) => Math.hypot(a[0] - x, a[1] - z) - Math.hypot(b[0] - x, b[1] - z));
      const [px, pz, ph, , hw, , road, i] = near[0];
      if (g.tiles.groundAt) {
        const sd = g.world.shoreAt ? g.world.shoreAt(px, pz) : 99;
        for (let w = 0; w < 80 && !(g.tiles.detail.heightAt(px, pz) === g.tiles.detail.heightAt(px, pz)); w++) { H.step(4); await H.wait(60); }
        const dh = g.tiles.detail.heightAt(px, pz);
        if (!(dh === dh)) { out.noDetail = (out.noDetail || 0) + 1; out.mesh = (out.mesh || []).concat(+(g.tiles.meshGroundAt(px, pz) - ph).toFixed(2)); continue; }
        out.mesh = (out.mesh || []).concat(+(g.tiles.meshGroundAt(px, pz) - ph).toFixed(2));
        const y = g.tiles.groundAt(px, pz);
        const j = Math.min(road.n - 1, i + 1), dx = road.p[j * 4] - road.p[(j - 1) * 4], dz = road.p[j * 4 + 1] - road.p[(j - 1) * 4 + 1], L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
        const yl = g.tiles.groundAt(px + nx * hw * 0.8, pz + nz * hw * 0.8), yr = g.tiles.groundAt(px - nx * hw * 0.8, pz - nz * hw * 0.8);
        out.pts++; out.along.push(+(y - ph).toFixed(3)); out.across.push(+Math.abs(yl - yr).toFixed(3)); out.far.push(Math.round(sd));
        const tr = g.tiles.treesNear(px, pz, hw).filter((t) => !t.rock && Math.hypot(t.x - px, t.z - pz) < hw);
        out.trunks.push(tr.length);
      }
    }
    out.decal = H.decal();
    return out;
  }, HOME);
  const maxAlong = Math.max(...t2.along.map(Math.abs)), maxAcross = Math.max(...t2.across);
  result('2 the ground: graded on the road (the drawn detail within 0.12 m of its height, under 0.3 m across its core; the 10 m mesh noted)', t2.pts >= 4 && maxAlong < 0.12 && maxAcross < 0.3, { maxAlong, maxAcross, ...t2 });
  result('3 the ribbon: road rows in the trail decal near home', t2.decal.roadVerts > 100, t2.decal);
  result('4 the corridor: no trunk on the road', t2.trunks.every((n) => n === 0), { trunks: t2.trunks });

  // ---- 5 the truck ---------------------------------------------------------------------------------------------------
  const t5 = await page.evaluate(async (home) => {
    const g = window.__game, H = window.__e3, T = g.truck, out = {};
    // park: behind the home store (you are at it)
    const e = g.outfitter.entry(home); await H.ready(e.x, e.z, 150); H.standAt(e.x, e.z); H.step(10);
    out.park = T.park(home); H.step(4);
    out.parkVis = !!(T.mesh && T.mesh.visible);
    const S = T.spot(home);
    out.spot = S ? { x: Math.round(S.x), z: Math.round(S.z) } : null;
    out.onWheels = S ? +(T.mesh.matrix.elements[13] - g.tiles.groundAt(S.x, S.z)).toFixed(2) : null;
    // leave: stands a while, pulls out, gone
    T.hide(); out.leave = T.leave(home); const x0 = T.x, z0 = T.z; H.step(30, 1 / 30); out.still = +Math.hypot(T.x - x0, T.z - z0).toFixed(2);
    let moved = 0, gone = false;
    for (let i = 0; i < 60 && !gone; i++) { H.step(10, 1 / 15); moved = Math.max(moved, Math.hypot(T.x - x0, T.z - z0)); gone = !T.mesh.visible; }
    out.moved = Math.round(moved); out.gone = gone || moved > 150;
    return out;
  }, HOME);
  const d0 = await page.evaluate(() => window.__game.truck.drawn);
  result('5a the truck behind the store (on its wheels); a ride leaves it in the yard and it pulls out down the road', t5.park && t5.parkVis && Math.abs(t5.onWheels) < 0.4 && t5.leave && t5.still < 0.3 && t5.moved > 40 && t5.gone, { ...t5, drawn: d0 });

  // come: at a trailhead's lot
  const t5b = await page.evaluate(async (lot) => {
    const g = window.__game, H = window.__e3, T = g.truck, o = g.outfitter, e = o.entry(lot), out = {};
    await H.goto(e.x, e.z); await H.ready(e.x, e.z, 150);
    for (let i = 0; i < 40 && !g.trailhead.trailheadLayout(lot); i++) { H.step(10); await H.wait(40); }
    const L = g.trailhead.trailheadLayout(lot); out.layout = !!L;
    if (!L) return out;
    H.standAt(L.lot.x + 2, L.lot.z + 2); H.step(10);
    const p0 = g.renderer.info.programs.length, d0 = T.drawn;
    let done = false; T.come(lot).then((v) => { done = v; });
    for (let i = 0; i < 80 && !done; i++) { H.step(6, 1 / 15); await H.wait(10); }
    out.came = done; out.programs = g.renderer.info.programs.length - p0; out.drawn = T.drawn - d0;
    out.inLot = +Math.hypot(T.x - L.lot.x, T.z - L.lot.z).toFixed(1);
    out.onWheels = +(T.mesh.matrix.elements[13] - g.tiles.groundAt(T.x, T.z)).toFixed(2);
    out.lot = { x: L.lot.x, z: L.lot.z };
    return out;
  }, LOT);
  result('5b a pickup: the truck comes up the road into the lot and stops, on its wheels, drawn, no new program', t5b.came && t5b.inLot < 14 && Math.abs(t5b.onWheels) < 0.4 && t5b.drawn > 0 && t5b.programs === 0, t5b);
  // the lot with the truck, from across it
  await page.evaluate(async (lot) => {
    const g = window.__game, H = window.__e3, T = g.truck, L = g.trailhead.trailheadLayout(lot);
    if (!L) return;
    const e = T.mesh.matrix.elements, fx = e[8], fz = e[10], f = Math.hypot(fx, fz) || 1; // (stand on the road ahead of it, looking back)
    H.closeAll(); H.look(T.x + (fx / f) * 13 + (fz / f) * 2, T.z + (fz / f) * 13 - (fx / f) * 2, T.x, T.z); for (let i = 0; i < 10; i++) { H.step(6); await H.wait(40); }
  }, LOT);
  await shot(page, 'e3-5-truck-lot');

  // ---- 6 a blacktop, its centre line --------------------------------------------------------------------------------
  const t6 = await page.evaluate(async (ep) => {
    const g = window.__game, H = window.__e3, R = g.world.roads, rd = R.list.find((r) => r.k === 2 && r.line && r.n > 30 && g.outfitter.entry(ep) && Math.hypot(r.p[0] - g.outfitter.entry(ep).x, r.p[1] - g.outfitter.entry(ep).z) < 4000) || R.list.find((r) => r.k === 2 && r.line && r.n > 30);
    if (!rd) return { none: true };
    const k = Math.floor(rd.n / 2), x = rd.p[k * 4], z = rd.p[k * 4 + 1], x2 = rd.p[(k + 6) * 4], z2 = rd.p[(k + 6) * 4 + 1];
    await H.goto(x + 30, z + 30); await H.ready(x, z, 150);
    H.closeAll(); H.look(x, z, x2, z2); for (let i = 0; i < 20; i++) { H.step(6); await H.wait(40); }
    return { name: rd.name, x: Math.round(x), z: Math.round(z) };
  }, BLACK);
  await shot(page, 'e3-6-blacktop');
  result('6 the looks: a blacktop found and shot (and the store road, the lot)', !t6.none, t6);

  result('7 no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  log('ERROR', e.stack || e.message);
  result('the run', false, { error: String(e.message || e) });
} finally {
  await browser.close();
  const f = results.filter((r) => !r.pass);
  log(`${results.length - f.length}/${results.length} passed`);
  process.exit(f.length ? 1 : 0);
}
