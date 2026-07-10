// --- Sekmeler ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

function rowCard(fields, onRemove) {
  const div = document.createElement('div');
  div.className = 'row-card';
  div.innerHTML = fields + '<div class="row-actions"><button type="button" class="remove-btn">sil</button></div>';
  div.querySelector('.remove-btn').addEventListener('click', () => { div.remove(); onRemove && onRemove(); });
  return div;
}

// --- Çalma listeleri ---
let playlistsData = { special: [], playlists: [] };

function addSpecialRow(item = { title: '', spotifyUri: '', note: '' }) {
  const el = rowCard(`
    <input class="f-title" placeholder="şarkı adı" value="${escapeAttr(item.title)}">
    <input class="f-uri" placeholder="spotify:track:XXXXXXXX" value="${escapeAttr(item.spotifyUri)}">
    <input class="f-note" placeholder="not (opsiyonel)" value="${escapeAttr(item.note || '')}">
  `);
  document.getElementById('specialRows').appendChild(el);
}

function addPlaylistRow(item = { title: '', spotifyUri: '', note: '' }) {
  const el = rowCard(`
    <input class="f-title" placeholder="playlist adı" value="${escapeAttr(item.title)}">
    <input class="f-uri" placeholder="spotify:playlist:XXXXXXXX" value="${escapeAttr(item.spotifyUri)}">
    <input class="f-note" placeholder="not (opsiyonel)" value="${escapeAttr(item.note || '')}">
  `);
  document.getElementById('playlistRows').appendChild(el);
}

document.querySelector('[data-add="special"]').addEventListener('click', () => addSpecialRow());
document.querySelector('[data-add="playlist"]').addEventListener('click', () => addPlaylistRow());

function readRows(containerId) {
  return Array.from(document.getElementById(containerId).children).map(row => ({
    title: row.querySelector('.f-title').value.trim(),
    spotifyUri: row.querySelector('.f-uri').value.trim(),
    note: row.querySelector('.f-note').value.trim()
  })).filter(r => r.title && r.spotifyUri);
}

document.getElementById('savePlaylists').addEventListener('click', () => {
  const body = { special: readRows('specialRows'), playlists: readRows('playlistRows') };
  fetch('/api/admin/playlists', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(async r => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'kaydedilemedi');
    return r.json();
  }).then(() => showMsg('msgPlaylists', 'kaydedildi ✓'))
    .catch(err => showMsg('msgPlaylists', err.message || 'kaydedilemedi'));
});

// --- Anılar ---
function addMemoryRow(item = { title: '', date: '', text: '', image: '' }) {
  const el = rowCard(`
    <input class="f-title" placeholder="başlık" value="${escapeAttr(item.title)}">
    <input class="f-date" placeholder="tarih (opsiyonel)" value="${escapeAttr(item.date || '')}">
    <textarea class="f-text" rows="3" placeholder="anı metni">${escapeText(item.text)}</textarea>
    <input class="f-image" placeholder="görsel URL (opsiyonel)" value="${escapeAttr(item.image || '')}">
  `);
  document.getElementById('memoryRows').appendChild(el);
}

document.querySelector('[data-add="memory"]').addEventListener('click', () => addMemoryRow());

document.getElementById('saveMemories').addEventListener('click', () => {
  const rows = Array.from(document.getElementById('memoryRows').children).map(row => ({
    title: row.querySelector('.f-title').value.trim(),
    date: row.querySelector('.f-date').value.trim(),
    text: row.querySelector('.f-text').value.trim(),
    image: row.querySelector('.f-image').value.trim()
  })).filter(r => r.title || r.text);

  fetch('/api/admin/memories', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows)
  }).then(async r => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'kaydedilemedi');
    return r.json();
  }).then(() => showMsg('msgMemories', 'kaydedildi ✓'))
    .catch(err => showMsg('msgMemories', err.message || 'kaydedilemedi'));
});

// --- Sözler ---
document.getElementById('saveMessages').addEventListener('click', () => {
  const toLines = id => document.getElementById(id).value.split('\n').map(s => s.trim()).filter(Boolean);
  const body = {
    genel: toLines('msgGenel'),
    moral: toLines('msgMoral'),
    umut: toLines('msgUmut')
  };
  fetch('/api/admin/bot-messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).then(async r => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'kaydedilemedi');
    return r.json();
  }).then(() => showMsg('msgMessages', 'kaydedildi ✓'))
    .catch(err => showMsg('msgMessages', err.message || 'kaydedilemedi'));
});

// --- Verileri yükle ---
fetch('/api/playlists').then(r => r.json()).then(data => {
  (data.special || []).forEach(addSpecialRow);
  (data.playlists || []).forEach(addPlaylistRow);
});

fetch('/api/memories').then(r => r.json()).then(memories => {
  (memories || []).forEach(addMemoryRow);
});

fetch('/api/admin/bot-messages').then(r => r.json()).then(data => {
  document.getElementById('msgGenel').value = (data.genel || []).join('\n');
  document.getElementById('msgMoral').value = (data.moral || []).join('\n');
  document.getElementById('msgUmut').value = (data.umut || []).join('\n');
});

// --- Yardımcı ---
function escapeAttr(str) {
  return (str ?? '').toString().replace(/"/g, '&quot;');
}
function escapeText(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
function showMsg(id, text) {
  const el = document.getElementById(id);
  el.textContent = text;
  setTimeout(() => { el.textContent = ''; }, 2500);
}
