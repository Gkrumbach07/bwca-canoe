// Act I's scenes as data (stream T; docs/story/20-opening.md §1.2 P1, §6 the porch T1–T6 and X1/X2, §9.2 the re-hooks
// R1–R7, §12 the turn U1–U6). Every line is an id into src/story-data/text/opening.json (topics.js T); the shape is
// topics.js SceneRun's. Node only: no game imports, so story-lint.mjs and scripts/c1-talk-unit.mjs read it.
//
// The crews' landing (stream L's place, 20 §11.2) is read through these facts; L's verbs write them:
//   crews.seen (any of the three looked at), landing.crib, landing.grade, landing.blaze, landing.pink, landing.nwDrift (the
//   canoe off the rock in a north-west wind, 11.4: not built yet), landing.nb20 (NB20 read there, 11.3; rules-layer.js)
export const LANDING = { seen: 'crews.seen', crib: 'landing.crib', grade: 'landing.grade', blaze: 'landing.blaze', pink: 'landing.pink', nwdrift: 'landing.nwDrift', nb20: 'landing.nb20' }; // (the join: stream L's names, story-places.json)
const L = LANDING;
// the notebook pages the scenes read (stream B's marks): NB45 has a Finnish word (the Swede test, slice step 4); NB88
// is the last page
export const NB = { finnish: 'NB45', last: 'NB88' };

const WARM = 'f:tauno.porch.warm', BOOK = 'f:tauno.porch.toldBook';

