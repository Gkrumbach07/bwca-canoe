// Stream 7b's unit checks (Node, no browser): node --test scripts/cmp-7b-unit.mjs
// S5 and S6 against the engine: the records pass the runner's own check; every place condition compiles and names
// declared facts; every line the scenes and topics name is a real text id; the dive (seeing, breath, three dives, the
// case); the pit opened plank by plank through StoryV2 gives lock 6 key C; the chart in the book and the notch give lock
// 2 key D and lock 3 key D; S5's ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoryV2 } from '../src/story.js';
import { compile } from '../src/story-cond.js';
import { factRow } from '../src/story-data/facts.js';
import { checkRecord } from '../src/episodes.js';
import { KITS } from '../src/story-props.js';
import S5 from '../src/story-data/episodes/s5-plane.js';
import S6 from '../src/story-data/episodes/s6-whiskey.js';
import { PETE, ORRIN, KEEPER_7B, HAP_S5, HAP_S5_NODES, AILI_S6, GORD_S6 } from '../src/story-data/sides-7b.js';
import { seeing, dive, breathOf, pitState, DIVE } from '../src/minigames/dive.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PJ = JSON.parse(readFileSync(path.join(ROOT, 'src/story-places.json'), 'utf8'));
const TEXT = {};
for (const f of readdirSync(path.join(ROOT, 'src/story-data/text')).filter((x) => x.endsWith('.json'))) Object.assign(TEXT, JSON.parse(readFileSync(path.join(ROOT, 'src/story-data/text', f), 'utf8')).text);
const MINE = PJ.places.filter((p) => /^(kek\.plane$|s6\.)/.test(p.id));

function fresh() {
  const s = new StoryV2();
  s.attach({}); s.clock({ abs: 20640, hours: 10 });
  for (const k of ['lowwater', 'iceseason']) s.sensor(k, () => false);
  s.sensor('peers', () => 0);
  for (const k of ['nickseen', 'ringon', 'ringed', 'onlake']) s.sensor(k, () => false);
  const paid = [];
  for (const k of ['give', 'ring']) s.handle(k, () => true);
  s.handle('pay', (arg) => { paid.push(arg); return true; });
  const run = (then) => s.rules.apply({ id: 'unit', then }, {});
  const W = (c) => !c || c === 'true' || s.when(c);
  const verb = (prop, name) => { for (const p of MINE) { const v = p.verbs.find((q) => q.prop === prop && q.verb === name); if (v) return v; } assert.fail(`${prop} ${name}`); return null; };
  const use = (prop, name) => { const v = verb(prop, name); assert.ok(W(v.when), `${prop} ${name}: ${v.when}`); run(v.then); };
  const can = (prop, name) => W(verb(prop, name).when);
  return { s, run, use, can, paid };
}

test('the records pass the runner, no slots, each with a yes door', () => {
  for (const R of [S5, S6]) assert.deepEqual(checkRecord(R), [], R.id);
});

test('the places: kits known, conditions compile, facts declared, resolved for this release', () => {
  assert.equal(MINE.length, 3);
  for (const p of MINE) {
    assert.ok(PJ.resolved.places[p.id], `${p.id} resolved`);
    for (const pr of p.props) assert.ok(KITS.includes(pr.kit), `${pr.id}: kit ${pr.kit}`);
    const conds = [...p.props.flatMap((pr) => [pr.show, ...(pr.dot || []).map((d) => d.when)]), ...p.verbs.map((v) => v.when), ...p.triggers.map((t) => t.when)].filter((c) => c && c !== 'true');
    for (const c of conds) { const r = compile(c); assert.ok(r.ok && !r.warnings.length, `${p.id}: ${c}: ${[...r.errors, ...r.warnings]}`); }
    for (const a of [...p.verbs.flatMap((v) => v.then), ...p.triggers.flatMap((t) => t.then)]) { const [k, ...rest] = a.split(':'); if (k === 'f') assert.ok(factRow(rest.join(':').split('=')[0]), `${p.id}: fact ${a}`); }
  }
});

test('every line the scenes, topics and records name is a text id', () => {
  const ids = new Set();
  const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { for (const [k, v] of Object.entries(x)) { if (k === 'when' || k === 'then' || k === 'once') continue; if (k === 'id') continue; if ((k === 'ask' || k === 'text' || k === 'line' || k === 'say') && typeof v === 'string') ids.add(v); else walk(v); } } else if (typeof x === 'string' && /^(S[56]\.|d95\.7b\.)/.test(x)) ids.add(x); };
  walk([PETE.nodes, ORRIN.nodes, KEEPER_7B, HAP_S5, HAP_S5_NODES, AILI_S6, GORD_S6, S5.page, S5.ends, S6.page, S6.ends]);
  for (const r of [S5, S6]) for (const d of r.doors) if (d.line) ids.add(d.line);
  for (const id of ['S5.first', 'S6.first', 'S6.pitdot', 'S6.carving', 'S6.ledger', 'S5.chart.head.1', 'S5.chart.cut.1', 'S5.chart.ice', 'S5.the-pilots-chart-book.w1', 'S6.red-herrings.w1', 'd95.7b.S5.cold', 'd95.7b.S5.up', 'd95.7b.S6.know', 'S5.pete', 'S6.sell.3', 'S6.society.2', 'S6.split.1', 'S6.split.2', 'S6.without']) ids.add(id);
  const missing = [...ids].filter((id) => id !== 'true' && !TEXT[id]);
  assert.deepEqual(missing, []);
});

