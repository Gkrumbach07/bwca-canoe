// Round 4 loop fixes, stream A (claude/r4-loopfix): the adversarial checker's D1, D4 and D6 on claude/loop-r4, each
// PASS or FAIL (Quetico as plain out of bounds and the board's notices past the edge are edge-test step 6 and
// loop-r4-test P4):
//   D1a the checker's case: at the Moose Lake desk (EP 25) on 12 October, next year's permits, EP 29, 25 April: the day
//       is shut on the calendar (Moose Lake still iced: you would wake to it); Choose twice and a straight buy take no
//       money, hold no permit, and the year stays
//   D1b next year's months start no earlier than the later ice-out of the two lakes; every open day in them is one the
//       turn takes
//   D1c a sale whose turn does not happen after all is undone: the permit off the held list, the $6 back
//   D1d a permit held in another year says the year on the desk's held line
//   D1e the real turn still works: EP 29, 15 June next year, two presses: $6, the winter card, up at seven that day
//   D4  an old save's done notice of a kind cut from the boards stays on the list (done, cut), the journal and the guide
//       say it is no longer posted but still paid, and between trips it is paid with a line saying so
//   D6  at EP 84's and EP 75's trailhead lots: not pinned (a walk north goes), and walking south to the world's own end the
//       stop says "Past here is off your maps", never "turn back"
//   E   no page errors
//
//   APP=http://localhost:5501 node scripts/r4-loopfix-test.mjs [--shots <dir>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5501';
const SHOTS = path.resolve(arg('shots', path.join(tmpdir(), 'r4-loopfix')));
mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1800)); };
const HOME = 25;

