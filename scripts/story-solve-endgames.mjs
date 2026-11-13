// story-solve-endgames.mjs: the end games' proof (story wave 2, stream g; campaign-design Part 3 #5–#6). Node only: the
// story's own engine (StoryV2 with every rule of all-rules.js, E's episode records compiled in) and the pure rules of
// story-data/endgames.js, played day by day from each ending:
//   J  a player who visits whichever owner has a secret ready, takes it on, finds it a week later and tells them the next
//      day: every one of the eleven secrets is told (secret.<id>.done) and its episode ends on the runner (ep.G_<id>.end),
//      one at a time, never two within SECRET_GAP days; nothing is offered after the money ending
//   M  a player who asks each owner whose turn it is and does the job three days later: all fourteen owners softened,
//      never two asks within SOFT_GAP days, in about a year of play; nothing is offered after the journalist ending
//
//   import { solveEndgames } from './story-solve-endgames.mjs'   → { ok, J: {...}, M: {...}, fails }
//   node scripts/story-solve-endgames.mjs
import { fileURLToPath } from 'node:url';
import { StoryV2 } from '../src/story.js';
import * as G from '../src/story-data/endgames.js';

const io = () => { const m = new Map(); return { read: (ns, f = null) => (m.has(ns) ? JSON.parse(m.get(ns)) : f), write: (ns, v) => { m.set(ns, JSON.stringify(v)); return true; } }; };
const ABS0 = Math.round(Date.UTC(2026, 7, 20) / 86400000); // 20 Aug 2026: an ending late in a season

function fresh(end) {
  const s = new StoryV2({ io: io() });
  s.attach({ profile: { seasonId: 'solve-g', started: true, onChange: () => {} } });
  s.clock({ abs: ABS0, hours: 9 });
  s.set('end', end === 'M' ? 'M' : end, 'solve');
  s.set(end === 'M' ? 'end.M' : 'end.J', true, 'solve');
  return s;
}
const day = (s, abs) => s.clock({ abs, hours: 10 });

export function solveEndgames({ days = 900 } = {}) {
  const fails = [];
  // --- J -------------------------------------------------------------------------------------------------------------
  const s = fresh('J'), told = [], given = [];
  let found = null;
  for (let d = 0; d < days && told.length < G.SECRETS.length; d++) {
    const abs = ABS0 + d; day(s, abs);
    if (G.softReady(s, 31)) fails.push('J: an owner asks a softening task after the journalist ending');
    // a secret ready with any owner: taken on
    for (const ep of G.OWNER_EPS) {
      const S = G.secretFor(s, ep); if (!S) continue;
      s.set(`secret.${S.id}.given`, abs, 'solve');
      s.rules.apply({ id: 'solve:yes', then: [`f:ep.${G.epId(S.id)}.yes`] }, {});
      given.push({ id: S.id, abs }); found = { S, at: abs + 7 }; break;
    }
    if (found && abs === found.at) { s.set(`secret.${found.S.id}.found`, abs, 'solve'); }
    if (found && abs === found.at + 1) { s.set(`secret.${found.S.id}.done`, abs, 'solve'); told.push(found.S.id); found = null; }
  }
  for (const S of G.SECRETS) {
    if (!s.has(`secret.${S.id}.done`)) fails.push(`J: ${S.id} never told`);
    if (s.get(`ep.${G.epId(S.id)}.end`) !== 'told') fails.push(`J: ${G.epId(S.id)} never ends on the runner`);
  }
  for (let i = 1; i < given.length; i++) if (given[i].abs - given[i - 1].abs < G.SECRET_GAP) fails.push(`J: ${given[i].id} told ${given[i].abs - given[i - 1].abs} days after ${given[i - 1].id}`);
  if (given.length && given[0].abs - ABS0 < G.FIRST_AFTER) fails.push('J: the first secret before the paper');
  const J = { told: told.length, first: given.length ? given[0].abs - ABS0 : null, last: given.length ? given[given.length - 1].abs - ABS0 : null, order: given.map((g) => g.id) };

  // --- M -------------------------------------------------------------------------------------------------------------
  const m = fresh('M'), asks = [], pending = [];
  for (let d = 0; d < days && G.softenedCount(m) < G.OWNER_EPS.length; d++) {
    const abs = ABS0 + d; day(m, abs);
    if (G.secretFor(m, 31) || G.secretReady(m)) fails.push('M: a secret offered after the money ending');
    for (const ep of G.OWNER_EPS) {
      if (!G.softReady(m, ep) || m.has(`owner.${ep}.asked`)) continue;
      m.set(`owner.${ep}.asked`, G.softOf(ep).kind, 'solve'); asks.push({ ep, abs }); pending.push({ ep, at: abs + 3 }); break;
    }
    for (const p of pending.filter((q) => q.at === abs)) m.set(`owner.${p.ep}.softened`, abs, 'solve');
  }
  if (G.softenedCount(m) !== G.OWNER_EPS.length) fails.push(`M: only ${G.softenedCount(m)} of ${G.OWNER_EPS.length} owners softened`);
  for (let i = 1; i < asks.length; i++) if (asks[i].abs - asks[i - 1].abs < G.SOFT_GAP) fails.push(`M: owner ${asks[i].ep} asked ${asks[i].abs - asks[i - 1].abs} days after ${asks[i - 1].ep}`);
  const M = { softened: G.softenedCount(m), days: asks.length ? asks[asks.length - 1].abs + 3 - ABS0 : null };
  return { ok: !fails.length, J, M, fails };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = solveEndgames();
  console.log(`end games: J ${r.J.told}/${G.SECRETS.length} secrets told (first +${r.J.first} d, last +${r.J.last} d: ${r.J.order.join(' ')}); M ${r.M.softened}/${G.OWNER_EPS.length} owners softened in ${r.M.days} days`);
  for (const f of r.fails) console.log('FAIL', f);
  console.log(r.ok ? 'SOLVE end games' : 'FAIL end games');
  process.exit(r.ok ? 0 : 1);
}
