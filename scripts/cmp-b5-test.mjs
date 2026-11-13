// Stream b5 (campaign Round 5, the boys): the slice in the real game, headless Chromium against a running Vite
// (?story=1), each check printed PASS or FAIL. From the end of chapter 1 (story.debug.fixture('turn')), a season at
// Sawbill 38:
//   1 Carol at the counter (June): the opener, the boys, Gene, the favour taken (the room open, the rings)
//   2 Denny of an afternoon: his card; the next day, Sparky; his rings on the Isabella
//   3 Frank at Farm 31 before seven: the urn, the patch, the Kek; at seven, gone
//   4 the yard, 3 August: the three of them, Walt's rule, tell 1, "Where do you go?" → the free permit for the 8th
//   5 the fixed party: their camp at C1210 on the 11th (parties.campsAt), the three at the fire, the round shared, the flare
//   6 the laker bet on the 12th: the setup, the canoe over the hole, the 1998 story told alongside (L3A)
//   7 the slides after close: the print shown (the want), SEPT 98, "Take the slide." (the item)
//   8 Gene's slide held up off Gull's creek mouth: the silhouette match (L3B, the yield)
//   (and no page errors)
//
//   APP=http://localhost:5320 node scripts/cmp-b5-test.mjs [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS_T, steps as T_STEPS } from './slice/c1-talk.mjs';
import { HELPERS } from './slice/c1-layer.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5320').replace(/\/$/, '');
const SHOTS = arg('shots', null), FROM = Number(arg('from', 0));
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; for (const base of [path.join(homedir(), 'Library/Caches/ms-playwright'), path.join(homedir(), '.cache/ms-playwright')]) { const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; for (const s of shells.reverse()) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 2000)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const errors = [];
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') log('console', t.slice(0, 300)); else if (/story b5|boys|story rule|story scene|story\.set/.test(t)) log('console', t.slice(0, 300)); });

