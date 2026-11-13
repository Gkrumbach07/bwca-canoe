// The winter turn's adapter for the story (Round 3, stream W; docs/build/campaign-design.md §3.9 read through Part 3 #3).
// season-turn.js is the base game's (the late season, next year's permits, the rescue off the ice, the turn); this file is
// the story's side of it, registered with the feed (story-feed.js), so it attaches only under STORY_ON and never on a
// co-op guest's mirror.
//
// On seasonTurn 'wake' (in the winter card's dark, the clock just moved, before any frame runs):
//   1. story `after` timers that came due during the winter fire once, quietly: their state actions only (f: ppl: walt:
//      und: lead:); a scene, a line, a ring or a payment that was waiting for a moment in November is not played in May
//   2. story.set('year.turned.<year>') for every year turned into (rules read it: R7 "Ice is out", the boys' August again,
//      Maggie back in May, side stories reopening; any(year.turned.*))
//   3. the story event year:open { year, from, abs, auto, reason }: the yearly reseed hook (episodes' minis, stream 7c:
//      story.on('year:open', fn), or a rule `on: 'year:open'`)
// seasonTurn 'iced' → iced { lake } · 'season:close' → season:close { year, auto } (story events; rules may key on them)
//
// The run (§3.9 "A run under way at freeze-up", Part 3 #3 "the turn still fires by itself"): a field hook on seasonTurn
// turns a trip caught by the ice by itself while the story's run.active reads true (stream R's sensor); R places the
// player at its checkpoint (its own auto({ place }) call, or on 'wake'/'year:open' with auto: true).
//
//   winter.turns() → [{ from, year, abs, auto, reason, timers }] (this session's) · winter.last() (rigs: __game.story.winter)
import { feed } from './story-feed.js';

const STATE_ONLY = true;

class Winter {
  constructor() { this.story = null; this.list = []; }
  turns() { return this.list.slice(); }
  last() { return this.list.length ? this.list[this.list.length - 1] : null; }
  // the timers due by now, applied once with only their state actions (Rules.apply in quiet mode)
  quietTimers(s) {
    const R = s.rules, d = s.doc; if (!R || !d || !Array.isArray(d.timers) || !d.timers.length) return [];
    const now = s.nowAbs(), due = d.timers.filter((t) => t.at <= now);
    if (!due.length) return [];
    d.timers = d.timers.filter((t) => t.at > now);
    const was = R.quiet, out = [];
    R.quiet = STATE_ONLY;
    try { for (const t of due) { const r = R.rules.get(t.rule); if (r) { R.apply(r, t.args || {}); out.push(r.id); } } } finally { R.quiet = was; }
    s.log('winter', { timers: out });
    s.dirty();
    R.drain();
    return out;
  }
  wake(s, e, api) {
    if (!s || !s.doc || s.mode === 'mirror') return;
    const timers = this.quietTimers(s);
    const from = Number(e.from), year = Number(e.year);
    for (let y = Number.isFinite(from) ? from + 1 : year; y <= year; y++) s.set(`year.turned.${y}`, true, e.auto ? `season-turn:${e.reason || 'auto'}` : 'season-turn');
    this.list.push({ from, year, abs: e.abs, auto: !!e.auto, reason: e.reason || null, timers });
    api.emit('year:open', { year, from, abs: e.abs, auto: !!e.auto, reason: e.reason || null });
  }
}
export const winter = new Winter();

// hang the story on season-turn.js (T): its events in, and the run's field turn
export function hookSeason(api, T) {
  const s = api.story, offs = [];
  if (!T || !s || s.mode === 'mirror') return offs;
  offs.push(api.on(T, 'wake', (e) => winter.wake(s, e || {}, api)));
  offs.push(api.on(T, 'iced', (e) => api.emit('iced', { lake: (e && e.lake) || null })));
  offs.push(api.on(T, 'season:close', (e) => api.emit('season:close', { year: e ? e.year : null, auto: !!(e && e.auto) })));
  // the run caught by the ice turns by itself (R's sensor; R may hang its own field hook with `place`, which wins)
  if (typeof T.field === 'function') offs.push(T.field(() => (s.mode !== 'mirror' && s.readSensor('run.active') ? { ep: null } : null)));
  return offs;
}

feed.register('season', (api) => {
  const s = api.story;
  winter.story = s;
  if (!s || s.mode === 'mirror') return () => {};
  s.winter = winter; // (rigs: __game.story.winter)
  let offs = [], gone = false;
  const T = (api.mods && api.mods.seasonTurn) || (typeof window !== 'undefined' && window.__game && window.__game.seasonTurn) || null;
  if (T) offs = hookSeason(api, T);
  // (main.js loads season-turn.js on its own, maybe after the feed starts: the same module, imported here when it is wanted)
  else import('./season-turn.js').then((m) => { if (!gone) offs = hookSeason(api, m.seasonTurn); }).catch((e) => console.warn('feed-season', e));
  return () => { gone = true; for (const off of offs) { try { if (typeof off === 'function') off(); } catch { /* gone */ } } };
});
