// Stream E's unit checks (story Round 2, docs/build/campaign-design.md §10 and Part 4 Round 2): the one runner
// (episodes.js) against K1a's real story (story.js, built with RULES_ALL), S7 and S9's records, the minigames and the
// snag's dead weight. Node, no browser.   node scripts/c2-episodes-unit.mjs
//   compile   every record's yes doors, steps and ends are rules in the story from its construction (the data hash
//             holds across two constructions; nothing added after attach: chk-coop C2)
//   doors     meeting Rose, the rumour, the kid, NB06/NB35 read elsewhere start nothing; the flyer taken, NB06 read at the
//             beach rock, the hook-up: each a yes
//   explicit  yes() refused while held, on a guest, out of the window; `started` is the yes atom
//   windows   judged at day turn: S7's notice up 25 May – 25 June, down after, back the next June; a started episode
//             whose window closes gets ep.<id>.shut
//   binding   a reseeding record's bind() saved at its start
//   ends      S7 ends with the print shown (the page's last line, $25 through pay:), S9 with the pot (give:item.junespot)
//   first     the trip card's stamp once, its "First stamped:" label gone
//   no slots  S7, S9 and five more open at once
//   no yes    every step fact set without a yes: no step fires, nothing ends
//   flyers    the flyer's paper (the notice's words, its sign; no pay), outside any count; a guest gets none
//   snag      the hook-up's chance per pass (~half), high lures go over; reeling into the sticks snaps the line, easing
//             off and reeling lands it in about a game minute; the minigame's results are events and facts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoryV2 } from '../src/story.js';
import { Episodes, compileEpisode, checkRecord, inWindow, startedOf } from '../src/episodes.js';
import { EPISODES } from '../src/story-data/episodes/index.js';
import { RULES_EPISODES } from '../src/story-data/rules-episodes.js';
import { Minigames } from '../src/minigames.js';
import { snag, snagTarget, overTarget, passes, SNAG } from '../src/minigames/snag.js';
import { lilacBloom } from '../src/season.js';
import { registerSensor } from '../src/story-cond.js';
import { A2_SENSORS } from '../src/story-data/mining.js';
for (const [k, v] of Object.entries(A2_SENSORS)) registerSensor(k, v); // (join: the arc's flags, as mining-cast.js registers them)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIDE = JSON.parse(readFileSync(path.join(ROOT, 'src/story-data/text/side.json'), 'utf8')).text;
const text = (id) => (SIDE[id] ? SIDE[id].text : null);
const warn = console.warn; console.warn = () => {};
const results = [];
const notMini = (f) => !/^ep:M\d/.test(f.id); // 7c: the mini-campaigns' flyers (M1 on 25 and 31 in July–August) are not E's
const result = (name, pass, more = {}) => { results.push({ name, pass: !!pass }); console.log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 700)); };

const io = () => { const m = new Map(); return { read: (ns, f = null) => (m.has(ns) ? JSON.parse(m.get(ns)) : f), write: (ns, v) => { m.set(ns, JSON.stringify(v)); return true; } }; };
const absOf = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);
const S7 = EPISODES.find((e) => e.id === 'S7'), S9 = EPISODES.find((e) => e.id === 'S9');
function world({ y = 2026, m = 6, d = 9, h = 11 } = {}) {
  const s = new StoryV2({ io: io() });
  s.attach({ profile: { seasonId: 'c2-e', started: true, onChange: () => {} } });
  s.clock({ abs: absOf(y, m, d), hours: h });
  const stamps = [], pays = [], gives = [];
  s.handle('pay', (arg) => { pays.push(arg); return true; });
  s.handle('give', (arg) => { gives.push(arg); return true; });
  const R = { first: (k, key, words) => { if (stamps.some((x) => x.key === key)) return false; stamps.push({ k, key, words }); return true; } };
  const E = new Episodes();
  for (const r of EPISODES) E.register(r);
  E.attach({ story: s, record: R, text });
  const go = (yy, mm, dd, hh = 11) => { s.clock({ abs: absOf(yy, mm, dd), hours: hh }); E.dayTurn(); };
  return { s, E, stamps, pays, gives, go };
}

