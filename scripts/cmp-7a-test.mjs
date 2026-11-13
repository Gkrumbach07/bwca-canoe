// Round 7 stream 7a's rig (60 S2, S3, S4): each side story from its door to its end in the real game, headless Chromium
// against a running Vite with ?story=1, each check printed PASS or FAIL. Talk by real keys (choose/hear, c1-talk.mjs);
// the clock and places by the slice helpers (L.tp / L.near, never a raw teleport); the night's minutes and the howl's
// quiet by the clock (setClock), the prints by the real camera (photo.raise/shoot), "Look at this" through show.js.
//   S2  the Tattler's notice taken at 16; Duane in the lot on a Saturday ("Where do I camp?"); the night at two at
//       Big Moose's west site: the cow, the knock, the quiet, the bear; the frame taken toward the birches, lamp off;
//       the ridge's tracks; the frame sold to Duane ($200 owed) and the end; tie off at the snag
//   S3  Elaine at Slim 6 (the sheet, the yes); a strong night's aurora on Fourtown and its print; logged with Elaine;
//       foxfire logged; the second log: Walt's line; Lift at the long rock: the red lens; the lamp shows red; the one
//       light (out at a white lamp), its print, Elaine's question mark, the end
//   S4  Kari on a Friday ("What's the job?"); the tracks taught (tracks.read, the dot's words); Howl and Mark at the
//       three stakes at 03:00 (three bearings in the pencil, the ring); the meadow in August (pups drawn, the print,
//       Kari's count); 16 October: shut; Leon's counter: Kari's report, the end
//   off the flag off: none of 7a's modules fetched
//
//   APP=http://localhost:5300 node scripts/cmp-7a-test.mjs [--only off|S2|S3|S4] [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T, choose, hear } from './slice/c1-talk.mjs';
import { HELPERS_E } from './slice/c2-episodes.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5300').replace(/\/$/, '');
const ONLY = arg('only', null), SHOTS = arg('shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1600)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function open(query) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /7a/.test(t)) log('console', m.type(), t.slice(0, 300)); });
  await page.goto(`${APP}/${query ? '?' + query : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  return page;
}
async function newSeason(page, home, doy, story = true) {
  await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await page.waitForFunction((story) => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && (!story || (g.storyEpisodes && g.storyLayer && g.side7a)); }, story, { timeout: 200000, polling: 250 });
}
const W = (page, fn, a) => page.evaluate(fn, a);
// helpers on the page: the store's person by key, a print taken facing a point (or a bearing), shown to someone
const HELPERS_7 = () => {
  const g = window.__game, L = window.__L, E = window.__e, S = window.__s7 = {};
  S.d = () => g.side7a.debug;
  S.staged = async (who, ep) => { for (let k = 0; k < 60 && !S.d().staged().includes(who); k++) { L.step(4); await L.wait(120); } return S.d().staged().includes(who); };
  S.talk = (who, ep) => window.__t.talkTo(`cast:${who}:${ep}`) || S.d().talkTo(who);
  S.shot = async (q, y = null) => {
    const P = g.photo; if (!P.raised) P.raise(); L.step(2);
    if (q) { const yaw = Math.atan2(-(q.z - g.camera.position.z), q.x - g.camera.position.x); g.chase.viewYaw = yaw; g.chase.forwardYaw = yaw; if (y != null) g.chase.viewPitch = y; }
    for (let k = 0; k < 12; k++) L.step(1);
    const n0 = P.prints().length; P.shoot(); for (let k = 0; k < 8 && P.prints().length === n0; k++) L.step(1);
    const r = P.prints()[0]; P.lower(); L.step(2);
    return r ? { id: r.id, matches: g.storyEpisodes.episodes.matchesOf(r.id) } : null;
  };
  // "Look at this" with a print or a thing: the want's lines, then its scene's node, walked by the first choice that
  // starts with each prefix in turn ('…' pressed through) → { said, facts }
  S.show = (who, thing, prefixes = []) => {
    const run = S.d().scene(who), sh = g.storyEpisodes.show, said = [];
    let n = sh.shown(who, thing, run, 'open');
    for (let k = 0; k < 40 && n; k++) {
      if (n.say) said.push(n.say);
      const ch = n.choices || []; if (!ch.length) break;
      const want = prefixes[0] ? ch.find((c) => (c.text || '').startsWith(prefixes[0])) : null;
      if (want) { prefixes.shift(); n = want.go(); continue; }
      if (ch.length === 1 && ch[0].text === '…') { n = ch[0].go(); continue; }
      break;
    }
    return said;
  };
  S.page = (id) => g.storyEpisodes.episodes.page(id);
  S.owed = () => { const D = g.story.doc && g.story.doc.dir; return D && Array.isArray(D.pay) ? D.pay.map((p) => p.amt) : []; };
  return true;
};

async function boot(home, doy) {
  const page = await open('story=1');
  await newSeason(page, home, doy);
  await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T); await page.evaluate(HELPERS_E); await page.evaluate(HELPERS_7);
  await W(page, () => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); window.__L.step(20); });
  return page;
}

try {
  if (!ONLY || ONLY === 'off') {
    const page = await open('');
    await newSeason(page, 16, 171, false);
    const r = await W(page, () => { const mods = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\//.test(n)).map((n) => n.replace(/^.*\/src\//, '').replace(/\?.*$/, '')); return { mine: mods.filter((n) => /7a|nightwatch|skywatch|minigames\/howl/.test(n)), side7a: !!window.__game.side7a }; });
    result('off: the flag off: none of 7a\'s modules fetched, nothing hung', r.mine.length === 0 && !r.side7a, r);
    await page.context().close();
  }

  // --- S2 ------------------------------------------------------------------------------------------------------------
  if (!ONLY || ONLY === 'S2') {
    const page = await boot(16, 171); // Saturday 20 June 2026
    const a = await W(page, async () => { const E = window.__e; E.at(2026, 171, 10.5); await E.toStore(16); const R = E.R(); return { flyers: R.flyers(16).map((f) => f.id), took: R.take('ep:S2'), open: R.open() }; });
    result('S2a the Tattler\'s notice on Leon\'s board (with Kari\'s), taken: S2 open', a.flyers.includes('ep:S2') && a.flyers.includes('ep:S4') && a.took && a.open.includes('S2'), a);
    const st = await W(page, () => window.__s7.staged('duane', 16));
    await W(page, () => { window.__s7.talk('duane', 16); window.__L.step(4); });
    const h1 = await hear(page); const c1 = await choose(page, 'Where do I camp?'); const h2 = await hear(page);
    const b = await W(page, () => ({ said: window.__game.story.has('duane.said.where'), met: window.__game.story.has('duane.met'), page: window.__s7.page('S2') }));
    result('S2b Duane in the lot on a Saturday: his opener, "Where do I camp?" (the page has him and the site)', st && /my guy/.test(h1.join(' ')) && c1.ok && /west site/.test(h2.join(' ')) && b.said && b.page && b.page.lines.length >= 2, { st, h1, c1, h2, b });
    await page.keyboard.press('Escape');
    // the night at two at the west site
    const n = await W(page, async () => {
      const g = window.__game, E = window.__e, L = window.__L, S = window.__s7;
      const pl = E.place('s2.ridge'); await E.ashore('s2.ridge', 10);
      E.at(2026, 172, 2.0); const d = S.d().doc(); d.pending = true; d.nightYear = null; L.step(6);
      const on = !!S.d().nw();
      const seen = {};
      for (const h of [2.008, 2.03, 2.052, 2.075]) { g.day.setClock(2026, 172, h); L.step(4); const nw = S.d().nw(); if (nw) seen[h] = { phase: nw.phase, moose: nw.moose().show, pose: nw.moose().pose }; }
      // the frame: in the silent minute, lamp off, toward the two birches
      g.lamp.toggle(false); const bir = E.prop('s2.birches');
      const shot = await S.shot(bir, 0.05);
      for (const h of [2.1, 2.15, 2.21]) { g.day.setClock(2026, 172, h); L.step(4); }
      return { on, seen, shot, night: g.story.has('ep.S2.night'), frame: g.story.has('ep.S2.frame'), done: !S.d().nw(), tracks: g.side7a.draw.trackSets.size, yes: g.story.has('ep.S2.yes'), at: { x: pl.x, z: pl.z } };
    });
    result('S2c the night at two: it starts at the site; the walk, the knock, the quiet; the frame taken toward the birches; done, the ridge\'s tracks', n.on && n.shot && n.shot.matches.includes('s2.frame') && n.frame && n.night && n.done && n.tracks >= 2, n);
    const f = await W(page, async () => {
      const S = window.__s7, said = S.show('duane', { kind: 'print', id: (window.__game.photo.prints()[0] || {}).id, matches: ['s2.frame'] }, ['The site.', 'Sell it.']);
      window.__L.step(4);
      const g = window.__game; return { said, sold: g.story.has('ep.S2.sold'), end: g.story.get('ep.S2.end'), owed: S.owed(), page: S.page('S2') };
    });
    result('S2d the frame to Duane: "Where were you standing?" … "Sell it.": $200 owed, the end (sold), the page\'s last line', f.sold && f.end === 'sold' && f.owed.includes(200) && f.page && /Tattler/.test(f.page.end || '') && f.said.some((l) => /standing/.test(l)), f);
    const tie = await W(page, () => { const g = window.__game; g.player.mode = 'paddle'; const ok = g.side7a.debug.tieOff(); return { ok, learned: g.story.has('tieoff.learned') }; });
    result('S2e tie off at the snag: tieoff.learned (stream r\'s verb when it is in)', tie.learned, tie);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 's2.png') });
    await page.context().close();
  }

  // --- S3 ------------------------------------------------------------------------------------------------------------
  if (!ONLY || ONLY === 'S3') {
    const page = await boot(6, 245); // 2 September 2026
    const st = await W(page, async () => { const E = window.__e; E.at(2026, 245, 14.5); await E.toStore(6); return window.__s7.staged('elaine', 6); });
    await W(page, () => { window.__s7.talk('elaine', 6); window.__L.step(4); });
    const h1 = await hear(page); const c1 = await choose(page, 'What\'s out there?'); const h2 = await hear(page);
    const a = await W(page, () => { const g = window.__game; return { yes: g.story.has('ep.S3.yes'), sheet: g.story.has('nb.page.skysheet') }; });
    result('S3a Elaine at Slim 6: the sky book, "What\'s out there?": her sheet, S3 open', st && /sky book/.test(h1.join(' ')) && c1.ok && a.yes && a.sheet, { st, h1, h2, a });
    await page.keyboard.press('Escape');
    const n = await W(page, async () => {
      const g = window.__game, E = window.__e, L = window.__L, S = window.__s7;
      const m = await import('/src/minigames/skywatch.js'), seed = `${g.story.doc.season}`, strong = m.strongNights(2026, seed).find((d) => d >= 245) ?? m.strongNights(2026, seed)[0];
      await E.ashore('s3.longrock', 6);
      E.at(2026, strong, 23.6); L.step(10);
      const sky = S.d().sky(), aur = g.side7a.draw.aur && g.side7a.draw.aur.visible;
      const north = { x: g.player.x, z: g.player.z - 3000 };
      const shot = await S.shot(north, 0.25);
      const said = S.show('elaine', { kind: 'print', id: shot && shot.id, matches: shot ? shot.matches : [] });
      // foxfire, carried in (the second light)
      const ff = g.inventory.place('foxfire', 1, {}); const said2 = S.show('elaine', { kind: 'item', id: 'foxfire' });
      return { strong, events: sky && sky.events.map((e) => e.kind), aur, shot, said, ff: !!(ff && ff.ok), said2, log: E.facts(['ep.S3.log.aurora', 'ep.S3.log.foxfire', 'ep.S3.two', 'ep.S3.match']) };
    });
    result('S3b a strong night on Fourtown: the aurora drawn, its print facing north, logged with Elaine; foxfire logged: two', n.aur && n.shot && n.shot.matches.includes('s3.aurora') && n.log['ep.S3.log.aurora'] && n.log['ep.S3.log.foxfire'] && n.log['ep.S3.two'], n);
    const sq = await W(page, async () => { const E = window.__e; E.at(2026, 250, 14.5); await E.toStore(6); await window.__s7.staged('elaine', 6); window.__s7.talk('elaine', 6); window.__L.step(4); return true; });
    const h3 = await hear(page, 8); await page.keyboard.press('Escape');
    const lift = await W(page, async () => {
      const g = window.__game, E = window.__e, L = window.__L; const sq = g.story.has('ep.S3.square');
      await E.ashore('s3.longrock', 4); const lay = g.storyLayer, v = lay.verbs('s3.stone');
      if (v[0]) lay.use(lay.place('s3.longrock'), v[0]); L.step(6);
      g.lamp.toggle(true); L.step(30);
      return { sq, verbs: v.map((x) => x.verb), tin: g.story.has('ep.S3.tin'), lens: g.inventory.count('redlens', { reachable: true }), mode: g.side7a.debug.lampMode(), lensFact: g.story.has('lens.red') };
    });
    result('S3c the second log: Walt\'s line in the binder; Lift at the long rock: the red lens; the lamp shows red', sq && lift.sq && /Kept the red on/.test(h3.join(' ')) && lift.verbs.includes('Lift') && lift.tin && lift.lens > 0 && lift.mode === 'red' && lift.lensFact, { h3, lift });
    const one = await W(page, async () => {
      const g = window.__game, E = window.__e, L = window.__L, S = window.__s7;
      await E.ashore('s3.northbay', 6); E.at(2026, 262, 1.0); L.step(4);
      const nb = E.place('s3.northbay'), mg = g.storyEpisodes.minigames;
      const h = mg.start('skywatch', { at: { x: nb.x - 200, z: nb.z + 600 }, wind: { x: 0, z: 1 }, hours: 25 });
      for (let k = 0; k < 6; k++) { h.update(0.5, { player: { x: g.player.x, z: g.player.z }, lamp: 'off' }); L.step(1); }
      const seen = g.story.has('mg.skywatch.seen');
      g.lamp.toggle(true); g.lamp.red = false;
      const face = { x: h.x - g.player.x, z: h.z - g.player.z }; h.update(0.1, { player: { x: g.player.x, z: g.player.z }, lamp: 'white', face });
      return { seen, out: h.done && h.done.result, fact: g.story.has('mg.skywatch.out') };
    });
    const mk = await W(page, () => { const g = window.__game, S = window.__s7; g.story.rules.apply({ id: 'rig:one', then: ['f:ep.S3.onelight'] }, {}); const said = S.show('elaine', { kind: 'print', id: 999, matches: ['s3.onelight'] }, ['Low, steady', 'It went upwind', 'It went out when']); return { said, mark: g.story.has('ep.S3.mark'), end: g.story.get('ep.S3.end'), page: S.page('S3') }; });
    result('S3d the one light: seen, out the moment the lamp shows white; its print to Elaine: three tries, the question mark; the end', one.seen && one.out === 'out' && mk.mark && mk.end === 'mark' && mk.said.some((l) => /nothing in front of it/.test(l)), { one, mk });
    await page.context().close();
  }

  // --- S4 ------------------------------------------------------------------------------------------------------------
  if (!ONLY || ONLY === 'S4') {
    const page = await boot(16, 177); // Friday 26 June 2026
    const st = await W(page, async () => { const E = window.__e; E.at(2026, 177, 11); await E.toStore(16); return window.__s7.staged('kari', 16); });
    await W(page, () => { window.__s7.talk('kari', 16); window.__L.step(4); });
    const h1 = await hear(page); const c1 = await choose(page, 'What\'s the job?'); await hear(page); await page.keyboard.press('Escape');
    await W(page, () => { window.__s7.talk('kari', 16); window.__L.step(4); });
    const h2 = await hear(page); await page.keyboard.press('Escape');
    const a = await W(page, () => { const g = window.__game, D = g.side7a; return { yes: g.story.has('ep.S4.yes'), tracks: g.story.has('tracks.read'), set: D.draw.trackSets.has('s4.landing'), words: D.tracks.words('wolf') }; });
    result('S4a Kari on a Friday: "What\'s the job?" (S4 open); the next talk, the landing\'s mud: tracks.read, the dot\'s words', st && /count wolves/.test(h1.join(' ')) && c1.ok && a.yes && /Front foot/.test(h2.join(' ')) && a.tracks && a.set && /^Wolf, one/.test(a.words || ''), { h1, h2, a });
    const sv = await W(page, async () => {
      const g = window.__game, E = window.__e, L = window.__L, S = window.__s7, out = [];
      for (const [i, s] of S.d().stations().entries()) {
        if (!s.at) { await E.ashore(s.place, 4); }
        await E.ashore(s.place, 4); const at = E.prop(s.prop); if (!at) { out.push({ id: s.id, why: 'no stake' }); continue; }
        let r = { id: s.id, nights: 0 };
        // a silent night is the pack's, not the rig's: up to four nights at a stake
        for (let night = 0; night < 4 && !g.story.has(`ep.S4.${s.id}`); night++) {
          const doy = 178 + i * 4 + night; r.nights++;
          L.standAt(at.x + 1.5, at.z + 1.5, 0); E.at(2026, doy, 3.0); L.step(4);
          S.d().startHowl({ ...s, x: at.x, z: at.z });
          let hw = S.d().hw(); for (let k = 0; k < 20 && hw && hw.phase === 'quiet'; k++) { g.day.setClock(2026, doy, 3.0 + (k + 1) * 0.01); L.step(2); hw = S.d().hw(); }
          r.phase = hw && hw.phase;
          if (hw && hw.answer) { const yaw = hw.answer.deg * Math.PI / 180, dx = Math.sin(yaw), dz = -Math.cos(yaw); const y = Math.atan2(-dz, dx); g.chase.viewYaw = y; g.chase.forwardYaw = y; g.chase.viewPitch = 0; L.step(2); S.d().markHowl(); }
        }
        r.marked = g.story.has(`ep.S4.${s.id}`); out.push(r);
      }
      return { out, ring: g.story.has('ep.S4.ring'), bearings: window.__t.marks().filter((m) => m.kind === 'bearing').length, pencilRing: window.__t.marks().some((m) => m.kind === 'ring' && m.id === 's4.ring') };
    });
    result('S4b the howl survey at three stakes at 03:00: answered, Marked (three bearings), the ring', sv.out.filter((o) => o.marked).length >= 2 && sv.bearings >= 2, sv);
    const md = await W(page, async () => {
      const g = window.__game, E = window.__e, L = window.__L, S = window.__s7;
      if (!g.story.has('ep.S4.ring')) g.story.rules.apply({ id: 'rig:ring', then: ['f:ep.S4.st1', 'f:ep.S4.st2', 'f:ep.S4.st3'] }, {});
      E.at(2026, 226, 19.5); const m = E.place('s4.meadow');
      let px = m.x + 420, pz = m.z; for (let k = 0; k < 12 && g.world.isWater(px, pz); k++) { px += 30; pz += (k % 2 ? 40 : -40); }
      await g.world.tiles.ensure(px, pz, 130); L.standAt(px, pz, Math.atan2(-(m.z - 8 - pz), m.x + 22 - px)); for (let k = 0; k < 40 && !g.tiles.readyAt(px, pz); k++) { L.step(5); await L.wait(50); } L.standAt(px, pz, Math.atan2(-(m.z - 8 - pz), m.x + 22 - px)); L.step(10);
      const diag = { at: [Math.round(g.player.x), Math.round(g.player.z)], m: [m.x, m.z], d: Math.round(Math.hypot(m.x - g.player.x, m.z - g.player.z)), month: g.story.date().month, yes: g.story.has('ep.S4.yes'), moved: g.story.has('ep.S4.moved'), spooked: !!S.d().doc().spooked, all: g.side7a.draw.root.children.filter((c) => /7a (wolf|pup)$/.test(c.name)).length, names: g.side7a.draw.root.children.map((c) => c.name).slice(0, 12) };
      const drawn = g.side7a.draw.root.children.filter((c) => /7a (wolf|pup)$/.test(c.name) && c.visible).length;
      const shot = await S.shot({ x: m.x + 22, z: m.z - 8 }, 0);
      const said = S.show('kari', { kind: 'print', id: shot && shot.id, matches: shot ? shot.matches : [] });
      return { diag, drawn, shot, said, pups: S.d().doc().pups, counted: g.story.has('ep.S4.counted'), owed: S.owed() };
    });
    result('S4c August: the meadow from 400 m: wolves and pups drawn; the print; Kari counts them ($40 owed)', md.drawn >= 4 && md.shot && md.shot.matches.includes('s4.pups') && md.counted && md.owed.includes(40), md);
    const end = await W(page, async () => {
      const g = window.__game, E = window.__e, L = window.__L;
      E.at(2026, 289, 11); L.step(4); await E.toStore(16); window.__t.walkOut(16); L.step(6); const inside = window.__t.walkIn(16); L.step(20); await L.wait(2500); L.step(4);
      return { inside, shut: g.story.has('ep.S4.shut'), report: g.story.has('ep.S4.report'), page: g.story.has('nb.page.karireport'), end: g.story.get('ep.S4.end'), last: (window.__s7.page('S4') || {}).end };
    });
    result('S4d 16 October: the window shut; Leon\'s counter: Kari\'s report; the end and its last line', end.shut && end.report && end.page && end.end === 'report' && /Kari left/.test(end.last || ''), end);
    await page.context().close();
  }
} finally {
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 8) });
  await browser.close();
  const fails = results.filter((r) => !r.pass).length;
  log(`cmp-7a-test: ${results.length - fails}/${results.length}${fails ? ' FAIL' : ' PASS'}`);
  process.exit(fails ? 1 : 0);
}
