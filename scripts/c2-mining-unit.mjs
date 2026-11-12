// Stream A2's unit checks (Node, no browser): node --test scripts/c2-mining-unit.mjs
// The mining years' data (story-data/mining.js, rules-mining.js, leads-mining.js, episodes/arc-mining.js, cast.js's a2
// block) against the extract, the condition compiler, facts.js and the Walt page's ids; the scenes played through StoryV2
// from story.debug.fixture('turn') (the end of chapter 1's slice) in the slice's order (steps 1, 2, 4, 6, 7, 8, 9, and
// 3's notice window off a forecast): every fact, key and Walt line the spec names; the locks L1, L2, L5, L6 with their
// Round 2 keys; the re-entries ("North of Gabbro, yes.", "Not today."), both tauno.record branches; the openers; the data
// hash; 90 §13 check 1's distances to the real deposits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { texts, T, SceneRun, Topics, textIds, TALK_SENSORS } from '../src/topics.js';
import * as M from '../src/story-data/mining.js';
import { RULES_MINING } from '../src/story-data/rules-mining.js';
import { RULES_ALL } from '../src/story-data/all-rules.js';
import * as LM from '../src/story-data/leads-mining.js';
import arc from '../src/story-data/episodes/arc-mining.js';
import { CAST } from '../src/story-data/cast.js';
import { WALT_LINES } from '../src/story-data/walt-lines.js';
import { factRow } from '../src/story-data/facts.js';
import { LOCKS } from '../src/story-data/locks.js';
import { NICKS, NICK_PAGES } from '../src/story-data/notebook.js';
import { compile, registerSensor } from '../src/story-cond.js';
import { PENCIL_SENSORS } from '../src/pencil.js';
import { StoryV2 } from '../src/story.js';
import { installTurnFixture, TURN_FACTS } from '../src/story-data/fixtures-a2.js';
import { leads } from '../src/leads.js';
import { rain } from '../src/feed-weather.js';
for (const [k, v] of Object.entries({ ...PENCIL_SENSORS, ...M.A2_SENSORS })) registerSensor(k, v);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (f) => JSON.parse(readFileSync(path.join(ROOT, 'src/story-data/text', f), 'utf8'));
const TEXT = {};
for (const f of readdirSync(path.join(ROOT, 'src/story-data/text')).filter((x) => x.endsWith('.json'))) { const j = J(f); texts.add(j); Object.assign(TEXT, j.text); }
const PAGE = new Set([...WALT_LINES.map((w) => w.id), ...Object.entries(TEXT).filter(([, e]) => e.k === 'page').map(([id]) => id)]);
const SCENES = { FARM: M.FARM, SLAB: M.SLAB, LEN: M.LEN, MARY: M.MARY, TASHA: M.TASHA, BREKKE: M.BREKKE };

function condsOf(x, out = []) {
  if (Array.isArray(x)) { for (const y of x) condsOf(y, out); return out; }
  if (x && typeof x === 'object') { if (typeof x.when === 'string' && x.when) out.push(x.when); for (const [k, v] of Object.entries(x)) if (k !== 'when') condsOf(v, out); }
  return out;
}
function actsOf(x, out = []) {
  if (Array.isArray(x)) { for (const y of x) actsOf(y, out); return out; }
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k === 'then' && Array.isArray(v)) { for (const a of v) { if (typeof a === 'string') out.push(a); else actsOf(a, out); } } else actsOf(v, out); }
  return out;
}

// --- a story at the end of chapter 1, a clock, the sensors the scenes read --------------------------------------------
function fresh({ abs = 20620, hours = 8, carrying = false } = {}) {
  const s = new StoryV2();
  s.attach({});
  s.clock({ abs, hours });
  const on = { carrying, rained: false, belt: false, bigNew: false, kettlerun: false, tashaHere: false };
  for (const k of Object.keys(on)) s.sensor(k, () => on[k]);
  s.sensor('nickseen', () => false); s.sensor('ringon', () => false); s.sensor('ringed', () => false); s.sensor('onlake', () => false);
  s.sensor('dayhash', () => 0);
  const acts = [];
  for (const k of ['give', 'pay', 'ring']) s.handle(k, (arg) => { acts.push(`${k}:${arg}`); return true; });
  installTurnFixture(s);
  const t = new Topics().attach({ story: s });
  return { s, t, on, acts };
}
// play: choose by the start of the choice's words; '…' presses on
function play(run, start, picks) {
  let node = run.node(start);
  const said = [];
  const press = () => { for (let k = 0; node && !node.end && node.choices && node.choices.length === 1 && node.choices[0].text === '…' && k < 30; k++) { said.push(node.say); node = node.choices[0].go(); } };
  for (const p of picks) {
    press();
    if (!node || node.end) break;
    said.push(node.say);
    const c = node.choices.find((x) => x.text.startsWith(p));
    assert.ok(c, `no choice "${p}" in [${node.choices.map((x) => x.text).join(' | ')}] after "${node.say}"`);
    node = c.go();
  }
  press();
  if (node && node.say) said.push(node.say);
  if (node && node.end && node.after) node.after();
  return { node, said, choices: node && node.choices ? node.choices.map((c) => c.text) : [] };
}
const ask = (id) => T(id);

