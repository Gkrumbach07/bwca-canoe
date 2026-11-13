// The company and the press as data (campaign Round 6, stream p; docs/story/40-company-and-press.md, 30 §4.6 and §4.8,
// campaign-design §8.1–§8.2, §12). Every line is an id into src/story-data/text/*.json (company, mining, drafted); the
// scenes are topics.js SceneRun's shape (as mining.js and endings.js). Node only (no game imports): story-lint,
// story-solve-company.mjs and the unit check read it; company.js plays it.
//
//   TAUNO_CALL · KEEPER_LEDGER · DAN · WADE_COUNTER · WADE_PUTIN · JOSIE_LEECH · MAGGIE · PAD · BREKKE_TABLE   scenes
//   danDue(s, ctx) → 'meet' | 'offer' | 'setup' | 'junk' | null   who Dan is at this counter visit (40 §3.1, §3.2, §3.7)
//   maggieHere(s, { abs, hours, month }) → bool   Maggie at Hog Creek 36 (40 §4.4 "The number", §6.5)
//   meetingFrom(abs, ep, dozens) → { ep, firstDawn, set }   the leech order's code (40 §6.9): dozens = days from today
//   adriftDue(s, w) → bool         the canoe adrift's night (40 §5; campaign-design §8.2 `adrift`)
//   searchDue(s) → bool            the camp search's trip (40 §4.2; §8.2 `campSearch`)
//   P_SENSORS                      the scene-condition names company.js passes as args (registered with story-cond)
//
// Facts (all under declared namespaces): tauno.call (exists) · tauno.call.asked · tauno.call.declined · tauno.big2 ·
// maggie.called (=tauno|marlys|sheila|carol|rene|keeper) · maggie.fallback · maggie.note (the slip's abs day) ·
// maggie.met · maggie.lied · maggie.bunk · maggie.caught · maggie.matched · maggie.ostrander · maggie.kettlemap (L1D) ·
// maggie.e7copy (a2's wrong hill reads it) · maggie.code · maggie.paper · maggie.adrift · maggie.stop · maggie.meeting ·
// maggie.order · maggie.lgnote · midpoint · ev.search (lake) · ev.stranger (portage) · ev.adrift (m's) · dan.met ·
// dan.card · dan.offer · dan.setup · dan.lid · dan.blade · wade.counter · wade.named · wade.helstrom · wade.boots ·
// wade.putin (the EP's name) · choice.brekke (lie|deflect|needle: story.tier adds one for needle) · brekke.needled ·
// brekke.talked · brekke.lovelybook · kettle.lid.sold · josie.vault. The meeting itself is story.doc.meeting
// ({ ep, firstDawn }: r's run.js and n's endings read it).

export const P_SENSORS = { walts: 'flag', hasLid: 'flag', hasBlade: 'flag', bigNew: 'flag', hogHome: 'flag', lenBE: 'flag', lenGrade: 'flag', lenLake: 'flag', seenTauno: 'flag', firstOrder: 'flag', evening: 'flag' };

export const HOG = 36, LAKE_ONE = 30, LITTLE_GABBRO = 33, FARM = 31;
export const MAGGIE_HOURS = [7, 19];        // 40 §6.4: daytime, 7 to 19; the evening on the bunkhouse step
export const MAGGIE_MONTHS = [5, 10];       // June to October; from mid-May in a later season (§6.5)
export const NOTE_DAYS = 3;                 // "Three dozen means three days" (§4.4)
export const SEARCH_AWAY = 300;             // m from the pitched tent (§4.2)
export const SEARCH_MINS = 45;              // game minutes away or out of sight (§4.2)
export const SEARCH_PACKS_MINS = 30;        // the second staging: packs left at a carry's end (§8.2)
export const SEARCH_CAR_DAYS = 6;           // the third: the car in the lot, days after the midpoint (§8.2)
export const DAN_EVERY = 8;                 // "about one counter visit in eight, never twice in a row" (§3.2)
export const OFFER = 1000;                  // $ (§3.7: never collectable)
export const LID_PRICE = 40, BLADE_PRICE = 20; // 30 §4.3, §4.7 (and 30's item table)
export const ADRIFT_WIND = 2.2;             // m/s: "a calm night (wind under 5)" mph (§5)
export const ADRIFT_SHORE = 10;             // m: the tent within about ten metres of the water (§5)
export const CALLERS = { marlys: '40:6.2.4', sheila: '40:6.2.5', carol: '40:6.2.6', rene: '40:6.2.7' };
// Maggie's "How did you hear about me?" by who made the call (40 §6.4; 40.maggie.callers.1 is the doc's "She said")
export const HEARD = { marlys: '40.maggie.callers.2', sheila: '40.maggie.callers.3', carol: '40.maggie.callers.4', rene: '40.maggie.callers.5', keeper: '40.maggie.callers.6' };
// lines quoted in code word for word (a stage direction holds them; no anchor without changing the prose)
export const RAW = {
  danNo: { text: 'Fair. Thirty seconds anyway, then I\'ll leave you alone.', by: 'Dan' }, // 40 §3.7 [If "No": …]
};

