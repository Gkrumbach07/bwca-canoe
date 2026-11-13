// Stream a4's unit checks (Node, no browser): node --test scripts/cmp-a4-unit.mjs
// The family arc's data (story-data/family.js, rules-family.js, leads-family.js, episodes/arc-family.js, cast.js's a4
// block) against the extract, the condition compiler, facts.js and the Walt page's ids; then the scenes played through
// StoryV2 from story.debug.fixture('turn') (the end of chapter 1): Aili's door step by step (the tent, the photo, the
// lilac print and the stone: L4A; the kitchen table; the guest book), the setbacks, Jon (first meeting, the denial after
// the chase, won over by the last page), Liisa (two stories, one shown in his hand; "Come back Monday."; the can: L4D),
// the porch's two branches, Gord's camp ("went north" with Danielle's log), Danielle re-sited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { texts, T, SceneRun, Topics, textIds } from '../src/topics.js';
import * as F from '../src/story-data/family.js';
import { RULES_FAMILY } from '../src/story-data/rules-family.js';
import { RULES_ALL } from '../src/story-data/all-rules.js';
import * as LF from '../src/story-data/leads-family.js';
import arc from '../src/story-data/episodes/arc-family.js';
import { EPISODES } from '../src/story-data/episodes/index.js';
import { CAST } from '../src/story-data/cast.js';
import { WALT_LINES } from '../src/story-data/walt-lines.js';
import { factRow } from '../src/story-data/facts.js';
import { compile, registerSensor } from '../src/story-cond.js';
import { PENCIL_SENSORS } from '../src/pencil.js';
import { StoryV2 } from '../src/story.js';
import { installTurnFixture } from '../src/story-data/fixtures-a2.js';
for (const [k, v] of Object.entries({ ...PENCIL_SENSORS, ...F.A4_SENSORS })) registerSensor(k, v);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = {};
for (const f of readdirSync(path.join(ROOT, 'src/story-data/text')).filter((x) => x.endsWith('.json'))) { const j = JSON.parse(readFileSync(path.join(ROOT, 'src/story-data/text', f), 'utf8')); texts.add(j); Object.assign(TEXT, j.text); }
texts.add({ text: F.DRAFT });
const PAGE = new Set([...WALT_LINES.map((w) => w.id), ...Object.entries(TEXT).filter(([, e]) => e.k === 'page').map(([id]) => id)]);
const SCENES = { AILI: F.AILI, PORCH: F.PORCH, JON: F.JON, LIISA: F.LIISA, GORD: F.GORD, DANIELLE: F.DANIELLE };

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
function asksOf(x, out = []) {
  if (Array.isArray(x)) { for (const y of x) asksOf(y, out); return out; }
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k === 'ask' && typeof v === 'string') out.push(v); else if (k === 'say' && Array.isArray(v)) { for (const l of v) { if (typeof l === 'string') out.push(l); else if (l && l.id) out.push(l.id); else if (l && l.first) for (const f of l.first) out.push(typeof f === 'string' ? f : f.id); } } else asksOf(v, out); }
  return out;
}

