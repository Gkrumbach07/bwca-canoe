// Four more kinds of visitor at the stores (content pass 1, stream B: conversations), with a line or two each, joined to
// npcs.js's twelve: two paddlers just come out, sunburnt and hungry, who tell you where they went; a kid with their first
// fish; a Scout crew's advisor (the Northern Tier base is on Moose Lake, and troops go out from every road); and a
// volunteer with the citizen lake monitoring program, whose Secchi readings are the lakes' own clarity from the data.
// npcs.js merges each into its tables (ARCH, OPENERS, INTRO, AGAIN, LORE, REMARKS, BYE, THANKS, HOOK, ACCEPT, LATER,
// PAIRS, ROLE) and their hints into HINTS; a hint is (H, v) → { text, ring? } or null, H the HintWriter.
const theWater = (name) => (/\bRiver$/.test(name || '') ? `the ${name}` : name);
const listWords = (a) => { const b = a.map(theWater); return b.length <= 1 ? b.join('') : `${b.slice(0, -1).join(', ')} and ${b[b.length - 1]}`; };

export const VISITORS = {
  returning: {
    arch: { months: [6, 9], hours: [10, 20], at: { lodge: 1.1, 'river post': 1.1, 'trout camp': 0.9, 'bait shop': 1 }, spots: [['rail', 'rail2'], ['board', 'mid'], ['aisle', 'mid']], hints: ['cameOut', 'camp', 'portage'], task: 'lost', odds: 0.45, pair: 'adult',
      who: () => 'two paddlers just off the water', wear: { pfd: [0xd65428, 0x2f6aa0, 0xc8a22a], hatChance: 0.7 } },
    role: 'coming out',
    openers: ['Oh, hi.', 'Hey.', 'Is there a shower? Never mind. Hi.'],
    intro: (v) => `${v.first}${v.figNames && v.figNames[1] ? `, and that’s ${v.figNames[1]}` : ''}. We just came out. Eight days.`,
    again: ['Still here? So are we. The car won’t start.', 'Hi again.'],
    lore: ['Eight days and I’d go back tomorrow. After a shower. And a cheeseburger.', 'We saw a moose on day four. Well, the back end of one, going into the trees.'],
    remarks: ['Real food. I want real food.', 'I never thought I’d be glad to see a parking lot.', 'My hands still think they’re paddling.'],
    hook: 'We left it at the last site. I know we did.',
    accept: 'You’d do that? Thank you.', later: 'No rush. We’re not going anywhere till the car starts.',
    thanks: 'You found it! Thank you!', bye: ['Enjoy it out there. Every minute.', 'Go on, then. We’re jealous.'],
    pairs: [[[0, 'Do we have to go home?'], [1, 'We have to go home.']], [[1, 'Pizza first, or a shower?'], [0, 'Both. At once.']]],
    lost: ['a fillet knife in a leather sheath', 'the knife', 'We left the fillet knife at'],
  },
  firstfish: {
    arch: { months: [6, 8], hours: [9, 20], at: { lodge: 1, 'river post': 0.7, 'trout camp': 0.8, 'bait shop': 1.2 }, spots: ['lures', 'bench', 'rail'], hints: ['firstFish'], task: null, odds: 0, age: 'kid',
      who: () => 'with their first fish', wear: { pfd: 0xe07a2a, hatChance: 0.25 } },
    role: 'with a fish',
    openers: ['Look! Look at my fish!', 'Hi! I caught a fish!', 'Do you want to see my fish?'],
    intro: (v) => `I’m ${v.first}! I caught a fish! By myself! Dad only held the net.`,
    again: ['It’s still a good fish.', 'Hi! It’s getting kind of smelly.'],
    lore: ['Dad says you have to let the little ones go. This one isn’t little.', 'We’re having it for supper. I’m sad and also hungry.'],
    remarks: ['I caught a fish!', 'It’s a perch. A yellow perch.', 'Do you want to hold it? You can’t.'],
    bye: ['Bye! Catch a fish!', 'Bye! Mine’s bigger!'],
  },
  scouts: {
    arch: { months: [6, 8], hours: [7, 20], at: { lodge: 0.8, 'river post': 1.1, 'trout camp': 0.7, 'bait shop': 0.7 }, spots: ['counterEnd', 'board', 'stove'], hints: ['route', 'camp', 'portage'], task: 'lost', odds: 0.5, party: true,
      who: (v) => `with a Scout crew from ${v.city}`, wear: { shirt: 0x6a6a4a, pfd: 0xc8a22a, hatChance: 0.8 } },
    role: 'crew advisor',
    openers: ['Afternoon.', 'Hi there.', 'Have you seen eight boys? Never mind, I hear them.'],
    intro: (v) => `${v.first}. I’m the advisor for a Scout crew out of ${v.vars.city}. Eight boys, two of us, and a hundred pounds of oatmeal.`,
    again: ['Still counting heads.', 'Hello again.'],
    lore: ['route', 'Nine to a group is the rule, so somebody always has to stay at the landing and count canoes.', 'They complain about every portage and talk about it for twenty years after. I did.'],
    remarks: ['Don’t let them sell you anything. They’re fundraising.', 'Has anyone seen a blue paddle?', 'Eight sleeping bags. Seven dry ones.'],
    hook: 'Somebody left their rain jacket behind. Somebody always does.',
    accept: 'That’d be a kindness.', later: 'No trouble.', thanks: 'Found it! He’ll never know how lucky he is.',
    bye: ['Paddle safe.', 'Good luck out there. Count your canoes.'],
    lost: ['a rain jacket with a troop patch on it', 'the jacket', 'One of the boys left his rain jacket at'],
  },
  monitor: {
    arch: { months: [6, 9], hours: [8, 18], at: { lodge: 0.9, 'river post': 0.9, 'trout camp': 1.2, 'bait shop': 0.9 }, spots: ['board', 'counterEnd', 'rail'], hints: ['secchi', 'secchi2', 'weather'], task: null, odds: 0,
      who: () => 'who reads the lakes for the citizen monitoring program', wear: { shirt: 0x4d6577, pfd: 0x2f6aa0, hatChance: 0.8 } },
    role: 'lake monitor',
    openers: ['Hello!', 'Oh, hi.', 'Morning. Or is it afternoon? I’ve been on the water.'],
    intro: (v) => `${v.first}. I read lakes for the citizen monitoring program. Volunteer, before you ask.`,
    again: ['Back again? Good.', 'Hello again.'],
    lore: ['I lower a white disk on a rope until it vanishes, and write down the depth. That’s the science. The rest is paddling.', 'Twenty years of readings on some of these lakes. Clearer in a dry summer, browner after a wet one.'],
    remarks: ['Four point two metres. Lovely.', 'The disk went out of sight at three. Stained water.', 'Never trust a lake that looks the same two days running.'],
    bye: ['Look down into the water sometime. Really look.', 'Paddle safe.'],
  },
};

