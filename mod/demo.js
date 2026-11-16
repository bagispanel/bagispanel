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
  console.log(`Deneme verisi yüklendi: ${sayi} bağış.`); return sayi;
  };
  if (process.env.DEMO !== '1') return;
  if (!db.prepare('SELECT 1 FROM bagislar').get()) yukle();
  ctx.R('POST', '/api/demo/yenile', 'birim', 's', async (c) => { // yalnızca deneme ortamı: bağış verisini silip yeniden yükler
    ctx.tx(() => { ['paylar', 'birimler_org', 'bagislar', 'bagiscilar', 'sms_log', 'pdf_liste', 'sayac', 'kn_sayac'].forEach(t => db.exec('DELETE FROM ' + t)); });
    return [200, { n: yukle() }];
  });
};