// --- compile --------------------------------------------------------------------------------------------------------------
{
  const a = new StoryV2({ io: io() }), b = new StoryV2({ io: io() });
  const ids = RULES_EPISODES.map((r) => r.id), inStory = ids.filter((id) => a.rules.rules.has(id));
  const bad = EPISODES.flatMap(checkRecord);
  const compiled = EPISODES.flatMap(compileEpisode).length;
  result('compile: every record\'s doors, steps and ends are in the story\'s rules from its construction; the hash is the same twice', inStory.length === ids.length && a.data === b.data && !bad.length && compiled >= 6, { rules: ids.length, inStory: inStory.length, hash: a.data, same: a.data === b.data, bad });
  const S = world();
  const before = S.s.data; S.E.register({ ...S9 }); // (a second register of a known record: no rules added, the hash the same)
  result('compile: registering at runtime adds no rule (the data hash after attach is the hash at construction)', S.s.data === before && S.s.rules.rules.size === a.rules.rules.size, { before, after: S.s.data });
  result('compile: started is the yes atom (f:ep.<id>.yes) for every record', EPISODES.every((e) => (e.started || startedOf(e.id)) === `f:ep.${e.id}.yes`), {});
}

// --- attach writes nothing (chk-coop C2: a guest's own story2 untouched while it boots into a visit) -----------------------
{
  const s = new StoryV2({ io: io() });
  s.attach({ profile: { seasonId: 'c2-e', started: true, onChange: () => {} } });
  s.clock({ abs: absOf(2026, 6, 9), hours: 11 });
  const before = JSON.stringify(s.doc), starts = [];
  const E = new Episodes(); for (const r of EPISODES) E.register(r);
  E.on('start', (e) => starts.push(e));
  E.attach({ story: s, text });
  s.clock({ abs: absOf(2026, 7, 9), hours: 11 }); E.dayTurn();
  result('attach: the runner writes nothing into a story with no episode started (no eps rows, no start heard), across a day turn', JSON.stringify(s.doc) === before && !starts.length, { eps: s.doc.eps, starts });
}

// --- doors: nothing starts but a yes ------------------------------------------------------------------------------------
{
  const { s, E } = world();
  s.meet('rose', 'unit');                                 // meeting Rose
  s.emit('topic', { who: 'keeper', id: 'rumour', ep: 25 }); // a rumour heard
  s.markRead('NB06', 'unit'); s.markRead('NB35', 'unit');  // the entries read elsewhere
  s.emit('talk:open', { who: 'visitor', ep: 25 });         // the kid
  const none = !E.started('S7') && !E.started('S9') && E.open().length === 0;
  result('doors: meeting Rose, a rumour, the kid, NB06 and NB35 read elsewhere start nothing', none, { open: E.open() });
  const took = E.take('ep:S7');
  result('doors: the flyer taken is S7\'s yes (how: flyer)', took && E.started('S7') && E.state('S7').how === 'flyer', E.state('S7'));
  s.readHere('NB06', 'unit');
  result('doors: NB06 read at the beach rock (here:NB06) is S9\'s yes', E.started('S9'), E.state('S9'));
  const W = world(), M = new Minigames().attach({ story: W.s });
  M.register('snag', snag);
  const h = M.start('snag', { target: snagTarget({ id: 's9.pot', x: 0, z: 0 }), line: 12 });
  result('doors: the hook-up (mg:snag hooked → f:mg.snag.hooked) is S9\'s yes', !!h && W.s.has('mg.snag.hooked') && W.E.started('S9'), { hooked: W.s.has('mg.snag.hooked'), s9: W.E.state('S9') });
}

// --- the explicit yes: held, a guest, the window ------------------------------------------------------------------------
{
  const A = world(); const off = A.E.hold('run');
  const heldNo = !A.E.yes('S7', 'unit') && !A.E.take('ep:S7') && A.E.flyers(25).length === 0;
  off();
  const after = A.E.take('ep:S7');
  const G = world(); G.s.setMode('mirror'); G.E.dayTurn(true);
  const guestNo = !G.E.yes('S7') && G.E.flyers(25).length === 0 && G.E.pages().length === 0 && G.E.places().length === 0;
  const O = world({ m: 8, d: 1 });
  const outNo = !O.E.yes('S7', 'unit') && O.E.flyers(25).filter(notMini).length === 0; // 7c: (the minis' own flyers aside)
  result('explicit: no yes while held (the run), on a guest (mirror: no flyers, no page) or out of the window; yes once released', heldNo && after && guestNo && outNo, { heldNo, after, guestNo, outNo });
}

