// The boys' scenes as data (campaign stream b5, Round 5; docs/story/32-the-boys.md §5.1–§5.9, §8, §11): Carol at the
// Sawbill 38 counter (her first time, the favour, the print of Gene's paddle, the nicknames), the slides after close,
// Bob on Tuesdays and Saturdays, Denny any afternoon (his card, Sparky, his rings, the cabin), Frank at Farm 31 before
// seven, the three of them in the store yard 1–7 August, their camp at Little Sag C1210 (9–14 August: the round, the
// fire, Walt's pan), the laker bet and the 1998 story on the water, the cup on the rock, the 15th at Carol's counter.
// Every line is an id into src/story-data/text/boys.json (32:…) or drafted.json (d95.b5.…, docs/story/95-drafted-lines.md);
// the shape is topics.js SceneRun's, as mining.js. Node only: no game imports (story-lint.mjs, the unit check, the solver).
//
//   CAROL · SLIDES · BOB · DENNY · FRANK · YARD · CAMP · STORY98   the scenes ({ id, who, nodes })
//   carolEntry · bobEntry · dennyEntry · frankEntry · yardEntry · campEntry   where each starts, from where the story stands
//   SCHEDULE   the cast's hours (32 §11 "People and schedules")        TRIP   the August week, day by day (32 §5.9.1)
//   BET        the laker bet's numbers (32 §5.9.5)                    SLIDE  Gene's 1998 slide: the view it matches (L3B)
//   LABELS     the carousels' labels, in Gene's hand (32 §5.3's table: a prop's writing, not a line)
//   B5_SENSORS the condition names the scenes read from their own context (boys-cast.js registers them)
//
// Facts this arc writes (facts.js // b5: rows; the people's own facts are under their namespaces, bible §4):
//   door.boys.open (Carol met: the room opens, the lead closes; the arc's yes) · door.boys.yield (lock 3, rules-boys.js)
//   carol.favour (the paddle photo asked, "I'll go.") · carol.paddle.shown (the print shown: the slides offered) ·
//   carol.slides.invited · carol.slides.seen.<label> · carol.slides.done · carol.said.<topic>
//   boys.met · boys.round (Walt's rule: the first round, bought or Denny's) · boys.round.denny · boys.invited ·
//   boys.permit (Denny's gift: a free Sawbill EP 38 permit, 8 August) · boys.nicknames (all four names) · boys.pan.offered ·
//   boys.pan (cooked in it) · boys.bet (fished it) · boys.bet.won | boys.bet.frank · boys.story1998 · boys.cup ·
//   boys.flare.seen · boys.flare (the cartridge taken) · boys.out15 (the round at the counter on the 15th) · boys.slide
//   (the slide taken) · gene.slide.matched (L3B: the silhouette match, minigames/silhouette.js)
//   bob.trust · bob.eastbay + frank.eastbay (L3A: the 1998 story) · bob.rochester · bob.walt2019 · frank.patch ·
//   frank.kek · frank.lot · frank.cleared · denny.card · denny.rings · denny.sparky · denny.tell1 · denny.cabin ·
//   denny.toldBook · case.denny.nicknames=soft · case.denny.rochester=hard (the informant's pieces: stream i reads them)
export const B5_SENSORS = { slidesToday: 'flag', carolNear: 'flag', bobNear: 'flag', dennyNear: 'flag', frankNear: 'flag', withFood: 'flag', betDay: 'flag', lastNight: 'flag', evening: 'flag' };