// --- 30 §4.8 Tauno's call (the first porch visit after the second big finding) --------------------------------------------
export const TAUNO_CALL = {
  id: 'p:call', who: 'tauno',
  nodes: {
    start: { say: ['30:4.8.1'], then: ['f:tauno.call.asked'], go: [
      { ask: '30:4.8.c1', say: ['30:4.8.2'], then: ['f:tauno.call', 'f:maggie.called=tauno'], end: true },
      { ask: '30:4.8.c2', say: ['30:4.8.3'], then: ['f:tauno.call.declined'], end: true },
      { ask: '30:4.8.c3', once: 'call.why', say: ['30:4.8.4'] }] },
  },
};
// 40 §6.2 "The player's own way": after "Not yet.", asking any keeper about the Ledger makes the call at once
export const KEEPER_LEDGER = { id: 'p.ledger', ask: 'd95.p.ledger.ask', when: 'f:tauno.call.declined & !f:tauno.call & !f:maggie.called', say: ['40:6.2.8'], then: ['f:maggie.called=keeper'] };

// --- Dan at a counter (40 §3.1 tier 1, §3.2 junk, §3.7 the offer and the set-up; 30 §4.3 Leo's lid) ------------------------
export const DAN = {
  id: 'p:dan', who: 'dan',
  nodes: {
    // 3.1: the first time after tier 1 (he talks first)
    meet: { say: [{ id: '40:3.1.1', by: 'Dan' }], go: [
      { ask: '40:3.1.c1', say: [{ id: '40:3.1.2', by: 'Dan' }], to: 'close' },
      { ask: '40:3.1.c2', say: [{ id: '40:3.1.3', by: 'Dan' }, { id: '40:3.1.4', by: 'Dan' }], to: 'close' },
      { ask: '40:3.1.c3', say: [{ id: '40:3.1.5', by: 'Dan' }], to: 'close' },
      { ask: '40:3.1.c4', say: [{ id: '40:3.1.6', by: 'Dan' }, { id: '40:3.1.7', by: 'Dan' }], to: 'close' },
      { ask: '40:3.1.c5', when: 'any(asked.boreal*) | f:tauno.turn', say: [{ id: '40:3.1.8', by: 'Dan' }], to: 'close' },
      { ask: '40:3.1.c6', say: [{ id: '40:3.1.9', by: 'Dan' }, { id: '40:3.1.10', by: 'Dan' }], to: 'close' },
      { ask: '40:3.1.c7', say: [{ id: '40:3.1.11', by: 'Dan' }], to: 'close' }] },
    close: { say: [{ id: '40:3.1.12', by: 'Dan' }], then: ['do:card', 'f:dan.met', 'f:dan.card', 'walt:40:1.3.1'], to: 'coffee' },
    coffee: { say: [{ id: '40:3.1.13', by: 'Dan' }], then: ['do:keeper'], end: true },
    // 3.7: the first counter visit with Dan after the midpoint
    offer: { say: [{ id: '40:3.7.1', by: 'Dan' }, { id: '40:3.7.2', by: 'Dan' }], go: [
      { ask: '40:3.7.c1', to: 'pitch' }, { ask: '40:3.7.c2', to: 'pitch' }, { ask: '40:3.7.c3', say: [RAW.danNo], to: 'pitch' }] },
    pitch: { say: [{ id: '40:3.7.3', by: 'Dan' }, { id: '40:3.7.4', by: 'Dan' }], then: ['f:dan.offer', 'walt:40.w.offer'], to: 'ask' },
    ask: { go: [
      { ask: '40:3.7.c4', once: 'offer.what', say: [{ id: '40:3.7.5', by: 'Dan' }] },
      { ask: '40:3.7.c5', once: 'offer.journals', say: [{ id: '40:3.7.6', by: 'Dan' }], then: ['walt:40.w.danpapers'] },
      { ask: '40:3.7.c6', once: 'offer.who', say: [{ id: '40:3.7.7', by: 'Dan' }] },
      { ask: '40:3.7.c7', once: 'offer.why', say: [{ id: '40:3.7.8', by: 'Dan' }] },
      { ask: '40:3.7.c8', say: [{ id: '40:3.7.9', by: 'Dan' }], end: true }] },
    // 3.7's last part: the first time after the canoe adrift
    setup: { say: [{ id: '40:3.7.10', by: 'Dan' }, { id: '40:3.7.11', by: 'Dan' }, { id: '40:3.7.12', by: 'Dan' }], then: ['f:dan.setup', 'walt:40.w.setup'], end: true },
    // 3.2: junk only (never the notebook, the cans or a story paper: no verb, no line); Leo's lid (30 §4.3) and the blade (30 §4.7)
    junk: { go: [
      { ask: '30:4.3.10', when: 'hasLid', kind: 'look', to: 'lid' }, // (his line as the choice's words: he has noticed it)
      { ask: 'd95.p.blade.offer', when: 'hasBlade', kind: 'look', to: 'blade' },
      { ask: '40:3.7.c5', once: 'junk.journals', say: [{ id: '40:3.2.5', by: 'Dan' }], then: ['walt:40.w.danpapers'] }] },
    lid: { say: [{ id: '30:4.3.10', by: 'Dan' }], go: [
      { ask: 'd95.p.lid.sell', then: ['do:sellLid', 'f:dan.lid', 'f:kettle.lid.sold'], say: [{ id: '40:3.2.4', by: 'Dan' }], end: true },
      { ask: '30.lid.keep.1', say: [{ id: '30.lid.keep.2', by: 'Dan' }], end: true }] },
    blade: { say: [{ id: 'd95.p.blade.offer', by: 'Dan' }], go: [
      { ask: 'd95.p.blade.sell', then: ['do:sellBlade', 'f:dan.blade'], say: [{ id: '40:3.2.1', by: 'Dan' }], end: true },
      { ask: '30.lid.keep.1', say: [{ id: '30.lid.keep.2', by: 'Dan' }], end: true }] },
  },
};
// who Dan is at this counter visit; ctx: { visitN (the season's counter visits), lastDan (visitN of his last), hasLid, hasBlade, run }
export function danDue(s, ctx = {}) {
  if (!s || s.has('end') || ctx.run) return null;
  const t = s.tier;
  if (t >= 1 && !s.has('dan.met')) return 'meet';
  if (t >= 3 && !s.has('dan.offer')) return 'offer';
  if (s.has('ev.adrift') && s.has('dan.offer') && !s.has('dan.setup')) return 'setup';
  if (t >= 2 || ctx.hasLid) {
    if (ctx.lastDan != null && ctx.visitN - ctx.lastDan <= 1) return null; // never twice in a row
    const lid = ctx.hasLid && !s.has('dan.lid') && t >= 1;                 // 30 §4.3: any counter at tier 1 or above notices the lid
    if (lid) return 'junk';
    if (t >= 2 && (s.hash ? s.hash(`dan:${ctx.visitN}:${s.doc && s.doc.season}`) : ctx.visitN) % DAN_EVERY === 0) return 'junk';
  }
  return null;
}

