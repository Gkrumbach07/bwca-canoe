// UX play (2026-11-13, the owner: "run through this ... in a UX, usability and playability way"): r3-final-play's
// new-player season, story on (no ?story=), at 1440 × 900, with a shot at every beat (the title, the wizard, the first
// frame, every line of the opening talk, the book, the push-off, the site, night one's notebook, the morning) and a
// census of what is on the screen in each (ux-census.json): what to read, where, how much.
// From: Round 3 final, played (after the checker's chk-play: real keys and mouse, W/E/I/Escape/1, clicks and double-clicks
// on the shelves; __game only to set a scene up: the clock, a place to stand and face, a teleport for a paddle or a
// night). A new season at home on 10 July from the empty dock to the first night's pay, PASS or FAIL at each step,
// and a 12-shot contact sheet (docs/build/shots/r3-final-contact.png):
//   1 the empty dock with the store's people about   2 the gem over the staffer   3 the escaped talk, the card up
//   4 the journal's Tasks page                         5 the food shelf's gem       6 the loaned canoe appearing
//   7 the push-off, a party's crew about the dock     8 a party paddling           9 the grate's gem at the site
//  10 the neighbours' camp at dusk                    11 night at the site        12 home: paid
//
//   APP=http://localhost:5301 node scripts/r3-final-play.mjs [--home 31] [--shots <dir>] [--sheet <png>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5301';
const HOME = Number(arg('home', 31));
const SHOTS = path.resolve(arg('shots', path.join(tmpdir(), 'ux-play')));
const SHEET = path.resolve(arg('sheet', path.join(tmpdir(), 'ux-play', 'ux-sheet.png')));
mkdirSync(SHOTS, { recursive: true }); mkdirSync(path.dirname(SHEET), { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 2000)); };
const sheet = []; // [{ n, file, cap }]

const HELPERS = () => {
  const g = window.__game, T = g.THREE, H = window.__p = { notes: [] };
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
  H.say = () => { const c = H.d().convo; return c && c.node ? String(c.node.say || '') : null; };
  H.cur = () => { g.guide.sync(); const c = g.guide.current(); return c ? { id: c.id, title: c.title, next: c.next } : null; };
  H.screen = () => ({ cur: H.cur(), tracker: g.tracker.state().text, card: g.tracker.state().shown, gems: g.locator.shown().filter((q) => !q.gone).map((q) => `${q.id}${q.main ? '*' : ''}`), talking: H.d().talking, target: g.pointer && g.pointer.target ? `${g.pointer.target.kind}:${g.pointer.target.label || ''}` : null });
  const note = g.hud.note.bind(g.hud);
  g.hud.note = (t, ...a) => { H.notes.push(`${g.day.hours.toFixed(2)} ${t}`); return note(t, ...a); };
  const shown = (o) => { for (let x = o; x; x = x.parent) { if (!x.visible) return false; if (x === g.scene) return true; } return false; };
  H.storeFigs = () => {
    const out = [];
    for (const b of g.npcs.bodies) {
      if (!b.who || b.lent || !shown(b.group)) continue;
      const v = b.who.person, f = v.figs[b.who.fig]; if (!f) continue;
      out.push({ key: `${v.key}#${b.who.fig}`, name: v.name, v, f, b, party: !!v.party, extra: !!v.extra, keeper: !!v.keeper, walking: !!(f.path && f.path.length) || (f.spec && f.spec.pose === 'walk') });
    }
    return out;
  };
  H.partyPeople = () => g.actors.people.filter((p) => p.bind && p.bind.body && p.bind.body.fig && shown(p.bind.body.fig.group));
  // on screen: a world point projected into the view
  H.onScreen = (x, y, z) => { const cam = g.camera; cam.updateMatrixWorld(); const v = new T.Vector3(x, y, z).project(cam); return v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1; };
  H.figsInView = () => H.storeFigs().filter((f) => !f.extra && H.onScreen(f.f.x, (f.f.y || 0) + 1, f.f.z)).length + H.partyPeople().filter((p) => H.onScreen(p.x, (p.y || g.player.groundAt(p.x, p.z)) + 1, p.z)).length;
  const box = new T.Box3(), R = new T.Vector3();
  H.top = (b) => { b.group.updateWorldMatrix(true, true); box.setFromObject(b.group, true); b.fig.bones.root.getWorldPosition(R); return { top: box.max.y, x: R.x, z: R.z }; };
  H.staffer = () => { const h = g.onboarding.extra, v = h && h.person; if (!v) return null; return H.storeFigs().find((q) => q.v === v || q.v.key === v.key) || { v, undrawn: true }; };
  H.gemScreen = (id) => {
    const m = g.locator.shown().find((q) => q.id === id && !q.gone); if (!m) return null;
    const W = innerWidth, Hh = innerHeight, cam = g.camera; cam.updateMatrixWorld();
    const pr = (y) => { const v = new T.Vector3(m.x, y, m.z).project(cam); return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * Hh, z: v.z }; };
    const c = pr(m.y), top = pr(m.y + 0.38 * m.s), bot = pr(m.y - 0.62 * m.s);
    return { id, c: { x: Math.round(c.x), y: Math.round(c.y) }, hPx: +Math.abs(bot.y - top.y).toFixed(1), inView: c.x > 0 && c.x < W && c.y > 0 && c.y < Hh && c.z < 1, s: +m.s.toFixed(3), y: +m.y.toFixed(2) };
  };
  H.near = (q, r) => H.storeFigs().filter((f) => !f.extra && Math.hypot(f.f.x - q.x, f.f.z - q.z) < r).map((f) => ({ key: f.key, name: f.name, act: f.f.act || null, walking: f.walking, d: +Math.hypot(f.f.x - q.x, f.f.z - q.z).toFixed(2) }));
  // the party legs on the move now (party-moves.js), with a boat drawn: the nearest first
  H.paddling = () => {
    const out = [];
    for (const L of g.moves ? g.moves.active.values() : []) { const b = L.boats && L.boats.find((x) => !x.hidden); if (L.seg && L.seg.kind === 'paddle' && b) out.push({ id: L.plan.id, x: b.x, z: b.z, d: Math.hypot(b.x - g.player.x, b.z - g.player.z) }); }
    return out.sort((a, b) => a.d - b.d);
  };
  // what is on the screen: the visible DOM blocks with words in them (the HUD, the talk, cards, chips, notes)
  H.census = () => {
    const out = [], W = innerWidth, Hh = innerHeight;
    const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < Hh; };
    const walk = (e, d) => {
      for (const c of e.children) {
        if (c.tagName === 'CANVAS' || c.tagName === 'SCRIPT' || c.tagName === 'STYLE') continue;
        if (!vis(c)) continue;
        const t = (c.innerText || '').replace(/\s+/g, ' ').trim();
        if (!t) continue;
        const r = c.getBoundingClientRect(), cs = getComputedStyle(c);
        const leaf = d >= 3 || ![...c.children].some((k) => (k.innerText || '').trim() && vis(k)) || t.length < 60;
        if (leaf) { out.push({ el: `${c.tagName.toLowerCase()}${c.id ? '#' + c.id : ''}${c.className && typeof c.className === 'string' ? '.' + c.className.trim().split(/\s+/).slice(0, 3).join('.') : ''}`, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), font: cs.fontSize, text: t.slice(0, 160) }); continue; }
        walk(c, d + 1);
      }
    };
    walk(document.body, 0);
    return out;
  };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const ana = await (await browser.newContext()).newPage();
