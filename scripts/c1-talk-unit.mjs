// Stream T's unit checks (Node, no browser): node --test scripts/c1-talk-unit.mjs
// The Act I data (porch-act1.js, topics-act1.js, cast.js) against the extract (every line id resolves), the condition
// compiler (every condition compiles clean), facts.js (every fact written is declared) and the Walt page's ids; the
// scenes played through StoryV2 (the porch: warm and cold, the declines; the turn: Eino, the doors, S3); the push
// budget; the ambient pools (banned words, Walt lore after the notebook, reserved speakers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { texts, T, SceneRun, Topics, textIds, askText, TALK_SENSORS } from '../src/topics.js';
import { PORCH, P1, JOSIE, HERE, WALK_AWAY } from '../src/story-data/porch-act1.js';
import { KEEPER_TOPICS, FLOOR, NICKS } from '../src/story-data/topics-act1.js';
import { CAST } from '../src/story-data/cast.js';
import { RULES_TALK } from '../src/story-data/rules-talk.js';
import { WALT_LINES } from '../src/story-data/walt-lines.js';
import { factRow } from '../src/story-data/facts.js';
import { compile } from '../src/story-cond.js';
import { StoryV2 } from '../src/story.js';
import { Beats } from '../src/beats.js';
import { Ambient, BANNED, WALT_LORE, RESERVED } from '../src/ambient.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (f) => JSON.parse(readFileSync(path.join(ROOT, 'src/story-data/text', f), 'utf8'));
const opening = J('opening.json'), world = J('world.json');
texts.add(opening); texts.add(world);
const PAGE = new Set([...WALT_LINES.map((w) => w.id), ...Object.entries(opening.text).filter(([, e]) => e.k === 'page').map(([id]) => id)]);

// --- every condition, action and line id in the data ------------------------------------------------------------------
function walkScene(def, fn) {
  for (const [id, N] of Object.entries(def.nodes)) {
    fn({ where: `${def.id}.${id}`, node: N });
    for (const c of N.go || []) fn({ where: `${def.id}.${id}→${c.ask}`, choice: c });
  }
}
function condsOf(x, out = []) {
  if (Array.isArray(x)) { for (const y of x) condsOf(y, out); return out; }
  if (x && typeof x === 'object') { if (typeof x.when === 'string' && x.when) out.push(x.when); for (const [k, v] of Object.entries(x)) if (k !== 'when') condsOf(v, out); }
  return out;
}
function actsOf(x, out = []) {
  if (Array.isArray(x)) { for (const y of x) actsOf(y, out); return out; }
  if (x && typeof x === 'object') { for (const [k, v] of Object.entries(x)) { if (k === 'then' && Array.isArray(v)) { for (const a of v) { if (typeof a === 'string') out.push(a); else actsOf(a, out); } } else actsOf(v, out); } }
  return out;
}
const DATA = { PORCH, P1, JOSIE, KEEPER_TOPICS, FLOOR, CAST, RULES_TALK };

