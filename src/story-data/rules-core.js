// The core rules (K1a): night one, the stages' and tiers' own facts (docs/build/campaign-design.md §3.5, bible 6.2).
// Every effect a migrated or re-run save needs is a `when:` on the fact the event sets (night1 below), never only an
// `on:`: the quiet re-run after a migration or a data change cannot replay an event.
//
// A rule: { id, on?: event, when?: condition (story-cond.js), then: [action], after?: { days: [lo, hi] } | { hours },
//   repeat?: true (an on: rule that fires every time), push?: true (through beats.push, §12), fallback?: fact }
// Actions: f:key[=v] · ppl:who.field+n|-n|=v · walt:id · und:NB · lead:id=state · and, handed to the stream that owns
// them: ring: scene: line: give: pay: queue: emit:  ({a.b} in an action is filled from the event's data)

export const RULES_CORE = [
  // night one: the notebook is found (walt.js → story.found → 'notebook:found')
  { id: 'nbfound', on: 'notebook:found', then: ['f:nb.found'] },
  { id: 'night1', when: 'f:nb.found', then: ['walt:w.found', 'walt:w.cellar'] },
  // the watchers' tiers (bible 6.2). Tier 1 needs an "asked", never just a meeting (C3-12)
  { id: 'tier1', when: 'f:asked.boreal.2 | f:asked.eino.2 | f:asked.len.walt', then: ['f:tier.1'] },
  { id: 'tier2', when: 'tier>=1 & (f:crews.seen | f:westpads.seen | f:door.family.open)', then: ['f:tier.2'] },
  { id: 'tier3', when: 'f:midpoint', then: ['f:tier.3'] },
  { id: 'tier4', when: 'tier>=3 & (month:9-12 | f:denny.revealed | f:pietro.dig.seen)', then: ['f:tier.4'] },
  { id: 'tier5', when: 'f:run.lifted', then: ['f:tier.5'] },
];
