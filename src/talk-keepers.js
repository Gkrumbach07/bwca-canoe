// The keepers as people (content pass 1, stream B: conversations). Who each one is, what they will talk about as the
// season goes on, and a small arc of three or four beats that ends in something for you: a discount at their counter,
// a site nobody else knows pencilled on your map, or one of a kind (stream C's unique items). The six written by hand
// (outfitters.js HAND: Ruth Aho at Lake One, Gus Lindgren at Moose Lake, Bev Kangas at Sawbill, Arvid Strand at Seagull,
// Lise Thibodeau at Saganaga, Leon Zupancic on the Little Indian Sioux) have their own; the other forty-nine are written
// from their manner (warm, dry, gruff, an old hand, a keen summer hire, a precise ex-ranger) and their own country,
// seeded by the entry point so each is the same person every season.
//
// Pure data and words. npcs.js reads it (keeperArc, keeperPast, keeperTopics) and runs the arcs:
//   past      their life in three short lines, told one at a time ("Tell me about yourself", then "Go on")
//   topics    { id, ask, gate, say: [lines] }: what else they will talk about; gate opens it over the season:
//             { trips: n } trips come in, { visits: n } days you have talked to them, { rep: n } your standing there,
//             { from: doy } the date
//   arc       { id, places, beats: [{ ask, need, gap, say: [a, b], ring, done }] }:
//             ask   what you say to start the beat (it shows in gold at the top of the keeper's talk when it is ready)
//             need  what has to be true first: { trips: n } | { caught: { sp, lake? } } | { bigger: { sp, cm } } |
//                   { camped: place } | { visited: place } | { carried: place } | { holding: 'berry' } | { loons: true } |
//                   { lakes: n }; gap: days after the beat before it (default 1)
//             say   one or two short lines (the second after "Go on." or the like, `more`)
//             ring  a place it pencils on your map; done: { give, or } | { deal } | { secret } | { take: 'berry' }
//   places    resolved by npcs.js from the world data: { lake: 'Lake Two' } a named lake, { site: { lake, side } } a
//             campsite on it, { deep: true } the deep lake near by, { carry: true } the long carry, { reach: [a, b] } a
//             named lake a hops in, { secret: { prefer: [...] } } a real campsite out of the way
// Words take {vars}: k (the keeper's first name), goal, goalWhere, site, rods, carry, deep, sp, cm, berry, loonLake,
// landing, town, road, rel, relName, his, yy, college, subject, city, district.

