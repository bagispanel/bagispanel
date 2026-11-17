// bağışpanel · aşama 1 sunucusu. Dış paket gerektirmez (Node 22.5+).
const http = require('http'), fs = require('fs'), path = require('path');
const db = require('./db');
const A = require('./auth');
const PORT = +process.env.PORT || 3000, PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const send = (res, code, obj, h = {}) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...h }); res.end(b); };
const fail = (res, code, msg) => send(res, code, { hata: msg });
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const readBody = (req) => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 2.5e6) { no(new Error('big')); req.destroy(); } }); req.on('end', () => { req.rawBody = b; try { ok(b ? JSON.parse(b) : {}); } catch (e) { no(new Error('json')); } }); });
const ip = (req) => req.socket.remoteAddress || '';
const secure = (req) => process.env.SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
const setCookie = (req, t, maxAge) => `bp=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`;
const str = (v, n = 120) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const tx = (f) => { db.exec('BEGIN'); try { const r = f(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
class Err extends Error { constructor(c, m) { super(m); this.c = c; } }

const routes = [];
const R = (m, p, menu, act, h) => routes.push({ m, re: new RegExp('^' + p.replace(/:id/g, '(\\d+)') + '$'), menu, act, h });

// ---- yetki yardımcıları
const grantCheck = (actor, before, after) => { // yeni verilen her yetkiyi veren kişi de taşımalı
  const mine = A.effective(actor.id);
  A.KEYS.forEach(k => A.ACT.forEach(a => { if (after[k][a] && !before[k][a] && !mine[k][a]) throw new Err(403, 'Sahip olmadığınız bir yetkiyi veremezsiniz.'); }));
};
const needAdmin = (msg) => { if (A.adminCount() < 1) throw new Err(409, msg || 'Sistemde yönetim yetkisi olan en az bir aktif kullanıcı kalmalı.'); };
const normPerm = (o) => { const out = {}; A.KEYS.forEach(k => { const m = (o && o[k]) || {}; out[k] = {}; A.ACT.forEach(a => out[k][a] = m[a] ? 1 : 0); if (!out[k].g) out[k].e = out[k].d = out[k].s = 0; }); return out; };


// ---- profil alanları: doğrulama
const UP = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'uploads');
fs.mkdirSync(path.join(UP, 'users'), { recursive: true });
function vTc(v) { v = String(v || '').replace(/\s/g, ''); if (!v) return null; if (!/^[1-9]\d{10}$/.test(v)) throw new Err(400, 'TC kimlik no 11 haneli olmalı ve 0 ile başlamamalı.'); const d = v.split('').map(Number); const a = ((d[0] + d[2] + d[4] + d[6] + d[8]) * 7 - (d[1] + d[3] + d[5] + d[7])) % 10; if ((a + 10) % 10 !== d[9] || d.slice(0, 10).reduce((x, y) => x + y, 0) % 10 !== d[10]) throw new Err(400, 'TC kimlik no geçersiz (sağlama tutmuyor).'); return v; }
function vTel(v) { v = String(v || '').trim(); if (!v) return null; let d = v.replace(/\D/g, ''); if (v[0] === '+') { if (d.length < 8 || d.length > 15) throw new Err(400, 'Uluslararası telefon 8-15 hane olmalı.'); return '+' + d; } if (d.startsWith('90') && d.length > 10) d = d.slice(2); if (d[0] === '0') d = d.slice(1); if (d.length !== 10 || d[0] !== '5') throw new Err(400, 'Telefon: 5XX XXX XX XX biçiminde 10 hane (yurt dışı için + ve ülke koduyla).'); return '+90' + d; }
function vMail(v) { v = String(v || '').trim().toLowerCase(); if (!v) return null; if (v.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw new Err(400, 'E-posta adresi geçersiz.'); return v; }
function vDogum(v) { v = String(v || '').trim(); if (!v) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) throw new Err(400, 'Doğum tarihi geçersiz.'); const y = +v.slice(0, 4), now = new Date().getFullYear(); if (y < 1900 || y > now - 15) throw new Err(400, 'Doğum tarihi makul bir aralıkta olmalı.'); return v; }
function saveFoto(id, data) { // data:image/jpeg;base64,... → dosya
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || '')); if (!m) throw new Err(400, 'Fotoğraf JPEG, PNG veya WEBP olmalı.');
  const b = Buffer.from(m[2], 'base64'); if (b.length > 1.5e6) throw new Err(400, 'Fotoğraf en fazla 1,5 MB olmalı.');
  const ok = (m[1] === 'jpeg' && b[0] === 0xff && b[1] === 0xd8) || (m[1] === 'png' && b.slice(1, 4).toString() === 'PNG') || (m[1] === 'webp' && b.slice(0, 4).toString() === 'RIFF'); if (!ok) throw new Err(400, 'Fotoğraf dosyası bozuk ya da türü uyuşmuyor.');
  const name = `${id}-${require('crypto').randomBytes(6).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`; fs.writeFileSync(path.join(UP, 'users', name), b); return name;
}
const rmFoto = (n) => { if (n) try { fs.unlinkSync(path.join(UP, 'users', path.basename(n))); } catch (e) {} };
const maskTc = (t) => t ? t.slice(0, 3) + '*****' + t.slice(-2) : '';
const profil = (b) => ({ telefon: vTel(b.telefon), eposta: vMail(b.eposta), tc: vTc(b.tc), dogum_tarihi: vDogum(b.dogum_tarihi), dogum_yeri: str(b.dogum_yeri, 60) || null });
const dupTc = (tc, skip) => { if (tc && db.prepare('SELECT 1 FROM users WHERE tc=? AND id<>?').get(tc, skip || 0)) throw new Err(409, 'Bu TC kimlik no başka bir kullanıcıda kayıtlı.'); };

