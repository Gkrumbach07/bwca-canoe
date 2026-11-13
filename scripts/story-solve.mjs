// story-solve.mjs: the story's solver (docs/build/campaign-design.md §14.2, Part 4 "The Round 1 join"). Node only, no
// browser, no game: it runs on the Mac. It plays the story's own data through the story's own engine (story.js
// StoryV2 with the conditions compiled by story-cond.js, the rules of story-data/all-rules.js, pencil.js and leads.js)
// and searches the player's moves for paths:
//
//   witnesses     for every slice fact (Part 4 Round 1, steps 1-7), the shortest sequence of the player's moves that
//                 makes it true, replayed and checked on a fresh story
//   articulation  the facts every path to the slice's end passes through (block every way to set one: is the end still
//                 reachable?), each with how many different moves can set it (one is a single point of failure)
//   branches      for every slice fact, the different moves that first made it true across the whole search
//   fallbacks     the porch: a store with no porch (the truck), after dark (the next daylight), May and after October
//                 (Farm's walkout), each month of the year for the turn and for "Changed your mind?"
//   re-entry      from every decline (the bundle on the shelf, keep walking, R3's "Not today.", X2 at the door, walking
//                 off mid-scene before and after T3, R4's and R5's "not yet"), the end of the slice is still reachable
//
// Slice 2 (Round 2, the join; campaign-design Part 4 Round 2 step 16), from where slice 1 ends (its plan replayed): the
// mining arc (Tauno's Farm porch, Len, Mary and the back table, the Kettle notice and Tasha's day, the crew map, the wrong
// hill, the clean book and the road end), the episodes (S7's notice, Rose and the print; S9's yes at the beach rock and
// the pot) and the director (a held climax; no beat writes a key):
//   witnesses     every slice-2 fact reachable from the end of slice 1, its moves replayed
//   locks         L1, L2, L5 and L6 with their Round 2 keys (L1 A B C, L2 A C, L5 B, L6 B C): each key reachable, and
//                 no fact on the way to every one of them (an articulation point); WARN where a lock has one key this
//                 round, or its keys share one
//   branches      both tauno.record branches (at the slab; "On the record" on the porch after), the corrected test, the
//                 ride asked again, the line snapped on the pot and cast again
//   re-entry      from "Not today.", "North of Gabbro, yes.", the lid kept, no rain (no notice, no Tasha), a climax held
//                 a trip by the director, S9's line parted: the end still reachable
//
//   node scripts/story-solve.mjs [--json out.json] [--plan] [--quiet] [--max 6000] [--r1]
//     --r1          slice 1 alone (no slice 2)
//     --plan-only   the slice's plan alone (story-slice.mjs --plan slice)
//     --plan-only2  slice 2's plan alone, from the end of slice 1 (story-slice.mjs --plan slice2)
//     --chain2 'goal;;goal;;…'   a chain of slice-2 goals from the end of slice 1
//     --chain 'goal;;goal;;…'   one chain of goals, its moves (or where it stuck and what was on offer there)
//     --plan   print the slice's witness as a numbered plan (what `story-slice.mjs --plan slice` prints)
//   exit 1 on any failure.
//
// The model. A state is the story document (facts, notebook marks, the pencil, leads) plus the solver's own: the trips
// made, the conversation open (its scene and node) and whether the onboarding happened. A move is one thing a player
// does: the onboarding's choices (P1), a night with Walt's things along, a trip passing, a page read, a page read where
// he wrote it, a Look at a story prop, standing at a place, a carry, walking into a store, walking out of one (where the
// cast's schedule puts Tauno or Josie), a choice in their scene or walking off from it, a keeper's story topic, a
// nickname pencilled on a lake, being out on a lake. The world's own atoms (daylight, month, hour, the store, the lake
// you are on) are set by the move that needs them, from a small set of presets (WORLD below): a slot that only holds in
// one of them is a fallback the report names.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoryV2 } from '../src/story.js';
import { compile, classify, registerSensor } from '../src/story-cond.js';
import { Pencil, PENCIL_SENSORS } from '../src/pencil.js';
import { Leads } from '../src/leads.js';
import { TALK_SENSORS } from '../src/topics.js';
import { PORCH, P1, JOSIE, PRE_T3, porchEntry } from '../src/story-data/porch-act1.js';
import { KEEPER_TOPICS } from '../src/story-data/topics-act1.js';
import { CAST } from '../src/story-data/cast.js';
import { INK, LAKES, PLACES } from '../src/story-data/leads-act1.js';
import { BACK_COVER, NICKS, CUT } from '../src/story-data/notebook.js';
import { sitePlace } from '../src/story-world.js';
import { waltSites } from '../src/walt-sites.js';
// join c2: slice 2's data (the mining arc's scenes, the arc's record, the director's rules)
import { FARM as FARM_SC, SLAB, LEN, MARY, TASHA, KEEPER as KEEPER_A2, farmEntry, slabEntry, lenEntry, maryEntry, tashaEntry, STATIONS, A2_SENSORS } from '../src/story-data/mining.js';
import ARC from '../src/story-data/episodes/arc-mining.js';
import { RULES_BEATS } from '../src/story-data/rules-beats.js';
// a3: the guiding years' data (Round 4): the scenes, their entries, the sensors, the leads' asks
import * as GY from '../src/story-data/guiding.js';
import { ASKS as ASKS_GY } from '../src/story-data/leads-guiding.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const QUIET = !!arg('quiet', false), PLAN = !!arg('plan', false), MAX = Number(arg('max', 6000));
const JSON_OUT = arg('json', null);
for (const [k, v] of Object.entries(PENCIL_SENSORS)) registerSensor(k, v);
for (const [k, v] of Object.entries(A2_SENSORS)) registerSensor(k, v);
for (const [k, v] of Object.entries(GY.GY_SENSORS)) registerSensor(k, v); // a3 // (join c2: the arc's flags, as mining-cast.js registers them)
// slice 2 on (the section below turns it on): its moves, its worlds, its scenes. Off, slice 1 is searched as before
let R2 = false;
let RF = false; // j1: slice 3 (Round 3's far end: the RF keys, the pit's lift) on, after slice 2
let R3 = false; // a3: the guiding years' subgraph (slice A3, below)
void TALK_SENSORS; // (topics.js registers the scenes' own condition names on import)
const warn = console.warn; console.warn = () => {}; // (refused writes warn by design)
process.on('exit', () => { console.warn = warn; });

// --- the data ------------------------------------------------------------------------------------------------------------
const HOME = 25; // Moose Lake: a porch, Lake One and C837 in a first trip's reach (any home works: the slice says so)
const FARM = 31, NOPORCH = 38, CRANE = 12;
const placesJson = JSON.parse(readFileSync(path.join(ROOT, 'src/story-places.json'), 'utf8'));
const nbText = JSON.parse(readFileSync(path.join(ROOT, 'src/story-data/text/nb.json'), 'utf8')).text || {};
const SITES = waltSites().filter((s) => !s.hold);
// the layer's places: story-places.json's (verbs, triggers) and the starred stones (story-world.js sitePlace)
const PLACES_L = [...placesJson.places.map((p) => ({ ...p, verbs: p.verbs || [], triggers: p.triggers || [] })), ...SITES.map(sitePlace)];
const SLICE_STONES = new Set(['ws.c837', 'ws.c1655', 'ws.c1088']); // (C837 for the slice; two more prove three stones: knows.stones)
const placeById = new Map(PLACES_L.map((p) => [p.id, p]));
// the nicknames the night-one cutscene shows (B's casebook counts them seen; notebook.js hands them to the pencil)
const CUT_TEXT = CUT.map((c) => (nbText[c.id] && nbText[c.id].text) || '').join('\n');
const CUT_NICKS = NICKS.filter((n) => n.kind === 'place' && CUT_TEXT.includes(n.match)).map((n) => n.nick);
// a world for the pencil: LAKES as lakes, a lake within 1.2 km of its point; the stores and landings off the water
const lakes = Object.entries(LAKES).map(([k, q], i) => ({ id: i + 1, key: k, name: q.name, cx: q.x, cz: q.z }));
const fakeWorld = { lakes, entryPoints: [33, 31, 25, 38, 12].map((ep, i) => ({ ep, x: 400000 + i * 10000, z: 400000 })) };
const lakeAt = (w, x, z) => { for (const L of w.lakes) if (Math.hypot(x - L.cx, z - L.cz) < 1200) return L.id; return 0; };
const storeOf = (ep) => ({ x: 500000 + ep * 1000, z: 500000 });
// the world presets a move can stand in (a slot that holds in only some of them is a fallback)
const WORLD = {
  homeDay: { ep: HOME, daylight: true, month: 6, hour: 12 },
  homeMorning: { ep: HOME, daylight: true, month: 6, hour: 8 },
  homeDark: { ep: HOME, daylight: false, month: 6, hour: 22 },
  farmMorning: { ep: FARM, daylight: true, month: 6, hour: 8 },
  farmDay: { ep: FARM, daylight: true, month: 6, hour: 12 },
  farmWinter: { ep: FARM, daylight: true, month: 12, hour: 12 },
  farmMayMorning: { ep: FARM, daylight: true, month: 5, hour: 8 },
  noPorchDay: { ep: NOPORCH, daylight: true, month: 6, hour: 12, noPorch: true },
  craneDay: { ep: CRANE, daylight: true, month: 6, hour: 12 },
};
const NEUTRAL = { ep: null, daylight: true, month: 6, hour: 12 };

// --- a state ---------------------------------------------------------------------------------------------------------------
const memIO = (m = new Map()) => ({ map: m, read: (ns, f = null) => (m.has(ns) ? JSON.parse(m.get(ns)) : f), write: (ns, v) => { m.set(ns, JSON.stringify(v)); return true; } });
const PROFILE = { seasonId: 'solve', started: true };

class State {
  constructor(from = null) {
    this.trips = from ? from.trips : 0;
    this.conv = from && from.conv ? { ...from.conv } : null;
    this.p1 = from ? from.p1 : false;
    this.r2 = from && from.r2 ? { slab: !!from.r2.slab, held: [...(from.r2.held || [])] } : { slab: false, held: [] }; // (join c2: at the road end with Tauno; climaxes the director holds)
    this.W = { ...NEUTRAL };
    if (from) from.s.flush();
    const io = memIO(from ? new Map(from.s.io.map) : new Map());
    this.s = new StoryV2({ io });
    this.s.dirty = () => {}; // (the solver flushes when it keeps a state: a queued microtask per story would hold every story the search made until it ends)
    this.s.ctx.tripN = () => this.trips;
    this.s.attach({ profile: PROFILE });
    this.s.clock({ abs: 20600, hours: 12 });
    this.P = new Pencil().attach({ story: this.s, world: fakeWorld, lakeAt, storeOf, player: { x: NaN, z: NaN } });
    this.Ld = new Leads().attach({ story: this.s, pencil: this.P });
    const W = () => this.W, s = this.s;
    const range = (a, v) => String(a).split(/[|,]/).some((p) => { const m = /^(\d+)-(\d+)$/.exec(p); if (!m) return Number(p) === v; const lo = +m[1], hi = +m[2]; return lo <= hi ? v >= lo && v <= hi : v >= lo || v <= hi; });
    s.sensor('daylight', () => !!W().daylight);
    s.sensor('dark', () => !W().daylight);
    s.sensor('month', (a) => range(a, W().month));
    s.sensor('hour', (a) => range(a, W().hour));
    s.sensor('home', () => W().ep === HOME);
    s.sensor('ep', (a) => W().ep != null && range(a, W().ep));
    s.sensor('at', (a) => W().at === String(a));
    s.sensor('near', (a) => W().at === String(a).split('/')[0]);
    s.sensor('onlake', (a) => W().onlake === String(a));
    // join c2: slice 2's world (the rain's notice and the Kettle day, the weekday, the pack carried) and the director's
    // climax spacing (beats.js climax:<arc>: held a trip)
    const DOWS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    s.sensor('dow', (a) => String(a).toLowerCase().split(/[|,]/).includes(W().dow || DOWS[2]));
    s.sensor('carrying', (a) => W().carrying === String(a));
    s.sensor('kettlenotice', () => !!W().rain);
    s.sensor('kettleday', () => !!W().kettleday);
    s.sensor('rained', () => !!W().rained);
    s.sensor('kettlerun', () => !!W().kettleday);
    for (const k of ['tashaHere', 'bigNew', 'belt']) s.sensor(k, () => false);
    if (R2) s.sensor('climax', (arc) => !this.r2.held.includes(String(arc)));
    // j1: begin (slice 3's world: the far end's season sensors as farend.js has them; no friend in, no run in the search)
    s.sensor('lowwater', () => !!W().lowwater);
    s.sensor('iceseason', () => !!W().ice);
    s.sensor('peers', () => 0);
    s.sensor('coop', () => false);
    s.sensor('run.active', () => false);
    // j1: end
    // a3: the guiding years' world: the date (Hap's summer), a thing carried, the night's own flags
    s.sensor('date', (a) => { const m = /^(\d\d)-(\d\d)\.\.(\d\d)-(\d\d)$/.exec(String(a)); const d = W().date || `${String(W().month).padStart(2, '0')}-15`; return m ? d >= `${m[1]}-${m[2]}` && d <= `${m[3]}-${m[4]}` : false; });
    s.sensor('has', (a) => W().has === String(a));
    s.sensor('southnight', () => !!W().south);
    for (const k of ['northwind2', 'lampLit', 'truckLooked', 'nightNow']) s.sensor(k, () => !!W()[k]);
  }
  // every atom of the state (facts, notebook marks, the pencil's rings/inks/names/seen, leads), for relevance and keys
  atoms() {
    const d = this.s.doc, out = new Map();
    for (const [k, r] of Object.entries(d.facts)) out.set(`f:${k}`, JSON.stringify(r[0]));
    for (const kind of ['read', 'here', 'und']) for (const id of Object.keys(d.nb[kind] || {})) out.set(`${kind}:${id}`, '1');
    const pc = d.pencil;
    if (pc) {
      for (const r of pc.rings) { for (const pl of r.places) out.set(`s:ringed:${pl}`, '1'); for (const l of r.lakes) out.set(`s:ringon:${l}`, '1'); if (r.c) out.set(`s:ringclosed:${r.lead}`, '1'); }
      for (const n of pc.names) out.set(`s:pencil:${n.nick}`, n.inked ? 'ink' : String(n.key));
      for (const n of pc.seen || []) out.set(`s:nickseen:${n}`, '1');
    }
    for (const [k, v] of Object.entries(d.leads || {})) out.set(`lead:${k}`, v.s);
    for (const row of INK) if (!out.has(`s:nickseen:${row.nick}`) && this.P.nickSeen(row.nick)) out.set(`s:nickseen:${row.nick}`, '1');
    out.set('s:trips', String(this.trips));
    return out;
  }
  keyFor(R) {
    const a = this.atoms(), parts = [];
    for (const [k, v] of a) if (R.has(k)) parts.push(`${k}=${v}`);
    parts.sort();
    return `${parts.join(';')}#${this.p1 ? 'p1' : ''}#${this.conv ? `${this.conv.scene}@${this.conv.at}` : ''}${R2 ? `#${this.r2.slab ? 'slab' : ''}#${this.r2.held.join(',')}` : ''}`;
  }
  get key() { return this.keyFor(ALL_ATOMS); }
  snap() { const d = this.s.doc; if (d && d.log) d.log.length = 0; this.s.flush(); const m = new Map(); m.set('story2', this.s.io.map.get('story2')); return { map: m, trips: this.trips, conv: this.conv ? { ...this.conv } : null, p1: this.p1, r2: { slab: this.r2.slab, held: [...this.r2.held] } }; }
  static from(snap) { const S = new State({ s: { flush() {}, io: { map: snap.map } }, trips: snap.trips, conv: snap.conv, p1: snap.p1, r2: snap.r2 }); return S; }
  when(c, args = {}) { return !c || c === 'true' || this.s.when(c, args); }
  settle() { this.P.check(); this.Ld.check(); this.s.clock({ abs: 20600, hours: 12 }); this.P.check(); this.Ld.check(); }
  inWorld(w, fn) { const was = this.W; this.W = { ...NEUTRAL, ...w }; try { const r = fn(); this.settle(); return r; } finally { this.W = was; } }
}

