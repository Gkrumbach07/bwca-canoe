// The --slice rig's stream-P section (campaign-design Part 4, Round 1, "The first playable slice, exactly"): the steps
// whose assertions P owns, for the join to assemble into scripts/slice.mjs. Each step is
//   { id, step, owners, name, needs?, run: async (page, ctx) → { pass, more } }
// run in order on one page (a ?story=1 season under way, the slice's earlier steps done). ctx is the join's: ctx.talk
// (page, who, choice) presses a talk choice by number through the real dialogue (T's), ctx.paddleTo(page, x, z) paddles
// there by real input, ctx.log. Where a ctx helper is missing (this stream's own run, before the join) the step drives
// the same seam through the API (leads.ask, the facts) and says so in `more.via`.
//
// Step 5 (join T + P + L): a keeper asked about the crews' landing rings it, "Ruth" beside it in Marked; at the crib the
//   lead closes (its ring ticked and faint). P owns the ring, its voice in Marked and the close.
// Step 6 (T, P): after the turn a keeper rings a door when asked (door.<arc>.ringed). P owns the ring.
// Step 7 (P, B): the easy nicknames ink from a keeper's ring (the player's pencil on Lake One inked); B owns the Walt
//   page's lines (NB20, NB31 understood via Tauno). P owns the ink.
const asked = async (page, ctx, who, askId) => {
  if (ctx && typeof ctx.talk === 'function') { await ctx.talk(page, who, askId); return 'talk'; }
  await page.evaluate(([w, id]) => { const g = window.__game; g.leads.ask(id, { by: w, ep: g.profile.home, talk: `slice:${id}` }); }, [who, askId]);
  return 'api';
};

export const steps = [
  {
    id: 'P5', step: 5, owners: ['T', 'P', 'L'], name: 'a keeper rings the crews\' landing; "Ruth" in Marked; the lead closes at the crib',
    needs: 'f:door.crews.taken | f:door.crews.declined',
    run: async (page, ctx = {}) => {
      const via = [await asked(page, ctx, 'Ruth', 'ring.ep33'), await asked(page, ctx, 'Ruth', 'ring.baldeagle')];
      const m = await page.evaluate(() => {
        const g = window.__game, P = g.pencil, mb = g.journal.map;
        g.journal.showMap(); mb.tab = 'marked'; mb.render(true);
        const el = document.querySelector('.mb-marked'), text = el ? el.innerText : '';
        const r = P.ringFor('baldeagle.west');
        return { text: text.slice(0, 300), ring: r, open: g.leads.state('crews') };
      });
      if (ctx.paddleTo) await ctx.paddleTo(page, -25825, 29925); // (the last 200 m paddled: the join's)
      else await page.evaluate(() => window.__game.story.set('crews.seen')); // (L's crib Look sets it at the join)
      const c = await page.evaluate(() => ({ state: window.__game.leads.state('crews'), closed: !!(window.__game.pencil.ringFor('crews') || {}).closed }));
      return { pass: !!m.ring && /Ruth/.test(m.text) && c.state === 'closed' && c.closed, more: { via, m, c } };
    },
  },
  {
    id: 'P6', step: 6, owners: ['T', 'P'], name: 'after the turn a keeper rings a door when asked',
    needs: 'f:door.guiding.named',
    run: async (page, ctx = {}) => {
      const via = await asked(page, ctx, 'Gus', 'ring.moose');
      const r = await page.evaluate(() => ({ ringed: window.__game.story.has('door.guiding.ringed'), ring: window.__game.pencil.ringFor('moose25'), stage: window.__game.story.stage }));
      return { pass: r.ringed && !!r.ring && r.stage === 'S3', more: { via, r } };
    },
  },
  {
    id: 'P7', step: 7, owners: ['P', 'B'], name: 'an easy nickname inks from a keeper\'s ring',
    needs: 'read:NB01',
    run: async (page, ctx = {}) => {
      // the player's pencil (B's chip picked, the map clicked): through pencil.pick and a click at the join; the API here
      await page.evaluate(() => { const g = window.__game, P = g.pencil, id = P.debug.lakeOfKey('lakeone'), L = g.world.lakes[id - 1]; P.pencilAt('frontporch', L.cx, L.cz) || P.pencilAt('frontporch', L.cx + 150, L.cz); });
      const via = await asked(page, ctx, 'Ruth', 'nick.frontporch');
      const r = await page.evaluate(() => ({ ink: window.__game.story.get('ink.frontporch'), und: window.__game.story.nbHas('und', 'NB01') }));
      return { pass: r.ink === 'lakeone' && r.und, more: { via, r } };
    },
  },
];