test('every line id the Act I data names resolves in the extract', () => {
  const ids = new Set([...textIds(DATA), ...Object.values(HERE), WALK_AWAY, '20:T1b.1', '20:X1.1', '20:5.2.19']);
  const miss = [...ids].filter((id) => T(id) == null && !id.startsWith('70.8.'));
  assert.deepEqual(miss, []);
  // the re-hooks' table row quotes (20 §9.2): each R line that a scene names
  for (const id of ids) if (id.includes('#')) assert.ok(T(id), id);
  assert.equal(T('20:9.2#R3.0'), 'You again.');
  assert.equal(T('20:9.2#R3.2'), 'Changed your mind?');
  assert.ok(askText(KEEPER_TOPICS.find((t) => t.id === 'nick.kek')).includes('the Kek'));
});
test('every condition compiles clean (no errors, no unknown fact or sensor)', () => {
  for (const k of Object.keys(TALK_SENSORS)) assert.ok(k);
  const bad = [];
  for (const c of condsOf(DATA)) { const r = compile(c); if (!r.ok || r.warnings.length) bad.push(`${c}: ${[...r.errors, ...r.warnings].join('; ')}`); }
  assert.deepEqual(bad, []);
});
test('every action is known, every fact written declared, every Walt line an id', () => {
  const bad = [];
  for (const a of actsOf(DATA)) {
    const m = /^([a-z]+):(.+)$/.exec(a);
    if (!m) { bad.push(`bad action ${a}`); continue; }
    if (m[1] === 'f') { const k = m[2].split('=')[0]; if (!factRow(k)) bad.push(`undeclared ${k}`); }
    else if (m[1] === 'walt') { if (!PAGE.has(m[2])) bad.push(`no walt line ${m[2]}`); }
    else if (m[1] !== 'do' && !['ppl', 'lead', 'und', 'emit'].includes(m[1])) bad.push(`unknown ${a}`);
  }
  for (const w of CAST.tauno.where.concat(CAST.josie.where)) if (w.fact && !factRow(w.fact)) bad.push(`undeclared ${w.fact}`);
  assert.deepEqual(bad, []);
});
test('the scene graphs: every `to` and `hub` is a node; no node unreachable', () => {
  for (const def of [PORCH, P1, JOSIE]) {
    const N = def.nodes, bad = [];
    walkScene(def, ({ where, node, choice }) => { const x = node || choice; for (const k of ['to', 'hub']) if (x[k] && !N[x[k]]) bad.push(`${where}: ${k} ${x[k]}`); });
    assert.deepEqual(bad, [], def.id);
  }
  const entries = ['T1', 'R3', 'changed', 'R4', 'R5', 'R7', 'resume', 'resumeU1', 'resumeU4', 'resumeU5', 'seat', 'U1'];
  const seen = new Set(), go = (id) => { if (!id || seen.has(id)) return; seen.add(id); const n = PORCH.nodes[id]; if (!n) return; go(n.to); go(n.hub); for (const c of n.go || []) go(c.to); };
  for (const e of entries) go(e);
  assert.deepEqual(Object.keys(PORCH.nodes).filter((k) => !seen.has(k)), []);
});

