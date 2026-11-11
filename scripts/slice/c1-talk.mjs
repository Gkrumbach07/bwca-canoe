// Stream T's part of the --slice rig (docs/build/campaign-design.md Part 4 Round 1, "The first playable slice"): the
// steps T owns, as sections the join assembles (scripts/story-rig.mjs --slice). Real input where it matters: the door
// walked through (the outfitter's own updateVisit), the conversations opened as E opens them (npcs.talkTo) and every
// choice pressed by its number on the keyboard.
//
//   import { HELPERS_T, steps } from './slice/c1-talk.mjs'
//   await page.evaluate(HELPERS_T)          window.__t: step, standAt, walkIn(ep), walkOut(ep), convo(), indexOf(prefix),
//                                           talkTo(key), keeperKey(ep), tauno(), staged(), marks()
//   for (const s of steps) await s.run({ page, result, log, ctx })   each: { id, step, title, run }
// ctx carries what one step leaves for the next: { home } (the season's home; the season begun by the caller).
export const HELPERS_T = () => {
  const g = window.__game, T = window.__t = {};
  T.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  T.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  T.settle = async (ms = 40000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { T.step(10); await T.wait(30); } T.step(20); };
  T.standAt = (x, z, heading = 0) => {
    const p = g.player;
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false }; // (off the water: the canoe set down)
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  // through the store's door: in to the middle, then out to the foot of the steps (outfitter.updateVisit sees both)
  T.walkIn = (ep) => { const L = g.outfitter.layout(ep); T.standAt(L.centre.x, L.centre.z); T.step(12); return !!(g.outfitter.visit && g.outfitter.visit.inside); };
  T.walkOut = (ep) => { const L = g.outfitter.layout(ep), f = L.stepsFoot || L.door; T.standAt(f.x - (L.axes.b.x * 0.5), f.z - (L.axes.b.z * 0.5)); T.step(12); return !!(g.outfitter.visit && !g.outfitter.visit.inside); };
  T.convo = () => { const c = g.dialogue && g.dialogue.convo; return c ? { who: c.name, by: c.node && c.node.by, say: c.node && c.node.say, choices: (c.node && c.node.choices || []).map((o) => o.text) } : null; };
  T.indexOf = (prefix) => { const c = T.convo(); return c ? c.choices.findIndex((t) => t.startsWith(prefix)) : -1; };
  T.talkTo = (key) => g.npcs.talkTo(key);
  T.keeperKey = (ep) => { const r = g.npcs.at(ep) || []; const k = r.find((v) => v.keeper); return k ? k.key : null; };
  T.tauno = () => (g.storyTalk.cast.staged().find((s) => s.who === 'tauno') || null);
  T.staged = () => g.storyTalk.cast.staged();
  T.marks = () => { const P = g.storySeams && g.storySeams.pencil; return P ? P.marks() : []; };
  T.figure = (key) => { const n = g.npcs; for (const list of n.rosters.values()) for (const v of list) if (v.key === key) { const f = v.figs[0], b = n.bodies.find((x) => x.who && x.who.person === v); return { x: f.x, z: f.z, y: f.y, ground: g.player.groundAt(f.x, f.z), drawn: !!(b && b.group.visible) }; } return null; };
  return true;
};

// press the numbered choice that starts with `prefix` (presses through single '…' lines first, at most `skip`)
export async function choose(page, prefix, { skip = 12 } = {}) {
  for (let k = 0; k < skip; k++) {
    const c = await page.evaluate(() => window.__t.convo());
    if (!c) return { ok: false, why: 'no conversation', prefix };
    const i = c.choices.findIndex((t) => t.startsWith(prefix));
    if (i >= 0) { await page.keyboard.press(`Digit${i + 1}`); await page.waitForTimeout(60); return { ok: true, said: c.say }; }
    if (c.choices.length === 1 && c.choices[0] === '…') { await page.keyboard.press('Digit1'); await page.waitForTimeout(60); continue; }
    return { ok: false, why: `no "${prefix}" in [${c.choices.join(' | ')}]`, say: c.say };
  }
  return { ok: false, why: 'too many lines', prefix };
}
// press through the '…' lines, collecting what is said, until a node with real choices (or the talk closes)
export async function hear(page, n = 14) {
  const said = [];
  for (let k = 0; k < n; k++) {
    const c = await page.evaluate(() => window.__t.convo());
    if (!c) break;
    if (!said.length || said[said.length - 1] !== c.say) said.push(c.say);
    if (c.choices.length === 1 && c.choices[0] === '…') { await page.keyboard.press('Digit1'); await page.waitForTimeout(60); continue; }
    break;
  }
  return said;
}
async function picks(page, list) {
  const out = [];
  for (const p of list) { const r = await choose(page, p); out.push(r); if (!r.ok) return { ok: false, at: p, r, out }; }
  return { ok: true, out };
}
const facts = (page, keys) => page.evaluate((ks) => Object.fromEntries(ks.map((k) => [k, window.__game.story.has(k)])), keys);

