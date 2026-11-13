// Story Round 2, stream D (the director): its slice steps in the real game, headless Chromium against a running Vite,
// ?story=1, each check printed PASS or FAIL (the steps are scripts/slice/c2-director.mjs's, the --slice2 rig's section):
//   0 flag off: none of D's modules fetched (beats.js, beats-by-outfitter.js, feed-beats.js, rules-beats.js), the
//     hooks it sets on the always-loaded modules unset (record.story, party-camps storyHook.line)
//   on (home 31, Farm, the turn played: the fixture or its facts): 10 the day's beat (§12's order, the next site's party
//     says it, the fallback's rate, one set piece a trip) · 14 an open episode's place is the beat (E's stub where E is
//     not in the build) · 11 climax spacing on a test arc beside mining; stall relief, once per lock · 5 the trip's end:
//     the tally pays the pay: lines, the card's story line and the beats found (A2's lines stubbed)
//   (and no page errors)
//
//   APP=http://localhost:5921 node scripts/c2-director-test.mjs [--home 31] [--only off|on]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS_D, steps } from './slice/c2-director.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5921').replace(/\/$/, '');
const HOME = Number(arg('home', 31)), ONLY = arg('only', null);
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1800)); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const open = async (q = '') => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /beats|director|story rule|story\.when/.test(t)) log('console', m.type(), t.slice(0, 300)); });
  await page.goto(`${APP}/${q ? '?' + q : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  return page;
};
const newSeason = async (page, home, story, doy = 180) => {
  await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await page.waitForFunction((story) => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && (!story || (g.storySeams && g.storySeams.feed && g.storyTalk && g.story.beats)); }, story, { timeout: 200000, polling: 250 });
  await page.evaluate(() => { const g = window.__game; g.step(1 / 30, 30); const o = g.outfitter; if (o.open) o.hide(); if (g.onboarding && g.onboarding.pending && g.onboarding.pending(g.profile.home)) { try { g.onboarding.skip && g.onboarding.skip(); } catch { /* */ } } });
};

try {
  if (!ONLY || ONLY === 'off') {
    const off = await open('');
    await newSeason(off, HOME, false);
    const z = await off.evaluate(async () => {
      const g = window.__game, names = performance.getEntriesByType('resource').map((r) => r.name);
      const loaded = names.filter((n) => /\/src\/(beats|beats-by-outfitter|feed-beats|story-data\/rules-beats)\.js/.test(n));
      const pcUrl = names.find((n) => /\/src\/party-camps\.js/.test(n));
      let hook = 'n/a'; if (pcUrl) { try { const m = await import(pcUrl); hook = m.storyHook ? m.storyHook.line : 'no storyHook'; } catch (e) { hook = 'import: ' + e.message; } }
      return { loaded, recordStory: g.record ? g.record.story === undefined : 'no record', hook: hook === null ? null : String(hook), beats: !!(g.story && g.story.beats) };
    });
    result('0 flag off: none of D\'s modules fetched, record.story and party-camps storyHook.line unset, no director on the story', z.loaded.length === 0 && z.recordStory === true && z.hook === null && !z.beats, z);
    await off.close();
  }
  if (!ONLY || ONLY === 'on') {
    const page = await open('story=1');
    await newSeason(page, HOME, true);
    await page.evaluate(HELPERS_D);
    const ctx = { home: HOME };
    for (const s of steps) {
      log(`-- step ${s.step} ${s.id}: ${s.title}`);
      try { await s.run({ page, result, log, ctx }); } catch (e) { result(`${s.step} ${s.id}: threw`, false, { e: String(e && e.stack || e).slice(0, 900) }); }
    }
    const st = await page.evaluate(() => window.__d.state());
    log('director state', JSON.stringify({ tripDays: st.tripDays, said: st.said, stall: st.stall, held: st.held, climaxes: st.climaxes }).slice(0, 2000));
    await page.close();
  }
} catch (e) { result('the rig ran to its end', false, { error: String(e && e.stack || e).slice(0, 1500) }); }
finally { await browser.close(); }
result('no page errors', errors.length === 0, { errors: errors.slice(0, 8) });
const pass = results.filter((r) => r.pass).length;
log(`c2-director-test: ${pass}/${results.length} ${pass === results.length ? 'PASS' : 'FAIL'}`);
process.exit(pass === results.length ? 0 : 1);
