// The story's flag (docs/build/campaign-design.md Part 4, "The story flag"). Owner, 2026-11-13: the story is on for
// every player, in dev and in the production build. ?story=0 in the URL turns it off: the game exactly as before the
// story (no feed, no adapters, no listeners on other modules), for the old regression rigs and as a way back.
//
//   STORY_ON (bool, read once at load) · storyOn(search) (the same test, for the lint and the unit checks in Node)
//
// In Node (no page, no location) STORY_ON is off, so the unit checks that import game modules see the base game.
export function storyOn(search = typeof location !== 'undefined' ? location.search : '') {
  try { return new URLSearchParams(search || '').get('story') !== '0'; } catch { return true; }
}

export const STORY_ON = typeof location !== 'undefined' ? storyOn(location.search) : false;
