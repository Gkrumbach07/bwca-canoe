// Co-op round 2 (the owner, 2026-11-05: "fix whatever the co-op campers don't match issue is"): one set of parties over
// every screen in a room. parties.js is a pure function of the season's seed (profile.seasonId), the Traffic setting,
// the clock and the sites that are yours (mine(): your tent's, where your things are set down, your fire), so each
// browser ran its own: a guest kept the seasonId and the Traffic of its own season and counted only its own tent, and
// at 23 of 40 sites round Moose Lake the host and two guests had different people camped (a guest told "another party
// is camped here" where the host saw nobody). The clock is the host's already (coop.js), so the rest is three inputs:
//   - the seed and the Traffic: the host's, on every guest (parties.share), as the sky takes the host's weather seed
//   - the players' sites: each guest sends its own mine() to the host; the host's list is its own and every guest's
//     (the same site twice: the earlier hour), sent to everyone, and every page sweeps with it (parties.mineOf): a
//     party never lands at anyone's camp, on any screen, from the hour they were first there
// With the same inputs the sweep is the same everywhere, so the registry's claims (a party's, a friend's tent's) agree
// too; nothing else of the parties goes over the wire. Out of the room (Leave reloads; 'gone' too) a browser's own
// season's parties again.
//
// The wire (coop.on / coop.send, through the relay; `to` routes, the relay sets `from`; no payload field named `to`):
//   parties  host → all, every EVERY and at once when it changes: { seed, traffic, mine: [[site index, since], …] }
//   pmine    guest → host, every EVERY and at once when its own changes: { mine: [[site index, since], …] }
//
//   const cp = new CoopParties(coop, { parties })   (main.js, after the coop); cp.stats() for the tests
const EVERY = 1000; // ms between the messages (a joiner, a rejoin and a lost one are caught up by the next)

const pack = (list) => list.map((m) => [m.i, m.since]);
const unpack = (a, keyOf) => (Array.isArray(a) ? a : []).filter((q) => Array.isArray(q) && Number.isInteger(q[0]) && Number.isFinite(q[1]) && keyOf[q[0]] != null).map(([i, since]) => ({ i, key: keyOf[i], since }));
// the sites of several lists, each once at its earliest hour, in one order (the sweep's signature sorts them anyway)
function union(...lists) {
  const by = new Map();
  for (const l of lists) for (const m of l || []) { const o = by.get(m.i); if (!o || m.since < o.since) by.set(m.i, { i: m.i, key: m.key, since: m.since }); }
  return [...by.values()].sort((a, b) => a.i - b.i);
}
const sigOf = (list) => list.map((m) => `${m.i}@${m.since}`).join(',');

export class CoopParties {
  constructor(coop, { parties }) {
    this.coop = coop; this.parties = parties;
    this.local = [];          // this browser's own sites (parties.mine())
    this.guests = new Map();  // host: peer id -> that guest's sites
    this.room = [];           // the room's list: the host's own and every guest's (on a guest, as the host last sent it)
    this.sentT = 0; this.sentSig = null; this.got = 0;
    if (!parties) return;
    parties.mineOf = (own) => this.mineOf(own);
    coop.tick((now) => this.tick(now));
    coop.on('parties', (m) => this.onParties(m));
    coop.on('pmine', (m) => this.onMine(m));
    coop.onPeers((what, peer) => {
      if (what === 'gone') this.alone();
      else if (what === 'leave' && peer) { this.guests.delete(peer.id); this.sentSig = null; }
      else if (what === 'join' || what === 'welcome') this.sentSig = null; // (a joiner hears at once)
    });
  }
  // the sweep's sites on this page, each pass of parties.update: in a room, everyone's; alone, this browser's own
  mineOf(own) {
    this.local = own;
    const role = this.coop.role;
    if (role === 'host') return (this.room = union(own, ...this.guests.values()));
    if (role === 'guest') return union(this.room, own); // (its own at once: no party lands on it in the round trip)
    return own;
  }
  tick(now) {
    const role = this.coop.role;
    if (role === 'host') {
      const P = this.parties, list = this.room, sig = `${P.seed}|${P.traffic}|${sigOf(list)}`;
      if (sig === this.sentSig && now - this.sentT < EVERY) return;
      this.sentT = now; this.sentSig = sig;
      this.coop.send({ t: 'parties', seed: P.seed, traffic: P.traffic, mine: pack(list) });
    } else if (role === 'guest') {
      const h = this.coop.peers().find((p) => p.host), sig = sigOf(this.local);
      if (!h || (sig === this.sentSig && now - this.sentT < EVERY)) return;
      this.sentT = now; this.sentSig = sig;
      this.coop.send({ t: 'pmine', to: h.id, mine: pack(this.local) });
    }
  }
  // a guest: the host's parties (its seed and Traffic) and the room's sites
  onParties(m) {
    if (this.coop.role !== 'guest' || !Number.isInteger(m.seed) || !Number.isFinite(m.traffic)) return;
    this.parties.share({ seed: m.seed, traffic: m.traffic });
    this.room = unpack(m.mine, this.parties.keyOf);
    this.got++;
  }
  // the host: a guest's own sites
  onMine(m) {
    if (this.coop.role !== 'host' || m.from == null) return;
    this.guests.set(m.from, unpack(m.mine, this.parties.keyOf));
  }
  // out of the room: this browser's own parties again
  alone() {
    this.guests.clear(); this.room = []; this.sentSig = null;
    this.parties.share(null);
  }
  stats() {
    const P = this.parties;
    return { role: this.coop.role, got: this.got, seed: P.seed, traffic: P.traffic, shared: !!P.shared, room: this.room.length, guests: [...this.guests.values()].map((l) => l.length), local: this.local.length };
  }
}
