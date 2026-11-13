// The family arc's scenes as data (campaign Round 6, stream a4; docs/story/33-family.md §5–§9): Aili's counter (the
// three first meetings, the topics a visit at a time, the gifts and the stone, the kitchen table, the guest book, the
// setbacks), Jon at the dock (the first meeting, the denial, won over, the canary), Liisa at the outfitter counter (the
// stories, "Come back Monday.", the can), the back porch (the climax: the can in your hands, Aili home early), Gord on
// Thursdays, and Danielle at the US end of Prairie Portage (re-sited off the Quetico side: docs/story/dlc-quetico.md).
// Every line is an id into src/story-data/text/family.json (topics.js T), or a build draft (DRAFT below, 95-drafted-lines
// "Stream a4") where the docs have no words. The shapes are topics.js SceneRun's (as mining.js). Node only: no game
// imports, so story-lint, scripts/cmp-a4-unit.mjs and the solver read it.
//
//   AILI · JON · LIISA · PORCH · GORD · DANIELLE   the scenes ({ id, who, nodes })
//   ailiEntry(s, ctx) · jonEntry(s, ctx) · liisaEntry(s, ctx) · gordEntry(s) · danielleEntry(s)   where each starts
//   ailiStep(s) → 0..3   her door's step now (33 §5): the facts reached, less a dropped step (the third "Is he alive?")
//   SCHEDULE             the family's hours (33 §3 "The calendar here")
//   STORIES              the quiet-years entries Liisa can be told (33 §6.9), with her answer to each
//   A4_SENSORS           the condition names the scenes read from the live world (family-cast.js registers them)
//   DRAFT                the build drafts, by anchor (texts.add / words.js addWords at attach)
//   PLACES               where things stand (v3/v9 x/z, looked up again at runtime by name and nearest point)
//
// Facts written (person namespaces, facts.js; a4 rows for carp.):
//   aili.met · aili.sawpack (Variant A) · aili.tent (the tent carried in: step 1 at once) · aili.day2 (a second day's
//   visit) · aili.sit (step 1) · aili.said.<topic> · knows.mummos (the photo) · aili.bootleg (S6's hook, for 7b) ·
//   aili.stone (step 2, L4A, door.family.yield) · aili.print · aili.pot (kept|cook) · aili.slip · aili.kitchen (step 3) ·
//   knows.eino.morning · aili.sorensen · aili.guestbook · aili.gordtrap · aili.cold (the season after "I know") ·
//   choice.aili (know|thanks) · door.family.climax · door.family.done · aili.house (the can in the house)
//   jon.met · jon.chase (followed|islands|wind|narrows|dusk) · jon.second (the rented boat photographed) · jon.denied ·
//   jon.won (page|informant) · jon.protect · jon.cold
//   liisa.met · liisa.told.<NB> · liisa.shown · liisa.monday · cards.seen · cards.stone (L4D) · cards.postmarks
//   gord.met · gord.told (a "went north" piece) · danielle.met · danielle.log (a "went north" piece) · danielle.stone ·
//   carp.stump · carp.stone (the Carp-end stump and the cairn, US side of the line)
export const A4_SENSORS = { ailistep: 'cmp', ailialive: 'cmp', ailishut: 'flag', liisanext: 'arg', liisaready: 'flag', monday: 'flag', chased: 'flag', shook: 'arg' };

// --- the calendar (33 §3) -------------------------------------------------------------------------------------------
export const SCHEDULE = {
  // Aili: every day, ice-out to freeze-up; Mondays 9–16 in Cook ("Back at 4")
  aili: { counter: 'month:5-10 & !(dow:mon & hour:9-16)', cook: 'dow:mon & hour:9-16' },
  // Jon: guides June to mid-September by day, cleans fish at the dock 19–21; mornings at the outfitter dock before he goes out
  jon: { dock: 'month:5-10 & hour:19-21', morning: 'month:5-10 & hour:6-8' },
  // Liisa: Memorial Day weekend to the closing weekend in early October, the counter by day
  liisa: { counter: '(month:6-9 | (month:5 & date:05-24..05-31) | (month:10 & date:10-01..10-06)) & hour:8-18' },
  // Gord: Thursdays, mid-June to the end of September, 11–14, at the outfitter's dock
  gord: { dock: 'dow:thu & (month:7-9 | (month:6 & date:06-15..06-30)) & hour:11-14' },
  // Danielle (re-sited, a default: the docs never place her on the US side): the Sucker end of P194, the tow landing, by
  // day June to September, Monday to Thursday (her rounds of the US landings; Friday to Sunday at the station)
  danielle: { landing: 'month:6-9 & dow:mon|tue|wed|thu & hour:10-15' },
};