// --- where and when (32 §11 "People and schedules") ---------------------------------------------------------------------
export const SAWBILL = 38, FARM = 31;
export const SCHEDULE = {
  carol: { counter: 'date:05-15..10-15 & hour:7-15', evening: 'f:carol.slides.invited & date:05-15..10-15 & hour:15-21' },
  // Tuesdays and Saturdays 9–14, June–October; every day 1–7 August in the yard (packing); the 15th at the tables
  bob: { store: 'month:6-10 & dow:tue|sat & hour:9-14 & !date:08-01..08-15', yard: 'date:08-01..08-07 & hour:9-18', out15: 'date:08-15..08-15 & hour:15-18' },
  // most afternoons 14–17, June–October (32 §3.3)
  denny: { store: 'month:6-10 & hour:14-17 & !date:08-08..08-15', yard: 'date:08-01..08-07 & hour:9-18', out15: 'date:08-15..08-15 & hour:15-18' },
  // Farm 31, 6:10–7:00 weekdays June–October (the cast holds him to the minute); the Sawbill yard 1–7 August; at the
  // Sawbill tables on Tuesdays once met twice at Farm (32 §5.9.7: "Frank's coming by for the canoe Tuesday")
  frank: { farm: 'month:6-10 & dow:mon|tue|wed|thu|fri & hour:6-7 & !date:08-01..08-15', yard: 'date:08-01..08-07 & hour:9-18',
    tuesday: 'month:6-10 & dow:tue & hour:9-14 & met:frank>=2 & !date:08-01..08-15', out15: 'date:08-15..08-15 & hour:15-18' },
};
// the August week (32 §5.9.1): where the party is, by day of August. Kelso's site 3 is the site before the 473 on their
// route (builders pick: 32 §5.9.1); Little Sag's site 8 is C1210, the sitting rock's (03 §2, walt-sites ws.c1210)
export const TRIP = {
  in: { day: 8, site: [23289, 19716], lake: 'Kelso Lake', land: 16 },
  carry: { day: 9, hours: [9, 12], at: [22375, 16119] },     // the 473's Zenith end (names-portages 7100: 468 rods by the USFS)
  camp: { days: [9, 14], site: [15082, 6845], landing: [15072, 6830], lake: 'Little Saganaga Lake', land: 16 },
  out: { day: 15, by: 14, counter: 15 },
};
// the laker bet (32 §5.9.5): the evening of the 12th from 17:00 (the 13th if the wind on the 12th is over 15 mph), till
// dusk; the boys' best fish seeded at 21–27 in; Frank lands his about halfway; the hole a deep spot off the point
export const BET = { day: 12, alt: 13, wind: 15 / 2.237, from: 17, hours: 2.2, inch: [21, 27], near: 20, hole: { r: 650, deep: 12 }, species: 'laketrout' };
// Gene's 1998 slide (32 §5.3, 10 NB55, bible 5.2 lock 3B): taken from Gull's water off the creek mouth below the dam,
// looking up the bay to the notch. `eye` is the doc's match point (−19835, 26740); `toward` the notch on the rise (f's
// gull.notch). The match compares the terrain horizon only (campaign-design §7.1: Gene's slide shows the pre-2011
// forest), within `d` m of the eye and `deg` of the bearing
export const SLIDE = { eye: { x: -19835, z: 26740 }, toward: { x: -19340, z: 26805 }, d: 70, deg: 7, fov: 46, cols: 48, hold: 1.2, near: 420 };
// the carousels' labels, in Gene's hand (32 §5.3's table, a prop's writing); each plays Carol's line(s) over its slides
export const LABELS = [
  { id: '85', label: 'AUG 85 L. SAG — FIRST', say: ['32:5.3.1'] },
  { id: '86', label: 'AUG 86 L. SAG (FLARE)', say: ['32:5.3.2'] },
  { id: '93', label: 'AUG 93 — NO TRIP', say: ['32:5.3.3'], empty: true },
  { id: '98', label: 'SEPT 98 — W\'s LOUSY FISHING', say: ['32:5.3.sept.1', '32:5.3.sept.2', '32:5.3.sept.3', '32:5.3.sept.4'], slides: 12, walt: 9 },
  { id: '11', label: 'AUG 11 L. SAG — LAST ONE ALL OF US', say: ['32:5.3.4'] },
  { id: '16', label: 'AUG 16 L. SAG', say: ['32:5.3.5'] },
];

const B = (id, by) => ({ id, by }); // a line in a group scene, by its speaker
const TRUST = 'f:bob.trust';

