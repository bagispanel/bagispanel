// Sponsorluk yönetimi: öğrenci / yetim / hafız kartları, sponsor (bağışçı) atama, taksit-ödeme takibi, gecikme raporu ve hatırlatma,
// sponsora giden kart linki, tamamlanınca sertifika. Ödemeler gerçek bağış kaydı olarak (Sponsorluk kategorisi) işlenir.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
module.exports = function (ctx) {
  const { R, Err, db, str, ip, A, usage } = ctx, h = ctx.h;
  const UP = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'uploads', 'sponsor'); fs.mkdirSync(UP, { recursive: true });
  db.exec(`CREATE TABLE IF NOT EXISTS sp_ogrenci(id INTEGER PRIMARY KEY, ad TEXT NOT NULL, cinsiyet TEXT, ulke TEXT, bolge TEXT, kimlik TEXT, dogum TEXT, yas_elle INTEGER,
    yetim INTEGER NOT NULL DEFAULT 0, hafiz INTEGER NOT NULL DEFAULT 0, yetim_durum TEXT, vasi TEXT, okul_tur TEXT, okul_ad TEXT, sinif TEXT, cuz INTEGER NOT NULL DEFAULT 0, ayet TEXT, hoca TEXT,
    yer TEXT NOT NULL DEFAULT 'Dernek', durum TEXT NOT NULL DEFAULT 'Aktif', tamam_tur TEXT, tamam_tarih TEXT, notlar TEXT, kayit TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS sp_medya(id INTEGER PRIMARY KEY, ogrenci_id INTEGER NOT NULL, tip TEXT NOT NULL, ad TEXT NOT NULL, dosya TEXT NOT NULL, boyut INTEGER NOT NULL, profil INTEGER NOT NULL DEFAULT 0, kayit TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS sp_not(id INTEGER PRIMARY KEY, ogrenci_id INTEGER NOT NULL, metin TEXT NOT NULL, bildirildi INTEGER NOT NULL DEFAULT 0, kullanici TEXT, kayit TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS sp_sponsorluk(id INTEGER PRIMARY KEY, ogrenci_id INTEGER NOT NULL, bagisci_id INTEGER NOT NULL, tur_id INTEGER NOT NULL, baslangic TEXT NOT NULL, sure INTEGER NOT NULL, aylik REAL NOT NULL, para TEXT NOT NULL DEFAULT 'TL',
    tip TEXT NOT NULL DEFAULT 'Aylık', durum TEXT NOT NULL DEFAULT 'Aktif', token TEXT NOT NULL UNIQUE, son_hatirlatma TEXT, iptal_tarih TEXT, kayit TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS sp_odeme(id INTEGER PRIMARY KEY, sponsorluk_id INTEGER NOT NULL, bagis_id INTEGER, tutar REAL NOT NULL, tarih TEXT NOT NULL, kayit TEXT NOT NULL DEFAULT (datetime('now','localtime')));`);
  const CONST = { yetim_durum: ['Babasız (yetim)', 'Anasız', 'Anne ve babasız'], okul_tur: ['Okul', 'Medrese', 'Hafızlık kursu', 'Henüz okula gitmiyor'], cinsiyet: ['Erkek', 'Kız'], durum: ['Aktif', 'Tamamladı', 'Ayrıldı'], tamam: ['Eğitimi', 'Hafızlığı'], para: ['TL', 'USD', 'EUR'], sure: [12, 18, 24, 36] };
  // Sponsorluk bağış türleri (ödemeler bağış raporlarında görünsün)
  db.prepare("INSERT OR IGNORE INTO kategoriler(ad) VALUES('Sponsorluk')").run();
  ['Yetim Sponsorluğu', 'Hafız Sponsorluğu', 'Öğrenci Sponsorluğu'].forEach(a => db.prepare("INSERT OR IGNORE INTO bagis_turleri(kat,ad) VALUES('Sponsorluk',?)").run(a));
  const TPL = { spatama: ['Sponsorluk başladı', 'Sponsorluk tanımlanınca sponsora kart linkiyle gider.', 'Sayın {ad}, {ogrenci} için {tur} başlamıştır. Kartı görmek için: {link} Havale açıklamasına {kod} yazmanızı rica ederiz. {dernek}'],
    sphatirla: ['Sponsorluk ödeme hatırlatma', 'Ödemesi gecikenlere gider.', 'Sayın {ad}, {ogrenci} sponsorluğunuza ait {ay} aylık ödemeniz ({tutar}) görünmüyor. Hatırlatmak isteriz. {dernek}'],
    spgelisme: ['Sponsorluk gelişme', 'Öğrenciyle ilgili gelişme notu sponsora iletilirken gider.', 'Sayın {ad}, {ogrenci} hakkında gelişme: {not} Kart: {link} {dernek}'],
    sptamam: ['Sponsorluk tamamlandı', 'Eğitim/hafızlık bitince sertifika linkiyle gider.', 'Sayın {ad}, {ogrenci} {tamam} tamamlamıştır, teşekkür ederiz. Sertifikanız: {link} {dernek}'] };
  Object.entries(TPL).forEach(([k, v]) => db.prepare('INSERT OR IGNORE INTO sms_sablon(k,ad,n,m) VALUES(?,?,?,?)').run(k, v[0], v[1], v[2]));
  usage.partner.push((ad) => db.prepare('SELECT COUNT(*) n FROM sp_ogrenci WHERE yer=?').get(ad).n);
  usage.ulke.push((ad) => db.prepare('SELECT COUNT(*) n FROM sp_ogrenci WHERE ulke=?').get(ad).n);
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10), dstr = (s) => s ? String(s).slice(0, 10).split('-').reverse().join('.') : '-';
  const num = (v, ad, max) => { if (v === '' || v == null) return 0; const n = +String(v).replace(',', '.'); if (!isFinite(n) || n < 0 || n > (max || 1e9)) throw new Err(400, ad + ' geçersiz.'); return n; };
  const dt = (v, ad) => { v = String(v || '').trim(); if (!v) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v))) throw new Err(400, ad + ' geçersiz.'); return v; };
  const yasHesap = (o) => { if (o.dogum) { const b = new Date(o.dogum), n = new Date(); let y = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) y--; return y; } return o.yas_elle == null ? null : o.yas_elle; };
  const dernek = () => ctx.h.getA('dernek_adi', '[Dernek adı]');
  const baseUrl = (req) => { const h = req && req.headers && req.headers.host; if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, ''); if (!h || (h === 'localhost' && ctx.sonHost)) return ctx.sonHost || 'http://localhost'; const p = req.headers['x-forwarded-proto'] || 'http'; return `${p}://${h}`; }; // zamanlayıcı (istek yok) en son görülen adresi kullanır
  // ---- ödeme/taksit hesabı
  function hesap(s, now) {
    now = now || today(); const od = db.prepare('SELECT COALESCE(SUM(tutar),0) t, COUNT(*) n, MAX(tarih) son FROM sp_odeme WHERE sponsorluk_id=?').get(s.id);
    const b = new Date(s.baslangic), n = new Date(now); let k = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth() + (n.getDate() >= b.getDate() ? 1 : 0); if (n < b) k = 0;
    const due = s.tip === 'Peşin' ? s.sure : Math.max(0, Math.min(s.sure, k)), toplam = s.aylik * s.sure, bek = s.aylik * due, fark = Math.round((bek - od.t) * 100) / 100;
    const gec = fark > 0.5 ? Math.ceil(fark / s.aylik - 1e-9) : 0, bit = new Date(b); bit.setMonth(bit.getMonth() + s.sure); const bitis = bit.toISOString().slice(0, 10);
    let odurum = s.durum === 'İptal' ? 'İptal' : od.t >= toplam - 0.5 ? 'Tamamen ödendi' : gec >= 1 ? 'Gecikmiş' : 'Güncel';
    return { odenen: Math.round(od.t * 100) / 100, odeme_adet: od.n, son_odeme: od.son, toplam, beklenen: bek, fark: Math.max(0, fark), gecikme_ay: gec, yuzde: toplam ? Math.min(100, Math.round(od.t / toplam * 1000) / 10) : 0, bitis, kalan_gun: Math.round((new Date(bitis) - n) / 864e5), odeme_durum: odurum };
  }
  const kodu = (id) => 'SP' + String(id).padStart(4, '0');
  const sRow = (s) => { const o = db.prepare('SELECT id,ad,ulke,yer FROM sp_ogrenci WHERE id=?').get(s.ogrenci_id) || {}, b = db.prepare('SELECT ad,tel FROM bagiscilar WHERE id=?').get(s.bagisci_id) || {}; return { ...s, token: undefined, kod: kodu(s.id), ogrenci: o.ad, ulke: o.ulke, yer: o.yer, sponsor: b.ad, tel: b.tel, tur: (db.prepare('SELECT ad FROM bagis_turleri WHERE id=?').get(s.tur_id) || {}).ad, ...hesap(s) }; };
  const oRow = (o) => { const sp = db.prepare("SELECT * FROM sp_sponsorluk WHERE ogrenci_id=? AND durum='Aktif'").all(o.id), f = db.prepare('SELECT id FROM sp_medya WHERE ogrenci_id=? AND tip=\'foto\' ORDER BY profil DESC,id LIMIT 1').get(o.id); return { ...o, yas: yasHesap(o), aktif_sponsor: sp.length, foto: f ? f.id : null, sponsorlu: sp.length > 0, gecikmis: sp.filter(x => hesap(x).gecikme_ay >= 1).length }; };
  const ogr = (id) => { const o = db.prepare('SELECT * FROM sp_ogrenci WHERE id=?').get(id); if (!o) throw new Err(404, 'Kayıt bulunamadı.'); return o; };
  const spo = (id) => { const s = db.prepare('SELECT * FROM sp_sponsorluk WHERE id=?').get(id); if (!s) throw new Err(404, 'Sponsorluk bulunamadı.'); return s; };
  function oku(b) {
    const o = {}; o.ad = str(b.ad, 100); if (!o.ad) throw new Err(400, 'Ad soyad zorunlu.');
    o.cinsiyet = CONST.cinsiyet.includes(b.cinsiyet) ? b.cinsiyet : null; if (!o.cinsiyet) throw new Err(400, 'Cinsiyet zorunlu.'); o.ulke = str(b.ulke, 60) || null; if (!o.ulke) throw new Err(400, 'Ülke zorunlu (sponsora gösterilir).'); if (o.ulke && !db.prepare('SELECT 1 FROM ulkeler WHERE ad=?').get(o.ulke)) throw new Err(400, 'Ülke listede yok (Sistem Ayarları → Ülkeler).'); o.bolge = str(b.bolge, 120) || null;
    o.kimlik = str(b.kimlik, 30) || null; o.dogum = dt(b.dogum, 'Doğum tarihi'); if (o.dogum && o.dogum > today()) throw new Err(400, 'Doğum tarihi gelecekte olamaz.'); o.yas_elle = !o.dogum && b.yas_elle !== '' && b.yas_elle != null ? Math.round(num(b.yas_elle, 'Yaş', 80)) : null; if (!o.dogum && o.yas_elle == null) throw new Err(400, 'Doğum tarihi ya da yaş zorunlu.');
    o.yetim = b.yetim ? 1 : 0; o.hafiz = b.hafiz ? 1 : 0; if (!o.yetim && !o.hafiz) throw new Err(400, 'En az birini seçin: yetim veya hafız.');
    o.yetim_durum = o.yetim && CONST.yetim_durum.includes(b.yetim_durum) ? b.yetim_durum : null; if (o.yetim && !o.yetim_durum) throw new Err(400, 'Yetimlik durumunu seçin.'); o.vasi = o.yetim ? str(b.vasi, 100) || null : null;
    o.okul_tur = CONST.okul_tur.includes(b.okul_tur) ? b.okul_tur : null; if (!o.okul_tur) throw new Err(400, 'Eğitim türünü seçin (okul, medrese…).'); o.okul_ad = str(b.okul_ad, 120).replace(/\s+/g, ' ') || null;
    if (o.okul_tur !== 'Henüz okula gitmiyor' && !o.okul_ad) throw new Err(400, o.okul_tur + ' adı zorunlu.'); if (o.okul_tur === 'Henüz okula gitmiyor') o.okul_ad = null;
    if (o.okul_ad) { const nk = (v) => String(v).toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim(), m = db.prepare('SELECT DISTINCT okul_ad FROM sp_ogrenci WHERE okul_ad IS NOT NULL').all().find(x => nk(x.okul_ad) === nk(o.okul_ad)); if (m) o.okul_ad = m.okul_ad; } o.sinif = str(b.sinif, 40) || null; // aynı okul/medrese tek yazımla tutulur (raporlama)
    o.cuz = o.hafiz ? Math.round(num(b.cuz, 'Cüz', 30)) : 0; o.ayet = o.hafiz ? str(b.ayet, 120) || null : null; o.hoca = str(b.hoca, 100) || null;
    o.yer = str(b.yer, 120) || 'Dernek'; if (o.yer !== 'Dernek' && !db.prepare('SELECT 1 FROM partnerler WHERE ad=?').get(o.yer)) throw new Err(400, 'Partner kurum bulunamadı (Kurum Yönetimi → Partner Kurumlar).');
    o.notlar = str(b.notlar, 800) || null; return o;
  }
  const K = ['ad', 'cinsiyet', 'ulke', 'bolge', 'kimlik', 'dogum', 'yas_elle', 'yetim', 'hafiz', 'yetim_durum', 'vasi', 'okul_tur', 'okul_ad', 'sinif', 'cuz', 'ayet', 'hoca', 'yer', 'notlar'];
  // ---- öğrenci kartları
  R('GET', '/api/sp/ogrenci', 'spogr|sptak', 'g', async (c) => {
    const p = new URL(c.req.url, 'http://x').searchParams, q = (p.get('q') || '').toLocaleLowerCase('tr'), f = (k) => { const v = p.get(k); return v && v !== 'Tümü' ? v : null; };
    let L = db.prepare('SELECT * FROM sp_ogrenci ORDER BY id DESC').all().map(oRow);
    if (q) L = L.filter(x => [x.ad, x.ulke, x.bolge, x.okul_ad].some(v => String(v || '').toLocaleLowerCase('tr').includes(q)));
    if (f('ulke')) L = L.filter(x => x.ulke === f('ulke')); if (f('okul')) L = L.filter(x => x.okul_ad === f('okul')); if (f('yer')) L = L.filter(x => x.yer === f('yer')); if (f('durum')) L = L.filter(x => x.durum === f('durum'));
    if (f('tur') === 'yetim') L = L.filter(x => x.yetim); if (f('tur') === 'hafiz') L = L.filter(x => x.hafiz); if (f('sponsor') === 'var') L = L.filter(x => x.sponsorlu); if (f('sponsor') === 'yok') L = L.filter(x => !x.sponsorlu && x.durum === 'Aktif');
    const all = db.prepare('SELECT * FROM sp_ogrenci').all().map(oRow);
    return [200, { liste: L, ozet: { toplam: all.length, yetim: all.filter(x => x.yetim).length, hafiz: all.filter(x => x.hafiz).length, bekleyen: all.filter(x => !x.sponsorlu && x.durum === 'Aktif').length, sponsorlu: all.filter(x => x.sponsorlu).length },
      okullar: db.prepare("SELECT okul_tur tur, okul_ad ad, COUNT(*) n FROM sp_ogrenci WHERE okul_ad IS NOT NULL GROUP BY okul_ad ORDER BY n DESC, okul_ad").all(), sabit: CONST, ulkeler: db.prepare('SELECT ad FROM ulkeler ORDER BY ad').all().map(x => x.ad), partnerler: db.prepare('SELECT ad FROM partnerler WHERE aktif=1 ORDER BY ad').all().map(x => x.ad) }];
  });
  R('GET', '/api/sp/ogrenci/([0-9]+)', 'spogr|sptak', 'g', async (c) => { const o = ogr(+c.m[1]); return [200, { ...oRow(o), medya: db.prepare('SELECT id,tip,ad,boyut,profil,kayit,dosya FROM sp_medya WHERE ogrenci_id=? ORDER BY profil DESC,id DESC').all(o.id).map(m => ({ ...m, dosya: undefined })), notlar_liste: db.prepare('SELECT * FROM sp_not WHERE ogrenci_id=? ORDER BY id DESC').all(o.id),
    sponsorluklar: db.prepare('SELECT * FROM sp_sponsorluk WHERE ogrenci_id=? ORDER BY id DESC').all(o.id).map(sRow) }]; });
  R('POST', '/api/sp/ogrenci', 'spogr', 'e', async (c) => { const o = oku(c.body || {}); const id = +db.prepare(`INSERT INTO sp_ogrenci(${K.join(',')}) VALUES(${K.map(() => '?').join(',')})`).run(...K.map(k => o[k])).lastInsertRowid; A.audit(c.user, 'sponsor_ogrenci_eklendi', o.ad, ip(c.req)); return [201, { id }]; });
  R('PUT', '/api/sp/ogrenci/([0-9]+)', 'spogr', 'd', async (c) => { const id = ogr(+c.m[1]).id, o = oku(c.body || {}); db.prepare(`UPDATE sp_ogrenci SET ${K.map(k => k + '=?').join(',')} WHERE id=?`).run(...K.map(k => o[k]), id); A.audit(c.user, 'sponsor_ogrenci_guncellendi', o.ad, ip(c.req)); return [200, { ok: 1 }]; });
  R('DELETE', '/api/sp/ogrenci/([0-9]+)', 'spogr', 's', async (c) => {
    const o = ogr(+c.m[1]); if (db.prepare('SELECT 1 FROM sp_sponsorluk WHERE ogrenci_id=?').get(o.id)) throw new Err(409, 'Sponsorluk kaydı olan öğrenci silinemez; durumunu “Ayrıldı” yapın.');
    db.prepare('SELECT dosya FROM sp_medya WHERE ogrenci_id=?').all(o.id).forEach(m => { try { fs.unlinkSync(path.join(UP, path.basename(m.dosya))); } catch (x) {} }); db.prepare('DELETE FROM sp_medya WHERE ogrenci_id=?').run(o.id); db.prepare('DELETE FROM sp_not WHERE ogrenci_id=?').run(o.id); db.prepare('DELETE FROM sp_ogrenci WHERE id=?').run(o.id); A.audit(c.user, 'sponsor_ogrenci_silindi', o.ad, ip(c.req)); return [200, { ok: 1 }];
  });
  // ---- fotoğraf / video / belge
  const MAGIC = { jpeg: (b) => b[0] === 0xff && b[1] === 0xd8, png: (b) => b[0] === 0x89 && b[1] === 0x50, webp: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP', mp4: (b) => b.slice(4, 8).toString() === 'ftyp', webm: (b) => b[0] === 0x1a && b[1] === 0x45, pdf: (b) => b.slice(0, 5).toString() === '%PDF-' };
  R('POST', '/api/sp/ogrenci/([0-9]+)/medya', 'spogr', 'd', async (c) => {
    const o = ogr(+c.m[1]), b = c.body || {}, ad = str(b.ad, 120) || 'dosya', m = /^data:(image\/(?:jpeg|png|webp)|video\/(?:mp4|webm)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.veri || '')); if (!m) throw new Err(400, 'Yalnızca JPEG, PNG, WEBP, MP4, WEBM veya PDF yüklenebilir.');
    const t = m[1].split('/')[1], buf = Buffer.from(m[2], 'base64'), lim = t === 'mp4' || t === 'webm' ? 1.8e6 : 1.5e6; if (buf.length > lim) throw new Err(413, `Dosya en çok ${lim / 1e6} MB olabilir.`); if (!MAGIC[t](buf)) throw new Err(400, 'Dosya içeriği türüyle uyuşmuyor.');
    if (db.prepare('SELECT COUNT(*) n FROM sp_medya WHERE ogrenci_id=?').get(o.id).n >= 30) throw new Err(400, 'Bir öğrenciye en çok 30 dosya eklenebilir.');
    const tip = t === 'pdf' ? 'belge' : m[1].startsWith('video') ? 'video' : 'foto', name = `${o.id}-${crypto.randomBytes(6).toString('hex')}.${t === 'jpeg' ? 'jpg' : t}`; fs.writeFileSync(path.join(UP, name), buf);
    const ilk = tip === 'foto' && !db.prepare("SELECT 1 FROM sp_medya WHERE ogrenci_id=? AND tip='foto'").get(o.id), id = +db.prepare('INSERT INTO sp_medya(ogrenci_id,tip,ad,dosya,boyut,profil) VALUES(?,?,?,?,?,?)').run(o.id, tip, ad, name, buf.length, ilk ? 1 : 0).lastInsertRowid; return [201, { id, tip }];
  });
  const med = (id) => { const m = db.prepare('SELECT * FROM sp_medya WHERE id=?').get(id); if (!m) throw new Err(404, 'Dosya yok.'); return m; };
  R('GET', '/api/sp/medya/([0-9]+)', 'spogr|sptak', 'g', async (c) => [200, { raw: path.join(UP, path.basename(med(+c.m[1]).dosya)) }]);
  R('DELETE', '/api/sp/medya/([0-9]+)', 'spogr', 'd', async (c) => { const m = med(+c.m[1]); try { fs.unlinkSync(path.join(UP, path.basename(m.dosya))); } catch (x) {} db.prepare('DELETE FROM sp_medya WHERE id=?').run(m.id); if (m.profil) { const n = db.prepare("SELECT id FROM sp_medya WHERE ogrenci_id=? AND tip='foto' ORDER BY id LIMIT 1").get(m.ogrenci_id); if (n) db.prepare('UPDATE sp_medya SET profil=1 WHERE id=?').run(n.id); } return [200, { ok: 1 }]; });
  R('PUT', '/api/sp/medya/([0-9]+)/profil', 'spogr', 'd', async (c) => { const m = med(+c.m[1]); if (m.tip !== 'foto') throw new Err(400, 'Yalnızca fotoğraf profil olabilir.'); db.prepare('UPDATE sp_medya SET profil=0 WHERE ogrenci_id=?').run(m.ogrenci_id); db.prepare('UPDATE sp_medya SET profil=1 WHERE id=?').run(m.id); return [200, { ok: 1 }]; });
  // ---- sponsorlara mesaj (SMS) yardımcıları
  const aktifler = (oid) => db.prepare("SELECT * FROM sp_sponsorluk WHERE ogrenci_id=? AND durum='Aktif'").all(oid);
  ctx.baseUrl = baseUrl;
  const sk = (s, req) => ({ ...s, link: baseUrl(req) + '/sponsor.html?t=' + s.token });
  function bildir(key, s, req, user, ek, kuru) { const b = db.prepare('SELECT ad,tel FROM bagiscilar WHERE id=?').get(s.bagisci_id), o = ogr(s.ogrenci_id), t = db.prepare('SELECT ad FROM bagis_turleri WHERE id=?').get(s.tur_id); const v = { ad: b.ad, ogrenci: o.ad, tur: t ? t.ad : 'sponsorluk', link: ek && ek.sertifika ? baseUrl(req) + '/sertifika/' + s.token + '?k=tamam' : sk(s, req).link, kod: kodu(s.id), ...(ek || {}) }; if (kuru) return { mesaj: ctx.smsMetin(key, v), tel: b.tel, ad: b.ad }; return ctx.sms(key, v, b.ad, user, b.tel); }
  R('POST', '/api/sp/sponsorluk/([0-9]+)/belge', 'sptak', 'e', async (c) => { // sponsorluk belgesini elle gönder (SMS ya da WhatsApp)
    const s = db.prepare('SELECT * FROM sp_sponsorluk WHERE id=?').get(+c.m[1]); if (!s) throw new Err(404, 'Sponsorluk bulunamadı.');
    const b = db.prepare('SELECT ad,tel FROM bagiscilar WHERE id=?').get(s.bagisci_id), o = ogr(s.ogrenci_id), v = { ad: b.ad, ogrenci: o.ad, link: baseUrl(c.req) + '/sertifika/' + s.token + '?k=belge' };
    if (String(b.tel || '').replace(/\D/g, '').length < 7) throw new Err(409, 'Sponsorun geçerli telefonu yok.');
    if ((c.body || {}).k === 'wa') return [200, ctx.wa('spbelge', v, b.ad, c.user.kadi, b.tel)];
    ctx.sms('spbelge', v, b.ad, c.user.kadi, b.tel); return [200, { ok: 1 }];
  });
  R('POST', '/api/sp/ogrenci/([0-9]+)/not', 'spogr', 'd', async (c) => {
    const o = ogr(+c.m[1]), b = c.body || {}, metin = str(b.metin, 500); if (!metin) throw new Err(400, 'Gelişme notunu yazın.');
    if (o.hafiz && b.cuz !== '' && b.cuz != null) db.prepare('UPDATE sp_ogrenci SET cuz=? WHERE id=?').run(Math.round(num(b.cuz, 'Cüz', 30)), o.id); if (o.hafiz && b.ayet) db.prepare('UPDATE sp_ogrenci SET ayet=? WHERE id=?').run(str(b.ayet, 120), o.id);
    let n = 0; if (b.bildir) aktifler(o.id).forEach(s => { bildir('spgelisme', s, c.req, c.user.kadi, { not: metin }); n++; });
    db.prepare('INSERT INTO sp_not(ogrenci_id,metin,bildirildi,kullanici) VALUES(?,?,?,?)').run(o.id, metin, n, c.user.ad); return [201, { bildirilen: n }];
  });
  R('DELETE', '/api/sp/not/([0-9]+)', 'spogr', 'd', async (c) => { db.prepare('DELETE FROM sp_not WHERE id=?').run(+c.m[1]); return [200, { ok: 1 }]; });
  R('POST', '/api/sp/ogrenci/([0-9]+)/tamamla', 'spogr', 'd', async (c) => {
    const o = ogr(+c.m[1]), b = c.body || {}, tur = CONST.tamam.includes(b.tur) ? b.tur : (o.hafiz ? 'Hafızlığı' : 'Eğitimi'), tarih = dt(b.tarih, 'Tarih') || today();
    db.prepare("UPDATE sp_ogrenci SET durum='Tamamladı', tamam_tur=?, tamam_tarih=?, cuz=CASE WHEN hafiz=1 AND ?='Hafızlığı' THEN 30 ELSE cuz END WHERE id=?").run(tur, tarih, tur, o.id);
    let n = 0; if (b.bildir) aktifler(o.id).forEach(s => { bildir('sptamam', s, c.req, c.user.kadi, { tamam: tur === 'Hafızlığı' ? 'hafızlığını' : 'eğitimini', sertifika: 1 }); n++; });
    A.audit(c.user, 'sponsor_tamamlandi', o.ad + ' ' + tur, ip(c.req)); return [200, { bildirilen: n }];
  });
  R('POST', '/api/sp/ogrenci/([0-9]+)/yeniden-ac', 'spogr', 'd', async (c) => { const o = ogr(+c.m[1]); db.prepare("UPDATE sp_ogrenci SET durum='Aktif', tamam_tur=NULL, tamam_tarih=NULL WHERE id=?").run(o.id); return [200, { ok: 1 }]; });
  R('PUT', '/api/sp/ogrenci/([0-9]+)/durum', 'spogr', 'd', async (c) => { const o = ogr(+c.m[1]), d = String((c.body || {}).durum || ''); if (!['Aktif', 'Ayrıldı'].includes(d)) throw new Err(400, 'Durum geçersiz.'); db.prepare('UPDATE sp_ogrenci SET durum=? WHERE id=?').run(d, o.id); return [200, { ok: 1 }]; });
  // ---- sponsorluk tanımlama ve ödeme
  R('GET', '/api/sp/bagisci-ara', 'sptak', 'e', async (c) => { const q = (new URL(c.req.url, 'http://x').searchParams.get('q') || '').trim().toLocaleLowerCase('tr'); if (q.length < 2) return [200, []]; return [200, db.prepare('SELECT id,ad,tel FROM bagiscilar ORDER BY ad').all().filter(b => b.ad.toLocaleLowerCase('tr').includes(q) || b.tel.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')).slice(0, 12)]; });
  R('GET', '/api/sp/sponsorluk', 'sptak|sprap', 'g', async (c) => {
    const p = new URL(c.req.url, 'http://x').searchParams, q = (p.get('q') || '').toLocaleLowerCase('tr'), f = (k) => { const v = p.get(k); return v && v !== 'Tümü' ? v : null; };
    let L = db.prepare('SELECT * FROM sp_sponsorluk ORDER BY id DESC').all().map(sRow); if (q) L = L.filter(x => [x.sponsor, x.ogrenci, x.tel].some(v => String(v || '').toLocaleLowerCase('tr').includes(q)));
    if (f('durum')) L = L.filter(x => x.durum === f('durum')); if (f('odeme')) L = L.filter(x => x.odeme_durum === f('odeme'));
    const turler = db.prepare("SELECT id,ad FROM bagis_turleri WHERE kat='Sponsorluk' ORDER BY id").all();
    return [200, { liste: L, turler, sabit: CONST, hesaplar: db.prepare('SELECT id,banka,hesap,para FROM banka_hesaplari ORDER BY id').all(), bekleyenler: db.prepare("SELECT * FROM sp_ogrenci WHERE durum='Aktif' ORDER BY ad").all().map(oRow).map(o => ({ id: o.id, ad: o.ad, ulke: o.ulke, yetim: o.yetim, hafiz: o.hafiz, sponsor: o.aktif_sponsor })) }];
  });
  R('GET', '/api/sp/sponsorluk/([0-9]+)', 'sptak', 'g', async (c) => { const s = spo(+c.m[1]); return [200, { ...sRow(s), link: sk(s, c.req).link, odemeler: db.prepare('SELECT * FROM sp_odeme WHERE sponsorluk_id=? ORDER BY tarih DESC,id DESC').all(s.id).map(x => ({ ...x, bagis_no: x.bagis_id ? (db.prepare('SELECT no FROM bagislar WHERE id=?').get(x.bagis_id) || {}).no : null })) }]; });
  function odemeAl(s, b, user, req) {
    const tutar = num(b.tutar, 'Tutar'); if (!(tutar > 0)) throw new Err(400, 'Ödeme tutarını girin.'); const tarih = dt(b.tarih, 'Ödeme tarihi') || today(); if (tarih > today()) throw new Err(400, 'Ödeme tarihi gelecekte olamaz.');
    const bg = db.prepare('SELECT * FROM bagiscilar WHERE id=?').get(s.bagisci_id);
    const r = ctx.bagisOlustur({ kod: '+90', tel: bg.tel, ad: bg.ad, tur_id: s.tur_id, tutar, para: s.para, odeme: b.odeme, banka_id: b.banka_id, notu: 'Sponsorluk: ' + (ogr(s.ogrenci_id).ad), durum: 'Onaylı' }, user, 'Sponsorluk', '', req);
    if (tarih !== today()) { db.prepare('UPDATE bagislar SET tarih=? WHERE id=?').run(tarih, r.id); }
    db.prepare('INSERT INTO sp_odeme(sponsorluk_id,bagis_id,tutar,tarih) VALUES(?,?,?,?)').run(s.id, r.id, tutar, tarih); return r;
  }
  R('POST', '/api/sp/sponsorluk', 'sptak', 'e', async (c) => {
    const b = c.body || {}, o = ogr(+b.ogrenci_id); if (o.durum !== 'Aktif') throw new Err(400, 'Yalnızca aktif öğrenciye sponsor tanımlanır.');
    const bg = db.prepare('SELECT * FROM bagiscilar WHERE id=?').get(+b.bagisci_id); if (!bg) throw new Err(400, 'Sponsor (bağışçı) seçin. Yoksa önce Bağışçı Rehberi’nden ekleyin.');
    const sure = Math.round(num(b.sure, 'Süre', 120)); if (sure < 1) throw new Err(400, 'Süre (ay) girin.'); const aylik = num(b.aylik, 'Aylık tutar'); if (!(aylik > 0)) throw new Err(400, 'Aylık tutarı girin.');
    const para = CONST.para.includes(b.para) ? b.para : 'TL', tip = b.tip === 'Peşin' ? 'Peşin' : 'Aylık', bas = dt(b.baslangic, 'Başlangıç') || today();
    let tur = +b.tur_id; if (!tur || !db.prepare("SELECT 1 FROM bagis_turleri WHERE id=? AND kat='Sponsorluk'").get(tur)) tur = db.prepare('SELECT id FROM bagis_turleri WHERE ad=?').get(o.yetim ? 'Yetim Sponsorluğu' : o.hafiz ? 'Hafız Sponsorluğu' : 'Öğrenci Sponsorluğu').id;
    { const mev = db.prepare('SELECT durum FROM sp_sponsorluk WHERE ogrenci_id=? AND bagisci_id=? ORDER BY id DESC').get(o.id, bg.id); if (mev) throw new Err(409, mev.durum === 'Aktif' ? 'Bu bağışçı bu öğrenciye zaten sponsor.' : 'Bu bağışçının bu öğrenciyle sponsorluk kaydı zaten var (' + mev.durum + '); aynı bağışçıya yeniden tanımlanmaz.'); }
    const ilk = b.ilk_odeme && +b.ilk_odeme.tutar > 0 ? b.ilk_odeme : null; if (ilk && ilk.odeme === 'Havale/EFT' && !ilk.banka_id) throw new Err(400, 'Havale için banka hesabını seçin.');
    const token = crypto.randomBytes(12).toString('hex'), id = +db.prepare('INSERT INTO sp_sponsorluk(ogrenci_id,bagisci_id,tur_id,baslangic,sure,aylik,para,tip,token) VALUES(?,?,?,?,?,?,?,?,?)').run(o.id, bg.id, tur, bas, sure, aylik, para, tip, token).lastInsertRowid, sp = spo(id);
    if (ilk) { try { odemeAl(sp, ilk, c.user, c.req); } catch (e) { db.prepare('DELETE FROM sp_sponsorluk WHERE id=?').run(id); throw e; } }
    if (b.bildir !== false) bildir('spatama', sp, c.req, c.user.kadi); A.audit(c.user, 'sponsorluk_tanimlandi', bg.ad + ' → ' + o.ad, ip(c.req)); return [201, { id, link: sk(sp, c.req).link }];
  });
  R('POST', '/api/sp/sponsorluk/([0-9]+)/odeme', 'sptak', 'e', async (c) => { const s = spo(+c.m[1]); if (s.durum !== 'Aktif') throw new Err(400, 'Yalnızca aktif sponsorluğa ödeme girilir.'); const r = odemeAl(s, c.body || {}, c.user, c.req); return [201, { bagis_no: r.no }]; });
  R('GET', '/api/sp/sponsorluk/([0-9]+)/onizleme', 'sptak', 'd', async (c) => { // gidecek SMS metni, göndermeden: tip=link | hatirlat
    const s = spo(+c.m[1]), tip = new URL(c.req.url, 'http://x').searchParams.get('tip');
    if (tip === 'hatirlat') { const hs = hesap(s); if (hs.gecikme_ay < 1) throw new Err(400, 'Bu sponsorluğun gecikmiş ödemesi yok.'); return [200, bildir('sphatirla', s, c.req, null, { ay: hs.gecikme_ay, tutar: Math.round(hs.fark) + ' ' + s.para }, true)]; }
    return [200, bildir('spatama', s, c.req, null, null, true)];
  });
  R('POST', '/api/sp/sponsorluk/([0-9]+)/link-gonder', 'sptak', 'd', async (c) => { const s = spo(+c.m[1]); bildir('spatama', s, c.req, c.user.kadi); return [200, { ok: 1 }]; });
  function hatirlat(s, req, user) { const hs = hesap(s); if (hs.gecikme_ay < 1) return false; bildir('sphatirla', s, req, user, { ay: hs.gecikme_ay, tutar: Math.round(hs.fark) + ' ' + s.para }); db.prepare('UPDATE sp_sponsorluk SET son_hatirlatma=? WHERE id=?').run(today(), s.id); return true; }
  R('POST', '/api/sp/sponsorluk/([0-9]+)/hatirlat', 'sptak', 'd', async (c) => { const s = spo(+c.m[1]); if (!hatirlat(s, c.req, c.user.kadi)) throw new Err(400, 'Bu sponsorluğun gecikmiş ödemesi yok.'); return [200, { ok: 1 }]; });
  R('POST', '/api/sp/sponsorluk/([0-9]+)/iptal', 'sptak', 's', async (c) => { const s = spo(+c.m[1]); if (s.durum === 'İptal') throw new Err(409, 'Zaten iptal.'); db.prepare("UPDATE sp_sponsorluk SET durum='İptal', iptal_tarih=? WHERE id=?").run(today(), s.id); A.audit(c.user, 'sponsorluk_iptal', '#' + s.id, ip(c.req)); return [200, { ok: 1 }]; });
  // ---- otomatik hatırlatma ayarı ve toplu hatırlatma
  const ayar = () => { return { oto: false, esik: 2, tekrar: 30, ...ctx.h.getA('sp_ayar', {}) }; };
  function topluHatirlat(esik, tekrar, req, user) { let n = 0; const lim = new Date(Date.now() - tekrar * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10); db.prepare("SELECT * FROM sp_sponsorluk WHERE durum='Aktif'").all().forEach(s => { if (s.son_hatirlatma && s.son_hatirlatma > lim) return; if (hesap(s).gecikme_ay >= esik && hatirlat(s, req, user)) n++; }); return n; }
  R('GET', '/api/sp/ayar', 'sprap', 'g', async () => [200, ayar()]);
  R('PUT', '/api/sp/ayar', 'sprap', 'd', async (c) => { const b = c.body || {}, a = { oto: !!b.oto, esik: Math.max(1, Math.min(12, Math.round(+b.esik || 2))), tekrar: Math.max(7, Math.min(180, Math.round(+b.tekrar || 30))) }; ctx.h.setA('sp_ayar', a); return [200, a]; });
  R('POST', '/api/sp/hatirlat-toplu', 'sprap', 'd', async (c) => { const a = ayar(), esik = Math.max(1, Math.round(+(c.body || {}).esik || a.esik)); return [200, { gonderilen: topluHatirlat(esik, 1, c.req, c.user.kadi) }]; });
  setInterval(() => { try { const a = ayar(); if (a.oto) topluHatirlat(a.esik, a.tekrar, { headers: { host: 'localhost' } }, 'sistem'); } catch (e) { console.error('sponsor otomatik hatırlatma', e.message); } }, 36e5).unref();
  // ---- takip ve raporlar
  R('GET', '/api/sp/rapor', 'sprap', 'g', async () => {
    const S = db.prepare("SELECT * FROM sp_sponsorluk WHERE durum='Aktif'").all().map(sRow), O = db.prepare('SELECT * FROM sp_ogrenci').all().map(oRow), ay = today().slice(0, 7), yil = today().slice(0, 4);
    const tah = (pre) => db.prepare('SELECT para, SUM(tutar) t FROM sp_odeme o JOIN sp_sponsorluk s ON s.id=o.sponsorluk_id WHERE substr(o.tarih,1,?)=? GROUP BY para').all(pre.length, pre);
    const grp = (L, f) => { const m = {}; L.forEach(x => { const k = f(x) || '—'; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n); };
    const ozet = (x) => ({ id: x.id, sponsor: x.sponsor, tel: x.tel, ogrenci: x.ogrenci, ulke: x.ulke, yer: x.yer, aylik: x.aylik, para: x.para, tip: x.tip, gecikme_ay: x.gecikme_ay, fark: x.fark, odenen: x.odenen, toplam: x.toplam, son_odeme: x.son_odeme, son_hatirlatma: x.son_hatirlatma, bitis: x.bitis, kalan_gun: x.kalan_gun, yuzde: x.yuzde });
    const okulRapor = db.prepare("SELECT COALESCE(okul_tur,'-') tur, COALESCE(okul_ad,'(belirtilmemiş)') ad, COUNT(*) n, SUM(yetim) yetim, SUM(hafiz) hafiz FROM sp_ogrenci WHERE durum='Aktif' GROUP BY okul_tur, okul_ad ORDER BY n DESC").all();
    return [200, { okul: okulRapor, kpi: { aktif: S.length, ogrenci: O.filter(x => x.durum === 'Aktif').length, bekleyen: O.filter(x => !x.sponsorlu && x.durum === 'Aktif').length, gecikmis: S.filter(x => x.gecikme_ay >= 1).length, tamamlayan: O.filter(x => x.durum === 'Tamamladı').length },
      bu_ay: tah(ay), bu_yil: tah(yil), aylik_beklenen: S.reduce((m, x) => { m[x.para] = (m[x.para] || 0) + (x.tip === 'Aylık' ? x.aylik : 0); return m; }, {}),
      odemeyenler: S.filter(x => x.gecikme_ay >= 1).sort((a, b) => b.gecikme_ay - a.gecikme_ay).map(ozet), odeyenler: S.filter(x => x.gecikme_ay < 1).sort((a, b) => String(b.son_odeme || '').localeCompare(String(a.son_odeme || ''))).map(ozet),
      bekleyenler: O.filter(x => !x.sponsorlu && x.durum === 'Aktif').map(x => ({ id: x.id, ad: x.ad, ulke: x.ulke, yer: x.yer, yetim: x.yetim, hafiz: x.hafiz, yas: x.yas })), bitecekler: S.filter(x => x.kalan_gun >= 0 && x.kalan_gun <= 60).sort((a, b) => a.kalan_gun - b.kalan_gun).map(ozet),
      dagilim: { ulke: grp(O.filter(x => x.durum === 'Aktif'), x => x.ulke), yer: grp(O.filter(x => x.durum === 'Aktif'), x => x.yer), tur: [{ k: 'Yetim', n: O.filter(x => x.yetim && !x.hafiz).length }, { k: 'Hafız', n: O.filter(x => x.hafiz && !x.yetim).length }, { k: 'Yetim ve hafız', n: O.filter(x => x.hafiz && x.yetim).length }] }, ayar: ayar() }];
  });
  // ---- bağışçı profili için sponsorluk özeti
  R('GET', '/api/sp/bagisci/([0-9]+)', 'sptak', 'g', async (c) => [200, db.prepare('SELECT * FROM sp_sponsorluk WHERE bagisci_id=? ORDER BY id DESC').all(+c.m[1]).map(s => ({ ...sRow(s), link: sk(s, c.req).link }))]);
  ctx.sponsor = { odemeAl, spo, sRow, kodu, hesap };
  // ---- sponsora giden herkese açık kart (kimlik no, TC vb. göstermez)
  const tk = (t) => { const s = db.prepare('SELECT * FROM sp_sponsorluk WHERE token=?').get(t); if (!s) throw new Err(404, 'Bağlantı geçersiz.'); return s; };
  R('GET', '/api/sp/kart/([a-f0-9]{24})', null, null, async (c) => {
    const s = tk(c.m[1]), o = ogr(s.ogrenci_id), b = db.prepare('SELECT ad FROM bagiscilar WHERE id=?').get(s.bagisci_id), hs = hesap(s), t = db.prepare('SELECT ad FROM bagis_turleri WHERE id=?').get(s.tur_id);
    const kb = ctx.h.getA('kurumb', {}) || {};
    return [200, { dernek: ctx.h.getA('dernek_adi', ''), logo: kb.logo || '', renk: /^#[0-9a-fA-F]{6}$/.test(kb.renk || '') ? kb.renk : '', sponsor: b.ad, tur: t && t.ad, ogrenci: { ad: o.ad, cinsiyet: o.cinsiyet, ulke: o.ulke, bolge: o.bolge, yas: yasHesap(o), yetim: !!o.yetim, hafiz: !!o.hafiz, yetim_durum: o.yetim_durum, okul_tur: o.okul_tur, okul_ad: o.okul_ad, sinif: o.sinif, cuz: o.hafiz ? o.cuz : null, ayet: o.ayet, hoca: o.hoca, yer: o.yer, durum: o.durum, tamam_tur: o.tamam_tur, tamam_tarih: o.tamam_tarih },
      sponsorluk: { baslangic: s.baslangic, bitis: hs.bitis, sure: s.sure, yuzde: hs.yuzde, durum: s.durum, odeme_adet: hs.odeme_adet },
      medya: db.prepare('SELECT id,tip,ad FROM sp_medya WHERE ogrenci_id=? AND tip IN (\'foto\',\'video\') ORDER BY profil DESC,id DESC').all(o.id), notlar: db.prepare('SELECT metin,kayit FROM sp_not WHERE ogrenci_id=? ORDER BY id DESC LIMIT 20').all(o.id).map(n => ({ metin: n.metin, tarih: n.kayit.slice(0, 10) })) }];
  });
  R('GET', '/api/sp/pmedya/([a-f0-9]{24})/([0-9]+)', null, null, async (c) => { const s = tk(c.m[1]), m = db.prepare("SELECT * FROM sp_medya WHERE id=? AND ogrenci_id=? AND tip IN ('foto','video')").get(+c.m[2], s.ogrenci_id); if (!m) throw new Err(404, 'Dosya yok.'); return [200, { raw: path.join(UP, path.basename(m.dosya)) }]; });
};
