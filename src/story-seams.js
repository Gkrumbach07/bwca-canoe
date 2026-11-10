// The story's seams in one place (K1b, campaign-design Part 4 Round 0): the stub interfaces Round 1 builds against and
// the feed's start, so main.js needs one small block. main.js imports this module only under STORY_ON (a dynamic
// import), so with the flag off neither it nor the stubs below are loaded and nothing is hung on the story.
//
//   installSeams(story) → seams   story.ui (story-ui.js) and story.allows (story-allows.js) hung on the story object
//                                 when it has none of its own. Both do nothing yet (pickLake resolves null, allows says
//                                 yes). A Round 1 caller reads them as optional (story.allows && …), since with the flag
//                                 off they are absent. → { ui, allows, pencil, layer }
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
    import('./feed-place.js'),     // st-l: the story layer's verbs, read-here and photos
    // (Round 1 streams: their feed-*.js here, one line each)
  ]);
  return feed.start({ story, mods, guest });
}