// --- the scenes, played ------------------------------------------------------------------------------------------------
function fresh() {
  const s = new StoryV2();
  s.attach({});
  s.addRules(RULES_TALK);
  s.clock({ abs: 20600, hours: 9 });
  const t = new Topics().attach({ story: s });
  return { s, t };
}
// play: choose by the start of the choice's words; '…' presses on
function play(run, start, picks, hooks = {}) {
  let node = run.node(start);
  const said = [];
  for (const p of picks) {
    for (let k = 0; node && !node.end && node.choices && node.choices.length === 1 && node.choices[0].text === '…' && k < 20; k++) { said.push(node.say); node = node.choices[0].go(); }
    if (!node || node.end) break;
    said.push(node.say);
    const c = node.choices.find((x) => x.text.startsWith(p));
    assert.ok(c, `no choice "${p}" in [${node.choices.map((x) => x.text).join(' | ')}] after "${node.say}"`);
    node = c.go();
  }
  for (let k = 0; node && !node.end && node.choices && node.choices.length === 1 && node.choices[0].text === '…' && k < 20; k++) { said.push(node.say); node = node.choices[0].go(); }
  if (node && node.end && node.after) node.after();
  void hooks;
  return { node, said };
}
test('the porch, warm (NB45 read), with the notebook told: T1 → T6, the door taken, no ring', () => {
  const { s, t } = fresh();
  s.set('nb.found', true); s.markRead('NB45'); s.markRead('NB88');
  const run = new SceneRun(t, PORCH, { who: 'tauno', args: { ep: 25, home: true } });
  const r = play(run, 'T1', ['Sorry?', 'Walk with him', 'I found a notebook', 'A Swede?', 'Who was Walt?', 'What’s BRM?'.replace('’', "'"), 'Something like what?', 'He wrote that someone', 'Who?', 'Who are you?', 'What do you want from me?', "What's the crib?", "I'll go look."]);
  assert.ok(r.said.includes(T('20:T1.1')));
  assert.ok(r.said.includes(T('20:T4.16')), 'warm: his name');
  for (const f of ['tauno.porch.done', 'tauno.porch.warm', 'tauno.porch.toldBook', 'door.crews.taken', 'knows.walt', 'knows.haapala', 'knows.boreal', 'knows.tauno']) assert.ok(s.has(f), f);
  for (const w of ['20:T3.w1', '20:T4.w4', '20:T4.w9', '20:T4.w11']) assert.ok(s.walt().includes(w), w);
  assert.equal(s.stage, 'S2');
  assert.ok(s.pencil().rings.length === 0, 'Tauno marks nothing');
});
test('the porch, not warm (NB45 unread): the Swede choice is absent; "Who are you?" keeps his name back', () => {
  const { s, t } = fresh();
  s.set('nb.found', true);
  const run = new SceneRun(t, PORCH, { who: 'tauno', args: { ep: 38 }, hooks: { here: () => HERE[38] } });
  let node = run.node('T1'); node = node.choices[0].go(); node = node.choices[0].go(); // Sorry? → T2 → walk
  for (let k = 0; node.choices.length === 1 && k < 5; k++) node = node.choices[0].go();
  assert.ok(!node.choices.some((c) => c.text.startsWith('A Swede?')));
  const r = play(run, 'T4', ['Who are you?', 'What are you doing here?', 'What do you want from me?', "I'm just here to paddle."]);
  assert.ok(r.said.includes(T('20:T4.17')));
  assert.ok(r.said.includes(T('20:6.6.4')), 'Sawbill: why he is here');
  assert.ok(s.has('door.crews.declined') && !s.has('door.crews.taken') && !s.has('knows.tauno'));
});
test('the declines: keep walking twice → X1 (declined1); R3 "You again." → not today → declined2; Farm "Changed your mind?" → yes works', () => {
  const { s, t } = fresh();
  s.set('nb.found', true);
  const decline = () => s.rules.apply({ id: 'x', then: [s.has('tauno.porch.declined1') ? 'f:tauno.porch.declined2' : 'f:tauno.porch.declined1'] }, {});
  const mk = () => new SceneRun(t, PORCH, { who: 'tauno', args: { ep: 25 }, hooks: { decline } });
  let r = play(mk(), 'T1', ['Keep walking', 'Keep walking']);
  assert.ok(s.has('tauno.porch.declined1') && r.said.includes(T('20:T1b.1')));
  r = play(mk(), 'R3', ['Not today.']);
  assert.ok(r.said.includes('You again.') && s.has('rehook.R3') && s.has('tauno.porch.declined2'));
  r = play(mk(), 'changed', ['Walk with him', 'Who\'s Walt?', 'What do you want from me?', "I'll go look."]);
  assert.ok(r.said.includes('Changed your mind?') && s.has('tauno.porch.done') && s.has('door.crews.taken'));
});
test('the turn: U1 reports, U2 pink, U3 Eino (tauno.turn: S3), U4 the word, U5 the four doors named', () => {
  const { s, t } = fresh();
  s.set('nb.found', true);
  for (const f of ['tauno.porch.done', 'door.crews.taken', 'crews.seen', 'crews.crib', 'crews.pink', 'crews.blaze', 'crews.nwdrift']) s.set(f, true);
  const run = new SceneRun(t, PORCH, { who: 'tauno', args: { ep: 31, farm: true, first: true } });
  const r = play(run, 'U1', ["The crib's still there.", 'There\'s an old blaze', 'The wind took', 'North-west.', 'Somebody\'s flagged', 'Pink. New.', 'Measuring for who?', 'Away from the west shore', 'Who\'s Ollie?', 'Somebody killed him.', 'Marlys?', 'His sister?', "I'll go."]);
  assert.ok(r.said.includes(T('20:U1.2')), 'Farm, the first time');
  assert.ok(r.said.includes(T('20:U3.8')), 'the drift: "You\'ve seen what it does"');
  assert.ok(!r.said.includes(T('20:U3.1')), 'after pink: the first line without its first words');
  for (const f of ['tauno.pink', 'knows.eino', 'tauno.upwind', 'tauno.turn', 'tauno.killed', 'knows.tauno', 'door.guiding.named', 'door.boys.named', 'door.family.named', 'door.mining.named']) assert.ok(s.has(f), f);
  assert.equal(s.stage, 'S3');
  for (const w of ['20:U2.w1', '20:U4.w1', '20:U4.w2', '20:U1.w1', 'w.turn.drift', 'w.door.family']) assert.ok(s.walt().includes(w), w);
  assert.ok(r.said.some((x) => x.endsWith('And you know where I am mornings.') || x === T('20:U5.2')), 'at Farm');
});
test('P1: the keeper by manner, Josie by the week and the back room; "I\'ll wait for a rental." leaves it on the shelf', () => {
  const { s, t } = fresh();
  let shelved = 0, cont = 0;
  const run = new SceneRun(t, P1, { who: 'josie', args: { ep: 25 }, cont: () => { cont++; return { say: 'after', choices: [] }; },
    hooks: { keeper: () => ({ id: P1.keeper[1], by: 'Gus' }), week: () => P1.week[2].id, bundle: () => ({ text: T('20:1.2.14').replace(/behind the \{[^}]*\}/, T(P1.backroom[25]).replace(/^…\s*/, '').replace(/\.$/, '')) }), extra: () => P1.extra[25],
      shelf: () => { shelved++; s.set('bundle.shelf', true); } } });
  let node = run.node('open');
  assert.equal(node.by, 'Gus');
  const said = [];
  for (let k = 0; node.choices.length === 1 && k < 6; k++) { said.push(node.say); node = node.choices[0].go(); }
  said.push(node.say);
  assert.ok(said.some((x) => x.includes('in a box that came in on the trailer')), said.join(' / '));
  assert.ok(said.includes(T('20:1.3.10')));
  node = node.choices.find((c) => c.text.startsWith('How much?')).go();
  assert.equal(node.say, T('20:1.2.18'));
  node = node.choices.find((c) => c.text.startsWith("I'll wait")).go();
  for (let k = 0; node && node.choices && node.choices.length === 1 && k < 4; k++) node = node.choices[0].go();
  assert.ok(shelved === 1 && cont === 1 && s.has('bundle.shelf'));
});