// ---- kimlik
R('POST', '/api/login', null, null, async (c) => {
  const kadi = str(c.body.kadi, 40).toLowerCase(), key = kadi + '|' + ip(c.req);
  const left = A.lockLeft(key); if (left) throw new Err(429, `Çok fazla hatalı deneme. ${left} dakika sonra tekrar deneyin.`);
  const u = db.prepare('SELECT * FROM users WHERE kadi=?').get(kadi);
  const ok = u && A.verify(String(c.body.sifre || ''), u.pass);
  if (!ok) { A.failed(key); A.audit(null, 'giris_hatali', kadi, ip(c.req)); throw new Err(401, 'Kullanıcı adı veya şifre hatalı.'); }
  if (!u.aktif) throw new Err(403, 'Bu hesap pasif. Yöneticinize başvurun.');
  A.okLogin(key);
  db.prepare("UPDATE users SET son_giris=datetime('now') WHERE id=?").run(u.id);
  const t = A.newSession(u.id, ip(c.req)); A.audit(u, 'giris', null, ip(c.req));
  return [200, { ok: 1, must_change: !!u.must_change }, { 'Set-Cookie': setCookie(c.req, t, 8 * 3600) }];
});
R('POST', '/api/logout', 'auth', null, async (c) => { A.endSession(c.token); A.audit(c.user, 'cikis', null, ip(c.req)); return [200, { ok: 1 }, { 'Set-Cookie': setCookie(c.req, '', 0) }]; });
R('GET', '/api/saglik', null, null, async () => [200, { ok: 1, surum: process.env.GIT_SHA || 'yerel', ortam: process.env.ORTAM || 'yerel' }]);
R('GET', '/api/me', 'auth', null, async (c) => [200, { demo: process.env.DEMO === '1', surum: process.env.GIT_SHA || 'yerel', ortam: process.env.ORTAM || 'yerel', user: { id: c.user.id, ad: c.user.ad, kadi: c.user.kadi, birim: c.user.birim_ad, must_change: !!c.user.must_change, telefon: c.user.telefon, eposta: c.user.eposta, foto: !!c.user.foto }, perms: c.perms, menu: A.MENU }]);
R('POST', '/api/sifre', 'auth', null, async (c) => {
  const { eski, yeni } = c.body;
  if (!A.verify(String(eski || ''), c.user.pass)) throw new Err(400, 'Mevcut şifre hatalı.');
  const e = A.pwErr(yeni); if (e) throw new Err(400, e);
  if (yeni === eski) throw new Err(400, 'Yeni şifre eskisiyle aynı olamaz.');
  db.prepare('UPDATE users SET pass=?,must_change=0 WHERE id=?').run(A.hash(yeni), c.user.id);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(c.user.id, require('crypto').createHash('sha256').update(c.token).digest('hex'));
  A.audit(c.user, 'sifre_degisti', null, ip(c.req)); return [200, { ok: 1 }];
});

