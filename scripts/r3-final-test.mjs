// Round 3 final join (claude/r3-final: r3-replay + the NPC motion passes 1 and 2): the seams between the two, headless
// Chromium against a running Vite, each check PASS or FAIL, a screenshot at each step:
//   1 the empty dock before the staff talk: nobody of the store's loads, unloads or fishes on your berth's deck, and no
//     party canoe lies in it (a busy morning watched), and after the talk the loaned canoe's berth stays yours too
//   2 the staffer stands where the gem points, and the gem never clips into the head while the idle's poses change
//     the height (a ray down from the gem's centre meets the head or hat below its point, and not far below)
//   3 the store's door with its queue: from the dock's land end up to the door and in to the staffer, W held; nobody
//     of the store's stands inside you; the talk opens on the staffer
//   4 the starter night: the suggested site is held (no party camped at it), the camps drawn near stand on the ground
//   5 no page errors
//
//   APP=http://localhost:5301 node scripts/r3-final-test.mjs [--home 31] [--shots <dir>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5301';
const HOME = Number(arg('home', 31));
const SHOTS = arg('shots', path.join(tmpdir(), 'r3-final-shots'));
mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1500)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, H = window.__r3f = {}, T = g.THREE;
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.standAt = (x, z, h = 0) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.x = x; p.z = z; p.heading = h; p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null }; p.placeOnGround();
    const ch = p.chase; if (ch) { ch.viewYaw = h; ch.forwardYaw = h; ch.viewPitch = -0.1; if (ch.snap) ch.snap(); }
  };
  // the store's own people (not the keeper, nor someone another module stands there) at a store, as drawn
  H.storeFigs = (ep) => { const out = []; for (const v of g.npcs.rosters.get(ep) || []) if (!v.keeper && !v.extra) v.figs.forEach((f, i) => out.push({ key: `${v.key}#${i}`, x: f.x, y: f.y, z: f.z, act: f.act || null, party: !!v.inParty })); return out; };
  H.body = (key) => g.npcs.bodies.find((b) => b.who && b.who.person && b.who.person.key === key) || null;
  H.walkTo = (to, secs = 20, near = 0.8, watch = null) => {
    const p = g.player, inp = p.input, held = inp.held.bind(inp);
    inp.held = (...c) => c.includes('KeyW') || held(...c);
    let best = Infinity, t = 0;
    try {
      for (; t < secs * 30; t++) {
        const h = Math.atan2(-(to.z - p.z), to.x - p.x), ch = p.chase;
        if (ch) { ch.viewYaw = h; ch.forwardYaw = h; }
        g.step(1 / 30, 1);
        if (watch) watch();
        best = Math.min(best, Math.hypot(p.x - to.x, p.z - to.z));
        if (best < near) break;
      }
    } finally { inp.held = held; }
    g.step(1 / 30, 2);
    return { best: +best.toFixed(2), secs: +(t / 30).toFixed(1), reached: best < near };
  };
  // the gem against the staffer's head: a ray down from the gem's centre at the staffer's figure (their mesh, the hat)
  const ray = new T.Raycaster(), down = new T.Vector3(0, -1, 0), hv = new T.Vector3();
  H.gemOnHead = (id, key) => {
    const gm = g.locator.shown().find((q) => q.id === id), b = H.body(key);
    if (!gm || !b) return { gem: !!gm, body: !!b };
    b.fig.bones.head.getWorldPosition(hv);
    ray.set(new T.Vector3(gm.x, gm.y, gm.z), down); ray.far = 3; ray.camera = g.camera;
    const hits = ray.intersectObject(b.group, true).filter((h) => h.object.visible && h.object.isMesh);
    const point = gm.y - 0.62 * gm.s, top = hits.length ? gm.y - hits[0].distance : null;
    return { off: +Math.hypot(gm.x - hv.x, gm.z - hv.z).toFixed(3), point: +point.toFixed(3), headBone: +hv.y.toFixed(3), top: top == null ? null : +top.toFixed(3), gap: top == null ? null : +(point - top).toFixed(3), boneGap: +(point - hv.y).toFixed(3) };
  };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  const shot = async (name) => { const f = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: f }); log('shot', f); };
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.guide && g.locator && g.onboarding && g.npcs && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);

  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);

  // 1a the empty dock before the talk: a morning watched from the porch
  const watchDock = async (label) => page.evaluate(async (label) => {
    const g = window.__game, H = window.__r3f, o = g.outfitter, home = g.profile.home, L = o.layout(home);
    if (o.open) o.hide();
    const berth = (o.visit && o.visit.berth) || o.berthFor(L), deck = berth.deck || L.dockDeck, side = berth.side;
    const taken = g.npcs.takenDecks ? g.npcs.takenDecks(home, L) : [];
    H.standAt(L.door.x, L.door.z, Math.atan2(-(side.z - L.door.z), side.x - L.door.x)); H.step(10);
    let seen = new Set(), onDeck = [], inBerth = [], deckActs = 0;
    for (let k = 0; k < 90; k++) { // (90 × 40 frames at 1/30: two minutes of play, the clock's ×8 a quarter of a game hour)
      H.step(40);
      for (const f of H.storeFigs(home)) {
        seen.add(f.key);
        if (/load|unload|fish/.test(f.act || '')) deckActs++;
        if (deck && Math.hypot(f.x - deck.x, f.z - deck.z) < 0.6 && Math.abs(f.y - deck.y) < 0.5 && !onDeck.includes(f.key)) onDeck.push(f.key);
      }
      for (const b of g.actors.boats || []) if (!b.removed && Math.hypot(b.x - side.x, b.z - side.z) < 2.0 && !inBerth.includes(b.key)) inBerth.push(b.key);
      if (k % 15 === 14) await H.wait(5);
    }
    return { label, hours: +g.day.hours.toFixed(2), seen: seen.size, deckActs, onDeck, inBerth, taken: taken.length, canoeShown: !!(g.canoe && g.canoe.group && g.canoe.group.visible), berths: (L.dockBerths || []).length };
  }, label);
  await page.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 7.5); window.__r3f.step(10); });
  const d1 = await watchDock('before the talk');
  await shot('1a-dock-before-talk');
  result('1a before the staff talk: nobody of the store\'s on your berth\'s deck, no party canoe in it', d1.taken >= 1 && !d1.onDeck.length && !d1.inBerth.length, d1);

  // 2 the staffer where the gem points; the gem clear of the head through the idle's changes
  const two = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3f, o = g.outfitter, home = g.profile.home, key = `staffer:${home}`;
    g.day.setClock(g.day.year, g.day.doy, 9); g.guide.sync && g.guide.sync();
    const cur = g.guide.current(); if (!cur || !cur.target) return { cur: cur && cur.id };
    const r = g.guide.reach(cur); const p = g.player, a = Math.atan2(p.z - r.pos.z, p.x - r.pos.x);
    H.standAt(r.pos.x + Math.cos(a) * 3.2, r.pos.z + Math.sin(a) * 3.2, Math.atan2(Math.sin(a), -Math.cos(a))); H.step(30);
    const sp = g.onboarding.spot(home), b = H.body(key);
    const samples = [];
    for (let k = 0; k < 60; k++) { H.step(10); const s = H.gemOnHead(cur.id, key); if (s.gem && s.body) samples.push(s); if (k % 20 === 19) await H.wait(5); }
    const gaps = samples.map((s) => s.gap).filter((x) => x != null), offs = samples.map((s) => s.off), bone = samples.map((s) => s.headBone);
    const rig = b && b.rig ? { x: b.rig.position.x, z: b.rig.position.z } : null;
    return { cur: cur.id, n: samples.length, hits: gaps.length, minGap: gaps.length ? Math.min(...gaps) : null, maxGap: gaps.length ? Math.max(...gaps) : null, maxOff: offs.length ? Math.max(...offs) : null,
      headRange: bone.length ? +(Math.max(...bone) - Math.min(...bone)).toFixed(3) : null, minBoneGap: samples.length ? Math.min(...samples.map((s) => s.boneGap)) : null,
      standsAt: rig && sp ? +Math.hypot(rig.x - sp.x, rig.z - sp.z).toFixed(2) : null, name: b && b.who ? b.who.person.name : null, staffName: g.onboarding.staffName(home) };
  });
  await shot('2-gem-over-staffer');
  result('2 the staffer stands where the gem points; the gem never clips the head through the idle', two.cur === 'story:onboard:talk' && two.n >= 50 && two.standsAt != null && two.standsAt < 0.8 && two.maxOff < 0.6 && two.hits >= two.n * 0.8 && two.minGap > 0.01 && two.maxGap < 0.7, two);

  // 3 from the dock up through the door to the staffer, W held, on a busy door; the talk opens on the staffer
  const three = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3f, o = g.outfitter, home = g.profile.home, L = o.layout(home), p = g.player;
    const s = L.dockLand || L.dockDeck;
    H.standAt(s.x, s.z, Math.atan2(-(L.door.z - s.z), L.door.x - s.x)); H.step(3);
    let inside = 0, near = Infinity, crowd = 0;
    const watch = () => { for (const f of H.storeFigs(home)) { const d = Math.hypot(f.x - p.x, f.z - p.z); near = Math.min(near, d); if (d < 0.3) inside++; if (d < 2.5) crowd++; } };
    const up = H.walkTo(L.door, 30, 0.8, watch);
    const sp = g.onboarding.spot(home);
    const at = H.walkTo(sp, 25, 1.4, watch);
    const opened = o.openHot ? (o.openHot('counter', o.visit.landing), true) : g.onboarding.start(home);
    H.step(4);
    const D = g.npcs.dialogue, c = D && D.convo;
    const res = { up, at, inside, near: +near.toFixed(2), crowd, opened, talking: !!(D && D.talking), speaker: c ? (c.speaker && c.speaker.name) || c.name || null : null, staffName: g.onboarding.staffName(home) };
    return res;
  });
  await shot('3-talk-on-staffer');
  result('3 dock → door → the staffer with W held: through the door, nobody inside you, the talk on the staffer', three.up.reached && three.at.reached && three.inside === 0 && three.talking, three);

  // the talk through; then the loaned canoe's berth watched again
  await page.evaluate(async () => {
    const g = window.__game, H = window.__r3f, d = g.npcs.dialogue;
    for (let i = 0; i < 16 && d.convo; i++) { d.choose(0); await H.wait(30); }
    if (g.starter && g.starter.pending) await g.starter.pending;
    if (g.outfitter.open) g.outfitter.hide();
    H.step(20);
  });
  const d2 = await watchDock('after the talk');
  await shot('1b-dock-after-talk');
  result('1b after the talk: the loaned canoe\'s berth stays yours (nobody on its deck, no party canoe in it)', d2.taken >= 1 && !d2.onDeck.length && !d2.inBerth.length, d2);

  // 4 the starter night: the suggested site held, the camps near it on their ground
  const four = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3f, home = g.profile.home, r = g.starter && g.starter.route(home);
    if (!r) return { route: false };
    const s = r.siteRec, A = s.access, holds = g.starter.holds();
    g.day.setClock(g.day.year, g.day.doy, 19.5);
    await g.player.teleport(A && A.landing ? A.landing[0] : s.x, A && A.landing ? A.landing[1] : s.z); await H.settle();
    for (let k = 0; k < 60; k++) { H.step(20); await H.wait(40); }
    const ex = (g.partyCamps && g.partyCamps.extras ? g.partyCamps.extras() : []) || [];
    const G = (x, z) => g.tiles.groundAt(x, z);
    let atSite = 0, off = [], nearest = Infinity;
    for (const e of ex) { const f = e.f; if (!f) continue; const d = Math.hypot(f.x - s.x, f.z - s.z); nearest = Math.min(nearest, d); if (d < 25) atSite++; const gy = G(f.x, f.z); if (Number.isFinite(gy) && f.spec && f.spec.pose !== 'sit' && Math.abs(f.y - gy) > 0.15 && d < 120) off.push(+(f.y - gy).toFixed(2)); }
    const free = g.campsites && g.campsites.isFree ? g.campsites.isFree(g.campsites.key(s)) : null;
    return { route: true, held: holds.some((h) => h.i === r.site), free, drawn: ex.length, nearest: Number.isFinite(nearest) ? +nearest.toFixed(1) : null, atSite, off: off.slice(0, 8), offN: off.length };
  });
  await shot('4-starter-night');
  result('4 the starter night: the site held and free, no party at it, the neighbours\' camps on their ground', four.route && four.held && four.free !== false && four.atSite === 0 && four.offN === 0, four);

  result('5 no page errors', !errors.length, { errors: errors.slice(0, 5) });
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.pass);
log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