// --- the keepers' topics -------------------------------------------------------------------------------------------------
function keeperRig(ep = 31, name = 'Ruth Aho', manner = 'warm', home = 31) {
  const { s, t } = fresh();
  const rings = [];
  const said = new Set();
  const npcs = { charOf: () => ({ manner }), mark: (x) => said.add(x), askChoices: () => [{ text: 'That’s all.', go: () => null }], landingOf: (e) => ({ x: 1000 * e, z: 0, lake: e }) };
  const pencil = { ring: (o) => { rings.push(o); return o; } };
  t.attach({ npcs, pencil, profile: { started: true, home } }).use({ keeper: KEEPER_TOPICS, floor: FLOOR });
  return { s, t, rings, v: { key: `k:${ep}`, ep, keeper: true, name } };
}
test('the return: "Whose gear was this?" on top in gold (the keeper\'s own words, Josie\'s at home); nothing before night one', () => {
  const { s, t, v } = keeperRig();
  assert.equal(t.top(v), null);
  assert.equal(t.items(v).length, 0, 'no Walt lore before the notebook');
  s.set('nb.found', true);
  const top = t.top(v);
  assert.equal(top.text, T('20:5.2.c1'));
  let n = top.go();
  assert.equal(n.say, world.text['70.8.1.1'].text);
  n = n.choices[0].go(); // Go on? no: Ruth's next is Josie's (the 70 line has no Go on)
  assert.ok(n.say === T('20:5.2.14') && n.by === 'Josie');
  assert.ok(s.walt().includes('20:5.2.w1') && s.get('walt.gear') === 31);
  assert.equal(t.top(v), null, 'once');
  assert.ok(t.items(v).some((i) => i.text === 'Who’d know about Walt?'), 'the floor');
});
test('the first rings: Little Gabbro (with the drive line), then Bald Eagle\'s west shore; two a talk at most; the floor never spent', () => {
  const { s, t, rings, v } = keeperRig(25, 'Gus Lindgren', 'gruff', 1);
  s.set('nb.found', true); s.set('tauno.porch.done', true); s.set('door.crews.taken', true); s.set('tauno.said.t5', true);
  let it = t.items(v).find((i) => i.text === T('20:7.3.c1'));
  let n = it.go();
  assert.equal(n.say, T('20:7.3.lg.3'));
  n = n.choices[0].go();
  assert.equal(n.say, T('20:7.3.drive'));
  assert.equal(rings.length, 1); assert.equal(rings[0].by, 'Gus'); assert.equal(rings[0].lead, 'crews');
  assert.equal(s.get('ring.lg'), 'Gus');
  it = t.items(v).find((i) => i.text === T('20:7.3.c2'));
  it.go();
  assert.equal(rings.length, 2);
  const farm = t.items(v).find((i) => i.text === T('20:7.3.c3'));
  farm.go();
  assert.equal(rings.length, 2, 'a conversation pencils at most two rings');
  const fl = t.items(v).find((i) => i.text === 'Who’d know about Walt?');
  assert.equal(fl.go().say, T('20:7.3.4'));
  assert.ok(t.items(v).some((i) => i.text === 'Who’d know about Walt?'), 'never spent');
});
test('the doors\' rings after the turn; at Moose Lake itself, "You\'re standing in it." and no ring', () => {
  const { s, t, rings, v } = keeperRig(25, 'Gus Lindgren', 'gruff', 1);
  s.set('nb.found', true); for (const d of ['guiding', 'boys', 'family', 'mining']) s.set(`door.${d}.named`, true);
  const m = t.items(v).find((i) => i.text === T('20:12.4.c1'));
  assert.equal(m.go().say, T('20:12.4.2'));
  assert.equal(rings.length, 0);
  assert.ok(s.has('door.guiding.ringed'));
  t.items(v).find((i) => i.text === T('20:12.4.c3')).go();
  assert.equal(rings.length, 1); assert.equal(s.has('door.family.ringed'), true);
});
test('nicknames: a keeper rings an easy one only once it is on the Walt page and not inked', () => {
  const { s, t, v } = keeperRig();
  s.set('nb.found', true);
  assert.ok(!t.items(v).some((i) => /Front Porch/.test(i.text)));
  s.set('walt.nick.frontporch', true);
  assert.ok(t.items(v).some((i) => /Front Porch/.test(i.text)));
  assert.equal(NICKS.length, 4);
});

