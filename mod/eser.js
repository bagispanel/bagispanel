// Kalıcı Eser Projeleri: cami, sağlık ocağı, okul gibi kalıcı yapılar. Hedef/toplanan sayaç, sorumlular, partner kurum, çizim/belge yükleme, ilerleme notları, web sitesi için dış API.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
module.exports = function (ctx) {
  const { R, Err, db, str, ip, A, usage } = ctx;
  const UP = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'uploads', 'eser'); fs.mkdirSync(UP, { recursive: true });
  db.exec(`CREATE TABLE IF NOT EXISTS eser(id INTEGER PRIMARY KEY, ad TEXT NOT NULL, tur TEXT NOT NULL, ulke TEXT, bolge TEXT, konum TEXT, alan REAL, kapasite TEXT,
    hedef REAL NOT NULL DEFAULT 0, para TEXT NOT NULL DEFAULT 'TL', kur REAL NOT NULL DEFAULT 1, elle REAL NOT NULL DEFAULT 0, tur_ids TEXT NOT NULL DEFAULT '[]', ilerleme INTEGER NOT NULL DEFAULT 0,
    durum TEXT NOT NULL DEFAULT 'Planlama', baslangic TEXT, bitis TEXT, sorumlu_ad TEXT, sorumlu_tel TEXT, sorumlu_mail TEXT, partner TEXT, gonullu_id INTEGER, web INTEGER NOT NULL DEFAULT 0, aciklama TEXT,
    kayit TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS eser_dosya(id INTEGER PRIMARY KEY, eser_id INTEGER NOT NULL, ad TEXT NOT NULL, tip TEXT NOT NULL, dosya TEXT NOT NULL, boyut INTEGER NOT NULL, kayit TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS eser_not(id INTEGER PRIMARY KEY, eser_id INTEGER NOT NULL, metin TEXT NOT NULL, ilerleme INTEGER, kullanici TEXT, kayit TEXT NOT NULL DEFAULT (datetime('now','localtime')));`);
  db.prepare("INSERT OR IGNORE INTO kategoriler(ad) VALUES('Kalıcı Eser')").run(); // sabit ana kategori: projeler bunun altında alt kategori olarak açılır
  const CONST = { tur: ['Cami', 'Sağlık ocağı', 'Okul', 'Kuran kursu', 'Yetimhane', 'Kütüphane', 'Su ve altyapı', 'Diğer'], durum: ['Planlama', 'Fon toplama', 'İnşaat', 'Tamamlandı', 'Askıda'], para: ['TL', 'USD', 'EUR'], dosya: ['Çizim / plan', 'Proje belgesi', 'İzin / resmî evrak', 'Fotoğraf', 'Rapor', 'Diğer'] };
  usage.partner.push((ad) => db.prepare('SELECT COUNT(*) n FROM eser WHERE partner=?').get(ad).n);
  usage.ulke.push((ad) => db.prepare('SELECT COUNT(*) n FROM eser WHERE ulke=?').get(ad).n);
  const num = (v, ad, max) => { if (v === '' || v == null) return 0; const n = +String(v).replace(',', '.'); if (!isFinite(n) || n < 0 || n > (max || 1e12)) throw new Err(400, ad + ' geçersiz.'); return n; };
  const dt = (v, ad) => { v = String(v || '').trim(); if (!v) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v))) throw new Err(400, ad + ' geçersiz.'); return v; };
  const tel = (v) => { const s = String(v || '').trim(); if (!s) return null; const d = s.replace(/\D/g, ''); if (d.length < 7 || d.length > 15) throw new Err(400, 'Sorumlu telefonu geçersiz.'); return s[0] === '+' ? '+' + d : d.length === 11 && d[0] === '0' ? '+90' + d.slice(1) : d.length === 10 ? '+90' + d : '+' + d; };
  function oku(b) {
    const o = {}; o.ad = str(b.ad, 120); if (!o.ad) throw new Err(400, 'Proje adı zorunlu.');
    o.tur = String(b.tur || ''); if (!CONST.tur.includes(o.tur)) throw new Err(400, 'Proje türü geçersiz.');
    o.durum = String(b.durum || 'Planlama'); if (!CONST.durum.includes(o.durum)) throw new Err(400, 'Durum geçersiz.');
    o.ulke = str(b.ulke, 60) || null; if (!o.ulke) throw new Err(400, 'Ülke zorunlu.'); if (o.ulke && !db.prepare('SELECT 1 FROM ulkeler WHERE ad=?').get(o.ulke)) throw new Err(400, 'Ülke listede yok (Sistem Ayarları → Ülkeler).');
    o.bolge = str(b.bolge, 120) || null; o.konum = str(b.konum, 600) || null; o.alan = num(b.alan, 'Alan (m²)', 1e7) || null; o.kapasite = str(b.kapasite, 80) || null;
    o.hedef = num(b.hedef, 'Hedef tutar'); if (!(o.hedef > 0)) throw new Err(400, 'Hedef tutar zorunlu (0’dan büyük).'); o.para = String(b.para || 'TL'); if (!CONST.para.includes(o.para)) throw new Err(400, 'Para birimi geçersiz.');
    o.kur = o.para === 'TL' ? 1 : num(b.kur, 'Kur', 1e6); if (o.para !== 'TL' && !(o.kur > 0)) throw new Err(400, o.para + ' için kur (1 ' + o.para + ' = kaç TL) girin.');
    o.elle = num(b.elle, 'Ayrıca toplanan');
    const ids = (Array.isArray(b.tur_ids) ? b.tur_ids : []).map(Number).filter(Number.isInteger); ids.forEach(i => { if (!db.prepare('SELECT 1 FROM bagis_turleri WHERE id=?').get(i)) throw new Err(400, 'Bağlı bağış türü bulunamadı.'); }); o.tur_ids = JSON.stringify([...new Set(ids)]);
    o.ilerleme = Math.round(num(b.ilerleme, 'İnşaat ilerlemesi', 100));
    o.baslangic = dt(b.baslangic, 'Başlangıç'); o.bitis = dt(b.bitis, 'Bitiş'); if (o.baslangic && o.bitis && o.bitis < o.baslangic) throw new Err(400, 'Bitiş, başlangıçtan önce olamaz.');
    o.sorumlu_ad = str(b.sorumlu_ad, 80) || null; o.sorumlu_tel = tel(b.sorumlu_tel); const m = String(b.sorumlu_mail || '').trim().toLowerCase(); if (m && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) throw new Err(400, 'Sorumlu e-postası geçersiz.'); o.sorumlu_mail = m || null;
    o.partner = str(b.partner, 120) || null; if (o.partner && !db.prepare('SELECT 1 FROM partnerler WHERE ad=?').get(o.partner)) throw new Err(400, 'Partner kurum bulunamadı (Kurum Yönetimi → Partner Kurumlar).');
    o.gonullu_id = +b.gonullu_id || null; if (o.gonullu_id && !db.prepare('SELECT 1 FROM gonulluler WHERE id=?').get(o.gonullu_id)) throw new Err(400, 'Gönüllü bulunamadı.');
    o.web = b.web ? 1 : 0; o.aciklama = str(b.aciklama, 2000) || null; return o;
  }
  function turAc(o, b) { // "Bağış Al'da alt kategori aç": Kalıcı Eser › proje adı
    if (!b.tur_ac) return; const ad = o.ad.slice(0, 80); let t = db.prepare("SELECT id FROM bagis_turleri WHERE kat='Kalıcı Eser' AND ad=?").get(ad);
    if (!t) t = { id: +db.prepare("INSERT INTO bagis_turleri(kat,ad) VALUES('Kalıcı Eser',?)").run(ad).lastInsertRowid };
    const ids = JSON.parse(o.tur_ids); if (!ids.includes(t.id)) ids.push(t.id); o.tur_ids = JSON.stringify(ids);
  }
  const K = ['ad', 'tur', 'ulke', 'bolge', 'konum', 'alan', 'kapasite', 'hedef', 'para', 'kur', 'elle', 'tur_ids', 'ilerleme', 'durum', 'baslangic', 'bitis', 'sorumlu_ad', 'sorumlu_tel', 'sorumlu_mail', 'partner', 'gonullu_id', 'web', 'aciklama'];
  const satir = (e) => {
    const ids = JSON.parse(e.tur_ids || '[]'), tl = ids.length ? db.prepare(`SELECT COALESCE(SUM(tl),0) s, COUNT(*) n FROM bagislar WHERE durum='Onaylı' AND tur_id IN (${ids.map(() => '?').join(',')})`).get(...ids) : { s: 0, n: 0 };
    const topl = Math.round((e.elle + tl.s / (e.kur || 1)) * 100) / 100, yuz = e.hedef > 0 ? Math.min(100, Math.round(topl / e.hedef * 1000) / 10) : 0;
    const g = e.gonullu_id ? db.prepare('SELECT ad FROM gonulluler WHERE id=?').get(e.gonullu_id) : null;
    return { ...e, tur_ids: ids, bagis_tl: Math.round(tl.s), bagis_adet: tl.n, toplanan: topl, yuzde: yuz, kalan: Math.max(0, Math.round((e.hedef - topl) * 100) / 100), gonullu: g ? g.ad : null };
  };
  const ses = (id) => { const e = db.prepare('SELECT * FROM eser WHERE id=?').get(id); if (!e) throw new Err(404, 'Proje bulunamadı.'); return e; };
  R('GET', '/api/eser', 'eser', 'g', async () => {
    const L = db.prepare('SELECT * FROM eser ORDER BY CASE durum WHEN \'Tamamlandı\' THEN 1 WHEN \'Askıda\' THEN 2 ELSE 0 END, id DESC').all().map(satir);
    return [200, { liste: L, sabit: CONST, ulkeler: db.prepare('SELECT ad FROM ulkeler ORDER BY ad').all().map(x => x.ad), partnerler: db.prepare('SELECT ad FROM partnerler WHERE aktif=1 ORDER BY ad').all().map(x => x.ad),
      gonulluler: db.prepare("SELECT id,ad FROM gonulluler WHERE durum<>'Pasif' ORDER BY ad").all(), turler: db.prepare('SELECT id,kat,ad FROM bagis_turleri ORDER BY kat,ad').all() }];
  });
  R('GET', '/api/eser/([0-9]+)', 'eser', 'g', async (c) => { const e = ses(+c.m[1]); return [200, { ...satir(e), dosyalar: db.prepare('SELECT id,ad,tip,boyut,kayit,dosya FROM eser_dosya WHERE eser_id=? ORDER BY id DESC').all(e.id).map(d => ({ ...d, ext: path.extname(d.dosya).slice(1), dosya: undefined })), notlar: db.prepare('SELECT * FROM eser_not WHERE eser_id=? ORDER BY id DESC').all(e.id) }]; });
  R('POST', '/api/eser', 'eser', 'e', async (c) => { const o = oku(c.body || {}); turAc(o, c.body || {}); const id = +db.prepare(`INSERT INTO eser(${K.join(',')}) VALUES(${K.map(() => '?').join(',')})`).run(...K.map(k => o[k])).lastInsertRowid; A.audit(c.user, 'eser_eklendi', o.ad, ip(c.req)); return [201, { id }]; });
  R('PUT', '/api/eser/([0-9]+)', 'eser', 'd', async (c) => { const id = ses(+c.m[1]).id, o = oku(c.body || {}); turAc(o, c.body || {}); db.prepare(`UPDATE eser SET ${K.map(k => k + '=?').join(',')} WHERE id=?`).run(...K.map(k => o[k]), id); A.audit(c.user, 'eser_guncellendi', o.ad, ip(c.req)); return [200, { ok: 1 }]; });
  R('DELETE', '/api/eser/([0-9]+)', 'eser', 's', async (c) => { const e = ses(+c.m[1]); const sr = satir(e); if (sr.toplanan > 0 || sr.bagis_adet > 0 || e.elle > 0) throw new Err(409, 'Bu projeye bağış toplanmış; geçmiş raporlar bozulmasın diye silinmez. Durumunu “Askıda” yapabilirsiniz.'); db.prepare('SELECT dosya FROM eser_dosya WHERE eser_id=?').all(e.id).forEach(d => { try { fs.unlinkSync(path.join(UP, path.basename(d.dosya))); } catch (x) {} }); db.prepare('DELETE FROM eser_dosya WHERE eser_id=?').run(e.id); db.prepare('DELETE FROM eser_not WHERE eser_id=?').run(e.id); db.prepare('DELETE FROM eser WHERE id=?').run(e.id); A.audit(c.user, 'eser_silindi', e.ad, ip(c.req)); return [200, { ok: 1 }]; });
  // Belge / çizim yükleme (data URL, en çok 1,5 MB: pdf, png, jpeg, webp)
  const MAGIC = { pdf: (b) => b.slice(0, 5).toString() === '%PDF-', png: (b) => b[0] === 0x89 && b[1] === 0x50, jpeg: (b) => b[0] === 0xff && b[1] === 0xd8, webp: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' };
  R('POST', '/api/eser/([0-9]+)/dosya', 'eser', 'e', async (c) => {
    const e = ses(+c.m[1]), b = c.body || {}, ad = str(b.ad, 120), tip = String(b.tip || 'Diğer'); if (!ad) throw new Err(400, 'Dosya adı zorunlu.'); if (!CONST.dosya.includes(tip)) throw new Err(400, 'Dosya türü geçersiz.');
    const m = /^data:(?:application\/pdf|image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.veri || '')), pm = /^data:application\/pdf;base64,/.test(String(b.veri || '')); if (!m) throw new Err(400, 'Yalnızca PDF, PNG, JPEG veya WEBP yüklenebilir.');
    const t = pm ? 'pdf' : m[1], buf = Buffer.from(m[2], 'base64'); if (buf.length > 1.5e6) throw new Err(413, 'Dosya en çok 1,5 MB olabilir.'); if (!MAGIC[t](buf)) throw new Err(400, 'Dosya içeriği türüyle uyuşmuyor.');
    if (db.prepare('SELECT COUNT(*) n FROM eser_dosya WHERE eser_id=?').get(e.id).n >= 40) throw new Err(400, 'Bir projeye en çok 40 dosya eklenebilir.');
    const name = `${e.id}-${crypto.randomBytes(6).toString('hex')}.${t === 'jpeg' ? 'jpg' : t}`; fs.writeFileSync(path.join(UP, name), buf);
    const id = +db.prepare('INSERT INTO eser_dosya(eser_id,ad,tip,dosya,boyut) VALUES(?,?,?,?,?)').run(e.id, ad, tip, name, buf.length).lastInsertRowid; A.audit(c.user, 'eser_dosya', e.ad + ': ' + ad, ip(c.req)); return [201, { id }];
  });
  R('GET', '/api/eser/dosya/([0-9]+)', 'eser', 'g', async (c) => { const d = db.prepare('SELECT * FROM eser_dosya WHERE id=?').get(+c.m[1]); if (!d) throw new Err(404, 'Dosya yok.'); return [200, { raw: path.join(UP, path.basename(d.dosya)) }]; });
  R('DELETE', '/api/eser/dosya/([0-9]+)', 'eser', 'd', async (c) => { const d = db.prepare('SELECT * FROM eser_dosya WHERE id=?').get(+c.m[1]); if (!d) throw new Err(404, 'Dosya yok.'); try { fs.unlinkSync(path.join(UP, path.basename(d.dosya))); } catch (x) {} db.prepare('DELETE FROM eser_dosya WHERE id=?').run(d.id); return [200, { ok: 1 }]; });
  // İlerleme notu (isteğe bağlı olarak inşaat yüzdesini de günceller)
  R('POST', '/api/eser/([0-9]+)/not', 'eser', 'd', async (c) => {
    const e = ses(+c.m[1]), b = c.body || {}, metin = str(b.metin, 800); if (!metin) throw new Err(400, 'Not yazın.');
    let il = null; if (b.ilerleme !== '' && b.ilerleme != null) { il = Math.round(num(b.ilerleme, 'İlerleme', 100)); db.prepare('UPDATE eser SET ilerleme=? WHERE id=?').run(il, e.id); }
    db.prepare('INSERT INTO eser_not(eser_id,metin,ilerleme,kullanici) VALUES(?,?,?,?)').run(e.id, metin, il, c.user.ad); return [201, { ok: 1 }];
  });
  R('DELETE', '/api/eser/not/([0-9]+)', 'eser', 'd', async (c) => { db.prepare('DELETE FROM eser_not WHERE id=?').run(+c.m[1]); return [200, { ok: 1 }]; });
  // Web sitesi için (sayaç): x-api-key ile; yalnızca "web'de göster" işaretli projeler, kişisel veri yok
  const dis = (req) => { const k = req.headers['x-api-key']; const r = k && db.prepare('SELECT 1 FROM api_anahtar WHERE hash=? AND aktif=1').get(crypto.createHash('sha256').update(String(k)).digest('hex')); if (!r) throw new Err(401, 'API anahtarı geçersiz.'); };
  const pub = (e) => { const s = satir(e); return { id: s.id, ad: s.ad, tur: s.tur, ulke: s.ulke, bolge: s.bolge, alan_m2: s.alan, kapasite: s.kapasite, durum: s.durum, hedef: s.hedef, para: s.para, toplanan: s.toplanan, kalan: s.kalan, yuzde: s.yuzde, insaat_yuzde: s.ilerleme, baslangic: s.baslangic, bitis: s.bitis, aciklama: s.aciklama, partner: s.partner }; };
  ctx.eserWeb = () => db.prepare('SELECT * FROM eser WHERE web=1 ORDER BY id DESC').all().map(pub);
  R('GET', '/api/dis/kalici-eser', null, null, async (c) => { dis(c.req); return [200, db.prepare('SELECT * FROM eser WHERE web=1 ORDER BY id DESC').all().map(pub)]; });
  R('GET', '/api/dis/kalici-eser/([0-9]+)', null, null, async (c) => { dis(c.req); const e = db.prepare('SELECT * FROM eser WHERE id=? AND web=1').get(+c.m[1]); if (!e) throw new Err(404, 'Proje yok.'); return [200, pub(e)]; });
};
