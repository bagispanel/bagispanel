// Yedek: çalışan veritabanının tutarlı bir kopyasını alır, sıkıştırır, eskileri temizler.
// Kullanım: node backup.js            (bir kez)     |  node backup.js --loop   (her 6 saatte bir)
const { DatabaseSync } = require('node:sqlite'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const dir = process.env.DATA_DIR || path.join(__dirname, 'data'), out = path.join(dir, 'yedek');
const KEEP = +process.env.YEDEK_SAKLA || 60;
function once() {
  fs.mkdirSync(out, { recursive: true });
  const d = new Date(), z = (n) => String(n).padStart(2, '0'), name = `bagispanel-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
  const tmp = path.join(out, name + '.db'), db = new DatabaseSync(path.join(dir, 'bagispanel.db'));
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`); db.close();
  const chk = new DatabaseSync(tmp); const ok = chk.prepare('PRAGMA integrity_check').get().integrity_check === 'ok'; chk.close();
  if (!ok) { fs.unlinkSync(tmp); throw new Error('Yedek doğrulanamadı'); }
  fs.writeFileSync(tmp + '.gz', zlib.gzipSync(fs.readFileSync(tmp))); fs.unlinkSync(tmp);
  const all = fs.readdirSync(out).filter(f => f.endsWith('.gz')).sort(); all.slice(0, Math.max(0, all.length - KEEP)).forEach(f => fs.unlinkSync(path.join(out, f)));
  console.log(new Date().toISOString(), 'yedek alındı:', name + '.db.gz', `(${all.length} yedek)`);
}
if (process.argv.includes('--loop')) { const run = () => { try { once(); } catch (e) { console.error('YEDEK HATASI', e.message); } }; setTimeout(run, 60000); setInterval(run, 6 * 3600 * 1000); } else once();
