// The informant's check (campaign stream i, Round 5), Node only: the data (every line id a text entry, every condition
// compiles with no warning, every fact declared, every walt: id a Walt-page line), then the arc played on a real StoryV2
// with the real rules and topics.js SceneRun: the canary told and hard, tells 2 and 3, the Isabella camp, the case adding up,
// the reveal opened and played to each of its three choices (a fresh story each), the note's fallback with no pieces, Frank
// accused / cleared / the folder, extendBoys into stream b5's shape. L2E is gained by the reveal.   node scripts/cmp-i-unit.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { compile, registerSensor } from '../src/story-cond.js';
import { PENCIL_SENSORS } from '../src/pencil.js';
import { factRow, checkValue } from '../src/story-data/facts.js';
import { waltRow, sectionOf } from '../src/story-data/walt-lines.js';
import { StoryV2 } from '../src/story.js';
import { SceneRun, texts } from '../src/topics.js';
import * as I from '../src/story-data/informant.js';
import { RULES_INFORMANT } from '../src/story-data/rules-informant.js';

const warn = console.warn; console.warn = () => {};
process.on('exit', () => { console.warn = warn; });
for (const [k, v] of Object.entries(PENCIL_SENSORS)) registerSensor(k, v);
for (const k of Object.keys(I.I_SENSORS)) registerSensor(k, 'flag');
const T = {};
for (const f of readdirSync('src/story-data/text')) { const j = JSON.parse(readFileSync(`src/story-data/text/${f}`, 'utf8')); Object.assign(T, j.text); texts.add(j); }
const errs = []; let checks = 0;
const ok = (c, why) => { checks++; if (!c) errs.push(why); return c; };
const idOk = (id, where) => ok(!!T[id], `${where}: no text ${id}`);
const condOk = (c, where) => { if (!c) return; const r = compile(c); ok(r.ok && !r.warnings.length, `${where}: ${c}: ${[...(r.errors || []), ...(r.warnings || [])].join('; ')}`); };
const actOk = (a, where) => {
  if (a && typeof a === 'object') { condOk(a.when, where); (a.then || []).forEach((x) => actOk(x, where)); return; }
  const m = /^(\w+):(.*)$/.exec(a); if (!ok(!!m, `${where}: bad action ${a}`)) return;
  if (m[1] === 'f') { const [k, v] = m[2].split('='); const row = factRow(k); if (ok(!!row, `${where}: undeclared ${k}`) && v != null) ok(!checkValue(row, v), `${where}: ${k}=${v}`); }
  if (m[1] === 'walt') ok(!!(waltRow(m[2]) || T[m[2]]), `${where}: walt ${m[2]}`);
};
const lineOk = (l, where) => { if (typeof l === 'string') return idOk(l, where); if (l.first) return l.first.forEach((x) => lineOk(x, where)); if (l.hook) return; condOk(l.when, where); if (l.id) idOk(l.id, where); };

