// Stream b5's unit checks (Node, no browser): node --test scripts/cmp-b5-unit.mjs
// The boys' data (story-data/boys.js, rules-boys.js, leads-boys.js, episodes/arc-boys.js, cast.js's b5 block) against the
// extract, the condition compiler, facts.js and the Walt page's ids; the scenes played through StoryV2 from the end of
// chapter 1's slice (story.debug.fixture('turn')): Carol (the favour, the print, the nicknames), Denny (the card, Sparky,
// the rings, the cabin), Frank at Farm (the patch, the Kek), the yard (the round, tell 1, the permit), the camp (the round
// shared, the fire, the pan, the bet's setup), the 1998 story (L3A), the slide taken and matched (L3B), lock 3's yield; and
// the silhouette minigame itself (minigames/silhouette.js) on synthetic skylines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { texts, T, SceneRun, Topics, textIds } from '../src/topics.js';
import * as B from '../src/story-data/boys.js';
import { RULES_BOYS } from '../src/story-data/rules-boys.js';
import { RULES_ALL } from '../src/story-data/all-rules.js';
import * as LB from '../src/story-data/leads-boys.js';
import arc from '../src/story-data/episodes/arc-boys.js';
import { EPISODES } from '../src/story-data/episodes/index.js';
import { CAST } from '../src/story-data/cast.js';
import { WALT_LINES } from '../src/story-data/walt-lines.js';
import { factRow } from '../src/story-data/facts.js';
import { compile, registerSensor } from '../src/story-cond.js';
import { PENCIL_SENSORS } from '../src/pencil.js';
import { StoryV2 } from '../src/story.js';
import { installTurnFixture } from '../src/story-data/fixtures-a2.js';
import { silhouette, skylineError } from '../src/minigames/silhouette.js';
import { Minigames } from '../src/minigames.js';
for (const [k, v] of Object.entries({ ...PENCIL_SENSORS, ...B.B5_SENSORS })) registerSensor(k, v);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = {};
for (const f of readdirSync(path.join(ROOT, 'src/story-data/text')).filter((x) => x.endsWith('.json'))) { const j = JSON.parse(readFileSync(path.join(ROOT, 'src/story-data/text', f), 'utf8')); texts.add(j); Object.assign(TEXT, j.text); }
const PAGE = new Set([...WALT_LINES.map((w) => w.id), ...Object.entries(TEXT).filter(([, e]) => e.k === 'page').map(([id]) => id)]);
const SCENES = { CAROL: B.CAROL, BOB: B.BOB, DENNY: B.DENNY, FRANK: B.FRANK, YARD: B.YARD, CAMP: B.CAMP, STORY98: B.STORY98 };
const condsOf = (x, out = []) => { if (Array.isArray(x)) { for (const y of x) condsOf(y, out); return out; } if (x && typeof x === 'object') { if (typeof x.when === 'string' && x.when) out.push(x.when); for (const [k, v] of Object.entries(x)) if (k !== 'when') condsOf(v, out); } return out; };
const actsOf = (x, out = []) => { if (Array.isArray(x)) { for (const y of x) actsOf(y, out); return out; } if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k === 'then' && Array.isArray(v)) { for (const a of v) { if (typeof a === 'string') out.push(a); else actsOf(a, out); } } else actsOf(v, out); } return out; };

