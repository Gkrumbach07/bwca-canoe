# Co-op and multiplayer

A plan, not a build. The owner (2026-10-25): "possibly even a coop or multiplayer mode. this is bigger change so lets
get it working first before we add it". Two to four friends on one trip: each in their own browser, one shared season,
one lake, one clock. The game is a static site on GitHub Pages with no server ([HOSTING.md](../HOSTING.md)), everything
is saved in one browser's localStorage, and about twenty modules assume one `player`. This plan says what to host,
who is in charge of what, which parts of the code change, and a path from a two-player paddle to a shared season.
Read after [people.md](people.md) and [companions.md](companions.md): their actor layer (a figure and a hull that
move from state you hand them) is what a remote player is drawn with, and their group model is the group here.

## What it feels like

You open the pause card and pick *Invite*: a six-letter code and a link. Your friend opens the link, picks a name and
a shirt, and walks out of the store door at the landing you are tied up at. Two canoes push off. On the lake you see
their strokes and their wake; on a portage one of you takes the canoe and the other the packs, as the companions do;
at the site you both pitch a tent, one of you lays the fire, and the barrel goes up on whoever's rope. When it is dark
you point at your tent and say *Rest until first light*; they see "Gage wants to turn in" by their tent and press E, and
the night goes by for both. In the morning the clock, the weather, the fire's coals and the food in the barrel are the
same on both screens. The season is yours; your friend was on it.

The rules applied: nothing new on the HUD but the other players' names over their heads when near (the barks' style)
and one chip when the group waits on you. No chat window: a few quick lines on a key (*Over here* · *Wait* · *Fish on*),
said as barks. No scores, no roles, no host menu. Real to BWCA practice: a group travels together, nine at most.

## The architecture for a static site

The app stays on Pages. What is added is one small thing to host; three ways to do it, costed for a game with tens of
sessions a day (prices as of October 2026, free tiers quoted as "about"):

| Option | How | Latency | Cost | Hosting |
|---|---|---|---|---|
| **A. WebSocket relay room** (recommended first) | one Cloudflare Worker + a Durable Object per room: every client holds a WebSocket to the room, the room forwards messages and keeps the last state for late joiners | ~30–80 ms added (a round trip through the nearest edge) | free tier: about 100k requests and the DO's storage a day; a paid plan is $5 a month past it; a hundred sessions a day stays free | `wrangler deploy` from a `server/` folder in this repo, a GitHub Action on push; the room URL is a build variable like `VITE_DATA_URL` (`VITE_RELAY_URL`) |
| **B. WebRTC data channels** (peer to peer) | the same Worker only for signalling (exchanging offers); then every client talks straight to every other; Google's STUN free; a TURN server for the 10–20 % of pairs behind symmetric NATs (Cloudflare's TURN has a free allowance of about 1 TB a month, then $0.05 a GB) | the best: 10–40 ms between friends in one country | free, but two paths to maintain (p2p and TURN) and four peers is six connections | the Worker as in A plus TURN credentials minted by it |
| **C. A hosted room service** | PartyKit (on Cloudflare), Colyseus Cloud, Supabase Realtime or Firebase RTDB as the relay | as A | free tiers of about 100–200 connections; a bill once popular | another vendor's dashboard and account |

**Recommendation: A first, B only if a paddle stroke needs it.** The relay is one code path that works behind every
NAT, needs no TURN, gives late joiners the state, and costs nothing at this scale. The other players' canoes are drawn
150 ms behind anyway (below), so the relay's extra 30–80 ms is inside what is already hidden. The Worker is about 150
lines: rooms keyed by code, a client list, broadcast, the host's last full snapshot kept for a joiner, a 10-minute
timeout after the last client leaves. Move the per-frame pose traffic to WebRTC in a later phase if measured latency
on a friend's stroke ever reads over 120 ms; the room stays for signalling and the ledger.

## Authority: who decides what

**The host is the browser that owns the season.** It runs the whole simulation as the game runs today; the guests run
the same client with the shared modules in a mirror mode. There are three kinds of state:

