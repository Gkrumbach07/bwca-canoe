// c2-director-unit.mjs: the director's own checks in Node (stream D, story Round 2; campaign-design §12, Part 4 Round 2
// steps 10–11). No browser: StoryV2 with the real rules (RULES_ALL, so rules-beats.js is in), beats.js, ambient.js and
// the extract's words; the world (the parties at the next site, the layer's places, the open episodes) is a hand-made
// ctx, as feed-beats.js makes it in the game.
//
//   1 the day's beat's order (§12): a held climax's person, a Walt place in reach, the outfitter's beats, an open
//     episode's place, fallback lore; only on a trip day with no story beat yet, only by a party at the next site
//   2 fallback lore never two trip days running; the Walt pool after nb.found, the history pool before it and on the
//     declined variant (no Walt lore before nb.found, none in the history pool ever)
//   3 one set piece a trip
//   4 climax spacing: the second waits one trip and its person is named; a window closing within 14 days goes ahead
//   5 stall relief: engaged (S3) and no new fact for four trips → one rumour at the next counter naming the least-explored
//     lock's people-key person, once per lock, through the push budget
//   6 pay: and card:, the tally's lines (paid once), the trip's story line and its beat days
//   7 beats by outfitter: Bog 67's beats from its moved door; Round 1's push budget unchanged; a guest's director is off
//   node scripts/c2-director-unit.mjs
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { StoryV2 } = await import(path.join(ROOT, 'src/story.js'));
const { Beats, PACE, STALL, DIR } = await import(path.join(ROOT, 'src/beats.js'));
const { BEATS, DOORS, REACH_M } = await import(path.join(ROOT, 'src/beats-by-outfitter.js'));
const { texts, T } = await import(path.join(ROOT, 'src/topics.js'));
const { ambient, WALT_LORE } = await import(path.join(ROOT, 'src/ambient.js'));
const { waltSites } = await import(path.join(ROOT, 'src/walt-sites.js'));
const TEXT = path.join(ROOT, 'src/story-data/text');
for (const f of readdirSync(TEXT).filter((x) => x.endsWith('.json'))) texts.add(JSON.parse(readFileSync(path.join(TEXT, f), 'utf8')));
const world = JSON.parse(readFileSync(path.join(TEXT, 'world.json'), 'utf8'));
const origWarn = console.warn; console.warn = (...a) => { if (!/story\.set|story rule/.test(String(a[0]))) origWarn(...a); };

let pass = 0, fail = 0;
const ok = (name, cond, more = {}) => { if (cond) pass++; else fail++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : JSON.stringify(more).slice(0, 900)); };

// --- a story on a trip, with the clock in hand ------------------------------------------------------------------------
const ABS0 = Math.round(Date.UTC(2026, 5, 20) / 86400000); // 20 June 2026
function make({ trip = 3, active = true, abs = ABS0, home = 31 } = {}) {
  const s = new StoryV2();
  const earned = [];
  const profile = { seasonId: 'u', started: true, home, money: 100, earn(n) { this.money += n; earned.push(n); }, onChange() {} };
  const st = { n: trip, active };
  s.attach({ profile });
  s.ctx.tripN = () => st.n;
  s.ctx.trip = st;
  s.now = { abs, hours: 10 };
  const b = new Beats().attach(s);
  ambient.use(world).attach({ story: s });
  const at = (a, h = 19) => { s.now = { abs: a, hours: h }; };
  return { s, b, st, at, profile, earned };
}
// the turn played (S3: Tauno said Eino's name), the notebook found
const toS3 = (s) => { for (const k of ['nb.found', 'tauno.porch.done', 'tauno.talk', 'tauno.turn', 'door.crews.taken']) s.set(k, true, 'unit'); };
const site = (id) => waltSites().find((q) => q.id === id);
const party = (id, kind, x, z, lakeId, lake = null) => ({ id, kind, x, z, lakeId, lake, d: 0 });

