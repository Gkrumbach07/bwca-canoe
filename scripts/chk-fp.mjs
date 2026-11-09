// chk-s: a fingerprint of the flag-off game (run on main's base and on claude/story-r0, then diff the JSON).
//   APP=... node scripts/chk-fp.mjs --out <dir> [--tag base|r0] [--query story=1]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5441').replace(/\/$/, '');
const OUT = path.resolve(arg('out', '/tmp/chk-fp')); const TAG = arg('tag', 'x'); const Q = arg('query', '');
mkdirSync(OUT, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const errors = [], warns = [];
const fp = { tag: TAG, app: APP };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') warns.push(m.text().slice(0, 200)); });
  await page.goto(`${APP}/${Q ? '?' + Q : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  fp.title = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  for (const home of [31, 25]) {
    await page.evaluate(async ([home]) => {
      const g = window.__game, t = g.title; t.setPick('adventure');
      await t.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy: 190 } });
    }, [home]);
    await page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 150000, polling: 250 });
    await page.evaluate(() => window.__game.step(1 / 30, 90));
    await page.waitForTimeout(1500);
    fp[`h${home}`] = await page.evaluate(async (home) => {
      const g = window.__game, ob = g.onboarding, K = await import('/src/talk-keepers.js');
      const keys = []; try { for (let i = 0; i < g.store.length; i++) keys.push(g.store.key(i)); } catch { /* */ }
      const sp = ob.speaker ? ob.speaker(home) : null;
      const people = (() => { try { const N = g.npcs; const out = []; for (const p of (N.people || N.list || [])) out.push(p.name || p.first); return out.sort(); } catch { return null; } })();
      const tracker = document.querySelector('#tracker, .tracker, [id*=tracker]');
      return {
        staffAll: [...new Set(g.world.entryPoints.map((e) => ob.staffName(e.ep)))].sort(), speaker: sp && sp.name, staff: ob.staffName(home),
        gus: (K.HAND[25] || {}).past, hand: Object.fromEntries(Object.entries(K.HAND).map(([k, v]) => [k, (v.past || []).join(' | ').slice(0, 300)])),
        keys: keys.filter((k) => /story|walt/.test(k)).sort(), storyV1: g.store.getItem('bwca-canoe:story'), story2: g.store.getItem('bwca-canoe:story2'),
        storyType: g.story.constructor.name, v: g.story.v ?? 1, seams: g.storySeams ? { on: g.storySeams.on, feed: !!g.storySeams.feed } : null,
        tracker: tracker ? tracker.innerText.slice(0, 400) : null, people,
        guide: (() => { try { const gd = g.guide; const c = gd && (gd.current ? gd.current() : gd.cur); return c ? { id: c.id, title: c.title, line: c.line || c.text } : null; } catch (e) { return 'err:' + e.message; } })(),
        hud: document.body.innerText.replace(/\s+/g, ' ').slice(0, 2500),
        mods: performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\//.test(n)).map((n) => n.replace(/^.*\/src\//, '').replace(/\?.*$/, '')).sort(),
      };
    }, home);
    log('home', home, JSON.stringify(fp[`h${home}`]).slice(0, 400));
  }
  // night one by walt.find (the counter's tent flow is r3-final-play's): the v1 doc after, read page 0, a flag
  fp.night = await page.evaluate(async () => {
    const g = window.__game, s = g.story;
    const put = g.walt.find({ key: 3, lake: 'Test Lake' });
    await new Promise((r) => setTimeout(r, 300));
    try { if (g.veil && g.veil.active && g.veil.skip) g.veil.skip(); } catch { /* */ }
    g.step(1 / 30, 30);
    let page0 = null; try { page0 = s.read(0); } catch (e) { page0 = 'err:' + e.message; }
    try { s.flag('chk', 'v'); } catch { /* */ }
    g.step(1 / 30, 10);
    const pages = (() => { try { return s.pages().map((p) => p.title); } catch (e) { return 'err:' + e.message; } })();
    return { put, found: g.walt.found, page0: page0 && page0.title, pages, v1: g.store.getItem('bwca-canoe:story'), notebooks: g.profile.inventory.count('waltnotebook', { reachable: false }), hud: document.body.innerText.replace(/\s+/g, ' ').slice(0, 1200) };
  });
  // export this season (a main-made save for chk-save's import)
  fp.export = await page.evaluate(async () => { const g = window.__game, sl = g.slots || (await import('/src/save.js')).slots; const n = sl.live; try { sl.flush(); } catch { /* */ } await new Promise((r) => setTimeout(r, 300)); const r = await sl.exportSeason(n); return { n, file: r && r.file, len: r && r.text && r.text.length, text: r && r.text }; });
  if (fp.export && fp.export.text) { writeFileSync(path.join(OUT, `season-${TAG}.json`), fp.export.text); fp.export.text = '(written)'; }
  await page.screenshot({ path: path.join(OUT, `fp-${TAG}.png`) });
} catch (e) { fp.error = String(e && e.stack || e).slice(0, 1500); log('ERR', fp.error); }
finally { await browser.close(); }
fp.errors = errors; fp.warns = warns.slice(0, 40);
writeFileSync(path.join(OUT, `fp-${TAG}.json`), JSON.stringify(fp, null, 1));
log('wrote', path.join(OUT, `fp-${TAG}.json`), 'errors', errors.length);
