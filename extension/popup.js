const cb = document.getElementById('enabled'), out = document.getElementById('fix');
chrome.storage.local.get(['enabled'], (r) => { cb.checked = r.enabled !== false; });
cb.addEventListener('change', () => chrome.storage.local.set({ enabled: cb.checked }));
function render() {
  chrome.storage.local.get(['fix'], (r) => {
    const f = r.fix;
    if (!f) { out.textContent = 'Waiting for the game…'; return; }
    const age = Math.round((Date.now() - f.timestamp) / 1000);
    out.innerHTML = `${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}<br/>${f.mode === 'carry' ? 'portaging' : 'paddling'} · ${(f.speed * 3.6).toFixed(1)} km/h · hdg ${Math.round(f.heading)}°<br/><span class="muted">${age < 5 ? 'live' : age + ' s ago'}</span>`;
  });
}
render(); setInterval(render, 1000);
