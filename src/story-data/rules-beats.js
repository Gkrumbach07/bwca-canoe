// The director's rules (stream D, story Round 2; docs/build/campaign-design.md §12). The director's weighing is code
// (beats.js); these are the moments it is asked, as events from the feed (feed-beats.js: the trip's evening, its day
// turns), the store's door and the trip's end, and the trip card's story lines (`card:<text id>`, 20 §5.1). No rule here
// writes a fact: a beat never carries a key.
//
// The director's sensors (`climax:<arc>`, `setpiece:<id>`) are registered here, before any rule is compiled, so another
// stream's rule may read them (A2's climax: `… & climax:mining`).
import { registerSensor } from '../story-cond.js';

registerSensor('climax', 'arg');   // beats.climax(arc).ok: spacing holds, or its window closes within 14 days
registerSensor('setpiece', 'arg'); // beats.canSetPiece(id): no other set piece this trip

export const RULES_BEATS = [
  // the day's beat: at 19:00 of a trip day with no story beat yet (beats.offerDay)
  { id: 'd.evening', on: 'trip:evening', repeat: true, then: ['beat:day'] },
  // stall relief, and a held climax's person named by a keeper: weighed at the store's door (beats.stallCheck)
  { id: 'd.counter', on: 'store:enter', repeat: true, when: 'stage>=S3', then: ['beat:stall'] },
  // the trip's end closes its record (the tally has read it: record.js d-block)
  { id: 'd.tripend', on: 'trip:end', repeat: true, then: ['beat:tripend'] },
  // the trip card's story line: trip one's, the notebook (20 §5.1 "An old notebook, rolled in the tent's fly.")
  { id: 'd.card.nb', on: 'notebook:found', then: ['card:20:5.1.card'] },
];
