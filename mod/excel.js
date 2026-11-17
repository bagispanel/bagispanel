// Bağışçı rehberi için Excel (.xlsx) aktarma / indirme ve örnek şablon. Dosya base64 olarak JSON içinde gelir/gider.
const X = require('../xlsx');
module.exports = function (ctx) {
  const { R, Err, A, db, tx, str, ip, normPh } = ctx;
  const BASLIK = ['Ad Soyad *', 'Telefon *', 'E-posta', 'Adres'];
  const yeni = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/[çÇ]/g, 'c').replace(/[ğĞ]/g, 'g').replace(/[ıİ]/g, 'i').replace(/[öÖ]/g, 'o').replace(/[şŞ]/g, 's').replace(/[üÜ]/g, 'u').replace(/[^a-z0-9]/g, '');
  const ALAN = { ad: ['adsoyad', 'ad', 'isim', 'adisim', 'adiniz', 'isimsoyisim'], tel: ['telefon', 'tel', 'gsm', 'cep', 'ceptelefonu', 'telefonno', 'cepno', 'telno'], eposta: ['eposta', 'email', 'mail', 'epostaadresi'], adres: ['adres', 'iladres', 'il', 'sehir'] };
  const dosya = (buf, ad) => ({ ad, dosya: buf.toString('base64') });
  const gun = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

  R('GET', '/api/bagisci-excel/ornek', 'bagisci', 'g', async () => {
    const buf = X.yaz([
      { ad: 'Bağışçılar', satirlar: [BASLIK, ['Ayşe Yılmaz', '+90 541 000 00 01', 'ayse@ornek.com', 'İstanbul / Fatih'], ['Mehmet Demir', '0542 000 00 02', '', 'Konya'], ['Hans Müller', '+49 151 00000003', 'hans@ornek.de', 'Berlin']], metinSutun: [1], genislik: [26, 22, 28, 30] },
      { ad: 'Nasıl yüklenir', satirlar: [['Adım', 'Açıklama'],
        ['1', 'Bu dosyadaki "Bağışçılar" sayfasının ÜZERİNE KENDİ LİSTENİZİ yazın (örnek 3 satırı silebilirsiniz). İlk satırdaki başlıkları değiştirmeyin.'],
        ['2', 'Ad Soyad ve Telefon zorunludur. E-posta ve Adres boş bırakılabilir.'],
        ['3', 'Türkiye numaraları: 0541 000 00 01, 541 000 00 01 veya +90 541 000 00 01 yazılabilir; boşluk, 0 ve +90 fark etmez. Cep numarası 5 ile başlamalıdır.'],
        ['4', 'Yurt dışı numaraları mutlaka + ve ülke koduyla yazılmalıdır (örn. +49 151 00000003).'],
        ['5', 'Excel numaranın başındaki 0 ve + işaretini silebilir: telefon sütununu "Metin" biçimine çevirin ya da numaranın önüne tek tırnak (\') koyun.'],
        ['6', 'Bağışçı Rehberi → "Excel’den aktar" ile dosyayı seçin. Önce ÖNİZLEME gösterilir; hatalı satırlar ve zaten kayıtlı numaralar işaretlenir. Onaylamadan kayıt yapılmaz.'],
        ['7', 'Aynı telefon numarası zaten kayıtlıysa varsayılan olarak atlanır. İsterseniz "kayıtlıların bilgilerini güncelle" seçeneğiyle ad, e-posta ve adres güncellenir (düzeltme yetkisi gerekir).'],
        ['8', 'Tek seferde en fazla 5.000 satır yükleyin. Dosya .xlsx olmalıdır (.xls veya .csv değil).']], genislik: [8, 120] }]);
    return [200, dosya(buf, 'bagisci-aktarma-ornek.xlsx')];
  });

  R('GET', '/api/bagisci-excel/indir', 'bagisci', 'g', async (c) => {
    const L = db.prepare(`SELECT b.*, COUNT(g.id) adet, MAX(CASE WHEN g.durum='Onaylı' THEN g.tarih END) son, COALESCE(SUM(CASE WHEN g.durum='Onaylı' THEN g.tl END),0) toplam FROM bagiscilar b LEFT JOIN bagislar g ON g.bagisci_id=b.id GROUP BY b.id ORDER BY b.ad COLLATE NOCASE`).all();
    const rows = [[...BASLIK.map(h => h.replace(' *', '')), 'Kayıt tarihi', 'Bağış sayısı', 'Toplam bağış (₺)', 'Son bağış tarihi'], ...L.map(b => [b.ad, b.tel, b.eposta || '', b.adres || '', String(b.kayit || '').slice(0, 10), b.adet, Math.round(b.toplam * 100) / 100, b.son || ''])];
    A.audit(c.user, 'bagisci_excel_indir', `${L.length} kayıt`, ip(c.req));
    return [200, dosya(X.yaz([{ ad: 'Bağışçılar', satirlar: rows, metinSutun: [1, 4, 7], paraSutun: [6], genislik: [28, 20, 30, 34, 14, 12, 18, 16] }]), `bagiscilar-${gun()}.xlsx`)];
  });

  R('POST', '/api/bagisci-excel/aktar', 'bagisci', 'e', async (c) => {
    const b = c.body || {}, onizle = b.mod !== 'aktar', guncelle = b.mevcut === 'guncelle';
    if (guncelle && !A.can(c.perms, 'bagisci', 'd')) throw new Err(403, 'Kayıtlı bağışçıları güncellemek için düzeltme yetkisi gerekir.');
    if (!b.dosya || typeof b.dosya !== 'string') throw new Err(400, 'Excel dosyası seçin.');
    let tablo; try { tablo = X.oku(Buffer.from(b.dosya, 'base64')); } catch (e) { throw new Err(400, e.message || 'Dosya okunamadı.'); }
    const S = tablo.satirlar; if (S.length < 2) throw new Err(400, 'Dosyada veri satırı yok. İlk satır başlık, altındakiler bağışçılar olmalı.');
    if (S.length - 1 > 5000) throw new Err(400, 'En fazla 5.000 satır yükleyebilirsiniz; dosyayı bölün.');
    const idx = {}; S[0].forEach((h, i) => { const k = yeni(h); for (const [a, adlar] of Object.entries(ALAN)) if (idx[a] == null && adlar.includes(k)) idx[a] = i; });
    if (idx.ad == null || idx.tel == null) throw new Err(400, 'İlk satırda "Ad Soyad" ve "Telefon" başlıkları bulunamadı. Örnek şablonu indirip kullanın.');
    const hv = (r, a) => idx[a] == null ? '' : String(r[idx[a]] ?? '').trim();
    const var_ = new Map(db.prepare('SELECT id,tel,ad FROM bagiscilar').all().map(x => [x.tel, x])), dosyada = new Set(), sonuc = [], ekle = [];
    let bos = 0;
    for (let i = 1; i < S.length; i++) {
      const r = S[i], ad = hv(r, 'ad'), telH = hv(r, 'tel'), mail = hv(r, 'eposta').toLowerCase(), adres = hv(r, 'adres'); const satir = i + 1;
      if (!ad && !telH && !mail && !adres) { bos++; continue; }
      const hata = (neden) => sonuc.push({ satir, ad, tel: telH, durum: 'Hatalı', neden });
      if (!ad) { hata('Ad soyad boş.'); continue; } if (ad.length > 80) { hata('Ad soyad çok uzun.'); continue; }
      if (!telH) { hata('Telefon boş.'); continue; }
      let tel; try { tel = normPh('+90', telH.replace(/[()\-.]/g, ' ')); } catch (e) { hata(e.message); continue; }
      if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { hata('E-posta geçersiz.'); continue; }
      if (dosyada.has(tel)) { sonuc.push({ satir, ad, tel, durum: 'Atlandı', neden: 'Aynı numara dosyada daha önce var.' }); continue; } dosyada.add(tel);
      const m = var_.get(tel);
      if (m) { sonuc.push({ satir, ad, tel, durum: guncelle ? 'Güncellenecek' : 'Atlandı', neden: guncelle ? `Kayıtlı: ${m.ad}` : `Zaten kayıtlı: ${m.ad}` }); if (guncelle) ekle.push({ guncel: m.id, ad, mail, adres }); continue; }
      sonuc.push({ satir, ad, tel, durum: 'Yeni', neden: '' }); ekle.push({ tel, ad, mail, adres });
    }
    const say = (d) => sonuc.filter(x => x.durum === d).length, ozet = { toplam: sonuc.length, bos, yeni: say('Yeni'), guncellenecek: say('Güncellenecek'), atlanan: say('Atlandı'), hatali: say('Hatalı') };
    if (onizle) return [200, { onizleme: true, ozet, satirlar: [...sonuc.filter(x => x.durum === 'Hatalı'), ...sonuc.filter(x => x.durum !== 'Hatalı')].slice(0, 120) }];
    if (!ekle.length) throw new Err(400, 'Aktarılacak yeni veya güncellenecek kayıt yok.');
    const ins = db.prepare('INSERT INTO bagiscilar(tel,ad,eposta,adres) VALUES(?,?,?,?)'), upd = db.prepare("UPDATE bagiscilar SET ad=?, eposta=COALESCE(NULLIF(?,''),eposta), adres=COALESCE(NULLIF(?,''),adres) WHERE id=?");
    tx(() => { for (const e of ekle) { if (e.guncel) upd.run(e.ad, e.mail, e.adres.slice(0, 160), e.guncel); else ins.run(e.tel, e.ad, e.mail || null, e.adres.slice(0, 160) || null); } });
    A.audit(c.user, 'bagisci_excel_aktar', `yeni ${ozet.yeni}, güncellenen ${guncelle ? ozet.guncellenecek : 0}, atlanan ${ozet.atlanan}, hatalı ${ozet.hatali}`, ip(c.req));
    return [200, { onizleme: false, ozet: { ...ozet, eklendi: ozet.yeni, guncellendi: guncelle ? ozet.guncellenecek : 0 } }];
  });
};
