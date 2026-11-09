// Round 4 join: a new season played by keys from the empty dock through the first night and home, the three streams'
// seams checked as they meet (body: the life jacket, over the shoulder, the tents; tut: the hush, the shelf gems under
// the bar; tests: the tracker's unveil sync) and a 9-shot contact sheet (docs/build/shots/round4-contact.png):
//   1 the empty dock, no life jacket (none lent yet; a co-op pose says so: np)   2 over the shoulder by the staffer, her gem
//   clear of the top bar, the dot on her, no teaching line over it   3 the talk (no line, the camera held)   4 the shoulder
//   eased back out after the talk; the food shelf's gem under the bar   5 in the canoe: the life jacket on   6 under way:
//   the pencilled way   7 at the site: the jacket off   8 the night   9 home the next day: paid
//
//   APP=http://localhost:5511 node scripts/round4-test.mjs [--home 31] [--shots <dir>] [--sheet <png>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5511';
const HOME = Number(arg('home', 31));
const SHOTS = path.resolve(arg('shots', path.join(tmpdir(), 'round4')));
mkdirSync(SHOTS, { recursive: true });
const SHEET = path.resolve(arg('sheet', 'docs/build/shots/round4-contact.png'));
mkdirSync(path.dirname(SHEET), { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 2400)); };

const HELPERS = () => {
  const g = window.__game, T = g.THREE, H = window.__p = { hints: [], unshot: [] };
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.look = (yaw, pitch = 0.05) => { const ch = g.chase; if (g.player.mode === 'paddle') { g.player.heading = yaw; g.player.yawRate = 0; } if (ch) { ch.viewYaw = yaw; ch.forwardYaw = yaw; ch.viewPitch = pitch; if (ch.snap) ch.snap(); } };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround(); H.look(heading);
  };
  H.yawTo = (q) => { const p = g.player; return Math.atan2(-(q.z - p.z), q.x - p.x); };
  H.face = (q, d, pitch = 0.05) => { const p = g.player, a = Math.atan2(p.z - q.z, p.x - q.x), x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d; const y = Math.atan2(-(q.z - z), q.x - x); H.standAt(x, z, y); H.look(y, pitch); };
  H.aimAt = (q, y) => { const p = g.player, cam = g.camera, d = Math.hypot(q.x - cam.position.x, q.z - cam.position.z); const yaw = H.yawTo(q); g.chase.viewYaw = yaw; g.chase.forwardYaw = yaw; p.heading = yaw; if (y != null) g.chase.viewPitch = Math.atan2(y - cam.position.y, d); };
  H.d = () => g.npcs.dialogue;
  H.cur = () => { g.guide.sync(); const c = g.guide.current(); return c ? { id: c.id, title: c.title, next: c.next } : null; };
  H.target = () => (g.pointer && g.pointer.target ? `${g.pointer.target.kind}:${g.pointer.target.label || ''}` : null);
  const shown = (o) => { for (let x = o; x; x = x.parent) { if (!x.visible) return false; if (x === g.scene) return true; } return false; };
  H.staffer = () => {
    const h = g.onboarding.extra, v = h && h.person; if (!v) return null;
    for (const b of g.npcs.bodies) { if (!b.who || b.lent || !shown(b.group)) continue; const w = b.who.person; if (w === v || w.key === v.key) return { v: w, b }; }
    return { v, undrawn: true };
  };
  const box = new T.Box3(), R = new T.Vector3();
  H.top = (b) => { b.group.updateWorldMatrix(true, true); box.setFromObject(b.group, true); b.fig.bones.root.getWorldPosition(R); return { top: box.max.y, x: R.x, z: R.z }; };
  // every moment as it shows: the game's clock and the scene round it
  const hs = g.hints, show = hs.show.bind(hs), ob = g.onboarding;
  hs.show = (m, text, how, ...a) => {
    const r = show(m, text, how, ...a);
    const st = ob.state || {};
    H.hints.push({ n: (H.seq = (H.seq || 0) + 1), forced: !!H.forcing, id: m.id, how, prio: m.prio, text: String(text || '').replace(/\{([^}]+)\}/g, '$1'), raw: String(text || ''), at: hs.clock(), clockT: +hs.clockT.toFixed(2), nudgedAt: hs.nudgedAt == null ? null : +hs.nudgedAt.toFixed(2), comeAt: hs.comeAt == null ? null : +hs.comeAt.toFixed(2),
      talking: !!H.d().talking, talkToCome: !!hs.talkToCome, loan: !!st.loan, done: !!st.done, mode: g.player.mode, inside: !!(g.outfitter.visit && g.outfitter.visit.inside), target: H.target(), tracker: g.tracker.state().text.slice(0, 90) });
    if (!H.forcing) H.unshot.push(H.seq);
    return r;
  };
  // the gem's top on the screen against the top bar's lowest edge, px
  H.gemTop = (id) => {
    const m = g.locator.shown().find((q) => q.id === id && !q.gone); if (!m) return null;
    const cam = g.camera; cam.updateMatrixWorld();
    const pr = (y) => { const v = new T.Vector3(m.x, y, m.z).project(cam); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, z: v.z }; };
    const top = pr(m.y + 0.38 * m.s), bot = pr(m.y - 0.62 * m.s);
    let bar = 0; for (const k of ['energy', 'strip', 'compass']) { const e = document.getElementById(k); if (!e) continue; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (r.width && r.top < innerHeight / 3 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05) bar = Math.max(bar, r.bottom); }
    return { top: Math.round(top.y), bot: Math.round(bot.y), x: Math.round(top.x), inView: top.x > 0 && top.x < innerWidth && bot.y > 0 && top.y < innerHeight && top.z < 1, bar: Math.round(bar), y: +m.y.toFixed(2), s: +m.s.toFixed(3) };
  };
  return true;
};


