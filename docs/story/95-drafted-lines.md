# Drafted lines (build drafts, for the writers to replace)

Every line in this file is a **build draft**: the game needed words where the writers' docs (10–70) have none, so a
build stream wrote a stand-in in the voice of `02a-voice-journal.md` and `02b-voice-people.md`. None of it is canon.
Writers: replace any line here by writing the real one into your own doc with the same `<!-- id: -->` anchor (or a new
anchor, and tell the builders), then delete the draft. Nothing in the writers' files was changed to make room for these.

Each entry: the anchor, the line, and where the game uses it. `story-extract.mjs` reads this file into
`src/story-data/text/drafted.json`, like the others.

---

## Stream x (campaign run, chapter 2: the mining years, Rose S7, Coffee Lake S9)

### Len and Mary at Farm's café

<!-- id: d95.len.again -->
```
There they are. Sit, sit. Kim, another coffee over here.
```
Used: Len's opener on every talk after the first (`mining.js` LEN `again`); was a bare "…".

<!-- id: d95.mary.again -->
```
You're in my light again. Sit. The bars are still lemon.
```
Used: Mary's opener on every talk after the first (`mining.js` MARY `again`); was a bare "…".

<!-- id: d95.len.thanks -->
```
That's the crib. That's it exactly. And a casing, standing up like that. They'll go right up front at the open house. Thank you.
```
Used: Len, as the two pictures for his favour are handed in (`mining-cast.js` talk, 30 §4.2.1); the $40 is on the tally.

<!-- id: d95.len.east.ask -->
```
Anything east of Bald Eagle? Gull, Pietro?
```
Used: the player's question for Len's "Gull" / "Pietro" / "east of Bald Eagle" topic (30 §4.2: the doc gives his
answer, 30:4.2/len-saari-first-meeting.5, but no words for the asking). Offered once the player has a reason to name
the east: the crew map, the far end, or Pietro's dig.

<!-- id: d95.mary.saynothing -->
```
(Say nothing.)
```
Used: the third choice at Mary's back table (30 §4.4 "[Say nothing.]"); she waits, nods, and goes on to the radio.

### The Walt page and the notebook

<!-- id: d95.lead.pads page -->
```
Tauno: up the grade from the crews' landing to the west pads. The big one's in a hollow, the Kettle. Go after a rain and see if the creek still runs orange.
```
Used: the Walt page's Leads line for Tauno's "The pads" (`walt-lines.js` w.lead.pads; was his spoken line whole).