| Kind | Examples | Who owns it | How it moves |
|---|---|---|---|
| **Each player's own** | position, heading, mode (paddle · carry · walk · swim · sit), speed, boost, stroke phase, the pose's gait and hands, the rod up, held job progress | that player's client, no reconciliation | 15 Hz, unreliable, ~60 bytes; others draw it as an actor 150 ms behind, extrapolated by velocity over gaps |
| **Shared things** | every container and item (the inventory document), the canoes and what rides in them, fires (laid · burning · coals, the fuel bin), the tents and their stages, the barrels hung, the piles and firewood taken, forage picked, the campsite claims, the boards and the notices and coolers, money, the stringer | the host | commands from any client (`move item`, `feed fire`, `claim site`), the host applies them with the same functions the game has (`inventory.move`, `fires.feed`, `registry.claim`) and broadcasts the result; the guest shows the verb pending until it comes back (one round trip, usually unnoticed) |
| **The host's own** | the clock (`day` year · doy · hours · rate), the pace keys, the weather seed and the wind, the trip's log, evacuations, rides, NPC parties and companions | the host | 1 Hz for the clock and the wind, events for the rest; guests set their `day` from it and run their own look (sky, fog, water) from the same numbers |

What stays local and may differ between screens, on purpose: the fauna, the loons, the fish rising, the mist, the
audio, the camera, the book, the cards, the hints, the photos taken (a print is yours; a photo notice's subject is
reported as an event and the host credits it). **Weather is nearly free:** `weather.js` builds the whole year from a
seed, so the seed plus the clock give every client the same sky; only the wind's live state (`wind.js` rolls the day
and gusts) is sent at 1 Hz.

**Fishing** is each player's: your rod, your bites, your RNG; a kept fish is a command (`stringer add`) the host records.
**Energy** is each player's bar, run locally from the shared clock; the host keeps a copy for the evacuation rule.
**NPC people** (people.md) are deterministic from seeds, so every client places the same parties; only what they say
to you and the tasks they give go through the host. **Companions** (companions.md) are host-run actors like any
other; guests see them as actors.

## The one clock

*Revised 2026-11-01.* The first draft (rate = the slowest player's, 1 2 3 shared) is gone: "one speed" (2026-10-26)
made the clock ×8 for everyone, always (`pace.js CLOCK`, `trip.js update`: `d.rate = clockOf(p.pace)`), and removed
1/2/3. Co-op keeps that: **the host's clock runs at ×8 and nothing a single player does changes its rate or jumps it.**
The only things that move the clock faster than ×8 are the group jumps below, and each needs everyone.

### What still jumps the clock today (audit at e2019f0)

The owner, 2026-10-31: "the time it takes to do that fast forwards time, which is going to be incompatible with our
clock". The tent (`tent.js` PITCH, `camp.js` clock: false) and the barrel (`hang.js` HANG/LOWER, clock: false) and
the push-off were fixed then. **The first fourteen rows below were fixed on 2026-11-01** (this branch): `hold.js` passes no
clock by default and derives each phase's minutes from its seconds (`pace.js onClock`), camp chores and forage picks pass
nothing, and `pace.js` 'life' keeps the ×8 clock. What they were, for the record:

| Where | What | Clock passed | Real time | Effective rate |
|---|---|---|---|---|
| `tarp.js` PITCH_TARP / STRIKE_TARP | pitch the tarp / take it down | 10 min / 6 min | 3.7 s / 2.8 s | ×160 / ×130 |
| `chores.js` DOUSE | put the fire out | 9 min | 3.0 s | ×180 |
| `chores.js` SAW | saw a dead spruce (3 lengths) | 15 min | 3.75 s | ×240 |
| `chores.js` POLE_CUT | cut a tarp pole | 6 min | 1.6 s | ×225 |
| `chores.js` LATRINE | the latrine | 10 min | 3.4 s | ×175 |
| `task-kinds.js` SAW | clear a blowdown off a trail | 17 min | 6.8 s | ×150 |
| `task-kinds.js` SECCHI | a Secchi reading | 7 min | 7.2 s | ×60 |
| `packs.js` LOAD_EACH | load the canoe, per thing | 1 min + 2.5 per 100 m | 0.45 s + | ×130+ |
| `player.js` offerHaul | haul over a beaver dam | 9 min | 7.2 s | ×75 |
| `camp.js` CHORES.fill | fill the bottle | 5 min | 0.7 s | ×430 |
| `kit.js` pump / gravity | pump the bottle / fill the bag | 4 / 2 min | 3.2 / 0.9 s | ×75 / ×130 |
| `kit.js` clean | fillet the catch | 3 min a fish | 1.2 s + 0.7 s a fish | ×190+ |
| `forage.js` pick | berries, mushrooms | 15–20 min | 1.0–1.4 s | ×640–1200 |
| `photo.js` raised camera | pace 'life': clock **1:1** while raised | slows the clock | — | ×1 (slows everyone) |
| `packs.js` fetch (Q on a portage) | walk back for the second load: a fade | the walk's hours | a fade | a jump |
| `rides.js` | a ride to another outfitter | the drive's hours | a fade | a jump |
| `outfitter.js` bunkhouse | a night in the bunkhouse | to morning | a fade | a jump |
| `trip.js` evacuate | brought in: wake at the landing | to 7:30 next day | a fade | a jump |
| `camp.js` wake / nap | the night, a nap | to the wake time | the night card | a jump |

**The fix used for the first fourteen rows was the tent's** (`tent.js`, 2026-10-31): `clock: false` on the held job (or
`hours: 0` on the chore), keep the real seconds, and set `minutes = seconds × CLOCK / 60` so hold.js's "min left" tells
the truth. A ten-minute tarp becomes a 1.4 s tarp on a ×8 clock, as the owner accepted for the tent ("we'll just have
to live with setting the tent up takes whatever time our normal clock is"). Done in single player now,
before co-op: one rule everywhere. Side effects to check in play: energy and food are paid per game hour, so a camp evening
costs a little less (forage was 15–20 game minutes a patch); the gravity bag's 5-minute drip (`GRAVITY_H`) is real
waiting and stays; the berries' and the latrine's numbers in `tuning.md` read from the minutes. The camera's 1:1 clock
becomes the photographer's own slow-motion only (no time-lapse on their own motion), never the shared rate.

The last five rows are real jumps and stay as **group jumps** (below).

### Rest and sleep: everyone, and one wake time

Owner, 2026-11-01: "sleep only happens when everyone is sleeping then u can do it. and they all choose a wake up time
together."

- **Turning in.** E on your tent, *Rest until…*, opens today's dial (`camp.js restDial`). In co-op it is a **shared
  dial**: the host holds one proposal `{ wakeAt, by }`. The first player in sets it; everyone else's dial opens on it.
  Each player's row on the card shows the others: a name, *in the tent* or *still up*, and their tick.
- **Choosing together.** Turning the dial (← →) moves the wake time for everyone and clears every tick but yours, so
  a tick always means "I agree to this time". E ticks. The night begins when **every player is in their tent and has
  ticked the same wake time**. Nothing else to vote on, no host menu.
- **Waiting on someone.** The others see one chip by their tent, "Ada wants to turn in, up at first light", until they
  join. A player still up sees "the others are in their tents" and nothing is forced. Leaving the tent (Q) takes your
  tick off. A player who has dropped from the room for over a minute is counted as asleep in their tent (their body
  is there), so a lost connection never blocks the night.
- **The night.** The host runs today's `wake()` once (`jump(n.hours)`, `setClock(... wakeAt)`, the bear, the rain on a
  fly-less tent), sends the new clock, and every client runs its own `energy.sleep(q, hours)` from its own tent's
  quality (pad, bag, fly). One night card on every screen, the same length.
