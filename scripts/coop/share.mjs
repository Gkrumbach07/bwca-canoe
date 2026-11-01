// The co-op phase 2 rig for the shared world things (src/coop-share.js; docs/plans/coop.md "Phase 2 as designed"): two
// headless Chromiums (one browser process each, as two-browsers.mjs) join one room through `wrangler dev` and meet at a
// campsite in Sandbox. Each step is timed from the action on one screen to what the other screen shows:
//   1 the guest sets a pack down: it appears on the host's screen
//   2 the host takes a thing out of it through the book's bin (its tab's take): gone from the guest, in the host's pack
//   3 the guest puts a thing into the host's pack set down (the bin's drop): in the host's pack
//   4 the host lights a fire: the guest sees it burning, and feeds it a stick through the fire card's fuel bin (the host's)
//   5 a stick the guest picks up is gone on the host's screen
//   6 the host pitches at the site; the guest pitches beside it (one group, one site): the guest's tent on the host's screen
//
//   cd server/room && npx wrangler dev --port 8793 --var DELAY_MS:100
//   npx vite --port 5293
//   APP=http://localhost:5293 RELAY=ws://localhost:8793 node scripts/coop/share.mjs [--out dir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5293';
const RELAY = process.env.RELAY || 'ws://localhost:8793';
const OUT = path.resolve(arg('out', 'coop-share-out'));
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