// ---- kullanıcılar
R('GET', '/api/users', 'kullanici', 'g', async () => [200, db.prepare('SELECT u.id,u.ad,u.kadi,u.birim_id,b.ad birim,u.aktif,u.son_giris,u.must_change,u.telefon,u.eposta,(u.foto IS NOT NULL) foto FROM users u JOIN birimler b ON b.id=u.birim_id ORDER BY u.id').all()]);
R('GET', '/api/users/:id', 'kullanici', 'g', async (c) => { // ayrıntı: TC yalnızca düzeltme yetkisi olana tam görünür (KVKK)
  const u = db.prepare('SELECT id,ad,kadi,birim_id,aktif,telefon,eposta,tc,dogum_tarihi,dogum_yeri,(foto IS NOT NULL) foto FROM users WHERE id=?').get(+c.m[1]); if (!u) throw new Err(404, 'Kullanıcı yok.');
  u.tc = A.can(c.perms, 'kullanici', 'd') ? u.tc : maskTc(u.tc); return [200, u]; });
R('GET', '/api/users/:id/foto', 'auth', null, async (c) => {
  const id = +c.m[1]; if (id !== c.user.id && !A.can(c.perms, 'kullanici', 'g')) throw new Err(403, 'Bu işlem için yetkiniz yok.');
  const u = db.prepare('SELECT foto FROM users WHERE id=?').get(id); if (!u || !u.foto) throw new Err(404, 'Fotoğraf yok.');
  return [200, { raw: path.join(UP, 'users', path.basename(u.foto)) }]; });
R('PUT', '/api/profil', 'auth', null, async (c) => { // kişi kendi iletişim bilgisi ve fotoğrafını günceller
  const tel = vTel(c.body.telefon), mail = vMail(c.body.eposta); let foto = c.user.foto;
  if (c.body.foto) { rmFoto(foto); foto = saveFoto(c.user.id, c.body.foto); } else if (c.body.foto_sil) { rmFoto(foto); foto = null; }
  db.prepare('UPDATE users SET telefon=?,eposta=?,foto=? WHERE id=?').run(tel, mail, foto, c.user.id); A.audit(c.user, 'profil_guncellendi', null, ip(c.req)); return [200, { ok: 1 }]; });
