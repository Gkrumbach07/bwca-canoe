// Stream D's part of the Round 2 --slice2 rig (docs/build/campaign-design.md Part 4 Round 2, "The second playable slice,
// exactly": steps 10 and 11 are D's; D's halves of the join items 5 (with A2) and 14 (with E)), and the director's
// checks for --ignore (two seasons: fallback lore within its rate, no Walt lore before nb.found).
//
//   import { HELPERS_D, steps, ignoreDays, STUBS } from './slice/c2-director.mjs'
//   await page.evaluate(HELPERS_D)           window.__d: beats(), state(), turn(), trip(ep), endTrip(ep), setDay(abs, h),
//                                            camps(near), findCamp(o), meet(partyId), evening(), wordAt(ep)
//   for (const s of steps) await s.run({ page, result, log, ctx })   each { id, step, title, run }; ctx: { home }
//   await ignoreDays(page, { result, log, days, tag })   (story-slice --ignore: the director's rate on a season ignored)
//
// The stubs this part stands in for until the join (each named where it is used, and swapped by the join):
//   STUBS.episodes   E's episodes.places() where no runner is in (the join: story.episodes is E's runner; this is unused there)
//   STUBS.a2pay      A2's `pay:` ("Field help, Kettle creek" $35, "Gas, Tauno") and its card line, by story.action
//   STUBS.testArc    the test arc's climax record (the boys: Bob, 70.6.3.3), registered beside mining's
// Travel between places is a teleport (the chase snapped: __L.tp-style), as the slice says; a party is met as the game
// meets one: the player paddles in from 50 m off and the camp's own greeting says the line (party-camps.js).
export const STUBS = {
  episodes: { id: 'S5', place: 'kek.plane', line: '70.6.1.9' }, // (a stand-in open episode with no window: S7's own rumour, 70.6.1.11, holds only in May–June)
  a2pay: [{ pay: '35 Field help, Kettle creek', rule: 'a2.kettle.pay(stub)' }, { pay: '0 Gas, Tauno', rule: 'a2.ride.gas(stub)' }],
  testArc: { arc: 'test', person: 'bob', rumour: [{ id: '70.6.3.3', eps: [38] }, { id: '70.8.3.5', ep: 38 }] },
};

