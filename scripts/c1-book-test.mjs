// c1-book-test.mjs: stream B's rig (Round 1, the book), headless Chromium against a running Vite. PASS/FAIL lines and
// a JSON report. Runs the book's --slice section (scripts/slice/c1-book.mjs: B1, B2, B3, B7) on a real new season, then
// the rest of the stream's surface:
//   0  flag off: no Walt side, no book, not one of the book's modules fetched (the game equals main)
//   S  the slice section: the bundle, night one's cutscene on the camp's night, the book, read, read here, the 64,
//      NB20/NB31 understood, the Walt page
//   E1 a page given (kind 'page'): kept, in the pockets, the Pages tab, its paper
//   E2 205/50: P255 then P256 on one trip pencils "205/50" and gives lock 2 key B
//   E3 a reload: the book as it was (found, read, the spread, the lines)
//   E4 the moments: notebook ("in your book"), waltpage, readhere in the hints' list
//   E5 a co-op guest (mirror): no Walt side
//   APP=http://localhost:5611 node scripts/c1-book-test.mjs [--home 25] [--shots dir] [--out dir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { steps as SLICE } from './slice/c1-book.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5611').replace(/\/$/, '');
const OUT = path.resolve(arg('out', path.join(process.env.TMPDIR || '/tmp', 'c1-book-out')));
const SHOTS = arg('shots', null);
const HOME = Number(arg('home', 25)); // Moose Lake: Lake One's C837 and P645 in a first trip's reach
mkdirSync(OUT, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1200)); };
const browsers = [];
async function openGame(name, query = '') {
  const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /story|book|walt|nightone/i.test(m.text()))) log(`[${name}] console.${m.type()}`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/${query ? '?' + query : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  log(`[${name}] loaded`);
  return page;
}
const harness = (page) => ({
  page, log, result, state: {},
  step: (n) => page.evaluate((n) => window.__game.step(1 / 30, n), Math.round(n)),
  until: (fn, a, ms = 120000) => page.waitForFunction(fn, a, { timeout: ms, polling: 250 }),
  shot: async (name) => { if (!SHOTS) return; try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); log('shot', name); } catch (e) { log('shot', name, e.message); } },
});
const newSeason = (page, home) => page.evaluate(async (home) => {
  const g = window.__game, t = g.title; t.setPick('adventure');
  await t.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy: 175 } });
}, home);

