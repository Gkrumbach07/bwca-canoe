// The story feed's trip adapter (K1b; story-feed.js, campaign-design Appendix A). trip.js's log, in the story's words:
//
//   'start' | 'leave' → trip:start { n, ep }            n: the trip's number in the season (the logbook's count + 1)
//   'exit'            → trip:end { n, ep, outcome }      outcome: 'completed' | 'evacuated' | 'abandoned' …
//   'lake'            → lake { id, name }
//   'portage'         → carry { i, rods, name, trip, seq }   i: the index into world.portages (-1: none); seq 1, 2, … on the trip
//                       carrypair { a, b, trip }        two carries back to back on one trip (a the one before); a
//                       carry repeated over the same trail (a double portage's walk back) doesn't break a pair
//   'camp'            → camp { site, x, z, offsite }    site: the campsite's key (null off a site)
//   'sleep'           → sleep { site, kind, hours }     (a nap is not a sleep; the Walt items carried are B's feed-book.js)
//   'capsize'         → capsize · 'evac' → evac { why, to }
import { feed } from './story-feed.js';

export function tripAdapter(api) {
  const trip = api.mods.trip; if (!trip) return null;
  const tripNo = () => ((trip.book && trip.book.trips) ? trip.book.trips.length : 0) + (trip.active ? 1 : 0);
  // the trip under way: its number, and its carries so far (seq, the last distinct trail)
  let cur = trip.active ? { n: tripNo(), ep: trip.state.from ?? null, seq: 0, last: null } : null;
  const ensure = () => cur || (cur = { n: tripNo(), ep: trip.state.from ?? null, seq: 0, last: null });
  const on = (kind, fn) => api.on(trip, kind, fn);
  const out = (evt, data) => api.emit(evt, data);
  on('start', (e) => { cur = { n: tripNo(), ep: e.ep ?? null, seq: 0, last: null }; out('trip:start', { n: cur.n, ep: cur.ep }); });
  on('leave', (e) => { cur = { n: tripNo(), ep: e.ep ?? null, seq: 0, last: null }; out('trip:start', { n: cur.n, ep: cur.ep }); });
  on('exit', (e) => {
    const o = e.outcome || {}, n = cur ? cur.n : tripNo();
    out('trip:end', { n, ep: o.ep ?? null, outcome: o.k ?? null });
    cur = null;
  });
  on('lake', (e) => out('lake', { id: e.id, name: e.name ?? null }));
  on('portage', (e) => {
    const c = ensure(), i = Number.isInteger(e.i) ? e.i : -1;
    c.seq++;
    out('carry', { i, rods: e.rods ?? null, name: e.name ?? null, trip: c.n, seq: c.seq });
    if (i < 0) return;
    if (c.last != null && c.last !== i) out('carrypair', { a: c.last, b: i, trip: c.n });
    c.last = i;
  });
  on('camp', (e) => out('camp', { site: e.key ?? null, x: e.x, z: e.z, offsite: !!e.offsite }));
  on('sleep', (e) => out('sleep', { site: e.key ?? null, kind: e.kind ?? null, hours: e.hours ?? null }));
  on('capsize', () => out('capsize', {}));
  on('evac', (e) => out('evac', { why: e.why ?? null, to: e.to ?? null }));
  return null;
}

feed.register('trip', tripAdapter);
