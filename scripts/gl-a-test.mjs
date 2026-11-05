// Game-loop stream A's acceptance (docs/build/game-loop-brief.md, "Stream A: permits"): permits.js, permit-desk.js,
// pma.js and the trip core's permit, in one headless Chromium against a running Vite.
//   1. what is left: a July Saturday at Moose Lake (25) ≤ 3, a mid-September Tuesday ≥ 80 % of the quota, an ice day closed
//   2. prices: one flat $6 for either kind, any day of the year (the owner's call 2026-11-05)
//   3. at a counter: buy today (paid, held); buy today + 5: the skip (the clock that day at 07:00, rested, no trip)
//   4. a push-off with the permit (trip.state.permit, not day use); with none: day use, past dusk one fine, the desk
//      refuses until it is paid
//   5. grant: a $0 permit
//   6. an old save (a v3 core, a trip under way) boots: the trip goes on, grandfathered, never fined
//   7. a PMA permit: off-site camping inside its polygon only, and not on another trip; 7″ the real twelve from the
//      Forest Service's layer (src/pma.json, scripts/gl-a-pma-real.mjs)
//   8. the desk at a counter: 28 day cells, the sold-out ones disabled (stream B absent: the wrapped claims section)
//
//   APP=http://localhost:5181 node scripts/gl-a-test.mjs [--shots docs/build/shots] [--out dir]
// Exit code 0 when every check passes. Writes <out>/gl-a-results.json.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5181';
const OUT = path.resolve(arg('out', 'gl-a-out'));
const SHOTS = arg('shots', null);
mkdirSync(OUT, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more)); };
const shot = async (page, name) => { if (!SHOTS) return; try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); log('shot', name); } catch (e) { log('shot', name, e.message); } };
const until = (page, fn, a, timeout = 90000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
const HOME = 25, START_DOY = 190; // Moose Lake, July 9: the calendar runs over the July Saturdays

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' || /permits/.test(m.text())) log(m.type(), m.text().slice(0, 300)); });
const load = async () => {
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.permits && typeof window.__game.step === 'function', null, { timeout: 240000, polling: 500 });
};
// a few frames of the game's own (the page's rAF runs too, headless)
const frames = (n = 30, dt = 1 / 30) => page.evaluate(([n, dt]) => { for (let k = 0; k < n; k += 300) window.__game.step(dt, Math.min(300, n - k)); }, [n, dt]);
// out onto the water off the home landing: the trip pushes off by itself (outfitter.updateTrip)
const pushOff = async () => {
  await page.evaluate(async (home) => {
    const g = window.__game, o = g.outfitter, l = o.landing(home), w = g.world, lake = w.lakes[l.lake - 1];
    if (o.open) o.hide();
    o.port = l;
    const dx = lake.cx - l.x, dz = lake.cz - l.z, d = Math.hypot(dx, dz) || 1, r = Math.min(400, d);
    await g.player.teleport(l.x + (dx / d) * r, l.z + (dz / d) * r);
  }, HOME);
  await until(page, () => !window.__game.player.teleporting);
  await frames(20);
  return page.evaluate(() => { const t = window.__game.trip; return { active: t.active, permit: t.state.permit, dayUse: t.state.dayUse }; });
};
const comeIn = () => page.evaluate((home) => { const g = window.__game, o = g.outfitter; o.comeIn(o.landing(home)); return g.trip.state.outcome; }, HOME);
// the trip card (record.js) comes up a second or so after a trip ends: put it away
const cardAway = async () => { await page.waitForTimeout(1800); await frames(10); await page.evaluate(() => { const g = window.__game; if (g.record && g.record.shown) g.record.close(); if (g.outfitter.open) g.outfitter.hide(); }); await frames(5); };

