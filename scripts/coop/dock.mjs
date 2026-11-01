// Co-op: two friends at one dock (see below).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5293';
const RELAY = process.env.RELAY || 'ws://localhost:8793';
const OUT = path.resolve(arg('out', 'coop-dock-out'));
mkdirSync(OUT, { recursive: true });

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
const launch = () => chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const browsers = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass, ...more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more)); };

async function openGame(name, query = '') {
  const browser = await launch(); browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /coop/i.test(m.text())) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${query}`);
  await page.waitForFunction(() => window.__game && window.__game.coop && window.__game.title, null, { timeout: 240000, polling: 500 });
  log(`[${name}] game loaded`);
  return page;
}
const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
// from an action on one page to a condition on another: ms (node's wall clock, polled every 30 ms), or null
async function timed(act, page, cond, a, timeout = 15000) {
  const t0 = Date.now();
  await act();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(cond, a)) return Date.now() - t0;
    await sleep(30);
  }
  return null;
}


// The owner, 2026-11-01 (a screenshot): two friends tied up at one dock, one canoe drawn in the other and both standing
// on one spot. Now each tie-up takes the first berth no friend's canoe is in (outfitter.js berthFor, props.js dockBerths).
//   APP=http://localhost:5191 RELAY=ws://localhost:8795 node scripts/coop/dock.mjs [--out dir]
try {
  const A = await openGame('host');
  await A.evaluate(async () => {
    const g = window.__game, t = g.title;
    const ep = g.world.entryPoints.find((e) => e.name === 'Lake One') || g.world.entryPoints[0];
    t.setPick('sandbox');
    await t.newSeason(ep, { confirm: false });
  });
  await until(A, () => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 120000);
  const host = await A.evaluate(() => { const o = window.__game.outfitter, p = window.__game.player, d = p.carry && p.carry.drop; if (o.open) o.hide(); return { ep: o.visit.ep, berth: o.visit.berth && o.visit.berth.side, drop: d ? { x: d.x, z: d.z } : null, n: o.berths(o.visit.L).length }; });
  log('[host] tied up', host);
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
  const B = await openGame('guest', `&join=${code}`);
  await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
  await B.fill('#coop-name', 'Ada');
  await B.click('#coop-go');
  await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
  await until(B, () => window.__game.coop.remotes.size === 1 && [...window.__game.coop.remotes.values()][0].boat && !([...window.__game.coop.remotes.values()][0].boat.hidden), null, 30000);
  // the guest afloat 8 m out from the host's berth, then E at the dock: paddled in, tied up, out on the deck
  const tied = await B.evaluate(async (ep) => {
    const g = window.__game, o = g.outfitter, p = g.player, L = o.layout(ep), l = o.landing(ep);
    if (!L) return { none: 'no layout' };
    const b0 = o.berths(L)[0].side, dd = g.world.deeperDir(b0.x, b0.z);
    await p.teleport(b0.x + dd.x * 8, b0.z + dd.z * 8);
    for (let i = 0; i < 30 && p.mode !== 'paddle'; i++) g.step(1 / 30, 1);
    const others = o.otherCanoes();
    o.dockUp(l, L);
    for (let i = 0; i < 400 && o.docking; i++) g.step(1 / 60, 1);
    g.step(1 / 30, 10);
    const d = p.carry && p.carry.drop;
    return { mode: p.mode, others, berth: o.visit && o.visit.berth && o.visit.berth.side, drop: d ? { x: d.x, z: d.z } : null, me: { x: p.x, z: p.z } };
  }, host.ep);
  log('[guest] tied up', tied);
  await sleep(1500);
  const seen = await A.evaluate(() => { const r = [...window.__game.coop.remotes.values()][0], p = window.__game.player; return { boat: { x: r.boat.x, z: r.boat.z }, person: { x: r.person.x, z: r.person.z }, me: { x: p.x, z: p.z }, mine: p.carry && p.carry.drop ? { x: p.carry.drop.x, z: p.carry.drop.z } : null }; });
  const apart = tied.drop && host.drop ? Math.hypot(tied.drop.x - host.drop.x, tied.drop.z - host.drop.z) : 0;
  const onHost = seen.mine ? Math.hypot(seen.boat.x - seen.mine.x, seen.boat.z - seen.mine.z) : 0;
  result('the guest ties up in another berth than the host', apart >= 2.6 && tied.mode === 'walk', { apart: +apart.toFixed(2), host: host.berth, guest: tied.berth, berths: host.n });
  result('on the host\'s screen the two canoes lie apart', onHost >= 2.6, { apart: +onHost.toFixed(2) });
  result('the two stand on the deck apart', Math.hypot(tied.me.x - seen.me.x, tied.me.z - seen.me.z) >= 1, { d: +Math.hypot(tied.me.x - seen.me.x, tied.me.z - seen.me.z).toFixed(2) });
} catch (e) { log('ERROR', e && e.stack || e); results.push({ name: 'run', pass: false, error: String(e) }); }
finally {
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  for (const b of browsers) await b.close().catch(() => {});
  log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}
