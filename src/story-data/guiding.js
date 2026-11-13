// The guiding years' scenes as data (story Round 4, stream A3; docs/story/31-guiding-years.md GY-01–GY-18): Marlys at
// the Moose Lake counter (the tent, her topics, the loft's favour, the night's ask, after the drift test, after Wade),
// Hap on the porch (the first sit, his topics, the 1986 day, what's there now, the tow landing's three answers, the
// real talk: the lake, 1977, Walt's names for lakes, the rock and the jigs), Nate, Sheila at the landing (page two, the
// overdue party, the drift test's arrangement, the statement), Rick (the swamper: the tow, Walt's rules, the canoe), the
// night in bunk 3 (GY-13, hour by hour: guiding-cast.js plays it on the clock through camp.js RestDial.stopsAt), Gus's
// lines and rings, Tauno's GY-17 topic and the Hog Creek keeper's GY-18. Every line is an id into
// src/story-data/text/guiding.json (topics.js T), or an a3 draft (drafts-a3.js) where the doc has no words; the shape is
// topics.js SceneRun's, as mining.js. Node only: no game imports (story-lint, the unit check and the solver read it).
//
//   MARLYS · HAP · NATE · SHEILA · RICK · NIGHT · STATEMENT   the scenes ({ id, who, nodes })
//   marlysEntry(s, ctx) · hapEntry(s, ctx) · sheilaEntry(s, ctx) · rickEntry(s) · nateEntry(s)   where each starts
//   NIGHT_HOURS   Marlys's hours (GY-13): the Rest dial stops at these and nothing else, each plays its node
//   GUS_LINES     Gus's one-line texture (GY-16); his rings are leads-guiding.js ASKS
//   GY_SENSORS    the scene-condition names this arc reads from the live world (registered with story-cond)
//   RAW           the anchored speeches whose words still carry the doc's quote marks and speaker (cleaned at load)
//
// Facts this arc writes (facts.js // a3: rows; the person namespaces are bible §4's, rick. and nate. added):
//   marlys.met · marlys.tent · marlys.loft · marlys.night (abs day) · marlys.north · said.marlys.week (the lie heard)
//   hap.met · hap.day · hap.tow.gentle|blunt|kind · hap.tow.right · hap.farend (L2A) · hap.1977 · hap.photo
//   sheila.met · sheila.report · sheila.wrote · sheila.overdue(.taken|.declined|.found|.paid) · sheila.in · sheila.statement
//   rick.met · rick.canoe · gy.tow.told · gy.* (places seen: story-places.json and guiding-cast.js write them)
//   door.guiding.open|yield|climax|done · choice.sheila = in | lie (exclusive) · drift.arranged (abs day; m runs the night)

// the condition names the scenes read from the live world (guiding-cast.js registers them as sensors)
export const GY_SENSORS = { southnight: 'flag', northwind2: 'flag', lampLit: 'flag', truckLooked: 'flag', nightNow: 'flag' };

// --- the people's hours (31 §4 "Who is where, when"; 13 #8) -------------------------------------------------------------
export const SCHEDULE = {
  marlys: 'month:5-10 & dow:tue|wed & hour:9-17',
  hap: 'date:06-08..09-07 & dow:sat|sun & hour:10-15',
  nate: { porch: 'date:06-08..09-07 & dow:sat|sun & hour:10-15', tow: 'month:5-9 & dow:mon|tue|wed|thu|fri & hour:8-17' },
  sheila: 'month:7-10 & dow:thu|fri|sat|sun & hour:13-18',
  rick: 'date:05-15..09-15 & (hour:5-7 | hour:18-21)',
};
// 31 §6 "When Marlys may first appear": after night one, and the porch with Tauno happened or declined twice
export const MARLYS_GATE = 'f:nb.found & (porch:done | porch:declined2)';

