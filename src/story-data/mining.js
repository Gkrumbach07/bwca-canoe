// The mining years' scenes as data (story Round 2, stream A2; docs/story/30-mining-years.md §4.1–§4.10, §5): Tauno's
// Farm porch (the first Farm morning, the hub and its openers, the Kettle test and the crew map, the topics after it,
// the clean book's ask), the slab at the Little Gabbro road end (the confession), Len at the dock, Mary at the window
// and the back table, Tasha at the tailgate (the sampling day), her second meeting and the coda with Tauno, Brekke's
// handshake. Every line is an id into src/story-data/text/mining.json (topics.js T); the shape is topics.js SceneRun's,
// as porch-act1.js. Node only: no game imports, so story-lint.mjs, scripts/c2-mining-unit.mjs and the solver read it.
//
//   FARM · SLAB · LEN · MARY · TASHA · BREKKE   the scenes ({ id, who, nodes })
//   farmEntry(s, ctx) · lenEntry(s) · maryEntry(s, ctx) · tashaEntry(s, ctx)   where each starts, from where the story stands
//   OPENERS / CLOSERS / opener(s, ctx) / closer(s)   Tauno's openers by state (never the same twice running) and closers
//   SCHEDULE   the Farm cast's hours (30 §7 "Schedules"; owner calls 3 and 4)
//   STATIONS · KETTLE   the three sampling stations (Tasha's names) and the Kettle day's numbers
//   A2_SENSORS   the scene-condition names this arc reads from the live world (registered with story-cond)
//
// Facts this arc writes (facts.js // a2: rows; the person namespaces are bible §4's):
//   tauno.farm.met (the first Farm morning) · tauno.drilled (L1A) · knows.brm14 (L1B) · tauno.said.<topic> (each once) ·
//   tauno.kettle.wrong ("North of Gabbro, yes.") · tauno.crewmap + door.mining.yield + tauno.e7sketch (L6B) ·
//   stations.known · tauno.blazes (L5B) · tauno.pit (L6C) + knows.pit · tauno.ride.declined · tauno.ride ·
//   door.mining.climax · door.mining.done · tauno.record (a plain fact, never exclusive: owner call 2)
//   len.met · len.westpads.rings (L1A) · asked.len.walt (tier 1) · said.len.walt (the lie) · len.favour
//   mary.met · mary.lid.asked · mary.lid.given · mary.promised · mary.farend (L2A) · mary.table
//   tasha.met · kettle.bottles · kettle.fill.<station> · kettle.secchi · heard.background · kettle.done · kettle.rain ·
//   tasha.second · tasha.metTauno · brekke.met · brekke.seen
//   westpads.seen (L1C) · kettle.visited · kettle.lid · pietro.dig.seen · pietro.wronghill (L2C) (story-places.json and
//   rules-mining.js write those)
// the condition names the scenes read from their own context (cast.js args) or the world (kettle.js sensors)
export const A2_SENSORS = { rained: 'flag', kettlerun: 'flag', tashaHere: 'flag', bigNew: 'flag', belt: 'flag', kettlenotice: 'flag', kettleday: 'flag' }; // (join c2: + feed-weather.js's two the arc's flyer reads)

// --- the Kettle day ---------------------------------------------------------------------------------------------------
// the three stations, by Tasha's own names (30 §4.3 "The work"), each a stake in story-places.json `kettle`
export const STATIONS = [
  { id: 'up', ask: '30:4.3.c1', prop: 'kettle.up' },
  { id: 'trench', ask: '30:4.3.c2', prop: 'kettle.trench' },
  { id: 'pond', ask: '30:4.3.c3', prop: 'kettle.pond' },
];
export const KETTLE = {
  at: { x: -26950, z: 30600 },     // the provisional pad (owner call 11; 90 §13 check 1, scripts/c2-mining-unit.mjs reports it)
  secchi: 0.8,                     // m: the pond's clarity ("milky and orange-brown at under a metre", 30 §4.3)
  pay: 35,                         // $: "Field help, Kettle creek" at the trip's end (owner call 10: Tasha's pay:)
  notice: { from: 18, days: 5 },   // the notice: up from 18:00 of a forecast two-day rain's first day, until 5 days after it
  rainDay: 6,                      // hours of rain that make a day of rain (feed-weather.js)
  runDays: 2,                      // the creek runs orange this many days after the rain stops; else the stain only
  tasha: { hours: [7, 14], dows: [1, 2, 3, 4, 5] }, // the morning after the rain quits (a weekday), at the tailgate
};

