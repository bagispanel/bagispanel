// Bildirimler: her sayfada görünen sayaçlar ve yeni olay (WhatsApp, gelen arama, iç mesaj, görev). Yetkiye göre süzülür:
// WhatsApp yalnızca "WhatsApp" menüsünü görebilenlere, arama yalnızca "Çağrı Merkezi" menüsünü görebilenlere; mesaj ve görev yalnızca ilgili kullanıcıya gider.
module.exports = function (ctx) {
  const { R, db, A } = ctx;
  const tablo = (t) => !!db.prepare("SELECT 1 x FROM sqlite_master WHERE type='table' AND name=?").get(t);
  const bugun = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const kisa = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  R('GET', '/api/bildirim', 'auth', null, async (c) => {
    const g = (m) => A.can(c.perms, m, 'g'), n1 = (s, ...a) => (db.prepare(s).get(...a) || {}), sayac = {}, son = {};
    if (g('twa') && tablo('wa_mesaj')) {
      sayac.twa = n1("SELECT COUNT(*) n FROM wa_mesaj WHERE yon='gelen' AND okundu=0").n;
      const m = n1("SELECT * FROM wa_mesaj WHERE yon='gelen' ORDER BY id DESC LIMIT 1"); if (m.id) son.wa = { id: m.id, baslik: 'WhatsApp: ' + (m.ad || m.tel), ozet: kisa(m.govde, 90), git: 'twa' };
    }
    if (g('cagri') && tablo('cagri')) {
      sayac.cagri = n1("SELECT COUNT(*) n FROM cagri WHERE yon='gelen' AND sonuc='Cevapsız' AND date(zaman)=?", bugun()).n;
      const m = n1("SELECT * FROM cagri WHERE yon='gelen' ORDER BY id DESC LIMIT 1"); if (m.id) son.cagri = { id: m.id, baslik: (m.sonuc === 'Cevapsız' ? 'Cevapsız arama: ' : 'Gelen arama: ') + (m.ad || m.tel || 'bilinmeyen'), ozet: m.ad && m.tel ? m.tel : '', git: 'cagri' };
    }
    sayac.mesaj = n1('SELECT COUNT(*) n FROM ic_mesaj WHERE alici_id=? AND okundu=0 AND a_sil=0', c.user.id).n;
    { const m = n1('SELECT m.*, u.ad gad FROM ic_mesaj m LEFT JOIN users u ON u.id=m.gonderen_id WHERE m.alici_id=? AND m.a_sil=0 ORDER BY m.id DESC LIMIT 1', c.user.id); if (m.id) son.mesaj = { id: m.id, baslik: 'Mesaj: ' + (m.gad || ''), ozet: kisa(m.konu, 90), git: 'mesaj' }; }
    sayac.gorevvade = n1("SELECT COUNT(*) n FROM gorev WHERE atanan_id=? AND durum<>'Tamamlandı' AND son_tarih IS NOT NULL AND son_tarih<=?", c.user.id, bugun()).n;
    sayac.gorev = n1("SELECT COUNT(*) n FROM gorev WHERE atanan_id=? AND durum<>'Tamamlandı'", c.user.id).n;
    { const m = n1('SELECT * FROM gorev WHERE atanan_id=? AND olusturan_id<>? ORDER BY id DESC LIMIT 1', c.user.id, c.user.id); if (m.id) son.gorev = { id: m.id, baslik: 'Yeni görev', ozet: kisa(m.baslik, 90), git: 'gorev' }; }
    if (g('bekleyen')) sayac.bekleyen = n1("SELECT COUNT(*) n FROM bagislar WHERE durum='Bekleyen'").n;
    if (g('bhar') && ctx.bankaBekleyen) sayac.bhar = ctx.bankaBekleyen();
    return [200, { sayac, son }];
  });
};