test('the wreck reads only calm, bright, near and inside the clarity', () => {
  const ok = { wind: 1, hour: 12, cloud: 0.1, dist: 10, depth: 3.4, secchi: 4.4, month: 7 };
  assert.ok(seeing(ok));
  assert.ok(!seeing({ ...ok, wind: 3 }), 'over 5 mph');
  assert.ok(!seeing({ ...ok, hour: 17 }), 'the sun low');
  assert.ok(!seeing({ ...ok, cloud: 0.8 }), 'cloud');
  assert.ok(!seeing({ ...ok, dist: 25 }), 'too far');
  assert.ok(!seeing({ ...ok, depth: 5 }), 'past the Secchi');
  assert.ok(breathOf(5) < breathOf(7), 'May is colder: a shorter breath');
});

test('three dives: see it, work the case (E held), again if the breath ran out', () => {
  const step = (h, secs, inp) => { let r = null; for (let i = 0; i < secs * 20 && !r; i++) r = h.update(0.05, inp); return r; };
  // the first: down, sees it, holding E does nothing (not seen before), comes up when asked
  const d1 = dive({ dives: 0, month: 7 }, {});
  assert.equal(step(d1, 5, { hold: true, atCase: true }), null);
  assert.ok(d1.seen && d1.work === 0);
  assert.equal(step(d1, 3, { up: true }).result, 'up');
  // the second, in May (cold, short breath): E held but not long enough before the breath goes: brought up
  const d2 = dive({ dives: 1, month: 5, seen0: true }, {});
  const r2 = step(d2, 60, { hold: false, atCase: true });
  assert.equal(r2.result, 'brought');
  assert.ok(d2.narrow > 0.9 && d2.heart > 140);
  // the third: E held, the case comes free (the work carried over)
  const d3 = dive({ dives: 2, month: 7, seen0: true, work0: 3 }, {});
  const r3 = step(d3, 30, { hold: true, atCase: true });
  assert.equal(r3.result, 'case');
  assert.ok(d3.under < DIVE.work + 1);
});

test('S6: the pit opened plank by plank gives the eye (lock 6 key C), the ledger, the Walt line', () => {
  const { s, use, can, run } = fresh();
  assert.ok(!can('s6.slump', 'Clear the moss'), 'nothing known: only moss');
  run(['f:s6.route']);
  assert.ok(s.has('s6.know'));
  use('s6.slump', 'Clear the moss');
  assert.ok(s.has('ep.S6.yes'), 'the place door: the moss cleared');
  for (const i of [1, 2, 4]) use(`s6.plank.${i}`, 'Pull');
  assert.ok(!s.has('ep.S6.done') && !can('s6.crate', 'Take'));
  assert.equal(pitState((k) => s.has(k)).left, 1);
  use('s6.plank.5', 'Pull');
  assert.ok(s.has('ep.S6.done') && s.has('key.L6C'), 'lock 6 key C');
  use('s6.crate', 'Take');
  assert.ok(s.has('s6.ledger') && s.has('ep.S6.ledger'));
  use('s6.crate.taken', 'Take');
  assert.ok(s.has('s6.bottle'));
});

test('S6: sold, the pay at the tally; the end', () => {
  const { s, run, paid } = fresh();
  run(['f:s6.route', 'f:ep.S6.yes', 'f:s6.ledger', 'f:ep.S6.sold', 'f:s6.bottle', 'f:ep.S6.bottle.sold']);
  assert.equal(s.get('ep.S6.end'), 'sold');
  assert.ok(paid.some((p) => /^250@/.test(p)) && paid.some((p) => /^40@/.test(p)), JSON.stringify(paid));
});

test('S5: the wreck seen starts it; the case, given: $60 and the wall; the chart and the notch give L2D and L3D', () => {
  const { s, run, paid } = fresh();
  run(['f:s5.wreck.seen']);
  assert.ok(s.has('ep.S5.yes'), 'the place door');
  run(['f:s5.case']);
  assert.ok(s.has('ep.S5.case'));
  run(['f:ep.S5.given']);
  assert.ok(s.has('s5.wall') && paid.some((p) => /^60@/.test(p)) && s.get('ep.S5.end') === 'given');
  assert.ok(!s.has('key.L2D'));
  run(['f:nb.page.pilotchart', 'f:s5.notch']);
  assert.ok(s.has('ep.S5.chart') && s.has('key.L2D') && s.has('key.L3D'));
});

test('S5 without you: the chart still on the wall, the page off it, the keys from it', () => {
  const { s, run } = fresh();
  run(['f:s5.pete.found', 'f:s5.wall']);
  assert.ok(!s.has('ep.S5.yes'));
  run(['f:s5.wall.read']);
  run(['f:nb.page.pilotchart', 'f:s5.notch']);
  assert.ok(s.has('key.L2D') && s.has('key.L3D'), 'the key survives');
});

test('S5 told: Pete finds it, $40 and the end with help', () => {
  const { s, run, paid } = fresh();
  run(['f:ep.S5.yes', 'f:ep.S5.told', 'f:s5.pete.found']);
  assert.ok(s.has('ep.S5.helped') && paid.some((p) => /^40@/.test(p)));
  assert.equal(s.get('ep.S5.end'), 'told');
});
