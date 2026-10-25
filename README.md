# BWCA Canoe

**Play it: https://gkrumbach07.github.io/bwca-canoe/** (a computer with a keyboard and mouse; about 20 MB
of map data streams in as you paddle).

**Watch the trailer:** [67 seconds, 720p, no sound](https://github.com/Gkrumbach07/bwca-canoe/releases/download/trailer-v2/bwca-trailer-v2-720p.mp4),
recorded frame by frame from the game ([`scripts/trailer/`](scripts/trailer/)).

[![Dusk on Lake One, from the trailer](docs/images/trailer-poster.jpg)](https://github.com/Gkrumbach07/bwca-canoe/releases/download/trailer-v2/bwca-trailer-v2-720p.mp4)

A quiet canoeing game set on real terrain in the Boundary Waters Canoe Area Wilderness: the whole
wilderness, from Crane Lake to the Pigeon River, streamed in 2.56 km tiles as you paddle. You start at the
Lake One landing (entry point 30) east of Ely, Minnesota.

- **Real elevation**: USGS 3DEP / SRTM heights via the public AWS Terrain Tiles (Terrarium encoding).
- **Real lakes, portages, campsites and entry points**: OpenStreetMap, from an offline Geofabrik extract.
  Creeks that OSM maps only as lines are water too, and rivers descend between lakes.
- **Real depths** where the Minnesota DNR has mapped the lake: its bathymetric contours shape the bed
  (85 lakes in the Boundary Waters, Snowbank at 43 m, Loon at 64 m); the HUD shows the depth under the canoe.
- **Real clarity**: every lake carries its mean Secchi depth from the DNR's lake data (272 measured lakes in the
  area, from 0.6 m bog water to 8.9 m at Clearwater; the rest estimated from their neighbours). Clear lakes
  are blue-green and show the bed far out; tea-stained lakes go olive-brown and close up within a few metres.
  The bed itself is coloured by depth: sand, shelf, weed, drop-off, hole.
- **Everything else is procedural**: terrain colouring, lake beds, nine tree species with per-tree variation,
  shoreline boulders, campsites (fire grate, log, tent), portage trails and markers, the canoe, the paddler
  and the paddle stroke, the water, the sky and the clouds. No external assets.
- **Streamed world**: a 10 m grid of 200 x 69 km (138 million cells) is baked into 2,106 tiles; the game keeps
  the 5 x 5 tiles around the canoe built (terrain, water, forest, lake plants, trails) in a pool of web
  workers, a coarse 80 m far field underneath, and lets the rest go.
- **GPS simulation**: the canoe's real-world latitude/longitude is broadcast as the device location,
  so other tabs that ask for geolocation see you paddling (see *GPS simulator* below).
- **The pace** (`src/pace.js`): a game day covers a real BWCA day's distance. Everything moves at life pace (a solo
  canoe at a tripper's 5.8 km an hour in strokes of about 1.6 m, a 3 mph walk in steps of about 0.7 m, a portage carry
  at 3 km an hour), and while you travel the canoe and the clock are time-lapsed together: at **Trip** pace (the
  default; Settings › Controls › Pace) ×4 on open water, a game hour of paddling in about fifteen real minutes, and up
  to ×3 on a portage trail, so a travel day of 4 to 6 game hours covers 20 to 25 km. The canoe's boost builds once the
  stroke is steady and eases off on a slow stroke, in a hard turn and in the last few metres before a bank dead ahead,
  but not along a shore or into a dock. Camp, chores, fishing and walking off a trail stay at life with the clock at
  12×. **Real** pace is 1:1 throughout. A "trip ×4" mark sits bottom right while the boost carries you, and the
  readout (Tab) gives the clock's rate and the km an hour, averaged over a stroke or two. The game keeps to the wall
  clock at any frame rate (a slow frame runs as several steps), so 5.8 km an hour is 5.8 km an hour.
- **A day in the Boundary Waters**: a day/night cycle on the pace's clock with the real sun and moon for the date and
  the clock (`src/astro.js`: sunrise and sunset shift through the year, the moon shows its phase), a
  sky-matched haze, golden light at the ends of the day, the clouds, the water, stars, with dawn mist over
  the lakes. The game starts on today's date at the current time.
- **Seasons** (`src/season.js`, from the day of the year): the lakes are frozen until ice-out in early May and
  again from late November; birch and aspen leaf out pale green in mid-May, turn gold in the last half of
  September and drop by the end of October, shrubs go red; grass goes tawny in the fall; lily pads are on the
  water from June to late September, fireweed blooms in high summer, loons are on the lakes from May to
  October, and cold mornings bring heavier mist. `day.season` carries all of it for anything else to use. Lakes are clear in the shallows
  (lily pads, reeds and weeds grow in sheltered water) and tannin-dark in the deep. Loons drift, dive and
  call; wind, lapping water and paddle dips are synthesized, no samples.
- **The look** (`docs/look.md`, after Firewatch): the ground is a painted splat of eight materials blended
  through world-space noise, so transitions are soft bands and never polygon edges; one smooth light model
  for everything (`src/shading.js`: Lambert, wrapped on the leaves, the sky as a hemisphere fill, soft
  stable shadows), with occlusion baked into every tree, rock and hull; grass tufts and fireweed near the camera.

