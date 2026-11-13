// The story feed's outfitter adapter (K1b; story-feed.js, campaign-design Appendix A). The store's door, from
// outfitter.on (enterStore / leaveStore):
//
//   'store:enter' → store:enter { ep }      over the threshold
//   'walkout'     → walkout { ep }          back out of the door: Tauno's trigger (§5.1). The feed drops both on a co-op
//                                           guest (HOST_ONLY), so a guest walking out never stages anyone
import { feed } from './story-feed.js';

export function outfitterAdapter(api) {
  const o = api.mods.outfitter; if (!o) return null;
  api.on(o, 'store:enter', (e) => api.emit('store:enter', { ep: e.ep ?? null }));
  api.on(o, 'walkout', (e) => api.emit('walkout', { ep: e.ep ?? null }));
  return null;
}

feed.register('outfitter', outfitterAdapter);
