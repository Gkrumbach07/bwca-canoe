// The story feed's book adapter (stream B, Round 1; story-feed.js, campaign-design Appendix A). The book itself
// (notebook.js) writes its own marks into the story (read, read here, the back cover); what comes from elsewhere in the
// game, in the story's words, comes through here:
//
//   the story layer's 'readHere' { place, nb }  → readHere { nb, place }   (stream L's trigger, when L fires one itself;
//                                                 the book marks the page from the story's 'readHere')
//   a story page or Walt's thing into the inventory → got { item }          (kind 'page', and WALT_IDS: once each, the
//                                                 first time it is seen in the inventory this session)
import { feed } from './story-feed.js';
import { layer } from './story-layer.js';
import { itemDef, WALT_IDS } from './items.js';

export function bookAdapter(api) {
  const offs = [];
  offs.push(api.on(layer, 'readHere', (d) => { if (d && d.nb) api.emit('readHere', { nb: d.nb, place: d.place ?? null }); }));
  const inv = api.mods.inventory;
  if (inv && typeof inv.onChange === 'function') {
    const seen = new Set();
    const look = (quiet = false) => {
      for (const c of inv.containers || []) for (const e of c.grid || []) {
        if (e.box || seen.has(e.id)) continue;
        const d = itemDef(e.id);
        if (d && (d.kind === 'page' || WALT_IDS.includes(e.id))) { seen.add(e.id); if (!quiet) api.emit('got', { item: e.id }); }
      }
    };
    look(true); // (what is there already counts as seen, quietly: the story already has it)
    offs.push(inv.onChange((what) => { if (what === 'items' || what === 'carry') look(); }));
  }
  return () => { for (const off of offs) { try { if (typeof off === 'function') off(); } catch { /* gone */ } } };
}

feed.register('book', bookAdapter);