// --- 5.1 / 5.2 / 5.4 Carol at the counter ----------------------------------------------------------------------------------
export const CAROL = {
  id: 'carol', who: 'carol',
  nodes: {
    // the opener, by state; then the favour on a later visit while it's open; else her topics
    hello: { say: [{ first: [{ id: '32:5.1.3', when: 'f:boys.out15' }, { id: '32:5.1.2', when: 'carrying:waltpack' }, '32:5.1.1'] }], then: ['f:door.boys.open'], to: 'hub' },
    again: { say: [{ first: [{ id: '32:5.1.3', when: 'f:boys.out15' }, { id: '32:5.1.2', when: 'carrying:waltpack' }, '32:5.1.1'] }], to: 'favour' },
    hub: { go: [
      { ask: '32:5.1.c1', once: 'walt', say: ['32:5.1.4'], to: 'knew' },
      { ask: '32:5.1.c4', once: 'like', say: ['32:5.1.7'] },
      { ask: '32:5.1.c7', once: 'spot', say: ['32:5.1.11'] },
      // the favour stays open ("That's a long way."): "I'll go." whenever you're back
      { ask: '32:5.1.c5', when: 'f:carol.favour.asked & !f:carol.favour', say: ['32:5.1.9'], then: ['f:carol.favour', 'ring:boys.frost'] },
      // 5.4: the nicknames, the slides seen and a later visit; or asked after reading N04 (NB16)
      { ask: 'd95.b5.names.ask', once: 'names', when: '(f:carol.slides.done & !slidesToday) | read:NB16', say: ['32:5.4.1'], then: ['f:boys.nicknames', 'f:case.denny.nicknames=soft'] }] },
    knew: { hub: 'hub', go: [
      { ask: '32:5.1.c2', once: 'boys', say: ['32:5.1.5'], then: ['ring:farm31', 'ring:boys.c1210'] },
      { ask: '32:5.1.c3', once: 'gene', say: ['32:5.1.6'], to: 'favour' }] },
    // the favour (offered after "Gene?", or on any later visit while it's open)
    favour: { say: ['32:5.1.8'], then: ['f:carol.favour.asked'], go: [
      { ask: '32:5.1.c5', say: ['32:5.1.9'], then: ['f:carol.favour', 'ring:boys.frost'], to: 'hub' },
      { ask: '32:5.1.c6', say: ['32:5.1.10'], to: 'hub' }] },
  },
};
// ctx: { visits: talks before today's, gene: "Gene?" heard }
export function carolEntry(s) {
  if (!s.has('door.boys.open')) return 'hello';
  if (s.has('carol.favour.asked') && !s.has('carol.favour') && !s.has('carol.favour.again')) return 'again';
  return 'hub';
}
// Carol's close (32 §5.1) and the print she wants (the arc's want: show.js, arc-boys.js `wants`)
export const CAROL_CLOSE = '32:5.1.12';
export const PADDLE_BACK = ['32:5.2.back.1', '32:5.2.back.2', '32:5.2.back.3', '32:5.2.back.4'];

// --- 5.3 the slides, after close ------------------------------------------------------------------------------------------
// played by boys-cast.js (a short list of the labels, the slides on the wall one at a time, E to advance); its gives are
// rules-boys.js's: the September 1998 carousel seen gives the slide
export const SLIDES = { take: '32:5.3.sept.4', close: '32:5.3.close', book: '32:5.3.slide.1', walt: '32:5.3.slide.2' };

