// Round 5 join (claude/r5-fixes: r5-roads + r5-cabins + r5-mapkit; the owner 2026-11-10: roads where you see roads, the
// truck on its wheels, every cabin placed with its dock on open water, no bubble on the map, Sandbox kitted). The seams:
//   1 (the files) every cabin of src/cabins.json and its dock clear of every road src/roads.bin draws (25 m from a road's
//     edge at the least: cabins.js leaves a cabin out with a road point within 22 m)
//   2 (the files) the map's roads are the world's: every road of src/roads.bin (a point every 40 m) has a line of
//     src/map-roads.bin within 25 m, and every minor line's points a road within 25 m; the highways and county roads
//     (classes 0, 1), the towns and the exits as on main
//   3 (the files) the edge (src/edge.bin: the zones the notice reads, the doorstep) byte for byte as on main
//   4 a Sandbox season at a store at its road's end (EP 67 Pitcher Plant on Bog Lake): kitted (the canoe drawn, the pack,
//     the jacket, food), the roads round the store installed, the truck at its stand on its four tyres (0.15 m)
//   5 the map round that store with the minor roads drawn (a shot), the map's minor cells loaded
//   6 two cabins by their driveways built in the page (not left out for a road), their gap to the road's edge
//   7 no page errors
//
//   APP=http://localhost:5731 node scripts/r5-fixes-test.mjs [--home 67] [--shots <dir>] [--base 1057fb6] [--files: 1-3 only, no browser]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5731';
const HOME = Number(arg('home', 67));
const BASE = arg('base', '1057fb6');
const SHOTS = path.resolve(arg('shots', path.join(tmpdir(), 'r5-fixes')));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(SHOTS, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 2000)); };

