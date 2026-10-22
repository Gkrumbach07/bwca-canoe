import { fbm, smoothstep } from './rng.js';

// Landscape fields shared by terrain colour, vegetation and ground cover so they agree with each other.
export const clearingAt = (x, z) => fbm(x * 0.0035, z * 0.0035, 3, 21);
// old burn scars (the Pagami Creek fire ran through this very area): standing snags, grass, young spruce
export const burnAt = (x, z) => smoothstep(0.64, 0.72, fbm(x * 0.0012 + 3, z * 0.0012, 3, 44));
// sheltered water: where lily pads and reeds grow
export const calmAt = (x, z) => fbm(x * 0.008, z * 0.008, 2, 61);
// Exposed bedrock, the one field the ground colour, the forest, the grass and the boulders all agree on:
// steep ground is rock, and a low-frequency field raises glaciated knobs on gentler ground near the shore
// and on relief inland. 0 = soil, 1 = bare rock; the layers switch at 0.5.
export function rockAt(slope, sd, x, z) {
  const knob = fbm(x * 0.007 + 5, z * 0.007, 3, 73);
  const steep = smoothstep(0.32, 0.5, slope);
  const nearShore = 1 - smoothstep(25, 90, sd);
  const knobby = smoothstep(0.64, 0.76, knob) * Math.max(nearShore, smoothstep(0.12, 0.3, slope));
  return Math.max(steep, knobby);
}
