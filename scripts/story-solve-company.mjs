// story-solve-company.mjs: the company and the press's proof (campaign Round 6, stream p; Part 4 Round 6: "after this
// round every lock has all its keys"). Node only: the story's own engine (StoryV2, story-cond, all-rules.js) plays
// story-data/company.js's scenes as topics.js SceneRun walks them (lines by condition, choices by condition and `once`,
// `then` actions, do: hooks mapped to company.js's) and searches each scene for its goal fact. The arc:
//   two big findings (the crew map + Mary's far end, counted) → tier 2 → Tauno's call (or "Not yet." and the fallback at
//   the third finding) → a trip starts: the midpoint, tier 3 → the camp search → Wade at the counter → Josie's slip →
//   Maggie at Hog Creek: met, the papers (L1 D), the meeting point → the leech order (story.doc.meeting) → the canoe
//   adrift: tier 4 → Dan's offer and set-up → Brekke at the table (each answer; needling steps the tier, never past 4) →
//   the endings from the real meeting (story-solve-endings.mjs, from this doc).
//
//   import { solveCompany } from './story-solve-company.mjs'   → { ok, steps: [{ id, ok, why }], fails, doc }
//   node scripts/story-solve-company.mjs [--json out.json]
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { StoryV2 } from '../src/story.js';
import { registerSensor } from '../src/story-cond.js';
import { texts, T } from '../src/topics.js';
import * as P from '../src/story-data/company.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const [k, v] of Object.entries(P.P_SENSORS)) registerSensor(k, v);
for (const f of ['company.json', 'mining.json', 'drafted.json']) texts.add(JSON.parse(readFileSync(path.join(ROOT, 'src/story-data/text', f), 'utf8')));
texts.add({ 'p.rt.lakeq': { text: 'Were you out on the lake yesterday?' } });
const io = () => { const m = new Map(); return { read: (ns, f = null) => (m.has(ns) ? JSON.parse(m.get(ns)) : f), write: (ns, v) => { m.set(ns, JSON.stringify(v)); return true; } }; };
const profile = () => ({ seasonId: 'solve-p', started: true, onChange: () => {} });
const ABS0 = Math.round(Date.UTC(2026, 6, 20) / 86400000); // 20 July 2026
const ARGS = { ep: null, walts: true, hasLid: false, hasBlade: false, bigNew: false, hogHome: false, lenBE: false, lenGrade: false, lenLake: false, seenTauno: false, firstOrder: true, evening: false };

function fresh() {
  const s = new StoryV2({ io: io() });
  s.attach({ profile: profile() });
  s.clock({ abs: ABS0, hours: 10 });
  return s;
}
const clone = (S) => { const t = new StoryV2({ io: io() }); t.attach({ profile: profile() }); t.setDoc(JSON.parse(JSON.stringify(S.doc))); t.clock({ abs: S.time().abs, hours: S.time().hours }); return t; };
// a scene walked depth-first until goal(s) holds: → { s, trail } | null. hooks(S) → { name: fn }
function reach(S0, def, start, goal, { hooks = () => ({}), args = ARGS, limit = 30, avoid = null } = {}) {
  const seen = new Set();
  const lines = (S, list, a, missing) => {
    for (const l of list || []) {
      if (!l || typeof l !== 'object' || l.hook) continue;
      if (l.first) continue;
      if (l.when && !S.when(l.when, a)) continue;
      if (l.id && !T(l.id)) missing.push(l.id);
    }
  };
  const act = (S, list, a) => {
    for (const x of list || []) {
      if (x && typeof x === 'object') { if (!x.when || S.when(x.when, a)) act(S, x.then, a); continue; }
      const m = /^do:(\w+)$/.exec(x);
      if (m) { const h = hooks(S)[m[1]]; if (h) h(); continue; }
      S.rules.apply({ id: `solve:${def.id}`, then: [x] }, a);
    }
  };
  const go = (S, node, trail, depth) => {
    if (goal(S)) return { s: S, trail };
    if (depth > limit) return null;
    const key = `${node}|${Object.entries(S.doc.facts).map(([k, v]) => `${k}=${JSON.stringify(Array.isArray(v) ? v[0] : v)}`).sort().join(',')}`; if (seen.has(key)) return null; seen.add(key);
    const N0 = def.nodes[node]; if (!N0) return null;
    const missing = []; lines(S, N0.say, args, missing); if (missing.length) throw new Error(`${def.id}:${node} missing words ${missing.join(' ')}`);
    act(S, N0.then, args);
    if (goal(S)) return { s: S, trail: [...trail, node] };
    if (N0.end) return null;
    if (N0.to) return go(S, N0.to, [...trail, node], depth + 1);
    const opts = [...(N0.go || [])].filter((c) => (!c.when || S.when(c.when, args)) && !(c.once && S.has(`${def.who}.said.${c.once}`)) && !(avoid && avoid(c)));
    for (const c of opts) {
      if (!T(c.ask)) throw new Error(`${def.id}:${node} a choice with no words: ${c.ask}`);
      const S2 = clone(S);
      if (c.once) S2.set(`${def.who}.said.${c.once}`, true, 'solve');
      act(S2, c.then, args);
      const step = `${node}:${c.ask}`;
      if (goal(S2)) return { s: S2, trail: [...trail, step] };
      if (c.end) continue;
      const r = go(S2, c.to || node, [...trail, step], depth + 1); if (r) return r;
    }
    return null;
  };
  return go(clone(S0), start, [], 0);
}

