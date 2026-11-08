// r2: the primitive areas on the maps, and the old saves' primitive areas carried to the real twelve (src/migrate-pma.js,
// map-render.js paintPmas / paintPmaNames / sketchPmas), in one headless Chromium against a running Vite.
//   1. the table: each old id to the real area its centre lies in, else the nearest within 8 km, else none
//   2. a new season's permits are born stamped (pmaSet 2)
//   3. an old-shaped save (no stamp; old ids in held and used permits and in three trail-survey notices), the page
//      reloaded: a held permit points to its real area and is still good for a push-off that camps off-site in it; one
//      whose area has none is an overnight permit, the desk says so once; the notices carried or dropped; stamped
//   4. a stamped season reloaded is left as it is (the same bytes); the store-level cases (a dev host's tie is old,
//      any other host's is new; the trip under way's permit; a done notice kept)
//   5. the maps: the HUD's sheet and corner, the book's map, the lake page, the counter's side map (the desk's PMA picked
//      out), the start map: the outlines drawn and the names lettered; shots with --shots
//      (r4: the HUD's sheet, its corner and the book's chart are checked along the outline's own length: the same view
//      painted with the layer on and off, and the share of points walked along each area's edge where the paint
//      differs within 2-3 px. A raw count of slate-coloured pixels was set on the Mac and failed on Linux's anti-aliasing.)
//
//   APP=http://localhost:5202 node scripts/r2-pma-test.mjs [--shots docs/build/shots] [--out dir] [--break outline]
//   --break outline: the outline's ink made clear (the proof that 5a/5b/5c catch a missing outline: they must fail)
// Exit code 0 when every check passes. Writes <out>/r2-pma-results.json.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5202';
const OUT = path.resolve(arg('out', 'r2-pma-out'));
const SHOTS = arg('shots', null);
mkdirSync(OUT, { recursive: true });
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse() : []; for (const s of shells) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1500)); };
const shot = async (page, name, clip = null) => { if (!SHOTS) return; try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`), ...(clip ? { clip } : {}) }); log('shot', name); } catch (e) { log('shot', name, e.message); } };
const until = (page, fn, a, timeout = 90000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
const HOME = 25, START_DOY = 200; // Moose Lake, July 19 (the trail surveys run June to October)
const BREAK = arg('break', null);
const COVER = 0.6; // the share of the edge that must show (overlays, names and the portages' dashes hide some)
const WANT = { 'pma-1': null, 'pma-2': 'pma-1', 'pma-3': 'pma-3', 'pma-4': 'pma-4', 'pma-5': 'pma-11', 'pma-6': 'pma-6', 'pma-7': 'pma-12', 'pma-8': 'pma-7', 'pma-9': 'pma-8', 'pma-10': null, 'pma-11': 'pma-10', 'pma-12': null };

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => log('pageerror', e.message));
// r4: how much of the primitive areas' edges shows on a canvas: dOn / dOff the same view's pixels with the layer on and
// off (W x H, the view v { x0, z0, mPerPx }); a point walked every 3 px along each edge counts when some pixel within
// r px of it differs (|Δr|+|Δg|+|Δb| > 20). keep(x, z) → bool: where the paint may show (the sheets you own, the country).
await ctx.addInitScript(() => {
  window.__pmaEdge = (dOn, dOff, W, H, v, polys, { r = 2, keep = null, step = 3 } = {}) => {
    let n = 0, hit = 0;
    const diff = (i) => Math.abs(dOn[i] - dOff[i]) + Math.abs(dOn[i + 1] - dOff[i + 1]) + Math.abs(dOn[i + 2] - dOff[i + 2]) > 20;
    const near = (a, b) => { for (let y = Math.max(0, b - r); y <= Math.min(H - 1, b + r); y++) for (let x = Math.max(0, a - r); x <= Math.min(W - 1, a + r); x++) if (diff((y * W + x) * 4)) return true; return false; };
    for (const poly of polys) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, az] = poly[j], [bx, bz] = poly[i], L = Math.hypot(bx - ax, bz - az) / v.mPerPx, m = Math.max(1, Math.round(L / step));
      for (let t = 0; t < m; t++) {
        const x = ax + ((bx - ax) * t) / m, z = az + ((bz - az) * t) / m, a = Math.round((x - v.x0) / v.mPerPx), b = Math.round((z - v.z0) / v.mPerPx);
        if (a < 6 || b < 6 || a > W - 7 || b > H - 7) continue;
        if (keep && !keep(x, z)) continue;
        n++; if (near(a, b)) hit++;
      }
    }
    return { n, hit, cover: n ? +(hit / n).toFixed(3) : 0 };
  };
});
page.on('console', (m) => { if (m.type() === 'error' || /migrate: the primitive|primitive areas could not/.test(m.text())) log(m.type(), m.text().slice(0, 300)); });
const load = async () => {
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.permits && typeof window.__game.step === 'function', null, { timeout: 240000, polling: 500 });
};
const frames = (n = 30, dt = 1 / 30) => page.evaluate(([n, dt]) => { for (let k = 0; k < n; k += 300) window.__game.step(dt, Math.min(300, n - k)); }, [n, dt]);
const intoGame = async () => {
  await page.evaluate(() => window.__game.title.close());
  await until(page, () => { const g = window.__game; g.step(1 / 30, 5); return g.title.state === 'game' && !g.player.teleporting; }, null, 120000);
  await frames(20);
};
// pixels near the PMA outline's slate (82, 76, 98) in a canvas, in a box (css px of the canvas) or all of it
const slateIn = (sel) => page.evaluate((sel) => {
  const c = typeof sel === 'string' ? document.querySelector(sel) : null; if (!c || !c.width) return -1;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (b > r + 6 && b > g + 10 && r < 150 && g < 140 && b < 170 && Math.abs(r - g) < 22) n++; }
  return n;
}, sel);

// r4: the HUD's sheet as it paints it (hud.js drawLayers, the base drawMap lays down: the paper and all printed on it),
// at the base's own view, once with the primitive areas and once without, into canvases of our own (the corner's view
// follows the canoe, so two live bases are never quite the same view); the edge's cover between the two (__pmaEdge)
const settleBase = async () => { for (let i = 0; i < 60; i++) { await frames(3); await page.waitForTimeout(120); const ok = await page.evaluate(() => { const h = window.__game.hud, b = h.base; return !!b && !b.pending && !!b.key; }); if (ok && i > 4) return true; } return false; };
const hudEdge = async () => {
  await settleBase();
  return page.evaluate(async () => {
    const g = window.__game, h = g.hud, b = h.base, P = await import('/src/pma.js'), w = g.world;
    const v = { x0: b.x0, z0: b.z0, mPerPx: b.mPerPx }, W = b.W, H = b.H, k = h.canvas.width / 1040;
    const paint = (pmas) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const was = h.layers.pmas; h.layers.pmas = pmas; let ready = false; try { ready = h.drawLayers(c.getContext('2d'), W, H, v, k, g.player); } finally { h.layers.pmas = was; } return { ready, d: c.getContext('2d').getImageData(0, 0, W, H).data }; };
    let on = paint(true), tries = 0;
    while (!on.ready && tries++ < 60) { await new Promise((r) => setTimeout(r, 150)); on = paint(true); }
    const off = paint(false);
    const sh = h.sheetsOn, owned = sh && sh.view() === 'owned' ? sh.ownedSheets() : null, pad = 4 * v.mPerPx;
    const keep = (x, z) => x > w.minX + pad && x < w.maxX - pad && z > w.minZ + pad && z < w.maxZ - pad && (!owned || owned.some((q) => x > q.x0 + pad && x < q.x1 - pad && z > q.z0 + pad && z < q.z1 - pad));
    const e = window.__pmaEdge(on.d, off.d, W, H, v, P.PMAS.map((p) => p.poly), { r: v.mPerPx > 60 ? 3 : 2, keep });
    return { ...e, ready: on.ready && off.ready, mPerPx: +v.mPerPx.toFixed(2) };
  });
};
const edgeOk = (e, min = 30) => e && e.ready !== false && e.n >= min && e.cover >= COVER;

try {
  await load();
  if (BREAK === 'outline') { await page.evaluate(async () => { const R = await import('/src/map-render.js'); R.INK.pma = 'rgba(0, 0, 0, 0)'; }); log('BROKEN on purpose: the outline\'s ink clear'); }
  log('game loaded');
  // --- 1: the table -----------------------------------------------------------------------------------------------------
  const tab = await page.evaluate(async () => { const M = await import('/src/migrate-pma.js'); return { map: M.PMA_MAP, set: M.PMA_SET, n: M.OLD_PMAS.length }; });
  result('1 the old twelve to the real: in, else the nearest within 8 km, else none', tab.n === 12 && tab.set === 2 && Object.entries(WANT).every(([k, v]) => tab.map[k] === v), tab.map);

  // --- 5e: the start map (before any season) ------------------------------------------------------------------------------
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(1200);
  const sm = await slateIn('.startmap canvas'), smPale = await page.evaluate(() => {
    const c = document.querySelector('.startmap canvas'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 20 && d[i] > 200 && d[i + 1] > 195 && d[i + 2] > 180 && d[i] >= d[i + 2]) n++; return n;
  });
  await shot(page, 'r2-startmap');
  result('5e the start map: the outlines, a pale dash', smPale > 150, { pale: smPale, slate: sm });

  // --- 2: a new season ---------------------------------------------------------------------------------------------------
  await page.evaluate(async ([home, doy]) => {
    const g = window.__game, t = g.title, ep = g.world.entryPoints.find((e) => e.ep === home);
    t.setPick('adventure');
    await t.newSeason(ep, { confirm: false, start: { year: 2026, doy } });
    if (g.onboarding && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(g.onboarding.home, false); } // (r3: the talk's gear and the loaned canoe first)
  }, [HOME, START_DOY]);
  await until(page, () => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 180000);
  await page.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
  const fresh = await page.evaluate(() => { const g = window.__game, P = g.permits; P.write(); const d = JSON.parse(g.store.getItem('bwca-canoe:permits')); return { pmaSet: d.pmaSet, mig: g.pmaMigrated }; });
  result('2 a new season is born stamped (pmaSet 2); a fresh browser has nothing to carry', fresh.pmaSet === 2 && (!fresh.mig || !fresh.mig.did), fresh);

  // --- 5a–d: the maps --------------------------------------------------------------------------------------------------
  // (the whole wilderness, as the map table holds it at a counter: the sheets you own cut the rest away in the wild)
  await page.evaluate(async () => { const S = await import('/src/sheets.js'); S.sheets.forced = 'whole'; });
  // the HUD's sheet over the Fungus Lake and Humpback areas (east of Moose Lake), close enough for the names
  const sheetAt = async (span, name, x = 4000, z = 18000) => {
    await page.evaluate(([span, x, z]) => { const h = window.__game.hud; h.setMode('sheet'); h.lookAt(x, z, span); }, [span, x, z]);
    for (let i = 0; i < 40; i++) { await frames(3); await page.waitForTimeout(120); const ok = await page.evaluate(() => { const b = window.__game.hud.base; return b && !b.pending; }); if (ok && i > 6) break; }
    await page.waitForTimeout(300); await frames(2);
    await shot(page, name);
    return hudEdge();
  };
  const sheetMid = await sheetAt(36000, 'r2-sheet-36km');
  const sheetClose = await sheetAt(12000, 'r2-sheet-12km', 1000, 24000);
  const sheetFar = await sheetAt(140000, 'r2-sheet-overview', -15000, 5000);
  // the names lettered: the canvas's text calls, counted through the sheet's own paint (paintPmaNames)
  const named = await page.evaluate(async () => {
    const h = window.__game.hud, R = await import('/src/map-render.js'), cv = document.createElement('canvas'); cv.width = 1040; cv.height = 700;
    const g = cv.getContext('2d'), said = []; const ft = g.fillText.bind(g); g.fillText = (t, ...a) => { said.push(String(t)); return ft(t, ...a); };
    R.paintPmaNames(g, window.__game.world, { x0: 4000 - 18000, z0: 18000 - 12000, mPerPx: 36000 / 1040 }, 1040, 700, { k: 1 });
    return { said, hudPmas: h.layers.pmas };
  });
  result('5a the HUD sheet: the outlines along their length at 36 km, 12 km and the overview, the names in italics', edgeOk(sheetMid) && edgeOk(sheetClose) && edgeOk(sheetFar) && named.said.some((t) => /Fungus Lake primitive area/.test(t)) && named.hudPmas === true, { sheetMid, sheetClose, sheetFar, named: named.said });
  // the book's map side (the HUD's sheet mounted in the book: the sheet above) and its key's new row
  await page.evaluate(() => { const g = window.__game, mb = g.journal.map; mb.tab = 'key'; mb.render(true); });
  await frames(3); await page.waitForTimeout(300);
  const book = await page.evaluate(() => { const k = document.querySelector('.mb-key[data-layer="pmas"]'); return { key: k ? k.innerText.replace(/\s+/g, ' ') : null, on: k ? k.getAttribute('aria-pressed') : null }; });
  await shot(page, 'r2-book-key');
  // the lake page: a lake inside one says so (Ferne Lake, in the Fungus Lake area); its chart is map-render.js drawRegion
  const lakePage = await page.evaluate(async () => {
    const g = window.__game, P = g.permits, a = P.pmas().find((q) => q.id === 'pma-12'), mb = g.journal.map;
    mb.tab = 'marked'; mb.showLake(a.lake);
    return { lake: a.lake, sub: document.querySelector('.mb-portrait .sub')?.textContent || '' };
  });
  for (let i = 0; i < 25; i++) { await frames(2); await page.waitForTimeout(160); }
  await shot(page, 'r2-lake-page');
  // the chart's own painter on a region across an edge (drawRegion with pmas on and off: the slate only with them)
  const region = await page.evaluate(async () => {
    const R = await import('/src/map-render.js'), P = await import('/src/pma.js'), w = window.__game.world, a = window.__game.permits.pmas().find((q) => q.id === 'pma-12');
    const paint = (pmas) => { const c = document.createElement('canvas'); c.width = 620; c.height = 620; const r = R.drawRegion(c, w, { cx: a.box[0], cz: a.centre[1], span: 9000 }, { names: true, build: 3, pmas }); return { r, d: c.getContext('2d').getImageData(0, 0, 620, 620).data }; };
    let tries = 0; while (!paint(false).r.ready && tries++ < 80) await new Promise((res) => setTimeout(res, 150)); // (the tiles in first, so both paint the same ground)
    const on = paint(true), off = paint(false);
    const e = window.__pmaEdge(on.d, off.d, 620, 620, on.r.view, P.PMAS.map((p) => p.poly), { r: 2 });
    let elsewhere = 0; for (let i = 0; i < on.d.length; i += 4) if (Math.abs(on.d[i] - off.d[i]) + Math.abs(on.d[i + 1] - off.d[i + 1]) + Math.abs(on.d[i + 2] - off.d[i + 2]) > 20) elsewhere++;
    return { ...e, ready: on.r.ready && off.r.ready, changed: elsewhere };
  });
  await page.evaluate(() => { const g = window.__game; g.journal.close(); });
  await frames(5);
  result('5c the book: its key has the row, on; a lake page in an area names it; the chart draws the outline', /Primitive areas/.test(book.key || '') && book.on === 'true' && /in the Fungus Lake primitive area/.test(lakePage.sub) && edgeOk(region, 40), { book, lakePage, region });
  // the counter's side map, with a primitive area picked at the desk
  await page.evaluate(() => { const o = window.__game.outfitter; o.show(o.visit.landing, 'counter'); });
  await frames(5); await page.waitForTimeout(500);
  const sidePlain = await slateIn('#outfitter .sidemap canvas');
  await page.evaluate(() => { window.__game.outfitter.act('permit-kind', 'pma'); });
  await frames(5); await page.waitForTimeout(600);
  const side = await page.evaluate(() => { const g = window.__game, f = g.permitDesk.focusPma(); const c = document.querySelector('#outfitter .sidemap canvas'); if (c) c.scrollIntoView({ block: 'center' }); return { focus: f, name: f ? g.permits.pmas().find((q) => q.id === f).name : null }; });
  await page.waitForTimeout(400);
  const sideFocus = await slateIn('#outfitter .sidemap canvas');
  const box = await page.evaluate(() => { const c = document.querySelector('#outfitter .sidemap'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: r.width + 20, height: r.height + 20 }; });
  await shot(page, 'r2-counter-map', box && box.width > 40 ? box : null);
  await page.evaluate(() => { const d = document.querySelector('#outfitter .permitdesk'); if (d) d.scrollIntoView({ block: 'start' }); });
  await page.waitForTimeout(300);
  await shot(page, 'r2-desk-pma');
  // the map table at the counter: the HUD's sheet picks the desk's area out
  const tableFocus = await page.evaluate(() => window.__game.hud.pmaFocus);
  result('5d the counter: the side map draws them, the desk\'s area picked out (washed, firmer) there and on the HUD', sidePlain > 20 && sideFocus > sidePlain && !!side.focus && tableFocus === side.focus, { sidePlain, sideFocus, ...side, tableFocus });
  await page.evaluate(() => { const o = window.__game.outfitter; o.act('permit-kind', 'overnight'); o.hide(); });
  await frames(5);

  await page.evaluate(async () => { const S = await import('/src/sheets.js'); S.sheets.forced = null; });
  // --- 3: an old-shaped save ---------------------------------------------------------------------------------------------
  const plan = await page.evaluate(async () => {
    const g = window.__game, P = g.permits, kv = g.store, today = P.today, T = g.tasks, pma = await import('/src/pma.js');
    g.outfitter.save();
    const pd = JSON.parse(kv.getItem('bwca-canoe:permits'));
    delete pd.pmaSet;
    const n0 = pd.nextId || 1;
    pd.held = [
      { id: `P${n0}`, kind: 'pma', ep: 25, abs: today, pma: 'pma-5', from: 25, price: 6, bought: today },        // Diana → Weasel (pma-11)
      { id: `P${n0 + 1}`, kind: 'pma', ep: 25, abs: today + 2, pma: 'pma-12', from: 25, price: 6, bought: today }, // State → none: overnight
    ];
    pd.used = [{ id: 'P0', kind: 'pma', ep: 51, abs: today - 3, pma: 'pma-8', from: 51, price: 6, bought: today - 4, usedOn: today - 3 }]; // Holt → Pitfall (pma-7)
    pd.nextId = n0 + 2;
    kv.setItem('bwca-canoe:permits', JSON.stringify(pd));
    // three trail surveys, written as the old code wrote them
    const doc = JSON.parse(kv.getItem('bwca-canoe-trip'));
    const ads = ((doc.tasks && doc.tasks.ads) || []).filter((a) => a.kind !== 'pma'); // (an old season's boards had only the old table's surveys)
    let id = Math.max(1000, ...ads.map((a) => a.id || 0)) + 1;
    const fungus = pma.pmaById('pma-12'), inF = []; // three marks inside the real Fungus Lake area (where Hope Lake's was)
    for (let k = 0; k < 400 && inF.length < 3; k++) {
      const x = fungus.centre[0] + (k % 20 - 10) * 250, z = fungus.centre[1] + (Math.floor(k / 20) - 10) * 250;
      if (pma.inPoly(fungus.poly, x, z) && inF.every((q) => Math.hypot(q.x - x, q.z - z) > 600)) inF.push({ x, z, seen: false });
    }
    const ad = (pmaId, name, pts, status = 'open') => ({ id: id++, kind: 'pma', from: 25, fromName: 'Moose Lake', band: 'far', status, posted: today, taken: today, due: today + 14,
      key: `pma:${pmaId}`, pma: pmaId, pmaName: name, pts, km: 9, title: `Trail survey: ${name}`,
      text: `The old trail into the ${name} primitive area: walk it and mark where it really goes. Three marks. The primitive-area permit for this one; it isn’t kept up.`,
      sign: 'the wilderness ranger', hint: { x: pts[0].x, z: pts[0].z, r: 1500, label: name } });
    const A = ad('pma-7', 'Hope Lake primitive area', inF);                                                                // carried to Fungus Lake
    const B = ad('pma-1', 'Wolfpack Lake primitive area', [{ x: -81564, z: -12047, seen: false }, { x: -81000, z: -12500, seen: false }, { x: -82000, z: -11500, seen: false }]); // no real area: dropped
    const C = ad('pma-9', 'Twinkle Lake primitive area', [{ x: 15894, z: 10750, seen: false }, { x: 16500, z: 11300, seen: false }, { x: 15300, z: 10200, seen: false }]);  // Mugwump, marks outside it: dropped
    doc.tasks.ads = [...ads, A, B, C];
    kv.setItem('bwca-canoe-trip', JSON.stringify(doc));
    await kv.flush();
    kv.freeze((k) => k === 'bwca-canoe-trip' || k === 'bwca-canoe:permits');
    return { held: pd.held.map((p) => p.id), ids: [A.id, B.id, C.id], inF: inF.length, cIn: [15894, 10750].length && pma.inPoly(pma.pmaById('pma-8').poly, 15894, 10750) };
  });
  log('old save written', JSON.stringify(plan));
  await load();
  const mig = await page.evaluate(() => window.__game.pmaMigrated);
  await intoGame();
  const after = await page.evaluate((plan) => {
    const g = window.__game, P = g.permits, kv = g.store, raw = JSON.parse(kv.getItem('bwca-canoe:permits'));
    const ads = [...g.tasks.ads.values()].filter((t) => plan.ids.includes(t.id));
    return { held: P.held().map((p) => ({ id: p.id, kind: p.kind, pma: p.pma, ep: p.ep, abs: p.abs })), used: P.s.used.map((p) => ({ id: p.id, kind: p.kind, pma: p.pma })), pmaSet: raw.pmaSet, redrawn: raw.redrawn,
      ads: ads.map((t) => ({ id: t.id, pma: t.pma, name: t.pmaName, key: t.key, title: t.title, text: t.text, hint: t.hint && t.hint.label })), today: P.today };
  }, plan);
  const h1 = after.held.find((p) => p.id === plan.held[0]), h2 = after.held.find((p) => p.id === plan.held[1]), A = after.ads.find((t) => t.id === plan.ids[0]);
  result('3a the old save carried at boot: by its own words, permits and notices counted', mig && mig.did && mig.as === 'old' && mig.permits === 3 && mig.notices === 1 && mig.dropped === 2, mig);
  result('3b a held permit to its real area (Diana → Weasel Lake); one with none an overnight permit; a used one mapped; stamped', h1 && h1.kind === 'pma' && h1.pma === 'pma-11' && h2 && h2.kind === 'overnight' && h2.pma === null && after.used[0].pma === 'pma-7' && after.pmaSet === 2, after);
  result('3c the notices: Hope Lake\'s survey is Fungus Lake\'s now (name, key, words, hint), the other two dropped', after.ads.length === 1 && A && A.pma === 'pma-12' && A.name === 'Fungus Lake primitive area' && A.key === 'pma:pma-12' && /^The old trail into the Fungus Lake primitive area: walk/.test(A.text) && !/Hope|area primitive/.test(A.text + A.title) && A.hint === 'Fungus Lake primitive area', after.ads);
  // the desk says so, once
  const told = await page.evaluate(() => {
    const g = window.__game, o = g.outfitter, l = o.landing(25);
    o.show(l, 'counter');
    const t1 = document.querySelector('#outfitter .permitdesk')?.innerText || '';
    o.render();
    const t2 = document.querySelector('#outfitter .permitdesk')?.innerText || '';
    o.hide();
    return { first: t1.split('\n').filter((s) => /redrew/.test(s)), again: t2.split('\n').filter((s) => /redrew/.test(s)).length };
  });
  result('3d the desk says it once: "The Forest Service redrew the primitive areas …"', told.first.length === 2 && told.first.some((s) => /Weasel Lake primitive area now/.test(s)) && told.first.some((s) => /overnight one now/.test(s)) && told.again === 0, told);
  // still good: a push-off today takes it, and the tent pitches off the sites inside Weasel Lake's area only
  const use = await page.evaluate(async () => {
    const g = window.__game, o = g.outfitter, l = o.landing(25), w = g.world, lake = w.lakes[l.lake - 1];
    if (o.open) o.hide();
    o.port = l;
    const dx = lake.cx - l.x, dz = lake.cz - l.z, d = Math.hypot(dx, dz) || 1, r = Math.min(400, d);
    await g.player.teleport(l.x + (dx / d) * r, l.z + (dz / d) * r);
    return true;
  });
  await until(page, () => !window.__game.player.teleporting);
  await frames(20);
  const trip = await page.evaluate(() => {
    const g = window.__game, P = g.permits, s = g.trip.state, a = P.pmas().find((q) => q.id === 'pma-11'), b = P.pmas().find((q) => q.id === 'pma-12');
    return { active: g.trip.active, permit: s.permit, dayUse: s.dayUse, inside: P.allowsOffsite(a.centre[0], a.centre[1]), other: P.allowsOffsite(b.centre[0], b.centre[1]), camp: g.camp.offsiteOk(a.centre[0], a.centre[1]), focus: g.hud.pmaFocus };
  });
  result('3e still usable: the push-off takes it (Weasel Lake), off-site camping inside it alone; the maps pick it out', trip.active && trip.permit && trip.permit.kind === 'pma' && trip.permit.pma === 'pma-11' && !trip.dayUse && trip.inside && !trip.other && trip.camp && trip.focus === 'pma-11', { ...trip, use });

  // the corner sheet on the water (the HUD's corner, round you: the sheets you own only), on Starlight Lake in the Drag
  // Lake area (sheet F-24, the home sheet), its edge 1.7 km off
  await page.evaluate(async () => { const g = window.__game, l = g.world.lakes.find((q) => q && q.name === 'Starlight Lake' && Math.abs(q.cx + 9328) < 300); await g.player.teleport(l.cx, l.cz); });
  await until(page, () => !window.__game.player.teleporting);
  await page.evaluate(() => { const g = window.__game; g.settings.values.cornerMap = true; g.hud.setMode('corner'); });
  for (let i = 0; i < 20; i++) { await frames(3); await page.waitForTimeout(150); }
  await shot(page, 'r2-corner');
  const corner = await hudEdge();
  result('5b the corner sheet on the water draws them too (along their length, on the sheets you own)', edgeOk(corner, 15), { corner });
  await page.evaluate(() => { const g = window.__game; g.settings.values.cornerMap = false; g.hud.setMode('hidden'); });

  // --- 4: a stamped season is left alone ------------------------------------------------------------------------------
  const before = await page.evaluate(async () => { const g = window.__game; g.outfitter.save(); g.permits.write(); await g.store.flush(); return { p: g.store.getItem('bwca-canoe:permits'), t: JSON.stringify(JSON.parse(g.store.getItem('bwca-canoe-trip')).tasks.ads.filter((a) => a.kind === 'pma')) }; });
  await page.evaluate(() => { window.__game.store.freeze((k) => k === 'bwca-canoe:permits' || k === 'bwca-canoe-trip'); });
  await load();
  const again = await page.evaluate(() => { const g = window.__game; return { mig: g.pmaMigrated, p: g.store.getItem('bwca-canoe:permits'), t: JSON.stringify(JSON.parse(g.store.getItem('bwca-canoe-trip')).tasks.ads.filter((a) => a.kind === 'pma')) }; });
  result('4a a stamped season reloaded: untouched (the same bytes)', again.mig && again.mig.did === false && again.mig.why === 'stamped' && again.p === before.p && again.t === before.t, { mig: again.mig, same: again.p === before.p, sameAds: again.t === before.t });
  // the store-level cases on a stand-in store
  const unit = await page.evaluate(async () => {
    const M = await import('/src/migrate-pma.js'), meta = window.__game.world.meta;
    const mk = (o) => { const m = new Map(Object.entries(o).map(([k, v]) => [k, JSON.stringify(v)])); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; };
    const permit = (pma, from = 25) => ({ id: 'P1', kind: 'pma', ep: 25, abs: 100, pma, from, price: 6 });
    // a tie (no names, the desk's first area the same in both tables): a dev host takes it as old, any other as new
    const s1 = mk({ 'bwca-canoe:permits': { v: 1, held: [permit('pma-7')], used: [], lapsed: [] } }), r1 = M.migratePmas(s1, { meta, dev: true });
    const s2 = mk({ 'bwca-canoe:permits': { v: 1, held: [permit('pma-7')], used: [], lapsed: [] } }), r2 = M.migratePmas(s2, { meta, dev: false });
    const p1 = JSON.parse(s1.m.get('bwca-canoe:permits')), p2 = JSON.parse(s2.m.get('bwca-canoe:permits'));
    // the desk's first area tells: from ep 36 the old table offered pma-7 (Hope) first, the real one pma-12 (Fungus)
    const s3 = mk({ 'bwca-canoe:permits': { v: 1, held: [permit('pma-12', 36)], used: [], lapsed: [] } }), r3 = M.migratePmas(s3, { meta, dev: true });
    const s4 = mk({ 'bwca-canoe:permits': { v: 1, held: [permit('pma-7', 36)], used: [], lapsed: [] } }), r4 = M.migratePmas(s4, { meta, dev: false });
    // the trip under way's permit, and a done notice whose area is gone (kept, to be paid)
    const s5 = mk({ 'bwca-canoe:permits': { v: 1, held: [], used: [permit('pma-10')], lapsed: [] }, 'bwca-canoe-trip': { v: 3, core: { v: 4, active: true, permit: permit('pma-10') }, tasks: { v: 4, ads: [{ id: 9, kind: 'pma', pma: 'pma-10', pmaName: 'Romp Lake primitive area', status: 'done', pts: [] }] } } });
    const r5 = M.migratePmas(s5, { meta, dev: false }), t5 = JSON.parse(s5.m.get('bwca-canoe-trip'));
    // stamped: never touched
    const s6 = mk({ 'bwca-canoe:permits': { v: 1, pmaSet: 2, held: [permit('pma-7')], used: [], lapsed: [] } }), raw6 = s6.m.get('bwca-canoe:permits'), r6 = M.migratePmas(s6, { meta, dev: true });
    return {
      tieDev: { r: r1, pma: p1.held[0].pma, set: p1.pmaSet }, tieOther: { r: r2, pma: p2.held[0].pma, set: p2.pmaSet },
      deskNew: { r: r3, pma: JSON.parse(s3.m.get('bwca-canoe:permits')).held[0].pma }, deskOld: { r: r4, pma: JSON.parse(s4.m.get('bwca-canoe:permits')).held[0].pma },
      trip: { r: r5, core: t5.core.permit, ads: t5.tasks.ads }, stamped: { r: r6, same: s6.m.get('bwca-canoe:permits') === raw6 },
    };
  });
  result('4b a tie: a dev host carries it (Hope → Fungus), another host only stamps it', unit.tieDev.r.as === 'old' && unit.tieDev.pma === 'pma-12' && unit.tieDev.set === 2 && unit.tieOther.r.as === 'new' && unit.tieOther.pma === 'pma-7' && unit.tieOther.set === 2, { tieDev: unit.tieDev, tieOther: unit.tieOther });
  result('4c the desk\'s first area tells the tables apart, whatever the host', unit.deskNew.r.as === 'new' && unit.deskNew.pma === 'pma-12' && unit.deskOld.r.as === 'old' && unit.deskOld.pma === 'pma-12', { deskNew: unit.deskNew, deskOld: unit.deskOld });
  result('4d the trip under way\'s permit (Romp: none) an overnight one; a done notice kept; a stamped season untouched', unit.trip.r && unit.trip.r.did && unit.trip.core.kind === 'overnight' && unit.trip.core.pma === null && unit.trip.ads.length === 1 && unit.stamped.r.why === 'stamped' && unit.stamped.same, { trip: unit.trip, stamped: unit.stamped });
} catch (e) {
  log('ERROR', e.stack || e.message);
  result('the run finished', false, { error: e.message });
} finally {
  writeFileSync(path.join(OUT, 'r2-pma-results.json'), JSON.stringify(results, null, 1));
  const failed = results.filter((r) => !r.pass);
  log(`${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exitCode = failed.length ? 1 : 0;
}
