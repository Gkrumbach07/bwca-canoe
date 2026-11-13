// Stream x (the campaign run: chapter 2's finish with the owner's calls), in the real game: headless Chromium against a
// running Vite (?story=1), each check printed PASS or FAIL. A season at Farm 31 (10 July), the 'turn' fixture:
//   1 the café's people seated (Mary at the window table: a sit pose on the stool, not a stand)
//   2 the Kettle: one forced wet day puts the notice up on Farm's board; taken; a later rain re-posts it; Stories keeps
//     the taken notice's words on its own page ("Field help, Kettle creek")
//   3 story pay with no trip on: paid at once, its line said as a note (Rose's drafted tally line)
//   4 a ride with Tauno ends a running trip: logged as came in at the road end, its card pending there
//   (and no page errors)
//
//   APP=http://localhost:5210 node scripts/cmp-x-test.mjs [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS_T } from './slice/c1-talk.mjs';
import { HELPERS } from './slice/c1-layer.mjs';
import { HELPERS_A2 } from './slice/c2-mining.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5210').replace(/\/$/, '');
const SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 2400)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const open = async (url) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') log('console', t.slice(0, 300)); });
  await page.goto(url, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.storySeams && window.__game.storyTalk && window.__game.storyMining && window.__game.storyEpisodes && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS_T); await page.evaluate(HELPERS); await page.evaluate(HELPERS_A2);
  return page;
};
const newSeason = async (page, home, doy = 191) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${home}"]`);
  await page.evaluate((d) => { const w = window.__game.title.wizard; w.setDate(d); w.next(); }, doy);
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game, T = window.__t; T.step(30); const o = g.outfitter; if (o.open) o.hide(); g.day.setClock(g.day.year, g.day.doy, 10); T.step(10); });
};
const shot = async (page, name) => { if (SHOTS) { try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch { /* none */ } } };