R('POST', '/api/users', 'kullanici', 'e', async (c) => {
  const ad = str(c.body.ad), kadi = str(c.body.kadi, 30).toLowerCase(), b = +c.body.birim_id;
  if (!ad) throw new Err(400, 'Ad soyadı yazın.');
  if (!/^[a-z0-9._]{3,30}$/.test(kadi)) throw new Err(400, 'Kullanıcı adı 3-30 karakter; küçük harf, rakam, nokta ve alt çizgi.');
  const pe = A.pwErr(c.body.sifre); if (pe) throw new Err(400, pe);
  if (!db.prepare('SELECT 1 FROM birimler WHERE id=?').get(b)) throw new Err(400, 'Birim seçin.');
  if (db.prepare('SELECT 1 FROM users WHERE kadi=?').get(kadi)) throw new Err(409, 'Bu kullanıcı adı kullanılıyor.');
  const pf = profil(c.body); dupTc(pf.tc);
  return tx(() => {
    const id = db.prepare('INSERT INTO users(ad,kadi,pass,birim_id,must_change,telefon,eposta,tc,dogum_tarihi,dogum_yeri) VALUES(?,?,?,?,1,?,?,?,?,?)').run(ad, kadi, A.hash(c.body.sifre), b, pf.telefon, pf.eposta, pf.tc, pf.dogum_tarihi, pf.dogum_yeri).lastInsertRowid;
    if (c.body.foto) db.prepare('UPDATE users SET foto=? WHERE id=?').run(saveFoto(+id, c.body.foto), +id);
    const t = A.effective(+id), zero = normPerm({}); grantCheck(c.user, zero, t);
    A.audit(c.user, 'kullanici_eklendi', kadi, ip(c.req)); return [201, { id: +id }];
  });
});
R('PUT', '/api/users/:id', 'kullanici', 'd', async (c) => {
  const id = +c.m[1], t = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!t) throw new Err(404, 'Kullanıcı yok.');
  const ad = str(c.body.ad) || t.ad, b = c.body.birim_id ? +c.body.birim_id : t.birim_id, aktif = c.body.aktif === undefined ? t.aktif : (c.body.aktif ? 1 : 0);
  if (id === c.user.id && (b !== t.birim_id || aktif !== t.aktif)) throw new Err(403, 'Kendi birimingizi veya durumunuzu değiştiremezsiniz.');
  if (!db.prepare('SELECT 1 FROM birimler WHERE id=?').get(b)) throw new Err(400, 'Birim seçin.');
  return tx(() => {
    const before = A.effective(id);
    const pf = c.body.telefon !== undefined || c.body.eposta !== undefined || c.body.tc !== undefined ? profil(c.body) : { telefon: t.telefon, eposta: t.eposta, tc: t.tc, dogum_tarihi: t.dogum_tarihi, dogum_yeri: t.dogum_yeri }; dupTc(pf.tc, id);
    let foto = t.foto; if (c.body.foto) { rmFoto(foto); foto = saveFoto(id, c.body.foto); } else if (c.body.foto_sil) { rmFoto(foto); foto = null; }
    db.prepare('UPDATE users SET ad=?,birim_id=?,aktif=?,telefon=?,eposta=?,tc=?,dogum_tarihi=?,dogum_yeri=?,foto=? WHERE id=?').run(ad, b, aktif, pf.telefon, pf.eposta, pf.tc, pf.dogum_tarihi, pf.dogum_yeri, foto, id);
    grantCheck(c.user, before, A.effective(id)); needAdmin();
    if (!aktif) A.endUserSessions(id);
    A.audit(c.user, 'kullanici_guncellendi', `${t.kadi} birim=${b} aktif=${aktif}`, ip(c.req)); return [200, { ok: 1 }];
  });
});
R('POST', '/api/users/:id/sifre', 'kullanici', 'd', async (c) => {
  const id = +c.m[1], t = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!t) throw new Err(404, 'Kullanıcı yok.');
  const e = A.pwErr(c.body.sifre); if (e) throw new Err(400, e);
  db.prepare('UPDATE users SET pass=?,must_change=1 WHERE id=?').run(A.hash(c.body.sifre), id); A.endUserSessions(id);
  A.audit(c.user, 'sifre_sifirlandi', t.kadi, ip(c.req)); return [200, { ok: 1 }];
});
R('DELETE', '/api/users/:id', 'kullanici', 's', async (c) => {
  const id = +c.m[1], t = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!t) throw new Err(404, 'Kullanıcı yok.');
  if (id === c.user.id) throw new Err(403, 'Kendinizi silemezsiniz.');
  return tx(() => { db.prepare('DELETE FROM users WHERE id=?').run(id); needAdmin(); A.audit(c.user, 'kullanici_silindi', t.kadi, ip(c.req)); return [200, { ok: 1 }]; });
});
R('GET', '/api/users/:id/yetki', 'kullanici', 'g', async (c) => {
  const id = +c.m[1]; if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(id)) throw new Err(404, 'Kullanıcı yok.');
  const o = {}; db.prepare('SELECT * FROM user_yetki WHERE user_id=?').all(id).forEach(r => o[r.menu] = { g: r.g, e: r.e, d: r.d, s: r.s });
  const bm = {}; db.prepare('SELECT yb.* FROM birim_yetki yb JOIN users u ON u.birim_id=yb.birim_id WHERE u.id=?').all(id).forEach(r => bm[r.menu] = { g: r.g, e: r.e, d: r.d, s: r.s }); return [200, { ozel: o, etkin: A.effective(id), birim: bm }];
});
R('PUT', '/api/users/:id/yetki', 'kullanici', 'd', async (c) => {
  const id = +c.m[1], t = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!t) throw new Err(404, 'Kullanıcı yok.');
  if (id === c.user.id) throw new Err(403, 'Kendi yetkinizi değiştiremezsiniz.');
  return tx(() => {
    const before = A.effective(id);
    db.prepare('DELETE FROM user_yetki WHERE user_id=?').run(id);
    const ins = db.prepare('INSERT INTO user_yetki(user_id,menu,g,e,d,s) VALUES(?,?,?,?,?,?)');
    A.KEYS.forEach(k => { const m = (c.body.ozel || {})[k]; if (!m) return; const v = A.ACT.map(a => m[a] === null || m[a] === undefined ? null : (m[a] ? 1 : 0)); if (v.some(x => x !== null)) ins.run(id, k, ...v); });
    grantCheck(c.user, before, A.effective(id)); needAdmin();
    A.audit(c.user, 'kullanici_yetkisi', t.kadi, ip(c.req)); return [200, { etkin: A.effective(id) }];
  });
});

