// Stream S (Round 4): S1 and S8's people as data (docs/story/60-side-stories.md S1, S8). The words are the doc's, by id
// (text/side.json; where 60 has no line, docs/story/95-drafted-lines.md "Stream s" holds a build draft). feed-sides.js
// stages the people and runs these scenes with topics.js SceneRun; story-lint and scripts/cmp-s-unit.mjs read them.
//
//   OLLIE       his walk evenings on the Stuart Portage (60 S1 "The person": parks 18:50, north at 19:00, the rock about
//               19:40–19:50, the lot about 20:35), the carry evening's pace (60 S1 "The set piece")
//   OLLIE_A     conversation A, the third meeting (the yes: "You're on." → do:yes)
//   OLLIE_B     conversation B, at the river end after the carry (the log page, the echo, the lead to Sheila)
//   OLLIE_C     the later walk evenings' second lines (60 S1 C), in order of preference by their conditions
//   TOM         Tom Becker (60 S8 "Conversations": his door, the rule, the teaching, the files, the argument)
//   OSTBYS      Vern and Lloyd at their fire by the lunch rock, 3–9 August
//   HAP_S8      Hap's three S8 topics (choices for his scene's hub: stream a3's Hap, 31; the join merges them)
//   KEEPER_S    keeper topics: the sled at Moose Lake 25 (Gus) and Farm 31 (Ruth); the Stuart at Moose River North (Leon)
//   CARRY       the loaded carry's numbers (the squad's 49 minutes; minigames/timed-carry.js)
//   PLACES_S    the rings' places (leads-act1.js PLACES gets them in its s: block)

export const OLLIE = {
  days: 'tue|thu',              // his walk evenings (dow)
  parks: 18 + 50 / 60,          // h: in the lot at the road end
  walks: 19,                    // h: north from the road end
  rock: [19 + 40 / 60, 19 + 50 / 60], // h: on the landing rock at the river end
  lot: 20 + 35 / 60,            // h: back in the lot (then gone)
  meetR: 14,                    // m: passing this near him on the trail is a meeting (one each way an evening)
  stopR: 7,                     // m: from the third meeting on he stops for you this near
  carry: { lag: 3 / 60, arrive: 45 / 60, wait: 0.75 }, // h: on a carry evening he walks out 3 min after you, is at the river 45 min after your start, waits there
  armed: [18 + 45 / 60, 19 + 40 / 60], // h: a carry starts only while he's at the road end with the watch (he waits there on the evening after the yes)
};
export const CARRY = { record: 49, startR: 45, endR: 45, leaveR: 25, idle: 25 / 60, giveUp: 2.5, offTrail: 220 };

// --- conversation A (60 S1 A) ----------------------------------------------------------------------------------------
export const OLLIE_A = {
  id: 's1.a', who: 'ollie',
  nodes: {
    open: { say: ['S1.A.1'], then: ['f:ollie.stopped'], go: [
      { ask: 'S1.A.c1', say: ['S1.A.2'], to: 'topics' },
      { ask: 'S1.A.c2', say: ['S1.A.3'], to: 'topics' },
      { ask: 'S1.A.c3', say: ['S1.A.4'], then: ['do:walkOn'], end: true }, // (he laughs once and walks on: next meeting, A again)
    ] },
    topics: { then: ['f:ollie.a'], go: [
      { ask: 'S1.A.c4', once: 'walk', say: ['S1.A.5'], to: 'why' },
      { ask: 'S1.A.c6', once: 'carry', say: ['S1.A.7'], then: ['f:ollie.squad'], to: 'squad' },
      { ask: 'S1.A.c8', when: 'f:ollie.squad & !f:ep.S1.yes', say: ['S1.A.9'], to: 'offer' },
      { ask: 'S1.A.c11', once: 'guide', when: 'read:NB30', say: ['S1.A.12'], to: 'guide' },
      { ask: 'S1.A.c13', once: 'eino', when: 'f:knows.eino | f:tauno.turn', say: ['S1.A.16', 'S1.A.17'] },
      { ask: 'S1.A.c14', once: 'late', when: 'month:9 & dayPermit', say: ['S1.A.18'] },
    ] },
    why: { go: [{ ask: 'S1.A.c5', once: 'why', say: ['S1.A.6'] }], hub: 'topics' },
    squad: { go: [{ ask: 'S1.A.c7', once: 'callout', say: ['S1.A.8'] }], hub: 'topics' },
    offer: { go: [
      { ask: 'S1.A.c9', say: ['S1.A.10'], then: ['do:yes'], to: 'topics' },
      { ask: 'S1.A.c10', say: ['S1.A.11'], to: 'topics' },
    ] },
    guide: { go: [{ ask: 'S1.A.c12', once: 'walt', when: 'f:knows.haapala', say: ['S1.A.13', 'S1.A.14', 'S1.A.15'], then: ['f:ollie.walt'] }], hub: 'topics' },
  },
  bye: 'S1.A.19',
};

