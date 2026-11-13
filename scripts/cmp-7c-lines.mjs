// 7c: the mini-campaigns' drafted lines (docs/story has none for M1–M6: the bible §8 leaves them to the board). One table,
// written two ways: src/story-data/text/drafts-7c.json (the game and the lint read it) and the 7c section of
// docs/story/95-drafted-lines.md (marked as build drafts for the writers to replace). `node scripts/cmp-7c-lines.mjs`.
// [id, kind, who|null, text, where it is used]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAR_CHAINS, SOLOISTS, M3_ROUTES, PARTNERS, FREEZE_ROUTES, FOG_ROUTE } from '../src/minis.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const short = (n) => n.replace(/ Lake$/, '').replace(/^Lake (\w+)$/, 'Lake $1');
const list = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0]);
const L = [];
const add = (id, kind, who, text, where) => L.push([id, kind, who, text, where]);

// --- M1 the raspberry bear --------------------------------------------------------------------------------------------
BEAR_CHAINS.forEach((c, i) => {
  add(`m1.notice.${i}`, 'block', null, `BEAR ACTIVITY on ${list(c.map(short))}.\nA black bear is taking food from campsites. Hang everything, every night.\nSeen claw marks, scat, a barrel moved? Tell the counter. We would rather move it than lose it.\n— Kawishiwi Ranger District`, `M1 flyer, the boards at Moose Lake 25 and Farm 31, the year its chain is ${c.join(' / ')}`);
  add(`m1.page.chain.${i}`, 'page', null, `A bear on ${list(c.map(short))}. The notice says hang everything.`, 'M1 page, first line');
});
add('m1.bark.torn', 'bark', 'party', 'It got our food pack. We hung it, too. Not high enough, I guess. Opened it right down the seam.', 'M1 a party on the chain whose camp it raided (their word)');
add('m1.rumour', 'bark', 'keeper', 'There\'s a bear working the sites out there. Raspberries are in, so it\'s fat and it\'s bold.', 'M1 the keepers\' word at 25 and 31 in July–August');
add('m1.ask.bear', 'choice', null, 'The bear on the notice?', 'M1 counter topic');
add('m1.say.bear', 'line', 'keeper', 'Every summer there\'s one. This one learned what a barrel means. The district would rather move it than shoot it, if somebody shows them where it goes.', 'M1 counter topic');
add('m1.ask.site.a', 'choice', null, 'Tell them: up past Insula.', 'M1 relocation site');
add('m1.ask.site.b', 'choice', null, 'Tell them: out on the Isabella.', 'M1 relocation site');
add('m1.ask.site.c', 'choice', null, 'Tell them: the far end of Little Sag.', 'M1 relocation site');
add('m1.say.site', 'line', 'keeper', 'I\'ll call it in. They\'ll trap it where you found the sign and truck it up there. The district pays for a report like that. It\'ll be on your tally.', 'M1 after the site is picked');
add('m1.end.relocated', 'block', null, 'Trapped on the chain and moved. A tag in its ear now. The sites are quiet.', 'M1 end: documented and relocated');
add('m1.end.gaveup', 'block', null, 'Three camps hanging their food, and it quit the chain. Back to the raspberries.', 'M1 end: taught the camps');
add('m1.end.trapped', 'block', null, 'September. The rangers trapped it themselves and moved it. Nobody asked me.', 'M1 end without you, few camps fed it');
add('m1.end.lost', 'block', null, 'September. Too many camps fed it. They didn\'t move this one.', 'M1 end without you, four or more camps fed it');
add('m1.page.claw', 'page', null, 'Claw marks on a hung pack. Hung too low.', 'M1 page');
add('m1.page.scat', 'page', null, 'Scat full of raspberry seeds. Berries first, then the camps.', 'M1 page');
add('m1.page.barrel', 'page', null, 'A barrel dragged into the brush, lid still on. Tooth holes.', 'M1 page');
add('m1.page.range', 'page', null, 'It works the chain after dark. Same sites, same hours.', 'M1 page');
add('m1.page.seen', 'page', null, 'Saw it come in. Big, careful, in no hurry.', 'M1 page: the night watch');
add('m1.page.photo', 'page', null, 'A picture of it at night. Eyes in the lamp.', 'M1 page: a print at night');
add('m1.page.taught', 'page', null, 'Showed a camp how to hang a pack. They did it while I watched.', 'M1 page');
add('m1.page.fed', 'page', null, 'It got food again. Somebody else\'s camp.', 'M1 page');
add('m1.page.fedme', 'page', null, 'It got mine. Not proud of that.', 'M1 page');
add('m1.teach', 'choice', null, 'Hang your food tonight. There\'s a bear on this chain.', 'M1 to a party on the chain (the teach choice)');
add('m1.taught', 'bark', 'party', 'A bear? Okay. Show us the knot.', 'M1 the party, taught');
add('m1.watch.come', 'hint', null, 'Something big in the brush. Lamp off. Wait.', 'M1 the night watch, the bear coming');
add('m1.watch.gone', 'hint', null, 'It went back the way it came.', 'M1 the night watch, after');
add('m1.dot.claw', 'dot', null, 'Torn pack', 'M1 a sign on the dot');
add('m1.dot.scat', 'dot', null, 'Scat', 'M1 a sign on the dot');
add('m1.dot.barrel', 'dot', null, 'Barrel', 'M1 a sign on the dot');
add('m1.pay', 'block', null, '$40 from the district. The bear report.', 'M1 the tally line');
add('m1.first', 'block', null, 'First stamped: a bear\'s range, written down.', 'M1 the trip card');

