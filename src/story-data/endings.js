// The two endings, the epilogue and the postcard as data (story Round 3, stream n; docs/build/campaign-design.md §9,
// Part 3 #5–#6; docs/story/50-finale.md §7–§12, 70-world-texture.md §6.7–§6.8). Every line is an id into
// src/story-data/text/finale.json (or world.json / company.json); the scenes are topics.js SceneRun's shape, as
// mining.js. Node only (no game imports): story-lint.mjs, story-solve.mjs (the endings' proof) and the unit check read
// it, and endings.js plays it.
//
//   WADE · MAGGIE · DAN_J · DAN_M · JOSIE_CARD · TOM_CAMP · MAGGIE_AFTER   the scenes ({ id, who, nodes })
//   commitEnding(s, { end, walt, read, lot, src }) → bool   the ending written (the only writer of `end`): facts below
//   lotFor(s, ep, { abs, served, met }) → { stage, wagon, dan, wade, why }   who is in a lot this morning
//   upcharge(s, ep) → multiplier   the money ending's cold shoulder (Part 3 #6), per owner until owner.<ep>.softened
//   consultingDue(s) → bool        "Consulting — $2,500" on this trip-end tally (M, until Maggie is met again)
//   boardFilter(s, slots, ep) → slots   the board by ending (M: the four who liked Walt drop the player's notices)
//   AFTER        the people's first line after the paper is out (50 §12.3), by who and ending
//   S7_POOLS     70 §6.8's rumours and barks with their conditions (the extract leaves them bare: the J/M split is a
//                heading); ambient.js's n block reads it. S6: no barks (70 §6.7), the loading party's only
//   N_SENSORS    the scene-condition names endings.js reads from the live lot (registered with story-cond)
//
// Facts written (facts.js // n: rows): end (J|JN|M, exclusive) · end.J (journalist, J and JN) · end.JN · end.M ·
// end.walt (named|kept) · end.read (yes|no|silent: Brekke's question, M) · end.lot (the lot's ep) · run.done (the
// letter: r's run.js ends run.active on it) · run.out (walked out of the dawn lot without choosing, the lot's ep) ·
// world.paper (+14 d) · world.resign (+21, J) · world.file (+28, J) · world.trench.closed (+14, J) · world.walt.photo (J,
// with the paper) · world.sampling (+30, J) · world.stakes (+30, M) · world.postcard · world.consulting.stop ·
// world.lastThursday · phone.dan (rules-endings.js writes the dated ones)

// the condition names the dawn lot's scenes read from their own context (the args endings.js passes)
export const N_SENSORS = { carbonRead: 'flag', einoNote: 'flag', stranger: 'flag', danCard: 'flag', needled: 'flag', farm: 'flag', sledArgued: 'flag' };

export const MONEY = 25000;          // $ today, here (50 §9.2: "Twenty-five today, here")
export const CONSULTING = 2500;      // $ each trip-end until Maggie is met again (50 §10)
export const UPCHARGE = 1.35;        // × every outfitter's prices after the money ending, until that owner softens (Part 3 #6; a default)
export const LIKED_WALT = [25, 38, 12, 31]; // the keepers who liked Walt (campaign-design §9: Moose Lake, Sawbill, Little Vermilion, Farm)
export const PAPER_DAYS = 14;        // the Ledger (or the column) two game weeks after the ending (50 §9.1, §11)
export const LEDGER_DAYS = 14;       // ... and on every counter for two game weeks after that
export const MAGGIE_CALL = 40 / 60;  // h: "forty minutes out" (40 6.9.14)
export const STRANGER_WAIT = 1;      // h after first light the wagon comes when Maggie was never met (50 §9.1)
export const PHONE_WAIT = 20 / 60;   // h: Dan arrives in twenty minutes (50 §9.2)
export const FIRST_LIGHT = 5.5;      // h: the dawn lot stages from first light (any later daylight hour the same)
export const LAST_LIGHT = 20.5;      // h: and not after dark
export const KETTLE_FARM = 31;       // Tasha's sampling notice is Farm's (50 §12.2)
export const SAMPLING_PAY = 55;      // $ "pays well" (50 §12.2; a default, the $$$ band)

