# bağışpanel · Aşama 1 (giriş, kullanıcılar, birimler, yetkiler)

## Çalıştırma
1. Node.js 22.5 veya üstünü kurun (nodejs.org, "LTS" yerine "Current" gerekebilir).
2. Bu klasörde: `node --no-warnings server.js`  (Windows'ta `baslat.bat` dosyasına çift tıklayın)
3. Tarayıcıda `http://localhost:3000` açın.
4. İlk açılışta konsolda **admin** kullanıcısının geçici şifresi yazar. İlk girişte şifre değiştirilir.
   Şifreyi kendiniz vermek için: `ADMIN_PASSWORD=BirSifre123 node --no-warnings server.js`

Dış paket kurulumu gerekmez. Veriler `data/bagispanel.db` dosyasındadır: **yedeği bu dosyadır**.

## Test
`node --no-warnings test.js` (24 otomatik test: giriş, yetki, güvenlik kuralları)

## Yetki mantığı
- Her kullanıcı bir **birime** bağlıdır. Birim, menü bazında Görme / Ekleme / Düzeltme / Silme-iptal yetkisi taşır.
- Kullanıcıya **özel istisna** verilebilir: "Birimden" (varsayılan), "Ver", "Kaldır".
  Örnek: çağrı merkezindeki bir kişi Su kuyusu organizasyonunu görsün ve düzeltsin ama silme/iptal edemesin.
- Görme yetkisi yoksa diğerleri geçersizdir, menü hiç görünmez.
- Kimse sahip olmadığı yetkiyi başkasına veremez; kendi yetkisini değiştiremez.
- Sistemde yönetim yetkisi (Kullanıcılar + Birimler düzeltme) olan en az bir aktif kullanıcı her zaman kalır.
- Her yetki kontrolü **sunucuda** yapılır; tarayıcıyı kurcalamak işe yaramaz.

## Güvenlik
- Şifreler scrypt ile özetlenir (açık saklanmaz). En az 8 karakter, harf + rakam.
- Oturum çerezi HttpOnly + SameSite=Strict. 8 saat.
- 5 hatalı girişte 15 dakika kilit. Tüm önemli işlemler "Denetim kaydı"na yazılır.
- **Canlıya alırken HTTPS şart.** Sunucunun önüne HTTPS veren bir ara katman (Caddy, nginx) koyun ve `SECURE=1` verin.

## Sonraki aşamalar
Bağış al, bekleyenler, bağış türleri, organizasyonlar (kurban, kuyu, videolu), partnerler, banka, PDF, SMS ve web sitesi paneli
prototipten bu yapıya modül modül taşınacak. Yeni modül `menu.js` dosyasına eklenince yetki ekranına otomatik girer.
Üretimde veritabanı SQLite yerine PostgreSQL olacak (`schema.sql`).
