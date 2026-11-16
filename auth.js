const crypto = require('crypto');
const db = require('./db');
const MENU = require('./menu');
const KEYS = MENU.flatMap(g => g[1].map(k => k[0]));
const ACT = ['g', 'e', 'd', 's'];

const hash = (pw) => { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + crypto.scryptSync(pw, s, 64).toString('hex'); };
const verify = (pw, st) => { const [s, h] = String(st).split(':'); if (!s || !h) return false; const x = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64); const y = Buffer.from(h, 'hex'); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const pwErr = (pw) => (typeof pw !== 'string' || pw.length < 8) ? 'Şifre en az 8 karakter olmalı.' : (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) ? 'Şifre en az bir harf ve bir rakam içermeli.' : '';

// Etkin yetki = birim yetkisi, kişiye özel değer varsa onunla ezilir. e/d/s için g de gerekir.
function effective(userId) {
  const u = db.prepare('SELECT birim_id FROM users WHERE id=?').get(userId);
  const out = {}; KEYS.forEach(k => out[k] = { g: 0, e: 0, d: 0, s: 0 });
  if (!u) return out;
  db.prepare('SELECT * FROM birim_yetki WHERE birim_id=?').all(u.birim_id).forEach(r => { if (out[r.menu]) ACT.forEach(a => out[r.menu][a] = r[a] ? 1 : 0); });
  db.prepare('SELECT * FROM user_yetki WHERE user_id=?').all(userId).forEach(r => { if (out[r.menu]) ACT.forEach(a => { if (r[a] !== null) out[r.menu][a] = r[a] ? 1 : 0; }); });
  KEYS.forEach(k => { const m = out[k]; if (!m.g) m.e = m.d = m.s = 0; });
  return out;
}
const can = (perms, menu, act) => !!(perms[menu] && perms[menu][act]);
const isAdmin = (userId) => { const p = effective(userId); return can(p, 'kullanici', 'd') && can(p, 'birim', 'd'); };
const adminCount = () => db.prepare('SELECT id FROM users WHERE aktif=1').all().filter(u => isAdmin(u.id)).length;

function newSession(userId, ip) {
  const t = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token,user_id,expires,ip) VALUES(?,?,?,?)').run(sha(t), userId, Date.now() + 8 * 3600 * 1000, ip);
  return t;
}
function sessionUser(token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(sha(token));
  if (!s) return null;
  if (s.expires < Date.now()) { db.prepare('DELETE FROM sessions WHERE token=?').run(s.token); return null; }
  const u = db.prepare('SELECT u.*,b.ad AS birim_ad FROM users u JOIN birimler b ON b.id=u.birim_id WHERE u.id=?').get(s.user_id);
  return u && u.aktif ? u : null;
}
const endSession = (t) => db.prepare('DELETE FROM sessions WHERE token=?').run(sha(t));
const endUserSessions = (id) => db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
function audit(u, islem, detay, ip) { db.prepare('INSERT INTO audit(user_id,kadi,islem,detay,ip) VALUES(?,?,?,?,?)').run(u ? u.id : null, u ? u.kadi : null, islem, detay ? String(detay).slice(0, 500) : null, ip || null); }

// Giriş denemesi sınırı: aynı kullanıcı adı + ip için 5 hata -> 15 dk kilit
function lockLeft(k) { const r = db.prepare('SELECT * FROM login_fail WHERE k=?').get(k); return r && r.until > Date.now() ? Math.ceil((r.until - Date.now()) / 60000) : 0; }
function failed(k) { const r = db.prepare('SELECT * FROM login_fail WHERE k=?').get(k); const n = (r && r.until < Date.now() && r.until ? 0 : (r ? r.n : 0)) + 1; db.prepare('INSERT INTO login_fail(k,n,until) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n,until=excluded.until').run(k, n >= 5 ? 0 : n, n >= 5 ? Date.now() + 15 * 60000 : 0); }
const okLogin = (k) => db.prepare('DELETE FROM login_fail WHERE k=?').run(k);