// --- 1.1 The porch: Tauno stops you (T1–T6, X1, X2) and the re-hooks that lead back into it (R3, R4, R5, R7) ----------
export const PORCH = {
  id: 'porch', who: 'tauno',
  nodes: {
    // T1 — the patch
    T1: { say: [{ first: [{ id: '20:T1.2', when: 'cold' }, '20:T1.1'] }],
      go: [{ ask: '20:T1.c1', to: 'T2' }, { ask: '20:T1.c2', to: 'T2' }, { ask: '20:T1.c3', to: 'T1b' }] },
    T1b: { say: ['20:T1b.1'], go: [{ ask: '20:T1b.c1', to: 'T2' }, { ask: '20:T1b.c2', to: 'X1' }] },
    // T2 — walk with me (R3's "You again." and the Farm seat's "Changed your mind?" lead here too)
    T2: { say: [{ first: [{ id: '20:T2.2', when: 'cold' }, '20:T2.1'] }], go: [{ ask: '20:T2.c1', to: 'T3' }, { ask: '20:T2.c2', to: 'X1' }] },
    R3: { say: ['20:9.2#R3.0', '20:9.2#R3.1'], then: ['f:rehook.R3'], go: [{ ask: '20:T2.c1', to: 'T3' }, { ask: '20:T2.c2', to: 'X1' }] },
    changed: { say: ['20:9.2#R3.2'], go: [{ ask: '20:T2.c1', to: 'T3' }, { ask: '20:T2.c2', to: 'X1' }] },
    // T3 — bait, and the test (walking with him is the porch done: tauno.porch.done)
    T3: { say: ['20:T3.1', '20:T3.2', '20:T3.3'], then: ['f:tauno.porch.done', 'f:knows.walt'], go: [
      { ask: '20:T3.c1', when: `read:${NB.finnish}`, then: ['f:tauno.porch.warm', 'f:knows.haapala', 'walt:20:T3.w1'], say: ['20:T3.4'], to: 'T4' },
      { ask: '20:T3.c2', say: ['20:T3.5'], to: 'T4' },
      { ask: '20:T3.c3', say: ['20:T3.6'], to: 'T4' },
      { ask: '20:T3.c4', when: 'f:nb.found', then: ['f:tauno.porch.toldBook'], say: ['20:T3.7'], to: 'T3b' }] },
    T3b: { go: [
      { ask: '20:T3.c1', when: `read:${NB.finnish}`, then: ['f:tauno.porch.warm', 'f:knows.haapala', 'walt:20:T3.w1'], say: ['20:T3.4'], to: 'T4' },
      { ask: '20:T3.c2', say: ['20:T3.5'], to: 'T4' },
      { ask: '20:T3.c3', say: ['20:T3.6'], to: 'T4' }] },
    // T4 — the hub: each topic goes once used; "What do you want from me?" (always) is the way to T5
    T4: { go: [
      { ask: '20:T4.c1', once: 't4.who', say: ['20:T4.1', { id: '20:T4.2', when: WARM }], then: ['walt:20:T4.w1'] },
      { ask: '20:T4.c2', once: 't4.knew', say: ['20:T4.3'], to: 'T4knew' },
      { ask: '20:T4.c4', once: 't4.brm', say: ['20:T4.5'], then: ['f:knows.boreal'], to: 'T4brm' },
      { ask: '20:T4.c6', once: 't4.where', say: ['20:T4.7'], then: ['walt:20:T4.w5'], to: 'T4where' },
      { ask: '20:T4.c9', once: 't4.brother', when: 'f:tauno.said.t4.where | f:tauno.said.t4.brm', say: ['20:T4.10'], then: ['walt:20:T4.w7'], to: 'T4brother' },
      { ask: '20:T4.c11', once: 't4.coming', when: `read:${NB.last} & ${BOOK}`, say: ['20:T4.12'], to: 'T4coming' },
      { ask: '20:T4.c13', once: 't4.cellar', when: BOOK, say: ['20:T4.14'], then: ['walt:20:T4.w10'] },
      { ask: '20:T4.c14', once: 't4.why', say: ['20:T4.15'] },
      { ask: '20:T4.c15', once: 't4.whoare', say: [{ first: [{ id: '20:T4.16', when: WARM }, '20:T4.17'] }], then: [{ when: WARM, then: ['walt:20:T4.w11', 'f:knows.tauno'] }] },
      { ask: '20:6.6.c1', once: 't4.here', when: '!farm', say: [{ hook: 'here' }], to: 'T4' },
      { ask: '20:T4.c16', to: 'T5' }] },
    T4knew: { hub: 'T4', go: [{ ask: '20:T4.c3', once: 't4.doing', say: ['20:T4.4'], then: ['walt:20:T4.w3', 'f:said.tauno.wrote'], to: 'T4' }] },
    T4brm: { hub: 'T4', go: [{ ask: '20:T4.c5', once: 't4.brm2', say: ['20:T4.6'], then: ['walt:20:T4.w4'], to: 'T4' }] },
    T4where: { hub: 'T4', go: [{ ask: '20:T4.c7', once: 't4.where2', say: ['20:T4.8'], then: ['walt:20:T4.w6'], to: 'T4where2' }] },
    T4where2: { hub: 'T4', go: [{ ask: '20:T4.c8', once: 't4.where3', say: ['20:T4.9'], to: 'T4' }] },
    T4brother: { hub: 'T4', go: [{ ask: '20:T4.c10', once: 't4.brother2', say: ['20:T4.11'], then: ['walt:20:T4.w8'], to: 'T4' }] },
    T4coming: { hub: 'T4', go: [{ ask: '20:T4.c12', once: 't4.coming2', say: ['20:T4.13'], then: ['walt:20:T4.w9'], to: 'T4' }] },
    // T5 — the door
    T5: { say: ['20:T5.1', { id: '20:T5.2', when: WARM }], go: [
      { ask: '20:12.1.c1', when: `f:${L.seen}`, then: ['f:door.crews.taken', 'f:tauno.said.t5'], to: 'turn' },
      { ask: '20:T5.c1', once: 't5.crib', say: ['20:T5.3'] },
      { ask: '20:T5.c2', once: 't5.why', say: ['20:T5.4'] },
      { ask: '20:T5.c3', once: 't5.mark', say: ['20:T5.5'] },
      { ask: '20:T5.c4', say: [{ first: [{ id: '20:T5.6', when: 'farm', strip: 'I\'m on the porch at Farm most mornings.' }, '20:T5.6'] }], then: ['f:door.crews.taken', 'f:tauno.said.t5'], to: 'T6' },
      { ask: '20:T5.c5', to: 'X2' }] },
    // T6 — the close
    T6: { say: ['20:T6.1', { id: '20:T6.2', when: 'raining' }, { id: '20:T6.3', when: 'snowing' }], end: true, then: ['do:done'] },
    // X1 — declined at the porch (once: declined1; again, after R3: declined2)
    X1: { say: ['20:X1.1'], then: ['do:decline'], end: true },
    // X2 — declined at the door: the lead anyway, in words (door.crews.declined)
    X2: { say: ['20:X2.1'], then: ['f:door.crews.declined', 'f:tauno.said.t5', 'do:done'], end: true },
    // walking away mid-scene, and coming back to it ("Where was I.")
    resume: { say: ['20:6.5.2'], to: 'T4' },
    // the turn straight on from the porch (12.1: the landing stood on before the porch)
    turn: { to: 'U1' },
    // R4 — the door taken, the crib not seen, three trips on (once): "You go look at that crib?"
    R4: { say: ['20:9.2#R4.0'], then: ['f:rehook.R4'], go: [
      { ask: '20:9.2#R4.1', say: ['20:9.2#R4.2', '20:9.2#R4.3'], end: true },
      { ask: '20:9.2#R4.4', say: ['20:9.2#R4.5'], end: true }] },
    // R5 — declined at the door (once): "Still just here to paddle?"
    R5: { say: ['20:9.2#R5.0'], then: ['f:rehook.R5'], go: [
      { ask: '20:9.2#R5.1', say: ['20:9.2#R5.2'], end: true },
      { ask: '20:9.2#R5.3', to: 'T5' }] },
    // R7 — the season turned over (once): "Ice is out."
    R7: { say: ['20:9.2#R7.0', '20:9.2#R7.1'], then: ['f:rehook.R7'], go: [
      { ask: '20:9.2#R7.2', say: ['20:9.2#R7.3', { id: '20:9.2#R7.4', when: 'f:door.crews.taken & !f:crews.seen' }], end: true },
      { ask: '20:9.2#R7.5', say: ['20:9.2#R7.6'], end: true }] },
    // after the turn, his morning seat: a word, and the doors again if asked. The join (slice step 7, 10 §7, 30 §4.1):
    // Walt's two mining-years nicknames, asked while on the Walt page and not yet inked, are his to read (NB31, NB20)
    seat: { say: [{ first: [{ id: '20:6.6.1', when: 'farm' }, '20:U5.2'] }], go: [
      { ask: '30:4.1.c6', once: 'seat.twostump', when: 'nickseen:twostump & !f:ink.twostump & !und:NB31', to: 'twostump' },
      { ask: '30:4.1.c9', once: 'seat.vwater', when: 'nickseen:vwater & !f:ink.vwater & !und:NB20', say: ['30:4.1.17'], then: ['f:knows.vwater'] }] },
    twostump: { say: ['30:4.1.14'], go: [
      { ask: '30:4.1.c7', say: ['30:4.1.15'], then: ['f:knows.twostump'], to: 'seat2' },
      { ask: '30:4.1.c8', say: ['30:4.1.16', '30:4.1.15'], then: ['f:knows.twostump'], to: 'seat2' }] }, // ("the same answer, shorter")
    seat2: { hub: 'seat', go: [] },

    // --- 1.3 The turn (U1–U6) -------------------------------------------------------------------------------------------
    U1: { say: [{ first: [{ id: '20:U1.2', when: 'farm & first' }, '20:U1.1'] }], go: [
      { ask: '20:U1.c2', once: 'u1.crib', when: `f:${L.crib}`, say: ['20:U1.3'] },
      { ask: '20:U1.c3', once: 'u1.pink', when: `f:${L.pink}`, to: 'U2' },
      { ask: '20:U1.c4', once: 'u1.blaze', when: `f:${L.blaze}`, say: [{ first: [{ id: '20:U1.4', when: WARM }, '20:U1.5'] }], then: [{ when: `!${WARM}`, then: ['walt:20:U1.w1', 'f:knows.orange'] }] },
      { ask: '20:U1.c5', once: 'u1.wind', when: `f:${L.nwdrift}`, say: ['20:U1.6'], to: 'U1wind' },
      { ask: '20:U1.c7', once: 'u1.read', when: `f:${L.nb20} & ${BOOK}`, say: ['20:U1.8'], to: 'U1read' },
      { ask: '20:U1.c9', when: `count(tauno.said.u1.*)>=1 | !(f:${L.crib} | f:${L.pink} | f:${L.blaze} | f:${L.nwdrift})`, to: 'U3' }] },
    U1wind: { go: [{ ask: '20:U1.c6', say: ['20:U1.7'], to: 'U1' }] },
    U1read: { go: [{ ask: '20:U1.c8', say: ['20:U1.9'], then: ['walt:20:U1.w2'], to: 'U1' }] },
    // U2 — pink
    U2: { say: ['20:U2.1'], go: [{ ask: '20:U2.c1', say: ['20:U2.2'], to: 'U2b' }] },
    U2b: { go: [{ ask: '20:U2.c2', say: ['20:U2.3'], then: ['f:tauno.pink', 'walt:20:U2.w1'], to: 'U3' }] },
    // U3 — Eino (the turn is the end of this node: tauno.turn)
    U3: { say: [
      { first: [{ id: '20:U3.2', when: 'f:knows.eino' }, { id: '20:U3.1', when: 'f:tauno.pink', strip: 'You stood where they found the canoe. So.' }, '20:U3.1'] },
      '20:U3.3', '20:U3.4', '20:U3.5', '20:U3.6',
      { first: [{ id: '20:U3.8', when: `f:${L.nwdrift}` }, '20:U3.7'] }],
    then: ['f:knows.eino', 'walt:w.turn.eino', 'walt:w.turn.year'], go: [
      { ask: '20:U3.c1', say: ['20:U3.9'], to: 'U3b' },
      { ask: '20:U3.c2', say: ['20:U3.10', { id: '20:U3.11', when: `f:${L.nwdrift}` }], to: 'U3b' },
      { ask: '20:U3.c3', say: ['20:U3.12'], to: 'U3b' }] },
    U3b: { then: ['f:tauno.upwind', 'f:tauno.turn', 'walt:w.turn.ollie', 'walt:w.turn.ducks', 'walt:w.turn.canoe', 'walt:w.turn.jacket', 'walt:w.turn.coroner', { when: `f:${L.nwdrift}`, then: ['walt:w.turn.drift'] }], go: [
      { ask: '20:U3.c4', once: 'u3.jacket', say: ['20:U3.13'], then: ['f:said.tauno.jacket'] },
      { ask: '20:U3.c5', once: 'u3.ollie', say: ['20:U3.14'] },
      { ask: '20:U4.c1', say: ['20:U4.1'], then: ['f:tauno.killed', 'walt:20:U4.w1'], to: 'U4after' },
      { ask: '20:U4.c2', say: ['20:U4.2'], then: ['f:tauno.killed', 'walt:20:U4.w1'], to: 'U4after' },
      { ask: '20:U4.c3', once: 'u4.who', say: ['20:U4.3'] },
      { ask: '20:U4.c4', once: 'u4.why', say: ['20:U4.4'] }] },
    // U4 — the word, said: then the Swede and his name, each only if it applies
    U4after: { say: [{ id: '20:U4.5', when: `!${WARM}` }, { id: '20:U4.6', when: '!f:knows.tauno' }], then: [{ when: `!${WARM}`, then: ['walt:20:U4.w2'] }, { when: '!f:knows.tauno', then: ['walt:20:U4.w3', 'f:knows.tauno'] }], to: 'U5' },
    // U5 — the doors
    U5: { say: [{ first: [{ id: '20:U5.1', when: 'farm', strip: 'And come find me at Farm, mornings.' }, '20:U5.1'] }, { id: '20:U5.2', when: 'farm' }],
      then: ['f:door.guiding.named', 'f:door.boys.named', 'f:door.family.named', 'f:door.mining.named', 'f:tauno.doors', 'walt:w.door.guiding', 'walt:w.door.boys', 'walt:w.door.family', 'walt:w.door.mining'], go: [
        { ask: '20:U5.c1', once: 'u5.marlys', say: ['20:U5.3'] },
        { ask: '20:U5.c2', once: 'u5.fellas', say: ['20:U5.4'] },
        { ask: '20:U5.c3', once: 'u5.aili', say: ['20:U5.5'] },
        { ask: '20:U5.c4', once: 'u5.farm', say: ['20:U5.6'] },
        { ask: '20:U5.c5', to: 'U6' }] },
    U6: { say: ['20:U6.1'], then: ['do:done'], end: true },
    // walking away mid-turn: the next porch picks up at the first node not finished ("Where was I.")
    resumeU1: { say: ['20:6.5.2'], to: 'U1' },
    resumeU4: { say: ['20:6.5.2'], to: 'U3b' },
    resumeU5: { say: ['20:6.5.2'], to: 'U5' },
  },
};
// "That's enough for today." (20 §6.2, §12.2): walking away mid-scene; what's been said stays
export const WALK_AWAY = '20:U6.2';
// the nodes before T3: walking off there is "[Keep walking]", a decline (X1); after T3 the scene is kept for later
export const PRE_T3 = new Set(['T1', 'T1b', 'T2', 'R3', 'changed']);
// where Tauno's scene starts, from where the story stands (cast.js entry; scripts/story-solve.mjs reads the same).
// s: { has(k), keys(prefix) }; scene: the slot's own (CAST where[].scene) or 'auto'
export function porchEntry(s, scene = 'auto') {
  let e = scene || 'auto';
  if (e === 'R4' && s.has('crews.seen')) e = 'auto';
  // the porch's own openers once he's been walked with: a walk-off after T3 and E on him again picks up ("Where was I."),
  // never the patch again (chk-c1a 2: it replayed T1, and [Keep walking] from there declined on top of porch.done)
  if ((e === 'T1' || e === 'R3' || e === 'changed') && s.has('tauno.porch.done')) e = 'auto';
  if (e !== 'auto') return e;
  if (!s.has('tauno.porch.done')) return s.has('tauno.porch.declined2') ? 'changed' : 'T1';
  if (!s.has('door.crews.taken') && !s.has('door.crews.declined')) return 'resume';
  if (s.has('crews.seen') && !s.has('tauno.turn')) return s.keys('tauno.said.u1.').length ? 'resumeU1' : 'U1';
  if (s.has('tauno.turn') && !s.has('tauno.killed')) return 'resumeU4';
  if (s.has('tauno.killed') && !s.has('tauno.doors')) return 'resumeU5';
  if (s.has('door.crews.declined') && !s.has('door.crews.taken') && !s.has('crews.seen')) return 'R5';
  return 'seat';
}
// T4 "What are you doing here?" (20 §6.6): why he's on this porch, by outfitter (Farm's replaces the topic: his opener)
export const HERE = { 31: '20:6.6.1', 25: '20:6.6.2', 36: '20:6.6.3', 38: '20:6.6.4', 40: '20:6.6.5', 67: '20:6.6.6', 6: '20:6.6.7', 16: '20:6.6.8', 1: '20:6.6.9', 12: '20:6.6.10', 51: '20:6.6.11', 64: '20:6.6.12', 49: '20:6.6.13', 69: '20:6.6.14' };

