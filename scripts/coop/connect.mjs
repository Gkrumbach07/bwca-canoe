// Co-op phase 3, stream B's rig (src/coop-sky.js, coop.js's rejoin, actors.js's swimmer): two headless Chromiums (one
// browser process each, as two-browsers.mjs) through `wrangler dev` with 100 ms added, which this script starts itself
// (so it can stop and start the relay). The host opens a Sandbox trip on Lake One with a weather seed of its own; the
// guest joins by the link. Then:
//   1. the wind on both screens, once a second for 30 s: speed, the gust and the bearing within a small tolerance
//   2. the same weather at the same clock (the state, cloud, rain, temperature), at an hour the host's seed rains
//   3. the host capsizes: drawn swimming on the guest's screen (the figure posed swimming, the hull upside down), shots
//   4. the guest's socket killed: back in by itself, the friends drawn again, no duplicate things on either side
//   5. the relay stopped and started: both back in by themselves
//   6. the room lost for good (as after RETRY_FOR): the choice on the pause card; Rejoin from it
//   7. the guest reloads: Rejoin <host>'s trip on the title, back in with the same things and purse
//   8. the host reloads and continues: the trip open again with the same code, the guests resume without a reload
//
//   npx vite --port 5297
//   node scripts/coop/connect.mjs [--out dir]      APP=http://localhost:5297  RELAY_PORT=8797
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5297';
const PORT = Number(process.env.RELAY_PORT || 8797);
const RELAY = `ws://localhost:${PORT}`;
const OUT = path.resolve(arg('out', 'coop-connect-out'));
const ROOM_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../server/room');
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
const check = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(detail)); };

// --- the relay, ours to stop and start (its own process group, killed whole) -----------------------------------------
let relay = null;
async function relayUp() {
  relay = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--var', 'DELAY_MS:100'], { cwd: ROOM_DIR, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  relay.stdout.resume(); relay.stderr.resume();
  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) { await sleep(250); try { ready = (await fetch(`http://localhost:${PORT}/`)).ok; } catch { ready = false; } }
  await sleep(500);
  log('relay up', ready, relay.pid);
}
function relayDown() { if (relay) { try { process.kill(-relay.pid, 'SIGKILL'); } catch { /* gone */ } relay = null; } }
process.on('exit', relayDown);

