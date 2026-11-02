// Co-op round 4's rig (docs/plans/coop.md, "Phase 3 round 4: the status bar"): two headless Chromiums (one browser
// process each) through `wrangler dev` with a delay. The host begins an Adventure season at Lake One in June and opens
// the room in the store; the guest, a fresh browser whose own season is dated by the real clock (months off the host's),
// joins. Checked:
//   1. the guest's energy right after joining: rested on the host's clock (energy.arrive): hours awake = the hours since
//      seven that morning (at most 12), the rest need and the ceiling near full; not the year awake their own season's
//      clock read against the host's made of it (the bar 100 % sleepy, spent on arrival)
//   2. on both screens, at the store and unpaused, the top bar (#energy's track) is up: shown, laid out on screen, not
//      covered (document.elementFromPoint at its centre is the bar's own hit box)
//   3. after the push-off, on the water: the bar up on both screens, the guest's ceiling still near full (live now)
//   4. paused (Escape) and resumed: the bar up again on both screens in play
//   APP=http://localhost:5331 RELAY=ws://localhost:8831 node scripts/coop/hud.mjs [--out dir] [--shots dir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5331';
const RELAY = process.env.RELAY || 'ws://localhost:8831';
const OUT = path.resolve(arg('out', 'coop-hud-out'));
const SHOTS = arg('shots', OUT);
mkdirSync(OUT, { recursive: true });
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
const shot = async (page, name) => { if (!SHOTS) return; try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch (e) { log('shot', name, e.message); } };

async function openGame(name, query = '') {
  const browser = await launch(); browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /coop/i.test(m.text())) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${query}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.coop && window.__game.title && window.__game.coopTrip, null, { timeout: 240000, polling: 500 });
  log(`[${name}] game loaded`);
  return page;
}
const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 200 });

// the top bar on this screen: shown, on screen, and the thing under its centre (its own hit box, or inside #energy)
const barSeen = () => {
  const g = window.__game, el = document.getElementById('energy'), tr = el && el.querySelector('.track');
  if (!el || !tr) return { ok: false, why: 'no bar' };
  const r = tr.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  let hidden = null;
  for (let n = tr; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) { hidden = `${n.id || n.className}: ${cs.display}/${cs.visibility}/${cs.opacity}`; break; } }
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const hit = r.width > 0 ? document.elementFromPoint(cx, cy) : null;
  const inside = !!(hit && el.contains(hit));
  const onScreen = r.width > 40 && r.height > 2 && r.x >= 0 && r.y >= 0 && r.x + r.width <= W && r.y + r.height <= H;
  const e = g.energy;
  return { ok: !hidden && onScreen && inside && el.classList.contains('show') && !el.classList.contains('nobar'), cls: el.className, rect: [r.x, r.y, r.width, r.height].map(Math.round), hidden, hit: hit ? (hit.id || hit.className || hit.tagName) : null, inside, title: g.title.state, paper: g.hud.paper || null, trip: g.trip.active, ceiling: +e.ceiling.toFixed(3) };
};
const energyOf = () => {
  const g = window.__game, e = g.energy, d = g.day;
  return { hours: +d.hours.toFixed(3), doy: d.doy, awake: +e.awake.toFixed(3), rest: +e.needs.rest.toFixed(3), ceiling: +e.ceiling.toFixed(3), value: +e.value.toFixed(3), live: e.live, mode: g.trip.mode, spent: e.spentAt != null };
};