// the tally's words (50 §10: finished text in backticks, which the extract does not lift; quoted here, word for word)
export const TALLY = {
  money: 'Northmark Metals', consulting: 'Consulting',
  story: { J: 'The papers went to the paper.', JN: 'The papers went to the paper.', M: 'The papers went to the company.' },
};
// lines the extract skips (a speaker line with a stage direction before its colon); word for word from 50 §9.1–§9.2
// (the writers' anchors would replace these: listed in the report)
export const RAW = {
  danOpen: { text: 'Hey. You made it. That\'s a long night.', by: 'Dan' },
  danExactly: { text: 'Okay. I\'m supposed to say this exactly. The number\'s gone up.', by: 'Dan' },
  danAsking: { text: 'I\'m asking you.', by: 'Dan' },
  danWill: { text: '...I will.', by: 'Dan' },
  readDraft: { text: 'C.B.', by: 'Maggie' },
  readCarbon: { text: '\'Spoken to.\'', by: 'Maggie' },
  readLedger: { text: 'L.P. H.V. Two years of it.', by: 'Maggie' },
  readBooks: { text: 'These are originals. You can see where the pencil went through.', by: 'Maggie' },
  taunoIf: { text: 'Well. I said if.', by: 'Tauno' },
  taunoGood: { text: 'Good. That\'s good.', by: 'Tauno' },
  tomSled: { text: 'You told me once to leave the sled. I left it.', by: 'Tom' },
  notWith: 'Not with these.',                    // 50 §8.2 (50:8.2.c1 is the same words)
  nobody: 'Nobody here. Not with these.',        // 50 "New details": an unserved entry point
};

// --- 8.4 Wade, if the player walks to him -------------------------------------------------------------------------------
export const WADE = {
  id: 'n:wade', who: 'wade',
  nodes: {
    start: { say: [{ id: '50:8.4.1', by: 'Wade' }], go: [
      { ask: '50:8.4.c1', once: 'lot.which', say: [{ id: '50:8.4.2', by: 'Wade' }] },
      { ask: '50:8.4.c2', once: 'lot.boots', say: [{ id: '50:8.4.3', by: 'Wade' }] },
      { ask: '50:8.4.c3', once: 'lot.cans', say: [{ id: '50:8.4.4', by: 'Wade' }] }] },
  },
};

// --- 9.1 The journalist: the papers go to Maggie ------------------------------------------------------------------------
// The cans change hands at the first answer (all three: she drops the tailgate); the ending is written at the source
// answer (do:named / do:kept), the close says goodbye (do:close: Dan walks over next, endings.js)
export const MAGGIE = {
  id: 'n:maggie', who: 'maggie',
  nodes: {
    start: { say: [{ id: '50:9.1.1', by: 'Maggie', when: '!stranger' }, { id: '50:9.1.17', by: 'Maggie', when: 'stranger' }], go: [
      { ask: '50:9.1.c1', then: ['do:handed'], to: 'read' },
      { ask: '50:9.1.c2', then: ['do:handed'], to: 'read' },
      { ask: '50:9.1.c3', then: ['do:handed'], to: 'read' }] },
    read: { say: [RAW.readDraft, { ...RAW.readCarbon, when: 'carbonRead' }, { id: '50:9.1.2', by: 'Maggie', when: '!carbonRead' }, RAW.readLedger, RAW.readBooks, { id: '50:9.1.3', by: 'Maggie' }],
      then: [{ when: '!carbonRead', then: ['do:carbon'] }], to: 'source' },
    // Eino's note: a topic before the source question, if the player has it (in hand or in the book)
    source: { say: [{ id: '50:9.1.5', by: 'Maggie' }], go: [
      { ask: '50:9.1.c4', once: 'end.note', when: 'einoNote', say: [{ id: '50:9.1.4', by: 'Maggie' }] },
      { ask: '50:9.1.c5', when: 'north', to: 'sure' },
      { ask: '50:9.1.c8', when: 'north', say: [{ id: '50:9.1.9', by: 'Maggie' }], then: ['do:kept'], to: 'who' },
      { ask: '50:9.1.c9', when: '!north', say: [{ id: '50:9.1.10', by: 'Maggie' }], then: ['do:kept'], to: 'who' }] },
    sure: { say: [{ id: '50:9.1.6', by: 'Maggie' }], go: [
      { ask: '50:9.1.c6', say: [{ id: '50:9.1.7', by: 'Maggie' }], then: ['do:named'], to: 'who' },
      { ask: '50:9.1.c7', say: [{ id: '50:9.1.8', by: 'Maggie' }], then: ['do:kept'], to: 'who' }] },
    // "Who else": one line each, as conditions allow (never to a stranger)
    who: { say: [
      { id: '50.who.1', by: 'Maggie', when: '!stranger & f:tauno.record' },
      { id: '50.who.2', by: 'Maggie', when: '!stranger & f:sheila.in' },
      { id: '50.who.3', by: 'Maggie', when: '!stranger & f:denny.revealed' },
      { id: '50.who.4', by: 'Maggie', when: '!stranger & f:frank.folder' },
      { id: '50:9.1.11', by: 'Maggie' }], then: ['do:close'], end: true },
  },
};
// Dan walks over after the wagon goes (50 §9.1 "Dan.")
export const DAN_J = {
  id: 'n:danj', who: 'dan',
  nodes: {
    start: { say: [{ id: '50:9.1.14', by: 'Dan' }], go: [
      { ask: '50:9.1.c10', say: [{ id: '50:9.1.15', by: 'Dan' }], then: ['f:dan.end.sale'], end: true },
      { ask: '50:9.1.c11', say: [RAW.danWill], then: ['f:dan.end.askcarl'], end: true },
      { ask: '50:9.1.c12', say: [{ id: '50:9.1.16', by: 'Dan' }], then: ['f:dan.end.silent'], end: true }] },
  },
};