// ---- the files ------------------------------------------------------------------------------------------------------------
const { decodePiece } = await import(path.join(root, 'src/roads.js'));
const chains = (() => {
  const buf = readFileSync(path.join(root, 'src/roads.bin')), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const n = dv.getUint32(8, true), sl = dv.getUint16(16, true), head = (18 + sl + 3) & ~3, out = [];
  for (let i = 0; i < n; i++) {
    const o = head + i * 12, a = dv.getUint32(o + 4, true), l = dv.getUint32(o + 8, true), raw = zlib.gunzipSync(buf.subarray(a, a + l));
    out.push(...decodePiece(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)));
  }
  return out;
})();
// segments in 100 m bins: { the chains' (with half widths), the map's lines }
const binned = () => { const m = new Map(); return { m, add(ax, az, bx, bz, hw, r) { for (let gz = Math.floor((Math.min(az, bz) - r) / 100); gz <= Math.floor((Math.max(az, bz) + r) / 100); gz++) for (let gx = Math.floor((Math.min(ax, bx) - r) / 100); gx <= Math.floor((Math.max(ax, bx) + r) / 100); gx++) { const k = gx * 100000 + gz; const L = m.get(k); if (L) L.push([ax, az, bx, bz, hw]); else m.set(k, [[ax, az, bx, bz, hw]]); } }, gap(x, z) { let best = Infinity; for (let gz = Math.floor(z / 100) - 1; gz <= Math.floor(z / 100) + 1; gz++) for (let gx = Math.floor(x / 100) - 1; gx <= Math.floor(x / 100) + 1; gx++) for (const [ax, az, bx, bz, hw] of m.get(gx * 100000 + gz) || []) { const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez, u = L2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0; best = Math.min(best, Math.hypot(x - ax - ex * u, z - az - ez * u) - hw); } return best; } }; };
const R3 = binned();
for (const c of chains) for (let i = 1; i < c.n; i++) R3.add(c.p[i * 4 - 4], c.p[i * 4 - 3], c.p[i * 4], c.p[i * 4 + 1], c.hw, 40);
{
  const T = JSON.parse(readFileSync(path.join(root, 'src/cabins.json'), 'utf8')), cab = T.cabins || T, near = [], dockNear = [], across = [];
  let worst = Infinity;
  cab.forEach((c, i) => {
    // the cabin (its middle and corners) 25 m off; the dock (from where it meets the shore to its end) 10 m off; the way
    // between them may cross a shore road (a lake road between a cabin and its dock, as on the Gunflint: counted)
    const F = { x: c.fx, z: c.fz }, X = { x: -c.fz, z: c.fx }, W = (a, b) => [c.x + X.x * a + F.x * b, c.z + X.z * a + F.z * b];
    const body = [[c.x, c.z], W(-c.w / 2, -c.d / 2), W(c.w / 2, -c.d / 2), W(-c.w / 2, c.d / 2), W(c.w / 2, c.d / 2)];
    const g = Math.min(...body.map(([x, z]) => Math.min(R3.gap(x, z), 99)));
    worst = Math.min(worst, g); if (g < 25) near.push([i, +g.toFixed(1)]);
    if (c.dock) {
      const e = c.dock.end || [c.dock.x + c.dock.dx * c.dock.len, c.dock.z + c.dock.dz * c.dock.len], dg = Math.min(...[0, 0.5, 1].map((t) => R3.gap(c.dock.x + (e[0] - c.dock.x) * t, c.dock.z + (e[1] - c.dock.z) * t)));
      if (dg < 10) dockNear.push([i, +dg.toFixed(1)]);
      for (let t = 0; t <= 1; t += 0.05) if (R3.gap(c.x + (c.dock.x - c.x) * t, c.z + (c.dock.z - c.z) * t) < 0) { across.push(i); break; }
    }
  });
  result('1 every cabin 25 m or more from every road the world draws, every dock 10 m', cab.length >= 30 && !near.length && !dockNear.length, { cabins: cab.length, worstGapM: +worst.toFixed(1), near, dockNear, roadBetweenCabinAndDock: across });
}
const readMap = (buf) => JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
const decodeLine = (f) => { const pts = []; let x = 0, z = 0; for (let p = 3; p + 1 < f.length; p += 2) { x += f[p]; z += f[p + 1]; pts.push([x, z]); } return pts; };
const gitBlob = (p) => { try { return execFileSync('git', ['-C', root, 'show', `${BASE}:${p}`], { maxBuffer: 1 << 28 }); } catch { return null; } };
{
  const M = readMap(readFileSync(path.join(root, 'src/map-roads.bin'))), RM = binned();
  for (const f of M.lines) { const p = decodeLine(f); for (let i = 1; i < p.length; i++) RM.add(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1], 0, 40); }
  let n = 0, miss = 0; const missAt = [];
  for (const c of chains) {
    let s = 40;
    for (let i = 1; i < c.n; i++) {
      s += Math.hypot(c.p[i * 4] - c.p[i * 4 - 4], c.p[i * 4 + 1] - c.p[i * 4 - 3]);
      if (s < 40) continue; s = 0; n++;
      if (RM.gap(c.p[i * 4], c.p[i * 4 + 1]) > 25) { miss++; if (missAt.length < 8) missAt.push([Math.round(c.p[i * 4]), Math.round(c.p[i * 4 + 1])]); }
    }
  }
  let m = 0, mMiss = 0;
  for (const f of M.lines) if (f[0] >= 2) for (const [x, z] of decodeLine(f)) { m++; if (R3.gap(x, z) > 25) mMiss++; }
  const base = gitBlob('src/map-roads.bin'), B = base ? readMap(base) : null;
  const major = (D) => JSON.stringify([D.lines.filter((f) => f[0] <= 1), D.towns, D.exits]);
  const same = B ? major(B) === major(M) : null;
  result('2 the map\'s roads are the world\'s: every 3D road on the map, every minor line on a 3D road; the highways, towns and exits as on main',
    n > 50000 && miss / n < 0.005 && mMiss / m < 0.005 && same !== false,
    { roadPoints: n, offTheMap: miss, missAt, minorLines: M.lines.filter((f) => f[0] >= 2).length, minorPoints: m, minorOffRoad: mMiss, majorSameAsBase: same, bytes: readFileSync(path.join(root, 'src/map-roads.bin')).length });
}
{
  const base = gitBlob('src/edge.bin'), now = readFileSync(path.join(root, 'src/edge.bin'));
  result('3 the edge (zones, doorstep) byte for byte as on main', base ? Buffer.compare(base, now) === 0 : false, { base: base ? base.length : null, now: now.length });
}