// --- 5.5.2 / 5.8 Bob on Tuesdays and Saturdays ---------------------------------------------------------------------------
export const BOB = {
  id: 'bob', who: 'bob',
  nodes: {
    first: { say: ['32:5.5.2.bob'], then: ['f:bob.met'], to: 'hub' },
    again: { say: ['32:5.8.1'], to: 'hub' },
    // 5.9.7 the 1998 story off the trip: before two, Denny not in, Frank at the table (Bob's trust)
    off98: { say: ['32:5.9.7.1'], to: 'story98' },
    story98: { say: [B('32:5.9.6.1', 'Frank'), B('32:5.9.6.2', 'Bob'), B('32:5.9.6.3', 'Frank'), B('32:5.9.6.4', 'Bob'), B('32:5.9.6.5', 'Frank'), B('32:5.9.6.6', 'Bob'), B('32:5.9.6.7', 'Frank'), B('32:5.9.6.8', 'Bob'), B('32:5.9.6.9', 'Frank'), B('32:5.9.6.10', 'Bob')],
      then: ['f:boys.story1998', 'f:bob.eastbay', 'f:frank.eastbay'], go: [
        { ask: '32:5.9.6.c1', once: 'why98', say: [B('32:5.9.6.11', 'Bob'), B('32:5.9.6.12', 'Frank'), B('32:5.9.6.13', 'Bob')], then: ['f:bob.matt98'] },
        { ask: '32:5.9.6.c2', once: 'which98', say: [B('32:5.9.6.14', 'Bob'), B('32:5.9.6.15', 'Frank')] }] },
    hub: { go: [
      { ask: '32:5.5.1.c4', once: 'walt', say: ['32:5.5.1.10'] },
      { ask: '32:5.5.1.c5', once: 'where', say: ['32:5.5.1.18', '32:5.5.1.20', '32:5.5.1.22', 'd95.b5.supper'], then: ['ring:boys.c1210', 'f:boys.invited'] },
      { ask: '32:5.5.1.c6', once: 'spot', say: ['32:5.5.1.25'] },
      { ask: '32:5.5.1.c7', once: 'do', say: ['32:5.5.1.26'] },
      // 5.8, after trust (32 §3.1: the round, Carol's favour, or the bet: any one)
      { ask: '32:5.8.c1', once: 'teach', when: `${TRUST} & (f:boys.nicknames | f:denny.sparky)`, say: ['32:5.8.2'] },
      { ask: '32:5.8.c2', once: 'matt', when: `${TRUST} & (f:bob.matt98 | f:carol.slides.seen.98)`, say: ['32:5.8.3'], then: ['f:bob.rochester', 'f:case.denny.rochester=hard'] },
      { ask: '32:5.8.c3', once: 'worried', when: `${TRUST} & (read:NB76 | read:NB81 | f:marlys.night)`, say: ['32:5.8.4'], to: 'worried' },
      // "Trust alone isn't enough": a red-herring line on the page, and the canary tried on Frank or the nicknames known
      { ask: '32:5.8.c6', once: 'frank', when: `${TRUST} & (f:frank.patch | f:frank.lot) & (told:frank | f:boys.nicknames)`, say: ['32:5.8.7'], then: ['f:frank.cleared'] }] },
    worried: { hub: 'hub', then: ['f:bob.walt2019'], go: [
      { ask: '32:5.8.c4', once: 'never', say: ['32:5.8.5'] },
      { ask: '32:5.8.c5', once: 'who', say: ['32:5.8.6'] }] },
  },
};
// ctx: { frankHere, dennyHere }
export function bobEntry(s, ctx = {}) {
  if (!s.has('bob.met')) return 'first';
  if (ctx.frankHere && !ctx.dennyHere && s.has('bob.trust') && !s.has('boys.story1998')) return 'off98';
  return 'again';
}

// --- 5.5.2 / 5.6 Denny any afternoon ---------------------------------------------------------------------------------------
export const DENNY = {
  id: 'denny', who: 'denny',
  nodes: {
    // the first meeting: the hello, then his card (32 §5.6 "first or second meeting")
    first: { say: ['32:5.5.2.denny.1', '32:5.6.2'], then: ['f:denny.met', 'f:denny.card', 'give:item.dennycard'], to: 'hub' },
    // the second meeting, before anything else: Sparky, against himself (32 §5.6, once)
    sparky: { say: ['32:5.6.3'], then: ['f:denny.sparky', 'f:case.denny.nicknames=soft'], to: 'hub' },
    // after the slides: "Go easy on Carol" (32 §5.6: the only time he tries to keep the player from something)
    easy: { say: ['32:5.6.8'], then: ['f:denny.easy'], to: 'hub' },
    again: { say: [{ first: [{ id: '32:5.6.7', when: 'f:asked.boreal & !f:denny.steer' }, 'd95.b5.denny.again'] }], then: [{ when: 'f:asked.boreal', then: ['f:denny.steer'] }], to: 'hub' },
    hub: { go: [
      // tell 1 (32 §5.5.2): only asked for, Carol in earshot at the counter between 14 and 15
      { ask: '32:5.5.1.c4', once: 'walt', when: 'carolNear & !f:denny.tell1', say: ['32:5.5.1.12', B('32:5.5.2.carol.1', 'Carol'), B('32:5.5.1.14', 'Denny'), B('32:5.5.2.carol.2', 'Carol')], then: ['f:denny.tell1'] },
      { ask: '32:5.5.1.c4', once: 'walt', when: '!carolNear | f:denny.tell1', say: ['32:5.5.1.12'] },
      { ask: '32:5.5.1.c6', once: 'spot', say: ['32:5.6.1'], then: ['do:rings', 'f:denny.rings'], to: 'cabin' },
      { ask: '32:5.5.1.c7', once: 'do', say: ['32:5.5.1.27'] },
      { ask: '32:5.5.1.c8', once: 'book', when: 'f:nb.found', say: ['32:5.5.1.29'], then: ['f:denny.toldBook'] }] },
    cabin: { say: ['32:5.6.4'], then: ['f:denny.cabinOffered'], go: [
      { ask: '32:5.6.c1', then: ['f:denny.cabin'], to: 'hub' },
      { ask: '32:5.6.c2', say: ['32:5.6.5'], to: 'hub' }] },
  },
};
// ctx: { met: Denny's meetings before this one }
export function dennyEntry(s, ctx = {}) {
  const met = ctx.met || 0;
  if (!s.has('denny.card')) return 'first';
  if (met >= 1 && !s.has('denny.sparky')) return 'sparky';
  if (s.has('carol.slides.done') && !s.has('denny.easy')) return 'easy';
  return 'again';
}