// --- scenes (the same data topics.js SceneRun plays) --------------------------------------------------------------------
const SCENES = { porch: PORCH, josie: JOSIE, p1: P1, farm: FARM_SC, slab: SLAB, len: LEN, mary: MARY, tasha: TASHA, // (join c2: + the mining arc's)
  hap: GY.HAP, marlys: GY.MARLYS, nate: GY.NATE, sheila: GY.SHEILA, statement: GY.STATEMENT, rick: GY.RICK, night: GY.NIGHT }; // a3
const argsOf = (S, ep) => ({ ep, home: ep === HOME, farm: ep === FARM, homefarm: HOME === FARM, first: true, cold: false, raining: false, snowing: false, porch: !(S.W && S.W.noPorch), manner: 'warm', keeper: 'Ruth Aho' });
function sceneAct(S, list, args) {
  for (const a of list || []) {
    if (a && typeof a === 'object') { if (S.when(a.when, args)) sceneAct(S, a.then, args); continue; }
    const m = /^do:(\w+)$/.exec(a);
    if (m) { hook(S, m[1], args); continue; }
    S.s.rules.apply({ id: `scene:${S.conv ? S.conv.scene : '?'}`, then: [a] }, args);
  }
}
function hook(S, name, args) {
  const s = S.s, set = (k) => s.rules.apply({ id: 'hook', then: [`f:${k}`] }, args);
  if (name === 'decline') set(s.has('tauno.porch.declined1') ? 'tauno.porch.declined2' : 'tauno.porch.declined1');
  else if (name === 'take') { if (S.conv && S.conv.scene === 'josie') { set('bundle.later'); set('bundle.taken'); } else set('bundle.taken'); }
  else if (name === 'shelf') set('bundle.shelf');
  else if (name === 'done' && S.conv) S.conv.done = true;
  // join c2: the mining arc's hooks (mining-cast.js, kettle.js): the ride to the road end and home, Tasha's bottles
  else if (name === 'ride') S.r2.slab = true;
  else if (name === 'home') S.r2.slab = false;
  else if (name === 'bottles') set('kettle.bottles');
  // a3: the guiding years' hooks (guiding-cast.js): the night asked (its day), the south night named, the print back
  else if (name === 'night') s.rules.apply({ id: 'hook', then: ['f:marlys.night=20600'] }, args);
  else if (name === 'arrange') { if (S.W.south || (S.conv && S.conv.world && S.conv.world.south)) s.rules.apply({ id: 'hook', then: ['f:drift.arranged=20601'] }, args); }
}
function enterNode(S, id) {
  for (let guard = 0; guard < 20 && S.conv; guard++) {
    const def = SCENES[S.conv.scene], N = def.nodes[id];
    if (!N) { S.conv = null; return; }
    S.conv.at = id;
    sceneAct(S, N.then, S.conv.args);
    if (!S.conv) return;
    if (N.end) { S.conv = null; return; }
    if (N.to && !(N.go && N.go.length)) { id = N.to; continue; }
    return;
  }
}
function choicesOf(S) {
  if (!S.conv) return [];
  const def = SCENES[S.conv.scene], N = def.nodes[S.conv.at]; if (!N) return [];
  const list = [...(N.go || []), ...(N.hub && def.nodes[N.hub] ? def.nodes[N.hub].go || [] : [])];
  const who = def.who;
  const test = (c) => S.when(c.when, S.conv.args) && !(c.once && S.s.has(`${who}.said.${c.once}`));
  return R2 && S.conv.world ? S.inWorldPeek(S.conv.world, () => list.filter(test)) : list.filter(test); // (join c2: a slice-2 talk's choices in its own world: the pack carried, the weekday)
}
function pick(S, c) {
  const def = SCENES[S.conv.scene], from = S.conv.at, args = S.conv.args;
  if (c.once) S.s.rules.apply({ id: 'scene', then: [`f:${def.who}.said.${c.once}`] }, args);
  sceneAct(S, c.then, args);
  if (!S.conv) return;
  if (c.to) enterNode(S, c.to);
  else if (c.end) S.conv = null;
  else S.conv.at = from;
}
// walking off (cast.js bye): before T3 a decline; R4/R5/R7 and his seat are over; after T3, kept ("Where was I.")
function leave(S) {
  const at = S.conv.at;
  if (S.conv.scene === 'porch' && PRE_T3.has(at)) hook(S, 'decline', S.conv.args);
  S.conv = null;
}

// --- the moves ------------------------------------------------------------------------------------------------------------
// each: { id, kind, pre(S) → bool, run(S) } (run on a copy; a move whose run changes nothing is dropped)
const READ_NB = ['NB45', 'NB01', 'NB20', 'NB31', 'NB39', 'NB88', 'NB68'];
function moves(S) {
  const out = [], s = S.s;
  if (S.conv) {
    for (const c of choicesOf(S)) out.push({ id: `say:${S.conv.scene}:${S.conv.at}:${c.ask}`, kind: 'choice', run: (T) => { const w = R2 && T.conv.world; if (!w) return pick(T, choicesOf(T).find((q) => q.ask === c.ask)); const was = T.W; T.W = { ...NEUTRAL, ...w }; try { return pick(T, choicesOf(T).find((q) => q.ask === c.ask)); } finally { T.W = was; } } });
    out.push({ id: `walk off:${S.conv.scene}:${S.conv.at}`, kind: 'leave', run: (T) => T.inWorld(T.conv.world || {}, () => leave(T)) });
    return out;
  }
  // the onboarding (20 §1.2): the counter's talk, once, on the first day
  if (!S.p1) out.push({ id: 'counter:P1', kind: 'talk', scene: 'p1', run: (T) => { T.p1 = true; T.W = { ...WORLD.homeDay }; T.conv = { scene: 'p1', at: 'offer', args: argsOf(T, HOME), world: WORLD.homeDay }; enterNode(T, 'offer'); } });
  // a night out with Walt's things along (walt.js: the first night, the bundle carried): the notebook found
  if (s.when('(f:bundle.taken | f:bundle.later) & !f:nb.found')) out.push({ id: 'night with the bundle', kind: 'night', run: (T) => { T.s.found({ abs: 20600, key: 1, lake: 'Lake One' }); for (const n of CUT_NICKS) T.P.seeNick(n); T.settle(); } });
  // a trip passes (the re-hooks wait in trips; join c2: a climax the director held goes the trip after)
  if (S.trips < (R2 ? 12 : 5)) out.push({ id: 'a trip', kind: 'trip', run: (T) => { T.trips++; T.r2.held = []; T.settle(); } });
  // w: begin (the winter turn: next year's permit at the desk, or the run frozen in; feed-season.js writes year.turned.<y>)
  if (s.has('nb.found') && !s.keys('year.turned.').length) out.push({ id: 'the winter turn', kind: 'turn', run: (T) => { T.s.set('year.turned.2027', true, 'solve'); T.settle(); } });
  // w: end
  if (s.has('nb.found')) {
    for (const nb of R2 ? [...READ_NB, ...READ_NB2] : READ_NB) if (!s.nbHas('read', nb)) out.push({ id: `read ${nb}`, kind: 'read', run: (T) => { T.s.markRead(nb, 'solve'); T.settle(); } });
    for (const pl of PLACES_L) {
      if (pl.kind === 'site' && !SLICE_STONES.has(pl.id)) continue;
      for (const tr of pl.triggers || []) if (tr.on === 'readHere' && !s.nbHas('here', tr.nb)) {
        out.push({ id: `read ${tr.nb} at ${pl.id}`, kind: 'readHere', run: (T) => T.inWorld({ at: pl.id }, () => { if (!T.when(tr.when)) return; T.s.markRead(tr.nb, 'solve'); T.s.readHere(tr.nb, `layer:${pl.id}`); T.s.rules.apply({ id: `layer:${pl.id}`, then: tr.then || [] }, { nb: tr.nb }); T.s.ingest('readHere', { nb: tr.nb, place: pl.id }); }) });
      }
    }
    for (const row of BACK_COVER.filter((r) => r.n === '64')) if (!s.has(`bc.${row.n}`)) out.push({ id: `carry ${row.carries[0].name} (${row.n})`, kind: 'carry', run: (T) => { T.s.set(`bc.${row.n}`, true, 'carry'); if (row.nb) T.s.readHere(row.nb, 'carry'); T.settle(); } });
  }
  // the layer's props and places (story-places.json, the stones)
  for (const pl of PLACES_L) {
    if (pl.kind === 'site' && !SLICE_STONES.has(pl.id)) continue;
    for (const v of pl.verbs || []) {
      if (!S.when(v.when)) continue;
      if (RF && FAR_PL.test(pl.id)) { const pr = (pl.props || []).find((q) => q.id === v.prop); if (pr && pr.show && pr.show !== 'true' && !S.when(pr.show)) continue; } // j1: the far end's props by their show
      const sets = (v.then || []).filter((a) => a.startsWith('f:')).map((a) => a.slice(2).split('=')[0]);
      if (sets.length && sets.every((k) => s.has(k))) continue;
      out.push({ id: `${v.verb} at ${v.prop}`, kind: 'look', run: (T) => T.inWorld({ at: pl.id }, () => T.s.rules.apply({ id: `layer:${pl.id}`, then: v.then }, {})) });
    }
    const enters = (pl.triggers || []).filter((t) => t.on === 'enter' || t.on === 'stand');
    if (pl.kind !== 'site' && (enters.length || pl.id === 'crews.landing')) {
      out.push({ id: `stand at ${pl.id}`, kind: 'visit', run: (T) => T.inWorld({ at: pl.id }, () => { for (const t of enters) if (T.when(t.when)) T.s.rules.apply({ id: `layer:${pl.id}`, then: t.then || [] }, {}); }) });
    }
  }
  // out on a lake (the pencil's onlake:, a nickname inked by presence)
  for (const k of ['baldeagle', 'gabbro']) out.push({ id: `out on ${LAKES[k].name}`, kind: 'lake', run: (T) => T.inWorld({ onlake: k }, () => {}) });
  // the player's pencil: a seen nickname on its own lake (B's chip, the map clicked)
  for (const row of INK) {
    if (row.auto || s.has(`ink.${row.nick}`) || !S.P.nickSeen(row.nick)) continue;
    if ((S.P.doc.names || []).some((n) => n.nick === row.nick && n.key === row.lake)) continue;
    const q = LAKES[row.lake];
    out.push({ id: `pencil ${row.label} on ${q.name}`, kind: 'pencil', run: (T) => { T.P.pencilAt(row.nick, q.x, q.z); T.settle(); } });
  }
  // into a store (store:enter: the return arms the porch); out of one (the cast's schedule: who is there)
  out.push({ id: `into the store at ${HOME}`, kind: 'store', run: (T) => T.inWorld(WORLD.homeDay, () => T.s.ingest('store:enter', { ep: HOME })) });
  const castSeen = new Set();
  for (const [wn, w] of Object.entries(WORLD)) {
    for (const who of ['tauno', 'josie']) {
      const slot = castSlot(S, who, w);
      if (!slot || !slot.scene && !(who === 'josie' && s.when('f:bundle.shelf & !f:bundle.later & f:rehook.R1b'))) continue;
      if (/^a2:/.test(slot.scene || '')) continue; // (join c2: the Farm hub is slice 2's move, moves2)
      const scene = who === 'tauno' ? porchEntry(s, slot.scene) : (slot.scene || 'still');
      const mk = `${who}:${slot.id}:${scene}`; if (castSeen.has(mk)) continue; castSeen.add(mk); // (one move per slot and scene: the first world it holds in)
      out.push({ id: `${who} (${slot.id}) at ${wn}: ${scene}`, kind: 'cast', scene: who === 'tauno' ? 'porch' : 'josie', world: wn, run: (T) => {
        T.W = { ...w };
        if (slot.fact) T.s.rules.apply({ id: `cast:${slot.id}`, then: [`f:${slot.fact}`] }, {});
        T.conv = { scene: who === 'tauno' ? 'porch' : 'josie', at: scene, args: argsOf(T, w.ep), world: w, slot: slot.id };
        enterNode(T, scene);
        T.W = { ...NEUTRAL };
      } });
    }
  }
  // a keeper's story topics (topics.js items/top), at home, at Farm, at Crane Lake
  for (const ep of [HOME, FARM, CRANE]) {
    const w = ep === HOME ? WORLD.homeDay : ep === FARM ? WORLD.farmDay : WORLD.craneDay, args = argsOf(S, ep);
    for (const t of KEEPER_TOPICS) {
      if (t.once && s.has(`asked.walt.${t.id}`)) continue;
      const ok = S.inWorldPeek(w, () => S.when(t.when, args)); if (!ok) continue;
      out.push({ id: `ask the keeper at ${ep}: ${t.id}`, kind: 'topic', run: (T) => T.inWorld(w, () => topic(T, t, args)) });
    }
  }
  if (R2) moves2(S, out);
  if (RF) movesFar(S, out); // j1
  if (R3) moves3(S, out); // a3
  return out;
}

