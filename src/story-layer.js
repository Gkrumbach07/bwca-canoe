// STUB (K1b, campaign-design §7.1): the story layer's events, the shape Round 1 builds against. L replaces this file's
// body (story-places.json, props per tile, dot names and verbs, exclusions, triggers polled every 0.5 s on a coarse
// cell grid); B (read-here), P (inking on a place) and feed-place.js listen.
//
//   layer.on(evt, fn) → off      evt: 'enter' | 'stand' | 'readHere' | 'photo' | 'sleep' | 'cross'   (a place's triggers)
//                                     'use' (a prop's verb: { prop, verb }) · 'prop:reveal' ({ id })
//                                     '*' (fn(evt, data))
//                                data: { place, prop?, r?, … } (place: a story-places.json id)
//   layer.places() → []          the places loaded (none in the stub)
//   layer.debug.fire(evt, data)  rigs and the witness plans: as if the trigger fired
//
// The stub has no places, so nothing fires by itself.
const handlers = new Map();
const EVENTS = new Set(['enter', 'stand', 'readHere', 'photo', 'sleep', 'cross', 'use', 'prop:reveal', '*']);

function fire(evt, data = {}) {
  for (const fn of handlers.get(evt) || []) { try { fn(data); } catch (e) { console.warn('layer.on', evt, e); } }
  for (const fn of handlers.get('*') || []) { try { fn(evt, data); } catch (e) { console.warn('layer.on *', e); } }
}

export const layer = {
  stub: true,
  on(evt, fn) {
    if (!EVENTS.has(evt)) throw new Error(`story-layer: no event ${evt}`);
    if (!handlers.has(evt)) handlers.set(evt, new Set());
    handlers.get(evt).add(fn);
    return () => handlers.get(evt).delete(fn);
  },
  places() { return []; },
  debug: { fire },
};
