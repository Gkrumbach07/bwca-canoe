// Campaign stream S (Round 4): S1 and S8 from their doors to their ends, in the real game, headless Chromium against a
// running Vite (?story=1), each check printed PASS or FAIL.
//   s1   a walk evening on the Stuart: Ollie staged on the trail, three meetings ("Evening." twice, then he stops), A:
//        "You're on." is the yes; the next walk evening the loaded carry (timedCarry, a stand-in walker at the carry pace
//        along the trail's own line: the probe) beats 49, his line, B at the river: the log page, the end and its stamp
//   s8   a Thursday in August on Insula: Tom at his crew's camp (the rule, the teaching), the Ostbys (the snapshot, the
//        creek), the sled looked at (the yes), the clearing (found, its stamp, Tom's eye names the stump, the tin), back to
//        Tom: "Older than fifty. Leave it." (the end, the tin taken), lock 5 key B; the third week of September the sled
//        stays
//   off  the flag off: none of S's modules loaded, no fixed parties
//
//   APP=http://localhost:5290 node scripts/cmp-s-test.mjs [--only s1|s8|off]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T, choose, hear } from './slice/c1-talk.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5290').replace(/\/$/, '');
const ONLY = arg('only', null);
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1500)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(query) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /story S|sides:/.test(t)) log('console', m.type(), t.slice(0, 300)); });
  await page.goto(`${APP}/${query ? '?' + query : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  return page;
}
async function newSeason(page, home, doy, story = true) {
  await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await page.waitForFunction((story) => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && (!story || (g.storySeams && g.storyTalk && g.storyEpisodes && g.storyLayer && g.storySides)); }, story, { timeout: 200000, polling: 250 });
}
// the S helpers on the page: the clock, a day turn, facts
const HELPERS_S = () => {
  const g = window.__game, S = window.__s = {}, L = window.__L;
  S.at = (doy, h) => { g.day.setClock(2026, doy, h); g.story.lastQ = null; g.story.update(); g.storyEpisodes.episodes.dayTurn(true); L.step(4); };
  S.f = (keys) => Object.fromEntries(keys.map((k) => [k, g.story.has(k) ? g.story.get(k) : false]));
  S.sides = () => g.storySides;
  S.tick = async (ms = 400) => { L.step(6); await L.wait(ms); L.step(4); };
  S.use = (prop) => { const l = g.storyLayer, q = l.prop(prop), v = l.verbs(prop)[0]; if (!q || !v) return false; l.use(q.place, v); L.step(3); return true; };
  S.by = (f) => { if (f) window.__t.standAt(f.x + 1.4, f.z + 0.9, Math.atan2(-(f.z - (f.z + 0.9)), f.x - (f.x + 1.4))); L.step(3); return !!f; };
  S.doyOf = (m, d) => Math.round((Date.UTC(2026, m - 1, d) - Date.UTC(2026, 0, 0)) / 864e5);
  S.dowOf = (doy) => new Date(Date.UTC(2026, 0, doy)).getUTCDay();
  return true;
};
async function closeTalk(page) { for (let k = 0; k < 20; k++) { const c = await page.evaluate(() => window.__t.convo()); if (!c) return; await page.keyboard.press(`Digit${c.choices.length}`); await page.waitForTimeout(60); } await page.keyboard.press('Escape'); }

try {
  if (!ONLY || ONLY === 'off') {
    const page = await open('');
    await newSeason(page, 25, 160, false);
    const r = await page.evaluate(() => {
      const g = window.__game, mods = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\//.test(n)).map((n) => n.replace(/^.*\/src\//, '').replace(/\?.*$/, ''));
      return { mine: mods.filter((n) => /^(feed-sides)\.js$|minigames\/timed-carry|story-data\/sides-s/.test(n)), fixed: !g.parties || !g.parties.fixedLive, sides: !g.storySides };
    });
    result('off: the flag off: none of S\'s modules loaded, no fixed parties', r.mine.length === 0 && r.fixed && r.sides, r);
    await page.context().close();
  }
  if (!ONLY || ONLY === 's1') {
    const page = await open('story=1');
    const tue = await page.evaluate(() => { let d = 153; while (new Date(Date.UTC(2026, 0, d)).getUTCDay() !== 2) d++; return d; }); // the first Tuesday in June
    await newSeason(page, 16, tue);
    await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T); await page.evaluate(HELPERS_S);
    await page.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); window.__L.step(20); });
    // 1. Ollie on the trail at 19:20 (walking north)
    const s1 = await page.evaluate(async (tue) => {
      const S = window.__s, D = S.sides().debug, L = window.__L;
      S.at(tue, 19.33);
      const pos = D.ollieAt(), p = D.at(pos ? pos.d : 0);
      await L.near(p.x + 20, p.z + 20); window.__t.standAt(p.x + 20, p.z + 20); // (a teleport inland goes to the nearest water: stand on the trail)
      for (let k = 0; k < 20 && !S.sides().ollie(); k++) { S.at(tue, 19.33); window.__t.standAt(p.x + 20, p.z + 20); await S.tick(300); }
      const o = S.sides().ollie();
      return { len: Math.round(D.LEN), idx: D.stuartIndex, pos, staged: !!o, at: o ? [Math.round(o.x), Math.round(o.z)] : null };
    }, tue);
    result('s1.1 a walk evening: Ollie staged on the Stuart Portage (2.8 km), walking north', s1.staged && s1.idx >= 0 && s1.len > 2700 && s1.pos && s1.pos.mode === 'walk', s1);
    // 2. three meetings: out, back, the next walk evening out; the third time he stops (A)
    const s2 = await page.evaluate(async (tue) => {
      const S = window.__s, D = S.sides().debug, L = window.__L, g = window.__game, out = [];
      const meetAt = async (doy, h) => { S.at(doy, h); const pos = D.ollieAt(); const p = D.at(pos.d); window.__t.standAt(p.x + 3, p.z + 3); await S.tick(500); out.push({ h, met: g.story.when('met:ollie>=' + (out.length + 1)) }); };
      await meetAt(tue, 19.3); await meetAt(tue, 20.1); await meetAt(tue + 2, 19.25);
      return { out, stop: !!D.O.stop };
    }, tue);
    result('s1.2 three meetings counted (one each way), the third time he stops', s2.out.every((x) => x.met) && s2.stop, s2);
    // A: "I like it here." → "You're not carrying anything." → "Fastest anybody's done it?" → "You're on."
    await page.evaluate(() => window.__s.sides().ollieTalk());
    const a = [await choose(page, 'I like it here.'), await choose(page, 'You\'re not carrying anything.'), await choose(page, 'Fastest anybody'), await choose(page, 'You\'re on.')];
    await hear(page); await closeTalk(page);
    const f2 = await page.evaluate(() => ({ ...window.__s.f(['ep.S1.yes', 'ollie.squad', 'ollie.stopped']), st: window.__game.storyEpisodes.episodes.state('S1'), page: window.__game.storyEpisodes.episodes.page('S1') }));
    result('s1.3 A: his offer accepted is the yes; the Stories page in the player\'s hand', a.every((x) => x.ok) && f2['ep.S1.yes'] && f2.st.started && f2.page && f2.page.lines.length >= 2, { a, f2 });
    // 4. the loaded carry, the next walk evening: armed at the road end, a stand-in walker at 1 m/s along the line
    const s4 = await page.evaluate(async (tue) => {
      const S = window.__s, D = S.sides().debug, L = window.__L, g = window.__game, t = window.__t;
      const day = tue + 7; S.at(day, 18.95);
      await L.near(D.ROAD.x + 6, D.ROAD.z + 6); await S.tick(500);
      const armed = D.ollieAt();
      let d = 0, h = 18.95, carrying = true;
      D.K.probe = () => { const p = D.at(Math.max(0, d)); return { x: d < 0 ? D.ROAD.x : p.x, z: d < 0 ? D.ROAD.z : p.z, hours: g.story.nowAbs() * 24, carrying, pack: true }; };
      d = -10; await S.tick(300);
      const h0 = !!D.K.h;
      // walk it: 10 game-seconds a step at 1 m/s (the carry pace), the clock with it
      for (let k = 0; k < 400 && D.K.h; k++) { d = Math.min(D.LEN, d + 60); h += 1 / 60; if (d >= D.LEN) carrying = false; S.at(day, h); await L.wait(120); }
      void t;
      D.K.probe = null;
      const r = D.S1st();
      // by Ollie at the river: his line, then B
      const o = S.sides().ollie(); if (o) { window.__t.standAt(o.x + 3, o.z + 2); await S.tick(500); }
      return { armed, h0, carry: r.carry, tries: r.tries, f: S.f(['mg.timedCarry.beat', 'ep.S1.beat']), ollie: !!o, pending: D.O.pending };
    }, tue);
    result('s1.4 the loaded carry: armed with Ollie at the road end, run at the carry pace, beats 49 (mg:timedCarry → ep.S1.beat)', s4.armed && s4.armed.armed && s4.h0 && s4.carry && s4.carry.result === 'beat' && s4.f['ep.S1.beat'], s4);
    await page.evaluate(() => window.__s.sides().ollieTalk());
    const b = [await choose(page, 'What was the worst search'), await choose(page, 'What happened to him?'), await choose(page, 'Is that wrong?')];
    const said = await hear(page); await closeTalk(page);
    const f5 = await page.evaluate(() => ({ ...window.__s.f(['ep.S1.log', 'ep.S1.end', 'nb.page.ollielog', 'ollie.upwind']), page: window.__game.storyEpisodes.episodes.page('S1'), firsts: (window.__game.record && window.__game.record.firstsOf ? window.__game.record.firstsOf() : null) }));
    result('s1.5 B at the river: the worst search, the log page given, the episode ends (beat) with its stamp', b.every((x) => x.ok) && f5['ep.S1.log'] && f5['ep.S1.end'] === 'beat' && f5['nb.page.ollielog'] && f5.page && f5.page.first === 'Beat the squad on the Stuart', { b, said, f5 });
    await page.context().close();
  }
  if (!ONLY || ONLY === 's8') {
    const page = await open('story=1');
    const thu = await page.evaluate(() => { let d = Math.round((Date.UTC(2026, 7, 6) - Date.UTC(2026, 0, 0)) / 864e5); while (new Date(Date.UTC(2026, 0, d)).getUTCDay() !== 4) d++; return d; });
    await newSeason(page, 25, thu);
    await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T); await page.evaluate(HELPERS_S);
    await page.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); window.__L.step(20); });
    // 1. Tom by his crew's camp on Insula (a Thursday): the rule, when, the teaching
    const t1 = await page.evaluate(async (thu) => {
      const S = window.__s, D = S.sides().debug, L = window.__L;
      S.at(thu, 10);
      const c = D.fixedCamp('tom') || D.daySite('tom'), sp = D.tomSpot();
      if (sp) { await L.near(sp.x + 8, sp.z + 6); await S.tick(800); }
      return { camp: c, spot: sp, tom: !!S.sides().tom() };
    }, thu);
    result('s8.1 Tom\'s ranger crew camps on Insula on a Thursday (a fixed party), Tom staged there', t1.camp && t1.tom, t1);
    await page.evaluate(() => { const S = window.__s; S.by(S.sides().tom()); return S.sides().tomTalk(); });
    const tc = [await choose(page, 'The sled on the rock?'), await choose(page, 'Why not?'), await choose(page, 'When?'), await choose(page, 'What would an old cabin site look like?')];
    await hear(page); await closeTalk(page);
    const f1 = await page.evaluate(() => window.__s.f(['tom.said.sled', 'tom.said.why', 'tom.said.when', 'ep.S8.taught', 'ep.S8.yes']));
    result('s8.2 Tom: the sled on his list, the fifty-year rule, the third week of September, the teaching (and nothing started)', tc.every((x) => x.ok) && f1['ep.S8.taught'] && !f1['ep.S8.yes'], { tc, f1 });
    // 3. the Ostbys: the snapshot, the creek
    const o1 = await page.evaluate(async (thu) => { const S = window.__s, D = S.sides().debug, L = window.__L; S.at(thu, 16); const sp = D.ostbySpot(); if (sp) { await L.near(sp.x + 6, sp.z + 6); await S.tick(800); } return { spot: sp, vern: !!S.sides().ostbys() }; }, thu);
    await page.evaluate(() => { const S = window.__s; S.by(S.sides().ostbys()); return S.sides().ostbyTalk(); });
    const oc = [await choose(page, 'Have you got a picture?'), await choose(page, 'Where was the trapper')];
    await hear(page); await closeTalk(page);
    const f3 = await page.evaluate(() => window.__s.f(['ep.S8.ostbys', 'ep.S8.snap', 'ep.S8.creekknown', 'nb.page.ostbysnap']));
    result('s8.3 the Ostbys by the rock (3–9 August): the 1968 snapshot (a book page), the creek with the beaver house', o1.vern && oc.every((x) => x.ok) && f3['ep.S8.snap'] && f3['ep.S8.creekknown'], { o1, oc, f3 });
    // 4. the sled looked at: the yes
    const s4 = await page.evaluate(async () => { const S = window.__s, L = window.__L, l = window.__game.storyLayer, q = l.prop('s8.sled'); await L.near(q.prop.x + 3, q.prop.z + 3); await S.tick(400); const name = l.dotName('s8.sled'); const used = S.use('s8.sled'); await S.tick(300); return { name, used, f: S.f(['ep.S8.sled', 'ep.S8.yes', 'ep.S8.rock']), st: window.__game.storyEpisodes.episodes.state('S8') }; });
    result('s8.4 the sled on the lunch rock: "Old sled", Look is the yes', s4.used && s4.f['ep.S8.yes'] && s4.st.started, s4);
    // 5. the clearing: found (its stamp), Tom's eye names the stump, the tin taken, the reading (lock 5 key B)
    const s5 = await page.evaluate(async () => {
      const S = window.__s, L = window.__L, g = window.__game, l = g.storyLayer, q = l.place('s8.clearing');
      await L.near(q.x + 2, q.z + 2); await S.tick(600); l.poll(); await S.tick(300);
      const stump = l.dotName('s8.stump1'), hollow = l.dotName('s8.hollow');
      S.use('s8.stump1'); S.use('s8.tin'); await S.tick(400);
      return { stump, hollow, f: S.f(['ep.S8.clearing', 'ep.S8.found', 'ep.S8.looked', 'ep.S8.done', 'ep.S8.tin', 'key.L5B']), tin: g.inventory.count('ertin', { reachable: false }), first: (g.storyEpisodes.episodes.st('S8') || {}).first };
    });
    result('s8.5 the clearing in the burn: found and stamped, the stump read with Tom\'s eye, the tin taken, lock 5 key B\'s reading', s5.f['ep.S8.found'] && /standing in snow/.test(s5.stump || '') && s5.f['ep.S8.tin'] && s5.tin > 0 && s5.f['ep.S8.done'] && s5.first === 'S8.first', s5);
    // 6. back to Tom: "I found where it came from." → "Older than fifty. Leave it." → "Take it."
    await page.evaluate(async (thu) => { const S = window.__s, D = S.sides().debug, L = window.__L; S.at(thu + 1, 10); const sp = D.tomSpot(); if (sp) { await L.near(sp.x + 8, sp.z + 6); await S.tick(800); } }, thu);
    await page.evaluate(() => { const S = window.__s; S.by(S.sides().tom()); return S.sides().tomTalk(); });
    const ac = [await choose(page, 'I found where it came from.'), await choose(page, 'Older than fifty'), await choose(page, 'Take it.')];
    await hear(page); await closeTalk(page);
    const f6 = await page.evaluate(async (thu) => {
      const S = window.__s, g = window.__game;
      const out = { ...S.f(['ep.S8.leave', 'ep.S8.end', 'ep.S8.tinGiven', 'tom.friend']), tin: g.inventory.count('ertin', { reachable: false }), page: g.storyEpisodes.episodes.page('S8') };
      S.at(S.doyOf(9, 20), 12); await S.tick(300);
      out.gone = g.story.has('ep.S8.gone'); out.shown = !!g.storyLayer.dotName('s8.sled');
      return out;
    }, thu);
    result('s8.6 the argument: "Older than fifty. Leave it." — heritage, the tin to Tom; the sled stays past the third week of September', ac.every((x) => x.ok) && f6['ep.S8.leave'] && f6['ep.S8.end'] === 'heritage' && f6.tin === 0 && !f6.gone, { ac, f6 });
    await page.context().close();
  }
} finally {
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 8) });
  await browser.close();
  const fails = results.filter((r) => !r.pass).length;
  log(`cmp-s-test: ${results.length - fails}/${results.length}${fails ? ' FAIL' : ' PASS'}`);
  process.exit(fails ? 1 : 0);
}
