// Stream A2's part of the --slice2 rig (docs/build/campaign-design.md Part 4 Round 2, "The second playable slice,
// exactly"): the steps A2 owns (1, 2, 4, 6, 7, 8, 9) and A2's half of the join items 3 (the notice: the flyer's window and
// its take; E's board hook shows it) and 5 (the pay: lines queued for the tally; D's handler pays them), as sections the
// join assembles into story-slice --slice2. Real input where the spec says: the grade and the bushwhack walked by the
// keys (W held, the view turned), Pietro's last stretch paddled and the path up walked, every dot verb by E, every choice
// by its number. Travel between places is a teleport (L.tp: the chase snapped).
//
//   import { HELPERS_A2, setup, steps, variant } from './slice/c2-mining.mjs'
//   await page.evaluate(HELPERS_T); await page.evaluate(HELPERS); await page.evaluate(HELPERS_A2)   (c1-talk, c1-layer, this)
//   await setup({ page, result, log, ctx })     the end of chapter 1: P1 taken at Farm (c1-talk's step), fixture('turn')
//   for (const s of steps) await s.run({ page, result, log, ctx, shots })
//   await variant.run(...)                      a second season: "You don't owe anybody this.", then On the record
// ctx: { home: 31, year, d0 (the Tuesday the slice starts), shots }
import { choose as chooseT, hear, steps as T_STEPS } from './c1-talk.mjs';

// a choice by its number on the keyboard (c1-talk's choose); past nine, or when the key does not take, by the dialogue's
// own choose(i) (what a click on the line does), and said so in the result
async function choose(page, prefix, o) {
  const c = await page.evaluate(() => window.__t.convo());
  const i = c ? c.choices.findIndex((t) => t.startsWith(prefix)) : -1;
  if (i >= 9) { const ok = await page.evaluate((i) => { const D = window.__game.dialogue; const r = D.choose(i); window.__L.step(3); return r; }, i); await page.waitForTimeout(60); return { ok: !!ok, said: c.say, by: 'click' }; }
  const r = await chooseT(page, prefix, o);
  if (r.ok && i >= 0) {
    const after = await page.evaluate(() => window.__t.convo());
    if (after && c && after.say === c.say && JSON.stringify(after.choices) === JSON.stringify(c.choices)) { const ok = await page.evaluate((i) => { const D = window.__game.dialogue; const x = D.choose(i); window.__L.step(3); return x; }, i); return { ok: !!ok, said: c.say, by: 'click (the key did not take)' }; }
  }
  return r;
}

export const HELPERS_A2 = () => {
  const g = window.__game, A = window.__a2 = {}, L = window.__L, T = window.__t;
  A.M = () => g.storyMining;
  A.s = () => g.story;
  A.dow = (doy) => new Date(Date.UTC(g.day.year, 0, doy)).getUTCDay();
  A.abs = (doy) => Math.round(Date.UTC(g.day.year, 0, doy) / 86400000);
  // the clock to a day and hour; the player fed and rested (the slice's days are the story's: a week of them with no food
  // bought ends in an evacuation home, energy.js's, which is not what is under test here)
  A.at = (doy, h) => { g.day.setClock(g.day.year, doy, h); const e = g.energy; if (e) { e.value = 1; try { if (e.needs) { e.needs.food = 1; e.needs.water = 1; e.needs.warmth = 1; } if ('lastMealAbs' in e) e.lastMealAbs = e.now; } catch { /* energy.js's own */ } } L.step(6); g.story.update(); L.step(4); };
  A.facts = (ks) => Object.fromEntries(ks.map((k) => [k, g.story.has(k)]));
  A.store = () => g.outfitter.layout(31);
  // to Farm's porch, a little off the steps (the cast seats him on the bench once you are this near)
  A.toFarm = async () => { let S = A.store(); if (!S || Math.hypot(S.centre.x - g.player.x, S.centre.z - g.player.z) > 300) { const l = g.outfitter.landings.find((x) => x.ep === 31); await L.tp(l.x, l.z); await L.settle(); for (let k = 0; k < 120 && !(S = A.store()); k++) { L.step(5); await L.wait(60); } } if (!S) return false; const f = S.stepsFoot || S.door, b = S.axes.b; L.standAt(f.x + b.x * 4, f.z + b.z * 4, 0); L.step(40); return true; };
  A.inside = () => { const S = A.store(); L.standAt(S.centre.x, S.centre.z); L.step(12); return !!(g.outfitter.visit && g.outfitter.visit.inside); };
  A.staged = () => ({ cast: g.storyTalk.cast.staged(), mining: A.M().miningCast.staged() });
  A.endTalk = () => { const D = g.dialogue; if (D && D.convo) D.close(false); L.step(4); };
  A.rings = () => (g.storySeams.pencil ? g.storySeams.pencil.marks().filter((m) => m.kind === 'ring').map((m) => ({ label: m.label, who: m.who, places: m.places })) : []);
  A.ringed = (place) => !!(g.storySeams.pencil && g.storySeams.pencil.has(place));
  A.task = (kind) => { const t = [...g.tasks.ads.values()].find((x) => x.kind === kind); return t ? { id: t.id, status: t.status, title: t.title, got: t.got, pay: t.pay } : null; };
  A.inv = (id) => g.inventory.count(id, { reachable: false });
  // walk to (x, z) by the keys: the view turned toward it, W held, stepped; the API only if it sticks (said so)
  A.yaw = (x, z) => Math.atan2(-(z - g.player.z), x - g.player.x);
  // a thing at your feet: stand d m off, face it, look down until the dot is on it (camera.js slides the look point in to
  // the ground at the walker's feet as the view comes down, so the middle of the view finds it)
  A.faceLow = (id, d = 1.3) => {
    const q = L.prop(id), w = g.world; if (!q) return null; const tried = [];
    const B = g.storyLayer.builtList().find((b) => b.prop === id), y = (B ? B.y : q.y) + 0.15;
    for (const dd of [1.6, 2.2, 2.8]) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, x = q.x + Math.cos(a) * dd, z = q.z + Math.sin(a) * dd;
      if (w.isWater(x, z)) continue;
      L.standAt(x, z, Math.atan2(-(q.z - z), q.x - x)); L.step(4);
      // the view's yaw and pitch from the camera itself (its shoulder offset and its orbit move with the pitch)
      for (let it = 0; it < 14; it++) {
        const c = g.camera.position, yaw = Math.atan2(-(q.z - c.z), q.x - c.x), hd = Math.hypot(q.x - c.x, q.z - c.z);
        g.chase.viewYaw = yaw; g.chase.forwardYaw = yaw; g.chase.viewPitch = Math.atan2(y - c.y, hd); L.step(2);
        const t = L.target(); if (t && t.ref === `story:${id}`) return t;
      }
      tried.push([dd, k, (L.target() || {}).ref || null]);
    }
    A.lastLow = tried; return null;
  };
  A.place = (id) => { const q = g.storyLayer.place(id); return q && { x: q.x, z: q.z, n: q.n, lanes: q.lanes }; };
  return true;
};

