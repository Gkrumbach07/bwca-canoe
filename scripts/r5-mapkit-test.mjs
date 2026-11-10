// Round 5, stream M (the owner, 2026-11-10): "There shouldn't be a bubble around where the playable area is on the map"
// and "in sandbox mode, if you don't go through the tutorial, you don't get a canoe or anything".
//   1-3  the map: what lies outside the real wilderness boundary (boundary.bin) is washed, inside is not, and the doorstep
//        band (400 m round the line, the 1.5 km circles round the lots) is washed like any land outside; the notice still
//        reads the band (zoneAt unchanged); shots of a map round the home store and of the start map
//   4-6  Adventure: a new season is still empty-handed (no canoe, no jacket, the talk the first step)
//   7-11 Sandbox: a new season by the title has the canoe, the paddle, the life jacket (worn afloat), a pack with a tent,
//        the pot, a stove, food and bait at once, no talk asked for, no main-path steps; an old Sandbox save stuck at the
//        talk is kitted as it loads (a reload)
//   12   the cost: draw calls and shader programs at the home dock (compare with the same rig on the base)
//
//   APP=http://localhost:5721 node scripts/r5-mapkit-test.mjs [--home 31] [--shots <dir>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5721';
const HOME = Number(arg('home', 31));
const SHOTS = path.resolve(arg('shots', path.join(tmpdir(), 'r5-mapkit')));
mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  const ev = (fn, a) => page.evaluate(fn, a);
  const shot = async (name, el = null) => { const f = path.join(SHOTS, `r5-mapkit-${name}.png`); if (el) await page.locator(el).screenshot({ path: f }); else await page.screenshot({ path: f }); log('shot', f); return f; };
  const boot = async () => {
    await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.onboarding && g.guide && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
    await helpers();
  };
  const helpers = async () => {
    await ev(() => {
      const g = window.__game;
      window.__p = { step: (n = 30, dt = 1 / 30) => { for (let left = n; left > 0; left -= 200) g.step(dt, Math.min(200, left)); } };
      // the page's own module copies (a fresh import('/src/x.js') can be a second instance): by the loaded URL
      window.__p.mod = (name) => { const e = performance.getEntriesByType('resource').map((r) => r.name).find((n) => new RegExp(`/src/${name}\\.js(\\?|$)`).test(n)); return import(e || `/src/${name}.js`); };
    });
  };
  // a season by the title's own way: the menu (or the quiet Sandbox button), the pin, the wizard's date, Start
  const season = async (mode) => {
    await ev((m) => { const t = window.__game.title; if (t.state === 'game') t.open('title'); t.askNewSeason(m); if (t.right === 'confirm') t.confirmed(); }, mode);
    await page.waitForFunction(() => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const sm = await shot(`startmap-${mode}`);
    await page.click(`.startmap .pin[data-ep="${HOME}"]`);
    await ev(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
    await page.waitForTimeout(300);
    await page.click('#btn-start');
    // (a season into an empty slot reloads the page: the game comes back on its own, the helpers with it)
    await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.player && g.prewarmed && g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, { timeout: 300000, polling: 250 });
    await helpers();
    if (await ev(() => window.__game.outfitter.open)) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    await ev(() => window.__p.step(20));
    return sm;
  };
  const kit = () => ev(() => {
    const g = window.__game, inv = g.inventory, ob = g.onboarding, s = ob.state || {};
    g.guide.sync();
    const steps = (g.guide.list ? g.guide.list() : []).map((t) => t.id).filter((id) => /^story:onboard/.test(id));
    const cur = g.guide.current ? g.guide.current() : null;
    return {
      mode: g.profile.mode, loan: !!s.loan, done: !!s.done, step: s.step, sandboxFlag: !!s.sandbox, noCanoe: ob.noCanoe, noPfd: g.canoe.noPfd ? !!g.canoe.noPfd() : null,
      hull: !!g.player.canoe.hull.visible, pending: ob.pending(g.profile.home),
      canoe: inv.containers.filter((c) => c.where === 'canoe').map((c) => c.item), long: inv.long.map((l) => `${l.id}@${l.where}`),
      pfd: inv.count('pfd', { reachable: false }), meals: ob.meals(), leeches: inv.count('leeches', { reachable: false }), tent: inv.count('aframe', { reachable: false }) + inv.count('walttent', { reachable: false }),
      stove: inv.count('stove', { reachable: false }) + inv.count('waltstove', { reachable: false }), pot: inv.count('pot', { reachable: false }), bag: inv.count('sleepingbag', { reachable: false }),
      crate: inv.crate ? inv.crate.grid.map((e) => e.id) : [], steps, cur: cur ? cur.id : null,
    };
  });

  await page.goto(APP, { timeout: 180000 });
  await boot();

  // --- 1-3 the map ---------------------------------------------------------------------------------------------------------
  await ev(async () => { const MR = await window.__p.mod('map-render'); await MR.loadBoundary(); });
  const wash = await ev(async () => {
    const g = window.__game, E = await window.__p.mod('edge'), MR = await window.__p.mod('map-render'), { EDGE, ZONE } = E;
    await E.loadEdge();
    // a 1 px = 50 m picture of the whole table, paper white, the edge painted over it: washed = changed
    const W = EDGE.W, H = EDGE.H, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    const v = { x0: EDGE.x0, z0: EDGE.z0, mPerPx: EDGE.cell };
    E.paintEdge(ctx, v, 1, { box: [g.world.minX, g.world.minZ, g.world.maxX, g.world.maxZ], bound: MR.BOUNDARY.path, quetico: false });
    const px = ctx.getImageData(0, 0, W, H).data;
    const n = { wildIn: 0, wildInWashed: 0, doorOut: 0, doorOutWashed: 0, out: 0, outWashed: 0, inBoundary: 0, inWashed: 0 };
    for (let j = 1; j < H - 1; j += 3) for (let i = 1; i < W - 1; i += 3) {
      const x = EDGE.x0 + (i + 0.5) * EDGE.cell, z = EDGE.z0 + (j + 0.5) * EDGE.cell, zn = EDGE.zones[j * W + i], washed = px[(j * W + i) * 4 + 2] < 250;
      // clear of the line itself (a cell the line crosses is either)
      const inside = MR.inWilderness(x, z), sure = [[-60, 0], [60, 0], [0, -60], [0, 60]].every(([dx, dz]) => MR.inWilderness(x + dx, z + dz) === inside);
      if (!sure) continue;
      if (inside) { n.inBoundary++; if (washed) n.inWashed++; if (zn === ZONE.WILD) { n.wildIn++; if (washed) n.wildInWashed++; } }
      else { n.out++; if (washed) n.outWashed++; if (zn === ZONE.DOOR) { n.doorOut++; if (washed) n.doorOutWashed++; } }
    }
    return n;
  });
  result('1 the map washes nothing inside the wilderness boundary', wash.inBoundary > 1000 && wash.inWashed === 0, wash);
  result('2 everything outside the boundary is washed, the doorstep band and the lots\' circles too (no bubble)', wash.out > 1000 && wash.outWashed / wash.out > 0.999 && wash.doorOut > 50 && wash.doorOutWashed === wash.doorOut, wash);

  // a map round the home store (the lot's circle and the band were the bubble), drawn as the book's and the counter's are
  const mapR = await page.evaluate(`(async () => {
    const g = window.__game, MR = await window.__p.mod('map-render'), o = g.outfitter, L = o.landing(${HOME});
    const cv = document.createElement('canvas'); cv.id = 'r5-map'; cv.width = 1040; cv.height = 720; cv.style.cssText = 'position:fixed;left:120px;top:0;z-index:99999;width:1040px;height:720px';
    document.body.appendChild(cv);
    let r = null;
    for (let i = 0; i < 400; i++) { r = MR.drawRegion(cv, g.world, { cx: L.x, cz: L.z, span: 16000 }, {}); if (r.ready) break; await new Promise((q) => setTimeout(q, 100)); }
    return { ready: !!(r && r.ready), x: Math.round(L.x), z: Math.round(L.z) };
  })()`);
  await shot('map-home', '#r5-map');
  await ev(() => document.getElementById('r5-map').remove());
  result('3 a map round the home store draws (ready) with the boundary in', mapR.ready, mapR);

  // --- 4-6 Adventure: the empty-handed start -----------------------------------------------------------------------------
  await season('adventure');
  const adv = await kit();
  result('4 Adventure: no canoe, no paddle, no jacket at the start (the talk lends them)', adv.mode === 'adventure' && adv.noCanoe && !adv.hull && adv.canoe.length === 0 && adv.long.length === 0 && adv.pfd === 0 && adv.noPfd === true, adv);
  result('5 Adventure: the staff talk is to come and is the first step', adv.pending && !adv.done && adv.steps.includes('story:onboard:talk'), adv);
  const advCost = await ev(async () => { const g = window.__game; g.renderer.info.autoReset = true; window.__p.step(4); return { calls: g.renderer.info.render.calls, programs: g.renderer.info.programs.length }; });

  // --- 7-11 Sandbox ---------------------------------------------------------------------------------------------------------
  await season('sandbox');
  const sb = await kit();
  result('7 Sandbox: kitted at once: canoe at the dock, the barrel, the bucket, a pack; the ash paddle and a rod', sb.mode === 'sandbox' && sb.loan && !sb.noCanoe && sb.hull && sb.canoe.includes('barrel30') && sb.canoe.includes('bucket') && sb.canoe.includes('pack3') && sb.long.some((l) => /^ash@/.test(l)) && sb.long.some((l) => /^rod@/.test(l)), sb);
  result('8 Sandbox: the life jacket, a tent, the pot, a stove, your bag, food (6 meals) and leeches', sb.pfd >= 1 && sb.tent >= 1 && sb.pot >= 1 && sb.stove >= 1 && sb.bag >= 1 && sb.meals >= 6 && sb.leeches >= 12, sb);
  result('9 Sandbox: no staff talk asked for, no main-path steps', !sb.pending && sb.done && sb.steps.length === 0 && !/^story:onboard/.test(sb.cur || ''), sb);
  // afloat: the jacket worn (by owning it, not by the loan flag)
  const worn = await ev(() => {
    const g = window.__game, ob = g.onboarding, s = ob.state, was = s.loan;
    s.loan = false; // (as an old save's flag might be: the jacket owned is what counts)
    const noPfd = g.canoe.noPfd();
    s.loan = was;
    return { noPfdWithoutLoan: noPfd, pfdOwned: g.inventory.count('pfd', { reachable: false }) };
  });
  result('10 the life jacket rule reads the jacket owned, not the loan flag', worn.noPfdWithoutLoan === false && worn.pfdOwned >= 1, worn);
  // the dock with the canoe: a look
  await ev(() => { const g = window.__game, L = g.outfitter.landing(g.profile.home), p = g.player, h = g.player.canoe.hull; if (g.chase) { const y = Math.atan2(-(L.z - p.z), L.x - p.x); g.chase.viewYaw = y; g.chase.forwardYaw = y; if (g.chase.snap) g.chase.snap(); } window.__p.step(10); return !!h.visible; });
  await shot('sandbox-start');
  const sbCost = await ev(async () => { const g = window.__game; g.renderer.info.autoReset = true; window.__p.step(4); return { calls: g.renderer.info.render.calls, programs: g.renderer.info.programs.length }; });

  // an old Sandbox save stuck at the talk: the state and the inventory of an empty-handed Sandbox season, saved, reloaded
  await ev(async () => {
    const g = window.__game, ob = g.onboarding, inv = g.inventory;
    ob.state = { v: 1, step: 'door', done: false, season: g.profile.seasonId, nudged: true, path: { food: false, leeches: false, canoe: false }, loan: false };
    ob.write();
    inv.newSeason();
    if (g.saver && g.saver.save) try { g.saver.save(); } catch { /* the page's own */ }
    if (g.store && g.store.flush) await g.store.flush();
    await new Promise((r) => setTimeout(r, 1500));
  });
  await page.reload({ timeout: 180000 });
  await boot();
  const stuck0 = await ev(() => { const s = window.__game.onboarding.state || {}; return { loan: !!s.loan, step: s.step, mode: window.__game.profile.mode }; });
  await page.click('#btn-continue').catch(() => ev(() => window.__game.title.continueTrip()));
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.title.state === 'game' && !g.player.teleporting; }, null, { timeout: 180000, polling: 250 });
  await helpers();
  if (await ev(() => window.__game.outfitter.open)) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await ev(() => window.__p.step(20));
  const stuck = await kit();
  result('11 an old Sandbox save stuck at the talk is kitted on load', stuck0.mode === 'sandbox' && stuck0.loan === false && stuck.loan && !stuck.noCanoe && stuck.canoe.includes('pack3') && stuck.pfd >= 1 && stuck.meals >= 6 && !stuck.pending, { stuck0, stuck });

  result('12 cost at the home store (calls, programs): Adventure vs Sandbox (the canoe shown is the loan\'s, drawn after a talk too)', true, { adventure: advCost, sandbox: sbCost });
  const notice = await ev(async () => { const E = await window.__p.mod('edge'); return { ready: E.EDGE.ready, doorZones: E.EDGE.zones.reduce((n, z) => n + (z === 2), 0) }; });
  result('6 the notice still reads the doorstep band (zones in the table, unchanged)', notice.ready && notice.doorZones > 1000, notice);
} catch (e) {
  log('ERROR', e && e.stack || e);
  results.push({ name: 'rig ran', pass: false, more: String(e) });
} finally {
  await browser.close();
}
const pass = results.filter((r) => r.pass).length;
writeFileSync(path.join(SHOTS, 'r5-mapkit.json'), JSON.stringify({ results, errors }, null, 1));
log(`r5-mapkit: ${pass}/${results.length} pass, ${errors.length} page errors`);
process.exit(pass === results.length && !errors.length ? 0 : 1);
