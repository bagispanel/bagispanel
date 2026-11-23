// Yedekleme durumu: son yedekler, boyut, "şimdi yedek al" ve indirme. Yedek dosyaları kişisel veri içerir; yalnızca yetkili kullanıcı görür/indirir, her indirme denetim kaydına yazılır.
module.exports = function (ctx) {
  const { R, Err, A, ip } = ctx, fs = require('fs'), path = require('path'), bk = require('../backup.js');
  const liste = () => { try { return fs.readdirSync(bk.out).filter(f => /\.db\.gz(\.enc)?$/.test(f)).sort().reverse().map(f => { const st = fs.statSync(path.join(bk.out, f)); return { ad: f, boyut: st.size, zaman: st.mtime.toISOString() }; }); } catch (e) { return []; } };
  const ozet = () => { const L = liste(), son = L[0] || null, yas = son ? Math.round((Date.now() - new Date(son.zaman)) / 36e5) : null; return { liste: L.slice(0, 15), adet: L.length, saklanan: bk.KEEP, son, yas_saat: yas, durum: !son ? 'yok' : yas > 30 ? 'eski' : 'iyi' }; };
  ctx.yedekOzet = ozet;
  R('GET', '/api/yedek', 'yedek', 'g', async () => [200, ozet()]);
  R('POST', '/api/yedek/al', 'yedek', 'd', async (c) => { try { bk.once(); } catch (e) { throw new Err(500, 'Yedek alınamadı: ' + e.message); } A.audit(c.user, 'yedek_alindi', '', ip(c.req)); return [200, ozet()]; });
  R('GET', '/api/yedek/indir/([A-Za-z0-9._-]+)', 'yedek', 's', async (c) => {
    const f = c.m[1]; if (!/^bagispanel-\d{8}-\d{4}\.db\.gz(\.enc)?$/.test(f)) throw new Err(400, 'Geçersiz dosya.');
    const p = path.join(bk.out, f); if (!fs.existsSync(p)) throw new Err(404, 'Yedek yok.');
    A.audit(c.user, 'yedek_indirildi', f, ip(c.req)); return [200, { ad: f, dosya: fs.readFileSync(p).toString('base64') }];
  });
};
