// Round 4, the tutorial polish (stream TUT): a new season played by keys from the store door through the first night,
// every teaching moment (hints.js) logged as it shows, with a shot of the screen while its card is up. Real keys (W, E,
// I, Escape, 1) and clicks; __game only to set a scene up (the clock, a place to stand and face, a teleport for the
// paddle to the site). Checks the moments against round 3's empty-handed start (docs/build/r4-tut.md):
//   the store's first seconds belong to the staffer; no line during a talk; the shelf's key and the store's people after
//   the talk; nothing about the canoe before there is one; the push-off's line and the evening name the pencilled way;
//   "Done. Notices pay when you come in." never with the tracker on; I opens the pack a {I} line names; and the shelf
//   gems clear of the HUD's top bar at 1280x720 and 1920x1080, first and third person.
//
//   APP=http://localhost:5503 node scripts/r4-tut-test.mjs [--home 31] [--shots <dir>]
// Writes <shots>/r4-tut-hints.json (the moments shown, in order) next to the shots.
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5503';
const HOME = Number(arg('home', 31));
const SHOTS = path.resolve(arg('shots', path.join(tmpdir(), 'r4-tut')));
mkdirSync(SHOTS, { recursive: true });
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

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const shots = []; // [{ n, id, file }]
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  const ev = (fn, a) => page.evaluate(fn, a);
  const shot = async (name) => { const f = path.join(SHOTS, `r4-tut-${name}.png`); await page.screenshot({ path: f }); log('shot', f); return f; };
  // a shot of each moment new since the last look, while its card is up
  const watch = async () => {
    const un = await ev(() => { const H = window.__p, u = H.unshot.splice(0); return { u, up: document.getElementById('hint').classList.contains('show'), cur: window.__game.hints.cur ? window.__game.hints.cur.m.id : null, list: u.map((n) => (H.hints.find((h) => h.n === n) || {}).id) }; });
    for (let i = 0; i < un.u.length; i++) {
      const n = un.u[i], id = un.list[i], last = i === un.u.length - 1;
      if (last && un.up && un.cur === id) shots.push({ n, id, file: await shot(`hint-${String(n).padStart(2, '0')}-${id.replace(/[^a-z0-9]+/gi, '_')}`) });
      else shots.push({ n, id, file: null });
    }
  };
  // frames stepped in short runs, a look for new moments after each
  const run = async (frames, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 15) { await ev(([k, dt]) => window.__p.step(k, dt), [Math.min(15, left), dt]); await watch(); } };
  const realFor = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { await page.waitForTimeout(80); await watch(); } };
  const walkTo = async (q, stopAt = 1.6, maxMs = 25000) => {
    await page.keyboard.down('KeyW');
    const t0 = Date.now(); let r;
    while (Date.now() - t0 < maxMs) {
      r = await ev(([q, stopAt]) => { const g = window.__game, H = window.__p, p = g.player; const y = H.yawTo(q); g.chase.viewYaw = y; g.chase.forwardYaw = y; const d = Math.hypot(q.x - p.x, q.z - p.z); return { d: +d.toFixed(2), done: d < stopAt }; }, [q, stopAt]);
      if (r.done) break;
      await page.waitForTimeout(60); await watch();
    }
    await page.keyboard.up('KeyW'); await page.waitForTimeout(250); await watch(); return r;
  };
  const hintsNow = () => ev(() => window.__p.hints);

  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.guide && g.locator && g.onboarding && g.hints && g.tracker && g.starter && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  await ev(HELPERS);

  // --- a new season by clicks -------------------------------------------------------------------------------------------
  await page.click('#btn-new');
  await page.waitForFunction(() => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await ev(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.waitForTimeout(300);
  await page.click('#btn-start');
  await page.waitForFunction(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, { timeout: 180000, polling: 250 });
  if (await ev(() => window.__game.outfitter.open)) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  const start = await ev(() => { const g = window.__game; return { money: g.profile.money, hull: g.player.canoe.hull.visible, inside: !!g.outfitter.visit.inside, step: g.onboarding.state && g.onboarding.state.step, h: +g.day.hours.toFixed(2) }; });
  log('start', JSON.stringify(start));

  // --- the store's first seconds: real time, standing, then a walk about ---------------------------------------------------
  await realFor(9000);
  await ev(() => { const g = window.__game, H = window.__p, L = g.outfitter.layout(g.profile.home), c = L.centre || L.door; if (!g.outfitter.visit.inside) H.standAt(c.x, c.z); H.step(5); });
  const L0 = await ev(() => { const g = window.__game, L = g.outfitter.layout(g.profile.home), f = L.shelves.find((s) => s.kind === 'food'), c = L.centre || L.door; return { food: { x: f.x, z: f.z }, centre: { x: c.x, z: c.z } }; });
  await walkTo(L0.food, 1.2); // (before the talk: the gem is on the staffer, the shelf's key waits)
  await realFor(4000);
  await walkTo(L0.centre, 1.0);
  await realFor(2000);
  const pre = await hintsNow();
  const firstTeach = pre.find((h) => h.prio === 1);
  result('1 the store\'s first seconds: no teaching line before the staffer\'s word at the door and its hush (or 14 s at the door)', !firstTeach || (firstTeach.nudgedAt != null ? firstTeach.clockT - firstTeach.nudgedAt >= 5.9 : firstTeach.clockT - (firstTeach.comeAt ?? 0) >= 13.9), { firstTeach, all: pre.map((h) => `${h.id}@${h.clockT}`) });
  result('2 before the talk: no shelf key, no store party line (the gem is on the staffer)', !pre.some((h) => (h.id === 'storeparty' || (h.id === 'shelf' && !/^shelf/.test(h.target || ''))) && h.talkToCome), pre.map((h) => `${h.id}:${h.target}`));

  // --- the talk: walk to the staffer, E, 1 to the end ------------------------------------------------------------------------
  const sp = await ev(() => { const s = window.__game.onboarding.spot(window.__game.profile.home); return { x: s.x, z: s.z }; });
  await walkTo(sp, 2.0);
  const aim = await ev(() => { const g = window.__game, H = window.__p, s = H.staffer(); if (!s || s.undrawn) { H.face(g.onboarding.spot(g.profile.home), 1.6, 0); H.step(6); return { undrawn: true }; } let t = H.top(s.b); H.aimAt({ x: t.x, z: t.z }, t.top - 0.25); H.step(6); if (!/person:/.test(H.target() || '')) { H.face({ x: t.x, z: t.z }, 1.3, 0); H.step(10); t = H.top(s.b); H.aimAt({ x: t.x, z: t.z }, t.top - 0.25); H.step(6); } return { target: H.target() }; });
  await page.keyboard.press('KeyE'); await run(6);
  let talking = await ev(() => window.__p.d().talking);
  if (!talking) { await ev(() => window.__game.onboarding.start(window.__game.profile.home)); await run(4); talking = await ev(() => window.__p.d().talking); }
  for (let i = 0; i < 24; i++) {
    if (!(await ev(() => window.__p.d().talking))) break;
    await page.keyboard.press('Digit1');
    await ev(async () => { const H = window.__p; H.step(3); await H.wait(60); if (window.__game.starter.pending) await window.__game.starter.pending; });
    await realFor(400);
  }
  await run(20);
  await shot('counter-after-talk');
  if (await ev(() => window.__game.outfitter.open)) { await page.keyboard.press('Escape'); await run(10); }
  const fin = await ev(() => { const g = window.__game; return { done: g.onboarding.state.done, loan: g.onboarding.state.loan, cur: window.__p.cur() }; });
  result('3 the talk by keys to its end: the loan given, the food step next', talking && fin.done && fin.loan && fin.cur && fin.cur.id === 'story:onboard:food', { aim, fin });
  const afterTalk = await hintsNow();
  result('4 no line while a conversation was up', !afterTalk.some((h) => h.talking), afterTalk.filter((h) => h.talking));

  // --- I while a {I} line is up opens the pack the line names (the tracker's tutorial card up with an unread line) --------
  const iTest = await ev(() => { const g = window.__game; window.__p.forcing = true; g.hints.fire('thirsty'); window.__p.forcing = false; window.__p.step(2); return { up: g.hints.cur && g.hints.cur.m.id, tracker: g.tracker.state().shown, wants: g.hints.wantsKey('I') }; });
  await page.keyboard.press('KeyI'); await run(6); await page.waitForTimeout(300);
  const jI = await ev(() => { const J = window.__game.journal; return { open: J.open, side: J.side, tab: J.tab }; });
  await shot('i-with-a-line-up');
  if (jI.open) { await page.keyboard.press('Escape'); await run(6); }
  if (await ev(() => window.__game.journal.open)) { await page.keyboard.press('KeyI'); await run(4); }
  await ev(() => { const g = window.__game; if (g.hints.cur) g.hints.hide(); window.__p.unshot.length = 0; });
  // (the forced line is no moment of the season: out of the log)
  await ev(() => { const H = window.__p; H.hints = H.hints.filter((h) => !h.forced); });
  result('5 I with "{I}" on the line up opens the pack, not the journal at the tracker\'s task', iTest.up === 'thirsty' && iTest.wants && jI.open && jI.side === 'pack', { iTest, jI });

  // --- the shelf gems against the top bar: 1280x720 and 1920x1080, first and third person, from 1.2, 1.8 and 2.6 m ---------
  const gemRows = [];
  // (a measuring scene, not play: no moment picked while the views are set up and stepped, so none shows and goes unseen)
  await ev(() => { const h = window.__game.hints; if (h.cur) h.hide(); h.gapT = 1e9; });
  for (const vp of [[1280, 720], [1920, 1080]]) {
    await page.setViewportSize({ width: vp[0], height: vp[1] }); await run(10); await page.waitForTimeout(400);
    for (const mode of ['first', 'third']) {
      for (const d of [1.2, 1.8, 2.6]) {
        const r = await ev(([mode, d]) => {
          const g = window.__game, H = window.__p, e = g.guide.get('story:onboard:food'), rr = e && g.guide.reach(e);
          if (!rr) return { none: true };
          if (g.chase.mode !== mode) g.chase.setMode(mode);
          const q = rr.pos; H.face(q, d, 0.0); H.step(30); H.aimAt(q, q.y - 0.5); H.step(30); H.aimAt(q, q.y - 0.5); H.step(8);
          g.locator.barT = 0; H.step(2);
          const on = H.gemTop('story:onboard:food');
          // the same view without the keep-clear (the spot as it is now): how high it would sit
          const ub = g.locator.underBar; g.locator.underBar = (c, p, y) => y; H.step(2); const raw = H.gemTop('story:onboard:food'); g.locator.underBar = ub; H.step(2);
          return { on, raw };
        }, [mode, d]);
        const ok = !r.none && (!r.on || !r.on.inView || r.on.top >= r.on.bar + 4);
        gemRows.push({ vp: vp.join('x'), mode, d, ok, ...r });
        if (d === 1.8) await shot(`gem-food-${vp.join('x')}-${mode}`);
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 }); await ev(() => { window.__game.hints.gapT = 3; }); await run(10);
  await ev(() => { const g = window.__game; if (g.chase.mode !== 'third') g.chase.setMode('third'); window.__p.step(4); });
  for (const r of gemRows) log('gem', JSON.stringify(r));
  result('6 the food shelf\'s gem clear of the top bar: 1280x720, 1920x1080, first and third person, 1.2-2.6 m', gemRows.length === 12 && gemRows.every((r) => r.ok) && gemRows.some((r) => r.on && r.on.inView), gemRows.map((r) => `${r.vp} ${r.mode} ${r.d}: ${r.on ? `${r.on.top}/${r.on.bar}${r.on.inView ? '' : ' out'}` : 'none'} raw ${r.raw ? r.raw.top : '-'}`));

  // --- the shelves by keys: walk, a moment's wait, E, double-clicks --------------------------------------------------------
  const shelfBuy = async (id, want) => {
    const s = await ev((id) => { const g = window.__game, e = g.guide.get(id), r = e && g.guide.reach(e); return r ? { x: r.pos.x, y: r.pos.y, z: r.pos.z } : null; }, id);
    if (!s) return { none: true };
    await walkTo(s, 1.8);
    await ev((q) => { const H = window.__p; H.aimAt(q, q.y - 0.3); H.step(6); }, s);
    if (!/^shelf/.test((await ev(() => window.__p.target())) || '')) await ev((q) => { const H = window.__p; H.face(q, 1.2, 0.0); H.step(10); H.aimAt(q, q.y - 0.3); H.step(6); }, s);
    await realFor(2500);
    await page.keyboard.press('KeyE'); await run(10); await page.waitForTimeout(400);
    const bought = [];
    for (const wid of want) { const sel = `#shelf .sh-stock [data-id="${wid}"]`; if (!(await page.$(sel))) { bought.push({ wid, missing: true }); continue; } await page.dblclick(sel); await page.waitForTimeout(250); bought.push({ wid, money: await ev(() => window.__game.profile.money) }); }
    await page.keyboard.press('Escape'); await run(10);
    return { bought };
  };
  const food = await shelfBuy('story:onboard:food', ['meal:breakfast', 'meal:supper']);
  const lee = await shelfBuy('story:onboard:leeches', ['leeches']);
  log('bought', JSON.stringify({ food, lee }));

  // --- the canoe: walk to the dock, E in, W off ------------------------------------------------------------------------------
  const toCanoe = await ev(() => { const g = window.__game, H = window.__p, L = g.outfitter.layout(g.profile.home), f = L.dockFoot || L.dockLand || L.door, d = g.player.carry.drop; H.standAt(f.x, f.z); H.step(20); return { d: { x: d.x, z: d.z } }; });
  await walkTo(toCanoe.d, 2.2);
  await ev((q) => { const H = window.__p, g = window.__game; H.aimAt(q, g.player.foot ? g.player.foot.y - 0.3 : null); H.step(6); }, toCanoe.d);
  await realFor(1500);
  await page.keyboard.press('KeyE');
  await ev(async () => { const H = window.__p; for (let i = 0; i < 40 && window.__game.player.mode !== 'paddle'; i++) { H.step(5); await H.wait(20); } });
  if ((await ev(() => window.__game.player.mode)) !== 'paddle') { await page.keyboard.down('KeyE'); await ev(async () => { const H = window.__p; for (let i = 0; i < 40; i++) { H.step(3); await H.wait(25); } }); await page.keyboard.up('KeyE'); }
  await page.keyboard.down('KeyW'); await realFor(7000); await page.keyboard.up('KeyW');
  await realFor(9000); // (sitting still afloat: the rod's key)
  const out = await hintsNow();
  const loanAt = out.findIndex((h) => h.loan);
  const early = out.filter((h, i) => (loanAt < 0 || i < loanAt) && /canoe|paddle|push it off|beached/i.test(h.text));
  result('7 nothing about the canoe before there is one', early.length === 0, early);
  const st = out.find((h) => h.id === 'start');
  result('8 under way: the first line says the pencilled way and its key', st && /pencilled/.test(st.text) && /\{M\}/.test(st.raw), st || out.map((h) => h.id));

  // --- the evening on the water: the pencilled site named ----------------------------------------------------------------------
  await ev(() => { const g = window.__game, ss = g.day.sunriseSunset; g.day.setClock(g.day.year, g.day.doy, ss.set - 1.6); window.__p.step(10); });
  await run(240);
  const evening = (await hintsNow()).find((h) => h.id === 'evening');
  result('9 the evening names the site pencilled on your map', evening && /pencilled|your site/.test(evening.text), evening || null);

  // --- the site: on foot from its landing, the ring, dusk, dark, the night --------------------------------------------------
  const site = await ev(async () => {
    const g = window.__game, H = window.__p, s = g.starter.route(g.profile.home).siteRec, A = s.access, ss = g.day.sunriseSunset;
    g.day.setClock(g.day.year, g.day.doy, ss.set - 1.2);
    await g.player.teleport(A && A.landing ? A.landing[0] : s.x, A && A.landing ? A.landing[1] : s.z); await H.settle();
    for (let k = 0; k < 80 && !s.layout; k++) { H.step(10); await H.wait(80); }
    H.step(120);
    const land = A && A.landing ? { x: A.landing[0], z: A.landing[1] } : { x: s.x + 6, z: s.z };
    const top = A && A.top ? { x: A.top[0], z: A.top[1] } : land;
    H.standAt(top.x, top.z, H.yawTo(s)); H.step(20);
    const f = s.layout && s.layout.fire ? s.layout.fire : s;
    return { ring: { x: f.x, z: f.z }, site: { x: s.x, z: s.z } };
  });
  await walkTo(site.ring, 2.4, 30000);
  await realFor(8000);
  await ev(() => { const g = window.__game, ss = g.day.sunriseSunset; g.day.setClock(g.day.year, g.day.doy, ss.set - 0.3); window.__p.step(10); });
  await run(300);
  await ev(() => { const g = window.__game, ss = g.day.sunriseSunset; g.day.setClock(g.day.year, g.day.doy, ss.set + 0.9); window.__p.step(10); });
  await run(300);
  await realFor(8000);
  await ev(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 23.4); window.__p.step(10); });
  await run(450);
  await shot('night');

  // --- the record ----------------------------------------------------------------------------------------------------------
  const all = await hintsNow();
  writeFileSync(path.join(SHOTS, 'r4-tut-hints.json'), JSON.stringify({ hints: all, shots }, null, 1));
  for (const h of all) { const s = shots.find((q) => q.n === h.n); log('hint', String(h.n).padStart(2), h.at, h.id.padEnd(16), h.how.padEnd(5), JSON.stringify(h.text), s && s.file ? path.basename(s.file) : '(no shot: its card went before the look)'); }
  result('10 no "Done. Notices pay when you come in." with the tracker\'s pop-ups on', !all.some((h) => h.id === 'paylater'), all.map((h) => h.id));
  const missing = all.filter((h) => !shots.some((q) => q.n === h.n && q.file));
  result('11 every moment shown has its shot', all.length > 0 && missing.length === 0, { n: all.length, missing: missing.map((h) => `${h.n}:${h.id}`) });
  result('12 the moments seen over the first day and night (at least the view, the push-off\'s way, a site line, the dark)', ['view', 'start'].every((id) => all.some((h) => h.id === id)) && all.some((h) => ['site', 'ringempty', 'ringwood', 'dusk', 'lamp', 'bears'].includes(h.id)), all.map((h) => h.id));
  result('13 no page errors', errors.length === 0, { errors: errors.slice(0, 6) });
} catch (e) {
  result('the run', false, { error: String((e && e.stack) || e).slice(0, 2000) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
