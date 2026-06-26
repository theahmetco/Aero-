const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json({ limit: '50mb' }));

// ── STATİK DOSYALARI VE ANA SAYFAYI SUNMA (Hatayı Çözen Kısım) ──────────────────
// Klasördeki index.html ve diğer statik varlıkları Express'e tanıtıyoruz
app.use(express.static(path.join(__dirname)));

// Biri doğrudan siteye girdiğinde index.html dosyasını gönderiyoruz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin';
const ADMIN_TOKENS = new Set(); // basit session token

function genToken() {
  return crypto.randomBytes(24).toString('hex');
}
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !ADMIN_TOKENS.has(token)) return res.status(401).json({ ok: false, error: 'Yetkisiz' });
  next();
}

// ── ODALAR (disk'ten yükle, yoksa varsayılan) ─────────────────────────────────
const ROOMS_FILE = path.join(__dirname, 'rooms.json');
const SHUTDOWN_TIME = new Date('2030-12-31T23:59:59+03:00').getTime();
const MAX_MESSAGES = 200;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function loadRooms() {
  try {
    if (fs.existsSync(ROOMS_FILE)) return JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
  } catch (e) {}
  return [
    { id: 'genel', name: 'genel oda', password: '123' },
    { id: 'lobi', name: 'lobi', password: '123' }
  ];
}
function saveRooms() {
  try { fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2), 'utf8'); } catch (e) {}
}

let rooms = loadRooms();
let roomMessages = {};
let roomClients = {};

rooms.forEach(r => {
  roomMessages[r.id] = [];
  roomClients[r.id] = new Set();
});

function loadRoomMessages(roomId) {
  const p = path.join(__dirname, `messages_${roomId}.json`);
  try {
    if (fs.existsSync(p)) {
      let arr = JSON.parse(fs.readFileSync(p, 'utf8'));
      const now = Date.now();
      arr = arr.filter(m => (now - new Date(m.time).getTime()) < MAX_AGE_MS);
      return arr;
    }
  } catch (e) {}
  return [];
}
function saveRoomMessages(roomId) {
  const p = path.join(__dirname, `messages_${roomId}.json`);
  try { fs.writeFileSync(p, JSON.stringify(roomMessages[roomId] || []), 'utf8'); } catch (e) {}
}

rooms.forEach(r => {
  roomMessages[r.id] = loadRoomMessages(r.id);
});

function broadcastToRoom(roomId, obj) {
  if (!roomClients[roomId]) return;
  const str = JSON.stringify(obj);
  roomClients[roomId].forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(str);
  });
}

function updateOnlineCount(roomId) {
  if (!roomClients[roomId]) return;
  const list = [];
  roomClients[roomId].forEach(c => { if (c.lavivaNick) list.push(c.lavivaNick); });
  broadcastToRoom(roomId, { type: 'online', count: roomClients[roomId].size, users: list });
}

// ── API ROUTES ────────────────────────────────────────────────────────────────
app.get('/rooms', (req, res) => {
  res.json(rooms.map(r => ({ id: r.id, name: r.name })));
});

app.post('/verify-room', (req, res) => {
  const { roomId, password } = req.body;
  const r = rooms.find(x => x.id === roomId);
  if (!r) return res.json({ ok: false, error: 'Oda bulunamadı' });
  if (r.password && r.password !== password) return res.json({ ok: false, error: 'Hatalı oda şifresi' });
  res.json({ ok: true });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const t = genToken(); ADMIN_TOKENS.add(t);
    return res.json({ ok: true, token: t });
  }
  res.status(400).json({ ok: false, error: 'Hatalı admin bilgisi' });
});

app.post('/admin/logout', (req, res) => {
  const t = req.headers['x-admin-token'];
  if (t) ADMIN_TOKENS.delete(t);
  res.json({ ok: true });
});

app.get('/admin/rooms', requireAdmin, (req, res) => {
  res.json(rooms.map(r => ({ id: r.id, name: r.name, password: r.password, online: roomClients[r.id] ? roomClients[r.id].size : 0 })));
});

app.post('/admin/rooms', requireAdmin, (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ ok: false, error: 'Eksik bilgi' });
  const id = 'room_' + Date.now();
  const nr = { id, name, password };
  rooms.push(nr); saveRooms();
  roomMessages[id] = []; roomClients[id] = new Set();
  res.json({ ok: true });
});

app.put('/admin/rooms/:id', requireAdmin, (req, res) => {
  const { name, password } = req.body;
  const r = rooms.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: 'Bulunamadı' });
  if (name) r.name = name;
  if (password !== undefined) r.password = password;
  saveRooms();
  res.json({ ok: true });
});

app.delete('/admin/rooms/:id', requireAdmin, (req, res) => {
  const idx = rooms.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ ok: false, error: 'Bulunamadı' });
  const id = rooms[idx].id;
  broadcastToRoom(id, { type: 'error', text: 'Oda yönetici tarafından silindi.' });
  if (roomClients[id]) {
    roomClients[id].forEach(c => c.close());
    delete roomClients[id];
  }
  delete roomMessages[id];
  try { fs.unlinkSync(path.join(__dirname, `messages_${id}.json`)); } catch (e) {}
  rooms.splice(idx, 1); saveRooms();
  res.json({ ok: true });
});

