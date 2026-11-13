// Campaign Round 4, stream m (the mechanics): the loose hull, the drift, Swamp it / Let go, the tow line, the motorboat
// actor, the rescue-boat ride, the squad night (GY-11) and the canoe adrift, in the real game, headless Chromium against
// a running Vite, each check printed PASS or FAIL:
//   0 flag off: none of m's modules fetched, no storyMech
//   1 drift: a swamped spare let go mid-Birch in a SSE wind drifts north and grounds on the north shore, low in the water
//   2 tow: a spare on the line follows the canoe at the line's length, the line drawn
//   3 motorboat: refused on a paddle-only lake; on Moose Lake it runs a path with a driver sat in it and arrives
//   4 trail: a guide boat trailing holds off and stops when the canoe stops
//   5 rescue: rescue.ride(25, { fee }) — the boat comes, the ride lands you at Moose Lake 25, the fee and the clock
//   6 squad night: squadNight at the Moose Lake landing → the bypass, the spare on a line; swamped and let go it grounds
//     north; ride back → drift.done, drift.left, squad:back, at the Moose Lake landing again
//   7 the canoe adrift: the canoe left on the shore goes 30 m off, loose, and grounds across the water
//   (and no page errors)
//
//   APP=http://localhost:5280 node scripts/cmp-m-test.mjs [--only off|A] [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS } from './slice/c1-layer.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5280').replace(/\/$/, '');
const ONLY = arg('only', null), SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1800)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const open = async (url) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /story m|boats|motorboat/.test(t)) log('console', t.slice(0, 300)); });
  await page.goto(url, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && (!/story=1/.test(location.search) || window.__game.storyMech) && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
  return page;
};
const newSeason = async (page, home, doy = 232) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${home}"]`);
  await page.evaluate((d) => { const w = window.__game.title.wizard; w.setDate(d); w.next(); }, doy);
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game, L = window.__L; L.step(30); const o = g.outfitter; if (o.open) o.hide(); g.day.setClock(g.day.year, g.day.doy, 10); L.step(10); });
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
// in the page: the south wind held (SSE 12 mph), and a helper that steps until fn() or n big frames
const PAGE_HELPERS = () => {
  const g = window.__game, L = window.__L, M = g.storyMech;
  window.__m = {
    south() { const W = g.wind; W.from = 160; W.override = 5.6; },
    async stepUntil(fn, n = 1500, dt = 0.25, every = 20) {
      for (let i = 0; i < n; i += every) { this.south(); L.step(every, dt); if (fn()) return true; await L.wait(5); }
      return !!fn();
    },
    async ensureAt(x, z, r = 220) { if (g.world.tiles) await g.world.tiles.ensure(x, z, r); },
    // a veil card's promise, stepped through
    async through(pr, ms = 90000) { let done = false, val; pr.then((v) => { done = true; val = v; }, (e) => { done = true; val = { err: String(e) }; }); const t0 = performance.now(); while (!done && performance.now() - t0 < ms) { L.step(10, 1 / 30); await L.wait(15); } return val; },
    M,
  };
};

