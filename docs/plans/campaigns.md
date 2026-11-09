# The game loop: permits, trips, outfitters and the story

Design, not a build. Workshopped with the owner on 2026-11-02. This page replaces the earlier "one year, one campaign"
format: the flow below is agreed. The three lists at the end (board tasks, mini-campaigns, the main story) are drafts
**for the owner to sign off**, each item marked ✅ / ❌ / ✏️ by the owner.

Read with [people.md](people.md) (parties on schedules), [../hubs.md](../hubs.md) (outfitters, the board) and
[../game-vision.md](../game-vision.md).

## Decisions so far (2026-11-02, the owner)

- **You are a solo canoeist.** No "become a guide or an outfitter" story. No NPCs paddling with you for now.
- **Everything persists.** Gear, money, maps, inked lakes, the record, photos and what people know about you carry on
  across years. No prestige, no resets. A new save is the only fresh start.
- **Trips are the unit, permits move time.** You always enter and leave through an entry point. No fast travel.
- **Every overnight permit is paid**, in every season.
- **No tab.** You never owe an outfitter money.
- **Outfitters sit on entry points**, about 14 of them, spread out, never clustered in a town. Not every entry point
  has one.
- **One long main story** (the donated gear box) plus a few **mini-campaigns** at a time plus the **board's tasks**.
- **Event years** (fire, flood) are isolated overlays and good DLC, not part of the base year.

## How long is a season?

One clock, ×8 (`src/pace.js`): a game hour is 7½ real minutes, a game day 3 real hours. Open water runs from ice-out
(about 27 April) to freeze-up (about 25 November): 212 days (`src/season.js`).

- With sleep and the Rest dial, a full tripping day is about **1–2 real hours**.
- **Every day of a season would be 200–400 real hours.** Nobody plays a year that way, so permits skip time (below).
- **A trip** (3–6 days) is **4–10 real hours**. A season played as trips is **8–15 trips, 40–100 real hours**.

## The loop

```
outfitter ──buy permit (picks the date)──▶ drive or walk to the entry point ──▶ trip
    ▲                                                                         │
    └── trip-end screen (pay, firsts) ◀── come out at any entry point ◀───────┘
                                          (pickup back, or walk in if it's the outfitter's own)
```

1. **At an outfitter:** read the board, talk to people, sell, buy, rent, and buy a permit.
2. **The permit picks the date.** Buying one for a later day skips straight to it (the bunkhouse night). That's how a
   season moves at the player's pace: a beginner trips through June and July, a confident player jumps to September.
3. **The trip:** as long as you like. A permit fixes the entry point and the day you go in, nothing else (the real
   rule).
4. **Coming out ends the trip.** You can leave at any entry point and call a pickup. Walking into an outfitter also
   ends it. Resupplying means a new trip and a new permit. "If you come back and resupply, that's your trip."

### Permits

| Permit | Price | What it gets you |
|---|---|---|
| **Day use** | Free | In and out the same day from any entry point. You still pay for the drive. Still out after dark: a ranger's fine. |
| **Overnight** | **$6, the same every day of the year** (owner, 2026-11-05) | Any entry point, any day you can get. Stay as long as you like. What changes by season is how many are left, not the price. |
| **Primitive area** | **$6, the same price** | Camping away from designated sites in one primitive management area (real: Forest Service permission). Some tasks and the wolves need it. |
| **Quetico** | Paid per night, plus the border crossing | Camp anywhere in Canada. A late, remote area that costs by the length of the trip. |

- **Availability is real.** Each entry point has its real daily quota (recreation.gov, already in `parties.js`). The
  permits left for a day are the quota minus the NPC parties `parties.js` already sends in that day. July Saturdays at
  Moose Lake are gone. A Tuesday in September is wide open. The permit desk shows a calendar.
