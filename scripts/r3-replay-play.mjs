// Round 3 replay: the tutorial played once more end to end, a new season to coming back from the starter night, every
// dialog escaped at every line before it is answered (real keys: Escape and 1 in the talk, W to paddle), with a log of
// what the screen says after each escape and a 12-shot contact sheet (docs/build/shots/r3-contact.png).
// Set up in code (said in the log as SETUP): standing places and facing (pointer lock warps the headless mouse), the
// talk opened at the counter (openHot, the counter's E), buying through shop.buyItem, the paddle out and home as
// teleports, the site's three checks, the night as a clock jump.
//
//   APP=http://localhost:5283 node scripts/r3-replay-play.mjs [--home 31]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5283';
const HOME = Number(arg('home', 31));
const SHOTS = path.resolve('docs/build/shots');
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1200)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, H = window.__pl = { notes: [], cards: [] };
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    // (out of the canoe where it lies: the hull left as the drop, as landing leaves it)
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
    H.look(heading);
  };
  H.look = (yaw, pitch = 0.05) => { const ch = g.player.chase; if (ch) { ch.viewYaw = yaw; ch.forwardYaw = yaw; ch.viewPitch = pitch; if (ch.snap) ch.snap(); } };
  H.face = (q, d, pitch = 0.05) => { const p = g.player, a = Math.atan2(p.z - q.z, p.x - q.x), x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d; H.standAt(x, z, Math.atan2(-(q.z - z), q.x - x)); H.look(Math.atan2(-(q.z - z), q.x - x), pitch); };
  H.d = () => g.npcs.dialogue;
  H.open = () => { const o = g.outfitter; if (o.open) o.hide(); o.openHot('counter', o.visit.landing); H.step(4); return H.d().talking; };
  H.say = () => { const c = H.d().convo; return c && c.node ? String(c.node.say || '') : null; };
  H.cur = () => { g.guide.sync(); const c = g.guide.current(); return c ? { id: c.id, title: c.title, next: c.next } : null; };
  H.screen = () => ({ cur: H.cur(), tracker: g.tracker.state().text, gems: g.locator.shown().filter((q) => !q.gone).map((q) => `${q.id}${q.main ? '*' : ''}`), talking: H.d().talking });
  const note = g.hud.note.bind(g.hud);
  g.hud.note = (t, ...a) => { H.notes.push(String(t)); return note(t, ...a); };
  const draw = g.tracker.draw.bind(g.tracker);
  g.tracker.draw = (card, hold) => { if (card && card.e) { const l = H.cards[H.cards.length - 1], k = `${card.mode}|${card.head}|${card.e.id}`; if (!l || l.k !== k) H.cards.push({ k, text: `${card.head} · ${card.e.next}` }); } return draw(card, hold); };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const shots = [];