// --- the six written by hand ---------------------------------------------------------------------------------------
export const HAND = {
  30: { // Ruth Aho, Lake One: warm, the lodge and the café; her brother carves the paddles
    past: ['My father built this place in ’61: two cabins and a dock. I was born the summer the café opened.', 'Forty-odd summers behind this counter. Winters I knit and listen to the ice talk.', 'My brother Eino carves the paddles on the wall. He’s out in the shed most days, being difficult.'],
    topics: [
      { id: 'cafe', ask: 'The café?', say: ['Deb runs it. Walleye when you lot bring some in, pie when you don’t.', 'She pays for a fish she can fry. Look at the board.'] },
      { id: 'chain', ask: 'Lake One, Two, Three and Four?', gate: { trips: 1 }, say: ['They’re one long chain, really. Lake One’s all islands and narrows; Two and Three open up.', 'Four’s where the Kawishiwi comes in. Quietest of the lot.'] },
    ],
    arc: { id: 'eino', places: { goal: { lake: 'Lake Two' } }, beats: [
      { ask: 'Who carves the paddles?', gap: 0, say: ['My brother Eino. Cherry and ash, all winter, in the shed out back.', 'He did lures too, before his hands got bad. Cedar minnows. The walleye used to queue up for them.'] },
      { ask: 'How’s Eino?', need: { trips: 1 }, say: ['He asked after the new paddler. I said you came back with all your gear and most of your sense.', 'He wants to know if the walleye still hold in {goal}. Bring one in, any size, and tell me.'], ring: 'goal:walleye' },
      { ask: 'I had a walleye out of {goal}.', need: { caught: { sp: 'walleye', lake: '{goal}' } }, say: ['Out of {goal}! He’ll be pleased as a pup. He swore they’d all gone down to Three.', 'He’s gone back out to the shed. Won’t say what for.'] },
      { ask: 'What’s Eino up to?', gap: 1, say: ['He came in this morning with this, wrapped in a dish towel. For whoever found his walleye, he said.', 'White cedar, painted by hand. Don’t lose it in a snag. Lose it in a big one.'], done: { give: 'lure:cedarminnow', or: 'lure:lazyike' } },
    ] },
  },
  25: { // Gus Lindgren, Moose Lake: gruff, ran the tow boat thirty years
    past: ['Ran the tow boat thirty years. Moose, Newfound, Sucker, up to Prairie Portage and back.', 'Hauled half of Iowa and every cooler they owned. Motors stop at the portage. Good.', 'My wife ran the store. Now I do. Badly.'],
    topics: [
      { id: 'prairie', ask: 'Prairie Portage?', gate: { trips: 1 }, say: ['Canada’s the other side. Quetico. You want their permit and a reason.', 'Most turn round there. Fine by me.'] },
      { id: 'basswood', ask: 'Basswood?', gate: { visits: 3 }, say: ['Big. Islands everywhere and they all look the same.', 'Compass on the thwart. Check it every point.'] },
    ],
    arc: { id: 'jackpine', places: { site: { site: { lake: 'Wind Lake', side: 'north' } } }, beats: [
      { ask: 'Who’s in the photo by the till?', gap: 0, say: ['My dad. 1951, on Wind Lake, with a pike he lied about for forty years.', 'He’s buried in town. The pike isn’t.'] },
      { ask: 'Where on Wind Lake?', need: { trips: 1 }, say: ['{Site}. One carry in, the {rods} rods off Moose.', 'Camp there. Tell me if the big jack pine’s still up.'], ring: 'site' },
      { ask: 'I camped on Wind Lake.', need: { camped: 'site' }, say: ['Did you. Most of them stop at the first site they see.', 'Jack pine still up? Good. Dad would’ve liked you. He didn’t like anybody.'] },
      { ask: 'You look like you’ve got something to say.', gap: 1, say: ['From now on you pay what the guides pay. Ten off.', 'Don’t tell Iowa.'], done: { deal: 0.9 } },
    ] },
  },
  38: { // Bev Kangas, Sawbill: dry, a schoolteacher in winter, end of the road
    past: ['I came up from Duluth in ’94 to teach school in Tofte for one year.', 'Winters I teach fourth grade. Summers I sell leeches. It’s similar work.', 'The road ends at my door. People take that personally.'],
    topics: [
      { id: 'alton', ask: 'Alton Lake?', gate: { trips: 1 }, say: ['One short carry over the hill. Deep and cold, so that’s where the lakers sulk all summer.'] },
      { id: 'leeches', ask: 'The leeches?', say: ['Keep the bucket in the shade and the water fresh. A leech on a bobber, slow, at dusk: walleye can’t stand it.'] },
    ],
    arc: { id: 'pie', places: { secret: { secret: { prefer: ['Alton Lake', 'Beth Lake', 'Burnt Lake'] } } }, beats: [
      { ask: 'Who made the pies in the window?', gap: 0, say: ['Me. Blueberry when they’re on, rhubarb when they’re not, complaints either way.', 'Store-bought berries are a crime. I don’t commit crimes.'] },
      { ask: 'Could I get a pie?', need: { trips: 1 }, say: ['Bring me a pint and I’ll bake. {berry}', 'A pint is a pint. I can tell.'] },
      { ask: 'I brought you a pint.', need: { holding: 'berry' }, say: ['That is a pint. A real one. Come back tomorrow.', 'Don’t look at me like that. Pie takes a night.'], done: { take: 'berry' } },
      { ask: 'Is the pie ready?', gap: 1, say: ['Here. Still warm. Eat it where I can watch.', 'And since you can find a berry: {secret}{secretWhere}. Nobody finds it from the water.'], ring: 'secret', done: { secret: true } },
    ] },
  },
  54: { // Arvid Strand, Seagull: an old hand, guided since ’62; the Ham Lake fire took his first cabin
    past: ['Guided out of here since ’62. Seagull, Alpine, Red Rock, Saganaga. Forty-odd years of other people’s fish.', 'The fire in ’07 came through in May. Took the pines on the point and my first cabin with them.', 'The blueberries came back the next summer like nothing happened. Nature’s not sentimental.'],
    topics: [
      { id: 'fire', ask: 'The fire in ’07?', gate: { visits: 2 }, say: ['Ham Lake. Started from one campfire somebody walked away from.', 'Drown yours. Stir it. Drown it again, and put your hand in the ash before you go.'] },
      { id: 'lakers', ask: 'Lake trout?', say: ['They want water colder than you’d swim in. In July that’s fifty feet down.', 'Let the spoon sink till you’re bored, then count ten more.'] },
    ],
    arc: { id: 'guidemap', places: { deep: { deep: true }, secret: { secret: { prefer: ['Alpine Lake', 'Red Rock Lake', 'Jasper Lake'] } } }, beats: [
      { ask: 'What’s in the frame by the door?', gap: 0, say: ['My first laker. 1962, eleven pounds, on a spoon I made from a tablespoon.', 'Not many take a laker their first season. Most don’t try.'] },
      { ask: 'How would I take a laker?', need: { trips: 1 }, say: ['Deep water, a heavy spoon, and patience you don’t have yet. {deep} is the deep one.', 'Bring one in and I’ll show you something.'], ring: 'deep:laketrout' },
      { ask: 'I took a laker.', need: { caught: { sp: 'laketrout' } }, say: ['Did you now. On a spoon? Hm.', 'I had a map once, drawn by hand. Every reef and every site the Forest Service never wrote down. Let me look for it.'] },
      { ask: 'Did you find your map?', gap: 2, say: ['Under the bait fridge, of all places. It’s yours.', 'The site I marked, I never told anyone. Don’t make me sorry.'], done: { give: 'guidemap', secret: true } },
    ] },
  },
  55: { // Lise Thibodeau, Saganaga: a keen summer hire from UMD, counts loons
    past: ['I’m at UMD the rest of the year. Biology. This is my second summer up here.', 'My grandpa ran a fish camp on Sag in the fifties. I wanted to see it before I decide what to be.', 'I’m doing the loon count for the DNR this summer. Volunteers count every big lake.'],
    topics: [
      { id: 'canada', ask: 'Canada?', gate: { trips: 1 }, say: ['Half of Sag is Canada. Past the border it’s Quetico: their permit, and a stop at Cache Bay first.', 'Don’t wander over by accident. People do. Every week.'] },
      { id: 'loons', ask: 'Loons?', say: ['Their legs are so far back they can’t walk on land. They nest right at the water’s edge.', 'So in June, give the little islands room. Please.'] },
    ],
    arc: { id: 'looncount', places: {}, beats: [
      { ask: 'What’s the clipboard for?', gap: 0, say: ['The loon count! Pairs, chicks, which lake. The DNR wants it by August.', 'I’m only up to eleven pairs. Sag is really big.'] },
      { ask: 'Can I help with the count?', need: { trips: 1 }, say: ['Yes! If a pair swims near you, with a chick or not, remember which lake.', 'Tell me when you’re back. Lake names, please, not ‘the big one’.'] },
      { ask: 'I saw a pair on {loonLake}.', need: { loons: true }, say: ['{LoonLake}! {loonWord}', 'You’re officially a volunteer. There’s no badge. I’m working on it.'] },
      { ask: 'How’s the count going?', gap: 1, say: ['Fourteen pairs, thanks to you. Here, I want you to have this.', 'My lucky cap. Never lost a fish wearing it. Okay, one.'], done: { give: 'luckycap', or: 'lure:silverminnow' } },
    ] },
  },
  14: { // Leon Zupancic, the Little Indian Sioux: precise, twenty years with the Forest Service
    past: ['Twenty years with the Forest Service out of Ely. Wilderness ranger, then the trail crews.', 'I retired and bought this place. My wife says I only moved my desk.', 'I’ve read the gauge at the landing every morning since 2004. The river doesn’t care. I do.'],
    topics: [
      { id: 'echo', ask: 'The Echo Trail?', say: ['About forty-six miles of gravel out of Ely, built in the thirties. Graded about as often.'] },
      { id: 'beaver', ask: 'Beaver dams?', gate: { trips: 1 }, say: ['A dam every bend or two this year. The beaver have had a good decade.', 'Get out onto the dam to pull the canoe over. Never stand up in the canoe to do it.'] },
    ],
    arc: { id: 'record', places: { goal: { lake: 'Upper Pauness Lake' } }, beats: [
      { ask: 'What’s in the ledger?', gap: 0, say: ['Water levels. Inches at the gauge, every morning since 2004.', 'A record is only as good as the people who read it.'] },
      { ask: 'Can I add to the record?', need: { trips: 1 }, say: ['Paddle down to {goal} and tell me how the river runs on the way. High, low or about right.', 'Accurate is better than interesting.'], ring: 'goal' },
      { ask: 'I made it to {goal}.', need: { visited: 'goal' }, say: ['Good. And the river?', 'About right. That matches the gauge. Logged, with your name.'] },
      { ask: 'Anything else for the record?', gap: 1, say: ['Contributors to the record pay ten percent less here. I made the rule this morning.', 'It’s written down, so it’s official.'], done: { deal: 0.9 } },
    ] },
  },
};