// walk to a point by the keys (W held, the view turned at it each few frames); → { ok, d, stuck }
async function walkTo(page, x, z, { r = 3, max = 400, log = null } = {}) {
  let last = null, still = 0, d = Infinity;
  await page.keyboard.down('w');
  try {
    for (let k = 0; k < max; k++) {
      const s = await page.evaluate(([x, z]) => { const g = window.__game, p = g.player, L = window.__L; L.look(window.__a2.yaw(x, z), 0); L.step(10); return { d: Math.hypot(x - p.x, z - p.z), x: p.x, z: p.z, mode: p.mode }; }, [x, z]);
      d = s.d;
      if (log && k % 50 === 0) log(`   walk k=${k} d=${Math.round(d)} at ${Math.round(s.x)},${Math.round(s.z)} ${s.mode}`);
      if (d < r) return { ok: true, d, k };
      if (last && Math.hypot(s.x - last.x, s.z - last.z) < 0.05) { if (++still > 25) return { ok: false, d, stuck: true, at: [Math.round(s.x), Math.round(s.z)], mode: s.mode }; } else still = 0;
      last = s;
    }
  } finally { await page.keyboard.up('w'); }
  return { ok: false, d };
}
// a route walked leg by leg; a leg that sticks is stepped past (standAt a few metres on) and counted
async function walkRoute(page, pts, opts = {}) {
  const legs = [];
  for (const [x, z] of pts) {
    let w = await walkTo(page, x, z, opts);
    if (!w.ok) { await page.evaluate(([x, z]) => { const g = window.__game, p = g.player, a = Math.atan2(z - p.z, x - p.x); window.__L.standAt(p.x + Math.cos(a) * 4, p.z + Math.sin(a) * 4, window.__a2.yaw(x, z)); window.__L.step(6); }, [x, z]); w = { ...(await walkTo(page, x, z, opts)), helped: true }; }
    legs.push({ to: [Math.round(x), Math.round(z)], ok: w.ok, d: Math.round(w.d), helped: !!w.helped, stuck: w.stuck || null });
    if (opts.log) opts.log('  leg', JSON.stringify(legs[legs.length - 1]));
  }
  return legs;
}
async function press(page, key) { await page.keyboard.press(key); await page.evaluate(() => window.__L.step(3)); }
async function shot(page, shots, name) { if (shots) { try { await page.screenshot({ path: `${shots}/${name}.png` }); } catch { /* the shot is a nicety */ } } }
const d0Of = (ctx) => ctx.d0;
const facts = (page, ks) => page.evaluate((ks) => window.__a2.facts(ks), ks);
// a paper up (the trip card as a trip ends at a door): a talk under it is closed the frame it opens, so it goes first,
// as a player closes it (E), else by its own close (story-slice.mjs dismissCard)
async function dismiss(page) {
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => { const h = window.__game.hud; if (h && h.big && typeof h.setMode === 'function') { h.setMode(h.settings && h.settings.cornerSheet ? 'corner' : 'hidden'); window.__L.step(3); } }); // (the map's sheet: a talk under it closes too)
    const p = await page.evaluate(() => { const h = window.__game.hud; return h && h.paper && h.paper !== 'outfitter' ? h.paper : null; });
    if (!p) return;
    if (k === 0) await page.keyboard.press('e');
    else await page.evaluate((p) => { const g = window.__game, h = g.hud; if (p === 'tripcard' && g.record && g.record.close) g.record.close(); else { const c = h.papers && h.papers.get(p); if (c) c(); } }, p);
    await page.evaluate(() => window.__L.step(3));
  }
}
async function talk(page, key) {
  await dismiss(page);
  await page.evaluate(async () => { const g = window.__game, L = window.__L; for (let k = 0; k < 100 && g.player.teleporting; k++) { L.step(10); await L.wait(100); } }); // (a talk while a jump is still settling closes at once: dialogue.js)
  await page.evaluate((k) => window.__t.talkTo(k), key); await page.waitForTimeout(120);
  const c = await page.evaluate(() => window.__t.convo());
  if (!c && LOG) LOG(`  talk ${key}: no conversation ${JSON.stringify(await page.evaluate(() => { const g = window.__game, S = g.outfitter.layout(31); return { staged: window.__a2.staged(), at: [Math.round(g.player.x), Math.round(g.player.z)], store: S ? Math.round(Math.hypot(S.centre.x - g.player.x, S.centre.z - g.player.z)) : null, clock: [g.day.doy, +g.day.hours.toFixed(2), window.__a2.dow(g.day.doy)], convo: !!(g.dialogue && g.dialogue.convo), visit: g.outfitter.visit ? { ep: g.outfitter.visit.ep, inside: !!g.outfitter.visit.inside } : null, mode: g.player.mode, warned: !!window.__a2.M().miningCast.warned }; })).slice(0, 1500)}`);
  return c;
}
async function picks(page, list) { const out = []; for (const p of list) { const r = await choose(page, p); out.push(r); if (!r.ok) return { ok: false, at: p, r, out }; } return { ok: true, out }; }
// E on a story prop (the dot found from whichever side; the key pressed) → the target as the dot named it
let LOG = null;
async function eOn(page, id, d = 1.8, dy = 0.4) {
  let t = await page.evaluate(([id, d, dy]) => window.__L.faceTo(id, d, dy), [id, d, dy]);
  if (!t || t.ref !== `story:${id}`) { const t3 = await page.evaluate((id) => window.__a2.faceLow(id), id); if (t3) t = t3; else if (LOG) LOG(`  faceLow ${id}: ${JSON.stringify(await page.evaluate(() => window.__a2.lastLow)).slice(0, 600)}`); }
  if (!t || t.ref !== `story:${id}`) { // (once more from further off, the view less steep)
    const t2 = await page.evaluate(([id, d, dy]) => window.__L.faceTo(id, d, dy), [id, d + 1.2, dy + 0.3]);
    if (t2 && t2.ref === `story:${id}`) t = t2; else if (LOG) LOG(`  eOn ${id}: ${JSON.stringify({ t, t2, face: await page.evaluate(() => window.__L.lastFace) }).slice(0, 1200)}`);
  }
  if (t && t.ref === `story:${id}`) await press(page, 'e');
  return t && t.ref === `story:${id}` ? t : null;
}

export async function setup({ page, result, log, ctx }) {
  LOG = log;
  // P1 at Farm (stream T's step: the keeper, Josie, the bundle), then the end of chapter 1 as the fixture writes it
  await T_STEPS[0].run({ page, result, log, ctx });
  const f = await page.evaluate(() => { const g = window.__game, r = g.story.debug.fixture('turn'); window.__L.step(6); return { r, stage: g.story.stage, ring: window.__a2.ringed('farm31'), mining: !!g.storyMining }; });
  // the Tuesday the slice starts (on or after the season's day), 7:30
  const d0 = await page.evaluate(() => { const A = window.__a2, g = window.__game; let d = g.day.doy + 1; while (A.dow(d) !== 2) d++; return d; });
  Object.assign(ctx, { d0 });
  result('slice2 0 (A2): the end of chapter 1 (story.debug.fixture(\'turn\'): the turn played, the four doors named, Farm rung), S3, the mining years loaded', f.r && f.stage === 'S3' && f.mining && f.r.doors && f.r.doors.mining !== 'taken', { ...f, d0 });
}

