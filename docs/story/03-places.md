# The story on the map: real places

Where Walt's story happens, picked from the game's own map data. This is a design brief for the writers and builders.
None of its wording is game text.

**The bible (`01-bible.md`) supersedes this brief wherever they differ.** Canon is `00-owner-decisions.md`, then the
bible. This page holds the map facts (ids, x/z, reach) under the bible's choices. Where a candidate table survives
below, the bible has settled it and the choice is marked; the alternatives are kept only as history.

## How to read the numbers

- **Source:** `public/data/index.json`, which is the data-v3 release that `src/world-fixes.json` targets. Portages
  and campsites have no ids in the data, so **P123** and **C123** are positions in the runtime arrays: first the
  release's own entries, then world-fixes' entries appended in file order, the same order the game builds them in.
  **Lake ids** are the release's `lakes[].id`. **EP** numbers are the real Forest Service entry-point numbers.
- **The live world is the v9 data, and its lake ids are different.** The lasting keys are the names and the x/z
  points. Before you hard-code anything, look up the lake in v9 by name and point (most importantly Gull Lake's east
  end).
- **x/z** are metres in the game's frame: x points east, z points south (negative z is north), and the origin is at
  48.09 N, 91.215 W. Latitude and longitude are given for the points that matter.
- **Distances** are straight-line paddling legs between landings, so they are a minimum. The real paddle is about
  30 % longer. Carries are the data's own rods (1 rod is 5.03 m). On river legs the router undercounts carries, so
  check those in game; they are marked "river".
- **Quota** is the entry point's daily overnight quota from `src/parties.js`. In summer, a low quota means the permit
  is often gone.
- **Stores** use the build's ids (bible 10): the boys' store is **Sawbill 38** (Baker EP 39 is in its reach), the S5
  store is **Round Lake 51** (Larch Creek, Seagull and Saganaga are in its reach).

## The shape in one paragraph

