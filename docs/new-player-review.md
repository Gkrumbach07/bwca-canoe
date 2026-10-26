# A new player's review (the third 2026-10-25 round, joined on `claude/fb5-1025c`)

Three days played as someone who has never played this or been canoe camping. I knew WASD and a mouse, nothing
else. Before each action I decided what to do from the screen alone, then did it with real keys and the real mouse
through the headless driver at 1440×900.

- **The run:** a fresh Adventure season at EP 30, 16:20. On day 1: Lake One, two portages to Lake Two and the notice's
  campsite. On day 2: rain, the tarp, a swim, the portages back and the keeper. On day 3: a barrel, a Lake One campsite
  at Normal pace, a hang, and a night that ran thirsty.
- **The marks:** ✓ the screen told me, ~ I guessed, ✗ I was stuck or misled.
- **Fixed:** each ✗ below was fixed on the branch unless it says otherwise. The commits are listed at the end.
- **Shots:** `shots/n*.png` and `shots/fb5-join-contact-sheet.jpg`, both untracked.

## The run as a player's log

### Day 1: the store, the lakes, the first camp

| # | Step | | What the screen said, and why |
|---|---|---|---|
| 1 | Title → New season → Adventure → 30 | ✓ | "Lake One · the default start" picks itself. |
| 2 | At the door | ✓ | "The door is open". W walks in. |
| 3 | The keeper | ✓ | "Food's on the shelf, and the board's by the door" tells me where to go. |
| 4 | The shelf | ✓ | The hint "E look at the shelf" and the dot's "E Open · The provisions shelf". |
| 5 | Buying food | ~ | The footer says "double-click buys one". The tooltips' icon chips (+60, +45) are the bar's icons, but I had to look up at the bar to read them. |
| 6 | "Yours · no food" after six buys | ✗ | The header kept its old words until the shelf was reopened. **Fixed.** |
| 7 | Lures | ~ | The words per fish were clear. **Changed** to pips at the owner's request (sheet tile 13). |
| 8 | The board | ✓ | "Take it on", and the notice says where. |
| 9 | The map table | ✗ | Nothing tells you it exists. I left with no sheet the first time. **Fixed:** a once-only moment after the first shelf: "The map table sells the map of these lakes: M then shows the campsites." |
| 10 | Getting in at the dock | ✓ | "E Get in". It also showed a greyed "Q Shoulder it · unload it first" there. **Removed.** |
| 11 | Paddling out | ✓ | "Paddle out, find a campsite for the night. M shows them." W, A and D work as expected. |
| 12 | M with no sheet | ✗ | Blank paper, after the start line had promised campsites. **Fixed:** the start and evening lines don't promise M when no sheet covers you. |
| 13 | M with the home sheet | ✓ | Campsites, portages, and a click gives "About 1.1 km south-east, about 15 minutes". There's no mark in the world afterwards (~). |
| 14 | "1 2 3 the pace" | ~ | I read "pace" as paddling speed. **Reworded:** "1 2 3 how fast time runs". The toast after it is clear. |
| 15 | Fishing from the canoe | ✓ | "F to fish" came once I sat still. Then hold Space to cast, W to retrieve, and E keep / Q let go on the catch card. |
| 16 | The first portage | ✓ | "A portage. Land beside the sign to carry the canoe over." E Go ashore. |
| 17 | Ashore at the portage | ✗ | A standing line said "the canoe is beached: point at it and hold E to push it off", and the push moment fired too, both against the carry I'd just been told about. **Fixed:** no standing line, and the unload moment speaks at trail heads. |
| 18 | Q on the loaded canoe | ✗ | The book opened with "Q opens the book at the canoe…" written over it, and Set everything out sat under the grids, out of sight. **Fixed:** the button is at the top and the line is gone. |
| 19 | Shoulder, take the rest, carry, launch | ✓ | "Q Take the pack too · one heavy trip", then W along the trail, then "E Launch onto Kawishiwi River". |
| 20 | The second portage | ~ | "The canoe came down", with no reason given. **Fixed:** it now says "hit a tree". It still happens too often (see below). |
| 21 | The evening moment | ✓ | "Before dark: a free campsite 600 m south-east M". The best line in the game. |
| 22 | Landing at the campsite | ✓ | "A campsite. Before dark: a fire, the tent, your food hung up." |
| 23 | The notice's paddle | ✓ | "E Pick up · the paddle". A second line under it repeated the same words. **Fixed.** |
| 24 | The empty ring | ✓ | "Fire ring · Gather wood", then "Gather dead wood: branches and logs lie around the site." E picks up pieces. |
| 25 | Back with four pieces | ✗ | The ring still said "Gather wood". **Fixed:** with wood in your arms it says "Put the wood in". |
| 26 | The card | ✓ | Dragging pieces in shows "a dry branch · ×1 more", then it lights itself: "It caught". Lit, it shows the bar alone. |
| 27 | The fish onto the grate | ✗ | The fish vanished, because it fries on a stick off the grid, and the bar beside it was bare. **Fixed:** the card shows what's cooking by the bar. |
| 28 | The pot onto the grate | ✗ | It was refused silently. The drop landed half a cell low because of the drag's grab point. **Fixed:** things now land where the ghost is. |
| 29 | Supper | ✓ | It cooked by itself, drawing water from the bottle (2 → 1.6 L). Then "Cooked. Take it off the grate to eat", and right-click Eat. |
| 30 | The tent | ✓ | Right-click Pitch in the book. The red ghost said "too steep, 17°", then it went green on the pad. Hold E. |
| 31 | The bears moment | ✗ | "Hang your food from a high limb", but the first kit has no barrel and only a barrel hangs. **Fixed:** with no barrel it says bears raid food left out and that a blue barrel hangs. |
| 32 | Thirsty | ✓ | "Thirsty. Drink from your bottle I", then right-click Drink. |
| 33 | Filling at the water | ✓ | "E Fill the bottle · the water's edge", then the treating moment. The note said the half hour a second time. **Trimmed.** |
| 34 | Dark | ✓ | "Dark. H for your headlamp." |
| 35 | Fishing from shore | ~ | The rod lives in the canoe. "F to fish" only comes with the rod in hand, so I guessed right-click Put in hand. |
| 36 | Sleep | ✓ | "E Rest until…". The dial is clear. |