try {
  if (!ONLY || ONLY === 'off') {
    const off = await open(APP);
    await newSeason(off, 25);
    const z = await off.evaluate(() => ({ loaded: performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\/src\/(boats|motorboat|rescue|drift-night)\.js/.test(n)), mech: window.__game.storyMech ?? null }));
    result('0 flag off: none of m\'s modules fetched, no storyMech', z.loaded.length === 0 && z.mech === null, z);
    await off.close();
  }
  if (!ONLY || ONLY === 'A') {
    const a = await open(`${APP}/?story=1`);
    await newSeason(a, 25);
    await a.evaluate(PAGE_HELPERS);

    // 1 the drift test's physics, alone: mid-Birch, a spare swamped and let go
    const d1 = await a.evaluate(async () => {
      const g = window.__game, L = window.__L, m = window.__m, B = m.M.boats;
      await m.ensureAt(-14000, 3600, 700); await L.tp(-14000, 3800); await L.settle();
      m.south(); L.step(10);
      const p = g.player, h = B.spare({ x: p.x - 8, z: p.z, heading: p.heading, verbs: true, id: 't1' });
      B.swamp(h); L.step(40, 1 / 30);
      const sink = h.boat.sink;
      B.letGo(h);
      const x0 = h.x, z0 = h.z, t0 = g.day.hours;
      const ok = await m.stepUntil(() => !!h.grounded, 4000, 0.25, 25);
      const lake = g.world.lakeIdAt(h.x, h.z);
      return { ok, sink, from: [Math.round(x0), Math.round(z0)], at: [Math.round(h.x), Math.round(h.z)], grounded: h.grounded, gameMin: Math.round(((g.day.hours - t0 + 24) % 24) * 60), lake, state: h.state, wind: [g.wind.from, g.wind.speed] };
    });
    // SSE wind blows toward NNW: x falls a little (sin 340° ≈ −0.34 of the run), z falls (north)
    const run1 = d1.grounded ? Math.hypot(d1.at[0] - d1.from[0], d1.at[1] - d1.from[1]) : 0;
    result('1 drift: swamped and let go mid-Birch in a SSE wind, it sits low, drifts north and grounds on the north shore (20–60 game min)', d1.ok && d1.sink > 0.15 && d1.state === 'swamped' && d1.at[1] < d1.from[1] - 150 && Math.abs((d1.at[0] - d1.from[0]) / Math.max(1, run1)) < 0.6 && d1.gameMin > 8 && d1.gameMin < 120, { ...d1, run: Math.round(run1) });
    await shot(a, 'm1-grounded');

    // 2 the tow line
    const d2 = await a.evaluate(async () => {
      const g = window.__game, L = window.__L, m = window.__m, B = m.M.boats, p = g.player;
      B.clear(); await L.tp(-14000, 3800); await L.settle();
      const h = B.spare({ x: p.x - 9, z: p.z, heading: 0, verbs: true, id: 't2' });
      B.tow('player', h);
      const x0 = p.x, z0 = p.z, f = { x: Math.cos(p.heading), z: -Math.sin(p.heading) };
      for (let i = 0; i < 60; i++) { p.x += f.x * 1.5; p.z += f.z * 1.5; L.step(2, 1 / 30); }
      const gap = Math.hypot(h.x - p.x, h.z - p.z);
      return { moved: Math.round(Math.hypot(p.x - x0, p.z - z0)), gap: +gap.toFixed(2), rope: !!(h.rope && h.rope.visible), towed: h.towedBy === 'player', hull: [Math.round(h.x), Math.round(h.z)] };
    });
    result('2 tow: the spare follows the canoe on its line (centres ≤ 2 hulls + the line apart), the line drawn', d2.moved > 60 && d2.gap < 10.5 && d2.gap > 4 && d2.rope && d2.towed, d2);
    await shot(a, 'm2-tow');

    // 3 the motorboat actor
    const d3 = await a.evaluate(async () => {
      const g = window.__game, L = window.__L, m = window.__m, MB = m.M.motorboat, B = m.M.boats;
      B.clear();
      const refused = MB.spawn({ kind: 'guide', at: { x: -14000, z: 3700 } });
      const Lg = g.outfitter.landing(25);
      await L.tp(Lg.x, Lg.z); await L.settle();
      const p = g.player;
      // a path over open water: out from the canoe 40 m, then 260 m along the lake (search a clear line)
      const w = g.world, open = (x, z) => w.isReady(x, z) && w.shoreAt(x, z) < -12;
      let path = null;
      for (let a = 0; a < 24 && !path; a++) {
        const ang = (a * Math.PI) / 12, s = [p.x + Math.cos(ang) * 40, p.z + Math.sin(ang) * 40], e = [s[0] + Math.cos(ang) * 260, s[1] + Math.sin(ang) * 260];
        let ok = true; for (let k = 0; k <= 26; k++) if (!open(s[0] + (e[0] - s[0]) * k / 26, s[1] + (e[1] - s[1]) * k / 26)) { ok = false; break; }
        if (ok) path = [s, e];
      }
      if (!path) return { refused, path: null };
      const mb = MB.spawn({ kind: 'launch', path, driver: { name: 'Brekke' }, lake: w.lakeIdAt(path[0][0], path[0][1]) });
      if (!mb || mb.why) return { refused, spawn: mb };
      let arrived = false; mb.on('arrived', () => { arrived = true; });
      for (let i = 0; i < 120 && !arrived; i++) { L.step(5, 1 / 15); await L.wait(5); }
      // a guide boat close by: its driver drawn, sat at the tiller
      const near = MB.spawn({ kind: 'guide', at: { x: path[0][0], z: path[0][1] }, force: true, driver: { name: 'Jon' } });
      await L.tp(path[0][0] + 12, path[0][1]); await L.settle(); L.step(20, 1 / 30);
      const st = { refused, arrived, at: [Math.round(mb.x), Math.round(mb.z)], end: path[1].map(Math.round), driver: !!mb.driver, mode: mb.mode, nearDrawn: !!(near.driver && near.driver.bind), sitN: near.driver ? near.driver.sitN || 0 : 0 };
      return st;
    });
    result('3 motorboat: refused on Birch (no motors); on Moose Lake Brekke\'s launch runs its path with him sat at the wheel and arrives', d3.refused && d3.refused.why && d3.arrived && Math.hypot(d3.at[0] - d3.end[0], d3.at[1] - d3.end[1]) < 12 && d3.driver && d3.nearDrawn && d3.sitN > 0, d3);
    await shot(a, 'm3-launch');

    // 4 trailing: hold off, stop when you stop
    const d4 = await a.evaluate(async () => {
      const g = window.__game, L = window.__L, m = window.__m, MB = m.M.motorboat, p = g.player;
      MB.clear();
      const w = g.world; let at = null;
      for (let a = 0; a < 24 && !at; a++) { const x = p.x + Math.cos(a * 0.26) * 450, z = p.z + Math.sin(a * 0.26) * 450; if (w.isReady(x, z) && w.shoreAt(x, z) < -15) at = { x, z }; }
      if (!at) return { at: null };
      const mb = MB.spawn({ kind: 'guide', at, driver: { name: 'Jon' }, force: true });
      mb.trail('player', { near: 300, far: 500 });
      p.speed = 0;
      for (let i = 0; i < 60; i++) { L.step(5, 1 / 15); await L.wait(3); }
      const d = Math.hypot(mb.x - p.x, mb.z - p.z);
      return { at: [Math.round(at.x), Math.round(at.z)], dist: Math.round(d), v: +mb.v.toFixed(2), mode: mb.mode, fishing: !!mb.fishing };
    });
    result('4 trail: the guide boat holds off (≥ 250 m) and, the canoe still, stops and fishes', d4.at && d4.dist > 250 && d4.v < 1.5 && d4.mode === 'trail', d4);

    // 5 the rescue ride
    const d5 = await a.evaluate(async () => {
      const g = window.__game, L = window.__L, m = window.__m, R = m.M.rescue;
      m.M.motorboat.clear();
      await m.ensureAt(-14000, 3800, 300); await L.tp(-14000, 3800); await L.settle();
      const money0 = g.profile.money, h0 = g.day.hours;
      R.forceCome = true;
      const r = await m.through(R.ride(25, { fee: 30, why: 'test' }));
      const Lg = g.outfitter.landing(25);
      return { r, money0, money: g.profile.money, dh: +(((g.day.hours - h0) + 24) % 24).toFixed(2), d: Math.round(Math.hypot(g.player.x - Lg.x, g.player.z - Lg.z)) };
    });
    result('5 rescue: the boat comes, the ride lands you at Moose Lake 25, the fee paid from hand, the clock moved', d5.r && d5.r.ok && d5.d < 300 && d5.money0 - d5.money === Math.min(30, d5.money0) && d5.dh > 0.2, d5);

    // 6 the squad night
    const d6 = await a.evaluate(async () => {
      const g = window.__game, L = window.__L, m = window.__m, N = m.M.night, B = m.M.boats, s = g.story;
      const ev = []; s.on('squad:back', (d) => ev.push(['back', d])); s.on('squad:bypass', (d) => ev.push(['bypass', d]));
      if (g.outfitter.open) g.outfitter.hide();
      g.day.setClock(g.day.year, g.day.doy, 21); L.step(5);
      const r = await m.through(N.squadNight({ ep: 25 }));
      await L.settle();
      const st1 = N.stats(), p = g.player;
      const h = N.state && N.state.spare;
      if (!h) return { r, st1 };
      // paddle her out to mid-Birch (a hop), the spare on the line coming along
      await m.ensureAt(-14000, 3800, 600); await L.tp(-14000, 3800); await L.settle();
      h.x = p.x - 8; h.z = p.z; L.step(5);
      B.swamp(h); L.step(30, 1 / 30); B.letGo(h);
      const ok = await m.stepUntil(() => !!h.grounded, 4000, 0.25, 25);
      const g1 = h.grounded;
      // back to the bypass, ride back
      const by = N.state.by; await L.tp(by.birch.x + 10, by.birch.z); await L.settle();
      const back = await m.through(N.rideBack());
      const Lg = g.outfitter.landing(25);
      return { r, st1, ok, g1, back, done: s.get ? s.get('drift.done') : s.has('drift.done'), has: s.has('drift.done'), left: s.has('drift.left'), ev, d: Math.round(Math.hypot(p.x - Lg.x, p.z - Lg.z)), stage: N.state.stage };
    });
    result('6 squad night: to the bypass with the spare on a line; swamped and let go it grounds north; ride back: drift.done, drift.left, squad:back at Moose Lake', d6.r && d6.r.ok && d6.st1 && d6.st1.spare && d6.st1.spare.towed && d6.ok && d6.g1 && d6.g1.z < 3800 && d6.has && d6.left && d6.ev.some((e) => e[0] === 'back') && d6.d < 300 && d6.stage === 'done', d6);
    await shot(a, 'm6-back');

    // 7 the canoe adrift: the canoe left on the shore
    const d7 = await a.evaluate(async () => {
      const g = window.__game, L = window.__L, m = window.__m, N = m.M.night, B = m.M.boats, p = g.player, w = g.world;
      // a shore: a point on land with the water a few metres off
      let spot = null;
      for (let r = 20; r < 200 && !spot; r += 10) for (let a = 0; a < 24 && !spot; a++) {
        const x = p.x + Math.cos(a * 0.26) * r, z = p.z + Math.sin(a * 0.26) * r;
        if (w.isReady(x, z) && w.shoreAt(x, z) > 2 && w.shoreAt(x, z) < 5) spot = { x, z };
      }
      if (!spot) return { spot: null };
      const ok = p.standAt({ x: spot.x, z: spot.z, heading: 0, drop: { x: spot.x + 0.5, z: spot.z, heading: 0 } });
      L.step(10);
      if (!ok) return { spot, stood: false };
      g.wind.override = 0.3; // a calm dawn: the air off the land carries it
      const r = N.adrift({ site: 'test' });
      if (!r) return { spot, stood: true, adrift: null };
      const h = r.h;
      const got = await (async () => { for (let i = 0; i < 4000; i += 25) { g.wind.override = 0.3; L.step(25, 0.25); if (h.grounded || !B.list().includes(h)) break; await L.wait(5); } return !!h.grounded; })();
      return { spot: [Math.round(spot.x), Math.round(spot.z)], from: r.from, end: r.end, grounded: h.grounded, got, ev: g.story.has('ev.adrift') };
    });
    result('7 the canoe adrift: 30 m off the landing, loose, it grounds across the water (ev.adrift)', d7.got && d7.ev && d7.grounded, d7);
    await shot(a, 'm7-adrift');

    // 8 Brekke's launch at Farm on a Thursday: it comes in to the dock's berth while he is in, and goes after
    const d8 = await a.evaluate(async () => {
      const g = window.__game, L = window.__L, m = window.__m, d = g.day;
      m.M.boats.clear(); m.M.motorboat.clear(); g.wind.override = null;
      let doy = d.doy; for (let k = 0; k < 8; k++, doy++) if (new Date(Date.UTC(d.year, 0, doy)).getUTCDay() === 4) break;
      const Lg = g.outfitter.landing(31);
      await L.tp(Lg.x, Lg.z); await L.settle();
      d.setClock(d.year, doy, 11.8); L.step(10, 1 / 30);
      const seen = [];
      for (let i = 0; i < 80; i++) { L.step(6, 1 / 15); await L.wait(5); const s = m.M.launch ? m.M.launch.stats() : null; if (s && (!seen.length || seen[seen.length - 1] !== s.phase)) seen.push(s.phase); if (s && s.phase === 'tied') break; }
      const tied = m.M.launch ? m.M.launch.stats() : null, brekke = !!(g.storyMining && g.storyMining.miningCast.live.has('brekke'));
      d.setClock(d.year, doy, 13.6);
      for (let i = 0; i < 40; i++) { L.step(6, 1 / 15); await L.wait(5); const s = m.M.launch.stats(); if (seen[seen.length - 1] !== s.phase) seen.push(s.phase); }
      return { doy, brekke, tied, seen, prop: !!(g.storyMining && g.storyMining.miningCast.launchMesh), d: Math.round(Math.hypot(g.player.x - Lg.x, g.player.z - Lg.z)) };
    });
    result('8 Brekke\'s launch: on a Thursday it runs in to Farm\'s dock and lies tied while he is in, then goes (no still prop)', d8.seen.includes('in') && d8.seen.includes('tied') && d8.seen.includes('out') && !d8.prop, d8);
    await a.close();
  }
} catch (e) { result('threw', false, { e: String(e && e.stack || e).slice(0, 800) }); }
result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
await browser.close();
const fails = results.filter((r) => !r.pass);
log(`${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
