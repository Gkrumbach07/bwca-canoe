import { fbm, smoothstep } from './rng.js';
import { burnOpenAt } from './burns.js';

// Landscape fields shared by terrain colour, vegetation and ground cover so they agree with each other.
export const clearingAt = (x, z) => fbm(x * 0.0035, z * 0.0035, 3, 21);
// The open ground of a burn (0..1), from the real perimeters and the season's date (burns.js; it was an fbm noise field
// until 2026-10-26). What a burn grows by its age is burns.js burnLook; this is only how open it is, for what reads one
// number (site.js).
export const burnAt = (x, z) => burnOpenAt(x, z);
// sheltered water: where lily pads and reeds grow
export const calmAt = (x, z) => fbm(x * 0.008, z * 0.008, 2, 61);
// the glaciated knobs: a low-frequency field, high where the Shield stands up through the soil
export const knobAt = (x, z) => fbm(x * 0.007 + 5, z * 0.007, 3, 73);
// the sandy ground of the old outwash: the few coves where a real beach lies (site.js, terrain-build.js)
export const sandAt = (x, z) => fbm(x * 0.004 - 11, z * 0.004 + 7, 2, 233);

// Where the woods open into a meadow (0..1). In the Boundary Waters the openings are burns, bogs, beaver meadows
// and campsites, not upland lawns: a meadow here is a fen or a beaver meadow on wet flat ground (wet: site.js, 0..1),
// or now and then an old dry opening well inland. Never on an upland shore, where the forest runs to the water.
// The terrain's paint (terrain-build.js), the forest and the grass (placement.js) all read this one field.
export const MEADOW = { dry: [0.76, 0.8], wet: [0.6, 0.68], inland: [45, 110] };
export function meadowAt(x, z, sd, wet = 0) {
  const c = clearingAt(x, z);
  const dry = smoothstep(MEADOW.dry[0], MEADOW.dry[1], c) * smoothstep(MEADOW.inland[0], MEADOW.inland[1], sd);
  const fen = smoothstep(MEADOW.wet[0], MEADOW.wet[1], c) * smoothstep(0.45, 0.7, wet);
  return Math.max(dry, fen);
}

// Rocky ground from a point's slope and shore distance alone, for what has no tile at hand: the far terrain,
// the fishing (is the shore here bedrock?) and the lake plants (nothing roots on a rocky shore). 0 = soil, 1 = bare
// rock; the layers switch at 0.5. Along the shores the forest runs to the water and the rock shows only as a ledge
// a few metres wide at the waterline where the knob field stands up (and on a steep shore, a bluff); inland the
// knobs are bare on relief, and steep ground is partly bare (the forest climbs it).
// The fine terrain and the forest read the tile's site instead (site.js), which knows cliffs, scree, ridges,
// points and campsites.
export function rockAt(slope, sd, x, z) {
  const knob = smoothstep(0.64, 0.76, knobAt(x, z));
  const ledge = 1 - smoothstep(3, 9, sd);
  const knobby = knob * Math.max(ledge, smoothstep(0.12, 0.3, slope) * smoothstep(20, 60, sd));
  const steepShore = (1 - smoothstep(6, 18, sd)) * smoothstep(0.36, 0.55, slope);
  return Math.max(knobby, steepShore, 0.45 * smoothstep(0.5, 0.95, slope));
}
