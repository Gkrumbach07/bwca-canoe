// The Walt page's lines (docs/build/campaign-design.md §6.3): { id, section, when?, text, replaces? }. A rule's
// `walt:<id>` action names one of these (or an extracted text entry that is a Walt-page line, `page`); story-lint.mjs
// fails a `walt:` id that is neither. The words come from the docs (the writers' pass, Round 1, casebook.js): until
// then a line here is its id and section only (text null), so the rules can write it and the lint can check it.
//
// Ids are never reused (story-data/retired.js).
export const WALT_LINES = [
  // night one (rules-core.js night1): the notebook found, and the word he used for the cache
  { id: 'w.found', section: 'walt', text: null },
  { id: 'w.cellar', section: 'walt', text: null },
];
