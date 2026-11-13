// The run's legs (docs/story/50-finale.md §6.7, §6.11, §6.13; campaign-design §8.3; Round 3 stream R). Data only, no
// game imports (story-unit and the solver read it in Node). Every x/z is the doc's (03-places, looked up again in v9
// by the doc's authors); a place the doc gives no point for (the bay mouth) is drawn between the two it lies between.
//
//   ROUTES.lakeone | ROUTES.gabbro | ROUTES.any    { id, ep, nights, legs: [{ id, from, to, carry?, rods?, cps, who, beat }] }
//   routeFor(meeting) → the route for a meeting ({ ep } or null): 30 → lakeone, 33 → gabbro (then Farm 31), else any
//   legAt(route, x, z, last) → the leg the player is on: the nearest leg's line, never more than one leg back from the
//     furthest reached (a feint west at the narrows does not throw the route back to the bay)
//   STASHES   the three stashes (§6.9): { id, x, z, item, line }, each a checkpoint when taken
//   PORTAGE_ENDS  every carry end on the designed routes: a checkpoint when reached in a good state (§8.5)
//   POSTS     named spots the watchers sit on (watchers.js): the bay mouth, the narrows, the 214's Rock Island end …

export const PT = {
  dam: [-19835, 26740], bayMouth: [-20420, 26880], camp: [-19385, 27355], pit: [-18885, 27725],
  p530g: [-22741, 27131], p530p: [-22708, 26891], p27p: [-22212, 25436], p27c: [-22195, 25118],
  p24c: [-22270, 24726], p24w: [-21984, 24210], p26w: [-21182, 23400], p26r: [-20505, 22631],
  p233: [-19711, 21224], lakeOne: [-19407, 19614], ep30: [-19615, 16805], c1584: [-18802, 17562],
  // the west: the P256 narrows at Gull's west end (the doc names it, gives no point: the fork's far side, 1.4 km on),
  // Bald Eagle's crews' landing, Turtle (round by P497/P25 to Clearwater's west end)
  narrows: [-24180, 27420], crews: [-25825, 29925], turtle: [-23050, 23620], p25w: [-22410, 23880],
  paddle: [-22705, 26855], drybag: [-22275, 24755], grumman: [-20495, 22645],
};

export const STASHES = [
  { id: 'paddle', x: PT.paddle[0], z: PT.paddle[1], item: 'sparepaddle', leg: 'pietro', walt: 'run.walt.paddle' },
  { id: 'drybag', x: PT.drybag[0], z: PT.drybag[1], item: 'scanner', leg: 'camdre', walt: 'run.walt.drybag' },
  { id: 'grumman', x: PT.grumman[0], z: PT.grumman[1], item: null, leg: 'p26', walt: 'run.walt.grumman' },
];

const L = (id, from, to, o = {}) => ({ id, from: PT[from] || from, to: PT[to] || to, ...o });

