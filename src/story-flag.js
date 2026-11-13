// The story's flag (docs/build/campaign-design.md Part 4, "The story flag"). Owner, 2026-11-13: the story is on for
// every player, in dev and in the production build. ?story=0 in the URL turns it off: the game exactly as before the
// story (no feed, no adapters, no listeners on other modules); ?story=1 turns it on whatever the default.
// The default can be set off for a dev server with VITE_STORY_DEFAULT=0 in its environment: the base regression
// (scripts/rigs.mjs, whose rigs open the game with no ?story=) runs against such a server, so it still tests the game
// without the story. A production build never sets it.
//
//   STORY_ON (bool, read once at load) · storyOn(search, def) (the same test, for the lint and the unit checks in Node)
//
// In Node (no page, no location) STORY_ON is off, so the unit checks that import game modules see the base game.
const DEFAULT_ON = (() => { try { return !(import.meta.env && import.meta.env.VITE_STORY_DEFAULT === '0'); } catch { return true; } })();

export function storyOn(search = typeof location !== 'undefined' ? location.search : '', def = DEFAULT_ON) {
  let v = null;
  try { v = new URLSearchParams(search || '').get('story'); } catch { v = null; }
  return v === '1' ? true : v === '0' ? false : def;
}

export const STORY_ON = typeof location !== 'undefined' ? storyOn(location.search) : false;
