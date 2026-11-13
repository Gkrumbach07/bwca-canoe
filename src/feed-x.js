// Stream x (the campaign run, chapter 2's finish): the player's own thought at a thing seen. 70 §2: "Where a thing gets
// one thought line, it is the first time only, and it is the player's own thought, never a lesson." A place's verb or
// trigger (story-places.json) writes `think:<text id>`: the words, as a short note in the HUD. The fact beside it in
// the same `then` makes it once (the rhubarb at Mummo's: f:ep.S7.rhubarb, think:70.2.3.1).
// Registered with the feed (story-seams.js), so only under STORY_ON, and never on a co-op guest (a mirror story).
import { feed } from './story-feed.js';
import { loadText, say } from './story-data/words.js';

feed.register('x-think', (api) => {
  const s = api.story; if (!s || typeof s.handle !== 'function' || s.mode === 'mirror') return () => {};
  loadText();
  const hud = () => (api.mods && api.mods.hud) || (typeof window !== 'undefined' && window.__game && window.__game.hud) || null;
  const off = s.handle('think', (arg) => {
    const w = say(String(arg || '')), h = hud();
    if (!w || !h || typeof h.note !== 'function') return false;
    try { h.note(w, 5); } catch { return false; }
    return true;
  });
  return () => { try { if (typeof off === 'function') off(); } catch { /* gone */ } };
});
