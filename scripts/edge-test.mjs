// The edge round, streams E1 + E2 (docs/build/edge-and-roads.md, "Owner decisions (2026-11-08)"): headless Chromium
// against a running Vite, each check printed PASS or FAIL, a screenshot at each step:
//   0 the tables load: src/edge.bin (the zones and outlines), src/map-roads.bin; the campsites past the band marked
//   1 the zones where they should be: Lake One and Basswood wild, the Moose Lake chain and Farm Lake a doorstep or wild,
//     White Iron, Vermilion and Superior out (Burntside out or a doorstep: Crab Lake's way in crosses it), Kawnipi
//     Quetico; every entry point's put-in, lot and store in
//   2 out on White Iron (paddled there: nothing stops it): the notice up and it says "You have left the Boundary Waters",
//     the first time with its second line; the map says it too
//   3 it stays up: two minutes out, still up; walking on out, the canoe moves as freely as inside (no slow-down)
//   4 back in on Lake One: the notice down
//   5 settle: a step over the line and back within a second does not raise it; held out for 3 s it does (and the second
//     time it is the title alone)
//   6 Quetico (Kawnipi): its own notice; camping off a site allowed there; a night without a Quetico permit is one $50
//     ticket (once a trip), on Ontario's notice in the book; no notice at all with a Quetico permit held
//   7 the campsites past the band: on no map, in no party's choices, no notice's site
//   8 the map: the wash past the edge (lighter than inside, but only a little) and the roads round Ely, by the painters
//     themselves on sheets of their own; the notice while out; a shot of the book's map on the Ely side
//   9 no page errors
//
//   npx vite --port 5411 --strictPort &
//   APP=http://localhost:5411 node scripts/edge-test.mjs [--home 31] [--shots <dir>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5411';
const HOME = Number(arg('home', 31));
const SHOTS = arg('shots', path.join(process.cwd(), 'edge-shots'));
mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1400)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

// places by latitude and longitude (index.json proj), in the page
const SPOTS = {
  lakeOne: [47.94, -91.48], basswood: [48.08, -91.62], mooseLake: [47.985, -91.5], farmLake: [47.96, -91.67],
  whiteIron: [47.89, -91.79], burntside: [47.93, -92.05], vermilion: [47.86, -92.3], superior: [47.84, -89.97], kawnipi: [48.33, -91.3], ely: [47.9016, -91.8573],
};

