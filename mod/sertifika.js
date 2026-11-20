// Sertifika sayfası: 3 hazır tasarım (klasik/modern/zarif), bağış türü başına seçilir;  içinde bağışçı/sponsor adı ve proje adı yazar, tutar yazmaz.
// /sertifika/<kod> : bağış sertifikası (onaylı bağış). /sertifika/<sponsor jetonu>?k=belge|tamam : sponsorluk belgesi / tamamlama sertifikası.
module.exports = function (ctx) {
  const { db, R, Err, A, str, ip } = ctx, { getA, setA } = ctx.h;
  try { db.exec("ALTER TABLE bagis_turleri ADD COLUMN sert_tasarim TEXT NOT NULL DEFAULT ''"); } catch { /* var */ }
  const TAS = { klasik: 'Klasik', modern: 'Modern', zarif: 'Zarif' };
  const kurumRenk = () => { const r = (getA('kurumb', {}) || {}).renk; return /^#[0-9a-fA-F]{6}$/.test(r || '') ? r : ''; };
  const RENK = { lacivert: ['Lacivert ve altın', '#0e5566', '#c9a227'], yesil: ['Yeşil ve altın', '#1f6b45', '#c9a227'], bordo: ['Bordo ve bakır', '#7a1f2b', '#b8923a'], gri: ['Antrasit ve bakır', '#2b3a4a', '#a8896a'] };
  const VARS = { baslik: 'Bağış Sertifikası', metin: 'projesine verdiği değerli destek için teşekkür eder, bağışlarını Allah katında kabul eylemesini dileriz.', imza_ad: '', imza_unvan: '', imza_gorsel: '', renk: 'kurum', sponsor_tasarim: 'klasik' };
  const ayar = () => ({ ...VARS, ...getA('sertset', {}) });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Tür adlarında fiyat/biçim ekleri olabilir ("Nijer - Tulumba · Tam fiyat (12.000 ₺)"): sertifikada tutar görünmesin, yalnız proje adı kalsın
  const projeAdi = (ad) => { let s = String(ad || '').replace(/\s*\([^)]*(?:₺|TL|\$|€|\d)[^)]*\)/g, '').replace(/\s*·\s*(Tam fiyat|Hisseli|Katılım|Fon)\b.*$/i, '').replace(/\s+/g, ' ').trim(); return s || 'Bağış'; };
  const tarihTR = (t) => { const d = new Date(String(t || '').slice(0, 10) + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }); };

  function veriBul(kod, k) {
    const g = db.prepare("SELECT g.durum, g.tarih, g.no, g.kendi, g.adina_ad, b.ad ad, t.ad tur, t.sert_tasarim tas FROM bagislar g JOIN bagiscilar b ON b.id=g.bagisci_id JOIN bagis_turleri t ON t.id=g.tur_id WHERE g.sert_kod=?").get(kod);
    if (g) return g.durum === 'Onaylı' ? { baslik: ayar().baslik, ad: g.ad, adina: !g.kendi && g.adina_ad ? g.adina_ad : '', proje: projeAdi(g.tur), metin: ayar().metin, tarih: g.tarih, no: g.no, tasarim: TAS[g.tas] ? g.tas : 'klasik' } : { bekle: 1 };
    const s = db.prepare('SELECT s.token, s.baslangic, b.ad sponsor, o.ad ogr, o.hafiz, o.durum, o.tamam_tur, o.tamam_tarih FROM sp_sponsorluk s JOIN bagiscilar b ON b.id=s.bagisci_id JOIN sp_ogrenci o ON o.id=s.ogrenci_id WHERE s.token=?').get(kod);
    if (!s) return null;
    const sp = TAS[ayar().sponsor_tasarim] ? ayar().sponsor_tasarim : 'klasik';
    if (k === 'tamam' && s.durum === 'Tamamladı') { const h = s.tamam_tur === 'Hafızlığı'; return { baslik: 'Tamamlama Sertifikası', ad: s.sponsor, proje: (h ? 'Hafızlık' : 'Eğitim') + ' Sponsorluğu', metin: `kapsamında desteklediği ${s.ogr} adlı öğrencimizin ${h ? 'hafızlığını' : 'eğitimini'} tamamlamasına vesile olduğu için teşekkür eder, hayırlarının devamını dileriz.`, tarih: s.tamam_tarih, no: '', tasarim: sp }; }
    return { baslik: 'Sponsorluk Belgesi', ad: s.sponsor, proje: (s.hafiz ? 'Hafızlık' : 'Eğitim') + ' Sponsorluğu', metin: `kapsamında ${s.ogr} adlı öğrencimizin ${s.hafiz ? 'hafızlık' : 'eğitim'} sürecine sponsor olarak verdiği destek için teşekkür ederiz.`, tarih: s.baslangic, no: '', tasarim: sp };
  }

  const CSS = `*{box-sizing:border-box}body{margin:0;background:#e9eef0;font-family:Georgia,"Times New Roman",serif;color:#1c2630;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 12px}
.sf{width:min(1000px,100%);aspect-ratio:1.414;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.15);position:relative;overflow:hidden}
.sf img.lg{max-height:70px;margin-bottom:8px}.sf .d{letter-spacing:.14em;text-transform:uppercase;font-size:clamp(11px,1.5vw,15px);color:var(--p);font-weight:700}
.sf h1{font-size:clamp(24px,4.4vw,46px);color:var(--p);margin:.4em 0 .2em;letter-spacing:.04em}.sf .s{font-size:clamp(13px,1.7vw,18px);color:#5c6b77}
.sf .n{font-size:clamp(26px,5vw,52px);font-style:italic;margin:.25em 0;border-bottom:2px solid var(--a);padding:0 .6em .1em}.sf .a{font-size:clamp(13px,1.8vw,19px);color:#5c6b77;margin:0 0 .4em}
.sf .p{font-size:clamp(17px,2.6vw,28px);font-weight:700;color:var(--p);margin:.3em 0 .1em}.sf .m{font-size:clamp(13px,1.8vw,19px);max-width:720px;line-height:1.55;margin:0}
.sf .mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%}.sf .o{color:var(--a);letter-spacing:.5em;font-size:clamp(12px,1.6vw,18px);margin:.5em 0}
.sf .f{display:flex;justify-content:space-between;align-items:flex-end;width:100%;padding-top:2%;border-top:1px solid #e3d9b3;font-size:clamp(11px,1.4vw,15px);color:#5c6b77}
.sf .im{text-align:center;min-width:150px}.sf .im img{max-height:54px;display:block;margin:0 auto -6px}.sf .im .l{border-top:1px solid #8a97a2;padding-top:4px;font-size:.95em}.sf .im b{display:block;color:#1c2630}
.t-klasik{background:#fffdf7;border:2px solid var(--a);outline:8px double var(--p);outline-offset:-22px;padding:5% 8%}
.t-modern{background:#fff;padding:5% 8% 5% 12%;text-align:left;align-items:flex-start;font-family:system-ui,"Segoe UI",Arial,sans-serif}
.t-modern:before{content:"";position:absolute;left:0;top:0;bottom:0;width:5%;background:var(--p)}.t-modern:after{content:"";position:absolute;left:5%;top:0;bottom:0;width:.8%;background:var(--a)}
.t-modern .mid{align-items:flex-start}.t-modern h1{font-size:clamp(20px,3.4vw,36px);text-transform:uppercase;letter-spacing:.18em}.t-modern .n{font-style:normal;font-weight:800;border-bottom:0;padding:0;font-size:clamp(28px,5.4vw,58px);color:#1c2630}
.t-modern .o{display:none}.t-modern .m{max-width:640px}.t-modern .f{border-top:2px solid var(--a)}
.t-zarif{background:#fbf6ea;padding:6% 9%;border:1px solid var(--a);box-shadow:inset 0 0 0 10px #fbf6ea,inset 0 0 0 11px var(--a),0 10px 40px rgba(0,0,0,.15)}
.t-zarif:before,.t-zarif:after{content:"❦";position:absolute;color:var(--a);font-size:clamp(20px,3vw,34px);top:5%}.t-zarif:before{left:5%}.t-zarif:after{right:5%}
.t-zarif h1{font-weight:400;font-style:italic;font-size:clamp(26px,4.8vw,50px)}.t-zarif .n{border-bottom:1px solid var(--a);font-weight:400}.t-zarif .f{border-top:0}
.bt{margin:18px 0;background:#0e5566;color:#fff;border:0;border-radius:99px;padding:12px 26px;font:700 16px system-ui,sans-serif;cursor:pointer}
@page{size:A4 landscape;margin:0}@media print{body{background:#fff;padding:0;display:block}.sf{width:100%;height:100vh;box-shadow:none;aspect-ratio:auto}.bt{display:none}}`;
  const gor = (x) => (typeof x === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(x)) ? x : '';
  const sayfaHtml = (v, kurum, dernek, a, tas, onizle) => {
    const r = a.renk === 'kurum' && kurumRenk() ? ['Kurum rengi', kurumRenk(), '#c9a227'] : (RENK[a.renk] || RENK.lacivert), ig = gor(a.imza_gorsel), lg = gor(kurum.logo);
    return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(v.baslik)} · ${esc(v.ad)}</title><style>${CSS}</style></head><body${onizle ? ' style="padding:0;background:transparent"' : ''}>
