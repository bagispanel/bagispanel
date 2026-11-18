// Deneme verisi: DEMO=1 iken ve hiç bağış yoksa her bağış türünden 30 bağış ekler (canlı deneme ortamı için).
module.exports = function (ctx) {
  const { db, h } = ctx;
  const yukle = () => {
  const trs = (n) => Number(n).toLocaleString('tr-TR');
  const ek = db.prepare('INSERT OR IGNORE INTO bagis_turleri(kat,ad,org,cap,fiyat,birim,tam,sertifika,ulke,kuyu,seri) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const kuyu = (nv, bic, f, pay, ulke) => { const tip = nv.replace(/^.+?\s+[-–·]\s+/, ''), fon = bic === 'Fon', tam = bic === 'Tam fiyat';
    const s = fon ? `${nv} · Fon (hedef ${trs(f)} ₺)` : tam ? `${nv} · Tam fiyat (${trs(f)} ₺)` : bic === 'Hisseli' ? `${nv} · Hisseli (${trs(pay)} ₺ pay)` : `${nv} · Katılım (${trs(pay)} ₺)`;
    ek.run('Su kuyusu', s, 'Su kuyusu', fon ? f : tam ? 1 : f / pay, fon ? null : (tam ? f : pay), 'Kuyu', 0, 1, ulke || null, JSON.stringify({ tip: fon ? nv : tip, bicim: bic, fiyat: f, pay: pay || 0, ad: fon ? nv : '', web: true }), fon ? nv : tip); };
  kuyu('Nijer - Tulumba', 'Tam fiyat', 12000, 0, 'Nijer'); kuyu('Bangladeş - Şadırvan', 'Hisseli', 7000, 1000, 'Bangladeş'); kuyu('Mali - Derin kuyu', 'Katılım', 14000, 2000, 'Mali'); kuyu('Anne Fatma Kuyusu', 'Fon', 20000, 0, null);
  db.prepare("INSERT OR IGNORE INTO kategoriler(ad) VALUES('Eğitim'),('Fidan')").run();
  ek.run('Eğitim', 'Kuranı Kerim', 'Diğer', 1, 100, 'Kuranı Kerim', 0, 1, null, null, 'Kuranı Kerim'); ek.run('Fidan', 'Hatıra fidanı', 'Diğer', 1, 250, 'Hatıra fidanı', 0, 1, null, null, 'Hatıra fidanı'); ek.run('Eğitim', 'Burs', 'Genel', null, null, null, 0, 0, null, null, null);
  if (!db.prepare('SELECT 1 FROM banka_hesaplari').get()) db.prepare("INSERT INTO banka_hesaplari(banka,hesap,iban,para) VALUES('Ziraat Bankası','Dernek Ana Hesap','TR330006100519786457841326','TL')").run();
  const bk = db.prepare('SELECT id FROM banka_hesaplari').get().id;
  if (!db.prepare('SELECT 1 FROM partnerler').get()) db.prepare("INSERT INTO partnerler(tur,ad,bilgi,yad,yg,yt) VALUES('Dernek','Demo Yardım Derneği','{\"vn\":\"1234567890\"}','Ali Yetkili','Başkan','+905413009999')").run();
  const AD = ['Ayşe', 'Mehmet', 'Fatma', 'Ali', 'Zeynep', 'Hasan', 'Elif', 'Mustafa', 'Hatice', 'İbrahim', 'Emine', 'Yusuf'], SOY = ['Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Arslan', 'Aydın', 'Koç', 'Polat', 'Yıldız'];
  const nm = (i) => AD[i % AD.length] + ' ' + SOY[(i * 3 + Math.floor(i / 12)) % SOY.length], tel = (i) => '541 300 ' + String(1000 + i).slice(-4).replace(/^(\d\d)(\d\d)$/, '$1 $2');
  const user = { id: null, kadi: 'demo' }, turler = db.prepare('SELECT * FROM bagis_turleri ORDER BY id').all(); let sayi = 0;
  turler.forEach((t, ti) => {
    const fon = t.kuyu && JSON.parse(t.kuyu).bicim === 'Fon';
    for (let i = 0; i < 30; i++) {
      const di = (i * 7 + ti * 3) % 60, adet = (t.org === 'Kurban' || t.org === 'Su kuyusu') && !t.tam && !fon && t.cap > 1 ? [1, 1, 2, 3][i % 4] : (t.org === 'Diğer' ? [1, 2, 5][i % 3] : 1);
      const b = { kod: '+90', tel: tel(di), ad: nm(di), tur_id: t.id, adet, para: 'TL', odeme: ['Nakit', 'Havale/EFT', 'Kredi kartı / online'][i % 3], banka_id: bk, durum: i % 10 === 9 ? 'Bekleyen' : 'Onaylı', hy: i % 2 ? 'Koç' : 'Koyun', notu: i % 7 === 0 ? 'Annemin ruhuna' : '' };
      if (t.org === 'Genel' || fon) b.tutar = 100 + ((i * 137) % 1900);
      if (t.tam) b.names = Array.from({ length: 7 }, (_, k) => ({ n: nm(di + k + 1) }));
      else if (adet > 1 && t.org === 'Kurban') b.names = Array.from({ length: adet }, (_, k) => ({ n: k ? nm(di + k + 20) : '' }));
      if (i % 5 === 4 && t.org !== 'Su kuyusu' && !t.tam && adet === 1) { b.baskasi = true; b.adina_ad = nm(di + 30); }
      try { ctx.bagisOlustur(b, user, 'Manuel (CRM)', '', null); sayi++; } catch (e) { console.error('demo:', t.ad, e.message); }
    }
  });
  db.exec("UPDATE bagislar SET tarih=date('now','-' || (30 + (id*37)%420) || ' day') WHERE bagisci_id%6=0");
  db.exec("UPDATE bagislar SET tarih=date('now','-' || ((id*29)%330) || ' day') WHERE bagisci_id%6<>0 AND id%7<>0");
  db.exec('UPDATE paylar SET tarih=(SELECT tarih FROM bagislar WHERE bagislar.id=paylar.bagis_id) WHERE EXISTS(SELECT 1 FROM bagislar WHERE bagislar.id=paylar.bagis_id)');
  Promise.resolve().then(ornekler).catch(e => console.error('demo örnekleri:', e.message));
  console.log(`Deneme verisi yüklendi: ${sayi} bağış.`); return sayi;
  };
  // sponsorluk (yetim/hafız/öğrenci), kalıcı eser, gönüllü ve banka hareketi örnekleri; ctx.call ile gerçek rotalardan geçer
  const ornekler = async () => {
    const C = ctx.call, hata = (n, e) => console.error('demo ' + n + ':', e.message);
    const ul = db.prepare('SELECT ad FROM ulkeler ORDER BY id').all().map(x => x.ad), ulk = (a) => ul.find(x => x === a) || ul[0];
    const gun = (n) => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    // gönüllüler
    const GV = [['Zehra Aksoy', 'Kadın', '0532 400 10 01', 'Aktif'], ['Murat Özkan', 'Erkek', '0532 400 10 02', 'Aktif'], ['Büşra Tunç', 'Kadın', '0532 400 10 03', 'Aday'], ['Kemal Arslan', 'Erkek', '0532 400 10 04', 'Pasif']];
    const gid = [];
    for (const [ad, cins, t, durum] of GV) { try { gid.push((await C('POST', '/api/gonullu', { ad, cinsiyet: cins, medeni: 'Evli', tel: t, il: 'İstanbul', ilce: 'Fatih', meslek: 'Öğretmen', egitim: 'Lisans', durum, kvkk: true })).id); } catch (e) { hata('gönüllü', e); } }
    // öğrenciler: yetim, hafız, medrese, okul
    const OG = [
      ['Ahmed Musa', 'Erkek', 'Çad', 9, 1, 'Babasız (yetim)', 'Medrese', 'Nur Medresesi', 0, 0], ['Fatima Yusuf', 'Kız', 'Nijer', 11, 1, 'Anne ve babasız', 'Okul', 'Niamey İlkokulu', 0, 0],
      ['Ibrahim Sani', 'Erkek', 'Mali', 13, 0, '', 'Hafızlık kursu', 'Bamako Hafızlık Kursu', 1, 12], ['Aisha Bello', 'Kız', 'Nijer', 8, 1, 'Anasız', 'Okul', 'Zinder İlkokulu', 0, 0],
      ['Omar Diallo', 'Erkek', 'Mali', 12, 1, 'Babasız (yetim)', 'Hafızlık kursu', 'Bamako Hafızlık Kursu', 1, 20], ['Mariam Traoré', 'Kız', 'Mali', 7, 1, 'Babasız (yetim)', 'Okul', 'Sikasso İlkokulu', 0, 0],
      ['Yusuf Abdi', 'Erkek', 'Somali', 14, 0, '', 'Medrese', 'Mogadişu Medresesi', 1, 5], ['Khadija Noor', 'Kız', 'Somali', 10, 1, 'Anne ve babasız', 'Okul', 'Mogadişu İlkokulu', 0, 0],
      ['Rahim Uddin', 'Erkek', 'Bangladeş', 12, 1, 'Babasız (yetim)', 'Hafızlık kursu', 'Dakka Hafızlık Kursu', 1, 27], ['Sumaiya Akter', 'Kız', 'Bangladeş', 9, 1, 'Anasız', 'Okul', 'Dakka İlkokulu', 0, 0],
      ['Hassan Ali', 'Erkek', 'Yemen', 6, 1, 'Babasız (yetim)', 'Henüz okula gitmiyor', '', 0, 0], ['Zainab Omar', 'Kız', 'Çad', 15, 0, '', 'Medrese', 'Nur Medresesi', 1, 3]];
    const oid = [];
    for (const [ad, cins, u, yas, yet, yd, ot, oa, haf, cuz] of OG) { try { const b = { ad, cinsiyet: cins, ulke: ulk(u), yas_elle: yas, yetim: !!yet, okul_tur: ot, okul_ad: oa }; if (yet) b.yetim_durum = yd; if (haf) { b.hafiz = true; b.cuz = cuz; } oid.push((await C('POST', '/api/sp/ogrenci', b)).id); } catch (e) { hata('öğrenci ' + ad, e); oid.push(0); } }
    const bg = db.prepare("SELECT DISTINCT b.id FROM bagiscilar b JOIN bagislar g ON g.bagisci_id=b.id WHERE g.durum='Onaylı' ORDER BY b.id LIMIT 40").all().map(x => x.id);
    // sponsorluklar: [öğrenci sırası, süre, aylık, başlangıç gün farkı, ilk ödeme (ay)]
    const SP = [[0, 12, 500, -130, 5], [1, 12, 400, -100, 2], [2, 24, 450, -70, 3], [3, 12, 400, -40, 2], [4, 12, 500, -35, 1], [5, 18, 350, -20, 1], [6, 12, 450, -5, 0], [8, 24, 500, -160, 5], [9, 12, 400, -75, 3]];
    for (let i = 0; i < SP.length; i++) { const [k, sure, aylik, g, ay] = SP[i]; if (!oid[k]) continue; try { const b = { ogrenci_id: oid[k], bagisci_id: bg[(i * 3) % bg.length], sure, aylik, para: 'TL', baslangic: gun(g) }; if (ay) b.ilk_odeme = { tutar: aylik * ay, odeme: 'Havale/EFT', banka_id: db.prepare('SELECT id FROM banka_hesaplari').get().id }; await C('POST', '/api/sp/sponsorluk', b); } catch (e) { hata('sponsorluk', e); } }
    // kalıcı eser projeleri
    const ES = [
      ['Niamey Merkez Camii', 'Cami', 'Nijer', 'Niamey', 850000, 120000, 35, 'İnşaat', 'Merkez mahalle için 400 kişilik cami ve abdesthane.'], ['Dakka Kuran Kursu', 'Kuran kursu', 'Bangladeş', 'Dakka', 240000, 45000, 10, 'Fon toplama', '60 öğrencilik kurs binası.'],
      ['Bamako Yetim Okulu', 'Okul', 'Mali', 'Bamako', 480000, 0, 0, 'Planlama', 'Yetim çocuklar için 8 derslikli okul.'], ['Mogadişu Sağlık Ocağı', 'Sağlık ocağı', 'Somali', 'Mogadişu', 600000, 300000, 60, 'İnşaat', 'Anne-çocuk sağlığı birimi.'],
      ['Çad Kütüphanesi', 'Kütüphane', 'Çad', 'Encemine', 150000, 150000, 100, 'Tamamlandı', 'Tamamlanan medrese kütüphanesi.']];
    for (let i = 0; i < ES.length; i++) { const [ad, tur, u, bolge, hedef, elle, il, durum, ac] = ES[i]; try { await C('POST', '/api/eser', { ad, tur, ulke: ulk(u), bolge, hedef, elle, ilerleme: il, durum, aciklama: ac, para: 'TL', tur_ac: true, web: i < 3, gonullu_id: gid[i % Math.max(1, gid.length)] || null, baslangic: gun(-200 + i * 20), sorumlu_ad: 'Saha sorumlusu ' + (i + 1) }); } catch (e) { hata('eser ' + ad, e); } }
    // eser türlerine birkaç bağış
    try { const et = db.prepare("SELECT id FROM bagis_turleri WHERE kat='Kalıcı Eser' ORDER BY id").all(); for (let i = 0; i < et.length; i++) for (let j = 0; j < 4; j++) { const ph = '541 300 ' + String(1000 + ((i * 4 + j) % 40)).slice(-4); try { ctx.bagisOlustur({ kod: '+90', tel: ph.replace(/^(\d{3})\s(\d{3})\s(\d{2})(\d{2})$/, '$1 $2 $3 $4'), ad: 'Eser Bağışçısı ' + (i * 4 + j + 1), tur_id: et[i].id, adet: 1, para: 'TL', odeme: 'Havale/EFT', banka_id: db.prepare('SELECT id FROM banka_hesaplari').get().id, tutar: 5000 + j * 7500, durum: 'Onaylı' }, { id: null, kadi: 'demo' }, 'Manuel (CRM)', '', null); } catch (e) { hata('eser bağışı', e); } } } catch (e) { hata('eser bağışları', e); }
    // banka hareketleri (içe aktarılmış ekstre): kimi tanınır, kimi tanınmaz
    try {
      const hs = db.prepare('SELECT id FROM banka_hesaplari ORDER BY id').get(), t = gun(0).split('-').reverse().join('.'), y = gun(-1).split('-').reverse().join('.');
      const sp = db.prepare('SELECT s.id FROM sp_sponsorluk s ORDER BY id DESC LIMIT 1').get(), kod = sp ? 'SP' + String(sp.id).padStart(4, '0') : 'SP0001';
      const bt = db.prepare('SELECT ad, tel FROM bagiscilar ORDER BY id LIMIT 2').all();
      const csv = ['Tarih;Açıklama;Gönderen;Tutar', `${t};Burs ${kod};${bt[0].ad.toUpperCase()};450,00`, `${t};Fitre sadaka;${bt[1].ad.toUpperCase()};150,00`, `${t};Havale ${bt[0].tel.replace(/^\+90/, '0')};Z. KAYA;1.000,00`, `${y};Genel bağış;Bilinmeyen A.Ş.;2.500,00`, `${y};Kurban hissesi;M. DEMİR;4.000,00`].join('\n');
      if (hs) await C('POST', '/api/banka/ice-aktar', { hesap_id: hs.id, metin: csv });
    } catch (e) { hata('banka', e); }
    console.log('Deneme verisi: sponsorluk, kalıcı eser, gönüllü ve banka örnekleri eklendi.');
  };
  if (process.env.DEMO !== '1') return;
  if (!db.prepare('SELECT 1 FROM bagislar').get()) yukle();
  ctx.R('POST', '/api/demo/yenile', 'birim', 's', async (c) => { // yalnızca deneme ortamı: bağış verisini silip yeniden yükler
    ctx.tx(() => { ['paylar', 'birimler_org', 'bagislar', 'bagiscilar', 'sms_log', 'pdf_liste', 'sayac', 'kn_sayac', 'sp_odeme', 'sp_sponsorluk', 'sp_not', 'sp_medya', 'sp_ogrenci', 'eser_not', 'eser_dosya', 'eser', 'gonulluler', 'banka_hareket'].forEach(t => db.exec('DELETE FROM ' + t)); });
    return [200, { n: yukle() }];
  });
};
