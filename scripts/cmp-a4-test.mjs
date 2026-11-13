// Campaign Round 6, stream a4 (the family, 33-family; the Quetico parts re-sited on the US side): Aili's trust steps, the
// gift and the stone, the kitchen table and the guest book, Jon and his Sand Point chase (stream m's motorboat in trail
// mode) and the denial, Liisa's stories and the can, the porch's climax, Gord on Thursdays, Danielle at the Sucker end of
// Prairie Portage, the Carp end's stump and cairn. Headless Chromium against a running Vite, each check PASS or FAIL;
// travel between places by teleport (L.tp: the chase camera snapped), talk choices by the dialogue's own choose(i).
//   0 flag off: family-cast.js not fetched, no storyFamily
//   1 the motel beside the Little Vermilion store; Aili behind her counter (a Tuesday)
//   2 Aili, Variant C (no bundle): "Who sent you in here?"; the arc started, the teaching-moment Walt line
//   3 a second day: "Sit." (step 1): the photo on the wall, Mummo's known
//   4 June's pot shown (Look at this…): the stone (L4A, the yield), "Keep it." (the pot on her counter)
//   5 a day on: "Eino." (step 3); a day on: the guest book (an item)
//   6 Jon at the dock at dusk: the first meeting; the chase on Sand Point (the grey guide boat trails 300–500 m); shaken in
//     the islands; the denial's island line
//   7 Liisa at the counter: two stories (one in his hand), "Come back Monday."; the Monday: the can (L4D) on the porch;
//     taken toward the road it is refused ("Not mine to take."); back on the porch: Aili home early, "Liisa thought…"
//   8 Gord on a Thursday at the outfitter's dock (his boat tied): the old American (a "went north" piece)
//   9 Danielle at the Sucker end of Prairie Portage: the canoe logged (the line turns: north); the stone question
//   10 the Carp end: the stump with the ring and the cairn, the dot's Look on each
//   (and no page errors)
//
//   APP=http://localhost:5350 node scripts/cmp-a4-test.mjs [--only off|A] [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS } from './slice/c1-layer.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5350').replace(/\/$/, '');
const ONLY = arg('only', null), SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; return shells.length ? path.join(base, shells[shells.length - 1], 'chrome-headless-shell-mac-arm64/chrome-headless-shell') : undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1800)); };
const until = (page, fn, a, timeout = 120000) => page.waitForFunction(fn, a, { timeout, polling: 250 });