async function browserCtx(name) {
  const browser = await launch(); browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  return { ctx, name };
}
function watch(page, name) {
  page.on('pageerror', (e) => log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /coop/i.test(m.text())) log(`[${name}] ${m.type()}`, m.text().slice(0, 300)); });
}
const loaded = (page) => page.waitForFunction(() => window.__game && window.__game.coop && window.__game.title && window.__game.coopSky && window.__game.coopGive, null, { timeout: 240000, polling: 500 });
async function openGame(b, query = '') {
  const page = await b.ctx.newPage();
  watch(page, b.name);
  await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${query}`, { timeout: 240000, waitUntil: 'domcontentloaded' });
  await loaded(page);
  log(`[${b.name}] game loaded`);
  return page;
}
// a close look: the part of the page round the friend's name tag (their figure is under it)
const near = async (page, name) => { const r = await page.evaluate(() => { const t = [...document.querySelectorAll('#coop-names .tag')].find((e) => !e.hidden); if (!t) return null; const b = t.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height }; }); if (!r) return; const x = Math.max(0, Math.min(1280 - 480, r.x - 240)), y = Math.max(0, Math.min(800 - 320, r.y - 40)); await page.screenshot({ path: path.join(OUT, name), clip: { x, y, width: 480, height: 320 } }); };
const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
const invSig = () => { const s = window.__game.inventory.serialize(); return JSON.stringify({ c: s.containers.map((c) => [c.id, c.item, c.where, (c.items || []).length]), l: s.long.map((l) => [l.id, l.item, l.where]) }); };
const peerState = () => { const c = window.__game.coop; return { live: c.live, status: c.status, id: c.id, remotes: [...c.remotes.values()].map((r) => ({ id: r.id, name: r.name, host: r.host, stale: r.stale, drawn: !!r.drawnAt })), friends: window.__game.coopShare ? window.__game.coopShare.friends.size : null }; };
// both in and drawing each other (fresh poses, not held)
const bothIn = async (A, B, timeout = 60000) => {
  const t0 = Date.now();
  const ok = (p) => p.evaluate(() => { const c = window.__game.coop; const rs = [...c.remotes.values()]; return c.live && c.relay.state === 'open' && rs.length === 1 && rs.every((r) => r.drawnAt && !r.stale); });
  while (Date.now() - t0 < timeout) { if ((await ok(A)) && (await ok(B))) return (Date.now() - t0) / 1000; await sleep(100); }
  return null;
};

await relayUp();

// --- the host: a Sandbox season on Lake One, in the canoe, a weather seed of its own, the trip opened -------------------
const HB = await browserCtx('host');
let A = await openGame(HB);
await A.evaluate(async () => {
  const g = window.__game, t = g.title;
  const ep = g.world.entryPoints.find((e) => e.name === 'Lake One') || g.world.entryPoints[0];
  t.setPick('sandbox');
  await t.newSeason(ep, { confirm: false });
});
await until(A, () => window.__game.title.state === 'game' && !window.__game.player.teleporting);
await sleep(1500);
// an hour that rains under seed 77 and not under 23 (the guest's own), on a July afternoon
const when = await A.evaluate(async () => {
  const g = window.__game, W = g.weather;
  const at = (seed, doy, h) => { W.setSeed(seed); return W._hour(2026, (doy - 1) * 24 + h).s; };
  let pick = null;
  for (let doy = 185; doy < 230 && !pick; doy++) for (let h = 11; h < 17 && !pick; h++) if ([4, 5].includes(at(77, doy, h)) && [4, 5].includes(at(77, doy, h + 1)) && ![4, 5].includes(at(23, doy, h))) pick = { doy, hours: h + 0.3, s77: at(77, doy, h), s23: at(23, doy, h) };
  W.setSeed(77);
  g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide();
  await g.player.teleport(-20900, 19400); // Lake One's main basin
  g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide();
  g.day.setClock(2026, pick ? pick.doy : 200, pick ? pick.hours : 14.3); g.day.running = true;
  return pick;
});
log('[host] the hour', when);
const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
log('[host] code', code);

// --- the guest: by the link, through the join card ----------------------------------------------------------------------
const GB = await browserCtx('guest');
let B = await openGame(GB, `&join=${code}`);
await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
await B.fill('#coop-name', 'Ada');
await B.click('.coop-card .swatch[data-shirt="4"]');
await B.click('#coop-go');
await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
await until(B, () => window.__game.coopGive.mine && window.__game.coopSky.got > 2, null, 30000);
log('both in', await bothIn(A, B));

// --- 1. the wind: every frame on both screens for 30 s, compared at the same wall times ------------------------------
const recWind = () => { const g = window.__game; window.__wrec = []; const f = () => { const w = g.wind; window.__wrec.push([performance.timeOrigin + performance.now(), w.speed, w.gustSpeed, w.from, w.puff, w.follow ? 1 : 0]); window.__wraf = requestAnimationFrame(f); }; f(); };
const stopWind = () => { cancelAnimationFrame(window.__wraf); return window.__wrec; };
await Promise.all([A.evaluate(recWind), B.evaluate(recWind)]);
await sleep(30000);
const [wa, wb] = await Promise.all([A.evaluate(stopWind), B.evaluate(stopWind)]);
const wind = [];
for (const h of wa) {
  if (h[0] < wb[0][0] + 500 || h[0] > wb[wb.length - 1][0] - 500) continue;
  let j = 1; while (j < wb.length - 1 && wb[j][0] < h[0]) j++;
  const p0 = wb[j - 1], p1 = wb[j], k = (h[0] - p0[0]) / Math.max(1, p1[0] - p0[0]), at = (i) => p0[i] + (p1[i] - p0[i]) * k;
  wind.push({ dsp: at(1) - h[1], dgust: at(2) - h[2], dfrom: ((p0[3] - h[3] + 540) % 360) - 180, sp: h[1], puff: h[4], follow: p0[5] });
}
const q = (k, f) => { const v = wind.map((w) => Math.abs(w[k])).sort((x, y) => x - y); return +v[Math.min(v.length - 1, Math.floor(v.length * f))].toFixed(3); };
const windSum = { frames: [wa.length, wb.length], compared: wind.length, speed: [Math.min(...wind.map((w) => w.sp)), Math.max(...wind.map((w) => w.sp))].map((v) => +v.toFixed(2)), puffFrames: wind.filter((w) => w.puff > 0.01).length,
  dSpeed: { p95: q('dsp', 0.95), max: q('dsp', 1) }, dGust: { med: q('dgust', 0.5), p95: q('dgust', 0.95), max: q('dgust', 1) }, dFrom: { p95: q('dfrom', 0.95), max: q('dfrom', 1) } };
check('1. the wind on both screens, every frame for 30 s: speed within 0.3 m/s, the gust 0.3 (95 %), the bearing 3°', wind.every((w) => w.follow) && windSum.dSpeed.max < 0.3 && windSum.dGust.p95 < 0.3 && windSum.dFrom.max < 3, windSum);

// --- 2. the same weather at the same clock ------------------------------------------------------------------------------
const skyNow = () => { const W = window.__game.weather, L = W.look, d = window.__game.day; return { seed: W.seed, doy: d.doy, hours: +d.hours.toFixed(4), state: W.state, label: W.label, cover: +L.cover.toFixed(3), deck: +L.deck.toFixed(3), rain: +L.rain.toFixed(3), fog: +L.fog.toFixed(3), temp: +L.temp.toFixed(2), next: W.forecast(12).map((f) => f.label || f.state || JSON.stringify(f)).join(' / ') }; };
const skies = [];
for (let i = 0; i < 5; i++) { const [a, b] = await Promise.all([A.evaluate(skyNow), B.evaluate(skyNow)]); skies.push({ a, b }); await sleep(1000); }
const sameSky = skies.every(({ a, b }) => a.seed === b.seed && a.state === b.state && a.doy === b.doy && Math.abs(a.cover - b.cover) < 0.01 && Math.abs(a.deck - b.deck) < 0.01 && Math.abs(a.rain - b.rain) < 0.01 && Math.abs(a.temp - b.temp) < 0.05 && a.next === b.next);
check('2. the same weather at the same clock (seed 77, the host\'s; the guest\'s own is 23)', sameSky && skies[0].a.rain > 0, { host: skies[0].a, guest: skies[0].b, when });
await B.screenshot({ path: path.join(OUT, 'guest-rain-host-seed.png') });
if (process.env.PROBE) log('probe', JSON.stringify(await B.evaluate(() => { const g = window.__game, p = g.player, out = [], v = new (g.camera.position.constructor)(); g.scene.traverse((o) => { if (!o.isMesh || !o.visible) return; o.getWorldPosition(v); const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < 20) { const chain = []; let q = o; while (q && chain.length < 6) { chain.push(q.name || q.type); q = q.parent; } out.push({ d: +d.toFixed(1), y: +v.y.toFixed(2), chain: chain.join('<'), geo: o.geometry && o.geometry.type, n: o.geometry && o.geometry.attributes.position.count }); } }); return out; })));

// --- 3. the host capsizes: drawn swimming on the guest's screen ------------------------------------------------------------
const hp = await A.evaluate(() => { const p = window.__game.player; return { x: p.x, z: p.z, h: p.heading }; });
await B.evaluate(async (h) => { const g = window.__game; await g.player.teleport(h.x + Math.sin(h.h) * 8, h.z + Math.cos(h.h) * 8); for (let i = 0; i < 3; i++) g.step(1 / 60, 1); }, hp);
// --- 3a. the rod up and a cast, afloat: the friend's rod in their hands ------------------------------------------------
await A.evaluate(() => window.__game.fishing.raise());
await A.keyboard.down('Space'); await sleep(900);
const rodMid = await B.evaluate(() => { const g = window.__game, r = [...g.coop.remotes.values()][0], P = r.person; return { fz: !!(P.anim && P.anim.fz), crewFishing: !!(P.state && P.state.fishing), rods: g.coopAnim.stats().rods }; });
const look0 = await B.evaluate(() => { const g = window.__game, p = g.player, r = [...g.coop.remotes.values()][0], ch = g.chase; p.x = r.boat.x + Math.sin(r.boat.heading) * 4.5; p.z = r.boat.z + Math.cos(r.boat.heading) * 4.5; p.heading = Math.atan2(-(r.boat.z - p.z), r.boat.x - p.x); p.speed = 0; if (ch.snap) ch.snap(); for (let i = 0; i < 20; i++) g.step(1 / 60, 1); return Math.hypot(r.boat.x - p.x, r.boat.z - p.z); });
await B.screenshot({ path: path.join(OUT, 'guest-sees-host-loading-a-cast.png') }); await near(B, 'close-cast.png');
await A.keyboard.up('Space'); await sleep(600);
const rodAfter = await B.evaluate(() => { const g = window.__game; return g.coopAnim.stats(); });
const hostCast = await A.evaluate(() => ({ state: window.__game.fishing.state, sent: window.__game.coopAnim.sent }));
check('3a. a cast: the host\'s rod up and loading drawn in their hands on the guest\'s screen', rodMid.fz && rodMid.crewFishing && rodMid.rods.some((r) => r.visible && r.inScene), { rodMid, rodAfter, hostCast, dist: look0 });
await A.evaluate(() => window.__game.fishing.stow());
await sleep(800);

// --- 3. the host capsizes ------------------------------------------------------------------------------------------------
const cap = await A.evaluate(() => { const p = window.__game.player; p.capsize(); for (let i = 0; i < 3; i++) window.__game.step(1 / 60, 1); return p.mode; });
await until(B, () => { const r = [...window.__game.coop.remotes.values()][0]; return r && r.drawnAt && r.drawnAt.m === 'swim'; }, null, 10000).catch(() => log('the guest never saw swim; host mode', cap));
await sleep(1500);
const look = async () => B.evaluate(() => {
  const g = window.__game, p = g.player, r = [...g.coop.remotes.values()][0], ch = g.chase;
  p.heading = Math.atan2(-(r.person.z - p.z), r.person.x - p.x); p.speed = 0; if (ch.snap) ch.snap(); // (the canoe's chase looks along the bow)
  for (let i = 0; i < 20; i++) g.step(1 / 60, 1);
  return { mode: r.person.mode, drawn: !!r.person.bind, swimN: r.person.swimN || 0, y: +r.person.y.toFixed(2), level: +g.world.levelAt(r.person.x, r.person.z).toFixed(2), over: !!r.boat.over, boatHidden: r.boat.hidden, dist: +Math.hypot(r.person.x - p.x, r.person.z - p.z).toFixed(1), hostMode: r.drawnAt && r.drawnAt.m };
});
const sw0 = await look();
await sleep(1500);
const sw1 = await look();
await B.screenshot({ path: path.join(OUT, 'guest-sees-host-treading-water.png') });
// and swimming (W held on the host)
await A.keyboard.down('KeyW'); await sleep(2500);
const sw2 = await look();
await B.screenshot({ path: path.join(OUT, 'guest-sees-host-swimming.png') }); await near(B, 'close-swimming.png');
await A.keyboard.up('KeyW');
const bodyOf = () => { const r = [...window.__game.coop.remotes.values()][0], B = r.person.bind; if (!B) return null; const b = B.body.fig.bones, v = (o) => { const q = o.getWorldPosition(new o.position.constructor()); return [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]; }; return { head: v(b.head), pelvis: v(b.pelvis || b.hips || b.head) }; };
const bones = await B.evaluate(bodyOf);
check('3. the host drawn swimming on the guest\'s screen (posed swimming, at the water, the hull upside down)', sw1.mode === 'swim' && sw1.drawn && sw2.swimN > sw0.swimN && sw1.over && Math.abs(sw1.y - sw1.level) < 0.3 && bones && bones.head[1] - sw1.level < 0.6, { sw0, sw1, sw2, bones });
await A.screenshot({ path: path.join(OUT, 'host-own-swim.png') });
if (process.env.SWIM_ONLY) { for (const b of browsers) await b.close(); relayDown(); process.exit(0); }
// back in the canoe for the rest (the host climbs in: E beside the hull)
await A.evaluate(() => { const g = window.__game, p = g.player; const h = p.swim && p.swim.hull; if (h) { p.swim = null; p.mode = 'paddle'; p.x = h.cx; p.z = h.cz; const st = g.canoe.state; st.mode = 'paddle'; st.swimHull = false; } for (let i = 0; i < 5; i++) g.step(1 / 60, 1); });
await sleep(1500);

// --- 3b. ashore: a jump, a crouch, a seat -------------------------------------------------------------------------------
await A.evaluate(async () => { const g = window.__game, p = g.player; await p.teleport(-20900, 19400); for (let i = 0; i < 3; i++) g.step(1 / 60, 1); p.stepOut(); for (let i = 0; i < 5; i++) g.step(1 / 60, 1); });
const hp2 = await A.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z, h: window.__game.player.heading, mode: window.__game.player.mode }));
await B.evaluate(async (h) => {
  const g = window.__game, p = g.player;
  await p.teleport(h.x, h.z); for (let i = 0; i < 3; i++) g.step(1 / 60, 1);
  p.stepOut(); for (let i = 0; i < 3; i++) g.step(1 / 60, 1);
  p.x = h.x - Math.cos(h.h) * 3.5; p.z = h.z + Math.sin(h.h) * 3.5; p.placeOnGround(); g.step(1 / 60, 2);
}, hp2);
await sleep(2500);
const faceHost = () => { const g = window.__game, p = g.player, r = [...g.coop.remotes.values()][0], ch = g.chase; ch.viewYaw = Math.atan2(-(r.person.z - p.z), r.person.x - p.x) + 0.3; ch.forwardYaw = ch.viewYaw; ch.viewPitch = -0.1; /* (a little to the side: our own figure not in the way) */ for (let i = 0; i < 10; i++) g.step(1 / 60, 1); return { mode: r.person.mode, dist: +Math.hypot(r.person.x - p.x, r.person.z - p.z).toFixed(1) }; };
log('ashore', hp2, await B.evaluate(faceHost));
// the jump: the friend's figure leaves the ground (its frame over the ground, every frame on the guest)
await B.evaluate(() => { const g = window.__game, r = [...g.coop.remotes.values()][0]; window.__jy = 0; window.__jn0 = r.person.airN || 0; const f = () => { const P = r.person, B = P.bind; if (B) window.__jy = Math.max(window.__jy, B.root.position.y - 0.1 - P.y); window.__jraf = requestAnimationFrame(f); }; f(); });
await A.keyboard.press('Space');
await sleep(250);
await B.screenshot({ path: path.join(OUT, 'guest-sees-host-jump.png') }); await near(B, 'close-jump.png');
await sleep(1500);
const jump = await B.evaluate(() => { cancelAnimationFrame(window.__jraf); const r = [...window.__game.coop.remotes.values()][0]; return { peak: +window.__jy.toFixed(3), airFrames: (r.person.airN || 0) - window.__jn0 }; });
const hostPeak = await A.evaluate(() => window.__game.player.foot && +(window.__game.player.foot.peak - window.__game.player.groundAt(window.__game.player.x, window.__game.player.z)).toFixed(3));
check('3b. a jump seen as a jump: the friend\'s figure leaves the ground', jump.peak > 0.15 && jump.airFrames > 5, { guestSees: jump, hostPeak });
// a crouch (a low chore: camp.js sets the state's crouch)
await A.evaluate(() => { Object.defineProperty(window.__game.canoe.state, 'crouch', { get: () => 1, set() {}, configurable: true }); }); // (held down, as a low chore holds it: camp.js sets it each frame)
await sleep(1200);
const crouch = await B.evaluate(() => { const r = [...window.__game.coop.remotes.values()][0]; return { crouch: r.person.anim && r.person.anim.crouch, st: r.person.state.crouch }; });
await A.evaluate(() => { const st = window.__game.canoe.state; delete st.crouch; st.crouch = 0; });
check('3c. a crouch seen as a crouch', crouch.crouch > 0.5, crouch);
// a seat (a stump in front of the host, sat on facing the guest)
const sat = await A.evaluate(() => { const g = window.__game, p = g.player, fx = Math.cos(p.heading), fz = -Math.sin(p.heading); return p.sitAt({ x: p.x + fx * 0.6, z: p.z + fz * 0.6, heading: p.heading + Math.PI, kind: 'stump' }); });
await sleep(4000);
const headOver = () => { const r = [...window.__game.coop.remotes.values()][0], P = r.person, B = P.bind; if (!B) return null; const v = B.body.fig.bones.head.getWorldPosition(new window.__game.THREE.Vector3()); return +(v.y - window.__game.player.groundAt(P.x, P.z)).toFixed(2); }; // (over the terrain: P.y is the feet's height as sent, a seat's while sitting)
const sit = await B.evaluate((f) => { const r = [...window.__game.coop.remotes.values()][0]; const B = r.person.bind, hip = B ? B.body.fig.bones.root.getWorldPosition(new window.__game.THREE.Vector3()).y : NaN; return { sit: r.person.anim && r.person.anim.sit, sitN: r.person.sitN || 0, headOverGround: (0, eval)(f)(), hipsOverSeat: +(hip - (r.person.anim ? r.person.anim.sit : NaN)).toFixed(2) }; }, headOver.toString());
const hostSeat = await A.evaluate(() => { const p = window.__game.player; return { phase: p.seat && p.seat.phase, kind: p.move.kind, top: p.move.top }; });
await B.evaluate(faceHost);
await B.screenshot({ path: path.join(OUT, 'guest-sees-host-sitting.png') }); await near(B, 'close-sitting.png');
await A.evaluate(() => window.__game.player.stand());
await sleep(2500);
const standHead = await B.evaluate((f) => (0, eval)(f)(), headOver.toString());
check('3d. a seat: the friend drawn sitting (the head lower than standing)', sat && Number.isFinite(sit.sit) && sit.sitN > 10 && sit.headOverGround < standHead - 0.15 && Math.abs(sit.hipsOverSeat) < 0.3, { sit, standHead, hostSeat });
await A.evaluate(async () => { const g = window.__game; await g.player.teleport(-20900, 19400); for (let i = 0; i < 5; i++) g.step(1 / 60, 1); });
await sleep(1000);

// --- 4. the guest's socket killed --------------------------------------------------------------------------------------
const before4 = { gInv: await B.evaluate(invSig), gMoney: await B.evaluate(() => window.__game.profile.money), hFriends: await A.evaluate(() => window.__game.coopShare.friends.size) };
const t4 = Date.now();
await B.evaluate(() => window.__game.coop.relay.ws.close());
await sleep(300);
const back4 = await bothIn(A, B, 30000);
await until(A, (n) => window.__game.coopShare.friends.size === n, before4.hFriends, 10000).catch(() => null); // (the guest's things again: their pub on the new id)
const after4 = { g: await B.evaluate(peerState), h: await A.evaluate(peerState), gInv: await B.evaluate(invSig), gMoney: await B.evaluate(() => window.__game.profile.money), mine: await B.evaluate(() => window.__game.coopGive.mine) };
check('4. the guest\'s socket dropped: back in by itself, friends drawn, no duplicates', back4 != null && after4.h.remotes.length === 1 && after4.g.remotes.length === 1 && after4.h.friends === before4.hFriends && after4.gInv === before4.gInv && after4.gMoney === before4.gMoney && after4.mine, { backInS: back4 && +(back4 + 0.3).toFixed(1), totalS: (Date.now() - t4) / 1000, host: after4.h, guest: after4.g });

// --- 5. the relay stopped and started -----------------------------------------------------------------------------------
relayDown();
await sleep(3000);
const down5 = { g: await B.evaluate(peerState), h: await A.evaluate(peerState) };
const t5 = Date.now();
await relayUp();
const back5 = await bothIn(A, B, 90000);
const after5 = { g: await B.evaluate(peerState), h: await A.evaluate(peerState), gInv: await B.evaluate(invSig), code: await A.evaluate(() => window.__game.coop.code) };
check('5. the relay stopped 3 s and started: both back in by themselves', back5 != null && after5.code === code && after5.gInv === before4.gInv && after5.h.remotes.length === 1, { downWhile: { g: down5.g.status, h: down5.h.status }, backInSAfterRelayUp: back5, sinceStart: (Date.now() - t5) / 1000, host: after5.h, guest: after5.g });

// --- 6. the room lost for good: the choice ------------------------------------------------------------------------------
await B.evaluate(() => { const c = window.__game.coop; c.relay.close(); c.lost('lost'); });
await sleep(800);
const card6 = await B.evaluate(() => { const c = document.getElementById('coop-card'); return { state: window.__game.title.state, shown: !!c && !c.hidden, text: c ? c.innerText.replace(/\s+/g, ' ').trim() : '', go: !!document.getElementById('coop-go'), home: !!document.getElementById('coop-home'), item: document.getElementById('btn-invite').textContent }; });
await B.screenshot({ path: path.join(OUT, 'guest-lost-choice.png') });
await B.click('#coop-go');
const back6 = await bothIn(A, B, 30000);
const after6 = { g: await B.evaluate(peerState), h: await A.evaluate(peerState), gInv: await B.evaluate(invSig), title: await B.evaluate(() => window.__game.title.state) };
check('6. lost for good: Rejoin / Back to my own season on the pause card; Rejoin works', card6.shown && card6.go && card6.home && back6 != null && after6.gInv === before4.gInv && after6.h.remotes.length === 1 && after6.title === 'game', { card6, backInS: back6, host: after6.h });

// --- 7. the guest reloads: Rejoin on the title --------------------------------------------------------------------------
await B.evaluate(() => window.__game.profile.earn(7, 'test')); // a change since the last keep, kept by pagehide
await sleep(500);
const before7 = { inv: await B.evaluate(invSig), money: await B.evaluate(() => window.__game.profile.money) };
await B.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}`, { timeout: 240000, waitUntil: 'domcontentloaded' }); // (the plain page: the link's ?join is not what brings them back)
await loaded(B);
await sleep(1500);
const title7 = await B.evaluate(() => { const b = document.getElementById('btn-rejoin'), li = b && b.closest('li'); return { state: window.__game.title.state, shown: !!li && !li.hidden, text: b && b.textContent, hint: b && b.parentElement.querySelector('.hint').textContent, role: window.__game.coop.role }; });
await B.screenshot({ path: path.join(OUT, 'guest-title-rejoin.png') });
await B.click('#btn-rejoin');
await until(B, () => document.getElementById('coop-go'));
await B.click('#coop-go');
await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && window.__game.coopGive.mine, null, 120000);
const back7 = await bothIn(A, B, 30000);
const after7 = { inv: await B.evaluate(invSig), money: await B.evaluate(() => window.__game.profile.money), h: await A.evaluate(peerState) };
check('7. the guest reloads: Rejoin Gage’s trip on the title, back with the same things and purse', title7.shown && /Gage/.test(title7.text) && back7 != null && after7.inv === before7.inv && after7.money === before7.money && after7.h.remotes.length === 1 && after7.h.friends === 1, { title7, money: [before7.money, after7.money], sameThings: after7.inv === before7.inv, host: after7.h });