// --- the build drafts (95-drafted-lines.md "Stream a4"): lines the docs do not have -----------------------------------
export const DRAFT = {
  'a4:say.nothing': { k: 'choice', text: '…' },
  // the Walt page
  'a4:w.jon': { k: 'page', text: 'Jon, her son. Guides Crane and Sand Point. Cleans fish at the motel dock at dusk.' },
  'a4:w.eino': { k: 'page', text: 'Aili: the morning Eino went "for ducks", his shotgun was on the hooks. The night before he said Friday, a man at the paper in Duluth. Walt said leave it.' },
  'a4:w.kitchen': { k: 'page', text: 'September 1977. Sorensen from the office, an hour in Helmi\'s kitchen with his hat on his knee, talking weather.' },
  'a4:w.guestbook': { k: 'page', text: 'The memorial guest book, Ely, 9 November 2019. Halfway down, careful: W. Helstrom.' },
  'a4:w.danielle': { k: 'page', text: 'Danielle, the Canadian ranger at Prairie: an aluminium canoe nobody claimed, on their side, logged 26 October 2019.' },
  'a4:w.carp': { k: 'page', text: 'The Carp end of the portage: a clean ring on the stump, where a stone sat a long time. The ranger\'s cairn has a white one on top.' },
  // Danielle at the Sucker end of P194 (bible 4.10's voice; the docs give her no scene on the US side)
  'a4:danielle.1': { k: 'line', text: 'Morning. This is your end, so there\'s nothing I can sell you. I just like to see who\'s crossing.' },
  'a4:danielle.c1': { k: 'choice', text: 'What do you do here?' },
  'a4:danielle.2': { k: 'line', text: 'Count canoes. Pick up what people leave. We log what we find. We don\'t always know what we found.' },
  'a4:danielle.c2': { k: 'choice', text: 'Ever find a canoe?' },
  'a4:danielle.3': { k: 'line', text: 'October before last but four. The twenty-sixth, 2019. An aluminium canoe pulled up on our side, nobody\'s. We logged it. Nobody came for it.' },
  'a4:danielle.c3': { k: 'choice', text: 'A white stone on a stump?' },
  'a4:danielle.4': { k: 'line', text: 'Somebody left a white stone on a stump at the Carp end. We found it the next spring when we opened up. Took it for a cairn. It\'s still on the pile there, your side of the line.' },
  'a4:danielle.c4': { k: 'choice', text: 'Thanks.' },
  'a4:danielle.5': { k: 'line', text: 'Paddle safe. It blows on Basswood after two.' },
  // the dot's names at the motel and the Carp end
  'a4:dot.motel': { k: 'dot', text: 'MOTEL · BAIT · COFFEE' },
  'a4:dot.sign': { k: 'dot', text: 'Back at 4' },
  'a4:dot.can': { k: 'dot', text: 'Coffee can' },
  'a4:dot.carpstump': { k: 'dot', text: 'Stump' },
  'a4:dot.cairn': { k: 'dot', text: 'Cairn' },
  // Jon cold after "I know" (the doc's own words, 33 §6.10 Effects; that block already holds the Walt-page anchor)
  'a4:jon.cold': { k: 'line', text: 'You went in her porch.' },
  // the can taken toward the road or the dock (33 §6.9's thought is 33:6.9.thought; the card's sub is a draft)
  'a4:postmarks.title': { k: 'line', text: 'Six envelopes. MRS A NIEMI, block capitals. The postmarks:' },
};

// --- where things stand (33 §3; 03-places §4; the re-sites of docs/story/dlc-quetico.md) -----------------------------
export const PLACES = {
  ep: 12,
  crane: { x: -94833, z: -19570, name: 'the Crane Lake public landing' },
  kwn: { x: -93055, z: -24067, name: 'King Williams Narrows' },          // where Jon's boat comes out of a bay
  c2063: { x: -94782, z: -30282, site: 'C2063', name: 'Sand Point' },      // Walt's starred site (walt-sites ws.c2063)
  lee: { x: -94100, z: -29200, name: 'the island in the lee (a south wind)' }, // the rented boat's anchorage (writers pick; default)
  sandpoint: { x: -94423, z: -31191, r: 5200 },                          // the lake, for "the route enters Sand Point"
  // re-sited: Danielle at the Sucker end of Prairie Portage (P194, the US end where the tow boats land), and the
  // Carp-end stone at the Carp Lake end of Carp Portage (P47): in bounds (edge zone 1), so it stays where 03-places has it
  prairie: { x: -16605, z: 4549, portage: 'Basswood Lake – Sucker Lake', end: 'b', name: 'the Sucker end of Prairie Portage' },
  carp: { x: -10054, z: 2049, portage: 'Carp Portage', end: 'b', name: 'the Carp end of Carp Portage' },
};