// --- the Farm cast's hours (30 §7 "Schedules"; owner calls 3, 4) -------------------------------------------------------
export const SCHEDULE = {
  len: { dock: 'month:5-10 & hour:7-12 & !dow:thu', table: 'month:5-10 & dow:thu & hour:11-14' },
  mary: { window: 'month:5-10 & dow:tue|fri & hour:9-11' },
  brekke: { table: 'month:6-10 & dow:thu & hour:11-14' }, // (11:45–13:30: the cast holds him to the minute)
  tasha: { store: 'month:6-10 & dow:mon|tue|wed|thu|fri & hour:8-10 & f:kettle.done & days.since(kettle.done)>=1 & dayhash(tasha,3)=0' },
};

// --- Tauno's openers and closers (30 §4.1) -----------------------------------------------------------------------------
// by state, never the same twice running: the first that holds of the stateful ones, else one of the plain three by the
// day; after the climax one in three is "I slept." (30 §4.9 "The porch afterwards")
export const OPENERS = [
  { id: '30:4.9.15', when: 'f:door.mining.done', third: true },
  { id: '30:4.1.8', when: 'bigNew' },
  { id: '30:4.1.7', when: 'tier>=2' },
  { id: '30:4.1.6', when: 'rained' },
  { id: '30:4.1.5', when: 'belt' },
];
export const PLAIN_OPENERS = ['30:4.1.2', '30:4.1.3', '30:4.1.4'];
export const CLOSERS = { after: '30:4.1.37', plain: ['30:4.1.34', '30:4.1.35', '30:4.1.36'] };
// the opener for this visit: `when(expr)` reads the story with the cast's args; `last` the one said last; `n` the day's dice
export function opener({ when, last = null, n = 0 }) {
  const ok = (o) => o.id !== last && when(o.when);
  for (const o of OPENERS) { if (!ok(o)) continue; if (o.third && n % 3 !== 0) continue; return o.id; }
  const plain = PLAIN_OPENERS.filter((id) => id !== last);
  return plain[n % plain.length];
}
export function closer(s, n = 0) { return s.has('door.mining.done') ? CLOSERS.after : CLOSERS.plain[n % CLOSERS.plain.length]; }

// a line said without some of its words (the doc's two halves under one id, 30:4.1.1; the running and stained answers
// under 30:4.5.3)
const SIT_HALF = 'Good. Now we\'re two old fools looking at a parking lot. Nobody looks twice at that.';
export const FIRST_SAT = { id: '30:4.1.1', strip: 'You found it. Sit on the bench, not the step. The step\'s where people stand when they want me to notice them.' };
const STAINED = 'That\'s the stain. It never comes out. Go back after a rain sometime if you want to see it run.';
const RUNNING = 'Fifty years. Rock doesn\'t change its mind.';
const YIELD = 'f:door.mining.yield';