// --- slice 2's moves (join c2) ------------------------------------------------------------------------------------------------
// the worlds slice 2 stands in: Farm of a Tuesday morning with the pack along, Mary's window hour, the rain's evening
// at Farm's board (the notice up), the Kettle day at the pad, Moose Lake 25 in June (Rose's notice)
const W2 = {
  farmMorning: { ep: FARM, daylight: true, month: 7, hour: 8, dow: 'tue', carrying: 'waltpack' },
  farmWindow: { ep: FARM, daylight: true, month: 7, hour: 10, dow: 'tue' },
  farmRain: { ep: FARM, daylight: true, month: 7, hour: 19, dow: 'mon', rain: true, rained: true },
  kettleDay: { ep: null, daylight: true, month: 7, hour: 9, dow: 'wed', kettleday: true, rained: true },
  moose: { ep: HOME, daylight: true, month: 6, hour: 11, dow: 'tue' },
};
const READ_NB2 = ['NB70', 'NB06', 'NB35'];
// where the Farm cast stands in a world (mining-cast.js reads CAST's a2 slots the same way: the first that holds)
function slot2(S, who, w) { const c = CAST[who]; if (!c) return null; return S.inWorldPeek(w, () => (c.where || []).find((sl) => S.when(sl.when, { ep: w.ep, home: w.ep === HOME })) || null); }
function talk2(T, scene, at, w) { T.W = { ...w }; T.conv = { scene, at, args: argsOf(T, w.ep), world: w }; enterNode(T, at); T.W = { ...NEUTRAL }; }
function moves2(S, out) {
  const s = S.s;
  // Tauno on Farm's porch (CAST farmhub: a2:farm), where mining.js farmEntry starts him (porchVisit: a trip since the map)
  const fh = slot2(S, 'tauno', W2.farmMorning);
  if (fh && fh.scene === 'a2:farm') {
    const at = farmEntry(s, { asked: false, porchVisit: (s.since('trips', 'door.mining.yield') || 0) >= 1 });
    out.push({ id: `tauno (farmhub) at Farm's porch: ${at}`, kind: 'cast', scene: 'farm', run: (T) => talk2(T, 'farm', farmEntry(T.s, { asked: false, porchVisit: (T.s.since('trips', 'door.mining.yield') || 0) >= 1 }), W2.farmMorning) });
  }
  // the road end with Tauno (the ride: SLAB, slabEntry)
  if (S.r2.slab) out.push({ id: `tauno at the road end: ${slabEntry(s, {})}`, kind: 'cast', scene: 'slab', run: (T) => talk2(T, 'slab', slabEntry(T.s, {}), { ep: 33, daylight: true, month: 7, hour: 10, dow: 'wed' }) });
  // Len at the dock's end, Mary at the window (and the lid given: the dot's Give, show.js → her back table)
  const ld = slot2(S, 'len', W2.farmMorning);
  if (ld) out.push({ id: `len (${ld.id}) at Farm: ${lenEntry(s)}`, kind: 'cast', scene: 'len', run: (T) => talk2(T, 'len', lenEntry(T.s), W2.farmMorning) });
  const mw = slot2(S, 'mary', W2.farmWindow);
  if (mw) {
    out.push({ id: `mary (${mw.id}) at Farm: ${maryEntry(s, {})}`, kind: 'cast', scene: 'mary', run: (T) => talk2(T, 'mary', maryEntry(T.s, {}), W2.farmWindow) });
    if (s.has('kettle.lid') && !s.has('mary.lid.given')) out.push({ id: 'give Mary the lid (the dot\'s Give)', kind: 'cast', scene: 'mary', run: (T) => talk2(T, 'mary', maryEntry(T.s, { give: true }), W2.farmWindow) });
  }
  // the Kettle notice on Farm's board in the rain's window (the arc's flyer, E's runner): taken, kettle.notice
  if (!s.has('ep.mining.flyer') && S.inWorldPeek(W2.farmRain, () => S.when(ARC.flyer.when))) out.push({ id: 'take the Kettle notice on Farm\'s board', kind: 'flyer', run: (T) => T.inWorld(W2.farmRain, () => T.s.rules.apply({ id: 'ep:mining:flyer', then: ['f:ep.mining.flyer', ...(ARC.flyer.then || [])] }, {})) });
  // Tasha at the tailgate on the Kettle day (CAST tasha.kettle: the notice taken), tashaEntry at the pad
  const tk = slot2(S, 'tasha', W2.kettleDay);
  if (tk && tk.id === 'kettle') {
    const filled = STATIONS.every((q) => s.has(`kettle.fill.${q.id}`)) && s.has('kettle.secchi'), at = tashaEntry(s, { at: 'kettle', filled });
    if (at) out.push({ id: `tasha at the Kettle pad: ${at}`, kind: 'cast', scene: 'tasha', run: (T) => talk2(T, 'tasha', tashaEntry(T.s, { at: 'kettle', filled: STATIONS.every((q) => T.s.has(`kettle.fill.${q.id}`)) && T.s.has('kettle.secchi') }), W2.kettleDay) });
  }
  // the Farm keeper's rings (mining.js KEEPER): "the old crews' country", "the old grade", "the west pads"
  const kargs = argsOf(S, FARM);
  for (const t of KEEPER_A2) {
    if (t.once && s.has(`asked.walt.${t.id}`)) continue;
    if (!S.inWorldPeek(W2.farmMorning, () => S.when(t.when, kargs))) continue;
    out.push({ id: `ask the keeper at ${FARM}: ${t.id}`, kind: 'topic', run: (T) => T.inWorld(W2.farmMorning, () => { if (t.once) T.s.rules.apply({ id: `topic:${t.id}`, then: [`f:asked.walt.${t.id}`] }, kargs); T.P.ring({ place: t.ring.place, x: t.ring.x, z: t.ring.z, r: t.ring.r, label: t.ring.label, by: 'the keeper', lead: null }); }) });
  }
  // Len's favour: the two place-matched pictures (the crib, a casing) handed in (task-kinds-mining.js: len.photos)
  if (s.has('len.favour') && !s.has('len.photos') && s.has('landing.crib') && s.has('westpads.casing')) out.push({ id: 'hand Len the crib and a casing (two pictures)', kind: 'favour', run: (T) => T.s.rules.apply({ id: 'task:len', then: ['f:photo.crib', 'f:photo.casing', 'f:len.photos'] }, {}) });
  // S7: Rose's notice on Gus's board (the flyer: the yes), her "Where are the lilacs?", the print shown (show.js)
  if (!s.has('ep.S7.yes')) out.push({ id: 'take Rose\'s notice at Moose Lake 25 (S7)', kind: 'flyer', run: (T) => T.inWorld(W2.moose, () => T.s.rules.apply({ id: 'ep:S7:flyer', then: ['f:ep.S7.flyer', 'f:ep.S7.yes'] }, {})) });
  if (s.has('ep.S7.yes') && !s.has('ep.S7.asked')) out.push({ id: 'Rose: "Where are the lilacs?"', kind: 'episode', run: (T) => T.inWorld(W2.moose, () => T.s.rules.apply({ id: 'rose', then: ['f:ep.S7.rose', 'f:ep.S7.asked'] }, {})) });
  if (s.has('ep.S7.yes') && s.has('ep.S7.found') && !s.has('ep.S7.shown')) out.push({ id: 'show Rose the print of the lilacs at the old camp', kind: 'episode', run: (T) => T.inWorld(W2.moose, () => T.s.rules.apply({ id: 'show:S7:rose', then: ['f:ep.S7.shown'] }, {})) });
  // S9: the bail hooked off the beach rock (a bottom jig: the yes), eased in or the line parted
  if (s.has('nb.found') && !s.has('mg.snag.landed') && !s.has('mg.snag.hooked')) out.push({ id: 'a bottom jig over the sand off the beach rock: the bail hooked', kind: 'episode', run: (T) => T.inWorld({ at: 's9.beach' }, () => T.s.rules.apply({ id: 'mg:snag', then: ['f:mg.snag.hooked'] }, {})) });
  if (s.has('mg.snag.hooked') && !s.has('mg.snag.landed')) {
    out.push({ id: 'ease off through the sticks: the pot landed', kind: 'episode', run: (T) => T.s.rules.apply({ id: 'mg:snag', then: ['f:mg.snag.landed'] }, {}) });
    if (!s.has('mg.snag.snapped')) out.push({ id: 'reel into the sticks: the line parts', kind: 'episode', run: (T) => { T.s.rules.apply({ id: 'mg:snag', then: ['f:mg.snag.snapped'] }, {}); } });
  }
}
State.prototype.inWorldPeek = function (w, fn) { const was = this.W; this.W = { ...NEUTRAL, ...w }; try { return fn(); } finally { this.W = was; } };

// --- a3: the guiding years (Round 4, stream A3; docs/story/31-guiding-years.md) ------------------------------------------------
// The worlds the arc stands in at Moose Lake 25: Hap's summer Saturday (and Nate on the rail), Rick at dawn, Sheila's
// Thursday afternoon (a south night ahead or none), Marlys's Tuesday, and the evening in bunk 3
const W3 = {
  hap: { ep: HOME, daylight: true, month: 7, date: '07-11', hour: 11, dow: 'sat' },
  rick: { ep: HOME, daylight: false, month: 7, date: '07-12', hour: 6, dow: 'sun' },
  nate: { ep: HOME, daylight: true, month: 7, date: '07-14', hour: 10, dow: 'tue' },
  sheila: { ep: HOME, daylight: true, month: 8, date: '08-20', hour: 14, dow: 'thu', south: true },
  sheilaNone: { ep: HOME, daylight: true, month: 7, date: '07-16', hour: 14, dow: 'thu', south: false },
  marlys: { ep: HOME, daylight: true, month: 8, date: '08-18', hour: 10, dow: 'tue' },
  night: { ep: HOME, daylight: false, month: 8, date: '08-18', hour: 22, dow: 'tue' },
};
const WHO3 = { hap: W3.hap, rick: W3.rick, nate: W3.nate, sheila: W3.sheila, marlys: W3.marlys };
// the world's own moves: places stood at (story-places.json triggers and guiding-cast.js's watchers), the loft, stream m's
// drift test, the print matched at the lunch rock
const GY_WORLD = [
  { id: 'stand at the tow landing (P194, the Sucker end)', sets: ['f:gy.tow'], when: 'f:nb.found' },
  { id: 'walk P194 to Inlet Bay', sets: ['f:gy.prairie'], when: 'f:gy.tow' },
  { id: 'walk the Moose Lake dock to its end', sets: ['f:gy.dock'], when: 'true' },
  { id: 'Mummo\'s from the water (Inlet Bay)', sets: ['f:gy.mummos'], when: 'true' },
  { id: 'jig the reef past the second island: a walleye', sets: ['f:gy.reef=walleye'], when: 'true' },
  { id: 'the print held against the view at the lunch rock', sets: ['f:gy.lunch', 'f:gy.lunch.photo'], when: 'f:hap.day & !f:hap.photo' },
  { id: 'up the boathouse ladder: the 2020 box (the register)', sets: ['f:gy.register'], when: 'f:marlys.loft' },
  { id: 'the rafter by the loft window', sets: ['f:gy.rafter'], when: 'f:marlys.loft' },
  { id: 'the squad night: the spare swamped mid-Birch goes north (stream m)', sets: ['f:drift.done'], when: 'f:drift.arranged' },
  { id: 'the alders: the white stone (stream m)', sets: ['f:drift.alders'], when: 'f:drift.arranged' },
];
const GY_WORLD_SETTERS = GY_WORLD.map((g) => [g.sets.map((x) => x.split('=')[0]), g.when]);
function talk3(T, scene, at, w) { T.W = { ...w }; T.conv = { scene, at, args: argsOf(T, w.ep), world: w }; enterNode(T, at); T.W = { ...NEUTRAL }; }
const later3 = (s) => (k) => (s.since('trips', k) || 0) >= 1;
function moves3(S, out) {
  const s = S.s;
  for (const [who, w] of Object.entries(WHO3)) {
    const sl = slot2(S, who, w); if (!sl) continue;
    if (who === 'hap') out.push({ id: `hap on the porch: ${GY.hapEntry(s, { later: later3(s) })}`, kind: 'cast', scene: 'hap', run: (T) => talk3(T, 'hap', GY.hapEntry(T.s, { later: later3(T.s) }), w) });
    if (who === 'marlys') out.push({ id: `marlys at the counter: ${GY.marlysEntry(s, {})}`, kind: 'cast', scene: 'marlys', run: (T) => talk3(T, 'marlys', GY.marlysEntry(T.s, {}), w) });
    if (who === 'rick') out.push({ id: `rick in the store: ${GY.rickEntry(s)}`, kind: 'cast', scene: 'rick', run: (T) => talk3(T, 'rick', GY.rickEntry(T.s), w) });
    if (who === 'nate') out.push({ id: `nate at the tow dock: ${GY.nateEntry(s)}`, kind: 'cast', scene: 'nate', run: (T) => talk3(T, 'nate', GY.nateEntry(T.s), w) });
    if (who === 'sheila') {
      out.push({ id: `sheila at the landing (a south night ahead): ${GY.sheilaEntry(s, {})}`, kind: 'cast', scene: 'sheila', run: (T) => talk3(T, 'sheila', GY.sheilaEntry(T.s, {}), w) });
      if (s.get('choice.sheila') === 'in' && !s.has('sheila.statement')) out.push({ id: 'sheila at the landing with Marlys: the statement', kind: 'cast', scene: 'statement', run: (T) => talk3(T, 'statement', 'told', w) });
    }
  }
  // the night in bunk 3, hour by hour (guiding-cast.js: the Rest dial stops at each of her hours)
  if (s.has('marlys.night') && !s.has('door.guiding.climax')) {
    const next = GY.NIGHT_HOURS.find((h) => !s.has(`gy.night.${h.node.slice(1)}`));
    if (next) out.push({ id: `bunk 3, ${next.node.slice(1, 3)}:${next.node.slice(3)}: Marlys`, kind: 'cast', scene: 'night', run: (T) => talk3(T, 'night', next.node, W3.night) });
  }
  // Gus's rings (leads-guiding.js ASKS)
  for (const a of ASKS_GY) {
    if (a.once && s.has(`lead.asked.${a.id}`)) continue;
    if (!S.inWorldPeek(W3.marlys, () => S.when(a.if, { ep: HOME }))) continue;
    out.push({ id: `ask Gus: ${a.id}`, kind: 'topic', run: (T) => T.inWorld(W3.marlys, () => { T.Ld.ask(a.id, { by: 'Gus', ep: HOME }); }) });
  }
  for (const g of GY_WORLD) if (!g.sets.every((k) => s.when(k)) && S.when(g.when)) out.push({ id: g.id, kind: 'world', run: (T) => T.s.rules.apply({ id: 'a3:world', then: g.sets }, {}) });
}
// the arc's main line (Part 4 Round 4: "Gives L2 A (Hap) and the 'went north' hinge"), its branches and re-entries
const MAIN3 = [
  { id: 'Hap on the porch: the first sit (the arc\'s door open)', when: 'f:hap.met & f:door.guiding.open' },
  { id: 'Hap\'s day (August 1986) told; the print on loan', when: 'f:hap.day' },
  { id: 'the tow landing\'s real side (stood at, or Rick)', when: 'f:gy.tow | f:gy.tow.told' },
  { id: 'the tow set right (any of the three answers)', when: 'f:hap.tow.right' },
  { id: 'the real talk: the lake (L2A, the yield)', when: 'f:hap.farend & f:key.L2A & f:door.guiding.yield' },
  { id: 'Sheila\'s page two', when: 'f:sheila.report' },
  { id: 'the drift test arranged', when: 'f:drift.arranged' },
  { id: 'the hinge: went north', when: 'f:drift.done & f:knows.north' },
  { id: 'Marlys met', when: 'f:marlys.met' },
  { id: 'N39 read ("asking M. for a bunk he doesn\'t need")', when: 'read:NB39' },
  { id: 'the loft asked', when: 'f:marlys.loft' },
  { id: 'the 2019 register found', when: 'f:gy.register & f:knows.message' },
  { id: 'the night asked', when: 'f:marlys.night' },
  { id: 'the night played: the climax and the choice', when: 'f:door.guiding.climax & f:door.guiding.done' },
];
const END3 = 'f:door.guiding.done & f:hap.farend & f:knows.north & f:gy.register & f:sheila.report & f:ep.guiding.end';
const BRANCH3 = [
  { id: 'the tow told bluntly ("It was never on the left, Hap."), the next weekend', via: ['f:hap.day', 'f:gy.tow.told', 'f:hap.tow.blunt'], when: 'f:hap.farend' },
  { id: 'the tow left to him ("Still on the left."), Nate on the rail the next weekend', via: ['f:hap.day', 'f:gy.tow.told', 'f:hap.tow.kind'], when: 'f:hap.farend' },
  { id: 'Sheila brought in, then the statement ("Wade?")', via: ['read:NB39', 'f:marlys.loft', 'f:gy.register', 'f:marlys.night', 'f:choice.sheila=in'], when: 'f:sheila.statement & f:knows.wade.office' },
  { id: 'Let it lie', via: ['read:NB39', 'f:marlys.loft', 'f:gy.register', 'f:marlys.night'], when: 'f:choice.sheila=lie & f:door.guiding.done' },
  { id: 'the night before the drift: GY-14 tells her after', via: ['read:NB39', 'f:marlys.loft', 'f:gy.register', 'f:marlys.night', 'f:door.guiding.done & !f:drift.done', 'f:sheila.report', 'f:drift.arranged', 'f:drift.done'], when: 'f:marlys.north' },
  { id: 'the drift first: the close at six ("Then the box was the right thing.")', via: ['f:hap.farend', 'f:sheila.report', 'f:drift.arranged', 'f:drift.done', 'read:NB39', 'f:marlys.loft', 'f:gy.register', 'f:marlys.night'], when: 'f:marlys.north & f:door.guiding.done' },
];
function on3() { R3 = true; relCache.clear(); }
async function slice3(main, rp) {
  const out = report.sliceA3 = { witnesses: [], plan: null, branches: [], warn: [] };
  if (!main.ok || !rp || !rp.ok) { res('slice A3: slice 1\'s end to start from', false); return; }
  on2(); on3(); // (slice 2's world handling too: a talk's choices read in its own world; --only-a3 skips slice 2)
  const S1 = rp.S;
  const M3 = { max: Math.max(MAX, 30000) }; // (the arc's talks are wide: Marlys's hub alone has ten topics)
  const m3 = chain([...MAIN3.map((g) => g.when), END3], S1, M3);
  out.plan = m3.path;
  if (!m3.ok) { // (where it stuck: what is on offer there, and each talk's choices)
    const S = m3.S, ms = moves(S); out.stuck = { at: m3.fail, moves: ms.map((m) => m.id) };
    console.log(`slice A3 stuck at '${m3.fail}': on offer ${ms.length}: ${ms.map((m) => m.id).join(' | ').slice(0, 1500)}`);
    for (const m of ms.filter((q) => q.kind === 'cast')) { const T = new State(S); try { m.run(T); } catch (e) { console.log('  ', m.id, 'threw', e.message); continue; } console.log('  ', m.id, '→', T.conv ? `${T.conv.scene}@${T.conv.at}: ${choicesOf(T).map((c) => c.ask).join(', ')}` : 'no talk'); }
    console.log('   read:NB39', S.s.nbHas('read', 'NB39'), 'marlys.met', S.s.has('marlys.met'));
  }
  res(`slice A3 (the guiding years) end to end from the end of slice 1: ${m3.ok ? `${m3.path.length} moves` : `stuck at '${m3.fail}' (${m3.states} states${m3.capped ? ', capped' : ''})`}`, m3.ok, { at: m3.fail || null });
  const rp3 = m3.ok ? replay(m3.path, S1) : null;
  res('slice A3: the plan replays from the end of slice 1', !!(rp3 && rp3.ok && rp3.S.when(END3)), { at: rp3 && rp3.at });
  for (const g of MAIN3) {
    const n = m3.ok ? firstTrue(m3.path, g.when, S1) : -1;
    out.witnesses.push({ id: g.id, when: g.when, moves: n, last: n > 0 ? m3.path[n - 1] : null });
    res(`slice A3 witness: ${g.id}${n > 0 ? ` (${n} moves; made by "${m3.path[n - 1]}")` : ''}`, n >= 0, { when: g.when });
  }
  for (const b of BRANCH3) {
    const c = chain([...b.via, b.when], S1, M3), ok = c.ok && replay(c.path, S1).ok;
    out.branches.push({ id: b.id, ok, moves: c.ok ? c.path.length : null, at: c.fail || null });
    res(`slice A3 branch: ${b.id}${c.ok ? ` (${c.path.length} moves)` : ` (stuck at '${c.fail}')`}`, ok);
  }
  // L2 with key A: a second key besides (WARN: L2's other keys are other arcs'), and no single person: Hap or Mary
  const L2 = rp3 && rp3.ok ? rp3.S.s.lock(2) : null;
  say(`slice A3: lock 2 after the arc: ${L2 ? L2.keys.join(', ') : '—'}`);
  if (PLAN && m3.ok) { console.log('\nSlice A3, as the solver plays it (from the end of slice 1):'); m3.path.forEach((m, i) => console.log(`${String(i + 1).padStart(3)}. ${m}`)); }
}
// where the cast's schedule puts a person in that world (cast.js: the first slot whose when holds); the walkout's
// porch foot needs a porch or the truck (CAST noPorch)
function castSlot(S, who, w) {
  const c = CAST[who]; if (!c) return null;
  return S.inWorldPeek(w, () => {
    for (const sl of c.where) {
      if (sl.at === 'counter:home' && w.ep !== HOME) continue;
      if (sl.at === 'porch:home' && w.ep !== HOME) continue;
      const m = /^porch:(\d+)$/.exec(sl.at); if (m && Number(m[1]) !== w.ep) continue;
      if (sl.at === 'walkout' && w.noPorch && c.noPorch !== 'truck') continue;
      if (/^a2:/.test(sl.scene || '') && !R2) continue; // a2: Round 2's Farm hub (story-data/mining.js FARM: the same seat topics) is the slice-2 subgraph's (moves2, the join)
      if (S.when(sl.when, { ep: w.ep, home: w.ep === HOME })) return sl;
    }
    return null;
  });
}
function topic(S, t, args) {
  const s = S.s;
  if (t.once) s.rules.apply({ id: `topic:${t.id}`, then: [`f:asked.walt.${t.id}`] }, args);
  s.rules.apply({ id: `topic:${t.id}`, then: (t.then || []).map((a) => String(a).replace('{ep}', args.ep)) }, args);
  if (t.ring && S.when(t.ringWhen, args)) {
    const r = t.ring, L = r.lake ? Object.values(LAKES).find((q) => q.name === r.lake) : null;
    const at = Number.isFinite(r.x) ? { x: r.x, z: r.z, r: r.r } : L ? { x: L.x, z: L.z, r: 900 } : { ...(fakeWorld.entryPoints.find((e) => e.ep === r.ep) || { x: 450000, z: 450000 }), r: 260 };
    S.P.ring({ place: r.place || null, x: at.x, z: at.z, r: at.r, label: t.label || '', by: 'Ruth', lead: t.lead || null });
    if (t.ringFact) s.rules.apply({ id: 'topic:ring', then: [`f:${t.ringFact}=Ruth`] }, args);
  }
}