// the anchored speeches (Hap's day, the far end, 1977, the night): the extract keeps the doc's open quotes and the
// speaker's name at the head of a multi-paragraph speech; guiding-cast.js cleans these once at load (no words change)
export const RAW = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `31:GY-04.day.${n}`),
  '31:GY-06.far.1', '31:GY-06.far.2', '31:GY-06.far.3', '31:GY-06b.let.1', '31:GY-06b.let.2', '31:GY-06b.let.3',
  '31:GY-13.phone.1', '31:GY-13.phone.2', ...[1, 2, 3, 4, 5, 6].map((n) => `31:GY-13.six.${n}`),
];
export function speech(t) { return String(t || '').replace(/^[A-Z][A-Za-z]*:\s*/, '').replace(/"/g, '').replace(/\s{2,}/g, ' ').trim(); }

// --- the walt-page lines this arc writes, by place (the ids are text entries; walt-lines.js // a3: rows give sections)
export const WALT = {
  tent: '31:GY-01.close.2', boxed: '31:GY-01.fly.5', day: '31:page.2', rods: '31:page.3', farend: '31:GY-06.gives',
  let77: '31:GY-06b.w', pagetwo: '31:GY-09.gives.1', north: 'walt.nb.und.6', canoes: '31:GY-11.gives.3',
  alders: '31:GY-11.alders.1', stone: '31:GY-11.alders.2', waltway: '31:GY-11.waltway.1', initials: '31:GY-12.rafter.1',
  eino: '31:GY-12.rafter.2', twoWH: '31:GY-12.5', message: '31:GY-12.6', denny: '31:GY-12.c4', kept: '31:GY-12.c5',
  told: '31:GY-13.sheila.1', office: '31:GY-13.sheila.2', fallLake: '31:GY-17.w', hogCreek: '31:GY-18.w',
  rickCanoe: '31:GY-08.canoe.8', nb83: '31:GY-08.canoe.9',
};

// --- GY-01, GY-02, GY-12, GY-13 (the ask), GY-14, GY-15: Marlys at the counter -----------------------------------------
const FLY_SAY = ['31:GY-01.fly.2', '31:GY-01.fly.3', '31:GY-01.fly.4'];
export const MARLYS = {
  id: 'marlys', who: 'marlys',
  nodes: {
    // GY-01: the tent on you or carried. She speaks first
    tent: { say: ['31:GY-01.1'], then: ['f:marlys.tent'], go: [
      { ask: '31:GY-01.c1', say: [{ first: [{ id: '31:GY-01.5', when: 'home' }, '31:GY-01.2'] }], to: 'intro' },
      { ask: '31:GY-01.c2', say: ['31:GY-01.3'], to: 'intro' },
      { ask: '31:GY-01.c3', say: ['31:GY-01.4'], to: 'intro' }] },
    // "I'm Marlys." (without the tent the meeting starts here: a3 default, the doc has no other first line)
    intro: { say: ['31:GY-01.6'], then: ['f:marlys.met', 'f:door.guiding.open', { when: 'f:marlys.tent', then: ['walt:31:GY-01.close.2'] }], to: 'hub' },
    // a later day: her opener (one of three, by the day), then the hub
    again: { say: [{ hook: 'opener' }], to: 'hub' },
    hub: { go: [
      // GY-01's topics, each once
      { ask: '31:GY-01.c4', once: 'whose', say: ['31:GY-01.7'] },
      { ask: '31:GY-01.c5', once: 'what', say: ['31:GY-01.8'] },
      { ask: '31:GY-01.c6', once: 'week', say: ['31:GY-01.9'], then: ['f:said.marlys.week'] },
      { ask: '31:GY-01.fly.1', once: 'fly', when: 'f:nb.found', say: FLY_SAY, then: ['walt:31:GY-01.fly.5'] },
      // GY-02
      { ask: '31:GY-02.c1', once: 'frontroom', when: 'nickseen:frontroom & !f:ink.frontroom', say: ['31:GY-02.1'], then: ['f:knows.frontroom', 'ring:moose25'] },
      { ask: '31:GY-02.c2', once: 'bunkhouse', say: ['31:GY-02.2'] },
      { ask: '31:GY-02.c3', once: 'dock', say: ['31:GY-02.3'], then: ['f:knows.crib'] },
      { ask: '31:GY-02.c4', once: 'm', when: 'read:NB39 & !f:marlys.loft', say: ['31:GY-02.4'], to: 'loft' },
      { ask: '31:GY-02.c5', once: 'stayed', when: '(f:ink.frontroom | f:knows.frontroom) & !f:marlys.loft', to: 'loft' },
      { ask: '31:GY-02.c6', once: 'sister', say: ['31:GY-02.5'] },
      { ask: '31:GY-02.c7', when: '(tier>=1 | f:wade.seen) & !f:marlys.said.asked2', say: [{ first: [{ id: '31:GY-02.7', when: 'f:door.guiding.climax' }, '31:GY-02.6'] }], then: [{ when: 'f:door.guiding.climax', then: ['f:marlys.said.asked2'] }] },
      // GY-14: the drift test told to her after the night (the less common order)
      { ask: '31:GY-14.c1', once: 'birch', when: 'f:door.guiding.done & north & !f:marlys.north', to: 'birch' }] },
    birch: { go: [{ ask: '31:GY-14.c2', say: ['31:GY-14.1'], then: ['f:marlys.north'], end: true }] },
    // GY-12 the loft's favour
    loft: { say: ['31:GY-12.1'], then: ['f:marlys.loft'], go: [
      { ask: '31:GY-12.c1', say: ['31:GY-12.2'], end: true },
      { ask: '31:GY-12.c2', once: 'loft.why', say: ['31:GY-12.3'] },
      { ask: '31:GY-12.c3', once: 'loft.where', say: ['31:GY-12.4'] }] },
    // GY-13 at the counter: the register in hand, she opens it to October and closes it
    ask: { say: ['31:GY-13.1'], go: [
      { ask: '31:GY-13.c1', say: ['31:GY-13.2'], then: ['do:night'], end: true },
      { ask: '31:GY-13.c2', once: 'night.why', say: ['31:GY-13.3'] }] },
    // GY-15 after Wade at the counter on her day (stream p's scene writes wade.moose)
    wade: { say: [{ first: [{ id: '31:GY-15.1', when: 'f:door.guiding.climax' }, '31:GY-15.before.1'] }], then: ['f:marlys.said.wade'], go: [
      { ask: '31:GY-15.before.2', when: '!f:door.guiding.climax', say: ['31:GY-15.before.3'], end: true }] },
  },
};
// her openers on a later day (GY-02 "Openers rotate"), by the day's dice
export const MARLYS_OPENERS = ['31:GY-02.open.1', '31:GY-02.open.2', '31:GY-02.open.3'];
// ctx: { tent: the tent on you or carried, wadeToday: Wade's truck left this visit }
export function marlysEntry(s, ctx = {}) {
  if (!s.has('marlys.met')) return ctx.tent ? 'tent' : 'intro';
  if (ctx.wadeToday && !s.has('marlys.said.wade')) return 'wade';
  if (s.has('gy.register') && !s.has('marlys.night') && !s.has('door.guiding.climax')) return 'ask';
  return 'again';
}

// --- GY-03 to GY-07: Hap on the porch ----------------------------------------------------------------------------------
const NEXT = '31:GY-05.next';
const CARRY = 'carrying:waltpack | has:walttent';
const SISTER = 'His sister\'d want a picture of those lilacs. Don\'t tell her I said so.';
const GO_JUNE = 'Lilacs are June. Go in June.';
export const HAP = {
  id: 'hap', who: 'hap',
  nodes: {
    // GY-03 the first sit: "Sit, if you're going to stand there." (his look at the pack first)
    first: { say: ['31:GY-03.1', { id: '31:GY-03.2', when: CARRY }], go: [
      { ask: '31:GY-03.c1', when: CARRY, say: ['31:GY-03.3'], to: 'intro' },
      { ask: '31:GY-03.c2', say: ['31:GY-03.4'], to: 'intro' },
      { ask: '31:GY-03.c3', say: [{ first: [{ id: '31:GY-03.5', when: CARRY }, { id: '31:GY-03.5', strip: 'That\'s Walt\'s pack.' }] }], to: 'intro' }] },
    intro: { say: ['31:GY-03.6'], then: ['f:hap.met', 'f:door.guiding.open'], to: 'hub' },
    hub: { go: [
      { ask: '31:GY-03.walt.1', once: 'walt', say: ['31:GY-03.4', '31:GY-03.walt.2'] },
      { ask: '31:GY-03.october.1', once: 'october', say: ['31:GY-03.october.2'] },
      { ask: '31:GY-03.memory.1', once: 'memory', say: ['31:GY-03.memory.2'] },
      { ask: '31:GY-03.c4', once: 'like', say: ['31:GY-03.7'], to: 'day' },
      { ask: '31:GY-04.again', when: 'f:hap.day', say: ['31:GY-04.day.3', '31:GY-04.day.5', '31:GY-04.day.6', '31:GY-04.day.7'] },
      // GY-05 what's there now: each after its place, one memory, then "Next."
      { ask: '31:GY-05.c1', once: 'r.dock', when: 'f:hap.day & f:gy.dock', say: ['31:GY-05.1', NEXT] },
      { ask: '31:GY-05.c7', once: 'r.prairie', when: 'f:hap.day & f:gy.prairie', say: ['31:GY-05.11', NEXT], then: ['walt:31:page.3'] },
      { ask: '31:GY-05.c8', once: 'r.mummos', when: 'f:hap.day & (f:gy.mummos | f:ep.S7.ashore) & month:6', say: [{ id: '31:GY-05.12', strip: GO_JUNE }, NEXT], then: ['f:hap.said.lilacs'] },
      { ask: '31:GY-05.c9', once: 'r.mummos', when: 'f:hap.day & (f:gy.mummos | f:ep.S7.ashore) & !month:6', say: [{ id: '31:GY-05.12', strip: SISTER }, NEXT] },
      { ask: '31:GY-05.c10', once: 'r.reef', when: 'f:hap.day & f:gy.reef=walleye', say: ['31:GY-05.13', NEXT] },
      { ask: '31:GY-05.c11', once: 'r.reef', when: 'f:hap.day & f:gy.reef & !f:gy.reef=walleye', say: ['31:GY-05.14', NEXT] },
      // GY-07 his picture matched at the lunch rock and brought back
      { ask: '31:GY-07.c1', once: 'rock', when: 'f:gy.lunch.photo & f:hap.day & !f:hap.photo', say: ['31:GY-07.1'], to: 'rock' },
      // GY-06b, GY-06c after the real talk / any time
      { ask: '31:GY-06b.c1', once: 'brother', when: 'f:hap.farend & f:knows.eino', to: 'let' },
      { ask: '31:GY-06c.c1', when: '(nickseen:frontporch & !f:ink.frontporch & !f:knows.frontporch) | (nickseen:kitchen & !f:ink.kitchen & !f:knows.kitchen) | (nickseen:longroom & !f:ink.longroom & !f:knows.longroom)', to: 'names' }] },
    // GY-04 the day (August 1986): told once; then the print into your hands, "Bring that back."
    day: { say: [...RAW.slice(0, 10), '31:GY-04.1'], then: ['f:hap.day', 'give:page.happrint', 'walt:31:page.2'], to: 'hub' },
    // GY-05b the tow landing: "The tow still drop you on the left as you come up?"
    tow: { say: ['31:GY-05.2'], then: ['f:hap.tow.asked'], go: [
      { ask: '31:GY-05.c2', say: ['31:GY-05.3'], then: ['f:hap.tow.gentle', 'f:hap.tow.right'], to: 'tow2' },
      { ask: '31:GY-05.c5', say: ['31:GY-05.6'], then: ['f:hap.tow.blunt'], end: true },
      { ask: '31:GY-05.c6', say: ['31:GY-05.8'], then: ['f:hap.tow.kind'], end: true }] },
    tow2: { go: [
      { ask: '31:GY-05.c3', when: 'f:knows.lethave', say: ['31:GY-05.4'], to: 'far' },
      { ask: '31:GY-05.c4', say: ['31:GY-05.5'], to: 'far' }] },
    // the next weekend after the blunt one ("Nate says you were right…") or the kind lie (Nate on the porch rail)
    blunt2: { say: ['31:GY-05.7'], then: ['f:hap.tow.right'], to: 'far' },
    kind2: { say: [{ id: '31:GY-05.9', by: 'Nate' }, '31:GY-05.10'], then: ['f:hap.tow.right'], to: 'far' },
    // GY-06 the real talk (the yield): the lake key, the arc's big finding
    far: { say: ['31:GY-06.far.1', '31:GY-06.far.2', '31:GY-06.far.3'], then: ['f:hap.farend', 'f:door.guiding.yield', 'walt:31:GY-06.gives'], go: [
      { ask: '31:GY-06.c1', say: ['31:GY-06.1', '31:GY-06.4'], end: true },
      { ask: '31:GY-06.c2', when: 'f:knows.eino', say: ['31:GY-06.2', '31:GY-06.1', '31:GY-06.4'], end: true },
      { ask: '31:GY-06.c3', say: ['31:GY-06.3', '31:GY-06.1', '31:GY-06.4'], end: true }] },
    // GY-06b 1977
    let: { say: ['31:GY-06b.let.1', '31:GY-06b.let.2', '31:GY-06b.let.3'], then: ['f:hap.1977', 'walt:31:GY-06b.w'], go: [
      { ask: '31:GY-06b.c2', say: ['31:GY-06b.1'], to: 'hub' },
      { ask: '31:GY-06b.c3', say: ['31:GY-06b.2'], to: 'hub' },
      { ask: '31:GY-06b.c4', say: ['31:GY-06b.3'], to: 'hub' }] },
    // GY-06c one name at a time (said before its Gives, so the first that is still unmatched is the one told)
    names: { say: [{ first: [
      { id: '31:GY-06c.porch', when: 'nickseen:frontporch & !f:ink.frontporch & !f:knows.frontporch' },
      { id: '31:GY-06c.kitchen', when: 'nickseen:kitchen & !f:ink.kitchen & !f:knows.kitchen' },
      { id: '31:GY-06c.longroom', when: 'nickseen:longroom & !f:ink.longroom & !f:knows.longroom' }, '31:GY-06c.1'] }],
    then: [
      { when: 'nickseen:frontporch & !f:ink.frontporch & !f:knows.frontporch', then: ['f:knows.frontporch', 'f:hap.said.frontporch'] },
      { when: '!(nickseen:frontporch & !f:ink.frontporch & !f:knows.frontporch) & nickseen:kitchen & !f:ink.kitchen & !f:knows.kitchen', then: ['f:knows.kitchen', 'f:hap.said.kitchen'] },
      { when: '!(nickseen:frontporch & !f:ink.frontporch & !f:knows.frontporch) & !(nickseen:kitchen & !f:ink.kitchen & !f:knows.kitchen) & nickseen:longroom & !f:ink.longroom & !f:knows.longroom', then: ['f:knows.longroom', 'f:hap.said.longroom'] }], to: 'hub' },
    // GY-07 "Pine's gone." then the jigs; he keeps both pictures
    rock: { go: [
      { ask: '31:GY-07.c2', say: ['31:GY-07.2', '31:GY-07.3', '31:GY-07.4'], then: ['do:printBack', 'f:hap.photo', 'give:item.lure:hapjigs', 'card:31:GY-07.gives'], to: 'hub' },
      { ask: '31:GY-07.c3', say: ['31:GY-07.3', '31:GY-07.4'], then: ['do:printBack', 'f:hap.photo', 'give:item.lure:hapjigs', 'card:31:GY-07.gives'], to: 'hub' }] },
  },
};
// ctx: { weekAfter(fact) → a later weekend than that fact's }
export function hapEntry(s, ctx = {}) {
  if (!s.has('hap.met')) return 'first';
  const later = (k) => (ctx.later ? ctx.later(k) : (s.since('days', k) || 0) >= 3);
  if (s.has('hap.tow.right') && !s.has('hap.farend')) return 'far';
  if (s.has('hap.tow.blunt') && !s.has('hap.tow.right') && later('hap.tow.blunt')) return 'blunt2';
  if (s.has('hap.tow.kind') && !s.has('hap.tow.right') && later('hap.tow.kind')) return 'kind2';
  if (s.has('hap.day') && (s.has('gy.tow') || s.has('gy.tow.told')) && !s.has('hap.tow.asked')) return 'tow';
  return 'hub';
}

// --- Nate: the porch rail at weekends, the tow dock on weekdays (31 §5.4) ----------------------------------------------
export const NATE = {
  id: 'nate', who: 'nate',
  nodes: {
    first: { say: ['31:5.4.voice.1'], then: ['f:nate.met'], to: 'hub' },
    // a later day: "Thanks for doing his day." once Hap's day is out, else nothing of his own
    again: { say: [{ id: '31:5.4.voice.2', when: 'f:hap.day & !f:nate.thanked' }], then: [{ when: 'f:hap.day', then: ['f:nate.thanked'] }], to: 'hub' },
    hub: { go: [
      // "Where does the tow land at Prairie?": the real side (a second way to know it, 31 §5.4 Gives; the doc has Rick's
      // words for the question and none of Nate's answer: an a3 draft, then his Gives line)
      { ask: '31:GY-08.c3', once: 'tow', say: ['a3.nate.tow', '31:5.4.gives'], then: ['f:gy.tow.told'] }] },
  },
};
export function nateEntry(s) { return s.has('nate.met') ? 'again' : 'first'; }

// --- GY-09 to GY-11 Sheila at the landing; GY-13's statement --------------------------------------------------------
export const SHEILA = {
  id: 'sheila', who: 'sheila',
  nodes: {
    first: { say: ['31:GY-09.1'], then: ['f:sheila.met'], to: 'hub' },
    // a later day: her line by what's happened since (guiding-cast.js hook: the spare fetched, Walt's way, the party)
    again: { say: [{ hook: 'sheilaOpen' }], to: 'hub' },
    hub: { go: [
      { ask: '31:GY-09.c1', once: 'squad', say: ['31:GY-09.2'] },
      { ask: '31:GY-09.c2', once: 'deputy', say: ['31:GY-09.3'] },
      { ask: '31:GY-09.c3', once: 'search', when: 'f:nb.found & !f:sheila.report', say: ['31:GY-09.4', '31:GY-09.5'], to: 'search' },
      // GY-09b
      { ask: '31:GY-09b.c1', once: 'ollielog', when: 'f:ep.S1.beat | f:nb.page.ollielog', say: ['31:GY-09b.1'], then: ['f:sheila.ollie'] },
      { ask: '31:GY-09b.c2', once: 'ollie', when: 'f:sheila.report & !met:ollie>=1', say: ['31:GY-09b.2'], then: ['ring:stuart'] },
      { ask: '31:GY-09b.c3', once: 'wade', when: '(f:knows.wade | f:wade.seen) & !f:door.guiding.done', say: ['31:GY-09b.3'] },
      // GY-11 the arrangement: a south-wind night in the next ten days named, else "Not this week."
      { ask: '31:GY-11.ask.1', when: 'f:sheila.report & !f:drift.done & !f:drift.arranged & southnight', say: ['31:GY-11.ask.2', '31:GY-11.ask.3'], then: ['do:arrange'], end: true },
      { ask: '31:GY-11.ask.1', once: 'notweek', when: 'f:sheila.report & !f:drift.done & !f:drift.arranged & !southnight', say: ['31:GY-11.ask.4'] }] },
    search: { go: [
      { ask: '31:GY-09.c4', say: ['31:GY-09.6'], to: 'wind' },
      { ask: '31:GY-09.c9', say: ['31:GY-09.12'], to: 'who' }] },
    who: { go: [{ ask: '31:GY-09.c10', say: ['31:GY-09.13', '31:GY-09.6'], to: 'wind' }] },
    wind: { go: [
      { ask: '31:GY-09.c5', say: ['31:GY-09.7'], to: 'who2' },
      { ask: '31:GY-09.c8', say: ['31:GY-09.10'], to: 'report' }] },
    who2: { go: [
      { ask: '31:GY-09.c6', say: ['31:GY-09.8'], then: ['f:sheila.wrote'], to: 'report' },
      { ask: '31:GY-09.c7', say: ['31:GY-09.9'], to: 'report' }] },
    // "I keep one here. Don't ask me why.": page two from the first-aid box (a book page; its Walt line)
    report: { say: ['31:GY-09.11'], then: ['f:sheila.report', 'give:page.sheilareport', 'walt:31:GY-09.gives.1'], to: 'hub' },
    // GY-10 the overdue party (once a season, July–August, after two days of north wind)
    overdue: { say: ['31:GY-10.1'], then: ['f:sheila.overdue'], go: [
      { ask: '31:GY-10.c1', once: 'overdue.where', say: ['31:GY-10.2'] },
      { ask: '31:GY-10.look.1', say: ['31:GY-10.3'], then: ['f:sheila.overdue.taken', 'do:overdue'], end: true },
      { ask: '31:GY-10.look.2', then: ['f:sheila.overdue.declined'], end: true }] },
    // back at the landing with the party found: "Good. They were where the wind said." and the squad's $30
    found: { say: ['31:GY-10.6'], then: ['f:sheila.overdue.paid', 'pay:30@a3.tally.overdue'], to: 'hub' },
  },
};
// ctx: { overdueOn: the party is out today (northwind2, July–August, once a season) }
export function sheilaEntry(s, ctx = {}) {
  if (s.has('sheila.overdue.found') && !s.has('sheila.overdue.paid')) return 'found';
  if (ctx.overdueOn && !s.has('sheila.overdue')) return 'overdue';
  return s.has('sheila.met') ? 'again' : 'first';
}
// GY-13 choice 1: the next Thursday to Sunday, Marlys at the landing on a day she never comes in; the scene plays
// whether you stand by or walk away (the fade on her talking and Sheila writing), then Sheila to you
export const STATEMENT = {
  id: 'statement', who: 'sheila',
  nodes: {
    told: { say: ['31:GY-13.18'], then: ['f:sheila.statement', 'walt:31:GY-13.sheila.1', 'walt:31:GY-13.sheila.2', 'f:knows.wade.office'], go: [
      { ask: '31:GY-13.c9', say: ['31:GY-13.19'], end: true },
      { ask: '31:GY-13.c10', say: ['31:GY-13.20'], end: true }] },
  },
};

// --- GY-08 Rick, the swamper ----------------------------------------------------------------------------------------
export const RICK_RULES = ['31:GY-08.5', '31:GY-08.6', '31:GY-08.7', '31:GY-08.8', '31:GY-08.9'];
export const RICK = {
  id: 'rick', who: 'rick',
  nodes: {
    first: { say: [{ id: '31:GY-08.1', when: 'f:hap.day' }], then: ['f:rick.met'], to: 'hub' },
    hub: { go: [
      { ask: '31:GY-08.c1', once: 'picture', when: 'f:hap.day', say: ['31:GY-08.2'] },
      { ask: '31:GY-08.c2', once: 'swamping', say: ['31:GY-08.3'] },
      { ask: '31:GY-08.c3', once: 'tow', say: ['31:GY-08.4'], then: ['f:gy.tow.told'] },
      // Walt's rules: one per ask, in order, then repeats (guiding-cast.js hook: rick.rule.<n>)
      { ask: '31:GY-08.c4', say: [{ hook: 'rule' }] },
      { ask: '31:GY-08.c5', once: 'mine', say: ['31:GY-08.10'] },
      // the canoe: only once the Walt page says "went north" (so it never counts toward it)
      { ask: '31:GY-08.c6', once: 'canoe', when: 'north & !f:rick.canoe', say: ['31:GY-08.11'], to: 'canoe' }] },
    canoe: { go: [
      { ask: '31:GY-08.canoe.1', say: ['31:GY-08.canoe.3', '31:GY-08.canoe.4', '31:GY-08.canoe.5', '31:GY-08.canoe.6', '31:GY-08.canoe.7'], then: ['f:rick.canoe', 'walt:31:GY-08.canoe.8'], end: true },
      { ask: '31:GY-08.canoe.2', say: ['31:GY-08.canoe.3', '31:GY-08.canoe.4', '31:GY-08.canoe.5', '31:GY-08.canoe.6', '31:GY-08.canoe.7'], then: ['f:rick.canoe', 'walt:31:GY-08.canoe.8'], end: true }] },
  },
};
export function rickEntry(s) { return s.has('rick.met') ? 'hub' : 'first'; }
// after GY-08's last topic he lies about the canoe to anyone, the player included (31 §10)
export const RICK_AFTER = '31:10.2';

// --- GY-13 the night in bunk 3 -----------------------------------------------------------------------------------------
// The Rest dial stops at each of her hours and nothing else (31 GY-13; campaign-design §5.3). Each hour plays its node
// in the bunkhouse (guiding-cast.js). 17:50 she comes down as you take the bunk (or at 17:50 if you are already in it).
export const NIGHT_HOURS = [
  { at: 17 + 50 / 60, node: 'n1750' }, { at: 18 + 5 / 60, node: 'n1805' }, { at: 22, node: 'n2200' },
  { at: 23 + 40 / 60, node: 'n2340' }, { at: 25, node: 'n0100' }, { at: 26, node: 'n0200' }, { at: 30, node: 'n0600' },
];
export const NIGHT_STOPS = NIGHT_HOURS.slice(1).map((h) => h.at % 24); // (the dial's stops: 18:05, 22:00, 23:40, 01:00, 02:00, 06:00)
export const TRUCK_HOURS = { from: 23 + 40 / 60, to: 28.5 }; // the ordinary pickup idles in the lot, 23:40 to 04:30
export const NIGHT = {
  id: 'night', who: 'marlys',
  nodes: {
    n1750: { say: [{ first: [{ id: '31:GY-13.5', when: 'lampLit' }, '31:GY-13.4'] }], then: ['f:gy.night.1750'], end: true },
    n1805: { say: ['31:GY-13.phone.1', '31:GY-13.phone.2'], then: ['f:gy.night.1805'], go: [
      { ask: '31:GY-13.c3', say: ['31:GY-13.6', '31:GY-13.7'], end: true },
      { ask: '31:GY-13.c4', say: ['31:GY-13.7'], end: true }] },
    n2200: { say: ['31:GY-13.8'], then: ['f:gy.night.2200'], end: true },
    n2340: { then: ['f:gy.night.2340'], end: true }, // (she says nothing: the truck's own)
    n0100: { say: ['31:GY-13.9', { first: [{ id: '31:GY-13.10', when: 'truckLooked' }, '31:GY-13.11'] }], then: ['f:gy.night.0100'], end: true },
    n0200: { say: ['31:GY-13.12', '31:GY-13.13'], then: ['f:gy.night.0200'], end: true },
    n0600: { say: [{ id: '31:GY-13.14', when: '!lampLit' }, '31:GY-13.15'], then: ['f:gy.night.0600'], go: [
      { ask: '31:GY-13.c5', to: 'six' }, { ask: '31:GY-13.c6', to: 'six' }] },
    six: { say: ['31:GY-13.six.1', '31:GY-13.six.2', '31:GY-13.six.3', '31:GY-13.six.4', '31:GY-13.six.5', '31:GY-13.six.6', '31:GY-13.16'],
      then: ['f:door.guiding.climax', 'walt:31:GY-12.c5'], go: [
        { ask: '31:GY-13.c7', say: ['31:GY-13.17'], then: ['f:choice.sheila=in', 'f:sheila.in', 'f:door.guiding.done'], to: 'close' },
        { ask: '31:GY-13.c8', say: ['31:GY-13.21'], then: ['f:choice.sheila=lie', 'f:door.guiding.done'], to: 'close' }] },
    // the close, if the drift test came first: "Then the box was the right thing." (GY-14 never plays)
    close: { go: [
      { ask: '31:GY-13.c11', when: 'f:drift.done', say: ['31:GY-13.22'], then: ['f:marlys.north'], end: true },
      { ask: '31:GY-13.c12', when: 'f:drift.done', end: true }] },
  },
};
// the line the truck's window says if you walk up to it (once), and Gus's "Three's free." on a later permit
export const TRUCK_LINE = '31:GY-13.truck';
export const BUNK_FREE = '31:9.1.1';

// --- Gus (GY-16) and his rings (31 §6, GY-04, GY-06, GY-06c, GY-09b) ---------------------------------------------------
// one line each, once, as he talks at the counter (guiding-cast.js: the keeper's head, the first time each holds)
export const GUS_LINES = [
  { id: '31:GY-16.marlys', when: 'f:marlys.met' },
  { id: '31:GY-16.hap', when: 'f:hap.met' },
  { id: '31:GY-16.tier1', when: 'tier>=1' },
  { id: '31:GY-16.tow', when: 'f:hap.day & !f:gy.tow.told' },
];
// Gus's rings are keeper asks (leads-guiding.js ASKS: Hap's day's places, the far end's two lakes, the nicknames, Ollie)

// --- GY-17 Farm's wall, GY-18 Hog Creek's wall map -----------------------------------------------------------------------
// Tauno's topic on Farm's porch the same morning the photo was looked at (mining-cast.js reads it through topics.add,
// a3's block); the Farm keeper's line when asked; the Hog Creek keeper's topic (generated keeper: a keeper topic)
export const WALLS = [
  { id: 'a3.farm.photo', who: 'keeper', ep: 31, pri: 5.2, once: true, label: 'The old guide photo?', when: 'f:gy.photo81 & ep:31', say: '31:GY-17.2', then: ['walt:31:GY-17.w'] },
  { id: 'a3.hog.map', who: 'keeper', ep: 36, pri: 5.2, once: true, ask: '31:GY-18.c1', when: 'f:gy.hogmap & ep:36', say: '31:GY-18.1', then: ['walt:31:GY-18.w', 'f:knows.rods'] },
];
export const TAUNO_PHOTO = { ask: '31:GY-17.c1', when: 'f:gy.photo81 & days.since(gy.photo81)<1', say: '31:GY-17.1', strip: { when: 'f:knows.june', text: 'She taught at Tower. Smartest person in any room he was in.' }, then: ['walt:31:GY-17.w'] };

// the want: Hap's print back at the porch is GY-07's topic (above); the print shows "Hap's. Give it back." while held
export const LOANS = [{ item: 'page:happrint', back: 'hap' }];
// Moose Lake 25 (the arc's home ground)
export const MOOSE = 25;
