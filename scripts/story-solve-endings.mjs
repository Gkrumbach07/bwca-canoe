// story-solve-endings.mjs: the endings' proof (story Round 3, stream n; campaign-design Part 4 Round 3: "the solver must
// prove J, JN and M reachable in every branch of the choices that have producers by Round 3 (Tauno on record ×2; with
// no meeting set, the run goes to any served lot)"). Node only: the story's own engine (StoryV2, story-cond, the rules of
// all-rules.js) plays the dawn lot's scenes (story-data/endings.js MAGGIE, DAN_M, DAN_J) as topics.js SceneRun walks
// them: lines by condition, choices by condition, `then` actions (f:, walt:, do: hooks mapped to endings.js's), and
// searches every path through them for each ending. Then the epilogue's dated facts (rules-endings.js) on the clock.
//
//   import { solveEndings } from './story-solve-endings.mjs'   → { ok, rows: [{ branch, J, JN, M, paths }], fails }
//   node scripts/story-solve-endings.mjs [--json out.json]     the same, printed (story-solve.mjs calls it at its end)
//
// Branches: tauno.record on / off × the Walt page's "went north" on / off × the meeting (Lake One 30 set and arrived
// after its first dawn; none: any served lot, Maggie's call) × Maggie met or a stranger. JN needs "went north" (the
// source answer "Walt wrote it. He's alive." is offered only then): proved where north holds, reported as by-design
// where it does not.
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { StoryV2 } from '../src/story.js';
import { registerSensor } from '../src/story-cond.js';
import * as N from '../src/story-data/endings.js';
import { texts } from '../src/topics.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const [k, v] of Object.entries(N.N_SENSORS)) registerSensor(k, v);
for (const f of ['finale.json', 'company.json']) texts.add(JSON.parse(readFileSync(path.join(ROOT, 'src/story-data/text', f), 'utf8')));
const io = () => { const m = new Map(); return { read: (ns, f = null) => (m.has(ns) ? JSON.parse(m.get(ns)) : f), write: (ns, v) => { m.set(ns, JSON.stringify(v)); return true; } }; };
const profile = () => ({ seasonId: 'solve-n', started: true, onChange: () => {} });
const ABS0 = Math.round(Date.UTC(2026, 9, 12) / 86400000); // 12 Oct 2026: a late-season run

let FROM = null; // j1: a story doc to start from (story-solve's slice 3 end: the real far end and lift), else n's stubs
function fresh(br) {
  const s = new StoryV2({ io: io() });
  s.attach({ profile: profile() });
  if (FROM) s.setDoc(JSON.parse(JSON.stringify(FROM))); // j1
  s.clock({ abs: ABS0, hours: 6 });
  s.set('nb.found', true, 'solve');
  if (br.record) s.set('tauno.record', true, 'solve');
  else if (br.record === false && s.doc.facts && s.doc.facts['tauno.record']) delete s.doc.facts['tauno.record']; // final: a real doc's record off
  if (br.north) s.set('drift.done', true, 'solve');
  if (br.met) s.meet('maggie', 'solve');
  if (br.meeting) s.doc.meeting = { ep: 30, firstDawn: ABS0 - 1 };
  s.set('run.lifted', br.meeting ? 30 : 'any', 'solve'); // (r's fact at the lift)
  s.set('pit.note', true, 'solve');                      // (f's: Eino's note picked up)
  if (br.setup) br.setup(s);                              // final: the 72 branches' climax choices, played (solveChoices72)
  return s;
}
const argsOf = (s) => ({ ep: 30, carbonRead: false, einoNote: s.has('pit.note'), stranger: !(s.doc.ppl.maggie && s.doc.ppl.maggie.met), danCard: false, needled: false, farm: false, sledArgued: false });

