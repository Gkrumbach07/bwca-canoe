// Round 2, markers (the owner, 2026-11-05: the outfitters' pins and spawns at the stores as built, the entry points
// their own marks, the campsites where their rings are): the acceptance checks, headless.
//   npx vite --port 5211 --strictPort   (in the background), then
//   APP=http://localhost:5211 node scripts/r2-markers-test.mjs [--shots]
// For each of the fourteen outfitters a season is begun there (title.newSeason), its store built, and:
//   1 the table (src/outfitter-places.json, outfitters.js placeOf) against the store as built: the door within 1.5 m, the
//     water by the dock within 6 m (the live dock's length follows the drawn ground and the day's water: up to 4.9 m along)
//   2 every map's outfitter marker within 15 m of the built door: the start map's pin (outfitterHomes), the book's and the
//     sheet's store (map-render.js paintEntries' hits), the counter's sketch (the landing's store)
//   3 the season's spawn: on foot, on dry ground, within 10 m of the door
//   4 no outfitter's name or label holds a number
// then a ride to Thimbleberry (6, Slim Lake) and to Lost Chain (51) lands on dry ground within 10 m of the door, and 50
// campsites (a seeded sample of those built, with the ones whose ring is off their point) have their map spot (c.fire)
// within 3 m of the ring as built (c.grate). The exit code is the number of FAILs. --shots: docs/build/shots/r2-markers-*.png
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://localhost:5211';
const SHOTS = process.argv.includes('--shots') || !!process.env.SHOTS_ONLY, ONLY = !!process.env.SHOTS_ONLY; // SHOTS_ONLY=1 SHOT_TAG=before: the shots alone (an older build, for a before)
const SHOT_DIR = path.resolve('docs/build/shots');
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
function findPw() {
  if (process.env.PW) return process.env.PW;
  const base = path.join(homedir(), '.npm/_npx');
  for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; }
  return 'playwright-core';
}
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(homedir(), 'Library/Caches/ms-playwright');
  const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; }
  return undefined;
}
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more)); };

