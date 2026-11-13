// story-solve-locks.mjs: the Round 6 lock proof (campaign-design §14.2 checks 3 and 4; Part 4 Round 6: "after this round
// every lock has all its keys: the articulation proof is an error, not a warning"). Node only.
//
// Every key of story-data/locks.js is split into its ways (the facts of its `when`, each an alternative), and each way
// names the support nodes it stands on (a person, place, quest, window or scene: locks.js's support, given per way).
// A way counts only with a witness: a solver path that makes it true (story-solve.mjs's move model: slices 1–3, A3, I,
// each way searched on its own) or a stream's Node proof that plays the scene through StoryV2 (the unit tests named
// below, the company solver). Then, per lock:
//   keys        at least two `independent` keys witnessed (L3B, Gene's slide, confirms and is not counted)
//   knockout    for every support node any way of the lock stands on, the lock still has a witnessed independent way
//               that does not stand on it (a person lost, cold or dead to you; a place never found; a quest missed; a
//               window shut). Check 4 ("no lock behind a person who can be lost": denny.dropped, aili.cold, a keeper
//               cold) is this knockout for those persons.
//   import { WAYS, UNIT_WITNESS, proveLocks } from './story-solve-locks.mjs'
//   proveLocks(witnessed: Set<fact>) → { ok, locks: [{ lock, keys, witnessed, independent, knockouts, fails }], fails }
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCKS } from '../src/story-data/locks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// way (fact) → support nodes. A way's support is what it cannot be had without.
export const WAYS = {
  L1A: { 'tauno.drilled': ['person:tauno'], 'len.westpads.rings': ['person:len'], 'door.mining.yield': ['person:tauno'] },
  L1B: { 'ink.twostump': ['person:tauno'], 'ink.vwater': ['person:tauno'], 'knows.twostump': ['person:tauno'], 'knows.vwater': ['person:tauno'], 'knows.brm14': ['person:hap'] },
  L1C: { 'crews.seen': ['place:crews.landing'], 'westpads.seen': ['place:westpads'] },
  L1D: { 'maggie.kettlemap': ['person:maggie'], 'maggie.ostrander': ['person:maggie'] },
  L2A: { 'hap.farend': ['person:hap'], 'mary.farend': ['person:mary'] },
  L2B: { 'bc.205-50': ['place:P255', 'place:P256'] },
  L2C: { 'pietro.wronghill': ['place:pietro.dig'] },
  L2D: { 'ep.S5.chart': ['quest:S5', 'window:S5'] },
  L2E: { 'denny.revealed': ['person:denny', 'scene:32:reveal'] },
  L3A: { 'bob.eastbay': ['person:bob', 'window:boys'], 'frank.eastbay': ['person:frank', 'window:boys'] },
  L3B: { 'gene.slide.matched': ['person:carol', 'place:gull.eastbay'] },
  L3C: { 'nb.burntpoint': ['place:gull.burntpoint'] },
  L3D: { 'ep.S5.chart': ['quest:S5', 'window:S5'] },
  L4A: { 'aili.stone': ['person:aili'] },
  L4B: { 'knows.stones': ['place:walt.sites'] },
  L4C: { 'gull.stump.lowwater': ['place:gull.stump', 'window:lowwater'] },
  L4D: { 'cards.stone': ['person:liisa'] },
  L4E: { 'nb.paddlestash': ['place:gull.paddlestash'] },
  L5A: { 'nb.longway': ['place:gull.dam'] },
  L5B: { 'tauno.blazes': ['person:tauno'], 'ep.S8.done': ['quest:S8'] },
  L5C: { 'ev.blazes': ['place:pond4747.eastbank'] },
  L6A: { 'nb.torn': ['place:waltcamp'] },
  L6B: { 'tauno.e7sketch': ['person:tauno'], 'maggie.e7sketch': ['person:maggie'] },
  L6C: { 'tauno.pit': ['person:tauno'], 'ep.S6.done': ['quest:S6'] },
};

