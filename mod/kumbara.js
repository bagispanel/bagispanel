// Kumbara Yönetimi: kumbaraların nerede/kimde olduğu, sayımlar ve toplananlar. Kumbara silinmez (Pasif olur), sayım silinmez (iptal edilir; neden yazılır) — geçmiş raporlar bozulmaz.
module.exports = function (ctx) {
  const { R, Err, db, str, ip, A } = ctx, RATE = ctx.RATE || { TL: 1, USD: 35, EUR: 38 };
  db.exec(`CREATE TABLE IF NOT EXISTS kumbaralar(id INTEGER PRIMARY KEY, kod TEXT NOT NULL UNIQUE, ad TEXT NOT NULL, tur TEXT NOT NULL DEFAULT 'Esnaf', il TEXT, ilce TEXT, adres TEXT, yetkili TEXT, tel TEXT, yerlesim TEXT, durum TEXT NOT NULL DEFAULT 'Aktif', notu TEXT, kullanici TEXT, zaman TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS kumbara_sayim(id INTEGER PRIMARY KEY, kumbara_id INTEGER NOT NULL, tarih TEXT NOT NULL, tutar REAL NOT NULL, para TEXT NOT NULL DEFAULT 'TL', tl REAL NOT NULL, sayan TEXT, notu TEXT, kullanici TEXT, zaman TEXT NOT NULL DEFAULT (datetime('now','localtime')), iptal INTEGER NOT NULL DEFAULT 0, iptal_neden TEXT);`);
  const TUR = ['Esnaf', 'Cami / Mescit', 'Okul', 'Ev', 'Kurum / Şirket', 'Diğer'], DURUM = ['Aktif', 'Pasif'], iso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const tarih = (v, ad, bos) => { v = String(v || '').trim(); if (!v) { if (bos) return null; throw new Err(400, ad + ' girin.'); } if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v))) throw new Err(400, ad + ' geçersiz.'); return v; };
  const SEL = `SELECT k.*, (SELECT MAX(tarih) FROM kumbara_sayim WHERE kumbara_id=k.id AND iptal=0) son, (SELECT COUNT(*) FROM kumbara_sayim WHERE kumbara_id=k.id AND iptal=0) say, COALESCE((SELECT SUM(tl) FROM kumbara_sayim WHERE kumbara_id=k.id AND iptal=0),0) toplam FROM kumbaralar k`;
  const gec = (k) => { if (k.durum !== 'Aktif') return false; const ref = k.son || k.yerlesim || (k.zaman || '').slice(0, 10); return ref && (Date.now() - new Date(ref)) / 864e5 > 60; };
  function alan(b, eski) {
    const o = {}; o.ad = str(b.ad, 120); if (!o.ad) throw new Err(400, 'Kumbaranın bulunduğu yeri (örn. “Yıldız Market”) yazın.');
    o.tur = TUR.includes(b.tur) ? b.tur : (eski ? eski.tur : 'Esnaf'); o.il = str(b.il, 60) || null; o.ilce = str(b.ilce, 60) || null; o.adres = str(b.adres, 240) || null; o.yetkili = str(b.yetkili, 100) || null; o.tel = str(b.tel, 30) || null;
    o.yerlesim = tarih(b.yerlesim, 'Yerleştirme tarihi', true); o.notu = str(b.notu, 400) || null; o.durum = DURUM.includes(b.durum) ? b.durum : (eski ? eski.durum : 'Aktif'); return o;
  }
  R('GET', '/api/kumbara', 'kumbara', 'g', async () => {
    const L = db.prepare(SEL + ' ORDER BY (k.durum=\'Aktif\') DESC, k.id DESC').all().map((k) => ({ ...k, gecikti: gec(k) }));
    const ay = iso().slice(0, 7), n = (s, ...a) => (db.prepare(s).get(...a) || {}).n || 0;
    return [200, { liste: L, tur: TUR, durum: DURUM, ozet: { aktif: L.filter(k => k.durum === 'Aktif').length, pasif: L.filter(k => k.durum !== 'Aktif').length, toplam: n('SELECT COALESCE(SUM(tl),0) n FROM kumbara_sayim WHERE iptal=0'), buay: n("SELECT COALESCE(SUM(tl),0) n FROM kumbara_sayim WHERE iptal=0 AND substr(tarih,1,7)=?", ay), gecikti: L.filter(k => k.gecikti).length } }];
  });
  R('POST', '/api/kumbara', 'kumbara', 'e', async (c) => {
    const o = alan(c.body || {}), id = +db.prepare('INSERT INTO kumbaralar(kod,ad,tur,il,ilce,adres,yetkili,tel,yerlesim,durum,notu,kullanici) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('TMP' + Date.now() + Math.random(), o.ad, o.tur, o.il, o.ilce, o.adres, o.yetkili, o.tel, o.yerlesim, o.durum, o.notu, c.user.kadi).lastInsertRowid;
    const kod = 'KM-' + String(id).padStart(4, '0'); db.prepare('UPDATE kumbaralar SET kod=? WHERE id=?').run(kod, id); A.audit(c.user, 'kumbara_eklendi', kod + ' ' + o.ad, ip(c.req)); return [201, { id, kod }];
  });
  const kb = (id) => db.prepare(SEL + ' WHERE k.id=?').get(id) || (() => { throw new Err(404, 'Kumbara yok.'); })();
  R('PUT', '/api/kumbara/([0-9]+)', 'kumbara', 'e', async (c) => { const k = kb(+c.m[1]), o = alan({ ...k, ...(c.body || {}) }, k); db.prepare('UPDATE kumbaralar SET ad=?,tur=?,il=?,ilce=?,adres=?,yetkili=?,tel=?,yerlesim=?,durum=?,notu=? WHERE id=?').run(o.ad, o.tur, o.il, o.ilce, o.adres, o.yetkili, o.tel, o.yerlesim, o.durum, o.notu, k.id); A.audit(c.user, k.durum !== o.durum ? 'kumbara_' + o.durum.toLowerCase() : 'kumbara_duzenlendi', k.kod + ' ' + o.ad, ip(c.req)); return [200, { ok: 1 }]; });
  R('GET', '/api/kumbara/([0-9]+)', 'kumbara', 'g', async (c) => { const k = kb(+c.m[1]); return [200, { ...k, gecikti: gec(k), sayimlar: db.prepare('SELECT * FROM kumbara_sayim WHERE kumbara_id=? ORDER BY tarih DESC, id DESC').all(k.id) }]; });
  R('POST', '/api/kumbara/([0-9]+)/sayim', 'kumbara', 'e', async (c) => {
    const k = kb(+c.m[1]), b = c.body || {}, t = tarih(b.tarih || iso(), 'Sayım tarihi'), tutar = Math.round((+String(b.tutar).replace(',', '.')) * 100) / 100, para = ['TL', 'USD', 'EUR'].includes(b.para) ? b.para : 'TL';
    if (t > iso()) throw new Err(400, 'Sayım tarihi gelecekte olamaz.'); if (!(tutar > 0 && tutar < 1e9)) throw new Err(400, 'Sayılan tutarı yazın.');
    if (k.durum !== 'Aktif') throw new Err(409, 'Pasif kumbaraya sayım girilmez; önce Aktif yapın.');
    const id = +db.prepare('INSERT INTO kumbara_sayim(kumbara_id,tarih,tutar,para,tl,sayan,notu,kullanici) VALUES(?,?,?,?,?,?,?,?)').run(k.id, t, tutar, para, tutar * RATE[para], str(b.sayan, 100) || null, str(b.notu, 300) || null, c.user.kadi).lastInsertRowid;
    A.audit(c.user, 'kumbara_sayim', k.kod + ' ' + tutar + ' ' + para, ip(c.req)); return [201, { id }];
  });
  R('PUT', '/api/kumbara/sayim/([0-9]+)/iptal', 'kumbara', 'd', async (c) => {
    const s = db.prepare('SELECT * FROM kumbara_sayim WHERE id=?').get(+c.m[1]); if (!s) throw new Err(404, 'Sayım yok.'); if (s.iptal) throw new Err(409, 'Sayım zaten iptal.');
    const n = str((c.body || {}).neden, 200); if (!n) throw new Err(400, 'İptal nedenini yazın.'); db.prepare('UPDATE kumbara_sayim SET iptal=1, iptal_neden=? WHERE id=?').run(n, s.id); A.audit(c.user, 'kumbara_sayim_iptal', 'sayım #' + s.id + ': ' + n, ip(c.req)); return [200, { ok: 1 }];
  });
};
