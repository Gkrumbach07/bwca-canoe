// The informant as data (campaign stream i, Round 5's second half; docs/story/32-the-boys.md §5.10–§5.17, §6; campaign-design
// §5.2 "Lies", "the canary trap", "The informant is no special code"; Part 4 Round 5). Node only: no game imports (the lint,
// the unit check and the solver read it). The scenes are topics.js SceneRun's shape; every line is an id into
// text/boys.json (32:…, the writers' anchors) or text/drafted.json (d95.i.…, docs/story/95-drafted-lines.md "Stream i").
//
//   PIECES       the case's pieces (32 §6): the fact each is, soft or hard, its reveal choice, Denny's deflection, the
//                follow-up that cuts through it
//   DENNY_I · FRANK_I · BOB_I   their topics for stream b5's hubs (extendBoys); the same live in DENNY_CABIN's hub here
//   DENNY_CABIN  Denny at his cabin down the Sawbill Trail, 17–23 June–October (32 §3.3, §5.6 "The cabin", §5.12)
//   REVEAL       the reveal (32 §5.15) at the rock on 14 August or at the cabin, and the three choices after (§5.16)
//   FRANK_FARM   Frank's own scene for the canary, the accusations and the confession when stream b5's FRANK isn't there
//   BOB_STORE    Bob's, the same
//   dennyIEntry(s, ctx) · revealEntry(s, ctx) · frankIEntry(s)   where each starts, from where the story stands
//   I_SENSORS    the condition names the scenes read from their own context (informant-cast.js registers them)
//   CANARY       the trap's numbers (32 §5.11) · SCHEDULE (32 §11) · PLACES (the cabin, the rock)
//   extendBoys({ DENNY, FRANK, BOB })   the join's one call: these topics into b5's hubs, these nodes into b5's scenes
//
// Facts this stream writes (facts.js `// i:` rows; the people's own are under their namespaces):
//   canary.<who>.<lakeId> = day told (who: denny | frank | bob) · canary.ring.<lakeId> = [sx, sz, hx, hz] (Denny's two
//   rings) · canary.seen.<lakeId> · canary.heard.<lakeId> · canary.shared.<lakeId> · canary.hard = lake name ·
//   canary.clear.frank | canary.clear.bob
//   denny.tell2 · denny.tell3 · denny.deduced · denny.visit · denny.calls.1|2 · denny.reveal.open · denny.reveal.first=<k>
//   denny.revealed (L2E) · denny.wade · denny.toldAlive · denny.told.by · denny.relay.<n> · denny.note.due · denny.note
//   choice.denny = turn | told | left (+ denny.turned / denny.toldon / denny.left, rules-informant.js, for the endings)
//   case.denny.{river, tuesday, inallweek, talked, isabella, canary, note} (pieces; b5 writes nicknames and rochester, a3
//   writes message: the pad)
//   isabella.flagging | can | aerial | receipt (the camp, 32 §5.10) · cal.2019-10-17.thu · lie.denny.tuesday
//   frank.accused (day) · frank.sorry · frank.whiskey · frank.confessed · frank.folder.asked (day) · frank.folder ·
//   frank.notfrank · bob.accused
export const I_SENSORS = { tell2Due: 'flag', tell3Due: 'flag', atRock: 'flag', atCabin: 'flag', frankCold: 'flag', canaryOn: 'flag', weekSince: 'flag' };

