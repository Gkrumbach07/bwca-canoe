// Co-op round 3: two canoes, either one (src/coop-boat.js). The owner: "You can't get into, paddle or carry a friend's
// canoe yet (canoes are shared items)". Two browsers at one campsite's shore:
//   0. two canoes beached, each drawn on both screens where its own screen has it
//   1. the guest pushes off the host's beached canoe and gets in (the dot's verbs, a swap asked of the host) and paddles
//      off: the host sees it go, and the host's own screen now drives the other canoe (the guest's, where it lay)
//   2. the load rides along: what was in the host's canoe is in it on both screens
//   3. the guest shoulders the host's set-down canoe (unloaded first), carries it and sets it down elsewhere: the host sees
//      it there; the host's ask for it while it is on the guest's shoulders is refused
//   4. the host gets back into it; the guest's ask while the host paddles it is refused
//   5. the host capsizes; the guest, swimming, rights it and climbs in; the host is left swimming, the other canoe theirs
//   6. after each: two canoes, never one, never three, and the load counted once
//   7. the guest reloads and Rejoins: back where they stood by the canoe where they set it down, its load in it; the host's
//      canoe where it was
//   APP=http://localhost:5301 RELAY=ws://localhost:8801 node scripts/coop/boat.mjs [--out dir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5301';
const RELAY = process.env.RELAY || 'ws://localhost:8801';
const OUT = path.resolve(arg('out', 'coop-boat-out'));
mkdirSync(OUT, { recursive: true });

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
const launch = () => chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const browsers = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more)); };
const watch = (page, name) => {
  page.on('pageerror', (e) => log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /coop/i.test(m.text())) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
};
const loaded = (page) => page.waitForFunction(() => window.__game && window.__game.coop && window.__game.title && window.__game.coopBoat && window.__game.coopGive, null, { timeout: 240000, polling: 500 });
async function openGame(name, query = '') {
  const browser = await launch(); browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  watch(page, name);
  await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${query}`, { timeout: 240000, waitUntil: 'domcontentloaded' });
  await loaded(page);
  log(`[${name}] game loaded`);
  return page;
}
const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
const OWNER = /Gage|Ada|’s |their |your |mine|yours/i;
const D = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity);

// this screen: its own canoe (afloat under it, overhead, capsized, set down), the friend's as drawn, the load
const snap = (page) => page.evaluate(() => {
  const g = window.__game, p = g.player, inv = g.inventory, b = g.coopBoat;
  const d = p.carry && p.carry.drop, over = p.mode === 'swim' && p.swim && p.swim.hull;
  const own = p.mode === 'paddle' || p.mode === 'carry' ? { x: p.x, z: p.z, k: p.mode } : over ? { x: over.cx, z: over.cz, k: 'over' } : d ? { x: d.x, z: d.z, k: 'down' } : null;
  const r = [...g.coop.remotes.values()][0], s = r && r.seen;
  const friend = !r || !s ? null : s.m === 'paddle' || s.m === 'carry' ? { x: s.x, z: s.z, k: s.m } : r.boat && !r.boat.hidden ? { x: r.boat.x, z: r.boat.z, k: r.boat.over ? 'over' : 'down' } : null;
  const load = inv.containers.filter((c) => c.where === 'canoe').map((c) => c.item).sort();
  const longs = inv.long.filter((l) => l.where === 'canoe').map((l) => l.id).sort();
  const f = [...g.coopShare.friends.values()][0];
  const theirs = f ? f.mirror.containers.filter((c) => c.where === 'canoe').map((c) => c.item).sort() : null;
  return { mode: p.mode, me: { x: p.x, z: p.z }, own, friend, load, longs, theirs, stats: b.stats() };
});
// both screens agree: two canoes each, apart, each where its own screen has it, and the load counted once
async function two(A, B, total) {
  await sleep(900);
  const a = await snap(A), b = await snap(B);
  const ok = !!(a.own && a.friend && b.own && b.friend) && D(a.own, a.friend) > 1.5 && D(b.own, b.friend) > 1.5 && D(a.own, b.friend) < 2.5 && D(b.own, a.friend) < 2.5 && a.load.length + b.load.length === total;
  return { ok, host: { own: a.own, friend: a.friend, load: a.load.length }, guest: { own: b.own, friend: b.friend, load: b.load.length }, total };
}
// the dot on the friend's canoe, from where this walker stands: { e, q, label } (each verb's word and why)
const dotOn = (page, peer) => page.evaluate((peer) => {
  const g = window.__game, b = g.coopBoat, p = g.player, f = g.coopShare.friends.get(peer), s = f && b.hullOf(f);
  if (!s) return { none: true, cn: f && f.pub && f.pub.cn };
  const near = { reach: 3, flat: (x, z) => Math.hypot(x - p.x, z - p.z), sphere: () => null, segment: () => null, box: (bx) => (Math.hypot(bx.x - s.x, bx.z - s.z) < 0.5 ? { t: 1, miss: 0 } : null) };
  const t = b.targets(null, near).find((q) => q.target.ref === `canoe:${peer}`);
  if (!t) return { none: true, s };
  const v = (a) => (a ? { verb: a.verb, why: a.why || null, held: !!a.held } : null);
  return { label: t.target.label, e: v(t.target.e), q: v(t.target.q) };
}, peer);
// press the dot's key on the friend's canoe (held, for a push: E stays down until it floats), then get in if it floats
async function useDot(page, peer, key = 'KeyE') {
  const r = await page.evaluate(({ peer, key }) => {
    const g = window.__game, b = g.coopBoat, p = g.player, f = g.coopShare.friends.get(peer), s = f && b.hullOf(f);
    if (!s) return { none: true };
    const near = { reach: 3, flat: (x, z) => Math.hypot(x - p.x, z - p.z), sphere: () => null, segment: () => null, box: (bx) => (Math.hypot(bx.x - s.x, bx.z - s.z) < 0.5 ? { t: 1, miss: 0 } : null) };
    const t = b.targets(null, near).find((q) => q.target.ref === `canoe:${peer}`);
    const a = t && (key === 'KeyE' ? t.target.e : t.target.q);
    if (!a || a.why) return { verb: a && a.verb, why: a && a.why };
    if (a.held) p.input.down.add(key);
    const ran = a.run({ key, keys: [key, 'Mouse0'], from: 'dot' });
    return { verb: a.verb, held: !!a.held, ran };
  }, { peer, key });
  if (!r.ran) return r;
  await until(page, () => !window.__game.coopBoat.pending, null, 8000).catch(() => null);
  r.after = await page.evaluate((key) => {
    const g = window.__game, p = g.player, pk = g.packs;
    for (let i = 0; i < 300 && (pk.push || (g.hold && g.hold.active)); i++) g.step(1 / 30, 1);
    p.input.down.delete(key);
    g.step(1 / 30, 2);
    const a = pk.hullAction();
    if (p.mode === 'walk' && a && a.e && a.e.verb === 'Get in' && !a.e.why) a.e.run({ key: 'KeyE' });
    g.step(1 / 30, 3);
    return { mode: p.mode, log: g.coopBoat.stats().log };
  }, key);
  return r;
}
// a spot on land beside the hull at d (or a point on the bank), the walker standing there with their own canoe kept
const besideHull = (page, d) => page.evaluate((d) => {
  const g = window.__game, p = g.player, w = g.world, h = d.heading || 0, rx = Math.sin(h), rz = Math.cos(h), fx = Math.cos(h), fz = -Math.sin(h);
  for (const t of [0, 0.8, -0.8, 1.4]) for (const side of [1, -1]) for (const off of [1.1, 1.5, 1.9]) {
    const x = d.x + rx * side * off + fx * t, z = d.z + rz * side * off + fz * t;
    if (w.isReady(x, z) && w.shoreAt(x, z) > 0.35) { const own = p.carry && p.carry.drop; if (p.standAt({ x, z, heading: h, drop: own })) { g.step(1 / 30, 3); return { x, z }; } }
  }
  return null;
}, d);

try {
  // --- the host: Sandbox at Lake One, the trip open; the guest joins ---------------------------------------------------------
  const A = await openGame('host');
  await A.evaluate(async () => {
    const g = window.__game, t = g.title;
    const ep = g.world.entryPoints.find((e) => e.name === 'Lake One') || g.world.entryPoints[0];
    t.setPick('sandbox');
    await t.newSeason(ep, { confirm: false });
  });
  await until(A, () => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 120000);
  await A.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
  const B = await openGame('guest', `&join=${code}`);
  await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
  await B.fill('#coop-name', 'Ada');
  await B.click('#coop-go');
  await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting && window.__game.coopGive.mine, null, 120000);
  await until(A, () => window.__game.coop.remotes.size === 1, null, 30000);
  const ids = { host: await A.evaluate(() => window.__game.coop.id), guest: await B.evaluate(() => window.__game.coop.id) };
  log('joined', ids);

  // --- to a campsite's shore: two wet points 15–35 m apart, each canoe beached at one -------------------------------------
  const site = await A.evaluate(async () => {
    const g = window.__game;
    g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide();
    const s = g.world.campsites.slice().sort((a, b) => Math.hypot(a.x + 20900, a.z - 19400) - Math.hypot(b.x + 20900, b.z - 19400))[0];
    await g.player.teleport(s.x, s.z);
    g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide();
    g.day.setClock(2026, 190, 10.5); g.day.running = true;
    const w = g.world, wet = [];
    for (let r = 6; r < 120 && wet.length < 80; r += 3) for (let a = 0; a < 48; a++) { const x = s.x + Math.cos(a / 48 * Math.PI * 2) * r, z = s.z + Math.sin(a / 48 * Math.PI * 2) * r, sd = w.shoreAt(x, z); if (sd < -2.5 && sd > -4.5 && w.isReady(x, z)) wet.push({ x, z }); }
    const W1 = wet[0], W2 = wet.find((q) => Math.hypot(q.x - W1.x, q.z - W1.z) > 15 && Math.hypot(q.x - W1.x, q.z - W1.z) < 35);
    // and out where it is over your head (the capsize): 2.5 m of water or more, 10–60 m out from W2
    let W3 = null;
    for (let r = 10; r < 60 && !W3; r += 2) for (let a = 0; a < 36 && !W3; a++) { const x = W2.x + Math.cos(a / 36 * Math.PI * 2) * r, z = W2.z + Math.sin(a / 36 * Math.PI * 2) * r; if (w.isReady(x, z) && w.shoreAt(x, z) < -8 && w.levelAt(x, z) - w.heightAt(x, z) > 2.5) W3 = { x, z }; }
    return { s: { x: s.x, z: s.z }, W1, W2, W3 };
  });
  log('site', site);
  await B.evaluate(async (S) => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); await g.player.teleport(S.W2.x, S.W2.z); }, site);
  const beach = (page, W) => page.evaluate((W) => {
    const g = window.__game, p = g.player;
    for (let i = 0; i < 30 && p.mode !== 'paddle'; i++) g.step(1 / 30, 1);
    p.x = W.x; p.z = W.z; p.stepOut(); g.step(1 / 30, 5);
    const d = p.carry && p.carry.drop;
    return { mode: p.mode, drop: d ? { x: d.x, z: d.z, heading: d.heading } : null };
  }, W);
  const hb = await beach(A, site.W1), gb = await beach(B, site.W2);
  log('beached', hb, gb);
  await until(B, (h) => { const f = window.__game.coopShare.friends.get(h); return !!(f && f.pub && f.pub.cn); }, ids.host, 10000).catch(() => null);
  await until(A, (h) => { const f = window.__game.coopShare.friends.get(h); return !!(f && f.pub && f.pub.cn); }, ids.guest, 10000).catch(() => null);
  const s0a = await snap(A), s0b = await snap(B);
  const TOTAL = s0a.load.length + s0b.load.length;
  const t0 = await two(A, B, TOTAL);
  result('0 two canoes beached, each drawn on both screens where its own screen has it', t0.ok, t0);

  // --- 1 + 2: the guest pushes off the host's canoe, gets in, paddles off; the load with it --------------------------------
  await besideHull(B, hb.drop);
  const dot1 = await dotOn(B, ids.host);
  const u1 = await useDot(B, ids.host, 'KeyE');
  const went = await B.evaluate(() => { const g = window.__game, p = g.player, x0 = p.x, z0 = p.z; p.input.down.add('KeyW'); g.step(1 / 30, 120); p.input.down.delete('KeyW'); g.step(1 / 30, 2); return { mode: p.mode, moved: Math.hypot(p.x - x0, p.z - z0), at: { x: p.x, z: p.z } }; });
  await sleep(1200);
  const s1a = await snap(A), s1b = await snap(B);
  const hostSees = await A.evaluate(() => { const r = [...window.__game.coop.remotes.values()][0]; return { m: r.seen && r.seen.m, boat: { x: r.boat.x, z: r.boat.z }, hidden: r.boat.hidden }; });
  const ownedWord = [dot1.label, dot1.e && dot1.e.verb, dot1.q && dot1.q.verb].filter((x) => x && OWNER.test(x));
  result('1 the guest pushes off and gets into the host’s beached canoe and paddles off; the host sees it go and now drives the other canoe',
    !!(u1.ran && u1.after && u1.after.mode === 'paddle' && went.mode === 'paddle' && went.moved > 2 && hostSees.m === 'paddle' && D(hostSees.boat, s1b.me) < 3 && D(s1a.own, gb.drop) < 1 && D(s1a.own, hb.drop) > 10 && ownedWord.length === 0),
    { dot: dot1, use: u1, went, hostSees, hostOwn: s1a.own, guestOldDrop: gb.drop });
  result('2 the load rides along: what was in the host’s canoe is in it on both screens, and the guest’s old load is the host’s',
    JSON.stringify(s1b.load) === JSON.stringify(s0a.load) && JSON.stringify(s1a.theirs) === JSON.stringify(s0a.load) && JSON.stringify(s1a.load) === JSON.stringify(s0b.load) && JSON.stringify(s1b.longs) === JSON.stringify(s0a.longs),
    { guestNow: s1b.load, hostBefore: s0a.load, hostSeesInIt: s1a.theirs, hostNow: s1a.load, guestBefore: s0b.load, longs: [s0a.longs, s1b.longs] });
  const t1 = await two(A, B, TOTAL);
  result('1b two canoes, the load counted once', t1.ok, t1);

  // --- 3: the guest steps out by the first spot; the host unloads its canoe; the guest shoulders it, carries it, sets it down
  const gOut = await beach(B, site.W1);
  const hNow = await A.evaluate(() => { const d = window.__game.player.carry.drop; return { x: d.x, z: d.z, heading: d.heading }; });
  await besideHull(A, hNow);
  const setOut = await A.evaluate(() => window.__game.packs.setOutAll());
  await sleep(400);
  const TOTAL2 = (await snap(A)).load.length + (await snap(B)).load.length; // (the host's load set out on the ground)
  await besideHull(B, hNow);
  await sleep(900);
  await A.evaluate((g) => { const b = window.__game.coopBoat; b.hullOf(window.__game.coopShare.friends.get(g)); }, ids.guest); // (the host has seen the guest's beached canoe)
  const dot3 = await dotOn(B, ids.host);
  const u3 = await useDot(B, ids.host, dot3.e && dot3.e.verb === 'Shoulder it' ? 'KeyE' : 'KeyQ');
  // the host asks for the canoe now on the guest's shoulders: refused
  await sleep(700);
  const ref3 = await A.evaluate((g) => { const b = window.__game.coopBoat, r0 = b.n.refused, d0 = { ...window.__game.player.carry.drop }; const ok = b.take(g, 'Get in'); return { sent: ok, r0, d0 }; }, ids.guest);
  await until(A, () => !window.__game.coopBoat.pending, null, 8000).catch(() => null);
  const ref3b = await A.evaluate(() => { const b = window.__game.coopBoat, d = window.__game.player.carry.drop; return { refused: b.n.refused, log: b.stats().log.slice(-1)[0], drop: { x: d.x, z: d.z } }; });
  const gMode3 = await B.evaluate(() => window.__game.player.mode);
  result('3a the host’s ask for the canoe on the guest’s shoulders is refused (it is on their body)', ref3.sent && ref3b.refused === ref3.r0 + 1 && gMode3 === 'carry' && D(ref3b.drop, ref3.d0) < 0.01, { ...ref3, ...ref3b, guestMode: gMode3 });
  const carried = await B.evaluate((S) => {
    const g = window.__game, p = g.player, w = g.world, from = { x: p.x, z: p.z };
    // a spot on the bank 10–25 m along, 1.5–3 m up from the water, facing it
    let best = null;
    for (let r = 10; r < 26 && !best; r += 1.5) for (let a = 0; a < 36 && !best; a++) { const x = from.x + Math.cos(a / 36 * Math.PI * 2) * r, z = from.z + Math.sin(a / 36 * Math.PI * 2) * r, sd = w.shoreAt(x, z); if (sd > 1.6 && sd < 2.6 && w.isReady(x, z) && Math.hypot(x - S.W2.x, z - S.W2.z) > 8) best = { x, z }; }
    if (!best) return { none: true };
    const dd = w.deeperDir(best.x, best.z);
    p.x = best.x; p.z = best.z; p.heading = Math.atan2(-dd.z, dd.x); p.foot = null;
    g.step(1 / 30, 3);
    p.dropHull(true); g.step(1 / 30, 4);
    const d = p.carry.drop;
    return { from, to: best, mode: p.mode, drop: { x: d.x, z: d.z, heading: d.heading } };
  }, site);
  await sleep(1300);
  const hostSees3 = await A.evaluate(() => { const r = [...window.__game.coop.remotes.values()][0]; return { boat: { x: r.boat.x, z: r.boat.z }, hidden: r.boat.hidden }; });
  result('3 the guest shoulders the host’s set-down canoe, carries it and sets it down elsewhere: the host sees it there',
    !!(setOut && u3.ran && u3.after && u3.after.mode === 'carry' && carried.drop && carried.mode === 'walk' && D(carried.drop, hNow) > 8 && !hostSees3.hidden && D(hostSees3.boat, carried.drop) < 1.5),
    { setOut, dot: dot3, use: u3, carried, hostSees: hostSees3 });

  // --- 4: the host gets back into it; the guest's ask while the host paddles it is refused --------------------------------
  await besideHull(A, carried.drop);
  // (the paddle was set out with the load at the first spot: the host has it in hand, or Get in is greyed, as alone)
  await A.evaluate(() => { const inv = window.__game.inventory, l = inv.long.find((q) => q.where === 'ground' && (window.__game.items.itemDef(q.id) || {}).long === 'paddle'); if (l) { l.where = 'hands'; l.at = null; l.hand = Math.max(0, inv.freeHand()); inv.emit('long'); } });
  await sleep(500);
  const dot4 = await dotOn(A, ids.guest);
  await B.evaluate((h) => { const b = window.__game.coopBoat; b.hullOf(window.__game.coopShare.friends.get(h)); }, ids.host);
  const u4 = await useDot(A, ids.guest, 'KeyE');
  await sleep(900);
  const ref4 = await B.evaluate((h) => { const b = window.__game.coopBoat; return { r0: b.n.refused, sent: b.take(h, 'Get in') }; }, ids.host);
  await until(B, () => !window.__game.coopBoat.pending, null, 8000).catch(() => null);
  const ref4b = await B.evaluate(() => ({ refused: window.__game.coopBoat.n.refused, log: window.__game.coopBoat.stats().log.slice(-1)[0] }));
  const hMode4 = await A.evaluate(() => window.__game.player.mode);
  result('4 the host gets back into the canoe the guest set down; the guest’s ask while the host paddles it is refused',
    !!(u4.ran && u4.after && u4.after.mode === 'paddle' && hMode4 === 'paddle' && ref4.sent && ref4b.refused === ref4.r0 + 1),
    { dot: dot4, use: u4, ...ref4, ...ref4b, hostMode: hMode4 });
  const t4 = await two(A, B, TOTAL2);
  result('4b two canoes, the load counted once', t4.ok, t4);

  // --- 5: the host capsizes out on the water; the guest swims to it, rights it and climbs in -------------------------------
  const cap = await A.evaluate(async (S) => {
    const g = window.__game, p = g.player;
    p.x = S.W3.x; p.z = S.W3.z; g.step(1 / 30, 2);
    p.capsize(); g.step(1 / 30, 3);
    const h = p.swim && p.swim.hull;
    return { mode: p.mode, hull: h ? { x: h.cx, z: h.cz, heading: h.heading } : null };
  }, site);
  await sleep(1000);
  const sw = await B.evaluate((h) => {
    const g = window.__game, p = g.player, rx = Math.sin(h.heading), rz = Math.cos(h.heading);
    p.x = h.x + rx * 1.7; p.z = h.z + rz * 1.7; p.foot = null; p.enterSwim(); g.step(1 / 30, 3);
    const f = [...g.coopShare.friends.values()][0], s = g.coopBoat.hullOf(f);
    p.input.once.add('KeyE'); g.step(1 / 30, 1);
    return { mode: p.mode, seen: s, prompt: p.prompt && p.prompt.text, pending: g.coopBoat.stats().pending };
  }, cap.hull);
  await until(B, () => !window.__game.coopBoat.pending, null, 8000).catch(() => null);
  const r5 = await B.evaluate(() => { const g = window.__game, p = g.player; g.step(1 / 30, 60); return { mode: p.mode, at: { x: p.x, z: p.z }, log: g.coopBoat.stats().log }; });
  await sleep(1000);
  const h5 = await A.evaluate(() => { const p = window.__game.player, d = p.carry && p.carry.drop; return { mode: p.mode, hull: !!(p.swim && p.swim.hull), drop: d ? { x: d.x, z: d.z } : null }; });
  result('5 the host capsizes; the guest swims to the hull, rights it and climbs in; the host swims, the other canoe theirs',
    !!(cap.hull && sw.seen && sw.seen.over && r5.mode === 'paddle' && D(r5.at, cap.hull) < 3 && h5.mode === 'swim' && !h5.hull && h5.drop && D(h5.drop, gOut.drop) < 1),
    { cap, swim: sw, guest: r5, host: h5, guestOldDrop: gOut.drop });
  const t5 = await two(A, B, TOTAL2);
  result('5b two canoes, the load counted once', t5.ok, t5);

  // --- 6: the guest beaches it and reloads: Rejoin puts them back by it --------------------------------------------------
  const g6 = await beach(B, site.W2);
  await B.evaluate(() => window.__game.coopGive.sendKeep());
  await sleep(800);
  const before6 = await snap(B), host6 = await snap(A);
  await B.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}`, { timeout: 240000, waitUntil: 'domcontentloaded' });
  await loaded(B);
  await sleep(1500);
  await B.click('#btn-rejoin');
  await until(B, () => document.getElementById('coop-go'));
  await B.click('#coop-go');
  await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && window.__game.coopGive.mine, null, 120000);
  await until(B, () => window.__game.coopBoat.n.restored > 0, null, 30000).catch(() => null);
  await sleep(1500);
  const after6 = await snap(B), hostAfter6 = await snap(A);
  result('6 the guest reloads and Rejoins: back by the canoe where they set it down, its load in it; the host’s canoe where it was',
    !!(g6.drop && after6.mode === 'walk' && D(after6.own, g6.drop) < 1 && JSON.stringify(after6.load) === JSON.stringify(before6.load) && D(hostAfter6.own, host6.own) < 0.5 && D(hostAfter6.friend, g6.drop) < 1.5),
    { beached: g6.drop, guest: { mode: after6.mode, own: after6.own, load: [before6.load, after6.load] }, host: { own: [host6.own, hostAfter6.own], sees: hostAfter6.friend }, restored: after6.stats.restored });
  const t6 = await two(A, B, TOTAL2);
  result('6b two canoes after the rejoin, the load counted once', t6.ok, t6);

  await A.screenshot({ path: path.join(OUT, 'host.png') });
  await B.screenshot({ path: path.join(OUT, 'guest.png') });
} catch (e) { log('ERROR', e && e.stack || e); results.push({ name: 'run', pass: false, error: String(e) }); }
finally {
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  for (const b of browsers) await b.close().catch(() => {});
  log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}