// a scene walked as SceneRun walks it: node → its lines (by condition) → its `then` → its choices (by condition, `once`)
// → a choice's `then` and lines → its `to`, back to the node, or the end. The hooks are endings.js's, writing the same facts
function walk(s, def, start, hooksFor, limit = 40) {
  const paths = [];
  const say = (list, a) => (list || []).filter((l) => !(l && l.when) || s.when(l.when, a)).map((l) => (typeof l === 'string' ? l : l.id || l.text));
  const act = (S, list, a, log) => {
    for (const x of list || []) {
      if (x && typeof x === 'object') { if (!x.when || S.when(x.when, a)) act(S, x.then, a, log); continue; }
      const m = /^do:(\w+)$/.exec(x);
      if (m) { const h = hooksFor(S)[m[1]]; if (h) h(); log.push(x); continue; }
      S.rules.apply({ id: `solve:${def.id}`, then: [x] }, a); log.push(x);
    }
  };
  // a state is the story document; branch by cloning it (the story's own doc, JSON)
  const clone = (S) => { const t = new StoryV2({ io: io() }); t.attach({ profile: profile() }); t.setDoc(JSON.parse(JSON.stringify(S.doc))); t.clock({ abs: S.time().abs, hours: S.time().hours }); t.solveHooks = S.solveHooks; return t; };
  const seen = new Set();
  const go = (S, node, trail, depth) => {
    if (depth > limit || paths.length > 400) return;
    const key = `${node}|${Object.keys(S.doc.facts).sort().join(',')}`; // (a node again with nothing new learnt: a loop, cut)
    if (seen.has(key)) return; seen.add(key);
    const N0 = def.nodes[node]; if (!N0) return;
    const a = argsOf(S), log = [];
    for (const id of say(N0.say, a)) if (!id) log.push('?line');
    act(S, N0.then, a, log);
    if (N0.end) { paths.push({ trail: [...trail, node], s: S }); return; }
    if (N0.to) return go(S, N0.to, [...trail, node], depth + 1);
    const opts = (N0.go || []).filter((c) => (!c.when || S.when(c.when, a)) && !(c.once && S.has(`${def.who}.said.${c.once}`)));
    if (!opts.length) { paths.push({ trail: [...trail, node, '(no choice)'], s: S }); return; }
    for (const c of opts) {
      const S2 = clone(S), a2 = argsOf(S2), l2 = [];
      if (c.once) S2.set(`${def.who}.said.${c.once}`, true, 'solve');
      act(S2, c.then, a2, l2);
      const step = `${node}:${c.ask}`;
      if (c.end) { paths.push({ trail: [...trail, step], s: S2 }); continue; }
      go(S2, c.to || node, [...trail, step], depth + 1);
    }
  };
  go(s, start, [], 0);
  return paths;
}

// one branch: who is in the lot, then every path through Dan's money scene and Maggie's, the endings each reaches
function endsFor(br, name, rows, fails, hooks) {
    // who is in the lot: Maggie here, or by the call, or as a stranger; Dan and Wade always
    const s0 = fresh(br), plan = N.lotFor(s0, 30, { abs: ABS0, hours: 6, served: true });
    if (!plan.stage) { fails.push(`${name}: the lot is not staged (${plan.why})`); return null; }
    const got = { J: null, JN: null, M: null };
    const sM = fresh(br); sM.solveHooks = { scene: 'M' };
    for (const p of walk(sM, N.DAN_M, 'start', hooks)) { const e = p.s.get('end'); if (e && !got[e]) got[e] = p.trail; }
    const sJ = fresh(br); sJ.solveHooks = { scene: 'J' };
    for (const p of walk(sJ, N.MAGGIE, 'start', hooks)) { const e = p.s.get('end'); if (e && !got[e]) got[e] = p.trail; }
    const north = !!br.north, want = north ? ['J', 'JN', 'M'] : ['J', 'M'];
    for (const e of want) if (!got[e]) fails.push(`${name}: ${e} not reachable`);
    if (!north && got.JN) fails.push(`${name}: JN reached without "went north"`);
    rows.push({ branch: name, wagon: plan.wagon, J: !!got.J, JN: north ? !!got.JN : 'n/a (needs north)', M: !!got.M, paths: got });
    return rows[rows.length - 1];
}
export function solveEndings(opts = {}) {
  FROM = opts.from || null; // j1
  const rows = [], fails = [];
  // the hooks: endings.js's, on the solver's own state
  const hooks = (S) => {
    return {
      handed: () => {}, carbon: () => S.set('end.carbon', 'maggie', 'solve'),
      named: () => N.commitEnding(S, { end: 'J', walt: 'named', lot: 30 }), kept: () => N.commitEnding(S, { end: 'J', walt: 'kept', lot: 30 }),
      handover: () => N.commitEnding(S, { end: 'M', lot: 30 }), close: () => {},
      turnback: () => {}, readyes: () => S.set('end.read', 'yes', 'solve'), readno: () => S.set('end.read', 'no', 'solve'), readsilent: () => S.set('end.read', 'silent', 'solve'),
    };
  };
  const RECORDS = FROM ? [!!(FROM.facts && FROM.facts['tauno.record'])] : [false, true]; // j1: a real doc keeps its own record
  for (const record of RECORDS) for (const north of [false, true]) for (const meeting of [false, true]) for (const met of [true, false]) {
    const br = { record, north, meeting, met }, name = `record=${+record} north=${+north} meeting=${meeting ? 30 : 'any'} maggie=${met ? 'met' : 'stranger'}`;
    endsFor(br, name, rows, fails, hooks);
  }
  // the epilogue on the clock: from each ending, 31 days on, the dated facts (rules-endings.js) and the read points
  const epi = {};
  for (const end of ['J', 'JN', 'M']) {
    const s = fresh({ record: true, north: true, meeting: true, met: true });
    N.commitEnding(s, { end: end === 'M' ? 'M' : 'J', walt: end === 'JN' ? 'named' : 'kept', lot: 30 });
    for (let d = 1; d <= 31; d++) s.clock({ abs: ABS0 + d, hours: 9 });
    const f = (k) => s.has(k);
    epi[end] = { end: s.get('end'), flags: ['end.J', 'end.JN', 'end.M', 'run.done', 'world.paper', 'world.walt.photo', 'world.trench.closed', 'world.resign', 'world.file', 'world.sampling', 'world.stakes', 'world.pit.empty'].filter(f),
      upcharge25: N.upcharge(s, 25), consulting: N.consultingDue(s), board25: N.boardFilter(s, [{ status: 'offered' }, null, { status: 'open' }, { status: 'offered' }], 25).map((t) => (t ? t.status : null)), sampling: N.samplingOpen(s), stage: s.stage };
    const need = end === 'M' ? ['end.M', 'world.paper', 'world.stakes'] : ['end.J', 'world.paper', 'world.walt.photo', 'world.trench.closed', 'world.sampling'];
    for (const k of need) if (!f(k)) fails.push(`epilogue ${end}: ${k} never set`);
    if (end === 'JN' && !f('end.JN')) fails.push('epilogue JN: end.JN never set');
    if (end === 'M' && (epi[end].upcharge25 <= 1 || !epi[end].consulting)) fails.push('epilogue M: no upcharge or no consulting');
    if (end !== 'M' && (epi[end].upcharge25 !== 1 || epi[end].consulting)) fails.push(`epilogue ${end}: an upcharge or consulting in a journalist ending`);
    if (s.stage !== 'S7') fails.push(`epilogue ${end}: stage ${s.stage}, not S7`);
  }
  // walking away unchosen: run.out, and the ending is still reachable another day
  { const s = fresh({ record: false, north: false, meeting: false, met: true }); s.set('run.out', 30, 'solve'); s.clock({ abs: ABS0 + 1, hours: 7 });
    const plan = N.lotFor(s, 31, { abs: ABS0 + 1, hours: 7, served: true });
    if (!plan.stage) fails.push('walk away: the lot never stages again'); else epi.walkAway = { stagesAgain: true, wagon: plan.wagon }; }
  return { ok: !fails.length, rows, epilogue: epi, fails };
}