export const SAWBILL = 38, FARM = 31;
// "Where are you headed next?": the same words in every file (Len's, 30 §4.2; Jon's, 33; Maggie's, 40)
export const CANARY_ASK = '30:4.2/len-saari-first-meeting.c6';
// 32 §5.11: the watchers at the ringed site from the told day + 1 to + 5; heard of at the counter 1–3 days on; a lake told
// only to Frank or Bob comes back empty after five days; up to four lakes in the pick
export const CANARY = { from: 1, to: 5, heard: [1, 3], clear: 5, hours: [8, 19], near: 260, sight: 520, hole: 180 };
// 32 §11 "People and schedules", §5.15 "Where"
export const SCHEDULE = {
  cabin: 'month:6-10 & hour:17-23',          // the reveal at the cabin, and Denny on his porch of an evening
  rock: 'date:08-14..08-14 & hour:20-23',     // dusk to 23:00 on the last night, beside Walt's cup
};
// where (runtime: informant-cast.js finds dry ground near these): the cabin ten minutes down the Sawbill Trail from the
// store (the store's frame: `back` metres behind it, toward the road), the sitting rock at C1210 (stream b5's TRIP.camp)
export const PLACES = { cabin: { back: 430, across: 60 }, rock: { x: 15082, z: 6845, landing: [15072, 6830] } };

// --- the case (32 §6) ------------------------------------------------------------------------------------------------------
// k: the piece; fact: case.denny.<k>; hard; ask: the reveal's choice; when: what makes it a choice (the piece on the page);
// say: Denny's deflection; follow: the follow-up that cuts through (32 §5.15's second table)
export const PIECES = [
  { k: 'message', hard: true, ask: '32:5.15.c1', say: '32:5.15.1', follow: '32:5.15.c8' },   // the pad (a3: the register + Denny's card)
  { k: 'rochester', hard: true, ask: '32:5.15.c2', say: '32:5.15.2', follow: '32:5.15.c9' }, // Bob (b5)
  { k: 'canary', hard: true, ask: '32:5.15.c3', say: '32:5.15.3', follow: '32:5.15.c10' },
  { k: 'river', ask: '32:5.15.c4', say: '32:5.15.4', follow: '32:5.15.c11' },               // nicknames + N34–35 decoded
  { k: 'inallweek', ask: '32:5.15.c5', say: '32:5.15.5', follow: '32:5.15.c12' },           // tell 2
  { k: 'tuesday', ask: '32:5.15.c6', say: '32:5.15.6', follow: '32:5.15.c13' },             // tell 1 + a dated record
];
// every piece the count reads (soft ones that have no reveal choice of their own too)
export const SOFT_ONLY = ['nicknames', 'talked', 'isabella', 'note'];
export const REVEAL_WHEN = 'count(case.denny.*)>=3 & any(case.denny.*=hard) & met:denny>=2';
export const NOTE_WHEN = '(f:ev.adrift | (f:tier.4 & days.since(tier.4)>=21)) & !f:denny.revealed';
const NICKS = '(f:boys.nicknames | f:denny.sparky | f:denny.deduced)';

const B = (id, by) => ({ id, by });

// --- Denny's topics (any meeting: the store with b5, his cabin here) -----------------------------------------------------------
export const DENNY_I = [
  // 5.12 tell 2: asked, the first talk after Marlys told of the night, tier 3, or the third meeting
  { ask: '32:5.12.c1', once: 'lastTalk', when: 'tell2Due & !f:denny.revealed', say: ['32:5.12.tell2'], then: ['f:denny.tell2'] },
  // 5.11 the canary (a lake picked on the map: informant-cast.js decorates the choice with the pick)
  { ask: CANARY_ASK, tag: 'canary', when: 'canaryOn & !f:denny.revealed', say: ['32:5.11.denny.1', '32:5.11.denny.2'], then: ['do:canary'] },
  // 5.14 accusing him too early: nothing changes, the topic stays
  { ask: '32:5.14.c4', when: 'f:denny.tell3 & !f:denny.reveal.open & !f:denny.revealed', say: ['32:5.14.me'] },
];
// 5.12 tell 3: unasked, the first talk after tier 4 or two pieces (the opener's place)
export const TELL3 = { say: ['32:5.12.tell3'], then: ['f:denny.tell3'], go: [
  { ask: '32:5.12.c2', say: ['32:5.12.who'], to: 'hub' },
  { ask: '32:5.12.c3', say: ['32:5.12.why'], to: 'hub' }] };