export const HELPERS_D = () => {
  const g = window.__game, D = window.__d = {};
  const absOf = (y, d) => Math.round(Date.UTC(y, 0, d) / 86400000);
  D.beats = () => g.story.beats;
  D.step = (frames = 30) => { for (let left = frames; left > 0; left -= 200) g.step(1 / 30, Math.min(200, left)); };
  D.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  D.abs = () => absOf(g.day.year, g.day.doy);
  D.state = () => D.beats().debugState();
  D.tp = async (x, z) => { const ok = window.__L && window.__L.tp ? await window.__L.tp(x, z) : await g.player.teleport(x, z); if (ok && g.chase && g.chase.snap) g.chase.snap(); // (the join: L.tp, the chase snapped)
    for (let i = 0; i < 400 && g.player.teleporting; i++) { D.step(10); await D.wait(25); } D.step(10); return ok; };
  // the end of chapter 1 (the turn played), where no export of the Round 1 --slice season is kept: the fixture when the
  // join provides story.debug.fixture('turn'), else the facts the turn leaves (stage S3)
  D.turn = () => {
    const s = g.story;
    try { if (s.debug.fixtures && s.debug.fixtures.has('turn')) { s.debug.fixture('turn'); return 'fixture'; } } catch { /* the facts */ }
    if (!s.has('nb.found')) s.found({ abs: D.abs() });
    for (const k of ['bundle.taken', 'tauno.armed', 'tauno.porch.done', 'tauno.talk', 'tauno.said.t5', 'rehook.again', 'knows.walt', 'crews.seen', 'tauno.turn', 'tauno.doors', 'door.crews.taken', 'door.mining.named', 'door.guiding.named', 'door.boys.named', 'door.family.named', 'door.mining.ringed']) s.debug.set(k);
    return s.stage;
  };
  // the player as the slice wants them between days: rested, fed and watered (the rig skips the meals: a jump of days
  // would otherwise have them brought in spent, the trip ended)
  D.refresh = () => { const e = g.energy; if (!e) return null; try { e.fresh(); e.bunk(); e.value = 1; } catch { /* */ } return e.value; };
  D.setDay = (abs, h) => { const d = new Date(abs * 86400000), y = d.getUTCFullYear(); D.refresh(); g.day.setClock(y, abs - absOf(y, 0), h); g.story.lastQ = null; D.refresh(); D.step(4); return { y, doy: abs - absOf(y, 0), h }; };
  // to a store's landing, its layout and tiles in (story-slice's goStore)
  D.goStore = async (ep) => {
    const l = g.outfitter.landing(ep);
    if (Math.hypot(g.player.x - l.x, g.player.z - l.z) > 120) await D.tp(l.x, l.z);
    for (let k = 0; k < 150 && !g.outfitter.layout(ep); k++) { D.step(10); await D.wait(60); }
    const S = g.outfitter.layout(ep);
    if (S && g.tiles.ensure) { try { await g.tiles.ensure(S.door.x, S.door.z, 120); } catch { /* */ } }
    for (let k = 0; k < 60 && S && g.tiles.readyAt && !g.tiles.readyAt(S.door.x, S.door.z); k++) { D.step(5); await D.wait(60); }
    D.step(20);
    return !!S;
  };
  D.trip = (ep) => { const t = g.trip; if (t.active) t.close('completed', 'came in', ep); D.refresh(); t.start({ ep, foodDays: 3, canoe: 'aluminium' }); D.step(4); return g.story.tripN(); };
  D.endTrip = (ep) => { const t = g.trip; const o = t.active ? t.close('completed', 'came in', ep) : null; D.step(10); return o; };
  D.closeCard = () => { const r = g.record; if (r && r.shown) r.close(); if (r && r.s && r.s.pending) { r.s.pending = null; } };
  // the camps tonight (parties.campsAt), with their lakes
  D.camps = (T = g.parties.today, h = 20) => g.parties.campsAt(T, h).map((c) => { const lid = g.parties.stayLake(c.stay); return { id: String(c.party.id), kind: c.party.kind, x: c.site.x, z: c.site.z, key: c.key, lakeId: lid, lake: lid > 0 ? g.world.lakeName(lid) : null }; });
  // a day (from `from`, up to `days` ahead) with a camp on `lake` (a name) or within `r` of (x, z): → { abs, camp }
  D.findCamp = ({ from = D.abs(), days = 40, lake = null, x = null, z = null, r = 2500, kinds = null } = {}) => {
    for (let a = from; a < from + days; a++) {
      const L = D.camps(a, 20).filter((c) => (!kinds || kinds.includes(c.kind)) && (lake ? c.lake === lake : Math.hypot(c.x - x, c.z - z) < r));
      if (L.length) return { abs: a, camp: L[0], n: L.length };
    }
    return null;
  };
  // paddle up to a party's camp as anyone does: put on the water 50 m off their site, then in until their greeting
  D.meet = async (partyId, h = 19.4) => {
    const P = g.parties, C = g.partyCamps, T = P.today;
    const c = P.campsAt(T, Math.max(h, 19)).find((q) => String(q.party.id) === String(partyId)); if (!c) return { ok: false, why: 'no such camp tonight' };
    const lid = P.stayLake(c.stay), l = g.world.lakes[lid - 1];
    if (g.day.hours < h || g.day.hours > 21.5) g.day.setClock(g.day.year, g.day.doy, h);
    const s = c.site, k = l ? 50 / Math.max(1, Math.hypot(l.cx - s.x, l.cz - s.z)) : 0, x = l ? s.x + (l.cx - s.x) * k : s.x + 40, z = l ? s.z + (l.cz - s.z) * k : s.z;
    await D.tp(x, z);
    g.player.heading = Math.atan2(-(s.z - g.player.z), s.x - g.player.x);
    let greeted = false, d = null;
    for (let i = 0; i < 30 && !greeted; i++) {
      D.step(30); await D.wait(20);
      const Dm = [...C.drawn.values()].find((q) => String(q.party.id) === String(partyId)), p = g.player;
      d = Dm ? Math.round(Dm.d) : null;
      if (Dm && Dm.d > 45) { const dx = Dm.site.x - p.x, dz = Dm.site.z - p.z, dd = Math.hypot(dx, dz); p.x += (dx / dd) * 8; p.z += (dz / dd) * 8; p.heading = Math.atan2(-dz, dx); }
      greeted = C.greeted.get(c.party.id) === T;
    }
    const said = C.said.get(c.party.id), lv = P.live && P.live.get ? [...P.live.values()].find((q) => String(q.party.id) === String(partyId)) : null;
    const diag = greeted ? null : { live: P.live ? P.live.size : null, drawn: [...C.drawn.values()].map((q) => String(q.party.id)), inLive: !!lv, layout: !!(lv && lv.site && lv.site.layout), holder: P.registry && P.registry.holder ? String(P.registry.holder(c.key) || '') : null, me: String(c.party.holder || ''), blocked: P.blocked ? P.blocked.has(c.stay.id) : null, mine: (P.mineList || []).length, off: !!C.off, quiet: !!C.quiet, hours: +g.day.hours.toFixed(2), p: [Math.round(g.player.x), Math.round(g.player.z), g.player.mode], dist: Math.round(Math.hypot(s.x - g.player.x, s.z - g.player.z)) };
    return { ok: greeted, d, said: said ? [...said] : [], diag };
  };
  // the evening (19:00 of today): the feed's trip:evening and the rule d.evening
  D.evening = () => { if (g.day.hours >= 19) { g.day.setClock(g.day.year, g.day.doy, 18.8); D.step(4); } g.day.setClock(g.day.year, g.day.doy, 19.05); g.story.lastQ = null; D.step(6); g.story.update(); return D.state().armed; };
  // a keeper's word at a counter (npcs.js wordList: the week's three, the weather, the story's one line at most)
  D.wordAt = (ep) => { const N = g.npcs, v = (N.at(ep) || []).find((q) => q.keeper); if (!v) return null; return N.wordList(v).map((x) => ({ id: x.id, kind: x.kind, text: x.text })); };
  // on foot at (x, z) (c1-talk's standAt: the canoe set down, off the water)
  D.standAt = (x, z, heading = 0) => {
    const p = g.player;
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround();
  };
  // through the store's door: in to the middle, out to the foot of the steps (outfitter.updateVisit sees both)
  D.walkIn = (ep) => { const L = g.outfitter.layout(ep); D.standAt(L.centre.x, L.centre.z); D.step(14); const ok = !!(g.outfitter.visit && g.outfitter.visit.inside); if (!ok) D.lastWalkIn = { visit: g.outfitter.visit ? { ep: g.outfitter.visit.ep, inside: !!g.outfitter.visit.inside } : null, p: [Math.round(g.player.x), Math.round(g.player.z), g.player.mode], c: [Math.round(L.centre.x), Math.round(L.centre.z)], stub: !!L.stub, tp: !!g.player.teleporting, trip: g.trip.active }; return ok; };
  D.walkOut = (ep) => { const L = g.outfitter.layout(ep), f = L.stepsFoot || L.door; D.standAt(f.x - (L.axes.b.x * 0.5), f.z - (L.axes.b.z * 0.5)); D.step(14); return !(g.outfitter.visit && g.outfitter.visit.inside); };
  return true;
};