// --- windows at day turn --------------------------------------------------------------------------------------------------
{
  const { E, go, s } = world({ m: 5, d: 20 });
  const may20 = E.flyers(25).length;
  go(2026, 5, 26); const may26 = E.flyers(25).length;
  E.take('ep:S7');
  go(2026, 6, 26); const jun26 = E.flyers(25).length, shut = s.has('ep.S7.shut'), win = E.window('S7');
  go(2027, 6, 1); const nextJune = E.window('S7');
  const w = inWindow(S7.window, { month: 6, day: 25 }) && !inWindow(S7.window, { month: 6, day: 26 }) && inWindow(S9.window, { month: 11, day: 3 }) && !inWindow(S9.window, { month: 12, day: 3 });
  result('windows: judged at day turn: S7\'s notice down 20 May, up 26 May, down 26 June (the started episode shut, dormant), back the next June', may20 === 0 && may26 === 1 && jun26 === 0 && shut && !win && nextJune && w, { may20, may26, jun26, shut, win, nextJune, w });
}

// --- binding ----------------------------------------------------------------------------------------------------------
{
  const { s, E } = world();
  const M1 = { id: 'M1t', kind: 'mini', title: 'test', slot: false, window: { always: true }, doors: [{ kind: 'choice', yes: true }], bind: ({ story }) => ({ site: 1234, seed: story.hash('M1t:2026') % 97 }) };
  E.register(M1); E.yes('M1t', 'accept');
  const b = s.doc.eps.M1t && s.doc.eps.M1t.bind;
  result('binding: a reseeding record\'s bind() is saved at its start (eps.<id>.bind)', b && b.site === 1234 && Number.isFinite(b.seed), { bind: b });
}

// --- ends, the page, first --------------------------------------------------------------------------------------------------
{
  const { s, E, stamps, pays, gives } = world();
  E.take('ep:S7');
  s.readHere('NB35', 'unit');
  const p0 = E.page('S7');
  s.set('ep.S7.asked', true, 'unit'); s.set('ep.S7.shown', true, 'unit');
  const p1 = E.page('S7');
  const r = s.rules.rules.get('ep.S9.door3'); void r;
  s.markRead('NB06', 'unit'); s.readHere('NB06', 'unit'); s.set('mg.snag.landed', true, 'unit');
  const p9 = E.page('S9');
  const ok7 = s.get('ep.S7.end') === 'rose' && pays.includes('25@d95.S7.pay') && s.has('ep.S7.paid') && p1.end === text('S7.end') && p1.first === 'Lilacs at Mummo\'s.' && p1.title === 'Mummo\'s' && p0.lines.includes(text('S7.the-place.w1'));
  const ok9 = s.get('ep.S9.end') === 'pot' && s.has('ep.S9.pot') && gives.includes('item.junespot') && p9.first === 'Brought up June\'s pot.' && p9.title === 'Coffee Lake';
  result('ends: S7 with the print shown (its page\'s last line, $25 through pay:), S9 with the pot (give:item.junespot)', ok7 && ok9, { p0, p1, p9, pays, gives });
  const before = stamps.length; s.emit('fact', { key: 'ep.S7.end' }); // (a second hearing stamps nothing)
  result('first: the trip card\'s stamp once each, the label gone ("Lilacs at Mummo\'s.", "Brought up June\'s pot.")', stamps.length === 2 && before === 2 && stamps.every((x) => x.k === 'story' && !/First stamped/.test(x.words)), { stamps });
}