// --- Liisa's stories (33 §6.9): the warm, harmless quiet-years entries, in her order, and her answer to each ---------
export const STORIES = [
  { nb: 'NB04', key: 'N02', say: '33:6.9.10' },
  { nb: 'NB06', key: 'N03', say: '33:6.9.11' },
  { nb: 'NB16', key: 'N04', say: '33:6.9.12' },
  { nb: 'NB36', key: 'N14', say: '33:6.9.13' },
  { nb: 'NB37', key: 'N16', say: '33:6.9.14' },
  { nb: 'NB60', key: 'N24', say: '33:6.9.15' },
  { nb: 'NB13', key: 'NF1', say: '33:6.9.16' },
];
// the next story she can be told: the first read and not yet told (read(nb) → bool)
export function nextStory(s, read) { for (const st of STORIES) if (read(st.nb) && !s.has(`liisa.told.${st.nb}`)) return st.nb; return null; }
// the can (33 §5 "Liisa"): two stories with one shown in his hand, or three
export function liisaReady(s) { const n = s.keys('liisa.told.').length; return (n >= 2 && s.has('liisa.shown')) || n >= 3; }

// --- Aili's door (33 §5) --------------------------------------------------------------------------------------------
// the step reached: the facts, less one while a dropped step lasts (ppl aili.drop: until that abs day); after "I know",
// cold for the rest of that season (ppl aili.coldSeason = the season it was said in) and back at step 1 the next
export function ailiStep(s, season = null) {
  if (!s || !s.doc) return 0;
  const p = (s.doc.ppl && s.doc.ppl.aili) || {};
  if (s.get('choice.aili') === 'know' && (season == null || p.coldSeason == null || p.coldSeason === season)) return 0;
  let n = s.has('aili.kitchen') ? 3 : s.has('aili.stone') ? 2 : s.has('aili.sit') ? 1 : 0;
  if (s.get('choice.aili') === 'know') n = Math.min(n, 1);
  if (Number.isFinite(p.drop) && s.nowAbs() < p.drop) n = Math.max(0, n - 1);
  return n;
}
const W1 = 'ailistep>=1', W2 = 'ailistep>=2', W3 = 'ailistep>=3';
const DAY = (k) => `f:aili.said.${k} & days.since(aili.said.${k})>=1`; // "These topics open one a day, in this order"
const COFFEE = { id: '33:6.2.4', strip: 'Good. It should. He reproofed it every spring on the clothesline and swore at it.' };
const GIFT = ['f:aili.stone', 'f:door.family.yield', { when: 'f:knows.stones', then: ['walt:33:6.4.w.1'] }, { when: '!f:knows.stones', then: ['walt:33:6.4.w.2'] }];

