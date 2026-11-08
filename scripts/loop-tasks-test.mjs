// Loop tasks (2026-11-08): the board's kinds as the owner signed them off (docs/plans/campaigns.md §1) and the late
// season (docs/build/campaign-design.md Part 3, owner call 3), run headless on one page.
//   1 the table: every kept kind registered with its deadline, fit and band; the cut kinds absent
//   2 each kept kind written in its window at a fitting pin: its pay in its band, its deadline, a journal line (the
//     guide's next), and an exact place to point at where it has one; a windowed kind is out of season outside it
//   3 boards written through a season (May, July, September, October): no day kind on a far pin, no trip kind on a
//     close-by one, every pay in its band, every notice in its window
//   4 from 1 October: no price, no quota ("free"), the desk's "Fill one out", a push-off fills one out at the box
//   5 "Look at next year's permits": tucked in July, forward in September and October
//   6 ice catches a trip: one line, "Frozen in" in the journal with its button; short of money it says so; the rescue
//     paid ($75), the trip brought in, logged 'ice'
//   7 the turn: next year's 15 June picked at the desk (two presses), the winter card, up at seven on that day next
//     year, rested; 'season:close' and 'year:open' heard once each; the season and the money kept
//
//   APP=http://localhost:5415 node scripts/loop-tasks-test.mjs [--shots]
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://localhost:5415';
const SHOTS = process.argv.includes('--shots');
const OUT = path.resolve('docs/build/shots');
if (SHOTS) mkdirSync(OUT, { recursive: true });
const HOME = 25;