// --- conversation B (60 S1 B), at the river end -----------------------------------------------------------------------
// The log page and, with the main story (stage S3+ or Eino's name known), the Walt page's line: the Eino half of the echo
// (bible 5.5; the same key Tauno gives). "Walt's canoe swamped too" needs the player to know Walt's canoe was on Birch:
// knows.birch (Sheila's page two, the clipping, any keeper's "drowned on Birch": their streams set it)
export const OLLIE_B = {
  id: 's1.b', who: 'ollie',
  nodes: {
    open: { say: [{ id: 'S1.B.1', when: '!f:ollie.b' }], then: ['f:ollie.b'], go: [
      { ask: 'S1.B.c1', once: 'worst', say: ['S1.B.2', 'S1.B.3'], to: 'worst' },
      { ask: 'S1.B.c4', once: 'brother', when: 'f:ep.S1.log & f:knows.haapala', say: ['S1.B.7', 'S1.B.8'], then: ['f:ollie.brother'] },
      { ask: 'S1.B.c5', once: 'knew', when: 'f:ollie.brother & read:NB30', say: ['S1.B.9', 'S1.B.10'] },
      { ask: 'S1.B.c6', once: 'birch', when: 'f:knows.birch', say: ['S1.B.11', 'S1.B.12'], to: 'birch' },
      { ask: 'S1.B.c8', once: 'who', when: 'f:ollie.upwind', say: ['S1.B.15', 'S1.B.16'] },
    ] },
    worst: { go: [
      { ask: 'S1.B.c2', once: 'happened', say: ['S1.B.4'] },
      { ask: 'S1.B.c3', once: 'wrong', when: 'f:ollie.said.happened', say: ['S1.B.5', 'S1.B.6'],
        then: ['f:ollie.upwind', 'give:page.ollielog', 'f:ep.S1.log'] }, // (the Walt page's line: OLLIE_ECHO, a rule)
    ], hub: 'open' },
    birch: { go: [{ ask: 'S1.B.c7', once: 'and', say: ['S1.B.13', 'S1.B.14'], then: ['ring:s1.sheila@Ollie', 'walt:S1.B.w2', 'f:ollie.sheila'] }], hub: 'open' },
  },
  bye: 'S1.B.17',
};
// the log given, with the main story (or once there is one): the Walt page's line, the Eino half of the echo (60 S1 B;
// "Without the main story": the log page gains its Walt-page line then). A rule in the S1 record (built at construction)
export const OLLIE_ECHO = { id: 'ep.S1.echo', when: 'f:ep.S1.log & (stage>=S3 | f:knows.eino | f:tauno.turn)', then: ['walt:S1.B.w1', 'f:echo.eino'] };

