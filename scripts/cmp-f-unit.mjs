// Stream F's unit checks (Node, no browser): node --test scripts/cmp-f-unit.mjs
// The far end's data against the engine: every condition and action in its places compiles and names declared facts and
// Walt lines; the rules give the keys the Round 3 table says (L3C, L4C, L4E, L5A, L5C, L6A) from the places' own
// verbs and triggers, played through StoryV2; the stone understood by A/B/D/E but not C; the pit's verb withheld in the
// iced season and with company; the resolved carry and the camp's geometry (checks 5 and 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoryV2 } from '../src/story.js';
import { compile } from '../src/story-cond.js';
import { factRow } from '../src/story-data/facts.js';
import { WALT_LINES } from '../src/story-data/walt-lines.js';
import { KITS } from '../src/story-props.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PJ = JSON.parse(readFileSync(path.join(ROOT, 'src/story-places.json'), 'utf8'));
const TEXT = {};
for (const f of readdirSync(path.join(ROOT, 'src/story-data/text')).filter((x) => x.endsWith('.json'))) Object.assign(TEXT, JSON.parse(readFileSync(path.join(ROOT, 'src/story-data/text', f), 'utf8')).text);
const PAGE = new Set([...WALT_LINES.map((w) => w.id), ...Object.entries(TEXT).filter(([, e]) => e.k === 'page').map(([id]) => id)]);
const MINE = PJ.places.filter((p) => /^(gull\.|pond4747\.|waltcamp$|cellar$|stash\.)/.test(p.id));
const place = (id) => MINE.find((p) => p.id === id);

function fresh({ low = false, ice = false, peers = 0 } = {}) {
  const s = new StoryV2();
  s.attach({}); s.clock({ abs: 20640, hours: 10 });
  const on = { lowwater: low, iceseason: ice };
  for (const k of Object.keys(on)) s.sensor(k, () => on[k]);
  s.sensor('peers', () => peers);
  for (const k of ['nickseen', 'ringon', 'ringed', 'onlake']) s.sensor(k, () => false);
  for (const k of ['give', 'ring']) s.handle(k, () => true);
  s.found({ abs: 20640, key: 1, lake: 'Lake One' });
  const run = (then) => s.rules.apply({ id: 'unit', then }, {});
  const W = (c) => !c || c === 'true' || s.when(c); // (the layer reads 'true' itself: story-layer.js when())
  const verb = (prop, name) => { const pl = MINE.find((p) => p.verbs.some((v) => v.prop === prop && v.verb === name)); const v = pl && pl.verbs.find((q) => q.prop === prop && q.verb === name); assert.ok(v, `${prop} ${name}`); return v; };
  const can = (prop, name) => W(verb(prop, name).when);
  const use = (prop, name) => { const v = verb(prop, name); assert.ok(W(v.when), `${prop} ${name}: ${v.when}`); run(v.then); };
  const enter = (id, when = null) => { for (const t of place(id).triggers) if ((t.on === 'enter' || t.on === 'stand') && W(t.when) && (!when || when(t))) run(t.then); };
  return { s, run, can, use, enter, on };
}

test('the places: kits known, conditions compile, facts declared, Walt lines real, resolved for this release', () => {
  assert.equal(MINE.length, 9);
  for (const p of MINE) {
    assert.ok(PJ.resolved.places[p.id], `${p.id} resolved`);
    for (const pr of p.props) assert.ok(KITS.includes(pr.kit), `${pr.id}: kit ${pr.kit}`);
    const conds = [...p.props.flatMap((pr) => [pr.show, pr.visible, pr.dotWhen, ...(pr.dot || []).map((d) => d.when)]), ...p.verbs.map((v) => v.when), ...p.triggers.map((t) => t.when)].filter((c) => c && c !== 'true');
    for (const c of conds) { const r = compile(c); assert.ok(r.ok && !r.warnings.length, `${p.id}: ${c}: ${[...r.errors, ...r.warnings]}`); }
    for (const a of [...p.verbs.flatMap((v) => v.then), ...p.triggers.flatMap((t) => t.then)]) {
      const [k, ...rest] = a.split(':'), arg = rest.join(':');
      if (k === 'f') assert.ok(factRow(arg.split('=')[0]), `${p.id}: fact ${arg}`);
      if (k === 'walt') assert.ok(PAGE.has(arg), `${p.id}: Walt line ${arg}`);
    }
  }
  const c = PJ.resolved.carries['story:gullcarry'];
  assert.ok(c && c.pts.length > 50 && c.lengthM > 780 && c.launch[1].road && c.launch[0].lake > 0);
});

