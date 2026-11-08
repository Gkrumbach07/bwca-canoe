// STUB (K1b, campaign-design Part 4 Round 0): the story's UI asks, so Round 1's streams build against one shape before
// the real ones exist. P (map-book.js lake-pick mode) provides the real pickLake; T (topics.js, the canary trap
// "Where are you headed next?") calls it.
//
//   story.ui.pickLake({ who, prompt, sheet }) → Promise<{ lake, name } | null>
//       opens the map in lake-pick mode; resolves with the lake clicked, or null if the player backs out (Esc).
//       The stub opens nothing and resolves null at once, unless a rig has queued an answer.
//   story.ui.provide(name, fn)  install the real one (P): provide('pickLake', fn)
//   story.ui.debug.answer(v)    rigs: the next pickLake resolves with v ({ lake, name } or null)
//   story.ui.calls              the asks made (rigs)
const answers = [];
const impl = {
  pickLake: async () => (answers.length ? answers.shift() : null),
};

export const ui = {
  stub: true,
  calls: [],
  pickLake(opts = {}) {
    ui.calls.push({ what: 'pickLake', opts }); if (ui.calls.length > 50) ui.calls.shift();
    try { return Promise.resolve(impl.pickLake(opts)); } catch (e) { console.warn('story.ui.pickLake', e); return Promise.resolve(null); }
  },
  provide(name, fn) {
    if (!(name in impl)) throw new Error(`story.ui: no ask called ${name}`);
    if (typeof fn !== 'function') throw new Error(`story.ui.provide(${name}): a function`);
    impl[name] = fn; if (name === 'pickLake') ui.stub = false;
    return ui;
  },
  debug: { answer(v) { answers.push(v ?? null); } },
};