// --- 4.1 / 4.5 / 4.9 Tauno at Farm, after the turn ---------------------------------------------------------------------
export const FARM = {
  id: 'farm', who: 'tauno',
  nodes: {
    // the first Farm morning (once): "Sit on the bench, not the step." (his second half when you sit: cast.js, FIRST_SAT)
    first: { say: [{ id: '30:4.1.1', strip: SIT_HALF }], then: ['f:tauno.farm.met', 'f:door.mining.open'], to: 'hub' },
    // a morning: his opener (by state), then the hub
    morning: { say: [{ hook: 'opener' }], to: 'hub' },
    hub: { go: [
      { ask: '30:4.1.c1', say: ['30:4.1.9'], to: 'outfit' },
      { ask: '30:4.1.c5', once: 'brm14', when: 'carrying:waltpack | f:knows.boreal', say: ['30:4.1.13'], then: ['f:knows.brm14'] },
      // (Two Stump and V.'s water: the seat's own, one once each wherever they are asked, porch-act1.js seat)
      { ask: '30:4.1.c6', once: 'seat.twostump', when: 'nickseen:twostump & !f:ink.twostump & !und:NB31', to: 'twostump' },
      { ask: '30:4.1.c9', once: 'seat.vwater', when: 'nickseen:vwater & !f:ink.vwater & !und:NB20', say: ['30:4.1.17'], then: ['f:knows.vwater'] },
      { ask: '30:4.1.c10', when: 'f:tauno.turn', say: ['30:4.1.18'], to: 'eino' },
      { ask: '30:4.1.c14', say: ['30:4.1.22'], to: 'walt' },
      { ask: '30:4.1.c18', when: 'met:len>=1', say: [{ first: [{ id: '30:4.1.27', when: `${YIELD} | met:len>=3` }, '30:4.1.26'] }], to: 'len' },
      { ask: '30:4.1.c20', when: 'f:mary.met | f:mary.seen', once: 'mary', say: ['30:4.1.29'] },
      // "The pads": after the crews' landing, and a porch visit since 1.3 (the first Farm morning is one)
      { ask: '30:4.1.c21', once: 'pads', when: 'f:crews.seen & f:tauno.farm.met', say: ['30:4.1.30'], to: 'pads' },
      // after the map (30 §4.5 "After the map, new topics on the porch")
      { ask: '30:4.5.c6', once: 'stations', when: YIELD, say: ['30:4.5.6'], then: ['f:stations.known', 'walt:30:4.5.w1'], to: 'stations' },
      { ask: '30:4.5.c9', once: 'chkd', when: YIELD, say: ['30:4.5.8'], then: ['f:said.tauno.chkd'] },
      { ask: '30:4.5.c10', once: 'e7', when: YIELD, say: ['30:4.5.9'], to: 'e7' },
      { ask: '30:4.5.c12', once: 'sketch', when: `${YIELD} & f:pietro.dig.seen`, say: ['30:4.5.11'], then: ['walt:30:4.5.w3'] },
      // "On the record" (30 §4.9): any later porch visit, before the cellar is lifted; the same answer and the flag
      { ask: '30:4.9.record.1', when: 'f:door.mining.climax & !f:tauno.record & !f:run.lifted', say: ['30:4.9.11'], then: ['f:tauno.record', 'walt:30:4.9.w1'] },
      { ask: '30:4.1.c24', say: ['30:4.1.33'] }] },
    outfit: { hub: 'hub', go: [
      { ask: '30:4.1.c2', once: 'outfit.where', say: ['30:4.1.10'], then: ['f:tauno.drilled', 'walt:30:4.1.w1'] },
      { ask: '30:4.1.c3', once: 'outfit.did', say: ['30:4.1.11'], then: ['f:said.tauno.never'] },
      { ask: '30:4.1.c4', once: 'outfit.why', say: ['30:4.1.12'] }] },
    twostump: { say: ['30:4.1.14'], go: [
      { ask: '30:4.1.c7', say: ['30:4.1.15'], then: ['f:knows.twostump'], to: 'hub' },
      { ask: '30:4.1.c8', say: ['30:4.1.16', '30:4.1.15'], then: ['f:knows.twostump'], to: 'hub' }] },
    eino: { hub: 'hub', go: [
      { ask: '30:4.1.c11', once: 'eino.want', say: ['30:4.1.19'] },
      // owner call 6: the Walt-page line now; Ollie's lead and its ring wait for S1 (Round 4)
      { ask: '30:4.1.c12', once: 'eino.found', say: ['30:4.1.20'], then: ['walt:30:4.1.w2'] },
      { ask: '30:4.1.c13', once: 'eino.canoe', say: ['30:4.1.21'], then: ['walt:30:4.1.w3'], end: true }] },
    walt: { hub: 'hub', go: [
      { ask: '30:4.1.c15', once: 'walt.why', say: ['30:4.1.23'], then: ['walt:30:4.1.w4'] },
      { ask: '30:4.1.c16', once: 'walt.way', say: ['30:4.1.24'] },
      { ask: '30:4.1.c17', once: 'walt.where', say: ['30:4.1.25'] }] },
    len: { hub: 'hub', go: [
      { ask: '30:4.1.c19', once: 'len.lunch', when: `${YIELD} | met:len>=3`, say: ['30:4.1.28'], then: ['walt:30:4.1.w5', 'f:knows.thursday'] }] },
    pads: { hub: 'hub', go: [
      { ask: '30:4.1.c22', once: 'pads.mean', say: ['30:4.1.31'] },
      { ask: '30:4.1.c23', once: 'pads.you', say: ['30:4.1.32'] }] },
    stations: { hub: 'hub', go: [{ ask: '30:4.5.c7', once: 'stations.bg', say: ['30:4.5.7'] }] },
    e7: { hub: 'hub', go: [
      { ask: '30:4.5.c11', once: 'e7.pit', say: ['30:4.5.10'], then: ['f:tauno.blazes', 'f:tauno.pit', 'f:knows.pit', 'walt:30:4.5.w2'] }] },

    // 4.5 the test: "Kettle pad. That's up by the river, north of Gabbro, isn't it." (the scene ends on the wrong answer
    // and replays on the next visit)
    well: { say: ['30:4.5.1'], go: [
      { ask: '30:4.5.c1', say: ['30:4.5.2'], to: 'well2' },
      { ask: '30:4.5.c4', say: ['30:4.5.4'], then: ['f:tauno.kettle.wrong'], end: true }] },
    well2: { go: [
      { ask: '30:4.5.c2', when: 'f:kettle.rain', say: [{ id: '30:4.5.3', strip: STAINED }], to: 'map' },
      { ask: '30:4.5.c3', when: '!f:kettle.rain', say: [{ id: '30:4.5.3', strip: RUNNING }], to: 'map' }] },
    // the crew map from the glovebox: the book's Pages (B's givePage), the yield, the mirrored sketch (L6B)
    map: { say: ['30:4.5.5'], then: ['give:page.crewmap', 'f:tauno.crewmap', 'f:door.mining.yield', 'f:tauno.e7sketch'], to: 'hub' },

    // 4.9 the ask ("You doing anything this morning?"): "Not today." ends it and he asks again, the same words, next visit
    ask: { say: ['30:4.9.1'], go: [
      { ask: '30:4.9.c1', then: ['f:tauno.ride', 'do:ride'], end: true },
      { ask: '30:4.9.c2', say: ['30:4.9.2'], then: ['f:tauno.ride.declined'], end: true }] },
  },
};

