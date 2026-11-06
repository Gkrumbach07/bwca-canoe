// Round 3 replay (claude/r3-replay): the three playtests of claude/r3-join (466ad56), each defect fixed checked here on
// the real path, played in order through one new season (and a second one for the talk left unfinished). Each check is
// named for the defect it covers; docs/build/r3-contract.md section 9 lists them.
//
//   APP=http://localhost:5281 node scripts/r3-replay-test.mjs [--home 31]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5281';
const HOME = Number(arg('home', 31));
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1400)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, H = window.__rp = { cards: [], notes: [], barks: [], keeper: [] };
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
  H.d = () => g.npcs.dialogue;
  H.open = () => { const o = g.outfitter; if (o.open) o.hide(); o.openHot('counter', o.visit.landing); H.step(4); return H.d().talking; };
  // open the talk (when shut) and answer the first choice until a line matches re (→ the line) or the talk ends (→ null)
  H.talkTo = async (re) => {
    const d = H.d();
    if (!d.convo) H.open();
    for (let i = 0; i < 24 && d.convo; i++) {
      const say = d.convo.node && d.convo.node.say;
      if (say && re.test(say)) return say;
      d.choose(0); H.step(2); await H.wait(30);
      if (g.starter.pending) await g.starter.pending;
    }
    return null;
  };
  H.shut = () => { if (H.d().convo) { H.esc(); H.step(6); } if (g.outfitter.open) g.outfitter.hide(); H.step(4); };
  H.cur = () => { g.guide.sync(); const c = g.guide.current(); return c ? { id: c.id, title: c.title, next: c.next, tutorial: c.tutorial } : null; };
  H.ids = () => { g.guide.sync(); return g.guide.list().map((e) => e.id); };
  H.gem = (id) => g.locator.shown().find((q) => q.id === id && !q.gone) || null;
  H.off = (id) => { const e = g.guide.get(id), r = e && g.guide.reach(e), gm = H.gem(id); return r && gm ? +Math.hypot(gm.x - r.pos.x, gm.z - r.pos.z).toFixed(3) : null; };
  H.kit = () => { const inv = g.profile.inventory, r = { containers: [], items: [], long: inv.long.map((l) => l.id) }; for (const c of inv.containers) { if (!/^(crate|pockets|inhand|hand)/.test(c.item)) r.containers.push(`${c.item}@${c.where}`); for (const e of c.grid) if (!e.box) r.items.push(e.id); } return r; };
  // every card the tracker draws (mode, head, id), in order
  const draw = g.tracker.draw.bind(g.tracker);
  g.tracker.draw = (card, hold) => { if (card && card.e) { const l = H.cards[H.cards.length - 1], k = `${card.mode}|${card.head}|${card.e.id}`; if (!l || l.k !== k) H.cards.push({ k, mode: card.mode, head: card.head, id: card.e.id, next: card.e.next }); } return draw(card, hold); };
  H.seq = () => H.cards.map((c) => `${c.mode}:${c.head}:${c.id}`);
  const note = g.hud.note.bind(g.hud);
  g.hud.note = (t, ...a) => { H.notes.push(String(t)); return note(t, ...a); };
  const bark = g.npcs.dialogue.bark.bind(g.npcs.dialogue);
  g.npcs.dialogue.bark = (sp, text, o) => { H.barks.push({ who: sp && sp.name, text: String(text) }); return bark(sp, text, o); };
  const P = g.outfitter.people;
  if (P && typeof P.keeperSays === 'function') { const ks = P.keeperSays.bind(P); P.keeperSays = (ep, words, kind) => { H.keeper.push({ ep, words, kind }); return ks(ep, words, kind); }; }
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const boot = async (page) => {
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => { const g = window.__game; return g && g.title && g.guide && g.tracker && g.locator && g.onboarding && g.journal && g.starter && typeof g.step === 'function' && g.title.state === 'title'; }, null, { timeout: 300000, polling: 500 });
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
  await page.evaluate(() => { const g = window.__game, H = window.__rp; H.step(30); const o = g.outfitter; if (o.open) o.hide(); g.day.setClock(g.day.year, g.day.doy, 9); const L = o.layout(g.profile.home), at = L.counter || L.centre; H.standAt(at.x + 0.5, at.z + 0.5); H.step(30); });
};

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await boot(page);
  await newSeason(page);
  log('season', JSON.stringify(await page.evaluate(() => ({ home: window.__game.profile.home, cur: window.__rp.cur() }))));

  // [slot:arrive]
  // [slot:season-line]
  // [slot:pack-tab]
  // swim (playtests 1 and 2, major): before the staff talk, swimming at the empty berth names no canoe and E climbs
  // into nothing (player.js read carry.drop with no onboarding gate)
  const sw = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, p = g.player, d = p.carry && p.carry.drop;
    if (!d) return { none: true };
    const back = { x: p.x, z: p.z };
    H.standAt(d.x + 1.2, d.z + 0.6); p.enterSwim(); H.step(10);
    const prompt = p.prompt ? p.prompt.text : '', inn = p.swimIn(); H.step(4);
    const mode = p.mode, noCanoe = g.onboarding.noCanoe;
    H.standAt(back.x, back.z); H.step(10);
    return { prompt, inn, mode, noCanoe, step: g.onboarding.state.step };
  });
  result('swim: at the empty berth before the talk, no canoe named and none to climb into', !sw.none && sw.noCanoe && !/canoe/i.test(sw.prompt) && sw.inn === false && sw.mode === 'swim' && sw.step !== 'gear', sw);

  // [slot:coop]
  // [slot:name]
  // [slot:bye]
  // [slot:gear-esc]
  // [slot:keeper-role]

  // starter (playtest 1, major 1): the keeper's first-night suggestion escaped before any answer is made again, and the
  // job can still be taken (starter.js wrote offered as the line was built, so available() was false from then on)
  const st = await page.evaluate(async () => {
    const g = window.__game, H = window.__rp, home = g.profile.home;
    const first = await H.talkTo(/^First night out\?/);
    H.shut();
    const mid = { talking: H.d().talking, avail: g.starter.available(home), done: g.onboarding.state.done, active: g.tasks.active.filter((t) => t.kind === 'starter').length };
    const again = await H.talkTo(/^First night out\?/);
    const job = await H.talkTo(/look over the grate/);
    H.cards.length = 0;
    const d = H.d(); if (d.convo) { d.choose(0); H.step(2); await H.wait(30); } // I'll do that
    if (g.starter.pending) await g.starter.pending;
    await H.talkTo(/^$/); // (on to the talk's end)
    if (g.outfitter.open) g.outfitter.hide();
    H.step(250);
    return { first: !!first, mid, again: !!again, job: !!job, done: g.onboarding.state.done, avail: g.starter.available(home), active: g.tasks.active.filter((t) => t.kind === 'starter').map((t) => t.id) };
  });
  result('starter: the first-night suggestion escaped is made again, and its job taken', st.first && !st.mid.talking && st.mid.avail && !st.mid.done && st.mid.active === 0 && st.again && st.job && st.done && !st.avail && st.active.length === 1, st);

  // [slot:tracker-first]
  // [slot:marks-one]
  // [slot:gem-depth]
  // [slot:money]
  // [slot:food-two]
  // [slot:bark-tracker]
  // [slot:tutorial-end]
  // [slot:ticket-words]
  // [slot:journal-more]
  // [slot:fish-next]
  // [slot:latrine]
  // [slot:leave-early]

  result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('the run', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