// --- Frank's and Bob's ------------------------------------------------------------------------------------------------------
export const FRANK_I = [
  { ask: CANARY_ASK, tag: 'canary', when: 'canaryOn & !frankCold', say: [{ hook: 'frankCanary' }], then: ['do:canary'] },
  // 5.14 accusing Frank (the red-herring line on the page, Frank not cleared)
  { ask: '32:5.14.c1', once: 'accused', when: '(f:frank.patch | f:frank.lot) & !f:frank.cleared & !f:denny.revealed', say: ['32:5.14.say'], to: 'accused' },
  { ask: '32:5.14.c3', once: 'sparky', when: '!frankCold', say: ['32:5.14.whiskey'], then: ['f:frank.whiskey'] },
  { ask: '32:5.14.wrong', once: 'wrong', when: 'f:frank.accused & f:frank.cleared', say: ['32:5.14.sorry'], then: ['f:frank.sorry', 'ppl:frank.cold=false'] },
  // 5.13 the confession (Frank cleared, a red-herring line on the page, a morning at Farm)
  { ask: '32:5.13.c1', once: 'nights', when: 'f:frank.cleared & (f:frank.patch | f:frank.lot) & !frankCold', say: ['32:5.13.2'], then: ['f:frank.confessed'], to: 'nights' },
  { ask: '32:5.13.c3', when: 'f:frank.confessed & !f:frank.folder.asked & !frankCold', say: ['32:5.13.4'], then: ['do:folderAsk'] },
];
export const FRANK_NODES = {
  accused: { go: [{ ask: '32:5.14.c2', say: ['d95.i.lied', 'd95.i.way'], then: ['do:accuse'], end: true }] },
  nights: { hub: 'hub', go: [
    { ask: '32:5.13.c2', once: 'saw', say: ['32:5.13.3'], to: 'folder' },
    { ask: '32:5.13.c5', once: 'lot', when: 'f:frank.lot', say: ['32:5.13.6'], then: ['f:frank.notfrank'], to: 'nights' }] },
  folder: { hub: 'hub', go: [
    { ask: '32:5.13.c3', say: ['32:5.13.4'], then: ['do:folderAsk'], to: 'hub' },
    { ask: '32:5.13.c4', say: ['32:5.13.5'], to: 'hub' }] },
  // after Tell the boys (32 §5.16.2 "Frank: warmer, but sadder"), once, as he's met
  afterTold: { say: [{ first: [{ id: '32:5.16.2.frank.2', when: 'f:frank.sorry' }, '32:5.16.2.frank.1'] }], then: ['f:frank.thanked'], to: 'hub' },
};
export const BOB_I = [
  { ask: CANARY_ASK, tag: 'canary', when: 'canaryOn', say: ['32:5.11.bob'], then: ['do:canary'] },
  { ask: '32:5.14.c5', once: 'accused', when: 'count(case.denny.*)>=1 & !f:denny.revealed', say: ['32:5.14.bob.1', '32:5.14.bob.2'], then: ['f:bob.accused'] },
];

// --- Denny at his cabin (pre-reveal hub, the reveal's openers, the after) -----------------------------------------------------
export const DENNY_CABIN = {
  id: 'dennyI', who: 'denny',
  nodes: {
    hello: { say: ['d95.i.cabin.hello'], then: ['f:denny.met'], to: 'hub' },
    tell3: TELL3,
    // the visit to the home outfitter (32 §5.6 "The visit"): once, 2–4 days after a lake told
    visit: { say: ['32:5.6.6'], then: ['f:denny.visit'], to: 'hub' },
    // after the choice: turned, a week's relay line (32 §5.16.1); told, "First time I've slept since spring." once; left, "Hi."
    relay: { say: [{ hook: 'relay' }], to: 'hub' },
    slept: { say: ['32:5.16.2.slept.1', '32:5.16.2.slept.2'], then: ['f:denny.slept'], to: 'hub' },
    hi: { say: ['32:5.16.3.hi'], to: 'hub' },
    hub: { go: DENNY_I },
  },
};
// ctx: { visit: the home-outfitter visit is due }
export function dennyIEntry(s, ctx = {}) {
  const ch = s.get('choice.denny');
  if (ch === 'turn') return 'relay';
  if (ch === 'told') return s.has('denny.slept') ? 'hello' : 'slept';
  if (ch === 'left') return 'hi';
  if (ctx.visit && !s.has('denny.visit')) return 'visit';
  if (ctx.tell3Due && !s.has('denny.tell3')) return 'tell3';
  return 'hello';
}

