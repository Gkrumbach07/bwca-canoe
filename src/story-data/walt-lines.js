// The Walt page's lines (docs/build/campaign-design.md §6.3): { id, section, when?, text?, ref?, replaces? }. A rule's
// `walt:<id>` action names one of these, or an extracted text entry that is a Walt-page line (`page`, any doc); the
// lint (story-lint.mjs) fails a `walt:` id that is neither.
//
// The words are never written here: a row's `ref` names the text entry that holds them (story-data/text/*.json, by the
// writers' <!-- id: --> anchors), and an id that is itself a text entry needs no row unless it wants a section other
// than its doc's (SECTION_OF below). `text` stays null; casebook.js reads the words through words.js.
//
//   section   one of WALT_SECTIONS: where on the page it sits (a section shows only once it has a line, 10 §11.3)
//   replaces  the id of a line it turns: the old one is drawn crossed out above it ("drowned" → "went north")
//   annotates the id of the line it is a note on: its words go after that line's ("(ringed)"), not on a line of their own
//   done      a story.when expression: once it holds, the line (a lead) is drawn struck through where it stands (the
//             final pass, chk-c2a 7: the page kept leads already followed up)
//
// Ids are never reused (story-data/retired.js). Each stream adds its rows in its own marked block.

// the page's sections, in order (20 §7.1, bible 5.3.1): the one line for Walt himself first, without a heading
export const WALT_SECTIONS = [
  ['walt', null], ['people', 'People'], ['places', 'Places'], ['names', 'Nicknames'], ['years', 'Years'],
  ['odd', 'Things that don\'t add up'], ['leads', 'Leads'], ['farend', 'The far end'],
];

