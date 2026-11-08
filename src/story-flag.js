// STORY_ON (docs/build/campaign-design.md Part 4, "The story flag"): every story module runs only behind it until the
// Round 6 join. A dev-build flag: `?story=1` on a dev server (Vite's import.meta.env.DEV). A production build (the
// public GitHub Pages one) never turns it on, so with it off the game is exactly main.
const dev = (() => { try { return !!(import.meta.env && import.meta.env.DEV); } catch { return false; } })();
const asked = typeof location !== 'undefined' && /[?&]story=1\b/.test(location.search || '');
export const STORY_ON = dev && asked;