// --- the reveal (32 §5.15) and the choice (§5.16) ---------------------------------------------------------------------------
const pieceWhen = (p) => `f:case.denny.${p.k}${p.hard ? '=hard' : ''}`;
const lay = PIECES.map((p) => ({ ask: p.ask, when: pieceWhen(p), say: [p.say], then: [`f:denny.reveal.first=${p.k}`], to: 'second' }));
const second = [
  ...PIECES.map((p) => ({ ask: p.follow, when: `f:denny.reveal.first=${p.k}`, to: 'silence' })),
  ...PIECES.map((p) => ({ ask: p.ask, when: `${pieceWhen(p)} & !f:denny.reveal.first=${p.k}`, to: 'silence' })),
  { ask: '32:5.15.c7', say: ['32:5.15.7'], end: true },
];
export const CONF_BEATS = 9; // 32 §5.15's confession: its paragraphs, one beat each (informant-cast.js splits 32:5.15.conf)
export const REVEAL = {
  id: 'reveal', who: 'denny',
  nodes: {
    rock: { say: ['32:5.15.rock.1', '32:5.15.rock.2'], then: ['f:denny.reveal.met'], to: 'lay' },
    cabin: { say: ['32:5.15.cabin'], then: ['f:denny.reveal.met'], to: 'lay' },
    // the note opens it with no pieces: the confession plays from its silence (32 §5.17)
    note: { say: ['32:5.17.got'], then: ['f:denny.reveal.met'], to: 'silence' },
    lay: { go: [...lay, { ask: '32:5.15.c7', say: ['32:5.15.7'], end: true }] },
    second: { go: second },
    silence: { say: ['32:5.15.silence'], go: [{ ask: '32:5.16.2.c1', to: 'conf' }, { ask: '32:5.15.silence', to: 'conf' }] },
    conf: { say: Array.from({ length: CONF_BEATS }, (_, k) => ({ hook: `conf${k}` })), to: 'gives' },
    gives: { say: ['32:5.15.gives.1', '32:5.15.gives.2', '32:5.15.gives.3'], then: ['f:denny.revealed', 'f:denny.wade', 'do:card'], to: 'choice' },
    choice: { go: [
      { ask: '32:5.15.c14', once: 'alive', when: 'north & !f:denny.toldAlive', say: ['32:5.15.alive'], then: ['f:denny.toldAlive'], to: 'choice' },
      { ask: '32:5.15.c15', then: ['f:choice.denny=turn'], to: 'turn' },
      { ask: '32:5.15.c16', then: ['f:choice.denny=told'], to: 'told' },
      { ask: '32:5.15.c17', then: ['f:choice.denny=left'], to: 'left' }] },
    // 5.16.1 Turn him
    turn: { say: ['32:5.16.1.1'], go: [
      { ask: '32:5.16.1.c1', say: ['32:5.16.1.2'], to: 'turnKnew' },
      { ask: '32:5.16.1.c4', say: ['32:5.16.1.5'], to: 'turnEnd' }] },
    turnKnew: { go: [
      { ask: '32:5.16.1.c2', say: ['32:5.16.1.3'], to: 'turnEnd' },
      { ask: '32:5.16.1.c3', say: ['32:5.16.1.4'], to: 'turnEnd' }] },
    turnEnd: { say: ['32:5.16.1.6'], go: [{ ask: '32:5.16.1.c5', say: ['32:5.16.1.7'], end: true }] },
    // 5.16.2 Tell the boys: Denny tells them, or you do (the reactions are the same)
    told: { say: ['32:5.16.2.1'], go: [
      { ask: '32:5.16.2.c1', then: ['f:denny.told.by=denny', 'do:yard'], to: 'tellDenny' },
      { ask: '32:5.16.2.c2', then: ['f:denny.told.by=player', 'do:yard'], to: 'tellYou' }] },
    tellDenny: { say: [B('32:5.16.2.2', 'Denny'), B('32:5.16.2.3', 'Frank'), B('32:5.16.2.4', 'Bob'), B('32:5.16.2.5', 'Denny'), B('32:5.16.2.6', 'Bob'), B('32:5.16.2.7', 'Frank')], then: ['f:denny.told.scene', 'do:toldEnd'], end: true },
    tellYou: { say: [B('32:5.16.2.player', 'You'), B('32:5.16.2.3', 'Frank'), B('32:5.16.2.4', 'Bob'), B('32:5.16.2.5', 'Denny'), B('32:5.16.2.6', 'Bob'), B('32:5.16.2.7', 'Frank')], then: ['f:denny.told.scene', 'do:toldEnd'], end: true },
    // 5.16.3 Leave it
    left: { say: ['32:5.16.3.1'], end: true },
  },
};
// ctx: { atRock }
export function revealEntry(s, ctx = {}) {
  if (s.has('denny.revealed')) return null;
  if (s.has('denny.note') && !ctx.atRock) return 'note';
  return ctx.atRock ? 'rock' : 'cabin';
}
export const RELAY = ['32:5.16.1.8', '32:5.16.1.9', '32:5.16.1.10']; // the turned Denny's week lines, in order, then none