export const WALT_LINES = [
  // night one (rules-core.js night1): the notebook found, and the word he used for the cache (10 §11.3 walt.nb.night1)
  { id: 'w.found', section: 'walt', ref: 'walt.nb.night1.1', text: null },
  { id: 'w.cellar', section: 'odd', ref: 'walt.nb.night1.2', text: null },
  // st-b: the book's own lines (rules-book.js), 10 §11.3
  { id: 'walt.nb.read.1', section: 'names' },
  { id: 'walt.nb.read.2', section: 'people' },
  { id: 'walt.nb.read.3', section: 'people' },
  { id: 'walt.nb.read.4', section: 'odd' },
  { id: 'walt.nb.read.5', section: 'odd' },
  { id: 'walt.nb.und.2', section: 'years' },
  { id: 'walt.nb.und.3', section: 'names' },
  { id: 'walt.nb.und.4', section: 'odd' },
  { id: 'walt.nb.und.5', section: 'farend' },
  { id: 'walt.nb.und.6', section: 'walt', replaces: '20:T4.w5' },
  // the opening's lines the book writes or the slice reads (20 §2.4, §5.2, T3–T4, §11.2): their sections
  { id: '20:2.4.w1', section: 'places' },
  { id: '20:2.4.w2', section: 'places' },
  { id: '20:5.2.w1', section: 'people' },
  { id: '20:5.2.w2', section: 'names' },
  { id: '20:5.2.w3', section: 'places' },
  { id: '20:T4.w5', section: 'walt' },
  { id: '20:T4.w6', section: 'odd' },
  { id: '20:T4.w8', section: 'odd' },
  { id: '20:T4.w9', section: 'odd' },
  { id: '20:T4.w10', section: 'odd' },
  { id: '20:7.2.w1', section: 'names' },
  // 20 §7.1: "Tauno's on the porch at Farm most mornings." is under Leads (chk-c1a 3: it sat under Things that don't add up)
  { id: '20:7.1.lead.tauno', section: 'leads', done: 'f:tauno.farm.met' }, // (struck once he is found on Farm's porch)
  // (the join) 20 §7.3: "Walt page, Leads: the line gets *(ringed)*": a note on the crews' lead line, not a line of its own
  { id: '20:7.3.w1', section: 'leads', annotates: '20:11.2.w1' },
  // /st-b
  // st-t: the turn's Walt-page lines (docs/story/20-opening.md §12.3 U3's and U5's Gives; the join anchored the U3 People
  // and Years lines and U5's Leads, 20:U3.wp / .wy / 20:U5.w; U3's Things that don't add up came out as .c6–.c10).
  // Eino's line turns T4's "went in the water in '77" (20 §12.3: "the old line … gets struck through")
  { id: 'w.turn.eino', section: 'people', ref: '20:U3.wp.1', replaces: '20:T4.w7' },
  { id: 'w.turn.ollie', section: 'people', ref: '20:U3.wp.2' },
  { id: 'w.turn.year', section: 'years', ref: '20:U3.wy' },
  { id: 'w.turn.ducks', section: 'odd', ref: '20:U3.c6' },
  { id: 'w.turn.canoe', section: 'odd', ref: '20:U3.c7' },
  { id: 'w.turn.jacket', section: 'odd', ref: '20:U3.c8' },
  { id: 'w.turn.coroner', section: 'odd', ref: '20:U3.c9' },
  { id: 'w.turn.drift', section: 'odd', ref: '20:U3.c10' },
  { id: 'w.door.guiding', section: 'leads', ref: '20:U5.w.1' },
  { id: 'w.door.boys', section: 'leads', ref: '20:U5.w.2' },
  { id: 'w.door.family', section: 'leads', ref: '20:U5.w.3' },
  { id: 'w.door.mining', section: 'leads', ref: '20:U5.w.4', done: 'f:tauno.farm.met' },
  // /st-t
  // a2: the mining years (30 §4): the lines whose words are a quote inside a block, and the sections other than 30's
  // default (people). The Kettle line is the second quote of 30 §4.3's Pay paragraph (30:4.3.w2 is retired by the anchor)
  { id: 'w.kettle.orange', section: 'places', ref: '30:4.3.pay.2' },
  { id: 'w.lead.pads', section: 'leads', ref: 'd95.lead.pads', done: 'f:kettle.visited' },
  { id: '30:4.2/len-saari-first-meeting.w3', section: 'odd' }, // x: Len's nothing-east line beside E-7 (rules-x.js) // (x: a drafted page line, docs/story/95; was Tauno's spoken 30:4.1.30 whole)
  { id: '30:4.1.w1', section: 'places' },
  { id: '30:4.1.w5', section: 'odd' },
  { id: '30:4.3.w1', section: 'places' },
  { id: '30:4.5.w1', section: 'odd' },
  { id: '30:4.7.w.1', section: 'odd' },
  { id: '30:4.7.w.2.2', section: 'names' },
  { id: '30:4.7.w.3', section: 'farend' },
  { id: '30:4.4.w3', section: 'farend' },
  { id: '30:4.9.page.3', section: 'years' },
  { id: '30:4.9.page.4', section: 'years' },
  { id: '30:4.6/the-thursday-lunch-tier.w1', section: 'odd' },
  // /a2
  // f: begin (Round 3 stream F) 50 §2.4's lines are a table's (kind line, not page): their section
  { id: '50:2.4.1', section: 'farend' },
  { id: '50:2.4.2', section: 'farend' },
  { id: '50:2.4.3', section: 'farend' },
  { id: '50:2.4.4', section: 'farend' },
  // f: end
  // r: begin (the run's Walt-page lines, 50 §6.15)
  { id: 'run.walt.drybag', section: 'farend' },
  { id: 'run.walt.grumman', section: 'farend' },
  // r: end
  // c: begin (co-op, Round 3: the pit with company; campaign-design §7.2. N42's line, written once by coop-story.js. A build
  // draft quoting NB72 (docs/story/95-drafted-lines.md, stream c), drawn from `text` until the writers anchor it)
  { id: 'c.walt.n42', section: 'farend', text: 'Not with company on the lake.' },
  // c: end
  // a3: the guiding years (31): sections other than 31's default (people). The hinge's line is walt.nb.und.6 (above)
  { id: '31:GY-01.close.2', section: 'people' },
  { id: '31:GY-01.fly.5', section: 'odd' },
  { id: '31:GY-13.sheila.1', section: 'people' },
  { id: '31:page.2', section: 'years' },
  { id: '31:page.3', section: 'odd' },
  { id: '31:GY-06.gives', section: 'farend' },
  { id: '31:GY-06b.w', section: 'years' },
  { id: '31:GY-09.gives.1', section: 'odd' },
  { id: '31:GY-11.gives.3', section: 'odd' },
  { id: '31:GY-11.alders.1', section: 'places' },
  { id: '31:GY-11.alders.2', section: 'places', annotates: '31:GY-11.alders.1' },
  { id: '31:GY-11.waltway.1', section: 'odd' },
  { id: '31:GY-12.rafter.1', section: 'places' },
  { id: '31:GY-12.rafter.2', section: 'years', annotates: '31:GY-12.rafter.1' },
  { id: '31:GY-12.5', section: 'odd' },
  { id: '31:GY-12.6', section: 'odd' },
  { id: '31:GY-12.c4', section: 'odd' },
  { id: '31:GY-12.c5', section: 'odd' },
  { id: '31:GY-13.sheila.2', section: 'odd' },
  { id: '31:GY-08.canoe.8', section: 'odd' },
  { id: '31:GY-08.canoe.9', section: 'odd', annotates: '31:GY-08.canoe.8' },
  { id: '31:GY-17.w', section: 'years' },
  { id: '31:GY-18.w', section: 'places' },
  { id: '31:GY-04.gives.1', section: 'leads', done: 'f:rick.met' },
  { id: '31:GY-09b.2', section: 'leads', done: 'met:ollie>=1' },
  // /a3
  // a4: begin (the family, 33): drafted lines (95-drafted-lines "Stream a4") and the sections other than 33's default (people)
  { id: 'a4:w.jon', section: 'people' },
  { id: 'a4:w.eino', section: 'odd' },
  { id: 'a4:w.kitchen', section: 'years' },
  { id: 'a4:w.guestbook', section: 'odd' },
  { id: 'a4:w.danielle', section: 'odd' },
  { id: 'a4:w.carp', section: 'odd' },
  { id: '33:6.4.w.1', section: 'places' },
  { id: '33:6.4.w.2', section: 'places' },
  { id: '33:6.4.w.3', section: 'odd' },
  { id: '33:6.7.w.1', section: 'odd' },
  { id: '33:6.7.w.2', section: 'odd' },
  { id: '33:6.8.w.1', section: 'odd' },
  { id: '33:6.9.cards.1', section: 'places' },
  { id: '33:6.9.cards.2', section: 'odd' },
  { id: '33:6.13.w.1', section: 'odd' },
  { id: '33:6.10.after', section: 'odd' },
  // a4: end
];

// a text id with no row: its section by its id's prefix (the longest that matches), else 'odd'. Leads are a person's or a
// place's word (§4: "one Walt-page line ... quotes what was said"); the porch's T lines are people
export const SECTION_OF = [
  ['20:T', 'people'], ['20:11.', 'leads'], ['20:12.', 'people'], ['20:2.', 'places'], ['20:5.', 'people'],
  ['30:', 'people'], ['31:', 'people'], ['32:', 'odd'], ['33:', 'people'], ['40:', 'people'], ['50:', 'farend'],
  ['walt.nb.read', 'odd'], ['walt.nb.und', 'names'], ['walt.nb.night1', 'odd'],
];
const ROWS = new Map(WALT_LINES.map((w) => [w.id, w]));
export const waltRow = (id) => ROWS.get(id) || null;
export function sectionOf(id) {
  const r = ROWS.get(id);
  if (r && r.section) return r.section;
  let best = null;
  for (const [p, s] of SECTION_OF) if (String(id).startsWith(p) && (!best || p.length > best[0].length)) best = [p, s];
  return best ? best[1] : 'odd';
}
