// 7c's rig (Round 7: the mini-campaigns M1–M6; docs/build/campaign-design.md §10.3), headless Chromium against a running
// Vite (?story=1): each mini opened and advanced to its end in the real game (L.tp / E.toStore between the places), then
// a reseed across a fake winter turn (story.debug.set('year.turned.2027'): stream w's season-turn.js writes the same fact).
//   M1  the ranger's flyer on Moose Lake 25's board taken; two signs read with E Look at the chain's sites; the night
//       watch at the first (dark, lamp off, still) with a print while it is in; the site picked at the counter → relocated
//   M2  the Loon Falls logbook read (the yes); fogvoices on Lac La Croix at dawn in fog, followed east; the four other
//       boxes; a counter → the keeper's word → passed
//   M3  the soloist at the home dock: his talk's "I'll go."; a print on each of his five lakes; back → thanks
//   M4  Tom at the counter; three favours (held notices, done) and the fourth in October → last
//   M5  the bet (Farm 31's topic), the route's lakes, skim ice broken, back → made
//   M6  a project chosen at a counter; thirty days on → yours
//   reseed  a fake turn: cycle 1, a new chain's places (cycle 0's gone), next July its flyer up, a new soloist
//
//   APP=http://localhost:5310 node scripts/cmp-7c-test.mjs [--only m1|m2|…|reseed] [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T } from './slice/c1-talk.mjs';
import { HELPERS_E } from './slice/c2-episodes.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5310').replace(/\/$/, '');
const ONLY = arg('only', null), SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const want = (k) => !ONLY || ONLY.split(',').includes(k);

// the rig's own helpers on the page (window.__m), on top of L, T and E's
const HELPERS_M = () => {
  const g = window.__game, L = window.__L, E = window.__e, M = window.__m = {};
  M.D = () => g.storyMinis.debug;
  M.R = () => g.storyEpisodes.episodes;
  M.f = (keys) => Object.fromEntries(keys.map((k) => [k, g.story.has(k)]));
  M.end = (id) => g.story.get(`ep.${id}.end`) || null;
  M.polls = (n = 1) => { for (let i = 0; i < n; i++) { M.D().poll(); } };
  // a named lake (the biggest of that name): its id and middle
  M.lake = (name) => { let best = null; for (const q of g.world.lakes || []) { if (!q || String(g.world.lakeName(q.id) || '').toLowerCase() !== name.toLowerCase()) continue; if (!best || (q.cells || 0) > (best.cells || 0)) best = q; } return best ? { id: best.id, x: best.cx, z: best.cz, cells: best.cells } : null; };
  // on a named lake's water: to its middle (the tiles in), then the nearest water of that lake on a spiral out
  M.onLake = async (name) => {
    const l = M.lake(name); if (!l || !Number.isFinite(l.x)) return { name, none: true, l };
    await L.near(l.x, l.z); const w = g.world; let p = null;
    for (let r = 0; r < 4000 && !p; r += 50) for (let k = 0; k < (r ? 24 : 1) && !p; k++) { const a = (k / 24) * Math.PI * 2, x = l.x + Math.cos(a) * r, z = l.z + Math.sin(a) * r; if (w.isWater(x, z) && w.lakeIdAt(x, z) === l.id) p = { x, z }; }
    if (!p) return { name, nowater: true, l };
    await L.near(p.x, p.z); L.step(10);
    return { name, at: [Math.round(g.player.x), Math.round(g.player.z)], lake: g.world.lakeName(g.world.lakeIdAt(g.player.x, g.player.z) || 0), mode: g.player.mode };
  };
  // to an added place: near its anchor (the tiles in), refit inland, built
  M.toPlace = async (pid) => { const pl = g.storyLayer.place(pid); await L.near(pl.x + 2, pl.z + 2); M.D().refit(); const q = g.storyLayer.place(pid); await L.near(q.x + 2, q.z + 2); for (let k = 0; k < 6; k++) { g.storyLayer.poll(); L.step(4); } return { x: Math.round(q.x), z: Math.round(q.z), fitted: !!q.fitted }; };
  M.shot = (yaw = 0) => { L.look(yaw, 0.05); L.step(4); g.photo.raise(); L.look(yaw, 0.05); L.step(4); const rec = g.photo.capture(); L.step(4); g.photo.lower(); L.step(4); return rec ? rec.id : null; };
  M.go = (node, i = 0) => { const c = node && node.choices && node.choices[i]; return c && typeof c.go === 'function' ? c.go() : null; };
  M.topic = (id) => { const T = g.storyTalk && g.storyTalk.topics; const t = T && T.data && T.data.keeper ? T.data.keeper.find((q) => q.id === id) : null; return t; };
  // a keeper topic as topics.say runs it (its once fact, its Gives), only when its condition holds at that counter
  M.runTopic = (id, ep) => { const t = M.topic(id); if (!t) return { id, found: false }; const ok = g.story.when(t.when, { ep, home: ep === 25, farm: ep === 31 }); if (ok) { if (t.once) g.storyTalk.topics.run([`f:asked.walt.${t.id}`], { ep }, `topic:${id}`); g.storyTalk.topics.run(t.then || [], { ep }, `topic:${id}`); } return { id, found: true, when: ok }; };
  M.at = (y, doy, h) => { E.at(y, doy, h); M.D().dayTurn(); };
  M.done = (tk) => { tk.status = 'done'; g.tasks.update(0.1); };
};