// --- 5.7 Frank at Farm, before seven --------------------------------------------------------------------------------------
export const FRANK = {
  id: 'frank', who: 'frank',
  nodes: {
    hello: { say: [{ first: [{ id: '32:5.7.4', when: 'f:bob.met | f:denny.met | f:boys.met' }, '32:5.7.3'] }], then: ['f:frank.met'], to: 'hub' },
    hub: { go: [
      { ask: '32:5.7.c1', once: 'who', say: ['32:5.7.5'] },
      { ask: '32:5.7.c2', once: 'shirt', say: ['32:5.7.6'], to: 'shirt' },
      { ask: '32:5.7.c4', once: 'mine', say: ['32:5.7.8'] },
      { ask: '32:5.7.c5', once: 'kek', say: ['32:5.7.9'], then: ['f:frank.kek'] },
      // [Needs: N31 or N36 read]
      { ask: '32:5.7.c6', once: 'watch', when: 'read:NB71 | read:NB81', say: ['32:5.7.10'] }] },
    shirt: { hub: 'hub', go: [{ ask: '32:5.7.c3', once: 'patch', say: ['32:5.7.7'], then: ['f:frank.patch'] }] },
  },
};
export const FRANK_CLOSE = '32:5.7.11';
export const STEP = [B('32:5.7.1', 'Tauno'), B('32:5.7.2', 'Frank')]; // at 7:00, as Tauno comes for the porch
export const TAUNO_ON_FRANK = '32:5.7.tauno';
export function frankEntry() { return 'hello'; }