// --- Wade at the counter (40 §4.3, the midpoint's second scene) and at the put-in (§3.8) -------------------------------------
export const WADE_COUNTER = {
  id: 'p:wade', who: 'wade',
  nodes: {
    start: { go: [
      { ask: '40:4.3.c1', once: 'c.who', say: [{ id: '40:4.3.3', by: 'Wade' }], then: ['f:wade.named', 'walt:40:1.3.2'] },
      { ask: 'p.rt.lakeq', once: 'c.water', say: [{ id: '40:4.3.4', by: 'Wade' }], then: ['walt:40.w.water'] },
      { ask: '40:4.3.c3', once: 'c.camp', say: [{ id: '40:4.3.5', by: 'Wade' }], to: 'missing' },
      { ask: '40:4.3.c7', once: 'c.helstrom', when: 'f:gy.register', say: [{ id: '40:4.3.8', by: 'Wade' }], then: ['f:wade.helstrom', 'walt:40.w.helstrom'] },
      { ask: '40:4.3.c8', once: 'c.boots', when: 'read:NB86', say: [{ id: '40:4.3.9', by: 'Wade' }], then: ['f:wade.boots', 'walt:40:1.3.4'] },
      { ask: '40:4.3.c10', once: 'c.leeches', say: [{ id: '40:4.3.10', by: 'Wade' }] },
      { ask: '40:4.3.c11', then: ['do:go'], end: true }] },
    missing: { go: [
      { ask: '40:4.3.c4', say: [{ id: '40:4.3.6', by: 'Wade' }], to: 'start' },
      { ask: '40:4.3.c5', say: [{ id: '40:4.3.7', by: 'Wade' }], to: 'start' },
      { ask: '40:4.3.c6', to: 'start' }] },
  },
};
export const WADE_PUTIN = {
  id: 'p:putin', who: 'wade',
  nodes: {
    start: { say: [{ id: '40:3.8.1', by: 'Wade' }], then: ['do:putin'], go: [
      { ask: '40:3.8.c1', then: ['do:mug'], end: true }, { ask: '40:3.8.c2', then: ['do:mug'], end: true },
      { ask: '40:3.8.c3', then: ['do:mug'], end: true }, { ask: '40:3.8.c4', then: ['do:mug'], end: true }] },
  },
};

