// Web sitesi: panelden yönetilen herkese açık site (4 tema), bağış formları, sayfalar, menü, tasarım ve alan adı.
// Site /site adresinde yayınlanır; "alan adı" tanımlıysa o adresten kök olarak da açılır. Sayfa sunucuda üretilir (JS kapalıyken de okunur).
module.exports = function (ctx) {
  const { R, Err, A, db, str, ip } = ctx, { getA, setA } = ctx.h;
  const TEMALAR = { klasik: 'Klasik', sicak: 'Sıcak', modern: 'Modern', uygulama: 'Uygulama' };
  const TV = { // her temanın varsayılan renk ve karakteri
    klasik: { pri: '#12355b', acc: '#c9a227', bg: '#ffffff', alt: '#f4f6f9', r: '8px', f: 'Georgia,"Times New Roman",serif' },
    sicak: { pri: '#8a4b2a', acc: '#e08a1e', bg: '#fbf5ec', alt: '#f3e8d6', r: '22px', f: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif' },
    modern: { pri: '#0e1a26', acc: '#12b886', bg: '#ffffff', alt: '#eef2f5', r: '4px', f: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif' },
    uygulama: { pri: '#1b7f58', acc: '#f08a24', bg: '#f3f7f5', alt: '#e4efe9', r: '18px', f: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif' }
  };
  const DEF = {
    acik: 0, tema: 'klasik', renk: { pri: '', acc: '' }, alan_adi: '',
    hero: { baslik: 'İyiliğe ortak olun', alt: 'Bağışlarınız şeffaf biçimde ihtiyaç sahiplerine ulaşır. Kesim, dağıtım ve açılış görüntülerini sizinle paylaşırız.', dugme: 'Bağış Yap', gorsel: '' },
    menu: [{ ad: 'Ana Sayfa', h: '' }, { ad: 'Hakkımızda', h: 'hakkimizda' }, { ad: 'Faaliyetler', h: 'faaliyetler' }, { ad: 'İletişim', h: 'iletisim' }],
    sayfalar: [
      { slug: 'hakkimizda', baslik: 'Hakkımızda', gorunur: 1, icerik: 'Derneğimizin tanıtımını buraya yazın.\n\n# Misyonumuz\nİhtiyaç sahiplerine ulaşmak ve bağışçılarımıza her adımda şeffaf bilgi vermek.' },
      { slug: 'faaliyetler', baslik: 'Faaliyetlerimiz', gorunur: 1, icerik: 'Yürüttüğümüz projeleri ve çalışmalarımızı buraya yazın.' },
      { slug: 'iletisim', baslik: 'İletişim', gorunur: 1, icerik: 'Bize ulaşmak için aşağıdaki bilgileri kullanabilirsiniz.' }
    ],
    form: { baslik: 'Hızlı bağış', turler: [], tutarlar: [100, 250, 500, 1000], aylik: 1, vekalet: 1 },
    goster: { sayac: 1, proje: 1, kategori: 1, hesap: 1 },
    alt: { izin: '', sosyal: { facebook: '', instagram: '', youtube: '', x: '' } }
  };
  const cfg = () => { const a = getA('site', {}); return { ...DEF, ...a, hero: { ...DEF.hero, ...(a.hero || {}) }, renk: { ...DEF.renk, ...(a.renk || {}) }, form: { ...DEF.form, ...(a.form || {}) }, goster: { ...DEF.goster, ...(a.goster || {}) }, alt: { ...DEF.alt, ...(a.alt || {}), sosyal: { ...DEF.alt.sosyal, ...((a.alt || {}).sosyal || {}) } } }; };
  const kaydet = (fn) => { const a = cfg(); fn(a); setA('site', a); return a; };
  const turListe = () => db.prepare("SELECT id,kat,ad,org,fiyat,tam,kuyu FROM bagis_turleri WHERE web=1 AND tam=0 AND org<>'Diğer' ORDER BY kat,ad").all().map(t => { const k = t.kuyu ? JSON.parse(t.kuyu) : null; return { id: t.id, kat: t.kat, ad: t.ad, org: t.org, fiyat: t.fiyat || 0, fon: !!(k && k.bicim === 'Fon') }; });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TLF = (n) => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  const slugOk = (s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 40 && !['bagis', 'img', 'site'].includes(s);
  const hostOf = (s) => String(s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  const hexOk = (s) => /^#[0-9a-fA-F]{6}$/.test(String(s || ''));

  // ---------------- panel API ----------------
  const ANAHTAR = 'sset|spage|smenu|sform';
  R('GET', '/api/site', ANAHTAR, 'g', async () => { const a = cfg(); return [200, { ayar: { ...a, hero: { ...a.hero, gorsel: a.hero.gorsel ? 1 : 0 } }, temalar: TEMALAR, varsayilan: TV, turler: turListe(), kategoriler: [...new Set(turListe().map(t => t.kat))] }]; });
  R('PUT', '/api/site/tasarim', 'sset', 'e', async (c) => {
    const b = c.body || {};
    const a = kaydet(a => {
      if (b.tema !== undefined) { if (!TEMALAR[b.tema]) throw new Err(400, 'Tema geçersiz.'); a.tema = b.tema; }
      if (b.renk) { ['pri', 'acc'].forEach(k => { const v = String(b.renk[k] || ''); if (v && !hexOk(v)) throw new Err(400, 'Renk #RRGGBB biçiminde olmalı.'); a.renk[k] = v; }); }
      if (b.alan_adi !== undefined) { const h = hostOf(b.alan_adi); if (h && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) throw new Err(400, 'Alan adı geçersiz (örn. www.dernegim.org).'); a.alan_adi = h; }
      if (b.acik !== undefined) a.acik = b.acik ? 1 : 0;
      if (b.hero) { const h = b.hero; if (h.baslik !== undefined) a.hero.baslik = str(h.baslik, 90); if (h.alt !== undefined) a.hero.alt = str(h.alt, 300); if (h.dugme !== undefined) a.hero.dugme = str(h.dugme, 30) || 'Bağış Yap'; if (h.gorsel_sil) a.hero.gorsel = '';
        if (h.gorsel) { const m = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.exec(String(h.gorsel)); if (!m) throw new Err(400, 'Ana görsel PNG, JPEG ya da WEBP olmalı.'); if (h.gorsel.length > 600000) throw new Err(413, 'Ana görsel çok büyük (en çok ~400 KB).'); a.hero.gorsel = h.gorsel; } }
      if (b.goster) ['sayac', 'proje', 'kategori', 'hesap'].forEach(k => { if (b.goster[k] !== undefined) a.goster[k] = b.goster[k] ? 1 : 0; });
      if (b.alt) { if (b.alt.izin !== undefined) a.alt.izin = str(b.alt.izin, 120); ['facebook', 'instagram', 'youtube', 'x'].forEach(k => { const v = str(((b.alt.sosyal || {})[k]), 160); if (v && !/^https:\/\//.test(v)) throw new Err(400, 'Sosyal medya bağlantısı https:// ile başlamalı.'); if ((b.alt.sosyal || {})[k] !== undefined) a.alt.sosyal[k] = v; }); }
    });
    A.audit(c.user, 'site_tasarim', a.tema + (a.acik ? ' (yayında)' : ''), ip(c.req)); return [200, { ok: 1 }];
  });
  R('PUT', '/api/site/menu', 'smenu', 'e', async (c) => {
    const L = Array.isArray(c.body.menu) ? c.body.menu : null; if (!L) throw new Err(400, 'Menü listesi gerekli.'); if (L.length > 8) throw new Err(400, 'Menüde en çok 8 öğe olabilir.');
    const a = cfg(), slugs = a.sayfalar.map(p => p.slug);
    const m = L.map(x => { const ad = str(x.ad, 30), h = String(x.h || '').trim(); if (!ad) throw new Err(400, 'Her menü öğesine ad verin.'); if (!(h === '' || h === '#bagis' || slugs.includes(h) || /^https:\/\/[^\s]+$/.test(h))) throw new Err(400, `“${ad}” için hedef geçersiz.`); return { ad, h }; });
    kaydet(a => { a.menu = m; }); A.audit(c.user, 'site_menu', m.length + ' öğe', ip(c.req)); return [200, { ok: 1 }];
  });
  R('PUT', '/api/site/sayfalar', 'spage', 'e', async (c) => {
    const L = Array.isArray(c.body.sayfalar) ? c.body.sayfalar : null; if (!L) throw new Err(400, 'Sayfa listesi gerekli.'); if (L.length > 30) throw new Err(400, 'En çok 30 sayfa eklenebilir.');
    const seen = new Set(), P = L.map(x => { const slug = String(x.slug || '').trim().toLowerCase(), baslik = str(x.baslik, 90); if (!baslik) throw new Err(400, 'Her sayfanın başlığı olmalı.'); if (!slugOk(slug)) throw new Err(400, `“${baslik}” için adres geçersiz (küçük harf, rakam ve tire; “bagis”, “img” kullanılamaz).`); if (seen.has(slug)) throw new Err(400, `“${slug}” adresi iki sayfada kullanılmış.`); seen.add(slug); return { slug, baslik, gorunur: x.gorunur ? 1 : 0, icerik: String(x.icerik || '').slice(0, 20000) }; });
    kaydet(a => { a.sayfalar = P; a.menu = a.menu.filter(m => !m.h || m.h === '#bagis' || /^https:/.test(m.h) || seen.has(m.h)); }); A.audit(c.user, 'site_sayfalar', P.length + ' sayfa', ip(c.req)); return [200, { ok: 1 }];
  });
  R('PUT', '/api/site/form', 'sform', 'e', async (c) => {
    const b = c.body || {}, ok = new Set(turListe().map(t => t.id));
    const tut = (Array.isArray(b.tutarlar) ? b.tutarlar : []).map(Number).filter(n => n > 0 && n <= 1e7).slice(0, 6);
    kaydet(a => { a.form.baslik = str(b.baslik, 40) || 'Hızlı bağış'; a.form.turler = (Array.isArray(b.turler) ? b.turler : []).map(Number).filter(n => ok.has(n)); a.form.tutarlar = tut.length ? tut : [100, 250, 500, 1000]; a.form.aylik = b.aylik ? 1 : 0; a.form.vekalet = b.vekalet ? 1 : 0; });
    A.audit(c.user, 'site_form', '', ip(c.req)); return [200, { ok: 1 }];
  });

  // ---------------- herkese açık bağış ----------------
  const hiz = new Map();
  const sinir = (req) => { const k = ip(req) || 'x', t = Date.now(), L = (hiz.get(k) || []).filter(x => t - x < 600000); if (L.length >= 8) throw new Err(429, 'Çok fazla deneme. Lütfen biraz bekleyin.'); L.push(t); hiz.set(k, L); if (hiz.size > 5000) hiz.clear(); };
  const formTurleri = () => { const a = cfg(), T = turListe(); return a.form.turler.length ? T.filter(t => a.form.turler.includes(t.id)) : T; };
  R('POST', '/api/site/bagis', null, null, async (c) => {
    const a = cfg(); if (!a.acik && !A.sessionUser(c.token)) throw new Err(404, 'Site yayında değil.');
    const b = c.body || {}; if (b.web2) return [200, { ok: 1 }]; // bal kutusu: botlar doldurur
    sinir(c.req);
    if (!b.kvkk) throw new Err(400, 'Devam etmek için aydınlatma metnini onaylayın.');
    const t = formTurleri().find(x => x.id === +b.tur_id); if (!t) throw new Err(400, 'Bağış türünü seçin.');
    const hs = db.prepare('SELECT id,banka,hesap,iban,para FROM banka_hesaplari ORDER BY id').all(); if (!hs.length) throw new Err(503, 'Banka hesabı tanımlı değil, şimdilik bağış alınamıyor.');
    const hes = hs.find(h => h.id === +b.banka_id) || hs[0], aylik = a.form.aylik && b.periyot === 'aylik';
    const adet = Math.max(1, Math.min(100, Math.floor(+b.adet || 1))), tutar = t.fiyat && !t.fon ? adet * t.fiyat : +b.tutar;
    if (!(tutar >= 1) || tutar > 1e7) throw new Err(400, 'Geçerli bir tutar girin.');
    const not = [aylik ? 'Her ay bağış talebi (site)' : '', str(b.not, 200)].filter(Boolean).join(' · ');
    const kod = /^\+\d{1,3}$/.test(String(b.kod || '')) ? b.kod : '+90';
    const r = ctx.bagisOlustur({ kod, tel: b.tel, ad: b.ad, eposta: b.eposta, tur_id: t.id, adet, tutar, odeme: 'Havale/EFT', banka_id: hes.id, durum: 'Bekleyen', notu: not, vekalet: a.form.vekalet && t.org === 'Kurban' && b.vekalet ? true : false, vekalet_yontem: 'Online', riza: { ayd: true, kaynak: 'Web formu', iletisim: !!b.iletisim } }, { id: null, kadi: 'site' }, 'Web sitesi', 'SITE-' + require('crypto').randomBytes(8).toString('hex'), c.req);
    return [201, { no: r.no, tutar, tur: t.ad, aylik, hesaplar: a.goster.hesap ? hs : [hes] }];
  });

  // ---------------- yayın ----------------
  const CSS = (a) => { const T = TV[a.tema], pri = hexOk(a.renk.pri) ? a.renk.pri : T.pri, acc = hexOk(a.renk.acc) ? a.renk.acc : T.acc; return `:root{--pri:${pri};--acc:${acc};--bg:${T.bg};--alt:${T.alt};--r:${T.r};--f:${T.f};--tx:#1c2630;--mu:#5c6b77;--ln:rgba(0,0,0,.1)}
*{box-sizing:border-box}[hidden]{display:none!important}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
h1,h2,h3{font-family:var(--f);line-height:1.2;margin:0 0 .4em}a{color:var(--pri)}img{max-width:100%}
.w{max-width:1120px;margin:0 auto;padding:0 18px}.hd{background:#fff;border-bottom:1px solid var(--ln);position:sticky;top:0;z-index:20}.hd .w{display:flex;align-items:center;gap:18px;min-height:64px;flex-wrap:wrap}
.br{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px;color:var(--pri);text-decoration:none;font-family:var(--f)}.br img{height:38px}.nv{display:flex;gap:4px;flex-wrap:wrap;margin-left:auto}.nv a{padding:8px 12px;border-radius:99px;text-decoration:none;color:var(--tx);font-weight:600;font-size:15px}.nv a:hover{background:var(--alt)}
.bt{display:inline-block;background:var(--acc);color:#fff;border:0;border-radius:99px;padding:11px 22px;font-weight:700;font-size:16px;text-decoration:none;cursor:pointer}.bt:hover{filter:brightness(.95)}.bt.g{background:transparent;color:var(--pri);border:2px solid var(--pri)}
.hero{background:linear-gradient(135deg,var(--pri),color-mix(in srgb,var(--pri) 70%,#000));color:#fff;position:relative;overflow:hidden}.hero .bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.35}
.hero .w{position:relative;display:grid;grid-template-columns:1.1fr .9fr;gap:34px;align-items:center;padding-top:56px;padding-bottom:56px}.hero h1{font-size:clamp(30px,5vw,50px)}.hero p{font-size:18px;opacity:.92;max-width:520px}
.card{background:#fff;color:var(--tx);border-radius:var(--r);padding:20px;box-shadow:0 8px 30px rgba(0,0,0,.14)}.card h2{font-size:21px;color:var(--pri)}.hero .card p{font-size:14px;opacity:1;max-width:none}
label{display:block;font-weight:600;font-size:14px;margin:10px 0 4px}input,select,textarea{width:100%;padding:11px 12px;border:1px solid #cdd6dd;border-radius:calc(var(--r) / 2 + 2px);font:inherit;background:#fff}
.ch{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}.ch button{flex:1;min-width:64px;padding:10px;border:2px solid #cdd6dd;background:#fff;border-radius:calc(var(--r) / 2 + 2px);font-weight:700;cursor:pointer;font:inherit}.ch button.on{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 14%,#fff)}
.sg{display:flex;gap:8px}.sg label{flex:1;margin:0;border:2px solid #cdd6dd;border-radius:calc(var(--r) / 2 + 2px);padding:9px;text-align:center;cursor:pointer;font-weight:600}.sg input{display:none}.sg label.on{border-color:var(--pri);background:color-mix(in srgb,var(--pri) 8%,#fff)}
.ck{display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:13px}.ck input{width:auto;margin-top:4px}.hp{position:absolute;left:-9999px}.er{color:#b3261e;font-size:14px;min-height:20px;margin:6px 0 0}
.sc{padding:48px 0}.sc.al{background:var(--alt)}.sc h2{font-size:30px;color:var(--pri);text-align:center;margin-bottom:24px}.gr{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}
.kt{background:#fff;border-radius:var(--r);padding:22px;box-shadow:0 2px 14px rgba(0,0,0,.07);text-decoration:none;color:var(--tx);display:block;border-top:4px solid var(--acc)}.kt b{display:block;font-size:19px;color:var(--pri);margin-bottom:4px}.kt span{color:var(--mu);font-size:14px}
.sy{text-align:center}.sy b{display:block;font-size:40px;color:var(--pri);font-family:var(--f)}.sy span{color:var(--mu)}
.bar{background:#e3e9ee;border-radius:99px;height:10px;overflow:hidden;margin:10px 0 4px}.bar i{display:block;height:100%;background:var(--acc)}
.pg{padding:40px 0 60px;max-width:780px}.pg h1{color:var(--pri);font-size:36px}.pg p{margin:0 0 1em}
.ft{background:var(--pri);color:#e8eef3;padding:34px 0 90px}.ft a{color:#fff}.ft small{opacity:.8}.ft .gr{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.hs{font-size:14px}.hs b{display:block}.ok{background:#e8f6ee;border:1px solid #9fd5b4;border-radius:var(--r);padding:14px;font-size:15px}
.wa{position:fixed;right:16px;bottom:78px;background:#25d366;color:#fff;border-radius:99px;padding:12px 18px;font-weight:700;text-decoration:none;box-shadow:0 4px 16px rgba(0,0,0,.25);z-index:30}
.bb{display:none;position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--ln);z-index:25;justify-content:space-around;padding:8px 0}.bb a{text-decoration:none;color:var(--mu);font-size:12px;text-align:center;font-weight:600;flex:1}.bb a.on{color:var(--pri)}.bb a:nth-child(2){color:var(--acc)}
.pv{background:#fff7e0;color:#6a5300;text-align:center;padding:8px;font-size:14px;font-weight:600}
.t-modern .hd{background:var(--pri)}.t-modern .br,.t-modern .nv a{color:#fff}.t-modern .nv a:hover{background:rgba(255,255,255,.14)}.t-modern .hero{background:var(--pri)}.t-modern .kt{border-top:0;border-left:4px solid var(--acc)}
.t-sicak .hero{background:linear-gradient(160deg,var(--pri),#5a2f19)}.t-sicak .hero .w{padding-top:64px;padding-bottom:64px}.t-sicak .sc h2{font-style:italic}
.t-uygulama .hd{background:var(--pri)}.t-uygulama .br{color:#fff}.t-uygulama .nv{display:none}.t-uygulama .hero .w{grid-template-columns:1fr;padding-top:26px;padding-bottom:26px}.t-uygulama .hero p{font-size:16px}.t-uygulama .bb{display:flex}.t-uygulama .hd .bt{margin-left:auto}
@media(max-width:820px){.hero .w{grid-template-columns:1fr;padding-top:30px;padding-bottom:30px}.nv{display:none}.hd .bt{margin-left:auto}.bb{display:flex}.sc{padding:34px 0}}`; };

  const metni = (t) => String(t || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => p.startsWith('# ') ? `<h2>${esc(p.slice(2).split('\n')[0])}</h2>${p.split('\n').slice(1).join('\n').trim() ? `<p>${esc(p.split('\n').slice(1).join('\n').trim()).replace(/\n/g, '<br>')}</p>` : ''}` : `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const kurumBilgi = () => { const k = getA('kurumb', {}); return { ad: k.ad || k.kisa || getA('dernek_adi', 'Derneğimiz'), logo: k.logo || '', tel: k.tel || '', eposta: k.eposta || '', adres: k.adres || '', slogan: k.slogan || '' }; };
  const telDigits = (s) => { let d = String(s || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '90' + d.slice(1); else if (d.length === 10) d = '90' + d; return d; };

  function sayfa(a, base, baslik, govde, aktif, onizle) {
    const k = kurumBilgi(), href = (h) => h === '' ? (base || '/') : h === '#bagis' ? (base || '') + '/#bagis' : /^https:/.test(h) ? h : base + '/' + h;
    const sos = Object.entries(a.alt.sosyal).filter(([, v]) => v).map(([n, v]) => `<a href="${esc(v)}" rel="noopener" target="_blank">${({ facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', x: 'X' })[n]}</a>`).join(' · ');
    const wa = k.tel ? `<a class="wa" href="https://wa.me/${telDigits(k.tel)}" rel="noopener" target="_blank">WhatsApp</a>` : '';
    return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(baslik)} · ${esc(k.ad)}</title><meta name="description" content="${esc(a.hero.alt)}"><style>${CSS(a)}</style></head><body class="t-${a.tema}">
${onizle ? '<div class="pv">Önizleme: site henüz yayında değil, yalnızca siz görüyorsunuz.</div>' : ''}
<header class="hd"><div class="w"><a class="br" href="${base || '/'}">${k.logo ? `<img src="${esc(k.logo)}" alt="">` : ''}<span>${esc(k.ad)}</span></a><nav class="nv">${a.menu.map(m => `<a href="${esc(href(m.h))}">${esc(m.ad)}</a>`).join('')}</nav><a class="bt" href="${esc(href('#bagis'))}">${esc(a.hero.dugme)}</a></div></header>
${govde}
<footer class="ft"><div class="w"><div class="gr"><div><b style="font-size:18px">${esc(k.ad)}</b><br><small>${esc(k.slogan)}</small></div><div>${k.adres ? esc(k.adres) + '<br>' : ''}${k.tel ? `<a href="tel:${esc(k.tel)}">${esc(k.tel)}</a><br>` : ''}${k.eposta ? `<a href="mailto:${esc(k.eposta)}">${esc(k.eposta)}</a>` : ''}</div><div>${sos}</div></div>${a.alt.izin ? `<p><small>${esc(a.alt.izin)}</small></p>` : ''}<p><small>© ${new Date().getFullYear()} ${esc(k.ad)}</small></p></div></footer>
${wa}<nav class="bb"><a href="${base || '/'}" class="${aktif === 'ana' ? 'on' : ''}">Ana Sayfa</a><a href="${esc(href('#bagis'))}">Bağış Yap</a>${a.menu.filter(m => m.h && m.h !== '#bagis' && !/^https:/.test(m.h)).slice(0, 2).map(m => `<a href="${esc(href(m.h))}" class="${aktif === m.h ? 'on' : ''}">${esc(m.ad)}</a>`).join('')}</nav>
<script src="/site.js"></script></body></html>`;
  }

  function ana(a, base) {
    const T = formTurleri(), kats = [...new Set(T.map(t => t.kat))], hs = db.prepare('SELECT id,banka,hesap,iban,para FROM banka_hesaplari ORDER BY id').all();
    const sayac = []; if (a.goster.sayac) { const g = (q) => (db.prepare(q).get() || {}).n || 0; [['Bağışçımız', g('SELECT COUNT(*) n FROM bagiscilar')], ['Onaylı bağış', g("SELECT COUNT(*) n FROM bagislar WHERE durum='Onaylı'")], ['Ülkede faaliyet', g('SELECT COUNT(*) n FROM ulkeler')], ['Tamamlanan eser', g("SELECT COUNT(*) n FROM eser WHERE web=1 AND durum='Tamamlandı'")]].forEach(([l, n]) => { if (n > 0) sayac.push([l, n]); }); }
    const projeler = a.goster.proje && ctx.eserWeb ? ctx.eserWeb().slice(0, 6) : [];
    const gorsel = a.hero.gorsel ? `<div class="bg" style="background-image:url('${base}/img/hero?v=${a.hero.gorsel.length}')"></div>` : '';
    const form = T.length ? `<form class="card" id="bagis" data-bf="1" autocomplete="on"><h2>${esc(a.form.baslik)}</h2>
<label>Bağış türü<select name="tur_id" required>${kats.map(kt => `<optgroup label="${esc(kt)}">${T.filter(t => t.kat === kt).map(t => `<option value="${t.id}" data-fiyat="${t.fiyat}" data-fon="${t.fon ? 1 : 0}" data-org="${esc(t.org)}">${esc(t.ad)}${t.fiyat && !t.fon ? ' · ' + TLF(t.fiyat) + ' ₺' : ''}</option>`).join('')}</optgroup>`).join('')}</select></label>
<div data-g="adet" hidden><label>Adet / hisse<input type="number" name="adet" min="1" max="100" value="1"></label><p class="hs" data-top></p></div>
<div data-g="tutar"><label>Tutar (₺)</label><div class="ch">${a.form.tutarlar.map(n => `<button type="button" data-t="${n}">${TLF(n)}</button>`).join('')}</div><input type="number" name="tutar" min="1" step="1" placeholder="Başka tutar"></div>
${a.form.aylik ? `<div class="sg" style="margin-top:10px"><label class="on"><input type="radio" name="periyot" value="tek" checked>Tek sefer</label><label><input type="radio" name="periyot" value="aylik">Her ay</label></div>` : ''}
<label>Ad soyad<input name="ad" required autocomplete="name"></label><label>Telefon<input name="tel" required inputmode="tel" placeholder="5xx xxx xx xx" autocomplete="tel"></label><label>E-posta (isteğe bağlı)<input name="eposta" type="email" autocomplete="email"></label>
${a.form.vekalet ? `<label class="ck" data-g="vekalet" hidden><input type="checkbox" name="vekalet"> Kurbanımın kesimi için derneğe vekâlet veriyorum.</label>` : ''}
${hs.length > 1 ? `<label>Ödeme yapacağınız hesap<select name="banka_id">${hs.map(h => `<option value="${h.id}">${esc(h.banka)} · ${esc(h.hesap)} (${esc(h.para)})</option>`).join('')}</select></label>` : ''}
<input class="hp" name="web2" tabindex="-1" autocomplete="off" aria-hidden="true">
<label class="ck"><input type="checkbox" name="kvkk" required> <a href="/aydinlatma.html" target="_blank" rel="noopener">Aydınlatma metnini</a> okudum, kişisel verilerimin bağış işlemi için işlenmesini anladım.</label>
<label class="ck"><input type="checkbox" name="iletisim"> Bağış ve proje bilgilendirme mesajlarını (SMS, WhatsApp, e-posta) almak istiyorum. <small>(İsteğe bağlı, istediğiniz zaman durdurabilirsiniz.)</small></label>
<p class="er" data-er></p><button class="bt" style="width:100%">Bağış kaydını oluştur</button><p class="hs" style="margin:10px 0 0;color:var(--mu)">Bağışınız kaydedilir ve ödeme için banka bilgileri gösterilir. Havale/EFT açıklamasına bağış numaranızı yazın. Kartla ödeme yakında.</p><div data-sonuc hidden></div></form>` : `<div class="card" id="bagis"><h2>Bağış</h2><p>Bağış türleri henüz tanımlı değil.</p></div>`;
    return `<section class="hero"><div class="w">${gorsel}<div><h1>${esc(a.hero.baslik)}</h1><p>${esc(a.hero.alt)}</p><a class="bt" href="#bagis">${esc(a.hero.dugme)}</a></div>${form}</div></section>
${a.goster.kategori && kats.length ? `<section class="sc"><div class="w"><h2>Nasıl destek olabilirsiniz?</h2><div class="gr">${kats.map(kt => `<a class="kt" href="#bagis" data-kat="${esc(kt)}"><b>${esc(kt)}</b><span>${T.filter(t => t.kat === kt).slice(0, 3).map(t => esc(t.ad)).join(' · ')}</span></a>`).join('')}</div></div></section>` : ''}
${sayac.length ? `<section class="sc al"><div class="w"><div class="gr">${sayac.map(([l, n]) => `<div class="sy"><b>${TLF(n)}</b><span>${esc(l)}</span></div>`).join('')}</div></div></section>` : ''}
${projeler.length ? `<section class="sc"><div class="w"><h2>Devam eden projeler</h2><div class="gr">${projeler.map(p => `<div class="kt"><b>${esc(p.ad)}</b><span>${esc([p.ulke, p.durum].filter(Boolean).join(' · '))}</span>${p.hedef ? `<div class="bar"><i style="width:${Math.min(100, p.yuzde || 0)}%"></i></div><span>${TLF(p.toplanan || 0)} / ${TLF(p.hedef)} ${esc(p.para || '₺')}</span>` : ''}</div>`).join('')}</div></div></section>` : ''}
${a.goster.hesap && hs.length ? `<section class="sc al"><div class="w"><h2>Hesap numaralarımız</h2><div class="gr">${hs.map(h => `<div class="kt hs"><b>${esc(h.banka)} · ${esc(h.para)}</b>${esc(h.hesap)}<br><span style="word-break:break-all">${esc(h.iban)}</span></div>`).join('')}</div></div></section>` : ''}`;
  }

  ctx.siteServe = async (req, res, url) => {
    const a = cfg(), host = hostOf(req.headers.host), kok = !!(a.alan_adi && host === a.alan_adi);
    let yol = url.pathname; if (!kok) { if (yol !== '/site' && !yol.startsWith('/site/')) return false; yol = yol.slice(5); } const base = kok ? '' : '/site';
    const onizle = !a.acik; if (onizle && !A.sessionUser(ctx.cookies(req).bp)) { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><meta charset="utf-8"><title>Yakında</title><body style="font-family:system-ui;text-align:center;padding:80px 20px"><h1>Çok yakında</h1><p>Sitemiz hazırlanıyor.</p></body>'); return true; }
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'; script-src 'self'; img-src 'self' data: https:; form-action 'self'; frame-ancestors 'none'"); res.setHeader('X-Frame-Options', 'DENY');
    const gonder = (kod, html) => { res.writeHead(kod, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); return true; };
    yol = yol.replace(/\/+$/, '');
    if (yol === '/img/hero') { const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(a.hero.gorsel || ''); if (!m) return gonder(404, 'Yok'); res.writeHead(200, { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' }); res.end(Buffer.from(m[2], 'base64')); return true; }
    if (yol === '') return gonder(200, sayfa(a, base, a.hero.baslik, ana(a, base), 'ana', onizle));
    const p = a.sayfalar.find(x => '/' + x.slug === yol && x.gorunur);
    if (!p) return gonder(404, sayfa(a, base, 'Sayfa bulunamadı', '<div class="w pg"><h1>Sayfa bulunamadı</h1><p><a href="' + (base || '/') + '">Ana sayfaya dön</a></p></div>', '', onizle));
    return gonder(200, sayfa(a, base, p.baslik, `<div class="w pg"><h1>${esc(p.baslik)}</h1>${metni(p.icerik)}</div>`, p.slug, onizle));
  };
};