async function open(query) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /7c|minis|episodes:/.test(t)) log('console', m.type(), t.slice(0, 300)); });
  await page.goto(`${APP}/${query ? '?' + query : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  return page;
}
async function newSeason(page, home, doy) {
  await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await page.waitForFunction(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && g.storyEpisodes && g.storyLayer && g.storyMinis; }, null, { timeout: 200000, polling: 250 });
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const step = async (name, fn) => { log(`-- ${name}`); try { await fn(); } catch (e) { result(`${name}: threw`, false, { e: String((e && e.stack) || e).slice(0, 600) }); } };

try {
  const page = await open('story=1');
  await newSeason(page, 25, 186); // 5 July 2026
  await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T); await page.evaluate(HELPERS_E); await page.evaluate(HELPERS_M);
  await page.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); window.__L.step(20); });

  await step('boot', async () => {
    const r = await page.evaluate(() => { const M = window.__m, R = M.R(); return { on: !!window.__game.storyMinis.on, recs: ['M1_0', 'M2', 'M3_0', 'M4_0', 'M5_0', 'M6', 'M1_5'].map((id) => !!R.record(id)), cycle: M.D().cycle(), m1: (() => { const b = M.D().M1(); return b ? { k: b.k, names: b.names, sites: b.sites.length, signs: b.signs.map((s) => s.sign) } : null; })(), boxes: M.D().FOGP.map((p) => [p.id, Math.round(p.x), Math.round(p.z)]) }; });
    result('boot: the minis connected, every record on the runner, cycle 0, M1 bound to a chain with sites, five logbook boxes', r.on && r.recs.every(Boolean) && r.cycle === 0 && r.m1 && r.m1.sites > 0 && r.m1.signs.length === 3 && r.boxes.length === 5, r);
  });

  if (want('m1')) await step('M1 the raspberry bear', async () => {
    const a = await page.evaluate(async () => {
      const g = window.__game, M = window.__m;
      M.at(2026, 186, 11);
      const board = (g.tasks.flyers(25) || []).map((f) => f.id), b31 = (g.tasks.flyers(31) || []).map((f) => f.id);
      const took = g.tasks.flyerHook.take('ep:M1_0');
      return { board, b31, took, yes: g.story.has('ep.M1_0.yes'), paper: (M.R().flyers(25).find((f) => f.id === 'ep:M1_0') || {}).paper };
    });
    result('M1a: the ranger\'s flyer on boards 25 and 31 (outside the count), taken → the yes', a.board.includes('ep:M1_0') && a.b31.includes('ep:M1_0') && a.took && a.yes, a);
    const b = await page.evaluate(async () => {
      const g = window.__game, L = window.__L, M = window.__m, B = M.D().M1(), out = [];
      for (const s of B.signs.slice(0, 2)) {
        const at = await M.toPlace(`m1.0.${s.sign}`);
        const id = `m1.0.${s.sign}.p`, built = g.storyLayer.builtList().some((q) => q.prop === id);
        const t = L.faceTo(id, 1.6, 0.4), viaDot = !!(t && t.ref === `story:${id}`);
        const verbs = g.storyLayer.verbs(id).map((v) => v.verb);
        const used = g.storyLayer.look(id);
        out.push({ sign: s.sign, at, built, viaDot, dot: g.storyLayer.dotName(id), verbs, used });
      }
      return { out, f: M.f(['ep.M1_0.sign.claw', 'ep.M1_0.sign.scat', 'ep.M1_0.sign.barrel', 'ep.M1_0.range']) };
    });
    await shot(page, 'm1-sign');
    result('M1b: two of the chain\'s signs built, on the dot, read with Look → its range', b.out.every((o) => o.built && o.used) && b.f['ep.M1_0.range'], b);
    const c = await page.evaluate(async () => {
      const g = window.__game, L = window.__L, M = window.__m, D = M.D(), W = D.M1().watch;
      await L.near(W.x + 4, W.z + 4); L.standAt(W.x + 4, W.z + 4, 0); L.step(6);
      const lamp = g.lamp || (g.camp && g.camp.lamp); if (lamp && lamp.on && lamp.set) lamp.set(false);
      M.at(2026, 187, 22.5); D.dbg.bearNow = true;
      let phase = null, shotId = null;
      for (let i = 0; i < 80; i++) {
        g.day.setClock(g.day.year, g.day.doy, Math.min(23.9, g.day.hours + 0.02)); g.story.update(); M.polls(1); L.step(1);
        const w = D.watch(); phase = w ? w.phase : phase;
        if (w && w.phase === 'in' && !shotId) shotId = M.shot(0.3);
        if (!w && g.story.has('ep.M1_0.seen')) break;
      }
      D.dbg.bearNow = false;
      return { phase, shotId, f: M.f(['ep.M1_0.seen', 'ep.M1_0.photo', 'ep.M1_0.documented']) };
    });
    result('M1c: the night watch at the first sign: dark, still, the lamp off; it comes; a print while it is in → seen, photo, documented', c.f['ep.M1_0.seen'] && c.f['ep.M1_0.photo'] && c.f['ep.M1_0.documented'], c);
    const d = await page.evaluate(async () => {
      const g = window.__game, M = window.__m, E = window.__e;
      await E.toStore(25); window.__t.walkIn(25); M.at(2026, 188, 11);
      const t = M.runTopic('M1_0.site.b', 25);
      window.__L.step(10);
      return { t, end: M.end('M1_0'), page: M.R().page('M1_0') };
    });
    result('M1d: at the counter the site picked (up past Insula… the Isabella) → relocated; the page closes with its end', d.t.found && d.end === 'relocated' && d.page && d.page.end, d);
  });

  if (want('m2')) await step('M2 singing in the fog', async () => {
    const a = await page.evaluate(async () => {
      const g = window.__game, L = window.__L, M = window.__m, P = M.D().FOGP[0];
      M.at(2026, 190, 10);
      const at = await M.toPlace('m2.loon');
      const built = g.storyLayer.builtList().some((q) => q.prop === 'm2.loon.box'), used = g.storyLayer.look('m2.loon.box');
      return { P: [P.id, Math.round(P.x), Math.round(P.z)], at, built, used, yes: g.story.has('ep.M2.yes') };
    });
    result('M2a: the logbook box at Loon Falls (US side), read → the yes', a.built && a.used && a.yes, a);
    const b = await page.evaluate(async () => {
      const g = window.__game, L = window.__L, M = window.__m, D = M.D();
      const on = await M.onLake('Lac La Croix');
      M.at(2026, 191, 5.5); D.dbg.fog = true; D.dbg.fogNow = true;
      let started = false, near = false, i = 0;
      for (; i < 400; i++) {
        const p = g.player, f = D.fog();
        if (f) { started = true; near = near || f.near; const dx = f.at.x - p.x, dz = f.at.z - p.z, d = Math.hypot(dx, dz) || 1; p.x += (dx / d) * 1.8; p.z += (dz / d) * 1.8; }
        M.polls(1); if (i % 10 === 0) L.step(1);
        if (started && !D.fog()) break;
      }
      D.dbg.fog = false;
      return { on, started, near, polls: i, f: M.f(['ep.M2.heard', 'ep.M2.close']) };
    });
    result('M2b: dawn fog on Lac La Croix: the voices (fogvoices), followed east, never caught → heard', b.started && b.f['ep.M2.heard'], b);
    const c = await page.evaluate(async () => {
      const g = window.__game, L = window.__L, M = window.__m, out = [];
      for (const P of M.D().FOGP.slice(1)) { const at = await M.toPlace(`m2.${P.id}`); out.push([P.id, at, g.storyLayer.builtList().some((q) => q.prop === `m2.${P.id}.box`), g.storyLayer.look(`m2.${P.id}.box`)]); }
      const filled = g.story.has('ep.M2.filled');
      g.story.ingest('store:enter', { ep: 25 }); // (feed-outfitter's event: the counter after the fifth box)
      await L.wait(2600); L.step(4);
      return { out, filled, end: M.end('M2'), page: (M.R().page('M2') || {}).lines };
    });
    result('M2c: the four other boxes read east to Knife Lake → filled; a counter → the keeper\'s word → passed (never closed by itself)', c.filled && c.end === 'passed', c);
  });

  if (want('m3')) await step('M3 the trip not taken', async () => {
    const a = await page.evaluate(async () => {
      const g = window.__game, M = window.__m, E = window.__e, D = M.D();
      M.at(2026, 195, 10); await E.toStore(25); window.__L.step(10); M.polls(2);
      const staged = !!D.solo() || D.stageSolo();
      const n0 = D.soloNodes(), n1 = M.go(n0), said = n1 && n1.say, n2 = M.go(n1, 0);
      const opened = D.soloTalk(); try { g.talk && g.talk.close && g.talk.close(); } catch { /* */ }
      return { staged, name: D.solo() && D.solo().S.name, hello: n0 && n0.say, said, list: n2 && n2.say, opened: !!opened, yes: g.story.has('ep.M3_0.yes') };
    });
    result('M3a: the soloist at the home dock; his hello, his ask, "I\'ll go." → the yes, his list said', a.staged && a.yes && !!a.list, a);
    const b = await page.evaluate(async () => {
      const g = window.__game, M = window.__m, D = M.D(), S = D.solo().S, out = [];
      for (const q of S.route) { const on = await M.onLake(q.lake); const id = on ? M.shot(0.5) : null; out.push({ lake: q.lake, on: on && on.lake, id, shot: g.story.has(`ep.M3_0.shot.${q.i}`) }); }
      return { out, all: g.story.has('ep.M3_0.all') };
    });
    result('M3b: a print on each of his five lakes → all five', b.all, b);
    const c = await page.evaluate(async () => {
      const g = window.__game, M = window.__m, E = window.__e, D = M.D();
      await E.toStore(25); M.polls(2); if (!D.solo()) D.stageSolo();
      const n = D.soloNodes(), r = M.go(n, 0);
      window.__L.step(10);
      return { say: r && r.say, end: M.end('M3_0') };
    });
    result('M3c: back at the dock, "I have your pictures." → his thanks; ended', c.end === 'thanks', c);
  });

  if (want('m4')) await step('M4 the ranger crew', async () => {
    const r = await page.evaluate(async () => {
      const g = window.__game, M = window.__m, E = window.__e, D = M.D(), out = [];
      M.at(2026, 200, 10); await E.toStore(25); D.stageTom(25);
      for (let n = 1; n <= 3; n++) {
        const n0 = D.tomNodes(), offer = M.go(n0), after = M.go(offer, 0);
        await window.__L.wait(400);
        const tk = g.tasks.active.find((t) => t.status === 'open' && !out.some((o) => o.id === t.id));
        out.push({ n, hello: n0 && n0.say, ask: offer && offer.say, name: after && after.say, id: tk && tk.id, kind: tk && tk.kind });
        if (tk) M.done(tk);
        window.__L.step(4);
      }
      const three = g.story.has('ep.M4_0.three'), yes = g.story.has('ep.M4_0.yes');
      M.at(2026, 280, 10); D.stageTom(25); // (October: their last check)
      const n4 = D.tomNodes(), o4 = M.go(n4); M.go(o4, 0); await window.__L.wait(400);
      const tk4 = g.tasks.active.find((t) => t.status === 'open' && t.kind === 'lastcheck'); if (tk4) M.done(tk4); window.__L.step(4);
      D.dbg.tomEp = null;
      return { out, yes, three, ask4: o4 && o4.say, tk4: tk4 && tk4.id, end: M.end('M4_0'), page: (M.R().page('M4_0') || {}).lines };
    });
    result('M4: Tom at the counter, three favours held and done (the yes on the first, a name on the second), the fourth in October → last', r.yes && r.three && r.end === 'last', r);
  });

  if (want('m5')) await step('M5 the freeze-up run', async () => {
    const r = await page.evaluate(async () => {
      const g = window.__game, M = window.__m, D = M.D();
      M.at(2026, 298, 10);
      const route = M.R().record(D.rec('M5')).route, bet = M.runTopic(`${D.rec('M5')}.bet`, route.from);
      const out = [];
      D.dbg.skim = true; D.dbg.stroke = true;
      for (const n of route.lakes) { const on = await M.onLake(n); M.polls(30); out.push({ n, on: on && (on.lake || on), skim: g.story.has(`ep.${D.rec('M5')}.skim`) }); }
      D.dbg.skim = false; D.dbg.stroke = false;
      const id = D.rec('M5'), round = g.story.has(`ep.${id}.round`), skim = g.story.has(`ep.${id}.skim`);
      const back = M.runTopic(`${id}.back`, route.from);
      return { id, bet, out, round, skim, back, end: M.end(id) };
    });
    result('M5: the bet taken (the yes), every lake of the route paddled, skim ice broken, back at the counter → made', r.bet.found && r.round && r.skim && r.end === 'made', r);
  });

  if (want('m6')) await step('M6 the long stay', async () => {
    const r = await page.evaluate(async () => {
      const g = window.__game, M = window.__m, E = window.__e;
      M.at(2026, 200, 10); await E.toStore(25); window.__t.walkIn(25); window.__L.step(6);
      const a = M.runTopic('M6.ask', 25), b = M.runTopic('M6.p.lakes', 25);
      const yes = g.story.has('ep.M6.yes'); M.polls(1); const long = M.D().m6();
      M.at(2026, 216, 10); M.at(2026, 231, 10);
      return { a, b, yes, long, half: g.story.has('ep.M6.half'), end: M.end('M6') };
    });
    result('M6: a project chosen at the counter (the yes), its counts from the start, thirty days on → yours', r.yes && !!r.long && (r.end === 'yours' || r.end === 'done'), r);
  });

  if (want('reseed')) await step('reseed across a winter turn', async () => {
    const r = await page.evaluate(async () => {
      const g = window.__game, M = window.__m, D = M.D();
      const before = { m1: D.M1().names, solo: (M.R().record(D.rec('M3')) || {}).soloist.name, c: D.cycle() };
      g.story.debug.set('year.turned.2027'); window.__L.step(4);
      M.at(2027, 186, 11);
      const after = { m1: D.M1().names, k: D.M1().k, solo: (M.R().record(D.rec('M3')) || {}).soloist.name, c: D.cycle() };
      const places = { old: g.storyLayer.places().filter((p) => /^m1\.0\./.test(p.id)).length, now: g.storyLayer.places().filter((p) => /^m1\.1\./.test(p.id)).length };
      const board = (g.tasks.flyers(25) || []).map((f) => f.id);
      return { before, after, places, board, open1: M.R().window('M1_1'), open0: M.R().window('M1_0'), ends: { m30: M.end('M3_0'), m40: M.end('M4_0') } };
    });
    result('reseed: a fake turn → cycle 1: a new chain\'s signs (cycle 0\'s gone), a new soloist, next July the new flyer up', r.after.c === 1 && r.after.k === 1 && r.places.old === 0 && r.places.now === 3 && r.board.includes('ep:M1_1') && !r.board.includes('ep:M1_0') && r.after.solo !== r.before.solo && JSON.stringify(r.after.m1) !== JSON.stringify(r.before.m1), r);
  });
  await page.context().close();
} finally {
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 8) });
  await browser.close();
  const fails = results.filter((r) => !r.pass).length;
  log(`cmp-7c-test: ${results.length - fails}/${results.length}${fails ? ' FAIL' : ' PASS'}`);
  process.exit(fails ? 1 : 0);
}
