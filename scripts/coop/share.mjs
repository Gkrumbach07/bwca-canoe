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
    ch.grate(key, site); // (the host's grate at its ring, as its own fire card makes it)
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

  // --- 4c: "Put it on the fire" from an item's right-click at the host's ring -----------------------------------------
  const rc = await B.evaluate(() => {
    const g = window.__game, inv = g.inventory, r0 = inv.place('wood:branch', 1), hit = inv.findUid(r0.uid);
    const acts = g.nearby.itemActions({ cId: hit.c.id, uid: hit.e.uid });
    const a = acts.find((q) => q.id === 'fuel');
    if (!a) return { none: acts.map((q) => q.label) };
    const before = inv.count('wood:branch', { reachable: false });
    const ok = a.run();
    return { label: a.label, ok, before, after: inv.count('wood:branch', { reachable: false }) };
  });
  await until(B, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
  result('4c “Put it on the fire” on an item at the host’s ring feeds the host’s bin', !!(rc.ok && rc.after === rc.before - 1), { ...rc, roundTripMs: await B.evaluate(() => window.__game.coopShare.n.rtt.slice(-1)[0]), timeouts: await B.evaluate(() => window.__game.coopShare.n.timeouts) });

  // --- 4d: one grate: the host's grate is the card's, the guest makes none of its own -----------------------------------
  const gr = await B.evaluate((L) => {
    const g = window.__game, inv = g.inventory, o = g.nearby.fireObject(), s = o && o.slots.find((q) => q.id === 'grate');
    const own = inv.containers.some((c) => c.item === 'grate' && c.at && c.at.grate === L.key);
    let put = null;
    const def = g.items.itemDef;
    if (s && s.drop) {
      const fish = Object.keys(g.items.ITEMS).find((k) => (def(k) || {}).kind === 'fish' && (def(k).eat || {}).cook);
      if (fish) inv.place(fish, 1, { data: { length: 34 } }); // (a fish of the rig's for the grate)
      for (const c of inv.reachable()) { if (put) break; const e = c.grid.find((x) => !x.box && !x.fixed && ['food', 'fish', 'tool'].includes((def(x.id) || {}).kind)); if (e) put = { id: e.id, r: s.drop({ cId: c.id, uid: e.uid, itemId: e.id, qty: 1 }) }; }
    }
    return { friendsGrate: !!(s && !s.cId && s.drop), ownGrate: own, put };
  }, L);
  await until(B, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
  const onGrate = gr.put ? await A.evaluate(({ key, id }) => { const c = window.__game.inventory.containers.find((k) => k.item === 'grate' && k.at && k.at.grate === key); return !!(c && c.grid.some((e) => e.id === id)); }, { key: L.key, id: gr.put.id }) : null;
  result('4d one grate: the host’s on the guest’s card, none of the guest’s own', !!(gr.friendsGrate && !gr.ownGrate && (gr.put ? onGrate : true)), { ...gr, onHostGrate: onGrate });

  // --- 4e: the guest douses the host's fire (held, then the request): out on both screens ---------------------------------
  const dz = await B.evaluate((L) => {
    const g = window.__game, o = g.nearby.fireObject(), a = o && o.actions.find((q) => q.id === 'douse');
    if (!a) return { none: true, state: g.fires.state(L.key) };
    g.chores.douse(g.camp.registry.site(L.key), L.key, { auto: true, book: true }); // (the card's Douse, held: auto stands for the key held down)
    return { offered: a.label };
  }, L);
  let dMs = null;
  if (!dz.none) {
    const t0 = Date.now();
    await until(A, (key) => !['burning', 'coals'].includes(window.__game.fires.state(key)), L.key, 30000).catch(() => null);
    dMs = Date.now() - t0;
  }
  const after = { host: await A.evaluate((key) => window.__game.fires.state(key), L.key), guest: await B.evaluate((key) => window.__game.fires.state(key), L.key), wet: await A.evaluate(() => { const b = window.__game.inventory.cont(window.__fireBin); return b.grid.filter((e) => e.data && e.data.wet > 0).length; }) };
  result('4e the guest douses the host’s fire: out on both screens', !dz.none && !['burning', 'coals'].includes(after.host) && after.guest === after.host, { ...dz, msHeldJobPlusRequest: dMs, hostState: after.host, guestState: after.guest, hostWetPieces: after.wet });

  // --- 4f: out of the host's fire on the guest's card, with the mouse: the fish off the host's grate into a free hand,
  // a branch out of the host's fuel into the other ("it doesnt let me pull things from the fire that the other player put")
  await B.evaluate(() => { const g = window.__game, inv = g.inventory; for (const c of [...inv.containers]) if (c.where === 'hands') { const pk = inv.containers.find((k) => k.where === 'ground' && /^pack/.test(k.item)); if (pk) inv.move(null, c.id, pk.id, ...Object.values(inv.firstFit(pk, c.item) || { x: 0, y: 0, rot: 0 })); } });
  const opened = await B.evaluate((L) => { const p = window.__game.player; p.x = L.fire.x - 1.6; p.z = L.fire.z + 0.4; return window.__game.cards.open('fire', L.key); }, L);
  await sleep(900);
  const dragTo = async (from, to) => {
    const a = await B.$(from), b = await B.$(to);
    if (!a || !b) return { none: { from: !!a, to: !!b } };
    const ra = await a.boundingBox(), rb = await b.boundingBox();
    await B.mouse.move(ra.x + ra.width / 2, ra.y + ra.height / 2);
    await B.mouse.down();
    for (let i = 1; i <= 8; i++) { await B.mouse.move(ra.x + ra.width / 2 + (rb.x + rb.width / 2 - ra.x - ra.width / 2) * i / 8, ra.y + ra.height / 2 + (rb.y + rb.height / 2 - ra.y - ra.height / 2) * i / 8); await sleep(30); }
    await B.mouse.up();
    await until(B, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
    await sleep(500);
    return { ok: true };
  };
  const hands = () => B.evaluate(() => window.__game.inventory.containers.filter((c) => c.where === 'hands').map((c) => c.grid.map((e) => e.id).join('+')));
  const h0 = await hands();
  const fishDrag = await dragTo('.cd-thing .nb-slot.s-grate .ig-item', '.cd-mine [data-dz="hand0"]');
  const h1 = await hands();
  const woodDrag = await dragTo('.cd-thing .nb-slot.s-fuel .ig-item', '.cd-mine [data-dz="hand1"]');
  const h2 = await hands();
  await B.screenshot({ path: path.join(OUT, 'guest-fire-card-after-taking.png') });
  await B.evaluate(() => window.__game.cards.close());
  const gotFish = h1.some((s) => /fish/.test(s)) && !h0.some((s) => /fish/.test(s)), gotWood = h2.join().split(/[+,]/).filter((s) => /wood/.test(s)).length > h1.join().split(/[+,]/).filter((s) => /wood/.test(s)).length;
  result('4f the guest pulls things out of the host’s fire (grate and fuel) with the mouse', !!(opened && gotFish && gotWood), { cardOpened: opened, handsBefore: h0, afterFish: h1, afterWood: h2, fishDrag, woodDrag });

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
  await B.evaluate(() => { const T = window.__game.tarp; T.rigs = T.rigs.filter((r) => r.id !== 'ttest1'); }); // (taken down: out of the canoe shot)

  // --- 5b: the berries and the sawn logs merge (grow-only; a log cut on both sides converges) ----------------------------
  const today = await B.evaluate(() => window.__game.chores.today);
  const mg = await timed(() => Promise.all([
    B.evaluate((d) => { const g = window.__game; g.forage.s.picked['test:berries'] = [d, 2]; g.chores.s.sawn['-1:-1'] = { day: d, cuts: 2 }; }, today),
    A.evaluate((d) => { const g = window.__game; g.forage.s.picked['test:berries'] = [d, 1]; g.chores.s.sawn['-1:-1'] = { day: d, cuts: 1, poles: 1 }; }, today),
  ]), A, () => { const g = window.__game, s = g.chores.s.sawn['-1:-1'], p = g.forage.s.picked['test:berries']; return !!(s && s.cuts === 2 && s.poles === 1 && p && p[1] === 2); });
  await sleep(800);
  const gm = await B.evaluate(() => ({ sawn: window.__game.chores.s.sawn['-1:-1'], picked: window.__game.forage.s.picked['test:berries'] }));
  const hm = await A.evaluate(() => ({ sawn: window.__game.chores.s.sawn['-1:-1'], picked: window.__game.forage.s.picked['test:berries'] }));
  result('5b berries and sawn logs merge to the same on both screens', mg != null && JSON.stringify(gm) === JSON.stringify(hm), { ms: mg, host: hm, guest: gm });

  // --- 10: through a friend's canoe: the guest's load drawn in the guest's canoe, a tab beside it, a take ------------------
  const cnv = await B.evaluate(() => {
    const g = window.__game, inv = g.inventory, p = g.player, d = p.carry && p.carry.drop;
    let c = inv.containers.find((k) => k.where === 'canoe' && k.grid.some((e) => !e.box));
    if (!c) { c = inv.containers.find((k) => /^(pack|barrel|packdry)/.test(k.item) && ['back', 'chest', 'stash'].includes(k.where) && k.grid.some((e) => !e.box)); if (c) { c.where = 'canoe'; c.at = null; inv.emit('containers'); } }
    return c ? { id: c.id, item: c.item, drop: d ? { x: d.x, z: d.z, heading: d.heading } : null, inCanoe: inv.containers.filter((k) => k.where === 'canoe').map((k) => k.item) } : { none: inv.containers.map((k) => `${k.item}:${k.where}`) };
  });
  log('[guest] canoe', cnv);
  if (cnv.id && cnv.drop) {
    const cpid = `p${ids.guest}:${cnv.id}`;
    await A.evaluate((d) => { const p = window.__game.player; p.x = d.x + Math.sin(d.heading) * 1.2; p.z = d.z + Math.cos(d.heading) * 1.2; }, cnv.drop);
    await sleep(1500);
    const seen = await A.evaluate(({ gid, cpid }) => {
      const g = window.__game, f = g.coopShare.friends.get(gid), r = g.coop.remotes.get(gid), o = f && f.view && f.view.objs.get(cpid);
      const t = g.coopShare.tabs().find((q) => q.key === cpid);
      return { drawn: !!(o && o.visible && r && r.boat.near && o.parent === r.boat.near.pivot), stockPacks: r ? r.boat.packs : null, tab: t ? `${t.label} · ${t.sub}` : null, items: t ? t.bin.items.map((i) => ({ uid: i.uid, id: i.id, qty: i.qty })) : [] };
    }, { gid: ids.guest, cpid });
    let took = null;
    if (seen.items.length) {
      const it = seen.items[seen.items.length - 1];
      const before = await A.evaluate((id) => window.__game.inventory.count(id, { reachable: false }), it.id);
      await A.evaluate(({ cpid, it }) => { const t = window.__game.coopShare.tabs().find((q) => q.key === cpid); t.bin.take({ uid: it.uid, itemId: it.id, toCId: null, qty: it.qty }); }, { cpid, it });
      await until(A, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
      took = { id: it.id, gained: (await A.evaluate((id) => window.__game.inventory.count(id, { reachable: false }), it.id)) - before, rtt: await A.evaluate(() => window.__game.coopShare.n.rtt.slice(-1)[0]) };
    }
    result('10 the guest’s canoe: its load drawn in it, a tab beside it, a take through it', !!(seen.drawn && seen.tab && took && took.gained > 0), { drawnInTheirHull: seen.drawn, stockPacks: seen.stockPacks, tab: seen.tab, took });
    await A.evaluate(({ gid }) => {
      const g = window.__game, T = g.THREE, r = g.coop.remotes.get(gid), w = new T.Vector3();
      r.boat.root.getWorldPosition(w);
      g.player.x = w.x + 6; g.player.z = w.z + 6; // (out of the way)
      g.chase.focus = { pos: new T.Vector3(w.x - 2.6, w.y + 3.2, w.z - 2.6), look: new T.Vector3(w.x, w.y, w.z) };
    }, { gid: ids.guest });
    await sleep(1500);
    await A.screenshot({ path: path.join(OUT, 'host-sees-guest-canoe-load.png') });
    await A.evaluate(() => { window.__game.chase.focus = null; });
  } else result('10 the guest’s canoe: its load drawn in it, a tab beside it, a take through it', false, cnv);

  // --- 11: a friend's hung barrel: a tab within reach of it, a take ------------------------------------------------------
  const hb = await B.evaluate((L) => {
    const g = window.__game, inv = g.inventory, F = L.fire;
    const c = inv.containers.find((k) => /^barrel/.test(k.item) && k.where !== 'in' && k.where !== 'canoe') || inv.containers.find((k) => /^barrel/.test(k.item));
    if (!c) return { none: inv.containers.map((k) => `${k.item}:${k.where}`) };
    if (!c.grid.some((e) => !e.box)) { // (an empty barrel: a meal of ours into it)
      const def = g.items.itemDef;
      for (const k of inv.containers) { if (k === c) continue; const e = k.grid.find((x) => !x.box && !x.fixed && inv.accepts(c, def(x.id))); if (e) { const f = inv.firstFit(c, e.id); if (f && inv.move(k.id, e.uid, c.id, f.x, f.y, f.rot, 1)) break; } }
    }
    if (!c.grid.some((e) => !e.box)) { const def = g.items.itemDef, id = Object.keys(g.items.ITEMS).find((k) => { const d = def(k); return d && d.kind !== 'container' && (d.w || 1) * (d.h || 1) === 1 && inv.accepts(c, d); }); if (id) inv.put(c, id, { qty: 1 }); } // (the rig's: a food of the game's into it)
    const x = F.x + 3.5, z = F.z - 3, y = g.tiles.groundAt(x, z) + 2.4;
    inv.hang(c.id, { x, z, y, limb: y + 1.2, heading: 0 });
    return { id: c.id, item: c.item, at: { x, z }, things: c.grid.map((e) => e.id) };
  }, L);
  log('[guest] hung', hb);
  if (hb.id) {
    const bpid = `p${ids.guest}:${hb.id}`;
    await A.evaluate((a) => { const p = window.__game.player; p.x = a.x + 1.5; p.z = a.z + 0.5; }, hb.at);
    await sleep(1200);
    const t = await A.evaluate((bpid) => { const t = window.__game.coopShare.tabs().find((q) => q.key === bpid); return t ? { label: `${t.label} · ${t.sub}`, items: t.bin.items.map((i) => ({ uid: i.uid, id: i.id, qty: i.qty })) } : null; }, bpid);
    let took = null;
    if (t && t.items.length) {
      const it = t.items[0], before = await A.evaluate((id) => window.__game.inventory.count(id, { reachable: false }), it.id);
      await A.evaluate(({ bpid, it }) => { const q = window.__game.coopShare.tabs().find((k) => k.key === bpid); q.bin.take({ uid: it.uid, itemId: it.id, toCId: null, qty: 1 }); }, { bpid, it });
      await until(A, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
      took = { id: it.id, gained: (await A.evaluate((id) => window.__game.inventory.count(id, { reachable: false }), it.id)) - before, rtt: await A.evaluate(() => window.__game.coopShare.n.rtt.slice(-1)[0]) };
    }
    const stillHung = await B.evaluate((id) => window.__game.inventory.cont(id).where, hb.id);
    result('11 the guest’s hung barrel: a tab within reach, a take from it', !!(t && took && took.gained > 0), { tab: t && t.label, took, guestBarrelNow: stillHung });
  } else result('11 the guest’s hung barrel: a tab within reach, a take from it', false, hb);

  // --- 12: a stick the guest drops makes a pile (a woodpile) on the guest's screen: the host sees that woodpile, drawn as
  // the guest's, and takes from it on the dot (E Take one) ---------------------------------------------------------------
  const drop = await B.evaluate((L) => {
    const g = window.__game, inv = g.inventory, p = g.player; p.x = L.fire.x + 1.5; p.z = L.fire.z + 2.5;
    let hit = null; for (const c of inv.containers) { if (hit) break; const e = c.grid.find((x) => x.id === 'wood:branch' && !x.fixed); if (e && c.item !== 'firefuel') hit = { c, e }; }
    if (!hit) { const r = inv.place('wood:branch', 1); hit = inv.findUid(r.uid); }
    const piles0 = inv.containers.filter((c) => c.item === 'pile').map((c) => c.id);
    const r = inv.drop(hit.c.id, hit.e.uid, 1);
    const pile = inv.containers.find((c) => c.item === 'pile' && c.where === 'ground' && !piles0.includes(c.id) && c.grid.some((e) => e.id === 'wood:branch')) || inv.containers.find((c) => c.item === 'pile' && c.where === 'ground' && c.grid.some((e) => e.id === 'wood:branch'));
    return { r, pile: pile ? { id: pile.id, at: { x: pile.at.x, z: pile.at.z }, woodpile: g.chores.woodOnly(pile), drawnAsWoodpile: !!g.chores.pileMesh(pile.id) } : null };
  }, L);
  log('[guest] dropped', drop);
  if (drop.pile) {
    const ppid = `p${ids.guest}:${drop.pile.id}`;
    await A.evaluate((a) => { const p = window.__game.player; p.x = a.x + 1.2; p.z = a.z; }, drop.pile.at);
    const ms12 = await (async () => { const t0 = Date.now(); try { await until(A, (id) => { const ch = window.__game.chores; return !!ch.pileMesh(id); }, ppid, 8000); return Date.now() - t0; } catch { return null; } })();
    const seen = await A.evaluate(({ ppid, gid }) => {
      const g = window.__game, s = g.coopShare, f = s.friends.get(gid), loose = f && f.view && f.view.objs.get(ppid);
      const near = { reach: 3, flat: () => 1, sphere: () => ({ t: 1, miss: 0 }) };
      const t = s.pointTargets(null, near).find((q) => q.target.ref === ppid);
      const before = g.inventory.count('wood:branch', { reachable: false });
      if (t) t.target.e.run();
      return { woodpileDrawn: !!g.chores.pileMesh(ppid), alsoLooseModel: !!(loose && loose.visible), dot: t ? `${t.target.e.verb} · ${t.target.label}` : null, before };
    }, { ppid, gid: ids.guest });
    await until(A, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
    const after = await A.evaluate(() => window.__game.inventory.count('wood:branch', { reachable: false }));
    const guestPile = await B.evaluate((id) => { const c = window.__game.inventory.cont(id); return c ? c.grid.length : 0; }, drop.pile.id);
    result('12 the guest’s dropped stick: the host sees the woodpile and takes from it on the dot', !!(drop.pile.woodpile && seen.woodpileDrawn && !seen.alsoLooseModel && seen.dot && after === seen.before + 1), { ms: ms12, guestDrawsWoodpile: drop.pile.drawnAsWoodpile, ...seen, hostBranchesAfter: after, guestPileLeft: guestPile });
  } else result('12 the guest’s dropped stick: the host sees the woodpile and takes from it on the dot', false, drop);

  // --- 10b: the host's walker steps onto the guest's beached canoe: pushed off it, not stuck --------------------------------
  {
    const w = await A.evaluate(({ gid }) => {
      const g = window.__game, r = g.coop.remotes.get(gid), B = r && r.boat; if (!B || B.hidden) return null;
      g.player.x = B.x + Math.cos(B.heading) * 0.8; g.player.z = B.z - Math.sin(B.heading) * 0.8; // (on its middle, toward the bow)
      return { x: B.x, z: B.z, h: B.heading };
    }, { gid: ids.guest });
    await sleep(1200);
    const d = w ? await A.evaluate((b) => { const p = window.__game.player, fx = Math.cos(b.h), fz = -Math.sin(b.h), dx = p.x - b.x, dz = p.z - b.z, t = Math.max(-2.3, Math.min(2.3, dx * fx + dz * fz)); return { off: +Math.hypot(dx - fx * t, dz - fz * t).toFixed(2), pushes: window.__game.coopShare.n.pushes }; }, w) : null;
    result('10b the host’s walker on the guest’s beached canoe is pushed off it', !!(d && d.off >= 0.65), d || { none: 'no beached canoe' });
  }

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

  // --- 13: two canoes on the water in one spot: pushed apart, neither stuck ---------------------------------------------
  {
    const spot = await A.evaluate(async (L) => { const g = window.__game, p = g.player; await p.teleport(L.fire.x - 30, L.fire.z - 30); return { x: p.x, z: p.z, h: p.heading, mode: p.mode }; }, L);
    await B.evaluate(async (s) => { const g = window.__game, p = g.player; await p.teleport(s.x, s.z); p.x = s.x + 0.3; p.z = s.z + 0.2; p.heading = s.h + 0.4; }, spot);
    await A.evaluate((s) => { const p = window.__game.player; p.x = s.x; p.z = s.z; }, spot);
    const gap = () => A.evaluate((gid) => {
      const g = window.__game, p = g.player, r = g.coop.remotes.get(gid), B = r && r.boat; if (!B || B.hidden) return null;
      const seg = (x, z, h) => { const fx = Math.cos(h) * 2.3, fz = -Math.sin(h) * 2.3; return [x - fx, z - fz, x + fx, z + fz]; };
      const [ax, az, bx, bz] = seg(p.x, p.z, p.heading), [cx, cz, dx, dz] = seg(B.x, B.z, B.heading);
      let best = Infinity; // (sampled: the nearest of the two hulls' lines)
      for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) { const s = i / 40, t = j / 40; best = Math.min(best, Math.hypot(ax + (bx - ax) * s - cx - (dx - cx) * t, az + (bz - az) * s - cz - (dz - cz) * t)); }
      return { gap: +best.toFixed(2), mode: p.mode, other: B.ext ? 'afloat' : 'beached' };
    }, ids.guest);
    await sleep(400);
    const g0 = await gap();
    await sleep(2500);
    const g1 = await gap();
    const pushes = { host: await A.evaluate(() => window.__game.coopShare.n.pushes), guest: await B.evaluate(() => window.__game.coopShare.n.pushes) };
    result('13 two canoes on the water in one spot are pushed apart', !!(g1 && g1.gap >= 0.7 && g1.mode === 'paddle'), { start: g0, after: g1, pushes });
  }

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