- **The first permit is free** (the keeper's gift during onboarding).
- **Co-op:** one permit covers the whole group, no size limit (owner, 2026-11-05). A friend who joins gets the basic
  starting kit a new player gets, whatever gear the host has by then.
- **Primitive areas are the real ones** (the Forest Service's PMAs), not drawn from our data.
- **The late season (owner's rule):** from 1 October permits are free and self-issued, as in real life: the desk sells
  none, so the late season is free paddling until the ice (docs/story/00-owner-decisions.md; campaign-design.md).

### Getting around

- **The home landing is free:** an outfitter's own entry point is a walk to its dock.
- **Drives to other entry points cost by distance.** Any outfitter drives you to any entry point.
- **Pickups:** at any entry point (parking lot, permit box, the "Welcome to the BWCA" sign) you call a pickup.
  Free only from the entry points the selling outfitter serves (its own reach), back to that outfitter. Farther
  entry points cost extra, and a pickup by a different outfitter costs (the owner, 2026-11-02: a free ride from
  anywhere would be taken advantage of).

### Never stuck without money (no tab)

- **The first permit is free.**
- **Day trips are free** (pay only for the drive, or walk out the home landing for nothing). The board always has
  day-sized tasks.
- **Selling:** fish to the café, photos to the board, found gear for the reward, your old gear at half price.
- **Fines** (out after dark on a day permit, a fire in a ban, a site overstay) are paid at the counter before your next
  permit.
- No odd jobs at the counter: they don't send you exploring (the owner). Day-sized board tasks are the floor.

## A new save

1. **The start screen is a simple map**, not a list: the outfitters as pins. Each shows its reach (its entry points
   and the lakes they open), its country (gentle, rivers, big water, remote) and a line about the keeper. You pick
   one. Gentle ones are marked as a good first home.
2. **The counter.** The keeper walks you through it in conversation:
   - "First permit's on me." The permit desk is taught here.
   - A free map of the home sheet (later sheets are bought).
   - Food for a few days.
   - **A box of donated old gear:** an old sleeping bag, a canvas tent, a cook kit, a map case. Someone's whole kit.
     The keeper: "Walt's. He went into the home in Ely this spring. Said give it to someone who'd use it."
3. **The story starts in that box** (the main story, below): journals in the stuff sack, a hand-drawn map in the
   case. Nobody tells you it's a story. It's just there to read.
4. **The board and the room:** take a few tasks, talk to whoever's in the store (members of real parties going in).
5. **The first trip** from the home landing. Teaching moments as they happen (`hints.js`): the first site, the food
   hang, the first fish, the first portage, the first night.
6. **Coming home: the trip-end screen.** Then a new board, new people, money to spend, and a reason to go farther.

## The trip-end screen

The trip card today becomes a tally that counts up, one line at a time:

- each task done, its pay ticking into the purse
- distance, portages and rods carried, lakes newly inked, fish and species, photos
- **firsts**, stamped: first laker, first 200-rod carry, first night alone on a lake, first wind-bound day
- **milestones** filling toward titles ("20 lakes", "every portage on the Echo Trail", "a night in every month")
- story beats found this trip (a journal page understood, a mini-campaign step)

**Pay lands on this screen, not at the board.** Walking to the board to claim is a chore and splits the payoff. A
person who gave you a task still reacts the next time you meet them ("you found it!"), but the money is already
yours. The board is for taking new work.

## Outfitters

About 14, each on an entry point, placed so no entry point is more than ~11 km from one (minimax clustering, then
tuned by hand: the math picks central entry points, but a real outfitter sits where the road ends).

| Outfitter on | Also serves | Country |
|---|---|---|
| Round Lake 51 | Round Lake entry points (Cross Bay, Missing Link, Brant), Larch Creek, Seagull, Saganaga, Magnetic | Big water, remote |
| East Bearskin 64 | Clearwater, Daniels, Duncan, Morgan, Ram, Bower Trout, Crocodile | Big water |
| Skipper & Portage 49 | Meeds, Lizz & Swamp, South Lake | Big water |
| John 69 | Pine, North Fowl | Remote |
| Homer 40 | Brule | Gentle–remote |
| Sawbill 38 | Baker | Gentle |
| Hog Creek 36 | Kawishiwi | Gentle |
| Bog 67 | Isabella, Island River, Little Isabella, Snake | Rivers |
| Moose Lake 25 | Snowbank, Lake One, Wood, North Kawishiwi | Gentle (busy) |
| Farm 31 | Fall, South Kawishiwi, Little Gabbro | Gentle |
| Slim 6 | Crab, Angleworm, Mudro, South Hegman | Rivers |
| Moose River North 16 | Big Lake, Moose River South, Stuart, both Little Indian Sioux | Rivers |
| Trout Lake 1 | (alone) | Big water |
| Little Vermilion 12 | (alone) | Remote, Quetico's door |

Hand-tuning to do: the host should be the entry point with the road and the history (for the Tuscarora example, an
outfitter on a Round Lake entry point, not Larch Creek). Today every entry point has an outfitter (`outfitters.js`);
this cuts them down.

**Each one must feel different:**
- **A keeper with a strong voice** (`talk-keepers.js`), whose attitude to you grows trip by trip.
- **A building of its kind:** lodge, river post, trout camp, bait shop. The kinds exist; push them further apart.
- **Its own shelf:** premium items only sold there, and discounts on its specialty (big-water spray decks on the
  Gunflint, light portage packs on the river side, a canvas wall tent at the old lodge).
- **Home-turf tasks** that send you into its reach.
- **Its country** (difficulty, below).

## Difficulty

No levelled regions and no enemies getting stronger. Difficulty comes from **the country, the season, the distance and
the permit**, and the start map says which is which:

- **Gentle:** Ely side, Sawbill. Busy, small lakes, short carries. Where beginners start.
- **Rivers:** the Echo Trail and Isabella. Rivers, beaver dams, long carries, wolves.
- **Big water:** the Gunflint. Big lakes, wind, lake trout.
- **Remote:** the far east, the border, Quetico. Long carries, few people, primitive areas, paid by the night.

Moving to the next outfitter feels like reaching a new region, the way Assassin's Creed does, but the easy tasks always
exist. The hard ones are far, cold, windy or need a permit you can't afford yet. You grow into them.

**The seasons as difficulty.** Summer is the beginner's season: warm, busy, berries, bugs. The shoulders are the
expert's, and need their own reasons to go:
- **Spring (ice-out to mid-June):** lake trout shallow and hungry right after ice-out, the walleye opener in mid-May,
  high water and fast rivers, migrating birds, nobody else out. Cold water: a capsize is serious.
- **Fall (September to freeze-up):** the insider's month. No bugs, empty lakes, colour in September, the aurora, the
  moose rut, ducks and geese on the move, the first snow on gold birch. Then skim ice and the last trip of the year.
- Tasks and mini-campaigns are placed to pull you into both (below).

## Limits on what you carry

- **Board tasks:** **no cap on how many you hold** (owner, 2026-11-05). Each has a **deadline in game days that fits what it is** (firewood
  within 3 days, magazine photos within 2 weeks, a route report this month). Missed means it's gone, with a short
  line from whoever posted it, and no penalty. The deadlines are the limit: take more than you can do and some lapse,
  so you learn to pick fewer. (Each board still shows 4 pins at a time.)
- **Mini-campaigns:** **no cap on how many are open** (owner, 2026-11-05: no slots; windows are the limit). They don't run on timers; they end **the way the world would**: if you don't get
  to the bear, the rangers trap it in September; if you're too late for the lights, the aurora season ends. You still
  hear how it ended. A missed one is part of the story, not a fail screen.
- **The main story** never expires and never blocks anything.
- Once you take a mini-campaign, the world talks about it: keepers, rumours, the parties you meet.

---

# For sign-off

Mark each item ✅ keep, ❌ cut or ✏️ change.

## 1. Board tasks (signed off 2026-11-02)

The quick, repeatable work. Pay bands: **$** under $15, **$$** $15–40, **$$$** over $40. "Day" means it fits a free day
trip.

### Already in the game (15 kinds)

| | Task | Today | Deadline | Day? | Pay |
|---|---|---|---|---|---|
| ✅ | **Fish for the kitchen** | Any fish, a species, or a size | 3 days | Day | $–$$ |
| ✅ | **Shore lunch class** | Two or three of one kind into the cooler | 3 days | Day | $$ |
| ✅ | **Lost item** | Paddle, locket, dry bag at a named site | 7 days | Either | $$ |
| ✅ | **Portage survey** | Walk a named portage and report it | 10 days | Either | $$ |
| ✅ | **Blowdown** | Saw a tree off a named portage | 7 days | Either | $$ |
| ✅ | **Litter** | Pack out a trashed site | 7 days | Either | $ |
| ✅ | **Secchi reading** | Lower the disk at the deep spot, 10 to 4 | 10 days | Either | $$ |
| ✅ | **Loon count** | Count loons on a named lake (midsummer) | the count's week | Either | $$ |
| ✅ | **Route report** | Paddle a named chain and say how it went | 14 days | Trip | $$$ |
| ❌ | **Rental left behind** (cut: lost gear stays, a whole canoe doesn't) | Find a turned-over rental, read its number | 7 days | Either | $$ |
| ✅ | **Photo wanted** | Bird, loon, beaver, eagle, moose, a place | 14 days | Either | $–$$$ |
| ✅ | **Blueberries** | Pints for the café, in season | 5 days | Day | $ per pint |
| ✅ | **Firewood** | Wood for the store's stove | 3 days | Day | $ |
| ✅ | **An errand** | Take something to another outfitter | 7 days | Trip | $$–$$$ |
| ✅ | **A favour** | A visitor's letter or thing to a site | 7 days | Either | $$ |

### New

| | Task | What you do | Season | Deadline | Day? | Pay |
|---|---|---|---|---|---|---|
| ❌ | **Odd jobs** (cut: don't encourage exploring) | | | | | |
| ❌ | **Bring a rental home** (cut: no canoes brought back) | | | | | |
| ✅ | **Creel survey** | Ask three parties on a named lake what they caught (uses the scheduled parties) | May–Sep | 10 days | Either | $$ |
| ✅ | **Campsite check** | Ranger work: check a named site's grate, latrine and tent pads, mark what's broken | All | 10 days | Either | $$ |
| ❌ | **Latrine dig** (cut: no good way to complete it) | | | | | |
| ❌ | **Invasive check** (cut: little to do) | | | | | |
| ✅ | **Beaver dam report** | Log the dams on a named creek route (high or low, passable or not) | Spring, fall | 10 days | Either | $$ |
| ❌ | **Smoke report** (cut: no fires yet) | | | | | |
| ❌ | **Bird list** (cut: bird calls not supported yet) | | | | | |
| ✅ | **Ice-out lake trout** | A laker for the smokehouse, only in the first weeks after ice-out | Ice-out + 3 wk | 5 days | Day | $$$ |
| ✅ | **Colour photos** | The magazine's fall issue: a named view at peak colour | Mid-late Sep | 10 days | Either | $$$ |
| ✅ | **Last check** | Close-up week: check that a named chain's sites are empty before freeze-up | Oct–Nov | 7 days | Trip | $$$ |
| ✅ | **Primitive area survey** | Walk an unmaintained trail in a PMA and map where it really goes (needs the PMA permit) | Jun–Oct | 14 days | Trip | $$$ |

## 2. Mini-campaigns (deferred, 2026-11-03)

The owner: add these last. Nothing below is built or signed off until the rest of the loop and Walt's story are in.

Several steps, several permits, people and clues. Each has an **outfitter where it starts**, a **window**, **how many
trips**, and **how it ends without you**. 2–3 at a time. Hunts and wildlife ones reseed (a different bear on a
different chain), so they can come round again in a later year.

| | Mini-campaign | Starts at | Window | Trips | Ends without you |
|---|---|---|---|---|---|
| ✅ | **The raspberry bear** | Gentle side (Moose Lake, Farm) | Jul–Aug | 3–5 | Rangers trap it in September |
| ✅ | **Where the wolves live** | Rivers side (Bog, Slim) | Jun–Oct | 3–5 | The researcher's grant ends; she leaves |
| ✅ | **The lights over Fourtown** | Rivers side (Slim, Moose River) | Sep–Oct | 2–4 | The aurora season fades; the lights stop |
| ✅ | **The Squatch year** | Any (a tabloid's notice) | Whole season | 3–6 | its always open, you have to solve it |
| ✅ | **Singing in the fog** | Border (Little Vermilion, Larch Creek) | Jun–Sep | 4–6 | its always open, you have to solve it |
| ✅ | **The trip not taken** | Any (an old soloist at the dock) | Any | 1–3 | He goes home at the end of the season |
| ✅ | **The ranger crew** | Any (they keep turning up) | Jun–Sep | runs alongside | They rotate out in fall |
| ✅ | **The sled on the lunch rock** | Rivers side | Any | 2–3 | Never (a quiet thread) |
| ✅ | **The freeze-up run** | Gentle side (Farm, Hog Creek) | Late Oct–Nov | 1–2 | The ice wins |
| ✅ | **The long stay** | Any | Any 30 days | 1 long trip | It's yours: start it when you want |

**The raspberry bear.** A bear on a chain of lakes has learned that campers mean food. A ranger's notice, then a party
with a torn pack and a story that grows. The parties on that chain are the witnesses: the schedule knows who camped
where, so its raids happen at real parties' real sites and you find them on their route to ask. Signs at sites
(claw marks on a hung pack, scat full of raspberry seeds, a dragged barrel) give its range and hours. Set pieces: a
night watch; a pack taken while you're on the far end of a portage; a family who left food out. Choice: document it
for the ranger (relocation, at a site you pick), or work the chain teaching camps to hang food so it gives up. Its
fate depends on how many camps fed it, yours included. Uses `bear.js`, `parties.js`, the camera.

**Where the wolves live.** A researcher asks for help placing a pack's range: howls at three, tracks on beaches, a kill
site, pups in August. The quietest one: no villain, just distance and patience. Needs the PMA permit for the last
part. Choice: what you tell people about the den.

**The lights over Fourtown.** Campers report blue-white lights and a lake that "feels off". Nights, the camera and a
calendar of sightings. Most of it is explained (the aurora, satellites, a hermit's lantern, foxfire). One thing
isn't. Settler camp lore only (see the rules below).

**The Squatch year.** A Duluth tabloid pays for photos. Every keeper has a theory and every party a night noise. Each
lead has a real explanation the camera finds: a moose in the willows, a bear on its hind legs, a pine marten, a loon at
2 am. At the end, one photo you can't explain, and whether you sell it. The forum's favourite joke.

**Singing in the fog.** On Lac La Croix at dawn, French voices and a canoe song come out of the fog, and four big
canoes pass that you never catch. A logbook page at a portage leads east along the voyageur route: Loon Falls,
Curtain Falls, the Basswood falls, Prairie Portage, Knife Lake, toward Grand Portage. Reenactors, or not. Never
settled. Proof: the logbook, filled in as you go.

**The trip not taken.** An old soloist at the dock can't go this year. He asks you to paddle his route and bring back
photos of five places on his list. Quiet; probably the most moving small piece.

**The ranger crew.** The same two rangers keep turning up all summer. Three meetings, a favour each, a name, and in
fall they ask you to do one of their last checks.

**The sled on the lunch rock.** An old snowmobile sled and window frames on a rock. Asking rangers, keepers and old
trippers builds up a trapper's winter route and a cabin clearing.

**The freeze-up run.** Two retired guides bet you can't make the last trip of the year. Snow on gold birch, a bull
moose with frost on its rack, skim ice broken with a paddle handle, lakes closing behind you.

**The long stay.** Go in and stay 30 days with one resupply. The project is yours (a bird list, a photo series, fifty
lakes, every species). Little story, real weight: the solo trip report as a game.

**Folded into the main story instead:** "the people who lived inside" (the resort ruins and the hermit's island) is
now chapter 2 of Walt's story.

**Event years, for DLC (not in the base game):** the fire year (a Pagami-shaped fire moving with the daily wind,
closed entry points, warning real scheduled parties in its path) and the flood year (record high water, an overdue
solo on a river route). Each is an overlay for one year; only the memories carry on.

### Rules for every story piece

- **Read the world, don't collect markers.** Clues are tracks, a torn pack, a party's story that doesn't add up, a
  view that matches an old photo. The book gets a page that links what you know (the *Outer Wilds* log).
- **One set piece per trip,** built from the systems: wind, night, cold, water, a carry.
- **People move and remember.** Scheduled parties are witnesses who are somewhere else tomorrow.
- **Danger from the place,** never a fail screen for leaving the path.
- **No Ojibwe beings or sacred places as horror. No Wendigo.** The strange stays settler camp lore. If Ojibwe stories
  ever come in, it's with Ojibwe people, not from us. Real disasters by their shape, never real victims or names.

## 3. The main story: Walt's box

✏️ The whole thing for sign-off. All names are made up.

**The premise.** Walt Haapala guided out of your home outfitter for fifty years. This spring he went into the care
home in Ely and gave his kit away. In the stuff sack are his journals: one small notebook a year, 1962 to 2019,
written in his own shorthand. Lakes have his nicknames ("the Bathtub", "Ma's Lake"), portages are in rods, sites are
stars. His hand-drawn map uses the same names.

**What it's about.** In October 1970 Walt's younger brother Eino went on "the last trip of the year" and never came
back. The search found his canoe swamped on a big lake, and he was called drowned. Walt spent the rest of his life
coming back to it in his notebooks. The truth: Eino had a draft notice. He swamped the canoe on purpose, walked out
across the border into Canada and never came home. Walt found out in 1993 and kept the secret. The page that says so
is torn out.

**How it plays.** Reading Walt's notebooks against the real map. His nickname for a lake plus "40 rods from the
Bathtub, island site, two stars" is a real place you can find. Understanding a page is the reward, and it opens the
next one. The book holds a page for Walt: his names matched to real lakes, the years, the people.

**It moves at your pace and follows the progression.** Each chapter lives in a farther country and a different
season, so the story pulls you through the outfitters and into the shoulders, and never blocks the sandbox.

| | Chapter | Where and when | What you do | What you learn |
|---|---|---|---|---|
| ✏️ | **0. The box** | Home outfitter, the first day | Unpack the box. The keeper tells you who Walt is | Walt guided here for 50 years. The notebooks are hard to read |
| ✏️ | **1. Walt's lakes** | Home reach, early summer | Match his nicknames to real lakes on your first trips. Find his favourite site from his description. Stand where an old photo in the notebook was taken | His shorthand, which unlocks the rest. Walt and his brother Eino, as boys |
| ✏️ | **2. The people who lived inside** | A lake inside the wilderness, summer | Find the ruins of the Haapala family resort: foundations, lilacs gone wild, a rusted bed frame. A party camps there now. An old-timer at another outfitter remembers it | The family lost the resort when the wilderness law bought them out. Eino was angry; Walt stayed and guided |
| ✏️ | **3. The last trip of the year** | Big-water country, fall | Walt's October 1970 entry, then months of blank pages. Paddle the route Eino took, at the same time of year. The rangers' old log, an old search volunteer at another outfitter | The search; the swamped canoe; "drowned". But the canoe was found on the wrong lake for the route Eino said he was taking |
| ✏️ | **4. What Walt found** | Remote country, a primitive area, fall | Walt's 1990s notebooks: he went back to the same place every September. A torn-out page. Follow his last description off the designated sites (needs the PMA permit) | A cairn and a tobacco tin with a note in Eino's hand, 1971: "Don't look for me. I'm not going. Tell Ma I'm sorry." Walt found it in 1993 and kept it secret |
| ✏️ | **5. The other side** | Quetico, late summer or fall | Cross the border on Eino's route. A Canadian lodge keeper remembers "a Finn who came across in '70", who built a cabin and guided for years | Where Eino lived. Whether he's alive is the owner's call (below) |
| ✏️ | **6. Walt's last trip** | Home outfitter, end of a season | Come home with what you know. Walt visits the outfitter one last time (he comes to you; he doesn't paddle) | The ending you choose |

**The ending: what you tell Walt.** ✏️ Pick one, or keep the choice:
- **Tell him everything,** with Eino's note: he learns his brother lived. (If Eino is alive: a letter comes back.)
- **Tell him only what he already knew:** he kept the secret 30 years for a reason, and you keep it too.
- **Say nothing,** and put the notebooks back in the box for the next person.

Whichever you choose, you keep the notebooks. Walt's photo goes on the outfitter's wall, and keepers talk about him
differently afterwards.

**Easter eggs and long-tail.** Walt's two- and three-star sites are all over the map (about 40). Finding them all is a
long collector's thread with a final notebook entry. His old canoe is somewhere. A few pages are about fishing spots
that are still good.

**Length.** Roughly 12–20 trips across 2–3 in-game seasons, about 40–80 real hours alongside everything else. It is
built so you can play it straight through if you want, and it never expires.

**Why this one.** It's grounded (no supernatural), it's real history (the resort buyouts after the wilderness law,
draft resisters crossing to Canada), it uses what the game is best at (the real map, rods, sites, old photos, the
seasons), and it fits the solo, grief and memory themes from the trip reports. The donated gear is both the onboarding
and the hook.

---

## What to build, in order

1. **The permit desk:** permits as items, the calendar (quota minus parties), buying a later date skips to it, day use
   and its fine, PMA. Trips end on exit.
2. **Pickups and drives** by distance: free only within the selling outfitter's own reach, extra beyond it or by another outfitter.
3. **The start map and the onboarding** at the counter, with the gear box.
4. **The trip-end screen** (pay, firsts, milestones).
5. **Fewer outfitters** (about 14), each with a voice, a building, a shelf.
6. **Task limits and deadlines**, the new task kinds; remove the rental-canoe kind.
7. **Walt's story**, chapter by chapter.
8. **Last: the mini-campaign frame** (window, steps, how it ends, the world talks about it), then the raspberry bear
   first. Deferred by the owner on 2026-11-03.

## Research behind this

Two research passes on 2026-11-02.

**Sources (bwca.com):**
- Trip reports: `https://www.bwca.com/index.cfm?fuseaction=trip.report_view&sel_trp_id=<id>`. Read: 8008, 8006,
  2693, 7982, 8014, 8022, 8033, 8038, 8041, 8051, 7687, 5182, 7185, 7839, 5657, 5092, 7298, 5663, 5437, 7024, 4948,
  5611, 5601, 5646, 4886, 4940, 5808.
- Threads: `https://www.bwca.com/index.cfm?fuseaction=forum.thread&threadId=<id>&forumID=<f>&confID=1`.
  - forum 12: 1353366 (strangest thing), 1374836 (the 1999 blowdown), 1357304 (Pagami), 1378965 (Dorothy Molter),
    1374291 (permit history)
  - forum 17: 1123572 (November), 1032326 (Jean Lake sled)
  - forum 120: 827332 (solo thoughts)

**What trippers talk about:** wind-bound days and crossings they regret; midnight squalls; sneaky, comic bears; wolves
at three and tracks in the morning; portages not where the map says; capsizes in high water; fire (Pagami); odd finds;
pictographs ("don't touch, don't tell"); Sasquatch blamed for every night noise; the solo trip as grief, risk and
solitude; Dorothy Molter and the people who lived inside; the voyageur route; September as the insider's month;
November skim ice. Reddit and myccr.com were blocked.

**What games do:** *Dredge* (a calm loop with a creeping mystery tied to when and where you go), *Sea of Thieves*
Tall Tales (handmade stories started from places in a shared world), *Witcher* contracts (board, investigation,
preparation, encounter, twist), *Stardew*'s year, *Outer Wilds*' ship log (information is the reward). Avoid: urgent
story against a relaxed loop, story that locks the sandbox, taking things away, many thin campaigns, over-explained
mysteries, map clutter.
