// probe (not a rig): the parties at the moved stores' entry points
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const APP = process.env.APP;
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } throw new Error('no pw'); }
const { chromium } = createRequire(import.meta.url)(findPw());
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(APP, { timeout: 180000 });
await page.waitForFunction(() => { const g = window.__game; return g && g.title && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
const r = await page.evaluate(() => {
  const g = window.__game, P = g.parties, out = {}; g.day.setClock(2026, 191, 9); g.step(1/30, 2);
  for (const ep of [16, 67, 31, 75, 1, 25]) {
    const e = P.eps.find((x) => x.ep === ep);
    let n = 0, legs = 0, days = [];
    for (let d = P.today - 10; d < P.today + 10; d++) { const c = P.count(ep, d), l = P.entering(ep, d).length; n += c; legs += l; days.push(`${c}/${l}`); }
    out[ep] = { e: e ? { ep: e.ep, basin: e.basin, x: Math.round(e.x), z: Math.round(e.z), keys: Object.keys(e).join(',') } : null, count20: n, made20: legs, days: days.join(' ') };
  }
  return { today: P.today, traffic: P.traffic, out };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
