// The co-op phase 3 rig for the night together (src/coop-night.js; docs/plans/coop.md "Rest and sleep: everyone, and
// one wake time"): two headless Chromiums (one browser process each, as share.mjs) join one room through `wrangler dev`
// and pitch at one campsite in Sandbox. Then:
//   1 the guest opens the dial: the proposal is on the host, by the guest
//   2 the host's dial opens on the same time
//   3 the guest ticks (E); the host turns the dial (→): the time moves on the guest's dial and the guest's tick clears
//   4 one player still up: the host ticks, the guest gets up (Esc): nothing happens, the guest's chip says so
//   5 the guest back in (the dial opens on the host's time) and ticks: the night runs once on both (clocks at the wake
//     time within 1 s, one jump in the room, energy.sleep on both)
//   6 a nap: the same dial by day, a short wake time, both tick
//   7 the fetch (packs.js) is not offered in a room
//   8 the guest drops from the room: the host alone in the tent waits a minute (the guest counted asleep), then sleeps
//
//   cd server/room && npx wrangler dev --port 8796 --var DELAY_MS:100
//   npx vite --port 5296
//   APP=http://localhost:5296 RELAY=ws://localhost:8796 node scripts/coop/night.mjs [--out dir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5296';
const RELAY = process.env.RELAY || 'ws://localhost:8796';
const OUT = path.resolve(arg('out', 'coop-night-out'));
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
  await page.waitForFunction(() => window.__game && window.__game.coop && window.__game.title && typeof window.__game.step === 'function', null, { timeout: 240000, polling: 500 });
  log(`[${name}] game loaded`);
  return page;
}
const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 100 });
const ok = (p) => p.then(() => true, () => false);
const key = (page, code) => page.evaluate((code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); }, code);
const night = (page) => page.evaluate(() => window.__game.coopNight.stats());
// the clock as hours since the year began, and the clock's speed (game hours a real second)
const clock = (page) => page.evaluate(() => { const d = window.__game.day; return { abs: d.doy * 24 + d.hours, doy: d.doy, hours: d.hours, hps: (d.hoursPerSecond || 1 / 3600) * d.rate, jumps: d.jumps || 0 }; });

