// S9 · Coffee Lake (docs/story/60-side-stories.md S9; campaign-design Part 4 Round 2, the second slice's step 12). June's
// pot lies in 2 m of water 12 m off Alice's beach rock (s9.beach; check 10 in scripts/c2-episodes-data.mjs). Owner call
// 9: it starts on the hook-up at the beach rock, or on NB06 read there (the thing done at its place, 60 §0.2), never on
// the rumour, the kid or the entry read elsewhere. A bottom jig worked back over the sand snags the bail about half the
// passes (minigames/snag.js); the dead weight on the existing tension bar; it comes up by its bail into the hand: June's
// pot (uniques.js: two cups of coffee, nothing says so). It never ends without you; owner call 7: the pot is kept.
export default {
  id: 'S9', kind: 'side', title: 'Coffee Lake', slot: false, region: { eps: [25, 30] },
  window: { months: '5-11' }, // ice-out to freeze-up
  cast: [],
  doors: [
    { kind: 'rumour', line: 'S9.rumour' },                        // a keeper at 25 (and any with Alice in reach): starts nothing
    { kind: 'person', who: 'kid', line: 'S9.kid.1' },             // the family's kid at C1690: starts nothing
    { kind: 'entry', nb: 'NB06' },                               // read anywhere: a head start
    { kind: 'entry', nb: 'NB06', yes: true },                    // read at the beach rock (here:NB06): the yes
    { kind: 'place', yes: true, when: 'f:mg.snag.hooked' },      // the hook-up at the beach rock: the yes
  ],
  started: 'f:ep.S9.yes',
  places: ['s9.beach'],
  // the snag target (fishing.js's cast): within r of the pot a lure running on the bottom catches the bail `chance` of
  // the passes; a lure that runs high goes over it
  snag: { prop: 's9.pot', r: 1.0, chance: 0.5 },
  steps: [
    { when: 'f:mg.snag.landed', then: ['f:ep.S9.pot', 'give:item.junespot'] },
  ],
  ends: [{ id: 'pot', when: 'f:ep.S9.pot' }],
  page: [],
  titles: [{ when: 'read:NB06', title: 'Coffee Lake' }, { when: 'true', title: 'Alice Lake' }],
  first: 'S9.first',
  feeds: ['ink.coffeelake'],
  climax: null,
};
