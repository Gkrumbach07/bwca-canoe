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
      // walked off after T3 ("That's enough for today."): once, a trip on, at a daylight walk-out, he picks up at the hub
      // (20 §6.2: what's been said stays; §6.5 "Where was I.")
      { id: 'again', at: 'walkout', when: 'f:tauno.porch.done & !f:tauno.said.t5 & !f:door.crews.declined & !f:rehook.again & trips.since(tauno.porch.done)>=1 & daylight', push: 'again', scene: 'T4', bark: '20:6.5.2', fact: 'rehook.again' },
      { id: 'R3', at: 'walkout', when: 'f:tauno.porch.declined1 & !f:tauno.porch.declined2 & !f:tauno.porch.done & !f:rehook.R3 & trips.since(tauno.porch.declined1)>=1 & daylight', push: 'R3', scene: 'R3', bark: '20:9.2#R3.0', fact: 'rehook.R3', walk: true },
      { id: 'R4', at: 'walkout', when: 'f:door.crews.taken & !f:rehook.R4 & !f:tauno.turn & trips.since(door.crews.taken)>=3 & home & daylight', push: 'R4', scene: 'R4', bark: '20:9.2#R4.0', fact: 'rehook.R4' },
      { id: 'R5', at: 'walkout', when: 'f:door.crews.declined & !f:door.crews.taken & !f:rehook.R5 & trips.since(door.crews.declined)>=3 & home & daylight', push: 'R5', scene: 'R5', bark: '20:9.2#R5.0', fact: 'rehook.R5' },
      { id: 'R7', at: 'walkout', when: 'any(year.turned.*) & f:nb.found & !f:rehook.R7 & !f:tauno.turn & daylight', push: 'R7', scene: 'R7', bark: '20:9.2#R7.0', fact: 'rehook.R7' },
      // 12.1: in May and after October he keeps no schedule; the turn plays at the first walk-out of Farm by daylight
      { id: 'offseason', at: 'walkout', when: 'f:tauno.porch.done & f:crews.seen & !f:tauno.turn & !month:5-10 & ep:31 & daylight', scene: 'auto' },
      // after two declines: only Farm's porch, mornings (a pull, not a push: the player walks to it)
      { id: 'changed', at: 'porch:31', when: 'f:tauno.porch.declined2 & !f:tauno.porch.done & month:5-10 & hour:7-10', scene: 'changed', bark: '20:9.2#R3.2' },
      // a2: after the turn, Farm's porch is the mining years' hub (story-data/mining.js FARM: the first Farm morning, the
      // topics, the Kettle test and the crew map, the clean book's ask): cast.js hands the scene to mining-cast.js
      { id: 'farmhub', at: 'porch:31', when: 'f:tauno.doors & month:5-10 & hour:7-10 & !end:M', scene: 'a2:farm' },
      // /a2
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
  // a2: the mining years' people at Farm (story Round 2; docs/story/30-mining-years.md §2, §7 "Schedules"; owner calls 3,
  // 4). Their `where` is read by mining-cast.js (not cast.js's walkout or seats): at 'a2:dock' (the end of Farm's dock),
  // 'a2:window' / 'a2:corner' (the café's tables inside Farm 31: props.js L.cafe), 'a2:store' (by the counter), 'field'
  // (kettle.js: the Kettle turnaround; mining-cast.js: the EP 33 lot). Their scenes are story-data/mining.js's.
  len: {
    name: 'Len Saari', first: 'Len', known: 'len.met', unknown: 'An old man', role: '',
    look: { age: 'old', shirt: 0x4a5f7a, pants: 0x3c3a36, hat: 0x2f3a4a, hair: 0x9a9690, hatChance: 0.7 },
    where: [
      { id: 'table', at: 'a2:corner', when: 'month:5-10 & dow:thu & hour:11-14', scene: 'a2:len' },
      { id: 'dock', at: 'a2:dock', when: 'month:5-10 & hour:7-12 & !dow:thu', scene: 'a2:len' },
    ],
  },
  mary: {
    name: 'Mary Pelto', first: 'Mary', known: 'mary.met', unknown: 'An old woman', role: '',
    look: { age: 'old', female: true, shirt: 0x8a6a8a, pants: 0x4a4038, hat: null, hair: 0xb8b4ae, hatChance: 0 },
    where: [{ id: 'window', at: 'a2:window', when: 'month:5-10 & dow:tue|fri & hour:9-11', scene: 'a2:mary' }],
  },
  brekke: {
    name: 'Carl Brekke', first: 'Carl', known: 'brekke.met', unknown: 'An old man in a good jacket', role: '',
    look: { age: 'old', shirt: 0x2e3440, pants: 0x2a2a2c, hat: null, hair: 0xd8d6d0, hatChance: 0 },
    where: [{ id: 'table', at: 'a2:corner', when: 'month:6-10 & dow:thu & hour:11-14', scene: 'a2:brekke' }],
  },
  tasha: {
    name: 'Tasha Strand', first: 'Tasha', known: 'tasha.met', unknown: 'A woman with a tablet', role: '',
    look: { age: 'young', female: true, shirt: 0x3f6f8f, pants: 0x3a3a34, hat: 0x7a5a3a, hair: 0x5a3a2a, hatChance: 0.5 },
    where: [
      { id: 'kettle', at: 'field', when: 'f:kettle.notice & !f:kettle.done', scene: 'a2:tasha' },
      { id: 'store', at: 'a2:store', when: 'month:6-10 & dow:mon|tue|wed|thu|fri & hour:8-10 & f:kettle.done & days.since(kettle.done)>=1 & dayhash(tasha,3)=0', scene: 'a2:tasha' },
    ],
  },
  // /a2
  // b5: begin (Round 5, the boys; docs/story/32-the-boys.md §3, §11 "People and schedules"). Their `where` is read by
  // boys-cast.js (not cast.js's walkout or seats): at 'b5:counter' (the Sawbill 38 counter's end), 'b5:window' /
  // 'b5:corner' (the two tables by the counter: story-props.js cafeSpots), 'b5:urn' (Farm 31's coffee urn), 'b5:yard'
  // (the Sawbill store's yard, 1–7 August), 'field' (the party's camp and the water: boys-cast.js). Scenes: story-data/boys.js
  carol: {
    name: 'Carol Arola', first: 'Carol', known: 'door.boys.open', unknown: 'A woman at the counter', role: '',
    look: { age: 'old', female: true, shirt: 0x8a5a4a, pants: 0x3e3a36, hat: null, hair: 0xc8c2ba, hatChance: 0 },
    where: [
      { id: 'evening', at: 'b5:counter', when: 'f:carol.slides.invited & date:05-15..10-15 & hour:15-21', scene: 'b5:slides' },
      { id: 'counter', at: 'b5:counter', when: 'date:05-15..10-15 & hour:7-15', scene: 'b5:carol' },
    ],
  },
  bob: {
    name: 'Bob Tervo', first: 'Bob', known: 'bob.met', unknown: 'An old man with a clipboard', role: '',
    look: { age: 'old', shirt: 0x5a6a4a, pants: 0x4a4438, hat: 0x6a5a3a, hair: 0xb0aca6, hatChance: 0.8 },
    where: [
      { id: 'out15', at: 'b5:window', when: 'date:08-15..08-15 & hour:15-18', scene: 'b5:bob' },
      { id: 'yard', at: 'b5:yard', when: 'date:08-01..08-07 & hour:9-18', scene: 'b5:yard' },
      { id: 'store', at: 'b5:window', when: 'month:6-10 & dow:tue|sat & hour:9-14 & !date:08-01..08-15', scene: 'b5:bob' },
    ],
  },
  frank: {
    name: 'Frank Kosir', first: 'Frank', known: 'frank.met', unknown: 'A man in a grey work shirt', role: '',
    // a grey work shirt with the new sign's patch on the pocket, a key ring on his belt (32 §5.7)
    look: { age: 'old', shirt: 0x6e7072, pants: 0x34363a, hat: 0x2e3238, hair: 0x9a948c, hatChance: 0.5 },
    where: [
      { id: 'out15', at: 'b5:window', when: 'date:08-15..08-15 & hour:15-18', scene: 'b5:frank' },
      { id: 'yard', at: 'b5:yard', when: 'date:08-01..08-07 & hour:9-18', scene: 'b5:yard' },
      { id: 'farm', at: 'b5:urn', when: 'month:6-10 & dow:mon|tue|wed|thu|fri & hour:6-7 & !date:08-01..08-15', scene: 'b5:frank' },
      { id: 'tuesday', at: 'b5:window', when: 'month:6-10 & dow:tue & hour:9-14 & met:frank>=2 & !date:08-01..08-15', scene: 'b5:bob' },
    ],
  },
  denny: {
    name: 'Dennis Rask', first: 'Denny', known: 'denny.met', unknown: 'A friendly old man', role: '',
    look: { age: 'old', shirt: 0x7a8aa0, pants: 0x4a4a50, hat: 0x8a2a2a, hair: 0xd0ccc4, hatChance: 0.6 },
    where: [
      { id: 'out15', at: 'b5:corner', when: 'date:08-15..08-15 & hour:15-18', scene: 'b5:denny' },
      { id: 'yard', at: 'b5:yard', when: 'date:08-01..08-07 & hour:9-18', scene: 'b5:yard' },
      { id: 'store', at: 'b5:corner', when: 'month:6-10 & hour:14-17 & !date:08-01..08-15', scene: 'b5:denny' },
    ],
  },
  // b5: end
};