// --- the other forty-nine, by manner -------------------------------------------------------------------------------
// Each manner's past (its {vars} drawn per keeper: a year, a town, a relation), topics, and an arc whose places come from
// the keeper's own country.
export const RELS = [['husband', 'his', ['Walt', 'Arne', 'Dale', 'Lyle', 'Ray', 'Norm']], ['sister', 'her', ['Inga', 'Marit', 'June', 'Edna', 'Lois']], ['father', 'his', ['Emil', 'Toivo', 'Karl', 'Nels']], ['mother', 'her', ['Helga', 'Ida', 'Sigrid', 'Alma']]];
export const COLLEGES = [['UMD', 'Duluth'], ['Bemidji State', 'Bemidji'], ['St. Cloud State', 'St. Cloud'], ['the U', 'Minneapolis'], ['Northland College', 'Ashland'], ['Lake Superior College', 'Duluth']];
export const SUBJECTS = ['Biology', 'Forestry', 'Geology', 'Fisheries', 'Outdoor ed', 'English, weirdly'];
export const CITIES = ['Minneapolis', 'St. Paul', 'Duluth', 'Des Moines', 'Madison', 'Chicago', 'Milwaukee', 'Rochester', 'Fargo'];

export const MANNER = {
  warm: {
    past: ['I married into this place in ’{yy}. Came for the man, stayed for the lake.', 'My {rel} {relName} ran it before me. I still find {his} notes in the drawers.', 'Winters I knit and listen to the ice. Summers I feed paddlers. Same thing, really.'],
    topics: [{ id: 'winter', ask: 'What’s it like in winter?', gate: { visits: 3 }, say: ['Quiet. Forty below some nights, and the ice booms like a cannon.', 'You’d hate it. I love it.'] }],
    arc: { id: 'photo', places: { goal: { reach: [1, 3] } }, beats: [
      { ask: 'The photo by the till?', gap: 0, say: ['That’s {goal}, the summer of ’{yy}. My {rel} {relName} took it the morning before the big blow.', 'We never did get back up there. Life.'] },
      { ask: 'Where on {goal} was it?', need: { trips: 1 }, say: ['The point with the big white pine, looking down the lake. {goalWay}.', 'If you get up there, tell me it’s still pretty. I’ll believe you.'], ring: 'goal' },
      { ask: 'I paddled {goal}.', need: { visited: 'goal' }, say: ['Did you? Is it still pretty?', 'Oh, good. {relName} would be glad somebody went.'] },
      { ask: 'You’re smiling.', gap: 1, say: ['From now on you pay what family pays here. Ten percent off.', 'No arguing. I’ve decided.'], done: { deal: 0.9 } },
    ] },
  },
  dry: {
    past: ['I came up from {city} for one summer in ’{yy}. I’m still waiting for it to end.', 'Before this I sold insurance. Now I sell leeches. The leeches are more honest.', 'Winters it’s me, the woodstove and a dog who doesn’t like me either.'],
    topics: [{ id: 'winter', ask: 'What do you do in winter?', gate: { visits: 3 }, say: ['Shovel. Complain. Shovel.', 'In March I start telling people the fishing will be good. It’s a long game.'] }],
    arc: { id: 'bet', places: { goal: { fish: true }, secret: { secret: {} } }, beats: [
      { ask: 'The fish on the wall?', gap: 0, say: ['A {sp}, {cmWall} centimetres, out of {goal}. I’ve been insufferable since ’{yy}.', 'Nobody’s beaten it. Nobody tries hard enough.'] },
      { ask: 'Is that a challenge?', need: { trips: 1 }, say: ['Bring me a {sp} over {cm} centimetres and I’ll stop telling that story.', '{goal}{goalWhere}, if you want a head start. You didn’t hear it from me.'], ring: 'goal:fish' },
      { ask: 'I had a {sp} over {cm}.', need: { bigger: { sp: '{spId}', cm: '{cm}' } }, say: ['{cmGot}? Hm. Fine. The story’s retired.', 'The fish on the wall is a liar anyway. Come back tomorrow.'] },
      { ask: 'You said tomorrow.', gap: 1, say: ['Here’s what that fish never told anyone: {secret}{secretWhere}.', 'Best site in the country. Don’t bring a radio.'], ring: 'secret', done: { secret: true } },
    ] },
  },
  gruff: {
    past: ['Born here.', 'Cut timber in the {district} twenty years. Then the mill shut.', 'Store pays. Mostly.'],
    topics: [{ id: 'winter', ask: 'Winters?', gate: { visits: 3 }, say: ['Cold.', 'Snowmobile to town once a week. That’s plenty of town.'] }],
    arc: { id: 'carry', places: { goal: { carry: true } }, beats: [
      { ask: 'That yoke on the wall?', gap: 0, say: ['Wore the pads through on the {carry}. {rods} rods.', 'Twice a week for eleven years.'] },
      { ask: 'Should I do the {carry}?', need: { trips: 1 }, say: ['If you want to say you’ve been somewhere.', 'Take it in two. No shame in that.'], ring: 'goal:carry' },
      { ask: 'I did the {carry}.', need: { carried: 'goal' }, say: ['Both ends?', 'Hm. Good.'] },
      { ask: 'You’re looking at me funny.', gap: 1, say: ['Guide’s price from now on. Ten off.', 'Don’t make a thing of it.'], done: { deal: 0.9 } },
    ] },
  },
  'old hand': {
    past: ['Forty years behind this counter. I sold the first Kevlar canoe on this road, and the man sank it in a week.', 'Before that I guided. Before that I was a boy with a cane pole on {landing}.', 'Everything changes but the portages. They just get longer.'],
    topics: [{ id: 'old', ask: 'What was it like in the old days?', gate: { visits: 2 }, say: ['Wood-canvas canoes, canvas tents, and bacon for every meal. We thought we were roughing it.', 'We were. And we left cans everywhere. You lot do better.'] }],
    arc: { id: 'oldsite', places: { site: { site: { reach: [1, 3] } } }, beats: [
      { ask: 'Where did you camp, back then?', gap: 0, say: ['All over. But there was one site I went back to every year from ’{yy}.', 'I’m too old for the carry now. Doesn’t stop me thinking about it.'] },
      { ask: 'Where was it?', need: { trips: 1 }, say: ['{Site}{siteWhere}.', 'Go and sleep there. Tell me if it’s still the best site on the lake.'], ring: 'site' },
      { ask: 'I slept at your site.', need: { camped: 'site' }, say: ['Best site on the lake?', 'Ha. Still is. Some things the Forest Service can’t improve.'] },
      { ask: 'You’ve been rummaging.', gap: 1, say: ['Found it in the tackle drawer. My old red-and-white spoon.', 'It’s caught more fish than I have. Take it before I change my mind.'], done: { give: 'lure:daredevle', or: 'lure:silverminnow' } },
    ] },
  },
  keen: {
    past: ['It’s my first summer! I’m at {college} the rest of the year.', '{subject}, mostly. Ask me about lichens. No, actually, don’t.', 'My aunt owns the place. She says I talk to the customers too much.'],
    topics: [{ id: 'school', ask: 'What will you do after school?', gate: { visits: 3 }, say: ['Honestly? This. Maybe a ranger. Maybe a guide.', 'My aunt says I’ll come to my senses. I hope not.'] }],
    arc: { id: 'firstsummer', places: { secret: { secret: {} } }, beats: [
      { ask: 'Have you been out on the lakes?', gap: 0, say: ['Only past the first portage! I work every day.', 'You have to tell me everything.'] },
      { ask: 'What do you want to know?', need: { trips: 1 }, say: ['Everything! Which lakes. Go to three different ones and come back and tell me.', 'I’ll write them on the wall. Is that weird? That’s weird.'] },
      { ask: 'I’ve paddled {lakesWords}.', need: { lakes: 3 }, say: ['{lakesWords}! Okay, I’m so jealous.', 'Wait here. Well, not here. Come back tomorrow, I have to ask my aunt something.'] },
      { ask: 'What did your aunt say?', gap: 1, say: ['She said I could tell you her site. Nobody knows it: {secret}{secretWhere}.', 'She found it in ’81 and she’s never told a customer. You’re the first!'], ring: 'secret', done: { secret: true } },
    ] },
  },
  precise: {
    past: ['Twenty years with the Forest Service, then this. The trails are the same; the paperwork is worse.', 'I keep the weather in a ledger: pressure, wind, and the temperature at seven.', 'My wife says I retired from one desk to another.'],
    topics: [{ id: 'ledger', ask: 'What’s in the ledger?', gate: { visits: 2 }, say: ['Pressure, wind, and the temperature at seven every morning since ’{yy}.', 'A falling glass and a south wind: rain within the day. Nine times in ten.'] }],
    arc: { id: 'report', places: { goal: { reach: [1, 3] } }, beats: [
      { ask: 'Do you keep records of the lakes too?', gap: 0, say: ['Of the near ones. Clarity, levels, the sites.', 'The far ones I have to take on report. Reports are mostly wrong.'] },
      { ask: 'Could I report on one?', need: { trips: 1 }, say: ['{Goal}{goalWhere}. I haven’t a reliable word on it since ’{yy}.', 'Paddle it, and tell me how the water looks.'], ring: 'goal' },
      { ask: 'I paddled {goal}.', need: { visited: 'goal' }, say: ['Clear or stained?', 'That matches the last reading. Logged, with your name.'] },
      { ask: 'Anything else for the ledger?', gap: 1, say: ['Contributors pay ten percent less here. It’s a new policy.', 'I wrote it down, so it’s policy.'], done: { deal: 0.9 } },
    ] },
  },
};