export const steps = [
  // slice step 1 (B, T): Josie gives the BRM-14 bundle at P1 (the keeper by manner, Josie by the week and the back room)
  { id: 'p1-take', step: 1, title: 'P1: the keeper, Josie, the bundle taken', run: async ({ page, result, ctx }) => {
    const open = await page.evaluate((home) => { const g = window.__game; return g.onboarding.pending(home) && g.onboarding.start(home); }, ctx.home);
    const first = await page.evaluate(() => window.__t.convo());
    const said = await hear(page);
    const r = await picks(page, ['What\'s BRM-14?', 'I\'ll take it.']);
    const after = await hear(page, 4);
    const f = await facts(page, ['bundle.taken', 'bundle.shelf']);
    const pack = await page.evaluate(() => window.__game.inventory.containers.some((c) => c.item === 'waltpack'));
    result('1 P1: the keeper speaks first (by manner), then Josie (the week, the back room); "I\'ll take it." gives the bundle (bundle.taken, the BRM-14 pack)',
      open && first && first.by && said.length >= 3 && r.ok && f['bundle.taken'] && !f['bundle.shelf'] && pack, { first, said: said.slice(0, 5), r: r.ok ? 'ok' : r, after: after.slice(0, 2), f, pack });
    // finish the onboarding's own part (the keeper's word, the permit), as the player would
    for (let k = 0; k < 8; k++) { const c = await page.evaluate(() => window.__t.convo()); if (!c) break; await page.keyboard.press('Digit1'); await page.waitForTimeout(80); }
    await page.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
  } },
  // slice step 4 (T): the return, then the walkout by daylight: Tauno at the porch foot (or his truck), T1–T6, no ring
  { id: 'porch', step: 4, title: 'the return and the porch, warm', run: async ({ page, result, ctx }) => {
    const ep = ctx.home;
    await page.evaluate(() => { const g = window.__game; g.story.debug.do('found', { abs: g.story.time().abs }); g.story.markRead('NB45', 'rig'); g.day.setClock(g.day.year, g.day.doy, 10); window.__t.step(4); });
    await page.evaluate((e) => window.__t.walkOut(e), ep);
    await page.evaluate((e) => window.__t.walkIn(e), ep);
    const armed = await facts(page, ['tauno.armed']);
    // the return's gold topic at the counter
    const key = await page.evaluate((e) => window.__t.keeperKey(e), ep);
    await page.evaluate((k) => window.__t.talkTo(k), key);
    await page.waitForTimeout(100);
    const gold = await page.evaluate(() => window.__t.convo());
    const g1 = await choose(page, 'Whose gear was this?');
    const gearSaid = await hear(page, 4);
    await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    const gearF = await page.evaluate(() => ({ gear: window.__game.story.get('walt.gear'), line: window.__game.story.walt().includes('20:5.2.w1') }));
    result('4a the return: inside after night one arms the porch; the keeper\'s first choice is "Whose gear was this?" (gold), "Before my time" and its Walt line',
      armed['tauno.armed'] && gold && gold.choices[0] === 'Whose gear was this?' && g1.ok && gearF.line && gearF.gear === ep, { armed, gold, gearSaid, gearF });
    // out of the door by daylight
    await page.evaluate((e) => window.__t.walkOut(e), ep);
    await page.evaluate(() => window.__t.step(30));
    const t = await page.evaluate(() => window.__t.tauno());
    const fig = t ? await page.evaluate((k) => window.__t.figure(k), `cast:tauno:${t.ep}`) : null;
    result('4b the walkout: Tauno at the porch foot (or by his truck where there is no porch), on the ground, drawn, his first word said',
      t && t.slot === 'porch' && fig && Math.abs(fig.y - fig.ground) < 0.35 && t.barked, { t, fig });
    await page.evaluate((k) => window.__t.talkTo(k), `cast:tauno:${ep}`);
    await page.waitForTimeout(100);
    const t1 = await page.evaluate(() => window.__t.convo());
    const r = await picks(page, ['Sorry?', 'Walk with him', 'A Swede?', 'You knew him?', 'Doing what?', 'What\'s BRM?', 'Who are you?', 'What do you want from me?', 'I\'ll go look.']);
    await hear(page, 6);
    const f = await facts(page, ['tauno.porch.done', 'tauno.porch.warm', 'knows.walt', 'knows.haapala', 'knows.boreal', 'knows.tauno', 'door.crews.taken']);
    const rings = await page.evaluate(() => window.__t.marks().length);
    const stage = await page.evaluate(() => window.__game.story.stage);
    result('4c T1–T6, warm (NB45 read: the Swede test corrected): Walt, Haapala, Boreal, his name, the door taken; he marks nothing; S2',
      t1 && t1.say === 'That\'s BRM fourteen.' && r.ok && Object.values(f).every(Boolean) && rings === 0 && stage === 'S2', { t1, r: r.ok ? 'ok' : r, f, rings, stage });
  } },
  // slice step 5 (join T + P + L): ask a keeper: a ring with the keeper's name in Marked (T: the topic and the ring)
  { id: 'rings', step: 5, title: 'the first rings', run: async ({ page, result, ctx }) => {
    const ep = ctx.home;
    await page.evaluate((e) => window.__t.walkIn(e), ep);
    const key = await page.evaluate((e) => window.__t.keeperKey(e), ep);
    await page.evaluate((k) => window.__t.talkTo(k), key);
    await page.waitForTimeout(100);
    const r = await picks(page, ['Ask about', 'Can you ring Little Gabbro for me?']);
    await hear(page, 4);
    const r2 = await picks(page, ['And Bald Eagle\'s west shore?']);
    await hear(page, 3);
    await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    const m = await page.evaluate(() => window.__t.marks());
    const name = await page.evaluate((e) => { const v = (window.__game.npcs.at(e) || []).find((x) => x.keeper); return v ? v.name.split(' ')[0] : null; }, ep);
    result('5 "Can you ring Little Gabbro for me?" rings EP 33\'s landing by the keeper\'s name; "And Bald Eagle\'s west shore?" a wide ring holding the crews\' landing',
      r.ok && r2.ok && m.length === 2 && m.every((g) => g.by.includes(name)) && Math.hypot(m[1].x + 25825, m[1].z - 29925) < m[1].r, { m, name, r: r.ok ? 'ok' : r, r2: r2.ok ? 'ok' : r2 });
  } },
  // slice step 6 (T, P): back on a porch: U1–U5, Eino named, four doors named; a keeper rings one when asked; S3
  { id: 'turn', step: 6, title: 'the turn on a porch', run: async ({ page, result, ctx }) => {
    const ep = ctx.home;
    // the crews' landing seen (stream L's place: its facts, as its verbs write them)
    await page.evaluate(() => { const s = window.__game.story; for (const f of ['crews.seen', 'landing.crib', 'landing.pink', 'landing.blaze']) s.debug.set(f); });
    await page.evaluate(() => { const g = window.__game; g.day.setClock(g.day.year, g.day.doy + 1, 8); window.__t.step(10); });
    const staged = await page.evaluate((e) => window.__game.storyTalk.cast.debug.stage('tauno', e, 'home', 'bench'), ep);
    await page.evaluate((k) => window.__t.talkTo(k), `cast:tauno:${ep}`);
    await page.waitForTimeout(100);
    const u1 = await page.evaluate(() => window.__t.convo());
    const r = await picks(page, ['The crib\'s still there.', 'Somebody\'s flagged the grade.', 'Pink. New.', 'Measuring for who?', 'Away from the west shore', 'Somebody killed him.', 'Marlys?', 'I\'ll go.']);
    await hear(page, 4);
    const f = await facts(page, ['tauno.pink', 'knows.eino', 'tauno.upwind', 'tauno.turn', 'tauno.killed', 'door.guiding.named', 'door.boys.named', 'door.family.named', 'door.mining.named']);
    const stage = await page.evaluate(() => window.__game.story.stage);
    result('6a U1–U6: the report, pink, Eino, upwind, the word, the four doors (Moose Lake, Sawbill, Little Vermilion, Farm) named; S3',
      staged && u1 && /Is it there\?/.test(u1.say) && r.ok && Object.values(f).every(Boolean) && stage === 'S3', { u1, r: r.ok ? 'ok' : r, f, stage });
    await page.evaluate((e) => window.__t.walkIn(e), ep);
    const key = await page.evaluate((e) => window.__t.keeperKey(e), ep);
    await page.evaluate((k) => window.__t.talkTo(k), key);
    await page.waitForTimeout(100);
    const before = await page.evaluate(() => window.__t.marks().length);
    const r2 = await picks(page, ['Ask about', 'Walt\'s sister\'s at Crane Lake?']);
    await hear(page, 3);
    await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    const after = await page.evaluate(() => window.__t.marks());
    result('6b a keeper rings a door when asked ("Walt\'s sister\'s at Crane Lake?": Little Vermilion 12)',
      r2.ok && after.length === before + 1 && (await facts(page, ['door.family.ringed']))['door.family.ringed'], { r2: r2.ok ? 'ok' : r2, after: after.slice(-1) });
  } },
];