// --- 5.5.1 all three in the store yard, 1–7 August -------------------------------------------------------------------------
const RULE = {
  rule: { say: [B('32:5.5.1.4', 'Bob')], go: [
    { ask: '32:5.5.1.c1', then: ['do:round'], say: ['d95.b5.round.paid'], to: 'hub' },
    { ask: '32:5.5.1.c2', say: [B('32:5.5.1.5', 'Frank'), B('32:5.5.1.6', 'Bob'), B('32:5.5.1.7', 'Frank')], to: 'rule' },
    { ask: '32:5.5.1.c3', say: [B('32:5.5.1.8', 'Denny'), B('32:5.5.1.9', 'Bob')], then: ['f:boys.round', 'f:boys.round.denny'], to: 'hub' }] },
};
const GROUP_TOPICS = [
  { ask: '32:5.5.1.c4', once: 'walt', say: [B('32:5.5.1.10', 'Bob'), B('32:5.5.1.11', 'Frank'), B('32:5.5.1.12', 'Denny'), B('32:5.5.1.13', 'Bob'), B('32:5.5.1.14', 'Denny'), B('32:5.5.1.15', 'Bob'), B('32:5.5.1.16', 'Frank'), B('32:5.5.1.17', 'Denny')], then: ['f:denny.tell1'] },
  { ask: '32:5.5.1.c5', once: 'where', say: [B('32:5.5.1.18', 'Bob'), B('32:5.5.1.19', 'Frank'), B('32:5.5.1.20', 'Bob'), B('32:5.5.1.21', 'Frank'), B('32:5.5.1.22', 'Bob'), B('d95.b5.supper', 'Bob')], then: ['ring:boys.c1210', 'f:boys.invited'], to: 'permit' },
  { ask: '32:5.5.1.c6', once: 'spot', say: [B('32:5.5.1.23', 'Denny'), B('32:5.5.1.24', 'Frank'), B('32:5.5.1.25', 'Bob')], then: ['do:rings', 'f:denny.rings'] },
  { ask: '32:5.5.1.c7', once: 'do', say: [B('32:5.5.1.26', 'Bob'), B('32:5.5.1.27', 'Denny'), B('32:5.5.1.28', 'Frank')] },
  { ask: '32:5.5.1.c8', once: 'book', when: 'f:nb.found', say: [B('32:5.5.1.29', 'Denny'), B('32:5.5.1.30', 'Bob'), B('32:5.5.1.31', 'Denny')], then: ['f:denny.toldBook'] },
];
export const YARD = {
  id: 'yard', who: 'boys',
  nodes: {
    open: { say: [B('32:5.5.1.1', 'Bob'), B('32:5.5.1.2', 'Denny'), B('32:5.5.1.3', 'Frank')], then: ['f:boys.met', 'f:bob.met', 'f:frank.met', 'f:denny.met'], to: 'rule' }, // (boys-cast.js: to the hub once the round is bought)
    ...RULE,
    hub: { go: GROUP_TOPICS },
    // 5.9.1 the permit is Denny's gift: the first time he hears the player wants to come
    permit: { say: [B('32:5.9.1.1', 'Denny'), B('32:5.9.1.2', 'Bob'), B('32:5.9.1.3', 'Denny')], then: ['do:permit', 'f:boys.permit'], to: 'hub' },
  },
};
export const YARD_CLOSE = '32:5.5.1.32';
export function yardEntry(s) { return s.has('boys.met') ? (s.has('boys.round') ? 'hub' : 'rule') : 'open'; }