try {
  mkdirSync(SHOTS, { recursive: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  const shot = async (name, caption) => { await page.evaluate(() => window.__pl.step(4)); await page.waitForTimeout(250); const f = path.join(SHOTS, `r3-replay-${name}.png`); await page.screenshot({ path: f }); shots.push({ f, caption }); log('shot', name, '·', caption); };
  const ev = (fn, a) => page.evaluate(fn, a);
  await page.exposeFunction('__plShot', async (name) => { const f = path.join(SHOTS, `r3-replay-${name}.png`); await page.screenshot({ path: f }); log('shot', name); });
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.guide && g.tracker && g.locator && g.onboarding && g.starter && typeof g.step === 'function' && g.title.state === 'title'; }, null, { timeout: 300000, polling: 500 });
  await ev(HELPERS);

  // --- a new season (the wizard by clicks) --------------------------------------------------------------------------
  await ev(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await ev(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  const start = await ev(() => { const g = window.__game, H = window.__pl; H.step(30); if (g.outfitter.open) g.outfitter.hide(); g.day.setClock(g.day.year, g.day.doy, 9); H.step(20); const inv = g.profile.inventory; return { money: g.profile.money, long: inv.long.map((l) => l.id), hull: g.player.canoe.hull.visible, notes: H.notes.slice(), screen: H.screen() }; });
  log('start', JSON.stringify(start));
  result('play 1: empty-handed start: $40, nothing long, no hull at the dock', start.money === 40 && !start.long.length && start.hull === false, start);

  // shot 1: the empty dock (SETUP: stood at the foot of the dock, facing the berth)
  await ev(() => { const g = window.__game, H = window.__pl, L = g.outfitter.layout(g.profile.home), f = L.dockLand || L.dockSide, d = g.player.carry.drop; H.face(d, 7, -0.12); H.step(30); });
  await shot('01-empty-dock', 'The empty dock: no canoe until the staff talk');

  // shot 2: the locator on the staffer (SETUP: stood 4 m off, facing them)
  const s2 = await ev(() => { const g = window.__game, H = window.__pl, e = g.guide.get('story:onboard:talk'), r = e && g.guide.reach(e); if (r) H.face(r.pos, 4.2, 0.12); H.step(200); return H.screen(); });
  log('staffer', JSON.stringify(s2));
  await shot('02-staffer-gem', `The gem over ${s2.cur ? s2.cur.title.replace(/^Talk to /, '') : 'the staffer'}`);

  // --- the talk, every line escaped before it is answered (Escape and 1 by key) ---------------------------------------
  const lines = [], heard = new Set();
  for (let k = 0; k < 14; k++) {
    const opened = await ev(() => window.__pl.open());
    if (!opened) { lines.push({ k, opened: false }); break; }
    let at = null;
    for (let i = 0; i < 12; i++) {
      const say = await ev(() => window.__pl.say());
      if (say == null) break;
      if (!heard.has(say)) { at = say; heard.add(say); break; }
      await page.keyboard.press('Digit1'); await ev(async () => { const H = window.__pl; H.step(3); await H.wait(40); if (window.__game.starter.pending) await window.__game.starter.pending; });
    }
    if (!at) { lines.push({ k, ended: true, screen: await ev(() => window.__pl.screen()) }); break; }
    await page.keyboard.press('Escape');
    const after = await ev(() => { const g = window.__game, H = window.__pl; H.step(8); if (g.outfitter.open) g.outfitter.hide(); H.step(60); return H.screen(); });
    lines.push({ k, at: at.slice(0, 60), ...after });
    log('esc', k, JSON.stringify({ at: at.slice(0, 60), cur: after.cur && after.cur.next, tracker: after.tracker, gems: after.gems }));
    if (k === 0) await shot('03-escaped-talk', 'The first talk escaped: the gem stays, the card says who');
    const done = await ev(() => window.__game.onboarding.state.done);
    if (done) break;
  }
  // the talk's end: on to it past every line (each was escaped once)
  const fin = await ev(async () => {
    const g = window.__game, H = window.__pl, d = H.d();
    if (!g.onboarding.state.done) { H.open(); for (let i = 0; i < 16 && d.convo; i++) { d.choose(0); H.step(3); await H.wait(40); if (g.starter.pending) await g.starter.pending; } }
    if (g.outfitter.open) g.outfitter.hide();
    H.step(30);
    return { done: g.onboarding.state.done, permit: g.onboarding.state.permit, held: g.permits.held().map((h) => `${h.kind}:${h.ep}`), job: g.tasks.active.filter((t) => t.kind === 'starter').map((t) => t.id), screen: H.screen() };
  });
  log('talk done', JSON.stringify(fin));
  const escOk = lines.filter((l) => l.at).every((l) => !l.talking && l.cur && /^story:onboard:talk$/.test(l.cur.id) && /(Talk|Finish talking) to .+ at the counter/.test(l.tracker) && l.gems.includes('story:onboard:talk*') && l.gems.length === 1);
  result('play 2: every line of the talk escaped: the gem and the card stay on the staffer; the job still taken at the end', lines.filter((l) => l.at).length >= 6 && escOk && fin.done && fin.job.length === 1, { n: lines.length, lines: lines.map((l) => `${l.at || (l.ended ? 'END' : '?')} → ${l.tracker || ''}`) });

  // shot 7 (the canoe appearing): at the dock the loaned canoe is there now
  await ev(() => { const g = window.__game, H = window.__pl, d = g.player.carry.drop; H.face(d, 7, -0.12); H.step(40); });
  await shot('07-canoe-appears', 'After the talk: the loaned canoe at the dock');

  // the shelves, each with its gem (SETUP: faced from 3 m; bought through shop.buyItem)
  const shelf = async (id, buys, name, caption) => {
    // (SETUP: from the store's middle, then 3.8 m off the shelf facing it)
    const s = await ev(({ id }) => { const g = window.__game, H = window.__pl, L = g.outfitter.layout(g.profile.home), c = L.centre || L.counter, e = g.guide.get(id), r = e && g.guide.reach(e); if (c) H.standAt(c.x, c.z); if (r) H.face(r.pos, 3.8, 0.18); H.step(200); return H.screen(); }, { id });
    log('shelf', id, JSON.stringify(s));
    await shot(name, caption);
    const b = await ev(({ buys }) => { const g = window.__game, H = window.__pl, S = g.outfitter.shop, ep = g.profile.home; const r = buys.map((x) => S.buyItem(x, ep).ok); H.step(20); return { r, money: g.profile.money, screen: H.screen() }; }, { buys });
    log('bought', JSON.stringify(b));
    return { s, b };
  };
  // (V, the view key: first person in the narrow store, as the playtesters' over-the-shoulder view filled with the hat)
  const view0 = await ev(() => window.__game.player.chase.mode);
  if (view0 !== 'first') { await page.keyboard.press('KeyV'); await ev(() => window.__pl.step(10)); }
  log('view', view0, '→', await ev(() => window.__game.player.chase.mode));
  const food = await shelf('story:onboard:food', ['meal:breakfast', 'meal:supper', 'meal:breakfast', 'meal:supper'], '05-food-shelf', 'Buy food: the gem over the provisions shelf');
  const lee = await shelf('story:onboard:leeches', ['leeches'], '06-tackle-shelf', 'Then leeches: the gem moves to the tackle shelf');
  result('play 3: food then leeches, each the step in turn with its one gem', food.s.cur && food.s.cur.id === 'story:onboard:food' && food.s.gems.filter((x) => /story/.test(x)).join() === 'story:onboard:food*' && food.b.r.every(Boolean)
    && lee.s.cur && lee.s.cur.id === 'story:onboard:leeches' && lee.s.gems.filter((x) => /story/.test(x)).join() === 'story:onboard:leeches*' && lee.b.r.every(Boolean), { food: food.s, lee: lee.s, money: lee.b.money });

  // the journal's five kinds (SETUP: a ranger's ticket written (its "ranger's canoe pulls alongside" note is this setup's),
  // a board notice taken, a side story held by hand)
  const five = await ev(async () => {
    const g = window.__game, H = window.__pl, T = g.tasks, P = g.permits, ep = g.profile.home;
    P.fine('dayuse'); P.issue();
    const t = await T.makeKind('fish', ep, 'local'); if (t) T.take(t.id);
    g.guide.add({ id: 'side:replay:loons', kind: 'side', title: 'The loon count', next: 'Ask the keeper about the loons' });
    H.step(30);
    g.journal.showTask(null); H.step(6); await H.wait(150);
    return [...document.querySelectorAll('#journal .pp-index .pp-todo[data-kind]')].map((b) => b.dataset.kind);
  });
  await shot('04-journal-kinds', 'The journal: story, side, first job, ticket, board');
  await ev(() => { window.__game.journal.close(); window.__pl.step(6); });
  result('play 4: the journal shows the five kinds', ['story', 'side', 'starter', 'ticket', 'board'].every((k) => five.includes(k)), five);

  // shot 9: a ticket's gem at the desk (SETUP: faced the counter from 3 m)
  const tk = await ev(() => { const g = window.__game, H = window.__pl, t = g.guide.list().find((e) => e.kind === 'ticket'), r = t && g.guide.reach(t); if (r) H.face(r.pos, 3.2, 0.1); H.step(120); return { ...H.screen(), id: t && t.id }; });
  await shot('09-ticket-desk', 'A ranger\'s ticket: the gem over the counter');
  log('ticket', JSON.stringify(tk));
  await ev(() => { const g = window.__game, f = g.permits.tickets()[0]; if (f) g.permits.payTicket(f.id); g.guide.remove('side:replay:loons'); window.__pl.step(10); }); // (paid, so the night's permit is not held back)

  if (view0 !== 'first' && (await ev(() => window.__game.player.chase.mode)) === 'first') { await page.keyboard.press('KeyV'); await ev(() => window.__pl.step(10)); }
  // the canoe: in at the dock and paddled off with W (SETUP: getIn, the dot's E)
  const off = await ev(async () => {
    const g = window.__game, H = window.__pl, p = g.player, d = p.carry.drop;
    const L = g.outfitter.layout(g.profile.home), f = L.dockLand || L.dockSide;
    H.face(d, 2.2, 0); H.step(20);
    const cur = H.cur();
    g.packs.getIn(d); for (let i = 0; i < 40 && p.mode !== 'paddle'; i++) { H.step(5); await H.wait(20); }
    return { cur, mode: p.mode };
  });
  await page.keyboard.down('KeyW'); await ev(async () => { const H = window.__pl; for (let i = 0; i < 12; i++) { H.step(10); await H.wait(30); } }); await page.keyboard.up('KeyW');
  const off2 = await ev(() => { const g = window.__game, H = window.__pl, ch = g.player.chase; H.step(30); return { ...H.screen(), speed: +g.player.speed.toFixed(2), notes: H.notes.slice(-3), cards: H.cards.slice(-4) }; });
  log('push-off', JSON.stringify({ off, off2 }));
  await shot('08-push-off', 'Pushed off: the tutorial over, the card says the first night\'s way');
  result('play 5: in the canoe the tutorial ends; the card says the job\'s next line', off.cur && off.cur.id === 'story:onboard:canoe' && off.mode === 'paddle' && !(off2.cur && /^story:onboard/.test(off2.cur.id)) && off2.cards.some((c) => /^Next · Paddle to/.test(c.text)), { off, off2 });

  // the site (SETUP: the paddle out a teleport): the grate's gem, the three checks, the night
  const site = await ev(async () => {
    const g = window.__game, H = window.__pl, home = g.profile.home, t = g.tasks.active.find((x) => x.kind === 'starter' && x.from === home);
    const s = g.starter.route(home).siteRec, A = s.access;
    await g.player.teleport(A && A.landing ? A.landing[0] : s.x, A && A.landing ? A.landing[1] : s.z); await H.settle();
    for (let k = 0; k < 80 && !s.layout; k++) { H.step(10); await H.wait(80); }
    H.step(20); g.guide.sync();
    const id = `task:${t.id}`, e = g.guide.get(id), r = e && g.guide.reach(e);
    if (r) { H.face(r.pos, 5, -0.05); H.step(240); } // (past the lake's name card)
    return { id, ...H.screen(), mode: g.player.mode };
  });
  log('site', JSON.stringify(site));
  await shot('10-site-grate', 'At the site: the gem over the grate');
  const checked = await ev(async () => {
    const g = window.__game, H = window.__pl, home = g.profile.home, t = g.tasks.active.find((x) => x.kind === 'starter' && x.from === home), out = [];
    // (SETUP: each part checked through its kind's check, the dot's E on it, standing 2.5 m off it)
    for (const k of ['grate', 'latrine', 'pad']) { const parts = g.guide.partsOf(t), q = parts && parts[k]; if (q) { H.face({ x: q.x, z: q.z }, 2.5, -0.15); H.step(40); } const e0 = g.guide.get(`task:${t.id}`), r0 = e0 && g.guide.reach(e0); out.push({ k, next: e0 && e0.next, gem: !!g.locator.shown().find((m) => m.id === `task:${t.id}`), fade: r0 ? +r0.fade.toFixed(2) : null }); if (k === 'latrine') await window.__plShot('10b-latrine'); try { g.tasks.kinds.starter.check(g.tasks, t, k); } catch (err) { out.push({ err: String(err) }); } H.step(30); }
    H.step(60);
    return { out, status: t.status, next: g.guide.get(`task:${t.id}`) && g.guide.get(`task:${t.id}`).next, cards: H.cards.slice(-5) };
  });
  log('checked', JSON.stringify(checked));
  result('play 6: at the site each part\'s gem shows at full in turn (grate, latrine, pad), each line "Look over the …"; the job done', site.gems.some((x) => /^task:/.test(x)) && checked.out.every((o) => o.gem && o.fade === 1 && /^Look over the /.test(o.next || '')) && checked.status === 'done', checked);

  // the night (SETUP: the clock to 21:54, the last light)
  await ev(() => { const g = window.__game, H = window.__pl; g.day.setClock(g.day.year, g.day.doy, 21.9); H.step(120); });
  await shot('11-night', 'The first night out');

  // home the next day (SETUP: the clock to 10 the day after, the paddle home a teleport to the home landing)
  const home = await ev(async () => {
    const g = window.__game, H = window.__pl, ep = g.profile.home, m0 = g.profile.money, L = g.outfitter.landing(ep);
    g.day.setClock(g.day.year, g.day.doy + 1, 10);
    await g.player.teleport(L.x, L.z); await H.settle();
    for (let i = 0; i < 40; i++) { H.step(10); await H.wait(40); }
    const Lo = g.outfitter.layout(ep), at = Lo && (Lo.counter || Lo.centre);
    if (at) { H.standAt(at.x + 0.6, at.z + 0.6); H.step(90); } // (SETUP: out at the dock and up to the counter)
    return { m0, money: g.profile.money, claimed: (g.tasks.claimed || []).slice(-2), active: g.tasks.active.filter((t) => t.kind === 'starter').map((t) => t.status), visit: !!g.outfitter.visit, mode: g.player.mode, notes: H.notes.slice(-4), screen: H.screen() };
  });
  log('home', JSON.stringify(home));
  await shot('12-home', 'Back home the next day: the first job paid');
  result('play 7: home from the first night, the job paid', home.money > home.m0 || home.claimed.some((c) => /First night/.test(c.title || '')), home);
  result('play: no page errors', errors.length === 0, { errors: errors.slice(0, 5) });

  // --- the contact sheet: 12 shots, 4 × 3, captions under each ---------------------------------------------------------
  const order = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const list = order.map((n) => shots.find((s) => path.basename(s.f).startsWith(`r3-replay-${n}`))).filter(Boolean);
  const cells = list.map((s, i) => `<figure><img src="data:image/png;base64,${readFileSync(s.f).toString('base64')}"><figcaption><b>${i + 1}</b> ${s.caption.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</figcaption></figure>`).join('');
  const sheet = await (await browser.newContext({ viewport: { width: 1920, height: 1100 } })).newPage();
  await sheet.setContent(`<!doctype html><html><head><style>body{margin:0;background:#1d1a16;font:15px/1.3 Georgia,serif;color:#efe6d2}h1{font:600 20px/1 Georgia,serif;margin:14px 18px 6px}.g{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:8px 18px 18px}figure{margin:0}img{width:100%;display:block;border-radius:3px}figcaption{padding:5px 2px 0}b{color:#e0b043;margin-right:4px}</style></head><body><h1>Round 3 replay · the tutorial played through, every talk escaped (claude/r3-replay)</h1><div class="g">${cells}</div></body></html>`);
  await sheet.waitForTimeout(300);
  await sheet.screenshot({ path: path.join(SHOTS, 'r3-contact.png'), fullPage: true });
  log('sheet', path.join(SHOTS, 'r3-contact.png'), list.length, 'shots');
} catch (e) {
  result('the run', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
