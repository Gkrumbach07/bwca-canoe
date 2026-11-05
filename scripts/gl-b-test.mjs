// Game-loop round, stream B (outfitters, drives, pickups, roads): the acceptance checks, headless.
//   npx vite --port 5182 --strictPort   (in the background), then
//   APP=http://localhost:5182 node scripts/gl-b-test.mjs [--out dir] [--shots]
// Drives the cached headless Chromium (playwright-core) with Metal ANGLE. Each check prints PASS or FAIL with its numbers;
// the exit code is the number of FAILs. --shots also writes docs/build/shots/b-*.png.
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5182';
const OUT = path.resolve(arg('out', 'gl-b-out'));
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.resolve('docs/build/shots');
mkdirSync(OUT, { recursive: true });
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });

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
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more)); };

// the page's helpers: stepping in chunks, waiting for a store or a trailhead to be built, standing somewhere on foot
const HELPERS = () => {
  const g = window.__game;
  const H = window.__glb = {};
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.settle = async (ms = 20000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await new Promise((r) => setTimeout(r, 30)); } H.step(20); };
  H.built = async (ep, ms = 60000) => {
    const t0 = performance.now();
    for (;;) {
      const L = g.props.storeLayout(ep), T = g.trailhead.trailheadLayout(ep);
      if (L || T) return { store: !!L, trailhead: !!T };
      if (performance.now() - t0 > ms) return { store: false, trailhead: false, timeout: true };
      H.step(15); await new Promise((r) => setTimeout(r, 40));
    }
  };
  H.goto = async (x, z) => { const ok = await g.outfitter.onTeleport(x, z); await H.settle(); return ok; };
  // on foot at (x, z), the canoe set down where it is
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  // afloat in the canoe at (x, z)
  H.floatAt = async (x, z) => { await H.goto(x, z); g.player.speed = 0; };
  H.closeAll = () => { const o = g.outfitter; if (o.open) o.hide(); if (o.shelfOpen) o.shelf.close(); if (g.record && g.record.shown && g.record.hide) g.record.hide(); if (g.veil && g.veil.active && g.veil.skip) g.veil.skip(); };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('pageerror', e.message));
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await page.goto(APP);
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.trailhead && window.__game.outfitters, null, { timeout: 240000, polling: 500 });
  await page.evaluate(HELPERS);
  log('game loaded');

  // --- 1. fourteen-ish outfitters, every entry point within 12 km of one -------------------------------------------
  const c1 = await page.evaluate(() => {
    const g = window.__game, O = g.outfitters, eps = g.world.entryPoints, outs = eps.filter((e) => O.isOutfitter(e.ep));
    let worst = null;
    for (const e of eps) { let b = Infinity, by = null; for (const o of outs) { const d = Math.hypot(o.x - e.x, o.z - e.z); if (d < b) { b = d; by = o.ep; } } if (!worst || b > worst.km * 1000) worst = { ep: e.ep, name: e.name, by, km: +(b / 1000).toFixed(2) }; }
    return { n: O.OUTFITTER_EPS.length, eps: eps.length, worst, hosts: eps.every((e) => O.hostOf(e.ep) != null) };
  });
  result('1 outfitters 13–15, ≤ 55, every EP ≤ 12 km from one', c1.n >= 13 && c1.n <= 15 && c1.n <= c1.eps && c1.worst.km <= 12 && c1.hosts, c1);

  // a season at Moose Lake (25), Adventure
  await page.evaluate(async () => { const g = window.__game, t = g.title; t.setPick('adventure'); await t.newSeason(g.world.entryPoints.find((e) => e.ep === 25), { confirm: false }); t.close(); });
  await page.evaluate(() => window.__glb.settle());
  await page.waitForFunction(() => { window.__glb.step(10); const o = window.__game.outfitter; return !!o.visit && o.visit.ep === 25; }, null, { timeout: 120000, polling: 300 });
  log('in at Moose Lake', await page.evaluate(() => ({ home: window.__game.profile.home, money: window.__game.profile.money })));

  // --- 3. drives: every entry point but the one you are at, priced; the road graph ---------------------------------
  const c3 = await page.evaluate(() => {
    const g = window.__game, rows = g.rides.offer(25), O = g.outfitters, eps = g.world.entryPoints.map((e) => e.ep).filter((n) => n !== 25);
    const way = O.roadWay(64, 16);
    return { rows: rows.length, want: eps.length, all: eps.every((n) => rows.some((r) => r.ep === n)), priced: rows.every((r) => r.price > 0), self: rows.some((r) => r.ep === 25),
      km64_16: O.roadKm(64, 16), way, sample: rows.filter((r) => [30, 27, 1, 12, 38, 51, 64].includes(r.ep)).map((r) => `${r.ep}:${r.km}km/$${r.price}/${r.hours}h`) };
  });
  result('3 rides.offer(25) lists every EP but 25, all priced; roadKm(64,16) > 150 via Grand Marais', c3.all && c3.rows === c3.want && c3.priced && !c3.self && c3.km64_16 > 150 && c3.way.includes('Grand Marais'), c3);

  // --- 6. each outfitter its own: country, reach, a hand keeper, two premium items only there; the specialty ---------
  const c6 = await page.evaluate(() => {
    const g = window.__game, O = g.outfitters, shop = g.shop, out = [];
    for (const ep of O.OUTFITTER_EPS) {
      const p = g.outfitterProfile(ep), st = shop.stock(ep).map((i) => i.id), prem = p.premium || [];
      const elsewhere = O.OUTFITTER_EPS.filter((n) => n !== ep).some((n) => shop.stock(n).some((i) => prem.includes(i.id)));
      out.push({ ep, country: p.country, reach: (p.reach || []).length, hand: p.hand, keeper: p.keeper.name, premium: prem.length, stocked: prem.every((id) => st.includes(id)), elsewhere, specialty: !!p.specialty });
    }
    // the specialty: an item of it at its host is 15 % under its price elsewhere (each against its own priceMul)
    const sp = [];
    for (const ep of O.OUTFITTER_EPS) {
      // (the dearest of its kind: whole dollars round a $2 thing's 15 % away)
      const S = shop.specialty(ep), it = shop.stock(ep).filter((i) => !i.premium && !i.signature && i.price > 0 && ((S.family && i.family === S.family) || (S.slot && i.slot === S.slot) || (S.shelf && i.shelf === S.shelf))).sort((a, b) => b.price - a.price)[0];
      if (!it) { sp.push({ ep, none: S }); continue; }
      const other = O.OUTFITTER_EPS.find((n) => n !== ep && !shop.specialtyOff(it, n) && shop.stock(n).some((i) => i.id === it.id)); // (a counter with no deal on it)
      const here = shop.price(it.id, ep) / shop.priceMul(ep), there = other != null ? shop.price(it.id, other) / shop.priceMul(other) : null;
      sp.push({ ep, id: it.id, here: +here.toFixed(2), there: there && +there.toFixed(2), ratio: there ? +(here / there).toFixed(3) : null });
    }
    return { out, sp };
  });
  const bad6 = c6.out.filter((o) => !o.country || !o.reach || !o.hand || o.premium < 2 || !o.stocked || o.elsewhere || !o.specialty);
  const badSp = c6.sp.filter((s) => s.ratio == null || Math.abs(s.ratio - 0.85) > 0.04);
  result('6 every profile: country, reach, hand keeper, ≥2 premium only there; specialty 15 % under', !bad6.length && !badSp.length, { bad: bad6, badSpecialty: badSp, sample: c6.sp.slice(0, 4) });

  // --- 8. every map sheet sold at an outfitter's table ---------------------------------------------------------------
  const c8 = await page.evaluate(async () => {
    const g = window.__game, S = await import('/src/sheets.js'), out = [];
    for (const s of S.SHEETS) { const at = g.sheets.soldAt(s.id).map((e) => e.ep); out.push({ id: s.id, at }); }
    return { n: out.length, unsold: out.filter((o) => !o.at.length).map((o) => o.id), notOutfitters: out.filter((o) => o.at.some((ep) => !g.outfitters.isOutfitter(ep))).map((o) => o.id) };
  });
  result('8 every sheet soldAt ≥ 1 outfitter', !c8.unsold.length && !c8.notOutfitters.length, c8);

  // --- 4. pickups: free by the seller from its reach; priced by others and from farther ---------------------------
  const c4 = await page.evaluate(() => {
    const g = window.__game, st = g.trip.state, was = st.permit;
    st.permit = { id: 'test', ep: 27, from: 25 };
    const at27 = g.rides.pickups(27), at1 = g.rides.pickups(1);
    st.permit = was;
    const by25 = at27.find((r) => r.by === 25), other = at27.find((r) => r.by !== 25), at1by25 = at1.find((r) => r.by === 25);
    return { by25: by25 && { free: by25.free, price: by25.price }, other: other && { by: other.by, free: other.free, price: other.price }, at1by25: at1by25 && { free: at1by25.free, price: at1by25.price }, first: at27[0] && at27[0].by };
  });
  result('4 pickup at 27 with a permit from 25: free by 25, priced by another; at 1 priced', c4.by25 && c4.by25.free && c4.by25.price === 0 && c4.other && !c4.other.free && c4.other.price > 0 && c4.at1by25 && !c4.at1by25.free && c4.at1by25.price > 0, c4);

  // --- 2. stores at outfitters only, trailheads elsewhere: a drive to 27 (a trailhead) ----------------------------
  const drive = await page.evaluate(async () => {
    const g = window.__game, H = window.__glb, o = g.outfitter;
    H.closeAll();
    const L = g.props.storeLayout(25);
    o.show(o.landing(25), 'counter');
    const money0 = g.profile.money, r = g.rides.offer(25).find((x) => x.ep === 27);
    const p = g.rides.take(27);
    for (let i = 0; i < 400 && (g.rides.busy || (g.veil && g.veil.active)); i++) { H.step(10, 1 / 10); await new Promise((r) => setTimeout(r, 20)); }
    await p;
    await H.settle();
    const b = await H.built(27);
    for (let i = 0; i < 60 && o.arrival; i++) { H.step(10); await new Promise((r) => setTimeout(r, 30)); }
    const pl = g.player, T = g.trailhead.trailheadLayout(27);
    return { store25: !!L, built27: b, store27: !!g.props.storeLayout(27), th25: !!g.trailhead.trailheadLayout(25), paid: money0 - g.profile.money, price: r.price, inLot: T ? Math.hypot(pl.x - T.lot.x, pl.z - T.lot.z) <= T.lot.r : false, onFoot: pl.onFoot, port: o.port && o.port.ep, via: o.via };
  });
  log('drive to 27', drive);
  const c2b = await page.evaluate(async () => {
    const g = window.__game, H = window.__glb, out = {};
    for (const ep of [30, 31]) {
      const e = g.world.entryPoints.find((q) => q.ep === ep);
      await H.goto(e.x, e.z);
      const b = await H.built(ep);
      out[ep] = { store: !!g.props.storeLayout(ep), trailhead: !!g.trailhead.trailheadLayout(ep), b };
    }
    return out;
  });
  const c2 = { 25: { store: drive.store25, trailhead: drive.th25 }, 27: { store: drive.store27, trailhead: drive.built27.trailhead }, ...c2b };
  result('2 storeLayout only at outfitters (25, 31), trailheadLayout at the others (27, 30)', c2[25].store && !c2[25].trailhead && !c2[27].store && c2[27].trailhead && !c2[30].store && c2[30].trailhead && c2[31].store && !c2[31].trailhead, c2);
  result('3b a drive to a trailhead: paid, in its lot on foot, the canoe at its landing', drive.paid === drive.price && drive.inLot && drive.onFoot && drive.port === 27, drive);

  // --- 5. a trip from a trailhead: the landing does not end it, the lot does; an outfitter's door does -------------
  const c5 = await page.evaluate(async () => {
    const g = window.__game, H = window.__glb, o = g.outfitter, T = g.trailhead.trailheadLayout(27);
    const out = {};
    H.closeAll();
    // afloat at the landing, then out on the water: the trip pushes off from 27
    await H.goto(T.water.x, T.water.z);
    o.port = o.entry(27);
    const p = g.player, d = T.d;
    for (let k = 1; k <= 6; k++) { p.x = T.water.x + d.x * 20 * k; p.z = T.water.z + d.z * 20 * k; if (g.world.shoreAt(p.x, p.z) > -3) { p.x -= d.x * 20; p.z -= d.z * 20; break; } H.step(5); }
    H.step(30);
    out.started = { active: g.trip.active, ep: o.trip.ep, away: o.trip.away, mode: p.mode };
    // far enough to be a trip (AWAY): out on the lake
    if (!o.trip.away) { const e = g.world.entryPoints.find((q) => q.ep === 27); await H.goto(e.x + 300, e.z); H.step(30); }
    out.away = o.trip.away;
    // ashore at the landing: still out
    H.standAt(T.landing.x - d.x * 1.5, T.landing.z - d.z * 1.5); H.step(30);
    out.atLanding = { active: g.trip.active, here: (() => { const h = o.entryHere(p.x, p.z); return h ? { ep: h.e.ep, out: h.out } : null; })() };
    // up into the lot: out at 27
    H.standAt(T.lot.x, T.lot.z); H.step(30);
    out.inLot = { active: g.trip.active, lastLot: o.lastLot, outcome: g.trip.state.outcome };
    H.closeAll(); H.step(10);
    // a second trip: from 27 again, in at Moose Lake's door
    await H.goto(T.water.x, T.water.z); o.port = o.entry(27); p.x = T.water.x + d.x * 40; p.z = T.water.z + d.z * 40; H.step(30);
    out.second = { active: g.trip.active, ep: o.trip.ep };
    const e25 = g.world.entryPoints.find((q) => q.ep === 25);
    await H.goto(e25.x, e25.z); await H.built(25); H.step(30);
    const L = g.props.storeLayout(25);
    out.away2 = o.trip.away;
    // on its dock (where you step out of the canoe): not out
    const dk = L.dockDeck || L.dockLand;
    H.standAt(dk.x, dk.z); H.step(30);
    out.atDock = { active: g.trip.active, doorD: +Math.hypot(dk.x - L.door.x, dk.z - L.door.z).toFixed(1) };
    // in through the door: out at 25
    H.standAt(L.centre.x, L.centre.z); H.step(30);
    out.inStore = { active: g.trip.active, outcome: g.trip.state.outcome };
    H.closeAll();
    return out;
  });
  result('5 a trip pushes off from a trailhead; its landing does not end it, its lot does; an outfitter’s store does',
    c5.started.active && c5.started.ep === 27 && c5.atLanding.active && !c5.inLot.active && c5.inLot.outcome && c5.inLot.outcome.ep === 27 && c5.second.active && (c5.atDock.active || c5.atDock.doorD < 7) && !c5.inStore.active && c5.inStore.outcome && c5.inStore.outcome.ep === 25, c5);

  // --- 4b. a pickup called at a trailhead's sign: the paper, then in at the outfitter's door ----------------------
  const c4b = await page.evaluate(async () => {
    const g = window.__game, H = window.__glb, o = g.outfitter, e = o.entry(27), T = g.trailhead.trailheadLayout(27);
    await H.goto(T.water.x, T.water.z); H.standAt(T.lot.x, T.lot.z); H.step(10);
    o.via = 25; if (g.trip.state) g.trip.state.via = 25;
    o.showPickup(e);
    const html = o.el.panel.innerHTML, rows = g.rides.pickups(27), money0 = g.profile.money, h0 = g.day.doy * 24 + g.day.hours;
    const p = g.rides.callPickup(27, 25);
    for (let i = 0; i < 400 && (g.rides.busy || (g.veil && g.veil.active)); i++) { H.step(10, 1 / 10); await new Promise((r) => setTimeout(r, 20)); }
    await p; await H.settle(); await H.built(25);
    for (let i = 0; i < 80 && o.arrival; i++) { H.step(10); await new Promise((r) => setTimeout(r, 30)); }
    return { listed: rows.length, free25: rows.find((r) => r.by === 25).free, paper: /Call a pickup/.test(html), paid: money0 - g.profile.money, hours: +((g.day.doy * 24 + g.day.hours) - h0).toFixed(2), visit: o.visit && o.visit.ep, last: g.rides.last };
  });
  result('4b E at the sign: the pickup paper; called free from 25, in at its door', c4b.paper && c4b.free25 && c4b.paid === 0 && c4b.visit === 25 && c4b.hours > 0, c4b);

  // --- the counter's side map and list at 25 (a shot), the pickup paper at a trailhead (a shot) --------------------
  if (SHOTS) {
    await page.evaluate(async () => { const g = window.__game, o = g.outfitter; o.show(o.landing(25), 'counter'); window.__glb.step(5); await new Promise((r) => setTimeout(r, 400)); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOT_DIR, 'b-counter-drives.png') });
  }

  // --- 7. an old save with home 30 (a store that is no more): home 25, in at its counter ----------------------------
  await page.evaluate(() => {
    const g = window.__game, o = g.outfitter, pr = g.profile, H = window.__glb;
    H.closeAll();
    pr.s.home = 30; pr.s.known = [30, 25, 27, 64]; pr.s.rep = { 30: 3, 25: 1, 27: 2 }; pr.s.told = ['30:0', '25:1']; delete pr.s.outfittersV; pr.write();
    // the page went away in the old store at Lake One
    const e = g.world.entryPoints.find((q) => q.ep === 30);
    o.save();
    const raw = JSON.parse(g.store.getItem('bwca-canoe-trip'));
    raw.visit = { ep: 30, inside: true, x: e.x, z: e.z, heading: 0, switched: false };
    raw.trip = { active: false };
    raw.pos = { x: e.x, z: e.z, heading: 0 };
    g.store.setItem('bwca-canoe-trip', JSON.stringify(raw));
  });
  await page.waitForTimeout(1500); // (the store writes through to IndexedDB)
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.trailhead, null, { timeout: 240000, polling: 500 });
  await page.evaluate(HELPERS);
  const c7 = await page.evaluate(async () => {
    const g = window.__game, H = window.__glb, pr = g.profile;
    const before = { home: pr.home, known: pr.known, rep: { ...pr.s.rep }, told: pr.told };
    g.title.close();
    for (let i = 0; i < 600; i++) { H.step(10); await new Promise((r) => setTimeout(r, 30)); if (g.outfitter.visit && !g.player.teleporting && !g.outfitter.arrival) break; }
    return { ...before, visit: g.outfitter.visit && g.outfitter.visit.ep, onFoot: g.player.onFoot };
  });
  result('7 old save with home 30: home 25 (known, rep, told moved), in at 25', c7.home === 25 && !c7.known.includes(30) && c7.known.includes(25) && c7.rep[25] === 3 && !c7.told.includes('30:0') && c7.visit === 25, c7);

  // --- the moments: in a trailhead's lot between trips, the sign's pickup is taught; at its landing on a trip, the lot --
  const c9 = await page.evaluate(async () => {
    const g = window.__game, H = window.__glb, o = g.outfitter;
    H.closeAll();
    const e = g.world.entryPoints.find((q) => q.ep === 27);
    await H.goto(e.x, e.z); await H.built(27);
    const T = g.trailhead.trailheadLayout(27);
    o.setDown(T, o.entry(27)); H.step(20);
    const inLot = { active: g.trip.active, pickup: !!g.hints.due('gl-b:pickup', {}), landing: !!g.hints.due('gl-b:landing', {}) };
    // the sign within reach from the lot's lake side (E on it calls a pickup)
    const near = o.signNear(T.sign.x - T.d.x * 1.2, T.sign.z - T.d.z * 1.2);
    return { inLot, sign: !!near };
  });
  result('9 the moments: in a trailhead lot between trips the pickup is due, not the landing; the sign in reach', c9.inLot.pickup && !c9.inLot.landing && !c9.inLot.active && c9.sign, c9);

  if (SHOTS) {
    // a trailhead from the lot: the sign, the box, the lot, the path down; then close to the sign
    await page.addStyleTag({ content: '#tripcard { display: none !important; } #notes { opacity: 0 !important; }' });
    for (const [file, frac, pitch] of [['b-trailhead.png', -0.6, -0.25], ['b-sign.png', 0.62, 0.05]]) {
      await page.evaluate(async ([frac, pitch]) => {
        const g = window.__game, H = window.__glb, o = g.outfitter, p = g.player;
        H.closeAll();
        const T = g.trailhead.trailheadLayout(27);
        g.day.setClock(g.day.year, 200, 13);
        o.setDown(T, o.entry(27));
        const x = T.lot.x + (T.sign.x - T.lot.x) * frac, z = T.lot.z + (T.sign.z - T.lot.z) * frac, h = Math.atan2(-(T.sign.z - z), T.sign.x - x);
        p.x = x; p.z = z; p.heading = h; p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null }; p.placeOnGround();
        const ch = p.chase; if (ch) { ch.viewYaw = h; ch.forwardYaw = h; ch.viewPitch = pitch; ch.snap(); }
        H.step(40);
        if (g.record && g.record.close) g.record.close();
        H.step(2);
      }, [frac, pitch]);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(SHOT_DIR, file) });
    }
    await page.evaluate(async () => { const g = window.__game, o = g.outfitter; o.showPickup(o.entry(27)); window.__glb.step(5); });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SHOT_DIR, 'b-pickup.png') });
    await page.evaluate(() => window.__glb.closeAll());
  }
} catch (e) {
  log('ERROR', e && e.stack || e);
  results.push({ name: 'run', pass: false, error: String(e) });
} finally {
  await browser.close();
}
fails = results.filter((r) => !r.pass).length;
writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
log(`${results.length - fails}/${results.length} passed`);
process.exit(fails);
