# aero

Basit, şifre korumalı kişisel site. Çalma listeleri, anılar ve olumlu mesaj botu içerir.

## Yerelde çalıştırma

```bash
npm install
npm start
```

`http://localhost:3000/login` adresine git, şifre: `labubu` (veya `.env` dosyasındaki `SITE_PASSWORD`).

## İçerik düzenleme

- **Çalma listeleri:** `data/playlists.json` — Spotify'da playlist'i aç, "Paylaş" > "Bağlantıyı Kopyala" yerine "Spotify URI'sini Kopyala" seçeneğini kullan (ya da linkteki `/playlist/XXXX` kısmındaki ID'yi `spotify:playlist:XXXX` formatına çevir).
- **Anılar:** `data/memories.json` — her anı için `title`, `date`, `text`, isteğe bağlı `image` (görseli `public/images/` klasörüne koy, yolunu `/public/images/dosya.jpg` şeklinde yaz).
- **Bot mesajları:** `data/bot-messages.json` — kategori altına istediğin kadar cümle ekleyebilirsin.

## Railway'e deploy

1. Bu repoyu GitHub'a yükle.
2. Railway'de "New Project" > "Deploy from GitHub repo" ile bu repoyu seç.
3. Railway otomatik olarak `npm install` ve `npm start` çalıştıracak (Node.js algılanır).
4. Railway proje ayarlarında **Variables** sekmesine şunları ekle:
   - `SITE_PASSWORD` = `labubu` (istersen değiştir)
   - `SESSION_SECRET` = rastgele, uzun bir metin
   - `NODE_ENV` = `production`
5. Deploy tamamlanınca Railway sana bir `*.up.railway.app` adresi verir. İstersen kendi domain'ini (theahmetco.site altında bir subdomain gibi) bu servise CNAME ile bağlayabilirsin.

## Notlar

- Giriş sistemi tek şifre üzerinden çalışır, kullanıcı adı yok.
- Oturum çerezi 30 gün geçerli, tarayıcıyı kapatınca şifre tekrar sorulmaz (30 gün boyunca).
- Şifreyi değiştirmek için sadece `SITE_PASSWORD` ortam değişkenini güncelle, kod değişikliği gerekmez.
