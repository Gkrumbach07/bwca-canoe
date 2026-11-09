// Loop round 4 join (claude/loop-r4: the edge and the map, the roads in 3D, the board's kinds and the late season), the
// seams first, then a season played in real keys (W held to walk and paddle, clicks at the desk; __game only to set a
// scene: the day, a place to stand and face, a teleport), PASS or FAIL at each step, and a 12-shot contact sheet
// (docs/build/shots/loop-r4-contact.png):
//   S1 the truck drives only where a road reaches: every drivable start's way out runs along a road; the starts whose
//      road is past a two-track's reach (EP 6, 16 stores, EP 75, 84 lots) are never driven to (park only)
//   S2 the doorstep: no store yard, trailhead lot, put-in, road point or way in by water is "out"; standing in five
//      yards and five lots the notice never goes up
//   S3 a held notice of a cut kind in an old save goes to the missed list (no penalty), its pin empty, the board fills
//   P1 May at home: the board's ice-out lake trout taken
//   P2 on foot over the edge (W held): the notice up and staying, the walker as free as inside; back in: down
//   P3 by canoe over the edge (W held): the notice up; back in: down
//   P4 into Quetico by canoe: Quetico's own notice; a night pitched there without its permit: one $50 ticket
//   P5 the truck: a ride from the counter to a trailhead lot, the truck in the lot, then gone down its road
//   P6 September: colour photos taken; October: the last check taken (each in its window, not out of it)
//   P7 October at the desk: "Fill one out · free" clicked, a self-issued permit held, $0
//   P8 iced in on a trip: one line, "Frozen in"; walked out over the ice (W held) to the store: the trip comes in
//   P9 iced in again: the rescue sent for from the journal ($75), the trip brought in
//   P10 the turn from the desk: next year's June, two presses, the winter card, up at seven next June
//   P11 no page errors · the contact sheet
//
//   APP=http://localhost:5431 node scripts/loop-r4-test.mjs [--home 25] [--shots <dir>] [--sheet <png>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5431';
const HOME = Number(arg('home', 25));
const SHOTS = path.resolve(arg('shots', path.join(tmpdir(), 'loop-r4')));
const SHEET = path.resolve(arg('sheet', 'docs/build/shots/loop-r4-contact.png'));
mkdirSync(SHOTS, { recursive: true }); mkdirSync(path.dirname(SHEET), { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1800)); };
const sheet = [];

const SPOTS = { lakeOne: [47.94, -91.48], basswood: [48.08, -91.62], whiteIron: [47.89, -91.79], kawnipi: [48.33, -91.3], fallLake: [47.95, -91.72] };