const HELPERS = (SPOTS) => {
  const g = window.__game, H = window.__edge = {};
  const P = g.world.meta.proj;
  H.xz = ([lat, lon]) => ({ x: (lon - P.lon0) * P.mPerDegLon, z: -(lat - P.lat0) * P.mPerDegLat });
  H.at = {}; for (const [k, v] of Object.entries(SPOTS)) H.at[k] = H.xz(v);
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 60000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.go = async (k) => { const q = H.at[k] || k; if (g.outfitter.open) g.outfitter.hide(); if (g.outfitter.visit && g.outfitter.leave) try { g.outfitter.leave(); } catch { /* */ } const ok = await g.player.teleport(q.x, q.z); await H.settle(); return ok; };
  H.sign = () => { const el = document.getElementById('edge-sign'); return { shown: !!(el && el.classList.contains('show')), text: el ? el.textContent : '', cls: el ? el.className : '', state: g.edge.state }; };
  H.zone = (k) => { const q = H.at[k] || k; return g.edge.raw !== undefined ? window.__edgeZone(q.x, q.z) : null; };
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  const shot = async (name) => { const f = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: f }); log('shot', f); };
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.edge && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS, SPOTS);
  // the page's own edge module (the copy the game loaded: Vite module copy trap), by its URL
  await page.evaluate(async () => { const u = [...performance.getEntriesByType('resource')].map((e) => e.name).find((n) => /\/src\/edge\.js/.test(n)) || '/src/edge.js'; const m = await import(u); window.__edgeMod = m; window.__edgeZone = m.zoneAt; });

  // 0 the tables
  const t0 = await page.evaluate(async () => { const m = window.__edgeMod, g = window.__game; await m.loadMapRoads(); return { edge: m.EDGE.ready, W: m.EDGE.W, H: m.EDGE.H, rings: m.EDGE.rings.length, roads: m.ROADS.lines.length, towns: m.ROADS.towns.length, exits: m.ROADS.exits.length, past: g.world.pastSites, sites: g.world.campsites.length }; });
  result('0 the edge and the roads load; the campsites past the band marked', t0.edge && t0.rings > 1 && t0.roads > 100 && t0.towns > 10 && t0.past > 100 && t0.past < 250, t0);

  // 1 the zones
  const z1 = await page.evaluate(() => {
    const H = window.__edge, g = window.__game, Z = window.__edgeZone, out = {};
    for (const k of Object.keys(H.at)) out[k] = Z(H.at[k].x, H.at[k].z);
    const bad = [];
    for (const e of g.world.entryPoints) {
      const pts = [[e.x, e.z], e.lot && [e.lot.x, e.lot.z], e.head && [e.head.x, e.head.z]].filter(Boolean);
      for (const [x, z] of pts) { const q = Z(x, z); if (q !== 1 && q !== 2) bad.push({ ep: e.ep, q }); }
    }
    return { out, bad };
  });
  const zo = z1.out;
  result('1 the zones: wild, doorstep, out and Quetico where they belong; every entry point in', zo.lakeOne === 1 && zo.basswood === 1 && [1, 2].includes(zo.mooseLake) && [1, 2].includes(zo.farmLake)
    && zo.whiteIron === 0 && [0, 2].includes(zo.burntside) && zo.vermilion === 0 && zo.superior === 0 && zo.ely === 0 && zo.kawnipi === 3 && !z1.bad.length, z1);

  // a new season at home
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await shot('0-startmap');
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { try { localStorage.removeItem('bwca-canoe:edge-told'); } catch { /* */ } const e = window.__game.edge; e.told = {}; });
  const atHome = await page.evaluate(() => { window.__edge.step(120); return window.__edge.sign(); });
  result('1b at the home outfitter (a doorstep): no notice', !atHome.shown && atHome.state === 'in', atHome);

  // 2 out on White Iron
  const s2 = await page.evaluate(async () => { const H = window.__edge, g = window.__game; g.day.setClock(g.day.year, g.day.doy, 11); const ok = await H.go('whiteIron'); H.step(150); return { ok, ...H.sign(), x: g.player.x | 0, z: g.player.z | 0, mode: g.player.mode, zone: window.__edgeZone(g.player.x, g.player.z) }; });
  await shot('2-out-white-iron');
  result('2 out on White Iron: "You have left the Boundary Waters", its second line the first time', s2.ok && s2.shown && /You have left the Boundary Waters/.test(s2.text) && /Private land/.test(s2.text) && s2.state === 'out', s2);

  // 3 it stays; and the canoe moves as freely out here as in (the same push, the same way covered)
  const s3 = await page.evaluate(async () => {
    const H = window.__edge, g = window.__game, p = g.player;
    H.step(3600, 1 / 30); // two minutes
    const still = H.sign();
    const run = () => { const x0 = p.x, z0 = p.z; for (let i = 0; i < 90; i++) { p.speed = 2.5; H.step(1); } return Math.hypot(p.x - x0, p.z - z0); };
    const outM = run();
    await H.go('lakeOne'); H.step(150);
    const inM = run();
    return { still, outM: +outM.toFixed(2), inM: +inM.toFixed(2) };
  });
  result('3 the notice stays up out there; nothing slows the canoe (the same push goes as far out as in)', s3.still.shown && s3.still.state === 'out' && s3.outM > 1 && Math.abs(s3.outM - s3.inM) / Math.max(s3.inM, 0.01) < 0.35, s3);

  // 4 back in
  const s4 = await page.evaluate(() => window.__edge.sign());
  await shot('4-back-in-lake-one');
  result('4 back in on Lake One: the notice down', !s4.shown && s4.state === 'in', s4);

  // 5 settle: a moment over the line does not raise it; held out it does, the title alone the second time
  const s5 = await page.evaluate(() => {
    const H = window.__edge, g = window.__game, e = g.edge, p = g.player, Z = window.__edgeZone;
    // a point on Farm Lake's way out toward White Iron where the zone turns: walk the line west from Farm Lake
    const a = H.at.farmLake, b = H.at.whiteIron; let edgeAt = null;
    for (let t = 0; t <= 1; t += 0.002) { const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; if (Z(x, z) === 0) { edgeAt = { x, z, t }; break; } }
    if (!edgeAt) return { none: true };
    const dx = (b.x - a.x), dz = (b.z - a.z), L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const put = (d) => { p.x = edgeAt.x + ux * d; p.z = edgeAt.z + uz * d; };
    put(-120); e.update(0.1, p); put(-120); for (let i = 0; i < 40; i++) e.update(0.1, p); const before = e.state;
    put(-80); e.update(0.1, p); put(60); for (let i = 0; i < 8; i++) e.update(0.1, p); const blip = e.state; // 0.8 s out
    put(-60); for (let i = 0; i < 40; i++) e.update(0.1, p); const back = e.state;
    put(60); for (let i = 0; i < 30; i++) e.update(0.1, p); const held = e.state, text = H.sign().text;
    put(-60); for (let i = 0; i < 40; i++) e.update(0.1, p);
    return { edgeAt: { x: edgeAt.x | 0, z: edgeAt.z | 0 }, before, blip, back, held, text };
  });
  result('5 a blip over the line raises nothing; three seconds out does, the title alone the second time', !s5.none && s5.before === 'in' && s5.blip === 'in' && s5.back === 'in' && s5.held === 'out' && s5.text === 'You have left the Boundary Waters', s5);

  // 6 Quetico
  const s6 = await page.evaluate(async () => {
    const H = window.__edge, g = window.__game, P = g.trip.permits;
    const ok = await H.go('kawnipi'); H.step(150);
    const sign = H.sign();
    const off = g.camp.offsiteOk(g.player.x, g.player.z), offUS = g.camp.offsiteOk(H.at.lakeOne.x, H.at.lakeOne.z);
    // a night pitched there on an Adventure trip, without a Quetico permit: the trip's state as a push-off leaves it
    const s = g.trip.state, keep = { active: s.active, mode: s.mode, finedQuetico: s.finedQuetico, fined: s.fined };
    s.active = true; s.mode = 'adventure'; s.finedQuetico = false;
    const n0 = P.fines.length, first = P.queticoNight(), again = P.queticoNight(), f = P.fines[P.fines.length - 1];
    const fine = f ? { why: f.why, n: f.n, place: f.place } : null;
    // with a Quetico permit held, no notice
    const pk = s.permit; s.permit = { kind: 'quetico', id: 'Ptest' }; const e = g.edge;
    for (let i = 0; i < 40; i++) e.update(0.1, g.player); const held = e.state;
    s.permit = pk; for (let i = 0; i < 40; i++) e.update(0.1, g.player); const after = e.state;
    // the ticket, written up: Ontario's notice
    P.issue(); const tk = P.tickets().find((q) => q.why === 'quetico');
    const m = await import([...performance.getEntriesByType('resource')].map((q) => q.name).find((n) => /\/src\/flyers\.js/.test(n)) || '/src/flyers.js');
    const html = tk ? m.ticketHtml(tk, { date: 'July 10' }) : '';
    // tidy: the test's fine out of the season
    P.s.fines = P.s.fines.filter((q) => q !== f || !f || f.why !== 'quetico'); P.write && P.write();
    Object.assign(s, keep);
    return { ok, sign, off, offUS, first, again, added: P.fines.length - n0, fine, held, after, ontario: /Ontario Parks/.test(html) && /Quetico Provincial Park/.test(html) && /Camped in Quetico without a Quetico permit/.test(html) };
  });
  await shot('6-quetico');
  result('6 Quetico: its own notice; camping off a site allowed there (not in the US); one $50 ticket a trip on Ontario\'s notice; none with its permit', s6.ok && s6.sign.shown && /Quetico Provincial Park/.test(s6.sign.text) && s6.sign.state === 'quetico'
    && s6.off && !s6.offUS && s6.first && !s6.again && s6.fine && s6.fine.why === 'quetico' && s6.fine.n === 50 && s6.held === 'in' && s6.after === 'quetico' && s6.ontario, s6);

  // 7 the campsites past the band
  const s7 = await page.evaluate(() => {
    const g = window.__game, w = g.world, past = w.campsites.map((c, i) => [c, i]).filter(([c]) => c.past).map(([, i]) => i);
    const pset = new Set(past), pa = g.parties;
    let inParties = 0; if (pa && pa.basinSites) for (const l of pa.basinSites.values()) for (const i of l) if (pset.has(i)) inParties++;
    const T = g.tasks, notices = T && typeof T.siteOpen === 'function' ? past.filter((i) => T.siteOpen(w.campsites[i])).length : -1;
    const Z = window.__edgeZone, wrong = w.campsites.filter((c) => !!c.past !== (Z(c.x, c.z) === 0)).length;
    return { past: past.length, inParties, notices, wrong, sheetCounts: g.hud && g.hud.sheetsOn ? 'ok' : 'none' };
  });
  result('7 the campsites past the band: in no party\'s choices and no notice\'s, marked by the zone exactly', s7.past > 100 && s7.inParties === 0 && s7.notices === 0 && s7.wrong === 0, s7);

  // 8 the map: the Ely side, every sheet shown (as the map table shows them)
  const s8 = await page.evaluate(async () => {
    const H = window.__edge, g = window.__game, hud = g.hud, sh = hud.sheetsOn;
    await H.go('whiteIron'); H.step(150);
    const view = sh ? sh.view : null; if (sh) sh.view = () => 'whole';
    hud.setMode('sheet'); hud.lookAt(H.at.whiteIron.x + 3000, H.at.whiteIron.z, 16000);
    for (let i = 0; i < 40; i++) { H.step(2); await H.wait(60); }
    const state = hud.edgeState ? hud.edgeState() : null;
    // the painters themselves on a sheet of their own, 16 km round White Iron at 16 m a pixel: the paper past the edge
    // (Ely) washed lighter than the paper inside (Farm Lake's doorstep is not washed: the wilderness south of it is), but
    // only a little (the owner: "just slightly faded"), and the roads inked round Ely
    const m = window.__edgeMod, W = 1000, Hh = 1000, cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
    const ctx = cv.getContext('2d'), c = H.at.whiteIron, v = { x0: c.x - 8000, z0: c.z - 8000, mPerPx: 16 };
    const at = (q) => [Math.round((q.x - v.x0) / v.mPerPx), Math.round((q.z - v.z0) / v.mPerPx)];
    ctx.fillStyle = '#c8bfa0'; ctx.fillRect(0, 0, W, Hh); m.paintEdge(ctx, v, 1, { line: false, quetico: false });
    const lum = (q) => { const [a, b] = at(q), d = ctx.getImageData(a, b, 1, 1).data; return d[0] + d[1] + d[2]; };
    const inside = { x: H.at.lakeOne.x, z: H.at.lakeOne.z }, wild = window.__edgeZone(inside.x, inside.z);
    const v2 = { x0: inside.x - 8000, z0: inside.z - 8000, mPerPx: 16 }; // (Lake One, painted alike)
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = Hh; const x2 = c2.getContext('2d'); x2.fillStyle = '#c8bfa0'; x2.fillRect(0, 0, W, Hh); m.paintEdge(x2, v2, 1, { line: false, quetico: false });
    const lumIn = (() => { const d = x2.getImageData(500, 500, 1, 1).data; return d[0] + d[1] + d[2]; })();
    const lumOut = lum(H.at.ely);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, Hh); m.paintRoads(ctx, v, W, Hh, { k: 1, lettered: [] });
    const [ea, eb] = at(H.at.ely), d = ctx.getImageData(ea - 60, eb - 60, 120, 120).data; let ink = 0; for (let k = 0; k < d.length; k += 4) if (d[k] < 200) ink++;
    return { state, wild, lumIn, lumOut, inkNearEly: ink, mode: hud.mode, restore: !!view };
  });
  await page.waitForTimeout(500);
  await shot('8-map-ely-side');
  result('8 the map: past the edge washed lighter but only a little, the roads inked round Ely, the notice on the sheet while out', s8.state === 'out' && s8.wild === 1 && s8.lumOut > s8.lumIn && s8.lumOut - s8.lumIn < 90 && s8.inkNearEly > 200, s8);
  await page.evaluate(() => { const hud = window.__game.hud; try { hud.setMode('glance'); hud.setMode(null); } catch { /* */ } });

  result('9 no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('the run', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