Boreal's 1970s crews drilled the gabbro edge south-east of Ely, the **Gabbro – Bald Eagle belt**. Their public ground
is fiction on real ground: **the west pads** and the biggest of them, **the Kettle pad**, just outside the wilderness
south-west of Bald Eagle, reached by a winter-road grade from **the crews' landing** on Bald Eagle's west shore. The
creek below the pad has no name on any map; the crews call it **the Kettle creek**. **Eino** "drowned" on **Bald
Eagle** in October **1977**: his canoe was found swamped against the west shore below the crews' landing, upwind of a
nor'wester. The brothers' own secret was the dead east end of **Gull Lake**, "the far end", the dead end of the Bald
Eagle – Gull – Pietro chain, where they ran the **E-7** fly camp alone in August 1976. Eino filed E-7 on **Pietro's
north-east hill** instead; Northmark dug that wrong hill in September 2018. At the far end an unmapped carry runs up a
beaver flowage to a knob. The **2011 Pagami Creek fire** burned it (it is in the game's burns layer); from 2012 to 2017
Walt built **the camp** there from the fly camp's leftovers and fire-killed pine, in the lee of the one island of cedar
the fire missed, and it has been untouched since October 2017. The cellar is the E-7 test pit on the ridge above it.
Walt's last bunkhouse was **Moose Lake** (EP 25). On **17–18 October 2019** he went out at night, swamped his canoe
against the south shore of **Birch Lake** on the border, upwind of an SSE wind, and crossed **Carp Portage** into
Quetico. The two swamped canoes, an October each, both on the upwind shore, are the echo. The family is at the far west
border landing, **Crane Lake** (Little Vermilion, EP 12). The boys trip out of **Sawbill**. The run goes north from the
cellar over Walt's long carries (Pietro, Camdre, Clearwater, Rock Island) to **Lake One** (EP 30), a night's work with
no campsites; the variant goes west over Bald Eagle's open water to Little Gabbro and on to Farm.

---

## 1. The 1970s exploration ground

The crews drilled from winter roads and the edge of the wilderness. The fiction leaves drill pads, casing pipes
standing out of the moss, rotted core-box racks, a blasted trench, a stockpile and a winter-road grade, all on real
ground under crew names. The research brief notes that real 1970s copper-nickel applications and test sites sat just
outside this edge (the South Kawishiwi, Babbitt). Those stay as texture people mention. The fictional companies
(Boreal Range Minerals, Northmark Metals) never take a real deposit's, project's or company's name, and no real creek
name is ever used for the story's creek (bible 3).

| | Candidate | Real places (id, x/z) | Reach | Why it works | Against |
|---|---|---|---|---|---|
| **A** ✅ (settled) | **Gabbro – Bald Eagle belt** | Gabbro L. 75 (−27857, 26210); Bald Eagle L. 55 (−25071, 29412); Little Gabbro L. 341; Gull 135, Pietro 185, Turtle 181. Story ground: the crews' landing, the grade, the west pads and the Kettle pad (fiction, section 1a) | EP 33 Little Gabbro (quota 2), EP 32 South Kawishiwi (2), both served by **Farm 31**; EP 30 Lake One from the north | It is the real gabbro edge, close to Ely, where the crews lived. The quotas are small, so a summer permit is hard to get and fall is the natural time | It is gentle country, and new players may wander into it early (good: they see it before they understand it) |
| B | Isabella country | Isabella L. 48 (−5514, 30988); the Isabella River (lake 186), Quadga L. 235, Boga L. 323 | EP 35 Isabella (2), EP 34 Island River (2), Bog 67 | Rivers country; logging-era ruins | Less mineral texture; long river routes. (It is still the story's false lead: section 1b) |
| C | The Gunflint iron edge | Paulson Lake 339 (22765, −988); Mine Lake 935 (25954, 565); Magnetic L. 150 | Round Lake 51's reach, EP 57 Magnetic | Real old-mine names | Iron and 1890s, not 1970s copper-nickel; the 2007 Ham Lake burn |

**Settled: A.** The crews' public ground is the **west pads and the Kettle pad**, south-west of Bald Eagle and reached
from the crews' landing. It is where Len's honest-but-public rings point, where Tasha's crew samples the Kettle creek,
and what Northmark's Kettle project is built on. The real names nearby (Nickel Lake, Nickel Creek, Cobalt Creek, Filson
Creek) are never story ground and never appear next to the fraud on screen.

**Why the far end stayed hidden** (bible 2.2, 2.5): the brothers ran E-7 alone at Gull's dead end in August 1976 and
assayed nothing worth drilling. Eino filed the pit on **Pietro's north-east hill** instead, "so nobody comes back and
ruins our fishing", and drew the sketch true in every distance but mirror-wise. When Northmark went looking in
September 2018 it dug the filed position on Pietro: the wrong hill, with no creek or beaver water near it. After the
empty dig Brekke decided Walt had moved the papers years ago and switched from searching ground to watching the man.
The distance between the west pads, the filed hill and the true knob (about 6 km and one carry apart) is what makes the
cellar hard to find.

### 1a. Fiction to add on the crews' ground (story props, not data edits)

- **The crews' landing** on Bald Eagle's west shore, at about (−25825, 29925), lat 47.8209, lon −91.5617: the quietest
  stretch of that shore, 1.0 km from the nearest campsite (C908) and 1.9 km from the nearest portage. A rotten crib
  dock, a 1977 blaze with its dab of orange and a fresh strip of pink flagging (bible 6.3, 1.2). A free day trip from
  EP 33: Little Gabbro, Gabbro, P693 (6 r), then Bald Eagle, ≥7.7 km.
- **The winter-road grade** from the landing south-west into the trees to the west pads, about **1.3 km** to the Kettle
  pad on a provisional line (v3 heights 440 → 456 m, steepest pitch about 23 %: walkable). Casings in the moss along
  it.
- **The west pads**: two or three grown-over pad clearings along the last stretch of the grade, with casings and
  core-box racks; builders place them on dry ground between the landing and the Kettle pad.
- **The Kettle pad**: the biggest pad, in a kettle hollow; the 1976 bulk-sample trench (a long scar full of water), the
  low stockpile mound, alder and fireweed on the bare pad. A provisional spot that fits the brief in v3: the closed
  hollow at about **(−26950, 30600)**, lat 47.815, lon −91.577, 444 m in a 10 m-deep bowl, **1.3 km** from the crews'
  landing and inside loaded tiles. **The Kettle creek** would be the unnamed reach that drains it north through the
  small ponds near (−27100, 30200) to Bald Eagle's south-west shore. **All of this x/z is void until check A1**
  (section 9): if the real-deposit check moves the pad, move it along the grade and keep it within about 1.5 km of the
  crews' landing.
- **The old crew camp** sits outside the wilderness at the EP 33 road end. Tauno's climax is staged there (bible 6.4).

### 1b. The false lead: the Isabella watchers' camp

Denny's five rings in Bog 67's reach (`32-the-boys.md` 4.x) send the player to "Walt's spot" on the Isabella River. At
the river site, the watchers' **August 2019 camp**: old Northmark flagging, a coffee can of cigarette butts, a sapling
cut and lashed up for a radio antenna, the Helstrom fuel receipt (bible 5.7). Proposed site: **C911 (−12550, 30700)**,
lat 47.814, lon −91.384, a river site (lake 186) about 6 km below Isabella Lake, upstream of Rice Lake (251); C910
(−15424, 31777) is the alternative. Reach: EP 35 Isabella (Bog 67), downstream (river; check the carries in game).

---

## 2. The secret portage, the camp and the cellar

What the canon asks for: a real lake with a quiet dead-end bay; an **unmapped** carry that leads not to a lake but to
Walt's cabin; old mining gear holding it up; the cache in a test pit uphill; "behind a beaver dam, best found in fall".

| | Candidate | The bay and the climb | Seclusion | Travel | Notes |
|---|---|---|---|---|---|
| **1** ✅ (settled) | **Gull Lake (135), the east end** | The bay ends in a creek mouth at **(−19835, 26740)**, Gull's level 460.5 m. Behind it is a beaver-pond chain (data ponds 12195 → **4747** → 10620, levels 462–466 m, not connected to any route) running south. The knob at **(−19385, 27355)**, 479 m, sits 18 m above the lake | Nearest campsite C1539 is 1.1 km away (C2181 1.2 km); nearest mapped portage 2.6 km. It is the dead end of a dead-end chain | From EP 33 Little Gabbro: ≥11 km, P255 Bald Eagle–Gull 205 r (+P256 50 r at the narrows). From EP 30 Lake One: ≥11.6 km, 7 carries, 544 r | **Inside the 2011 Pagami Creek burn** (`src/burns.js` agrees at all three points). Pietro is not burned; Bald Eagle's north part is not |
| 2 | Pietro Lake (185), the north-east shore | Landing (−21455, 25235); pond 3732 at (−21295, 24945) | Campsite 960 m, portage 740 m | On the Gull–Camdre chain | Not chosen for the cellar. It became **the wrong hill** (section 2b) |
| 3 | Isabella Lake (48), the south shore | Landing (−5045, 29625); pond 11448 | Campsite 900 m | EP 35 | Not chosen |
| (4) | Paulson Lake (339) | Landing (23525, −785) | Campsite 870 m | Round Lake 51 | Not chosen |

**The secret portage, as built:**
1. **Landing at the beaver dam**, (−19835, 26740), lat 47.8495, lon −91.4813. In summer the creek mouth is a sedge
   flat with a dam; the cut stump at the dam's back stands in sedge water with Walt's white quartz stone on it. Low
   water from mid-September bares the cut stump step and an old drill rod driven in as a canoe rest. That is the
   "best found in fall" detail.
2. **Along the beaver ponds**, about 390 m to pond 4747 at (−19826, 27127), 464–466 m, along the east bank, past the
   1976 fly-camp line's orange-dab blazes (grown over to smudges). You can pole or wade it, or carry the bank.
3. **Climbing east to the knob**, 490 m, through fifteen years of jack pine to its island of cedar and the camp at
   **(−19385, 27355)**, 479 m, lat 47.8440, lon −91.4752. The whole carry is about 880 m, **~175 rods**.
4. **The cellar (the E-7 test pit)** is 620 m on, uphill, on the ridge at **(−18885, 27725)**, 485 m, lat 47.8407,
   lon −91.4685: **622 m at a bearing of about 126°** from the knob, the midwinter sunrise at this latitude (the
   torn page's "the way the sun comes up at Christmas"). There is no trail: only a faint line of 1976 core spill from
   the camp's back door, which reads as a trail only to someone Tauno has told about core spill.
5. **The sketch, as checked on the ground:** pond 4747 lies at about **297°** from the knob (west-north-west) and the
   pit at about 126°. E-7's sketch is drawn flipped east–west (pond east, pit south-west), so it fits only someone who
   flips it standing on the knob (bible 5.2 lock 6 key B, check 9).

**The fire and the camp (settled, bible 2.5, 6.5):** the Pagami Creek fire burned the knob in September 2011 and bared
the E-7 fly camp's leftovers: the fuel drum, the light skid, drill rod, the core-box rack. Walt built **the camp**
from 2012 to 2017 from those leftovers and fire-killed jack pine only: drill-rod posts and braces, the skid for the
sill, the drum for a stove, the core-box rack for a shelf, a cot, his spare boots, the 1976 photo of two young men at a
fly camp. It sits in the lee of the one island of cedar the fire missed, roofed with bark and moss under the cedar, so
it does not show from the air or in the public elevation data. **Untouched since October 2017.** By 2026 the jack-pine
thicket (the burns layer grows it at the right height) has closed round it. **Under the floorboard** beside the drum
stove, with a white stone set into the floor at that board's corner: **the coffee can** holding the three torn-out
pages (not on the shelf).

### 2a. The notch and the burnt point (lock 2 key D, lock 3 keys B–D)

N22 ("Trolled from the burnt point toward the notch, 3 pulls. … Flowage end."), Frank's "a notch in the ridge behind
it", Gene's 1998 slide and S5's 1949 chart all need a notch on the ridge **behind the creek mouth as seen from the
bay**, with a named burnt point on the same line. The straight draw the earlier draft offered, the lineament from
(−20370, 25500) to (−19900, 26270), does not do it: it ends about 470 m **north** of the creek mouth, so from the bay it
sits well to the left of the creek, and trolling toward it would end on the bay's north shore, not at the flowage. In
the v3 10 m heights the skyline over the bay has no notch deeper than a metre or two anywhere from north round to
south-east. So, unless v9 shows otherwise (check B5):
- **The burnt point** is the headland that closes the east bay on the north-west, at about **(−21250, 26550)**,
  464–470 m, lat 47.851, lon −91.500. The burns layer has it in both the 2011 Pagami Creek and the 2006 Turtle burns.
  From it the creek mouth is 1.43 km away at a bearing of about **98°**: trolling "from the burnt point toward the
  notch" runs the length of the bay and ends at the flowage.
- **The notch** is on the first rise behind the creek mouth on that line, the hump at about **(−19340, 26805)**, 481 m,
  lat 47.849, lon −91.475: 500 m beyond the creek mouth and about 19 m above the bay, so it is the skyline from the
  water. It is a story-layer feature: a V-shaped notch cut into the crest (a story height edit if the build supports
  one, otherwise a rock cleft prop with the old cut line running through it), sized to read in silhouette with
  vegetation ignored (bible check 8). It stands about 550 m north of the camp and 1 km from the pit, so it points at
  the creek, not at the camp.
- **S5's chart:** the pilot's 1949 winter-road cut runs up through that notch and ends at the creek mouth in Gull's
  east bay. The chart's line end matches (`60-side-stories.md` S5).
- **Gene's slide** (taken from the bay, Walt at the creek mouth): from anywhere on the bay's axis the notch stands
  directly behind the creek, so the photo match at (−19835, 26740) holds.

**Fiction to add to the world data:**
- **The unmapped portage** as a world-fix entry that is *not* drawn on map sheets or keepers' rings and is not in
  `explored.js` inking until walked. Its polyline is landing → pond 4747 east bank → camp, with `fix: "story"` and a
  `hidden: true` flag. The walker, trail tunnel (`TRAIL` exclusion) and portage verbs must work on it like any carry.
- **The camp** as a story prop under its cedar, with its own collision, an interior small enough for one person, and
  the floorboard, white stone and coffee can.
- **The cellar**: a square slump with bunchberry growing in a square, a timber lid under moss, the two tarred cans and
  Eino's note on top.
- **The beaver dam** at the creek mouth: place one from the wetlands round's dam system here and pin it, so it doesn't
  move year to year. The stump, stone and drill rod at its back.
- **The burnt point's name** stays Walt's only; the notch prop as in 2a.
- Nothing about this may appear on a bought map sheet. The book's map page inks it only after you've walked it.

### 2b. The wrong hill on Pietro

E-7's filed position (Tauno's crew map or Maggie's state copy) lands the player on **Pietro's north-east shore**. The
landing at about **(−21455, 25235)** is an unremarkable rock with no site (Pietro, 460.4 m). A faint 2018 boot path goes
up about 310 m to the hilltop at about **(−21200, 25050)**, 493 m, lat 47.865, lon −91.500, 33 m above the lake. **The
dig** is near the top, at about (−21210, 25060): a grassed-over, sunken rectangle of turned ground, spoil on two sides,
rotten survey flags on grey lath, a snapped new shovel blade, a numbered aluminium survey tag. Pond 3732 at
(−21295, 24945) is a perched rock pond with no creek or dam. Reach: EP 30 Lake One through Rock Island, Clearwater and
Camdre (5 carries), or EP 33 via Bald Eagle and Gull (P255, P256, P530). Outside the burn.

---

## 3. The two swamped canoes: the echo

Both canoes were found **swamped, no paddle, in October, on the shore the wind could not have put them on.** Eino's
was put there by the men who killed him; Walt put his there on purpose, as a message for Aili, Ollie and Tauno (bible
5.5). Two clippings in the book, 1977 and 2019, use the same words.

| | Place | Where the canoe was found | Wind and why |
|---|---|---|---|
| **Eino**, 14 Oct **1977** ✅ | **Bald Eagle Lake (55)** | Against the **west shore** below the crews' landing, (−25825, 29925). His body was found 23 Oct about 300 m off the landing. From EP 33: ≥7.7 km, one 6 r carry (P693) | The crews' own lake: 5 km² of open water. The wind was **NW 25 g40**: the west shore was upwind, and a canoe would have been pushed off it, east. Standing at the crews' landing in a NW wind, the player feels the canoe pushed off and away |
| **Walt**, 18 Oct **2019** ✅ | **Birch Lake (83), on the border** | Against the **south shore**, at the alders near (−13700, 4150) (see section 5 for the exact spot) | From the Moose Lake bunkhouse it is **all one water** (Moose, Newfound, Sucker, Birch are all 407.5 m; P46 Sucker–Birch is a 15 r bypass): ≥11.5 km, a night's paddle. The wind that night was **SSE 10–15, gusts 20** (Sheila Novak's report, page two). A canoe swamped anywhere on Birch would have fetched up on the north (Canadian) shore; it was found on the **south shore, upwind**. In truth he swamped it there, took the canoe he had hidden in the alders and crossed **Carp Portage** (P47, 45 r) into Canada |

**The drift test** (bible 5.5, a designed night set piece in the guiding arc): on a night with a S–SSE wind the player
stops **mid-Birch at about (−14000, 3800)**, lat 48.056, lon −91.403, where a man paddling the border would capsize,
and lets the canoe go. Birch there is about 1.3 km across, from the south shore at z ≈ 4480 to the north shore at
z ≈ 3175, with open water downwind: an SSE wind carries the hull north-north-west onto the north shore after roughly
550 m, every time, and never to the south shore. The islets near (−13750, 3700) and (−13700, 3650) lie east of that
drift line. The bible's anchor "near (−13700, 4150)" is the south-shore point; the spot is on the water about 460 m
north-west of it and 650 m north of the recommended alders (section 5).

**The year (settled):** Walt's night is **17–18 October 2019**.

---

## 4. Outfitters: the bunkhouse, the four groups, the journalist

All from the agreed ~14 (`campaigns.md`), with the build's store ids. **The player's own outfitter holds Walt's pack
and tent** (canon). The bible's logic: Marlys boxed the gear at Moose Lake on the morning of 18 October 2019; when the
outfitter changed hands in 2021 the old back-room stock went into the used-gear lot that moves between outfitters, so
the box ends up on a back shelf at whichever outfitter the player chooses, Moose Lake included (it came back there in
a different box after a season elsewhere). No tag, no name.

| Need | Settled | Why |
|---|---|---|
| **Walt's bunkhouse when he vanished** | **Moose Lake 25** (EP 25, (−21225, 11115), quota 27) | Busiest landing, so nobody notices a man leave at night. All one water to the border at Birch. Its reach includes Lake One, which ties in with the run. The cellar is 17 km away as the crow flies but about 50 km by water, so the bunkhouse does not give away the region |
| **The mining years** (old crewmen; Tauno; Len) | **Farm 31** (EP 31, (−39185, 21815)) | Its reach is Little Gabbro and South Kawishiwi, the exploration ground. It is the Ely road end. Tauno has coffee there; Northmark's open house is there in August |
| **The guiding years** | **Moose Lake 25** | He guided where the bunkhouse is. The tow docks, Basswood's resort shores and Prairie Portage are the real texture |
| **The boys** (one is the informant) | **Sawbill 38** (the store; Sawbill EP 38 and Baker EP 39 in its reach) | Their annual August trip, Sawbill to **Little Saganaga**, is ≥19.5 km with the 473 r Lujenida–Zenith carry they always complain about. Far from the cellar: their memories are of Walt, not of the ground. Low quotas, so they book in winter |
| **The family** | **Little Vermilion 12** (Crane Lake, EP 12 (−89005, −20325), quota 12) | The far west border landing, with Ontario across Sand Point Lake (≥11 km, no carries). A postcard from Canada makes sense here, and it is as far as the map goes from the Ely side |
| **The journalist** (first met) | **Hog Creek 36** (EP 36, (9685, 30915)) | A quiet outfitter in the Kawishiwi country where a stranger "fishing" badly stands out. Bog 67 is cut as her meeting place |
| **The S5 store** | **Round Lake 51** (Missing Link EP 51, (28165, 1755)) | Serves Larch Creek, Seagull and Saganaga: the way into the Kek and Ottertrack |

### The meeting point and the run

Maggie names two meeting points and the player picks one (bible 6.6). The run starts at the Gull landing
(−19835, 26740) at dusk. Every stash and every portage end is a checkpoint.

| Route | Path (portage, rods) | Paddle | Carry | Nights | Danger | Notes |
|---|---|---|---|---|---|---|
| **North, Walt's way** ✅ → **Lake One, EP 30** (Moose Lake's reach). **The designed run** | Gull → **P530** 50 → Pietro → **P27** 63 → Camdre → **P24** 121 → Clearwater → **P26** 214 → Rock Island → Lake Two (P233 30) → Kawishiwi R. (P234 39, P235 27) → Lake One | ≥11.6 km | 7 carries, **544 r** (2.7 km) | **One** long night: Gull to Lake One about 10 game hours | Small lakes, long dark carries, no open crossing. Clearwater (2.6 km²) is the only exposed water. Rock Island's 214 r in the dark is the set piece | Walt's escape plan; his stashes are on it. Ends crossing Lake One at first light past a watcher canoe off the EP 30 landing (fog, wind over 15, or a far site and a walk) |
| **West, the variant** → **Little Gabbro, EP 33**, then **Farm 31** | Gull → P256 50 → P255 205 → **Bald Eagle crossing** (~4 km open) → P693 6 → Gabbro → Little Gabbro; then the next dawn → P682 13 → S. Kawishiwi R. → P20 69 → Clear L. → P22 139 → Farm | ≥11 km to EP 33; ≥22.4 km to Farm | 2 carries (~255 r) to EP 33; 4–5 carries (~426–480 r) to Farm | **Two**, the second resting tied off | **Open water** on Bald Eagle: wind, whitecaps, swamping, seen from every shore; then river | The lot at Little Gabbro is full of trucks; Maggie's note under the permit box moves the meeting to Farm the next dawn |

