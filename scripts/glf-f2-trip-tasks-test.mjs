// The game-loop playthrough's fixes, stream f2 (trip and tasks), checked headless in one Chromium against a running Vite:
//   1. a push-off taken back (back at the landing it left without going anywhere) says so in one line, and the permit is
//      back in your pocket
//   2. the water need lasts most of a day sitting in the canoe (not 8 hours); coming in at 10 pm leaves the needs where
//      they were (no refill to 100 % without a night)
//   3. a trailhead's way from the water up to the lot is clear of trees, brush and reeds (Snowbank 27, Lake One 30), and a
//      canoe lying on the water in the shallows is not "beached"
//   4. the trip-end tally has a line for a ranger's fine given on that trip (r2: a ticket, in your book)
//   5. no two notices send you to one place, and none to a campsite a party holds today (or the ring says so)
//   6. no cap (the owner's call 2026-11-05): five held from two boards, a sixth and a seventh taken at a board by its button
//   APP=http://localhost:5192 node scripts/glf-f2-trip-tasks-test.mjs [--shots dir]
// Exit code 0 when every check passes.
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5192';
const SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 900)); };
const shot = async (page, name) => { if (SHOTS) { try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch (e) { log('shot', name, e.message); } } };
const HOME = 25; // Moose Lake

