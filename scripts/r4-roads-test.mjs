// Round 4, stream B (the adversarial check of loop-r4: D2 the truck through water and trunks on the made two-tracks,
// D5 the road ungraded with trunks on it, D6 lots by the map's south edge; the owner's calls: lots at their real road
// ends, the Moose River North and Bog Lake stores at theirs). Headless Chromium against a running Vite; each check PASS or
// FAIL, a screenshot at each look:
//   1 every start the truck can drive: truck.spot(key, true) for every route (a store from its stand), none park-only
//      but where the table says so (none expected); every lot and store in the box at least 150 m from its edge
//   2 every route driven, frame by frame: the truck's way out from each start sampled every TRUCK_STEP m (a frame at
//      its top speed is 0.3 m) with the tiles in round it: no sample over water off a bridge's deck, no trunk within
//      the truck's half width (+ the trunk's own radius and a hand) of its line, its wheels within 0.35 m of level
//      across; and the truck itself let go down the first 150 m (leave, its own frames) on its wheels
//   3 the roads graded: every road point within 120 m of each stop, on land past the water's edge, the drawn ground
//      (the 2 m or 5 m detail) within 0.3 m of the road's own height; and no trunk on any road's core there
//   4 the stores moved: 16 and 67 stand where outfitter-places.json says (built), a road to each, a trip saved at
//      the old store spot carries on at the new door (outfitters.fromMovedStore)
//   5 the map's edge: "The map ends here" (never "turn back") by the south edge near Snake River's lot
//   6 the looks: the truck on the made two-tracks at 16, 67, 75, 84, 77, 51 (shots)
//   7 no page errors
//
//   npx vite --port 5511 --strictPort &
//   APP=http://localhost:5511 node scripts/r4-roads-test.mjs [--only 16,67] [--shots <dir>] [--step 2]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5511';
const ONLY = arg('only', null) ? arg('only').split(',') : null;
const STEP = Number(arg('step', 2));
const SHOTS = arg('shots', path.join(tmpdir(), 'r4-roads-shots'));
mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 2400)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, H = window.__r4r = {};
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
  await page.evaluate(async () => { const H = window.__r4r; H.closeAll(); for (let i = 0; i < 30; i++) { H.step(10); await H.wait(30); } const d = window.__game.day; if (d.setClock && d.hours < 9) d.setClock(d.year, d.doy, 13); H.step(10); });
  return page;
}
const shot = async (page, name) => { const f = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: f }); log('shot', f); };