// --- M2 singing in the fog ---------------------------------------------------------------------------------------------
add('m2.rumour', 'bark', 'keeper', 'Fella from Crane Lake swears he heard singing on La Croix. In French. In the fog. I said that\'d be the Ely High band.', 'M2 the keepers\' word at Little Vermilion 12 and Larch Creek');
add('m2.voices', 'hint', null, 'Voices in the fog. Singing. Paddles, a lot of them.', 'M2 fogvoices, the first time');
add('m2.voices.near', 'hint', null, 'Close now. The paddles knock on the gunwales.', 'M2 fogvoices, near');
add('m2.voices.gone', 'hint', null, 'Gone east. The fog lifts on nothing.', 'M2 fogvoices, after');
add('m2.dot.box', 'dot', null, 'Logbook', 'M2 the box at each falls');
FOG_ROUTE.forEach((r) => add(`m2.page.log.${r.id}`, 'page', null, {
  loon: 'A logbook in a box at Loon Falls. Yesterday\'s line: "Four canoes. Bound east."',
  curtain: 'Curtain Falls. The box again. "Carried the falls at noon. Singing the whole way."',
  basswood: 'Basswood Falls. "Lost a paddle in the white water. Did not stop."',
  prairie: 'Prairie Portage, our side. "A pipe here. Then on."',
  knife: 'Knife Lake. "Grand Portage in nine days." The ink still wet.',
}[r.id], `M2 the logbook read at ${r.name}`));
add('m2.page.heard', 'page', null, 'Fog on La Croix at dawn. Voices. A song I didn\'t know.', 'M2 page');
add('m2.page.close', 'page', null, 'Close enough to hear the paddles knock. Never saw a canoe.', 'M2 page');
add('m2.page.filled', 'page', null, 'Five boxes, five lines, always the day before I got there.', 'M2 page');
add('m2.keeper.passed', 'line', 'keeper', 'Somebody at Grand Portage called. Four big canoes came in off the lake last week, singing. Nobody knew who they were.', 'M2 a keeper, after the fifth box');
add('m2.end', 'block', null, 'They made Grand Portage. I never caught them.', 'M2 end');
add('m2.first', 'block', null, 'First stamped: a logbook, filled east.', 'M2 the trip card');

// --- M3 the trip not taken --------------------------------------------------------------------------------------------
const HELLO = [
  'Name\'s Lund. Arvid. I had the whole route planned. Knees say no. My daughter drove me up anyway.',
  'Harold Sjoberg. I strung wire for the co-op thirty years. Now the doctor says no portages. My son-in-law brought me to look.',
  'Leonard Maki. I taught shop in Mountain Iron. I can\'t lift the canoe anymore. My granddaughter\'s in the car.',
  'Gene Kozlowski. Drove truck for the mill in Sartell. My wife sent me with a thermos and told me to sit.',
  'Cliff Ness. I carried mail in Two Harbors. Ankle\'s shot. My nephew drove up from the Cities so I could see the water.',
  'Ray Bergquist. Kept the books at a lumberyard in Cloquet. Heart, they say. My daughter-in-law drove.',
];
SOLOISTS.forEach((s, i) => {
  add(`m3.hello.${i}`, 'line', s.name, HELLO[i], `M3 the soloist at the home dock, the year he is ${s.name}`);
  add(`m3.page.who.${i}`, 'page', null, `${s.name.split(' ').slice(-1)[0]} at the dock. ${s.past[0].toUpperCase()}${s.past.slice(1)}. ${s.family[0].toUpperCase()}${s.family.slice(1)}.`, 'M3 page, first line');
});
M3_ROUTES.forEach((r, i) => {
  add(`m3.list.${i}`, 'line', 'soloist', `${list(r.map(short))}. A picture from each. I'd like to see them one more time.`, 'M3 his list, said');
  add(`m3.page.list.${i}`, 'page', null, `His list: ${list(r.map(short))}. A picture from each.`, 'M3 page');
});
add('m3.ask', 'line', 'soloist', 'Would you go for me? Five places. I\'ll write them down.', 'M3 his ask');
add('m3.c.yes', 'choice', null, 'I\'ll go.', 'M3 the yes');
add('m3.c.no', 'choice', null, 'Not this year.', 'M3 the no (he asks again another day)');
add('m3.c.show', 'choice', null, 'I have your pictures.', 'M3 back with all five');
add('m3.wait', 'line', 'soloist', 'Any luck? No hurry. The lakes aren\'t going anywhere.', 'M3 again, before all five');
add('m3.back', 'line', 'soloist', 'That\'s it. That\'s the one. You don\'t know. Thank you.', 'M3 the pictures shown');
add('m3.page.first', 'page', null, 'One picture for his list.', 'M3 page');
add('m3.page.three', 'page', null, 'Most of his list now.', 'M3 page');
add('m3.page.all', 'page', null, 'All five. He\'ll want to see them.', 'M3 page');
add('m3.end.thanks', 'block', null, 'Showed him all five at the dock. He kept looking at the last one.', 'M3 end');
add('m3.end.home', 'block', null, 'He went home at freeze-up. I still have the pictures I got.', 'M3 end without you');
add('m3.pay', 'block', null, '$30 from the man at the dock. For the pictures.', 'M3 the tally line');
add('m3.first', 'block', null, 'First stamped: somebody else\'s trip.', 'M3 the trip card');

