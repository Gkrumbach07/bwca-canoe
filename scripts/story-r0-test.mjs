// The story round 0 join's rig (docs/build/campaign-design.md Part 4 Round 0): K1a's story, K1b's seams and feed, K2's
// extract, H's names, together. Headless Chromium against a running Vite (and the relay for part 5).
//   1 flag off: exactly main (v1 story, no feed, no v2 module fetched; the stubs inert)
//   2 flag on: a new season boots; the feed reaches the story through story.ingest; the stubs on the real story; a trip
//   3 the extract's text loads into the K1a state (every cond evaluates; an NB id marks the notebook)
//   4 the save: v1 → v2 → v1 (flag off reads the v1 copy) → v2 again
//   5 co-op (needs RELAY): the guest's story is a mirror, its feed drops everything
//   APP=http://localhost:5421 RELAY=ws://localhost:8421 node scripts/story-r0-test.mjs [--out dir] [--no-coop]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5401').replace(/\/$/, '');
const RELAY = process.env.RELAY || '';
const COOP = !process.argv.includes('--no-coop') && !!RELAY;
const OUT = path.resolve(arg('out', path.join(process.env.TMPDIR || '/tmp', 'story-r0-out')));
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


const V1 = { v: 1, season: null, legacy: true, notebook: { found: true, abs: 20640, key: 2, lake: 'Farm Lake' }, read: [0, 1], flags: { r0: 'old' } };
const plant = { fn: (doc) => { try { if (!sessionStorage.getItem('r0-planted')) { localStorage.setItem('bwca-canoe:story', JSON.stringify(doc)); sessionStorage.setItem('r0-planted', '1'); } } catch { /* storage */ } }, arg: V1 };
const loaded = (page, rx) => page.evaluate((rx) => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => new RegExp(rx).test(n)), rx);