// =====================================================================================================================
// 1 the day's beat's order
{
  const { s, b, st, at } = make();
  toS3(s);
  at(ABS0 + 1, 19); // (a new day: the S3 facts were yesterday's)
  const c1655 = site('ws.c1655'), c837 = site('ws.c837');
  const layerPlaces = [{ id: 'ws.c1655', kind: 'site', x: c1655.x, z: c1655.z, lakeId: c1655.lakeId, lake: 'Lake Insula', nb: ['NB03', 'NB37'] },
    { id: 'bald.c902', x: -24785.7, z: 30300, lake: 'Bald Eagle Lake', triggers: [{ on: 'readHere', nb: 'NB20' }] }];
  const cx = (o = {}) => ({ player: { x: c1655.x + 1500, z: c1655.z }, track: [], host: 25, places: layerPlaces, parties: [party('p1', 'pair', c1655.x + 300, c1655.z, c1655.lakeId, 'Lake Insula')], episodes: [], ...o });
  // (0) a held climax's person comes first (the test arc: the boys, named by a party's rumour)
  b.climaxOpened('mining');
  const h = b.climax('boys');
  const r0 = b.dayBeat(cx({ host: 38 })); // (70.6.3.3 is Sawbill's word: the boys go in there)
  ok('1.0 a held climax: the day\'s beat names its person in a rumour (a party\'s, 70.6.3.3)', !h.ok && r0.kind === 'climax' && r0.arc === 'boys' && r0.line === '70.6.3.3' && /Walt's bunch/.test(r0.text), { h, r0 });
  delete s.doc.dir.held.boys; s.doc.dir.climaxes = []; delete s.doc.facts['door.mining.climax'];
  // (1) a Walt place in reach, its entry not read there: the party on its lake says the starred site's line
  const r1 = b.dayBeat(cx());
  ok('1.1 a Walt place in the day\'s travel (Insula C1655, NB03 not read there): 70.9.1 by the party on Lake Insula', r1.kind === 'walt' && r1.id === 'ws.c1655' && r1.line === '70.9.1' && r1.party === 'p1', r1);
  // no party on that lake: not that beat (a place's line is said on its own lake)
  const r1b = b.dayBeat(cx({ parties: [party('p2', 'pair', c837.x, c837.z, c837.lakeId, 'Lake One')] }));
  ok('1.1b no party on the place\'s lake: the Walt place is not the beat (a place\'s line is said on its own lake)', r1b.kind !== 'walt', r1b);
  // (2) the outfitter's beats: read NB03/NB37 there; Farm's C902 (bald.c902 in the layer), the party on Bald Eagle (an old local)
  s.readHere('NB03', 'unit'); s.readHere('NB37', 'unit'); s.readHere('NB20', 'unit');
  at(ABS0 + 2, 19);
  const farm = cx({ host: 31, player: { x: -24700, z: 30300 }, places: [...layerPlaces, { id: 'bald.c902', x: -24785.7, z: 30300, lake: 'Bald Eagle Lake' }], parties: [party('p3', 'solo', -24900, 30200, 77, 'Bald Eagle Lake')] });
  s.doc.nb.here = { NB03: 1, NB37: 1 }; // (NB20 not read there: the C902 beat stands)
  const r2 = b.dayBeat(farm);
  ok('1.2 the outfitter\'s beats (Farm 31): Bald Eagle C902 "V.\'s water", 70.9.2 by an old local on Bald Eagle', r2.kind === 'outfitter' && r2.id === 'b31.2' && r2.line === '70.9.2' && r2.party === 'p3', r2);
  // two stump waits for A2's place; the beat is not offered while its place is not in the layer
  ok('1.2b Two Stump (b31.1) is not offered while its place is not in the layer (A2 places it)', !BEATS.find((x) => x.id === 'b31.1').wait && r2.id !== 'b31.1');
  // (3) an open episode's place (E: episodes.places())
  s.doc.nb.here.NB20 = 1;
  const epx = { id: 'S7', place: 'mummos', x: -24800, z: 30500, line: '70.6.1.11' };
  at(ABS0 + 3, 19); s.now.abs = ABS0 + 3;
  const june = ABS0 + 3; void june;
  const r3 = b.dayBeat({ ...farm, episodes: [epx] });
  ok('1.3 an open episode\'s place in reach: its rumour (E\'s line), by the next party', r3.kind === 'episode' && r3.id === 'ep.S7' && r3.line === '70.6.1.11', r3);
  // (4) fallback lore: the Walt pool after the notebook
  const r4 = b.dayBeat({ ...farm, places: [] });
  ok('1.4 nothing else in reach: fallback lore from the Walt pool (after nb.found, not declined)', r4.kind === 'lore' && r4.pool === 'lore' && WALT_LORE.test(r4.text + ' Walt') && !!r4.text, r4);
  // only on a trip day, with no story beat yet, and only with a party at the next site
  st.active = false;
  ok('1.5 not a trip day: no beat', !!b.dayBeat(farm).none);
  st.active = true;
  s.set('ring.x', 'unit', 'unit');
  ok('1.6 a story beat today already (a fact): no beat', /story beat today/.test(b.dayBeat(farm).none || ''), b.dayBeat(farm));
  at(ABS0 + 4, 19);
  ok('1.7 no party at the next site: no beat (the day stays quiet)', /no party/.test(b.dayBeat({ ...farm, parties: [] }).none || ''));
  // offered, then said once by that party only
  const A = b.offerDay(farm);
  const other = b.partyLine({ id: 'zz', kind: 'pair' }, 'greet'), said = b.partyLine({ id: 'p3', kind: 'solo' }, 'greet'), again = b.partyLine({ id: 'p3', kind: 'solo' }, 'greet');
  ok('1.8 armed for the party at the next site: said by that party, once (not by another, not twice)', A && !other && said === A.text && again !== A.text, { A, other, said, again });
  ok('1.9 a beat never carries a key: the director wrote no fact', !Object.keys(s.doc.facts).some((k) => s.fact(k).src === 'rule:d.evening' || /^key\./.test(k) && s.fact(k).abs >= ABS0 + 1));
  // the lapse: armed, nobody met by noon the next day
  at(ABS0 + 5, 19); b.offerDay({ ...farm, places: [] });
  at(ABS0 + 6, 13);
  ok('1.10 armed and nobody met by noon the next day: it lapses (the day stays quiet)', b.partyLine({ id: 'p3', kind: 'solo' }, 'greet') == null && !s.doc.dir.armed);
}

// 2 fallback lore: the rate, the pools
{
  const { s, b, at } = make();
  s.set('nb.found', true, 'unit');
  const P = [party('q1', 'pair', 0, 0, 0)];
  const cx = { player: { x: 0, z: 0 }, track: [], host: 25, places: [], parties: P, episodes: [] };
  const days = [];
  for (let d = 10; d < 22; d++) {
    at(ABS0 + d, 19);
    const a = b.offerDay(cx);
    const w = a ? b.partyLine({ id: 'q1', kind: 'pair' }, 'greet') : null;
    days.push({ d, kind: a ? a.kind : null, said: !!w, line: a ? a.line : null });
  }
  const said = days.filter((x) => x.said).map((x) => x.d);
  const run = said.some((d, i) => i && d - said[i - 1] < PACE.fallbackEveryDays);
  ok('2.1 fallback lore never two trip days running (12 trip days in a row: said on alternate days at most)', said.length >= 2 && !run, { said, days });
  ok('2.2 never the same line twice a season', new Set(days.filter((x) => x.said).map((x) => x.line)).size === said.length, days);
  // a day it was armed but not said leaves the next free
  const { s: s2, b: b2, at: at2 } = make();
  s2.set('nb.found', true, 'unit');
  at2(ABS0 + 1, 19); const a1 = b2.offerDay(cx);
  at2(ABS0 + 2, 19); const a2 = b2.offerDay(cx);
  ok('2.3 armed but never heard: the next trip day may offer again (the rate counts lines said)', a1 && a2, { a1, a2 });
  // before the notebook: the history pool only
  const { s: s3, b: b3, at: at3 } = make();
  at3(ABS0 + 1, 19);
  const h = [];
  for (const k of ['pair', 'friends', 'family', 'group', 'solo']) { const r = b3.dayBeat({ ...cx, parties: [party('h', k, 0, 0, 0)] }); if (r.text) h.push(r); }
  ok('2.4 before nb.found: the history pool only, no Walt lore', h.length && h.every((r) => r.pool === 'history' && !WALT_LORE.test(r.text)), h);
  void s3;
  // the declined variant: the porch declined twice (no door taken): the history pool; a door taken brings the Walt pool back
  const { s: s4, b: b4, at: at4 } = make();
  for (const k of ['nb.found', 'tauno.porch.declined1', 'tauno.porch.declined2']) s4.set(k, true, 'unit');
  at4(ABS0 + 1, 19);
  const d1 = b4.dayBeat({ ...cx, host: 25 });
  s4.set('door.crews.taken', true, 'unit'); at4(ABS0 + 2, 19);
  const d2 = b4.dayBeat({ ...cx, host: 25 });
  ok('2.5 declined (porch declined2, no door taken): the history pool; a door taken: the Walt pool again', d1.pool === 'history' && d2.pool === 'lore', { d1, d2 });
  // the history pool never holds Walt lore, at any stage
  const all = ambient.all('history').filter((l) => !l.walt);
  ok('2.6 the history pool (70 §2, §6.1) holds no Walt lore', all.length && all.every((l) => !WALT_LORE.test(l.text)), all.map((l) => l.id));
}

// 3 one set piece a trip
{
  const { b, st } = make();
  const a = b.setPiece('wind'), a2 = b.setPiece('wind'), c = b.setPiece('snag');
  st.n++;
  const d = b.setPiece('snag');
  ok('3.1 one set piece a trip: the first goes (and again the same), a second is refused; the next trip it goes', a && a2 && !c && d, { a, a2, c, d });
}

// 4 climax spacing
{
  const { s, b, st, at } = make({ trip: 5 });
  toS3(s);
  s.set('door.mining.climax', true, 'unit'); // (mining's climax opens on trip 5)
  const t5 = b.climax('boys');
  st.n = 6; const t6 = b.climax('boys');
  st.n = 7; const t7 = b.climax('boys');
  ok('4.1 two climaxes ready on one trip: the second waits one trip (held on 5 and 6), goes on 7', !t5.ok && !t6.ok && t7.ok, { t5, t6, t7 });
  // the sensor reads the same
  st.n = 6;
  ok('4.2 the sensor climax:<arc> reads the spacing (a rule: … & climax:boys)', s.when('climax:boys') === false && s.when('climax:mining') === true);
  // a climax whose window closes within 14 days goes ahead
  const w = b.climax('family', { window: { days: 10 } }), w2 = b.climax('guiding', { window: { days: 30 } });
  ok('4.3 a window closing within 14 days goes ahead of spacing; one closing in 30 waits', w.ok && /window/.test(w.why) && !w2.ok, { w, w2 });
  // a held climax: the day's beat names its person (once a trip), by a party's rumour
  at(ABS0 + 30, 19);
  const r = b.dayBeat({ player: { x: 0, z: 0 }, track: [], host: 38, places: [], parties: [party('c1', 'group', 0, 0, 0)], episodes: [] });
  ok('4.4 the held climax\'s person named in the day\'s beat (the boys: "Walt\'s bunch…", 70.6.3.3)', r.kind === 'climax' && r.line === '70.6.3.3', r);
  // mining held (its person Tauno has no party line: a keeper names him at the next counter, Farm's)
  const { s: m, b: mb, st: mst, at: mat } = make({ trip: 8 });
  toS3(m);
  m.set('door.boys.climax', true, 'unit'); mb.climax('mining');
  mat(ABS0 + 40, 10);
  const c = mb.stallCheck({ ep: 31 }), line = mb.counterLine('rumour', { ep: 31 });
  ok('4.5 a held climax with no party line: the next counter that can (Farm) names its person (Tauno)', c && c.kind === 'climax' && line && /Tauno/.test(line.text), { c, line });
  void mst;
}

// 5 stall relief
{
  const { s, b, st, at } = make({ trip: 2 });
  toS3(s); // (the last new fact: trip 2)
  const ep = 31;
  st.n = 5; st.active = false; at(ABS0 + 50, 10);
  const early = b.stallCheck({ ep });
  st.n = 6; at(ABS0 + 60, 10);
  const due = b.stallCheck({ ep }), word = b.counterLine('rumour', { ep }), word2 = b.counterLine('rumour', { ep });
  const elsewhere = b.counterLine('rumour', { ep: 25 });
  ok('5.1 engaged (S3), no new fact for four trips: one rumour at the next counter names the least-explored lock\'s person', !early && due && word && word.text === due.text && STALL[due.lock].name.test(word.text) && !elsewhere, { early, due, word, elsewhere });
  ok('5.2 through the push budget (stall.<lock> pushed)', s.doc.dir.pushes.some((p) => p.id === `stall.${due.lock}`), s.doc.dir.pushes);
  // once per lock: the next counter, the same lock is not said again; four trips more, the next lock
  at(ABS0 + 61, 10);
  const again = b.stallCheck({ ep });
  st.n = 10; at(ABS0 + 90, 10);
  const next = b.stallCheck({ ep: 38 }) || b.stallCheck({ ep: 31 }) || b.stallCheck({ ep: 25 });
  ok('5.3 once per lock: not again the next visit; four more stalled trips: the next least-explored lock', !again && next && next.lock !== due.lock, { again, due: due.lock, next });
  // a new fact resets the stall
  const { s: s2, b: b2, st: st2, at: at2 } = make({ trip: 2 });
  toS3(s2); st2.n = 5; s2.set('knows.brm14', true, 'unit'); st2.n = 6; at2(ABS0 + 70, 10);
  ok('5.4 a new fact on trip 5: trip 6 is not stalled', !b2.stallCheck({ ep: 31 }));
  // not engaged (stage < S3): never
  const { s: s3, b: b3, st: st3 } = make({ trip: 1 });
  s3.set('nb.found', true, 'unit'); st3.n = 9;
  ok('5.5 not engaged (S1): no stall relief, however long', !b3.stallCheck({ ep: 31 }));
}

// 6 pay:, card:, the tally
{
  const { s, b, earned, profile } = make({ trip: 4 });
  s.action('pay', '35 Field help, Kettle creek', { rule: 'a2.kettle.pay' });
  s.action('pay', '0 Gas, Tauno', { rule: 'a2.ride.gas' });
  s.action('card', '20:5.1.card', {});
  const lines = s.tallyLines({}), again = s.tallyLines({});
  ok('6.1 pay: lines owed, paid once at the tally into the purse, with their words', lines.length === 2 && lines[0].pay === 35 && lines[0].title === 'Field help, Kettle creek' && lines[1].title === 'Gas, Tauno' && !again.length && earned.join() === '35' && profile.money === 135, { lines, again, earned });
  ok('6.2 the trip\'s story line (card:20:5.1.card) and its beat days', s.tripLine() === T('20:5.1.card') && Array.isArray(s.tripBeats()), { line: s.tripLine(), beats: s.tripBeats() });
  // the rule d.card.nb: the notebook found on a trip puts trip one's line on its card
  const { s: n1 } = make({ trip: 1 });
  n1.found({ abs: ABS0 });
  ok('6.3 night one on trip one: the card\'s story line is 20 §5.1\'s ("An old notebook, rolled in the tent\'s fly.")', n1.tripLine() === 'An old notebook, rolled in the tent\'s fly.' && n1.tripBeats().length === 1, { l: n1.tripLine(), b: n1.tripBeats() });
  void b;
}

// 7 the rest: Bog 67 from its moved door, the rules in the data, Round 1's budget, a guest
{
  const W = new Map(waltSites().map((q) => [q.id, q]));
  const bog = BEATS.filter((x) => x.ep === 67 && x.place).map((x) => ({ id: x.id, place: x.place, km: +(Math.hypot(W.get(x.place).x - DOORS[67].x, W.get(x.place).z - DOORS[67].z) / 1000).toFixed(1), was: +(Math.hypot(W.get(x.place).x - DOORS[67].was.x, W.get(x.place).z - DOORS[67].was.z) / 1000).toFixed(1) }));
  console.log('     Bog 67 from its moved door (-13325, 34305):', JSON.stringify(bog));
  ok('7.1 Bog 67\'s beats in reach from the moved door (Isabella and Quadga; the Isabella River waits)', bog.length === 2 && bog.every((q) => q.km * 1000 <= REACH_M), bog);
  const s = new StoryV2();
  ok('7.2 the director\'s rules are in the story from its construction (all-rules.js: the data hash holds)', ['d.evening', 'd.counter', 'd.tripend', 'd.card.nb'].every((id) => s.rules.rules.has(id)));
  const { s: r, b: rb, st } = make({ trip: 1 });
  const p1 = rb.push('R3'), p2 = rb.push('R1'); st.n = 2; const p3 = rb.push('R1'); st.n = 4; const p4 = rb.push('R1');
  ok('7.3 Round 1\'s push budget unchanged: one a trip, none for three trips unless engaged', p1 && !p2 && !p3 && p4, { p1, p2, p3, p4 });
  void r;
  const { s: g, b: gb, at } = make();
  toS3(g); g.setMode('mirror'); at(ABS0 + 1, 19);
  ok('7.4 a co-op guest (mirror): no day\'s beat, no party line, no counter line, no stall', !gb.offerDay({ parties: [party('x', 'pair', 0, 0, 0)], places: [], host: 25 }) && !gb.partyLine({ id: 'x' }) && !gb.counterLine('rumour', { ep: 31 }) && !gb.stallCheck({ ep: 31 }));
  // the evening rule: trip:evening → beat:day arms the day's beat through the rules (the feed's path)
  const { s: e, b: eb, at: eat } = make();
  e.set('nb.found', true, 'unit'); eat(ABS0 + 3, 19);
  eb.world = { ctx: () => ({ player: { x: 0, z: 0 }, track: [], host: 25, places: [], parties: [party('e1', 'pair', 0, 0, 0)], episodes: [] }) };
  e.ingest('trip:evening', { n: 3, abs: ABS0 + 3 });
  ok('7.5 the feed\'s trip:evening → rule d.evening → beat:day arms the beat', !!e.doc.dir.armed && e.doc.dir.evening === ABS0 + 3, e.doc.dir.armed);
  // quiet: no beats while a reason holds (the run)
  eb.quiet('run'); eat(ABS0 + 5, 19);
  ok('7.6 beats.quiet(reason): no day\'s beat while it holds', /quiet/.test(eb.dayBeat(eb.ctx()).none || ''));
  eb.quiet('run', false);
}

console.log(`c2-director-unit: ${pass}/${pass + fail} ${fail ? 'FAIL' : 'PASS'}`);
process.exit(fail ? 1 : 0);
