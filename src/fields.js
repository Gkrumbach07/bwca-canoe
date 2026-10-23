import { fbm, smoothstep } from './rng.js';

// Landscape fields shared by terrain colour, vegetation and ground cover so they agree with each other.
export const clearingAt = (x, z) => fbm(x * 0.0035, z * 0.0035, 3, 21);
// old burn scars (the Pagami Creek fire ran through this very area): standing snags, grass, young spruce
export const burnAt = (x, z) => smoothstep(0.64, 0.72, fbm(x * 0.0012 + 3, z * 0.0012, 3, 44));
// sheltered water: where lily pads and reeds grow
export const calmAt = (x, z) => fbm(x * 0.008, z * 0.008, 2, 61);
// Rocky ground from a point's slope and shore distance alone, for what has no tile at hand: the far terrain,
// the fishing (is the shore here bedrock?) and the lake plants (nothing roots on a rocky shore). A
// low-frequency field raises glaciated knobs near the shore and on relief inland, and a steep shore is rock;
// steep ground inland only partly (the forest climbs it). 0 = soil, 1 = bare rock; the layers switch at 0.5.
// The fine terrain and the forest read the tile's site instead (site.js), which knows cliffs, scree and ridges.
export function rockAt(slope, sd, x, z) {
  const knob = fbm(x * 0.007 + 5, z * 0.007, 3, 73);
  const nearShore = 1 - smoothstep(25, 90, sd);
  const knobby = smoothstep(0.64, 0.76, knob) * Math.max(nearShore, smoothstep(0.12, 0.3, slope));
  const steepShore = (1 - smoothstep(8, 30, sd)) * smoothstep(0.32, 0.5, slope);
  return Math.max(knobby, steepShore, 0.45 * smoothstep(0.5, 0.95, slope));
}