// --- 9.2 The company's money: the papers go to Northmark ---------------------------------------------------------------
export const DAN_M = {
  id: 'n:danm', who: 'dan',
  nodes: {
    start: { say: [RAW.danOpen, RAW.danExactly, { id: '50:9.2.1', by: 'Dan' }], to: 'offer' },
    offer: { go: [
      { ask: '50:9.2.c1', when: 'north', to: 'wade' },
      { ask: '50:9.2.c1', when: '!north', to: 'hand' },
      { ask: '50:9.2.c2', say: [{ id: '50:9.2.2', by: 'Dan' }], to: 'what' },
      { ask: '50:9.2.c5', then: ['do:turnback'], end: true }] },
    what: { go: [
      { ask: '50:9.2.c3', say: [RAW.danAsking], to: 'offer' },
      { ask: '50:9.2.c4', to: 'offer' }] },
    // the Walt page says "went north": Wade walks over first (the one promise the company keeps)
    wade: { say: [{ id: '50:9.2.3', by: 'Wade' }], go: [
      { ask: '50:9.2.c6', to: 'hand' },
      { ask: '50:9.2.c7', then: ['do:turnback'], end: true }] },
    // the hand-over: the cans to Dan; the passenger window comes down (the ending is written here; Brekke's question after)
    hand: { then: ['do:handover'], say: [{ id: '50:9.2.4', by: 'Brekke' }], go: [
      { ask: '50:9.2.c8', say: [{ id: '50:9.2.5', by: 'Brekke' }], then: ['do:readyes'], to: 'ring' },
      { ask: '50:9.2.c9', say: [{ id: '50:9.2.6', by: 'Brekke' }], then: ['do:readno'], to: 'ring' },
      { ask: '50:9.2.c10', then: ['do:readsilent'], to: 'ring' }] },
    ring: { say: [{ id: '50:9.2.7', by: 'Brekke', when: 'needled' }, { id: '50:9.2.8', by: 'Brekke', when: '!needled' }], then: ['do:close'], end: true },
  },
};

// --- 11 The postcard (Josie at the home counter) -----------------------------------------------------------------------
export const JOSIE_CARD = {
  id: 'n:postcard', who: 'josie',
  nodes: {
    start: { then: ['do:card'], say: [{ id: '50:11.1', by: 'Josie' }], go: [
      { ask: '50:11.c1', say: [{ id: '50:11.2', by: 'Josie' }], end: true },
      { ask: '50:11.c2', say: [{ id: '50:11.3', by: 'Josie' }], end: true },
      { ask: '50:11.c3', end: true }] },
  },
};
// the card's back line by ending (50 §11's table), and the Walt page's new line for Walt
export const CARD_LINE = { J: '50:11.4', JN: '50:11.5', M: '50:11.6' };
export const CARD_WALT = '50:11.c4'; // "Alive. Atikokan, this fall."

// --- 12.4 Tom Becker and the camp (journalist only). Part 3 #5: the camp always stays (campHaul off), whatever he is told
export const TOM_CAMP = {
  id: 'n:tom', who: 'tom',
  nodes: {
    start: { say: [{ ...RAW.tomSled, when: 'sledArgued' }, { id: '50:12.4.1', by: 'Tom' }], go: [
      { ask: '50:12.4.c1', say: [{ id: '50:12.4.2', by: 'Tom' }], then: ['f:tom.camp=history'], end: true },
      { ask: '50:12.4.c2', say: [{ id: '50:12.4.3', by: 'Tom' }], then: ['f:tom.camp=junk'], end: true },
      { ask: '50:12.4.c3', say: [{ id: '50:12.4.4', by: 'Tom' }], then: ['f:tom.camp=nothing'], end: true }] },
  },
};
// Maggie met again: M (consulting stops with this line), J (May at Hog Creek, "fishing")
export const MAGGIE_AFTER = {
  id: 'n:maggie.after', who: 'maggie',
  nodes: {
    m: { say: [{ id: '50:12.3.5', by: 'Maggie' }], then: ['do:stop'], end: true },
    j: { say: [{ id: '50.after.maggie.j.2', by: 'Maggie' }], then: ['f:maggie.after.j'], end: true },
  },
};
export const MAGGIE_AT = 36; // Hog Creek: her bunkhouse, "fishing" (50 §12.3; 90 cast table)

