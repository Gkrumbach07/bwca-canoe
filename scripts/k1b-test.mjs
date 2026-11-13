// Story K1b (docs/build/campaign-design.md Part 4 Round 0): the feed and the seams in the real game, headless Chromium
// against a running Vite, each check printed PASS or FAIL:
//   1 flag off (no ?story): exactly main: no seams (story-seams.js never loaded, no story.allows or story.ui), the feed never
//     starts: no story-feed.js loaded, no listener on the outfitter's door, the trip's own listeners as before
//   2 flag on (?story=1): the feed starts with the trip and outfitter adapters
//   3 the store's door: stepping in gives store:enter { ep }, stepping out walkout { ep } (the real updateVisit)
//   4 a trip: trip:start { n, ep }; a carry logged by the real trip.js carries world.portages' index; two carries back
//     to back give one carrypair { a, b }; coming in gives trip:end
//   5 a co-op guest: walkout and store:enter dropped, a lake passes; mirror mode drops everything
//   (and no page errors)
//
//   npx vite --port 5403 --strictPort &
//   APP=http://localhost:5403 node scripts/k1b-test.mjs [--home 31]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5403').replace(/\/$/, '');
const HOME = Number(arg('home', 31));
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1200)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, H = window.__k1b = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  H.listeners = (o) => { let n = 0; for (const s of (o && o.handlers ? o.handlers.values() : [])) n += s.size; return n; };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const boot = async (page) => {
  await page.waitForFunction(() => window.__game && window.__game.title && (!/story=1/.test(location.search) || window.__game.storySeams) && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
};
const newSeason = async (page, home = HOME) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${home}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game, H = window.__k1b; H.step(30); const o = g.outfitter; if (o.open) o.hide(); if (g.onboarding && g.onboarding.skip) g.onboarding.skip(); g.day.setClock(g.day.year, g.day.doy, 10); H.step(10); });
};
const open = async (url) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); else if (/story K1b/.test(m.text())) log('console', m.text()); });
  await page.goto(url, { timeout: 180000 });
  await boot(page);
  return page;
};
try {
  // 1 flag off
  const off = await open(APP);
  await newSeason(off);
  const one = await off.evaluate(async () => {
    const g = window.__game, H = window.__k1b, S = g.storySeams, o = g.outfitter, L = o.layout(g.profile.home);
    // through the door both ways, with nothing listening
    H.standAt(L.centre.x, L.centre.z); H.step(20); H.standAt((L.stepsFoot || L.door).x, (L.stepsFoot || L.door).z); H.step(20);
    const loaded = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /story-feed|feed-trip|feed-outfitter|story-seams|story-ui|story-allows|pencil|story-layer/.test(n));
    return { seams: S ?? null, loaded, doorListeners: H.listeners(o), allows: typeof g.story.allows, ui: typeof g.story.ui };
  });
  result('1 flag off: no seams (none of their modules loaded, no story.allows/ui), the feed never starts, nothing listens at the door', one.seams === null && one.loaded.length === 0 && one.doorListeners === 0 && one.allows === 'undefined' && one.ui === 'undefined', one);
  await off.context().close();

  // 2 flag on
  const page = await open(`${APP}/?story=1`);
  await until(page, () => !!(window.__game.storySeams && window.__game.storySeams.feed), null, 60000);
  const two = await page.evaluate(() => { const S = window.__game.storySeams; return { on: S.on, names: S.feed.names(), running: S.feed.running }; });
  result('2 flag on: the feed starts with the trip and outfitter adapters', two.on && two.running && two.names.includes('trip') && two.names.includes('outfitter'), two);
  await newSeason(page);

  // 3 the store's door, by walking it (updateVisit's inside test)
  const three = await page.evaluate(async () => {
    const g = window.__game, H = window.__k1b, F = g.storySeams.feed, o = g.outfitter, ep = g.profile.home, L = o.layout(ep), seen = [];
    const offTap = F.tap((evt, d, how) => seen.push({ evt, ep: d.ep, how }));
    const out = L.stepsFoot || L.door;
    H.standAt(out.x, out.z); H.step(20);
    H.standAt(L.centre.x, L.centre.z); H.step(20);
    H.standAt(out.x, out.z); H.step(20);
    offTap();
    return { ep, seen: seen.filter((s) => s.evt === 'store:enter' || s.evt === 'walkout'), listeners: H.listeners(o) };
  });
  const enter = three.seen.find((s) => s.evt === 'store:enter'), walk = three.seen.find((s) => s.evt === 'walkout');
  result('3 the door: in gives store:enter { ep }, out gives walkout { ep }, both taken in', enter && walk && enter.ep === three.ep && walk.ep === three.ep && enter.how === 'in' && walk.how === 'in' && three.seen.indexOf(enter) < three.seen.indexOf(walk) && three.listeners === 2, three);

  // 4 a trip with two carries back to back, logged by the real trip.js (the stats' carry set as the walker would)
  const four = await page.evaluate(async () => {
    const g = window.__game, H = window.__k1b, F = g.storySeams.feed, t = g.trip, st = t.stats, w = g.world, seen = [];
    const offTap = F.tap((evt, d, how) => seen.push({ evt, d, how }));
    const pick = (from) => { for (let i = from; i < w.portages.length; i++) if (w.portages[i] && w.portages[i].name) return i; return -1; };
    const a = pick(10), b = pick(a + 1);
    const n0 = t.book.trips.length;
    t.start({ ep: g.profile.home, foodDays: 1, canoe: 'aluminium' });
    H.step(4);
    const cross = (i) => { const def = w.portages[i]; st.carried = { name: def.name, rods: def.rods, def }; st.portages++; H.step(3); st.carried = null; H.step(2); };
    cross(a); cross(b);
    const log = (t.state.log || []).filter((e) => e.k === 'portage').map((e) => ({ i: e.i, name: e.name, rods: e.rods }));
    t.close('completed', 'came in', g.profile.home);
    H.step(2);
    offTap();
    return { a, b, n0, log, ev: seen.map((s) => ({ evt: s.evt, ...s.d, how: s.how })).filter((s) => /^(trip:|carry)/.test(s.evt)) };
  });
  const carries = four.ev.filter((e) => e.evt === 'carry'), pairs = four.ev.filter((e) => e.evt === 'carrypair'), ts = four.ev.find((e) => e.evt === 'trip:start'), te = four.ev.find((e) => e.evt === 'trip:end');
  result('4a trip.js logs each portage with its index into world.portages', four.log.length === 2 && four.log[0].i === four.a && four.log[1].i === four.b, four.log);
  result('4b carry { i, rods, trip, seq } for each, seq 1 and 2', carries.length === 2 && carries[0].i === four.a && carries[1].i === four.b && carries[0].seq === 1 && carries[1].seq === 2 && carries[0].trip === four.n0 + 1, carries);
  result('4c one carrypair { a, b } for the two back to back', pairs.length === 1 && pairs[0].a === four.a && pairs[0].b === four.b, pairs);
  result('4d trip:start { n, ep } and trip:end { n, outcome }', ts && te && ts.n === four.n0 + 1 && te.n === ts.n && te.outcome === 'completed', { ts, te });

  // 5 a co-op guest (the role set for one synchronous moment, no frame stepped) and mirror mode
  const five = await page.evaluate(() => {
    const g = window.__game, F = g.storySeams.feed, o = g.outfitter, c = g.coop, s0 = F.stats(), role = c.role;
    const got = []; const offTap = F.tap((evt, d, how) => got.push(`${evt}:${how}`));
    c.role = 'guest';
    try { o.emit('walkout', { ep: 31 }); o.emit('store:enter', { ep: 31 }); F.emit('lake', { id: 1 }); } finally { c.role = role; }
    const mode = g.story.mode; g.story.mode = 'mirror';
    try { F.emit('lake', { id: 2 }); o.emit('walkout', { ep: 31 }); } finally { if (mode === undefined) delete g.story.mode; else g.story.mode = mode; }
    offTap();
    const s1 = F.stats();
    return { got, guest: s1.dropped.guest - s0.dropped.guest, mirror: s1.dropped.mirror - s0.dropped.mirror, role: c.role };
  });
  result('5 a guest: walkout and store:enter dropped, a lake taken in; mirror mode drops all', five.got.join() === 'walkout:guest,store:enter:guest,lake:in,lake:mirror,walkout:mirror' && five.guest === 2 && five.mirror === 2 && five.role === null, five);

  result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('the run', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
