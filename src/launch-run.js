// Brekke's launch, moving (stream m, campaign Round 4; 30-mining-years §4.6 "At 11:45 the launch comes up the bay. Len
// walks down the dock and takes the line… At 13:30 the launch goes."; campaign-design Part 4 Round 2, owner call 4: a still
// prop at Farm's dock on Thursdays "until Round 4's motorboat actor"). This takes a2's still prop's place: mining-cast.js
// asks its launch(L) each frame near Farm; here that asks the motorboat actor instead. While Brekke is in (a2's cast
// stages him at the corner table), the varnished launch comes in from open water to the dock's second berth and lies
// tied there, nobody in it; when he goes, it backs off and runs out of sight up the lake. Only under STORY_ON.
//
//   attachLaunch({ miningCast, motorboat, world }) → { stats() }
const OUT = 650;      // m: where it comes from and goes to, out on the lake from the berth
const LOOK = { skin: 0xe2bfa6, shirt: 0x3c4a5a, cuff: 0x4a5a6c, pants: 0x4a4038, belt: 0x2a2018, pfd: 0x3c4a5a, pfdDark: 0x2a3440, strap: 0x2a2a2a, boot: 0x3a2a1c, sole: 0x221a14, lace: 0x2a1c12, hair: 0xd8d4cc, beard: 0xe2bfa6, hat: 0x6a5a48, band: 0x3a2e22, wear: { hat: true, bun: false, scale: 1 } };

export function attachLaunch({ miningCast, motorboat, world }) {
  const st = { mb: null, phase: 'none', n: { in: 0, out: 0 } };
  if (!miningCast || !motorboat) return { stats: () => ({ ...st, mb: null }) };
  // a point OUT metres from the berth over open water, the way the dock faces
  const outFrom = (B, L) => {
    const h = (L.dockHeading || 0);
    let best = null;
    for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3]) for (const r of [OUT, OUT * 0.7, OUT * 0.45]) {
      const a = h + da, x = B.x + Math.sin(a) * r, z = B.z + Math.cos(a) * r, x2 = B.x - Math.sin(a) * r, z2 = B.z - Math.cos(a) * r;
      for (const [px, pz] of [[x, z], [x2, z2]]) if (world.isReady(px, pz) && world.shoreAt(px, pz) < -20 && (!best || r > best.r)) best = { x: px, z: pz, r };
      if (best) return best;
    }
    return best;
  };
  miningCast.launch = function launchMoving(L) {
    const want = this.live.has('brekke') && L.dockBerths && L.dockBerths[1];
    if (this.launchMesh) this.dropLaunch(); // (a2's still prop: the actor is the launch now)
    if (want) {
      st.offN = 0;
      if (st.phase === 'tied' || st.phase === 'in') return;
      const B = L.dockBerths[1].side, from = outFrom(B, L);
      if (!from) return;
      if (st.mb) { st.mb.remove(); st.mb = null; }
      const mb = motorboat.spawn({ kind: 'launch', at: from, force: true, driver: { look: LOOK, name: 'Carl Brekke' }, key: 'm:launch', speed: 9 });
      if (!mb || mb.why) return;
      st.mb = mb; st.phase = 'in'; st.n.in++;
      mb.goTo(B.x, B.z, { onEnd: () => { st.phase = 'tied'; mb.anchor(); mb.off = true; if (mb.driver) { mb.driver.remove(); mb.driver = null; } } }); // (he steps off: a2 has him at the table)
      return;
    }
    // (a moment without him, a2's cast restaging, is not him gone: six asks in a row, about three seconds)
    if (st.mb && (st.phase === 'tied' || st.phase === 'in') && (st.offN = (st.offN || 0) + 1) >= 6) {
      const mb = st.mb, B = L.dockBerths && L.dockBerths[1] ? L.dockBerths[1].side : { x: mb.x, z: mb.z }, to = outFrom(B, L);
      st.phase = 'out'; st.n.out++; mb.off = false;
      if (!mb.driver && motorboat.actors) mb.driver = motorboat.actors.person({ key: 'm:launch:driver', look: LOOK, name: 'Carl Brekke' });
      if (to) mb.goTo(to.x, to.z, { onEnd: () => { mb.remove(); if (st.mb === mb) { st.mb = null; st.phase = 'none'; } } });
      else { mb.remove(); st.mb = null; st.phase = 'none'; }
    }
  };
  // a2's dropCafe (leaving Farm) drops its prop; the actor stays on the lake on its own clock while you are near, and goes
  // when you are far (nothing seen moves by itself out of sight)
  const dropC = miningCast.dropCafe.bind(miningCast);
  miningCast.dropCafe = function () { dropC(); if (st.mb && !this.live.size) { st.mb.remove(); st.mb = null; st.phase = 'none'; } }; // (clear() unstages everyone first; a café rebuilt for a fresh layout keeps them, and the launch)
  return { stats: () => ({ phase: st.phase, n: st.n, offN: st.offN || 0, at: st.mb ? { x: Math.round(st.mb.x), z: Math.round(st.mb.z), mode: st.mb.mode } : null }) };
}
