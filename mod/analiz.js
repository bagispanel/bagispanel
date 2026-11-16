// Raporlama ve Analiz: dönemsel karşılaştırma, bağış türü, bağışçı, saha/proje ve iletişim analizleri. Yalnızca okuma; tutarlar onaylı bağışlardan, TL karşılığıyla hesaplanır.
module.exports = function (ctx) {
  const { R, db } = ctx;
  const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  const pad = (n) => String(n).padStart(2, '0'), iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ayAnahtar = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const aylar = (n) => { const o = [], b = new Date(); b.setDate(1); for (let i = n - 1; i >= 0; i--) { const d = new Date(b.getFullYear(), b.getMonth() - i, 1); o.push({ k: ayAnahtar(d), ad: AY[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) }); } return o; };
  const q = (s, ...a) => db.prepare(s).all(...a), q1 = (s, ...a) => db.prepare(s).get(...a) || {};
  const OK = "g.durum='Onaylı'", fark = (a, b) => (b ? Math.round((a - b) / b * 1000) / 10 : null);

  R('GET', '/api/analiz/karsilastirma', 'rkarsi', 'g', async () => {
    const A = aylar(13), bas = A[0].k + '-01', ay = q(`SELECT substr(g.tarih,1,7) k, SUM(g.tl) tutar, COUNT(*) adet, COUNT(DISTINCT g.bagisci_id) kisi FROM bagislar g WHERE ${OK} AND g.tarih>=? GROUP BY k`, bas), M = Object.fromEntries(ay.map(x => [x.k, x]));
    const seri = A.map(a => ({ k: a.k, ad: a.ad, tutar: (M[a.k] || {}).tutar || 0, adet: (M[a.k] || {}).adet || 0, kisi: (M[a.k] || {}).kisi || 0 }));
    const bu = seri[12], onceki = seri[11], gecenYil = seri[0], d = new Date(), yil = d.getFullYear(), bug = iso(d), gy = `${yil - 1}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const ytd = q1(`SELECT COALESCE(SUM(tl),0) t, COUNT(*) n FROM bagislar g WHERE ${OK} AND g.tarih>=? AND g.tarih<=?`, `${yil}-01-01`, bug), ytdG = q1(`SELECT COALESCE(SUM(tl),0) t, COUNT(*) n FROM bagislar g WHERE ${OK} AND g.tarih>=? AND g.tarih<=?`, `${yil - 1}-01-01`, gy);
    const ort = (x) => (x.adet ? x.tutar / x.adet : 0), son12 = seri.slice(1), en = son12.reduce((m, x) => (x.tutar > m.tutar ? x : m), son12[0]);
    const gun = q(`SELECT CAST(strftime('%w', g.tarih) AS INTEGER) w, SUM(g.tl) tutar, COUNT(*) adet FROM bagislar g WHERE ${OK} AND g.tarih>=? GROUP BY w`, A[1].k + '-01'), G = Object.fromEntries(gun.map(x => [x.w, x]));
    const hg = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'].map((ad, i) => ({ ad, tutar: (G[i] || {}).tutar || 0, adet: (G[i] || {}).adet || 0 }));
    return [200, { seri, bu, onceki, gecenYil, degisim: { aylik: fark(bu.tutar, onceki.tutar), yillik: fark(bu.tutar, gecenYil.tutar), adetAylik: fark(bu.adet, onceki.adet), ytd: fark(ytd.t, ytdG.t) }, ytd: { tutar: ytd.t, adet: ytd.n, gecen: ytdG.t, gecenAdet: ytdG.n, yil }, ortalama: { bu: ort(bu), onceki: ort(onceki) }, enIyi: en, haftaninGunu: hg, ortAylik: son12.reduce((n, x) => n + x.tutar, 0) / 12 }];
  });

  R('GET', '/api/analiz/tur', 'rtur', 'g', async () => {
    const A = aylar(6), bas = A[0].k + '-01', buAy = A[5].k, onceAy = A[4].k;
    const top = q1(`SELECT COALESCE(SUM(tl),0) t, COUNT(*) n FROM bagislar g WHERE ${OK}`), kat = q(`SELECT t.kat ad, SUM(g.tl) tutar, COUNT(*) adet FROM bagislar g JOIN bagis_turleri t ON t.id=g.tur_id WHERE ${OK} GROUP BY t.kat ORDER BY tutar DESC`);
    const tur = q(`SELECT t.kat, t.ad, t.org, SUM(g.tl) tutar, COUNT(*) adet, SUM(CASE WHEN substr(g.tarih,1,7)=? THEN g.tl ELSE 0 END) bu, SUM(CASE WHEN substr(g.tarih,1,7)=? THEN g.tl ELSE 0 END) once FROM bagislar g JOIN bagis_turleri t ON t.id=g.tur_id WHERE ${OK} GROUP BY t.id ORDER BY tutar DESC LIMIT 30`, buAy, onceAy).map(x => ({ ...x, pay: top.t ? Math.round(x.tutar / top.t * 1000) / 10 : 0, degisim: fark(x.bu, x.once) }));
    const trend = q(`SELECT t.kat, substr(g.tarih,1,7) k, SUM(g.tl) tutar FROM bagislar g JOIN bagis_turleri t ON t.id=g.tur_id WHERE ${OK} AND g.tarih>=? GROUP BY t.kat, k`, bas), kats = kat.slice(0, 5).map(x => x.ad);
    const tr = kats.map(k => ({ ad: k, seri: A.map(a => (trend.find(x => x.kat === k && x.k === a.k) || {}).tutar || 0) }));
    return [200, { toplam: top.t, adet: top.n, aylar: A.map(a => a.ad), kategori: kat.map(x => ({ ...x, pay: top.t ? Math.round(x.tutar / top.t * 1000) / 10 : 0 })), tur, trend: tr, odeme: q(`SELECT g.odeme ad, SUM(g.tl) tutar, COUNT(*) adet FROM bagislar g WHERE ${OK} GROUP BY g.odeme ORDER BY tutar DESC`), kaynak: q(`SELECT g.kaynak ad, SUM(g.tl) tutar, COUNT(*) adet FROM bagislar g WHERE ${OK} GROUP BY g.kaynak ORDER BY tutar DESC`), para: q(`SELECT g.para ad, SUM(g.tl) tutar, COUNT(*) adet FROM bagislar g WHERE ${OK} GROUP BY g.para ORDER BY tutar DESC`), iptal: q1("SELECT COUNT(*) n, COALESCE(SUM(tl),0) t FROM bagislar WHERE durum='İptal'"), bekleyen: q1("SELECT COUNT(*) n, COALESCE(SUM(tl),0) t FROM bagislar WHERE durum='Bekleyen'") }];
  });

  R('GET', '/api/analiz/bagisci', 'rbagisci', 'g', async () => {
    const A = aylar(12), bugun = iso(new Date()), gun = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
    const per = q(`SELECT b.id, b.ad, MIN(g.tarih) ilk, MAX(g.tarih) son, SUM(g.tl) toplam, COUNT(*) adet FROM bagiscilar b JOIN bagislar g ON g.bagisci_id=b.id AND ${OK} GROUP BY b.id`);
    const yeni = {}, aktif = {}; per.forEach(x => { yeni[x.ilk.slice(0, 7)] = (yeni[x.ilk.slice(0, 7)] || 0) + 1; });
    q(`SELECT substr(g.tarih,1,7) k, COUNT(DISTINCT g.bagisci_id) n FROM bagislar g WHERE ${OK} AND g.tarih>=? GROUP BY k`, A[0].k + '-01').forEach(x => (aktif[x.k] = x.n));
    const seri = A.map(a => ({ ad: a.ad, yeni: yeni[a.k] || 0, aktif: aktif[a.k] || 0, tekrar: Math.max(0, (aktif[a.k] || 0) - (yeni[a.k] || 0)) }));
    const bant = [['500 ₺ altı', 0, 500], ['500 – 1.000 ₺', 500, 1000], ['1.000 – 5.000 ₺', 1000, 5000], ['5.000 – 20.000 ₺', 5000, 20000], ['20.000 ₺ üstü', 20000, 1e15]].map(([ad, a, b]) => ({ ad, n: per.filter(x => x.toplam >= a && x.toplam < b).length }));
    const gec = (n) => per.filter(x => x.son < gun(n)).length, k12 = per.filter(x => x.son >= gun(365)), k12g = k12.filter(x => x.ilk < gun(365));
    const toplam = q1('SELECT COUNT(*) n FROM bagiscilar').n, tutar = per.reduce((n, x) => n + x.toplam, 0);
    return [200, { toplam, bagisYapan: per.length, hic: toplam - per.length, tekrarOrani: per.length ? Math.round(per.filter(x => x.adet > 1).length / per.length * 1000) / 10 : 0, ortalamaToplam: per.length ? tutar / per.length : 0, ortalamaAdet: per.length ? per.reduce((n, x) => n + x.adet, 0) / per.length : 0, seri, bant, pasif: { g90: gec(90), g180: gec(180), g365: gec(365) }, enIyi: per.sort((a, b) => b.toplam - a.toplam).slice(0, 10).map(x => ({ id: x.id, ad: x.ad, toplam: x.toplam, adet: x.adet, son: x.son })), yeniSon30: per.filter(x => x.ilk >= gun(30)).length, bugun }];
  });

  R('GET', '/api/analiz/saha', 'rsaha', 'g', async () => {
    const org = q("SELECT t.org, COUNT(DISTINCT u.id) birim, SUM(CASE WHEN u.adim>=3 THEN 1 ELSE 0 END) tamam, COUNT(*) n FROM birimler_org u JOIN bagis_turleri t ON t.id=u.tur_id GROUP BY t.org");
    const adim = q("SELECT t.org, u.adim, COUNT(*) n FROM birimler_org u JOIN bagis_turleri t ON t.id=u.tur_id GROUP BY t.org, u.adim ORDER BY t.org, u.adim");
    const ulke = q("SELECT COALESCE(NULLIF(u.ulke,''),'Atanmamış') ulk, COUNT(DISTINCT u.id) birim, COUNT(p.id) pay, COALESCE(SUM(p.tutar),0) tutar FROM birimler_org u LEFT JOIN paylar p ON p.birim_id=u.id GROUP BY ulk ORDER BY pay DESC, birim DESC LIMIT 20").map(x => ({ ad: x.ulk, birim: x.birim, pay: x.pay, tutar: x.tutar }));
    const partner = q("SELECT COALESCE(NULLIF(u.partner,''),'Atanmamış') ptn, COUNT(*) birim FROM birimler_org u GROUP BY ptn ORDER BY birim DESC LIMIT 10").map(x => ({ ad: x.ptn, birim: x.birim }));
    return [200, { org, adim, ulke, partner, bekleyenUlke: q1("SELECT COUNT(*) n FROM birimler_org WHERE (ulke IS NULL OR ulke='')").n, toplamBirim: q1('SELECT COUNT(*) n FROM birimler_org').n, toplamPay: q1('SELECT COUNT(*) n FROM paylar').n }];
  });

  R('GET', '/api/analiz/iletisim', 'riletisim', 'g', async () => {
    const g30 = new Date(); g30.setDate(g30.getDate() - 29); const bas = iso(g30), tablo = (t) => !!q1("SELECT 1 x FROM sqlite_master WHERE type='table' AND name=?", t).x;
    const sms = tablo('sms_log') ? q("SELECT COALESCE(kanal,'SMS') kanal, COALESCE(durum,'Kayıtlı') durum, COUNT(*) n FROM sms_log WHERE date(zaman)>=? GROUP BY kanal, durum", bas) : [];
    const gunluk = tablo('sms_log') ? q("SELECT date(zaman) gun, COUNT(*) n FROM sms_log WHERE date(zaman)>=? GROUP BY gun ORDER BY gun", bas) : [];
    const toplu = tablo('toplu_gonderim') ? q("SELECT kanal, COUNT(*) gonderim FROM toplu_gonderim WHERE date(zaman)>=? GROUP BY kanal", bas) : [];
    const alici = tablo('toplu_alici') ? q("SELECT g.kanal, a.durum, COUNT(*) n FROM toplu_alici a JOIN toplu_gonderim g ON g.id=a.gid WHERE date(g.zaman)>=? GROUP BY g.kanal, a.durum", bas) : [];
    const cagri = tablo('cagri') ? q("SELECT yon, COALESCE(sonuc,'-') sonuc, COUNT(*) n FROM cagri WHERE date(zaman)>=? GROUP BY yon, sonuc ORDER BY n DESC", bas) : [];
    const wa = tablo('wa_mesaj') ? q1("SELECT SUM(yon='gelen') gelen, SUM(yon='giden') giden, SUM(yon='gelen' AND okundu=0) okunmamis FROM wa_mesaj WHERE date(zaman)>=?", bas) : {};
    const ret = q("SELECT izin FROM bagiscilar WHERE izin IS NOT NULL").reduce((o, x) => { try { const i = JSON.parse(x.izin); ['sms', 'mail', 'wa', 'ara'].forEach(k => { if (i[k] === 'ret') o[k] = (o[k] || 0) + 1; }); } catch (e) { /* bozuk kayıt */ } return o; }, {});
    return [200, { bas, sms, gunluk, toplu, alici, cagri, wa: { gelen: wa.gelen || 0, giden: wa.giden || 0, okunmamis: wa.okunmamis || 0 }, ret }];
  });
};