// --- 1. the data ------------------------------------------------------------------------------------------------------------
let nodes = 0;
for (const sc of [I.DENNY_CABIN, I.REVEAL, I.FRANK_FARM, I.BOB_STORE]) {
  for (const [nid, N] of Object.entries(sc.nodes)) {
    nodes++; const w = `${sc.id}.${nid}`;
    (N.say || []).forEach((l) => lineOk(l, w)); (N.then || []).forEach((a) => actOk(a, w));
    if (N.to) ok(!!sc.nodes[N.to], `${w}: to ${N.to}`);
    if (N.hub) ok(!!sc.nodes[N.hub], `${w}: hub ${N.hub}`);
    for (const c of N.go || []) { idOk(c.ask, w); condOk(c.when, w); (c.say || []).forEach((l) => lineOk(l, w)); (c.then || []).forEach((a) => actOk(a, w)); if (c.to) ok(!!sc.nodes[c.to], `${w}: choice to ${c.to}`); }
  }
}
for (const r of RULES_INFORMANT) { condOk(r.when, r.id); r.then.forEach((a) => actOk(a, r.id)); }
for (const c of [...Object.values(I.SCHEDULE), I.REVEAL_WHEN, I.NOTE_WHEN]) condOk(c, 'schedule');
for (const id of [...I.RELAY, ...I.CASE_LINES, '32:5.15.conf', '32:5.17.note', 'd95.i.note.never', 'd95.i.folder', '32:5.11.heard.josie', '32:5.6.calls', '32:5.6.6', '32:5.16.1.josie', '32:5.16.3.josie']) idOk(id, 'lines');
for (const id of I.CASE_LINES.filter((x) => x.startsWith('32:6.') && x !== '32:6.14')) ok(sectionOf(id) === 'case', `${id} not in the case section`);
const beats = String(T['32:5.15.conf'].text).split(/\n\s*\n/).length;
ok(beats === I.CONF_BEATS, `confession beats ${beats} != ${I.CONF_BEATS}`);

// --- 2. the arc on a real story ------------------------------------------------------------------------------------------------
const memIO = () => { const m = new Map(); return { map: m, read: (ns, f = null) => (m.has(ns) ? JSON.parse(m.get(ns)) : f), write: (ns, v) => { m.set(ns, JSON.stringify(v)); return true; } }; };
const PROFILE = { seasonId: 'p-i', started: true, onChange: () => {} };
function fresh(abs = 20650) {
  const s = new StoryV2({ io: memIO() }); s.dirty = () => {}; s.attach({ profile: PROFILE }); s.clock({ abs, hours: 18 });
  s.sensor('tell2Due', () => s.when('f:marlys.loft | f:marlys.night | f:gy.register | tier>=3 | met:denny>=3'));
  s.sensor('tell3Due', () => s.when('tier>=4 | count(case.denny.*)>=2'));
  s.sensor('canaryOn', () => !s.has('choice.denny'));
  s.sensor('frankCold', () => !!(s.doc.ppl.frank && s.doc.ppl.frank.cold));
  for (const k of ['atRock', 'atCabin', 'weekSince']) s.sensor(k, () => false);
  s.set('nb.found', true, 'u');
  return s;
}
const topicsOf = (s) => ({ story: s, run: (a, args, src) => s.rules.apply({ id: src, then: a }, args || {}), emit: () => {} });
// play a scene: answers picked in order (by their ask text's id); returns the lines said
function play(s, def, start, asks, hooks = {}) {
  const run = new SceneRun(topicsOf(s), def, { who: def.who, args: {}, vars: { lake: 'Kawishiwi Lake' }, hooks });
  const said = []; let node = run.node(start); let guard = 0;
  const q = [...asks];
  while (node && guard++ < 200) {
    if (node.say) said.push(node.say);
    if (!node.choices || !node.choices.length) break;
    let ch = node.choices.length === 1 ? node.choices[0] : null;
    if (!ch && q.length) { const want = T[q[0]] && T[q[0]].text; ch = node.choices.find((c) => c.text === want); if (ch) q.shift(); }
    if (!ch) ch = node.choices.find((c) => c.text === '…');
    if (!ch) break;
    if (ch.kind === 'bye') break;
    const r = ch.go(); node = r && r.end ? null : r;
    if (r && r.end && r.after) r.after();
  }
  return { said, left: q };
}
const meet = (s, n = 2) => { for (let i = 0; i < n; i++) s.meet('denny', 'u'); };
const H = (s) => ({ ...Object.fromEntries(Array.from({ length: I.CONF_BEATS }, (_, k) => [`conf${k}`, () => ({ text: `beat ${k}` })])), canary: () => { s.set('canary.denny.12', s.nowAbs() | 0, 'u'); } });

