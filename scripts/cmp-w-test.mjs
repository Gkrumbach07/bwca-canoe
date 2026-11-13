// Stream w (the winter turn, campaign Round 3; campaign-design Part 3 #3 over §3.9), in the real game, headless Chromium
// against a running Vite with ?story=1, each check PASS or FAIL:
//   1 October: no price, no quota; the desk's "Fill one out" holds a self-issued permit, free; next year forward
//   2 next year's permits at the desk (two presses) → the winter card → up at seven on 15 June 2027, rested; the same
//     season, the money less the permit; the story kept (a fact set before is there), year.turned.2027, year:open once
//   3 ice-in mid-trip: "Frozen in", the trip NOT ended (a walk-out stays open); the paid rescue ($75) brings it in
//   4 the run caught by the ice (the run.active sensor faked): the turn by itself, "Frozen in." card, up at seven on the
//     ice-out day 2028, the trip still under way, year.turned.2028, year:open with auto
//
//   APP=http://localhost:5240 node scripts/cmp-w-test.mjs [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5240').replace(/\/$/, '');
const SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const HOME = 25;
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };
const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /seasonTurn|feed-season|story\.set year/.test(t)) log('console', m.type(), t.slice(0, 300)); });
  const until = (fn, a = null, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `cmp-w-${name}.png`) }); };
  await page.goto(`${APP}/?story=1`, { timeout: 180000 });
  await until(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, 300000);
  await page.evaluate(async (home) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy: 250 } }); if (g.onboarding && g.onboarding.pending && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(g.onboarding.home, false); } }, HOME);
  await until(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && g.storySeams && g.storySeams.feed && g.seasonTurn && g.story && g.story.winter; }, null, 240000);
  await page.evaluate(HELPERS_L);
  await page.evaluate(() => {
    const g = window.__game, L = window.__L;
    if (g.outfitter.open) g.outfitter.hide(); g.outfitter.arrival = null; if (g.saver) g.saver.enabled = false;
    window.__at = (year, doy, h = 10) => { g.day.setClock(year, doy, h); g.story.lastQ = null; g.story.update(); L.step(4); };
    window.__ev = []; g.seasonTurn.on('*', (e, k) => window.__ev.push({ k, auto: !!(e && e.auto), year: e && e.year }));
    window.__yo = []; g.story.on('year:open', (e) => window.__yo.push(e));
    window.__iceIn = (ep) => { const L0 = g.outfitter.landing(ep), ic = g.world.facts && g.world.facts.iceOf ? g.world.facts.iceOf(L0.lake) : null; return Math.round((ic && ic.in) || 329); };
    // a push-off from the home landing: onto its lake, 300 m out
    window.__pushOff = async (ep) => {
      const o = g.outfitter, l = o.landing(ep), lake = g.world.lakes[l.lake - 1];
      if (o.open) o.hide(); o.port = l;
      const dx = lake.cx - l.x, dz = lake.cz - l.z, d = Math.hypot(dx, dz) || 1, r = Math.min(300, d);
      await L.tp(l.x + (dx / d) * r, l.z + (dz / d) * r); await L.settle(); L.step(30);
      return g.trip.active;
    };
    g.story.set('asked.wrig.1', true, 'cmp-w-test'); // (a story fact from before: the turn keeps it)
  });

  // --- 1: October, self-issued --------------------------------------------------------------------------------------------
  await page.evaluate(() => { window.__at(2026, 283); const o = window.__game.outfitter; o.show(o.visit ? o.visit.landing : o.landing(25), 'counter'); window.__L.step(5); });
  const r1 = await page.evaluate(() => {
    const g = window.__game, P = g.permits, el = document.querySelector('#outfitter .permitdesk');
    const a = P.available(25, P.today), price = P.price('overnight', P.today);
    const buy = el && el.querySelector('[data-act="permit-buy"]'), label = buy ? buy.textContent : null;
    const money0 = g.profile.money;
    g.outfitter.act('permit-day', String(P.today)); g.outfitter.act('permit-buy');
    const held = P.held().find((p) => p.abs === P.today);
    return { price, self: !!a.self, left: a.left, label, fwd: !!(el && el.querySelector('.pd-next.fwd')), held: held ? { why: held.why, price: held.price } : null, paid: money0 - g.profile.money };
  });
  await shot('desk-october');
  result('1 October: free, self-issued, no quota; "Fill one out" holds one ($0); next year\'s permits forward', r1.price === 0 && r1.self && r1.left > 20 && r1.fwd && r1.held && r1.held.why === 'self' && r1.paid === 0, r1);

  // --- 2: next year's permits: the turn -----------------------------------------------------------------------------------
  await page.evaluate(() => { const g = window.__game, o = g.outfitter; window.__at(2026, 293); window.__season = g.profile.seasonId; g.energy.value = 0.4; o.show(o.visit ? o.visit.landing : o.landing(25), 'counter'); window.__L.step(5); });
  const r2a = await page.evaluate(() => {
    const g = window.__game, o = g.outfitter, june15 = Math.round(Date.UTC(2027, 5, 15) / 86400000);
    o.act('permit-next'); o.act('permit-nmonth', '6'); o.act('permit-nday', String(june15));
    const el = document.querySelector('#outfitter .permitdesk'), first = el ? el.querySelector('[data-act="permit-nbuy"]')?.textContent : null;
    o.act('permit-nbuy');
    const sure = document.querySelector('#outfitter .permitdesk [data-act="permit-nbuy"]')?.textContent;
    return { june15, first, sure, money: g.profile.money };
  });
  await shot('next-year');
  result('2a next year\'s June at the desk: "Choose · $6", then "Yes: end this season"', /Choose · \$6/.test(r2a.first || '') && /end this season/.test(r2a.sure || ''), r2a);
  await page.evaluate(() => window.__game.outfitter.act('permit-nbuy'));
  await until(() => window.__game.veil.active, null, 20000).catch(() => null);
  await shot('winter-card');
  await until(() => !window.__game.veil.active, null, 90000);
  await page.evaluate(() => window.__L.step(10));
  const r2 = await page.evaluate((june15) => {
    const g = window.__game, d = g.day, P = g.permits, s = g.story;
    return { year: d.year, today: P.today, hours: +d.hours.toFixed(2), energy: +g.energy.value.toFixed(2), awake: +g.energy.awake.toFixed(2), held: P.held().map((p) => p.abs).includes(june15), season: g.profile.seasonId === window.__season, money: g.profile.money,
      kept: s.has('asked.wrig.1'), turned: s.has('year.turned.2027'), yo: window.__yo.map((e) => [e.year, e.from, e.auto]), ev: window.__ev.map((e) => e.k), last: s.winter.last() };
  }, r2a.june15);
  const n2 = (k) => r2.ev.filter((e) => e === k).length;
  result('2b up at seven on 15 June 2027, rested, the permit held, the same season and story; year.turned.2027; year:open once',
    r2.year === 2027 && r2.today === r2a.june15 && Math.abs(r2.hours - 7) < 0.2 && r2.energy >= 0.99 && r2.awake < 1 && r2.held && r2.season && r2a.money - r2.money === 6 && r2.kept && r2.turned && r2.yo.length === 1 && r2.yo[0][0] === 2027 && n2('wake') === 1 && n2('year:open') === 1, r2);

  // --- 3: ice-in mid-trip: walk out or the paid rescue ---------------------------------------------------------------------
  const inn = await page.evaluate(() => { window.__at(2027, 290); return window.__iceIn(25); });
  const on3 = await page.evaluate(() => window.__pushOff(25));
  await page.evaluate((inn) => { const g = window.__game; window.__at(2027, Math.min(364, inn + 3), 11); g.energy.value = 1; g.profile.s.money = 200; }, inn);
  await page.evaluate(() => window.__L.step(150));
  const r3 = await page.evaluate(() => { const g = window.__game, G = g.guide; G.sync(); const e = G.get('late:ice'); return { active: g.trip.active, iced: g.trip.state.iced, entry: e ? e.title : null, button: e && e.action ? e.action.label : null }; });
  await page.evaluate(() => window.__L.step(300));
  const still = await page.evaluate(() => window.__game.trip.active);
  result('3a ice-in mid-trip: "Frozen in", the rescue offered, and the trip not ended by force', on3 && r3.active && !!r3.iced && /Frozen in/.test(r3.entry || '') && /rescue · \$75/.test(r3.button || '') && still, { inn, on3, ...r3, still });
  const m0 = await page.evaluate(() => window.__game.profile.money);
  const resc = await page.evaluate(() => window.__game.seasonTurn.rescue());
  await until(() => !window.__game.trip.active && !window.__game.veil.active, null, 120000).catch(() => null);
  await page.evaluate(() => { const g = window.__game; window.__L.step(10); if (g.record && g.record.shown) g.record.close(); if (g.journal && g.journal.open) g.journal.close(); if (g.outfitter.open) g.outfitter.hide(); });
  const r3b = await page.evaluate(() => { const g = window.__game, b = g.trip.book.trips, last = b[b.length - 1]; return { active: g.trip.active, money: g.profile.money, k: last && last.k, why: last && last.why }; });
  result('3b the paid rescue: $75, the trip brought in ("evacuated", ice), no fail screen', resc.ok && !r3b.active && m0 - r3b.money === 75 && r3b.k === 'evacuated', { resc, m0, ...r3b });

  // --- 4: the run caught by the ice: the turn by itself -------------------------------------------------------------------
  await page.evaluate(() => { const g = window.__game; window.__at(2027, 300); window.__runOff = g.story.sensor('run.active', () => true); window.__ev.length = 0; });
  const on4 = await page.evaluate(() => window.__pushOff(25));
  await page.evaluate((inn) => { const g = window.__game; g.energy.value = 0.5; window.__at(2027, Math.min(364, inn + 3), 21); }, inn);
  await page.evaluate(() => window.__L.step(120));
  await until(() => window.__game.veil.active || window.__ev.some((e) => e.k === 'wake'), null, 20000).catch(() => null);
  await shot('frozen-in-card');
  await until(() => !window.__game.veil.active && window.__ev.some((e) => e.k === 'year:open'), null, 90000).catch(() => null);
  await page.evaluate(() => { window.__L.step(10); window.__runOff(); });
  const r4 = await page.evaluate(() => {
    const g = window.__game, d = g.day, s = g.story;
    return { on: g.trip.active, iced: g.trip.state.iced, year: d.year, doy: d.doy, hours: +d.hours.toFixed(2), energy: +g.energy.value.toFixed(2), turned: s.has('year.turned.2028'), kept: s.has('asked.wrig.1'),
      ev: window.__ev.map((e) => `${e.k}${e.auto ? '*' : ''}`), yo: window.__yo.map((e) => [e.year, e.auto]), ticket: (g.guide.sync(), !!g.guide.get('late:ice')) };
  });
  await shot('ice-out-2028');
  result('4 the run frozen in: the turn by itself, up at seven at ice-out 2028, the trip still under way, rested; year.turned.2028; year:open auto',
    on4 && r4.on && !r4.iced && r4.year === 2028 && r4.doy < 182 && Math.abs(r4.hours - 7) < 0.2 && r4.energy >= 0.99 && r4.turned && r4.kept && r4.ev.includes('wake*') && r4.ev.includes('year:open*') && r4.yo.some((y) => y[0] === 2028 && y[1]) && !r4.ticket, { on4, ...r4 });
} catch (e) {
  log('ERROR', e && e.stack ? e.stack : e);
  results.push({ name: 'run', pass: false });
} finally {
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 8) });
  await browser.close();
  const fails = results.filter((r) => !r.pass).length;
  log(`cmp-w-test: ${results.length - fails}/${results.length}${fails ? ' FAIL' : ' PASS'}`);
  process.exit(fails ? 1 : 0);
}
