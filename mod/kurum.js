// Kurum bilgileri: giriş ekranında ve belgelerde görünen dernek/vakıf kimliği (ad, logo, iletişim). Giriş ekranı için herkese açık özet uç vardır.
module.exports = function (ctx) {
  const { R, Err, A, str, ip } = ctx, { getA, setA } = ctx.h;
  const ozet = () => { const k = getA('kurumb', {}); return { ad: k.ad || '', kisa: k.kisa || '', slogan: k.slogan || '', logo: k.logo || '', tel: k.tel || '', eposta: k.eposta || '', adres: k.adres || '', web: k.web || '' }; };
  R('GET', '/api/kurum', null, null, async () => [200, ozet()]); // giriş ekranı: yalnızca kamuya açık bilgiler
  R('GET', '/api/kurum/bilgi', 'kurumb', 'g', async () => [200, ozet()]);
  R('PUT', '/api/kurum/bilgi', 'kurumb', 'd', async (c) => {
    const b = c.body || {}, eski = ozet();
    let logo = eski.logo;
    if (b.logo_sil) logo = '';
    else if (b.logo) {
      if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(String(b.logo))) throw new Err(400, 'Logo PNG, JPEG veya WebP olmalı.');
      if (String(b.logo).length > 450000) throw new Err(400, 'Logo çok büyük (en fazla ~330 KB).');
      logo = String(b.logo);
    }
    if (!str(b.ad, 160)) throw new Err(400, 'Kurum adı zorunlu.');
    const web = str(b.web, 120), eposta = str(b.eposta, 120);
    if (eposta && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eposta)) throw new Err(400, 'E-posta geçersiz.');
    if (web && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(web)) throw new Err(400, 'Web adresi geçersiz.');
    setA('kurumb', { ...getA('kurumb', {}), ad: str(b.ad, 160), kisa: str(b.kisa, 40), slogan: str(b.slogan, 140), logo, tel: str(b.tel, 40), eposta, adres: str(b.adres, 240), web });
    setA('dernek_adi', str(b.kisa, 40) || str(b.ad, 160)); // SMS şablonlarındaki {dernek} alanı kurum bilgisinden beslenir
    A.audit(c.user, 'kurum_bilgi', str(b.ad, 160), ip(c.req)); return [200, { ok: 1 }];
  });
};
