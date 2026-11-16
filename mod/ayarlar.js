// Ayarlar modülü: ülkeler, partner kurumlar, banka hesapları, bağış türleri.
module.exports = function (ctx) {
  const { R, Err, db, tx, str, ip, A, usage, used } = ctx;
  db.exec(`
CREATE TABLE IF NOT EXISTS ulkeler(id INTEGER PRIMARY KEY, ad TEXT NOT NULL UNIQUE COLLATE NOCASE, kita TEXT NOT NULL DEFAULT 'Diğer');
CREATE TABLE IF NOT EXISTS partnerler(id INTEGER PRIMARY KEY, tur TEXT NOT NULL, ad TEXT NOT NULL UNIQUE COLLATE NOCASE, bilgi TEXT NOT NULL DEFAULT '{}',
  yad TEXT NOT NULL, yg TEXT, yt TEXT NOT NULL, ye TEXT, adres TEXT, notu TEXT, aktif INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS banka_hesaplari(id INTEGER PRIMARY KEY, banka TEXT NOT NULL, hesap TEXT NOT NULL, iban TEXT NOT NULL UNIQUE, para TEXT NOT NULL DEFAULT 'TL');
CREATE TABLE IF NOT EXISTS kategoriler(id INTEGER PRIMARY KEY, ad TEXT NOT NULL UNIQUE COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS bagis_turleri(
  id INTEGER PRIMARY KEY, kat TEXT NOT NULL COLLATE NOCASE, ad TEXT NOT NULL COLLATE NOCASE,
  org TEXT NOT NULL DEFAULT 'Genel' CHECK(org IN ('Genel','Kurban','Su kuyusu','Diğer')),
  cap INTEGER, fiyat REAL, birim TEXT, tam INTEGER NOT NULL DEFAULT 0, sertifika INTEGER NOT NULL DEFAULT 0,
  ulke TEXT, kuyu TEXT, seri TEXT, web INTEGER NOT NULL DEFAULT 1, UNIQUE(kat, ad));
`);
  const nm = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const num = (v) => Number(v);
  const digits = (s) => String(s || '').replace(/\D/g, '');

  // ---- ilk kurulum verisi: varsayılan ülkeler, kategori ve türler (silinip değiştirilebilir)
  if (!db.prepare('SELECT 1 FROM ulkeler').get()) {
    const i = db.prepare('INSERT INTO ulkeler(ad,kita) VALUES(?,?)');
    [['Çad', 'Afrika'], ['Nijer', 'Afrika'], ['Mali', 'Afrika'], ['Somali', 'Afrika'], ['Burkina Faso', 'Afrika'], ['Afganistan', 'Asya'], ['Pakistan', 'Asya'], ['Bangladeş', 'Asya']].forEach(x => i.run(...x));
  }
  if (!db.prepare('SELECT 1 FROM bagis_turleri').get()) {
    db.prepare("INSERT OR IGNORE INTO kategoriler(ad) VALUES('Genel bağış')").run();
    const g = db.prepare("INSERT INTO bagis_turleri(kat,ad) VALUES('Genel bağış',?)"); ['Fitre', 'Zekât', 'Sadaka'].forEach(x => g.run(x));
    const k = db.prepare("INSERT INTO bagis_turleri(kat,ad,org,cap,fiyat,birim,tam,seri) VALUES('Kurban',?,'Kurban',?,?,?,?,?)");
    [['Vacip', 'Vacip'], ['Adak', 'Adak'], ['Akika', 'Akika']].forEach(([tur]) => { k.run(`${tur} · hisseli büyükbaş`, 7, 4000, 'Grup', 0, tur); k.run(`${tur} · küçükbaş`, 1, 7000, 'Kurban', 0, tur); });
    k.run('Tam büyükbaş (7 isim)', 7, 4000, 'Grup', 1, 'Tam büyükbaş');
  }

  // ---- ülkeler
  R('GET', '/api/ulkeler', 'ulke|orgK|orgS|orgD|turler', 'g', async () => [200, db.prepare('SELECT * FROM ulkeler ORDER BY ad').all().map(u => ({ ...u, kullanim: used('ulke', u.ad) }))]);
  R('POST', '/api/ulkeler', 'ulke', 'e', async (c) => {
    const ad = str(c.body.ad, 60), kita = ['Afrika', 'Asya', 'Avrupa', 'Diğer'].includes(c.body.kita) ? c.body.kita : 'Diğer';
    if (!ad) throw new Err(400, 'Ülke adını yazın.');
    if (db.prepare('SELECT ad FROM ulkeler').all().some(x => nm(x.ad) === nm(ad))) throw new Err(409, 'Bu ülke zaten var.');
    const id = +db.prepare('INSERT INTO ulkeler(ad,kita) VALUES(?,?)').run(ad, kita).lastInsertRowid; A.audit(c.user, 'ulke_eklendi', ad, ip(c.req)); return [201, { id }];
  });
  R('DELETE', '/api/ulkeler/:id', 'ulke', 's', async (c) => {
    const u = db.prepare('SELECT * FROM ulkeler WHERE id=?').get(+c.m[1]); if (!u) throw new Err(404, 'Ülke yok.');
    if (used('ulke', u.ad)) throw new Err(409, 'Bu ülke kullanımda, silinemez.');
    db.prepare('DELETE FROM ulkeler WHERE id=?').run(u.id); A.audit(c.user, 'ulke_silindi', u.ad, ip(c.req)); return [200, { ok: 1 }];
  });
  usage.ulke.push((ad) => db.prepare('SELECT COUNT(*) n FROM bagis_turleri WHERE ulke=?').get(ad).n);

  // ---- partner kurumlar
  const PF = {
    'Şirket': ['unv', 'vd', 'vn', 'mersis', 'sicil'], 'Yabancı şirket': ['ulke', 'vn', 'sicil'],
    'Dernek': ['kutuk', 'tuzuk', 'vd', 'vn'], 'Vakıf': ['sicil', 'senet', 'vd', 'vn']
  };
  const prow = (r) => ({ id: r.id, tur: r.tur, ad: r.ad, ...JSON.parse(r.bilgi), yad: r.yad, yg: r.yg, yt: r.yt, ye: r.ye, adres: r.adres, notu: r.notu, kullanim: used('partner', r.ad) });
  function pvalid(b, skip) {
    const tur = b.tur; if (!PF[tur]) throw new Err(400, 'Kurum türünü seçin.');
    const ad = str(b.ad, 80); if (!ad) throw new Err(400, 'Kısa adı yazın.');
    if (!str(b.yad)) throw new Err(400, 'Yetkili kişinin adını yazın.');
    if (digits(b.yt).length < 10) throw new Err(400, 'Yetkili telefonunu yazın.');
    if (b.ye && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(b.ye).trim())) throw new Err(400, 'Yetkili e-postası geçersiz.');
    const bilgi = {}; PF[tur].forEach(k => { const v = str(b[k], 120); if (v) bilgi[k] = v; });
    if (PF[tur].includes('vn') && tur !== 'Yabancı şirket' && digits(bilgi.vn).length !== 10) throw new Err(400, 'Vergi no 10 haneli olmalı.');
    if (tur === 'Yabancı şirket' && (!bilgi.ulke || !bilgi.vn)) throw new Err(400, 'Ülke ve vergi / kayıt numarasını yazın.');
    if (db.prepare('SELECT ad,id FROM partnerler').all().some(x => x.id !== skip && nm(x.ad) === nm(ad))) throw new Err(409, 'Bu kısa ad zaten var.');
    return { tur, ad, bilgi: JSON.stringify(bilgi), yad: str(b.yad), yg: str(b.yg, 60) || null, yt: str(b.yt, 30), ye: str(b.ye, 120) || null, adres: str(b.adres, 250) || null, notu: str(b.notu, 250) || null };
  }
  R('GET', '/api/partnerler', 'partner|orgK|orgS|orgD', 'g', async () => [200, db.prepare('SELECT * FROM partnerler ORDER BY ad').all().map(prow)]);
  R('POST', '/api/partnerler', 'partner', 'e', async (c) => {
    const v = pvalid(c.body, 0); const id = +db.prepare('INSERT INTO partnerler(tur,ad,bilgi,yad,yg,yt,ye,adres,notu) VALUES(?,?,?,?,?,?,?,?,?)').run(v.tur, v.ad, v.bilgi, v.yad, v.yg, v.yt, v.ye, v.adres, v.notu).lastInsertRowid;
    A.audit(c.user, 'partner_eklendi', v.ad, ip(c.req)); return [201, { id }];
  });
  R('PUT', '/api/partnerler/:id', 'partner', 'd', async (c) => {
    const id = +c.m[1], o = db.prepare('SELECT * FROM partnerler WHERE id=?').get(id); if (!o) throw new Err(404, 'Kurum yok.');
    const v = pvalid(c.body, id);
    return tx(() => {
      db.prepare('UPDATE partnerler SET tur=?,ad=?,bilgi=?,yad=?,yg=?,yt=?,ye=?,adres=?,notu=? WHERE id=?').run(v.tur, v.ad, v.bilgi, v.yad, v.yg, v.yt, v.ye, v.adres, v.notu, id);
      if (nm(o.ad) !== nm(v.ad) || o.ad !== v.ad) (ctx.renamePartner || (() => { }))(o.ad, v.ad); // birimlerdeki kurum adı güncellenir
      A.audit(c.user, 'partner_guncellendi', v.ad, ip(c.req)); return [200, { ok: 1 }];
    });
  });
  R('DELETE', '/api/partnerler/:id', 'partner', 's', async (c) => {
    const o = db.prepare('SELECT * FROM partnerler WHERE id=?').get(+c.m[1]); if (!o) throw new Err(404, 'Kurum yok.');
    if (used('partner', o.ad)) throw new Err(409, 'Bu kuruma atanmış kayıtlar var, silinemez.');
    db.prepare('DELETE FROM partnerler WHERE id=?').run(o.id); A.audit(c.user, 'partner_silindi', o.ad, ip(c.req)); return [200, { ok: 1 }];
  });

  // ---- banka hesapları
  const ibanOk = (s) => { s = s.replace(/\s/g, '').toUpperCase(); if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false; if (s.startsWith('TR') && s.length !== 26) return false; const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (ch) => ch.charCodeAt(0) - 55); let m = 0; for (const d of r) m = (m * 10 + +d) % 97; return m === 1; };
  const BANKALAR = ['Ziraat Bankası', 'Halkbank', 'VakıfBank', 'Kuveyt Türk', 'Albaraka Türk', 'Türkiye Finans', 'Ziraat Katılım', 'Vakıf Katılım', 'Emlak Katılım', 'Akbank', 'Garanti BBVA', 'İş Bankası', 'Yapı Kredi', 'QNB', 'DenizBank', 'TEB', 'ING', 'HSBC', 'Şekerbank', 'Fibabanka', 'Odeabank', 'Anadolubank', 'Alternatif Bank', 'Burgan Bank', 'ICBC Turkey', 'Turkland Bank', 'Enpara', 'Diğer'];
  R('GET', '/api/banka', 'banka|alin', 'g', async () => [200, { bankalar: BANKALAR, hesaplar: db.prepare('SELECT * FROM banka_hesaplari ORDER BY id').all().map(h => ({ ...h, kullanim: used('banka', h.id) })) }]);
  R('POST', '/api/banka', 'banka', 'e', async (c) => {
    const banka = str(c.body.banka, 60), hesap = str(c.body.hesap, 80), iban = String(c.body.iban || '').replace(/\s/g, '').toUpperCase(), para = ['TL', 'USD', 'EUR'].includes(c.body.para) ? c.body.para : 'TL';
    if (!banka || !hesap) throw new Err(400, 'Banka ve hesap adını yazın.');
    if (!ibanOk(iban)) throw new Err(400, 'IBAN geçersiz. Örnek: TR33 0006 1005 1978 6457 8413 26');
    if (db.prepare('SELECT 1 FROM banka_hesaplari WHERE iban=?').get(iban)) throw new Err(409, 'Bu IBAN zaten kayıtlı.');
    const id = +db.prepare('INSERT INTO banka_hesaplari(banka,hesap,iban,para) VALUES(?,?,?,?)').run(banka, hesap, iban.replace(/(.{4})/g, '$1 ').trim(), para).lastInsertRowid;
    A.audit(c.user, 'banka_eklendi', `${banka} ${hesap}`, ip(c.req)); return [201, { id }];
  });
  R('DELETE', '/api/banka/:id', 'banka', 's', async (c) => {
    const h = db.prepare('SELECT * FROM banka_hesaplari WHERE id=?').get(+c.m[1]); if (!h) throw new Err(404, 'Hesap yok.');
    if (used('banka', h.id)) throw new Err(409, 'Bu hesaba gelen bağış var, silinemez.');
    db.prepare('DELETE FROM banka_hesaplari WHERE id=?').run(h.id); A.audit(c.user, 'banka_silindi', h.banka, ip(c.req)); return [200, { ok: 1 }];
  });

  // ---- bağış türleri
  const trs = (n) => Number(n).toLocaleString('tr-TR');
  const trow = (r) => ({ id: r.id, kat: r.kat, ad: r.ad, org: r.org, cap: r.cap, fiyat: r.fiyat, birim: r.birim, tam: !!r.tam, sertifika: !!r.sertifika, ulke: r.ulke, kuyu: r.kuyu ? JSON.parse(r.kuyu) : null, seri: r.seri, kullanim: used('tur', r.id) });
  R('GET', '/api/turler', 'turler|alin|orgK|orgS|orgD|spage|sform', 'g', async () => {
    const turler = db.prepare('SELECT * FROM bagis_turleri ORDER BY id').all().map(trow), kat = db.prepare('SELECT ad FROM kategoriler ORDER BY id').all().map(x => x.ad);
    return [200, { kategoriler: kat, turler }];
  });
  R('POST', '/api/kategoriler', 'turler', 'e', async (c) => {
    const ad = str(c.body.ad, 60); if (!ad) throw new Err(400, 'Ana kategori adını yazın.');
    if (['kurban', 'su kuyusu'].includes(nm(ad)) || db.prepare('SELECT ad FROM kategoriler').all().some(x => nm(x.ad) === nm(ad))) throw new Err(409, 'Bu ana kategori zaten var.');
    db.prepare('INSERT INTO kategoriler(ad) VALUES(?)').run(ad); A.audit(c.user, 'kategori_eklendi', ad, ip(c.req)); return [201, { ok: 1 }];
  });
  R('DELETE', '/api/kategoriler', 'turler', 's', async (c) => {
    const ad = str(c.body.ad || new URL(c.req.url, 'http://x').searchParams.get('ad'), 60);
    if (db.prepare('SELECT 1 FROM bagis_turleri WHERE kat=?').get(ad)) throw new Err(409, 'Bu ana kategoride alt kategori var.');
    db.prepare('DELETE FROM kategoriler WHERE ad=?').run(ad); return [200, { ok: 1 }];
  });
  R('POST', '/api/turler', 'turler', 'e', async (c) => {
    const b = c.body, sec = b.sec, cert = b.sertifika ? 1 : 0; let o;
    if (sec === 'kuyu') {
      const nv = str(b.ad, 80), bic = b.bicim, f = num(b.fiyat) || 0, pay = num(b.pay) || 0;
      if (!nv) throw new Err(400, 'Alt kategori adını yazın (örn. Bangladeş - Şadırvan).');
      if (!['Tam fiyat', 'Hisseli', 'Katılım', 'Fon'].includes(bic)) throw new Err(400, 'Toplama biçimini seçin.');
      if (f <= 0) throw new Err(400, 'Fiyat ya da hedef tutarı girin.');
      const part = bic === 'Hisseli' || bic === 'Katılım'; if (part && pay <= 0) throw new Err(400, 'Pay bedelini girin.');
      if (part && f % pay) throw new Err(400, 'Kuyu fiyatı pay bedeline tam bölünmeli.');
      const m = nv.match(/^(.+?)\s+[-–·]\s+(.+)$/), ct = m && db.prepare('SELECT ad FROM ulkeler').all().find(x => nm(x.ad) === nm(m[1])), tip = ct ? m[2] : nv, fon = bic === 'Fon', tam = bic === 'Tam fiyat';
      const s = fon ? `${nv} · Fon (hedef ${trs(f)} ₺)` : tam ? `${nv} · Tam fiyat (${trs(f)} ₺)` : bic === 'Hisseli' ? `${nv} · Hisseli (${trs(pay)} ₺ pay)` : `${nv} · Katılım (${trs(pay)} ₺)`;
      o = { kat: 'Su kuyusu', ad: s, org: 'Su kuyusu', cap: fon ? f : tam ? 1 : f / pay, fiyat: fon ? null : (tam ? f : pay), birim: 'Kuyu', ulke: ct ? ct.ad : null, kuyu: JSON.stringify({ tip, bicim: bic, fiyat: f, pay: part ? pay : 0, ad: fon ? nv : '', web: true }), seri: tip, tam: 0 };
    } else if (sec === 'kurban') {
      const hv = b.hayvan, kt = str(b.tur, 40), p = num(b.fiyat) || 0, tam = hv === 'tam', kucuk = hv === 'kucuk';
      if (!['hisse', 'kucuk', 'tam'].includes(hv)) throw new Err(400, 'Hayvan seçin.');
      if (!tam && !kt) throw new Err(400, 'Kurban türünü yazın (Vacip, Adak, Akika…).');
      if (!p) throw new Err(400, 'Bedeli girin.');
      const s = tam ? 'Tam büyükbaş (7 isim)' : `${kt} · ${kucuk ? 'küçükbaş' : 'hisseli büyükbaş'}`;
      o = { kat: 'Kurban', ad: s, org: 'Kurban', cap: kucuk ? 1 : 7, fiyat: p, birim: kucuk ? 'Kurban' : 'Grup', tam: tam ? 1 : 0, seri: tam ? 'Tam büyükbaş' : kt };
    } else {
      const kat = str(b.kat, 60), ad = str(b.ad, 80), vb = !!b.videolu;
      if (!db.prepare('SELECT 1 FROM kategoriler WHERE ad=?').get(kat)) throw new Err(400, 'Ana kategori bulunamadı.');
      if (!ad) throw new Err(400, 'Alt kategori adını yazın.');
      const p = num(b.tutar) || 0;
      if (vb && !p) throw new Err(400, 'Adet başına sabit tutarı girin.');
      if (!vb && b.tutar_modu === 'Sabit tutar' && !p) throw new Err(400, 'Sabit tutarı girin.');
      o = { kat, ad, org: vb ? 'Diğer' : 'Genel', cap: vb ? 1 : null, fiyat: vb ? p : (b.tutar_modu === 'Sabit tutar' ? p : null), birim: vb ? ad : null, seri: vb ? ad : null, tam: 0 };
    }
    if (db.prepare('SELECT kat,ad FROM bagis_turleri').all().some(x => nm(x.kat) === nm(o.kat) && nm(x.ad) === nm(o.ad))) throw new Err(409, 'Bu tür zaten var.');
    const id = +db.prepare('INSERT INTO bagis_turleri(kat,ad,org,cap,fiyat,birim,tam,sertifika,ulke,kuyu,seri) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(o.kat, o.ad, o.org, o.cap ?? null, o.fiyat ?? null, o.birim ?? null, o.tam || 0, cert, o.ulke ?? null, o.kuyu ?? null, o.seri ?? null).lastInsertRowid;
    A.audit(c.user, 'tur_eklendi', `${o.kat} / ${o.ad}`, ip(c.req)); return [201, { id, ad: o.ad, org: o.org, ulke: o.ulke }];
  });
  R('DELETE', '/api/turler/:id', 'turler', 's', async (c) => {
    const o = db.prepare('SELECT * FROM bagis_turleri WHERE id=?').get(+c.m[1]); if (!o) throw new Err(404, 'Tür yok.');
    if (used('tur', o.id)) throw new Err(409, 'Bu türde bağış var, silinemez.');
    db.prepare('DELETE FROM bagis_turleri WHERE id=?').run(o.id); A.audit(c.user, 'tur_silindi', `${o.kat} / ${o.ad}`, ip(c.req)); return [200, { ok: 1 }];
  });
};