export const AILI = {
  id: 'aili', who: 'aili',
  nodes: {
    // 6.2 Variant A, before night one (her home is Little Vermilion: the pack on your back)
    first_A: { say: ['33:6.2.1'], go: [{ ask: '33:6.2.c1', say: ['33:6.2.2'], then: ['f:aili.met', 'f:aili.sawpack'], end: true }] },
    // 6.2 Variant B, after night one, carrying the bundle (the canonical first meeting)
    first_B: { say: [{ id: '33:6.2.A.4', when: 'f:aili.sawpack' }, '33:6.2.3'], then: ['f:aili.met', 'f:aili.tent', 'f:door.family.open', 'walt:33:5.w1'], go: [
      { ask: '33:6.2.c2', say: ['33:6.2.4'], to: 'talk0' },
      { ask: '33:6.2.c3', say: ['33:6.2.5', COFFEE], to: 'talk0' },
      { ask: '33:6.2.c4', say: ['33:6.2.6'], to: 'talk0' }] },
    // 6.2 Variant C, without the bundle: she doesn't know you
    first_C: { say: ['33:6.2.15'], go: [{ ask: '33:6.2.c13', say: ['33:6.2.16'], then: ['f:aili.met', 'f:door.family.open', 'walt:33:5.w1', 'f:asked.aili.walt'], to: 'whoSent' }] },
    whoSent: { go: [
      { ask: '33:6.2.c14', say: ['33:6.2.17'], end: true },
      { ask: '33:6.2.C.5', say: ['33:6.2.17'], end: true }] },
    // 6.2's topics: open on every visit
    talk0: { go: [
      { ask: '33:6.2.c5', say: [{ first: [{ id: '33:5.twice.2', when: 'ailialive>=1' }, '33:6.2.7'] }], then: ['do:alive', 'f:asked.aili.walt'] },
      { ask: '33:6.2.c6', once: 'what', say: ['33:6.2.8'], then: ['f:asked.aili.walt'] },
      { ask: '33:6.2.c7', once: 'find', say: ['33:6.2.9'], to: 'came' },
      { ask: '33:6.2.c9', once: 'his', say: ['33:6.2.11'], to: 'his' },
      // 6.3: the photo, Pekka, the bootleggers, the porch light, one a day in this order (step 1)
      { ask: '33:6.3.c1', once: 'photo', when: W1, say: ['33:6.3.1'], then: ['f:knows.mummos', 'f:aili.photo'], to: 'photo' },
      { ask: '33:6.3.c7', once: 'pekka', when: `${W1} & ${DAY('photo')}`, say: ['33:6.3.7'], to: 'pekka' },
      { ask: '33:6.3.c9', once: 'boot', when: `${W1} & ${DAY('pekka')}`, say: ['33:6.3.9'], then: ['f:aili.bootleg'], to: 'boot' },
      { ask: '33:6.3.c11', once: 'porch', when: `${W1} & ${DAY('boot')} & (f:aili.night | read:NB13)`, say: ['33:6.3.11'], to: 'porch' },
      { ask: '33:6.3.c13', once: 'leeches', when: W1, say: ['33:6.3.13'] },
      // the setbacks (33 §5): each closes her for the day ("I have to get the wash in.")
      { ask: '33:6.3.c14', when: W1, say: ['33:6.3.14'], then: ['do:shut'], end: true },
      { ask: '33:6.13.c8', once: 'gordtrap', when: 'f:gord.told', say: ['33:6.13.9', '33:5.wash'], then: ['f:aili.gordtrap', 'do:shut'], end: true },
      // 6.5 the kitchen table: step 2, Eino's name on the Walt page, a day since the stone
      { ask: '33:6.5.c1', once: 'eino', when: `${W2} & (f:tauno.turn | f:knows.eino) & days.since(aili.stone)>=1`, to: 'eino' },
      // 6.6 the guest book: step 3, a day after the kitchen table
      { ask: '33:6.6.c2', once: 'book', when: `${W3} & days.since(aili.kitchen)>=1 & (f:marlys.met | f:wade.met)`, to: 'book' },
      { ask: '33:6.6.c1', once: 'book', when: `${W3} & days.since(aili.kitchen)>=1 & !(f:marlys.met | f:wade.met)`, to: 'book' },
      { ask: '33:6.2.c12', say: ['33:6.2.14'], end: true }] },
    came: { hub: 'talk0', go: [{ ask: '33:6.2.c8', once: 'came', say: ['33:6.2.10'] }] },
    his: { hub: 'talk0', go: [{ ask: '33:6.2.c10', once: 'nothing', say: ['33:6.2.12'], to: 'his2' }] },
    his2: { hub: 'talk0', go: [{ ask: '33:6.2.c11', once: 'why', say: ['33:6.2.13'] }] },
    photo: { hub: 'talk0', go: [
      { ask: '33:6.3.c2', once: 'which', say: ['33:6.3.2'] },
      { ask: '33:6.3.c3', once: 'still', say: ['33:6.3.3'], to: 'still' },
      { ask: '33:6.3.c5', once: 'june', when: 'read:NB04 | read:NB06', say: ['33:6.3.5'], to: 'june' }] },
    still: { hub: 'talk0', go: [{ ask: '33:6.3.c4', once: 'whynot', say: ['33:6.3.4'] }] },
    june: { hub: 'talk0', go: [{ ask: '33:6.3.c6', once: 'pot', say: ['33:6.3.6'] }] },
    pekka: { hub: 'talk0', go: [{ ask: '33:6.3.c8', once: 'pass', say: ['33:6.3.8'] }] },
    boot: { hub: 'talk0', go: [{ ask: '33:6.3.c10', once: 'where', say: ['33:6.3.10'] }] },
    porch: { hub: 'talk0', go: [{ ask: '33:6.3.c12', once: 'every', say: ['33:6.3.12'] }] },
    // a visit at step 1+: her opener (one of three, by the day), then the topics
    sit: { say: [{ hook: 'opener' }], to: 'talk0' },
    // closed for today (a setback, or the cold season after "I know")
    shut: { say: ['33:5.wash'], end: true },
    cold: { say: [{ id: '33:6.2.A.3', strip: 'Crawlers in the cooler. Coffee\'s a dollar, nobody pays it.' }], end: true },
    // 6.4 A: the June print of the lilacs at Mummo's (show.js: "Look at this…")
    lilacs: { say: ['33:6.4.1', '33:6.4.2'], then: [...GIFT, 'f:aili.print', 'f:aili.slip', 'walt:33:6.4.w.3'], go: [
      { ask: '33:6.4.c1', say: ['33:6.4.3'], end: true },
      { ask: '33:6.4.c2', say: ['33:6.4.4'], end: true },
      { ask: 'a4:say.nothing', end: true }] },
    // 6.4 B: June's pot shown; S9's choice in her counter
    pot: { say: ['33:6.4.5', '33:6.4.6'], then: [...GIFT], go: [
      { ask: '33:6.4.c3', say: ['33:6.4.7'], then: ['f:aili.pot=kept', 'do:keepPot'], end: true },
      { ask: '33:6.4.c4', say: ['33:6.4.8'], then: ['f:aili.pot=cook'], end: true }] },
    // a second gift: thanked, changes nothing more
    again: { say: ['33:6.4.9'], then: ['f:aili.again'], end: true },
    // after "Liisa thought you'd want them in the house." with the stone not yet given: the kindness is the gift
    stone2: { say: ['33:6.10.4', '33:6.4.2'], then: [...GIFT], end: true },
    // after the can, "Thank you" path: coffee for good
    coffee: { say: ['33:6.10.4'], to: 'talk0' },
    // 6.5 the dead brother
    eino: { say: ['33:6.5.1', '33:6.5.2'], go: [
      { ask: '33:6.5.c2', once: 'eino.gun', say: ['33:6.5.3'], to: 'eino2' },
      { ask: '33:6.5.c3', once: 'eino.where', say: ['33:6.5.4'], to: 'einoWhere' },
      { ask: '33:6.5.c5', once: 'eino.sheriff', say: ['33:6.5.6'], to: 'eino2' },
      { ask: '33:6.5.c6', once: 'eino.killed', say: ['33:6.5.7'], to: 'eino2' }] },
    einoWhere: { go: [{ ask: '33:6.5.c4', once: 'eino.didyou', say: ['33:6.5.5'], to: 'eino2' }] },
    // the follow-up after the first branch: "Before that?"
    eino2: { go: [
      { ask: '33:6.5.c7', once: 'eino.before', say: ['33:6.5.8'], to: 'before' },
      { ask: '33:6.5.c2', once: 'eino.gun', say: ['33:6.5.3'] },
      { ask: '33:6.5.c3', once: 'eino.where', say: ['33:6.5.4'], to: 'einoWhere' },
      { ask: '33:6.5.c5', once: 'eino.sheriff', say: ['33:6.5.6'] },
      { ask: '33:6.5.c6', once: 'eino.killed', say: ['33:6.5.7'] }] },
    before: { go: [
      { ask: '33:6.5.c8', once: 'eino.who', say: ['33:6.5.9', '33:6.5.11'], to: 'einoClose' },
      { ask: '33:6.5.c9', once: 'eino.want', say: ['33:6.5.10', '33:6.5.11'], to: 'einoClose' }] },
    einoClose: { say: ['33:6.5.12'], then: ['f:aili.kitchen', 'f:knows.eino.morning', 'f:aili.sorensen', 'walt:a4:w.eino', 'walt:a4:w.kitchen', 'ppl:aili.trust=3'], end: true },
    // 6.6 the guest book
    book: { say: ['33:6.6.1', '33:6.6.2'], go: [
      { ask: '33:6.6.c3', say: ['33:6.6.3', '33:6.6.5'], to: 'bookGive' },
      { ask: '33:6.6.c4', say: ['33:6.6.4', '33:6.6.3', '33:6.6.5'], to: 'bookGive' }] },
    bookGive: { then: ['f:aili.guestbook', 'give:item.guestbook', 'walt:a4:w.guestbook', { when: 'f:door.guiding.done | f:marlys.met', then: ['walt:33:8.guiding'] }], end: true },
    // 9: the endings (bible 7): Aili never confirms
    endJ: { say: ['33:9/the-journalist-walt-kept.1'], then: ['f:aili.endline'], to: 'coffee' },
    endJsat: { say: [], then: ['f:aili.sat', 'do:sit'], end: true },
    endJN: { say: ['33:9/the-journalist-walt-named.1'], then: ['f:aili.endline'], end: true },
    endM: { say: ['33:9/the-companys-money-7.1'], then: ['f:aili.endline'], end: true },
    mute: { say: [], end: true },
  },
};
// where her scene starts: ctx { carrying (the bundle on your back), nightOne (nb.found), gift: 'print'|'pot' (shown now),
// shut (closed today), season }
export function ailiEntry(s, ctx = {}) {
  const end = s.get('end');
  if (end === 'JN') return s.has('aili.endline') ? 'mute' : 'endJN';
  if (end === 'M') return 'endM';
  if (end === 'J') { if (s.get('choice.aili') === 'know' && !s.has('aili.sat')) return 'endJsat'; return s.has('aili.endline') ? 'coffee' : 'endJ'; }
  if (!s.has('aili.met') || (!s.has('door.family.open') && ctx.nightOne)) {
    if (!ctx.nightOne) return s.has('aili.met') ? 'talk0' : (ctx.carrying ? 'first_A' : 'first_C');
    return ctx.carrying ? 'first_B' : 'first_C';
  }
  if (ctx.gift) return s.has('aili.stone') ? 'again' : ctx.gift === 'print' ? 'lilacs' : 'pot';
  if (s.get('choice.aili') === 'know' && ailiStep(s, ctx.season) === 0) return 'cold';
  if (ctx.shut) return 'shut';
  if (s.get('choice.aili') === 'thanks' && !s.has('aili.stone')) return 'stone2';
  if (s.get('choice.aili') === 'thanks') return 'coffee';
  return ailiStep(s, ctx.season) >= 1 ? 'sit' : 'talk0';
}
// her openers at step 1 (33 §6.3: she says one, by the day)
export const OPENERS = ['33:6.3.open.1', '33:6.3.open.2', '33:6.3.open.3'];
// the wants (show.js): the June print at Mummo's, June's pot shown (not taken: S9's choice is in her counter)
// (the first opens her; a second, after the stone, is thanked and changes nothing more: 'again')
export const WANTS = [
  { who: 'aili', print: 's7.lilacs.camp', when: 'f:aili.met & ailistep>=1 & !f:aili.stone', to: 'lilacs', gift: 'print' },
  { who: 'aili', item: 'junespot', give: false, when: 'f:aili.met & ailistep>=1 & !f:aili.stone', to: 'pot', gift: 'pot' },
  { who: 'aili', print: 's7.lilacs.camp', when: 'f:aili.stone & !f:aili.print & !f:aili.again', to: 'again', gift: 'print2' },
  { who: 'aili', item: 'junespot', give: false, when: 'f:aili.stone & !f:aili.pot & !f:aili.again', to: 'again', gift: 'pot2' },
];