// --- C: "Evening." and one second line, rotating (the first that holds and hasn't been said this cycle) ------------------
export const OLLIE_C = [
  { id: 'S1.C.6', when: 'date:09-24..09-30 & dow:thu' },   // the last Thursday
  { id: 'S1.C.5', when: 'month:9' },
  { id: 'S1.C.4', once: true },                            // 70's ambient line (70.4.3.18), once
  { id: 'S1.C.1' }, { id: 'S1.C.2' }, { id: 'S1.C.3', when: 'dow:thu' },
];
export const EVENING = 'S1.the-steps.1';
// after the endings (60 §11): Ollie's one line on the journalist ending; on the money ending, "Evening." only, for good
export const OLLIE_AFTER = { J: 'S1.after.J' };

// --- the carry's results, said at the river end (60 S1 "Results") -----------------------------------------------------
export const CARRY_SAYS = { beat: 'S1.the-set-piece-the.1', missed: 'S1.the-set-piece-the.2', twice: 'S1.the-set-piece-the.3', gaveup: 'S1.the-set-piece-the.4' };

// --- Tom Becker (60 S8 "Conversations") -------------------------------------------------------------------------------
export const TOM = {
  id: 's8.tom', who: 'tom',
  nodes: {
    open: { say: [{ id: 'S8.conv.1', when: '!f:tom.met' }, { id: 'S8.tom', when: '!f:ep.S8.yes & !f:tom.said.sled & month:6-9' }], then: ['f:tom.met', 'do:met'], go: [
      { ask: 'S8.conv.c1', once: 'sled', say: ['S8.conv.2'], to: 'sled' },
      { ask: 'S8.conv.c4', once: 'teach', say: ['S8.conv.5', 'S8.conv.6'], then: ['f:ep.S8.taught'] },
      { ask: 'S8.conv.c5', once: 'where', when: 'f:tom.said.sled & (f:tom.met2 | days.since(tom.said.sled)>=7)', say: ['S8.conv.7'], then: ['ring:s8.farshore@Tom'] },
      { ask: 'S8.conv.c6', once: 'old', when: 'f:tom.said.sled & !f:ep.S8.found', say: ['S8.conv.8'] },
      { ask: 'S8.conv.c7', when: 'f:ep.S8.found & !f:ep.S8.leave & !f:ep.S8.haul & !f:ep.S8.gone',
        say: ['S8.conv.9', { id: 'S8.conv.10', when: 'f:ep.S8.print' }, { id: 'S8.conv.11', when: 'f:ep.S8.tin' }, { id: 'S8.conv.12', when: 'f:ep.S8.snap' }, { id: 'S8.conv.13', when: 'f:ep.S8.hap.why' }, 'S8.conv.14'], to: 'how' },
    ] },
    sled: { go: [{ ask: 'S8.conv.c2', once: 'why', say: ['S8.conv.3'] }, { ask: 'S8.conv.c3', once: 'when', say: ['S8.conv.4'] }], hub: 'open' },
    how: { go: [
      { ask: 'S8.conv.c8', when: '!f:ep.S8.tin', say: ['S8.conv.15'], then: ['f:ep.S8.leave', 'f:tom.friend'], end: true },
      { ask: 'S8.conv.c8', when: 'f:ep.S8.tin', say: ['S8.conv.15', 'S8.conv.16'], then: ['f:ep.S8.leave', 'f:tom.friend'], to: 'tin' },
      { ask: 'S8.conv.c11', say: ['S8.conv.18'], then: ['f:ep.S8.haul'], end: true },
    ] },
    tin: { go: [
      { ask: 'S8.conv.c9', then: ['do:takeTin', 'f:ep.S8.tinGiven'], end: true },
      { ask: 'S8.conv.c10', say: ['S8.conv.17'], end: true },
    ] },
  },
};
// his barks when you come near (70 §7.2 "The ranger party"): the first that holds
export const TOM_BARKS = [
  { id: 'S8.end', when: 'f:ep.S8.gone & !f:ep.S8.leave & !f:tom.said.yard', then: ['f:tom.said.yard'] }, // "It's in the yard in town…" (60 S8 the window)
  { id: '70.7.2.25', when: 'month:9 & f:ep.S8.yes & !f:ep.S8.end' },
  { id: '70.7.2.23', when: 'hour:17-22' },
  { id: '70.7.2.22' },
];