If Denny has been turned, one watcher canoe goes south up the Isabella as a decoy. That is a watcher's route, not a
meeting point.

**Walt's escape stashes** on the north route (bible 6.6), found earlier as clues and recognised now:
- **the spare paddle** under the cedar at the **Pietro end of P530**, (−22705, 26855), with a white stone on it (June
  2018, the last stone before the watchers);
- **the dry bag** in the rocks at the **Camdre end of P24**, (−22275, 24755), with the handheld scanner and spare
  batteries;
- **the old Grumman** upside down in the alders at the **Rock Island end of P26**, (−20495, 22645); hide under it
  while a light goes by.

Clearwater, Pietro and Camdre are outside the burn; Rock Island is in it.

---

## 5. The route Walt took to Canada

| | Route | Distance | Carries | Notes |
|---|---|---|---|---|
| **✅** | **Moose Lake bunkhouse → Newfound → Sucker → Birch Lake** (swamp his canoe at the south-shore alders; take the hidden canoe and kit) **→ east along Birch to P47 Carp Portage 45 r → Carp Lake (Ontario) → north through Quetico, off the top of the map** | ≥11.5 km to the alders, then about 4 km along Birch to the portage | 1 carry before the border (45 r) | One night: out the back at ~23:50, the canoe swamped ~03:00, in Ontario by first light. Prairie Portage is passed by, not crossed. Quetico staff log the abandoned, number-ground canoe on 26 Oct at a landing on the park's north side, off the map |