// --- 12.3 People, by ending: the first line next time they are met after the paper is out ------------------------------
// [who, ending condition, line id, extra condition]; the first that holds is said once (f:<who>.after)
export const AFTER = [
  ['tauno', 'end:J|JN & f:tauno.record', '50.after.tauno.jr.1'],
  ['tauno', 'end:J|JN & !f:tauno.record', '50.after.tauno.j'],
  ['aili', 'end:J & f:aili.knew', '50.after.aili.j.2'],
  ['aili', 'end:J', '50.after.aili.j.2'],
  ['aili', 'end:JN', '50.after.aili.jn'],
  ['aili', 'end:M', '50.after.aili.m'],
  ['liisa', 'end:J|JN & month:12', '50.after.liisa.j'],
  ['jon', 'end:J', '50.after.jon.j'],
  ['jon', 'end:JN', '50.after.jon.jn'],
  ['bob', 'end:J|JN', '50:12.3.1'],
  ['bob', 'end:M', '50:12.3.3'],
  ['frank', 'end:J|JN', '50:12.3.2'],
  ['frank', 'end:M', '50:12.3.4'],
  ['denny', 'end:M & f:denny.turned', '50.after.denny.turned.2'],
  ['denny', 'end:J|JN & f:denny.toldon', '50.after.denny.told'],
  ['denny', 'end:J|JN & f:denny.left', '50.after.denny.left'],
  ['denny', 'end:J|JN & !f:denny.revealed', '50.after.denny.never.1'],
  ['denny', 'end:M & !f:denny.revealed', '50.after.denny.never.2'],
  ['marlys', 'end:J|JN', '50.after.marlys.j'],
  ['marlys', 'end:M', '50.after.marlys.m'],
  ['sheila', 'end:J|JN & f:sheila.in', '50.after.sheila.jin'],
  ['sheila', 'end:J|JN', '50.after.sheila.j'],
  ['mary', 'end:J|JN', '50.after.mary.j'],
  ['len', 'end:J|JN', '50.after.len.j'],
  ['len', 'end:M', '50.after.len.m'],
  ['tasha', 'end:J|JN', '50.after.tasha.j'],
  ['tasha', 'end:M', '50.after.tasha.m'],
  ['dan', 'end:J|JN & f:dan.end.askcarl', '50.after.dan.j.2'],
  ['dan', 'end:J|JN', '50.after.dan.j.3'],
  ['dan', 'end:M', '50.after.dan.m'],
  ['wade', 'end:M', '50.after.wade.m'],
];
export function afterLine(s, who, args = {}) {
  if (!s || !s.has('world.paper') || s.has(`${who}.after`)) return null;
  for (const [w, cond, id] of AFTER) if (w === who && s.when(cond, args)) return id;
  return null;
}

// --- 70 §6.8 S7 pools (and §6.7's S6 loading party): the conditions the extract could not attach ----------------------
export const S7_POOLS = {
  rumour: {
    '70.6.8.1': 'end:J|JN & f:world.paper & days.since(world.paper)<=14',
    '70.6.8.2': 'end:J|JN & f:world.resign',
    '70.6.8.3': 'end:J|JN & f:world.trench.closed',
    '70.6.8.4': 'end:J|JN & f:world.sampling',
    '70.6.8.5': 'end:J|JN & f:world.file',
    '70.6.8.6': 'end:JN & f:world.paper & f:nb.found', // j1: Walt lore needs the notebook (c1-talk-unit)
    '70.6.8.9': 'end:M & f:world.paper & days.since(world.paper)<=14',
    '70.6.8.10': 'end:M & f:world.stakes',
    '70.6.8.11': 'end:M & f:world.paper',
    // "A keeper who liked Walt" (the four): their word after the paper
    '70.6.8.8': 'end:J|JN & f:world.paper & (ep:25 | ep:38 | ep:12 | ep:31)',
  },
  bark: {
    '70.6.8.7': 'end:J|JN & f:world.paper',
    '70.6.8.13': 'end:M',
  },
};
export const BOARD_EMPTY = '70.6.8.12'; // said once by a keeper who liked Walt (M), then the board just has none
export const PARTY_DAWN = '70.6.7.1';   // the loading party's goodbye (S6, the dawn lot only)
export const QUIET_KINDS = ['rumour', 'bark', 'party', 'history', 'lore', 'keeper']; // S6: "Nobody talks." (70 §6.7)

