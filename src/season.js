import { smoothstep } from './rng.js';

// The year in the Boundary Waters, from a day of the year. Dates are typical for the Ely area: ice-out
// around the first week of May, birch and aspen leafing out mid-May, fireweed in high summer, colour in
// the last two weeks of September, bare by the end of October, freeze-up toward the end of November.
// Every value is 0..1 and changes smoothly over a week or two, so nothing pops.
export function seasonAt(doy) {
  const ice = Math.max(1 - smoothstep(118, 130, doy), smoothstep(322, 336, doy));          // lakes frozen
  const leaf = smoothstep(128, 146, doy);                                                   // leaf-out, spring green first
  const spring = leaf * (1 - smoothstep(146, 175, doy));                                    // the pale fresh-leaf weeks
  const fall = smoothstep(258, 280, doy) * (1 - smoothstep(292, 304, doy));                 // gold and red
  const bare = smoothstep(290, 304, doy);                                                   // leaves down
  const grass = 1 - smoothstep(255, 290, doy) * 0.85 + (1 - smoothstep(130, 160, doy)) * 0; // green until September, then tawny
  const pads = smoothstep(152, 166, doy) * (1 - smoothstep(262, 276, doy));                 // lily pads on the surface
  const flower = smoothstep(184, 196, doy) * (1 - smoothstep(226, 240, doy));               // fireweed
  const loons = smoothstep(120, 128, doy) * (1 - smoothstep(292, 304, doy));                // on the lakes
  const cold = 1 - Math.sin(Math.PI * smoothstep(120, 320, doy));                           // 0 in high summer, 1 at the edges
  // surface water temperature, degrees C: 4 at ice-out, low twenties at the end of July, single digits by late October
  const waterTemp = 4 + 18 * Math.sin(Math.PI * smoothstep(125, 320, doy)) ** 1.4;
  // golden grass and shrub tints for the ground cover and the deciduous foliage
  const grassTint = fall > 0 || bare > 0
    ? [1 + 0.2 * Math.max(fall, bare), 1 - 0.15 * Math.max(fall, bare), 1 - 0.45 * Math.max(fall, bare)]
    : spring > 0 ? [1 - 0.08 * spring, 1 + 0.04 * spring, 1 - 0.25 * spring] : [1, 1, 1];
  return { doy, ice, leaf, spring, fall, bare, grass, pads, flower, loons, cold, waterTemp, grassTint, leafOn: leaf > 0.5 && bare < 0.5 ? 1 : 0 };
}

export function seasonName(doy) {
  if (doy < 60 || doy >= 335) return 'winter';
  if (doy < 152) return 'spring';
  if (doy < 244) return 'summer';
  return 'fall';
}