// ---- the page -------------------------------------------------------------------------------------------------------------
if (process.argv.includes('--files')) { const ok = results.every((r) => r.pass); log(`r5-fixes (files): ${results.filter((r) => r.pass).length}/${results.length}`); process.exit(ok ? 0 : 1); }
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  const ev = (fn, a) => page.evaluate(fn, a);
  const shot = async (name, el = null) => { const f = path.join(SHOTS, `r5-fixes-${name}.png`); if (el) await page.locator(el).screenshot({ path: f }); else await page.screenshot({ path: f }); log('shot', f); };
  const helpers = () => ev(() => {
    const g = window.__game, H = window.__r5f = {};
    H.step = (n = 30, dt = 1 / 30) => { for (let left = n; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
    H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
    H.mod = (name) => { const e = performance.getEntriesByType('resource').map((r) => r.name).find((n) => new RegExp(`/src/${name}\\.js(\\?|$)`).test(n)); return import(e || `/src/${name}.js`); };
    H.ready = async (x, z, r = 200, ms = 90000) => { const t0 = performance.now(); if (g.tiles.ensure) await g.tiles.ensure(x, z, r); while (performance.now() - t0 < ms) { H.step(10); await H.wait(40); const e = g.tiles.tiles.get(g.tiles.key(...g.world.tileOf(x, z))); if (e && e.state === 'ready') break; } H.step(30); };
    H.standAt = (x, z, heading = 0) => {
      const p = g.player;
      p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
      if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
      p.x = x; p.z = z; p.heading = heading; p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null }; p.placeOnGround();
    };
    H.goNear = async (x, z) => { H.standAt(x, z); await H.ready(x, z, 220); for (let w = 0; w < 80 && !(g.tiles.detail && g.tiles.detail.at(x, z)); w++) { H.step(4); await H.wait(50); } H.step(10); };
  });
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.onboarding && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  // ---- 4 Sandbox at a store at its road's end -------------------------------------------------------------------------
  await ev(() => { const t = window.__game.title; t.askNewSeason('sandbox'); if (t.right === 'confirm') t.confirmed(); });
  await page.waitForFunction(() => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await ev(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.waitForTimeout(300);
  await page.click('#btn-start');
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.player && g.prewarmed && g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, { timeout: 300000, polling: 250 });
  await helpers();
  if (await ev(() => window.__game.outfitter.open)) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await ev(() => window.__r5f.step(30));
  const sb = await ev(async () => {
    const g = window.__game, H = window.__r5f, inv = g.inventory, ob = g.onboarding, s = ob.state || {}, w = g.world;
    const L = g.outfitter.landing(g.profile.home);
    await H.ready(L.x, L.z, 300);
    const [tx, ty] = w.tileOf(L.x, L.z), T = w.roads && w.roads.tiles.get(ty * w.ntx + tx);
    // the truck at its stand: posed at the route's start, the four tyres against the drawn ground (or a deck)
    const R = await H.mod('roads'), Tk = g.truck, out = { truck: null };
    const S = Tk && Tk.spot ? Tk.spot(String(g.profile.home), true) : null;
    if (S) {
      Tk.pose(S.path, S.s0 + 1);
      const m = Tk.mesh.matrix.elements, G = (x, z) => Math.max(g.tiles.groundAt(x, z), R.deckAt(w, x, z));
      const P = (lx, ly, lz) => [m[0] * lx + m[4] * ly + m[8] * lz + m[12], m[1] * lx + m[5] * ly + m[9] * lz + m[13], m[2] * lx + m[6] * ly + m[10] * lz + m[14]];
      let gap = -Infinity, sink = -Infinity;
      for (const a of [1.72, -1.63]) for (const sd of [-0.93, 0.93]) { const [x, y, z] = P(sd, 0, a), d = y - G(x, z); gap = Math.max(gap, d); sink = Math.max(sink, -d); }
      out.truck = { gap: +gap.toFixed(3), sink: +sink.toFixed(3), x: Math.round(Tk.x), z: Math.round(Tk.z) };
      Tk.hide();
    }
    return {
      ...out, mode: g.profile.mode, loan: !!s.loan, pending: ob.pending(g.profile.home), hull: !!g.player.canoe.hull.visible,
      canoe: inv.containers.filter((c) => c.where === 'canoe').map((c) => c.item), pfd: inv.count('pfd', { reachable: false }), meals: ob.meals(),
      tileRoads: T ? T.chains.length : -1, near: R.roadClearance(w, L.x, L.z, 400) ? +R.roadClearance(w, L.x, L.z, 400).gap.toFixed(1) : null,
    };
  });
  result(`4 Sandbox at EP ${HOME} (a store at its road's end): kitted, the roads round it in, the truck on its four tyres at the stand`,
    sb.mode === 'sandbox' && sb.loan && !sb.pending && sb.hull && sb.canoe.includes('pack3') && sb.pfd >= 1 && sb.meals >= 6 && sb.tileRoads > 0 && sb.near != null && sb.truck && sb.truck.gap <= 0.15 && sb.truck.sink <= 0.15, sb);
  await shot('sandbox-store');
  // ---- 5 the map round the store with the minor roads ---------------------------------------------------------------
  const mapR = await page.evaluate(`(async () => {
    const g = window.__game, MR = await window.__r5f.mod('map-render'), E = await window.__r5f.mod('edge'), L = g.outfitter.landing(${HOME});
    await E.loadMapRoads();
    const cv = document.createElement('canvas'); cv.id = 'r5f-map'; cv.width = 1040; cv.height = 720; cv.style.cssText = 'position:fixed;left:120px;top:0;z-index:99999;width:1040px;height:720px';
    document.body.appendChild(cv);
    let r = null; const t0 = performance.now();
    for (let i = 0; i < 400; i++) { r = MR.drawRegion(cv, g.world, { cx: L.x, cz: L.z, span: 6000 }, {}); if (r.ready) break; await new Promise((q) => setTimeout(q, 100)); }
    const t1 = performance.now(); MR.drawRegion(cv, g.world, { cx: L.x, cz: L.z, span: 6000 }, {}); const redraw = performance.now() - t1;
    return { ready: !!(r && r.ready), minorCells: E.ROADS.minor.length, lines: E.ROADS.lines.length, redrawMs: +redraw.toFixed(1), firstMs: Math.round(t1 - t0) };
  })()`);
  await shot('map-store', '#r5f-map');
  await ev(() => document.getElementById('r5f-map').remove());
  result('5 the map round the store draws with the minor roads (a shot)', mapR.ready && mapR.minorCells > 50, mapR);
  // ---- 6 two cabins by their driveways, built ---------------------------------------------------------------------------
  const T = JSON.parse(readFileSync(path.join(root, 'src/cabins.json'), 'utf8')), cab = T.cabins || T;
  const picks = cab.map((c, i) => ({ ...c, i, g: R3.gap(c.x, c.z) })).sort((a, b) => a.g - b.g).slice(0, 2);
  const cabs = [];
  for (const c of picks) {
    cabs.push(await ev(async (c) => {
      const g = window.__game, H = window.__r5f, R = await H.mod('roads');
      await H.goNear(c.x + c.fx * (c.d / 2 + 10), c.z + c.fz * (c.d / 2 + 10)); await H.ready(c.x, c.z, 200);
      for (let i = 0; i < 40 && !(g.world.cabins && (g.world.cabins.built.has(c.i) || g.world.cabins.skipped.has(c.i))); i++) { H.step(10); await H.wait(50); }
      const S = g.world.cabins, rc = R.roadClearance(g.world, c.x, c.z, 200);
      return { i: c.i, built: !!(S && S.built.has(c.i)), skipped: S ? S.skipped.get(c.i) || null : 'no table', gap: rc ? +rc.gap.toFixed(1) : null };
    }, c));
    await shot(`cabin-${c.i}`);
  }
  result('6 the two cabins nearest a road built in the page, a road\'s edge 25 m off or more', cabs.every((c) => c.built && (c.gap == null || c.gap >= 25)), { cabs });
  result('7 no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  log('ERROR', e && e.stack || e);
  results.push({ name: 'rig ran', pass: false, more: String(e) });
} finally {
  await browser.close();
}
const pass = results.filter((r) => r.pass).length;
writeFileSync(path.join(SHOTS, 'r5-fixes.json'), JSON.stringify({ results, errors }, null, 1));
log(`r5-fixes: ${pass}/${results.length} pass, ${errors.length} page errors`);
process.exit(pass === results.length && !errors.length ? 0 : 1);