// --- Josie and the leech order (40 §4.4, the midpoint's third scene, at the home counter) -----------------------------------
export const JOSIE_LEECH = {
  id: 'p:josie', who: 'josie',
  nodes: {
    start: { say: [{ id: '40:4.4.1', by: 'Josie' }], then: ['do:slip', 'walt:40.w.leech'], to: 'slip' },
    slip: { say: [{ id: '40.josie.hog', by: 'Josie', when: 'hogHome' }], go: [
      { ask: '40:4.4.c1', once: 'slip.who', say: [{ id: '40:4.4.2', by: 'Josie' }] },
      { ask: '40:4.4.c2', once: 'slip.when', say: [{ id: '40:4.4.3', by: 'Josie' }] },
      { ask: '40:4.4.c3', once: 'slip.seen', say: [{ id: '40:4.4.4', by: 'Josie' }], then: ['f:josie.vault'] }] },
  },
};

// --- Maggie at Hog Creek (40 §6.4–§6.9) --------------------------------------------------------------------------------------
const M = (id) => ({ id, by: 'Maggie' });
// the things a player can bring her (§6.6): one reaction each, once; the first paper of all gives Stage D's line
const PAPERS = [
  { ask: 'd95.p.m.register', once: 'p.register', when: 'f:gy.register', say: [M('40:6.6.1')], then: ['walt:40:6.6.2'], paper: true },
  { ask: 'd95.p.m.receipt', once: 'p.receipt', when: 'any(isabella.receipt*)', say: [M('40:6.6.3')], then: ['walt:40:6.6.4'], paper: true },
  { ask: 'd95.p.m.guestbook', once: 'p.guestbook', when: 'any(aili.guestbook*)', say: [M('40:6.6.5')], paper: true },
  { ask: 'd95.p.m.sheila', once: 'p.sheila', when: 'any(sheila.report*) | f:sheila.in', say: [M('40:6.6.6')], paper: true },
  { ask: 'd95.p.m.ollie', once: 'p.ollie', when: 'any(ollie.log*)', say: [M('40:6.6.7')], paper: true },
  { ask: 'd95.p.m.wadenum', once: 'p.wadenum', when: 'f:denny.wade', say: [M('40:6.6.9')] },
  { ask: 'd95.p.m.tasha', once: 'p.tasha', when: 'any(tasha.told*) | f:tasha.flag', say: [M('40:6.6.10')] },
  { ask: 'd95.p.m.tauno', once: 'p.tauno', when: 'f:tauno.record', say: [M('40:6.6.11')] },
  { ask: 'd95.p.m.dan', once: 'p.dan', when: 'f:dan.offer', say: [M('40:6.6.12')] },
  { ask: 'd95.p.m.creek', once: 'p.creek', when: 'f:kettle.visited | f:kettle.rain', say: [M('40:6.6.13')] },
  { ask: 'd95.p.m.farend', once: 'p.farend', when: 'f:ink.farend | f:camp.found', say: [M('40:6.6.14')] },
  { ask: 'd95.p.m.alive', once: 'p.alive', when: 'north', say: [M('40:6.6.16'), M('40:6.6.17')] },
].map((p) => (p.paper ? { ...p, say: [...p.say, { hook: 'paperFirst' }] } : p));
// the hub's questions after the first meeting, and the meeting point's (§6.9) — any visit from Stage B
const HUB = [
  { ask: '40:6.4.c5', once: 'caught', when: 'f:maggie.lied & f:maggie.bunk', say: [M('40:6.4.8'), M('40:6.4.9')], then: ['f:maggie.caught'] },
  { ask: '40:6.4.c8', when: 'f:maggie.met & !f:maggie.matched & f:nb.found', to: 'match' },
  { ask: '40.maggie.adrift', once: 'adrift', when: 'f:ev.adrift & f:maggie.met', to: 'adrift' },
  ...PAPERS,
  { ask: '40:6.4.c13', once: 'safe', when: 'f:maggie.ostrander', say: [M('40:6.4.28'), M('40:6.4.29')] },
  { ask: '40:6.4.c14', once: 'reach', when: 'f:maggie.ostrander', say: [M('40:6.4.30'), M('40:6.4.31')], then: ['f:maggie.code'] },
  { ask: '40:6.4.c15', once: 'why', when: 'f:maggie.ostrander', say: [M('40:6.4.32')] },
  { ask: '40:6.4.c16', once: 'headed', when: 'f:maggie.ostrander', say: [M('40:6.4.33')] },
  { ask: '40:6.9.c1', when: 'f:maggie.met & !f:maggie.meeting', to: 'meet' },
  { ask: '40:6.9.c1', when: 'f:maggie.meeting', to: 'meetq' },
];
export const MAGGIE = {
  id: 'p:maggie', who: 'maggie',
  nodes: {
    // the first meeting (6.4)
    first: { say: [{ first: [{ ...M('40:6.4.1'), when: 'walts' }, M('40:6.4.2')] }], then: ['f:maggie.met'], to: 'intro' },
    intro: { go: [
      { ask: '40:6.4.c1', once: 'i.you', say: [M('40:6.4.3')] },
      { ask: '40:6.4.c2', once: 'i.plug', say: [M('40:6.4.4'), M('40:6.4.5')] },
      { ask: '40:6.4.c3', once: 'i.who', say: [M('40:6.4.6')] },
      { ask: '40:6.4.c4', once: 'i.hog', say: [M('40:6.4.7')], then: ['f:maggie.lied', { when: 'evening', then: ['f:maggie.bunk'] }] },
      { ask: '40:6.4.c5', once: 'caught', when: 'f:maggie.lied & f:maggie.bunk', say: [M('40:6.4.8'), M('40:6.4.9')], then: ['f:maggie.caught'] },
      { ask: '40:6.4.c6', once: 'i.heard', say: [{ hook: 'heard1' }, { hook: 'heard2' }] },
      { ask: '40:6.4.c7', once: 'i.want', say: [M('40:6.4.12'), M('40:6.4.13')], to: 'stakes' }] },
    stakes: { say: [M('40:6.4.14'), M('40:6.4.15'), M('40:6.4.16'), M('40:6.4.17'), M('40:6.4.18'), M('40:6.4.19')], then: ['do:letter'], to: 'letter' },
    letter: { go: [
      { ask: '40:6.4.c8', when: 'f:nb.found', to: 'match' },
      { ask: '40:6.4.c12', say: [M('40:6.4.25')], to: 'papers' }] },
    match: { say: [M('40:6.4.20')], then: ['do:beside'], go: [
      { ask: '40:6.4.c9', to: 'matched' }, { ask: '40:6.4.c10', to: 'matched' }, { ask: '40:6.4.c11', to: 'matched' }] },
    matched: { say: [M('40:6.4.21'), M('40:6.4.22'), M('40:6.4.23'), M('40:6.4.24')], then: ['f:maggie.matched', 'walt:40.w.matched'], to: 'papers' },
    // what she gives, matched or not (once): Walt's letter came with the stakes; Ostrander's note, the target list, the handout
    papers: { say: [{ ...M('40:6.4.26'), when: '!f:maggie.ostrander' }, { ...M('40:6.4.27'), when: '!f:maggie.ostrander' }],
      then: [{ when: '!f:maggie.ostrander', then: ['do:papers', 'f:maggie.ostrander', 'f:maggie.kettlemap', 'f:maggie.e7copy', 'walt:40.w.e7.2'] }], to: 'hub' },
    hub: { go: [...HUB, { ask: '40:6.4.c6', once: 'i.heard', say: [{ hook: 'heard1' }, { hook: 'heard2' }] }] },
    // a return visit (6.5): her opener by the last thing that happened, then the hub
    again: { say: [{ first: [
      { ...M('40:6.5.5'), when: 'any(year.turned.*) & !f:maggie.year' },
      { ...M('40:6.5.3'), when: 'f:ev.adrift & !f:maggie.adrift & !f:maggie.slept' },
      { ...M('40:6.5.4'), when: 'tier>=4 & !f:maggie.truck' },
      { ...M('40:6.5.2'), when: 'bigNew' },
      M('40:6.5.1')] }],
    then: [{ when: 'any(year.turned.*)', then: ['f:maggie.year'] }, { when: 'f:maggie.lied', then: ['f:maggie.bunk'] }, { when: 'f:ev.adrift', then: ['f:maggie.slept'] }, { when: 'tier>=4', then: ['f:maggie.truck'] }, 'do:bigSeen'],
    to: 'hub2' },
    hub2: { go: [{ ask: '40:6.4.c4', once: 'i.hog', when: '!f:maggie.lied', say: [M('40:6.4.7')], then: ['f:maggie.lied', 'f:maggie.bunk'] },
      { ask: '40:6.4.c7', when: '!f:maggie.ostrander', to: 'stakes' }, ...HUB] },
    // 6.7: after the warning, told
    adrift: { say: [M('40:6.7.1'), M('40:6.7.2')], then: ['f:maggie.adrift'], go: [
      { ask: '40:6.7.c1', say: [M('40:6.7.3')], then: ['f:maggie.on'], to: 'after' },
      { ask: '40:6.7.c2', say: [M('40:6.7.4')], then: ['f:maggie.think'], to: 'hub' }] },
    after: { go: [{ ask: '40:6.9.c1', when: '!f:maggie.meeting', to: 'meet' }, { ask: '40:6.9.c1', when: 'f:maggie.meeting', to: 'meetq' }] },
    // 6.9: the meeting point (two places, first light; the code); she pencils both landings
    meet: { say: [M('40:6.9.1'), M('40:6.9.2'), M('40:6.9.3'), M('40:6.9.4'), M('40:6.9.5')], then: ['do:rings'], to: 'meet2' },
    meet2: { say: [M('40:6.9.6'), M('40:6.9.7')], then: ['f:maggie.meeting', 'f:maggie.code'], to: 'meetq' },
    meetq: { go: [
      { ask: '40:6.9.c2', once: 'm.pick', say: [M('40:6.9.8')] },
      { ask: '40:6.9.c3', once: 'm.make', say: [M('40:6.9.9')] },
      { ask: '40:6.9.c4', once: 'm.give', say: [M('40:6.9.10')] },
      { ask: '40:6.9.c5', once: 'm.where', say: [M('40:6.9.11')] },
      { ask: '40:6.9.c6', once: 'm.who', say: [M('40:6.9.12')] }] },
  },
};
export const MAGGIE_BYE = { first: '40:6.4.34', meet: '40:6.9.13' }; // her closing lines (§6.4 "Close", §6.9 "Closing the topic")

