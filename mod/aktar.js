// Veri Aktarımı: geçmiş bağışlar ve kumbaralar (Excel). Önce ÖNİZLEME; aktarımda SMS/sertifika/organizasyon kaydı oluşmaz.
// Her aktarım bir "parti"dir: hatalıysa tek tıkla geri alınır (kayıtlar silinmez, "İptal" olur; raporlama ilkesi).
// Aktarım kurumun beyanına dayanır: kişilerin verisini hukuka uygun elde ettiğini ve aydınlatmayı yaptığını işaretlemesi zorunludur (KVKK).
const X = require('../xlsx');
module.exports = function (ctx) {
  const { R, Err, A, db, tx, str, ip, normPh } = ctx;
  const yeni = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/[çÇ]/g, 'c').replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i').replace(/[öÖ]/g, 'o').replace(/[şŞ]/g, 's').replace(/[üÜ]/g, 'u').replace(/[^a-z0-9]/g, '');
  const bugun = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10), dosya = (buf, ad) => ({ ad, dosya: buf.toString('base64') });
  db.exec(`CREATE TABLE IF NOT EXISTS aktarim(id INTEGER PRIMARY KEY, tur TEXT NOT NULL, dosya TEXT, adet INTEGER NOT NULL, ozet TEXT, kullanici TEXT, zaman TEXT NOT NULL DEFAULT (datetime('now','localtime')), durum TEXT NOT NULL DEFAULT 'Aktif', iptal_neden TEXT)`);
  for (const q of ['ALTER TABLE bagislar ADD COLUMN aktarim_id INTEGER', 'ALTER TABLE kumbaralar ADD COLUMN aktarim_id INTEGER', 'ALTER TABLE kumbara_sayim ADD COLUMN aktarim_id INTEGER']) { try { db.exec(q); } catch { /* var */ } }
  const MAX = 10000, EXCEL_ZAMAN = Date.UTC(1899, 11, 30);

  // ---- ayrıştırıcılar ----
  const tarihOku = (v) => { v = String(v ?? '').trim(); if (!v) return null; let m;
    if (/^\d{5}(\.\d+)?$/.test(v)) { const d = new Date(EXCEL_ZAMAN + Math.floor(+v) * 864e5); return d.toISOString().slice(0, 10); }
    if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(v))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v))) return `${m[1]}-${m[2]}-${m[3]}`; return null; };
  const tarihOk = (t) => { if (!t) return false; const d = new Date(t + 'T12:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === t && t >= '2000-01-01' && t <= bugun(); };
  const sayiOku = (v) => { v = String(v ?? '').trim().replace(/[^\d.,-]/g, ''); if (!v) return NaN; if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, ''); return Number(v); };
  const paraOku = (v) => { const k = yeni(v); if (!k || ['tl', 'try', 'trl', 'lira', 'turklirasi'].includes(k)) return 'TL'; if (['usd', 'dolar', 'amerikandolari', 'dollar'].includes(k)) return 'USD'; if (['eur', 'euro', 'avro'].includes(k)) return 'EUR'; return null; };
  const odemeOku = (v) => { const k = yeni(v); if (!k || ['nakit', 'elden', 'kasa'].includes(k)) return 'Nakit'; if (['havale', 'eft', 'havaleeft', 'banka', 'iban'].includes(k)) return 'Havale/EFT'; if (['kart', 'kredikarti', 'kredikartionline', 'online', 'pos', 'bankakarti'].includes(k)) return 'Kredi kartı / online'; return null; };
  const bul = (S, ALAN) => { const idx = {}; S[0].forEach((h, i) => { const k = yeni(h); for (const [a, ad] of Object.entries(ALAN)) if (idx[a] == null && ad.includes(k)) idx[a] = i; }); return idx; };
  const oku = (b) => { if (!b.dosya || typeof b.dosya !== 'string') throw new Err(400, 'Excel dosyası seçin.'); let t; try { t = X.oku(Buffer.from(b.dosya, 'base64')); } catch (e) { throw new Err(400, e.message || 'Dosya okunamadı.'); }
    if (t.satirlar.length < 2) throw new Err(400, 'Dosyada veri satırı yok. İlk satır başlık olmalı.'); if (t.satirlar.length - 1 > MAX) throw new Err(400, `En fazla ${MAX.toLocaleString('tr-TR')} satır; dosyayı bölün.`); return t.satirlar; };
  const gerekBeyan = (b) => { if (b.mod === 'aktar' && !b.beyan) throw new Err(400, 'Beyan kutusunu işaretleyin: verilerin hukuka uygun elde edildiğini ve aydınlatmanın yapıldığını onaylamalısınız.'); };

  // ================= GEÇMİŞ BAĞIŞLAR =================
  const BBAS = ['Tarih *', 'Ad Soyad *', 'Telefon *', 'Bağış Türü *', 'Tutar *', 'Para Birimi', 'TL Karşılığı', 'Ödeme Yöntemi', 'Adet', 'Not', 'Eski Bağış No', 'Adına Bağış Yapılan'];
  const BALAN = { tarih: ['tarih', 'bagistarihi', 'tarihi'], ad: ['adsoyad', 'ad', 'isim', 'bagisci', 'bagiscia', 'adisim'], tel: ['telefon', 'tel', 'gsm', 'cep', 'ceptelefonu', 'telefonno'], tur: ['bagisturu', 'tur', 'bagis', 'kategori', 'bagiskonusu'], tutar: ['tutar', 'miktar', 'bagistutari'], para: ['parabirimi', 'para', 'doviz', 'birim'], tl: ['tlkarsiligi', 'tl', 'tltutar', 'tlkarsilik'], odeme: ['odemeyontemi', 'odeme', 'yontem', 'odemeturu'], adet: ['adet', 'hisse', 'adetsayisi'], notu: ['not', 'aciklama', 'notlar'], eski: ['eskibagisno', 'bagisno', 'eskino', 'makbuzno', 'fisno'], adina: ['adinabagisyapilan', 'adina', 'adinayapilan'] };
  const turler = () => db.prepare('SELECT id, kat, ad, org FROM bagis_turleri ORDER BY kat, ad').all();
  const turBul = (L, v) => { const k = yeni(v); if (!k) return { hata: 'Bağış türü boş.' }; let m = L.filter((t) => yeni(t.kat + t.ad) === k || yeni(t.kat + '>' + t.ad) === k); if (!m.length) m = L.filter((t) => yeni(t.ad) === k); if (m.length === 1) return { t: m[0] }; if (m.length > 1) return { hata: `“${v}” birden fazla kategoride var; “Kategori > Ad” yazın.` }; return { hata: `Bağış türü bulunamadı: “${v}” (Bağış Türleri’ndeki adı yazın).` }; };

  R('GET', '/api/aktar/bagis-ornek', 'aktar', 'g', async () => {
    const L = turler(), t1 = L[0] ? L[0].kat + ' > ' + L[0].ad : 'Genel bağış > Fitre';
    return [200, dosya(X.yaz([
      { ad: 'Geçmiş bağışlar', satirlar: [BBAS, ['15.03.2025', 'Ayşe Yılmaz', '0541 000 00 01', t1, '1.500', 'TL', '', 'Nakit', '1', 'Ramazan bağışı', 'M-2025-0143', ''], ['02.06.2025', 'Hans Müller', '+49 151 00000003', t1, '100', 'EUR', '4.150', 'Havale/EFT', '1', '', 'M-2025-0201', ''], ['10.07.2025', 'Mehmet Demir', '0542 000 00 02', t1, '3.000', 'TL', '', 'Kredi kartı / online', '1', '', '', 'Fatma Demir']], metinSutun: [1, 2, 3, 10], genislik: [12, 24, 20, 30, 12, 12, 14, 20, 8, 28, 18, 24] },
      { ad: 'Bağış türleri', satirlar: [['Kategori', 'Bağış Türü (bu yazımla yazın)'], ...L.map((t) => [t.kat, t.kat + ' > ' + t.ad])], genislik: [26, 46] },
      { ad: 'Nasıl yüklenir', satirlar: [['Adım', 'Açıklama'], ['1', '“Geçmiş bağışlar” sayfasının ÜZERİNE kendi kayıtlarınızı yazın (3 örnek satırı silin). Başlıkları değiştirmeyin.'], ['2', 'Zorunlu: Tarih, Ad Soyad, Telefon, Bağış Türü, Tutar. Bağış Türü, “Bağış türleri” sayfasındaki yazımla aynı olmalı.'], ['3', 'Tarih GG.AA.YYYY yazın (ya da Excel tarihi). Gelecek tarih kabul edilmez. Telefonu “Metin” biçiminde tutun (başındaki 0 kaybolmasın).'], ['4', 'Döviz bağışlarda (USD/EUR) “TL Karşılığı”nı O GÜNKÜ kurla siz yazın; sistem bugünün kurunu kullanmaz.'], ['5', '“Eski Bağış No” varsa yazın: aynı numara iki kez içeri alınmaz. Yoksa aynı kişi+tarih+tür+tutar kaydı “mükerrer” sayılır.'], ['6', 'Önizleme, hiçbir kayıt eklemeden sonucu gösterir. Aktarımda SMS, sertifika ya da organizasyon (kurban/kuyu) kaydı OLUŞMAZ; yalnızca geçmiş bağış olarak raporlara girer.'], ['7', 'Yanlış aktarırsanız “Aktarım geçmişi”nden partiyi iptal edebilirsiniz (kayıtlar silinmez, İptal olur).']], genislik: [8, 120] },
    ]), 'gecmis-bagis-sablon.xlsx')];
  });

  R('POST', '/api/aktar/bagis', 'aktar', 'e', async (c) => {
    const b = c.body || {}, onizle = b.mod !== 'aktar'; gerekBeyan(b); const S = oku(b), idx = bul(S, BALAN);
    for (const [k, ad] of [['tarih', 'Tarih'], ['ad', 'Ad Soyad'], ['tel', 'Telefon'], ['tur', 'Bağış Türü'], ['tutar', 'Tutar']]) if (idx[k] == null) throw new Err(400, `İlk satırda “${ad}” başlığı bulunamadı. Örnek şablonu indirip kullanın.`);
    const hv = (r, a) => idx[a] == null ? '' : String(r[idx[a]] ?? '').trim(), L = turler();
    const bg = new Map(db.prepare('SELECT id, tel FROM bagiscilar').all().map((x) => [x.tel, x.id])), eskiler = new Set(db.prepare("SELECT xid FROM bagislar WHERE xid LIKE 'excel:%'").all().map((x) => x.xid));
    const imza = new Set(db.prepare("SELECT b.tel, g.tarih, g.tur_id, g.para, g.tutar FROM bagislar g JOIN bagiscilar b ON b.id=g.bagisci_id WHERE g.durum<>'İptal'").all().map((x) => `${x.tel}|${x.tarih}|${x.tur_id}|${x.para}|${x.tutar}`)), dosyada = new Set();
    const sonuc = [], ekle = []; let bos = 0, yeniKisi = new Set(); const toplam = { TL: 0, USD: 0, EUR: 0 };
    for (let i = 1; i < S.length; i++) {
      const r = S[i], satir = i + 1, ad = hv(r, 'ad'), telH = hv(r, 'tel'), tarihH = hv(r, 'tarih'), turH = hv(r, 'tur'), tutarH = hv(r, 'tutar');
      if (!ad && !telH && !tarihH && !turH && !tutarH) { bos++; continue; }
      const hata = (neden) => sonuc.push({ satir, ad, tel: telH, tarih: tarihH, durum: 'Hatalı', neden });
      if (!ad) { hata('Ad soyad boş.'); continue; } if (ad.length > 80) { hata('Ad soyad çok uzun.'); continue; }
      let tel; try { tel = normPh('+90', telH.replace(/[()\-.]/g, ' ')); } catch (e) { hata(e.message); continue; }
      const tarih = tarihOku(tarihH); if (!tarihOk(tarih)) { hata(`Tarih geçersiz ya da gelecekte: “${tarihH}” (GG.AA.YYYY yazın).`); continue; }
      const tb = turBul(L, turH); if (tb.hata) { hata(tb.hata); continue; }
      const tutar = sayiOku(tutarH); if (!(tutar > 0) || tutar > 1e8) { hata(`Tutar geçersiz: “${tutarH}”.`); continue; }
      const para = paraOku(hv(r, 'para')); if (!para) { hata(`Para birimi tanınmadı: “${hv(r, 'para')}” (TL, USD ya da EUR).`); continue; }
      let tl = tutar; if (para !== 'TL') { tl = sayiOku(hv(r, 'tl')); if (!(tl > 0)) { hata(`${para} bağışta “TL Karşılığı” gerekli (o günkü kurla siz yazın).`); continue; } }
      const odeme = odemeOku(hv(r, 'odeme')); if (!odeme) { hata(`Ödeme yöntemi tanınmadı: “${hv(r, 'odeme')}” (Nakit, Havale/EFT, Kredi kartı).`); continue; }
      const adet = hv(r, 'adet') ? Math.floor(sayiOku(hv(r, 'adet'))) : 1; if (!(adet >= 1) || adet > 10000) { hata('Adet geçersiz.'); continue; }
      const eski = hv(r, 'eski'), xid = eski ? 'excel:' + eski.slice(0, 60) : null;
      if (xid && (eskiler.has(xid) || dosyada.has(xid))) { sonuc.push({ satir, ad, tel, tarih, durum: 'Mükerrer', neden: `Eski bağış no “${eski}” daha önce alınmış.` }); continue; }
      const sig = `${tel}|${tarih}|${tb.t.id}|${para}|${tutar}`; if (!xid && (imza.has(sig) || dosyada.has(sig))) { sonuc.push({ satir, ad, tel, tarih, durum: 'Mükerrer', neden: 'Aynı kişi, tarih, tür ve tutarda kayıt var.' }); continue; }
      dosyada.add(xid || sig); const adina = hv(r, 'adina').slice(0, 80) || null;
      if (!bg.has(tel)) yeniKisi.add(tel); toplam[para] += tutar;
      sonuc.push({ satir, ad, tel, tarih, durum: 'Yeni', neden: '', tur: tb.t.kat + ' > ' + tb.t.ad, tutar, para }); ekle.push({ tel, ad, tarih, tur_id: tb.t.id, tutar, para, tl, odeme, adet, notu: hv(r, 'notu').slice(0, 400) || null, xid, adina });
    }
    const say = (d) => sonuc.filter((x) => x.durum === d).length, ozet = { toplam: sonuc.length, bos, yeni: say('Yeni'), mukerrer: say('Mükerrer'), hatali: say('Hatalı'), yeniBagisci: yeniKisi.size, tutarTL: Math.round(ekle.reduce((a, e) => a + e.tl, 0)), tarihAralik: ekle.length ? [ekle.map((e) => e.tarih).sort()[0], ekle.map((e) => e.tarih).sort().pop()] : null };
    const goster = [...sonuc.filter((x) => x.durum === 'Hatalı'), ...sonuc.filter((x) => x.durum === 'Mükerrer'), ...sonuc.filter((x) => x.durum === 'Yeni')].slice(0, 150);
    if (onizle) return [200, { onizleme: true, ozet, satirlar: goster }];
    if (!ekle.length) throw new Err(400, 'Aktarılacak yeni kayıt yok.');
    const pid = tx(() => {
      const id = +db.prepare('INSERT INTO aktarim(tur,dosya,adet,ozet,kullanici) VALUES(?,?,?,?,?)').run('bagis', str(b.dosya_adi, 120) || null, ekle.length, JSON.stringify(ozet), c.user.kadi).lastInsertRowid;
      const insB = db.prepare("INSERT INTO bagiscilar(tel,ad,riza_tarih,riza_kaynak) VALUES(?,?,?,'Kurum beyanı (Excel aktarım)')"), ins = db.prepare("INSERT INTO bagislar(bagisci_id,tur_id,adet,para,tutar,tl,kendi,adina_ad,notu,odeme,durum,tarih,kaynak,xid,secenek,kullanici,aktarim_id) VALUES(?,?,?,?,?,?,?,?,?,?,'Onaylı',?,?,?,'{}',?,?)"), no = db.prepare('UPDATE bagislar SET no=? WHERE id=?');
      for (const e of ekle) { let bid = bg.get(e.tel); if (!bid) { bid = +insB.run(e.tel, e.ad, bugun()).lastInsertRowid; bg.set(e.tel, bid); }
        const g = +ins.run(bid, e.tur_id, e.adet, e.para, e.tutar, e.tl, e.adina ? 0 : 1, e.adina, e.notu, e.odeme, e.tarih, 'Excel aktarım (geçmiş)', e.xid, c.user.kadi, id).lastInsertRowid; no.run('BG-' + e.tarih.slice(0, 4) + '-' + String(g).padStart(5, '0'), g); }
      return id;
    });
    A.audit(c.user, 'bagis_excel_aktar', `parti #${pid}: ${ozet.yeni} bağış, ${ozet.yeniBagisci} yeni bağışçı, mükerrer ${ozet.mukerrer}, hatalı ${ozet.hatali}`, ip(c.req));
    return [200, { onizleme: false, parti: pid, ozet }];
  });

  // ================= KUMBARALAR =================
  const KBAS = ['Kumbara Yeri *', 'Tür', 'İl', 'İlçe', 'Yetkili Kişi', 'Telefon', 'Adres', 'Yerleştirme Tarihi', 'Durum', 'Sayım Tarihi', 'Sayım Tutarı', 'Para Birimi', 'Sayan Kişi', 'Sayım Notu'];
  const KALAN = { ad: ['kumbarayeri', 'yer', 'ad', 'kumbara', 'kumbaraadi', 'yeri'], tur: ['tur', 'kumbaraturu'], il: ['il', 'sehir'], ilce: ['ilce'], yetkili: ['yetkilikisi', 'yetkili', 'sorumlu'], tel: ['telefon', 'tel', 'gsm'], adres: ['adres'], yerlesim: ['yerlestirmetarihi', 'yerlestirme', 'yerlesimtarihi'], durum: ['durum'], st: ['sayimtarihi', 'sayimtar'], sutar: ['sayimtutari', 'sayimtutar', 'tutar'], para: ['parabirimi', 'para'], sayan: ['sayankisi', 'sayan'], snot: ['sayimnotu', 'not'] };
  const KTUR = ['Esnaf', 'Cami / Mescit', 'Okul', 'Ev', 'Kurum / Şirket', 'Diğer'];
  R('GET', '/api/aktar/kumbara-ornek', 'aktar', 'g', async () => [200, dosya(X.yaz([
    { ad: 'Kumbaralar', satirlar: [KBAS, ['Yıldız Market', 'Esnaf', 'Konya', 'Selçuklu', 'Ali Usta', '0332 000 00 01', 'Merkez Mah. 12', '01.03.2024', 'Aktif', '15.06.2025', '1.250,50', 'TL', 'Meriç', ''], ['Yıldız Market', '', '', '', '', '', '', '', '', '20.12.2025', '1.780', 'TL', 'Meriç', 'Ramazan öncesi'], ['Merkez Camii', 'Cami / Mescit', 'Konya', 'Meram', 'Hasan Hoca', '', '', '', 'Aktif', '', '', '', '', '']], metinSutun: [5], genislik: [26, 16, 14, 14, 18, 18, 28, 16, 10, 14, 14, 12, 16, 24] },
    { ad: 'Nasıl yüklenir', satirlar: [['Adım', 'Açıklama'], ['1', 'Her satır bir kumbaradır; aynı kumbaranın birden çok sayımı varsa AYNI Yer/İl/İlçe ile alt alta ayrı satır yazın (kumbara bilgileri ilk satırdan alınır).'], ['2', 'Zorunlu yalnızca “Kumbara Yeri”. Tür: ' + KTUR.join(', ') + '. Boşsa “Esnaf”. Durum: Aktif/Pasif, boşsa Aktif.'], ['3', 'Sayım isteğe bağlı: Sayım Tarihi ve Sayım Tutarı doluysa o sayım da eklenir. Döviz sayımda (USD/EUR) o günkü TL kuru yoksa bugünün kuru kullanılır, tutarı kontrol edin.'], ['4', 'Aynı yerde, aynı il/ilçede zaten kayıtlı kumbara varsa yenisi açılmaz; sayımlar o kumbaraya eklenir.'], ['5', 'Önizleme hiçbir kayıt eklemez. Yanlış aktarım “Aktarım geçmişi”nden iptal edilir.']], genislik: [8, 120] },
  ]), 'kumbara-sablon.xlsx')]);

  R('POST', '/api/aktar/kumbara', 'aktar', 'e', async (c) => {
    const b = c.body || {}, onizle = b.mod !== 'aktar'; gerekBeyan(b); const S = oku(b), idx = bul(S, KALAN); if (idx.ad == null) throw new Err(400, 'İlk satırda “Kumbara Yeri” başlığı bulunamadı. Örnek şablonu indirip kullanın.');
    const hv = (r, a) => idx[a] == null ? '' : String(r[idx[a]] ?? '').trim(), RATE = ctx.RATE || { TL: 1, USD: 35, EUR: 38 };
    const anahtar = (ad, il, ilce) => yeni(ad) + '|' + yeni(il) + '|' + yeni(ilce), kayitli = new Map(db.prepare('SELECT id, ad, il, ilce FROM kumbaralar').all().map((k) => [anahtar(k.ad, k.il, k.ilce), k.id]));
    const gruplar = new Map(), sonuc = []; let bos = 0;
    for (let i = 1; i < S.length; i++) {
      const r = S[i], satir = i + 1, ad = hv(r, 'ad'); if (!ad && !hv(r, 'st') && !hv(r, 'sutar')) { bos++; continue; }
      const hata = (neden) => sonuc.push({ satir, ad, durum: 'Hatalı', neden }); if (!ad) { hata('Kumbara yeri boş.'); continue; } if (ad.length > 120) { hata('Kumbara yeri çok uzun.'); continue; }
      const il = hv(r, 'il').slice(0, 60), ilce = hv(r, 'ilce').slice(0, 60), key = anahtar(ad, il, ilce); let g = gruplar.get(key);
      if (!g) { const turH = hv(r, 'tur'), tur = turH ? KTUR.find((x) => yeni(x) === yeni(turH)) : 'Esnaf', durH = hv(r, 'durum'), durum = durH ? ['Aktif', 'Pasif'].find((x) => yeni(x) === yeni(durH)) : 'Aktif', yer = hv(r, 'yerlesim') ? tarihOku(hv(r, 'yerlesim')) : null;
        if (!tur) { hata(`Tür tanınmadı: “${turH}” (${KTUR.join(', ')}).`); continue; } if (!durum) { hata(`Durum tanınmadı: “${durH}” (Aktif/Pasif).`); continue; } if (hv(r, 'yerlesim') && !tarihOk(yer)) { hata(`Yerleştirme tarihi geçersiz: “${hv(r, 'yerlesim')}”.`); continue; }
        g = { satir, ad, il, ilce, tur, durum, yerlesim: yer, yetkili: hv(r, 'yetkili').slice(0, 100) || null, tel: hv(r, 'tel').slice(0, 30) || null, adres: hv(r, 'adres').slice(0, 240) || null, mevcut: kayitli.get(key) || null, sayimlar: [] }; gruplar.set(key, g); }
      if (hv(r, 'st') || hv(r, 'sutar')) { const t = tarihOku(hv(r, 'st')), tutar = sayiOku(hv(r, 'sutar')), para = paraOku(hv(r, 'para'));
        if (!tarihOk(t)) { hata(`Sayım tarihi geçersiz ya da gelecekte: “${hv(r, 'st')}”.`); continue; } if (!(tutar > 0) || tutar > 1e8) { hata(`Sayım tutarı geçersiz: “${hv(r, 'sutar')}”.`); continue; } if (!para) { hata(`Para birimi tanınmadı: “${hv(r, 'para')}”.`); continue; }
        if (g.mevcut && db.prepare('SELECT 1 FROM kumbara_sayim WHERE kumbara_id=? AND tarih=? AND tutar=? AND para=? AND iptal=0').get(g.mevcut, t, tutar, para)) { sonuc.push({ satir, ad, durum: 'Mükerrer', neden: `${t} tarihli ${tutar} ${para} sayım zaten kayıtlı.` }); continue; }
        if (g.sayimlar.some((s) => s.t === t && s.tutar === tutar && s.para === para)) { sonuc.push({ satir, ad, durum: 'Mükerrer', neden: 'Aynı sayım dosyada iki kez var.' }); continue; }
        g.sayimlar.push({ t, tutar, para, sayan: hv(r, 'sayan').slice(0, 100) || null, notu: hv(r, 'snot').slice(0, 300) || null }); }
    }
    const G = [...gruplar.values()]; G.forEach((g) => sonuc.push({ satir: g.satir, ad: g.ad, il: g.il, durum: g.mevcut ? 'Mevcut (sayım eklenir)' : 'Yeni', neden: g.sayimlar.length ? `${g.sayimlar.length} sayım` : '' }));
    const yeniK = G.filter((g) => !g.mevcut).length, sayimAdet = G.reduce((a, g) => a + g.sayimlar.length, 0), ozet = { toplam: G.length, bos, yeni: yeniK, mevcut: G.length - yeniK, sayim: sayimAdet, hatali: sonuc.filter((x) => x.durum === 'Hatalı').length, mukerrer: sonuc.filter((x) => x.durum === 'Mükerrer').length };
    const goster = [...sonuc.filter((x) => x.durum === 'Hatalı'), ...sonuc.filter((x) => x.durum === 'Mükerrer'), ...sonuc.filter((x) => !['Hatalı', 'Mükerrer'].includes(x.durum))].slice(0, 150);
    if (onizle) return [200, { onizleme: true, ozet, satirlar: goster }];
    if (!yeniK && !sayimAdet) throw new Err(400, 'Aktarılacak yeni kumbara ya da sayım yok.');
    const pid = tx(() => {
      const id = +db.prepare('INSERT INTO aktarim(tur,dosya,adet,ozet,kullanici) VALUES(?,?,?,?,?)').run('kumbara', str(b.dosya_adi, 120) || null, yeniK + sayimAdet, JSON.stringify(ozet), c.user.kadi).lastInsertRowid;
      const insK = db.prepare('INSERT INTO kumbaralar(kod,ad,tur,il,ilce,adres,yetkili,tel,yerlesim,durum,kullanici,aktarim_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'), kodla = db.prepare('UPDATE kumbaralar SET kod=? WHERE id=?'), insS = db.prepare('INSERT INTO kumbara_sayim(kumbara_id,tarih,tutar,para,tl,sayan,notu,kullanici,aktarim_id) VALUES(?,?,?,?,?,?,?,?,?)');
      for (const g of G) { let kid = g.mevcut; if (!kid) { kid = +insK.run('TMP' + Date.now() + Math.random(), g.ad, g.tur, g.il || null, g.ilce || null, g.adres, g.yetkili, g.tel, g.yerlesim, g.durum, c.user.kadi, id).lastInsertRowid; kodla.run('KM-' + String(kid).padStart(4, '0'), kid); }
        for (const s of g.sayimlar) insS.run(kid, s.t, s.tutar, s.para, s.tutar * (RATE[s.para] || 1), s.sayan, s.notu, c.user.kadi, id); }
      return id;
    });
    A.audit(c.user, 'kumbara_excel_aktar', `parti #${pid}: ${yeniK} kumbara, ${sayimAdet} sayım`, ip(c.req));
    return [200, { onizleme: false, parti: pid, ozet }];
  });

  // ================= GEÇMİŞ / GERİ ALMA =================
  R('GET', '/api/aktar/gecmis', 'aktar', 'g', async () => [200, db.prepare('SELECT * FROM aktarim ORDER BY id DESC LIMIT 100').all().map((a) => ({ ...a, ozet: a.ozet ? JSON.parse(a.ozet) : {} }))]);
  R('POST', '/api/aktar/([0-9]+)/iptal', 'aktar', 'd', async (c) => {
    const a = db.prepare('SELECT * FROM aktarim WHERE id=?').get(+c.m[1]); if (!a) throw new Err(404, 'Aktarım bulunamadı.'); if (a.durum !== 'Aktif') throw new Err(409, 'Bu aktarım zaten iptal edilmiş.');
    const neden = str(c.body.neden, 200); if (!neden) throw new Err(400, 'İptal nedenini yazın.');
    tx(() => {
      if (a.tur === 'bagis') db.prepare("UPDATE bagislar SET durum='İptal', xid=CASE WHEN xid IS NULL THEN NULL ELSE xid||'#iptal'||aktarim_id END, iptal_sebep=?, iptal_tarih=? WHERE aktarim_id=? AND durum<>'İptal'").run('Hatalı aktarım iptali: ' + neden, bugun(), a.id);
      else { db.prepare("UPDATE kumbara_sayim SET iptal=1, iptal_neden=? WHERE aktarim_id=? AND iptal=0").run('Hatalı aktarım iptali: ' + neden, a.id); db.prepare("UPDATE kumbaralar SET durum='Pasif' WHERE aktarim_id=?").run(a.id); }
      db.prepare("UPDATE aktarim SET durum='İptal', iptal_neden=? WHERE id=?").run(neden, a.id);
    });
    A.audit(c.user, 'aktarim_iptal', `parti #${a.id} (${a.tur}) · ${neden}`, ip(c.req)); return [200, { ok: 1 }];
  });
};