// slice step 4's declines (T), on a season of their own: keep walking twice (X1), R3 "You again." on a later trip
// (declined again), then Farm's porch of a morning: "Changed your mind?" → yes works
// slice step 1's other half (B, T): "I'll wait for a rental." leaves the bundle on the shelf; R1 at the home counter a
// trip later: Josie, "You never took that old stuff?" → "I'll take it now." gives it
export const shelf = { id: 'p1-shelf', step: 1, title: 'P1: the bundle left on the shelf', run: async ({ page, result, ctx }) => {
  await page.evaluate((home) => { const g = window.__game; return g.onboarding.pending(home) && g.onboarding.start(home); }, ctx.home);
  await hear(page);
  const r = await picks(page, ['I\'ll wait for a rental.']);
  await hear(page, 3);
  for (let k = 0; k < 8; k++) { const c = await page.evaluate(() => window.__t.convo()); if (!c) break; await page.keyboard.press('Digit1'); await page.waitForTimeout(80); }
  await page.evaluate(() => { const o = window.__game.outfitter; if (o.open) o.hide(); });
  const f = await facts(page, ['bundle.shelf', 'bundle.taken']);
  const pack = await page.evaluate(() => window.__game.inventory.containers.some((c) => c.item === 'waltpack'));
  result('1b P1 "I\'ll wait for a rental.": the bundle stays on the shelf (bundle.shelf, no BRM-14 pack); the loaned canoe all the same',
    r.ok && f['bundle.shelf'] && !f['bundle.taken'] && !pack, { r: r.ok ? 'ok' : r, f, pack });
} };
export const r1 = { id: 'r1', step: 1, title: 'R1: Josie, the bundle off the shelf', run: async ({ page, result, ctx }) => {
  const ep = ctx.home;
  const back = await page.evaluate(async (e) => {
    const g = window.__game, T = window.__t, s = g.story, n = s.tripN(); s.ctx.tripN = () => n + 2;
    const l = g.outfitter.landing(e);
    if (Math.hypot(g.player.x - l.x, g.player.z - l.z) > 150) { await g.player.teleport(l.x, l.z); await T.settle(); }
    for (let k = 0; k < 120 && !g.outfitter.layout(e); k++) { T.step(10); await T.wait(60); }
    T.walkIn(e); T.walkOut(e); T.walkIn(e); T.step(40);
    return T.staged();
  }, ep);
  const j = await page.evaluate(() => window.__t.staged().find((x) => x.who === 'josie') || null);
  if (j) { await page.evaluate((k) => window.__t.talkTo(k), `cast:josie:${j.ep}`); await page.waitForTimeout(100); }
  const c = await page.evaluate(() => window.__t.convo());
  const r = await picks(page, ['I\'ll take it now.']);
  await hear(page, 3);
  const f = await facts(page, ['rehook.R1', 'bundle.taken', 'bundle.later']);
  const pack = await page.evaluate(() => window.__game.inventory.containers.some((x) => x.item === 'waltpack'));
  result('1c R1 a trip later at the home counter: Josie, "You never took that old stuff?" → "I\'ll take it now." (the pack and tent, once ever)',
    j && j.slot === 'R1' && c && c.say === 'You never took that old stuff?' && r.ok && f['rehook.R1'] && pack, { back, j, c, r: r.ok ? 'ok' : r, f, pack });
} };

