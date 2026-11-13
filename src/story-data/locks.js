// The clue funnel as data (docs/build/campaign-design.md §3.6): bible §5.2, row for row. Each key is gained (the fact
// key.L<n><X>, set the moment its `when` first holds, never taken back) and names its support (the persons, places,
// scenes, quests, windows and permits it depends on) for the solver. `independent: false` marks a confirming key the
// two-keys proof does not count. The lock order narrows the knowledge; it is not a gate in code. A gate always reads
// the whole lock (`lock:<n>` or `any(key.L<n>*)`), never one key.
//
// The `when`s name the facts their producers will write; the streams that build those producers (talk, layer, pencil,
// episodes) own the facts, and the lint checks every one has a producer from the Round 1 join on.
//
//   { id, name, solved?: fact (lock 2: the far end inked; else any key held), keys: [{ id, kind, when, support, independent? }] }

export const LOCKS = [
  { id: 'L1', name: 'region', keys: [
    // a2: the crew map gives L1A in full (30 §4.5 "Gives"); Tauno's telling of Two Stump and V.'s water is L1B (30 §4.1:
    // Round 1's Farm seat writes knows.twostump and knows.vwater, inked or not)
    { id: 'L1A', kind: 'people', when: 'f:tauno.drilled | f:len.westpads.rings | f:door.mining.yield', support: { person: ['tauno', 'len'] } },
    { id: 'L1B', kind: 'notebook', when: 'f:ink.twostump | f:ink.vwater | f:knows.brm14 | f:knows.twostump | f:knows.vwater', support: { person: ['tauno', 'hap'] } },
    // /a2
    { id: 'L1C', kind: 'world', when: 'f:crews.seen | f:westpads.seen', support: { place: ['crews.landing', 'westpads'] } },
    { id: 'L1D', kind: 'journalist', when: 'f:maggie.kettlemap | f:maggie.ostrander', support: { person: ['maggie'] } } ] },
  { id: 'L2', name: 'lake', solved: 'ink.farend', keys: [
    { id: 'L2A', kind: 'people', when: 'f:hap.farend | f:mary.farend', support: { person: ['hap', 'mary'] } },
    { id: 'L2B', kind: 'notebook', when: 'f:bc.205-50', support: { place: ['P255', 'P256'] } },
    // a2: the wrong hill counts with the crew map (or Maggie's E-7 copy) and NB70 both (30 §4.7 "With both"):
    // rules-mining.js writes pietro.wronghill; pietro.dig.seen alone is the Look (tier 4 reads it)
    { id: 'L2C', kind: 'world', when: 'f:pietro.wronghill', support: { place: ['pietro.dig'] } },
    // /a2
    { id: 'L2D', kind: 'side', when: 'f:ep.S5.chart', support: { quest: ['S5'], window: ['S5'] } },
    { id: 'L2E', kind: 'informant', when: 'f:denny.revealed', support: { person: ['denny'], scene: ['32:reveal'] } } ] },
  { id: 'L3', name: 'shore', keys: [
    { id: 'L3A', kind: 'people', when: 'f:bob.eastbay | f:frank.eastbay', support: { person: ['bob', 'frank'] } },
    { id: 'L3B', kind: 'photo', when: 'f:gene.slide.matched', support: { person: ['carol'], place: ['gull.eastbay'] }, independent: false },
    { id: 'L3C', kind: 'notebook', when: 'f:nb.burntpoint', support: { place: ['gull.burntpoint'] } },
    { id: 'L3D', kind: 'side', when: 'f:ep.S5.chart', support: { quest: ['S5'], window: ['S5'] } } ] },
  { id: 'L4', name: 'landing sign', keys: [
    { id: 'L4A', kind: 'people', when: 'f:aili.stone', support: { person: ['aili'] } },
    { id: 'L4B', kind: 'pattern', when: 'f:knows.stones', support: { place: ['walt.sites'] } },
    { id: 'L4C', kind: 'season', when: 'f:gull.stump.lowwater', support: { place: ['gull.stump'], window: ['lowwater'] } },
    { id: 'L4D', kind: 'cards', when: 'f:cards.stone', support: { person: ['liisa'] } },
    { id: 'L4E', kind: 'notebook', when: 'f:nb.paddlestash', support: { place: ['gull.paddlestash'] } } ] },
  { id: 'L5', name: 'the way', keys: [
    { id: 'L5A', kind: 'notebook', when: 'f:nb.longway', support: {} },
    { id: 'L5B', kind: 'reading', when: 'f:tauno.blazes | f:ep.S8.done', support: { person: ['tauno'], quest: ['S8'] } },
    { id: 'L5C', kind: 'world', when: 'f:ev.blazes', support: { place: ['pond4747.eastbank'] } } ] },
  { id: 'L6', name: 'the cellar', keys: [
    { id: 'L6A', kind: 'camp', when: 'f:nb.torn', support: { place: ['waltcamp'] } },
    { id: 'L6B', kind: 'crew map', when: 'f:tauno.e7sketch | f:maggie.e7sketch', support: { person: ['tauno', 'maggie'] } },
    { id: 'L6C', kind: 'reading', when: 'f:tauno.pit | f:ep.S6.done', support: { person: ['tauno'], quest: ['S6'] } } ] },
];

export const lockById = (id) => LOCKS.find((l) => l.id === id || l.id === `L${id}`) || null;
// a rule per key: the key is a fact the moment its `when` first holds (story-rules.js takes these with the others)
export const lockRules = () => LOCKS.flatMap((l) => l.keys.map((k) => ({ id: `lock.${k.id}`, when: k.when, then: [`f:key.${k.id}`], src: 'locks' })));