// --- 6.10 the back porch: the can in your hands, Aili home early -----------------------------------------------------
export const PORCH = {
  id: 'porch', who: 'aili',
  nodes: {
    // [She sees the can. She doesn't move.] AILI: (nothing). Two choices and no third; ten real seconds of nothing takes
    // the second without its spoken line (family-cast.js's timer: node 'held')
    can: { say: [], go: [
      { ask: '33:6.10.c.know', to: 'know' },
      { ask: '33:6.10.c.thanks', to: 'thanks' }] },
    know: { say: ['33:6.10.1'], then: ['f:choice.aili=know', 'do:cold', 'f:aili.cold', 'f:jon.cold', 'walt:33:6.10.know.1', 'walt:33:6.10.after', 'f:door.family.climax', 'f:door.family.done', 'do:canBack'], end: true },
    thanks: { say: ['33:6.10.3'], then: ['f:choice.aili=thanks', 'f:aili.house', 'walt:33:6.10.thanks.1', 'walt:33:6.10.after', 'f:door.family.climax', 'f:door.family.done', 'do:canTaken'], end: true },
    held: { say: ['33:6.10.3'], then: ['f:choice.aili=thanks', 'f:aili.house', 'f:aili.held', 'walt:33:6.10.thanks.1', 'walt:33:6.10.after', 'f:door.family.climax', 'f:door.family.done', 'do:canTaken'], end: true },
  },
};

