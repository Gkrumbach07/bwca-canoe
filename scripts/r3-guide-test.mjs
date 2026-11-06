// Round 3's shared contract (docs/build/r3-contract.md): the guide (src/guide.js), headless Chromium against a running
// Vite, each check printed PASS or FAIL:
//   1 a new season at home: the main path's step is the staffer's talk ('story:onboard:talk', tutorial), said with an
//     'add' that is not initial; its target is the staffer, shown in the store (a mark, main, fading in)
//   2 the talk escaped (Esc at the first line): the step stays the current one, its target still shown
//   3 the talk through: the step is gone ('gone'); the starter job is an entry (kind 'starter', "Paddle to …"), with an
//     'add'; the list's order puts story, side, starter, ticket, board in that order
//   4 at the starter site: the target is the next part (the grate), "Look over the grate."; one checked, the target
//     moves ('target') and the line changes ('change'); 'near' heard as the site came in reach; never shown from 200 m
//   5 a ranger's ticket: an entry (kind 'ticket') with what it costs against the money in hand
//   6 sources: a hand-held entry (add / finish / remove) and a replaced source
//
//   npx vite --port 5244 --strictPort &
//   APP=http://localhost:5244 node scripts/r3-guide-test.mjs [--home 31]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5244';
const HOME = Number(arg('home', 31));
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 900)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, H = window.__r3 = { ev: [] };
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
  H.talkThrough = async (most = 14) => {
    const d = g.npcs.dialogue, said = [];
    for (let i = 0; i < most && d.convo; i++) { const n = d.convo.node; said.push(`${n.by || d.convo.name}: ${n.say}`); d.choose(0); await H.wait(30); }
    return { said, talking: d.talking };
  };
  g.guide.on('*', (evt, e, detail) => H.ev.push({ evt, id: e.id, kind: e.kind, initial: !!detail.initial, fields: detail.fields || null }));
  H.evs = (id) => H.ev.filter((q) => !id || q.id === id).map((q) => q.evt);
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.guide && window.__game.onboarding && window.__game.permits && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
  log('loaded');

  // 1 a new season at home
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  const one = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3, o = g.outfitter;
    if (o.open) o.hide();
    const L = o.layout(g.profile.home), at = L.counter || L.centre;
    H.standAt(at.x + 0.5, at.z + 0.5); g.day.setClock(g.day.year, g.day.doy, 9); H.step(40);
    const cur = g.guide.current(), m = g.guide.marks(), r = cur ? g.guide.reach(cur) : null, sp = g.onboarding.spot(g.profile.home);
    const add = H.ev.find((q) => q.id === 'story:onboard:talk' && q.evt === 'add');
    return { cur: cur && { id: cur.id, kind: cur.kind, tutorial: cur.tutorial, title: cur.title, next: cur.next, target: cur.target && { kind: cur.target.kind, key: cur.target.key, store: cur.target.store } },
      add, marks: m.map((q) => ({ id: q.id, main: q.main, fade: +q.fade.toFixed(2) })), reach: r && { d: +r.d.toFixed(1), show: r.show, inStore: r.inStore, y: +r.pos.y.toFixed(2) }, off: sp && r ? +Math.hypot(r.pos.x - sp.x, r.pos.z - sp.z).toFixed(2) : null, near: H.evs('story:onboard:talk').includes('near') };
  });
  result('1a the main path starts at the staffer\'s talk', one.cur && one.cur.id === 'story:onboard:talk' && one.cur.kind === 'story' && one.cur.tutorial && /^Talk to .+ at the counter\.$/.test(one.cur.next), one.cur);
  result('1b its add was heard, not initial', one.add && !one.add.initial, one.add);
  result('1c the locator\'s mark is on the staffer, in the store', one.marks[0] && one.marks[0].id === 'story:onboard:talk' && one.marks[0].main && one.marks[0].fade > 0.5 && one.reach.inStore && one.off != null && one.off < 1 && one.near, one);

  // 2 escaped at the first line
  const two = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3, o = g.outfitter;
    o.openHot('counter', o.visit.landing); H.step(4);
    const d = g.npcs.dialogue, was = d.talking;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); H.step(10); g.guide.sync();
    const cur = g.guide.current();
    return { was, talking: d.talking, cur: cur && cur.id, marks: g.guide.marks().map((q) => q.id), onboard: g.onboarding.state.step };
  });
  result('2 escaped at the first line: the step and its mark stay', two.was && !two.talking && two.cur === 'story:onboard:talk' && two.marks[0] === 'story:onboard:talk', two);

  // 3 the talk through: the step gone, the starter job in
  const three = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3, o = g.outfitter;
    if (o.open) o.hide();
    o.openHot('counter', o.visit.landing); H.step(4);
    const r = await H.talkThrough();
    if (g.starter.pending) await g.starter.pending;
    H.step(20); g.guide.sync();
    const st = g.guide.list().find((e) => e.kind === 'starter');
    return { said: r.said.length, done: g.onboarding.state.done, evs: H.evs('story:onboard:talk'), cur: g.guide.current() && g.guide.current().id,
      starter: st && { id: st.id, next: st.next, target: st.target && st.target.kind, evs: H.evs(st.id) } };
  });
  // (r3 A's main path: past the talk the food step is current, the empty-handed start's next line)
  result('3a the talk through: the step is gone', three.done && three.evs.includes('gone') && (three.cur === null || three.cur === 'story:onboard:food'), three);
  result('3b the starter job is an entry with what next', three.starter && /^Paddle to .+\.$/.test(three.starter.next) && three.starter.target === 'thing' && three.starter.evs.includes('add'), three.starter);

  // 4 at the starter site
  const four = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3, home = g.profile.home, r = g.starter.route(home), s = r.siteRec, A = s.access;
    const t = g.tasks.active.find((x) => x.kind === 'starter' && x.from === home), id = `task:${t.id}`;
    // far: 200 m off the site, nothing shown
    await g.player.teleport(s.x + 200, s.z); await H.settle(); H.step(10);
    const farR = g.guide.reach(g.guide.get(id));
    await g.player.teleport(A && A.landing ? A.landing[0] : s.x, A && A.landing ? A.landing[1] : s.z); await H.settle();
    for (let k = 0; k < 80 && !s.layout; k++) { H.step(10); await H.wait(80); }
    H.step(10); g.guide.sync();
    const e = g.guide.get(id), r0 = g.guide.reach(e), next0 = e.next, key0 = e.target.key, L = s.layout;
    const off0 = r0 ? Math.hypot(r0.pos.x - L.fire.x, r0.pos.z - L.fire.z) : null;
    const marks0 = g.guide.marks().map((q) => q.id), lat = L.latrine || (A && A.latrine), latD = lat ? Math.round(Math.hypot(lat.x - g.player.x, lat.z - g.player.z)) : null;
    const before = H.ev.length;
    g.taskKinds2.checkPart(t, 'grate'); g.guide.sync();
    const after = H.ev.slice(before).filter((q) => q.id === id);
    const e1 = g.guide.get(id);
    return { far: farR && { show: farR.show, d: Math.round(farR.d) }, next0, key0, off0, show0: r0 && r0.show, next1: e1.next, key1: e1.target && e1.target.key, after: after.map((q) => q.evt), near: H.evs(id).includes('near'), marks: marks0, latD, marks1: g.guide.marks().map((q) => q.id) };
  });
  result('4a 200 m off, the site is not shown', four.far && !four.far.show, four.far);
  result('4b at the site the grate is pointed at', four.next0 === 'Look over the grate.' && /:grate$/.test(four.key0) && four.show0 && four.off0 != null && four.off0 < 0.5 && four.near && four.marks.length > 0, four);
  result('4c the grate checked: the target moves, the line changes', four.after.includes('target') && four.after.includes('change') && four.next1 !== four.next0 && !/:grate$/.test(four.key1 || ''), four);

  // 5 a ranger's ticket
  const five = await page.evaluate(() => {
    const g = window.__game, P = g.permits;
    P.fine('dayuse'); P.issue(); g.guide.sync();
    const tk = g.guide.list().filter((e) => e.kind === 'ticket');
    return { n: tk.length, next: tk[0] && tk[0].next, money: Math.floor(P.money || 0), order: g.guide.list().map((e) => e.kind) };
  });
  const rank = { story: 0, side: 1, starter: 2, ticket: 3, board: 4 };
  result('5a a ticket is an entry with what it costs', five.n === 1 && /\$20/.test(five.next || ''), five);
  result('5b the list is in kind order', five.order.every((k, i, a) => !i || rank[a[i - 1]] <= rank[k]), five.order);

  // 6 a hand-held entry and a replaced source
  const six = await page.evaluate(() => {
    const g = window.__game, G = g.guide, H = window.__r3, p = g.player;
    const n0 = H.ev.length;
    G.add({ id: 'story:test', kind: 'story', tutorial: true, title: 'Test step', next: 'go here', target: { kind: 'place', key: 'here', near: 50, pos: () => ({ x: p.x + 5, y: 1, z: p.z }) } });
    const cur = G.current(), mk = G.marks().map((q) => q.id);
    G.finish('story:test'); const done = G.get('story:test').done, cur2 = G.current();
    G.remove('story:test');
    const off = G.source('onboarding', () => [{ id: 'story:a', kind: 'story', title: 'A', next: 'Go', tutorial: true }]); G.sync();
    const replaced = G.current() && G.current().id; off(); G.sync();
    const evs = H.ev.slice(n0).map((q) => `${q.evt}:${q.id}`);
    return { cur: cur && cur.id, next: cur && cur.next, mk, done, cur2: cur2 && cur2.id, replaced, after: G.current() && G.current().id, evs, sources: G.stats().sources };
  });
  result('6 hand-held entries and a replaced source', six.cur === 'story:test' && six.next === 'Go here.' && six.mk[0] === 'story:test' && six.done && (six.cur2 === null || /^story:onboard:/.test(six.cur2)) && six.replaced === 'story:a' && six.after === null
    && ['add:story:test', 'done:story:test', 'gone:story:test', 'add:story:a', 'gone:story:a'].every((x) => six.evs.includes(x)), six);
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('the run', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
