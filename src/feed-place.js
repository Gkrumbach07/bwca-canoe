// The story feed's place adapter (stream L, Round 1; story-feed.js, campaign-design Appendix A). The story layer's own
// events, in the story's words, so other streams' rules can key on them (`on: 'use'`, `on: 'readHere'`, `on: 'photo'`):
//
//   layer 'use'      → use { prop, verb, place }        a prop's verb pressed (its own `then` the layer has applied)
//   layer 'readHere' → readHere { nb, place }          a notebook entry read at the place he wrote it (he was here)
//   layer 'photo'    → photo { id, matches, place }    a picture that fits a place's photo target
//
// (enter / stand / sleep / cross act through each place's own triggers: they are not vocabulary.) A guest's layer fires
// none of these, and the feed drops a mirror's anyway.
import { feed } from './story-feed.js';
import { layer } from './story-layer.js';

export function placeAdapter(api) {
  const out = (evt, data) => api.emit(evt, data);
  const offs = [
    layer.on('use', (d) => out('use', { prop: d.prop, verb: d.verb, place: d.place })),
    layer.on('readHere', (d) => out('readHere', { nb: d.nb, place: d.place })),
    layer.on('photo', (d) => out('photo', { id: d.id, matches: d.matches || [], place: d.place })),
  ];
  return () => { for (const off of offs) off(); };
}

feed.register('place', placeAdapter);