// the helpers of this rig (window.__b5)
const HELPERS_B5 = () => {
  const g = window.__game, B = window.__b5 = {}, L = window.__L, T = window.__t;
  B.C = () => g.storyBoys.boysCast;
  B.s = () => g.story;
  B.doy = (m, d) => Math.round((Date.UTC(g.day.year, m - 1, d) - Date.UTC(g.day.year, 0, 0)) / 86400000);
  B.dow = (doy) => new Date(Date.UTC(g.day.year, 0, doy)).getUTCDay();
  B.at = (doy, h) => { g.day.setClock(g.day.year, doy, h); const e = g.energy; if (e) { e.value = 1; e.spentAt = null; e.awakeSince = e.now - 1; try { if (e.needs) { e.needs.food = 1; e.needs.water = 1; e.needs.warmth = 1; } if ('lastMealAbs' in e) e.lastMealAbs = e.now; } catch { /* */ } } L.step(6); g.story.update(); L.step(4); };
  B.facts = (ks) => Object.fromEntries(ks.map((k) => [k, g.story.has(k)]));
  B.store = (ep) => g.outfitter.layout(ep);
  B.toStore = async (ep) => { let S = B.store(ep); if (!S || Math.hypot(S.centre.x - g.player.x, S.centre.z - g.player.z) > 300) { const l = g.outfitter.landings.find((x) => x.ep === ep); await L.tp(l.x, l.z); await L.settle(); for (let k = 0; k < 160 && !(S = B.store(ep)); k++) { L.step(5); await L.wait(60); } } if (!S) return false; L.standAt(S.centre.x, S.centre.z); L.step(20); return true; };
  B.outside = (ep) => { const S = B.store(ep), f = S.stepsFoot || S.door, b = S.axes.b; L.standAt(f.x + b.x * 3, f.z + b.z * 3, 0); L.step(20); };
  B.staged = () => B.C().staged();
  B.tick = (n = 4) => { for (let k = 0; k < n; k++) { B.C().t = 1; L.step(2); } };
  // papers and the big map down before a talk (the dialogue closes under one: dialogue.js before), said what was up
  B.clean = () => { const h = g.hud, was = { paper: h.paper || null, mode: h.mode }; try { if (g.record && typeof g.record.close === 'function') g.record.close(); } catch { /* */ } if (h.paper && typeof h.closePaper === 'function') h.closePaper(h.paper); if (h.mode === 'sheet' && typeof h.setMode === 'function') h.setMode('hidden'); if (g.outfitter && g.outfitter.open) g.outfitter.hide(); L.step(3); return was; };
  B.talk = (fn) => { const was = B.clean(); fn(); L.step(2); const c = g.dialogue && g.dialogue.convo; return { was, open: !!c, after: { paper: g.hud.paper || null, mode: g.hud.mode, onFoot: g.player.onFoot, tp: g.player.teleporting } }; };
  B.endTalk = () => { const D = g.dialogue; if (D && D.convo) D.close(false); L.step(4); };
  B.inv = (id) => g.inventory.count(id, { reachable: false });
  B.walt = () => g.story.walt();
  return true;
};
async function hear(n = 20) {
  const said = [];
  for (let k = 0; k < n; k++) {
    const c = await page.evaluate(() => window.__t.convo());
    if (!c) break;
    if (!said.length || said[said.length - 1] !== c.say) said.push(c.say);
    if (!(c.choices.length === 1 && c.choices[0] === '…')) break;
    await page.evaluate(() => { window.__game.dialogue.choose(0); window.__L.step(3); });
  }
  return said;
}
async function choose(prefix) {
  await hear();
  const c = await page.evaluate(() => window.__t.convo());
  const i = c ? c.choices.findIndex((t) => t.startsWith(prefix)) : -1;
  if (i < 0) return { ok: false, why: c ? `no "${prefix}" in [${c.choices.join(' | ')}]` : 'no conversation', say: c && c.say };
  await page.evaluate((i) => { window.__game.dialogue.choose(i); window.__L.step(3); }, i);
  return { ok: true, said: c.say };
}
async function picks(list) { const out = []; for (const p of list) { const r = await choose(p); out.push(r); if (!r.ok) return { ok: false, at: p, r }; } return { ok: true, out }; }
const shot = async (name) => { if (SHOTS) { try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch { /* */ } } };
const step = async (name, fn) => { if (parseInt(name, 10) < FROM) return; log(`-- ${name}`); try { await fn(); } catch (e) { result(`${name}: threw`, false, { e: String(e && e.stack || e).slice(0, 700) }); } };

