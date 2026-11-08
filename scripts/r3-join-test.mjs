// Round 3 join (claude/r3-join: A the empty start and the main path, B the journal's Tasks and the tracker, C the golden
// locator; docs/build/r3-contract.md). The seams, played through the real main path (no stand-ins):
//   1 a new season: the talk is the step, and all three say it: the gem over the staffer, the tracker's card, the
//     journal's story row in the amber ink (≥ 4.5:1 on the paper)
//   2 the first talk escaped at its first line: the gem still on the staffer, the tracker "Talk to <name> at the counter"
//   3 the talk through, then each step in turn (food, leeches, the canoe): current(), the main gem over it, the tracker
//     saying its next line, the journal's amber row; each step done by playing it (buy, buy, get in)
//   4 the tracker never says a later tutorial step (no "Close by" for the leeches while the food is the step)
//   5 a ticket: the journal's ticket row, the tracker's "New task", the gem over the counter
//   6 the starter job: the journal's starter row and its next line, the tracker "New task", and at the site the gem over
//     the grate and the tracker "Close by"
//   7 a co-op guest (onboarding.skip + guestKit, as coop-give.js does): no story entries in the guide, the journal or the
//     locator, no tutorial card; the kit kept
//   8 no page errors
//
//   APP=http://localhost:5261 node scripts/r3-join-test.mjs [--home 31]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5261';
const HOME = Number(arg('home', 31));
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1400)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, H = window.__r3j = { cards: [] };
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
  H.face = (q, d) => { const p = g.player, a = Math.atan2(p.z - q.z, p.x - q.x), x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d; H.standAt(x, z, Math.atan2(-(q.z - z), q.x - x)); };
  H.esc = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
  H.open = () => { const o = g.outfitter; if (o.open) o.hide(); o.openHot('counter', o.visit.landing); H.step(4); return g.npcs.dialogue.talking; };
  H.cur = () => { g.guide.sync(); const c = g.guide.current(); return c ? { id: c.id, next: c.next, tutorial: c.tutorial } : null; };
  // every card the tracker draws (head, id, mode), in order
  const draw = g.tracker.draw.bind(g.tracker);
  g.tracker.draw = (card, hold) => { if (card && card.e) { const l = H.cards[H.cards.length - 1], k = `${card.mode}|${card.head}|${card.e.id}`; if (!l || l.k !== k) H.cards.push({ k, mode: card.mode, head: card.head, id: card.e.id, next: card.e.next, at: { mark: H.markNow, talking: g.npcs.dialogue.talking, ob: g.onboarding.state && g.onboarding.state.step, open: !!g.outfitter.open, stack: H.debug ? String(new Error().stack).split('\n').slice(2, 7).map((l) => l.trim().replace(/https?:\/\/[^/]+/, '')).join(' < ') : undefined } }); } return draw(card, hold); };
  H.markNow = null; H.debug = true; // (r4: each card recorded with what was going on: the rig's own mark, the talk, the onboarding's step)
  H.cardsOf = (id) => H.cards.filter((c) => c.id === id).map((c) => `${c.mode}:${c.head}`);
  H.gem = (id) => g.locator.shown().find((q) => q.id === id && !q.gone) || null;
  H.mainGem = () => { const m = g.locator.shown().find((q) => q.main && !q.gone); return m ? m.id : null; };
  H.off = (id) => { const e = g.guide.get(id), r = e && g.guide.reach(e), gm = H.gem(id); return r && gm ? +Math.hypot(gm.x - r.pos.x, gm.z - r.pos.z).toFixed(3) : null; };
  // WCAG contrast of an element's colour on the first opaque background behind it
  const rgb = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  H.contrast = (el) => { if (!el) return null; const fg = rgb(getComputedStyle(el).color), bg = bgOf(el), L1 = lum(fg), L2 = lum(bg); return +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2); };
  // the journal's Tasks row for one entry: its kind, icon, next line, title ink and contrast (the journal opened and shut)
  H.row = async (id) => {
    const J = g.journal; J.showTask(id); H.step(4); await H.wait(60);
    const key = String(id).startsWith('task:') ? String(id).slice(5) : String(id); // (journal.js paperKey)
    const b = document.querySelector(`#journal .pp-index .pp-todo[data-task="${CSS.escape(key)}"]`);
    const all = [...document.querySelectorAll('#journal .pp-index .pp-todo[data-kind]')].map((x) => x.dataset.task);
    const r = b ? { kind: b.dataset.kind, gem: !!b.querySelector('.pp-gi.gi-story'), tk: !!b.querySelector('.pp-tk'), box: !!b.querySelector('.pp-box'), nx: ((b.querySelector('.nx') || {}).textContent || '').trim(), ink: b.querySelector('.t') ? getComputedStyle(b.querySelector('.t')).color : null, c: H.contrast(b.querySelector('.t')), cn: H.contrast(b.querySelector('.nx')) } : null;
    J.close(); H.step(4);
    return { ...r, all };
  };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const boot = async (page) => {
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.guide && g.tracker && g.locator && g.onboarding && g.journal && typeof g.step === 'function' && g.title.state === 'title'; }, null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
};
const newSeason = async (page) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game, o = g.outfitter; if (o.open) o.hide(); g.day.setClock(g.day.year, g.day.doy, 9); });
};
const STORY_OK = (r) => !!(r && r.kind === 'story' && r.gem && r.c >= 4.5 && r.cn >= 4.5 && r.nx.length > 3);

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await boot(page);
  await newSeason(page);

  // 1 the talk, in all three
  const one = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3j, cur = H.cur();
    const e = g.guide.get(cur && cur.id), r = e && g.guide.reach(e);
    if (r) { H.face(r.pos, 3); H.step(250); } // (past the "New task" card's seconds: the tutorial card stays)
    return { cur, main: H.mainGem(), off: H.off(cur && cur.id), tr: g.tracker.state(), row: await H.row(cur && cur.id), kit: g.profile.inventory.long.map((l) => l.id), hull: g.player.canoe.hull.visible };
  });
  result('1 a new season: the talk is the step in the locator, the tracker and the journal (amber, ≥ 4.5:1); empty-handed, no canoe',
    one.cur && one.cur.id === 'story:onboard:talk' && one.main === one.cur.id && one.off < 0.6 && one.tr.shown && one.tr.mode === 'tutorial' && /^Talk to .+ at the counter\.$/.test(one.tr.next) && STORY_OK(one.row) && !one.kit.length && one.hull === false, one);

  // 2 escaped at the first line
  const two = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3j, talking = H.open();
    const during = { gem: H.mainGem(), tr: g.tracker.state().shown };
    H.esc(); H.step(4); if (g.outfitter.open) g.outfitter.hide(); H.step(30);
    return { talking, during, after: g.npcs.dialogue.talking, cur: H.cur(), main: H.mainGem(), tr: g.tracker.state(), step: g.onboarding.state.step };
  });
  result('2 the first talk escaped: the gem stays on the staffer, the tracker says "Talk to <name> at the counter"',
    two.talking && !two.during.gem && !two.during.tr && !two.after && two.cur.id === 'story:onboard:talk' && two.main === 'story:onboard:talk' && two.tr.shown && /^Talk to .+ at the counter\.$/.test(two.tr.next), two);

  // 3 the talk through, then each step played
  const talk = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3j, d = g.npcs.dialogue;
    H.cards.length = 0; H.markNow = 'talk:open';
    H.open(); H.markNow = 'talk:choose'; for (let i = 0; i < 16 && d.convo; i++) { d.choose(0); H.step(2); await H.wait(30); }
    H.markNow = 'talk:over';
    if (g.starter.pending) await g.starter.pending;
    if (g.outfitter.open) g.outfitter.hide();
    H.step(20);
    const st = g.guide.list().find((e) => e.kind === 'starter');
    return { done: g.onboarding.state.done, cur: H.cur(), starter: st ? st.id : null, hull: g.player.canoe.hull.visible };
  });
  log('talk', JSON.stringify(talk));
  const steps = [];
  for (const [id, act] of [['story:onboard:food', 'food'], ['story:onboard:leeches', 'leeches'], ['story:onboard:canoe', 'canoe']]) {
    const s = await page.evaluate(async ({ id, act }) => {
      const g = window.__game, H = window.__r3j, S = g.outfitter.shop, ep = g.profile.home;
      H.markNow = `step:${act}`;
      const e = g.guide.get(id), r = e && g.guide.reach(e);
      if (r && act !== 'canoe') H.face(r.pos, 2.6);
      if (r && act === 'canoe') { const L = g.outfitter.layout(ep), f = L.dockFoot || L.dockLand || r.pos; H.standAt(f.x, f.z); }
      H.step(250); // (an event card's seconds pass: the tutorial card says the step)
      for (let k = 0; k < 120 && g.tracker.state().id !== id; k++) H.step(3); // (r3 replay: the job's card, said after the step's own, may still be up)
      const at = { cur: H.cur(), main: H.mainGem(), off: H.off(id), tr: g.tracker.state(), row: await H.row(id) };
      let did = null;
      if (act === 'food') did = ['meal:breakfast', 'meal:supper', 'meal:breakfast', 'meal:supper', 'meal:breakfast', 'meal:supper'].map((m) => S.buyItem(m, ep).ok);
      if (act === 'leeches') did = [S.buyItem('leeches', ep).ok];
      if (act === 'canoe') { g.packs.getIn(g.player.carry.drop); for (let i = 0; i < 40 && g.player.mode !== 'paddle'; i++) { H.step(5); await H.wait(20); } did = [g.player.mode === 'paddle']; }
      H.step(30);
      return { id, ...at, did, gone: !g.guide.get(id), gemAfter: !!H.gem(id), next: H.cur() };
    }, { id, act });
    steps.push(s);
    result(`3 ${id.split(':').pop()}: the step in all three (gem over it, the tracker's line, the amber row), then done by playing it`,
      s.cur && s.cur.id === id && s.main === id && s.off != null && s.off < 0.6 && s.tr.shown && s.tr.id === id && s.tr.next === s.cur.next && STORY_OK(s.row) && s.did.every(Boolean) && s.gone && !s.gemAfter, s);
  }
  const four = await page.evaluate(() => {
    const H = window.__r3j;
    return { leeches: H.cardsOf('story:onboard:leeches'), canoe: H.cardsOf('story:onboard:canoe'), food: H.cardsOf('story:onboard:food'), seq: H.cards.map((c) => `${c.mode}:${c.head}:${c.id}`), at: H.cards.map((c) => ({ id: c.id, ...c.at })) };
  });
  log('4 cards', JSON.stringify(four.at).slice(0, 4000));
  const sayOrder = (four.seq.filter((s) => /story:onboard/.test(s)).map((s) => s.split(':').slice(2).join(':')).filter((v, i, a) => a.indexOf(v) === i));
  result('4 the tracker says each step in its turn, never a later one early (no "Close by" for a tutorial step) and never one just done (the talk\'s card after the talk)',
    !four.seq.some((s) => /Close by:story:onboard/.test(s)) && JSON.stringify(sayOrder) === JSON.stringify(['story:onboard:food', 'story:onboard:leeches', 'story:onboard:canoe']), { ...four, sayOrder });

  // 5 a ticket, in the store
  const five = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3j, P = g.permits, ep = g.profile.home, L = g.outfitter.layout(ep), at = L.counter || L.centre;
    H.standAt(at.x + 0.6, at.z + 0.6); H.step(30);
    H.cards.length = 0;
    P.fine('dayuse'); P.issue(); g.guide.sync(); H.step(20);
    // (r3 replay: a card up for the first night's job, said as the tutorial ends, may have the screen a few seconds first)
    for (let k = 0; k < 80 && !H.cards.some((c) => /^ticket:/.test(c.id) && c.head === 'New task'); k++) H.step(3);
    const t = g.guide.list().find((e) => e.kind === 'ticket');
    const r = t ? await H.row(t.id) : null;
    return { id: t && t.id, next: t && t.next, cards: t ? H.cardsOf(t.id) : [], gem: t ? !!H.gem(t.id) : false, off: t ? H.off(t.id) : null, row: r, cur: H.cur() };
  });
  result('5 a ticket: the journal\'s ticket row, the tracker\'s "New task", the gem over the counter',
    five.id && five.row && five.row.kind === 'ticket' && five.row.tk && five.cards.some((c) => /New task/.test(c)) && five.gem && five.off < 0.6 && !five.cur, five);

  // 6 the starter job: journal and tracker at the store, the grate's gem and "Close by" at the site
  const six = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3j, home = g.profile.home;
    const t = g.tasks.active.find((x) => x.kind === 'starter' && x.from === home);
    if (!t) return { none: true };
    const id = `task:${t.id}`, row = await H.row(id), e0 = g.guide.get(id);
    const s = g.starter.route(home).siteRec, A = s.access;
    await g.player.teleport(s.x + 200, s.z); await H.settle(); H.step(20);
    const far = !!H.gem(id);
    H.cards.length = 0;
    await g.player.teleport(A && A.landing ? A.landing[0] : s.x, A && A.landing ? A.landing[1] : s.z); await H.settle();
    for (let k = 0; k < 80 && !s.layout; k++) { H.step(10); await H.wait(80); }
    H.step(20); g.guide.sync();
    const e = g.guide.get(id), r = e && g.guide.reach(e);
    if (r) { H.face(r.pos, 3.5); H.step(60); for (let k = 0; k < 80 && !H.cards.some((c) => c.id === id && /Close by|Next/.test(c.head)); k++) H.step(3); } // (r3 replay: behind any card still up)
    return { id, row, next0: e0 && e0.next, far, key: e && e.target && e.target.key, gem: !!H.gem(id), off: H.off(id), cards: H.cardsOf(id), starterNew: null };
  });
  const starterNew = !!talk.starter && four.seq.includes(`event:New task:${talk.starter}`);
  if (six.none) result('6 the starter job (none on this home: skipped)', true, six);
  else result('6 the starter job: the tracker\'s "New task" at the talk\'s end, the journal row and its next line; at the site the gem over the grate and the tracker "Close by"; nothing from 200 m',
    starterNew && six.row && six.row.kind === 'starter' && six.row.nx.length > 3 && !six.far && /grate/.test(six.key || '') && six.gem && six.off < 0.6 && six.cards.some((c) => /Close by|Next/.test(c)), { ...six, starterNew }); // (r3 replay: "Next: Look over the grate" as the line changes on arrival, or "Close by")

  // 7 a co-op guest
  const page2 = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await boot(page2);
  await newSeason(page2);
  const seven = await page2.evaluate(async () => {
    const g = window.__game, H = window.__r3j, ob = g.onboarding;
    const src = [...document.querySelectorAll('script[type=module]')].map((s) => s.src).find(Boolean);
    const mod = await import(new URL('/src/onboarding.js', src || location.href).href);
    ob.skip(); mod.guestKit(g.profile.inventory); H.step(250);
    const list = g.guide.list().map((e) => `${e.kind}:${e.id}`);
    const J = g.journal; J.showTask(null); H.step(4); await H.wait(60);
    const rows = [...document.querySelectorAll('#journal .pp-index .pp-todo[data-kind]')].map((x) => x.dataset.kind);
    J.close(); H.step(4);
    return { list, rows, cur: H.cur(), tr: g.tracker.state(), gems: g.locator.shown().map((q) => q.id), hull: g.player.canoe.hull.visible, long: g.profile.inventory.long.map((l) => l.id) };
  });
  result('7 a co-op guest: no story entries (guide, journal, locator), no tutorial card; the kit and canoe kept',
    !seven.list.some((s) => /^story:/.test(s)) && !seven.rows.includes('story') && !seven.cur && seven.tr.mode !== 'tutorial' && !seven.gems.some((id) => /^story:/.test(id)) && seven.hull === true && seven.long.includes('ash'), seven);

  result('8 no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('the run', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
