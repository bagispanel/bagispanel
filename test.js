// Otomatik test: geçici veri klasöründe sunucuyu açar, yetki ve güvenlik kurallarını dener.
process.env.DATA_DIR = require('fs').mkdtempSync(require('os').tmpdir() + '/bp-'); process.env.ADMIN_PASSWORD = 'Gecici123'; process.env.KUR_OTO = '0'; process.env.KVKK_ZORUNLU = '0';
const { server } = require('./server');
const assert = require('assert');
let fails = 0;
const t = async (ad, f) => { try { await f(); console.log('  ok  ', ad); } catch (e) { fails++; console.log('  HATA', ad, '→', e.message, process.env.TDEBUG ? e.stack.split('\n')[1] : ''); } };
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
    assert.equal((await admin('DELETE', `/api/users/${me.id}`)).s, 405);
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
  await t('kuyu: hisseli dolunca kuyu kodu oluşur, numara elle ve isteğe bağlı', async () => {
    const ky = await turId('Testistan - Çeşme'); const L = []; for (let i = 0; i < 7; i++) L.push(await bag({ tur_id: ky, adet: 1, tel: '541 300 40 0' + i, ad: 'Ky' + i }));
    L.forEach(x => assert.equal(x.s, 201)); const u = (await admin('GET', '/api/org/kuyu')).j.liste.find(x => x.tur_id === ky); assert.equal(u.ulke, 'Testistan'.length ? u.ulke : ''); assert.equal(u.kn, null, 'otomatik kuyu numarası verilmez'); assert.match(u.kod, /^KY-\d{4}-0001$/);
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
  await t('isimler organizasyona yansır: kutu isimleri, boş kutu varsayılan isim, sahip numarası', async () => {
    const k = await turId('Akika · hisseli');
    const r = await bag({ tur_id: k, adet: 5, tel: '541 300 80 00', ad: 'Sahip Kisi', names: [{ n: 'Ali A' }, { n: 'Veli B', ph: '541 300 80 99' }, { n: '' }, { n: 'Cem C' }, { n: '' }] }); assert.equal(r.s, 201);
    const L = (await admin('GET', '/api/org/kurban?q=Sahip Kisi')).j.liste; const ad = L.flatMap(u => u.paylar).filter(p => p.bagisci === 'Sahip Kisi').map(p => p.ad).sort();
    assert.deepEqual(ad, ['Ali A', 'Cem C', 'Sahip Kisi', 'Sahip Kisi', 'Veli B']); assert.ok(L.flatMap(u => u.paylar).every(p => /^KS-/.test(p.no)));
    const k2 = await turId('Akika · küçükbaş'); await bag({ tur_id: k2, tel: '541 300 80 10', ad: 'Koyun Sahibi', hy: 'Koyun' }); assert.equal((await admin('GET', '/api/org/kurban?q=Koyun Sahibi')).j.liste[0].hayvan, 'Koyun');
  });
  await t('pdf ayarları: tasarım kaydedilir, geçersiz reddedilir', async () => {
    assert.equal((await admin('PUT', '/api/pdf', { tasarim: { hisse: 'iki', kucuk: 'tek', diger: '100' } })).s, 200);
    const a = (await admin('GET', '/api/pdf')).j.ayar; assert.equal(a.vb, 100); assert.equal(a.tasarim.hisse, 'iki'); assert.equal(a.tasarim.diger, '100');
    assert.equal((await admin('PUT', '/api/pdf', { tasarim: { hisse: 'yok' } })).s, 400); assert.equal((await admin('PUT', '/api/pdf', { tasarim: { diger: '9' } })).s, 400);
    await admin('PUT', '/api/pdf', { tasarim: { hisse: 'tek', kucuk: 'tek', diger: '40' } });
  });
  await t('ülke bayrağı yüklenir, geçersiz görsel reddedilir, kaldırılır', async () => {
    const yeni = await admin('POST', '/api/ulkeler', { ad: 'Bayrakistan' }); assert.equal(yeni.s, 201); const ul = { id: yeni.j.id };
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    assert.equal((await admin('PUT', `/api/ulkeler/${ul.id}/bayrak`, { bayrak: png })).s, 200);
    assert.equal((await admin('GET', '/api/ulkeler')).j.find(x => x.ad === 'Bayrakistan').bayrak, png);
    assert.equal((await admin('PUT', `/api/ulkeler/${ul.id}/bayrak`, { bayrak: 'data:text/html;base64,PGI+' })).s, 400);
    assert.equal((await admin('PUT', `/api/ulkeler/${ul.id}/bayrak`, { bayrak: null })).s, 200);
  });
  await t('ana sayfa özeti: yönetici tutarları görür, çağrı merkezi görmez', async () => {
    const a = await admin('GET', '/api/ana'); assert.equal(a.s, 200); assert.ok(a.j.ozet && a.j.gun30.length === 30 && Array.isArray(a.j.isler) && Array.isArray(a.j.son)); assert.ok(a.j.isler.some(x => x.k === 'bekleyen'));
    const cm = await mkUser('anatest', 'Çağrı merkezi'), m = await cm.q('GET', '/api/ana'); assert.equal(m.s, 200); assert.equal(m.j.ozet, undefined); assert.equal(m.j.son, undefined); assert.equal(m.j.gun30, undefined);
    assert.equal((await mk()('GET', '/api/ana')).s, 401);
  });

  // ---- İletişim: SMS / e-posta / WhatsApp (sahte sunucularla)
  const http = require('http'), net = require('net'), crypto = require('crypto');
  const smsGelen = [], waGelen = [], smtpGelen = [];
  const mock = http.createServer((q, r) => { let b = ''; q.on('data', d => b += d); q.on('end', () => { const j = b ? JSON.parse(b) : {}; if (q.url === '/sms') { smsGelen.push(j); r.end('{}'); } else { waGelen.push({ url: q.url, auth: q.headers.authorization, j }); r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify({ messages: [{ id: 'wamid.T' + waGelen.length }] })); } }); });
  await new Promise(ok => mock.listen(0, '127.0.0.1', ok)); const mport = mock.address().port;
  const smtp = net.createServer(s => { let veri = false, buf = ''; smtpGelen.push({ satir: [], govde: '' }); const cur = smtpGelen[smtpGelen.length - 1]; s.write('220 sahte\r\n'); s.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\r\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); if (veri) { if (l === '.') { veri = false; s.write('250 ok\r\n'); } else cur.govde += l + '\n'; continue; } cur.satir.push(l); if (l.startsWith('EHLO')) s.write('250-sahte\r\n250 AUTH LOGIN\r\n'); else if (l === 'AUTH LOGIN') s.write('334 VXNlcm5hbWU6\r\n'); else if (cur.satir[cur.satir.length - 2] === 'AUTH LOGIN') s.write('334 UGFzc3dvcmQ6\r\n'); else if (/^[A-Za-z0-9+/=]+$/.test(l) && cur.satir.includes('AUTH LOGIN') && !cur.satir.some(x => x.startsWith('MAIL'))) s.write('235 ok\r\n'); else if (l === 'DATA') { veri = true; s.write('354 devam\r\n'); } else if (l === 'QUIT') { s.end('221 bye\r\n'); } else s.write('250 ok\r\n'); } }); });
  await new Promise(ok => smtp.listen(0, '127.0.0.1', ok)); const sport = smtp.address().port;
  const bekleG = async (id) => { for (let i = 0; i < 30; i++) { const g = (await admin('GET', '/api/toplu/' + id)).j; if (g.durum === 'Tamamlandı') return g; await new Promise(r => setTimeout(r, 400)); } throw new Error('gönderim bitmedi'); };
  const SADECE = { min: 999999999 };
  await t('iletişim ayarı: gizli alanlar geri dönmez, canlı moda geçiş yetkiyle', async () => {
    const r = await admin('GET', '/api/iletisim/ayar'); assert.equal(r.s, 200); assert.equal(r.j.ayar.mod, 'deneme'); assert.equal(r.j.ayar.sms.sifre, '');
    const cm = await mkUser('iletisimci', 'Çağrı merkezi'); assert.equal((await cm.q('GET', '/api/iletisim/ayar')).s, 403); assert.equal((await cm.q('POST', '/api/toplu', { kanal: 'sms', mesaj: 'x', onay: true, filtre: {} })).s, 403);
  });
  await t('toplu SMS deneme modu: hiçbir şey dışarı gitmez, kayda yazılır, onay zorunlu', async () => {
    const h = (await admin('POST', '/api/toplu/hedef', { kanal: 'sms', filtre: {} })).j; assert.ok(h.adet > 0);
    assert.equal((await admin('POST', '/api/toplu', { kanal: 'sms', mesaj: 'Merhaba {ad}', filtre: {} })).s, 400);
    const r = await admin('POST', '/api/toplu', { kanal: 'sms', ad: 'deneme', mesaj: 'Merhaba {ad}, {dernek}', onay: true, filtre: {} }); assert.equal(r.s, 201); assert.equal(r.j.mod, 'deneme');
    const g = await bekleG(r.j.id); assert.equal(g.deneme, r.j.adet); assert.equal(smsGelen.length, 0);
    const log = (await admin('GET', '/api/sms')).j; assert.ok(log.some(x => x.kanal === 'SMS' && x.sablon === 'toplu:' + r.j.id && /Merhaba/.test(x.mesaj)));
  });
  await t('toplu SMS canlı: sağlayıcıya gider, ret edenler atlanır', async () => {
    assert.equal((await admin('PUT', '/api/iletisim/ayar', { mod: 'canli', sms: { saglayici: 'ozel', url: `http://127.0.0.1:${mport}/sms`, baslik: 'DERNEK', sifre: 'gizli' } })).s, 200);
    const r = await admin('POST', '/api/toplu', { kanal: 'sms', mesaj: 'Merhaba {ad}', onay: true, filtre: { ...SADECE, liste: 'Ali Veli;+90 555 000 11 11\n05550002222' } }); assert.equal(r.s, 201); assert.equal(r.j.adet, 2);
    const g = await bekleG(r.j.id); assert.equal(g.gonderildi, 2); assert.equal(smsGelen.length, 2); assert.equal(smsGelen[0].to, '905550001111'); assert.equal(smsGelen[0].message, 'Merhaba Ali'); assert.equal(smsGelen[0].from, 'DERNEK');
    assert.equal((await admin('GET', '/api/iletisim/ayar')).j.ayar.sms.sifre, ''); assert.equal((await admin('GET', '/api/iletisim/ayar')).j.ayar.sms.sifre_var, true);
    const bc = (await admin('GET', '/api/bagiscilar')).j[0]; const once = (await admin('POST', '/api/toplu/hedef', { kanal: 'sms', filtre: {} })).j.adet;
    assert.equal((await admin('PUT', `/api/bagiscilar/${bc.id}/izin`, { sms: 'ret' })).s, 200); assert.equal((await admin('POST', '/api/toplu/hedef', { kanal: 'sms', filtre: {} })).j.adet, once - 1);
    assert.equal((await admin('PUT', `/api/bagiscilar/${bc.id}/izin`, { sms: null })).s, 200);
  });
  await t('toplu e-posta: SMTP oturumu (kimlik doğrulama, UTF-8 konu)', async () => {
    assert.equal((await admin('PUT', '/api/iletisim/ayar', { mail: { host: '127.0.0.1', port: sport, guvenlik: 'yok', kullanici: 'u', sifre: 'p', adres: 'bilgi@dernek.org', ad: 'Dernek' } })).s, 200);
    const r = await admin('POST', '/api/toplu', { kanal: 'mail', konu: 'Hoş geldiniz {ad}', mesaj: 'Merhaba {ad}\nSelam', onay: true, filtre: { ...SADECE, liste: 'Ali;ali@example.com' } }); assert.equal(r.s, 201);
    const g = await bekleG(r.j.id); assert.equal(g.gonderildi, 1, JSON.stringify(g.alicilar));
    const o = smtpGelen[smtpGelen.length - 1]; assert.ok(o.satir.includes('MAIL FROM:<bilgi@dernek.org>')); assert.ok(o.satir.includes('RCPT TO:<ali@example.com>')); assert.ok(/Subject: =\?UTF-8\?B\?/.test(o.govde));
    assert.equal((await admin('POST', '/api/toplu/hedef', { kanal: 'mail', filtre: SADECE })).j.adet, 0);
  });
  await t('alıcı seçimi: bağışçı listesi ve yalnızca seçilenlere gönderim; WhatsApp özeti', async () => {
    const L = (await admin('GET', '/api/toplu/bagiscilar?kanal=sms')).j; assert.ok(L.liste.length >= 2 && L.uygun >= 2);
    const ara = (await admin('GET', '/api/toplu/bagiscilar?kanal=sms&q=' + encodeURIComponent(L.liste[0].ad.split(' ')[0]))).j; assert.ok(ara.liste.length >= 1);
    const ids = [L.liste[0].id, L.liste[1].id];
    assert.equal((await admin('POST', '/api/toplu/hedef', { kanal: 'sms', filtre: { ids } })).j.adet, 2);
    assert.equal((await admin('POST', '/api/toplu/hedef', { kanal: 'sms', filtre: { ids: [] } })).j.adet, 0);
    const o = (await admin('GET', '/api/wa/ozet')); assert.equal(o.s, 200); assert.equal(o.j.gun7.length, 7); assert.ok('okunmamis' in o.j && 'bekleyen' in o.j);
  });
  await t('SMS istemiyor / aranmak istemiyor + çağrı merkezi', async () => {
    const L = (await admin('GET', '/api/toplu/bagiscilar?kanal=sms')).j, b = L.liste[0];
    assert.equal((await admin('PUT', `/api/bagiscilar/${b.id}/izin`, { sms: 'ret', ara: 'ret' })).s, 200);
    const L2 = (await admin('GET', '/api/toplu/bagiscilar?kanal=sms')).j; assert.ok(!L2.liste.find(x => x.id === b.id)); const r = L2.retliste.find(x => x.id === b.id); assert.ok(r && !('hedef' in r) && !('tel' in r));
    assert.equal((await admin('POST', '/api/toplu/hedef', { kanal: 'sms', filtre: { ids: [b.id] } })).j.adet, 0);
    const ar = (await admin('GET', '/api/cagri/aranacak?gun=30')).j; assert.ok(!ar.liste.find(x => x.id === b.id)); assert.ok(ar.hariç >= 1);
    const b2 = ar.liste[0]; assert.equal((await admin('POST', '/api/cagri', { bagisci_id: b2.id, sonuc: 'Aranmak istemiyor', notu: 'x' })).s, 200);
    assert.ok(!(await admin('GET', '/api/cagri/aranacak?gun=30')).j.liste.find(x => x.id === b2.id));
    assert.equal((await admin('POST', '/api/cagri', { bagisci_id: b2.id, sonuc: 'yok' })).s, 400);
    const ay = (await admin('GET', '/api/cagri/ayar')).j; assert.ok(ay.anahtar.length >= 20);
    const wh = (k, body) => fetch(`${base}/api/cagri/webhook?anahtar=${k}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await wh('yanlis', { numara: '05' })).status, 403);
    const tel = b2.tel; const w = await wh(ay.anahtar, { numara: tel, yon: 'gelen', durum: 'missed', sure: 0 }); assert.equal(w.status, 200); assert.equal((await w.json()).eslesti, true);
    const k = (await admin('GET', '/api/cagri/kayit')).j; assert.ok(k.find(x => x.kaynak === 'santral' && x.sonuc === 'Cevapsız' && x.bagisci_id === b2.id));
    assert.equal((await admin('GET', '/api/cagri/ozet')).j.cevapsiz >= 1, true);
  });
  await t('Profilim: iç mesajlaşma ve görev takibi', async () => {
    const u1 = (await mkUser('mesajci1', 'Muhasebe')).q, u2 = (await mkUser('mesajci2', 'Muhasebe')).q;
    const k = (await u1('GET', '/api/profil/kisiler')).j; const hedef = k.find(x => x.ad === 'mesajci2'); assert.ok(hedef);
    assert.equal((await u1('POST', '/api/mesaj', { alici_id: hedef.id, konu: '', govde: 'x' })).s, 400);
    const m = (await u1('POST', '/api/mesaj', { alici_id: hedef.id, konu: 'Merhaba', govde: 'Toplantı saat 3' })).j;
    assert.equal((await u2('GET', '/api/profil/ozet')).j.mesaj, 1);
    assert.equal((await u2('GET', '/api/mesaj?kutu=gelen')).j.length, 1);
    assert.equal((await admin('GET', '/api/mesaj/' + m.id)).s, 404); // üçüncü kişi okuyamaz
    const d = (await u2('GET', '/api/mesaj/' + m.id)).j; assert.equal(d.dizi.length, 1); assert.equal((await u2('GET', '/api/profil/ozet')).j.mesaj, 0);
    assert.equal((await u2('POST', '/api/mesaj', { ust_id: m.id, govde: 'Tamam' })).s, 200); assert.equal((await u1('GET', '/api/mesaj/' + m.id)).j.dizi.length, 2);
    const g = (await u1('POST', '/api/gorev', { baslik: 'Raporu hazırla', atanan_id: hedef.id, son_tarih: '2020-01-01', oncelik: 'Yüksek' })).j;
    const o = (await u2('GET', '/api/profil/ozet')).j; assert.equal(o.gorev, 1); assert.equal(o.geciken, 1); assert.ok(o.mesaj >= 1); // atama bildirimi
    assert.equal((await u2('GET', '/api/gorev?kutu=bana')).j.length, 1);
    assert.equal((await admin('PUT', '/api/gorev/' + g.id, { durum: 'Tamamlandı' })).s, 404);
    assert.equal((await u2('PUT', '/api/gorev/' + g.id, { durum: 'Tamamlandı' })).s, 200); assert.equal((await u2('GET', '/api/profil/ozet')).j.gorev, 0);
    assert.equal((await u2('DELETE', '/api/gorev/' + g.id)).s, 404); assert.equal((await u1('DELETE', '/api/gorev/' + g.id)).s, 200);
  });
  await t('yetki: yeni birim varsayılan tam açık, kişi yetkisinde birim değerleri döner', async () => {
    const r = await admin('POST', '/api/birimler', { ad: 'Tam Yetkili Birim', kopya_id: -1 }); assert.equal(r.s, 201);
    const y = (await admin('GET', '/api/birimler/' + r.j.id + '/yetki')).j; assert.ok(Object.values(y).every(p => p.g && p.e && p.d && p.s));
    const uid = (await admin('GET', '/api/users')).j.find(x => x.kadi === 'mesajci1').id; const yy = (await admin('GET', `/api/users/${uid}/yetki`)).j; assert.ok(yy.birim && yy.birim.rapor);
  });
  await t('şube ve temsilcilikler: kayıt, doğrulama, bildirim uyarıları, vakıf/dernek', async () => {
    assert.equal((await admin('PUT', '/api/sube/ayar', { tur: 'xx' })).s, 400);
    assert.equal((await admin('POST', '/api/sube', { tur: 'Şube', ad: 'Ankara Şubesi' })).s, 400); // il zorunlu
    assert.equal((await admin('POST', '/api/sube', { tur: 'Kule', ad: 'x', il: 'Ankara' })).s, 400);
    assert.equal((await admin('POST', '/api/sube', { tur: 'Şube', ad: 'Ankara Şubesi', il: 'Ankara', acilis_tarihi: '2020-01-10', sorumlu: 'Ali Veli' })).s, 201);
    assert.equal((await admin('POST', '/api/sube', { tur: 'Şube', ad: 'ankara şubesi', il: 'Ankara' })).s, 409);
    assert.equal((await admin('POST', '/api/sube', { tur: 'Temsilcilik', ad: 'Berlin Temsilciliği', yurt_disi: true, ulke_id: 1, sorumlu: 'Ayşe', acilis_tarihi: '2024-05-01', bildirim_tarihi: '2024-05-10' })).s, 201);
    assert.equal((await admin('POST', '/api/sube', { tur: 'Temsilcilik', ad: 'Hatalı', yurt_disi: true, ulke_id: 99999 })).s, 400);
    assert.equal((await admin('POST', '/api/sube', { tur: 'Şube', ad: 'Bozuk Tarih', il: 'İzmir', acilis_tarihi: '31.12.2020' })).s, 400);
    let r = (await admin('GET', '/api/sube')).j; assert.equal(r.kurum, 'dernek'); const a = r.liste.find(x => x.ad === 'Ankara Şubesi'); assert.ok(a.uyari.some(u => u.t === 'er' && /bildirim/i.test(u.m)));
    assert.equal(r.liste.find(x => x.ad === 'Berlin Temsilciliği').uyari.length, 0);
    assert.equal((await admin('PUT', '/api/sube/ayar', { tur: 'vakif' })).s, 200); assert.equal((await admin('GET', '/api/sube')).j.kurum, 'vakif');
    assert.equal((await admin('PUT', '/api/sube/' + a.id, { ...a, bildirim_tarihi: '2020-01-20', durum: 'Kapalı' })).s, 200);
    r = (await admin('GET', '/api/sube')).j; const k = r.liste.find(x => x.id === a.id); assert.equal(k.durum, 'Kapalı'); assert.ok(k.kapanis_tarihi); assert.equal(k.uyari.length, 0);
    const u = (await mkUser('subeci1', 'Muhasebe')).q; assert.equal((await u('GET', '/api/sube')).s, 403);
  });
  await t('raporlama ve analiz: beş analiz uç noktası, yetki', async () => {
    const k = (await admin('GET', '/api/analiz/karsilastirma')); assert.equal(k.s, 200); assert.equal(k.j.seri.length, 13); assert.ok('aylik' in k.j.degisim && k.j.haftaninGunu.length === 7);
    const tr = (await admin('GET', '/api/analiz/tur')).j; assert.ok(Array.isArray(tr.kategori) && tr.aylar.length === 6);
    const b = (await admin('GET', '/api/analiz/bagisci')).j; assert.ok(b.seri.length === 12 && b.bant.length === 5 && 'g90' in b.pasif);
    const sa = (await admin('GET', '/api/analiz/saha')); assert.equal(sa.s, 200); assert.ok(Array.isArray(sa.j.org));
    const il = (await admin('GET', '/api/analiz/iletisim')); assert.equal(il.s, 200); assert.ok('ret' in il.j && 'wa' in il.j);
    const u = (await mkUser('analizci1', 'Çağrı merkezi')).q; for (const e of ['karsilastirma', 'tur', 'bagisci', 'saha', 'iletisim']) assert.equal((await u('GET', '/api/analiz/' + e)).s, 403);
  });
  await t('yeni bağışçı, dönem karşılaştırma, kazanım, gönüllü yönetimi', async () => {
    const r = await admin('POST', '/api/bagiscilar', { kod: '+90', tel: '0532 999 88 77', ad: 'Rehber Kişisi' }); assert.equal(r.s, 201, JSON.stringify(r.j));
    assert.equal((await admin('POST', '/api/bagiscilar', { kod: '+90', tel: '05329998877', ad: 'Aynı' })).s, 409);
    assert.equal((await admin('POST', '/api/bagiscilar', { kod: '+90', tel: '05329998866', ad: '' })).s, 400);
    const ym = new Date().toISOString().slice(0, 7), dn = await admin('GET', `/api/analiz/donem?a=${ym}&b=${(+ym.slice(0, 4) - 1)}-${ym.slice(5)}`); assert.equal(dn.s, 200); assert.ok(dn.j.a && dn.j.b && dn.j.a.gun.length === 31);
    assert.equal((await admin('GET', '/api/analiz/yillik')).s, 200);
    assert.ok('kazanim' in (await admin('GET', '/api/analiz/bagisci')).j);
    const g = { ad: 'Zeynep Kaya', tel: '0533 111 22 33', il: 'Ankara', medeni: 'Bekâr', cinsiyet: 'Kadın', dogum: '2000-05-01', alanlar: ['Saha ve organizasyon'], musait: [], durum: 'Aday', kvkk: true };
    assert.equal((await admin('POST', '/api/gonullu', { ...g, kvkk: false })).s, 400);
    const c = await admin('POST', '/api/gonullu', g); assert.equal(c.s, 201, JSON.stringify(c.j));
    assert.equal((await admin('POST', '/api/gonullu', g)).s, 409);
    assert.equal((await admin('GET', '/api/gonullu?medeni=' + encodeURIComponent('Bekâr') + '&il=Ankara')).j.adet, 1);
    assert.equal((await admin('GET', '/api/gonullu?medeni=Evli')).j.adet, 0);
    assert.equal((await admin('DELETE', '/api/gonullu/' + c.j.id)).s, 200);
    { const l = (await admin('GET', '/api/gonullu')).j; const x = l.liste.find(z => z.id === c.j.id); assert.ok(x && x.ad === 'Silinmiş kayıt' && x.durum === 'Pasif', 'gönüllü silinince kişisel bilgi gider, kayıt sayımlarda kalır'); }
    const u = (await mkUser('gonulsuz1', 'Çağrı merkezi')).q; assert.equal((await u('GET', '/api/gonullu')).s, 403);
  });
  await t('kalıcı eser: proje, sayaç, belge, not, web API, yetki', async () => {
    const ba = { ad: 'Çad Cami', tur: 'Cami', ulke: 'Çad', bolge: 'Ndjamena', alan: 450, hedef: 15000, para: 'USD', kur: 40, elle: 100, durum: 'Fon toplama', web: true };
    assert.equal((await admin('POST', '/api/eser', { ...ba, para: 'USD', kur: '' })).s, 400);
    assert.equal((await admin('POST', '/api/eser', { ...ba, partner: 'Yok Kurum' })).s, 400);
    const turF = await turId('Fitre'); const c = await admin('POST', '/api/eser', { ...ba, tur_ids: [turF] }); assert.equal(c.s, 201, JSON.stringify(c.j));
    const g = (await admin('GET', '/api/eser/' + c.j.id)).j; assert.ok(g.toplanan >= 100 && g.yuzde > 0 && g.hedef === 15000 && Array.isArray(g.dosyalar));
    const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 test').toString('base64');
    assert.equal((await admin('POST', `/api/eser/${c.j.id}/dosya`, { ad: 'plan.pdf', tip: 'Çizim / plan', veri: pdf })).s, 201);
    assert.equal((await admin('POST', `/api/eser/${c.j.id}/dosya`, { ad: 'x.pdf', tip: 'Çizim / plan', veri: 'data:application/pdf;base64,' + Buffer.from('MZ not pdf').toString('base64') })).s, 400);
    const d = (await admin('GET', '/api/eser/' + c.j.id)).j.dosyalar; assert.equal(d.length, 1);
    assert.equal((await admin('POST', `/api/eser/${c.j.id}/not`, { metin: 'Temel atıldı', ilerleme: 15 })).s, 201); assert.equal((await admin('GET', '/api/eser/' + c.j.id)).j.ilerleme, 15);
    const k = (await admin('POST', '/api/entegre/anahtar', { ad: 'Eser sitesi' })).j.anahtar, hd = { 'x-api-key': k };
    assert.equal((await fetch(base + '/api/dis/kalici-eser')).status, 401); const pj = await (await fetch(base + '/api/dis/kalici-eser', { headers: hd })).json(); assert.equal(pj.length, 1); assert.equal(pj[0].insaat_yuzde, 15); assert.ok(!('sorumlu_tel' in pj[0]));
    const u = (await mkUser('eserci1', 'Çağrı merkezi')).q; assert.equal((await u('GET', '/api/eser')).s, 403);
    assert.equal((await admin('DELETE', '/api/eser/' + c.j.id)).s, 409, 'bağış toplanmış proje silinemez (geçmiş rapor korunur)'); assert.equal((await admin('GET', '/api/eser')).j.liste.length, 1);
    { const bos = await admin('POST', '/api/eser', { ...ba, ad: 'Boş proje', tur_ids: [], elle: 0 }); assert.equal(bos.s, 201, JSON.stringify(bos.j)); assert.equal((await admin('DELETE', '/api/eser/' + bos.j.id)).s, 200); }
  });
  await t('sponsorluk: öğrenci kartı, sponsor atama, taksit/gecikme, hatırlatma, kart linki, sertifika', async () => {
    const ob = { ad: 'Ahmed Musa', cinsiyet: 'Erkek', ulke: 'Çad', bolge: 'Ndjamena', dogum: '2012-03-04', yetim: true, hafiz: true, yetim_durum: 'Babasız (yetim)', okul_tur: 'Medrese', okul_ad: 'Nur Medresesi', cuz: 5, yer: 'Dernek' };
    assert.equal((await admin('POST', '/api/sp/ogrenci', { ...ob, yetim: false, hafiz: false })).s, 400);
    assert.equal((await admin('POST', '/api/sp/ogrenci', { ...ob, ulke: 'Yokistan' })).s, 400);
    for (const eks of [{ cinsiyet: '' }, { ulke: '' }, { dogum: '', yas_elle: '' }, { yetim_durum: '' }, { okul_tur: '' }, { okul_tur: 'Medrese', okul_ad: '' }]) assert.equal((await admin('POST', '/api/sp/ogrenci', { ...ob, ...eks })).s, 400, JSON.stringify(eks));
    const o = await admin('POST', '/api/sp/ogrenci', ob); assert.equal(o.s, 201, JSON.stringify(o.j));
    const png = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('xxxx')]).toString('base64');
    assert.equal((await admin('POST', `/api/sp/ogrenci/${o.j.id}/medya`, { ad: 'f.png', veri: png })).s, 201);
    assert.equal((await admin('POST', `/api/sp/ogrenci/${o.j.id}/medya`, { ad: 'f.png', veri: 'data:image/png;base64,' + Buffer.from('nopenope').toString('base64') })).s, 400);
    const bg = (await admin('POST', '/api/bagiscilar', { kod: '+90', tel: '0535 444 55 66', ad: 'Sponsor Ayşe' })).j.id;
    const cok = (await admin('GET', '/api/sp/ogrenci')).j; assert.equal(cok.ozet.bekleyen, 1);
    const eski = new Date(); eski.setMonth(eski.getMonth() - 4); const bas = eski.toISOString().slice(0, 10);
    assert.equal((await admin('POST', '/api/sp/sponsorluk', { ogrenci_id: o.j.id, bagisci_id: 999999, sure: 12, aylik: 500 })).s, 400);
    const sp = await admin('POST', '/api/sp/sponsorluk', { ogrenci_id: o.j.id, bagisci_id: bg, sure: 12, aylik: 500, para: 'TL', baslangic: bas, ilk_odeme: { tutar: 500, odeme: 'Nakit' } }); assert.equal(sp.s, 201, JSON.stringify(sp.j)); assert.ok(/sponsor\.html\?t=[a-f0-9]{24}/.test(sp.j.link));
    assert.equal((await admin('POST', '/api/sp/sponsorluk', { ogrenci_id: o.j.id, bagisci_id: bg, sure: 12, aylik: 500 })).s, 409);
    let d = (await admin('GET', '/api/sp/sponsorluk/' + sp.j.id)).j; assert.equal(d.odenen, 500); assert.ok(d.gecikme_ay >= 3 && d.odeme_durum === 'Gecikmiş', JSON.stringify([d.gecikme_ay, d.odeme_durum]));
    let rp = (await admin('GET', '/api/sp/rapor')).j; assert.equal(rp.kpi.gecikmis, 1); assert.equal(rp.odemeyenler.length, 1);
    { // önizleme göndermeden metni verir, SMS kaydı oluşturmaz
      const nSms = (await admin('GET', '/api/sms')).j.length, o1 = await admin('GET', `/api/sp/sponsorluk/${sp.j.id}/onizleme?tip=hatirlat`), o2 = await admin('GET', `/api/sp/sponsorluk/${sp.j.id}/onizleme?tip=link`);
      assert.equal(o1.s, 200); assert.ok(o1.j.mesaj && !/\{\w+\}/.test(o1.j.mesaj) && o1.j.tel); assert.equal(o2.s, 200); assert.ok(/sertifika|kart|sp|http/i.test(o2.j.mesaj));
      assert.equal((await admin('GET', '/api/sms')).j.length, nSms, 'önizleme SMS göndermemeli');
    }
    { const hr = await admin('POST', `/api/sp/sponsorluk/${sp.j.id}/hatirlat`); assert.equal(hr.s, 200, JSON.stringify(hr.j)); }
    assert.equal((await admin('POST', '/api/sp/hatirlat-toplu', { esik: 2 })).j.gonderilen, 0); // bugün zaten hatırlatıldı
    assert.equal((await admin('POST', `/api/sp/sponsorluk/${sp.j.id}/odeme`, { tutar: 2000, odeme: 'Nakit' })).s, 201);
    d = (await admin('GET', '/api/sp/sponsorluk/' + sp.j.id)).j; assert.ok(d.gecikme_ay === 0 && d.odeme_durum === 'Güncel'); assert.ok(d.odemeler.every(x => x.bagis_no));
    assert.ok((await admin('GET', '/api/bagislar?kat=Sponsorluk')).j.liste.length >= 2);
    const tok = sp.j.link.split('t=')[1], pub = await fetch(base + '/api/sp/kart/' + tok); assert.equal(pub.status, 200); const kj = await pub.json(); assert.equal(kj.ogrenci.ad, 'Ahmed Musa'); assert.ok(!('kimlik' in kj.ogrenci)); assert.equal(kj.medya.length, 1);
    assert.equal((await fetch(base + `/api/sp/pmedya/${tok}/${kj.medya[0].id}`)).headers.get('content-type'), 'image/png'); assert.equal((await fetch(base + '/api/sp/kart/' + 'a'.repeat(24))).status, 404);
    assert.equal((await admin('POST', `/api/sp/ogrenci/${o.j.id}/not`, { metin: 'Bakara tamamlandı', cuz: 6, bildir: true })).j.bildirilen, 1);
    assert.equal((await admin('POST', `/api/sp/ogrenci/${o.j.id}/tamamla`, { tur: 'Hafızlığı', bildir: true })).j.bildirilen, 1);
    const g = (await admin('GET', '/api/sp/ogrenci/' + o.j.id)).j; assert.equal(g.durum, 'Tamamladı'); assert.equal(g.cuz, 30);
    assert.ok((await admin('GET', '/api/sms')).j.some(x => x.sablon === 'sptamam'));
    { const sm = (await admin('GET', '/api/sms')).j.find(x => x.sablon === 'sptamam'); assert.ok(sm.mesaj.includes('/sertifika/' + tok + '?k=tamam'), 'tamamlama bağlantısı sertifika sayfası');
      const ph = await (await fetch(base + '/sertifika/' + tok + '?k=tamam')).text(); assert.ok(ph.includes('Tamamlama Sertifikası') && ph.includes('Ahmed Musa') && ph.includes('Hafızlık Sponsorluğu'));
      const bh = await (await fetch(base + '/sertifika/' + tok)).text(); assert.ok(bh.includes('Sponsorluk Belgesi') && bh.includes('Ahmed Musa'));
      assert.equal((await admin('POST', `/api/sp/sponsorluk/${sp.j.id}/belge`, { k: 'sms' })).s, 200); assert.ok((await admin('GET', '/api/sms')).j.some(x => x.sablon === 'spbelge' && x.mesaj.includes('?k=belge')));
      const wb = await admin('POST', `/api/sp/sponsorluk/${sp.j.id}/belge`, { k: 'wa' }); assert.equal(wb.s, 200); assert.ok(wb.j.link.startsWith('https://wa.me/'));
      assert.equal((await admin('POST', '/api/sp/sponsorluk/99999/belge', {})).s, 404); }
    assert.equal((await admin('DELETE', '/api/sp/ogrenci/' + o.j.id)).s, 409);
    assert.equal((await admin('POST', `/api/sp/sponsorluk/${sp.j.id}/iptal`)).s, 200);
    const u = (await mkUser('sponsorsuz1', 'Çağrı merkezi')).q; for (const e of ['ogrenci', 'sponsorluk', 'rapor']) assert.equal((await u('GET', '/api/sp/' + e)).s, 403);
  });
  await t('banka hareketleri: içe aktarma, öneri, tamamlama, öğrenme, API, arama', async () => {
    const hs = (await admin('GET', '/api/banka')).j.hesaplar[0], hid = hs.id;
    const mkB = async (tel, ad) => (await admin('POST', '/api/bagiscilar', { kod: '+90', tel, ad })).j.id;
    const bA = await mkB('0537 100 00 01', 'Mehmet Yılmaz'), bB = await mkB('0537 100 00 02', 'Fatma Öz');
    const o1 = (await admin('POST', '/api/sp/ogrenci', { ad: 'Çocuk Bir', cinsiyet: 'Kız', yas_elle: 9, ulke: 'Çad', yetim: true, yetim_durum: 'Anasız', okul_tur: 'Henüz okula gitmiyor' })).j.id;
    const spn = (await admin('POST', '/api/sp/sponsorluk', { ogrenci_id: o1, bagisci_id: bA, sure: 12, aylik: 400, para: 'TL' })).j.id, kod = (await admin('GET', '/api/sp/sponsorluk/' + spn)).j.kod;
    const bg = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10).split('-').reverse().join('.');
    const csv = ['Tarih;Açıklama;Gönderen;Tutar', `${bg};Burs ${kod};Mehmet Y.;400,00`, `${bg};Fitre;FATMA ÖZ;150,00`, `${bg};Havale 0537 100 00 01;ZZ;75,50`, `${bg};kira;Bilinmeyen A.Ş.;5.000,00`, `${bg};Çıkış;X;-100,00`].join('\n');
    assert.equal((await admin('POST', '/api/banka/ice-aktar', { hesap_id: hid, metin: 'bozuk\nveri bozuk veri bozuk' })).s, 400);
    const ia = (await admin('POST', '/api/banka/ice-aktar', { hesap_id: hid, metin: csv })).j; assert.equal(ia.eklenen, 4); assert.equal(ia.atlanan, 1);
    assert.equal((await admin('POST', '/api/banka/ice-aktar', { hesap_id: hid, metin: csv })).j.tekrar, 4); // aynı ekstre iki kez yüklenirse çoğalmaz
    let L = (await admin('GET', '/api/banka/hareketler')).j; assert.equal(L.ozet.bekliyor.n, 4);
    const hr = (a) => L.liste.find(x => x.aciklama.includes(a) || x.gonderen.includes(a));
    assert.equal(hr('Mehmet').oneri.tip, 'sponsorluk'); assert.equal(hr('Mehmet').oneri.sponsorluk_id, spn); assert.equal(hr('Mehmet').oneri.guven, 'yuksek');
    assert.equal(hr('FATMA').oneri.bagisci_id, bB); assert.equal(hr('FATMA').oneri.guven, 'orta'); assert.ok(hr('FATMA').oneri.tur_id); // “Fitre” → tür önerisi
    assert.equal(hr('ZZ').oneri.bagisci_id, bA); assert.equal(hr('Bilinmeyen').oneri.tip, null);
    // hiçbiri kendiliğinden bağış olmamalı
    assert.equal((await admin('GET', '/api/bagislar')).j.liste.filter(x => x.kaynak === 'Banka').length, 0);
    assert.equal((await admin('POST', `/api/banka/hareketler/${hr('FATMA').id}/tamamla`, { bagisci_id: bB })).s, 400); // tür yok
    const fit = await turId('Fitre'), t1 = await admin('POST', `/api/banka/hareketler/${hr('FATMA').id}/tamamla`, { bagisci_id: bB, tur_id: fit }); assert.equal(t1.s, 200, JSON.stringify(t1.j)); assert.ok(t1.j.bagis_no);
    assert.equal((await admin('POST', `/api/banka/hareketler/${hr('FATMA').id}/tamamla`, { bagisci_id: bB, tur_id: fit })).s, 409);
    const t2 = await admin('POST', `/api/banka/hareketler/${hr('Mehmet').id}/tamamla`, { sponsorluk_id: spn }); assert.equal(t2.s, 200); assert.equal((await admin('GET', '/api/sp/sponsorluk/' + spn)).j.odenen, 400);
    const t3 = await admin('POST', `/api/banka/hareketler/${hr('Bilinmeyen').id}/tamamla`, { yeni: { ad: 'Yeni Kişi', tel: '0538 222 33 44' }, tur_id: fit }); assert.equal(t3.s, 200);
    assert.ok((await admin('GET', '/api/bagiscilar?q=Yeni Ki')).j.length >= 1);
    assert.equal((await admin('POST', `/api/banka/hareketler/${hr('ZZ').id}/yoksay`, {})).s, 400); assert.equal((await admin('POST', `/api/banka/hareketler/${hr('ZZ').id}/yoksay`, { sebep: 'Bağış değil' })).s, 200);
    L = (await admin('GET', '/api/banka/hareketler')).j; assert.equal(L.ozet.bekliyor.n, 0); assert.equal(L.ozet.tamam.n, 3);
    assert.equal((await admin('GET', '/api/bagislar?kat=Genel bağış')).j.liste.some(x => x.kaynak === 'Banka'), true);
    // öğrenme: aynı gönderen bir sonraki ay
    const ay2 = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4 - 864e5).toISOString().slice(0, 10).split('-').reverse().join('.');
    await admin('POST', '/api/banka/ice-aktar', { hesap_id: hid, metin: `Tarih;Açıklama;Gönderen;Tutar\n${ay2};EFT;FATMA ÖZ;200,00` });
    const o2 = (await admin('GET', '/api/banka/hareketler')).j.liste[0].oneri; assert.equal(o2.bagisci_id, bB); assert.ok(o2.nedenler[0].includes('Daha önce'));
    // API ucu + MT940
    const k = (await admin('POST', '/api/entegre/anahtar', { ad: 'Banka bağlayıcı' })).j.anahtar, hd = { 'content-type': 'application/json', 'x-api-key': k };
    assert.equal((await fetch(base + '/api/dis/banka-hareket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
    const ar = await (await fetch(base + '/api/dis/banka-hareket', { method: 'POST', headers: hd, body: JSON.stringify({ iban: hs.iban, hareketler: [{ tarih: ay2.split('.').reverse().join('-'), tutar: 99, gonderen: 'API Kişi', aciklama: 'test', ref: 'R1' }] }) })).json(); assert.equal(ar.eklenen, 1);
    const yy = ay2.split('.').reverse().join('-'), mt = `:20:STMT\n:25:TR33\n:60F:C261101TRY0,00\n:61:${yy.slice(2, 4)}${yy.slice(5, 7)}${yy.slice(8, 10)}${yy.slice(5, 7)}${yy.slice(8, 10)}C321,50NTRFNONREF//AB1\n:86:EFT GELEN MEHMET YILMAZ burs\n:61:${yy.slice(2, 4)}${yy.slice(5, 7)}${yy.slice(8, 10)}D10,00NTRFNONREF\n:86:giden\n:62F:C261101TRY0,00`;
    const mi = (await admin('POST', '/api/banka/ice-aktar', { hesap_id: hid, metin: mt })).j; assert.equal(mi.format, 'MT940'); assert.equal(mi.eklenen, 1);
    // arama
    const ra = async (q) => (await admin('GET', '/api/ara?q=' + encodeURIComponent(q))).j;
    for (const q of ['0537 100 00 01', '+90 537 100', '537100000', '5371000001']) assert.ok((await ra(q)).some(x => x.tip === 'bagisci' && x.id === bA), q);
    assert.ok((await ra('mehmet yilmaz')).some(x => x.tip === 'bagisci')); assert.ok((await ra(kod.toLowerCase())).some(x => x.tip === 'sponsorluk')); assert.ok((await ra('cocuk bir')).some(x => x.tip === 'ogrenci'));
    assert.deepEqual(await ra('a'), []); const u = (await mkUser('arayici1', 'Çağrı merkezi')).q; assert.ok(!(await u('GET', '/api/ara?q=Cocuk')).j.some(x => x.tip === 'ogrenci')); assert.equal((await u('GET', '/api/banka/hareketler')).s, 403);
    assert.ok((await admin('GET', '/api/ana')).j.isler.some(x => x.k === 'bhar'));
  });
  await t('WhatsApp: şablonlu toplu gönderim, webhook imzası, gelen kutusu, 24 saat kuralı', async () => {
    assert.equal((await admin('PUT', '/api/iletisim/ayar', { wa: { phone_id: 'PID', token: 'TOK', app_secret: 'sir', api_url: `http://127.0.0.1:${mport}/v21`, sablonlar: [{ ad: 'Bagis Duyuru', dil: 'tr', govde: 'Merhaba {{1}}', n: 1 }] } })).s, 200);
    const ay = (await admin('GET', '/api/iletisim/ayar')).j.ayar; assert.equal(ay.wa.sablonlar[0].ad, 'bagis_duyuru'); assert.equal(ay.wa.token, '');
    assert.equal((await admin('POST', '/api/toplu', { kanal: 'wa', sablon: 'yok', onay: true, filtre: SADECE })).s, 400);
    const r = await admin('POST', '/api/toplu', { kanal: 'wa', sablon: 'bagis_duyuru', degisken: ['ad'], onay: true, filtre: { ...SADECE, liste: 'Ayşe Demir;+90 555 111 22 33' } }); assert.equal(r.s, 201); const g = await bekleG(r.j.id); assert.equal(g.gonderildi, 1);
    const w = waGelen[waGelen.length - 1]; assert.equal(w.url, '/v21/PID/messages'); assert.equal(w.auth, 'Bearer TOK'); assert.equal(w.j.template.name, 'bagis_duyuru'); assert.equal(w.j.template.components[0].parameters[0].text, 'Ayşe'); assert.equal(w.j.to, '905551112233');
    const web = async (m, p, body, imza) => fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(imza ? { 'X-Hub-Signature-256': imza } : {}) }, body });
    const vt = ay.wa.verify; assert.equal(await (await fetch(`${base}/api/wa/webhook?hub.mode=subscribe&hub.verify_token=${vt}&hub.challenge=4242`)).text(), '4242'); assert.equal((await fetch(`${base}/api/wa/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`)).status, 403);
    const gelen = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [{ wa_id: '905551112233', profile: { name: 'Ayşe D.' } }], messages: [{ from: '905551112233', id: 'wamid.IN1', type: 'text', text: { body: 'Selamünaleyküm, makbuzumu alabilir miyim?' } }], statuses: [{ id: 'wamid.T' + waGelen.length, status: 'delivered' }] } }] }] });
    assert.equal((await web('POST', '/api/wa/webhook', gelen, 'sha256=00')).status, 403);
    assert.equal((await web('POST', '/api/wa/webhook', gelen, 'sha256=' + crypto.createHmac('sha256', 'sir').update(gelen).digest('hex'))).status, 200);
    const kon = (await admin('GET', '/api/wa/konusmalar')).j; assert.equal(kon.length, 1); assert.equal(kon[0].okunmamis, 1); assert.equal(kon[0].pencere, true); assert.equal(kon[0].bekliyor, true);
    assert.equal((await admin('GET', '/api/toplu/' + r.j.id)).j.alicilar[0].durum, 'Teslim edildi');
    assert.equal((await admin('POST', '/api/wa/yanit', { tel: '905551112233', metin: 'Aleykümselam, gönderiyoruz.' })).s, 200); assert.equal(waGelen[waGelen.length - 1].j.type, 'text');
    { const k = (await admin('GET', '/api/wa/konusmalar')).j[0]; assert.equal(k.sorumlu_ad != null, true, 'yanıtlayan otomatik üstlenir'); const ekip = (await admin('GET', '/api/wa/ekip')).j; assert.ok(ekip.length >= 1);
      assert.equal((await admin('PUT', '/api/wa/atama', { tel: '905551112233', kullanici_id: null })).s, 200); assert.equal((await admin('GET', '/api/wa/konusmalar')).j[0].sorumlu, null);
      assert.equal((await admin('PUT', '/api/wa/atama', { tel: '905551112233', kullanici_id: ekip[0].id })).s, 200); assert.equal((await admin('GET', '/api/wa/konusmalar')).j[0].sorumlu, ekip[0].id);
      assert.equal((await admin('PUT', '/api/wa/atama', { tel: '905559999999', kullanici_id: ekip[0].id })).s, 404); assert.equal((await admin('PUT', '/api/wa/atama', { tel: '905551112233', kullanici_id: 99999 })).s, 400); }
    assert.equal((await admin('GET', '/api/wa/konusma?tel=905551112233')).j.mesajlar.length, 2); assert.equal((await admin('GET', '/api/wa/konusmalar')).j[0].okunmamis, 0);
  });
  await t('banka hesabı: resmî ünvan, şube/hesap no, düzenleme', async () => {
    const L = (await admin('GET', '/api/banka')).j; assert.equal(L.bilgi['Ziraat Bankası'][0], 'T.C. Ziraat Bankası A.Ş.'); assert.ok(L.bilgi['Garanti BBVA'][1].startsWith('#'));
    const r = await admin('POST', '/api/banka', { banka: 'Akbank', hesap: 'Şube Hesabı', sube: 'Fatih Şubesi', hesap_no: '12345678', iban: 'TR280001009999901234567890', para: 'TL' });
    assert.equal(r.s, 201); { const h = (await admin('GET', '/api/banka')).j.hesaplar.find(x => x.id === r.j.id); assert.equal(h.sube, 'Fatih Şubesi'); assert.equal(h.hesap_no, '12345678'); assert.equal((await admin('PUT', '/api/banka/' + r.j.id, { hesap: 'Yeni ad', sube: 'Kadıköy', hesap_no: '99' })).s, 200); assert.equal((await admin('GET', '/api/banka')).j.hesaplar.find(x => x.id === r.j.id).sube, 'Kadıköy'); assert.equal((await admin('PUT', '/api/banka/' + r.j.id, { hesap: '' })).s, 400); }
  });
  await t('kurum bilgileri: giriş ekranı için herkese açık, düzenleme yetkili', async () => {
    assert.equal((await mk()('GET', '/api/kurum')).s, 200);
    assert.equal((await mk()('GET', '/api/kurum/bilgi')).s, 401);
    assert.equal((await admin('PUT', '/api/kurum/bilgi', { ad: 'Deneme Derneği', tel: '0212 000 00 00', eposta: 'bozuk' })).s, 400);
    assert.equal((await admin('PUT', '/api/kurum/bilgi', { ad: 'Deneme Derneği', kisa: 'Deneme', tel: '0212 000 00 00', eposta: 'info@deneme.org', web: 'www.deneme.org', logo: 'javascript:alert(1)' })).s, 400);
    assert.equal((await admin('PUT', '/api/kurum/bilgi', { ad: 'Deneme Derneği', kisa: 'Deneme', tel: '0212 000 00 00', eposta: 'info@deneme.org', web: 'www.deneme.org', logo: 'data:image/png;base64,iVBORw0KGgo=' })).s, 200);
    assert.equal((await admin('GET', '/api/sablonlar')).j.dernek, 'Deneme');
    const k = (await mk()('GET', '/api/kurum')).j; assert.equal(k.ad, 'Deneme Derneği'); assert.ok(k.logo.startsWith('data:image/png'));
    assert.equal((await admin('PUT', '/api/kurum/bilgi', { ad: 'Deneme Derneği', logo_sil: 1 })).s, 200); assert.equal((await mk()('GET', '/api/kurum')).j.logo, '');
  });
  await t('bağışçı Excel: örnek, indir, aktar (önizleme/onay), tekrar, hata, güncelle', async () => {
    const X = require('./xlsx'), b64 = (a) => X.yaz([{ ad: 'Bağışçılar', satirlar: a, metinSutun: [1] }]).toString('base64');
    const orn = (await admin('GET', '/api/bagisci-excel/ornek')).j; assert.ok(orn.ad.endsWith('.xlsx')); const o = X.oku(Buffer.from(orn.dosya, 'base64')); assert.equal(o.satirlar[0][0], 'Ad Soyad *'); assert.equal(o.satirlar.length, 4);
    const dosya = b64([['Ad Soyad *', 'Telefon *', 'E-posta', 'Adres'], ['Excel Bir', '0541 777 00 01', 'bir@x.com', 'Konya'], ['Excel İki', '+90 541 777 00 02', '', ''], ['Excel Üç', '5417770003', '', ''], ['Hans Ex', '+49 151 7770004', '', ''], ['Hatalı Tel', '123', '', ''], ['', '0541 777 00 09', '', ''], ['Bozuk Mail', '0541 777 00 05', 'bozuk', ''], ['Çift', '541 777 00 01', '', ''], ['', '', '', '']]);
    const on = (await admin('POST', '/api/bagisci-excel/aktar', { dosya, mod: 'onizle' })).j; assert.equal(on.onizleme, true); assert.equal(on.ozet.yeni, 4); assert.equal(on.ozet.hatali, 3); assert.equal(on.ozet.atlanan, 1); assert.equal(on.ozet.bos, 1);
    assert.equal((await admin('GET', '/api/bagiscilar?q=' + encodeURIComponent('Excel'))).j.length, 0); // önizleme kayıt yapmaz
    const ak = (await admin('POST', '/api/bagisci-excel/aktar', { dosya, mod: 'aktar' })).j; assert.equal(ak.ozet.eklendi, 4);
    const L = (await admin('GET', '/api/bagiscilar?q=' + encodeURIComponent('Excel'))).j; assert.equal(L.length, 3); assert.ok(L.some(x => x.tel === '+905417770003'));
    assert.ok((await admin('GET', '/api/bagiscilar?q=Hans')).j.some(x => x.tel === '+491517770004'));
    const tekrar = (await admin('POST', '/api/bagisci-excel/aktar', { dosya, mod: 'onizle' })).j; assert.equal(tekrar.ozet.yeni, 0); assert.equal((await admin('POST', '/api/bagisci-excel/aktar', { dosya, mod: 'aktar' })).s, 400);
    const g = b64([['Ad Soyad', 'Telefon', 'Eposta'], ['Excel Bir Yeni', '541 777 00 01', 'yeni@x.com']]);
    assert.equal((await admin('POST', '/api/bagisci-excel/aktar', { dosya: g, mod: 'aktar' })).s, 400); // güncelle kapalıyken yapılacak iş yok
    assert.equal((await admin('POST', '/api/bagisci-excel/aktar', { dosya: g, mod: 'aktar', mevcut: 'guncelle' })).j.ozet.guncellendi, 1);
    const b1 = (await admin('GET', '/api/bagiscilar?q=' + encodeURIComponent('Excel Bir Yeni'))).j[0]; assert.equal(b1.eposta, 'yeni@x.com'); assert.equal(b1.adres, 'Konya'); // boş gelen alan eskiyi silmez
    assert.equal((await admin('POST', '/api/bagisci-excel/aktar', { dosya: Buffer.from('yok').toString('base64'), mod: 'onizle' })).s, 400);
    assert.equal((await admin('POST', '/api/bagisci-excel/aktar', { dosya: b64([['Foo', 'Bar'], ['a', 'b']]), mod: 'onizle' })).s, 400);
    const ind = (await admin('GET', '/api/bagisci-excel/indir')).j, ix = X.oku(Buffer.from(ind.dosya, 'base64')); assert.equal(ix.satirlar[0][0], 'Ad Soyad'); assert.ok(ix.satirlar.length >= 5); assert.ok(ix.satirlar.some(r => r[1] === '+905417770002'));
    const yx = await mkUser('xlsxkul', 'Çağrı merkezi'); await admin('PUT', `/api/users/${yx.id}/yetki`, { ozel: { bagisci: { g: 0, e: 0, d: 0, s: 0 } } });
    assert.equal((await yx.q('GET', '/api/bagisci-excel/indir')).s, 403); assert.equal((await yx.q('POST', '/api/bagisci-excel/aktar', { dosya, mod: 'onizle' })).s, 403);
  });
  await t('analiz saha: videolu bağış bölümü', async () => {
    const d = (await admin('GET', '/api/analiz/saha')).j; assert.ok(d.video); assert.equal(d.video.asama.length, 6); assert.ok(Array.isArray(d.video.projeler)); assert.equal(d.video.aylik.length, 6);
    assert.equal(d.video.birim, d.video.asama.reduce((a, b) => a + b, 0));
  });
  await t('kalıcı eser: sabit ana kategori, proje altında alt kategori açılır, zorunlu alanlar', async () => {
    const T0 = (await admin('GET', '/api/turler')).j; assert.ok(T0.kategoriler.includes('Kalıcı Eser'));
    assert.equal((await admin('DELETE', '/api/kategoriler?ad=' + encodeURIComponent('Kalıcı Eser'))).s, 409);
    assert.equal((await admin('PUT', '/api/kategoriler', { eski: 'Kalıcı Eser', yeni: 'X' })).s, 409);
    assert.equal((await admin('POST', '/api/kategoriler', { ad: 'Eski Ad Kat' })).s, 201);
    const tk = (await admin('POST', '/api/turler', { sec: 'genel', kat: 'Eski Ad Kat', ad: 'Eski Tür' })).j;
    assert.equal((await admin('PUT', '/api/kategoriler', { eski: 'Eski Ad Kat', yeni: 'Yeni Ad Kat' })).s, 200);
    assert.equal((await admin('PUT', '/api/turler/' + tk.id, { ad: 'Yeni Tür' })).s, 200);
    const Tz = (await admin("GET", "/api/turler")).j; assert.ok(Tz.kategoriler.includes("Yeni Ad Kat") && !Tz.kategoriler.includes("Eski Ad Kat"));
    assert.ok(Tz.turler.some(x => x.id === tk.id && x.kat === 'Yeni Ad Kat' && x.ad === 'Yeni Tür'));
    assert.equal((await admin('PUT', '/api/kategoriler', { eski: 'Yeni Ad Kat', yeni: 'Kurban' })).s, 409);
    const wb = (await admin('GET', '/api/bagislar?limit=1')).j; const wl = Array.isArray(wb) ? wb : (wb.liste || wb.bagislar || []);
    if (wl.length) { const w = await admin('GET', `/api/bagislar/${wl[0].id}/wa`); assert.equal(w.s, 200, JSON.stringify(w.j)); assert.ok(/^https:\/\/wa\.me\/\d{7,15}\?text=/.test(w.j.link) && w.j.mesaj.length > 10); assert.equal((await admin('POST', `/api/bagislar/${wl[0].id}/sms`, {})).s, 200); }
    assert.equal((await admin('GET', '/api/bagislar/999999/wa')).s, 404);
    if (wl.length) { const m = await admin('GET', `/api/bagislar/${wl[0].id}/mesaj`); assert.equal(m.s, 200); assert.ok(m.j.b.mesaj.length > 10 && typeof m.j.b.uygun === 'boolean'); }
    assert.equal((await admin('GET', '/api/org/pay/999999/mesaj')).s, 404);
    assert.equal((await admin('POST', '/api/org/pay/999999/sms', { k: 'b' })).s, 404); assert.equal((await admin('GET', '/api/org/pay/999999/wa?k=b')).s, 404);
    const b = { ad: 'Nijer Niamey Camii', tur: 'Cami', durum: 'Planlama', ulke: 'Nijer', para: 'USD', kur: 35, hedef: 50000 };
    assert.equal((await admin('POST', '/api/eser', { ...b, hedef: 0 })).s, 400); assert.equal((await admin('POST', '/api/eser', { ...b, ulke: '' })).s, 400);
    const r = await admin('POST', '/api/eser', { ...b, tur_ac: true }); assert.equal(r.s, 201, JSON.stringify(r.j));
    const T1 = (await admin('GET', '/api/turler')).j, tr = T1.turler.find(x => x.kat === 'Kalıcı Eser' && x.ad === 'Nijer Niamey Camii'); assert.ok(tr);
    assert.deepEqual((await admin('GET', '/api/eser/' + r.j.id)).j.tur_ids, [tr.id]);
    const r2 = await admin('POST', '/api/eser', { ...b, tur_ac: true }); assert.equal(r2.s, 201); assert.deepEqual((await admin('GET', '/api/eser/' + r2.j.id)).j.tur_ids, [tr.id]); // aynı ad: alt kategori tekrar açılmaz
  });
  await t('bildirim: sayaçlar yetkiye göre süzülür', async () => {
    const a = (await admin('GET', '/api/bildirim')).j; assert.ok('twa' in a.sayac && 'cagri' in a.sayac && 'mesaj' in a.sayac && 'gorev' in a.sayac);
    const u = await mkUser('bildkul', 'Çağrı merkezi'); await admin('PUT', `/api/users/${u.id}/yetki`, { ozel: { twa: { g: 0, e: 0, d: 0, s: 0 }, cagri: { g: 0, e: 0, d: 0, s: 0 } } });
    const b = (await u.q('GET', '/api/bildirim')).j; assert.ok(!('twa' in b.sayac)); assert.ok(!('cagri' in b.sayac)); assert.ok(!b.son.wa && !b.son.cagri); assert.ok('mesaj' in b.sayac);
    assert.equal((await mk()('GET', '/api/bildirim')).s, 401);
  });
  await t('yanıt uyarısı: ayar doğrulama ve test gönderimi', async () => {
    assert.equal((await admin('PUT', '/api/iletisim/uyari', { acik: true, esik: 5, saat: 2, cagri_esik: 3, kanal: 'sms', tekrar_saat: 6, alicilar: [] })).s, 400);
    assert.equal((await admin('PUT', '/api/iletisim/uyari', { acik: false, esik: 0, saat: 2, cagri_esik: 3, kanal: 'sms', tekrar_saat: 6, alicilar: [] })).s, 400);
    const me = (await admin('GET', '/api/me')).j.user; assert.equal((await admin('PUT', '/api/iletisim/uyari', { acik: true, esik: 5, saat: 2, cagri_esik: 3, kanal: 'ikisi', tekrar_saat: 6, alicilar: [me.id] })).s, 200);
    const g = (await admin('GET', '/api/iletisim/uyari')).j; assert.equal(g.ayar.acik, true); assert.deepEqual(g.ayar.alicilar, [me.id]); assert.equal(g.kullanicilar.length >= 1, true);
    const d = await admin('POST', '/api/iletisim/uyari/dene'); assert.ok(d.s === 200 || d.s === 409, JSON.stringify(d.j));
  });
  await t('bağışçı profili: bağış ayrıntısı ve tür dağılımı', async () => {
    const L = (await admin('GET', '/api/bagiscilar')).j, id = (L.find(x => x.adet > 0) || L[0]).id, p = (await admin('GET', '/api/bagiscilar/' + id)).j;
    assert.ok(p.detay && typeof p.detay === 'object'); assert.ok(Array.isArray(p.turDagilim)); p.turDagilim.forEach(x => { assert.ok(x.kat && x.tur); });
  });
  await t('kurban vekâlet takibi: bağış alırken, işaretleme, süzme, Excel', async () => {
      const vt = (await admin('GET', '/api/turler')).j.turler.find(x => x.org === 'Kurban' && x.cap === 1);
      const v1 = await admin('POST', '/api/bagislar', { kod: '+90', tel: '532 909 80 01', ad: 'Vekalet Bir', tur_id: vt.id, adet: 1, odeme: 'Nakit', hy: 'Koç', vekalet: true, vekalet_yontem: 'WhatsApp' }); assert.equal(v1.s, 201, JSON.stringify(v1.j));
      const v2 = await admin('POST', '/api/bagislar', { kod: '+90', tel: '532 909 80 02', ad: 'Vekalet Iki', tur_id: vt.id, adet: 1, odeme: 'Nakit', hy: 'Koç' }); assert.equal(v2.s, 201);
      const ok = (await admin('GET', '/api/vekalet?durum=Hepsi&q=Vekalet')).j; const ps = ok.liste.filter(p => /^Vekalet/.test(p.ad));
      const a = ps.find(p => p.ad === 'Vekalet Bir'), b = ps.find(p => p.ad === 'Vekalet Iki'); assert.ok(a && a.vk && a.vy === 'WhatsApp' && b && !b.vk, JSON.stringify(ps));
      assert.equal((await admin('POST', '/api/vekalet/isaretle', { a: 'al', paylar: [b.id], yontem: 'Yüz yüze' })).s, 200);
      const ok2 = (await admin('GET', '/api/vekalet?durum=Alınmadı&q=Vekalet')).j; assert.ok(!ok2.liste.some(p => p.ad === 'Vekalet Iki'));
      assert.equal((await admin('POST', '/api/vekalet/isaretle', { a: 'geri', paylar: [b.id] })).s, 200);
      assert.equal((await admin('POST', '/api/vekalet/isaretle', { a: 'al' })).s, 400);
      { // web sitesinden gelen kurban bağışı: vekâlet kutusu işaretliyse onaydan sonra 'Online' alındı görünür
        const key = (await admin('POST', '/api/entegre/anahtar', { ad: 'Vekalet Web' })).j.anahtar;
        const w = await fetch(base + '/api/dis/bagis', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bp': '1', 'x-api-key': key }, body: JSON.stringify({ kod: '+90', tel: '532 909 80 03', ad: 'Vekalet Web', tur_id: vt.id, adet: 1, tutar: 0, odeme: 'Kredi kartı / online', hy: 'Koç', vekalet: true, xid: 'VEK-WEB-1' }) });
        assert.equal(w.status, 201, await w.clone().text()); const wid = (await w.json()).id;
        assert.equal((await admin('POST', '/api/bagislar/onayla', { ids: [wid] })).s, 200);
        const wl = (await admin('GET', '/api/vekalet?durum=Alındı&kaynak=' + encodeURIComponent('Web sitesi') + '&yontem=Online&q=Vekalet')).j.liste; assert.ok(wl.some(p => p.ad === 'Vekalet Web' && p.kaynak === 'Web sitesi' && p.vy === 'Online'), JSON.stringify(wl));
        assert.ok(!(await admin('GET', '/api/vekalet?durum=Hepsi&kaynak=Panel&q=Vekalet Web')).j.liste.some(p => p.ad === 'Vekalet Web'));
      }
      const ex = await admin('GET', '/api/vekalet/excel?durum=eksik'); assert.equal(ex.s, 200); assert.ok(ex.j.dosya.length > 100 && /\.xlsx$/.test(ex.j.ad));
  });
  await t('web sitesi: ayarlar, yayın, sayfalar, menü ve sitedeki bağış formu', async () => {
    const get = (u, h) => fetch(base + u, { headers: h || {} }), post = (u, b) => fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bp': '1' }, body: JSON.stringify(b) });
    const cfg = (await admin('GET', '/api/site')).j; assert.equal(cfg.ayar.acik, 0); assert.equal(Object.keys(cfg.temalar).length, 4); assert.ok(cfg.turler.length > 3 && !cfg.turler.some(x => x.org === 'Diğer'));
    // yayında değilken herkese kapalı
    assert.equal((await get('/site')).status, 404); assert.equal((await post('/api/site/bagis', { tur_id: cfg.turler[0].id, ad: 'A', tel: '532 909 82 01', tutar: 100, kvkk: true })).status, 404);
    // doğrulamalar
    assert.equal((await admin('PUT', '/api/site/tasarim', { tema: 'yok' })).s, 400); assert.equal((await admin('PUT', '/api/site/tasarim', { renk: { pri: 'kırmızı' } })).s, 400); assert.equal((await admin('PUT', '/api/site/tasarim', { alan_adi: 'a b' })).s, 400);
    assert.equal((await admin('PUT', '/api/site/sayfalar', { sayfalar: [{ slug: 'Bagis', baslik: 'X', icerik: '' }] })).s, 400, 'ayrılmış adres'); assert.equal((await admin('PUT', '/api/site/sayfalar', { sayfalar: [{ slug: 'a', baslik: 'A' }, { slug: 'a', baslik: 'B' }] })).s, 400, 'yinelenen adres');
    assert.equal((await admin('PUT', '/api/site/menu', { menu: [{ ad: 'X', h: 'olmayan' }] })).s, 400); assert.equal((await admin('PUT', '/api/site/menu', { menu: [{ ad: 'X', h: 'http://gayriguvenli' }] })).s, 400);
    // içerik, menü, tema
    assert.equal((await admin('PUT', '/api/site/sayfalar', { sayfalar: [{ slug: 'hakkimizda', baslik: 'Hakkımızda', gorunur: 1, icerik: 'Merhaba <script>alert(1)</script>\n\n# Alt başlık\nMetin' }, { slug: 'gizli', baslik: 'Gizli', gorunur: 0, icerik: 'x' }] })).s, 200);
    assert.equal((await admin('PUT', '/api/site/menu', { menu: [{ ad: 'Ana', h: '' }, { ad: 'Biz', h: 'hakkimizda' }, { ad: 'Dış', h: 'https://ornek.org/x' }] })).s, 200);
    assert.equal((await admin('PUT', '/api/site/form', { baslik: 'Destek ol', tutarlar: ['50', '75', 'abc', '-3'], aylik: true, vekalet: true, turler: [cfg.turler[0].id, 99999] })).s, 200);
    assert.equal((await admin('PUT', '/api/site/tasarim', { acik: true, tema: 'modern', renk: { pri: '#112233', acc: '' } })).s, 200);
    // site yayında
    let h = await (await get('/site')).text(); assert.ok(h.includes('t-modern') && h.includes('--pri:#112233') && h.includes('Destek ol') && h.includes('data-t="50"') && h.includes('Biz') && h.includes('https://ornek.org/x'));
    assert.equal((h.match(/<option value="\d+" data-fiyat/g) || []).length, 1, 'yalnızca seçilen tür formda');
    const ph = await (await get('/site/hakkimizda')).text(); assert.ok(ph.includes('Alt başlık') && !ph.includes('<script>alert') && ph.includes('&lt;script&gt;')); assert.equal((await get('/site/gizli')).status, 404); assert.equal((await get('/site/yok')).status, 404);
    // sitedeki bağış: onay bekleyen olarak düşer
    const gb = (b) => post('/api/site/bagis', { tur_id: cfg.turler[0].id, ad: 'Site Bağışçı', tel: '532 909 82 02', tutar: 250, kvkk: true, ...b });
    const ok = await gb({ periyot: 'aylik' }); assert.equal(ok.status, 201, await ok.clone().text()); const oj = await ok.json(); assert.ok(/^BG-/.test(oj.no) && oj.aylik && oj.hesaplar.length >= 1);
    const bl = (await admin('GET', '/api/bagislar?durum=Bekleyen&kanal=' + encodeURIComponent('Web sitesi / dış kaynak'))).j.liste.find(x => x.no === oj.no); assert.ok(bl && bl.durum === 'Bekleyen' && bl.kanal !== 'CRM');
    assert.equal((await gb({ kvkk: false })).status, 400); assert.equal((await gb({ tutar: 0 })).status, 400); assert.equal((await gb({ tur_id: 999999 })).status, 400); assert.equal((await gb({ tel: '12' })).status, 400);
    const bal = await gb({ web2: 'bot' }); assert.equal(bal.status, 200); assert.equal((await bal.json()).no, undefined, 'bal kutusu bağış açmaz');
    assert.equal((await fetch(base + '/api/site/bagis', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403, 'x-bp başlığı zorunlu');
    // alan adı: o host kökte siteyi açar
    assert.equal((await admin('PUT', '/api/site/tasarim', { alan_adi: 'www.ornekdernek.org' })).s, 200);
    const kok = await new Promise((ok, no) => { const q = require('http').request({ host: '127.0.0.1', port: server.address().port, path: '/', headers: { host: 'www.ornekdernek.org' } }, r => { let d = ''; r.on('data', x => d += x); r.on('end', () => ok(d)); }); q.on('error', no); q.end(); }); assert.ok(kok.includes('t-modern'), 'alan adı kökte siteyi açar');
    assert.equal((await admin('PUT', '/api/site/tasarim', { acik: false, alan_adi: '' })).s, 200); assert.equal((await get('/site')).status, 404);
  });
  await t('sertifika: sertifikalı türde onayda tek SMS, tutarsız sayfa, yeniden gönderme', async () => {
    { const tr = await admin('POST', '/api/turler', { sec: 'genel', kat: 'Test Kategori', ad: 'Sertifikalı Fidan', tutar: 100, sertifika: true }); assert.equal(tr.s, 201, JSON.stringify(tr.j)); }
    const tid = await turId('Sertifikalı Fidan'), smsSay = async (f) => (await admin('GET', '/api/sms')).j.filter(f).length;
    const k0 = await smsSay(x => x.sablon === 'kabul'), s0 = await smsSay(x => x.sablon === 'sertifika');
    const r = await bag({ tur_id: tid, tutar: 123456, ad: 'Sertifika Sahibi', tel: '541 300 00 77', durum: 'Bekleyen' }); assert.equal(r.s, 201, JSON.stringify(r.j));
    assert.equal(await smsSay(x => x.sablon === 'sertifika'), s0, 'onaydan önce sertifika gitmez');
    assert.equal((await admin('GET', `/api/bagislar/${r.j.id}/mesaj`)).j.sertifika, false);
    assert.equal((await admin('POST', '/api/bagislar/onayla', { ids: [r.j.id] })).s, 200);
    assert.equal(await smsSay(x => x.sablon === 'sertifika'), s0 + 1, 'sertifika bağlantılı mesaj gitti'); assert.equal(await smsSay(x => x.sablon === 'kabul'), k0, 'ayrı kabul SMS’i gitmedi (israf yok)');
    const sm = (await admin('GET', '/api/sms')).j.find(x => x.sablon === 'sertifika' && x.mesaj.includes('Sertifika Sahibi')); assert.ok(/alınmıştır/.test(sm.mesaj)); const link = /https?:\/\/\S+\/sertifika\/([A-Za-z0-9_-]+)/.exec(sm.mesaj); assert.ok(link, sm.mesaj);
    const pg = await fetch(base + '/sertifika/' + link[1]); assert.equal(pg.status, 200); const h = await pg.text();
    assert.ok(h.includes('Sertifika Sahibi') && h.includes('Sertifikalı Fidan') && h.includes('Bağış Sertifikası')); assert.ok(!h.includes('123456') && !h.includes('123.456'), 'tutar sertifikada görünmez');
    assert.equal((await fetch(base + '/sertifika/yanlis-kod-yok')).status, 404); assert.equal((await fetch(base + '/sertifika/' + link[1].slice(0, -1) + 'x')).status, 404);
    // yeniden gönder (SMS): sertifika bağlantılı mesaj; WhatsApp: aynı metin
    const m = (await admin('GET', `/api/bagislar/${r.j.id}/mesaj`)).j; assert.equal(m.sertifika, true); assert.ok(m.s.mesaj.includes('/sertifika/') && m.s.yol.startsWith('/sertifika/') && !m.b.mesaj.includes('/sertifika/'), 'sertifika ve kabul ayrı mesaj');
    assert.equal((await admin('POST', `/api/bagislar/${r.j.id}/sms`)).j.sertifika, true); assert.equal(await smsSay(x => x.sablon === 'sertifika'), s0 + 2);
    const wa = await admin('GET', `/api/bagislar/${r.j.id}/wa`); assert.equal(wa.s, 200); assert.ok(decodeURIComponent(wa.j.link).includes('/sertifika/' + link[1]));
    // sertifikasız tür: yalnız kabul
    const k1 = await smsSay(x => x.sablon === 'kabul'); assert.equal((await bag({ tur_id: await turId('Fitre'), tutar: 10, ad: 'Sertifikasız', tel: '541 300 00 78' })).s, 201); assert.equal(await smsSay(x => x.sablon === 'kabul'), k1 + 1);
    { // tür adında fiyat varsa sertifikada görünmez
      assert.equal((await admin('POST', '/api/turler', { sec: 'kuyu', ad: 'Sertifikaistan - Kuyu', bicim: 'Tam fiyat', fiyat: 12000, sertifika: true })).s, 201);
      const kt = await turId('Sertifikaistan'), kr = await bag({ tur_id: kt, adet: 1, tutar: 12000, ad: 'Kuyu Sahibi', tel: '541 300 00 79' }); assert.equal(kr.s, 201, JSON.stringify(kr.j));
      const ks = (await admin('GET', '/api/sms')).j.find(x => x.sablon === 'sertifika' && x.mesaj.includes('Kuyu Sahibi')); const kh = await (await fetch(/https?:\/\/\S+\/sertifika\/[A-Za-z0-9_-]+/.exec(ks.mesaj)[0].replace(/^https?:\/\/[^/]+/, base))).text();
      assert.ok(kh.includes('Sertifikaistan - Kuyu') && !/12\.000|₺|Tam fiyat/.test(kh.replace(/<style>[\s\S]*?<\/style>/, '')), 'fiyat ve biçim eki görünmez'); }
    { // sertifikası kapalı türde de elle sertifika gönderilir (SMS penceresindeki Sertifika seçeneği)
      const fr = await bag({ tur_id: await turId('Fitre'), tutar: 15, ad: 'Elle Sertifika', tel: '541 300 00 92' }); assert.equal(fr.s, 201);
      const fm = (await admin('GET', `/api/bagislar/${fr.j.id}/mesaj`)).j; assert.equal(fm.sertifika, false); assert.ok(fm.s && fm.s.mesaj.includes('/sertifika/'));
      const e0 = await smsSay(x => x.sablon === 'sertifika'); assert.equal((await admin('POST', `/api/bagislar/${fr.j.id}/sms`, { k: 's' })).j.sertifika, true); assert.equal(await smsSay(x => x.sablon === 'sertifika'), e0 + 1);
      assert.equal((await admin('POST', `/api/bagislar/${fr.j.id}/sms`, { k: 'b' })).j.sertifika, false);
      const w2 = await admin('GET', `/api/bagislar/${fr.j.id}/wa?k=s`); assert.ok(decodeURIComponent(w2.j.link).includes('/sertifika/'));
      assert.equal((await fetch(base + fm.s.yol)).status, 200); }
    // iptal edilen bağışın sertifikası açılmaz
    assert.equal((await admin('POST', `/api/bagislar/${r.j.id}/iptal`, { sebep: 'Deneme' })).s, 200); assert.equal((await fetch(base + '/sertifika/' + link[1])).status, 404);
  });
  await t('sertifika ayarları: renk, metin, imza, tür başına tasarım, önizleme yetkisi', async () => {
    const g = await admin('GET', '/api/sertifika/ayar'); assert.equal(g.s, 200); assert.ok(g.j.tasarimlar.modern && g.j.renkler.bordo);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    assert.equal((await admin('PUT', '/api/sertifika/ayar', { baslik: 'Hayır Belgesi', metin: 'Teşekkürler.', renk: 'bordo', imza_ad: 'Ali Veli', imza_unvan: 'Başkan', imza_gorsel: png, sponsor_tasarim: 'zarif' })).s, 200);
    assert.equal((await admin('PUT', '/api/sertifika/ayar', { baslik: 'x', renk: 'yok', sponsor_tasarim: 'zarif' })).s, 400);
    assert.equal((await admin('PUT', '/api/sertifika/ayar', { baslik: 'x', renk: 'bordo', sponsor_tasarim: 'zarif', imza_gorsel: 'javascript:1' })).s, 400);
    assert.equal((await admin('POST', '/api/turler', { sec: 'genel', kat: 'Test Kategori', ad: 'Modern Fidan', tutar: 50, sertifika: true, sert_tasarim: 'modern' })).s, 201);
    const tid = await turId('Modern Fidan'); assert.equal((await admin('GET', '/api/turler')).j.turler.find(x => x.id === tid).sert_tasarim, 'modern');
    const r = await bag({ tur_id: tid, tutar: 50, ad: 'Mehmet Modern', tel: '541 300 00 91' }); assert.equal(r.s, 201);
    const sm = (await admin('GET', '/api/sms')).j.find(x => x.sablon === 'sertifika' && x.mesaj.includes('Mehmet Modern')); const kod = /\/sertifika\/([A-Za-z0-9_-]+)/.exec(sm.mesaj)[1];
    const h = await (await fetch(base + '/sertifika/' + kod)).text();
    assert.ok(h.includes('t-modern') && h.includes('Hayır Belgesi') && h.includes('Ali Veli') && h.includes('Başkan') && h.includes('#7a1f2b') && h.includes(png), 'seçilen tasarım ve ayarlar sayfada');
    assert.equal((await admin('PUT', `/api/turler/${tid}/sertifika`, { tasarim: 'zarif' })).s, 200); assert.ok((await (await fetch(base + '/sertifika/' + kod)).text()).includes('t-zarif'));
    assert.equal((await admin('PUT', `/api/turler/${tid}/sertifika`, { tasarim: 'yok' })).s, 400);
    assert.equal((await admin('PUT', `/api/turler/${tid}/sertifika`, { tasarim: '' })).s, 200); assert.equal((await admin('GET', '/api/turler')).j.turler.find(x => x.id === tid).sertifika, false);
    { // kurum rengi: Kurum Bilgileri'nde seçilir, giriş ekranı ve sertifika kullanır
      assert.equal((await admin('PUT', '/api/kurum/bilgi', { ad: 'Test Derneği', renk: 'kırmızı' })).s, 400);
      assert.equal((await admin('PUT', '/api/kurum/bilgi', { ad: 'Test Derneği', renk: '#336699' })).s, 200);
      assert.equal((await (await fetch(base + '/api/kurum')).json()).renk, '#336699', 'giriş ekranı için açık');
      assert.ok((await admin('GET', '/api/sertifika/ayar')).j.renkler.kurum, 'sertifikada Kurum rengi seçeneği');
      assert.equal((await admin('PUT', '/api/sertifika/ayar', { baslik: 'x', renk: 'kurum', sponsor_tasarim: 'klasik' })).s, 200);
      assert.equal((await admin('PUT', `/api/turler/${tid}/sertifika`, { tasarim: 'klasik' })).s, 200);
      const r2 = await bag({ tur_id: tid, tutar: 50, ad: 'Renk Deneme', tel: '541 300 00 93' }); assert.equal(r2.s, 201);
      const k2 = /\/sertifika\/([A-Za-z0-9_-]+)/.exec((await admin('GET', '/api/sms')).j.find(x => x.mesaj.includes('Renk Deneme')).mesaj); assert.ok(k2);
      assert.ok((await (await fetch(base + '/sertifika/' + k2[1])).text()).includes('#336699'), 'sertifika kurum rengiyle'); }
    assert.equal((await fetch(base + '/sertifika/onizleme?t=modern')).status, 404, 'önizleme girişsiz açılmaz');
  });
  await t('geriye dönük raporlama: kategori/alt kategori adı değişince geçmiş yeni adı görür, kullanıcı silinmez yalnızca pasife alınır', async () => {
    assert.equal((await admin('PUT', '/api/kategoriler', { eski: 'Test Kategori', yeni: 'Test Kategori Yeni' })).s, 200);
    const T = (await admin('GET', '/api/turler')).j; assert.ok(T.turler.some(x => x.kat === 'Test Kategori Yeni' && x.ad === 'Sertifikalı Fidan') && !T.turler.some(x => x.kat === 'Test Kategori'), 'eski türler yeni kategoriye taşındı');
    const tid = await turId('Sertifikalı Fidan'); assert.equal((await admin('PUT', '/api/turler/' + tid, { ad: 'Sertifikalı Fidan 2' })).s, 200);
    const rp = (await admin('GET', '/api/analiz/tur')).j; assert.ok(JSON.stringify(rp).includes('Test Kategori Yeni'), 'raporlar yeni adı gösterir'); assert.ok(!JSON.stringify(rp).includes('"Test Kategori"'));
    const u = (await mkUser('pasifrapor', 'Çağrı merkezi')).q; const us = (await admin('GET', '/api/users')).j.find(x => x.kadi === 'pasifrapor');
    assert.equal((await admin('DELETE', '/api/users/' + us.id)).s, 405, 'kullanıcı silinmez');
    assert.equal((await admin('PUT', '/api/users/' + us.id, { aktif: false })).s, 200); assert.ok((await admin('GET', '/api/users')).j.find(x => x.kadi === 'pasifrapor' && !x.aktif), 'pasif kullanıcı listede kalır');
  });
  await t('döviz kuru: varsayılan, elle belirleme, TCMB otomatik çekme, geçersiz değer', async () => {
    const k0 = (await admin('GET', '/api/kur')).j; assert.equal(k0.USD, 35); assert.equal(k0.EUR, 38);
    assert.equal((await admin('PUT', '/api/kur', { USD: 'abc', EUR: 38 })).s, 400);
    const e = await admin('PUT', '/api/kur', { USD: 40.5, EUR: 44 }); assert.equal(e.s, 200); assert.equal(e.j.elle, true); assert.equal((await admin('GET', '/api/kur')).j.USD, 40.5);
    assert.equal((await admin('POST', '/api/kur/yenile', {})).s, 409, 'elle kur açıkken otomatik yenilenmez');
    const xml = '<?xml version="1.0"?><Tarih_Date Tarih="20.11.2026" Date="11/20/2026"><Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><ForexBuying>42.1234</ForexBuying><ForexSelling>42.2</ForexSelling></Currency><Currency Kod="EUR" CurrencyCode="EUR"><ForexBuying>45,5</ForexBuying></Currency></Tarih_Date>';
    const mock = require('http').createServer((q, r) => { r.setHeader('content-type', 'text/xml'); r.end(xml); }); await new Promise(ok => mock.listen(0, ok)); process.env.TCMB_URL = 'http://127.0.0.1:' + mock.address().port + '/today.xml';
    const o = await admin('PUT', '/api/kur', { otomatik: true }); assert.equal(o.s, 200, JSON.stringify(o.j)); assert.equal(o.j.USD, 42.1234); assert.equal(o.j.EUR, 45.5); assert.equal(o.j.tarih, '2026-11-20'); assert.equal(o.j.elle, false); assert.equal(o.j.hata, '');
    mock.close(); process.env.TCMB_URL = 'http://127.0.0.1:1/yok.xml';
    const y = await admin('POST', '/api/kur/yenile', {}); assert.equal(y.s, 502); const k2 = (await admin('GET', '/api/kur')).j; assert.equal(k2.USD, 42.1234, 'çekilemezse eski kur korunur'); assert.ok(k2.hata);
    await admin('PUT', '/api/kur', { USD: 35, EUR: 38 }); delete process.env.TCMB_URL;
  });
  await t('kumbara: ekleme, sayım (döviz TL karşılığı), pasife alma, iptal (silinmez), yetki', async () => {
    const e = await admin('POST', '/api/kumbara', { ad: 'Yıldız Market', tur: 'Esnaf', il: 'Konya', ilce: 'Karatay', yetkili: 'Ali Usta', tel: '0532 111 22 33', yerlesim: '2026-10-01' }); assert.equal(e.s, 201, JSON.stringify(e.j)); assert.match(e.j.kod, /^KM-\d{4}$/);
    assert.equal((await admin('POST', '/api/kumbara', { ad: '' })).s, 400);
    assert.equal((await admin('POST', '/api/kumbara/' + e.j.id + '/sayim', { tutar: '0' })).s, 400);
    assert.equal((await admin('POST', '/api/kumbara/' + e.j.id + '/sayim', { tutar: 100, tarih: '2999-01-01' })).s, 400);
    const s1 = await admin('POST', '/api/kumbara/' + e.j.id + '/sayim', { tutar: '1250,50', para: 'TL', tarih: '2026-11-01', sayan: 'Ayşe' }); assert.equal(s1.s, 201);
    const s2 = await admin('POST', '/api/kumbara/' + e.j.id + '/sayim', { tutar: 10, para: 'USD', tarih: '2026-11-10' }); assert.equal(s2.s, 201);
    let d = (await admin('GET', '/api/kumbara/' + e.j.id)).j; assert.equal(d.sayimlar.length, 2); const usd = (await admin('GET', '/api/kur')).j.USD; assert.ok(Math.abs(d.toplam - (1250.5 + 10 * usd)) < 0.01, 'toplam TL karşılığı');
    assert.equal((await admin('PUT', '/api/kumbara/sayim/' + s2.j.id + '/iptal', {})).s, 400, 'neden şart');
    assert.equal((await admin('PUT', '/api/kumbara/sayim/' + s2.j.id + '/iptal', { neden: 'Yanlış girildi' })).s, 200); d = (await admin('GET', '/api/kumbara/' + e.j.id)).j; assert.equal(d.sayimlar.length, 2, 'iptal edilen kayıt silinmez'); assert.equal(d.toplam, 1250.5);
    assert.equal((await admin('PUT', '/api/kumbara/' + e.j.id, { durum: 'Pasif' })).s, 200); assert.equal((await admin('POST', '/api/kumbara/' + e.j.id + '/sayim', { tutar: 5 })).s, 409, 'pasif kumbaraya sayım girilmez');
    const L = (await admin('GET', '/api/kumbara')).j; assert.ok(L.liste.some(k => k.id === e.j.id && k.durum === 'Pasif') && L.ozet.pasif >= 1, 'pasif kumbara listede kalır'); assert.equal((await admin('DELETE', '/api/kumbara/' + e.j.id)).s, 404);
    const u = await mkUser('kumbarasiz', 'Çağrı merkezi'); assert.equal((await u.q('GET', '/api/kumbara')).s, 403);
  });
  await t('yedekleme: durum, şimdi yedek al, indirme, yetki', async () => {
    const y0 = (await admin('GET', '/api/yedek')).j; assert.equal(y0.durum, 'yok');
    const y1 = await admin('POST', '/api/yedek/al', {}); assert.equal(y1.s, 200, JSON.stringify(y1.j)); assert.equal(y1.j.durum, 'iyi'); assert.equal(y1.j.adet, 1); assert.match(y1.j.son.ad, /^bagispanel-\d{8}-\d{4}\.db\.gz$/);
    const ind = await admin('GET', '/api/yedek/indir/' + y1.j.son.ad); assert.equal(ind.s, 200); assert.ok(Buffer.from(ind.j.dosya, 'base64').slice(0, 2).equals(Buffer.from([0x1f, 0x8b])), 'gzip dosyası');
    assert.equal((await admin('GET', '/api/yedek/indir/..%2F..%2Fetc%2Fpasswd')).s, 404);
    const u = await mkUser('yedeksiz', 'Çağrı merkezi'); assert.equal((await u.q('GET', '/api/yedek')).s, 403); assert.equal((await u.q('GET', '/api/yedek/indir/' + y1.j.son.ad)).s, 403);
  });
  await t('video yükleme: akış, doğrulama, izleme sayfası, sınır, yetki', async () => {
    const lg = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-BP': '1' }, body: JSON.stringify({ kadi: 'admin', sifre: 'Yonetici2027' }) }), ck = lg.headers.get('set-cookie').split(';')[0];
    const up = (buf, ad, extra) => fetch(base + '/api/org/video?ad=' + encodeURIComponent(ad), { method: 'POST', headers: { 'X-BP': '1', cookie: ck, 'Content-Type': 'application/octet-stream', ...(extra || {}) }, body: buf });
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2000, 7)]);
    assert.equal((await up(Buffer.from('bu bir video degil'), 'x.mp4')).status, 400);
    assert.equal((await fetch(base + '/api/org/video?ad=a.mp4', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: mp4 })).status, 403);
    const r = await up(mp4, 'kurban1.mp4'), j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); assert.equal(j.ref, 'vid:' + j.id);
    const ps = await fetch(base + '/api/org/video/' + j.id, { headers: { cookie: ck, range: 'bytes=0-9' } }); assert.equal(ps.status, 206); assert.equal(ps.headers.get('content-type'), 'video/mp4');
    assert.equal((await fetch(base + '/api/org/video/' + j.id)).status, 401);
    const k = await turId('Adak · küçükbaş'); const b = await bag({ tur_id: k, tel: '541 300 77 01', ad: 'Video Sahibi' }); assert.equal(b.s, 201);
    const u = (await admin('GET', '/api/org/kurban?q=Video Sahibi')).j.liste[0];
    assert.equal((await admin('POST', '/api/org/islem', { a: 'c', ids: [u.id], ulke: 'Çad', partner: 'Test Dernek' })).s, 200);
    assert.equal((await admin('POST', '/api/org/islem', { a: 'k', ids: [u.id] })).s, 200);
    assert.equal((await admin('POST', '/api/org/islem', { a: 'v', ids: [u.id], video: j.ref })).s, 200);
    const u2 = (await admin('GET', '/api/org/kurban?q=Video Sahibi')).j.liste[0]; assert.equal(u2.vid.yuklu, true); assert.equal(u2.vid.ad, 'kurban1.mp4');
    assert.equal((await admin('POST', '/api/org/islem', { a: 'g', ids: [u.id] })).s, 200);
    const sms = (await admin('GET', '/api/sms')).j.find(x => x.sablon === 'video' && /izle\.html\?t=/.test(x.mesaj || x.metin || JSON.stringify(x))); assert.ok(sms, 'SMS izleme bağlantısı içermeli');
    const tk = /izle\.html\?t=([\w-]+)/.exec(JSON.stringify(sms))[1];
    const pg = await (await fetch(base + '/api/izle/' + tk)).json(); assert.equal(pg.ad, 'Video Sahibi'); assert.equal(pg.src, '/api/izle/' + tk + '/dosya');
    const fl = await fetch(base + pg.src, { headers: { range: 'bytes=4-7' } }); assert.equal(fl.status, 206); assert.equal(Buffer.from(await fl.arrayBuffer()).toString(), 'ftyp');
    assert.equal((await fetch(base + '/api/izle/yanlisjeton123')).status, 404); assert.equal((await fetch(base + '/api/izle/' + tk + '/../x')).status === 200, false);
    { // organizasyonda tamamlanmamış video profile düşmez, profilden gönderilemez
      const b2 = await bag({ tur_id: k, tel: '541 300 77 02', ad: 'Video Bekleyen' }); assert.equal(b2.s, 201);
      const w = (await admin('GET', '/api/org/kurban?q=Video Bekleyen')).j.liste[0];
      assert.equal((await admin('POST', '/api/org/islem', { a: 'c', ids: [w.id], ulke: 'Çad' })).s, 200); assert.equal((await admin('POST', '/api/org/islem', { a: 'k', ids: [w.id] })).s, 200); assert.equal((await admin('POST', '/api/org/islem', { a: 'v', ids: [w.id], video: j.ref })).s, 200);
      const wb = (await admin('GET', '/api/bagiscilar?q=Video Bekleyen')).j, wid = (wb.liste || wb).find(x => x.ad === 'Video Bekleyen').id;
      const wp = Object.values((await admin('GET', '/api/bagiscilar/' + wid)).j.detay).flatMap(d => d.paylar || [])[0]; assert.equal(wp.video, false);
      assert.equal((await admin('POST', '/api/org/pay-video/' + wp.pid, {})).s, 409);
    }
    const bc = (await admin('GET', '/api/bagiscilar?q=Video Sahibi')).j, bid = (bc.liste || bc).find(x => x.ad === 'Video Sahibi').id;
    const dy = Object.values((await admin('GET', '/api/bagiscilar/' + bid)).j.detay).flatMap(d => d.paylar || []).find(x => x.video); assert.ok(dy, 'detay: ' + JSON.stringify((await admin('GET', '/api/bagiscilar/' + bid)).j.detay).slice(0, 400)); assert.ok(dy.pid && dy.yuklu && dy.link.startsWith('/api/org/video/'));
    const nOnce = (await admin('GET', '/api/sms')).j.filter(x => x.sablon === 'video').length; const rs = await admin('POST', '/api/org/pay-video/' + dy.pid, {}); assert.equal(rs.s, 200); assert.match(rs.j.msg, /yeniden/);
    assert.equal((await admin('GET', '/api/sms')).j.filter(x => x.sablon === 'video').length, nOnce + 1); assert.equal((await admin('POST', '/api/org/pay-video/999999', {})).s, 404);
    assert.ok(JSON.stringify((await admin('GET', '/api/audit')).j).includes('video_yukle'));
  });
  await t('giriş: e-posta ile giriş, ilk girişte ad soyad yazılır', async () => {
    const bi = (await admin('GET', '/api/birimler')).j; const bid = (bi.birimler || bi).find(x => x.ad === 'Çağrı merkezi').id;
    const cu = await admin('POST', '/api/users', { ad: 'Deneme Kisi', kadi: 'deneme.kisi', birim_id: bid, sifre: 'Deneme1234', eposta: 'deneme.kisi@ornek.org' }); assert.ok(cu.s < 300, JSON.stringify(cu.j));
    const lg = (b) => fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-BP': '1' }, body: JSON.stringify(b) });
    const r1 = await lg({ kadi: 'Deneme.Kisi@Ornek.org', sifre: 'Deneme1234' }); assert.equal(r1.status, 200, 'e-posta ile giriş');
    assert.equal((await lg({ kadi: 'yok@ornek.org', sifre: 'Deneme1234' })).status, 401); assert.equal((await lg({ kadi: 'deneme.kisi@ornek.org', sifre: 'yanlis' })).status, 401);
    const ck = r1.headers.get('set-cookie').split(';')[0], H = { 'Content-Type': 'application/json', 'X-BP': '1', cookie: ck };
    const me0 = await (await fetch(base + '/api/me', { headers: H })).json(); assert.ok(me0.user.must_change); assert.equal((await fetch(base + '/api/sifre', { method: 'POST', headers: H, body: JSON.stringify({ eski: 'Deneme1234', yeni: 'Yeni12345x' }) })).status, 200);
    const pf = (b) => fetch(base + '/api/profil', { method: 'PUT', headers: H, body: JSON.stringify(b) }); await pf({ ad: 'Başka Isim' }); assert.equal((await (await fetch(base + '/api/me', { headers: H })).json()).user.ad, 'Deneme Kisi', 'yetkisiz kişi adını değiştiremez');
    assert.equal((await admin('PUT', '/api/profil', { ad: 'Meriç Çümen' })).s, 200); assert.equal((await admin('GET', '/api/me')).j.user.ad, 'Meriç Çümen'); assert.equal((await admin('PUT', '/api/profil', { ad: 'ab' })).s, 400);
  });
  await t('KVKK: aydınlatma onayı zorunlu, rıza kaydı, talep süresi, veri dökümü, anonimleştirme, dışa aktarma izi', async () => {
    assert.equal((await admin('PUT', '/api/kvkk/ayar', { zorunlu: true })).s, 200);
    const t1 = await turId('Adak · küçükbaş'), ilk = { tur_id: t1, tel: '541 600 00 01', ad: 'Rıza Deneme' };
    const r0 = await bag(ilk); assert.equal(r0.s, 400); assert.match(r0.j.hata, /Aydınlatma/);
    const r1 = await bag({ ...ilk, riza: { ayd: true, iletisim: true } }); assert.equal(r1.s, 201, JSON.stringify(r1.j));
    const bc = (await admin('GET', '/api/bagiscilar?q=Rıza Deneme')).j, kisi = (bc.liste || bc).find(x => x.ad === 'Rıza Deneme');
    const pr = (await admin('GET', '/api/bagiscilar/' + kisi.id)).j.bagisci; assert.ok(pr.riza_tarih); assert.equal(pr.aydinlatma_surum, 0); assert.equal(JSON.parse(pr.izin).sms, 'izinli');
    assert.equal((await bag({ ...ilk, tutar: 10 })).s, 201, 'rıza kaydı olan bağışçı yeniden onay istemez');
    const ar = await admin('GET', '/api/bagiscilar/ara?kod=%2B90&tel=5416000001'); assert.ok(ar.j.riza_tarih);
    // aydınlatma metni sürümlenir; herkese açık
    const pub = await fetch(base + '/api/kvkk/aydinlatma'); assert.equal(pub.status, 200); assert.ok((await pub.json()).metin.includes('KVKK'));
    assert.equal((await admin('PUT', '/api/kvkk/aydinlatma', { metin: 'kısa' })).s, 400);
    const yeni = await admin('PUT', '/api/kvkk/aydinlatma', { metin: 'AYDINLATMA\n' + 'Bu özel bir metindir. '.repeat(20) }); assert.equal(yeni.s, 200); assert.equal(yeni.j.surum, 1);
    // talep: 30 gün, kapatırken sonuç şart
    const tl = await admin('POST', '/api/kvkk/talep', { bagisci_id: kisi.id, tur: 'Bilgi talebi (erişim)', kaynak: 'Telefon' }); assert.equal(tl.s, 201); assert.ok(tl.j.son_tarih > new Date().toISOString().slice(0, 10));
    assert.equal((await admin('PUT', '/api/kvkk/talep/' + tl.j.id, { durum: 'Tamamlandı' })).s, 400);
    assert.equal((await admin('PUT', '/api/kvkk/talep/' + tl.j.id, { durum: 'Tamamlandı', sonuc: 'Döküm verildi' })).s, 200);
    assert.equal((await admin('POST', '/api/kvkk/talep', { tur: 'Düzeltme' })).s, 400);
    // veri dökümü
    const dk = (await admin('GET', '/api/kvkk/dokum/' + kisi.id)).j, d = JSON.parse(Buffer.from(dk.dosya, 'base64').toString()); assert.equal(d.bagisci.ad, 'Rıza Deneme'); assert.ok(d.bagislar.length >= 2);
    // anonimleştirme
    assert.equal((await admin('POST', '/api/kvkk/anonimlestir/' + kisi.id, {})).s, 400);
    const toplamOnce = (await admin('GET', '/api/bagiscilar/' + kisi.id)).j.toplam;
    assert.equal((await admin('POST', '/api/kvkk/anonimlestir/' + kisi.id, { neden: 'KVKK silme talebi' })).s, 200);
    const an = (await admin('GET', '/api/bagiscilar/' + kisi.id)).j; assert.equal(an.bagisci.ad, 'Anonim bağışçı #' + kisi.id); assert.equal(an.bagisci.eposta, null); assert.ok(an.bagisci.tel.startsWith('anon-')); assert.equal(an.toplam, toplamOnce, 'mali kayıt kalır');
    assert.equal((await admin('POST', '/api/kvkk/anonimlestir/' + kisi.id, { neden: 'x' })).s, 409);
    assert.equal((await admin('GET', '/api/bagiscilar/ara?kod=%2B90&tel=5416000001')).j, null);
    // izler
    await admin('POST', '/api/kvkk/disa-aktar', { ne: 'Deneme CSV', adet: 3 });
    const au = JSON.stringify((await admin('GET', '/api/audit')).j); for (const k of ['kvkk_anonimlestirildi', 'kvkk_veri_dokumu', 'disa_aktarim', 'bagisci_goruntule', 'kvkk_aydinlatma_guncellendi']) assert.ok(au.includes(k), k);
    // robots + yönetim ekranı
    assert.match((await fetch(base + '/api/kvkk/aydinlatma')).headers.get('x-robots-tag') || '', /noindex/);
    const ov = (await admin('GET', '/api/kvkk')).j; assert.ok(ov.sayi.anonim >= 1 && ov.zorunlu === true);
    assert.equal((await admin('PUT', '/api/kvkk/ayar', { zorunlu: false })).s, 200);
  });
  await t('yedek şifreleme: AES-256-GCM gidiş-dönüş, yanlış anahtar açamaz', async () => {
    const bk = require('./backup.js'), veri = Buffer.from('gizli veritabanı içeriği '.repeat(50)), e = bk.sifrele(veri, 'uzun-bir-yedek-anahtari-123');
    assert.equal(e.subarray(0, 4).toString(), 'BPY1'); assert.ok(!e.includes(Buffer.from('gizli'))); assert.deepEqual(bk.coz(e, 'uzun-bir-yedek-anahtari-123'), veri); assert.throws(() => bk.coz(e, 'yanlis-anahtar-yanlis-anahtar'));
  });
  await t('hatırlatma: görev bağışçıya bağlanır, vadesi gelen zil sayacı', async () => {
    const b = (await admin('POST', '/api/bagiscilar', { ad: 'Hatırlatma Bağışçısı', tel: '0533 900 00 01' })).j; assert.ok(b.id);
    assert.equal((await admin('POST', '/api/gorev', { baslik: 'Ara', bagisci_id: 999999 })).s, 404);
    const g = await admin('POST', '/api/gorev', { baslik: 'Ara: Hatırlatma Bağışçısı', bagisci_id: b.id, son_tarih: '2020-01-01' }); assert.equal(g.s, 200);
    const L = (await admin('GET', '/api/gorev?kutu=bana')).j.find(x => x.id === g.j.id); assert.equal(L.bagisci, 'Hatırlatma Bağışçısı');
    assert.ok((await admin('GET', '/api/bildirim')).j.sayac.gorevvade >= 1);
  });
  await t('veri aktarımı: geçmiş bağış + kumbara, önizleme, mükerrer, beyan, geri alma', async () => {
    const X = require('./xlsx'), b64 = (a) => X.yaz([{ ad: 'S', satirlar: a, metinSutun: [1, 2, 3] }]).toString('base64');
    assert.equal((await admin('GET', '/api/aktar/bagis-ornek')).s, 200); assert.equal((await admin('GET', '/api/aktar/kumbara-ornek')).s, 200);
    const H = ['Tarih *', 'Ad Soyad *', 'Telefon *', 'Bağış Türü *', 'Tutar *', 'Para Birimi', 'TL Karşılığı', 'Ödeme Yöntemi', 'Adet', 'Not', 'Eski Bağış No'], T = X.oku(Buffer.from((await admin('GET', '/api/aktar/bagis-ornek')).j.dosya, 'base64')).satirlar[1][3];
    const d = b64([H, ['15.03.2025', 'Aktarım Bir', '0541 888 00 01', T, '1.500', 'TL', '', 'Nakit', '', '', 'E-1'], ['02.06.2025', 'Aktarım İki', '0541 888 00 02', T, '100', 'EUR', '4150', 'Havale', '', '', 'E-2'], ['02.06.2025', 'Dövizli', '0541 888 00 03', T, '100', 'USD', '', 'Nakit', '', '', ''], ['01.01.2099', 'Gelecek', '0541 888 00 04', T, '5', 'TL', '', 'Nakit', '', '', ''], ['01.01.2025', 'Yok Tür', '0541 888 00 05', 'Olmayan', '5', 'TL', '', 'Nakit', '', '', ''], ['15.03.2025', 'Aktarım Bir', '0541 888 00 01', T, '1500', 'TL', '', 'Nakit', '', '', 'E-1']]);
    const on = (await admin('POST', '/api/aktar/bagis', { dosya: d, mod: 'onizle' })).j; assert.equal(on.ozet.yeni, 2); assert.equal(on.ozet.hatali, 3); assert.equal(on.ozet.mukerrer, 1); assert.equal(on.ozet.yeniBagisci, 2);
    assert.equal((await admin('POST', '/api/aktar/bagis', { dosya: d, mod: 'aktar' })).s, 400); // beyan şart
    const ak = (await admin('POST', '/api/aktar/bagis', { dosya: d, mod: 'aktar', beyan: 1, dosya_adi: 'x.xlsx' })); assert.equal(ak.s, 200); const parti = ak.j.parti;
    assert.equal((await admin('POST', '/api/aktar/bagis', { dosya: d, mod: 'onizle' })).j.ozet.yeni, 0); // ikinci kez: mükerrer
    const ara = (await admin('GET', '/api/bagiscilar?q=Aktar%C4%B1m')).j; assert.ok(JSON.stringify(ara).includes('Aktarım Bir'));
    const k = b64([['Kumbara Yeri *', 'Tür', 'İl', 'İlçe', 'Yetkili Kişi', 'Telefon', 'Adres', 'Yerleştirme Tarihi', 'Durum', 'Sayım Tarihi', 'Sayım Tutarı', 'Para Birimi'], ['Aktarım Market', 'Esnaf', 'Konya', 'Selçuklu', '', '', '', '01.03.2024', 'Aktif', '15.06.2025', '1.250,50', 'TL'], ['Aktarım Market', '', 'Konya', 'Selçuklu', '', '', '', '', '', '20.12.2025', '1780', 'TL'], ['Bozuk Tür', 'Uzay', '', '', '', '', '', '', '', '', '', '']]);
    const kon = (await admin('POST', '/api/aktar/kumbara', { dosya: k, mod: 'onizle' })).j; assert.equal(kon.ozet.yeni, 1); assert.equal(kon.ozet.sayim, 2); assert.equal(kon.ozet.hatali, 1);
    const kak = await admin('POST', '/api/aktar/kumbara', { dosya: k, mod: 'aktar', beyan: 1 }); assert.equal(kak.s, 200);
    assert.equal((await admin('POST', '/api/aktar/kumbara', { dosya: k, mod: 'onizle' })).j.ozet.sayim, 0);
    const g = (await admin('GET', '/api/aktar/gecmis')).j; assert.equal(g.length >= 2, true);
    assert.equal((await admin('POST', `/api/aktar/${parti}/iptal`, {})).s, 400); assert.equal((await admin('POST', `/api/aktar/${parti}/iptal`, { neden: 'deneme' })).s, 200); assert.equal((await admin('POST', `/api/aktar/${parti}/iptal`, { neden: 'deneme' })).s, 409);
    assert.equal((await admin('POST', '/api/aktar/bagis', { dosya: d, mod: 'onizle' })).j.ozet.yeni, 2); // iptal edilenler tekrar alınabilir
  });
  console.log(fails ? `\n${fails} test başarısız` : '\nTüm testler geçti'); server.close(); process.exit(fails ? 1 : 0);
});
