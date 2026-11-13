// cmp-j1 (join 1 of the campaign run: f + r + n + w + c + m + 7a + x): the design's join check, "one whole night on the
// designed route" (campaign-design Part 4 Round 3), in the real game, headless Chromium against a running Vite (?story=1).
// Nothing stubbed: f's real pit, r's real run and watchers, n's real dawn lot.
//   1 the lift by real E at f's cellar (a lock-6 key held): Clear the moss → Lift → Pick up (pit.note) → Take ×2: r's run
//     starts on the note (run.active, S6, a checkpoint at the pit), r gives the two cans
//   2 one lens (j1): the red glass carried → the headlamp's lens is red (feed-side7a fits it, headlamp.setLens)
//   3 the night down the designed route (ROUTES.lakeone, 50 §6.7): every leg's end reached in order on the clock from
//     20:00 to first light, the watchers live (catches allowed: a catch resets to the last checkpoint, never a fact)
//   4 the dawn lot at Lake One 30 at first light with the cans: run.arrived, the lot staged (Dan, Wade, Maggie's wagon:
//     the meeting's first dawn), the come-out held
//   5 the bench (j1): story.allows('rest') refused on the run except on the bench; camp's bench dial opens
//   6 an ending: Maggie's scene by keys (J), then Dan; end=J, run.done, the run over (S7), the cans handed over
//   (and no page errors)
//   APP=http://localhost:5400 node scripts/cmp-j1-test.mjs   (also: story-slice.mjs --run)
import { createRequire } from 'node:module';
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T, choose, hear } from './slice/c1-talk.mjs';

