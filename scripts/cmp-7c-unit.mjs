// 7c's unit checks (Round 7: the mini-campaigns M1–M6; docs/build/campaign-design.md §10.3). Node, no browser.
//   node scripts/cmp-7c-unit.mjs
//   records   every M record passes checkRecord, ids unique, every text id resolves (drafts-7c.json and the extract)
//   cycles    cycle k is open only while exactly k winter turns are facts (the last stays open); a turn reseeds: M1's
//             chain, M3's man and list, M4's partner, M5's route differ from the year before
//   M1        the flyer on boards 25 and 31; two signs → range; range + seen → documented; a site picked → relocated
//             ($40 through pay:); three camps taught → gave up; the window closing → trapped (or lost, fed four times)
//   M2        the logbook at Loon Falls is a yes; five boxes → filled; the keeper's word → passed; never shut (always)
//   M3        the yes by choice; five shots → all; back → thanks ($30); the window closing → home; never Walt
//   M4        the yes by choice; three favours done → three; the fourth done → last; the window closing → rotated
//   M5        the bet → the yes; every lake → round; back → made; iced → ice
//   M6        a project chosen → the yes; done → done; over → yours; longStay counts from the start
//   reseed    a fake turn (story.set year.turned.2027): cycle 0's M1 shuts and ends without you, cycle 1's flyer is up
//   games     bearsign: still and dark → seen, a shot while in → photo, the lamp on it → spooked; fogvoices: earshot long
//             enough → heard, never caught; skimice: strokes break through, turning out → back
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoryV2 } from '../src/story.js';
import { Episodes, checkRecord } from '../src/episodes.js';
import { EPISODES, MINIS } from '../src/story-data/episodes/index.js';
import { CYCLES, cycleOf, idOf, bearChain, soloist, rangers, freezeRoute, longStay, FOG_ROUTE, M3_ROUTES } from '../src/minis.js';
import { bearsign } from '../src/minigames/bearsign.js';
import { fogvoices } from '../src/minigames/fogvoices.js';
import { skimice } from '../src/minigames/skimice.js';
import { FOG } from '../src/minis.js';
import { registerSensor } from '../src/story-cond.js';
import { A2_SENSORS } from '../src/story-data/mining.js';
for (const [k, v] of Object.entries(A2_SENSORS)) registerSensor(k, v);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = {};
for (const f of readdirSync(path.join(ROOT, 'src/story-data/text')).filter((x) => x.endsWith('.json'))) Object.assign(TEXT, JSON.parse(readFileSync(path.join(ROOT, 'src/story-data/text', f), 'utf8')).text);
const text = (id) => (TEXT[id] ? TEXT[id].text : null);
console.warn = () => {};
const results = [];
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 600)); };
const io = () => { const m = new Map(); return { read: (ns, f = null) => (m.has(ns) ? JSON.parse(m.get(ns)) : f), write: (ns, v) => { m.set(ns, JSON.stringify(v)); return true; } }; };
const absOf = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);
function world({ y = 2026, m = 7, d = 10, h = 11 } = {}) {
  const s = new StoryV2({ io: io() });
  s.attach({ profile: { seasonId: 'cmp-7c', started: true, onChange: () => {} } });
  s.clock({ abs: absOf(y, m, d), hours: h });
  const stamps = [], pays = [];
  s.handle('pay', (arg) => { pays.push(arg); return true; });
  const R = { first: (k, key, words) => { if (stamps.some((x) => x.key === key)) return false; stamps.push({ k, key, words }); return true; } };
  const E = new Episodes();
  for (const r of EPISODES) E.register(r);
  E.attach({ story: s, record: R, text });
  const go = (yy, mm, dd, hh = 11) => { s.clock({ abs: absOf(yy, mm, dd), hours: hh }); E.dayTurn(); };
  const set = (...keys) => { for (const k of keys) s.rules.apply({ id: `t:${k}`, then: [`f:${k}`] }, {}); };
  return { s, E, stamps, pays, go, set };
}

