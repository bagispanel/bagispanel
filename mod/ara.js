// Ana sayfa genel arama: bağışçı, bağış no, gönüllü, öğrenci/sponsorluk, kalıcı eser, banka hareketi. Yetkiye göre sonuç verir.
// Telefon: boşluk, 0, +90, tire fark etmez ("0532 123", "+90 532", "532123" aynı sonucu verir).
module.exports = function (ctx) {
  const { R, db, A } = ctx;
  const nmz = (t) => String(t || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const fmt = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length === 12 && d.startsWith('90') ? `+90 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}` : t || ''; };
  const rank = (ad, q) => { const a = nmz(ad); return a.startsWith(q) ? 0 : a.split(' ').some(w => w.startsWith(q.split(' ')[0])) ? 1 : 2; };
  R('GET', '/api/ara', 'auth', null, async (c) => {
    const q0 = String(new URL(c.req.url, 'http://x').searchParams.get('q') || '').trim().slice(0, 60); if (q0.length < 2) return [200, []];
    const can = (m) => A.can(c.perms, m, 'g'), q = nmz(q0), tk = q.split(' ').filter(Boolean), telli = /^[\d\s+\-()]+$/.test(q0);
    let d = q0.replace(/\D/g, ''); if (d.length >= 11 && d.startsWith('90')) d = d.slice(2); d = d.replace(/^0+/, '');
    const adUyar = (s) => { const n = nmz(s); return tk.length && tk.every(t => n.includes(t)); }, telUyar = (t) => telli && d.length >= 3 && String(t || '').replace(/\D/g, '').includes(d);
    const out = [], ekle = (a) => out.push(a);
    if (can('bagisci')) { const L = db.prepare('SELECT b.id,b.ad,b.tel,b.eposta,(SELECT COALESCE(SUM(tl),0) FROM bagislar g WHERE g.bagisci_id=b.id AND g.durum=\'Onaylı\') t FROM bagiscilar b').all().filter(b => (!telli && adUyar(b.ad)) || telUyar(b.tel) || (!telli && b.eposta && nmz(b.eposta).includes(q))).sort((a, b) => rank(a.ad, q) - rank(b.ad, q) || b.t - a.t).slice(0, 6); L.forEach(b => ekle({ tip: 'bagisci', grup: 'Bağışçı', id: b.id, baslik: b.ad, alt: fmt(b.tel) + (b.t ? ' · ' + Math.round(b.t).toLocaleString('tr-TR') + ' ₺ toplam bağış' : '') })); }
    if ((can('rapor') || can('bekleyen') || can('bagisci')) && /^b?g?-?\d{0,4}-?\d{2,}/i.test(q0) && !telli || /^bg/i.test(q0)) { const k = q0.toUpperCase().replace(/\s/g, ''); db.prepare("SELECT g.id,g.no,g.tl,g.tarih,g.bagisci_id,b.ad,g.durum FROM bagislar g JOIN bagiscilar b ON b.id=g.bagisci_id WHERE g.no LIKE ? ORDER BY g.id DESC LIMIT 5").all('%' + k + '%').forEach(g => ekle({ tip: 'bagis', grup: 'Bağış', id: g.bagisci_id, baslik: g.no + ' · ' + g.ad, alt: Math.round(g.tl).toLocaleString('tr-TR') + ' ₺ · ' + g.tarih.split('-').reverse().join('.') + ' · ' + g.durum })); }
    if (can('gonullu')) db.prepare('SELECT id,ad,tel,il,durum FROM gonulluler').all().filter(g => (!telli && adUyar(g.ad)) || telUyar(g.tel)).slice(0, 5).forEach(g => ekle({ tip: 'gonullu', grup: 'Gönüllü', id: g.id, baslik: g.ad, alt: fmt(g.tel) + (g.il ? ' · ' + g.il : '') + ' · ' + g.durum }));
    if (can('spogr') || can('sptak')) db.prepare('SELECT id,ad,ulke,yetim,hafiz,durum FROM sp_ogrenci').all().filter(o => !telli && adUyar(o.ad)).slice(0, 5).forEach(o => ekle({ tip: 'ogrenci', grup: 'Öğrenci / yetim', id: o.id, baslik: o.ad, alt: [o.yetim ? 'Yetim' : '', o.hafiz ? 'Hafız' : '', o.ulke, o.durum].filter(Boolean).join(' · ') }));
    if (can('sptak')) { const kod = /^sp\s*-?\s*0*(\d+)$/i.exec(q0); ctx.sponsor && db.prepare('SELECT * FROM sp_sponsorluk').all().map(ctx.sponsor.sRow).filter(s => (kod && s.id === +kod[1]) || (!telli && (adUyar(s.sponsor) || adUyar(s.ogrenci)))).slice(0, 5).forEach(s => ekle({ tip: 'sponsorluk', grup: 'Sponsorluk', id: s.id, baslik: `${s.kod} · ${s.sponsor} → ${s.ogrenci}`, alt: s.odeme_durum + (s.gecikme_ay ? ' · ' + s.gecikme_ay + ' ay gecikme' : '') })); }
    if (can('eser')) db.prepare('SELECT id,ad,tur,ulke FROM eser').all().filter(e => !telli && adUyar(e.ad)).slice(0, 4).forEach(e => ekle({ tip: 'eser', grup: 'Kalıcı eser', id: e.id, baslik: e.ad, alt: [e.tur, e.ulke].filter(Boolean).join(' · ') }));
    if (can('bhar') && !telli) db.prepare("SELECT id,gonderen,aciklama,tutar,tarih FROM banka_hareket WHERE durum='Bekliyor'").all().filter(h => adUyar(h.gonderen + ' ' + h.aciklama)).slice(0, 4).forEach(h => ekle({ tip: 'banka', grup: 'Banka hareketi', id: h.id, baslik: (h.gonderen || h.aciklama || '').slice(0, 60), alt: Math.round(h.tutar).toLocaleString('tr-TR') + ' ₺ · ' + h.tarih.split('-').reverse().join('.') + ' · eşleştirme bekliyor' }));
    return [200, out.slice(0, 20)];
  });
};
