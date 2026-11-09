// The story's dev flag (docs/build/campaign-design.md Part 4, "The story flag"). Until the Round 6 join proves the
// two-keys check, every story module runs only behind STORY_ON: a dev build (Vite's serve) with ?story=1 in the URL.
// With it off the game behaves exactly as main: no feed, no adapters, no listeners on other modules.
//
//   STORY_ON (bool, read once at load) · storyOn(search?) (the same test, for the lint and the unit checks in Node)
//
// The production build never turns it on (import.meta.env.DEV is false there), whatever the URL says.
const DEV = (() => { try { return !!(import.meta.env && import.meta.env.DEV); } catch { return false; } })();

export function storyOn(search = typeof location !== 'undefined' ? location.search : '', dev = DEV) {
  if (!dev) return false;
  try { return new URLSearchParams(search || '').get('story') === '1'; } catch { return false; }
}

export const STORY_ON = storyOn();
