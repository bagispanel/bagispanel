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

## Kalıcı Eser Projeleri (yapıldı)
- Saha Organizasyonu → Kalıcı Eser Projeleri. Proje kartı: tür (cami, sağlık ocağı, okul…), ülke/bölge/konum detayı, m², kapasite, hedef tutar (TL/USD/EUR + kur), sorumlu kişi, partner kuruluş (Partner Kurumlar'dan), sorumlu gönüllü, durum, tarihler.
- Sayaç: seçilen bağış türlerine yapılan ONAYLI bağışlar + elle girilen tutar; hedefe göre yüzde. İnşaat ilerlemesi ayrı (% ve notlar).
- Çizim/belge yükleme: PDF/PNG/JPEG/WEBP, en çok 1,5 MB, proje başına 40 dosya (uploads/eser/). Büyük çizimler (CAD, çok sayfalı PDF) için ileride gerçek dosya yükleme / nesne depolama gerekir.
- Web sitesi: GET /api/dis/kalici-eser ve /api/dis/kalici-eser/<id> (x-api-key). Yalnızca "Web sitesinde göster" işaretli projeler; kişisel veri/sorumlu telefonu yok. Sitede sayaç bu uçtan çekilir.
- Kur elle girilir (otomatik kur yok). Bağış türü birden fazla projeye bağlanırsa her ikisinin sayacına da işler.
- İleride: proje bazlı rapor/PDF, fotoğraf galerisi, harcama kalemleri (bütçe/gerçekleşen), gönüllü görev ataması, bağışçıya "projeniz %X tamam" bildirimi.

## Sponsorluk Yönetimi (yapıldı)
- Menü: Sponsorluk Yönetimi → Öğrenci ve Yetim Kartları, Sponsorluklar ve Ödemeler, Takip ve Raporlar.
- Kart: yetim / hafız (ikisi birden olabilir), ülke-bölge, doğum tarihi veya yaş, kimlik no (sponsora GÖSTERİLMEZ), okul/medrese, cüz ve son ezber yeri, bulunduğu yer (derneğin kendi yeri veya Partner Kurum), fotoğraf/video/belge, gelişme notları, "eğitimi/hafızlığı tamamladı".
- Sponsorluk: bağışçı + öğrenci, süre (12/18/24/36 veya özel ay), aylık tutar, TL/USD/EUR, aylık taksit veya peşin; kısmi ödemeler serbest. Beklenen tutar başlangıç gününe göre aylık hesaplanır; gecikme = eksik tutar / aylık.
- Her ödeme gerçek bağış kaydı olarak (Sponsorluk kategorisi: Yetim/Hafız/Öğrenci Sponsorluğu) işlenir → bağış raporlarında, makbuzda, analizlerde görünür.
- Sponsora giden kart: /sponsor.html?t=<token> (giriş gerekmez, tahmin edilemez 24 haneli bağlantı). Tamamlanınca aynı bağlantıdan "&s=1" ile yazdırılabilir sertifika. SMS şablonları Mesaj Şablonları'ndan düzenlenir (spatama, sphatirla, spgelisme, sptamam).
- Ödeme hatırlatma: elle (satır/toplu) veya otomatik (Takip ve Raporlar'da kapalı geliyor; eşik ve tekrar aralığı ayarlanır). SMS'ler İletişim Ayarları'ndaki deneme/canlı moda uyar.
- DİKKAT: çocukların kişisel verisi — velinin/vasinin yazılı izni ve KVKK aydınlatması kurumca alınmalı; kart linki yalnızca sponsora gider, "paylaşmayın" uyarısı var. Hukukçuya danışın.
- Sınırlar: video en çok 1,8 MB (kısa klip), PDF/foto 1,5 MB (fotoğraf otomatik küçülür). Büyük video için gerçek dosya yükleme/nesne depolama gerekir. Otomatik kur yok (bağış kuru sabit tablo).
- Düzeltme: gece 00:00–03:00 arasında UTC/yerel tarih farkı bazı günlük sayaçları yanlış güne bakıyordu; tüm "bugün" hesapları yerel saate alındı.
- Menüden çıkınca açık kalan "yeni/düzenle" formları artık kapanıyor.
- İleride: sponsor portalı (kendi ödemelerini görme/online ödeme), toplu fotoğraf yıllık güncelleme hatırlatması, sertifikanın PDF şablonu, öğrenci transferi (partner değişimi geçmişi), sponsorluk yenileme hatırlatması.

## Bağışçı profili yenilendi + sponsorluk entegrasyonu
- Profil: baş harfli kart, Ara/WhatsApp/E-posta düğmeleri, özet kutuları, sekmeler (Genel bakış, Bağışlar, Sponsorluk, İletişim izinleri). Sponsorluk sekmesinden: sponsorluk tanımla, detaya git, kart linkini SMS ile gönder, ödeme hatırlatması gönder; gecikme varsa profilin üstünde uyarı çıkar.
- Her sponsorluğun referans kodu var (SP0001…); sponsora giden SMS'te "havale açıklamasına kodu yazın" der.
- BANKA HAREKETİ EŞLEŞTİRME: sunucu tarafı HAZIR ve testli (POST /api/sp/banka/onizle ve /onayla: ekstre metninden kod → ad+tutar sırasıyla eşleştirir, aynı hareketi ikinci kez işlemez). Ekranı bilerek YAPILMADI (kullanıcı "daha sonra" dedi). Gerçek banka ekstresi biçimleriyle denenmeli.

## Banka Hareketleri + ana sayfa arama (yapıldı)
- Bağış Yönetimi → Banka Hareketleri: hesaba gelen paralar önce "eşleştirme bekleyen" kuyruğuna düşer, HİÇBİRİ kendiliğinden bağış olmaz. Satırda: gönderen/açıklama, öneri + güven (yüksek/orta/düşük/eşleşmedi) + nedenler; bağışçıyı değiştir/yeni ekle, tür seç, "Bağışı tamamla" (onaylı bağış, Havale/EFT, hareket tarihiyle) veya "Sponsorluk ödemesi olarak işle"; "Yoksay" (sebep zorunlu, geri açılabilir). Toplu işlem yalnızca kullanıcının seçtiği satırlarda.
- Öneri sırası: referans kodu (SP0001) → açıklamadaki telefon → önceden öğrenilmiş gönderen adı (her tamamlamada öğrenir) → ad benzerliği → aynı tutarlı aktif sponsorluk. Tür: öğrenilmiş / açıklamadaki kelime (fitre, zekât, kurban, burs…) / bağışçının son türü.
- Kaynaklar: (1) Ekstre yükleme: CSV (; , veya sekme; Türkçe sayı/tarih biçimleri) ve MT940 (:61:/:86:); dosya Windows-1254 ise otomatik çözülür. Aynı ekstre tekrar yüklenirse kopya oluşmaz (hash). Sadece gelen para alınır. (2) POST /api/dis/banka-hareket (x-api-key, IBAN + hareketler[]) → banka/aracı yazılımın göndermesi için. /api/dis/* uçları artık X-BP başlığı istemez (çerez kullanmadıkları için).
- ARAŞTIRMA (kaynaklar: netadam.net banka entegrasyonu rehberi, Ziraat Bankası MT940/942 sayfası): Türkiye'de üç yol var — banka web servisi/API (SOAP: Ziraat, Halkbank, Vakıfbank, Akbank, Yapı Kredi; REST/OAuth2: Garanti BBVA, QNB, Kuveyt Türk, İş Bankası, Enpara), MT940 ekstre dosyası (e-posta/SFTP/web servis; günlük/saatlik), açık bankacılık (lisanslı hizmet sağlayıcı + müşteri onayı gerekir). Bankadan "hesap hareketi sorgulama" yetkisi kurumsal başvuruyla alınır (şube/kurumsal internet bankacılığı), onay birkaç iş günü–birkaç hafta; sunucu IP'si bildirilmesi/sertifika gerekebilir; yalnızca sorgulama, para transferi yetkisi verilmez.
- YAPILMADI / SIRADAKİ: bankaya özel canlı bağlayıcı (SOAP/REST) — banka anlaşması ve test hesabı olmadan yazılamaz; önce MT940 SFTP/e-posta ile otomatik alım düşünülebilir. Gerçek banka ekstresi biçimleriyle (her bankanın başlıkları farklı) denenmeli; tutar/ad sütunu tanınmazsa başlık adı eklenir.
- Ana sayfa: genel arama kutusu (isim, telefon — 0/boşluk/+90 fark etmez, bağış no, SP kodu, gönüllü, öğrenci, eser, banka hareketi; yetkiye göre; "son baktıklarınız" listesi tarayıcıda tutulur) ve "Eşleştirme bekleyen banka hareketi" kısayolu.
- İleride: aynı gönderenin birden çok aylık toplu ödemesini bölme, hareket-bağış eşleşmesini geri alma, bağışçının IBAN'ını profilde saklayıp otomatik tanıma, bankaya göre ekstre şablonları.

## Kurum bilgileri, giriş ekranı, banka hesapları, Excel, videolu analiz (yapıldı)
- Kurum Yönetimi → Kurum Bilgileri (menü anahtarı kurumb): resmî ad, kısa ad, slogan, logo (PNG/JPEG/WebP, tarayıcıda 420 px'e küçülür, en fazla ~330 KB), telefon, e-posta, web, adres. Herkese açık GET /api/kurum giriş ekranını besler (yalnızca bu alanlar). Mevcut kurulumlarda yeni menü anahtarı yalnızca kullanıcı yönetimi yetkisi olan birimlere otomatik verilir.
- Giriş ekranı: solda kurum kimliği (logo/ad/slogan/iletişim), sağda form; mobilde alt alta; koyu temada uyumlu. Kalp işareti artık açık zeminde de görünür (renkli yarı).
- Banka hesapları: 27 bankanın resmî ticari ünvanı otomatik gelir; şube adı ve hesap no eklendi, hesap adı/şube/hesap no düzenlenebilir (banka ve IBAN değişmez). LOGO: gerçek banka logoları telif/marka nedeniyle eklenmedi; bankanın renginde kısaltma rozeti var. İsterseniz kurum kendi logo dosyalarını yükleyebilecek şekilde genişletilir.
- Bağış Al: telefon ülke kodu listesinde sondaki "TR" kısaltması kaldırıldı (yalnızca bayrak + kod).
- Bağışçı Rehberi → Excel: "Örnek Excel dosyası" (örnek satırlar + "Nasıl yüklenir" sayfası), "Bağışçıları Excel olarak indir" (rehber + bağış sayısı/toplam/son bağış), "Excel'den aktar" (önce önizleme: yeni/atlanacak/hatalı; onaydan sonra kayıt; kayıtlı numaralar varsayılan atlanır, isteğe bağlı güncellenir — boş hücre eski bilgiyi silmez). Telefon: 0, boşluk, +90 fark etmez; yurt dışı +ülke kodu ile. En fazla 5.000 satır / ~1,8 MB, yalnızca .xlsx. xlsx okuma/yazma bağımlılıksız (xlsx.js, openpyxl ile doğrulandı). Not: Excel numaranın başındaki 0'ı silebilir; 10 haneli 5xx numaraları yine doğru okunur.
- Analiz → Saha ve Proje Analizi: "Videolu bağış projeleri" bölümü (toplam birim/pay/tutar, tamamlanan, video bekleyen, iş akışı aşamaları, son 6 ay, projelere göre aşama tablosu, ülke dağılımı, en uzun bekleyen işler). Ana sayfadaki bekleyen işlerle aynı kaynaktan (birimler_org) beslenir; yeni videolu bağış geldikçe ikisine de düşer.

## Tarama turu (18 Kas): kalıcı eser kategorisi, bildirimler, bağışçı profili, zorunlu alanlar
- Kalıcı Eser: sabit "Kalıcı Eser" ana kategorisi (silinemez). Proje kaydedilirken "Bağış Al'da alt kategori aç" işaretliyse Kalıcı Eser › proje adı alt kategorisi açılıp sayaca bağlanır; proje formunda artık tüm bağış türleri listelenmez. Zorunlu: ad, tür, ülke, hedef > 0.
- Bildirimler (mod/bildirim.js, public/m-bildirim.js): 20 sn'de bir GET /api/bildirim; zil (masaüstünde yan menü başlığında), yan menüde sayaçlar, yeni WhatsApp/gelen arama/iç mesaj/görev için sağ altta açılır bildirim, sekme başlığında (n). Sunucu yetkiye göre süzer: WhatsApp yalnızca "twa" menüsünü görenlere, arama yalnızca "cagri" menüsünü görenlere, mesaj/görev yalnızca ilgili kişiye. Onay bekleyen bağış ve banka hareketi sayacı da kendi menü yetkisine bağlı.
- Yanıt uyarısı (İletişim Ayarları → Yanıt uyarısı): okunmamış WhatsApp sayısı ≥ eşik YA DA en eski mesaj ≥ N saat YA DA bugün cevapsız arama ≥ eşik olunca seçilen kullanıcılara SMS/e-posta; tekrar aralığı; "test uyarısı" düğmesi. 5 dakikada bir kontrol. Gönderim iletişim modu ve sağlayıcıya bağlıdır (Deneme modunda yalnızca kayda yazılır). Alıcının Kullanıcı Yönetimi'nde telefon/e-postası olmalı.
- Bağışçı profili: "+ Bağış al" (bilgiler önceden dolu), bağış satırında Kategori › Tür, kurban/kuyu/videolu pay-birim-ülke-aşama-video durumu, bağlı kalıcı eser projesi; Genel bakışta "Türlere göre" tablosu (fidan, Kur'an-ı Kerim vb.).
- Öğrenci/yetim kartı: Yetim kutusu artık hazır seçili gelmez. Zorunlu: ad, cinsiyet, ülke, doğum tarihi ya da yaş, yetim/hafız (en az biri), yetimse yetimlik durumu, eğitim türü, okul/medrese seçiliyse adı. Okul/medrese adı yazılırken eski girişler önerilir; aynı ad farklı yazımla gelirse tek yazım kullanılır; listede okul filtresi ve Takip ve Raporlar → Dağılım'da okul/medreseye göre dağılım var.
- Hatalar düzeltildi: Banka Hareketleri durumu Banka Hesapları/Bağış Al ile aynı değişkeni (ST.bk) kullanıyordu → sayfa çöküyordu (ST.bkh); sayfa verisi gelmeden çizim hata verebiliyordu (artık "Yükleniyor…"); ana sayfa/iletişim bazı tarihleri UTC hesaplıyordu (gece 00:00–03:00 arası bir gün geri) → yerel saat.
- Sıradaki öneriler: kategori ad düzenleme, kullanıcı silmeyi kaldırma (yalnızca Pasife al), yetki ekranı sadeleştirme, sertifika PDF şablonu, uyarılara "bana atanmış sohbet" mantığı (WhatsApp'ta sorumlu atama), Web sitesi paneli.

## Silme/pasife alma, ad düzenleme, elle WhatsApp (18 Kas)
- Bağış silinmez (yalnızca İptal). Kullanıcı silinmez (DELETE 405), yalnızca "Pasife al". Kullanımdaki bağış türü silinemez.
- Ana kategori adı (PUT /api/kategoriler {eski,yeni}) ve alt kategori adı (PUT /api/turler/:id {ad}) değiştirilebilir; türler id ile bağlı olduğundan bağış, rapor, filtre ve organizasyonda yeni ad görünür. Kalıcı Eser ve Sponsorluk adları sistemde kullanıldığı için sabit.
- WhatsApp toplu gönderilmez: GET /api/bagislar/:id/wa ve GET /api/org/pay/:id/wa?k=b|v mesajı şablondan hazırlar, wa.me bağlantısı döner; kişi kendi WhatsApp'ında gönderir (sms_log'a 'wa:' önekiyle yazılır). Elle SMS: POST /api/bagislar/:id/sms.
- Fikir (yapılmadı): havale açıklamasını yapay zekâ ile okuyup eşleştirme; API anahtarı, dış servis ve KVKK onayı gerekir.

## Kurban vekâlet (18 Kas)
- Bağış Al'da kurban türünde "Kurban vekâleti alındı" kutusu + yöntem. Web sitesi API'si (POST /api/dis/bagis) `vekalet: true` gönderirse yöntem "Online"; bağış onaylanınca hisselere geçer.
- Organizasyon ekranında vekâlet yok (bilinçli). Takip: Raporlama › Kurban Vekâlet Raporu (menü anahtarı `vekrap`): durum, nereden geldi (Web sitesi/Panel/Banka), yöntem, tarih, arama süzgeçleri; tek ya da toplu "alındı" işareti; Excel (eksik/tüm). Yeni menü yönetim birimine otomatik açılır, diğer birimlere Yetkiler'den verilir.
- Ana sayfa "Bekleyen işler"de Kurban › "Vekâlet alınmadı" kısayolu. Bağışçı profilinde hisse bazında vekâlet ✓/yok.

## Bekleyen / not alınan işler (18 Kas, kullanıcı: "notlarım kısmını en son soracağım")
- **Gerçek video yükleme (1):** şimdilik video bağlantı olarak bağlanıyor; panele doğrudan yükleme (boyut sınırı, saklama yeri, sıkıştırma, bağışçıya güvenli bağlantı) yapılacak.
- **Havale eşleştirmede yapay zekâ (3):** ayarlardan açılan isteğe bağlı özellik; varsayılan kapalı. API anahtarı, dış servise veri gönderimi için KVKK onayı gerekir.
- **Sertifika PDF şablonu (5):** kalıcı eser ve sponsorluk için bağışçıya verilecek sertifika.
- **Kartla online bağış / aylık sponsorluk:** web sitesi bölümüne gelince ele alınacak. Plan: kart bilgisi sağlayıcının güvenli sayfasında, sonuç webhook ile CRM'e düşer; tek formda "Tek sefer / Her ay"; sponsorluk kaydında "kartla otomatik" etiketi ve çekim durumu; çağrı merkezi için ödeme bağlantısı sonra. Sağlayıcı seçimi (iyzico, PayTR vb.) ve derneklerin üye iş yeri şartları henüz netleşmedi.
- Küçük ekler: Kesildi/Açıldı/Dağıtıldı'da isteğe bağlı "SMS gönder" kutusu; tam büyükbaşta tek vekâlet seçeneği; mali modül (gelir-gider, aidat) yalnızca klasik derneklere satılacaksa.
- Tanıtım sitesi: kullanıcı düzeltmelerini yazacak; ekran görüntüleri yalnızca tanıtılan menü grubu açık olacak şekilde yeniden alınacak.

## WhatsApp sorumlu atama (18 Kas)
- Gelen kutusunda her konuşmanın sorumlusu var (tablo wa_atama). PUT /api/wa/atama {tel, kullanici_id|null}, GET /api/wa/ekip (aktif kullanıcılar). Atanmamış konuşmaya ilk yanıtı yazan kişi otomatik üstlenir. Süzgeç: Hepsi / Benim / Atanmamış; "Bana ata" düğmesi.

## Sade ekran turu (18 Kas)
- Bağış Raporları: ana süzgeçler tek satırda (durum, ana/alt kategori, tarih aralığı); ödeme yöntemi, kanal ve sorumlu "Daha fazla süzgeç" altında (süzgeç seçiliyse otomatik açık). Tarih, bağış no ve tutar tek satırda.
- Kullanıcı Yönetimi: düğmeler tek satırda, durum etiketi, "Yeni kullanıcı ekle" açılır bölüm (düzenlerken otomatik açık).
- Bağış Türleri: ana kategori ekleme tek satırda, açıklama "Videolu bağış nasıl ayarlanır?" altına alındı.
- Sıradaki sade tur adayları: Birimler ve Yetkiler, Partner Kurumlar, Banka Hesapları, Gönüllü, Sponsorluk ekranları.

## Web sitesi (18 Kas) — ilk sürüm
- Site panelden yönetilir, aynı sunucudan /site adresinde yayınlanır (mod/site.js, public/site.js, panel: public/m-site.js). Sunucuda üretilen HTML; satır içi betik yok (CSP).
- Menüler: Tasarım ve Alan Adı (sset), Sayfa Yönetimi (spage), Menü Düzeni (smenu), Bağış Formları (sform). Ayarlar `ayar` tablosunda 'site' anahtarında JSON.
- 4 tema (Klasik, Sıcak, Modern, Uygulama): aynı içerik, farklı renk/köşe/yerleşim; ana ve vurgu rengi değiştirilebilir. Hero görseli tarayıcıda 1400 px'e küçülür, ayarda saklanır (/site/img/hero).
- Ana sayfa: üst menü, karşılama + hızlı bağış kutusu, kategori kartları, gerçek sayaçlar (0 olan gizlenir), web'de göster işaretli kalıcı eser projeleri (ilerleme çubuğu), hesap numaraları, alt bilgi, WhatsApp düğmesi (Kurum Bilgileri telefonu), mobilde alt gezinme çubuğu.
- Bağış: POST /api/site/bagis (herkese açık; X-BP başlığı, IP başına 10 dk'da 8 deneme, bal kutusu alanı, KVKK onayı zorunlu). Bağış "Bekleyen" + Havale/EFT + kaynak "Web sitesi" olarak düşer; ekranda banka hesabı ve bağış no gösterilir. "Her ay" seçilirse nota "Her ay bağış talebi (site)" yazılır (otomatik tahsilat YOK). Kurbanda vekâlet kutusu → 'Online'. Tam büyükbaş ve Videolu bağış türleri sitede yok.
- Yayında değilken site herkese "Çok yakında" döner; giriş yapmış kullanıcı önizler. Alan adı tanımlıysa o Host kökte siteyi açar (DNS + HTTPS sunucu kurulumunda ayrıca).
- Yapılacak: kartla ödeme (sağlayıcı seçilince), aylık otomatik tahsilat, kurban hisse/grup seçimi ve kuyu ülke seçimi sitede, sponsor seçimi (öğrenci/yetim kartı) sitede, haber/blog, video bölümü, sayfa görselleri, SEO (başlık/açıklama/og), çerez onayı, 4 temanın ince ayarı, tema önizleme görüntüleri, hızlı bağış sepeti.

## Sertifika (18 Kas)
- Tek tasarım: /sertifika/<kod> (mod/sertifika.js, public/sertifika.js). Sertifikada bağışçı/sponsor adı, proje adı (tür adı; fiyat ve biçim ekleri ayıklanır) ve tarih var; **tutar hiç yazılmaz**. Yazdır / PDF olarak kaydet düğmesi tarayıcı yazdırmasını kullanır (A4 yatay).
- Bağış sertifikası: türde "sertifika" tikli ise onayda otomatik gider; **kabul SMS'i ile sertifika bağlantısı tek mesajdır** ('sertifika' şablonu), ayrı kabul SMS'i gitmez (SMS israfı yok). Onaydan önce/iptalde sertifika açılmaz (404). Kalıcı eser türlerinde tik kapalı kalır.
- Yeniden gönderme: bağış satırındaki SMS/WhatsApp düğmesi, sertifikalı onaylı bağışta sertifika bağlantılı mesajı hazırlar (önizlemeli); sertifikasız ya da bekleyen bağışta kabul mesajıdır.
- Sponsor: "Sponsorluk belgesi" yalnız elle gönderilir (Sponsorluklar ve Ödemeler satırında WhatsApp/SMS simgeleri, her ay SMS gitmesin diye); "Tamamlama sertifikası" öğrenci tamamlandı işaretlenirken "bildir" seçiliyse gider ve aynı tasarımı kullanır. Sponsor jetonu bağlantıdadır: /sertifika/<jeton>?k=belge|tamam.
- Bağlantı adresi son istekten öğrenilir (ctx.sonHost); gerçek alan adına geçince değişiklik gerekmez.
- Yapılacak: sertifikaya dernek mührü/imza görseli, tür başına metin, QR ile doğrulama, kurban/hisse sertifikaları.

## Sertifika Ayarları (Bağış Yönetimi menüsü)
- 3 hazır tasarım (Klasik, Modern, Zarif), 4 renk, başlık/teşekkür cümlesi, imza (ad, unvan, görsel). Dernek adı ve logosu Kurum Bilgileri'nden.
- Her bağış türünde "Sertifika" seçimi: Gönderilmesin / Klasik / Modern / Zarif (Bağış Türleri tablosundan sonradan da değişir; yeni tür formunda da var).
- Sponsorluk belgesi ve tamamlama sertifikası tasarımı ayrı seçilir; metinleri sabit. Tutar hiçbir tasarımda görünmez.
- Önizleme `/sertifika/onizleme` yalnız giriş yapmış kullanıcıya açık (panelde iframe). Yedek fikir: mühür, QR doğrulama, türe özel metin.

## Kuyu numarası / PDF tasarımları (değerlendirilecek)
- Kuyu tabelası/PDF tasarımı tek tip olsun; ölçü (genişlik/yükseklik) girişi hiç istenmesin.
- PDF tasarımlarında derneğin logosu (Kurum Bilgileri) otomatik gelsin; daha güzel, sade bir tasarım yapılsın.

## Menü düzeni (karar)
- Sertifika Ayarları, Mesaj Şablonları, İletişim Ayarları Sistem Ayarları'na taşındı (PDF Şablonları yanında). İletişim'de günlük işler kaldı.
- Banka Hesapları Kurum Yönetimi'nde kalır: derneğin kendi hesapları, ileride çağrı merkezinden bağışçıya otomatik hesap bilgisi gönderilecek.
- Rapor birleştirme ve Banka Hareketleri taşıma önerisi kabul edilmedi.

## Raporlama sadeleştirme
- Raporlama ve Analiz menüsü 3 maddeye indi: Bağış Raporları, Analiz (sekmeler: Dönemsel karşılaştırma, Bağış türü, Bağışçı, Saha ve proje, İletişim), Kurban Vekâlet Raporu.
- Yetkiler eski anahtarlarla aynı (rkarsi, rtur, rbagisci, rsaha, riletisim); kullanıcı yalnızca yetkili olduğu sekmeleri görür. Sadece bir sekmeye yetkisi olana sekme çubuğu çıkmaz.

## Tanıtım sitesi: öne çıkarılacak özellikler (mutlaka konacak)
- Tanıtım sitesi hazırlanırken en önemli özellikler mutlaka öne çıkarılacak. Taslak liste (kullanıcı onaylayacak):
  - Sade ekranlar: dernek çalışanının anlayacağı, az menülü yapı
  - Bağış alma, onay, makbuz; bağışçı rehberi
  - Kurban, su kuyusu, videolu bağış ve kalıcı eser organizasyonu; toplu işlem; bağışçıya video ve bilgi mesajı
  - Sponsorluk (öğrenci/yetim), ödeme takibi
  - Sertifika: bağış türüne göre tasarım, otomatik SMS/WhatsApp, elle yeniden gönderme
  - SMS, WhatsApp, e-posta, çağrı merkezi tek yerde
  - Banka hareketi eşleştirme
  - Web sitesi yönetimi aynı panelde (4 tema, bağış formu)
  - Rol ve birim bazlı yetki, denetim kayıtları
  - Raporlar ve analiz (dönemsel, tür, bağışçı, saha)

## KVKK: her konumda ele alınacak (hukukçuyla kontrol ettirilecek)
Karar: KVKK konuları tek tek tüm ekran ve akışlarda ele alınacak. Teknik kontrol listesi (hukuki görüş değildir):
- Rol: dernek veri sorumlusu, biz veri işleyen. Dernekle veri işleme sözleşmesi + aydınlatma metni; VERBİS durumu derneğe ait.
- Bağış alma ve web sitesi bağış formu: aydınlatma metni + açık rıza kutusu (web formunda zorunlu kutu var, panelde "Bağış Al"da yok), rıza kaydı (tarih, kaynak).
- Çerez onayı ve aydınlatma sayfası (web sitesi).
- İletişim: SMS, WhatsApp, e-posta için izin ve vazgeçme (çık) yolu; toplu mesajda ret edenlerin hariç tutulması.
- Bağışçı hakları: erişim, düzeltme, silme/anonimleştirme talebi için ekran ve süreç; saklama süreleri (mali kayıtlar yasal süre).
- Dışa aktarma (Excel, PDF): kim, ne zaman indirdi kayıt altında; yetkiye bağlı.
- Yetki ve görünürlük: kullanıcı yalnızca yetkili olduğu veriyi görür; denetim kayıtlarında kişisel veriye bakma/değiştirme izi.
- Herkese açık bağlantılar: sertifika ve sponsor bağlantıları rastgele kodlu, arama motoruna kapalı; video ve konum bağlantıları için erişim kuralı.
- Yedekler: şifreli ve süreli; canlıda veritabanı güvenliği, HTTPS.
- Üçüncü taraf aktarım: SMS/WhatsApp/banka sağlayıcıları; yurt dışına aktarım varsa (bulut, yapay zekâ) açık rıza veya uygun güvence.
- Dijital asistan (yapay zekâ): açılırsa kişisel veri dışarıdaki servise gider; derneğin sözleşmede onayı, minimum veri, yetki sınırı, kayıt tutma; varsayılan kapalı.
- Çocuk verisi: öğrenci/yetim kartlarında maskeleme (sponsor raporunda isim/foto kısıtı).
