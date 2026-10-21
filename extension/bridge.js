// Isolated-world content script: relays the stored fix to spoof.js and accepts fixes from the game page.
(() => {
  const post = (enabled, fix) => window.postMessage({ source: 'bwca-geo-bridge', type: 'state', enabled, fix }, '*');
  let cur = { enabled: true, fix: null };
  chrome.storage.local.get(['enabled', 'fix'], (r) => { cur = { enabled: r.enabled !== false, fix: r.fix || null }; post(cur.enabled, cur.fix); });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.enabled) cur.enabled = ch.enabled.newValue !== false;
    if (ch.fix) cur.fix = ch.fix.newValue || null;
    post(cur.enabled, cur.fix);
  });
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'bwca-canoe') return;
    if (e.data.type === 'geo' && e.data.fix) chrome.storage.local.set({ fix: e.data.fix });
    if (e.data.type === 'geo' || e.data.type === 'ping') window.postMessage({ source: 'bwca-geo-ext', type: 'hello', enabled: cur.enabled }, '*');
  });
})();