export const ROUTES = {
  // Walt's own plan: "Back door to the Front Porch in one dark." EP 30, ≥ 11.6 km, 7 carries, 544 r
  lakeone: { id: 'lakeone', ep: 30, nights: 1, legs: [
    L('bay', 'dam', 'bayMouth', { who: ['one'], cps: ['pit'] }),
    L('gull', 'bayMouth', 'p530g', { who: ['one', 'three'], cps: ['p530g'], fork: 'narrows' }),
    L('pietro', 'p530p', 'p27p', { carry: 'P530', rods: 50, who: [], cps: ['p530p', 'paddle'] }),
    L('camdre', 'p27c', 'p24c', { carry: 'P27', rods: 63, who: [], cps: ['p27c', 'p24c', 'drybag'] }),
    L('clearwater', 'p24w', 'p26w', { carry: 'P24', rods: 121, who: ['three'], cps: ['p24w'], fork: 'p25w' }),
    L('p26', 'p26w', 'p26r', { carry: 'P26', rods: 214, who: ['two'], cps: ['p26w', 'p26r', 'grumman'] }),
    L('rockisland', 'p26r', 'p233', { carry: 'P233', rods: 30, who: ['two'], cps: ['p233'] }),
    L('laketwo', 'p233', 'lakeOne', { carry: 'P234/P235', rods: 66, who: ['two'], cps: ['lakeOne'], tieoff: true }),
    L('lakeone', 'lakeOne', 'ep30', { who: ['base', 'two'], cps: ['c1584'], last: true }),
  ] },
  // the variant (§6.11): Gull → the narrows → Bald Eagle → Little Gabbro (EP 33), a day hidden, then Farm 31
  gabbro: { id: 'gabbro', ep: 33, then: 31, nights: 2, legs: [
    L('bay', 'dam', 'bayMouth', { who: ['one'], cps: ['pit'] }),
    L('gull', 'bayMouth', 'narrows', { who: ['one', 'three'], cps: ['narrows'] }),
    L('baldeagle', 'narrows', 'crews', { carry: 'P256/P255', rods: 255, who: ['one'], cps: ['crews'] }),
    L('gabbro', 'crews', [-27800, 27200], { carry: 'P693', rods: 6, who: ['base'], cps: [], last: true }),
  ] },
  any: { id: 'any', ep: null, nights: 1, legs: [L('bay', 'dam', 'bayMouth', { who: ['one'], cps: ['pit'] }), L('out', 'bayMouth', 'bayMouth', { who: ['one', 'base'], cps: [], last: true, open: true })] },
};

export function routeFor(meeting) {
  const ep = meeting && Number(meeting.ep);
  if (ep === 30) return ROUTES.lakeone;
  if (ep === 33) return ROUTES.gabbro;
  return ROUTES.any;
}

const segD = (x, z, a, b) => {
  const ux = b[0] - a[0], uz = b[1] - a[1], c = ux * ux + uz * uz;
  const t = c > 1e-6 ? Math.max(0, Math.min(1, ((x - a[0]) * ux + (z - a[1]) * uz) / c)) : 0;
  return Math.hypot(a[0] + ux * t - x, a[1] + uz * t - z);
};
// the leg the player is on (index), at most one behind the furthest reached
export function legAt(route, x, z, last = 0) {
  let best = last, bd = Infinity;
  route.legs.forEach((g, i) => {
    if (i < last - 1) return;
    const d = segD(x, z, g.from, g.to) + (i < last ? 150 : 0);
    if (d < bd) { bd = d; best = i; }
  });
  return { i: best, d: bd, leg: route.legs[best] };
}

// the carry ends on the designed routes (a checkpoint when reached unseen: §8.5)
export const PORTAGE_ENDS = ['p530g', 'p530p', 'p27p', 'p27c', 'p24c', 'p24w', 'p26w', 'p26r', 'p233', 'lakeOne', 'narrows']
  .map((id) => ({ id, x: PT[id][0], z: PT[id][1] }));

// where the watchers sit (watchers.js reads these by name)
export const POSTS = {
  bayMouth: { x: PT.bayMouth[0] - 60, z: PT.bayMouth[1] + 40 },
  narrows: { x: PT.narrows[0] + 40, z: PT.narrows[1] },
  p26r: { x: PT.p26r[0] + 70, z: PT.p26r[1] - 50 }, p26rNear: { x: PT.p26r[0] + 35, z: PT.p26r[1] - 25 },
  ep30: { x: PT.ep30[0], z: PT.ep30[1] }, ep30off: { x: PT.ep30[0] + 20, z: PT.ep30[1] + 100 },
  p24w: { x: PT.p24w[0] + 50, z: PT.p24w[1] - 30 }, p25w: { x: PT.p25w[0], z: PT.p25w[1] },
};
// Two's way south up the chain and back (Lake One landing → P235 → Lake Two → P233 → Rock Island → the 214's end)
export const TWO_SOUTH = [PT.ep30, [-19520, 18200], PT.lakeOne, [-19560, 20400], PT.p233, [-20100, 21900], [POSTS.p26r.x, POSTS.p26r.z]];
// Three round by Turtle onto Clearwater
export const THREE_ROUND = [[POSTS.narrows.x, POSTS.narrows.z], [-23600, 25600], PT.turtle, PT.p25w, [POSTS.p24w.x, POSTS.p24w.z]];
