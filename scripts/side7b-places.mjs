#!/usr/bin/env node
// Round 7 stream 7b's places, written into src/story-places.json (docs/story/60-side-stories.md S5, S6; 03-places.md
// §5 rows S5, S6). Run it, then `node scripts/story-places.mjs --write` (the resolver finds each by lake name and x/z in
// v9, the Beatty by its v3 carry). Replaces this stream's entries (kek.plane, s6.*) and leaves every other place.
//   node scripts/side7b-places.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const F = path.join(ROOT, 'src', 'story-places.json');
const PJ = JSON.parse(fs.readFileSync(F, 'utf8'));
const MINE = /^(kek\.plane$|s6\.)/;
const dot = (name, when = 'true') => [{ when, name }];
// the pit's own words once the eye is taught (60 S6 "The pit", S6.pitdot): the doc's, as the dot's name
const PITDOT = 'A square slump. Somebody dug here and covered it.';
const PIT = [-6, 150];      // the pit, ~150 m in from the quiet shore, on a rise above the pond
const PLANKS = [1, 2, 4, 5]; // (3 fell in long ago: the gap Walt saw the glint through)

const places = [
  // 60 S5: the wreck in 3.5 m off the Kek's quiet north shore (v9: (2805, 2475), 27 m out, bed 3.5 m; Secchi 4.4)
  { id: 'kek.plane', name: 'Kekekabic Lake, the north shore: the plane on the bed (60 S5)', doc: '60 S5 "The set piece: seeing and diving"; 03 §5',
    x: 2825, z: 2495, lake: 'Kekekabic Lake', shore: true, clear: 0, search: 160, r: 320, ep: 'S5',
    props: [
      { id: 's5.wreck', kit: 'wreck', at: [0, -26], wet: true, show: 'true' },
    ],
    verbs: [],
    triggers: [
      { on: 'readHere', nb: 'NB29', r: 320, when: 'f:nb.found', then: ['f:s5.here'] },
    ] },
  // 60 S6: Bootleg's quiet shore, the cut line of healed blazes inland past the beaver pond, the pit on the rise above it
  { id: 's6.bootleg', name: 'Bootleg Lake, the quiet shore: the cut line, the beaver pond and the bootleggers\' pit (60 S6)', doc: '60 S6 "The set piece"; 03 §5',
    x: -73055, z: 6265, lake: 'Bootleg Lake', shore: true, clear: 0, search: 220, r: 220, ep: 'S6',
    props: [
      { id: 's6.blaze.1', kit: 'catface', at: [-2, 28], show: 'true', dot: [{ when: 'f:tauno.blazes', name: 'Old blaze, no paint' }, { when: 'true', name: 'Old blaze' }] },
      { id: 's6.blaze.2', kit: 'catface', at: [-4, 66], show: 'true', dot: [{ when: 'f:tauno.blazes', name: 'Old blaze, no paint' }, { when: 'true', name: 'Old blaze' }] },
      { id: 's6.blaze.3', kit: 'catface', at: [-5, 104], show: 'true', dot: [{ when: 'f:tauno.blazes', name: 'Old blaze, no paint' }, { when: 'true', name: 'Old blaze' }] },
      { id: 's6.pond', kit: 'beaverPond', at: [16, 124], show: 'true' },
      { id: 's6.slump', kit: 'pit', at: PIT, show: '!f:s6.moss & !f:s6.dug', dot: [{ when: 'f:ep.S6.done | f:key.L6C', name: PITDOT }, { when: 'f:s6.know', name: 'Moss, sunk in a square' }, { when: 'true', name: 'Moss' }] },
      ...PLANKS.map((i) => ({ id: `s6.plank.${i}`, kit: 'pitPlank', at: PIT, opts: { i }, show: `f:s6.moss & !f:s6.plank.${i}`, dot: dot('Plank') })),
      ...PLANKS.map((i) => ({ id: `s6.tossed.${i}`, kit: 'plankTossed', at: PIT, opts: { i }, show: `f:s6.plank.${i}` })),
      { id: 's6.crate', kit: 'bootCrate', at: PIT, show: 'f:s6.moss & !f:s6.ledger', dot: [{ when: 'f:ep.S6.done', name: 'Oilcloth packet' }, { when: 'true', name: 'Crate' }] },
      { id: 's6.crate.taken', kit: 'bootCrate', at: PIT, opts: { ledger: false }, show: 'f:s6.ledger & !f:s6.bottle', dot: dot('Bottle, seal on') },
      { id: 's6.crate.empty', kit: 'bootCrate', at: PIT, opts: { ledger: false, bottle: false }, show: 'f:s6.ledger & f:s6.bottle', dot: dot('Broken glass') },
      { id: 's6.dughole', kit: 'bootCrate', at: PIT, opts: { dug: true }, show: 'f:s6.dug & !f:s6.moss', dot: dot('Somebody dug here') },
    ],
    verbs: [
      { prop: 's6.slump', verb: 'Clear the moss', when: 'f:s6.know & !f:s6.dug', then: ['f:s6.moss'] },
      ...PLANKS.map((i) => ({ prop: `s6.plank.${i}`, verb: 'Pull', when: 'true', then: [`f:s6.plank.${i}`] })),
      { prop: 's6.crate', verb: 'Take', when: 'f:ep.S6.done | (f:s6.plank.1 & f:s6.plank.2 & f:s6.plank.4 & f:s6.plank.5)', then: ['f:s6.ledger', 'give:page.ledger1928'] },
      { prop: 's6.crate.taken', verb: 'Take', when: 'true', then: ['f:s6.bottle', 'give:item.rye1928'] },
    ],
    triggers: [
      { on: 'readHere', nb: 'NB23', r: 220, when: 'f:nb.found', then: ['f:s6.here'] },
    ] },
  // 60 S6 "The carving": the flat rock at the water at the Beatty's low (Loon Lake) end of the foot trail (P357, 41 r)
  { id: 's6.beatty', name: 'The Beatty Portage, the Loon Lake end of the foot trail: N.N. 1928 cut in the rock (60 S6)', doc: '60 S6 "The carving"; 03 §5',
    portage: 's6.p357', end: [-80368, -20771], r: 25, ep: 'S6',
    props: [
      { id: 's6.carving', kit: 'carvedRock', at: [2.4, -1.2], wet: 'edge', show: 'true', dot: dot('Carved: N.N. 1928.') },
    ],
    verbs: [
      { prop: 's6.carving', verb: 'Look', when: '!f:s6.carving', then: ['f:s6.carving'] },
    ],
    triggers: [] },
];

PJ.places = [...PJ.places.filter((p) => !MINE.test(p.id)), ...places];
PJ.portages = [...PJ.portages.filter((p) => p.id !== 's6.p357'), { id: 's6.p357', v3: 'P357', rods: 41, name: 'Beatty Portage', doc: '60 S6 "At a glance": the old foot trail beside the rail-cart carry (P962)' }];
fs.writeFileSync(F, `${JSON.stringify(PJ, null, 2)}\n`);
console.log(`side7b-places: ${places.length} places written (${places.map((p) => p.id).join(', ')})`);