### Day 2: rain, a swim, the way home

| # | Step | | What the screen said, and why |
|---|---|---|---|
| 37 | The morning | ✗ | "A bear came through… got into the on the grate left on the ground: rice and lentils, hot gone." **Fixed** grammar, and it no longer says "hang the food" when you have no barrel. |
| 38 | Rain | ✓ | "Rain. Gear left out gets wet; a tarp keeps it dry." The wet-wood note carried a drying formula. **Trimmed.** |
| 39 | The tarp | ✓ | The red ghost showed a "pole ×4" chip, then the once-only line "Two trees 4 m apart stand 10 m south-east: between them it needs no poles". I walked there, it went green, hold E. |
| 40 | A stray teaching line | ✗ | Opening the tarp's menu taught "Put down or away what is in a hand…" for a greyed verb I never tried. **Fixed:** the menu teaches only when every verb in it is greyed. |
| 41 | Soaked | ✓ | Right-click "Change into dry clothes". After that "Soaked. I" came back all through the rain at full warmth. **Fixed:** silent while you're warm. |
| 42 | Coals | ✓ | "The coals are still hot: a dry branch brings it back." The card showed "Hot coals ×1". A wet branch gave "Wet wood won't catch", and a dry one relit it. |
| 43 | Oatmeal with an empty bottle | ✓ | The pot's own chip, "water 0.3 L". I filled the bottle and it cooked. |
| 44 | A stuck tooltip | ✗ | A piece's tooltip stayed in the corner after the drop. **Fixed.** |
| 45 | Douse, strike the tent, take down the tarp | ✓ | Each is a hold Q on the dot. |
| 46 | Picking up the struck tent | ✗ | "No room for all of it", with a hand free. **Fixed:** a free hand takes it. |
| 47 | Push off and get in | ✓ | "It floats. E to get in." |
| 48 | A swim | ✓ | I walked off the shore and swam: "Swimming · the canoe is 9 m away". Then the soaked moment. |
| 49 | Portages back | ✓ | The bucket was left at the start, and "The leech bucket is back at the trail head, 187 m · Q Fetch it (about 10 min)" was clear. |
| 50 | Pushing off without the bucket | ✗ | The fetched bucket, set down 4 m off, stayed behind without a word. **Fixed:** the note names it. |
| 51 | "At your feet · in the canoe" | ✗ | That was what the book called the tent held loose in the hull, even ashore. **Fixed:** it's called by its own name. |
| 52 | Home | ✓ | Tie up at the dock, then E at the counter, then Claim $31. |

### Day 3: a barrel, Normal pace, learned things

