// The game-loop join's co-op rig (src/coop-trip.js on the game loop): two headless Chromiums (one browser process each)
// through `wrangler dev`, an Adventure season at Moose Lake (25). The host buys the group's permit for Snowbank's trailhead
// (27) today; each player takes a notice; a drive to the trailhead is a group jump; the group pushes off from its landing
// under the host's permit; each finishes their notice; everyone up in the lot brings the trip in: the host's tally pays the
// host's notice only, the guest's is paid on the guest's browser; a pickup called at the sign is a group jump, free by
// the outfitter that sold the permit, in at its door.
//   APP=http://localhost:5186 RELAY=ws://localhost:8796 node scripts/coop/game-loop.mjs [--shots dir]
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5186';
const RELAY = process.env.RELAY || 'ws://localhost:8796';
const SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const browsers = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 900)); };
const shot = async (page, name) => { if (SHOTS) { try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch (e) { log('shot', name, e.message); } } };
const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
const HOME = 25, LOT = 27;

const HELPERS = () => {
  const g = window.__game, H = window.__glc = {};
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  return true;
};
async function openGame(name, query = '') {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(browser);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${query}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.coop && window.__game.title && window.__game.coopTrip && typeof window.__game.step === 'function', null, { timeout: 240000, polling: 500 });
  await page.evaluate(HELPERS);
  log(`[${name}] game loaded`);
  return page;
}
const money = (P) => P.evaluate(() => window.__game.profile.money);

