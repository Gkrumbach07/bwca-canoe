// Stream E's part of the second slice (docs/build/campaign-design.md Part 4 Round 2, "The second playable slice,
// exactly"): steps 12 (S9) and 13 (S7), and E's half of the join items 3 (the flyer hook, outside the board's count) and
// 14 (nothing starts without a yes; S7 and S9 open at once; the open episodes' places for D's beat). For the join's
// `story-slice --slice2`, and run on their own by scripts/c2-episodes-test.mjs.
//
//   import { HELPERS_E, steps } from './slice/c2-episodes.mjs'
//   await page.evaluate(HELPERS_L); await page.evaluate(HELPERS_T); await page.evaluate(HELPERS_E)   (c1-layer, c1-talk)
//   for (const s of steps) await s.run({ page, result, log, ctx })   ctx: { shots? }
// Real input where the slice asks for it: the cast (F, the jig's number, Space held and let go), the retrieve and the
// fight (W held and let go, as the bar asks), the talk's choices by their numbers; teleports between places (L.tp: the
// chase snapped). Each step leaves the season where the next one wants it: a season at Moose Lake 25, 9 June (a Tuesday).
import { choose, hear } from './c1-talk.mjs';

export const HELPERS_E = () => {
  const g = window.__game, L = window.__L, E = window.__e = {};
  E.ep = () => g.storyEpisodes;
  E.R = () => g.storyEpisodes.episodes;
  E.s = () => g.story;
  E.at = (y, doy, h) => { g.day.setClock(y, doy, h); g.story.lastQ = null; g.story.update(); E.R().dayTurn(true); L.step(4); };
  E.facts = (keys) => Object.fromEntries(keys.map((k) => [k, g.story.has(k)]));
  E.prop = (id) => { const q = g.storyLayer.prop(id); return q ? { x: q.prop.x, z: q.prop.z } : null; };
  E.place = (id) => g.storyLayer.place(id);
  E.built = (id) => g.storyLayer.builtList().some((b) => b.prop === id);
  // stand on dry ground `d` m inland of a place's anchor (its resolved n), facing out over the water
  // to a store's yard (its tiles in and its layout built), the player standing outside the door
  E.toStore = async (ep) => {
    const e = g.world.entryPoints.find((q) => q.ep === ep);
    if (!g.outfitter.layout(ep)) { await L.near(e.x, e.z); for (let k = 0; k < 80 && !g.outfitter.layout(ep); k++) { L.step(5); await L.wait(100); } }
    const S = g.outfitter.layout(ep); if (!S) return false;
    await L.near(S.centre.x, S.centre.z); window.__t.walkOut(ep); L.step(6); return true;
  };
  E.ashore = async (placeId, d = 2) => {
    const pl = g.storyLayer.place(placeId), n = pl.n || [0, 1];
    let x = pl.x + n[0] * d, z = pl.z + n[1] * d;
    for (let k = 0; k < 8 && g.world.isWater(x, z); k++) { x += n[0]; z += n[1]; }
    await L.near(x, z); L.standAt(x, z, Math.atan2(n[1], -n[0])); L.step(10); g.storyLayer.poll(); L.step(4);
    return { x: +x.toFixed(1), z: +z.toFixed(1), water: g.world.isWater(x, z) };
  };
  // the rod in a hand and the jig in a pocket (the slice's season has whatever the onboarding left)
  E.kitUp = () => {
    const inv = g.inventory;
    if (!(inv.long || []).some((l) => l.where === 'hands' && /^rod/.test(l.id))) { const l = (inv.long || []).find((q) => /^rod/.test(q.id)); if (l) l.where = 'hands'; else inv.addLong('rod', 'hands'); }
    if (!inv.count('lure:jig', { reachable: true })) { const r = inv.place('lure:jig', 1, {}); if (!(r && r.ok)) inv.toHandNew('lure:jig'); }
    inv.emit('items');
    return g.fishing.rodInHand();
  };
  // the view's middle on a water point `far` m past the pot, on the line from the rod's tip through it
  E.aimPast = (far = 4) => {
    const F = g.fishing, P = E.prop('s9.pot'), t = F.tipWorld(), dx = P.x - t.x, dz = P.z - t.z, d = Math.hypot(dx, dz);
    const q = { x: P.x + (dx / d) * far, z: P.z + (dz / d) * far }, cam = g.camera;
    g.chase.cursor.inside = false;
    const yaw = Math.atan2(-(q.z - g.player.z), q.x - g.player.x);
    g.player.heading = yaw; g.chase.viewYaw = yaw; g.chase.forwardYaw = yaw;
    for (let k = 0; k < 6; k++) { const level = F.waterLevel(), dd = Math.hypot(q.x - cam.position.x, q.z - cam.position.z); g.chase.viewPitch = Math.atan2(level - cam.position.y, dd); if (g.chase.snap) g.chase.snap(); L.step(2); }
    return { pot: P, at: q, d: +d.toFixed(1) };
  };
  E.fish = () => { const F = g.fishing, f = F.fish; return { state: F.state, line: +F.lineOut.toFixed(2), snag: !!(f && f.snag), tension: f ? +f.tension.toFixed(2) : null, danger: f ? +f.danger.toFixed(2) : null, phase: f && f.snag ? f.snag.phase : null, lure: F.lureDef && F.lureDef.id, owned: F.owned, ui: F.ui && F.ui.fight ? { t: +F.ui.fight.tension.toFixed(2) } : null, msg: F.message && F.message.text }; };
  // papers off (a talk can't stay open under one: the counter, the book, the trip card), the player on foot
  E.clear = () => {
    const was = { paper: g.hud.paper, mode: g.hud.mode, onFoot: g.player.onFoot, tp: g.player.teleporting };
    if (g.outfitter.open) g.outfitter.hide();
    if (g.journal.open) g.journal.close();
    if (g.record && typeof g.record.close === 'function') { try { g.record.close(); } catch { /* */ } }
    if (g.hud.paper && typeof g.hud.closePaper === 'function') g.hud.closePaper(g.hud.paper);
    L.step(4);
    return was;
  };
  // (c2-fix) why a cast came back: the gates fishing.js reads, the wind on the cast, its words
  E.why = () => { const F = g.fishing, p = g.player; return { st: F.state, up: F.rodUp, foot: F.onFoot, blownN: F.blownN || 0, wind: F.wind ? +F.wind.speed.toFixed(2) : null, mode: p.mode, act: !!p.act, seat: !!p.seat, tp: !!p.teleporting, paused: !!(p.input && p.input.paused), title: g.title.state, paper: g.hud.paper || null, convo: !!(g.dialogue && g.dialogue.convo), book: !!(g.journal && g.journal.open), msg: F.message && F.message.text, prompt: p.prompt && p.prompt.text, lure: F.lureDef && F.lureDef.id, at: [+p.x.toFixed(1), +p.z.toFixed(1)], hours: +g.day.hours.toFixed(2), snags: F.snags ? F.snags.targets().length : null, lure: (() => { const l = F.lure, P = E.prop('s9.pot'), t = F.tipWorld(); if (!l || !P) return null; const ux = l.x - t.x, uz = l.z - t.z, L = Math.hypot(ux, uz) || 1, off = Math.abs((P.x - t.x) * uz - (P.z - t.z) * ux) / L; return { d: +L.toFixed(1), toPot: +Math.hypot(l.x - P.x, l.z - P.z).toFixed(2), off: +off.toFixed(2), depth: +(l.depth || 0).toFixed(2), bed: +(l.bed || 0).toFixed(2) }; })(), cw: F.castWind ? { felt: +F.castWind.felt.toFixed(2), H: +F.castWind.H.toFixed(2), blown: F.castWind.blown } : null }; };
  // (c2-fix) the lure's nearest pass by the pot this cast: how near, how deep, whether fishing.snags.over() held there
  E.track = (reset) => {
    if (reset) { E.near = null; return null; }
    const F = g.fishing, l = F.lure, P = E.prop('s9.pot'); if (!l || !P || F.state !== 'inwater') return E.near;
    const d = Math.hypot(l.x - P.x, l.z - P.z);
    if (!E.near || d < E.near.d) { const T = F.snags && F.snags.targets()[0]; E.near = { d: +d.toFixed(2), depth: +(l.depth || 0).toFixed(2), bed: +(l.bed || 0).toFixed(2), over: !!(T && F.snags.over(T, l, F.lureDef)), line: +F.lineOut.toFixed(1), pass: F.snagPass || 0 }; }
    return E.near;
  };
  E.money = () => (g.profile && g.profile.s ? g.profile.s.money : null);
  E.firsts = () => (g.record && g.record.s ? g.record.s.firsts.map((f) => f.words) : []);
  E.page = (id) => E.R().page(id);
  E.holding = (id) => g.inventory.count(id, { reachable: true });
  return true;
};

