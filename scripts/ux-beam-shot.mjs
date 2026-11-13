// The watchers' beam at night, for looking at (ux 2026-11-13): a new season at Lake One (30), 23:00, on the water; two
// beams drawn through watchers.js's own beam() (one across the view 60 m off, one angled toward you from 40 m), shot
// with the soft shader, then with the old flat additive cone for comparison. Writes beam-new.png and beam-old.png.
//   APP=http://localhost:5400 node scripts/ux-beam-shot.mjs --shots dir [--level 0.11]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const APP = (process.env.APP || 'http://localhost:5400').replace(/\/$/, '');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const SHOTS = path.resolve(arg('shots', 'beam-shots')); mkdirSync(SHOTS, { recursive: true });
const LEVEL = arg('level', null);
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  const ev = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${APP}/?story=0`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  await ev(async () => { const g = window.__game; g.title.setPick('sandbox'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === 30), { confirm: false, start: { year: 2026, doy: 280 } }); });
  for (const lv of (LEVEL ? String(LEVEL).split(',') : [null])) {
  await page.waitForFunction(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting; }, null, { timeout: 240000, polling: 250 });
  const setup = await ev(async (level) => {
    const g = window.__game, p = g.player, W0 = g.world;
    if (g.outfitter.open) g.outfitter.hide();
    // out on open water: a point 300 m off the landing with water all round
    let spot = null;
    for (let r = 150; r <= 900 && !spot; r += 50) for (let i = 0; i < 24 && !spot; i++) { const x = p.x + Math.cos(i / 24 * 6.283) * r, z = p.z + Math.sin(i / 24 * 6.283) * r; if (W0.shoreAt(x, z) < -60) spot = { x, z }; }
    if (!spot) return { none: 'no water' };
    await p.teleport(spot.x, spot.z);
    for (let k = 0; k < 200 && p.teleporting; k++) { g.step(1 / 30, 10); await new Promise((r) => setTimeout(r, 30)); }
    g.day.setClock(g.day.year, g.day.doy, 23); g.step(1 / 30, 60);
    const m = await import('/src/watchers.js'), Wt = m.watchers;
    Wt.c = { scene: g.scene, world: g.world };
    const dir = g.camera.getWorldDirection(new g.THREE.Vector3()), n = Math.hypot(dir.x, dir.z) || 1, fx = dir.x / n, fz = dir.z / n, rx = -fz, rz = fx;
    const cam = g.camera.position;
    // (watchers.js beam(): the cone runs along (cos cone, sin cone) in x, z)
    const a = { id: 'a', x: cam.x + fx * 70 - rx * 40, z: cam.z + fz * 70 - rz * 40, light: true, cone: Math.atan2(rz, rx) };
    const bx = cam.x + fx * 45 + rx * 20, bz = cam.z + fz * 45 + rz * 20, tx = cam.x + rx * 5, tz = cam.z + rz * 5;
    const b = { id: 'b', x: bx, z: bz, light: true, cone: Math.atan2(tz - bz, tx - bx) };
    for (const w of [a, b]) Wt.beam(w, { day: false }, false);
    if (level != null) for (const k of ['a', 'b']) Wt.beams.get(k).material.uniforms.uLevel.value = Number(level);
    window.__beam = { Wt, a, b };
    for (let k = 0; k < 30; k++) { g.step(1 / 30, 1); for (const w of [a, b]) Wt.beam(w, { day: false }, false); }
    return { spot, mat: Wt.beams.get('a').material.type };
  }, lv);
  console.log('setup', JSON.stringify(setup));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, `beam-new${lv ? '-' + lv : ''}.png`) });
  }
  await ev(() => { const g = window.__game, T = g.THREE, { Wt } = window.__beam; for (const k of ['a', 'b']) { const m = Wt.beams.get(k); m.material = new T.MeshBasicMaterial({ color: 0xfff2d8, transparent: true, opacity: 0.09, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: true }); } g.step(1 / 30, 2); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'beam-old.png') });
  console.log('shots', SHOTS);
} finally { await browser.close(); }