<div class="sf t-${TAS[tas] ? tas : 'klasik'}" style="--p:${r[1]};--a:${r[2]}"><div>${lg ? `<img class="lg" src="${esc(lg)}" alt="">` : ''}<div class="d">${esc(dernek)}</div></div><div class="mid"><h1>${esc(v.baslik)}</h1><div class="s">Sayın</div><div class="n">${esc(v.ad)}</div>${v.adina ? `<p class="a">${esc(v.adina)} adına</p>` : ''}<div class="p">${esc(v.proje)}</div><div class="o">✦ ✦ ✦</div><p class="m">${esc(v.metin)}</p></div><div class="f"><span>${esc(tarihTR(v.tarih))}${v.no ? '<br>Belge no: ' + esc(v.no) : ''}</span>${a.imza_ad || ig ? `<div class="im">${ig ? `<img src="${esc(ig)}" alt="">` : ''}<div class="l"><b>${esc(a.imza_ad)}</b>${esc(a.imza_unvan)}</div></div>` : '<span></span>'}</div></div>
${onizle ? '' : '<button class="bt" data-p>Yazdır / PDF olarak kaydet</button><script src="/sertifika.js"></script>'}</body></html>`;
  };

  ctx.sertServe = async (req, res, url) => {
    const kod = decodeURIComponent(url.pathname.slice('/sertifika/'.length)).replace(/\/+$/, ''), basliklar = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src data: https: 'self'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' };
    const kurum = getA('kurumb', {}), dernek = kurum.ad || getA('dernek_adi', ''), a = ayar();
    const yok = (kodu, m) => { res.writeHead(kodu, basliklar); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sertifika</title><style>${CSS}</style><body><p style="font-family:system-ui;margin-top:80px">${esc(m)}</p></body>`); };
    if (kod === 'onizleme') { // yalnız giriş yapmış kullanıcı; kaydedilmiş ayarlar + seçilen tasarım/renk
      if (!A.sessionUser(ctx.cookies(req).bp)) return yok(404, 'Sertifika bulunamadı.');
      const t = url.searchParams.get('t'), r = url.searchParams.get('r'), pa = { ...a, renk: RENK[r] || (r === 'kurum' && kurumRenk()) ? r : a.renk };
      res.writeHead(200, { ...basliklar, 'Content-Security-Policy': basliklar['Content-Security-Policy'].replace("frame-ancestors 'none'", "frame-ancestors 'self'") });
      return res.end(sayfaHtml({ baslik: a.baslik, ad: 'Ayşe Yılmaz', adina: '', proje: 'Su Kuyusu Projesi', metin: a.metin, tarih: new Date().toISOString().slice(0, 10), no: '' }, kurum, dernek, pa, t, true));
    }
    const v = /^[A-Za-z0-9_-]{8,64}$/.test(kod) ? veriBul(kod, url.searchParams.get('k')) : null;
    if (!v) return yok(404, 'Sertifika bulunamadı. Bağlantıyı kontrol edin.');
    if (v.bekle) return yok(404, 'Bu sertifika, bağış onaylandıktan sonra hazır olur.');
    res.writeHead(200, basliklar); res.end(sayfaHtml(v, kurum, dernek, a, v.tasarim, false));
  };

  R('GET', '/api/sertifika/ayar', 'sertset', 'g', async () => [200, { ayar: ayar(), tasarimlar: TAS, renkler: Object.fromEntries([...(kurumRenk() ? [['kurum', { ad: 'Kurum rengi', p: kurumRenk(), a: '#c9a227' }]] : []), ...Object.entries(RENK).map(([k, v]) => [k, { ad: v[0], p: v[1], a: v[2] }])]), varsayilan: { baslik: VARS.baslik, metin: VARS.metin }, kurum_ad: (getA('kurumb', {}).ad || getA('dernek_adi', '')), kullanan: db.prepare("SELECT sert_tasarim t, COUNT(*) n FROM bagis_turleri WHERE sertifika=1 GROUP BY sert_tasarim").all() }]);
  R('PUT', '/api/sertifika/ayar', 'sertset', 'e', async (c) => {
    const b = c.body, o = ayar();
    const baslik = str(b.baslik, 60) || VARS.baslik, metin = str(b.metin, 300) || VARS.metin;
    if (!RENK[b.renk] && !(b.renk === 'kurum' && kurumRenk())) throw new Err(400, 'Renk seçin.'); if (!TAS[b.sponsor_tasarim]) throw new Err(400, 'Sponsor sertifikası tasarımını seçin.');
    let ig = o.imza_gorsel; if (b.imza_sil) ig = ''; else if (b.imza_gorsel) { if (!gor(b.imza_gorsel) || b.imza_gorsel.length > 400000) throw new Err(400, 'İmza görseli PNG/JPEG olmalı ve küçük boyutlu olmalı.'); ig = b.imza_gorsel; }
    setA('sertset', { baslik, metin, imza_ad: str(b.imza_ad, 80), imza_unvan: str(b.imza_unvan, 80), imza_gorsel: ig, renk: b.renk, sponsor_tasarim: b.sponsor_tasarim });
    A.audit(c.user, 'sertifika_ayar', '', ip(c.req)); return [200, { ok: 1 }];
  });
  // Bağış türünde sertifika: '' = yok; tasarım adı = o tasarımla gider
  R('PUT', '/api/turler/([0-9]+)/sertifika', 'turler', 'd', async (c) => {
    const id = +c.m[1], t = String(c.body.tasarim || ''); if (t && !TAS[t]) throw new Err(400, 'Tasarım seçin.');
    if (!db.prepare('SELECT 1 FROM bagis_turleri WHERE id=?').get(id)) throw new Err(404, 'Tür bulunamadı.');
    db.prepare('UPDATE bagis_turleri SET sertifika=?, sert_tasarim=? WHERE id=?').run(t ? 1 : 0, t, id); return [200, { ok: 1 }];
  });
};
