# bağışpanel — yapılacaklar ve notlar

Bu dosya Meriç'in "notlara al, sonra senden isteyeceğim" dediği işleri tutar. İstediğinde "notlardaki şunu yap" demen yeterli.

## Onay bekleyen kararlar
- [ ] **Kategori ve alt kategori isimleri düzenlenebilsin** (isim değişince geçmiş bağışlar, raporlar, org kayıtları yeni ismi görür; kuyu/kurban türlerinde sistemin eklediği son ek otomatik kalır, aynı isim ikinci kez açılamaz).
- [ ] **Kullanıcı silme kalksın, yalnızca "Pasife al"** (geçmiş bağışlarda sorumlu adı ve denetim kaydı bozulmasın).
- [ ] **Kullanıcı yetki ekranını sadeleştir**: "Birimden gelen / istisna" özeti, istisnalar renkli.

## Tasarım
- [x] Açık, sıcak tema varsayılan; menü simgeli, geçişli; ana sayfa yenilendi; kurumsal menü adları.
- [x] Koyu/açık tema düğmesi (sol altta ay/güneş simgesi, tercih tarayıcıda saklanır).
- [ ] Koyu temayı tüm sayfalarda gözden geçir (tablolar, formlar, PDF önizleme, makbuz).
- [ ] Menü ve tema son cila: yazı tipleri, boşluklar, mobil menü, sayfa geçişleri.
- [ ] Küçükbaş PDF için 3 farklı tek-isim tasarımı (şu an tek tasarım var). Diğer PDF tasarımlarını da zenginleştir.
- [ ] Sayfa içi simgeler: tablolardaki ve formlardaki düğmelere simge.

## Ana sayfa
- [x] Bölümleri kullanıcı kendine göre aç/kapat ve sırala (kişiye özel kayıt).
- [ ] Demo verisi son 30 güne yayılsın (şimdi hepsi bugüne yazılıyor, grafik tek çubuk).
- [ ] Rol bazlı hazır ana sayfa şablonları (saha, çağrı merkezi, yönetici).

## Organizasyon / PDF
- [ ] Tabela boyutu: Meriç boyutu verecek (ayarda alan hazır, varsayılan 210×297 mm).
- [ ] Ülke bayrağı: yeni ülke için bayrak yükleme eklendi (Ülkeler sayfası). Hazır bayraklar 16 ülke; istenirse kapsamlı bayrak kütüphanesi gömülebilir.
- [ ] Video dosyası yükleme (şimdilik yalnızca dosya adı / https bağlantısı kayıtlı).
- [ ] Gerçek SMS sağlayıcısı bağlantısı (şimdilik mesajlar yalnızca kayda yazılır).

## Altyapı
- [ ] PostgreSQL'e geçiş, ciddi sunucu (docker-compose / Caddy / yedek hazır), HTTPS.
- [ ] GitHub deposunu tekrar **Private** yap (Claude GitHub uygulamasının yazma izni korunmalı).
- [ ] Render ücretsiz plan uyuyunca veri sıfırlanır; kalıcı veri için ücretli plan ya da kalıcı disk / harici veritabanı.

## Ertelenenler
- [ ] Web sitesi paneli (Sayfa Yönetimi, Menü Düzeni, Bağış Formları, Tasarım ve Alan Adı) taşınmadı.
