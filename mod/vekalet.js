// Kurban vekâlet raporu: bağış alırken işaretlenen vekâlet, sonradan alınanlar bu sayfadan işaretlenir.
module.exports = function (ctx) {
  const { R, Err, db, tx, A, ip } = ctx, { iso } = ctx.h;
  const gun = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const SQL = `FROM paylar p JOIN birimler_org u ON u.id=p.birim_id JOIN bagis_turleri t ON t.id=u.tur_id JOIN bagislar g ON g.id=p.bagis_id JOIN bagiscilar b ON b.id=g.bagisci_id WHERE t.org='Kurban' AND g.durum<>'İptal'`;
  R('GET', '/api/vekalet', 'vekrap', 'g', async (c) => {
    const p = new URL(c.req.url, 'http://x').searchParams, q = String(p.get('q') || '').trim().toLocaleLowerCase('tr'), qd = q.replace(/\D/g, ''), d = p.get('durum') || 'Alınmadı', d1 = p.get('d1') || '', d2 = p.get('d2') || '', ka = p.get('kaynak') || '', yo = p.get('yontem') || '';
    const kk = (x) => x.kaynak === 'Manuel (CRM)' ? 'Panel' : x.kaynak === 'Banka' ? 'Banka' : 'Web sitesi';
    const hepsi = db.prepare(`SELECT p.id, p.no, p.ad, p.tel, p.tarih, p.vekalet, p.vekalet_yontem, p.vekalet_kim, u.kod, g.no bno, g.bagisci_id, g.kaynak, b.ad bad, b.tel btel ${SQL} ORDER BY p.id DESC`).all();
    const ozet = { alinan: hepsi.filter(x => x.vekalet).length, bekleyen: hepsi.filter(x => !x.vekalet).length };
    let L = hepsi.filter(x => (d === 'Hepsi' || (d === 'Alındı' ? x.vekalet : !x.vekalet)) && (!ka || ka === 'Tümü' || kk(x) === ka) && (!yo || yo === 'Tümü' || x.vekalet_yontem === yo) && (!d1 || x.tarih >= d1) && (!d2 || x.tarih <= d2) && (!q || [x.ad, x.no, x.bad, x.bno, x.kod].some(v => String(v || '').toLocaleLowerCase('tr').includes(q)) || (qd.length >= 3 && [x.tel, x.btel].some(v => String(v || '').replace(/\D/g, '').includes(qd)))));
    const pg = Math.max(0, +p.get('pg') || 0), toplam = L.length, ids = L.filter(x => !x.vekalet).map(x => x.id).slice(0, 5000);
    return [200, { ozet, toplam, ids, liste: L.slice(pg * 50, pg * 50 + 50).map(x => ({ id: x.id, no: x.no, ad: x.ad, tel: x.tel, tarih: x.tarih, vk: x.vekalet, vy: x.vekalet_yontem, kim: x.vekalet_kim, kaynak: kk(x), kod: x.kod, bno: x.bno, bagisci_id: x.bagisci_id, bagisci: x.bad })) }];
  });
  R('POST', '/api/vekalet/isaretle', 'vekrap', 'd', async (c) => {
    const a = c.body.a === 'geri' ? 'geri' : 'al', yo = ctx.VY.includes(c.body.yontem) ? c.body.yontem : 'Telefon', ids = (Array.isArray(c.body.paylar) ? c.body.paylar : []).map(Number).filter(Boolean);
    if (!ids.length) throw new Err(400, 'Önce kayıt seçin.');
    const rows = db.prepare(`SELECT p.id ${SQL} AND p.id IN (${ids.map(() => '?').join(',')})`).all(...ids); if (!rows.length) throw new Err(404, 'Kayıt bulunamadı.');
    tx(() => rows.forEach(r => a === 'al' ? db.prepare('UPDATE paylar SET vekalet=?, vekalet_yontem=?, vekalet_kim=? WHERE id=? AND vekalet IS NULL').run(iso(), yo, c.user.kadi, r.id) : db.prepare('UPDATE paylar SET vekalet=NULL, vekalet_yontem=NULL, vekalet_kim=NULL WHERE id=?').run(r.id)));
    A.audit(c.user, a === 'al' ? 'vekalet_alindi' : 'vekalet_geri', `${rows.length} hisse · ${yo}`, ip(c.req)); return [200, { ok: 1, n: rows.length }];
  });
  R('GET', '/api/vekalet/excel', 'vekrap', 'g', async (c) => {
    const hepsi = new URL(c.req.url, 'http://x').searchParams.get('durum') === 'hepsi';
    const L = db.prepare(`SELECT p.no, p.ad, p.tel, p.vekalet, p.vekalet_yontem, u.kod, g.no bno, b.ad bad, b.tel btel ${SQL} ${hepsi ? '' : 'AND p.vekalet IS NULL'} ORDER BY p.id`).all();
    const rows = [['Hisse no', 'Kurban sahibi', 'Telefon', 'Bağışçı (ödeyen)', 'Bağışçı telefonu', 'Bağış no', 'Kurban kodu', 'Vekâlet', 'Vekâlet tarihi', 'Yöntem'], ...L.map(p => [p.no, p.ad, p.tel || '', p.bad, p.btel || '', p.bno, p.kod, p.vekalet ? 'Alındı' : 'Alınmadı', p.vekalet ? String(p.vekalet).slice(0, 10) : '', p.vekalet_yontem || ''])];
    A.audit(c.user, 'vekalet_excel', `${L.length} satır`, ip(c.req));
    return [200, { ad: `kurban-vekalet-${hepsi ? 'tum' : 'eksik'}-${gun()}.xlsx`, dosya: require('../xlsx').yaz([{ ad: 'Vekâlet', satirlar: rows, metinSutun: [2, 4, 5], genislik: [16, 26, 18, 26, 18, 16, 14, 12, 14, 12] }]).toString('base64') }];
  });
};
