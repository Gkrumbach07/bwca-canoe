// Stream K1a's acceptance in the real game (docs/build/campaign-design.md Part 4 Round 0): headless Chromium against a
// running Vite (and the relay for part 5), PASS/FAIL lines and a JSON report.
//   1 flag off (no ?story=1): the v1 story exactly (no v2 object, no story2 key, no mirror switch)
//   2 flag on, a new season: StoryV2 at __game.story, story2 written, S0, no rule errors; a real night-one find through
//     walt.find: nb.found, the Walt lines, the v1 getters and the v1 echo (the gl rigs' raw-key check)
//   3 the tick: the clock reaches the story each game quarter-hour from the frame loop; a when() on the hour
//   4 migration: a v1 document planted before boot (a finder) comes up as v2 with nb.found and its Walt lines
//   5 co-op (needs RELAY): the guest's story goes to mirror mode on joining; its own story2 untouched; no find
//   APP=http://localhost:5401 RELAY=ws://localhost:8401 node scripts/k1a-test.mjs [--out dir] [--no-coop]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5401').replace(/\/$/, '');
const RELAY = process.env.RELAY || '';
const COOP = !process.argv.includes('--no-coop') && !!RELAY;
const OUT = path.resolve(arg('out', path.join(process.env.TMPDIR || '/tmp', 'k1a-out')));
mkdirSync(OUT, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 900)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
const browsers = [];
async function openGame(name, query = '', init = null) {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log(`[${name}] console.error`, m.text().slice(0, 300)); });
  const q = [RELAY ? `relay=${encodeURIComponent(RELAY)}` : '', query].filter(Boolean).join('&');
  await page.goto(`${APP}/${q ? '?' + q : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.story && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  log(`[${name}] loaded`);
  return page;
}
const newSeason = (page, home = 31, doy = 190) => page.evaluate(async ([home, doy]) => {
  const g = window.__game, t = g.title;
  t.setPick('adventure');
  await t.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: new Date().getFullYear(), doy } });
}, [home, doy]);
const inGame = (page) => until(page, () => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 150000);

try {
  // 1 flag off -------------------------------------------------------------------------------------------------------
  {
    const A = await openGame('off');
    await newSeason(A); await inGame(A);
    const off = await A.evaluate(() => { const g = window.__game, s = g.story; return { v: s.v ?? null, mode: s.mode ?? null, setMode: typeof s.setMode, story2: g.store.getItem('bwca-canoe:story2'), story1: !!g.store.getItem('bwca-canoe:story'), notebook: s.state.notebook }; });
    result('1 flag off: the v1 story, no story2 key, no mirror switch', off.v === null && off.mode === null && off.setMode === 'undefined' && off.story2 === null && off.story1 && off.notebook && off.notebook.found === false, off);
    await A.context().browser().close();
  }

  // 2 flag on: a new season, night one --------------------------------------------------------------------------------
  {
    const A = await openGame('on', 'story=1');
    const boot = await A.evaluate(() => { const s = window.__game.story; return { v: s.v, stage: s.stage, errors: s.debug.errors(), data: s.data }; });
    result('2a flag on: StoryV2 at __game.story, S0, the rules compile', boot.v === 2 && boot.stage === 'S0' && !boot.errors.length && /^sd-/.test(boot.data), boot);
    await newSeason(A); await inGame(A);
    const begun = await A.evaluate(() => { const g = window.__game, s = g.story, raw = g.store.getItem('bwca-canoe:story2'), d = raw && JSON.parse(raw); return { season: s.state.season, profile: g.profile.seasonId, legacy: s.legacy, v: d && d.v, data: d && d.data, nb: s.state.notebook }; });
    result('2b a new season: story2 saved for it, not legacy', begun.v === 2 && begun.season === begun.profile && !begun.legacy && begun.data && begun.nb.found === false, begun);
    const found = await A.evaluate(async () => {
      const g = window.__game, s = g.story, ev = [];
      s.on('*', (e) => ev.push(e));
      const put = g.walt.find({ key: 3, lake: 'Test Lake' });
      await new Promise((r) => setTimeout(r, 50));
      if (g.veil && g.veil.active && g.veil.skip) try { g.veil.skip(); } catch { /* the card */ }
      const raw1 = g.store.getItem('bwca-canoe:story'), raw2 = g.store.getItem('bwca-canoe:story2');
      return { put, stage: s.stage, walt: s.walt(), nb: s.state.notebook, waltFound: g.walt.found, events: ev, echo: /"found":true/.test(raw1 || ''), saved: !!(raw2 && JSON.parse(raw2).facts['nb.found']), notebooks: g.profile.inventory.count('waltnotebook', { reachable: false }), why: s.why('nb.found') && s.why('nb.found').src };
    });
    result('2c night one through walt.find: nb.found, S1, the Walt lines, the v1 getters, saved, the v1 echo', found.stage === 'S1' && found.walt.join() === 'w.found,w.cellar' && found.nb.found && found.nb.lake === 'Test Lake' && found.waltFound && found.saved && found.echo && found.notebooks === 1 && found.events.includes('notebook:found') && found.events.includes('walt:line'), found);
    const pages = await A.evaluate(() => { const s = window.__game.story; s.read(0); s.read(1); return { n: s.pages().length, read: s.state.read.slice() }; });
    result('2d pages and read through the v1 surface', pages.n >= 3 && pages.read.join() === '0,1', pages);

    // 3 the tick ----------------------------------------------------------------------------------------------------
    const tick = await A.evaluate(() => {
      const g = window.__game, s = g.story; let n = 0;
      s.on('clock', () => { n++; });
      const h0 = g.day.hours;
      g.day.setClock(g.day.year, g.day.doy, 8.0);
      g.step(1 / 30, 3);
      n = 0;
      g.day.setClock(g.day.year, g.day.doy, 9.0);
      g.step(1 / 30, 3);
      const a = n;
      g.day.setClock(g.day.year, g.day.doy, 9.3);
      g.step(1 / 30, 3);
      const b = n;
      g.step(1 / 30, 3);
      const c = n;
      return { a, b, c, h0, hours: g.day.hours, when9: s.when('hour:9-10'), when20: s.when('hour:20-23'), now: s.time() };
    });
    result('3 the tick: the clock reaches the story once a game quarter-hour from the frame loop; hour atoms read it', tick.a >= 1 && tick.b === tick.a + 1 && tick.c === tick.b && tick.when9 && !tick.when20, tick);
    await A.context().browser().close();
  }

  // 4 migration ------------------------------------------------------------------------------------------------------
  {
    const v1 = { v: 1, season: null, legacy: true, notebook: { found: true, abs: 20640, key: 2, lake: 'Farm Lake' }, read: [0, 1, 2], flags: { k1a: 'old' } };
    const A = await openGame('migrate', 'story=1', { fn: (doc) => { try { if (!sessionStorage.getItem('k1a-planted')) { localStorage.setItem('bwca-canoe:story', JSON.stringify(doc)); sessionStorage.setItem('k1a-planted', '1'); } } catch { /* storage */ } }, arg: v1 });
    const m = await A.evaluate(() => { const g = window.__game, s = g.story, raw = g.store.getItem('bwca-canoe:story2'); return { v: s.v, found: s.has('nb.found'), abs: s.fact('nb.found') && s.fact('nb.found').abs, walt: s.walt(), legacy: s.legacy, flag: s.get('legacy.k1a'), read: s.state.read.slice(), saved: !!raw, migrated: s.state.log.some((r) => r[3] === 'migrate'), v1left: JSON.parse(g.store.getItem('bwca-canoe:story') || 'null') }; });
    result('4 a v1 finder migrates: nb.found at its day, the Walt lines, legacy kept, flags under legacy.*, read[] kept (the R0 fix), story2 saved', m.v === 2 && m.found && m.abs === 20640 && m.walt.join() === 'w.found,w.cellar' && m.legacy && m.flag === 'old' && m.read.join() === '0,1,2' && m.saved && m.migrated && m.v1left && m.v1left.notebook.found && (m.v1left.read || []).join() === '0,1,2', m);
    await A.context().browser().close();
  }

  // 5 co-op: the guest's mirror -------------------------------------------------------------------------------------------
  if (COOP) {
    const A = await openGame('host', 'story=1');
    await newSeason(A, 25, 166); await inGame(A);
    await A.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); if (g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(25, false); } g.story.debug.set('crews.seen'); });
    const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Host', shirt: 2 }));
    // the guest has a story of their own first: planted v2 document
    const own = { v: 2, season: 'p-guest-own', legacy: false, rev: 1, tick: 1, data: null, facts: { 'nb.found': [true, 20600, 22, 1, 0, 1] }, src: ['plant'], ppl: {}, nb: { at: { abs: 20600, key: 1, lake: 'Own Lake' }, read: {}, here: {}, und: {}, bc: [], photos: {}, pages: [] }, walt: [['w.found', 20600]], pencil: {}, leads: {}, eps: {}, dir: {}, timers: [], fired: {}, meeting: null, queue: [], end: null, amb: { once: [] }, flags: {}, log: [] };
    const B = await openGame('guest', `story=1&join=${code}`, { fn: (doc) => { try { if (!sessionStorage.getItem('k1a-planted')) { localStorage.setItem('bwca-canoe:story2', JSON.stringify(doc)); sessionStorage.setItem('k1a-planted', '1'); } } catch { /* storage */ } }, arg: own });
    await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
    await B.fill('#coop-name', 'Ada');
    await B.click('#coop-go');
    try { await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 150000); } catch (e) {
      log('guest state', JSON.stringify(await B.evaluate(() => { const g = window.__game, c = g.coop; return { role: c.role, code: c.code, title: g.title.state, tp: g.player.teleporting, status: c.status, err: c.error, url: location.href }; })));
      throw e;
    }
    const g5 = await B.evaluate(() => {
      const g = window.__game, s = g.story;
      const setOk = s.set('tier.1'), foundOk = s.found({ abs: 1 }), sleep = g.walt.onSleep({ hours: 9, at: { hours: 7 } });
      s.emit('walkout', { ep: 25 });
      g.step(1 / 30, 30);
      const raw = g.store.getItem('bwca-canoe:story2'), d = raw && JSON.parse(raw);
      return { mode: s.mode, facts: Object.keys(s.facts()), setOk, foundOk, sleep, own: d && d.season, ownFacts: d && Object.keys(d.facts), notebooks: g.profile.inventory.count('waltnotebook', { reachable: false }) };
    });
    result('5 co-op: the guest\'s story is a mirror (no writes, no find, nothing of the host\'s private facts), their own story2 untouched', g5.mode === 'mirror' && !g5.facts.length && !g5.setOk && !g5.foundOk && !g5.sleep && g5.own === 'p-guest-own' && g5.ownFacts.join() === 'nb.found' && g5.notebooks === 0, g5);
    const host = await A.evaluate(() => ({ mode: window.__game.story.mode, crews: window.__game.story.has('crews.seen') }));
    result('5b the host\'s story stays live', host.mode === 'live' && host.crews, host);
  } else log('skip 5 (no RELAY or --no-coop)');
} catch (e) {
  result('rig ran to the end', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  for (const b of browsers) { try { await b.close(); } catch { /* closed */ } }
}
result('no page errors', !errors.length, { errors: errors.slice(0, 10) });
const pass = results.filter((r) => r.pass).length;
writeFileSync(path.join(OUT, 'k1a-report.json'), JSON.stringify({ app: APP, pass, total: results.length, results }, null, 1));
log(`k1a: ${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