// İlk kurulum: birimler + ilk yönetici. Şifre ortam değişkeninden ya da rastgele üretilir.
function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c) return null;
  const mk = (ad, perm) => { const id = db.prepare('INSERT INTO birimler(ad) VALUES(?)').run(ad).lastInsertRowid; const ins = db.prepare('INSERT INTO birim_yetki(birim_id,menu,g,e,d,s) VALUES(?,?,?,?,?,?)'); KEYS.forEach(k => { const p = perm(k) || [0, 0, 0, 0]; ins.run(id, k, ...p); }); return id; };
  const F = () => [1, 1, 1, 1], V = () => [1, 0, 0, 0];
  const bi = mk('Bilgi işlem', F);
  mk('Başkan', k => ['kullanici', 'birim'].includes(k) ? null : V());
  mk('Çağrı merkezi', k => k === 'alin' ? [1, 1, 0, 0] : ['bekleyen', 'bagisci', 'orgK', 'orgS', 'orgD', 'turler', 'sms'].includes(k) ? V() : k === 'cagri' ? [1, 1, 0, 0] : null);
  mk('Muhasebe', k => k === 'bekleyen' ? [1, 0, 1, 0] : k === 'banka' ? [1, 1, 1, 0] : ['rapor', 'rkarsi', 'rtur', 'rbagisci', 'rsaha', 'bagisci'].includes(k) ? V() : null);
  mk('Yurtdışı birimi', k => ['orgK', 'orgS', 'orgD', 'partner', 'ulke'].includes(k) ? [1, 1, 1, 0] : k === 'pdfay' ? [1, 0, 1, 0] : ['numara', 'sablon', 'sms'].includes(k) ? V() : null);
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url') + '7a';
  db.prepare('INSERT INTO users(ad,kadi,pass,birim_id,must_change) VALUES(?,?,?,?,1)').run('Yönetici', 'admin', hash(pw), bi);
  if (process.env.DEMO === '1') { // yalnızca test ortamı: örnek kullanıcılar (veri her yeniden kurulumda sıfırlanır)
    const ids = Object.fromEntries(db.prepare('SELECT id,ad FROM birimler').all().map(b => [b.ad, b.id]));
    [['Meriç','meric','Çağrı merkezi'],['Muhasebe Personeli','muhasebe','Muhasebe'],['Dernek Başkanı','baskan','Başkan'],['Yurtdışı Sorumlusu','yurtdisi','Yurtdışı birimi']].forEach(([ad,k,b]) => db.prepare('INSERT INTO users(ad,kadi,pass,birim_id,must_change) VALUES(?,?,?,?,0)').run(ad, k, hash(pw), ids[b]));
  }
  return pw;
}
// Sonradan eklenen menülerin yetki satırları eksikse tamamlanır: yönetim birimi (kullanıcı+birim yönetimi olan) tam yetki, Başkan görme, diğerleri kapalı.
function syncPerm() {
  const ins = db.prepare('INSERT INTO birim_yetki(birim_id,menu,g,e,d,s) VALUES(?,?,?,?,?,?)');
  db.prepare('SELECT id, ad FROM birimler').all().forEach(b => {
    const var_ = new Set(db.prepare('SELECT menu FROM birim_yetki WHERE birim_id=?').all(b.id).map(r => r.menu)), yon = db.prepare("SELECT e FROM birim_yetki WHERE birim_id=? AND menu='kullanici'").get(b.id);
    KEYS.forEach(k => { if (var_.has(k)) return; const p = yon && yon.e ? [1, 1, 1, 1] : b.ad === 'Başkan' ? [1, 0, 0, 0] : [0, 0, 0, 0]; ins.run(b.id, k, ...p); });
  });
}
module.exports = { syncPerm, MENU, KEYS, ACT, hash, verify, pwErr, effective, can, isAdmin, adminCount, newSession, sessionUser, endSession, endUserSessions, audit, lockLeft, failed, okLogin, seed };