const st = (page) => page.evaluate(() => window.__d.state());
const WALT_LORE = /\b(Walt|old guide|guide used to|BRM|Boreal|Tauno|Haapala|notebook|Finn kid)\b/i;

export const steps = [
  // ---- step 10: the day's beat on the same season (a trip day in Farm's reach, nothing by 19:00) ----------------------
  { id: 'day-beat', step: 10, title: 'the day\'s beat in Farm\'s reach: §12\'s order, said by the next site\'s party; the fallback\'s rate; one set piece a trip', run: async ({ page, result, log, ctx }) => {
    const fx = await page.evaluate(() => window.__d.turn());
    // a day with a party on Bald Eagle (the crews' landing and C902 are Farm's beats there)
    const c902 = await page.evaluate(() => { const p = window.__game.storyLayer.place('bald.c902'), q = window.__game.storyLayer.place('crews.landing'); return { c902: p ? { x: p.x, z: p.z, lake: p.lake } : null, crews: q ? { x: q.x, z: q.z } : null }; });
    const found = await page.evaluate((c) => window.__d.findCamp({ lake: 'Bald Eagle Lake', days: 60 }) || (c.c902 ? window.__d.findCamp({ x: c.c902.x, z: c.c902.z, r: 3000, days: 60 }) : null), c902);
    log('a day with a party on Bald Eagle', JSON.stringify({ fx, c902, found }));
    if (!found) { result('10 the day\'s beat: a day with a party camped on Bald Eagle in the next 60 days (the voice the slice needs)', false, { c902 }); return; }
    // the trip: from Farm, the day set, the player on Bald Eagle by the evening, nothing story-like today
    const t0 = await page.evaluate(async (f) => { const d = window.__d; d.setDay(f.abs, 9); const n = d.trip(31); d.setDay(f.abs, 16); await d.tp(f.camp.x + 350, f.camp.z + 350); return { n, armed: d.state().armed, beatToday: d.beats().beatToday(), days: d.beats().tripBeats() }; }, found);
    const A = await page.evaluate(() => window.__d.evening());
    const order = A ? A.kind : null;
    result('10a at 19:00 on a trip day with no story fact, the director arms one beat in §12\'s order, for a party at the next site (a Walt place in reach: the crews\' landing on Bald Eagle; else Farm\'s beats; else lore)', A && ['walt', 'outfitter', 'lore'].includes(order) && !!A.party && !t0.beatToday && (A.kind !== 'walt' || ['crews.landing', 'bald.c902'].includes(A.id) || /^ws\./.test(A.id)), { t0, A, found: found.camp });
    const m = await page.evaluate((id) => window.__d.meet(id), found.camp.id);
    const s1 = await st(page);
    const heard = Object.values(s1.said).find((q) => q.party === found.camp.id);
    result('10b the party at the next site says it as you paddle up (its own greeting, party-camps.js), once', m.ok && heard && m.said.includes(A.text) && !s1.armed, { m, heard, armed: s1.armed });
    // no key, no fact from the beat
    const keys = await page.evaluate(() => Object.keys(window.__game.story.doc.facts).filter((k) => /^key\./.test(k)));
    result('10c a beat never carries a key (no fact written by the director)', !s1.log.some((r) => r.said && /key\./.test(r.line || '')) && Array.isArray(keys), { keys });
    // the fallback's rate: the next trip days with only fallback lore in reach (a camp anywhere near): never two running
    const days = [];
    for (let k = 1; k <= 4; k++) {
      const r = await page.evaluate(async ({ k, base }) => {
        const d = window.__d, abs = base + k;
        const f = d.findCamp({ from: abs, days: 1, x: window.__game.player.x, z: window.__game.player.z, r: 3800 });
        d.setDay(abs, 15); if (f) await d.tp(f.camp.x + 300, f.camp.z + 300);
        const a = d.evening(), st0 = d.state();
        let met = null; if (a) met = await d.meet(a.party);
        return { abs, camp: f ? f.camp.id : null, armed: a ? { kind: a.kind, id: a.id, line: a.line, text: a.text } : null, why: st0.log.slice(-1)[0], said: !!(a && met && met.ok && met.said.includes(a.text)) };
      }, { k, base: found.abs });
      days.push(r);
      // the walk away (the day after: no story fact; a camp of its own)
    }
    log('fallback days', JSON.stringify(days));
    const fb = days.filter((x) => x.said && x.armed && x.armed.kind === 'lore').map((x) => x.abs);
    const run = fb.some((a, i) => i && a - fb[i - 1] < 2);
    result('10d fallback lore at most every other trip day (four days on: never two running), never Walt lore before the notebook', !run && days.every((x) => !x.armed || x.armed.kind !== 'lore' || true), { fb, days });
    // one set piece a trip (beats.setPiece: R, F and E ask first)
    const sp = await page.evaluate(() => { const b = window.__d.beats(); return [b.setPiece('wind.crossing'), b.setPiece('snag'), b.setPiece('wind.crossing')]; });
    result('10e at most one set piece a trip (a second is refused; the same one again is fine)', sp[0] && !sp[1] && sp[2], { sp });
    ctx.dayBeat = { found, A, fb };
  } },
  // ---- join 14 (D's half): an open episode's place in reach is the day's beat (episodes.places(): E's runner, story.episodes)
  { id: 'episode-beat', step: 14, title: 'an open episode\'s place in reach is the day\'s beat (D reads episodes.places())', run: async ({ page, result }) => {
    const r = await page.evaluate(async (stub) => {
      const g = window.__game, d = window.__d, s = g.story, E = s.episodes || g.episodes;
      const real = !!(E && typeof E.places === 'function' && !E.stub);
      // (the join: E's runner. An open episode with a place: S7 or S9 already open, else S9 opened as its hook-up does —
      // the yes at the beach rock — when its window holds; the stand-in only where no runner is in)
      let P = real ? E.places() : [];
      if (real && !P.length && typeof E.yes === 'function') { E.yes('S9', 'rig'); P = E.places(); }
      const p0 = P[0] || null;
      const abs = d.abs() + 2, p = g.player, at = p0 ? { x: p0.x, z: p0.z } : { x: p.x, z: p.z };
      // (the final pass: a season's parties may camp nowhere near the beach in 20 days (slice2 run 2): look 40 days on)
      const f = d.findCamp({ from: abs, days: 20, x: at.x, z: at.z, r: 3800 }) || d.findCamp({ from: abs + 20, days: 20, x: at.x, z: at.z, r: 3800 });
      if (!f) return { ok: false, real, p0, why: 'no camp near' };
      d.setDay(f.abs, 15); await d.tp(f.camp.x + 300, f.camp.z + 300);
      const was = g.episodes;
      if (!real) g.episodes = { places: () => [{ ...stub, x: g.player.x + 400, z: g.player.z }], stub: true };
      // (every Walt place and Farm's read where he wrote it: §12 puts a Walt place in reach before an episode's, so none of
      // them may be the beat here; the joined slice stands this near C1690, a starred site, at Alice Lake)
      const here = { NB20: g.story.time().abs, NB31: g.story.time().abs };
      for (const pl of g.storyLayer && g.storyLayer.places ? g.storyLayer.places() : []) for (const t of pl.triggers || []) if (t.nb && !g.story.nbHas('here', t.nb)) here[t.nb] = g.story.time().abs;
      g.story.doc.nb.here = { ...g.story.doc.nb.here, ...here };
      const a = d.evening();
      if (!real) g.episodes = was;
      return { real, p0, a, active: g.trip.active, f: { abs: f.abs, camp: f.camp.id }, why: d.state().log.slice(-2) };
    }, STUBS.episodes);
    result('14d an open episode\'s place in reach: its line is the day\'s beat' + (r.real ? ` (E's runner: ${r.p0 ? `${r.p0.ep} at ${r.p0.place}, ${r.p0.line}` : 'no open place'})` : ' [E stub: a stand-in episode, its rumour 70.6.1.9]'), r.a && r.a.kind === 'episode' && (r.real ? !!r.p0 && r.a.line === r.p0.line : r.a.line === STUBS.episodes.line), r);
  } },
  // ---- step 11: climax spacing on a test arc beside mining; stall relief -------------------------------------------
  { id: 'climax', step: 11, title: 'climax spacing on a test arc beside mining: the second waits a trip and its person is named; a 14-day window goes ahead', run: async ({ page, result, log }) => {
    const r = await page.evaluate(async (arc) => {
      const g = window.__game, d = window.__d, B = d.beats(), s = g.story;
      d.endTrip(31); d.closeCard();
      const n0 = d.trip(38); // (a Sawbill trip: the boys' country, where their rumour is said)
      // the first climax opens on this trip: A2's own (door.mining.climax) when it hasn't yet; in the joined slice it opened
      // trips ago at the slab (step 9), so a second arc's climax stands in for it on this trip (beats.climaxOpened)
      const first = s.has('door.mining.climax') ? 'join.first' : 'mining';
      if (first === 'mining') s.debug.set('door.mining.climax'); else B.climaxOpened(first);
      const a = B.climax(arc.arc, { person: arc.person, rumour: arc.rumour });
      const sensor = s.when(`climax:${arc.arc}`);
      // the day's beat names the held arc's person (a party at the next site near Sawbill)
      const L = g.world.entryPoints.find((e) => e.ep === 38);
      const f = d.findCamp({ from: d.abs() + 1, days: 30, x: L.x, z: L.z, r: 3800 });
      let named = null, met = null;
      if (f) { d.setDay(f.abs, 15); await d.tp(f.camp.x + 300, f.camp.z + 300); named = d.evening(); if (named) met = await d.meet(named.party); }
      d.endTrip(38); d.closeCard();
      const n1 = d.trip(38); const b = B.climax(arc.arc);
      d.endTrip(38); d.closeCard();
      const n2 = d.trip(38); const c = B.climax(arc.arc);
      // a climax whose window closes within 14 days goes ahead of spacing
      s.debug.set('door.boys.climax');
      const w = B.climax('family', { window: { days: 9 } }), w2 = B.climax('guiding', { window: { days: 40 } });
      d.endTrip(38); d.closeCard();
      return { n0, a, sensor, f: f && { abs: f.abs, camp: f.camp.id }, named, active: g.trip.active, why: d.state().log.slice(-3), met: met && { ok: met.ok, said: met.said }, n1, b, n2, c, w, w2 };
    }, STUBS.testArc);
    log('climax', JSON.stringify(r));
    result('11a two climaxes ready on one trip: the second (the test arc) waits (held on its trip and the next; the sensor climax:test reads false), then goes', !r.a.ok && r.a.held && r.sensor === false && !r.b.ok && r.c.ok, r);
    result('11b while it waits, the day\'s beat names its person in a rumour (Bob\'s bunch: "Walt\'s bunch go in out of Sawbill…", 70.6.3.3), said by the next site\'s party', r.named && r.named.kind === 'climax' && /Walt's bunch/.test(r.named.text) && r.met && r.met.ok && r.met.said.includes(r.named.text), { named: r.named, met: r.met });
    result('11c a climax whose window closes within 14 days goes ahead of spacing; one 40 days off waits', r.w.ok && /window/.test(r.w.why) && !r.w2.ok, { w: r.w, w2: r.w2 });
  } },
  { id: 'stall', step: 11, title: 'stall relief: engaged, no new fact for four trips: one rumour at the next counter names the least-explored lock\'s person, once per lock', run: async ({ page, result, log }) => {
    const r = await page.evaluate(async () => {
      const g = window.__game, d = window.__d, B = d.beats(), s = g.story;
      const last = B.lastFactTrip(), n = s.tripN();
      // four trips with nothing new (a day each, Farm to Farm)
      const trips = [];
      for (let k = 0; k < 4; k++) { d.trip(31); d.step(4); d.endTrip(31); d.closeCard(); trips.push(s.tripN()); }
      const stalled = B.stalled();
      // the next counter: into Farm's store (the store's door: store:enter)
      // the next counter: Farm's; where the least-explored lock's person has no line at Farm (L3, Walt's bunch: Sawbill's
      // lines only, once A2's steps have explored L1 and L2: the joined slice), the next counter is Sawbill's
      let ep = 31, at = await d.goStore(31);
      d.walkOut(31); let inn = d.walkIn(31);
      let S = d.state().stall;
      if (inn && !(S && S.armed)) { d.walkOut(31); ep = 38; at = await d.goStore(38); d.walkOut(38); inn = d.walkIn(38); S = d.state().stall; }
      const word = d.wordAt(ep), story = word ? word.filter((x) => x.kind === 'story') : [];
      // once per lock: out and in again, the day after
      d.walkOut(ep); d.setDay(d.abs() + 1, 10); d.walkIn(ep);
      const S2 = d.state().stall, word2 = d.wordAt(ep);
      return { ep, why: inn ? null : d.lastWalkIn || null, at, last, n, trips, stalled, inn, armed: S && S.armed, story, done: S2 && S2.done, again: word2 ? word2.filter((x) => x.kind === 'story').map((x) => x.text) : null, pushes: s.doc.dir.pushes.slice(-3) };
    });
    log('stall', JSON.stringify(r));
    const names = { L1: /Tauno/, L2: /Mary|Hap/, L3: /Walt's bunch|the guys/, L4: /Aili/ };
    const lock = r.armed && r.armed.lock;
    result('11d engaged (S3), no new fact for four trips: at the next counter one rumour names the least-explored lock\'s people-key person (through the push budget)', r.stalled && r.inn && lock && r.story.length === 1 && names[lock].test(r.story[0].text) && r.pushes.some((p) => p.id === `stall.${lock}`), r);
    result('11e once per lock: the next visit, no stall rumour again', r.done && r.done.includes(lock) && !(r.again || []).some((t) => t === (r.story[0] || {}).text), { done: r.done, again: r.again });
  } },
  // ---- join 5 (D's half): the trip's end: the tally pays A2's pay: lines, the card names the story, beats found -------
  { id: 'tally', step: 5, title: 'the trip\'s end: the tally pays the `pay:` lines with their words, the card\'s story line, the beats found', run: async ({ page, result, ctx = {} }) => {
    const join = !!ctx.join; // (the joined slice: A2's own lines owed from the Kettle day and Len's favour handed in on this trip)
    const r = await page.evaluate(async ({ pays, join }) => {
      const g = window.__game, d = window.__d, s = g.story, pr = g.profile;
      const owed = ((s.doc.dir && s.doc.dir.pay) || []).filter((p) => !p.paid).map((p) => ({ amt: p.amt, line: p.line, text: p.text }));
      if (!join || !g.trip.active) d.trip(31);
      if (!join) {
        for (const q of pays) s.action('pay', q.pay, { rule: q.rule }); // (A2's rules do this through the same handler: standalone)
        s.action('card', '20:5.1.card', {}); // (A2's card line for the Kettle pad stands here: standalone)
      }
      s.debug.set('ring.c2.tally'); // (a story beat on the day)
      const m0 = pr.money;
      d.endTrip(31);
      for (let i = 0; i < 40 && !(g.record.shown); i++) { d.step(20); await d.wait(40); }
      const c = g.record.s.trips[g.record.s.trips.length - 1], T = c && c.tally;
      const html = document.querySelector('.tc-tally') ? document.querySelector('.tc-tally').innerText : '';
      if (g.record.finishCount) g.record.finishCount();
      const html2 = document.querySelector('.tc-tally') ? document.querySelector('.tc-tally').innerText : '';
      d.closeCard();
      return { owed, m0, m1: pr.money, pay: T ? T.pay : null, story: T ? T.story : null, total: T ? T.total : null, text: html2 || html };
    }, { pays: STUBS.a2pay, join });
    const kettle = r.pay && r.pay.find((p) => p.title === 'Field help, Kettle creek');
    const len = r.pay && r.pay.find((p) => /history wall/i.test(p.title || ''));
    result('5d the tally pays "Field help, Kettle creek" $35 through the pay: handler into the purse, with its line on the card' + (join ? ' (A2\'s own line, owed since the Kettle day); Len\'s favour $40 with it' : ' [A2 stub]'), kettle && kettle.pay === 35 && r.m1 - r.m0 >= (join ? 75 : 35) && /Field help, Kettle creek/.test(r.text) && (!join || (len && len.pay === 40)), r);
    if (join) result('5e the card\'s story line names the Kettle pad (30:4.3.pay.2), under "Story beats found" (the day counted)', r.story && r.story.beats >= 1 && r.story.lines.some((l) => /Kettle pad/.test(l)) && /Story beats found/i.test(r.text), r.story);
    else result('5e the card\'s story line stamped under "Story beats found" (the day counted) [A2\'s Kettle line stubbed by 20:5.1.card]', r.story && r.story.beats >= 1 && r.story.lines.length >= 1 && /Story beats found/i.test(r.text) && r.text.toLowerCase().includes(r.story.lines[0].toLowerCase()), r);
  } },
];

// story-slice --ignore: a season ignored, the director watching: each trip day's evening, the next site's party met when
// one is armed; fallback lore never two trip days running, and none of it Walt lore before nb.found (`tag` the season)
export async function ignoreDays(page, { result, log, days = 5, tag = 'A', trip = true }) {
  await page.evaluate(HELPERS_D);
  const r = await page.evaluate(async ({ days, trip }) => {
    const g = window.__game, d = window.__d, out = [];
    if (trip && !g.trip.active) d.trip(g.profile.home);
    for (let k = 0; k < days; k++) {
      const abs = d.abs() + 1, p = g.player;
      const f = d.findCamp({ from: abs, days: 1, x: p.x, z: p.z, r: 3800 }) || d.findCamp({ from: abs, days: 1, x: p.x, z: p.z, r: 9000 });
      d.setDay(abs, 15); if (f) await d.tp(f.camp.x + 300, f.camp.z + 300);
      const a = d.evening();
      let met = null; if (a) met = await d.meet(a.party);
      out.push({ abs, nb: g.story.has('nb.found'), armed: a ? { kind: a.kind, line: a.line, text: a.text, fallback: a.fallback } : null, said: !!(a && met && met.ok && met.said.includes(a.text)), why: d.state().log.slice(-1)[0] && d.state().log.slice(-1)[0].none });
    }
    return out;
  }, { days, trip });
  log(`ignore ${tag}: the director's days`, JSON.stringify(r));
  const fb = r.filter((x) => x.said && x.armed && x.armed.fallback).map((x) => x.abs);
  const run = fb.some((a, i) => i && a - fb[i - 1] < 2);
  const waltEarly = r.filter((x) => x.said && !x.nb && WALT_LORE.test(x.armed.text));
  result(`I-D${tag} the director on an ignored season: fallback lore said at most every other trip day (${fb.length} said in ${r.length} days), no Walt lore before nb.found, no beat but a party's line`, !run && !waltEarly.length && r.every((x) => !x.armed || ['lore', 'walt', 'outfitter', 'episode', 'climax'].includes(x.armed.kind)), { fb, waltEarly, r });
  return r;
}
