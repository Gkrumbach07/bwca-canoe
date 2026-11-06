// The new-season wizard as a centred card, and its start map zoomable (the owner, 2026-11-05: "the whole new season
// wizard is so crunched in the corner ... The map is insanely hard to see and use. You can't zoom in ... What's the
// yellow one mean? ... why are the map overflowing?"). Headless Chromium against a running Vite; each check PASS/FAIL.
//   1 at 1920x1080, 1280x720, 980x690 and 820x600: the card centred and inside the window; no element of it outside the
//     card or the window; the map canvas fits its box; each wizard page fits; the legend explains every symbol
//   2 wheel zoom changes the scale and the pins keep their size; drag pans; + − and reset; bounds clamped; double-click
//   3 ← → still step between the pins and Enter picks; page 3's words; a pick starts the season at that outfitter
//
//   npx vite --port 5208 --strictPort &
//   APP=http://localhost:5208 node scripts/r2-wizard-test.mjs [--shots docs/build/shots] [--tag after] [--only-shots]
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5208';
const SHOTS = arg('shots', null), TAG = arg('tag', 'after'), ONLY_SHOTS = process.argv.includes('--only-shots');
const HOME = Number(arg('home', 31)); // Farm Lake (Ruth Aho's)
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
  const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : [];
  const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()];
  for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; }
  return undefined;
}
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 900)); };
const errors = [];

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
const until = (fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
const shot = async (name) => { if (!SHOTS) return; await page.screenshot({ path: path.join(SHOTS, `r2-wizard-${name}.png`) }); log('shot', name); };

// the wizard's card and everything in it that shows: which fall outside the card or the window (the map's own pins and
// labels panned off its edge are clipped by its box, so they count only when they show)
const FIT = () => {
  const card = document.getElementById('entry-card'), r = card.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  const out = [];
  for (const n of card.querySelectorAll('*')) {
    if (!n.offsetParent || n.closest('[hidden]')) continue;
    const q = n.getBoundingClientRect(); if (!q.width || !q.height) continue;
    const fr = n.closest('.smap');
    if (fr && n !== fr) {
      const b = fr.getBoundingClientRect();
      if (q.right < b.left || q.left > b.right || q.bottom < b.top || q.top > b.bottom) continue; // panned out of sight
      if (n.closest('.zoom') && (q.left < b.left - 1 || q.right > b.right + 1 || q.top < b.top - 1 || q.bottom > b.bottom + 1)) out.push(`map:${n.className}`);
      continue;
    }
    // (inside a scrolling box of the card: scrolled to, not spilled; the box itself must fit)
    let sc = n.parentElement; while (sc && sc !== card && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (sc && sc !== card) { const b = sc.getBoundingClientRect(); if (q.bottom > b.bottom + 1 || q.top < b.top - 1) continue; }
    if (q.left < r.left - 1 || q.top < r.top - 1 || q.right > r.right + 1 || q.bottom > r.bottom + 1) out.push(`${n.tagName.toLowerCase()}.${n.className || n.id}`);
    if (q.left < -1 || q.top < -1 || q.right > W + 1 || q.bottom > H + 1) out.push(`window:${n.tagName.toLowerCase()}.${n.className || n.id}`);
    if (n.clientWidth > 24 && n.scrollWidth > n.clientWidth + 2 && getComputedStyle(n).overflowX === 'visible') out.push(`spill:${n.tagName.toLowerCase()}.${n.className || n.id}`);
  }
  const cv = card.querySelector('.smap canvas'), fr = card.querySelector('.smap');
  const c = cv && cv.offsetParent ? cv.getBoundingClientRect() : null, f = fr && fr.offsetParent ? fr.getBoundingClientRect() : null;
  return {
    W, H, card: [r.left, r.top, r.width, r.height].map(Math.round),
    centred: Math.abs(r.left + r.width / 2 - W / 2) <= 2 && Math.abs(r.top + r.height / 2 - H / 2) <= 2,
    inside: r.left >= 0 && r.top >= 0 && r.right <= W && r.bottom <= H,
    out: [...new Set(out)].slice(0, 12),
    canvasFits: !c || (Math.abs(c.width - fr.clientWidth) <= 1 && Math.abs(c.height - fr.clientHeight) <= 1 && c.left >= f.left - 1 && c.right <= f.right + 1 && c.top >= f.top - 1 && c.bottom <= f.bottom + 1),
    map: f ? [Math.round(f.width), Math.round(f.height)] : null,
    scroll: document.documentElement.scrollWidth > W + 1 || document.documentElement.scrollHeight > H + 1,
  };
};

try {
  await page.goto(APP, { timeout: 180000 });
  await until(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, 300000);
  log('loaded');
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(() => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  // the map's tiles in (map.ready, when the build has it), then a breath
  const settle = async () => { await page.waitForTimeout(400); await page.evaluate(() => new Promise((ok) => { const m = window.__game.title.wizard.map; let n = 0; const t = () => (m.ready !== false || ++n > 80 ? ok() : setTimeout(t, 150)); t(); })); await page.waitForTimeout(200); };

  for (const [w, h] of [[1280, 720], [980, 690]]) { await page.setViewportSize({ width: w, height: h }); await settle(); await shot(`${TAG}-${w}x${h}`); }
  if (ONLY_SHOTS) throw new Error('only-shots');

  // 1 the card at four sizes, on each page
  for (const [w, h] of [[1920, 1080], [1280, 720], [980, 690], [820, 600]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => window.__game.title.wizard.show(0));
    await settle();
    const f = await page.evaluate(FIT);
    result(`1 ${w}x${h} map page: centred, inside, nothing out, the canvas fits its box, the map the card's width`, f.centred && f.inside && !f.out.length && f.canvasFits && !f.scroll && f.map[0] >= 0.85 * f.card[2] && f.map[1] >= 200, f);
    for (const s of [1, 2]) {
      await page.evaluate((s) => { const z = window.__game.title.wizard; if (!z.ep) z.ep = z.epOf(31); z.show(s); }, s);
      await page.waitForTimeout(200);
      const g = await page.evaluate(FIT);
      result(`1 ${w}x${h} page ${s + 1}: centred, inside, nothing out`, g.centred && g.inside && !g.out.length && !g.scroll, g);
    }
    if (w === 820) { await shot(`${TAG}-sum-820x600`); await page.evaluate(() => window.__game.title.wizard.show(0)); await settle(); await shot(`${TAG}-820x600`); }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => window.__game.title.wizard.show(0));
  await settle();

  // the legend: every symbol on the map explained; the shown one named on the map; a gentle pin says why
  const leg = await page.evaluate(() => {
    const m = window.__game.title.wizard.map, t = document.querySelector('.startmap .skey').innerText.toLowerCase();
    const lab = document.querySelector('.smap .plab');
    return { missing: ['good first home', 'outfitter', 'picked', 'entry point', 'trailhead', 'free pickup', 'boundary', 'wheel', 'drag', 'enter', 'esc'].filter((w) => !t.includes(w)), label: lab && !lab.hidden ? lab.textContent : '', hot: m.home(m.hot) && m.home(m.hot).name, gentleTitle: (document.querySelector('.smap .pin.gentle') || {}).title || '' };
  });
  result('1 the legend explains every symbol; the shown one is named on the map; a gentle pin says why', !leg.missing.length && leg.label && leg.label.startsWith(leg.hot) && /short carries/i.test(leg.gentleTitle), leg);

  // 2 zoom and pan
  const st = () => page.evaluate(() => { const m = window.__game.title.wizard.map, b = document.querySelector('.startmap .pin').getBoundingClientRect(), f = document.querySelector('.smap').getBoundingClientRect(); return { s: m.view.s, cx: m.view.cx, cz: m.view.cz, z: m.zoom, pin: [Math.round(b.width), Math.round(b.height)], f: [f.left, f.top, f.width, f.height] }; });
  // a spot on the map no pin, label or button covers
  const empty = () => page.evaluate(() => { const f = document.querySelector('.smap').getBoundingClientRect(), rs = [...document.querySelectorAll('.smap .pin, .smap .zoom, .smap .plab')].map((p) => p.getBoundingClientRect());
    for (let j = 0.35; j < 0.8; j += 0.05) for (let i = 0.3; i < 0.8; i += 0.05) { const x = f.left + f.width * i, y = f.top + f.height * j; if (!rs.some((r) => x > r.left - 30 && x < r.right + 30 && y > r.top - 30 && y < r.bottom + 30)) return [x, y]; } return [f.left + f.width / 2, f.top + f.height * 0.9]; });
  const s0 = await st();
  let spot = await empty();
  await page.mouse.move(spot[0], spot[1]);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(60); }
  await page.waitForTimeout(250);
  const s1 = await st();
  result('2 the wheel zooms in about the pointer; the pins keep their size', s1.s > s0.s * 2 && s1.pin[0] === s0.pin[0] && s1.pin[1] === s0.pin[1], { s0: s0.s, s1: s1.s, pin0: s0.pin, pin1: s1.pin, zoom: s1.z });
  spot = await empty();
  await page.mouse.move(spot[0], spot[1]); await page.mouse.down(); await page.mouse.move(spot[0] - 60, spot[1] - 40, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(200);
  const s2 = await st();
  const step2 = await page.evaluate(() => window.__game.title.wizard.step);
  result('2 a drag pans (the view moves east and south with the pointer\'s pull), no pick', s2.cx > s1.cx && s2.cz > s1.cz && Math.abs(s2.s - s1.s) < 1e-9 && step2 === 0, { from: [s1.cx, s1.cz], to: [s2.cx, s2.cz], step: step2 });
  await page.click('.smap .zoom [data-z="out"]'); await page.waitForTimeout(100);
  const s3 = await st();
  for (let i = 0; i < 30; i++) await page.click('.smap .zoom [data-z="in"]');
  const s4 = await st();
  await page.click('.smap .zoom [data-z="reset"]'); await page.waitForTimeout(100);
  const s5 = await st();
  for (let i = 0; i < 6; i++) { await page.mouse.move(spot[0], spot[1]); await page.mouse.wheel(0, 400); }
  spot = await empty();
  await page.mouse.move(spot[0], spot[1]); await page.mouse.down(); await page.mouse.move(spot[0] + 400, spot[1] + 300, { steps: 6 }); await page.mouse.up();
  const s6 = await st();
  const lim = await page.evaluate(() => window.__game.title.wizard.map.limits());
  result('2 − zooms out, + zooms in to a limit, reset fits all; zoomed out and dragged it stays in its bounds', s3.s < s2.s && Math.abs(s4.z - lim.max) < 1e-6 && Math.abs(s5.z - 1) < 1e-6 && Math.abs(s6.z - 1) < 1e-6 && Math.abs(s6.cx - s5.cx) < 1 && Math.abs(s6.cz - s5.cz) < 1, { s3: s3.s, s2: s2.s, zMax: s4.z, lim, reset: s5.z, afterOut: s6.z, c5: [s5.cx, s5.cz], c6: [s6.cx, s6.cz] });
  spot = await empty();
  await page.mouse.dblclick(spot[0], spot[1]); await page.waitForTimeout(150);
  const s7 = await st();
  result('2 a double-click on the map zooms in there', s7.z > s6.z * 1.5, { before: s6.z, after: s7.z });
  await page.click('.smap .zoom [data-z="reset"]');
  await page.evaluate((ep) => { const m = window.__game.title.wizard.map; m.setHot(ep); m.zoomTo(ep, 5); }, HOME);
  await settle();
  await shot(`${TAG}-zoomed-1280x720`);
  await page.click('.smap .zoom [data-z="reset"]');

  // 3 the keys and a pick
  const keys = await page.evaluate((ep) => {
    const m = window.__game.title.wizard.map; m.focus(ep);
    const at0 = m.hot;
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    const at1 = m.hot;
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', bubbles: true }));
    return { at0, at1, at2: m.hot, focusIsPin: !!(document.activeElement && document.activeElement.classList.contains('pin')) };
  }, HOME);
  result('3 ← → step between the pins', keys.at0 === HOME && keys.at1 !== HOME && keys.at2 === HOME && keys.focusIsPin, keys);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const picked = await page.evaluate(() => { const w = window.__game.title.wizard; return { step: w.step, ep: w.ep && w.ep.ep }; });
  result('3 Enter picks the pin: on to the date', picked.step === 1 && picked.ep === HOME, picked);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  const sum = await page.evaluate(() => { const p = document.querySelector('.wstep[data-step="sum"]'); return { q: p.querySelector('.wq').textContent, sum: p.querySelector('.wsum').innerText }; });
  result('3 page 3 keeps its words', sum.q === 'Ready to start' && /at 9 am, at the store’s door/.test(sum.sum), sum);
  await page.click('#btn-start');
  await until(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  const begun = await page.evaluate(() => { const g = window.__game; return { home: g.profile.home, started: g.profile.started, visit: g.outfitter.visit.ep }; });
  result('3 the pick starts the season at that outfitter', begun.started && begun.home === HOME && begun.visit === HOME, begun);
  result('no page errors', !errors.length, { errors });
} catch (e) {
  if (e.message !== 'only-shots') { log('ERROR', e.stack || e.message); results.push({ name: 'ran to the end', pass: false }); }
} finally {
  await browser.close();
}
const fails = results.filter((r) => !r.pass);
log(`${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