// the director's climax spacing (D, beats.js: the sensor climax:mining; the join): the clean book's ask (the way to the
// climax) waits a trip when another arc's climax opened this trip or last. With no director (Node: the solver) it holds
const spaced = (s) => !(s.sensors instanceof Map && s.sensors.has('climax')) || s.readSensor('climax', 'mining') !== false;
// where Tauno's Farm scene starts (cast.js, the solver): ctx { asked: the ask already made this visit, porchVisit:
// a porch visit since the map (a later day), lovelyBook: Brekke's "lovely book" heard }
export function farmEntry(s, ctx = {}) {
  if (!s.has('tauno.farm.met')) return 'first';
  if (s.has('door.mining.yield') && !s.has('tauno.ride') && !ctx.asked && (ctx.porchVisit || s.has('brekke.lovelybook')) && spaced(s)) return 'ask';
  if (s.has('kettle.visited') && !s.has('door.mining.yield')) return 'well';
  return 'morning';
}

// --- 4.9 the road end: the slab, the pole, the landing rock -------------------------------------------------------------
export const SLAB = {
  id: 'slab', who: 'tauno',
  nodes: {
    // Tasha's truck in the lot: he stays in the pickup until it goes (30:4.9.3–4)
    wait: { say: ['30:4.9.3', '30:4.9.4'], then: ['f:tasha.seenByTauno'], end: true },
    // on the slab: the core shed, the party line (then the dot is free: the pole, the slab, the landing rock)
    core: { say: ['30:4.9.5'], then: ['f:tauno.slab'], end: true },
    // back to him: the five questions in any order, "Why now?" last; all five before the choice
    q: { go: [
      { ask: '30:4.9.c3', once: 'q.wrote', say: ['30:4.9.6'], then: ['f:lie.tauno.never'] },
      { ask: '30:4.9.c4', once: 'q.canoe', say: ['30:4.9.7'] },
      { ask: '30:4.9.c5', once: 'q.papers', say: ['30:4.9.8'] },
      { ask: '30:4.9.c6', once: 'q.after', say: ['30:4.9.9'] },
      { ask: '30:4.9.c7', once: 'q.why', when: 'count(tauno.said.q.*)>=4', say: ['30:4.9.10'], to: 'choice' }] },
    choice: { go: [
      { ask: '30:4.9.c8', say: ['30:4.9.11'], then: ['f:tauno.record', 'walt:30:4.9.w1'], to: 'gives' },
      { ask: '30:4.9.c9', say: ['30:4.9.12'], to: 'gives' },
      { ask: '30:4.9.c10', say: ['30:4.9.13'], to: 'gives' }] },
    // in every branch: the five Walt-page lines, the climax and the arc done; then the drive home (cast.js 'home')
    gives: { then: ['walt:30:4.9.page.1', 'walt:30:4.9.page.2', 'walt:30:4.9.page.3', 'walt:30:4.9.page.4', 'walt:30:4.9.page.5', 'f:door.mining.climax', 'f:door.mining.done', 'do:home'], end: true },
  },
};
export function slabEntry(s, ctx = {}) {
  if (ctx.tashaHere && !s.has('tauno.slab')) return 'wait';
  if (!s.has('tauno.slab')) return 'core';
  return s.keys('tauno.said.q.').length >= 5 ? 'choice' : 'q';
}

