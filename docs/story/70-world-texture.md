# World texture and ambient talk

How the history shows in the land and in people, and what everyone who is not in a scene says: keepers at their
counters, the parties at their fires, people passing on a carry, the line on a drive card. This is the layer that
makes "the story is everywhere" true without pushing anyone into it.

Canon: `00-owner-decisions.md`, then `01-bible.md`. Voice: `02a-voice-journal.md`, `02b-voice-people.md`. Places:
`03-places.md`. The loop: `../plans/campaigns.md`, `../build/game-loop-brief.md` (streams B and E). The keepers named
here are the fourteen hand-written on `claude/gl-b-outfitters` (`src/outfitters.js` `HAND`); their own chat lines
stay theirs, and the lines below are added to their pools. The boys' store is **Sawbill 38** and the S5
store **Round Lake 51** (bible 10).

This file writes **ambient** talk only. The cast's designed conversations (Tauno's porch, Hap's tour, the reveal at
Little Sag, the dawn lot and the rest) belong to the arc files. Where a cast member appears here, it is a passing line
or a counter line that sits alongside those scenes and never replaces one.

Lines are finished game text unless marked *draft*. Stage directions for designers are in [brackets].

---

## 0. How to read the conditions

Every line carries a condition in square brackets before it. A line with no condition can be said at any time it is
grounded (section 1).

**Story stage** (one track, in order; each includes everything after it unless a range is given):

| Key | Means |
|---|---|
| `S0` | Before night one: the player has Walt's bundle or doesn't, but no notebook |
| `S1` | The notebook is found; Tauno not met yet |
| `S2` | Tauno has stopped the player on a porch (the name "Walt", "BRM fourteen", "crooked") |
| `S3` | The turn: Tauno has said Eino's name. Act II is open |
| `S4` | The midpoint has happened (the camp search; Maggie's note) |
| `S5` | Warned (tier 4): the canoe adrift has happened |
| `S6` | The run (the cans are lifted, until the dawn lot) |
| `S7` | After the ending. Narrowed by `J` (journalist, Walt kept out), `JN` (journalist, Walt named) and `M` (the company's money) |

**Other keys**

| Key | Means |
|---|---|
| `t1`…`t4` | The watchers' tier (bible 6.2), at least this one |
| `north` | The Walt page says "went north" |
| `knows:x` | A fact on the Walt page (`knows:stones` the white-stone pattern, `knows:stations` the station numbers, `knows:N35` that entry understood, `knows:sparky` who Sparky is) |
| `ev:x` / `ev:x@here` | A story event has happened / happened at this store or lake (`ev:wade-bait`, `ev:dan-intro`, `ev:search`, `ev:adrift`, `ev:watchers@lake`) |
| `prop:x` | That story prop exists and is within sight |
| `needs:a,b` | grounding.js ids (`open`, `porch`, `cafe`, `loons`, `bugs`, `colour`, `ice`…) |
| `home` / `!home` | At the player's home outfitter / anywhere else |
| `carrying` | Walt's pack is on the player or on the store floor beside them |
| `visits ≥ n`, `trips ≥ n` | The existing keeper gates |
| `month:` | Calendar month, for seasonal pools |
| `once` | Said once a save, then never again |

`{tokens}` follow the existing templates (`{lake}`, `{site}`, `{rods}`, `{k}`). New tokens from stream E's
`parties.storyOf`: `{lastLake}` (last night's lake), `{tonight}` (tonight's lake), `{nextLake}`, `{windLake}` (a lake
they were wind-bound on, only if `windDay` says so), `{catchSp}` and `{bestIn}` (their best fish, in inches, because
people talk inches), `{seen}` (a seeded sighting in season), `{fromEp}` (the entry point they came in by, said the
way a weekender says it: "the 25").

---

## 1. How talk stays grounded

The owner's rule, and stream E's `grounding.js`: people say only what is true where they stand. The story adds rules
of its own. The lint (`scripts/gl-ground-lint.mjs`) should check all of these.

**1.1 What a line may claim**

1. **On-map things need a fact.** A dock crib, a chimney, a stone on a stump, a sign in a yard, a newspaper on the
   counter: the line needs the prop (`prop:`), placed in the story layer (`src/story-places.json`) or by props.js.
   No line describes a thing the player can walk to and fail to find.
2. **Off-map things are people's lives.** Town (Ely, Tower, Grand Marais, Isabella, Duluth, Atikokan), the Cities,
   the care home, the junction sign, the church basement: people may talk about them freely, as long as the bible's
   timeline agrees. The game never draws them, so nothing can contradict them.
3. **The past is exempt from today, never from the bible.** A line about 1977, 2011 or 2019 is not checked against
   today's weather (grounding.js `OTHER_TIME`), but its dates, winds and names must match the bible's timeline.
4. **A party says only what its trip was.** A party's lakes, sites, fish, wind-bound days and sightings come from
   `parties.storyOf`. A party that never camped on a lake does not talk about it.
5. **The watchers are seen only where they were.** "Two fellas in a green Kevlar" is said only by a party whose
   stays crossed a watcher placement that day (`ev:watchers@lake`), or by Josie relaying the canary trap (bible 5.7).
   Nobody invents a sighting.
6. **The player's own story is told back only as it happened.** "Somebody's camp got gone through" needs `ev:search`,
   and the teller must be someone the schedule had near that site that day. "A canoe adrift" needs `ev:adrift`.
7. **The gear is talked about only when it is there.** Lines about the pack or tent need `carrying` (or, for the
   tent, the tent pitched in sight).
8. **Store rules apply.** No pictures on store walls unless a story prop puts one there (Walt's photo at Moose Lake,
   journalist ending only; the framed 1949 chart at Round Lake 51, S5). A porch line needs a porch; a café line needs
   a café (section 10 lists where that bites).

**1.2 Who may know what**

| What | Who may say it in ambient talk |
|---|---|
| Walt drowned on Birch in October 2019; "swamped, no paddle"; "no foul play" | Anyone who lives up here; weekenders only if a keeper told them ("the guy at the outfitter said") |
| An Ely guide; guided out of Moose Lake, Fall Lake, Sawbill, worked the Hog Creek counter | Old hands, keepers who were around then |
| Boreal: the 1970s drill outfit out of Ely | Old Ely hands, **from `S2`** (before that: "a crew stencil") |
| "A Finn kid drowned on Bald Eagle in '77" (no name) | Old-timers only, any stage, rarely |
| Eino's name | **Nobody in ambient talk.** Only Tauno, Aili and the papers (bible 3) |
| Northmark, the Kettle project, the open house, "the decision this winter" | Anyone. Locals say "the company" |
| Dan Marolt by name | Anyone local; he coaches hockey |
| Carl Brekke by name | Ruth, from `t2`, because he eats at her café |
| Wade Helstrom by name | **Nobody in ambient talk.** Keepers describe him ("clean truck", "boots that never saw a portage"); his name comes from Marlys's register, the guest book, Sheila and Denny |
| The cellar, the cache, the camp, the far end, Gull's east bay, the flowage, the cans | **Nobody, ever.** Not even as a guess |
| That Walt lived | **Nobody**, until `S7 JN`, and then only as what the paper printed |
| Denny as the informant | **Nobody**, ever, in ambient talk ("somebody talks" in general only) |
| Who killed Eino | **Nobody, ever.** No guess, no hint, no "they say it was" |

**1.3 What ambient talk may give**

- It may **confirm the easy nicknames** (the Front Porch, the Kek, Four Towns, Little Sag) with a ring, as the bible
  lets any keeper.
- It may **point at the doors the bible opens**: after `S3`, keepers ring Farm, Moose Lake, Sawbill and Little
  Vermilion when asked. Before `S3`, nobody sends the player to a person.
- It may give **small findings**: a Walt trace in a keeper's reach, a story about a ruin, a sign to read.
- It **never gives a lock key** (bible 5.2), never rings a story place that isn't public, and never says "go there
  next".

**1.4 Lines reserved for one speaker**

These belong to one mouth. The lint fails them in any other pool: "Swamped, no paddle" as a *question* (only the boys);
"Page two" (Sheila); "He liked October" (Hap); "Lot of country up here. Easy to get turned around." and "Long way from a
site" (Wade); "Old paper burns" (Brekke); "Same men, new letterhead", "Clean Boots", "the ring", "the door", "the back
door", "the far end", "the cellar", "the camp" (Walt's notebook only); "Mining's not the problem. Men are the problem."
(Tauno); "I need paper." (Maggie); "If you're not going to need it" (Josie, once); "Walt's rule" said as a rule (the
boys and Carol; others may say "I heard there's a rule").

---

## 2. History in the land

What the player can walk to. Each era leaves small, physical things, almost all of them on real ground and almost none
of them labelled. The dot gives a plain name, nothing more ("items never say their use"). Where a thing gets one
thought line, it is the first time only, and it is the player's own thought, never a lesson.

The props below are proposals for the story layer (`src/story-places.json`, keyed by name and x/z). The ones from the
bible and `03-places.md` are marked **(bible)**. The rest are new texture; builders confirm each place in v9 and drop
any that collide with a site, a portage or a real named historic site the game should not touch.

### 2.1 The fur-trade road (1730s–1800s)

Nothing to pick up. The border chain is the voyageurs' road, and old hands say so on the carries. No prop: the
portages themselves are the ruin.

- [on Height of Land, Prairie, Curtain Falls, the Stairway; old-timer parties, Canadians] "Voyageurs carried two packs
  over this. Ninety pounds each. And sang." / "They'd have done this one twice before you finished your granola."

### 2.2 Logging (1890s–1970s)

| Prop | Where | Dot | Notes |
|---|---|---|---|
| **The rail grade** | The Four Mile Portage, Fall Lake to Basswood: dead straight, raised, a few ties rotted into the tread, one rail spike in the gravel | *Rail spike* | Ruth already says it's an old railway bed. Real history; the prop is three spikes and a culvert of laid stone where a creek crosses |
| **Cable on a stump** | A big white-pine stump on a point, steel cable bitten into the wood, on two or three lakes of Norm Kovach's country (the Isabella side) | *Old cable* | The Pagami country was logged into the 1970s. Norm talks about it |
| **A sleigh road** | A straight, grown-in cut between two bays, birch all one age | — | No dot; it reads only to someone who has done S8 |
| **The Rose Lake grade** | Near the Stairway Portage, a raised bed going nowhere in the cedar | — | Gunflint logging rail, stopped by 1929. Lise reads about it on a plaque somewhere and gets it a little wrong |

### 2.3 The resort coast and the buyouts (1920s–1960s)

The richest layer, and the one that hurts locals most. Every ruin is somebody's grandmother's.

| Prop | Where | Dot | Notes |
|---|---|---|---|
| **Mummo's (bible)** | Basswood, the Inlet Bay shore past P194: stone step, foundation, lilacs, rhubarb, a rusted bed frame, dock cribs seen from the canoe | *Stone step*, *Lilacs* | S7. The family's |
| **The chimney in the birches** | A second Basswood shore, well away from Mummo's: a fieldstone chimney standing alone in thirty-year birch, a cast-iron stove door in the moss at its foot | *Chimney* | A bought-out lodge. Nobody names whose. Retired locals tell it as "a family from town" |
| **Dock cribs** | Three or four shores on Basswood, Crooked and Lac La Croix's US side: square timber cribs filled with rock, a metre under, visible on a calm bright day | (from the canoe) *Old crib* | Uses the water-clarity system, like S5 |
| **A ring bolt** | Rock at the chimney's shore: an iron ring set in the stone where floatplanes tied up | *Iron ring* | The airban, by shape only |
| **China in the fire ring** | A designated site near an old resort: a shard of blue-and-white plate in the ashes | *Shard of china* | Kids find it. Families talk about it |
| **Rhubarb** | At two or three old cabin sites (with or without a chimney) | *Rhubarb* | "Nobody planted it in sixty years." In season (May–June) only |

**Dot thought, once, at the chimney:** *Somebody built this to last.*

### 2.4 The airban (1949–52)

| Prop | Where | Dot | Notes |
|---|---|---|---|
| **The plane on the Kek (bible)** | Kekekabic's north shore, 12 ft down | — | S5. The pilot swam out; nobody died |
| **A fuel drum** | Rusted through, on a ledge at the ring-bolt shore | *Old drum* | Resort fuel for the planes |

### 2.5 Mining

**Iron, the 1880s–1960s.** Off the wilderness, mostly. In talk it is the Pioneer (Ely), Soudan (Tower), Babbitt's
taconite, Atikokan's mines across the line. On the map:

| Prop | Where | Dot | Notes |
|---|---|---|---|
| **Old test trench** | The Gunflint iron edge near Paulson Lake: a rock dump grown with birch, a hand-drilled hole in a ledge | *Drill hole* | Real 1890s ground. Texture only, no story. Keeps the Gunflint from feeling like the mining story is only Ely's |

**Boreal, the 1970s (bible).** The crews' ground. All of it is fiction on real ground.

| Prop | Where | Dot | Notes |
|---|---|---|---|
| **The crews' landing** | Bald Eagle west shore (−25825, 29925): a rotten crib dock, a winter-road grade going south-west | *Old crib*, *Road grade* | 1.2 |
| **The 1977 blaze** | On the grade: an axe blaze with a dab of orange, and on it a strip of fresh pink flagging | *Blaze*, then *Flagging* | The flagging is Northmark's; nobody's survey explains it |
| **Two Stump** | Gabbro, the drill-road landing: two cut stumps, birch "thick as my wrist" on the old road | *Stumps* | N13 |
| **Casings and core racks** | Along the crews' winter-road grade toward the west pads; builders set its x/z after the real-deposit check (bible 10) | *Pipe*, *Rack* | Casing pipe standing out of the moss; rotted racks |
| **Leo's lid** | At the Kettle pad: a core-box lid with LP stamped in it | *Box lid* | Mary's favour |
| **The Kettle pad** | Outside the wilderness, south-west of Bald Eagle: the 1976 trench, the stockpile, the creek below running faintly orange after rain | *Trench*, *Rock pile* | Builders set its x/z after the real-deposit check (bible 10) |
| **The wrong hill (bible)** | Pietro north-east shore: a grassed-over 2018 dig, rotten survey flagging, a snapped shovel blade | *Old dig*, *Shovel blade* | |

**Northmark, today.**

| Prop | Where | Dot | Notes |
|---|---|---|---|
| **Access sign** | The Little Gabbro (EP 33) trailhead lot: a small brown sign, *Northmark Metals · Kettle Project · Survey Access*, and a padlocked gate on a spur road | *Sign* | Outside the wilderness. The only company sign on the map |
| **Sample stations** | The Kettle creek: numbered steel stakes, a sample bottle in a mesh bag tied to one | *Stake* | Tasha's crew; numbers are new, not the 1976 ones |
| **Survey stakes** | `S7 M` only: pink-taped stakes along the Little Gabbro road and the Kettle creek | *Stake* | The money ending, next season |

### 2.6 Fire and storm

These are in the game's burns layer already. Props only where a story needs them.

- **Pagami Creek, 2011** (the Gull knob, the Rock Island end of the run, Insula): head-high jack pine thicket, charred
  stumps, rock bared to the top. Old hands call it "Pagami" or "the year it burned to Insula".
- **Ham Lake, 2007** (Seagull, the Round Lake reach): blueberries everywhere. Arvid's first cabin went in it (his past
  says so; off the map).
- **The 1999 blowdown**: only where the data draws it. If the world has no blowdown layer, people may remember it but
  no line points at blown-down timber in front of the player.

### 2.7 The story's own traces (bible)

| Prop | Where | When it shows |
|---|---|---|
| White stones on stumps | Walt's ~40 starred sites (all set before June 2018), none within 2 km of Gull's landing | Always; noticed only by someone looking |
| Gene's paddle | Frost (C1125), where Walt left it in 2017 | Always |
| The sled on the lunch rock | Insula, "the Kitchen" | Until Tom's crew hauls it in September (S8) |
| June's pot | Alice Lake, 8 ft off the beach rock | Calm clear days |
| The Isabella watchers' camp | A site on the river: old flagging, a coffee can of butts, a lashed antenna sapling, a 2019 Ely fuel receipt | Always (2019's leftovers) |
| The Birch alders | South shore near (−13700, 4150): a white cobble in the shallows, a cut rope end on an alder | Always; read late |
| The Carp-end stone | Carp Portage, Ontario end: a small stone pile Danielle took for a cairn | Always (Quetico permit) |
| Walt's photo | The Moose Lake store wall | `S7 J`/`JN` only |
| The Ledger on the counter | Every store's counter | `S7 J`/`JN`, the two game weeks after the story breaks |