const press = async (page, key, ms = 60) => { await page.keyboard.press(key); await page.waitForTimeout(ms); await page.evaluate(() => window.__L.step(3)); };
// frames stepped by hand while a key is held (the game reads held keys each frame)
async function hold(page, key, frames) { await page.keyboard.down(key); for (let k = 0; k < frames; k += 6) await page.evaluate(() => window.__L.step(6)); await page.keyboard.up(key); await page.evaluate(() => window.__L.step(2)); }
async function shot(page, ctx, name) { if (ctx && ctx.shots) { try { await page.screenshot({ path: `${ctx.shots}/${name}.png` }); } catch { /* a nicety */ } } }

// a cast by real input: the rod up (F), the jig by its number, Space held to load and let go; then W held (the
// retrieve) until a hook-up, the lure back at the tip, or `max` frames
export async function castAndWork(page, { max = 2400 } = {}) {
  const F0 = await page.evaluate(() => window.__e.fish());
  if (F0.state === 'stowed') await press(page, 'KeyF');
  // the jig: its number in the strip (fishing.owned order), pressed
  const ix = await page.evaluate(async () => { const F = window.__game.fishing, { LURES } = await import('/src/fishing.js'), j = LURES.findIndex((l) => l.id === 'jig'); return F.owned.indexOf(j); });
  if (ix >= 0) await press(page, `Digit${ix + 1}`);
  const aim = await page.evaluate(() => window.__e.aimPast(3));
  const before = await page.evaluate(() => window.__e.why());
  await page.keyboard.down('Space');
  for (let k = 0; k < 40; k++) await page.evaluate(() => window.__L.step(2));
  const loaded = await page.evaluate(() => window.__e.why());
  await page.keyboard.up('Space');
  for (let k = 0; k < 40; k++) { await page.evaluate(() => window.__L.step(5)); const s = await page.evaluate(() => window.__e.fish().state); if (s === 'inwater') break; }
  const landed = await page.evaluate(() => { window.__e.track(true); return window.__e.why(); });
  for (let k = 0; k < 30; k++) await page.evaluate(() => window.__L.step(2)); // (let it sink to the bed)
  // worked back slowly along the sand (60 S9): W in short pulls, the jig let settle to the bottom between them
  let st = null, down = false;
  for (let k = 0; k < max; k += 4) {
    const want = (k % 28) < 12;
    if (want && !down) { await page.keyboard.down('KeyW'); down = true; } else if (!want && down) { await page.keyboard.up('KeyW'); down = false; }
    await page.evaluate(() => window.__L.step(4)); st = await page.evaluate(() => { window.__e.track(); return window.__e.fish(); });
    if (st.state !== 'inwater' && st.state !== 'flying') break;
  }
  if (down) await page.keyboard.up('KeyW');
  return { aim, st, why: { before, loaded, landed, near: await page.evaluate(() => window.__e.near), after: await page.evaluate(() => window.__e.why()) } };
}
// the fight by real input: W held while it gives, let go while it sticks (the bar tells you: past ~0.7 ease off), or
// greedy: W held throughout
async function fight(page, { greedy = false, max = 2400 } = {}) {
  let down = false, st = null, red = 0;
  for (let k = 0; k < max; k += 3) {
    st = await page.evaluate(() => window.__e.fish());
    if (!st.snag) break;
    const want = greedy || (st.tension < 0.72 && st.danger < 0.3);
    if (want && !down) { await page.keyboard.down('KeyW'); down = true; } else if (!want && down) { await page.keyboard.up('KeyW'); down = false; }
    if (st.tension > 0.8) red++;
    await page.evaluate(() => window.__L.step(3));
  }
  if (down) await page.keyboard.up('KeyW');
  return { st, red };
}