app.delete('/admin/rooms/:id/messages', requireAdmin, (req, res) => {
  const id = req.params.id;
  if (roomMessages[id]) {
    roomMessages[id] = []; saveRoomMessages(id);
    broadcastToRoom(id, { type: 'history', messages: [] });
  }
  res.json({ ok: true });
});

// ── MEDYA YÜKLEMELERİ ─────────────────────────────────────────────────────────
app.post('/upload-audio', (req, res) => {
  const { audio, nick, roomId } = req.body;
  if (!audio || !roomId || !roomMessages[roomId]) return res.status(400).json({ ok: false });
  const m = { id: Date.now() + '_' + Math.random().toString(36).slice(2), nick: String(nick).slice(0, 30), audioUrl: audio, time: new Date().toISOString(), deleted: false };
  roomMessages[roomId].push(m);
  if (roomMessages[roomId].length > MAX_MESSAGES) roomMessages[roomId] = roomMessages[roomId].slice(-MAX_MESSAGES);
  saveRoomMessages(roomId);
  broadcastToRoom(roomId, { type: 'message', message: m });
  res.json({ ok: true });
});

app.post('/upload-file', (req, res) => {
  const { file, nick, fileType, fileName, roomId } = req.body;
  if (!file || !roomId || !roomMessages[roomId]) return res.status(400).json({ ok: false });
  const m = { id: Date.now() + '_' + Math.random().toString(36).slice(2), nick: String(nick).slice(0, 30), fileUrl: file, fileType, fileName: String(fileName).slice(0, 100), time: new Date().toISOString(), deleted: false };
  roomMessages[roomId].push(m);
  if (roomMessages[roomId].length > MAX_MESSAGES) roomMessages[roomId] = roomMessages[roomId].slice(-MAX_MESSAGES);
  saveRoomMessages(roomId);
  broadcastToRoom(roomId, { type: 'message', message: m });
  res.json({ ok: true });
});

// ── WEBSOCKET ─────────────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  let joinedRoom = null;
  let userNick = null;

  ws.on('message', (message) => {
    let msg;
    try { msg = JSON.parse(message); } catch (e) { return; }

    if (msg.type === 'join' && msg.roomId && msg.nick && msg.password) {
      const r = rooms.find(x => x.id === msg.roomId);
      if (!r || (r.password && r.password !== msg.password)) {
        return ws.send(JSON.stringify({ type: 'error', text: 'Geçersiz oda veya şifre' }));
      }
      joinedRoom = msg.roomId;
      userNick = msg.nick.slice(0, 30);
      ws.lavivaNick = userNick;

      if (!roomClients[joinedRoom]) roomClients[joinedRoom] = new Set();
      roomClients[joinedRoom].add(ws);

      ws.send(JSON.stringify({ type: 'shutdown', shutdownTime: SHUTDOWN_TIME }));
      ws.send(JSON.stringify({ type: 'history', messages: roomMessages[joinedRoom] || [] }));

      broadcastToRoom(joinedRoom, { type: 'system', text: userNick + ' katıldı', kind: 'join' });
      updateOnlineCount(joinedRoom);
    }

    if (!joinedRoom) return;

    if (msg.type === 'typing' && msg.nick) {
      roomClients[joinedRoom].forEach(c => {
        if (c !== ws && c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'typing', nick: msg.nick.slice(0, 30) }));
      });
    }

    if (msg.type === 'chat' && msg.nick && msg.text) {
      const m = { id: Date.now() + '_' + Math.random().toString(36).slice(2), nick: msg.nick.slice(0, 30), text: msg.text.slice(0, 500), time: new Date().toISOString(), deleted: false };
      roomMessages[joinedRoom].push(m);
      if (roomMessages[joinedRoom].length > MAX_MESSAGES) roomMessages[joinedRoom] = roomMessages[joinedRoom].slice(-MAX_MESSAGES);
      saveRoomMessages(joinedRoom);
      broadcastToRoom(joinedRoom, { type: 'message', message: m });
    }

    if (msg.type === 'delete' && msg.id) {
      const m = roomMessages[joinedRoom].find(x => x.id === msg.id);
      if (m && m.nick === msg.nick) {
        m.deleted = true; m.text = ''; m.audioUrl = null; m.fileUrl = null;
        saveRoomMessages(joinedRoom);
        broadcastToRoom(joinedRoom, { type: 'deleted', id: msg.id });
      }
    }
  });

  ws.on('close', () => {
    if (!joinedRoom) return;
    if (roomClients[joinedRoom]) {
      roomClients[joinedRoom].delete(ws);
      broadcastToRoom(joinedRoom, { type: 'system', text: userNick + ' ayrıldı', kind: 'leave' });
      updateOnlineCount(joinedRoom);
    }
  });
});

// ── PORT DİNLEME (Railway Dinamik Port Ayarı) ───────────────────────────────────
const PORT = process.env.PORT || 8080; // Railway kendi portunu atayacak, yerelde 8080 çalışacak

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sunucu ${PORT} portunda aktif.`);
});