// --- 5.9.2–5.9.4 / 5.9.8 at their camp, C1210 -------------------------------------------------------------------------------
export const CAMP = {
  id: 'camp', who: 'boys',
  nodes: {
    // first visit (if they haven't met, this is their first meeting: 5.5.1's opener adapted, 32 §5.9.2)
    open: { say: [B('32:5.9.2.1', 'Frank'), B('32:5.9.2.2', 'Bob')], then: ['f:boys.met', 'f:bob.met', 'f:frank.met', 'f:denny.met', 'f:boys.visited'], to: 'round' }, // (boys-cast.js: campStart's node)
    again: { say: [B('32:5.9.2.2', 'Bob')], to: 'fire' },
    // the round at camp: something shared from your pack (bars, chocolate, sausage, a fish or fruit all count)
    round: { say: [B('32:5.9.2.3', 'Bob')], go: [
      { ask: '32:5.5.1.c1', when: 'withFood', then: ['do:share'], to: 'fire' },
      { ask: '32:5.5.1.c2', say: [B('32:5.5.1.5', 'Frank'), B('32:5.5.1.6', 'Bob'), B('32:5.5.1.7', 'Frank')], to: 'round' },
      { ask: '32:5.5.1.c3', say: [B('32:5.5.1.8', 'Denny'), B('32:5.5.1.9', 'Bob')], then: ['f:boys.round', 'f:boys.round.denny'], to: 'fire' }] },
    // 5.9.4 Walt's pan: the round bought, an evening of the 10th–13th, a fish or food to cook (once)
    pan: { say: [B('32:5.9.4.1', 'Bob'), B('32:5.9.4.2', 'Frank'), B('32:5.9.4.3', 'Bob')], then: ['f:boys.pan.offered', 'give:item.waltpan'], to: 'fire' },
    // 5.9.5 the laker bet's setup at the fire, 17:00 (boys-cast.js puts the canoes out)
    bet: { say: [B('32:5.9.5.1', 'Bob'), B('32:5.9.5.2', 'Denny'), B('32:5.9.5.3', 'Frank')], then: ['f:boys.bet', 'give:item.waltspoon', 'do:bet'], end: true },
    // 5.9.8 the cup on the rock, if the player asks (14 August, at dusk)
    cup: { say: [B('32:5.9.8.1', 'Bob'), B('32:5.9.8.2', 'Frank'), B('32:5.9.8.3', 'Bob')], then: ['f:boys.cup'], to: 'fire' },
    fire: { go: [
      { ask: '32:5.9.3.c1', once: 'site', say: [B('32:5.9.3.1', 'Bob'), B('32:5.9.3.2', 'Frank')] },
      { ask: '32:5.9.3.c2', once: 'flare', say: [B('32:5.9.3.3', 'Frank'), B('32:5.9.3.4', 'Denny'), B('32:5.9.3.5', 'Bob'), B('32:5.9.3.6', 'Denny'), B('d95.b5.names.bob', 'Bob'), B('d95.b5.names.frank', 'Frank')], then: ['f:boys.nicknames', 'f:case.denny.nicknames=soft'] },
      // tell 1 plays here if it hasn't yet (Bob asking, word for word as in 5.5.1)
      { ask: '32:5.9.3.c3', once: 'what', say: [B('32:5.9.3.7', 'Frank'), B('32:5.9.3.8', 'Bob'), B('32:5.9.3.9', 'Frank'), B('32:5.9.3.10', 'Denny'),
        { id: '32:5.5.1.13', by: 'Bob', when: '!f:denny.tell1' }, { id: '32:5.5.1.14', by: 'Denny', when: '!f:denny.tell1' }, { id: '32:5.5.1.15', by: 'Bob', when: '!f:denny.tell1' }], then: ['f:denny.tell1'] },
      { ask: '32:5.9.3.c4', once: 'radio', say: [B('32:5.9.3.11', 'Denny'), B('32:5.9.3.12', 'Bob'), B('32:5.9.3.13', 'Denny'), B('32:5.9.3.14', 'Frank'), B('32:5.9.3.15', 'Denny')] },
      // (5.5.1's group topics that haven't been had at the store: the boys met first at camp)
      ...GROUP_TOPICS.filter((t) => t.once !== 'where'),
      { ask: 'd95.b5.cup.ask', once: 'cup', when: 'lastNight & evening', say: [B('32:5.9.8.1', 'Bob'), B('32:5.9.8.2', 'Frank'), B('32:5.9.8.3', 'Bob')], then: ['f:boys.cup'] }] },
  },
};
export const CAMP_BYE = '32:5.9.2.hail.3';        // sent off in the evening: "There's a good site across the bay. Hang your food."
export const HAIL = [B('32:5.9.2.hail.1', 'Bob'), B('32:5.9.2.hail.2', 'Frank')];
export const SHARE = { fish: B('32:5.9.2.4', 'Frank'), chocolate: B('32:5.9.2.5', 'Denny'), other: B('32:5.9.2.6', 'Bob') };
export const PAN_EAT = [B('32:5.9.4.4', 'Frank'), B('32:5.9.4.5', 'Denny'), B('32:5.9.4.6', 'Bob')];
export const CUP_ROCK = [B('32:5.9.8.4', 'Bob'), B('32:5.9.8.5', 'Frank'), B('32:5.9.8.6', 'Bob')];
export const CUP_BACK = B('32:5.9.8.cold', 'Denny');
export const CARRY_BARK = B('d95.b5.473', 'Bob');
export const FRANK_FISH = B('32:5.9.5.frank', 'Frank');
export const WON = { player: B('32:5.9.6.won.1', 'Bob'), frank: [B('32:5.9.6.won.2', 'Frank'), B('32:5.9.6.won.3', 'Carol')] };
// ctx: { round, pan: the pan's evening holds, bet: the bet's setup is due, lastNight }
export function campEntry(s, ctx = {}) {
  if (ctx.bet && !s.has('boys.bet')) return 'bet';
  if (!s.has('boys.visited')) return 'open';
  return 'again';
}
export function campStart(s, ctx = {}) {
  if (!s.has('boys.round')) return 'round';
  if (ctx.pan && !s.has('boys.pan.offered')) return 'pan';
  return 'fire';
}

// --- 5.9.6 the 1998 story on the water (during the bet: the two canoes side by side over the hole) --------------------------
export const STORY98 = {
  id: 'story98', who: 'boys',
  nodes: { story98: BOB.nodes.story98 },
};

// --- the 15th at the counter (32 §5.9.6): the bet's winner pays the round -----------------------------------------------------
export const ROUND = { price: 6 };      // coffee and bars for the table (32 §2.2: a small sum from the purse)