// --- a story at the end of chapter 1, a clock, the sensors the scenes read ------------------------------------------------
// abs 20620 is 2026-06-15 (a Monday); hours 10
function fresh({ abs = 20621, hours = 10 } = {}) {
  const s = new StoryV2();
  s.attach({});
  s.clock({ abs, hours });
  installTurnFixture(s);
  s.debug.fixture('turn');
  s.sensor('nickseen', () => false); s.sensor('ringon', () => false); s.sensor('ringed', () => false); s.sensor('onlake', () => false); s.sensor('dayhash', () => 0);
  const ppl = () => (s.doc.ppl && s.doc.ppl.aili) || {};
  s.sensor('ailistep', () => F.ailiStep(s, s.doc.season));
  s.sensor('ailialive', () => ppl().alive || 0);
  s.sensor('ailishut', () => ppl().shut === Math.floor(s.nowAbs()));
  s.sensor('liisanext', (arg) => F.nextStory(s, (nb) => s.nbHas('read', nb)) === arg);
  s.sensor('liisaready', () => F.liisaReady(s));
  s.sensor('shook', (arg) => s.get('jon.chase') === arg);
  const acts = [];
  for (const k of ['give', 'pay', 'ring']) s.handle(k, (arg) => { acts.push(`${k}:${arg}`); return true; });
  const t = new Topics().attach({ story: s });
  return { s, t, acts };
}
const day = (s, n = 1, hours = 10) => { const tm = s.time(); s.clock({ abs: tm.abs + n, hours }); };
const hooks = (s, log = []) => ({
  opener: () => F.OPENERS[0],
  alive: () => { const p = s.person('aili', 'met', '+', 0, 'unit'); p.alive = (p.alive || 0) + 1; if (p.alive >= 2) p.shut = Math.floor(s.nowAbs()); if (p.alive >= 3) p.drop = s.nowAbs() + 3; log.push('alive'); },
  shut: () => { s.person('aili', 'met', '+', 0, 'unit').shut = Math.floor(s.nowAbs()); log.push('shut'); },
  cold: () => { s.person('aili', 'met', '+', 0, 'unit').coldSeason = s.doc.season; log.push('cold'); },
  keepPot: () => log.push('keepPot'), porch: () => log.push('porch'), holdCan: () => log.push('holdCan'), canBack: () => log.push('canBack'), canTaken: () => log.push('canTaken'), pick: () => log.push('pick'), sit: () => log.push('sit'),
});
function play(t, def, start, picks, log = []) {
  const run = new SceneRun(t, def, { who: def.who, args: { ep: 12 }, hooks: hooks(t.story, log), vars: { site: 'Sand Point', lake: 'Loon Lake' } });
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

test('every id the family data names resolves (the extract or a build draft); every walt: id is a Walt-page line', () => {
  const ids = new Set([...asksOf(SCENES), ...F.OPENERS, ...F.STORIES.map((x) => x.say), ...textIds(SCENES)]);
  const miss = [...ids].filter((id) => T(id) == null);
  assert.deepEqual(miss, []);
  const walt = actsOf([SCENES, RULES_FAMILY]).filter((a) => a.startsWith('walt:')).map((a) => a.slice(5));
  assert.deepEqual(walt.filter((w) => !PAGE.has(w)), []);
});
test('every condition compiles clean; every fact written is declared; the rules and the record are in', () => {
  const bad = [];
  for (const c of new Set([...condsOf([SCENES, RULES_FAMILY, LF, arc, CAST.aili, CAST.jon, CAST.liisa, CAST.gord, CAST.danielle, F.WANTS]), ...Object.values(F.SCHEDULE).flatMap((x) => Object.values(x))])) {
    const r = compile(c); if (!r.ok || r.warnings.length) bad.push([c, ...r.errors, ...r.warnings]);
  }
  assert.deepEqual(bad, []);
  const facts = actsOf([SCENES, RULES_FAMILY]).filter((a) => a.startsWith('f:')).map((a) => a.slice(2).split('=')[0]);
  assert.deepEqual(facts.filter((k) => !factRow(k)), []);
  for (const r of RULES_FAMILY) assert.ok(RULES_ALL.includes(r), r.id);
  assert.ok(EPISODES.includes(arc));
});
test('Aili\'s door: the tent, the photo, the lilac print (the stone: L4A, the yield), the kitchen table, the guest book', () => {
  const { s, t, acts } = fresh();
  assert.equal(F.ailiEntry(s, { carrying: true, nightOne: true }), 'first_B');
  play(t, F.AILI, 'first_B', ['It\'s holding up.', 'I\'ll go.']);
  assert.ok(s.has('aili.met') && s.has('door.family.open') && s.has('aili.tent'));
  assert.ok(s.has('aili.sit'), 'the tent carried in: step 1 at once');
  assert.ok(s.walt().includes('33:5.w1'), 'the teaching moment');
  s.set('tier.1', true, 'unit'); assert.ok(s.has('tier.2'), 'the arc started is tier 2 (from tier 1)');
  day(s);
  assert.equal(F.ailiEntry(s, { nightOne: true }), 'sit');
  play(t, F.AILI, 'sit', ['The photo on the wall?', 'Is the place still there?', 'Why not?', 'I\'ll go.']);
  assert.ok(s.has('knows.mummos'));
  // the gift she never asked for: the June print (show.js's want → her scene's 'lilacs')
  assert.equal(F.ailiEntry(s, { nightOne: true, gift: 'print' }), 'lilacs');
  const r = play(t, F.AILI, 'lilacs', ['What does it mean?']);
  assert.ok(r.said.some((x) => /white stone on the stump/.test(x)));
  assert.ok(s.has('aili.stone') && s.has('key.L4A') && s.has('door.family.yield') && s.has('aili.slip'));
  assert.ok(s.walt().includes('33:6.4.w.3'));
  assert.equal(F.ailiStep(s), 2);
  // the kitchen table: Eino's name known (the turn), a day since the stone
  let open = play(t, F.AILI, 'sit', []).choices; assert.ok(!open.includes('Eino.'), 'not the same day');
  day(s);
  open = play(t, F.AILI, 'sit', []).choices; assert.ok(open.includes('Eino.'));
  play(t, F.AILI, 'sit', ['Eino.', 'No gun for a duck hunt.', 'Before that?', 'Who was he?']);
  assert.ok(s.has('aili.kitchen') && s.has('knows.eino.morning') && s.has('aili.sorensen'));
  assert.equal(F.ailiStep(s), 3);
  day(s);
  play(t, F.AILI, 'sit', ['Who came to the memorial?', 'Can I take a picture?']);
  assert.ok(s.has('aili.guestbook') && acts.includes('give:item.guestbook'));
});
test('the setbacks: "Did Walt drown?" twice shuts her for the day; the third drops a step for three days', () => {
  const { s, t } = fresh(), log = [];
  play(t, F.AILI, 'first_B', ['Whose tent?', 'Did Walt drown?', 'Did Walt drown?'], log);
  assert.equal(s.doc.ppl.aili.shut, Math.floor(s.nowAbs()));
  assert.equal(F.ailiEntry(s, { nightOne: true, shut: true }), 'shut');
  day(s);
  play(t, F.AILI, 'sit', ['Did Walt drown?'], log);
  assert.equal(F.ailiStep(s), 0, 'a step dropped');
  day(s, 4);
  assert.equal(F.ailiStep(s), 1, 'back after three game days');
});
test('Jon: the first meeting, the denial after the chase (its tell), won over by the last page; the canary', () => {
  const { s, t } = fresh(), log = [];
  assert.equal(F.jonEntry(s), 'first');
  play(t, F.JON, 'first', ['Nice walleye.']);
  assert.ok(s.has('jon.met') && s.walt().includes('a4:w.jon'));
  s.set('jon.chase', 'islands', 'unit');
  assert.equal(F.jonEntry(s), 'denial');
  const d = play(t, F.JON, 'denial', ['That was you on Sand Point.']);
  assert.ok(d.said.some((x) => /island you sat behind/.test(x)), 'shook in the islands: the island line');
  assert.ok(s.has('jon.denied') && s.walt().includes('33:6.7.w.1'));
  s.meet('jon', 'unit'); s.meet('jon', 'unit');
  assert.equal(F.jonEntry(s), 'short');
  play(t, F.JON, 'short', ['Read this.', '\'If you are reading this.\'', 'Where are you headed next?'], log);
  assert.equal(s.get('jon.won'), 'page');
  assert.ok(s.has('jon.protect') && log.includes('pick'));
});
test('Liisa: two stories (one in his hand), "Come back Monday.", the can on a Monday: L4D, a "went north" piece', () => {
  const { s, t } = fresh({ abs: 20622 }), log = []; // (a Tuesday)
  s.set('door.family.open', true, 'unit');
  for (const nb of ['NB04', 'NB06']) s.markRead(nb, 'unit');
  assert.equal(F.liisaEntry(s), 'first');
  play(t, F.LIISA, 'first', ['Did he drown?', 'Christmas cards?']);
  assert.ok(s.has('liisa.met') && s.walt().includes('33:6.9.w.1'));
  play(t, F.LIISA, 'hub', ['Tell her one of his stories.', 'It\'s in his notebook.', 'Tell her one of his stories.', 'People talk.']);
  assert.equal(s.keys('liisa.told.').length, 2);
  assert.ok(F.liisaReady(s));
  assert.equal(F.liisaEntry(s, { monday: false }), 'notMonday');
  play(t, F.LIISA, 'notMonday', []);
  assert.ok(s.has('liisa.monday'));
  assert.equal(F.liisaEntry(s, { monday: true }), 'can');
  play(t, F.LIISA, 'can', ['Who sends them?', 'When did they start?', 'Can I look at them?'], log);
  assert.ok(s.has('cards.seen') && s.has('cards.stone') && s.has('key.L4D'));
  assert.ok(log.includes('porch') && log.includes('holdCan'));
});
test('the porch: "Liisa thought you\'d want them in the house." (thank you; the stone after, if not given) and "I know." (cold)', () => {
  const a = fresh(), log = [];
  a.s.set('aili.met', true, 'unit'); a.s.set('door.family.open', true, 'unit'); a.s.set('aili.tent', true, 'unit');
  play(a.t, F.PORCH, 'can', ['Liisa thought'], log);
  assert.equal(a.s.get('choice.aili'), 'thanks');
  assert.ok(a.s.has('door.family.climax') && a.s.has('door.family.done') && a.s.walt().includes('33:6.10.after'));
  assert.equal(F.ailiEntry(a.s, { nightOne: true }), 'stone2');
  play(a.t, F.AILI, 'stone2', []);
  assert.ok(a.s.has('aili.stone') && a.s.has('key.L4A'), 'the kindness is the gift');
  const b = fresh();
  b.s.set('aili.met', true, 'unit'); b.s.set('door.family.open', true, 'unit'); b.s.set('aili.sit', true, 'unit');
  play(b.t, F.PORCH, 'can', ['I know.'], log);
  assert.equal(b.s.get('choice.aili'), 'know');
  assert.ok(b.s.has('jon.cold') && b.s.walt().includes('33:6.10.know.1'));
  assert.equal(F.ailiEntry(b.s, { nightOne: true, season: b.s.doc.season }), 'cold');
});
test('Gord\'s camp and Danielle\'s log (re-sited): two "went north" pieces turn the line', () => {
  const { s, t } = fresh();
  assert.equal(s.north, false);
  play(t, F.GORD, 'meet', ['Do Americans come up much?', 'Anyone lately?', 'What was he like?', 'How do you know he was a Finn?']);
  assert.ok(s.has('gord.told') && s.walt().includes('33:6.13.w.1'));
  play(t, F.DANIELLE, 'meet', ['Ever find a canoe?']);
  assert.ok(s.has('danielle.log'));
  assert.equal(s.north, true);
  // the stone question waits for the pattern (the stones known, or Aili's word, or the cards)
  assert.ok(!play(t, F.DANIELLE, 'hub', []).choices.includes('A white stone on a stump?'));
  s.set('knows.stones', true, 'unit');
  play(t, F.DANIELLE, 'hub', ['A white stone on a stump?']);
  assert.ok(s.has('danielle.stone'));
  s.set('carp.stump', true, 'unit'); s.set('carp.stone', true, 'unit');
  assert.ok(s.walt().includes('a4:w.carp'));
});
test('lock 4 keeps two independent keys reachable from the family (A from Aili, D from Liisa)', () => {
  const L4 = (s) => ['L4A', 'L4D'].filter((k) => s.has(`key.${k}`));
  const a = fresh();
  a.s.set('aili.met', true, 'unit'); a.s.set('aili.sit', true, 'unit');
  play(a.t, F.AILI, 'pot', ['I\'d like to cook with it.']);
  assert.deepEqual(L4(a.s), ['L4A']);
  assert.equal(a.s.get('aili.pot'), 'cook');
  const b = fresh();
  b.s.set('door.family.open', true, 'unit'); b.s.set('liisa.met', true, 'unit');
  for (const nb of ['NB04', 'NB06', 'NB16']) { b.s.markRead(nb, 'unit'); b.s.set(`liisa.told.${nb}`, true, 'unit'); }
  play(b.t, F.LIISA, 'can', ['Can I look at them?']);
  assert.deepEqual(L4(b.s), ['L4D']);
});