// --- 8. the host reloads and continues ------------------------------------------------------------------------------------
await B.evaluate(() => { window.__mark = 'no reload'; });
const clk8 = await B.evaluate(() => window.__game.coop.clockSnaps);
await A.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}`, { timeout: 240000, waitUntil: 'domcontentloaded' });
await loaded(A);
await sleep(1000);
const gWhile = await B.evaluate(peerState);
await A.evaluate(() => window.__game.title.continueTrip());
await until(A, () => window.__game.coop.role === 'host', null, 60000);
const back8 = await bothIn(A, B, 60000);
await sleep(3000);
const after8 = { code: await A.evaluate(() => window.__game.coop.code), mark: await B.evaluate(() => window.__mark), g: await B.evaluate(peerState), sky: await B.evaluate(() => window.__game.coopSky.stats()), clockErr: await B.evaluate(() => window.__game.coop.clockErr), clockSnaps: await B.evaluate(() => window.__game.coop.clockSnaps) };
check('8. the host reloads: the same code, the guest resumes without a reload (poses, clock, wind)', after8.code === code && after8.mark === 'no reload' && back8 != null && after8.g.remotes.length === 1 && after8.g.remotes[0].host && after8.sky.follow && Math.abs(after8.clockErr) < 0.5, { code: after8.code, guestWhileHostAway: gWhile.remotes.length, backInS: back8, clockErr: after8.clockErr, clockSnaps: [clk8, after8.clockSnaps], sky: after8.sky });

writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, wind, skies }, null, 2));
log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
for (const b of browsers) await b.close();
relayDown();
process.exit(results.every((r) => r.pass) ? 0 : 1);