// ---- birimler
R('GET', '/api/birimler', 'kullanici|birim', 'g', async () => [200, db.prepare('SELECT b.id,b.ad,(SELECT COUNT(*) FROM users u WHERE u.birim_id=b.id) kullanici FROM birimler b ORDER BY b.id').all()]);
R('POST', '/api/birimler', 'birim', 'e', async (c) => {
  const ad = str(c.body.ad, 60); if (!ad) throw new Err(400, 'Birim adını yazın.');
  if (db.prepare('SELECT 1 FROM birimler WHERE ad=?').get(ad)) throw new Err(409, 'Bu birim zaten var.');
  return tx(() => {
    const id = +db.prepare('INSERT INTO birimler(ad) VALUES(?)').run(ad).lastInsertRowid;
    const kop = +c.body.kopya_id, ins = db.prepare('INSERT INTO birim_yetki(birim_id,menu,g,e,d,s) VALUES(?,?,?,?,?,?)');
    const src = {}; if (kop === -1) A.KEYS.forEach(k => src[k] = { g: 1, e: 1, d: 1, s: 1 }); else if (kop > 0) db.prepare('SELECT * FROM birim_yetki WHERE birim_id=?').all(kop).forEach(r => src[r.menu] = r);
    const p = normPerm(src); grantCheck(c.user, normPerm({}), p);
    A.KEYS.forEach(k => ins.run(id, k, p[k].g, p[k].e, p[k].d, p[k].s));
    A.audit(c.user, 'birim_eklendi', ad, ip(c.req)); return [201, { id }];
  });
});
R('PUT', '/api/birimler/:id', 'birim', 'd', async (c) => {
  const id = +c.m[1], ad = str(c.body.ad, 60); if (!ad) throw new Err(400, 'Birim adını yazın.');
  if (db.prepare('SELECT 1 FROM birimler WHERE ad=? AND id<>?').get(ad, id)) throw new Err(409, 'Bu birim zaten var.');
  db.prepare('UPDATE birimler SET ad=? WHERE id=?').run(ad, id); A.audit(c.user, 'birim_adi', ad, ip(c.req)); return [200, { ok: 1 }];
});
R('DELETE', '/api/birimler/:id', 'birim', 's', async (c) => {
  const id = +c.m[1]; if (db.prepare('SELECT 1 FROM users WHERE birim_id=?').get(id)) throw new Err(409, 'Bu birimde kullanıcı var.');
  db.prepare('DELETE FROM birimler WHERE id=?').run(id); A.audit(c.user, 'birim_silindi', String(id), ip(c.req)); return [200, { ok: 1 }];
});
R('GET', '/api/birimler/:id/yetki', 'birim', 'g', async (c) => { const o = {}; db.prepare('SELECT * FROM birim_yetki WHERE birim_id=?').all(+c.m[1]).forEach(r => o[r.menu] = { g: r.g, e: r.e, d: r.d, s: r.s }); return [200, normPerm(o)]; });
R('PUT', '/api/birimler/:id/yetki', 'birim', 'd', async (c) => {
  const id = +c.m[1], b = db.prepare('SELECT * FROM birimler WHERE id=?').get(id); if (!b) throw new Err(404, 'Birim yok.');
  return tx(() => {
    const before = {}; db.prepare('SELECT * FROM birim_yetki WHERE birim_id=?').all(id).forEach(r => before[r.menu] = r);
    const bp = normPerm(before), np = normPerm(c.body.perm), users = db.prepare('SELECT id FROM users WHERE birim_id=?').all(id).map(u => u.id), ub = users.map(u => A.effective(u));
    grantCheck(c.user, bp, np);
    db.prepare('DELETE FROM birim_yetki WHERE birim_id=?').run(id);
    const ins = db.prepare('INSERT INTO birim_yetki(birim_id,menu,g,e,d,s) VALUES(?,?,?,?,?,?)'); A.KEYS.forEach(k => ins.run(id, k, np[k].g, np[k].e, np[k].d, np[k].s));
    needAdmin(); A.audit(c.user, 'birim_yetkisi', b.ad, ip(c.req)); return [200, { ok: 1 }];
  });
});
R('GET', '/api/audit', 'denetim', 'g', async () => [200, db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all()]);