// --- records ----------------------------------------------------------------------------------------------------------
{
  const bad = MINIS.flatMap((r) => checkRecord(r).map((w) => `${r.id}: ${w}`));
  const ids = MINIS.map((r) => r.id), dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  const missing = [];
  for (const E of MINIS) {
    const tids = [E.flyer && E.flyer.text, ...(E.page || []).map((p) => p.text), ...(E.ends || []).map((e) => e.line), E.first, ...(E.doors || []).map((d) => d.line),
      ...(E.topics || []).flatMap((t) => [t.ask, t.say])].filter(Boolean);
    for (const id of tids) if (!text(id)) missing.push(`${E.id}:${id}`);
  }
  const long = Object.entries(TEXT).filter(([id, e]) => /^m\d\./.test(id) && ((e.k === 'bark' && e.text.length > 180) || (e.k === 'hint' && e.text.length > 80))).map(([id]) => id);
  result('records: checkRecord, unique ids, every word there, barks and hints in length', !bad.length && !dup.length && !missing.length && !long.length, { n: MINIS.length, bad, dup, missing: missing.slice(0, 10), long });
}
// M3 is never Walt (§10.3): his lines and lakes name no Walt, Canada, stone or stump
{
  const BAN = /\b(walt|canada|stone|stump)\b/i;
  const words = Object.entries(TEXT).filter(([id]) => /^m3\./.test(id)).filter(([, e]) => BAN.test(e.text)).map(([id]) => id);
  const lakes = M3_ROUTES.flat().filter((n) => BAN.test(n));
  result('M3 is never Walt: no Walt, Canada, stone or stump in his words or his lakes', !words.length && !lakes.length, { words, lakes });
}

// --- cycles and reseeds -------------------------------------------------------------------------------------------------
{
  const { s, E } = world({ m: 7, d: 10 });
  const open0 = E.window('M1_0') && !E.window('M1_1');
  s.set('year.turned.2027', true, 'test'); E.dayTurn(true);
  const open1 = !E.window('M1_0') && E.window('M1_1') && cycleOf(s) === 1;
  for (let y = 2028; y < 2026 + CYCLES + 3; y++) s.set(`year.turned.${y}`, true, 'test');
  E.dayTurn(true);
  const last = E.window(idOf('M1', CYCLES - 1)) && cycleOf(s) === CYCLES - 1;
  const diff = (f) => new Set(Array.from({ length: CYCLES }, (_, k) => JSON.stringify(f(k)))).size;
  const chains = diff((k) => bearChain(k).i), solos = diff((k) => soloist(k).s), routes = diff((k) => soloist(k).r), partners = diff((k) => rangers(k).p), fr = diff((k) => freezeRoute(k).i);
  const seq = [0, 1].map((k) => [bearChain(k).i, soloist(k).name, rangers(k).partner, freezeRoute(k).i].join('/'));
  result('cycles: one open a year by the turns, the last stays open; a turn reseeds every yearly mini', open0 && open1 && last && chains === 6 && solos === 6 && partners === 6 && seq[0] !== seq[1], { open0, open1, last, chains, solos, routes, partners, fr, seq });
}

// --- M1 -----------------------------------------------------------------------------------------------------------------
{
  const { s, E, pays, go, set } = world({ m: 7, d: 3 });
  const f25 = E.flyers(25).map((f) => f.id), f31 = E.flyers(31).map((f) => f.id), f12 = E.flyers(12).map((f) => f.id);
  const taken = E.take('ep:M1_0') && E.started('M1_0');
  const P = 'ep.M1_0';
  set(`${P}.sign.claw`); const r1 = s.has(`${P}.range`);
  set(`${P}.sign.scat`); const r2 = s.has(`${P}.range`);
  set(`${P}.seen`); const doc = s.has(`${P}.documented`);
  set(`${P}.site.b`, `${P}.relocate`);
  const end = s.get(`${P}.end`);
  const page = E.page('M1_0');
  result('M1: the flyer on 25 and 31 (not 12), signs → range, seen → documented, a site → relocated, $40', f25.includes('ep:M1_0') && f31.includes('ep:M1_0') && !f12.includes('ep:M1_0') && taken && !r1 && r2 && doc && end === 'relocated' && pays.some((p) => /^40@m1\.pay/.test(p)) && page.lines.length >= 4 && !!page.end,
    { taken, r1, r2, doc, end, pays, lines: page.lines.length });
  void go;
}
{
  const { s, E, set } = world({ m: 7, d: 3 });
  E.take('ep:M1_0'); const P = 'ep.M1_0';
  set(`${P}.taught.a`, `${P}.taught.b`); const two = s.has(`${P}.gaveup`);
  set(`${P}.taught.c`);
  result('M1: three camps taught → it gives up', !two && s.get(`${P}.end`) === 'gaveup', { end: s.get(`${P}.end`) });
}
{
  const a = world({ m: 7, d: 3 }), b = world({ m: 7, d: 3 });
  a.E.take('ep:M1_0'); b.E.take('ep:M1_0');
  a.set('ep.M1_0.fed.1'); b.set('ep.M1_0.fed.1', 'ep.M1_0.fed.2', 'ep.M1_0.fed.3', 'ep.M1_0.fed.4');
  a.go(2026, 9, 2); b.go(2026, 9, 2);
  result('M1: September without you: trapped (few fed), lost (four fed)', a.s.get('ep.M1_0.end') === 'trapped' && b.s.get('ep.M1_0.end') === 'lost' && a.s.has('ep.M1_0.shut'), { a: a.s.get('ep.M1_0.end'), b: b.s.get('ep.M1_0.end') });
}

