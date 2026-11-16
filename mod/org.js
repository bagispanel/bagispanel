// Organizasyon modülü: kurban, su kuyusu, videolu bağış birimleri; numaralandırma; PDF listeleri; entegrasyon.
const crypto = require('crypto');
module.exports = function (ctx) {
  const { R, Err, db, tx, str, ip, A, h } = ctx;
  const { nm, getA, setA, iso, YIL, dtGet, dtSet, cnt, sum, niOf, seriOf, tur } = h;
  db.exec(`
CREATE TABLE IF NOT EXISTS pdf_liste(no TEXT PRIMARY KEY, ids TEXT NOT NULL, tarih TEXT NOT NULL, anahtar TEXT);
CREATE TABLE IF NOT EXISTS api_anahtar(id INTEGER PRIMARY KEY, ad TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, onek TEXT NOT NULL, tarih TEXT NOT NULL DEFAULT (datetime('now')), aktif INTEGER NOT NULL DEFAULT 1);
`);
  try { db.exec('ALTER TABLE birimler_org ADD COLUMN pl TEXT'); } catch (e) { }
  const ORGS = { kurban: 'Kurban', kuyu: 'Su kuyusu', diger: 'Diğer' };
  const MENU = { Kurban: 'orgK', 'Su kuyusu': 'orgS', 'Diğer': 'orgD' };
  const T0 = { Kurban: 'kesim', 'Su kuyusu': 'kuyu', 'Diğer': 'dig' }, T1 = { Kurban: 'video', 'Su kuyusu': 'kuyuv', 'Diğer': 'digv' };
  const sts = (u) => { if (u.adim === 1 && u.ulke && u.org === 'Su kuyusu') return 2; return u.adim < 3 ? u.adim : u.adim === 3 ? (u.video ? 4 : 3) : 5; };
  const knoOf = (u) => u.kn ? ((db.prepare('SELECT onek FROM kn_seri WHERE ad=?').get(u.ksr) || { onek: '' }).onek) + u.kn : '';

  function yukle(org, p) {
    const q = nm(p.get('q')), qd = q.replace(/\D/g, '');
    const rows = db.prepare('SELECT u.*, t.ad turad, t.kat, t.org, t.seri, t.kuyu kj FROM birimler_org u JOIN bagis_turleri t ON t.id=u.tur_id WHERE t.org=? ORDER BY u.id DESC').all(org);
    const pays = db.prepare('SELECT p.*, g.no bno, g.bagisci_id, b.ad bad, b.tel btel FROM paylar p JOIN bagislar g ON g.id=p.bagis_id JOIN bagiscilar b ON b.id=g.bagisci_id WHERE p.birim_id IN (SELECT u.id FROM birimler_org u JOIN bagis_turleri t ON t.id=u.tur_id WHERE t.org=?)').all(org);
    const by = {}; pays.forEach(x => (by[x.birim_id] = by[x.birim_id] || []).push(x));
    let L = rows.map(u => { const k = u.kj ? JSON.parse(u.kj) : null; return { id: u.id, tur_id: u.tur_id, tur: u.turad, kat: u.kat, kod: u.kod, ad: u.ad, cap: u.cap, adim: u.adim, sts: sts(u), ulke: u.ulke, partner: u.partner, hayvan: u.hayvan, hedef: u.hedef, devir: u.devir, tas: u.tas, solo: !!u.solo, kn: u.kn, kno: knoOf(u), ks: u.ks, konum: u.konum, video: u.video, pl: u.pl, dt: dtGet(u), ni: org === 'Kurban' ? u.seri : (k ? k.tip : u.turad), bicim: k ? k.bicim : '', paylar: (by[u.id] || []).map(x => ({ bagisci_id: x.bagisci_id, id: x.id, no: x.no, ad: x.ad, tel: x.tel, tarih: x.tarih, tutar: x.tutar, vs: x.vs, bno: x.bno, bagisci: x.bad })), toplam: (by[u.id] || []).reduce((a, x) => a + (x.tutar || 0), 0) + (u.devir || 0) }; });
    const cnts = [0, 0, 0, 0, 0, 0]; L.forEach(u => cnts[u.sts]++);
    const f = (k, v) => v && v !== 'Tümü';
    if (f(0, p.get('hy')) && p.get('hy') === 'Büyükbaş') L = L.filter(u => u.cap > 1); if (p.get('hy') === 'Küçükbaş') L = L.filter(u => u.cap === 1 && (!f(0, p.get('hs')) || u.hayvan === p.get('hs')));
    if (f(0, p.get('ni'))) L = L.filter(u => u.ni === p.get('ni')); if (f(0, p.get('bc'))) L = L.filter(u => u.bicim === p.get('bc')); if (f(0, p.get('cat'))) L = L.filter(u => u.kat === p.get('cat'));
    if (p.get('ct') === 'Atanmamış') L = L.filter(u => !u.ulke); else if (f(0, p.get('ct'))) L = L.filter(u => u.ulke === p.get('ct'));
    if (p.get('pt') === 'Atanmamış') L = L.filter(u => !u.partner); else if (f(0, p.get('pt'))) L = L.filter(u => u.partner === p.get('pt'));
    const d1 = p.get('d1'), d2 = p.get('d2'); if (d1 || d2) L = L.filter(u => u.paylar.some(s => (!d1 || s.tarih >= d1) && (!d2 || s.tarih <= d2)));
    if (q) L = L.filter(u => nm(u.ad).includes(q) || nm(u.kod).includes(q) || (u.kn && qd && String(u.kn) === qd) || u.paylar.some(s => nm(s.ad).includes(q) || nm(s.no).includes(q) || nm(s.bagisci).includes(q) || nm(s.bno).includes(q) || (qd.length >= 3 && (s.tel || '').replace(/\D/g, '').includes(qd))));
    if (p.get('tur')) L = L.filter(u => u.tur_id === +p.get('tur'));
    const tab = p.get('tab'); if (tab !== null && tab !== '' && +tab >= 0) L = L.filter(u => u.sts === +tab);
    const dg = {}; L.forEach(u => { if (!u.ulke) return; const k = u.ulke + ' · ' + (u.partner || 'kurum atanmamış'); const x = dg[k] = dg[k] || { k, b: 0, kb: 0, t: 0 }; x.t += u.toplam; if (org === 'Kurban') { if (u.cap > 1) x.b++; else x.kb++; } else x.b++; });
    L.forEach(u => { u.son = u.paylar.reduce((m, s) => s.tarih > m ? s.tarih : m, ''); });
    const pg = Math.max(0, +p.get('pg') || 0), toplam = L.length, ids = L.map(u => u.id);
    return { dagilim: Object.values(dg), liste: L.slice(pg * 25, pg * 25 + 25), toplam, ids: ids.slice(0, 5000), sayac: cnts, ozet: { birim: rows.length, dolu: L.length ? rows.filter(u => cnt(u) >= u.cap || u.adim >= 1).length : 0, hisse: pays.length } };
  }
  Object.entries(ORGS).forEach(([k, org]) => R('GET', '/api/org/' + k, MENU[org], 'g', async (c) => [200, yukle(org, new URL(c.req.url, 'http://x').searchParams)]));

  function msgVars(u, s, t) { const dt = dtGet(u); return { ad: s.ad, tur: t.ad, sahip_no: s.no, ulke: u.ulke || '-', tarih: ctx.dstr(dt[3] || iso()), bno: s.bno || '-', kuyu_no: u.kn ? knoOf(u) : '-', kuyu_adi: u.ad || '', link: 'https://…/v/' + crypto.createHash('sha1').update(String(s.id)).digest('hex').slice(0, 8) }; }
  R('POST', '/api/org/islem', 'orgK|orgS|orgD', 'd', async (c) => {
    const a = c.body.a, ids = (Array.isArray(c.body.ids) ? c.body.ids : []).map(Number).filter(Boolean); if (!ids.length) throw new Err(400, 'Önce satır seçin.');
    return tx(() => {
      const us = db.prepare(`SELECT u.*, t.org FROM birimler_org u JOIN bagis_turleri t ON t.id=u.tur_id WHERE u.id IN (${ids.map(() => '?').join(',')})`).all(...ids);
      us.forEach(u => { if (!A.can(c.perms, MENU[u.org], 'd')) throw new Err(403, 'Bu organizasyonda düzeltme yetkiniz yok.'); });
      let msg = '';
      if (a === 'c') {
        const ulke = str(c.body.ulke, 60), partner = str(c.body.partner, 80) || null, n = +c.body.n || 0;
        if (!ulke || !db.prepare('SELECT 1 FROM ulkeler WHERE ad=?').get(ulke)) throw new Err(400, 'Ülke seçin.'); if (partner && !db.prepare('SELECT 1 FROM partnerler WHERE ad=?').get(partner)) throw new Err(400, 'Kurum bulunamadı.');
        const el = us.filter(u => u.adim >= 1 && u.adim <= 2).slice(0, n > 0 ? n : us.length); if (!el.length) throw new Err(409, 'Seçili kayıtlar henüz dolmadı.');
        el.forEach(u => { const dt = dtGet(u); dt[2] = iso(); dtSet(u.id, dt); db.prepare('UPDATE birimler_org SET ulke=?, partner=?, adim=2 WHERE id=?').run(ulke, partner, u.id); }); ctx.kfix(); msg = `${el.length} kayıt atandı: ${ulke}`;
      } else if (a === 'k') {
        let p = 0; const el = us.filter(u => u.adim === 2 || (u.adim === 1 && u.ulke && u.org === 'Su kuyusu')); if (!el.length) throw new Err(409, 'Önce ülke atayın.');
        el.forEach(u => { const dt = dtGet(u); dt[3] = iso(); dtSet(u.id, dt); db.prepare('UPDATE birimler_org SET adim=3 WHERE id=?').run(u.id); const t = tur(u.tur_id), uu = db.prepare('SELECT * FROM birimler_org WHERE id=?').get(u.id); db.prepare('SELECT p.*, g.no bno FROM paylar p JOIN bagislar g ON g.id=p.bagis_id WHERE p.birim_id=?').all(u.id).forEach(s => { ctx.sms(T0[u.org], msgVars(uu, s, t), s.ad, c.user.kadi); p++; }); }); msg = `${el.length} kayıt tamamlandı olarak işaretlendi, ${p} SMS kuyruğa alındı`;
      } else if (a === 'v') {
        const v = str(c.body.video, 300); if (!v) throw new Err(400, 'Video adı ya da bağlantısı yazın.'); us.forEach(u => db.prepare('UPDATE birimler_org SET video=? WHERE id=?').run(v, u.id)); msg = 'Video bağlandı';
      } else if (a === 'g' || a === 'y') {
        let p = 0; const el = us.filter(u => u.adim === 3 || (a === 'y' && u.adim === 4)); if (!el.length) throw new Err(409, 'Önce tamamlandı olarak işaretleyin.'); const yok = el.find(u => !u.video); if (yok) throw new Err(409, `${yok.kod} için video bağlanmamış.`);
        el.forEach(u => { const dt = dtGet(u); dt[4] = iso(); dtSet(u.id, dt); db.prepare('UPDATE birimler_org SET adim=4 WHERE id=?').run(u.id); const t = tur(u.tur_id), uu = db.prepare('SELECT * FROM birimler_org WHERE id=?').get(u.id); db.prepare('SELECT p.*, g.no bno FROM paylar p JOIN bagislar g ON g.id=p.bagis_id WHERE p.birim_id=?').all(u.id).forEach(s => { if (a === 'g' && s.vs) return; ctx.sms(T1[u.org], msgVars(uu, s, t), s.ad, c.user.kadi); db.prepare('UPDATE paylar SET vs=? WHERE id=?').run(iso(), s.id); p++; }); }); msg = `${p} kişiye video bağlantısı gönderildi`;
      } else if (a === 'r') { us.forEach(u => { db.prepare('UPDATE birimler_org SET video=NULL, adim=CASE WHEN adim=4 THEN 3 ELSE adim END WHERE id=?').run(u.id); }); msg = 'Video kaldırıldı'; }
      else throw new Err(400, 'Bilinmeyen işlem.');
      A.audit(c.user, 'org_islem_' + a, `${us.length} kayıt · ${msg}`, ip(c.req)); return [200, { ok: 1, msg }];
    });
  });
  R('PUT', '/api/org/birim/:id', 'orgK|orgS|orgD', 'd', async (c) => {
    const u = db.prepare('SELECT u.*, t.org FROM birimler_org u JOIN bagis_turleri t ON t.id=u.tur_id WHERE u.id=?').get(+c.m[1]); if (!u) throw new Err(404, 'Kayıt yok.'); if (!A.can(c.perms, MENU[u.org], 'd')) throw new Err(403, 'Yetkiniz yok.');
    const konum = str(c.body.konum, 300); if (konum && !/^https?:\/\//i.test(konum) && !/^-?\d{1,3}(\.\d+)?\s*[, ]\s*-?\d{1,3}(\.\d+)?$/.test(konum)) throw new Err(400, 'Konum bir harita bağlantısı ya da “enlem, boylam” olmalı.');
    db.prepare('UPDATE birimler_org SET konum=?, video=?, ad=? WHERE id=?').run(konum || null, c.body.video === undefined ? u.video : (str(c.body.video, 300) || null), c.body.ad === undefined ? u.ad : (str(c.body.ad, 80) || ''), u.id); return [200, { ok: 1 }];
  });

  R('POST', '/api/org/pay-gonder', 'orgK|orgS|orgD', 'd', async (c) => { // video bağlantısını yalnızca tek kişiye gönder
    const p = db.prepare('SELECT p.*, u.adim, u.video, u.id uid, t.org FROM paylar p JOIN birimler_org u ON u.id=p.birim_id JOIN bagis_turleri t ON t.id=u.tur_id WHERE p.id=?').get(+c.body.id); if (!p) throw new Err(404, 'Kayıt yok.');
    if (!A.can(c.perms, MENU[p.org], 'd')) throw new Err(403, 'Yetkiniz yok.'); if (!p.video) throw new Err(409, 'Önce video bağlayın.'); if (p.adim < 3) throw new Err(409, 'Birim henüz tamamlanmadı.'); if (p.vs) throw new Err(409, 'Bu kişiye zaten gönderildi.');
    const uu = db.prepare('SELECT * FROM birimler_org WHERE id=?').get(p.uid), t = tur(uu.tur_id), s = db.prepare('SELECT p.*, g.no bno FROM paylar p JOIN bagislar g ON g.id=p.bagis_id WHERE p.id=?').get(p.id);
    ctx.sms(T1[p.org], msgVars(uu, s, t), s.ad, c.user.kadi); db.prepare('UPDATE paylar SET vs=? WHERE id=?').run(iso(), p.id); return [200, { ok: 1 }];
  });
  // ---- numaralandırma
  R('GET', '/api/numara', 'numara', 'g', async () => {
    const mx = (k) => db.prepare('SELECT COALESCE(MAX(kn),0) m FROM birimler_org WHERE ks=?').get(k).m;
    const turler = db.prepare("SELECT id,ad FROM bagis_turleri WHERE org='Su kuyusu'").all().map(t => ({ ...t, seri: seriOf(t.id), tip: niOf(tur(t.id)) }));
    const sayac = db.prepare('SELECT * FROM kn_sayac ORDER BY k').all().map(x => ({ ...x, max: mx(x.k) }));
    const seriler = db.prepare('SELECT * FROM kn_seri ORDER BY ad').all().map(s => ({ ...s, kullanim: turler.some(t => t.seri === s.ad) || sayac.some(x => (x.k === s.ad || x.k.startsWith(s.ad + ' · ')) && x.max) }));
    return [200, { seriler, turler, sayac }];
  });
  R('PUT', '/api/numara/map', 'numara', 'd', async (c) => {
    const m = c.body.map || {}; tx(() => Object.entries(m).forEach(([id, s]) => { if (!db.prepare('SELECT 1 FROM kn_seri WHERE ad=?').get(s)) throw new Err(400, 'Seri yok.'); db.prepare('INSERT INTO kn_map(tur_id,seri) VALUES(?,?) ON CONFLICT(tur_id) DO UPDATE SET seri=?').run(+id, s, s); })); return [200, { ok: 1 }];
  });
  R('POST', '/api/numara/seri', 'numara', 'e', async (c) => {
    const ad = str(c.body.ad, 40); if (!ad) throw new Err(400, 'Seri adını yazın.'); if (db.prepare('SELECT 1 FROM kn_seri WHERE ad=?').get(ad)) throw new Err(409, 'Bu seri zaten var.');
    db.prepare('INSERT INTO kn_seri(ad,onek,ulkeye_gore) VALUES(?,?,?)').run(ad, str(c.body.onek, 10), c.body.ulke ? 1 : 0); if (!c.body.ulke) db.prepare('INSERT OR IGNORE INTO kn_sayac(k,n) VALUES(?,?)').run(ad, Math.max(1, +c.body.baslangic || 1)); return [201, { ok: 1 }];
  });
  R('PUT', '/api/numara/seri', 'numara', 'd', async (c) => { db.prepare('UPDATE kn_seri SET onek=? WHERE ad=?').run(str(c.body.onek, 10), str(c.body.ad, 40)); return [200, { ok: 1 }]; });
  R('DELETE', '/api/numara/seri', 'numara', 's', async (c) => {
    const ad = new URL(c.req.url, 'http://x').searchParams.get('ad'); if (ad === 'Genel') throw new Err(409, 'Genel seri silinemez.');
    if (db.prepare('SELECT 1 FROM kn_map WHERE seri=?').get(ad) || db.prepare('SELECT 1 FROM birimler_org WHERE ksr=?').get(ad)) throw new Err(409, 'Bu seri kullanımda.'); db.prepare('DELETE FROM kn_seri WHERE ad=?').run(ad); db.prepare('DELETE FROM kn_sayac WHERE k=?').run(ad); return [200, { ok: 1 }];
  });
  R('PUT', '/api/numara/sayac', 'numara', 'd', async (c) => {
    const k = str(c.body.k, 120), n = Math.floor(+c.body.n); if (!(n >= 1)) throw new Err(400, 'Geçerli bir numara yazın.');
    const mx = db.prepare('SELECT COALESCE(MAX(kn),0) m FROM birimler_org WHERE ks=?').get(k).m; if (n <= mx) throw new Err(409, `Bu sayaçta en büyük verilmiş numara ${mx}. ${mx + 1} ya da daha büyük yazın.`);
    db.prepare('INSERT INTO kn_sayac(k,n) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET n=?').run(k, n, n); ctx.kfix(); return [200, { ok: 1 }];
  });

  // ---- PDF ayarları ve listeler
  const PDFS = () => getA('pdf', { vb: 50, pre: 'VL-' });
  R('GET', '/api/pdf', 'pdfay|orgK|orgD', 'g', async () => [200, { ayar: PDFS(), listeler: db.prepare('SELECT no,tarih,ids FROM pdf_liste ORDER BY no DESC LIMIT 200').all().map(x => ({ no: x.no, tarih: x.tarih, adet: JSON.parse(x.ids).length })) }]);
  R('PUT', '/api/pdf', 'pdfay', 'd', async (c) => { const n = Math.floor(+c.body.vb); if (!(n >= 5 && n <= 500)) throw new Err(400, 'Liste başına isim 5 ile 500 arasında olmalı.'); setA('pdf', { ...PDFS(), vb: n }); return [200, { ok: 1 }]; });
  const plKey = (u) => [u.tur_id, u.ulke, u.partner || ''].join('|');
  R('POST', '/api/pdf/olustur', 'orgD', 'd', async (c) => {
    const ids = (Array.isArray(c.body.ids) ? c.body.ids : []).map(Number).filter(Boolean); if (!ids.length) throw new Err(400, 'Önce satır seçin.');
    return tx(() => {
      const us = db.prepare(`SELECT u.* FROM birimler_org u JOIN bagis_turleri t ON t.id=u.tur_id WHERE t.org='Diğer' AND u.id IN (${ids.map(() => '?').join(',')}) ORDER BY u.id`).all(...ids), ok = us.filter(u => u.ulke);
      const done = [...new Set(ok.filter(u => u.pl).map(u => u.pl))], fresh = {}; ok.filter(u => !u.pl).forEach(u => (fresh[plKey(u)] = fresh[plKey(u)] || []).push(u));
      const S = PDFS(), yeni = [];
      Object.values(fresh).forEach(g => { for (let i = 0; i < g.length; i += S.vb) { const no = S.pre + YIL() + '-' + String(h.next('pdf')).padStart(4, '0'), part = g.slice(i, i + S.vb); db.prepare('INSERT INTO pdf_liste(no,ids,tarih,anahtar) VALUES(?,?,?,?)').run(no, JSON.stringify(part.map(u => u.id)), iso(), plKey(part[0])); part.forEach(u => db.prepare('UPDATE birimler_org SET pl=? WHERE id=?').run(no, u.id)); yeni.push(no); } });
      return [200, { yeni, onceki: done, atlanan: us.length - ok.length }];
    });
  });
  R('GET', '/api/pdf/liste', 'orgK|orgD|orgS', 'g', async (c) => { // yazdırma için: kayıtlı liste no'su ya da id'ler
    const p = new URL(c.req.url, 'http://x').searchParams, no = p.get('no'); let ids = no ? JSON.parse((db.prepare('SELECT ids FROM pdf_liste WHERE no=?').get(no) || { ids: '[]' }).ids) : (p.get('ids') || '').split(',').map(Number).filter(Boolean);
    if (!ids.length) return [200, { liste: [] }];
    const us = db.prepare(`SELECT u.*, t.ad turad, t.kat, t.org, t.seri FROM birimler_org u JOIN bagis_turleri t ON t.id=u.tur_id WHERE u.id IN (${ids.map(() => '?').join(',')}) ORDER BY u.id`).all(...ids), mn = { Kurban: 'orgK', 'Su kuyusu': 'orgS', 'Diğer': 'orgD' };
    return [200, { dernek: getA('dernek_adi', '[Dernek adı]'), liste: us.filter(u => A.can(c.perms, mn[u.org], 'g')).map(u => ({ id: u.id, kod: u.kod, ad: u.ad, tur: u.turad, kat: u.kat, org: u.org, cap: u.cap, ulke: u.ulke, partner: u.partner, kno: knoOf(u), ks: u.ks, konum: u.konum, pl: u.pl, dt: dtGet(u), ni: u.seri, paylar: db.prepare('SELECT p.no,p.ad,g.no bno FROM paylar p JOIN bagislar g ON g.id=p.bagis_id WHERE p.birim_id=? ORDER BY p.id').all(u.id) })) }];
  });

  // ---- entegrasyon: anahtarlı dış API
  R('GET', '/api/entegre', 'entegre', 'g', async () => [200, { kaynaklar: db.prepare('SELECT kaynak k, COUNT(*) n FROM bagislar GROUP BY kaynak').all(), anahtarlar: db.prepare('SELECT id,ad,onek,tarih,aktif FROM api_anahtar ORDER BY id DESC').all() }]);
  R('POST', '/api/entegre/anahtar', 'entegre', 'e', async (c) => {
    const ad = str(c.body.ad, 60); if (!ad) throw new Err(400, 'Anahtara bir ad verin (örn. Web sitesi).');
    const key = 'bp_' + crypto.randomBytes(24).toString('hex'); db.prepare('INSERT INTO api_anahtar(ad,hash,onek) VALUES(?,?,?)').run(ad, crypto.createHash('sha256').update(key).digest('hex'), key.slice(0, 8)); A.audit(c.user, 'api_anahtar', ad, ip(c.req)); return [201, { anahtar: key }];
  });
  R('DELETE', '/api/entegre/anahtar/:id', 'entegre', 's', async (c) => { db.prepare('UPDATE api_anahtar SET aktif=0 WHERE id=?').run(+c.m[1]); return [200, { ok: 1 }]; });
  const dis = (req) => { const k = req.headers['x-api-key']; const r = k && db.prepare('SELECT * FROM api_anahtar WHERE hash=? AND aktif=1').get(crypto.createHash('sha256').update(String(k)).digest('hex')); if (!r) throw new Err(401, 'API anahtarı geçersiz.'); return r; };
  R('GET', '/api/dis/turler', null, null, async (c) => { dis(c.req); return [200, db.prepare('SELECT id,kat,ad,org,fiyat FROM bagis_turleri WHERE web=1').all()]; });
  R('POST', '/api/dis/bagis', null, null, async (c) => { // dış sistemden gelen bağış her zaman “Bekleyen” düşer; xid ile mükerrer önlenir
    const k = dis(c.req), b = { ...c.body, durum: 'Bekleyen' }, xid = str(b.xid, 80); if (!xid) throw new Err(400, 'xid (dış kimlik) zorunlu.');
    const var_ = db.prepare('SELECT id,no FROM bagislar WHERE kaynak=? AND xid=?').get(k.ad, xid); if (var_) return [200, { ...var_, tekrar: true }];
    const r = ctx.bagisOlustur(b, { id: null, kadi: 'api:' + k.ad }, k.ad, xid, c.req); return [201, r];
  });
};