try {
  // --- the host: Sandbox, Lake One, on foot at a campsite --------------------------------------------------------------
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
    g.day.setClock(2026, 190, 21.4); g.day.running = true; // a July evening
    return { x: s.x, z: s.z };
  });
  await until(A, (s) => { const c = window.__game.camp.nearestSite(s.x, s.z, 80, true); return !!(c && c.layout); }, site, 60000);
  const L = await A.evaluate((s) => {
    const g = window.__game, c = g.camp.nearestSite(s.x, s.z, 80, true), F = c.layout.fire, P = c.layout.pad;
    const p = g.player, a = Math.atan2(P.x - F.x, P.z - F.z);
    const ok = p.standAt({ x: F.x + 2.2, z: F.z + 0.4, heading: 0, drop: { x: F.x + Math.sin(a + Math.PI) * 6, z: F.z + Math.cos(a + Math.PI) * 6, heading: 0 } })
      || p.standAt({ x: F.x + 2.2, z: F.z + 0.4, heading: 0, drop: { x: F.x + 3, z: F.z + 3, heading: 0 } });
    g.chase.snap && g.chase.snap();
    return { ok, key: g.camp.registry.key(c), fire: { x: F.x, z: F.z }, pad: { ...P } };
  }, site);
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
  log('[host] trip open, code', code);

  // --- the guest ----------------------------------------------------------------------------------------------------
  const B = await openGame('guest', `&join=${code}`);
  await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
  await B.fill('#coop-name', 'Ada');
  await B.click('.coop-card .swatch[data-shirt="4"]');
  await B.click('#coop-go');
  await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
  await until(A, () => window.__game.coop.remotes.size === 1);
  await until(B, (s) => { const c = window.__game.camp.nearestSite(s.x, s.z, 80, true); return !!(c && c.layout); }, site, 60000);
  await B.evaluate((L) => { const g = window.__game, p = g.player, F = L.fire; if (g.outfitter.open) g.outfitter.hide(); p.standAt({ x: F.x - 1.6, z: F.z + 0.8, heading: Math.PI / 2, drop: { x: F.x - 3, z: F.z - 4, heading: 0 } }); g.chase.snap && g.chase.snap(); }, L);
  const pitchTent = async (page, off) => page.evaluate(({ L, off }) => {
    const g = window.__game, camp = g.camp, inv = g.inventory, site = camp.registry.site(L.key), P = L.pad;
    const x = P.x - P.fdz * off, z = P.z + P.fdx * off;
    const p = g.player; p.x = x - P.fdx * 2; p.z = z - P.fdz * 2;
    let tent = null;
    for (const c of inv.containers) for (const e of c.grid) if (!tent && !e.box && (window.__game.items.itemDef(e.id) || {}).slot === 'tent') tent = camp.tentByUid(e.uid) || { c, e, def: window.__game.items.itemDef(e.id) };
    if (!tent) return { none: 'no tent' };
    const spot = camp.ghostAt(site, tent.def.id, x, z, P.fdx, P.fdz) || { x, z, fdx: P.fdx, fdz: P.fdz };
    const ok = camp.stake(spot, tent, site);
    if (ok) camp.setStage(camp.camp, 4);
    return { ok, stage: camp.camp && camp.camp.stage };
  }, { L, off });
  const pitched = [await pitchTent(A, 0), await pitchTent(B, 3.4)];
  log('pitched', pitched);
  // energy.sleep counted on both (the night's rest, from each browser's own tent)
  for (const P of [A, B]) await P.evaluate(() => { const e = window.__game.energy, s = e.sleep.bind(e); window.__slept = []; e.sleep = (q, h, o) => { window.__slept.push({ q: +q.toFixed(3), h: +(+h).toFixed(3) }); return s(q, h, o); }; });
  await sleep(2000);
  const ids = { host: await A.evaluate(() => window.__game.coop.id), guest: await B.evaluate(() => window.__game.coop.id) };

  // --- 7 (first: nothing else on screen): the fetch in a room ------------------------------------------------------
  const fetch = await Promise.all([A, B].map((P) => P.evaluate(() => { const k = window.__game.packs, j = window.__game.day.jumps; const r = k.fetch([], { hours: 1, units: [], trips: 1 }); return { inRoom: k.inRoom(), refused: r === false && !k.busy, jumps: window.__game.day.jumps - j }; })));
  result('7 the fetch is not offered in a room (packs.inRoom, fetch refused, no jump)', fetch.every((f) => f.inRoom && f.refused && f.jumps === 0), { fetch });

  // --- 1: the guest opens the dial -------------------------------------------------------------------------------------
  const t1 = Date.now();
  const gOpen = await B.evaluate(() => { const c = window.__game.camp; const r = c.restDial(); return { r, open: c.dialOpen, at: c.dial && c.dial.at }; });
  const got1 = await ok(until(A, (gid) => { const s = window.__game.coopNight.stats(); return !!(s.prop && s.prop.by === gid); }, ids.guest, 5000));
  const hp1 = await night(A);
  result('1 the guest opens the dial: the proposal is on the host, by the guest', got1 && Math.abs(hp1.prop.wakeAt - gOpen.at) < 0.01, { ms: Date.now() - t1, guestAt: gOpen.at, hostProp: hp1.prop });

  // --- 2: the host's dial opens on it --------------------------------------------------------------------------------
  await A.evaluate(() => window.__game.camp.dial && window.__game.camp.dial.isOpen ? null : null);
  const hOpen = await A.evaluate(() => { const c = window.__game.camp; c.restDial(); return { open: c.dialOpen, at: c.dial.at }; });
  await ok(until(B, () => window.__game.coopNight.stats().rows.filter((r) => r.in).length === 2, null, 5000));
  result('2 the host’s dial opens on the guest’s time', hOpen.open && Math.abs(hOpen.at - gOpen.at) < 0.01, { hostAt: hOpen.at, guestAt: gOpen.at });

  // --- 3: the guest ticks; the host turns the dial; the guest's tick clears --------------------------------------------
  await key(B, 'KeyE');
  const ticked = await ok(until(A, (gid) => { const r = window.__game.coopNight.stats().rows.find((q) => q.id === gid); return r && r.tick != null; }, ids.guest, 5000));
  await sleep(400);
  await B.screenshot({ path: path.join(OUT, 'shared-dial-guest.png') });
  await A.screenshot({ path: path.join(OUT, 'shared-dial-host.png') });
  const t3 = Date.now();
  await key(A, 'ArrowRight');
  const hostAt = await A.evaluate(() => window.__game.camp.dial.at);
  const moved = await ok(until(B, (at) => { const g = window.__game, s = g.coopNight.stats(), me = s.rows.find((r) => r.id === g.coop.id); return Math.abs(g.camp.dial.at - at) < 0.01 && me && me.tick == null; }, hostAt, 5000));
  result('3 the guest ticks; the host turns the dial: the guest’s dial moves, the guest’s tick clears', ticked && moved, { ms: Date.now() - t3, from: gOpen.at, to: hostAt, guestDial: await B.evaluate(() => window.__game.camp.dial.at) });

  // --- 4: one player still up ---------------------------------------------------------------------------------------
  await key(A, 'KeyE'); // the host agrees to its own time
  await ok(until(A, (hid) => { const r = window.__game.coopNight.stats().rows.find((q) => q.id === hid); return r && r.tick != null; }, ids.host, 3000));
  await key(B, 'Escape'); // the guest gets up
  await sleep(3500);
  const s4 = { host: await night(A), guest: await night(B), hostClock: await clock(A) };
  const stillUp = !s4.host.night && !s4.guest.night && s4.host.n.nights === 0 && !s4.guest.inTent;
  result('4 one player still up: no night; the guest’s chip says the host is in', stillUp && !!(s4.guest.chip && /in the tent|turn in/.test(s4.guest.chip.text)), { guestChip: s4.guest.chip, hostRows: s4.host.rows.map((r) => `${r.name}:${r.in ? 'in' : 'up'}:${r.tick ?? '-'}`) });

  // --- 5: the guest back in and ticks: the night ---------------------------------------------------------------------
  const before = { A: await clock(A), B: await clock(B) };
  const gBack = await B.evaluate(() => { const c = window.__game.camp; c.restDial(); return c.dial.at; });
  await sleep(500);
  const t5 = Date.now();
  await key(B, 'KeyE');
  const began = await ok(until(A, () => !!window.__game.camp.night, null, 5000));
  const beganB = await ok(until(B, () => !!window.__game.camp.night, null, 5000));
  log('night began', { began, beganB, ms: Date.now() - t5 });
  await until(A, () => !window.__game.camp.night, null, 40000).catch(() => null);
  await until(B, () => !window.__game.camp.night, null, 40000).catch(() => null);
  await sleep(2500); // (a clock message or two after the cards)
  const [cA, cB] = await Promise.all([clock(A), clock(B)]);
  const errS = Math.abs(cA.abs - cB.abs) / cA.hps;
  const nA = await night(A), nB = await night(B);
  const slept = { A: await A.evaluate(() => window.__slept), B: await B.evaluate(() => window.__slept) };
  const wakeOff = ((cA.hours - hostAt + 36) % 24) - 12; // h past the agreed time (the clock ran on after the card)
  const pass5 = began && beganB && errS < 1 && nA.n.jumps === 1 && nB.n.jumps === 0 && nB.n.clockSets === 1 && slept.A.length === 1 && slept.B.length === 1 && cA.doy === before.A.doy + 1 && wakeOff >= 0 && wakeOff < 0.5;
  result('5 both tick: the night runs once on both (clocks within 1 s at the wake time, one jump, energy slept on both)', pass5,
    { guestBackAt: gBack, agreed: hostAt, hostClock: +cA.hours.toFixed(4), guestClock: +cB.hours.toFixed(4), clockDiffRealS: +errS.toFixed(3), minutesPastWake: +(wakeOff * 60).toFixed(1), doy: [before.A.doy, cA.doy, cB.doy], hostJumps: nA.n.jumps, guestJumps: nB.n.jumps, guestClockSets: nB.n.clockSets, guestHeldClockMsgs: nB.n.held, dayJumps: { host: cA.jumps - before.A.jumps, guest: cB.jumps - before.B.jumps }, slept });

  // --- 6: a nap ------------------------------------------------------------------------------------------------------
  await A.evaluate(() => { const d = window.__game.day; d.setClock(d.year, d.doy, 13.0); });
  await ok(until(B, () => Math.abs(window.__game.day.hours - 13) < 0.2, null, 6000));
  const n6a = await night(A);
  await B.evaluate(() => window.__game.camp.restDial());
  await ok(until(A, () => !!window.__game.coopNight.stats().prop, null, 4000));
  await A.evaluate(() => window.__game.camp.restDial());
  await sleep(300);
  // the host picks 4 pm (a nap: three hours by day), by the dial's own button
  await A.evaluate(() => { const D = window.__game.camp.dial, i = D.opts.findIndex((o) => o.at === 16); D.row.children[i].click(); });
  await ok(until(B, () => Math.abs(window.__game.camp.dial.at - 16) < 0.01, null, 4000));
  await key(A, 'KeyE'); await key(B, 'KeyE');
  const napped = await ok(until(A, () => !!(window.__game.camp.night && window.__game.camp.night.nap), null, 5000));
  const nappedB = await ok(until(B, () => !!(window.__game.camp.night && window.__game.camp.night.nap), null, 5000));
  await until(A, () => !window.__game.camp.night, null, 30000).catch(() => null);
  await until(B, () => !window.__game.camp.night, null, 30000).catch(() => null);
  await sleep(2500);
  const [dA, dB] = await Promise.all([clock(A), clock(B)]);
  const n6A = await night(A), n6B = await night(B);
  const errN = Math.abs(dA.abs - dB.abs) / dA.hps;
  result('6 a nap: the same dial by day, both tick, one jump, clocks together', napped && nappedB && errN < 1 && n6A.n.jumps - n6a.n.jumps === 1 && n6B.n.jumps === 0 && dA.hours >= 16 && dA.hours < 16.5,
    { hostClock: +dA.hours.toFixed(3), guestClock: +dB.hours.toFixed(3), clockDiffRealS: +errN.toFixed(3), hostJumps: n6A.n.jumps, guestClockSets: n6B.n.clockSets });

  // --- 8: a player gone from the room counts as asleep after a minute ----------------------------------------------------
  const statsAtEnd = { host: await night(A), guest: await night(B) };
  await A.evaluate(() => { const d = window.__game.day; d.setClock(d.year, d.doy, 21.5); });
  await sleep(1500);
  const n8 = (await night(A)).n.nights;
  await A.evaluate(() => window.__game.camp.restDial());
  await sleep(300);
  await key(A, 'KeyE');
  const t8 = Date.now();
  await B.evaluate(() => window.__game.coop.disconnect());
  await sleep(5000);
  const early = await night(A);
  const ran = await ok(until(A, () => !!window.__game.camp.night, null, 75000));
  const after8 = (Date.now() - t8) / 1000;
  result('8 the guest drops from the room: no night for a minute, then the host’s night runs', early.n.nights === n8 && !early.night && ran && after8 > 55,
    { goneRow: early.rows.find((r) => r.gone != null) || null, nightAfterS: +after8.toFixed(1) });
  await until(A, () => !window.__game.camp.night, null, 40000).catch(() => null);

  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ relay: RELAY, results, stats: statsAtEnd }, null, 2));
  console.log(JSON.stringify(results.map((r) => [r.pass ? 'PASS' : 'FAIL', r.name]), null, 1));
} catch (e) {
  log('error', e.stack || e.message);
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ relay: RELAY, results, error: String(e.stack || e) }, null, 2));
} finally {
  for (const b of browsers) await b.close().catch(() => {});
}