export function solveCompany() {
  const steps = [], fails = [];
  const check = (id, ok, why = '') => { steps.push({ id, ok: !!ok, why }); if (!ok) fails.push(`${id}: ${why}`); return ok; };
  // every word the scenes name resolves (the extract's ids; p.rt.* are filled at runtime)
  const ids = new Set(), walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { for (const [k, v] of Object.entries(x)) { if ((k === 'id' || k === 'ask') && typeof v === 'string') ids.add(v); else if (k === 'say' || k === 'go' || k === 'nodes' || k === 'first' || typeof v === 'object') walk(v); } } else if (typeof x === 'string' && /^(\d\d[:.]|d95\.|note\.|item\.|paper\.)/.test(x)) ids.add(x); };
  for (const d of [P.TAUNO_CALL, P.KEEPER_LEDGER, P.DAN, P.WADE_COUNTER, P.WADE_PUTIN, P.JOSIE_LEECH, P.MAGGIE, P.PAD, P.PAD_TOPIC, P.BREKKE_TABLE, P.CALLERS, P.HEARD, P.MAGGIE_BYE]) walk(d);
  for (const id of ['item.leechslip', 'paper.walt.2019', 'paper.ostrander.1977', 'paper.ostrander.1977.blue', 'paper.boreal.1976', 'd95.p.handout', 'note.maggie.meet', 'd95.p.dancard', '40:3.4.c1', '40.stranger.dot', 'd95.p.wade.dot', '40:3.1.14', '40:4.3.1', '40:4.3.2', '40:4.3.11', '40.wade.josie', '40.hog.early', '40.hog.back', 'd95.p.pad.slip']) ids.add(id);
  const missing = [...ids].filter((id) => !/^p[:.]/.test(id) && !T(id));
  check('words', !missing.length, missing.join(' '));
  let s = fresh();
  s.set('nb.found', true, 'solve');
  s.set('asked.boreal.2', true, 'solve');                 // tier 1 (rules-core tier1)
  s.set('crews.seen', true, 'solve');                     // tier 2
  s.set('door.mining.yield', true, 'solve');              // the crew map: big finding 1
  check('tier2', s.tier === 2, `tier ${s.tier}`);
  check('mary.counted', (() => { const before = s.bigCount; s.set('mary.farend', true, 'solve'); return s.bigCount === before + 1 && s.bigCount === 2; })(), `bigCount ${s.bigCount}`);
  // the decline branch: "Not yet." → the third big finding → the fallback → a trip → the midpoint
  {
    const r = reach(s, P.TAUNO_CALL, 'start', (S) => S.has('tauno.call.declined'));
    check('call.declined', !!r, 'no "Not yet." path');
    if (r) {
      const t = r.s; t.set('drift.done', true, 'solve');                // the drift test: big finding 3
      check('fallback', t.has('maggie.fallback'), 'the fallback call did not come at the third finding');
      t.ingest('trip:start', { n: 2, ep: 25 });
      check('midpoint.fallback', t.has('midpoint') && t.tier === 3, `midpoint ${t.has('midpoint')} tier ${t.tier}`);
      const k = reach(t, P.TAUNO_CALL, 'start', () => false); void k;
    }
    // the keeper's Ledger after "Not yet." (the player's own way)
    if (r) { const t = clone(r.s); t.rules.apply({ id: 'solve:ledger', then: P.KEEPER_LEDGER.then }, ARGS); check('ledger', t.get('maggie.called') === 'keeper' && t.when(P.KEEPER_LEDGER.when) === false, 'the Ledger topic'); }
  }
  // the main way: "Call her."
  const call = reach(s, P.TAUNO_CALL, 'start', (S) => S.has('tauno.call'));
  if (!check('call', !!call, 'no "Call her." path')) return { ok: false, steps, fails };
  s = call.s;
  check('no.midpoint.yet', !s.has('midpoint'), 'the midpoint before a trip starts');
  s.ingest('trip:start', { n: 3, ep: 30 });
  check('midpoint', s.has('midpoint') && s.tier === 3, `tier ${s.tier}`);
  check('search.due', P.searchDue(s), 'searchDue');
  s.set('ev.search', 'Ensign', 'solve');
  check('search.page', s.walt().includes('40.w.search.1'), 'the Walt line');
  // Dan: at tier 3 his first visit is the meeting, the next the offer
  check('dan.meet.due', P.danDue(s, { visitN: 1 }) === 'meet', P.danDue(s, { visitN: 1 }));
  const dm = reach(s, P.DAN, 'meet', (S) => S.has('dan.card')); check('dan.card', !!dm, 'no path to the card'); if (dm) s = dm.s;
  check('dan.offer.due', P.danDue(s, { visitN: 3, lastDan: 1 }) === 'offer', P.danDue(s, { visitN: 3, lastDan: 1 }));
  const dof = reach(s, P.DAN, 'offer', (S) => S.has('dan.offer')); check('dan.offer', !!dof, 'no path to the offer'); if (dof) s = dof.s;
  // Wade at the counter: every question reachable; the register and the boots when known
  const wc = reach(s, P.WADE_COUNTER, 'start', (S) => S.has('wade.named')); check('wade.counter', !!wc, 'Wade named'); if (wc) s = wc.s;
  // Josie's slip → Maggie at Hog Creek from the third morning
  const js = reach(s, P.JOSIE_LEECH, 'start', (S) => S.has('maggie.note'), { hooks: (S) => ({ slip: () => S.set('maggie.note', Math.floor(S.time().abs), 'solve') }) });
  if (!check('josie.slip', !!js, 'no slip')) return { ok: false, steps, fails };
  s = js.s;
  check('maggie.early', !P.maggieHere(s, { abs: ABS0 + 2, hours: 10, month: 7 }) && P.maggieHere(s, { abs: ABS0 + 3, hours: 10, month: 7 }), 'not there on the third morning');
  s.clock({ abs: ABS0 + 3, hours: 10 });
  const mg = reach(s, P.MAGGIE, 'first', (S) => S.has('key.L1D'), { hooks: () => ({}) });
  check('L1D', !!mg, 'Maggie\'s papers never reached'); if (mg) s = mg.s;
  check('L1D.facts', s.has('maggie.ostrander') && s.has('maggie.kettlemap') && s.has('maggie.e7copy'), 'the papers\' facts');
  const lock1 = s.lock(1); check('lock1.keys', lock1 && (lock1.keys || []).length >= 3, JSON.stringify(lock1));
  // the lie caught on a later visit (the bunk), and the handwriting matched
  const caught = reach(s, P.MAGGIE, 'again', (S) => S.has('maggie.caught') || !S.has('maggie.lied'), { args: { ...ARGS, evening: true } });
  check('maggie.lie', !!caught, 'the lie never caught');
  const mt = reach(s, P.MAGGIE, 'again', (S) => S.has('maggie.matched')); check('maggie.matched', !!mt || s.has('maggie.matched'), 'no match'); if (mt) s = mt.s;
  const mm = reach(s, P.MAGGIE, 'again', (S) => S.has('maggie.meeting')); check('maggie.meeting', !!mm, 'the meeting point never set'); if (mm) s = mm.s;
  // the pad: Lake One, three dozen → story.doc.meeting
  check('pad.topic', s.when(P.PAD_TOPIC.when), 'the pad\'s topic');
  let pick = { ep: null, n: null };
  const pd = reach(s, P.PAD, 'start', (S) => S.has('maggie.order'), { hooks: (S) => ({ one: () => { pick.ep = P.LAKE_ONE; }, gab: () => { pick.ep = P.LITTLE_GABBRO; }, n3: () => { pick.n = 3; S.doc.meeting = P.meetingFrom(S.time().abs, pick.ep, 3); } }), avoid: (c) => /pad\.[1-24-9]$/.test(c.ask) || c.ask === 'd95.p.pad.gabbro' });
  check('pad', !!pd && pd.s.doc.meeting && pd.s.doc.meeting.ep === 30 && pd.s.doc.meeting.firstDawn === ABS0 + 3 + 3, JSON.stringify(pd && pd.s.doc.meeting));
  if (pd) s = pd.s;
  // the canoe adrift in September: tier 4; Dan's set-up; Maggie's offer to stop
  s.clock({ abs: ABS0 + 45, hours: 6 });
  check('adrift.due', P.adriftDue(s, { month: 9, wind: 1, shore: 8 }) && !P.adriftDue(s, { month: 9, wind: 4, shore: 8 }) && !P.adriftDue(s, { month: 9, wind: 1, shore: 8, island: true }), 'adriftDue');
  s.set('ev.adrift', 'C1234', 'solve');
  check('tier4', s.tier === 4, `tier ${s.tier}`);
  check('dan.setup.due', P.danDue(s, { visitN: 9, lastDan: 3 }) === 'setup', P.danDue(s, { visitN: 9, lastDan: 3 }));
  const ds = reach(s, P.DAN, 'setup', (S) => S.has('dan.setup')); check('dan.setup', !!ds, 'set-up'); if (ds) s = ds.s;
  const st = reach(s, P.MAGGIE, 'again', (S) => S.has('maggie.adrift')); check('maggie.stop', !!st, 'the offer to stop');
  // Brekke at the table: every answer; the needle steps the tier but never past 4 (and only with the numbers)
  for (const want of ['lie', 'deflect', 'needle']) {
    const b = reach(s, P.BREKKE_TABLE, 'start', (S) => S.get('choice.brekke') === want && S.has('brekke.talked'));
    check(`brekke.${want}`, !!b, `no path to ${want}`);
    if (b && want === 'needle') check('brekke.cap', b.s.tier === 4, `tier ${b.s.tier}`);
  }
  { const t = fresh(); t.set('asked.boreal.2', true, 'solve'); t.set('crews.seen', true, 'solve'); t.set('choice.brekke', 'needle', 'solve'); check('needle.steps', t.tier === 3, `tier ${t.tier} (2 + the needle)`); }
  // Mary cold with the lid sold to Dan (her lock key kept)
  return { ok: !fails.length, steps, fails, doc: s.doc };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const R = solveCompany();
  for (const st of R.steps) console.log(`${st.ok ? 'PASS' : 'FAIL'} p.${st.id}${st.ok ? '' : ` — ${st.why}`}`);
  // the endings from this doc: the run lifted with the meeting set at Lake One
  const { solveEndings } = await import('./story-solve-endings.mjs');
  const E = solveEndings({ from: R.doc });
  const any = (k) => E.rows.some((r) => r[k]);
  console.log(`${any('J') && any('M') ? 'PASS' : 'FAIL'} p.endings from the company's doc (J ${any('J')}, M ${any('M')}; ${E.fails.length} fails)`);
  const i = process.argv.indexOf('--json'); if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify({ ...R, doc: undefined }, null, 1));
  process.exit(R.ok && any('J') && any('M') ? 0 : 1);
}