**The places on it:**
- **The Birch alders and the tumbled stone.** The bible's anchor is "near (−13700, 4150)". In v3 campsite **C604's
  landing is at (−13673, 4114), 40 m from that point**, and Birch's south shore is lined with sites (C596–C608), so a
  canoe hidden there all through 2018–19 would be found. Recommended: the small south bay at about **(−14000, 4460)**,
  lat 48.050, lon −91.403, about 300 m from the nearest site and 420 m from the anchor. There: a cut rope end on an
  alder, and the white stone tumbled off its stump into the shallows, a white cobble in the water. If builders keep
  the anchor point instead, move C604's landing story-side or accept the clash knowingly (check C3).
- **The Carp-end stone.** At the **Carp Lake end of P47**, about **(−10054, 2049)**, lat 48.072, lon −91.350 (the
  Birch end is (−10266, 2118)). Walt set it on 18 October 2019; **Danielle found it the next spring**. In 2026 the
  player finds where it was, or Danielle shows it (bible 5.4, 5.6): the prop is a stump with a clean, unweathered
  ring where a stone sat, unless the scene needs the stone itself.
- **The drift-test spot** mid-Birch at about (−14000, 3800): section 3.

Not used: Moose → Sucker → P194 122 r → Basswood → P880 North Portage 130 r → Sunday Lake (Ontario), ≥15 km, 2 carries
(252 r); it crosses Prairie Portage at night.

