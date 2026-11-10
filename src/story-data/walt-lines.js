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
  // /st-b
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