// --- 4.2 Len at the dock, or the café on Thursdays ----------------------------------------------------------------------
export const LEN = {
  id: 'len', who: 'len',
  nodes: {
    first: { say: ['30:4.2/len-saari-first-meeting.1'], then: ['f:len.met'], to: 'hub' },
    hub: { go: [
      // three rings in his voice: the landing, the grade, the west pads (true and public: L1A); a ring Len draws goes into
      // his next Thursday report (Round 6's canary reads len.westpads.rings)
      { ask: '30:4.2/len-saari-first-meeting.c1', once: 'crews', say: ['30:4.2/len-saari-first-meeting.2'], then: ['do:rings', 'f:len.westpads.rings'] },
      // tier 1 is the asking (owner call 1: Round 0's rule), and the lie heard
      { ask: '30:4.2/len-saari-first-meeting.c2', once: 'walt', say: ['30:4.2/len-saari-first-meeting.3'], then: ['f:asked.len.walt', 'f:said.len.walt'] },
      { ask: '30:4.2/len-saari-first-meeting.c3', once: 'eino', when: 'f:knows.eino', say: ['30:4.2/len-saari-first-meeting.4'], then: ['walt:30:4.2/len-saari-first-meeting.w2'] },
      { ask: '30:4.2/len-saari-first-meeting.c4', once: 'now', say: ['30:4.2/len-saari-first-meeting.6', '30:4.2.1.1'], then: ['f:len.favour', 'do:favour'] },
      { ask: '30:4.2/len-saari-first-meeting.c5', once: 'elsie', when: 'f:len.said.now', say: ['30:4.2/len-saari-first-meeting.7'], then: ['f:len.elsie'] },
      // the canary (bible 5.7): a real lake picked, told.len kept; nothing leaks this round
      { ask: '30:4.2/len-saari-first-meeting.c6', say: ['30:4.2/len-saari-first-meeting.8'], then: ['do:pick'] }] },
  },
};
export function lenEntry(s) { return s.has('len.met') ? 'hub' : 'first'; }