## Run

```bash
npm install
npm run bake:all
npm run dev
```

Open http://localhost:5173. The game opens on a title screen over the live lake: **Continue** (or **Paddle in**
before any season) picks up the season saved in this browser (or starts one at Lake One), **New season** starts
one at any BWCA entry point, **Settings**
has the quality, sound and control options (applied live, kept in `localStorage`). **Esc** brings the
same screen up as a pause menu while playing. The baked map data lives in `public/data/` and is not committed (about 380 MB
of tiles); the first bake downloads the Minnesota OpenStreetMap extract (290 MB) and about 5,800 elevation
tiles (500 MB) into `data-cache/`, then bakes the whole wilderness in about a minute (3 GB of RAM). Re-bakes
use the cache and finish in the same minute. For a quick test bake of the Lake One area only:

```bash
npm run bake
```

Other areas: `node scripts/bake.mjs --bbox S,W,N,E` (degrees). The areas and the grid/tile layout are in
`scripts/config.mjs`. If `osmium` is installed the extract is cut to the area first (seconds); without it the
extract is scanned in Node (about 15 s). The bake needs network access to `download.geofabrik.de` and
`s3.amazonaws.com/elevation-tiles-prod` the first time.

## Controls

The HUD is quiet by default: the screen belongs to the lake, and nothing is drawn until it has something
to say. Two materials: *Air* (cream type set straight on the scene: the compass top right, one action line
bottom centre, the place title and the journal lines bottom left, the status marks bottom right at half
strength) and *Paper* (cream sheets you take out and put back: the map, the journal, the outfitter's
counter, one at a time on a scrim). The numbers live behind held keys.