try {
  // 1 flag off: exactly main (the v1 story, the stubs hung on but inert, no feed, no story data loaded) ----------------
  {
    const A = await openGame('off');
    await newSeason(A); await inGame(A);
    await A.evaluate(() => window.__game.step(1 / 30, 30));
    const off = await A.evaluate(() => {
      const g = window.__game, s = g.story, se = g.storySeams;
      return { v: s.v ?? null, mode: s.mode ?? null, ingest: typeof s.ingest, story2: g.store.getItem('bwca-canoe:story2'), story1: !!g.store.getItem('bwca-canoe:story'),
        seamsOn: se && se.on, feed: se && se.feed, allows: s.allows && s.allows('pitch'), ui: !!(s.ui && s.ui.pickLake) };
    });
    off.mods = await loaded(A, 'story-(feed|rules|cond|data)|feed-(trip|outfitter)|/src/story\\.js');
    result('1 flag off: the v1 story, no story2, no feed, no v2 module loaded; the stubs present and inert', off.v === null && off.mode === null && off.ingest === 'undefined' && off.story2 === null && off.story1 && off.seamsOn === false && off.feed === null && off.allows === true && off.ui && !off.mods.length, off);
    await A.context().browser().close();
  }

  // 2 flag on: a new season boots; the seams meet the real story -------------------------------------------------------
  {
    const A = await openGame('on', 'story=1');
    await newSeason(A); await inGame(A);
    await until(A, () => !!(window.__game.storySeams && window.__game.storySeams.feed), null, 30000);
    const on = await A.evaluate(() => {
      const g = window.__game, s = g.story, f = g.storySeams.feed, seen = [];
      const off = s.on('*', (e, d) => { if (e === 'store:enter' || e === 'walkout') seen.push(e); });
      f.emit('store:enter', { ep: 31 });
      const ok = s.ingest('walkout', { ep: 31 });
      off();
      return { v: s.v, stage: s.stage, tier: s.tier, season: s.state.season, profile: g.profile.seasonId, data: s.data, errs: s.debug.errors(), names: f.names(), running: f.running, seen, ok,
        allows: s.allows('pitch'), stubUi: typeof s.ui.pickLake, stats: f.stats(), why: typeof s.why, can: typeof s.can };
    });
    result('2a flag on: StoryV2 at __game.story for the new season, S0, no rule errors', on.v === 2 && on.stage === 'S0' && on.season === on.profile && !on.errs.length && /^sd-/.test(on.data), on);
    result('2b the feed runs over trip + outfitter and reaches the story once per event (feed.emit → story.ingest)', on.running && on.names.includes('trip') && on.names.includes('outfitter') && on.seen.join() === 'store:enter,walkout' && on.ok && on.stats.in >= 1, on);
    result('2c the K1b stubs sit on the K1a story (allows yes, pickLake there), why/can there', on.allows === true && on.stubUi === 'function' && on.why === 'function' && on.can === 'function', on);
    // a real trip through trip.js: the feed's trip:start reaches the story
    const trip = await A.evaluate(() => {
      const g = window.__game, s = g.story, ev = [];
      const off = s.on('*', (e) => ev.push(e));
      try { g.trip.start({ ep: g.profile.home, foodDays: 1, canoe: 'aluminium' }); g.step(1 / 30, 6); g.trip.close('completed', 'came in', g.profile.home); } catch (e) { ev.push('err:' + e.message); }
      g.step(1 / 30, 6);
      off();
      return { ev: ev.filter((e) => /^trip:|^err/.test(e)), byEvt: g.storySeams.feed.stats().byEvt };
    });
    result('2d a trip.js trip (start, close) reaches the story through the feed', trip.ev.includes('trip:start') && trip.ev.includes('trip:end'), trip);

    // 3 the extract's text against the K1a state: every cond evaluates, NB ids mark the notebook
    const text = await A.evaluate(async () => {
      const s = window.__game.story, bad = [], files = ['nb', 'opening', 'mining', 'guiding', 'boys', 'family', 'company', 'finale', 'side', 'world'];
      let n = 0, conds = 0, ids = 0;
      const { compile } = await import('/src/story-cond.js');
      for (const f of files) {
        const j = (await import(`/src/story-data/text/${f}.json`)).default;
        n++; ids += Object.keys(j.text).length;
        for (const [id, e] of Object.entries(j.text)) if (e.cond) { conds++; const c = compile(e.cond); if (!c.ok) bad.push([id, e.cond, c.errors[0]]); else { try { s.when(e.cond); } catch (x) { bad.push([id, e.cond, x.message]); } } }
      }
      const nb = (await import('/src/story-data/text/nb.json')).default.text;
      const marked = s.markRead('NB01', 'r0-test');
      return { n, ids, conds, bad: bad.slice(0, 10), nb01: !!nb.NB01, marked, readNB01: s.when('read:NB01'), errs: s.debug.errors() };
    });
    result('3 the extract loads into the K1a state: every cond compiles and evaluates, NB01 marks read:NB01', text.n === 10 && text.ids > 2500 && text.conds > 150 && !text.bad.length && text.nb01 && text.marked && text.readNB01 && !text.errs.length, text);
    await A.context().browser().close();
  }

  // 4 the save: v1 → v2 (flag on) → v1 again (flag off, same browser) ---------------------------------------------------
  {
    const A = await openGame('save', 'story=1', plant);
    const m = await A.evaluate(() => { const g = window.__game, s = g.story; s.flush && s.flush(); const raw2 = g.store.getItem('bwca-canoe:story2'), raw1 = g.store.getItem('bwca-canoe:story');
      return { v: s.v, found: s.has('nb.found'), abs: s.fact('nb.found') && s.fact('nb.found').abs, walt: s.walt(), legacy: s.legacy, flag: s.get('legacy.r0'), v2: !!raw2 && JSON.parse(raw2).v, v1: raw1 && JSON.parse(raw1) }; });
    result('4a v1 → v2: the finder\'s notebook at its day, the Walt lines, legacy, its flags under legacy.*; story2 saved; a v1 copy kept', m.v === 2 && m.found && m.abs === 20640 && m.walt.includes('w.found') && m.legacy && m.flag === 'old' && m.v2 === 2 && m.v1 && m.v1.v === 1 && m.v1.notebook.found, m);
    await A.evaluate(() => window.__game.story.debug.set && window.__game.story.debug.set('crews.seen'));
    // the store writes through IndexedDB a microtask later: flush it before leaving the page, as pagehide would
    await A.evaluate(async () => { const g = window.__game, s = g.story; s.flush && s.flush(); await new Promise((r) => setTimeout(r, 50)); if (g.store.flush) await g.store.flush(); await new Promise((r) => setTimeout(r, 200)); });
    // back: the same browser without the flag reads the v1 document (a rollback to main finds the season true)
    await A.goto(`${APP}/`, { timeout: 180000 });
    await A.waitForFunction(() => window.__game && window.__game.story && window.__game.title && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
    const back = await A.evaluate(() => { const s = window.__game.story; return { v: s.v ?? 1, nb: s.state && s.state.notebook, legacy: s.state && s.state.legacy }; });
    result('4b v2 → v1: with the flag off the same browser\'s v1 story still has the notebook found', back.v === 1 && back.nb && back.nb.found === true && back.nb.lake === 'Farm Lake', back);
    // and forward again: the flag back on reads story2 (no second migration, the fact written in v2 kept)
    await A.goto(`${APP}/?story=1`, { timeout: 180000 });
    await A.waitForFunction(() => window.__game && window.__game.story && window.__game.story.v === 2 && window.__game.title && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
    const fwd = await A.evaluate(() => { const s = window.__game.story; return { found: s.has('nb.found'), crews: s.has('crews.seen'), migrations: s.state.log.filter((r) => r[3] === 'migrate').length }; });
    result('4c v2 again: story2 read back (crews.seen kept, migrated once)', fwd.found && fwd.crews && fwd.migrations <= 1, fwd);
    await A.context().browser().close();
  }

  // 5 co-op: a guest's story stays off ------------------------------------------------------------------------------------
  if (COOP) {
    const A = await openGame('host', 'story=1');
    await newSeason(A, 25, 166); await inGame(A);
    await A.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); if (g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(25, false); } });
    const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Host', shirt: 2 }));
    const B = await openGame('guest', `story=1&join=${code}`);
    await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
    await B.fill('#coop-name', 'Ada');
    await B.click('#coop-go');
    await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 150000);
    await until(B, () => !!(window.__game.storySeams && window.__game.storySeams.feed), null, 30000).catch(() => null);
    const g5 = await B.evaluate(() => {
      const g = window.__game, s = g.story, f = g.storySeams.feed;
      const before = f ? f.stats().dropped.mirror : null;
      if (f) { f.emit('store:enter', { ep: 25 }); f.emit('trip:start', { n: 1 }); }
      const ing = s.ingest('walkout', { ep: 25 });
      g.step(1 / 30, 30);
      return { mode: s.mode, facts: Object.keys(s.facts()), ing, before, after: f ? f.stats().dropped.mirror : null, inN: f ? f.stats().in : null, set: s.set('tier.1') };
    });
    result('5 co-op: the guest\'s story is a mirror; the feed drops its events, ingest refuses, no facts', g5.mode === 'mirror' && !g5.facts.length && g5.ing === false && g5.set === false && (g5.after === null || g5.after >= (g5.before || 0) + 2), g5);
    const host = await A.evaluate(() => ({ mode: window.__game.story.mode }));
    result('5b the host\'s story stays live', host.mode === 'live', host);
  } else log('skip 5 (no RELAY or --no-coop)');
} catch (e) {
  result('rig ran to the end', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  for (const b of browsers) { try { await b.close(); } catch { /* closed */ } }
}
result('no page errors', !errors.length, { errors: errors.slice(0, 10) });
const pass = results.filter((r) => r.pass).length;
writeFileSync(path.join(OUT, 'story-r0-report.json'), JSON.stringify({ app: APP, pass, total: results.length, results }, null, 1));
log(`story-r0: ${pass}/${results.length} PASS`);
process.exit(pass === results.length ? 0 : 1);