export const steps = [
  {
    id: 'E14a', step: 14, title: 'nothing starts without a yes: Rose met, the rumours, NB06 and NB35 read elsewhere',
    run: async ({ page, result }) => {
      const r = await page.evaluate(async () => {
        const g = window.__game, s = g.story, E = window.__e;
        if (!s.has('nb.found')) s.debug.do('found', { abs: s.time().abs, key: 1, lake: 'Moose Lake' });
        E.at(2026, 160, 10); // (9 June 2026, a Tuesday, 10:00)
        await E.toStore(25);
        window.__t.walkIn(25); window.__L.step(20);
        for (let k = 0; k < 40 && !E.ep().rose(); k++) { window.__L.step(4); await window.__L.wait(100); }
        const rose = !!E.ep().rose();
        // E on Rose before the notice: her close, nothing more (talk opened as E opens it: npcs.talkTo)
        const opened = window.__t.talkTo('cast:rose:25'); window.__L.step(4);
        const c = window.__t.convo();
        if (g.dialogue && g.dialogue.close) g.dialogue.close(false);
        s.markRead('NB06', 'slice'); s.markRead('NB35', 'slice');
        s.emit('topic', { who: 'keeper', id: 'rumour', ep: 25 });
        const pool = g.npcs.poolLine ? (() => { for (let k = 0; k < 9; k++) { const l = g.npcs.poolLine('word', { ep: 25 }); if (l && l.id === 'S9.rumour') return l.text; } return null; })() : null;
        return { rose, opened: !!opened, say: c && c.say, open: E.R().open(), pool };
      });
      result('14a (E) meeting Rose (her close only), the rumours, NB06 and NB35 read elsewhere start nothing', r.rose && r.open.length === 0 && /Don't let me keep you/.test(r.say || ''), r);
    },
  },
  {
    id: 'E3', step: 3, title: 'the flyer hook: Rose\'s notice on Gus\'s board, outside its count, no deadline, never paid',
    run: async ({ page, result, ctx }) => {
      const r = await page.evaluate(() => {
        const g = window.__game, T = g.tasks, E = window.__e;
        const slots = T.board(25), html = T.boardSection(25);
        const div = document.createElement('div'); div.innerHTML = html;
        const pins = div.querySelectorAll('.pin').length, flyers = div.querySelectorAll('.pin.flyer').length, sum = (div.querySelector('.sum') || {}).textContent || '';
        const offered = slots.filter((t) => t && t.status === 'offered').length;
        const paper = (div.querySelector('.pin.flyer .fl') || {}).textContent || '';
        const btn = div.querySelector('.pin.flyer [data-id]'), spec = btn && btn.dataset.id;
        const before = { active: T.active.length, held: T.held ? T.held().length : null };
        const took = T.act(spec, 25); // (the button's own spec, as outfitter.js hands it over)
        const after = { active: T.active.length, held: T.held ? T.held().length : null };
        const settled = T.settle ? T.settle({ ep: 25, trip: null }) : null;
        return { slots: slots.length, pins, flyers, sum, offered, paper: paper.replace(/\s+/g, ' ').slice(0, 160), spec, took, before, after, yes: g.story.has('ep.S7.yes'), how: E.R().state('S7').how, taken: E.R().flyers(25).map((f) => f.taken), paid: settled ? settled.total : null, due: T.daysLeft ? null : null };
      });
      await shot(page, ctx, 'e3-board');
      result('3 (E) Rose\'s notice pinned as paper beside the four pins (not one of them; the sum counts only the four), no deadline, never paid; taking it is S7\'s yes', r.slots === 4 && r.flyers === 1 && r.pins === 5 && /LILACS/.test(r.paper) && r.took && r.yes && r.how === 'flyer' && r.before.active === r.after.active && r.taken[0] === true && !r.paid, r);
    },
  },
  {
    id: 'E13a', step: 13, title: 'Rose on a Tuesday by the window: "Where are the lilacs?" rings Inlet Bay',
    run: async ({ page, result }) => {
      await page.evaluate(() => { window.__t.talkTo('cast:rose:25'); window.__L.step(4); });
      const said = await hear(page, 4);
      const c1 = await choose(page, 'Where are the lilacs?');
      const lines = await hear(page, 6);
      const r = await page.evaluate(() => { const g = window.__game, m = window.__t.marks().filter((q) => q.kind === 'ring'); const c = window.__t.convo(); if (g.dialogue && g.dialogue.close) g.dialogue.close(false); return { rings: m.map((q) => ({ label: q.label, by: q.by, x: q.x, z: q.z })), asked: g.story.has('ep.S7.asked'), choices: c && c.choices }; });
      const ring = r.rings.find((q) => q.label === 'Inlet Bay');
      result('13a (E) Rose\'s scene by the window (S7.conv.1), "Where are the lilacs?" (S7.conv.4) rings the Inlet Bay shore in her voice', /You're the one with the notice/.test(said.join(' ')) && c1.ok && lines.some((l) => /Try past Prairie/.test(l || '')) && ring && r.asked, { said, c1, lines, r });
    },
  },
  {
    id: 'E14b', step: 14, title: 'S7 and S9 open at once (no slots); the open episodes\' places for the day\'s beat',
    run: async ({ page, result }) => {
      // (S9 opens at the beach rock in step 12; here: S7 open, and its place in places())
      const p = await page.evaluate(() => window.__e.R().places().map((q) => q.id));
      result('14b (E) the open episode\'s place is in episodes.places() (D\'s day\'s beat reads it)', p.includes('s7.mummos'), { places: p });
    },
  },
  {
    id: 'E12', step: 12, title: 'S9: the snag on June\'s pot by real input; the dead weight on the tension bar; the pot into the hand',
    run: async ({ page, result, ctx }) => {
      const at = await page.evaluate(async () => { const g = window.__game, E = window.__e; window.__t.walkOut(25); E.at(2026, 160, 12); const a = await E.ashore('s9.beach', 1.6); E.kitUp(); g.storyLayer.poll(); window.__L.step(10); return { a, pot: E.prop('s9.pot'), built: E.built('s9.pot'), yes: g.story.has('ep.S9.yes'), rod: g.fishing.rodInHand() }; });
      // casts until the bail is caught (about half the passes)
      let hooked = null, casts = 0, tries = [];
      for (; casts < 14 && !hooked; casts++) {
        const c = await castAndWork(page);
        tries.push({ st: c.st && c.st.state, line: c.st && c.st.line, d: c.aim.d, why: casts < 2 ? c.why : { blownN: c.why.after.blownN, msg: c.why.after.msg, landed: c.why.landed.lure, near: c.why.near } });
        if (c.st && c.st.snag) hooked = c.st;
        else await page.evaluate(() => { const F = window.__game.fishing; if (F.state === 'inwater' || ((F.state === 'bite' || F.state === 'fight') && !(F.fish && F.fish.snag))) { F.fish = null; F.state = 'ready'; F.lineOut = 0; } window.__L.step(20); /* (join c2: a fish on instead of the bail is let go too, or every cast after it stayed in its fight) */ });
      }
      const yes = await page.evaluate(() => ({ yes: window.__game.story.has('ep.S9.yes'), hooked: window.__game.story.has('mg.snag.hooked'), open: window.__e.R().open() }));
      result('12a (E) a jig cast toward the sand off the beach rock and worked back snags the bail (the hook-up: S9\'s yes; S7 and S9 open at once)', !!hooked && yes.yes && yes.hooked && yes.open.includes('S7') && yes.open.includes('S9'), { at, casts, tries: tries.length > 4 ? [...tries.slice(0, 2), ...tries.slice(-2)] : tries, hooked, yes });
      await shot(page, ctx, 'e12-fight');
      // greedy first: W held into the sticks → the red, the line parts, the pot stays
      const g1 = await fight(page, { greedy: true });
      const after1 = await page.evaluate(() => ({ pot: window.__game.story.has('ep.S9.pot'), built: window.__e.built('s9.pot'), msg: window.__e.fish().msg, state: window.__e.fish().state }));
      result('12b (E) the dead weight on the existing tension bar: reeling too hard into it goes red and parts the line; the pot stays', g1.red > 0 && !after1.pot && after1.built && /line parted/i.test(after1.msg || ''), { g1, after1 });
      // then again, easing off through the sticks (the spare jig tied on first, as a player does: the parted line took the
      // jig, and with none in the strip the cast went out on whatever lure was left and rode over the bail: the join)
      await page.evaluate(() => { window.__e.kitUp(); window.__L.step(4); });
      let h2 = null;
      for (let k = 0; k < 14 && !h2; k++) { const c = await castAndWork(page); if (c.st && c.st.snag) h2 = c.st; else await page.evaluate(() => { const F = window.__game.fishing; if (F.state === 'inwater' || ((F.state === 'bite' || F.state === 'fight') && !(F.fish && F.fish.snag))) { F.fish = null; F.state = 'ready'; F.lineOut = 0; } window.__L.step(20); /* (join c2: a fish on instead of the bail is let go too, or every cast after it stayed in its fight) */ }); }
      const t0 = await page.evaluate(() => window.__game.day.hours);
      const g2 = h2 ? await fight(page) : null;
      const r = await page.evaluate((t0) => { const g = window.__game, E = window.__e; g.storyLayer.poll(); window.__L.step(4); return { pot: g.story.has('ep.S9.pot'), end: g.story.get('ep.S9.end'), inHand: E.holding('junespot'), msg: E.fish().msg, built: E.built('s9.pot'), firsts: E.firsts(), page: E.page('S9'), mins: +((g.day.hours - t0) * 60).toFixed(1), ink: g.story.has('ink.coffeelake') }; }, t0);
      result('12c (E) easing off and reeling again: it comes up by its bail into the hand: June\'s pot (its dot words, the trip card\'s first, the Stories page)', !!g2 && r.pot && r.end === 'pot' && r.inHand > 0 && !r.built && /Blue enamel coffee pot/.test(r.msg || '') && r.firsts.includes('Brought up June\'s pot.') && r.page && r.page.first, { g2: g2 && { red: g2.red }, r });
      // Gus's line, walking into 25 with it (S9.conv.1–2)
      const gus = await page.evaluate(async () => { const g = window.__game; await window.__e.toStore(25); window.__L.step(10); window.__t.walkIn(25); for (let k = 0; k < 30; k++) { window.__L.step(10); await window.__L.wait(100); if (g.story.has('ep.S9.gus')) break; } return g.story.has('ep.S9.gus'); });
      result('12d (E) Gus\'s line the first time you walk into 25 with the pot (S9.conv.1–2)', gus, { gus });
    },
  },
  {
    id: 'E13b', step: 13, title: 'S7: Mummo\'s in the lilacs\' window; a June print; the swimming rock; back to Rose: "Look at this", $25',
    run: async ({ page, result, ctx }) => {
      const r = await page.evaluate(async () => {
        const g = window.__game, E = window.__e;
        E.at(2026, 160, 11);
        const a = await E.ashore('s7.mummos', 6);
        for (let k = 0; k < 10; k++) { g.storyLayer.poll(); window.__L.step(5); await window.__L.wait(50); }
        const built = ['s7.lilacs', 's7.lilacs.green', 's7.step', 's7.foundation', 's7.bed', 's7.footing', 's7.rock', 's7.cobble'].filter((id) => E.built(id));
        const lilac = g.story.when('window:lilac');
        // the swimming rock: its dot after NB35 is read at the step (B's reader calls layer.readHere)
        const here = g.storyLayer.readHere('NB35');
        const dot = g.storyLayer.dotName('s7.rock');
        // a June print of the lilacs at the old camp: the camera up, the lilacs in the middle of the frame
        const P = E.prop('s7.lilacs'), p = g.player, yaw = Math.atan2(-(P.z - p.z), P.x - p.x);
        window.__L.look(yaw, 0.05); window.__L.step(4); g.photo.raise(); window.__L.look(yaw, 0.05); window.__L.step(4);
        const rec = g.photo.capture(); window.__L.step(4); g.photo.lower(); window.__L.step(4);
        return { a, built, lilac, here: here && here.id, dot, print: rec && rec.id, matches: rec ? E.R().matchesOf(rec.id) : null, found: g.story.has('ep.S7.found') };
      });
      await shot(page, ctx, 'e13-mummos');
      result('13b (E) Mummo\'s in June: the lilacs in bloom, the step, the foundation, the frame, the footing, the rock; NB35 read at the step: "The swimming rock."; a print matched as the lilacs at the old camp', r.lilac && r.built.includes('s7.lilacs') && !r.built.includes('s7.lilacs.green') && ['s7.step', 's7.foundation', 's7.bed', 's7.footing', 's7.rock'].every((id) => r.built.includes(id)) && r.dot === 'The swimming rock.' && (r.matches || []).includes('s7.lilacs.camp'), r);
      // back to Rose: "Look at this…", the print, S7.conv.7–9 and $25
      const m0 = await page.evaluate(async () => { await window.__e.toStore(25); window.__t.walkIn(25); window.__e.at(2026, 160, 13); window.__L.step(20); return window.__e.money(); });
      const diag = await page.evaluate(async () => {
        const g = window.__game, E = window.__e;
        for (let k = 0; k < 40 && !E.ep().rose(); k++) { window.__L.step(4); await window.__L.wait(100); }
        const d = { rose: !!E.ep().rose(), inRoster: (g.npcs.rosters.get(25) || []).some((v) => v.key === 'cast:rose:25'), open: !!(g.dialogue && g.dialogue.convo), hours: g.day.hours, inside: !!(g.outfitter.visit && g.outfitter.visit.inside) };
        if (g.dialogue && g.dialogue.convo && g.dialogue.close) g.dialogue.close(false);
        d.cleared = E.clear();
        d.talk = window.__t.talkTo('cast:rose:25'); window.__L.step(4);
        if (!window.__t.convo()) { d.fallback = E.ep().roseTalk(); window.__L.step(4); } // (E on her, the talk the dot opens: npcs.talkTo, else her own)
        d.convo = !!window.__t.convo();
        return d;
      });
      const c1 = await choose(page, 'Look at this');
      const pick = await page.evaluate(() => { const c = window.__t.convo(); return c ? c.choices : null; });
      const ix = (pick || []).findIndex((t) => /lilac|Basswood|Inlet|A print/i.test(t));
      if (ix >= 0) await press(page, `Digit${ix + 1}`); else if (pick && pick.length) await press(page, 'Digit1');
      const said = await hear(page, 6);
      const r2 = await page.evaluate((m0) => { const g = window.__game, E = window.__e; if (g.dialogue && g.dialogue.close) g.dialogue.close(false); return { shown: g.story.has('ep.S7.shown'), end: g.story.get('ep.S7.end'), paid: (E.money() ?? 0) - (m0 ?? 0), owed: ((g.story.doc.dir && g.story.doc.dir.pay) || []).filter((p) => p.line === 'S7.pay' && !p.paid).reduce((n, p) => n + p.amt, 0), page: E.page('S7'), firsts: E.firsts() }; }, m0); // (join c2: D's pay: owes it now, the trip-end tally pays it)
      result('13c (E) back to Rose, "Look at this" with the June print: S7.conv.7–9, $25 (owed through D\'s pay:, "$25 from Rose." at the trip-end tally); the page\'s last line; the trip card\'s first', c1.ok && said.some((l) => /^Oh\.?$/.test(l || '')) && said.some((l) => /bottle of pop in 1956/.test(l || '')) && r2.shown && r2.end === 'rose' && (r2.paid === 25 || r2.owed === 25) && r2.page && /Rose has the picture/.test(r2.page.end || '') && r2.firsts.includes('Lilacs at Mummo\'s.'), { diag, c1, pick, said, r2 });
    },
  },
  {
    id: 'E13c', step: 13, title: 'out of the window: the place is there, the lilacs green, no print matches, the notice down',
    run: async ({ page, result }) => {
      const r = await page.evaluate(async () => {
        const g = window.__game, E = window.__e;
        if (g.outfitter.layout(25)) window.__t.walkOut(25); E.at(2026, 215, 11); // (3 August)
        const flyers = E.R().flyers(25).length;
        await E.ashore('s7.mummos', 4);
        for (let k = 0; k < 10; k++) { g.storyLayer.poll(); window.__L.step(5); await window.__L.wait(50); }
        const built = ['s7.lilacs', 's7.lilacs.green', 's7.step'].filter((id) => E.built(id));
        const P = E.prop('s7.lilacs'), p = g.player, yaw = Math.atan2(-(P.z - p.z), P.x - p.x);
        window.__L.look(yaw, 0.05); window.__L.step(4); g.photo.raise(); window.__L.look(yaw, 0.05); window.__L.step(4);
        const rec = g.photo.capture(); window.__L.step(4); g.photo.lower(); window.__L.step(4);
        return { lilac: g.story.when('window:lilac'), built, matches: rec ? E.R().matchesOf(rec.id) : null, flyers };
      });
      result('13d (E) out of the window: the place is there (the step), the lilacs green, no print matches the lilacs at the old camp, the notice down', !r.lilac && r.built.includes('s7.lilacs.green') && !r.built.includes('s7.lilacs') && r.built.includes('s7.step') && !(r.matches || []).includes('s7.lilacs.camp') && r.flyers === 0, r);
    },
  },
];