// --- P1 The counter (20 §1.2, §1.3): the keeper by manner, Josie by the week, the bundle --------------------------------
export const P1 = {
  id: 'p1', who: 'josie',
  // the keeper's line by manner (said `by` the keeper), then Josie's week (the rentals are out every time)
  keeper: ['20:1.2.1', '20:1.2.2', '20:1.2.3', '20:1.2.4', '20:1.2.5', '20:1.2.6'],
  // by the new save's date (doy: the opener ~ 15 May, mid-June ~ 15 June, Labour Day ~ 1 September, 1 October)
  week: [{ to: 135, id: '20:1.2.7' }, { to: 166, id: '20:1.2.8' }, { to: 244, id: '20:1.2.9', third: '20:1.2.10' }, { to: 273, id: '20:1.2.11' }, { to: 366, id: '20:1.2.12' }],
  // where it was in the back ("behind the …"), and the extra Josie line two outfitters have
  backroom: { 51: '20:1.3.1', 64: '20:1.3.2', 49: '20:1.3.3', 69: '20:1.3.4', 40: '20:1.3.5', 38: '20:1.3.6', 36: '20:1.3.7', 67: '20:1.3.8', 25: '20:1.3.9', 31: '20:1.3.11', 6: '20:1.3.12', 16: '20:1.3.13', 1: '20:1.3.14', 12: '20:1.3.15' },
  extra: { 25: '20:1.3.10', 12: '20:1.3.16' },
  nodes: {
    open: { say: [{ hook: 'keeper' }, { hook: 'week' }], to: 'offer' },
    offer: { say: ['20:1.2.13', { hook: 'bundle' }, { hook: 'extra' }], go: [
      { ask: '20:1.2.c1', say: ['20:1.2.15'] },
      { ask: '20:1.2.c2', once: 'p1.whose', say: ['20:1.2.16'] },
      { ask: '20:1.2.c3', once: 'p1.brm', say: ['20:1.2.17'] },
      { ask: '20:1.2.c4', say: ['20:1.2.18'], to: 'much' },
      { ask: '20:1.2.c5', say: ['20:1.2.19'], then: ['do:take'], end: true },
      { ask: '20:1.2.c6', say: ['20:1.2.20'], then: ['do:shelf'], end: true }] },
    much: { go: [
      { ask: '20:1.2.c7', say: ['20:1.2.19'], then: ['do:take'], end: true },
      { ask: '20:1.2.c8', say: ['20:1.2.20'], then: ['do:shelf'], end: true }] },
  },
};

// --- R1 / R1b: Josie, the bundle left on the shelf (20 §9.2) ------------------------------------------------------------
export const JOSIE = {
  id: 'josie', who: 'josie',
  nodes: {
    R1: { say: ['20:9.2#R1.0'], then: ['f:rehook.R1'], go: [
      { ask: '20:9.2#R1.1', say: ['20:1.2.19'], then: ['do:take'], end: true },
      { ask: '20:9.2#R1.2', say: ['20:9.2#R1.3'], end: true }] },
    R1b: { say: ['20:9.2#R1b.0'], then: ['f:rehook.R1b'], go: [
      { ask: '20:9.2#R1.1', say: ['20:1.2.19'], then: ['do:take'], end: true },
      { ask: '20:9.2#R1.2', say: ['20:9.2#R1.3'], end: true }] },
    // after R1b, only if asked: the counter topic that stays forever
    still: { say: ['20:9.2#R1b.2'], go: [
      { ask: '20:9.2#R1.1', say: ['20:1.2.19'], then: ['do:take'], end: true },
      { ask: '20:9.2#R1.2', end: true }] },
  },
};