// --- the push budget -----------------------------------------------------------------------------------------------------
test('the push budget: one a trip; one in three trips unless engaged in the last two', () => {
  const s = new StoryV2(); s.attach({});
  let trips = 0; s.ctx.tripN = () => trips;
  const B = new Beats().attach(s);
  assert.ok(B.push('tauno.porch'));
  assert.ok(!B.can('R1'), 'one push a trip');
  trips = 1; assert.ok(!B.can('R3'), 'not engaged: wait');
  trips = 3; assert.ok(B.can('R3'), 'three trips on');
  trips = 4; B.push('R3'); trips = 5; assert.ok(!B.can('R4'));
  s.set('tauno.talk', true); // engaged on trip 5
  trips = 6; assert.ok(B.can('R4'), 'engaged in the last two');
});

// --- ambient -------------------------------------------------------------------------------------------------------------
test('ambient: no banned word in any pool; Walt lore needs the notebook; no reserved speaker among visitors\' barks', () => {
  const A = new Ambient().use(world);
  for (const k of ['rumour', 'bark', 'josie', 'keeper', 'road']) {
    for (const l of A.all(k)) {
      assert.ok(!BANNED.test(l.text), `${l.id} banned`);
      if (WALT_LORE.test(l.text)) assert.ok(/f:nb\.found/.test(l.cond), `${l.id} lore without nb.found`);
      if (k === 'bark') assert.ok(!RESERVED.test(l.who || ''), `${l.id} reserved`);
    }
  }
  const s = new StoryV2(); s.attach({}); s.clock({ abs: 20600, hours: 10 });
  A.attach({ story: s });
  assert.ok(!A.lines('rumour', {}).some((l) => WALT_LORE.test(l.text)), 'before night one: no Walt lore');
  s.set('nb.found', true);
  assert.ok(A.lines('rumour', {}).some((l) => WALT_LORE.test(l.text)));
  assert.ok(A.roadLine({ roads: ['the Fernberg Road'], towns: ['Ely'], eps: [25, 31], seed: 1 }));
});
