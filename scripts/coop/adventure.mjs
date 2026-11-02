// Co-op phase 3, stream C's rig (src/coop-trip.js): two headless Chromiums (one browser process each, as dock.mjs)
// through `wrangler dev` with a delay, in an Adventure season. The host begins a season at Lake One and opens the room in
// the store; the guest joins and is tied up at the host's dock in another berth; buys with their own purse (the host's is
// untouched); takes a notice off the host's board (the host sees it torn off and cannot take it too); a ride asked by the
// guest is a group jump (both tick, both land at the far store in their own berths, the clocks agreeing); there the
// guest paddles off and the group's trip pushes off on both screens; then the guest alone is evacuated (moved to the
// outfitter, nobody's clock jumped, the trip still under way).
//   APP=http://localhost:5298 RELAY=ws://localhost:8798 node scripts/coop/adventure.mjs [--out dir] [--shots dir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5298';
const RELAY = process.env.RELAY || 'ws://localhost:8798';
const OUT = path.resolve(arg('out', 'coop-adventure-out'));
const SHOTS = arg('shots', null);
mkdirSync(OUT, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

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
const shot = async (page, name) => { if (!SHOTS) return; try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch (e) { log('shot', name, e.message); } };

async function openGame(name, query = '') {
  const browser = await launch(); browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /coop/i.test(m.text())) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${query}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.coop && window.__game.title && window.__game.coopTrip, null, { timeout: 240000, polling: 500 });
  log(`[${name}] game loaded`);
  return page;
}
const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
const clockOf = (page) => page.evaluate(() => { const d = window.__game.day; return { abs: d.doy * 24 + d.hours, hours: d.hours, doy: d.doy, t: Date.now() }; });