const HELPERS = () => {
  const g = window.__game, H = window.__r2m = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.built = async (ep, ms = 90000) => { const t0 = performance.now(); for (;;) { const L = g.props.storeLayout(ep); if (L) return L; if (performance.now() - t0 > ms) return null; H.step(15); await H.wait(40); } };
  H.arrived = async (ms = 90000) => { const o = g.outfitter, t0 = performance.now(); while ((o.arrival || g.player.teleporting) && performance.now() - t0 < ms) { H.step(15); await H.wait(40); } H.step(30); };
  H.closeAll = () => { const o = g.outfitter; if (o.open) o.hide(); if (o.shelfOpen) o.shelf.close(); if (g.veil && g.veil.active && g.veil.skip) g.veil.skip(); };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await page.goto(`${APP}/?detail=10`, { timeout: 240000, waitUntil: "commit" });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.outfitters && window.__game.props && typeof window.__game.step === 'function', null, { timeout: 240000, polling: 500 });
  await page.evaluate(HELPERS);
  log('game loaded');

  if (!ONLY) {
  // the map's markers, as map-render.js paints them (its hits), for the whole country
  const markers = await page.evaluate(async () => {
    const g = window.__game, MR = await import('/src/map-render.js');
    const stub = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
    const hits = [];
    if (typeof MR.paintEntries === 'function') MR.paintEntries(stub, g.world, (x, z) => [(x + 500000) / 1000, (z + 500000) / 1000], 1e9, 1e9, 1, { names: true, hits });
    return { stores: hits.filter((h) => h.kind === 'store').map((h) => ({ ep: h.ep, x: h.x, z: h.z })), eps: hits.filter((h) => h.kind === 'ep').length, has: typeof MR.paintEntries === 'function' };
  });
  const homes = await page.evaluate(() => window.__game.outfitters.outfitterHomes().map((h) => ({ ep: h.ep, name: h.name, x: h.x, z: h.z, near: h.near })));
  const EPS = await page.evaluate(() => window.__game.outfitters.OUTFITTER_EPS.slice());
  result('0 the sheet paints every entry point and fourteen stores', markers.has && markers.stores.length === EPS.length && markers.eps === (await page.evaluate(() => window.__game.world.entryPoints.length)), { stores: markers.stores.length, eps: markers.eps });

  const rows = [];
  for (const ep of EPS) {
    const r = await page.evaluate(async (ep) => {
      const g = window.__game, H = window.__r2m, t = g.title, o = g.outfitter;
      H.closeAll();
      t.setPick('adventure');
      await t.newSeason(g.world.entryPoints.find((e) => e.ep === ep), { confirm: false });
      t.close();
      const L = await H.built(ep);
      await H.arrived();
      H.closeAll();
      const p = g.player, pl = g.outfitters.placeOf(ep), land = o.landing(ep);
      if (!L) return { ep, built: false, source: pl && pl.source };
      const dDoor = (q) => (q ? +Math.hypot(q.x - L.door.x, q.z - L.door.z).toFixed(2) : null);
      return {
        ep, built: true, source: pl.source, name: pl.name,
        tableDoor: dDoor(pl.door), tableDock: +Math.hypot(pl.dock.x - L.dockSide.x, pl.dock.z - L.dockSide.z).toFixed(2),
        counter: dDoor(land.store), storeMark: dDoor(pl.store),
        spawn: dDoor({ x: p.x, z: p.z }), onFoot: !!p.onFoot, shore: +g.world.shoreAt(p.x, p.z).toFixed(1), mode: p.mode,
        epFar: Math.round(Math.hypot(L.centre.x - pl.nearEp.x, L.centre.z - pl.nearEp.z)),
        door: { x: L.door.x, z: L.door.z },
      };
    }, ep);
    const home = homes.find((h) => h.ep === ep), mk = markers.stores.find((m) => m.ep === ep);
    if (r.built) { r.pin = home ? +Math.hypot(home.x - r.door.x, home.z - r.door.z).toFixed(2) : null; r.sheet = mk ? +Math.hypot(mk.x - r.door.x, mk.z - r.door.z).toFixed(2) : null; r.near = home && home.near; }
    log(JSON.stringify(r));
    rows.push(r);
  }
  const built = rows.filter((r) => r.built);
  result('1 the table matches the stores as built (door within 1.5 m, the dock\'s tie-up within 6 m)', built.length === EPS.length && built.every((r) => r.source === 'table' && r.tableDoor <= 1.5 && r.tableDock <= 6), { built: built.length, worstDoor: Math.max(...built.map((r) => r.tableDoor)), worstDock: Math.max(...built.map((r) => r.tableDock)) });
  const worst = (k) => Math.max(...built.map((r) => r[k] ?? Infinity));
  result('2 every map\'s outfitter marker within 15 m of the built door (start pin, sheet/book, counter)', built.length === EPS.length && worst('pin') <= 15 && worst('sheet') <= 15 && worst('counter') <= 15, { pin: worst('pin'), sheet: worst('sheet'), counter: worst('counter') });
  result('3 a new season starts on foot, on dry ground, within 10 m of the door', built.every((r) => r.onFoot && r.shore > 0 && r.spawn <= 10), { worst: worst('spawn'), drySmallest: Math.min(...built.map((r) => r.shore)), off: built.filter((r) => !(r.onFoot && r.shore > 0 && r.spawn <= 10)).map((r) => r.ep) });
  const labels = [...homes.map((h) => h.name), ...rows.map((r) => r.name || '')];
  result('4 no outfitter name holds a number; each says which entry point it is near in words', labels.every((s) => s && !/\d/.test(s)) && homes.every((h) => /^near entry point \d+, \S/.test(h.near || '')), { names: homes.map((h) => h.name).join(' | '), ep6: (homes.find((h) => h.ep === 6) || {}).near });
  const r6 = rows.find((r) => r.ep === 6);
  result('5 Slim Lake (6): the store\'s marker is at the store, not the put-in', r6 && r6.sheet <= 15 && r6.epFar > 500, { storeFromEp: r6 && r6.epFar, sheet: r6 && r6.sheet });

  // rides: from Loon Narrows (25) to 6 and 51
  const rides = [];
  for (const to of [6, 51]) {
    const r = await page.evaluate(async (to) => {
      const g = window.__game, H = window.__r2m, t = g.title, o = g.outfitter;
      H.closeAll(); t.setPick('sandbox');
      await t.newSeason(g.world.entryPoints.find((e) => e.ep === 25), { confirm: false }); t.close();
      await H.built(25); await H.arrived(); H.closeAll();
      o.at = o.landing(25);
      const p = g.rides.take(to);
      for (let i = 0; i < 600 && (g.rides.busy || (g.veil && g.veil.active)); i++) { H.step(10, 1 / 10); await H.wait(20); }
      await p; await H.settle();
      const L = await H.built(to); await H.arrived(); H.closeAll();
      const pl = g.player;
      return L ? { to, d: +Math.hypot(pl.x - L.door.x, pl.z - L.door.z).toFixed(2), shore: +g.world.shoreAt(pl.x, pl.z).toFixed(1), onFoot: !!pl.onFoot } : { to, built: false };
    }, to);
    log(JSON.stringify(r)); rides.push(r);
  }
  result('6 a ride arrives on dry ground within 10 m of the door (6, 51)', rides.every((r) => r.onFoot && r.shore > 0 && r.d <= 10), { rides });

  // campsites: the map's spot (c.fire) against the ring as built (c.grate)
  const camps = await page.evaluate(async () => {
    const g = window.__game, H = window.__r2m, w = g.world, cs = w.campsites;
    // the ones whose ring is off their point, visited: a teleport near each of a dozen
    const off = cs.map((c, i) => [c, i]).filter(([c]) => c.fire && Math.hypot(c.fire.x - c.x, c.fire.z - c.z) > 1);
    for (const [c] of off.filter((_, k) => k % Math.max(1, Math.floor(off.length / 12)) === 0).slice(0, 12)) {
      await g.outfitter.onTeleport(c.x, c.z); await H.settle();
      for (let k = 0; k < 120 && !c.grate; k++) { H.step(10); await H.wait(30); }
    }
    const have = cs.map((c, i) => [c, i]).filter(([c]) => c.grate && c.fire);
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const offBuilt = have.filter(([c]) => Math.hypot(c.fire.x - c.x, c.fire.z - c.z) > 1), pick = new Map();
    for (const q of offBuilt.slice(0, 12)) pick.set(q[1], q);
    for (let k = 0; pick.size < 50 && k < 5000 && have.length; k++) { const q = have[Math.floor(rnd() * have.length)]; pick.set(q[1], q); }
    const d = [...pick.values()].map(([c, i]) => ({ i, d: +Math.hypot(c.fire.x - c.grate.x, c.fire.z - c.grate.z).toFixed(2), off: +Math.hypot(c.fire.x - c.x, c.fire.z - c.z).toFixed(1) }));
    return { n: d.length, offIn: d.filter((q) => q.off > 1).length, worst: d.reduce((m, q) => Math.max(m, q.d), 0), bad: d.filter((q) => q.d > 3), fires: w.campFires, moved: w.campMoved };
  });
  result('7 50 campsites: the map spot within 3 m of the ring as built', camps.n >= 50 && camps.worst <= 3, camps);

  }
  if (SHOTS) {
    // the book's and the sheet's map round Slim Lake (6), and the counter at Lost Chain (51)
    const shot = async (name, fn, arg) => { await page.evaluate(fn, arg); await page.waitForTimeout(1500); const b = await page.screenshot({ type: 'png' }); writeFileSync(path.join(SHOT_DIR, `r2-markers-${name}.png`), b); log('shot', name); };
    const sheetAt = async ({ x, z, span }) => {
      const g = window.__game, H = window.__r2m, h = g.hud; H.closeAll();
      h.setMode('sheet'); if (h.view) { h.view.cx = x; h.view.cz = z; h.view.span = span; }
      for (let i = 0; i < 40; i++) { H.step(2); await H.wait(60); }
    };
    await page.evaluate(async () => { const g = window.__game, H = window.__r2m, t = g.title; H.closeAll(); t.setPick('sandbox'); await t.newSeason(g.world.entryPoints.find((e) => e.ep === 6), { confirm: false }); t.close(); for (let i = 0; i < 200 && (g.outfitter.arrival || g.player.teleporting); i++) { H.step(15); await H.wait(40); } H.closeAll(); });
    const S6 = JSON.parse(readFileSync(path.resolve('src/outfitter-places.json'), 'utf8')).places[6].store;
    const e6 = await page.evaluate((s) => { const e = window.__game.world.entryPoints.find((q) => q.ep === 6); return { x: (e.x + s[0]) / 2, z: (e.z + s[1]) / 2 }; }, S6);
    await shot(process.env.SHOT_TAG ? `ep6-sheet-${process.env.SHOT_TAG}` : 'ep6-sheet', sheetAt, { ...e6, span: 4000 });
    await shot(process.env.SHOT_TAG ? `ep6-wide-${process.env.SHOT_TAG}` : 'ep6-wide', sheetAt, { ...e6, span: 16000 });
    // the counter's sketch at Lost Chain (51), drawn as the counter draws it (outfitter.js drawSideMap's rows), on a
    // sheet of its own over the game (the counter itself opens behind the summer help's talk on a new season)
    await shot(process.env.SHOT_TAG ? `counter-51-${process.env.SHOT_TAG}` : 'counter-51', async () => {
      const g = window.__game, H = window.__r2m, o = g.outfitter, CM = await import('/src/counter-map.js');
      g.hud.setMode('hidden'); if (g.journal && g.journal.close) g.journal.close(); H.closeAll();
      const cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;left:200px;top:100px;width:1040px;height:700px;z-index:99999;background:#efe6cf';
      document.body.appendChild(cv);
      const a = o.landing(51), rows = g.rides.offer(51).map((r) => { const l = o.entry(r.ep) || {}, m = l.store || l; return { ep: r.ep, x: m.x, z: m.z, name: l.name, price: r.price, outfitter: r.outfitter !== false }; });
      const here = { ep: 51, x: (a.store || a).x, z: (a.store || a).z }, hot = 49;
      for (let i = 0; i < 20; i++) { CM.drawCounterMap(cv, { world: g.world, here, rows, hot, sandbox: false }); await H.wait(150); }
    });
  }
} finally {
  await browser.close();
}
const fails = results.filter((r) => !r.pass).length;
log(`${results.length - fails} pass, ${fails} fail`);
process.exitCode = fails;