async function openGame(name, query = '') {
  const browser = await launch(); browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /coop/i.test(m.text())) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${query}`);
  await page.waitForFunction(() => window.__game && window.__game.coop && window.__game.title, null, { timeout: 240000, polling: 500 });
  log(`[${name}] game loaded`);
  return page;
}
const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
// from an action on one page to a condition on another: ms (node's wall clock, polled every 30 ms), or null
async function timed(act, page, cond, a, timeout = 15000) {
  const t0 = Date.now();
  await act();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(cond, a)) return Date.now() - t0;
    await sleep(30);
  }
  return null;
}

try {
  // --- the host: Sandbox, Lake One, on foot at the campsite nearest the basin, the trip open ----------------------------
  const A = await openGame('host');
  await A.evaluate(async () => {
    const g = window.__game, t = g.title;
    const ep = g.world.entryPoints.find((e) => e.name === 'Lake One') || g.world.entryPoints[0];
    t.setPick('sandbox');
    await t.newSeason(ep, { confirm: false });
  });
  await until(A, () => window.__game.title.state === 'game' && !window.__game.player.teleporting);
  await sleep(1500);
  const site = await A.evaluate(async () => {
    const g = window.__game;
    g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide();
    const sites = g.world.campsites.slice().sort((a, b) => Math.hypot(a.x + 20900, a.z - 19400) - Math.hypot(b.x + 20900, b.z - 19400));
    const s = sites[0];
    await g.player.teleport(s.x, s.z);
    g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide();
    g.day.setClock(2026, 190, 17.5); g.day.running = true; // a July evening, dry
    return { x: s.x, z: s.z, name: s.name || null };
  });
  log('[host] site', site);
  await until(A, (s) => { const c = window.__game.camp.nearestSite(s.x, s.z, 80, true); return !!(c && c.layout); }, site, 60000);
  const L = await A.evaluate((s) => {
    const g = window.__game, c = g.camp.nearestSite(s.x, s.z, 80, true), F = c.layout.fire, P = c.layout.pad;
    const p = g.player, a = Math.atan2(P.x - F.x, P.z - F.z);
    // on foot by the ring, the canoe on the ground 6 m off toward the water (where the player came from)
    const ok = p.standAt({ x: F.x + 2.2, z: F.z + 0.4, heading: 0, drop: { x: F.x + Math.sin(a + Math.PI) * 6, z: F.z + Math.cos(a + Math.PI) * 6, heading: 0 } })
      || p.standAt({ x: F.x + 2.2, z: F.z + 0.4, heading: 0, drop: { x: F.x + 3, z: F.z + 3, heading: 0 } });
    g.chase.snap && g.chase.snap();
    return { ok, key: g.camp.registry.key(c), fire: { x: F.x, z: F.z, y: F.y }, pad: { ...P } };
  }, site);
  log('[host] at the ring', L);
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
  log('[host] trip open, code', code);

  // --- the guest: the link, a name, Join ------------------------------------------------------------------------------
  const B = await openGame('guest', `&join=${code}`);
  await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
  await B.fill('#coop-name', 'Ada');
  await B.click('.coop-card .swatch[data-shirt="4"]');
  await B.click('#coop-go');
  await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
  await until(A, () => window.__game.coop.remotes.size === 1);
  await until(B, () => window.__game.coop.remotes.size === 1);
  const ids = { host: await A.evaluate(() => window.__game.coop.id), guest: await B.evaluate(() => window.__game.coop.id) };
  log('joined', ids);
  await until(B, (s) => { const c = window.__game.camp.nearestSite(s.x, s.z, 80, true); return !!(c && c.layout); }, site, 60000);
  const gOk = await B.evaluate((L) => {
    const g = window.__game, p = g.player, F = L.fire;
    if (g.outfitter.open) g.outfitter.hide();
    const ok = p.standAt({ x: F.x - 1.6, z: F.z + 0.8, heading: Math.PI / 2, drop: { x: F.x - 3, z: F.z - 4, heading: 0 } }) || p.standAt({ x: F.x - 1.6, z: F.z + 0.8, heading: Math.PI / 2, drop: { x: F.x - 1, z: F.z + 3, heading: 0 } });
    g.chase.snap && g.chase.snap();
    return { ok, mode: p.mode, x: p.x, z: p.z };
  }, L);
  log('[guest] at the ring', gOk);
  await sleep(2500);
  const pubs = await Promise.all([A.evaluate(() => window.__game.coopShare.stats()), B.evaluate(() => window.__game.coopShare.stats())]);
  log('pubs', JSON.stringify(pubs.map((s) => ({ out: s.pubOut, in: s.pubIn, friends: s.friends }))));

  // --- 1: the guest sets a pack down; the host sees it -----------------------------------------------------------------
  const gPack = await B.evaluate((L) => {
    const g = window.__game, inv = g.inventory;
    const c = inv.containers.find((k) => /^pack/.test(k.item) && k.where !== 'in' && k.grid.some((e) => !e.box)) || inv.containers.find((k) => /^pack/.test(k.item) && k.where !== 'in');
    if (!c) return null;
    return { id: c.id, item: c.item, where: c.where, n: c.grid.length, things: c.grid.filter((e) => !e.box).map((e) => `${e.id}x${e.qty}`) };
  }, L);
  log('[guest] pack', gPack);
  const pid = `p${ids.guest}:${gPack.id}`;
  const ms1 = await timed(() => B.evaluate(({ id, L }) => window.__game.inventory.setDown(id, { x: L.fire.x - 0.4, z: L.fire.z + 2.2, heading: 0.3 }, { force: true }), { id: gPack.id, L }),
    A, (pid) => { const s = window.__game.coopShare; for (const f of s.friends.values()) { const c = f.mirror.cont(pid); if (c && c.where === 'ground') return !!(f.view && f.view.objs.get(pid) && f.view.objs.get(pid).visible); } return false; }, pid);
  result('1 guest’s pack set down appears on the host’s screen (drawn)', ms1 != null, { ms: ms1 });

  // --- 2: the host takes a thing out of it through its tab's bin ----------------------------------------------------------
  await A.evaluate((L) => { const p = window.__game.player; p.x = L.fire.x - 0.2; p.z = L.fire.z + 0.9; }, L); // (a step closer: within 3 m of it)
  await sleep(400);
  const tab = await A.evaluate((pid) => {
    const s = window.__game.coopShare, t = s.tabs().find((q) => q.key === pid), def = window.__game.items.itemDef, area = (i) => { const d = def(i.id) || {}; return (d.w || 1) * (d.h || 1); };
    // (a small thing, not the tent: the guest pitches it in step 6)
    return t ? { label: t.label, sub: t.sub, items: t.bin.items.filter((i) => (def(i.id) || {}).slot !== 'tent').sort((a, b) => area(a) - area(b)).map((i) => ({ uid: i.uid, id: i.id, qty: i.qty })) } : { none: s.tabs().map((q) => q.key) };
  }, pid);
  log('[host] the tab', tab);
  let take = null;
  if (tab.items && tab.items.length) {
    const it = tab.items[0];
    const before = await A.evaluate((id) => window.__game.inventory.count(id, { reachable: false }), it.id);
    take = await A.evaluate(({ pid, it }) => {
      const g = window.__game, inv = g.inventory, s = g.coopShare, t = s.tabs().find((q) => q.key === pid);
      const to = inv.reachable().filter((c) => !['crate', 'pile', 'firefuel', 'grate'].includes(c.item) && !(window.__game.items.itemDef(c.item) || {}).one).find((c) => inv.firstFit(c, it.id));
      const f = to ? inv.firstFit(to, it.id) : null;
      window.__t0 = performance.now();
      const r = t.bin.take({ uid: it.uid, itemId: it.id, toCId: to ? to.id : null, x: f ? f.x : null, y: f ? f.y : null, rot: f ? f.rot : 0, qty: it.qty });
      return { r, to: to ? to.id : null, toItem: to ? to.item : null, pending: s.pending.size, hiddenNow: !s.tabs().find((q) => q.key === pid).bin.items.some((i) => i.uid === it.uid) };
    }, { pid, it });
    log('[host] take', take);
    await until(A, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
    const after = await A.evaluate((id) => window.__game.inventory.count(id, { reachable: false }), it.id);
    const rtt = await A.evaluate(() => window.__game.coopShare.n.rtt.slice(-1)[0]);
    await sleep(600);
    const gone = await B.evaluate(({ id, uid }) => { const c = window.__game.inventory.cont(id); return !c.grid.some((e) => e.uid === uid); }, { id: gPack.id, uid: it.uid.replace(/^p[^:]*:/, '') });
    const inTo = take.to ? await A.evaluate(({ to, id }) => window.__game.inventory.cont(to).grid.some((e) => e.id === id), { to: take.to, id: it.id }) : false;
    result('2 host takes from the guest’s pack through the bin', after - before === it.qty && gone && inTo, { item: it.id, qty: it.qty, hostBefore: before, hostAfter: after, goneFromGuest: gone, inHostPack: take.toItem, roundTripMs: rtt, hiddenWhilePending: take.hiddenNow });
  } else result('2 host takes from the guest’s pack through the bin', false, { why: 'no tab or nothing in it', tab });

  // --- 3: the guest puts a thing into the host's pack set down -----------------------------------------------------------
  const hPack = await A.evaluate((L) => {
    const inv = window.__game.inventory, c = inv.containers.find((k) => /^pack/.test(k.item) && k.where !== 'in' && k.where !== 'ground');
    if (!c) return null;
    inv.setDown(c.id, { x: L.fire.x - 2.4, z: L.fire.z - 0.6, heading: 1.2 }, { force: true });
    return { id: c.id, item: c.item };
  }, L);
  await sleep(1200);
  const hpid = `p${ids.host}:${hPack.id}`;
  const put = await B.evaluate(({ hpid }) => {
    const g = window.__game, inv = g.inventory, s = g.coopShare, t = s.tabs().find((q) => q.key === hpid);
    if (!t) return { none: s.tabs().map((q) => q.key) };
    // something small of ours: a snack, a lure, anything a pack takes
    let src = null, e = null;
    const def = window.__game.items.itemDef, small = (x) => { const d = def(x.id) || {}; return !x.box && !x.fixed && d.kind !== 'container' && d.slot !== 'tent' && (d.w || 1) * (d.h || 1) <= 2; };
    for (const c of inv.reachable()) { if (c.item === 'firefuel' || c.item === 'grate') continue; const q = c.grid.find(small); if (q) { src = c; e = q; break; } }
    if (!e) return { none: 'nothing of ours' };
    window.__putQ = { id: e.id, qty: 1 };
    const before = inv.count(e.id, { reachable: false });
    const r = t.bin.drop({ cId: src.id, uid: e.uid, itemId: e.id, qty: 1 });
    return { r, id: e.id, before, afterLocal: inv.count(e.id, { reachable: false }), pendingShown: s.tabs().find((q) => q.key === hpid).bin.items.some((i) => String(i.uid).startsWith('pend:')) };
  }, { hpid });
  log('[guest] put', put);
  if (put.id) {
    const hBefore = await A.evaluate(({ id, cid }) => window.__game.inventory.cont(cid).grid.filter((e) => e.id === id).reduce((n, e) => n + e.qty, 0), { id: put.id, cid: hPack.id });
    await until(B, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
    const rtt = await B.evaluate(() => window.__game.coopShare.n.rtt.slice(-1)[0]);
    const hAfter = await A.evaluate(({ id, cid }) => window.__game.inventory.cont(cid).grid.filter((e) => e.id === id).reduce((n, e) => n + e.qty, 0), { id: put.id, cid: hPack.id });
    const gAfter = await B.evaluate((id) => window.__game.inventory.count(id, { reachable: false }), put.id);
    result('3 guest puts a thing into the host’s pack', put.r && put.r.ok && gAfter === put.before - 1, { item: put.id, guestBefore: put.before, guestAfter: gAfter, hostPackHasIt: hAfter, hostHadBefore: hBefore, roundTripMs: rtt, pendingShown: put.pendingShown });
  } else result('3 guest puts a thing into the host’s pack', false, put);

  // --- 4: the host lights a fire; the guest sees it and feeds it a stick into the host's bin ------------------------------
  const fireMs = await timed(() => A.evaluate((L) => {
    const g = window.__game, ch = g.chores || g.camp.chores, inv = g.inventory, site = g.camp.registry.site(L.key), key = L.key;
    const p = g.player; p.x = L.fire.x + 2; p.z = L.fire.z + 0.3;
    const b = ch.fuelBin(key, site);
    for (let i = 0; i < 6; i++) inv.put(b, 'wood:branch', { quiet: true });
    b.at.armed = true; inv.emit('items');
    window.__fireBin = b.id;
    return true;
  }, L), B, (key) => window.__game.fires.state(key) === 'burning', L.key, 20000);
  const hostSt = await A.evaluate((key) => window.__game.fires.state(key), L.key);
  const guestOwnBin = await B.evaluate((key) => window.__game.inventory.containers.some((c) => c.item === 'firefuel' && c.at && c.at.fuel === key), L.key);
  result('4a host lights a fire: the guest sees it burning', fireMs != null && hostSt === 'burning', { msFromLayingToGuestSeesBurning: fireMs, hostState: hostSt });
  const feed = await B.evaluate((L) => {
    const g = window.__game, inv = g.inventory, p = g.player; p.x = L.fire.x - 1.8; p.z = L.fire.z + 0.4;
    const r0 = inv.place('wood:branch', 1);
    const o = g.nearby.fireObject();
    if (!o) return { none: 'no fire card' };
    const slot = o.slots.find((s) => s.id === 'fuel');
    const hit = inv.findUid(r0.uid);
    window.__t0 = performance.now();
    const r = slot.drop ? slot.drop({ cId: hit.c.id, uid: hit.e.uid, itemId: 'wood:branch', qty: 1 }) : { ok: false, words: 'the fuel slot is our own' };
    return { title: o.title, binIsFriends: !slot.cId, r, branchesLeft: inv.count('wood:branch', { reachable: false }) };
  }, L);
  log('[guest] feed', feed);
  const hostOps0 = await A.evaluate(() => window.__game.coopShare.n.opIn);
  await until(B, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
  const feedRtt = await B.evaluate(() => window.__game.coopShare.n.rtt.slice(-1)[0]);
  const hostBin = await A.evaluate(() => { const g = window.__game, b = g.inventory.cont(window.__fireBin); return { pieces: b.grid.reduce((n, e) => n + e.qty, 0) }; });
  const refused = await B.evaluate(() => window.__game.coopShare.n.timeouts);
  result('4b the guest feeds the host’s fire a stick into the host’s bin', !!(feed.binIsFriends && feed.r && feed.r.ok && !guestOwnBin && refused === 0), { card: feed.title, guestMadeOwnBin: guestOwnBin, roundTripMs: feedRtt, hostOpsSeen: hostOps0, hostBinPiecesAfter: hostBin.pieces });

  // --- 5: a stick the guest picks up is gone on the host's screen -------------------------------------------------------
  const stick = await B.evaluate(() => {
    const g = window.__game, ch = g.chores || g.camp.chores, p = g.player;
    const pc = ch.near.filter((q) => ch.available(q) && !q.key.startsWith('d:')).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    return pc ? { key: pc.key, x: pc.x, z: pc.z } : null;
  });
  log('[guest] stick', stick);
  if (stick) {
    const hostHad = await A.evaluate((k) => { const ch = window.__game.chores || window.__game.camp.chores; const pc = ch.near.find((q) => q.key === k); return pc ? ch.available(pc) : 'not near the host'; }, stick.key);
    const ms5 = await timed(() => B.evaluate((s) => { const g = window.__game, p = g.player; p.x = s.x + 0.8; p.z = s.z; const r = g.nearby.takePiece(`piece:${s.key}`, (g.inventory.reachable().find((c) => g.inventory.firstFit(c, 'wood:branch') && !['firefuel', 'grate', 'crate', 'pile'].includes(c.item)) || {}).id || null); return r; }, stick),
      A, (k) => { const ch = window.__game.chores || window.__game.camp.chores; const pc = ch.near.find((q) => q.key === k); return ch.s.taken[k] != null && (!pc || !ch.available(pc)); }, stick.key);
    const shownOnHost = await A.evaluate((k) => { const ch = window.__game.chores || window.__game.camp.chores; return !(window.__game.nearby.groundPieces() || []).some((q) => q.uid === `piece:${k}`); }, stick.key);
    result('5 a stick the guest picks up is gone on the host’s screen', ms5 != null, { ms: ms5, piece: stick.key, availableOnHostBefore: hostHad, notInHostBookAfter: shownOnHost });
  } else result('5 a stick the guest picks up is gone on the host’s screen', false, { why: 'no stick near the guest' });

  // --- 6: the host pitches at the site, the guest beside it; the guest's tent on the host's screen ------------------------
  const pitchTent = async (page, off) => page.evaluate(({ L, off }) => {
    const g = window.__game, camp = g.camp, inv = g.inventory, site = camp.registry.site(L.key), P = L.pad;
    const sx = -P.fdz, sz = P.fdx; // across the door
    const x = P.x + sx * off, z = P.z + sz * off;
    const p = g.player; p.x = x - P.fdx * 2; p.z = z - P.fdz * 2; // (on foot beside the spot)
    let tent = null;
    for (const c of inv.campReach()) for (const e of c.grid) if (!tent && !e.box && (window.__game.items.itemDef(e.id) || {}).slot === 'tent') tent = camp.tentByUid(e.uid);
    if (!tent) { for (const c of inv.containers) for (const e of c.grid) if (!tent && !e.box && (window.__game.items.itemDef(e.id) || {}).slot === 'tent') tent = { c, e, def: window.__game.items.itemDef(e.id) }; }
    if (!tent) return { none: 'no tent' };
    const holderBefore = camp.registry.holder(L.key);
    const spot = camp.ghostAt(site, tent.def.id, x, z, P.fdx, P.fdz) || { x, z, fdx: P.fdx, fdz: P.fdz };
    const ok = camp.stake(spot, tent, site);
    if (ok) camp.setStage(camp.camp, 4);
    return { ok, item: tent.def.id, why: spot.why || null, holderBefore, holderAfter: camp.registry.holder(L.key), at: { x, z } };
  }, { L, off });
  const hp = await pitchTent(A, 0);
  log('[host] pitched', hp);
  await sleep(1200);
  const guestHolder = await B.evaluate((k) => window.__game.camp.registry.holder(k), L.key);
  let gp = null;
  const ms6 = await timed(async () => { gp = await pitchTent(B, 3.4); }, A, (gid) => { const f = window.__game.coopShare.friends.get(gid); return !!(f && f.tent && f.tent.stage === 4 && f.tent.stages.group.visible); }, ids.guest);
  log('[guest] pitched', gp);
  result('6 the guest’s tent pitched at the host’s site shows on the host’s screen', !!(gp && gp.ok && ms6 != null), { ms: ms6, guestRegistryBefore: guestHolder, guestPitch: gp, hostPitch: hp });

  // --- 6b: a tarp the guest rigs shows on the host's screen ---------------------------------------------------------------
  const ms6b = await timed(() => B.evaluate((L) => {
    const T = window.__game.tarp, F = L.fire, r = T.rigOf({ id: 'ttest1', kind: 'poles', ends: ['pole', 'pole'], ax: F.x - 3, az: F.z - 2.5, ar: 0.1, bx: F.x + 0.5, bz: F.z - 2.5, br: 0.1, sc: 1.75, lh: 1.4, ga: window.__game.tiles.groundAt(F.x - 3, F.z - 2.5), gb: window.__game.tiles.groundAt(F.x + 0.5, F.z - 2.5), stage: 3, poles: 2 });
    T.rigs.push(r); return !!r;
  }, L), A, (gid) => { const T = window.__game.tarp, id = `p${gid}:ttest1`, m = T.meshes.get(id); return !!(T.others.some((r) => r.id === id) && m && m.mesh.visible); }, ids.guest);
  result('6b a tarp the guest rigs shows on the host’s screen', ms6b != null, { ms: ms6b });

  // --- 9: no answer: a put the owner never answers comes back after the timeout ------------------------------------------
  await A.evaluate(() => { const s = window.__game.coopShare; s.gotOp = () => {}; }); // (the host's browser deaf to requests)
  await B.evaluate((L) => { const p = window.__game.player; p.x = L.fire.x - 1.6; p.z = L.fire.z + 0.4; }, L); // (back by the host's pack)
  await sleep(300);
  const lost = await B.evaluate(({ hpid }) => {
    const g = window.__game, inv = g.inventory, s = g.coopShare, t = s.tabs().find((q) => q.key === hpid);
    if (!t) return { none: s.tabs().map((q) => q.key) };
    const def = g.items.itemDef;
    let src = null, e = null;
    for (const c of inv.reachable()) { if (['firefuel', 'grate'].includes(c.item)) continue; const q = c.grid.find((x) => !x.box && !x.fixed && (def(x.id) || {}).kind !== 'container' && (def(x.id) || {}).slot !== 'tent'); if (q) { src = c; e = q; break; } }
    if (!e) return { none: 'nothing of ours' };
    const before = inv.count(e.id, { reachable: false });
    const r = t.bin.drop({ cId: src.id, uid: e.uid, itemId: e.id, qty: 1 });
    return { r, id: e.id, before, during: inv.count(e.id, { reachable: false }) };
  }, { hpid: `p${ids.host}:${hPack.id}` });
  await sleep(3800);
  const back = lost.id ? await B.evaluate((id) => ({ n: window.__game.inventory.count(id, { reachable: false }), timeouts: window.__game.coopShare.n.timeouts, pending: window.__game.coopShare.pending.size }), lost.id) : null;
  await A.evaluate(() => { delete window.__game.coopShare.gotOp; });
  if (!lost.id) log('[guest] lost', lost);
  result('9 an unanswered put comes back after the timeout', !!(back && back.n === lost.before && lost.during === lost.before - 1 && back.timeouts >= 1 && back.pending === 0), { item: lost.id, before: lost.before, whilePending: lost.during, after: back && back.n, timeouts: back && back.timeouts });

  // --- the screenshots: the host looking at the guest's tent, at the guest's pack, and the book with its tab ------------
  await sleep(800);
  const look = (page, a) => page.evaluate(({ gid, pid, what }) => {
    const g = window.__game, f = g.coopShare.friends.get(gid), T = g.THREE, me = g.player, G = (x, z) => g.tiles.groundAt(x, z);
    if (!f) return false;
    const c = f.mirror.cont(pid), t = f.tent;
    const at = what === 'tent' ? (t ? { x: t.x, z: t.z } : null) : c && c.at ? { x: c.at.x, z: c.at.z } : null;
    if (!at) return false;
    const r = what === 'tent' ? 6.5 : 2.6, up = what === 'tent' ? 2.6 : 1.6;
    const dx = at.x - me.x, dz = at.z - me.z, d = Math.hypot(dx, dz) || 1;
    const k = what === 'tent' ? -1 : 1; // (the pack from beyond it, so we are not in the way)
    g.chase.focus = { pos: new T.Vector3(at.x + k * (dx / d) * r, G(at.x, at.z) + up, at.z + k * (dz / d) * r), look: new T.Vector3(at.x, G(at.x, at.z) + (what === 'tent' ? 0.7 : 0.2), at.z) };
    return true;
  }, { gid: ids.guest, pid, what: a });
  log('framed tent', await look(A, 'tent'));
  await sleep(1500);
  await A.screenshot({ path: path.join(OUT, 'host-sees-guest-tent.png') });
  await A.evaluate((pid) => { const g = window.__game, s = g.coopShare; for (const f of s.friends.values()) { const c = f.mirror.cont(pid); if (c) { g.player.x = c.at.x + 1.4; g.player.z = c.at.z + 0.6; } } }, pid);
  log('framed pack', await look(A, 'pack'));
  await sleep(1500);
  await A.screenshot({ path: path.join(OUT, 'host-sees-guest-pack.png') });
  await A.evaluate(() => { const g = window.__game; g.chase.focus = null; g.journal.show('pack'); });
  await sleep(1200);
  const tabEl = await A.$('.ctab.k-friend');
  if (tabEl) { await tabEl.click(); await sleep(800); }
  const bookTab = await A.evaluate(() => [...document.querySelectorAll('.ctab.k-friend')].map((b) => b.textContent));
  log('book tabs for friends', bookTab);
  await A.screenshot({ path: path.join(OUT, 'host-book-guest-pack-tab.png') });
  result('8 the guest’s pack is a tab in the host’s book', bookTab.length > 0, { tabs: bookTab });
  await A.evaluate(() => window.__game.journal.close());
  await B.screenshot({ path: path.join(OUT, 'guest-view.png') });
  log('screenshots in', OUT);

  // --- leave: the guest's things go from the host's screen -------------------------------------------------------------
  await B.evaluate(() => window.__game.coop.disconnect());
  await until(A, () => window.__game.coopShare.friends.size === 0, null, 15000).catch(() => null);
  const leftover = await A.evaluate(() => ({ friends: window.__game.coopShare.friends.size, tarps: window.__game.tarp ? window.__game.tarp.others.length : null }));
  result('7 the guest leaves: their things go from the host’s screen', leftover.friends === 0, leftover);

  const stats = { host: await A.evaluate(() => window.__game.coopShare.stats()), guest: await B.evaluate(() => window.__game.coopShare.stats()) };
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ relay: RELAY, results, stats }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} catch (e) {
  log('error', e.stack || e.message);
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ relay: RELAY, results, error: String(e.stack || e) }, null, 2));
} finally {
  for (const b of browsers) await b.close().catch(() => {});
}
