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
    ['Vacip', 'Adak', 'Akika'].forEach(tur => k.run(`${tur} · tam büyükbaş`, 7, 4000, 'Grup', 1, tur));
  }

  db.prepare("UPDATE bagis_turleri SET ad='Vacip · tam büyükbaş', seri='Vacip' WHERE ad='Tam büyükbaş (7 isim)' AND NOT EXISTS(SELECT 1 FROM bagis_turleri WHERE ad='Vacip · tam büyükbaş')").run();
  // ---- ülkeler
  R('GET', '/api/ulkeler', 'ulke|orgK|orgS|orgD|turler', 'g', async () => [200, db.prepare('SELECT * FROM ulkeler ORDER BY ad').all().map(u => ({ ...u, kullanim: used('ulke', u.ad) }))]);
  try { db.exec('ALTER TABLE ulkeler ADD COLUMN bayrak TEXT'); } catch (e) { }
  R('PUT', '/api/ulkeler/([0-9]+)/bayrak', 'ulke', 'e', async (c) => {
    const u = db.prepare('SELECT * FROM ulkeler WHERE id=?').get(+c.m[1]); if (!u) throw new Err(404, 'Ülke yok.');
    const d = c.body.bayrak;
    if (d === null || d === '') { db.prepare('UPDATE ulkeler SET bayrak=NULL WHERE id=?').run(u.id); A.audit(c.user, 'ulke_bayrak_kaldirildi', u.ad, ip(c.req)); return [200, { ok: 1 }]; }
    if (typeof d !== 'string' || !/^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(d)) throw new Err(400, 'Bayrak PNG, JPG, WEBP ya da SVG görseli olmalı.');
    if (d.length > 200000) throw new Err(400, 'Bayrak görseli çok büyük (en fazla yaklaşık 150 KB).');
    db.prepare('UPDATE ulkeler SET bayrak=? WHERE id=?').run(d, u.id); A.audit(c.user, 'ulke_bayrak_yuklendi', u.ad, ip(c.req)); return [200, { ok: 1 }];
  });
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
  const BILGI = { 'Ziraat Bankası': ['T.C. Ziraat Bankası A.Ş.', '#E30A17'], 'Halkbank': ['Türkiye Halk Bankası A.Ş.', '#0066B3'], 'VakıfBank': ['Türkiye Vakıflar Bankası T.A.O.', '#F2B705'], 'Kuveyt Türk': ['Kuveyt Türk Katılım Bankası A.Ş.', '#00A651'], 'Albaraka Türk': ['Albaraka Türk Katılım Bankası A.Ş.', '#00843D'], 'Türkiye Finans': ['Türkiye Finans Katılım Bankası A.Ş.', '#5B2A86'], 'Ziraat Katılım': ['Ziraat Katılım Bankası A.Ş.', '#C8102E'], 'Vakıf Katılım': ['Vakıf Katılım Bankası A.Ş.', '#E59B00'], 'Emlak Katılım': ['Türkiye Emlak Katılım Bankası A.Ş.', '#0A7F3F'], 'Akbank': ['Akbank T.A.Ş.', '#E30613'], 'Garanti BBVA': ['Türkiye Garanti Bankası A.Ş.', '#00A859'], 'İş Bankası': ['Türkiye İş Bankası A.Ş.', '#0A3A8C'], 'Yapı Kredi': ['Yapı ve Kredi Bankası A.Ş.', '#004A97'], 'QNB': ['QNB Bank A.Ş.', '#7A1F5C'], 'DenizBank': ['DenizBank A.Ş.', '#0069B4'], 'TEB': ['Türk Ekonomi Bankası A.Ş.', '#00A651'], 'ING': ['ING Bank A.Ş.', '#FF6200'], 'HSBC': ['HSBC Bank A.Ş.', '#DB0011'], 'Şekerbank': ['Şekerbank T.A.Ş.', '#00843D'], 'Fibabanka': ['Fibabanka A.Ş.', '#0B3C5D'], 'Odeabank': ['Odeabank A.Ş.', '#7A1F3D'], 'Anadolubank': ['Anadolubank A.Ş.', '#00539F'], 'Alternatif Bank': ['Alternatifbank A.Ş.', '#E4002B'], 'Burgan Bank': ['Burgan Bank A.Ş.', '#00539F'], 'ICBC Turkey': ['ICBC Turkey Bank A.Ş.', '#C8102E'], 'Turkland Bank': ['Turkland Bank A.Ş.', '#8B1E2D'], 'Enpara': ['Enpara Bank A.Ş.', '#5B2A86'] };
  const BANKALAR = [...Object.keys(BILGI), 'Diğer'];
  try { db.exec('ALTER TABLE banka_hesaplari ADD COLUMN sube TEXT'); } catch (e) { }
  try { db.exec('ALTER TABLE banka_hesaplari ADD COLUMN hesap_no TEXT'); } catch (e) { }
  R('GET', '/api/banka', 'banka|alin', 'g', async () => [200, { bankalar: BANKALAR, bilgi: BILGI, hesaplar: db.prepare('SELECT * FROM banka_hesaplari ORDER BY id').all().map(h => ({ ...h, kullanim: used('banka', h.id) })) }]);
  R('POST', '/api/banka', 'banka', 'e', async (c) => {
    const banka = str(c.body.banka, 60), hesap = str(c.body.hesap, 80), iban = String(c.body.iban || '').replace(/\s/g, '').toUpperCase(), para = ['TL', 'USD', 'EUR'].includes(c.body.para) ? c.body.para : 'TL', sube = str(c.body.sube, 80) || null, hesapNo = str(c.body.hesap_no, 40) || null;
    if (!banka || !hesap) throw new Err(400, 'Banka ve hesap adını yazın.');
    if (!ibanOk(iban)) throw new Err(400, 'IBAN geçersiz. Örnek: TR33 0006 1005 1978 6457 8413 26');
    if (db.prepare('SELECT 1 FROM banka_hesaplari WHERE iban=?').get(iban)) throw new Err(409, 'Bu IBAN zaten kayıtlı.');
    const id = +db.prepare('INSERT INTO banka_hesaplari(banka,hesap,iban,para,sube,hesap_no) VALUES(?,?,?,?,?,?)').run(banka, hesap, iban.replace(/(.{4})/g, '$1 ').trim(), para, sube, hesapNo).lastInsertRowid;
    A.audit(c.user, 'banka_eklendi', `${banka} ${hesap}`, ip(c.req)); return [201, { id }];
  });
  R('PUT', '/api/banka/:id', 'banka', 'd', async (c) => {
    const h = db.prepare('SELECT * FROM banka_hesaplari WHERE id=?').get(+c.m[1]); if (!h) throw new Err(404, 'Hesap yok.');
    const hesap = str(c.body.hesap, 80); if (!hesap) throw new Err(400, 'Hesap adını yazın.');
    db.prepare('UPDATE banka_hesaplari SET hesap=?, sube=?, hesap_no=? WHERE id=?').run(hesap, str(c.body.sube, 80) || null, str(c.body.hesap_no, 40) || null, h.id);
    A.audit(c.user, 'banka_guncellendi', `${h.banka} ${hesap}`, ip(c.req)); return [200, { ok: 1 }];
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
    if (nm(ad) === nm('Kalıcı Eser')) throw new Err(409, 'Kalıcı Eser sistem kategorisidir, silinemez.');
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
      if (!kt) throw new Err(400, 'Kurban türünü yazın (Vacip, Adak, Akika…).');
      if (!p) throw new Err(400, 'Bedeli girin.');
      const s = `${kt} · ${tam ? 'tam büyükbaş' : kucuk ? 'küçükbaş' : 'hisseli büyükbaş'}`;
      o = { kat: 'Kurban', ad: s, org: 'Kurban', cap: kucuk ? 1 : 7, fiyat: p, birim: kucuk ? 'Kurban' : 'Grup', tam: tam ? 1 : 0, seri: kt };
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
  R('PUT', '/api/kategoriler', 'turler', 'd', async (c) => {
    const eski = str(c.body.eski, 60), yeni = str(c.body.yeni, 60);
    if (!yeni) throw new Err(400, 'Yeni adı yazın.');
    if (['kalıcı eser', 'sponsorluk'].includes(nm(eski))) throw new Err(409, 'Bu kategori sistemde kullanıldığı için adı değiştirilemez.');
    if (!db.prepare('SELECT 1 FROM kategoriler WHERE ad=?').get(eski)) throw new Err(404, 'Ana kategori yok.');
    if (nm(yeni) !== nm(eski) && (['kurban', 'su kuyusu'].includes(nm(yeni)) || db.prepare('SELECT ad FROM kategoriler').all().some(x => nm(x.ad) === nm(yeni)))) throw new Err(409, 'Bu ana kategori zaten var.');
    return tx(() => { db.prepare('UPDATE kategoriler SET ad=? WHERE ad=?').run(yeni, eski); db.prepare('UPDATE bagis_turleri SET kat=? WHERE kat=?').run(yeni, eski); A.audit(c.user, 'kategori_adi', `${eski} → ${yeni}`, ip(c.req)); return [200, { ok: 1 }]; });
  });
  R('PUT', '/api/turler/:id', 'turler', 'd', async (c) => {
    const o = db.prepare('SELECT * FROM bagis_turleri WHERE id=?').get(+c.m[1]); if (!o) throw new Err(404, 'Tür yok.');
    const ad = str(c.body.ad, 80); if (!ad) throw new Err(400, 'Alt kategori adını yazın.');
    if (db.prepare('SELECT id,ad FROM bagis_turleri WHERE kat=?').all(o.kat).some(x => x.id !== o.id && nm(x.ad) === nm(ad))) throw new Err(409, 'Bu kategoride aynı adlı tür var.');
    db.prepare('UPDATE bagis_turleri SET ad=? WHERE id=?').run(ad, o.id); A.audit(c.user, 'tur_adi', `${o.kat}: ${o.ad} → ${ad}`, ip(c.req)); return [200, { ok: 1 }];
  });
  R('DELETE', '/api/turler/:id', 'turler', 's', async (c) => {
    const o = db.prepare('SELECT * FROM bagis_turleri WHERE id=?').get(+c.m[1]); if (!o) throw new Err(404, 'Tür yok.');
    if (used('tur', o.id)) throw new Err(409, 'Bu türde bağış var, silinemez.');
    db.prepare('DELETE FROM bagis_turleri WHERE id=?').run(o.id); A.audit(c.user, 'tur_silindi', `${o.kat} / ${o.ad}`, ip(c.req)); return [200, { ok: 1 }];
  });
};