<!-- id: d95.und.backdoor -->
```
Pietro. The hill E-7 was filed on.
```
Used: the margin note on NB70 once "the back door" is understood or inked (`notebook.js` UND, 10 §11.2's form).

### Rose (S7, Mummo's)

<!-- id: d95.S7.rose.again -->
```
There you are. Sit down, I saved you the chair. What's the lake doing?
```
Used: Rose's opener on every Tuesday after the first (`feed-episodes.js` ROSE_SCENE); she used to say S7.conv.1 again.

<!-- id: d95.S7.pay -->
```
Lilacs for Rose's calendar
```
Used: the tally's line for Rose's $25 (or the short note when it is paid with no trip on); replaces "$25 from Rose.".

<!-- id: d95.S7.page.rose -->
```
Rose Gornik. Tuesdays at Moose Lake, the table by the window. She wants June lilacs for the church calendar.
```
<!-- id: d95.S7.page.whose -->
```
Her family's resort was on the big part of Basswood. Bought out in '64, burned on the ice the next February.
```
<!-- id: d95.S7.page.where -->
```
Lilacs past Prairie, on the US side of the bay. An old Finn fish camp. The boys there called the old lady Mummo.
```
<!-- id: d95.S7.page.boys -->
```
The boys were Haapalas. The young one drowned. The other one guided. Walt.
```
<!-- id: d95.S7.page.step -->
```
Three flat stones up from the water to nothing. A foundation in the grass. Somebody's lilacs.
```
Used: the S7 page in Stories, each as it comes true (meeting Rose, "Whose places?", "Where are the lilacs?", "The two
boys?", the stone step seen). 60 §0.3: the page lines were never written.

### Coffee Lake (S9)

<!-- id: d95.S9.page.hooked -->
```
Off the Alice beach rock, a jig dragged on the sand caught something heavy. Not a fish.
```
<!-- id: d95.S9.page.nb06 -->
```
Coffee Lake is Alice. Walt lost something off the beach rock in '88, in eight feet of water.
```
<!-- id: d95.S9.end -->
```
It came up by the bail. A blue enamel pot, a chip on the lip, full of sand.
```
Used: the S9 page in Stories (the hook-up, NB06 read, and its last line once the pot is up).

### The Kettle notice (30 §4.3)

<!-- id: d95.kettle.page.done -->
```
Worked the Kettle creek with Tasha. Three bottles and the disk. The water's orange-brown under a metre.
```
Used: the last line under the Kettle notice's words on its page in Stories (the notice taken; the day done).

### The day's beat in Farm's reach (30 §9)

<!-- id: d95.beat.whitestone -->
```
There's a white stone on a flat rock at a site on Bald Eagle. Somebody put it there. We left it.
```
Used: the director's fallback lore in Farm's reach, in place of 30:9.beat.2 ("a white rock on a stump"), which
disagrees with 30 §9's own place note for C902 ("a white stone on a flat rock at the landing"). The stone is now built
at C902's landing (`story-places.json` bald.c902), unstarred as walt-sites.js keeps it. Writers: settle which it is.

---

## Stream f (Round 3, the far end)

- `f.dot.pit.empty`: "An empty pit." The dot on the cellar's opened hole after the ending or a walk-out from the dawn
  lot (`cellar.hole`, `dotWhen: f:world.pit.empty`; world.pit.empty is stream n's rule n.pit). Build draft.

## Stream r (the run, Round 3)

| Anchor | Line (draft) | Where it is used |
|---|---|---|
| run.click | "Far off, down toward the bay: a radio, two clicks." | run.js `click()`: the run's first sign (50 §5.3 says it is a sound only; until the audio has a radio click, the HUD note stands in for it) |
| run.tied.kicker | "Tied off" / "in the canoe · cold, cramped" | the Rest dial's kicker and sub tied off (minigames/tieoff.js, run.js `restDial`) |
| run.scanner.prefix | "Scanner · {who}: {line}" | how a scanner line shows when no speaker is pinned (run.js `scanLine`); the lines themselves are 50 §6.8's |

Verbatim lines used from table rows the extractor cannot anchor (no prose changed; the join or the writers may move
them to an anchor): "Not tonight. Not where they'd look." (50 §6.2, No campsites row) in run.js `NOTE_DOWN`.

## Stream n (Round 3: the endings) — build drafts, for the writers to replace

| Anchor | Line | Where it is used |
|---|---|---|
| n.phone.dan | It rings twice. "Dan Marolt." A pause. "Stay there. Twenty minutes." | The dawn lot's permit-box phone, dialled with Dan's card (50 §9.2 says only that he arrives in twenty minutes) — endings.js `phoneLine()` |
| n.tasha.done | Samples bottled and the Secchi read. That's the creek for this month. | Tasha's sampling notice done at the Kettle creek (50 §12.2 has the notice, not the done line) — endings.js `registerSampling()` |
| n.paper.read | STATIONS 7 TO 12. The clipping goes in your book. / The papers existed. The clipping goes in your book. | Reading the Ledger on a counter (the headline is the paper's; the second sentence is the build's) — endings.js `readPaper()` |

Also quoted in code word for word (the extract skips a speaker line with a stage direction before its colon; a writer's
`<!-- id -->` would let them be wired by id): 50 §9.2 Dan's "Hey. You made it. That's a long night." / "Okay. I'm
supposed to say this exactly. The number's gone up." / "I'm asking you."; 50 §9.1 Maggie's readings ("C.B.",
"'Spoken to.'", "L.P. H.V. Two years of it.", "These are originals. …"), Dan's "...I will.", Tauno's "Well. I said if." /
"Good. That's good.", Tom's "You told me once to leave the sled. I left it."; 50 §10's tally words (backticks).

## Stream w (the winter turn, Round 3)

| Anchor | Line | Where it is used |
|---|---|---|
| `w:frozen.card.kicker` | Frozen in | The kicker of the card when the run is caught by ice-in and the season turns by itself (season-turn.js `auto`). |
| `w:frozen.card.text` | Frozen in. Not till the ice goes. | The card's line. **Not drafted:** the pit's own thought in `50` §5 ("15 November to ice-out"), reused here so the run's freeze-up and the pit's say the same thing. |
| `w:frozen.card.sub` | Up at seven on {date}, {year}, the ice out, where you last stopped. | Under it: the day the player wakes (the ice-out at the run's put-in) and that the run resumes at the last checkpoint (`50` §6.14). |

## Stream c (co-op mirror, Round 3)

| Anchor | Line | Where it's used |
|---|---|---|
| `c.walt.n42` | Not with company on the lake. | The Walt page, "The far end", written once the first time a player with an L6 key points at the pit with a friend in the room (campaign-design §7.2). It quotes NB72 (N42) word for word; `src/story-data/walt-lines.js` holds it as the row's `text`. |
| `c.coop.reading` | {host} is reading by headlamp. | The one card a guest sees on a shared night while the host's night-one cutscene plays (campaign-design §6.1); `src/coop-story.js` WORDS.reading. |
| `c.coop.shut` | Out on the water tonight. | A guest's join or Rejoin refused while the host's run is on (campaign-design §8.3 "No company"); `src/coop.js` SHUT_WORDS and `src/coop-story.js` WORDS.shut. |
| `c.coop.nod` | … | A story person (Tauno, the Farm people …) stood on a guest's screen, E on them: a look up, no words (as cast.js's Josie with no word). Josie says her own 70 §4.4 lines. |

<!-- id: c.walt.n42 -->
```
Not with company on the lake.
```
Used: the Walt page row `c.walt.n42` (anchored at join 1 so the book reads it from drafted.json, like the others).

## Stream m (mechanics, campaign Round 4)

| Anchor | Line | Where it is used |
|---|---|---|
| `m:squad.ride` | Up Moose, Newfound and Sucker in the dark, about fifty minutes: the motor and the wake, your canoe and the squad's old aluminium spare on a line behind. At the bypass the motor stops. Two carries: your canoe, then the spare. | The squad night's ride card (src/drift-night.js squadNight, the card's sub), 31 GY-11 "The ride", folded with the bypass's two carries |
| `m:squad.back` | Back down the chain in the dark: the motor and nothing else. | The ride back's card (drift-night.js rideBack), after 31 GY-11 "The ride back is the motor and nothing else." |
| `m:rescue.ride` | The canoe on a line behind, {time} on the water to {place}. {fee} | The rescue-boat ride's card (src/rescue.js ride, the sub), when the caller gives no words of its own |
| `m:rescue.kicker` | The rescue squad → {place} / The outfitter's boat → {place} | The same card's kicker |

## Stream 7a (campaign run, Round 7: S2 the Squatch night, S3 Lights over Four Towns, S4 the wolves)

### Big Moose: the Squatch night (S2)

<!-- id: d95.7a.S2.page.duane -->
```
Duane, the Tattler. Weekends in the lot at Moose River North: a green pickup, a lawn chair, a plaster cast.
```
Used: S2's page, once Duane is met.

<!-- id: d95.7a.S2.page.site -->
```
The west site on Big Moose, under the ridge. Two stars, a bad landing. Nobody wants it.
```
Used: S2's page, once Duane says where to camp.

<!-- id: d95.7a.S2.page.walt -->
```
Walt slept out there in his canoe, tied to a snag off the point.
```
Used: S2's page, N14 (NB36) read at the site.

<!-- id: d95.7a.S2.page.night -->
```
Two in the morning on Big Moose. Steps on the ridge, a knock on wood, twice. Then nothing for a minute.
```
Used: S2's page, after the night.

<!-- id: d95.7a.S2.page.tracks -->
```
In the morning, up on the ridge: a moose and a calf, and the serviceberry stripped.
```
Used: S2's page, the ridge seen by day after the night.

<!-- id: d95.7a.S2.page.frame -->
```
One picture from 2:04. Two birches, and something between them. Nothing there by day.
```
Used: S2's page, the unexplained frame taken.

<!-- id: d95.7a.S2.end.solved -->
```
A moose in the deadfall and a bear in the berries. Duane ran it anyway.
```
Used: S2's last line: a moose, bear or tracks print shown to Duane.

<!-- id: d95.7a.S2.end.sold -->
```
Sold to the Tattler.
```
Used: S2's last line, the frame sold (the doc's words for the print's mark, 60 S2).

<!-- id: d95.7a.S2.end.kept -->
```
Kept the picture. Haven't shown anybody.
```
Used: S2's last line, the frame kept.

<!-- id: d95.7a.S2.pay.20 -->
```
$20 from Duane.
```
Used: the tally, a clear print of the moose or the bear.

<!-- id: d95.7a.S2.pay.10 -->
```
$10 from Duane.
```
Used: the tally, a print of the tracks only.

<!-- id: d95.7a.S2.pay.200 -->
```
$200 from the Tattler.
```
Used: the tally, the frame sold.

<!-- id: d95.7a.S2.wake -->
```
Two in the morning. You come awake. Something heavy on the ridge behind the tent.
```
Used: the night card at the west site (the sleep breaks at 02:00).

<!-- id: d95.7a.S2.charge -->
```
The cow lays her ears back, stamps, and comes three strides at you. Then she's gone, crashing.
```
Used: the bluff charge, a note.

<!-- id: d95.7a.S2.eyes -->
```
Two eyes in the lamp, green-gold, two metres up. Then a long face. Then they go.
```
Used: the lamp turned on the ridge in the night, a note.

<!-- id: d95.7a.S2.cast -->
```
Bear. Hind foot over the front.
```
Used: the dot on Duane's cast once tracks are read (60 S2's own words).

### Fourtown: the lights (S3)

<!-- id: d95.7a.S3.page.elaine -->
```
Elaine Sundquist keeps the sky book at Slim. Everything's something, she says.
```
Used: S3's page, Elaine met.

<!-- id: d95.7a.S3.page.aurora -->
```
Northern lights over Fourtown, low in the north. In the book.
```
Used: S3's page, the aurora logged.

<!-- id: d95.7a.S3.page.train -->
```
A string of lights climbing out of the west, one after another. Satellites. In the book.
```
Used: S3's page, the train logged.

<!-- id: d95.7a.S3.page.lantern -->
```
A light floating at the north end in the fog. Somebody's lantern. In the book.
```
Used: S3's page, the lantern logged.

<!-- id: d95.7a.S3.page.foxfire -->
```
Foxfire off the north shore, a green chunk of birch. Elaine turned the shop lights off for it.
```
Used: S3's page, the foxfire logged.

<!-- id: d95.7a.S3.page.square -->
```
Walt wrote in her book in 2012. 'Kept the red on.' She wrote 'boat?' beside it.
```
Used: S3's page, Walt's line in the binder found.

<!-- id: d95.7a.S3.page.tin -->
```
Under the loose stone at the long rock: a tobacco tin. Red glass in oilcloth, three matches.
```
Used: S3's page, the tin lifted.

<!-- id: d95.7a.S3.page.one -->
```
A light over the north bay. Low, steady. It drifted against the wind and went out when I showed white.
```
Used: S3's page, the one light seen.

<!-- id: d95.7a.S3.end -->
```
Elaine wrote a question mark in red. Her first.
```
Used: S3's last line.

<!-- id: d95.7a.S3.foxfire.out -->
```
The foxfire has gone dark.
```
Used: a note, the morning after a foxfire chunk is carried.

### Agnes: the wolves (S4)

<!-- id: d95.7a.S4.page.kari -->
```
Kari Vang counts wolves on Agnes. Three places, three lines, they cross where the wolves are.
```
Used: S4's page, Kari met.

<!-- id: d95.7a.S4.page.tracks -->
```
Kari at the landing: front foot, toes tight, like it's going somewhere. A dog's go everywhere.
```
Used: S4's page, the tracks taught.

<!-- id: d95.7a.S4.page.st1 -->
```
Nina Moose, the north end, three in the morning. They answered.
```
Used: S4's page, station 1 marked.

<!-- id: d95.7a.S4.page.st2 -->
```
The Agnes inlet. They answered.
```
Used: S4's page, station 2 marked.

<!-- id: d95.7a.S4.page.st3 -->
```
Walt's site on Agnes, the sand landing. They answered.
```
Used: S4's page, station 3 marked.

<!-- id: d95.7a.S4.page.ring -->
```
The three lines cross west of Agnes, in the primitive area.
```
Used: S4's page, the ring pencilled.

<!-- id: d95.7a.S4.page.kill -->
```
Ravens over a kill. A deer, mostly hair and bones.
```
Used: S4's page, a print of the kill.

<!-- id: d95.7a.S4.page.count -->
```
The meadow from the ridge at dusk. Pups at the edge of the alders.
```
Used: S4's page, the pup print.

<!-- id: d95.7a.S4.page.told -->
```
I told someone where the meadow is.
```
Used: S4's page, the ring given away.

<!-- id: d95.7a.S4.pay.station -->
```
$15 from Kari, a night at a station.
```
Used: the tally, a station night.

<!-- id: d95.7a.S4.pay.count -->
```
$40 from Kari, for the count.
```
Used: the tally, the pups counted.

<!-- id: d95.7a.S4.pay.lyle -->
```
$60 from Lyle.
```
Used: the tally, the ring sold to Lyle.

<!-- id: d95.7a.S4.lyle2 -->
```
Me again. Sixty-five for a ring on my map. Last time I'll ask.
```
Used: Lyle's second ask, a week on (60 S4 gives only the stage direction).

<!-- id: d95.7a.S4.give -->
```
Show him the ring on the map.
```
Used: the player's choice to give Lyle the ring.

<!-- id: d95.7a.S4.howl.hint -->
```
Wait for an answer. Face it, then {E} Mark.
```
Used: teaching moment after a first howl (hint, ≤ 80).

<!-- id: d95.7a.tracks -->
```
Tracks
```
Used: the dot on prints before Kari teaches them.

<!-- id: d95.7a.S4.answered -->
```
Far off, the wolves answer.
```
Used: a note after an answered howl, once.

<!-- id: d95.7a.S4.silent -->
```
Nothing answers. Only the water.
```
Used: a note after a howl nobody answers.

## a3 · The guiding years (Round 4, stream A3; `src/story-data/drafts-a3.js`)

| Id | Line | Where it is used |
|---|---|---|
| `a3.nate.tow` | NATE: "On the right. By the start of the carry. I drive it every day. Don't tell Grandpa." | Nate's answer to "Where does the tow land at Prairie?" (31 §5.4 Gives: "the tow landing's real side (a second way to know it)"; the doc gives Rick's words for the question and none of Nate's answer), followed by his Gives line "He forgets the week. He doesn't forget a reef." |
| `a3.tally.overdue` | "Squad, an overdue party" | The trip-end tally line for GY-10's $30 ("$30 on the trip-end screen") |
| `a3.dot.bunk3` | "Bunk 3" | The dot on bunk 3 (GY-13: "The dot on bunk 3 offers **Take the bunk**") |
| `a3.dot.lamp` | "Battery lamp" | The dot on the lamp on the sill (verbs "Light it" / "Put it out") |
| `a3.dot.ladder` | "Ladder" | The boathouse ladder (GY-12: "on the left inside the door"); verb `a3.verb.ladder` "Climb up" |
| `a3.dot.rafter` | "Initials, cut in the rafter" | The rafter by the loft window (W.H. 61, E.H. 64) |
| `a3.dot.crew89` | "Snapshot, pinned to a beam" | The Moose Lake crew, summer 1989 |
| `a3.dot.bolts` | "Coffee can of dock bolts" | The can marked W.H. |
| `a3.dot.redcanoe` | "Red canoe, across the rafters" | Marlys's red canoe |
| `a3.dot.truck` | "Pickup, idling" | GY-13 23:40, the ordinary pickup in the lot (verb "Walk up": the window's line is the doc's 31:GY-13.truck) |
| `a3.dot.weekenders` | "Party of four" | GY-10, the overdue party |
| (story-places.json) | "Tow landing" · "Flat rock on the point" · "Old fire ring, under the moss" · "Pine stub" | The dot names of the tow landing at P194's Sucker end and the lunch rock's props (GY-04, GY-07, §9.1) |
| (guiding-cast.js) | "Bunkhouse registers, {year}." | A banker's box in the loft that isn't the 2020 one, looked into (the dot names each box by its year only) |
| (guiding-cast.js) | "Old wall map" | Hog Creek's pencilled wall map (GY-18; the doc names it only in prose) |
| (guiding.js WALLS, leads-guiding.js ASKS) | "The old guide photo?" · "Little Gabbro? Bald Eagle?" · "Hap says Insula?" · "Hap says Ottertrack?" · "The Stuart Portage?" | The player's question to a keeper where the doc gives only the keeper's answer (Farm's photo, GY-17; Gus's rings, GY-06, GY-06c, GY-09b). "Hap's day?" is the doc's own (GY-04 Gives). |

## Stream s (campaign run, Round 4: S1 the man on the portage, S8 the sled on the lunch rock)

60 §0.3 asks for a side story's page in the player's hand, and its last line, but writes only S1's example page (marked
not-text) and three last lines. These are the page lines the two stories need; S1's first three follow 0.3's example.

### S1 · Ollie's page (Stories, in the player's hand)

<!-- id: d95.s1.page.1 -->
```
Ollie. Walks the Stuart Portage Tuesdays and Thursdays, in the evening. Says "Evening."
```
Used: S1's page from its start (`s1-ollie.js` page).

<!-- id: d95.s1.page.2 -->
```
Rescue squad, 38 years. Squad record on the Stuart: 49 minutes, canoe and pack, one trip. 1981.
```
Used: S1's page once he has told you about the squad (`ollie.squad`).

<!-- id: d95.s1.page.3 -->
```
He'll be at the road with his watch.
```
Used: S1's page until the first carry.

<!-- id: d95.s1.page.missed -->
```
Over forty-nine. He said Tuesday like it was nothing.
```
Used: S1's page after a first carry that missed the record.

<!-- id: d95.s1.page.beat -->
```
Road to river under forty-nine. He looked at the watch twice.
```
Used: S1's page once the record is beaten.

<!-- id: d95.s1.page.twice -->
```
Carried it twice. Never under forty-nine. He seemed fine with that.
```
Used: S1's page after the second try without the record ("counts as done", 60 S1 Results).

<!-- id: d95.s1.page.log -->
```
He gave me a copy of his search log. Bald Eagle, October 1977. Nine days.
```
Used: S1's page once conversation B gives the log.

<!-- id: d95.s1.end.log -->
```
Still "Evening." Tuesdays and Thursdays.
```
Used: S1's last line when it ends (the log given). Out of his months, before that, the page shows 60's own
"Ollie's back in June." (`side.last.1`).

### S8 · the sled's page

<!-- id: d95.s8.page.1 -->
```
A sled on the lunch rock, Insula. Ash runners, the straps rusted to lace. Two window sashes, one pane left.
```
Used: S8's page from its start (`s8-sled.js` page).

<!-- id: d95.s8.page.rule -->
```
Tom's rule: over fifty years old, it stays. Under, it goes.
```
Used: S8's page once Tom has said why he hasn't hauled it.

<!-- id: d95.s8.page.crew -->
```
His crew is on Insula the third week of September. If nobody tells him anything, it goes.
```
Used: S8's page once Tom has said when.

<!-- id: d95.s8.page.emil -->
```
Emil. Trapped Insula from the thirties. Went back over the ice for his windows and left the sled on the rock.
```
Used: S8's page once Hap has told it.

<!-- id: d95.s8.page.creek -->
```
His creek: straight across from the rock. A beaver house at the mouth.
```
Used: S8's page once anyone has given the creek (Hap, Vern, or Tom's files).

