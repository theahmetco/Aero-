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

// ── ADMIN ─────────────────────────────────────────────────────────────────────
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

// ── ODALAR ────────────────────────────────────────────────────────────────────
const ROOMS_FILE = path.join(__dirname, 'rooms.json');
const SHUTDOWN_TIME = new Date('2030-12-31T23:59:59+03:00').getTime();
const MAX_MESSAGES = 200;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function loadRooms() {
  try {
    if (fs.existsSync(ROOMS_FILE)) return JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
  } catch(e) {}
  return {
    '1': { name: 'Oda 1', password: 'sifre1' },
    '2': { name: 'Oda 2', password: 'sifre2' },
    '3': { name: 'Oda 3', password: 'sifre3' },
    '4': { name: 'Oda 4', password: 'sifre4' },
    '5': { name: 'Oda 5', password: 'sifre5' },
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
  const cutoff = Date.now() - MAX_AGE_MS;
  msgs = msgs.filter(m => new Date(m.time).getTime() > cutoff);
  roomMessages[id] = msgs;
  roomClients[id]  = new Map();
  fs.writeFileSync(dbFile, JSON.stringify(msgs), 'utf8');
}

Object.keys(ROOMS).forEach(initRoom);

function saveRoomMessages(roomId) {
  fs.writeFileSync(path.join(__dirname, `messages_room${roomId}.json`), JSON.stringify(roomMessages[roomId]), 'utf8');
}
function cleanRoom(roomId) {
  if (!roomMessages[roomId]) return;
  const cutoff = Date.now() - MAX_AGE_MS;
  roomMessages[roomId] = roomMessages[roomId].filter(m => new Date(m.time).getTime() > cutoff);
  saveRoomMessages(roomId);
}
setInterval(() => Object.keys(ROOMS).forEach(cleanRoom), 60 * 60 * 1000);

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

// ── CLOUDINARY ────────────────────────────────────────────────────────────────
function uploadToCloudinary(base64Data, resourceType, callback) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return callback(new Error('Cloudinary config missing'));
  
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash('sha1').update(`timestamp=${timestamp}${apiSecret}`).digest('hex');
  const postData  = `file=${encodeURIComponent(base64Data)}&timestamp=${timestamp}&api_key=${apiKey}&signature=${signature}`;
  const options   = {
    hostname: 'api.cloudinary.com',
    path: `/v1_1/${cloudName}/${resourceType}/upload`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
  };
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      try { const r = JSON.parse(data); r.secure_url ? callback(null, r.secure_url) : callback(new Error(JSON.stringify(r))); }
      catch(e) { callback(e); }
    });
  });
  req.on('error', callback);
  req.write(postData);
  req.end();
}

// ── ODALAR VE GENEL API'LER ───────────────────────────────────────────────────
app.get('/rooms', (req, res) => {
  const list = Object.entries(ROOMS).map(([id, r]) => ({ id, name: r.name }));
  res.json(list);
});

// ── WEBSOCKET BAĞLANTISI ──────────────────────────────────────────────────────
wss.on('connection', (ws) => {
  let joinedRoom = null;

  ws.on('message', (raw) => {
    if (Date.now() >= SHUTDOWN_TIME) return;
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
      broadcastToRoom(joinedRoom, { type: 'system', text: msg.nick.slice(0,30)+' katıldı', kind: 'join' });
    }

    if (!joinedRoom) return;

    if (msg.type === 'spotify_change' && msg.uri) {
      let finalUri = msg.uri;
      if (msg.uri.includes('spotify.com/')) {
        const match = msg.uri.match(/(track|playlist|album|artist)\/([a-zA-Z0-9]+)/);
        if (match) finalUri = `spotify:embed:${match[1]}:${match[2]}`;
      }
      globalSpotifyUri = finalUri;
      broadcastToRoom(joinedRoom, { type: 'spotify_sync', uri: globalSpotifyUri });
    }

    if (msg.type === 'chat' && msg.nick && msg.text) {
      const m = { id: Date.now()+'_'+Math.random().toString(36).slice(2), nick: msg.nick.slice(0,30), text: msg.text.slice(0,500), time: new Date().toISOString(), deleted: false };
      roomMessages[joinedRoom].push(m);
      saveRoomMessages(joinedRoom);
      broadcastToRoom(joinedRoom, { type: 'message', message: m });
    }
  });

  ws.on('close', () => {
    if (!joinedRoom) return;
    const nick = roomClients[joinedRoom]?.get(ws);
    roomClients[joinedRoom]?.delete(ws);
    broadcastOnline(joinedRoom);
    joinedRoom = null;
  });
});

// index.html'i doğrudan ana dizinden servis et
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log('Sistem aktif, port: ' + PORT));