// ---- modüller (her biri kendi tablolarını ve uçlarını tanımlar)
const ctx = { R, Err, A, db, tx, str, ip, usage: { ulke: [], partner: [], banka: [], tur: [] }, used: (k, v) => ctx.usage[k].reduce((n, f) => n + f(v), 0) };
['ayarlar', 'bagis', 'excel', 'kurum', 'org', 'ana', 'iletisim', 'calisma', 'sube', 'gonullu', 'eser', 'sponsor', 'banka', 'bildirim', 'ara', 'analiz', 'demo'].forEach(m => require('./mod/' + m)(ctx));

// ---- sunucu
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:");
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    try {
      const r = routes.find(r => r.m === req.method && r.re.test(url.pathname));
      if (!r) return fail(res, 404, 'Bulunamadı.');
      if (req.method !== 'GET' && url.pathname !== '/api/wa/webhook' && url.pathname !== '/api/cagri/webhook' && !url.pathname.startsWith('/api/dis/')) { // CSRF (WhatsApp webhook'u imzayla doğrulanır): özel başlık + aynı kaynak
        if (req.headers['x-bp'] !== '1') return fail(res, 403, 'Geçersiz istek.');
        const o = req.headers.origin; if (o && new URL(o).host !== req.headers.host) return fail(res, 403, 'Geçersiz kaynak.');
      }
      const c = { req, m: url.pathname.match(r.re), body: req.method === 'GET' || req.method === 'DELETE' ? {} : await readBody(req), token: cookies(req).bp };
      if (r.menu) {
        c.user = A.sessionUser(c.token); if (!c.user) return fail(res, 401, 'Oturum gerekli.');
        c.perms = A.effective(c.user.id);
        const okPath = ['/api/me', '/api/sifre', '/api/logout'].includes(url.pathname);
        if (c.user.must_change && !okPath) return fail(res, 403, 'Önce şifrenizi değiştirin.');
        if (r.menu !== 'auth' && !r.menu.split('|').some(m => A.can(c.perms, m, r.act))) return fail(res, 403, 'Bu işlem için yetkiniz yok.');
      }
      const out = await r.h(c); if (out[1] && out[1].text !== undefined) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(String(out[1].text)); } if (out[1] && out[1].raw) { const f = out[1].raw, ext = path.extname(f).slice(1); if (!fs.existsSync(f)) return fail(res, 404, 'Dosya yok.'); const ct = { png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm' }[ext] || 'image/jpeg', sz = fs.statSync(f).size, h = { 'Content-Type': ct, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=60', 'Accept-Ranges': 'bytes' }, rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        if (rg && (rg[1] || rg[2])) { let s0 = rg[1] ? +rg[1] : sz - +rg[2], e0 = rg[1] && rg[2] ? Math.min(+rg[2], sz - 1) : sz - 1; if (s0 > e0 || s0 >= sz) { res.writeHead(416, { 'Content-Range': 'bytes */' + sz }); return res.end(); } res.writeHead(206, { ...h, 'Content-Range': `bytes ${s0}-${e0}/${sz}`, 'Content-Length': e0 - s0 + 1 }); return fs.createReadStream(f, { start: s0, end: e0 }).pipe(res); }
        res.writeHead(200, { ...h, 'Content-Length': sz }); return fs.createReadStream(f).pipe(res); } return send(res, out[0], out[1], out[2]);
    } catch (e) { if (e instanceof Err) return fail(res, e.c, e.message); if (e.message === 'json') return fail(res, 400, 'Geçersiz veri.'); if (e.message === 'big') return fail(res, 413, 'Veri çok büyük.'); console.error(e); return fail(res, 500, 'Sunucu hatası.'); }
  }
  let f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(f).pipe(res);
});
const pw = A.seed(); A.syncPerm();
if (pw) console.log(`\n  İLK KURULUM\n  Kullanıcı adı: admin\n  Geçici şifre : ${pw}\n  (İlk girişte şifrenizi değiştirmeniz istenecek. Bu şifre bir daha gösterilmez.)\n`);
if (require.main === module) server.listen(PORT, () => console.log(`bağışpanel çalışıyor: http://localhost:${PORT}`));
module.exports = { server };