test('every line id the mining data names resolves in the extract (and each walt: id is a Walt-page line)', () => {
  const ids = new Set([...textIds(SCENES), ...M.OPENERS.map((o) => o.id), ...M.PLAIN_OPENERS, M.CLOSERS.after, ...M.CLOSERS.plain, M.TASHA_LID, ...M.KEEPER_NOTICE,
    M.THURSDAY_LINE, ...Object.values(M.CREWMAP), ...Object.values(M.WORDS), ...M.STATIONS.map((q) => q.ask), arc.flyer.text, ...arc.flyer.keeper]); // (join c2: the notice is the record's flyer)
  const miss = [...ids].filter((id) => T(id) == null);
  assert.deepEqual(miss, []);
  const walt = actsOf([SCENES, RULES_MINING]).filter((a) => a.startsWith('walt:')).map((a) => a.slice(5));
  assert.deepEqual(walt.filter((w) => !PAGE.has(w)), []);
  assert.equal(T('30:4.9.gas'), 'Gas, Tauno');
  assert.equal(T('30:4.3.pay.1'), 'Field help, Kettle creek');
  assert.equal(T('item.leolid.stamp'), 'L.P.  3-76   KP-4   120–135');
  for (let n = 1; n <= 5; n++) assert.ok(T(`30:4.9.page.${n}`), `the clean book's Walt line ${n}`);
});
test('every condition compiles clean; every fact written is declared; the rules are in all-rules.js', () => {
  const bad = [];
  for (const c of new Set([...condsOf([SCENES, RULES_MINING, LM, arc, CAST.len, CAST.mary, CAST.tasha, CAST.brekke]), ...Object.values(M.SCHEDULE).flatMap((x) => Object.values(x))])) {
    const r = compile(c); if (!r.ok || r.warnings.length) bad.push([c, ...r.errors, ...r.warnings]);
  }
  assert.deepEqual(bad, []);
  const undeclared = actsOf([SCENES, RULES_MINING, arc]).filter((a) => a.startsWith('f:')).map((a) => a.slice(2).split('=')[0]).filter((k) => !factRow(k));
  assert.deepEqual(undeclared, []);
  for (const r of RULES_MINING) assert.ok(RULES_ALL.includes(r), r.id);
  void TALK_SENSORS;
});
test('the data hash holds: two stories built alike agree, and the mining rules are in it from construction', () => {
  const a = new StoryV2(), b = new StoryV2();
  assert.equal(a.dataHash(), b.dataHash());
  assert.ok(a.rules.rules.has('m.pietro.both'));
});
test('the fixture: the end of chapter 1 (the turn played, the four doors named), S3', () => {
  const { s } = fresh();
  const r = s.debug.fixture('turn');
  assert.equal(r.facts, TURN_FACTS.length);
  assert.equal(s.stage, 'S3');
  for (const d of ['mining', 'guiding', 'boys', 'family']) assert.ok(s.has(`door.${d}.named`), d);
  assert.ok(s.has('key.L1C'), 'the crews\' landing seen: L1C (Round 1)');
});
test('the back door: a place nickname on NB66, NB68, NB70, NB73 (10 §7); its ink row on Pietro', () => {
  assert.ok(NICKS.some((n) => n.nick === 'backdoor' && n.kind === 'place'));
  assert.deepEqual(NICK_PAGES.backdoor, ['NB66', 'NB68', 'NB70', 'NB73']);
  assert.ok(LM.INK.some((r) => r.nick === 'backdoor' && r.lake === 'pietro'));
});