// --- the leech-order pad at any counter (40 §6.9 "The leech order (the player's note)") ------------------------------------
export const PAD = {
  id: 'p:pad', who: 'pad',
  nodes: {
    start: { go: [
      { ask: 'd95.p.pad.lakeone', then: ['do:one'], to: 'n' },
      { ask: 'd95.p.pad.gabbro', then: ['do:gab'], to: 'n' },
      { ask: 'd95.p.pad.never', end: true }] },
    n: { go: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => ({ ask: `d95.p.pad.${k}`, then: [`do:n${k}`], to: 'done' })) },
    done: { say: [{ hook: 'slip' }, { id: '40.pad.keeper', when: 'firstOrder' }], then: ['f:maggie.order'], end: true },
  },
};
export const PAD_TOPIC = { id: 'p.pad', ask: 'd95.p.pad.ask', when: 'f:maggie.code | f:maggie.meeting' };
// the leech order's code: the latest note wins; Maggie is in that lot at first light from firstDawn on, every morning
export function meetingFrom(abs, ep, dozens) {
  const n = Math.max(1, Math.min(9, Math.round(Number(dozens) || 1)));
  return { ep: Number(ep), firstDawn: Math.floor(abs) + n, set: Math.floor(abs), dozens: n };
}

// --- Brekke at the corner table, Thursdays (30 §4.6 "Brekke's conversation"; 40 §3.5 its company side) ---------------------
const B = (id) => ({ id: `30:4.6/brekkes-conversation-once-open.${id}`, by: 'Brekke' });
export const BREKKE_TABLE = {
  id: 'p:brekke', who: 'brekke',
  nodes: {
    start: { say: [{ id: '30:4.6/brekkes-conversation-once-open.2', by: 'Len' }, B(3), B(4),
      { first: [{ ...B(5), when: 'lenBE' }, { ...B(6), when: 'lenGrade' }, { ...B(7), when: 'lenLake' }, B(8)] }, B(9)],
    then: ['f:brekke.met'], go: [
      { ask: '30:4.6/brekkes-conversation-once-open.c1', say: [B(10)], then: ['f:choice.brekke=lie'], to: 'close' },
      { ask: '30:4.6/brekkes-conversation-once-open.c2', say: [B(11)], then: ['f:choice.brekke=deflect'], to: 'close' },
      { ask: '30:4.6/brekkes-conversation-once-open.c3', when: 'f:stations.known | f:maggie.ostrander | f:tauno.drilled', say: [B(12)],
        then: ['f:choice.brekke=needle', 'f:brekke.needled', 'walt:30:4.6/brekkes-conversation-once-open.w1'], to: 'close' }] },
    close: { say: [{ first: [{ ...B(13), when: 'seenTauno' }, B(14)] }], then: ['f:brekke.talked', { when: 'seenTauno', then: ['f:brekke.lovelybook'] }], end: true },
    again: { say: [{ id: '40.brekke.again', by: 'Brekke' }], end: true },
  },
};

