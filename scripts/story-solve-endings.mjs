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

function fresh(br) {
  const s = new StoryV2({ io: io() });
  s.attach({ profile: profile() });
  s.clock({ abs: ABS0, hours: 6 });
  s.set('nb.found', true, 'solve');
  if (br.record) s.set('tauno.record', true, 'solve');
  if (br.north) s.set('drift.done', true, 'solve');
  if (br.met) s.meet('maggie', 'solve');
  if (br.meeting) s.doc.meeting = { ep: 30, firstDawn: ABS0 - 1 };
  s.set('run.lifted', br.meeting ? 30 : 'any', 'solve'); // (r's fact at the lift)
  s.set('pit.note', true, 'solve');                      // (f's: Eino's note picked up)
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

export function solveEndings() {
  const rows = [], fails = [];
  // the hooks: endings.js's, on the solver's own state
  const hooks = (S) => {
    const st = S.solveHooks || (S.solveHooks = { read: null });
    return {
      handed: () => {}, carbon: () => S.set('end.carbon', 'maggie', 'solve'),
      named: () => N.commitEnding(S, { end: 'J', walt: 'named', lot: 30 }), kept: () => N.commitEnding(S, { end: 'J', walt: 'kept', lot: 30 }),
      close: () => { if (!S.has('end') && st.scene === 'M') N.commitEnding(S, { end: 'M', read: st.read || 'silent', lot: 30 }); },
      turnback: () => {}, readyes: () => { st.read = 'yes'; }, readno: () => { st.read = 'no'; }, readsilent: () => { st.read = 'silent'; },
    };
  };
  for (const record of [false, true]) for (const north of [false, true]) for (const meeting of [false, true]) for (const met of [true, false]) {
    const br = { record, north, meeting, met }, name = `record=${+record} north=${+north} meeting=${meeting ? 30 : 'any'} maggie=${met ? 'met' : 'stranger'}`;
    // who is in the lot: Maggie here, or by the call, or as a stranger; Dan and Wade always
    const s0 = fresh(br), plan = N.lotFor(s0, 30, { abs: ABS0, hours: 6, served: true });
    if (!plan.stage) { fails.push(`${name}: the lot is not staged (${plan.why})`); continue; }
    const got = { J: null, JN: null, M: null };
    const sM = fresh(br); sM.solveHooks = { scene: 'M' };
    for (const p of walk(sM, N.DAN_M, 'start', hooks)) { const e = p.s.get('end'); if (e && !got[e]) got[e] = p.trail; }
    const sJ = fresh(br); sJ.solveHooks = { scene: 'J' };
    for (const p of walk(sJ, N.MAGGIE, 'start', hooks)) { const e = p.s.get('end'); if (e && !got[e]) got[e] = p.trail; }
    const want = north ? ['J', 'JN', 'M'] : ['J', 'M'];
    for (const e of want) if (!got[e]) fails.push(`${name}: ${e} not reachable`);
    if (!north && got.JN) fails.push(`${name}: JN reached without "went north"`);
    rows.push({ branch: name, wagon: plan.wagon, J: !!got.J, JN: north ? !!got.JN : 'n/a (needs north)', M: !!got.M, paths: got });
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