// --- M4 the ranger crew -----------------------------------------------------------------------------------------------
add('m4.ask.1', 'line', 'Tom', 'Since you\'re out there anyway. Somebody left a mess at a site. Pack it out? I\'ll put it on the board in your name.', 'M4 favour 1');
add('m4.ask.2', 'line', 'Tom', 'You again. Good. There\'s a tree down across a carry. Got a saw?', 'M4 favour 2');
add('m4.ask.3', 'line', 'Tom', 'Third time. People are going to talk. Another site needs packing out.', 'M4 favour 3');
add('m4.ask.4', 'line', 'Tom', 'We rotate out end of the month. One last check on a chain before the ice. I trust your eyes.', 'M4 the fourth, October');
add('m4.c.yes', 'choice', null, 'Sure.', 'M4 a favour taken');
add('m4.c.no', 'choice', null, 'Not this time.', 'M4 a favour passed (asked again next meeting)');
add('m4.busy', 'line', 'Tom', 'Do that one first. We\'ll be around.', 'M4 a favour still open');
PARTNERS.forEach((p, i) => {
  add(`m4.name.${i}`, 'line', 'Tom', `I'm Tom, by the way. That's ${p}. ${p} does the actual work.`, `M4 the second meeting, the year the partner is ${p}`);
  add(`m4.page.partner.${i}`, 'page', null, `The rangers are Tom and ${p}.`, 'M4 page');
});
add('m4.page.met1', 'page', null, 'Two rangers. Asked where I came in. Asked about my food.', 'M4 page');
add('m4.page.met3', 'page', null, 'Tom and his partner again. A third favour.', 'M4 page');
add('m4.page.three', 'page', null, 'Three favours done for the district.', 'M4 page');
add('m4.page.last', 'page', null, 'One of their last checks before freeze-up.', 'M4 page');
add('m4.end.last', 'block', null, 'Did their last check. Tom said "Good camp" and meant the summer.', 'M4 end');
add('m4.end.rotated', 'block', null, 'The rangers rotated out for the winter. Somebody else\'s district till spring.', 'M4 end without you');
add('m4.first', 'block', null, 'First stamped: a favour for the district.', 'M4 the trip card');

// --- M5 the freeze-up run ---------------------------------------------------------------------------------------------
FREEZE_ROUTES.forEach((r, i) => {
  add(`m5.say.bet.${i}`, 'line', 'Ernie', `Vern says you can't do ${list(r.lakes.map(short))} and be back at this counter before the ice. I say you can. Twenty dollars says one of us is wrong.`, `M5 the bet, the year the route is ${r.lakes.join(' / ')}`);
  add(`m5.page.bet.${i}`, 'page', null, `Two old guides bet on me: ${list(r.lakes.map(short))} and back before the ice.`, 'M5 page');
});
add('m5.ask.bet', 'choice', null, 'What\'s the bet?', 'M5 counter topic at Farm 31 or Hog Creek 36');
add('m5.ask.back', 'choice', null, 'I made the run.', 'M5 back at the counter');
add('m5.say.back', 'line', 'Ernie', 'Well. Vern, pay up. Not you. Him. Twenty dollars and he\'s still not happy about it.', 'M5 back at the counter');
add('m5.skim', 'hint', null, 'Skim ice. The paddle handle breaks it.', 'M5 skimice, taught once');
add('m5.skim.through', 'hint', null, 'Through. It closes behind you.', 'M5 skimice, broken through');
add('m5.page.skim', 'page', null, 'Skim ice in the bays. Broke it with the paddle handle. Sounds like glass.', 'M5 page');
add('m5.page.out', 'page', null, 'Out on the run. Snow on the birch.', 'M5 page');
add('m5.page.round', 'page', null, 'Every lake on their route. Now back before it closes.', 'M5 page');
add('m5.end.made', 'block', null, 'Made it back. Ernie won. Vern says it doesn\'t count.', 'M5 end');
add('m5.end.ice', 'block', null, 'The ice won. It usually does.', 'M5 end without you');
add('m5.first', 'block', null, 'First stamped: the last trip of the year.', 'M5 the trip card');

