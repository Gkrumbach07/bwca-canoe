// cmp-r (story Round 3, stream R: the run), in the real game, headless Chromium against a running Vite (?story=1).
// Each check printed PASS or FAIL, a JSON report at the end.
//   1 the lift on the designed route (meeting EP 30): run.active, S6, the run's verbs absent, a checkpoint at the pit
//   2 a leg by real input (W held): the canoe leaves the dam, the leg is the bay's or Gull's
//   3 seen: a white lamp near One, the state rises (no meter: the stealth state only)
//   4 caught once: food eaten and energy spent since come back, the scanner taken since is kept, the pose and the clock
//     are the checkpoint's, no fact written by the catch, the leg's catch counted
//   5 an evacuation on the run resets the same (no trip card, no next morning)
//   6 the finish: the lot's gravel at EP 30 with the cans (run.arrived), then n's run.done ends the run; verbs back
//   (and no page errors)
//   APP=http://localhost:5230 node scripts/cmp-r-test.mjs [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS } from './slice/c1-layer.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5230').replace(/\/$/, '');
const SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const base of [path.join(homedir(), 'Library/Caches/ms-playwright'), path.join(homedir(), '.cache/ms-playwright')]) {
    const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium')).sort().reverse() : [];
    for (const s of shells) for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux64/chrome']) { const p = path.join(base, s, rel); if (existsSync(p)) return p; }
  }
  return undefined;
}
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1800)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
const args = process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=vulkan', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: findChrome(), args });
const errors = [];
const shot = async (page, name) => { if (SHOTS) { try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch { /* */ } } };

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /story R|the run|run:/.test(t)) log('console', t.slice(0, 300)); });
  await page.goto(`${APP}/?story=1`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.storyRun && typeof window.__game.step === 'function', null, { timeout: 240000 });
  await page.evaluate(HELPERS);
  // a new season at Farm (31), in October
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click('.startmap .pin[data-ep="31"]');
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(288); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting; }, null, 180000);

  // 1 the lift
  const r1 = await page.evaluate(async () => {
    const g = window.__game, L = window.__L, s = g.story, R = g.storyRun;
    if (g.outfitter.open) g.outfitter.hide();
    try { g.trip.start({ ep: 31, foodDays: 2, canoe: 'aluminium' }); } catch (e) { return { err: 'trip ' + e.message }; }
    g.day.setClock(g.day.year, g.day.doy, 18.6);
    await L.tp(-19900, 26760); await L.settle(); L.step(30);
    s.doc.meeting = { ep: 30, firstDawn: Math.round(Date.UTC(g.day.year, 0, g.day.doy) / 86400000) + 1 };
    R.start({ meeting: s.doc.meeting, from: 'pit' });
    for (let k = 0; k < 2; k++) g.inventory.give('ammocan');
    L.step(10);
    const A = (v, c) => s.allows(v, c);
    return { active: R.active, stage: s.stage, lifted: s.get('run.lifted'), cp: R.cp.cp && { kind: R.cp.cp.kind, place: R.cp.cp.place }, route: R.route && R.route.id,
      pitch: A('pitch'), tarp: A('tarp'), light: A('light'), restTent: A('rest:tent'), rest: A('rest'), restTied: A('rest', { tied: true }), cans: g.inventory.count('ammocan', { reachable: false }),
      watchers: R.debug.list() };
  });
  result('1 the lift: run.active, S6, pitch/tarp/light/rest-in-tent refused, rest only tied off, a checkpoint at the pit', r1.active && r1.stage === 'S6' && r1.lifted === 30 && r1.cp && r1.cp.kind === 'lift' && r1.route === 'lakeone'
    && r1.pitch === false && r1.tarp === false && r1.light === false && r1.restTent === false && r1.rest === false && r1.restTied === true && r1.cans === 2 && r1.watchers.length === 4, r1);
  await shot(page, 'r1-lift');

  // 2 a leg by real input: W held, the canoe heads west out of the bay
  await page.evaluate(() => { const g = window.__game, L = window.__L; L.look(Math.PI * 0.98); g.day.setClock(g.day.year, g.day.doy, 19.5); L.step(5); });
  const p0 = await page.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
  await page.keyboard.down('KeyW');
  for (let k = 0; k < 30; k++) { await page.evaluate(() => window.__L.step(20)); }
  await page.keyboard.up('KeyW');
  const r2 = await page.evaluate((p0) => { const g = window.__game, p = g.player, R = g.storyRun; return { moved: Math.round(Math.hypot(p.x - p0.x, p.z - p0.z)), mode: p.mode, leg: R.debug.leg(), state: R.state, caught: R.caught }; }, p0);
  result('2 a leg by real input: paddled on, on the bay\'s or Gull\'s leg', r2.moved > 20 && r2.mode === 'paddle' && ['bay', 'gull'].includes(r2.leg.id), r2);

  // 3 a white lamp near One (off the bay mouth): he notices
  const r3 = await page.evaluate(async () => {
    const g = window.__game, L = window.__L, R = g.storyRun;
    const one = R.watchers.get('one');
    await L.tp(one.x + 220, one.z + 60); await L.settle();
    g.headlamp = g.headlamp || null;
    const lamp = R.g.headlamp; lamp.toggle(true);
    const seen = [];
    for (let k = 0; k < 30; k++) { L.step(10); seen.push(R.stealth.state('one')); }
    lamp.toggle(false);
    return { states: [...new Set(seen)], d: Math.round(Math.hypot(one.x - g.player.x, one.z - g.player.z)) };
  });
  result('3 a white lamp 230 m from One: noticed, then seen (no meter)', r3.states.includes('noticed') || r3.states.includes('seen'), r3);

  // 4 caught once: the checkpoint restores food and energy, keeps the stash find
  const r4 = await page.evaluate(async () => {
    const g = window.__game, L = window.__L, R = g.storyRun, s = g.story, inv = g.inventory, e = g.energy;
    R.stealth.reset();
    // a good checkpoint here (forced: the lamp test above left One watching)
    await L.tp(-19900, 26760); await L.settle(); L.step(10);
    R.stealth.reset();
    const cp = R.cp.write('portageEnd', 'rig', { force: true });
    const before = { meals: inv.meals ? inv.meals() : null, food: e.need.food, value: e.value, hours: g.day.hours, x: g.player.x, z: g.player.z, log: g.trip.state.log.length, facts: Object.keys(s.doc.facts).length };
    // since the checkpoint: a meal gone, the bar spent, an hour passed, the scanner taken from the dry bag
    try { inv.setMeals(Math.max(0, (inv.meals() || 2) - 2)); } catch { /* */ }
    e.need.food = Math.max(0, e.need.food - 0.4); e.value = Math.max(0, e.value - 0.3);
    g.day.setClock(g.day.year, g.day.doy, g.day.hours + 1);
    R.takeScanner();
    await L.tp(-20600, 26900); await L.settle(); L.step(10);
    const mid = { meals: inv.meals ? inv.meals() : null, food: e.need.food, scanner: inv.count('scanner', { reachable: false }) };
    const factsMid = Object.keys(s.doc.facts).length;
    await R.debug.catchNow();
    for (let k = 0; k < 40 && (R.cp.busy || g.player.teleporting); k++) { L.step(10); await L.wait(50); }
    L.step(10);
    const after = { meals: inv.meals ? inv.meals() : null, food: e.need.food, value: e.value, hours: g.day.hours, x: g.player.x, z: g.player.z, scanner: inv.count('scanner', { reachable: false }), log: g.trip.state.log.length, facts: Object.keys(s.doc.facts).length };
    return { cp: cp && cp.id, before, mid, after, factsMid, catches: { ...R.catches }, active: R.active, pending: R.cp.pending, scannerFact: s.has('run.scanner') };
  });
  const b = r4.before, a = r4.after;
  result('4 caught once: food and energy back to the checkpoint, the scanner kept, the pose and the clock the checkpoint\'s, no fact by the catch',
    r4.cp && a.meals === b.meals && Math.abs(a.food - b.food) < 0.02 && Math.abs(a.value - b.value) < 0.05 && Math.abs(a.hours - b.hours) < 0.05
    && Math.hypot(a.x - b.x, a.z - b.z) < 8 && a.scanner === 1 && r4.mid.scanner === 1 && a.log <= b.log && a.facts === r4.factsMid && r4.catches && Object.values(r4.catches).reduce((x, y) => x + y, 0) === 1
    && r4.active && !r4.pending && r4.scannerFact, r4);
  await shot(page, 'r4-after-catch');

  // 5 an evacuation on the run resets to the checkpoint instead of the trip card
  const r5 = await page.evaluate(async () => {
    const g = window.__game, L = window.__L, R = g.storyRun;
    const cp = R.cp.cp, closed = g.trip.state.outcome;
    await L.tp(-20800, 26950); await L.settle();
    const took = g.trip.evacuate('cold');
    for (let k = 0; k < 40 && (R.cp.busy || g.player.teleporting); k++) { L.step(10); await L.wait(50); }
    L.step(10);
    return { took, active: g.trip.active, outcome: g.trip.state.outcome, closed, d: Math.round(Math.hypot(g.player.x - cp.player.x, g.player.z - cp.player.z)), run: R.active };
  });
  result('5 an evacuation on the run: back at the checkpoint, the trip still on', r5.took && r5.active && r5.d < 8 && r5.run, r5);

  // 6 the finish: the lot's gravel at EP 30 at first light with the cans; then n's ending ends the run
  const r6 = await page.evaluate(async () => {
    const g = window.__game, L = window.__L, R = g.storyRun, s = g.story;
    const ep = g.world.entryPoints.find((q) => q.ep === 30);
    g.day.setClock(g.day.year, g.day.doy + 1, 7.4);
    R.debug.watchers('blind');
    await L.tp(ep.x, ep.z); await L.settle();
    // ashore by the landing, on foot into the lot
    let spot = null;
    for (let r = 4; r < 60 && !spot; r += 4) for (let k = 0; k < 12 && !spot; k++) { const x = ep.x + Math.cos(k / 2) * r, z = ep.z + Math.sin(k / 2) * r; if (!g.world.isWater(x, z)) spot = { x, z }; }
    if (spot) L.standAt(spot.x, spot.z, 0);
    for (let k = 0; k < 10; k++) L.step(10);
    const arrived = s.get('run.arrived');
    s.set('run.done', 'J', 'rig');
    L.step(10);
    return { ep: ep && { x: Math.round(ep.x), z: Math.round(ep.z) }, spot, arrived, active: R.active, stage: s.stage, pitch: s.allows('pitch'), list: R.watchers.list.length };
  });
  result('6 the finish: arrived on the EP 30 lot with the cans; run.done ends the run, the verbs come back, the watchers stand down', r6.arrived === 30 && !r6.active && r6.pitch === true && r6.list === 0, r6);
  await shot(page, 'r6-finish');
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 6) });
} catch (e) {
  result('threw', false, { e: String(e && e.stack || e).slice(0, 800) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`cmp-r: ${pass}/${results.length} pass`);
  try { writeFileSync('cmp-r-report.json', JSON.stringify({ results, errors }, null, 1)); } catch { /* */ }
  process.exit(pass === results.length ? 0 : 1);
}