// --- 6.7 / 6.8 Jon ---------------------------------------------------------------------------------------------------
export const JON = {
  id: 'jon', who: 'jon',
  nodes: {
    first: { say: ['33:6.7.1'], then: ['f:jon.met', 'walt:a4:w.jon'], go: [
      { ask: '33:6.7.c1', say: ['33:6.7.2', '33:6.7.5'], end: true },
      { ask: '33:6.7.c2', say: ['33:6.7.3', '33:6.7.5'], end: true },
      { ask: '33:6.7.c3', say: ['33:6.7.4', '33:6.7.5'], then: ['f:jon.walleye'], end: true }] },
    // the next meeting after the chase: the denial (his tell: he knows where you went)
    denial: { go: [
      { ask: '33:6.7.c4', say: [{ first: [{ id: '33:6.7.shook.4', when: 'shook:islands', by: null }, '33:6.7.6'] }], then: ['f:jon.denied', 'walt:33:6.7.w.1', { when: 'f:jon.second', then: ['walt:33:6.7.w.2'] }], end: true },
      { ask: '33:6.7.c5', say: ['33:6.7.7', { id: '33:6.7.8', when: 'shook:islands' }], then: ['f:jon.denied', 'walt:33:6.7.w.1', { when: 'f:jon.second', then: ['walt:33:6.7.w.2'] }], end: true },
      { ask: 'a4:say.nothing', say: ['33:6.7.9'], then: ['f:jon.denied', 'walt:33:6.7.w.1', { when: 'f:jon.second', then: ['walt:33:6.7.w.2'] }], end: true }] },
    // short and hostile until won over; the two ways to win him
    short: { say: ['33:6.7.5'], go: [
      { ask: '33:6.8.c1', when: 'met:jon>=2 & f:nb.found', to: 'page' },
      { ask: '33:6.8.c2', when: 'f:denny.revealed', to: 'informant' }] },
    page: { say: ['33:6.8.1'], go: [
      { ask: '33:6.8.c3', when: 'f:knows.denny | f:denny.met | f:denny.revealed', say: ['33:6.8.2'], to: 'friend' },
      { ask: '33:6.8.c5', say: ['33:6.8.4'], then: ['f:jon.won=page'], to: 'admit' },
      { ask: '33:6.8.c6', say: ['33:6.8.5'], then: ['f:jon.won=page'], to: 'admit' }] },
    friend: { go: [{ ask: '33:6.8.c4', say: ['33:6.8.3'], then: ['f:jon.won=page', 'f:jon.denny'], to: 'admit' }] },
    informant: { say: ['33:6.8.6'], go: [{ ask: '33:6.8.c7', say: ['33:6.8.7', { id: '33:6.8.3', strip: 'Denny.' }], then: ['f:jon.won=informant', 'f:jon.denny'], to: 'admit' }] },
    admit: { say: ['33:6.8.8', '33:6.8.9'], then: ['f:jon.yield', 'f:jon.protect', { when: 'f:wade.met', then: ['walt:33:6.8.w.1'] }], to: 'won' },
    won: { go: [
      { ask: '33:6.8.c8', once: 'before', say: ['33:6.8.10'], then: ['f:jon.car'] },
      { ask: '33:6.8.c9', once: 'alive', say: ['33:6.8.11'], to: 'alive' },
      { ask: '33:6.8.c11', once: 'whynot', say: ['33:6.8.13', '33:6.8.14'] },
      // the canary, honestly (bible 5.7): a real lake picked; nothing comes back from him
      { ask: '33:6.8.c12', say: ['33:6.8.15'], then: ['do:pick'] },
      { ask: '33:6.8.never.1', once: 'never', say: ['33:6.8.never.2'] }] },
    alive: { hub: 'won', go: [{ ask: '33:6.8.c10', once: 'asked', say: ['33:6.8.12'] }] },
    cold: { say: ['a4:jon.cold'], end: true },
    sauna: { say: ['33:6.8.17'], end: true },
    endJ: { say: ['33:9/the-journalist-walt-kept.2'], then: ['f:jon.endline'], end: true },
    endJN: { say: ['33:9/the-journalist-walt-named.2', '33:9/the-journalist-walt-named.4'], then: ['f:jon.endline'], end: true },
    endM: { say: ['33:9/the-companys-money-7.2'], go: [{ ask: '33:9/the-companys-money-7.c1', say: ['33:9/the-companys-money-7.3'], then: ['f:jon.endline'], end: true }] },
  },
};
// ctx { chased: the chase happened and he has not been seen since, shook: how, season, saturday }
export function jonEntry(s, ctx = {}) {
  const end = s.get('end');
  if (end && !s.has('jon.endline')) return end === 'J' ? 'endJ' : end === 'JN' ? 'endJN' : 'endM';
  if (!s.has('jon.met')) return 'first';
  if (s.get('choice.aili') === 'know' && ctx.coldSeason) return 'cold';
  if (s.has('jon.chase') && !s.has('jon.denied') && !s.has('jon.won')) return 'denial';
  if (s.has('jon.won')) return ctx.saturday && !ctx.saunaSaid ? 'sauna' : 'won';
  return 'short';
}

