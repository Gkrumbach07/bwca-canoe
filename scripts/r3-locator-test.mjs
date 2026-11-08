// Round 3, builder C (docs/build/r3-contract.md §6): the golden locator (src/locator.js), headless Chromium against a
// running Vite, each check printed PASS or FAIL, a screenshot at each step:
//   0 the program count: the same with the gems drawn as without them (and the title's count noted)
//   1 on each step of the main path, the gem is over its target (within 0.6 m in x/z, its point above the target's top,
//     clear of every mesh: never in a wall, a shelf or a head): the staffer, the food shelf, the tackle shelf, the canoe
//     at the dock (A's steps when its source gives them; otherwise stand-ins with the same ids and guide.spot)
//   2 it reads by day, at dusk and at night (the pixel at the gem's centre is gold)
//   3 an escape keeps it on the staffer; a conversation hides it while it lasts
//   4 fade: full near, fading towards the reach's edge, gone past it; a reach of 500 m is held to 120 (nothing from
//     150 m); a starter site's grate shows at the site and not from 200 m
//   5 done: a step done, its gem shrinks away and is gone within half a second; the next step's gem comes
//   6 no page errors
//
//   npx vite --port 5255 --strictPort &
//   APP=http://localhost:5255 node scripts/r3-locator-test.mjs [--home 31] [--shots <dir>]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5255';
const HOME = Number(arg('home', 31));
const SHOTS = arg('shots', path.join(tmpdir(), 'r3-locator-shots'));
mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1200)); };
const gold = (p) => !!(p && p.rgb && p.rgb[0] > 150 && p.rgb[0] - p.rgb[2] > 70 && p.rgb[1] > p.rgb[2]);
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, H = window.__r3l = {}, T = g.THREE;
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  // stand d metres from a point, facing it (heading: x = cos h, z = -sin h)
  H.face = (q, d, ang = 0) => {
    const p = g.player, a = Math.atan2(p.z - q.z, p.x - q.x) + ang;
    const x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d;
    H.standAt(x, z, Math.atan2(-(q.z - z), q.x - x));
  };
  H.talkThrough = async (most = 14) => {
    const d = g.npcs.dialogue;
    for (let i = 0; i < most && d.convo; i++) { d.choose(0); await H.wait(30); }
    return { talking: d.talking };
  };
  H.gem = (id) => g.locator.shown().find((q) => q.id === id) || null;
  // the gem against its target: the offset in x/z, the point's height over the target's top, and whether anything drawn
  // lies within the gem (rays from its centre out to its own size: a wall, a shelf, a head)
  const ray = new T.Raycaster(), dirs = [];
  for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]]) dirs.push(new T.Vector3(x, y, z).normalize());
  const shownChain = (o) => { for (let q = o; q; q = q.parent) { if (!q.visible) return false; if (q.name === 'r3-locator') return false; } return true; };
  H.clear = (gm) => {
    const c = new T.Vector3(gm.x, gm.y, gm.z), hits = [];
    for (const d of dirs) {
      ray.set(c, d); ray.far = gm.s * 0.65 + 0.05; ray.camera = g.camera;
      const hs = ray.intersectObjects(g.scene.children, true).filter((h) => h.object.isMesh && shownChain(h.object));
      if (hs.length) hits.push(`${hs[0].object.name || hs[0].object.parent?.name || '?'}@${hs[0].distance.toFixed(2)}`);
    }
    return hits;
  };
  H.check = (id) => {
    const e = g.guide.get(id), r = e && g.guide.reach(e), gm = H.gem(id);
    if (!r || !gm) return { id, has: !!e, reach: !!r, gem: !!gm, marks: g.guide.marks().map((q) => q.id), shown: g.locator.shown().map((q) => q.id) };
    const fl = g.outfitter.visit && g.outfitter.layout(g.outfitter.visit.ep);
    return { id, top: fl && fl.inside && fl.inside(gm.x, gm.z) ? +(gm.y + 0.38 * gm.s - fl.floorY).toFixed(2) : null, off: +Math.hypot(gm.x - r.pos.x, gm.z - r.pos.z).toFixed(3), point: +(gm.y - 0.62 * gm.s - r.pos.y).toFixed(3), y: +gm.y.toFixed(2), s: +gm.s.toFixed(3), opacity: +gm.opacity.toFixed(2), main: gm.main, d: +r.d.toFixed(1), hits: H.clear(gm), label: e.target.label, key: e.target.key };
  };
  // the pixel at the gem's centre as drawn (read straight after the draw, in the same task)
  H.pixel = (id) => {
    const gm = H.gem(id); if (!gm) return null;
    g.step(1 / 60, 1);
    const R = g.renderer, gl = R.getContext(), v = new T.Vector3(gm.x, gm.y, gm.z).project(g.camera), sz = R.getDrawingBufferSize(new T.Vector2());
    if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || v.z > 1) return { off: true, v: [v.x, v.y, v.z] };
    // a 9 by 9 block about the centre (a facet's edge or the bob can put the very centre on a seam): its most golden pixel
    const px = Math.round((v.x + 1) / 2 * sz.x), py = Math.round((v.y + 1) / 2 * sz.y), N = 9, out = new Uint8Array(N * N * 4);
    R.setRenderTarget(null); gl.readPixels(px - 4, py - 4, N, N, gl.RGBA, gl.UNSIGNED_BYTE, out);
    let best = 0;
    for (let i = 0; i < N * N; i++) if (out[i * 4] - out[i * 4 + 2] > out[best * 4] - out[best * 4 + 2]) best = i;
    return { rgb: [out[best * 4], out[best * 4 + 1], out[best * 4 + 2]], at: [px, py] };
  };
  // frame a gem for the shot and the pixel: the camera from the player's side of it, a little above, looking at it
  // (chase.focus, the close-up the conversations use; H.unframe lets it go)
  H.frame = (id, back = 2.4) => {
    const gm = H.gem(id), p = g.player; if (!gm) return false;
    let dx = p.x - gm.x, dz = p.z - gm.z; const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
    g.chase.focus = { pos: new T.Vector3(gm.x + dx * back, gm.y + 0.35, gm.z + dz * back), look: new T.Vector3(gm.x, gm.y - 0.25, gm.z) };
    g.chase.first = true; H.step(4);
    return true;
  };
  H.unframe = () => { g.chase.focus = null; g.chase.snap(); H.step(2); };
  H.gold = (p) => !!(p && p.rgb && p.rgb[0] > 150 && p.rgb[0] - p.rgb[2] > 70 && p.rgb[1] > p.rgb[2]);
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
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.guide && g.locator && g.onboarding && typeof g.step === 'function' && g.title.state === 'title' && g.prewarmed; }, null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
  const pTitle = await page.evaluate(() => ({ programs: window.__game.renderer.info.programs.length, prewarmed: window.__game.prewarmed }));
  log('loaded', JSON.stringify(pTitle));

  // a new season at home
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);

  // 0 the programs, without and with the gems (the staffer's, and two other marks in the store)
  const zero = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3l, o = g.outfitter, home = g.profile.home;
    if (o.open) o.hide();
    g.day.setClock(g.day.year, g.day.doy, 9);
    const L = o.layout(home), at = L.counter || L.centre;
    H.standAt(at.x + 0.5, at.z + 0.5); H.step(30);
    g.locator.enabled = false; H.step(30); g.step(1 / 60, 1);
    const p0 = g.renderer.info.programs.length;
    g.guide.add({ id: 'board:r3l:a', kind: 'board', title: 'a', target: { kind: 'place', key: 'board', store: home, near: 20, pos: g.guide.spot(home, 'board') } });
    g.guide.add({ id: 'side:r3l:b', kind: 'side', title: 'b', target: { kind: 'place', key: 'maps', store: home, near: 20, pos: g.guide.spot(home, 'maps') } });
    g.locator.enabled = true; H.step(30); g.step(1 / 60, 1);
    const p1 = g.renderer.info.programs.length, shown = g.locator.shown().map((q) => q.id);
    g.day.setClock(g.day.year, g.day.doy, 23); H.step(10); g.step(1 / 60, 1);
    const p2 = g.renderer.info.programs.length;
    g.day.setClock(g.day.year, g.day.doy, 9); H.step(5);
    return { p0, p1, p2, shown };
  });
  await shot('0-store-three-marks');
  result('0 the gems add no shader program', zero.p1 === zero.p0 && zero.p2 === zero.p0 && zero.shown.length >= 2, { ...zero, title: pTitle });
  await page.evaluate(() => { const g = window.__game; g.guide.remove('board:r3l:a'); g.guide.remove('side:r3l:b'); });

  // 1a the staffer
  const one = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3l, cur = g.guide.current();
    if (!cur || !cur.target) return { cur: cur && cur.id };
    const r = g.guide.reach(cur); H.face(r.pos, 3.2); H.step(60);
    const c = H.check(cur.id); H.frame(cur.id, 2.6);
    return { cur: cur.id, ...c, px: H.pixel(cur.id) };
  });
  await shot('1a-staffer-day');
  result('1a the gem over the staffer', one.cur === 'story:onboard:talk' && one.off < 0.6 && one.point > 0.02 && one.top < 2.45 && one.hits && !one.hits.length && one.main && gold(one.px), one);
  // 2 day, dusk, night
  const two = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3l, out = {};
    for (const [k, h] of [['day', 9], ['dusk', 20.7], ['night', 23.5]]) { g.day.setClock(g.day.year, g.day.doy, h); H.step(20); out[k] = H.pixel('story:onboard:talk'); }
    return out;
  });
  await shot('2-staffer-night');
  await page.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 20.7); window.__r3l.step(10); });
  await shot('2-staffer-dusk');
  await page.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy, 9); window.__r3l.step(10); window.__r3l.unframe(); });
  const H2 = await page.evaluate(() => window.__r3l.gold.toString());
  result('2 it reads gold by day, at dusk and at night (in the store)', gold(two.day) && gold(two.dusk) && gold(two.night), { ...two, rule: H2 });

  // 3 escape: the gem stays on the staffer; a conversation hides it while it lasts
  const three = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3l, o = g.outfitter;
    o.openHot('counter', o.visit.landing); H.step(4);
    const talking = g.npcs.dialogue.talking, during = g.locator.shown().map((q) => q.id);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); H.step(4);
    if (o.open) o.hide();
    H.step(20); g.guide.sync();
    const cur = g.guide.current();
    return { talking, during, after: g.dialogue ? null : g.npcs.dialogue.talking, cur: cur && cur.id, gem: !!H.gem('story:onboard:talk') };
  });
  result('3 a conversation hides the gem; escaped, it is back on the staffer', three.talking && !three.during.length && !three.after && three.cur === 'story:onboard:talk' && three.gem, three);

  // the talk through; then the rest of the path, A's steps when its source has them, else stand-ins
  const path1 = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3l, o = g.outfitter, G = g.guide, home = g.profile.home;
    o.openHot('counter', o.visit.landing); H.step(4);
    await H.talkThrough();
    if (g.starter && g.starter.pending) await g.starter.pending;
    if (o.open) o.hide();
    H.step(20); G.sync();
    const real = ['story:onboard:food', 'story:onboard:leeches', 'story:onboard:canoe'].filter((id) => G.get(id));
    const talkGone = !G.get('story:onboard:talk');
    // A's targets if it gave them, else the contract's (§3), served from one source the rig steps through
    const tg = {
      'story:onboard:food': G.get('story:onboard:food')?.target || { kind: 'place', key: 'food', label: 'the food shelf', store: home, near: 30, pos: G.spot(home, 'food') },
      'story:onboard:leeches': G.get('story:onboard:leeches')?.target || { kind: 'place', key: 'tackle', label: 'the tackle shelf', store: home, near: 30, pos: G.spot(home, 'tackle') },
      'story:onboard:canoe': G.get('story:onboard:canoe')?.target || { kind: 'thing', key: 'canoe', label: 'your canoe', store: home, near: 40, pos: G.spot(home, 'canoe') },
    };
    H.path = [['story:onboard:food', 1, 'Buy food at the food shelf'], ['story:onboard:leeches', 2, 'Buy leeches at the tackle shelf'], ['story:onboard:canoe', 3, 'Your canoe is at the dock']];
    H.left = new Set(H.path.map((q) => q[0]));
    G.source('onboarding', () => H.path.filter((q) => H.left.has(q[0])).map(([id, order, next]) => ({ id, kind: 'story', tutorial: true, order, title: next, next, target: tg[id] })));
    G.sync();
    return { real, talkGone, cur: G.current() && G.current().id, drop: g.player.carry && g.player.carry.drop };
  });
  log('path', JSON.stringify(path1));

  // 1b, 1c the shelves; 5 each done in turn
  const shelf = async (id, name) => {
    const r = await page.evaluate(async (id) => {
      const g = window.__game, H = window.__r3l, e = g.guide.get(id);
      if (!e) return { id, missing: true };
      const rr = g.guide.reach(e);
      if (!rr) return { id, noPos: true };
      H.face(rr.pos, 2.6); H.step(60);
      const c = H.check(id); H.frame(id, 2.2);
      return { cur: g.guide.current() && g.guide.current().id, ...c, px: H.pixel(id) };
    }, id);
    await shot(name);
    await page.evaluate(() => window.__r3l.unframe());
    return r;
  };
  const done = async (id) => page.evaluate(async (id) => {
    const g = window.__game, H = window.__r3l;
    H.left.delete(id); g.guide.sync();
    H.step(3, 1 / 30); const mid = H.gem(id);
    H.step(15, 1 / 30); const after = H.gem(id), cur = g.guide.current();
    H.step(15, 1 / 30);
    return { id, shrinking: !!(mid && mid.gone), after: !!after, next: cur && cur.id, nextGem: !!(cur && H.gem(cur.id)) };
  }, id);
  const food = await shelf('story:onboard:food', '1b-food-shelf');
  result('1b the gem over the food shelf', food.cur === 'story:onboard:food' && food.off < 0.6 && food.point > 0.15 && food.hits && !food.hits.length && food.main && gold(food.px), food);
  const d1 = await done('story:onboard:food');
  result('5a food bought: its gem goes, the leeches\' comes', d1.shrinking && !d1.after && d1.next === 'story:onboard:leeches', d1);
  const tackle = await shelf('story:onboard:leeches', '1c-tackle-shelf');
  result('1c the gem over the tackle shelf', tackle.cur === 'story:onboard:leeches' && tackle.off < 0.6 && tackle.point > 0.15 && tackle.hits && !tackle.hits.length && tackle.main && gold(tackle.px), tackle);
  const d2 = await done('story:onboard:leeches');
  result('5b leeches bought: its gem goes, the canoe\'s comes', !d2.after && d2.next === 'story:onboard:canoe', d2);

  // 1d the canoe at the dock (seen from the dock's foot, by day)
  const canoe = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3l, home = g.profile.home, L = g.outfitter.layout(home), e = g.guide.get('story:onboard:canoe');
    const rr = e && g.guide.reach(e);
    if (!rr) return { missing: !e, drop: g.player.carry && g.player.carry.drop };
    const foot = L.dockFoot || L.dockLand;
    H.standAt(foot.x, foot.z, Math.atan2(-(rr.pos.z - foot.z), rr.pos.x - foot.x)); H.step(60);
    const lv = g.world.levelAt(rr.pos.x, rr.pos.z), c = H.check('story:onboard:canoe');
    H.frame('story:onboard:canoe', 4);
    return { ...c, overWater: +(c.y - lv).toFixed(2), px: H.pixel('story:onboard:canoe') };
  });
  await shot('1d-canoe-at-dock');
  await page.evaluate(() => window.__r3l.unframe());
  result('1d the gem over the canoe at the dock', canoe.off < 0.6 && canoe.point > 0.15 && canoe.overWater > 0.6 && canoe.hits && !canoe.hits.length && gold(canoe.px), canoe);
  const d3 = await done('story:onboard:canoe');
  result('5c the canoe step done: no gem left on the path', !d3.after && d3.next === null, d3);

  // 4 fade with distance, the 120 m cap, the starter site's grate
  const four = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3l, G = g.guide, p = g.player, x0 = p.x, z0 = p.z;
    const q = { x: x0, y: p.groundAt(x0, z0) + 1, z: z0 };
    G.add({ id: 'side:r3l:fade', kind: 'side', title: 'fade', target: { kind: 'place', key: 'here', near: 30, pos: () => q } });
    const at = [];
    for (const d of [5, 15, 24, 28, 33]) {
      H.standAt(q.x + d, q.z); H.step(20);
      const gm = H.gem('side:r3l:fade'), r = G.reach(G.get('side:r3l:fade'));
      at.push({ d, fade: +r.fade.toFixed(2), opacity: gm ? +gm.opacity.toFixed(2) : 0 });
    }
    G.remove('side:r3l:fade');
    G.add({ id: 'side:r3l:far', kind: 'side', title: 'far', target: { kind: 'place', key: 'far', near: 500, pos: () => q } });
    H.standAt(q.x + 110, q.z); H.step(20); const in110 = !!H.gem('side:r3l:far');
    H.standAt(q.x + 150, q.z); H.step(20); const at150 = !!H.gem('side:r3l:far');
    G.remove('side:r3l:far');
    return { at, in110, at150 };
  });
  const fadeOk = four.at.every((a) => Math.abs(a.opacity - a.fade) < 0.06) && four.at[0].opacity > 0.95 && four.at[2].opacity > 0.2 && four.at[2].opacity < 0.8 && four.at[4].opacity === 0;
  result('4a it fades with the distance and is gone past the reach', fadeOk, four.at);
  result('4b never across the wilderness: a 500 m reach is held to 120', four.in110 && !four.at150, four);

  const site = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3l, home = g.profile.home;
    const t = g.tasks.active.find((x) => x.kind === 'starter' && x.from === home);
    if (!t || !g.starter || typeof g.starter.route !== 'function') return { none: true };
    const s = g.starter.route(home).siteRec, A = s.access, id = `task:${t.id}`;
    await g.player.teleport(s.x + 200, s.z); await H.settle(); H.step(20);
    const far = !!H.gem(id);
    await g.player.teleport(A && A.landing ? A.landing[0] : s.x, A && A.landing ? A.landing[1] : s.z); await H.settle();
    for (let k = 0; k < 80 && !s.layout; k++) { H.step(10); await H.wait(80); }
    H.step(20); g.guide.sync();
    const e = g.guide.get(id), r = e && g.guide.reach(e);
    if (r) { H.face(r.pos, 3.5); H.step(60); }
    const c = H.check(id); H.frame(id, 3);
    return { far, ...c, px: H.pixel(id) };
  });
  await shot('4c-site-grate');
  await page.evaluate(() => window.__r3l.unframe());
  if (site.none) result('4c the starter site\'s grate (no starter job on this path: skipped)', true, site);
  else result('4c the starter site\'s grate: shown at the site, not from 200 m', !site.far && site.off < 0.6 && /grate/.test(site.key || '') && site.hits && !site.hits.length && !site.main, site);

  result('6 no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('the run', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
