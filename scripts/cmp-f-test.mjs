// Stream F's rig (story Round 3, the far end; docs/story/50-finale.md §2–§5, §6.9): headless Chromium, ?story=1.
//   1 the layer has the far end's places for this release; the hidden carry is the tail of world.portages, hidden, not
//     in portagesPublic()
//   2 the dam at fall low water: the stump, the white stone, the rod ("Old pipe") and the step; the landing key (L4C) and
//     the far end inked
//   3 the burnt point: NB55 read there (stand) is lock 3's key C; the notch is built from the point (a skyline at 1.9 km)
//   4 the hidden carry crossed by real input (W held, the view steered along the tread): the east bank's blazes (L5C),
//     the camp found, N21 understood (L5A), the carry pencilled and inked
//   5 the camp: the dot names its things; Look at the core box and the pencil marks, Pick up the photograph, Read June's
//     note (real E); the floorboard has no verb until the stone is understood, then Lift: the torn pages (L6A)
//   6 the cellar: ground until a lock-6 key, then Old pit → Clear the moss → Lid → Lift → Note → Pick up (pit.note: the
//     run's start) → Can → Take
//   7 the stashes: the spare paddle under its stone (Take; with NB66 read, lock 4's key E), the dry bag (Open), the
//     Grumman (found)
//   APP=http://localhost:5220 node scripts/cmp-f-test.mjs [--out dir]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { HELPERS } from './slice/c1-layer.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APP = (process.env.APP || 'http://localhost:5220').replace(/\/$/, '');
const OUT = path.resolve(arg('out', 'cmp-f-out'));
mkdirSync(OUT, { recursive: true });
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [], errors = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass, more }); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1400)); };
const shot = async (page, name) => { try { await page.screenshot({ path: `${OUT}/${name}.png` }); } catch { /* a nicety */ } };
const press = async (page, key) => { await page.keyboard.press(key); await page.evaluate(() => { window.__L.step(3); window.__L.pin = null; }); };

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /story|layer|far/i.test(m.text()))) log(m.type(), m.text().slice(0, 300)); });
  await page.goto(`${APP}/?story=1`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.story && typeof window.__game.step === 'function' && (window.__game.title.state === 'title' || window.__game.title.state === 'game'), null, { timeout: 300000, polling: 500 });
  // a season at Farm 31 on 25 September (fall low water: the dam's step and rod bare)
  await page.evaluate(async () => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === 31), { confirm: false, start: { year: 2026, doy: 268 } }); });
  await page.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 150000, polling: 250 });
  await page.evaluate(() => { const g = window.__game; if (g.outfitter.open) g.outfitter.hide(); if (g.onboarding.pending && g.onboarding.pending()) { g.onboarding.give(); g.onboarding.finish(31, false); } });
  await page.waitForFunction(() => !!(window.__game.storyLayer && window.__game.storyFar), null, { timeout: 90000 });
  await page.evaluate(HELPERS);
  // night one (B's cutscene calls story.found)
  await page.evaluate(async () => { const g = window.__game; g.story.found({ abs: 20640, key: 2, lake: 'Lake One' }); await window.__L.wait(100); window.__L.step(6); });
  await page.evaluate(() => { const L = window.__L, g = window.__game;
    if (!g.pointer.__fpin) { const u = g.pointer.update.bind(g.pointer); g.pointer.update = (...a) => { if (L.pin) { g.pointer.setTarget(L.pin); return; } return u(...a); }; g.pointer.__fpin = true; }
    L.facts = (ks) => ks.filter((k) => g.story.has(k));
    L.walt = (ks) => ks.filter((k) => g.story.walt().includes(k));
    L.at = async (id) => { const q = g.storyLayer.place(id); await L.near(q.x, q.z); for (let k = 0; k < 6; k++) { L.step(4); g.storyLayer.poll(); await L.wait(40); } return q; };
    // the dot on a prop: stand d m off it on dry ground, the eye's ray at its own dot sphere through the layer's provider
    // (the chase camera sits 6–8 m back and the far end's things are small: a cot in a 2.4 × 3 m cabin), and that
    // target is the pointer's for the real E that follows (pointer.before acts on it). dy is unused (the dot's own height)
    L.dotOn = (id, d = 1.2) => {
      const l = g.storyLayer, q = l.prop(id); if (!q) return { none: 'no prop' };
      const m = l.built.get(q.place.id), b = m && m.get(id); if (!b) return { none: 'not built', state: l.state() };
      if (!b.dots.length) return { none: 'no dot' };
      const w = g.world; let at = null;
      for (let k = 0; k < 16 && !at; k++) { const a = (k / 16) * Math.PI * 2, x = q.prop.x + Math.cos(a) * d, z = q.prop.z + Math.sin(a) * d; if (!w.isWater(x, z)) at = { x, z }; }
      if (!at) at = { x: q.prop.x + d, z: q.prop.z };
      L.standAt(at.x, at.z, L.yawTo(q.prop)); L.step(2);
      const P = g.player, dot = b.dots.reduce((a, c) => (c.r > a.r ? c : a)), ty = b.y + dot.y, ey = (P.foot ? P.foot.y : P.groundAt(P.x, P.z)) + 1.6;
      const R = g.pointer.ray; R.origin.set(P.x, ey, P.z); R.direction.set(q.prop.x - P.x, ty - ey, q.prop.z - P.z).normalize();
      const n = g.pointer.near; n.x = P.x; n.z = P.z; n.y = P.altitude;
      const list = (l.targets(R, n) || []).sort((a, c) => a.miss - c.miss || a.dist - c.dist), hit = list[0];
      if (!hit) return { none: 'no target', d: +Math.hypot(P.x - q.prop.x, P.z - q.prop.z).toFixed(2) };
      g.pointer.setTarget(hit.target); L.pin = hit.target; // (held through the real E that follows: the page's own frames would re-aim it at the chase camera's ray)
      return { label: hit.target.label, verb: hit.target.e ? hit.target.e.verb : null, ref: hit.target.ref };
    };
  });

  // 1 ---------------------------------------------------------------------------------------------------------------------
  {
    const r = await page.evaluate(() => { const g = window.__game, w = g.world, l = g.storyLayer, ids = ['gull.sign', 'gull.burntpoint', 'gull.notch', 'pond4747.eastbank', 'waltcamp', 'cellar', 'stash.paddle', 'stash.drybag', 'stash.grumman'];
      const i = w.portages.findIndex((p) => p.id === 'story:gullcarry'), p = w.portages[i];
      return { places: ids.filter((id) => l.place(id) && Number.isFinite(l.place(id).x)), stale: l.state().stale, i, n: w.portages.length, hidden: p && p.hidden, fix: p && p.fix, m: p && Math.round(p.lengthM), pub: w.portagesPublic().includes(p), tail: i === w.portages.length - 1, layerIx: l.portage && l.portage('story:gullcarry') }; });
    result('1 the far end\'s nine places placed for this release; the hidden carry the tail of world.portages, hidden, fix story, not in portagesPublic()', r.places.length === 9 && !r.stale && r.hidden && r.fix === 'story' && !r.pub && r.tail && r.m > 780, r);
  }
  // 2 the dam --------------------------------------------------------------------------------------------------------------
  {
    await page.evaluate(() => window.__L.at('gull.sign'));
    const r = await page.evaluate(() => { const L = window.__L, g = window.__game;
      const built = g.storyLayer.builtList().filter((b) => b.place === 'gull.sign').map((b) => b.prop);
      const stone = L.dotOn('gull.stone', 1.4, 0.06), rod = L.dotOn('gull.rod', 1.4, 0.36);
      g.storyLayer.poll(); L.step(4);
      return { built, stone, rod, low: g.story.when('lowwater'), f: L.facts(['gull.eastbay', 'gull.dam', 'gull.stump.lowwater', 'gull.rod.seen', 'key.L4C', 'ink.farend', 'gull.stone.seen']) };
    });
    await shot(page, 'f2-dam');
    result('2 the dam at fall low water: dam, stump, stone, rod and step built; "White stone" and "Old pipe", no verb; the landing key (L4C) and the far end inked', ['gull.dam', 'gull.stump', 'gull.stone', 'gull.rod', 'gull.step'].every((k) => r.built.includes(k)) && r.stone.label === 'White stone' && !r.stone.verb && r.rod.label === 'Old pipe' && r.low && ['gull.dam', 'gull.stump.lowwater', 'key.L4C', 'ink.farend'].every((k) => r.f.includes(k)), r);
  }
  // 3 the burnt point and the notch --------------------------------------------------------------------------------------
  {
    await page.evaluate(() => window.__L.at('gull.burntpoint'));
    const r = await page.evaluate(async () => { const L = window.__L, g = window.__game;
      const before = g.story.has('nb.burntpoint');
      g.story.markRead('NB55', 'rig');
      for (let k = 0; k < 18; k++) { await L.wait(500); L.step(2); }
      const n = g.storyLayer.builtList().find((b) => b.prop === 'gull.notch'), pt = g.storyLayer.place('gull.burntpoint'), nq = g.storyLayer.place('gull.notch');
      return { before, f: L.facts(['nb.burntpoint', 'key.L3C']), und: g.story.nbHas('und', 'NB55'), notch: !!n, tris: n && n.tris, km: +(Math.hypot(nq.x - pt.x, nq.z - pt.z) / 1000).toFixed(2) };
    });
    await page.evaluate(() => { const g = window.__game, q = g.storyLayer.place('gull.notch'); window.__L.aim({ x: q.x, z: q.z }, null); });
    await shot(page, 'f3-notch-from-point');
    result('3 the burnt point: NB55 read standing there gives nb.burntpoint (lock 3 key C) and its margin note; the notch is built from the point', !r.before && r.f.includes('key.L3C') && r.und && r.notch, r);
  }
  // 4 the hidden carry by real input ---------------------------------------------------------------------------------------
  {
    const start = await page.evaluate(async () => { const g = window.__game, L = window.__L, p = g.world.portages.find((q) => q.id === 'story:gullcarry');
      await L.tp(p.pts[0][0], p.pts[0][1]); await L.settle(); L.standAt(p.pts[1][0], p.pts[1][1], L.yawTo({ x: p.pts[3][0], z: p.pts[3][1] })); L.step(10);
      return { mode: g.player.mode, at: [Math.round(g.player.x), Math.round(g.player.z)] }; });
    await page.keyboard.down('w');
    let r = null;
    for (let k = 0; k < 900; k++) {
      r = await page.evaluate(() => { const g = window.__game, L = window.__L, P = g.player, pts = g.world.portages.find((q) => q.id === 'story:gullcarry').pts;
        let j = 0, bd = Infinity; for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - P.x, pts[i][1] - P.z); if (d < bd) { bd = d; j = i; } }
        const aim = pts[Math.min(pts.length - 1, j + 3)], yaw = L.yawTo({ x: aim[0], z: aim[1] });
        if (g.chase) { g.chase.viewYaw = yaw; g.chase.forwardYaw = yaw; }
        L.step(15);
        return { j, n: pts.length, off: +bd.toFixed(1), mode: P.mode, end: Math.hypot(pts[pts.length - 1][0] - P.x, pts[pts.length - 1][1] - P.z) };
      });
      if (r.end < 4 || r.mode !== 'walk') break;
    }
    await page.keyboard.up('w');
    const got = await page.evaluate(async () => { const g = window.__game, L = window.__L; for (let k = 0; k < 6; k++) { g.storyLayer.poll(); await L.wait(300); L.step(2); } g.storyFar.debug.walk(); g.storyFar.debug.ink();
      const w = ((g.storySeams.pencil.doc && g.storySeams.pencil.doc.walked) || []).find((q) => q.portage === 'story:gullcarry');
      return { f: L.facts(['ev.blazes', 'key.L5C', 'camp.found', 'nb.longway', 'key.L5A', 'ink.farend']), und: g.story.nbHas('und', 'NB54'), walked: w ? { n: w.pts.length, inked: w.inked } : null }; });
    await shot(page, 'f4-camp-arrival');
    result('4 the hidden carry walked by real input (W held, the view along the tread) from the dam to the knob', start.mode === 'walk' && r && r.end < 6, { start, last: r });
    result('4 on the way: the blazes (L5C); at the knob the camp found, N21 understood (L5A, NB54\'s note), the carry pencilled as walked and inked', ['ev.blazes', 'key.L5C', 'camp.found', 'nb.longway', 'key.L5A'].every((k) => got.f.includes(k)) && got.und && got.walked && got.walked.n > 20 && got.walked.inked, got);
  }
  // 5 the camp ------------------------------------------------------------------------------------------------------------
  {
    await page.evaluate(() => window.__L.at('waltcamp'));
    const names = await page.evaluate(() => { const L = window.__L, out = {};
      for (const [id, dy] of [['waltcamp.cot', 0.6], ['waltcamp.boots', 0.3], ['waltcamp.stove', 0.55], ['waltcamp.shelf', 0.95], ['waltcamp.corebox', 0.6], ['waltcamp.photo', 0.05], ['waltcamp.marks', 1.3], ['waltcamp.floor', 0.25]]) out[id] = L.dotOn(id, 1.2, dy);
      return out; });
    const verbs = {};
    for (const [id, dy] of [['waltcamp.corebox', 0.6], ['waltcamp.marks', 1.3], ['waltcamp.photo', 0.05], ['waltcamp.note', 0.03]]) {
      verbs[id] = await page.evaluate(([id, dy]) => window.__L.dotOn(id, 1.2, dy), [id, dy]);
      await press(page, 'e');
    }
    const floorBefore = await page.evaluate(() => window.__L.dotOn('waltcamp.floor', 1.2, 0.25));
    await page.evaluate(() => { const g = window.__game; g.story.set('knows.stones', true, 'rig: three starred stones (L4B)'); window.__L.step(4); });
    const floorAfter = await page.evaluate(() => window.__L.dotOn('waltcamp.floor', 1.2, 0.25));
    await press(page, 'e');
    await shot(page, 'f5-camp');
    const got = await page.evaluate(async () => { const g = window.__game, L = window.__L; await L.wait(600); L.step(4);
      return { f: L.facts(['camp.corebox', 'knows.e7', 'camp.marks', 'camp.photo', 'camp.june', 'knows.stonesign', 'nb.torn', 'find.big.camp', 'key.L6A']), walt: L.walt(['50:4.3.w.corebox', '50:4.6.w.marks', '50:4.5.w.june', '50:4.3.w.floor', '50:4.3.w.boots']), pages: ['flycamp', 'junenote'].filter((p) => g.story.has(`nb.page.${p}`)), walls: (g.storyFar.debug.walls() || []).length };
    });
    result('5 the camp: the dot names Cot, Boots, Stove, Shelf, Core box, Photograph, Pencil marks, White stone', names['waltcamp.cot'].label === 'Cot' && names['waltcamp.shelf'].label === 'Shelf' && names['waltcamp.corebox'].label === 'Core box' && names['waltcamp.photo'].label === 'Photograph' && names['waltcamp.floor'].label === 'White stone', names);
    result('5 the camp: Look, Pick up, Read by real E (the core box: E-7; the marks; the photograph and June\'s note into the book); the walls stand for the walker', ['camp.corebox', 'knows.e7', 'camp.marks', 'camp.photo', 'camp.june'].every((k) => got.f.includes(k)) && got.pages.length === 2 && got.walls === 6, { verbs, got });
    result('5 the floorboard: no verb until the stone is understood, then Lift (real E): the torn pages (nb.torn, lock 6 key A, the big find)', !floorBefore.verb && floorAfter.verb === 'Lift' && ['knows.stonesign', 'nb.torn', 'key.L6A', 'find.big.camp'].every((k) => got.f.includes(k)), { floorBefore, floorAfter, got });
  }
  // 6 the cellar ----------------------------------------------------------------------------------------------------------
  {
    await page.evaluate(() => window.__L.at('cellar'));
    const dbg = await page.evaluate(() => { const g = window.__game, l = g.storyLayer, pl = l.place('cellar'); let err = null; try { l.buildPlace(pl); } catch (e) { err = String(e.stack || e).slice(0, 500); } return { err, ready: g.tiles.readyAt(pl.x, pl.z), built: l.builtList().filter((b) => b.place === 'cellar').map((b) => b.prop), shows: pl.props.map((pr) => [pr.id, l.shows(pr), Number.isFinite(pr.x)]), d: Math.round(Math.hypot(g.player.x - pl.x, g.player.z - pl.z)) }; });
    log('cellar', JSON.stringify(dbg));
    const steps = [];
    for (const [id, dy, want, verb] of [['cellar.pit', 0.1, 'Old pit', 'Clear the moss'], ['cellar.lid', 0.05, 'Lid', 'Lift'], ['cellar.note', 0.03, 'Note', 'Pick up'], ['cellar.can.1', 0.12, 'Can', 'Take']]) {
      await page.evaluate(() => { window.__game.storyLayer.poll(); window.__L.step(4); });
      const t = await page.evaluate(([id, dy]) => window.__L.dotOn(id, 1.3, dy), [id, dy]);
      steps.push({ id, t, ok: t.label === want && t.verb === verb });
      await press(page, 'e');
      await page.evaluate(() => window.__L.step(6));
    }
    await shot(page, 'f6-cellar');
    const got = await page.evaluate(() => window.__L.facts(['pit.seen', 'pit.cleared', 'pit.lifted', 'pit.note', 'pit.can.1', 'nb.page.einonote']));
    result('6 the cellar by real E: Old pit → Clear the moss, Lid → Lift, Note → Pick up (pit.note: the run starts), Can → Take', steps.every((s) => s.ok) && ['pit.cleared', 'pit.lifted', 'pit.note', 'pit.can.1'].every((k) => got.includes(k)), { steps, got });
  }
  // 7 the stashes ---------------------------------------------------------------------------------------------------------
  {
    await page.evaluate(() => window.__L.at('stash.paddle'));
    await page.evaluate(() => window.__game.story.markRead('NB66', 'rig'));
    const pad = await page.evaluate(() => window.__L.dotOn('stash.paddle', 1.3, 0.1));
    await press(page, 'e');
    await page.evaluate(() => window.__L.at('stash.drybag'));
    const bag = await page.evaluate(() => window.__L.dotOn('stash.drybag', 1.4, 0.2));
    await press(page, 'e');
    await page.evaluate(() => window.__L.at('stash.grumman'));
    const can = await page.evaluate(() => window.__L.dotOn('stash.grumman', 2.0, 0.3));
    await shot(page, 'f7-grumman');
    const got = await page.evaluate(async () => { await window.__L.wait(400); return window.__L.facts(['stash.paddle', 'stash.paddle.found', 'nb.paddlestash', 'key.L4E', 'stash.drybag', 'stash.grumman']); });
    result('7 the stashes: the paddle under its stone (Take: lock 4 key E with NB66 read), the dry bag (Open), the Grumman (found)', pad.label === 'Paddle' && pad.verb === 'Take' && bag.verb === 'Open' && can.label === 'Canoe' && ['stash.paddle', 'nb.paddlestash', 'key.L4E', 'stash.drybag', 'stash.grumman'].every((k) => got.includes(k)), { pad, bag, can, got });
  }
} catch (e) {
  result('the rig ran', false, { error: String(e.stack || e).slice(0, 1200) });
} finally {
  if (browser) await browser.close();
}
result('no page errors', errors.length === 0, { errors: errors.slice(0, 8) });
writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, errors }, null, 1));
const fails = results.filter((r) => !r.pass).length;
log(`${results.length - fails}/${results.length} pass`);
process.exit(fails ? 1 : 0);