- **A nap** is the same dial with a short wake time. Late-night rules (`LATE_NIGHT`, `SLEEP_IN`) apply to the agreed
  time, once, on the host.

### The other group jumps

- **The fetch** (Q on a portage): in co-op it is not offered; the carry is split between players, as a real group
  does. A solo player in a group walks it.
- **A ride or the bunkhouse:** a group jump like the night: everyone at the store ticks; the host advances.
- **An evacuation** moves that one player to the outfitter at the shared time, with no jump (they wake there on the
  group's clock); the trip goes on for the rest, and they can rejoin by paddling or a group ride.
- **Real pace** (Settings › Developer) is the host's and only in Sandbox.

## Where saves live

*Revised 2026-11-01.* The owner: "i dont like saves being made in local storage, is that really the best spot?"

**Today** (`save.js`): every season key is a `localStorage` string (`bwca-canoe:<ns>`), three slots, parked slots
LZW-packed, autosave every 4 s and on pagehide; photo prints and occlusion bakes in IndexedDB; a `.json` export and
import. A long season is 33–80 KB raw. Nothing asks the browser to keep it (`navigator.storage.persist()` is never
called).

**What is wrong with localStorage alone:**
- The browser may delete it. Safari deletes all of a site's script-written storage after 7 days without a visit
  (ITP), and any browser may evict "best-effort" storage under disk pressure or when the user clears site data.
- It lives on one device and one browser profile: no laptop-to-desktop, no phone.
- For co-op it is the wrong owner: in the first draft the season was in the host's browser, so "if the host is away
  the season is away" and a guest could never resume a shared season alone.
- It is synchronous and small (about 5 M characters). Not a problem at 80 KB, but every write blocks a frame.

**The options:**

| Option | Survives clearing / Safari | Other devices | Co-op season without the host | Needs | Cost |
|---|---|---|---|---|---|
| A. localStorage (today) | no | no | no | nothing | free |
| B. IndexedDB + `navigator.storage.persist()` | mostly (persisted storage is not evicted; the user can still clear it) | no | no | a storage adapter in `save.js` | free |
| C. **The co-op room keeps the season** (the Durable Object's own storage) | yes | yes, with the season's code | yes: anyone in the group can open it and becomes host | the Worker the co-op plan already needs | inside the free tier at 80 KB a season |
| D. Accounts and a cloud database (Supabase, Firebase) | yes | yes, by login | yes | sign-in, an account system, another vendor | free tier, then a bill |
| E. The user's own cloud (Google Drive / Dropbox app folder) | yes | yes | awkward (whose Drive?) | OAuth per provider | free |

**Recommended: local-first, with the season's copy in the room.**
1. **Now, single player (small). Built 2026-11-01 as `src/store.js`:** keep the `save` API exactly as it is (every module calls `save.read/write`), and
   put it on a storage adapter: an in-memory cache read once at boot, written through to IndexedDB, with
   `navigator.storage.persist()` asked for on the first Play. localStorage stays only as the fallback when
   IndexedDB is refused. This protects against eviction under disk pressure where the browser grants `persist()` (Chrome decides by site engagement, Firefox asks, Safari decides itself). Whether Safari's 7-day rule for sites not visited spares persisted storage was not re-checked; the room's copy (step 2) and *Export season* are the answer to that. The slots, export/import and
   migration tables (`src/migrate/`) keep working on the same keys. *Export season* stays as the user's own backup.
2. **With co-op phase 1 (the Worker exists anyway):** a season can be **shared**. The Durable Object for the season
   (keyed by a season id, not by a room) stores the packed season (the same `Z1:` string the slots already make,
   about 13 KB) every minute and at each night. The browser that is playing is the authority, as before; the room is
   the durable copy. Anyone holding the season's link can resume it on any device, and in co-op whoever opens it first
   is the host. This removes "the host is away, the season is away" and gives cloud saves for free, with no accounts:
   the season link is the secret, as the room code was.
3. **Not doing** accounts (option D) or the user's Drive (option E): both add sign-in, which this game has none of,
   for what C already gives.

**Conflicts.** The room keeps a `gen` per season (save.js has one already). A browser writing with an old `gen` is
refused and told the season moved on elsewhere ("played on another device since"), with *Load the newer one* and
*Keep this one as a copy*. Only one host at a time holds the season's write lock in the Durable Object.

**Guests** keep a small visitor profile locally (name, look, seasons visited), as before; their things live inside
the season.

## Joining a friend's trip

- **Invite:** the pause card (Esc) gets *Invite friends* while a season is under way: it opens the room and shows the
  code and the link `…/bwca-canoe/?join=ABCDEF`. *Stop sharing* closes it.
- **Join:** the link, or *Join a trip* on the title with the code. A name and a look (the `dress` palettes from
  `npcs.js`: a shirt, a hat), then the loading bar; the tiles stream round the host's position.
- **Where you arrive:** at the store door of the outfitter the host is at, or the one the trip left from, beside the
  host's canoe if the host is at the landing. If the host is out in the wilderness, the newcomer arrives at the
  nearest outfitter the host knows and the host is told ("Ada is at Lake One"); they paddle to meet, or the host sends
  a ride (a group jump) to the host's landing. Sandbox seasons join at the host's side anywhere.
- **Leaving:** close the tab, or *Leave the trip* on the pause card; your canoe and things stay where they are for the
  host to deal with (as a companion's would), and the host can *Send home* a long-gone player's gear to the outfitters.
- **Reconnect:** the room keeps the host's last snapshot; a guest who drops gets it back in one message and resumes.

## Latency on a paddle stroke

Your own canoe is simulated on your machine at the full rate, as now: no stroke ever waits for the network. The other
canoes are actors fed by their players' 15 Hz state, drawn 150 ms in the past and interpolated, so they glide; a lost
packet extrapolates by velocity for up to 400 ms before the actor holds. The stroke animation is the actor's own
(poses.js) driven by the synced phase, so it never stutters with the network. The wake and ripples are spawned locally
from the actor's motion. Shared actions (E on a container, a drag in the book) are commands: the verb shows a small
pending state for one round trip (30–150 ms on a relay) and the result applies; a refused command (the other player
took the last branch first) snaps back with the usual greyed why. Nothing in the game is a twitch action, so this is
enough; measure it with two headless Chromiums on one machine and a 100 ms added delay before deciding on WebRTC.

## Cheating

None matters. The host validates commands only for consistency (an item cannot be taken twice, a site cannot be
claimed twice), never for fairness; a modified client can only spoil its own friends' trip. No accounts, no scores, no
leaderboards: nothing to gain. The room code is the only secret, and a room with a wrong code gets nothing.

## What assumes one player today

From reading the code; the plans above change the ones marked *actor* and *group* first:

| Module | The assumption | What changes |
|---|---|---|
| `player.js`, `canoe.js`, `camera.js` | one `Player` on one rig, one `Input` on `window`, one chase | untouched for your own; a `RemotePlayer` is an actor (people.md) with a hull and a figure from the pools, fed by state |
| `main.js` | `player` passed to everything; `tiles.update(player.x, player.z)`; `faunaCtx.player`; the audio's listener | a `players` list beside `player`; the tiles stream round *you*; fauna and audio stay yours |
| `inventory.js`, `containers.js`, `packs.js` | `where: 'back' | 'chest' | 'hands' | 'pockets'` are *the* body; `reachable()` is from the player; `inventory.hands` | every body place gets `at: playerId` (*group*, from companions.md's `at: companionId`); `reachable(player)` already takes a player; the drawing follows each actor's bones; the document is the host's and every op a command |
| `profile.js`, `shop.js`, `tasks.js` | one purse, one kit in use, one set of boards, one `claimed` | the purse is the group's; the kit in use is per player (`kit[playerId]`); boards shared; claims shared |
| `trip.js` | one `active` trip, `state.camp`, `state.packs`, the log, `evacuate()` moves *the* player | the group's trip; tents a list (*group*); the log carries `who`; evacuation per player (that player goes to the outfitter and may rejoin by a ride) |
| `camp.js`, `tent.js`, `hang.js` | one tent (`trip.state.camp`), one `PLAYER` holder, one `restDial` | the tents list and `holder = 'group'` (*group*); the dial as a proposal |
| `hold.js` | one job at a time, globally | one job per player; the host runs the phases for shared things it receives (`held: at`) |
| `chores.js`, `fire.js`, `cook.js`, `forage.js` | `this.player`'s reach; wood placed from the player's position; `s.taken`, the fires record | host-owned state; the pieces placed by a seeded function of the site, not of who walked there (today it is per site already: "the same every visit") |
| `energy.js` | one bar, `trip.evacuate` on empty | one per player, local; `onEvac` tells the host |
| `daycycle.js`, `weather.js`, `wind.js` | the clock keys, the seed 23, the wind's random day | the host's; guests receive; `seed` from the season id |
| `npcs.js`, `dialogue.js` | one talker, `people.focus`, the `people` save | conversations local; their effects (tasks, told hints, standing) commands; rosters and parties already seeded |
| `save.js`, `outfitter.js save()`, `title.js` | localStorage in this browser, `pagehide` writes | an IndexedDB adapter behind the same API; the season's copy in its room; the guest's visitor profile; `Continue` on a guest's title offers *Rejoin* |
| `hud.js`, `pointer.js`, `nearby.js`, `cards.js`, `inv-ui.js` | draw *the* player's state | local; the other players' names over heads; the proposal chips |
| `fauna.js`, `loons.js`, `photo.js` | spawn round the player | local and different per screen; a photo's subject reported as an event |
| `rides.js`, `outfitter.js updateTrip` | one arrival, push-off when *the* player leaves the landing | push-off when any player leaves; rides a group jump; the nine-limit at push-off |

The single biggest change is the inventory's `at` and the tents list; both are companions.md's work, which is why that
plan comes before this one.

## The build

Effort in the project's units (streams, joins, rounds and tokens: [README.md](README.md), "How the effort is
estimated"). Two things here are new to the project and have no measured precedent: the Worker (a separate deploy, with
a Cloudflare account the owner creates once, ten minutes) and a two-browser test rig, which the first join builds.

| Phase | What | Needs | Effort |
|---|---|---|---|
| 0 **Prep** (inside the other plans) | the actor layer (people 2), `at: id` on body places and the tents list (companions 1–3), the weather seed from the season | | counted there |
| 1 **Two paddlers on one lake** | the Worker room; `VITE_RELAY_URL`; Invite and Join on the cards; the visitor profile; a `RemotePlayer` actor; pose traffic at 15 Hz; the clock from the host; Sandbox only; nothing shared but the water | the actor layer | 3 streams (the Worker small, ~0.1 B) + a join that also builds the two-browser rig (~0.3 B) · ~0.75 B · 1 round |
| 2 **Shared things** | the inventory document as the host's, every op a command with the pending verb; fires, tents, barrels, piles, forage, claims, boards, money, the stringer; the second body in the book's reach; Adventure | companions' `at` and tents | 3 streams + join · ~1.05 B · 1 round, and expect a fix round (+0.4 B): the widest change in the game |
| 3 **A night together** | rest and nap as proposals; the pace keys shared; the fetch and rides as group jumps; wind at 1 Hz; evacuation per player; reconnect and rejoin; the host's save with the guests inside; the nine at push-off | phase 2 | 2 streams + join · ~0.7 B · 1 round |
| 4 **A shared season** | parties and companions in co-op (host-run); arriving in the wild by a ride; *Send home*; a guest's logbook; WebRTC for the pose traffic only if measured | people and companions live | 2 streams + join · ~0.7 B (+0.25 B if WebRTC) · 1 round |

**About 3.5–4 B tokens (10–11 streams, 5 joins), five or six rounds: two to three days at three rounds a day**, after
the other two plans are live. About $1,050 at Opus 5.5 list prices, nearly a third of a Max week. Phase 1 alone (two friends
on one lake in Sandbox, ~0.75 B, one afternoon) is a good first ship and a real test of the relay and the actor.

## Risks

- **The widest refactor in the game**, in a codebase that changed daily through October: four feedback rounds in two
  days rewrote `packs.js` and the book. The owner's order is right: core first, then people, then companions, and
  co-op last, when `inventory.js` and `camp.js` have stopped moving.
- **The host simulates what it cannot see.** The host's tiles stream round the host; a guest 3 km away is on tiles the
  host has not loaded, so the host cannot run that guest's firewood or forage. v1 keeps the group together: a soft
  tether at the loaded neighbourhood (about 1.2 km): beyond it the guest's world actions grey with "the others are out
  of sight" until they are back. A real BWCA group travels together. Later, delegate: the nearest client with the
  tiles simulates a shared thing (`sim: clientId`), which is a second authority and the hard part of phase 4.
- **Determinism drift:** anything seeded by the week or the day (`npcs.js` rosters, parties) agrees only while the
  clocks agree, which the host's 1 Hz clock guarantees within a second; anything that reads `Math.random` in a shared
  path (`fire.js` twice, `hang.js` once, `npcs.js` for the openers) must either run on the host or not matter.
- **The save grows** with every guest's containers; the store's limits are far off but the document is written every
  eight seconds; write it less often when it is big.
- **Free tiers move.** Cloudflare's limits are generous today and the Worker is tiny, but keep the relay behind one
  build variable so it can move to any WebSocket host in an afternoon.
- **Testing** needs two browsers: the headless driver exists (`scripts/trailer`, the playthrough rigs); two profiles on
  one machine with a delay in the Worker is the rig.
- **A friend's lag** reads as a canoe that jumps. The 150 ms buffer and the velocity extrapolation hide most of it; a
  dropped friend's canoe holds still with their name dimmed, and never teleports.

## Open questions

| Question | Recommended |
|---|---|
| Relay or peer to peer? | The relay (option A). WebRTC later for the pose traffic alone, only if a stroke measures over 120 ms late. |
| How many players? | Four at most (two canoes, or four solos: the four-watercraft rule). |
| Must the group stay together? | Yes in v1: a soft tether at about 1.2 km. Delegated simulation is phase 4. |
| Who owns the season? | The season itself, stored in its room (Durable Object); whoever opens it first is the host. Guests have a visitor profile and a logbook line. |
| One purse or one each? | One, the group's. It is how a real party buys food. |
| Sleep when one player is away? | Blocked until every player is in their tent and has ticked the same wake time; a dropped player counts as asleep after a minute. |
| Voice or text chat? | Neither. A few quick lines on a key as barks; friends have Discord. |
| Evacuation of one player? | That player alone goes to the outfitter and can rejoin by a ride; the trip goes on for the rest. |
| Cheating? | Ignored beyond consistency. |
| Sandbox first? | Yes: phase 1 ships as Sandbox co-op, where nothing shared matters yet. |
| Where does the Worker live? | `server/room/` in this repo, deployed by a GitHub Action with `wrangler`, the URL in `VITE_RELAY_URL`. |
