# Open trips and outfitter hubs

The second pass of the game loop, after the [trip core](trip-core.md). It turns the strict permit into open trips and
every entry point's outfitter into a hub: food and gear to buy, a board of paid notices, keepers and visitors to talk
to. The owner's own words are in [game-vision.md](game-vision.md); where this plan and they differ, they win.

It is built in four phases. Phase 1 is on main; phase 2 is joined on `claude/hubs-2`; phases 3 and 4 are planned.

## The owner's decisions (2026-10-23)

1. **Money.** Plain dollars in small numbers: $40 to start, $6 for a day of food, notices pay $8 to $60, the Kevlar
   canoe is $240.
2. **Outfitters you know.** At first only the one you start at (home). Another becomes known when you paddle to its
   landing. Each counter also sells a paid ride up the road to the nearest one you don't know, since about half the
   entry points are not joined by water.
3. **Camping in Adventure.** Designated campsites only: no fire rings and no bivouac off a site ("that's not allowed,
   so not even camp"). Sandbox can still camp anywhere, since it has no rules.
4. **Maps.** Lakes always show. Campsites, portage rods and depths show only on the map sheets you own, or within
   1 km of where you have been.
5. **Evacuation.** No fee. You keep your notices, and lose the stringer and the rest of the day.
6. **The camera.** A $25 item of its own; the first photo notice lends you a disposable (phase 3).
7. **The pace** (later the same day, replacing the trip core's "about 5 km a day"): "id like the distance i can
   travel in a real day in bwca to be equal to the game just make the game faster. so you paddle faster. unless you
   set to real mode. but obv you would want to slow down for certain parts like walking around, fishing". A game hour
   of travel covers what an hour does in life (4 km paddled, 3 km carried), time-lapsed ×6 on the water and up to ×3
   on a trail at Trip pace (Real: 1:1); camp, fishing and walking about at life on a 12× clock. A travel day is 20 to
   25 km. See "The pace" below and [trip-core.md](trip-core.md).

So the plan's off-site fire ring chore is dropped.

## The loop

**A first session.** New season → Adventure → an entry point (home). You start tied up at the home store's dock,
standing at its door; step in and the keeper hands you $40 and points at the board. At the counter you buy three days
of food ($18) and perhaps the map sheet of home ($8); at the cork board you take "a smallmouth for the café"; you walk
out and launch, and that pushes the trip off. You fish, bring the fish back in the notice's cooler and claim it, camp
and sleep. A bent-shaft paddle is a few days of notices off, the second pack a few more, the Kevlar about two weeks.

**Later.** The Kevlar and a better paddle, notices on the go from two outfitters, a week out fishing and picking
berries, a resupply at whichever outfitter is near, and the long paddle back to the one that posted the moose photo.

**What pulls you to a new entry point** (phases 2 and 3): each outfitter's signature item, "far" notices that point at
other water, the keepers' hints, map sheets sold only in their own area, and "outfitters known, n of 55" in the
logbook.

## Open trips (phase 1)

- **The permit** is the season's paper: its number, home and the day it was stamped at the first counter. There are no
  nights, no "out by" and no exit place.
- **A trip** runs from push-off until you choose *Call it a trip* at any counter: it is logged as came in, and you get a
  bunk night and wake fully rested and fed at 7:00. *Resupply · carry on* keeps the trip going.
- **What limits you** is food (a Duluth pack holds 7 days), the single energy bar, the weather (a capsize), daylight
  (travel after dark costs ×1.3, and you want a site before dark) and weight.
- **Evacuation** comes when the bar has sat at 0 for an hour of the clock (the owner: "if it goes all the way down,
  you're done"); the hour is the chance to stop and eat, drink or rest. The same calm card, named for the need that
  ran you down, and you wake at 7:30 at the nearest outfitter you know. The stringer and the rest of the day are lost; the notices, the money and
  the gear are kept.
- **Saves.** The `profile` save holds the money, the gear owned, the outfitters known and your standing with each.
  Older saves migrate: the Kevlar and the lure unlocks become owned items, money is $10 a task turned in (never less
  than $40), the landings seen become known outfitters, and an active permit loses its dates.

## Outfitters as hubs (phase 2)

**55 outfitters, each its own.** About six are hand-written (30, 25, 38, 54, 55, 14). The rest come from
`profileFor(ep, world)`, seeded by the entry point and read from the place: the landing lake (river or lake, its size
and depth), deep lakes within 12 km, campsites within 10 km, the nearest other entry point and how remote it is.

- **A kind:** a lodge (a big, busy lake), a river post, a trout camp, or a bait shop (remote).
- **Stock and prices:** ×0.9 to ×1.25 by remoteness, and one signature item.
- **What the board leans to:** trout orders at a trout camp; café fish and photos at a lodge; surveys and lost items
  at a river post; berries and firewood at a bait shop.
- **The keeper:** a name, a manner, lines and hints filled from the data. Signs keep the real business names; the
  keepers are fictional.
- **The building's look:** stain, roof, porch.

**Rides.** From any counter, to outfitters you know (and the paid ride up the road to the nearest unknown one). Road km
is about 1.4 × the straight line; the time is 0.5 h + km/40; the price $5 + $0.50 a km, rounded to $5. The canoe and
the packs come too, and after 21:00 there is a bunk night and you arrive at 7:30. No rides from the wild. In Sandbox
rides are free and instant and the map pin goes anywhere.

**The walk-in store.** About 8 × 6 m, board and batten, the door on the lake side up a stoop from the dock. Inside: a
plank floor, the counter with the keeper behind it, three shelf units (food, tackle, gear), the cork board by the door,
a pegboard lure wall, a canoe on the rafters, a woodstove and windows. It is built from the existing prop pieces with
baked occlusion, lit by the sun through the windows and a warm lamp pool that shares the campfire's light (the light
count never changes). At the dock E is *Tie up and go in*; Q still opens the counter straight from the dock. Inside
the view is first person, and E at the counter, the board, the shelves or the lure wall opens the paper counter at that
tab. The board is a texture drawn from the live notices.

**Map sheets.** 39 Fisher sheets, F-1 to F-39, about 20 × 17 km each and named for their lakes (Lake One's is
F-24 · Lake One · Snowbank · Moose). Each outfitter sells its own sheet and its neighbours' at $8. In Adventure the map
draws campsites, portage rods and soundings only on the sheets you own and in a soft corridor about a kilometre either
side of where you have been (250 m cells; each known outfitter adds 2 km of home water); lakes and their names always
show, and Sandbox shows everything. The words follow the map: the dusk word names only a campsite your map shows, and
a click on the map counts the portages only when every one on the way is on your map.

## The economy

| Item | $ | What it does |
|---|---|---|
| A day of food (2 meals, 0.9 kg) | 6 | +1 day |
| Freeze-dried supper | 5 | a hot meal without a fire |
| Leeches, a dozen | 4 | bait for the bobber rig |
| Jig & twister / Mepps / Daredevle / Jointed Rapala | 3 / 6 / 7 / 12 | lures |
| Silver Minnow (weedless) / Lazy Ike | 8 / 9 | new: pike in the weeds / walleye trolled |
| Medium-heavy rod | 45 | lines snap less (×1.4) |
| Bent-shaft laminate paddle | 40 | cruise +5 %, effort ×0.95 |
| Carbon bent-shaft paddle | 110 | cruise +9 %, effort ×0.9 |
| Royalex Prospector 16′ | 160 | 29 kg, much steadier (capsize ×1.3), cruise −3 % |
| Kevlar tripper 17′ | 240 | 20 kg, cruise +4 % |
| Second Duluth pack | 25 | room for 10 more days; the double portage |
| Food barrel and harness | 35 | 14 days, 3 kg |
| Portage yoke pads | 15 | carrying tires you less (×0.85) |
| Dome tent | 50 | sleep 1.0 |
| Four-season tent | 95 | sleep 1.0, and gear dries overnight |
| Sleeping pad | 30 | sleep +0.05; cold nights cost nothing |
| Purifying tablets / pump filter / gravity filter | 2 / 35 / 55 | the bottle drinkable in 30 min / 5 min / filled at camp on its own |
| Fisher map sheet | 8 | that sheet's campsites, rods and depths on the map |
| Folding saw | 18 | an armful of wood in 10 min instead of 25 |
| Camera (35 mm) | 25 | C to frame a photo |
| Bunk night | 8 | full rest and breakfast |

Phase 2 sells the lot, at each outfitter's prices (×0.9 to ×1.25) and 10 % less at standing 3, with each outfitter's
signature item ("made here · sold only at this counter"); Sandbox's shelves are free. Buying a canoe, a paddle, a tent
or a filter puts it in use, and the kit can swap back. A snapped line loses that lure (never the last jig): a small,
fair reason to spend. What the gear does, measured with the wind stilled on Lake One: the cruise at life pace (the
game's clock follows it, so this is the km a game hour; at Trip pace the canoe is seen six times as fast) and, in
brackets, what the phase 2 join measured before the pace:

| Kit | Cruise at life | Paddle effort | On the portages |
|---|---|---|---|
| Aluminium + ash (the start) | 1.10 m/s, 3.97 km/h (2.29 m/s) | 1 | 34 kg |
| Aluminium + bent-shaft | 4.17 km/h, +5 % (2.41 m/s) | −5 % | 34 kg |
| Kevlar + bent-shaft | 4.34 km/h, +9 % (2.51 m/s) | −5 % | 20 kg (the canoe and a pack: 36 kg) |
| Kevlar + carbon (stream B) | 4.51 km/h (2.60 m/s) | −10 % | 20 kg |
| Royalex (stream B) | 3.85 km/h (2.22 m/s) | 1 | 29 kg; held 30 s broadside in a 0.42 m sea where the others went over at 15 s |

**The pace** (2026-10-23; it replaces "about 5 km a day", see [trip-core.md](trip-core.md)): the owner asked that "the
distance i can travel in a real day in bwca" be the game's, by making the game faster, "unless you set to real mode",
with the slow parts (walking around, fishing) kept slow. So a game hour of paddling is 4 km with the starting kit and
4.5 with the Kevlar and the carbon blade, and a travel day of 6 to 8 game hours with a few portages is 20 to 25 km
(measured: 23–24 km in 6.5 game hours, four portages). At Trip pace that hour is about ten real minutes on the water;
at Real pace an hour. The same evening the owner found life too slow on screen ("you say its 4.8 but it feels like
2.4"; the 2× key "feels more correct") and the slow-down near a shore unwelcome: so nothing that travels is shown below
twice life at Trip pace (the clock in step), the boost no longer fades along a shore or at a landing (only in the last
few metres before a bank dead ahead), and the frame loop now runs a slow frame as several steps, since a 50 ms cap had
put the game in slow motion below 20 fps (Ultra on the owner's 3440 x 1440 screen measured about 18). At 60 fps the
owner still found Real pace slow ("the x2 feels more like the 1:1 should be"), so Real pace has the same twice-life
base (no time-lapse above it). Gear still buys game time: the Kevlar and the carbon shorten a 24 km day by about 40 minutes. The
second Duluth pack takes the food room from 7 days to 17 and brings back the double portage (the gear pack waits at
the trail head; Q fetches it, about 5 minutes on a 23-rod carry, the walks' own time at life).

**The board.** Four notices per outfitter (two close by, one a day trip out, one far). One changes each game day, and
nothing taken on expires. A notice is paid only at the outfitter that posted it.

| Notice | Checked by | Pays |
|---|---|---|
| Fish for the café (any, a species, a size) | the catch, kept in the notice's cooler | any $8; a species $12–18; +$10 for the size; lake trout $30 + $1 a km to its lake (up to $60) |
| Photo of a bird / beaver / moose / a place | the camera: the subject near the centre, close enough, not hidden by the land | $10 / $15 / $35 / $12 |
| Lost item at a place | E at the item | $15 + $5 a portage + $1.50 a km out (up to $60) |
| Fetch from another outfitter | arriving at that dock | $15 + $1 a km, up to $50 |
| Survey a portage | reaching its far landing | $10 + rods/25 + $2 a km out (up to $60) |
| Berries or firewood | counted at the claim | $10 a pint, $6 an armful |

The km is the straight line from the landing to the notice's spot. It came in the phase 2 join, when a canoe made 4 to
5 km a game day and a survey 8 km out had paid $12 for three or four days and $18–24 of food ($4, $5 and $2 a km
then: the boards averaged $16 local, $29 medium and $45 far, from $13, $18 and $26). At the pace 8 km out is half a
day there and back and $3 of food, so the km pay is cut to about a third: over 144 notices from 24 boards they now
average $16 local, $25 medium and $40 far (medians 3, 5.5 and 12 km out). The medium band reads "a day trip" on the
board. Local fish are as they were.

**Talk and standing.** Standing (0 to 5) rises with each claim (+0.25), and a little with the first chat of the day
(phase 3). At 2 the keeper shares insider hints: one a day across the counter (they turn with the date), and now and
then as the hello. A hint you are told is kept for the season and pencilled on the map as a ring round the water it
means, labelled in the pencil hand ("walleye at dusk", "lakers, deep"), with *a keeper's word* in the legend. At 3
prices drop 10 %. Hints come from the data: walleye on a stained lake's drop-off at dusk, trout down deep, pike in weedy
bays, moose in sheltered bays at dawn. The keepers' lines keep to the hour: no "Morning!" after noon.

## Camp chores and the single bar

**One bar, pulled down by three needs** (phase 1):
- **Rest:** last night's sleep (the tent's quality × hours slept / 7), falling the longer you are awake. Only sleep
  brings it back.
- **Food:** falls over 24 game hours awake. The dawn and dusk meals stay automatic: cold +0.5, hot +0.6, a fish +0.6.
- **Water:** a 2 L bottle you drink from on your own. A litre lasts 6 h, or 4 h paddling hard, carrying 30 kg or more,
  or on a July or August afternoon; the need only falls once the bottle is dry.

The bar recovers only up to the lowest of rest, 0.4 + 0.6 × food and 0.4 + 0.6 × water; a need below 0.3 makes it drain
1.5× and shows its mark (*tired*, *hungry* or *thirsty*); a need at 0 stops its recovery. The readout says what holds
the bar down: "Energy 64 % · held down by thirst".

**Chores** (phase 3; pitching, the fire, cooking, sleep and filling the bottle are already in): gather firewood at a
tree (25 min an armful, 10 with the saw, up to 3 carried), light the fire with an armful and feed it, refill the bottle
by filter, use the latrine (rest +0.05), pick berries in season (3 pints a site a day), and sleep with a chosen wake
time (first light, 7:00 or 9:00).

## People (phase 3)

The keeper at every outfitter, and 0 to 2 visitors a week from about twelve kinds (a guide, a ranger, a photographer,
a family, an old-timer, a portage crew, a birder, the café cook, the mail carrier, a pair of trippers), each in their
months. E once gives a line; a second E offers their one task; once it is done they thank you. Figures reuse the
paddler's model and material, posed standing and turning to look at you. Hooks for later: a party with a route, leaving
dates and nights, that claims campsites, and a "Join us" stub.

## The build

Each phase runs as three parallel streams, joined and played through before it goes to main.

| Phase | A | B | C |
|---|---|---|---|
| 1 | Open trips: the profile, money, no dates, evacuate to the nearest known outfitter, save migration | The needs: one bar from rest, food and water; the readout and the mark | The task core: claims only where posted, money, the cooler, fishing reports catches |
| 2 | The walk-in store building | Walk-in prompts and the shop; gear effects | Unique outfitters from the data; rides |
| 3 | Camp chores | The camera and photo notices | People in the outfitters |
| 4 | Balance: a season played on autopilot, ten game days without an evacuation; docs | | |

## What phase 1 delivered

- **The season** (`src/profile.js`): New season → Adventure or Sandbox → home on the title; $40 and the starting kit
  (an aluminium canoe, an ash paddle, one Duluth pack, an A-frame tent, water tablets, a jig, a Mepps and a dozen
  leeches); money, gear owned, outfitters known, standing; Continue shows the money. Old saves migrate.
- **Open trips** (`src/trip.js` v3, `src/outfitter.js`): the season's permit; food at $6 a day up to what the packs
  hold; *Resupply · carry on* and *Call it a trip* (the bunk night) at any counter; an outfitter becomes known at its
  landing; the evacuation to the nearest known outfitter.
- **The single bar** (`src/energy.js`, `src/camp.js`, `src/hud.js`): rest, food and water; the 2 L bottle filled at the
  water's edge (E, tablets: drinkable in half an hour) or free at any counter; sleep by the tent's quality and the
  hours slept; no camping off a designated site in Adventure.
- **The board** (`src/tasks.js`): a registry of kinds (fish for the café, a lost item, a portage to survey), four pins
  per outfitter, a kept fish that fits a notice going into its cooler, claims paid only where posted (through
  `profile.earn`, standing +0.25), and the journal's Tasks tab with the season's earnings.

**The join** played a season headlessly through the real keys (Lake One out to Farm Lake and back) and fixed what
broke: the trip's document is saved when the page goes away (a bottle filled before a reload came back dry), the
stringer is saved, a canoe set down at a trail end launches from there, supper is eaten before an early bedtime, a
late night sleeps in and a paddler done in by day can sleep, a bar held at 0 by tiredness no longer eats the pack, the
evacuation names the need that ran you down, a claim tried at the wrong counter gets the keeper's answer, the
catch's prompt names the notice a fish would go to, the cooler's note clears the catch card, every "turn it in at any
outfitter" is gone, and the journal's Gear tab lists the season's kit.

How it plays, what it costs and what was found in the joined playthrough is in [trip-core.md](trip-core.md).

## What phase 2 delivered

Four streams joined on `claude/hubs-2`:

- **The store building** (A, `src/props.js`, `src/fire.js`): an 8 × 6 m store at every entry point landing, in its
  own cleared yard on the flattest dry spot behind or beside the dock (on fieldstone with railed porch posts on a steep
  bank), coloured by the outfitter's `look`; `props.storeLayout(ep)` and `onStore`; the lamp borrows the campfires' one
  light (`Fires.steady`), and after sunset the glass goes so the store glows through its windows.
- **Walking in and the shop** (B, `src/shop.js`, `src/outfitter.js`): *Tie up and go in*, first person inside, the
  hotspots, the counter in four tabs (the counter, the board, the shelves, the lure wall), the full catalogue,
  `player.gear` read in one line each by the paddle, the energy, the packs, the camp and the rod; the tackle box (a
  lure not in it is refused), the freeze-dried supper, the leeches, the gravity bag.
- **55 outfitters and the rides** (C, `src/outfitters.js`, `src/rides.js`): 13 lodges, 15 river posts, 16 trout camps
  and 11 bait shops, six written by hand (30 Ruth Aho, 25 Gus Lindgren, 38 Bev Kangas, 54 Arvid Strand, 55 Lise
  Thibodeau, 14 Leon Zupancic); the keepers' lines and hints, the board's lean, the signature items; rides to the
  outfitters you know and up the road to the nearest one you don't.
- **Map sheets** (D, `src/sheets.js`, `src/hud.js`): the 39 sheets, the corridor of where you have been, the owned
  sheets' neatlines, "in your map case" in the header.

**The join** played a season of 16 game days from Lake One through the real keys and buttons (New season, the dock,
the door, every hotspot, the shelves, the board, the cooler, a lost item, a survey, campsites, two evacuations, both
rides from inside a store, the bent-shaft and the second pack bought, the double portage, reloads at camp and on the
store floor). Its fixes:

- A new season begins tied up at the home store's door, and the keeper's forty dollars come as you step in; the trip
  pushes off when you launch (before, the counter opened from the water and leaving it pushed the trip off with no
  food, so the walk-in came after the trip had begun).
- A page reloaded inside a store comes back on its floor, in first person, the canoe tied at the dock (before: afloat,
  and still in first person).
- The map leaks: the dusk word and the map click's portage count follow what your map shows. The click's hours by the
  clock are the game's own (about 2.9 h a km in Adventure then; they had been about four times too short; at the pace
  they are a quarter hour a km, from the cruise at life).
- The keepers' insider hints are pencilled on the map; the keepers keep "Morning!" to the morning.
- A Royalex is a Royalex on the trip and in the readout (trip.js and packs.js knew only two canoes).
- The journal counts the lures in the tackle box (1–7 with the rod up); the headlamp's word waits until you step out of
  a store.
- Notices pay for the way out (above).

**Seen in the playthrough.**
- Programs (88) and lights (5) do not change going in or out; frames ran 4.8 ms inside and 5.0 ms at the door at
  1440×900 (stream A measured the store at +0.2 ms from the water, +0.4 ms inside). No console errors in 16 days.
- The pace is the trip core's: 2 to 4 km a game day with portages and wind stops, so a notice two portages in is two
  days there and back. The progression, played: the bent-shaft on day 5 and the second pack on day 14 (with two
  evacuations on the way back from Lake Two, the autopilot's slowness more than the game's). At the new pay a sensible
  player clears about $15–20 a day after food: the bent-shaft in about three days, the second pack in four or five, the
  Kevlar in about two weeks of game days. (All of this was before the pace, which makes a game day 20–25 km of travel
  and about an hour and a half of real time at 1×: the progression in game days wants replaying in phase 4.)

## What phases 3 and 4 will do

- **Phase 3.** The camp chores (A: firewood, the fire, the latrine, berries, the wake time, the saw), the camera and
  the photo notices (B: the $25 camera, a disposable lent for the first one, the journal's Photos tab), and people in
  the outfitters (C: the keeper standing behind the counter, visitors in their months, the first chat of the day for
  standing). Notes for it from the join: hulls could look like what they are (the Kevlar's gold, the Royalex's
  colour); a lit, sleeping keeper figure would make the counter less empty; the rides' late-night bunk is free.
- **Phase 4.** Balance across a season played on autopilot, ten game days without an evacuation, and the docs.