The v3 map stops at about 48.4 N. Most of Quetico's interior is not in the data, so his route leaves the map soon
after Carp Lake. Leave it there: the last page points north and the rest is the postcard.

---

## 6. Walt's lakes and their nicknames

The bible's table (5.3.4) is the canon; this one adds the map facts. Each nickname matches one real lake. The player
pencils unmatched nicknames onto owned sheets; a pencil inks over only when the world confirms it.

| Nickname | Real lake (id) | Centroid x/z | His site / spot | From | Use |
|---|---|---|---|---|---|
| the Front Porch | Lake One (78) | (−19840, 18418) | C837 (−20229, 18509) | EP 30 (Moose Lake 25's reach) | Teaches matching; the run's end |
| the Front Room | Moose Lake (49) | (−21574, 10751) | — (the bunkhouse) | EP 25 | The last years |
| the Kitchen | Lake Insula (18) | (−5513, 19413) | C1655 (−6592, 18606) | EP 30: ≥16.6 km, 4 carries, 179 r | Walleye; a guide's lake; S8 |
| **Coffee Lake** | Alice Lake (44) | (−123, 16431) | C1690 "Site 1175" (−237, 15082), the beach site | EP 30: ≥22.4 km, 7 carries, 303 r | June's pot; S9; confirmed by Aili |
| the Kek | Kekekabic (39) | (2124, 2722) | C1292 (−409, 2727) | EP 54 Seagull (Round Lake 51): ≥36 km, 9 carries, 382 r; EP 30: ≥34 km, 11 carries | S5's wreck; the 2019 test (Frank was told "the Kek") |
| Little Sag | Little Saganaga (31) | (15919, 6185) | C1210 (15082, 6845), the sitting rock | Sawbill EP 38: ≥19.5 km, 2 carries, 514 r | The boys' lake, every August |
| **Gene's** | Frost Lake (207) | (29466, 10877) | C1125 (30072, 10720): **Gene's paddle** in the tree above the landing, blade up | Sawbill 38's reach (river-heavy, check) | The boys' favour; Carol's photo favour |
| the Long Room | Ottertrack (76) | (9555, −10198) | C1403 (10518, −9884) | EP 54 (Round Lake 51): ≥20.3 km, 3 carries, 131 r | The border cliffs, the clearest water in the data (Secchi 5.8 m) |
| Four Towns | Fourtown (61) | (−43257, 1058) | C1000 (−43324, 3061) | Mudro EP 22 (Slim 6): ≥7.7 km, 5 carries, 375 r | S3, the lights |
| **Mummo's** | Basswood (4), the Inlet Bay shore past P194 | — | **the ruin** at about (−17500, 3750), lat 48.056, lon −91.450, 399 m; C593 (−17635, 3577) is the party's site on the next point | EP 25: Moose → Newfound → Sucker → P194 122 r (Prairie Portage) → Inlet Bay, about 9 km | S7: the stone step, foundation, lilacs, rhubarb, bed frame, dock cribs seen from the canoe; June |
| the river | the Isabella River (186) | — | Denny's "Walt's spot": the watchers' camp, C911 (−12550, 30700) (section 1b) | EP 35 Isabella (Bog 67) | The 2019 test; the false lead that pays |
| **Two Stump** | **Gabbro (75)** | (−27857, 26210) | **the drill-road landing** on Gabbro's south shore, proposed at about **(−27500, 27590)**, lat 47.842, lon −91.584, 546 m from the nearest site: two waist-high stumps cut square in 1975 to tie off the sledges, birch growing out of the clearing | EP 33: about 4 km (check the Little Gabbro–Gabbro carry); a day trip | Region key (N13); decoded by Tauno |
| **V.'s water** | **Bald Eagle (55)** | (−25071, 29412) | C902 (−24786, 29992) | EP 33: ≥7.7 km, one 6 r carry | Region key; the echo; decoded by Tauno or Hap ("where they found Eino") |
| **the back door** | **Pietro (185)** | (−22438, 26033) | C1613 (−23238, 26328) | EP 30 via Rock Island: 5 carries | Lake key; the run's start; the wrong hill is on its north-east shore |
| **the far end** | **Gull (135), the east end** | (−21414, 27033) | C1539 (−20665, 26010) | EP 33 or EP 30 | The secret. No lake name, ever; no keeper can ring it. Only the player's pencil, inked by the world |
| the door | Birch (83) | (−13085, 3320) | C605 (−13290, 3892) | EP 25 | Walt's escape; read after the fact (Sheila's report) |