try {
  // 0 flag off --------------------------------------------------------------------------------------------------------
  {
    const A = await openGame('off');
    await newSeason(A, HOME);
    await A.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 150000, polling: 250 });
    const off = await A.evaluate(() => {
      const g = window.__game, mods = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\//.test(n)).map((n) => n.replace(/^.*\/src\//, '').replace(/\?.*$/, ''));
      return { book: !!g.book, tab: !!document.querySelector('#journal .book-tab.w'), extra: g.journal.extra ? g.journal.extra.size : null, ours: mods.filter((m) => /^(notebook|casebook|nightone|feed-book)\.js$|story-data\/(notebook|rules-book|words)\.js|notebook\.css|text\/.*\.json/.test(m)), v: g.story.v ?? 1 };
    });
    result('0 flag off: no book, no Walt tab, none of the book\'s modules fetched', !off.book && !off.tab && off.extra === 0 && !off.ours.length && off.v === 1, off);
    await A.context().browser().close();
  }

  // the slice section on a new season at HOME -----------------------------------------------------------------------
  const A = await openGame('on', 'story=1');
  const h = harness(A);
  await newSeason(A, HOME);
  await h.until(() => window.__game.title.state === 'game' && !window.__game.player.teleporting && window.__game.book, null, 150000);
  // the counter: the staffer's talk gives the old gear (as gl-c-test plays it)
  await A.evaluate(() => { const g = window.__game, L = g.outfitter.layout(g.profile.home), p = g.player, at = L.counter || L.centre; p.x = at.x; p.z = at.z; p.placeOnGround(); });
  await h.step(90);
  await A.evaluate(() => { const g = window.__game, o = g.outfitter; o.openHot('counter', o.visit.landing); });
  await h.step(30); await A.waitForTimeout(900); await h.step(2);
  const talked = await A.evaluate(async () => { const g = window.__game, d = g.npcs.dialogue; for (let i = 0; i < 12 && d.convo; i++) { d.choose(0); await new Promise((r) => setTimeout(r, 30)); } g.outfitter.hide(); return { pack: !!g.profile.inventory.containers.find((c) => c.item === 'waltpack'), onboard: g.onboarding.state }; });
  result('setup: the staffer gives the old gear', talked.pack, talked);
  for (const s of SLICE.filter((q) => q.id === 'B1')) await s.run(h);
  // the old tent pitched at a free site near home, the pack set down by the pad (as gl-c-test does)
  const site = await A.evaluate(async () => {
    const g = window.__game, home = g.outfitter.landing(g.profile.home);
    const near = g.world.campsites.map((c) => ({ c, d: Math.hypot(c.x - home.x, c.z - home.z) })).filter((q) => q.d > 400).sort((a, b) => a.d - b.d).slice(0, 10);
    for (const { c } of near) {
      if (!g.campsites.isFree(g.campsites.key(c))) continue;
      await g.player.teleport(c.x, c.z);
      for (let i = 0; i < 40 && !c.layout; i++) { g.step(1 / 30, 10); await new Promise((r) => setTimeout(r, 100)); }
      if (c.layout && c.layout.pad && g.campsites.isFree(g.campsites.key(c))) return { i: g.world.campsites.indexOf(c) };
    }
    return null;
  });
  if (!site) throw new Error('no campsite with a layout near home');
  await h.until(() => !window.__game.player.teleporting);
  const pitched = await A.evaluate((i) => {
    const g = window.__game, c = g.world.campsites[i], L = c.layout, inv = g.profile.inventory, p = g.player, camp = g.camp, pad = L.pad;
    p.standAt({ x: pad.x + pad.fdx * 2.2, z: pad.z + pad.fdz * 2.2, heading: Math.atan2(-pad.fdx, pad.fdz), drop: { x: L.fire.x + 1.5, z: L.fire.z + 1.5, heading: 0 } });
    const pack = inv.containers.find((k) => k.item === 'waltpack'); pack.where = 'ground'; pack.at = { x: pad.x + pad.fdx * 1.6, z: pad.z + pad.fdz * 1.6 }; inv.emit('containers');
    g.step(1 / 30, 30);
    const tent = camp.tentInReach(); if (!tent) return { error: 'no tent in reach' };
    let s = null;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1.5, 1.5], [-1.5, -1.5]]) { s = camp.ghostAt(c, tent.def.id, pad.x + dx, pad.z + dz, pad.fdx, pad.fdz); if (s && s.ok) break; }
    if (!s || !s.ok) return { error: `no spot: ${s && s.why}` };
    if (!camp.stake(s, tent, c) || !camp.camp) return { error: 'not staked' };
    camp.setStage(camp.camp, 4); camp.pitched();
    return { item: camp.camp.item, carried: g.walt.carried(), due: g.walt.nightOneDue({ hours: 9, wakeAt: 6.5 }) };
  }, site.i);
  result('setup: the old tent pitched at a site; the bundle counts as carried', pitched.item === 'walttent' && pitched.carried && pitched.due, pitched);
  h.state.site = site.i;
  for (const s of SLICE.filter((q) => q.id !== 'B1')) { log('slice', s.id, s.name); try { await s.run(h); } catch (e) { result(`${s.id} threw`, false, { e: e.message }); } }

  // E1 a page given -----------------------------------------------------------------------------------------------------
  const e1 = await A.evaluate(() => {
    const g = window.__game, b = g.book;
    b.debug.definePage({ id: 'rig.note', title: 'June’s note', ref: 'L9', by: 'Josie' });
    const ok = b.givePage('rig.note', { by: 'Josie' });
    const inv = g.profile.inventory, where = (() => { for (const c of inv.containers) if (c.grid.some((e) => e.id === 'page:rig.note')) return c.item; return null; })();
    b.view = 'pages'; b.render(true);
    const el = document.querySelector('#journal .side.w');
    return { ok, where, fact: g.story.get('nb.page.rig.note'), kept: b.debug.bound('page:rig.note', { verb: 'give' }), tab: [...el.querySelectorAll('.pp-tab')].map((t) => t.textContent), paper: (el.querySelector('.nbw-sheet.given') || {}).textContent || '' };
  });
  await h.shot('b-pages');
  result('E1 a page given: kept, in your pockets, the Pages tab, its paper in the docs\' words', e1.ok && e1.where === 'pockets' && e1.fact === 'Josie' && e1.kept === 'kept' && e1.tab.includes('Pages') && /coffee's on/.test(e1.paper), e1);

  // E2 205/50 ------------------------------------------------------------------------------------------------------------
  const e2 = await A.evaluate(() => {
    const g = window.__game, tr = g.trip, [a, b] = g.book.debug.resolved()['205/50'], P = g.world.portages;
    tr.log('portage', { i: b, name: P[b].name, rods: P[b].rods }); tr.log('portage', { i: a, name: P[a].name, rods: P[a].rods }); // (either order)
    const s = g.story;
    return { a, b, bc: s.has('bc.205-50'), key: s.has('key.L2B'), und53: s.nbHas('und', 'NB53'), recent: g.storySeams.feed.recent.slice(-4).map((r) => r.evt) };
  });
  result('E2 P256 then P255 on one trip: "205/50" ticked, lock 2 key B, NB53 understood', e2.bc && e2.key && e2.und53 && e2.recent.includes('carrypair'), e2);

  // E4 the moments ---------------------------------------------------------------------------------------------------------
  const e4 = await A.evaluate(async () => { const u = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/hints\.js/.test(n)); const H = await import(u); const ms = H.MOMENTS.filter((m) => ['notebook', 'waltpage', 'readhere'].includes(m.id)); return ms.map((m) => [m.id, m.text]); });
  result('E4 the moments: "The notebook is in your book: {I}.", waltpage, readhere', e4.length === 3 && e4.some(([id, t]) => id === 'notebook' && /in your book/.test(t)), { e4 });

  // E3 a reload ------------------------------------------------------------------------------------------------------------
  const before = await A.evaluate(() => { const g = window.__game, s = g.story; s.flush(); g.profile.inventory.write(); return { walt: s.walt().length, read: Object.keys(s.doc.nb.read).length, at: g.book.at, here: Object.keys(s.doc.nb.here) }; });
  await A.evaluate(async () => { const g = window.__game; if (g.slots && g.slots.flush) await g.slots.flush(); if (g.store && g.store.flush) await g.store.flush(); });
  await A.waitForTimeout(800);
  await A.reload({ timeout: 180000 });
  await A.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && window.__game.book, null, { timeout: 300000, polling: 500 });
  await A.evaluate(() => { const g = window.__game; if (g.title.continueTrip) g.title.continueTrip(); });
  await h.until(() => window.__game.title.state === 'game', null, 150000);
  await h.step(10);
  const after = await A.evaluate(() => { const g = window.__game, s = g.story, j = g.journal; j.show('pack'); j.setSide('walt'); return { found: s.has('nb.found'), walt: s.walt().length, read: Object.keys(s.doc.nb.read).length, at: g.book.at, here: Object.keys(s.doc.nb.here), side: j.side, nb: g.profile.inventory.count('waltnotebook', { reachable: false }) }; });
  result('E3 a reload: the book as it was (found, the lines, the pages read, the spread, he was here; the notebook in the pockets)', after.found && after.walt === before.walt && after.read === before.read && after.at === before.at && after.here.join() === before.here.join() && after.side === 'walt' && after.nb === 1, { before, after });

  // E5 a co-op guest: no Walt side ------------------------------------------------------------------------------------------
  const e5 = await A.evaluate(() => { const g = window.__game, s = g.story, j = g.journal; j.close(); s.setMode('mirror'); j.show('pack'); j.setSide('walt'); const tab = document.querySelector('#journal .book-tab.w'); return { side: j.side, tabHidden: tab.hidden, visible: g.book.visible() }; });
  result('E5 a co-op guest (mirror): the Walt side is not there', e5.side !== 'walt' && e5.tabHidden && !e5.visible, e5);
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 8) });
} catch (e) {
  result('the rig ran to the end', false, { error: e.message, stack: (e.stack || '').split('\n').slice(0, 4) });
} finally {
  for (const b of browsers) { try { await b.close(); } catch { /* gone */ } }
  const fails = results.filter((r) => !r.pass).length;
  writeFileSync(path.join(OUT, 'c1-book.json'), JSON.stringify({ app: APP, home: HOME, results, errors }, null, 1));
  log(`c1-book: ${results.length - fails}/${results.length} PASS`);
  process.exit(fails ? 1 : 0);
}
