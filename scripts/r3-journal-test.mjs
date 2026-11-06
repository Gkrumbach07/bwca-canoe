// Round 3 B (docs/build/r3-contract.md §6): the journal's Tasks page drawn from the guide, and the pop-up tracker on the
// left. Headless Chromium against a running Vite, each check printed PASS or FAIL:
//   1 a new season at home: the tracker is up through the tutorial with the step's next line ("Talk to … at the
//     counter.") and "I for your journal"; escaping the first talk leaves it up, saying the same
//   2 I with the card up opens the journal at Tasks, the story step picked (once: the next I is the pack again)
//   3 the Tasks page lists one story, one side, one starter, one ticket and one board entry, each with its icon class and
//     its next line (.nx); the story and side steps head the list
//   4 contrast: each kind's ink (.t and .nx) against the page's paper, and the tracker's ink against its card, >= 4.5:1,
//     worked out in the page from the computed colours
//   5 tracker events: a new entry shows "New task: …"; past the tutorial it hides after its seconds; coming in reach
//     ('near') shows "Close by"; settings.set('tracker', false) keeps it hidden; an initial add (a reload) is not said
//   6 no page errors
// Shots: docs/build/shots/r3-journal-tasks.png (the Tasks page), r3-tracker-tutorial.png, r3-tracker-new.png.
//
//   npx vite --port 5253 --strictPort &
//   APP=http://localhost:5253 node scripts/r3-journal-test.mjs [--home 31] [--no-shots]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5253';
const HOME = Number(arg('home', 31));
const SHOTS = !process.argv.includes('--no-shots');
const SHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs/build/shots');
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 900)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
const shot = async (page, name) => { if (!SHOTS) return; mkdirSync(SHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(SHOT_DIR, name) }); log('shot', name); };

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
    const d = g.npcs.dialogue;
    for (let i = 0; i < most && d.convo; i++) { d.choose(0); await H.wait(30); }
    return d.talking;
  };
  H.key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code === 'Escape' ? 'Escape' : code.replace(/^Key/, '').toLowerCase(), bubbles: true }));
  // WCAG contrast of an element's computed colour against the first opaque background behind it
  H.rgb = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  H.lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  H.bgOf = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = H.rgb(getComputedStyle(n).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  H.contrast = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el), fg = H.rgb(cs.color), bg = H.bgOf(el);
    const a = fg.a * (Number(cs.opacity) || 1), mix = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
    const L1 = H.lum(mix), L2 = H.lum(bg);
    return { ratio: +((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)).toFixed(2), color: cs.color, bg: `rgb(${bg.r}, ${bg.g}, ${bg.b})` };
  };
  g.guide.on('*', (evt, e, detail) => H.ev.push({ evt, id: e.id, kind: e.kind, initial: !!detail.initial }));
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const boot = async (page) => {
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.guide && window.__game.tracker && window.__game.onboarding && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
};
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await boot(page);
  log('loaded');

  // 1 a new season at home: the tracker through the tutorial
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${HOME}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  const one = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3, o = g.outfitter, d = g.npcs.dialogue;
    if (o.open) o.hide();
    if (d.talking) { H.key('Escape'); H.step(4); }
    const L = o.layout(g.profile.home), at = L.counter || L.centre;
    H.standAt(at.x + 0.5, at.z + 0.5); g.day.setClock(g.day.year, g.day.doy, 9); H.step(40);
    const s0 = g.tracker.state(), cur = g.guide.current();
    // the first talk escaped at its first line
    o.openHot('counter', o.visit.landing); H.step(4);
    const was = d.talking, during = g.tracker.state().shown;
    H.key('Escape'); H.step(12);
    if (o.open) o.hide();
    H.step(12);
    const s1 = g.tracker.state(), cs = getComputedStyle(document.getElementById('tracker'));
    H.step(240); // (past an event card's seconds: the tutorial's step stays up)
    const s2 = g.tracker.state();
    return { cur: cur && { id: cur.id, next: cur.next, tutorial: cur.tutorial }, s0, was, during, talking: d.talking, s1, s2, vis: cs.visibility, op: cs.opacity, rect: document.getElementById('tracker').getBoundingClientRect().toJSON() };
  });
  result('1a the tracker is up through the tutorial with the step\'s line ("New task: …", then on and on)', one.cur && one.cur.tutorial && one.s0.shown && one.s0.id === 'story:onboard:talk' && one.s0.next === one.cur.next
    && /^New task:/.test(one.s0.text) && /Talk to .+ at the counter\./.test(one.s0.text) && /I for your journal/.test(one.s0.text) && one.rect.left < 200
    && one.s2.shown && one.s2.mode === 'tutorial' && one.s2.id === 'story:onboard:talk' && /Talk to .+ at the counter\..*I for your journal/.test(one.s2.text), one);
  result('1b escaping the first talk keeps it, saying the same (hidden while the talk was up)', one.was && !one.during && !one.talking && one.s1.shown && one.s1.id === 'story:onboard:talk' && one.s1.next === one.cur.next && one.vis === 'visible', { s1: one.s1, was: one.was, during: one.during, vis: one.vis });
  await page.waitForTimeout(500);
  await shot(page, 'r3-tracker-tutorial.png');

  // 2 I with the card up: the journal at Tasks, the story's step picked; once a line
  const two = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3, J = g.journal;
    H.key('KeyI'); H.step(4); await H.wait(60);
    const a = { open: J.open, side: J.side, tab: J.tab, sel: J.taskSel, hidden: !g.tracker.state().shown };
    const left = document.querySelector('#journal .pp-quest');
    a.page = left ? left.textContent.replace(/\s+/g, ' ').trim() : null;
    H.key('KeyI'); H.step(4); // (closes)
    H.step(6);
    const back = g.tracker.state().shown;
    H.key('KeyI'); H.step(4); await H.wait(60);
    const b = { open: J.open, side: J.side };
    H.key('KeyI'); H.step(4);
    return { a, back, b };
  });
  result('2a I with the card up opens the journal at the story step', two.a.open && two.a.side === 'journal' && two.a.tab === 'tasks' && two.a.sel === 'story:onboard:talk' && two.a.hidden && /Talk to/.test(two.a.page || ''), two.a);
  result('2b the next I is the pack as ever (the card back up after)', two.back && two.b.open && two.b.side === 'pack', { back: two.back, b: two.b });

  // the talk through (the starter job comes in: "New task"), a ticket, a board notice, a side story
  const three = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3, o = g.outfitter, home = g.profile.home;
    o.openHot('counter', o.visit.landing); H.step(4);
    await H.talkThrough();
    if (g.starter.pending) await g.starter.pending;
    if (o.open) o.hide();
    H.step(10); g.guide.sync(); H.step(4);
    const st = g.guide.list().find((e) => e.kind === 'starter');
    const sNew = g.tracker.state();
    return { starter: st && st.id, cur: g.guide.current() && g.guide.current().id, sNew, home };
  });
  result('5a a new entry shows the card ("New task: …")', three.starter && three.sNew.shown && three.sNew.mode === 'event' && three.sNew.head === 'New task' && three.sNew.id === three.starter && /^New task:/.test(three.sNew.text), three);
  await page.waitForTimeout(400);
  await shot(page, 'r3-tracker-new.png');
  const fade = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3;
    // (the join: the main path goes on past the talk (food, leeches, the canoe: onboarding.js); "past the tutorial" is
    // that path walked, latched as the game latches it)
    const ob = g.onboarding.state; if (ob && ob.path) { ob.path.food = ob.path.leeches = ob.path.canoe = true; g.onboarding.write(); }
    H.step(30); const mid = g.tracker.state().shown;
    H.step(200); // (~6.7 s of game frames)
    return { mid, cur: g.guide.current() && g.guide.current().id, after: g.tracker.state() };
  });
  result('5b past the tutorial it hides after its seconds', fade.mid && fade.cur === null && !fade.after.shown, fade);

  const four = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3, T = g.tasks, P = g.permits, home = g.profile.home;
    // a ticket
    P.fine('dayuse'); P.issue();
    // a board notice taken
    let board = [];
    for (let k = 0; k < 120; k++) { board = T.board(home).filter(Boolean); if (board.some((t) => t.status === 'offered')) break; H.step(2); await H.wait(100); }
    const ad = board.find((t) => t.status === 'offered');
    const took = ad ? T.take(ad.id) : false;
    // a side story (hand-held), and a story step of the campaign past the tutorial (hand-held)
    g.guide.add({ id: 'side:test', kind: 'side', title: 'The old cabin', next: 'ask at the Moose Lake store about the cabin', order: 0 });
    g.guide.add({ id: 'story:test:walt', kind: 'story', title: 'Walt’s notebook', next: 'find the camp on the point', order: 5 });
    g.guide.sync(); H.step(4);
    const J = g.journal;
    J.showTask('story:test:walt'); H.step(4); await H.wait(80);
    const rows = [...document.querySelectorAll('#journal .pp-index .pp-todo[data-kind]')].map((b) => ({
      kind: b.dataset.kind, key: b.dataset.task, icon: b.querySelector('.pp-gi.gi-story') ? 'gem' : b.querySelector('.pp-gi.gi-side') ? 'star' : b.querySelector('.pp-tk') ? 'ticket' : b.querySelector('.pp-box') ? 'box' : '',
      nx: (b.querySelector('.nx') || {}).textContent || '', t: (b.querySelector('.t') || {}).textContent || '',
      box: (() => { const i = b.querySelector('.pp-gi, .pp-tk, .pp-box'), r = i && i.getBoundingClientRect(), tr = b.querySelector('.t').getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), tx: Math.round(tr.left), vis: getComputedStyle(i).visibility, html: i.outerHTML.slice(0, 120) } : null; })() }));
    // contrast: each kind's title ink and next line on the page's paper
    const ink = {};
    for (const k of ['story', 'side', 'starter', 'ticket', 'board']) {
      const b = document.querySelector(`#journal .pp-index .pp-todo.k-${k}:not(.on)`) || document.querySelector(`#journal .pp-index .pp-todo.k-${k}`);
      ink[k] = { t: H.contrast(b && b.querySelector('.t')), nx: H.contrast(b && b.querySelector('.nx')) };
    }
    const q = document.querySelector('#journal .pp-quest');
    ink.quest = { title: H.contrast(q && q.querySelector('.pp-qtitle')), next: H.contrast(q && q.querySelector('.pp-qnext')) };
    return { took, rows, ink, quest: q ? q.textContent.replace(/\s+/g, ' ').trim() : null };
  });
  const by = (k) => four.rows.find((r) => r.kind === k);
  const want = { story: 'gem', side: 'star', starter: 'box', ticket: 'ticket', board: 'box' };
  const each = Object.entries(want).map(([k, icon]) => ({ k, ok: !!(by(k) && by(k).icon === icon && by(k).nx.trim().length > 3 && by(k).box && by(k).box.w >= 10 && by(k).box.x < by(k).box.tx), row: by(k) }));
  result('3a the Tasks page lists story, side, starter, ticket and board, each with its icon and next line', four.took && each.every((x) => x.ok), { each: each.map((x) => ({ k: x.k, ok: x.ok, icon: x.row && x.row.icon, box: x.row && x.row.box, nx: x.row && x.row.nx })) });
  const iStory = four.rows.findIndex((r) => r.kind === 'story'), iSide = four.rows.findIndex((r) => r.kind === 'side');
  const iRest = four.rows.findIndex((r) => r.kind !== 'story' && r.kind !== 'side');
  result('3b the story and side steps head the list; a story step picked is a page written in the journal', iStory === 0 && iSide > iStory && iSide < iRest && /Walt’s notebook/.test(four.quest || '') && /Find the camp on the point\./.test(four.quest || ''), { order: four.rows.map((r) => r.kind), quest: four.quest });
  const worst = Object.entries(four.ink).flatMap(([k, v]) => Object.entries(v).map(([w, c]) => ({ k: `${k}.${w}`, r: c ? c.ratio : 0, c })));
  result('4a every kind\'s ink on the paper is at least 4.5:1', worst.every((x) => x.r >= 4.5), worst.map((x) => `${x.k} ${x.r} (${x.c && x.c.color} on ${x.c && x.c.bg})`));
  await page.waitForTimeout(900);
  await shot(page, 'r3-journal-tasks.png');

  // 5 near, the setting, the tracker's own ink
  const five = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3, G = g.guide, p = g.player, S = g.settings;
    g.journal.close(); H.step(4);
    for (let k = 0; k < 12 && g.tracker.state().shown; k++) H.step(100); // (the cards from the adds above run out)
    const where = { x: p.x + 90, z: p.z };
    G.add({ id: 'board:test:near', kind: 'board', title: 'The fallen pine', next: 'saw the pine off the trail', target: { kind: 'place', key: 'pine', near: 25, pos: () => ({ x: where.x, y: 1, z: where.z }) } });
    H.step(220);
    const before = g.tracker.state();
    where.x = p.x + 8; H.step(12);
    const near = g.tracker.state();
    const tr = document.getElementById('tracker');
    const ink = { head: H.contrast(tr.querySelector('.tr-head')), next: H.contrast(tr.querySelector('.tr-next')), key: H.contrast(tr.querySelector('.tr-key')) };
    // a story step's card: its amber ink on the card
    G.add({ id: 'story:test:ink', kind: 'story', title: 'An amber line', next: 'look for the amber line', order: 9 });
    for (let k = 0; k < 40 && g.tracker.state().id !== 'story:test:ink'; k++) H.step(10);
    const storyCard = g.tracker.state();
    ink.storyNext = H.contrast(tr.querySelector('.tr-next')); ink.storyHead = H.contrast(tr.querySelector('.tr-head'));
    G.remove('story:test:ink'); G.remove('board:test:near'); H.step(4);
    // the setting off
    S.set('tracker', false);
    G.add({ id: 'board:test:off', kind: 'board', title: 'Not said', next: 'nothing' }); H.step(10);
    await H.wait(450); const off = g.tracker.state(), offVis = tr.classList.contains('on') ? 'on' : getComputedStyle(tr).visibility;
    S.set('tracker', true); G.remove('board:test:off'); H.step(4);
    return { before, near, ink, storyCard, off, offVis, why: { title: g.title.state, paper: g.hud.paper, mode: g.hud.mode, talk: g.npcs.dialogue.talking, journal: g.journal.open } };
  });
  result('5c coming in reach shows "Close by"', !(five.before.shown && five.before.id === 'board:test:near') && five.near.shown && five.near.id === 'board:test:near' && five.near.head === 'Close by', { before: five.before, near: five.near, why: five.why });
  result('5d settings.set(\'tracker\', false) keeps it hidden', !five.off.shown && five.offVis === 'hidden', { off: five.off, vis: five.offVis });
  const tInk = Object.entries(five.ink).map(([k, c]) => ({ k, r: c ? c.ratio : 0, c }));
  result('4b the tracker\'s inks on its card are at least 4.5:1', five.storyCard.id === 'story:test:ink' && tInk.every((x) => x.r >= 4.5), tInk.map((x) => `${x.k} ${x.r} (${x.c && x.c.color} on ${x.c && x.c.bg})`));

  // an initial add (a page load restoring the season) is not said
  await page.evaluate(() => window.__game.saver && window.__game.saver.write && window.__game.saver.write());
  await page.waitForTimeout(800);
  await boot(page);
  const six = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3;
    const n0 = H.ev.filter((q) => q.evt === 'add').length;
    g.title.continueTrip();
    const t0 = performance.now();
    while ((g.title.state !== 'game' || g.player.teleporting) && performance.now() - t0 < 120000) { H.step(4); await H.wait(100); }
    let seen = false;
    for (let k = 0; k < 40; k++) { H.step(3); await H.wait(30); const s = g.tracker.state(); if (s.shown && s.head === 'New task') seen = true; }
    const adds = H.ev.filter((q) => q.evt === 'add');
    return { n0, adds: adds.map((q) => `${q.id}${q.initial ? ' (initial)' : ''}`), seen, state: g.tracker.state() };
  });
  result('5e an initial add (a reload) is not said', six.adds.length > 0 && six.adds.every((a) => /initial/.test(a)) && !six.seen, six);
  result('6 no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('the run', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
