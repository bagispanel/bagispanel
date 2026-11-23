# Kurulum rehberi (bir kez yapılır)

## Genel resim
- **Sunucu:** tek bir kiralık sunucu (VPS). Üzerinde iki ortam çalışır:
  `test` (değişiklikleri siz izlersiniz) ve `canlı` (gerçek kullanım).
- **Kod:** GitHub'da özel (private) depo. Claude `test` dalına yükler → test ortamı **birkaç dakikada** güncellenir.
  Siz beğenirseniz `main` dalına alınır → canlı güncellenir.
- **Yedek:** her 6 saatte bir sunucuda tutarlı kopya (son 60 adet) + günlük olarak sunucu dışına kopya.

## 1. Sunucu
- Öneri: Hetzner CX22 (yaklaşık 4-5 €/ay, Frankfurt) veya Türkiye'de bir sağlayıcı. **KVKK:** bağışçı kişisel verisi tuttuğunuz için
  sunucunun konumunu ve sağlayıcıyı dernek yönetimi/hukuk danışmanıyla netleştirin.
- Ubuntu 24.04 seçin, SSH anahtarıyla açın. Sunucuda: `curl -fsSL https://get.docker.com | sh`
- Alan adınızda iki kayıt (A): `test.dernegim.org` ve `panel.dernegim.org` → sunucunun IP'si.
- `mkdir -p /srv/bagispanel` ve içine `deploy/.env.example` dosyasını `.env` olarak koyup alan adlarını yazın.

## 2. GitHub
- Özel depo açın (örn. `bagispanel`). claude.ai → Ayarlar → Bağlantılar'dan GitHub'ı bağlayın ki Claude `test` dalına yükleyebilsin.
- Depo → Settings → Secrets → Actions: `SSH_HOST` (sunucu IP), `SSH_USER` (örn. root), `SSH_KEY` (sunucuya girebilen özel anahtar).
- `main` dalını korumaya alın (Settings → Branches): canlıya doğrudan yükleme yapılamasın, yalnızca siz onaylayınca.

## 3. İlk açılış
Test ortamı ilk kez ayağa kalkınca `docker compose logs test` içinde admin geçici şifresi yazar. Giriş yapıp değiştirin.

## 4. Yedekler
- Sunucuda: `/srv/bagispanel/data-canli/yedek/` (otomatik, sıkıştırılmış, her biri doğrulanmış).
- **Sunucu dışı kopya (şart):** Hetzner Storage Box veya Backblaze B2 hesabı açın, sunucuda `rclone` ile günlük:
  `0 3 * * * rclone sync /srv/bagispanel/data-canli/yedek uzak:bagispanel-yedek`
- Geri yükleme: uygulamayı durdurun, `.db.gz` dosyasını açıp `data-canli/bagispanel.db` olarak koyun, başlatın.
- **Videolar** (`data-canli/videos/`) veritabanı yedeğine girmez, ayrıca kopyalanmalı: `30 3 * * * rclone copy /srv/bagispanel/data-canli/videos uzak:bagispanel-video` (`copy` kullanın, `sync` değil: sunucudan silinen video yedekte kalsın). Video boyut sınırı `VIDEO_MAX_MB` (varsayılan 500). Disk dolmadan büyütün; yükleme diskte 1 GB boş yer kalmadıysa reddedilir.
- **Yedek şifreleme (KVKK için önerilir):** `docker-compose.yml`'de yedek servislerine `BACKUP_KEY=<en az 16 karakterlik uzun parola>` ekleyin; yedekler `.db.gz.enc` olarak AES-256 ile şifrelenir. Anahtarı sunucudan AYRI bir yerde (parola yöneticisi + kâğıt kopya) saklayın; kaybederseniz yedek açılamaz. Açmak için: `BACKUP_KEY=... node backup.js --coz yedek.db.gz.enc cikti.db.gz`, sonra `gunzip`.
- **HTTPS:** `PUBLIC_URL=https://...` tanımlı olmalı (Caddy sertifikayı otomatik alır); bu durumda tarayıcıya HSTS gönderilir.
- Yılda en az bir kez geri yüklemeyi **deneyin**; denenmemiş yedek yedek sayılmaz.
