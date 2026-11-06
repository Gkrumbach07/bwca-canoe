// Round 2, tickets (the owner, 2026-11-05: "There is no auto pay of the fine. Basically, when you come back, it gives you
// a ticket ... goes into your task list ... you can pay it if you have the money. If you have an open ticket, then it
// doesn't allow you to take out a multi-day or a overnight permit, even if you have the money"). permits.js tickets,
// journal.js's Tasks page, permit-desk.js, in one headless Chromium against a running Vite.
//   1 a day-use trip out after dark: the fine is given on the water, and no ticket yet (it is written when you come in)
//   2 back in: one open ticket, issued, the tally's line says a ticket in the book, nothing taken from the purse
//   3 the journal's Tasks page: the ticket heads the list as its own line (not a notice box), its slip on the left with
//     the date, the place, the reason and $20
//   4 short of the money: no Pay, the slip says "$20 — you have $9"; payTicket refuses
//   5 the desk, with $100 in hand: an overnight and a PMA permit refused ("An unpaid ticket. Pay it first."), Buy
//     disabled, the calendar still drawn; the first free permit is not granted while it is open
//   6 day use still allowed and free: a push-off with no permit is day use, nothing spent
//   7 never stuck: with $0 and the ticket open, a day-use trip on a board notice close by (a portage survey) pays ≥ $20
//     within a few trips; and every hosting outfitter's board has day-doable notices worth ≥ $20
//   8 Pay on the slip (a click): $20 spent, stamped PAID, gone from the list a moment later; a second ticket paid by a
//     right-click on its line; the desk sells again (overnight and PMA)
//   9 an old save (fines from before tickets: no issued, no id): the unpaid one is an open ticket after a reload, the paid
//     one stays paid
//
//   npx vite --port 5201 --strictPort
//   APP=http://localhost:5201 node scripts/r2-tickets-test.mjs [--shots docs/build/shots]
// Exit code 0 when every check passes.
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5201';
const SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more)); };
const shot = async (page, name) => { if (!SHOTS) return; try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); log('shot', name); } catch (e) { log('shot', name, e.message); } };
const until = (page, fn, a, timeout = 90000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
const HOME = 25, START_DOY = 258; // Moose Lake, mid-September: room on the calendar, so a refusal is the ticket's

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error' || /permits|ticket/.test(m.text())) log(m.type(), m.text().slice(0, 300)); });
const load = async () => {
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.permits && typeof window.__game.step === 'function', null, { timeout: 240000, polling: 500 });
};
const frames = (n = 30, dt = 1 / 30) => page.evaluate(([n, dt]) => { for (let k = 0; k < n; k += 300) window.__game.step(dt, Math.min(300, n - k)); }, [n, dt]);
const pushOff = async () => {
  await page.evaluate(async (home) => {
    const g = window.__game, o = g.outfitter, l = o.landing(home), w = g.world, lake = w.lakes[l.lake - 1];
    if (o.open) o.hide();
    if (g.journal.open) g.journal.close();
    o.port = l;
    const dx = lake.cx - l.x, dz = lake.cz - l.z, d = Math.hypot(dx, dz) || 1, r = Math.min(400, d);
    await g.player.teleport(l.x + (dx / d) * r, l.z + (dz / d) * r);
  }, HOME);
  await until(page, () => !window.__game.player.teleporting);
  await frames(20);
  return page.evaluate(() => { const t = window.__game.trip; return { active: t.active, permit: t.state.permit, dayUse: t.state.dayUse }; });
};
// in at the home landing, then ashore by it (afloat with the port still set, the next frame would push off again)
const comeIn = async () => {
  const out = await page.evaluate((home) => { const g = window.__game, o = g.outfitter; o.comeIn(o.landing(home)); o.port = null; return g.trip.state.outcome; }, HOME);
  await page.evaluate(async (home) => { const g = window.__game, l = g.outfitter.landing(home); g.outfitter.port = null; await g.player.teleport(l.x, l.z); }, HOME);
  await until(page, () => !window.__game.player.teleporting);
  await page.evaluate(() => { window.__game.outfitter.port = null; });
  return out;
};
const cardAway = async () => { await page.waitForTimeout(1800); await frames(10); await page.evaluate(() => { const g = window.__game; if (g.record && g.record.shown) g.record.close(); if (g.outfitter.open) g.outfitter.hide(); }); await frames(5); };
const setMoney = (n) => page.evaluate((n) => { const pr = window.__game.profile, m = pr.money; if (m > n) pr.spend(m - n, 'the test'); else if (m < n) pr.earn(n - m, 'the test'); return pr.money; }, n);
const openTasks = () => page.evaluate(() => { const j = window.__game.journal; j.tab = 'tasks'; j.show('journal'); j.setSide('journal'); j.render(true); });
const tasksPage = () => page.evaluate(() => {
  const el = document.querySelector('#journal .side.j');
  const row = el.querySelector('.pp-todo.ticket'), slip = el.querySelector('.fl-ticket'), pay = el.querySelector('[data-pay-ticket]'), short = el.querySelector('.pp-tkshort');
  const rows = [...el.querySelectorAll('.pp-todo')].map((r) => r.className);
  return { row: !!row, rowText: row ? row.textContent.replace(/\s+/g, ' ').trim() : null, first: rows[0] || null, boxInRow: !!(row && row.querySelector('.pp-box')), slip: !!slip, slipText: slip ? slip.textContent.replace(/\s+/g, ' ').trim() : null, paid: !!(slip && slip.classList.contains('paid')), pay: pay ? pay.textContent : null, short: short ? short.textContent : null };
});