// --- what they say when you open a conversation, by manner -----------------------------------------------------------
// first: the visit's first word; again: a second conversation in the same visit
export const OPEN = {
  warm: { first: ['What can I get you, dear?', 'What do you need, hon?', 'Come here, what can I do for you?'], again: ['Something else, dear?', 'Back again? What is it?', 'Forget something?'] },
  dry: { first: ['What’ll it be?', 'Yes?', 'You look like a question.'], again: ['Again?', 'Something else, or just the company?', 'Mm?'] },
  gruff: { first: ['Yep?', 'What.', 'Go on.'], again: ['More?', 'Yep.', 'Hm?'] },
  'old hand': { first: ['Well, now. What do you need?', 'Sit, if you like. What is it?', 'What can an old man do for you?'], again: ['Something else on your mind?', 'Back again. Good.', 'Go on, then.'] },
  keen: { first: ['Hi! What can I help with?', 'Oh, hi! What do you need?', 'Hey! What’s up?'], again: ['Oh, hi again!', 'Yes? Anything!', 'What else?'] },
  precise: { first: ['How can I help?', 'Yes. What do you need?', 'What can I find you?'], again: ['Something further?', 'Yes?', 'What else?'] },
};
// when they have told you all the week's word, and when you have heard their whole life
export const NO_WORD = {
  warm: ['That’s all I’ve heard, dear.', 'Nothing else this week, I’m afraid.', 'You’ve had the lot.'], dry: ['That’s the news. All of it.', 'Nothing else. It’s a quiet week.', 'I’ve run out. Come back Tuesday.'],
  gruff: ['That’s it.', 'Nothing else.', 'No.'], 'old hand': ['That’s all the lake’s told me this week.', 'Nothing more. Ask me again Sunday.', 'That’s the lot, for now.'],
  keen: ['That’s everything I know! Sorry!', 'Nothing else this week, I think?', 'I’m out of news!'], precise: ['Nothing further this week.', 'That’s every report I have.', 'No more on record.'],
};
export const NO_PAST = {
  warm: ['Oh, you don’t want more about me.', 'That’s my life, near enough.'], dry: ['That’s it. I’m not that interesting.', 'There’s no more. I checked.'], gruff: ['That’s all.', 'Nothing else.'],
  'old hand': ['The rest is fish stories. Another time.', 'I could go on. I won’t.'], keen: ['That’s me! Not very exciting.', 'That’s everything, honestly.'], precise: ['That’s the record.', 'Nothing further.'],
};