try {
  await load();
  log('game loaded');
  // --- a new Adventure season at Moose Lake, July 9 --------------------------------------------------------------------
  await page.evaluate(async ([home, doy]) => {
    const g = window.__game, t = g.title, ep = g.world.entryPoints.find((e) => e.ep === home);
    t.setPick('adventure');
    await t.newSeason(ep, { confirm: false, start: { year: 2026, doy } });
    // (the join: the home counter's first-visit talk is stream C's, tested by gl-c-test; here it is over)
    if (g.onboarding && g.onboarding.pending()) g.onboarding.finish(g.onboarding.home, false);
  }, [HOME, START_DOY]);
  await until(page, () => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 180000);
  await page.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
  const t0 = await page.evaluate(() => { const g = window.__game, d = g.day; return { today: g.permits.today, doy: d.doy, year: d.year, hours: d.hours, money: g.profile.money, held: g.permits.held().length }; });
  log('season begun', t0);

  // --- 1 + 2: the calendar's numbers and the prices ----------------------------------------------------------------------
  const q = await page.evaluate(() => {
    const g = window.__game, P = g.permits, abs0 = (y, doy) => Math.round(Date.UTC(y, 0, doy) / 86400000);
    const wd = (abs) => (((abs + 4) % 7) + 7) % 7; // 0 Sunday
    const first = (from, w) => { let a = from; while (wd(a) !== w) a++; return a; };
    const y = g.day.year;
    const julySat = first(abs0(y, 196), 6), septTue = first(abs0(y, 258), 2), ice = abs0(y, 20), iceSpring = abs0(y, 100);
    const table = {};
    for (const ep of [25, 30, 38, 54, 1, 16, 64]) {
      const sats = [], tues = [];
      for (let k = 0; k < 4; k++) { sats.push(P.available(ep, first(abs0(y, 186), 6) + 7 * k)); tues.push(P.available(ep, first(abs0(y, 255), 2) + 7 * k)); }
      table[ep] = { quota: sats[0].quota, julySatLeft: sats.map((a) => a.left), septTueLeft: tues.map((a) => a.left) };
    }
    const july = P.available(25, julySat), sept = P.available(25, septTue);
    return {
      julySat, septTue, july, sept, ice: P.available(25, ice), iceSpring: P.available(25, iceSpring), table,
      prices: { july: P.price('overnight', abs0(y, 196)), may: P.price('overnight', abs0(y, 140)), sep: P.price('overnight', abs0(y, 258)), pmaJuly: P.price('pma', abs0(y, 196)), pmaMay: P.price('pma', abs0(y, 140)) },
    };
  });
  log('five entry points, July Saturdays and September Tuesdays (left of quota):', JSON.stringify(q.table));
  result('1a a July Saturday at Moose Lake has ≤ 3 left', q.july.left <= 3, { left: q.july.left, quota: q.july.quota, booked: q.july.booked });
  result('1b a mid-September Tuesday at Moose Lake has ≥ 80 % of its quota left', q.sept.left >= 0.8 * q.sept.quota, { left: q.sept.left, quota: q.sept.quota });
  result('1c an ice day is closed', q.ice.closed && q.ice.left === 0 && q.iceSpring.closed, { jan: q.ice, apr10: q.iceSpring });
  result('2 one flat $6: July, May, September, a PMA alike', Object.values(q.prices).every((v) => v === 6), q.prices);

  // --- 8: the desk at the counter -----------------------------------------------------------------------------------------
  await page.evaluate(() => { const o = window.__game.outfitter; o.show(o.visit.landing, 'counter'); });
  await frames(5);
  const desk = await page.evaluate(() => {
    const el = document.querySelector('#outfitter .permitdesk');
    const cells = el ? [...el.querySelectorAll('.pd-day')] : [];
    const sold = cells.filter((c) => /full|ice/.test(c.textContent));
    return { addDesk: typeof window.__game.outfitter.addDesk === 'function', there: !!el, cells: cells.length, sold: sold.length, soldDisabled: sold.every((c) => c.disabled), open: cells.filter((c) => !c.disabled).length, buy: !!(el && el.querySelector('[data-act="permit-buy"]')) };
  });
  result('8 the desk renders at a counter: 28 days, the sold-out ones disabled', desk.there && desk.cells === 28 && desk.sold > 0 && desk.soldDisabled && desk.buy, desk);
  await page.evaluate(() => { const el = document.querySelector('#outfitter .permitdesk'); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot(page, 'a-desk');
  // the desk with a primitive area picked (the shot)
  await page.evaluate(() => { window.__game.outfitter.act('permit-kind', 'pma'); });
  await frames(3);
  const pmaDesk = await page.evaluate(() => { const el = document.querySelector('#outfitter .permitdesk'); if (el) el.scrollIntoView({ block: 'start' }); return { pmaSelect: !!(el && el.querySelector('select[data-act="permit-pma"]')), buy: el ? el.querySelector('[data-act="permit-buy"]')?.textContent : null }; });
  await page.waitForTimeout(400);
  await shot(page, 'a-pma');
  result('7′ the desk sells a primitive area permit: the area to pick, its price', pmaDesk.pmaSelect && /\$6\b/.test(pmaDesk.buy || ''), pmaDesk);
  await page.evaluate(() => { const o = window.__game.outfitter; o.act('permit-kind', 'overnight'); });

  // --- 3: buy today, then today + 5 (the skip) ------------------------------------------------------------------------------
  // (the parties are seeded by the season, so a July day at Moose Lake may be sold out: today's permit is for the first
  // entry point this desk sells with room today, the skip's for the first day from today + 5 with room at home)
  const b1 = await page.evaluate((home) => {
    const g = window.__game, P = g.permits, D = g.permitDesk, m0 = g.profile.money;
    const ep = D.epsFor(home).find((e) => P.available(e, P.today).left > 0);
    const r = P.buy({ ep, abs: P.today, at: home });
    let target = P.today + 5; while (P.available(home, target).left <= 0 && target < P.today + 27) target++;
    return { ep, ok: r.ok, why: r.why, spent: m0 - g.profile.money, price: r.permit ? r.permit.price : null, held: P.held().map((p) => ({ ep: p.ep, abs: p.abs, kind: p.kind })), today: P.today, target };
  }, HOME);
  result('3a buy today at the counter: the price spent, held', b1.ok && b1.spent === b1.price && b1.price > 0 && b1.held.some((p) => p.ep === b1.ep && p.abs === b1.today), b1);
  // a later day through the desk's own buttons (the day cell, then Buy)
  const target = b1.target;
  await page.evaluate(() => { const o = window.__game.outfitter; o.render(); });
  const clicked = await page.evaluate((abs) => {
    const cell = document.querySelector(`#outfitter .permitdesk .pd-day[data-id="${abs}"]`);
    if (!cell || cell.disabled) return { cell: !!cell, disabled: cell ? cell.disabled : null };
    cell.click();
    const buy = document.querySelector('#outfitter .permitdesk [data-act="permit-buy"]');
    const label = buy ? buy.textContent : null, note = document.querySelector('#outfitter .permitdesk .pd-buy')?.textContent;
    if (buy && !buy.disabled) buy.click();
    return { cell: true, label, note };
  }, target);
  log('desk click', clicked);
  await frames(60);
  await until(page, () => window.__game.veil.dark || !window.__game.veil.active, null, 30000);
  await shot(page, 'a-skip');
  await until(page, () => !window.__game.veil.active, null, 60000);
  await frames(2);
  const sk = await page.evaluate(() => {
    const g = window.__game, d = g.day, P = g.permits, w = g.weather, pa = g.parties;
    return { today: P.today, hours: +d.hours.toFixed(2), energy: g.energy.value, active: g.trip.active, held: P.held().map((p) => ({ ep: p.ep, abs: p.abs })), lapsed: P.s.lapsed.slice(), seasonDoy: d.season.doy, partiesToday: pa ? pa.today : null, weather: w ? { kind: w.kind || w.state || null } : null, jumps: d.jumps };
  });
  result('3b buy for a later day skips to it: that day, 07:00, rested, no trip', sk.today === target && Math.abs(sk.hours - 7) < 0.1 && sk.energy >= 0.99 && !sk.active && sk.held.some((p) => p.abs === target), { ...sk, target });
  result('3c the day turned behind the skip: the season and the parties follow it', sk.seasonDoy === (await page.evaluate(() => window.__game.day.doy)) && (sk.partiesToday == null || sk.partiesToday === target), { seasonDoy: sk.seasonDoy, partiesToday: sk.partiesToday, lapsedIds: sk.lapsed });
  await page.evaluate(() => { const o = window.__game.outfitter; if (!o.open && o.visit) o.show(o.visit.landing, 'counter'); });
  await frames(3);
  const lapsedLine = await page.evaluate(() => document.querySelector('#outfitter .permitdesk .lapsed')?.textContent || null);
  result('3d the permit left unused lapses, with one line at the desk', !!lapsedLine, { lapsedLine });

  // --- 4a: push off with the permit ------------------------------------------------------------------------------------------
  const p1 = await pushOff();
  result('4a pushed off with the permit: trip.state.permit set, not day use', p1.active && p1.permit && p1.permit.id && p1.dayUse === false, p1);
  const out1 = await comeIn();
  await cardAway();
  result('4a′ came in: the exit outcome carries the permit', out1 && out1.permitId === (p1.permit && p1.permit.id) && out1.dayUse === false, out1);

  // --- 4b: no permit: day use, the fine at dusk, the desk shut till it is paid -----------------------------------------------
  const p2 = await pushOff();
  const title2 = await page.evaluate(() => window.__game.hud.el.placeSub.textContent || null);
  result('4b pushed off with no permit: day use', p2.active && !p2.permit && p2.dayUse === true, { ...p2, title: title2 });
  await page.evaluate(() => {
    const g = window.__game, d = g.day, P = g.permits, en = g.energy, to = P.duskOf() - 0.4;
    if (d.hours < to) d.advance(to - d.hours);
    en.value = 1; if (en.needs) { en.needs.food = 1; en.needs.water = 1; }
  });
  await frames(30);
  // (one moment at a time, each up seven seconds: give it the real time the game's clock gives it at sunset)
  await page.waitForFunction(() => (window.__game.hints.log || []).some((h) => h.id === 'dayuse'), null, { timeout: 25000, polling: 250 }).catch(() => log('no dayuse moment yet', JSON.stringify(window.__game ? null : null)));
  const shownBefore = await page.evaluate(() => (window.__game.hints.log || []).slice(-6).map((h) => h.id));
  log('moments shown', shownBefore);
  const beforeDusk = await page.evaluate(() => ({ fines: window.__game.permits.fines.length }));
  await page.evaluate(() => { const g = window.__game, d = g.day, P = g.permits; d.advance(P.duskOf() + 0.2 - d.hours); g.energy.value = 1; });
  await frames(90);
  await page.waitForTimeout(600); await frames(5);
  await shot(page, 'a-fine');
  await page.evaluate(() => { const g = window.__game; g.day.advance(1.5); g.energy.value = 1; });
  await frames(90);
  const fineState = await page.evaluate(() => {
    const g = window.__game, P = g.permits;
    const hint = (g.hints && g.hints.log ? g.hints.log : []).filter((h) => h.id === 'dayuse').map((h) => h.text);
    return { fines: P.fines.map((f) => ({ n: f.n, why: f.why, paid: f.paid })), owed: P.owed(), logged: g.trip.state.log.filter((e) => e.k === 'fine').length, active: g.trip.active, hours: g.day.hours, hint };
  });
  result('4c past dusk on the water: exactly one fine, logged', beforeDusk.fines === 0 && fineState.fines.length === 1 && fineState.logged === 1 && fineState.owed === 20, { beforeDusk, ...fineState });
  result('4c′ the day-use moment came once before dusk', fineState.hint.length === 1, { hint: fineState.hint });
  await comeIn();
  await cardAway();
  const refuse = await page.evaluate((home) => {
    const g = window.__game, P = g.permits, m0 = g.profile.money;
    const r1 = P.buy({ ep: home, abs: P.today + 1, at: home });
    g.profile.earn(60, 'the test');
    const m1 = g.profile.money, paid = P.payFines(), m2 = g.profile.money;
    const r2 = P.buy({ ep: home, abs: P.today, at: home });
    return { refused: !r1.ok && r1.why === 'fines', words: r1.words, paid, cost: m1 - m2, owed: P.owed(), after: r2.ok || r2.why, m0 };
  }, HOME);
  result('4d buy is refused until the fine is paid; payFines spends it, and the desk sells again', refuse.refused && refuse.paid && refuse.cost === 20 && refuse.owed === 0 && (refuse.after === true || refuse.after === 'full'), refuse);

  // --- 5: grant ------------------------------------------------------------------------------------------------------------------
  const gr = await page.evaluate((home) => {
    const g = window.__game, P = g.permits, m0 = g.profile.money;
    const p = P.grant({ ep: home, abs: P.today, from: home, why: 'first' });
    return { price: p.price, moneyChange: g.profile.money - m0, held: !!P.forTrip(home, P.today) };
  }, HOME);
  result('5 grant gives a $0 permit, the money unchanged', gr.price === 0 && gr.moneyChange === 0 && gr.held, gr);

  // --- 7″: the real twelve (the owner's call 2026-11-05: the Forest Service's own polygons, scripts/gl-a-pma-real.mjs) ----------
  const real = await page.evaluate(() => {
    const P = window.__game.permits, w = window.__game.world, list = P.pmas();
    return { n: list.length, rows: list.map((a) => ({ id: a.id, name: a.name, approx: a.approx, near: a.near, lake: a.lake, verts: a.poly.length, inside: P.pmaAt(a.centre[0], a.centre[1])?.id === a.id, lakeIn: !!(a.lake && w.lakes[a.lake - 1] && P.pmaAt(w.lakes[a.lake - 1].cx, w.lakes[a.lake - 1].cz)?.id === a.id), host: !!(w.entryPoints.find((e) => e.ep === a.near)) })) };
  });
  result('7″ the real twelve: Forest Service polygons, "<X> Lake primitive area", centre and biggest lake inside, near an outfitter', real.n === 12 && real.rows.every((r) => r.approx === false && /^[A-Z][\w’' -]* Lake primitive area$/.test(r.name) && r.inside && r.lakeIn && r.host && r.verts >= 12), real);
  // --- 7: a PMA permit ---------------------------------------------------------------------------------------------------------
  // (the granted overnight one first: a trip on it, then the PMA one)
  const pmaInfo = await page.evaluate(() => { const P = window.__game.permits, a = P.pmasNear(25, 1)[0], b = P.pmas().find((q) => q.id !== a.id); return { a: { id: a.id, name: a.name, c: a.centre }, b: { id: b.id, c: b.centre } }; });
  await pushOff();
  await page.waitForTimeout(300);
  const onOvernight = await page.evaluate((c) => window.__game.permits.allowsOffsite(c[0], c[1]), pmaInfo.a.c);
  await comeIn();
  await cardAway();
  await page.evaluate(([home, id]) => { const P = window.__game.permits; P.grant({ ep: home, abs: P.today, kind: 'pma', pma: id, from: home, why: 'test' }); }, [HOME, pmaInfo.a.id]);
  const p3 = await pushOff();
  const pm = await page.evaluate(([a, b, home]) => {
    const g = window.__game, P = g.permits, l = g.outfitter.landing(home);
    return { inside: P.allowsOffsite(a[0], a[1]), insideAt: P.pmaAt(a[0], a[1])?.id || null, outside: P.allowsOffsite(l.x, l.z), other: P.allowsOffsite(b[0], b[1]) };
  }, [pmaInfo.a.c, pmaInfo.b.c, HOME]);
  await comeIn();
  await cardAway();
  const after = await page.evaluate((a) => window.__game.permits.allowsOffsite(a[0], a[1]), pmaInfo.a.c);
  result('7 a PMA permit: off-site inside its polygon only; not outside, not another PMA, not on another trip', p3.permit && p3.permit.kind === 'pma' && pm.inside && pm.insideAt === pmaInfo.a.id && !pm.outside && !pm.other && !onOvernight && !after, { pma: pmaInfo.a.name, ...pm, onOvernight, afterTrip: after });

  // --- 6: an old save (a v3 core, a trip under way) --------------------------------------------------------------------------
  // a trip under way since this morning, written as the old core (no permit fields), the page reloaded; the outfitter's
  // document is frozen after the write so the page going away does not save over it
  const unpaid0 = await page.evaluate(() => window.__game.permits.fines.filter((f) => !f.paid).length);
  await pushOff();
  await page.evaluate(async () => {
    const g = window.__game, o = g.outfitter, kv = g.store;
    o.save();
    const doc = JSON.parse(kv.getItem('bwca-canoe-trip'));
    const c = doc.core; c.v = 3; delete c.permit; delete c.dayUse; delete c.grandfathered; delete c.fined;
    c.since = { year: g.day.year, doy: g.day.doy, hours: 8 };
    kv.setItem('bwca-canoe-trip', JSON.stringify(doc));
    await kv.flush();
    kv.freeze((k) => k === 'bwca-canoe-trip');
  });
  await load();
  await page.evaluate(() => window.__game.title.close());
  await until(page, () => { const g = window.__game; g.step(1 / 30, 5); return g.title.state === 'game' && !g.player.teleporting; }, null, 120000);
  await frames(30);
  await page.evaluate(() => { const g = window.__game, d = g.day, P = g.permits; if (d.hours < P.duskOf() + 0.3) d.advance(P.duskOf() + 0.3 - d.hours); g.energy.value = 1; });
  await frames(120);
  const old = await page.evaluate(() => { const g = window.__game, s = g.trip.state; return { active: g.trip.active, v: s.v, grandfathered: s.grandfathered, dayUse: s.dayUse, permit: s.permit, fines: g.permits.fines.filter((f) => !f.paid).length, hours: g.day.hours }; });
  result('6 an old save boots: the trip goes on, grandfathered, no fine', old.active && old.v === 4 && old.grandfathered === true && old.dayUse === false && old.fines === unpaid0, { ...old, unpaid0 });
} catch (e) {
  log('ERROR', e.stack || e.message);
  result('the run finished', false, { error: e.message });
} finally {
  writeFileSync(path.join(OUT, 'gl-a-results.json'), JSON.stringify(results, null, 1));
  const failed = results.filter((r) => !r.pass);
  log(`${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exitCode = failed.length ? 1 : 0;
}