const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const errors = [];
const open = async (url) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /story a4|family/.test(t)) log('console', t.slice(0, 300)); });
  await page.goto(url, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && (!/story=1/.test(location.search) || window.__game.storyFamily) && typeof window.__game.step === 'function' && window.__game.title.state === 'title', null, { timeout: 300000, polling: 500 });
  await page.evaluate(HELPERS);
  return page;
};
const newSeason = async (page, home, doy = 166) => {
  await page.evaluate(() => window.__game.title.askNewSeason('adventure'));
  await until(page, () => !document.getElementById('entry-card').hidden && document.querySelectorAll('.startmap .pin').length > 0);
  await page.waitForTimeout(400);
  await page.click(`.startmap .pin[data-ep="${home}"]`);
  await page.evaluate((d) => { const w = window.__game.title.wizard; w.setDate(d); w.next(); }, doy);
  await page.click('#btn-start');
  await until(page, () => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && !!g.outfitter.visit; }, null, 180000);
  await page.evaluate(() => { const g = window.__game, L = window.__L; L.step(30); const o = g.outfitter; if (o.open) o.hide(); g.day.setClock(g.day.year, g.day.doy, 10); L.step(10); });
};
const shot = async (page, name) => { if (SHOTS) { try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } catch { /* a nicety */ } } };
const PAGE_HELPERS = () => {
  const g = window.__game, L = window.__L, s = g.story, F = g.storyFamily.familyCast;
  window.__f = {
    F, s,
    dow: (doy) => new Date(Date.UTC(g.day.year, 0, doy)).getUTCDay(),
    // the clock to the next day (after `from`) with this weekday at this hour; fed and rested
    at(dow, h, from = g.day.doy + 1) { let d = from; while (this.dow(d) !== dow) d++; g.day.setClock(g.day.year, d, h); const e = g.energy; if (e) { e.value = 1; e.spentAt = null; } s.clock({ abs: Math.round(Date.UTC(g.day.year, 0, d) / 86400000), hours: h }); L.step(4); return d; },
    async toStore() { const l = g.outfitter.landings.find((x) => x.ep === 12); await L.tp(l.x, l.z); await L.settle(); for (let k = 0; k < 160 && !g.outfitter.layout(12); k++) { L.step(5); await L.wait(50); } const S = g.outfitter.layout(12); if (S) { L.standAt(S.centre.x + S.axes.b.x * 9, S.centre.z + S.axes.b.z * 9, 0); L.step(30); } return !!S; },
    convo() { const c = g.dialogue && g.dialogue.convo; return c ? { who: c.name, say: c.node && c.node.say, choices: (c.node && c.node.choices || []).map((o) => o.text) } : null; },
    // press on through '…' and choose by the start of each pick's words; what was said
    async say(picks = []) {
      const said = [];
      const press = async () => { for (let k = 0; k < 30; k++) { const c = this.convo(); if (!c) return; if (c.say && said[said.length - 1] !== c.say) said.push(c.say); if (!(c.choices.length === 1 && c.choices[0] === '…')) return; g.dialogue.choose(0); L.step(3); await L.wait(10); } };
      for (const p of picks) {
        await press(); const c = this.convo(); if (!c) break;
        const i = c.choices.findIndex((t) => t.startsWith(p));
        if (i < 0) { said.push(`[no choice "${p}" in ${c.choices.join(' | ')}]`); break; }
        g.dialogue.choose(i); L.step(3); await L.wait(10);
      }
      await press();
      return said;
    },
    end() { const D = g.dialogue; if (D && D.convo) D.close(false); L.step(4); },
    async stageWait(who, n = 60) { for (let k = 0; k < n; k++) { L.step(10); await L.wait(20); if (F.staged().some((q) => q.who === who)) return true; } return false; },
    // papers off (a talk can't stay open under one: the counter, the book, the trip card), the player on foot
    clear() {
      const was = { paper: g.hud.paper, big: g.hud.big, hmode: g.hud.mode, onFoot: g.player.onFoot, mode: g.player.mode, tp: !!g.player.teleporting };
      if (g.hud.big && typeof g.hud.setMode === 'function') g.hud.setMode('hidden');
      if (g.outfitter.open) g.outfitter.hide();
      if (g.journal && g.journal.open) g.journal.close();
      if (g.record && typeof g.record.close === 'function') { try { g.record.close(); } catch { /* */ } }
      if (g.hud.paper && typeof g.hud.closePaper === 'function') g.hud.closePaper(g.hud.paper);
      if (!g.player.onFoot) L.standAt(g.player.x, g.player.z, g.player.heading);
      L.step(4); this.was = was; return was;
    },
    talk(who) { this.clear(); const ok = F.talk(who); L.step(4); return ok; },
    has: (ks) => Object.fromEntries(ks.map((k) => [k, s.has(k) ? (s.get(k) === true ? true : s.get(k)) : false])),
    inv: (id) => g.inventory.count(id, { reachable: false }),
  };
};

