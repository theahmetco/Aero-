const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Şifre: ortam değişkeninden okunur, yoksa varsayılan "labubu" kullanılır
const SITE_PASSWORD = process.env.SITE_PASSWORD || 'labubu';
const SESSION_SECRET = process.env.SESSION_SECRET || 'aero-gizli-anahtar-degistir';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 gün
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({ error: 'Giriş gerekli' });
  }
  return res.redirect('/login');
}

function readJSON(file) {
  const filePath = path.join(__dirname, 'data', file);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// --- Sayfalar ---

app.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === SITE_PASSWORD) {
    req.session.authenticated = true;
    return res.redirect('/');
  }
  return res.redirect('/login?hata=1');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// --- API ---

app.get('/api/playlists', requireAuth, (req, res) => {
  res.json(readJSON('playlists.json'));
});

app.get('/api/memories', requireAuth, (req, res) => {
  res.json(readJSON('memories.json'));
});

app.get('/api/bot-message', requireAuth, (req, res) => {
  const data = readJSON('bot-messages.json');
  const categories = Object.keys(data);
  const cat = categories[Math.floor(Math.random() * categories.length)];
  const messages = data[cat];
  const message = messages[Math.floor(Math.random() * messages.length)];
  res.json({ message });
});

// Statik dosyalar (css/js/görseller hassas değil, herkese açık servis edilir;
// asıl koruma sayfa ve API rotalarında requireAuth ile sağlanıyor)
app.use('/public', express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Aero ${PORT} portunda çalışıyor`);
});