// --- 6.9 Liisa ---------------------------------------------------------------------------------------------------------
const storyChoices = STORIES.map((st) => ({ ask: '33:6.9.c5', when: `liisanext:${st.nb}`, say: [st.say, '33:6.9.6'], then: [`f:liisa.told.${st.nb}`], to: 'how' }));
export const LIISA = {
  id: 'liisa', who: 'liisa',
  nodes: {
    first: { say: ['33:6.9.1'], then: ['f:liisa.met', 'walt:33:6.9.w.1'], go: [
      { ask: '33:6.9.c1', once: 'knew', say: ['33:6.9.2'], to: 'hub' },
      { ask: '33:6.9.c2', once: 'drown', say: ['33:6.9.3'], to: 'cards' },
      { ask: '33:6.9.c4', once: 'tell', say: ['33:6.9.5'], to: 'hub' }] },
    cards: { hub: 'hub', go: [{ ask: '33:6.9.c3', once: 'cards', say: ['33:6.9.4'], then: ['f:liisa.cards'] }] },
    hub: { go: [
      ...storyChoices,
      { ask: '33:6.9.c1', once: 'knew', say: ['33:6.9.2'] },
      { ask: '33:6.9.c2', once: 'drown', say: ['33:6.9.3'], to: 'cards' },
      { ask: '33:6.9.c4', once: 'tell', say: ['33:6.9.5'] }] },
    how: { go: [
      { ask: '33:6.9.c6', say: ['33:6.9.7', { id: '33:6.9.8', when: '!f:liisa.shown' }], then: ['f:liisa.shown'], to: 'hub' },
      { ask: '33:6.9.c7', say: ['33:6.9.9'], to: 'hub' }] },
    // she has heard enough: Monday while Grandma's in Cook, else "Come back Monday." (the only time the schedule is taught)
    notMonday: { say: ['33:6.9.17'], then: ['f:liisa.monday'], to: 'hub' },
    // the can (family-cast.js do:porch: out the side door, across the gravel, onto the motel's back porch)
    can: { say: ['33:6.9.18', '33:6.9.19'], then: ['do:porch', 'f:cards.seen', 'f:cards.stone', 'f:cards.postmarks', 'walt:33:6.9.cards.1', 'walt:33:6.9.cards.2'], go: [
      { ask: '33:6.9.c8', once: 'who', say: ['33:6.9.20'] },
      { ask: '33:6.9.c9', once: 'when', say: ['33:6.9.21'] },
      { ask: '33:6.9.c10', say: ['33:6.9.22'], then: ['do:holdCan'], end: true }] },
    after: { say: ['33:6.10.2'], then: ['f:liisa.after'], to: 'hub' },
    endJ: { say: ['33:9/the-journalist-walt-kept.3'], then: ['f:liisa.endline'], to: 'hub' },
    endJN: { say: ['33:9/the-journalist-walt-named.3'], then: ['f:liisa.endline'], to: 'hub' },
    endM: { say: ['33:9/the-companys-money-7.4'], then: ['f:liisa.endline'], end: true },
  },
};
// ctx { monday: Aili in Cook now, nextSeason: a season after the ending }
export function liisaEntry(s, ctx = {}) {
  const end = s.get('end');
  if (end === 'M') return 'endM';
  if (end && ctx.nextSeason && !s.has('liisa.endline')) return end === 'J' ? 'endJ' : 'endJN';
  if (!s.has('liisa.met')) return s.has('door.family.open') ? 'first' : null;
  if (s.get('choice.aili') === 'know' && !s.has('liisa.after')) return 'after';
  if (!s.has('cards.seen') && liisaReady(s)) return ctx.monday ? 'can' : 'notMonday';
  return 'hub';
}

