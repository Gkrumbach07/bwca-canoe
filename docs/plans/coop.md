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
| `profile.js`, `shop.js`, `tasks.js` | one purse, one kit in use, one set of boards, one `claimed` | a purse per player, and *Give money* (the owner, 2026-11-01); the kit in use is per player (`kit[playerId]`); boards shared; claims shared |
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

### Phase 1 as built (2026-11-01)

- **The relay** is `server/room/` (wrangler, `npm run dev` on :8787; `npm run dev:slow` adds 100 ms to every forwarded
  message through one ordered queue: a timer per message bunched up under load and added up to 0.8 s). Rooms by six letters,
  four clients, the host's key and last clock kept ten minutes after the last one leaves, so a host's reload gets the same
  code back. `.github/workflows/room.yml` tests it under `wrangler dev` and deploys it once the `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` secrets exist; `RELAY_URL` (a repository variable) reaches the build as `VITE_RELAY_URL`.
  No `RELAY_URL`: no co-op items in the build. Steps for the owner: `server/room/README.md`.
- **The client** is `src/coop.js` (+ `coop.css`). *Invite friends* on the pause card of a Sandbox season (the code, the
  link, Copy, Stop sharing); *Join a trip* on the title, and a `?join=CODE` link opens it filled in. The visitor profile
  (`bwca-canoe:visitor`: name, shirt from `npcs.js SHIRTS`, a seed for the rest of `dress()`) is a global key in
  `save.js`. A guest's own season is never written while visiting (`kv.freeze` on every key but the visitor profile;
  their trip is not resumed, the mode is Sandbox in memory) and *Leave the trip* reloads into it untouched.
- **The others** are the actor layer's: a boat with the paddler kneeling in the stern, the stroke the paddler's own
  (the wire's stroke count, `Boat.drive({ exact, stroke })`), or a person walking or carrying, their beached canoe where
  they left it; the hull in the player's own green (`HULL_PALETTES.green`). A catch-up after a stall glides out over a
  few tenths of a second instead of jumping. Names over heads within 60 m, dimmed while a friend's poses are late.
- **The clock:** the host's at 1 Hz with its timestamp; a guest moves it on by half the quickest round trip plus how late
  that message came against the host's quickest pose, and leaves differences under 0.1 s alone. A guest's Sandbox clock
  keys are locked, and in a room the pause card no longer stops the clock.
- **Measured** (`scripts/coop/two-browsers.mjs`: two headless Chromiums, each its own browser process, through
  `wrangler dev` with 100 ms added, 40 s of paddling): each draws the other 255 ms behind (100 relay + 150 buffer), 0.10 m
  RMS from where they were (0.6 m at worst) at up to 12 m/s, under 4 % of frames extrapolated and under 1 % held. Clocks
  within 0.08 s in 37 of 39 samples, 0.23 s in another; the first sample read 1.5 s, taken while the host's own page was
  frozen for 1.7 s (its clock stood still), and was corrected at the next message. Two pages in **one** browser stall each
  other on the shared GPU process (seconds-long bursts), and on a machine at a load average of 200+ the local relay
  itself lags: run the rig on a quiet machine.
- **Not yet:** the wind is each screen's own (it differs by a few mph; phase 3 sends it), swimming is drawn as walking,
  and a guest who loses the relay stays in the world alone until a reload.

### Phase 2 as designed (2026-11-01)

The owner, after playing phase 1: "each has their own inventory", and "money is not shared, but we need a way to give
money". The code surveyed (both builds on 296eef3) puts nearly every camp thing inside the player's own inventory: the
fire's fuel bin (`firefuel`, where 'ground', `at.fuel` the ring's key), the grate, the woodpiles, the hung barrel
(where 'hung'), the tent's contents (where 'tent'), the tent itself (`camp.camp`, one per client) and the tarps
(`tarp.rigs`). So phase 2 is not the host-owned document of the table above; it is simpler:

- **A thing belongs to whoever put it there, and its owner's browser is its authority.** Nothing about your own
  inventory changes: your pack, your canoe, your tent and your fire run exactly as in single player, with no wait.