// --- j1: begin: slice 3's moves (the far end, Round 3) ------------------------------------------------------------------------
// the pages the far end reads (NB54 the long way, NB55 the burnt point, NB61/62 the dry bag and the canoe, NB66 the paddle
// stone), the 205/50 pair carried (the back cover's second-ink row), and the landing stood at in fall low water (the only
// world the solver needs a season for: L4C). The places' own verbs and triggers are the generic ones above.
const FAR_PL = /^(gull\.|pond4747\.|waltcamp$|cellar$|stash\.)/;
const READ_NBF = ['NB54', 'NB55', 'NB61', 'NB62', 'NB66'];
function movesFar(S, out) {
  const s = S.s;
  if (!s.has('nb.found')) return;
  for (const nb of READ_NBF) if (!s.nbHas('read', nb)) out.push({ id: `read ${nb}`, kind: 'read', run: (T) => { T.s.markRead(nb, 'solve'); T.settle(); } });
  for (const row of BACK_COVER.filter((r) => r.pair)) { const f = row.fact || `bc.${row.n}`; if (!s.has(f)) out.push({ id: `carry the ${row.n} pair (${row.pairWords})`, kind: 'carry', run: (T) => { T.s.set(f, true, 'carry'); T.settle(); } }); }
  const gs = placeById.get('gull.sign');
  if (gs && !s.has('gull.stump.lowwater')) out.push({ id: 'stand at gull.sign at fall low water', kind: 'visit', run: (T) => T.inWorld({ at: 'gull.sign', lowwater: true, month: 10 }, () => { for (const t of gs.triggers || []) if (t.on === 'enter' && T.when(t.when)) T.s.rules.apply({ id: 'layer:gull.sign', then: t.then || [] }, {}); }) });
}
// j1: end

// --- relevance (a search keeps only the moves that touch what its goal depends on) -----------------------------------------
// Atoms: f:<fact> (f:<prefix>* a family), read:/here:/und:<NB>, lead:<id>, s:ringed:<place>, s:ringon:<lake>,
// s:nickseen:<nick>, s:pencil:<nick>, s:trips. A setter is { reads, sets } read off the data: the rules, every scene node
// and choice (with what it takes to reach it), the keepers' topics, the inks, the leads, the layer's verbs and triggers,
// and the player's own moves. R(goal) is the closure: the goal's atoms, then the reads of every setter that sets one.
const ALL_ATOMS = { has: () => true };
// the heuristic (greedy best-first): the additive cost of a goal from the state's own atoms, through the setters, the
// negations read as free (a guide, not a proof: every witness is replayed on the real story)
function parseCond(src) {
  const toks = String(src || 'true').match(/[\w.]+\([^)]*\)[^\s()&|!]*|\(|\)|&|\||!|[^()&|!\s][^()&|!]*[^()&|!\s]|[^()&|!\s]/g) || [];
  let i = 0;
  const expr = () => { const t = [term()]; while (toks[i] === '|') { i++; t.push(term()); } return t.length === 1 ? t[0] : { or: t }; };
  const term = () => { const f = [factor()]; while (toks[i] === '&') { i++; f.push(factor()); } return f.length === 1 ? f[0] : { and: f }; };
  const factor = () => { if (toks[i] === '!') { i++; factor(); return { free: true }; } if (toks[i] === '(') { i++; const e = expr(); if (toks[i] === ')') i++; return e; } return { atom: (toks[i++] || 'true').trim() }; };
  return expr();
}
function atomKeyOf(raw) {
  if (raw === 'true' || raw === 'false') return raw;
  if (raw.startsWith('$')) return raw.slice(1);
  let c; try { c = classify(raw); } catch { return null; }
  if (!c) return null;
  if (c.k === 'fact') return `f:${c.fact}`;
  if (c.k === 'since') return c.unit === 'trips' ? `f:${c.fact}+trip${c.v}` : `f:${c.fact}`;
  if (c.k === 'any' || c.k === 'count') return `f:${c.prefix}*`;
  if (c.k === 'nb') return `${c.kind}:${c.id}`;
  if (c.k === 'lead') return `lead:${c.id}`;
  if (c.k === 'stage') return c.v >= 3 ? 'f:tauno.turn' : c.v >= 2 ? 'f:tauno.porch.done' : c.v >= 1 ? 'f:nb.found' : 'true';
  if (c.k === 'sensor' && ['ringed', 'ringon', 'nickseen'].includes(c.name)) return `s:${c.name}:${c.arg}`;
  return null; // (the world's atoms: daylight, month, the store … the move sets them)
}
function costOf(ast, C) {
  if (ast.free) return 0;
  if (ast.or) return Math.min(...ast.or.map((a) => costOf(a, C)));
  if (ast.and) { let n = 0; for (const a of ast.and) { n += costOf(a, C); if (n === Infinity) return n; } return n; }
  const k = atomKeyOf(ast.atom);
  if (k == null || k === 'true') return 0;
  if (k === 'false') return Infinity;
  const tm = /^(.+)\+trip(\d+)$/.exec(k);
  if (tm) { const f = tm[1], c0 = atomCost(f, C); if (c0 === 0 && CUR) { const d = CUR.s.since('trips', f.slice(2)); return Math.max(0, Number(tm[2]) - (d || 0)); } return c0 + Number(tm[2]); }
  return atomCost(k, C);
}
function atomCost(k, C) {
  if (!k.endsWith('*')) return C.has(k) ? C.get(k) : Infinity;
  const p = k.slice(0, -1); let best = Infinity;
  for (const [a, v] of C) if (a.startsWith(p) && v < best) best = v;
  return best;
}
let CUR = null;
function heuristic(S, goalAst) {
  CUR = S;
  const C = new Map();
  for (const k of S.atoms().keys()) C.set(k, 0);
  for (let pass = 0; pass < 24; pass++) {
    let changed = false;
    for (const st of SETTERS) {
      const c = costOf(st.ast, C); if (c === Infinity) continue;
      const v = c + 1 + st.extra;
      for (const a of st.sets) if (!(C.get(a) <= v)) { C.set(a, v); changed = true; }
    }
    if (!changed) break;
  }
  return costOf(goalAst, C);
}
const condAtoms = (src) => {
  const out = [];
  if (!src || typeof src !== 'string') return out;
  for (const a of compile(src).atoms || []) {
    if (a.k === 'fact') out.push(`f:${a.fact}`);
    else if (a.k === 'since') { out.push(`f:${a.fact}`); if (a.unit === 'trips') out.push('s:trips'); }
    else if (a.k === 'any' || a.k === 'count') out.push(`f:${a.prefix}*`);
    else if (a.k === 'nb') out.push(`${a.kind}:${a.id}`);
    else if (a.k === 'lead') out.push(`lead:${a.id}`);
    else if (a.k === 'stage' || a.k === 'stagein') out.push('f:tauno.turn', 'f:tauno.porch.done', 'f:door.*', 'f:nb.found', 'f:ev.*', 'f:end');
    else if (a.k === 'derived') out.push(a.name === 'tier' ? 'f:tier.*' : a.name === 'porch' ? 'f:tauno.porch.*' : a.name === 'door' ? `f:door.${a.arg}.*` : 'f:*');
    else if (a.k === 'sensor' && ['ringed', 'ringon', 'nickseen'].includes(a.name)) out.push(`s:${a.name}:${a.arg}`);
    else if (a.k === 'sensor' && a.name === 'trips') out.push('s:trips');
  }
  return out;
};
const actAtoms = (list, who = null) => {
  const out = [];
  for (const a of list || []) {
    if (a && typeof a === 'object') { out.push(...actAtoms(a.then, who)); continue; }
    const m = /^([a-z]+):(.+)$/.exec(String(a)); if (!m) continue;
    if (m[1] === 'f') out.push(`f:${m[2].split('=')[0]}`);
    else if (m[1] === 'und') out.push(`und:${m[2]}`);
    else if (m[1] === 'lead') out.push(`lead:${m[2].split('=')[0]}`);
    else if (m[1] === 'do') out.push(...(m[2] === 'decline' ? ['f:tauno.porch.declined1', 'f:tauno.porch.declined2'] : m[2] === 'take' ? ['f:bundle.taken', 'f:bundle.later'] : m[2] === 'shelf' ? ['f:bundle.shelf'] : m[2] === 'bottles' ? ['f:kettle.bottles'] : m[2] === 'night' ? ['f:marlys.night'] : m[2] === 'arrange' ? ['f:drift.arranged'] : []));
  }
  return out;
};
const ringAtoms = (place) => { const P = PLACES[place]; const out = [`s:ringed:${place}`]; if (P && P.lake) out.push(`s:ringon:${P.lake}`); if (P && Number.isFinite(P.x)) for (const [k, q] of Object.entries(LAKES)) if (Math.hypot(q.x - P.x, q.z - P.z) < 1200) out.push(`s:ringon:${k}`); return out; };
const SETTERS = [];
const setter = (reads, sets, tag, cond = null, extra = 0) => SETTERS.push({ reads: [...new Set(reads)], sets: [...new Set(sets)], tag, ast: parseCond(cond != null ? cond : reads.map((r) => `$${r}`).join(' & ') || 'true'), extra });
const SCENE_ENTRIES = {
  porch: { T1: 'f:tauno.armed & !f:tauno.porch.done', R3: 'f:tauno.porch.declined1 & trips.since(tauno.porch.declined1)>=1', changed: 'f:tauno.porch.declined2',
    resume: 'f:tauno.porch.done', U1: 'f:tauno.porch.done & f:crews.seen', resumeU1: 'f:tauno.porch.done & f:crews.seen', resumeU4: 'f:tauno.turn',
    resumeU5: 'f:tauno.killed', R4: 'f:door.crews.taken & trips.since(door.crews.taken)>=3', R5: 'f:door.crews.declined & trips.since(door.crews.declined)>=3',
    R7: 'any(year.turned.*)', seat: 'f:tauno.porch.done' },
  josie: { R1: 'f:bundle.shelf & trips.since(bundle.shelf)>=1', R1b: 'f:rehook.R1 & trips.since(rehook.R1)>=2', still: 'f:rehook.R1b' },
  p1: { offer: 'true' },
  // join c2: slice 2's scenes, where their entries start them (mining.js farmEntry, slabEntry, lenEntry, maryEntry, tashaEntry)
  farm: { first: 'f:tauno.doors & !f:tauno.farm.met', morning: 'f:tauno.farm.met', well: 'f:kettle.visited & !f:door.mining.yield', ask: 'f:door.mining.yield & !f:tauno.ride' },
  slab: { core: 'f:tauno.ride & !f:tauno.slab', q: 'f:tauno.slab', choice: 'f:tauno.slab' },
  len: { first: 'true', hub: 'f:len.met' },
  mary: { first: 'true', hub: 'f:mary.met', table: 'f:kettle.lid & !f:mary.lid.given', papers: 'f:mary.lid.given & !f:mary.table' },
  tasha: { meet: 'f:kettle.notice & !f:tasha.met', hub: 'f:tasha.met', done: 'f:kettle.fill.up & f:kettle.fill.trench & f:kettle.fill.pond & f:kettle.secchi' },
  // a3: the guiding years' scenes, where guiding.js's entries start them
  hap: { first: '!f:hap.met', hub: 'f:hap.met', tow: 'f:hap.day & (f:gy.tow | f:gy.tow.told) & !f:hap.tow.asked', blunt2: 'f:hap.tow.blunt & trips.since(hap.tow.blunt)>=1', kind2: 'f:hap.tow.kind & trips.since(hap.tow.kind)>=1', far: 'f:hap.tow.right & !f:hap.farend' },
  marlys: { tent: '!f:marlys.met', intro: '!f:marlys.met', again: 'f:marlys.met', ask: 'f:gy.register & !f:marlys.night' },
  nate: { first: '!f:nate.met', again: 'f:nate.met' },
  sheila: { first: '!f:sheila.met', again: 'f:sheila.met', overdue: 'northwind2', found: 'f:sheila.overdue.found' },
  statement: { told: 'f:choice.sheila=in & !f:sheila.statement' },
  rick: { first: '!f:rick.met', hub: 'f:rick.met' },
  night: { n1750: 'f:marlys.night', n1805: 'f:gy.night.1750', n2200: 'f:gy.night.1805', n2340: 'f:gy.night.2200', n0100: 'f:gy.night.2340', n0200: 'f:gy.night.0100', n0600: 'f:gy.night.0200' },
};
const ENTRY_READS = { porch: ['f:tauno.porch.done', 'f:tauno.porch.declined2', 'f:door.crews.taken', 'f:door.crews.declined', 'f:crews.seen', 'f:tauno.turn', 'f:tauno.killed', 'f:tauno.doors', 'f:tauno.said.u1.*', 'f:nb.found'], josie: ['f:bundle.shelf', 'f:bundle.later', 'f:rehook.R1b'], p1: [],
  farm: ['f:tauno.doors', 'f:tauno.farm.met', 'f:kettle.visited', 'f:door.mining.yield', 'f:tauno.ride', 's:trips'], slab: ['f:tauno.ride', 'f:tauno.slab', 'f:tauno.said.q.*'], len: ['f:len.met'],
  mary: ['f:mary.met', 'f:kettle.lid', 'f:mary.lid.given', 'f:mary.table'], tasha: ['f:kettle.notice', 'f:tasha.met', 'f:kettle.fill.*', 'f:kettle.secchi', 'f:kettle.done'], // (join c2: + slice 2's)
  hap: ['f:hap.met', 'f:hap.day', 'f:gy.tow', 'f:gy.tow.told', 'f:hap.tow.*', 's:trips'], marlys: ['f:marlys.met', 'f:gy.register', 'f:marlys.night', 'f:nb.found', 'f:tauno.porch.done'], nate: ['f:nate.met'], // a3
  sheila: ['f:sheila.met', 'f:sheila.overdue.found'], statement: ['f:choice.sheila'], rick: ['f:rick.met'], night: ['f:marlys.night', 'f:gy.night.*'] };
