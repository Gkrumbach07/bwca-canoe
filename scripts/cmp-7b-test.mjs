// Round 7 stream 7b's rig (60 S5, S6): each side story from its door to its end in the real game, headless Chromium
// against a running Vite with ?story=1, each check printed PASS or FAIL. Talk by real keys (choose/hear, c1-talk.mjs);
// the places by the slice helpers (L.tp / L.near / E.ashore, never a raw teleport); the dive by real keys (Space up,
// Q down again from the water, E held on the case, E to climb back in).
//   S5  Pete at Round Lake 51 ("An airplane?": the yes); calm and bright on the Kek: the wreck reads from the canoe
//       (s5.wreck.seen); Dive (the dot's E, over the side); the first dive sees it, Space up; Q again; E held: the case
//       (mapcase, the chart page, the first stamped); E in the canoe; Pete: "It's yours.": $60 owed, the chart framed on
//       the wall; Gull's east bay looking at the notch: lock 2 key D and lock 3 key D
//   S6  Orrin at Little Vermilion 12 (René's word first): "The whiskey road." … "Bootleg." (the route, the ring, the yes);
//       the Beatty's carving; Bootleg's cut line, the pit: Clear the moss, Pull ×4 (lock 6 key C, the first), the packet
//       and the bottle; Orrin: "Sell it to Orrin.", the bottle: $250 and $40 owed, the end; the cellar's moss read
//   off the flag off: none of 7b's modules fetched
//
//   APP=http://localhost:5340 node scripts/cmp-7b-test.mjs [--only off|S5|S6] [--shots dir]
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS as HELPERS_L } from './slice/c1-layer.mjs';
import { HELPERS_T, choose, hear } from './slice/c1-talk.mjs';
import { HELPERS_E } from './slice/c2-episodes.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5340').replace(/\/$/, '');
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
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /7b/.test(t)) log('console', m.type(), t.slice(0, 300)); });
  await page.goto(`${APP}/${query ? '?' + query : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  return page;
}
async function newSeason(page, home, doy, story = true) {
  await page.evaluate(async ([home, doy]) => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === home), { confirm: false, start: { year: 2026, doy } }); }, [home, doy]);
  await page.waitForFunction((story) => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && (!story || (g.storyEpisodes && g.storyLayer && g.side7b)); }, story, { timeout: 200000, polling: 250 });
}
const W = (page, fn, a) => page.evaluate(fn, a);
const HELPERS_7 = () => {
  const g = window.__game, L = window.__L, S = window.__s7 = {};
  S.d = () => g.side7b.debug;
  S.staged = async (who) => { for (let k = 0; k < 60 && !S.d().staged().includes(who); k++) { L.step(4); await L.wait(120); } return S.d().staged().includes(who); };
  S.talk = (who, ep) => window.__t.talkTo(`cast:${who}:${ep}`) || S.d().talkTo(who);
  S.page = (id) => g.storyEpisodes.episodes.page(id);
  S.owed = () => { const D = g.story.doc && g.story.doc.dir; return D && Array.isArray(D.pay) ? D.pay.map((p) => p.amt) : []; };
  S.calm = () => { g.wind.override = 0.6; g.weather.set('clear'); L.step(4); };
  return true;
};
async function boot(home, doy) {
  const page = await open('story=1');
  await newSeason(page, home, doy);
  await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T); await page.evaluate(HELPERS_E); await page.evaluate(HELPERS_7);
  await W(page, () => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); window.__L.step(20); });
  return page;
}
// a key pressed between stepped frames (the game reads it on the next frame)
async function key(page, code, frames = 3) { await page.keyboard.press(code); await W(page, (n) => window.__L.step(n), frames); }

try {
  if (!ONLY || ONLY === 'off') {
    const page = await open('');
    await newSeason(page, 51, 200, false);
    const r = await W(page, () => { const mods = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\//.test(n)).map((n) => n.replace(/^.*\/src\//, '').replace(/\?.*$/, '')); return { mine: mods.filter((n) => /7b|minigames\/dive/.test(n)), side7b: !!window.__game.side7b }; });
    result('off: the flag off: none of 7b\'s modules fetched, nothing hung', r.mine.length === 0 && !r.side7b, r);
    await page.context().close();
  }

  // --- S5 ------------------------------------------------------------------------------------------------------------
  if (!ONLY || ONLY === 'S5') {
    const page = await boot(51, 200); // 19 July 2026
    await W(page, async () => { window.__e.at(2026, 200, 11); await window.__e.toStore(51); });
    const st = await W(page, () => window.__s7.staged('pete'));
    await W(page, () => { window.__s7.talk('pete', 51); window.__L.step(4); });
    const h1 = await hear(page); const c1 = await choose(page, 'An airplane?'); const h2 = await hear(page);
    const a = await W(page, () => ({ yes: window.__game.story.has('ep.S5.yes'), met: window.__game.story.has('pete.met'), page: window.__s7.page('S5') }));
    result('S5a Pete at the Round Lake counter: "You ever see an airplane…", "An airplane?" (the yes; the page has him)', st && /airplane/.test(h1.join(' ')) && c1.ok && /Christmas/.test(h2.join(' ')) && a.yes && a.page && a.page.lines.length >= 1, { st, h1, c1, h2, a });
    await page.keyboard.press('Escape');
    // calm and bright on the Kek, over the wreck in the canoe
    const b = await W(page, async () => {
      const g = window.__game, L = window.__L, S = window.__s7;
      window.__e.at(2026, 201, 12); S.calm();
      const w0 = window.__e.prop('s5.wreck');
      await L.tp(w0.x + 9, w0.z + 2); for (let k = 0; k < 40 && !S.d().wreck(); k++) { L.step(5); await L.wait(100); g.storyLayer.poll(); }
      const W0 = S.d().wreck(); g.player.x = W0.x + 7; g.player.z = W0.z; g.player.placeOnWater(); L.step(20); g.storyLayer.poll(); L.step(20);
      return { W: W0 && { depth: +W0.depth.toFixed(2) }, reads: S.d().reads(), seen: g.story.has('s5.wreck.seen'), mode: g.player.mode };
    });
    result('S5b calm and bright on the Kek: the wreck reads from the canoe (s5.wreck.seen)', b.reads && b.seen && b.mode === 'paddle', b);
    // Dive (the water's dot verb: its run), the first dive sees it; Space up (a real key)
    const c = await W(page, () => { const g = window.__game, S = window.__s7; const ok = S.d().startDive(); window.__L.step(120); const d = S.d().dive(); return { ok, mode: g.player.mode, phase: d && d.phase, seen: d && d.seen, cam: +(g.camera.position.y - S.d().wreck().level).toFixed(2) }; });
    await key(page, 'Space', 2);
    const c2 = await W(page, () => { window.__L.step(90); const g = window.__game, S = window.__s7; return { dive: !!S.d().dive(), dives: S.d().doc().dives, seenDoc: S.d().doc().seen, mode: g.player.mode, first: window.__e.firsts() }; });
    result('S5c Dive: over the side (swimming, the canoe left floating), the view under the water, the wreck seen; Space: up', c.ok && c.mode === 'swim' && c.seen && c.cam < 0 && !c2.dive && c2.dives === 1 && c2.seenDoc && c2.first.some((f) => /wreck/i.test(f)), { c, c2 });
    // Q down again from the water; E held on the case until it comes free
    await key(page, 'KeyQ', 3);
    const d0 = await W(page, () => { window.__L.step(80); const d = window.__s7.d().dive(); return { on: !!d, phase: d && d.phase }; });
    await page.keyboard.down('KeyE');
    for (let k = 0; k < 12; k++) await W(page, () => window.__L.step(30));
    await page.keyboard.up('KeyE');
    const d1 = await W(page, () => { window.__L.step(80); const g = window.__game; return { dive: !!window.__s7.d().dive(), case: g.story.has('s5.case'), ep: g.story.has('ep.S5.case'), item: g.inventory.count('mapcase', { reachable: false }), page: g.story.has('nb.page.pilotchart'), work: window.__s7.d().doc().work, mode: g.player.mode }; });
    result('S5d Q dives again from the water; E held behind the seat: the case comes free (the map case, the chart page)', d0.on && d1.case && d1.ep && d1.item > 0 && d1.page, { d0, d1 });
    // E: back in the canoe (the swim's own re-entry)
    const e0 = await W(page, () => { const g = window.__game, c = g.player.carry && g.player.carry.drop; if (c) { g.player.x = c.x + 1.5; g.player.z = c.z; } window.__L.step(4); return { d: c ? 1.5 : null }; });
    await key(page, 'KeyE', 6);
    const e1 = await W(page, () => { window.__L.step(30); return { mode: window.__game.player.mode }; });
    result('S5e E beside the canoe: back in it (paddling)', e1.mode === 'paddle', { e0, e1 });
    // Pete with the case: "Is that—" … "It's yours."
    await W(page, async () => { window.__e.at(2026, 202, 11); await window.__e.toStore(51); });
    await W(page, async () => { await window.__s7.staged('pete'); window.__s7.talk('pete', 51); window.__L.step(4); });
    const h3 = await hear(page, 2); const c3 = await choose(page, 'It\'s yours.'); const h4 = await hear(page);
    const f = await W(page, () => { const g = window.__game, S = window.__s7; window.__L.step(10); return { given: g.story.has('ep.S5.given'), end: g.story.get('ep.S5.end'), owed: S.owed(), wall: !!S.d().wall.mesh, item: g.inventory.count('mapcase', { reachable: false }), last: (S.page('S5') || {}).end }; });
    result('S5f "Is that—" … "It\'s yours.": the case is Pete\'s, $60 owed, the chart framed on the Round Lake wall, the end', /Is that/.test(h3.join(' ')) && c3.ok && /his hand/.test(h4.join(' ')) && f.given && f.end === 'given' && f.owed.includes(60) && f.wall && f.item === 0, { h3, c3, h4, f });
    await page.keyboard.press('Escape');
    // Gull's east bay with the chart in the book, looking at the notch
    const n = await W(page, async () => {
      const g = window.__game, L = window.__L, S = window.__s7;
      const bay = window.__e.place('gull.sign'); await L.tp(bay.x - 250, bay.z + 30); L.step(30); g.storyLayer.poll(); L.step(10);
      const no = window.__e.prop('gull.notch') || { x: -19340, z: 26805 };
      const yaw = Math.atan2(-(no.z - g.player.z), no.x - g.player.x); g.chase.viewYaw = yaw; g.chase.forwardYaw = yaw; g.chase.viewPitch = 0.05; L.step(30);
      S.d().notchTick(); L.step(4);
      return { notch: g.story.has('s5.notch'), chart: g.story.has('ep.S5.chart'), L2D: g.story.has('key.L2D'), L3D: g.story.has('key.L3D'), d: Math.round(Math.hypot(bay.x - g.player.x, bay.z - g.player.z)) };
    });
    result('S5g Gull\'s east bay, the chart in the book, looking at the notch: lock 2 key D and lock 3 key D', n.notch && n.chart && n.L2D && n.L3D, n);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 's5.png') });
    await page.context().close();
  }

  // --- S6 ------------------------------------------------------------------------------------------------------------
  if (!ONLY || ONLY === 'S6') {
    const page = await boot(12, 200); // 19 July 2026
    await W(page, async () => { window.__e.at(2026, 200, 14); await window.__e.toStore(12); window.__game.story.rules.apply({ id: 'rig:rene', then: ['f:s6.story'] }, {}); });
    const st = await W(page, () => window.__s7.staged('orrin'));
    await W(page, () => { window.__s7.talk('orrin', 12); window.__L.step(4); });
    const h1 = await hear(page, 2); const c1 = await choose(page, 'The whiskey road.'); const h2 = await hear(page, 4); const c2 = await choose(page, 'Bootleg.'); const h3 = await hear(page, 3);
    const a = await W(page, () => { const g = window.__game; return { route: g.story.has('s6.route'), yes: g.story.has('ep.S6.yes'), know: g.story.has('s6.know'), ring: (window.__t.marks ? window.__t.marks() : []).filter((m) => m.kind === 'ring').length }; });
    result('S6a Orrin at Little Vermilion: "The whiskey road." … "Bootleg.": the route, the ring, the yes', st && /look/.test(h1.join(' ')) && c1.ok && /Beatty/.test(h2.join(' ')) && c2.ok && /true/.test(h3.join(' ')) && a.route && a.yes && a.know, { st, h1, c1, h2, c2, h3, a });
    await page.keyboard.press('Escape');
    const b = await W(page, async () => {
      const g = window.__game, L = window.__L;
      const at = await window.__e.ashore('s6.beatty', 2); const pr = window.__e.prop('s6.carving');
      L.standAt(pr.x + 1.2, pr.z + 0.8, 0); L.step(10); g.storyLayer.poll(); L.step(6);
      const name = g.storyLayer.dotName('s6.carving'), built = window.__e.built('s6.carving'); g.storyLayer.look('s6.carving');
      return { at, name, built, carving: g.story.has('s6.carving') };
    });
    result('S6b the Beatty\'s low end: the rock reads "Carved: N.N. 1928."', b.built && /N\.N\. 1928/.test(b.name) && b.carving, b);
    const c = await W(page, async () => {
      const g = window.__game, L = window.__L, Ly = g.storyLayer, out = {};
      await window.__e.ashore('s6.bootleg', 3);
      const bl = window.__e.prop('s6.blaze.2'); L.standAt(bl.x + 2, bl.z, 0); L.step(30); out.blazes = g.story.has('s6.blazes');
      const pit = window.__e.prop('s6.slump'); L.standAt(pit.x + 1.6, pit.z, Math.PI); for (let k = 0; k < 30 && !window.__e.built('s6.slump'); k++) { L.step(5); Ly.poll(); await L.wait(50); }
      out.name = Ly.dotName('s6.slump'); out.verb = (Ly.verbs('s6.slump')[0] || {}).verb;
      Ly.look('s6.slump'); L.step(4); Ly.poll(); L.step(4);
      out.moss = g.story.has('s6.moss');
      for (const i of [1, 2, 4, 5]) { Ly.poll(); out[`v${i}`] = (Ly.verbs(`s6.plank.${i}`)[0] || {}).verb; Ly.look(`s6.plank.${i}`); L.step(2); }
      out.done = g.story.has('ep.S6.done'); out.L6C = g.story.has('key.L6C'); out.first = window.__e.firsts();
      Ly.poll(); out.crate = Ly.dotName('s6.crate'); Ly.look('s6.crate'); L.step(4); Ly.poll(); Ly.look('s6.crate.taken'); L.step(4);
      out.ledger = g.story.has('nb.page.ledger1928'); out.bottle = g.inventory.count('rye1928', { reachable: false }); out.cellar = Ly.dotName('cellar.pit');
      return out;
    });
    result('S6c Bootleg: the blazes; the pit: Clear the moss, Pull ×4 (lock 6 key C, the first), the packet (the ledger) and the bottle', c.blazes && c.verb === 'Clear the moss' && c.moss && c.v1 === 'Pull' && c.done && c.L6C && c.first.some((f) => /bootlegger/i.test(f)) && c.ledger && c.bottle > 0, c);
    result('S6d the cellar\'s moss reads as a pit once S6 taught it', /square slump/.test(c.cellar || ''), { cellar: c.cellar });
    await W(page, async () => { window.__e.at(2026, 203, 15); await window.__e.toStore(12); });
    await W(page, async () => { await window.__s7.staged('orrin'); window.__s7.talk('orrin', 12); window.__L.step(4); });
    const h4 = await hear(page, 2); const c4 = await choose(page, 'Sell it to Orrin.'); const h5 = await hear(page, 2); const c5 = await choose(page, 'There\'s a bottle too.'); const h6 = await hear(page, 2);
    const e = await W(page, () => { const g = window.__game, S = window.__s7; window.__L.step(10); return { sold: g.story.has('ep.S6.sold'), end: g.story.get('ep.S6.end'), owed: S.owed(), last: (S.page('S6') || {}).end, page: g.inventory.count('page:ledger1928', { reachable: false }) }; });
    result('S6e Orrin: "Two-fifty. Cash. Today." … "Sell it to Orrin.", the bottle: $250 and $40 owed, the end and its last line', /Two-fifty/.test(h4.join(' ')) && c4.ok && /Pleasure/.test(h5.join(' ')) && c5.ok && /Forty/.test(h6.join(' ')) && e.sold && e.end === 'sold' && e.owed.includes(250) && e.owed.includes(40) && /Orrin/.test(e.last || ''), { h4, c4, h5, c5, h6, e });
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 's6.png') });
    await page.context().close();
  }
} finally {
  result('no page errors', errors.length === 0, { errors: errors.slice(0, 8) });
  await browser.close();
  const fails = results.filter((r) => !r.pass).length;
  log(`cmp-7b-test: ${results.length - fails}/${results.length}${fails ? ' FAIL' : ' PASS'}`);
  process.exit(fails ? 1 : 0);
}