// --- 4.2 Mary at the window; 4.4 the back table -------------------------------------------------------------------------
export const MARY = {
  id: 'mary', who: 'mary',
  nodes: {
    first: { say: ['30:4.2/mary-pelto-first-meeting.1'], then: ['f:mary.met'], to: 'hub' },
    hub: { go: [
      { ask: '30:4.2/mary-pelto-first-meeting.c1', once: 'office', say: ['30:4.2/mary-pelto-first-meeting.2'], then: ['f:said.mary.never'] },
      { ask: '30:4.2/mary-pelto-first-meeting.c2', once: 'leo', say: ['30:4.2/mary-pelto-first-meeting.3'], to: 'leo' },
      // the tell, later: "Where did Leo hear 'naturally mineralised'?" once Tasha's "background" is heard
      { ask: '30:4.2/mary-pelto-first-meeting.c5', once: 'mineral', when: 'f:mary.said.like & f:heard.background', say: ['30:4.2/mary-pelto-first-meeting.6'], then: ['walt:30:4.2/mary-pelto-first-meeting.w1'], end: true },
      { ask: '30:4.2/mary-pelto-first-meeting.c6', once: 'boys', say: ['30:4.2/mary-pelto-first-meeting.7'] }] },
    leo: { hub: 'hub', go: [
      { ask: '30:4.2/mary-pelto-first-meeting.c3', once: 'boxes', say: ['30:4.2/mary-pelto-first-meeting.4'], then: ['f:mary.lid.asked', 'do:lid'] },
      { ask: '30:4.2/mary-pelto-first-meeting.c4', once: 'like', say: ['30:4.2/mary-pelto-first-meeting.5'], to: 'like' }] },
    like: { hub: 'hub', go: [
      { ask: '30:4.2/mary-pelto-first-meeting.c5', once: 'mineral', when: 'f:heard.background', say: ['30:4.2/mary-pelto-first-meeting.6'], then: ['walt:30:4.2/mary-pelto-first-meeting.w1'], end: true }] },
    // 4.4 the lid given (E's show.js Give; A2's want): she turns it to the stamp
    table: { say: ['30:4.4.1', '30:4.4.2'], then: ['f:mary.lid.given', 'f:mary.table.begun'], go: [
      { ask: '30:4.4.c1', once: 'table.wrong', say: ['30:4.4.3'] },
      { ask: '30:4.4.c2', once: 'table.why', say: ['30:4.4.4'], to: 'papers' }] },
    papers: { say: ['30:4.4.5'], go: [{ ask: '30:4.4.c3', say: ['30:4.4.6'], then: ['walt:30:4.4.w1'], to: 'lp' }] },
    lp: { say: ['30:4.4.7'], then: ['walt:30:4.4.w2'], go: [
      { ask: '30:4.4.c4', say: ['30:4.4.8'], then: ['f:mary.promised'], to: 'farend' },
      { ask: '30:4.4.c5', say: ['30:4.4.9'], to: 'farend' }] },
    // the lake key (L2A), the arc's second big finding (owner call 12: the fact written, the count left)
    farend: { say: ['30:4.4.10'], then: ['f:mary.farend', 'walt:30:4.4.w3', 'f:mary.table'], end: true },
  },
};
// ctx.give: the lid handed over now (the want)
export function maryEntry(s, ctx = {}) {
  if (ctx.give && s.has('kettle.lid') && !s.has('mary.lid.given')) return 'table';
  if (s.has('mary.lid.given') && !s.has('mary.table')) return 'papers';
  return s.has('mary.met') ? 'hub' : 'first';
}
// the want Mary has (E's show.js reads it: the dot on her offers Give with the lid carried)
export const WANTS = [{ who: 'mary', item: 'leolid', when: 'f:kettle.lid & !f:mary.lid.given', scene: 'table' }];