test('L4C at the dam in fall low water inks the far end; not in summer', () => {
  const a = fresh({ low: true }); a.enter('gull.sign');
  assert.ok(a.s.has('key.L4C') && a.s.has('ink.farend'));
  assert.ok(!a.s.has('knows.stonesign'), 'low water alone never understands the stone');
  const b = fresh({ low: false }); b.enter('gull.sign');
  assert.ok(b.s.has('gull.dam') && !b.s.has('key.L4C') && !b.s.has('ink.farend'));
});

test('the burnt point: L3C only with NB55 read; the carry and the camp: L5A, L5C; the floorboard only with the stone understood', () => {
  const a = fresh();
  a.enter('gull.burntpoint'); assert.ok(!a.s.has('key.L3C'));
  a.s.markRead('NB55', 'unit'); a.enter('gull.burntpoint'); assert.ok(a.s.has('key.L3C') && a.s.nbHas('und', 'NB55'));
  a.enter('gull.sign'); a.enter('pond4747.eastbank'); a.enter('waltcamp');
  assert.ok(['key.L5A', 'key.L5C', 'camp.found', 'ink.farend'].every((k) => a.s.has(k)) && a.s.nbHas('und', 'NB54'));
  assert.ok(!a.can('waltcamp.floor', 'Lift'));
  a.s.set('knows.stones', true, 'unit'); // (three starred stones: L4B)
  assert.ok(a.s.has('knows.stonesign') && a.can('waltcamp.floor', 'Lift'));
  a.use('waltcamp.floor', 'Lift');
  assert.ok(['nb.torn', 'key.L6A', 'find.big.camp'].every((k) => a.s.has(k)) && a.s.walt().includes('50:4.3.w.floor'));
  a.use('waltcamp.corebox', 'Look'); assert.ok(a.s.has('knows.e7') && a.s.walt().includes('50:4.3.w.corebox'));
});

test('the paddle stash: L4E with NB66 read, and the stone then understood', () => {
  const a = fresh();
  a.enter('stash.paddle'); assert.ok(a.s.has('stash.paddle.found') && !a.s.has('key.L4E'));
  a.s.markRead('NB66', 'unit');
  assert.ok(a.s.has('key.L4E') && a.s.has('knows.stonesign') && a.s.walt().includes('50:6.7.w.paddle'));
});

test('the cellar: ground without L6; Clear the moss absent in the iced season and with company; then lid, note (pit.note), cans', () => {
  const ice = fresh({ ice: true }); ice.s.set('nb.torn', true, 'unit');
  assert.ok(ice.s.has('key.L6A') && !ice.can('cellar.pit', 'Clear the moss'));
  const pair = fresh({ peers: 1 }); pair.s.set('nb.torn', true, 'unit');
  assert.ok(!pair.can('cellar.pit', 'Clear the moss'));
  const a = fresh();
  assert.ok(!a.can('cellar.pit', 'Clear the moss'));
  a.s.set('nb.torn', true, 'unit');
  a.use('cellar.pit', 'Clear the moss'); a.use('cellar.lid', 'Lift');
  assert.ok(!a.can('cellar.can.1', 'Take'), 'the cans wait for the note');
  a.use('cellar.note', 'Pick up'); a.use('cellar.can.1', 'Take'); a.use('cellar.can.2', 'Take');
  assert.ok(['pit.cleared', 'pit.lifted', 'pit.note', 'pit.can.1', 'pit.can.2'].every((k) => a.s.has(k)) && a.s.walt().includes('50:5.3.w.eino'));
});

test('the geometry: the pit at ~126° and 622 m from the camp; the notch behind the creek mouth on the burnt point\'s line', () => {
  const R = PJ.resolved.places, bear = (a, b) => ((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180 / Math.PI) + 360) % 360;
  assert.ok(Math.abs(bear(R.waltcamp, R.cellar) - 126) < 3);
  assert.ok(Math.abs(Math.hypot(R.cellar.x - R.waltcamp.x, R.cellar.z - R.waltcamp.z) - 622) < 30);
  assert.ok(Math.abs(bear(R['gull.burntpoint'], R['gull.notch']) - bear(R['gull.burntpoint'], R['gull.sign'])) < 3);
});
