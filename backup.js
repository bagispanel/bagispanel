// Yedek: çalışan veritabanının tutarlı bir kopyasını alır, sıkıştırır, eskileri temizler.
// Kullanım: node backup.js            (bir kez)     |  node backup.js --loop   (her 6 saatte bir)
const { DatabaseSync } = require('node:sqlite'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const dir = process.env.DATA_DIR || path.join(__dirname, 'data'), out = path.join(dir, 'yedek');
const KEEP = +process.env.YEDEK_SAKLA || 60, crypto = require('crypto');
// BACKUP_KEY (en az 16 karakter) tanımlıysa yedek AES-256-GCM ile şifrelenir (.db.gz.enc). Anahtarı sunucudan AYRI bir yerde saklayın; kaybedilirse yedek açılamaz.
const sifrele = (buf, key) => { const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(key, salt, 32), iv), ct = Buffer.concat([c.update(buf), c.final()]); return Buffer.concat([Buffer.from('BPY1'), salt, iv, c.getAuthTag(), ct]); };
const coz = (buf, key) => { if (buf.subarray(0, 4).toString() !== 'BPY1') throw new Error('Şifreli yedek değil'); const salt = buf.subarray(4, 20), iv = buf.subarray(20, 32), tag = buf.subarray(32, 48), d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(key, salt, 32), iv); d.setAuthTag(tag); return Buffer.concat([d.update(buf.subarray(48)), d.final()]); };
function once() {
  fs.mkdirSync(out, { recursive: true });
  const d = new Date(), z = (n) => String(n).padStart(2, '0'), name = `bagispanel-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
  const tmp = path.join(out, name + '.db'), db = new DatabaseSync(path.join(dir, 'bagispanel.db'));
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); db.close();
  const chk = new DatabaseSync(tmp); const ok = chk.prepare('PRAGMA integrity_check').get().integrity_check === 'ok'; chk.close();
  if (!ok) { fs.unlinkSync(tmp); throw new Error('Yedek doğrulanamadı'); }
  const key = process.env.BACKUP_KEY || '', gz = zlib.gzipSync(fs.readFileSync(tmp)); if (key && key.length < 16) throw new Error('BACKUP_KEY en az 16 karakter olmalı');
  fs.writeFileSync(tmp + '.gz' + (key ? '.enc' : ''), key ? sifrele(gz, key) : gz); fs.unlinkSync(tmp);
  const all = fs.readdirSync(out).filter(f => /\.db\.gz(\.enc)?$/.test(f)).sort(); all.slice(0, Math.max(0, all.length - KEEP)).forEach(f => fs.unlinkSync(path.join(out, f)));
  console.log(new Date().toISOString(), 'yedek alındı:', name + '.db.gz' + (key ? '.enc (şifreli)' : ''), `(${all.length} yedek)`);
}
if (require.main !== module) module.exports = { once, out, KEEP, sifrele, coz }; // panelden "Şimdi yedek al" için
else if (process.argv.includes('--coz')) { const i = process.argv.indexOf('--coz'), [g, o] = [process.argv[i + 1], process.argv[i + 2]]; if (!g || !o || !process.env.BACKUP_KEY) { console.error('Kullanım: BACKUP_KEY=... node backup.js --coz yedek.db.gz.enc cikti.db.gz'); process.exit(1); } fs.writeFileSync(o, coz(fs.readFileSync(g), process.env.BACKUP_KEY)); console.log('Çözüldü:', o); }
else if (process.argv.includes('--loop')) { const run = () => { try { once(); } catch (e) { console.error('YEDEK HATASI', e.message); } }; setTimeout(run, 60000); setInterval(run, 6 * 3600 * 1000); } else once();
