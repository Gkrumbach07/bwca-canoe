// Stream E (gl-e, NPC immersion): the headless page helpers its test and lint drivers share (playwright-core and the
// cached Chromium headless shell, Metal ANGLE). Not part of the game.
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const APP = process.env.APP || 'http://localhost:5185';
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
export const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function launch() { return chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); }
// a page with the game loaded (the title up); `query` appended to the URL; a fresh context (its own storage) each time
export async function openGame(browser, { query = '', width = 1280, height = 800, quiet = false, ctx = null } = {}) {
  const c = ctx || await browser.newContext({ viewport: { width, height } });
  const page = await c.newPage();
  page.on('pageerror', (e) => log('pageerror', e.message));
  if (!quiet) page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log(`console.${m.type()}`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/${query}`);
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.parties && window.__game.npcs, null, { timeout: 240000, polling: 500 });
  return page;
}
export const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
// a new season at entry point ep on (year, doy), then the clock to `hours`, the counter closed
export async function seasonAt(page, { ep = 25, year = 2026, doy = 192, hours = 9, mode = 'sandbox' } = {}) {
  await page.evaluate(async ({ ep, year, doy, mode }) => {
    const g = window.__game, t = g.title, e = g.world.entryPoints.find((x) => x.ep === ep);
    t.setPick(mode);
    await t.newSeason(e, { confirm: false, start: { year, doy } });
  }, { ep, year, doy, mode });
  await until(page, () => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 180000);
  await page.evaluate(({ year, doy, hours }) => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); g.day.setClock(year, doy, hours); }, { year, doy, hours });
}
// step the game n frames of dt in chunks (each JS call under ~3000 frames)
export async function step(page, n, dt = 1 / 30, chunk = 600) {
  for (let k = 0; k < n; k += chunk) await page.evaluate(({ m, dt }) => window.__game.step(dt, m), { m: Math.min(chunk, n - k), dt });
}
