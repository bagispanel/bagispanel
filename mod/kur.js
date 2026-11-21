// Döviz kurları: TCMB günlük kuru (döviz alış) günde birkaç kez otomatik çekilir; yönetici isterse elle belirler.
// Her bağış kendi anındaki TL karşılığını kayıtta saklar; kur sonradan değişse de eski kayıtlar değişmez.
module.exports = function (ctx) {
  const { R, Err, A, ip } = ctx, { getA, setA } = ctx.h;
  const RATE = ctx.RATE = ctx.RATE || { TL: 1, USD: 35, EUR: 38 };
  const uygula = () => { const k = getA('kur', {}); if (k.USD > 0) RATE.USD = k.USD; if (k.EUR > 0) RATE.EUR = k.EUR; };
  uygula();
  const durum = () => { const k = getA('kur', {}); return { USD: RATE.USD, EUR: RATE.EUR, tarih: k.tarih || '', kaynak: k.kaynak || 'Varsayılan (henüz güncellenmedi)', elle: !!k.elle, hata: k.hata || '', guncelleme: k.guncelleme || '' }; };
  const ayikla = (xml) => {
    const o = {};
    for (const kod of ['USD', 'EUR']) {
      const m = new RegExp('<Currency[^>]*CurrencyCode="' + kod + '"[^>]*>([\\s\\S]*?)</Currency>').exec(xml), a = m && /<ForexBuying>\s*([0-9.,]+)\s*<\/ForexBuying>/.exec(m[1]), v = a && parseFloat(a[1].replace(',', '.'));
      if (v > 0 && v < 10000) o[kod] = v;
    }
    const t = /<Tarih_Date[^>]*\sTarih="(\d\d)\.(\d\d)\.(\d{4})"/.exec(xml); o.tarih = t ? t[3] + '-' + t[2] + '-' + t[1] : '';
    return o;
  };
  async function cek(zorla) {
    const k = getA('kur', {}); if (k.elle && !zorla) return durum();
    try {
      const r = await fetch(process.env.TCMB_URL || 'https://www.tcmb.gov.tr/kurlar/today.xml', { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('Sunucu yanıtı ' + r.status);
      const o = ayikla(await r.text()); if (!o.USD || !o.EUR) throw new Error('Kur dosyasında USD/EUR bulunamadı');
      setA('kur', { USD: o.USD, EUR: o.EUR, tarih: o.tarih, kaynak: 'TCMB (döviz alış)', elle: false, hata: '', guncelleme: new Date().toISOString() }); uygula();
    } catch (e) { setA('kur', { ...getA('kur', {}), hata: 'Kur çekilemedi: ' + String(e.message).slice(0, 120) }); }
    return durum();
  }
  R('GET', '/api/kur', null, null, async () => [200, durum()]);
  R('PUT', '/api/kur', 'kurumb', 'd', async (c) => {
    const b = c.body || {};
    if (b.otomatik) { setA('kur', { ...getA('kur', {}), elle: false }); A.audit(c.user, 'kur_otomatik', '', ip(c.req)); return [200, await cek(true)]; }
    const usd = +b.USD, eur = +b.EUR; if (!(usd > 0 && usd < 10000 && eur > 0 && eur < 10000)) throw new Err(400, 'USD ve EUR kurunu (1 birim = kaç TL) girin.');
    setA('kur', { USD: usd, EUR: eur, tarih: new Date().toISOString().slice(0, 10), kaynak: 'Elle (' + c.user.kadi + ')', elle: true, hata: '', guncelleme: new Date().toISOString() }); uygula();
    A.audit(c.user, 'kur_elle', 'USD ' + usd + ' EUR ' + eur, ip(c.req)); return [200, durum()];
  });
  R('POST', '/api/kur/yenile', 'kurumb', 'd', async (c) => {
    if (getA('kur', {}).elle) throw new Err(409, 'Kur elle belirlenmiş; önce “Otomatiğe dön” deyin.');
    const d = await cek(false); if (d.hata) throw new Err(502, d.hata); return [200, d];
  });
  if (process.env.KUR_OTO !== '0') { setTimeout(() => cek(false), 5000).unref(); setInterval(() => cek(false), 6 * 3600e3).unref(); }
};
