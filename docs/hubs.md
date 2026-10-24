# Open trips and outfitter hubs

The second pass of the game loop, after the [trip core](trip-core.md). It turns the strict permit into open trips and
every entry point's outfitter into a hub: food and gear to buy, a board of paid notices, keepers and visitors to talk
to. The owner's own words are in [game-vision.md](game-vision.md); where this plan and they differ, they win.

It is built in four phases. Phases 1 to 3 (and the pace) are on main; the owner's feedback of 2026-10-24 (below) is
joined on `claude/fb-1024`, with the camp redone after it; phase 4 is planned.

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
2.4"; "the x2 feels like 1:1"). The world's scale was right (true metres, a 1.78 m paddler, trees 12 to 22 m); two
numbers were not. The walker stepped about 1.6 times too often, so a 3 mph walk came out in 0.45 m steps and read as a
shuffle (canoe.js now steps as people do: about 110 a minute of 0.7 m at a walk, 166 of a metre at a jog), and the
canoe cruised at a dawdling 4 km an hour in 1.2 m strokes (now a tripper's 5.8, 60 strokes a minute of 1.6 m; Trip's
water time-lapse went from ×6 to ×4 to keep the canoe seen at about 6.3 m/s). A twice-life floor stood in for a day
(96b3c81, ce8a1e8) and is gone again, so Real is 1:1. Also: the boost no longer fades along a shore or at a landing
(only in the last few metres before a bank dead ahead), and the frame loop runs a slow frame as several steps, since a
50 ms cap had put the game in slow motion below 20 fps (Ultra on the owner's 3440 x 1440 screen measured about 18). Gear still buys game time: the Kevlar and the carbon shorten a 24 km day by about 40 minutes. The
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

**Chores** (phase 3, stream A: `src/chores.js`, run by the camp; each one E and its life length on the clock): gather
firewood near a tree (25 min an armful, 10 with the saw, up to 3 to hand, stacked by the ring as a woodpile and taken
along in the canoe), light the fire with an armful and feed it another (it burns down without: fire.js), use the
latrine (rest +0.05, once a day), and turn in from a small card that picks the wake time (first light,
7:00 or 9:00). A whole evening is eight keys (ashore, pitch, an armful, light, supper, the latrine, → at the tent, E).
The berries notice ("Blueberries for pies", $10 a pint, in season) and the firewood one ("Wood for the sauna", $6 an
armful) are registered from chores.js; what they want is handed over on foot at the posting store and claimed at its
counter. The details are in [trip-core.md](trip-core.md), "Camping and sleep". (The site's blueberry patch went in the
feedback pass of 2026-10-24: berries and mushrooms now grow anywhere in their season, `src/forage.js`, below.)

## People (phase 3)

The keeper at every outfitter, and 0 to 2 visitors a week from twelve kinds (a guide, a ranger, a photographer, a
family, an old-timer, a portage crew, a birder, the café cook, the mail carrier, a pair of trippers, a fishing guide, a
kid with a bucket of leeches), each in their months and hours (`src/npcs.js`). E once gives a line that names something
real (a lake and its fish, a site, a carry, the forecast); a second E takes on their one task, which is listed at the
counter as "Asked of you in person" and paid by them or that counter; once it is paid they thank you. At the counter Q
is a word with the keeper (the first of a day raises your standing there by 0.05), whoever else stands by. Figures reuse
the paddler's model and material, three at most, posed standing, leaning on the counter or sitting, and turning to look
at you. Hooks for later: a party with a route, leaving dates and nights, that claims campsites, and a "Join us" stub.

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

## What phase 3 delivered

Three streams joined on `claude/hubs-3`, on main with the pace (ce8a1e8):

- **Camp chores** (A, `src/chores.js`, `src/camp.js`, `src/fire.js`): firewood (an armful in 25 minutes, 10 with the
  saw, three at most, stacked by the ring as a woodpile and carried in the canoe when you push off), the fire fed and
  burning down (3 h an armful, 5 h at most; it dims over its last 1.6 h to embers), the latrine (rest +0.05 once a day),
  blueberries July 10 to August 20 on the burns and the lichen rock by a site (a pint in 20 minutes, three a site a
  day; replaced by forage.js on 2026-10-24), and the wake-time card at the tent (first light, 7:00 or 9:00; → or ←
  there opens it). The berries ($10 a pint) and firewood ($6 an armful) notices.
- **The camera and the photo notices** (B, `src/photo.js`, the journal's Photos tab, `fauna.subjects()`): C raises it
  (the $25 35 mm, or the disposable the season's first photo notice lends for three pictures); a 16:9 print of 240 × 135
  kept in IndexedDB (24 prints), a caption ("A cow moose, Lake Two, July 13, morning"); bird, loon, eagle, beaver, moose
  and place notices.
- **People in the outfitters** (C, `src/npcs.js`): above.

**The join** played three game days of a July season at Trip pace through the real keys and buttons, the numbers
logged at each step (the camera's moose was forced with `fauna.force`, the berries notice pinned in place of a far one
nobody took, and a visitor with a task cast in at Lake One, where the week's visitor had none):

| When | Where and what | $ | Energy · rest · food | Food | km |
|---|---|---|---|---|---|
| Day 1, 7:40 | New season at Lake One (30): Ruth's forty dollars as you step in, Q a word with her, the crew's hint, Finn's task (leeches for Grandpa, $8 and a dozen leeches), the loon photo (the disposable lent), the berries and a locket at Lake Two | 40 | 1.00 · 1.00 · 1.00 | 0 | 0 |
| 7:43 | Three days of food | 22 | | 3 | 0 |
| 7:58 | The loon, 46 m off, at 125 mm: the notice done | 22 | 0.99 · 1.00 · 1.00 | 3 | 0.4 |
| 9:56 | Two portages to Lake Two; the locket picked up at 9:58 | 22 | 0.88 · 0.95 · 0.91 | 3 | 7.7 |
| 10:40 | A site with a berry patch: the tent (15 min), the bottle (5 min); the afternoon waited out at camp (4×) | 22 | 0.85 · 0.93 · 0.88 | 3 | 9.5 |
| 17:38 | Two armfuls (25 min each), stacked; the fire (20 min) at 17:58; supper at 18:35 (30 min) | 22 | 0.72 · 0.68 · 1.00 | 2½ | 9.5 |
| 20:30–22:48 | The fire fed (3.5 h left), two more armfuls, three pints into the tin, the latrine, the bottle | 22 | 0.59 · 0.57 · 0.82 | 2½ | 9.5 |
| 22:50 | → at the tent: the card at 7:00, E | 22 | 0.59 · 0.57 · 0.82 | 2½ | 9.5 |
| Day 2, 7:01 | Up at seven (breakfast); the morning fire; a cow moose at 52 m in a bay, at 260 mm | 22 | 0.85 · 0.85 · 1.00 | 2 | 9.5 |
| 8:13 | Back over the portages; the leeches left at Grandpa's site on Lake One | 22 | 0.81 · 0.85 · 0.95 | 2 | 11.9 |
| 9:44 | Lake One's store: the berries handed over at the door, Claim all: $80 for four (loon $12, locket $30, berries $30, Finn's $8) | 102 | 0.72 · 0.82 · 0.89 | 2 | 16.8 |
| 10:27–11:12 | A ride to Snowbank Lake (27, $10), and from there to Moose Lake (25, $10): in at Gus Lindgren's door | 82 | 0.72 · 0.77 · 0.83 | 2 | 16.8 |
| 11:35 | Moose Lake: the beaver notice, two days of food; out to a site on Moose Lake | 70 | 0.72 · 0.76 · 0.81 | 4 | 16.8 |
| 21:50 | The evening's chores; on foot along the shore to a beaver lodge: the beaver, the disposable's last picture | 70 | 0.47 · 0.47 · 0.97 | 3½ | 18.9 |
| Day 3, 7:38 | Back in at Moose Lake: $15 for the beaver; then a 35 mm camera ($25) at Lake One | 85 → 60 | 0.82 · 0.85 · 0.97 | 3 | 21.0 |

**Its fixes:**

- **The camera zooms** (photo.js): the wheel (or Q and E held) turns a zoom ring from a 50 mm lens to a 300 mm one on
  35 mm film, the print cut across the frame's width; the field of view follows the focal length and the canvas's
  aspect, and the subject test reads the camera's own field of view, so the middle of the print narrows with the zoom.
  A moose at 40 m stood about 7 px high in the print at the old halved view; at 260 mm a cow at 52 m stands nearly half
  of it. The frame says the lens ("260 mm lens"), the mouse and the keys turn in step with how wide the view is, and the
  wheel is the camera's, not the chase camera's.
- **Life's pace for the camera** (pace.js `life`): main's Real pace keeps a floor of twice life now, so the camera's
  old 'real' still boosted; it holds a pace of its own (no time-lapse, no floor, the clock 1:1).
- **A visit belongs to the store** (outfitter.js `distTo`): three entry points' own spots lie far out on the lake
  (Moose Lake 143 m from its store, Sawbill 122 m, North Fowl 175 m; Seagull 57 m), and the visit, the dock's prompt and
  an arrival were measured from there: walking up to Moose Lake's store ended the visit at once, and "Tie up and go in"
  was offered 125 m out on the water. They are measured from the store and its dock once built. Played at 25, 38, 54
  and 70: the dock's prompt, the tie-up, first person, all six hotspots, the people, out to the dock and the launch.
- **A ride gets in at the door** (rides.js): it arrived afloat at the landing's spot with the counter open (at Moose
  Lake out on the lake); it now arrives as a season begins, tied up at the dock, standing at the door, and the keeper's
  word for the road (or a stranger's welcome) comes as you walk in.
- **A visitor's task reads as theirs** (tasks.js, journal.js): "Asked of you in person · Leeches for Grandpa · for
  Finn", apart from "Taken from other boards"; "Asked by Finn" in the journal; Claim all's stamp says what it pays
  (it said $72 and paid $80, a visitor's task included).
- **Q at the counter** (npcs.js): with a visitor at the counter's end, the keeper's Q went missing; at the counter Q is
  now always a word with the keeper, E the visitor you face or the counter. Greetings keep to the hour.
- **One E at a time**: firewood was offered at an outfitter's door and in its yard (and 25 minutes there filled the
  store's own firewood notice): not on a store's visit now. With the camera up at the tent, → to aim opened the wake
  card (and its E turned you in): the arrows are the camera's while it is up.
- **Blueberries that show**: clusters of four to seven berries a little bigger than life, sitting proud on the bushes,
  in a dusty blue (they were single 1.3 cm berries, often inside the leaves). The patch itself moved to forage.js on
  2026-10-24, with the other berries and the mushrooms.
- **The walker crouches** for the low chores (canoe.js `state.crouch`, set by camp.js): gathering, sawing, picking,
  laying, feeding and cooking on the fire, filling the bottle; the head comes down from 1.56 to 1.12 m.
- **No rain indoors** (weather.js `indoors`): the drops round the camera fell through the store's roof.
- **A portage trail that starts in the water** (player.js): the Kawishiwi River end of the Lake One carry shoulders the
  canoe 3.1 m out, past wading depth, and every step was "Too deep to wade"; a step that goes shallower always goes now.

**Checked and found sound:** the lost-item notices at Sawbill (38), Seagull (54) and Clearwater (62) come out every
time when you are at the landing (0 empty in 90 rolls at each; stream C's misses were rolled from Lake One, 50 km off,
where those lakes' cells are not loaded); the camera keeps the people quiet in a store (no focus, E and Q only zoom)
and the chores off at camp, at life's pace; reloads at camp (the fire lit, two armfuls stacked, the tent, the berries
picked that day), in a store with people, mid-portage and with a visitor's task taken come back whole; the program
count held at 96–97 through the store with people, the camp and the camera (91 to 97 over a session as new things come
into view), the lights at 5; frames at 1440 × 900 headless: 11.8–12.2 ms in a store with the keeper and a visitor
(the three figures cost under a millisecond), 14.7 ms on open water, 10.9 ms with the camera up; no console errors.

## Decisions in phase 3

- The camera's zoom is the same on the 35 mm and the disposable (a lent camera that could not reach a moose would make
  the first photo notice a chore); a real disposable has a fixed lens.
- A visit, the dock and an arrival belong to the store's layout, not the entry point's own spot.
- A ride arrives at the store's door, as a new season does.
- No firewood is gathered about an outfitter's store.

## The owner's feedback of 2026-10-24

After playing phase 3 the owner sent a long list; it is kept verbatim with the build brief of that day. The lines that
set the pass:

> "I dont like how the store is really just a modal still even tho we have the physical stuff. … i sorta like how
> witcher 3 did it. they had it as there is your inventory on left, and on right is the shelf/shop."

> "i also liek the escape from trakov inventory system. its like a grid and items take up bigger sections of the
> inventory."

> "when you are in the wild, you only see the ones when you either are next to, holding, or in the canoe with the
> container. otherwise if you leave the stuff behind then you cant see or use the things in your inventory. things like
> rod, leach bucket, all things you have to deal with for portages, annoying but makes it sorta fun"

> "consuming things is done from the inventory. some of them must be cooked first … no G to eat"

> "i should be able to climb up and over big rocks, or vault over down trees step over" · "need to be able to swim.
> once i cant wade, go into swim mode"

> "when the camera is behind something like a tree in 3rd person view, we need to move the camera forward until it ius
> out of the way. minecraft does this"

> "dialog in games is hard to use, it goes away fast, not sure who is saying it, its not in my cone of vision"

> "outfitters/entry points are in wrong spots" · "i know at some point you trimmed portages that dont connect, dont do
> that"

> "its hard to find blueberries, also add in more of the classic berreis you would see and where they would show up"

The thread through all of it: the physical world carries the game. What you own is a thing somewhere (in the canoe, on
your back, on the ground where you left it), a store is walked through shelf by shelf, people are heard where they
stand, and the woods are solid enough to climb.

### What changed

Seven streams, joined in this order on `claude/fb-1024` (main ff2593b):

- **One physical inventory** (A: `src/items.js`, `src/inventory.js`, `src/containers.js`, `src/packs.js`). Everything you
  own is an item in a container (Duluth packs #3 and #4, the blue barrels of 30 and 60 L, the leech bucket, the tackle
  box, your pockets, the stringer) or a long thing (the rod, the paddles). You reach what you carry, what lies or hangs
  within 3 m, the canoe you are in or beside, and at an outfitter everything (the stash). A portage carries the canoe
  overhead, a pack on the back and a thing in each hand; the rest waits at the trail head for the walk back or Q's
  fetch. No G and no meals on the clock in Adventure: a snack is eaten from the pack standing still, a meal or a fish
  is cooked first. Older saves become items.
- **The book and the store** (B: `src/inv-ui.js`, `journal.js`, `outfitter.js`, `shop.js`, `props.js`). J opens one
  book: the journal (catches, tasks, lakes, trips, photos) on paper, and with Tab (or I) the pack on a canvas mat, as
  Tarkov grids with drawn icons (drag, R to turn, Shift-drag to split, Ctrl-click to send on, a right-click menu). The
  shelves, the lure wall and a new map table under the store's right window open Witcher's two panes, yours on the
  left and the shelf on the right; a buy goes into the slot it is dropped on or the first with room, and is refused
  politely when nothing fits. The counter is services only.
- **The walker** (C: `src/collide.js`, `player.js`, `tiles.js`). Every solid collides by its drawn shape, part by part
  (boulders, outcrops, scree, cliff modules, logs, stumps; trunks at their real radius). Space into something vaults a
  thin waist-high thing, climbs anything up to about 2 m with room on top, else hops. Past chest depth you swim; a wind
  capsize leaves you swimming by the overturned hull, and E rights it. `player.move` tells the body what it is doing.
- **The body and the camera** (D: `src/canoe.js`, `camera.js`). The jog's lunge (a planted foot missing its step) and
  the idle stomping are gone, the first-person eye rides a damped spring, and there are poses for the vault, the climb,
  sitting, wading, the high step, swimming and treading water. The third-person camera pulls in at once for anything
  solid and eases in for foliage, and in a store keeps within the walls, so third person is allowed indoors.
- **World data** (E: `src/world-fixes.json`, applied by world.js at load, no rebake). The landings stand at the real
  put-ins (the median error went from 1.2 km to 26 m), and the 54 portages the first bake dropped are back, joined to
  the water (969 to 1,021).
- **Dialogue** (F: `src/dialogue.js`). A passing remark shows by the speaker's head with their name and role for 3 s
  plus 60 ms a character, pinned to the screen's edge when they are off it; a store is one room, so one line at a time
  and never more than two on screen; T shows the last six. E on a person opens a conversation at the bottom of the
  view: numbered choices, Esc to leave, the view turned to them.
- **Nature and fishing** (G: `src/mist.js`, `fog.js`, `forage.js`, `fishing.js`). The mist is part of the fog, with no
  edge anywhere. Strawberries, juneberries, blueberries, raspberries and pin cherries, chanterelles, hedgehogs and
  lobster mushrooms (and a false lookalike) grow on their own ground in their own season, likelier by the sites and the
  trails, with a glint and a rustle; picking puts a pint or a handful into a container in reach. The lure strip lists
  only the lures you have; the bobber hangs on the line.

### The join, played through

A new Adventure season at entry point 30 (July 12, 7:40, Trip pace, $40), through the keys and the mouse, headless at
1440 × 900:

- **The store.** Ruth's welcome showed by her head ("Forty dollars to start you, dear…", 7.9 s). Anneli's tree: a hint
  twice, about her, goodbye, and "Watch your step on the carries" as she was left. At the provisions shelf a 30 L barrel
  ($25, double-clicked: kept by the outfitters), then a rice supper, trail mix and a chocolate bar dragged into it ($9
  left); at the map table F-24 ($8, into the Duluth pack; $1 left). The counter showed the permit, a bunk ($8) and a
  ride to Snowbank ($10), and no food. The barrel was put on the back from its menu, carried out, and loaded with E at
  the hull; E launched at 7:58.
- **The portage.** Lake One – Kawishiwi River (23 rods), 1 km off: the canoe overhead, the pack on the back, the rod and
  the bucket in the hands, 48 kg; the barrel waited at the trail head. Over, the canoe set down, 110 m back for the
  barrel (E), a 0.7 m log 9 m off the trail vaulted with the barrel on, back to the canoe, E loaded it.
- **The water.** Off the river bank: wading at 0.3 m, swimming at 1.15 m, 29 m out and back. A forced 22 m/s gale on
  the river filled the balance only to 0.52 in two minutes beam-on (no fetch for a sea there), so the capsize was
  forced: treading by the overturned hull, "Over you go. Half a day of food is spoiled" (the supper), the gear wet;
  E righted it and climbed in. From the shore by the store, a swim to the beached canoe and "E Push the canoe off and
  climb in".
- **Camp** at a Lake One site (the river's sites had no water route without a second carry, so the canoe was moved
  back to Lake One). A pint of blueberries 13 m from the fire went into the barrel on the back (18 min). The trail mix
  from the book: "Hold still to eat" while walking, eaten standing (energy 69 to 77 %). The camera raised, then J and
  I each lowered it. Tent 15 min, an armful 25, the fire 20. The pack set down by hand away from the tent; the launch
  struck the camp and took the barrel set out by the tent; 149 m out: "Left behind on the shore: the Duluth pack #3. It
  stays there until you come back." Back for it: E picked it up, E loaded it, "Everything in the canoe".
- **Traversal** by the store: the 1.2 m rock climbed, the bowed log vaulted from both sides.

### What the join fixed

- **A reload lost what was defined late**: the inventory restored before the shop knew the map sheets, before a store
  made its signature item and before forage's items were in, and dropped them: the $8 sheet was gone after a reload.
  Sheets now resolve lazily (items.js), forage defines its items as it loads, a signature item's definition rides in the
  save.
- **The camera in a spruce on the carry**: camera.js's crowns were half the drawn trees' size (a cedar 2.1 m against
  3.4 m drawn, narrowing to nothing at the top), so the carry's camera sat in the boughs with the walker hidden. The
  crowns follow the drawn trees now, and under the canoe a crown pulls the camera in only to 4 m (at 2 m it sat inside
  the stern).
- **A thing carried hid the camp and the berries**: away from the canoe with the barrel on, "Q Set down the small
  barrel" took the line and the camp's E (the tent, the fire, the firewood) and a patch's both stood back from it. That
  prompt is soft now: they take the line and keep the Q.
- **The two traversal misses**: the log by the store lies along a slope, bowed, and its stem as one convex hull held
  the walker along its whole length where its middle was a step high, so Space hopped; a log's stem is cut into the
  frusta between its rings now, and Space gets over anything from a little under a step. A Space pressed a stride short
  of the 1.2 m rock hopped into it: a press is kept 0.8 s and something to get over within a metre ahead is walked up
  to.
- **The words for food**: the journal's trip page counted days of food against the pack's room ("no day of 14 · the
  pack is empty" with two snacks in the barrel; "pack is empty. the nearest landing" standing in a store), and the
  resume and carry-on notes said "no days of food". They say the inventory's words now ("2 snacks within reach"), and
  the food notes keep quiet at an outfitter.
- **The book said things under itself**: eating, carrying and moving from the book report through the HUD's line, which
  lies under the paper, so "Hold still to eat" was never seen; the pack side writes it in pencil in its header, and an
  open shelf on its receipt.
- **A swim off a carry's far end** lost the portage from the trip's count.
- **The Controls card and the docs**: I, Tab in the book, T, a People section, vault and climb, swimming, carrying and
  setting down, the shelves' panes and the map table, the lures you have; the README, trip-core.md and this file.
- **Sawbill's map table** led with F-36 (its landing 225 m over the edge) and sold F-26, Sawbill Lake's own sheet, as a
  neighbour; a landing within a kilometre of an edge leads with its lake's sheet (Sawbill, Isabella, North Kawishiwi,
  Magnetic).
- The book offered "Load it into the canoe" 18 m from the canoe, and refused it: only with the canoe by you now.

**Checked and found sound:** reloads in the store, at the dock, mid-portage (afloat off the trail head, what you carried
in the canoe, the barrel still on the trail), at camp with the barrel on the back and the tent up, and afloat with the
pack left on the shore all came back whole: the containers where they were, $1, the sheet, the photo, the pint in the
barrel and the day's picking. The third-person camera in the store, 1,057 frames walking every aisle and turning on the
spot: never above the ceiling, outside the floor only in the doorway as you step in. The program count held at 95
through the dock, the camera (raised, a picture, lowered), swimming, climbing back in and the camp (90 to 95 on the
first walk through the store after a reload), the lights at 5; frames 6.4 ms median at the camp and 6.9 ms in the
store with the keeper and a visitor; no console errors.

### Left for the camp pass

- The packs set out at camp go back in the canoe by themselves at the launch, and E does not take them up (the camp
  holds them): the repack by hand is the camp pass's.
- Meals and fish are cooked only by the old grate prompt; the pot on the grate and the wait are the camp pass's. By the
  fire the readout counts the meals in the packs set out within 25 m but the snacks only within reach, so it can say
  "no food" with berries in the barrel at the tent.
- A wind capsize needs open water: a river's short fetch never builds the sea.

(The first two were the camp pass's, below: done.)

### The camp redone, stream 1: the tent where you choose, the barrel hung, nothing left to itself

The owner: "setting up tent should be done where you say set up tent, should go through phases, like flat staked, poles
up, tent up, raintarp on. you have to press and hold as it goes through the phases, and if you stop then it stops at a
phase you were last on", "you have to hang your blue food barrel", and "it doesnt do it automatically when you leave,
and you CAN leave stuff. you need to repack bags in canoe". The details are in [trip-core.md](trip-core.md), "Camping
and sleep".

- **Held work** (`hold.js`): any job that takes time is a held key with a radial ring in the action line's key, a tick
  per phase and the phase's name; it moves only while the key is down, passes each phase's minutes on the clock, and
  stops where it stands when you let go. Both streams' jobs use it (the tent, the barrel, the canoe's load; the fire,
  the saw, the latrine).
- **The tent where you choose** (`camp.js`, `tent.js`): a ghost green on good ground and red where it can't stand, with
  the reason; held E through four phases, each drawn (the sheet unrolls, the poles stand, the tent rises, the fly
  settles); a half-pitched tent stays so across reloads; struck the same way back into a pack. The site is claimed
  from the first phase until the strike. Only the fly sleeps best; without it the rain soaks you.
- **The barrel hung** (`hang.js`): from a real limb of a drawn white pine, red pine or birch, 3 m up and 1.8 m out,
  the rope tied off round the trunk; let down with a held E. A barrel left on the ground overnight in Adventure may be
  raided.
- **Nothing on leaving**: launching strikes nothing, puts nothing out and packs nothing; a note says what is still
  ashore, and it stays, across reloads, until you come back.
- **Repacking** (`packs.js`): a held E at the hull loads everything set out about the camp; Q launches and leaves it.
  E picks up a pack set out at camp like anything on the ground. A reload in the middle of a carry comes back on the
  trail with the canoe overhead and the carry on you (`packs.resumeCarry`).
- **The camp's reach** (`inventory.campReach`): at a site that is free or yours, what is set out within its area and
  the canoe lying there count for the food, the wood, the tent and the pot.

### The camp redone, stream 2: the fire, the food and the latrine

The owner: "picking up firewood should be actually walking around camp and finding loose branches and logs, putting
them in your inventory", "you make a fire so you can cook so you can eat. not just press G ... it puts a small pot on the
grate and you cook for some time, you have to wait short time but not instant, then you can eat", "the toilet actually
you should actually sit", "you should be able to snuff out fire". Built on stream 1's held ring (hold.js) and camp reach
(`inventory.campReach`); the details are in [trip-core.md](trip-core.md), "Camping and sleep".

- **Firewood** (`chores.js`): dead branches and short logs about every site (12 and 5, under the trees and by the down
  logs) and in the woods' cells, the same every visit, back two days after they are taken. E picks one up into an
  armload in a free hand (`woodarms`, drawn at the hip and set down beside you when you sit), else into a pack you
  carry. The saw cuts three logs off a down log (held). An armload is stacked on the woodpile by the ring.
- **The fire** (`fire.js`): laid and lit with a held E (kindling first), fed a piece at a time with a tap, put out with
  a held E (three phases, a steam cloud and a hiss). Left, it burns down and its coals smoulder ten hours, so the
  morning's fire still wants putting out; a branch on hot coals brings it back. Nothing puts it out for you.
- **The pot** (`cook.js`): a tap at a burning fire puts the best raw thing in the camp's reach on the grate (a fish
  first, else the meal of the hour), with water from the bottle; it cooks 6 to 8 real seconds (20 to 25 game minutes),
  steaming, bubbling or sizzling, then chimes. E eats it sitting on the bench (the pot in one hand, the spoon to the
  mouth: canoe.js `poseSit` with `move.eat`); the book can keep it as leftovers for five hours. Raw is never eaten.
- **The latrine:** a held E walks you to the box and sits you on it (the rig carried onto the seat, poseSit).
- **The readout's food** at camp counts the camp's reach (the barrel by the tent, a hot meal in the pot).
- **Programs and lights:** the steam (one shader, two emitters) is drawn from the first frame, parked; the wood, the pot
  and the hand things are on the props' material. A full evening adds no program of its own (the evening's sun shafts,
  post.js, compile once as the sun gets low, as before); the lights stay at 5.

### The camp redone, joined and played

The two streams joined on `claude/camp-redo` (main 7abe24c and the two merges), then played as a player through the
real and held keys, headless at 1440 × 900: a new Adventure season at entry point 30 (July 12, 7:40, $40), two camp
evenings on Lake One and the leaving between them.

- **Outfitting.** At the provisions shelf a 30 L barrel ($25), two rice suppers, two oatmeal breakfasts and a trail mix
  dragged into it ($1 left); the barrel carried out on the back and loaded with E at the hull; launched at 7:45. A 48 cm
  pike landed and kept 1.7 km out (8:33).
- **Evening 1, site A** (1.1 km north-east of the store; ashore 8:47, 2.9 km, energy 97 %). The A-frame's ghost green
  at the pad and red over the ring ("too near the fire ring"); E held to the A-poles and let go (8:56 to 9:06), a
  reload, the tent still half up; held again to the tent hung, then the fly (9:17). Three branches and two logs picked
  up walking 2 to 20 m about the site, stacked on the woodpile with the armload's Q at the ring. A wait to 16:30 (energy
  73 %, the bottle down to 0.15 L, filled at the shore); the fire laid and lit (held, 16:43 to 16:58, 2½ h of wood). The
  barrel carried up from the canoe and the supper cooked from the book (Use, 0.4 L from the bottle, 8 real seconds and 25
  game minutes, steaming; a branch fed meanwhile), eaten on the bench (food 0.59 to 1.0); the pike fried (a tap) and
  kept in the barrel as leftovers (gone off by morning). The latrine held (18:24 to 18:35, rest +0.045). The barrel hung
  from a white pine's limb 5 m up, let go after the rope and carried on (18:46). By the fire to 19:45; the wake card,
  7:00. Night 1: "Rain on the fly all night", dry, up at 7:00 with energy 85 %.