// the staffer's gem and the hint card on the screen, the shoulder's state, what the dot is on
const VIEW = () => {
  const g = window.__game, H = window.__p, ch = g.chase, T = g.THREE, cam = g.camera;
  const m = g.locator.shown().find((q) => q.id === 'story:onboard:talk' && !q.gone);
  let gem = null;
  if (m) {
    cam.updateMatrixWorld();
    const pr = (y) => { const v = new T.Vector3(m.x, y, m.z).project(cam); return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, z: v.z }; };
    const t = pr(m.y + 0.38 * m.s), b = pr(m.y - 0.62 * m.s);
    let bar = 0; for (const k of ['energy', 'strip', 'compass']) { const e = document.getElementById(k); if (!e) continue; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (r.width && r.top < innerHeight / 3 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05) bar = Math.max(bar, r.bottom); }
    gem = { top: Math.round(t.y), bot: Math.round(b.y), x: Math.round(t.x), bar: Math.round(bar), inView: t.x > 0 && t.x < innerWidth && b.y > 0 && t.y < innerHeight && t.z < 1 };
  }
  const he = document.getElementById('hint'), hr = he && he.classList.contains('show') ? he.getBoundingClientRect() : null;
  const over = !!(gem && hr && gem.x > hr.left - 10 && gem.x < hr.right + 10 && gem.bot > hr.top - 10 && gem.top < hr.bottom + 10);
  return { ots: +ch.ots.toFixed(3), story: !!ch.story, mode: ch.mode, target: H.target(), gem, hint: hr ? g.hints.cur && g.hints.cur.m.id : null, over, cur: H.cur() && H.cur().id, pfd: g.canoe.figure.pfd, noPfd: !!g.canoe.noPfd(), talking: !!H.d().talking };
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const sheet = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  const ev = (fn, a) => page.evaluate(fn, a);
  const shot = async (name, n, cap) => { const f = path.join(SHOTS, `round4-${n}-${name}.png`); await page.screenshot({ path: f }); log('shot', f); sheet.push({ n, file: f, cap }); return f; };
  const view = () => ev(VIEW);
  const realFor = (ms) => page.waitForTimeout(ms);
  const walkTo = async (q, stopAt = 1.6, maxMs = 25000, probe = null) => {
    await page.keyboard.down('KeyW');
    const t0 = Date.now(); let r; const seen = [];
    while (Date.now() - t0 < maxMs) {
      r = await ev(([q, stopAt]) => { const g = window.__game, H = window.__p, p = g.player; const y = H.yawTo(q); g.chase.viewYaw = y; g.chase.forwardYaw = y; const d = Math.hypot(q.x - p.x, q.z - p.z); return { d: +d.toFixed(2), done: d < stopAt }; }, [q, stopAt]);
      if (probe) seen.push({ d: r.d, ...(await view()) });
      if (r.done) break;
      await page.waitForTimeout(60);
    }
    await page.keyboard.up('KeyW'); await page.waitForTimeout(250); return { r, seen };
  };

  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.guide && g.locator && g.onboarding && g.hints && g.tracker && g.starter && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  await ev(HELPERS);
  await page.click('#btn-new');
  await page.waitForFunction(() => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await ev(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.waitForTimeout(300);
  await page.click('#btn-start');
  await page.waitForFunction(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, { timeout: 180000, polling: 250 });
  if (await ev(() => window.__game.outfitter.open)) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await ev(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 9.3); window.__p.step(10); });

  // --- 1 the empty dock: no canoe and no life jacket yet ---------------------------------------------------------------
  const dock0 = await ev(() => {
    const g = window.__game, H = window.__p, L = g.outfitter.layout(g.profile.home), f = L.dockFoot || L.dockLand || L.door, d = L.dockSide || f;
    H.standAt(f.x, f.z, H.yawTo(d)); H.step(30);
    let pose = null; try { pose = g.coop && typeof g.coop.poseMsg === 'function' ? g.coop.poseMsg() : null; } catch (e) { pose = { err: String(e) }; }
    return { hull: g.player.canoe.hull.visible, noCanoe: g.onboarding.noCanoe, noPfd: g.canoe.noPfd(), pfd: g.canoe.figure.pfd, np: pose ? pose.np : 'no coop', mode: g.player.mode };
  });
  await realFor(600); await shot('dock', 1, 'The empty dock: no canoe, no life jacket yet');
  result('1 the empty dock: no canoe lent, none worn, a co-op pose says none (np)', dock0.noCanoe && dock0.noPfd && !dock0.pfd && (dock0.np === 1 || dock0.np === 'no coop'), dock0);

  // --- 2 into the store and over the shoulder by the staffer -----------------------------------------------------------
  const way = await ev(() => { const g = window.__game, H = window.__p, L = g.outfitter.layout(g.profile.home), d = L.door, c = L.centre || L.door, dx = c.x - d.x, dz = c.z - d.z, n = Math.hypot(dx, dz) || 1, from = L.stepsFoot || { x: d.x - dx / n * 3, z: d.z - dz / n * 3 }; H.standAt(from.x - dx / n * 1.5, from.z - dz / n * 1.5, 0); H.step(10); if (g.chase.mode !== 'third') g.chase.setMode('third'); H.step(4); const sp = g.onboarding.spot(g.profile.home); return [{ x: d.x - dx / n * 1.2, z: d.z - dz / n * 1.2 }, { x: d.x, z: d.z }, { x: d.x + dx / n * 1.4, z: d.z + dz / n * 1.4 }, { x: sp.x, z: sp.z }]; });
  for (const q of way.slice(0, 3)) await walkTo(q, 0.6, 12000);
  const appr = await walkTo(way[3], 2.4, 20000, true);
  await realFor(2000);
  const v2 = await view();
  const aimed = await ev(() => { const g = window.__game, H = window.__p, s = H.staffer(); if (!s || s.undrawn) return null; const t = H.top(s.b); g.chase.viewYaw = g.chase.forwardYaw = g.player.heading = H.yawTo({ x: t.x, z: t.z }); g.chase.viewPitch = 0; H.step(30); return H.target(); });
  await realFor(1200);
  const v2b = await view();
  await shot('shoulder', 2, `Over the shoulder by the staffer (ots ${v2b.ots}); her gem under the bar`);
  const gemsOk = appr.seen.filter((s) => s.gem && s.gem.inView && s.ots > 0.3).every((s) => s.gem.top >= s.gem.bar);
  result('2 over the shoulder by the staffer: eased in, the dot on her, her gem in view and under the top bar', v2b.ots > 0.8 && /^person:/.test(v2b.target || aimed || '') && v2b.gem && v2b.gem.inView && v2b.gem.top >= v2b.gem.bar, { v2, v2b, aimed });
  result('3 on the walk in: her gem never up against the top bar while the shoulder eases', gemsOk, appr.seen.filter((s) => s.gem).map((s) => `${s.d}m ots ${s.ots} gem ${s.gem.top}/${s.gem.bar}${s.gem.inView ? '' : ' out'}`).slice(-14));
  result('4 no teaching line over her gem as the shoulder comes in', !appr.seen.some((s) => s.over) && !v2b.over, appr.seen.filter((s) => s.hint).map((s) => `${s.d}:${s.hint}${s.over ? ' OVER' : ''}`));

  // --- 3 the talk by keys -------------------------------------------------------------------------------------------------
  await page.keyboard.press('KeyE'); await ev(() => window.__p.step(6));
  if (!(await ev(() => window.__p.d().talking))) { await ev(() => window.__game.onboarding.start(window.__game.profile.home)); await ev(() => window.__p.step(4)); }
  await realFor(800);
  const v3 = await view();
  await shot('talk', 3, 'The staff talk: the loan');
  const during = [];
  for (let i = 0; i < 24; i++) {
    if (!(await ev(() => window.__p.d().talking))) break;
    during.push(await view());
    await page.keyboard.press('Digit1');
    await ev(async () => { const H = window.__p; H.step(3); await H.wait(60); if (window.__game.starter.pending) await window.__game.starter.pending; });
    await realFor(400);
  }
  result('5 the talk by keys: no teaching line during it', v3.talking && !during.some((s) => s.hint), during.map((s) => `${s.hint || '-'} ots ${s.ots}`));
  if (await ev(() => window.__game.outfitter.open)) { await page.keyboard.press('Escape'); await ev(() => window.__p.step(10)); }

  // --- 4 after it: the shoulder eases out, the loan's jacket counts; the food shelf's gem under the bar ------------------
  await realFor(2500);
  const v4 = await view();
  result('6 after the talk the shoulder eases back out; the life jacket lent', v4.cur === 'story:onboard:food' && v4.ots < 0.1 && !v4.noPfd && !v4.pfd, v4);
  const shelfBuy = async (id, want, n, cap) => {
    const s = await ev((id) => { const g = window.__game, e = g.guide.get(id), r = e && g.guide.reach(e); return r ? { x: r.pos.x, y: r.pos.y, z: r.pos.z } : null; }, id);
    if (!s) return { none: true };
    await walkTo(s, 1.8);
    await ev((q) => { const H = window.__p; H.aimAt(q, q.y - 0.3); H.step(6); }, s);
    if (!/^shelf/.test((await ev(() => window.__p.target())) || '')) await ev((q) => { const H = window.__p; H.face(q, 1.2, 0.0); H.step(10); H.aimAt(q, q.y - 0.3); H.step(6); }, s);
    await realFor(1500);
    const gem = await ev((id) => { window.__game.locator.barT = 0; window.__p.step(2); return window.__p.gemTop(id); }, id);
    if (n) await shot('shelf', n, cap);
    await page.keyboard.press('KeyE'); await ev(() => window.__p.step(10)); await page.waitForTimeout(400);
    const bought = [];
    for (const wid of want) { const sel = `#shelf .sh-stock [data-id="${wid}"]`; if (!(await page.$(sel))) { bought.push({ wid, missing: true }); continue; } await page.dblclick(sel); await page.waitForTimeout(250); bought.push(wid); }
    await page.keyboard.press('Escape'); await ev(() => window.__p.step(10));
    return { gem, bought };
  };
  const food = await shelfBuy('story:onboard:food', ['meal:breakfast', 'meal:supper'], 4, 'The food shelf: its gem under the bar, the shoulder out');
  const lee = await shelfBuy('story:onboard:leeches', ['leeches']);
  result('7 the food shelf\'s gem under the top bar; food and leeches bought by keys', food.gem && (!food.gem.inView || food.gem.top >= food.gem.bar + 4) && !food.bought.some((b) => b.missing) && !lee.bought.some((b) => b.missing), { food, lee });

  // --- 5 the canoe: E in, the life jacket on ------------------------------------------------------------------------------
  const toCanoe = await ev(() => { const g = window.__game, H = window.__p, L = g.outfitter.layout(g.profile.home), f = L.dockFoot || L.dockLand || L.door, d = g.player.carry.drop; H.standAt(f.x, f.z); H.step(20); return { d: { x: d.x, z: d.z } }; });
  await walkTo(toCanoe.d, 2.2);
  const ashore = await view();
  await ev((q) => { const H = window.__p, g = window.__game; H.aimAt(q, g.player.foot ? g.player.foot.y - 0.3 : null); H.step(6); }, toCanoe.d);
  await realFor(800);
  await page.keyboard.press('KeyE');
  await ev(async () => { const H = window.__p; for (let i = 0; i < 40 && window.__game.player.mode !== 'paddle'; i++) { H.step(5); await H.wait(20); } });
  if ((await ev(() => window.__game.player.mode)) !== 'paddle') { await page.keyboard.down('KeyE'); await ev(async () => { const H = window.__p; for (let i = 0; i < 40; i++) { H.step(3); await H.wait(25); } }); await page.keyboard.up('KeyE'); }
  await page.keyboard.down('KeyW'); await realFor(2500);
  const v5 = await ev(() => ({ mode: window.__game.player.mode, pfd: window.__game.canoe.figure.pfd }));
  await shot('pushoff', 5, 'Pushed off from the dock: the loaned life jacket on');
  await realFor(4500); await page.keyboard.up('KeyW');
  result('8 on the dock in his shirt; in the canoe the life jacket on', !ashore.pfd && v5.mode === 'paddle' && v5.pfd, { ashore: ashore.pfd, v5 });

  // --- 6 under way: the pencilled way ------------------------------------------------------------------------------------
  await realFor(3000);
  const st = await ev(() => { const g = window.__game; return { hint: g.hints.cur && g.hints.cur.m.id, text: document.getElementById('hint').textContent, tracker: g.tracker.state().text }; });
  await shot('underway', 6, `Under way: ${st.hint || 'the tracker'}`);
  result('9 under way: a line or the card says the way', /pencilled|map/i.test(st.text || '') || !!st.tracker, st);

  // --- 7 the site at dusk: on foot, the jacket off ------------------------------------------------------------------------
  const site = await ev(async () => {
    const g = window.__game, H = window.__p, s = g.starter.route(g.profile.home).siteRec, A = s.access, ss = g.day.sunriseSunset;
    g.day.setClock(g.day.year, g.day.doy, ss.set - 1.0);
    await g.player.teleport(A && A.landing ? A.landing[0] : s.x, A && A.landing ? A.landing[1] : s.z); await H.settle();
    for (let k = 0; k < 80 && !s.layout; k++) { H.step(10); await H.wait(80); }
    H.step(120);
    const top = A && A.top ? { x: A.top[0], z: A.top[1] } : A && A.landing ? { x: A.landing[0], z: A.landing[1] } : { x: s.x + 6, z: s.z };
    H.standAt(top.x, top.z, H.yawTo(s)); H.step(20);
    const f = s.layout && s.layout.fire ? s.layout.fire : s;
    return { ring: { x: f.x, z: f.z } };
  });
  await walkTo(site.ring, 2.4, 30000);
  await realFor(2500);
  const v7 = await ev(() => ({ mode: window.__game.player.mode, pfd: window.__game.canoe.figure.pfd }));
  await shot('site', 7, 'The first night\'s site at dusk: the jacket off in camp');
  result('10 at the site on foot: the life jacket off', v7.mode === 'walk' && !v7.pfd, v7);
  // the first night's job by E on the dot: the grate, the latrine, the pad
  const parts = [];
  for (const k of ['grate', 'latrine', 'pad']) {
    const pr = await ev((k) => { const g = window.__game, H = window.__p, t = g.tasks.active.find((x) => x.kind === 'starter'); if (!t) return { none: 'no job' }; const q = g.guide.partsOf(t) && g.guide.partsOf(t)[k]; if (!q) return { none: 'no part' }; if (g.chase.mode !== 'first') g.chase.setMode('first'); H.face({ x: q.x, z: q.z }, 2.0, -0.5); H.step(30); const gy = g.player.groundAt(q.x, q.z); H.aimAt({ x: q.x, z: q.z }, gy + 0.25); H.step(6); return { target: H.target() }; }, k);
    if (pr.none) { parts.push({ k, ...pr }); continue; }
    await page.keyboard.press('KeyE'); await ev(() => window.__p.step(20));
    pr.after = await ev((k) => { const g = window.__game, t = g.tasks.active.find((x) => x.kind === 'starter'); return { checked: !!(t && t.checks && t.checks[k]), status: t && t.status }; }, k);
    parts.push({ k, ...pr });
  }
  await ev(() => { const g = window.__game; if (g.chase.mode !== 'third') g.chase.setMode('third'); window.__p.step(6); });
  result('10b the site\'s grate, latrine and pad looked over by E: the job done', parts.length === 3 && parts.every((q) => q.after && q.after.checked), parts);

  // --- 8 the night -------------------------------------------------------------------------------------------------------
  await ev(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 23.2); window.__p.step(300); });
  await realFor(1500);
  const night = await ev(() => +window.__game.day.hours.toFixed(2));
  await shot('night', 8, `Night at the site (${night} h)`);
  result('11 the night at the site', night > 22.5, { night });

  // --- 9 home the next day: paid -------------------------------------------------------------------------------------------
  const home = await ev(async () => {
    const g = window.__game, H = window.__p, ep = g.profile.home, L = g.outfitter.landing(ep), m0 = g.profile.money;
    g.day.setClock(g.day.year, g.day.doy + 1, 10);
    await g.player.teleport(L.x, L.z); await H.settle();
    for (let i = 0; i < 40; i++) { H.step(10); await H.wait(40); }
    const Lo = g.outfitter.layout(ep), f = Lo.dockFoot || Lo.dockLand || Lo.door;
    H.standAt(f.x, f.z); H.step(30);
    for (let k = 0; k < 40 && !(g.record && g.record.shown) && g.profile.money === m0; k++) { H.step(30); await H.wait(30); }
    H.step(20);
    return { m0, money: g.profile.money, job: g.tasks.active.filter((x) => x.kind === 'starter').length, pfd: g.canoe.figure.pfd };
  });
  await page.waitForTimeout(1200); await ev(() => window.__p.step(10));
  await shot('home', 9, `Home the next day: paid (+$${home.money - home.m0})`);
  result('12 home the next day: the first night paid', home.money > home.m0 && home.job === 0, home);
  result('13 no page errors', errors.length === 0, { errors: errors.slice(0, 6) });

  // --- the contact sheet: 9 shots, 3 across ------------------------------------------------------------------------------
  const list = sheet.sort((a, b) => a.n - b.n);
  const sp = await (await browser.newContext({ viewport: { width: 1920, height: 3 * 440 } })).newPage();
  const cells = list.map((s) => `<figure><img src="data:image/png;base64,${readFileSync(s.file).toString('base64')}"><figcaption>${s.n}. ${s.cap || ''}</figcaption></figure>`).join('');
  await sp.setContent(`<!doctype html><style>body{margin:0;background:#181816;display:grid;grid-template-columns:repeat(3,640px);font:15px Arial,sans-serif;color:#f0e8d2}figure{margin:0;width:640px;height:440px;position:relative}img{width:640px;height:400px;display:block;object-fit:cover}figcaption{height:40px;line-height:40px;padding:0 10px;white-space:nowrap;overflow:hidden}</style>${cells}`);
  await sp.waitForTimeout(500);
  await sp.screenshot({ path: SHEET, fullPage: true });
  log('sheet', SHEET);
  result('14 the contact sheet has its 9 shots', list.length === 9, { n: list.map((s) => s.n) });
} catch (e) {
  result('the run', false, { error: String((e && e.stack) || e).slice(0, 2000) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