const HELPERS = (SPOTS) => {
  const g = window.__game, H = window.__r4 = { notes: [] };
  const P = g.world.meta.proj;
  H.xz = ([lat, lon]) => ({ x: (lon - P.lon0) * P.mPerDegLon, z: -(lat - P.lat0) * P.mPerDegLat });
  H.at = {}; for (const [k, v] of Object.entries(SPOTS)) H.at[k] = H.xz(v);
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 60000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.setDoy = (doy, hours = 10, year = g.day.year) => { const d = g.day; d.year = year; d.doy = doy; d.hours = hours; d.advance(0); };
  H.look = (yaw, pitch = 0.05) => { const ch = g.chase; if (g.player.mode === 'paddle') { g.player.heading = yaw; g.player.yawRate = 0; } if (ch) { ch.viewYaw = yaw; ch.forwardYaw = yaw; ch.viewPitch = pitch; if (ch.snap) ch.snap(); } };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround(); H.look(heading);
  };
  // to a store's door: the landing first (its tiles in), then the door of the yard it builds
  H.toDoor = async (ep) => { const o = g.outfitter, l = o.landing(ep); await H.tp(l.x, l.z); H.step(20); const Y = o.layout(ep); if (Y && Y.door) { H.standAt(Y.door.x, Y.door.z); H.step(20); } return Y; };
  H.yawTo = (q) => { const p = g.player; return Math.atan2(-(q.z - p.z), q.x - p.x); };
  H.sign = () => { const el = document.getElementById('edge-sign'); return { shown: !!(el && el.classList.contains('show')), text: el ? el.textContent : '', state: g.edge.state }; };
  H.zone = (x, z) => window.__edgeZone(x, z);
  H.water = (x, z) => g.world.lakeIdAt(x, z) > 0 && g.world.isWater(x, z);
  H.closeAll = () => { const o = g.outfitter; if (o.open) o.hide(); try { const hm = g.hud.mode; if (hm === 'sheet' || hm === 'glance') g.hud.setMode(g.hud.settings && g.hud.settings.cornerSheet ? 'corner' : 'hidden'); } catch { /* */ } if (g.journal && g.journal.open) g.journal.close(); if (g.record && g.record.shown) g.record.close(); };
  H.tp = async (x, z) => { H.closeAll(); const ok = await g.player.teleport(x, z); await H.settle(); return ok; };
  // a straight crossing of the zone line near a place: from a point of zone class `from` to one of class `to`, all of
  // it water (by canoe) or land (on foot), within `len` metres; { a, b, yaw } or null
  H.crossing = (c, { from, to, water, len = 160, R = 9000, start = null, skip = null } = {}) => {
    const okZ = (z, want) => (want === 'out' ? z === 0 : want === 'quetico' ? z === 3 : z === 1 || z === 2);
    const kindOk = (x, z) => (water ? H.water(x, z) : !H.water(x, z) && g.world.lakeIdAt(x, z) <= 0);
    let best = null;
    for (let k = 0; k < 30000 && !best; k++) {
      const r = Math.sqrt(k / 30000) * R, a = k * 2.399963;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!okZ(H.zone(x, z), from) || !kindOk(x, z)) continue;
      // well clear of the other kind round it (a start in open water, or on open ground)
      let clear = true; for (let q = 0; q < 8 && clear; q++) { const qa = q * Math.PI / 4; if (!kindOk(x + Math.cos(qa) * 25, z + Math.sin(qa) * 25)) clear = false; }
      if (!clear) continue;
      for (let q = 0; q < 16 && !best; q++) {
        const qa = q * Math.PI / 8, dx = Math.cos(qa), dz = Math.sin(qa);
        let reach = null;
        for (let s = 8; s <= len; s += 8) {
          const px = x + dx * s, pz = z + dz * s;
          if (!kindOk(px, pz)) break;
          if (okZ(H.zone(px, pz), to)) { reach = s; break; }
        }
        if (reach == null) continue;
        // and on past the line a bit more of the same kind, so W held keeps going
        let past = 0; for (let s = reach; s <= reach + 80; s += 8) { if (!kindOk(x + dx * s, z + dz * s) || !okZ(H.zone(x + dx * s, z + dz * s), to)) break; past = s - reach; }
        if (past < 40) continue;
        if (!water) { let steep = false; for (let s = 0; s < reach + past && !steep; s += 8) { const h0 = g.world.heightAt(x + dx * s, z + dz * s), h1 = g.world.heightAt(x + dx * (s + 8), z + dz * (s + 8)); if (Math.abs(h1 - h0) > 1.6) steep = true; } if (steep) continue; if (skip && skip.some((q) => Math.hypot(q.x - x, q.z - z) < 300)) continue; }
        best = { a: { x, z }, b: { x: x + dx * (reach + past), z: z + dz * (reach + past) }, reach, past, dir: { x: dx, z: dz } };
      }
    }
    void start;
    return best;
  };
  // W held (the key itself, sent by the driver) for n frames, the view kept on a bearing
  H.hold = (n, dir) => { const p = g.player, x0 = p.x, z0 = p.z; for (let k = 0; k < n; k++) { if (dir) H.look(Math.atan2(-dir.z, dir.x)); g.step(1 / 30, 1); } return Math.hypot(p.x - x0, p.z - z0); };
  // W held toward a point, the way a player does it: straight at it, and when the walker is held up (a trunk, a rock)
  // a turn of the view to one side for a second, then on at it again
  H.walkTo = (q, n, stopIf = null) => {
    const p = g.player, x0 = p.x, z0 = p.z; let lx = p.x, lz = p.z, det = 0, side = 1, k = 0, stuck = 0;
    for (; k < n; k++) {
      if (k % 30 === 0) { if (Math.hypot(p.x - lx, p.z - lz) < 0.8 && det <= 0) { det = 30; side = -side; stuck++; } lx = p.x; lz = p.z; }
      const y = H.yawTo(q) + (det > 0 ? side * 1.1 : 0); det--;
      H.look(y); g.step(1 / 30, 1);
      if (Math.hypot(q.x - p.x, q.z - p.z) < 4 || (stopIf && stopIf())) break;
    }
    return { moved: Math.round(Math.hypot(p.x - x0, p.z - z0)), frames: k, stuck, left: Math.round(Math.hypot(q.x - p.x, q.z - p.z)) };
  };
  const note = g.hud.note.bind(g.hud);
  g.hud.note = (t, ...a) => { H.notes.push(`${g.day.doy} ${g.day.hours.toFixed(2)} ${t}`); return note(t, ...a); };
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  const ev = (fn, a) => page.evaluate(fn, a);
  const until = (fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
  const shot = async (name, n = null, cap = null) => { const f = path.join(SHOTS, `loop-r4-${name}.png`); await page.screenshot({ path: f }); log('shot', f); if (n) sheet.push({ n, file: f, cap }); return f; };
  // W held toward a point, in pieces of 300 frames (a long evaluate starves the page), till there or `stop` says so
  const walkW = async (q, maxFrames, stop) => {
    await page.keyboard.down('KeyW');
    const tot = { moved: 0, frames: 0, stuck: 0, left: null };
    try {
      for (let f = 0; f < maxFrames; f += 300) {
        const r = await ev(([q, stop]) => { const H = window.__r4, g = window.__game, p = g.player, x0 = p.x, z0 = p.z; const st = stop === 'out' ? () => H.zone(p.x, p.z) === 0 && H.sign().shown : stop === 'in' ? () => H.zone(p.x, p.z) !== 0 && !H.sign().shown : null; const w = H.walkTo(q, 300, st); return { ...w, moved: Math.round(Math.hypot(p.x - x0, p.z - z0)), done: (st && st()) || w.left < 4 }; }, [q, stop]);
        tot.moved += r.moved; tot.frames += r.frames; tot.stuck += r.stuck; tot.left = r.left;
        if (r.done) break;
      }
    } finally { await page.keyboard.up('KeyW'); }
    return tot;
  };
  const holdW = async (n, dir) => { await page.keyboard.down('KeyW'); const d = await ev(([n, dir]) => window.__r4.hold(n, dir), [n, dir]); await page.keyboard.up('KeyW'); await ev(() => window.__r4.step(5)); return d; };

  await page.goto(APP, { timeout: 180000 });
  await until(() => { const g = window.__game; return g && g.title && g.edge && g.truck && g.tasks && g.permits && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, 300000);
  await ev(HELPERS, SPOTS);
  await ev(async () => { const u = [...performance.getEntriesByType('resource')].map((e) => e.name).find((n) => /\/src\/edge\.js/.test(n)) || '/src/edge.js'; const m = await import(u); window.__edgeZone = m.zoneAt; const E = m.EDGE; window.__edgeIn = (x, z) => x >= E.x0 && z >= E.z0 && x < E.x0 + E.W * E.cell && z < E.z0 + E.H * E.cell; const byUrl = async (re, d) => import([...performance.getEntriesByType('resource')].map((e) => e.name).find((n) => re.test(n)) || d); window.__props = await byUrl(/\/src\/props\.js/, '/src/props.js'); window.__OF = await byUrl(/\/src\/outfitters\.js/, '/src/outfitters.js'); });
  // a new Adventure season at home, 20 May
  await ev(async (home) => {
    const g = window.__game, t = g.title, ep = g.world.entryPoints.find((e) => e.ep === home);
    t.setPick('adventure');
    await t.newSeason(ep, { confirm: false, start: { year: 2026, doy: 140 } });
    if (g.onboarding && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(g.onboarding.home, false); }
  }, HOME);
  await until(() => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 180000);
  await ev(() => { const g = window.__game; g.outfitter.arrival = null; window.__r4.closeAll(); if (g.saver) g.saver.enabled = false; g.profile.s.money = 400; try { localStorage.removeItem('bwca-canoe:edge-told'); } catch { /* */ } g.edge.told = {}; window.__r4.step(60); });

  // ---- S1 the truck only where a road reaches -------------------------------------------------------------------------
  const s1 = await ev(() => {
    const g = window.__game, T = g.truck, R = g.world.roads, bad = [], far = [], parkFar = [];
    if (!R) return { none: true };
    const near = (x, z) => { let bd = Infinity; for (const r of R.list) { const b = r.bbox; if (x < b[0] - 30 || x > b[2] + 30 || z < b[1] - 30 || z > b[3] + 30) continue; for (let i = 0; i < r.n; i++) bd = Math.min(bd, Math.hypot(r.p[i * 4] - x, r.p[i * 4 + 1] - z)); } return bd; };
    let driven = 0;
    for (const [key, q] of R.routes) {
      const S = T.spot(key, true);
      if (q.snap > 320) { if (S) far.push(key); if (T.spot(key)) parkFar.push(key); continue; }
      if (!S) continue;
      driven++;
      // the way out past its first 320 m (the lot's own two-track) runs on a road: sample every 20 m
      for (let s = Math.min(S.path.len, 330); s < S.path.len; s += 20) {
        const i = S.path.cum.findIndex((c) => c >= s), pt = S.path.pts[Math.max(0, i)];
        const d = near(pt[0], pt[1]); if (d > 12) { bad.push({ key, s: Math.round(s), d: Math.round(d) }); break; }
      }
    }
    return { routes: R.routes.size, driven, bad: bad.slice(0, 8), far, parkFar };
  });
  result('S1 the truck: every driven way out runs on a road; the far starts (EP 6, 16, 75, 84) never driven, still parkable', !s1.none && s1.driven > 30 && !s1.bad.length && !s1.far.length && s1.parkFar.length >= 4, s1);

  // ---- S2 the doorstep --------------------------------------------------------------------------------------------------
  const s2 = await ev(async () => {
    const g = window.__game, H = window.__r4, o = g.outfitter, R = g.world.roads, outs = [];
    const chk = (what, x, z) => { if (Number.isFinite(x) && H.zone(x, z) === 0) outs.push({ what, x: Math.round(x), z: Math.round(z) }); };
    for (const e of g.world.entryPoints) {
      chk(`put-in ${e.ep}`, e.x, e.z);
      const L = g.trailhead && g.trailhead.trailheadLayout ? g.trailhead.trailheadLayout(e.ep) : null; if (L && L.lot) chk(`lot ${e.ep}`, L.lot.x, L.lot.z);
      const Y = window.__props.yardOf(e.ep); if (Y) chk(`store ${e.ep}`, Y.x, Y.z);
    }
    let roadPts = 0;
    for (const r of R ? R.list : []) for (let i = 0; i < r.n; i += 3) { const x = r.p[i * 4], z = r.p[i * 4 + 1]; if (!window.__edgeIn(x, z)) continue; roadPts++; if (H.zone(x, z) === 0) outs.push({ what: `road ${r.name || r.k}`, x: Math.round(x), z: Math.round(z) }); } // (past the baked box: no world there)
    return { outs: outs.slice(0, 12), n: outs.length, roadPts };
  });
  // the sign itself, stood in yards and lots
  const s2b = await ev(async () => {
    const g = window.__game, H = window.__r4, o = g.outfitter, ups = [];
    const yards = [], lots = [];
    for (const e of g.world.entryPoints) {
      if (window.__OF.isOutfitter(e.ep)) { if (yards.length < 5 && e.ep !== 25) yards.push({ ep: e.ep, store: true }); }
      else if (e.lot && lots.length < 5) lots.push({ ep: e.ep, x: e.lot.x, z: e.lot.z });
    }
    for (const q of [...yards, ...lots]) { if (q.store) { const Y = await H.toDoor(q.ep); if (!Y || !Y.door) { ups.push({ ...q, noYard: true }); continue; } q.x = Y.door.x; q.z = Y.door.z; } else { await H.tp(q.x, q.z); H.standAt(q.x + 3, q.z + 3); } H.step(150); const s = H.sign(); if (s.shown || s.state !== 'in') ups.push({ ...q, s }); }
    return { yards: yards.length, lots: lots.length, ups };
  });
  result('S2 the doorstep: no yard, lot, put-in or drivable road out; stood in 5 yards and 5 lots the notice never up', s2.n === 0 && s2.roadPts > 1000 && !s2b.ups.length && s2b.yards + s2b.lots >= 8, { ...s2, ...s2b });

  // ---- S3 a cut kind in an old save -------------------------------------------------------------------------------------
  const s3 = await ev(async (home) => {
    const g = window.__game, T = g.tasks;
    T.board(home); await T.write(home);
    const d = JSON.parse(JSON.stringify(T.serialize()));
    d.ads = d.ads || []; d.ads.push({ id: 99999, kind: 'rental', from: home, status: 'open', title: 'A rental canoe left at Ensign', posted: T.today() }, { id: 99998, kind: 'latrine', from: home, status: 'offered', title: 'Latrine to dig' });
    d.boards = d.boards || {}; const b = d.boards[home] || (d.boards[home] = { slots: [null, null, null, null], day: 0, n: 0, pending: [] }); b.slots[0] = 99998;
    const m0 = (d.missed || []).length;
    T.restore(d);
    const m = T.missed.find((q) => q.id === 99999);
    T.board(home); await T.write(home);
    const slots = T.boards[home] ? T.boards[home].slots : [];
    return { missed: T.missed.length - m0, line: m ? m.line : null, cut: !!(m && m.cut), slot0: slots[0], held: T.ads.has(99999) || T.ads.has(99998), filled: T.board(home).filter(Boolean).length };
  }, HOME);
  result('S3 an old save: a taken cut notice to the missed list (no penalty), the offered one off its pin, the board fills', s3.missed === 1 && s3.cut && !s3.held && s3.slot0 !== 99998 && s3.filled >= 2, s3);

  // ---- P1 May: the ice-out lakers ----------------------------------------------------------------------------------------
  await ev(async (home) => { const g = window.__game, H = window.__r4, o = g.outfitter; const L = o.landing(home); await H.tp(L.x, L.z); H.step(30); }, HOME);
  const p1 = await ev(async (home) => {
    const g = window.__game, H = window.__r4, T = g.tasks;
    let t = null, out = null, ep = null;
    for (const e of [home, 31, 38, 64, 16, 1, 12, 49, 67, 6]) {
      const L = T.landing(e), ic = L && g.world.facts && g.world.facts.iceOf ? g.world.facts.iceOf(L.lake) : null;
      out = Math.round((ic && ic.out) || 120); H.setDoy(out + 4, 9);
      for (const b of ['local', 'medium']) { try { t = await T.makeKind('iceout', e, b); } catch { t = null; } if (t) break; }
      if (t) { ep = e; break; }
    }
    if (!t) return { made: false, out };
    home = ep;
    T.take(t.id);
    const late = T.inWindow('iceout', out + 60, home);
    return { made: true, out, doy: g.day.doy, pay: t.pay, taken: t.status, late, title: t.title };
  }, HOME);
  await ev(() => { const g = window.__game; g.journal.show('journal'); window.__r4.step(5); });
  await shot('p1-iceout-taken', 1, `May: "${p1.title || 'Ice-out lake trout'}" taken`);
  await ev(() => window.__r4.closeAll());
  result('P1 May: the ice-out lake trout written after ice-out and taken; out of its window by July', p1.made && p1.taken === 'open' && p1.late === false, p1);

  // ---- P2 on foot over the edge ------------------------------------------------------------------------------------------
  let p2 = { none: true }; const tried = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const c2 = await ev((skip) => { const H = window.__r4; window.__game.day.setClock(window.__game.day.year, window.__game.day.doy, 11); return H.crossing(H.at.fallLake, { from: 'in', to: 'out', water: false, len: 100, R: 16000, skip }); }, tried);
    if (!c2) break;
    tried.push(c2.a);
    await ev(async (c) => { const H = window.__r4; await H.tp(c.a.x, c.a.z); H.standAt(c.a.x, c.a.z, Math.atan2(-c.dir.z, c.dir.x)); H.step(60); }, c2);
    const before = await ev(() => ({ ...window.__r4.sign(), mode: window.__game.player.mode }));
    const walked = await walkW(c2.b, 30 * 100, 'out'); await ev(() => window.__r4.step(90));
    const out = await ev(() => { const H = window.__r4, g = window.__game; return { ...H.sign(), zone: H.zone(g.player.x, g.player.z), mode: g.player.mode }; });
    p2 = { attempt, c: { reach: c2.reach, past: c2.past }, before, walked, out };
    if (!out.shown) continue;
    await shot('p2-foot-out', 2, 'On foot past the edge: the notice up');
    await ev(() => window.__r4.step(30 * 60));
    p2.stays = (await ev(() => window.__r4.sign())).shown;
    p2.walkedBack = await walkW(c2.a, 30 * 100, 'in');
    await ev(() => window.__r4.step(120));
    p2.after = await ev(() => { const H = window.__r4, g = window.__game; return { ...H.sign(), zone: H.zone(g.player.x, g.player.z) }; });
    break;
  }
  if (!sheet.some((q) => q.n === 2)) await shot('p2-foot-out', 2, 'On foot by the edge (not over)');
  result('P2 on foot over the edge (W held): up, "You have left the Boundary Waters", still up a minute on; back in: down', !p2.none && !p2.before.shown && p2.out.shown && /left the Boundary Waters/.test(p2.out.text) && p2.stays && p2.after && !p2.after.shown, p2);

  // ---- P3 by canoe over the edge -----------------------------------------------------------------------------------------
  const c3 = await ev(() => { const H = window.__r4; return H.crossing(H.at.whiteIron, { from: 'in', to: 'out', water: true, len: 300, R: 16000 }); });
  let p3 = { none: true };
  if (c3) {
    await ev(async (c) => { const H = window.__r4; await H.tp(c.a.x, c.a.z); H.look(Math.atan2(-c.dir.z, c.dir.x)); H.step(90); }, c3);
    const before = await ev(() => ({ ...window.__r4.sign(), mode: window.__game.player.mode }));
    const went = await holdW(Math.round((c3.reach + c3.past) / 2 * 30 / 8) + 150, c3.dir);
    const out = await ev(() => { const H = window.__r4, g = window.__game; return { ...H.sign(), zone: H.zone(g.player.x, g.player.z), mode: g.player.mode }; });
    await shot('p3-canoe-out', 3, 'By canoe past the edge: the notice up');
    await page.keyboard.press('KeyM'); await ev(() => window.__r4.step(20)); await page.waitForTimeout(400);
    await shot('p3-map-out', 4, 'The map while out: washed a little, the tag');
    await ev(() => { window.__r4.closeAll(); window.__r4.step(10); });
    const went2 = await holdW(Math.round((c3.reach + c3.past) / 2 * 30 / 8) + 200, { x: -c3.dir.x, z: -c3.dir.z });
    await ev(() => window.__r4.step(120));
    const after = await ev(() => { const H = window.__r4, g = window.__game; return { ...H.sign(), zone: H.zone(g.player.x, g.player.z) }; });
    p3 = { c: { reach: c3.reach, past: c3.past }, before, went: Math.round(went), out, went2: Math.round(went2), after };
  }
  result('P3 by canoe over the edge (W held): the notice up; paddled back in: down', !p3.none && p3.before.mode === 'paddle' && !p3.before.shown && p3.out.shown && p3.out.zone === 0 && !p3.after.shown, p3);

  // ---- P4 Quetico --------------------------------------------------------------------------------------------------------
  const c4 = await ev(() => { const H = window.__r4; return H.crossing(H.at.basswood, { from: 'in', to: 'quetico', water: true, len: 400, R: 14000 }); });
  let p4 = { none: true };
  if (c4) {
    await ev(async (c) => { const H = window.__r4; await H.tp(c.a.x, c.a.z); H.look(Math.atan2(-c.dir.z, c.dir.x)); H.step(90); }, c4);
    await holdW(Math.round((c4.reach + c4.past) / 2 * 30 / 8) + 150, c4.dir);
    await ev(() => window.__r4.step(120));
    const sign = await ev(() => { const H = window.__r4, g = window.__game; return { ...H.sign(), zone: H.zone(g.player.x, g.player.z) }; });
    await shot('p4-quetico', 5, 'Into Quetico by canoe: its own notice');
    const night = await ev(() => {
      const g = window.__game, P = g.trip.permits, s = g.trip.state, keep = { active: s.active, mode: s.mode, finedQuetico: s.finedQuetico };
      s.active = true; s.mode = 'adventure'; s.finedQuetico = false;
      const n0 = P.fines.length, first = P.queticoNight(), again = P.queticoNight(), f = P.fines[P.fines.length - 1];
      const off = g.camp.offsiteOk(g.player.x, g.player.z);
      const r = { first, again, added: P.fines.length - n0, n: f && f.n, why: f && f.why, off };
      P.s.fines = P.s.fines.filter((q) => q !== f); if (P.write) P.write(); Object.assign(s, keep);
      return r;
    });
    p4 = { sign, night };
  }
  result('P4 Quetico by canoe: Quetico\'s notice; off-site camping allowed; one $50 ticket a trip without its permit', !p4.none && p4.sign.shown && p4.sign.state === 'quetico' && p4.night.first && !p4.night.again && p4.night.added === 1 && p4.night.n === 50 && p4.night.off, p4);

  // ---- P5 the truck ------------------------------------------------------------------------------------------------------
  await ev(async (home) => { const g = window.__game, H = window.__r4, o = g.outfitter; H.setDoy(196, 9); await H.toDoor(home); H.step(40); o.show(o.landing(home), 'counter'); H.step(5); }, HOME);
  const pick = await ev((home) => {
    const g = window.__game, rides = g.outfitter.rides, T = g.truck;
    const list = rides.offer(home).filter((r) => !r.outfitter && !r.walk && r.km < 60 && T.spot(r.ep, true) && g.trailhead.trailheadLayout(r.ep)?.lot);
    return list.length ? { ep: list[0].ep, km: list[0].km, price: list[0].price } : null;
  }, HOME);
  let p5 = { none: true };
  if (pick) {
    await ev((ep) => { window.__game.outfitter.rides.take(ep); }, pick.ep);
    await until(() => window.__game.veil.active, null, 20000).catch(() => null);
    await until(() => !window.__game.veil.active && !window.__game.player.teleporting, null, 120000);
    await ev(() => window.__r4.step(20));
    const at0 = await ev(() => { const g = window.__game, T = g.truck, p = g.player; return { job: T.job && T.job.kind, vis: !!(T.mesh && T.mesh.visible), d: Math.round(Math.hypot(T.x - p.x, T.z - p.z)), x: T.x, z: T.z }; });
    await ev(() => { const g = window.__game, T = g.truck, H = window.__r4; H.look(H.yawTo({ x: T.x, z: T.z }), -0.05); H.step(2); });
    await shot('p5-truck-lot', 6, `The truck in the lot at EP ${pick.ep}`);
    await ev(() => window.__r4.step(30 * 12));
    await ev(() => { const g = window.__game, T = g.truck, H = window.__r4; H.look(H.yawTo({ x: T.x, z: T.z }), -0.03); H.step(2); });
    await shot('p5-truck-road', 7, 'The truck pulls out down its road');
    const mid = await ev(() => { const g = window.__game, T = g.truck; return { x: T.x, z: T.z, job: T.job && T.job.kind }; });
    await ev(() => window.__r4.step(30 * 200));
    const end = await ev(() => { const g = window.__game, T = g.truck; return { job: T.job && T.job.kind, vis: !!(T.mesh && T.mesh.visible), gone: T.gone }; });
    p5 = { pick, at0, moved: Math.round(Math.hypot(mid.x - at0.x, mid.z - at0.z)), end };
  }
  result('P5 a ride to a trailhead lot: the truck stands in the lot, pulls out down its road, gone', !p5.none && p5.at0.job === 'leave' && p5.at0.d < 40 && p5.moved > 30 && !p5.end.vis, p5);

  // ---- P6 September colour, October last check --------------------------------------------------------------------------
  const p6 = await ev(async (home) => {
    const g = window.__game, H = window.__r4, T = g.tasks, out = {};
    for (const [kind, doy, off] of [['colour', 262, 290], ['lastcheck', 290, 262]]) {
      H.setDoy(doy, 9);
      let t = null; for (const b of ['medium', 'far', 'local']) { t = await T.makeKind(kind, home, b); if (t) break; }
      out[kind] = t ? { made: true, pay: t.pay, title: t.title, off: T.inWindow(kind, off, home), in: T.inWindow(kind, doy, home) } : { made: false };
      if (t) T.take(t.id);
    }
    // the boards themselves: no cut kind, every pin in its window, in September and October
    const bad = [];
    for (const doy of [262, 290]) { H.setDoy(doy, 9); for (const [id, t] of [...T.ads]) if (t.status === 'offered' && t.from === home) T.ads.delete(id); delete T.boards[home]; T.board(home); await T.write(home); for (const t of T.board(home)) if (t && t.status === 'offered' && (!T.boardTable()[t.kind] || !T.inWindow(t.kind, doy, home))) bad.push({ doy, kind: t.kind }); }
    return { ...out, bad, held: [...T.held().map((t) => t.kind), ...T.missed.map((m) => m.kind)] };
  }, HOME);
  await ev(() => { const g = window.__game; g.journal.show('journal'); window.__r4.step(5); });
  await shot('p6-autumn-tasks', 8, 'Autumn: colour photos and the last check taken');
  await ev(() => window.__r4.closeAll());
  result('P6 colour photos in September, the last check in October, each out of the other\'s month; boards all in window', p6.colour.made && p6.colour.in && !p6.colour.off && p6.lastcheck.made && p6.lastcheck.in && !p6.lastcheck.off && !p6.bad.length && ['iceout', 'colour', 'lastcheck'].every((k) => p6.held.includes(k)), p6);

  // ---- P7 October at the desk ---------------------------------------------------------------------------------------------
  await ev(async (home) => { const g = window.__game, H = window.__r4, o = g.outfitter; H.setDoy(285, 9); await H.toDoor(home); g.permits.s.held = g.permits.s.held.filter((p) => p.abs < g.permits.today); o.show(o.landing(home), 'counter'); H.step(5); document.querySelector('#outfitter .permitdesk')?.scrollIntoView({ block: 'start' }); }, HOME);
  const d7 = await ev(() => { const el = document.querySelector('#outfitter .permitdesk'); const b = el && el.querySelector('[data-act="permit-buy"]'); return { buy: b ? b.textContent : null, self: !!(el && el.querySelector('.pd-self')), fwd: !!(el && el.querySelector('.pd-next.fwd')) }; });
  await shot('p7-desk-october', 9, 'October at the desk: "Fill one out · free"');
  const m7 = await ev(() => window.__game.profile.money);
  if (d7.buy) await page.click('#outfitter .permitdesk [data-act="permit-buy"]');
  await ev(() => window.__r4.step(10));
  const p7 = await ev(() => { const g = window.__game, P = g.permits, h = P.held().filter((p) => p.abs === P.today); return { held: h.map((p) => ({ why: p.why, price: p.price, kind: p.kind })), money: g.profile.money }; });
  result('P7 October: "Fill one out · free" clicked, a self-issued permit held, nothing paid', /Fill one out/.test(d7.buy || '') && d7.self && p7.held.some((p) => p.why === 'self') && p7.money === m7, { d7, p7, m7 });

  // ---- P8 iced in, walked out --------------------------------------------------------------------------------------------
  const pushOff = async () => ev(async (home) => {
    const g = window.__game, o = g.outfitter, H = window.__r4, l = o.landing(home), w = g.world, lake = w.lakes[l.lake - 1];
    H.closeAll(); o.port = l;
    const dx = lake.cx - l.x, dz = lake.cz - l.z, d = Math.hypot(dx, dz) || 1, r = Math.min(400, d);
    await g.player.teleport(l.x + (dx / d) * r, l.z + (dz / d) * r); await H.settle(); H.step(30);
    return { active: g.trip.active, permit: !!g.trip.state.permit };
  }, HOME);
  const iceIn = await ev((home) => { const g = window.__game, L = g.outfitter.landing(home), ic = g.world.facts && g.world.facts.iceOf ? g.world.facts.iceOf(L.lake) : null; return Math.round((ic && ic.in) || 329); }, HOME);
  const go8 = await pushOff();
  await ev((doy) => { const g = window.__game, H = window.__r4; H.setDoy(Math.min(364, doy + 3), 11); g.energy.value = 1; H.step(150); }, iceIn);
  const iced8 = await ev(() => { const g = window.__game, H = window.__r4; g.guide.sync(); const e = g.guide.get('late:ice'); return { iced: !!g.trip.state.iced, active: g.trip.active, entry: e ? e.title : null, line: H.notes.filter((t) => /Ice is making/.test(t)).length, ice: g.day.season.ice, mode: g.player.mode }; });
  await ev(() => { const g = window.__game; window.__r4.step(30); window.__r4.closeAll(); g.journal.showTask('late:ice'); window.__r4.step(5); });
  await shot('p8-frozen-in', 10, 'Iced in: "Frozen in" in the journal');
  await ev(() => window.__r4.closeAll());
  // walk out: stood on the ice off the landing, W held to the store's door
  const walk8 = await ev(async (home) => {
    const g = window.__game, H = window.__r4, o = g.outfitter, p = g.player, Y0 = o.layout(home), q = window.__props.yardOf(home), Y = Y0 && Y0.door ? Y0 : { door: { x: q.x, z: q.z } }, l = o.landing(home);
    const dx = l.x - Y.door.x, dz = l.z - Y.door.z, d = Math.hypot(dx, dz) || 1;
    const sx = l.x + (dx / d) * 60, sz = l.z + (dz / d) * 60;
    H.standAt(sx, sz, H.yawTo(Y.door));
    H.step(30);
    return { mode: p.mode, onIce: H.water(p.x, p.z), x: p.x, z: p.z, door: { x: Y.door.x, z: Y.door.z } };
  }, HOME);
  await page.keyboard.down('KeyW');
  const w8 = await ev((door) => { const g = window.__game, H = window.__r4, p = g.player; let k = 0; for (; k < 30 * 120 && g.trip.active; k++) { H.look(H.yawTo(door)); g.step(1 / 30, 1); } return { frames: k, active: g.trip.active, d: Math.round(Math.hypot(p.x - door.x, p.z - door.z)), mode: p.mode }; }, walk8.door);
  await page.keyboard.up('KeyW');
  await ev(() => window.__r4.step(30));
  const last8 = await ev(() => { const b = window.__game.trip.book.trips, t = b[b.length - 1]; return t ? { k: t.k, why: t.why } : null; });
  result('P8 iced in: one line, "Frozen in"; walked out over the ice (W held) to the store: the trip came in', go8.active && iced8.iced && iced8.line === 1 && /Frozen in/.test(iced8.entry || '') && walk8.mode !== 'paddle' && !w8.active && last8 && last8.k !== 'evacuated', { go8, iced8, walk8, w8, last8 });

  // ---- P9 iced in again: the rescue --------------------------------------------------------------------------------------
  await ev((doy) => { const H = window.__r4; H.setDoy(doy - 2, 9); H.step(10); }, iceIn);
  const go9 = await pushOff();
  await ev((doy) => { const g = window.__game, H = window.__r4; H.setDoy(Math.min(364, doy + 3), 11); g.profile.s.money = Math.max(g.profile.s.money, 150); H.step(150); g.journal.showTask('late:ice'); H.step(5); }, iceIn);
  const m9 = await ev(() => window.__game.profile.money);
  const btn = await ev(() => { const g = window.__game; g.journal.render(true); const b = document.querySelector('[data-guide-act="late:ice"]'); return b ? b.textContent : null; });
  if (btn) await page.click('[data-guide-act="late:ice"]'); else await ev(() => window.__game.seasonTurn.rescue());
  await until(() => window.__game.veil.active || !window.__game.trip.active, null, 20000).catch(() => null);
  await until(() => !window.__game.veil.active && !window.__game.trip.active, null, 90000);
  await ev(() => window.__r4.step(20));
  const p9 = await ev(() => { const g = window.__game, b = g.trip.book.trips, t = b[b.length - 1]; return { money: g.profile.money, active: g.trip.active, k: t && t.k, why: t && t.why }; });
  await page.waitForTimeout(1500); await ev(() => { const H = window.__r4, g = window.__game; H.step(30); H.closeAll(); H.step(30); H.closeAll(); const q = window.__props.yardOf(g.profile.home); if (q) H.look(H.yawTo(q), 0.02); H.step(3); });
  await shot('p9-rescued', 11, 'Rescued off the ice: $75, back at a store');
  result('P9 iced in again: "Send for a rescue · $75" clicked, $75 paid, the trip brought in', go9.active && /Send for a rescue · \$75/.test(btn || '') && m9 - p9.money === 75 && !p9.active && p9.k === 'evacuated', { go9, btn, m9, ...p9 });

  // ---- P10 the turn from the desk -----------------------------------------------------------------------------------------
  await ev(async (home) => { const g = window.__game, H = window.__r4, o = g.outfitter; H.closeAll(); await H.toDoor(home); window.__ev = []; g.seasonTurn.on('*', (e, k) => window.__ev.push(k)); o.show(o.landing(home), 'counter'); H.step(5); }, HOME);
  let paid = 0;
  for (let i = 0; i < 4; i++) { const b = await page.$('#outfitter .permitdesk [data-act="permit-pay"]'); if (!b) break; await b.click({ timeout: 5000 }).catch(() => null); paid++; await ev(() => window.__r4.step(3)); }
  const june15 = Math.round(Date.UTC(2027, 5, 15) / 86400000);
  let clickFails = 0;
  const t10 = await ev(async (june15) => {
    const o = window.__game.outfitter, q = (s) => document.querySelector(`#outfitter .permitdesk ${s}`);
    const link = q('[data-act="permit-next"]'); const first = link ? link.textContent : null;
    o.act('permit-next'); o.act('permit-nmonth', '6'); o.act('permit-nday', String(june15));
    const b1 = q('[data-act="permit-nbuy"]'); const l1 = b1 ? b1.textContent : null;
    return { first, l1 };
  }, june15);
  await ev(() => window.__r4.step(2));
  await page.click('#outfitter .permitdesk [data-act="permit-nbuy"]', { timeout: 5000 }).catch(async (e) => { log('click', String(e).replace(/\s+/g, ' ').slice(0, 900)); log('on top', await ev(() => { const b = document.querySelector('#outfitter .permitdesk [data-act="permit-nbuy"]'); if (!b) return 'no button'; const r = b.getBoundingClientRect(), t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return JSON.stringify({ r: [r.x | 0, r.y | 0, r.width | 0, r.height | 0], top: t ? `${t.tagName}#${t.id}.${t.className}` : null, vh: innerHeight }); })); clickFails++; await ev(() => window.__game.outfitter.act('permit-nbuy')); });
  await ev(() => window.__r4.step(2));
  const l2 = await ev(() => document.querySelector('#outfitter .permitdesk [data-act="permit-nbuy"]')?.textContent || null);
  await page.click('#outfitter .permitdesk [data-act="permit-nbuy"]', { timeout: 5000 }).catch(async (e) => { log('click', String(e).slice(0, 400)); clickFails++; await ev(() => window.__game.outfitter.act('permit-nbuy')); });
  await ev(() => window.__r4.step(2));
  await until(() => window.__game.veil.active, null, 20000).catch(() => null);
  await page.waitForTimeout(2500);
  await shot('p10-winter', 12, 'The turn: the winter card');
  await until(() => !window.__game.veil.active, null, 90000);
  await ev(() => window.__r4.step(10));
  const p10 = await ev((june15) => { const g = window.__game, d = g.day, D = g.permitDesk; return { note: D && D.note, canTurn: g.seasonTurn.canTurn(), trip: g.trip.active, owed: g.permits.owed(), year: d.year, today: g.permits.today, hours: +d.hours.toFixed(2), ev: window.__ev.slice(), held: g.permits.held().some((p) => p.abs === june15) }; }, june15);
  result('P10 the turn from the desk: next year\'s June, two presses (clicked), the winter card, up at seven on 15 June 2027', /next year/i.test(t10.first || '') && /Choose/.test(t10.l1 || '') && /end this season/.test(l2 || '') && p10.year === 2027 && p10.today === june15 && Math.abs(p10.hours - 7) < 0.1 && p10.held && p10.ev.includes('season:close') && p10.ev.includes('year:open') && !clickFails, { paid, t10, l2, clickFails, ...p10 });

  result('P11 no page errors', errors.length === 0, { errors: errors.slice(0, 6) });

  // ---- the contact sheet: 12 shots, 3 across --------------------------------------------------------------------------
  const list = sheet.filter((s) => s.n).sort((a, b) => a.n - b.n);
  const sp = await (await browser.newContext({ viewport: { width: 1920, height: 4 * 440 } })).newPage();
  const cells = list.map((s) => `<figure><img src="data:image/png;base64,${readFileSync(s.file).toString('base64')}"><figcaption>${s.n}. ${s.cap || ''}</figcaption></figure>`).join('');
  await sp.setContent(`<!doctype html><style>body{margin:0;background:#181816;display:grid;grid-template-columns:repeat(3,640px);font:15px Arial,sans-serif;color:#f0e8d2}figure{margin:0;width:640px;height:440px;position:relative}img{width:640px;height:400px;display:block}figcaption{height:40px;line-height:40px;padding:0 10px;white-space:nowrap;overflow:hidden}</style>${cells}`);
  await sp.waitForTimeout(500);
  await sp.screenshot({ path: SHEET, fullPage: true });
  log('sheet', SHEET, list.map((s) => s.n).join(','));
  result('P11 the contact sheet has its 12 shots', list.length === 12, { n: list.map((s) => s.n) });
} catch (e) {
  result('the run', false, { error: String((e && e.stack) || e).slice(0, 2000) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
