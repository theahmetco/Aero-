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

// ── ADMIN AYARLARI ────────────────────────────────────────────────────────────
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin';
const ADMIN_TOKENS = new Set();

function genToken() {
  return crypto.randomBytes(24).toString('hex');
}
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !ADMIN_TOKENS.has(token)) return res.status(401).json({ ok: false, error: 'Yetkisiz' });
  next();
}

// ── ODALAR VE VERİ KONTROLÜ ───────────────────────────────────────────────────
const ROOMS_FILE = path.join(__dirname, 'rooms.json');
const MAX_MESSAGES = 200;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function loadRooms() {
  try {
    if (fs.existsSync(ROOMS_FILE)) return JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
  } catch(e) {}
  return {
    '1': { name: 'Oda 1', password: 'sifre1' },
    '2': { name: 'Oda 2', password: 'sifre2' }
  };
}
function saveRooms() {
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(ROOMS, null, 2), 'utf8');
}

let ROOMS = loadRooms();
const roomMessages = {};
const roomClients  = {};
let globalSpotifyUri = 'spotify:embed:track:4PTG3Z6ehGkBFm6TuvYv2G';

function initRoom(id) {
  if (roomMessages[id]) return;
  const dbFile = path.join(__dirname, `messages_room${id}.json`);
  let msgs = [];
  try { if (fs.existsSync(dbFile)) msgs = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch(e) {}
  roomMessages[id] = msgs.filter(m => (Date.now() - new Date(m.time).getTime()) < MAX_AGE_MS);
  roomClients[id]  = new Map();
  fs.writeFileSync(dbFile, JSON.stringify(roomMessages[id]), 'utf8');
}

Object.keys(ROOMS).forEach(initRoom);

function saveRoomMessages(roomId) {
  fs.writeFileSync(path.join(__dirname, `messages_room${roomId}.json`), JSON.stringify(roomMessages[roomId]), 'utf8');
}

function broadcastToRoom(roomId, data) {
  if (!roomClients[roomId]) return;
  const str = JSON.stringify(data);
  roomClients[roomId].forEach((_, ws) => { if (ws.readyState === WebSocket.OPEN) ws.send(str); });
}

function broadcastOnline(roomId) {
  if (!roomClients[roomId]) return;
  const users = Array.from(roomClients[roomId].values());
  broadcastToRoom(roomId, { type: 'online', count: users.length, users });
}

// ── ADMIN PANEL API ──────────────────────────────────────────────────────────
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = genToken();
    ADMIN_TOKENS.add(token);
    return res.json({ ok: true, token });
  }
  res.status(403).json({ ok: false, error: 'Hatalı giriş' });
});

app.get('/admin/rooms', requireAdmin, (req, res) => {
  const list = Object.entries(ROOMS).map(([id, r]) => ({ id, name: r.name, password: r.password }));
  res.json(list);
});

app.post('/admin/rooms', requireAdmin, (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ ok: false });
  const id = String(Date.now());
  ROOMS[id] = { name, password };
  initRoom(id);
  saveRooms();
  res.json({ ok: true });
});

app.delete('/admin/rooms/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!ROOMS[id]) return res.status(404).json({ ok: false });
  if (roomClients[id]) roomClients[id].forEach((_, ws) => ws.close());
  delete ROOMS[id];
  delete roomMessages[id];
  delete roomClients[id];
  saveRooms();
  res.json({ ok: true });
});

// ── GENEL API ─────────────────────────────────────────────────────────────────
app.get('/rooms', (req, res) => {
  res.json(Object.entries(ROOMS).map(([id, r]) => ({ id, name: r.name })));
});

// ── WEBSOCKET ─────────────────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  let joinedRoom = null;

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join' && msg.nick && msg.roomId && msg.password) {
      const room = ROOMS[msg.roomId];
      if (!room || room.password !== msg.password) { ws.send(JSON.stringify({ type: 'error', text: 'Yanlış şifre' })); return; }
      joinedRoom = msg.roomId;
      initRoom(joinedRoom);
      roomClients[joinedRoom].set(ws, msg.nick.slice(0,30));
      ws.send(JSON.stringify({ type: 'history', messages: roomMessages[joinedRoom] }));
      ws.send(JSON.stringify({ type: 'spotify_sync', uri: globalSpotifyUri }));
      broadcastOnline(joinedRoom);
      broadcastToRoom(joinedRoom, { type: 'system', text: msg.nick.slice(0,30) + ' katıldı' });
    }

    if (!joinedRoom) return;

    if (msg.type === 'spotify_change' && msg.uri) {
      globalSpotifyUri = msg.uri;
      broadcastToRoom(joinedRoom, { type: 'spotify_sync', uri: globalSpotifyUri });
    }

    if (msg.type === 'chat' && msg.nick && msg.text) {
      const m = { id: Date.now()+'_'+Math.random().toString(36).slice(2), nick: msg.nick.slice(0,30), text: msg.text.slice(0,500), time: new Date().toISOString() };
      roomMessages[joinedRoom].push(m);
      if (roomMessages[joinedRoom].length > MAX_MESSAGES) roomMessages[joinedRoom] = roomMessages[joinedRoom].slice(-MAX_MESSAGES);
      saveRoomMessages(joinedRoom);
      broadcastToRoom(joinedRoom, { type: 'message', message: m });
    }
  });

  ws.on('close', () => {
    if (!joinedRoom) return;
    roomClients[joinedRoom]?.delete(ws);
    broadcastOnline(joinedRoom);
  });
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log('Laviva portta aktif: ' + PORT));