export const VISITOR_HINTS = {
  // where they have just been: a real chain of lakes out from the landing, told the other way round
  cameOut(H, v) {
    const r = H.route(); if (!r || r.names.length < 2) return null;
    const back = r.names.slice(1).reverse(), big = r.names.slice(1).sort((a, b) => (H.lakeArea(b) || 0) - (H.lakeArea(a) || 0))[0];
    return { text: `We came out through ${listWords(back)}. ${big ? `The wind had us pinned on ${theWater(big)} for a whole day.` : ''}`.trim() };
  },
  firstFish(H) {
    const c = H.camp(300); if (!c) return { text: 'I caught it off the dock! Right there! You have to be really quiet.' };
    return { text: `I caught it off the rock at ${c.name}${c.where}! It pulled so hard. Dad said it was a monster. It’s not a monster. It’s a good one, though.` };
  },
  secchi(H, v, n = 0) {
    const list = H.lakes(9000).filter((x) => x.ha >= 40 && !x.river && Number.isFinite(x.secchi));
    const l = H.pickLake(list, (x) => H.reachScore(x) + (n ? 0 : Math.abs(x.secchi - 3) * 0.2)); if (!l) return null;
    H.taken.add(l.name);
    const m = Math.round(l.secchi * 10) / 10;
    const at = `${theWater(l.name)}${H.where(l)}${H.where(l) ? ',' : ''}`;
    return { text: l.secchi >= 4.2 ? `${at} read ${m} metres yesterday. Clear as gin; you can see the rocks under the canoe.` : l.secchi <= 2 ? `${at} read ${m} metres. Stained like tea. The walleye love it.` : `${at} read ${m} metres. About average for up here.` };
  },
  secchi2(H, v) { return VISITOR_HINTS.secchi(H, v, 1); },
};
export const VISITOR_KEYS = Object.keys(VISITORS);