| # | Step | | What the screen said, and why |
|---|---|---|---|
| 53 | Buying a barrel | ~ | "It's with your things." It landed in the Keeping tab, and I had to find it there. |
| 54 | Camp at Normal | ✓ | Four pieces took 12 game min (3 real min). The fire lit with no moments: all learned. |
| 55 | Hanging the barrel | ✓ | "hold E Hang · the white pine · a limb 4 m up". The hold took 4 s. |
| 56 | The afternoon at camp | ✗ | It said "No food, and not much left in you. Make for an outfitter." and "Nearly spent… or make for a campsite", while I was at the campsite with supper hung. **Fixed.** |
| 57 | The Rest dial | ✗ | "a short night: the tent gives 76 % of its rest". **Fixed:** no percent. |
| 58 | The morning | ~ | I was spent from thirst at 08:12. The bottle took a 30-minute tablet with the rescue an hour off. Tense, but the moments had warned me (see below). |
| 59 | Nothing repeated | ✓ | The shelf, V, Shift, 1 2 3, H, F, push, portage, site, lit, low and coals lines were never seen twice. |

## Too much on screen

| What | Where | What I did |
|---|---|---|
| "Fresh breeze · 8 m/s from the west · waves 0.1 m" | Under the compass in the store and at camp | It shows only while paddling. |
| "the canoe is beached: point at it and hold E to push it off" | A standing line at every landing | Gone. The dot and the push or unload moment cover it. |
| "The canoe is 12 m away" | A standing line at camp and in the store | Gone. |
| "Pick up the paddle" | Under the dot's own "E Pick up · the paddle" | A line that repeats the dot goes. |
| "drag to pan · wheel to zoom · click a spot… · your sheets, with everything on them · the rest is blank until you buy its sheet" | The map's foot, every M | The keys only, plus what's missing (blank paper). |
| "Blueberries! The low bushes here are blue with them." | Ten times in three days, daily and after reloads | Once a trip per kind, and saved. |
| "Duluth pack #3 · 12 kg", "Armload · 5.1 kg" | The fire card's left side | Kilograms are hidden on the card. The book keeps them. |
| "Warmth comes back twice as fast for a couple of hours" | Dry clothes | Cut. |
| "(30 min by a lit fire, 3 h in dry air). A tarp keeps it dry." | Rain on the wood | Cut. The wood's tooltip has its timer. |
| "Drinkable in half an hour" | The fill note and the treating moment at once | The note drops it. |
| "One clock on the water and on land" | The Normal toast | Now "2 or 3 to speed it up". |
| "×12" | After "$4 for 12" on the shelf | Cut. |
| "clear water, 3.1 m" | The fishing spot card | **Left.** Recommend dropping the Secchi depth for players. |
| "2 meals to cook and 3 snacks hung in the barrel" | The corner mark, all day when food is under a day | **Left.** Recommend an icon and a count. |
| "Space Hold to load a cast where the cursor points · 1–3 change the lure · F puts the rod down" | Every cast | **Left.** Recommend the short form after the first catch. |

## Mechanics that feel off

1. **The canoe falls off your shoulders too often.** It came down twice on four carries, at walking pace on a clear trail (45 % per tree hit). Each time means another Q and another aim.
   - Recommend: 15 %, and only when jogging.
2. **E at a trail head is "Push it off".** You landed there to carry, so the first verb is the wrong one, and Q Shoulder is greyed until you unload.
   - Recommend: at a trail head, E is Shoulder it (greyed with "unload it first") and push off moves to Q.
3. **The rod in the canoe.** Shore fishing needs a right-click Put in hand first, and "F to fish" never shows until then.
   - Recommend: F on foot at the water, with the canoe beside you, takes the rod from it.
4. **A bought barrel lands in Keeping.** You then have to find the tab and drag it out.
   - Recommend: it lands on your chest when the chest is free.
5. **Fishing is generous for the food it gives.** From shore I got four fish in 34 game minutes (bites at 5–12 min). Each one is +60 food, the same as a $3 supper. Per real second it feels right, at 1½–3 min a bite at Normal.
   - Recommend: keep the bite rate, and halve a fish's food (or count it as a snack).
6. **Thirst overnight.** I drank 2 L at 21:00 and was spent from thirst by 08:12. The tablet then takes 30 game minutes while the rescue comes in 60.
   - Recommend: thirst at half rate while asleep.
7. **The pace, judged as a player:**
   - **Cooking:** supper takes 15 game min (3¾ real min) and a fish 10 (2½ real min). That's fine when you pitch the tent meanwhile, and the chime and moment call you back. Keep it.
   - **The log:** 22 real minutes a log is right for an evening. One trip for wood keeps the fire through supper.
   - **The evening at Normal:** landing at 19:33 to sleep at 22:14 is 40 real minutes, full of things to do. At Fastest it's 10. Keep it.
   - **Portages:** 134 m took 3.6 game min and 0.8 % energy. Not felt.
8. **Rain soaks your armload but not the deadwood lying on the ground,** so gathering in the rain gets you dry wood.
   - Recommend: loose wood out in the open gets wet too, and stays dry under the crowns.

