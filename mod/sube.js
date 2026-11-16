// Şube ve temsilcilikler: dernek/vakıf mevzuatının istediği kayıt bilgileri, bildirim takibi ve uyarılar.
// Dayanak (özet): 5253 sayılı Dernekler Kanunu md. 2/h-i, 4, 5, 7, 21, 23, 24; 5737 sayılı Vakıflar Kanunu ve Vakıflar Yönetmeliği (şube/temsilcilik açılış–kapanış beyannamesi).
module.exports = function (ctx) {
  const { R, Err, db, str, ip, A } = ctx, { getA, setA } = ctx.h;
  db.exec(`CREATE TABLE IF NOT EXISTS subeler(id INTEGER PRIMARY KEY, tur TEXT NOT NULL, ad TEXT NOT NULL UNIQUE COLLATE NOCASE, yurt_disi INTEGER NOT NULL DEFAULT 0, ulke_id INTEGER, il TEXT, ilce TEXT, adres TEXT, tel TEXT, eposta TEXT,
    karar_tarihi TEXT, karar_no TEXT, acilis_tarihi TEXT, bildirim_tarihi TEXT, bildirim_no TEXT, yonetici_bildirim_tarihi TEXT,
    sorumlu TEXT, sorumlu_unvan TEXT, sorumlu_tel TEXT, yonetim TEXT, genel_kurul_tarihi TEXT, gorev_bitis TEXT, iban TEXT, durum TEXT NOT NULL DEFAULT 'Aktif', kapanis_tarihi TEXT, kapanis_bildirim_tarihi TEXT, notlar TEXT, olusturma TEXT NOT NULL DEFAULT (datetime('now','localtime')))`);
  const KURUM = () => { const k = getA('kurum', {}); return { tur: k.tur === 'vakif' ? 'vakif' : 'dernek' }; };
  const dt = (v, ad) => { v = String(v || '').trim(); if (!v) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v))) throw new Err(400, ad + ' geçersiz.'); return v; };
  const gun = (a, n) => { const d = new Date(a); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  function uyarilar(s, kurum) {
    const w = [], bugun = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10); if (s.durum !== 'Aktif') return w;
    const sure = kurum === 'vakif' ? 31 : 30;
    if (s.tur === 'Şube') {
      if (s.acilis_tarihi && !s.bildirim_tarihi) { const son = gun(s.acilis_tarihi, sure); w.push(son < bugun ? { t: 'er', m: `Açılış bildirimi yapılmamış; süre ${son} tarihinde doldu.` } : { t: 'wr', m: `Açılış bildirimi için son gün: ${son}.` }); }
      if (!s.sorumlu) w.push({ t: 'wr', m: 'Şube başkanı/sorumlusu girilmemiş.' });
      if (s.yurt_disi && !s.ulke_id) w.push({ t: 'wr', m: 'Yurt dışı şubenin ülkesi seçilmemiş.' });
      if (s.gorev_bitis && s.gorev_bitis < bugun) w.push({ t: 'er', m: 'Şube yönetiminin görev süresi dolmuş; genel kurul/seçim gerekli.' });
    } else {
      if (!s.bildirim_tarihi && s.acilis_tarihi) w.push({ t: kurum === 'vakif' && gun(s.acilis_tarihi, sure) < bugun ? 'er' : 'wr', m: kurum === 'vakif' ? 'Vakıf şube/temsilcilik açılış beyannamesi için bildirim tarihi girilmemiş.' : 'Temsilci ve adres bilgisi mülki idare amirliğine bildirilmeli (bildirim tarihi girilmemiş).' });
      if (!s.sorumlu) w.push({ t: 'wr', m: 'Temsilci adı girilmemiş.' });
    }
    return w;
  }
  const satir = (s, kurum) => ({ ...s, ulke: s.ulke_id ? (db.prepare('SELECT ad FROM ulkeler WHERE id=?').get(s.ulke_id) || {}).ad || null : null, uyari: uyarilar(s, kurum) });
  R('GET', '/api/sube/ayar', 'sube', 'g', async () => [200, KURUM()]);
  R('PUT', '/api/sube/ayar', 'sube', 'e', async (c) => { const t = (c.body || {}).tur; if (!['dernek', 'vakif'].includes(t)) throw new Err(400, 'Kurum türünü seçin.'); setA('kurum', { ...getA('kurum', {}), tur: t }); A.audit(c.user, 'kurum_turu', t, ip(c.req)); return [200, KURUM()]; });
  R('GET', '/api/sube', 'sube', 'g', async () => { const k = KURUM().tur; return [200, { kurum: k, ulkeler: db.prepare('SELECT id,ad FROM ulkeler ORDER BY ad').all(), liste: db.prepare("SELECT * FROM subeler ORDER BY (durum<>'Aktif'), yurt_disi, tur, ad").all().map(s => satir(s, k)) }]; });
  function oku(b) {
    const o = {}; o.tur = ['Şube', 'Temsilcilik'].includes(b.tur) ? b.tur : null; if (!o.tur) throw new Err(400, 'Şube mi temsilcilik mi olduğunu seçin.');
    o.ad = str(b.ad, 100); if (!o.ad) throw new Err(400, 'Adı yazın (örn. Ankara Şubesi).');
    o.yurt_disi = b.yurt_disi ? 1 : 0; o.ulke_id = o.yurt_disi ? (+b.ulke_id || null) : null; if (o.ulke_id && !db.prepare('SELECT 1 FROM ulkeler WHERE id=?').get(o.ulke_id)) throw new Err(400, 'Ülke bulunamadı.');
    o.il = o.yurt_disi ? null : str(b.il, 40) || null; if (!o.yurt_disi && !o.il) throw new Err(400, 'İli seçin.');
    o.ilce = str(b.ilce, 60) || null; o.adres = str(b.adres, 300) || null; o.tel = str(b.tel, 30) || null;
    const m = String(b.eposta || '').trim().toLowerCase(); if (m && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) throw new Err(400, 'E-posta geçersiz.'); o.eposta = m || null;
    ['karar_tarihi', 'acilis_tarihi', 'bildirim_tarihi', 'yonetici_bildirim_tarihi', 'genel_kurul_tarihi', 'gorev_bitis', 'kapanis_tarihi', 'kapanis_bildirim_tarihi'].forEach(k => o[k] = dt(b[k], k));
    o.karar_no = str(b.karar_no, 40) || null; o.bildirim_no = str(b.bildirim_no, 60) || null; o.sorumlu = str(b.sorumlu, 80) || null; o.sorumlu_unvan = str(b.sorumlu_unvan, 60) || null; o.sorumlu_tel = str(b.sorumlu_tel, 30) || null;
    o.yonetim = str(b.yonetim, 1500) || null; o.iban = String(b.iban || '').replace(/\s/g, '').toUpperCase().slice(0, 34) || null; o.notlar = str(b.notlar, 800) || null;
    o.durum = b.durum === 'Kapalı' ? 'Kapalı' : 'Aktif'; if (o.durum === 'Kapalı' && !o.kapanis_tarihi) o.kapanis_tarihi = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    return o;
  }
  const var_ad = (ad, ex) => { const n = ad.toLocaleLowerCase('tr'); return db.prepare('SELECT id,ad FROM subeler').all().some(x => x.id !== ex && x.ad.toLocaleLowerCase('tr') === n); };
  const K = ['tur', 'ad', 'yurt_disi', 'ulke_id', 'il', 'ilce', 'adres', 'tel', 'eposta', 'karar_tarihi', 'karar_no', 'acilis_tarihi', 'bildirim_tarihi', 'bildirim_no', 'yonetici_bildirim_tarihi', 'sorumlu', 'sorumlu_unvan', 'sorumlu_tel', 'yonetim', 'genel_kurul_tarihi', 'gorev_bitis', 'iban', 'durum', 'kapanis_tarihi', 'kapanis_bildirim_tarihi', 'notlar'];
  R('POST', '/api/sube', 'sube', 'e', async (c) => { const o = oku(c.body || {}); if (var_ad(o.ad)) throw new Err(409, 'Bu adla bir kayıt zaten var.'); const id = +db.prepare(`INSERT INTO subeler(${K.join(',')}) VALUES(${K.map(() => '?').join(',')})`).run(...K.map(k => o[k])).lastInsertRowid; A.audit(c.user, 'sube_eklendi', o.ad, ip(c.req)); return [201, { id }]; });
  R('PUT', '/api/sube/([0-9]+)', 'sube', 'd', async (c) => { const id = +c.m[1]; if (!db.prepare('SELECT 1 FROM subeler WHERE id=?').get(id)) throw new Err(404, 'Kayıt yok.'); const o = oku(c.body || {}); if (var_ad(o.ad, id)) throw new Err(409, 'Bu adla başka bir kayıt var.'); db.prepare(`UPDATE subeler SET ${K.map(k => k + '=?').join(',')} WHERE id=?`).run(...K.map(k => o[k]), id); A.audit(c.user, 'sube_guncellendi', o.ad, ip(c.req)); return [200, { ok: 1 }]; });
};
