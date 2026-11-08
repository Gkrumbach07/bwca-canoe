// The game-loop join (docs/build/game-loop-brief.md, "Joining"): the new-player path played through the five streams
// at once, in one headless Chromium against a running Vite:
//   start map (C, on B's outfitters) → the home counter's talk and the old gear (C) → the first permit, free (A's grant)
//   → the store's people are the parties booked that day (E on A's calendar) → a notice taken, pushed off with the permit
//   (A, B) → a night in the old tent finds the notebook (C) → come out in a trailhead's lot (B) → the tally pays the
//   notice (D) → a free pickup by the outfitter that sold the permit (B on A) → in at its door.
//   APP=http://localhost:5186 node scripts/gl-join-test.mjs [--shots dir]
// Exit code 0 when every check passes.
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5186';
const SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 700)); };
const shot = async (page, name) => { if (SHOTS) { try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch (e) { log('shot', name, e.message); } } };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
const HOME = 25, LOT = 27; // Moose Lake; Snowbank's trailhead, in Moose Lake's reach

const HELPERS = () => {
  const g = window.__game, H = window.__glj = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.goto = async (x, z) => { const ok = await g.outfitter.onTeleport(x, z); await H.settle(); return ok; };
  H.built = async (ep, ms = 60000) => { const t0 = performance.now(); for (;;) { if (g.props.storeLayout(ep) || g.trailhead.trailheadLayout(ep)) return true; if (performance.now() - t0 > ms) return false; H.step(15); await H.wait(40); } };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  H.veilDone = async (ms = 60000) => { const t0 = performance.now(); while (((g.veil && g.veil.active) || g.rides.busy || g.camp.night) && performance.now() - t0 < ms) { H.step(10, 1 / 10); await H.wait(20); } };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.onboarding && window.__game.permits && window.__game.trailhead && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
  log('game loaded');

  // --- the start map: B's fourteen outfitters as pins; Moose Lake picked; July 10 -----------------------------------------
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(500);
  const pins = await page.evaluate(() => [...document.querySelectorAll('.startmap .pin')].map((b) => Number(b.dataset.ep)));
  const outs = await page.evaluate(() => window.__game.outfitters.OUTFITTER_EPS.slice());
  result('start map: one pin per outfitter (B\'s)', pins.length === outs.length && outs.every((e) => pins.includes(e)), { pins: pins.length, outs: outs.length });
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); window.__glj.step(60); });

  // --- the store's people are the day's booked parties (E's visitors, A's calendar, one schedule) ------------------------
  const people = await page.evaluate((home) => {
    const g = window.__game, P = g.permits, today = P.today, ent = g.parties.entering(home, today), ids = new Set(ent.map((p) => String(p.id)));
    // the hour before the day's first put-in, when the first crews are in the store
    const first = ent.map((p) => p.putIn).filter(Number.isFinite).sort((a, b) => a - b)[0];
    if (Number.isFinite(first)) g.day.setClock(g.day.year, g.day.doy, Math.max(6, first - 0.75));
    window.__glj.step(30);
    const roster = g.npcs.roster(home) || [], members = roster.filter((v) => v.partyId != null).map((v) => String(v.partyId));
    const a = P.available(home, today);
    return { entering: ent.length, members: [...new Set(members)], strangers: members.filter((id) => !ids.has(id)), booked: a.booked, quota: a.quota, left: a.left, firstPutIn: first };
  }, HOME);
  result('the store\'s party people are the parties going in today, and the calendar counts them booked', people.strangers.length === 0 && people.booked >= people.entering, people);

  // --- the home counter: the summer help's talk, the old gear, the first permit (A's grant through C) ---------------------
  await page.evaluate(() => { const g = window.__game, L = g.outfitter.layout(g.profile.home), p = g.player, at = L.counter || L.centre; window.__glj.standAt(at.x, at.z); g.day.setClock(g.day.year, g.day.doy, 9); window.__glj.step(30); });
  const counter = await page.evaluate(async () => {
    const g = window.__game, o = g.outfitter, d = g.npcs.dialogue, m0 = g.profile.money;
    o.openHot('counter', o.visit.landing);
    const talking = d.talking, said = [];
    for (let i = 0; i < 10 && d.convo; i++) { said.push(d.convo.node.say); d.choose(0); await window.__glj.wait(30); }
    const P = g.permits, held = P.held().map((p) => ({ id: p.id, ep: p.ep, abs: p.abs, from: p.from, price: p.price }));
    const inv = g.profile.inventory, pack = inv.containers.find((c) => c.item === 'waltpack');
    return { talking, said: said.length, done: g.onboarding.state.done, held, today: P.today, money: g.profile.money - m0, pack: pack && pack.where, inPack: pack ? pack.grid.map((e) => e.id) : [], counterOpen: o.open };
  });
  const first = counter.held.find((p) => p.ep === HOME && p.abs === counter.today);
  result('the counter: the staffer\'s talk, the old gear in the canoe, a $0 first permit at home today from home', counter.talking && counter.done && counter.pack === 'canoe' && counter.inPack.includes('walttent') && first && first.from === HOME && first.price === 0 && counter.money === 0, counter);
  await shot(page, 'join-counter');

  // --- a notice off the board, then pushed off with the permit ------------------------------------------------------------
  const pushed = await page.evaluate(async (home) => {
    const g = window.__game, o = g.outfitter, T = g.tasks;
    if (o.open) o.hide();
    // (a board's notices are written a few frames after it is first asked for)
    let ad = null;
    for (let k = 0; k < 40 && !ad; k++) { ad = T.board(home).find((t) => t && t.status === 'offered') || null; if (!ad) { window.__glj.step(5); await window.__glj.wait(100); } }
    const took = ad ? T.take(ad.id) : false;
    const l = o.landing(home), lake = g.world.lakes[l.lake - 1];
    o.port = l;
    const dx = lake.cx - l.x, dz = lake.cz - l.z, dd = Math.hypot(dx, dz) || 1, r = Math.min(400, dd);
    await g.player.teleport(l.x + (dx / dd) * r, l.z + (dz / dd) * r);
    await window.__glj.settle(); window.__glj.step(30);
    const s = g.trip.state;
    return { took, notice: ad ? { id: ad.id, title: ad.title, pay: ad.pay, kind: ad.kind } : null, active: g.trip.active, permit: s.permit, dayUse: s.dayUse };
  }, HOME);
  result('pushed off with the first permit: not day use, sold by home', pushed.active && pushed.permit && pushed.permit.id === first.id && pushed.permit.from === HOME && !pushed.dayUse && pushed.took, pushed);

  // --- the night in the old tent at a free site: the notebook ------------------------------------------------------------
  const site = await page.evaluate(async (home) => {
    const g = window.__game, H = window.__glj, l = g.outfitter.landing(home);
    const near = g.world.campsites.map((c) => ({ c, d: Math.hypot(c.x - l.x, c.z - l.z) })).filter((q) => q.d > 600 && q.d < 6000).sort((a, b) => a.d - b.d).slice(0, 10);
    for (const { c } of near) {
      if (!g.campsites.isFree(g.campsites.key(c))) continue;
      await g.player.teleport(c.x, c.z); await H.settle();
      for (let i = 0; i < 40 && !c.layout; i++) { H.step(10); await H.wait(80); }
      if (c.layout && c.layout.pad && g.campsites.isFree(g.campsites.key(c))) return { i: g.world.campsites.indexOf(c) };
    }
    return null;
  }, HOME);
  if (!site) throw new Error('no free campsite with a layout near home');
  const pitched = await page.evaluate((i) => {
    const g = window.__game, c = g.world.campsites[i], L = c.layout, inv = g.profile.inventory, p = g.player, camp = g.camp, pad = L.pad;
    p.standAt({ x: pad.x + pad.fdx * 2.2, z: pad.z + pad.fdz * 2.2, heading: Math.atan2(-pad.fdx, pad.fdz), drop: { x: L.fire.x + 1.5, z: L.fire.z + 1.5, heading: 0 } });
    const pack = inv.containers.find((k) => k.item === 'waltpack'); pack.where = 'ground'; pack.at = { x: pad.x + pad.fdx * 1.6, z: pad.z + pad.fdz * 1.6 }; inv.emit('containers');
    window.__glj.step(30);
    const tent = camp.tentInReach(); if (!tent) return { error: 'no tent in reach' };
    let s = null;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1.5, 1.5], [-1.5, -1.5]]) { s = camp.ghostAt(c, tent.def.id, pad.x + dx, pad.z + dz, pad.fdx, pad.fdz); if (s && s.ok) break; }
    if (!s || !s.ok) return { error: `no spot: ${s && s.why}` };
    camp.stake(s, tent, c); if (!camp.camp) return { error: 'not staked' };
    camp.setStage(camp.camp, 4); camp.pitched();
    return { item: camp.camp.item };
  }, site.i);
  await page.evaluate(() => { const g = window.__game; g.energy.value = 1; g.day.setClock(g.day.year, g.day.doy, 21.5); g.camp.sleep('tent', 'first'); });
  for (let k = 0; k < 40; k++) { await page.evaluate(() => window.__glj.step(60)); const busy = await page.evaluate(() => { const g = window.__game; return g.veil.active || !!g.camp.night; }); if (!busy) break; }
  const night = await page.evaluate(() => { const g = window.__game; return { found: g.story.state.notebook.found, notebooks: g.profile.inventory.count('waltnotebook', { reachable: false }), active: g.trip.active, hours: +g.day.hours.toFixed(2), fines: g.permits.owed() }; });
  result('a night in the old tent: the notebook, the trip goes on, no fine (a permit, not day use)', pitched.item === 'walttent' && night.found && night.notebooks === 1 && night.active && night.fines === 0, { pitched, night });

  // --- the notice done on the trip; out at Snowbank's trailhead lot: the tally pays it ------------------------------------
  const out = await page.evaluate(async ([lot, id]) => {
    const g = window.__game, H = window.__glj, o = g.outfitter, T = g.tasks, t = T.ads.get(id), m0 = g.profile.money;
    if (t) { t.status = 'done'; T.changed(); }
    const TL = g.trailhead.trailheadLayout(lot) || (await (async () => { const e = o.entry(lot); await H.goto(e.x, e.z); await H.built(lot); return g.trailhead.trailheadLayout(lot); })());
    await H.goto(TL.water.x, TL.water.z);
    H.standAt(TL.landing.x - TL.d.x * 1.5, TL.landing.z - TL.d.z * 1.5); H.step(30);
    const atLanding = g.trip.active;
    H.standAt(TL.lot.x, TL.lot.z); H.step(30);
    for (let k = 0; k < 30 && !g.record.shown; k++) { H.step(30); await H.wait(30); }
    const c = g.record.s.trips.slice(-1)[0];
    return { atLanding, active: g.trip.active, outcome: g.trip.state.outcome, shown: !!g.record.shown, paid: g.profile.money - m0, pay: t ? t.pay : null, tally: c && c.tally ? { pay: c.tally.pay, total: c.tally.total } : null, lastLot: o.lastLot };
  }, [LOT, pushed.notice && pushed.notice.id]);
  await page.waitForTimeout(1500); await page.evaluate(() => window.__glj.step(30));
  await shot(page, 'join-tally');
  result('out in the trailhead\'s lot (not at its landing): the trip ends there and the tally pays the notice', out.atLanding && !out.active && out.outcome && out.outcome.ep === LOT && out.shown && out.paid === out.pay && out.pay > 0, out);
  await page.evaluate(() => { const g = window.__game; if (g.record.shown && g.record.hide) g.record.hide(); window.__glj.step(10); });

  // --- the pickup: free by Moose Lake (it sold the permit; 27 is in its reach), in at its door ---------------------------
  const pick = await page.evaluate(async ([lot, home]) => {
    const g = window.__game, H = window.__glj, o = g.outfitter, rows = g.rides.pickups(lot), m0 = g.profile.money, h0 = g.day.doy * 24 + g.day.hours;
    o.showPickup(o.entry(lot)); H.step(5);
    const paper = !!(o.el && o.el.panel && /pickup/i.test(o.el.panel.textContent));
    const p = g.rides.callPickup(lot, home);
    await H.veilDone(); await p; await H.settle(); await H.built(home);
    for (let i = 0; i < 80 && o.arrival; i++) { H.step(10); await H.wait(30); }
    return { seller: g.rides.seller(), free: (rows.find((r) => r.by === home) || {}).free, paper, paid: m0 - g.profile.money, hours: +((g.day.doy * 24 + g.day.hours) - h0).toFixed(2), visit: o.visit && o.visit.ep, last: g.rides.last };
  }, [LOT, HOME]);
  result('the pickup from the lot: free by the outfitter that sold the permit, in at its door', pick.seller === HOME && pick.free && pick.paid === 0 && pick.visit === HOME && pick.hours > 0, pick);
  await shot(page, 'join-home');
  result('no page errors', errors.length === 0, { errors });
} catch (e) {
  log('ERROR', e.stack || e.message);
  result('the run finished', false, { error: e.message });
} finally {
  const failed = results.filter((r) => !r.pass);
  log(`${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exitCode = failed.length ? 1 : 0;
}