// --- M6 the long stay -------------------------------------------------------------------------------------------------
add('m6.ask', 'choice', null, 'What about a long stay?', 'M6 counter topic, any store');
add('m6.say', 'line', 'keeper', 'Thirty days in, one resupply? People do it. Pick what it\'s for or you\'ll just get tired. Lakes, fish, pictures, nights.', 'M6 counter topic');
for (const [p, ask, say, page] of [
  ['lakes', 'Fifty lakes.', 'Fifty. Bring a pencil.', 'The long stay: fifty lakes in thirty days.'],
  ['species', 'Every fish there is.', 'Every species. You\'ll want a better rod.', 'The long stay: every fish in the water, in thirty days.'],
  ['photos', 'A photo series.', 'Thirty pictures. Make them good ones.', 'The long stay: thirty pictures in thirty days.'],
  ['nights', 'Just the nights.', 'Thirty nights. That\'s the whole thing, really.', 'The long stay: thirty nights out.'],
]) { add(`m6.ask.${p}`, 'choice', null, ask, 'M6 the project'); add(`m6.say.${p}`, 'line', 'keeper', say, 'M6 the project'); add(`m6.page.${p}`, 'page', null, page, 'M6 page'); }
add('m6.page.half', 'page', null, 'Halfway.', 'M6 page');
add('m6.page.resupply', 'page', null, 'Came out once for food. That\'s the one.', 'M6 page');
add('m6.page.second', 'page', null, 'Came out a second time. Doesn\'t matter. It\'s mine.', 'M6 page');
add('m6.end.done', 'block', null, 'Thirty days and what I said I\'d do.', 'M6 end');
add('m6.end.yours', 'block', null, 'Thirty days. Not all of it. It\'s still mine.', 'M6 end, the days over');
add('m6.first', 'block', null, 'First stamped: a long stay.', 'M6 the trip card');

// --- write ------------------------------------------------------------------------------------------------------------
const text = {};
for (const [id, k, who, t] of L) text[id] = { k, ...(who ? { who } : {}), text: t, ...(k === 'page' ? { page: true } : {}), draft: '7c' };
writeFileSync(join(ROOT, 'src/story-data/text/drafts-7c.json'), JSON.stringify({ $doc: 'docs/story/95-drafted-lines.md', $stream: '7c', $draft: true, text }, null, 0).replace(/},"/g, '},\n"') + '\n');
const DOC = join(ROOT, 'docs/story/95-drafted-lines.md');
const head = '# Drafted lines (build drafts for the writers to replace)\n\nLines the build needed where docs/story has none. Each stream has its own section; every line is a **draft**: the\nwriters replace it in place (keep the anchor) or move it into their own doc. Nothing here is canon.\n';
const sec = ['## 7c · the mini-campaigns M1–M6 (Round 7)', '', 'Generated by `node scripts/cmp-7c-lines.mjs` (the game reads src/story-data/text/drafts-7c.json). Voice: 02a (the page,', 'the player\'s hand) and 02b (keepers, Tom, the guides, the soloists). M3 never names Walt, Canada, a stone or a stump.', '', '| Anchor | Who | Line (draft) | Used |', '|---|---|---|---|',
  ...L.map(([id, , who, t, where]) => `| \`${id}\` | ${who || ''} | ${t.replace(/\n/g, ' / ').replace(/\|/g, '\\|')} | ${where} |`), ''].join('\n');
let doc = existsSync(DOC) ? readFileSync(DOC, 'utf8') : head;
const rx = /## 7c · the mini-campaigns[\s\S]*?(?=\n## |$)/;
doc = rx.test(doc) ? doc.replace(rx, sec.trimEnd() + '\n') : `${doc.trimEnd()}\n\n${sec}`;
writeFileSync(DOC, doc);
console.log(`7c lines: ${L.length}`);