// --- who is in a lot this morning (50 §7.3, §8.1) ----------------------------------------------------------------------
// { stage: bool, wagon: 'here' | 'call' | 'stranger' | null, why }. meeting = story.doc.meeting ({ ep, firstDawn })
export function lotFor(s, ep, { abs = 0, hours = 0, served = true } = {}) {
  if (!s) return { stage: false, why: 'no story' };
  if (s.has('end')) return { stage: false, why: 'ended' };
  if (!served) return { stage: false, why: 'unserved' };
  if (hours < FIRST_LIGHT || hours >= LAST_LIGHT) return { stage: false, why: 'dark' };
  const met = !!(s.doc && s.doc.ppl && s.doc.ppl.maggie && s.doc.ppl.maggie.met) || s.has('maggie.met');
  const M = s.doc && s.doc.meeting;
  // p: begin (40 §6.9 "The note under the Little Gabbro permit box"): a meeting set at Little Gabbro is too many trucks;
  // company.js leaves Maggie's note under the box and moves the meeting to Farm, first light tomorrow
  if (M && Number(ep) === 33 && (Number(M.ep) === 33 || M.from === 33) && abs >= Number(M.firstDawn || 0) - (M.from === 33 ? 1 : 0)) return { stage: false, why: 'trucks' };
  // p: end
  let wagon;
  if (!met) wagon = 'stranger';
  else if (M && Number(M.ep) === Number(ep) && abs >= Number(M.firstDawn || 0)) wagon = 'here';
  else wagon = 'call'; // early, another lot, or no meeting set: the morning call, the permit-box phone, forty minutes
  return { stage: true, wagon, dan: true, wade: true, why: wagon };
}

// --- the ending, written (the only writer of `end`) ---------------------------------------------------------------------
// end: 'J' | 'M'; walt: 'named' | 'kept' (J: named with "went north" makes JN); read: Brekke's question (M)
export function commitEnding(s, { end, walt = 'kept', read = null, lot = null, src = 'n:endings' } = {}) {
  if (!s || s.has('end')) return false;
  const letter = end === 'M' ? 'M' : walt === 'named' ? 'JN' : 'J';
  if (!s.set('end', letter, src)) return false;
  if (letter === 'M') s.set('end.M', true, src); else { s.set('end.J', true, src); if (letter === 'JN') s.set('end.JN', true, src); }
  if (letter !== 'M') s.set('end.walt', walt === 'named' ? 'named' : 'kept', src);
  if (letter === 'M' && read) s.set('end.read', read, src);
  if (lot != null) s.set('end.lot', Number(lot), src);
  s.set('run.done', letter, src);
  if (typeof s.emit === 'function') s.emit('run:done', { end: letter, lot });
  return true;
}

// --- the money ending's cold shoulder (Part 3 #6): every outfitter upcharges; softens owner by owner (stream g writes
// owner.<ep>.softened, wave 2) -------------------------------------------------------------------------------------------
export function upcharge(s, ep) {
  if (!s || !s.has('end.M') || ep == null) return 1;
  return s.has(`owner.${Number(ep)}.softened`) ? 1 : UPCHARGE;
}
export function consultingDue(s) { return !!(s && s.has('end.M') && !s.has('world.consulting.stop')); }

// --- the board by ending (campaign-design §9; 50 §12.2) ----------------------------------------------------------------
// M: the four who liked Walt take the player's notices down (a notice already taken stays: it is the player's); J: Farm
// adds Tasha's sampling (endings.js pins it: tasks.js's kinds need the game). slots: the board's four (notice | null)
export function boardFilter(s, slots, ep) {
  if (!s || !Array.isArray(slots)) return slots;
  if (s.has('end.M') && LIKED_WALT.includes(Number(ep)) && !s.has(`owner.${Number(ep)}.softened`)) return slots.map((t) => (t && t.status && t.status !== 'offered' ? t : null));
  return slots;
}
export function samplingOpen(s) { return !!(s && s.has('end.J') && s.has('world.sampling')); }
