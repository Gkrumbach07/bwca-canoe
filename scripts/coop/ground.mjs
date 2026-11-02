// Co-op phase 3 round 2, shared ground and no overlaps (src/coop-share.js; docs/plans/coop.md): the owner, two browsers,
// "if it's on the ground in any container at all, it's shared ... It's not my canoe or your canoe. It's just two canoes",
// and "I'm also able to pitch a tent where they pitched a tent". Two headless Chromiums (one browser process each) in one
// room through `wrangler dev`:
//   1 the guest ties up at the outfitter's dock: from the host's yard its load is in the book, a take and a put
//   2 at a campsite the guest paddles ashore (stepOut): beside the beached canoe, its load in the book, a take and a put;
//     the dot on its hull reads "Look in it"
//   3 no owner's name on a tab, a card, the dot
//   4 the host picks up the guest's pack lying on the ground (E Pick up): its things with it, gone from the guest
//   5 a tent where the friend's tent stands is refused (red, a reason); a step aside is not refused for that
//   6 the tarp's ghost is red over a friend's tarp and over a friend's tent
//   7 a hang is refused on the limb a friend's barrel hangs from (the next tree offered, or a reason)
//   8 both pitch on one spot at once: one tent stands, the lower id's; the other is back in its pack
// (A held job is started and set to auto in one evaluate: a real frame between them finds E not down and stops it.)
// Round 3 (2026-11-02: "You can't lower a friend's hung barrel. (it's shared, remember)", "If you both pitch a tarp or
// hang a barrel in the same spot at the same moment, the clash isn't resolved"):
//   9  the dot on the guest's hung barrel reads E Lower (held); while the guest is mid-job on it the ask is refused and
//      it stays up; then the host's hold lets it down (seen coming down as held), the guest's browser sets it on the
//      ground at the rope's foot
//   10 the lowered barrel is shared: the host takes a thing out of it, picks it up whole and hangs it again (its own now)
//   11 both pitch a tarp on one spot at once: one stands (the lower id's) on both screens, the other's tarp back in its pack
//   12 both hang a barrel on one limb at once: one stays up (the lower id's) on both screens, the other is down at the
//      rope's foot, nothing lost
//
//   cd server/room && npx wrangler dev --port 8793 --var DELAY_MS:100
//   npx vite --port 5293
//   APP=http://localhost:5293 RELAY=ws://localhost:8793 node scripts/coop/ground.mjs [--out dir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5293';
const RELAY = process.env.RELAY || 'ws://localhost:8793';
const OUT = path.resolve(arg('out', 'coop-ground-out'));
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
const OWNER = /Gage|Ada|’s |their /; // (no owner's name, no "their canoe")

