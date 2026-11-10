// The cast (docs/build/campaign-design.md §5.1; stream T, Round 1: Tauno and Josie). A record is a look and a schedule,
// a pure function of (season, abs day, hour, facts): cast.js evaluates `where` in order and the first slot whose `when`
// holds is where the person is. Each arc stream adds its people here in its own marked block.
//
//   where: [{ id, at, when, push?, scene, bark?, fact? }]
//     at     'walkout' (the walkout { ep } event: the porch foot, or his truck in the lot where the store has no porch)
//            'porch:<ep>' | 'porch:home' (a seat on that porch, the bench; a store with no porch: the truck)
//            'counter:home' (beside the home counter, where the onboarding staffer stands)
//     when   a condition (story-cond.js) read with { ep, home } as args
//     push   a story-initiated stop: it passes beats.push (the push budget, §12) or the person is not there
//     scene  the entry node of the person's scene (story-data/porch-act1.js), 'auto' (where the story stands), or null
//     bark   the line said as you come near (once a staging)
//     fact   written as they are placed (a re-hook's once-ever: rehook.R3 …)
//     walk   the 1.1 porch: walking past is "[Keep walking]" (T1b at 12 m), then X1 (declined) at 26 m
// Node only (no game imports): story-lint.mjs and the unit check read it.
export const CAST = {
  tauno: {
    name: 'Tauno Kangas', first: 'Tauno', known: 'knows.tauno', unknown: 'An old man', role: '',
    // 81, a seed-company cap, a canvas chore coat (npcs.js dress: shirt, pants, hat; grey hair)
    look: { age: 'old', shirt: 0x6b5236, pants: 0x3a3a34, hat: 0x7a6a3a, hair: 0x8a8580, hatChance: 1 },
    noPorch: 'truck',
    where: [
      { id: 'porch', at: 'walkout', when: 'f:tauno.armed & !f:tauno.porch.declined1 & !f:tauno.porch.done & daylight', push: 'tauno.porch', scene: 'T1', bark: '20:T1.1', walk: true },
      { id: 'R3', at: 'walkout', when: 'f:tauno.porch.declined1 & !f:tauno.porch.declined2 & !f:tauno.porch.done & !f:rehook.R3 & trips.since(tauno.porch.declined1)>=1 & daylight', push: 'R3', scene: 'R3', bark: '20:9.2#R3.0', fact: 'rehook.R3', walk: true },
      { id: 'R4', at: 'walkout', when: 'f:door.crews.taken & !f:rehook.R4 & !f:tauno.turn & trips.since(door.crews.taken)>=3 & home & daylight', push: 'R4', scene: 'R4', bark: '20:9.2#R4.0', fact: 'rehook.R4' },
      { id: 'R5', at: 'walkout', when: 'f:door.crews.declined & !f:door.crews.taken & !f:rehook.R5 & trips.since(door.crews.declined)>=3 & home & daylight', push: 'R5', scene: 'R5', bark: '20:9.2#R5.0', fact: 'rehook.R5' },
      { id: 'R7', at: 'walkout', when: 'any(year.turned.*) & f:nb.found & !f:rehook.R7 & !f:tauno.turn & daylight', push: 'R7', scene: 'R7', bark: '20:9.2#R7.0', fact: 'rehook.R7' },
      // 12.1: in May and after October he keeps no schedule; the turn plays at the first walk-out of Farm by daylight
      { id: 'offseason', at: 'walkout', when: 'f:tauno.porch.done & f:crews.seen & !f:tauno.turn & !month:5-10 & ep:31 & daylight', scene: 'auto' },
      // after two declines: only Farm's porch, mornings (a pull, not a push: the player walks to it)
      { id: 'changed', at: 'porch:31', when: 'f:tauno.porch.declined2 & !f:tauno.porch.done & month:5-10 & hour:7-10', scene: 'changed', bark: '20:9.2#R3.2' },
      { id: 'farm', at: 'porch:31', when: 'f:tauno.porch.done & month:5-10 & hour:7-10 & !end:M', scene: 'auto' },
      { id: 'home', at: 'porch:home', when: 'f:tauno.porch.done & f:crews.seen & month:5-10 & hour:7-10 & dayhash(tauno,5)=0 & !end:M', scene: 'auto' },
    ],
  },
  josie: {
    name: 'Josie Hautala', first: 'Josie', known: null, role: 'the summer help',
    look: { age: 'young', shirt: 0x5f7f45, hat: null },
    where: [
      // R1 (once) and R1b (once more, two trips on), then only if asked: "That old pack still in back?"
      { id: 'R1', at: 'counter:home', when: 'f:bundle.shelf & !f:bundle.later & !f:rehook.R1 & trips.since(bundle.shelf)>=1', push: 'R1', scene: 'R1', bark: '20:9.2#R1.0', fact: 'rehook.R1' },
      { id: 'R1b', at: 'counter:home', when: 'f:bundle.shelf & !f:bundle.later & f:rehook.R1 & !f:rehook.R1b & trips.since(rehook.R1)>=2', push: 'R1b', scene: 'R1b', bark: '20:9.2#R1b.0', fact: 'rehook.R1b' },
      { id: 'counter', at: 'counter:home', when: '', scene: null },
    ],
  },
};