// "Ask about…" and back again, by manner
export const ASK_PROMPT = {
  warm: ['Ask away, dear.', 'What do you want to know?'], dry: ['Go on.', 'Ask. It’s free.'], gruff: ['What.', 'Go on.'],
  'old hand': ['Ask away.', 'What do you want to know?'], keen: ['Sure! Ask me anything!', 'Ooh, okay. What?'], precise: ['Go ahead.', 'What would you like to know?'],
};
export const ASK_DONE = {
  warm: ['Anything else, dear?', 'What else can I do for you?'], dry: ['Anything else?', 'Is that it?'], gruff: ['Anything else.', 'Mm.'],
  'old hand': ['Anything else on your mind?', 'Well, now.'], keen: ['Anything else?', 'Okay! What else?'], precise: ['Anything further?', 'Something else?'],
};

// --- the memory of you in their mouths (talk-memory.js), by manner ----------------------------------------------------
// {lake} where you went, {out} "four nights" or "a day", {fish} the fish's word, {cm}, {flake} its lake, {title} a notice,
// {n} days
export const MEM = {
  back: {
    warm: ['There you are! Back from {lake}, and {out} out. Sit, sit.', 'Look who it is. {Out} on {lake}? You look well on it.'],
    dry: ['Back from {lake}. {Out}. You smell like it.', '{Out} out to {lake}, and you came back. Most do.'],
    gruff: ['{Lake}. {Out}. Good.', 'Back. {Out}. Fine.'],
    'old hand': ['Back from {lake}? {Out} is a proper trip.', '{Out} out to {lake}. In ’74 I’d have called that a start. It’s a good start.'],
    keen: ['You’re back! {Lake}? {Out}? I want to hear everything.', 'Oh hey, you made it! {Out} out to {lake}!'],
    precise: ['{Out}, out to {lake}. Logged.', 'Back from {lake} after {out}. On schedule, more or less.'],
  },
  day: {
    warm: ['Back from {lake} already? A good day for it.', 'There you are. A day on {lake}, was it? Lovely.'],
    dry: ['A day on {lake} and back. Efficient.', 'Back already. {Lake} didn’t keep you.'],
    gruff: ['{Lake}. Day trip. Good.', 'Back. Quick one.'],
    'old hand': ['A day out to {lake}. That’s how it starts.', 'Back from {lake} already? Next time stay the night.'],
    keen: ['You went to {lake} and back in a day? Nice!', 'Oh hey! How was {lake}?'],
    precise: ['A day trip to {lake}. Logged.', 'Out and back to {lake} in a day. Good time.'],
  },
  swim: {
    warm: ['I heard you went swimming on {lake}. Are you dry now?', 'Over you went on {lake}, they said. Sit by the stove.'],
    dry: ['Heard you tested the water on {lake}. Personally.', 'Over on {lake}, was it? The lake always wins.'],
    gruff: ['Swam on {lake}. Wind?', 'Went over on {lake}. Happens.'],
    'old hand': ['Went over on {lake}? Everybody does once. Twice is a habit.', 'I hear {lake} had you for a swim.'],
    keen: ['Oh no, I heard you tipped on {lake}! Are you okay?', 'You went swimming on {lake}? Was it cold?'],
    precise: ['A capsize on {lake}, I’m told. Wind out of the west?', 'You went over on {lake}. It happens on the open stretches after noon.'],
  },
  fish: {
    warm: ['Word got here about your {fish}, {cm} centimetres out of {flake}!', 'Is it true? A {cm} centimetre {fish}?'],
    dry: ['A {cm} centimetre {fish}, I hear. Out of {flake}. I’ll believe it when I see the photo.', 'Heard about the {fish}. Every time it’s told it gets bigger.'],
    gruff: ['{Fish}. {cm} centimetres. Not bad.', 'Heard about the {fish}.'],
    'old hand': ['A {fish} out of {flake}, {cm} centimetres? That’s a fish.', 'I hear you had a good {fish}. {cm}? I had one like that in ’71.'],
    keen: ['Is it true about the {fish}? {cm} centimetres? That’s huge!', 'Everybody’s talking about your {fish}!'],
    precise: ['A {fish}, {cm} centimetres, {flake}. That’s in the top tenth.', 'Noted: one {fish}, {cm} centimetres, out of {flake}.'],
  },
  task: {
    warm: ['That “{title}”: you’re a dear.', 'Thank you again for “{title}”.'], dry: ['“{title}”: done, and properly. Unusual.', 'You did “{title}”. Don’t let it go to your head.'],
    gruff: ['“{title}”. Good work.', 'Saw you did “{title}”.'], 'old hand': ['“{title}” was a help. Thank you.', 'Good of you, “{title}”.'],
    keen: ['Thank you for “{title}”! Seriously!', 'You did “{title}”! You’re the best.'], precise: ['“{title}”: done and paid. Thank you.', '“{title}” closed. Good.'],
  },
  long: {
    warm: ['Where have you been? It’s been {n} days!', 'There you are. {N} days, and not a postcard.'], dry: ['{N} days. I thought the bugs got you.', 'Oh, you. It’s been {n} days. I nearly missed you.'],
    gruff: ['{N} days.', 'Been a while.'], 'old hand': ['{N} days since I saw you. The lake keeps people.', 'Back after {n} days. Good.'],
    keen: ['It’s been {n} days! I was worried!', 'You’re back! It’s been forever. Well, {n} days.'], precise: ['{N} days since your last visit.', 'It’s been {n} days. Welcome back.'],
  },
};
// "How am I doing?": a sum of the season, then their judgement, by manner
export const HOW = {
  none: { warm: 'You’ve not been out yet, dear. Go on, the lake’s waiting.', dry: 'So far you’ve done some shopping.', gruff: 'Haven’t been out yet.', 'old hand': 'You’ve not wet a paddle yet. Go on.', keen: 'You haven’t even been out yet! Go!', precise: 'No trips on record yet.' },
  good: { warm: 'You’re doing fine, dear. Better than fine.', dry: 'You’re doing better than most. That’s not saying much, but it’s something.', gruff: 'Fine.', 'old hand': 'You’re getting the hang of it.', keen: 'Honestly? Amazing.', precise: 'Better than the average, by the numbers.' },
  rough: { warm: 'It’s been a hard start. Everybody’s first season is.', dry: 'Some of it went in the lake. That happens.', gruff: 'Rough start. Keep at it.', 'old hand': 'A hard season teaches more than an easy one.', keen: 'Some of it was rough, but you’re still here!', precise: 'Mixed results. They improve with practice.' },
};
