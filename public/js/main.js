// --- Sekme geçişleri ---
const tabButtons = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.panel');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// --- Spotify URI -> embed linki ---
function spotifyEmbedUrl(uri) {
  const parts = uri.split(':');
  if (parts.length !== 3) return null;
  const type = parts[1];
  const id = parts[2];
  return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
}

// --- Çalma listeleri ---
function playlistCard(pl, special) {
  const embed = spotifyEmbedUrl(pl.spotifyUri);
  const height = pl.spotifyUri && pl.spotifyUri.startsWith('spotify:track:') ? 152 : 352;
  return `
    <div class="card${special ? ' special' : ''}">
      <h3>${escapeHtml(pl.title)}</h3>
      ${pl.note ? `<p>${escapeHtml(pl.note)}</p>` : ''}
      ${embed ? `<iframe src="${embed}" width="100%" height="${height}" frameborder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>` : ''}
    </div>
  `;
}

fetch('/api/playlists')
  .then(r => r.json())
  .then(data => {
    const special = data.special || [];
    const playlists = data.playlists || [];
    const container = document.getElementById('playlists-list');
    if (!special.length && !playlists.length) {
      container.innerHTML = '<div class="empty-state">henüz çalma listesi eklenmedi</div>';
      return;
    }
    container.innerHTML =
      special.map(pl => playlistCard(pl, true)).join('') +
      playlists.map(pl => playlistCard(pl, false)).join('');
  })
  .catch(() => {
    document.getElementById('playlists-list').innerHTML = '<div class="empty-state">çalma listeleri yüklenemedi</div>';
  });

// --- Anılar ---
fetch('/api/memories')
  .then(r => r.json())
  .then(memories => {
    const container = document.getElementById('memories-list');
    if (!memories.length) {
      container.innerHTML = '<div class="empty-state">henüz anı eklenmedi</div>';
      return;
    }
    container.innerHTML = memories.map(m => `
      <div class="card">
        ${m.date ? `<span class="memory-date">${escapeHtml(m.date)}</span>` : ''}
        <h3>${escapeHtml(m.title)}</h3>
        <p>${escapeHtml(m.text)}</p>
        ${m.image ? `<img class="memory-image" src="${escapeHtml(m.image)}" alt="">` : ''}
      </div>
    `).join('');
  })
  .catch(() => {
    document.getElementById('memories-list').innerHTML = '<div class="empty-state">anılar yüklenemedi</div>';
  });

// --- Bot ---
function loadBotMessage() {
  const el = document.getElementById('botMessage');
  el.textContent = '...';
  fetch('/api/bot-message')
    .then(r => r.json())
    .then(data => { el.textContent = data.message; })
    .catch(() => { el.textContent = 'şu an bir söz getiremedim, biraz sonra tekrar dene.'; });
}

document.getElementById('botRefresh').addEventListener('click', loadBotMessage);
loadBotMessage();

// --- Yardımcı ---
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