// the friend's tabs on this page: [{ key, label, sub, n }]
const tabsOn = (page) => page.evaluate(() => window.__game.coopShare.tabs().map((t) => ({ key: t.key, label: t.label, sub: t.sub, n: t.bin.items.length })));
// a take from the friend's tab `key` and a put back into it: { took, put }
async function roundTrip(page, key) {
  const it = await page.evaluate((key) => {
    const t = window.__game.coopShare.tabs().find((q) => q.key === key), def = window.__game.items.itemDef;
    const i = t && t.bin.items.filter((x) => (def(x.id) || {}).slot !== 'tent').sort((a, b) => ((def(a.id) || {}).w || 1) * ((def(a.id) || {}).h || 1) - ((def(b.id) || {}).w || 1) * ((def(b.id) || {}).h || 1))[0];
    return i ? { uid: i.uid, id: i.id, qty: i.qty } : null;
  }, key);
  let took = null, put = null;
  if (it) {
    const before = await page.evaluate((id) => window.__game.inventory.count(id, { reachable: false }), it.id);
    await page.evaluate(({ key, it }) => { const t = window.__game.coopShare.tabs().find((q) => q.key === key); window.__r = t.bin.take({ uid: it.uid, itemId: it.id, toCId: null, qty: it.qty }); }, { key, it });
    await until(page, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
    took = { id: it.id, gained: (await page.evaluate((id) => window.__game.inventory.count(id, { reachable: false }), it.id)) - before, r: await page.evaluate(() => window.__r) };
  }
  const t0 = await page.evaluate(() => window.__game.coopShare.n.timeouts);
  const p0 = await page.evaluate((key) => {
    const g = window.__game, inv = g.inventory, s = g.coopShare, t = s.tabs().find((q) => q.key === key), def = g.items.itemDef;
    if (!t) return { none: 'no tab' };
    for (const c of inv.reachable()) {
      if (['firefuel', 'grate', 'crate', 'pile'].includes(c.item)) continue;
      const e = c.grid.find((x) => !x.box && !x.fixed && (def(x.id) || {}).kind !== 'container' && (def(x.id) || {}).slot !== 'tent' && (!t.bin.accepts || t.bin.accepts.includes((def(x.id) || {}).kind)));
      if (e) { const before = inv.count(e.id, { reachable: false }); const r = t.bin.drop({ cId: c.id, uid: e.uid, itemId: e.id, qty: 1 }); return { id: e.id, before, r }; }
    }
    return { none: 'nothing of ours' };
  }, key);
  if (p0.id) {
    await until(page, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
    await sleep(300);
    const after = await page.evaluate((id) => window.__game.inventory.count(id, { reachable: false }), p0.id);
    put = { id: p0.id, ok: !!(p0.r && p0.r.ok) && after === p0.before - 1 && (await page.evaluate(() => window.__game.coopShare.n.timeouts)) === t0, words: p0.r && p0.r.words };
  } else put = p0;
  return { took, put };
}

try {
  // --- the host: Sandbox at Lake One's outfitter, on foot in the yard, the trip open -------------------------------------
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
  await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
  await until(A, () => window.__game.coop.remotes.size === 1, null, 30000);
  await until(B, () => window.__game.coop.remotes.size === 1, null, 30000);
  const ids = { host: await A.evaluate(() => window.__game.coop.id), guest: await B.evaluate(() => window.__game.coop.id) };
  log('joined', ids);

  // --- 1: the guest ties up at the dock; from the yard the host reaches into its load ------------------------------------
  const ep = await A.evaluate(() => window.__game.outfitter.visit.ep);
  const tied = await B.evaluate(async (ep) => {
    const g = window.__game, o = g.outfitter, p = g.player, L = o.layout(ep), l = o.landing(ep);
    const b0 = o.berths(L)[0].side, dd = g.world.deeperDir(b0.x, b0.z);
    await p.teleport(b0.x + dd.x * 8, b0.z + dd.z * 8);
    for (let i = 0; i < 30 && p.mode !== 'paddle'; i++) g.step(1 / 30, 1);
    o.dockUp(l, L);
    for (let i = 0; i < 400 && o.docking; i++) g.step(1 / 60, 1);
    g.step(1 / 30, 10);
    const d = p.carry && p.carry.drop;
    return { mode: p.mode, drop: d ? { x: d.x, z: d.z, heading: d.heading } : null, load: g.inventory.containers.filter((c) => c.where === 'canoe').map((c) => c.item) };
  }, ep);
  log('[guest] tied up', tied);
  await A.evaluate(() => { const g = window.__game, p = g.player, L = g.outfitter.visit.L; p.x = L.door.x; p.z = L.door.z; }); // (the host at the store's door: the yard)
  await until(A, () => window.__game.coopShare.tabs().some((t) => /canoe/.test(t.sub)), null, 10000).catch(() => null);
  const why1 = await A.evaluate(() => { const g = window.__game, f = [...g.coopShare.friends.values()][0]; return { atStash: g.inventory.atStash, visit: !!g.outfitter.visit, mode: g.player.mode, cn: f && f.pub && f.pub.cn, inCanoe: f ? f.mirror.containers.filter((c) => c.where === 'canoe').length : null }; });
  const t1 = await tabsOn(A);
  const k1 = (t1.find((t) => /canoe/.test(t.sub) && t.n > 0) || {}).key;
  const rt1 = k1 ? await roundTrip(A, k1) : null;
  const d1 = await A.evaluate((d) => { const p = window.__game.player; return d ? +Math.hypot(d.x - p.x, d.z - p.z).toFixed(1) : null; }, tied.drop);
  result('1 the guest’s canoe at the dock: its load in the host’s book from the yard, a take and a put', !!(k1 && rt1.took && rt1.took.gained > 0 && rt1.put.ok), { hostFromCanoeM: d1, ...why1, tabs: t1.map((t) => `${t.label} · ${t.sub}`), ...rt1 });

  // --- to a campsite: the host on foot by the ring, the guest afloat off the shore nearest it ------------------------------
  const site = await A.evaluate(async () => {
    const g = window.__game;
    g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide();
    const sites = g.world.campsites.slice().sort((a, b) => Math.hypot(a.x + 20900, a.z - 19400) - Math.hypot(b.x + 20900, b.z - 19400));
    const s = sites[0];
    await g.player.teleport(s.x, s.z);
    g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide();
    g.day.setClock(2026, 190, 10.5); g.day.running = true;
    return { x: s.x, z: s.z };
  });
  await until(A, (s) => { const c = window.__game.camp.nearestSite(s.x, s.z, 80, true); return !!(c && c.layout); }, site, 60000);
  const L = await A.evaluate((s) => {
    const g = window.__game, c = g.camp.nearestSite(s.x, s.z, 80, true), F = c.layout.fire, P = c.layout.pad, p = g.player;
    p.standAt({ x: F.x + 2.2, z: F.z + 0.4, heading: 0, drop: { x: F.x + 3, z: F.z + 3, heading: 0 } });
    // the water nearest the ring: a point 2–4 m out from the shore
    let wet = null;
    for (let r = 4; r < 80 && !wet; r += 2) for (let a = 0; a < 32 && !wet; a++) { const x = F.x + Math.cos(a / 32 * Math.PI * 2) * r, z = F.z + Math.sin(a / 32 * Math.PI * 2) * r, sd = g.world.shoreAt(x, z); if (sd < -2 && sd > -5) wet = { x, z }; }
    return { key: g.camp.registry.key(c), fire: { x: F.x, z: F.z }, pad: { ...P }, wet };
  }, site);
  log('[host] at the ring', L);
  await B.evaluate(async (L) => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); await g.player.teleport(L.wet.x, L.wet.z); }, L);
  await until(B, (s) => { const c = window.__game.camp.nearestSite(s.x, s.z, 80, true); return !!(c && c.layout); }, site, 60000);

  // --- 2: the guest paddles ashore and steps out; the host beside the beached canoe ---------------------------------------
  const beached = await B.evaluate((L) => {
    const g = window.__game, p = g.player;
    if (p.mode !== 'paddle') { for (let i = 0; i < 30 && p.mode !== 'paddle'; i++) g.step(1 / 30, 1); }
    p.x = L.wet.x; p.z = L.wet.z;
    p.stepOut();
    g.step(1 / 30, 5);
    const d = p.carry && p.carry.drop;
    return { mode: p.mode, drop: d ? { x: d.x, z: d.z, heading: d.heading } : null, cn: g.coopShare.pubNow().cn };
  }, L);
  log('[guest] beached', beached);
  await A.evaluate((d) => { const p = window.__game.player, h = d.heading; p.x = d.x - Math.sin(h) * 1.4 - Math.cos(h) * 0.5; p.z = d.z - Math.cos(h) * 1.4 + Math.sin(h) * 0.5; }, beached.drop);
  await sleep(1500);
  const t2 = await tabsOn(A);
  const k2 = (t2.find((t) => /canoe/.test(t.sub) && t.n > 0) || {}).key;
  const rt2 = k2 ? await roundTrip(A, k2) : null;
  const dot = await A.evaluate((gid) => {
    const g = window.__game, s = g.coopShare, f = s.friends.get(gid), cn = f.pub.cn, p = g.player;
    const near = { reach: 3, flat: (x, z) => Math.hypot(x - p.x, z - p.z), sphere: () => null, box: () => ({ t: 1, miss: 0 }) };
    const t = s.pointTargets(null, near).find((q) => q.target.kind === 'canoe');
    return t ? { label: t.target.label, verb: t.target.e.verb, why: t.target.e.why, opened: t.target.e.run() } : { none: cn };
  }, ids.guest);
  await sleep(600);
  const bookOpen = await A.evaluate(() => { const j = window.__game.journal; return !!(j && (j.open || j.shown || document.querySelector('.ctab.k-friend'))); });
  await A.evaluate(() => { const j = window.__game.journal; if (j && j.close) j.close(); });
  result('2 the guest’s beached canoe: its load in the host’s book beside it, a take and a put; the dot reads Look in it', !!(beached.cn && k2 && rt2.took && rt2.took.gained > 0 && rt2.put.ok && dot.verb === 'Look in it' && !dot.why), { tabs: t2.map((t) => `${t.label} · ${t.sub}`), ...rt2, dot, bookOpen });

  // --- 3 + 4: the guest's pack on the ground: no names; the host picks it up whole ------------------------------------------
  const gPack = await B.evaluate((L) => {
    const g = window.__game, inv = g.inventory, p = g.player;
    p.standAt({ x: L.fire.x - 1.6, z: L.fire.z + 0.8, heading: 0, drop: p.carry.drop });
    const c = inv.containers.find((k) => /^pack/.test(k.item) && k.where !== 'in' && k.grid.some((e) => !e.box));
    if (!c) return null;
    inv.setDown(c.id, { x: L.fire.x - 0.4, z: L.fire.z + 2.2, heading: 0.3 }, { force: true });
    return { id: c.id, item: c.item, things: c.grid.map((e) => `${e.id}x${e.qty}${e.box ? '(box)' : ''}`).sort() };
  }, L);
  const pid = `p${ids.guest}:${gPack.id}`;
  await A.evaluate((L) => { const g = window.__game, p = g.player, inv = g.inventory; p.x = L.fire.x - 0.2; p.z = L.fire.z + 1.4; const b = inv.worn('back'); if (b) inv.setDown(b.id, { x: L.fire.x + 1.5, z: L.fire.z - 1.5, heading: 0 }, { force: true }); }, L);
  await until(A, (pid) => window.__game.coopShare.tabs().some((t) => t.key === pid), pid, 8000).catch(() => null);
  const words = await A.evaluate(({ pid, L, gid }) => {
    const g = window.__game, s = g.coopShare, p = g.player, c = [...s.friends.values()][0].mirror.cont(pid);
    const near = { reach: 3, flat: (x, z) => Math.hypot(x - p.x, z - p.z), sphere: (x, y, z) => (Math.hypot(x - c.at.x, z - c.at.z) < 0.2 ? { t: 1, miss: 0 } : null), box: () => null };
    const dots = s.pointTargets(null, near).map((q) => q.target.label);
    return { tabs: s.tabs().map((t) => `${t.label} · ${t.sub}`), dots };
  }, { pid, L, gid: ids.guest });
  const bad = [...words.tabs, ...words.dots].filter((w) => OWNER.test(w));
  result('3 no owner’s name on the tabs or the dot', bad.length === 0, { ...words, bad });
  const pick = await A.evaluate((pid) => {
    const g = window.__game, s = g.coopShare, p = g.player, c = [...s.friends.values()][0].mirror.cont(pid);
    const near = { reach: 3, flat: (x, z) => Math.hypot(x - p.x, z - p.z), sphere: (x, y, z) => (Math.hypot(x - c.at.x, z - c.at.z) < 0.2 ? { t: 1, miss: 0 } : null), box: () => null };
    const t = s.pointTargets(null, near).find((q) => q.target.ref === pid);
    if (!t) return { none: true };
    const ok = t.target.e.run();
    return { label: t.target.label, e: t.target.e.verb, q: t.target.q && t.target.q.verb, ok };
  }, pid);
  await until(A, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
  await sleep(800);
  const hostHas = await A.evaluate((item) => { const inv = window.__game.inventory, c = inv.containers.find((k) => k.item === item && ['back', 'chest', 'hands'].includes(k.where)); return c ? { where: c.where, things: c.grid.map((e) => `${e.id}x${e.qty}${e.box ? '(box)' : ''}`).sort() } : null; }, gPack.item);
  const guestGone = await B.evaluate((id) => !window.__game.inventory.cont(id), gPack.id);
  result('4 the host picks up the guest’s pack from the ground, its things with it', !!(pick.ok && hostHas && guestGone && JSON.stringify(hostHas.things) === JSON.stringify(gPack.things)), { pick, guestPack: gPack.things, hostNow: hostHas, goneFromGuest: guestGone });

  // --- 4b: out of the guest's beached canoe, whole, from its tab (the strap's right-click: Pick up) -----------------------
  await A.evaluate((d) => { const p = window.__game.player, h = d.heading; p.x = d.x - Math.sin(h) * 1.4; p.z = d.z - Math.cos(h) * 1.4; }, beached.drop);
  await sleep(1200);
  const pb = await A.evaluate(() => {
    const t = window.__game.coopShare.tabs().find((q) => /canoe/.test(q.sub) && q.pickUp && !q.pickUp.why && /Bucket|Stringer/.test(q.label));
    if (!t) return { none: window.__game.coopShare.tabs().map((q) => `${q.label} · ${q.sub} · ${q.pickUp ? q.pickUp.why || 'ok' : '-'}`) };
    return { key: t.key, label: t.label, r: t.pickUp.run() };
  });
  await until(A, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
  await sleep(600);
  const pbHost = pb.key ? await A.evaluate((lab) => window.__game.inventory.containers.filter((c) => ['hands', 'back', 'chest'].includes(c.where)).map((c) => `${c.item}:${c.where}`), pb.label) : null;
  const pbGone = pb.key ? await B.evaluate((id) => !window.__game.inventory.cont(id), pb.key.replace(/^p[^:]*:/, '')) : false;
  result('4b the host takes a container out of the guest’s canoe whole, from its tab', !!(pb.r && pb.r.ok && pbGone && pbHost.some((s) => /bucket|stringer/.test(s))), { ...pb, hostOnBody: pbHost, goneFromGuest: pbGone });

  log('[guest] another tent', await B.evaluate(() => { const inv = window.__game.inventory, k = inv.worn('back') || inv.addContainer('pack3', 'back'); return inv.put(k, 'aframe'); })); // (the guest's tent went with the pack: another)

  // --- 5: the host pitches at the pad; the guest's tent on that spot is refused, a step aside is not (for that) -------------
  const pitch = (page, off) => page.evaluate(({ L, off }) => {
    const g = window.__game, camp = g.camp, inv = g.inventory, site = camp.registry.site(L.key), P = L.pad;
    const x = P.x - P.fdz * off, z = P.z + P.fdx * off, p = g.player; p.x = x - P.fdx * 2; p.z = z - P.fdz * 2;
    let tent = null;
    for (const c of inv.containers) for (const e of c.grid) if (!tent && !e.box && (g.items.itemDef(e.id) || {}).slot === 'tent') tent = { c, e, def: g.items.itemDef(e.id) };
    if (!tent) return { none: 'no tent' };
    camp.spot = null;
    const spot = camp.ghostAt(site, tent.def.id, x, z, P.fdx, P.fdz);
    return { spot: spot ? { ok: spot.ok, why: spot.why } : null, x, z };
  }, { L, off });
  const stake = (page, off) => page.evaluate(({ L, off }) => {
    const g = window.__game, camp = g.camp, inv = g.inventory, site = camp.registry.site(L.key), P = L.pad;
    const x = P.x - P.fdz * off, z = P.z + P.fdx * off;
    let tent = null;
    for (const c of inv.containers) for (const e of c.grid) if (!tent && !e.box && (g.items.itemDef(e.id) || {}).slot === 'tent') tent = { c, e, def: g.items.itemDef(e.id) };
    if (!tent) return { none: 'no tent' };
    const spot = { x, z, fdx: P.fdx, fdz: P.fdz, pose: camp.ghostAt(site, tent.def.id, x, z, P.fdx, P.fdz).pose };
    const ok = camp.stake(spot, tent, site);
    if (ok) camp.setStage(camp.camp, 4);
    return { ok, item: tent.def.id };
  }, { L, off });
  const hp = await stake(A, 0);
  log('[host] pitched', hp);
  await until(B, (gid) => { const f = window.__game.coopShare.friends.get(gid); return !!(f && f.tentWant && f.tentWant.stage === 4); }, ids.host, 8000).catch(() => null);
  const g5a = await pitch(B, 0), g5b = await pitch(B, 0.8), g5c = await pitch(B, 4.2);
  result('5 the guest’s tent on the host’s tent is refused; well aside it is not refused for that', !!(g5a.spot && g5a.spot.why === 'another tent stands there' && g5b.spot && g5b.spot.why === 'another tent stands there' && g5c.spot && g5c.spot.why !== 'another tent stands there'), { onIt: g5a.spot, halfOn: g5b.spot, aside: g5c.spot });

  // --- 6: the tarp's ghost over a friend's tarp and over a friend's tent ---------------------------------------------------
  const rigAt = (F) => ({ id: 'tg1', kind: 'poles', ends: ['pole', 'pole'], ax: F.x - 3, az: F.z - 2.5, ar: 0, bx: F.x + 0.5, bz: F.z - 2.5, br: 0, sc: 1.75, lh: 1.4, stage: 3, poles: 4 });
  await B.evaluate((q) => { const T = window.__game.tarp, r = T.rigOf({ ...q, ga: window.__game.tiles.groundAt(q.ax, q.az), gb: window.__game.tiles.groundAt(q.bx, q.bz) }); T.rigs.push(r); }, rigAt(L.fire));
  await until(A, (gid) => window.__game.tarp.others.some((r) => r.id === `p${gid}:tg1`), ids.guest, 8000).catch(() => null);
  const tarpOver = await A.evaluate((q) => { const T = window.__game.tarp, r = T.rigOf({ ...q, id: 'mine1', ga: window.__game.tiles.groundAt(q.ax, q.az), gb: window.__game.tiles.groundAt(q.bx, q.bz), stage: 0 }); return T.rigProblem(r); }, rigAt(L.fire));
  const tentRig = await A.evaluate((L) => { const c = window.__game.camp.camp, ux = -c.fdz, uz = c.fdx; return { id: 'tg2', kind: 'poles', ends: ['pole', 'pole'], ax: c.x - ux * 1.85, az: c.z - uz * 1.85, ar: 0, bx: c.x + ux * 1.85, bz: c.z + uz * 1.85, br: 0, sc: 1.85, lh: 1.5, stage: 0, poles: 4 }; }, L);
  const tarpOverTent = await B.evaluate((q) => { const T = window.__game.tarp, r = T.rigOf({ ...q, ga: window.__game.tiles.groundAt(q.ax, q.az), gb: window.__game.tiles.groundAt(q.bx, q.bz) }); return T.rigProblem(r); }, tentRig);
  result('6 the tarp is refused over a friend’s tarp and over a friend’s tent', tarpOver === 'another tarp is there' && tarpOverTent === 'a tent is there', { overTarp: tarpOver, overTent: tarpOverTent });
  await B.evaluate(() => { const T = window.__game.tarp; T.rigs = T.rigs.filter((r) => r.id !== 'tg1'); });

  // --- 7: the guest hangs a barrel; the host's hang there takes another limb, or is refused -------------------------------
  const hung = await B.evaluate((L) => {
    const g = window.__game, inv = g.inventory, hg = g.camp.hang, p = g.player;
    const c = inv.containers.find((k) => /^barrel/.test(k.item) && k.where !== 'hung');
    if (!c) return { none: inv.containers.map((k) => `${k.item}:${k.where}`) };
    // the tree nearest the ring that takes it
    let best = null;
    for (let r = 2; r < 25 && !best; r += 3) for (let a = 0; a < 12 && !best; a++) { const x = L.fire.x + Math.cos(a / 12 * Math.PI * 2) * r, z = L.fire.z + Math.sin(a / 12 * Math.PI * 2) * r, at = hg.treeFor(c, x, z); if (at) best = { at, px: x, pz: z }; }
    if (!best) return { none: 'no tree' };
    const s = best.spot = best.at.spot;
    inv.hang(c.id, { x: s.x, z: s.z, y: s.gy + 2.6, limb: s.limb, heading: 0 });
    c.at.tree = s.tree;
    inv.emit('hung');
    return { id: c.id, tree: { x: s.tree.x, z: s.tree.z }, px: best.px, pz: best.pz };
  }, L);
  log('[guest] hung', hung);
  let h7 = null;
  if (hung.tree) {
    await until(A, (gid) => [...window.__game.coopShare.friends.get(gid).mirror.containers].some((c) => c.where === 'hung'), ids.guest, 8000).catch(() => null);
    await sleep(300);
    h7 = await A.evaluate((h) => {
      const g = window.__game, inv = g.inventory, hg = g.camp.hang;
      let c = inv.containers.find((k) => /^barrel/.test(k.item) && k.where !== 'hung');
      if (!c) c = inv.addContainer('barrel30', 'ground', { x: h.px, z: h.pz, y: 0, heading: 0 }, { quiet: true });
      const at = hg.treeFor(c, h.px, h.pz);
      g.player.x = h.px; g.player.z = h.pz;
      const keep = g.camp.others; g.camp.others = null; const alone = hg.treeFor(c, h.px, h.pz); g.camp.others = keep; // (without the friend's barrel: that tree)
      return { tree: at ? { x: at.t.x, z: at.t.z } : null, sameTree: !!(at && Math.hypot(at.t.x - h.tree.x, at.t.z - h.tree.z) < 0.6), aloneSameTree: !!(alone && Math.hypot(alone.t.x - h.tree.x, alone.t.z - h.tree.z) < 0.6), why: at ? null : hg.hangRefused(c.id) };
    }, hung);
  }
  result('7 a hang on the limb the guest’s barrel hangs from is refused (another tree, or a reason)', !!(h7 && !h7.sameTree && h7.aloneSameTree), { guestTree: hung.tree, host: h7 });

  // --- 8: both pitch on one spot at once: the lower id's tent stands, the other is struck back into its pack ---------------
  await A.evaluate(() => { const c = window.__game.camp; if (c.camp) c.packTent({ quiet: true }); });
  await sleep(1200);
  const [s8a, s8b] = await Promise.all([stake(A, -6), stake(B, -6)]);
  log('both staked', s8a, s8b);
  await sleep(3000);
  const tents = { host: await A.evaluate(() => { const c = window.__game.camp.camp; return c ? c.stage : null; }), guest: await B.evaluate(() => { const c = window.__game.camp.camp; return c ? c.stage : null; }) };
  const lowHost = Number(ids.host) < Number(ids.guest);
  const guestTentBack = await B.evaluate(() => window.__game.inventory.containers.some((c) => c.grid.some((e) => (window.__game.items.itemDef(e.id) || {}).slot === 'tent')));
  result('8 two tents pitched on one spot at once: one stands (the lower id’s), the other is back in its pack', !!(s8a.ok && s8b.ok && (lowHost ? tents.host === 4 && tents.guest == null && guestTentBack : tents.guest === 4 && tents.host == null)), { staked: [s8a.ok, s8b.ok], tents, ids, guestTentBack });

  // --- 9: the host lets down the guest's hung barrel (E Lower, held); refused while the guest is mid-job on it -------------
  const auto = (page) => page.evaluate(() => { const h = window.__game.coop.g.hold; if (h.active) h.active.auto = true; return h.active ? h.active.id : null; });
  const steps = (page, n) => page.evaluate((n) => { const g = window.__game; for (let i = 0; i < n; i++) g.step(1 / 60, 1); }, n);
  const hb = hung.id ? `p${ids.guest}:${hung.id}` : null;
  const near0 = (page, ref, fn) => page.evaluate(({ ref, fn }) => {
    const g = window.__game, s = g.coopShare, p = g.player, f = s.ownerOf(ref), c = f && f.mirror.cont(ref);
    if (!c) return { none: 'not seen' };
    const near = { reach: 3, flat: (x, z) => Math.hypot(x - p.x, z - p.z), sphere: (x, y, z) => (Math.hypot(x - c.at.x, z - c.at.z) < 0.2 ? { t: 2, miss: 0 } : null), segment: () => null, box: () => null };
    const want = fn !== 'pick' ? `barrelHung:${ref}` : ref;
    const t = s.pointTargets(null, near).find((q) => q.target.ref === want);
    if (!t) return { none: s.pointTargets(null, near).map((q) => q.target.ref) };
    const out = { label: t.target.label, verb: t.target.e.verb, held: !!t.target.e.held, why: t.target.e.why, high: c.at.y };
    if (fn === 'lower') { out.ok = t.target.e.run({ key: 'KeyE' }); const h = g.coop.g.hold; if (h.active) h.active.auto = true; }
    if (fn === 'pick') out.ok = t.target.e.run();
    return out;
  }, { ref, fn });
  if (hb) {
    // the host under the barrel (a step from its rope)
    await A.evaluate((hb) => { const g = window.__game, c = g.coopShare.ownerOf(hb).mirror.cont(hb), p = g.player; p.x = c.at.x + 1.2; p.z = c.at.z + 0.3; g.step(1 / 60, 2); }, hb);
    const dot9 = await near0(A, hb, 'look');
    // the guest mid-job on it (a lower of its own under way): the host's ask is refused, the barrel stays up on both
    await B.evaluate((id) => { const h = window.__game.coop.g.hold; h.begin({ id: 'lower', ref: id, label: 'x', phases: [{ name: 'x', seconds: 60 }], auto: true, still: false }); }, hung.id);
    const y0 = await A.evaluate((hb) => { const s = window.__game.coopShare, f = s.ownerOf(hb), c = f.mirror.cont(hb), y = c.at.y; s.requestLower(f, c, y - 2, y); return y; }, hb);
    await until(A, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
    await sleep(400);
    const afterRefuse = await A.evaluate((hb) => { const s = window.__game.coopShare, c = s.ownerOf(hb).mirror.cont(hb); return { where: c.where, y: c.at.y, lowering: !!s.lowering }; }, hb);
    const guestStill = await B.evaluate((id) => { const c = window.__game.inventory.cont(id); return c && c.where; }, hung.id);
    await B.evaluate(() => window.__game.coop.g.hold.cancel());
    const refusedOk = afterRefuse.where === 'hung' && Math.abs(afterRefuse.y - y0) < 0.01 && !afterRefuse.lowering && guestStill === 'hung';
    // the hold, as the dot runs it
    const go = await near0(A, hb, 'lower');
    await auto(A);
    await steps(A, 110); // (1.8 s: untied, part way down)
    const mid = await A.evaluate((hb) => { const s = window.__game.coopShare, c = s.ownerOf(hb).mirror.cont(hb); return { y: c && c.at.y, job: window.__game.coop.g.hold.active && window.__game.coop.g.hold.active.id }; }, hb);
    await steps(A, 80);
    await until(A, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
    await until(B, (id) => { const c = window.__game.inventory.cont(id); return c && c.where === 'ground'; }, hung.id, 8000).catch(() => null);
    await sleep(500);
    const gSide = await B.evaluate((id) => { const c = window.__game.inventory.cont(id); return c ? { where: c.where, x: c.at && +c.at.x.toFixed(2), z: c.at && +c.at.z.toFixed(2) } : null; }, hung.id);
    const hSide = await A.evaluate((hb) => { const s = window.__game.coopShare, f = s.ownerOf(hb), c = f && f.mirror.cont(hb); return c ? { where: c.where, x: +c.at.x.toFixed(2), z: +c.at.z.toFixed(2) } : null; }, hb);
    result('9 the host lets down the guest’s hung barrel (E Lower, held), not while the guest is mid-job on it', !!(dot9 && dot9.verb === 'Lower' && dot9.held && refusedOk && go.ok && mid.y < go.high - 0.2 && gSide && gSide.where === 'ground' && hSide && hSide.where === 'ground' && Math.abs(gSide.x - hSide.x) < 0.05), { dot: dot9, refused: { y0, afterRefuse, guestStill }, go, mid, guest: gSide, host: hSide });
  } else result('9 the host lets down the guest’s hung barrel', false, { why: 'no barrel hung in 7' });

  // --- 10: the lowered barrel is shared: a take, then picked up whole and hung again by the host ----------------------------
  if (hb) {
    await B.evaluate((id) => { const inv = window.__game.inventory, c = inv.cont(id); if (!c.grid.some((e) => !e.box)) inv.put(c, 'meal:breakfast', { qty: 2 }); }, hung.id);
    await A.evaluate(() => { const inv = window.__game.inventory, p = window.__game.player; for (const c of inv.containers.filter((k) => k.where === 'hands' || k.where === 'back')) inv.setDown(c.id, { x: p.x + 2, z: p.z - 1, heading: 0 }, { force: true }); for (const l of inv.long.filter((k) => k.where === 'hands')) inv.setDown(l.uid, { x: p.x + 2, z: p.z - 1.5, heading: 0 }, { force: true }); });
    await until(A, (hb) => window.__game.coopShare.tabs().some((t) => t.key === hb && t.n > 0), hb, 8000).catch(() => null);
    const tk = await A.evaluate((hb) => {
      const g = window.__game, t = g.coopShare.tabs().find((q) => q.key === hb), e = t && t.bin.items[0];
      if (!e) return { none: g.coopShare.tabs().map((q) => q.key) };
      const before = g.inventory.count(e.id, { reachable: false });
      const r = t.bin.take({ uid: e.uid, itemId: e.id, toCId: null, qty: 1 });
      return { id: e.id, before, r, sub: t.sub };
    }, hb);
    await until(A, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
    const gained = tk.id ? (await A.evaluate((id) => window.__game.inventory.count(id, { reachable: false }), tk.id)) - tk.before : 0;
    await A.evaluate((hb) => { const g = window.__game, c = g.coopShare.ownerOf(hb).mirror.cont(hb), p = g.player; p.x = c.at.x + 0.9; p.z = c.at.z; }, hb);
    const pk = await near0(A, hb, 'pick');
    await until(A, () => window.__game.coopShare.pending.size === 0, null, 8000).catch(() => null);
    await sleep(500);
    const mine = await A.evaluate((item) => { const c = window.__game.inventory.containers.find((k) => k.item === item && ['back', 'chest', 'hands'].includes(k.where)); return c ? { id: c.id, where: c.where } : null; }, hung.item || 'barrel30');
    const hang10 = await A.evaluate(() => { const hg = window.__game.camp.hang, t = hg.treeTarget(); if (!t) return { none: true }; t.run({ key: 'KeyE' }); const h = window.__game.coop.g.hold; if (h.active) h.active.auto = true; return { tree: t.t.name, verb: t.verb }; });
    await auto(A);
    for (let i = 0; i < 8; i++) await steps(A, 60);
    const up = mine ? await A.evaluate((id) => { const c = window.__game.inventory.cont(id); return c ? { where: c.where, up: c.at && c.at.up } : null; }, mine.id) : null;
    await sleep(800);
    const guestSees = mine ? await B.evaluate(({ id, hid }) => { const f = window.__game.coopShare.friends.get(hid), c = f && f.mirror.cont(`p${hid}:${id}`); return c ? c.where : null; }, { id: mine.id, hid: ids.host }) : null;
    const gone = await B.evaluate((id) => !window.__game.inventory.cont(id), hung.id);
    result('10 the lowered barrel is shared: the host takes from it, picks it up whole and hangs it again', !!(gained > 0 && pk.ok && mine && gone && up && up.where === 'hung' && up.up === true && guestSees === 'hung'), { take: { ...tk, gained }, pick: pk, host: mine, hang: hang10, up, guestSees, goneFromGuest: gone });
  }

  // --- 11: both pitch a tarp on one spot at once ----------------------------------------------------------------------------
  await Promise.all([A, B].map((pg) => pg.evaluate(() => { const c = window.__game.camp; if (c.camp) c.packTent({ quiet: true }); })));
  await sleep(1200);
  const tq = { kind: 'poles', ends: ['pole', 'pole'], ax: L.fire.x - 3, az: L.fire.z + 3.5, ar: 0, bx: L.fire.x + 0.5, bz: L.fire.z + 3.5, br: 0, sc: 1.75, lh: 1.4, poles: 0 };
  const giveTarp = (page) => page.evaluate(() => { const g = window.__game, inv = g.inventory; let k = inv.worn('back'); if (!k || !/^pack/.test(k.item)) { if (k) inv.setDown(k.id, null, { force: true }); k = inv.addContainer('pack3', 'back'); } inv.put(k, 'tarp'); return inv.count('tarp', { reachable: false }); });
  const tarps0 = { host: await giveTarp(A), guest: await giveTarp(B) };
  const pitchTarp = (page) => page.evaluate((q) => {
    const g = window.__game, T = g.tarp, inv = g.inventory, p = g.player; p.x = q.ax + 1.5; p.z = q.az + 1;
    let uid = null;
    for (const c of T.pool()) for (const e of c.grid) if (!uid && e.id === 'tarp') uid = e.uid;
    const r = T.rigOf({ ...q, id: 'x', ga: g.tiles.groundAt(q.ax, q.az), gb: g.tiles.groundAt(q.bx, q.bz), stage: 1 }); r.stage = 0; r.placed = false;
    const ok = T.place(r, uid);
    if (ok) T.setStage(r, 3);
    return { ok, uid, tarps: inv.count('tarp', { reachable: false }) };
  }, tq);
  const [p11a, p11b] = await Promise.all([pitchTarp(A), pitchTarp(B)]);
  log('both pitched', p11a, p11b);
  await sleep(3000);
  const tarpsOn = (page) => page.evaluate(() => { const T = window.__game.tarp; return { mine: T.rigs.filter((r) => r.stage >= 1).length, theirs: T.others.filter((r) => r.stage >= 1).length, tarps: window.__game.inventory.count('tarp', { reachable: false }) }; });
  const t11 = { host: await tarpsOn(A), guest: await tarpsOn(B) };
  const lowH = Number(ids.host) < Number(ids.guest), win = lowH ? 'host' : 'guest', lose = lowH ? 'guest' : 'host';
  result('11 two tarps pitched on one spot at once: one stands (the lower id’s) on both screens, the other back in its pack', !!(p11a.ok && p11b.ok && t11[win].mine === 1 && t11[win].theirs === 0 && t11[lose].mine === 0 && t11[lose].theirs === 1 && t11[lose].tarps === tarps0[lose] && t11[win].tarps === tarps0[win] - 1), { pitched: [p11a, p11b], before: tarps0, after: t11, ids });

  // --- 12: both hang a barrel on one limb at once -----------------------------------------------------------------------------
  const spot12 = await A.evaluate((L) => {
    const g = window.__game, inv = g.inventory, hg = g.camp.hang;
    for (const c of inv.containers.filter((k) => k.where === 'hung')) inv.setDown(c.id, { x: c.at.x, z: c.at.z, heading: 0 }, { force: true });
    const probe = { item: 'barrel30' };
    for (let r = 2; r < 25; r += 3) for (let a = 0; a < 12; a++) { const x = L.fire.x + Math.cos(a / 12 * Math.PI * 2 + 0.3) * r, z = L.fire.z + Math.sin(a / 12 * Math.PI * 2 + 0.3) * r, at = hg.treeFor(probe, x, z); if (at) return { px: x, pz: z, tree: { x: at.t.x, z: at.t.z } }; }
    return null;
  }, L);
  if (spot12) {
    await sleep(800);
    const ready = (page) => page.evaluate((s) => {
      const g = window.__game, inv = g.inventory, p = g.player;
      for (const c of inv.containers.filter((k) => k.where === 'hands')) inv.setDown(c.id, { x: s.px + 3, z: s.pz + 3, heading: 0 }, { force: true });
      for (const l of inv.long.filter((k) => k.where === 'hands')) inv.setDown(l.uid, { x: s.px + 3, z: s.pz + 3.5, heading: 0 }, { force: true });
      const c = inv.addContainer('barrel30', 'hands', null, { hand: 0 });
      inv.put(c, 'meal:breakfast', { qty: 1 });
      p.x = s.px; p.z = s.pz; g.step(1 / 60, 2);
      return c.id;
    }, spot12);
    const bid = { host: await ready(A), guest: await ready(B) };
    const begin = (page) => page.evaluate(() => { const g = window.__game, t = g.camp.hang.treeTarget(); if (!t) return null; t.run({ key: 'KeyE' }); g.coop.g.hold.active.auto = true; return { x: +t.t.x.toFixed(2), z: +t.t.z.toFixed(2), c: t.c.id }; });
    const trees = await Promise.all([begin(A), begin(B)]);
    for (let i = 0; i < 16; i++) { await Promise.all([steps(A, 30), steps(B, 30)]); await sleep(120); }
    await sleep(2500);
    const state = (page, id, fid) => page.evaluate(({ id, fid }) => {
      const g = window.__game, c = g.inventory.cont(id), f = g.coopShare.friends.get(fid);
      return { mine: c ? { where: c.where, up: c.at ? c.at.up ?? null : null, oat: c.grid.filter((e) => e.id === 'meal:breakfast').length } : null, theirsHung: f ? f.mirror.containers.filter((k) => k.where === 'hung').length : null, job: g.coop.g.hold.active ? g.coop.g.hold.active.id : null, clashes: g.coopShare.n.clashLog || [] };
    }, { id, fid });
    const s12 = { host: await state(A, bid.host, ids.guest), guest: await state(B, bid.guest, ids.host) };
    const w = s12[win], l = s12[lose];
    result('12 two barrels hung on one limb at once: one stays up (the lower id’s), the other is down at the rope’s foot', !!(trees[0] && trees[1] && trees[0].x === trees[1].x && w.mine && w.mine.where === 'hung' && w.mine.up === true && w.theirsHung === 0 && l.mine && l.mine.where === 'ground' && l.mine.oat === 1 && l.theirsHung === 1 && !l.job), { trees, bid, s12 });
  } else result('12 two barrels hung on one limb at once', false, { why: 'no tree' });

  await A.screenshot({ path: path.join(OUT, 'host.png') });
} catch (e) { log('ERROR', e && e.stack || e); results.push({ name: 'run', pass: false, error: String(e) }); }
finally {
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  for (const b of browsers) await b.close().catch(() => {});
  log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}