// --- M2 -----------------------------------------------------------------------------------------------------------------
{
  const { s, E, go, set, stamps } = world({ m: 6, d: 20, h: 6 });
  set('ep.M2.log.loon'); const yes = E.started('M2');
  go(2027, 1, 15); const stillOpen = E.window('M2') && !s.has('ep.M2.shut');
  for (const r of FOG_ROUTE) set(`ep.M2.log.${r.id}`);
  const filled = s.has('ep.M2.filled') && !E.ended('M2');
  set('ep.M2.told');
  result('M2: the Loon Falls logbook is a yes, never shut in winter, five boxes → filled, the keeper → passed', yes && stillOpen && filled && s.get('ep.M2.end') === 'passed' && stamps.length === 1, { yes, stillOpen, filled, end: s.get('ep.M2.end'), page: E.page('M2').lines.length });
}

// --- M3 -----------------------------------------------------------------------------------------------------------------
{
  const { s, E, pays, set } = world({ m: 6, d: 10 });
  const met = E.started('M3_0');
  const yes = E.yes('M3_0', 'choice');
  for (let i = 0; i < 4; i++) set(`ep.M3_0.shot.${i}`); const four = s.has('ep.M3_0.all');
  set('ep.M3_0.shot.4'); const all = s.has('ep.M3_0.all');
  set('ep.M3_0.back');
  result('M3: the yes by his choice, five shots → all, back → thanks ($30)', !met && yes && !four && all && s.get('ep.M3_0.end') === 'thanks' && pays.some((p) => /^30@m3\.pay/.test(p)), { yes, four, all, end: s.get('ep.M3_0.end'), pays });
}
{
  const { s, E, go, set } = world({ m: 6, d: 10 });
  E.yes('M3_0', 'choice'); set('ep.M3_0.shot.1');
  go(2026, 11, 20);
  result('M3: freeze-up without all five: he goes home, the page keeps the pictures', s.get('ep.M3_0.end') === 'home' && E.page('M3_0').lines.includes(text('m3.page.first')), { end: s.get('ep.M3_0.end') });
}

// --- M4 -----------------------------------------------------------------------------------------------------------------
{
  const { s, E, go, set } = world({ m: 6, d: 10 });
  E.yes('M4_0', 'choice');
  set('ep.M4_0.met.1', 'ep.M4_0.favour.1', 'ep.M4_0.done.1', 'ep.M4_0.met.2', 'ep.M4_0.favour.2', 'ep.M4_0.done.2', 'ep.M4_0.met.3', 'ep.M4_0.favour.3', 'ep.M4_0.done.3');
  const three = s.has('ep.M4_0.three');
  go(2026, 10, 5); set('ep.M4_0.favour.4', 'ep.M4_0.last', 'ep.M4_0.done.4');
  const b = world({ m: 6, d: 10 }); b.E.yes('M4_0', 'choice'); b.go(2026, 11, 2);
  result('M4: three favours → three; the fourth, their last check → last; without it they rotate out', three && s.get('ep.M4_0.end') === 'last' && b.s.get('ep.M4_0.end') === 'rotated', { three, end: s.get('ep.M4_0.end'), b: b.s.get('ep.M4_0.end') });
}

// --- M5 -----------------------------------------------------------------------------------------------------------------
{
  const { s, E, set } = world({ m: 10, d: 25 });
  set('ep.M5_0.bet'); const yes = E.started('M5_0');
  const R = freezeRoute(0); R.lakes.forEach((_, i) => set(`ep.M5_0.lake.${i}`));
  const round = s.has('ep.M5_0.round'); set('ep.M5_0.back');
  const b = world({ m: 10, d: 25 }); b.set('ep.M5_0.bet', 'ep.M5_0.iced');
  result('M5: the bet → yes, every lake → round, back → made; iced → the ice wins', yes && round && s.get('ep.M5_0.end') === 'made' && b.s.get('ep.M5_0.end') === 'ice', { yes, round, end: s.get('ep.M5_0.end'), b: b.s.get('ep.M5_0.end') });
}