try {
  await load();
  log('game loaded');
  await page.evaluate(async ([home, doy]) => {
    const g = window.__game, t = g.title, ep = g.world.entryPoints.find((e) => e.ep === home);
    t.setPick('adventure');
    await t.newSeason(ep, { confirm: false, start: { year: 2026, doy } });
    if (g.onboarding && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(g.onboarding.home, false); } // (r3: the talk's gear and the loaned canoe first)
  }, [HOME, START_DOY]);
  await until(page, () => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 180000);
  await page.evaluate(() => { const g = window.__game, o = g.outfitter; if (o.open) o.hide(); for (const p of g.permits.held()) g.permits.s.held.splice(g.permits.s.held.indexOf(p), 1); });

  // --- 1: day use, out after dark --------------------------------------------------------------------------------------------
  const p1 = await pushOff();
  await page.evaluate(() => { const g = window.__game, d = g.day, P = g.permits; d.advance(Math.max(0, P.duskOf() + 0.2 - d.hours)); g.energy.value = 1; });
  await frames(90);
  const s1 = await page.evaluate(() => { const g = window.__game, P = g.permits; return { fined: !!g.trip.state.fined, owed: P.owed(), tickets: P.tickets().length, fines: P.fines.map((f) => ({ issued: f.issued, place: f.place, why: f.why })) }; });
  result('1 day use out after dark: fined on the water, no ticket yet', p1.dayUse && s1.fined && s1.owed === 20 && s1.tickets === 0 && s1.fines.length === 1 && s1.fines[0].issued === false, { p1, ...s1 });

  // --- 2: back in: the ticket ---------------------------------------------------------------------------------------------------
  const m2a = await page.evaluate(() => window.__game.profile.money);
  await comeIn();
  await page.waitForTimeout(1800); await frames(10);
  const s2 = await page.evaluate(() => {
    const g = window.__game, P = g.permits, k = P.tickets();
    const line = document.querySelector('.tc-tally .tl-l.fine');
    return { tickets: k.length, issued: k[0] && k[0].issued, n: k[0] && k[0].n, place: k[0] && k[0].place, money: g.profile.money, tally: line ? line.textContent.replace(/\s+/g, ' ').trim() : null };
  });
  await shot(page, 'r2-tally-ticket');
  await cardAway();
  result('2 back in: one open ticket, $20, the tally says it is in the book, nothing taken', s2.tickets === 1 && s2.issued && s2.n === 20 && s2.money === m2a && /ticket/i.test(s2.tally || '') && /in your book/.test(s2.tally || '') && !/owed at a counter/.test(s2.tally || ''), { ...s2, before: m2a });

  // --- 3 + 4: the Tasks page, short of the money -------------------------------------------------------------------------------
  await setMoney(9);
  await openTasks(); await page.waitForTimeout(700);
  const s3 = await tasksPage();
  await shot(page, 'r2-journal-ticket-short');
  result('3 the Tasks page: the ticket heads the list as its own line, its slip with the date, the place, the reason and $20', s3.row && /ticket/.test(s3.first || '') && !s3.boxInRow && s3.slip && /Violation notice/i.test(s3.slipText) && /Date/.test(s3.slipText) && /Place/.test(s3.slipText) && /Out after dark on a day-use permit/.test(s3.slipText) && /\$20/.test(s3.slipText), s3);
  const r4 = await page.evaluate(() => { const P = window.__game.permits, id = P.tickets()[0].id; return { r: P.payTicket(id), money: window.__game.profile.money, open: P.tickets().length }; });
  result('4 short ($9): no Pay button, it says what is missing, and payTicket refuses', !s3.pay && /\$20 — you have \$9/.test(s3.short || '') && /\$9/.test(s3.rowText || '') && !r4.r.ok && r4.r.why === 'money' && r4.money === 9 && r4.open === 1, { s3: { pay: s3.pay, short: s3.short, row: s3.rowText }, r4 });
  await page.evaluate(() => window.__game.journal.close());

  // --- 5: the desk, with $100 -----------------------------------------------------------------------------------------------------
  await setMoney(100);
  const s5 = await page.evaluate((home) => {
    const g = window.__game, P = g.permits, o = g.outfitter;
    const a = P.buy({ ep: home, abs: P.today, at: home }), b = P.buy({ ep: home, abs: P.today + 2, at: home }), c = P.buy({ ep: home, abs: P.today, kind: 'pma', at: home });
    const gift = P.grant({ ep: home, abs: P.today, from: home, why: 'first' });
    o.show(o.visit ? o.visit.landing : o.landing(home), 'counter');
    const el = document.querySelector('#outfitter .permitdesk');
    const buy = el && el.querySelector('[data-act="permit-buy"]');
    return { a: a.why, b: b.why, c: c.why, words: a.words, money: g.profile.money, held: P.held().length, gift: gift, cal: el ? el.querySelectorAll('.pd-day').length : 0, buyDisabled: buy ? buy.disabled : null, line: el ? el.querySelector('.pd-buy')?.textContent.replace(/\s+/g, ' ').trim() : null, payHere: !!(el && el.querySelector('[data-act="permit-pay"]')), ticketRow: el ? el.querySelector('.pd-fine')?.textContent.replace(/\s+/g, ' ').trim() : null };
  }, HOME);
  await page.evaluate(() => { const el = document.querySelector('#outfitter .permitdesk'); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot(page, 'r2-desk-shut');
  result('5 the desk with $100: overnight (today, later) and PMA refused for the ticket, Buy disabled, one plain line, the calendar drawn, no free first permit', s5.a === 'ticket' && s5.b === 'ticket' && s5.c === 'ticket' && s5.words === 'An unpaid ticket. Pay it first.' && s5.money === 100 && s5.held === 0 && s5.gift === null && s5.cal === 28 && s5.buyDisabled === true && /An unpaid ticket\. Pay it first\./.test(s5.line || '') && s5.payHere, s5);
  await page.evaluate(() => window.__game.outfitter.hide());

  // --- 6: day use still allowed ------------------------------------------------------------------------------------------------
  await setMoney(0);
  await page.evaluate(() => { const d = window.__game.day; d.advance(((24 - d.hours) + 8) % 24); window.__game.energy.value = 1; }); // (the next morning: out after dark would be another ticket)
  const p6 = await pushOff();
  const m6 = await page.evaluate(() => window.__game.profile.money);
  result('6 day use still allowed with a ticket open, and free', p6.active && p6.dayUse === true && !p6.permit && m6 === 0, { ...p6, money: m6 });

  // --- 7: never stuck ----------------------------------------------------------------------------------------------------------
  // by play: from $0, day-use trips on notices close by (a portage survey off the board, else one written for it), in by dark
  const earned = [];
  for (let k = 0; k < 4; k++) {
    const m = await page.evaluate(() => window.__game.profile.money);
    if (m >= 20) break;
    if (!(await page.evaluate(() => window.__game.trip.active))) await pushOff();
    const job = await page.evaluate(async (home) => {
      const g = window.__game, T = g.tasks, d = g.day;
      if (!g.trip.active && (d.hours > 15 || d.hours < 7)) d.advance(((24 - d.hours) + 8) % 24); // a morning (never on the water: dark is a ticket)
      T.board(home); if (T.filling && T.filling.get(home)) await T.filling.get(home);
      let t = T.board(home).find((q) => q && q.status === 'offered' && q.kind === 'survey' && q.band === 'local');
      let from = 'board';
      if (!t) { t = await T.makeKind('survey', home, 'local'); from = 'written'; }
      if (!t || !T.take(t.id)) return { ok: false };
      return { ok: true, id: t.id, pay: t.pay, from, title: t.title, target: t.target, hours: +d.hours.toFixed(1) };
    }, HOME);
    if (!job.ok) { log('no survey notice'); break; }
    await page.evaluate(async (tg) => { await window.__game.player.teleport(tg.x, tg.z); }, job.target);
    await until(page, () => !window.__game.player.teleporting);
    await frames(30);
    const st = await page.evaluate((id) => { const t = window.__game.tasks.ads.get(id); return t ? t.status : 'gone'; }, job.id);
    await comeIn();
    await cardAway();
    const after = await page.evaluate(() => ({ money: window.__game.profile.money, fined: window.__game.permits.tickets().length }));
    earned.push({ ...job, status: st, money: after.money, tickets: after.fined });
  }
  const m7 = await page.evaluate(() => window.__game.profile.money);
  result('7 never stuck, by play: from $0 with the ticket open, day-use survey trips close by pay ≥ $20, no new ticket', m7 >= 20 && earned.every((e) => e.tickets === 1), { money: m7, trips: earned.map((e) => ({ pay: e.pay, from: e.from, status: e.status, money: e.money, at: e.hours })) });
  const boards = await page.evaluate(async () => {
    const g = window.__game, T = g.tasks, out = {};
    for (const l of g.outfitter.landings) {
      T.board(l.ep); if (T.filling && T.filling.get(l.ep)) await T.filling.get(l.ep);
      const b = T.board(l.ep).filter(Boolean), day = b.filter((t) => t.band === 'local' || t.band === 'medium');
      out[l.ep] = { n: b.length, day: day.length, pay: day.reduce((a, t) => a + (t.pay || 0), 0), kinds: day.map((t) => `${t.kind}:${t.band}:$${t.pay}`) };
    }
    return out;
  });
  const poor = Object.entries(boards).filter(([, b]) => b.pay < 20);
  result('7′ every hosting outfitter\'s board: day-doable notices (close by, a day trip) worth ≥ $20', Object.keys(boards).length >= 14 && !poor.length, { n: Object.keys(boards).length, poor, boards });

  // --- 8: pay from the slip, and from the line --------------------------------------------------------------------------------
  await setMoney(45);
  await openTasks(); await page.waitForTimeout(600);
  const before8 = await tasksPage();
  await page.click('#journal [data-pay-ticket]');
  await page.waitForTimeout(250);
  const mid8 = await tasksPage();
  await shot(page, 'r2-journal-paid-stamp');
  await page.waitForTimeout(1800); await frames(3);
  const after8 = await tasksPage();
  const s8 = await page.evaluate(() => { const g = window.__game, P = g.permits; return { money: g.profile.money, open: P.tickets().length, owed: P.owed(), paid: P.fines.filter((f) => f.paid).length }; });
  result('8 Pay on the slip: $20 spent, stamped PAID, then gone from the list', before8.pay === 'Pay $20' && mid8.paid && s8.money === 25 && s8.open === 0 && s8.owed === 0 && !after8.row, { before: before8.pay, stamped: mid8.paid, after: after8.row, ...s8 });
  // a second ticket (a fine given and written up), paid by a right-click on its line
  await page.evaluate(() => { const P = window.__game.permits; P.fine('dayuse'); P.issue(); window.__game.journal.render(true); });
  await page.waitForTimeout(300);
  const has2 = await tasksPage();
  await page.click('#journal .pp-todo.ticket', { button: 'right' });
  await page.waitForTimeout(1900); await frames(3);
  const s8b = await page.evaluate(() => { const g = window.__game, P = g.permits; return { money: g.profile.money, open: P.tickets().length, row: !!document.querySelector('#journal .pp-todo.ticket') }; });
  result('8′ a second ticket paid by a right-click on its line', has2.row && s8b.money === 5 && s8b.open === 0 && !s8b.row, { had: has2.row, ...s8b });
  await page.evaluate(() => window.__game.journal.close());
  await setMoney(40);
  const s8c = await page.evaluate((home) => {
    const g = window.__game, P = g.permits, D = g.permitDesk;
    const ep = D.epsFor(home).find((e) => P.available(e, P.today).left > 0);
    const a = P.buy({ ep, abs: P.today, at: home });
    P.s.held = P.s.held.filter((p) => !a.permit || p.id !== a.permit.id);
    const c = P.buy({ ep, abs: P.today, kind: 'pma', at: home });
    return { ep, a: a.ok || a.why, c: c.ok || c.why };
  }, HOME);
  result('8″ paid up, the desk sells again: overnight and PMA', s8c.a === true && s8c.c === true, s8c);

  // --- 9: an old save -------------------------------------------------------------------------------------------------------------
  await page.evaluate(async () => {
    const g = window.__game, P = g.permits;
    P.s.held = [];
    P.s.fines = [{ n: 20, why: 'dayuse', abs: P.today - 3, paid: false, trip: 'T-old1' }, { n: 20, why: 'dayuse', abs: P.today - 9, paid: true, paidOn: P.today - 8, trip: 'T-old2' }];
    P.write();
    await g.store.flush();
  });
  await load();
  await page.evaluate(() => window.__game.title.close());
  await until(page, () => { const g = window.__game; g.step(1 / 30, 5); return g.title.state === 'game' && !g.player.teleporting; }, null, 120000);
  await frames(10);
  const s9 = await page.evaluate(() => { const P = window.__game.permits; return { tickets: P.tickets().map((f) => ({ id: f.id, n: f.n, issued: f.issued })), fines: P.fines.map((f) => ({ id: f.id, paid: f.paid, issued: f.issued })), refusal: P.refusal({ ep: 25, abs: P.today }) }; });
  await openTasks(); await page.waitForTimeout(600);
  const j9 = await tasksPage();
  result('9 an old save: the unpaid fine is an open ticket (in the book, the desk shut), the paid one stays paid', s9.tickets.length === 1 && s9.tickets[0].id && s9.fines.filter((f) => f.paid).length === 1 && s9.fines.every((f) => f.issued === true) && s9.refusal === 'ticket' && j9.row, { ...s9, row: j9.row });
} catch (e) {
  log('ERROR', e.stack || e.message);
  result('the run finished', false, { error: e.message });
} finally {
  const failed = results.filter((r) => !r.pass);
  log(`${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exitCode = failed.length ? 1 : 0;
}