const HELPERS = () => {
  const g = window.__game, H = window.__lf = { notes: [] };
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 60000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.setDoy = (doy, hours = 10, year = g.day.year) => { const d = g.day; d.year = year; d.doy = doy; d.hours = hours; d.advance(0); };
  H.look = (yaw, pitch = 0.05) => { const ch = g.chase; if (ch) { ch.viewYaw = yaw; ch.forwardYaw = yaw; ch.viewPitch = pitch; if (ch.snap) ch.snap(); } };
  H.closeAll = () => { const o = g.outfitter; if (o.open) o.hide(); if (g.journal && g.journal.open) g.journal.close(); };
  H.tp = async (x, z) => { H.closeAll(); const ok = await g.player.teleport(x, z); await H.settle(); return ok; };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround(); H.look(heading);
  };
  H.toDoor = async (ep) => { const o = g.outfitter, l = o.landing(ep); await H.tp(l.x, l.z); H.step(20); const Y = o.layout(ep); if (Y && Y.door) { H.standAt(Y.door.x, Y.door.z); H.step(20); } return Y; };
  H.absOf = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);
  H.desk = () => document.querySelector('#outfitter .permitdesk');
  const note = g.hud.note.bind(g.hud);
  g.hud.note = (t, ...a) => { H.notes.push(String(t)); return note(t, ...a); };
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  const ev = (fn, a) => page.evaluate(fn, a);
  const until = (fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
  const shot = async (name) => { const f = path.join(SHOTS, `r4-loopfix-${name}.png`); await page.screenshot({ path: f }); log('shot', f); return f; };

  await page.goto(APP, { timeout: 180000 });
  await until(() => { const g = window.__game; return g && g.title && g.edge && g.tasks && g.permits && g.seasonTurn && g.permitDesk && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, 300000);
  await ev(HELPERS);
  await ev(async (home) => {
    const g = window.__game, t = g.title, ep = g.world.entryPoints.find((e) => e.ep === home);
    t.setPick('adventure');
    await t.newSeason(ep, { confirm: false, start: { year: 2026, doy: 140 } });
    if (g.onboarding && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(g.onboarding.home, false); }
  }, HOME);
  await until(() => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 180000);
  await ev(() => { const g = window.__game; g.outfitter.arrival = null; window.__lf.closeAll(); if (g.saver) g.saver.enabled = false; g.profile.s.money = 400; window.__lf.step(60); });

  // ---- D1 at the Moose Lake desk on 12 October ---------------------------------------------------------------------------
  await ev(async (home) => {
    const g = window.__game, H = window.__lf, o = g.outfitter;
    H.setDoy(284, 10, 2026); H.step(5); // 12 October 2026 (doy 284 is the 285th day)
    g.permits.payFines();
    await H.toDoor(home); H.step(20); o.show(o.landing(home), 'counter'); H.step(5);
  }, HOME);
  const d1a = await ev(async (home) => {
    const g = window.__game, H = window.__lf, o = g.outfitter, P = g.permits, D = g.permitDesk;
    const apr25 = H.absOf(2027, 4, 25), m0 = g.profile.money, held0 = P.held().length, year0 = g.day.year;
    const iced = { moose: P.iced(home, apr25), ep29: P.iced(29, apr25) };
    o.act('permit-next'); o.act('permit-nep', '29');
    const months = [...H.desk().querySelectorAll('[data-act="permit-nmonth"]')].map((b) => Number(b.dataset.id));
    // April shown or not: the day itself, if its month is on offer, must be shut
    let cell = null;
    if (months.includes(4)) { o.act('permit-nmonth', '4'); const c = H.desk().querySelector(`[data-act="permit-nday"][data-id="${apr25}"]`); cell = c ? { disabled: c.disabled, text: c.textContent } : 'none'; }
    // pushed anyway, as the checker did: the day picked, Choose twice
    D.next.abs = apr25; D.next.month = 4; D.next.sure = false; o.render && o.render();
    o.act('permit-nbuy'); o.act('permit-nbuy');
    H.step(5);
    const viaDesk = { money: g.profile.money, held: P.held().length, year: g.day.year, note: D.note, turning: g.seasonTurn.turning };
    const r = P.buy({ ep: 29, abs: apr25, kind: 'overnight', at: home });
    await H.wait(200); H.step(3);
    return { iced, months, cell, m0, held0, year0, viaDesk, buy: { ok: r.ok, why: r.why, words: r.words }, after: { money: g.profile.money, held: P.held().length, year: g.day.year, veil: g.veil.active } };
  }, HOME);
  await shot('d1a-april');
  result('D1a EP 29 on 25 April from the Moose Lake desk: the day shut, Choose twice and a buy take nothing, no permit, the year stays', d1a.iced.moose
    && (d1a.cell === null || d1a.cell === 'none' || d1a.cell.disabled) && d1a.viaDesk.money === d1a.m0 && d1a.viaDesk.held === d1a.held0 && d1a.viaDesk.year === 2026
    && !d1a.buy.ok && ['wake', 'closed'].includes(d1a.buy.why) && d1a.after.money === d1a.m0 && d1a.after.held === d1a.held0 && d1a.after.year === 2026 && !d1a.after.veil, d1a);

  const d1b = await ev((home) => {
    const g = window.__game, P = g.permits, today = P.today, a = P.yearOf(home, today), b = P.yearOf(29, today);
    const first = Math.max(a.iceOut, b.iceOut), bad = [];
    const D = g.permitDesk, months = [...document.querySelectorAll('#outfitter .permitdesk [data-act="permit-nmonth"]')].map((x) => Number(x.dataset.id));
    // every open day of every month offered: the turn would take it (both lakes open)
    const o = g.outfitter; let open = 0;
    for (const m of months) {
      o.act('permit-nmonth', String(m));
      for (const c of document.querySelectorAll('#outfitter .permitdesk [data-act="permit-nday"]:not([disabled])')) {
        const abs = Number(c.dataset.id); open++;
        if (P.iced(home, abs) || P.iced(29, abs) || P.refusal({ ep: 29, abs, at: home })) bad.push(abs);
      }
    }
    const mFirst = new Date(first * 86400000).getUTCMonth() + 1;
    return { months, mFirst, firstOk: months[0] >= mFirst, open, bad: bad.slice(0, 6), nBad: bad.length, nextEp: D.next && D.next.ep };
  }, HOME);
  result('D1b next year\'s months from the later ice-out; every open day one the turn takes', d1b.firstOk && d1b.open > 60 && d1b.nBad === 0 && d1b.nextEp === 29, d1b);

  const d1c = await ev(async (home) => {
    const g = window.__game, H = window.__lf, P = g.permits, T = g.seasonTurn, june = H.absOf(2027, 6, 15);
    const m0 = g.profile.money, held0 = P.held().length, turnTo = T.turnTo;
    T.turnTo = () => Promise.resolve(false); // (the turn refuses after the sale: whatever the reason)
    let r; try { r = P.buy({ ep: 29, abs: june, kind: 'overnight', at: home }); var moved = r.skip ? await r.skip : null; } finally { T.turnTo = turnTo; }
    return { ok: r.ok, moved, m0, mid: m0 - 6, money: g.profile.money, held0, held: P.held().length, year: g.day.year };
  }, HOME);
  result('D1c a sale whose turn does not happen is undone: no permit held, the $6 back', d1c.ok && d1c.moved === false && d1c.money === d1c.m0 && d1c.held === d1c.held0 && d1c.year === 2026, d1c);

  const d1d = await ev((home) => {
    const g = window.__game, H = window.__lf, P = g.permits, o = g.outfitter, D = g.permitDesk, june = H.absOf(2027, 6, 20);
    const p = P.grant({ ep: 29, abs: june, from: home, why: 'test' });
    D.next = null; o.render && o.render(); H.step(2);
    const line = [...document.querySelectorAll('#outfitter .permitdesk .pd-held')].map((e) => e.textContent).find((t) => /entry point 29/.test(t)) || null;
    P.s.held = P.s.held.filter((q) => q.id !== p.id); P.write(); o.render && o.render();
    return { line };
  }, HOME);
  await shot('d1d-held');
  result('D1d a permit held in another year says the year on the held line', !!d1d.line && /2027/.test(d1d.line), d1d);

  const d1e0 = await ev((home) => {
    const g = window.__game, H = window.__lf, o = g.outfitter, june = H.absOf(2027, 6, 15);
    window.__ev = []; g.seasonTurn.on('*', (e, k) => window.__ev.push(k));
    const m0 = g.profile.money;
    o.act('permit-next'); o.act('permit-nep', '29'); o.act('permit-nmonth', '6'); o.act('permit-nday', String(june));
    const b = document.querySelector('#outfitter .permitdesk [data-act="permit-nbuy"]');
    return { m0, l1: b ? b.textContent : null, dis: b ? b.disabled : null };
  }, HOME);
  await page.click('#outfitter .permitdesk [data-act="permit-nbuy"]', { timeout: 5000 }).catch(() => ev(() => window.__game.outfitter.act('permit-nbuy')));
  await ev(() => window.__lf.step(2));
  await page.click('#outfitter .permitdesk [data-act="permit-nbuy"]', { timeout: 5000 }).catch(() => ev(() => window.__game.outfitter.act('permit-nbuy')));
  await until(() => window.__game.veil.active, null, 20000).catch(() => null);
  await page.waitForTimeout(2000);
  await shot('d1e-winter');
  await until(() => !window.__game.veil.active, null, 90000);
  await ev(() => window.__lf.step(10));
  const d1e = await ev(() => { const g = window.__game, H = window.__lf, june = H.absOf(2027, 6, 15); return { money: g.profile.money, year: g.day.year, today: g.permits.today, june, hours: +g.day.hours.toFixed(2), held: g.permits.held().some((p) => p.abs === june && p.ep === 29), ev: window.__ev.slice() }; });
  result('D1e the turn still works: EP 29, 15 June 2027, $6, the winter card, up at seven that day', /Choose/.test(d1e0.l1 || '') && !d1e0.dis && d1e0.m0 - d1e.money === 6 && d1e.year === 2027 && d1e.today === d1e.june && Math.abs(d1e.hours - 7) < 0.1 && d1e.held && d1e.ev.includes('year:open'), { ...d1e0, ...d1e });

  // ---- D4 a done notice of a cut kind in an old save -------------------------------------------------------------------------
  await ev(() => { const H = window.__lf; H.closeAll(); H.step(5); });
  const d4 = await ev(async (home) => {
    const g = window.__game, H = window.__lf, T = g.tasks;
    const d = JSON.parse(JSON.stringify(T.serialize()));
    d.ads = d.ads || []; d.ads.push({ id: 99997, kind: 'rental', from: home, status: 'done', title: 'A rental canoe brought home', pay: 15, posted: T.today() - 3, taken: T.today() - 3 });
    T.restore(d);
    const t = T.ads.get(99997), kept = !!(t && t.status === 'done' && t.cut);
    const words = g.journal && typeof g.journal.taskState === 'function' && t ? g.journal.taskState(t).words : null;
    let next = null; try { next = g.guide.taskNext(T, t); } catch (e) { next = String(e); }
    const missed = T.missed.some((m) => m.id === 99997);
    const m0 = g.profile.money; H.notes.length = 0;
    H.step(10); // between trips: paid there and then
    return { kept, words, next, missed, paid: g.profile.money - m0, gone: !T.ads.has(99997), notes: H.notes.slice(-3), trip: g.trip.active };
  }, HOME);
  result('D4 a done notice of a cut kind keeps its pay: on the list as done, the journal says so, paid between trips with a line', d4.kept && /no longer posted/.test(d4.words || '') && /No longer posted/.test(d4.next || '') && !d4.missed && d4.paid === 15 && d4.gone && d4.notes.some((n) => /paid all the same/.test(n)), d4);

  // ---- D6 the south edge at EP 84 and EP 75 ----------------------------------------------------------------------------------
  const d6 = [];
  for (const ep of [84, 75]) {
    const lot = await ev((ep) => { const g = window.__game, e = g.world.entryPoints.find((q) => q.ep === ep); const L = g.trailhead && g.trailhead.trailheadLayout ? g.trailhead.trailheadLayout(ep) : null; const q = (L && L.lot) || e.lot || e; return { x: q.x, z: q.z, maxZ: g.world.maxZ }; }, ep);
    await ev(async (q) => { const H = window.__lf; await H.tp(q.x, q.z); H.standAt(q.x, q.z, Math.PI / 2); H.step(30); }, lot);
    await page.keyboard.down('KeyW');
    const north = await ev(() => { const g = window.__game, H = window.__lf, p = g.player, x0 = p.x, z0 = p.z; for (let k = 0; k < 240; k++) { H.look(Math.PI / 2); g.step(1 / 30, 1); } return Math.round(Math.hypot(p.x - x0, p.z - z0)); });
    await page.keyboard.up('KeyW');
    await ev(async (q) => { const H = window.__lf; H.standAt(q.x, q.z, -Math.PI / 2); H.step(10); }, lot);
    await page.keyboard.down('KeyW');
    const south = await ev(() => {
      const g = window.__game, H = window.__lf, p = g.player, seen = new Set(), z0 = p.z; let lz = p.z, still = 0;
      for (let k = 0; k < 2400; k++) {
        H.look(-Math.PI / 2 + (still > 60 ? Math.sin(k / 20) * 0.6 : 0)); g.step(1 / 30, 1);
        if (p.prompt && p.prompt.text) seen.add(p.prompt.text.replace(/<[^>]+>/g, ''));
        if (k % 30 === 0) { still = Math.abs(p.z - lz) < 0.5 ? still + 30 : 0; lz = p.z; }
        if ([...seen].some((t) => /off your maps/.test(t))) break;
      }
      const prompt = document.body.innerText;
      return { went: Math.round(p.z - z0), toEdge: Math.round(g.world.maxZ - p.z), seen: [...seen].slice(0, 6), turnBack: /turn back/i.test(prompt) || [...seen].some((t) => /turn back/i.test(t)) };
    });
    await page.keyboard.up('KeyW');
    if (ep === 84) await shot('d6-edge-84');
    d6.push({ ep, lot: { toEdge: Math.round(lot.maxZ - lot.z) }, north, south });
  }
  result('D6 EP 84 and 75 lots: not pinned, the south end of the map says "Past here is off your maps", never "turn back"', d6.every((q) => q.north > 5 && !q.south.turnBack && q.south.seen.some((t) => /Past here is off your maps/.test(t))), d6);

  result('E no page errors', errors.length === 0, { errors: errors.slice(0, 6) });
} catch (e) {
  result('the run', false, { error: String((e && e.stack) || e).slice(0, 2000) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