try {
  // --- the host: Moose Lake, a June morning; the old gear given (no talk); a permit for Snowbank's trailhead today -------
  const A = await openGame('host');
  await A.evaluate(async (home) => {
    const g = window.__game, t = g.title;
    t.setPick('adventure');
    await t.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: new Date().getFullYear(), doy: 166 } });
  }, HOME);
  await until(A, () => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 120000);
  const bought = await A.evaluate(([home, lot]) => {
    const g = window.__game, o = g.outfitter, P = g.permits;
    if (o.open) o.hide();
    if (g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(home, false); }
    g.profile.s.money += 40; g.profile.changed('money'); // (the drive, the permit and room to spare)
    const r = P.buy({ ep: lot, abs: P.today, at: home });
    return { ok: r.ok, why: r.why, permit: r.permit && { id: r.permit.id, ep: r.permit.ep, from: r.permit.from }, left: P.available(lot, P.today) };
  }, [HOME, LOT]);
  result('the host buys the group\'s permit for the trailhead today at the home desk', bought.ok && bought.permit.ep === LOT && bought.permit.from === HOME, bought);
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));

  // --- the guest joins at the host's store ---------------------------------------------------------------------------------
  const B = await openGame('guest', `&join=${code}`);
  await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
  await B.fill('#coop-name', 'Ada');
  await B.click('#coop-go');
  await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
  await until(B, (ep) => { const g = window.__game, o = g.outfitter; return g.trip.adventure && o.visit && o.visit.ep === ep && !o.arrival && g.player.onFoot && g.coopGive.mine; }, HOME, 90000);
  await B.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); g.profile.s.money += 40; g.profile.changed('money'); });
  result('the guest is in at the host\'s store', true);
  // the owner's call 2026-11-05: a friend joining gets the new player's starting kit, whatever the host owns; nothing of
  // the story (Walt's pack, tent, stove and notebook are the host's); a tent to sleep in; never the counter scene
  const kitOf = (P) => P.evaluate(() => {
    const g = window.__game, inv = g.inventory, ids = new Set();
    for (const c of inv.containers) { ids.add(c.item); for (const e of c.grid || []) ids.add(e.id); }
    for (const l of inv.long || []) ids.add(l.item || l.id);
    const meals = inv.containers.reduce((n, c) => n + (c.grid || []).filter((e) => /^meal:/.test(e.id)).reduce((k, e) => k + (e.qty || 1), 0), 0);
    return { ids: [...ids].filter(Boolean).sort(), meals, money: g.profile.money, pending: g.onboarding.pending(g.outfitter.visit ? g.outfitter.visit.ep : undefined), canTent: g.profile.has('aframe') };
  });
  const [hostKit, guestKit] = await Promise.all([kitOf(A), kitOf(B)]);
  const want = ['pack3', 'aframe', 'pot', 'stove', 'fuel', 'sleepingbag', 'pad', 'tarp', 'tacklebox', 'barrel30', 'ash', 'rod'];
  result('the guest\'s first visit: the new player\'s starting kit, a tent among it, nothing of the story, no counter scene', want.every((id) => guestKit.ids.includes(id)) && !guestKit.ids.some((id) => /^walt/.test(id)) && guestKit.meals >= 6 && !guestKit.pending && guestKit.canTent && hostKit.ids.includes('walttent'), { guest: guestKit, missing: want.filter((id) => !guestKit.ids.includes(id)), host: hostKit.ids });

  // --- a notice each off the host's board -------------------------------------------------------------------------------------
  await until(A, (ep) => window.__game.tasks.board(ep).filter((t) => t && t.status === 'offered').length >= 2, HOME, 90000);
  const offered = await A.evaluate((ep) => window.__game.tasks.board(ep).filter((t) => t && t.status === 'offered').map((t) => ({ id: t.id, title: t.title, kind: t.kind, pay: t.pay })), HOME);
  await until(B, (ids) => { const g = window.__game; return g.coopTrip.mirrored && ids.every((id) => g.tasks.ads.has(id)); }, offered.map((t) => t.id), 30000);
  const mine = offered.find((t) => t.kind !== 'secchi') || offered[0], theirs = offered.find((t) => t.id !== mine.id);
  await B.evaluate(({ id, ep }) => { const g = window.__game; g.outfitter.show(g.outfitter.landing(ep), 'board'); g.tasks.act(`take:${id}`, ep); }, { id: theirs.id, ep: HOME });
  await until(A, (id) => { const t = window.__game.tasks.ads.get(id); return t && t.status === 'open' && t.by === 'Ada'; }, theirs.id, 30000);
  await until(B, (id) => { const t = window.__game.tasks.ads.get(id); return t && t.status === 'open'; }, theirs.id, 30000);
  const hostTook = await A.evaluate((id) => window.__game.tasks.take(id), mine.id);
  await B.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
  result('a notice each: the guest\'s through the host, the host\'s own', hostTook, { host: mine, guest: theirs });

  // --- the drive to the trailhead: a group jump (proposed by the guest at the counter) ---------------------------------------
  const m0 = await Promise.all([money(A), money(B)]);
  await B.evaluate(([home, lot]) => { const g = window.__game, o = g.outfitter; o.show(o.landing(home)); return g.rides.take(lot); }, [HOME, LOT]);
  await until(A, () => !!window.__game.coopTrip.prop, null, 40000);
  const prop1 = await A.evaluate(() => ({ kind: window.__game.coopTrip.prop.kind, card: (document.getElementById('coop-jump') || {}).innerText }));
  await A.evaluate(() => window.__game.coopTrip.tick(true));
  const inLot = (P) => until(P, (lot) => { const g = window.__game, p = g.player, h = g.trailhead.trailheadAt(p.x, p.z); return !p.teleporting && !(g.veil && g.veil.active) && !g.coopTrip.jumping && !g.outfitter.arrival && h && h.L.ep === lot; }, LOT, 120000);
  await Promise.all([inLot(A), inLot(B)]);
  await sleep(1500);
  const m1 = await Promise.all([money(A), money(B)]);
  result('a drive to a trailhead is a group jump: both in its lot, each paid', prop1.kind === 'ride' && m0[0] - m1[0] > 0 && m0[1] - m1[1] > 0, { prop1, paid: [m0[0] - m1[0], m0[1] - m1[1]] });
  await shot(A, 'coop-lot');

  // --- the group pushes off from the trailhead's landing: the host's permit ---------------------------------------------------
  await A.evaluate(async (lot) => {
    const g = window.__game, o = g.outfitter, T = g.trailhead.trailheadLayout(lot), p = g.player;
    o.port = o.entry(lot);
    await p.teleport(T.water.x + T.d.x * 60, T.water.z + T.d.z * 60);
    // (then out onto the lake, far enough to be a trip: the outfitter's AWAY)
    const e = o.entry(lot), lake = g.world.lakes[e.lake - 1], dx = lake.cx - e.x, dz = lake.cz - e.z, d = Math.hypot(dx, dz) || 1, r = Math.min(500, d);
    for (let i = 0; i < 200 && p.teleporting; i++) await new Promise((res) => setTimeout(res, 50));
    await p.teleport(e.x + (dx / d) * r, e.z + (dz / d) * r);
  }, LOT);
  await until(A, () => window.__game.trip.active, null, 30000);
  await until(B, () => window.__game.trip.active, null, 30000);
  const trip = await A.evaluate(() => { const s = window.__game.trip.state; return { permit: s.permit && { id: s.permit.id, ep: s.permit.ep, from: s.permit.from }, dayUse: s.dayUse, from: s.from }; });
  result('the group\'s trip pushes off from the trailhead under the host\'s permit, on both screens', trip.permit && trip.permit.id === bought.permit.id && !trip.dayUse, trip);
  // the guest out on the water too (away from the lot, so the trip is a trip)
  await B.evaluate(async (lot) => { const g = window.__game, e = g.outfitter.entry(lot), lake = g.world.lakes[e.lake - 1], dx = lake.cx - e.x, dz = lake.cz - e.z, d = Math.hypot(dx, dz) || 1, r = Math.min(450, d); await g.player.teleport(e.x + (dx / d) * r + 20, e.z + (dz / d) * r); }, LOT);
  await until(A, () => window.__game.outfitter.trip.away, null, 30000);
  await until(B, () => !window.__game.player.teleporting, null, 30000);
  await sleep(1500);
  // the owner's call 2026-11-05: one permit covers the whole group, however many: the guest holds none, buys none, and is
  // never on day use or fined; nothing in the permit or the group trip counts heads
  const gp = await B.evaluate(() => { const g = window.__game, P = g.permits; return { held: P.held().length, active: g.trip.active, dayUse: !!g.trip.state.dayUse, fined: !!g.trip.state.fined, owed: P.owed() }; });
  const hp = await A.evaluate(() => { const g = window.__game, P = g.permits; return { held: P.held().map((p) => ({ id: p.id, ep: p.ep })), used: (P.s.used || []).length, remotes: g.coop.remotes.size }; });
  result('one permit covers the group: the guest is on the host\'s permit with none of their own, no day use, nothing owed', gp.active && gp.held === 0 && !gp.dayUse && !gp.fined && gp.owed === 0 && hp.remotes >= 1, { guest: gp, host: hp });

  // --- each finishes their notice on the trip --------------------------------------------------------------------------------
  await A.evaluate((id) => { const T = window.__game.tasks, t = T.ads.get(id); t.status = 'done'; T.changed(); }, mine.id);
  await B.evaluate((id) => { const T = window.__game.tasks, t = T.ads.get(id); t.status = 'done'; T.changed(); }, theirs.id);
  await until(A, (id) => { const t = window.__game.tasks.ads.get(id); return t && t.status === 'done'; }, theirs.id, 30000);

  // --- everyone up in the lot: the trip comes in; the host's tally pays the host's notice; the guest's paid on the guest's ----
  const c0 = await Promise.all([money(A), money(B)]);
  await B.evaluate((lot) => { const g = window.__game, T = g.trailhead.trailheadLayout(lot); window.__glc.standAt(T.lot.x + 2, T.lot.z); }, LOT);
  await sleep(1200);
  await A.evaluate((lot) => { const g = window.__game, T = g.trailhead.trailheadLayout(lot); window.__glc.standAt(T.lot.x - 2, T.lot.z); }, LOT);
  await until(A, () => !window.__game.trip.active, null, 40000);
  await until(B, () => !window.__game.trip.active, null, 40000);
  await sleep(2500);
  const c1 = await Promise.all([money(A), money(B)]);
  const after = await A.evaluate(([a, b]) => { const g = window.__game, T = g.tasks, card = g.record.s.trips.slice(-1)[0]; return { outcome: g.trip.state.outcome && { k: g.trip.state.outcome.k, ep: g.trip.state.outcome.ep }, hostHas: T.ads.has(a), guestsLeft: T.ads.has(b), tally: card && card.tally ? card.tally.pay.map((l) => l.title) : null }; }, [mine.id, theirs.id]);
  const guestHas = await B.evaluate((id) => window.__game.tasks.ads.has(id), theirs.id);
  result('out in the lot together: the host\'s tally pays the host\'s notice only, the guest\'s is paid to the guest',
    after.outcome && after.outcome.ep === LOT && c1[0] - c0[0] === mine.pay && c1[1] - c0[1] === theirs.pay && !after.hostHas && !after.guestsLeft && !guestHas && (after.tally || []).length === 1,
    { ...after, paid: { host: c1[0] - c0[0], guest: c1[1] - c0[1] }, pays: { host: mine.pay, guest: theirs.pay }, guestHas });
  await Promise.all([A, B].map((P) => P.evaluate(() => { const g = window.__game; if (g.record.shown && g.record.hide) g.record.hide(); })));
  await shot(B, 'coop-came-out');

  // --- the pickup: a group jump, free by the outfitter that sold the permit, in at its door -----------------------------------
  const p0 = await Promise.all([money(A), money(B)]);
  await A.evaluate(([lot, home]) => window.__game.rides.callPickup(lot, home), [LOT, HOME]);
  await until(B, () => !!window.__game.coopTrip.prop, null, 40000);
  const prop2 = await B.evaluate(() => ({ kind: window.__game.coopTrip.prop.kind, card: (document.getElementById('coop-jump') || {}).innerText }));
  await shot(B, 'coop-pickup-card');
  await B.evaluate(() => window.__game.coopTrip.tick(true));
  const home = (P) => until(P, (ep) => { const g = window.__game, o = g.outfitter; return o.visit && o.visit.ep === ep && !o.arrival && !g.player.teleporting && !(g.veil && g.veil.active) && !g.coopTrip.jumping; }, HOME, 120000);
  await Promise.all([home(A), home(B)]);
  const p1 = await Promise.all([money(A), money(B)]);
  const last = await Promise.all([A, B].map((P) => P.evaluate(() => window.__game.rides.last)));
  result('a pickup at the sign is a group jump: both in at the outfitter\'s door, free for the host (its permit)', prop2.kind === 'pickup' && p0[0] - p1[0] === 0 && last[0] && last[0].pickup && last[1] && last[1].pickup,
    { prop2, paid: { host: p0[0] - p1[0], guest: p0[1] - p1[1] }, last });
  await shot(A, 'coop-home');
} catch (e) { log('ERROR', e && e.stack || e); results.push({ name: 'run', pass: false }); }
finally {
  for (const b of browsers) await b.close().catch(() => {});
  log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
  process.exitCode = results.every((r) => r.pass) ? 0 : 1;
}