try {
  if (!ONLY || ONLY === 'off') {
    const off = await open(APP);
    await newSeason(off, 12);
    const z = await off.evaluate(() => ({ loaded: performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\/src\/(family-cast|family-props)\.js|story-data\/family\.js/.test(n)), fam: window.__game.storyFamily ?? null }));
    result('0 flag off: family-cast.js not fetched, no storyFamily', z.loaded.length === 0 && z.fam === null, z);
    await off.close();
  }
  if (!ONLY || ONLY === 'A') {
    const a = await open(`${APP}/?story=1`);
    await newSeason(a, 12);
    await a.evaluate(PAGE_HELPERS);
    await a.evaluate(() => { const s = window.__game.story; s.debug.fixture('turn'); window.__L.step(6); });

    // 1 the motel and Aili at her counter, a Tuesday morning
    const r1 = await a.evaluate(async () => { const f = window.__f; f.at(2, 10); await f.toStore(); const ok = await f.stageWait('aili'); return { ok, motel: f.F.debug.motel(), staged: f.F.staged() }; });
    result('1 the motel beside the Little Vermilion store; Aili behind her counter on a Tuesday', r1.ok && r1.motel && r1.staged.some((q) => q.who === 'aili' && q.at === 'a4:counter'), r1);
    await shot(a, '1-motel');

    // 2 the first meeting without the bundle (Variant C)
    const r2 = await a.evaluate(async () => { const f = window.__f; f.talk('aili'); const said = await f.say(['I\'m asking about Walt', 'An old man in Ely.']); f.end(); return { said, has: f.has(['aili.met', 'door.family.open', 'asked.aili.walt']), walt: f.s.walt().includes('33:5.w1') }; });
    result('2 Aili, Variant C: "Who sent you in here?"; the arc started, the teaching moment on the Walt page', r2.has['aili.met'] && r2.has['door.family.open'] && r2.walt && r2.said.some((x) => /Who sent you/.test(x)), r2);

    // 3 a second day's visit: "Sit." (step 1); the photo on the wall
    const r3 = await a.evaluate(async () => { const f = window.__f; f.at(3, 10); await f.stageWait('aili'); f.talk('aili'); const said = await f.say(['The photo on the wall?', 'Which one\'s Walt?', 'I\'ll go.']); f.end(); return { said, step: f.F.debug.state().step, has: f.has(['aili.day2', 'aili.sit', 'knows.mummos']) }; });
    result('3 a second day: step 1 ("Sit."), the photo on the wall, Mummo\'s known', r3.step >= 1 && r3.has['aili.sit'] && r3.has['knows.mummos'] && r3.said.some((x) => /swimming rock/.test(x)), r3);

    // 4 June's pot shown: the stone (lock 4 key A, the yield); "Keep it." (on her counter, the pot no longer carried)
    const r4 = await a.evaluate(async () => { const f = window.__f, g = window.__game; try { g.inventory.give('junespot'); } catch { /* full */ } window.__L.step(2); const wants = f.F.debug.wants(); f.F.debug.gift('pot'); window.__L.step(4); const said = await f.say(['Keep it.']); f.end(); window.__L.step(10); return { wants, said, has: f.has(['aili.stone', 'key.L4A', 'door.family.yield', 'aili.pot']), pot: f.inv('junespot'), motel: f.F.debug.motel() }; });
    result('4 June\'s pot shown: the stone (L4A, the yield), "Keep it." (on her counter)', r4.has['key.L4A'] && r4.has['door.family.yield'] && r4.has['aili.pot'] === 'kept' && r4.said.some((x) => /white stone on the stump/.test(x)), r4);

    // 5 a day on: "Eino." (the kitchen table, step 3); a day on: the guest book
    const r5 = await a.evaluate(async () => { const f = window.__f; f.at(4, 10); await f.stageWait('aili'); f.talk('aili'); const s1 = await f.say(['Eino.', 'Where was he going?', 'Did you?', 'Before that?', 'What did he want?']); f.end(); f.at(5, 10); await f.stageWait('aili'); f.talk('aili'); const s2 = await f.say(['Who came to the memorial?', 'Can I take a picture?']); f.end(); window.__L.step(10); return { s1, s2, step: f.F.debug.state().step, has: f.has(['aili.kitchen', 'knows.eino.morning', 'aili.guestbook']), book: f.inv('guestbook') }; });
    result('5 the kitchen table ("Eino.": step 3), then the guest book (an item)', r5.has['aili.kitchen'] && r5.step === 3 && r5.has['aili.guestbook'] && r5.book > 0, r5);

    // 6 Jon at the dock at dusk; the chase (forced at King Williams Narrows: the motorboat trails); shaken; the denial
    const r6 = await a.evaluate(async () => { const f = window.__f, L = window.__L, g = window.__game; f.at(6, 19.5, g.day.doy); const ok = await f.stageWait('jon'); f.talk('jon'); const said = await f.say(['Nice walleye.']); f.end(); return { ok, said, met: f.s.has('jon.met') }; });
    const r6b = await a.evaluate(async () => {
      const f = window.__f, L = window.__L, g = window.__game, s = f.s;
      s.set('tier.1', true, 'rig'); s.set('tier.2', true, 'rig');
      f.at(1, 9, g.day.doy + 1);
      // out on Crane / King Williams Narrows, in the canoe
      await L.tp(-93055, -24067); await L.settle(); for (let k = 0; k < 60 && !g.tiles.readyAt(-93055, -24067); k++) { L.step(5); await L.wait(40); }
      const started = f.F.debug.chase();
      const seen = [];
      for (let k = 0; k < 40; k++) { L.step(30, 1 / 30); await L.wait(10); const st = f.F.debug.state().chase; if (st) seen.push({ mode: st.mode, d: Math.round(Math.hypot(st.x - g.player.x, st.z - g.player.z)) }); }
      const how = f.F.debug.endChase('islands');
      return { started, mode: g.player.mode, seen: seen.slice(-3), how };
    });
    const r6c = await a.evaluate(async () => { const f = window.__f; f.at(6, 19.5); await f.toStore(); await f.stageWait('jon'); f.talk('jon'); const said = await f.say(['That was you on Sand Point.']); f.end(); return { said, denied: f.s.has('jon.denied'), walt: f.s.walt().includes('33:6.7.w.1') }; });
    const d = r6b.seen.length ? r6b.seen[r6b.seen.length - 1].d : null;
    result('6 Jon at the dock: met; the chase (the grey boat trailing), shaken in the islands; the denial\'s tell', r6.met && r6b.started && d != null && d > 150 && d < 900 && r6b.how === 'islands' && r6c.denied && r6c.walt && r6c.said.some((x) => /island you sat behind/.test(x)), { r6, r6b, r6c });
    await shot(a, '6-jon');

    // 7 Liisa: two stories, "Come back Monday."; the Monday: the can, refused toward the road; back on the porch: Aili
    const r7 = await a.evaluate(async () => {
      const f = window.__f, L = window.__L, g = window.__game, s = f.s;
      for (const nb of ['NB04', 'NB06']) s.markRead(nb, 'rig');
      f.at(2, 11); await f.toStore(); const ok = await f.stageWait('liisa');
      f.talk('liisa'); const s1 = await f.say(['Did he drown?', 'Christmas cards?', 'Tell her one of his stories.', 'It\'s in his notebook.', 'Tell her one of his stories.', 'People talk.']); f.end();
      f.talk('liisa'); const s2 = await f.say([]); f.end();
      return { ok, s1, s2, told: s.keys('liisa.told.').length, monday: s.has('liisa.monday'), was: f.was };
    });
    result('7a Liisa: two stories (one in his hand), then "Come back Monday."', r7.ok && r7.told === 2 && r7.monday, r7);
    const r7b = await a.evaluate(async () => {
      const f = window.__f, L = window.__L, g = window.__game, s = f.s;
      f.at(1, 11); await f.toStore(); await f.stageWait('liisa');
      f.talk('liisa'); const said = await f.say(['Who sends them?', 'Can I look at them?']); f.end();
      for (let k = 0; k < 40; k++) { L.step(10); await L.wait(15); }
      const porch = f.F.debug.motel().porch, p = g.player, at = { x: +p.x.toFixed(1), z: +p.z.toFixed(1), d: +Math.hypot(p.x - porch.x, p.z - porch.z).toFixed(1) };
      // toward the road with it: refused (put back inside the lot)
      L.standAt(porch.x + 60, porch.z, 0); for (let k = 0; k < 6; k++) { L.step(10); await L.wait(20); }
      const back = +Math.hypot(p.x - porch.x, p.z - porch.z).toFixed(1);
      // back onto the porch to put it on the shelf: Aili is home early
      L.standAt(porch.x + 10, porch.z, 0); for (let k = 0; k < 4; k++) { L.step(10); await L.wait(20); }
      L.standAt(porch.x, porch.z, 0); for (let k = 0; k < 8 && !f.convo(); k++) { L.step(10); await L.wait(30); }
      const c = f.convo();
      const s2 = await f.say(['Liisa thought']); f.end(); L.step(20);
      return { said, at, back, can: f.F.debug.state().can, climax: c, s2, has: f.has(['cards.seen', 'cards.stone', 'key.L4D', 'choice.aili', 'door.family.done', 'aili.house']), inv: f.inv('coffeecan') };
    });
    result('7b the Monday: the can (L4D); toward the road refused; on the porch Aili home early; "Liisa thought…": thank you', r7b.has['key.L4D'] && r7b.at.d < 4 && r7b.back <= 32 && r7b.climax && r7b.climax.choices.some((t) => /^I know/.test(t)) && r7b.has['choice.aili'] === 'thanks' && r7b.has['door.family.done'] && r7b.inv === 0, r7b);
    await shot(a, '7-porch');

    // 8 Gord on a Thursday at the outfitter's dock
    const r8 = await a.evaluate(async () => { const f = window.__f, L = window.__L, g = window.__game; f.at(4, 12, g.day.year && g.day.doy + 20); await f.toStore(); const ok = await f.stageWait('gord'); f.talk('gord'); const said = await f.say(['Do Americans come up much?', 'Anyone lately?', 'What was he like?']); f.end(); return { ok, said, told: f.s.has('gord.told'), boat: !!f.F.gordMb }; });
    result('8 Gord on a Thursday (his boat tied): the old American who paid cash', r8.ok && r8.told && r8.said.some((x) => /thank you twice/.test(x)), r8);

    // 9 Danielle at the Sucker end of Prairie Portage (a weekday); the canoe logged: the line turns north
    const r9 = await a.evaluate(async () => { const f = window.__f, L = window.__L, g = window.__game; f.at(2, 11); await L.tp(-16605, 4549); await L.settle(); for (let k = 0; k < 60 && !f.F.debug.danielle(); k++) { L.step(10); await L.wait(30); } const dn = f.F.debug.danielle(); const q = f.F.debug.danielle(); const w = g.world; let st = null; for (let k = 0; k < 16 && !st; k++) { const a = (k / 16) * Math.PI * 2, x = q.x + Math.cos(a) * 1.6, z = q.z + Math.sin(a) * 1.6; if (!w.isWater(x, z)) st = { x, z }; } if (st) L.standAt(st.x, st.z, Math.atan2(-(q.z - st.z), q.x - st.x)); f.clear(); f.F.debug.talkDanielle(); L.step(4); const open = f.convo(), was = f.was, after = { paper: g.hud.paper, big: g.hud.big, mode: g.player.mode, onFoot: g.player.onFoot, tp: !!g.player.teleporting }; const said = await f.say(['Ever find a canoe?', 'A white stone on a stump?']); f.end(); return { dn, open, was, after, said, has: f.has(['danielle.met', 'danielle.log', 'danielle.stone']), north: f.s.north }; });
    result('9 Danielle (re-sited: the US end of Prairie Portage): the canoe logged, "went north"; the Carp end named', r9.dn && r9.has['danielle.log'] && r9.north === true, r9);

    // 10 the Carp end: the stump with the clean ring and the cairn; the dot's Look on each (E)
    const r10 = await a.evaluate(async () => { const f = window.__f, L = window.__L, g = window.__game; await L.tp(-10054, 2049); await L.settle(); for (let k = 0; k < 60 && !f.F.debug.carp(); k++) { L.step(10); await L.wait(30); } const dots = f.F.debug.carp() || []; f.clear(); const was = f.was; const seen = []; for (const q of dots) { L.face(q, 1.4, q.y); L.step(4); const t = L.target(); seen.push(t); } return { dots, seen, was, after: { paper: g.hud.paper, big: g.hud.big, mode: g.player.mode } }; });
    const looked = [];
    for (let k = 0; k < (r10.dots || []).length; k++) {
      const q = r10.dots[k];
      await a.evaluate((q) => { const L = window.__L; L.face(q, 1.4, q.y); L.step(4); }, q);
      await a.keyboard.press('KeyE'); await a.evaluate(() => window.__L.step(4));
      looked.push(await a.evaluate((k) => window.__f.s.has(k), q.fact));
    }
    const r10b = await a.evaluate(() => ({ has: window.__f.has(['carp.stump', 'carp.stone']), walt: window.__f.s.walt().includes('a4:w.carp') }));
    result('10 the Carp end (US side): the stump\'s ring and the cairn, Look on each; the Walt line', (r10.dots || []).length === 2 && r10b.has['carp.stump'] && r10b.has['carp.stone'], { ...r10, looked, r10b });
    await shot(a, '10-carp');
    await a.close();
  }
} catch (e) { result('the rig ran', false, { error: String(e && e.stack || e).slice(0, 1500) }); }
result('no page errors', errors.length === 0, { errors: errors.slice(0, 6) });
await browser.close();
const fail = results.filter((r) => !r.pass);
log(`${results.length - fail.length}/${results.length} PASS`);
process.exit(fail.length ? 1 : 0);
