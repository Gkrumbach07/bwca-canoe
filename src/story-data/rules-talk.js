// Talk & cast's rules (stream T, Round 1; docs/story/20-opening.md §6.1, §8). The scenes themselves are data
// (porch-act1.js) played by topics.js; these are the facts an event sets.
export const RULES_TALK = [
  // 20 §6.1: story.porch1 = 'armed', the first time inside any outfitter after night one (the return, §5.2)
  { id: 't.armed', on: 'store:enter', when: 'f:nb.found', then: ['f:tauno.armed'] },
];
