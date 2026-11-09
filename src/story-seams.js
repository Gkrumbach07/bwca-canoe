// The story's seams in one place (K1b, campaign-design Part 4 Round 0): the stub interfaces Round 1 builds against and
// the feed's start, so main.js needs one small block.
//
//   installSeams(story) → seams   always (flag on or off): story.ui (story-ui.js) and story.allows (story-allows.js)
//                                 hung on the story object when it has none of its own. Both do nothing yet (pickLake
//                                 resolves null, allows says yes), so a caller wired in Round 1 changes nothing with
//                                 the flag off. → { ui, allows, pencil, layer }
//   startFeed({ story, mods, guest }) → feed   only under STORY_ON (main.js checks): loads the K1b adapters (trip,
//                                 outfitter) and starts the feed over them. Later streams add their adapter imports here.
import { ui } from './story-ui.js';
import { allows } from './story-allows.js';
import { pencil } from './pencil.js';
import { layer } from './story-layer.js';

export function installSeams(story) {
  if (story) {
    if (!('ui' in story)) story.ui = ui;
    if (!('allows' in story)) story.allows = allows;
  }
  return { ui, allows, pencil, layer };
}

export async function startFeed({ story, mods = {}, guest = () => false } = {}) {
  const [{ feed }] = await Promise.all([
    import('./story-feed.js'),
    import('./feed-trip.js'),      // K1b: trip.js's log
    import('./feed-outfitter.js'), // K1b: the store's door
    // (Round 1 streams: their feed-*.js here, one line each)
  ]);
  return feed.start({ story, mods, guest });
}
