// The story's hooks (the game-loop round, stream C: docs/build/game-loop-brief.md). No story is written this round: this
// is the event bus and the saved state the campaign (docs/story/) will fill. Today it carries the notebook found in the
// old tent (walt.js), the pages it reads (placeholder pages until the campaign sets its own with setPages), and which
// of them were read.
//
//   story.on(evt, fn) → off      story.emit(evt, data)      story.state (the saved document)
//   story.setPages(fn)           fn() → [{ title, text }]: the notebook's pages, as the campaign wants them now
//   story.pages() → [{ title, text }]                       story.read(i) → the page (marked read, 'notebook:read')
//   story.flag(key, value?)      a campaign flag, read or set (saved)
//   events: 'gear:given' { items, ep, abs } · 'notebook:found' { abs, key, lake } · 'notebook:read' { page }
//   and '*' for every event (fn(evt, data))
//
// Saved per season (save.js `bwca-canoe:story`): { v: 1, season, legacy?, notebook: { found, abs, key, lake }, read: [],
// flags: {} }. A new season starts it blank. A season from before this round (its profile started, no story document)
// is marked legacy: it never saw the counter scene, and the campaign decides how it meets the notebook.
//
// K1a (docs/build/campaign-design.md §3.7): with STORY_ON (story-flag.js, `?story=1` on a dev server) `story` is the v2
// state of story.js instead, with the same surface (state.notebook, state.read, state.legacy, pages(), on/emit, found,
// read, flag), saved under `bwca-canoe:story2`. With the flag off this file is exactly what it was.
import { save } from './save.js';
import { STORY_ON } from './story-flag.js';

const NS = 'story';
export const blankStory = (season = null) => ({ v: 1, season, notebook: { found: false, abs: null, key: null, lake: null }, read: [], flags: {} });

// The placeholder pages, until the campaign writes its own (no story content this round): what a reader would see of a
// notebook kept in pencil, in plain words
const PLACEHOLDER = [
  { title: 'The first pages', text: 'Lists, mostly. Lakes and portages in a small hand, the rods counted, a night’s weather in a word or two. Years of trips, one after another.' },
  { title: 'Further on', text: 'The lists get shorter and the trips longer. Most of them alone. A few pages are torn out near the end.' },
  { title: 'The last page', text: 'The writing changes here: hurried, the pencil pressed hard, a line started and left. You can’t make it out by headlamp.' },
];

export class Story {
  constructor() {
    this.handlers = new Map();
    this.pagesFn = null;
    const s = save.read(NS);
    this.state = s && s.v === 1 ? { ...blankStory(s.season ?? null), ...s, notebook: { ...blankStory().notebook, ...(s.notebook || {}) }, read: Array.isArray(s.read) ? s.read.slice() : [], flags: { ...(s.flags || {}) } } : null;
  }
  // profile (profile.js): a season begun starts the story blank; a season from before this round is legacy
  attach({ profile = null } = {}) {
    this.profile = profile;
    const id = profile ? profile.seasonId : null;
    if (!this.state) {
      this.state = blankStory(id);
      if (profile && profile.started) this.state.legacy = true; // (an old season: its profile began before the story did)
      this.write();
    } else if (profile && profile.started && this.state.season && id && this.state.season !== id) {
      this.state = blankStory(id); this.write(); // (another season's document: a slot's keys out of step, never seen)
    }
    if (profile && typeof profile.onChange === 'function') profile.onChange((what) => { if (what === 'season') this.newSeason(profile.seasonId); });
    return this;
  }
  newSeason(id = null) { this.state = blankStory(id); this.write(); this.emit('season', { id }); }
  write() { save.write(NS, this.state); }
  get legacy() { return !!(this.state && this.state.legacy); }

  // --- the bus ------------------------------------------------------------------------------------------------------
  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
    return () => this.handlers.get(evt).delete(fn);
  }
  emit(evt, data = {}) {
    for (const fn of this.handlers.get(evt) || []) { try { fn(data, this); } catch (e) { console.warn('story.on', evt, e); } }
    for (const fn of this.handlers.get('*') || []) { try { fn(evt, data, this); } catch (e) { console.warn('story.on *', e); } }
  }

  // --- the notebook's pages ------------------------------------------------------------------------------------------
  setPages(fn) { this.pagesFn = typeof fn === 'function' ? fn : null; }
  pages() {
    let p = null;
    if (this.pagesFn) { try { p = this.pagesFn(this.state); } catch (e) { console.warn('story.pages', e); p = null; } }
    return Array.isArray(p) && p.length ? p : PLACEHOLDER;
  }
  read(i) {
    const pages = this.pages(), n = Math.max(0, Math.min(pages.length - 1, i | 0)), page = pages[n];
    if (!this.state.read.includes(n)) { this.state.read.push(n); this.write(); }
    this.emit('notebook:read', { page: n, title: page.title });
    return page;
  }
  flag(key, value) {
    if (value === undefined) return this.state.flags[key];
    this.state.flags[key] = value; this.write();
    return value;
  }
  // the notebook found (walt.js): kept, and said
  found({ abs, key = null, lake = null }) {
    this.state.notebook = { found: true, abs, key, lake };
    this.write();
    this.emit('notebook:found', { abs, key, lake });
  }
}

// (the R0 join: story.js and its rules are imported only under the flag, so with it off not one v2 module is fetched or
// evaluated; the build keeps them as a chunk never loaded. c1base: no top-level await here. One made this module, and
// main.js with it, evaluate a tick late, so key listeners other modules add as they load landed in another order: with
// the flag off an Escape out of a talk opened the pause card (r3-journal-test 5a). So `story` is a live binding: the
// v1 story at load with the flag off, exactly as main; under STORY_ON null until main() awaits loadStory() first thing)
export let story = STORY_ON ? null : new Story();
export async function loadStory() {
  if (STORY_ON && !story) {
    const { StoryV2 } = await import('./story.js');
    story = new StoryV2({ io: save }); // (every stream's rules from the start: story-data/rules-all.js, so the data stamp is the same every boot)
  }
  return story;
}
export { STORY_ON };
