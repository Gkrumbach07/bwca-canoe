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
