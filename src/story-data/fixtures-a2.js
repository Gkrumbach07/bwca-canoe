// story.debug.fixture('turn'): the end of chapter 1's slice, for Round 2's rigs (campaign-design Part 4, "The second
// playable slice, exactly": "the turn played, the four doors named, Farm 31 rung"). Added by stream A2 because no
// export of the Round 1 --slice run is kept; the facts are the solver's slice facts (scripts/story-solve.mjs, 30 facts)
// on the warm path, the door taken, the crib, the grade and the blaze looked at. Written through story.set (each one
// checked by facts.js), so the rules that read them (night one's Walt lines, the tiers, the locks, the leads) run as
// they would have. Node only: the unit check builds a StoryV2 and calls it the same way.
//
//   installTurnFixture(story, { pencil? }) → story   registers 'turn' (and 'turn.cold': the same, the Swede test not passed)
//   TURN_FACTS · TURN_READ (the notebook pages read on the way)
export const TURN_FACTS = [
  'bundle.taken', 'nb.found', 'tauno.armed', 'return.greeted', 'tauno.porch.done', 'tauno.porch.warm', 'tauno.porch.toldBook', 'knows.walt', 'knows.haapala',
  'knows.boreal', 'knows.tauno', 'door.crews.taken', 'tauno.said.t5', 'crews.stood', 'landing.crib', 'landing.grade', 'landing.blaze',
  'landing.pink', 'crews.seen', 'tauno.pink', 'knows.eino', 'tauno.upwind', 'tauno.turn', 'tauno.killed', 'door.guiding.named',
  'door.boys.named', 'door.family.named', 'door.mining.named', 'tauno.doors', 'tauno.said.seat31',
];
export const TURN_READ = ['NB01', 'NB20', 'NB31', 'NB45', 'NB88'];

export function installTurnFixture(story, { pencil = null } = {}) {
  const F = story && story.debug && story.debug.fixtures;
  if (!F || F.has('turn')) return story;
  const make = (warm) => (s) => {
    for (const nb of TURN_READ) s.markRead(nb, 'fixture:turn');
    for (const k of TURN_FACTS) if (warm || !/porch\.warm|knows\.haapala/.test(k)) s.set(k, true, 'fixture:turn');
    // Farm 31 rung (20 §7.3 ring.farm: the keeper's ring on Farm's store), when the pencil is there to draw it
    const P = pencil || (typeof window !== 'undefined' && window.__game && window.__game.storySeams && window.__game.storySeams.pencil) || null;
    if (P && typeof P.ring === 'function' && !(typeof P.has === 'function' && P.has('farm31'))) { try { P.ring({ place: 'farm31', by: 'Josie', lead: 'mining' }); } catch (e) { console.warn('fixture turn: the ring', e); } }
    return { facts: TURN_FACTS.filter((k) => s.has(k)).length, stage: s.stage, doors: s.doors() };
  };
  F.set('turn', make(true));
  F.set('turn.cold', make(false));
  return story;
}
