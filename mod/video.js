// Video yükleme ve izletme: videolar sunucuda saklanır (DATA_DIR/videos), panelde önizlenir, bağışçıya kurum logolu, tahmin edilemez bir izleme sayfasıyla gider.
// Yükleme akıştır (bellek şişmez); boyut VIDEO_MAX_MB ile sınırlıdır (varsayılan 500 MB). Videolar veritabanı yedeğine girmez: sunucu diskinde ayrı yedeklenmelidir (KURULUM.md).
module.exports = function (ctx) {
  const { R, Err, db, A, ip } = ctx, fs = require('fs'), path = require('path'), crypto = require('crypto');
  const DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'videos'); fs.mkdirSync(DIR, { recursive: true });
  const MAXMB = Math.max(5, +process.env.VIDEO_MAX_MB || 500), MENU = 'orgK|orgS|orgD';
  db.exec(`CREATE TABLE IF NOT EXISTS videolar(id INTEGER PRIMARY KEY, dosya TEXT NOT NULL, ad TEXT NOT NULL, boyut INTEGER NOT NULL, tip TEXT NOT NULL, yukleyen TEXT, zaman TEXT NOT NULL DEFAULT (datetime('now','localtime')))`);
  for (const q of ['ALTER TABLE paylar ADD COLUMN vtoken TEXT', 'ALTER TABLE paylar ADD COLUMN viz_say INTEGER DEFAULT 0', 'ALTER TABLE paylar ADD COLUMN viz_ilk TEXT', 'ALTER TABLE paylar ADD COLUMN viz_son TEXT']) { try { db.exec(q); } catch { /* var */ } }
  const iso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
  const vrow = (v) => { const m = /^vid:(\d+)$/.exec(v || ''); return m ? db.prepare('SELECT * FROM videolar WHERE id=?').get(+m[1]) : null; };
  // Kayıtta saklanan video değerini (yüklenen "vid:12", bağlantı ya da düz ad) panel için çözer.
  ctx.videoCoz = (v) => { if (!v) return { var: false, ad: '', url: '', yuklu: false }; const r = vrow(v); if (r) return { var: true, ad: r.ad, url: '/api/org/video/' + r.id, yuklu: true, boyut: r.boyut }; if (/^vid:/.test(v)) return { var: false, ad: '', url: '', yuklu: false }; return { var: true, ad: /^https?:\/\//i.test(v) ? '' : v, url: /^https?:\/\//i.test(v) ? v : '', yuklu: false }; };
  const token = (payId) => { const p = db.prepare('SELECT vtoken FROM paylar WHERE id=?').get(payId); if (!p) return ''; if (p.vtoken) return p.vtoken; const t = crypto.randomBytes(9).toString('base64url'); db.prepare('UPDATE paylar SET vtoken=? WHERE id=?').run(t, payId); return t; };
  // Bağışçıya giden bağlantı: yüklenen videoda izleme sayfası, dış bağlantıda doğrudan o bağlantı.
  ctx.videoLink = (u, s) => { const p = s && s.id ? db.prepare('SELECT video FROM paylar WHERE id=?').get(s.id) : null, v = (p && p.video) || (u && u.video) || '', r = vrow(v); if (r) return ctx.baseUrl() + '/izle.html?t=' + token(s.id); return /^https?:\/\//i.test(v) ? v : ''; };

  function tipi(b) { // dosya başlığından biçim: mp4/mov (ftyp) ya da webm
    if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') return { ext: 'mp4', ct: 'video/mp4' };
    if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: 'webm', ct: 'video/webm' };
    return null;
  }
  R('POST', '/api/org/video', MENU, 'd', (c) => new Promise((ok, no) => { // gövde ham video akışıdır; ad ?ad= ile gelir
    const req = c.req, url = new URL(req.url, 'http://x'), ad = String(url.searchParams.get('ad') || 'video').replace(/[\x00-\x1f<>"\\/]/g, '').slice(0, 120) || 'video', len = +req.headers['content-length'] || 0;
    if (!len) return no(new Err(411, 'Dosya boyutu bilinmiyor.'));
    if (len > MAXMB * 1048576) { req.resume(); return no(new Err(413, `Video en fazla ${MAXMB} MB olabilir (bu dosya ${Math.round(len / 1048576)} MB).`)); }
    try { const st = fs.statfsSync(DIR); if (st.bavail * st.bsize < len + 1073741824) { req.resume(); return no(new Err(507, 'Sunucuda yeterli disk alanı yok. Alan açın ya da disk büyütün.')); } } catch { /* ölçülemedi */ }
    const tmp = path.join(DIR, '.' + crypto.randomBytes(8).toString('hex') + '.part'), out = fs.createWriteStream(tmp); let n = 0, ilk = null, bitti = false;
    const son = (e) => { if (bitti) return; bitti = true; out.destroy(); fs.unlink(tmp, () => {}); no(e); };
    req.on('data', (d) => { n += d.length; if (!ilk) ilk = d; if (n > MAXMB * 1048576) { son(new Err(413, `Video en fazla ${MAXMB} MB olabilir.`)); req.destroy(); } });
    req.on('error', () => son(new Err(400, 'Yükleme yarıda kesildi.'))); req.on('aborted', () => son(new Err(400, 'Yükleme yarıda kesildi.'))); out.on('error', () => son(new Err(500, 'Video kaydedilemedi.')));
    req.pipe(out);
    out.on('finish', () => {
      if (bitti) return; const t = ilk && tipi(ilk); if (!t) return son(new Err(400, 'Desteklenen video biçimi: MP4, MOV ya da WebM.'));
      if (n !== len) return son(new Err(400, 'Yükleme eksik kaldı, tekrar deneyin.'));
      bitti = true; const name = crypto.randomBytes(12).toString('hex') + '.' + t.ext; fs.renameSync(tmp, path.join(DIR, name));
      const id = +db.prepare('INSERT INTO videolar(dosya,ad,boyut,tip,yukleyen) VALUES(?,?,?,?,?)').run(name, ad, n, t.ct, c.user.kadi).lastInsertRowid;
      A.audit(c.user, 'video_yukle', `${ad} (${(n / 1048576).toFixed(1)} MB)`, ip(c.req)); ok([200, { id, ad, boyut: n, ref: 'vid:' + id }]);
    });
  }));
  R('GET', '/api/org/video/([0-9]+)', MENU, 'g', async (c) => { const r = db.prepare('SELECT * FROM videolar WHERE id=?').get(+c.m[1]); if (!r) throw new Err(404, 'Video yok.'); return [200, { raw: path.join(DIR, path.basename(r.dosya)) }]; });
  R('GET', '/api/org/video-durum', MENU, 'g', async () => { let bos = null; try { const st = fs.statfsSync(DIR); bos = st.bavail * st.bsize; } catch { /* yok */ } const t = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(boyut),0) b FROM videolar').get(); return [200, { max: MAXMB, adet: t.n, boyut: t.b, bos }]; });

  // Herkese açık izleme (bağışçı): tahmin edilemez bağlantı; panel girişi gerekmez.
  const pay = (t) => { if (!/^[\w-]{8,20}$/.test(t || '')) return null; const p = db.prepare('SELECT p.id, p.ad, p.video pv, u.video uv, u.ulke, u.kod, u.ad uad, t.ad tur FROM paylar p JOIN birimler_org u ON u.id=p.birim_id JOIN bagis_turleri t ON t.id=u.tur_id WHERE p.vtoken=?').get(t); if (!p) return null; const r = vrow(p.pv || p.uv); return r ? { p, r } : null; };
  R('GET', '/api/izle/([\\w-]+)', null, null, async (c) => {
    const x = pay(c.m[1]); if (!x) throw new Err(404, 'Bağlantı geçersiz.');
    db.prepare('UPDATE paylar SET viz_say=COALESCE(viz_say,0)+1, viz_ilk=COALESCE(viz_ilk,?), viz_son=? WHERE id=?').run(iso(), iso(), x.p.id);
    const kb = ctx.h.getA('kurumb', {}) || {};
    return [200, { dernek: ctx.h.getA('dernek_adi', ''), logo: kb.logo || '', renk: /^#[0-9a-fA-F]{6}$/.test(kb.renk || '') ? kb.renk : '', ad: x.p.ad, tur: x.p.tur, ulke: x.p.ulke || '', kuyu: x.p.uad || '', src: '/api/izle/' + c.m[1] + '/dosya' }];
  });
  R('GET', '/api/izle/([\\w-]+)/dosya', null, null, async (c) => { const x = pay(c.m[1]); if (!x) throw new Err(404, 'Bağlantı geçersiz.'); return [200, { raw: path.join(DIR, path.basename(x.r.dosya)) }]; });
};