const SCENE_SET = {}; // scene → every atom it can set (a conversation begun is kept only if its scene can touch the goal)
function sceneSetters(name, def, who) {
  const casts = who && CAST[who] ? CAST[who].where.flatMap((w) => condAtoms(w.when)) : [];
  const into = new Map(); // node → [edge whens leading in]
  const edges = [];
  for (const [id, N] of Object.entries(def.nodes)) {
    if (N.to) edges.push([id, N.to, null]);
    for (const c of [...(N.go || []), ...(N.hub && def.nodes[N.hub] ? def.nodes[N.hub].go || [] : [])]) edges.push([id, c.to || id, c]);
  }
  for (const [a, b, c] of edges) { if (!into.has(b)) into.set(b, []); into.get(b).push([a, c]); }
  const reachReads = (n) => { const out = new Set(), seen = new Set([n]), q = [n]; while (q.length) { const x = q.pop(); for (const [a, c] of into.get(x) || []) { if (c) for (const r of [...condAtoms(c.when), ...(c.once ? [`f:${def.who}.said.${c.once}`] : [])]) out.add(r); if (!seen.has(a)) { seen.add(a); q.push(a); } } } return [...out]; };
  const all = new Set();
  // the heuristic's way in: each entry's condition (porchEntry and the cast's slots), then the choices from it
  const entries = SCENE_ENTRIES[name], dist = new Map();
  for (const [e, cond] of Object.entries(entries)) {
    const d0 = new Map([[e, 0]]), q = [e];
    while (q.length) { const x = q.shift(); for (const [a, b] of edges.map(([a1, b1]) => [a1, b1])) if (a === x && !d0.has(b)) { d0.set(b, d0.get(x) + 1); q.push(b); } }
    for (const [n, d] of d0) { if (!dist.has(n)) dist.set(n, []); dist.get(n).push([cond, d]); }
  }
  const reachCond = (id) => { const ins = dist.get(id) || []; return ins.length ? ins.map(([c, d]) => ({ c, d })) : [{ c: 'false', d: 0 }]; };
  for (const [id, N] of Object.entries(def.nodes)) {
    const base = [...reachReads(id), ...ENTRY_READS[name], ...casts];
    const ns = actAtoms(N.then, who); ns.forEach((x) => all.add(x));
    for (const { c: ec, d } of reachCond(id)) {
      if (ns.length) setter(base, ns, `${name}:${id}`, ec, d);
      for (const c of N.go || []) { const cs = [...actAtoms(c.then, who), ...(c.once ? [`f:${def.who}.said.${c.once}`] : [])]; cs.forEach((x) => all.add(x)); if (cs.length) setter([...base, ...condAtoms(c.when)], cs, `${name}:${id}:${c.ask}`, `(${ec}) & (${c.when || 'true'})`, d + 1); }
    }
  }
  // walking off before T3 declines
  if (name === 'porch') { setter([...ENTRY_READS.porch, ...casts], ['f:tauno.porch.declined1', 'f:tauno.porch.declined2'], 'porch:walk off', 'f:tauno.armed | f:tauno.porch.declined1', 2); all.add('f:tauno.porch.declined1'); all.add('f:tauno.porch.declined2'); }
  for (const w of who && CAST[who] ? CAST[who].where : []) if (w.fact) { all.add(`f:${w.fact}`); setter(condAtoms(w.when), [`f:${w.fact}`], `cast:${w.id}`, w.when, 1); }
  SCENE_SET[name] = all;
}
async function buildSetters() {
  const { RULES_ALL } = await import('../src/story-data/all-rules.js');
  const { lockRules } = await import('../src/story-data/locks.js');
  for (const r of [...RULES_ALL, ...lockRules()]) setter(condAtoms(r.when), actAtoms(r.then), `rule:${r.id}`, r.when || 'true', r.on ? 1 : 0);
  sceneSetters('porch', PORCH, 'tauno'); sceneSetters('josie', JOSIE, 'josie'); sceneSetters('p1', P1, null);
  for (const t of KEEPER_TOPICS) setter([...condAtoms(t.when), ...condAtoms(t.ringWhen)], [...actAtoms(t.then), ...(t.once ? [`f:asked.walt.${t.id}`] : []), ...(t.ringFact ? [`f:${t.ringFact}`] : []), ...(t.ring && t.ring.place ? ringAtoms(t.ring.place) : [])], `topic:${t.id}`, `(${t.when || 'true'}) & (${t.ringWhen || 'true'})`, 1);
  for (const row of INK) {
    setter([...condAtoms(row.when), `s:pencil:${row.nick}`, `s:nickseen:${row.nick}`], [`f:ink.${row.nick}`, `s:pencil:${row.nick}`, ...(row.nb ? [`und:${row.nb}`] : [])], `ink:${row.nick}`, `(${row.when}) & ${row.auto ? 'true' : `$s:pencil:${row.nick}`}`);
    if (row.match) setter(condAtoms(row.match.when), actAtoms(row.match.then), `match:${row.nick}`, row.match.when);
    setter([`s:nickseen:${row.nick}`], [`s:pencil:${row.nick}`], `pencil:${row.nick}`, `$s:nickseen:${row.nick}`, 1);
    setter([...(row.seen || [row.nb]).map((nb) => `read:${nb}`), ...(CUT_NICKS.includes(row.nick) ? ['f:nb.found'] : [])], [`s:nickseen:${row.nick}`], `seen:${row.nick}`, [...(row.seen || [row.nb]).map((nb) => `read:${nb}`), ...(CUT_NICKS.includes(row.nick) ? ['f:nb.found'] : [])].join(' | '));
  }
  const { LEADS } = await import('../src/story-data/leads-act1.js');
  for (const L of LEADS) setter([...condAtoms(L.born), ...condAtoms(L.closes), ...condAtoms(L.followed)], [`lead:${L.id}`], `lead:${L.id}`, `(${L.born}) & (${L.closes || 'true'})`);
  for (const pl of PLACES_L) {
    for (const v of pl.verbs || []) setter(condAtoms(v.when), actAtoms(v.then), `verb:${v.prop}`, v.when || 'true', 1);
    for (const t of pl.triggers || []) setter([...condAtoms(t.when), 'f:nb.found'], [...actAtoms(t.then), ...(t.nb ? [`here:${t.nb}`, `read:${t.nb}`] : [])], `trigger:${pl.id}:${t.on}`, `(${t.when || 'true'}) & f:nb.found`, 1);
  }
  for (const nb of READ_NB) setter(['f:nb.found'], [`read:${nb}`], `read:${nb}`, 'f:nb.found', 1);
  for (const row of BACK_COVER) setter(['f:nb.found'], [`f:bc.${row.n.replace('/', '-')}`, ...(row.nb ? [`here:${row.nb}`] : [])], `carry:${row.n}`, 'f:nb.found', 1);
  setter(['f:bundle.taken', 'f:bundle.later'], ['f:nb.found', ...CUT_NICKS.map((n) => `s:nickseen:${n}`)], 'night', 'f:bundle.taken | f:bundle.later', 1);
  setter([], ['s:trips'], 'trip', 'true', 1);
  setter(['f:nb.found'], ['f:year.turned.*'], 'turn', 'f:nb.found', 1); // w: the winter turn (season-turn.js, feed-season.js)
  // join c2: slice 2's scenes and moves (moves2)
  sceneSetters('farm', FARM_SC, 'tauno'); sceneSetters('slab', SLAB, 'tauno'); sceneSetters('len', LEN, 'len'); sceneSetters('mary', MARY, 'mary'); sceneSetters('tasha', TASHA, 'tasha');
  for (const nb of READ_NB2) setter(['f:nb.found'], [`read:${nb}`], `read:${nb}`, 'f:nb.found', 1);
  setter(condAtoms(ARC.flyer.when), ['f:ep.mining.flyer', ...actAtoms(ARC.flyer.then)], 'flyer:mining', ARC.flyer.when, 1);
  for (const t of KEEPER_A2) setter(condAtoms(t.when), [`f:asked.walt.${t.id}`, `s:ringed:${t.ring.place}`], `topic:${t.id}`, t.when, 1);
  setter(['f:len.favour', 'f:landing.crib', 'f:westpads.casing'], ['f:photo.crib', 'f:photo.casing', 'f:len.photos'], 'favour:len', 'f:len.favour & f:landing.crib & f:westpads.casing', 1);
  setter([], ['f:ep.S7.flyer', 'f:ep.S7.yes'], 'flyer:S7', 'true', 1);
  setter(['f:ep.S7.yes'], ['f:ep.S7.rose', 'f:ep.S7.asked'], 'rose', 'f:ep.S7.yes', 1);
  setter(['f:ep.S7.yes', 'f:ep.S7.found'], ['f:ep.S7.shown'], 'show:S7', 'f:ep.S7.yes & f:ep.S7.found', 1);
  setter(['f:nb.found'], ['f:mg.snag.hooked'], 'snag', 'f:nb.found', 1);
  setter(['f:mg.snag.hooked'], ['f:mg.snag.landed', 'f:mg.snag.snapped'], 'snag:fight', 'f:mg.snag.hooked', 1);
  // j1: slice 3's own moves (movesFar)
  for (const nb of READ_NBF) setter(['f:nb.found'], [`read:${nb}`], `read:${nb}`, 'f:nb.found', 1);
  setter(['f:nb.found'], ['f:gull.stump.lowwater', 'f:gull.rod.seen', 'f:gull.dam', 'f:gull.eastbay'], 'lowwater:gull.sign', 'f:nb.found', 1);
  // a3: the guiding years' scenes and moves (moves3)
  for (const [n, d, who] of [['hap', GY.HAP, 'hap'], ['marlys', GY.MARLYS, 'marlys'], ['nate', GY.NATE, 'nate'], ['sheila', GY.SHEILA, 'sheila'], ['statement', GY.STATEMENT, 'sheila'], ['rick', GY.RICK, 'rick'], ['night', GY.NIGHT, 'marlys']]) sceneSetters(n, d, who);
  for (const [sets, cond] of GY_WORLD_SETTERS) setter(condAtoms(cond), sets, `a3:${sets[0]}`, cond, 1);
}
const famMatch = (set, atom) => {
  if (set.has(atom)) return true;
  for (const r of set) if (r.endsWith('*') && atom.startsWith(r.slice(0, -1))) return true;
  if (atom.endsWith('*')) { const p = atom.slice(0, -1); for (const r of set) if (r.startsWith(p)) return true; }
  return false;
};
const relCache = new Map();
function relevant(goal) {
  if (relCache.has(goal)) return relCache.get(goal);
  const R = new Set(condAtoms(goal));
  for (let changed = true; changed;) {
    changed = false;
    for (const st of SETTERS) {
      if (!st.sets.some((a) => famMatch(R, a))) continue;
      for (const r of st.reads) if (!R.has(r)) { R.add(r); changed = true; }
    }
  }
  const set = { atoms: R, has: (a) => famMatch(R, a), scenes: new Set(Object.entries(SCENE_SET).filter(([, v]) => [...v].some((a) => famMatch(R, a))).map(([k]) => k)) };
  relCache.set(goal, set);
  return set;
}

// --- the search --------------------------------------------------------------------------------------------------------------
function search(start, goal, { max = MAX, block = null } = {}) {
  const ok = (S) => !S.conv && S.when(goal);
  if (ok(start)) return { found: true, path: [], states: 1, end: start };
  const R = relevant(goal), G = parseCond(goal);
  const seen = new Set([start.keyFor(R)]);
  const heap = [], push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (less(heap[j], heap[i])) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
  const less = (a, b) => (a.h !== b.h ? a.h < b.h : a.g !== b.g ? a.g < b.g : a.n < b.n);
  let n = 1;
  push({ snap: start.snap(), path: [], h: heuristic(start, G), g: 0, n: 0 });
  while (heap.length) {
    const { snap, path: p } = pop();
    const S = State.from(snap);
    const before = S.atoms();
    for (const m of moves(S)) {
      if (m.kind === 'cast' || m.kind === 'talk') { const sc = m.scene; if (sc && !R.scenes.has(sc)) continue; }
      const T = new State(S);
      try { m.run(T); } catch (e) { continue; }
      if (block && block(T)) continue;
      if (!T.conv && !S.conv && m.kind !== 'cast' && m.kind !== 'talk') {
        const after = T.atoms(); let touched = false;
        for (const [k, v] of after) if (before.get(k) !== v && R.has(k)) { touched = true; break; }
        if (!touched) continue; // (it changed nothing the goal depends on)
      }
      const k = T.keyFor(R);
      if (seen.has(k)) continue;
      seen.add(k); n++;
      const q = [...p, m.id];
      if (ok(T)) return { found: true, path: q, states: n, end: T };
      if (n >= max) return { found: false, capped: true, states: n };
      push({ snap: T.snap(), path: q, h: T.conv ? heuristic(T, G) - 0.5 : heuristic(T, G), g: q.length, n });
    }
  }
  return { found: false, states: n };
}
// replay a witness on a fresh story: every move must be on offer where it is played
function replay(pathIds, from = null) {
  let S = from ? new State(from) : new State();
  for (const id of pathIds) {
    const m = moves(S).find((q) => q.id === id);
    if (!m) return { ok: false, at: id, S };
    const T = new State(S); m.run(T); S = T;
  }
  return { ok: true, S };
}