<!-- id: d95.s8.page.snap -->
```
Lloyd's snapshot: Vern with a pike on the sled, 1968. Both panes in.
```
Used: S8's page once the Ostbys' snapshot is in the book.

<!-- id: d95.s8.page.found -->
```
Up the creek in the young pines: cut stumps, a stovepipe, a square hollow, a bed spring.
```
Used: S8's page once the clearing is found.

<!-- id: d95.s8.page.tin -->
```
A tobacco tin under the spring. E.R. 1947.
```
Used: S8's page once the tin is taken.

<!-- id: d95.s8.end.heritage -->
```
The sled stays. Tom wrote it up as heritage.
```
Used: S8's last line when the player told Tom to leave it ("Hauled" and "without you" use 60's own "The sled went to
the yard in town.", `side.last.2`).

<!-- id: d95.s8.photo.clearing -->
```
the clearing up Emil's creek
```
Used: the camera's survey words for a print of the clearing (`s8-sled.js` photo).

<!-- id: d95.s8.photo.sled -->
```
the sled on the lunch rock
```
Used: the camera's survey words for a print of the sled.

## 7c · the mini-campaigns M1–M6 (Round 7)

Generated by `node scripts/cmp-7c-lines.mjs` (the game reads src/story-data/text/drafts-7c.json). Voice: 02a (the page,
the player's hand) and 02b (keepers, Tom, the guides, the soloists). M3 never names Walt, Canada, a stone or a stump.

| Anchor | Who | Line (draft) | Used |
|---|---|---|---|
| `m1.notice.0` |  | BEAR ACTIVITY on Moose, Newfound and Sucker. / A black bear is taking food from campsites. Hang everything, every night. / Seen claw marks, scat, a barrel moved? Tell the counter. We would rather move it than lose it. / — Kawishiwi Ranger District | M1 flyer, the boards at Moose Lake 25 and Farm 31, the year its chain is Moose Lake / Newfound Lake / Sucker Lake |
| `m1.page.chain.0` |  | A bear on Moose, Newfound and Sucker. The notice says hang everything. | M1 page, first line |
| `m1.notice.1` |  | BEAR ACTIVITY on Newfound, Splash and Ensign. / A black bear is taking food from campsites. Hang everything, every night. / Seen claw marks, scat, a barrel moved? Tell the counter. We would rather move it than lose it. / — Kawishiwi Ranger District | M1 flyer, the boards at Moose Lake 25 and Farm 31, the year its chain is Newfound Lake / Splash Lake / Ensign Lake |
| `m1.page.chain.1` |  | A bear on Newfound, Splash and Ensign. The notice says hang everything. | M1 page, first line |
| `m1.notice.2` |  | BEAR ACTIVITY on Snowbank, Disappointment and Parent. / A black bear is taking food from campsites. Hang everything, every night. / Seen claw marks, scat, a barrel moved? Tell the counter. We would rather move it than lose it. / — Kawishiwi Ranger District | M1 flyer, the boards at Moose Lake 25 and Farm 31, the year its chain is Snowbank Lake / Disappointment Lake / Parent Lake |
| `m1.page.chain.2` |  | A bear on Snowbank, Disappointment and Parent. The notice says hang everything. | M1 page, first line |
| `m1.notice.3` |  | BEAR ACTIVITY on Fall, Newton and Basswood. / A black bear is taking food from campsites. Hang everything, every night. / Seen claw marks, scat, a barrel moved? Tell the counter. We would rather move it than lose it. / — Kawishiwi Ranger District | M1 flyer, the boards at Moose Lake 25 and Farm 31, the year its chain is Fall Lake / Newton Lake / Basswood Lake |
| `m1.page.chain.3` |  | A bear on Fall, Newton and Basswood. The notice says hang everything. | M1 page, first line |
| `m1.notice.4` |  | BEAR ACTIVITY on Lake One, Lake Two and Lake Three. / A black bear is taking food from campsites. Hang everything, every night. / Seen claw marks, scat, a barrel moved? Tell the counter. We would rather move it than lose it. / — Kawishiwi Ranger District | M1 flyer, the boards at Moose Lake 25 and Farm 31, the year its chain is Lake One / Lake Two / Lake Three |
| `m1.page.chain.4` |  | A bear on Lake One, Lake Two and Lake Three. The notice says hang everything. | M1 page, first line |
| `m1.notice.5` |  | BEAR ACTIVITY on Ensign, Vera and Knife. / A black bear is taking food from campsites. Hang everything, every night. / Seen claw marks, scat, a barrel moved? Tell the counter. We would rather move it than lose it. / — Kawishiwi Ranger District | M1 flyer, the boards at Moose Lake 25 and Farm 31, the year its chain is Ensign Lake / Vera Lake / Knife Lake |
| `m1.page.chain.5` |  | A bear on Ensign, Vera and Knife. The notice says hang everything. | M1 page, first line |
| `m1.bark.torn` | party | It got our food pack. We hung it, too. Not high enough, I guess. Opened it right down the seam. | M1 a party on the chain whose camp it raided (their word) |
| `m1.rumour` | keeper | There's a bear working the sites out there. Raspberries are in, so it's fat and it's bold. | M1 the keepers' word at 25 and 31 in July–August |
| `m1.ask.bear` |  | The bear on the notice? | M1 counter topic |
| `m1.say.bear` | keeper | Every summer there's one. This one learned what a barrel means. The district would rather move it than shoot it, if somebody shows them where it goes. | M1 counter topic |
| `m1.ask.site.a` |  | Tell them: up past Insula. | M1 relocation site |
| `m1.ask.site.b` |  | Tell them: out on the Isabella. | M1 relocation site |
| `m1.ask.site.c` |  | Tell them: the far end of Little Sag. | M1 relocation site |
| `m1.say.site` | keeper | I'll call it in. They'll trap it where you found the sign and truck it up there. The district pays for a report like that. It'll be on your tally. | M1 after the site is picked |
| `m1.end.relocated` |  | Trapped on the chain and moved. A tag in its ear now. The sites are quiet. | M1 end: documented and relocated |
| `m1.end.gaveup` |  | Three camps hanging their food, and it quit the chain. Back to the raspberries. | M1 end: taught the camps |
| `m1.end.trapped` |  | September. The rangers trapped it themselves and moved it. Nobody asked me. | M1 end without you, few camps fed it |
| `m1.end.lost` |  | September. Too many camps fed it. They didn't move this one. | M1 end without you, four or more camps fed it |
| `m1.page.claw` |  | Claw marks on a hung pack. Hung too low. | M1 page |
| `m1.page.scat` |  | Scat full of raspberry seeds. Berries first, then the camps. | M1 page |
| `m1.page.barrel` |  | A barrel dragged into the brush, lid still on. Tooth holes. | M1 page |
| `m1.page.range` |  | It works the chain after dark. Same sites, same hours. | M1 page |
| `m1.page.seen` |  | Saw it come in. Big, careful, in no hurry. | M1 page: the night watch |
| `m1.page.photo` |  | A picture of it at night. Eyes in the lamp. | M1 page: a print at night |
| `m1.page.taught` |  | Showed a camp how to hang a pack. They did it while I watched. | M1 page |
| `m1.page.fed` |  | It got food again. Somebody else's camp. | M1 page |
| `m1.page.fedme` |  | It got mine. Not proud of that. | M1 page |
| `m1.teach` |  | Hang your food tonight. There's a bear on this chain. | M1 to a party on the chain (the teach choice) |
| `m1.taught` | party | A bear? Okay. Show us the knot. | M1 the party, taught |
| `m1.watch.come` |  | Something big in the brush. Lamp off. Wait. | M1 the night watch, the bear coming |
| `m1.watch.gone` |  | It went back the way it came. | M1 the night watch, after |
| `m1.dot.claw` |  | Torn pack | M1 a sign on the dot |
| `m1.dot.scat` |  | Scat | M1 a sign on the dot |
| `m1.dot.barrel` |  | Barrel | M1 a sign on the dot |
| `m1.pay` |  | $40 from the district. The bear report. | M1 the tally line |
| `m1.first` |  | First stamped: a bear's range, written down. | M1 the trip card |
| `m2.rumour` | keeper | Fella from Crane Lake swears he heard singing on La Croix. In French. In the fog. I said that'd be the Ely High band. | M2 the keepers' word at Little Vermilion 12 and Larch Creek |
| `m2.voices` |  | Voices in the fog. Singing. Paddles, a lot of them. | M2 fogvoices, the first time |
| `m2.voices.near` |  | Close now. The paddles knock on the gunwales. | M2 fogvoices, near |
| `m2.voices.gone` |  | Gone east. The fog lifts on nothing. | M2 fogvoices, after |
| `m2.dot.box` |  | Logbook | M2 the box at each falls |
| `m2.page.log.loon` |  | A logbook in a box at Loon Falls. Yesterday's line: "Four canoes. Bound east." | M2 the logbook read at Loon Falls |
| `m2.page.log.curtain` |  | Curtain Falls. The box again. "Carried the falls at noon. Singing the whole way." | M2 the logbook read at Curtain Falls |
| `m2.page.log.basswood` |  | Basswood Falls. "Lost a paddle in the white water. Did not stop." | M2 the logbook read at Basswood Falls |
| `m2.page.log.prairie` |  | Prairie Portage, our side. "A pipe here. Then on." | M2 the logbook read at Prairie Portage |
| `m2.page.log.knife` |  | Knife Lake. "Grand Portage in nine days." The ink still wet. | M2 the logbook read at Knife Lake |
| `m2.page.heard` |  | Fog on La Croix at dawn. Voices. A song I didn't know. | M2 page |
| `m2.page.close` |  | Close enough to hear the paddles knock. Never saw a canoe. | M2 page |
| `m2.page.filled` |  | Five boxes, five lines, always the day before I got there. | M2 page |
| `m2.keeper.passed` | keeper | Somebody at Grand Portage called. Four big canoes came in off the lake last week, singing. Nobody knew who they were. | M2 a keeper, after the fifth box |
| `m2.end` |  | They made Grand Portage. I never caught them. | M2 end |
| `m2.first` |  | First stamped: a logbook, filled east. | M2 the trip card |
| `m3.hello.0` | Arvid Lund | Name's Lund. Arvid. I had the whole route planned. Knees say no. My daughter drove me up anyway. | M3 the soloist at the home dock, the year he is Arvid Lund |
| `m3.page.who.0` |  | Lund at the dock. Retired from the Virginia plant. His daughter drove him up. | M3 page, first line |
| `m3.hello.1` | Harold Sjoberg | Harold Sjoberg. I strung wire for the co-op thirty years. Now the doctor says no portages. My son-in-law brought me to look. | M3 the soloist at the home dock, the year he is Harold Sjoberg |
| `m3.page.who.1` |  | Sjoberg at the dock. Thirty years a lineman for the co-op. His son-in-law brought him. | M3 page, first line |
| `m3.hello.2` | Leonard Maki | Leonard Maki. I taught shop in Mountain Iron. I can't lift the canoe anymore. My granddaughter's in the car. | M3 the soloist at the home dock, the year he is Leonard Maki |
| `m3.page.who.2` |  | Maki at the dock. Taught shop at Mountain Iron. His granddaughter waits in the car. | M3 page, first line |
| `m3.hello.3` | Gene Kozlowski | Gene Kozlowski. Drove truck for the mill in Sartell. My wife sent me with a thermos and told me to sit. | M3 the soloist at the home dock, the year he is Gene Kozlowski |
| `m3.page.who.3` |  | Kozlowski at the dock. Drove truck for the paper mill in Sartell. His wife sent him with a thermos. | M3 page, first line |
| `m3.hello.4` | Clifford Ness | Cliff Ness. I carried mail in Two Harbors. Ankle's shot. My nephew drove up from the Cities so I could see the water. | M3 the soloist at the home dock, the year he is Clifford Ness |
| `m3.page.who.4` |  | Ness at the dock. A mail carrier in Two Harbors. His nephew drove up from the Cities. | M3 page, first line |
| `m3.hello.5` | Ray Bergquist | Ray Bergquist. Kept the books at a lumberyard in Cloquet. Heart, they say. My daughter-in-law drove. | M3 the soloist at the home dock, the year he is Ray Bergquist |
| `m3.page.who.5` |  | Bergquist at the dock. Kept the books at a lumberyard in Cloquet. His daughter-in-law drove him. | M3 page, first line |
| `m3.list.0` | soloist | Ensign, Knife, Kekekabic, Ogishkemuncie and Seagull. A picture from each. I'd like to see them one more time. | M3 his list, said |
| `m3.page.list.0` |  | His list: Ensign, Knife, Kekekabic, Ogishkemuncie and Seagull. A picture from each. | M3 page |
| `m3.list.1` | soloist | Lake One, Lake Two, Lake Three, Lake Insula and Alice. A picture from each. I'd like to see them one more time. | M3 his list, said |
| `m3.page.list.1` |  | His list: Lake One, Lake Two, Lake Three, Lake Insula and Alice. A picture from each. | M3 page |
| `m3.list.2` | soloist | Basswood, Crooked, Iron, Lac La Croix and Fourtown. A picture from each. I'd like to see them one more time. | M3 his list, said |
| `m3.page.list.2` |  | His list: Basswood, Crooked, Iron, Lac La Croix and Fourtown. A picture from each. | M3 page |
| `m3.list.3` | soloist | Sawbill, Alton, Kelso, Polly and Malberg. A picture from each. I'd like to see them one more time. | M3 his list, said |
| `m3.page.list.3` |  | His list: Sawbill, Alton, Kelso, Polly and Malberg. A picture from each. | M3 page |
| `m3.list.4` | soloist | Brule, Cherokee, Frost, Little Saganaga and Gabimichigami. A picture from each. I'd like to see them one more time. | M3 his list, said |
| `m3.page.list.4` |  | His list: Brule, Cherokee, Frost, Little Saganaga and Gabimichigami. A picture from each. | M3 page |
| `m3.list.5` | soloist | Snowbank, Disappointment, Ima, Thomas and Fraser. A picture from each. I'd like to see them one more time. | M3 his list, said |
| `m3.page.list.5` |  | His list: Snowbank, Disappointment, Ima, Thomas and Fraser. A picture from each. | M3 page |
| `m3.ask` | soloist | Would you go for me? Five places. I'll write them down. | M3 his ask |
| `m3.c.yes` |  | I'll go. | M3 the yes |
| `m3.c.no` |  | Not this year. | M3 the no (he asks again another day) |
| `m3.c.show` |  | I have your pictures. | M3 back with all five |
| `m3.wait` | soloist | Any luck? No hurry. The lakes aren't going anywhere. | M3 again, before all five |
| `m3.back` | soloist | That's it. That's the one. You don't know. Thank you. | M3 the pictures shown |
| `m3.page.first` |  | One picture for his list. | M3 page |
| `m3.page.three` |  | Most of his list now. | M3 page |
| `m3.page.all` |  | All five. He'll want to see them. | M3 page |
| `m3.end.thanks` |  | Showed him all five at the dock. He kept looking at the last one. | M3 end |
| `m3.end.home` |  | He went home at freeze-up. I still have the pictures I got. | M3 end without you |
| `m3.pay` |  | $30 from the man at the dock. For the pictures. | M3 the tally line |
| `m3.first` |  | First stamped: somebody else's trip. | M3 the trip card |
| `m4.ask.1` | Tom | Since you're out there anyway. Somebody left a mess at a site. Pack it out? I'll put it on the board in your name. | M4 favour 1 |
| `m4.ask.2` | Tom | You again. Good. There's a tree down across a carry. Got a saw? | M4 favour 2 |
| `m4.ask.3` | Tom | Third time. People are going to talk. Another site needs packing out. | M4 favour 3 |
| `m4.ask.4` | Tom | We rotate out end of the month. One last check on a chain before the ice. I trust your eyes. | M4 the fourth, October |
| `m4.c.yes` |  | Sure. | M4 a favour taken |
| `m4.c.no` |  | Not this time. | M4 a favour passed (asked again next meeting) |
| `m4.busy` | Tom | Do that one first. We'll be around. | M4 a favour still open |
| `m4.name.0` | Tom | I'm Tom, by the way. That's Kelsey. Kelsey does the actual work. | M4 the second meeting, the year the partner is Kelsey |
| `m4.page.partner.0` |  | The rangers are Tom and Kelsey. | M4 page |
| `m4.name.1` | Tom | I'm Tom, by the way. That's Marcus. Marcus does the actual work. | M4 the second meeting, the year the partner is Marcus |
| `m4.page.partner.1` |  | The rangers are Tom and Marcus. | M4 page |
| `m4.name.2` | Tom | I'm Tom, by the way. That's Jen. Jen does the actual work. | M4 the second meeting, the year the partner is Jen |
| `m4.page.partner.2` |  | The rangers are Tom and Jen. | M4 page |
| `m4.name.3` | Tom | I'm Tom, by the way. That's Dale. Dale does the actual work. | M4 the second meeting, the year the partner is Dale |
| `m4.page.partner.3` |  | The rangers are Tom and Dale. | M4 page |
| `m4.name.4` | Tom | I'm Tom, by the way. That's Priya. Priya does the actual work. | M4 the second meeting, the year the partner is Priya |
| `m4.page.partner.4` |  | The rangers are Tom and Priya. | M4 page |
| `m4.name.5` | Tom | I'm Tom, by the way. That's Nils. Nils does the actual work. | M4 the second meeting, the year the partner is Nils |
| `m4.page.partner.5` |  | The rangers are Tom and Nils. | M4 page |
| `m4.page.met1` |  | Two rangers. Asked where I came in. Asked about my food. | M4 page |
| `m4.page.met3` |  | Tom and his partner again. A third favour. | M4 page |
| `m4.page.three` |  | Three favours done for the district. | M4 page |
| `m4.page.last` |  | One of their last checks before freeze-up. | M4 page |
| `m4.end.last` |  | Did their last check. Tom said "Good camp" and meant the summer. | M4 end |
| `m4.end.rotated` |  | The rangers rotated out for the winter. Somebody else's district till spring. | M4 end without you |
| `m4.first` |  | First stamped: a favour for the district. | M4 the trip card |
| `m5.say.bet.0` | Ernie | Vern says you can't do Farm, Garden and Clear and be back at this counter before the ice. I say you can. Twenty dollars says one of us is wrong. | M5 the bet, the year the route is Farm Lake / Garden Lake / Clear Lake |
| `m5.page.bet.0` |  | Two old guides bet on me: Farm, Garden and Clear and back before the ice. | M5 page |
| `m5.say.bet.1` | Ernie | Vern says you can't do Lake One, Lake Two, Lake Three and Lake Four and be back at this counter before the ice. I say you can. Twenty dollars says one of us is wrong. | M5 the bet, the year the route is Lake One / Lake Two / Lake Three / Lake Four |
| `m5.page.bet.1` |  | Two old guides bet on me: Lake One, Lake Two, Lake Three and Lake Four and back before the ice. | M5 page |
| `m5.say.bet.2` | Ernie | Vern says you can't do Perent, Isabella and Bog and be back at this counter before the ice. I say you can. Twenty dollars says one of us is wrong. | M5 the bet, the year the route is Perent Lake / Isabella Lake / Bog Lake |
| `m5.page.bet.2` |  | Two old guides bet on me: Perent, Isabella and Bog and back before the ice. | M5 page |
| `m5.say.bet.3` | Ernie | Vern says you can't do Perent and Isabella and be back at this counter before the ice. I say you can. Twenty dollars says one of us is wrong. | M5 the bet, the year the route is Perent Lake / Isabella Lake |
| `m5.page.bet.3` |  | Two old guides bet on me: Perent and Isabella and back before the ice. | M5 page |
| `m5.ask.bet` |  | What's the bet? | M5 counter topic at Farm 31 or Hog Creek 36 |
| `m5.ask.back` |  | I made the run. | M5 back at the counter |
| `m5.say.back` | Ernie | Well. Vern, pay up. Not you. Him. Twenty dollars and he's still not happy about it. | M5 back at the counter |
| `m5.skim` |  | Skim ice. The paddle handle breaks it. | M5 skimice, taught once |
| `m5.skim.through` |  | Through. It closes behind you. | M5 skimice, broken through |
| `m5.page.skim` |  | Skim ice in the bays. Broke it with the paddle handle. Sounds like glass. | M5 page |
| `m5.page.out` |  | Out on the run. Snow on the birch. | M5 page |
| `m5.page.round` |  | Every lake on their route. Now back before it closes. | M5 page |
| `m5.end.made` |  | Made it back. Ernie won. Vern says it doesn't count. | M5 end |
| `m5.end.ice` |  | The ice won. It usually does. | M5 end without you |
| `m5.first` |  | First stamped: the last trip of the year. | M5 the trip card |
| `m6.ask` |  | What about a long stay? | M6 counter topic, any store |
| `m6.say` | keeper | Thirty days in, one resupply? People do it. Pick what it's for or you'll just get tired. Lakes, fish, pictures, nights. | M6 counter topic |
| `m6.ask.lakes` |  | Fifty lakes. | M6 the project |
| `m6.say.lakes` | keeper | Fifty. Bring a pencil. | M6 the project |
| `m6.page.lakes` |  | The long stay: fifty lakes in thirty days. | M6 page |
| `m6.ask.species` |  | Every fish there is. | M6 the project |
| `m6.say.species` | keeper | Every species. You'll want a better rod. | M6 the project |
| `m6.page.species` |  | The long stay: every fish in the water, in thirty days. | M6 page |
| `m6.ask.photos` |  | A photo series. | M6 the project |
| `m6.say.photos` | keeper | Thirty pictures. Make them good ones. | M6 the project |
| `m6.page.photos` |  | The long stay: thirty pictures in thirty days. | M6 page |
| `m6.ask.nights` |  | Just the nights. | M6 the project |
| `m6.say.nights` | keeper | Thirty nights. That's the whole thing, really. | M6 the project |
| `m6.page.nights` |  | The long stay: thirty nights out. | M6 page |
| `m6.page.half` |  | Halfway. | M6 page |
| `m6.page.resupply` |  | Came out once for food. That's the one. | M6 page |
| `m6.page.second` |  | Came out a second time. Doesn't matter. It's mine. | M6 page |
| `m6.end.done` |  | Thirty days and what I said I'd do. | M6 end |
| `m6.end.yours` |  | Thirty days. Not all of it. It's still mine. | M6 end, the days over |
| `m6.first` |  | First stamped: a long stay. | M6 the trip card |

## Stream p (Round 6: the company and the press) — build drafts, for the writers to replace

The company and the press (40): the leech-order pad, the Ledger topic, Dan's junk and his card, the Kettle handout, the
things a player can bring Maggie (40 §6.6 has her replies, not the asks). Lines the docs have in prose were anchored in 40
(`40.w.*`, `40.brekke.again`, `40.hog.*`, `40.pad.keeper`, `40.maggie.*`, `40.stranger.dot`, `40.josie.hog`, `40.wade.josie`)
and 30 (`30.lid.keep`), prose unchanged.

<!-- id: d95.p.pad.ask -->
```
Leave a leech order.
```
Used: The counter's order pad, any outfitter (company.js PAD): the verb, 40 §6.9 names it in bold ("Leave a leech order") but gives no line.

<!-- id: d95.p.pad.lakeone -->
```
Lake One.
```
Used: The pad: the place, the first of the two Maggie named (40 §6.9).

<!-- id: d95.p.pad.gabbro -->
```
Little Gabbro.
```
Used: The pad: the place, the second.

<!-- id: d95.p.pad.1 -->
```
One dozen.
```
Used: The pad: the number of dozens (the days from today, 40 §6.9).

<!-- id: d95.p.pad.2 -->
```
Two dozen.
```
Used: The pad: the number of dozens (the days from today, 40 §6.9).

<!-- id: d95.p.pad.3 -->
```
Three dozen.
```
Used: The pad: the number of dozens (the days from today, 40 §6.9).

<!-- id: d95.p.pad.4 -->
```
Four dozen.
```
Used: The pad: the number of dozens (the days from today, 40 §6.9).

<!-- id: d95.p.pad.5 -->
```
Five dozen.
```
Used: The pad: the number of dozens (the days from today, 40 §6.9).

<!-- id: d95.p.pad.6 -->
```
Six dozen.
```
Used: The pad: the number of dozens (the days from today, 40 §6.9).

<!-- id: d95.p.pad.7 -->
```
Seven dozen.
```
Used: The pad: the number of dozens (the days from today, 40 §6.9).

<!-- id: d95.p.pad.8 -->
```
Eight dozen.
```
Used: The pad: the number of dozens (the days from today, 40 §6.9).

<!-- id: d95.p.pad.9 -->
```
Nine dozen.
```
Used: The pad: the number of dozens (the days from today, 40 §6.9).

<!-- id: d95.p.pad.slip -->
```
PHONE ORDER — LEECH ORDER — {n} doz — {place}
```
Used: The slip filled in before it is torn off (40 §6.9 "Teach once"), shown as a note; the slip's shape is item.leechslip's.

<!-- id: d95.p.pad.never -->
```
Never mind.
```
Used: The pad: put the pen down.

<!-- id: d95.p.ledger.ask -->
```
The Ledger?
```
Used: A keeper topic after Tauno's "Not yet." (40 §6.2 "The player's own way"): the keeper's answer is 40:6.2.8.

<!-- id: d95.p.lid.sell -->
```
Sell it. Forty dollars.
```
Used: Dan sees Leo's lid (30 §4.3 "The open-house sale": Sell, $40); Keep is 30.lid.keep.

<!-- id: d95.p.blade.offer -->
```
That a shovel blade? Somebody's, once. Twenty bucks for the wall, if you're not attached to it.
```
Used: Dan sees the broken shovel blade (30 §4.7, 90: Dan buys it for $20; no line in the docs).

<!-- id: d95.p.blade.sell -->
```
Twenty. Sure.
```
Used: The player sells it.

<!-- id: d95.p.dancard -->
```
Dan Marolt · Community Relations · Northmark Metals · Ely
218-555-0144

(on the back, in ballpoint) Anytime. —D.
```
Used: Dan's card (item dancard, 40 §3.1): the card's words are the doc's; the number is a build draft (218-555-01xx: a number set aside for fiction).

<!-- id: d95.p.handout -->
```
NORTHMARK METALS — THE KETTLE PROJECT
The project area, shaded, south-west of Bald Eagle. The historic Kettle pad marked.
Twelve small numbered dots along an unnamed creek: Historic baseline stations (1976–77). Seven to twelve are below the pad.
Legend: Background water quality: naturally mineralised
```
Used: The Kettle project handout Maggie gives (40 §6.3, description only; the italic words are the doc's).

<!-- id: d95.p.m.register -->
```
The bunkhouse register. W. Helstrom, day use, parked.
```
Used: Maggie, 40 §6.6: the player brings the 2019 register page.

<!-- id: d95.p.m.receipt -->
```
A fuel receipt from the camp on the Isabella.
```
Used: Maggie, 40 §6.6: the Isabella receipt.

<!-- id: d95.p.m.guestbook -->
```
Aili's guest book. He signed it.
```
Used: Maggie, 40 §6.6: Aili's guest book.

<!-- id: d95.p.m.sheila -->
```
Sheila's report.
```
Used: Maggie, 40 §6.6: Sheila's report.

<!-- id: d95.p.m.ollie -->
```
Ollie's search log. 1977.
```
Used: Maggie, 40 §6.6: Ollie's log.

<!-- id: d95.p.m.tasha -->
```
Somebody at the company flagged the stations last year.
```
Used: Maggie, 40 §6.6: Tasha's 2025 flag (her name never said).

<!-- id: d95.p.m.tauno -->
```
There's a man who'll go on the record.
```
Used: Maggie, 40 §6.6: Tauno will go on record.

<!-- id: d95.p.m.dan -->
```
Dan called it 'proprietary exploration data'.
```
Used: Maggie, 40 §6.6: the phrase from Dan.

<!-- id: d95.p.m.creek -->
```
A picture of the orange creek.
```
Used: Maggie, 40 §6.6: a photo of the creek.

<!-- id: d95.p.m.farend -->
```
I think I know where it is.
```
Used: Maggie, 40 §6.6: anything that places the far end.

<!-- id: d95.p.m.alive -->
```
I think Walt's alive.
```
Used: Maggie, 40 §6.6: "If the player says Walt is alive".

<!-- id: d95.p.wade.dot -->
```
Man in clean boots.
```
Used: The dot on Wade at the counter after N39 is read (40 §4.3, the doc's words in a stage direction).

<!-- id: d95.p.cig -->
```
A cigarette butt, still warm. A brand band on it.
```
Used: The stranger's cigarette, picked up (40 §3.4; the dot's words are 40:3.4.c1).
<!-- id: d95.p.m.wadenum -->
```
That number Denny gave me. It's Wade's.
```
Used: Maggie, 40 §6.6: Wade's number, from Denny after the reveal (her reply is 40:6.6.9).

