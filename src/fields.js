import { fbm, smoothstep } from './rng.js';

// Landscape fields shared by terrain colour, vegetation and ground cover so they agree with each other.
export const clearingAt = (x, z) => fbm(x * 0.0035, z * 0.0035, 3, 21);
// old burn scars (the Pagami Creek fire ran through this very area): standing snags, grass, young spruce
export const burnAt = (x, z) => smoothstep(0.64, 0.72, fbm(x * 0.0012 + 3, z * 0.0012, 3, 44));
// sheltered water: where lily pads and reeds grow
export const calmAt = (x, z) => fbm(x * 0.008, z * 0.008, 2, 61);