- **Everyone sees everyone's things.** Each browser publishes the public part of its world (`pub`): the containers
  and long things not on its body (ground, hung, tent, canoe, and what is nested in them), its tent (`camp.serialize()`),
  its tarps (`tarp.serialize()`), and its fires (`fires.record(key)` for the fires it owns). Sent whole on a change, at
  most 4 Hz, a few KB. A receiver keeps each friend's `pub` with ids prefixed by the friend (`p<peer>:c12`), so ids
  never collide, nothing of a friend's enters `inventory.containers`, saves, weight or `reachable()`, and it is drawn
  by a second `ContainerView` fed by a mirror object, a remote `TentStages`, the tarp's rig drawing and
  `fires.restoreRecord`.
- **Reaching into a friend's thing is a request to its owner.** A friend's container within reach is a tab in the
  book (the bin adapter that already serves the fire's ash and the wood: `binContainer`). Taking from it: `op take`
  to the owner, who applies `inventory.take` and replies with the entry, which lands where you dropped it (or the first
  fit, or your hands, or a pile at your feet). Putting into it: you take it locally, `op put` to the owner, who
  `put`s it (a refusal sends it back). The verb shows pending for the round trip.
- **One fire per ring.** A ring with a friend's fuel bin is that friend's fire: the fire card and the drag feed their
  bin by request instead of making a second bin of your own.
- **What is taken from the world merges.** `chores.s.taken`, `chores.s.sawn` and `forage.s.picked` are grow-only maps
  (piece → day): each browser sends what it adds and takes the union. Two friends grabbing one stick in the same
  instant both get it, which does not matter.
- **One group, one site.** The campsite registry holds the group (`'player'` covers every player's tent), so friends
  pitch at one site.
- **A purse each, and giving.** Each player's own `profile.money`. *Give money* on the dot at a friend within 3 m
  (an amount: $5, $10, $20, all), a message to the friend's browser: `profile.earn(n, 'from Ada')`. **Things are handed
  over by dropping them** (the owner, 2026-11-01: "i dont like the give item to person. id rather just have them drop on
  ground"): drop it or set the pack down, and the friend sees it and picks it up (stream A's piles). There is no *Give*
  verb on things.
- **A guest's things are kept by the host.** A guest's inventory and purse live in the host's season, under the
  visitor's id (`coop-guests` in the host's save), sent by the guest every 30 s and on leave; a guest who joins again
  gets theirs back, and a first visit starts from the starter kit in a canoe beside the host.
- **Not in phase 2:** Adventure (trips, stores, boards and rides need the group's trip: phase 3 with the night), and
  holding the host's simulation for a friend out of sight (each browser simulates its own things wherever it is).

### Phase 2 as built (2026-11-01)

`src/coop-share.js` (stream A) and `src/coop-give.js` (stream B), joined on `claude/coop-phase2`; the relay forwards any
other lowercase type, to one client with `to`, up to 256 KB (deployed 2026-11-01).
- **Wire:** `pub` (a player's public things, ≤4 Hz), `op`/`opr` (take or put in a friend's container, answered by its
  owner; 3 s timeout, undone), `gift`/`giftq`/`giftack` (money only; see below), `claim`,
  `yours`, `keep` (a guest's inventory and purse, kept by the host under `coop-guests` by the visitor's id, every 30 s,
  on Leave and pagehide).
- **Measured** (two headless browsers through `wrangler dev` +100 ms, after the join): 11/11 in `scripts/coop/share.mjs`
  (a friend's pack drawn in 226 ms, a stick gone on the other screen in 174 ms, a tent in 324 ms, a tarp in 227 ms, take
  and put through the book's bin ~210 ms) and 9/9 in `scripts/coop/give.mjs` (money both ways with ledgers, an item to a
  friend's hand, refunds, a rejoin gets the same things back, the guest's own season untouched).
- **The gaps round** (same day): a container is given whole with what is nested in it, and long things (rod, paddle);
  Give money from the canoe (6 m afloat, the water dot); gifts carry ids (`giftq`), refunded only on a refusal, `never`
  or a friend gone; `coop-guests` keeps 16 visitors seen in the last 30 real days; Douse and "Put it on the fire" at a
  friend's ring (`op douse`); one grate per ring (a friend's grate is theirs, cooked by their browser, its progress in
  their `pub`); a friend's canoe load drawn in their hull; their canoe and hung barrel reachable as tabs. After the
  join: `share.mjs` 17/17, `give.mjs` 15/15.
- **After the owner played it** (2026-11-01): *Give to …* on things is gone (items, containers and long things alike, and
  their wire): a thing changes hands by being dropped and picked up. The Give money panel lets go of the mouse (the chase
  let go only on its own frames, not while a conversation's shot held the camera, camera.js). Friends are on the map
  (the glance, the corner, the sheet and the map table: the HUD's map draws each in their shirt with their name, live).
- **Still not:** dropping onto a friend's tab button (its grid works); containers by request (a pot onto a friend's
  grate, a pack into their canoe); a pitch spot checked against a friend's tent; a gift's ack lost and the receiver
  reloaded can duplicate once; a friend's pub can flash their flames back during your douse. Details: `stream-a.md`,
  `stream-b.md` in the notes.

### Phase 3 as planned (2026-11-01)

The owner, after playing phase 2: "continue to next phase". Phase 3 also takes Adventure, which phase 2 left out.
Three streams in parallel, then a join:
- **A, the night together** (`src/coop-night.js`): the shared rest dial as above ("Rest and sleep: everyone, and one
  wake time"): the first player in sets the proposal, turning it clears the others' ticks, the night begins when
  every player is in their own tent and has ticked the same wake time; a player gone from the room a minute counts as
  asleep. The host runs the night once and sends the clock; each browser runs its own `energy.sleep` from its own
  tent; one night card on every screen. A nap is the same dial. The fetch (Q on a portage) is not offered in a room.
- **B, the connection** (`src/coop.js`, `coop-share.js`): the host's wind at 1 Hz (`wind.js`'s live state; guests set
  theirs from it, as the clock); a dropped guest rejoins by itself when the relay comes back, and *Rejoin* on the pause
  card and the title after a reload (the visitor's last code, while the room lives); a host's reload keeps the room;
  a friend swimming is drawn swimming; the weather seed from the season so every screen's sky agrees.
- **C, Adventure in co-op** (`src/coop-trip.js`): *Invite* in an Adventure season too; a guest arrives at the host's
  outfitter (or beside the host in the wild); stores and shelves per player with their own purse; the boards and
  notices shared as the host's; the push-off when any player leaves the landing; a ride or the bunkhouse as a group
  jump (everyone at the store ticks, the host advances); an evacuation moves that one player to the outfitter on the
  group's clock with no jump; the trip's log carries `who`.

### Phase 3 as built (2026-11-01)

Three streams joined on `claude/coop-phase2`; notes `phase3-a.md`, `phase3-b.md`, `phase3-c.md` in the side-session notes.
- **The night** (`coop-night.js`, messages `nite`/`nites`/`night`): the shared dial as planned; the host jumps once and
  sends the clock, each guest sleeps from its own tent and takes the host's wake clock at its card's dark. The bear and
  the card's words are each player's own (the host cannot see a guest's food); LATE_NIGHT/SLEEP_IN never apply (the dial
  always picks an hour, as in single player). The fetch is greyed in a room. Rig `night.mjs`.
- **The connection** (`coop-sky.js`, `coop-anim.js`): the host's wind (`sky`, 1 Hz and at a gust) and weather seed;
  a dropped socket retries two minutes, then *Rejoin* / *Back to my own season*; *Rejoin <host>'s trip* on the title
  after a reload; a host's reload reopens the room with its code. Friends drawn swimming (the swim pose moved to
  `poses.js`), jumping, landing, crouching, wading, sitting, the rod up and casting (the owner: "animations are also
  not synced"). Not drawn yet: vault/climb, held jobs' arms, things in hand, the camera raised, eating, the line (all in
  round 2, below). The
  weather seed stays 23 alone (a season seed would change every save's weather). Rig `connect.mjs`.
- **Adventure** (`coop-trip.js`): Invite in Adventure; a guest arrives at the host's store in a free berth; shops per
  player and purse; notices one claim for the group, paid to the one who claimed it; the trip pushes off when any
  player leaves and comes in when all are ashore at an outfitter; rides and the bunkhouse a group jump with a Ready
  card, each paying their fare; an evacuation moves one player with no jump. Not yet: a ride to fetch an evacuated
  player, a guest's trip card / logbook / Record, a key for the Ready card, the nine at push-off. Rig `adventure.mjs`.
- **Wire traps:** `to` routes a message (never a payload field), the relay overwrites `from`, and `t` is the type.

### Phase 3 round 2: shared ground, no overlaps (2026-11-01)

The owner, two browsers: "if it's on the ground in any container at all, it's shared and not just theirs ... It's not my
canoe or your canoe. It's just two canoes", and "I'm also able to pitch a tent where they pitched a tent".
- **Shared ground** (`coop-share.js`): the owner's browser stays the authority underneath (take/put/douse requests), but
  nothing in the world carries a name: a friend's things are tabs named as the book names ours ("Duluth pack · in the
  other canoe", "Barrel 2"), the dot says "the pack", the fire card "Fire ring". A friend's canoe tied at the dock is
  reached from the whole outfitter's yard, as our own is (it had been 3 m from the hull only); a capsized one too; the
  dot on its hull reads *E Look in it* (the book at its load). A friend's pack on the ground is *E Pick up · Q Open it*:
  op `takebox`, the owner takes it and what nests in it out of their inventory and answers with the tree, we make it
  ours on the back, chest or a hand (else at our feet); no answer and nothing moved.
- **No overlaps** (`footprints.js` boxes; `CoopShare.others()` → `camp.others`): our tent is refused on a friend's
  tent, tarp sheet or canoe ("another tent stands there"); our tarp's ghost is red over a friend's tarp or tent; a hang
  skips a tree whose limb holds a friend's barrel (the next tree, or "that limb has a barrel on it already"). Two tents
  staked at once on one spot: the lower id's stands, the other is struck back into its pack with a note.
- **Not yet:** long things (paddles, rods) in a friend's canoe drawn and reachable (they do move with the canoe, round 3);
  a friend's hull from our canoe. (Getting into, paddling or shouldering a friend's canoe, lowering a friend's hung
  barrel, and tarps and hangs at once: round 3, below.) Rig `ground.mjs` (9 checks; 13 after round 3).

### Phase 3 round 2: how a friend is drawn (2026-11-01)

The owner, playing two browsers: "standing on top of a rock … to them it just looks like I'm standing inside the rock"
(the dock and a canoe set down too), and "animations for climbing, arm movements, eating, all that fishing line".
- **Height:** the pose carries `y`, the height stood on as the sender's screen has it (the feet's on foot: a rock, a
  deck, a stair; the water's level afloat or swimming). The friend's figure stands at it, its feet planted on the
  world's own rock or deck under them (actors.js `Person.groundAt`/`supportAt`), else level with it; afloat the hull
  rides that level (creeks, the season's water). A canoe set down sends its pivot's height and turn (`d[3..7]`) and is
  drawn exactly as it lies. A pose without them is drawn as before. `hull` and an empty `d` are no longer sent.
- **Moves and arms** (`coop-anim.js`): the vault and the climb are the player's own, lifted from canoe.js into
  `poses.js makeMoves`; the arms at a held job (saw, douse, pitch, hang), eating and drinking and the camera up are
  `poses.js workArms` (the player's own figure has no such poses: these are the friend's only); the things in the hands
  drawn in the fist as ours (item-models.js); the fish held up; the line from the friend's rod tip to their lure or
  bobber (fishing.js's own meshes, cloned). Poses stay under 300 bytes (about 300 with the line out). Rig `anim.mjs`.
- **Not yet:** the axe, the stringer's fish in a friend's hull. (A container or a long thing in a friend's hand: round 3,
  below.)

### Phase 3 round 3: hands, hung barrels, same-moment clashes (2026-11-02)

The owner: "Containers in a friend's hand aren't drawn", "You can't lower a friend's hung barrel. (it's shared,
remember)", and "If you both pitch a tarp or hang a barrel in the same spot at the same moment, the clash isn't resolved".
- **Things in a friend's hand** (`coop-anim.js` HeldView): a container (a pack, a barrel, the bucket, the tackle box, the
  map case) or a long thing (a paddle, a rod not up, a setting pole) in a friend's hand is drawn as ours is, by
  containers.js's own `ContainerView` (its models, `inHand`, the fist and the swing) run on the friend's figure's bones
  and heading: a container hangs from the fist by its handle or bail and swings with the stride, a paddle or a rod is
  carried by the middle, ahead and down, turning with the forearm; that arm in the held pose (the gait's `state.held`).
  Nothing new on the wire (`an.hd` already named them); a bucket and a paddle in hand is a 187-byte pose.
- **A friend's hung barrel** (`coop-share.js`, op `lower`): the dot on it (or the trunk its rope is tied off on) reads
  *E Lower · hold*, as on our own; the hold is hang.js's `LOWER` (our figure's arms at the hang), the barrel coming down
  on our screen as it is held, and at its end the ask goes to its owner (pending until answered). Their browser sets it
  on the ground at the rope's foot, as hang.js does, and it is then a container on the ground like any other: take and
  put from its tab, *E Pick up* whole, and whoever picks it up hangs it again as their own. Refused (it goes back up
  here, a note) while its owner is hanging it or letting it down themselves (`hold.js` jobs now carry a `ref`). A
  friend's limb is drawn too (hang.js `drawLimb` from `camp.others().hung`, which now carries the barrel's limb).
- **Same-moment clashes** (`coop-share.js tarpClash`, `hangClash`, `tentClash`): as the tents, each screen decides on
  what it has and the lower player id's stands. Our tarp on a friend's tarp or tent is taken down into the pack it came
  out of (tarp.js `packRig`, poles and all; a pitch under way stopped); our tent on a friend's tarp is struck like a tent
  on a tent; our barrel hung, tied on or with the rope over the limb a friend's went onto is let down at the rope's foot
  (hang.js `yieldLimb`, a hang under way stopped), each with a note. Nothing is lost: the tarp is back in the pack, the
  barrel and what is in it on the ground.
- Rigs: `ground.mjs` 13 checks (9 lower a friend's barrel, refused mid-job; 10 take from it, pick it up, hang it again;
  11 two tarps at once; 12 two hangs at once), `anim.mjs` 11 (5b a bucket and a paddle in a friend's hands, at the fists).
- **Not yet:** the stringer and an armful of firewood in a friend's hand; a tarp and a hang decided on the clock rather
  than by id (the second one up always yields to the lower id, even when it was there first by a second).

### Phase 3 round 3: two canoes, either one (2026-11-02)

The owner: "You can't get into, paddle or carry a friend's canoe yet (canoes are shared items)", and from round 2: "It's
not my canoe or your canoe. It's just two canoes." Built in `src/coop-boat.js` (stream *boat*), small hooks elsewhere.
- **The model: one canoe per browser, swapped.** Each browser still drives exactly one canoe, as the game always has
  (`player`: under you, overhead, set down at `carry.drop`, capsized at `swim.hull`; its load the inventory's
  `where: 'canoe'`). A friend's canoe lying there (beached, set down, tied at a dock, floating capsized) offers our own
  canoe's verbs: on the dot `E Get in`, a held `E Push it off`, `Q Shoulder it` (`Unload it first` while loaded, which
  opens the book at what is in it, as ours; the round-2 *E Look in it* is gone), at a trail head the two swapped as ours;
  swimming, *Right the canoe and climb in* / *Climb into the canoe* / *Push the canoe off and climb in* on the prompt.
  Doing one is a **swap** asked of that canoe's browser: our canoe, where it lies, with its load (whole container trees,
  as takebox) and the long things riding in it (paddles, rods), goes to them; theirs comes to us at exactly its spot with
  its load; then the verb goes on as on our own (`packs.hullAction`; swimming `player.rightHull` / `swimIn`, lifted out of
  `updateSwim`). So every screen always has two canoes, each driven by one browser, and nothing says whose. Chosen over
  "a player may hold none or two" because every module (packs, inventory reach, the pose's `d`, the save) assumes one.
- **On the body:** a canoe a friend paddles or carries is not offered (their pub has no `cn`), and an asking that crosses
  it is refused by its owner: in it (*Someone is in that canoe*), on the shoulders, mid push-off, fetching, teleporting,
  or no longer within 4 m of where the asker saw it. Our own side asks only on foot (or swimming from the shore) with our
  canoe lying somewhere, nothing held, no push under way.
- **Wire:** `boat` { rid, verb, at, mine: hull } asker → owner; `boatr` { rid, ok, cn: hull | why } back; a hull is
  { k: 'drop' | 'over', x, z, heading, load: [trees], long: [{ id }] }. The owner publishes (`pubSoon`) before answering,
  so the asker never sees the load in two canoes. The verb shows greyed *a moment* until the answer; no answer in 3 s and
  nothing of ours moved (a late yes still lands, as takebox). For 3 s after a swap a friend's hull drawn within 1.5 m of
  our canoe (their pose from before the swap) is not drawn, nor offered.
- **Saves:** each browser's save keeps the canoe it now drives: the host's season save as always; a guest's `keep` at the
  host now carries `pos` { m, x, z, h, d } (coop-give.js), and after a reload's Rejoin the guest is put back on foot by
  their canoe where it lies (`player.standAt`), else afloat near where they were.
- **Measured** (two headless browsers, `wrangler dev` +100 ms): `scripts/coop/boat.mjs` 12/12 — both canoes drawn where
  their own screens have them; the guest pushes off and gets into the host's beached canoe and paddles off, the host
  sees it go and drives the guest's old one; the load rides along both ways; the guest shoulders the host's unloaded
  canoe, carries it, sets it down 12 m on, the host sees it there and gets back into it; asks for a canoe being carried or
  paddled refused; the host capsizes and the guest, swimming, rights it and climbs in; after each two canoes and the load
  counted once; the guest reloads and Rejoins by the canoe they left, its load in it. `ground.mjs` check 2 now reads the
  friend's canoe's own verbs.
- **Not yet:** the canoe's kind and weight stay each player's (the shop's `player.gear.canoeKg`, the trip's rental: both
  hulls are drawn alike, so nothing shows, but a Kevlar owner shouldering the other canoe carries their own weight); a
  swap for a verb that then turns out greyed (Get in with no paddle anywhere) still swaps; both asking each other at the
  same moment are both refused (*a moment: try again*); an answer lost on the wire after the owner applied it leaves our
  canoe on both screens once (the relay has not lost one in the rigs); a taken canoe tied at another's berth counts as
  afloat by the dock, not "at the dock" (the shop's canoe-at-dock reads the berth of the visit); getting into a friend's
  canoe from our own afloat (rafting up), and two in one canoe.

### Phase 3 round 4: the status bar (2026-11-02)

The owner: "when the non-host joins their status bar is 100% sleepy … the host, I can't see the status bar on the top
unless I pause". Two causes, neither the relay's:

- **Sleepy on joining.** `energy.awakeSince` is an absolute game hour (`doy × 24 + hours`). A guest takes the host's
  clock on the way in (`applyClock`, a jump of months), and the guest's own season's `awakeSince` read against it made
  `awake` negative by thousands of hours, which the new-year wrap in `awake` turned into ~5,400 h: the rest need 0, the
  ceiling 0, spent the moment the host's Adventure made the needs live (and an evacuation an hour later).
  **The rule chosen:** a friend arriving on a host's trip arrives **rested on the host's clock**, as a season's first
  trip puts in (`trip.start` fresh): up since seven that morning (at most 12 h), the needs full, the bottle filled, the
  bar full (`energy.arrive()`, from coop-trip's `enterAsGuest`). Their own season's bar is not carried in: it is left
  untouched in their own save (nothing of a visit is written), and its hours awake mean nothing on another clock.
  And in general (`energy.update`): a leap of the clock that is no time lived (set back, or more than three days ahead)
  moves `awakeSince` with it, so it never reads as hours awake.
- **No bar unless paused.** The Air's bar (`#energy`) showed only on a trip under way; the strip over every paper showed
  it always. At a store (where a room is opened and friends arrive, and where co-op waits) the bar was gone in play and
  back the moment anything paper-like was up. Now the bar is up in play whenever there is a game (`hud.updateEnergy`:
  not only `trip.active`), single player too: off a trip the needs read full, as the strip already showed them.
- **Rig:** `scripts/coop/hud.mjs` (4 checks): the guest's energy right after joining (hours awake = since 7 am on the
  host's clock, rest and ceiling ≥ 0.9); the top bar up on both screens at the store unpaused, on the water with the
  trip under way, and after Escape and resume (shown, on screen, and `elementFromPoint` at its centre is the bar's own
  hit box).

**About 3.5–4 B tokens (10–11 streams, 5 joins), five or six rounds: two to three days at three rounds a day**, after
the other two plans are live. About $1,050 at Opus 5.5 list prices, nearly a third of a Max week. Phase 1 alone (two friends
on one lake in Sandbox, ~0.75 B, one afternoon) is a good first ship and a real test of the relay and the actor.

### Round 2: one set of parties, four players (2026-11-05)

The owner, 2026-11-05: "fix whatever the co-op campers don't match issue is" and "for now, let's limit to four players".
Found by play: at 23 of 40 sites round Moose Lake the host and two guests had different parties camped, so a guest was
told "another party is camped here" where the host saw nobody. The cause: `parties.js` is a pure function of the
season's seed (`profile.seasonId`), the Traffic setting, the clock and the sites that are the player's (`mine()`), and
a guest kept its own season's seed and Traffic and counted only its own camp. The clock was already the host's.

- `src/coop-parties.js`: the host sends `{ t: 'parties', seed, traffic, mine }` once a second (and at once on a change);
  a guest's parties take the host's seed and Traffic (`parties.share`). Each guest sends its own sites
  (`{ t: 'pmine', mine }`, to the host); the host's list is its own and every guest's (a site twice: the earlier hour)
  and every page sweeps with it (`parties.mineOf`), so a party never lands at anyone's camp on any screen. With the same
  inputs the sweep is the same, and the campsite registry's claims (a party's, a friend's tent) agree as well.
- Out of the room (Leave reloads; `gone`) a browser has its own season's parties again.
- The rig: `scripts/coop/parties.mjs`, three browsers, every site within 10 km of the host compared at eight hours over
  two game days with the host and a guest camped: 0 disagreements (718 before the fix).
- Four players at most: the relay's `MAX_CLIENTS = 4` (a fifth is told "That trip is full (four at most)."); one
  permit covers the group, up to the room's four.

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
| One purse or one each? | **One each** (the owner, 2026-11-01: "money is not shared, but we need a way to give money"). Each player's own purse, and *Give money* to a friend beside you. |
| Sleep when one player is away? | Blocked until every player is in their tent and has ticked the same wake time; a dropped player counts as asleep after a minute. |
| Voice or text chat? | Neither. A few quick lines on a key as barks; friends have Discord. |
| Evacuation of one player? | That player alone goes to the outfitter and can rejoin by a ride; the trip goes on for the rest. |
| Cheating? | Ignored beyond consistency. |
| Sandbox first? | Yes: phase 1 ships as Sandbox co-op, where nothing shared matters yet. |
| Where does the Worker live? | `server/room/` in this repo, deployed by a GitHub Action with `wrangler`, the URL in `VITE_RELAY_URL`. |