// --- the Ostbys, 3–9 August at their fire by the lunch rock (60 S8) ----------------------------------------------------
export const OSTBYS = {
  id: 's8.ostbys', who: 'ep.S8', fig: 'ostbys', // (their choices' once keys under ep.S8.said.*: the Ostbys are no bible person)
  nodes: {
    open: { say: [{ id: 'S8.conv.23', by: 'Vern', when: '!f:ep.S8.ostbys' }, { id: 'S8.conv.24', by: 'Lloyd', when: '!f:ep.S8.ostbys' }, { id: 'S8.conv.25', by: 'Vern', when: '!f:ep.S8.ostbys' }],
      then: ['f:ep.S8.ostbys'], go: [
        { ask: 'S8.conv.c15', once: 'ostbys.pic', say: [{ id: 'S8.conv.26', by: 'Lloyd' }], then: ['give:page.ostbysnap', 'f:ep.S8.snap'] },
        { ask: 'S8.conv.c16', once: 'ostbys.creek', say: [{ id: 'S8.conv.27', by: 'Vern' }], then: ['ring:s8.creek@Vern', 'f:ep.S8.creekknown'] },
        { ask: 'S8.conv.c17', once: 'ostbys.stay', say: [{ id: 'S8.conv.28', by: 'Vern' }, { id: 'S8.conv.29', by: 'Lloyd' }] },
      ] },
  },
};

// --- Hap's three topics (31's tree, stream a3: the join merges these into his scene's hub; feed-sides.js offers them on
// any talker registered as 'hap' through show.js's talkers until then) --------------------------------------------------
export const HAP_S8 = [
  { ask: 'S8.conv.c12', once: 's8.trapper', say: ['S8.conv.19'], then: ['f:ep.S8.hap.trapper'] },
  { ask: 'S8.conv.c13', once: 's8.cabin', when: 'f:hap.said.s8.trapper | f:ep.S8.hap.trapper', say: ['S8.conv.20'], then: ['ring:s8.creek@Hap', 'f:ep.S8.hap.creek'] },
  { ask: 'S8.conv.c14', once: 's8.why', say: ['S8.conv.21', 'S8.conv.22'], then: ['f:ep.S8.hap.why'] },
];

// --- keeper topics (topics.js keeper shape) --------------------------------------------------------------------------
export const KEEPER_S = [
  // 60 S8 "Keepers split": one line each, once, asked about the sled (Gus at Moose Lake 25, Ruth at Farm 31)
  { id: 's8.sled', pri: 4, once: true, label: 'The sled on Insula?', when: '(ep:25 | ep:31) & month:6-9 & !f:ep.S8.gone',
    at: { 25: ['S8.rumour.2', 'S8.conv.30'], 31: ['S8.conv.31'] } },
  // 60 S1 "How it starts": Leon at Moose River North 16, handing the Stuart over (the ring if it isn't on your sheet)
  { id: 's1.stuart', pri: 4, once: true, label: 'The Stuart Portage?', when: 'ep:16 & month:6-9',
    say: ['S1.leon'], ring: { x: -57740, z: -1500, r: 1500, place: 's1.stuart', label: 'the Stuart Portage' } },
];

// --- the rings' places (leads-act1.js PLACES, its s: block) -------------------------------------------------------------
export const PLACES_S = {
  's1.stuart': { layer: 's1.stuart', x: -57740, z: -1500, r: 1500, label: 'the Stuart Portage' },
  's1.sheila': { store: 25, r: 400, label: 'Moose Lake' },
  's8.creek': { layer: 's8.creek', x: -6150, z: 19985, r: 300, label: 'a creek' },
  's8.farshore': { x: -6000, z: 20050, r: 900, label: 'the far shore' },
};
