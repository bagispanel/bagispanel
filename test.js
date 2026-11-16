// Otomatik test: geçici veri klasöründe sunucuyu açar, yetki ve güvenlik kurallarını dener.
process.env.DATA_DIR = require('fs').mkdtempSync(require('os').tmpdir() + '/bp-'); process.env.ADMIN_PASSWORD = 'Gecici123';
const { server } = require('./server');
const assert = require('assert');
let fails = 0;
const t = async (ad, f) => { try { await f(); console.log('  ok  ', ad); } catch (e) { fails++; console.log('  HATA', ad, '→', e.message); } };
server.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port;
  const mk = () => { let ck = ''; const q = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-BP': '1', cookie: ck }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0]; let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; }; return q; };
  const admin = mk();
  await t('hatalı şifre reddedilir', async () => assert.equal((await admin('POST', '/api/login', { kadi: 'admin', sifre: 'x' })).s, 401));
  await t('girişsiz API 401', async () => assert.equal((await mk()('GET', '/api/users')).s, 401));
  await t('CSRF başlığı olmadan POST reddedilir', async () => { const r = await fetch(base + '/api/login', { method: 'POST', body: '{}' }); assert.equal(r.status, 403); });
  await t('admin girişi', async () => assert.equal((await admin('POST', '/api/login', { kadi: 'admin', sifre: 'Gecici123' })).s, 200));
  await t('ilk girişte şifre değiştirmeden işlem yapılamaz', async () => assert.equal((await admin('GET', '/api/users')).s, 403));
  await t('zayıf şifre reddedilir', async () => assert.equal((await admin('POST', '/api/sifre', { eski: 'Gecici123', yeni: 'abc' })).s, 400));
  await t('şifre değişir', async () => assert.equal((await admin('POST', '/api/sifre', { eski: 'Gecici123', yeni: 'Yonetici2027' })).s, 200));
  const bl = (await admin('GET', '/api/birimler')).j, id = (ad) => bl.find(b => b.ad === ad).id;
  await t('beş birim hazır', async () => assert.equal(bl.length, 5));
  const mkUser = async (kadi, birim) => { const r = await admin('POST', '/api/users', { ad: kadi, kadi, sifre: 'Gecici123', birim_id: id(birim) }); assert.equal(r.s, 201); const q = mk(); assert.equal((await q('POST', '/api/login', { kadi, sifre: 'Gecici123' })).s, 200); assert.equal((await q('POST', '/api/sifre', { eski: 'Gecici123', yeni: 'Sifre2027x' })).s, 200); return { q, id: r.j.id }; };
  const meric = await mkUser('meric', 'Çağrı merkezi');
  await t('çağrı merkezi kullanıcı listesini göremez', async () => assert.equal((await meric.q('GET', '/api/users')).s, 403));
  await t('çağrı merkezi su kuyusunu görebilir (menü yetkisi)', async () => { const m = (await meric.q('GET', '/api/me')).j.perms; assert.equal(m.orgS.g, 1); assert.equal(m.orgS.d, 0); });
  await t('kişiye özel: su kuyusunu düzeltebilsin, silme/iptal kapalı kalsın', async () => {
    const r = await admin('PUT', `/api/users/${meric.id}/yetki`, { ozel: { orgS: { g: 1, e: 0, d: 1, s: 0 } } }); assert.equal(r.s, 200);
    const m = (await meric.q('GET', '/api/me')).j.perms.orgS; assert.deepEqual(m, { g: 1, e: 0, d: 1, s: 0 });
  });
  await t('kişiye özel: birimde olan yetki tek kişiden kaldırılabilir', async () => {
    await admin('PUT', `/api/users/${meric.id}/yetki`, { ozel: { orgS: { g: 1, d: 1 }, alin: { e: 0 } } });
    const m = (await meric.q('GET', '/api/me')).j.perms; assert.equal(m.alin.e, 0); assert.equal(m.alin.g, 1);
  });
  const muh = await mkUser('muhasebe1', 'Muhasebe');
  await t('yetkisiz kişi kendi yetkisini değiştiremez', async () => assert.equal((await meric.q('PUT', `/api/users/${meric.id}/yetki`, { ozel: {} })).s, 403));
  // yetki yükseltme: kullanıcı yönetimi yetkisi olan ama sahip olmadığı yetkiyi veremeyen biri
  await t('sahip olunmayan yetki verilemez', async () => {
    await admin('PUT', `/api/users/${muh.id}/yetki`, { ozel: { kullanici: { g: 1, d: 1 } } });
    const r = await muh.q('PUT', `/api/users/${meric.id}/yetki`, { ozel: { rapor: { g: 1 }, banka: { g: 1, s: 1 } } });
    assert.equal(r.s, 403);
  });
  await t('görme kapalıysa diğerleri de kapanır', async () => { await admin('PUT', `/api/users/${meric.id}/yetki`, { ozel: { orgS: { g: 0, d: 1 } } }); const m = (await meric.q('GET', '/api/me')).j.perms.orgS; assert.deepEqual(m, { g: 0, e: 0, d: 0, s: 0 }); });
  await t('birim yetkisi kaydedilir ve etki eder', async () => {
    const p = (await admin('GET', `/api/birimler/${id('Muhasebe')}/yetki`)).j; assert.equal(p.rapor.g, 1);
    p.rapor = { g: 0, e: 0, d: 0, s: 0 }; assert.equal((await admin('PUT', `/api/birimler/${id('Muhasebe')}/yetki`, { perm: p })).s, 200);
    assert.equal((await muh.q('GET', '/api/me')).j.perms.rapor.g, 0);
  });
  await t('son yönetici kaldırılamaz / silinemez / pasife alınamaz', async () => {
    const all = (await admin('GET', '/api/users')).j; const me = all.find(u => u.kadi === 'admin');
    assert.equal((await admin('DELETE', `/api/users/${me.id}`)).s, 403);
    assert.equal((await admin('PUT', `/api/users/${me.id}`, { aktif: false })).s, 403);
    const p = (await admin('GET', `/api/birimler/${id('Bilgi işlem')}/yetki`)).j; p.birim.d = 0; const r = await admin('PUT', `/api/birimler/${id('Bilgi işlem')}/yetki`, { perm: p });
    assert.equal(r.s, 409); const p2 = (await admin('GET', `/api/birimler/${id('Bilgi işlem')}/yetki`)).j; assert.equal(p2.birim.d, 1);
  });
  await t('kullanıcılı birim silinemez', async () => assert.equal((await admin('DELETE', `/api/birimler/${id('Çağrı merkezi')}`)).s, 409));
  await t('yeni birim yetki kopyalayarak açılır', async () => { const r = await admin('POST', '/api/birimler', { ad: 'Saha ekibi', kopya_id: id('Muhasebe') }); assert.equal(r.s, 201); });
  await t('aynı kullanıcı adı ikinci kez açılamaz', async () => assert.equal((await admin('POST', '/api/users', { ad: 'x', kadi: 'meric', sifre: 'Gecici123', birim_id: id('Muhasebe') })).s, 409));
  await t('pasif kullanıcı giremez, açık oturumu düşer', async () => { await admin('PUT', `/api/users/${meric.id}`, { aktif: false }); assert.equal((await meric.q('GET', '/api/me')).s, 401); assert.equal((await mk()('POST', '/api/login', { kadi: 'meric', sifre: 'Sifre2027x' })).s, 403); });
  await t('5 hatalı denemeden sonra kilit', async () => { const q = mk(); for (let i = 0; i < 5; i++) await q('POST', '/api/login', { kadi: 'muhasebe1', sifre: 'yanlis' + i }); assert.equal((await q('POST', '/api/login', { kadi: 'muhasebe1', sifre: 'Sifre2027x' })).s, 429); });
  await t('denetim kaydı tutulur', async () => { const a = (await admin('GET', '/api/audit')).j; assert.ok(a.some(x => x.islem === 'kullanici_yetkisi') && a.some(x => x.islem === 'giris_hatali')); });
  await t('statik dosya yol aşımı engellenir', async () => { const r = await fetch(base + '/..%2f..%2fetc/passwd'); const x = await r.text(); assert.ok(!x.includes('root:')); });
  console.log(fails ? `\n${fails} test başarısız` : '\nTüm testler geçti'); server.close(); process.exit(fails ? 1 : 0);
});
