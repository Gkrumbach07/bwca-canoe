// Story Round 1, stream T (Talk & cast): the slice steps T owns, in the real game, headless Chromium against a running
// Vite, each check printed PASS or FAIL (the steps are scripts/slice/c1-talk.mjs's, the --slice rig's sections):
//   0 flag off: none of T's modules loaded (topics, cast, beats, ambient, feed-talk), no story talk source on the people,
//     no road line, the onboarding's own talk
//   season A (home --home, default 25): 1 P1 taken · 4 the return and the porch (warm) · 5 the first rings · 6 the turn,
//     a door rung
//   season B (home --home-b, default 31): 1b P1 left on the shelf · 4d–4f the declines, R3, Farm's porch · 1c R1
//   7 a co-op guest (mirror): a walkout stages nobody, no story topic on a keeper
//   (and no page errors)
//
//   npx vite --port 5641 --strictPort &
//   APP=http://localhost:5641 node scripts/c1-talk-test.mjs [--home 25] [--home-b 31] [--only A|B|off|guest]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS_T, steps, declines, shelf, r1 } from './slice/c1-talk.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5641').replace(/\/$/, '');
const HOME = Number(arg('home', 25)), HOME_B = Number(arg('home-b', 31)), ONLY = arg('only', null);
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const open = async (url) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') log('console', t.slice(0, 300)); else if (/story T|story rule|story\.when|story scene|cast:/.test(t)) log('console', t.slice(0, 300)); });
  await page.goto(url, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && (!/story=1/.test(location.search) || (window.__game.storySeams && window.__game.storyTalk)) && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS_T);
  return page;
};
// a new season at `home` on 10 July, 10:00, the onboarding to come (its talk is the P1 step's)
const newSeason = async (page, home) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${home}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game, T = window.__t; T.step(30); const o = g.outfitter; if (o.open) o.hide(); g.day.setClock(g.day.year, g.day.doy, 10); T.step(10); });
};
const run = async (page, list, ctx) => { for (const s of list) { log(`-- step ${s.step} ${s.id}: ${s.title}`); try { await s.run({ page, result, log, ctx }); } catch (e) { result(`${s.step} ${s.id}: threw`, false, { e: String(e && e.message || e).slice(0, 400) }); } } };

try {
  if (!ONLY || ONLY === 'off') {
    const off = await open(APP);
    await newSeason(off, HOME);
    const z = await off.evaluate(() => {
      const g = window.__game;
      const loaded = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\/src\/(topics|cast|beats|ambient|feed-talk|story-data\/(porch-act1|topics-act1|cast|rules-talk))\.js/.test(n));
      return { loaded, talk: g.storyTalk ?? null, sources: (g.npcs.talkSources || []).length, pools: g.npcs.pools ? g.npcs.pools.size : 0, road: typeof g.rides === 'object' && g.rides ? typeof g.rides.roadLine : 'n/a', p1: typeof g.onboarding.p1, pick: typeof g.talk?.pickLake };
    });
    result('0 flag off: none of T\'s modules loaded, no talk source or pool on the people, no road line, no P1 hook', z.loaded.length === 0 && z.talk === null && z.sources === 0 && z.pools === 0 && z.p1 === 'undefined' && z.road !== 'function', z);
    await off.close();
  }
  if (!ONLY || ONLY === 'A') {
    const a = await open(`${APP}/?story=1`);
    await newSeason(a, HOME);
    await run(a, steps, { home: HOME });
    const st = await a.evaluate(() => ({ beats: window.__game.storyTalk.beats.state(), log: window.__game.storyTalk.beats.log.slice(-6) }));
    log('season A beats', JSON.stringify(st));
    await a.close();
  }
  if (!ONLY || ONLY === 'B') {
    const b = await open(`${APP}/?story=1`);
    await newSeason(b, HOME_B);
    await run(b, [shelf, declines, r1], { home: HOME_B });
    await b.close();
  }
  if (!ONLY || ONLY === 'guest') {
    const c = await open(`${APP}/?story=1`);
    await newSeason(c, HOME);
    const g = await c.evaluate((home) => {
      const g = window.__game, T = window.__t, s = g.story;
      s.debug.do('found', { abs: s.time().abs });
      s.setMode('mirror');
      T.walkIn(home); T.walkOut(home); T.step(20);
      const v = (g.npcs.at(home) || []).find((x) => x.keeper);
      return { staged: T.staged(), items: v ? g.storyTalk.topics.items(v).length : -1, top: v ? g.storyTalk.topics.top(v) : 'no keeper' };
    }, HOME);
    result('7 a co-op guest (mirror): a walkout stages nobody; no story topic on a keeper', g.staged.length === 0 && g.items === 0 && g.top === null, g);
    await c.close();
  }
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} finally {
  await browser.close();
}
const fails = results.filter((r) => !r.pass);
writeFileSync('c1-talk-report.json', JSON.stringify({ results }, null, 1));
console.log(`c1-talk-test: ${results.length - fails.length}/${results.length}`);
process.exit(fails.length ? 1 : 0);
