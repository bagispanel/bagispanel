// Sertifika sayfası: tek tasarım; içinde bağışçı/sponsor adı ve proje adı yazar, tutar yazmaz.
// /sertifika/<kod> : bağış sertifikası (onaylı bağış). /sertifika/<sponsor jetonu>?k=belge|tamam : sponsorluk belgesi / tamamlama sertifikası.
module.exports = function (ctx) {
  const { db } = ctx, { getA } = ctx.h;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Tür adlarında fiyat/biçim ekleri olabilir ("Nijer - Tulumba · Tam fiyat (12.000 ₺)"): sertifikada tutar görünmesin, yalnız proje adı kalsın
  const projeAdi = (ad) => { let s = String(ad || '').replace(/\s*\([^)]*(?:₺|TL|\$|€|\d)[^)]*\)/g, '').replace(/\s*·\s*(Tam fiyat|Hisseli|Katılım|Fon)\b.*$/i, '').replace(/\s+/g, ' ').trim(); return s || 'Bağış'; };
  const tarihTR = (t) => { const d = new Date(String(t || '').slice(0, 10) + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }); };

  function veriBul(kod, k) {
    const g = db.prepare("SELECT g.durum, g.tarih, g.no, g.kendi, g.adina_ad, b.ad ad, t.ad tur FROM bagislar g JOIN bagiscilar b ON b.id=g.bagisci_id JOIN bagis_turleri t ON t.id=g.tur_id WHERE g.sert_kod=?").get(kod);
    if (g) return g.durum === 'Onaylı' ? { baslik: 'Bağış Sertifikası', ad: g.ad, adina: !g.kendi && g.adina_ad ? g.adina_ad : '', proje: projeAdi(g.tur), metin: 'projesine verdiği değerli destek için teşekkür eder, bağışlarını Allah katında kabul eylemesini dileriz.', tarih: g.tarih, no: g.no } : { bekle: 1 };
    const s = db.prepare('SELECT s.token, s.baslangic, b.ad sponsor, o.ad ogr, o.hafiz, o.durum, o.tamam_tur, o.tamam_tarih FROM sp_sponsorluk s JOIN bagiscilar b ON b.id=s.bagisci_id JOIN sp_ogrenci o ON o.id=s.ogrenci_id WHERE s.token=?').get(kod);
    if (!s) return null;
    if (k === 'tamam' && s.durum === 'Tamamladı') { const h = s.tamam_tur === 'Hafızlığı'; return { baslik: 'Tamamlama Sertifikası', ad: s.sponsor, proje: (h ? 'Hafızlık' : 'Eğitim') + ' Sponsorluğu', metin: `kapsamında desteklediği ${s.ogr} adlı öğrencimizin ${h ? 'hafızlığını' : 'eğitimini'} tamamlamasına vesile olduğu için teşekkür eder, hayırlarının devamını dileriz.`, tarih: s.tamam_tarih, no: '' }; }
    return { baslik: 'Sponsorluk Belgesi', ad: s.sponsor, proje: (s.hafiz ? 'Hafızlık' : 'Eğitim') + ' Sponsorluğu', metin: `kapsamında ${s.ogr} adlı öğrencimizin ${s.hafiz ? 'hafızlık' : 'eğitim'} sürecine sponsor olarak verdiği destek için teşekkür ederiz.`, tarih: s.baslangic, no: '' };
  }

  const CSS = `*{box-sizing:border-box}body{margin:0;background:#e9eef0;font-family:Georgia,"Times New Roman",serif;color:#1c2630;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 12px}
.sf{width:min(1000px,100%);aspect-ratio:1.414;background:#fffdf7;border:2px solid #c9a227;outline:8px double #0e5566;outline-offset:-22px;padding:5% 8%;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.15)}
.sf img{max-height:70px;margin-bottom:8px}.sf .d{letter-spacing:.14em;text-transform:uppercase;font-size:clamp(11px,1.5vw,15px);color:#0e5566;font-weight:700}
.sf h1{font-size:clamp(24px,4.4vw,46px);color:#0e5566;margin:.4em 0 .2em;letter-spacing:.04em}.sf .s{font-size:clamp(13px,1.7vw,18px);color:#5c6b77}
.sf .n{font-size:clamp(26px,5vw,52px);font-style:italic;margin:.25em 0;border-bottom:2px solid #c9a227;padding:0 .6em .1em}.sf .a{font-size:clamp(13px,1.8vw,19px);color:#5c6b77;margin:0 0 .4em}
.sf .p{font-size:clamp(17px,2.6vw,28px);font-weight:700;color:#0e5566;margin:.3em 0 .1em}.sf .m{font-size:clamp(13px,1.8vw,19px);max-width:720px;line-height:1.55;margin:0}
.sf .mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%}.sf .o{color:#c9a227;letter-spacing:.5em;font-size:clamp(12px,1.6vw,18px);margin:.5em 0}.sf .f{display:flex;justify-content:space-between;width:100%;padding-top:2%;border-top:1px solid #e3d9b3;font-size:clamp(11px,1.4vw,15px);color:#5c6b77}
.bt{margin:18px 0;background:#0e5566;color:#fff;border:0;border-radius:99px;padding:12px 26px;font:700 16px system-ui,sans-serif;cursor:pointer}
@page{size:A4 landscape;margin:0}@media print{body{background:#fff;padding:0;display:block}.sf{width:100%;height:100vh;box-shadow:none;aspect-ratio:auto}.bt{display:none}}`;

  ctx.sertServe = async (req, res, url) => {
    const kod = decodeURIComponent(url.pathname.slice('/sertifika/'.length)).replace(/\/+$/, ''), basliklar = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src data: https: 'self'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' };
    const kurum = getA('kurumb', {}), dernek = kurum.ad || getA('dernek_adi', '');
    const yok = (kodu, m) => { res.writeHead(kodu, basliklar); res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sertifika</title><style>${CSS}</style><body><p style="font-family:system-ui;margin-top:80px">${esc(m)}</p></body>`); };
    const v = /^[A-Za-z0-9_-]{8,64}$/.test(kod) ? veriBul(kod, url.searchParams.get('k')) : null;
    if (!v) return yok(404, 'Sertifika bulunamadı. Bağlantıyı kontrol edin.');
    if (v.bekle) return yok(404, 'Bu sertifika, bağış onaylandıktan sonra hazır olur.');
    res.writeHead(200, basliklar);
    res.end(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(v.baslik)} · ${esc(v.ad)}</title><style>${CSS}</style></head><body>
<div class="sf"><div>${kurum.logo && /^data:image\//.test(kurum.logo) ? `<img src="${esc(kurum.logo)}" alt="">` : ''}<div class="d">${esc(dernek)}</div></div><div class="mid"><h1>${esc(v.baslik)}</h1><div class="s">Sayın</div><div class="n">${esc(v.ad)}</div>${v.adina ? `<p class="a">${esc(v.adina)} adına</p>` : ''}<div class="p">${esc(v.proje)}</div><div class="o">✦ ✦ ✦</div><p class="m">${esc(v.metin)}</p></div><div class="f"><span>${esc(tarihTR(v.tarih))}</span><span>${v.no ? 'Belge no: ' + esc(v.no) : ''}</span></div></div>
<button class="bt" data-p>Yazdır / PDF olarak kaydet</button><script src="/sertifika.js"></script></body></html>`);
  };
};