// --- final: begin — the 72-branch gate (campaign-design §14.2 check 5, Part 4 Round 6: "the full 72-branch endings check
// is a gate"). The product of the exclusive climax choices: Tauno on record ×2, Sheila ×2, Denny ×3, Aili ×2, Brekke ×3.
// Each choice is played as its own scene plays it: the choice's `then` in the scene data (and the `then` of the node it
// goes to), found by the fact it writes, applied through the story's rules (f:, walt:, conditional blocks); a hook (do:)
// is named, not run. A choice with no producer in the data is a failure. Then the dawn lot from that state, as above:
// J and M reachable in every branch, JN wherever "went north" holds, across north × meeting × Maggie met.
const CHOICES = [
  { who: 'tauno', ways: [{ id: 'record', act: 'f:tauno.record' }, { id: 'off', act: null }] },
  { who: 'sheila', ways: [{ id: 'in', act: 'f:choice.sheila=in' }, { id: 'lie', act: 'f:choice.sheila=lie' }] },
  { who: 'denny', ways: [{ id: 'turn', act: 'f:choice.denny=turn' }, { id: 'told', act: 'f:choice.denny=told' }, { id: 'left', act: 'f:choice.denny=left' }] },
  { who: 'aili', ways: [{ id: 'know', act: 'f:choice.aili=know' }, { id: 'thanks', act: 'f:choice.aili=thanks' }] },
  { who: 'brekke', ways: [{ id: 'lie', act: 'f:choice.brekke=lie' }, { id: 'deflect', act: 'f:choice.brekke=deflect' }, { id: 'needle', act: 'f:choice.brekke=needle' }] },
];
const SCENE_MODS = ['mining.js', 'guiding.js', 'family.js', 'company.js', 'informant.js', 'boys.js'];
async function sceneDefs() {
  const out = [];
  for (const f of SCENE_MODS) {
    let M; try { M = await import(`../src/story-data/${f}`); } catch { continue; }
    for (const [k, v] of Object.entries(M)) if (v && typeof v === 'object' && v.nodes && typeof v.nodes === 'object') out.push({ mod: f, name: k, def: v });
  }
  return out;
}
// every way the data writes `act`: [{ where, acts }] (the choice's then + its `to` node's then, or the node's own then)
function producersOf(defs, act) {
  const has = (list) => JSON.stringify(list || []).includes(JSON.stringify(act));
  const ways = [];
  for (const { mod, name, def } of defs) for (const [nid, N0] of Object.entries(def.nodes)) {
    if (has(N0.then)) ways.push({ where: `${mod} ${name}.${nid}`, acts: [...(N0.then || [])] });
    for (const c of N0.go || []) if (has(c.then)) ways.push({ where: `${mod} ${name}.${nid}:${c.ask}`, acts: [...(c.then || []), ...((c.to && def.nodes[c.to] && def.nodes[c.to].then) || [])] });
  }
  return ways;
}
function play(s, acts, hooks) {
  for (const x of acts || []) {
    if (x && typeof x === 'object') { if (!x.when || s.when(x.when)) play(s, x.then, hooks); continue; }
    if (typeof x !== 'string') continue;
    if (/^do:/.test(x)) { hooks.add(x); continue; }
    if (/^(f:|walt:|und:|key:)/.test(x)) { try { s.rules.apply({ id: 'solve:72', then: [x] }, {}); } catch { /* a walt: id the text lacks: the lint's */ } }
  }
}
export async function solveChoices72(opts = {}) {
  FROM = opts.from || null;
  const defs = await sceneDefs(), rows = [], fails = [], hooksSeen = new Set(), producers = {};
  for (const C of CHOICES) for (const w of C.ways) if (w.act) {
    const p = producersOf(defs, w.act);
    producers[`${C.who}=${w.id}`] = p.map((q) => q.where);
    if (!p.length) fails.push(`no producer in the scene data for ${C.who}: ${w.act}`);
  }
  const prod = (C, w) => (w.act ? producersOf(defs, w.act)[0] : null);
  const hooks = (S) => ({ handed: () => {}, carbon: () => S.set('end.carbon', 'maggie', 'solve'),
    named: () => N.commitEnding(S, { end: 'J', walt: 'named', lot: 30 }), kept: () => N.commitEnding(S, { end: 'J', walt: 'kept', lot: 30 }),
    handover: () => N.commitEnding(S, { end: 'M', lot: 30 }), close: () => {},
    turnback: () => {}, readyes: () => S.set('end.read', 'yes', 'solve'), readno: () => S.set('end.read', 'no', 'solve'), readsilent: () => S.set('end.read', 'silent', 'solve') });
  const pick = (i) => { const out = []; let n = i; for (const C of CHOICES) { out.push([C, C.ways[n % C.ways.length]]); n = Math.floor(n / C.ways.length); } return out; };
  const total = CHOICES.reduce((a, C) => a * C.ways.length, 1);
  let branches = 0;
  for (let i = 0; i < total; i++) {
    const sel = pick(i), label = sel.map(([C, w]) => `${C.who}=${w.id}`).join(' ');
    if (sel.some(([C, w]) => w.act && !prod(C, w))) continue; // (a choice with no producer: failed above)
    branches++;
    const setup = (s) => { for (const [C, w] of sel) { if (C.who === 'tauno') continue; play(s, prod(C, w).acts, hooksSeen); } };
    let all = true;
    for (const north of [false, true]) for (const meeting of [false, true]) for (const met of [true, false]) {
      const br = { record: sel[0][1].id === 'record', north, meeting, met, setup };
      const before = fails.length;
      endsFor(br, `${label} · north=${+north} meeting=${meeting ? 30 : 'any'} maggie=${met ? 'met' : 'stranger'}`, rows, fails, hooks);
      if (fails.length > before) all = false;
    }
    rows.push({ branch: label, all });
  }
  return { ok: !fails.length && branches === total, total, branches, combos: rows.filter((r) => r.all === undefined).length, rows: rows.filter((r) => r.all !== undefined), producers, hooks: [...hooksSeen], fails };
}
// final: end

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const warn = console.warn; console.warn = () => {};
  const r = solveEndings(); console.warn = warn;
  for (const row of r.rows) console.log(`${row.J && row.M && row.JN !== false ? 'PASS' : 'FAIL'} endings ${row.branch} (wagon: ${row.wagon}): J ${row.J} · JN ${row.JN} · M ${row.M}`);
  for (const [k, v] of Object.entries(r.epilogue)) console.log(`     epilogue ${k}: ${JSON.stringify(v)}`);
  for (const f of r.fails) console.log(`FAIL ${f}`);
  const i = process.argv.indexOf('--json'); if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(r, null, 1));
  console.log(r.ok ? 'story-solve-endings: J, JN and M reachable in every branch' : `story-solve-endings: ${r.fails.length} failures`);
  process.exit(r.ok ? 0 : 1);
}