// --- the slice ----------------------------------------------------------------------------------------------------------------
// The search is chained: each slice fact is a short breadth-first search from where the one before it left the story (a
// player's season is long; its steps are short). A witness is the moves up to the move that made the fact true, replayed
// on a fresh story. `via` are the facts a fact's own path goes through when it is not on the main line (a branch).
const SLICE = [
  { step: 1, id: 'the bundle taken (P1)', when: 'f:bundle.taken' },
  { step: 2, id: 'night one', when: 'f:nb.found' },
  { step: 3, id: 'NB45 read', when: 'read:NB45' },
  { step: 3, id: 'NB01 read where he wrote it (C837)', when: 'here:NB01' },
  { step: 3, id: '"64" pencilled on the back cover', when: 'f:bc.64' },
  { step: 3, id: 'a white stone looked at (C837)', when: 'f:stone.c837' },
  { step: 4, id: 'the return arms the porch', when: 'f:tauno.armed' },
  { step: 4, id: 'the Swede test corrected (warm)', when: 'f:tauno.porch.warm & f:knows.haapala' },
  { step: 4, id: 'the porch walked (T3)', when: 'f:tauno.porch.done' },
  { step: 4, id: 'the door taken (T5)', when: 'f:door.crews.taken' },
  { step: 5, id: 'Little Gabbro rung by a keeper', when: 'ringed:ep33' },
  { step: 5, id: 'Bald Eagle\'s west shore rung', when: 'ringed:baldeagle.west' },
  { step: 5, id: 'the crib', when: 'f:landing.crib' },
  { step: 5, id: 'the blaze and the pink', when: 'f:landing.blaze & f:landing.pink' },
  { step: 5, id: 'the grade', when: 'f:landing.grade' },
  { step: 5, id: 'the lead closes', when: 'lead:crews=closed' },
  { step: 6, id: 'Eino named', when: 'f:knows.eino' },
  { step: 6, id: 'the turn (U3)', when: 'f:tauno.turn' },
  { step: 6, id: 'the word (U4)', when: 'f:tauno.killed' },
  { step: 6, id: 'four doors named (U5)', when: 'f:door.guiding.named & f:door.boys.named & f:door.family.named & f:door.mining.named' },
  { step: 6, id: 'stage S3', when: 'stage>=S3' },
  { step: 6, id: 'a door rung (Little Vermilion)', when: 'f:door.family.ringed' },
  { step: 7, id: 'NB20 and NB31 read', when: 'read:NB20 & read:NB31' },
  { step: 7, id: 'NB20 understood (Tauno: V.\'s water)', when: 'und:NB20' },
  { step: 7, id: 'NB31 understood (Tauno: Two Stump)', when: 'und:NB31' },
  { step: 7, id: 'the Front Porch pencilled', when: 'f:nb.found & !f:ink.frontporch & und:NB31', soft: true },
  { step: 7, id: 'the Front Porch inked by a keeper\'s ring (NB01 understood)', when: 'f:ink.frontporch & und:NB01' },
  // branches off the main line
  { step: 1, id: 'R1: the bundle taken later at the counter', when: 'f:bundle.later', via: ['f:bundle.shelf'], branch: true },
  { step: 4, id: 'X1, R3 "Not today.", then "Changed your mind?" → yes', when: 'f:tauno.porch.declined2 & f:tauno.porch.done', via: ['f:bundle.taken', 'f:nb.found', 'f:tauno.armed', 'f:tauno.porch.declined1', 'f:tauno.porch.declined2'], branch: true },
  { step: 4, id: 'the porch, not warm (NB45 unread): the turn all the same', when: 'f:tauno.turn & !f:tauno.porch.warm', via: ['f:bundle.taken', 'f:nb.found', 'f:tauno.armed', 'f:tauno.porch.done & !read:NB45', 'f:door.crews.taken & !f:tauno.porch.warm', 'f:crews.seen & !f:tauno.porch.warm'], branch: true },
];
const END = 'f:tauno.doors & und:NB20 & und:NB31 & f:ink.frontporch & lead:crews=closed & f:door.family.ringed';
const MAIN = SLICE.filter((g) => !g.branch && !g.soft);
// the articulation chain: only what the end itself needs, in the order a season meets it (no ring asked for on the way)
const ARTI = ['f:nb.found', 'f:door.crews.taken | f:door.crews.declined', 'lead:crews=closed', 'f:tauno.turn', 'f:tauno.doors', 'f:door.family.ringed', 'read:NB20 & read:NB31', 'und:NB20', 'und:NB31', 'f:ink.frontporch'];
// the declines: each reached by its own chain, then the slice's end from there (the rest of the main line, in order)
const DECLINES = [
  { id: 'the bundle left on the shelf (P1 "I\'ll wait for a rental.")', via: ['f:bundle.shelf'] },
  { id: 'keep walking (X1: declined1)', via: ['f:bundle.taken', 'f:nb.found', 'f:tauno.armed', 'f:tauno.porch.declined1'] },
  { id: 'R3 "Not today." (declined2)', via: ['f:bundle.taken', 'f:nb.found', 'f:tauno.armed', 'f:tauno.porch.declined1', 'f:tauno.porch.declined2'] },
  { id: 'X2: the door declined ("Not my business.")', via: ['f:bundle.taken', 'f:nb.found', 'f:tauno.armed', 'f:door.crews.declined'] },
  { id: 'X2, then R5 three trips on: "Still just here to paddle?" → not yet', via: ['f:bundle.taken', 'f:nb.found', 'f:tauno.armed', 'f:door.crews.declined', 'f:rehook.R5'] },
  { id: 'the door taken, the crib not seen: R4 three trips on', via: ['f:bundle.taken', 'f:nb.found', 'f:tauno.armed', 'f:door.crews.taken', 'f:rehook.R4'] },
  { id: 'walked off after T3 (kept: "Where was I.")', via: ['f:bundle.taken', 'f:nb.found', 'f:tauno.armed', 'f:tauno.porch.done & !f:door.crews.taken & !f:door.crews.declined'] },
  { id: 'walked off mid-turn (U1 begun, not turned)', via: ['f:bundle.taken', 'f:nb.found', 'f:tauno.armed', 'f:door.crews.taken', 'f:crews.seen', 'count(tauno.said.u1.*)>=1 & !f:tauno.turn'] },
  { id: 'walked off after the turn, before the doors', via: ['f:bundle.taken', 'f:nb.found', 'f:tauno.armed', 'f:door.crews.taken', 'f:crews.seen', 'f:tauno.turn & !f:tauno.doors'] },
];

// a chain of goals: each searched from where the one before left off → { ok, path, S, marks: [{ when, at }], fail? }
function chain(goals, from = null, opt = {}) {
  let S = from ? new State(from) : new State();
  const path = [], marks = [];
  for (const g of goals) {
    const r = search(S, g, opt);
    if (!r.found) return { ok: false, path, S, marks, fail: g, states: r.states, capped: !!r.capped };
    if (r.path.length) { path.push(...r.path); S = r.end; }
    marks.push({ when: g, at: path.length });
  }
  return { ok: true, path, S, marks };
}
const firstTrue = (pathIds, when, from = null) => {
  let S = from ? new State(from) : new State();
  if (S.when(when)) return 0;
  for (let i = 0; i < pathIds.length; i++) {
    const m = moves(S).find((q) => q.id === pathIds[i]); if (!m) return -1;
    const T = new State(S); m.run(T); S = T;
    if (!S.conv && S.when(when)) return i + 1;
  }
  return -1;
};

// --- slice 2 (Round 2, the join): its facts, its end, its declines; the locks with their Round 2 keys ------------------------
// (campaign-design Part 4 Round 2, "The second playable slice, exactly", steps 1–14 and 16). From the end of slice 1.
const MAIN2 = [
  { step: 1, id: 'the first Farm morning sat (the arc\'s yes on the runner)', when: 'f:tauno.farm.met & f:ep.mining.yes' },
  { step: 1, id: '"The outfit" → "Where, exactly?" (L1A)', when: 'f:tauno.drilled' },
  { step: 1, id: '"BRM-14" with the pack carried (L1B)', when: 'f:knows.brm14' },
  { step: 1, id: '"The pads" (the lead)', when: 'f:tauno.said.pads' },
  { step: 1, id: 'the Farm keeper rings the old grade and the west pads', when: 'ringed:grade & ringed:westpads' },
  { step: 2, id: 'Len: "The crews" (three rings in his voice, a second L1A)', when: 'f:len.westpads.rings' },
  { step: 2, id: 'Len: "Walt" (tier 1 asked, the lie heard)', when: 'f:asked.len.walt & f:said.len.walt' },
  { step: 2, id: 'Len: "What do you do now?" (his favour)', when: 'f:len.favour' },
  { step: 2, id: 'Mary: "Leo" → "Are any of his boxes…" (a lid for Mary)', when: 'f:mary.lid.asked' },
  { step: 3, id: 'the Kettle notice taken (the flyer, the pad rung)', when: 'f:kettle.notice & ringed:kettle' },
  { step: 4, id: 'the hollow stood in (L1C, kettle.visited)', when: 'f:westpads.seen & f:kettle.visited' },
  { step: 4, id: 'Tasha at the tailgate (the bottles, the Secchi on loan)', when: 'f:tasha.met & f:kettle.bottles' },
  { step: 4, id: '"What\'s background?"', when: 'f:heard.background' },
  { step: 4, id: 'Fill ×3 and the Secchi', when: 'f:kettle.fill.up & f:kettle.fill.trench & f:kettle.fill.pond & f:kettle.secchi' },
  { step: 4, id: 'Leo\'s lid taken', when: 'f:kettle.lid' },
  { step: 4, id: 'the bottles back (the day done)', when: 'f:kettle.done & f:kettle.rain' },
  { step: 5, id: 'Len\'s two pictures handed in', when: 'f:len.photos' },
  { step: 6, id: 'the lid given (the back table)', when: 'f:mary.lid.given' },
  { step: 6, id: 'the promise', when: 'f:mary.promised' },
  { step: 6, id: 'Far End (L2A)', when: 'f:mary.farend' },
  { step: 7, id: 'the crew map (the yield, L6B)', when: 'f:door.mining.yield & f:tauno.e7sketch' },
  { step: 7, id: '"The stations"', when: 'f:stations.known' },
  { step: 7, id: '"E-7" → the old test pit (L5B, L6C)', when: 'f:tauno.blazes & f:tauno.pit' },
  { step: 8, id: 'Pietro\'s dig looked at', when: 'f:pietro.dig.seen' },
  { step: 8, id: 'the wrong hill (L2C)', when: 'f:pietro.wronghill' },
  { step: 9, id: '"Let\'s go." (the ride)', when: 'f:tauno.ride' },
  { step: 9, id: 'the slab (the core shed)', when: 'f:tauno.slab' },
  { step: 9, id: 'on the record (the slab)', when: 'f:tauno.record' },
  { step: 9, id: 'the climax and the arc done', when: 'f:door.mining.climax & f:door.mining.done & f:ep.mining.end=done' },
  { step: 12, id: 'S9: the bail hooked at the beach rock (the yes)', when: 'f:ep.S9.yes' },
  { step: 12, id: 'S9: June\'s pot up (the end)', when: 'f:ep.S9.end=pot' },
  { step: 13, id: 'S7: Rose\'s notice taken (the yes)', when: 'f:ep.S7.yes' },
  { step: 13, id: 'S7: "Where are the lilacs?"', when: 'f:ep.S7.asked' },
  { step: 13, id: 'S7: Mummo\'s found', when: 'f:ep.S7.found' },
  { step: 13, id: 'S7: the print shown, paid (the end)', when: 'f:ep.S7.paid & f:ep.S7.end=rose' },
];
const END2 = 'f:door.mining.done & f:tauno.record & f:mary.farend & f:pietro.wronghill & f:tauno.pit & f:stations.known & f:kettle.done & f:len.photos & f:ep.S9.end=pot & f:ep.S7.end=rose';
// the end without the parts a decline gives up (the locks open, the arc done)
const END2L = 'f:door.mining.done & any(key.L1*) & any(key.L2*) & any(key.L5*) & any(key.L6*)';
// (a branch or a decline is reached along the main line's own goals up to a point, `upto` the id of the last one kept: a
// season's steps are short, its whole is long, so the search is chained as the main line is)
const upto = (id) => { const k = MAIN2.findIndex((g) => g.id === id); return MAIN2.slice(0, k + 1).map((g) => g.when); };
const MAP = 'the crew map (the yield, L6B)', HOLLOW = 'the hollow stood in (L1C, kettle.visited)';
const LATER = 'f:door.mining.yield & trips.since(door.mining.yield)>=1'; // (the ask comes on a later porch visit than the map's)
const BRANCH2 = [
  { step: 7, id: '"North of Gabbro, yes." ("Go again."), then corrected: the map all the same', when: 'f:tauno.kettle.wrong & f:door.mining.yield', via: [...upto(HOLLOW), 'f:tauno.kettle.wrong'] },
  { step: 9, id: '"Not today.", then asked again: "Let\'s go."', when: 'f:tauno.ride.declined & f:tauno.ride', via: [...upto(MAP), LATER, 'f:tauno.ride.declined'] },
  { step: 9, id: 'tauno.record by "On the record" on the porch (the slab\'s other choice)', when: 'f:door.mining.climax & f:tauno.record', via: [...upto(MAP), LATER, 'f:tauno.ride', 'f:tauno.slab', 'f:door.mining.done & !f:tauno.record'] },
  { step: 12, id: 'S9: the line parted on the pot (it stays), cast again: up', when: 'f:mg.snag.snapped & f:ep.S9.end=pot', via: ['f:mg.snag.snapped & !f:mg.snag.landed'] },
];
const DECLINES2 = [
  { id: '"Not today." (the clean book\'s ask)', via: [...upto(MAP), LATER, 'f:tauno.ride.declined'], end: END2 },
  { id: '"North of Gabbro, yes." (the test; "Go again.")', via: [...upto(HOLLOW), 'f:tauno.kettle.wrong'], end: END2 },
  { id: 'the lid kept (never given to Mary)', via: ['f:kettle.lid'], end: END2L, block: (T) => T.s.has('mary.lid.given') },
  { id: 'no rain (no notice, no Tasha: the stain only)', via: [], end: END2L, block: (T) => T.s.has('kettle.notice') },
  { id: 'a climax the director holds a trip (another arc\'s opened)', via: upto(MAP), end: END2, held: ['mining'] },
  { id: 'S9\'s line parted', via: ['f:mg.snag.snapped & !f:mg.snag.landed'], end: END2 },
];
const R2KEYS = { L1: ['L1A', 'L1B', 'L1C'], L2: ['L2A', 'L2C'], L5: ['L5B'], L6: ['L6B', 'L6C'] };
// each key's own shortest route from the end of slice 1, by its goals (the main line would carry everything before it)
const FARM1 = 'f:tauno.farm.met', MAP1 = 'f:door.mining.yield';
const KEYVIA = {
  L1A: [FARM1], L1B: [FARM1], L1C: ['f:kettle.visited'],
  L2A: ['f:kettle.lid', 'f:mary.lid.given'], L2C: [FARM1, 'f:kettle.visited', MAP1, 'f:pietro.dig.seen', 'read:NB70'],
  L5B: [FARM1, 'f:kettle.visited', MAP1],
  L6B: [FARM1, 'f:kettle.visited'], L6C: [FARM1, 'f:kettle.visited', MAP1],
};
function on2() { R2 = true; relCache.clear(); }
async function slice2(main, rp) {
  const out = report.slice2 = { witnesses: [], plan: null, branches: [], reentry: [], locks: [], director: [], warn: [] };
  if (!main.ok || !rp || !rp.ok) { res('slice 2: slice 1\'s end (its plan replayed) to start from', false); return; }
  on2();
  const S1 = rp.S;
  // the main line, every fact in order, then the end
  const m2 = chain([...MAIN2.map((g) => g.when), END2], S1);
  out.plan = m2.path;
  res(`slice 2 end to end from the end of slice 1: ${m2.ok ? `${m2.path.length} moves` : `stuck at '${m2.fail}' (${m2.states} states${m2.capped ? ', capped' : ''})`}`, m2.ok, { at: m2.fail || null });
  const rp2 = m2.ok ? replay(m2.path, S1) : null;
  res('slice 2: the plan replays from the end of slice 1, every move on offer where it is played', !!(rp2 && rp2.ok && rp2.S.when(END2)), { at: rp2 && rp2.at });
  for (const g of MAIN2) {
    let path = null, n = -1;
    if (m2.ok) { n = firstTrue(m2.path, g.when, S1); path = n >= 0 ? m2.path.slice(0, n) : null; }
    if (n < 0) { const c = chain([g.when], S1); if (c.ok) { path = c.path; n = c.path.length; } }
    const r = path ? replay(path, S1) : null, ok = !!(r && r.ok && r.S.when(g.when));
    out.witnesses.push({ step: g.step, id: g.id, when: g.when, moves: path ? path.length : null, last: path && path.length ? path[path.length - 1] : null });
    res(`slice 2 witness: step ${g.step} ${g.id}${path ? ` (${path.length} moves; made by "${path[path.length - 1] || 'the start'}")` : ''}`, ok, { when: g.when });
  }
  // branches
  for (const b of BRANCH2) {
    const c = chain([...b.via, b.when], S1), ok = c.ok && replay(c.path, S1).ok;
    out.branches.push({ id: b.id, ok, moves: c.ok ? c.path.length : null, at: c.fail || null });
    res(`slice 2 branch: step ${b.step} ${b.id}${c.ok ? ` (${c.path.length} moves)` : ` (stuck at '${c.fail}')`}`, ok);
  }
  // re-entry from every decline: the decline reached, then its end (the whole slice, or the locks and the arc where the
  // decline gives a part up)
  for (const d of DECLINES2) {
    const to = chain(d.via, S1, d.block ? { block: d.block } : {});
    if (!to.ok) { res(`slice 2 re-entry: ${d.id}: the decline is reachable`, false, { at: to.fail }); out.reentry.push({ id: d.id, reached: false, at: to.fail }); continue; }
    const from = new State(to.S); if (d.held) from.r2.held = [...d.held];
    const back = chain([...MAIN2.map((g) => g.when).filter((w) => d.end === END2 || !/mary\.|kettle\.(notice|done|bottles|fill|secchi)|tasha\.|heard\.background|kettle\.rain|ringed:kettle/.test(w)), d.end], from, d.block ? { block: d.block } : {});
    const ok = back.ok && replay(back.path, from).ok;
    const askWaited = d.held ? (() => { const T = new State(from); return farmEntry(T.s, { porchVisit: true }) !== 'ask'; })() : null;
    out.reentry.push({ id: d.id, reached: true, to: to.path.length, back: back.ok ? back.path.length : null, at: back.fail || null, askWaited });
    res(`slice 2 re-entry: ${d.id} (${to.path.length} moves), then ${d.end === END2 ? 'the slice\'s end' : 'the locks open and the arc done'} in ${back.ok ? back.path.length : '—'} moves${back.ok ? '' : ` (stuck at '${back.fail}')`}${d.held ? `; the ask waited while held: ${askWaited}` : ''}`, ok && (askWaited !== false));
  }
  // the locks with their Round 2 keys: each reachable (its witness: its own shortest route, KEYVIA, else the main line up
  // to the move that keys it), and no fact on the way to all of them: for each fact every key's witness has set since
  // slice 1, blocked (no move that sets it is played), is there still a way to one of the keys? (each key searched along
  // its route, without the goals that name the blocked fact)
  for (const [L, keys] of Object.entries(R2KEYS)) {
    const ends = [], row = { lock: L, keys: {}, articulation: [], one: keys.length < 2 }, via = {};
    for (const k of keys) {
      const goal = `f:key.${k}`;
      let path = null;
      via[k] = KEYVIA[k] || [];
      const c0 = chain([...via[k], goal], S1);
      if (c0.ok) path = c0.path;
      else { const n = m2.ok ? firstTrue(m2.path, goal, S1) : -1; if (n >= 0) { path = m2.path.slice(0, n); via[k] = m2.marks.filter((q) => q.at <= n).map((q) => q.when); } }
      const r = path ? replay(path, S1) : null, ok = !!(r && r.ok && r.S.when(goal));
      row.keys[k] = ok ? path.length : null;
      if (ok) ends.push(r.S);
      res(`slice 2 lock ${L}: key ${k} reachable from the end of slice 1${ok ? ` (${path.length} moves; made by "${path[path.length - 1]}")` : ''}`, ok);
    }
    const all = ends.length === keys.length;
    if (keys.length >= 2 && all) {
      const S1f = new Set(Object.keys(S1.s.doc.facts));
      const common = Object.keys(ends[0].s.doc.facts).filter((f) => !S1f.has(f) && ends.every((E) => E.s.has(f)) && !/\.said\.|^asked\.|^tier\.|^key\.|^ep\.mining\.|^lie\.|^walt\./.test(f));
      row.common = common;
      for (const f of common) {
        const rx = new RegExp(`(^|[^.\\w])f:${f.replace(/\./g, '\\.')}(?=$|[^.\\w])`);
        let way = null;
        for (const k of keys) { const c = chain([...via[k].filter((g) => !rx.test(g)), `f:key.${k}`], S1, { block: (T) => T.s.has(f) }); if (c.ok) { way = k; break; } }
        if (!way) row.articulation.push(f);
      }
    }
    out.locks.push(row);
    if (!all) continue;
    if (row.one) { out.warn.push(`${L}: one Round 2 key (${keys.join(', ')}): a single key this round`); console.log(`WARN slice 2 lock ${L}: one key this round (${keys.join(', ')}); its others come later`); }
    else if (row.articulation.length) { out.warn.push(`${L}: its Round 2 keys (${keys.join(', ')}) all pass through ${row.articulation.join(', ')}`); console.log(`WARN slice 2 lock ${L}: its Round 2 keys (${keys.join(', ')}) all pass through ${row.articulation.join(', ')} (an articulation point among them)`); }
    else say(`PASS slice 2 lock ${L}: ${keys.length} Round 2 keys, no fact on the way to all of them (${(row.common || []).length} checked)`);
  }
  out.end = rp2 && rp2.ok ? rp2 : null; // j1: slice 3 starts here
  // the director: no beat carries a key; a climax held a trip waits (re-entry above)
  const keyed = RULES_BEATS.filter((r) => (r.then || []).some((a) => /^f:(key\.|lock|door\.|ink\.|knows\.)/.test(String(a))));
  out.director.push({ rules: RULES_BEATS.length, keyed: keyed.map((r) => r.id) });
  res(`slice 2 director: no beat rule writes a key or a story fact (${RULES_BEATS.length} rules in rules-beats.js)`, keyed.length === 0, { keyed: keyed.map((r) => r.id) });
}