The whole set of keys (the owner's second round of 2026-10-25: "We need to go through all the keys again … It should
just be one key, I, to get into the inventory"): **W A S D** and the mouse, **Shift**, **Space**, **E** and **Q** on the
dot, **F**, **I**, **M**, **Tab** held, **V**, **H**, **C**, **1 2 3** and **Esc**; in the book a right-click, and **R**
only while you drag a thing. A few keys mean something only where they are shown on the screen: the numbers pick a lure
with the rod up and a choice while you talk, A D (or ← →) turn the Rest dial, E and Q keep or let go a landed fish.
J, L, T, K, R (the shore in the water: Settings › Display), N (sound: Settings › Sound), Ctrl-click and Tab in the
book are gone. The first time a key would help (6 s of walking: Shift; 10 s under way: 1 2 3; the first dusk: H; the
first time on foot: V; a shelf within reach: E; beside your canoe with things on the ground: I; the first greyed verb on
the dot: a right-click in the book) a small card above the action line names it for 6 s, once a season (Settings › HUD ›
Key hints turns them off with the keys on the action line); a key you have already pressed is not offered.

| Key | Action |
|---|---|
| W A S D | afloat: W and S paddle forward and back, A and D turn the hull while held, as sweep strokes, in both views. On foot: walk where you look, W toward it, S back, A and D strafe. Past your depth: swim (W a breaststroke, still you tread water) |
| mouse | look. In first person, and on land in third person, the mouse turns you the way it does in Minecraft: the first key or click takes the mouse, every movement turns the look at once, Esc frees the mouse (Esc again opens the menu). On land the body faces the look and WASD moves relative to it, and the dot in the middle of the view is what E and Q act on; in third person the camera sits behind you, the mouse's tilt swings it up or down, and the trees, shrubs and ferns between it and you are seen through (it pulls in only for the ground, rocks, logs and walls, on a spring). Behind the canoe the cursor stays free: drag to orbit, wheel to zoom. *Settings › Steer the canoe where you point*: while you hold W the bow turns toward the cursor's point on the water, or toward the look in first person |
| Shift | on foot a jog (a longer stride with both feet off the ground between steps); afloat a hustle; swimming a hard stroke |
| Space | afloat: brace (steadies the hull in a sea; you cannot paddle while bracing). The balance arc appears above the action line while the sea is working the hull. On foot, moving into something: vault over a down log or a low rock (waist high and thin), or climb onto a rock, a ledge, a bank or a dock up to about 2 m (hold it into them; the prompt says which when you are pressed against one); otherwise a hop, about 0.4 m (with the canoe on your shoulders you only stagger). Swimming: held into a rock, a dock or a bank low over the water, climb out |
| E | afloat: go ashore when the canoe is close to a bank, and at a portage landing the same (the canoe glides in to the trail's put-in and you step out beside it, beached: no special portage key); at an outfitter's dock, come alongside and step up onto the deck (you walk up the steps and through the door, no Space needed); right the canoe after a capsize; pick up a found item. **On foot, E and Q are the dot's** (the world cards, the owner's third round of 2026-10-24: "at most an item can have two quick actions. primary is E and secondary is Q"): a small quiet dot sits in the middle of the view (in third person along the camera; looking down, the view moves over your right shoulder), and whatever it points at within reach has at most two actions, both written under the dot ("E Get in · Q Shoulder it"; a held one says *hold E*), and nothing ever has a third key. E is the primary: **pick up** a dead branch or a short log (into your arms), a pack, a barrel, a bucket, a tackle box or a bagged tent on the ground, a lost item a notice sent you for; **take one** from a pile (into what you carry, else a free hand); **pick** berries and mushrooms in season; **talk** to someone, the keeper behind a counter too (a conversation in a panel at the bottom, opening with what that person last said to you and when: choose with the numbers or a click, Esc to leave); **open** a store's counter, its cork board, a shelf (from either side), the lure wall or the map table, and **open the fire** at a fire ring (its card on the right; your tabs and what is around you on the left: drag wood into the fuel, the pot and a meal onto the grate, Light held, Cook, Eat there and then, Douse held; E or Esc closes it); **Lower** a hung barrel; **Hang** (hold) the barrel in your hands at a tree with a good limb; **Rest until…** at a pitched tent (a small dial: A D or ← → for the hour, E rests until then, Esc lets it be); **Sit** on a bench, a log seat or the latrine (E or a move key stands you up); **Get in** the canoe where it floats, as it lies (what you wear goes into the hull: back, chest and hands), or, beached, **hold E Push it off** (you walk it out until it floats); **Tie up** at a dock from the water; **Fill the bottle** at the water's edge; **Saw** (hold) a down log with the saw in reach. Pointed at nothing, E does nothing. With the canoe overhead, E launches at a shore with water enough or sets the canoe down |
| Q | the dot's secondary action, never a drop: **Open it** on a barrel, pack, bucket or tackle box on the ground and **Open the pile** on a pile (the book, with that thing's tab open on the right; I or Esc closes); at the fire ring, **Light** (hold) when it is laid, **Douse** (hold) when it burns; **Strike** (hold) a pitched tent; **Pitch** a bagged tent on the ground (the ghost at the dot, then hold); **Shoulder** the canoe lying by (only the paddle in use, the rod and the stringer ride in it overhead; with anything else aboard the label reads "Unload it first" and Q opens the book with the canoe on the right). Travel: at a trail head fetch what was left there; with the canoe overhead, take one more pack or barrel too (one heavy trip), set it down, or launch and leave what is left |
| F | take up the fishing rod / put it down (see *Fishing*); on foot with the rod in a hand (drag it to a hand slot, or Put in hand), facing water within casting reach, the same cast keys and card from the shore, a dock or a rock. With the rod up: **Space** or the mouse button holds to load a cast where the reticle sits and lets go, sets the hook on a bite, holds to reel in a fight; **W** retrieves (Shift faster); the numbers pick a lure from the strip above the action line (only the ones with you; the bobber rig's leeches come from the bucket in reach, "needs leeches" when there is none). A landed fish: **E** keeps it (into your hand; into a pack in reach with both hands full; into a notice's cooler when one taken on wants it: the prompt says which), **Q** lets it go. *Put on the stringer* is the fish's verb in the book while the stringer is in reach |
| I | the book, and I or Esc closes it: **Pack** and **Journal** are tabs inside it (click them). The pack: **left is you, right is what's around you**. Left: the body (the back: a pack or the 60 L barrel; the chest: a second pack or a barrel; each hand: anything, a thing, a container or a long thing; the pockets: the bottle in the first cell with its litre bar, and four quick slots for small things) and across the top a tab per container you carry, one grid open at a time; a nested container (the tackle box in the pack) has its own tab. Right: a tab for each thing within reach that isn't on you (the canoe beside you, each pack, barrel, bucket or tackle box on the ground, the wood pile, and the ground for loose things), one grid at a time; "Nothing within reach" when there is none. With a card open (the fire, a shelf, the counter) the card is the right side and the left has your tabs then the ground's. **Drag** between any two tabs, either way, a pack or a barrel by its strap to your back, your chest, a hand or the canoe; **R** turns a thing while you drag it (a drop that fits only turned turns by itself), Shift-drag splits a stack; drag it off the book and it lies on the ground at your feet. **Right-click** a thing for its verbs, and nothing else: Eat (a serving, instant), Drink and Drink up (the bottle: a gulp is 0.25 L; nothing is drunk for you), Pitch, Hang, Put in hand, Put on the stringer, Change into dry clothes, Tie it on, Look at the map; a greyed verb says why, with what it needs (a checklist, a count out of a total, a timer) and the next thing to do. **Hover** for what a thing is for, what it does in numbers, its weight and its state with its next step. The Journal tab: the trip (food, energy, kilometres, portages, lakes, nights, notices on the go) and Catches / Tasks / Lakes / Trips / Photos |
| M | hold for a glance at the map (a half-sheet, 5 km across, slides up from the bottom right); press for the full sheet: drag to pan, wheel to zoom, click a spot and a pencil note says the way there (in Sandbox it asks before the canoe is moved); the header toggles the layers; M or Esc puts it away. Maps are owned, not carried: in the wild M shows only the Fisher sheets you have bought, cut at their neatlines with everything on them, and blank paper elsewhere (with none, "No sheets yet": you and a compass on paper). In a store, at its counter or at its map table it shows the whole Boundary Waters with the 39 sheets dotted over it, "$8 here" in red at the table that sells them, "✓ yours" in ink; Sandbox shows everything everywhere. A keeper's insider word is a pencilled ring |
| Tab | hold for the readout, the moment only (the owner, 2026-10-25): the place, the time and the day, sunrise and sunset, the wind and the waves, the temperature and the sky, your speed and heading (Settings › HUD can make it a toggle, or keep it up; Developer adds the GPS sim, tiles, FPS and triangles). The rest is in the journal. The energy bar, the clock and the day stay up in a strip at the top over the book, every card, the map and the Rest dial |
| V | the view: from the paddler's eyes, or from behind |
| H | the headlamp, afloat or on foot, day or night (by day the beam shows in the shade; it goes off when you sleep) |
| C | the camera, when you have one (the $25 35 mm from an outfitter's gear shelf, or the disposable the season's first photo notice lends you for three pictures): the view goes to the eye in the print's 16:9 frame; the mouse (or the arrows and WASD, Shift for a fine hand) aims, the wheel (or Q and E held) zooms from a 50 mm to a 300 mm lens, Space or a click takes the picture, C or Esc lowers it. You hold still while it is up, and the clock runs at life's pace. A subject counts when it is near the middle of the print, near enough and in sight; the prints are kept in the journal's Photos tab |
| 1 2 3 | the pace: 1×, 2×, 4× on top of Trip or Real (*Settings › Controls › Pace*). Whenever it changes a note above the status marks says so for 3 s, with what the clock does ("Trip pace ×2 · the clock runs ×8 on the water, ×6 on a trail, ×24 at camp"); the ×2 mark stays bottom right while it is up. With the rod up the numbers pick a lure instead |
| Esc | frees the mouse when the look has taken it; closes the book, a card or the Rest dial; puts away a tent's ghost; otherwise pause: the title screen with Paddle on / New season / Settings / Controls (Esc again, or Enter, resumes); Controls shows these keys in the game |
| Sandbox only | **[ ]** the time of day back / forward an hour · **- =** the date back / forward a day (with Shift, a month) · **P** stop the clock · **, .** less / more wind · **/** veer the wind 30° · **;** hand the wind back to the weather. The map sheet: click a spot to paddle in there (teleport to the nearest open water, anywhere in the wilderness) |
| the title's entry points | the list beside *New season* starts a season with its home at one of the BWCA entry point landings, travelling the way picked above it: *Adventure* (open trips: food to buy, notices to take, real rules) or *Sandbox* (no limits); you begin tied up at the home store's door. Over a season under way New season asks once first, naming the season it forgets ("Adventure · home Lake One · day 1 · $38 · the aluminium canoe and a pack · 1 outfitter known") |

What the HUD says on its own: the compass sits at the top right at half strength, its gold arrow on the rim
where the wind is going, and speaks (full strength, the Beaufort name, the speed, the waves) when the wind
matters: a fresh breeze and up, or waves over 0.3 m. Arriving on a named lake puts its name up bottom left for
four seconds with the day, the hour and the wind over it and the portages, kilometres and the lake's size
under it; dawn puts the day up the same way. Notes (a meal, a find, a word from the outfitter) are journal
lines bottom left, two at most, five seconds each. *Settings › HUD* has the density (Quiet: prompts and the
balance arc only, the compass only when the wind matters; Standard; Full: the readout always on and a corner
sheet of the map), and switches for the place titles, the compass, the readout, the corner sheet, the journal
lines, the key hints, the HUD size and colour-blind marks. On an Adventure the energy bar sits top left when it
matters, one thin bar the way Wild n Chill draws it: green is the energy you have, and at its end a chunk for each need
that has taken some of how high it can go, cold (a snowflake, dotted pale blue), sleep (zz, orange), hunger (a fork
and knife, yellow) and thirst (a drop, blue), dashed while it grows. Warmth falls below a felt 12 °C, faster wet
through, in the water and after dark, and comes back by a fire, indoors and in the tent and bag.

Paddle up to any bank and press **E**: the canoe noses in, you step out, and it lies there beached, bow on the land;
the dot on it reads **E Get in** (where it floats, as it lies) or, beached, **hold E Push it off**, and **Q Shoulder it**. On foot WASD walks relative to the view (W into the
screen, D to its right; with the mouse look the body faces the look and the walker strides, backs up or side-steps
as the keys say), at life pace: 1.35 m/s (a jog at 2.9 with Shift; with the canoe on your shoulders about 0.85,
3 km an hour, by the load). On a portage trail the walk is time-lapsed with the clock at Trip pace (seen at about
2.5 m/s under the canoe, up to ×3), and off a trail outside a camp, a store and its yard too, ×1.8 (seen at about
2.4 m/s, the clock following, so a game hour still covers a real walk). Only the hills cost, less on a graded trail,
and a slope past 40° stops you. Everything solid holds you off at its drawn edge and you slide along it: trunks
at their drawn girth, rocks, the bluffs' cliffs and scree, down logs, stumps, walls. One lower than a step (a
slab, a small rock, a thin log) you step up onto. Walking into something waist high and thin (a down log, a low
rock), **Space** vaults you over it; into a rock, a ledge or a bank up to about 2 m with room on top, **Space**
held climbs you up onto it, hands and then a knee; walk on across it and you drop off the far side (a drop of
more than about 2.6 m is refused at its edge). Pressed against one, the prompt says which. Otherwise **Space**
hops about 0.4 m. The water drags at your legs as it deepens; chest deep you swim (W a slow breaststroke, Shift
a hard one, still you tread water, and it costs energy), and where it shallows you stand and wade out again. A
swimmer climbs out onto a rock, a dock or a low bank with **Space** held into it, and **E** beside the beached
canoe pushes it off and climbs in. With the canoe on your shoulders you wade no deeper than your thighs. The
readout's km/h is the ground you actually make good per hour of the game's clock, so it falls to nothing while
something holds you. A canoe you have left
shows on the map; back within 3 m of it, the dot on it and **E** gets in and launches it (**Q** shoulders it instead), and if the water
there is too shallow for a canoe the prompt says so. Carrying, **E** launches at any shore with a metre of
water within reach, or sets the canoe down where there is none, and the hull overhead catches on trees
and may come down. Walk into a campsite and the readout names it.

At a portage landing (the trail marker on shore) **E** goes ashore like at any bank, in at the trail's put-in: you
step out by the trail with the canoe beached and nothing on your shoulders. **Q** on the hull shoulders it once only
the paddle, the rod and the stringer ride in it (else "Unload it first" opens the book at the canoe), and the action
line counts the rods to go along the real trail. Portage lengths are shown in rods, as on every BWCA map.

The title and pause screens are keyboard-first: the arrows move between items (← → between the menu and the
entry points), Enter picks, Esc goes back. Settings (`src/settings.js`) come in sections: Display (shadow map
size, tree detail and cull distance, render scale, the shore and sky in the water), Sound (volume, mute),
Controls (mouse sensitivity, inverted look, cursor steering, the pace, the game speed and camera a trip starts with),
HUD (above) and Developer (the GPS simulator's state, FPS and triangles and the tiles as rows of the readout).
The canoe's position, heading, the day clock and the camera mode are saved every few seconds
(`src/save.js`, one `localStorage` document per namespace under `bwca-canoe:`; the journal's trip tally
is `stats`, the HUD settings `settings`) so **Continue** picks the trip up where it stopped.

## Wind and waves

Every day has its own wind (`src/wind.js`): a character rolled at midnight from glassy to a blow, a breeze that
builds through the afternoon and dies at dusk, gusts, and a direction that veers slowly. Waves are built from
it (`src/waves.js`): eight fixed wave directions each carry a 26 m swell and a 6.5 m chop, the wind sets how much
each direction carries and how tall the waves are from the wind speed and the **fetch**, the open water upwind
of each spot (marched across the water's surface atlas whenever the wind moves to a new 15° bucket). So a
small lake stays flat in a gale while the downwind shore of a big one builds whitecaps. The canoe drifts
downwind and its bow falls off the wind. Broadside to real waves the hull rolls; quarter the waves or hold
**Space** to brace, or over you go: the hull floats upside down, drifting, and you swim to it (W/S, A/D; you
cannot leave it and wade off) and press **E** to right it and climb back in. On a calm day the canoe cannot be tipped.

## Fishing

Fishing is the thing to do out here (`src/fishing.js`). Press **F** in the canoe and the paddle goes across the
gunwales and the rod comes up; the line under the readout says what kind of water you are sitting in
("Rocky point · 4 m, drop-off to 9 m · walleye and smallmouth water", "Weedy bay · 1.8 m · pike water"), read
from the real bed, the shore distance, the weed beds and the bedrock shores around the canoe. Pick a lure with
the number keys (jig, spinner, spoon, crankbait, a leech 2.4 m under a bobber, the weedless Silver Minnow or the Lazy
Ike: only the ones with you, in a tackle box or the leech bucket you can reach, numbered in the strip's order; bought on
an outfitter's lure wall), hold **Space** or the mouse button
to load the cast and let go: the lure flies to where the cursor points (in first person the view itself follows
the cursor); a pale ring on the water marks the spot, a full load drops the lure on it and a short one falls short. It
splashes down and sinks at its own rate, or the bobber rides the swell. **W** retrieves (Shift faster;
a crankbait dives, a spinner runs shallow, a jig hops along the bottom, the leech is best left alone), and you
can change lures again once it is back at the rod.

Fish bite at a rate built from where the lure is, not from a timer: walleye on rocky points and drop-offs in
3–11 m at dawn, dusk and night, by day more willing in tea-stained water and in a light chop; smallmouth off
bedrock shores in clear water; northern pike in weedy bays; crappie and perch in the weeds; lake trout only
deep, in lakes the DNR maps deeper than 20 m. The lure's depth, its action, the hour, the lake's Secchi depth
and the wind all go in, and every factor is in the open (`window.__game.fishing.factors`, `TUNING`, `SPECIES`,
`LURES`) for tuning. A bite is the bobber going down or the rod tip tapping with a short plop: press
**Space** inside the window to set the hook. Then the tension bar: hold to reel (tension up, line in), let go
when the fish runs (tension down, line out). A fish's runs come in pulses and weaken as it tires; bigger fish
pull harder and longer. Red for too long parts the line and the fish keeps the lure (another is tied on, no
other penalty); slack for too long and it throws the hook. A landed fish is held up for a look (the camera comes round to the paddler's front for it), with its
length and weight on a paper catch card bottom left, and **E** keeps it (in your hand; *Put on the stringer* from
the book while the stringer is in reach) or **Q** lets it go. The catch log lives in the journal (**I**, Journal, Catches): species, length,
weight, lake, time and lure for every fish, with personal bests, kept in the browser between sessions. While
the rod is up the spot card top left reads the water (the bed, the depth, the clarity, who lives there), the
reticle sits where the cast will land and fills as the cast loads, and the lure strip sits above the action
line.

The map is drawn as a paper topographic sheet in the spirit of the Fisher and McKenzie maps: hypsometric
tints, 10 m contours, pale-blue lakes with depth contours and figures where the DNR has sounded the lake
(every 2 m to 10 m, then every 5 m and 10 m), red dashed portages with rod counts, red campsite dots and
serif lake names. It is a window around the canoe: loaded tiles are drawn from their own cells, the 80 m far
field fills in beyond them. `M` opens it wide.

## Trips and tasks

A season travels one of two ways, picked on the title card: **Adventure** (open trips that begin as you push off from
an outfitter's dock and end by themselves when you come in on foot at any outfitter's landing, logged as "came in";
food bought with money, one energy bar pulled down by rest, food, water and the cold, camping at the designated sites
only, a calm evacuation when the bar runs empty) or **Sandbox** (the same lakes
with no limits). A new season starts at the entry point you pick, home, with $40 and the starting kit. The trip core is
described in [docs/trip-core.md](docs/trip-core.md), and the outfitter hubs it is growing into in
[docs/hubs.md](docs/hubs.md) (the owner's own words are in [docs/game-vision.md](docs/game-vision.md)).

Every BWCA entry point landing has an outfitter: a dock and a board-and-batten store you walk into, with the name over
the door (the Ely, Sawbill and Gunflint outfitters where they are well known, plausible ones elsewhere; the list is in
`src/outfitter.js`). Each is its own (`src/outfitters.js`): a lodge, a river post, a trout camp or a bait shop, with a
keeper (fictional) who has a manner, lines for the moment and insider hints read from the real lakes, prices of its
own, a signature item sold only there, and a board that leans its own way. At the dock **E** brings the canoe
alongside and you step up onto the deck; you walk up the steps (risers of 0.15 m or less, no Space) and in, either view
inside. The dot opens what it points at: **E** at the counter, the cork board, a shelf from either side, the lure wall
or the map table:

- **The counter** (services only): a bunk tonight ($8), the rides up the road (`src/rides.js`: to the outfitters you
  know and the next one you don't, about $5 + $0.50 a km, the canoe on the roof), and claiming the notices you have
  done; the counter's tap fills the bottle. No permit and no stamp (the world cards, 2026-10-24: "what is the stamp for
  at the counter, i thought we got rid of that"; the season is just the season, begun on the title), no outfit, resupply
  or "call it a trip": a trip ends by itself when you come in. A ride, an evacuation or a reload brings you to the
  store's door (an evacuation opens the counter).
- **The board.** Four notices on the cork board by the door, opened by pointing at it (`src/tasks.js`): fish for the café (a kept fish that fits
  goes into the notice's cooler), a lost item at a campsite (E picks it up), a portage to survey. Clues are written from
  the real map. Each pays money, claimed only at the counter that posted it; one notice changes each morning, and
  nothing taken on expires.
- **The shelves, the lure wall and the map table** (`src/shop.js`, `src/inv-ui.js`): two panes, Witcher-style, your
  containers on the left as Tarkov grids and the shelf on the right; drag a thing into a slot to buy it there, or
  double-click it into the first container with room (refused politely when nothing fits). The meals, the snacks and the
  blue barrels at the provisions shelf (a barrel or a pack dragged off it is kept for you until you carry it out);
  tackle; gear; the lures. The map table under the window (`src/maptable.js`, `src/sheets.js`) is the whole map with
  the sheets dotted over it: this landing's area sells at $8, and a sheet bought is yours for the season, never an
  item to carry. A better paddle, a lighter or
  steadier canoe, a second pack (and the double portage), tents, filters, a rod, lures; each says what it does in the
  keeper's words, and is felt rather than counted (the Kevlar and a bent-shaft paddle make the canoe about 9 % quicker
  and 14 kg lighter on the portages).

You know only your home outfitter at first; reaching another landing, or a ride up the road, makes it known. The big
map (**M**) shows each notice on the go as the keeper's red pencil, a ring drawn by hand: tight round the campsite
with its name ("the island site") when you know it (it is on a sheet you own, or on any map you can see: a store's,
Sandbox's), else round the bay, arm or stretch the notice describes ("the northeast side", "off the point"), never the
whole lake; and the water a keeper has told you about as a grey pencilled ring. The season (`bwca-canoe:profile`, with the sheets you own), the inventory and the
trip (`bwca-canoe-trip`) are kept in `localStorage` and resume where you left them, on the store's floor too.

## Data pipeline

`npm run bake:all` runs `scripts/bake.mjs --all`:

1. **OpenStreetMap** (`scripts/osm-extract.mjs`, `scripts/osmpbf.mjs`): downloads the Geofabrik Minnesota
   extract once, cuts it to the area (osmium when available), and reads water polygons (`natural=water`,
   riverbanks, reservoirs; multipolygon relations are stitched), portage ways (`portage=*`, `canoe=portage`,
   `highway=portage`), campsites (`tourism=camp_site`) and landing points of interest with a dependency-free
   PBF reader. The result is cached as JSON per area.
2. **Elevation** (`scripts/elevation.mjs`): Terrarium z14 tiles for the area are cached and sampled
   bilinearly, row by row.
3. **One global 10 m grid** in a local metres projection with a single origin at the area centre (x east,
   z south; the ~1 % scale drift over 70 km of latitude is accepted). The grid is padded to whole tiles.
4. **Bands with a halo**: elevation sampling, the exact Euclidean distance transform to the shoreline
   (clamped at 3 km) and the shore smoothing run in 1024-row bands with a 320-row halo wider than the clamp,
   so every value equals a whole-grid computation and nothing changes across band or tile edges.
5. **Basins, levels, names** on the full grid: connected lake water shares one level (a low percentile of
   its interior DEM heights, robust to shoreline trees). Rivers and creeks get a **per-cell level** instead:
   a monotone non-increasing profile is fitted along each OSM waterway line (a running low percentile of the
   DEM, then pool-adjacent-violators, anchored to the lakes the line passes through and reversed when the
   DEM says the way was drawn upstream), then spread across the river's width. Creeks that OSM maps only as
   lines are rasterized as channels about two cells wide so they exist as water. Unnamed channels and bays
   take the name of the nearest named lake reachable by water (one multi-source flood fill).
6. **Depth** (`scripts/bathymetry.mjs`): the DNR *Lake Bathymetric Contours* for the area are fetched once
   through the Geospatial Commons REST service and cached. Each contour line is rasterized as a known depth,
   the first ring of water cells is pinned at zero, every cell starts from its nearest known depth and sixty
   Gauss-Seidel sweeps relax the rest into a smooth bed. Lakes without a DNR map keep a synthetic bed that
   drops at about 9 % from the shore, capped at 14 m.
7. **Clarity** (`scripts/clarity.mjs`): the DNR *Lakes of Phosphorus Sensitivity* polygons (mean Secchi depth
   and total phosphorus) and the *Watershed Health* lake scores (mean water clarity) are fetched for the area and
   cached; each DNR polygon is sampled on a lattice and its reading goes to the OSM polygons it covers. Lakes
   without a reading take a distance-weighted mean of measured lakes within 15 km. The lake table carries
   `secchi` (and `secchiMeasured`); the runtime hands it to the water shader per vertex and through the atlas.
8. **Shore shaping**: lake beds are carved below their level and shoreline land is lifted above it, in
   bands again, then the tiles are cut.
9. **Output** in `public/data/`:
   - `index.json`: grid and projection, per-tile flags (has water, height range), the lake table (names,
     display names, levels, centroids), basins, every portage (polyline, rods, launch points), campsites,
     entry points and the start position.
   - `tiles/{tx}_{ty}.bin`: gzip of `[height Int16 dm][lake id Uint16][shore distance Int16 dm][water level Int16 dm]` for
     268 x 268 cells: the 256-cell tile plus a 6-cell halo on every side, so a tile can be built (terrain,
     forest, props) from its own bytes alone, and shared edge vertices come out bit-identical on both sides.
   - `far/{fx}_{fy}.bin`: the same layout on an 80 m grid (block means; the deepest cell decides the lake id)
     in 256-cell far tiles for the far field.
   - `overview.png`: an 80 m/px shaded map of the whole area.

Entry points come from `scripts/entrypoints.json`: each of the 55 with its real put-in (where the canoe first
goes into the water, from the Forest Service's entry point records on recreation.gov checked against the OSM
public water access sites; its `usfs` field keeps the Forest Service's own coordinate) and the water put into
there, which is not always the one the entry point is named for (EP 60 Duncan Lake puts in on West Bearskin). The
landing is that water's cell nearest the put-in, kept 50 m off the portage trails and 40 m off the campsites so a
store never stands on a trail; edit the file to correct a landing.

Portages: every OSM portage trail is kept. A trail under 2.5 km with both ends within 70 m of water is kept as it
is (the first bake kept only these, 969 of 1,045); a longer one too; an end that stops at a fork walks on along the
other trails to water; any other dry end gets a straight connector over land to the nearest water. Only trails
wholly off the grid and stubs from a lake back to itself are left out (`scripts/world-links.mjs`).
`scripts/world-fixes.mjs` writes the same corrections as a table, `src/world-fixes.json`, that `world.js` applies
to the data release they were made for (data-v3), so the published data needs no rebake.

## Runtime

- `src/world.js` loads `index.json` and answers every spatial query (`heightAt`, `shoreAt`, `lakeIdAt`,
  `levelAt`) through the loaded tiles, falling back to the far field and then to flat ground.
- `src/tiles.js` (`TileManager`) keeps the 5 x 5 tiles around the canoe and 3 x 3 far tiles loaded. A pool of
  workers (`src/tile-worker.js`) fetches and gunzips a tile, places the forest, the lake vegetation and the
  ground-cover map deterministically from the global cell coordinates (`src/placement.js`), builds the
  terrain (`src/terrain-build.js`) and the water mesh (`src/water-build.js`) as transferable typed arrays;
  the main thread wraps them into meshes, one tile per frame, and builds the tile's trails and campsites
  (`src/props.js`). Tiles outside the neighbourhood are dropped least-recently-wanted first; far chunks
  stand in wherever a fine tile is missing.
- **Floating origin**: every tile's geometry and instance matrices are local to the tile corner, and the
  water shaders work relative to the corner of the player's tile. All wave frequencies are rounded to whole
  periods per 2,560 m (`src/waves.js`), so the origin can jump by a tile without the swell changing phase.
- **The surface atlas**: the water keeps a sliding 256-cell atlas of shore distance, water level, terrain
  height and ground cover around the canoe (`src/water.js`). The same GLSL (`glslSurface`) gives every
  shader the terrain surface and the swell exactly as the water patch renders it: lily pads, reeds, foam
  bubbles and loons ride it (`src/floating.js`, `src/wake.js`), grass stands on it (`src/groundcover.js`),
  the mist is part of the fog, thickest on the water and thinning with height, with no edge anywhere (`src/mist.js`).
- The day/night cycle (`src/daycycle.js`) drives the lights, the sky dome, the clouds, the water colours, the
  stars, the mist and the colour grade (`src/post.js`); the haze is matched to the sky by overriding three's
  fog chunks (`src/fog.js`).

## GPS simulator

A web page cannot change what other tabs see from `navigator.geolocation`, so the game ships with a small
companion extension in `extension/` that does it:

1. Open `chrome://extensions`, turn on *Developer mode*, choose *Load unpacked* and pick the `extension/`
   folder.
2. Keep the game tab open. The extension receives every position fix the game publishes and overrides
   `navigator.geolocation.getCurrentPosition` / `watchPosition` in every other tab.
3. Click the extension's toolbar icon to switch the simulation on or off.

The game also publishes the fix on a `BroadcastChannel` named `bwca-canoe-geo` and in `localStorage`
(`bwca-canoe-geo`) for same-origin pages, and overrides `navigator.geolocation` on its own page.

## Lake depth and clarity

Lakes with a DNR bathymetric map have their real bed (see *Data pipeline*); the rest are carved from the
shoreline (about 9 % grade, capped at 14 m). Every lake still uses the same clarity (`uClarity`, 3 m, a
typical Secchi depth for these tannin-stained lakes); Secchi readings per lake from the DNR LakeFinder /
MPCA lake water quality pages could replace it.

Known limits: river surfaces follow the DEM profile, so a rapid shows as a steady drop rather than a step;
creeks are two cells (20 m) wide because of the 10 m grid; the Canadian side of the border lakes is only as
complete as the Minnesota extract makes it (add `north-america/canada/ontario` to `CFG.extracts` in
`scripts/config.mjs` for the Quetico shore).

## Hosting

The app is a static build (`npm run build` → `dist/`) and the data is fetched on demand from wherever
`VITE_DATA_URL` points (default: `data/` next to the app, which is `public/data` in development). The
recommended setup, with costs, is in [docs/HOSTING.md](docs/HOSTING.md): the app on GitHub Pages
(`.github/workflows/pages.yml` deploys it on every push to `main`), the 380 MB tile set in a Cloudflare R2
bucket behind the CDN (S3 + CloudFront as the alternative), uploaded with `npm run data:sync`. A Lake One
bake (`npm run bake`, about 4 MB) can ship inside the app instead for a demo. `.env.example` lists the
variables.

## Layout

```
scripts/        bake pipeline (config, OSM extract, elevation, DNR bathymetry, bake) and data-sync.mjs
src/            the game (three.js, ES modules; tile-worker.js runs in web workers)
                title.js / settings.js / save.js: the title and pause screen, settings, saved trips
extension/      the GPS simulator Chrome extension (MV3)
docs/           screenshots and HOSTING.md
.github/        the GitHub Pages workflow
public/data/    baked tiles, not committed
```

Map data © OpenStreetMap contributors (ODbL). Elevation: USGS 3DEP / NASA SRTM via Mapzen/AWS Terrain Tiles.
Lake depths: Minnesota DNR Lake Bathymetric Contours; clarity: Minnesota DNR lake phosphorus sensitivity and
watershed health data, all via the Minnesota Geospatial Commons.