function findPw() {
  if (process.env.PW) return process.env.PW;
  const base = path.join(homedir(), '.npm/_npx');
  for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; }
  return 'playwright-core';
}
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(homedir(), 'Library/Caches/ms-playwright');
  const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; }
  return undefined;
}
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1200)); };
const errors = [];

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || /seasonTurn|permits|the board/.test(m.text())) log(m.type(), m.text().slice(0, 300)); });
  const frames = (n = 30, dt = 1 / 30) => page.evaluate(([n, dt]) => { for (let k = 0; k < n; k += 300) window.__game.step(dt, Math.min(300, n - k)); }, [n, dt]);
  const until = (fn, arg = null, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 250 });
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(OUT, `loop-${name}.png`) }); };
  await page.goto(APP, { timeout: 180000 });
  await until(() => window.__game && window.__game.title && window.__game.tasks && window.__game.permits && typeof window.__game.step === 'function', null, 240000);
  log('game loaded');
  await page.evaluate(async (home) => {
    const g = window.__game, t = g.title, ep = g.world.entryPoints.find((e) => e.ep === home);
    t.setPick('adventure');
    await t.newSeason(ep, { confirm: false, start: { year: 2026, doy: 130 } });
    if (g.onboarding && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(g.onboarding.home, false); }
  }, HOME);
  await until(() => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 180000);
  await frames(60);
  await page.evaluate(() => { const g = window.__game; g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide(); if (g.saver) g.saver.enabled = false; window.__setDoy = (doy, hours = 10) => { const d = g.day; d.year = 2026; d.doy = doy; d.hours = hours; d.advance(0); }; });

  // --- 1: the table ------------------------------------------------------------------------------------------------------
  const KEPT = ['fish', 'lunch', 'item', 'survey', 'deadfall', 'litter', 'secchi', 'loons', 'report', 'photo', 'berries', 'firewood', 'fetch', 'npc', 'creel', 'campsite', 'beaver', 'iceout', 'colour', 'lastcheck', 'pma'];
  const DAYS = { fish: 3, lunch: 3, item: 7, survey: 10, deadfall: 7, litter: 7, secchi: 10, loons: 7, report: 14, photo: 14, berries: 5, firewood: 3, fetch: 7, npc: 7, creel: 10, campsite: 10, beaver: 10, iceout: 5, colour: 10, lastcheck: 7, pma: 14 };
  const r1 = await page.evaluate(([kept, days]) => {
    const T = window.__game.tasks, K = T.kinds, tab = T.boardTable();
    const missing = kept.filter((k) => !K[k] || !tab[k]);
    const wrongDays = kept.filter((k) => T.daysFor({ kind: k }) !== days[k]);
    const cut = Object.keys(K).filter((k) => /canoe|rental|odd|latrine|invasive|smoke|bird/i.test(k));
    const extra = Object.keys(K).filter((k) => !kept.includes(k) && k !== 'starter');
    const fitW = kept.filter((k) => (tab[k].fit === 'day' && K[k].weight.far > 0) || (tab[k].fit === 'trip' && K[k].weight.local > 0));
    return { missing, wrongDays, cut, extra, fitW, n: kept.length };
  }, [KEPT, DAYS]);
  result('1 the table: 21 kept kinds, each its deadline and fit; no cut kind', !r1.missing.length && !r1.wrongDays.length && !r1.cut.length && !r1.extra.length && !r1.fitW.length, r1);

  // --- 2: each kind in its window ----------------------------------------------------------------------------------------
  // [kind, doy (in its window), out (a day out of it, or null)]; iceout's from the landing's own ice-out
  const PLAN = [['fish', 191], ['lunch', 191], ['item', 191], ['survey', 191], ['deadfall', 191], ['litter', 191], ['secchi', 191], ['loons', 191, 130],
    ['report', 191], ['photo', 191], ['berries', 205, 130], ['firewood', 191], ['fetch', 191], ['creel', 191, 300], ['campsite', 191],
    ['beaver', 140, 205], ['iceout', 'ice', 205], ['colour', 262, 191], ['lastcheck', 290, 191], ['pma', 191, 130]];
  const made = [];
  for (const [kind, doy0, out] of PLAN.sort((a, b) => (a[1] === 'ice' ? 125 : a[1]) - (b[1] === 'ice' ? 125 : b[1]))) {
    const r = await page.evaluate(async ([kind, doy0, out]) => {
      const g = window.__game, T = g.tasks, tab = T.boardTable()[kind], [lo, hi] = T.bandRange(tab.band);
      const bands = ['local', 'medium', 'far'].filter((b) => !(tab.fit === 'day' && b === 'far') && !(tab.fit === 'trip' && b === 'local'));
      const eps = [25, 31, 38, 64, 16, 1, 12, 49, 67, 6];
      let t = null, ep = null, doy = doy0;
      for (const e of eps) {
        if (doy0 === 'ice') { const L = T.landing(e), ic = g.world.facts && g.world.facts.iceOf ? g.world.facts.iceOf(L.lake) : null; doy = Math.round((ic && ic.out) || 120) + 4; }
        window.__setDoy(doy);
        for (const b of bands) { try { t = await T.makeKind(kind, e, b); } catch (err) { t = null; } if (t) break; }
        if (t) { ep = e; break; }
      }
      if (!t) return { kind, made: false, doy };
      const k = tab.per ? Math.max(1, t.need || 1) : 1, inBand = t.pay >= lo * k && t.pay <= hi * k;
      const inWin = T.inWindow(kind, doy, ep), outWin = out == null ? null : T.inWindow(kind, out, ep);
      // taken: its deadline, its journal line, its place
      T.take(t.id);
      const G = g.guide; G.sync();
      const e = G.get(`task:${t.id}`);
      const left = T.daysLeft(t);
      const res = { kind, made: true, ep, doy, band: t.band, pay: t.pay, rawPay: T.kinds[kind].rawPay ? T.kinds[kind].rawPay(t) : null, inBand, inWin, outWin, left, entry: !!e, next: e ? e.next : null, target: e && e.target ? e.target.key : null };
      T.drop(t.id); T.ads.delete(t.id);
      return res;
    }, [kind, doy0, out]);
    made.push(r);
    const exactWanted = ['beaver', 'lastcheck', 'pma', 'secchi', 'colour', 'item', 'survey', 'deadfall', 'litter', 'campsite'].includes(kind);
    const ok = r.made && r.inBand && r.inWin && (r.outWin === null || r.outWin === false) && r.left === DAYS[kind] && r.entry && (!!r.next || kind === 'photo') && (!exactWanted || !!r.target);
    result(`2 ${kind}: written in its window, pay in band, its deadline, a journal line${exactWanted ? ', a place' : ''}`, ok, r);
  }

  // --- 3: boards through a season -----------------------------------------------------------------------------------------
  const r3 = await page.evaluate(async () => {
    const g = window.__game, T = g.tasks, tab = T.boardTable(), bad = [], seen = {};
    for (const doy of [135, 191, 262, 290]) {
      window.__setDoy(doy);
      for (const ep of [25, 31, 38, 64, 16, 1]) {
        for (const [id, t] of [...T.ads]) if (t.status === 'offered') T.ads.delete(id);
        delete T.boards[ep];
        T.board(ep); await T.write(ep);
        for (const t of T.board(ep)) {
          if (!t) continue;
          const row = tab[t.kind], r = row ? T.bandRange(row.band) : null, k = row && row.per ? Math.max(1, t.need || 1) : 1;
          seen[t.kind] = (seen[t.kind] || 0) + 1;
          if (!row) bad.push({ doy, ep, kind: t.kind, why: 'not in the table' });
          else if (row.fit === 'day' && t.band === 'far') bad.push({ doy, ep, kind: t.kind, why: 'day on far' });
          else if (row.fit === 'trip' && t.band === 'local') bad.push({ doy, ep, kind: t.kind, why: 'trip close by' });
          else if (t.pay < r[0] * k || t.pay > r[1] * k) bad.push({ doy, ep, kind: t.kind, pay: t.pay, why: 'pay' });
          else if (!T.inWindow(t.kind, doy, ep)) bad.push({ doy, ep, kind: t.kind, why: 'window' });
        }
      }
    }
    return { bad, seen };
  });
  result('3 boards in May, July, September and October: fits, bands and windows', !r3.bad.length && Object.keys(r3.seen).length >= 10, r3);

  // --- 4: the self-issued season -------------------------------------------------------------------------------------------
  const r4 = await page.evaluate(() => {
    const g = window.__game, P = g.permits, abs0 = (doy) => Math.round(Date.UTC(2026, 0, doy) / 86400000);
    window.__setDoy(270);
    const sep27 = { price: P.price('overnight', abs0(270)), a: P.available(25, abs0(270)) };
    const oct3 = { price: P.price('overnight', abs0(276)), pma: P.price('pma', abs0(276)), a: P.available(25, abs0(276)) };
    return { sep27, oct3 };
  });
  result('4a September 27 is sold ($6, the quota); October 3 is free, self-issued, no quota', r4.sep27.price === 6 && !r4.sep27.a.self && r4.oct3.price === 0 && r4.oct3.pma === 0 && r4.oct3.a.self && r4.oct3.a.left > 20, r4);
  await page.evaluate(() => { window.__setDoy(283); const o = window.__game.outfitter; o.show(o.visit.landing, 'counter'); });
  await frames(5);
  const desk4 = await page.evaluate(() => {
    const el = document.querySelector('#outfitter .permitdesk');
    return { there: !!el, self: !!(el && el.querySelector('.pd-self')), free: el ? el.querySelectorAll('.pd-day.free').length : 0, buy: el ? el.querySelector('[data-act="permit-buy"]')?.textContent : null, fwd: !!(el && el.querySelector('.pd-next.fwd')) };
  });
  await page.evaluate(() => { const el = document.querySelector('#outfitter .permitdesk'); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot('desk-october');
  result('4b the desk in October: the self-issued line, free days, "Fill one out", next year forward', desk4.there && desk4.self && desk4.free > 10 && /Fill one out/.test(desk4.buy || '') && desk4.fwd, desk4);
  // a push-off with no permit fills one out at the box
  const r4c = await page.evaluate(async (home) => {
    const g = window.__game, o = g.outfitter, P = g.permits, l = o.landing(home), w = g.world, lake = w.lakes[l.lake - 1];
    if (o.open) o.hide();
    P.s.held = P.s.held.filter((p) => p.abs !== P.today);
    o.port = l;
    const dx = lake.cx - l.x, dz = lake.cz - l.z, d = Math.hypot(dx, dz) || 1, r = Math.min(400, d);
    await g.player.teleport(l.x + (dx / d) * r, l.z + (dz / d) * r);
    return true;
  }, HOME);
  await until(() => !window.__game.player.teleporting);
  await frames(30);
  const p4 = await page.evaluate(() => { const g = window.__game, t = g.trip, P = g.permits, u = P.s.used[P.s.used.length - 1]; return { active: t.active, dayUse: t.state.dayUse, permit: t.state.permit, used: u ? { why: u.why, price: u.price, abs: u.abs } : null, today: P.today }; });
  result('4c a push-off in October with no permit: one filled out at the box, free; not day use', p4.active && !p4.dayUse && p4.permit && p4.used && p4.used.why === 'self' && p4.used.price === 0, p4);

  // --- 6: ice catches the trip -----------------------------------------------------------------------------------------------
  // the landing's lake iced (its own ice-in, a few days on); short of money first, then the rescue
  const r6a = await page.evaluate(() => {
    const g = window.__game, L = g.outfitter.landing(25), ic = g.world.facts && g.world.facts.iceOf ? g.world.facts.iceOf(L.lake) : null, inn = Math.round((ic && ic.in) || 329);
    g.trip.state.since = { year: 2026, doy: Math.min(364, inn + 3), hours: 9 };
    window.__setDoy(Math.min(364, inn + 3), 11);
    g.energy.value = 1; if (g.energy.needs) { g.energy.needs.food = 1; g.energy.needs.water = 1; g.energy.needs.warmth = 1; }
    g.profile.s.money = 10;
    window.__turnEv = []; g.seasonTurn.on('*', (e, k) => window.__turnEv.push(k));
    window.__notes = []; const n = g.hud.note.bind(g.hud); g.hud.note = (t, s) => { window.__notes.push(t); return n(t, s); };
    return { inn, ice: g.day.season.ice };
  });
  await frames(120);
  const r6 = await page.evaluate(() => {
    const g = window.__game, G = g.guide; G.sync();
    const e = G.get('late:ice');
    return { ice: g.day.season.ice, iced: g.trip.state.iced, active: g.trip.active, entry: e ? { title: e.title, next: e.next, action: e.action ? { label: e.action.label, short: e.action.short } : null } : null, notes: window.__notes.filter((t) => /Ice is making/.test(t)), ev: window.__turnEv.slice() };
  });
  result('6a ice catches the trip: one line, "Frozen in" in the journal, the button short of money', r6.active && !!r6.iced && r6.notes.length === 1 && r6.entry && /Frozen in/.test(r6.entry.title) && r6.entry.action && !!r6.entry.action.short && r6.ev.includes('iced'), { ...r6, r6a });
  // the journal's page for it
  await page.evaluate(() => { const g = window.__game; g.journal.showTask('late:ice'); });
  await frames(5);
  const j6 = await page.evaluate(() => { const el = window.__game.journal.jEl; return { short: !!el.querySelector('.pp-tkshort'), text: (el.querySelector('.pp-quest') || {}).textContent || '' }; });
  await shot('frozen-in');
  const refused = await page.evaluate(() => window.__game.seasonTurn.rescue());
  await page.evaluate(() => { const g = window.__game; g.profile.s.money = 120; g.guide.sync(); });
  await frames(5);
  const j6b = await page.evaluate(() => { const el = window.__game.journal.jEl; window.__game.journal.render(true); const b = el.querySelector('[data-guide-act="late:ice"]'); return { button: b ? b.textContent : null }; });
  result('6b the journal: short of money it says so; with it, "Send for a rescue · $75"', j6.short && !refused.ok && refused.why === 'money' && /Send for a rescue · \$75/.test(j6b.button || ''), { j6, refused, j6b });
  const m0 = await page.evaluate(() => window.__game.profile.money);
  await page.evaluate(() => { const b = document.querySelector('[data-guide-act="late:ice"]'); if (b) b.click(); else window.__game.seasonTurn.rescue(); });
  await until(() => window.__game.veil.active || !window.__game.trip.active, null, 20000);
  await until(() => !window.__game.veil.active && !window.__game.trip.active, null, 90000);
  await frames(10);
  const r6c = await page.evaluate(() => { const g = window.__game, b = g.trip.book.trips, last = b[b.length - 1]; return { money: g.profile.money, active: g.trip.active, k: last && last.k, why: last && last.why, ev: window.__turnEv.slice() }; });
  result('6c the rescue: $75 paid, the trip brought in, caught by the ice', !r6c.active && m0 - r6c.money === 75 && r6c.k === 'evacuated' && /ice/.test(r6c.why || '') && r6c.ev.includes('rescue'), { m0, ...r6c });
  await page.waitForTimeout(1800); await frames(10);
  await page.evaluate(() => { const g = window.__game; if (g.record && g.record.shown) g.record.close(); if (g.journal.open) g.journal.close(); if (g.outfitter.open) g.outfitter.hide(); });

  // --- 5: the tucked line and when it comes forward -------------------------------------------------------------------------
  const r5 = await page.evaluate(() => {
    const g = window.__game, D = g.permitDesk, at = 25, out = {};
    for (const [name, doy] of [['jul', 191], ['aug20', 232], ['sep10', 253], ['oct10', 283]]) {
      window.__setDoy(doy);
      const h = D.section(at);
      out[name] = { tucked: /pd-next tucked/.test(h), fwd: /pd-next fwd/.test(h) };
    }
    return out;
  });
  result('5 next year\'s permits: tucked in July and August, forward from September', r5.jul.tucked && !r5.jul.fwd && r5.aug20.tucked && r5.sep10.fwd && r5.oct10.fwd, r5);

  // --- 7: the turn -------------------------------------------------------------------------------------------------------------
  await page.evaluate(() => { window.__setDoy(293, 10); const g = window.__game, o = g.outfitter; window.__turnEv = []; window.__seasonId = g.profile.seasonId; o.show(o.visit ? o.visit.landing : o.landing(25), 'counter'); });
  await frames(5);
  const r7a = await page.evaluate(() => {
    const g = window.__game, o = g.outfitter, june15 = Math.round(Date.UTC(2027, 5, 15) / 86400000);
    o.act('permit-next');
    o.act('permit-nmonth', '6');
    o.act('permit-nday', String(june15));
    const el = document.querySelector('#outfitter .permitdesk');
    const first = { head: !!(el && el.querySelector('.pd-next.head')), cells: el ? el.querySelectorAll('.pd-day').length : 0, label: el ? el.querySelector('[data-act="permit-nbuy"]')?.textContent : null };
    o.act('permit-nbuy');
    const el2 = document.querySelector('#outfitter .permitdesk');
    return { june15, first, sure: el2 ? el2.querySelector('[data-act="permit-nbuy"]')?.textContent : null, money: g.profile.money };
  });
  await page.evaluate(() => { const el = document.querySelector('#outfitter .permitdesk'); if (el) el.scrollIntoView({ block: 'start' }); });
  await shot('next-year');
  result('7a next year\'s June at the desk: 30 days, "Choose · $6", then "Yes: end this season"', r7a.first.head && r7a.first.cells === 30 && /Choose · \$6/.test(r7a.first.label || '') && /end this season/.test(r7a.sure || ''), r7a);
  await page.evaluate(() => window.__game.outfitter.act('permit-nbuy'));
  await until(() => window.__game.veil.active, null, 20000).catch(() => null);
  await shot('winter-card');
  await until(() => !window.__game.veil.active, null, 90000);
  await frames(5);
  const r7 = await page.evaluate((june15) => {
    const g = window.__game, d = g.day, P = g.permits;
    return { year: d.year, doy: d.doy, today: P.today, hours: +d.hours.toFixed(2), energy: g.energy.value, held: P.held().map((p) => p.abs), ev: window.__turnEv.slice(), season: g.profile.seasonId === window.__seasonId, money: g.profile.money, june15 };
  }, r7a.june15);
  const evN = (k) => r7.ev.filter((e) => e === k).length;
  result('7b the turn: up at seven on 15 June 2027, rested, the permit held; season:close and year:open once each; the same season', r7.year === 2027 && r7.today === r7a.june15 && Math.abs(r7.hours - 7) < 0.1 && r7.energy >= 0.99 && r7.held.includes(r7a.june15) && evN('season:close') === 1 && evN('year:open') === 1 && r7.season && r7a.money - r7.money === 6, r7);
  await frames(30);
  const r7c = await page.evaluate(async () => { const g = window.__game, T = g.tasks, doy = g.day.doy; T.board(25); await T.write(25); return { board: T.board(25).filter(Boolean).map((t) => ({ kind: t.kind, inWin: T.inWindow(t.kind, doy, 25) })) }; });
  result('7c after the turn the board is this June\'s (every notice in its window)', r7c.board.length >= 3 && r7c.board.every((t) => t.inWin), r7c);
  await shot('june-2027');
} catch (e) {
  log('ERROR', e && e.stack ? e.stack : e);
  results.push({ name: 'run', pass: false });
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
log(`${results.length - failed.length}/${results.length} passed${errors.length ? `, ${errors.length} page errors` : ''}`);
for (const f of failed) log('  FAIL', f.name);
process.exit(failed.length ? 1 : 0);
