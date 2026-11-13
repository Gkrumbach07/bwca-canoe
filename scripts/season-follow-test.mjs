#!/usr/bin/env node
// The season turns for everybody (owner 2026-11-13), in the game (flag off: base game):
//   1 a host with a friend in the room may turn the year (canTurn: null)
//   2 a guest whose host's clock jumps a winter ahead sees the winter card; in its dark the clock is the host's, the
//     guest wakes rested; a cooked meal is thrown out, a dry one kept
//   3 a short jump (a permit's skip) is no winter: no card
//   APP=http://localhost:5212 node scripts/season-follow-test.mjs
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const APP = (process.env.APP || 'http://localhost:5212').replace(/\/$/, '');
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push(!!pass); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 800)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  const until = (fn, a = null, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
  await page.goto(`${APP}/`, { timeout: 180000 });
  await until(() => window.__game && window.__game.title && window.__game.title.state === 'title', null, 300000);
  await page.evaluate(async () => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === 25), { confirm: false, start: { year: 2026, doy: 280 } }); if (g.onboarding && g.onboarding.pending && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(g.onboarding.home, false); } });
  await until(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && g.seasonTurn; }, null, 240000);

  const r1 = await page.evaluate(() => {
    const g = window.__game, c = g.coop, was = c.peers;
    c.peers = () => [{ id: 7, name: 'Bo' }];
    const why = g.seasonTurn.canTurn();
    c.peers = was;
    return { why, trip: !!(g.trip && g.trip.active) };
  });
  result('1 a host with a friend in may turn the year', r1.why === null, r1);

  const r2 = await page.evaluate(async () => {
    if (window.__game.outfitter && window.__game.outfitter.open) window.__game.outfitter.hide();
    const g = window.__game, c = g.coop, T = g.seasonTurn, inv = g.inventory || (g.energy && (g.energy.inv || g.energy.inventory));
    const was = c.role;
    // a cooked meal and a dry one on you (what the winter takes and what it keeps)
    const ids = [];
    try { const all = Object.values((g.items && g.items.ITEMS) || {}); const cooked = all.find((d) => d.cooked && !d.unique), dry = all.find((d) => d.kind === 'food' && !d.cooked && !d.unique); for (const d of [cooked, dry]) if (d && inv.give) { inv.give(d.id, 1); ids.push(d.id); } } catch (e) { ids.push('err:' + e.message); }
    const has = (id) => inv.containers.some((k) => k.grid.some((e) => e.id === id));
    g.energy.value = 0.2;
    c.role = 'guest';
    let card = null; const vc = g.veil.card.bind(g.veil); g.veil.card = (k) => { card = { kicker: k.kicker, sub: k.sub }; return vc(k); };
    const took = T.follow({ year: 2027, doy: 166, hours: 7.05 });
    await T.followP;
    g.veil.card = vc;
    const after = { year: g.day.year, doy: g.day.doy, hours: +g.day.hours.toFixed(2), energy: +g.energy.value.toFixed(2) };
    const kept = ids.map((id) => [id, has(id)]);
    // 3 a short jump is no winter
    const short = T.follow({ year: 2027, doy: 180, hours: 9 });
    c.role = was;
    return { took, card, after, kept, short };
  });
  result('2 a guest follows the host\'s winter: the card, the clock, rested', r2.took && r2.card && r2.card.kicker === 'winter' && r2.after.year === 2027 && r2.after.doy === 166 && r2.after.energy > 0.9, r2);
  result('2b the winter throws out the cooked food and keeps the dry', r2.kept.length === 2 && r2.kept[0][1] === false && r2.kept[1][1] === true, r2.kept);
  result('3 a short jump is no winter', r2.short === false, { short: r2.short });
  result('no page errors', errors.length === 0, errors.slice(0, 3));
} finally { await browser.close(); }
const ok = results.every(Boolean);
log(`${results.filter(Boolean).length}/${results.length} ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
