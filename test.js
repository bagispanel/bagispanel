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
  const JPG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');
  await t('profil: geçerli TC, telefon, e-posta, doğum, fotoğraf ile kullanıcı açılır', async () => {
    const r = await admin('POST', '/api/users', { ad: 'Profil Test', kadi: 'profil1', sifre: 'Gecici123', birim_id: id('Muhasebe'), telefon: '0541 300 00 00', eposta: 'Ali@Ornek.org', tc: '10000000146', dogum_tarihi: '1990-05-17', dogum_yeri: 'Ankara', foto: JPG }); assert.equal(r.s, 201);
    const d = (await admin('GET', `/api/users/${r.j.id}`)).j; assert.equal(d.telefon, '+905413000000'); assert.equal(d.eposta, 'ali@ornek.org'); assert.equal(d.tc, '10000000146'); assert.equal(d.foto, 1);
    const f = await fetch(base + `/api/users/${r.j.id}/foto`, { headers: { cookie: 'x' } }); assert.equal(f.status, 401);
  });
  await t('profil: hatalı TC / telefon / e-posta / doğum tarihi reddedilir', async () => {
    const base0 = { ad: 'X', sifre: 'Gecici123', birim_id: id('Muhasebe') };
    assert.equal((await admin('POST', '/api/users', { ...base0, kadi: 'bad1', tc: '12345678901' })).s, 400);
    assert.equal((await admin('POST', '/api/users', { ...base0, kadi: 'bad2', telefon: '123' })).s, 400);
    assert.equal((await admin('POST', '/api/users', { ...base0, kadi: 'bad3', eposta: 'abc' })).s, 400);
    assert.equal((await admin('POST', '/api/users', { ...base0, kadi: 'bad4', dogum_tarihi: '2030-01-01' })).s, 400);
    assert.equal((await admin('POST', '/api/users', { ...base0, kadi: 'bad5', foto: 'data:image/jpeg;base64,AAAA' })).s, 400);
  });
  await t('aynı TC iki kullanıcıda olamaz', async () => assert.equal((await admin('POST', '/api/users', { ad: 'Y', kadi: 'ikinci', sifre: 'Gecici123', birim_id: id('Muhasebe'), tc: '10000000146' })).s, 409));
  await t('TC, düzeltme yetkisi olmayana maskeli görünür', async () => {
    const mu = await mkUser('goruntuleyen', 'Başkan'); await admin('PUT', `/api/users/${mu.id}/yetki`, { ozel: { kullanici: { g: 1 } } });
    const all = (await admin('GET', '/api/users')).j, pid = all.find(u => u.kadi === 'profil1').id; const d = (await mu.q('GET', `/api/users/${pid}`)).j; assert.equal(d.tc, '100*****46');
  });
  await t('kullanıcı güncellenir, fotoğraf kaldırılır', async () => {
    const pid = (await admin('GET', '/api/users')).j.find(u => u.kadi === 'profil1').id;
    assert.equal((await admin('PUT', `/api/users/${pid}`, { telefon: '+49 170 1234567', eposta: '', tc: '', foto_sil: 1 })).s, 200);
    const d = (await admin('GET', `/api/users/${pid}`)).j; assert.equal(d.telefon, '+491701234567'); assert.equal(d.foto, 0); assert.equal(d.tc, null);
  });
  await t('ayarlar: ülke ekle/çift/sil', async () => {
    assert.equal((await admin('POST', '/api/ulkeler', { ad: 'Testistan', kita: 'Asya' })).s, 201);
    assert.equal((await admin('POST', '/api/ulkeler', { ad: 'testistan', kita: 'Asya' })).s, 409);
    const u = (await admin('GET', '/api/ulkeler')).j; assert.ok(u.length > 3);
    assert.equal((await admin('DELETE', '/api/ulkeler/' + u.find(x => x.ad === 'Testistan').id)).s, 200);
  });
  await t('ayarlar: banka IBAN doğrulaması', async () => {
    assert.equal((await admin('POST', '/api/banka', { banka: 'Ziraat', hesap: 'A', iban: 'TR000000000000000000000000', para: 'TL' })).s, 400);
    assert.equal((await admin('POST', '/api/banka', { banka: 'Ziraat', hesap: 'A', iban: 'TR330006100519786457841326', para: 'TL' })).s, 201);
    assert.ok((await admin('GET', '/api/banka')).j.hesaplar.length >= 1);
  });
  await t('ayarlar: partner doğrulama ve ekleme', async () => {
    assert.equal((await admin('POST', '/api/partnerler', { tur: 'Şirket', ad: 'X' })).s, 400);
    const r = await admin('POST', '/api/partnerler', { tur: 'Dernek', ad: 'Test Dernek', vn: '1234567890', yad: 'Ali', yt: '05413000000' }); assert.equal(r.s, 201);
    assert.ok((await admin('GET', '/api/partnerler')).j.some(p => p.ad === 'Test Dernek'));
  });
  await t('ayarlar: kategori ve tür', async () => {
    assert.equal((await admin('POST', '/api/kategoriler', { ad: 'Test Kategori' })).s, 201);
    assert.equal((await admin('POST', '/api/turler', { sec: 'genel', kat: 'Test Kategori', ad: 'Kuranı Kerim', videolu: true, tutar: 100 })).s, 201);
    assert.equal((await admin('POST', '/api/turler', { sec: 'kuyu', ad: 'Testistan - Çeşme', bicim: 'Hisseli', fiyat: 7000, pay: 1000 })).s, 201);
    assert.equal((await admin('POST', '/api/turler', { sec: 'kurban', hayvan: 'hisse', tur: 'Test Kurbanı', fiyat: 4500 })).s, 201);
    const T = (await admin('GET', '/api/turler')).j; assert.ok(T.turler.length >= 3 && T.kategoriler.includes('Test Kategori'));
  });
  await t('ayarlar: yetkisiz kullanıcı ekleyemez', async () => { const u = await mkUser('cagri9', 'Çağrı merkezi'); assert.equal((await u.q('POST', '/api/ulkeler', { ad: 'Z', kita: 'Asya' })).s, 403); });
  console.log(fails ? `\n${fails} test başarısız` : '\nTüm testler geçti'); server.close(); process.exit(fails ? 1 : 0);
});