// --- 6.13 Gord on Thursdays --------------------------------------------------------------------------------------------
export const GORD = {
  id: 'gord', who: 'gord',
  nodes: {
    meet: { say: ['33:6.13.1'], then: ['f:gord.met'], to: 'hub' },
    hub: { go: [
      { ask: '33:6.13.c1', once: 'atikokan', say: ['33:6.13.2'] },
      { ask: '33:6.13.c2', once: 'americans', say: ['33:6.13.3'], to: 'americans' }] },
    americans: { hub: 'hub', go: [{ ask: '33:6.13.c3', once: 'lately', say: ['33:6.13.4'], then: ['f:gord.told', 'walt:33:6.13.w.1'], to: 'lately' }] },
    lately: { hub: 'hub', go: [
      { ask: '33:6.13.c4', once: 'like', say: ['33:6.13.5'], to: 'like' },
      { ask: '33:6.13.c6', once: 'camp', say: ['33:6.13.7'] },
      { ask: '33:6.13.c7', once: 'name', say: ['33:6.13.8'] }] },
    like: { hub: 'lately', go: [{ ask: '33:6.13.c5', once: 'finn', say: ['33:6.13.6'] }] },
  },
};
export function gordEntry(s) { return s.has('gord.met') ? 'hub' : 'meet'; }

// --- Danielle at the US end of Prairie Portage (re-sited; all build drafts: docs/story/dlc-quetico.md) ------------------
export const DANIELLE = {
  id: 'danielle', who: 'danielle',
  nodes: {
    meet: { say: ['a4:danielle.1'], then: ['f:danielle.met'], to: 'hub' },
    hub: { go: [
      { ask: 'a4:danielle.c1', once: 'what', say: ['a4:danielle.2'] },
      { ask: 'a4:danielle.c2', once: 'canoe', say: ['a4:danielle.3'], then: ['f:danielle.log', 'walt:a4:w.danielle'] },
      { ask: 'a4:danielle.c3', once: 'stone', when: 'f:knows.stones | f:aili.stone | f:cards.stone', say: ['a4:danielle.4'], then: ['f:danielle.stone', 'ring:carp'] },
      { ask: 'a4:danielle.c4', say: ['a4:danielle.5'], end: true }] },
  },
};
export function danielleEntry(s) { return s.has('danielle.met') ? 'hub' : 'meet'; }