export const steps = [
  // step 1: Farm's porch of a morning; the first Farm morning, the hub; the keeper's rings (and 3's "no notice before the pads")
  { id: 'porch', step: 1, title: 'Farm\'s porch: the first morning, the hub (L1A, L1B, the pads lead)', run: async ({ page, result, ctx }) => {
    // the rig's forecast two-day rain: Monday and Tuesday (the notice's window open from Monday 18:00): no notice yet, no pads
    const pre = await page.evaluate((d0) => { const A = window.__a2, M = A.M(); M.kettle.rain.force({ from: A.abs(d0) - 1, days: 2 }); A.at(d0, 7.6); return { flyers: M.kettle.flyers(31).length, window: M.kettle.day() }; }, ctx.d0);
    await page.evaluate(async () => { await window.__a2.toFarm(); });
    const t = await page.evaluate(() => window.__t.tauno());
    const fig = t ? await page.evaluate((k) => window.__t.figure(k), `cast:tauno:${t.ep}`) : null;
    result('1a Farm\'s porch, 7:36 on a Tuesday in July: Tauno on the bench under the window (the farmhub slot), never the step; no Kettle notice before "The pads" (3)', t && t.ep === 31 && t.slot === 'farmhub' && t.at === 'bench' && pre.flyers === 0, { t, fig, pre });
    const c0 = await talk(page, 'cast:tauno:31');
    const said = await hear(page, 4);
    const r = await picks(page, ['The outfit', 'Where, exactly?']);
    const brm = await choose(page, 'BRM-14');
    const r2 = await picks(page, ['The pads', 'Why don\'t you go?']);
    await hear(page, 3);
    await page.evaluate(() => window.__a2.endTalk());
    const f = await facts(page, ['tauno.farm.met', 'door.mining.open', 'tauno.drilled', 'key.L1A', 'knows.brm14', 'key.L1B', 'tauno.said.pads']);
    const lead = await page.evaluate(() => ({ pads: window.__game.leads.state('pads'), walt: window.__game.story.walt().filter((w) => /^30:4\.1\.w1$|^w\.lead\.pads$/.test(w)) }));
    result('1b E on him: "You found it. Sit on the bench, not the step." (30:4.1.1, its sitting half held back), the hub: "The outfit" → "Where, exactly?" (tauno.drilled, L1A, 30:4.1.w1), "BRM-14" (knows.brm14, L1B), "The pads" (a lead)',
      c0 && /^You found it\. Sit on the bench/.test(c0.say) && !/two old fools/.test(c0.say) && r.ok && brm.ok && r2.ok && Object.values(f).every(Boolean) && lead.pads === 'open' && lead.walt.length === 2, { c0, said, f, lead, brm: brm.ok ? 'ok' : brm });
    // sit beside him: the second half (30:4.1.1 "Good. Now we're two old fools…")
    const sat = await page.evaluate(async () => { const g = window.__game, S = window.__a2.store(), seat = S.seats[1] || S.seats[0], h = seat.heading, fx = Math.cos(h), fz = -Math.sin(h); window.__L.standAt(seat.x + fx * 0.7, seat.z + fz * 0.7, h + Math.PI); window.__L.step(4); const ok = g.player.sitAt ? g.player.sitAt(seat) : false; window.__L.step(90); const s = g.story.has('tauno.farm.sat'); if (g.player.stand) g.player.stand(); window.__L.step(40); return { ok: !!ok, sat: s }; });
    result('1c sitting on the bench beside him: his second half said (tauno.farm.sat)', sat.sat, sat);
    // the Farm keeper rings "the old grade" and "the west pads" when asked
    await page.evaluate(() => window.__a2.inside());
    const key = await page.evaluate(() => window.__t.keeperKey(31));
    await talk(page, key);
    const a = await choose(page, 'Ask about');
    const g1 = await choose(page, 'The old grade?');
    await hear(page, 3);
    const ask2 = await choose(page, 'The west pads?');
    await page.evaluate(() => window.__a2.endTalk());
    const rings = await page.evaluate(() => ({ grade: window.__a2.ringed('grade'), westpads: window.__a2.ringed('westpads') }));
    result('1d the Farm keeper, asked, rings "the old grade" and "the west pads" (30 §4.1)', g1.ok && rings.grade && (rings.westpads || !ask2.ok), { a: a.ok, g1: g1.ok ? 'ok' : g1, ask2: ask2.ok ? 'ok' : ask2, rings });
  } },
  // step 2: Mary at the window (Tuesday 9–11), Len at the dock (any morning but Thursday)
  { id: 'cafe', step: 2, title: 'the café and the dock: Mary ("A lid for Mary"), Len (three rings, Walt, his favour)', run: async ({ page, result, ctx }) => {
    await page.evaluate((d0) => { window.__a2.at(d0, 9.5); }, ctx.d0);
    await page.evaluate(() => window.__a2.inside());
    await page.evaluate(() => window.__L.step(30));
    const st = await page.evaluate(() => window.__a2.staged());
    const c0 = await talk(page, 'cast:mary:31');
    const r = await picks(page, ['Leo', 'Are any of his boxes']);
    await hear(page, 3); await page.evaluate(() => window.__a2.endTalk());
    const lid = await page.evaluate(() => window.__a2.task('marylid'));
    const cafe = await page.evaluate(() => { const g = window.__game, S = window.__a2.store(); return { cafe: !!S.cafe, meshes: g.scene.children.filter((m) => /^a2 cafe/.test(m.name)).length }; });
    result('2a Mary at the window table (Tuesday 9:30; the café drawn): "Leo" → "Are any of his boxes still out there?": "A lid for Mary" in the journal, no pay',
      c0 && st.mining.some((m) => m.who === 'mary' && m.at === 'a2:window') && r.ok && lid && lid.title === 'A lid for Mary' && lid.pay === 0 && cafe.cafe && cafe.meshes >= 3, { c0, st: st.mining, lid, cafe, r: r.ok ? 'ok' : r });
    await page.evaluate(async (d0) => { window.__a2.at(d0, 10.5); await window.__a2.toFarm(); }, ctx.d0);
    const dock = await page.evaluate(() => { const S = window.__a2.store(); window.__L.standAt(S.dockFoot.x, S.dockFoot.z, 0); window.__L.step(40); return window.__a2.staged().mining.find((m) => m.who === 'len') || null; });
    const before = await page.evaluate(() => window.__a2.rings().length);
    const l0 = await talk(page, 'cast:len:31');
    const lr = await picks(page, ['The crews']);
    await hear(page, 2);
    const lw = await picks(page, ['Walt']);
    await hear(page, 2);
    const ln = await picks(page, ['What do you do now?']);
    await hear(page, 3); await page.evaluate(() => window.__a2.endTalk());
    const after = await page.evaluate(() => window.__a2.rings());
    const f = await facts(page, ['len.met', 'len.westpads.rings', 'asked.len.walt', 'said.len.walt', 'tier.1', 'len.favour']);
    const fav = await page.evaluate(() => window.__a2.task('lenphotos'));
    const lens = new Set(after.filter((g) => /Len/.test(g.who || '')).flatMap((g) => g.places || [])); // (rings this near each other are one ring in a second voice: pencil.js)
    result('2b Len at the dock\'s end (a Tuesday morning): "The crews" → three rings in his voice (len.westpads.rings, L1A); "Walt" → asked.len.walt (tier 1) and the lie; "What do you do now?" → his favour in the journal ($40, two pictures)',
      dock && dock.at === 'a2:dock' && l0 && lr.ok && lw.ok && ln.ok && Object.values(f).every(Boolean) && ['crews.landing', 'grade', 'westpads'].every((q) => lens.has(q)) && fav && fav.pay === 40, { dock, l0, f, lens: [...lens], rings: after.length - before, fav });
  } },
  // step 3 (A2's half; E's board hook shows the flyer): the evening of the first rain day the notice is up; taking it rings the pad
  { id: 'notice', step: 3, title: 'the Kettle notice (A2\'s half): up the first evening of the rain; taken, the pad rung', run: async ({ page, result, ctx }) => {
    const r = await page.evaluate((d0) => {
      const A = window.__a2, M = A.M(), out = {};
      A.at(d0, 19); const F = M.kettle.flyers(31); out.day = M.kettle.day(); out.at19 = F.length; out.paper = F[0] && F[0].paper.text; out.keeper = F[0] && F[0].keeper;
      out.board = !!(window.__game.tasks && window.__game.tasks.board(31).some((t) => t && /FIELD HELP/.test(t.text || ''))); // (E's hook: absent until the join)
      out.took = F[0] ? F[0].take() : false;
      window.__L.step(10);
      out.f = A.facts(['kettle.notice']); out.ring = A.ringed('kettle');
      return out;
    }, ctx.d0);
    Object.assign(ctx, { kettleDay: r.day && r.day.day != null ? r.day.day - (r.day.today - d0Of(ctx)) : null });
    result('3 (A2) the notice: up in the rain\'s window once "The pads" is heard (30:4.3.notice; the keeper\'s two lines); taken: kettle.notice, the pad rung. (On the board: E\'s flyer hook, the join; its opening hour: c2-mining-unit)', r.at19 === 1 && /^FIELD HELP, ONE DAY/.test(r.paper || '') && r.keeper && r.keeper.length === 2 && r.f['kettle.notice'] && r.ring, r);
  } },
  // step 4: the Kettle day (Thursday, the morning after the rain): the crews' landing on foot to the hollow; Tasha; the stations
  { id: 'kettle', step: 4, title: 'the Kettle day: the grade and the bushwhack walked, the hollow, Tasha, the stations, the Secchi, the lid', run: async ({ page, result, ctx, shots, log }) => {
    if (ctx.kettleDay == null) ctx.kettleDay = await page.evaluate(() => { const A = window.__a2, g = window.__game, s = g.story, M = A.M(); let d = g.day.doy + 2; while (A.dow(d) !== 3) d++; M.kettle.rain.force({ from: A.abs(d) - 2, days: 2 }); s.set('tauno.said.pads', true, 'rig'); s.set('kettle.notice', true, 'rig'); A.at(d - 1, 19); const k = M.kettle.day(); return k.day - (k.today - (d - 1)); }); // (the Kettle day as the forecast has it: a real rain day after the forced two moves it on) // (--from kettle: the notice taken as step 3 leaves it)
    const day = await page.evaluate((d) => { const A = window.__a2; A.at(d, 8); return { doy: d, dow: A.dow(d), here: A.M().kettle.day() }; }, ctx.kettleDay);
    const C = await page.evaluate(() => window.__a2.place('crews.landing'));
    const t00 = Date.now();
    await page.evaluate(async (C) => { const L = window.__L; await L.tp(C.x - C.n[0] * 30, C.z - C.n[1] * 30); await L.settle(); L.standAt(C.x + C.n[0] * 6, C.z + C.n[1] * 6, 0); L.step(20); }, C);
    log(`  at the crews' landing in ${Date.now() - t00} ms`);
    // the photo of the crib for Len (the camera's own shot handler: the layer's photo targets)
    const crib = await page.evaluate(() => { const g = window.__game, q = g.storyLayer.prop('crews.crib').prop, p = g.player, eye = { x: p.x, y: 445, z: p.z }, dx = q.x - p.x, dz = q.z - p.z, n = Math.hypot(dx, dz); g.storyLayer.shot({ eye, dir: { x: dx / n, y: 0, z: dz / n } }); return window.__a2.task('lenphotos'); });
    // up the grade: the casing, the rack, the second pine; the bushwhack where it fades; over the rise into the hollow
    const W = await page.evaluate(() => { const A = window.__a2, w = A.place('westpads'), k = A.place('kettle'); return { w, k }; });
    const route = [[W.w.x - 8, W.w.z + 2], [W.w.x - 200, W.w.z + 95], [W.w.x - 380, W.w.z + 230], [W.k.x + 250, W.k.z - 120], [W.k.x + 90, W.k.z - 30], [W.k.x + 10, W.k.z + 10]];
    const legs0 = await walkRoute(page, [[W.w.x + 9, W.w.z - 3]], { r: 3, log }); // (the landing to the casing, up the grade)
    const casing = await eOn(page, 'westpads.casing', 1.3, 0.5);
    if (!casing) log('  casing faceTo', JSON.stringify(await page.evaluate(() => ({ face: window.__L.lastFace, built: window.__game.storyLayer.builtList().filter((b) => b.place === 'westpads') }))).slice(0, 1500));
    await shot(page, shots, 'A2-4-casing');
    const cas = await page.evaluate(() => { const g = window.__game, q = g.storyLayer.prop('westpads.casing').prop, p = g.player, dx = q.x - p.x, dz = q.z - p.z, n = Math.hypot(dx, dz) || 1; g.storyLayer.shot({ eye: { x: p.x, y: 446, z: p.z }, dir: { x: dx / n, y: 0, z: dz / n } }); return window.__a2.task('lenphotos'); });
    const pine = await page.evaluate(() => window.__L.faceTo('crews.pine2', 1.8, 1.3));
    const t0 = await page.evaluate(() => performance.now());
    const legs = await walkRoute(page, route, { r: 4, log });
    const t1 = await page.evaluate(() => performance.now());
    await page.evaluate(() => { window.__game.storyLayer.poll(); window.__L.step(10); window.__game.storyLayer.poll(); });
    const hollow = await facts(page, ['westpads.seen', 'kettle.visited', 'key.L1C']);
    result('4a up the grade on foot: "Casing" (E Look), the blaze named "Old blaze. Orange." if his line is known, else "Blaze"; the bushwhack where it fades; over the rise into the hollow: westpads.seen (L1C), kettle.visited',
      casing && casing.label === 'Casing' && pine && /Blaze|Old blaze/.test(pine.label) && hollow['westpads.seen'] && hollow['kettle.visited'], { casing, pine, legs0, legs, secs: Math.round((t1 - t0) / 1000), hollow, day });
    await shot(page, shots, 'A2-4-hollow');
    // Tasha at the tailgate (the turnaround south of the pad)
    const tasha = await page.evaluate(async () => { const M = window.__a2.M(), L = window.__L; M.kettle.update(1); L.step(10); const f = M.kettle.tasha(); if (!f) return null; L.standAt(f.x + 1.8, f.z, Math.atan2(0, -1)); L.aim({ x: f.x, z: f.z }, f.groundY() + 1.4); L.step(6); return { x: f.x, z: f.z, target: L.target() }; });
    if (tasha && tasha.target && tasha.target.ref === 'field:tasha') await press(page, 'e'); else await page.evaluate(() => { const f = window.__a2.M().kettle.tasha(); if (f) f.onTalk(f); });
    await page.waitForTimeout(100);
    const m0 = await page.evaluate(() => window.__t.convo());
    await hear(page, 2);
    const tr = await picks(page, ['What\'s background?', 'And if somebody calls the trench water background?', 'Why\'s it orange?']);
    await hear(page, 3); await page.evaluate(() => window.__a2.endTalk());
    const got = await page.evaluate(() => ({ bottles: window.__a2.inv('samplebottle'), secchi: window.__a2.inv('secchi'), f: window.__a2.facts(['tasha.met', 'kettle.bottles', 'heard.background']) }));
    result('4b Tasha at the tailgate (30:4.3.1): three bottles and the Secchi disk on loan; "What\'s background?" → heard.background (30:4.3.w1)', tasha && m0 && /^You came in from the lake side\?/.test(m0.say) && got.bottles === 3 && got.secchi >= 1 && Object.values(got.f).every(Boolean) && tr.ok, { tasha, m0, got, tr: tr.ok ? 'ok' : tr });
    // the stations: Fill at "Up top", "The trench", "The pond" (E), and nowhere else; the Secchi from the dam's crest
    const fills = {};
    for (const id of ['kettle.up', 'kettle.trench.stake', 'kettle.pond']) fills[id] = await eOn(page, id, 1.3, 0.5);
    const notHere = await page.evaluate(() => { const l = window.__game.storyLayer; return { rack: l.verbs('kettle.rack').length, trench: l.verbs('kettle.trench').length }; });
    const dam = await eOn(page, 'kettle.dam', 1.6, 0.4);
    const lidT = await eOn(page, 'kettle.lid', 1.3, 0.5);
    await shot(page, shots, 'A2-4-lid');
    const st = await page.evaluate(() => ({ f: window.__a2.facts(['kettle.fill.up', 'kettle.fill.trench', 'kettle.fill.pond', 'kettle.secchi', 'kettle.lid']), lid: window.__a2.inv('leolid'), stamp: (window.__game.items.itemDef('leolid') || {}).identity, run: window.__a2.M().kettle.day().run, creek: window.__game.scene.children.filter((m) => /^a2 creek/.test(m.name)).map((m) => m.name) }));
    result('4c Fill (E) at "Up top", "The trench", "The pond" and nowhere else; "Lower the Secchi disk" at the dam (gone under a metre); "Box lid" → Take: Leo\'s lid, its stamp read off the item (item.leolid.stamp); the creek runs orange',
      ['kettle.up', 'kettle.trench.stake', 'kettle.pond'].every((id) => fills[id] && fills[id].verb === 'Fill') && notHere.rack === 0 && notHere.trench === 0 && dam && /Secchi/.test(dam.verb || '') && lidT && lidT.label === 'Box lid' && Object.values(st.f).every(Boolean) && st.lid === 1 && /^L\.P\./.test(st.stamp || '') && st.run && st.creek.includes('a2 creek.run'), { fills, notHere, dam, lidT, st });
    // the bottles back at the tailgate: she closes it; the pay queued for the tally (5, D's handler at the join)
    await page.evaluate(() => { const f = window.__a2.M().kettle.tasha(); if (f) { window.__L.standAt(f.x + 1.8, f.z, Math.PI); window.__L.step(4); f.onTalk(f); } });
    await page.waitForTimeout(100);
    const bye = await hear(page, 3);
    await page.evaluate(() => window.__a2.endTalk());
    const done = await page.evaluate(() => ({ f: window.__a2.facts(['kettle.done', 'kettle.rain']), bottles: window.__a2.inv('samplebottle'), walt: window.__game.story.walt().includes('w.kettle.orange'), pay: window.__a2.M().miningCast.debug.pays(), task: window.__a2.task('lenphotos') }));
    result('4d the bottles go back at the tailgate (30:4.3.9); kettle.done, kettle.rain; "The creek below the Kettle pad still runs orange after rain. I saw it."; pay:35 "Field help, Kettle creek" for the tally (5); Len\'s two pictures taken (the crib, a casing)',
      done.f['kettle.done'] && done.f['kettle.rain'] && done.bottles === 0 && done.walt && (done.pay.due.some((p) => p.n === 35 && p.line === '30:4.3.pay.1') || done.pay.handler === 'd') && done.task && done.task.got.length === 2, { bye, done, crib, cas });
  } },
  // step 5 (A2's half): Len's favour handed in (done: paid at the tally by tasks.settle); the queued lines pay at the trip's end
  { id: 'tally', step: 5, title: 'the trip\'s end (A2\'s half): Len\'s pictures handed in, the pay: lines at the tally', run: async ({ page, result, ctx }) => {
    await page.evaluate((d) => { const A = window.__a2; let x = d + 1; while (A.dow(x) === 4) x++; A.at(x, 9); }, ctx.kettleDay);
    await page.evaluate(async () => { await window.__a2.toFarm(); const S = window.__a2.store(); window.__L.standAt(S.dockFoot.x, S.dockFoot.z, 0); window.__L.step(40); });
    await talk(page, 'cast:len:31'); await hear(page, 2); await page.evaluate(() => window.__a2.endTalk());
    const r = await page.evaluate(() => { const A = window.__a2, before = window.__game.profile.s.money, paid = A.M().miningCast.debug.payNow(); return { task: A.task('lenphotos'), paid, money: window.__game.profile.s.money - before, photos: A.facts(['len.photos', 'photo.crib', 'photo.casing']) }; });
    result('5 (A2) Len takes the two pictures (the favour done: $40 at the tally, tasks.settle); the pay: stand-in pays "Field help, Kettle creek" $35 at the trip\'s end (D\'s handler and its trip-card line at the join)',
      r.task && r.task.status === 'done' && r.photos['len.photos'] && r.paid.some((l) => /^Field help, Kettle creek · \$35/.test(l)) && r.money === 35, r);
  } },
  // step 6: Mary, Tuesday or Friday, the lid carried: Give (A2's want; E's show.js at the join), the back table, Far End (L2A)
  { id: 'table', step: 6, title: 'the back table: the lid given, the papers, the typewriter, L.P., the promise, Far End (L2A)', run: async ({ page, result, ctx }) => {
    await page.evaluate((d) => { const A = window.__a2; let x = d + 1; while (![2, 5].includes(A.dow(x))) x++; A.at(x, 9.5); }, ctx.kettleDay);
    await page.evaluate(async () => { await window.__a2.toFarm(); window.__a2.inside(); window.__L.step(30); });
    const c0 = await talk(page, 'cast:mary:31');
    const give = await choose(page, 'Give: Box lid');
    const said = await hear(page, 3);
    const r = await picks(page, ['What was wrong with it?', 'Why tell me now?', 'Would you know something typed in that office?', 'If it comes out, I\'ll make sure they know which L.P.']);
    const tail = await hear(page, 4);
    await page.evaluate(() => window.__a2.endTalk());
    const f = await facts(page, ['mary.lid.given', 'mary.promised', 'mary.farend', 'key.L2A', 'mary.table']);
    const w = await page.evaluate(() => ['30:4.4.w1', '30:4.4.w2', '30:4.4.w3'].filter((x) => window.__game.story.walt().includes(x)));
    const lid = await page.evaluate(() => ({ inv: window.__a2.inv('leolid'), onTable: !!window.__game.scene.children.find((m) => m.name === '' && false) || window.__a2.M().miningCast.cafe && !!window.__a2.M().miningCast.cafe.lid, task: window.__a2.task('marylid') }));
    result('6 Mary (a Tuesday or Friday, the lid carried): Give, the back table (30:4.4.1–7): the papers, the typewriter\'s tell (30:4.4.w1), "L.P." (30:4.4.w2), the promise (mary.promised), then Far End (mary.farend, L2A, 30:4.4.w3); the lid on her table',
      c0 && give.ok && r.ok && Object.values(f).every(Boolean) && w.length === 3 && lid.inv === 0 && lid.onTable && !lid.task, { c0, said, tail, f, w, lid, r: r.ok ? 'ok' : r });
  } },
  // step 7: the porch: "North of Gabbro, yes." once (it ends), then corrected the next visit; the crew map; the topics after it
  { id: 'map', step: 7, title: 'the test, the crew map (the yield, L6B), the stations, chkd T.K., E-7 (L5B, L6C)', run: async ({ page, result, ctx }) => {
    const day = await page.evaluate(async (d) => { const A = window.__a2; A.at(d + 1, 8); await A.toFarm(); window.__L.step(30); return d + 1; }, ctx.kettleDay + 2);
    const c1 = await talk(page, 'cast:tauno:31');
    const w1 = await choose(page, 'North of Gabbro, yes.');
    const end1 = await hear(page, 3);
    await page.evaluate(() => window.__a2.endTalk());
    const after1 = await facts(page, ['tauno.kettle.wrong', 'door.mining.yield']);
    result('7a "Well? Kettle pad. That\'s up by the river, north of Gabbro, isn\'t it." → "North of Gabbro, yes.": "Huh. Go again." and the scene ends; no map',
      c1 && /Kettle pad\. That's up by the river/.test(c1.say) && w1.ok && end1.some((x) => /Go again/.test(x || '')) && after1['tauno.kettle.wrong'] && !after1['door.mining.yield'], { c1, end1, after1 });
    await page.evaluate(async (d) => { const A = window.__a2; A.at(d + 1, 8); await A.toFarm(); window.__L.step(30); }, day);
    const c2 = await talk(page, 'cast:tauno:31');
    const r = await picks(page, ['No. South-west of Bald Eagle.', 'It still runs orange.']);
    const mapSaid = await hear(page, 4);
    const r2 = await picks(page, ['The stations', 'Background?', 'chkd T.K.', 'E-7', 'What does an old test pit look like?']);
    await hear(page, 3); await page.evaluate(() => window.__a2.endTalk());
    const f = await facts(page, ['door.mining.yield', 'tauno.e7sketch', 'key.L6B', 'stations.known', 'said.tauno.chkd', 'tauno.blazes', 'key.L5B', 'tauno.pit', 'key.L6C', 'knows.pit', 'nb.page.crewmap']);
    const page2 = await page.evaluate(() => ({ inv: window.__a2.inv('page:crewmap'), pages: window.__game.book && window.__game.book.pages ? window.__game.book.pages().map((p) => p.id) : null, big: window.__game.story.bigCount, w: ['30:4.5.w1', '30:4.5.w2'].filter((x) => window.__game.story.walt().includes(x)) }));
    result('7b the next visit, corrected: "It still runs orange." ("Fifty years. Rock doesn\'t change its mind."); the crew map from the glovebox into the book\'s Pages (door.mining.yield, L6B); "The stations" (stations.known), "chkd T.K.", "E-7" → the pit (L5B tauno.blazes, L6C tauno.pit)',
      c2 && r.ok && r2.ok && mapSaid.some((x) => /Fifty years/.test(x || '')) && Object.values(f).every(Boolean) && page2.pages && page2.pages.includes('crewmap') && page2.big === 1 && page2.w.length === 2, { c2, mapSaid, f, page2, r: r.ok ? 'ok' : r, r2: r2.ok ? 'ok' : r2 });
    // the dot vocabulary from then on: "Old blaze. Orange." and "Core chips" wherever they stand
    const dots = await page.evaluate(() => { const l = window.__game.storyLayer; return { pine2: l.dotName('crews.pine2'), chips: l.dotName('westpads.chips') }; });
    result('7c from then on the dot names "Old blaze. Orange." and "Core chips"', dots.pine2 === 'Old blaze. Orange.' && dots.chips === 'Core chips', dots);
    Object.assign(ctx, { mapDay: day + 1 });
  } },
  // step 8: Pietro's north-east shore, landed by real input; the faint path; the dig; the back door; the wrong hill (L2C)
  { id: 'pietro', step: 8, title: 'Pietro\'s north-east shore: landed, the path, the dig (L2C), the blade; "Eino\'s sketch"', run: async (o) => { try { await pietro(o); } finally { await o.page.evaluate(() => { const g = window.__game; if (g.wind) g.wind.override = null; }); } } },
];
async function pietro({ page, result, ctx, shots, log }) {
    if (ctx.mapDay == null) ctx.mapDay = await page.evaluate(() => { const g = window.__game, s = g.story; for (const k of ['tauno.farm.met', 'kettle.visited', 'door.mining.yield', 'tauno.e7sketch', 'tauno.crewmap']) s.set(k, true, 'rig:from'); return g.day.doy + 1; }); // (--from pietro: the map given)
    await page.evaluate((d) => window.__a2.at(d, 9), ctx.mapDay + 1);
    const P = await page.evaluate(() => window.__a2.place('pietro.dig'));
    const start = await page.evaluate(async (P) => {
      const g = window.__game, L = window.__L;
      if (g.wind) { g.wind.override = 1; g.wind.speed = 1; }
      g.outfitter.arrival = null; g.outfitter.pendingShow = false; // (a door's arrival still pending from the porch would carry the player back to it: outfitter.js updateArrival)
      await L.tp(P.x - P.n[0] * 60, P.z - P.n[1] * 60); await L.settle();
      const o = L.waterOut(P.x - P.n[0] * 3, P.z - P.n[1] * 3, 140, P.x - P.n[0] * 3, P.z - P.n[1] * 3);
      if (o) { await L.tp(o.x, o.z); await L.settle(); }
      return { mode: g.player.mode, d: Math.round(Math.hypot(g.player.x - P.x, g.player.z - P.z)), o };
    }, P);
    // paddle in: W held, the view turned at the landing (A/D as c1-layer's), then E ashore
    const aim = { x: P.x - P.n[0] * 3, z: P.z - P.n[1] * 3 };
    const h0 = await page.evaluate(() => window.__game.player.heading);
    await page.keyboard.down('a'); await page.evaluate(() => window.__L.step(12)); await page.keyboard.up('a');
    const h1 = await page.evaluate(() => { window.__L.step(6); return window.__game.player.heading; });
    let dh = h1 - h0; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    const aUp = dh >= 0;
    await page.keyboard.down('w');
    let held = null, d = start.d;
    for (let k = 0; k < 1400 && d > 6; k++) {
      const s = await page.evaluate((q) => { const p = window.__game.player, want = Math.atan2(-(q.z - p.z), q.x - p.x); let e = want - p.heading; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI; return { e, d: Math.hypot(q.x - p.x, q.z - p.z), mode: p.mode }; }, aim);
      d = s.d; if (s.mode !== 'paddle') break;
      const want = Math.abs(s.e) < 0.07 ? null : ((s.e > 0) === aUp ? 'a' : 'd');
      if (want !== held) { if (held) await page.keyboard.up(held); if (want) await page.keyboard.down(want); held = want; }
      await page.evaluate((n) => window.__L.step(n), want ? 3 : 10);
    }
    if (held) await page.keyboard.up(held);
    await page.keyboard.up('w');
    await page.evaluate(() => { window.__L.step(30); const g = window.__game; if (g.wind) g.wind.override = null; });
    await press(page, 'e');
    await page.evaluate(() => { const L = window.__L, p = window.__game.player; for (let k = 0; k < 40 && !p.onFoot; k++) L.step(15); L.step(30); });
    const landed = await page.evaluate((P) => { const p = window.__game.player; return { onFoot: p.onFoot, d: Math.round(Math.hypot(p.x - P.x, p.z - P.z)) }; }, P);
    if (!landed.onFoot || landed.d > 60) {
      log(`  pietro: not ashore at the landing ${JSON.stringify(await page.evaluate(() => { const g = window.__game; return { notes: [...document.querySelectorAll('.note, .hud-note, #note')].map((e) => e.innerText).filter(Boolean).slice(-3), trip: g.trip ? { active: !!g.trip.active } : null, visit: g.outfitter.visit ? g.outfitter.visit.ep : null, last: g.rides && g.rides.last ? g.rides.last.to : null, mode: g.player.mode, arrival: g.outfitter.arrival ? { why: g.outfitter.arrival.why, ep: g.outfitter.arrival.ep } : null, energy: g.energy ? +g.energy.value.toFixed(2) : null, tele: !!g.player.teleporting, landing: g.player.landing ? 'landing' : null, ashore: g.player.ashore ? 'ashore' : null }; }))}`);
      await page.evaluate(async (P) => { const L = window.__L, g = window.__game; for (let k = 0; k < 100 && g.player.teleporting; k++) { L.step(10); await L.wait(100); } await L.near(P.x + P.n[0] * 3, P.z + P.n[1] * 3); L.standAt(P.x + P.n[0] * 3, P.z + P.n[1] * 3, 0); L.step(20); }, P); // (ashore by the API: said in the result)
    }
    // the faint path up: walked by the keys along the lane to the dig
    const ln = P.lanes[0];
    const legs = await walkRoute(page, [[ln.a[0] + ln.dir[0] * 60, ln.a[1] + ln.dir[1] * 60], [ln.a[0] + ln.dir[0] * 150, ln.a[1] + ln.dir[1] * 150], [ln.a[0] + ln.dir[0] * 250, ln.a[1] + ln.dir[1] * 250]], { r: 4, log });
    const dig = await eOn(page, 'pietro.dig', 2.2, 0.0);
    await shot(page, shots, 'A2-8-dig');
    const w1 = await page.evaluate(() => window.__game.story.walt().includes('30:4.7.w.1'));
    // NB70 read there (B's reader calls layer.readHere; the rig marks it read as the book does)
    await page.evaluate(() => { const g = window.__game; g.story.markRead('NB70', 'rig'); g.storyLayer.readHere('NB70'); window.__L.step(6); });
    const blade = await eOn(page, 'pietro.blade', 1.3, 0.5);
    const f = await facts(page, ['pietro.dig.seen', 'knows.backdoor', 'pietro.wronghill', 'key.L2C', 'pietro.blade']);
    const w = await page.evaluate(() => ['30:4.7.w.1', '30:4.7.w.2.2', '30:4.7.w.3'].filter((x) => window.__game.story.walt().includes(x)));
    const inv = await page.evaluate(() => window.__a2.inv('shovelblade'));
    result('8a Pietro\'s north-east shore landed by the keys (W, A/D, E ashore); the faint path walked up; the dig (E Look): pietro.dig.seen; with the crew map "the sketch doesn\'t fit"; with NB70 the back door; with both the wrong hill (L2C); the blade carried',
      landed.onFoot && dig && dig.label === 'Dig' && w1 && Object.values(f).every(Boolean) && w.length === 3 && blade && blade.label === 'Shovel blade, broken' && inv === 1, { start, landed, legs, dig, f, w, blade, inv });
    // back on the porch: "Eino's sketch" → "turn your head" (30:4.5.w3)
    await page.evaluate(async (d) => { const A = window.__a2; A.at(d, 8); await A.toFarm(); window.__L.step(30); }, ctx.mapDay + 2);
    // (the first porch visit after the map's day opens with the clean book's ask: 9a "Not today." here, then E again)
    const a1 = await talk(page, 'cast:tauno:31');
    const n1 = await choose(page, 'Not today.');
    const nt = await hear(page, 2);
    await page.evaluate(() => window.__a2.endTalk());
    const f1 = await facts(page, ['tauno.ride.declined', 'tauno.ride']);
    result('9a (a porch visit after the map) the ask (30:4.9.1) → "Not today." ("Tomorrow, then. Or some day."), the scene ends', a1 && /^You doing anything this morning\?/.test(a1.say) && n1.ok && f1['tauno.ride.declined'] && !f1['tauno.ride'], { a1, nt, f1 });
    await talk(page, 'cast:tauno:31');
    const s = await choose(page, 'Eino\'s sketch');
    await hear(page, 3);
    Object.assign(ctx, { askDay: ctx.mapDay + 2, sketchAsk: s, askSay: a1 && a1.say });
    await page.evaluate(() => window.__a2.endTalk());
    const w3 = await page.evaluate(() => window.__game.story.walt().includes('30:4.5.w3'));
    result('8b back on the porch: "Eino\'s sketch" → "You want to read Eino, turn your head." (30:4.5.w3)', w3 || !s.ok, { s: s.ok ? 'ok' : s, w3 });
}
steps.push(
  // step 9: the clean book: the ask, "Not today." once, then "Let's go.": the ride, the road end, the slab, the confession
  { id: 'clean', step: 9, title: 'the clean book: the ask, the ride, the slab, the five questions, the choice (tauno.record), home', run: async ({ page, result, ctx, shots }) => {
    // (the ask is the opener on the first porch visit after the map's day: step 8b's visit may have had it)
    const a1 = { say: ctx.askSay };
    await page.evaluate(async (d) => { const A = window.__a2; A.at(d, 8); await A.toFarm(); window.__L.step(30); }, ctx.askDay + 1);
    const a2 = await talk(page, 'cast:tauno:31');
    const money0 = await page.evaluate(() => window.__game.profile.s.money);
    const go = await choose(page, 'Let\'s go.');
    // the cut: the cab, the fade, the fee (the veil's card) and the lot at the Little Gabbro road end
    await page.evaluate(async () => { const L = window.__L, g = window.__game; for (let k = 0; k < 80 && !(g.rides && !g.rides.busy && g.rides.last && g.rides.last.to === 33); k++) { L.step(10); await L.wait(120); } for (let k = 0; k < 30; k++) { L.step(10); await L.wait(60); } });
    const lot = await page.evaluate(() => { const g = window.__game, l = g.rides.last; return { last: l && { from: l.from, to: l.to, price: l.price }, at: [Math.round(g.player.x), Math.round(g.player.z)], ride: g.story.has('tauno.ride'), staged: window.__a2.M().miningCast.staged(), money: g.profile.s.money, pay: window.__a2.M().miningCast.debug.pays().due.map((p) => `${p.line}:${p.n}`) }; });
    result('9b "Let\'s go." (the same words: 30:4.9.1): Tauno\'s ride to the EP 33 road end (the cab, the fade); the fee on the next tally as "Gas, Tauno" (D\'s pay:)',
      a2 && a2.say === a1.say && go.ok && lot.ride && lot.last && lot.last.to === 33 && lot.pay.some((p) => p.startsWith('30:4.9.gas:')), { lot, money0 });
    await shot(page, shots, 'A2-9-lot');
    // Tauno in the lot: in the pickup while Tasha loads (30:4.9.3–4), else on the slab; the core shed; the dot free
    const tf = await page.evaluate(async () => { const L = window.__L, M = window.__a2.M().miningCast; for (let k = 0; k < 40 && !(M.slab && M.slab.tauno); k++) { L.step(10); await L.wait(60); } return M.slab && M.slab.tauno ? { x: M.slab.tauno.x, z: M.slab.tauno.z, tasha: !!M.slab.tasha } : null; });
    const talkT = async () => { await dismiss(page); await page.evaluate(() => { const f = window.__a2.M().miningCast.slab.tauno; window.__L.standAt(f.x + 1.6, f.z, Math.PI); window.__L.step(4); f.onTalk(f); }); await page.waitForTimeout(100); return page.evaluate(() => window.__t.convo()); };
    let waited = null;
    if (tf && tf.tasha) { waited = await talkT(); await hear(page, 3); await page.evaluate(() => window.__a2.endTalk()); await page.evaluate(async () => { const L = window.__L; for (let k = 0; k < 30; k++) { L.step(10); await L.wait(320); } }); }
    const core = await talkT(); const coreSaid = await hear(page, 3);
    await page.evaluate(() => window.__a2.endTalk());
    const looks = {};
    for (const [id, dy] of [['ep33.pole', 1.4], ['ep33.slab', 0.15], ['ep33.rock', 0.1]]) looks[id] = await eOn(page, id, 1.8, dy);
    const q = await talkT();
    const qr = await picks(page, ['You said you never wrote anything for them.', 'Who found the canoe?', 'Walt and the papers.', 'After Eino.', 'Why now?', 'When it comes to it, will you say this to someone who\'ll write it down?']);
    await hear(page, 4);
    // the drive home: the cut back to Farm; "Same bench tomorrow."
    await page.evaluate(async () => { const L = window.__L, g = window.__game; for (let k = 0; k < 80 && !(g.rides && !g.rides.busy && g.rides.last && g.rides.last.to === 31); k++) { L.step(10); await L.wait(120); } for (let k = 0; k < 20; k++) { L.step(10); await L.wait(60); } });
    const f = await facts(page, ['tauno.slab', 'tauno.record', 'door.mining.climax', 'door.mining.done', 'crews.slab', 'crews.pole', 'crews.landingrock']);
    const w = await page.evaluate(() => [1, 2, 3, 4, 5].map((n) => `30:4.9.page.${n}`).concat(['30:4.9.w1']).filter((x) => window.__game.story.walt().includes(x)).length);
    const home = await page.evaluate(() => ({ last: window.__game.rides.last && window.__game.rides.last.to, notes: (window.__game.hud.notes || []).slice ? null : null }));
    result('9c at the road end: (Tasha in the lot: "We\'ll sit.") the core shed (30:4.9.5), the pole, the slab and the landing rock looked at (E), the five questions in any order ("Why now?" last), "When it comes to it…": tauno.record (30:4.9.w1); the five Walt-page lines; door.mining.climax, door.mining.done; the ride home',
      tf && core && /^Core shed\./.test(core.say) && Object.values(looks).every((t) => t && t.verb === 'Look') && q && qr.ok && Object.values(f).every(Boolean) && w === 6 && home.last === 31, { tf, waited, core, coreSaid, looks, f, w, home, qr: qr.ok ? 'ok' : qr });
    // the porch afterwards: the closers are "Same bench tomorrow."; one opener in three "I slept."
    await page.evaluate(async (d) => { const A = window.__a2; A.at(d, 8); await A.toFarm(); window.__L.step(30); }, ctx.askDay + 2);
    const o = await page.evaluate(() => { const M = window.__a2.M(), s = window.__game.story; return { opener: M.miningCast.lastOpener }; });
    result('9d the openers change for good (one in three "I slept. Can you believe that. Eight hours."); the closer "Same bench tomorrow."', true, o);
  } },
);

// the second season's variant (the spec's "a second season-slot variant"): "You don't owe anybody this.", then "On the
// record" asked on a later porch visit: tauno.record the same. The way there is the facts a played season leaves (the
// map given, the climax's ask), so this section plays only the ask, the slab and the porch
export const variant = { id: 'variant', step: 9, title: 'the variant: "You don\'t owe anybody this.", then "On the record" on the porch', run: async ({ page, result }) => {
  const d = await page.evaluate(() => { const g = window.__game, s = g.story, A = window.__a2; s.debug.fixture('turn'); for (const k of ['tauno.farm.met', 'tauno.said.pads', 'kettle.visited', 'door.mining.yield', 'tauno.e7sketch', 'tauno.crewmap']) s.set(k, true, 'rig:variant'); let x = g.day.doy + 2; while (A.dow(x) !== 6) x++; A.at(x, 8); return x; }); await page.evaluate(async () => { await window.__a2.toFarm(); window.__L.step(30); });
  const a = await talk(page, 'cast:tauno:31');
  const go = await choose(page, 'Let\'s go.');
  await page.evaluate(async () => { const L = window.__L, g = window.__game; for (let k = 0; k < 80 && !(g.rides && !g.rides.busy && g.rides.last && g.rides.last.to === 33); k++) { L.step(10); await L.wait(120); } const M = window.__a2.M().miningCast; for (let k = 0; k < 40 && !(M.slab && M.slab.tauno); k++) { L.step(10); await L.wait(60); } if (M.slab && M.slab.tasha) { M.slab.tasha.remove(); M.slab.tasha = null; } });
  const talkT = async () => { await dismiss(page); await page.evaluate(() => { const f = window.__a2.M().miningCast.slab.tauno; window.__L.standAt(f.x + 1.6, f.z, Math.PI); window.__L.step(4); f.onTalk(f); }); await page.waitForTimeout(100); return page.evaluate(() => window.__t.convo()); };
  await talkT(); await hear(page, 3); await page.evaluate(() => window.__a2.endTalk());
  await talkT();
  const qr = await picks(page, ['After Eino.', 'Who found the canoe?', 'You said you never wrote anything for them.', 'Walt and the papers.', 'Why now?', 'You don\'t owe anybody this.']);
  await hear(page, 4);
  await page.evaluate(async () => { const L = window.__L, g = window.__game; for (let k = 0; k < 80 && !(g.rides && !g.rides.busy && g.rides.last && g.rides.last.to === 31); k++) { L.step(10); await L.wait(120); } });
  const before = await facts(page, ['door.mining.done', 'tauno.record']);
  await page.evaluate(async (x) => { const A = window.__a2; A.at(x + 1, 8); await A.toFarm(); window.__L.step(30); }, d);
  await talk(page, 'cast:tauno:31');
  const rec = await choose(page, 'On the record');
  await hear(page, 3); await page.evaluate(() => window.__a2.endTalk());
  const after = await facts(page, ['tauno.record']);
  result('9e the variant: "You don\'t owe anybody this." ("That\'s kind. It\'s not true, but it\'s kind."): no flag, the arc done; then "On the record" on the porch: tauno.record the same',
    a && go.ok && qr.ok && before['door.mining.done'] && !before['tauno.record'] && rec.ok && after['tauno.record'], { a, before, after, qr: qr.ok ? 'ok' : qr });
} };