// --- j1: begin: slice 3 (Round 3, join 1): the far end from where slice 2 ends ---------------------------------------------
// campaign-design Part 4 Round 3: the keys present after Round 3 (L1 A B C · L2 A B C · L3 C · L4 B C E · L5 A C ·
// L6 A B C), each reachable; the far end walked to the pit's lift (Eino's note: the run starts on it, run.js); then the
// endings (story-solve-endings.mjs) are played from that very state as well as from n's stubs. L3 has one key until
// Round 6: its articulation is a warning (the design says so).
const MAINF = [
  { id: 'the burnt point (L3C)', when: 'f:nb.burntpoint' },
  { id: 'the 205/50 pair carried (L2B)', when: 'f:bc.205-50' },
  { id: 'the landing at fall low water (L4C)', when: 'f:gull.stump.lowwater' },
  { id: 'the blazes passed (L5C)', when: 'f:ev.blazes' },
  { id: 'the camp reached by the long way (L5A; the far end inked)', when: 'f:nb.longway & f:ink.farend' },
  { id: 'the spare paddle\'s stone with NB66 read (L4E)', when: 'f:nb.paddlestash' },
  { id: 'the stone understood', when: 'f:knows.stonesign' },
  { id: 'the floorboard lifted (L6A, the torn pages)', when: 'f:nb.torn' },
  { id: 'the moss cleared', when: 'f:pit.cleared' },
  { id: 'the lid lifted', when: 'f:pit.lifted' },
  { id: 'Eino\'s note (the lift: the run starts)', when: 'f:pit.note' },
  { id: 'the two cans', when: 'f:pit.can.1 & f:pit.can.2' },
];
const ENDF = 'f:pit.note & f:pit.can.1 & f:pit.can.2';
const RFKEYS = { L1: ['L1A', 'L1B', 'L1C'], L2: ['L2A', 'L2B', 'L2C'], L3: ['L3C'], L4: ['L4B', 'L4C', 'L4E'], L5: ['L5A', 'L5C'], L6: ['L6A', 'L6B', 'L6C'] };
function sliceFar(rp2) {
  const out = report.sliceFar = { witnesses: [], plan: null, keys: {}, warn: [], ok: false };
  if (report.slice2) delete report.slice2.end;
  if (!rp2 || !rp2.ok) { res('slice 3: slice 2\'s end (its plan replayed) to start from', false); return null; }
  RF = true; relCache.clear();
  const S2 = rp2.S;
  const m3 = chain([...MAINF.map((g) => g.when), ENDF], S2);
  out.plan = m3.path;
  res(`slice 3 (the far end) from the end of slice 2 to the lift: ${m3.ok ? `${m3.path.length} moves` : `stuck at '${m3.fail}' (${m3.states} states${m3.capped ? ', capped' : ''})`}`, m3.ok, { at: m3.fail || null });
  const rp3 = m3.ok ? replay(m3.path, S2) : null;
  res('slice 3: the plan replays from the end of slice 2, every move on offer where it is played', !!(rp3 && rp3.ok && rp3.S.when(ENDF)), { at: rp3 && rp3.at });
  for (const g of MAINF) {
    const n = m3.ok ? firstTrue(m3.path, g.when, S2) : -1;
    out.witnesses.push({ id: g.id, when: g.when, moves: n >= 0 ? n : null, last: n > 0 ? m3.path[n - 1] : null });
    res(`slice 3 witness: ${g.id}${n >= 0 ? ` (${n} moves; made by "${m3.path[n - 1] || 'the start'}")` : ''}`, n >= 0, { when: g.when });
  }
  // the R3 keys: each reachable from the end of slice 2 on its own (its shortest route), else on the slice-3 line
  for (const [L, keys] of Object.entries(RFKEYS)) {
    for (const k of keys) {
      const goal = `f:key.${k}`;
      let n = S2.when(goal) ? 0 : -1, made = 'slice 2';
      if (n < 0) { const c = chain([goal], S2); if (c.ok && replay(c.path, S2).ok) { n = c.path.length; made = c.path[c.path.length - 1]; } }
      if (n < 0 && m3.ok) { n = firstTrue(m3.path, goal, S2); if (n > 0) made = m3.path[n - 1]; }
      out.keys[k] = n >= 0 ? n : null;
      res(`slice 3 lock ${L}: key ${k} reachable by the end of Round 3${n >= 0 ? ` (${n} moves from slice 2's end; made by "${made}")` : ''}`, n >= 0);
    }
    if (keys.length < 2) { out.warn.push(`${L}: one key by Round 3 (${keys.join(', ')}): its articulation is a warning until Round 6`); console.log(`WARN slice 3 lock ${L}: one key by Round 3 (${keys.join(', ')}); articulation a warning until Round 6`); }
  }
  out.ok = !!(rp3 && rp3.ok);
  RF = false; relCache.clear();
  return out.ok ? rp3.S : null;
}
// j1: end

// final: begin — the Round 6 gates (campaign-design Part 4 Round 6; §14.2 checks 3, 4, 5): every lock has all its keys,
// the articulation proof is an ERROR (scripts/story-solve-locks.mjs: two independent keys witnessed, no support node
// whose loss leaves a lock without one), and the full 72-branch endings check (story-solve-endings.mjs solveChoices72).
// A way (one fact of a key's when) is witnessed by this solver's own moves (searched alone from where slice 1 ends with
// every subgraph on, or from where slice 2 ends with the far end on) or by a stream's Node proof (UNIT_WITNESS)
async function finalGates(rp1, S2, SF) {
  const { WAYS, UNIT_WITNESS, unitWitness, proveLocks } = await import('./story-solve-locks.mjs');
  const { solveCompany } = await import('./story-solve-company.mjs');
  const CO = solveCompany();
  const out = report.final = { ways: {}, locks: null, choices: null };
  const witnessed = new Set();
  const facts = [...new Set(Object.values(WAYS).flatMap((t) => Object.keys(t)))];
  const all = () => { on2(); on3(); if (typeof onI === 'function') onI(); relCache.clear(); };
  for (const f of facts) {
    const goal = `f:${f}`;
    let how = null;
    const u = unitWitness(f, CO.doc);
    if (u && u.ok) how = u.how;
    if (!how && rp1 && rp1.ok) {
      if (rp1.S.when(goal)) how = 'slice 1';
      else { all(); const c = chain([goal], rp1.S, { max: MAX }); if (c.ok && replay(c.path, rp1.S).ok) how = `${c.path.length} moves from slice 1's end ("${c.path[c.path.length - 1]}")`; }
    }
    if (!how && S2 && S2.ok) {
      all(); RF = true; relCache.clear();
      const c = S2.S.when(goal) ? { ok: true, path: [] } : chain([goal], S2.S, { max: MAX });
      if (c.ok && (!c.path.length || replay(c.path, S2.S).ok)) how = c.path.length ? `${c.path.length} moves from slice 2's end ("${c.path[c.path.length - 1]}")` : 'slice 2';
      RF = false; relCache.clear();
    }
    if (!how && SF && SF.s && SF.s.when(goal)) how = 'slice 3 (the far end to the lift)';
    out.ways[f] = how || (u ? `not witnessed (${u.how})` : 'not witnessed');
    if (how) witnessed.add(f);
    say(`${how ? 'PASS' : 'MISS'} final way ${f}: ${out.ways[f]}`);
  }
  const P = proveLocks(witnessed);
  out.locks = P.locks;
  for (const L of P.locks) res(`final lock ${L.lock}: keys ${L.independent.join(', ')} independent and witnessed${L.witnessed.length > L.independent.length ? ` (+ ${L.witnessed.filter((k) => !L.independent.includes(k)).join(', ')} confirming)` : ''}; no articulation point among ${Object.keys(L.knockouts).length} support nodes`, !L.fails.length, { fails: L.fails });
  for (const f of P.fails) console.log(`ERROR ${f}`);
  // the 72 branches, from the real lift when slice 3 reached it (else n's stubs)
  const { solveChoices72 } = await import('./story-solve-endings.mjs');
  const C = await solveChoices72({ from: SF ? SF.s.doc : null });
  out.choices = { total: C.total, branches: C.branches, producers: C.producers, hooks: C.hooks, fails: C.fails.slice(0, 50), rows: C.rows };
  res(`final endings: ${C.branches} of ${C.total} climax branches played (Tauno ×2, Sheila ×2, Denny ×3, Aili ×2, Brekke ×3), each × north × meeting × Maggie: J and M in every one, JN wherever north`, C.ok, { fails: C.fails.slice(0, 20) });
  for (const f of C.fails.slice(0, 20)) console.log(`ERROR endings ${f}`);
}
// final: end

// --- run ----------------------------------------------------------------------------------------------------------------------
await buildSetters();
if (arg('chain', false)) { const c = chain(String(arg('chain')).split(';;')); console.log(c.ok, c.fail, c.states, c.capped, c.path); if (!c.ok) { for (const m of moves(c.S)) console.log('  ', m.kind, m.id); console.log(Object.keys(c.S.s.doc.facts).join(' '), c.S.trips, c.S.conv); } process.exit(0); }

const t0 = Date.now();
const report = { witnesses: [], plan: null, articulation: [], branches: {}, fallbacks: [], reentry: [], fail: [] };
const say = (...a) => { if (!QUIET) console.log(...a); };
const res = (name, pass, more = {}) => { (pass ? say : console.log)(`${pass ? 'PASS' : 'FAIL'} ${name}`); if (!pass) report.fail.push({ name, ...more }); return pass; };

// 1 the main line: every slice fact in order, the end, and each fact's witness (its prefix, replayed)
const main = chain([...MAIN.map((g) => g.when), END]);
report.plan = main.path;
if (arg('plan-only', false)) { if (!main.ok) { console.log(`no plan: stuck at '${main.fail}'`); process.exit(1); } main.path.forEach((m, i) => console.log(`${String(i + 1).padStart(3)}. ${m}`)); process.exit(0); }
if (arg('chain2', false)) { // (join c2: one chain of slice-2 goals from where slice 1 ends; where it stuck and what was on offer)
  const r1 = replay(main.path); on2(); const c = chain(String(arg('chain2')).split(';;'), r1.S);
  console.log(c.ok, c.fail, c.states, c.capped, c.path); if (!c.ok) { for (const m of moves(c.S)) console.log('  ', m.kind, m.id); console.log(Object.keys(c.S.s.doc.facts).join(' '), c.S.trips, c.S.conv, c.S.r2); } process.exit(0);
}
if (arg('plan-only2', false)) { // (join c2: slice 2's plan from where slice 1 ends; story-slice --plan slice2)
  const r1 = main.ok ? replay(main.path) : null; if (!r1 || !r1.ok) { console.log(`no plan: slice 1 stuck at '${main.fail}'`); process.exit(1); }
  on2(); const c = chain([...MAIN2.map((g) => g.when), END2], r1.S);
  if (!c.ok) { console.log(`no plan: slice 2 stuck at '${c.fail}' (${c.states} states${c.capped ? ', capped' : ''})`); process.exit(1); }
  c.path.forEach((m, i) => console.log(`${String(i + 1).padStart(3)}. ${m}`)); process.exit(0);
}
// j1: begin: --plan-end J|JN|M (story-slice --plan end.J / end.M): the whole season to the chosen ending, fast (no proofs):
// slice 1 and 2 as the solver plays them (counted), slice 3's moves to the lift (numbered), the run, the dawn lot's choices
if (arg('plan-end', false)) {
  const want = String(arg('plan-end')).replace(/^end\./, '');
  const r1 = main.ok ? replay(main.path) : null; if (!r1 || !r1.ok) { console.log(`no plan: slice 1 stuck at '${main.fail}'`); process.exit(1); }
  on2(); const c2 = chain([...MAIN2.map((g) => g.when), END2], r1.S);
  if (!c2.ok) { console.log(`no plan: slice 2 stuck at '${c2.fail}'`); process.exit(1); }
  report.slice2 = { end: replay(c2.path, r1.S) };
  const S3 = sliceFar(report.slice2.end);
  if (!S3) { console.log('no plan: slice 3 never reached the lift'); process.exit(1); }
  const { solveEndings } = await import('./story-solve-endings.mjs');
  const E = solveEndings({ from: S3.s.doc });
  const row = E.rows.find((r) => r.paths && r.paths[want]);
  if (!row) { console.log(`no plan: end.${want} not reachable from the real lift (${E.fails.join('; ')})`); process.exit(1); }
  console.log(`\nend.${want}: slice 1 ${main.path.length} moves, slice 2 ${c2.path.length} moves, then:`);
  let i = 0; for (const m of report.sliceFar.plan) console.log(`${String(++i).padStart(3)}. ${m}`);
  console.log(`${String(++i).padStart(3)}. the run: the cans carried out to a served lot by first light (${row.branch})`);
  for (const t of row.paths[want]) console.log(`${String(++i).padStart(3)}. the dawn lot: ${t}`);
  console.log(`story-solve --plan-end ${want}: ${i} moves after slice 2`);
  process.exit(0);
}
// j1: end
res(`the slice end to end: ${main.ok ? `${main.path.length} moves` : `stuck at '${main.fail}' (${main.states} states${main.capped ? ', capped' : ''})`}`, main.ok, { at: main.fail || null });
const rp = main.ok ? replay(main.path) : null;
res('the plan replays on a fresh story, every move on offer where it is played', !!(rp && rp.ok && rp.S.when(END)), { at: rp && rp.at });
// a3: --only-a3: slice 1's plan, then slice A3 alone (a stream's quick check; the join runs everything)
if (arg('only-a3', false)) { await slice3(main, rp); console.log(`story-solve --only-a3: ${report.fail.length ? `${report.fail.length} FAIL` : 'all pass'}`); for (const f of report.fail) console.log('FAIL', f.name, f.at || ''); process.exit(report.fail.length ? 1 : 0); }
// final: --only-final: slice 1's plan, slice 2's (fast, no proofs) and slice 3 to the lift, then the Round 6 gates alone
if (arg('only-final', false)) {
  on2(); const c2 = rp && rp.ok ? chain([...MAIN2.map((g) => g.when), END2], rp.S) : null;
  const S2 = c2 && c2.ok ? replay(c2.path, rp.S) : null; R2 = false; relCache.clear();
  report.slice2 = { end: S2 };
  const SF = S2 ? sliceFar(S2) : null;
  await finalGates(rp, S2, SF);
  console.log(`story-solve --only-final: ${report.fail.length ? `${report.fail.length} FAIL` : 'all pass'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); for (const f of report.fail) console.log('FAIL', f.name, f.at || '');
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
  process.exit(report.fail.length ? 1 : 0);
}
for (const g of SLICE) {
  let path = null, n = -1;
  if (!g.branch && main.ok) { n = firstTrue(main.path, g.when); path = n >= 0 ? main.path.slice(0, n) : null; }
  if (g.branch || n < 0) { const c = chain([...(g.via || []), g.when]); if (c.ok) { path = c.path; n = c.path.length; } }
  const ok = !!path && replay(path).ok && replay(path).S.when(g.when);
  report.witnesses.push({ step: g.step, id: g.id, when: g.when, moves: path ? path.length : null, last: path && path.length ? path[path.length - 1] : null, path });
  if (!g.soft) res(`witness: step ${g.step} ${g.id}${path ? ` (${path.length} moves; made by "${path[path.length - 1] || 'the start'}")` : ''}`, ok, { when: g.when });
}
if (rp && rp.ok) { const lines = rp.S.s.walt(); report.waltLines = lines; res(`the Walt page at the slice's end holds about ten lines or more (${lines.length})`, lines.length >= 9, { lines }); }

// 2 the porch fallbacks
{
  const A = chain(['f:bundle.taken', 'f:nb.found', 'f:tauno.armed']).S;
  const at = (wn) => castSlot(A, 'tauno', WORLD[wn]);
  const day = at('homeDay'), truck = at('noPorchDay'), dark = at('homeDark'), winter = at('farmWinter');
  report.fallbacks.push({ id: 'porch', day: day && day.id, truck: truck && truck.id, dark: dark && dark.id, winter: winter && winter.id });
  res('fallback: armed, a daylight walkout puts Tauno at the porch foot (T1)', !!day && day.id === 'porch' && porchEntry(A.s, day.scene) === 'T1');
  res('fallback: a store with no porch (Sawbill): the same walkout, by his truck (CAST noPorch)', !!truck && truck.id === 'porch' && CAST.tauno.noPorch === 'truck');
  res('fallback: after dark nobody stops you; the next daylight walkout does', !dark && !!day);
  res('fallback: May and after October the porch plays all the same (its slot has no month)', !!winter && winter.id === 'porch');
  const R = chain(['f:bundle.taken', 'f:nb.found', 'f:tauno.armed', 'f:door.crews.taken', 'f:crews.seen']).S;
  const months = [];
  for (let mo = 1; mo <= 12; mo++) {
    const ws = [{ ep: FARM, daylight: true, month: mo, hour: 8 }, { ep: FARM, daylight: true, month: mo, hour: 12 }, { ep: HOME, daylight: true, month: mo, hour: 8 }];
    const hit = ws.map((w) => castSlot(R, 'tauno', w)).find((sl) => sl && porchEntry(R.s, sl.scene) === 'U1');
    months.push(hit ? hit.id : null);
  }
  report.fallbacks.push({ id: 'the turn, by month', months });
  res(`fallback: the turn has a porch in every month (${months.map((m, i) => `${i + 1}:${m}`).join(' ')})`, months.every(Boolean));
  const D = chain(['f:bundle.taken', 'f:nb.found', 'f:tauno.armed', 'f:tauno.porch.declined1', 'f:tauno.porch.declined2']).S;
  const cm = [];
  for (let mo = 1; mo <= 12; mo++) { const sl = castSlot(D, 'tauno', { ep: FARM, daylight: true, month: mo, hour: 8 }); cm.push(sl ? sl.id : null); }
  report.fallbacks.push({ id: '"Changed your mind?", by month', months: cm });
  res(`fallback: after two declines, Farm's porch of a morning, May–October (${cm.map((m, i) => `${i + 1}:${m || '-'}`).join(' ')}; out of season it waits for May)`, cm.slice(4, 10).every((m) => m === 'changed'));
}

// 3 re-entry from every decline: the decline reached, then the rest of the main line to the end
for (const dcl of DECLINES) {
  const to = chain(dcl.via);
  if (!to.ok) { res(`re-entry: ${dcl.id}: the decline is reachable`, false, { at: to.fail }); report.reentry.push({ id: dcl.id, reached: false, at: to.fail }); continue; }
  const rest = MAIN.map((g) => g.when).filter((w) => !to.S.when(w) || true);
  const back = chain([...rest.filter((w) => !/^f:tauno\.porch\.warm/.test(w)), END], to.S);
  const ok = back.ok && replay(back.path, to.S).ok;
  report.reentry.push({ id: dcl.id, reached: true, to: to.path.length, back: back.ok ? back.path.length : null, at: back.fail || null, path: back.ok ? back.path : null });
  res(`re-entry: ${dcl.id} (${to.path.length} moves), then the slice's end in ${back.ok ? back.path.length : '—'} moves${back.ok ? '' : ` (stuck at '${back.fail}')`}`, ok);
}

// 4 branches: for each slice fact, the moves that made it true across every chain the solver ran
{
  const runs = [main.ok ? { path: main.path, from: null } : null, ...report.reentry.filter((r) => r.path).map((r) => ({ path: r.path, via: DECLINES.find((d) => d.id === r.id).via }))].filter(Boolean);
  for (const g of SLICE) report.branches[g.id] = new Set();
  for (const g of SLICE) { const w = report.witnesses.find((q) => q.id === g.id); if (w && w.last) report.branches[g.id].add(w.last); }
  for (const r of runs) {
    const from = r.via ? chain(r.via).S : null;
    for (const g of SLICE) { const n = firstTrue(r.path, g.when, from); if (n > 0) report.branches[g.id].add(r.path[n - 1]); }
  }
  for (const k of Object.keys(report.branches)) report.branches[k] = [...report.branches[k]].sort();
  const multi = Object.entries(report.branches).filter(([, v]) => v.length > 1);
  say(`branches: ${multi.length} slice facts made true by more than one move (${multi.map(([k, v]) => `${k}: ${v.length}`).join(' · ')})`);
}

// 5 articulation: the facts set on every path the solver found to the end; each then blocked (any way to set it), and the
// end searched for again: still unreachable is an articulation point of the slice (as far as the solver searches)
if (main.ok) {
  const ends = [rp.S, ...report.reentry.filter((r) => r.path).map((r) => replay(r.path, chain(DECLINES.find((d) => d.id === r.id).via).S).S)];
  const RE = relevant(END); const common = Object.keys(rp.S.s.doc.facts).filter((k) => RE.has(`f:${k}`) && ends.every((E) => E.s.has(k)) && !/\.said\.|^asked\.walt\.|^tier\.|^key\./.test(k));
  for (const k of common) {
    const rx = new RegExp(`(^|[^.\\w])f:${k.replace(/\./g, '\\.')}(?=$|[^.\\w])`, 'g');
    const c = chain([...ARTI, END].map((w) => w.replace(rx, '$1false')), null, { max: Math.min(MAX * 2, 20000), block: (T) => T.s.has(k) }); // (a way through that needs k is no way: 'false')
    report.articulation.push({ fact: k, articulation: !c.ok, ways: (report.branches[(SLICE.find((g) => new RegExp(`f:${k.replace(/\./g, '\\.')}\\b`).test(g.when)) || {}).id] || []).length || null });
  }
  const arts = report.articulation.filter((a) => a.articulation).map((a) => a.fact);
  say(`articulation (${arts.length} of ${common.length} facts on every path): ${arts.join(', ')}`);
  for (const must of ['nb.found', 'tauno.porch.done', 'crews.seen', 'tauno.turn']) res(`articulation: ${must} is on every path to the end`, arts.includes(must));
}

// 6 slice 2 (Round 2, the join): from where slice 1 ends
if (!arg('r1', false)) await slice2(main, rp);
// j1: begin: slice 3 (Round 3's far end, from where slice 2 ends): the R3 keys and the pit's lift
let SFEND = null;
const S2END = report.slice2 && report.slice2.end; // final: kept for the lock proof (sliceFar drops it from the report)
if (!arg('r1', false) && !arg('r2', false)) SFEND = sliceFar(S2END);
// j1: end
// a3: the guiding years (Round 4), from where slice 1 ends
if (!arg('r1', false) && !arg('no-a3', false)) await slice3(main, rp);

// n: begin — slice 3's endings (Round 3, stream n; Part 4 Round 3): J, JN and M reachable in every branch with producers
// by Round 3 (tauno.record ×2, the Walt page north or not, a meeting set or any served lot, Maggie met or a stranger),
// the epilogue's dated facts on the clock, walking out unchosen (scripts/story-solve-endings.mjs)
{
  const { solveEndings } = await import('./story-solve-endings.mjs');
  const E = solveEndings(); report.endings = { rows: E.rows.map(({ paths, ...r }) => r), epilogue: E.epilogue, fails: E.fails };
  // j1: the endings again from slice 3's own end (the real far end and lift, not n's stubs): its record as slice 2 left
  // it, north × meeting × Maggie met
  if (SFEND) {
    const E3 = solveEndings({ from: SFEND.s.doc });
    report.endings.real = { rows: E3.rows.map(({ paths, ...r }) => r), fails: E3.fails };
    for (const row of E3.rows) res(`endings from the real lift: ${row.branch}: J, ${row.JN === true ? 'JN, ' : ''}M reachable`, row.J && row.M && row.JN !== false);
    for (const f of E3.fails) res(`endings from the real lift: ${f}`, false);
  } else if (!arg('r1', false) && !arg('r2', false)) res('endings from the real lift: slice 3 reached the lift', false);
  for (const row of E.rows) res(`endings: ${row.branch}: J, ${row.JN === true ? 'JN, ' : ''}M reachable`, row.J && row.M && row.JN !== false);
  for (const f of E.fails) res(`endings: ${f}`, false);
  say(`endings: ${E.rows.length} branches, J/JN/M ${E.ok ? 'all reachable' : 'NOT all reachable'}; JN needs "went north" (by design)`);
}
// n: end
// p: begin — the company and the press (Round 6, stream p; scripts/story-solve-company.mjs): the call (and "Not yet." with
// the fallback), the midpoint and tier 3, the search, Wade, Josie's slip, Maggie (L1 D), the meeting set on the pad, the
// adrift and tier 4, Dan's card, offer and set-up, Brekke's three answers (the needle capped at 4), the endings from it
{
  const { solveCompany } = await import('./story-solve-company.mjs');
  const R = solveCompany(); report.company = { steps: R.steps, fails: R.fails };
  for (const st of R.steps) res(`company: ${st.id}`, st.ok);
  const { solveEndings } = await import('./story-solve-endings.mjs');
  const E = solveEndings({ from: R.doc });
  res('company: the endings (J and M) from the leech order\'s meeting', E.rows.some((r) => r.J) && E.rows.some((r) => r.M));
  say(`company: ${R.steps.length} steps, ${R.fails.length ? R.fails.join('; ') : 'all reachable'}`);
}
// p: end
// g: begin — the end games (wave 2, stream g; Part 3 #5-#6): after J every secret told and its episode ended, one a month;
// after M every owner softened, one per SOFT_GAP days (scripts/story-solve-endgames.mjs)
{
  const { solveEndgames } = await import('./story-solve-endgames.mjs');
  const Gr = solveEndgames(); report.endgames = Gr;
  res(`end games: J: ${Gr.J.told} secrets told, one a month (last +${Gr.J.last} d)`, Gr.J.told > 0 && !Gr.fails.some((f) => f.startsWith('J')));
  res(`end games: M: ${Gr.M.softened} owners softened in ${Gr.M.days} days`, Gr.M.softened > 0 && !Gr.fails.some((f) => f.startsWith('M')));
  for (const f of Gr.fails) res(`end games: ${f}`, false);
}
// g: end
// final: begin — the Round 6 gates on the full run
if (!arg('r1', false) && !arg('r2', false)) await finalGates(rp, S2END, SFEND);
// final: end
report.ms = Date.now() - t0;
if (PLAN && report.plan) { console.log('\nThe slice, as the solver plays it:'); report.plan.forEach((m, i) => console.log(`${String(i + 1).padStart(3)}. ${m}`)); }
if (PLAN && report.slice2 && report.slice2.plan) { console.log('\nSlice 2, as the solver plays it (from the end of slice 1):'); report.slice2.plan.forEach((m, i) => console.log(`${String(i + 1).padStart(3)}. ${m}`)); }
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
console.log(`story-solve: ${report.fail.length ? `${report.fail.length} FAIL` : 'all pass'} (${report.witnesses.length} slice facts, ${report.reentry.length} declines, ${(report.ms / 1000).toFixed(1)} s)`);
process.exit(report.fail.length ? 1 : 0);
