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

## İletişim (yapıldı)
- Toplu SMS, Toplu E-posta, WhatsApp (gelen kutusu + şablonlu toplu), Gönderilen Mesajlar, İletişim Ayarları eklendi. Sistem Ayarları'ndaki "Entegrasyon" kaldırıldı (API anahtarı Web Sitesi → Web Sitesi Bağlantısı'na taşındı).
- Deneme/canlı mod: deneme modunda hiçbir şey dışarı gitmez.
- GERÇEK servislerle test EDİLMEDİ (yalnızca sahte sunucularla): Netgsm REST, Twilio, SMTP STARTTLS/SSL, Meta WhatsApp Cloud API. "Test mesajı gönder" ile doğrulanmalı.
- Meta tarafında: webhook URL + doğrulama jetonu + App Secret, onaylı şablonlar gerekir.
- Şifreler/anahtarlar DB'de düz metin (PostgreSQL/şifreleme aşamasında çözülecek).
- İzin/İYS: dernek bağış mesajlarında İYS kapsamı hukukçuya sorulmalı.

## Çağrı merkezi (ilk sürüm yapıldı)
- İletişim → Çağrı Merkezi: aranacaklar listesi, görüşme sonucu/not kaydı, görüşme kayıtları, günlük sayılar.
- Aramayı başlatma: şimdilik `tel:` bağlantısı (cihazdaki telefon/softphone). Santral webhook'u: İletişim Ayarları → Çağrı merkezi (POST JSON + anahtar). Gerçek santralle (3CX/Asterisk/Netgsm santral) DENENMEDİ.
- Bağışçı profilinde "SMS istemiyor" ve "Aranmak istemiyor" düğmeleri; toplu gönderimde istemeyenler numarasız ayrı listede görünür.
- İleride: tarayıcıdan tek tıkla arama (santral click-to-call API'si), gelen arama açılır penceresi, ses kaydı oynatma, ağırlıklı aranacak sıra.

## Profilim (yapıldı)
- Yan menüde herkese açık "Profilim" grubu: Profil Bilgilerim, Şifre ve Güvenlik, Mesaj Merkezi (iç mesajlaşma), Görev Takibi. Yetki gerektirmez; herkes yalnızca kendi mesaj/görevini görür.
- Görev atanınca kişiye Mesaj Merkezi'nden bildirim gider; tamamlanınca atayana bildirim gider. Menüde rozet sayıları var.
- Yetki ekranları: yeni birim varsayılan olarak tüm yetkiler açık; kişi yetkileri artık dolu/boş kutu (birimden farklı olanlar turuncu çerçeveli).
- İleride: mesajlara dosya eki, görev yorumları, e-posta/WhatsApp ile görev bildirimi.

## Şube ve Temsilcilikler (yapıldı)
- Sistem Ayarları → Şube ve Temsilcilikler. Dernek/Vakıf seçimi, şube/temsilcilik, yurt içi/yurt dışı, resmî bildirim takibi ve uyarılar.
- DOĞRULANMASI GEREKEN: dernek şube açılış bildirim süresi (30 gün) Kanun md. 23'ten varsayıldı; il sivil toplumla ilişkiler müdürlüğünden teyit edin. Vakıf için 1 ay (VBYS beyannamesi) kaynaktan alındı.
- İleride: şubeye bağlı kullanıcı/bağış/makbuz bloğu, şube bazlı rapor, şube genel kurul takvimi uyarısı (merkezden 2 ay önce), vakıf şube beyannamesi PDF.

## Raporlama ve Analiz + Kurum Yönetimi (yapıldı)
- Yeni menü grubu "Raporlama ve Analiz": Bağış Raporları (Bağış Yönetimi'nden taşındı), Dönemsel Karşılaştırma, Bağış Türü Analizi, Bağışçı Analizi, Saha ve Proje Analizi, İletişim Performansı. Yeni sayfalar yalnızca okur; her biri kendi yetki anahtarına bağlı (rkarsi, rtur, rbagisci, rsaha, riletisim).
- Yeni menü grubu "Kurum Yönetimi": Şube ve Temsilcilikler, Kullanıcı Yönetimi, Birimler ve Yetkiler (Sistem Ayarları'ndan taşındı).
- Deneme verisi artık son ~11 aya yayılıyor (analizler dolu görünsün diye).
- Mevcut kurulumlarda yeni analiz yetkileri yalnızca yönetici birimlerine otomatik verilir; diğer birimlere Birimler ve Yetkiler'den açılmalı.
- İleride: şube bazlı analiz, hedef/gerçekleşen, PDF/Excel dışa aktarım, haftalık e-posta özeti.

## Gönüllü Yönetimi + yeni bağışçı + dönem karşılaştırma (yapıldı)
- Menü: "Bağışçı ve Gönüllü İlişkileri" → Bağışçı Rehberi, Gönüllü Yönetimi. Kurum Yönetimi'ne Partner Kurumlar ve Banka Hesapları da taşındı.
- Gönüllü formu: kişisel, iletişim, meslek/yetkinlik, ilgi alanı, müsaitlik, yurt dışı, acil kişi, durum (Aday/Aktif/Pasif), KVKK onayı (zorunlu). Süzgeçler: durum, medeni durum, cinsiyet, il, ilgi alanı, müsaitlik, yaş aralığı, yurt dışı, ehliyet, şube. CSV dışa aktarım. Silme = KVKK silme talebi (kalıcı).
- Bağışçı Rehberi'nden bağış yapmadan "+ Yeni bağışçı ekle".
- Dönemsel Karşılaştırma: istenen iki ay (örn. Haz 2026 / Haz 2025) yan yana; Bağışçı Analizi: aylık yeni bağışçı kazanımı.
- İleride: gönüllü görev/vardiya takibi, gönüllü–Kalıcı Eser ilişkisi, gönüllüye toplu mesaj.
