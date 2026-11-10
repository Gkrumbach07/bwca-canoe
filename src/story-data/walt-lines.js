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
  // st-t: the turn's Walt-page lines the extract has no page id for (docs/story/20-opening.md §12.3 U3's and U5's Gives;
  // `src` names the doc's words where the extract kept them, under another kind). Casebook (B) writes them out.
  { id: 'w.turn.eino', section: 'people', text: null, src: '20 §12.3 U3 Gives: People, "Walt\'s brother was Eino Haapala. He was 28."' },
  { id: 'w.turn.ollie', section: 'people', text: null, src: '20 §12.3 U3 Gives: People, "Ollie said \'upwind\'. Nobody listened."' },
  { id: 'w.turn.year', section: 'years', text: null, src: '20 §12.3 U3 Gives: Years, "12 Oct 1977. Eino went out from Little Gabbro, \'for ducks\'."' },
  { id: 'w.turn.ducks', section: 'dontadd', text: null, src: '20:U3.c6' },
  { id: 'w.turn.canoe', section: 'dontadd', text: null, src: '20:U3.c7' },
  { id: 'w.turn.jacket', section: 'dontadd', text: null, src: '20:U3.c8' },
  { id: 'w.turn.coroner', section: 'dontadd', text: null, src: '20:U3.c9' },
  { id: 'w.turn.drift', section: 'dontadd', text: null, src: '20:U3.c10' },
  { id: 'w.door.guiding', section: 'leads', text: null, src: '20 §12.3 U5 Gives: "Marlys, at Moose Lake. She ran the bunkhouse. Walt guided out of there longest."' },
  { id: 'w.door.boys', section: 'leads', text: null, src: '20 §12.3 U5 Gives: "The fellas he tripped with. In at Sawbill every August. Ask at Baker."' },
  { id: 'w.door.family', section: 'leads', text: null, src: '20 §12.3 U5 Gives: "His sister Aili, at Crane Lake. \'She won\'t talk to you.\'"' },
  { id: 'w.door.mining', section: 'leads', text: null, src: '20 §12.3 U5 Gives: "Tauno, at Farm, mornings."' },
  // /st-t
];
