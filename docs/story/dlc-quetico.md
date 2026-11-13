# Quetico as DLC: what the family arc moved, and what would go back

Owner, 2026-11-08: Quetico is DLC for now, out of bounds like any land past the edge (no Quetico permit, no ticket, no
camping of its own; the edge notice). Campaign-design Part 3 asked for chapter 6 ("the family": Gord, the Quetico
permit, Danielle at Prairie Portage, the Carp-end stone) to be re-planned on the US side. Stream a4 (campaign Round 6)
built it this way. Nothing in the base game needs Quetico; lock 4's keys A (Aili) and D (Liisa's cards) are reached
entirely at Little Vermilion 12, and the "went north" hinge still turns on the drift test alone or any two of its pieces.

## What was checked (the edge table, src/edge.bin, zone by cell)

| Place | Where (v3/v9 x, z) | Zone | Verdict |
|---|---|---|---|
| Carp Portage P47, the Birch end | (−10266, 2118) | 1 (wilderness) | in bounds |
| Carp Portage P47, **the Carp end** | (−10054, 2049) | 1 (wilderness) | **in bounds: the stone stays where 03-places has it** |
| Prairie Portage P194, the Basswood end | (−16720, 4231) | 1 | in bounds |
| Prairie Portage P194, the Sucker end | (−16605, 4549) | 1 | in bounds (the tow landing) |
| Sand Point C2063, King Williams Narrows | (−94782, −30282), (−93055, −24067) | 0 (outside the wilderness) | open to paddle (the "You have left the Boundary Waters" notice), not Quetico |
| The Little Vermilion store (EP 12), Crane Lake | (−89005, −20325) | 1 / 2 | in bounds |

## What moved, and how

1. **Danielle Carriere** (bible 4.10, 5.6 no. 3): the Quetico ranger "at the Prairie Portage station (needs the Quetico
   permit and crossing)". **Moved to the US end of Prairie Portage**, the Sucker end of P194 where the Moose Lake tow
   boats land, Monday to Thursday 10:00–15:00, June to September: she walks over to the American landing on her rounds
   "to see who's crossing". Her words there are build drafts (95-drafted-lines.md, Stream a4): "This is your end, so
   there's nothing I can sell you", her bible voice line "We log what we find. We don't always know what we found.",
   the canoe logged 26 October 2019 (`danielle.log`, the "went north" piece), and, once the player knows the stones
   (the pattern, Aili's word or the cards), the Carp end: "Took it for a cairn. It's still on the pile there, your side
   of the line." (`danielle.stone`, a ring on the Carp end). Nobody sends the player to her (bible 5.6): she is at a
   landing many players pass anyway (S7's Mummo's, the tow).
2. **The Quetico permit / the check-in** ("Remote Area permits are done this year, so you'll check in properly"):
   **dropped**. The US side has nothing to replace it with at the landing (a BWCAW permit is checked at the store), so
   her opener is a plain greeting instead. No permit item, no fee, no crossing.
3. **The Carp-end stone** (bible 5.4, 03-places §4.8): the Carp end of P47 is in bounds, so the place stays. Built as
   03-places has it: a stump with a clean, unweathered ring where the stone sat, and Danielle's cairn beside it with the
   white cobble on top (the cairn stands on the US side in this build). Look at each: `carp.stump`, `carp.stone`; both:
   the Walt line "a clean ring on the stump … The ranger's cairn has a white one on top." (a build draft).
4. **Gord Pelletier** (33 §6.13): no move needed. He comes across Sand Point on Thursdays to the Little Vermilion
   store's dock, US side. His boat is stream m's motorboat (`tow` kind, tied, no driver) at the dock's third berth.
5. **The Sand Point chase** (33 §6.7): Sand Point is outside the wilderness (Voyageurs / Crown land, not Quetico: 33
   §11.1). Built as written, minus one of its four ways to lose Jon: **"The line"** (crossing the border on a trip that
   holds a Canada crossing) needs a crossing, which only the DLC sells. The islands, the wind (the lee) and the narrows
   stay (stream m's trail mode); a `stopped` at a line still ends the chase as `line` if a later build draws one.
6. **NF2, Lac La Croix** (C745, the US side): untouched; its second ink ("The other side doesn't ask your name.") is a
   look across, not a visit.

## What would go back into a Quetico DLC

- Danielle at the **Prairie Portage ranger station** proper (the Canadian side), with the **Quetico permit / Remote Area
  check-in** as bible 4.10 writes it, her two bible lines verbatim, and the station's log book as a prop. The US-landing
  version can stay as her rounds.
- The **Carp end on the Canadian shore** if the DLC redraws the line there; the cairn moves with her.
- **"The line"** on Sand Point: a trip holding a Canada crossing, the grey boat stopping at the border "as if it were a
  wall" (motorboat `stopAt(line)` is built; it needs the line's segment and the crossing permit).
- The 33 §11.1 alternative chase on the **Loon River, Loon Lake and the Beatty Portage** into Lac La Croix (the real
  motor route into Quetico's west door), and NF2's "other side" as a place.
- Walt's route north past Birch (bible 2.5, the Sucker–Birch bypass onward): the abandoned canoe Danielle logged could be
  found where it lay; Gord's "camp up north" stays unnamed in every version (33 §6.13: Gord never names a lake).
- The director's beat b12.3 (Little Vermilion beat 3, "the line points at the Canadian side") waits for the DLC too.