// --- the slice, in order ------------------------------------------------------------------------------------------
test('step 1: the first Farm morning, then the hub: "Where, exactly?" (L1A), BRM-14 carried (L1B), "The pads" (a lead)', () => {
  const { s, t, on } = fresh({ carrying: true });
  s.debug.fixture('turn');
  const first = M.farmEntry(s, {});
  assert.equal(first, 'first');
  const run = new SceneRun(t, M.FARM, { who: 'tauno', args: { ep: 31, farm: true } });
  const r = play(run, first, ['The outfit', 'Where, exactly?', 'BRM-14', 'The pads', 'What would it mean', 'Why don\'t you go?']);
  assert.ok(r.said[0].startsWith('You found it. Sit on the bench, not the step.') && !r.said[0].includes('two old fools'), r.said[0]);
  for (const f of ['tauno.farm.met', 'door.mining.open', 'tauno.drilled', 'knows.brm14', 'tauno.said.pads', 'key.L1A', 'key.L1B']) assert.ok(s.has(f), f);
  assert.ok(s.walt().includes('30:4.1.w1'));
  leads.attach({ story: s });
  assert.equal(leads.state('pads'), 'open', 'the pads lead');
  assert.ok(s.walt().includes('w.lead.pads'));
  // the keeper rings the old grade and the west pads at Farm (and the crews' country after "Where, exactly?")
  const asks = leads.asks({ ep: 31 }).map((a) => a.id);
  for (const a of ['ring.crewscountry', 'ring.grade', 'ring.westpads']) assert.ok(asks.includes(a), a);
  // the next morning: an opener by state, never the same twice running; the hub again
  assert.equal(M.farmEntry(s, {}), 'morning');
  const o1 = M.opener({ when: (e) => s.when(e), last: null, n: 0 }), o2 = M.opener({ when: (e) => s.when(e), last: o1, n: 0 });
  assert.notEqual(o1, o2);
  on.rained = true;
  assert.equal(M.opener({ when: (e) => s.when(e), last: null, n: 0 }), '30:4.1.6', 'after rain');
});
test('step 2: Len at the dock: three rings (len.westpads.rings, L1A), "Walt" (tier 1, the lie), his favour; Mary: "A lid for Mary"', () => {
  const { s, t } = fresh();
  s.debug.fixture('turn');
  const hooks = { n: 0, favour: 0, lid: 0 };
  const run = new SceneRun(t, M.LEN, { who: 'len', args: { ep: 31 }, hooks: { rings: () => { hooks.n += 3; }, favour: () => { hooks.favour++; }, pick: () => {} } });
  play(run, M.lenEntry(s), ['The crews', 'Walt', 'What do you do now?']);
  for (const f of ['len.met', 'len.westpads.rings', 'asked.len.walt', 'said.len.walt', 'len.favour', 'tier.1']) assert.ok(s.has(f), f);
  assert.equal(hooks.n, 3); assert.equal(hooks.favour, 1);
  assert.ok(s.tier >= 1, 'tier 1 (and 2 at once: the crews\' landing was seen in chapter 1)');
  const mr = new SceneRun(t, M.MARY, { who: 'mary', args: { ep: 31 }, hooks: { lid: () => { hooks.lid++; } } });
  play(mr, M.maryEntry(s), ['Leo', 'Are any of his boxes']);
  assert.ok(s.has('mary.met') && s.has('mary.lid.asked') && hooks.lid === 1);
});
test('step 3: the Kettle notice: up from 18:00 of a forecast two-day rain\'s first day to 5 days after; never before "The pads"', () => {
  const { s } = fresh({ abs: 20620, hours: 12 });
  s.debug.fixture('turn');
  rain.story = s; rain.weather = { _hour: () => ({ s: 1 }) }; rain.cache.clear(); // (fair every hour: the forced rain only)
  rain.force({ from: 20620, days: 2 });
  s.sensor('kettlenotice', () => !!rain.spellAt(s.nowAbs()));
  const D = arc.flyer; // (join c2: the record's flyer, E's runner)
  const at = (abs, h) => { s.clock({ abs, hours: h }); return s.when(D.when); };
  assert.equal(at(20620, 19), false, 'no notice without "The pads"');
  s.set('tauno.said.pads', true);
  assert.equal(at(20620, 12), false, 'not before 18:00 of the first day');
  assert.equal(at(20620, 19), true, 'the first evening of the rain');
  assert.equal(at(20626, 23), true, '5 days after it stops (the rain is 20620–20621)');
  assert.equal(at(20627, 1), false, 'down after that');
  const S = rain.spellAt(20621.5);
  assert.deepEqual(S, { a: 20620, b: 20621 });
  const kd = rain.kettleDay(S), dow = new Date(kd * 86400000).getUTCDay();
  assert.ok(kd >= 20622 && dow >= 1 && dow <= 5, 'the Kettle day: the first weekday morning after the rain');
  assert.equal(rain.running(20622.4), true); assert.equal(rain.running(20625), false, 'the run: two days, then the stain only');
  rain.clear();
});
test('step 4: the Kettle day: the hollow (westpads.seen L1C, kettle.visited), Tasha (the bottles, "What\'s background?"), Fill ×3, the Secchi, the lid, the bottles back (pay:35)', () => {
  const { s, t, acts } = fresh();
  s.debug.fixture('turn');
  s.set('kettle.notice', true);
  s.set('kettle.visited', true); // (the place's enter trigger: story-places.json kettle)
  assert.ok(s.has('westpads.seen') && s.has('key.L1C'));
  let given = 0;
  const run = new SceneRun(t, M.TASHA, { who: 'tasha', args: {}, hooks: { bottles: () => { given++; s.set('kettle.bottles', true); }, back: () => {} } });
  play(run, M.tashaEntry(s, { at: 'kettle' }), ['What\'s background?', 'And if somebody calls', 'Why\'s it orange?']);
  assert.equal(given, 1);
  assert.ok(s.has('heard.background') && s.walt().includes('30:4.3.w1'));
  for (const q of M.STATIONS) s.set(`kettle.fill.${q.id}`, true);
  s.set('kettle.secchi', true); s.set('kettle.lid', true);
  const back = new SceneRun(t, M.TASHA, { who: 'tasha', args: {}, hooks: { back: () => {} } });
  play(back, M.tashaEntry(s, { at: 'kettle', filled: true }), []);
  for (const f of ['kettle.done', 'kettle.rain']) assert.ok(s.has(f), f);
  assert.ok(s.walt().includes('w.kettle.orange'));
  assert.ok(acts.includes('pay:35@30:4.3.pay.1'), JSON.stringify(acts));
});
test('step 6: Mary and the lid: the back table (the typewriter, L.P., the promise), then Far End (L2A)', () => {
  const { s, t } = fresh();
  s.debug.fixture('turn');
  s.set('kettle.lid', true); s.set('mary.met', true);
  assert.equal(M.maryEntry(s, { give: true }), 'table');
  s.set('mary.lid.given', true);
  const run = new SceneRun(t, M.MARY, { who: 'mary', args: {} });
  const r = play(run, 'table', ['What was wrong with it?', 'Why tell me now?', 'Would you know something typed', 'If it comes out']);
  for (const f of ['mary.promised', 'mary.farend', 'mary.table', 'key.L2A']) assert.ok(s.has(f), f);
  for (const w of ['30:4.4.w1', '30:4.4.w2', '30:4.4.w3']) assert.ok(s.walt().includes(w), w);
  assert.ok(r.said.some((x) => x && x.includes('Far End')));
});
test('step 7: the test ("North of Gabbro, yes." ends it; the next visit corrects him), the crew map (the yield, L6B), the stations, E-7 (L5B, L6C)', () => {
  const { s, t, acts } = fresh();
  s.debug.fixture('turn');
  s.set('tauno.farm.met', true); s.set('kettle.visited', true); s.set('kettle.rain', true);
  assert.equal(M.farmEntry(s, {}), 'well');
  const run1 = new SceneRun(t, M.FARM, { who: 'tauno', args: { ep: 31 } });
  const r1 = play(run1, 'well', ['North of Gabbro, yes.']);
  assert.ok(r1.said.includes(T('30:4.5.4')) && s.has('tauno.kettle.wrong') && !s.has('door.mining.yield'));
  assert.equal(M.farmEntry(s, {}), 'well', 'it replays');
  const run2 = new SceneRun(t, M.FARM, { who: 'tauno', args: { ep: 31 } });
  const r2 = play(run2, 'well', ['No. South-west of Bald Eagle.', 'It still runs orange.', 'The stations', 'Background?', 'chkd T.K.', 'E-7', 'What does an old test pit look like?']);
  assert.ok(r2.said.some((x) => x === 'Fifty years. Rock doesn\'t change its mind.'), 'the running answer, the stain line stripped');
  assert.ok(acts.includes('give:page.crewmap'));
  for (const f of ['door.mining.yield', 'tauno.e7sketch', 'key.L6B', 'stations.known', 'said.tauno.chkd', 'tauno.blazes', 'tauno.pit', 'knows.pit', 'key.L5B', 'key.L6C']) assert.ok(s.has(f), f);
  assert.ok(s.walt().includes('30:4.5.w1') && s.walt().includes('30:4.5.w2'));
  assert.equal(s.bigCount, 1, 'one yield (owner call 12)');
});
test('step 7 (no rain): "The stones are orange. It wasn\'t running." and the stain line', () => {
  const { s, t } = fresh();
  s.debug.fixture('turn'); s.set('tauno.farm.met', true); s.set('kettle.visited', true);
  const r = play(new SceneRun(t, M.FARM, { who: 'tauno', args: {} }), 'well', ['No. South-west of Bald Eagle.', 'The stones are orange.']);
  assert.ok(r.said.some((x) => x && x.startsWith('That\'s the stain.')), r.said.join(' / '));
  assert.ok(s.has('door.mining.yield'));
});
test('step 8: Pietro\'s dig: with the map the sketch line; with NB70 the back door; with both the wrong hill (L2C); "Eino\'s sketch"', () => {
  const { s, t } = fresh();
  s.debug.fixture('turn'); s.set('tauno.farm.met', true);
  s.set('pietro.dig.seen', true);
  assert.ok(!s.has('key.L2C'), 'the Look alone is not the key');
  s.set('door.mining.yield', true);
  assert.ok(s.walt().includes('30:4.7.w.1') && !s.has('key.L2C'));
  s.markRead('NB70');
  for (const f of ['knows.backdoor', 'pietro.wronghill', 'key.L2C']) assert.ok(s.has(f), f);
  for (const w of ['30:4.7.w.2.2', '30:4.7.w.3']) assert.ok(s.walt().includes(w), w);
  play(new SceneRun(t, M.FARM, { who: 'tauno', args: {} }), 'morning', ['Eino\'s sketch']);
  assert.ok(s.walt().includes('30:4.5.w3'));
});
test('step 9: the clean book: the ask ("Not today." asked again, the same words), the ride, the slab, the five questions, the choice: both branches; On the record later', () => {
  for (const branch of ['record', 'owe']) {
    const { s, t } = fresh();
    s.debug.fixture('turn'); s.set('tauno.farm.met', true); s.set('door.mining.yield', true);
    assert.equal(M.farmEntry(s, { porchVisit: false }), 'morning', 'not the same visit as the map');
    assert.equal(M.farmEntry(s, { porchVisit: true }), 'ask');
    const r1 = play(new SceneRun(t, M.FARM, { who: 'tauno', args: {} }), 'ask', ['Not today.']);
    assert.ok(r1.said.includes(T('30:4.9.2')) && s.has('tauno.ride.declined') && !s.has('tauno.ride'));
    assert.equal(M.farmEntry(s, { porchVisit: true }), 'ask', 'asked again');
    let rode = 0, home = 0;
    const r2 = play(new SceneRun(t, M.FARM, { who: 'tauno', args: {}, hooks: { ride: () => { rode++; } } }), 'ask', ['Let\'s go.']);
    assert.equal(r2.said[0], T('30:4.9.1'), 'the same words');
    assert.ok(rode === 1 && s.has('tauno.ride'));
    // the road end: Tasha in the lot (he sits in the pickup), then the slab, then the questions
    assert.equal(M.slabEntry(s, { tashaHere: true }), 'wait');
    play(new SceneRun(t, M.SLAB, { who: 'tauno', args: {} }), 'wait', []);
    assert.equal(M.slabEntry(s, {}), 'core');
    play(new SceneRun(t, M.SLAB, { who: 'tauno', args: {} }), 'core', []);
    assert.equal(M.slabEntry(s, {}), 'q');
    const qrun = new SceneRun(t, M.SLAB, { who: 'tauno', args: {}, hooks: { home: () => { home++; } } });
    let node = qrun.node('q');
    assert.ok(!node.choices.some((c) => c.text === T('30:4.9.c7')), '"Why now?" appears last');
    const pick = branch === 'record' ? 'When it comes to it' : 'You don\'t owe anybody this.';
    const r3 = play(qrun, 'q', ['After Eino.', 'Walt and the papers.', 'Who found the canoe?', 'You said you never wrote', 'Why now?', pick]);
    assert.equal(home, 1, 'the drive home');
    for (const f of ['door.mining.climax', 'door.mining.done']) assert.ok(s.has(f), f);
    for (let n = 1; n <= 5; n++) assert.ok(s.walt().includes(`30:4.9.page.${n}`), `Walt line ${n}`);
    assert.equal(s.has('tauno.record'), branch === 'record');
    void r3;
    if (branch === 'owe') {
      const r4 = play(new SceneRun(t, M.FARM, { who: 'tauno', args: {} }), 'morning', ['On the record']);
      assert.ok(s.has('tauno.record') && s.walt().includes('30:4.9.w1'), 'On the record: the same answer and the flag');
      void r4;
    }
    // the porch afterwards: one opener in three is "I slept."; the closer "Same bench tomorrow."
    assert.equal(M.opener({ when: (e) => s.when(e), last: null, n: 0 }), '30:4.9.15');
    assert.notEqual(M.opener({ when: (e) => s.when(e), last: null, n: 1 }), '30:4.9.15');
    assert.equal(M.closer(s), '30:4.1.37');
  }
});
test('the locks: L1, L2, L5 and L6 each have their Round 2 keys from this arc (30 §6.1)', () => {
  const want = { L1: ['L1A', 'L1B', 'L1C'], L2: ['L2A', 'L2C'], L5: ['L5B'], L6: ['L6B', 'L6C'] };
  for (const [L, ks] of Object.entries(want)) { const lock = LOCKS.find((x) => x.id === L); for (const k of ks) assert.ok(lock.keys.some((q) => q.id === k), `${L} ${k}`); }
  assert.match(LOCKS[0].keys.find((k) => k.id === 'L1B').when, /knows\.twostump/, 'L1B widened to Tauno\'s telling');
});
test('the Farm cast: Len any morning but Thursday, the corner table on Thursday; Mary Tue/Fri 9–11; Brekke Thursdays (owner call 3)', () => {
  const { s } = fresh();
  const at = (abs, h, w) => { s.clock({ abs, hours: h }); return s.when(w); };
  // 20620 is a Monday? find a Thursday
  let thu = 20620; while (new Date(thu * 86400000).getUTCDay() !== 4) thu++;
  const tue = thu - 2;
  assert.ok(at(tue, 8, CAST.len.where.find((w) => w.id === 'dock').when) && !at(thu, 8, CAST.len.where.find((w) => w.id === 'dock').when));
  assert.ok(at(thu, 12, CAST.len.where.find((w) => w.id === 'table').when) && at(thu, 12, CAST.brekke.where[0].when));
  assert.ok(at(tue, 10, CAST.mary.where[0].when) && !at(thu, 10, CAST.mary.where[0].when));
});
test('90 §13 check 1 (cheap, open data): the provisional Kettle pad is clear of the real deposits (≥ 5 km), and "Kettle" is no real Minnesota deposit', () => {
  // the projection (public-data-v9 index.json proj) and the USGS MRDS points (Spruce Road 10038935, Maturi 10096418)
  const proj = { lat0: 48.09, lon0: -91.215, mPerDegLat: 111192.03815877548, mPerDegLon: 74495.49504086988 };
  const ll = (x, z) => ({ lat: proj.lat0 - z / proj.mPerDegLat, lon: proj.lon0 + x / proj.mPerDegLon });
  const km = (a, b) => { const R = 6371, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const K = ll(M.KETTLE.at.x, M.KETTLE.at.z), spruce = { lat: 47.8297, lon: -91.681 }, maturi = { lat: 47.8013, lon: -91.7557 };
  const d1 = km(K, spruce), d2 = km(K, maturi);
  console.log(`check 1: the Kettle pad at ${K.lat.toFixed(4)} N ${(-K.lon).toFixed(4)} W: Spruce Road ${d1.toFixed(1)} km, Maturi ${d2.toFixed(1)} km`);
  assert.ok(d1 >= 5 && d2 >= 5);
});
