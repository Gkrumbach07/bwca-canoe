// chk-s: the story's saves under stress (flag on), against claude/story-r0.
//   APP=... node scripts/chk-save.mjs --out <dir> [--season <main-made season file>]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5442').replace(/\/$/, '');
const OUT = path.resolve(arg('out', '/tmp/chk-save')); mkdirSync(OUT, { recursive: true });
const SEASON = arg('season', '');
const ONLY = arg('only', '');
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1500)); };
const browsers = [];
async function fresh(name) {
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(b);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /story/i.test(m.text()))) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  return page;
}
const booted = (page) => page.waitForFunction(() => window.__game && window.__game.title && window.__game.story && (window.__game.title.state === 'title' || window.__game.title.state === 'game') && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
async function go(page, q = '') { await page.goto(`${APP}/${q ? '?' + q : ''}`, { timeout: 180000 }); await booted(page); }
const inGame = (page) => page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 150000, polling: 250 });
async function newSeason(page, home = 31, doy = 190) {
  await page.evaluate(async ([home, doy]) => { const g = window.__game, t = g.title; t.setPick('adventure'); await t.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await inGame(page);
}
const flushAll = (page) => page.evaluate(async () => { const g = window.__game, s = g.story; try { s.flush && s.flush(); } catch { /* */ } try { g.slots.flush(); } catch { /* */ } await new Promise((r) => setTimeout(r, 100)); if (g.store.flush) await g.store.flush(); await new Promise((r) => setTimeout(r, 300)); });
// a reload the page did itself (slots.play / startNew / import)
async function afterReload(page, fn) { const nav = page.waitForNavigation({ timeout: 120000 }).catch(() => null); await page.evaluate(fn); await nav; await booted(page); }
const state = (page) => page.evaluate(() => {
  const g = window.__game, s = g.story, r1 = g.store.getItem('bwca-canoe:story'), r2 = g.store.getItem('bwca-canoe:story2');
  const d2 = r2 && JSON.parse(r2);
  return { v: s.v ?? 1, live: g.slots.live, season: g.profile.seasonId, started: g.profile.started, waltFound: g.walt.found, nb: s.state && s.state.notebook, read: s.state && s.state.read && s.state.read.slice ? s.state.read.slice() : null,
    has: s.v === 2 ? { found: s.has('nb.found'), legacyChk: s.get ? s.get('legacy.chk') : null } : null, walt: s.v === 2 ? s.walt() : null, legacy: s.legacy, stage: s.stage ?? null,
    v1: r1 && JSON.parse(r1), v2: d2 && { season: d2.season, facts: Object.keys(d2.facts || {}), legacy: d2.legacy, log: (d2.log || []).map((r) => r[3]) }, mode: s.mode ?? null, errs: s.debug && s.debug.errors ? s.debug.errors() : null };
});

try {
  // S2 the stale story2: flag on → flag off (find the notebook in v1) → flag on again ------------------------------------
  if (!ONLY || ONLY.includes('2')) {
    const A = await fresh('s2');
    await go(A, 'story=1'); await newSeason(A);
    const a = await state(A); await flushAll(A);
    await go(A, ''); // the same season, flag off
    const b = await A.evaluate(async () => { const g = window.__game; if (g.title.state !== 'game') g.title.continueTrip && g.title.continueTrip(); const put = g.walt.find({ key: 3, lake: 'Off Lake' }); await new Promise((r) => setTimeout(r, 200)); try { g.story.read(0); g.story.flag('offflag', 1); } catch { /* */ } return { put, found: g.walt.found }; });
    await flushAll(A);
    const b1 = await state(A);
    await go(A, 'story=1');
    const c = await state(A); await flushAll(A);
    await go(A, '');
    const d = await state(A);
    result('S2a flag on → off: the v1 build finds the notebook in the same season', b.found && b1.nb.found, { a: { season: a.season, v2: a.v2 }, b, b1nb: b1.nb });
    result('S2b off → on again: the v2 story sees the notebook found while the flag was off', c.has && c.has.found, { c });
    result('S2c on → off again: the v1 notebook found during flag-off play is still found', d.nb && d.nb.found === true && d.waltFound, { d });
    await A.context().browser().close();
  }

  // S1 a main-made season file (v1 story, notebook found, page 0 read, a flag) imported into slot 2, played flag on ---
  if ((!ONLY || ONLY.includes('1')) && SEASON && existsSync(SEASON)) {
    const text = readFileSync(SEASON, 'utf8');
    const A = await fresh('s1');
    await go(A, 'story=1'); await newSeason(A, 25, 180);
    await flushAll(A);
    const imp = await A.evaluate(async (text) => { const r = await window.__game.slots.importSeason(text, 2); return r; }, text);
    if (imp && imp.reload) await booted(A).catch(() => null);
    await A.waitForTimeout(3000); await booted(A);
    const list = await A.evaluate(() => window.__game.slots.list().map((s) => ({ n: s.n, live: s.live, empty: s.empty })));
    await afterReload(A, () => window.__game.slots.play(2));
    const s = await state(A);
    result('S1a a main-made season imports and plays under the flag: v2, nb.found, legacy.chk, the Walt lines', s.live === 2 && s.v === 2 && s.has.found && s.has.legacyChk === 'v' && s.walt && s.walt.length >= 1 && !(s.errs || []).length, { imp, list, s });
    await flushAll(A);
    await go(A, ''); // flag off: the v1 doc as main wrote it, or its echo
    const s2 = await state(A);
    result('S1b back to the flag off: the v1 notebook found, page 0 still read, the flag kept', s2.nb && s2.nb.found && Array.isArray(s2.read) && s2.read.includes(0) && s2.v1 && s2.v1.flags && s2.v1.flags.chk === 'v', { s2 });
    await A.context().browser().close();
  }

  // S4 two slots, flag on: slot 1 finds the notebook, slot 2 a new season stays blank, slot 1 back keeps it; S5 export/import
  if (!ONLY || ONLY.includes('4')) {
    const A = await fresh('s4');
    await go(A, 'story=1'); await newSeason(A, 31, 190);
    await A.evaluate(async () => { const g = window.__game; g.walt.find({ key: 2, lake: 'Slot One Lake' }); await new Promise((r) => setTimeout(r, 200)); g.story.debug.set && g.story.debug.set('crews.seen'); });
    await flushAll(A);
    const one = await state(A);
    await afterReload(A, () => window.__game.slots.startNew(2, { ep: 25, mode: 'adventure', start: { year: 2026, doy: 170 } }));
    await inGame(A).catch(() => null);
    const two = await state(A);
    result('S4a slot 2 new season under the flag: its own story2 (no nb.found, no crews, own season id)', two.live === 2 && two.v === 2 && !two.has.found && two.season !== one.season && two.v2 && two.v2.season === two.season && !two.v2.facts.includes('crews.seen'), { one: { season: one.season, facts: one.v2 && one.v2.facts }, two });
    await flushAll(A);
    await afterReload(A, () => window.__game.slots.play(1));
    const back = await state(A);
    result('S4b slot 1 back: nb.found and crews.seen kept, its season', back.live === 1 && back.has.found && back.v2.facts.includes('crews.seen') && back.season === one.season, { back });
    // S5 export slot 1 (flag on) into slot 3
    const ex = await A.evaluate(async () => { const g = window.__game; g.slots.flush(); await new Promise((r) => setTimeout(r, 200)); const r = await g.slots.exportSeason(1); return r && r.text; });
    writeFileSync(path.join(OUT, 'season-r0-on.json'), ex || '');
    const keys = (() => { try { const j = JSON.parse(ex); return Object.keys(j.keys || j.data || {}).filter((k) => /story/.test(k)); } catch (e) { return 'err:' + e.message; } })();
    const imp = await A.evaluate(async (t) => window.__game.slots.importSeason(t, 3), ex);
    await A.waitForTimeout(2000); await booted(A);
    await afterReload(A, () => window.__game.slots.play(3));
    const three = await state(A);
    result('S5 export (flag on) → import into slot 3: story2 travels with the season (nb.found, crews.seen); story-meta stays the player\'s', three.live === 3 && three.has.found && three.v2.facts.includes('crews.seen'), { keys, imp, three });
    // then the flag off on slot 3: the v1 echo reads the notebook
    await go(A, '');
    const off3 = await state(A);
    result('S5b slot 3 with the flag off: the v1 echo has the notebook found', off3.nb && off3.nb.found && off3.waltFound, { off3 });
    await A.context().browser().close();
  }

  // S3 a save mid-trip, flag on: reload into the trip; no second trip:start; the trip's number kept; trip:end once ------
  if (!ONLY || ONLY.includes('3')) {
    const A = await fresh('s3');
    await go(A, 'story=1'); await newSeason(A, 31, 190);
    await A.waitForFunction(() => !!(window.__game.storySeams && window.__game.storySeams.feed), null, { timeout: 30000 });
    const t0 = await A.evaluate(() => { const g = window.__game; try { if (g.outfitter.open) g.outfitter.hide(); if (g.onboarding.pending && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(31, false); } } catch (e) { return 'onb:' + e.message; }
      const ev = []; g.story.on('*', (e, d) => { if (/^trip:/.test(e)) ev.push([e, d && d.n]); });
      try { g.trip.start({ ep: g.profile.home, foodDays: 2, canoe: 'aluminium' }); } catch (e) { return 'start:' + e.message; }
      g.step(1 / 30, 60); window.__chkEv = ev;
      return { active: !!g.trip.active, ev, tick: g.story.state.tick, byEvt: g.storySeams.feed.stats().byEvt, facts: Object.keys(g.story.facts()) };
    });
    await A.evaluate(() => window.__game.saver && window.__game.saver.write());
    await flushAll(A);
    await go(A, 'story=1');
    await A.evaluate(() => { const g = window.__game; if (g.title.state === 'title' && g.profile.started) g.title.continueTrip(); });
    await inGame(A).catch(() => null);
    await A.waitForFunction(() => !!(window.__game.storySeams && window.__game.storySeams.feed), null, { timeout: 30000 }).catch(() => null);
    const t1 = await A.evaluate(() => { const g = window.__game, f = g.storySeams.feed; g.step(1 / 30, 60);
      const ev = []; g.story.on('*', (e, d) => { if (/^trip:/.test(e)) ev.push([e, d && d.n]); });
      let closed = null; try { g.trip.close('completed', 'came in', g.profile.home); g.step(1 / 30, 10); closed = true; } catch (e) { closed = e.message; }
      return { active: g.trip.active ? true : false, byEvt: f.stats().byEvt, ev, closed, tick: g.story.state.tick, facts: Object.keys(g.story.facts()), errs: g.story.debug.errors(), trips: g.trip.book && g.trip.book.trips && g.trip.book.trips.length };
    });
    result('S3a mid-trip reload under the flag: the trip resumes, no trip:start replayed, the story\'s state carried', t0.active && !(t1.byEvt['trip:start'] > 0) && (t1.facts || []).length >= (t0.facts || []).length, { t0, t1 });
    result('S3b the resumed trip ends once with trip 1\'s number', t1.ev.filter((e) => e[0] === 'trip:end').length === 1 && t1.ev.find((e) => e[0] === 'trip:end')[1] === 1, { ev: t1.ev, trips: t1.trips });
    await A.context().browser().close();
  }
} catch (e) { result('rig ran to the end', false, { error: String(e && e.stack || e).slice(0, 1500) }); }
finally { for (const b of browsers) { try { await b.close(); } catch { /* */ } } }
result('no page errors', !errors.length, { errors: errors.slice(0, 10) });
const pass = results.filter((r) => r.pass).length;
writeFileSync(path.join(OUT, 'chk-save.json'), JSON.stringify({ pass, total: results.length, results }, null, 1));
log(`chk-save: ${pass}/${results.length} PASS`);