// --- 4.3 Tasha at the tailgate; 4.10 her second meeting and the coda ----------------------------------------------------
export const TASHA = {
  id: 'tasha', who: 'tasha',
  nodes: {
    meet: { say: ['30:4.3.1'], then: ['f:tasha.met', 'do:bottles'], to: 'hub' },
    // the talk while working: open throughout, any order, at any station
    hub: { go: [
      { ask: '30:4.3.c4', once: 'orange', say: ['30:4.3.2'] },
      { ask: '30:4.3.c5', once: 'company', say: ['30:4.3.3'] },
      { ask: '30:4.3.c6', once: 'background', say: ['30:4.3.4'], then: ['f:heard.background'], to: 'bg' },
      { ask: '30:4.3.c8', once: 'book', say: ['30:4.3.6'] },
      { ask: '30:4.3.c9', once: 'where', say: ['30:4.3.7'] }] },
    bg: { hub: 'hub', go: [{ ask: '30:4.3.c7', once: 'bg2', say: ['30:4.3.5'], then: ['walt:30:4.3.w1'] }] },
    // the bottles handed back at the tailgate: she closes it (the pay at the trip's end, owner call 10)
    done: { say: ['30:4.3.9'], then: ['f:kettle.done', 'f:kettle.rain', 'walt:w.kettle.orange', 'pay:35@30:4.3.pay.1', 'card:30:4.3.pay.2', 'do:back'], end: true }, // (join c2: the trip card's story line names the Kettle pad, D's card:; the doc has no card line of its own, so its Walt line)
    // 4.10 any time after the creek day: "Cooler hand. How's your back?"
    second: { say: ['30:4.10.7'], go: [{ ask: '30:4.10.c3', once: 'note', say: ['30:4.10.8'], then: ['walt:30:4.10.w1', 'f:tasha.second'], end: true }] },
    // 4.10 the coda: Tauno comes in behind you at the coffee (the climax done, the creek worked with her)
    coda: { say: [{ id: '30:4.10.1', by: 'Tauno' }, '30:4.10.2', { id: '30:4.10.3', by: 'Tauno' }, '30:4.10.4'], go: [
      { ask: '30:4.10.c1', say: ['30:4.10.5'], then: ['f:tasha.metTauno'], end: true },
      { ask: '30:4.10.c2', say: ['30:4.10.6'], then: ['f:tasha.metTauno'], end: true }] },
  },
};
// ctx.at: 'kettle' (the tailgate) | 'store'; ctx.filled: the three bottles filled
export function tashaEntry(s, ctx = {}) {
  if (ctx.at === 'kettle') {
    if (!s.has('tasha.met')) return 'meet';
    if (ctx.filled && !s.has('kettle.done')) return 'done';
    return 'hub';
  }
  if (s.has('door.mining.done') && s.has('kettle.done') && !s.has('tasha.metTauno') && ctx.taunoNear) return 'coda';
  if (s.has('kettle.done') && !s.has('tasha.second')) return 'second';
  return null;
}
// what she says when she sees you take the lid (30:4.3.8) and the keeper's two lines about the notice (30:4.3.keeper)
export const TASHA_LID = '30:4.3.8';
export const KEEPER_NOTICE = ['30:4.3.keeper.1', '30:4.3.keeper.2'];

// --- 4.6 Brekke: Thursdays at the corner table with Len (owner call 3), the handshake below tier 2 ----------------------
export const BREKKE = {
  id: 'brekke', who: 'brekke',
  nodes: { hand: { say: ['30:4.6.brekke.hand'], then: ['f:brekke.met'], end: true } },
};
// the sight of the two of them at the table: the Walt-page line (owner call 4)
export const THURSDAY_LINE = '30:4.6/the-thursday-lunch-tier.w1';

// --- the crew map (30 §4.5 "The item"): its labels, by id (mining-items.js draws the page from these) -------------------
export const CREWMAP = { map: 'item.crewmap.map', inset: '30:4.5.c5', stations: 'item.crewmap.stations', corner: 'item.crewmap.corner' };
// the lid's stamp and the tally lines
export const WORDS = { stamp: 'item.leolid.stamp', fieldHelp: '30:4.3.pay.1', gas: '30:4.9.gas', notice: '30:4.3.notice', wrongPhoto: '30:4.2.1.wrong', caption: '30:4.2.1.caption' };

// --- the Farm keeper's rings (30 §4.1: "The Farm keeper offers to ring …"; "rings 'the old grade' and 'the west pads'
// if Len hasn't already"), as topics.js keeper topics (topics.add). The player's question has no words in the docs: the
// label is the place's own name (a writers' leftover, as Round 1's easy nicknames); the keeper answers with the ring
export const KEEPER = [
  { id: 'a2.crewscountry', pri: 5.5, once: true, label: 'The old crews\' country?', when: 'f:tauno.drilled & ep:31',
    ring: { x: -26600, z: 28400, r: 2600, place: 'crewscountry', label: 'the old crews\' country' } },
  { id: 'a2.grade', pri: 5.5, once: true, label: 'The old grade?', when: 'f:tauno.said.pads & ep:31 & !f:len.westpads.rings',
    ring: { x: -25960, z: 30060, r: 220, place: 'grade', label: 'the old grade' } },
  { id: 'a2.westpads', pri: 5.5, once: true, label: 'The west pads?', when: 'f:tauno.said.pads & ep:31 & !f:len.westpads.rings',
    ring: { x: -26300, z: 30260, r: 520, place: 'westpads', label: 'the west pads' } },
];