### 2.8 Pictographs

North Hegman's cliff (no side story; S10 is blank on purpose). A site only: no text, no meaning, no dot thought. The keepers' one line ("Don't touch
them.") is Joanne's at Slim 6.

---

## 3. Yard signs and the drives

### 3.1 The signs

The Kettle project's signs are the region's live wound, in miniature. They are fictional, tied to the fictional
project, and never echo a real campaign.

| Sign | Look | Words |
|---|---|---|
| For | Blue board, white letters, on wire legs | **KETTLE — YES** / Good jobs. Our rules. |
| Against | Green board, white letters, on wire legs | **KETTLE — NO** / The water runs north. |

Rules: a sign is a prop in a yard, on a mailbox post or a woodshed. Nobody quotes a sign in conversation; they say
"saw your sign" or "you know where mine is" (02b 3.4). No store has a sign in its window: keepers who have one keep it
at the road, the house, the woodshed. Signs show no wear by stage; they change only at the endings (3.3).

**Who has which (on the map):**

| Where | Sign | Why, in a line they'd say if asked |
|---|---|---|
| Trout Lake 1 (Hal) | YES, by the road | "My dad's dad was underground at Soudan. I'm for anything that keeps the school open." |
| Bog 67 (Norm) | YES, nailed to the woodshed | "Thirty years in the woods. A paycheck's a paycheck." |
| Slim 6 (Joanne) | NO, at the end of the drive | "My dad was underground at the Pioneer. He'd hate this one. It's not the mining, it's where." |
| Skipper & Portage 49 (Inga) | NO, on the mailbox post | "My husband's for it. My sign's against. We have one mailbox. We manage." |
| Everyone else | none | (their reasons are in section 8) |

Off the map, in talk only: Bob Tervo's NO in Tofte; Frank Kosir's YES in Ely; Northmark's own sign at the junction in
Ely ("the new sign"), lit at night.

### 3.2 The drive card

Each drive (stream B's wait card) carries one line of road texture under the route, seeded by the road and the stage.
It is the only place the player "sees" the towns. Never more than one line a drive. [Needs a line slot on B's ride
card; see section 10.]

**Any stage**

- *Through Ely:* "Past the junction: the company's sign, lit, with a flower bed somebody keeps up."
- *Through Ely:* "Main Street. Canoe racks on half the cars, bait signs, a church supper on a sandwich board."
- *The Fernberg:* "Mailboxes. A KETTLE — NO on a canoe rack, a KETTLE — YES on the next post."
- *Highway 1 past Babbitt:* "The plant's lights, then three blue signs in a row, then a green one, then a blue."
- *Highway 1 to Isabella:* "Forty minutes of spruce. A logging truck, empty, going the other way."
- *The Echo Trail:* "Gravel and curves. A grouse in the road. No signs for twenty miles."
- *169 to Tower:* "The old headframe on the ridge at Soudan. The lake to the left all the way."
- *The Crane Lake road:* "A bar with motorboats on trailers out front. Not one sign about anything."
- *The Gunflint Trail:* "The '07 burn near the end of the Trail, jack pine head-high now, and lodges with their
  lights on."
- *The Sawbill Trail:* "Birch, gravel, a hand-painted board: CRAWLERS."
- *The Arrowhead Trail:* "A long gravel road. A moose in the ditch, or a stump that looks like one."
- *Forest roads (Hog Creek, Bog, Homer):* "Washboard. The truck rattles like it's telling you something."

**By stage**

- [`t2`, any road out of Ely] "A pickup behind you from town to the turnoff. Clean. It goes on past."
  [Only on a drive that starts at a store where `ev:wade-bait@here` has happened; once a season.]
- [`month:8`, through Ely] "A banner on the café: Northmark Open House, Farm Lake, Saturday. Free coffee."
- [Story override, `32-the-boys.md` 5.7: `t2`, Frank met, a drive through Ely between 21:00 and 05:00; once]
  "Northmark's lot under the lights. Frank, in the grey shirt, at the office door with a man in a clean coat. The man
  is doing the talking." It replaces that drive's road line.
- [`S5`, to the player's put-in] "A truck in the lot when you pull in. Engine running. Nobody gets out." [This is
  the tier-4 truck the bible puts in every lot; the card only names it.]

**After the endings**

- [`S7 J`/`JN`, the two weeks after the story breaks, through Ely] "Every gas station rack from Ely to Isabella has
  the Ledger on it this week."
- [`S7 J`/`JN`, any season after] "The company's sign at the junction. Still lit. The flower bed's been weeded."
- [`S7 M`, through Ely] "Frank Kosir's yard: the sign's down. Just the two wire legs."
- [`S7 M`, to Little Gabbro, next season] "New survey stakes along the Little Gabbro road. Pink tape on every one."
- [`S7 M`, to Little Gabbro, next season] "A drill rig's noise, somewhere south, before you even open the door."

### 3.3 What the endings do to the signs

| Ending | Signs |
|---|---|
| J / JN | Nothing comes down. "Now it's a fair fight." Frank's YES stays up |
| M | Frank takes his YES down (seen on the drive). Joanne's and Inga's NO stay. Norm's stays: he never reads the paper |

---

## 4. History in people

### 4.1 Each keeper's piece of history

So the keepers don't all tell the same past, each has one real public event they allude to, by its local name, once,
and never explain.

| Keeper | Their history marker | A line |
|---|---|---|
| Ruth Aho (Farm 31) | The buyouts | "Half of Lake One's shore was cabins once. Then the government came round with a chequebook." |
| Gus Lindgren (Moose Lake 25) | The motors / the Sag tow | "Before the bill the tow on Sag ran clear up the lake. After, we stopped at American Point where they told us. Still do." |
| Bev Kangas (Sawbill 38) | The cans ban | "The year they took the cans away, every Scout troop in Minnesota rewrote its menu at my counter." |
| Arvid Strand (Round Lake 51) | Ham Lake | "The fire in '07 came up the lake in an afternoon. The blueberries were back the next August. I wasn't." |
| Lise Thibodeau (East Bearskin 64) | Reads history, gets it slightly wrong | "Did you know there was a railroad up here? Like a real one. I read it on a sign. Or a placemat." |
| Leon Zupancic (Moose River North 16) | Permits and rules | "I issued the first permits on this road by hand. Carbon paper. Nobody read them either." |
| Hal Vukelich (Trout Lake 1) | Soudan, the resort | "My folks ran the resort when the road was gravel. Grandpa was underground at Soudan. Both of those are gone." |
| Joanne Perko (Slim 6) | The Pioneer | "The spring the Pioneer shut, half my class moved to the Cities. I stayed and became a nurse. Somebody had to." |
| René Belanger (Little Vermilion 12) | The border | "My family's been on both sides of that line a hundred years. The line's newer than we are." |
| Myrna Sether (Hog Creek 36) | Pagami | "The fall of Pagami we had smoke in the post office for a month. People mailed letters that smelled like a campfire." |
| Merle Ostrom (Homer 40) | Water levels and dams | "They wanted to dam the whole border once. Before my time. I've measured what they'd have drowned." |
| Inga Bratvold (Skipper & Portage 49) | The blowdown | "The Fourth of July in '99 the sky went green over Poplar. My husband was on the roof. I've never let him forget it." |
| Norm Kovach (Bog 67) | The mill | "The winter the mill shut I made a tumpline. That's the whole story. It's a good tumpline." |
| Thea Lundeen (John 69) | None of her own | "Everybody up here has a year that's their year. I don't have one yet. I'm hoping for a nice one." |

### 4.2 The phrases of the country (story-safe)

These run through every pool. Spread them; never stack two in one line.

| Phrase | Who | How |
|---|---|---|
| "They found his canoe." | Anyone who lived here in 2019 | The answer to "did he drown?" A narrower answer than the question |
| "Swamped, no paddle." | Locals | Quoted with a little distance, the way you quote something you never believed |
| "No foul play." | Locals | Said flatly, then something about the weather |
| "The year they found the canoe." | Locals | 2019 as a date: "the fall of the canoe" |
| "When the drill crews were out." | Old Ely hands | The 1970s |
| "The outfit", "the office" | Old crewmen and their wives | Boreal |
| "The company" | Everyone | Northmark. "Northmark" only from young people and its own staff |
| "Before the bill" | Old-timers | Before 1978 |
| "When they bought out the resorts" | Old-timers | The 1950s–60s |
| "Pagami", "the year it burned to Insula" | Ely side | 2011 |
| "Walt's bunch", "the fellas he tripped with" | Anyone who knew of them | The boys |
| "His brother" | Old-timers | Never the name |
| "Somebody talks. There's always somebody talks." | Old-timers, of any small town | General, never pointed |

### 4.3 Old grudges

Small, old, and between decent people. A grudge surfaces as a counter chat line after `visits ≥ 3` and is the same
person's for the whole game. The other side gets its say if the player mentions the first. None of them bear on the
mystery; they are there so the country has a past that isn't Walt's.

**Hal Vukelich (Trout Lake 1) and Leon Zupancic (Moose River North 16): the motor.**
- Hal: "Leon wrote my dad up in '84 for a twenty-five horse on the wrong side of a line nobody could see. Dad was
  seventy-one. He paid it in ones, at the counter, counted out slow so Leon had to stand there."
- Leon: "Hal's father had a twenty-five on a ten-horse lake, half a mile past the sign. I wrote what I saw. I'd write
  it again. I also went to the funeral."

**Norm Kovach (Bog 67) and Merle Ostrom (Homer 40): the landing.**
- Norm: "Ostrom shut a landing of mine in '97 for silt in a creek. He was right. I've never forgiven him for being
  right."
- Merle: "Norm's creek ran brown for eleven days. I have the readings. He sends me a card every Christmas anyway. It
  says 'Still brown.'"

**Inga Bratvold (Skipper & Portage 49) and Ely: the Trail.**
- Inga: "Ely people think the Boundary Waters is a suburb of Ely. We're very polite about it on the Trail."
- [Any Ely-side keeper, if the player mentions it] "The Trail people think they invented lake trout. Let them. They
  had to invent something."

**Joanne Perko (Slim 6) and Norm Kovach (Bog 67): the signs.**
- Joanne: "Norm nailed his sign to the woodshed so the wind can't take it. Mine's on wire legs. Mine's fallen over
  twice. I put it back up both times. That's the difference between us."
- Norm: "Joanne patched my hand in '89 when I put a saw in it. Didn't charge me. I'd vote however she wanted on
  anything but this."

**Myrna Sether (Hog Creek 36) and everyone: the mail.**
- Norm: "Myrna knows what everybody in Isabella got for Christmas since 1983. Never said a word. That's worse."
- Myrna: "Thirty years at the post office, you learn what people send and you learn to forget it by suppertime."

**Ruth Aho (Farm 31) and the company: the dining room.**
- Ruth: "They rent the dining room for the open house in August. Pay on time, tip the girls, put out free coffee,
  which annoys Deb, because it's her coffee."

**René Belanger (Little Vermilion 12) and the Quetico rules.**
- René: "Thirty years the Remote Area permit worked fine. Now you check in like it's an airport. Not my idea either."

**Arvid Strand (Round Lake 51) and Pete Haldane (the diver).** [Only while S5 is open.]
- Arvid: "Pete wants that plane on the Kek. Thirty years he's wanted it. He'll get there one of these summers and find
  out it's a plane."

**The cast's grudges** (for the arc writers; ambient here only where marked):
- **Tauno and Len.** They don't sit together at Farm. [Ambient, `S2`+, Farm porch, mornings, if Len is at the café]
  Tauno: "That's Len in there. We were on the crews together. He was always friendlier than me." [That is all he says
  about Len until the arc gives more.]
- **Mary and Thursdays.** Mary comes Tuesdays and Fridays. [Ambient, Farm café, Fridays] Mary: "Thursdays are
  crowded." [Brekke's day. She never says so.]
- **Bob and Frank, the signs.** [Ambient, the boys' camp] Bob: "We don't do the mine at the fire. That's the rule
  since 2016." Frank: "That's his rule. I just follow it because he's older."
- **Ollie and the sheriff's office.** [Ambient, the Stuart Portage, third meeting on] Ollie: "I gave a statement in
  '77. They wrote down the half they wanted."
- **Sheila and Wade.** Never ambient. Her one line about him is the arc's.
- **Aili and the town.** [Ambient, any Crane Lake visitor, `S3`+] "Aili Niemi doesn't come to church suppers since her
  brother's memorial. People signed the book she didn't know."

### 4.4 Josie, at the home counter

Josie is at whichever outfitter the player picks. Her ambient lines run underneath the arc; her canary-trap reports
and the postcard are the bible's.

- [`S0`, `carrying`] "That pack's going to outlive both of us."
- [`S1`, first visit after night one] "How'd the old tent do? Did it leak? It looks like it leaks."
- [`S1`, asked whose it was] "Honestly? No idea. It was on the shelf when I started. Before my time. Ask the boss,
  but he'll say the same."
- [`S2`] "Did that old guy on the porch talk your ear off? He does that. He's nice, I think. He tipped me a dollar
  once for a coffee that cost a dollar."
- [`t1`, `ev:dan-intro`] "Dan from the company was asking if you were around. I said you're always around. Was that
  okay? You are always around."
- [`t2`] "You get a lot of mail for somebody who doesn't live here. Kidding. You get none."
- [`S4`, any visit] "You look like you didn't sleep. Was it the loons? It's always the loons."
- [`S5`] "Somebody's parked in the lot every morning this week. Not a customer. I checked."
- [`S7 J`/`JN`] "You're the canoeist in the paper. Everybody knows. I said 'what canoeist' to like nine people."
- [`S7 M`] "The boss says I'm not supposed to give you the good canoes anymore. I don't know why. I'm giving you a
  good one."

---

## 5. Asked about Walt, or shown the notebook

### 5.1 The topics

- **"Ever hear of a guide called Walt?"** appears with any party or local once the player knows the name (`S2`).
- **"Look at this."** (show the open notebook page) appears with parties and keepers from `S1`. It shows the page the
  player has open in the book. Reactions are keyed on what is on that page (5.4), not on the story.
  - Not offered on the last page: the player keeps that one to themselves. [No refusal line; the topic is just absent.]
  - Not offered to Len, Dan, Wade, Brekke or the watchers. (Len and Dan are known to work for the company, so its
    absence tells the player nothing they couldn't know; the company never reads Walt's code, bible 11.)
  - Offered to the boys, all three, who refuse it the same way (5.5), so it can never be a tell.

### 5.2 Weekend paddlers

They never knew him. What they have is what a keeper said on their way in, and they are kind about it.

**Asked about Walt**
- "The guy who drowned? The kid at the outfitter said something. A few years ago, right?"
- "No, sorry. We're from Iowa. We don't know anybody. We barely know each other."
- "Is he the one with the rock on the stump? Somebody said an old guide used to leave rocks." [Only at a starred
  site, with the stone in sight: the bible's day beat.]
- "I think I read about that. Old guy, alone, October. My mom sent me the link and said 'see?'"
- "Walt? Is he a ranger? We met a ranger. He was very nice. He asked about our food."
- [`S7 J`/`JN`] "Oh, the paper thing! Are you the canoeist? You are, aren't you. Can I get a picture?"

**Shown a page**
- "He wrote in rods? Who writes in rods. Oh. Everyone up here. Okay."
- "This is the most organised thing I've ever seen. My trip journal is just 'tired' and a drawing of a moose."
- "Is that a real lake? Can you look it up? We have no signal. Never mind."
- "That's beautiful handwriting. My grandpa wrote like that. He was an engineer. Everything was in capitals."
- [Partner, quietly] "Babe, it's somebody's diary. Give it back."

### 5.3 Old-timers (keepers, old guides, retired locals, old solos)

They knew of him, or knew men like him. They talk about him like weather: what he did, not what he was.

**Asked about Walt** (anyone old, local, before the cast takes over)
- "Walt Haapala? Ely guide. Good with the clients. Didn't like the owners. Who does."
- "He'd go out alone in the fall. People thought it was strange. Fall's the best part. I thought it was sense."
- "They found his canoe on Birch. That was 2019. Sad business. He was seventy-something."
- "Knew him to wave to. He paddled like he was in no hurry and got there first."
- "His brother drowned too, way back. Bald Eagle, I want to say. Seventies. Same family twice. Imagine." [Old Ely
  hands only, `S2`+; never the name.]
- "Walt? I don't talk about people who can't hear me." [A guarded one; that's the whole answer.]
- [`S3`] "You've been asking a lot about Walt. Small town. People notice what you ask."

**Shown a page**
- "That's a guide's book. Wind first, always. Fish last. Feelings never."
- "NW 15, gusts 25. He knew what he was looking at."
- "Two cups out of habit. Huh." [Says nothing else. Hands it back.]
- "My dad kept one of these. Forty years of them in a coffee can. Nobody's read them. Nobody's going to."
- "He went back and wrote on it later. Different pencil. People do that when they get old." [Second-ink pages.]
- "That's Walt's hand. I bought bait off him for six summers. He wrote the receipts like that." [Only keepers who knew
  him at a counter: Myrna, Ruth.]

**Nicknames** (any keeper confirms the easy ones with a ring; nobody else is decoded)
- the Front Porch: "Lake One. Everybody's first night is Lake One. Guides called it that." [Ring Lake One.]
- the Kek: "Kekekabic. Everybody says the Kek. You'd only spell it out on a permit." [Ring.]
- Four Towns: "Fourtown. Four Towns is what the old crowd on the Echo Trail say." [Rivers-side keepers. Ring.]
- Little Sag: "Little Saganaga. Long day out of Sawbill. Big lake trout." [Ring.]
- anything else: "That's his own name for it. Every guide has a few. Mine are worse." [No ring.]
- "the far end": "The far end of what? Every lake's got one." [No ring, ever.]

### 5.4 Reactions keyed on the page

| The page has | A line (any old-timer unless marked) |
|---|---|
| A rod count | "Hundred and eighty-six rods, and he paced it himself. You can tell. Map says one-eighty-five." [Fill from the page] |
| Bird codes | Weekender: "COLO. Colorado?" Partner: "Common loon. It's a bird code. My aunt does it." |
| A fish with a lure | Angler: "Slow jig on the reef. That's not luck, that's homework." |
| `?` alone on a line | "A question mark. My grandpa did that. Meant he wasn't going to tell anybody, including himself." |
| `0 pty` | "Nobody all day. He liked that. Some people would hate that." |
| "the cellar" | Weekender: "Cellar? Up here? Like a root cellar?" Old-timer: "Some fish camp had a cellar. Lots did." [Nobody makes more of it] |
| "the camp" | "Everybody's got a camp somewhere. That's a cabin, to you." |
| A Finnish word | Old Ely hand: "Löyly. That's the steam. You throw the water on and it bites you. He was a Finn, then." |
| The boys' nicknames | "Sparky, Whiskey, Teach. Sounds like a bunch." [Nobody decodes them but the boys and Carol] |
| June | "June. That'll be his wife. Don't read that one to me." [Hands it back] |
| V. | "V. Somebody he didn't want to write down." |

### 5.5 Kids, anglers, rangers, Canadians

**Kids** (with a family)
- "Is it a treasure map?" *(Parent:)* "It's a fishing diary, honey." *(Kid:)* "So it's a treasure map for fish."
- "Why does he write so small?"
- "He drew a fish! It's a bad fish."
- "Did he die? Mom, did he die?" *(Parent:)* "A long time ago. He was very old." *(Kid:)* "You're very old."

**Anglers and fishing guides**
- "Walt? Best walleye man between here and Insula. Never told a living soul a reef. I respected that and I hated it."
  [Old guides only. Soft, not a key: Insula is the Kitchen, which Hap and Tom decode anyway.]
- "If that book has his spots in it, don't tell me. I'd never fish my own again."

**Rangers** (Tom Becker and his partner, on their route)
- Tom: "Walt Haapala. Before me. They still talk about him at the district office. Mostly about his fire rings."
- Tom, shown a page: "He camped legal. Mostly. Good for him." [Hands it back. "Good camp."]

**Canadians** (Quetico-side parties, Danielle and Gord excluded)
- "We don't get your news over here. Who?"
- "An American guide, alone, in October? We'd have heard if he came through. Unless he didn't want us to." [Only on
  the Quetico side; says nothing more.]
- Shown a page: "Rods. You Americans and your rods. It's metres on this side. Well. It's rods on this side too."

**The boys** (Bob, Frank, Denny; any of them, any time)
- Bob: "That's his book. Put it away. We don't read a man's book. That's a rule older than the first-round rule."
- Frank: "Put that away. He'd come back from wherever he is to kill us."
- Denny: "Don't. I can't. Put it away." [Same refusal as the others, in his own voice. It is not one of his three
  tells and must not read as one: Bob and Frank refuse first, every time the three are together.]

---

## 6. Rumours and barks by story stage

Two kinds: **rumours** (the "Heard anything?" topic at a counter, and a party's "the word is…" at their fire) and
**barks** (a line said in passing, unasked, by a head, the existing barks system). Rumour pools below are added to
`talk-rumours.js`'s week of three; at most **one** story rumour a week per keeper, so the fishing talk stays on top.

### 6.1 Always (the world's long-standing talk)

**Rumours**
- "Old guide drowned on Birch a few years back. October. They found his canoe swamped. No paddle." [Moose Lake's
  reach and Ely side]
- "The company's having its open house at Farm Lake in August. Free coffee and a slideshow. My brother-in-law goes for
  the coffee." [`month:6–8`]
- "The state's supposed to decide on the Kettle thing this winter. They've been supposed to for a while." [Any]
- "A Finn kid drowned on Bald Eagle in the seventies. Ducks, they said. My dad was on the drag line." [Old-timers, Farm
  and Moose Lake; rare]
- "Fella on the Stuart Portage at dusk, every Tuesday, no pack. Says 'evening' and keeps walking. Ollie, somebody
  said. Harmless." [Moose River North; S1's hook]
- "There's a tabloid in Duluth paying for Sasquatch pictures again. Every summer. Somebody always takes the money."
  [S2's hook]
- "The lights over Fourtown were out again last fall. Northern lights, mostly. Mostly." [Slim 6; `month:8–10`; S3]
- "Some grad student at the Moose River post wants to know where the wolves den. Good luck to her." [S4]
- "There's a plane in the Kek. Down by the north shore. On a calm day you can see the red." [Round Lake 51; S5]
- "Somebody found an old bootlegger's box up by Loon Lake once. Nothing in it but bottles." [Little Vermilion; S6]
- "There's lilacs on Basswood where an old fish camp was. June, they come out. Nobody planted them in sixty years."
  [Moose Lake; `month:5–6`; S7]
- "Tom Becker's crew is going to haul that old sled off the lunch rock on Insula. People have opinions." [Moose Lake;
  `month:7–9`; S8]

**Barks** (passing)
- [A retired local on a dock] "Ice went out on the twenty-ninth. I write it down every year."
- [An old solo on a carry] "Evening. Short one, this. Long one's next."
- [A keeper, to nobody] "The decision's 'this winter' again. It's been this winter for three winters."

### 6.2 `S0`–`S1`: the old gear

**Barks**
- [Any keeper, `carrying`, once] "That pack's older than you. Canvas holds up. Just don't get it wet. Or do. It
  stays wet."
- [A weekender in a store, `carrying`] "Is that vintage? That's so cool. Is it heavy? It looks heavy."
- [An old solo on a carry, `carrying`] "You don't see those any more. My first one was like that. Tumpline and all."
- [An old Ely hand, `carrying`, `S0`–`S1`] "That's a crew stencil, on the patch. Somebody's old work pack." [Before
  Tauno, nobody says Boreal.]

### 6.3 `S2`–`S3`: asking around

**Rumours**
- "Tauno Kangas is talking to strangers on porches again. He doesn't do that." [Farm, Moose Lake, home; `S2`]
- "Somebody's been asking about the old drill outfit at Farm. You don't hear that name much." [Any Ely-side keeper;
  `S3`, after the player asked about Boreal at two places; this is tier 1's word]
- "Walt's bunch go in out of Sawbill every August. Second week. Loud. They'll feed you." [Sawbill; `S3`]

**Barks**
- [An old Ely hand, `carrying`, `S2`+] "BRM. That's Boreal. The old drill outfit. Seventies. Where'd you get that?"
  [Region key B, any old Ely hand. Not before `S2`.]
- [Old-timer at a counter, `S3`] "Asking about Walt? Buy the man a coffee first. That's how it works up here."

### 6.4 `t1`–`t2`: noticed, then watched

**Rumours**
- "Fella was asking which way you went. I said I don't know which way anybody goes. That's mostly true." [The keeper
  of the store where `ev:dan-intro` or `ev:wade-bait` happened, the next visit; `t1`]
- "Dan from the company's been at every counter this week. Shaking hands. He's good at it." [Any; `t1`]
- "Party came off {lake}, said two fellas in a green Kevlar were asking after a solo. No rods." [Josie only, and only
  as the canary trap's echo (bible 5.7)]
- "Two men in a green Kevlar camped across from us on {lastLake}. No fire, no rods. Waved like they practise it." [A
  party only, `ev:watchers@lastLake` on that night]
- "Fella bought three dozen leeches and left them on the step. Never seen that in thirty years." [The keeper where
  `ev:wade-bait@here`; never his name]

**Barks**
- [A party on a portage, `t2`, `ev:watchers` on this lake today] "There's another canoe behind us. Two guys. They're
  not in a hurry."
- [A keeper, `t2`] "You're getting known. That's not always a compliment up here."

### 6.5 `S4`: searched

**Rumours**
- "Somebody's camp got gone through on {lake}. Nothing taken. Folded everything. Who folds?" [A party the schedule had
  within sight of the player's site on the day of `ev:search`; at their next fire or at a store]
- "There's a woman in the Hog Creek bunkhouse says she's here to fish. Eleven days and one perch." [Hog Creek and its
  reach; from Maggie's arrival]
- "The company's open house was busy this year. They had a map with colours on it. Everybody stood around it like it
  was a fish." [Farm; after the open house, `month:8–9`]

**Barks**
- [A keeper, the first visit after `ev:search`] "You look like somebody moved your stuff. You've got the face."
- [An old-timer, `S4`] "You're in it now, whatever it is. I'm not asking."

### 6.6 `S5`: warned

**Rumours**
- "Somebody's canoe was loose on {lake} this morning. Paddle gone. They swam for it. In September." [A party near
  `ev:adrift`, or the keeper of the next store; never says it was the player's unless it was told by the player]
- "There's a truck at {ep} every morning. Not a fisherman. Fishermen leave." [The keeper of the player's last put-in]

**Barks**
- [A keeper, `S5`] "Keep your canoe up the shore at night. Way up. I don't know why I said that."
- [A party at dusk, `S5`] "Did you see the light on the point? Somebody's out without a fire."

### 6.7 `S6`: the run

Nobody talks. The world goes quiet: no barks between the cellar and the dawn lot, no party fires on the run's lakes
(the schedule keeps parties off Gull, Pietro, Camdre and Rock Island that night; Clearwater's sites may show a dying
fire far off, and nothing else). The only voices are the scanner and Wade.

- [The dawn lot, the loading party only] "Early start?" / "You look like you paddled all night." / "Have a good one."

### 6.8 `S7`: after

**J and JN (the papers to Maggie)**
- Rumour: "Did you see the Ledger? Some canoeist found papers in the woods. The old drill outfit faked its water
  numbers. Nineteen seventy-six." [Any; the two weeks after the story breaks]
- Rumour: "Carl Brekke's out at the company. 'Health reasons.' Sure." [Farm, Ely side]
- Rumour: "The Forest Service is closing up that old trench by Bald Eagle. About time." [Farm, next season]
- Rumour: "They're redoing the company's water work. Honest this time, they say. Tasha Strand's crew." [Farm, Bog,
  Hog Creek; next season]
- Rumour: "The sheriff opened the old file on the Bald Eagle kid and shut it again. Insufficient something." [Old
  Ely hands]
- [JN only] "The paper says the old guide didn't drown. Faked it. Went north. People are saying he's a hero. People
  are saying worse." [Any; never more than what the story printed]
- Bark: [A party, if the player is recognised] "Hey, are you the one from the paper? My dad says thank you. My uncle
  says something else."
- Bark: [A keeper who liked Walt] "Good. That's good."

**M (the company's money)**
- Rumour: "Somebody sold the company some old papers. Maggie Tomczak wrote about it like it hurt."
  [Any; the two weeks after her column]
- Rumour: "They got their permit. Drill rigs at Little Gabbro next spring." [Farm, Ely side; next season]
- Rumour: "Frank Kosir took his sign down. Twenty years he's had a sign. Wouldn't say why." [Ely side]
- Bark: [A keeper who liked Walt, cool] "Board's empty for you today." [The bible's dropped tasks; said once, then
  the board just has none]
- Bark: [A weekender] "Somebody said you're rich now? You don't look rich. No offence."

### 6.9 The seasons' story talk

- [`month:5`] "Walt used to put in at Lake One the first week the ice was off. Every year. You could set a clock."
  [Ruth; old-timers]
- [`month:8`, Sawbill] "Walt's bunch are in. Second week of August, like always. Three of them now."
- [`month:10`] "October. Walt's month. Everybody's home but him." [Old Ely hands, `S2`+]
- [`month:11`] "Last trips. Skim ice in the bays by the twentieth. People who go out now know why they're going."

---

## 7. Scheduled parties at their fires

What the people at a site say when the player paddles up and talks (E on the dot at a figure). The greeting and the
trip talk come first; the story talk is **one line at most per visit**, and only if the party's kind would have it.
Every trip line reads `parties.storyOf`.

### 7.1 Every party: their trip

- "We came in at {fromEp} on Saturday. Last night was {lastLake}. Tonight's this." 
- "We were wind-bound a day on {windLake}. Played cards. Someone lost a lot of M&Ms." [Only with `{windLake}`]
- "Best fish so far was a {catchSp}, {bestIn} inches. Don't ask who caught it. It wasn't him."
- "Saw {seen} this morning. Just stood there. We just stood there. Nobody did anything for a minute."
- "Tomorrow's {nextLake}. Is the carry bad? Don't tell me. Tell me after."
- "Sites were all taken on {lastLake} by four. We paddled till six. It was fine. It was not fine."

### 7.2 By kind

**Weekenders (2–6, the Cities, Chicago, Iowa, Madison)**
- "We have a spreadsheet. Day three has a column called 'feelings'. It's empty."
- "Somebody at the outfitter said 'a little breezy'. We are learning what that means."
- "We've been planning since January. Now we're here and nobody wants to leave the site."
- [Mine talk, rare] "There's signs all the way up from Ely. Yes, no, yes, no. Like a wedding where the families
  don't get along."
- [Walt, `S2`+, if asked] "The guy who drowned? We heard. That's so sad. Alone, though. That's the part."
- [`S7 J`/`JN`] "Did you see the paper? Somebody found the old company's stuff in the woods. With an old guide's
  tent. That's like a movie."

**Families**
- *(Kid)* "We found a square nail by the fire ring. Mom says it's history. I think it's a nail."
  [Only at a site near an old resort, `prop:china` or a cabin site]
- *(Parent)* "My dad brought me up when I was ten. Same lake. The site's smaller than I remember. Everything is."
- *(Kid, `prop:rhubarb` near)* "There's rhubarb in the woods! Who planted rhubarb in the woods?" *(Parent:)* "People
  who lived here. Before."
- [Walt, `S2`+] *(Parent)* "I think the outfitter said something about an old guide. I was counting children."

**Scouts and church groups (with a guide)**
- *(Guide)* "Nine of us and four canoes. That's the rule. The rule doesn't say they have to be quiet."
- *(Guide, an old hand)* "I took my first crew out of Moose Lake in '88. Walt Haapala was on the counter. He sold
  us a map and told us which half of it was wrong." [`S2`+; the guide is an old local by look]
- *(A teenager)* "Is it true there's a Sasquatch? The guide says no but he says it like there is."

**Anglers**
- "They're on the reef at dusk. That's all you get."
- "Thirty years we come up the same week. Same site, same reef, same argument about the reef."
- [Walt, old pair, `S2`+] "Walt? He'd sit in his canoe on a reef and not fish. Just look at the water. You'd think
  he was praying. He was reading the bottom."

**Solos (older)**
- "Day nine. I talked to a chipmunk for twenty minutes this morning. It had good points."
- "I come up alone because nobody else will get up at five. Turns out I don't either."
- [Walt, `S2`+] "I passed him once on the Kek. He waved like he'd known me forty years. We'd never met. That was
  Walt, I found out later."
- [At a starred site, the stone in sight] "Somebody always leaves a white rock on that stump. Every time I come
  through, it's there. I leave it. Seems like a thing you leave." [The bible's day beat]

**The ranger party (Tom Becker and partner)**
- Tom: "Where'd you come in?" … "Good camp."
- Tom: "Food hung? Good. I have to ask. I ask the bears too."
- Tom, by a ruin: "There's a lot of old junk in the woods. Some of it's history. I'm supposed to know which." [`prop:`
  any 2.3 item in sight]
- Tom, `month:9`, `S8` open: "We're hauling the sled off the lunch rock this month. Unless somebody gives me a reason."
- [`S7 J`/`JN`] Tom: "We're closing up the old trench by Bald Eagle. Old damage. Nice to fix something on purpose."

**Canadians (Quetico side)**
- "You'll see more people on Basswood in an afternoon than we've seen all week."
- "Barbless? Barbless. Good. Leeches? I didn't see any leeches."
- "This was a mine town too, Atikokan. They closed around '80. We know how it goes. You still paddle."

### 7.3 The boys' camp (Little Sag C1210, 9–14 August)

Ambient only: what they say among themselves when the player is near but not in their designed scene. The arc file
owns their conversations and the reveal. **Denny's lines here are character, not tells** (bible 4.4): he over-helps,
nothing more. None of these may echo his three tells.

- Bob: "Walt cooked. Now I cook. We've lost four pans to my cooking. We've lost no pans to Walt's."
- Frank: "First round's on you. That's Walt's rule. It's not my rule. I'd let you off."
- Bob: "Twenty-six trips with Walt. We missed '93. Somebody's daughter got married." Frank: "She's divorced now.
  Was it worth it?"
- Denny: "You got enough to eat? Take this. Take two. We always bring too much." [Over-helping]
- Denny: "If you're going out from here, I'll ring you a couple of spots. And a carry. You'll want the carry."
  [Over-helping]
- Bob: "Four seventy-three rods both ways. We complain on the way in so we don't have to on the way out."
- Frank: "Sparky set the canoe on fire in '86. Not the whole canoe." Denny: "It was a flare. It was mostly the flare."
  [This exchange decodes Sparky. The bible (5.7) makes "the boys' stories at Little Sag" one of the two ways to learn
  it, so it belongs to the arc file's timing: it plays only when that file says the stories are told, and it then
  sets `knows:sparky`. It is never in the random ambient pool.]
- [Last night, the 14th, before the reveal scene] Bob: "He'd go quiet on the last night. Sit on that rock. We let him
  be. We still let him be."

### 7.4 The watchers

Two men in a green Kevlar, later three canoes and a truck. They never talk, never camp at a fire, never fish. If the
player paddles within hailing distance, one lifts a hand. The wave is the same every time [a stored animation, not
procedural, so it looks practised]. E on the dot offers nothing. They are never in a store, never on the board,
never in a rumour that isn't a real sighting (1.1).

---

## 8. The keepers on Walt

Fourteen keepers, as written on `claude/gl-b-outfitters`. Each gets: what they knew (writers only), their sign, and
their lines on Walt by stage. "Whose gear?" is the player's first question after night one; "Did you know Walt?" opens
at `S2`; "Who's been asking?" at `t1`. The endings' lines replace the topic's earlier answers for good.

Four of them are the bible's arc homes: **Farm 31** (the mining years), **Moose Lake 25** (the guiding years),
**Sawbill 38** (the boys) and **Little Vermilion 12** (the family). Their keepers stand beside
the cast and never speak for them.

### 8.1 Ruth Aho, Farm 31 (warm; lodge, Deb's café)

*Knew:* Walt as the man who put in at Lake One the first week of open water every May, for years, when she ran the
lodge there. Hosts Tauno's mornings on her porch, Mary on Tuesdays and Fridays, and the corner table on Thursdays for
Len and Brekke. Rents her dining room for Northmark's open house. *Sign:* none. "I sell pie to both sides. Pie doesn't
vote."

- [`S1`, Whose gear?] "That old thing? Came through the used lot, I'd guess. Every outfitter's back room has a bit of
  every other one's. Before my time, whoever had it."
- [`S2`, Did you know Walt?] "Walt? He put in at Lake One every May, the first week the ice was off, when we were
  there. Bought one candy bar. Same kind every year. Never said what he was doing. Fishing, I supposed."
  - Go on: "Polite. Paid cash. Looked at the lake a long time before he got in. Some people do that."
- [`S2`, a nickname: the Front Porch] "That's Lake One. The guides all called it that. Everybody's first night."
  [Ring Lake One]
- [`S3`] "Tauno sits out there every morning since June. If he's talking to you, he likes you, or he's worried about
  you. Usually both."
- [`S3`, asked where to ask] "Tauno, out front, mornings. Mary's in Tuesdays and Fridays. She typed for the old
  outfit, years ago." [Ring nothing: both are here]
- [`t2`, Who's been asking?] "Thursdays I keep the corner table for Len Saari and his friend from Duluth. Carl
  Brekke. Big tipper. Gold ring. I don't like him and I can't tell you why, which is the worst kind."
- [`t2`, `month:8`] "The company's open house is Saturday. In my dining room. Free coffee. Deb's furious. Come and
  eat a bar."
- [`S4`] "You've been back here more than anybody this summer. Sit. You look like you've been thinking."
- [`S7 J`/`JN`] "Tauno said a name at the counter this morning. Out loud. In my café. I've never heard him say it.
  I gave him his coffee for nothing." [If Tauno went on record]; otherwise: "Tauno read the paper twice. Then he
  went and sat on the porch with nothing to look at. He looked happy. I think that's happy."
- [`S7 M`] "Coffee's a dollar." [The warmest keeper, now plain; she never says why]

### 8.2 Gus Lindgren, Moose Lake 25 (gruff; lodge, the bunkhouse)

*Knew:* nothing of Walt. Ran a tow boat on Saganaga for thirty years, then bought the Moose Lake store when it sold in
2021; he never met Walt and had no part in the 2019 search (`31-guiding-years.md` 5.6, GY-16; `20-opening.md` 5.2).
*Sign:* none.
"Busiest landing in the Boundary Waters. I'm not putting up a sign to lose half of it."

- [`S1`, Whose gear?] "Back room stuff came with the store. Some of it went to the lot, some of it came back. I
  don't ask whose. Used gear's used gear."
- [`S2`, Did you know Walt?] "Before my time. Bought the place in '21. It came with a lot of canoes and a lot of
  opinions." [His own line from `31-guiding-years.md` 5.6; the bunkhouse question is `20-opening.md`'s]
  - Go on: "Never ran Moose. Ran Sag. Thirty years. Ask Nate where it lands, he drives it."
- [`S2`, the drowning] "I was on Sag that fall. Heard it on the radio like everybody. Before my time here." [Nothing
  about the wind or the search: that's Sheila's page]
- [`S3`, asked where to ask] "Marlys does Tuesdays and Wednesdays. Ran this counter twenty-some years. She knows where
  everything is, including what I've lost. Hap's on the porch weekends. Bring him a coffee, black." [Ring nothing:
  both are here]
- [`t1`, Who's been asking?] "Dan from the company. Nice kid. Coaches hockey. Asked if you rented here. I said
  everybody rents here."
- [`t2`, `ev:wade-bait@here`] "Fella in a clean truck bought bait and didn't take it. Leeches on the step. I
  put them back in the tank. Waste not."
- [`S5`] "Somebody's in my lot at six every morning. Doesn't buy coffee. That's what gets me. Buy a coffee."
- [`S7 J`/`JN`] "Marlys hung his picture. There, by the paddles. I'd have put it by the till. She's the boss of the
  wall." [`prop:walt-photo`]
- [`S7 M`] "Bunkhouse is full." [It isn't]

### 8.3 Bev Kangas, Sawbill 38 (dry; bait shop; the boys' store, Carol at the counter)

*Knew:* Walt from 1995 to 2003, when he guided the Sawbill side; she came up in 1994. Knows the boys well: they come
through her door every August. No relation to Tauno ("every third Finn up here is a Kangas"). *Sign:* none.
"Fourth graders read everything. I keep my yard boring."

- [`S1`, Whose gear?] "Somebody's dad's. That's who owns all old gear. Somebody's dad."
- [`S2`, Did you know Walt?] "Walt guided out of here for eight years. He cooked for his clients like they were his
  kids, and talked to them like they were his kids, too."
  - Go on: "He was good. Then he wasn't here. Guides are like that. You look up and they're on the next road."
- [`S2`, Tauno's name] "Tauno Kangas? No relation. Every third Finn up here is a Kangas. We share a phone book page."
- [`S3`, asked where to ask] "Walt's bunch. The guys. They book Sawbill the morning the permits open. They've
  never once needed to. They're old and stubborn. Second week of August, they're in. Carol at the counter
  was married to one of them. Gene." [Ring the Sawbill landing]
- [`month:8`] "The guys are in. They'll stop for leeches on the way and complain about the price. Every year. Same
  price."
- [`t1`, Who's been asking?] "A fella from the company came by with a card. I put it with the other cards. I have a
  drawer."
- [`S4`] "Denny was in here asking after you. He's sweet. He asks after everybody." [Denny's over-helping, seen from
  outside. Not a tell: he really does ask after everybody.]
- [`S7 J`/`JN`] "Bob came in with the paper folded to the page and didn't say anything. Just put it on the counter
  and bought leeches. That's Bob crying."
- [`S7 M`] "The guys said not to save them a spot for you. I'm just telling you what they said."

### 8.4 Arvid Strand, Round Lake 51 (old hand; trout camp)

*Knew:* Walt as another guide of the sixties, seen at Prairie and twice on the Trail: once to look at the cliffs on
Ottertrack, once "because he was lost", he said. Knows the 1950 fly-in on the Kek; Pete Haldane, the diver, works out
of his store. *Sign:* none. "I've guided both kinds. Both kinds tip."

- [`S1`, Whose gear?] "That's an Ely pack. You can tell by how much it weighs. They think weight builds character."
- [`S2`, Did you know Walt?] "Ely guide. Came up the Trail twice that I know of. Once to look at the cliffs on
  Ottertrack. Once because he was lost, he said. He was never lost a day in his life."
  - Go on: "Ottertrack has the clearest water up here. You can see your anchor on the bottom at twenty feet. He
    stood in his canoe and looked at it like it owed him something."
- [`S2`, the Long Room, if shown] "The Long Room. That's what the Ely guides called Ottertrack, the cliff stretch. I
  never called it anything. It's a lake." [Not a ring: Hap decodes it. Arvid confirms only that it's Ely talk.]
- [`S2`, the plane, while S5 is open] "There's a plane in the Kek. Nineteen-fifty, the winter before the planes
  stopped. The pilot swam out and walked to the resort. Pete Haldane wants it. Pete wants a lot of things."
- [`t1`, Who's been asking?] "Nobody asks me anything. I'm at the end of the Trail. They'd need a reason."
- [`S7 J`/`JN`] "The Ely papers came up the Trail a week late, like everything. Good story. Walt would've hated being
  in it."
- [`S7 M`] "Somebody sold something. Don't know who. Don't want to know. I'm at the end of the Trail."

### 8.5 Lise Thibodeau, East Bearskin 64 (keen; lodge; summer hire)

*Knew:* nothing. She came in 2023. Heard of Walt only as "the guy who drowned". *Sign:* "It's not my yard. I'm here
till September. I count loons."

- [`S1`, Whose gear?] "Oh my gosh, it's so old. I love it. Is that canvas? You're so brave."
- [`S2`, Did you know Walt?] "Before my time. Like way before. I think somebody said he was the guy who drowned on
  some lake by Ely? Sorry. I only know loons."
- [`S2`, the Kek, if shown] "The Kek! I know that one. Kekekabic. I counted loons there. Eleven. Twelve if you count
  the one I think was a duck." [Ring Kekekabic]
- [`t1`, Who's been asking?] "A guy from the mining company left a card and a pen. The pen's nice."
- [`S7 J`/`JN`] "Is it true you found, like, a mystery? That's the coolest thing that's ever happened to anyone I've
  rented a canoe to."
- [`S7 M`] "Somebody said you got paid a lot of money for something. Do you want to buy a loon print? They're
  forty dollars."

### 8.6 Leon Zupancic, Moose River North 16 (precise; river post, ex-ranger)

*Knew:* Walt as a ranger knows a guide: once, in 1991, he wrote Walt up for a fire ring the size of a hot tub, found
Walt had taken it down to one, and tore the ticket up. Knows Ollie walks the Stuart Portage Tuesdays and Thursdays at
dusk. Kari Vang boards at his post in summer (S4). *Sign:* none. "I was federal thirty-one years. Habits."

- [`S1`, Whose gear?] "A Duluth pack, nineteen-seventies, canvas, leather straps replaced once. The patch is a crew
  patch. Whose, I couldn't say. I don't guess."
- [`S2`, Did you know Walt?] "I wrote him up once. 1991. A fire ring the size of a hot tub on Nina Moose. I went
  back to measure it and he'd taken it down to one. The hot tub was somebody else's. I tore up the ticket. The only
  one in thirty-one years."
  - Go on: "He camped legal. Mostly. He'd tell you which rules were his and which were yours."
- [`S2`, the drowning] "October, alone, on the border. I read the summary. Two pages. I'd have written more. I always
  wrote more."
- [S1's thread] "There's a man walks the Stuart Portage at dusk, Tuesdays and Thursdays. Ollie Pekkala. Rescue squad,
  forty years. Say 'evening'. That's how it starts with Ollie." [After `S1`; no ring: the portage is on the sheet]
- [`t1`, Who's been asking?] "No one has asked me about you. I would tell you if they had. I keep a log."
- [`S7 J`/`JN`] "I clipped the article. I clip everything. This one I read twice."
- [`S7 M`] "You'll want your permit at the counter before you go in. As always." [Correct, cold]

### 8.7 Hal Vukelich, Trout Lake 1 (old hand; lodge; Vermilion)

*Knew:* June Mattila, Walt's wife, who taught his kid brother third grade in Tower; Walt "by her". Grew up in the
family resort when the road was gravel. *Sign:* YES. "My dad's dad was underground at Soudan. I'm for anything that
keeps the school open."

- [`S1`, Whose gear?] "That's a crew patch, I'd guess. Somebody's old work pack. My dad had one like it for the
  mine. Smelled like the mine till the day he burned it."
- [`S2`, Did you know Walt?] "I knew June. Walt's wife. June Mattila, from Tower. She taught my kid brother third
  grade. Too good for Walt, everybody said. Walt said it loudest."
  - Go on: "She died in '08. He went out alone after. That's the order it went in. I don't know that one caused the
    other. People said so."
- [`S3`] "He didn't come to Vermilion much. Big water, motors. Not his kind of lake. He came once to bring June to
  see her mother's old place. They sat in the car a long time."
- [Grudge, `visits ≥ 3`] (4.3, Leon and the motor.)
- [`t1`, Who's been asking?] "Dan Marolt was through. Gave me a hat. I'm wearing it. Doesn't mean anything. It's a
  good hat."
- [`S7 J`/`JN`] "I'm for the mine. I've always been for the mine. I'm not for faking anything. Those are two
  different things and everybody's acting like they're one."
- [`S7 M`] "They got their permit. I should be happy. I'm wearing the hat. I'm happy." [He takes the hat off]

### 8.8 Joanne Perko, Slim 6 (warm; bait shop; Echo Trail; a nurse in Ely thirty years)

*Knew:* June, as a nurse, at the end in 2008; Walt brought a thermos to the hospital every morning, two cups. Hap
Johnsrud is still her patient some days: she saw Walt come to the care home once a month from 2010 to 2019, and then
stop. *Sign:* NO. "My dad was underground at the Pioneer. He'd hate this one."

- [`S1`, Whose gear?] "Somebody loved that pack, hon. Look at the patches. You don't patch a thing you don't love."
- [`S2`, Did you know Walt?] "I nursed his wife at the end. June. He brought a thermos every morning. Two cups. She
  couldn't drink hers by the last week. He poured it anyway."
  - Go on: "Then for years he came to the home once a month to see Hap Johnsrud. Coffee and a bar. First Tuesday.
    And then he didn't. Hap asked after him for a year."
- [`S3`, asked where to ask] "Hap's at Moose Lake weekends. His grandson drives him up. He'll talk your ear off and
  half of it'll be true and the other half will be better." [Ring Moose Lake]
- [`S2`, Four Towns, if shown] "Fourtown. The old crowd on this road call it Four Towns. My uncle did. Don't ask me
  why. Nobody knows." [Ring Fourtown]
- [any time] "The paintings on North Hegman are older than anybody can say. Look from the canoe. Don't touch
  them."
- [`t1`, Who's been asking?] "A nice boy from the company left a card. I told him my sign's at the end of the drive
  and he said 'I saw.' He was very polite. I gave him a muffin."
- [`S7 J`/`JN`] "I took the paper to Hap. He made me read it twice and then he said, 'He liked October.' That's all
  he said."
- [`S7 M`] "Eat something before you go back out. I mean that. I'm still a nurse." [Kind, which is worse]

### 8.9 René Belanger, Little Vermilion 12 (gruff; trout camp; Crane Lake, the family's door)

*Knew:* Aili for thirty years as the neighbour with the motel and the bait counter; Liisa works for him in summer;
Gord Pelletier ties up at his dock on Thursdays. Sends strangers who ask about Aili "back down the road". Knows
nothing he would say. *Sign:* none. "Crane Lake is a fishing town. We vote with walleye."

- [`S1`, Whose gear?] "Old. Works. That's all gear needs to be."
- [`S2`, Did you know Walt?] "Aili's brother. No." [He means: no, I won't]
  - Go on: "People come up asking about Aili's brother maybe once a year. I send them back down the road. You can go
    next door and buy bait. That's allowed."
- [`S3`, asked where to ask] "Aili runs the motel and the bait counter next door. She'll give you coffee. She won't
  give you anything else. Don't push. I'll know." [Ring nothing: it's next door]
- [`S3`] "Liisa's my best summer kid. Don't get her in anything."
- [`month:5–10`, Thursdays] "Gord's boat's at the dock. Atikokan. He brings bread and takes back gossip. Fair trade."
- [`t2`, `ev:wade-bait@here` or a truck at Crane] "There's a fella on the Crane dock in shoes that never touched a
  boat. I don't like him. I don't like most people. I really don't like him."
- [`S7 J`] "Aili put out two cups this morning. One for you, she said. Go before it's cold." [Only if the player
  kept Walt out of print]
- [`S7 JN`] "She's not coming to the counter today. Or tomorrow. Buy your bait from me."
- [`S7 M`] "Bait's here. Aili's closed for you."

### 8.10 Myrna Sether, Hog Creek 36 (dry; river post; the Isabella post office thirty years)

*Knew:* Walt from the post office in Isabella, while he worked the Hog Creek counter from 2003 to 2010, before she
retired out here. Maggie is in her bunkhouse after the midpoint. *Sign:* none. "Thirty years of not having opinions
in public. I'm not starting with a sign."

- [`S1`, Whose gear?] "The post office taught me not to ask what's in a package. It works on packs too."
- [`S2`, Did you know Walt?] "He worked this counter before me. I knew him from the post office. He'd come in for the
  mail and leave without it half the time, talking walleye with whoever was in line."
  - Go on: "His handwriting was the kind you could read from across the room. Capital letters on the bait
    receipts. Nobody does that."
- [Shown a page] "That's his hand. I sorted his mail for seven years. You don't forget a hand." [Once]
- [`S4`, Maggie at Hog Creek] "There's a woman in the bunkhouse says she's here to fish. Eleven days and one perch. I
  don't ask. Post office."
- [`t1`, Who's been asking?] "A man from the company asked if you'd been through. I said I don't keep track of
  customers. Which is a lie. I keep track of everything."
- [`S7 J`/`JN`] "The woman from the bunkhouse sent me a postcard. From Duluth. 'Thanks for not asking.' Best mail
  I've had in years."
- [`S7 M`] "Mail for you." [There isn't any. She means: nothing.]

### 8.11 Merle Ostrom, Homer 40 (precise; trout camp; a state water man twenty-six years)

*Knew:* nothing of Walt. Knows what a water filing is and that the old ones are public. His lines on the story are
texture, never a key: they say what "background" means in a water man's mouth, which Tasha and Maggie also say.
*Sign:* none. "Ask me in ten years. I'll tell you if I was right."

- [`S1`, Whose gear?] "Canvas, brass grommets, leather. Thirty-eight pounds dry, I'd estimate. Considerably more
  wet."
- [`S2`, Did you know Walt?] "No. I measured water, not people. I do know the lake he was found on. Birch. Mean depth
  about twenty feet. Not that it helps you."
- [`knows:stations`] "Background station means upstream of anybody. Before anything's been touched. If a station's
  downstream of a pad, it's not background. That's not an opinion. That's what the word means."
- [`knows:stations`, Go on] "The old filings are public. Anybody can ask the state. Nobody does. It's very boring
  reading, which is the point of it."
- [`t1`, Who's been asking?] "Nobody. I'm a long way up a forest road. I'm hard to ask."
- [`S7 J`/`JN`] "They'll redo the baseline now. Properly. I'd like to see their numbers. I'd like to see anyone's
  numbers, honestly."
- [`S7 M`] "They'll build on the old baseline, then. Well. The water will say what it says. It always does,
  eventually."

### 8.12 Inga Bratvold, Skipper & Portage 49 (warm; lodge; the Gunflint)

*Knew:* nothing of Walt; the Trail doesn't keep track of Ely. *Sign:* NO, on the mailbox post. "My husband's for it.
My sign's against. We have one mailbox. We manage."

- [`S1`, Whose gear?] "That's an Ely pack, dear. We use lighter ones on the Trail. Take two lefse, you'll need them."
- [`S2`, Did you know Walt?] "An Ely guide? On the Trail we don't keep track of Ely. They keep track of us, I think."
  - Go on: "The one who drowned on the border? We heard. We hear everything eventually, a week late."
- [Grudge, `visits ≥ 3`] (4.3, the Trail and Ely.)
- [`t1`, Who's been asking?] "A young man from the mining company came all the way up the Trail with a hat for my
  husband. My husband wears it to bed. I'm not joking."
- [`S7 J`/`JN`] "My husband read it and said, 'Well, that's those men, not the mine.' And I said yes. And we
  agreed about something for the first time since 2016."
- [`S7 M`] "Lefse's on the counter, dear. Help yourself." [Warm. She never knew Walt. This ending costs nothing here,
  and that is its own small point.]

### 8.13 Norm Kovach, Bog 67 (gruff; river post; logged this country thirty years)

*Knew:* Walt by sight. More use to the story: in August 2019 two men in a green Kevlar camped a week on the Isabella,
bought gas and no bait, and asked him "which way the old guide went". He said "what old guide". *Sign:* YES, nailed
to the woodshed.

- [`S1`, Whose gear?] "Somebody's. Mine's older. Mine's in the shed."
- [`S2`, Did you know Walt?] "Knew him to nod at. He paddled the river once a year, slow. Looked at the old
  landings like they owed him rent."
- [`S3`] "The river? Lot of people think it's somebody's spot. It's rocks. It's everybody's rocks."
- [`knows:N35` or the Isabella camp found] "August of '19. Two fellas, green Kevlar, a week on the river. Bought
  gas. No bait. No rods. Asked me which way the old guide went. I said what old guide. I notice what people don't
  buy." [Corroborates the watchers' camp. Not a key; never names anyone.]
- [Grudge, `visits ≥ 3`] (4.3, Norm and Merle.)
- [`t1`, Who's been asking?] "Company kid with a card. I'm on his side and I still didn't like him asking."
- [`S7 J`/`JN`] "Faked the water. Hm." [Long pause] "I'm still for the mine. I'm against liars. I've been against
  liars longer."
- [`S7 M`] "They got their permit. Good." [He goes back to the tumpline.]

### 8.14 Thea Lundeen, John 69 (keen; bait shop; a painter, six years)

*Knew:* nothing. She came in 2020. Has painted the Little John landing, which has a white rock on a stump (Walt's
starred site, set before June 2018). *Sign:* none. "I paint lakes. Lakes don't vote."

- [`S1`, Whose gear?] "Oh, I want to paint it. Can I paint it? It's so brown. I love brown."
- [`S2`, Did you know Walt?] "Before me! I came up in 2020. I heard about him, though. Everybody up here has a story
  about somebody who drowned. Then they change the subject to the weather."
- [`knows:stones`] "There's a white rock on a stump at the Little John landing. I painted it. Well, the landing. The
  rock's in it. It looked like somebody put it there on purpose." [A confirmation of the player's own pattern, never
  the first stone they hear of]
- [`t1`, Who's been asking?] "Nobody comes up the Arrowhead Trail! Except you. And the propane truck."
- [`S7 J`/`JN`] "I read the paper and then I painted the lake. It's the same lake. It just felt different."
- [`S7 M`] "Somebody said you got money. Do you want a painting? Kidding. Kind of."

---

## 9. Talk by place: the day's beat and reading where he wrote

The bible (6.1) has the world offer a small beat on any trip day that had none, and a concrete thing for reading an
entry where Walt wrote it. Ambient lines for both:

**Cap and pools (bible 6.1).** The fallback fires at most every other trip day; the days between stay quiet. Lines
here are tagged by pool: **Walt** (the starred site, the nickname lake, Bald Eagle, Pietro) and **history** (the
Four Mile grade, the resort ruin, and everything in sections 2 and 6.1). Once the player has declined the porch or the
door (`20-opening.md` X1/X2), only the history pool is drawn. This section is the season-sized pool; `20-opening.md`
L1–L7 are for trip one only.

**The day's beat** (said by a party at the next portage or site, one a day at most)
- [A starred site, stone in sight] "Old guide used to camp here alone, they say. Always left a rock on the stump."
- [A nickname lake, an old local] "This was somebody's favourite lake. Everybody's got one. Some people have twelve."
- [The Four Mile grade] "This was a railroad. They hauled pine out on it. You can still find spikes."
- [A resort ruin] "There was a lodge here once. My grandma waitressed in one like it. The rhubarb's still coming up."
- [Bald Eagle's west shore, old local, `S2`+] "The drill crews used to land there. Seventies. You can still see the
  crib under the water on a calm day."
- [Pietro's north-east hill, `S5`+, a party] "Somebody dug a hole up on that hill a few years back. Big one. Didn't
  find anything, I guess. They left a shovel." [The wrong hill, public from the water]

**Reading where he wrote** (the dot on the book at an entry's place; no talk, only the world)
- The stone on the stump becomes visible on the dot as *White stone* the first time the entry is open there.
- A fish-spot photo match, a second-ink line that only makes sense in place, or a small Walt object (a spoon, a
  lure, a tobacco tin of matches) per the bible's beats table.

---

## 10. Checks for the builders and the arc writers

1. **Store kinds vs the lines.** grounding.js passes "café" only where `store.cafe`, and "porch" only where
   `store.porch`. On `claude/gl-b-outfitters`: Sawbill 38 is a **bait shop with no porch**, so Carol's "café counter"
   (bible 4.4) fails the lint. Either give Sawbill a café counter or write Carol's lines with "the counter" only. Little
   Vermilion 12, Moose River North 16, Homer 40 and Bog 67 have **no porch**: Tauno's "rounds of the porches" (bible
   4.1) needs a fallback there. Proposed: at a store with no porch, Tauno leans on his truck in the lot ("Don't stand
   there. Walk with me. To the truck." already fits).
2. **Pictures on walls.** grounding.js's `picture` rule always fails. Walt's photo (Moose Lake, `S7 J`/`JN`) and the
   framed 1949 chart (Round Lake 51, S5) need story props and an exception keyed on the prop.
3. **The drive card** (stream B's `rides` wait card) needs a slot for one line of road texture, seeded by road and
   stage (3.2).
4. **The watchers' placements** must be logged as events (`ev:watchers@lake`, per day) so parties can only report
   real sightings (1.1, rule 5).
5. **The schedule on the run.** No parties camp on Gull, Pietro, Camdre or Rock Island on the run's night (6.7).
6. **The lint's story rules** (1.2, 1.4): banned words in ambient pools (cellar, cache, far end, Gull's east bay, the
   flowage, the camp as a place, Eino's name, alive); reserved speaker lines; "green Kevlar" needs a sighting; "the
   Ledger" needs `S7 J`/`JN`; Wade's name never in ambient pools.
7. **The boys' "Sparky" banter** (7.3) is timed by the boys' arc file, never random, because it decodes the nickname.

---

## New details (for the continuity check)

Invented here; none contradicts the bible. Each is small and may be cut.

**Keepers** (the fourteen of `claude/gl-b-outfitters`; their pasts there are kept)
- Ruth Aho saw Walt put in at Lake One the first week of open water every May while she ran the Lake One lodge; he
  bought one candy bar. She keeps the corner table on Thursdays for Len and Brekke, names Brekke from `t2`, and rents
  her dining room for Northmark's August open house. No sign.
- Gus Lindgren ran a tow boat on Saganaga for thirty years and bought the Moose Lake store when it sold in 2021 (his
  wife ran the counter at first). He never met Walt, had no part in the 2019 search, and has no grudge with Hap (as
  `31-guiding-years.md` 5.6 / GY-16 and `20-opening.md` 5.2). His history marker is the Sag tow stopping at American
  Point after the 1978 bill.
- Bev Kangas is no relation to Tauno Kangas. She knew Walt 1995–2003. The boys book Sawbill the morning permits open.
- Arvid Strand saw Walt on the Trail twice (Ottertrack's cliffs; "lost"). Tells the Kek plane story.
- Lise Thibodeau came in 2023 and knew nothing of Walt.
- Leon Zupancic, as a ranger, wrote Walt up in 1991 for a fire ring on Nina Moose that turned out not to be his, and
  tore up the ticket. He knows Ollie's portage evenings.
- Hal Vukelich's kid brother was taught third grade in Tower by June Mattila. Walt brought June to Vermilion once to
  see her mother's old place. YES sign. His grandfather was underground at Soudan.
- Joanne Perko nursed June in 2008 (Walt brought a thermos, two cups, every morning) and saw Walt visit Hap at the
  care home monthly 2010–19. NO sign. Her father was underground at the Pioneer.
- René Belanger sends strangers asking about Aili back down the road; Liisa works for him summers; Gord ties up at his
  dock Thursdays.
- Myrna Sether knew Walt from the Isabella post office while he worked the Hog Creek counter (2003–10), and knows his
  hand. She retired to Hog Creek later.
- Merle Ostrom (state water man after 1980) knows that old filings are public and what "background" means. A texture
  line only, gated `knows:stations`.
- Inga Bratvold has a NO sign on the mailbox her pro-mine husband shares.
- Norm Kovach saw two men in a green Kevlar on the Isabella for a week in August 2019 who bought gas, no bait, and
  asked "which way the old guide went". YES sign on the woodshed. He cut his hand in 1989 and Joanne patched it.
- Thea Lundeen came in 2020 and painted the Little John landing with Walt's white stone in it.
- The grudges of 4.3: Hal and Leon (a 1984 motor ticket on Hal's father, paid in ones, counted out slow); Norm and Merle (a landing
  shut for silt in 1997; "Still brown" Christmas cards).

**Places and props**
- New texture props: the Four Mile rail spikes and stone culvert; steel cable on a pine stump on two or three Isabella-
  side lakes; a grown-in sleigh road; the Rose Lake grade; a lone fieldstone chimney on a second Basswood shore with
  an iron ring bolt and a rusted fuel drum; dock cribs on Basswood, Crooked and Lac La Croix's US side; a china shard
  in a fire ring near an old resort; rhubarb at old cabin sites; a test trench and drill hole near Paulson Lake.
- Northmark's small access sign and gated spur at the Little Gabbro (EP 33) trailhead; numbered sample stakes on the
  Kettle creek.
- The Kettle signs' look and words (KETTLE — YES / Good jobs. Our rules.; KETTLE — NO / The water runs north.) and who
  has one (Hal, Norm: yes; Joanne, Inga: no).
- In the money ending Frank takes his YES sign down (seen on the drive).
- On the run's night no party camps on Gull, Pietro, Camdre or Rock Island.
- At `t2`, once a season, a drive from a store where Wade bought bait shows a clean pickup following from town to
  the turnoff and going on past (3.2). It adds no scene; it is the tier's presence on the road.

**Talk**
- The boys refuse to read Walt's notebook ("We don't read a man's book"), all three, the same way.
- The "Look at this" topic is not offered on the last page or to Len, Dan, Wade, Brekke or the watchers.
- Mary says "Thursdays are crowded"; Aili stopped going to church suppers after the memorial.
- Joanne carries Hap's one-line reaction to the journalist ending ("He liked October."), which reuses Hap's own line
  as his.

**Settled by the bible (section 10)**
- Ruth's brother is **Oskar** (not Eino, not Leif).
- **Orrin Gilbertson** is S6's collector (was Arvid Moen); the Homer 40 keeper is **Merle Ostrom** (was Dale Ostrom).
  Bev Kangas keeps her "no relation" line; Arvid and Tasha are "Different Strands."
- The boys' store is **Sawbill 38**; the S5 store is **Round Lake 51**.
- Moose Lake's owner: the Lindgrens bought the store in 2021; Gus ran a tow on Saganaga before that.

**Still open (for the build, not the story)**
- **Real surnames.** The research says resort families should not be Perko, Skala or Zupancich. The build's keepers
  include **Joanne Perko** (Slim 6) and **Leon Zupancic** (Moose River North 16). Rename both before ship
  (`90-game-needs.md`).
