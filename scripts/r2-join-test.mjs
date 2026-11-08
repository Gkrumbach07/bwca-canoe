// Round 2 join (claude/r2-join): the seams between the four streams (tickets, the primitive areas' outlines, co-op
// parties, the start). One headless Chromium against a running Vite.
//   1 a ticket open: the keeper's first night out says the ticket comes first (the desk sells no night with one open)
//   2 the starter job taken with the ticket open: the Tasks page has both, the ticket's line first, the starter's notice
//     after it as a notice box
//   3 the desk with the ticket open: a PMA permit picked is still picked out on the maps (focusPma), Buy shut
//   4 the ticket paid: the next outfitter's first night has no ticket line; the desk sells again
//   5 a co-op guest (mirroring) holds no starter site of its own season (the room's parties hold the host's)
//   APP=http://localhost:5206 node scripts/r2-join-test.mjs
// Exit code 0 when every check passes.
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://localhost:5206';
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
const HOME = 25, OTHER = 38, START_DOY = 200;

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('pageerror', (e) => log('pageerror', e.message));
// walk a talk node down by the choices' texts (starter.talk's nodes)
const SAY = (node, ...picks) => { let n = node; for (const p of picks) { const c = n && n.choices && n.choices.find((q) => q.text.startsWith(p)); n = c ? c.go() : null; } return n; };
try {
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.starter && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  await page.evaluate(async ([home, doy]) => {
    const g = window.__game, t = g.title, ep = g.world.entryPoints.find((e) => e.ep === home);
    t.setPick('adventure');
    await t.newSeason(ep, { confirm: false, start: { year: 2026, doy } });
    if (g.onboarding && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(g.onboarding.home, false); } // (r3: the talk's gear and the loaned canoe first)
    { const ob = g.onboarding && g.onboarding.state; if (ob && ob.path) { ob.path.food = ob.path.leeches = ob.path.canoe = true; g.onboarding.write(); } } // (r3 join: past the tutorial's path, so no story step heads the Tasks list)
  }, [HOME, START_DOY]);
  await until(page, () => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 240000);
  log('season at', HOME);

  // --- 1 + 2 ---------------------------------------------------------------------------------------------------------
  const s1 = await page.evaluate(async ([home]) => {
    const g = window.__game, P = g.permits, S = g.starter;
    if (g.outfitter.open) g.outfitter.hide();
    P.fine('dayuse'); P.issue();
    const pr = g.profile; if (pr.money < 100) pr.earn(100 - pr.money, 'the test');
    const avail = S.available(home);
    const n = S.talk(home, () => null);
    const say = n ? n.say : null;
    const end = (() => { let m = n; for (const p of ['I’ll go there', 'I’ll do that']) { const c = m && m.choices && m.choices.find((q) => q.text.startsWith(p)); m = c ? c.go() : null; } return m; })();
    if (S.pending) await S.pending;
    const t = S.taskOf(home);
    return { avail, say, end: end && end.say, tickets: P.tickets().length, owed: P.owed(), task: t ? { id: t.id, kind: t.kind, status: t.status } : null };
  }, [HOME]);
  result('1 a ticket open: the keeper’s first night out says the ticket comes first', s1.avail && /ticket/.test(s1.say || '') && /no night/.test(s1.say || '') && s1.tickets === 1, s1);
  await page.evaluate(() => { const j = window.__game.journal; j.tab = 'tasks'; j.show('journal'); j.setSide('journal'); j.render(true); });
  await page.waitForTimeout(800);
  const s2 = await page.evaluate((id) => {
    const el = document.querySelector('#journal .side.j');
    const rows = [...el.querySelectorAll('.pp-todo')].map((r) => ({ cls: r.className, task: r.dataset.task, box: !!r.querySelector('.pp-box'), text: r.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) }));
    return { rows, hasTask: rows.some((r) => String(r.task) === String(id)) };
  }, s1.task && s1.task.id);
  await page.evaluate(() => window.__game.journal.close());
  result('2 the starter job and the ticket both on the Tasks page, the ticket first', s1.task && s1.task.kind === 'starter' && s2.rows.length >= 2 && /ticket/.test(s2.rows[0].cls) && s2.hasTask, { task: s1.task, rows: s2.rows });

  // --- 3: the desk -----------------------------------------------------------------------------------------------------
  const s3 = await page.evaluate((home) => {
    const g = window.__game, o = g.outfitter, D = g.permitDesk;
    o.show(o.visit ? o.visit.landing : o.landing(home), 'counter');
    D.act('permit-kind', 'pma');
    const el = document.querySelector('#outfitter .permitdesk'), buy = el && el.querySelector('[data-act="permit-buy"]');
    const day = el && el.querySelector('.pd-day:not(.off)'); if (day) D.act('permit-day', day.dataset.id);
    const el2 = document.querySelector('#outfitter .permitdesk'), buy2 = el2 && el2.querySelector('[data-act="permit-buy"]');
    const out = { focus: D.focusPma(), hud: typeof g.hud.pmaFocusFn === 'function' ? g.hud.pmaFocusFn() : null, buyDisabled: buy2 ? buy2.disabled : (buy ? buy.disabled : null), line: el2 ? (el2.querySelector('.pd-buy') || {}).textContent : null };
    return out;
  }, HOME);
  result('3 the desk with the ticket open: the PMA picked is picked out on the maps, Buy shut', !!s3.focus && s3.hud === s3.focus && s3.buyDisabled === true && /ticket/i.test(s3.line || ''), s3);

  // --- 4: paid ---------------------------------------------------------------------------------------------------------
  const s4 = await page.evaluate(([home, other]) => {
    const g = window.__game, P = g.permits, S = g.starter, D = g.permitDesk;
    const id = P.tickets()[0].id, r = P.payTicket(id);
    g.outfitter.render();
    const el = document.querySelector('#outfitter .permitdesk'), buy = el && el.querySelector('[data-act="permit-buy"]');
    const buyDisabled = buy ? buy.disabled : null;
    g.outfitter.hide();
    const avail = S.available(other), n = avail ? S.talk(other, () => null) : null;
    return { paid: r.ok, owed: P.owed(), buyDisabled, avail, say: n ? n.say : null };
  }, [HOME, OTHER]);
  result('4 paid: the desk sells again; the next first night has no ticket line', s4.paid && s4.owed === 0 && s4.buyDisabled === false && s4.avail && !!s4.say && !/ticket/.test(s4.say), s4);

  // --- 5: a guest's own holds ----------------------------------------------------------------------------------------
  const s5 = await page.evaluate(() => {
    const g = window.__game, S = g.starter, ct = g.coopTrip;
    const alone = S.holds().length;
    Object.defineProperty(ct, 'mirroring', { configurable: true, get: () => true });
    const asGuest = S.holds().length, mine = g.parties.mine().length;
    delete ct.mirroring;
    return { alone, asGuest, mine, back: S.holds().length };
  });
  result('5 a co-op guest holds no starter site of its own season', s5.alone >= 1 && s5.asGuest === 0 && s5.back === s5.alone, s5);
} catch (e) { log('ERROR', e.stack || e.message); result('the run', false, { error: e.message }); }
const passed = results.filter((r) => r.pass).length;
log(`${passed}/${results.length} passed`);
await browser.close();
process.exit(passed === results.length && results.length ? 0 : 1);
