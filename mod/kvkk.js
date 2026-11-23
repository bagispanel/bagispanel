// KVKK: aydınlatma metni, rıza kaydı, bağışçı hakları (erişim/düzeltme/silme-anonimleştirme talepleri, 30 gün süre), veri dökümü,
// anonimleştirme (mali kayıtlar kalır, kişiyle bağ kopar), dışa aktarma ve kişisel veri görüntüleme izi.
// Not: teknik koruma ve süreç aracıdır; hukuki görüş değildir. Metinler derneğin hukukçusuyla kontrol edilmelidir.
module.exports = function (ctx) {
  const { R, Err, db, A, ip, str, tx } = ctx, h = ctx.h, crypto = require('crypto');
  for (const q of ['ALTER TABLE bagiscilar ADD COLUMN riza_tarih TEXT', 'ALTER TABLE bagiscilar ADD COLUMN riza_kaynak TEXT', 'ALTER TABLE bagiscilar ADD COLUMN aydinlatma_surum INTEGER', 'ALTER TABLE bagiscilar ADD COLUMN anonim INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE bagiscilar ADD COLUMN anon_tarih TEXT']) { try { db.exec(q); } catch { /* var */ } }
  db.exec(`CREATE TABLE IF NOT EXISTS kvkk_talep(id INTEGER PRIMARY KEY, bagisci_id INTEGER, ad TEXT, tur TEXT NOT NULL, durum TEXT NOT NULL DEFAULT 'Alındı', aciklama TEXT, kaynak TEXT, sonuc TEXT,
    tarih TEXT NOT NULL, son_tarih TEXT NOT NULL, kapanis TEXT, alan TEXT, kapatan TEXT)`);
  const TURLER = ['Bilgi talebi (erişim)', 'Düzeltme', 'Silme / anonimleştirme', 'İşlemeye itiraz', 'Rıza geri çekme / iletişim iptali', 'Diğer'], DURUMLAR = ['Alındı', 'İşlemde', 'Tamamlandı', 'Reddedildi'];
  const bugun = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10), gunEkle = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const zorunlu = () => { const v = h.getA('kvkk_zorunlu', null); return v === null ? (process.env.KVKK_ZORUNLU !== '0' && process.env.DEMO !== '1') : !!v; };

  // ---- aydınlatma metni ----
  const sablon = () => { const k = h.getA('kurumb', {}), ad = k.ad || h.getA('dernek_adi', '') || '[Kurum adı]', ir = [k.tel, k.eposta].filter(Boolean).join(' · ') || '[iletişim bilgisi]', adr = k.adres || '[adres]';
    return `KİŞİSEL VERİLERİN İŞLENMESİNE İLİŞKİN AYDINLATMA METNİ

1. Veri sorumlusu
6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca kişisel verileriniz, veri sorumlusu sıfatıyla ${ad} (${adr}) tarafından aşağıda açıklanan kapsamda işlenmektedir.

2. İşlenen kişisel veriler
Ad soyad, telefon, e-posta ve adres bilgileriniz; bağış tutarı, türü, tarihi ve ödeme yöntemi; bağışınız adına yapılmış kurban, adak, su kuyusu, sponsorluk gibi işlemlere ilişkin kayıtlar; tarafımızla yaptığınız yazışma ve arama kayıtları; bağışınız için adına işlem yapılacak kişilerin adı.

3. İşleme amaçları
Bağışınızın alınması, kaydedilmesi ve makbuzunun/sertifikasının düzenlenmesi; bağışınızın ilgili projede kullanılması ve size görüntü/bilgi aktarılması; mali ve yasal yükümlülüklerin yerine getirilmesi; sizinle iletişim kurulması; izin vermeniz hâlinde kampanya ve bilgilendirme iletilerinin gönderilmesi; talep ve şikâyetlerin yanıtlanması.

4. Hukuki sebepler
Verileriniz KVKK m.5/2 uyarınca; bağış sözleşmesinin kurulması ve ifası, hukuki yükümlülüğümüzün yerine getirilmesi, bir hakkın tesisi ve kullanılması, ilgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla meşru menfaatlerimiz sebeplerine; kampanya ve tanıtım iletileri bakımından açık rızanıza dayanılarak işlenir.

5. Aktarım
Verileriniz; mevzuat gereği yetkili kamu kurum ve kuruluşlarına, bağışın ulaştırıldığı ülkedeki iş ortağı kuruluşlara (yalnızca gerekli ölçüde), mesaj gönderim, barındırma ve bankacılık hizmeti sağlayıcılarına KVKK m.8 ve m.9 koşullarında aktarılabilir.

6. Toplama yöntemi
Verileriniz telefon görüşmesi, internet sitesi bağış formu, şubelerimiz ve banka kayıtları aracılığıyla otomatik ve otomatik olmayan yollarla toplanır.

7. Saklama süresi
Verileriniz, işleme amacının gerektirdiği ve mevzuatta öngörülen süre boyunca saklanır; süre sonunda silinir, yok edilir veya anonim hâle getirilir.

8. Haklarınız (KVKK m.11)
Kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini isteme, silinmesini veya yok edilmesini isteme, itiraz etme ve zarara uğramanız hâlinde tazminat talep etme haklarına sahipsiniz. İzin verdiğiniz iletileri her zaman “ret” diyerek durdurabilirsiniz.

9. Başvuru
Taleplerinizi ${ir} üzerinden bize iletebilirsiniz. Başvurunuz en geç 30 gün içinde sonuçlandırılır.`; };
  const aydinlatma = () => { const a = h.getA('kvkk_aydinlatma', null); return a && a.metin ? a : { metin: sablon(), surum: 0, tarih: null, varsayilan: true }; };
  R('GET', '/api/kvkk/aydinlatma', null, null, async () => { const a = aydinlatma(), k = h.getA('kurumb', {}); return [200, { kurum: k.ad || h.getA('dernek_adi', ''), logo: k.logo || '', renk: /^#[0-9a-fA-F]{6}$/.test(k.renk || '') ? k.renk : '', metin: a.metin, surum: a.surum, tarih: a.tarih }]; });
  R('PUT', '/api/kvkk/aydinlatma', 'kvkk', 'd', async (c) => {
    const metin = String(c.body.metin || '').trim(); if (metin.length < 200 || metin.length > 20000) throw new Err(400, 'Aydınlatma metni 200 ile 20.000 karakter arasında olmalı.');
    const eski = aydinlatma(), a = { metin, surum: (eski.surum || 0) + 1, tarih: bugun() }; h.setA('kvkk_aydinlatma', a); A.audit(c.user, 'kvkk_aydinlatma_guncellendi', 'sürüm ' + a.surum, ip(c.req)); return [200, a];
  });
  R('POST', '/api/kvkk/aydinlatma/sifirla', 'kvkk', 'd', async (c) => { const eski = aydinlatma(), a = { metin: sablon(), surum: (eski.surum || 0) + 1, tarih: bugun() }; h.setA('kvkk_aydinlatma', a); A.audit(c.user, 'kvkk_aydinlatma_sifirlandi', 'sürüm ' + a.surum, ip(c.req)); return [200, a]; });
  R('PUT', '/api/kvkk/ayar', 'kvkk', 'd', async (c) => { h.setA('kvkk_zorunlu', !!c.body.zorunlu); A.audit(c.user, 'kvkk_ayar', 'panelde onay zorunlu: ' + (c.body.zorunlu ? 'evet' : 'hayır'), ip(c.req)); return [200, { ok: 1 }]; });

  // ---- rıza kaydı (bağış alırken) ----
  // Panelde yeni (rıza kaydı olmayan) bağışçı için "aydınlatma metni okundu/iletildi" onayı istenir. İletişim izni ayrı ve isteğe bağlıdır.
  ctx.rizaKontrol = (bg, b, kaynak) => { if (kaynak !== 'Manuel (CRM)' || !zorunlu()) return; if (bg && bg.riza_tarih) return; if (!(b.riza && b.riza.ayd)) throw new Err(400, 'Aydınlatma metni bağışçıya okundu/iletildi kutusunu işaretleyin (KVKK).'); };
  ctx.rizaKaydet = (id, b, kaynak) => {
    const r = b.riza || {}, bg = db.prepare('SELECT riza_tarih, izin FROM bagiscilar WHERE id=?').get(id); if (!bg) return;
    if (r.ayd && !bg.riza_tarih) db.prepare('UPDATE bagiscilar SET riza_tarih=?, riza_kaynak=?, aydinlatma_surum=? WHERE id=?').run(bugun(), String(r.kaynak || (kaynak === 'Manuel (CRM)' ? 'Panel (telefon/şube)' : kaynak)).slice(0, 60), aydinlatma().surum, id);
    if (r.iletisim) { let iz = {}; try { iz = bg.izin ? JSON.parse(bg.izin) : {}; } catch { /* boş */ } if (iz.sms !== 'ret') { iz.sms = 'izinli'; if (!iz.wa) iz.wa = 'izinli'; if (!iz.mail) iz.mail = 'izinli'; db.prepare('UPDATE bagiscilar SET izin=? WHERE id=?').run(JSON.stringify(iz), id); } }
  };

  // ---- kişisel veri görüntüleme izi (aynı kişi aynı bağışçı için 15 dakikada bir kez) ----
  const gor = new Map();
  ctx.kvkkIzle = (user, bagisci, req) => { const k = user.id + ':' + bagisci.id, t = Date.now(); if (t - (gor.get(k) || 0) < 900000) return; gor.set(k, t); if (gor.size > 5000) gor.clear(); A.audit(user, 'bagisci_goruntule', '#' + bagisci.id + ' ' + bagisci.ad, req ? ip(req) : null); };
  R('POST', '/api/kvkk/disa-aktar', 'auth', null, async (c) => { const ne = str(c.body.ne, 60) || 'liste', adet = Math.max(0, Math.min(1e7, Math.floor(+c.body.adet || 0))); A.audit(c.user, 'disa_aktarim', `${ne}: ${adet} satır`, ip(c.req)); return [200, { ok: 1 }]; });

  // ---- talepler ----
  const liste = () => db.prepare('SELECT * FROM kvkk_talep ORDER BY CASE WHEN durum IN (\'Tamamlandı\',\'Reddedildi\') THEN 1 ELSE 0 END, son_tarih, id DESC LIMIT 500').all().map((t) => ({ ...t, gecikti: !['Tamamlandı', 'Reddedildi'].includes(t.durum) && t.son_tarih < bugun(), kalan: Math.round((new Date(t.son_tarih + 'T12:00:00Z') - new Date(bugun() + 'T12:00:00Z')) / 864e5) }));
  R('GET', '/api/kvkk', 'kvkk', 'g', async () => {
    const a = aydinlatma(), n = (q) => db.prepare(q).get().n;
    return [200, { talepler: liste(), turler: TURLER, durumlar: DURUMLAR, aydinlatma: a, zorunlu: zorunlu(),
      sayi: { bagisci: n('SELECT COUNT(*) n FROM bagiscilar WHERE anonim=0'), rizasiz: n('SELECT COUNT(*) n FROM bagiscilar WHERE anonim=0 AND riza_tarih IS NULL'), anonim: n('SELECT COUNT(*) n FROM bagiscilar WHERE anonim=1'), acik: n("SELECT COUNT(*) n FROM kvkk_talep WHERE durum NOT IN ('Tamamlandı','Reddedildi')"), geciken: n("SELECT COUNT(*) n FROM kvkk_talep WHERE durum NOT IN ('Tamamlandı','Reddedildi') AND son_tarih<'" + bugun() + "'") },
      yedekSifreli: !!process.env.BACKUP_KEY, https: /^https:/i.test(process.env.PUBLIC_URL || '') }];
  });
  R('POST', '/api/kvkk/talep', 'kvkk|bagisci', 'e', async (c) => {
    const b = c.body, tur = TURLER.includes(b.tur) ? b.tur : null; if (!tur) throw new Err(400, 'Talep türünü seçin.');
    let bg = null; if (b.bagisci_id) { bg = db.prepare('SELECT id,ad FROM bagiscilar WHERE id=?').get(+b.bagisci_id); if (!bg) throw new Err(404, 'Bağışçı bulunamadı.'); }
    const ad = bg ? bg.ad : str(b.ad, 80); if (!ad) throw new Err(400, 'Talep sahibinin adını yazın.');
    const t = bugun(), id = +db.prepare('INSERT INTO kvkk_talep(bagisci_id,ad,tur,aciklama,kaynak,tarih,son_tarih) VALUES(?,?,?,?,?,?,?)').run(bg ? bg.id : null, ad, tur, str(b.aciklama, 1000) || null, str(b.kaynak, 40) || 'Telefon', t, gunEkle(t, 30)).lastInsertRowid;
    A.audit(c.user, 'kvkk_talep_alindi', `#${id} ${tur}`, ip(c.req)); return [201, { id, son_tarih: gunEkle(t, 30) }];
  });
  R('PUT', '/api/kvkk/talep/([0-9]+)', 'kvkk', 'd', async (c) => {
    const x = db.prepare('SELECT * FROM kvkk_talep WHERE id=?').get(+c.m[1]); if (!x) throw new Err(404, 'Talep yok.'); const d = DURUMLAR.includes(c.body.durum) ? c.body.durum : x.durum, kapali = ['Tamamlandı', 'Reddedildi'].includes(d);
    if (kapali && !str(c.body.sonuc, 500) && !x.sonuc) throw new Err(400, 'Kapatırken sonucu / gerekçeyi yazın.');
    db.prepare('UPDATE kvkk_talep SET durum=?, sonuc=COALESCE(?,sonuc), kapanis=?, kapatan=? WHERE id=?').run(d, str(c.body.sonuc, 500) || null, kapali ? bugun() : null, kapali ? c.user.kadi : null, x.id);
    A.audit(c.user, 'kvkk_talep_' + (kapali ? 'kapandi' : 'guncellendi'), `#${x.id} ${d}`, ip(c.req)); return [200, { ok: 1 }];
  });

  // ---- erişim hakkı: bağışçının tüm verisi ----
  const dokum = (id) => {
    const b = db.prepare('SELECT id,ad,tel,eposta,adres,kayit,izin,riza_tarih,riza_kaynak,aydinlatma_surum FROM bagiscilar WHERE id=?').get(id); if (!b) throw new Err(404, 'Bağışçı yok.');
    const q = (s, ...p) => { try { return db.prepare(s).all(...p); } catch { return []; } };
    return { olusturma: new Date().toISOString(), bagisci: { ...b, izin: b.izin ? JSON.parse(b.izin) : {} },
      bagislar: q('SELECT g.no, g.tarih, t.ad tur, g.adet, g.para, g.tutar, g.tl, g.odeme, g.durum, g.adina_ad, g.adina_tel, g.notu, g.iptal_sebep FROM bagislar g JOIN bagis_turleri t ON t.id=g.tur_id WHERE g.bagisci_id=? ORDER BY g.id', id),
      sponsorluklar: q('SELECT s.id, o.ad ogrenci, s.baslangic, s.sure, s.aylik, s.para, s.durum FROM sp_sponsorluk s JOIN sp_ogrenci o ON o.id=s.ogrenci_id WHERE s.bagisci_id=?', id),
      gonderilenMesajlar: q('SELECT zaman, sablon, mesaj FROM sms_log WHERE kime=? ORDER BY id DESC LIMIT 500', b.ad),
      talepler: q('SELECT tarih, tur, durum, sonuc FROM kvkk_talep WHERE bagisci_id=?', id) };
  };
  R('GET', '/api/kvkk/dokum/([0-9]+)', 'bagisci', 'd', async (c) => { const d = dokum(+c.m[1]); A.audit(c.user, 'kvkk_veri_dokumu', '#' + c.m[1], ip(c.req)); return [200, { ad: 'veri-dokumu-' + c.m[1] + '.json', dosya: Buffer.from(JSON.stringify(d, null, 2), 'utf8').toString('base64') }]; });

  // ---- silme hakkı: anonimleştirme (mali kayıtlar kalır, kişiyle bağ kopar) ----
  R('POST', '/api/kvkk/anonimlestir/([0-9]+)', 'bagisci', 's', async (c) => {
    const id = +c.m[1], b = db.prepare('SELECT * FROM bagiscilar WHERE id=?').get(id); if (!b) throw new Err(404, 'Bağışçı yok.'); if (b.anonim) throw new Err(409, 'Bu kişi zaten anonimleştirilmiş.');
    const neden = str(c.body.neden, 300); if (!neden) throw new Err(400, 'Nedenini (örn. “KVKK silme talebi, 12.03”) yazın.');
    if (db.prepare("SELECT 1 FROM sp_sponsorluk WHERE bagisci_id=? AND durum='Aktif'").get(id)) throw new Err(409, 'Aktif sponsorluğu var. Önce sponsorluğu iptal edin, sonra anonimleştirin.');
    const eskiAd = b.ad, eskiTel = b.tel, gizli = 'anon-' + id + '-' + crypto.randomBytes(4).toString('hex');
    tx(() => {
      db.prepare("UPDATE bagiscilar SET ad=?, tel=?, eposta=NULL, adres=NULL, izin=?, anonim=1, anon_tarih=? WHERE id=?").run('Anonim bağışçı #' + id, gizli, JSON.stringify({ sms: 'ret', ara: 'ret', wa: 'ret', mail: 'ret' }), bugun(), id);
      const bg = db.prepare('SELECT id, secenek FROM bagislar WHERE bagisci_id=?').all(id);
      for (const x of bg) { let s = {}; try { s = JSON.parse(x.secenek || '{}'); } catch { /* boş */ } if (Array.isArray(s.names)) s.names = s.names.map(() => ({ n: 'Anonim', ph: '' })); db.prepare("UPDATE bagislar SET adina_ad=CASE WHEN adina_ad IS NULL THEN NULL ELSE 'Anonim' END, adina_tel=NULL, notu=NULL, sert_kod=NULL, secenek=? WHERE id=?").run(JSON.stringify(s), x.id); }
      db.prepare("UPDATE paylar SET ad='Anonim', tel=NULL, vtoken=NULL WHERE bagis_id IN (SELECT id FROM bagislar WHERE bagisci_id=?)").run(id);
      db.prepare("UPDATE sms_log SET mesaj='[KVKK: anonimleştirildi]', kime='Anonim bağışçı #' || ? WHERE kime=?").run(id, eskiAd);
      try { db.prepare('DELETE FROM wa_mesaj WHERE tel=?').run(eskiTel); db.prepare('DELETE FROM wa_atama WHERE tel=?').run(eskiTel); } catch { /* wa yok */ }
      try { db.prepare("UPDATE sp_sponsorluk SET token=lower(hex(randomblob(12))) WHERE bagisci_id=?").run(id); } catch { /* sponsor yok */ }
      db.prepare("UPDATE kvkk_talep SET ad='Anonim bağışçı #'||? WHERE bagisci_id=?").run(id, id);
      if (c.body.talep_id) db.prepare("UPDATE kvkk_talep SET durum='Tamamlandı', sonuc=?, kapanis=?, kapatan=? WHERE id=? AND durum NOT IN ('Tamamlandı','Reddedildi')").run('Anonimleştirildi: ' + neden, bugun(), c.user.kadi, +c.body.talep_id);
    });
    A.audit(c.user, 'kvkk_anonimlestirildi', `#${id} · ${neden}`, ip(c.req)); return [200, { ok: 1, msg: 'Anonimleştirildi. Bağış tutarları raporlarda kalır, kişi bilgisi geri getirilemez.' }];
  });
};