Walt's ~40 **starred sites** (the collector thread, each with a white stone on a stump or flat rock at the landing,
all set before June 2018) can be drawn from all regions, with none within 2 km of the Gull landing, so the collection
never gives the cellar away.

---

## 7. Side-story places (from Walt's notebook)

Each is a **site only**. The strange stays settler camp lore and is mostly explained. No Ojibwe sacred content. S-numbers
are the bible's (section 8).

| Story | Place | Alternatives | Travel | Notes |
|---|---|---|---|---|
| **S5, the plane on the Kek** (fiction; 1949, bound for a resort before the airban) | **Kekekabic Lake (39)**, the quiet north shore about (2825, 2495), lat 48.068, lon −91.177. In the shallows, seen from the canoe on a calm, bright day (Secchi 4.3 m) | Ottertrack (76), (11745, −12575); Gabimichigami (65) | EP 54 Seagull ≥36 km (Round Lake 51), or EP 30 ≥34 km | Uses the water-clarity system. Made-up plane and owner; no death; no real crash. The pilot's 1949 chart's straight cut ends at Gull's east bay (section 2a) |
| **S6, the whiskey road** (bootleggers' route and the false cache) | **Bootleg Lake (184)**, the quiet shore (−73055, 6265), lat 48.034, lon −92.196, by the beaver pond | The Loon Lake / **Beatty Portage** run on the border (P357 41 r, P962 65 r) | EP 9 / EP 14 (Little Indian Sioux) ≥11.8 km (river) | Prohibition-era route Canada → Lac La Croix → Loon → Little Indian Sioux → Bootleg. The false cache is an old tin box in a pit with a lid, built to look like what the player is hunting; it teaches pit and lid |
| **S3, lights over Four Towns** | **Fourtown (61)**, the north end (−44245, −485), lat 48.094, lon −91.809 | Lake Agnes (71); Iron Lake (25) | Mudro EP 22: ≥7.7 km, 5 carries, 375 r (Slim 6) | September–October nights; most of it explained (aurora, satellites, a lantern), one thing not |
| **S4, the wolves** | **Nina Moose → Lake Agnes** (158, 71), the Moose River (EP 16, quota 5) | Cummings Lake (42) | EP 16 → Agnes ≥10 km (river) | Howls at three, tracks on beaches, pups in August |
| **S2, the Squatch night** | **Big Moose Lake (74)**, the quiet shore (−65145, 6065) | Duck Lake (411) on the 479 r carry; Disappointment (69) | EP 16 (river), or Stuart EP 19 via the 563 r Stuart Portage and the 479 r Big Moose–Duck carry | A comic, scary night that teaches the tied-off rest |
| **S7, Mummo's** | Basswood, Inlet Bay shore past P194, the ruin near (−17500, 3750) | — | EP 25, about 9 km, P194 122 r | June lilacs (section 6) |
| **The pictograph cliff** | **North Hegman Lake (576)** | — | EP 77 South Hegman, ≥1.7 km | **World geography only.** Not a photo target, not a story site, no side story (S10 is cut), nothing on the dot, no board task. No decal or painted-rock detail beyond faded ochre seen at canoe distance, unless the Bois Forte Band is consulted |

S1 (Stuart Portage, 563 r), S8 (Lake Insula, the Kitchen) and S9 (Alice Lake, Coffee Lake) are placed in the bible's
side-story table and in section 6.

---

## 8. What fiction must be added to the world data

| Item | Where | How |
|---|---|---|
| **The unmapped portage** | Gull Lake east landing (−19835, 26740) → pond 4747 → camp (−19385, 27355), ~880 m / ~175 r | New `fix: "story"` portage, `hidden: true`: not on sheets, not in keepers' rings, inked only once walked. Walker, trail tunnel and portage verbs as usual |
| **The beaver dam, stump, stone and rod** | (−19835, 26740) | A fixed dam on the creek mouth; the cut stump with the white stone; fall low water shows the step and the drill-rod canoe rest |
| **The orange-dab blazes** | East bank of pond 4747 | Smudged 1976 blazes, readable after Tauno |
| **The camp under its cedar** | Knob (−19385, 27355), 479 m, in the 2011 burn | Drill rod, skid sill, drum stove, core-box shelf, cot, boots, bark-and-moss roof under a cedar island. Kept from the forest builder by an exclusion; the cedar island kept and drawn |
| **The floorboard and the coffee can** | In the camp, beside the drum stove | A liftable board with a white stone set in the floor at its corner; the can of three torn pages under it |
| **The cellar and the core spill** | Ridge (−18885, 27725), 485 m; spill from the camp's back door | A slumped square pit, bunchberry in a square, a timber lid under moss that breaks as it lifts; the cans and Eino's note |
| **The notch and the burnt point** | Notch (−19340, 26805); burnt point (−21250, 26550) | Section 2a; the notch is a story feature unless v9 already has one there |
| **The crews' landing and the grade** | Bald Eagle west shore (−25825, 29925); grade ~1.3 km south-west | A rotten crib, a 1977 blaze with orange and a fresh pink flag; the grade into the trees; casings in the moss along it |
| **The west pads and the Kettle pad** | Provisional: pads along the grade; the Kettle pad at about (−26950, 30600). **Void until check A1** | Grown-over pad clearings, casings, core-box racks (one lid with Leo's initials); at the Kettle pad the water-filled trench, the stockpile mound, the creek below running faintly orange after rain |
| **Two Stump** | Gabbro south shore, proposed (−27500, 27590) | Two square-cut stumps, a birch-grown clearing |
| **The Pietro dig** | Landing (−21455, 25235); dig near the hilltop (−21210, 25060) | Sunken turned ground, spoil, rotten flags on lath, the snapped shovel blade, a survey tag |
| **The Isabella watchers' camp** | C911 (−12550, 30700), proposed | Old Northmark flagging, a coffee can of butts, a lashed sapling antenna, the Helstrom receipt |
| **Walt's escape stashes** | Pietro end of P530 (−22705, 26855); Camdre end of P24 (−22275, 24755); Rock Island end of P26 (−20495, 22645) | The spare paddle under a white stone; the dry bag with the scanner; the Grumman upside down in the alders. Story-gated |
| **The Birch alders and the tumbled stone** | Recommended (−14000, 4460); anchor near (−13700, 4150) | A cut rope end on an alder; a white cobble in the shallows |
| **The drift-test spot** | Mid-Birch (−14000, 3800) | No prop: a story trigger for the drift test |
| **The Carp-end stone** | Carp Lake end of P47 (−10054, 2049) | The stump where the stone sat (Danielle has it) |
| **Mummo's ruin** | Basswood Inlet Bay (−17500, 3750) | Stone step, foundation, lilacs, rhubarb, bed frame, dock cribs |
| **Gene's paddle** | Frost, above C1125's landing (30072, 10720) | A paddle carved *G.A. '87* with five notches, blade up in a tree |
| **The white stones at the starred sites** | ~40 starred sites (none within 2 km of the Gull landing) | A white quartz cobble on a stump or flat rock at each landing |
| **The wreck, the false cache, the lights' camp, the den, the Squatch site** | Section 7 points | Props per side story |

None of these may be written into `index.json` or a bake. They belong in a story layer, `src/story-places.json` or a
`story` section of world-fixes, keyed by **name + x/z** so they survive the move from v3 to v9 ids. The pictograph
cliff is not in the story layer.

---

## 9. To check before building

**A. The bible's checks (bible 10).**
1. **Real mineral ground.** Check the west pads, the Kettle pad (provisional (−26950, 30600)), the grade and the Kettle
   project's footprint against the real **Spruce Road** and **Maturi** deposits and the federal lease and
   mineral-withdrawal maps; move anything that overlaps. Confirm the pads are just outside the wilderness boundary and
   that "Kettle" is not a real deposit or project name in Minnesota (the real Kettle Lake near the Kek is unrelated
   and never linked to it). Confirm in OSM/NHD that the reach chosen for the Kettle creek has **no real name**; if it
   is a named creek (Nickel, Cobalt, Filson or any other), pick another reach.
2. **County lines.** Moose Lake, Birch Lake (border), Bald Eagle and Little Gabbro should all be in Lake County;
   verify before Sheila, the 1977 file or the rescue squad are named on screen.
3. **The rods.** Find P289 Little Trout–Rum (64 r), P645 Snowbank–Disappointment (140 r) and P188 Grandpa–Sea Gull
   (185 r) in v9 by name and x/z, and check each is on the common first trips from its outfitter.
4. **New behaviour.** A loose empty hull drifting with the wind (short range, for the drift test and the warning); the
   tie-off rest; bound story items; the lot that cannot be left with the cans; the player's pencil on map sheets.
5. **The bearing.** The pit's 126° from the knob is the midwinter sunrise at 48° N; keep the pit and the "Christmas"
   page in step if either moves.
6. **Permits.** Quota reservations run 1 May – 30 Sep; in October permits are self-issued at the entry point.
7. **The 205/50 pair.** In v9, check that a 205 r carry followed directly by a 50 r carry (each ±1 rod, either order)
   occurs only at Bald Eagle–Gull (P255, P256).
8. **The slide's photo match** uses the terrain silhouette (the notch) with vegetation ignored.
9. **The sketch.** Pond 4747 at about 297° from the knob, the pit at about 126°; the sketch drawn flipped (pond east,
   pit south-west). Keep them in step if the knob, pond or pit moves.

**B. The far end.**
1. **The v9 ids.** Look up Gull Lake's east bay, the beaver ponds (data 12195 / 4747 / 10620) and the knob in the v9
   tiles. NHDPlus outlines may draw the ponds differently.
2. **Bald Eagle – Gull.** The data has P255 at 205 r plus P256 at 50 r at the narrows. Check what the game draws,
   because a keeper will quote it.
3. **The burn.** The landing, camp, pit, notch and burnt point all read "Pagami Creek 2011" in the burns layer (the
   burnt point also "Turtle 2006"); the knob's cedar island must be kept out of the burn look.
4. **The camp from the air.** From any camera height the player can reach, the camp must not show through the cedar.
5. **The notch.** In v9 terrain, look from Gull's east bay (anywhere on the line from the burnt point (−21250, 26550)
   to the creek mouth (−19835, 26740), bearing about 98°) and confirm a notch on the skyline directly behind the
   creek mouth. If the terrain has one, move the notch point onto it and rename nothing. If not (as in v3, where the
   skyline has no notch deeper than a metre or two), build the story notch at (−19340, 26805) as in 2a and move S5's
   chart line end to it. Either way, confirm the burnt point, the creek mouth and the notch line up within a few
   degrees from the water, and that the old lineament (−20370, 25500)–(−19900, 26270) is not what the player reads as
   the notch.
6. **The Pietro hill.** In v9, confirm the landing (−21455, 25235), the hilltop (~(−21200, 25050), 493 m) and pond 3732,
   and that no creek or beaver water lies near the dig.

**C. The new story places: inside tiles, reachable, clear of traffic.**
1. **The Kettle pad and west pads**: inside loaded tiles, walkable from the crews' landing along the grade (v3: about
   1.3 km, steepest pitch about 23 %), within about 1.5 km of the landing, and just outside the wilderness (A1).
