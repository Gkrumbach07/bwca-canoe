// Round 4 join (claude/r4-final: round 4 + loop-r4 + the loopfix, roadsfix and cabins streams): the seams where they meet.
// Headless Chromium against a running Vite (and wrangler for the co-op part); each check PASS or FAIL:
//   A  the moved stores as homes (EP 16 Moose River North, EP 67 Bog Lake): a season begun from the wizard (16) and from
//      the title (67) opens at the store where it stands now; no canoe and no life jacket before the talk; the guide's
//      step, its gem and the tracker point at the staffer in that store; after the loan the jacket counts; the starter
//      route leaves from that store's dock to a site in play; the truck's stand is behind that store
//   B  a ride to a moved lot (75 or 84, 170 m in from the south edge) and to a moved store (16 or 67): the truck stands
//      there and drives off; on foot down the lot's way to the water the jacket stays off, the shoulder stays out (no
//      person there), and no edge notice (the doorstep)
//   C  the party tents: over 120 days of the season no party lands at a site past the band or in Quetico; no site in
//      Quetico left in play; the camps drawn round you never past
//   D  Quetico in co-op: a guest paddled into Quetico sees the one notice ("You have left the Boundary Waters"), never a
//      Quetico one; the host inside sees none; back in, the guest's notice comes down
//   E  no page errors
//
//   APP=http://localhost:5541 RELAY=ws://localhost:8541 node scripts/r4-final-test.mjs [--skip-coop]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://localhost:5541';
const RELAY = process.env.RELAY || 'ws://localhost:8541';
const SKIP_COOP = process.argv.includes('--skip-coop');
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 2400)); };
const errors = [];
const browsers = [];

const HELPERS = async () => {
  const g = window.__game, H = window.__rf = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 60000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.look = (yaw, pitch = 0.05) => { const ch = g.chase; if (ch) { ch.viewYaw = yaw; ch.forwardYaw = yaw; ch.viewPitch = pitch; } g.player.heading = yaw; };
  H.yawTo = (q) => { const p = g.player; return Math.atan2(-(q.z - p.z), q.x - p.x); };
  H.sign = () => { const el = document.getElementById('edge-sign'); return { shown: !!(el && el.classList.contains('show')), text: el ? el.textContent : '', state: g.edge.state, cls: el ? el.className : '' }; };
  H.closeAll = () => { const o = g.outfitter; if (o.open) o.hide(); if (g.record && g.record.shown && g.record.hide) g.record.hide(); };
  const byUrl = (re, d) => import([...performance.getEntriesByType('resource')].map((e) => e.name).find((n) => re.test(n)) || d);
  const E = await byUrl(/\/src\/edge\.js/, '/src/edge.js');
  H.zone = E.zoneAt; H.inQ = E.inQuetico; H.WORDS = E.WORDS;
  const OF = await byUrl(/\/src\/outfitters\.js/, '/src/outfitters.js');
  H.OF = OF;
  H.places = await (await fetch('/src/outfitter-places.json')).json();
  return true;
};

