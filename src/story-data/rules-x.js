// Stream x (the campaign run, chapter 2's finish): the patterns its lines need. In the story's data from its
// construction (all-rules.js), never added later (chk-coop C2).
export const RULES_X = [
  // 30 §4.2 Len's "Gull" / "Pietro" / "east of Bald Eagle" (the lie, steering): the Walt page sets it beside what shows
  // it, once the player holds either the E-7 list or the crew map, or has seen Pietro's dig
  { id: 'x.len.east', when: 'f:said.len.east & (f:door.mining.yield | f:maggie.e7copy | f:pietro.dig.seen)', then: ['walt:30:4.2/len-saari-first-meeting.w3'] },
];
