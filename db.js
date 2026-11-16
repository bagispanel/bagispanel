const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, 'bagispanel.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS birimler(
  id INTEGER PRIMARY KEY, ad TEXT NOT NULL UNIQUE COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS birim_yetki(
  birim_id INTEGER NOT NULL REFERENCES birimler ON DELETE CASCADE, menu TEXT NOT NULL,
  g INTEGER NOT NULL DEFAULT 0, e INTEGER NOT NULL DEFAULT 0, d INTEGER NOT NULL DEFAULT 0, s INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(birim_id,menu));
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, ad TEXT NOT NULL, kadi TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass TEXT NOT NULL, birim_id INTEGER NOT NULL REFERENCES birimler,
  aktif INTEGER NOT NULL DEFAULT 1, must_change INTEGER NOT NULL DEFAULT 0,
  son_giris TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
-- kişiye özel yetki: NULL = birimden gelsin, 1 = ver, 0 = kaldır
CREATE TABLE IF NOT EXISTS user_yetki(
  user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE, menu TEXT NOT NULL,
  g INTEGER, e INTEGER, d INTEGER, s INTEGER, PRIMARY KEY(user_id,menu));
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE,
  expires INTEGER NOT NULL, ip TEXT);
CREATE TABLE IF NOT EXISTS login_fail(k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY, at TEXT NOT NULL DEFAULT (datetime('now')), user_id INTEGER, kadi TEXT,
  islem TEXT NOT NULL, detay TEXT, ip TEXT);
`);
// Sonradan eklenen sütunlar (var olan veritabanları bozulmadan yükseltilir)
const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
[['telefon', 'TEXT'], ['eposta', 'TEXT'], ['tc', 'TEXT'], ['dogum_tarihi', 'TEXT'], ['dogum_yeri', 'TEXT'], ['foto', 'TEXT']]
  .forEach(([c, ty]) => { if (!cols.includes(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} ${ty}`); });
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_tc ON users(tc) WHERE tc IS NOT NULL");
module.exports = db;