Cold and hunger never reached their first lines in three July days: warmth stayed above 0.97, and thirst came first. Their moments weren't seen in play.

## What needs the owner's call

The owner approved all six on 2026-10-25. They were built at the content join on `claude/content-1`, and each was played.

1. **The home sheet.** A new season starts with no map. Even with the new map-table moment, a player who skips it has blank paper on night one.
   - Recommend: give the home sheet at a new season. `sheets.giveHome()` exists for the old unlock.
   - **Done (owner approved 2026-10-25), 0b3602d.** A new season owns the home table's first sheet (F-24 at EP 30). M on the water shows its campsites from the first minute, and the map-table moment stays quiet.
2. **A barrel in the first kit.** The bears line, the raid and the hang all assume a barrel, and it costs $25 of the $40.
   - Recommend: the 30 L barrel comes in the starting pack.
   - **Done (owner approved 2026-10-25), 8174552.** The barrel rides in the canoe, empty, and bought food goes into it. Two suppers, an oatmeal and trail mix leave $29, enough for the saw and a head net.
3. **Portage verbs.** Recommend E Shoulder it at trail heads (item 2 above).
   - **Done (owner approved 2026-10-25), c16adbd.** At a trail's end the dot reads "E Shoulder it · hold Q Push it off". Loaded, E opens the book at the canoe. The portage and unload moments name E, and elsewhere the held-E push stays.
4. **A fish's food.** Recommend +30 (item 5).
   - **Done (owner approved 2026-10-25), 2ea9577.** A fish, fried or whole, and its fillets give +30 food. The +45 lift is left for the balance pass.
5. **Thirst asleep.** Recommend half rate (item 6).
   - **Already a third of the waking rate while asleep; no change (owner approved 2026-10-25).** Measured: a 7.3 h night in the tent took the water need from 0.59 to 0.29, a third of the waking rate (energy.js ASLEEP). That is already gentler than the half asked for. You wake thirsty when you go to bed under about 0.6, which is what happened in the run above. The review's own case, checked: thirst at 0 and the bar at 0.11 at 21:00, the bottle drunk up (need back to 1.0), then rest to first light (8.6 h). You wake at 0.64 water and 0.55 bar, well clear of spent, so it was no bug.
6. **Shoulder drops.** Recommend 15 %, jogging only (item 1).
   - **Done (owner approved 2026-10-25), 177df3b.** Walked into a lone trunk 29 times, the canoe never came down. Jogged into it 119 times, it came down 18 times (15 %).

## The commits (on `claude/fb5-1025c`, over the five streams' merge 13cf3fe)

| Commit | What it does |
|---|---|
| 50f6da6 | Lure and leech takes as five pips beside each fish (owner). `items.takesList` / `takesOn`, `TAKE_STEP`. An `onYou` entry may carry `takes`. |
| 37c5f0d | The shelf's Yours line counts what's just bought. No "×12" after "$4 for 12". |
| 73b5b0b | At a portage: no standing push line, no push moment, the unload line names Q, the canoe's buttons on top. |
| d8a4d61 | The fire card shows what's cooking by its bar. |
| 93e52f5 | A drag lands where its ghost is: the exact grab point. |
| d55f159 | The empty ring asks for the wood in your arms. |
| 1cfb382 | No barrel, no "hang your food". The raid on the grate reads right. |
| 82f668c | A line that repeats the dot goes. The fill note, wet-wood and canoe-fall lines trimmed. |
| 24c8279 | A menu teaches a greyed verb's next only when every verb in it is greyed. |
| 2ae2928 | Picking up a pile, a free hand takes what the packs can't. |
| f83872b | A tooltip goes when its icon is redrawn away. |
| eb1acba, 1ac722f | Soaked stays quiet while you're warm. Dry clothes' line has no rate. |
| 457e7a6 | Pushing off from a trail head names what you leave, near the canoe too. |
| 9ebbc91 | A thing loose in the canoe is called by its name. |
| d5a91e9 | Hung food is food (the warning). Nearly spent at camp. The Normal toast. Put in hand in the canoe. |
| 667c722 | The Rest dial's short night has no percent. |
| b8be0eb | Hungry with the food hung up says where it is. |
| ce6afa1 | The fire card's side of your things has no kilograms. |
| b156250 | The compass speaks of the wind only on the water. |
| 0d18ef7 | No greyed Shoulder it at the dock. |
| bb6071d | "1 2 3 how fast time runs", "V change the view". |
| a7483c0 | The map-table moment. Start and evening don't promise M without a sheet. |
| ebc917d | Forage named once a trip. |
| 2c81019 | The map's foot line: the keys and what's missing. |