try {
  const page = await open(`${APP}/?story=1`);
  await newSeason(page, 31);
  await page.evaluate(() => { const s = window.__game.story; s.debug.fixture('turn'); });

  // 1 the café's people seated
  {
    const r = await page.evaluate(async () => {
      const g = window.__game, A = window.__a2, M = A.M().miningCast;
      let d = g.day.doy; while (A.dow(d) !== 2) d++; A.at(d, 9.5); // (a Tuesday morning: Mary at the window)
      await A.toFarm(); A.inside(); window.__L.step(30);
      M.debug.stage('mary');
      window.__L.step(10);
      const st = M.live.get('mary'), v = st && st.h && st.h.person, f = v && v.figs && v.figs[0];
      return { staged: M.staged(), spec: f ? f.spec : null, at: f ? [+f.x.toFixed(2), +f.z.toFixed(2), +f.y.toFixed(2)] : null };
    });
    result('1 the café\'s people seated: Mary on the window table\'s stool (a sit pose), not standing where foot traffic nudges her', r.spec && r.spec.pose === 'sit' && r.spec.seat > 0.4, r);
    await shot(page, 'x1-mary-seated');
  }

  // 2 the Kettle notice: one wet day; taken; re-posted on a later rain; its page in Stories
  {
    const r = await page.evaluate(() => {
      const g = window.__game, s = g.story, A = window.__a2, K = A.M().kettle, E = g.storyEpisodes.episodes;
      s.set('tauno.said.pads', true, 'rig');
      const d0 = g.day.doy + 1, d1 = d0 + 9;
      K.rain.force({ from: A.abs(d0), days: 1 }); A.at(d0, 19); E.dayTurn(true);
      const one = K.rain.spellAt(s.nowAbs()), up = K.flyers(31).length, took = K.takeNotice(), after = K.flyers(31).length;
      K.rain.force({ from: A.abs(d1), days: 1 }); A.at(d1, 19); E.dayTurn(true);
      const again = K.flyers(31).length, took2 = again ? K.takeNotice() : false;
      const pages = E.pages().map((p) => ({ id: p.id, title: p.title, lines: p.lines }));
      return { forced: A.abs(d0), one, up, took, after, again, took2, notice: s.has('kettle.notice'), pages, posting: (s.doc.eps && s.doc.eps.mining) || null };
    });
    // polish: the forced day can join a natural wet day beside it (one 4-hour wet day is a spell, and the latest spell
    // holding now counts): the spell is the one that holds the forced day, not necessarily one day long
    result('2a the Kettle notice: the forced wet day makes the spell (alone or joined to a natural wet day); the notice up on Farm\'s board that evening, taken (kettle.notice)', r.one && r.one.a <= r.forced && r.forced <= r.one.b && r.up === 1 && r.took && r.after === 0 && r.notice, r);
    result('2b a later rain re-posts the notice (the Kettle day not done), and it can be taken again', r.again === 1 && r.took2, r);
    const K = (r.pages || []).find((p) => p.id === 'mining');
    result('2c Stories keeps the taken notice\'s words on its own page ("Field help, Kettle creek")', K && /Field help, Kettle creek/.test(K.title) && /FIELD HELP, ONE DAY/.test(K.lines[0] || ''), { K, pages: r.pages });
  }

  // 3 story pay with no trip on: paid at once, its line as a note
  {
    const r = await page.evaluate(() => {
      const g = window.__game, s = g.story, m0 = g.profile.s.money, on = !!g.trip.active;
      s.action('pay', '25@d95.S7.pay', { rule: 'x.rig' });
      window.__L.step(2);
      const box = g.hud && g.hud.el && g.hud.el.lines, text = box ? box.textContent || '' : '', L = (s.doc.dir && s.doc.dir.pay) || [];
      return { on, paid: g.profile.s.money - m0, note: /Lilacs for Rose.s calendar/.test(text), lines: text.slice(0, 300), payText: L.length ? L[L.length - 1].text : null, showLines: g.hud && g.hud.settings ? g.hud.settings.showLines : null, due: L.filter((p) => !p.paid).length };
    });
    result('3 story pay with no trip on: paid at once (+$25), its line shown as a note ("Lilacs for Rose\'s calendar")', !r.on && r.paid === 25 && r.note && r.due === 0, r);
  }

  // 4 a ride with Tauno ends a running trip: came in at the road end, the card pending there
  {
    const r = await page.evaluate(async () => {
      const g = window.__game, core = g.trip, L = window.__L, A = window.__a2;
      A.at(g.day.doy + 1, 9);
      await A.toFarm(); L.step(10);
      core.start({ ep: 31, foodDays: 1, canoe: 'aluminium' });
      const n0 = core.book.trips.length, on0 = core.active;
      const p = g.rides.rideWith(33, { from: 31, who: 'Tauno', pays: true });
      if (!p) return { on0, ride: false };
      let done = false; p.then(() => { done = true; });
      for (let k = 0; k < 400 && !done; k++) { L.step(2); await L.wait(100); }
      for (let k = 0; k < 20; k++) { L.step(2); await L.wait(50); }
      const last = core.book.trips[core.book.trips.length - 1];
      return { on0, ride: true, done, active: core.active, logged: core.book.trips.length - n0, last: last && { to: last.to, why: last.why, k: last.k }, pending: g.record && g.record.s ? g.record.s.pending : null, at: [Math.round(g.player.x), Math.round(g.player.z)], ridesLast: g.rides.last && g.rides.last.to };
    });
    result('4 a ride with Tauno ends the running trip: logged as came in at the road end (EP 33), its trip card pending there', r.on0 && r.ride && r.done && !r.active && r.logged === 1 && r.last && r.last.to === 33 && !!r.pending, r);
    await shot(page, 'x4-ride-card');
  }
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('threw', false, { e: String(e && e.stack || e).slice(0, 800) });
} finally {
  await browser.close();
}
const fails = results.filter((r) => !r.pass);
writeFileSync('cmp-x-report.json', JSON.stringify({ results }, null, 1));
console.log(`cmp-x-test: ${results.length - fails.length}/${results.length}`);
process.exit(fails.length ? 1 : 0);