try {
  // --- the host: an Adventure season at Lake One in June, in the store, the room open ------------------------------------
  const A = await openGame('host');
  await A.evaluate(async () => {
    const g = window.__game, t = g.title;
    const ep = g.world.entryPoints.find((e) => e.name === 'Lake One') || g.world.entryPoints[0];
    t.setPick('adventure');
    await t.newSeason(ep, { confirm: false, start: { year: new Date().getFullYear(), doy: 166 } });
  });
  await until(A, () => window.__game.title.state === 'game' && !window.__game.player.teleporting && !!window.__game.outfitter.visit, null, 120000);
  await A.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
  const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
  log('[host] code', code);

  // --- the guest: a fresh browser (its own season by the real clock), joins ----------------------------------------------
  const B = await openGame('guest', `&join=${code}`);
  await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
  await B.fill('#coop-name', 'Ada');
  await B.click('#coop-go');
  await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
  await until(B, () => { const g = window.__game, o = g.outfitter; return g.trip.adventure && o.visit && !o.arrival && g.player.onFoot; }, null, 90000);
  await sleep(1500);
  const [hostE, guestE] = await Promise.all([A.evaluate(energyOf), B.evaluate(energyOf)]);
  const expectAwake = Math.min(12, Math.max(0, hostE.hours - 7));
  result('1. the guest arrives rested on the host\'s clock: hours awake since 7 am (≤ 12), rest and ceiling near full',
    guestE.doy === hostE.doy && Math.abs(guestE.awake - expectAwake) < 0.25 && guestE.rest >= 0.9 && guestE.ceiling >= 0.9 && guestE.value >= 0.9 && !guestE.spent,
    { host: hostE, guest: guestE, expectAwake: +expectAwake.toFixed(3) });

  // --- the bar at the store, unpaused, on both screens -------------------------------------------------------------------
  await Promise.all([A, B].map((P) => P.evaluate(() => { const o = window.__game.outfitter; o.pendingShow = false; if (o.open) o.hide(); })));
  await sleep(800);
  const [s2A, s2B] = await Promise.all([A.evaluate(barSeen), B.evaluate(barSeen)]);
  result('2. at the store, unpaused: the top bar is up and uncovered on both screens', s2A.ok && s2B.ok, { host: s2A, guest: s2B });
  await shot(A, 'hud-1-host-store');
  await shot(B, 'hud-1-guest-store');

  // --- the push-off: the guest leaves the landing; the bar on the water ----------------------------------------------------
  await B.evaluate(async () => {
    const g = window.__game, o = g.outfitter, p = g.player, ep = o.visit.ep, L = o.layout(ep), b = o.visit.berth ? o.visit.berth.side : L.dockSide, dd = g.world.deeperDir(b.x, b.z);
    await p.teleport(b.x + dd.x * 45, b.z + dd.z * 45);
  });
  await until(A, () => window.__game.trip.active, null, 30000);
  await until(B, () => window.__game.trip.active && window.__game.energy.live, null, 30000);
  await A.evaluate(async () => {
    const g = window.__game, o = g.outfitter, p = g.player, ep = g.trip.state.from, L = o.layout(ep), b = L.dockSide, dd = g.world.deeperDir(b.x, b.z);
    await p.teleport(b.x + dd.x * 60 + dd.z * 30, b.z + dd.z * 60 - dd.x * 30);
  });
  await until(A, () => !window.__game.player.teleporting && window.__game.player.mode === 'paddle', null, 60000);
  await sleep(3000);
  const [s3A, s3B, e3B] = await Promise.all([A.evaluate(barSeen), B.evaluate(barSeen), B.evaluate(energyOf)]);
  result('3. on the water, the trip under way: the bar up on both screens, the guest\'s ceiling still near full', s3A.ok && s3B.ok && s3A.trip && s3B.trip && e3B.live && e3B.ceiling >= 0.9 && !e3B.spent, { host: s3A, guest: s3B, guestE: e3B });
  await shot(A, 'hud-2-host-water');
  await shot(B, 'hud-2-guest-water');

  // --- paused (Escape) and back: the bar up again in play -----------------------------------------------------------------
  const paused = [];
  for (const P of [A, B]) {
    await P.keyboard.press('Escape');
    try { await until(P, () => window.__game.title.state === 'pause', null, 5000); } catch { await P.evaluate(() => window.__game.title.open('pause')); }
    await sleep(400);
    paused.push(await P.evaluate(() => ({ title: window.__game.title.state, strip: !!(document.getElementById('strip') && document.getElementById('strip').classList.contains('show')) })));
    await P.evaluate(() => window.__game.title.resume());
    await until(P, () => window.__game.title.state === 'game', null, 5000);
  }
  await sleep(1200);
  const [s4A, s4B] = await Promise.all([A.evaluate(barSeen), B.evaluate(barSeen)]);
  result('4. paused and resumed: the bar up again on both screens in play', s4A.ok && s4B.ok, { paused, host: s4A, guest: s4B });
  await shot(A, 'hud-3-host-resumed');
  await shot(B, 'hud-3-guest-resumed');
} catch (e) { log('ERROR', e && e.stack || e); results.push({ name: 'run', pass: false, error: String(e) }); }
finally {
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
  for (const b of browsers) await b.close().catch(() => {});
  log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
}
