// Round 3, builder A (docs/build/r3-contract.md sections 3, 5 and 6): the empty-handed start and the tutorial's main path,
// headless Chromium against a running Vite, each check printed PASS or FAIL:
//   1 the empty start: a new season has no paddle, rod, leech bucket, canoe at the dock (the hull not drawn, no verb at
//     it) or barrel; the crate holds only the player's own things; the main path's step is the staffer's talk
//   2 escape: at every line of the talk, Esc and come back: the step (story:onboard:talk) and its next line are still
//     there, and the talk opens again where it can (the gear once given is never given twice)
//   3 the gear at the talk: the old pack, the old tent, the loan's canoe at the dock (drawn, its verbs back), the paddle,
//     the life jacket and the rod; no food, no bucket, no leeches, no tackle box; the staffer's line names what is missing
//   4 the path: talk → food → leeches → canoe, each current() in turn, each 'gone' when done; the starting money covers
//     three days of food and a dozen leeches (the bucket comes with the first dozen)
//   5 a reload in the middle of the path (food bought, leeches not) brings the same current() back, and the empty dock
//     stays loaned (the canoe there)
//   6 the food gate (show only what's missing, never a block): a season pushed off with no food is told so, and the
//     trip starts all the same
//   7 a co-op guest's kit is the old one (paddle, rod, bucket of leeches, barrel), and a guest gets no main-path entries
//   (and no page errors)
//
//   npx vite --port 5251 --strictPort &
//   APP=http://localhost:5251 node scripts/r3-start-test.mjs [--home 31]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = process.env.APP || 'http://localhost:5251';
const HOME = Number(arg('home', 31));
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1200)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const HELPERS = () => {
  const g = window.__game, H = window.__r3a = { ev: [], notes: [] };
  H.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  H.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H.settle = async (ms = 30000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { H.step(10); await H.wait(30); } H.step(20); };
  H.standAt = (x, z, heading = 0) => {
    const p = g.player;
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  H.esc = () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); };
  H.open = () => { const o = g.outfitter; if (o.open) o.hide(); o.openHot('counter', o.visit.landing); H.step(4); return g.npcs.dialogue.talking; };
  // everything you own, by where it is: { canoe: [...], stash: [...], long: [...], crate: [...] }
  H.kit = () => {
    const inv = g.profile.inventory, r = { containers: [], items: [], long: inv.long.map((l) => l.id), crate: inv.crate ? inv.crate.grid.map((e) => e.id) : [] };
    for (const c of inv.containers) { if (!/^(crate|pockets|inhand|hand)/.test(c.item)) r.containers.push(`${c.item}@${c.where}`); for (const e of c.grid) if (!e.box) r.items.push(e.id); }
    return r;
  };
  H.cur = () => { g.guide.sync(); const c = g.guide.current(); return c ? { id: c.id, next: c.next, tutorial: c.tutorial, target: c.target && c.target.kind } : null; };
  g.guide.on('*', (evt, e) => H.ev.push({ evt, id: e.id }));
  H.evs = (id) => H.ev.filter((q) => q.id === id).map((q) => q.evt);
  const note = g.hud.note.bind(g.hud);
  g.hud.note = (t, ...a) => { H.notes.push(String(t)); return note(t, ...a); };
  return true;
};

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const boot = async (page) => {
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.guide && window.__game.onboarding && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
};
const newSeason = async (page, home = HOME) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${home}"]`);
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(191); w.next(); });
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(async () => { const g = window.__game, H = window.__r3a; H.step(30); const o = g.outfitter; if (o.open) o.hide(); const L = o.layout(g.profile.home), at = L.counter || L.centre; H.standAt(at.x + 0.5, at.z + 0.5); g.day.setClock(g.day.year, g.day.doy, 9); H.step(30); });
};
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console', m.text().slice(0, 300)); });
  await page.goto(APP, { timeout: 180000 });
  await boot(page);
  log('loaded');

  // 1 the empty start
  await newSeason(page);
  const one = await page.evaluate(() => {
    const g = window.__game, H = window.__r3a, k = H.kit(), p = g.player, h = p.canoe && p.canoe.hull;
    return { ...k, money: g.profile.money, hull: h ? h.visible : null, verb: g.packs.hullAction(), atDock: g.outfitter.shop.canoeAtDock(), cur: H.cur(), onboard: g.onboarding.state };
  });
  const own = ['sleepingbag', 'pad', 'clothes', 'tarp', 'tablets'];
  result('1a a new season is empty-handed: no paddle, rod, bucket, barrel or leeches', !one.long.length && !one.containers.length && !one.items.includes('leeches'), one);
  result('1b the crate holds only your own things', one.crate.length === own.length && one.crate.every((x) => own.includes(x)), one.crate);
  result('1c no canoe at the dock: the hull not drawn, no verb at it, the shop sees none', one.hull === false && one.verb === null && one.atDock === false, { hull: one.hull, verb: one.verb, atDock: one.atDock });
  result('1d the main path starts at the staffer\'s talk', one.cur && one.cur.id === 'story:onboard:talk' && one.cur.tutorial && /^Talk to .+ at the counter\.$/.test(one.cur.next), one.cur);

  // 2 escape at every line: open the talk, walk on to the first line not yet escaped at, Esc there, come back
  const two = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3a, d = g.npcs.dialogue, out = [], seen = new Set();
    H.said = [];
    for (let k = 0; k < 20; k++) {
      if (!H.open()) { out.push({ k, opened: false, step: g.onboarding.state.step }); break; }
      for (let i = 0; i < 20 && d.convo && seen.has(d.convo.node.say); i++) { d.choose(0); H.step(2); await H.wait(20); }
      if (!d.convo) { out.push({ k, ended: true }); break; }
      const at = d.convo.node.say;
      seen.add(at); H.said.push(at);
      H.esc(); H.step(6);
      if (g.outfitter.open) g.outfitter.hide();
      H.step(4);
      const c = H.cur(), inv = g.profile.inventory;
      out.push({ k, at: at.slice(0, 50), talking: d.talking, cur: c && c.id, next: c && c.next, step: g.onboarding.state.step, packs: inv.containers.filter((x) => x.item === 'waltpack').length });
      if (g.onboarding.state.done) break;
    }
    if (g.outfitter.open) g.outfitter.hide();
    return out;
  });
  const esc = two.filter((x) => x.at);
  result('2 escape at every line: the talk step and its next line stay, nothing given twice',
    esc.length >= 5 && esc.some((x) => x.step === 'gear') && esc.every((x) => !x.talking && x.cur === 'story:onboard:talk' && /^(Finish talking|Talk) to .+ at the counter\.$/.test(x.next || '') && x.packs <= 1), two);

  // 3 the talk through: the gear and the loan
  const three = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3a, d = g.npcs.dialogue, said = [...H.said];
    if (!g.onboarding.state.done) {
      H.open();
      for (let i = 0; i < 16 && d.convo; i++) { said.push(d.convo.node.say); d.choose(0); H.step(2); await H.wait(30); }
      if (g.starter.pending) await g.starter.pending;
    }
    if (g.outfitter.open) g.outfitter.hide();
    H.step(20);
    const k = H.kit(), p = g.player, h = p.canoe && p.canoe.hull;
    return { ...k, said, done: g.onboarding.state.done, hull: h ? h.visible : null, verb: !!g.packs.hullAction(), atDock: g.outfitter.shop.canoeAtDock(), cur: H.cur(), evs: H.evs('story:onboard:talk'), money: g.profile.money };
  });
  result('3a the gear at the talk: the old pack and tent, the paddle, the life jacket and the rod', three.done && three.containers.includes('waltpack@canoe') && three.items.includes('walttent') && three.items.includes('pfd') && three.long.includes('ash') && three.long.includes('rod'), three);
  result('3b the loan\'s canoe is at the dock, drawn, its verbs back', three.hull === true && three.verb && three.atDock, { hull: three.hull, verb: three.verb, atDock: three.atDock });
  result('3c no food, no bucket, no leeches, no tackle box', !three.items.some((x) => /^(meal|snack):/.test(x)) && !three.containers.some((c) => /^(bucket|tacklebox)/.test(c)) && !three.items.includes('leeches'), { items: three.items, containers: three.containers });
  result('3d the staffer says what is missing (the food, the leeches)', three.said.some((s) => /canoe/.test(s) && /food/i.test(s) && /[Ll]eeches/.test(s)), three.said);
  result('3e the talk step is gone; the food step is current', three.evs.includes('gone') && three.cur && three.cur.id === 'story:onboard:food' && /^Buy food at the provisions shelf\.$/.test(three.cur.next), { evs: three.evs, cur: three.cur });

  // 4 the path: food, then (5: a reload) leeches, then the canoe
  const four = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3a, S = g.outfitter.shop, ep = g.profile.home, m0 = g.profile.money;
    const stock = S.stock(ep), price = (id) => { const s = stock.find((q) => q.id === id); return s ? s.price : null; };
    const plan = (price('meal:breakfast') + price('meal:supper')) * 3 + price('leeches');
    const buys = [];
    for (let i = 0; i < 3; i++) for (const id of ['meal:breakfast', 'meal:supper']) { const r = S.buyItem(id, ep); buys.push({ id, ok: r.ok, words: r.words }); }
    H.step(10);
    return { m0, plan, prices: { b: price('meal:breakfast'), s: price('meal:supper'), l: price('leeches') }, buys, money: g.profile.money, cur: H.cur(), evs: H.evs('story:onboard:food'), items: H.kit().items };
  });
  result('4a the starting money covers three days of food and a dozen leeches', four.plan != null && four.m0 >= four.plan && four.buys.every((b) => b.ok), { m0: four.m0, plan: four.plan, prices: four.prices, buys: four.buys.filter((b) => !b.ok) });
  result('4b food bought: its step gone, the leeches\' step current', four.evs.includes('gone') && four.cur && four.cur.id === 'story:onboard:leeches' && /^Buy leeches at the tackle shelf\.$/.test(four.cur.next), { evs: four.evs, cur: four.cur });

  // 5 a reload in the middle of the path
  await page.evaluate(async () => { const g = window.__game; g.saver.write(); window.dispatchEvent(new Event('pagehide')); await g.store.flush(); });
  await page.reload({ timeout: 180000 });
  await boot(page);
  await page.evaluate(() => window.__game.title.continueTrip());
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting; }, null, 180000);
  const five = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3a; H.step(60);
    const o = g.outfitter; if (o.open) o.hide();
    const p = g.player, h = p.canoe && p.canoe.hull;
    return { cur: H.cur(), loan: g.onboarding.state.loan, path: g.onboarding.state.path, hull: h ? h.visible : null, visit: !!o.visit };
  });
  result('5 a reload mid-path: the same step comes back, the loan\'s canoe still there', five.cur && five.cur.id === 'story:onboard:leeches' && five.loan && five.hull === true, five);

  const four2 = await page.evaluate(async () => {
    const g = window.__game, H = window.__r3a, S = g.outfitter.shop, ep = g.profile.home, o = g.outfitter;
    if (!o.visit) { const L = o.layout(ep), at = L.counter || L.centre; H.standAt(at.x + 0.5, at.z + 0.5); H.step(30); }
    const r = S.buyItem('leeches', ep); H.step(10);
    const leech = H.cur(), inv = g.profile.inventory, bucket = inv.containers.find((c) => c.item === 'bucket');
    // the canoe: in it at the dock (the getIn the dot's E runs)
    const d = g.player.carry.drop, gi = g.packs.hullAction();
    let mode = null;
    try { g.packs.getIn(d); for (let i = 0; i < 40 && g.player.mode !== 'paddle'; i++) { H.step(5); await H.wait(20); } mode = g.player.mode; } catch (e) { mode = `threw ${e.message}`; }
    H.step(10);
    return { r: { ok: r.ok, words: r.words }, bucket: bucket && { where: bucket.where, n: bucket.grid.reduce((a, e) => a + (e.qty || 1), 0) }, leech, verb: gi && gi.e && gi.e.verb, mode, cur: H.cur(), evL: H.evs('story:onboard:leeches'), evC: H.evs('story:onboard:canoe'), path: g.onboarding.state.path, money: g.profile.money };
  });
  result('4c leeches bought (the bucket comes with them): the canoe\'s step current', four2.r.ok && four2.bucket && four2.bucket.n >= 12 && four2.leech && four2.leech.id === 'story:onboard:canoe' && /dock\.$/.test(four2.leech.next), four2);
  result('4d in the canoe: the canoe\'s step gone, the main path done', four2.mode === 'paddle' && four2.evC.includes('gone') && (!four2.cur || !/^story:onboard:/.test(four2.cur.id)) && four2.path.canoe, { mode: four2.mode, evC: four2.evC, cur: four2.cur, money: four2.money });

  // 6 the food gate: a second season (a fresh page), the talk through, no food bought, pushed off
  const page2 = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page2.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  await page2.goto(APP, { timeout: 180000 });
  await boot(page2);
  await newSeason(page2);
  const six = await page2.evaluate(async () => {
    const g = window.__game, H = window.__r3a, d = g.npcs.dialogue, o = g.outfitter;
    H.open(); for (let i = 0; i < 16 && d.convo; i++) { d.choose(0); H.step(2); await H.wait(30); }
    if (g.starter.pending) await g.starter.pending;
    if (o.open) o.hide(); H.step(10);
    H.notes.length = 0;
    o.start(); const trip = !!(o.trip && o.trip.active); H.step(4);
    return { notes: [...H.notes], trip, cur: H.cur() };
  });
  result('6 pushed off with no food: told so (what is missing), not blocked', six.trip && six.notes.some((n) => /No food with you/.test(n)), six);

  // 7 a co-op guest: the old kit, no main path
  // (a third page: a new season, then made a guest as coop-give.js does: onboarding.skip and onboarding.js guestKit)
  const page3 = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page3.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  await page3.goto(APP, { timeout: 180000 });
  await boot(page3);
  await newSeason(page3);
  const seven = await page3.evaluate(async () => {
    const g = window.__game, H = window.__r3a, ob = g.onboarding;
    const src = [...document.querySelectorAll('script[type=module]')].map((s) => s.src).find(Boolean);
    const url = new URL('/src/onboarding.js', src || location.href).href;
    const mod = await import(url);
    ob.skip(); mod.guestKit(g.profile.inventory); H.step(10);
    const k = H.kit(), h = g.player.canoe && g.player.canoe.hull;
    return { entries: g.guide.list().filter((e) => /^story:onboard:/.test(e.id)).map((e) => e.id), hull: h ? h.visible : null, noCanoe: ob.noCanoe, ...k };
  });
  result('7 a co-op guest: the old kit kept (paddle, rod, a bucket of leeches, barrel, food), no main-path entries, the canoe drawn',
    !seven.entries.length && seven.hull === true && !seven.noCanoe && seven.long.includes('ash') && seven.long.includes('rod') && seven.containers.some((c) => /^bucket@/.test(c)) && seven.containers.some((c) => /^barrel30@/.test(c)) && seven.items.includes('leeches') && seven.items.includes('meal:supper'), seven);

  result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('the run', false, { error: String(e && e.stack || e).slice(0, 1500) });
} finally {
  await browser.close();
  const pass = results.filter((r) => r.pass).length;
  log(`${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
}
