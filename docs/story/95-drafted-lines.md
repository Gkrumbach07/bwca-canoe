# Drafted lines (build drafts, for the writers to replace)

Every line in this file is a **build draft**: the game needed words where the writers' docs (10–70) have none, so a
build stream wrote a stand-in in the voice of `02a-voice-journal.md` and `02b-voice-people.md`. None of it is canon.
Writers: replace any line here by writing the real one into your own doc with the same `<!-- id: -->` anchor (or a new
anchor, and tell the builders), then delete the draft. Nothing in the writers' files was changed to make room for these.

Each entry: the anchor, the line, and where the game uses it. `story-extract.mjs` reads this file into
`src/story-data/text/drafted.json`, like the others.


---

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
