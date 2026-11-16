// Banka hareketleri: hesaba gelen paralar önce "eşleştirme bekleyen" kuyruğuna düşer; hiçbiri kendiliğinden bağış olmaz.
// Kaynaklar: (1) ekstre dosyası/metni (CSV veya MT940), (2) banka/aracı yazılımın gönderdiği API ucu. Öneri: referans kodu, telefon, öğrenilmiş ad, ad benzerliği.
const crypto = require('crypto');
module.exports = function (ctx) {
  const { R, Err, db, str, ip, A } = ctx;
  db.exec(`CREATE TABLE IF NOT EXISTS banka_hareket(id INTEGER PRIMARY KEY, hesap_id INTEGER NOT NULL, tarih TEXT NOT NULL, tutar REAL NOT NULL, aciklama TEXT, gonderen TEXT, ref TEXT, hash TEXT NOT NULL UNIQUE,
    durum TEXT NOT NULL DEFAULT 'Bekliyor', bagis_id INTEGER, islem_kullanici TEXT, islem_zaman TEXT, yoksay_sebep TEXT, kaynak TEXT NOT NULL DEFAULT 'Dosya', kayit TEXT NOT NULL DEFAULT (datetime('now','localtime')));
  CREATE TABLE IF NOT EXISTS banka_esles(anahtar TEXT PRIMARY KEY, bagisci_id INTEGER NOT NULL, tur_id INTEGER, sayi INTEGER NOT NULL DEFAULT 1, son TEXT);`);
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const nmz = (t) => String(t || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const tutarOku = (v) => { let t = String(v || '').replace(/[^\d.,\-]/g, ''); if (!t) return NaN; const neg = t.startsWith('-'); t = t.replace(/-/g, ''); const lv = t.lastIndexOf(','), ld = t.lastIndexOf('.'); if (lv >= 0 && ld >= 0) t = lv > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''); else if (lv >= 0) t = t.replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); const n = parseFloat(t); return neg ? -n : n; };
  const tarihOku = (v) => { v = String(v || '').trim(); let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(v); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); return m ? m[0] : null; };
  // ---- ekstre ayrıştırma
  function csvParse(metin) {
    const L = String(metin || '').replace(/\r/g, '').split('\n').filter(l => l.trim());
    const say = (ch) => (L[0].match(new RegExp(ch === '\t' ? '\t' : '\\' + ch, 'g')) || []).length, ayr = [';', '\t', ','].sort((a, b) => say(b) - say(a))[0];
    const bol = (l) => { const o = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ayr && !q) { o.push(cur); cur = ''; } else cur += ch; } o.push(cur); return o.map(x => x.trim()); };
    const hi = L.findIndex(l => { const n = nmz(l); return n.includes('tarih') && n.includes('aciklama') && /tutar|alacak|giris/.test(n); }); if (hi < 0) throw new Err(400, 'Başlık satırı bulunamadı: Tarih, Açıklama ve Tutar (veya Alacak) sütunları gerekli. Banka ekstresini başlık satırıyla birlikte yapıştırın.');
    const H = bol(L[hi]).map(nmz), ix = (re) => H.findIndex(x => re.test(x)), it = ix(/tarih/), ia = ix(/aciklama/), iu = ix(/^(tutar|islem tutari|alacak|giris)/), ig = ix(/gonderen|unvan|isim|ad soyad|karsi/), ir = ix(/dekont|referans|ref |islem no|fis/);
    if (iu < 0) throw new Err(400, 'Tutar / Alacak sütunu bulunamadı.');
    return L.slice(hi + 1).map(l => { const c = bol(l); return { tarih: tarihOku(c[it]), tutar: tutarOku(c[iu]), gonderen: ig >= 0 ? c[ig] || '' : '', aciklama: ia >= 0 ? c[ia] || '' : '', ref: ir >= 0 ? c[ir] || '' : '' }; });
  }
  function mt940Parse(metin) { // :61: işlem satırı + :86: açıklama
    const out = [], parts = String(metin).replace(/\r/g, '').split(/\n(?=:\d{2}[A-Z]?:)/); let cur = null;
    for (const p of parts) {
      const m = /^:(\d{2}[A-Z]?):([\s\S]*)$/.exec(p.trim()); if (!m) continue;
      if (m[1] === '61') { const r = /^(\d{2})(\d{2})(\d{2})(?:\d{4})?(R?[CD])([A-Z])?([\d,]+)/.exec(m[2].replace(/\n.*/s, '')); cur = null; if (!r) continue; const yil = (+r[1] > 70 ? '19' : '20') + r[1]; cur = { tarih: `${yil}-${r[2]}-${r[3]}`, tutar: (r[4] === 'C' ? 1 : -1) * tutarOku(r[6]), gonderen: '', aciklama: '', ref: (/\/\/(\S+)/.exec(m[2]) || [])[1] || '' }; out.push(cur); }
      else if (m[1] === '86' && cur) { cur.aciklama = m[2].replace(/\n/g, ' ').replace(/\?\d{2}/g, ' ').replace(/\s+/g, ' ').trim(); cur = null; }
    }
    return out;
  }
  const hh = (hid, r) => crypto.createHash('sha1').update(`${hid}|${r.tarih}|${(+r.tutar).toFixed(2)}|${nmz(r.gonderen + ' ' + r.aciklama)}|${r.ref || ''}`).digest('hex');
  function ekle(hid, rows, kaynak) {
    let eklenen = 0, tekrar = 0, atlanan = 0; const ins = db.prepare('INSERT OR IGNORE INTO banka_hareket(hesap_id,tarih,tutar,aciklama,gonderen,ref,hash,kaynak) VALUES(?,?,?,?,?,?,?,?)');
    for (const r of rows) { if (!r.tarih || !(r.tutar > 0)) { atlanan++; continue; } if (r.tarih > today()) { atlanan++; continue; } const x = ins.run(hid, r.tarih, Math.round(r.tutar * 100) / 100, String(r.aciklama || '').slice(0, 400), String(r.gonderen || '').slice(0, 120), String(r.ref || '').slice(0, 60), hh(hid, r), kaynak); if (x.changes) eklenen++; else tekrar++; }
    return { eklenen, tekrar, atlanan };
  }
  // ---- öneri
  const tel10 = (t) => { const d = String(t).replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
  function oner(h, B, S, T) {
    const metin = (h.gonderen + ' ' + h.aciklama), nt = nmz(metin), o = { tip: null, bagisci_id: null, sponsorluk_id: null, tur_id: null, guven: 'yok', nedenler: [], adaylar: [] };
    const bSet = (b, guven, neden) => { if (!o.bagisci_id) { o.bagisci_id = b.id; o.guven = guven; } o.nedenler.push(neden); };
    // 1) referans kodu
    const km = /\bsp[\s\-_]?0*(\d{1,6})\b/i.exec(metin), sk = km && S.find(x => x.id === +km[1]);
    if (sk) { o.tip = 'sponsorluk'; o.sponsorluk_id = sk.id; o.bagisci_id = sk.bagisci_id; o.guven = Math.abs(h.tutar - sk.aylik) < 0.5 ? 'yuksek' : 'orta'; o.nedenler.push('Referans kodu ' + sk.kod + (Math.abs(h.tutar - sk.aylik) < 0.5 ? '' : ' (tutar aylık tutardan farklı)')); }
    // 2) açıklamadaki telefon
    if (!o.bagisci_id) { const m = metin.match(/(?:\+?90[\s-]?)?0?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g) || []; for (const x of m) { const b = B.find(z => tel10(z.tel) === tel10(x)); if (b) { bSet(b, 'yuksek', 'Telefon açıklamada geçiyor'); break; } } }
    // 3) önceden öğrenilmiş gönderen adı
    const key = nmz(h.gonderen), ogr = key && db.prepare('SELECT * FROM banka_esles WHERE anahtar=?').get(key);
    if (ogr && !o.bagisci_id) { const b = B.find(z => z.id === ogr.bagisci_id); if (b) { bSet(b, ogr.sayi >= 2 ? 'yuksek' : 'orta', `Daha önce ${ogr.sayi} kez bu gönderen ${b.ad} olarak eşleştirildi`); if (ogr.tur_id) o.tur_id = ogr.tur_id; } }
    // 4) ad benzerliği
    if (!o.bagisci_id) {
      const tam = B.filter(b => { const tk = nmz(b.ad).split(' ').filter(t => t.length > 1); return tk.length >= 2 && tk.every(t => nt.includes(t)); });
      if (tam.length === 1) bSet(tam[0], 'orta', 'Ad soyad eşleşti'); else if (tam.length > 1) o.adaylar = tam.slice(0, 5).map(b => ({ id: b.id, ad: b.ad, tel: b.tel }));
      else { const ilk = B.filter(b => { const tk = nmz(b.ad).split(' '); return tk.length >= 2 && nt.split(' ').includes(tk[0]) && nt.split(' ').some(w => w.length === 1 && w === tk[tk.length - 1][0]); }); if (ilk.length) o.adaylar = ilk.slice(0, 5).map(b => ({ id: b.id, ad: b.ad, tel: b.tel })); }
    }
    // 5) bağışçının aynı tutarlı aktif sponsorluğu var mı?
    if (!o.sponsorluk_id && o.bagisci_id) { const ls = S.filter(x => x.bagisci_id === o.bagisci_id && Math.abs(x.aylik - h.tutar) < 0.5); if (ls.length === 1) { o.tip = 'sponsorluk'; o.sponsorluk_id = ls[0].id; o.nedenler.push('Tutar, sponsorluğun aylık tutarıyla aynı (' + ls[0].kod + ')'); if (o.guven === 'yuksek') o.guven = 'orta'; } }
    if (o.bagisci_id && !o.tip) o.tip = 'bagis';
    // tür önerisi
    if (!o.tur_id && o.tip === 'bagis') { const kw = [['fitre', 'fitre'], ['zekat', 'zek'], ['sadaka', 'sadaka'], ['kurban', 'kurban'], ['kuyu', 'kuyu'], ['burs', 'burs'], ['yetim', 'yetim'], ['hafiz', 'hafiz']]; for (const [w, a] of kw) { if (nt.includes(w)) { const t = T.find(x => nmz(x.ad).includes(a)); if (t) { o.tur_id = t.id; o.nedenler.push('Açıklamada “' + w + '” geçiyor'); break; } } } if (!o.tur_id) { const son = db.prepare("SELECT tur_id FROM bagislar WHERE bagisci_id=? AND durum<>'İptal' ORDER BY id DESC LIMIT 1").get(o.bagisci_id); if (son) o.tur_id = son.tur_id; } }
    return o;
  }
  const baglam = () => ({ B: db.prepare('SELECT id,ad,tel FROM bagiscilar').all(), S: db.prepare("SELECT * FROM sp_sponsorluk WHERE durum='Aktif'").all().map(ctx.sponsor.sRow), T: db.prepare('SELECT id,kat,ad,fiyat,kuyu FROM bagis_turleri ORDER BY kat,ad').all() });
  R('GET', '/api/banka/hareketler', 'bhar', 'g', async (c) => {
    const p = new URL(c.req.url, 'http://x').searchParams, d = ['Bekliyor', 'Tamamlandı', 'Yoksayıldı'].includes(p.get('durum')) ? p.get('durum') : 'Bekliyor', { B, S, T } = baglam(), hs = db.prepare('SELECT id,banka,hesap,para FROM banka_hesaplari').all();
    const L = db.prepare('SELECT * FROM banka_hareket WHERE durum=? ORDER BY tarih DESC, id DESC LIMIT 300').all(d).map(h => ({ ...h, hash: undefined, hesap: (hs.find(x => x.id === h.hesap_id) || {}).banka, para: (hs.find(x => x.id === h.hesap_id) || {}).para, bagis_no: h.bagis_id ? (db.prepare('SELECT no FROM bagislar WHERE id=?').get(h.bagis_id) || {}).no : null, oneri: d === 'Bekliyor' ? oner(h, B, S, T) : null }));
    const bil = new Map(B.map(b => [b.id, b])); L.forEach(h => { if (h.oneri && h.oneri.bagisci_id) { const b = bil.get(h.oneri.bagisci_id); h.oneri.bagisci_ad = b.ad; h.oneri.bagisci_tel = b.tel; } if (h.oneri && h.oneri.sponsorluk_id) { const s = S.find(x => x.id === h.oneri.sponsorluk_id); h.oneri.sponsorluk = s && { kod: s.kod, ogrenci: s.ogrenci, aylik: s.aylik, para: s.para, gecikme_ay: s.gecikme_ay }; } });
    const say = (x) => db.prepare('SELECT COUNT(*) n, COALESCE(SUM(tutar),0) t FROM banka_hareket WHERE durum=?').get(x);
    return [200, { liste: L, durum: d, ozet: { bekliyor: say('Bekliyor'), tamam: say('Tamamlandı'), yoksay: say('Yoksayıldı') }, hesaplar: hs, turler: T.map(t => ({ id: t.id, kat: t.kat, ad: t.ad, fiyat: t.fiyat })), sponsorluklar: S.map(s => ({ id: s.id, kod: s.kod, sponsor: s.sponsor, ogrenci: s.ogrenci, aylik: s.aylik, para: s.para })) }];
  });
  R('POST', '/api/banka/ice-aktar', 'bhar', 'e', async (c) => {
    const b = c.body || {}, hs = db.prepare('SELECT * FROM banka_hesaplari WHERE id=?').get(+b.hesap_id); if (!hs) throw new Err(400, 'Ekstrenin ait olduğu banka hesabını seçin.');
    const metin = String(b.metin || ''); if (metin.length < 20) throw new Err(400, 'Ekstre metnini yapıştırın veya dosya seçin.');
    const rows = /:61:/.test(metin) ? mt940Parse(metin) : csvParse(metin); if (!rows.length) throw new Err(400, 'Ekstrede işlenecek satır bulunamadı.'); if (rows.length > 3000) throw new Err(400, 'Tek seferde en çok 3000 satır alınır.');
    const r = ekle(hs.id, rows, 'Dosya'); A.audit(c.user, 'banka_ice_aktarim', `${r.eklenen} yeni hareket`, ip(c.req)); return [200, { ...r, format: /:61:/.test(metin) ? 'MT940' : 'CSV' }];
  });
  // Banka / aracı yazılım bağlayıcısı (x-api-key): hareketler yine kuyruğa düşer
  const dis = (req) => { const k = req.headers['x-api-key']; if (!(k && db.prepare('SELECT 1 FROM api_anahtar WHERE hash=? AND aktif=1').get(crypto.createHash('sha256').update(String(k)).digest('hex')))) throw new Err(401, 'API anahtarı geçersiz.'); };
  R('POST', '/api/dis/banka-hareket', null, null, async (c) => {
    dis(c.req); const b = c.body || {}, iban = String(b.iban || '').replace(/\s/g, '').toUpperCase(), hs = db.prepare('SELECT * FROM banka_hesaplari').all().find(x => String(x.iban).replace(/\s/g, '').toUpperCase() === iban); if (!hs) throw new Err(404, 'Bu IBAN için tanımlı banka hesabı yok.');
    const L = (Array.isArray(b.hareketler) ? b.hareketler : []).slice(0, 1000).map(x => ({ tarih: tarihOku(x.tarih), tutar: typeof x.tutar === 'number' ? x.tutar : tutarOku(x.tutar), gonderen: str(x.gonderen, 120), aciklama: str(x.aciklama, 400), ref: str(x.ref, 60) }));
    return [200, ekle(hs.id, L, 'API')];
  });
  R('GET', '/api/banka/bagisci-ara', 'bhar', 'd', async (c) => { const q = (new URL(c.req.url, 'http://x').searchParams.get('q') || '').trim(), qd = q.replace(/\D/g, '').replace(/^0+/, ''), tk = nmz(q).split(' ').filter(Boolean); if (q.length < 2) return [200, []]; return [200, db.prepare('SELECT id,ad,tel FROM bagiscilar ORDER BY ad').all().filter(b => (/^[\d\s+\-()]+$/.test(q) ? qd.length >= 3 && b.tel.replace(/\D/g, '').includes(qd) : tk.every(t => nmz(b.ad).includes(t)))).slice(0, 8)]; });
  // ---- tamamla / yoksay
  const bek = (id) => { const h = db.prepare('SELECT * FROM banka_hareket WHERE id=?').get(id); if (!h) throw new Err(404, 'Hareket bulunamadı.'); if (h.durum !== 'Bekliyor') throw new Err(409, 'Bu hareket zaten işlenmiş.'); return h; };
  R('POST', '/api/banka/hareketler/([0-9]+)/tamamla', 'bhar', 'd', async (c) => {
    const h = bek(+c.m[1]), b = c.body || {}, hs = db.prepare('SELECT * FROM banka_hesaplari WHERE id=?').get(h.hesap_id), sk = +b.sponsorluk_id || 0; let bagisId, bagisciId, turId = +b.tur_id || null;
    if (sk) { const s = ctx.sponsor.spo(sk); if (s.durum !== 'Aktif') throw new Err(400, 'Sponsorluk aktif değil.'); if (s.para !== hs.para) throw new Err(400, `Sponsorluk ${s.para}, hesap ${hs.para}: para birimi uyuşmuyor.`); bagisciId = s.bagisci_id; turId = s.tur_id; bagisId = ctx.sponsor.odemeAl(s, { tutar: h.tutar, tarih: h.tarih, odeme: 'Havale/EFT', banka_id: hs.id }, c.user, c.req).id; }
    else {
      if (!turId) throw new Err(400, 'Bağış türünü seçin.'); const t = db.prepare('SELECT * FROM bagis_turleri WHERE id=?').get(turId); if (!t) throw new Err(400, 'Bağış türü bulunamadı.');
      let tel, ad; if (+b.bagisci_id) { const bg = db.prepare('SELECT * FROM bagiscilar WHERE id=?').get(+b.bagisci_id); if (!bg) throw new Err(400, 'Bağışçı bulunamadı.'); tel = bg.tel; ad = bg.ad; } else { ad = str((b.yeni || {}).ad, 80); if (!ad) throw new Err(400, 'Bağışçıyı seçin veya yeni bağışçının adını yazın.'); tel = ctx.normPh((b.yeni || {}).kod || '+90', (b.yeni || {}).tel); const var_ = db.prepare('SELECT id FROM bagiscilar WHERE tel=?').get(tel); if (var_) bagisciId = var_.id; }
      const fon = t.kuyu && (JSON.parse(t.kuyu) || {}).bicim === 'Fon'; let adet = 1; if (t.fiyat && !fon) { adet = Math.round(h.tutar / t.fiyat); if (adet < 1 || Math.abs(adet * t.fiyat - h.tutar) > 0.01) throw new Err(400, `Tutar (${h.tutar}), bu türün birim fiyatının (${t.fiyat}) katı değil. Başka bir tür seçin.`); }
      const r = ctx.bagisOlustur({ kod: '+90', tel, ad, tur_id: turId, adet, tutar: h.tutar, para: hs.para, odeme: 'Havale/EFT', banka_id: hs.id, durum: 'Onaylı', notu: str(b.notu, 300) || ('Banka: ' + (h.gonderen || h.aciklama || '').slice(0, 100)), eposta: (b.yeni || {}).eposta }, c.user, 'Banka', 'BNK-' + h.id, c.req);
      bagisId = r.id; if (h.tarih !== today()) db.prepare('UPDATE bagislar SET tarih=? WHERE id=?').run(h.tarih, r.id); bagisciId = bagisciId || db.prepare('SELECT bagisci_id FROM bagislar WHERE id=?').get(r.id).bagisci_id;
    }
    db.prepare("UPDATE banka_hareket SET durum='Tamamlandı', bagis_id=?, islem_kullanici=?, islem_zaman=datetime('now','localtime') WHERE id=?").run(bagisId, c.user.kadi, h.id);
    const key = nmz(h.gonderen); if (key) db.prepare('INSERT INTO banka_esles(anahtar,bagisci_id,tur_id,sayi,son) VALUES(?,?,?,1,?) ON CONFLICT(anahtar) DO UPDATE SET bagisci_id=?, tur_id=?, sayi=CASE WHEN bagisci_id=? THEN sayi+1 ELSE 1 END, son=?').run(key, bagisciId, turId, today(), bagisciId, turId, bagisciId, today());
    A.audit(c.user, 'banka_hareket_tamam', `#${h.id} → bağış ${bagisId}`, ip(c.req)); return [200, { bagis_id: bagisId, bagis_no: (db.prepare('SELECT no FROM bagislar WHERE id=?').get(bagisId) || {}).no }];
  });
  R('POST', '/api/banka/hareketler/([0-9]+)/yoksay', 'bhar', 'd', async (c) => { const h = bek(+c.m[1]), s = str((c.body || {}).sebep, 120); if (!s) throw new Err(400, 'Yoksayma sebebini yazın (örn. bağış değil, kira, iade).'); db.prepare("UPDATE banka_hareket SET durum='Yoksayıldı', yoksay_sebep=?, islem_kullanici=?, islem_zaman=datetime('now','localtime') WHERE id=?").run(s, c.user.kadi, h.id); return [200, { ok: 1 }]; });
  R('POST', '/api/banka/hareketler/([0-9]+)/yeniden-ac', 'bhar', 'd', async (c) => { const h = db.prepare('SELECT * FROM banka_hareket WHERE id=?').get(+c.m[1]); if (!h || h.durum !== 'Yoksayıldı') throw new Err(400, 'Yalnızca yoksayılan hareket yeniden açılır.'); db.prepare("UPDATE banka_hareket SET durum='Bekliyor', yoksay_sebep=NULL WHERE id=?").run(h.id); return [200, { ok: 1 }]; });
  ctx.bankaBekleyen = () => db.prepare("SELECT COUNT(*) n FROM banka_hareket WHERE durum='Bekliyor'").get().n;
};