2. **The Isabella watchers' camp** (C911, or C910): in v9 on the river below Isabella Lake, one of Denny's five rings,
   and reachable from EP 35 with the river carries paddled in game.
3. **The Birch alders**: confirm the recommended bay (−14000, 4460) is alder shore at least ~300 m from any site
   landing in v9, and that the tumbled stone shows in the shallows on a calm day. If the anchor (−13700, 4150) is kept,
   resolve the clash with C604's landing (40 m).
4. **The drift-test spot** (−14000, 3800): open water in v9, with the north shore about 550 m downwind of an SSE wind
   and no island on the drift line (v3 has islets near (−13750, 3700) and (−13700, 3650), east of the line).
5. **The Carp-end stone** (−10054, 2049): on the Carp Lake (Ontario) end of P47 in v9.
6. **Two Stump** (−27500, 27590): on Gabbro's south shore in v9, a landing a canoe can reach, away from sites, and a
   believable foot of a winter road toward the west pads.
7. **Mummo's ruin** (−17500, 3750): dry shore on Basswood's Inlet Bay past P194 in v9, with C593 on the next point.
8. **Gene's paddle** at C1125: in the crotch of the pine above the landing, blade up (as `10-notebook.md` and `32-the-boys.md`).
9. **The Pietro dig** (2b) and the three stashes: each on its portage end or landing in v9.