export const declines = { id: 'declines', step: 4, title: 'the declines and the Farm seat', run: async ({ page, result, ctx }) => {
  const ep = ctx.home;
  await page.evaluate(() => { const g = window.__game; g.story.debug.do('found', { abs: g.story.time().abs }); g.day.setClock(g.day.year, g.day.doy, 10); window.__t.step(4); });
  await page.evaluate((e) => { window.__t.walkOut(e); window.__t.walkIn(e); window.__t.walkOut(e); window.__t.step(20); }, ep);
  const t = await page.evaluate(() => window.__t.tauno());
  // walking past him: T1b ("Hey. That pack.") at 12 m; then back, and E on him: [Keep walking] twice is X1
  const past = await page.evaluate(() => {
    const g = window.__game, T = window.__t, st = T.tauno(); if (!st) return null;
    const p = g.player, dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot(dx, dz) || 1;
    T.standAt(st.x + (dx / d) * 15, st.z + (dz / d) * 15); T.step(20);
    const r = T.tauno();
    T.standAt(st.x + (dx / d) * 1.6, st.z + (dz / d) * 1.6); T.step(10);
    return r;
  });
  if (t) { await page.evaluate((k) => window.__t.talkTo(k), `cast:tauno:${t.ep}`); await page.waitForTimeout(100); }
  const r1 = await picks(page, ['Keep walking', 'Keep walking']);
  await hear(page, 3);
  const d1 = await facts(page, ['tauno.porch.declined1', 'tauno.talk']);
  result('4d keep walking: past him he calls after you (T1b); [Keep walking] twice is X1 (declined1); no ring',
    t && past && past.past && r1.ok && d1['tauno.porch.declined1'] && (await page.evaluate(() => window.__t.marks().length)) === 0, { t, past, r1: r1.ok ? 'ok' : r1, d1 });
  // a later trip: R3
  await page.evaluate(() => { const s = window.__game.story; const n = s.tripN(); s.ctx.tripN = () => n + 1; });
  await page.evaluate((e) => { window.__t.walkIn(e); window.__t.walkOut(e); window.__t.step(20); }, ep);
  const why3 = await page.evaluate((e) => window.__game.storyTalk.cast.debug.why(e), ep);
  const t3 = await page.evaluate(() => window.__t.tauno());
  if (t3) { await page.evaluate((k) => window.__t.talkTo(k), `cast:tauno:${t3.ep}`); await page.waitForTimeout(100); }
  const r3 = await page.evaluate(() => window.__t.convo());
  const nt = await choose(page, 'Not today.');
  await hear(page, 3);
  const d2 = await facts(page, ['tauno.porch.declined2', 'rehook.R3']);
  result('4e a later trip\'s walkout: R3 "You again." → "Not today." (declined2, once ever)', t3 && t3.slot === 'R3' && r3 && r3.say === 'You again.' && nt.ok && d2['tauno.porch.declined2'], { t3, r3, d2, why3 });
  // Farm's porch of a morning
  const farm = await page.evaluate(async () => {
    const g = window.__game, T = window.__t;
    g.day.setClock(g.day.year, g.day.doy + 1, 8);
    const l = g.outfitter.landing(31);
    await g.player.teleport(l.x, l.z); await T.settle();
    for (let k = 0; k < 120 && !g.outfitter.layout(31); k++) { T.step(10); await T.wait(60); }
    const L = g.outfitter.layout(31); if (!L) return { why: 'no Farm store' };
    T.standAt(L.stepsFoot.x + L.axes.b.x * 3, L.stepsFoot.z + L.axes.b.z * 3); T.step(40);
    return { staged: T.staged(), porch: !!(L.look && L.look.porch) };
  });
  const tf = await page.evaluate(() => window.__t.tauno());
  if (tf) { await page.evaluate((k) => window.__t.talkTo(k), `cast:tauno:${tf.ep}`); await page.waitForTimeout(100); }
  const cm = await page.evaluate(() => window.__t.convo());
  const r = await picks(page, ['Walk with him', 'Who\'s Walt?', 'What do you want from me?', 'I\'ll go look.']);
  await hear(page, 4);
  const f = await facts(page, ['tauno.porch.done', 'door.crews.taken']);
  result('4f Farm\'s porch of a morning: "Changed your mind?" → walk with him → the door taken', tf && tf.ep === 31 && cm && cm.say === 'Changed your mind?' && r.ok && f['tauno.porch.done'] && f['door.crews.taken'], { farm, tf, cm, r: r.ok ? 'ok' : r, f });
} };