async function openGame(name, query = '') {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); browsers.push(browser);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => { errors.push(`[${name}] ${e.message}`); log(`[${name}] pageerror`, e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log(`[${name}] console`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/${query}`, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.guide && g.locator && g.onboarding && g.tracker && g.starter && g.truck && g.edge && g.parties && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
  log(`[${name}] game loaded`);
  return page;
}
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

// what a moved store's start looks like (A)
const STORE_START = (ep) => {
  const g = window.__game, H = window.__rf, p = g.player, pl = H.places.places || H.places, P = pl[String(ep)], st = { x: P.store[0], z: P.store[1] }, door = { x: P.door[0], z: P.door[1] };
  g.guide.sync && g.guide.sync();
  const cur = g.guide.current(), r = cur ? g.guide.reach(cur) : null;
  const gem = cur ? g.locator.shown().find((m) => m.id === cur.id && !m.gone) : null;
  const L = g.outfitter.layout(ep), dk = L && (L.dock || L.dockFoot || L.dockLand);
  const R = g.starter.route(ep), w0 = R && R.way && R.way[0];
  const S = g.truck.spot(ep, true);
  return {
    visit: g.outfitter.visit && g.outfitter.visit.ep, fromDoor: Math.round(Math.hypot(p.x - door.x, p.z - door.z)), fromStore: Math.round(Math.hypot(p.x - st.x, p.z - st.z)),
    noCanoe: g.onboarding.noCanoe, noPfd: !!g.canoe.noPfd(), pfd: g.canoe.figure.pfd, mode: p.mode,
    step: cur && cur.id, target: cur && cur.target && cur.target.kind, reachFromStore: r && r.pos ? Math.round(Math.hypot(r.pos.x - st.x, r.pos.z - st.z)) : null,
    gemFromStore: gem ? Math.round(Math.hypot(gem.x - st.x, gem.z - st.z)) : null, tracker: g.tracker.state().text.slice(0, 120),
    layoutFromPlace: L && L.door ? Math.round(Math.hypot(L.door.x - door.x, L.door.z - door.z)) : null,
    route: R ? { site: R.site, past: !!R.siteRec.past, inQ: H.inQ(R.siteRec.x, R.siteRec.z), wayFromDock: w0 && dk ? Math.round(Math.hypot(w0[0] - dk.x, w0[1] - dk.z)) : null } : null,
    truck: S ? { fromStore: Math.round(Math.hypot(S.x - st.x, S.z - st.z)) } : null,
    edge: H.sign(),
  };
};

try {
  const page = await openGame('solo');
  const ev = (fn, a) => page.evaluate(fn, a);

  // ---- A1 EP 16 from the wizard ------------------------------------------------------------------------------------------
  await page.click('#btn-new');
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0, null, 60000);
  await sleep(500);
  const pin16 = await ev(() => !!document.querySelector('.startmap .pin[data-ep="16"]'));
  await page.click('.startmap .pin[data-ep="16"]');
  await ev(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await sleep(300);
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await ev(async () => { const g = window.__game, H = window.__rf; H.closeAll(); g.day.setClock(g.day.year, g.day.doy, 9.3); H.step(30); for (let i = 0; i < 40 && !g.locator.shown().length; i++) { H.step(10); await H.wait(50); } });
  const a16 = await ev(STORE_START, 16);
  result('A1 EP 16 from the wizard: in at the moved store (Moose River\'s east bank), no canoe or jacket yet, the guide/gem/tracker on the staffer there, no edge notice',
    pin16 && a16.visit === 16 && a16.fromDoor < 40 && a16.layoutFromPlace != null && a16.layoutFromPlace < 3 && a16.noCanoe && a16.noPfd && !a16.pfd && a16.target === 'person' && a16.reachFromStore != null && a16.reachFromStore < 40 && (a16.gemFromStore == null || a16.gemFromStore < 40) && a16.tracker.length > 0 && !a16.edge.shown, { pin16, a16 });
  result('A2 EP 16: the starter route leaves from the moved store\'s dock to a site in play; the truck stands behind that store',
    a16.route && a16.route.wayFromDock != null && a16.route.wayFromDock < 30 && !a16.route.past && !a16.route.inQ && a16.truck && a16.truck.fromStore < 60, a16);
  // the loan: the jacket counts after it
  const loan16 = await ev(() => { const g = window.__game; if (g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(16, false); } window.__rf.step(10); return { noCanoe: g.onboarding.noCanoe, noPfd: !!g.canoe.noPfd(), pfd: g.canoe.figure.pfd, mode: g.player.mode }; });
  result('A3 EP 16: after the loan the jacket counts (none worn on foot)', !loan16.noCanoe && !loan16.noPfd && !loan16.pfd, loan16);

  // ---- A4 EP 67 from the title -------------------------------------------------------------------------------------------
  await ev(async () => { const g = window.__game, t = g.title; t.setPick('adventure'); await t.newSeason(g.world.entryPoints.find((e) => e.ep === 67), { confirm: false, start: { year: new Date().getFullYear(), doy: 192 } }); });
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && g.outfitter.visit && g.outfitter.visit.ep === 67; }, null, 180000);
  await ev(async () => { const g = window.__game, H = window.__rf; H.closeAll(); g.day.setClock(g.day.year, g.day.doy, 9.3); H.step(30); for (let i = 0; i < 40 && !g.locator.shown().length; i++) { H.step(10); await H.wait(50); } });
  const a67 = await ev(STORE_START, 67);
  result('A4 EP 67 from the title: in at the moved store by Bog Lake\'s lot, no canoe or jacket yet, the guide/gem/tracker on the staffer there, no edge notice',
    a67.visit === 67 && a67.fromDoor < 40 && a67.layoutFromPlace != null && a67.layoutFromPlace < 3 && a67.noCanoe && a67.noPfd && !a67.pfd && a67.target === 'person' && a67.reachFromStore != null && a67.reachFromStore < 40 && (a67.gemFromStore == null || a67.gemFromStore < 40) && a67.tracker.length > 0 && !a67.edge.shown, a67);
  result('A5 EP 67: the starter route leaves from the moved store\'s dock to a site in play; the truck stands behind that store',
    a67.route && a67.route.wayFromDock != null && a67.route.wayFromDock < 30 && !a67.route.past && !a67.route.inQ && a67.truck && a67.truck.fromStore < 60, a67);

  // ---- B rides to a moved lot and a moved store --------------------------------------------------------------------------
  const rideTo = async (home, lot) => {
    const ok = await ev(async ([home, lot]) => {
      const g = window.__game, H = window.__rf, o = g.outfitter;
      if (!o.visit || o.visit.ep !== home) {
        const t = g.title; t.setPick('adventure');
        await t.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: new Date().getFullYear(), doy: 193 } });
      }
      return true;
    }, [home, lot]);
    await until(page, (home) => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && g.outfitter.visit && g.outfitter.visit.ep === home; }, home, 180000);
    const go = await ev(([home, lot]) => {
      const g = window.__game, o = g.outfitter, H = window.__rf;
      H.closeAll(); g.day.setClock(g.day.year, g.day.doy, 9.0);
      if (g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(home, false); }
      g.profile.s.money += 400; g.profile.changed('money');
      o.show(o.landing(home), 'counter'); H.step(5);
      const r = o.rides.take(lot);
      return { ok: !!r, offer: o.rides.offer(home).filter((x) => x.ep === lot).map((x) => ({ ep: x.ep, km: x.km, price: x.price })) };
    }, [home, lot]);
    if (!go.ok) return { refused: true, ok, go };
    await until(page, () => window.__game.veil.active, null, 20000).catch(() => null);
    await until(page, () => !window.__game.veil.active && !window.__game.player.teleporting, null, 180000);
    for (let i = 0; i < 6; i++) { await sleep(400); await ev(() => window.__rf.step(2)); }
    return ev((lot) => {
      const g = window.__game, T = g.truck, p = g.player, H = window.__rf, th = g.trailhead.trailheadAt(p.x, p.z);
      return { lot, job: T.job && T.job.kind, key: T.job && T.job.key, vis: !!(T.mesh && T.mesh.visible), dTruck: Math.round(Math.hypot(T.x - p.x, T.z - p.z)), at: th ? { ep: th.L.ep, where: th.where } : null, visit: g.outfitter.visit && g.outfitter.visit.ep,
        mode: p.mode, pfd: g.canoe.figure.pfd, noPfd: !!g.canoe.noPfd(), ots: +g.chase.ots.toFixed(3), sign: H.sign() };
    }, lot);
  };
  // a home whose counter drives to the lot (the nearest by road)
  const pickHome = (lots) => ev((lots) => {
    const g = window.__game, rides = g.outfitter.rides, out = [];
    for (const lot of lots) for (const h of window.__rf.OF.OUTFITTER_EPS) { if (h === lot) continue; const r = rides.offer(h).find((x) => x.ep === lot); if (r && !r.walk) out.push({ home: h, lot, km: r.km }); }
    out.sort((a, b) => a.km - b.km); return out;
  }, lots);
  const lotPicks = await pickHome([84, 75]);
  let b1 = { none: 'no counter drives to 84 or 75', lotPicks };
  if (lotPicks.length) b1 = await rideTo(lotPicks[0].home, lotPicks[0].lot);
  result('B1 a ride to a moved south-edge lot: in the lot, the truck there (leaving), on foot, no jacket, the shoulder out, no edge notice',
    !b1.none && !b1.refused && b1.at && b1.at.ep === b1.lot && b1.job === 'leave' && b1.dTruck < 40 && b1.mode === 'walk' && !b1.pfd && !b1.noPfd && b1.ots === 0 && !b1.sign.shown, { pick: lotPicks[0], b1 });
  // down the lot's way to the water with W held: the jacket off, the shoulder out, no notice
  let b2 = { none: true };
  if (!b1.none && !b1.refused && b1.at) {
    const tgt = await ev((lot) => { const L = window.__game.trailhead.trailheadLayout(lot); return L ? { x: L.landing.x, z: L.landing.z } : null; }, b1.lot);
    const seen = []; const d0 = await ev((q) => Math.hypot(window.__game.player.x - q.x, window.__game.player.z - q.z), tgt);
    await page.keyboard.down('KeyW');
    const t0 = Date.now();
    while (Date.now() - t0 < 40000) {
      const s = await ev((q) => { const g = window.__game, H = window.__rf, p = g.player; H.look(H.yawTo(q), 0.02); return { d: Math.round(Math.hypot(p.x - q.x, p.z - q.z)), pfd: g.canoe.figure.pfd, ots: +g.chase.ots.toFixed(3), sign: H.sign().shown, mode: p.mode }; }, tgt);
      seen.push(s); if (s.d < 6) break; await sleep(150);
    }
    await page.keyboard.up('KeyW');
    // the truck by now is gone down its road
    await ev(() => window.__rf.step(30 * 120));
    const truckEnd = await ev(() => { const T = window.__game.truck; return { job: T.job && T.job.kind, vis: !!(T.mesh && T.mesh.visible) }; });
    b2 = { d0: Math.round(d0), dEnd: seen.length ? seen[seen.length - 1].d : null, n: seen.length, pfdOn: seen.filter((s) => s.pfd && s.mode !== 'paddle' && s.mode !== 'swim').length, otsMax: Math.max(0, ...seen.map((s) => s.ots)), signs: seen.filter((s) => s.sign).length, truckEnd };
  }
  result('B2 down the moved lot\'s way to the water on foot: no jacket, no shoulder, no edge notice; the truck gone',
    !b2.none && b2.dEnd != null && b2.dEnd < Math.max(12, b2.d0 * 0.5) && b2.pfdOn === 0 && b2.otsMax === 0 && b2.signs === 0 && !b2.truckEnd.vis, b2);
  // a ride to a moved store (16 or 67)
  const storePicks = (await pickHome([16, 67])).filter((q) => q.home !== 16 && q.home !== 67);
  let b3 = { none: 'no counter drives to 16 or 67', storePicks };
  if (storePicks.length) b3 = await rideTo(storePicks[0].home, storePicks[0].lot);
  const b3door = !b3.none && !b3.refused ? await ev((ep) => { const g = window.__game, pl = window.__rf.places.places || window.__rf.places, P = pl[String(ep)], p = g.player; return Math.round(Math.hypot(p.x - P.door[0], p.z - P.door[1])); }, b3.lot) : null;
  result('B3 a ride to a moved store: in at its door, the truck behind it (leaving), no jacket on foot, no edge notice',
    !b3.none && !b3.refused && b3.visit === b3.lot && b3door != null && b3door < 40 && b3.job === 'leave' && b3.dTruck < 80 && !b3.pfd && !b3.sign.shown, { pick: storePicks[0], b3, b3door });

  // ---- C the party tents -------------------------------------------------------------------------------------------------
  const c = await ev(async () => {
    const g = window.__game, P = g.parties, H = window.__rf, w = g.world, T0 = P.today, bad = [], qSites = [];
    w.campsites.forEach((s, i) => { if (H.inQ(s.x, s.z) && !s.past) qSites.push(i); });
    let legs = 0, sites = 0;
    for (let d = -20; d < 100; d++) {
      for (const { party, k } of P.legsOn(T0 + d)) {
        legs++;
        const pl = P.legPlan(party, k); if (!pl || !pl.to || pl.to.kind !== 'site') continue;
        sites++;
        const i = P.siteOfKey ? P.siteOfKey.get(pl.to.key) : -1, s = i >= 0 ? w.campsites[i] : null;
        if ((s && s.past) || H.zone(pl.to.x, pl.to.z) === 0 || H.inQ(pl.to.x, pl.to.z)) bad.push({ d, key: pl.to.key, past: s && s.past, q: H.inQ(pl.to.x, pl.to.z) });
      }
      if (d % 10 === 0) await H.wait(0);
    }
    const drawn = [...((g.partyCamps && g.partyCamps.drawn) || new Map()).keys()].filter((key) => { const i = P.siteOfKey ? P.siteOfKey.get(key) : -1; return i >= 0 && w.campsites[i].past; });
    return { legs, sites, bad: bad.slice(0, 8), nBad: bad.length, qSites: qSites.length, pastSites: w.pastSites, drawnPast: drawn };
  });
  result('C the parties: no party lands past the band or in Quetico over the season; no Quetico site left in play; no camp drawn past',
    c.sites > 50 && c.nBad === 0 && c.qSites === 0 && c.drawnPast.length === 0, c);
  await browsers[0].close().catch(() => {}); browsers.shift();

  // ---- D Quetico in co-op ------------------------------------------------------------------------------------------------
  if (!SKIP_COOP) {
    const HOME = 25;
    const A = await openGame('host', `?relay=${encodeURIComponent(RELAY)}`);
    await A.evaluate(async (home) => { const g = window.__game, t = g.title; t.setPick('adventure'); await t.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: new Date().getFullYear(), doy: 190 } }); }, HOME);
    await until(A, () => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 180000);
    await A.evaluate((home) => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); if (g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(home, false); } }, HOME);
    const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
    const B = await openGame('guest', `?relay=${encodeURIComponent(RELAY)}&join=${code}`);
    await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
    await B.fill('#coop-name', 'Ada');
    await B.click('#coop-go');
    await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 180000);
    await sleep(3000);
    await B.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); });
    // a point of open water in Quetico, past the band, nearest the host's store
    const q = await B.evaluate(() => {
      const g = window.__game, H = window.__rf, p = g.player, w = g.world;
      for (let k = 0; k < 60000; k++) {
        const r = Math.sqrt(k / 60000) * 40000, a = k * 2.399963, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        if (!w.inBounds(x, z, 400) || H.zone(x, z) !== 0 || !H.inQ(x, z) || !(w.lakeIdAt(x, z) > 0)) continue;
        let deep = true; for (let j = 0; j < 8 && deep; j++) { const b = j * Math.PI / 4; if (H.zone(x + Math.cos(b) * 150, z + Math.sin(b) * 150) !== 0) deep = false; }
        if (deep) return { x, z, from: Math.round(r) };
      }
      return null;
    });
    let d1 = { none: 'no Quetico water found', q };
    if (q) {
      await B.evaluate(async (q) => { const g = window.__game, H = window.__rf; await g.player.teleport(q.x, q.z); await H.settle(); H.step(30 * 5); }, q);
      await sleep(2500);
      await B.evaluate(() => window.__rf.step(30 * 3));
      const guest = await B.evaluate(() => { const g = window.__game, H = window.__rf; return { ...H.sign(), raw: g.edge.raw, inQ: H.inQ(g.player.x, g.player.z), words: Object.keys(H.WORDS) }; });
      const host = await A.evaluate(() => { window.__rf.step(10); return window.__rf.sign(); });
      // back in: to the host's store yard
      await B.evaluate(async () => { const g = window.__game, H = window.__rf, L = g.outfitter.layout(25), d = L.door; await g.player.teleport(d.x, d.z); await H.settle(); H.step(30 * 5); });
      await sleep(1500);
      const back = await B.evaluate(() => { window.__rf.step(30 * 3); return window.__rf.sign(); });
      d1 = { q, guest, host, back };
    }
    result('D a co-op guest in Quetico: the one notice "You have left the Boundary Waters", no Quetico one; the host inside sees none; back in, it comes down',
      !d1.none && d1.guest.inQ && d1.guest.shown && /You have left the Boundary Waters/.test(d1.guest.text) && !/quetico/i.test(d1.guest.text + d1.guest.cls + d1.guest.state) && !d1.guest.words.some((k) => /quetico/i.test(k)) && !d1.host.shown && !d1.back.shown, d1);
  }
  result('E no page errors', errors.length === 0, { errors: errors.slice(0, 6) });
} catch (e) {
  result('the run', false, { error: String((e && e.stack) || e).slice(0, 2000) });
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