// --- M6 -----------------------------------------------------------------------------------------------------------------
{
  const { s, E, set } = world({ m: 6, d: 1 });
  set('ep.M6.p.lakes'); const yes = E.started('M6');
  set('ep.M6.done');
  const b = world({ m: 6, d: 1 }); b.set('ep.M6.p.nights', 'ep.M6.over');
  const p = longStay('lakes', { lakes: 10 }, { lakes: 61 }), q = longStay('species', { species: 0 }, { species: 3 });
  result('M6: a project chosen → yes; done → done; over → yours; the counts from the start', yes && s.get('ep.M6.end') === 'done' && b.s.get('ep.M6.end') === 'yours' && p.done && !q.done && q.got === 3, { yes, end: s.get('ep.M6.end'), b: b.s.get('ep.M6.end'), p, q });
}

// --- the reseed across a fake turn ----------------------------------------------------------------------------------------
{
  const { s, E, go } = world({ m: 7, d: 3 });
  E.take('ep:M1_0');
  go(2026, 8, 20);
  s.set('year.turned.2027', true, 'test'); // (stream w's season-turn.js writes this; the fact alone is what a cycle reads)
  go(2027, 7, 2);
  const end0 = s.get('ep.M1_0.end'), up = E.flyers(25).map((f) => f.id), took = E.take('ep:M1_1');
  const page1 = E.page('M1_1');
  result('reseed: a winter turn shuts last year\'s bear without you; this year\'s flyer is up, a new chain', end0 === 'trapped' && up.includes('ep:M1_1') && !up.includes('ep:M1_0') && took && page1 && page1.lines.includes(text(`m1.page.chain.${bearChain(1).i}`)) /* j1: x's notice words now head a taken flyer's page */ && bearChain(1).i !== bearChain(0).i, { end0, up, took, line: page1 && page1.lines[0] });
}

// --- the minigames --------------------------------------------------------------------------------------------------------
{
  const site = { x: 0, z: 0 }, run = (o) => { const h = bearsign({ site, hour0: 10, stay: 0.5 }); let H = 9, r = null; for (let i = 0; i < 400 && !r; i++) { H += 0.01; if (o.shootAt && H > 10.1 && !h.photo) h.shot(); r = h.update(1, { abs: H, x: 5, z: 5, lamp: !!o.lamp && H > 10.05, moving: false }); } return r && r.result; };
  const left = (() => { const h = bearsign({ site, hour0: 10 }); return h.update(1, { abs: 9, x: 500, z: 0 }).result; })();
  const a = run({}), b = run({ shootAt: true }), c = run({ lamp: true });
  result('bearsign: still and dark → seen; a shot while it is in → photo; a lamp on it → spooked; walked off → left', a === 'seen' && b === 'photo' && c === 'spooked' && left === 'left', { a, b, c, left });
}
{
  const h = fogvoices({ x: 0, z: 0, east: { x: 1, z: 0 } });
  let r = null, px = 0, closest = Infinity;
  for (let i = 0; i < 600 && !r; i++) { px += 3.2 * 0.5; r = h.update(0.5, { x: px, z: 0, fog: true }); closest = Math.min(closest, h.d); }
  const lost = (() => { const g = fogvoices({ x: 0, z: 0 }); return g.update(0.5, { x: 0, z: 0, fog: false }).result; })();
  result('fogvoices: chased in earshot → heard (close), never caught; the fog gone early → lost', (r && (r.result === 'close' || r.result === 'heard')) && closest > FOG.catchUp * 0.5 && lost === 'lost', { r, closest: Math.round(closest), lost });
}
{
  const h = skimice({ cells: 3, hits: 2 }); let r = null, n = 0;
  while (!r && n < 50) { n++; r = h.update(0.5, { stroke: true }); }
  const g = skimice({}); const back = g.update(0.5, { out: true }).result;
  result('skimice: strokes break through (cells × hits), paddling out → back', r && r.result === 'through' && n === 6 && back === 'back', { r, n, back });
}

const fails = results.filter((r) => !r.pass).length;
console.log(`cmp-7c-unit: ${results.length - fails}/${results.length} PASS`);
process.exit(fails ? 1 : 0);