const APP = (process.env.APP || 'http://localhost:5400').replace(/\/$/, '');
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=vulkan', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const DOY = 280; // 7 October 2026: the far end's fall low water, the lakes still open, a long night

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /story R|the run|run:|story n|n: |far/.test(t)) log('console', m.type(), t.slice(0, 300)); });
  await page.goto(`${APP}/?story=1`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  await page.evaluate(async (doy) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === 31), { confirm: false, start: { year: 2026, doy } }); }, DOY);
  await page.waitForFunction(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && g.storyLayer && g.storyFar && g.storyRun && g.storyEndings; }, null, { timeout: 240000, polling: 250 });
  await page.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); if (g.onboarding.pending && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(31, false); } });
  await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T);
  // where chapter 2 leaves a player who has the far end: night one, a lock-6 key (Tauno's old test pit), the stones known;
  // the meeting set at Lake One 30 for tomorrow's first light (wave 2's leech-order pad writes it in the game)
  await page.evaluate(async () => {
    const g = window.__game, s = g.story, L = window.__L;
    s.found({ abs: s.time().abs - 30, key: 2, lake: 'Lake One' }); await L.wait(100); L.step(6);
    s.set('tauno.pit', true, 'rig'); s.set('knows.stones', true, 'rig'); s.meet('maggie', 'rig');
    s.doc.meeting = { ep: 30, firstDawn: s.time().abs + 1 };
    g.trip.start({ ep: 31, foodDays: 3, canoe: 'aluminium' });
    if (!g.pointer.__jpin) { const u = g.pointer.update.bind(g.pointer); g.pointer.update = (...a) => { if (L.pin) { g.pointer.setTarget(L.pin); return; } return u(...a); }; g.pointer.__jpin = true; }
    // to a place inland (the cellar's ridge: a teleport lands at the nearest shore, 600 m off at the camp), stood on it, its
    // tiles in and the layer's build done (cmp-f-test built it by hand the same way)
    L.at = async (id) => {
      const q = g.storyLayer.place(id), l = g.storyLayer; await L.near(q.x, q.z);
      const w = g.world; let at = null; for (let r = 3; r < 30 && !at; r += 3) for (let k = 0; k < 12 && !at; k++) { const x = q.x + Math.cos(k / 2) * r, z = q.z + Math.sin(k / 2) * r; if (!w.isWater(x, z)) at = { x, z }; }
      if (at) L.standAt(at.x, at.z, 0);
      for (let k = 0; k < 80 && !(g.tiles.readyAt(q.x, q.z) && l.built.get(q.id)); k++) { L.step(4); l.poll(); if (g.tiles.readyAt(q.x, q.z)) { try { l.buildPlace(q); } catch { /* not yet */ } } await L.wait(60); }
      return q;
    };
    // the dot on a prop by the eye's ray through the layer's own provider (cmp-f-test's L.dotOn), held through the real E
    L.dotOn = (id, d = 1.3) => {
      const l = g.storyLayer, q = l.prop(id); if (!q) return { none: 'no prop' };
      const m = l.built.get(q.place.id), b = m && m.get(id); if (!b) return { none: 'not built' };
      if (!b.dots.length) return { none: 'no dot' };
      const w = g.world; let at = null;
      for (let k = 0; k < 16 && !at; k++) { const a = (k / 16) * Math.PI * 2, x = q.prop.x + Math.cos(a) * d, z = q.prop.z + Math.sin(a) * d; if (!w.isWater(x, z)) at = { x, z }; }
      if (!at) at = { x: q.prop.x + d, z: q.prop.z };
      L.standAt(at.x, at.z, L.yawTo(q.prop)); L.step(2);
      const P = g.player, dot = b.dots.reduce((a, c) => (c.r > a.r ? c : a)), ty = b.y + dot.y, ey = (P.foot ? P.foot.y : P.groundAt(P.x, P.z)) + 1.6;
      const R = g.pointer.ray; R.origin.set(P.x, ey, P.z); R.direction.set(q.prop.x - P.x, ty - ey, q.prop.z - P.z).normalize();
      const n = g.pointer.near; n.x = P.x; n.z = P.z; n.y = P.altitude;
      const hit = (l.targets(R, n) || []).sort((a, c) => a.miss - c.miss || a.dist - c.dist)[0];
      if (!hit) return { none: 'no target' };
      g.pointer.setTarget(hit.target); L.pin = hit.target;
      return { label: hit.target.label, verb: hit.target.e ? hit.target.e.verb : null };
    };
  });
  const press = async (key) => { await page.keyboard.press(key); await page.evaluate(() => { window.__L.step(3); window.__L.pin = null; }); };

  // 1 the lift at f's cellar, by real E ----------------------------------------------------------------------------------
  await page.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 19.6); });
  await page.evaluate(() => window.__L.at('cellar'));
  const steps = [];
  for (const [id, want, verb] of [['cellar.pit', 'Old pit', 'Clear the moss'], ['cellar.lid', 'Lid', 'Lift'], ['cellar.note', 'Note', 'Pick up'], ['cellar.can.1', 'Can', 'Take'], ['cellar.can.2', 'Can', 'Take']]) {
    // (a prop shown by a fact the last E wrote is built on a later poll: wait for it)
    await page.evaluate(async (id) => { const g = window.__game, l = g.storyLayer, L = window.__L; for (let k = 0; k < 40; k++) { l.poll(); L.step(4); const m = l.built.get('cellar'); if (m && m.get(id)) break; try { l.buildPlace(l.place('cellar')); } catch { /* */ } await L.wait(80); } }, id);
    const t = await page.evaluate((id) => window.__L.dotOn(id), id);
    steps.push({ id, t, ok: t.label === want && t.verb === verb });
    await press('e');
    await page.evaluate(() => window.__L.step(8));
  }
  const r1 = await page.evaluate(() => { const g = window.__game, s = g.story, R = g.storyRun; return { note: s.has('pit.note'), lifted: s.get('run.lifted'), active: R.active, stage: s.stage, cp: R.cp.cp && R.cp.cp.kind, cans: g.inventory.count('ammocan', { reachable: false }), route: R.route && R.route.id, watchers: R.watchers.list.length, sensor: s.readSensor('run.active') }; });
  result('1 the lift by real E at the cellar: pit.note starts r\'s run (S6, a checkpoint), r gives both cans, the route is Lake One\'s, four watchers',
    steps.every((x) => x.ok) && r1.note && r1.active && r1.sensor && r1.stage === 'S6' && r1.cans === 2 && r1.route === 'lakeone' && r1.watchers === 4, { steps, r1 });

  // 2 one lens ------------------------------------------------------------------------------------------------------------
  const r2 = await page.evaluate(async () => {
    const g = window.__game, L = window.__L, lamp = g.storyRun.g.headlamp, before = lamp.lens;
    g.inventory.give('redlens'); for (let k = 0; k < 10; k++) { L.step(6); await L.wait(30); }
    return { before, after: lamp.lens, red: lamp.red, fact: g.story.has('lens.red') };
  });
  result('2 one lens: the red glass carried fits the headlamp red (setLens), lens.red written', r2.before === 'white' && r2.after === 'red' && r2.red && r2.fact, r2);

  // 3 the night down the designed route -----------------------------------------------------------------------------------
  const r3 = await page.evaluate(async () => {
    const g = window.__game, L = window.__L, R = g.storyRun, s = g.story;
    if (!R.route) return { legs: [], none: 'no route (the run never started)', active: R.active };
    const legs = R.route.legs, out = [], doy0 = g.day.doy, year = g.day.year;
    const t0 = 20, span = 9.4; // 20:00 → ~05:25
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i], h = t0 + (span * (i + 1)) / legs.length;
      g.day.setClock(year, doy0 + Math.floor(h / 24), h % 24);
      // the leg's line walked in three hops (its carry's ends are real trail ends; the water legs are open lake)
      for (const f of [0.5, 1]) {
        const x = leg.from[0] + (leg.to[0] - leg.from[0]) * f, z = leg.from[1] + (leg.to[1] - leg.from[1]) * f;
        await L.tp(x, z); await L.settle();
        for (let k = 0; k < 12; k++) { L.step(10); await L.wait(20); }
        for (let k = 0; k < 60 && (R.cp.busy || g.player.teleporting); k++) { L.step(10); await L.wait(50); }
      }
      out.push({ leg: leg.id, at: R.debug.leg().id, hour: +g.day.hours.toFixed(2), caught: R.caught, state: R.state, active: R.active });
    }
    return { legs: out, caught: R.caught, active: R.active, facts: Object.keys(s.doc.facts).filter((k) => /^run\.|^ev\.watchers/.test(k)) };
  });
  const order = r3.legs.map((l) => l.leg);
  result(`3 the night down the designed route: ${order.length} legs in order (${order.join(' → ')}), the run on all night, ${r3.caught} catch(es)`,
    r3.legs.length >= 8 && r3.legs.every((l) => l.active) && r3.active, r3);

  // 4 the dawn lot at Lake One 30 at first light with the cans ------------------------------------------------------------
  const r4 = await page.evaluate(async () => {
    const g = window.__game, L = window.__L, T = window.__t, s = g.story, en = g.storyEndings, R = g.storyRun;
    const e = g.world.entryPoints.find((x) => x.ep === 30);
    const abs = s.doc.meeting.firstDawn, today = s.time().abs; if (today < abs) g.day.setClock(g.day.year, g.day.doy + (abs - today), 6.2); else g.day.setClock(g.day.year, g.day.doy, 6.2);
    R.debug.watchers('blind');
    await L.tp(e.x, e.z); await L.settle();
    for (let k = 0; k < 120 && !g.trailhead.trailheadLayout(30); k++) { L.step(5); await L.wait(100); }
    const TL = g.trailhead.trailheadLayout(30);
    T.standAt(TL.lot.x, TL.lot.z); for (let k = 0; k < 12; k++) { L.step(10); await L.wait(40); }
    return { arrived: s.get('run.arrived'), staged: en.staged(), hold: g.outfitter.storyHold ? g.outfitter.storyHold(30) : null, stage: s.stage, cans: g.inventory.count('ammocan', { reachable: false }), hours: +g.day.hours.toFixed(2), active: R.active };
  });
  const S = r4.staged || {};
  result('4 the dawn lot at Lake One 30 with the cans: run.arrived = 30, Dan, Wade and Maggie\'s wagon (her first dawn), the come-out held, still S6',
    r4.arrived === 30 && !!r4.staged && ['dan', 'wade'].every((w) => (S.people || []).includes(w)) && S.maggie && r4.hold === true && r4.stage === 'S6' && r4.cans === 2 && r4.active, r4);

  // 5 the bench -----------------------------------------------------------------------------------------------------------
  const r5 = await page.evaluate(async () => {
    const g = window.__game, s = g.story, L = window.__L;
    const rest = s.allows('rest'), bench = s.allows('rest', { bench: true }), tent = s.allows('rest:tent');
    const opened = g.camp.restDial({ bench: true });
    const shown = !!(g.camp.dial && (g.camp.dial.open || g.camp.dial.visible || (g.camp.dial.el && !g.camp.dial.el.hidden)));
    return { rest, bench, tent, opened, shown };
  });
  await page.keyboard.press('Escape'); await page.evaluate(() => window.__L.step(4));
  result('5 the bench: Rest refused on the run but on the bench (ctx.bench), no Rest in a tent; camp\'s bench dial opens', r5.rest === false && r5.bench === true && r5.tent === false && r5.opened === true, r5);

  // 6 an ending: Maggie's scene by keys (J) -------------------------------------------------------------------------------
  const trail = [];
  await page.evaluate(() => window.__game.storyEndings.debug.maggie());
  trail.push(await choose(page, 'That\'s it.'));
  trail.push(await choose(page, 'I don\'t know.'));
  trail.push(await hear(page, 20));
  await page.waitForFunction(() => !!(window.__game.dialogue && window.__game.dialogue.convo), null, { timeout: 15000, polling: 200 }).catch(() => {});
  trail.push(await choose(page, 'It wasn\'t for sale.'));
  trail.push(await hear(page));
  await page.waitForTimeout(3000);
  const r6 = await page.evaluate(async () => { const g = window.__game, s = g.story, L = window.__L, R = g.storyRun; for (let k = 0; k < 6; k++) { L.step(5); await L.wait(100); } return { end: s.get('end'), J: s.has('end.J'), done: s.get('run.done'), stage: s.stage, active: R.active, sensor: s.readSensor('run.active'), watchers: R.watchers.list.length, pitch: s.allows('pitch'), cans: g.inventory.count('ammocan', { reachable: false }) }; });
  result('6 an ending (J) by keys: end=J, run.done, the run over (S7), the watchers stood down, the verbs back',
    r6.end === 'J' && r6.J && r6.done === 'J' && r6.stage === 'S7' && !r6.active && !r6.sensor && r6.watchers === 0 && r6.pitch === true, { r6, trail: trail.map((t) => (t && t.ok === false ? t : 'ok')) });
} catch (e) {
  result('threw', false, { e: String((e && e.stack) || e).slice(0, 900) });
} finally {
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 8) });
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`cmp-j1-test: ${pass}/${results.length}${pass === results.length ? ' PASS' : ' FAIL'}`);
  try { writeFileSync('cmp-j1-report.json', JSON.stringify({ results, errors }, null, 1)); } catch { /* */ }
  process.exit(pass === results.length ? 0 : 1);
}
