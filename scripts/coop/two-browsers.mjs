// The co-op rig (docs/plans/coop.md, "Latency on a paddle stroke"): two headless Chromiums on one machine, each its own
// profile (a browser context: its own IndexedDB), join one room through `wrangler dev` with a delay in the relay, and
// paddle. It measures what the other's canoe does on each screen against where it really was, and whether the clocks
// agree, and takes a screenshot pair.
//
//   cd server/room && npx wrangler dev --port 8791 --var DELAY_MS:100      (the relay, 100 ms added to every message)
//   npm run dev -- --port 5191                                              (the game)
//   node scripts/coop/two-browsers.mjs [--out dir] [--secs 14]
//     APP=http://localhost:5191  RELAY=ws://localhost:8791  PW=<playwright-core dir>  CHROME=<chrome-headless-shell>
//
// Needs playwright-core and a cached Chromium (the project's headless shots use the same: --use-angle=metal on a Mac).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5191';
const RELAY = process.env.RELAY || 'ws://localhost:8791';
const OUT = path.resolve(arg('out', 'coop-out'));
const SECS = Number(arg('secs', 14));
const QUALITY = arg('quality', null); // e.g. low: lighter pages on a busy machine
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
// two browsers, not two tabs of one: each its own GPU process, as two players' machines are (two WebGL pages in one
// browser stall each other's main thread on the shared GPU process, and the messages arrive in bursts of a second)
const launch = () => chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const browsers = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openGame(name, query = '') {
  const browser = await launch(); browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /coop/i.test(m.text())) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${query}`);
  await page.waitForFunction(() => window.__game && window.__game.coop && window.__game.title, null, { timeout: 240000, polling: 500 });
  if (QUALITY) await page.evaluate((q) => window.__game.settings.set('quality', q), QUALITY); // (before anything is timed: it recompiles)
  log(`[${name}] game loaded`);
  return page;
}
const until = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 200 });

// --- the host: a Sandbox season on Lake One in July, the trip opened --------------------------------------------------
const A = await openGame('host');
await A.evaluate(async () => {
  const g = window.__game, t = g.title;
  const ep = g.world.entryPoints.find((e) => e.name === 'Lake One') || g.world.entryPoints[0];
  t.setPick('sandbox');
  await t.newSeason(ep, { confirm: false });
});
await until(A, () => window.__game.title.state === 'game' && !window.__game.player.teleporting);
await sleep(1500);
await A.evaluate(async () => {
  const g = window.__game;
  g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide();
  await g.player.teleport(-20900, 19400); // Lake One's main basin
  g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide();
  g.day.setClock(2026, 190, 10.5); g.day.running = true; // a July morning (Sandbox: the host's clock keys)
  g.chase.snap && g.chase.snap();
});
await sleep(1500);
const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
log('[host] trip open, code', code, await A.evaluate(() => ({ mode: window.__game.player.mode, x: Math.round(window.__game.player.x), z: Math.round(window.__game.player.z) })));

// --- the guest: the link, a name, Join (through the card, as a person would) -------------------------------------------
const B = await openGame('guest', `&join=${code}`);
await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
const prefilled = await B.inputValue('#coop-code');
await B.fill('#coop-name', 'Ada');
await B.click('.coop-card .swatch[data-shirt="4"]');
await B.click('#coop-go');
await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
log('[guest] joined; the code came from the link:', prefilled === code);
await until(A, () => window.__game.coop.remotes.size === 1);
await until(B, () => window.__game.coop.remotes.size === 1);
await sleep(3000);

// --- both paddle: the host straight with a slow turn, the guest alongside; each traces the other as drawn ----------------
const recorder = () => {
  const g = window.__game; window.__own = [];
  const rec = () => { window.__own.push({ t: performance.timeOrigin + performance.now(), x: g.player.x, z: g.player.z, h: g.player.heading }); window.__ownRaf = requestAnimationFrame(rec); };
  rec(); g.coop.trace = []; g.coop.arrivals = [];
  window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch { /* none */ } window.__fps0 = { n: g.stats ? 0 : 0, t: performance.now() }; window.__frames = 0;
  const count = () => { window.__frames++; window.__countRaf = requestAnimationFrame(count); }; count();
};
await Promise.all([A.evaluate(recorder), B.evaluate(recorder)]);
for (const p of [A, B]) await p.keyboard.down('KeyW');
const clocks = [];
const t0 = Date.now();
let turned = false;
while (Date.now() - t0 < SECS * 1000) {
  if (!turned && Date.now() - t0 > SECS * 400) { turned = true; await A.keyboard.down('KeyA'); }
  if (turned && Date.now() - t0 > SECS * 600) await A.keyboard.up('KeyA');
  const read = () => { const d = window.__game.day; return { wall: performance.timeOrigin + performance.now(), year: d.year, doy: d.doy, hours: d.hours, hps: d.hoursPerSecond * d.rate, err: window.__game.coop.clockErr }; };
  const [a, b] = await Promise.all([A.evaluate(read), B.evaluate(read)]);
  if (a.year === b.year && a.doy === b.doy) clocks.push(((b.hours - a.hours) / a.hps) - (b.wall - a.wall) / 1000); // real seconds, guest − host, at one instant
  await sleep(1000);
}
for (const p of [A, B]) await p.keyboard.up('KeyW');
const grab = () => { cancelAnimationFrame(window.__ownRaf); cancelAnimationFrame(window.__countRaf); const g = window.__game; const lt = window.__long || [], long = { n: lt.length, overHalfS: lt.filter((d) => d > 500).length, maxMs: Math.round(Math.max(0, ...lt)), totalS: +(lt.reduce((x, y) => x + y, 0) / 1000).toFixed(1) }; const a = g.coop.arrivals.slice().sort((x, y) => x - y), q = (f) => Math.round(a[Math.min(a.length - 1, Math.floor(a.length * f))] || 0); return { own: window.__own, seen: g.coop.trace, frames: window.__frames, stats: g.coop.stats(), long, late: { n: a.length, med: q(0.5), p95: q(0.95), max: q(1) } }; };
const [ra, rb] = await Promise.all([A.evaluate(grab), B.evaluate(grab)]);

// --- what each saw of the other -------------------------------------------------------------------------------------
function at(track, t) { // the true place at wall time t (linear between frames)
  let lo = 0, hi = track.length - 1;
  if (t <= track[0].t) return track[0];
  if (t >= track[hi].t) return track[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (track[m].t <= t) lo = m; else hi = m; }
  const a = track[lo], b = track[hi], k = (t - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
}
function judge(seen, truth, label) {
  const s = seen.filter((p) => p.t > seen[0].t + 1500); // past the first moments
  if (s.length < 20) return { label, frames: s.length, note: 'too few frames' };
  // the delay that best matches what was drawn to where they were
  let best = null;
  for (let L = 0; L <= 800; L += 5) {
    let e2 = 0, emax = 0;
    for (const p of s) { const q = at(truth, p.t - L), e = Math.hypot(p.x - q.x, p.z - q.z); e2 += e * e; emax = Math.max(emax, e); }
    const rms = Math.sqrt(e2 / s.length);
    if (!best || rms < best.rms) best = { L, rms, emax };
  }
  // smoothness: the drawn speed frame to frame against its own running mean (a jump or a stall shows as a spike)
  const sp = [];
  for (let i = 1; i < s.length; i++) { const dt = (s[i].t - s[i - 1].t) / 1000; if (dt > 0) sp.push(Math.hypot(s[i].x - s[i - 1].x, s[i].z - s[i - 1].z) / dt); }
  const med = [...sp].sort((a, b) => a - b)[sp.length >> 1];
  let spikes = 0, dev = 0;
  for (let i = 0; i < sp.length; i++) {
    const w = sp.slice(Math.max(0, i - 7), i + 8), m = w.reduce((a, b) => a + b, 0) / w.length;
    dev += Math.abs(sp[i] - m) / Math.max(0.5, m);
    if (Math.abs(sp[i] - m) > 0.5 * Math.max(1, m)) spikes++;
  }
  const extrap = s.filter((p) => p.ahead > 0).length, held = s.filter((p) => p.ahead > 400).length;
  const secs = (s[s.length - 1].t - s[0].t) / 1000;
  return {
    label, frames: s.length, fps: +(s.length / secs).toFixed(1), speedMedian: +med.toFixed(2),
    bestDelayMs: best.L, rmsErrorM: +best.rms.toFixed(3), maxErrorM: +best.emax.toFixed(3),
    speedWobble: +(dev / sp.length).toFixed(3), spikes, extrapolatedFrames: extrap, heldFrames: held,
  };
}
const report = {
  code, relay: RELAY, secs: SECS,
  guestSawHost: judge(rb.seen, ra.own, 'the guest drawing the host'),
  hostSawGuest: judge(ra.seen, rb.own, 'the host drawing the guest'),
  clock: { samples: clocks.length, maxAbsS: +Math.max(...clocks.map(Math.abs)).toFixed(3), meanS: +(clocks.reduce((a, b) => a + b, 0) / clocks.length).toFixed(3), all: clocks.map((c) => +c.toFixed(3)) },
  rtt: { host: ra.stats.rtt, guest: rb.stats.rtt },
  lateMs: { atHost: ra.late, atGuest: rb.late },
  longTasks: { host: ra.long, guest: rb.long }, // the page's own hitches (tile building as you paddle, a busy machine) // each pose's arrival against the quickest one: the network's and the page's jitter
  stats: { host: ra.stats, guest: rb.stats },
};
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ guestSawHost: report.guestSawHost, hostSawGuest: report.hostSawGuest, clock: { ...report.clock, all: undefined }, rtt: report.rtt, lateMs: report.lateMs, longTasks: report.longTasks }, null, 2));

// --- the screenshot pair: each looking at the other, side by side on the water ------------------------------------------
// both back out in the basin (Sandbox jumps on the map), the guest beside the host, both still, then each camera looks past its own
// canoe at the other's
const hostAt = await A.evaluate(async () => { const g = window.__game, p = g.player; await p.teleport(-20900, 19400); g.chase.snap && g.chase.snap(); return { x: p.x, z: p.z, h: p.heading }; });
await B.evaluate(async (h) => { const g = window.__game; await g.player.teleport(h.x + Math.sin(h.h) * 12, h.z + Math.cos(h.h) * 12); g.chase.snap && g.chase.snap(); }, hostAt);
await sleep(3000);
const frame = () => {
  const g = window.__game, r = [...g.coop.remotes.values()][0];
  if (!r) return false;
  const me = g.player, ox = r.boat.ext ? r.boat.x : r.person.x, oz = r.boat.ext ? r.boat.z : r.person.z;
  const dx = ox - me.x, dz = oz - me.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  const T = g.THREE, level = g.world.levelAt(me.x, me.z);
  // over the shoulder: behind and above your own canoe, looking past it at theirs
  g.chase.focus = { pos: new T.Vector3(me.x - ux * 7 + uz * 2.5, level + 3.2, me.z - uz * 7 - ux * 2.5), look: new T.Vector3(ox, level + 0.6, oz) };
  return true;
};
log('framed', await Promise.all([A.evaluate(frame), B.evaluate(frame)]));
await sleep(1200);
await A.screenshot({ path: path.join(OUT, 'host-sees-guest.png') });
await B.screenshot({ path: path.join(OUT, 'guest-sees-host.png') });
log('screenshots in', OUT);
for (const b of browsers) await b.close();
