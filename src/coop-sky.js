// Co-op phase 3, stream B (docs/plans/coop.md, "Phase 3 as planned" and "Authority"): one sky over every screen in a
// room. The weather is a function of a seed and the clock (weather.js builds the year from the seed), and the clock is
// already the host's, so the host's seed gives every guest the host's clouds, rain, fog and storms hour for hour. The
// wind is not: wind.js runs its gusts on its own running time and rolls its puffs from its own stream, so two screens
// differed by a few mph (the whitecaps, the spray and the bilge, the fire, the bugs all read it). The host sends its
// live wind once a second and a guest's follows it (wind.js setState: the gusts' time and phase taken, the speed and
// the bearing pulled halfway, the host's puffs), with no day or puffs of its own.
//
// The wire (coop.on / coop.send, through the relay, `from` added by it):
//   sky   host → all, every SKY_EVERY and as a puff starts: { ts, seed: the weather's seed, w: wind.state() }
//         A guest moves the wind on by the message's time on the way (coop.lagOf, as the clock).
//
//   const sky = new CoopSky(coop, { wind, weather })   (main.js, after the coop); sky.stats() for the tests
const SKY_EVERY = 1000;   // ms between the host's messages

export class CoopSky {
  constructor(coop, { wind, weather }) {
    this.coop = coop; this.wind = wind; this.weather = weather;
    this.home = weather ? weather.seed : null; // this browser's own seed, back when it leaves the room
    this.lastT = 0; this.got = 0; this.lastLag = null;
    coop.tick((now) => this.tick(now));
    coop.on('sky', (m, at) => this.onSky(m, at));
    coop.onPeers((what) => { if (what === 'gone') this.alone(); });
  }
  tick(now) {
    if (this.coop.role !== 'host') return;
    // a puff is sent as it starts (it rises in under a second: a guest a second late would miss its rise)
    const e = this.wind && this.wind.puffEv, fresh = e && e.n !== this.puffN;
    if (!fresh && now - this.lastT < SKY_EVERY) return;
    this.lastT = now; if (e) this.puffN = e.n;
    this.coop.send({ t: 'sky', ts: Math.round(now), seed: this.weather ? this.weather.seed : null, gentle: this.weather ? this.weather.gentle : null, w: this.wind ? this.wind.state() : null });
  }
  onSky(m, at) {
    if (this.coop.role !== 'guest') return;
    // (the start round: the seed is the season's now, so this browser's own is taken as it first follows; and the host's
    // first-trip kind weather comes with it)
    if (this.weather && !this.following) { this.following = true; this.home = this.weather.seed; this.homeGentle = this.weather.gentle; }
    if (this.weather && Number.isInteger(m.seed)) this.weather.setSeed(m.seed);
    if (this.weather && 'gentle' in m) {
      const g = m.gentle && Number.isFinite(m.gentle.from) ? m.gentle : null, o = this.weather.gentle;
      if (!g !== !o || (g && (g.from !== o.from || g.to !== o.to))) { this.weather.gentle = g ? { from: g.from, to: g.to } : null; this.weather._lastAbs = NaN; }
    }
    const lag = this.coop.lagOf(m, at);
    if (this.wind && m.w) this.wind.setState(m.w, lag);
    this.got++; this.lastLag = lag;
  }
  // out of the room: this browser's own wind and sky again
  alone() {
    if (this.wind && this.wind.follow) this.wind.unfollow();
    if (this.weather && Number.isInteger(this.home)) this.weather.setSeed(this.home);
    if (this.weather && this.following) this.weather.gentle = this.homeGentle || null;
    this.following = false;
  }
  stats() {
    const w = this.wind, wx = this.weather;
    return { got: this.got, lag: this.lastLag, follow: !!(w && w.follow), seed: wx ? wx.seed : null,
      wind: w ? { speed: w.speed, gust: w.gustSpeed, from: w.from, puff: w.puff, t: w.t } : null };
  }
}