function fresh({ abs = 20670, hours = 10, args = {} } = {}) {
  const s = new StoryV2();
  s.attach({});
  s.clock({ abs, hours });
  for (const k of ['nickseen', 'ringon', 'ringed', 'onlake', 'carrying']) s.sensor(k, () => false);
  s.sensor('dayhash', () => 0);
  const acts = [];
  for (const k of ['give', 'pay', 'ring']) s.handle(k, (arg) => { acts.push(`${k}:${arg}`); return true; });
  installTurnFixture(s);
  s.debug.fixture('turn');
  const t = new Topics().attach({ story: s });
  const hooks = {}; const did = [];
  for (const h of ['rings', 'round', 'permit', 'share', 'bet']) hooks[h] = () => { did.push(h); if (h === 'round' || h === 'share') s.set('boys.round', true, 'test'); };
  const run = (def, extra = {}) => new SceneRun(t, def, { who: def.who, args: { ep: 38, ...Object.fromEntries(Object.keys(B.B5_SENSORS).map((k) => [k, false])), ...args, ...extra }, hooks });
  return { s, t, acts, did, run };
}
function play(run, start, picks) {
  let node = run.node(start);
  const said = [];
  const press = () => { for (let k = 0; node && !node.end && node.choices && node.choices.length === 1 && node.choices[0].text === '…' && k < 40; k++) { said.push(node.say); node = node.choices[0].go(); } };
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

test('every line id the boys\' data names resolves (and each walt: id is a Walt-page line)', () => {
  const ids = new Set([...textIds(SCENES), B.CAROL_CLOSE, ...B.PADDLE_BACK, ...Object.values(B.SLIDES), B.FRANK_CLOSE, ...B.STEP.map((l) => l.id), B.TAUNO_ON_FRANK, B.YARD_CLOSE, B.CAMP_BYE,
    ...B.HAIL.map((l) => l.id), ...Object.values(B.SHARE).map((l) => l.id), ...B.PAN_EAT.map((l) => l.id), ...B.CUP_ROCK.map((l) => l.id), B.CUP_BACK.id, B.CARRY_BARK.id, B.FRANK_FISH.id,
    B.WON.player.id, ...B.WON.frank.map((l) => l.id), ...B.LABELS.flatMap((L) => L.say), 'd95.b5.spoon', 'd95.b5.bet.end', 'd95.b5.slide.hint', 'd95.b5.slides.wall', ...arc.wants[0].say, arc.photo[0].words]);
  assert.deepEqual([...ids].filter((id) => T(id) == null), []);
  const walt = actsOf([SCENES, RULES_BOYS]).filter((a) => a.startsWith('walt:')).map((a) => a.slice(5));
  assert.deepEqual(walt.filter((w) => !PAGE.has(w)), []);
  for (const w of WALT_LINES.filter((r) => /^w\.b5\./.test(r.id))) assert.ok(T(w.ref), `${w.id} → ${w.ref}`);
});
test('every condition compiles clean; every fact written is declared; the rules and the record are in from construction', () => {
  const bad = [];
  for (const c of new Set([...condsOf([SCENES, RULES_BOYS, LB, arc, CAST.carol, CAST.bob, CAST.frank, CAST.denny]), ...Object.values(B.SCHEDULE).flatMap((x) => Object.values(x))])) {
    const r = compile(c); if (!r.ok || r.warnings.length) bad.push([c, ...r.errors, ...r.warnings]);
  }
  assert.deepEqual(bad, []);
  const undeclared = actsOf([SCENES, RULES_BOYS, arc]).filter((a) => a.startsWith('f:')).map((a) => a.slice(2).split('=')[0]).filter((k) => !factRow(k));
  assert.deepEqual(undeclared, []);
  for (const r of RULES_BOYS) assert.ok(RULES_ALL.includes(r), r.id);
  assert.ok(EPISODES.includes(arc));
  const a = new StoryV2(), b = new StoryV2(); assert.equal(a.dataHash(), b.dataHash()); assert.ok(a.rules.rules.has('b5.yield'));
});
test('the fixed party: in at Sawbill on the 8th (Kelso), C1210 the 9th to the 14th (parties.js b5 block; the browser rig checks the schedule)', () => {
  const src = readFileSync(path.join(ROOT, 'src/parties.js'), 'utf8'), blk = src.slice(src.indexOf('// b5: begin'), src.indexOf('// b5: end'));
  assert.ok(/id: 'boys\.in'[^\n]*date: '08-08\.\.08-08'[^\n]*sites: \[\[23289, 19716\]\]/.test(blk), 'boys.in');
  assert.ok(/id: 'boys'[^\n]*date: '08-09\.\.08-14'[^\n]*sites: \[\[15082, 6845\]\]/.test(blk), 'boys');
});
test('Carol: the opener, "The boys?" rings Farm and C1210, "Gene?" → the favour, "I\'ll go." (the room open: the arc\'s yes)', () => {
  const { s, run, acts } = fresh();
  assert.equal(B.carolEntry(s), 'hello');
  const r = play(run(B.CAROL), 'hello', ['You knew Walt?', 'The boys?', 'Gene?', 'I\'ll go.']);
  assert.ok(r.said[0].startsWith('Coffee\'s on.'), r.said[0]);
  for (const f of ['door.boys.open', 'carol.favour', 'carol.favour.asked', 'ep.boys.yes']) assert.ok(s.has(f), f);
  assert.ok(acts.includes('ring:farm31') && acts.includes('ring:boys.c1210') && acts.includes('ring:boys.frost'), acts.join(' '));
});
test('Carol: the print of Gene\'s paddle (the arc\'s want) opens the slides; the nicknames on a later visit (L: the nicknames piece)', () => {
  const { s, run } = fresh();
  play(run(B.CAROL), 'hello', ['You knew Walt?', 'Gene?', 'I\'ll go.']);
  s.rules.apply({ id: 'test:shown', then: arc.wants[0].then }, {});
  assert.ok(s.has('carol.slides.invited') && s.has('bob.trust'));
  assert.ok(s.understood ? s.understood('NB60') : s.when('und:NB60'), 'NB60 understood (Carol\'s favour done)');
  s.set('carol.slides.done', true, 'test');
  const r = play(run(B.CAROL, { slidesToday: false }), 'hub', ['Walt had names for them?']);
  assert.ok(r.said.some((l) => /He never gave anybody the obvious one/.test(l)));
  assert.ok(s.has('boys.nicknames') && s.fact('case.denny.nicknames').v === 'soft');
  assert.ok(s.walt().includes('32:6.1'));
});
test('Denny: the card at the first meeting, Sparky at the second (against himself), the rings and the cabin', () => {
  const { s, run, acts, did } = fresh({ hours: 15 });
  let r = play(run(B.DENNY), B.dennyEntry(s, { met: 0 }), ['Did Walt have a favourite spot?', 'Thanks.']);
  assert.ok(acts.includes('give:item.dennycard'));
  assert.ok(s.has('denny.card') && s.has('denny.rings') && s.has('denny.cabin') && did.includes('rings'));
  assert.ok(s.walt().includes('w.b5.rings'));
  assert.equal(B.dennyEntry(s, { met: 1 }), 'sparky');
  r = play(run(B.DENNY), 'sparky', []);
  assert.ok(r.said[0].includes('Sparky'));
  assert.ok(s.has('denny.sparky') && s.walt().includes('w.b5.sparky'));
});
test('tell 1 at the counter (Carol asks, 14–15): the Walt line', () => {
  const { s, run } = fresh({ hours: 14.5 });
  s.set('denny.card', true, 't'); s.set('denny.sparky', true, 't');
  const r = play(run(B.DENNY, { carolNear: true }), 'again', ['Tell me about Walt.']);
  assert.ok(r.said.some((l) => /Tuesday, it was a Tuesday/.test(l)));
  assert.ok(s.has('denny.tell1') && s.walt().includes('w.b5.tell1'));
});
test('Frank at Farm before seven: the shirt, the patch (the red herring), the Kek', () => {
  const { s, run } = fresh({ hours: 6.5 });
  const r = play(run(B.FRANK), 'hello', ['What\'s the shirt?', 'It\'s got the company\'s patch', 'Did Walt ever tell you where he was going?']);
  assert.ok(r.said[0].includes('up early'));
  assert.ok(s.has('frank.met') && s.has('frank.patch') && s.has('frank.kek'));
  assert.ok(s.walt().includes('32:6.12') && s.walt().includes('w.b5.kek'));
});
test('the yard (1–7 Aug): Walt\'s rule ("Fair enough."), tell 1 with Bob asking, "Where do you go?" → the permit', () => {
  const { s, run, did, acts } = fresh({ abs: Math.round(Date.UTC(2026, 7, 3) / 86400000) });
  const r = play(run(B.YARD), B.yardEntry(s), ['Fair enough.', 'Tell me about Walt.', 'Where do you go?']);
  assert.ok(did.includes('round') && did.includes('permit'));
  for (const f of ['boys.met', 'bob.met', 'frank.met', 'denny.met', 'boys.round', 'denny.tell1', 'boys.invited', 'boys.permit', 'bob.trust']) assert.ok(s.has(f), f);
  assert.ok(acts.includes('ring:boys.c1210'));
  assert.ok(r.said.some((l) => /I did one thing/.test(l)));
});
test('the camp: the hail\'s opener, the round shared, the fire, Walt\'s pan offered (an evening of the 10th–13th)', () => {
  const { s, run, did, acts } = fresh({ abs: Math.round(Date.UTC(2026, 7, 11) / 86400000), hours: 18 });
  const def = { ...B.CAMP, nodes: { ...B.CAMP.nodes, open: { ...B.CAMP.nodes.open, to: B.campStart(s, { pan: true }) } } };
  play(run(def, { withFood: true }), B.campEntry(s, {}), ['Fair enough.', 'Tell me about the flare.', 'The radio?']);
  assert.ok(did.includes('share') && s.has('boys.round') && s.has('boys.nicknames'));
  const def2 = { ...B.CAMP, nodes: { ...B.CAMP.nodes, again: { ...B.CAMP.nodes.again, to: B.campStart(s, { pan: true }) } } };
  play(run(def2, { withFood: true }), 'again', []);
  assert.ok(s.has('boys.pan.offered') && acts.includes('give:item.waltpan'));
  s.set('boys.pan', true, 'test'); assert.ok(s.walt().includes('w.b5.pan'));
});
test('the laker bet\'s setup (the 12th, 17:00), then the 1998 story on the water: L3A, the Walt lines, Denny\'s boy', () => {
  const { s, run, did, acts } = fresh({ abs: Math.round(Date.UTC(2026, 7, 12) / 86400000), hours: 17 });
  s.set('boys.visited', true, 't'); s.set('boys.round', true, 't');
  assert.equal(B.campEntry(s, { bet: true }), 'bet');
  play(run(B.CAMP), 'bet', []);
  assert.ok(s.has('boys.bet') && did.includes('bet') && acts.includes('give:item.waltspoon'));
  const r = play(run(B.STORY98), 'story98', ['Why didn\'t Denny go?', 'Which lake?']);
  assert.ok(r.said.some((l) => /notch in the ridge/.test(l)));
  for (const f of ['boys.story1998', 'bob.eastbay', 'frank.eastbay', 'key.L3A', 'door.boys.yield', 'bob.matt98']) assert.ok(s.has(f), f);
  assert.ok(s.walt().includes('w.b5.1998') && s.walt().includes('w.b5.1998matt'));
});
test('Bob on a Tuesday after trust: Matt (Rochester: hard), Walt\'s 2019 line, and clearing Frank', () => {
  const { s, run } = fresh({ hours: 10 });
  for (const f of ['bob.met', 'boys.round', 'bob.matt98', 'frank.patch', 'boys.nicknames']) s.set(f, true, 't');
  s.markRead('NB76', 'test');
  const r = play(run(B.BOB), 'again', ['Denny\'s boy was sick?', 'Frank works for the company.']);
  assert.ok(r.said.some((l) => /Got paid for somehow/.test(l)));
  assert.equal(s.fact('case.denny.rochester').v, 'hard');
  assert.ok(s.has('frank.cleared') && s.walt().includes('w.b5.frankguards') && s.walt().includes('32:6.9'));
});
test('the slide: taken (Walt line), matched by the silhouette (mg.silhouette.matched → gene.slide.matched: L3B, NB55)', () => {
  const { s } = fresh();
  s.rules.apply({ id: 't', then: ['f:boys.slide'] }, {});
  assert.ok(s.walt().includes('w.b5.slide'));
  const M = new Minigames().attach({ story: s }); M.register('silhouette', silhouette);
  const prof = Array.from({ length: 48 }, (_, k) => 2 + Math.sin(k / 5) * 1.5 + (k === 30 ? -1.2 : 0));
  let at = { x: 0, z: 0, bearing: 0.5, raised: true };
  const h = M.start('silhouette', { target: { x: 10, z: 10, face: 1.2, d: 70, deg: 7, hold: 1 }, profile: prof, view: () => at, horizon: (e, b) => prof.map((v) => v + Math.abs(b - 1.2) * 20 + Math.hypot(e.x - 10, e.z - 10) * 0.05) });
  for (let i = 0; i < 20; i++) assert.equal(h.update(0.25), null, 'off the bearing: no match');
  at = { x: 15, z: 12, bearing: 1.21, raised: true };
  let r = null; for (let i = 0; i < 12 && !r; i++) r = h.update(0.25);
  assert.ok(r && r.done && r.result === 'matched', JSON.stringify(h.state));
  assert.ok(s.has('mg.silhouette.matched') && s.has('gene.slide.matched') && s.has('key.L3B'));
  assert.ok(s.walt().includes('w.b5.match'));
  assert.ok(Math.abs(skylineError(prof, prof)) < 1e-9);
});
test('lock 3\'s yield counts once, from 3B alone too', () => {
  const { s } = fresh();
  s.rules.apply({ id: 't', then: ['f:boys.slide', 'f:mg.silhouette.matched'] }, {});
  assert.ok(s.has('key.L3B') && s.has('door.boys.yield') && !s.has('key.L3A'));
});