- **The leaving.** The barrel let down; two branches; a breakfast fire; the oatmeal refused at first (0.27 L for 0.3),
  the bottle filled, cooked and eaten; the fire put out (held, the steam); the tent struck to the floor (E held), the
  rest taken down with Q, pitched again and left standing on purpose; the pack set out by the tent and "Load everything
  here" held at the hull (the pack and the barrel, 13 kg, 8:58 to 9:00). E launched: "The tent is still up. Everything
  stays as it is until you come back." A reload 350 m out: the tent up, the site still held.
- **Site B** (1.2 km west; ashore 9:16, 4.1 km): no ghost, and now the line says why ("your tent is up 1.2 km north-east,
  at the campsite on Lake One: strike it there to pitch it here"). An afternoon's wait, the bottle filled, five pieces
  gathered, the fire lit, two stacked, supper cooked and eaten on the bench (17:29), the latrine (rest 0.59 to 0.64).
  The leech bucket set down by the hull and a reload with the fire burning; Q "Launch and leave the leech bucket": "The
  fire is still burning; the leech bucket is set out. Everything stays as it is until you come back."
- **Back for the tent** (A at 18:01, 5.3 km): standing as left. At dusk the fly taken off (Q held), rain at bedtime (set
  by hand: the forecast was clear), Q "Sleep without the fly": "a damp night in wet gear", the night at 0.61 (0.85 ×
  0.9 × 0.8), the gear soaked by morning; the tent struck with Q into the pack, a breakfast fire, "Your gear is dry by
  the fire", put out, the barrel set out and loaded with "Load everything here", launched with nothing left. At B the
  bucket picked up and loaded (6.5 km); a fire left to burn down to coals (8:03 to 10:06), a branch on them ("it
  catches again"), put out.
- **The dome and the saw** (put in the pack for the test: the season had $1): the dome's ghost and its four phases
  drawn as the dome; the saw's three lengths from a down log at B, resumed after picking up the first.
- **Keys:** at the ring, the tent, the latrine, the hull, the wood and the bench, turning round at each: one owner of E
  and of Q on every line. The book holds the keys while it is open; forage takes E only over a plain line or the ghost.
- **Numbers:** 97 programs at a fresh load (98 with the glint's sprite now compiled behind the title), 101 after the
  whole play (the glint, and a plain lambert and a custom shader that are not the camp's); lights 5; frames 7.3 ms
  median (9.1 at the 90th) by the fire at B, 842 draw calls; no console errors besides the book's fish icon.

### What the camp join fixed

- **The A-frame drawn as the dome.** The starting kit's A-frame is a ridge tent now (props.js `buildAFrameMesh`, end on,
  an A of poles at each end and a ridge pole, a vestibule over the door with a flap rolled back), with its own stages
  (the floor staked, the A-poles up, the tent hung, the fly on), its own ghost and size; the dome stays the dome.
- **The book's pack side threw** with a fish on the stringer in reach (no 'fish' in the icon table): the canoe's grids
  never drew.
- **"No food"** in four places at camp: the resume note after a reload at camp (the area not read before the first
  frame), the HUD's mark while gathering the site's own wood (it lay out to 30 m, the area is 25), the mark and the
  readout all evening once the barrel was hung, and the book's food words at the fire ("within reach" over empty
  grids: "about the camp" now). Cooked leftovers count in the book's words too.
- **The woodpile** could only be stacked from behind its undrawn spot (the ring's E is the fire's): the armload's Q at
  the ring stacks it.
- **The fire's plain lines** ("no wood to hand", "logs will not light on their own") never showed over "The canoe is
  17 m away".
- **Water for the pot:** "wants 0.3 L and the bottle has 0.3 L" (0.27); the line says it in mL before the tap.
- **A thing set down by the hull** took the canoe's E from every side: "Q Launch and leave it". A thing set down from
  the book within a camp's area counts as set out at camp.
- **One tent at a time**: at another site, where yours stands; the readout's Pack row says it too.
- **The strike's notes** named the wrong key, and the night card said "a still night" in the rain falling at bedtime.
- **The menu's greyed "Cook it first"** beside "Cook it on the fire", the barrel's name in the hang's lines, "leave
  them" for one thing, and forage's glint compiled mid-play.
- **The Controls card and the README** speak the held jobs, the ghost, the hang, the fire, the pot, the latrine and
  "Load everything here".

### Left after the camp join

- One tent stands at a time: a second tent (the A-frame and a bought dome) cannot be pitched while the first stands
  elsewhere.
- A fire lit in the late afternoon is cold by a 7:00 wake (it smoulders ten hours after the last wood), so the morning
  douse only meets coals after a fire fed late.
- The book does not show the camp's reach (the barrel in the canoe on the shore) as grids: cooking from the book means
  carrying the food up, as a player would; a tap at the fire reaches the whole camp.
- The mid-portage reload (stream 1's `resumeCarry`) and the bear's night were not played again here.

## What phase 4 will do

**A season's balance at the new pace.** Phase 2's progression was played at 2 to 4 km a game day; at Trip pace a day
is 20 to 25 km, and the three days above give the first numbers to balance against:

- **Money.** The three days earned $95 (a $30 berries notice is an hour's picking at a camp you would stop at anyway;
  a $30 locket two portages in is a morning; Finn's errand $8) against $30 of food and $20 of rides (and $25 for the
  camera). That is fast next to the bent-shaft ($40) and the Kevlar ($240): replay ten game days and set the pay so the
  Kevlar is about two weeks.
- **The idle clock.** A camp reached at 10:30 has six hours to wait at the 12× clock (half an hour of real time at 1×)
  with nothing to do: fishing from the shore, a nap, or chores that fill the afternoon would help (the camp redone gives
  some: wood to walk for, the fire, the pot, the barrel). Pushing off no longer strikes the tent or drowns the fire, so
  a base camp can be left standing for a day trip.
- **Rest.** A 7:00 start on the A-frame (0.85) leaves rest at 0.47 by 22:00 and the bar "held down by tiredness" all
  evening; the latrine's +0.05 hardly shows. Check the evening against a real day's 20 km.
- **The camera's reach** stays 120 m for a moose and 60 m for a beaver; with the zoom a moose at 120 m still stands about
  a quarter of the print high, so the reach could grow with the lens.
- **Docs**: trip-core.md's chores and the pace, and the owner's notes from playing it.