try {
  // --- the host: an Adventure season at Lake One, in the store ----------------------------------------------------------
  const A = await openGame('host');
  await A.evaluate(async () => {
    const g = window.__game, t = g.title;
    const ep = g.world.entryPoints.find((e) => e.name === 'Lake One') || g.world.entryPoints[0];
    t.setPick('adventure');
    await t.newSeason(ep, { confirm: false, start: { year: new Date().getFullYear(), doy: 166 } }); // (a June morning: the wizard's start hour, not the real clock's, so a ride is never a late one)
  });
  await until(A, () => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 120000);
  const host = await A.evaluate(() => { const g = window.__game, o = g.outfitter, p = g.player, d = p.carry && p.carry.drop; if (o.open) o.hide(); return { ep: o.visit.ep, drop: d ? { x: d.x, z: d.z } : null, money: g.profile.money, mode: g.trip.mode }; });
  log('[host] in the store', host);
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
  log('[host] code', code);
  result('Invite friends is open in an Adventure season', !!code && host.mode === 'adventure', { code, mode: host.mode });

  // --- the guest joins: tied up at the host's dock, another berth ----------------------------------------------------
  const B = await openGame('guest', `&join=${code}`);
  await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
  await B.fill('#coop-name', 'Ada');
  await B.click('#coop-go');
  await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
  let arrived = null;
  try {
    await until(B, (ep) => { const g = window.__game, o = g.outfitter; return g.trip.adventure && o.visit && o.visit.ep === ep && !o.arrival && g.player.onFoot && g.coopGive.mine; }, host.ep, 90000);
    arrived = await B.evaluate(() => { const g = window.__game, o = g.outfitter, p = g.player, d = p.carry && p.carry.drop; if (o.open) o.hide(); return { ep: o.visit.ep, drop: d ? { x: d.x, z: d.z } : null, mode: g.trip.mode, money: g.profile.money, at: { x: p.x, z: p.z } }; });
  } catch (e) { arrived = await B.evaluate(() => { const g = window.__game, o = g.outfitter; return { err: true, visit: o.visit && o.visit.ep, arrival: o.arrival, mode: g.trip.mode, ct: g.coopTrip.stats() }; }); }
  const apart = arrived && arrived.drop && host.drop ? Math.hypot(arrived.drop.x - host.drop.x, arrived.drop.z - host.drop.z) : 0;
  result('the guest arrives at the host\'s store, tied up in another berth', !!(arrived && arrived.ep === host.ep && apart >= 2.6), { ...arrived, apart: +apart.toFixed(2) });
  result('the guest takes the host\'s Adventure mode', !!(arrived && arrived.mode === 'adventure'), { mode: arrived && arrived.mode });
  await sleep(1500);
  await shot(A, '1-host-sees-guest-at-store');
  await shot(B, '1-guest-at-store');

  // --- the guest buys with their own purse ---------------------------------------------------------------------------
  const hostMoney0 = await A.evaluate(() => window.__game.profile.money);
  const buy = await B.evaluate((ep) => {
    const g = window.__game, sh = g.shop, m0 = g.profile.money;
    const stock = ['food', 'tackle', 'gear'].flatMap((k) => sh.shelfStock(k, ep));
    const it = stock.map((x) => ({ id: x.id, price: sh.price(x.id, ep) })).filter((x) => x.price > 0 && x.price <= m0).sort((a, b) => a.price - b.price)[0];
    if (!it) return { none: true, m0 };
    const r = sh.buyItem(it.id, ep, null, 1);
    return { id: it.id, price: it.price, ok: !!(r && (r.ok !== false)), r: r && typeof r === 'object' ? { ok: r.ok, why: r.why } : r, m0, m1: g.profile.money, free: sh.free };
  }, host.ep);
  await sleep(2000);
  const hostMoney1 = await A.evaluate(() => window.__game.profile.money);
  result('the guest buys with their own money (prices real), the host\'s purse unchanged', !!(buy.m1 < buy.m0 && buy.m0 - buy.m1 === buy.price && hostMoney1 === hostMoney0 && !buy.free), { ...buy, hostMoney0, hostMoney1 });

  // --- a notice off the host's board -----------------------------------------------------------------------------------
  await until(A, (ep) => window.__game.tasks.board(ep).some((t) => t && t.status === 'offered'), host.ep, 90000);
  const offered = await A.evaluate((ep) => window.__game.tasks.board(ep).filter((t) => t && t.status === 'offered').map((t) => ({ id: t.id, title: t.title, kind: t.kind })), host.ep);
  log('[host] board', offered);
  await until(B, (ids) => { const g = window.__game; return g.coopTrip.mirrored && ids.every((id) => g.tasks.ads.has(id)); }, offered.map((t) => t.id), 30000);
  const pick = offered.find((t) => t.kind !== 'secchi') || offered[0];
  const tk0 = Date.now();
  await B.evaluate(({ id, ep }) => { const g = window.__game; g.outfitter.show(g.outfitter.landing(ep), 'board'); g.tasks.act(`take:${id}`, ep); }, { id: pick.id, ep: host.ep });
  await until(B, (id) => { const t = window.__game.tasks.ads.get(id); return t && t.status === 'open'; }, pick.id, 30000);
  await until(A, (id) => { const t = window.__game.tasks.ads.get(id); return t && t.status === 'open'; }, pick.id, 30000);
  const takeMs = Date.now() - tk0;
  const seen = await A.evaluate((id) => { const T = window.__game.tasks, t = T.ads.get(id); const again = T.take(id); return { status: t.status, by: t.by, again }; }, pick.id);
  const guestT = await B.evaluate((id) => { const t = window.__game.tasks.ads.get(id); return { status: t.status, by: t.by, active: window.__game.tasks.active.length }; }, pick.id);
  result('the guest takes a notice off the host\'s board; the host sees it taken and can\'t take it too', seen.status === 'open' && seen.by === 'Ada' && seen.again === false && guestT.status === 'open', { notice: pick.title, takeMs, host: seen, guest: guestT });
  await shot(B, '2-guest-board-taken');
  await B.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
  await A.evaluate((ep) => { const g = window.__game; g.outfitter.show(g.outfitter.landing(ep), 'board'); }, host.ep);
  await sleep(500);
  await shot(A, '2-host-board-torn');
  await A.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });

  // --- a ride as a group jump ------------------------------------------------------------------------------------------
  const ride = await B.evaluate((ep) => {
    const g = window.__game, R = g.rides, money = g.profile.money;
    const rows = R.offer(ep).filter((r) => r.price <= money && !r.late).sort((a, b) => a.price - b.price);
    return rows.length ? { to: rows[0].ep, name: rows[0].name, price: rows[0].price, hours: rows[0].hours, money } : { none: true, money };
  }, host.ep);
  log('[guest] ride', ride);
  const c0 = await clockOf(A);
  const g0 = await B.evaluate(() => window.__game.profile.money), h0 = await A.evaluate(() => window.__game.profile.money);
  await B.evaluate((to) => { window.__game.outfitter.show(window.__game.outfitter.landing(window.__game.outfitter.visit.ep)); return window.__game.rides.act(String(to)); }, ride.to);
  await until(A, () => !!window.__game.coopTrip.prop, null, 40000);
  await sleep(600);
  await shot(A, '3-host-ride-card');
  const prop = await A.evaluate(() => { const ct = window.__game.coopTrip; return { ...ct.prop, card: document.getElementById('coop-jump') && document.getElementById('coop-jump').innerText }; });
  await A.evaluate(() => window.__game.coopTrip.tick(true));
  const there = (page, to) => until(page, (ep) => { const g = window.__game, o = g.outfitter; return o.visit && o.visit.ep === ep && !o.arrival && !g.player.teleporting && !(g.veil && g.veil.active) && !g.coopTrip.jumping; }, to, 120000);
  await Promise.all([there(A, ride.to), there(B, ride.to)]);
  await sleep(1500);
  const [cA, cB] = await Promise.all([clockOf(A), clockOf(B)]);
  const errB = await B.evaluate(() => window.__game.coop.clockErr);
  const dA = await A.evaluate(() => { const p = window.__game.player, d = p.carry && p.carry.drop; return d ? { x: d.x, z: d.z } : null; });
  const dB = await B.evaluate(() => { const p = window.__game.player, d = p.carry && p.carry.drop; return d ? { x: d.x, z: d.z } : null; });
  const g1 = await B.evaluate(() => window.__game.profile.money), h1 = await A.evaluate(() => window.__game.profile.money);
  const jumped = cA.abs - c0.abs, skew = Math.abs((cA.abs - cB.abs) * 3600 / 8) - Math.abs(cA.t - cB.t) / 1000;
  const berthApart = dA && dB ? Math.hypot(dA.x - dB.x, dA.z - dB.z) : 0;
  result('a ride is a group jump: both tick, both land at the destination, clocks agreeing', jumped >= ride.hours * 0.9 && Math.abs(cA.abs - cB.abs) * 3600 / 8 < 1.5 && berthApart >= 2.6,
    { to: ride.to, rideH: ride.hours, jumpedH: +jumped.toFixed(3), hostClock: +cA.hours.toFixed(4), guestClock: +cB.hours.toFixed(4), realSkewS: +((cA.abs - cB.abs) * 3600 / 8).toFixed(2), sampleGapMs: cB.t - cA.t, clockErrS: errB, berthApart: +berthApart.toFixed(2), card: prop.card, fares: { guest: g0 - g1, host: h0 - h1 }, skewAdj: +skew.toFixed(2) });
  await shot(A, '4-host-after-ride');
  await shot(B, '4-guest-after-ride');

  // --- a night in the bunkhouse, a group jump too: asked by the host this time ------------------------------------------
  const k0 = await clockOf(A), bm0 = await Promise.all([A, B].map((P) => P.evaluate(() => window.__game.profile.money)));
  await A.evaluate((ep) => { const o = window.__game.outfitter; o.show(o.landing(ep)); o.act('bunk'); }, ride.to);
  await until(B, () => !!window.__game.coopTrip.prop, null, 40000);
  await B.evaluate(() => window.__game.coopTrip.tick(true));
  const slept = (page) => until(page, () => { const g = window.__game, o = g.outfitter; return !o.bunking && !(g.veil && g.veil.active) && !g.coopTrip.jumping && g.day.hours > 6.9 && g.day.hours < 8; }, null, 120000);
  await Promise.all([slept(A), slept(B)]);
  await sleep(1500);
  const [kA, kB] = await Promise.all([clockOf(A), clockOf(B)]);
  const bm1 = await Promise.all([A, B].map((P) => P.evaluate(() => window.__game.profile.money)));
  result('the bunkhouse is a group jump: both sleep, both wake at seven, clocks agreeing', kA.doy === k0.doy + 1 && Math.abs(kA.abs - kB.abs) * 3600 / 8 < 1.5,
    { before: +k0.hours.toFixed(3), hostWoke: +kA.hours.toFixed(4), guestWoke: +kB.hours.toFixed(4), realSkewS: +((kA.abs - kB.abs) * 3600 / 8).toFixed(2), paid: { host: bm0[0] - bm1[0], guest: bm0[1] - bm1[1] } });
  await Promise.all([A, B].map((P) => P.evaluate(() => { const o = window.__game.outfitter; o.pendingShow = false; if (o.open) o.hide(); })));
  await shot(B, '4b-guest-after-bunk');

  // --- the push-off: the guest leaves the landing ----------------------------------------------------------------------
  const before = await A.evaluate(() => window.__game.trip.active);
  const p0 = Date.now();
  await B.evaluate(async (ep) => {
    const g = window.__game, o = g.outfitter, p = g.player, L = o.layout(ep), b = o.visit.berth ? o.visit.berth.side : L.dockSide, dd = g.world.deeperDir(b.x, b.z);
    await p.teleport(b.x + dd.x * 45, b.z + dd.z * 45);
  }, ride.to);
  await until(A, () => window.__game.trip.active, null, 30000);
  await until(B, () => window.__game.trip.active, null, 30000);
  const pushMs = Date.now() - p0;
  const trips = await Promise.all([A, B].map((P) => P.evaluate(() => { const c = window.__game.trip, s = c.state, l = s.log[s.log.length - 1]; return { active: c.active, id: s.id, from: s.from, last: l ? { k: l.k, who: l.who } : null, otrip: window.__game.outfitter.trip.active }; })));
  const hostLog = await A.evaluate(() => window.__game.trip.state.log.map((e) => ({ k: e.k, who: e.who })));
  result('the guest leaving the landing pushes the group\'s trip off on both screens, logged with who', !before && trips[0].active && trips[1].active && trips[0].id === trips[1].id && trips[1].otrip && hostLog.some((e) => (e.k === 'start' || e.k === 'leave') && e.who === 'Ada'),
    { pushMs, host: trips[0], guest: trips[1], hostLog: hostLog.slice(-4) });
  await sleep(1200);
  await shot(B, '5-guest-pushed-off');
  await shot(A, '5-host-sees-push-off');

  // --- an evacuation: the guest alone, nobody's clock jumped -------------------------------------------------------------
  // (the host out on the water too, so the trip does not come in with everyone ashore)
  await A.evaluate(async (ep) => {
    const g = window.__game, o = g.outfitter, p = g.player, L = o.layout(ep), b = o.visit && o.visit.berth ? o.visit.berth.side : L.dockSide, dd = g.world.deeperDir(b.x, b.z);
    await p.teleport(b.x + dd.x * 60 + dd.z * 30, b.z + dd.z * 60 - dd.x * 30);
  }, ride.to);
  await sleep(1500);
  const e0A = await clockOf(A), e0B = await clockOf(B);
  await B.evaluate(() => window.__game.trip.evacuate('food'));
  await until(B, () => { const g = window.__game, o = g.outfitter; return !g.trip.evacuating && o.visit && !o.arrival && g.player.onFoot && !(g.veil && g.veil.active); }, null, 120000);
  await sleep(1500);
  const [e1A, e1B] = await Promise.all([clockOf(A), clockOf(B)]);
  const realS = (e1A.t - e0A.t) / 1000, expectH = realS * 8 / 3600;
  const evac = await Promise.all([A, B].map((P) => P.evaluate(() => { const g = window.__game; return { active: g.trip.active, id: g.trip.state.id, onFoot: g.player.onFoot, mode: g.player.mode, visit: g.outfitter.visit && g.outfitter.visit.ep }; })));
  const evLog = await A.evaluate(() => window.__game.trip.state.log.filter((e) => e.k === 'evac').map((e) => ({ who: e.who, to: e.to })));
  result('one player evacuated alone: moved to the outfitter, no clock jumped, the trip goes on', e1A.abs - e0A.abs < expectH + 0.05 && e1B.abs - e0B.abs < expectH + 0.05 && Math.abs(e1A.abs - e1B.abs) * 3600 / 8 < 1.5 && evac[0].active && evac[1].active && evac[1].onFoot && evac[1].visit != null && evLog.some((e) => e.who === 'Ada'),
    { realS: +realS.toFixed(1), hostDH: +(e1A.abs - e0A.abs).toFixed(4), guestDH: +(e1B.abs - e0B.abs).toFixed(4), expectH: +expectH.toFixed(4), host: evac[0], guest: evac[1], evLog });
  await shot(B, '6-guest-evacuated');
} catch (e) { log('ERROR', e && e.stack || e); results.push({ name: 'run', pass: false, error: String(e) }); }
finally {
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  for (const b of browsers) await b.close().catch(() => {});
  log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}