async function goldIn(onBuf, offBuf, box) {
  return ana.evaluate(async ([a, b, box]) => {
    const load = async (s) => { const r = await fetch(`data:image/png;base64,${s}`); return createImageBitmap(await r.blob()); };
    const A = await load(a), B = await load(b), W = A.width, Hh = A.height;
    const cv = new OffscreenCanvas(W, Hh), cx = cv.getContext('2d');
    cx.drawImage(A, 0, 0); const da = cx.getImageData(0, 0, W, Hh).data; cx.clearRect(0, 0, W, Hh); cx.drawImage(B, 0, 0); const db = cx.getImageData(0, 0, W, Hh).data;
    const x0 = Math.max(0, box.x0 | 0), x1 = Math.min(W, box.x1 | 0), y0 = Math.max(0, box.y0 | 0), y1 = Math.min(Hh, box.y1 | 0);
    let gold = 0, diff = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      if (da[i] > 170 && da[i + 1] > 100 && da[i + 2] < 120 && da[i] - da[i + 2] > 90) gold++;
      if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 60) diff++;
    }
    return { gold, diff };
  }, [onBuf.toString('base64'), offBuf.toString('base64'), box]);
}

try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  const ev = (fn, a) => page.evaluate(fn, a);
  const census = {};
  const shot = async (name, n = null, cap = null) => { const f = path.join(SHOTS, `ux-${name}.png`); await page.screenshot({ path: f }); try { census[name] = await page.evaluate(() => (window.__p ? { hours: +window.__game.day.hours.toFixed(2), blocks: window.__p.census() } : null)); writeFileSync(path.join(SHOTS, 'ux-census.json'), JSON.stringify(census, null, 1)); } catch { /* a nicety */ } log('shot', f); if (n) sheet.push({ n, file: f, cap }); return f; };
  await page.exposeFunction('__pShot', (name, n, cap) => shot(name, n, cap));
  // the gem visible: a frame with it and one without, the gold counted in a box round it
  const gemCheck = async (id, name, n = null, cap = null) => {
    await ev(() => window.__p.step(3));
    const gs = await ev((id) => window.__p.gemScreen(id), id);
    if (!gs) { await shot(name, n, cap); return { none: true }; }
    const on = await page.screenshot(); const f = path.join(SHOTS, `ux-${name}.png`); writeFileSync(f, on); if (n) sheet.push({ n, file: f, cap });
    await ev(() => { window.__game.locator.enabled = false; window.__game.step(1 / 60, 1); });
    const off = await page.screenshot();
    await ev(() => { window.__game.locator.enabled = true; window.__p.step(10); });
    const r = Math.max(14, gs.hPx * 1.4);
    return { ...gs, ...(await goldIn(on, off, { x0: gs.c.x - r, x1: gs.c.x + r, y0: gs.c.y - r, y1: gs.c.y + r })) };
  };
  const visible = (r) => r && !r.none && r.inView && r.gold >= 12 && r.diff >= 12;
  const walkTo = async (q, stopAt = 1.6, maxMs = 25000) => {
    await page.keyboard.down('KeyW');
    const t0 = Date.now(); let r;
    while (Date.now() - t0 < maxMs) {
      r = await ev(([q, stopAt]) => { const g = window.__game, H = window.__p, p = g.player; const y = H.yawTo(q); g.chase.viewYaw = y; g.chase.forwardYaw = y; const d = Math.hypot(q.x - p.x, q.z - p.z); return { d: +d.toFixed(2), done: d < stopAt }; }, [q, stopAt]);
      if (r.done) break;
      await page.waitForTimeout(60);
    }
    await page.keyboard.up('KeyW'); await page.waitForTimeout(250); return r;
  };

  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.guide && g.locator && g.onboarding && g.npcs && g.actors && g.starter && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  await ev(HELPERS);
  await page.waitForTimeout(2500);
  await shot('00-title');

  // --- a new season by clicks ---------------------------------------------------------------------------------------
  await page.click('#btn-new');
  await page.waitForFunction(() => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await shot('w1-where');
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.waitForTimeout(500);
  await shot('w1b-where-picked');
  await page.click('[data-w="next"]').catch(() => {}); await page.waitForTimeout(500);
  await shot('w2-when');
  await ev(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.waitForTimeout(500);
  await shot('w3-ready');
  await page.click('#btn-start');
  await page.waitForFunction(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, { timeout: 180000, polling: 250 });
  await page.waitForTimeout(1500);
  await shot('s0-first-frame');
  await page.waitForTimeout(5000);
  await shot('s1-five-seconds');
  const start = await ev(() => { const g = window.__game; return { money: g.profile.money, long: g.profile.inventory.long.map((l) => l.id), hull: g.player.canoe.hull.visible, open: g.outfitter.open }; });
  if (start.open) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
  result('1 the season starts empty-handed: $40, nothing long, no canoe', start.money === 40 && !start.long.length && !start.hull, start);

  // --- the busiest hour: the empty dock, the store's people about ---------------------------------------------------
  const hour = await ev(() => {
    const g = window.__game, N = g.npcs, P = g.parties, ep = g.profile.home;
    let best = 9, n = -1;
    for (let h = 7.5; h <= 11.5; h += 0.05) { const k = N.storeParties(ep, P.today, h).reduce((a, e) => a + Math.min(3, e.party.size), 0); if (k > n) { n = k; best = h; } }
    g.day.setClock(g.day.year, g.day.doy, best - 0.2); window.__p.step(60);
    return { best: +best.toFixed(2), n };
  });
  log('busiest', JSON.stringify(hour));
  const dock = await ev(async () => {
    const g = window.__game, H = window.__p, o = g.outfitter, L = o.layout(g.profile.home);
    const b = (o.visit && o.visit.berth) || { side: L.dockSide, deck: L.dockDeck }, foot = L.dockFoot || L.dockLand || L.door;
    // from out along the dock, back toward its foot and the store: the berth in the near ground, the yard beyond
    const c = L.centre || L.door, ux = b.side.x - c.x, uz = b.side.z - c.z, n = Math.hypot(ux, uz) || 1;
    void ux; void uz; void n;
    const dk = b.deck || foot; H.standAt(dk.x, dk.z); H.look(H.yawTo(c), -0.04); H.step(30);
    const out = { hull: g.player.canoe.hull.visible, deck: [], inView: 0 };
    for (let k = 0; k < 1800; k++) {
      g.step(1 / 30, 1);
      if (k % 10) continue;
      if (b.deck) for (const x of H.near(b.deck, 1.1)) if (!x.walking && /load|unload|fish/.test(x.act || '')) out.deck.push({ ...x, k });
      const n0 = H.figsInView();
      if (n0 > out.inView) out.inView = n0;
      if (k >= 300 && n0 >= 2 && !out.shot) { out.shot = true; await window.__pShot('01-empty-dock', 1, 'The empty dock before the talk, the store’s people about'); }
      if (k % 60 === 0) await H.wait(2);
    }
    if (!out.shot) await window.__pShot('01-empty-dock', 1, 'The empty dock before the talk');
    out.hullAfter = g.player.canoe.hull.visible;
    return out;
  });
  result('2 the empty dock at the busiest hour: no canoe, nobody of the store\'s loading at your berth, people about', !dock.hull && !dock.hullAfter && dock.deck.length === 0 && dock.inView > 0, dock);

  // --- the gem over the staffer, the default camera ------------------------------------------------------------------
  await ev(() => { const g = window.__game, H = window.__p, sp = g.onboarding.spot(g.profile.home); if (g.chase.mode !== 'first') g.chase.setMode('first'); H.face(sp, 3.6, 0.1); H.step(90); });
  const gStaff = await gemCheck('story:onboard:talk', '02-gem-staffer', 2, 'The gem over the summer help (first person, 3.6 m)');
  await ev(() => { const g = window.__game; if (g.chase.mode !== 'third') g.chase.setMode('third'); window.__p.step(10); });
  const staff = await ev(() => { const s = window.__p.staffer(); return s && !s.undrawn ? { name: s.v.name, top: +window.__p.top(s.b).top.toFixed(2) } : null; });
  result('3 the gem over the staffer: she is drawn, the gem visible over her hat', staff && visible(gStaff) && gStaff.y - 0.62 * gStaff.s >= staff.top - 0.01, { gStaff, staff });

  // --- walk in, E on her, escape the first line: the card up -----------------------------------------------------------
  const way = await ev(() => { const g = window.__game, H = window.__p, L = g.outfitter.layout(g.profile.home), d = L.door, c = L.centre || L.door, dx = c.x - d.x, dz = c.z - d.z, n = Math.hypot(dx, dz) || 1, from = L.stepsFoot || { x: d.x - dx / n * 3, z: d.z - dz / n * 3 }; g.day.setClock(g.day.year, g.day.doy, 9.3); H.standAt(from.x - dx / n * 1.5, from.z - dz / n * 1.5, 0); H.step(10); const sp = g.onboarding.spot(g.profile.home); return [{ x: d.x - dx / n * 1.2, z: d.z - dz / n * 1.2 }, { x: d.x, z: d.z }, { x: d.x + dx / n * 1.4, z: d.z + dz / n * 1.4 }, { x: sp.x, z: sp.z }]; });
  for (let i = 0; i < way.length; i++) await walkTo(way[i], i === way.length - 1 ? 2.0 : 0.6, 30000);
  const pressETalk = async () => {
    const aim = await ev(() => { const g = window.__game, H = window.__p, s = H.staffer(); if (!s || s.undrawn) return { undrawn: true }; let t = H.top(s.b); H.aimAt({ x: t.x, z: t.z }, t.top - 0.25); H.step(6); let tg = H.screen().target; if (!/Brooke|summer|help/i.test(tg || '') && !/person:/.test(tg || '')) { H.face({ x: t.x, z: t.z }, 1.3, 0); H.step(10); t = H.top(s.b); H.aimAt({ x: t.x, z: t.z }, t.top - 0.25); H.step(6); tg = H.screen().target; } return { target: tg, name: s.v.name }; });
    await page.keyboard.press('KeyE');
    await ev(() => window.__p.step(6));
    const who = await ev(() => { const c = window.__p.d().convo; return c ? ((c.speaker && c.speaker.name) || c.name || null) : null; });
    return { ...aim, who, talking: await ev(() => window.__p.d().talking) };
  };
  const firstE = await pressETalk();
  result('4 E on the staffer opens her talk (not someone else\'s)', firstE.talking && firstE.who && firstE.name && firstE.who.includes(String(firstE.name).replace(/^the /, '')), firstE);
  await page.keyboard.press('Escape');
  const esc = await ev(() => { const g = window.__game, H = window.__p; H.step(30); if (g.outfitter.open) g.outfitter.hide(); H.step(10); return H.screen(); });
  await page.waitForTimeout(400);
  await shot('03-talk-escaped', 3, 'Escaped from the talk: the step stays, its card up');
  result('5 the talk escaped: the step stays the talk, its card up, its gem back', !esc.talking && esc.cur && esc.cur.id === 'story:onboard:talk' && esc.card && esc.gems.includes('story:onboard:talk*'), esc);

  // --- I: the journal at Tasks ------------------------------------------------------------------------------------------
  await page.keyboard.press('KeyI'); await ev(() => window.__p.step(6)); await page.waitForTimeout(500);
  const jn = await ev(() => { const J = window.__game.journal, left = document.querySelector('#journal .pp-quest'); return { open: J.open, side: J.side, tab: J.tab, sel: J.taskSel, page: left ? left.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : null }; });
  await shot('04-journal-tasks', 4, 'I: the journal at Tasks, the story step picked');
  result('6 I opens the journal at the Tasks page, the story step picked', jn.open && jn.tab === 'tasks' && jn.sel === 'story:onboard:talk', jn);
  await page.keyboard.press('KeyI'); await ev(() => window.__p.step(6));
  if (await ev(() => window.__game.journal.open)) { await page.keyboard.press('Escape'); await ev(() => window.__p.step(6)); }

  // --- the talk to its end with 1 ------------------------------------------------------------------------------------
  const op = await pressETalk();
  const transcript = [];
  const PREFER = ['Whose was it?', 'I\'ll take it.', 'I’ll do that.'];
  for (let i = 0; i < 30; i++) {
    const t = await ev(() => window.__p.d().talking); if (!t) break;
    await page.waitForTimeout(350);
    const c = await ev(() => { const c = window.__p.d().convo; return c ? { who: c.node && c.node.by || c.name, say: c.node && c.node.say, choices: (c.node && c.node.choices || []).map((o) => o.text) } : null; });
    transcript.push(c);
    await shot(`t${String(i).padStart(2, '0')}-talk`);
    let k = 0; for (const p of PREFER) { const j = c.choices.findIndex((x) => x.startsWith(p)); if (j >= 0) { k = j; break; } }
    await page.keyboard.press(`Digit${k + 1}`);
    await ev(async () => { const H = window.__p; H.step(3); await H.wait(60); if (window.__game.starter.pending) await window.__game.starter.pending; });
  }
  writeFileSync(path.join(SHOTS, 'ux-opening-talk.json'), JSON.stringify(transcript, null, 1));
  await page.waitForTimeout(600);
  await shot('t99-after-talk');
  await ev(() => window.__p.step(20));
  if (await ev(() => window.__game.outfitter.open)) { await page.keyboard.press('Escape'); await ev(() => window.__p.step(10)); }
  const fin = await ev(() => { const g = window.__game; return { done: g.onboarding.state.done, hull: g.player.canoe.hull.visible, job: g.tasks.active.filter((t) => t.kind === 'starter').map((t) => t.id), cur: window.__p.cur() }; });
  result('7 the talk finished: the loaned canoe, the starter job, the next step', fin.done && fin.hull && fin.job.length === 1 , { op, fin });

  // --- the canoe appearing at the berth ------------------------------------------------------------------------------
  const appear = await ev(() => { const g = window.__game, H = window.__p, d = g.player.carry.drop; if (g.outfitter.open) g.outfitter.hide(); if (g.chase.mode !== 'third') g.chase.setMode('third'); H.face(d, 6, -0.18); H.step(40); return { hull: g.player.canoe.hull.visible, near: H.near(d, 1.4).filter((x) => !x.walking) }; });
  await page.waitForTimeout(1200); await ev(() => window.__p.step(4));
  await shot('06-canoe-appears', 6, 'After the talk: the loaned canoe at your berth');
  result('8 the loaned canoe drawn at your berth, nobody standing on it', appear.hull && appear.near.length === 0, appear);

  // --- food and leeches at the shelves: walk, E, double-click ----------------------------------------------------------
  const shelfBuy = async (id, want, name, n, cap) => {
    const s = await ev((id) => { const g = window.__game, H = window.__p, L = g.outfitter.layout(g.profile.home), c = L.centre || L.counter; H.standAt(c.x, c.z); H.step(20); const e = g.guide.get(id), r = e && g.guide.reach(e); return { pos: r && { x: r.pos.x, y: r.pos.y, z: r.pos.z }, cur: window.__p.cur() }; }, id);
    if (!s.pos) return { none: true, s };
    // (the gem from the middle of the store, looked at; then up to the shelf)
    await ev((q) => { const g = window.__game, H = window.__p; if (g.chase.mode !== 'first') g.chase.setMode('first'); H.aimAt(q, q.y); H.step(30); H.aimAt(q, q.y); H.step(4); }, s.pos);
    let gem = await gemCheck(id, `${name}-gem`, n, cap);
    await ev(() => { const g = window.__game; if (g.chase.mode !== 'third') g.chase.setMode('third'); window.__p.step(6); });
    if (gem.none) { if (n) sheet.pop(); await ev((q) => { const H = window.__p; H.face(q, 3.2, 0.1); H.step(20); }, s.pos); gem = await gemCheck(id, `${name}-gem`, n, cap); } // (too near the camera there: from a step back)
    await walkTo(s.pos, 1.8);
    const blockers = await ev((q) => window.__p.near(q, 1.0).filter((x) => !x.walking), s.pos);
    await ev((q) => { const H = window.__p; H.aimAt(q, q.y - 0.3); H.step(6); }, s.pos);
    let tgt = await ev(() => window.__p.screen().target); const firstTgt = tgt;
    if (!/^shelf:/.test(tgt || '')) { await ev((q) => { const H = window.__p; H.face(q, 1.2, 0.0); H.step(10); H.aimAt(q, q.y - 0.3); H.step(6); }, s.pos); tgt = await ev(() => window.__p.screen().target); }
    await page.keyboard.press('KeyE'); await ev(() => window.__p.step(10)); await page.waitForTimeout(400);
    const opened = await ev(() => { const el = document.getElementById('shelf'); return !!(el && !el.hidden && el.offsetParent !== null); });
    const m0 = await ev(() => window.__game.profile.money), bought = [];
    for (const wid of want) {
      const sel = `#shelf .sh-stock [data-id="${wid}"]`;
      if (!(await page.$(sel))) { bought.push({ wid, missing: true }); continue; }
      await page.dblclick(sel); await page.waitForTimeout(250);
      bought.push({ wid, money: await ev(() => window.__game.profile.money) });
    }
    await page.keyboard.press('Escape'); await ev(() => window.__p.step(10)); await page.waitForTimeout(200);
    return { cur: s.cur, gem, blockers, firstTgt, tgt, opened, m0, bought };
  };
  const food = await shelfBuy('story:onboard:food', ['meal:breakfast', 'meal:supper'], '05-food', 5, 'The food shelf’s gem (first person, from the middle of the store)');
  result('9 the food shelf: its gem visible, nobody in the way, E opens it, a double-click buys', food.cur && food.cur.id === 'story:onboard:food' && visible(food.gem) && !food.blockers.length && /^shelf:/.test(food.firstTgt || '') && food.bought.some((b) => b.money != null && b.money < food.m0), food);
  const lee = await shelfBuy('story:onboard:leeches', ['leeches'], '05b-leeches', null, null);
  result('10 the tackle shelf: its gem visible, nobody in the way, leeches bought', lee.cur && lee.cur.id === 'story:onboard:leeches' && visible(lee.gem) && !lee.blockers.length && /^shelf:/.test(lee.firstTgt || '') && lee.bought.some((b) => b.money != null && b.money < lee.m0), lee);

  // --- the canoe at the busiest hour: E get in, push off with W, a party's crew about the dock ----------------------
  // (a party setting out from this dock today: the clock to the middle of its loading, so its crew is at the dock as
  // you push off, and it paddles out after you)
  const out0 = await ev(() => {
    const g = window.__game, P = g.parties, home = g.profile.home, now = g.day.hours, c = [];
    for (const { party, k } of P.legsOn(P.today)) { const pl = P.legPlan(party, k); if (!pl || !pl.from || pl.from.kind !== 'ep' || Number(pl.from.ep) !== Number(home)) continue; const la = pl.segs.find((q) => q.kind === 'launch'), pd = pl.segs.find((q) => q.kind === 'paddle'); if (!la || !pd || la.h0 < now + 0.05) continue; c.push({ id: pl.id, launch: la.h0, start: pl.start, paddle: pd.h0, boats: pl.crew && pl.crew.boats ? pl.crew.boats.length : null }); }
    c.sort((a, b) => a.launch - b.launch); return { now: +now.toFixed(2), pick: c[0] || null, n: c.length };
  });
  log('setting out', JSON.stringify(out0));
  const toCanoe = await ev(([h, pick]) => { const g = window.__game, H = window.__p, L = g.outfitter.layout(g.profile.home), f = L.dockFoot || L.dockLand || L.door, d = g.player.carry.drop; g.day.setClock(g.day.year, g.day.doy, pick ? pick.launch + (pick.start - pick.launch) * 0.35 : h - 0.05); H.step(90); H.standAt(f.x, f.z); H.step(20); return { d: { x: d.x, z: d.z }, cur: H.cur(), h: +g.day.hours.toFixed(3) }; }, [hour.best, out0.pick]);
  await walkTo(toCanoe.d, 2.2);
  await ev((q) => { const H = window.__p; H.face(q, 4.0, -0.15); H.step(30); }, toCanoe.d);
  const canoeGem = await gemCheck('story:onboard:canoe', '07a-canoe-gem');
  // (r4-final: at the hull itself, its gunwales; aimed under your own feet the view at Moose River North's moved dock,
  // whose berth lies a little above the bank you stand on, looked past the hull's stern: SWEEP showed every pitch from
  // level to the default third-person look on the hull)
  await ev((q) => {
    const g = window.__game, H = window.__p, h = g.player.canoe && g.player.canoe.hull, v = new g.THREE.Vector3(); if (h) h.getWorldPosition(v);
    const tries = [() => H.look(H.yawTo(q), -0.2), () => H.aimAt(q, h ? v.y + 0.3 : null), () => H.aimAt(q, g.player.foot ? g.player.foot.y - 0.3 : null)];
    for (const t of tries) { t(); H.step(6); const tg = g.pointer.target; if (tg && tg.kind === 'canoe') return; }
  }, toCanoe.d);
  const preE = await ev(() => { const g = window.__game, p = g.player, H = window.__p, h = g.player.canoe && g.player.canoe.hull, v = new g.THREE.Vector3(); if (h) h.getWorldPosition(v); const a = g.packs.hullAction(), d = p.carry && p.carry.drop; return { target: H.screen().target, p: { x: +p.x.toFixed(1), z: +p.z.toFixed(1), y: p.foot ? +p.foot.y.toFixed(2) : null, mode: p.mode }, hull: h ? { x: +v.x.toFixed(1), y: +v.y.toFixed(2), z: +v.z.toFixed(1) } : null, drop: d ? { x: +d.x.toFixed(1), z: +d.z.toFixed(1), h: +(d.heading || 0).toFixed(2) } : null, dist: d ? +g.inventory.hullDist({ x: d.x, z: d.z, heading: d.heading || 0 }, p.x, p.z).toFixed(2) : null, act: a ? `${a.e && a.e.verb}${a.e && a.e.why ? '/' + a.e.why : ''} · ${a.label}` : null, cam: { x: +g.camera.position.x.toFixed(1), y: +g.camera.position.y.toFixed(2), z: +g.camera.position.z.toFixed(1) } }; });
  log('before E at the canoe', JSON.stringify(preE));
  await page.keyboard.press('KeyE');
  await ev(async () => { const H = window.__p; for (let i = 0; i < 40 && window.__game.player.mode !== 'paddle'; i++) { H.step(5); await H.wait(20); } });
  if ((await ev(() => window.__game.player.mode)) !== 'paddle') { await page.keyboard.down('KeyE'); await ev(async () => { const H = window.__p; for (let i = 0; i < 40; i++) { H.step(3); await H.wait(25); } }); await page.keyboard.up('KeyE'); }
  const p0 = await ev(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
  await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
  const crew = await ev(async () => {
    const g = window.__game, H = window.__p, L = g.outfitter.layout(g.profile.home), f = L.dockFoot || L.dockLand || L.door;
    H.step(10); H.look(H.yawTo(f), -0.08); H.step(20);
    let n = H.figsInView(), k = 0;
    for (; k < 600 && n < 2; k++) {
      g.step(1 / 30, 1);
      if (k % 10) continue;
      const pp = H.partyPeople(); if (pp.length) { const cx = pp.reduce((a, q) => a + q.x, 0) / pp.length, cz = pp.reduce((a, q) => a + q.z, 0) / pp.length; H.look(H.yawTo({ x: cx, z: cz }), -0.06); g.step(1 / 30, 2); }
      n = H.figsInView();
    }
    return { n, k, mode: g.player.mode, party: H.partyPeople().length, h: +g.day.hours.toFixed(3) };
  });
  await shot('07-push-off', 7, 'Pushed off: the store’s people and a party’s crew about the dock');
  const off = await ev((p0) => { const g = window.__game, H = window.__p; return { mode: g.player.mode, moved: +Math.hypot(g.player.x - p0.x, g.player.z - p0.z).toFixed(1), cur: H.cur(), tracker: H.screen().tracker }; }, p0);
  result('11 the canoe: its gem visible, E in, W off; the tutorial ends with the job\'s next line; people about the dock', visible(canoeGem) && off.mode === 'paddle' && off.moved > 3 && !(off.cur && /^story:onboard/.test(off.cur.id)) && crew.n >= 1, { canoeGem, crew, off });

  // --- a party paddling (party-moves.js): the nearest on the water, the camera on it ---------------------------------
  const paddle = await ev(async () => {
    const g = window.__game, H = window.__p;
    let list = H.paddling(), k = 0;
    for (; k < 80 && !(list.length && list[0].d < 260); k++) { H.step(45); await H.wait(10); list = H.paddling(); }
    const b = list[0]; if (!b) return { none: true, k, h: +g.day.hours.toFixed(3), legs: [...g.moves.active.values()].map((L) => `${L.plan.id}:${L.seg && L.seg.kind}`).slice(0, 6) };
    // (a teleport-free hop: in your canoe 30 m off theirs, on the water, looking at them)
    const p = g.player, W = g.world;
    if (b.d > 60) { for (const [a, r] of [[0, 30], [1.6, 30], [3.1, 30], [4.7, 30], [0.8, 45], [2.4, 45]]) { const x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r; if (W.shoreAt(x, z) < -4) { p.x = x; p.z = z; p.speed = 0; p.yawRate = 0; break; } } }
    for (let i = 0; i < 6; i++) { const c = H.paddling().find((q) => q.id === b.id) || b; p.heading = H.yawTo(c); H.look(H.yawTo(c), -0.05); H.step(5); await H.wait(20); }
    // (first person, the party a little off the bow: dead ahead it would sit behind your own bow and pack)
    if (g.chase.mode !== 'first') { g.chase.setMode('first'); for (let i = 0; i < 4; i++) { const c = H.paddling().find((q) => q.id === b.id) || b; H.look(H.yawTo(c) + 0.35, -0.02); g.chase.viewYaw = H.yawTo(c); g.chase.forwardYaw = g.chase.viewYaw; H.step(4); } }
    const c = H.paddling().find((q) => q.id === b.id) || b;
    return { id: b.id, d: +Math.hypot(c.x - p.x, c.z - p.z).toFixed(1), k, mode: p.mode, inView: H.onScreen(c.x, (W.levelAt ? W.levelAt(c.x, c.z) : 0) + 0.5, c.z) };
  });
  await shot('08-party-paddling', 8, 'A party paddling out from the store (first person)');
  await ev(() => { const g = window.__game; if (g.chase.mode !== 'third') g.chase.setMode('third'); window.__p.step(6); });
  result('12 a party paddling, in view', !paddle.none && paddle.inView && paddle.d < 80, paddle);

  // --- the starter site: the grate's gem, the parts by E, the neighbours at dusk, the night ----------------------------
  const site = await ev(async () => {
    const g = window.__game, H = window.__p, home = g.profile.home, t = g.tasks.active.find((x) => x.kind === 'starter');
    const s = g.starter.route(home).siteRec, A = s.access;
    g.day.setClock(g.day.year, g.day.doy, 17.5);
    await g.player.teleport(A && A.landing ? A.landing[0] : s.x, A && A.landing ? A.landing[1] : s.z); await H.settle();
    for (let k = 0; k < 80 && !s.layout; k++) { H.step(10); await H.wait(80); }
    H.step(240); g.guide.sync();
    const id = t ? `task:${t.id}` : null, e = id && g.guide.get(id), r = e && g.guide.reach(e);
    return { id, pos: r && { x: r.pos.x, y: r.pos.y, z: r.pos.z }, site: { x: s.x, z: s.z } };
  });
  await page.waitForTimeout(6000); // (the lake's name card fades)
  await ev(([pos]) => { const g = window.__game, H = window.__p; if (g.chase.mode !== 'third') g.chase.setMode('third'); H.face(pos, 4, -0.05); H.step(150); if (g.chase.mode !== 'first') g.chase.setMode('first'); H.aimAt(pos, pos.y - 0.4); H.step(10); }, [site.pos]);
  const grate = site.pos ? await gemCheck(site.id, '09-grate-gem', 9, 'At the starter site: the gem over the grate (first person, 4 m)') : { none: true };
  await ev(() => { const g = window.__game; if (g.chase.mode !== 'third') g.chase.setMode('third'); window.__p.step(6); });
  result('13 the grate\'s gem at the starter site, visible at the default camera', visible(grate), grate);
  const parts = [];
  for (const k of ['grate', 'latrine', 'pad']) {
    const pr = await ev(async (k) => { const g = window.__game, H = window.__p, t = g.tasks.active.find((x) => x.kind === 'starter'); if (!t) return { none: 'no job' }; g.day.setClock(g.day.year, g.day.doy, 18); const q = g.guide.partsOf(t) && g.guide.partsOf(t)[k]; if (!q) return { none: 'no part' }; if (g.chase.mode !== 'first') g.chase.setMode('first'); H.face({ x: q.x, z: q.z }, 2.0, -0.5); H.step(30); const gy = g.player.groundAt(q.x, q.z); H.aimAt({ x: q.x, z: q.z }, gy + 0.25); H.step(6); return { target: H.screen().target }; }, k);
    if (pr.none) { parts.push({ k, ...pr }); continue; }
    await page.keyboard.press('KeyE'); await ev(() => window.__p.step(20));
    pr.after = await ev((k) => { const g = window.__game, t = g.tasks.active.find((x) => x.kind === 'starter'); return { checked: !!(t && t.checks && t.checks[k]), status: t && t.status }; }, k);
    parts.push({ k, ...pr });
  }
  await ev(() => { const g = window.__game; if (g.chase.mode !== 'third') g.chase.setMode('third'); });
  result('14 the site\'s three parts checked by E on the dot, the latrine too: the job done', parts.length === 3 && parts.every((q) => q.after && q.after.checked) && parts[2].after.status === 'done', parts);
  const nb = await ev(async (s) => {
    const g = window.__game, H = window.__p;
    g.day.setClock(g.day.year, g.day.doy, 20.4); H.step(60);
    let best = null, bd = Infinity;
    for (let k = 0; k < 20 && !best; k++) { for (const D of g.partyCamps.drawn.values()) { const c = g.parties.live.get(D.key), st = c && c.site; if (st) { const d = Math.hypot(st.x - s.x, st.z - s.z); if (d < bd && d > 20) { bd = d; best = st; } } } if (!best) H.step(60); }
    // (none drawn from here tonight: the nearest party camped anywhere, from the parties' own list)
    if (!best) for (const c of g.parties.live.values()) { const st = c && c.site; if (st && Number.isFinite(st.x)) { const d = Math.hypot(st.x - s.x, st.z - s.z); if (d < bd && d > 20) { bd = d; best = st; } } }
    if (!best) return { none: true };
    if (bd > 250) { await g.player.teleport(best.x, best.z); await H.settle(); for (let k = 0; k < 40; k++) { H.step(10); await H.wait(40); } }
    // stand off their camp, then off the nearest of their people drawn, looking at them
    const L = best.layout, fire = L && L.fire ? L.fire : best;
    H.standAt(fire.x + 12, fire.z); H.step(120);
    const pf = H.storeFigs().filter((f) => f.party).sort((a, b) => Math.hypot(a.f.x - fire.x, a.f.z - fire.z) - Math.hypot(b.f.x - fire.x, b.f.z - fire.z))[0];
    const q = pf ? { x: pf.f.x, z: pf.f.z } : fire;
    let at = null; for (const r of [8, 11, 6, 14]) { for (let i = 0; i < 12 && !at; i++) { const a = (i / 12) * Math.PI * 2, x = q.x + Math.cos(a) * r, z = q.z + Math.sin(a) * r; if (g.world.shoreAt(x, z) > 1.5 && Math.abs(g.player.groundAt(x, z) - g.player.groundAt(q.x, q.z)) < 2.5) at = { x, z }; } if (at) break; }
    if (at) H.standAt(at.x, at.z);
    if (g.chase.mode !== 'first') g.chase.setMode('first');
    H.look(H.yawTo(q), -0.06); H.step(60); H.look(H.yawTo(pf ? { x: pf.f.x, z: pf.f.z } : q), -0.04); H.step(6);
    const people = H.storeFigs().filter((f) => f.party && H.onScreen(f.f.x, (f.f.y || 0) + 1, f.f.z)).length;
    return { d: Math.round(bd), people, at: !!at, pf: pf ? pf.key : null };
  }, site.site);
  await shot('10-neighbours-dusk', 10, 'The neighbours’ camp at dusk (20:24, first person)');
  await ev(() => { const g = window.__game; if (g.chase.mode !== 'third') g.chase.setMode('third'); window.__p.step(6); });
  result('15 the neighbours\' camp at dusk, its people in view', !nb.none && nb.people > 0, nb);
  const night = await ev(async (s) => {
    const g = window.__game, H = window.__p;
    if (Math.hypot(s.x - g.player.x, s.z - g.player.z) > 250) { await g.player.teleport(s.x + 4, s.z + 4); await H.settle(); for (let k = 0; k < 40; k++) { H.step(10); await H.wait(40); } }
    g.day.setClock(g.day.year, g.day.doy, 23.2); H.standAt(s.x + 6, s.z + 6); H.look(H.yawTo(s), -0.1); H.step(120);
    return { hours: +g.day.hours.toFixed(2), sun: g.day.sunAltitude != null ? +g.day.sunAltitude.toFixed(3) : null };
  }, site.site);
  await shot('11-night', 11, 'Night at the starter site (23:12)');
  result('16 night at the site', night.hours > 22.5, night);

  // --- night one: the old tent pitched at the site, slept in: the notebook's cutscene, the morning, the book's Walt side
  const n1 = await ev(async (si) => {
    const g = window.__game, H = window.__p, camp = g.camp, inv = g.profile.inventory, p = g.player;
    const c = g.world.campsites.find((q) => Math.hypot(q.x - si.x, q.z - si.z) < 1) || null;
    if (!c || !c.layout) return { error: 'no site layout' };
    if (Math.hypot(c.x - p.x, c.z - p.z) > 200) { await g.player.teleport(c.x, c.z); await H.settle(); for (let k = 0; k < 40; k++) { H.step(10); await H.wait(40); } }
    const L = c.layout, pad = L.pad;
    p.standAt({ x: pad.x + pad.fdx * 2.2, z: pad.z + pad.fdz * 2.2, heading: Math.atan2(-pad.fdx, pad.fdz), drop: { x: L.fire.x + 1.5, z: L.fire.z + 1.5, heading: 0 } });
    const pack = inv.containers.find((k) => k.item === 'waltpack'); if (pack) { pack.where = 'ground'; pack.at = { x: pad.x + pad.fdx * 1.6, z: pad.z + pad.fdz * 1.6 }; inv.emit('containers'); }
    H.step(30);
    const tent = camp.tentInReach(); if (!tent) return { error: 'no tent in reach', pack: !!pack };
    let s = null;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1.5, 1.5], [-1.5, -1.5]]) { s = camp.ghostAt(c, tent.def.id, pad.x + dx, pad.z + dz, pad.fdx, pad.fdz); if (s && s.ok) break; }
    if (!s || !s.ok) return { error: `no spot: ${s && s.why}` };
    if (!camp.stake(s, tent, c) || !camp.camp) return { error: 'not staked' };
    camp.setStage(camp.camp, 4); camp.pitched();
    H.look(H.yawTo(pad), -0.12); H.step(60);
    return { item: camp.camp.item, carried: g.walt.carried ? g.walt.carried() : null };
  }, site.site);
  log('night one setup', JSON.stringify(n1));
  await shot('n0-tent-pitched');
  await ev(() => { const g = window.__game; g.camp.sleep('tent', 'first'); });
  const beats = [];
  for (let k = 0; k < 600; k++) {
    await ev(() => window.__p.step(6));
    const b = await ev(() => { const c = window.__game.walt.cut; return c && c.active ? { beat: c.beat, t: +c.t.toFixed(1) } : null; });
    if (!b) { if (beats.length) break; continue; }
    if (!beats.length || beats[beats.length - 1].beat !== b.beat) { beats.push(b); await page.waitForTimeout(250); await shot(`n1-${b.beat.replace('.', '')}`); }
    if (b.beat === 'cut.11' && b.t > 12) break;
  }
  log('night one beats', beats.map((b) => b.beat).join(','));
  const ask = await ev(() => { const el = document.getElementById('nightone'), pg = el && el.querySelector('.no-page'); return { ask: !!(el && el.classList.contains('ask')), hint: el ? (el.querySelector('.no-hint') || {}).textContent : null, pageW: pg ? Math.round(pg.getBoundingClientRect().width) : null }; });
  await shot('n1-cut11-held');
  result('16b night one: the held last page says "any key or a click"', ask.ask && /any key/.test(ask.hint || ''), ask);
  await page.keyboard.press('Space');
  for (let k = 0; k < 60; k++) { await ev(() => window.__p.step(30)); const done = await ev(() => { const g = window.__game; return !g.walt.cut.active && !g.veil.active && !g.camp.night; }); if (done) break; }
  await page.waitForTimeout(1500);
  await shot('n2-morning');
  await page.waitForTimeout(4000);
  await shot('n3-morning-later');
  await ev(() => { const g = window.__game, j = g.journal; j.show('pack'); j.setSide('walt'); window.__p.step(4); });
  await page.waitForTimeout(700);
  await shot('n4-book-walt');
  await page.keyboard.press('Escape'); await ev(() => window.__p.step(6));
  if (await ev(() => window.__game.journal.open)) { await page.keyboard.press('Escape'); await ev(() => window.__p.step(6)); }
  await ev(() => { const g = window.__game, j = g.journal; j.show('pack'); window.__p.step(4); });
  await page.waitForTimeout(700);
  await shot('n5-book-pack');
  await page.keyboard.press('Escape'); await ev(() => window.__p.step(6));
  if (await ev(() => window.__game.journal.open)) { await page.keyboard.press('Escape'); await ev(() => window.__p.step(6)); }

  // --- home the next day: the trip's end, paid -----------------------------------------------------------------------
  const home = await ev(async () => {
    const g = window.__game, H = window.__p, ep = g.profile.home, L = g.outfitter.landing(ep), m0 = g.profile.money;
    const t = g.tasks.active.find((x) => x.kind === 'starter'), pay = t ? g.tasks.pay(t, t.from) : null;
    g.day.setClock(g.day.year, g.day.doy + 1, 10);
    await g.player.teleport(L.x, L.z); await H.settle();
    for (let i = 0; i < 40; i++) { H.step(10); await H.wait(40); }
    const Lo = g.outfitter.layout(ep), f = Lo.dockFoot || Lo.dockLand || Lo.door;
    H.standAt(f.x, f.z); H.step(30);
    for (let k = 0; k < 40 && !(g.record && g.record.shown) && g.profile.money === m0; k++) { H.step(30); await H.wait(30); }
    H.step(20);
    return { m0, money: g.profile.money, pay, shown: !!(g.record && g.record.shown), active: g.trip.active, notes: H.notes.slice(-4), job: g.tasks.active.filter((x) => x.kind === 'starter').length };
  });
  await page.waitForTimeout(1200); await ev(() => window.__p.step(10));
  await shot('12-home-paid', 12, `Home the next day: the first night paid (+$${home.money - home.m0})`);
  result('17 home the next day: the first night\'s job paid', home.money > home.m0 && home.job === 0, home);
  result('18 no page errors', errors.length === 0, { errors: errors.slice(0, 6) });

  // --- the contact sheet: 12 shots, 3 across ---------------------------------------------------------------------------
  const list = sheet.filter((s) => s.n).sort((a, b) => a.n - b.n);
  const sp = await (await browser.newContext({ viewport: { width: 1920, height: 4 * 440 } })).newPage();
  const cells = list.map((s) => `<figure><img src="data:image/png;base64,${readFileSync(s.file).toString('base64')}"><figcaption>${s.n}. ${s.cap || ''}</figcaption></figure>`).join('');
  await sp.setContent(`<!doctype html><style>body{margin:0;background:#181816;display:grid;grid-template-columns:repeat(3,640px);font:15px Arial,sans-serif;color:#f0e8d2}figure{margin:0;width:640px;height:440px;position:relative}img{width:640px;height:400px;display:block}figcaption{height:40px;line-height:40px;padding:0 10px;white-space:nowrap;overflow:hidden}</style>${cells}`);
  await sp.waitForTimeout(500);
  await sp.screenshot({ path: SHEET, fullPage: true });
  log('sheet', SHEET, list.map((s) => s.n).join(','));
  
} catch (e) {
  result('the run', false, { error: String((e && e.stack) || e).slice(0, 2000) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