const HELPERS = () => {
  const g = window.__game, H = window.__f2 = {};
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
  H.lines = () => (document.getElementById('lines') || { textContent: '' }).textContent;
  H.closeAll = () => { const o = g.outfitter; if (o.open) o.hide(); if (o.shelfOpen && o.shelf) o.shelf.close(); if (g.record && g.record.shown && g.record.close) g.record.close(); };
  // out onto the water from the home landing, r metres toward the lake's middle (the trip pushes off by itself)
  H.pushOff = async (ep, r) => {
    const o = g.outfitter, l = o.landing(ep), lake = g.world.lakes[l.lake - 1];
    H.standAt(l.x, l.z); H.step(20);
    o.port = l;
    const dx = lake.cx - l.x, dz = lake.cz - l.z, dd = Math.hypot(dx, dz) || 1, m = Math.min(r, dd);
    await g.player.teleport(l.x + (dx / dd) * m, l.z + (dz / dd) * m);
    await H.settle(); H.step(30);
    return g.trip.active;
  };
  // on foot by the store's door: out of the trip
  H.toDoor = (ep) => { const L = g.outfitter.layout(ep); H.standAt(L.door.x, L.door.z); H.step(30); };
  // what stands within r metres of a trailhead's way from the water up to its lot (the tiles' plants, the near ring's)
  H.wayScan = (ep, r = 2.5) => {
    const T = g.trailhead.trailheadLayout(ep), A = T.water, B = T.lot;
    const segD = (x, z) => { const dx = B.x - A.x, dz = B.z - A.z, l2 = dx * dx + dz * dz; let t = ((x - A.x) * dx + (z - A.z) * dz) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - (A.x + dx * t), z - (A.z + dz * t)); };
    const hits = [];
    g.scene.traverse((o) => {
      if (!o.isInstancedMesh || !o.visible) return;
      const A2 = o.instanceMatrix.array, e = o.matrixWorld.elements;
      for (let i = 0; i < o.count; i++) {
        const q = i * 16; if (A2[q] === 0 && A2[q + 5] === 0 && A2[q + 10] === 0) continue;
        const x = A2[q + 12] + e[12], z = A2[q + 14] + e[14];
        if (Math.abs(x - (A.x + B.x) / 2) > 40 || Math.abs(z - (A.z + B.z) / 2) > 40) continue;
        const d = segD(x, z); if (d < r) hits.push({ name: o.name || (o.parent && o.parent.name) || '?', d: +d.toFixed(2) });
      }
    });
    return { ep, way: +Math.hypot(B.x - A.x, B.z - A.z).toFixed(1), n: hits.length, hits: hits.slice(0, 6) };
  };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.permits && window.__game.trailhead && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
  log('game loaded');

  // --- a new Adventure season at Moose Lake, July 10 ---------------------------------------------------------------------
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await page.waitForFunction(() => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0, null, { timeout: 120000, polling: 250 });
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await page.waitForFunction(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, { timeout: 180000, polling: 250 });
  await page.evaluate(() => { const g = window.__game; window.__f2.closeAll(); g.day.setClock(g.day.year, g.day.doy, 9); window.__f2.step(30); });
  // (r3: the empty-handed start: the staff talk's gear and the loaned canoe at the dock, as the talk gives them)
  await page.evaluate(() => { const g = window.__game, ob = g.onboarding; if (ob && ob.pending()) { ob.give(); ob.finish(ob.home, false); } window.__f2.step(10); });

  // --- 1. a push-off taken back says so, and the permit is yours again ---------------------------------------------------
  const tb = await page.evaluate(async (home) => {
    const g = window.__game, H = window.__f2, P = g.permits;
    const pm = P.grant({ ep: home, abs: P.today, from: home, why: 'test' });
    const trips0 = g.trip.book.trips.length;
    const out = await H.pushOff(home, 50);
    const used = !P.held().some((p) => p.id === pm.id), away = !!g.outfitter.trip.away;
    H.toDoor(home);
    for (let i = 0; i < 10 && g.trip.active; i++) { H.step(10); await H.wait(20); }
    return { out, used, away, active: g.trip.active, back: P.held().some((p) => p.id === pm.id), trips: g.trip.book.trips.length - trips0, lines: H.lines() };
  }, HOME);
  await shot(page, 'f2-1-takeback');
  result('1 a short outing taken back: one line says so, the permit is still good, nothing in the logbook', tb.out && tb.used && !tb.away && !tb.active && tb.back && tb.trips === 0 && /short outing, not a trip/.test(tb.lines) && /permit is still good/.test(tb.lines), tb);

  // --- 2a. the water need sitting in the canoe ---------------------------------------------------------------------------
  const wr = await page.evaluate(async (home) => {
    const g = window.__game, H = window.__f2, en = g.energy;
    g.day.setClock(g.day.year, g.day.doy, 8); H.step(5);
    const out = await H.pushOff(home, 400);
    en.needs.water = 1; en.needs.food = 1; H.step(2);
    const w0 = en.needs.water, h0 = en.now;
    for (let k = 0; k < 600 && en.now - h0 < 1.2; k++) { g.player.speed = 0; H.step(30, 1 / 30); if (k % 20 === 0) await H.wait(5); }
    const hours = en.now - h0, drop = w0 - en.needs.water, perH = drop / hours;
    return { out, hours: +hours.toFixed(2), drop: +drop.toFixed(4), perH: +perH.toFixed(4), emptyIn: +(1 / perH).toFixed(1), mode: g.player.mode, hard: en.hard };
  }, HOME);
  result('2a the water need lasts 13–19 game hours sitting in the canoe (it was 8)', wr.out && wr.hours >= 0.8 && wr.emptyIn >= 13 && wr.emptyIn <= 19, wr);
  // the rates themselves: a day's litres (16 h awake, 6 of them paddling hard; 8 asleep)
  const litres = await page.evaluate(() => {
    const en = window.__game.energy, save = { ...en.need }, out = {};
    en.need.water = 1; en.passNeeds(10, false, true); out.hard10 = +(1 - en.need.water).toFixed(3);
    en.need.water = 1; en.passNeeds(16, false, false); out.easy16 = +(1 - en.need.water).toFixed(3);
    Object.assign(en.need, save);
    return out;
  });
  result('2a′ full to empty: 16 h sitting, 10 h hard (a day takes two to three litres)', Math.abs(litres.easy16 - 1) < 0.01 && Math.abs(litres.hard10 - 1) < 0.01, litres);
  // come in from the permit's trip (away by now: 400 m out)
  await page.evaluate(async (home) => {
    const g = window.__game, H = window.__f2;
    await H.goto(g.outfitter.landing(home).x, g.outfitter.landing(home).z); H.toDoor(home);
    for (let i = 0; i < 20 && g.trip.active; i++) { H.step(10); await H.wait(20); }
    const c = g.record.s.trips.slice(-1)[0];
    for (let i = 0; i < 100 && c && g.record.shown !== c.id; i++) { H.step(10); await H.wait(100); } // (the card comes up a moment after)
    H.closeAll(); H.step(10);
  }, HOME);

  // --- 2b + 4. a day-use trip out after dark: the ranger's fine; in at 10 pm, the needs stay where they were --------------
  const late = await page.evaluate(async (home) => {
    const g = window.__game, H = window.__f2, en = g.energy, P = g.permits;
    g.day.setClock(g.day.year, g.day.doy, 16); H.step(5);
    const out = await H.pushOff(home, 400);
    const dayUse = g.trip.state.dayUse;
    g.day.setClock(g.day.year, g.day.doy, 22); H.step(10);
    for (let i = 0; i < 10 && !g.trip.state.fined; i++) { H.step(40); await H.wait(20); }
    const fined = g.trip.state.fined, owed = P.owed();
    en.needs.food = 0.4; en.needs.water = 0.5; H.step(5);
    const before = { food: +en.needs.food.toFixed(3), water: +en.needs.water.toFixed(3), ceiling: +en.ceiling.toFixed(3) };
    await H.goto(g.outfitter.landing(home).x, g.outfitter.landing(home).z);
    H.toDoor(home);
    const c = g.record.s.trips.slice(-1)[0];
    for (let i = 0; i < 100 && c && g.record.shown !== c.id; i++) { H.step(10); await H.wait(100); } // (the card comes up once nothing else is on the screen)
    H.step(10);
    const after = { food: +en.needs.food.toFixed(3), water: +en.needs.water.toFixed(3), ceiling: +en.ceiling.toFixed(3), value: +en.value.toFixed(3) };
    return { out, dayUse, fined, owed, active: g.trip.active, hour: +g.day.hours.toFixed(2), before, after, tallyFine: c && c.tally ? c.tally.fine : null, cardText: g.record.el ? g.record.el.textContent.replace(/\s+/g, ' ').slice(0, 600) : '' };
  }, HOME);
  await page.waitForTimeout(2500); await page.evaluate(() => window.__f2.step(5));
  await shot(page, 'f2-4-tally-fine');
  const cardNow = await page.evaluate(() => { const g = window.__game; return g.record.el ? g.record.el.textContent.replace(/\s+/g, ' ') : ''; });
  result('4 the tally says the ranger\'s fine given on that trip', /trip 2/.test(cardNow) && late.out && late.dayUse && late.fined && late.owed === 20 && late.tallyFine === 20 && /A ranger’s ticket/.test(cardNow) && /\$20, in your book/.test(cardNow), { ...late, cardText: cardNow.slice(0, 400) });
  result('2b in at 10 pm with no night: the needs stay where the trip left them (no refill to 100 %)', !late.active && late.after.food <= late.before.food + 0.01 && late.after.food < 0.5 && late.after.ceiling < 0.9 && late.after.value <= late.after.ceiling + 1e-6, { before: late.before, after: late.after, hour: late.hour });
  // ... and a night in the bunkhouse fills them again
  const bunk = await page.evaluate(async () => {
    const g = window.__game, H = window.__f2, o = g.outfitter, en = g.energy;
    H.closeAll(); g.profile.money += 40;
    o.show(o.landing(o.at ? o.at.ep : 25), 'counter'); H.step(2);
    o.night(o.landing(o.at ? o.at.ep : 25), 'test');
    for (let i = 0; i < 80 && (o.bunking || (g.veil && g.veil.active)); i++) { H.step(10, 1 / 10); await H.wait(30); }
    H.step(10); H.closeAll();
    return { food: +en.needs.food.toFixed(2), water: +en.needs.water.toFixed(2), warmth: +en.needs.warmth.toFixed(2), rest: +en.needs.rest.toFixed(2), ceiling: +en.ceiling.toFixed(2), hour: +g.day.hours.toFixed(1) };
  });
  result('2b′ a night in the bunkhouse fills the needs again', bunk.food >= 0.99 && bunk.water >= 0.99 && bunk.warmth >= 0.99 && bunk.ceiling >= 0.9, bunk);
  await page.evaluate(() => { const g = window.__game; if (g.permits.owed()) g.permits.payFines(); window.__f2.closeAll(); });

  // --- 5. no two notices to one place; none to a party's campsite, or the ring says so ------------------------------------
  const spots = await page.evaluate(async (home) => {
    const g = window.__game, H = window.__f2, T = g.tasks, C = g.campsites, W = g.world;
    const eps = g.outfitters.OUTFITTER_EPS.slice(0, 6);
    for (const ep of eps) T.board(ep);
    for (let i = 0; i < 300 && T.filling.size; i++) { H.step(2); await H.wait(50); }
    const made = [];
    for (let k = 0; k < 6; k++) { const t = await T.makeKind('item', home, k % 2 ? 'medium' : 'local'); if (t) made.push(t); }
    const all = [...T.ads.values()].map((t) => ({ id: t.id, kind: t.kind, from: t.from, s: T.spotOf(t) })).filter((q) => q.s);
    let clash = null;
    for (let i = 0; i < all.length && !clash; i++) for (let j = i + 1; j < all.length; j++) { const a = all[i], b = all[j]; if (Math.hypot(a.s.x - b.s.x, a.s.z - b.s.z) < 80) { clash = { a: a.id, b: b.id, ka: a.kind, kb: b.kind }; break; } }
    // a party on the first one's site: a new notice never goes there, and the ring of one taken there says so
    const t0 = made[0], site = t0 ? W.campsites[t0.site] : null, key = site ? C.key(site) : null;
    let partySite = null, ring = null;
    if (site) {
      const held = C.holder(key);
      T.ads.delete(t0.id);
      C.claim(key, 'party:f2-test');
      const again = [];
      for (let k = 0; k < 4; k++) { const t = await T.makeKind('item', home, 'local'); if (t) { again.push(t.site); T.ads.delete(t.id); } }
      // the notice as it was, taken before the party came: its ring says so
      T.ads.set(t0.id, t0); t0.status = 'open'; t0.known = true;
      ring = T.targetOf(t0);
      t0.status = 'offered'; T.ads.delete(t0.id);
      C.release(key, 'party:f2-test'); if (held) C.claim(key, held);
      partySite = { site: t0.site, again, open: T.siteOpen(site) };
    }
    return { notices: all.length, items: made.length, clash, partySite, ring: ring && ring.label };
  }, HOME);
  result('5 no two notices send you within 80 m of one place', spots.notices >= 6 && spots.items >= 3 && !spots.clash, spots);
  result('5′ a campsite a party holds today gets no new notice, and a notice taken there says so on its ring', spots.partySite && spots.partySite.again.length >= 2 && !spots.partySite.again.includes(spots.partySite.site) && /a party camps there today/.test(spots.ring || ''), spots);

  // --- 6. five held; a sixth and a seventh at a board are taken ------------------------------------------------------------------
  const lim = await page.evaluate(async (home) => {
    const g = window.__game, H = window.__f2, T = g.tasks, o = g.outfitter;
    for (const t of T.held().slice()) if (t.status === 'open') T.drop(t.id);
    const offered = (ep) => T.board(ep).filter((t) => t && t.status === 'offered');
    const eps = g.outfitters.OUTFITTER_EPS.filter((e) => e !== home);
    const took = [];
    for (const t of offered(home)) { if (T.held().length >= 5) break; if (T.take(t.id)) took.push({ id: t.id, from: t.from }); }
    let second = null;
    for (const ep of eps) {
      if (T.held().length >= 5 && second != null) break;
      const list = offered(ep); if (!list.length) continue;
      if (second == null && list.length >= 3) second = ep;
      for (const t of list) { if (T.held().length >= 5) break; if (ep === second && list.indexOf(t) >= list.length - 2) break; if (T.take(t.id)) took.push({ id: t.id, from: t.from }); }
    }
    return { held: T.held().length, took, second, boards: took.map((t) => t.from).filter((v, i, a) => a.indexOf(v) === i) };
  }, HOME);
  const six = await page.evaluate(async (ep) => {
    const g = window.__game, H = window.__f2, T = g.tasks, o = g.outfitter, l = o.landing(ep);
    await H.goto(l.x, l.z); await H.built(ep);
    const L = o.layout(ep), at = L.counter || L.centre; H.standAt(at.x, at.z); H.step(30);
    for (let i = 0; i < 40 && !(o.visit && o.visit.inside); i++) { H.step(10); await H.wait(20); }
    H.closeAll();
    o.show(l, 'board'); H.step(5); await H.wait(200);
    const held0 = T.held().length, ids = [], status = [];
    for (let k = 0; k < 2; k++) {
      const btn = o.el.panel.querySelector('button[data-act="task"][data-id^="take:"]');
      const id = btn ? Number(btn.dataset.id.split(':')[1]) : null;
      if (btn) btn.click();
      H.step(5); await H.wait(150);
      ids.push(id); const t = id != null ? T.ads.get(id) : null; status.push(t && t.status);
    }
    return { ep, ids, held0, held: T.held().length, status, lines: H.lines(), board: /You hold|at a time/i.test(o.el.panel.textContent) };
  }, lim.second);
  await shot(page, 'f2-6-sixth');
  result('6 holding five from two boards, a sixth and a seventh taken at a board, no cap line', lim.held === 5 && lim.boards.length >= 2 && six.ids.every((x) => x != null) && six.held0 === 5 && six.held === 7 && six.status.every((x) => x === 'open') && !/You hold five/.test(six.lines) && !six.board, { lim, six });
  await page.evaluate(() => window.__f2.closeAll());

  // --- 3. the trailheads' way to the water, clear; the canoe in the shallows ------------------------------------------------
  for (const ep of [27, 30]) {
    const w = await page.evaluate(async (ep) => {
      const g = window.__game, H = window.__f2, o = g.outfitter, e = o.entry(ep);
      if (g.trip.active) g.trip.takeBack();
      await H.goto(e.x, e.z); await H.built(ep); H.step(30);
      const T = g.trailhead.trailheadLayout(ep), L = T.landing, P = T.lot;
      H.standAt(L.x, L.z, Math.atan2(-(P.z - L.z), P.x - L.x));
      for (let i = 0; i < 12; i++) { H.step(10); await H.wait(60); }
      H.closeAll();
      return H.wayScan(ep, 2.5);
    }, ep);
    await page.waitForTimeout(300);
    await shot(page, `f2-3-way-${ep}`);
    result(`3 the way from the water up to the lot at ${ep} is clear (nothing within 2.5 m of it)`, w.n === 0 && w.way > 5, w);
  }
  const lab = await page.evaluate(async () => {
    const g = window.__game, H = window.__f2, pk = g.packs, w = g.world, T = g.trailhead.trailheadLayout(30), p = g.player;
    // along the landing's line, out from the shore: a hull lying on the water but too shallow to get in, and one up the bank
    const hd = Math.atan2(-T.d.x, T.d.z); // along the shore (square to d)
    let shallow = null, bank = null;
    for (let m = -6; m < 30 && !(shallow && bank); m += 0.25) {
      const x = T.landing.x + T.d.x * m, z = T.landing.z + T.d.z * m;
      for (const h of [hd, hd + Math.PI / 2]) {
        const d = { x, z, heading: h };
        if (!shallow && pk.onWater(d) && !pk.afloat(d)) shallow = d;
        if (!bank && !pk.onWater(d) && w.shoreAt(x, z) > 0.3 && w.shoreAt(x, z) < 3) { const L = pk.dropLaunch(d); if (L && L.deep) bank = d; }
      }
    }
    const labelAt = (d) => { if (!d) return null; H.standAt(d.x - T.d.x * 2, d.z - T.d.z * 2); p.carry.drop = { ...d }; p.restHull(d.x, d.z, d.heading); H.step(2); const a = pk.hullAction(); return a ? a.label : null; };
    return { shallow: labelAt(shallow), bank: labelAt(bank), found: { shallow: !!shallow, bank: !!bank } };
  });
  result('3′ a canoe lying on the water in the shallows reads "in the shallows"; up the bank, "beached"', lab.shallow === 'the canoe, in the shallows' && lab.bank === 'the canoe, beached', lab);
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
