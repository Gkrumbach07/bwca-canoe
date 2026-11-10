// r4-final contact sheet extras (docs/build/shots/r4-final-contact.png): shots the regression rigs don't take, in a season
// begun at --home (31): the map at the Quetico border (washed as out, its dashed outline), the moved Moose River North
// store (16) from its dock, the Bog Lake store (67) at its road end. No checks: shots only.
//   APP=http://localhost:5571 node scripts/r4-final-contact.mjs [--home 31] [--shots <dir>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5411';
const HOME = Number(arg('home', 31));
const SHOTS = arg('shots', path.join(process.cwd(), 'contact-shots'));
mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
// places by latitude and longitude (index.json proj), in the page
const SPOTS = {
  lakeOne: [47.94, -91.48], basswood: [48.08, -91.62], mooseLake: [47.985, -91.5], farmLake: [47.96, -91.67],
  whiteIron: [47.89, -91.79], burntside: [47.93, -92.05], vermilion: [47.86, -92.3], superior: [47.84, -89.97], kawnipi: [48.33, -91.3], ely: [47.9016, -91.8573], border: [48.12, -91.55],
};

const HELPERS = (SPOTS) => {
  const g = window.__game, H = window.__edge = {};
  const P = g.world.meta.proj;
  H.xz = ([lat, lon]) => ({ x: (lon - P.lon0) * P.mPerDegLon, z: -(lat - P.lat0) * P.mPerDegLat });
  H.at = {}; for (const [k, v] of Object.entries(SPOTS)) H.at[k] = H.xz(v);
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 60000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.go = async (k) => { const q = H.at[k] || k; if (g.outfitter.open) g.outfitter.hide(); if (g.outfitter.visit && g.outfitter.leave) try { g.outfitter.leave(); } catch { /* */ } const ok = await g.player.teleport(q.x, q.z); await H.settle(); return ok; };
  H.sign = () => { const el = document.getElementById('edge-sign'); return { shown: !!(el && el.classList.contains('show')), text: el ? el.textContent : '', cls: el ? el.className : '', state: g.edge.state }; };
  H.zone = (k) => { const q = H.at[k] || k; return g.edge.raw !== undefined ? window.__edgeZone(q.x, q.z) : null; };
};


const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => log('pageerror', e.message));
  const shot = async (name) => { const f = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: f }); log('shot', f); };
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.edge && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS, SPOTS);
  await page.evaluate(async () => { const u = [...performance.getEntriesByType('resource')].map((e) => e.name).find((n) => /\/src\/edge\.js/.test(n)) || '/src/edge.js'; const m = await import(u); window.__edgeMod = m; await m.loadMapRoads(); });
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);

  // the whole map at the border: the wilderness, Quetico washed past it as out, its dashed outline
  for (const [name, k, span] of [['q-map-border', 'border', 22000], ['q-map-wide', 'border', 48000]]) {
    await page.evaluate(async ([k, span]) => {
      const H = window.__edge, g = window.__game, hud = g.hud, sh = hud.sheetsOn;
      if (sh) sh.view = () => 'whole';
      hud.setMode('sheet'); hud.lookAt(H.at[k].x, H.at[k].z, span);
      for (let i = 0; i < 40; i++) { H.step(2); await H.wait(60); }
    }, [k, span]);
    await page.waitForTimeout(600);
    await shot(name);
    await page.evaluate(() => { const hud = window.__game.hud; try { hud.setMode('glance'); hud.setMode(null); } catch { /* */ } });
  }

  // the moved stores, from their docks: 16 (Moose River North) and 67 (Bog Lake)
  for (const ep of [16, 67]) {
    const r = await page.evaluate(async (ep) => {
      const H = window.__edge, g = window.__game, L = g.outfitter.layout(ep);
      if (!L) return { none: true };
      await g.player.teleport((L.dockFoot || L.door).x, (L.dockFoot || L.door).z); await H.settle();
      const f = L.dockFoot || L.dockLand || L.door, d = L.door;
      if (g.chase.mode !== 'third') g.chase.setMode('third');
      const p = g.player, a = Math.atan2(f.z - d.z, f.x - d.x), x = f.x + Math.cos(a) * 6, z = f.z + Math.sin(a) * 6;
      p.mode = 'walk'; p.x = x; p.z = z; p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null }; p.placeOnGround();
      const yaw = Math.atan2(-(d.z - z), d.x - x); p.heading = yaw; g.chase.viewYaw = yaw; g.chase.forwardYaw = yaw; g.chase.viewPitch = 0.02; if (g.chase.snap) g.chase.snap();
      g.day.setClock(g.day.year, g.day.doy, 10); H.step(200);
      return { ep, x: Math.round(x), z: Math.round(z) };
    }, ep);
    log('store', JSON.stringify(r));
    await shot(`store-${ep}`);
  }
} catch (e) {
  log('error', String(e && e.stack || e).slice(0, 1500));
} finally {
  await browser.close();
}
