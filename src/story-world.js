// The story layer's part of the world (docs/build/campaign-design.md §7.1, §7.2; stream L, Round 1), applied in
// World.load (world.js, only under STORY_ON) before the TileManager is made: the clearings every story place could ever
// need (the forest, brush and rocks kept off each prop, the grade's old road), in `world.storyClear` for props.js
// exclusionsFor, so they are in the array the workers get once; and the story's carries (none this round: the hidden
// carry is Round 3's), appended with world.addStoryPortage so they are the tail of world.portages.
//
//   applyStoryWorld(world) → { places, sites, clear }    world.storyPlaces = the same (story-layer.js reads it)
//   storyPlaces(world, data?) → { places: [place], sites: [site], portages: { id → { i, … } }, stale }   (pure; Node tests)
//
// A place's x/z come only from its `resolved` block (scripts/story-places.mjs), and only for the release it was made for
// (`for` = the release's bake time): on another release nothing is placed (stale), never a crib in the wrong lake.
import { waltSites, RESOLVED as SITES_RESOLVED } from './walt-sites.js';
// (story-places.json is read by a dynamic import in applyStoryWorld, so this module also loads in Node, where a JSON
// import needs an attribute the lint's parser does not take: the Node checks read the file and pass it in)

export const CLEAR = { anchor: 9, prop: 2.4, tree: 3.2, stump: 2.2, lane: 2.2 }; // m, lawns (the grass grows through)
const TREE_KITS = new Set(['redPine']);

// the places as the runtime reads them: each with its anchor and every prop's x/z
export function storyPlaces(world, data, sites = null) {
  const baked = world && world.meta && world.meta.source ? world.meta.source.baked : null;
  const R = data && data.resolved;
  const stale = !R || R.for !== baked;
  const places = [];
  if (!stale) {
    for (const pl of data.places || []) {
      const r = R.places && R.places[pl.id];
      if (!r) continue;
      const props = (pl.props || []).map((pr) => ({ ...pr, ...(r.props && r.props[pr.id] ? { x: r.props[pr.id].x, z: r.props[pr.id].z, heading: r.props[pr.id].heading } : {}) }));
      places.push({ ...pl, x: r.x ?? pl.x, z: r.z ?? pl.z, landing: r.landing || null, lanes: r.lanes || [], n: r.n || null, u: r.u || null, site: r.site ?? null, trailhead: r.trailhead ?? pl.trailhead ?? null, props, verbs: pl.verbs || [], triggers: pl.triggers || [] });
    }
  }
  // Walt's starred sites: one place each, a stump with the white stone on it at the site's landing
  const S = sites || (SITES_RESOLVED && SITES_RESOLVED.for === baked ? waltSites() : []);
  for (const s of S) places.push(sitePlace(s));
  const portages = !stale && R.portages ? R.portages : {};
  return { places, sites: S, portages, stale, baked };
}

// a starred site as a place: the stump up from the landing (the way up's direction) on dry ground, the stone on it. Dot: "Stump"
// until the notebook is found (before night one, no Walt lore at all: Ignoring it all), then "A white stone on a stump".
// Look (after night one) counts the stone (stone.<site>) and gives 20 §2.4's Walt line; three stones are lock 4's key B
// (story-data/rules-layer.js). Reading his entry for this site here is "read it where he wrote it" (he was here).
export function sitePlace(s) {
  const up = s.up || [0, 1], L = s.landing || [s.x, s.z];
  const at = s.stump || [L[0] + up[0] * 1.6, L[1] + up[1] * 1.6]; // (story-places.mjs: up from the landing to dry ground)
  const x = +at[0].toFixed(2), z = +at[1].toFixed(2), heading = Math.atan2(-up[0], -up[1]);
  const stump = `${s.id}.stump`;
  return {
    id: s.id, name: `${s.lake}${s.nick ? `, ${s.nick}` : ''} (a starred site)`, kind: 'site', x, z, lake: s.lake, lakeId: s.lakeId, site: s.site ?? null, nb: s.nb || [],
    props: [
      { id: stump, kit: 'stumpCut', x, z, heading, show: 'true', dot: [{ when: 'f:nb.found', name: 'A white stone on a stump' }, { when: 'true', name: 'Stump' }] },
      { id: `${s.id}.stone`, kit: 'quartzCobble', on: stump, x, z, heading, show: 'true' },
    ],
    verbs: [{ prop: stump, verb: 'Look', when: 'f:nb.found', then: [`f:stone.${s.id.slice(3)}`, 'walt:20:2.4.w2'] }],
    triggers: (s.nb || []).map((nb) => ({ on: 'readHere', nb, r: 90, when: 'f:nb.found', then: [] })),
    lanes: [],
  };
}

// the clearings, as exclusion segments [x1, z1, x2, z2, r] (r < 0: a lawn; never a positive-radius point, which site.js
// reads as a campsite)
export function storyClearings(places) {
  const out = [];
  const pt = (x, z, r) => out.push([x, z, x, z, -r]); // (a lawn round a point, as an entry point's yard is)
  for (const pl of places) {
    if (pl.trailhead) continue; // (beside a lot: placed when the lot is built, in its own yard)
    if (pl.clear && Number.isFinite(pl.x)) pt(pl.x, pl.z, pl.clear);
    for (const pr of pl.props || []) if (Number.isFinite(pr.x)) pt(pr.x, pr.z, pr.kit === 'stumpCut' || pr.kit === 'quartzCobble' ? CLEAR.stump : TREE_KITS.has(pr.kit) ? CLEAR.tree : CLEAR.prop);
    for (const ln of pl.lanes || []) out.push([ln.a[0], ln.a[1], ln.b[0], ln.b[1], -(ln.r || CLEAR.lane)]);
  }
  return out;
}

export async function applyStoryWorld(world, data = null) {
  const PLACES = data || (await import('./story-places.json')).default;
  const S = storyPlaces(world, PLACES);
  if (S.stale) console.warn(`story layer: story-places.json was resolved for another release (${PLACES.resolved && PLACES.resolved.for}; this is ${S.baked}): run node scripts/story-places.mjs --write`);
  const clear = storyClearings(S.places);
  world.storyClear = clear;
  world.storyPlaces = S;
  // f: begin (Round 3 stream F) the hidden carry, as resolved for this release (story-places.mjs: its trail on dry ground,
  // its launch onto Gull's creek mouth, its knob end a road end's no-launch), keyed by its id, never by index
  const RC = !S.stale && PLACES.resolved && PLACES.resolved.carries ? PLACES.resolved.carries : {};
  for (const c of (PLACES.carries || [])) { const q = RC[c.id]; if (q) world.addStoryPortage({ ...q, hidden: true, rods: null }); }
  // f: end
  return { ...S, clear };
}
