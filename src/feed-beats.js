// The story feed's director adapter (stream D, story Round 2; story-feed.js, campaign-design §12 and Appendix A). The
// trip's days and its evening, in the story's words, and the director's hooks on the game (all set here, under STORY_ON
// only: story-seams.js loads this with the other adapters; with the flag off none of it exists):
//
//   trip:evening { n, abs }    19:00 (DIR.hour) of a trip day, once a day (rule d.evening → beats.offerDay)
//   trip:day     { n, abs }    a new day on a trip (the first quarter-hour tick of it)
//
//   beats.world.ctx() → what the director reads when it weighs a beat: the player, today's track (a point each game
//     quarter-hour of the trip day), the parties camped tonight within DIR.partyR (parties.campsAt: { id, kind, x, z, d,
//     lakeId, lake }), the layer's places (layer.places(), layer.place), the open episodes' places (stream E:
//     episodes.places() → [{ id, place?, x, z, lake? | lakeId?, line: text id, kinds? }]), the trip's outfitter
//     (outfitters.js hostOf the put-in)
//   record.story = story        the trip card's tally reads story.tallyLines / tripLine / tripBeats (record.js d-blocks)
//   storyHook.line              party-camps.js: a party's line (beats.partyLine)
//   ambient.front               the counter's word (beats.counterLine: stall relief, a held climax's person)
// A co-op guest's story is a mirror: the feed drops every event, and each hook answers nothing (beats.live()).
import { feed } from './story-feed.js';
import { beats, DIR } from './beats.js';
import { record } from './record.js';
import { storyHook } from './party-camps.js';
import { ambient } from './ambient.js';
import { layer } from './story-layer.js';
import { hostOf } from './outfitters.js';

export function beatsAdapter(api) {
  const story = api.story, trip = api.mods.trip, world = api.mods.world;
  if (!story || story.v !== 2) return null;
  const G = () => (typeof window !== 'undefined' && window.__game) || {};
  const tripNo = () => ((trip && trip.book && trip.book.trips) ? trip.book.trips.length : 0) + (trip && trip.active ? 1 : 0);
  const track = [];
  let lastDay = null;
  const lakeName = (id) => { try { return id > 0 && world && world.lakeName ? world.lakeName(id) || null : null; } catch { return null; } };
  const ctx = () => {
    const g = G(), p = g.player, P = g.parties, day = g.day;
    const out = { player: p ? { x: p.x, z: p.z } : null, track: track.slice(), parties: [], places: [], episodes: [], host: null };
    if (P && p && typeof P.campsAt === 'function') {
      const T = P.today, h = Math.max(DIR.hour, day ? day.hours : DIR.hour);
      for (const c of P.campsAt(T, h)) {
        const d = Math.hypot(c.site.x - p.x, c.site.z - p.z); if (d > DIR.partyR) continue;
        const lakeId = typeof P.stayLake === 'function' ? P.stayLake(c.stay) : 0;
        out.parties.push({ id: String(c.party.id), kind: c.party.kind, size: c.party.size, key: c.key, x: c.site.x, z: c.site.z, d, lakeId, lake: lakeName(lakeId) });
      }
    }
    try { out.places = layer.places(); } catch { out.places = []; }
    out.hasPlace = (id) => !!layer.place(id);
    out.place = (id) => layer.place(id);
    const E = story.episodes || g.episodes;
    if (E && typeof E.places === 'function') { try { out.episodes = E.places() || []; } catch (e) { console.warn('beats: episodes.places', e); } }
    const from = trip && trip.state ? trip.state.from : null;
    try { out.host = from != null ? hostOf(from) : null; } catch { out.host = null; }
    if (out.host == null && g.profile) out.host = g.profile.home ?? null;
    return out;
  };
  beats.world = { ctx };
  record.story = story;
  storyHook.line = (party, how) => beats.partyLine(party, how);
  ambient.front = (kind, c) => beats.counterLine(kind, c);
  const offClock = story.on('clock', ({ abs, hours }) => {
    if (story.mode === 'mirror') return;
    if (!(trip && trip.active)) { track.length = 0; lastDay = null; return; }
    const p = G().player;
    if (p && !p.teleporting) { track.push({ x: p.x, z: p.z }); if (track.length > 200) track.shift(); }
    const n = tripNo();
    if (lastDay !== abs) { if (lastDay != null) { track.splice(0, Math.max(0, track.length - 1)); api.emit('trip:day', { n, abs }); } lastDay = abs; }
    if (hours >= DIR.hour && beats.eveningDue(abs)) { beats.markEvening(abs); api.emit('trip:evening', { n, abs }); }
  });
  return () => {
    offClock();
    if (record.story === story) record.story = null;
    storyHook.line = null; ambient.front = null; beats.world = null;
  };
}

feed.register('beats', beatsAdapter);