// --- no slots ---------------------------------------------------------------------------------------------------------------
{
  const { s, E } = world();
  for (let k = 0; k < 5; k++) E.register({ id: `T${k}`, kind: 'side', title: `t${k}`, slot: false, window: { always: true }, doors: [{ kind: 'choice', yes: true }] });
  E.take('ep:S7'); s.readHere('NB06', 'unit');
  for (let k = 0; k < 5; k++) E.yes(`T${k}`, 'accept');
  result('no slots: S7, S9 and five more open at once (Part 3 #4)', E.open().length === 7, { open: E.open() });
}

// --- no step without a yes ------------------------------------------------------------------------------------------------
{
  const { s, E, pays, gives } = world();
  for (const k of ['ep.S7.shown', 'ep.S7.asked', 'ep.S7.found', 'ep.S7.step', 'mg.snag.landed', 'ep.S9.pot']) s.set(k, true, 'unit');
  s.rules.rerun({ quiet: false });
  const none = !E.started('S7') && !s.has('ep.S7.end') && !s.has('ep.S7.paid') && !pays.length && !gives.length && !s.has('ep.S9.end') && !E.started('S9');
  result('no yes: every step\'s fact set without a yes: no step fires, nothing ends, nothing is paid or given', none, { pays, gives, open: E.open() });
}

// --- flyers ---------------------------------------------------------------------------------------------------------------
{
  const { E } = world();
  const f = E.flyers(25), other = E.flyers(31);
  const p = f[0] && f[0].paper;
  result('flyers: Rose\'s notice at Moose Lake 25 only, as its own paper (the notice\'s words, signed Rose G., no pay); none at Farm', f.length === 1 && other.length === 0 && p && /PHOTO WANTED: LILACS/.test(p.title) && /^Rose G\./.test(p.sign) && p.pay == null && !f[0].taken, { f, other });
  E.take('ep:S7');
  result('flyers: taken, it stays up as taken until its window closes (never a task: nothing in any count)', E.flyers(25).length === 1 && E.flyers(25)[0].taken, { f: E.flyers(25) });
}

// --- the snag -------------------------------------------------------------------------------------------------------------
{
  const T = snagTarget({ id: 's9.pot', x: 10, z: 0 });
  let hits = 0; for (let k = 0; k < 400; k++) if (passes(T, `cast${k}`)) hits++;
  const jig = { run: 'bottom' }, spinner = { run: 1.0 };
  const lureOn = { x: 10.4, z: 0.3, depth: 1.8, bed: 2.0 }, lureHigh = { x: 10.4, z: 0.3, depth: 0.6, bed: 2.0 }, lureOff = { x: 12, z: 0, depth: 1.9, bed: 2 };
  const over = overTarget(T, lureOn, jig) && !overTarget(T, lureOn, spinner) && !overTarget(T, lureHigh, jig) && !overTarget(T, lureOff, jig);
  result('snag: about half the passes catch the bail; a jig on the bottom within 1 m, never a spinner or a lure running high', hits > 160 && hits < 240 && over, { hits, of: 400, over });
  // reeling flat out: into the sticks, the red, the line parts
  const run = (policy) => { const h = snag({ target: T, line: 12, seed: 3 }); let t = 0, r = null, red = 0; const dt = 1 / 30; while (!r && t < 120) { const reeling = policy(h); r = h.update(dt, { reeling }); if (h.tension > 0.8) red += dt; t += dt; } return { r: r && r.result, t: +t.toFixed(1), red: +red.toFixed(1), line: +h.line.toFixed(2) }; };
  const greedy = run(() => true), patient = run((h) => h.phase === 'give' || h.tension < 0.5 && false);
  const ease = run((h) => h.phase === 'give');
  result('snag: reeling into the sticks takes the bar into the red and parts the line; easing off through them lands it', greedy.r === 'snapped' && ease.r === 'landed', { greedy, ease, patient });
  // a game minute at ×8 (the one speed): 7.5 real seconds of reeling, give or take the sticks
  result('snag: about a game minute (×8: 5–16 real seconds from 12 m out)', ease.t >= 5 && ease.t <= 16, { secs: ease.t, gameMin: +(ease.t * 8 / 60).toFixed(1), reel: SNAG.reel });
  // the results as events and facts
  const W = world(), M = new Minigames().attach({ story: W.s }), heard = [];
  W.s.on('mg:snag', (d) => heard.push(d.result));
  M.register('snag', snag);
  const h = M.start('snag', { target: T, line: 4, seed: 1 });
  let r = null; for (let k = 0; k < 3000 && !r; k++) r = h.update(1 / 30, { reeling: h.phase === 'give' });
  result('snag: its results are the story\'s mg:snag events and the facts the steps read (hooked, landed); S9\'s pot given', heard.join(',') === 'hooked,landed' && W.s.has('mg.snag.landed') && W.s.has('ep.S9.pot') && W.gives.includes('item.junespot') && !M.active.length, { heard, gives: W.gives });
  const G = world(); G.s.setMode('mirror'); const MG = new Minigames().attach({ story: G.s }); MG.register('snag', snag);
  result('snag: a guest starts none (no snag on the pot)', MG.start('snag', { target: T }) === null, {});
}