// --- Maggie at Hog Creek, by the clock ------------------------------------------------------------------------------------
// from the note's third morning (the slip's day + 3), every day 7–19, June to October (mid-May on, a later season), until
// the dawn lot or the ending (then n's Maggie after); on a meeting dawn she is in that lot instead until 08:30 (§6.9)
export function maggieHere(s, { abs, hours, month } = {}) {
  if (!s || !s.has('maggie.note') || s.has('end') || s.has('run.lifted') && !s.has('run.out')) return false;
  const f = s.fact('maggie.note'), from = Math.floor(Number(s.get('maggie.note')) || (f && f.abs) || 0) + NOTE_DAYS;
  if (Math.floor(abs) < from) return false;
  if (!(month >= MAGGIE_MONTHS[0] && month <= MAGGIE_MONTHS[1])) return false;
  const M0 = s.doc && s.doc.meeting;
  if (M0 && Math.floor(abs) >= M0.firstDawn && hours < 8.5) return false; // (in the meeting's lot at first light)
  return hours >= 5.5 && hours < 21; // (the dock 7–19; early and late on the bunkhouse step)
}
export const maggieWhere = (hours) => (hours >= MAGGIE_HOURS[0] && hours < MAGGIE_HOURS[1] ? 'dock' : 'step');

// the camp search's trip (§8.2 campSearch: once, when the midpoint holds)
export const searchDue = (s) => !!(s && s.has('midpoint') && !s.has('ev.search') && !s.has('end'));
// the canoe adrift (40 §5, §8.2 adrift): tier 3+, September to ice-in, not on the run, once. w: { month, ice, wind (m/s),
// shore (m from the tent to the water), island, run }
export function adriftDue(s, w = {}) {
  if (!s || s.has('ev.adrift') || s.has('end') || s.tier < 3) return false;
  if (!(w.month >= 9 && w.month <= 11) || w.ice || w.run || w.island) return false;
  if (!(w.wind < ADRIFT_WIND)) return false;
  return Number.isFinite(w.shore) && w.shore <= ADRIFT_SHORE + 6;
}