// ways proved by a stream's Node proof (the scene played through StoryV2), not by story-solve's move model:
// fact → [script, test-name pattern] (node --test), or 'company' (story-solve-company.mjs's doc)
export const UNIT_WITNESS = {
  'aili.stone': ['scripts/cmp-a4-unit.mjs', 'Aili\'s door'],
  'cards.stone': ['scripts/cmp-a4-unit.mjs', 'Liisa: two stories'],
  'ep.S5.chart': ['scripts/cmp-7b-unit.mjs', 'S5: the wreck seen starts it|S5 without you'],
  'ep.S6.done': ['scripts/cmp-7b-unit.mjs', 'S6: the pit opened plank by plank'],
  'bob.eastbay': ['scripts/cmp-b5-unit.mjs', 'the laker bet'],
  'frank.eastbay': ['scripts/cmp-b5-unit.mjs', 'the laker bet'],
  'gene.slide.matched': ['scripts/cmp-b5-unit.mjs', 'the slide: taken'],
  'ep.S8.done': ['scripts/cmp-s-unit.mjs', 'S8\'s reading is a rule'],
  'maggie.kettlemap': 'company', 'maggie.ostrander': 'company', 'maggie.e7sketch': 'company',
};
const ranCache = new Map();
// one Node proof run (cached): pass/fail of the tests the pattern names
function runUnit(script, pattern) {
  const k = `${script}|${pattern}`;
  if (ranCache.has(k)) return ranCache.get(k);
  let ok = false, how = '';
  if (/cmp-s-unit/.test(script)) { // (stream s's file prints PASS/FAIL lines, not node:test)
    const r = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    const line = (r.stdout || '').split('\n').find((l) => l.includes(pattern)) || '';
    ok = /^PASS/.test(line); how = line.slice(0, 120) || 'no such check';
  } else {
    const r = spawnSync(process.execPath, ['--test', `--test-name-pattern=${pattern}`, script], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    const pass = Number((/ℹ pass (\d+)/.exec(r.stdout || '') || [])[1] || 0), fail = Number((/ℹ fail (\d+)/.exec(r.stdout || '') || [])[1] || 0);
    ok = r.status === 0 && pass > 0 && fail === 0; how = `${path.basename(script)} /${pattern}/ ${pass} pass ${fail} fail`;
  }
  const out = { ok, how }; ranCache.set(k, out); return out;
}
export function unitWitness(fact, companyDoc = null) {
  const w = UNIT_WITNESS[fact];
  if (!w) return null;
  if (w === 'company') return { ok: !!(companyDoc && companyDoc.facts && companyDoc.facts[fact] != null), how: 'story-solve-company.mjs (Maggie\'s papers)' };
  return runUnit(w[0], w[1]);
}

// the proof, from the set of witnessed ways
export function proveLocks(witnessed) {
  const locks = [], fails = [];
  for (const L of LOCKS) {
    const row = { lock: L.id, keys: L.keys.map((k) => k.id), witnessed: [], independent: [], knockouts: {}, fails: [] };
    const ways = [];
    for (const k of L.keys) {
      const table = WAYS[k.id];
      if (!table) { row.fails.push(`${k.id}: no ways named for it (story-solve-locks.mjs WAYS)`); continue; }
      // every fact the key's when names is a way here (the table and locks.js must agree)
      const named = [...String(k.when).matchAll(/f:([\w.-]+)/g)].map((m) => m[1]);
      for (const f of named) if (!(f in table)) row.fails.push(`${k.id}: its when names f:${f}, which WAYS does not list`);
      for (const [f, sup] of Object.entries(table)) {
        if (!named.includes(f)) row.fails.push(`${k.id}: WAYS lists ${f}, which its when does not name`);
        if (witnessed.has(f)) ways.push({ key: k.id, fact: f, support: sup, independent: k.independent !== false });
      }
    }
    row.witnessed = [...new Set(ways.map((w) => w.key))];
    row.independent = [...new Set(ways.filter((w) => w.independent).map((w) => w.key))];
    if (row.independent.length < 2) row.fails.push(`two independent keys: only ${row.independent.join(', ') || 'none'} witnessed`);
    const nodes = new Set(ways.flatMap((w) => w.support));
    for (const n of nodes) {
      const left = ways.filter((w) => w.independent && !w.support.includes(n));
      row.knockouts[n] = [...new Set(left.map((w) => w.key))];
      if (!left.length) row.fails.push(`an articulation point: without ${n} no independent key is left`);
    }
    for (const f of row.fails) fails.push(`${L.id}: ${f}`);
    locks.push(row);
  }
  return { ok: !fails.length, locks, fails };
}
