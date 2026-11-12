// Story Round 2, stream E (episodes): the slice steps E owns, in the real game, headless Chromium against a running Vite
// (?story=1), each check printed PASS or FAIL. The steps are scripts/slice/c2-episodes.mjs's (the --slice2 rig's
// section): the flyer hook outside the board's count, Rose by the window, the snag fight on the existing tension bar by
// real input (F, the jig's number, Space, W), the lilacs' window, a print shown to Rose, out of the window. Then:
//   off    the flag off: none of E's modules loaded, no snag on the rod, no flyer hook on the board, no pinned party
//   (and no page errors)
//
//   APP=http://localhost:5931 node scripts/c2-episodes-test.mjs [--only off|slice] [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T } from './slice/c1-talk.mjs';
import { HELPERS_E, steps } from './slice/c2-episodes.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5931').replace(/\/$/, '');
const ONLY = arg('only', null), SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1800)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(query) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /story E|episodes|show:|fishing: snag/.test(t)) log('console', m.type(), t.slice(0, 300)); });
  await page.goto(`${APP}/${query ? '?' + query : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  return page;
}
async function newSeason(page, home, doy, story = true) {
  await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await page.waitForFunction((story) => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && (!story || (g.storySeams && g.storySeams.feed && g.storyTalk && g.storyEpisodes && g.storyLayer)); }, story, { timeout: 200000, polling: 250 });
}

try {
  if (!ONLY || ONLY === 'off') {
    const page = await open('');
    await newSeason(page, 25, 160, false);
    const r = await page.evaluate(() => {
      const g = window.__game, mods = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\//.test(n)).map((n) => n.replace(/^.*\/src\//, '').replace(/\?.*$/, ''));
      const mine = mods.filter((n) => /^(episodes|minigames|show|stories|feed-episodes)\.js$|^minigames\/|story-data\/episodes/.test(n));
      return { mine, snags: g.fishing.snags === undefined, hook: g.tasks.flyerHook === undefined, filter: g.tasks.boardFilterFn === undefined, pinned: !g.parties || g.parties.pinnedFn === undefined, ep: !g.storyEpisodes, board: g.tasks.board(25).length };
    });
    result('off: the flag off: none of E\'s modules loaded, no snag on the rod, no flyer hook, no board filter, no pinned party; the board its four pins', r.mine.length === 0 && r.snags && r.hook && r.filter && r.pinned && r.ep && r.board === 4, r);
    await page.context().close();
  }
  if (!ONLY || ONLY === 'slice') {
    const page = await open('story=1');
    await newSeason(page, 25, 160);
    await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T); await page.evaluate(HELPERS_E);
    await page.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); window.__L.step(20); });
    for (const s of steps) {
      log(`-- step ${s.step} ${s.id}: ${s.title}`);
      try { await s.run({ page, result, log, ctx: { shots: SHOTS } }); } catch (e) { result(`${s.step} ${s.id}: threw`, false, { e: String((e && e.stack) || e).slice(0, 600) }); }
    }
    await page.context().close();
  }
} finally {
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 8) });
  await browser.close();
  const fails = results.filter((r) => !r.pass).length;
  log(`c2-episodes-test: ${results.length - fails}/${results.length}${fails ? ' FAIL' : ' PASS'}`);
  process.exit(fails ? 1 : 0);
}
