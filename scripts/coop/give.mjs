// Co-op phase 2, stream B's rig (src/coop-give.js): two headless Chromiums (one browser process each, as
// two-browsers.mjs) through `wrangler dev` with a delay. The host opens a Sandbox trip; the guest, who has a season of
// their own, joins; both step ashore side by side. Then: the Give money panel lets go of the mouse (and the chase wants it
// back after), the guest gives the host $10, a refused gift and one lost on the way come back, a lost ack is asked after
// and not refunded (no duplicate), there is no "Give to" for things (the owner: drop it, the friend picks it up), each
// sees the other on the map where they are, the guest gives money from the canoe alongside, the host's keep is pruned,
// the guest changes their things, leaves and joins again from a new
// page and gets the same things and purse back from the host, and the guest's own season in their store is byte for
// byte what it was before the visit.
//
//   cd server/room && npx wrangler dev --port 8794 --var DELAY_MS:100
//   npx vite --port 5294
//   node scripts/coop/give.mjs [--out dir]      APP=http://localhost:5294  RELAY=ws://localhost:8794
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5294';
const RELAY = process.env.RELAY || 'ws://localhost:8794';
const OUT = path.resolve(arg('out', 'coop-give-out'));
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

async function browserCtx(name) {
  const browser = await launch(); browsers.push(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  return { ctx, name };
}
async function openGame(b, query = '') {
  const page = await b.ctx.newPage();
  page.on('pageerror', (e) => log(`[${b.name}] pageerror`, e.message));
  page.on('console', (m) => { if (m.type() === 'error' || /coop/i.test(m.text())) log(`[${b.name}] ${m.type()}`, m.text().slice(0, 300)); });
  await page.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}${query}`);
  await page.waitForFunction(() => window.__game && window.__game.coop && window.__game.title && window.__game.coopGive && typeof window.__game.step === 'function', null, { timeout: 240000, polling: 500 });
  log(`[${b.name}] game loaded`);
  return page;
}
const until = (page, fn, a, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 200 });
// every key in the store (IndexedDB), as stored
const dump = () => new Promise((res, rej) => {
  const r = indexedDB.open('bwca-canoe-store', 1);
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const db = r.result, tx = db.transaction('kv', 'readonly'), os = tx.objectStore('kv'), out = {};
    const c = os.openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = typeof cur.value === 'string' ? cur.value : JSON.stringify(cur.value); cur.continue(); } else { db.close(); res(out); } };
    c.onerror = () => rej(c.error);
  };
});
const season = (d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'bwca-canoe:visitor').sort(([a], [b]) => (a < b ? -1 : 1)));
// on foot on the shore nearest where you are (the nose-in's step out)
const ashore = async () => { const g = window.__game, p = g.player; p.stepOut(); for (let i = 0; i < 5; i++) g.step(1 / 60, 1); return { mode: p.mode, x: p.x, z: p.z }; };
const invSig = () => { const s = window.__game.inventory.serialize(); return JSON.stringify({ c: s.containers.map((c) => ({ ...c, at: c.at ? { x: Math.round(c.at.x), z: Math.round(c.at.z) } : null })), l: s.long.map((l) => ({ ...l, at: l.at ? { x: Math.round(l.at.x), z: Math.round(l.at.z) } : null })) }); };
const count = (id) => window.__game.inventory.count(id, { reachable: false });

// --- the host: a Sandbox season on Lake One, ashore, the trip opened ---------------------------------------------------
const HB = await browserCtx('host');
const A = await openGame(HB);
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
  await g.player.teleport(-20900, 19400);
  g.outfitter.arrival = null; if (g.outfitter.open) g.outfitter.hide();
  g.day.setClock(2026, 190, 10.5); g.day.running = true;
});
await sleep(1000);
log('[host] ashore', await A.evaluate(ashore));
const code = await A.evaluate(() => window.__game.coop.invite({ name: 'Gage', shirt: 2 }));
log('[host] code', code);

// --- the guest: a season of their own first (Adventure at another entry point), saved ---------------------------------
const GB = await browserCtx('guest');
let B = await openGame(GB);
await B.evaluate(async () => {
  const g = window.__game, t = g.title;
  const ep = g.world.entryPoints.find((e) => e.name === 'Sawbill Lake') || g.world.entryPoints[3];
  t.setPick('adventure');
  await t.newSeason(ep, { confirm: false });
});
await until(B, () => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
await sleep(4000);
const own0 = await B.evaluate(() => ({ money: window.__game.profile.money, sig: window.__game.profile.seasonId }));
await B.evaluate(() => window.__game.saver && window.__game.saver.write && window.__game.saver.write());
await sleep(1500);
await B.close();

// the join link in a new page of the same browser (the guest's store as their own season left it)
B = await openGame(GB, `&join=${code}`);
await sleep(1500);
const before = season(await B.evaluate(dump));
log('[guest] own season keys', Object.keys(before).length, own0);
await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
await B.fill('#coop-name', 'Ada');
await B.click('.coop-card .swatch[data-shirt="4"]');
await B.click('#coop-go');
await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
await until(B, () => window.__game.coopGive.mine, null, 20000);
const visit0 = await B.evaluate(() => ({ money: window.__game.profile.money, ledger: window.__game.profile.ledger.slice(-2), packs: window.__game.inventory.containers.filter((c) => c.where === 'canoe').map((c) => c.item) }));
check('first visit: the starter kit and $40', visit0.money === 40 && visit0.packs.length > 0, visit0);

// both ashore, side by side
const hp = await A.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z, h: window.__game.player.heading }));
await B.evaluate(async (h) => {
  const g = window.__game, p = g.player;
  await p.teleport(h.x, h.z); for (let i = 0; i < 3; i++) g.step(1 / 60, 1);
  p.stepOut(); for (let i = 0; i < 3; i++) g.step(1 / 60, 1);
  p.x = h.x + Math.cos(h.h) * 1.6; p.z = h.z - Math.sin(h.h) * 1.6; p.placeOnGround(); g.step(1 / 60, 2);
}, hp);
await sleep(2500);
const dist = await A.evaluate(() => { const r = [...window.__game.coop.remotes.values()][0]; return r ? { d: Math.hypot(r.person.x - window.__game.player.x, r.person.z - window.__game.player.z), m: r.drawnAt && r.drawnAt.m } : null; });
const guestSees = await B.evaluate(() => window.__game.coop.peers().map((p) => ({ name: p.name, near: p.near(3) })));
log('distance host→guest', dist, 'guest sees', guestSees);
const hostId = await B.evaluate(() => window.__game.coop.peers().find((p) => p.host).id);
const guestId = await A.evaluate(() => window.__game.coop.peers()[0].id);

// --- 1. the Give money picker on the guest's screen (the dot's E on the host, else opened as E would) ---------------------
const dot = await B.evaluate(async () => {
  const g = window.__game, p = g.player, r = [...g.coop.remotes.values()][0], ch = g.chase;
  ch.viewYaw = Math.atan2(-(r.person.z - p.z), r.person.x - p.x); ch.forwardYaw = ch.viewYaw; ch.viewPitch = -0.05;
  for (let i = 0; i < 20; i++) g.step(1 / 60, 1);
  const t = g.coopGive.pointer && g.coopGive.pointer.target;
  return t ? { kind: t.kind, label: t.label, verb: t.e && t.e.verb } : null;
});
log('[guest] the dot', dot);
// the mouse locked to the look as in play (a headless page has no real lock: the chase is told it has one, and
// document.exitPointerLock is watched)
const lock0 = await B.evaluate(() => {
  const g = window.__game, ch = g.chase;
  window.__exits = 0; document.exitPointerLock = () => { window.__exits++; ch.locked = false; };
  ch.locked = true; g.step(1 / 60, 2);
  return { wants: ch.wantsLock, locked: ch.locked, exits: window.__exits };
});
const opened = await B.evaluate((id) => window.__game.coopGive.moneyCard(id), hostId);
const lock1 = await B.evaluate(() => { const g = window.__game, ch = g.chase; ch.locked = true; for (let i = 0; i < 4; i++) g.step(1 / 60, 1); return { wants: ch.wantsLock, locked: ch.locked, exits: window.__exits, focus: !!ch.focus }; });
await sleep(800);
await B.screenshot({ path: path.join(OUT, 'give-money-picker.png') });
const picker = await B.evaluate(() => [...document.querySelectorAll('.opts .opt')].map((o) => ({ text: o.textContent, dim: o.classList.contains('dim') })));
check('the Give money picker', opened && picker.length === 5, { dot, picker });
const lock2 = await B.evaluate(() => { const g = window.__game; g.dialogue.close(); for (let i = 0; i < 4; i++) g.step(1 / 60, 1); return { wants: g.chase.wantsLock }; });
check('the Give money panel lets go of the mouse, and wants it back after', lock0.wants && lock0.exits === 0 && lock1.exits >= 1 && !lock1.locked && !lock1.wants && lock2.wants, { before: lock0, panelOpen: lock1, closed: lock2 });
await B.evaluate((id) => window.__game.coopGive.moneyCard(id), hostId);
await B.evaluate(() => { for (let i = 0; i < 3; i++) window.__game.step(1 / 60, 1); });

// --- 2. the guest gives the host $10 (through the picker: the second choice) ---------------------------------------------
const m0 = { host: await A.evaluate(() => window.__game.profile.money), guest: await B.evaluate(() => window.__game.profile.money) };
await B.evaluate(() => window.__game.dialogue.choose(1));
await until(B, () => window.__game.coopGive.pending.size === 0, null, 8000);
await sleep(300);
const m1 = { host: await A.evaluate(() => ({ money: window.__game.profile.money, last: window.__game.profile.ledger.slice(-1)[0] })), guest: await B.evaluate(() => ({ money: window.__game.profile.money, last: window.__game.profile.ledger.slice(-1)[0] })) };
check('guest gives host $10', m1.host.money === m0.host + 10 && m1.guest.money === m0.guest - 10 && /from Ada/.test(m1.host.last.why) && /to Gage/.test(m1.guest.last.why), { before: m0, after: m1 });

// --- 3. no "Give to" on things: the book's menu has no co-op verb at all ------------------------------------------------
const noVerb = await A.evaluate(() => ({ hook: typeof window.__game.inventory.moreVerbs, item: typeof window.__game.coopGive.item, thing: typeof window.__game.coopGive.thing }));
check('no Give to … for things (drop it, the friend picks it up)', noVerb.hook === 'undefined' && noVerb.item === 'undefined' && noVerb.thing === 'undefined', noVerb);

// --- 4. a refused gift and an unanswered one come back ---------------------------------------------------------------------
await A.evaluate(() => { window.__game.coopGive.refuse = true; });
const r0 = await B.evaluate(() => window.__game.profile.money), rh0 = await A.evaluate(() => window.__game.profile.money);
await B.evaluate((id) => window.__game.coopGive.money(id, 5), hostId);
const rMid = await B.evaluate(() => window.__game.profile.money);
await until(B, () => window.__game.coopGive.pending.size === 0, null, 8000);
const r1 = await B.evaluate(() => window.__game.profile.money), rh1 = await A.evaluate(() => window.__game.profile.money);
check('a refused gift is refunded', rMid === r0 - 5 && r1 === r0 && rh1 === rh0, { guest: [r0, rMid, r1], host: [rh0, rh1] });
await A.evaluate(() => { const g = window.__game.coopGive; g.refuse = false; g.mute = true; });
const u0 = { g: await B.evaluate(() => window.__game.profile.money), h: await A.evaluate(() => window.__game.profile.money) };
const tStart = Date.now();
await B.evaluate((id) => window.__game.coopGive.money(id, 5), hostId);
const uMid = await B.evaluate(() => window.__game.profile.money);
await until(B, () => window.__game.coopGive.pending.size === 0, null, 10000);
const tMs = Date.now() - tStart;
const u1 = { g: await B.evaluate(() => window.__game.profile.money), h: await A.evaluate(() => window.__game.profile.money) };
check('a gift lost on the way comes back (the friend says it never came)', uMid === u0.g - 5 && u1.g === u0.g && u1.h === u0.h, { guest: [u0.g, uMid, u1.g], host: [u0.h, u1.h], ms: tMs });
await A.evaluate(() => { window.__game.coopGive.mute = false; });

// --- 4b. a lost ack: the host takes it, its answer is lost; the guest asks (giftq) and gets the same answer: no duplicate --
await A.evaluate(() => { window.__game.coopGive.dropAcks = 1; });
const l0 = { g: await B.evaluate(() => window.__game.profile.money), h: await A.evaluate(() => window.__game.profile.money) };
const lStart = Date.now();
await B.evaluate((id) => window.__game.coopGive.money(id, 5), hostId);
await until(B, () => window.__game.coopGive.pending.size === 0, null, 12000);
const lMs = Date.now() - lStart;
await sleep(300);
const l1 = { g: await B.evaluate(() => window.__game.profile.money), h: await A.evaluate(() => window.__game.profile.money), gLog: await B.evaluate(() => window.__game.coopGive.log.slice(-1)[0]) };
check('a lost ack: asked again, taken once, not refunded', l1.g === l0.g - 5 && l1.h === l0.h + 5 && lMs > 3000, { guest: [l0.g, l1.g], host: [l0.h, l1.h], ms: lMs, note: l1.gLog });

// --- 4c. each on the other's map: the HUD's map (M), the friend's dot where they are ------------------------------------
const mapOf = async (P) => P.evaluate(() => {
  const g = window.__game, h = g.hud; h.setMode('glance');
  for (let i = 0; i < 6; i++) g.step(1 / 60, 1);
  const d = g.coopGive.mapDrawn || [], r = [...g.coop.remotes.values()][0], v = h.view, onBoat = r.boat && r.boat.ext && r.drawnAt.m === 'paddle';
  const x = onBoat ? r.boat.x : r.person.x, z = onBoat ? r.boat.z : r.person.z;
  return { mode: h.mode, drawn: d.map((q) => ({ name: q.name, colour: q.colour, off: +Math.hypot(q.x - x, q.z - z).toFixed(2), px: [Math.round(q.a), Math.round(q.b)] })), age: Math.round(performance.now() - (g.coopGive.mapAt || 0)), me: [Math.round(g.player.x), Math.round(g.player.z)], them: [Math.round(x), Math.round(z)], span: v && v.span };
});
await sleep(500);
const mapA = await mapOf(A), mapB = await mapOf(B);
await A.screenshot({ path: path.join(OUT, 'map-host-sees-guest.png') });
await A.evaluate(() => window.__game.hud.setMode('hidden')); await B.evaluate(() => window.__game.hud.setMode('hidden'));
const mapOk = (m, name) => m.drawn.length === 1 && m.drawn[0].name === name && m.drawn[0].off < 0.5 && m.age < 1000;
check('each sees the other on the map, in their shirt, where they are', mapOk(mapA, 'Ada') && mapOk(mapB, 'Gage') && mapA.drawn[0].colour !== mapB.drawn[0].colour, { host: mapA, guest: mapB });

// --- 4d. Give money from the canoe: both afloat, alongside -----------------------------------------------------------------
const hw = await A.evaluate(async () => { const g = window.__game, p = g.player; await p.teleport(p.x, p.z); for (let i = 0; i < 5; i++) g.step(1 / 60, 1); return { x: p.x, z: p.z, h: p.heading, mode: p.mode }; });
await B.evaluate(async (h) => {
  const g = window.__game, p = g.player;
  await p.teleport(h.x, h.z); for (let i = 0; i < 3; i++) g.step(1 / 60, 1);
  p.x = h.x + Math.sin(h.h) * 3.5; p.z = h.z + Math.cos(h.h) * 3.5; p.heading = h.h; p.speed = 0;
  for (let i = 0; i < 3; i++) g.step(1 / 60, 1);
}, hw);
await sleep(2500);
const wdot = await B.evaluate(() => {
  const g = window.__game, p = g.player, r = [...g.coop.remotes.values()][0], ch = g.chase, B = r.boat;
  // in the canoe the camera sits behind the hull: turn the canoe to face theirs
  p.heading = Math.atan2(-(B.z - p.z), B.x - p.x); p.speed = 0; ch.userYaw = 0; ch.userPitch = 0;
  for (let i = 0; i < 20; i++) { p.heading = Math.atan2(-(B.z - p.z), B.x - p.x); g.step(1 / 60, 1); }
  const P = g.coopGive.pointer, t = P && P.target;
  // and the provider itself, on a ray from the camera straight at their hull
  const T = g.THREE, cam = g.camera, o = new T.Vector3(); cam.getWorldPosition(o);
  const ray = new T.Ray(o, new T.Vector3(B.x - o.x, (B.y || 0) + 0.4 - o.y, B.z - o.z).normalize());
  const list = g.coopGive.targets(ray, P.near, true) || [];
  return { mode: p.mode, theirs: r.drawnAt && r.drawnAt.m, d: +Math.hypot(B.x - p.x, B.z - p.z).toFixed(2), target: t ? { label: t.label, verb: t.e && t.e.verb } : null, provider: list.map((c) => c.target.e.verb + ' ' + c.target.label) };
});
const w0 = { g: await B.evaluate(() => window.__game.profile.money), h: await A.evaluate(() => window.__game.profile.money) };
await B.evaluate((id) => window.__game.coopGive.moneyCard(id), hostId);
await B.evaluate(() => { for (let i = 0; i < 30; i++) window.__game.step(1 / 60, 1); });
await sleep(600);
const stillOpen = await B.evaluate(() => !!window.__game.dialogue.convo);
await B.screenshot({ path: path.join(OUT, 'give-money-afloat.png') });
await B.evaluate(() => window.__game.dialogue.choose(0));
await until(B, () => window.__game.coopGive.pending.size === 0, null, 12000);
await sleep(300);
const w1 = { g: await B.evaluate(() => window.__game.profile.money), h: await A.evaluate(() => window.__game.profile.money) };
check('Give money from the canoe', (wdot.target || wdot.provider.length) && wdot.mode === 'paddle' && wdot.theirs === 'paddle' && stillOpen && w1.g === w0.g - 5 && w1.h === w0.h + 5, { dot: wdot, panelStaysOpen: stillOpen, guest: [w0.g, w1.g], host: [w0.h, w1.h] });

// --- 4e. the host's keep is pruned: 30 real days, 16 visitors ---------------------------------------------------------------
const pr = await A.evaluate(() => {
  const G = window.__game.coopGive, now = Date.now(), day = 86400e3, s = { v: 1, by: {} };
  for (let i = 0; i < 20; i++) s.by[`v${i}`] = { name: `n${i}`, inv: {}, money: 1, at: now - i * 3600e3 };
  s.by.old1 = { at: now - 31 * day }; s.by.old2 = { at: now - 45 * day };
  const went = G.prune(s, now), left = Object.keys(s.by);
  return { went, left: left.length, oldGone: !left.includes('old1') && !left.includes('old2'), newestKept: left.includes('v0') && left.includes('v15') && !left.includes('v16') };
});
check('the host prunes its guests (30 real days, 16 at most)', pr.left === 16 && pr.oldGone && pr.newestKept && pr.went === 6, pr);

// --- 5. the guest changes their things, leaves, joins again from a new page: the same things back ----------------------
await B.evaluate(() => {
  const inv = window.__game.inventory;
  // something to a hand from a pack, and $3 spent
  for (const c of inv.reachable()) for (const e of c.grid) if (!e.box && !e.fixed && c.where !== 'hands' && inv.canHand(e.id) && inv.freeHand() >= 0) { inv.toHand(c.id, e.uid); return; }
});
await B.evaluate(() => window.__game.profile.spend(3, 'test'));
const keepSig = await B.evaluate(invSig), keepMoney = await B.evaluate(() => window.__game.profile.money);
await B.evaluate(() => window.__game.coop.leave());
await sleep(800);
await B.waitForFunction(() => window.__game && window.__game.coop && window.__game.title && typeof window.__game.step === 'function', null, { timeout: 240000, polling: 500 });
await sleep(2500);
const after = season(await B.evaluate(dump));
const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => before[k] !== after[k]);
// (save.js stamps the live slot's `played` (mount) and `saved` (slots.describe, as the title opens) on every page
// load, a visit or not: those two times alone are set aside; its words, facts and size must match)
const unplayed = (raw) => { try { const d = JSON.parse(raw); for (const m of Object.values(d.slots || {})) if (m) { delete m.played; delete m.saved; } return JSON.stringify(d); } catch { return raw; } };
const leaked = changed.filter((k) => !(k === 'bwca-canoe@slots' && unplayed(before[k]) === unplayed(after[k])));
check('the guest’s own season is byte-identical after the visit', leaked.length === 0, { keys: Object.keys(before).length, changed, leaked, diff: leaked.map((k) => [k, before[k], after[k]]), stampsOnly: changed.filter((k) => !leaked.includes(k)), bytes: Object.values(before).reduce((n, v) => n + v.length, 0) });
const backHome = await B.evaluate(() => ({ money: window.__game.profile.money, seasonId: window.__game.profile.seasonId, role: window.__game.coop.role }));
check('back home: their own purse and season', backHome.money === own0.money && backHome.seasonId === own0.sig && !backHome.role, { own0, backHome });
const hostKept = await A.evaluate(() => { const k = window.__game.coopGive.kept(); return Object.values(k.by).map((v) => ({ name: v.name, money: v.money, containers: v.inv.containers.length })); });
log('[host] keeps', hostKept);

await B.close();
B = await openGame(GB, `&join=${code}`);
await until(B, () => { const c = document.getElementById('coop-card'); return c && !c.hidden && document.getElementById('coop-code'); });
await B.click('#coop-go');
await until(B, () => window.__game.coop.role === 'guest' && window.__game.title.state === 'game' && !window.__game.player.teleporting, null, 120000);
await until(B, () => window.__game.coopGive.mine, null, 20000);
const backSig = await B.evaluate(invSig), backMoney = await B.evaluate(() => window.__game.profile.money);
check('rejoin: the same inventory and purse from the host', backSig === keepSig && backMoney === keepMoney, { money: [keepMoney, backMoney], sameInventory: backSig === keepSig, bytes: keepSig.length });
await B.evaluate(() => window.__game.coop.leave());
await sleep(800);

writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
log(`${results.filter((r) => r.pass).length}/${results.length} passed`);
for (const b of browsers) await b.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);
