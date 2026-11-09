// Round 4, stream C: a few cabins at the edge (src/cabins.js, src/cabins.json). Headless Chromium against a running
// Vite, each check printed PASS or FAIL, a shot of a cabin on each lake:
//   1 the table: 20+ cabins over Burntside, White Iron, Vermilion and Gunflint, every one out (past the band, edge.js
//     zone 0), none by an entry point (180 m) or a campsite (100 m), most with a dock
//   2 built: at one cabin a lake, its tile's props hold it (world.cabins.built), no road on it
//   3 the ground: the floor 0.3 m over the highest ground it was built on (the 10 m mesh), never under the drawn ground
//     (the detail) by more than its re-seating; the piers reach the ground
//   4 no tree trunk inside a cabin or on its dock's line
//   5 the walker is held off (walks into the front: stops outside the box), and the dock is stood on (a box with a top)
//   6 the cost: no shader program and no mesh of its own (the same tile with ?cabins=off: the same props meshes)
//   7 no page errors
//
//   APP=http://localhost:5521 node scripts/r4-cabins-test.mjs [--shots <dir>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5521';
const HOME = Number(arg('home', 38));
const SHOTS = arg('shots', path.join(tmpdir(), 'r4-cabins-shots'));
mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
const TABLE = JSON.parse(readFileSync(new URL('../src/cabins.json', import.meta.url), 'utf8'));

const HELPERS = () => {
  const g = window.__game, H = window.__c4 = {};
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
  H.look = (x, z, tx, tz) => { H.standAt(x, z, Math.atan2(-(tz - z), tx - x)); const c = g.chase; if (c) { c.viewYaw = g.player.heading; c.forwardYaw = g.player.heading; if (c.snap) c.snap(); } H.step(20); };
  H.closeAll = () => { const o = g.outfitter; if (o.open) o.hide(); if (o.shelfOpen) o.shelf.close(); if (g.record && g.record.shown != null) { if (g.record.close) g.record.close(); else if (g.record.hide) g.record.hide(); } if (g.veil && g.veil.active && g.veil.skip) g.veil.skip(); };
  H.calls = () => { H.step(2); const i = g.renderer.info; return { calls: i.render.calls, programs: i.programs.length }; };
  // the meshes in the props group of the tile at (x, z)
  H.propsMeshes = (x, z) => {
    const e = g.tiles.tiles.get(g.tiles.key(...g.world.tileOf(x, z)));
    const p = e && e.group && e.group.children.find((o) => o.name === 'props');
    if (!p) return null;
    let n = 0; p.traverse((o) => { if (o.isMesh) n++; });
    return n;
  };
  // settle the detail where we are (the re-seat done)
  H.detail = async (ms = 40000) => { const D = g.tiles.detail, t0 = performance.now(); while (D && D.pending && D.pending() > 0 && performance.now() - t0 < ms) { H.step(4); await H.wait(50); } H.step(10); };
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
  await page.evaluate(async () => { const H = window.__c4; H.closeAll(); for (let i = 0; i < 30; i++) { H.step(10); await H.wait(30); } const d = window.__game.day; if (d.setClock && d.hours < 9) d.setClock(d.year, d.doy, 13); H.step(10); });
  return page;
}
const shot = async (page, name) => { const f = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: f }); log('shot', f); };

// one cabin a lake, a docked one where there is one
const PICK = Object.keys(TABLE.lakes).map(Number).map((lake) => {
  const list = TABLE.cabins.map((c, i) => ({ ...c, i })).filter((c) => c.lake === lake);
  return list.find((c) => c.dock) || list[0];
}).filter(Boolean);