try {
  await page.goto(`${APP}/?story=1`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.storyTalk && window.__game.storyBoys && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS_T); await page.evaluate(HELPERS); await page.evaluate(HELPERS_B5);
  // a season at Sawbill 38 from 2 June; P1 (stream T's step), then the end of chapter 1 as the fixture writes it
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.startmap .pin[data-ep="38"]').click()); // (the pin can sit off the map's scroll: clicked by the DOM)
  await page.evaluate(() => { const w = window.__game.title.wizard; w.setDate(153); w.next(); });
  await page.evaluate(() => document.getElementById('btn-start').click());
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game; window.__t.step(30); if (g.outfitter.open) g.outfitter.hide(); });
  try { await T_STEPS[0].run({ page, result: (n, p, m) => log(p ? 'ok' : 'note', `(P1) ${n}`, JSON.stringify(m).slice(0, 300)), log, ctx: { home: 38 } }); } catch (e) { log('P1', String(e).slice(0, 200)); }
  const f0 = await page.evaluate(() => { const g = window.__game, r = g.story.debug.fixture('turn'); window.__L.step(6); return { r: !!r, stage: g.story.stage, boys: !!g.storyBoys }; });
  result('0 the end of chapter 1 (fixture turn), the boys loaded', f0.r && f0.boys, f0);

  await step('1 Carol', async () => {
    const st = await page.evaluate(async () => { const B = window.__b5, g = window.__game; let d = B.doy(6, 3); B.at(d, 10); await B.toStore(38); B.tick(6); return { staged: B.staged(), doy: d }; });
    const carol = st.staged.find((q) => q.who === 'carol');
    result('1a Carol at the Sawbill counter, a June morning (b5:counter)', carol && carol.at === 'b5:counter', st);
    const t1 = await page.evaluate(() => window.__b5.talk(() => window.__game.npcs.talkTo('cast:carol:38')));
    log('talk', JSON.stringify(t1));
    const said = await hear(3);
    const r = await picks(['You knew Walt?', 'The boys?', 'Gene?', 'I\'ll go.']);
    await hear(4); await page.evaluate(() => window.__b5.endTalk());
    const f = await page.evaluate(() => ({ ...window.__b5.facts(['door.boys.open', 'carol.favour', 'ep.boys.yes']), rings: (window.__game.storySeams.pencil ? window.__game.storySeams.pencil.marks().filter((m) => m.kind === 'ring').map((m) => m.place || m.label) : []) }));
    result('1b "Coffee\'s on." → You knew Walt? → The boys? → Gene? → "I\'ll go.": the room open (the arc\'s yes), the favour, the rings', /Coffee/.test(said[0] || '') && r.ok && f['door.boys.open'] && f['carol.favour'] && f['ep.boys.yes'], { said: said.slice(0, 2), r: r.ok ? 'ok' : r, f });
  });
  await step('2 Denny', async () => {
    await page.evaluate(() => { const B = window.__b5; B.at(B.doy(6, 3), 15); B.tick(6); });
    const st = await page.evaluate(() => window.__b5.staged());
    result('2a Denny of an afternoon at the corner table (14–17)', st.some((q) => q.who === 'denny' && q.at === 'b5:corner'), st);
    const t1 = await page.evaluate(() => window.__b5.talk(() => window.__game.npcs.talkTo('cast:denny:38')));
    log('talk', JSON.stringify(t1));
    const said = await hear(4);
    const r = await picks(['Did Walt have a favourite spot?', 'Thanks.']);
    await hear(4); await page.evaluate(() => window.__b5.endTalk());
    await page.evaluate(() => { const B = window.__b5; B.at(B.doy(6, 4), 15); B.tick(6); B.talk(() => window.__game.npcs.talkTo('cast:denny:38')); });
    const said2 = await hear(2); await page.evaluate(() => window.__b5.endTalk());
    const f = await page.evaluate(() => ({ ...window.__b5.facts(['denny.card', 'denny.rings', 'denny.cabin', 'denny.sparky']), card: window.__b5.inv('dennycard'), walt: window.__b5.walt().filter((w) => /b5/.test(w)) }));
    result('2b his card at the first meeting, his rings and the cabin; Sparky the next afternoon, against himself', f['denny.card'] && f.card === 1 && f['denny.rings'] && f['denny.sparky'] && /Sparky/.test(said2.join(' ')), { said: said.slice(0, 2), said2: said2.slice(0, 1), r: r.ok ? 'ok' : r, f });
  });
  await step('3 Frank at Farm', async () => {
    const st = await page.evaluate(async () => { const B = window.__b5; let d = B.doy(6, 5); while ([0, 6].includes(B.dow(d))) d++; B.at(d, 6.3); await B.toStore(31); B.at(d, 6.3); B.tick(6); return { staged: B.staged(), d }; });
    const fr = st.staged.find((q) => q.who === 'frank');
    result('3a Frank at Farm 31\'s urn at 6:18 on a weekday (b5:urn)', fr && fr.at === 'b5:urn' && fr.ep === 31, st);
    const t1 = await page.evaluate(() => window.__b5.talk(() => window.__game.npcs.talkTo('cast:frank:31')));
    log('talk', JSON.stringify(t1));
    const said = await hear(2);
    const r = await picks(['What\'s the shirt?', 'It\'s got the company\'s patch', 'Did Walt ever tell you where he was going?']);
    await hear(4); await page.evaluate(() => window.__b5.endTalk());
    const f = await page.evaluate(() => window.__b5.facts(['frank.met', 'frank.patch', 'frank.kek']));
    const gone = await page.evaluate((d) => { const B = window.__b5; B.at(d, 7.2); B.tick(6); return B.staged().filter((q) => q.who === 'frank'); }, st.d);
    result('3b "You\'re up early for a tourist." → the shirt, the patch, the Kek; gone at seven', r.ok && f['frank.patch'] && f['frank.kek'] && gone.length === 0, { said: said.slice(0, 1), r: r.ok ? 'ok' : r, f, gone });
  });
  await step('4 the yard', async () => {
    const st = await page.evaluate(async () => { const B = window.__b5; B.at(B.doy(8, 3), 10); await B.toStore(38); B.outside(38); B.tick(6); return B.staged(); });
    result('4a the yard, 3 August: Bob, Frank and Denny outside the store (b5:yard)', ['bob', 'frank', 'denny'].every((w) => st.some((q) => q.who === w && q.at === 'b5:yard')), st);
    await shot('b5-yard');
    const t1 = await page.evaluate(() => window.__b5.talk(() => window.__b5.C().debug.yard()));
    log('talk', JSON.stringify(t1));
    const said = await hear(5);
    const r = await picks(['Fair enough.', 'Tell me about Walt.', 'Where do you go?']);
    await hear(10); await page.evaluate(() => window.__b5.endTalk());
    const f = await page.evaluate(() => { const g = window.__game, P = g.permits; return { ...window.__b5.facts(['boys.met', 'boys.round', 'denny.tell1', 'boys.permit', 'bob.trust']), permit: (P ? P.held() : []).filter((q) => q.why === 'boys').map((q) => ({ ep: q.ep, abs: q.abs, price: q.price })) }; });
    result('4b "You\'re the one with Walt\'s tent." → Fair enough. (the round) · Tell me about Walt (tell 1) · Where do you go? (Denny\'s permit, free, the 8th)', r.ok && f['boys.round'] && f['denny.tell1'] && f['boys.permit'] && f.permit.length === 1 && f.permit[0].ep === 38 && f.permit[0].price === 0, { said: said.slice(0, 3), r: r.ok ? 'ok' : r, f });
  });
  await step('5 the camp', async () => {
    const st = await page.evaluate(async () => {
      const B = window.__b5, g = window.__game, L = window.__L; B.at(B.doy(8, 11), 18);
      await L.tp(15072, 6830 - 60); await L.settle(); for (let k = 0; k < 60; k++) { L.step(5); await L.wait(40); }
      await L.tp(15082, 6850); await L.settle(); B.tick(2); { const S = B.C().site(); L.standAt(S.x + 4, S.z + 4); } B.tick(8); // (ashore at their site, on foot)
      const T = Math.round(g.story.nowAbs() - 0.5); let fixed = [];
      try { fixed = g.parties.campsAt(Math.floor(g.story.nowAbs()), 18).filter((q) => q.party && q.party.fixed).map((q) => ({ fixed: q.party.fixed, site: q.site ? [Math.round(q.site.x), Math.round(q.site.z)] : null })); } catch (e) { fixed = String(e); }
      void T; return { staged: B.staged(), fixed };
    });
    const at = st.staged.filter((q) => q.at === 'field');
    result('5a 11 August: the fixed party at C1210 (parties.campsAt) and the three of them at the fire', Array.isArray(st.fixed) && st.fixed.some((q) => q.fixed === 'boys') && ['bob', 'frank', 'denny'].every((w) => at.some((q) => q.who === w)), st);
    await shot('b5-camp');
    // something shared from your pack: the rig hands you a chocolate bar if the season's food has none
    await page.evaluate(() => { const g = window.__game; if (!window.__b5.C().food()) { try { const r = typeof g.inventory.toHandNew === 'function' ? g.inventory.toHandNew('snack:chocolate') : null; if (!(r && r.ok)) g.inventory.place('snack:chocolate', 1, {}); } catch { /* */ } } });
    const t1 = await page.evaluate(() => window.__b5.talk(() => window.__b5.C().debug.camp()));
    log('talk', JSON.stringify(t1));
    const said = await hear(4);
    const r = await picks(['Fair enough.', 'Tell me about the flare.']);
    await hear(10); await page.evaluate(() => window.__b5.endTalk());
    const f = await page.evaluate(() => window.__b5.facts(['boys.visited', 'boys.round', 'boys.nicknames']));
    result('5b "Look what the wind brought." → the round shared, the flare (the nicknames)', r.ok && f['boys.visited'] && f['boys.round'] && f['boys.nicknames'], { said: said.slice(0, 3), r: r.ok ? 'ok' : r, f });
  });
  await step('6 the bet', async () => {
    await page.evaluate(() => { const B = window.__b5, L = window.__L; B.at(B.doy(8, 12), 17.1); B.tick(2); if (window.__game.story.has('boys.bet.moved')) B.at(B.doy(8, 13), 17.1); { const S = B.C().site(); L.standAt(S.x + 4, S.z + 4); } B.tick(4); B.talk(() => window.__b5.C().debug.camp()); });
    const said = await hear(6);
    await page.evaluate(() => window.__b5.endTalk());
    await page.evaluate(async () => { const L = window.__L; for (let k = 0; k < 10; k++) { L.step(5); await L.wait(60); } window.__b5.tick(4); });
    const st = await page.evaluate(() => ({ state: window.__b5.C().debug.state(), spoon: window.__b5.inv('waltspoon'), staged: window.__b5.staged() }));
    result('6a the laker bet at 17:00 on the 12th: Walt\'s spoons, Bob and Frank out in the canoe over the hole, Denny at camp', /Laker bet/.test(said.join(' ')) && st.state.bet && st.state.bet.boat && st.spoon === 1, { said: said.slice(0, 3), st });
    // alongside: the player within 20 m of their canoe (the rig puts you there; the canoe trolls round the hole)
    const told = await page.evaluate(async () => { const g = window.__game, L = window.__L, B = window.__b5, s = B.C().debug.state(); const H = s.hole; await L.tp(H.x + 30, H.z); await L.settle(); for (let k = 0; k < 30 && !g.dialogue.convo; k++) { const b = B.C().bet && B.C().bet.boat; if (b) { g.player.x = b.x + 8; g.player.z = b.z + 8; } B.tick(1); await L.wait(40); } return !!g.dialogue.convo; });
    const said98 = await hear(14);
    const r = await picks(['Why didn\'t Denny go?', 'Which lake?']);
    await hear(6); await page.evaluate(() => window.__b5.endTalk());
    const f = await page.evaluate(() => ({ ...window.__b5.facts(['boys.story1998', 'bob.eastbay', 'key.L3A', 'door.boys.yield', 'bob.matt98']), walt: window.__b5.walt().filter((w) => /b5\.1998/.test(w)) }));
    result('6b the 1998 story told over the hole (Frank: "a notch in the ridge"): key L3A, the yield, the Walt lines', told && /notch/.test(said98.join(' ')) && r.ok && f['key.L3A'] && f['door.boys.yield'] && f.walt.length === 2, { told, said98: said98.slice(0, 2), r: r.ok ? 'ok' : r, f });
    const end = await page.evaluate(() => { const C = window.__b5.C(); C.debug.endBet(); return { won: window.__b5.facts(['boys.bet.won', 'boys.bet.frank']), spoon: window.__b5.inv('waltspoon'), bet: !!C.bet }; });
    result('6c dusk: the bet ends (Frank\'s 21–27 in laker, or yours), the spoon goes back', !end.bet && end.spoon === 0 && (end.won['boys.bet.won'] || end.won['boys.bet.frank']), end);
  });
  await step('7 the slides', async () => {
    const st = await page.evaluate(async () => {
      const B = window.__b5, g = window.__game, s = g.story;
      if (!s.has('carol.favour')) s.rules.apply({ id: 'rig:favour', then: ['f:door.boys.open', 'f:carol.favour'] }, {}); // (--from: step 1's favour)
      const want = g.storyEpisodes && g.storyEpisodes.show ? g.storyEpisodes.show.wanted('carol') : [];
      s.rules.apply({ id: 'rig:paddle-print', then: ['f:carol.paddle.shown', 'f:carol.slides.invited'] }, {}); // (the print of the paddle shown: the want's own then)
      B.at(B.doy(8, 20), 16); await B.toStore(38); B.at(B.doy(8, 20), 16); B.tick(6);
      return { staged: B.staged(), want: want.map((w) => w.id), und: s.when('und:NB60') };
    });
    result('7a the print shown (the arc\'s want: "Look at this…"), Carol after close (the evening slot), NB60 understood', st.staged.some((q) => q.who === 'carol' && q.slot === 'evening') && st.want.length === 1 && st.und, st);
    const t1 = await page.evaluate(() => window.__b5.talk(() => window.__game.npcs.talkTo('cast:carol:38')));
    log('talk', JSON.stringify(t1));
    const r = await choose('SEPT 98');
    const said = await hear(12);
    const wall = await page.evaluate(() => { const el = document.querySelector('.b5-slide'); return el ? { label: el.dataset.label, n: el.dataset.n } : null; });
    await shot('b5-slides');
    const t = await choose('Take the slide.');
    await hear(3); await page.evaluate(() => window.__b5.endTalk());
    const f = await page.evaluate(() => ({ ...window.__b5.facts(['boys.slide', 'carol.slides.done']), slide: window.__b5.inv('geneslide'), walt: window.__b5.walt().includes('w.b5.slide') }));
    result('7b SEPT 98 on the wall, the ninth slide ("That\'s Walt laughing."), "Take the slide." (the item, the Walt line)', r.ok && wall && wall.label === '98' && wall.n === '9' && /Walt laughing/.test(said.join(' ')) && t.ok && f['boys.slide'] && f.slide === 1 && f.walt, { said: said.slice(0, 3), wall, t: t.ok ? 'ok' : t, f });
  });
  await step('8 the silhouette', async () => {
    const st = await page.evaluate(async () => {
      const B = window.__b5, g = window.__game, L = window.__L, C = B.C(), T0 = C.debug.slideTarget();
      await L.tp(T0.x, T0.z); await L.settle(); for (let k = 0; k < 40; k++) { L.step(5); await L.wait(40); }
      // off the bearing first (the ridges don't lie together), then square to it from where Gene stood
      C.debug.view({ x: T0.x, z: T0.z, bearing: T0.face + 0.6 }); for (let k = 0; k < 20; k++) L.step(3);
      const off = { ...(C.debug.state().mg || {}) }, early = g.story.has('gene.slide.matched');
      C.debug.view({ x: T0.x + 6, z: T0.z - 4, bearing: T0.face + 0.03 }); for (let k = 0; k < 80 && !g.story.has('gene.slide.matched'); k++) L.step(3);
      C.debug.view(null);
      return { off, early, prof: (T0.profile || []).length, facts: B.facts(['mg.silhouette.matched', 'gene.slide.matched', 'key.L3B', 'door.boys.yield']), und: g.story.when('und:NB55'), walt: B.walt().includes('w.b5.match') };
    });
    result('8 Gene\'s slide held up off Gull\'s creek mouth: no match off the bearing; square to it, the ridges lie together (L3B, NB55 understood)', !st.early && st.prof === 48 && st.facts['gene.slide.matched'] && st.facts['key.L3B'] && st.und && st.walt, st);
  });
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 5) });
} catch (e) {
  result('rig threw', false, { e: String(e && e.stack || e).slice(0, 900) });
} finally {
  const pass = results.filter((r) => r.pass).length;
  log(`cmp-b5-test: ${pass}/${results.length} pass`);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
}