// --- the join (Round 2): A2's arc on the runner, its flyer (the Kettle notice), the director's places() lines ----------------
{
  const W = world({ m: 7, d: 14, h: 19 }), A = EPISODES.find((e) => e.id === 'mining');
  const MIN = JSON.parse(readFileSync(path.join(ROOT, 'src/story-data/text/mining.json'), 'utf8')).text; W.E.c.text = (id) => text(id) || (MIN[id] ? MIN[id].text : null);
  W.s.sensor('kettlenotice', () => true);
  const none = W.E.flyers(31).filter(notMini).length; // 7c: // (before "The pads": nothing)
  W.s.set('tauno.said.pads', true); W.E.dayTurn(true);
  const F = W.E.flyers(31).filter(notMini), words = F[0] && F[0].paper;
  const took = F[0] ? W.E.take(F[0].id) : false;
  const after = W.E.flyers(31).filter(notMini);
  result('join: the mining arc on the runner: the Kettle notice a flyer on Farm\'s board only after "The pads" and in the rain\'s window; taken, kettle.notice (no yes: the arc\'s yes is the bench)',
    !!A && none === 0 && F.length === 1 && /^FIELD HELP/.test(words.title || '') && took && W.s.has('kettle.notice') && !W.E.started('mining') && after.length === 1 && after[0].taken, { none, F: F.length, words, took, after });
  W.s.set('door.mining.open', true);
  const yes = W.E.started('mining');
  W.s.set('door.mining.done', true);
  result('join: the arc\'s yes is the first Farm morning sat (door.mining.open: a place door, ep.mining.yes); it ends with door.mining.done; its flyer is down then',
    yes && W.s.get('ep.mining.end') === 'done' && W.E.flyers(31).filter(notMini).length === 0, { yes, end: W.s.get('ep.mining.end') });
  // the director's places(): an open episode's place carries its line (S7's rumour), a layer place needed
  const P = world({ m: 6, d: 9 }); P.E.c.layer = { place: (id) => (id === 's7.mummos' ? { x: -17480, z: 3730 } : null) };
  P.E.take(P.E.flyers(25)[0].id);
  const pl = P.E.places();
  result('join: episodes.places() gives the director each open episode\'s place with its line (S7: 70.6.1.11)', pl.length === 1 && pl[0].ep === 'S7' && pl[0].line === '70.6.1.11' && pl[0].place === 's7.mummos', { pl });
}

// --- the lilacs' window -------------------------------------------------------------------------------------------------
{
  const yrs = [2026, 2027, 2028, 2029, 2030, 2031].map((y) => lilacBloom(y, 'seed-a'));
  const ok = yrs.every((w) => w.start >= 147 && w.start <= 157 && w.end - w.start === 19) && new Set(yrs.map((w) => w.start)).size > 1 && lilacBloom(2026, 'seed-a').start === yrs[0].start;
  result('lilacs: about 1–20 June, seeded ±5 days a year (season.js lilacBloom), the same for the same season', ok, { yrs });
}

console.warn = warn;
const fails = results.filter((r) => !r.pass).length;
console.log(`c2-episodes-unit: ${results.length - fails}/${results.length}`);
process.exit(fails ? 1 : 0);
