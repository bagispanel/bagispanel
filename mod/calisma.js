// Profilim: kişiler arası iç mesajlaşma (Mesaj Merkezi) ve görev takibi. Giriş yapmış her kullanıcı kullanır; yalnızca kendi mesaj ve görevlerini görür.
module.exports = function (ctx) {
  const { R, Err, db, str, A } = ctx;
  db.exec(`
CREATE TABLE IF NOT EXISTS ic_mesaj(id INTEGER PRIMARY KEY, ust_id INTEGER, gonderen_id INTEGER NOT NULL, alici_id INTEGER NOT NULL, konu TEXT NOT NULL, govde TEXT NOT NULL, zaman TEXT NOT NULL DEFAULT (datetime('now','localtime')), okundu INTEGER NOT NULL DEFAULT 0, g_sil INTEGER NOT NULL DEFAULT 0, a_sil INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_icm_a ON ic_mesaj(alici_id, okundu);
CREATE TABLE IF NOT EXISTS gorev(id INTEGER PRIMARY KEY, baslik TEXT NOT NULL, aciklama TEXT, olusturan_id INTEGER NOT NULL, atanan_id INTEGER NOT NULL, son_tarih TEXT, oncelik TEXT NOT NULL DEFAULT 'Normal', durum TEXT NOT NULL DEFAULT 'Açık', zaman TEXT NOT NULL DEFAULT (datetime('now','localtime')), bitis TEXT);
CREATE INDEX IF NOT EXISTS ix_gorev_a ON gorev(atanan_id, durum);
`);
  const ad = (id) => (db.prepare('SELECT ad FROM users WHERE id=?').get(id) || {}).ad || '-';
  const kisi = (id) => { const u = db.prepare('SELECT u.id,u.ad,b.ad birim FROM users u JOIN birimler b ON b.id=u.birim_id WHERE u.id=? AND u.aktif=1').get(+id); if (!u) throw new Err(400, 'Kişi bulunamadı.'); return u; };
  R('GET', '/api/profil/kisiler', 'auth', null, async (c) => [200, db.prepare('SELECT u.id,u.ad,b.ad birim FROM users u JOIN birimler b ON b.id=u.birim_id WHERE u.aktif=1 AND u.id<>? ORDER BY u.ad').all(c.user.id)]);
  R('GET', '/api/profil/ozet', 'auth', null, async (c) => { const g = (s, ...a) => (db.prepare(s).get(...a) || {}).n || 0, bugun = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10); return [200, { mesaj: g('SELECT COUNT(*) n FROM ic_mesaj WHERE alici_id=? AND okundu=0 AND a_sil=0', c.user.id), gorev: g("SELECT COUNT(*) n FROM gorev WHERE atanan_id=? AND durum<>'Tamamlandı'", c.user.id), geciken: g("SELECT COUNT(*) n FROM gorev WHERE atanan_id=? AND durum<>'Tamamlandı' AND son_tarih IS NOT NULL AND son_tarih<?", c.user.id, bugun) }]; });

  // ---- Mesaj Merkezi ----
  R('GET', '/api/mesaj', 'auth', null, async (c) => {
    const k = new URL(c.req.url, 'http://x').searchParams.get('kutu') === 'giden' ? 'giden' : 'gelen';
    const L = k === 'gelen' ? db.prepare("SELECT m.id,m.ust_id,m.konu,m.zaman,m.okundu,m.gonderen_id kim_id,u.ad kim,substr(m.govde,1,90) ozet FROM ic_mesaj m JOIN users u ON u.id=m.gonderen_id WHERE m.alici_id=? AND m.a_sil=0 ORDER BY m.id DESC LIMIT 200").all(c.user.id) : db.prepare("SELECT m.id,m.ust_id,m.konu,m.zaman,1 okundu,m.alici_id kim_id,u.ad kim,substr(m.govde,1,90) ozet FROM ic_mesaj m JOIN users u ON u.id=m.alici_id WHERE m.gonderen_id=? AND m.g_sil=0 ORDER BY m.id DESC LIMIT 200").all(c.user.id);
    return [200, L];
  });
  R('GET', '/api/mesaj/([0-9]+)', 'auth', null, async (c) => {
    const m = db.prepare('SELECT * FROM ic_mesaj WHERE id=?').get(+c.m[1]); if (!m || (m.alici_id !== c.user.id && m.gonderen_id !== c.user.id)) throw new Err(404, 'Mesaj yok.');
    if (m.alici_id === c.user.id && !m.okundu) db.prepare('UPDATE ic_mesaj SET okundu=1 WHERE id=?').run(m.id);
    const kok = m.ust_id || m.id, dizi = db.prepare('SELECT m.id,m.govde,m.zaman,m.gonderen_id,u.ad gonderen FROM ic_mesaj m JOIN users u ON u.id=m.gonderen_id WHERE (m.id=? OR m.ust_id=?) AND ((m.alici_id=? AND m.a_sil=0) OR (m.gonderen_id=? AND m.g_sil=0)) ORDER BY m.id').all(kok, kok, c.user.id, c.user.id);
    db.prepare('UPDATE ic_mesaj SET okundu=1 WHERE (id=? OR ust_id=?) AND alici_id=?').run(kok, kok, c.user.id);
    return [200, { id: m.id, kok, konu: m.konu, karsi_id: m.gonderen_id === c.user.id ? m.alici_id : m.gonderen_id, karsi: ad(m.gonderen_id === c.user.id ? m.alici_id : m.gonderen_id), dizi }];
  });
  R('POST', '/api/mesaj', 'auth', null, async (c) => {
    const b = c.body || {}, govde = str(b.govde, 4000); if (!govde) throw new Err(400, 'Mesajı yazın.');
    let ust = null, konu = str(b.konu, 120), alici = +b.alici_id;
    if (b.ust_id) { const o = db.prepare('SELECT * FROM ic_mesaj WHERE id=?').get(+b.ust_id); if (!o || (o.alici_id !== c.user.id && o.gonderen_id !== c.user.id)) throw new Err(404, 'Mesaj yok.'); ust = o.ust_id || o.id; konu = o.konu; alici = o.gonderen_id === c.user.id ? o.alici_id : o.gonderen_id; }
    if (!konu) throw new Err(400, 'Konu yazın.'); if (alici === c.user.id) throw new Err(400, 'Kendinize mesaj gönderemezsiniz.'); kisi(alici);
    const id = +db.prepare('INSERT INTO ic_mesaj(ust_id,gonderen_id,alici_id,konu,govde) VALUES(?,?,?,?,?)').run(ust, c.user.id, alici, konu, govde).lastInsertRowid; return [200, { id }];
  });
  R('DELETE', '/api/mesaj/([0-9]+)', 'auth', null, async (c) => { const m = db.prepare('SELECT * FROM ic_mesaj WHERE id=?').get(+c.m[1]); if (!m) throw new Err(404, 'Mesaj yok.'); if (m.alici_id === c.user.id) db.prepare('UPDATE ic_mesaj SET a_sil=1 WHERE id=?').run(m.id); else if (m.gonderen_id === c.user.id) db.prepare('UPDATE ic_mesaj SET g_sil=1 WHERE id=?').run(m.id); else throw new Err(404, 'Mesaj yok.'); return [200, { ok: 1 }]; });

  // ---- Görev Takibi ----
  const DUR = ['Açık', 'Devam ediyor', 'Tamamlandı'], ONC = ['Düşük', 'Normal', 'Yüksek'];
  R('GET', '/api/gorev', 'auth', null, async (c) => {
    const k = new URL(c.req.url, 'http://x').searchParams.get('kutu') === 'atadigim' ? 'atadigim' : 'bana';
    const q = `SELECT g.*, a.ad atanan, o.ad olusturan FROM gorev g JOIN users a ON a.id=g.atanan_id JOIN users o ON o.id=g.olusturan_id WHERE ${k === 'bana' ? 'g.atanan_id=?' : 'g.olusturan_id=? AND g.atanan_id<>g.olusturan_id'} ORDER BY (g.durum='Tamamlandı'), CASE g.oncelik WHEN 'Yüksek' THEN 0 WHEN 'Normal' THEN 1 ELSE 2 END, COALESCE(g.son_tarih,'9999'), g.id DESC LIMIT 300`;
    return [200, db.prepare(q).all(c.user.id)];
  });
  R('POST', '/api/gorev', 'auth', null, async (c) => {
    const b = c.body || {}, baslik = str(b.baslik, 140); if (!baslik) throw new Err(400, 'Görev başlığını yazın.');
    const atanan = b.atanan_id ? kisi(b.atanan_id).id : c.user.id, st = String(b.son_tarih || ''); if (st && !/^\d{4}-\d{2}-\d{2}$/.test(st)) throw new Err(400, 'Tarih geçersiz.');
    const onc = ONC.includes(b.oncelik) ? b.oncelik : 'Normal';
    const id = +db.prepare('INSERT INTO gorev(baslik,aciklama,olusturan_id,atanan_id,son_tarih,oncelik) VALUES(?,?,?,?,?,?)').run(baslik, str(b.aciklama, 1000) || null, c.user.id, atanan, st || null, onc).lastInsertRowid;
    if (atanan !== c.user.id) db.prepare('INSERT INTO ic_mesaj(gonderen_id,alici_id,konu,govde) VALUES(?,?,?,?)').run(c.user.id, atanan, 'Yeni görev: ' + baslik, `${c.user.ad} size bir görev atadı.${st ? ' Son tarih: ' + st + '.' : ''}\n\nGörev Takibi sayfasından durumunu güncelleyebilirsiniz.`);
    return [200, { id }];
  });
  R('PUT', '/api/gorev/([0-9]+)', 'auth', null, async (c) => {
    const g = db.prepare('SELECT * FROM gorev WHERE id=?').get(+c.m[1]); if (!g || (g.atanan_id !== c.user.id && g.olusturan_id !== c.user.id)) throw new Err(404, 'Görev yok.');
    const d = (c.body || {}).durum; if (!DUR.includes(d)) throw new Err(400, 'Durum geçersiz.');
    db.prepare('UPDATE gorev SET durum=?, bitis=? WHERE id=?').run(d, d === 'Tamamlandı' ? new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : null, g.id);
    if (d === 'Tamamlandı' && g.olusturan_id !== c.user.id) db.prepare('INSERT INTO ic_mesaj(gonderen_id,alici_id,konu,govde) VALUES(?,?,?,?)').run(c.user.id, g.olusturan_id, 'Görev tamamlandı: ' + g.baslik, `${c.user.ad} atadığınız görevi tamamladı.`);
    return [200, { ok: 1 }];
  });
  R('DELETE', '/api/gorev/([0-9]+)', 'auth', null, async (c) => { const g = db.prepare('SELECT * FROM gorev WHERE id=?').get(+c.m[1]); if (!g || g.olusturan_id !== c.user.id) throw new Err(404, 'Görev yok ya da silme yetkiniz yok.'); db.prepare('DELETE FROM gorev WHERE id=?').run(g.id); return [200, { ok: 1 }]; });
};
