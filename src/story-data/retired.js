// Retired story ids (docs/build/campaign-design.md §3.7, "Content edits never corrupt a save"). When the story data's
// hash differs from a save's, every fact, rule or Walt line id here is mapped to its new id (a string) or dropped
// (null), then every `when:` rule is re-run once, quietly. Ids are never reused: the lint refuses a retired id.
// (A .js module rather than the design's retired.json, so Node and Vite import it the same way.)
//
//   facts: { 'old.key': 'new.key' | null }   rules: { 'oldRule': null }   walt: { 'w.old': 'w.new' | null }
export const RETIRED = { facts: {}, rules: {}, walt: {} };