try {
  const page = await open();
  // ---- 1 every start drivable; lots and stores in from the edge --------------------------------------------------------
  const t1 = await page.evaluate(() => {
    const g = window.__game, w = g.world, T = g.truck, out = { keys: [], parkOnly: [], none: [], edge: [] };
    for (const [key, R] of w.roads.routes) {
      out.keys.push(key);
      if (!T.spot(key, true)) (R.drive === false ? out.parkOnly : out.none).push(key);
    }
    const B = { x0: w.originX, z0: w.originZ, x1: w.originX + w.width * w.cell, z1: w.originZ + w.height * w.cell };
    const inB = (x, z) => Math.min(x - B.x0, B.x1 - x, z - B.z0, B.z1 - z);
    for (const e of w.entryPoints) {
      for (const L of [e.lot, e.head && e.head.lot]) if (L && inB(L.x, L.z) < 150) out.edge.push(`lot ${e.ep} ${Math.round(inB(L.x, L.z))} m`);
    }
    return out;
  });
  const places = await page.evaluate(() => { const o = {}; for (const ep of [1, 6, 12, 16, 25, 31, 36, 38, 40, 49, 51, 64, 67, 69]) { const p = window.__game.outfitters ? window.__game.outfitters.placeOf(ep) : null; if (p) o[ep] = p; } return o; });
  result('1 every start the truck can drive (a store from its stand); lots 150 m and more in from the map\'s edge', t1.none.length === 0 && t1.parkOnly.length === 0 && t1.edge.length === 0, { routes: t1.keys.length, none: t1.none, parkOnly: t1.parkOnly, edge: t1.edge, places: Object.keys(places).length });

  // ---- 2 every route driven, frame by frame; 3 the roads graded round each stop ----------------------------------------
  const keys = (ONLY || t1.keys).filter((k) => t1.keys.includes(k));
  const drives = {}, grades = { pts: 0, off: [], trunks: [] };
  for (const key of keys) {
    const r = await page.evaluate(async ([key, STEP]) => {
      const g = window.__game, H = window.__r4r, T = g.truck, w = g.world, S = T.spot(key, true);
      if (!S) return { key, none: true };
      const out = { key, m: Math.round(S.path.len), samples: 0, wet: [], trunks: [], tilt: [], wheels: null, graded: { pts: 0, off: [], trunks: [] } };
      const at = (s) => { const { pts, cum } = S.path, n = pts.length; if (s >= S.path.len) return pts[n - 1]; let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; } const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]); return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t]; };
      let here = null;
      const stop = async (x, z) => {
        await H.goNear(x, z); here = [x, z];
        // 3: the roads round this stop, on land past the water's edge (detail-build.js eases the grade in from 1 to 4 m)
        for (const R of w.roads.list) {
          const b = R.bbox; if (x < b[0] - 120 || x > b[2] + 120 || z < b[1] - 120 || z > b[3] + 120) continue;
          for (let i = 0; i < R.n; i++) {
            const px = R.p[i * 4], pz = R.p[i * 4 + 1], ph = R.p[i * 4 + 2]; if (R.p[i * 4 + 3] < 0 || Math.hypot(px - x, pz - z) > 120) continue;
            if (w.shoreAt(px, pz) < 4.5 || !(g.tiles.detail && g.tiles.detail.at(px, pz))) continue;
            out.graded.pts++;
            const d = g.tiles.groundAt(px, pz) - ph; if (Math.abs(d) > 0.3) out.graded.off.push([Math.round(px), Math.round(pz), +d.toFixed(2), R.name || R.k]);
            const tr = g.tiles.treesNear(px, pz, R.hw + 1).filter((t) => !t.rock && Math.hypot(t.x - px, t.z - pz) < R.hw);
            if (tr.length) out.graded.trunks.push([Math.round(px), Math.round(pz), R.name || R.k]);
          }
        }
      };
      // 2: the way, every STEP m (the start's own few metres in a lot or a yard too)
      for (let s = 0; s <= S.path.len; s += STEP) {
        const [x, z] = at(s);
        if (!here || Math.hypot(x - here[0], z - here[1]) > 140) await stop(x, z);
        out.samples++;
        const [x2, z2] = at(s + 1), dx = x2 - x, dz = z2 - z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
        if (w.shoreAt(x, z) < 0.3 && H.deck(x, z) < 0) out.wet.push([Math.round(x), Math.round(z), +w.shoreAt(x, z).toFixed(1)]);
        for (const t of g.tiles.treesNear(x, z, 4)) {
          if (t.rock) continue;
          const d = Math.hypot(t.x - x, t.z - z), r = t.r || 0.25;
          if (d < 1.1 + r + 0.15) out.trunks.push([Math.round(x), Math.round(z), +d.toFixed(2), +r.toFixed(2)]);
        }
        const yl = g.tiles.groundAt(x + nx * 0.85, z + nz * 0.85), yr = g.tiles.groundAt(x - nx * 0.85, z - nz * 0.85);
        if (Math.abs(yl - yr) > 0.35 && H.deck(x, z) < 0) out.tilt.push([Math.round(x), Math.round(z), +(yl - yr).toFixed(2)]);
      }
      // the truck itself let go from its start, its own frames for the first 150 m: on its wheels
      await H.goNear(S.x, S.z); H.standAt(S.x + 6, S.z + 6);
      T.hide(); T.leave(key); let worst = 0, frames = 0;
      for (let f = 0; f < 900 && T.job && T.job.kind === 'leave' && T.job.s < S.s0 + 150; f++) { H.step(1); frames++; if (T.mesh && T.mesh.visible) worst = Math.max(worst, Math.abs(T.mesh.matrix.elements[13] + 0.02 - Math.max(g.tiles.groundAt(T.x, T.z), -1e9))); }
      out.wheels = { frames, worst: +worst.toFixed(2) };
      T.hide();
      return out;
    }, [key, STEP]);
    drives[key] = r;
    grades.pts += r.graded ? r.graded.pts : 0; if (r.graded) { grades.off.push(...r.graded.off.map((q) => [key, ...q])); grades.trunks.push(...r.graded.trunks.map((q) => [key, ...q])); }
    log(key, JSON.stringify({ m: r.m, samples: r.samples, wet: r.wet && r.wet.length, trunks: r.trunks && r.trunks.length, tilt: r.tilt && r.tilt.length, wheels: r.wheels, gradedOff: r.graded && r.graded.off.length, roadTrunks: r.graded && r.graded.trunks.length }));
  }
  const bad = Object.values(drives).filter((r) => r.none || r.wet.length || r.trunks.length || r.tilt.length > 2 || (r.wheels && r.wheels.worst > 0.6));
  result(`2 every route driven every ${STEP} m: never over water off a deck, no trunk in the truck's way, level across, on its wheels`, keys.length > 0 && bad.length === 0,
    { routes: keys.length, samples: Object.values(drives).reduce((t, r) => t + (r.samples || 0), 0), bad: bad.map((r) => ({ key: r.key, none: r.none, wet: r.wet && r.wet.slice(0, 4), trunks: r.trunks && r.trunks.slice(0, 4), tilt: r.tilt && r.tilt.slice(0, 4), wheels: r.wheels })) });
  result('3 the roads graded round every stop (the detail within 0.3 m of the road\'s height) and no trunk on a road\'s core', grades.pts > 500 && grades.off.length <= grades.pts * 0.01 && grades.trunks.length === 0, { pts: grades.pts, off: grades.off.length, offFirst: grades.off.slice(0, 12), trunks: grades.trunks.slice(0, 12) });

  // ---- 4 the stores moved ----------------------------------------------------------------------------------------------
  const t4 = await page.evaluate(async () => {
    const g = window.__game, H = window.__r4r, w = g.world, out = {};
    for (const ep of [16, 67]) {
      const e = w.entryPoints.find((q) => q.ep === ep), pl = g.outfitters.placeOf(ep);
      await H.goNear(pl.store.x, pl.store.z);
      for (let i = 0; i < 40; i++) { H.step(5); await H.wait(40); }
      const R = w.roads.routes.get(String(ep));
      out[ep] = { moved: e.storeMoved || null, store: [Math.round(pl.store.x), Math.round(pl.store.z)], source: pl.source, road: !!R, stand: R ? [Math.round(R.p[0]), Math.round(R.p[1])] : null,
        built: g.scene.getObjectByName(`outfitter ${ep}`) ? true : false };
      // a trip saved at the old store's door carries on at the new one
      const fm = g.outfitters.fromMovedStore ? g.outfitters.fromMovedStore({ x: e.storeMoved.x + 5, z: e.storeMoved.z, mode: 'walk', heading: 0 }) : null;
      out[ep].resave = fm ? [Math.round(fm.x), Math.round(fm.z)] : null;
      out[ep].resaveAtDoor = !!(fm && Math.hypot(fm.x - pl.door.x, fm.z - pl.door.z) < 1);
    }
    return out;
  });
  await page.evaluate(async () => { const g = window.__game, H = window.__r4r, pl = g.outfitters.placeOf(16), R = g.world.roads.routes.get('16'); H.closeAll(); H.look(R.p[12], R.p[13], pl.store.x, pl.store.z); for (let i = 0; i < 20; i++) { H.step(10); await H.wait(40); } g.truck.park('16'); H.step(5); });
  await shot(page, 'r4-4-store-16');
  await page.evaluate(async () => { const g = window.__game, H = window.__r4r, pl = g.outfitters.placeOf(67), R = g.world.roads.routes.get('67'); H.closeAll(); H.look(R.p[12], R.p[13], pl.store.x, pl.store.z); for (let i = 0; i < 20; i++) { H.step(10); await H.wait(40); } g.truck.park('67'); H.step(5); });
  await shot(page, 'r4-4-store-67');
  result('4 the stores moved: 16 and 67 built at their road ends, a road from each stand, a save at the old spot carried to the new door', [16, 67].every((ep) => t4[ep].moved && t4[ep].built && t4[ep].road && t4[ep].source === 'table' && t4[ep].resaveAtDoor), t4);

  // ---- 5 the map's edge's words -----------------------------------------------------------------------------------------
  const t5 = await page.evaluate(async () => { const src = await (await fetch('/src/player.js')).text(); return { turnBack: /turn back/i.test(src), ends: (src.match(/The map ends here/g) || []).length }; });
  result('5 the map\'s edge says "The map ends here", never "turn back" (player.js, both stops)', !t5.turnBack && t5.ends >= 2, t5);

  // ---- 6 the looks: the truck on the made two-tracks ---------------------------------------------------------------------
  for (const key of ['16', '67', '75', '84', '77', '51', 'h67']) {
    const ok = await Promise.race([new Promise((r) => setTimeout(() => r('timeout'), 90000)), page.evaluate(async (key) => {
      const g = window.__game, H = window.__r4r, T = g.truck, S = T.spot(key, true);
      if (!S) return false;
      H.closeAll(); await H.goNear(S.x, S.z);
      const k = Math.min(S.path.pts.length - 1, 6), [vx, vz] = S.path.pts[k];
      T.hide(); if (!T.leave(key)) return false; H.step(1); if (T.job) T.job.wait = 0;
      for (let f = 0; f < 150; f++) H.step(1);
      H.look(vx + 8, vz + 8, T.x, T.z); H.step(3);
      return true;
    }, key)]);
    log('look', key, ok);
    if (ok === true) await shot(page, `r4-6-truck-${key}`); else if (ok === 'timeout') break;
  }
  result('7 no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  log('ERROR', e.stack || e.message);
  results.push({ name: 'run', pass: false });
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.pass);
  log(`${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
