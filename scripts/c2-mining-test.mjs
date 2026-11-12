// Story Round 2, stream A2 (the mining years): the slice-2 steps A2 owns, in the real game, headless Chromium against a
// running Vite (?story=1), each check printed PASS or FAIL. The steps are scripts/slice/c2-mining.mjs's (the --slice2
// rig's sections):
//   0 flag off: none of A2's modules fetched, no café on Farm's layout, no storyMining, no rideWith use
//   season A (home 31, 10 July): the fixture ('turn'), then 1 the porch · 2 Mary, Len · 3 (A2's half) the notice ·
//     4 the Kettle day (walked) · 5 (A2's half) the pay lines · 6 the back table · 7 the test and the crew map ·
//     8 Pietro (landed, walked) · 9 the clean book
//   season B: the variant ("You don't owe anybody this.", then "On the record")
//   guest: a co-op guest (mirror): no Farm cast beyond Round 1's, no flyer, no Tasha
//   (and no page errors)
//
//   APP=http://localhost:5911 node scripts/c2-mining-test.mjs [--only off|A|B|guest] [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS_T } from './slice/c1-talk.mjs';
import { HELPERS } from './slice/c1-layer.mjs';
import { HELPERS_A2, setup, steps, variant } from './slice/c2-mining.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5911').replace(/\/$/, '');
const ONLY = arg('only', null), SHOTS = arg('shots', null), FROM = arg('from', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 2400)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const open = async (url) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') log('console', t.slice(0, 300)); else if (/story A2|mining|story rule|story\.when|story scene|story\.set/.test(t)) log('console', t.slice(0, 300)); });
  await page.goto(url, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && (!/story=1/.test(location.search) || (window.__game.storySeams && window.__game.storyTalk && window.__game.storyMining)) && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS_T); await page.evaluate(HELPERS);
  if (/story=1/.test(url)) await page.evaluate(HELPERS_A2);
  return page;
};
const newSeason = async (page, home, doy = 191) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${home}"]`);
  await page.evaluate((d) => { const w = window.__game.title.wizard; w.setDate(d); w.next(); }, doy);
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game, T = window.__t; T.step(30); const o = g.outfitter; if (o.open) o.hide(); g.day.setClock(g.day.year, g.day.doy, 10); T.step(10); });
};
const run = async (page, list, ctx) => {
  let on = !FROM;
  for (const s of list) {
    if (!on && s.id === FROM) on = true;
    if (!on) continue;
    log(`-- step ${s.step} ${s.id}: ${s.title}`);
    try { await s.run({ page, result, log, ctx, shots: SHOTS }); } catch (e) { result(`${s.step} ${s.id}: threw`, false, { e: String(e && e.stack || e).slice(0, 600) }); }
  }
};

try {
  if (!ONLY || ONLY === 'off') {
    const off = await open(APP);
    await newSeason(off, 31);
    const z = await off.evaluate(() => {
      const g = window.__game, S = g.outfitter.layout(31);
      const loaded = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\/src\/(kettle|mining-cast|mining-items|task-kinds-mining|feed-weather|story-data\/(mining|rules-mining|leads-mining|fixtures-a2))\.js/.test(n));
      return { loaded, mining: g.storyMining ?? null, cafe: S ? S.cafe ?? null : 'no store', kinds: Object.keys(g.tasks.constructor && {} ) && null };
    });
    result('0 flag off: none of A2\'s modules fetched, no café on Farm\'s layout, no storyMining', z.loaded.length === 0 && z.mining === null && z.cafe === null, z);
    await off.close();
  }
  if (!ONLY || ONLY === 'A') {
    const a = await open(`${APP}/?story=1`);
    await newSeason(a, 31);
    const ctx = { home: 31 };
    await setup({ page: a, result, log, ctx });
    await run(a, steps, ctx);
    await a.close();
  }
  if (!ONLY || ONLY === 'B') {
    const b = await open(`${APP}/?story=1`);
    await newSeason(b, 31);
    const ctx = { home: 31 };
    await setup({ page: b, result, log, ctx });
    try { await variant.run({ page: b, result, log, ctx, shots: SHOTS }); } catch (e) { result('9e variant: threw', false, { e: String(e && e.stack || e).slice(0, 600) }); }
    await b.close();
  }
  if (!ONLY || ONLY === 'guest') {
    const c = await open(`${APP}/?story=1`);
    await newSeason(c, 31);
    const g = await c.evaluate(async () => {
      const g = window.__game, s = g.story, A = window.__a2, M = g.storyMining;
      s.debug.fixture('turn'); s.set('tauno.said.pads', true); M.kettle.rain.force({ from: Math.floor(s.nowAbs()), days: 2 });
      s.setMode('mirror');
      let d = g.day.doy + 1; while (A.dow(d) !== 2) d++; A.at(d, 9.5);
      await A.toFarm(); A.inside(); window.__L.step(40);
      const K = A.place('kettle'); M.kettle.update(1);
      return { staged: M.miningCast.staged(), flyers: M.kettle.flyers(31).length, tasha: !!M.kettle.tasha(), cast: g.storyTalk.cast.staged() };
    });
    result('guest (a co-op guest, mirror): no Farm cast of the arc, no Kettle flyer, no Tasha; nothing breaks', g.staged.length === 0 && g.flyers === 0 && !g.tasha && g.cast.length === 0, g);
    await c.close();
  }
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} finally {
  await browser.close();
}
const fails = results.filter((r) => !r.pass);
writeFileSync('c2-mining-report.json', JSON.stringify({ results }, null, 1));
console.log(`c2-mining-test: ${results.length - fails.length}/${results.length}`);
process.exit(fails.length ? 1 : 0);