// the canary: told, the watchers seen → the hard piece (informant-cast.js writes these three)
{
  const s = fresh();
  meet(s, 1);
  const r = play(s, I.DENNY_CABIN, 'hello', [I.CANARY_ASK], H(s));
  ok(s.has('canary.denny.12'), 'canary: told');
  ok(r.said.some((x) => /Good one/.test(x)), 'canary: Denny\'s told line');
  s.set('canary.hard', 'Kawishiwi Lake', 'u'); s.set('canary.how', 'seen', 'u'); s.set('case.denny.canary', 'hard', 'u');
  ok(s.walt().includes('32:5.11.seen'), 'canary: the seen line on the page');
  ok(!s.has('denny.reveal.open'), 'one piece: no reveal');
}
// tells: tell 2 asked (the third meeting), tell 3 at the opener (two pieces), the Tuesday with the register
{
  const s = fresh(); meet(s, 3);
  play(s, I.DENNY_CABIN, 'hello', ['32:5.12.c1'], H(s));
  ok(s.has('denny.tell2') && s.get('case.denny.inallweek') === 'soft', 'tell 2: in all week');
  s.set('denny.tell1', true, 'u'); s.set('gy.register', true, 'u');
  ok(s.get('case.denny.tuesday') === 'soft' && s.walt().includes('32:6.3') && s.walt().includes('32:5.12.w2b'), 'tell 1 + the register: the Tuesday');
  ok(I.dennyIEntry(s, { tell3Due: s.when('count(case.denny.*)>=2') }) === 'tell3', 'tell 3 due at the opener');
  play(s, I.DENNY_CABIN, 'tell3', ['32:5.12.c2'], H(s));
  ok(s.get('case.denny.talked') === 'soft', 'tell 3: somebody talked');
  ok(!s.has('denny.reveal.open'), 'three soft: no reveal yet (no hard piece)');
  s.set('case.denny.message', 'hard', 'a3');
  ok(s.has('denny.reveal.open'), 'a hard piece: the reveal opens');
}
// the Isabella camp and the river; Frank cleared by the deduction
{
  const s = fresh();
  s.set('denny.rings', true, 'b5'); s.set('isabella.receipt', true, 'layer'); s.markRead('NB79', 'u');
  ok(s.get('case.denny.isabella') === 'soft' && s.walt().includes('32:5.10.w') && s.walt().includes('32:5.10.w35'), 'Isabella: the receipt and N35');
  s.set('frank.kek', true, 'b5'); s.markRead('NB78', 'u');
  ok(s.has('denny.deduced') && s.has('frank.cleared') && s.get('case.denny.river') === 'soft', 'the deduction: names, Frank cleared, the river');
}
// the reveal, each choice on its own story
for (const [ask, val, fact] of [['32:5.15.c15', 'turn', 'denny.turned'], ['32:5.15.c16', 'told', 'denny.toldon'], ['32:5.15.c17', 'left', 'denny.left']]) {
  const s = fresh(); meet(s, 2);
  s.set('case.denny.rochester', 'hard', 'b5'); s.set('case.denny.nicknames', 'soft', 'b5'); s.set('denny.tell2', true, 'u');
  ok(s.has('denny.reveal.open'), `reveal ${val}: open`);
  const follow = { turn: ['32:5.16.1.c1', '32:5.16.1.c2', '32:5.16.1.c5'], told: ['32:5.16.2.c1'], left: [] }[val];
  const r = play(s, I.REVEAL, I.revealEntry(s, {}), ['32:5.15.c2', '32:5.15.c9', '32:5.16.2.c1', ask, ...follow], H(s));
  ok(s.has('denny.revealed') && s.has('key.L2E'), `reveal ${val}: revealed, L2E`);
  ok(s.get('choice.denny') === val && s.has(fact), `reveal ${val}: choice.denny=${val}, ${fact}`);
  ok(r.said.includes('beat 0') && r.said.includes(`beat ${I.CONF_BEATS - 1}`), `reveal ${val}: the confession played`);
  ok(s.walt().includes('32:5.15.resolved') && s.walt().includes('32:5.15.call'), `reveal ${val}: the page resolved`);
  ok(I.dennyIEntry(s) === { turn: 'relay', told: 'slept', left: 'hi' }[val], `reveal ${val}: the after's opener`);
  ok(s.set('choice.denny', val === 'turn' ? 'left' : 'turn', 'u') === false, `reveal ${val}: the choice is shown once`);
}
// "Nice night.": the scene ends, the reveal stays open
{
  const s = fresh(); meet(s, 2); s.set('case.denny.rochester', 'hard', 'b5'); s.set('case.denny.nicknames', 'soft', 'b5'); s.set('denny.tell3', true, 'u');
  play(s, I.REVEAL, 'cabin', ['32:5.15.c7'], H(s));
  ok(!s.has('denny.revealed') && s.has('denny.reveal.open'), 'Nice night: still open');
}
// the note: no pieces, three weeks after tier 4 → due; the note → the reveal from its silence
{
  const s = fresh(20700); s.set('tier.4', true, 'u'); s.clock({ abs: 20722, hours: 10 }); s.rules.tick();
  ok(s.has('denny.note.due'), 'note: due three weeks after tier 4');
  s.set('denny.note', true, 'i');
  ok(s.has('denny.reveal.open') && s.get('case.denny.note') === 'soft' && I.revealEntry(s) === 'note', 'note: opens the reveal at the cabin');
  play(s, I.REVEAL, 'note', ['32:5.16.2.c1', '32:5.15.c17'], H(s));
  ok(s.has('denny.revealed') && s.get('choice.denny') === 'left', 'note: the confession and a choice');
}
// Frank: accused, cold, cleared, sorry; the confession and the folder asked
{
  const s = fresh(); s.set('frank.patch', true, 'b5');
  const Hf = { accuse: () => { s.set('frank.accused', 20650, 'u'); s.person('frank', 'cold', '=', true, 'u'); } };
  play(s, I.FRANK_FARM, 'hello', ['32:5.14.c1', '32:5.14.c2'], Hf);
  ok(s.has('frank.accused') && s.doc.ppl.frank.cold, 'Frank accused: cold');
  s.set('canary.clear.frank', 'Kawishiwi Lake', 'i');
  ok(s.has('frank.cleared') && s.walt().includes('32:5.11.clear'), 'Frank cleared by the canary');
  play(s, I.FRANK_FARM, 'hello', ['32:5.14.wrong'], Hf);
  ok(s.has('frank.sorry') && !s.doc.ppl.frank.cold, 'Frank: "I was wrong about you." warms him');
  const Hf2 = { folderAsk: () => s.set('frank.folder.asked', 20650, 'u') };
  play(s, I.FRANK_FARM, 'hello', ['32:5.13.c1', '32:5.13.c2', '32:5.13.c3'], Hf2);
  ok(s.has('frank.confessed') && s.has('frank.folder.asked'), 'Frank: the confession, the folder asked');
}
// extendBoys into b5's shape
{
  const DENNY = { nodes: { hub: { go: [{ ask: 'x' }] } } }, FRANK = { nodes: { hub: { go: [] } } }, BOB = { nodes: { hub: { go: [] } } };
  I.extendBoys({ DENNY, FRANK, BOB }); I.extendBoys({ DENNY, FRANK, BOB });
  ok(DENNY.nodes.hub.go.length === 1 + I.DENNY_I.length && DENNY.nodes.tell3 && FRANK.nodes.accused && BOB.nodes.hub.go.length === I.BOB_I.length, 'extendBoys: once, topics and nodes');
}
console.log(`cmp-i-unit: ${nodes} nodes, ${RULES_INFORMANT.length} rules, ${checks} checks`);
if (errs.length) { console.log(errs.join('\n')); process.exit(1); }
console.log('cmp-i-unit: PASS');
