// probe (c2-fix): season B of --slice2, with or without the turn fixture, E's steps up to 12, with fishing traced.
//   node scripts/probe-c2fix.mjs [--no-fixture] [--upto E12]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T } from './slice/c1-talk.mjs';
import { HELPERS_E, steps as E_STEPS, castAndWork } from './slice/c2-episodes.mjs';

const argv = process.argv.slice(2);
const noFx = argv.includes('--no-fixture');
const APP = (process.env.APP || 'http://localhost:5995').replace(/\/$/, '');
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on('pageerror', (e) => log('pageerror', e.message));
await page.goto(`${APP}/?story=1`, { timeout: 180000 });
await page.waitForFunction(() => window.__game && window.__game.title && window.__game.story && (window.__game.title.state === 'title' || window.__game.title.state === 'game') && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
await page.evaluate(async () => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === 25), { confirm: false, start: { year: 2026, doy: 160 } }); });
await page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting && window.__game.storySeams && window.__game.storySeams.feed && window.__game.book && window.__game.storyTalk && window.__game.pencil, null, { timeout: 200000, polling: 250 });
await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T); await page.evaluate(HELPERS_E);
const fx = await page.evaluate((noFx) => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); const r = noFx ? null : g.story.debug.fixture('turn'); window.__L.step(20); return { r, stage: g.story.stage }; }, noFx);
log('fixture', JSON.stringify(fx));
// the trace: fishing's state changes, the frame's gates
await page.evaluate(() => {
  const g = window.__game, F = g.fishing, tr = window.__tr = [];
  let last = null;
  const snap = () => { const p = g.player; return { st: F.state, up: F.rodUp, foot: F.onFoot, line: +F.lineOut.toFixed(1), blownN: F.blownN || 0, mode: p.mode, act: !!p.act, seat: !!p.seat, tp: !!p.teleporting, paused: !!(p.input && p.input.paused), title: g.title.state, paper: g.hud.paper || null, convo: !!(g.dialogue && g.dialogue.convo), book: !!(g.journal && g.journal.open), held: F.input.held('Space'), lure: F.lureDef && F.lureDef.id, msg: F.message && F.message.text, prompt: p.prompt && p.prompt.text }; };
  window.__snap = snap;
  const up = F.update.bind(F);
  F.update = (dt) => { up(dt); const s = snap(); const k = `${s.st}|${s.up}|${s.paused}|${s.title}|${s.paper}|${s.convo}|${s.book}|${s.held}|${s.blownN}|${s.msg}`; if (k !== last) { last = k; tr.push({ t: +g.day.hours.toFixed(3), ...s }); if (tr.length > 400) tr.shift(); } };
});
if (argv.includes('--wind')) {
  // casts at the pot under set winds (no fish: the bite rate off), each from the ready state; the landing's offset from
  // the tip–pot line, the nearest pass, hooked or not
  await page.evaluate(async () => { const g = window.__game, E = window.__e; window.__t.walkOut(25); E.at(2026, 160, 12); await E.ashore('s9.beach', 1.6); E.kitUp(); g.storyLayer.poll(); window.__L.step(10); g.fishing.rateFor = () => 0; });
  const tip = await page.evaluate(() => { const F = window.__game.fishing, t = F.tipWorld(), P = window.__e.prop('s9.pot'); return { bearingToPot: +((Math.atan2(P.x - t.x, -(P.z - t.z)) * 180 / Math.PI + 360) % 360).toFixed(0) }; });
  log('tip', JSON.stringify(tip));
  const cfgs = argv[argv.indexOf('--wind') + 1].split(',').map((c) => c.split('@').map(Number));
  for (const [speed, from] of cfgs) {
    for (let rep = 0; rep < 2; rep++) {
      await page.evaluate(([speed, from]) => { const g = window.__game, F = g.fishing; if (speed < 0) { g.wind.override = null; } else { g.wind.override = speed; g.wind.speed = speed; g.wind.from = from; } if (F.fish && F.fish.snag) F.fish.snag.cancel(); F.fish = null; F.bite = null; F.state = F.rodUp ? 'ready' : F.state; F.lineOut = 0; window.__e.kitUp(); window.__L.step(20); }, [speed, from]);
      const c = await castAndWork(page, { max: 1200 });
      const w = await page.evaluate(() => ({ speed: +window.__game.wind.speed.toFixed(2), from: Math.round(window.__game.wind.from) }));
      log('cast', JSON.stringify({ set: [speed, from], w, st: c.st && c.st.state, snag: !!(c.st && c.st.snag), landed: c.why.landed.lure, cw: c.why.landed.cw, near: c.why.near, blownN: c.why.after.blownN }));
    }
  }
  await browser.close(); process.exit(0);
}
const result = (name, pass, more) => log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 2500));
const UPTO = argv.includes('--upto') ? argv[argv.indexOf('--upto') + 1] : 'E12';
for (const s of E_STEPS) {
  const paused = await page.evaluate(() => { const t = window.__game.title; if (t.state !== 'pause') return false; t.resume(); window.__L.step(4); return true; });
  if (paused) log('(pause card resumed)');
  log('--', s.id);
  if (s.id === 'E12') {
    const pre = await page.evaluate(() => { const g = window.__game, F = g.fishing; return { snap: window.__snap(), wind: F.wind ? { speed: +F.wind.speed.toFixed(2) } : null, weather: g.weather && g.weather.state, inv: (g.inventory.long || []).map((l) => `${l.id}@${l.where}`), hands: g.inventory.hands ? JSON.stringify(g.inventory.hands).slice(0, 300) : null }; });
    log('pre-E12', JSON.stringify(pre));
    await page.evaluate(() => { window.__tr.length = 0; });
    if (argv.includes('--blow')) { const b = argv[argv.indexOf('--blow') + 1].split('@').map(Number); await page.evaluate((b) => { const w = window.__game.wind; w.override = b[0]; w.speed = b[0]; w.from = b[1]; }, b); log('blow', JSON.stringify(b)); }
  }
  try { await s.run({ page, result, log, ctx: {} }); } catch (e) { log('threw', String(e && e.stack || e).slice(0, 600)); }
  if (s.id === 'E12') {
    const tr = await page.evaluate(() => window.__tr.slice(0, 80));
    for (const t of tr) log('tr', JSON.stringify(t));
    const post = await page.evaluate(() => { const g = window.__game, F = g.fishing; return { snap: window.__snap(), wind: F.wind ? { speed: +F.wind.speed.toFixed(2), dir: F.wind.dir } : null, rod: F.rodInHand(), footOk: F.footOk(), inHand: g.inventory.rodInHand, indoors: F.indoors ? F.indoors() : null }; });
    log('post-E12', JSON.stringify(post));
  }
  if (s.id === UPTO) break;
}
await browser.close();
