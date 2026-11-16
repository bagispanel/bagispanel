// Ana sayfa özeti: yetkiye göre yalnızca izinli bölümleri döndürür.
module.exports = function (ctx) {
  const { R, db, A } = ctx;
  const iso = (d) => d.toISOString().slice(0, 10), gun = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const sts = (u) => { if (u.adim === 1 && u.ulke && u.org === 'Su kuyusu') return 2; return u.adim < 3 ? u.adim : u.adim === 3 ? (u.video ? 4 : 3) : 5; };
  const ORG = [['orgK', 'Kurban'], ['orgS', 'Su kuyusu'], ['orgD', 'Diğer']];
  const ETK = { orgK: ['Hisse bekliyor', 'Ülke atanacak', 'Kesim bekliyor', 'Video bağlanacak', 'Video kontrolü'], orgS: ['Toplanıyor', 'Ülke atanacak', 'Açılış bekliyor', 'Video bağlanacak', 'Video kontrolü'], orgD: ['Hazırlanıyor', 'Ülke atanacak', 'Dağıtım bekliyor', 'Video bağlanacak', 'Video kontrolü'] };
  const NAD = { orgK: 'Kurban', orgS: 'Su kuyusu', orgD: 'Videolu bağış' };
  R('GET', '/api/ana', 'auth', null, async (c) => {
    const g = (m) => A.can(c.perms, m, 'g'), out = { tarih: iso(new Date()) };
    const raporlu = g('rapor');
    const q = (sql, ...a) => db.prepare(sql).get(...a), bug = gun(0);
    // Bugün benim girdiklerim
    out.benim = q("SELECT COUNT(*) adet FROM bagislar WHERE tarih=? AND kullanici=? AND durum<>'İptal'", bug, c.user.kadi);
    if (raporlu) {
      const top = (d1, d2) => q("SELECT COUNT(*) adet, COALESCE(SUM(tl),0) tutar FROM bagislar WHERE durum='Onaylı' AND tarih>=? AND tarih<=?", d1, d2);
      const ay0 = bug.slice(0, 7) + '-01', gd = new Date(ay0); gd.setUTCMonth(gd.getUTCMonth() - 1);
      const gec0 = iso(gd), gecSon = iso(new Date(new Date(ay0).getTime() - 86400000));
      out.ozet = { bugun: top(bug, bug), dun: top(gun(-1), gun(-1)), ay: top(ay0, bug), gecen: top(gec0, gecSon) };
      // Geçen ayın aynı güne kadarki karşılaştırması
      const gunNo = +bug.slice(8), gecAyniGun = iso(new Date(Date.UTC(gd.getUTCFullYear(), gd.getUTCMonth(), Math.min(gunNo, new Date(Date.UTC(gd.getUTCFullYear(), gd.getUTCMonth() + 1, 0)).getUTCDate()))));
      out.ozet.gecenAyni = top(gec0, gecAyniGun);
      const rows = db.prepare("SELECT tarih, COUNT(*) adet, SUM(tl) tutar FROM bagislar WHERE durum='Onaylı' AND tarih>=? GROUP BY tarih").all(gun(-29)), m = {}; rows.forEach(r => m[r.tarih] = r);
      out.gun30 = Array.from({ length: 30 }, (_, i) => { const t = gun(i - 29), r = m[t]; return { t, tutar: r ? r.tutar : 0, adet: r ? r.adet : 0 }; });
      out.kategori = db.prepare("SELECT t.kat, COUNT(*) adet, SUM(g.tl) tutar FROM bagislar g JOIN bagis_turleri t ON t.id=g.tur_id WHERE g.durum='Onaylı' AND g.tarih>=? GROUP BY t.kat ORDER BY tutar DESC").all(ay0);
      out.son = db.prepare("SELECT g.id, g.no, g.tarih, g.tl, g.durum, g.kaynak, g.kullanici, b.ad, g.bagisci_id, t.ad tur, t.kat, us.ad sorumlu_ad FROM bagislar g JOIN bagiscilar b ON b.id=g.bagisci_id JOIN bagis_turleri t ON t.id=g.tur_id LEFT JOIN users us ON us.kadi=g.kullanici ORDER BY g.id DESC LIMIT 10").all().map(r => ({ id: r.id, no: r.no, tarih: r.tarih, tl: r.tl, durum: r.durum, ad: r.ad, bagisci_id: r.bagisci_id, tur: r.kat + ' / ' + r.tur, sorumlu: r.kaynak === 'Manuel (CRM)' ? (r.sorumlu_ad || r.kullanici || '') : r.kaynak }));
      out.sorumlular = db.prepare("SELECT COALESCE(us.ad, g.kullanici) ad, COUNT(*) adet, SUM(g.tl) tutar FROM bagislar g LEFT JOIN users us ON us.kadi=g.kullanici WHERE g.tarih=? AND g.durum<>'İptal' GROUP BY g.kullanici ORDER BY tutar DESC").all(bug);
    }
    // Bekleyen işler
    const isler = [];
    if (g('bekleyen')) { const n = q("SELECT COUNT(*) n FROM bagislar WHERE durum='Bekleyen'").n; isler.push({ k: 'bekleyen', etiket: 'Onay bekleyen bağış', n, git: 'bekleyen' }); const d = q("SELECT COUNT(*) n FROM bagislar WHERE durum='Bekleyen' AND kaynak<>'Manuel (CRM)'").n; if (d) out.dis = d; }
    if (g('bhar')) { const n = ctx.bankaBekleyen ? ctx.bankaBekleyen() : 0; if (n) isler.push({ k: 'bhar', etiket: 'Eşleştirme bekleyen banka hareketi', n, git: 'bhar' }); }
    ORG.forEach(([r, org]) => {
      if (!g(r)) return;
      const rows = db.prepare('SELECT u.adim, u.ulke, u.video, t.org FROM birimler_org u JOIN bagis_turleri t ON t.id=u.tur_id WHERE t.org=?').all(org), cnt = [0, 0, 0, 0, 0, 0];
      rows.forEach(u => cnt[sts(u)]++);
      if (r === 'orgD') { const pr = {}; db.prepare('SELECT u.adim, u.ulke, u.video, t.org, t.ad turad FROM birimler_org u JOIN bagis_turleri t ON t.id=u.tur_id WHERE t.org=?').all(org).forEach(u => { const k = sts(u); if (k < 1 || k > 4) return; (pr[u.turad] = pr[u.turad] || [0, 0, 0, 0, 0])[k]++; }); out.proje = Object.entries(pr).map(([ad, say]) => ({ ad, say })).sort((a, b) => b.say.reduce((x, y) => x + y, 0) - a.say.reduce((x, y) => x + y, 0)); }
      [1, 2, 3, 4].forEach(i => { if (cnt[i]) isler.push({ k: r + i, grup: NAD[r], etiket: ETK[r][i], n: cnt[i], git: r + ':' + i }); });
    });
    out.isler = isler;
    // Hedefe yaklaşan kuyular
    if (g('orgS')) {
      const us = db.prepare("SELECT u.id, u.kod, u.ad, u.cap, u.hedef, u.devir, t.ad turad, (SELECT COUNT(*) FROM paylar p WHERE p.birim_id=u.id) pc, (SELECT COALESCE(SUM(p.tutar),0) FROM paylar p WHERE p.birim_id=u.id) ps FROM birimler_org u JOIN bagis_turleri t ON t.id=u.tur_id WHERE t.org='Su kuyusu' AND u.adim=0").all();
      out.kuyular = us.map(u => ({ id: u.id, ad: u.ad || u.turad, kod: u.kod, yuzde: u.hedef ? Math.round(((u.ps || 0) + (u.devir || 0)) / u.hedef * 100) : (u.cap ? Math.round(u.pc / u.cap * 100) : 0) })).filter(u => u.yuzde >= 60 && u.yuzde < 100).sort((a, b) => b.yuzde - a.yuzde).slice(0, 5);
    }
    // Uyarılar
    const uy = {};
    if (g('bagisci')) uy.pasif = q("SELECT COUNT(*) n FROM (SELECT bagisci_id, MAX(tarih) son FROM bagislar WHERE durum='Onaylı' GROUP BY bagisci_id) WHERE son<?", gun(-90)).n;
    if (raporlu) uy.iptal = q("SELECT COUNT(*) n FROM bagislar WHERE durum='İptal' AND iptal_tarih>=?", gun(-30)).n;
    out.uyari = uy;
    out.tercih = ctx.h.getA('ana_' + c.user.id, null);
    out.kisa = [['alin', 'Bağış Al'], ['bekleyen', 'Onay Bekleyenler'], ['bagisci', 'Bağışçı Rehberi'], ['rapor', 'Bağış Raporları']].filter(x => g(x[0])).map(x => ({ r: x[0], ad: x[1] }));
    return [200, out];
  });
  const BOL = ['kisa', 'ozet', 'isler', 'kuyular', 'uyari', 'grafik', 'kategori', 'son', 'sorumlu'];
  R('PUT', '/api/ana/tercih', 'auth', null, async (c) => {
    const b = c.body || {}, sira = [...new Set((Array.isArray(b.sira) ? b.sira : []).filter(x => BOL.includes(x)))], gizli = [...new Set((Array.isArray(b.gizli) ? b.gizli : []).filter(x => BOL.includes(x)))];
    if (b.sifirla) { db.prepare('DELETE FROM ayar WHERE k=?').run('ana_' + c.user.id); return [200, { ok: 1 }]; }
    ctx.h.setA('ana_' + c.user.id, { sira, gizli }); return [200, { ok: 1 }];
  });
};
