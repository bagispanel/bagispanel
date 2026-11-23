// Modüller aç/kapa: kullanılmayan modüller menüden ve API'den kalkar (veri SİLİNMEZ; yeniden açılınca her şey yerinde).
// Çekirdek modüller (bağış, bağışçı, raporlar, kullanıcı, KVKK, yedek…) kapatılamaz.
module.exports = function (ctx) {
  const { R, Err, A, str, ip } = ctx, { getA, setA } = ctx.h;
  const GRUP = [
    ['kurban', 'Kurban Organizasyonu', ['orgK', 'vekrap'], 'Kurban hissesi, kesim ve vekâlet takibi'],
    ['kuyu', 'Su Kuyusu Projeleri', ['orgS'], 'Hisseli su kuyusu projeleri'],
    ['video', 'Videolu Bağış Projeleri', ['orgD'], 'Videolu bağış ve video gönderimi'],
    ['eser', 'Kalıcı Eser Projeleri', ['eser'], 'Cami, okul, yurt gibi kalıcı eserler'],
    ['kumbara', 'Kumbara Yönetimi', ['kumbara'], 'Kumbara takibi ve sayımları'],
    ['sponsor', 'Sponsorluk Yönetimi', ['spogr', 'sptak', 'sprap'], 'Öğrenci/yetim kartları, aylık sponsorluklar'],
    ['gonullu', 'Gönüllü Yönetimi', ['gonullu'], 'Gönüllü kayıtları ve görevleri'],
    ['web', 'Web Sitesi', ['entegre', 'spage', 'smenu', 'sform', 'sset'], 'Kurumun bağış sitesi ve formları'],
    ['wa', 'WhatsApp', ['twa'], 'WhatsApp mesajlaşma'],
    ['cagri', 'Çağrı Merkezi', ['cagri'], 'Gelen/giden arama kayıtları'],
    ['tmail', 'Toplu E-posta', ['tmail'], 'E-posta ile toplu gönderim'],
  ];
  const kapali = () => { const a = getA('moduller_kapali', []); return Array.isArray(a) ? a : []; };
  ctx.modFiltre = (perms) => { const k = new Set(kapali()); if (!k.size || !perms) return perms; const o = { ...perms }; for (const [id, , keys] of GRUP) if (k.has(id)) for (const m of keys) if (o[m]) o[m] = {}; return o; };
  R('GET', '/api/moduller', 'kurumb', 'g', async () => { const k = new Set(kapali()); return [200, GRUP.map(([id, ad, , ac]) => ({ id, ad, ac, acik: !k.has(id) }))]; });
  R('PUT', '/api/moduller', 'kurumb', 'd', async (c) => {
    const b = c.body || {}, ids = GRUP.map((x) => x[0]), kapat = Array.isArray(b.kapali) ? b.kapali.filter((x) => ids.includes(x)) : null; if (!kapat) throw new Err(400, 'Geçersiz istek.');
    const onceki = new Set(kapali()); setA('moduller_kapali', kapat);
    const deg = ids.filter((i) => onceki.has(i) !== kapat.includes(i)).map((i) => (kapat.includes(i) ? 'kapatıldı: ' : 'açıldı: ') + i);
    if (deg.length) A.audit(c.user, 'moduller', deg.join(', '), ip(c.req)); return [200, { ok: 1 }];
  });
};
