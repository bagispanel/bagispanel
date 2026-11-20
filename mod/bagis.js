// Bağış modülü: bağışçılar, bağış alma, onay, iptal, raporlar, organizasyon yerleştirme, SMS kaydı/şablonlar.
module.exports = function (ctx) {
  const { R, Err, db, tx, str, ip, A, usage } = ctx;
  db.exec(`
CREATE TABLE IF NOT EXISTS bagiscilar(id INTEGER PRIMARY KEY, tel TEXT NOT NULL UNIQUE, ad TEXT NOT NULL, eposta TEXT, adres TEXT, kayit TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS bagislar(id INTEGER PRIMARY KEY, no TEXT, bagisci_id INTEGER NOT NULL, tur_id INTEGER NOT NULL, adet INTEGER NOT NULL DEFAULT 1,
  para TEXT NOT NULL DEFAULT 'TL', tutar REAL NOT NULL, tl REAL NOT NULL, kendi INTEGER NOT NULL DEFAULT 1, adina_ad TEXT, adina_tel TEXT, notu TEXT,
  odeme TEXT NOT NULL, banka_id INTEGER, durum TEXT NOT NULL CHECK(durum IN ('Onaylı','Bekleyen','İptal')), tarih TEXT NOT NULL,
  kaynak TEXT NOT NULL DEFAULT 'Manuel (CRM)', xid TEXT, iptal_sebep TEXT, iptal_tarih TEXT, secenek TEXT NOT NULL DEFAULT '{}', kullanici TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS ux_bag_xid ON bagislar(kaynak, xid) WHERE xid IS NOT NULL AND xid<>'';
CREATE TABLE IF NOT EXISTS birimler_org(id INTEGER PRIMARY KEY, tur_id INTEGER NOT NULL, kod TEXT, ad TEXT, cap INTEGER NOT NULL, adim INTEGER NOT NULL DEFAULT 0,
  ulke TEXT, partner TEXT, hayvan TEXT, hedef REAL, devir REAL NOT NULL DEFAULT 0, tas REAL, tasx INTEGER NOT NULL DEFAULT 0, solo INTEGER NOT NULL DEFAULT 0,
  kn INTEGER, ksr TEXT, ks TEXT, konum TEXT, dt TEXT NOT NULL DEFAULT '{}', video TEXT);
CREATE TABLE IF NOT EXISTS paylar(id INTEGER PRIMARY KEY, birim_id INTEGER NOT NULL, bagis_id INTEGER NOT NULL, no TEXT, ad TEXT NOT NULL, tel TEXT, tarih TEXT NOT NULL,
  tutar REAL, vs TEXT, video TEXT);
CREATE INDEX IF NOT EXISTS ix_pay_birim ON paylar(birim_id); CREATE INDEX IF NOT EXISTS ix_pay_bagis ON paylar(bagis_id);
CREATE TABLE IF NOT EXISTS sayac(k TEXT PRIMARY KEY, n INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sms_log(id INTEGER PRIMARY KEY, zaman TEXT NOT NULL DEFAULT (datetime('now','localtime')), mesaj TEXT NOT NULL, kime TEXT, sablon TEXT, kullanici TEXT);
CREATE TABLE IF NOT EXISTS sms_sablon(k TEXT PRIMARY KEY, ad TEXT NOT NULL, n TEXT NOT NULL, m TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ayar(k TEXT PRIMARY KEY, v TEXT NOT NULL);
`);
  const RATE = { TL: 1, USD: 35, EUR: 38 }, YIL = () => new Date().getFullYear(), iso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const nm = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const next = (k) => { const r = db.prepare('SELECT n FROM sayac WHERE k=?').get(k); const n = r ? r.n : 1; db.prepare('INSERT INTO sayac(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=?').run(k, n + 1, n + 1); return n; };
  const peek = (k) => (db.prepare('SELECT n FROM sayac WHERE k=?').get(k) || { n: 1 }).n;
  const getA = (k, d) => { const r = db.prepare('SELECT v FROM ayar WHERE k=?').get(k); return r ? JSON.parse(r.v) : d; };
  const setA = (k, v) => db.prepare('INSERT INTO ayar(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=?').run(k, JSON.stringify(v), JSON.stringify(v));
  ctx.h = { nm, next, peek, getA, setA, iso, YIL };

  // ---- telefon
  function normPh(code, raw) {
    raw = String(raw || '').trim(); let d = raw.replace(/\D/g, ''); code = code || '+90';
    if (raw[0] === '+' || code === '+0') {
      if (code === '+0' && raw[0] !== '+') throw new Err(400, '“Diğer” için numarayı + ve ülke koduyla yazın.');
      if (d.length < 8 || d.length > 15) throw new Err(400, 'Uluslararası numara 8–15 hane olmalı.'); return '+' + d;
    }
    if (code === '+90') {
      if (d.startsWith('90') && d.length > 10) d = d.slice(2); if (d[0] === '0') d = d.slice(1);
      if (d.length !== 10) throw new Err(400, 'Türkiye numarası 10 hane olmalı.'); if (d[0] !== '5') throw new Err(400, 'Cep numarası 5 ile başlamalı.'); return '+90' + d;
    }
    d = d.replace(/^0+/, ''); if (d.length < 6 || d.length > 12) throw new Err(400, `${code} için numara 6–12 hane olmalı.`); return code + d;
  }
  ctx.normPh = normPh;

  try { db.exec('ALTER TABLE bagislar ADD COLUMN sert_kod TEXT'); } catch { /* var */ }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_bag_sert ON bagislar(sert_kod) WHERE sert_kod IS NOT NULL');
  const sertLink = (id) => { let k = (db.prepare('SELECT sert_kod FROM bagislar WHERE id=?').get(id) || {}).sert_kod; if (!k) { k = require('crypto').randomBytes(9).toString('base64url'); db.prepare('UPDATE bagislar SET sert_kod=? WHERE id=?').run(k, id); } return (ctx.sonHost || '') + '/sertifika/' + k; };
  ctx.sertLink = sertLink;
  // bağışa gidecek mesaj: sertifikalı tür onaylıysa kabul + sertifika bağlantısı tek mesaj, değilse yalnız kabul (SMS israfı olmasın)
  const bagMsj = (d, k) => (k === 's' || (k !== 'b' && d.sertifika)) && d.durum === 'Onaylı' ? ['sertifika', { ad: d.ad, tur: d.tur, bno: d.no, link: sertLink(d.id) }] : ['kabul', { ad: d.ad, tur: d.tur, bno: d.no }];
  const BSEL = 'SELECT g.id, g.no, g.durum, b.ad, b.tel, t.ad tur, t.sertifika FROM bagislar g JOIN bagiscilar b ON b.id=g.bagisci_id JOIN bagis_turleri t ON t.id=g.tur_id WHERE g.id=?';

  // ---- SMS şablonları
  const TPL0 = {
    kabul: ['Bağış kabul', 'Bağış onaylanınca gider.', 'Sayın {ad}, {tur} bağışınız ({bno}) alınmıştır. Teşekkür ederiz. {dernek}'],
    sertifika: ['Bağış sertifikası', 'Sertifikası olan bağış türlerinde, onaydan sonra gider.', 'Sayın {ad}, {tur} bağışınız alınmıştır, teşekkür ederiz. Sertifikanız: {link} {dernek}'],
    kesim: ['Kurban kesim', 'Kurban “kesildi” işaretlenince gider.', 'Sayın {ad}, {sahip_no} numaralı kurbanınız {ulke} ülkesinde {tarih} tarihinde kesilmiştir. {dernek}'],
    video: ['Kurban video', 'Video kontrolden sonra gönderilirken gider.', 'Sayın {ad}, {sahip_no} numaralı kurbanınızın videosu: {link} {dernek}'],
    kuyu: ['Su kuyusu açıldı', 'Su kuyusu “açıldı” işaretlenince gider.', 'Sayın {ad}, {kuyu_no} numaralı su kuyunuz {ulke} ülkesinde {tarih} tarihinde açılmıştır. {dernek}'],
    dig: ['Videolu bağış dağıtıldı', 'Videolu bağışlar “dağıtıldı” işaretlenince gider.', 'Sayın {ad}, {tur} bağışınız {ulke} ülkesinde {tarih} tarihinde ulaştırılmıştır. {dernek}'],
    digv: ['Videolu bağış video', 'Videolu bağışın videosu gönderilirken gider.', 'Sayın {ad}, {tur} bağışınızın videosu: {link} {dernek}'],
    kuyuv: ['Su kuyusu video', 'Su kuyusu videosu gönderilirken gider.', 'Sayın {ad}, {kuyu_no} numaralı su kuyunuzun videosu: {link} {dernek}']
  };
  Object.entries(TPL0).forEach(([k, v]) => db.prepare('INSERT OR IGNORE INTO sms_sablon(k,ad,n,m) VALUES(?,?,?,?)').run(k, v[0], v[1], v[2]));
  db.prepare('UPDATE sms_sablon SET m=? WHERE k=? AND m=?').run(TPL0.sertifika[2], 'sertifika', 'Sayın {ad}, {tur} bağışınız için sertifikanız: {link} {dernek}');
  db.prepare('INSERT OR IGNORE INTO sms_sablon(k,ad,n,m) VALUES(?,?,?,?)').run('spbelge', 'Sponsorluk belgesi', 'Elle gönderilir (Sponsorluklar ve Ödemeler).', 'Sayın {ad}, {ogrenci} adlı öğrencimize verdiğiniz destek için sponsorluk belgeniz: {link} {dernek}');
  const dernek = () => getA('dernek_adi', '[Dernek adı]');
  const fill = (m, v) => m.replace(/\{(\w+)\}/g, (_, k) => v[k] !== undefined ? v[k] : '{' + k + '}');
  const dstr = (s) => s ? String(s).slice(0, 10).split('-').reverse().join('.') : '-';
  function sms(k, v, kime, user, tel) { // gerçek gönderim sağlayıcısı bağlanana kadar kayıt altına alınır
    const t = db.prepare('SELECT m FROM sms_sablon WHERE k=?').get(k); if (!t) return;
    const mesaj = fill(t.m, { dernek: dernek(), ...v }); const id = +db.prepare('INSERT INTO sms_log(mesaj,kime,sablon,kullanici) VALUES(?,?,?,?)').run(mesaj, kime, k, user || null).lastInsertRowid; return { id, mesaj, tel };
  }
  function wa(k, v, kime, user, tel) { // WhatsApp'a elle gönderim: metin hazırlanır, kişi kendi WhatsApp'ında gönderir; kayda yazılır
    const t = db.prepare('SELECT m FROM sms_sablon WHERE k=?').get(k); if (!t) throw new Err(404, 'Mesaj şablonu yok.');
    const d = String(tel || '').replace(/\D/g, ''); if (d.length < 7) throw new Err(409, 'Bu kişinin geçerli telefonu yok.');
    const mesaj = fill(t.m, { dernek: dernek(), ...v }); db.prepare('INSERT INTO sms_log(mesaj,kime,sablon,kullanici) VALUES(?,?,?,?)').run(mesaj, kime, 'wa:' + k, user || null);
    return { mesaj, tel: d, link: `https://wa.me/${d}?text=${encodeURIComponent(mesaj)}` };
  }
  ctx.sms = sms; ctx.dstr = dstr; ctx.wa = wa;
  R('POST', '/api/bagislar/:id/sms', 'alin|bekleyen|bagisci|rapor', 'e', async (c) => { // kabul SMS'ini elle (yeniden) gönder
    const d = db.prepare(BSEL).get(+c.m[1]); if (!d) throw new Err(404, 'Bağış yok.');
    if (d.durum === 'İptal') throw new Err(409, 'İptal edilmiş bağış için mesaj gönderilmez.'); if (String(d.tel || '').replace(/\D/g, '').length < 7) throw new Err(409, 'Bu kişinin geçerli telefonu yok.');
    if (c.body && c.body.k === 's' && d.durum !== 'Onaylı') throw new Err(409, 'Sertifika, bağış onaylandıktan sonra gönderilir.');
    const [k, v] = bagMsj(d, c.body && c.body.k); ctx.sms(k, v, d.ad, c.user.kadi, d.tel); return [200, { ok: 1, sertifika: k === 'sertifika' }];
  });
  R('GET', '/api/bagislar/:id/mesaj', 'alin|bekleyen|bagisci|rapor', 'g', async (c) => { // kabul mesajı önizlemesi
    const d = db.prepare(BSEL).get(+c.m[1]); if (!d) throw new Err(404, 'Bağış yok.');
    const tel = String(d.tel || '').replace(/\D/g, '').length >= 7, uy = tel && d.durum !== 'İptal', neden = !tel ? 'Telefon kayıtlı değil.' : d.durum === 'İptal' ? 'İptal edilmiş bağış için mesaj gönderilmez.' : '';
    const yaz = (kk) => { const [k, v] = bagMsj(d, kk), tp = db.prepare('SELECT m FROM sms_sablon WHERE k=?').get(k); return { mesaj: tp ? fill(tp.m, { dernek: dernek(), ...v }) : '', uygun: uy, neden }; };
    const o = { ad: d.ad, tel: d.tel || '', telVar: tel, sertifika: !!d.sertifika && d.durum === 'Onaylı', b: yaz('b') };
    if (d.durum === 'Onaylı') { o.s = yaz('s'); o.s.yol = '/sertifika/' + sertLink(d.id).split('/sertifika/')[1]; }
    return [200, o];
  });
  R('GET', '/api/bagislar/:id/wa', 'alin|bekleyen|bagisci|rapor', 'g', async (c) => {
    const d = db.prepare(BSEL).get(+c.m[1]); if (!d) throw new Err(404, 'Bağış yok.');
    if (d.durum === 'İptal') throw new Err(409, 'İptal edilmiş bağış için mesaj hazırlanmaz.');
    const qk = new URL(c.req.url, 'http://x').searchParams.get('k');
    if (qk === 's' && d.durum !== 'Onaylı') throw new Err(409, 'Sertifika, bağış onaylandıktan sonra gönderilir.');
    const [k, v] = bagMsj(d, qk); return [200, wa(k, v, d.ad, c.user.kadi, d.tel)];
  });
  R('GET', '/api/sablonlar', 'sablon|sms', 'g', async () => [200, { sablonlar: db.prepare('SELECT * FROM sms_sablon').all(), dernek: dernek() }]);
  R('PUT', '/api/sablonlar/([a-z]+)', 'sablon', 'd', async (c) => {
    const m = str(c.body.m, 600); if (!m) throw new Err(400, 'Mesaj boş olamaz.');
    if (!db.prepare('SELECT 1 FROM sms_sablon WHERE k=?').get(c.m[1])) throw new Err(404, 'Şablon yok.');
    db.prepare('UPDATE sms_sablon SET m=? WHERE k=?').run(m, c.m[1]); A.audit(c.user, 'sablon', c.m[1], ip(c.req)); return [200, { ok: 1 }];
  });
  R('PUT', '/api/dernek-adi', 'sablon', 'd', async (c) => { const a = str(c.body.ad, 80); if (!a) throw new Err(400, 'Dernek adını yazın.'); setA('dernek_adi', a); return [200, { ok: 1 }]; });
  R('GET', '/api/sms', 'sms', 'g', async () => [200, db.prepare('SELECT * FROM sms_log ORDER BY id DESC LIMIT 300').all()]);

  // ---- bağışçılar
  R('GET', '/api/bagiscilar', 'bagisci|alin', 'g', async (c) => {
    const q = nm(new URL(c.req.url, 'http://x').searchParams.get('q')), qd = q.replace(/\D/g, '');
    const L = db.prepare(`SELECT b.*, COUNT(g.id) adet, MAX(CASE WHEN g.durum='Onaylı' THEN g.tarih END) son, COALESCE(SUM(CASE WHEN g.durum='Onaylı' THEN g.tl END),0) toplam FROM bagiscilar b LEFT JOIN bagislar g ON g.bagisci_id=b.id GROUP BY b.id ORDER BY b.id DESC`).all()
      .filter(x => !q || nm(x.ad).includes(q) || (qd.length >= 3 && x.tel.replace(/\D/g, '').includes(qd)));
    return [200, L.slice(0, 500)];
  });
  R('GET', '/api/bagiscilar/:id', 'bagisci', 'g', async (c) => {
    const b = db.prepare('SELECT * FROM bagiscilar WHERE id=?').get(+c.m[1]); if (!b) throw new Err(404, 'Bağışçı yok.');
    const L = db.prepare(SEL + ' WHERE g.bagisci_id=? ORDER BY g.tl DESC, g.id DESC').all(b.id).map(bagisSatir), ok = L.filter(x => x.durum === 'Onaylı');
    const sayi = (org) => db.prepare(`SELECT COUNT(DISTINCT p.birim_id) u, COUNT(*) h, COUNT(DISTINCT CASE WHEN u.adim>=3 THEN p.birim_id END) t FROM paylar p JOIN birimler_org u ON u.id=p.birim_id JOIN bagis_turleri t ON t.id=u.tur_id JOIN bagislar g ON g.id=p.bagis_id WHERE g.bagisci_id=? AND g.durum='Onaylı' AND t.org=?`).get(b.id, org);
    const son = ok.reduce((m, x) => x.tarih > m ? x.tarih : m, ''), ilk = ok.reduce((m, x) => !m || x.tarih < m ? x.tarih : m, '');
    const gun = son ? Math.floor((Date.now() - new Date(son).getTime()) / 864e5) : null;
    const kat = {}; ok.forEach(x => kat[x.kat] = (kat[x.kat] || 0) + x.tl);
    // bağış başına ayrıntı: kurban/kuyu/videolu bağışta pay-birim-aşama-video; kalıcı eserde bağlı proje
    const ASAMA = { Kurban: ['Hisse bekliyor', 'Ülke atanacak', 'Kesim bekliyor', 'Video bağlanacak', 'Video kontrolü', 'Tamamlandı'], 'Su kuyusu': ['Toplanıyor', 'Ülke atanacak', 'Açılış bekliyor', 'Video bağlanacak', 'Video kontrolü', 'Tamamlandı'], 'Diğer': ['Hazırlanıyor', 'Ülke atanacak', 'Dağıtım bekliyor', 'Video bağlanacak', 'Video kontrolü', 'Tamamlandı'] };
    const stsU = (u) => { if (u.adim === 1 && u.ulke && u.org === 'Su kuyusu') return 2; return u.adim < 3 ? u.adim : u.adim === 3 ? (u.video ? 4 : 3) : 5; };
    const detay = {}, ids = L.map(x => x.id);
    if (ids.length) db.prepare(`SELECT p.bagis_id, p.no pno, p.ad pad, p.video pv, p.vs, p.vekalet, u.kod, u.ad uad, u.ulke, u.partner, u.adim, u.video, t.org FROM paylar p JOIN birimler_org u ON u.id=p.birim_id JOIN bagis_turleri t ON t.id=u.tur_id WHERE p.bagis_id IN (${ids.map(() => '?').join(',')}) ORDER BY p.id`).all(...ids)
      .forEach(r => { const v = r.pv || r.video || ''; (detay[r.bagis_id] = detay[r.bagis_id] || []).push({ pno: r.pno, vk: !!r.vekalet, kod: r.kod, birim: r.uad || '', adina: r.pad, ulke: r.ulke || '', partner: r.partner || '', asama: (ASAMA[r.org] || ASAMA['Diğer'])[stsU(r)], video: !!v, link: /^https?:\/\//.test(v) ? v : '', video_ad: /^https?:\/\//.test(v) ? '' : v, gonderildi: !!r.vs }); });
    const eserAd = {}; try { db.prepare('SELECT id,ad,tur_ids FROM eser').all().forEach(e => JSON.parse(e.tur_ids || '[]').forEach(i => (eserAd[i] = eserAd[i] || []).push({ id: e.id, ad: e.ad }))); } catch (e) { }
    ok.concat(L.filter(x => x.durum !== 'Onaylı')).forEach(x => { if (eserAd[x.tur_id]) (detay[x.id] = detay[x.id] || []).eser = eserAd[x.tur_id]; });
    const detayO = {}; Object.entries(detay).forEach(([k, v]) => { detayO[k] = { paylar: v.slice(), eser: v.eser || null }; });
    const td = {}; ok.forEach(x => { const k = x.kat + '\u0001' + x.tur, r = td[k] = td[k] || { kat: x.kat, tur: x.tur, org: x.org, adet: 0, tl: 0, say: 0, son: '' }; r.adet += x.adet; r.tl += x.tl; r.say++; if (x.tarih > r.son) r.son = x.tarih; });
    const turDagilim = Object.values(td).sort((a, b) => b.tl - a.tl);
    return [200, { detay: detayO, turDagilim, bagisci: b, bagislar: L, enyuksek: ok.slice().sort((x, y) => y.tl - x.tl)[0] || null, toplam: ok.reduce((a, x) => a + x.tl, 0), adet: ok.length, bekleyen: L.filter(x => x.durum === 'Bekleyen').length, iptal: L.filter(x => x.durum === 'İptal').length, ilk, son, gun, kategori: kat, kurban: sayi('Kurban'), kuyu: sayi('Su kuyusu'), video: sayi('Diğer') }];
  });
  R('POST', '/api/bagiscilar', 'bagisci', 'e', async (c) => { // bağış yapmadan da rehbere kişi eklenebilir
    const b = c.body || {}, tel = normPh(b.kod, b.tel), ad = str(b.ad, 80); if (!ad) throw new Err(400, 'Ad soyad zorunlu.');
    const var_ = db.prepare('SELECT id,ad FROM bagiscilar WHERE tel=?').get(tel); if (var_) throw new Err(409, `Bu telefon zaten kayıtlı: ${var_.ad}.`);
    const mail = String(b.eposta || '').trim().toLowerCase(); if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Err(400, 'E-posta geçersiz.');
    const id = +db.prepare('INSERT INTO bagiscilar(tel,ad,eposta,adres) VALUES(?,?,?,?)').run(tel, ad, mail || null, str(b.adres, 160) || null).lastInsertRowid; A.audit(c.user, 'bagisci_eklendi', ad, ip(c.req)); return [201, { id }];
  });
  R('PUT', '/api/bagiscilar/([0-9]+)', 'bagisci', 'd', async (c) => {
    const id = +c.m[1], b = c.body || {}, cur = db.prepare('SELECT * FROM bagiscilar WHERE id=?').get(id); if (!cur) throw new Err(404, 'Bağışçı yok.');
    const ad = str(b.ad, 80); if (!ad) throw new Err(400, 'Ad soyad zorunlu.'); const mail = String(b.eposta || '').trim().toLowerCase(); if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Err(400, 'E-posta geçersiz.');
    db.prepare('UPDATE bagiscilar SET ad=?, eposta=?, adres=? WHERE id=?').run(ad, mail || null, str(b.adres, 160) || null, id); A.audit(c.user, 'bagisci_guncellendi', ad, ip(c.req)); return [200, { ok: 1 }];
  });
  R('GET', '/api/bagiscilar/ara', 'alin', 'g', async (c) => { // telefondan kayıtlı bağışçıyı bul
    const t = new URL(c.req.url, 'http://x').searchParams; let tel; try { tel = normPh(t.get('kod'), t.get('tel')); } catch (e) { return [200, null]; }
    return [200, db.prepare('SELECT id,tel,ad,eposta,adres FROM bagiscilar WHERE tel=?').get(tel) || null];
  });

  // ---- tür yardımcıları
  const tur = (id) => { const t = db.prepare('SELECT * FROM bagis_turleri WHERE id=?').get(id); if (!t) throw new Err(400, 'Bağış türü bulunamadı.'); t.k = t.kuyu ? JSON.parse(t.kuyu) : null; return t; };
  const nameOf = (t) => t.ad;
  const niOf = (t) => t.org === 'Su kuyusu' ? (t.k ? t.k.tip : t.ad) : t.seri || t.ad;
  const bankaAd = (id) => { const b = id && db.prepare('SELECT * FROM banka_hesaplari WHERE id=?').get(id); return b ? `${b.banka} · ${b.hesap} (${b.para})` : ''; };

  // ---- kuyu numaralandırma
  const sayacKey = (u, t) => { const ser = seriOf(t.id); const s = db.prepare('SELECT * FROM kn_seri WHERE ad=?').get(ser); return s && s.ulkeye_gore ? (u.ulke ? ser + ' · ' + u.ulke : null) : ser; };
  db.exec(`CREATE TABLE IF NOT EXISTS kn_seri(ad TEXT PRIMARY KEY, onek TEXT NOT NULL DEFAULT '', ulkeye_gore INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS kn_map(tur_id INTEGER PRIMARY KEY, seri TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kn_sayac(k TEXT PRIMARY KEY, n INTEGER NOT NULL);`);
  db.prepare("INSERT OR IGNORE INTO kn_seri(ad,onek,ulkeye_gore) VALUES('Genel','',0)").run();
  db.prepare("INSERT OR IGNORE INTO kn_sayac(k,n) VALUES('Genel',1)").run();
  const seriOf = (tid) => { const m = db.prepare('SELECT seri FROM kn_map WHERE tur_id=?').get(tid); return m && db.prepare('SELECT 1 FROM kn_seri WHERE ad=?').get(m.seri) ? m.seri : 'Genel'; };
  function kfix() { /* otomatik kuyu numarası kaldırıldı: kuyu kodu sistemde hep vardır, isteğe bağlı numara elle yazılır */ }
  ctx.kfix = kfix;

  // ---- organizasyona yerleştirme (onaylanan bağış)
  const dtGet = (u) => JSON.parse(u.dt || '{}');
  const dtSet = (id, dt) => db.prepare('UPDATE birimler_org SET dt=? WHERE id=?').run(JSON.stringify(dt), id);
  const kodAl = (u, t) => {
    const p = t.org === 'Kurban' ? `K${String(YIL()).slice(2)}-${u.cap > 1 ? 'B' : 'K'}` : t.org === 'Su kuyusu' ? `KY-${YIL()}` : `VB-${YIL()}`;
    return p + '-' + String(next('kod:' + p)).padStart(4, '0');
  };
  function yeniBirim(d, t, cap, x) {
    const dt = { 0: iso() }; if (x.adim >= 1) dt[1] = iso();
    const u = { tur_id: t.id, cap, adim: x.adim || 0, ulke: t.ulke || '', hayvan: t.org === 'Kurban' ? (cap === 1 ? (d.secenek.hy || 'Koç') : 'Büyükbaş') : '', hedef: x.hedef || null, devir: x.devir || 0, solo: x.solo ? 1 : 0, ad: x.ad || '' };
    const id = +db.prepare('INSERT INTO birimler_org(tur_id,cap,adim,ulke,hayvan,hedef,devir,solo,ad,dt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(u.tur_id, u.cap, u.adim, u.ulke, u.hayvan, u.hedef, u.devir, u.solo, u.ad, JSON.stringify(dt)).lastInsertRowid;
    const kod = kodAl(u, t); db.prepare('UPDATE birimler_org SET kod=? WHERE id=?').run(kod, id); return db.prepare('SELECT * FROM birimler_org WHERE id=?').get(id);
  }
  for (const q of ['ALTER TABLE paylar ADD COLUMN vekalet TEXT', 'ALTER TABLE paylar ADD COLUMN vekalet_yontem TEXT', 'ALTER TABLE paylar ADD COLUMN vekalet_kim TEXT', 'ALTER TABLE bagislar ADD COLUMN vekalet TEXT']) { try { db.exec(q); } catch (e) { } }
  const VY = ['Telefon', 'Yazılı', 'WhatsApp', 'Yüz yüze', 'Online']; ctx.VY = VY;
  const payEkle = (u, d, n, ph, a, t) => { const no = 'KS-' + YIL() + '-' + String(next('ks')).padStart(4, '0'); const pid = +db.prepare('INSERT INTO paylar(birim_id,bagis_id,no,ad,tel,tarih,tutar) VALUES(?,?,?,?,?,?,?)').run(u.id, d.id, no, n, ph || '', iso(), a).lastInsertRowid; const bv = db.prepare('SELECT vekalet, kullanici FROM bagislar WHERE id=?').get(d.id); if (bv && bv.vekalet) db.prepare('UPDATE paylar SET vekalet=?, vekalet_yontem=?, vekalet_kim=? WHERE id=?').run(iso(), bv.vekalet, bv.kullanici || null, pid); };
  const cnt = (u) => db.prepare('SELECT COUNT(*) n FROM paylar WHERE birim_id=?').get(u.id).n;
  const sum = (u) => (db.prepare('SELECT COALESCE(SUM(tutar),0) s FROM paylar WHERE birim_id=?').get(u.id).s) + (u.devir || 0);
  function doldu(u) { const dt = dtGet(u); dt[1] = iso(); dtSet(u.id, dt); db.prepare('UPDATE birimler_org SET adim=1 WHERE id=?').run(u.id); }
  function yerlestir(d) {
    const t = tur(d.tur_id), o = typeof d.secenek === 'string' ? JSON.parse(d.secenek || '{}') : (d.secenek || {}), ph = d.adina_tel || d.tel, nameS = d.adina_ad || d.ad, fon = t.k && t.k.bicim === 'Fon', pay = t.fiyat || 0;
    const bos = (id) => db.prepare('SELECT * FROM birimler_org WHERE tur_id=? AND adim=0').all(id).filter(u => cnt(u) < u.cap);
    if (fon) {
      let u = db.prepare('SELECT * FROM birimler_org WHERE tur_id=? AND adim=0').get(t.id);
      if (!u) {
        const pv = db.prepare('SELECT * FROM birimler_org WHERE tur_id=? AND tas IS NOT NULL AND tasx=0').get(t.id), n = db.prepare('SELECT COUNT(*) n FROM birimler_org WHERE tur_id=?').get(t.id).n;
        u = yeniBirim(d, t, t.k.fiyat, { hedef: t.k.fiyat, ad: t.k.ad + (n ? ' · ' + (n + 1) + '. dönem' : ''), devir: pv ? pv.tas : 0 }); if (pv) db.prepare('UPDATE birimler_org SET tasx=1 WHERE id=?').run(pv.id);
      }
      payEkle(u, d, nameS, ph, d.tl, t); u = db.prepare('SELECT * FROM birimler_org WHERE id=?').get(u.id);
      const tot = sum(u); if (tot >= u.hedef) { doldu(u); db.prepare('UPDATE birimler_org SET tas=? WHERE id=?').run(tot - u.hedef, u.id); }
      return;
    }
    if (o.solo) { const u = yeniBirim(d, t, 1, { solo: 1, adim: 1, ad: t.k ? nameS + ' adına' : '' }); payEkle(u, d, nameS, ph, t.k ? d.tl : pay, t); return; }
    if (t.tam) { const u = yeniBirim(d, t, 7, { adim: 1 }); (o.names || []).forEach(x => payEkle(u, d, x.n, x.ph || d.tel, pay, t)); return; }
    for (let i = 0; i < d.adet; i++) {
      const nm_ = o.names && o.names[i] ? o.names[i].n : nameS, ph_ = o.names && o.names[i] && o.names[i].ph ? o.names[i].ph : ph;
      let u = (o.grp && db.prepare('SELECT * FROM birimler_org WHERE id=? AND adim=0').get(o.grp)); if (u && cnt(u) >= u.cap) u = null;
      u = u || bos(t.id)[0] || yeniBirim(d, t, t.cap, { ad: t.k && t.k.bicim === 'Tam fiyat' ? nm_ + ' adına' : '' });
      payEkle(u, d, nm_, ph_, pay, t); if (cnt(u) >= u.cap) doldu(u);
    }
  }
  function onayla(d, user) {
    if (typeof d.secenek === 'string') d.secenek = JSON.parse(d.secenek || '{}');
    const t = tur(d.tur_id), v = { ad: d.ad, tur: t.ad, bno: d.no };
    if (t.sertifika) ctx.sms('sertifika', { ...v, link: sertLink(d.id) }, d.ad, user, d.tel); else ctx.sms('kabul', v, d.ad, user, d.tel);
    if (t.org !== 'Genel') yerlestir(d); kfix();
  }
  ctx.onayla = onayla;

  // ---- bağış alma
  const bankaIban = (id) => { const b = id && db.prepare('SELECT * FROM banka_hesaplari WHERE id=?').get(id); return b ? b.iban : ''; };
  const bagisSatir = (r) => ({ id: r.id, bagisci_id: r.bagisci_id, iban: bankaIban(r.banka_id), no: r.no, tel: r.tel, ad: r.ad, tur_id: r.tur_id, tur: r.turad, kat: r.kat, org: r.org, adet: r.adet, para: r.para, tutar: r.tutar, tl: r.tl, kendi: !!r.kendi, adina_ad: r.adina_ad, adina_tel: r.adina_tel, notu: r.notu, odeme: r.odeme, banka: bankaAd(r.banka_id), durum: r.durum, tarih: r.tarih, kaynak: r.kaynak, kanal: r.kaynak === 'Manuel (CRM)' ? 'CRM' : r.kaynak, sorumlu: r.sorumlu_ad || String(r.kullanici || '').replace(/^api:/, ''), xid: r.xid, iptal_sebep: r.iptal_sebep, iptal_tarih: r.iptal_tarih, adlar: (JSON.parse(r.secenek || '{}').names || []).map(x => x.n) });
  const SEL = `SELECT g.*, b.ad ad, b.tel tel, t.ad turad, t.kat kat, t.org org, us.ad sorumlu_ad FROM bagislar g JOIN bagiscilar b ON b.id=g.bagisci_id JOIN bagis_turleri t ON t.id=g.tur_id LEFT JOIN users us ON us.kadi=g.kullanici`;
  function bagisOlustur(b, user, kaynak, xid, req) {
    const tel = normPh(b.kod, b.tel), ad = str(b.ad, 80); if (!ad) throw new Err(400, 'Ad soyad zorunlu.');
    const t = tur(+b.tur_id), q = Math.max(1, Math.floor(+b.adet || 1)), para = ['TL', 'USD', 'EUR'].includes(b.para) ? b.para : 'TL';
    let tutar = +b.tutar; if (t.fiyat && !(t.k && t.k.bicim === 'Fon')) tutar = q * t.fiyat; if (!(tutar > 0)) throw new Err(400, 'Toplam tutarı girin.');
    const odeme = ['Nakit', 'Havale/EFT', 'Kredi kartı / online'].includes(b.odeme) ? b.odeme : 'Nakit', durum = b.durum === 'Bekleyen' ? 'Bekleyen' : 'Onaylı';
    let banka = 0; if (odeme === 'Havale/EFT') { banka = +b.banka_id || 0; if (!db.prepare('SELECT 1 FROM banka_hesaplari WHERE id=?').get(banka)) throw new Err(400, 'Hangi banka hesabına geldiğini seçin (Ayarlar → Banka hesapları).'); }
    const fon = t.k && t.k.bicim === 'Fon', org = t.org !== 'Genel';
    const kendi = !b.baskasi; // “başkası adına” işaretlenmediyse bağış sahibi bağışçının kendisidir
    const o = { hy: ['Koç', 'Koyun'].includes(b.hy) ? b.hy : 'Koç', solo: !!b.solo && t.k && ['Hisseli', 'Katılım'].includes(t.k.bicim), grp: +b.grp || 0 };
    const raw = Array.isArray(b.names) ? b.names : String(b.liste || '').split('\n').map(x => x.trim()).filter(Boolean).map(l => { const m = l.split(/[,;\t]/); return { n: m[0], ph: m[1] }; });
    const useNames = t.tam || raw.some(x => x && str(x.n, 80));
    if (useNames) {
      const dflt = kendi ? ad : (str(b.adina_ad, 80) || ad), need = t.tam ? 7 : q;
      if (t.tam && raw.filter(x => x && str(x.n, 80)).length !== 7) throw new Err(400, 'Tam büyükbaş için 7 ismin hepsini yazın.');
      if (raw.length > need) throw new Err(400, `En fazla ${need} isim girilebilir.`);
      const names = []; for (let i = 0; i < need; i++) { const x = raw[i] || {}; let ph = ''; if (x.ph && String(x.ph).trim()) { try { ph = normPh('+90', x.ph); } catch (e) { throw new Err(400, `${i + 1}. kişinin telefonu hatalı.`); } } names.push({ n: str(x.n, 80) || dflt, ph }); }
      o.names = names;
    }
    let adinaAd = null, adinaTel = null;
    if (!useNames && !kendi) { adinaAd = str(b.adina_ad, 80); if (!adinaAd) throw new Err(400, 'Adına bağış yapılan kişinin adını girin.'); if (b.adina_tel && String(b.adina_tel).trim()) adinaTel = normPh('+90', b.adina_tel); }
    if (o.grp && org && t.cap > 1 && !t.tam) { const g = db.prepare('SELECT * FROM birimler_org WHERE id=? AND tur_id=? AND adim=0').get(o.grp, t.id); if (g && t.cap - cnt(g) < q) throw new Err(400, `Seçilen grupta ${t.cap - cnt(g)} boş hisse var, ${q} hisse sığmaz.`); }
    if (t.tam && q !== 7) b.adet = 7;
    return tx(() => {
      let bg = db.prepare('SELECT id FROM bagiscilar WHERE tel=?').get(tel), yeni = false;
      if (!bg) { bg = { id: +db.prepare('INSERT INTO bagiscilar(tel,ad,eposta,adres) VALUES(?,?,?,?)').run(tel, ad, str(b.eposta, 120) || null, str(b.adres, 160) || null).lastInsertRowid }; yeni = true; }
      const id = +db.prepare('INSERT INTO bagislar(bagisci_id,tur_id,adet,para,tutar,tl,kendi,adina_ad,adina_tel,notu,odeme,banka_id,durum,tarih,kaynak,xid,secenek,kullanici) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(bg.id, t.id, t.tam ? 7 : q, para, tutar, tutar * RATE[para], kendi ? 1 : 0, adinaAd, adinaTel, str(b.notu, 400) || null, odeme, banka || null, durum, iso(), kaynak || 'Manuel (CRM)', xid || null, JSON.stringify(o), user.kadi).lastInsertRowid;
      if (b.vekalet && t.org === 'Kurban') db.prepare('UPDATE bagislar SET vekalet=? WHERE id=?').run(VY.includes(b.vekalet_yontem) ? b.vekalet_yontem : 'Telefon', id);
      const no = 'BG-' + YIL() + '-' + String(id).padStart(5, '0'); db.prepare('UPDATE bagislar SET no=? WHERE id=?').run(no, id);
      if (durum === 'Onaylı') onayla(db.prepare(SEL + ' WHERE g.id=?').get(id), user.kadi);
      A.audit(user, 'bagis_alindi', no, req ? ip(req) : null); return { id, no, yeni, durum };
    });
  }
  ctx.bagisOlustur = bagisOlustur;
  R('POST', '/api/bagislar', 'alin', 'e', async (c) => { const r = bagisOlustur(c.body, c.user, 'Manuel (CRM)', '', c.req); return [201, r]; });
  R('GET', '/api/bagislar', 'rapor|bekleyen', 'g', async (c) => {
    const p = new URL(c.req.url, 'http://x').searchParams, W = [], A_ = [], f = (k) => { const v = p.get(k); return v && v !== 'Tümü' ? v : null; };
    if (f('kat')) { W.push('t.kat=?'); A_.push(f('kat')); } if (f('tur')) { W.push('g.tur_id=?'); A_.push(+f('tur')); }
    if (f('d1')) { W.push('g.tarih>=?'); A_.push(f('d1')); } if (f('d2')) { W.push('g.tarih<=?'); A_.push(f('d2')); }
    if (f('odeme')) { W.push('g.odeme=?'); A_.push(f('odeme')); }
    if (f('kanal') === 'CRM') W.push("g.kaynak='Manuel (CRM)'"); else if (f('kanal') === 'Web sitesi / dış kaynak') W.push("g.kaynak<>'Manuel (CRM)'");
    if (f('sorumlu')) { W.push('g.kullanici=?'); A_.push(f('sorumlu')); }
    const base = SEL + (W.length ? ' WHERE ' + W.join(' AND ') : ''), d = f('durum');
    const lim = Math.min(5000, +p.get('lim') || 1000);
    const L = db.prepare(`SELECT * FROM (${base}) ${d ? 'WHERE durum=?' : ''} ORDER BY id DESC LIMIT ${lim}`).all(...A_, ...(d ? [d] : [])).map(bagisSatir);
    const G = (col, extra) => db.prepare(`SELECT ${col} k, durum, COUNT(*) n, SUM(tl) s FROM (${base}) GROUP BY ${col}, durum`).all(...A_);
    const S = {}, N = {}; db.prepare(`SELECT durum, COUNT(*) n, SUM(tl) s FROM (${base}) GROUP BY durum`).all(...A_).forEach(x => { S[x.durum] = x.s; N[x.durum] = x.n; });
    const onay = (col) => db.prepare(`SELECT ${col} k, COUNT(*) n, SUM(tl) s FROM (${base}) WHERE durum='Onaylı' GROUP BY ${col} ORDER BY s DESC`).all(...A_);
    const sor = db.prepare("SELECT kullanici k, COALESCE((SELECT ad FROM users WHERE kadi=kullanici), REPLACE(kullanici,'api:','')) ad FROM bagislar GROUP BY kullanici").all();
    return [200, { liste: L, toplam: S, adet: N, kategori: onay('kat'), tur: onay('turad'), odeme: onay('odeme'), kanal: onay("CASE WHEN kaynak='Manuel (CRM)' THEN 'CRM' ELSE kaynak END"), sorumlu: onay("COALESCE(sorumlu_ad, REPLACE(kullanici,'api:',''))"), sorumlular: sor }];
  });
  R('GET', '/api/bagislar/:id', 'rapor|bekleyen|alin', 'g', async (c) => { const r = db.prepare(SEL + ' WHERE g.id=?').get(+c.m[1]); if (!r) throw new Err(404, 'Bağış yok.'); return [200, { ...bagisSatir(r), dernek: dernek() }]; });
  R('POST', '/api/bagislar/onayla', 'bekleyen', 'd', async (c) => {
    const ids = (Array.isArray(c.body.ids) ? c.body.ids : []).map(Number).filter(Boolean); if (!ids.length) throw new Err(400, 'Onaylanacak bağışı seçin.');
    return tx(() => { let n = 0; for (const id of ids) { const d = db.prepare(SEL + " WHERE g.id=? AND g.durum='Bekleyen'").get(id); if (!d) continue; db.prepare("UPDATE bagislar SET durum='Onaylı' WHERE id=?").run(id); d.durum = 'Onaylı'; onayla(d, c.user.kadi); n++; } A.audit(c.user, 'bagis_onay', n + ' bağış', ip(c.req)); return [200, { n }]; });
  });
  const SEBEP = ['Hatalı giriş', 'Mükerrer (çift) kayıt', 'Bağışçı vazgeçti', 'Ödeme gelmedi', 'Diğer'];
  R('POST', '/api/bagislar/:id/iptal', 'rapor|bekleyen', 's', async (c) => {
    const id = +c.m[1], d = db.prepare(SEL + ' WHERE g.id=?').get(id); if (!d) throw new Err(404, 'Bağış yok.'); if (d.durum === 'İptal') throw new Err(409, 'Zaten iptal.');
    const sebep = SEBEP.includes(c.body.sebep) ? c.body.sebep : 'Diğer';
    return tx(() => {
      const us = db.prepare('SELECT DISTINCT u.* FROM birimler_org u JOIN paylar p ON p.birim_id=u.id WHERE p.bagis_id=?').all(id);
      const blk = us.find(u => u.adim >= 3); if (blk) throw new Err(409, `Bu bağışın kurbanı/birimi (${blk.kod}) tamamlandığı için iptal edilemez.`);
      for (const u of us) {
        db.prepare('DELETE FROM paylar WHERE birim_id=? AND bagis_id=?').run(u.id, id);
        if (!cnt(u)) db.prepare('DELETE FROM birimler_org WHERE id=?').run(u.id);
        else if (u.hedef ? sum(u) < u.hedef : u.cap > 1) { const dt = dtGet(u); delete dt[1]; delete dt[2]; dtSet(u.id, dt); const t = tur(u.tur_id); db.prepare('UPDATE birimler_org SET adim=0, tas=NULL, ulke=?, kn=NULL, ks=NULL, ksr=NULL WHERE id=?').run(t.ulke || '', u.id); }
      }
      db.prepare("UPDATE bagislar SET durum='İptal', iptal_sebep=?, iptal_tarih=? WHERE id=?").run(sebep, iso(), id); A.audit(c.user, 'bagis_iptal', d.no + ' · ' + sebep, ip(c.req)); return [200, { ok: 1 }];
    });
  });
  usage.banka.push((id) => db.prepare('SELECT COUNT(*) n FROM bagislar WHERE banka_id=?').get(id).n);
  usage.tur.push((id) => db.prepare('SELECT COUNT(*) n FROM bagislar WHERE tur_id=?').get(id).n);
  usage.partner.push((ad) => db.prepare('SELECT COUNT(*) n FROM birimler_org WHERE partner=?').get(ad).n);
  usage.ulke.push((ad) => db.prepare('SELECT COUNT(*) n FROM birimler_org WHERE ulke=?').get(ad).n);
  ctx.h.SEL = SEL; ctx.h.tur = tur; ctx.h.niOf = niOf; ctx.h.dtGet = dtGet; ctx.h.dtSet = dtSet; ctx.h.cnt = cnt; ctx.h.sum = sum; ctx.h.seriOf = seriOf; ctx.h.bagisSatir = bagisSatir;
};