**D. Other.**
1. **River carries.** The router counts carries on rivers short (Isabella River, Moose River, Little Indian Sioux,
   Sawbill–Frost, Hog Creek–Polly). Paddle them in game before you quote them in a board task or a keeper's line.
2. **Quotas as gameplay.** Little Gabbro (2), Isabella (2), Bog (1) and Baker (2) fill in July. That pushes the cellar
   hunt to fall, which suits "best found in fall".

---

## New details (for the continuity check)

1. **The burnt point** is the headland at the north-west mouth of Gull's east bay, about (−21250, 26550), in both the
   Pagami Creek (2011) and Turtle (2006) burns; bearing ~98° and 1.43 km to the creek mouth.
2. **The notch** is on the hump about 500 m behind the creek mouth at (−19340, 26805), 481 m, on the burnt-point line;
   a story-layer feature unless v9 shows a natural notch there. The old lineament is no longer the notch.
3. **S5's 1949 cut** runs up through that notch and ends at the creek mouth.
4. **The Kettle pad** provisional spot: the closed hollow at (−26950, 30600), 1.3 km from the crews' landing; the
   Kettle creek drains it north to Bald Eagle's south-west shore. The grade is about 1.3 km long. All void until the
   real-deposit check.
5. **The Isabella watchers' camp** at C911 (−12550, 30700), alternative C910.
6. **The Birch alders** recommended at (−14000, 4460), moved off C604's landing; the anchor (−13700, 4150) stays as
   "near".
7. **The drift-test spot** at (−14000, 3800), mid-Birch, about 550 m upwind of the north shore in an SSE wind, clear
   of the islets near (−13750, 3700).
8. **The Carp-end stone** at the Carp Lake end of P47, (−10054, 2049); the prop shows where it sat, since Danielle has
   it.
9. **Two Stump** proposed at (−27500, 27590) on Gabbro's south shore.
10. **The Pietro dig** near the hilltop at (−21210, 25060), 493 m, about 310 m up from the landing.
11. **Mummo's ruin** at (−17500, 3750), as proposed in `10-notebook.md`.
12. The Moose Lake EP point is taken from the data, (−21225, 11115) (the old draft had (−21245, 11415)).