try {
  const page = await open();
  // ---- 1 the table ---------------------------------------------------------------------------------------------------
  const t1 = await page.evaluate(() => { const g = window.__game; return { eps: g.world.entryPoints.map((e) => [e.x, e.z]), sites: g.world.campsites.map((c) => [c.x, c.z]) }; });
  await page.evaluate(async () => { const u = [...performance.getEntriesByType('resource')].map((e) => e.name).find((n) => /\/src\/edge\.js/.test(n)) || '/src/edge.js'; const m = await import(u); window.__edgeZone = m.EDGE.ready ? m.zoneAt : null; }); // (the module the page loaded: one EDGE)
  const zones = await page.evaluate((list) => ({ ready: typeof window.__edgeZone === 'function', z: list.map(([x, z]) => (window.__edgeZone ? window.__edgeZone(x, z) : -1)) }), TABLE.cabins.map((c) => [c.x, c.z]));
  const byLake = {}; for (const c of TABLE.cabins) byLake[c.lake] = (byLake[c.lake] || 0) + 1;
  const nearEp = TABLE.cabins.filter((c) => t1.eps.some(([x, z]) => Math.hypot(x - c.x, z - c.z) < 180)).length;
  const nearSite = TABLE.cabins.filter((c) => t1.sites.some(([x, z]) => Math.hypot(x - c.x, z - c.z) < 100)).length;
  const docks = TABLE.cabins.filter((c) => c.dock).length;
  result('1 the table: 20+ cabins on the four lakes, all out past the band, none by an entry point or a campsite, most docked', TABLE.cabins.length >= 20 && Object.keys(TABLE.lakes).every((k) => byLake[k] >= 3) && zones.ready && zones.z.every((z) => z === 0) && !nearEp && !nearSite && docks >= TABLE.cabins.length / 2, { n: TABLE.cabins.length, byLake, notOut: zones.z.filter((z) => z !== 0).length, edgeReady: zones.ready, nearEp, nearSite, docks });

  // ---- 2..5 at one cabin a lake ---------------------------------------------------------------------------------------
  const per = [];
  for (const c of PICK) {
    const r = await page.evaluate(async (c) => {
      const g = window.__game, H = window.__c4, out = { i: c.i, lake: c.lake };
      const F = { x: c.fx, z: c.fz }, X = { x: -c.fz, z: c.fx };
      const W = (a, b) => [c.x + X.x * a + F.x * b, c.z + X.z * a + F.z * b];
      // a dry spot to one side in front, to stand and look from
      await H.goto(...W(c.w / 2 + 10, c.d / 2 + 6)); await H.ready(c.x, c.z, 200);
      for (let i = 0; i < 40 && !(g.world.cabins && (g.world.cabins.built.has(c.i) || g.world.cabins.skipped.has(c.i))); i++) { H.step(10); await H.wait(50); }
      const S = g.world.cabins;
      out.built = !!(S && S.built.has(c.i)); out.skipped = S && S.skipped.get(c.i);
      if (!out.built) return out;
      const L = S.built.get(c.i);
      out.floor = +L.floor.toFixed(2); out.groundBuilt = L.ground.map((v) => +v.toFixed(2));
      // 3 the ground: the 10 m mesh under the footprint (what it was built on) and the drawn ground after the detail
      let meshMax = -Infinity, drawnMax = -Infinity;
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
        const [x, z] = W(-c.w / 2 + (i / 4) * c.w, -c.d / 2 + (j / 4) * c.d);
        meshMax = Math.max(meshMax, g.tiles.meshGroundAt(x, z)); drawnMax = Math.max(drawnMax, g.tiles.groundAt(x, z));
      }
      out.lift = +(L.floor - meshMax).toFixed(3);
      await H.detail();
      // the floor as drawn now: the props' re-seat moved it by the detail's dy at the cabin (its centre's, near enough)
      const D = g.tiles.detail, dy = D && D.dyAt ? D.dyAt(c.x, c.z) : 0;
      drawnMax = -Infinity; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { const [x, z] = W(-c.w / 2 + (i / 4) * c.w, -c.d / 2 + (j / 4) * c.d); drawnMax = Math.max(drawnMax, g.tiles.groundAt(x, z)); }
      out.dy = +(dy || 0).toFixed(2); out.overDrawn = +(L.floor + (dy || 0) - drawnMax).toFixed(2);
      // 4 trunks in the cabin (its footprint with the deck) or on the dock's line
      const near = g.tiles.treesNear(c.x, c.z, Math.hypot(c.w, c.d) / 2 + 6);
      const inBox = (t) => { const dx = t.x - c.x, dz = t.z - c.z, a = dx * X.x + dz * X.z, b = dx * F.x + dz * F.z; return Math.abs(a) < c.w / 2 + 0.3 && b > -c.d / 2 - 0.3 && b < c.d / 2 + 2.2; };
      out.trunks = near.filter((t) => !t.box && !t.rock && !t.log && !t.stump && !t.shape && Number.isFinite(t.r) && inBox(t)).length;
      out.box = near.some((t) => t.box && !Number.isFinite(t.top) && Math.hypot(t.x - c.x, t.z - c.z) < 3);
      // the dock
      if (L.dock) {
        const d = L.dock, mx = (d.from.x + d.to.x) / 2, mz = (d.from.z + d.to.z) / 2;
        const tops = g.tiles.treesNear(mx, mz, d.len / 2 + 1).filter((t) => t.box && Number.isFinite(t.top) && Math.abs(t.top - d.deckY) < 0.01);
        out.dock = { len: +d.len.toFixed(1), over: +(d.deckY - d.level).toFixed(2), endDepth: +(d.level - g.tiles.groundAt(d.to.x, d.to.z)).toFixed(2), stood: tops.length > 0 };
        const dl = Math.hypot(d.to.x - d.from.x, d.to.z - d.from.z) || 1;
        out.dockTrunks = 0;
        for (let s = 0; s <= dl; s += 1) { const x = d.from.x + (d.to.x - d.from.x) * s / dl, z = d.from.z + (d.to.z - d.from.z) * s / dl; out.dockTrunks += g.tiles.treesNear(x, z, 1).filter((t) => !t.box && !t.shape && Number.isFinite(t.r) && Math.hypot(t.x - x, t.z - z) < 1).length; }
      }
      // the look: from the side in front, across the deck to the cabin
      H.closeAll();
      let from = null;
      for (const [a, b] of [[c.w / 2 + 9, c.d / 2 + 7], [-c.w / 2 - 9, c.d / 2 + 7], [c.w / 2 + 12, 0], [-c.w / 2 - 12, 0], [0, c.d / 2 + 14]]) {
        const [x, z] = W(a, b), lake = g.world.lakes[c.lake - 1];
        if (g.tiles.groundAt(x, z) > (lake ? lake.level : -1e9) + 0.3) { from = [x, z]; break; }
      }
      if (from) { H.look(from[0], from[1], c.x, c.z); for (let i = 0; i < 15; i++) { H.step(6); await H.wait(40); } H.look(from[0], from[1], c.x, c.z); }
      out.from = from && from.map(Math.round);
      return out;
    }, c);
    await shot(page, `r4-cabin-${c.lake}-${c.i}`);
    // 5 the walker: W held from 6 m out in front, straight at the cabin's front wall for 4 s; never inside its walls
    if (r.built) {
      await page.evaluate((c) => { const H = window.__c4, F = { x: c.fx, z: c.fz }, X = { x: -c.fz, z: c.fx }, a = c.w / 4 + 1.0, b = c.d / 2 + 6; H.standAt(c.x + X.x * a + F.x * b, c.z + X.z * a + F.z * b, Math.atan2(F.z, -F.x)); H.look(c.x + X.x * a + F.x * b, c.z + X.z * a + F.z * b, c.x + X.x * a, c.z + X.z * a); }, c);
      await page.keyboard.down('KeyW');
      try {
        Object.assign(r, await page.evaluate((c) => {
          const g = window.__game, p = g.player, F = { x: c.fx, z: c.fz }, X = { x: -c.fz, z: c.fx }, yaw = Math.atan2(F.z, -F.x), x0 = p.x, z0 = p.z;
          let deepest = Infinity;
          for (let k = 0; k < 120; k++) {
            const ch = g.chase; if (ch) { ch.viewYaw = yaw; ch.forwardYaw = yaw; ch.viewPitch = 0.05; }
            g.step(1 / 30, 1);
            const dx = p.x - c.x, dz = p.z - c.z, b = dx * F.x + dz * F.z, a = dx * X.x + dz * X.z;
            if (Math.abs(a) < c.w / 2) deepest = Math.min(deepest, b);
          }
          return { walkIn: +deepest.toFixed(2), wallAt: +(c.d / 2).toFixed(2), walked: +Math.hypot(p.x - x0, p.z - z0).toFixed(1) };
        }, c));
      } finally { await page.keyboard.up('KeyW'); }
    }
    per.push(r);
    log('cabin', JSON.stringify(r));
  }
  const built = per.filter((r) => r.built);
  result('2 built: a cabin on each lake stands in its tile', built.length === PICK.length, { per: per.map((r) => ({ i: r.i, lake: r.lake, built: r.built, skipped: r.skipped })) });
  result('3 the ground: the floor 0.3 m over the highest ground it was built on, and over the drawn ground after the detail', built.length && built.every((r) => Math.abs(r.lift - 0.3) < 0.08 && r.overDrawn > -0.15), { per: built.map((r) => ({ i: r.i, lift: r.lift, overDrawn: r.overDrawn, dy: r.dy, ground: r.groundBuilt })) });
  result('4 no tree trunk in a cabin or on its dock', built.length && built.every((r) => r.trunks === 0 && !(r.dockTrunks > 0)), { per: built.map((r) => ({ i: r.i, trunks: r.trunks, dock: r.dockTrunks })) });
  const docked = built.filter((r) => r.dock);
  result('5 the walker held off the cabin; its dock stood on, over the water, its end in water', built.every((r) => r.box && r.walked > 1 && r.walkIn > r.wallAt - 0.05) && docked.length >= 2 && docked.every((r) => r.dock.stood && r.dock.over > 0.3 && r.dock.endDepth > 0.2), { per: built.map((r) => ({ i: r.i, box: r.box, walked: r.walked, walkIn: r.walkIn, wall: r.wallAt, dock: r.dock })) });

  // ---- 6 the cost: the same tile with ?cabins=off ---------------------------------------------------------------------
  const c0 = built.length ? PICK.find((c) => c.i === built[0].i) : PICK[0];
  const costOf = async (pg) => pg.evaluate(async (c) => {
    const H = window.__c4, F = { x: c.fx, z: c.fz };
    await H.goto(c.x + F.x * 14 + F.z * 10, c.z + F.z * 14 - F.x * 10); await H.ready(c.x, c.z, 200);
    H.look(c.x + F.x * 14 + F.z * 10, c.z + F.z * 14 - F.x * 10, c.x, c.z); for (let i = 0; i < 15; i++) { H.step(6); await H.wait(40); }
    return { meshes: H.propsMeshes(c.x, c.z), ...H.calls() };
  }, c0);
  const on = await costOf(page);
  const off = await open('?cabins=off');
  const offCost = await costOf(off);
  await off.context().close();
  result('6 the cost: no mesh and no shader program of their own', on.meshes === offCost.meshes && on.programs <= offCost.programs, { on, off: offCost });

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