// --- Frank and Bob when stream b5's scenes aren't loaded (this stream's rig; the join uses extendBoys instead) ----------------
export const FRANK_FARM = { id: 'frankI', who: 'frank', nodes: { hello: { say: ['32:5.7.3'], then: ['f:frank.met'], to: 'hub' }, ...FRANK_NODES, hub: { go: FRANK_I } } };
export const BOB_STORE = { id: 'bobI', who: 'bob', nodes: { hello: { then: ['f:bob.met'], to: 'hub' }, hub: { go: BOB_I } } };
export function frankIEntry(s) { return s.get('choice.denny') === 'told' && !s.has('frank.thanked') ? 'afterTold' : 'hello'; }

// the join's one call: these topics into stream b5's hubs and these nodes into its scenes (idempotent)
export function extendBoys({ DENNY, FRANK, BOB } = {}) {
  const add = (S, list, nodes = {}) => {
    if (!S || !S.nodes || !S.nodes.hub) return;
    const hub = S.nodes.hub.go || (S.nodes.hub.go = []);
    for (const t of list) if (!hub.some((g) => g.ask === t.ask && (g.tag || null) === (t.tag || null))) hub.push(t);
    for (const [k, n] of Object.entries(nodes)) if (!S.nodes[k]) S.nodes[k] = n;
  };
  add(DENNY, DENNY_I, { tell3: TELL3, relay: DENNY_CABIN.nodes.relay, slept: DENNY_CABIN.nodes.slept, hi: DENNY_CABIN.nodes.hi, visit: DENNY_CABIN.nodes.visit });
  add(FRANK, FRANK_I, FRANK_NODES);
  add(BOB, BOB_I);
}

// the Walt page (32 §6): every piece and frame sits under "Somebody told them where Walt was." (walt-lines.js `// i:`)
export const CASE_LINES = ['32:6.1', '32:6.2', '32:6.3', '32:6.4', '32:6.5', '32:6.6', '32:6.7', '32:6.8', '32:6.9', '32:6.10', '32:6.11',
  '32:6.12', '32:6.13', '32:6.14', '32:5.10.w', '32:5.10.w35', '32:5.11.seen', '32:5.11.heard', '32:5.11.clear', 'd95.i.clear.bob',
  '32:5.11.shared', '32:5.12.w2', '32:5.12.w2b', '32:5.12.w3', '32:5.13.deduce', '32:5.13.folder.w', '32:5.13.folder.w2', '32:5.14.flare',
  '32:5.15.call', '32:5.15.hill', '32:5.15.resolved'];
