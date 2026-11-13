// The story feed's talk adapter (stream T, Round 1; story-feed.js, campaign-design Appendix A). Who you talk to and
// what you ask, in the story's words:
//
//   npcs.onTalk  → talk:open { who: 'keeper' | 'visitor' | <cast id>, ep }   a conversation opened
//   topics 'topic' → topic { who, id, ep }                                     a story topic or a scene's choice chosen
//
// Its sources come in through connect({ npcs, topics }) (main.js's st-t block, after the feed has started): either
// order works.
import { feed } from './story-feed.js';

let api = null, src = null, offs = [];
const unwire = () => { for (const o of offs) { try { o(); } catch { /* gone */ } } offs = []; };
function wire() {
  unwire();
  if (!api || !src) return;
  const n = src.npcs, t = src.topics;
  if (n && typeof n.onTalk === 'function') {
    const off = n.onTalk((e) => {
      const ex = e && e.extra ? String(e.extra) : '';
      const who = e && e.kind === 'keeper' ? 'keeper' : ex.startsWith('cast:') ? ex.split(':')[1] : 'visitor';
      api.emit('talk:open', { who, ep: e && e.ep != null ? e.ep : null });
    });
    if (typeof off === 'function') offs.push(off);
  }
  if (t && typeof t.on === 'function') offs.push(t.on('topic', (e) => api.emit('topic', { who: e.who, id: e.id, ep: e.ep ?? null })));
}
export function connect(s) { src = s; wire(); }
export function talkAdapter(a) { api = a; wire(); return () => { unwire(); api = null; }; }

feed.register('talk', talkAdapter);
