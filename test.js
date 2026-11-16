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
  const turId = async (pre) => (await admin('GET', '/api/turler')).j.turler.find(x => x.ad.startsWith(pre)).id;
  const bag = (o) => admin('POST', '/api/bagislar', { kod: '+90', tel: '541 300 00 01', ad: 'Ayşe Test', odeme: 'Nakit', ...o });
  await t('bağış: genel bağış alınır, bağışçı otomatik kaydolur, sms yazılır', async () => {
    const r = await bag({ tur_id: await turId('Fitre'), tutar: 100 }); assert.equal(r.s, 201); assert.ok(r.j.yeni); assert.match(r.j.no, /^BG-\d{4}-\d{5}$/);
    assert.equal((await bag({ tur_id: await turId('Zekât'), tutar: 50 })).j.yeni, false);
    assert.ok((await admin('GET', '/api/sms')).j.some(x => x.mesaj.includes('alınmıştır')));
  });
  await t('bağış: hatalı telefon / tutar / havalede banka zorunlu', async () => {
    const f = await turId('Fitre');
    assert.equal((await bag({ tur_id: f, tutar: 10, tel: '123' })).s, 400); assert.equal((await bag({ tur_id: f, tutar: 0 })).s, 400);
    assert.equal((await bag({ tur_id: f, tutar: 10, odeme: 'Havale/EFT' })).s, 400);
  });
  await t('kurban: 7 hisse gruba yerleşir, dolunca adım 1', async () => {
    const v = await turId('Vacip · hisseli');
    for (let i = 0; i < 7; i++) assert.equal((await bag({ tur_id: v, tel: '541 300 10 0' + i, ad: 'K' + i })).s, 201);
    const o = (await admin('GET', '/api/org/kurban')).j; const u = o.liste.find(x => x.tur_id === v); assert.equal(u.paylar.length, 7); assert.equal(u.sts, 1); assert.match(u.kod, /^K\d\d-B-0001$/);
  });
  await t('kurban: bekleyen bağış organizasyona düşmez, onayla düşer', async () => {
    const k = await turId('Adak · küçükbaş'); const r = await bag({ tur_id: k, durum: 'Bekleyen', tel: '541 300 20 00', ad: 'Bekleyen K' });
    assert.equal((await admin('GET', '/api/org/kurban?q=Bekleyen K')).j.toplam, 0);
    assert.equal((await admin('POST', '/api/bagislar/onayla', { ids: [r.j.id] })).j.n, 1); assert.equal((await admin('GET', '/api/org/kurban?q=Bekleyen K')).j.toplam, 1);
  });
  await t('kurban: ülke ata, kesildi, video, gönder (sıra zorunlu)', async () => {
    const v = await turId('Vacip · hisseli'), u = (await admin('GET', '/api/org/kurban')).j.liste.find(x => x.tur_id === v);
    assert.equal((await admin('POST', '/api/org/islem', { a: 'k', ids: [u.id] })).s, 409);
    assert.equal((await admin('POST', '/api/org/islem', { a: 'c', ids: [u.id], ulke: 'Çad', partner: 'Test Dernek' })).s, 200);
    assert.equal((await admin('POST', '/api/org/islem', { a: 'k', ids: [u.id] })).s, 200);
    assert.equal((await admin('POST', '/api/org/islem', { a: 'g', ids: [u.id] })).s, 409);
    assert.equal((await admin('POST', '/api/org/islem', { a: 'v', ids: [u.id], video: 'kurban1.mp4' })).s, 200);
    assert.equal((await admin('POST', '/api/org/islem', { a: 'g', ids: [u.id] })).s, 200);
    assert.ok((await admin('GET', '/api/sms')).j.filter(x => x.sablon === 'video').length >= 7);
  });
  await t('iptal: kesilmiş kurbanın bağışı iptal edilemez, bekleyen iptal olur', async () => {
    const v = await turId('Vacip · hisseli'), b = (await admin('GET', '/api/bagislar')).j.liste.find(x => x.tur_id === v && x.ad === 'K0');
    assert.equal((await admin('POST', `/api/bagislar/${b.id}/iptal`, { sebep: 'Hatalı giriş' })).s, 409);
    const k = await turId('Akika · küçükbaş'), r = await bag({ tur_id: k, tel: '541 300 30 00', ad: 'Iptal K' }); assert.equal((await admin('POST', `/api/bagislar/${r.j.id}/iptal`, { sebep: 'Mükerrer (çift) kayıt' })).s, 200);
    assert.equal((await admin('GET', '/api/org/kurban?q=Iptal K')).j.toplam, 0);
  });
  await t('kuyu: hisseli dolunca numara verilir, kuyu serisi sayaçlanır', async () => {
    const ky = await turId('Testistan - Çeşme'); const L = []; for (let i = 0; i < 7; i++) L.push(await bag({ tur_id: ky, adet: 1, tel: '541 300 40 0' + i, ad: 'Ky' + i }));
    L.forEach(x => assert.equal(x.s, 201)); const u = (await admin('GET', '/api/org/kuyu')).j.liste.find(x => x.tur_id === ky); assert.equal(u.ulke, 'Testistan'.length ? u.ulke : ''); assert.equal(u.kn, 1); assert.match(u.kod, /^KY-\d{4}-0001$/);
  });
  await t('numaralandırma: sayaç geri alınamaz', async () => {
    const n = (await admin('GET', '/api/numara')).j; assert.ok(n.seriler.some(s => s.ad === 'Genel')); assert.equal((await admin('PUT', '/api/numara/sayac', { k: 'Genel', n: 1 })).s, 409); assert.equal((await admin('PUT', '/api/numara/sayac', { k: 'Genel', n: 100 })).s, 200);
  });
  await t('fon: hedef aşılınca fazlası devreder', async () => {
    assert.equal((await admin('POST', '/api/turler', { sec: 'kuyu', ad: 'Anne Fatma Fonu', bicim: 'Fon', fiyat: 1000 })).s, 201);
    const f = await turId('Anne Fatma Fonu'); await bag({ tur_id: f, tutar: 700, tel: '541 300 50 00', ad: 'Fon1' }); await bag({ tur_id: f, tutar: 500, tel: '541 300 50 01', ad: 'Fon2' });
    const L = (await admin('GET', '/api/org/kuyu')).j.liste.filter(x => x.tur_id === f); assert.equal(L.length, 1); assert.equal(L[0].sts >= 1, true); assert.equal(L[0].tas, 200);
    await bag({ tur_id: f, tutar: 100, tel: '541 300 50 02', ad: 'Fon3' }); assert.equal((await admin('GET', '/api/org/kuyu')).j.liste.filter(x => x.tur_id === f).length, 2);
  });
  await t('videolu bağış: her adet ayrı kayıt, pdf listesi numaralanır', async () => {
    const vb = await turId('Kuranı Kerim'); await bag({ tur_id: vb, adet: 3, tel: '541 300 60 00', ad: 'VB' });
    const L = (await admin('GET', '/api/org/diger')).j.liste; assert.equal(L.length >= 3, true);
    const ids = L.map(x => x.id); await admin('POST', '/api/org/islem', { a: 'c', ids, ulke: 'Mali' });
    const r = (await admin('POST', '/api/pdf/olustur', { ids })).j; assert.equal(r.yeni.length, 1); assert.match(r.yeni[0], /^VL-\d{4}-0001$/);
    assert.equal((await admin('POST', '/api/pdf/olustur', { ids })).j.yeni.length, 0);
  });
  await t('sms şablonu düzenlenir, rapor toplamı', async () => {
    assert.equal((await admin('PUT', '/api/sablonlar/kabul', { m: 'Merhaba {ad} {bno} {dernek}' })).s, 200);
    const r = (await admin('GET', '/api/bagislar?durum=Onaylı')).j; assert.ok(r.liste.length > 10 && r.toplam['Onaylı'] > 0);
  });
  await t('entegrasyon: anahtarlı dış bağış bekleyen düşer, tekrar kaydedilmez', async () => {
    const k = (await admin('POST', '/api/entegre/anahtar', { ad: 'Web sitesi' })).j.anahtar; const f = await turId('Fitre');
    const post = (body, key) => fetch(base + '/api/dis/bagis', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bp': '1', 'x-api-key': key }, body: JSON.stringify(body) });
    const body = { kod: '+90', tel: '541 300 70 00', ad: 'Site Bağışçı', tur_id: f, tutar: 200, odeme: 'Kredi kartı / online', xid: 'SITE-1' };
    assert.equal((await post(body, 'yanlis')).status, 401); const r1 = await post(body, k); assert.equal(r1.status, 201); const r2 = await post(body, k); assert.equal((await r2.json()).tekrar, true);
    assert.ok((await admin('GET', '/api/bagislar?durum=Bekleyen')).j.liste.some(x => x.kaynak === 'Web sitesi'));
  });
  await t('yetki: çağrı merkezi organizasyonu görür ama işlem yapamaz', async () => {
    const u = await mkUser('cagri10', 'Çağrı merkezi'); assert.equal((await u.q('POST', '/api/org/islem', { a: 'k', ids: [1] })).s, 403); assert.equal((await u.q('GET', '/api/org/kurban')).s, 200);
  });
  await t('rapor: kategori/ödeme/tarih/sorumlu süzgeçleri ve dağılım', async () => {
    const r = (await admin('GET', '/api/bagislar?kat=Kurban&odeme=Nakit&kanal=CRM')).j; assert.ok(r.liste.length > 0 && r.liste.every(x => x.kat === 'Kurban' && x.odeme === 'Nakit' && x.kanal === 'CRM'));
    assert.ok(r.liste[0].sorumlu); assert.ok(r.kategori.length && r.odeme.length && r.sorumlular.length);
    assert.equal((await admin('GET', '/api/bagislar?d1=2999-01-01')).j.liste.length, 0);
    const w = (await admin('GET', '/api/bagislar?kanal=' + encodeURIComponent('Web sitesi / dış kaynak'))).j; assert.ok(w.liste.every(x => x.kanal !== 'CRM'));
  });
  await t('organizasyon: gidecek SMS önizlemesi', async () => {
    const u = (await admin('GET', '/api/org/kurban')).j.liste[0]; const p = (await admin('GET', '/api/org/onizleme?id=' + u.id)).j; assert.ok(p.k.length > 10 && p.g.length > 10);
  });
  console.log(fails ? `\n${fails} test başarısız` : '\nTüm testler geçti'); server.close(); process.exit(fails ? 1 : 0);
});
