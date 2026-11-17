// İletişim: SMS, e-posta ve WhatsApp (Meta Cloud API) ayarları, toplu gönderim kuyruğu, WhatsApp gelen kutusu.
// Varsayılan mod "deneme"dir: hiçbir şey dışarı gitmez, yalnızca kayda yazılır. Canlı mod ayarlardan açılır.
const crypto = require('crypto'), net = require('net'), tls = require('tls');
module.exports = function (ctx) {
  const { R, Err, db, tx, str, ip, A, h } = ctx;
  db.exec(`
CREATE TABLE IF NOT EXISTS toplu_gonderim(id INTEGER PRIMARY KEY, kanal TEXT NOT NULL, ad TEXT NOT NULL, konu TEXT, mesaj TEXT, sablon TEXT, degisken TEXT, filtre TEXT, mod TEXT NOT NULL, durum TEXT NOT NULL DEFAULT 'Gönderiliyor', kullanici TEXT, zaman TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS toplu_alici(id INTEGER PRIMARY KEY, gid INTEGER NOT NULL, bagisci_id INTEGER, ad TEXT, hedef TEXT NOT NULL, durum TEXT NOT NULL DEFAULT 'Bekliyor', hata TEXT, mid TEXT, zaman TEXT);
CREATE INDEX IF NOT EXISTS ix_ta_g ON toplu_alici(gid, durum);
CREATE TABLE IF NOT EXISTS wa_mesaj(id INTEGER PRIMARY KEY, wid TEXT UNIQUE, tel TEXT NOT NULL, ad TEXT, yon TEXT NOT NULL, tip TEXT, govde TEXT, zaman TEXT NOT NULL DEFAULT (datetime('now','localtime')), okundu INTEGER NOT NULL DEFAULT 0, bagisci_id INTEGER);
CREATE INDEX IF NOT EXISTS ix_wa_tel ON wa_mesaj(tel);
`);
  for (const q of ["ALTER TABLE sms_log ADD COLUMN kanal TEXT DEFAULT 'SMS'", 'ALTER TABLE sms_log ADD COLUMN durum TEXT', 'ALTER TABLE sms_log ADD COLUMN hata TEXT', 'ALTER TABLE bagiscilar ADD COLUMN izin TEXT']) { try { db.exec(q); } catch (e) { } }
  const { getA, setA } = h, SIR = { sms: ['sifre'], mail: ['sifre'], wa: ['token', 'app_secret'] };
  const DEF = { mod: 'deneme', sms: { saglayici: 'netgsm', kullanici: '', sifre: '', baslik: '', url: '' }, mail: { host: '', port: 587, guvenlik: 'starttls', kullanici: '', sifre: '', ad: '', adres: '', yanit: '' }, wa: { phone_id: '', waba_id: '', token: '', app_secret: '', verify: '', dil: 'tr', api_url: '', sablonlar: [] } };
  const cfg = () => { const a = getA('iletisim', {}); const c = { mod: a.mod === 'canli' ? 'canli' : 'deneme', sms: { ...DEF.sms, ...(a.sms || {}) }, mail: { ...DEF.mail, ...(a.mail || {}) }, wa: { ...DEF.wa, ...(a.wa || {}) } }; if (!c.wa.verify) { c.wa.verify = crypto.randomBytes(12).toString('hex'); setA('iletisim', { ...a, wa: { ...(a.wa || {}), verify: c.wa.verify } }); } return c; };
  const maskeli = (c) => { const o = JSON.parse(JSON.stringify(c)); Object.entries(SIR).forEach(([k, L]) => L.forEach(f => { o[k][f + '_var'] = !!c[k][f]; o[k][f] = ''; })); return o; };
  const nm = h.nm, esc2 = (s) => String(s == null ? '' : s);
  const digits = (t) => String(t || '').replace(/\D/g, '');
  const trNo = (t) => { let d = digits(t); if (d.startsWith('90') && d.length === 12) d = d.slice(2); if (d.startsWith('0')) d = d.slice(1); return d; };
  const e164 = (t) => { const d = digits(t); return d.startsWith('00') ? d.slice(2) : d; };
  const mailOk = (s) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(s || '').trim());
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const zaman = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('Zaman aşımı (' + ms / 1000 + ' sn).')), ms))]);

  // ---------- SMS ----------
  async function smsGonder(c, tel, mesaj) {
    const s = c.sms;
    if (!s.sifre && s.saglayici !== 'ozel') throw new Error('SMS sağlayıcı bilgileri eksik (İletişim Ayarları).');
    if (s.saglayici === 'netgsm') {
      const r = await zaman(fetch('https://api.netgsm.com.tr/sms/rest/v2/send', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(s.kullanici + ':' + s.sifre).toString('base64') }, body: JSON.stringify({ msgheader: s.baslik, messages: [{ msg: mesaj, no: trNo(tel) }], encoding: 'TR' }) }), 20000);
      const j = await r.json().catch(() => ({})); if (!r.ok || String(j.code) !== '00') throw new Error('Netgsm: ' + (j.description || j.code || r.status));
      return j.jobid || '';
    }
    if (s.saglayici === 'twilio') {
      const r = await zaman(fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(s.kullanici)}/Messages.json`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(s.kullanici + ':' + s.sifre).toString('base64') }, body: new URLSearchParams({ To: '+' + e164(tel), From: s.baslik, Body: mesaj }) }), 20000);
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Twilio: ' + (j.message || r.status)); return j.sid || '';
    }
    if (s.saglayici === 'ozel') { // kendi SMS geçidiniz: JSON {to, message, from}
      if (!/^https?:\/\//i.test(s.url)) throw new Error('Özel SMS adresi (URL) girilmemiş.');
      const r = await zaman(fetch(s.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(s.sifre ? { Authorization: 'Bearer ' + s.sifre } : {}) }, body: JSON.stringify({ to: e164(tel), message: mesaj, from: s.baslik }) }), 20000);
      if (!r.ok) throw new Error('SMS geçidi ' + r.status + ' döndü.'); return '';
    }
    throw new Error('Bilinmeyen SMS sağlayıcısı.');
  }

  // ---------- E-posta (SMTP) ----------
  const mkRd = (s) => { let buf = '', w = null, err = null; const pump = () => { if (!w) return; if (err) { const r = w; w = null; r.no(err); return; } const m = buf.match(/^(?:\d{3}-[^\n]*\n)*\d{3}[ ][^\n]*\n/); if (m) { buf = buf.slice(m[0].length); const r = w; w = null; r.ok(m[0]); } }; s.on('data', d => { buf += d.toString('utf8'); pump(); }); s.on('error', e => { err = e; pump(); }); s.on('close', () => { err = err || new Error('Bağlantı kapandı.'); pump(); }); return () => new Promise((ok, no) => { w = { ok, no }; pump(); }); };
  const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64'), b64w = (s) => b64(s).replace(/(.{76})/g, '$1\r\n');
  const encH = (s) => /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + b64(s) + '?=';
  async function smtpGonder(c, to, konu, metin, html) {
    const m = c.mail; if (!m.host || !mailOk(m.adres)) throw new Error('E-posta (SMTP) ayarları eksik (İletişim Ayarları).');
    const port = +m.port || 587, gizli = m.guvenlik;
    return zaman((async () => {
      let s = gizli === 'ssl' ? tls.connect({ host: m.host, port, servername: m.host }) : net.connect({ host: m.host, port });
      s.setTimeout(20000, () => s.destroy(new Error('SMTP zaman aşımı.')));
      let rd = mkRd(s); const send = async (l, ok) => { s.write(l + '\r\n'); const r = await rd(); if (!r.startsWith(ok)) throw new Error('SMTP: ' + r.trim().slice(0, 160)); return r; };
      try {
        let r = await rd(); if (!r.startsWith('220')) throw new Error('SMTP: ' + r.trim().slice(0, 160));
        await send('EHLO bagispanel.local', '250');
        if (gizli === 'starttls') { await send('STARTTLS', '220'); s.removeAllListeners('data'); s.removeAllListeners('close'); s.removeAllListeners('error'); s = tls.connect({ socket: s, servername: m.host }); rd = mkRd(s); await new Promise((ok, no) => { s.once('secureConnect', ok); s.once('error', no); }); await send('EHLO bagispanel.local', '250'); }
        if (m.kullanici) { await send('AUTH LOGIN', '334'); await send(b64(m.kullanici), '334'); await send(b64(m.sifre), '235'); }
        await send(`MAIL FROM:<${m.adres}>`, '250'); await send(`RCPT TO:<${to}>`, '25');
        await send('DATA', '354');
        const sin = 'b' + crypto.randomBytes(8).toString('hex'), basl = [`From: ${m.ad ? encH(m.ad) + ' ' : ''}<${m.adres}>`, `To: <${to}>`, `Subject: ${encH(konu)}`, 'Date: ' + new Date().toUTCString(), `Message-ID: <${crypto.randomBytes(8).toString('hex')}@bagispanel>`, 'MIME-Version: 1.0'];
        if (m.yanit && mailOk(m.yanit)) basl.push(`Reply-To: <${m.yanit}>`);
        const govde = html ? [...basl, `Content-Type: multipart/alternative; boundary="${sin}"`, '', `--${sin}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64w(metin), `--${sin}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64w(html), `--${sin}--`].join('\r\n') : [...basl, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64w(metin)].join('\r\n');
        await send(govde.replace(/\r\n\./g, '\r\n..') + '\r\n.', '250');
        try { s.write('QUIT\r\n'); } catch (e) { }
      } finally { setTimeout(() => s.destroy(), 200); }
      return '';
    })(), 30000);
  }

  // ---------- WhatsApp (Meta Cloud API) ----------
  async function waGonder(c, tel, tip, veri) {
    const w = c.wa; if (!w.phone_id || !w.token) throw new Error('WhatsApp ayarları eksik (İletişim Ayarları).');
    const govde = { messaging_product: 'whatsapp', to: e164(tel) };
    if (tip === 'sablon') { Object.assign(govde, { type: 'template', template: { name: veri.ad, language: { code: veri.dil || w.dil || 'tr' }, ...(veri.p && veri.p.length ? { components: [{ type: 'body', parameters: veri.p.map(x => ({ type: 'text', text: String(x).slice(0, 1000) || '-' })) }] } : {}) } }); } else { Object.assign(govde, { type: 'text', text: { body: veri.metin, preview_url: false } }); }
    const base = (w.api_url || 'https://graph.facebook.com/v21.0').replace(/\/$/, '');
    const r = await zaman(fetch(`${base}/${encodeURIComponent(w.phone_id)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + w.token }, body: JSON.stringify(govde) }), 20000);
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('WhatsApp: ' + ((j.error && (j.error.error_user_msg || j.error.message)) || r.status));
    return (j.messages && j.messages[0] && j.messages[0].id) || '';
  }

  // ---------- ortak: tek mesaj gönder (mod'a göre) ----------
  async function gonder(kanal, hedef, ic) { // ic: {mesaj, konu, html, sablon:{ad,dil,p}}
    const c = cfg(); if (c.mod !== 'canli') return { ok: true, deneme: true, mid: '' };
    try {
      if (kanal === 'sms') return { ok: true, mid: await smsGonder(c, hedef, ic.mesaj) };
      if (kanal === 'mail') return { ok: true, mid: await smtpGonder(c, hedef, ic.konu || 'Bilgilendirme', ic.mesaj, ic.html) };
      if (kanal === 'wa') return { ok: true, mid: await waGonder(c, hedef, ic.sablon ? 'sablon' : 'metin', ic.sablon || { metin: ic.mesaj }) };
      throw new Error('Bilinmeyen kanal.');
    } catch (e) { return { ok: false, hata: String(e.message || e).slice(0, 300) }; }
  }
  ctx.iletisimGonder = gonder;
  const KN = { sms: 'SMS', mail: 'E-posta', wa: 'WhatsApp' };
  const logla = (kanal, kime, mesaj, sablon, kullanici, durum, hata) => db.prepare('INSERT INTO sms_log(mesaj,kime,sablon,kullanici,kanal,durum,hata) VALUES(?,?,?,?,?,?,?)').run(mesaj, kime, sablon, kullanici || null, KN[kanal] || kanal, durum, hata || null);

  // ---------- ayar uçları ----------
  R('GET', '/api/iletisim/ayar', 'iayar', 'g', async (c) => [200, { ayar: maskeli(cfg()), webhook: '/api/wa/webhook' }]);
  R('PUT', '/api/iletisim/ayar', 'iayar', 'e', async (c) => {
    const o = c.body || {}, eski = getA('iletisim', {}), cur = cfg(), yeni = { mod: o.mod === undefined ? cur.mod : (o.mod === 'canli' ? 'canli' : 'deneme') };
    if (yeni.mod === 'canli' && cur.mod !== 'canli' && !A.can(c.perms, 'iayar', 's')) throw new Err(403, 'Canlı moda geçmek için bu menüde silme/onay (S) yetkisi gerekir.');
    ['sms', 'mail', 'wa'].forEach(k => { yeni[k] = { ...cur[k] }; Object.keys(DEF[k]).forEach(f => { if (f === 'sablonlar' || f === 'verify') return; const v = (o[k] || {})[f]; if (v === undefined) return; if ((SIR[k] || []).includes(f) && v === '') return; yeni[k][f] = typeof DEF[k][f] === 'number' ? (+v || DEF[k][f]) : str(v, 300); }); });
    if (!['netgsm', 'twilio', 'ozel'].includes(yeni.sms.saglayici)) yeni.sms.saglayici = 'netgsm';
    if (!['starttls', 'ssl', 'yok'].includes(yeni.mail.guvenlik)) yeni.mail.guvenlik = 'starttls';
    const sb = (o.wa || {}).sablonlar; yeni.wa.sablonlar = Array.isArray(sb) ? sb.slice(0, 50).map(x => ({ ad: str(x.ad, 100).toLowerCase().replace(/[^a-z0-9_]/g, '_'), dil: str(x.dil, 10) || 'tr', govde: str(x.govde, 1000), n: Math.max(0, Math.min(10, Math.floor(+x.n || 0))) })).filter(x => x.ad) : cur.wa.sablonlar;
    setA('iletisim', yeni); A.audit(c.user, 'iletisim_ayari', yeni.mod, ip(c.req)); return [200, { ok: 1 }];
  });
  R('GET', '/api/iletisim/ozet', 'tsms|tmail|twa', 'g', async () => { const c = cfg(); return [200, { mod: c.mod, hazir: { sms: c.mod === 'deneme' || !!c.sms.sifre || c.sms.saglayici === 'ozel', mail: c.mod === 'deneme' || !!(c.mail.host && c.mail.adres), wa: c.mod === 'deneme' || !!(c.wa.phone_id && c.wa.token) }, sablonlar: c.wa.sablonlar, kategoriler: db.prepare('SELECT DISTINCT kat FROM bagis_turleri ORDER BY kat').all().map(x => x.kat), dernek: getA('dernek_adi', '[Dernek adı]') }]; });
  R('POST', '/api/iletisim/test', 'iayar', 'e', async (c) => {
    const k = c.body.kanal, hedef = str(c.body.hedef, 120); if (!['sms', 'mail', 'wa'].includes(k)) throw new Err(400, 'Kanal seçin.'); if (!hedef) throw new Err(400, 'Alıcıyı yazın.');
    const cc = cfg(), msg = 'bağışpanel test mesajı. Bu mesajı siz istediniz.';
    if (k === 'mail' && !mailOk(hedef)) throw new Err(400, 'Geçerli bir e-posta yazın.'); if (k !== 'mail' && digits(hedef).length < 10) throw new Err(400, 'Geçerli bir telefon yazın.');
    let ic = { mesaj: msg, konu: 'bağışpanel test' }; if (k === 'wa') { const sb = (cc.wa.sablonlar || []).find(x => x.ad === str(c.body.sablon, 100)); if (sb) ic = { sablon: { ad: sb.ad, dil: sb.dil, p: Array.from({ length: sb.n }, () => 'Test') } }; }
    const r = await gonder(k, hedef, ic); logla(k, hedef, ic.mesaj || ('şablon: ' + (ic.sablon || {}).ad), 'test', c.user.kadi, r.ok ? (r.deneme ? 'Deneme (gönderilmedi)' : 'Gönderildi') : 'Hata', r.hata);
    return [200, { ok: r.ok, deneme: !!r.deneme, hata: r.hata || null }];
  });

  // ---------- alıcı seçimi ----------
  function alicilar(kanal, f) {
    f = f || {}; const bugun = new Date(), gun = (n) => { const d = new Date(bugun); d.setDate(d.getDate() - n); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
    const w = [], p = [];
    const rows = db.prepare(`SELECT b.id, b.ad, b.tel, b.eposta, b.izin, MAX(g.tarih) son, COALESCE(SUM(g.tl),0) toplam, COUNT(g.id) adet FROM bagiscilar b LEFT JOIN bagislar g ON g.bagisci_id=b.id AND g.durum='Onaylı' GROUP BY b.id`).all();
    const katlar = f.kat ? new Set(db.prepare("SELECT DISTINCT g.bagisci_id id FROM bagislar g JOIN bagis_turleri t ON t.id=g.tur_id WHERE g.durum='Onaylı' AND t.kat=?").all(str(f.kat, 60)).map(x => x.id)) : null;
    const orgs = f.org ? new Set(db.prepare("SELECT DISTINCT g.bagisci_id id FROM bagislar g JOIN bagis_turleri t ON t.id=g.tur_id WHERE g.durum='Onaylı' AND t.org=?").all(str(f.org, 20)).map(x => x.id)) : null;
    const out = [], gor = new Set(), ids = Array.isArray(f.ids) ? new Set(f.ids.map(Number)) : null;
    rows.forEach(b => {
      if (ids && !ids.has(b.id)) return;
      const izin = b.izin ? JSON.parse(b.izin) : {}, hedef = kanal === 'mail' ? String(b.eposta || '').trim() : b.tel;
      if (kanal === 'mail' ? !mailOk(hedef) : digits(hedef).length < 10) return;
      if (izin[kanal] === 'ret') return; if (f.izin === 'sadece' && izin[kanal] !== 'izinli') return;
      if (f.aktif_gun && !(b.son && b.son >= gun(+f.aktif_gun))) return; if (f.pasif_gun && b.son && b.son >= gun(+f.pasif_gun)) return; if (f.pasif_gun && !b.son) return;
      if (f.min && b.toplam < +f.min) return; if (f.max && b.toplam > +f.max) return; if (f.adet_min && b.adet < +f.adet_min) return;
      if (katlar && !katlar.has(b.id)) return; if (orgs && !orgs.has(b.id)) return;
      const k = kanal === 'mail' ? hedef.toLowerCase() : e164(hedef); if (gor.has(k)) return; gor.add(k); out.push({ bagisci_id: b.id, ad: b.ad, hedef: kanal === 'mail' ? hedef : e164(hedef) });
    });
    String(f.liste || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 5000).forEach(l => { const [a, b] = l.includes(';') ? [l.split(';')[0], l.split(';')[1]] : ['', l], t = String(b || '').trim(), k = kanal === 'mail' ? t.toLowerCase() : e164(t); if (kanal === 'mail' ? !mailOk(t) : digits(t).length < 10) return; if (gor.has(k)) return; gor.add(k); out.push({ bagisci_id: null, ad: a.trim() || 'Sayın bağışçımız', hedef: kanal === 'mail' ? t : k }); });
    return out;
  }
  R('GET', '/api/toplu/bagiscilar', 'tsms|tmail|twa', 'g', async (c) => {
    const p = new URL(c.req.url, 'http://x').searchParams, kanal = p.get('kanal'); kontrol(c, kanal, 'g'); const q = str(p.get('q'), 60).toLowerCase();
    const rows = db.prepare(`SELECT b.id, b.ad, b.tel, b.eposta, b.izin, MAX(g.tarih) son, COALESCE(SUM(g.tl),0) toplam, COUNT(g.id) adet FROM bagiscilar b LEFT JOIN bagislar g ON g.bagisci_id=b.id AND g.durum='Onaylı' GROUP BY b.id ORDER BY b.ad`).all();
    let uygun = 0, ret = 0, yok = 0; const L = [], RL = [];
    rows.forEach(b => { const hedef = kanal === 'mail' ? String(b.eposta || '').trim() : b.tel; if (kanal === 'mail' ? !mailOk(hedef) : digits(hedef).length < 10) { yok++; return; } const iz = b.izin ? JSON.parse(b.izin) : {}; if (iz[kanal] === 'ret') { ret++; if (!q || String(b.ad).toLowerCase().includes(q)) RL.push({ id: b.id, ad: b.ad }); return; } uygun++; if (q && !(String(b.ad).toLowerCase().includes(q) || String(hedef).toLowerCase().includes(q))) return; L.push({ id: b.id, ad: b.ad, hedef, son: b.son, toplam: b.toplam, adet: b.adet }); });
    return [200, { liste: L.slice(0, 500), eslesen: L.length, uygun, ret, yok, retliste: RL.slice(0, 200) }];
  });
  R('GET', '/api/wa/ozet', 'twa', 'g', async () => {
    const q = (sql, ...a) => db.prepare(sql).get(...a) || {}, bugun = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
    const gelen = q("SELECT COUNT(*) n, SUM(okundu=0) ok0 FROM wa_mesaj WHERE yon='gelen'"), kon = db.prepare("SELECT tel, MAX(id) i, MAX(CASE WHEN yon='gelen' THEN zaman END) sg FROM wa_mesaj GROUP BY tel").all();
    let bekl = 0, acik = 0; kon.forEach(k => { const m = db.prepare('SELECT yon FROM wa_mesaj WHERE id=?').get(k.i); if (m.yon === 'gelen') bekl++; if (k.sg && (Date.now() - new Date(k.sg.replace(' ', 'T')).getTime()) < 86400000) acik++; });
    const gun7 = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); gun7.push({ gun: k, gelen: q("SELECT COUNT(*) n FROM wa_mesaj WHERE yon='gelen' AND date(zaman)=?", k).n, giden: q("SELECT COUNT(*) n FROM toplu_alici a JOIN toplu_gonderim g ON g.id=a.gid WHERE g.kanal='wa' AND a.durum<>'Bekliyor' AND date(a.zaman)=?", k).n + q("SELECT COUNT(*) n FROM wa_mesaj WHERE yon='giden' AND date(zaman)=?", k).n }); }
    const d = db.prepare("SELECT a.durum, COUNT(*) n FROM toplu_alici a JOIN toplu_gonderim g ON g.id=a.gid WHERE g.kanal='wa' GROUP BY a.durum").all(), D = Object.fromEntries(d.map(x => [x.durum, x.n]));
    const son = db.prepare("SELECT id, ad, zaman, durum FROM toplu_gonderim WHERE kanal='wa' ORDER BY id DESC LIMIT 5").all();
    return [200, { okunmamis: gelen.ok0 || 0, gelenToplam: gelen.n || 0, bekleyen: bekl, acik, konusma: kon.length, bugunGelen: q("SELECT COUNT(*) n FROM wa_mesaj WHERE yon='gelen' AND date(zaman)=?", bugun).n, bugunGiden: gun7[6].giden, teslim: (D['Teslim edildi'] || 0) + (D['Okundu'] || 0), okundu: D['Okundu'] || 0, gonderildi: (D['Gönderildi'] || 0) + (D['Teslim edildi'] || 0) + (D['Okundu'] || 0), hata: D['Hata'] || 0, gun7, son }];
  });
  const kanalMenu = { sms: 'tsms', mail: 'tmail', wa: 'twa' };
  const kontrol = (c, kanal, g) => { if (!kanalMenu[kanal]) throw new Err(400, 'Kanal seçin.'); if (!A.can(c.perms, kanalMenu[kanal], g)) throw new Err(403, 'Bu işlem için yetkiniz yok.'); };
  R('POST', '/api/toplu/hedef', 'tsms|tmail|twa', 'g', async (c) => { kontrol(c, c.body.kanal, 'g'); const L = alicilar(c.body.kanal, c.body.filtre); return [200, { adet: L.length, ornek: L.slice(0, 5).map(x => x.ad) }]; });
  const fill = (m, v) => String(m || '').replace(/\{(\w+)\}/g, (_, k) => v[k] !== undefined ? v[k] : '{' + k + '}');
  const ilkAd = (s) => String(s || '').trim().split(/\s+/)[0] || 'Sayın bağışçımız';
  const degerler = (a, dernek) => ({ ad: ilkAd(a.ad), tam_ad: a.ad || '', dernek });
  const htmlGovde = (m) => '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">' + esc2(m).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</div>';

  R('POST', '/api/toplu', 'tsms|tmail|twa', 'e', async (c) => {
    const b = c.body, kanal = b.kanal; kontrol(c, kanal, 'e');
    if (b.onay !== true) throw new Err(400, 'Alıcıların bu mesajı almayı kabul ettiğini onaylayın.');
    const ad = str(b.ad, 80) || 'Toplu gönderim', mesaj = String(b.mesaj || '').slice(0, 2000).trim(), konu = str(b.konu, 150);
    let sablon = null, deg = null;
    if (kanal === 'wa') { const sb = (cfg().wa.sablonlar || []).find(x => x.ad === str(b.sablon, 100)); if (!sb) throw new Err(400, 'Onaylı WhatsApp şablonu seçin (İletişim Ayarları’nda tanımlanır).'); sablon = sb.ad; deg = Array.isArray(b.degisken) ? b.degisken.slice(0, sb.n).map(x => ['ad', 'tam_ad', 'dernek'].includes(x) ? x : str(x, 200)) : []; while (deg.length < sb.n) deg.push('ad'); }
    else { if (!mesaj) throw new Err(400, 'Mesajı yazın.'); if (kanal === 'mail' && !konu) throw new Err(400, 'E-posta konusunu yazın.'); }
    const L = alicilar(kanal, b.filtre); if (!L.length) throw new Err(400, 'Seçilen süzgeçle alıcı bulunamadı.'); if (L.length > 20000) throw new Err(400, 'Tek gönderimde en fazla 20.000 alıcı olabilir.');
    return tx(() => {
      const mod = cfg().mod, gid = +db.prepare('INSERT INTO toplu_gonderim(kanal,ad,konu,mesaj,sablon,degisken,filtre,mod,kullanici) VALUES(?,?,?,?,?,?,?,?,?)').run(kanal, ad, konu, mesaj, sablon, deg ? JSON.stringify(deg) : null, JSON.stringify(b.filtre || {}), mod, c.user.kadi).lastInsertRowid;
      const ins = db.prepare('INSERT INTO toplu_alici(gid,bagisci_id,ad,hedef) VALUES(?,?,?,?)'); L.forEach(a => ins.run(gid, a.bagisci_id, a.ad, a.hedef));
      A.audit(c.user, 'toplu_gonderim', `${KN[kanal]} · ${L.length} alıcı · ${mod}`, ip(c.req)); return [201, { id: gid, adet: L.length, mod }];
    });
  });
  const ozetle = (g) => { const s = db.prepare("SELECT durum, COUNT(*) n FROM toplu_alici WHERE gid=? GROUP BY durum").all(g.id), m = {}; s.forEach(x => m[x.durum] = x.n); const top = s.reduce((a, x) => a + x.n, 0); return { id: g.id, kanal: g.kanal, ad: g.ad, konu: g.konu, mod: g.mod, durum: g.durum, kullanici: g.kullanici, zaman: g.zaman, toplam: top, bekliyor: m['Bekliyor'] || 0, gonderildi: (m['Gönderildi'] || 0) + (m['Teslim edildi'] || 0) + (m['Okundu'] || 0), hata: m['Hata'] || 0, deneme: m['Deneme'] || 0 }; };
  R('GET', '/api/toplu', 'tsms|tmail|twa', 'g', async (c) => { const k = new URL(c.req.url, 'http://x').searchParams.get('kanal'); kontrol(c, k, 'g'); return [200, db.prepare('SELECT * FROM toplu_gonderim WHERE kanal=? ORDER BY id DESC LIMIT 100').all(k).map(ozetle)]; });
  R('GET', '/api/toplu/([0-9]+)', 'tsms|tmail|twa', 'g', async (c) => { const g = db.prepare('SELECT * FROM toplu_gonderim WHERE id=?').get(+c.m[1]); if (!g) throw new Err(404, 'Gönderim yok.'); kontrol(c, g.kanal, 'g'); return [200, { ...ozetle(g), mesaj: g.mesaj, sablon: g.sablon, alicilar: db.prepare('SELECT ad,hedef,durum,hata,zaman FROM toplu_alici WHERE gid=? ORDER BY (durum=\'Hata\') DESC, id LIMIT 500').all(g.id) }]; });
  R('POST', '/api/toplu/([0-9]+)/durum', 'tsms|tmail|twa', 'd', async (c) => { const g = db.prepare('SELECT * FROM toplu_gonderim WHERE id=?').get(+c.m[1]); if (!g) throw new Err(404, 'Gönderim yok.'); kontrol(c, g.kanal, 'd'); const y = c.body.durum === 'durdur' ? 'Durduruldu' : 'Gönderiliyor'; if (!['Gönderiliyor', 'Durduruldu'].includes(g.durum)) throw new Err(409, 'Bu gönderim tamamlanmış.'); db.prepare('UPDATE toplu_gonderim SET durum=? WHERE id=?').run(y, g.id); return [200, { ok: 1 }]; });

  // ---------- kuyruk işçisi ----------
  const HIZ = { sms: 8, mail: 4, wa: 8 }; let calisiyor = false;
  async function tick() {
    if (calisiyor) return; calisiyor = true;
    try {
      const gs = db.prepare("SELECT * FROM toplu_gonderim WHERE durum='Gönderiliyor' ORDER BY id LIMIT 3").all(), dernek = getA('dernek_adi', '[Dernek adı]');
      for (const g of gs) {
        const al = db.prepare("SELECT * FROM toplu_alici WHERE gid=? AND durum='Bekliyor' ORDER BY id LIMIT ?").all(g.id, HIZ[g.kanal] || 5);
        for (const a of al) {
          const v = degerler(a, dernek); let ic;
          if (g.kanal === 'wa') ic = { sablon: { ad: g.sablon, p: JSON.parse(g.degisken || '[]').map(x => v[x] !== undefined ? v[x] : x) } }; else ic = { mesaj: fill(g.mesaj, v), konu: fill(g.konu, v), html: g.kanal === 'mail' ? htmlGovde(fill(g.mesaj, v)) : undefined };
          const r = await gonder(g.kanal, a.hedef, ic), d = r.ok ? (r.deneme ? 'Deneme' : 'Gönderildi') : 'Hata';
          db.prepare('UPDATE toplu_alici SET durum=?, hata=?, mid=?, zaman=datetime(\'now\',\'localtime\') WHERE id=?').run(d, r.hata || null, r.mid || null, a.id);
          logla(g.kanal, a.hedef, ic.mesaj || ('şablon: ' + g.sablon), 'toplu:' + g.id, g.kullanici, d === 'Deneme' ? 'Deneme (gönderilmedi)' : d, r.hata);
        }
        if (!db.prepare("SELECT 1 FROM toplu_alici WHERE gid=? AND durum='Bekliyor' LIMIT 1").get(g.id)) db.prepare("UPDATE toplu_gonderim SET durum='Tamamlandı' WHERE id=?").run(g.id);
      }
    } catch (e) { console.error('toplu gönderim', e.message); } finally { calisiyor = false; }
  }
  ctx.iletisimTick = tick; setInterval(tick, 1500).unref();

  // ---------- yanıtsız WhatsApp / cevapsız arama birikince yönetici-sorumluya SMS veya e-posta uyarısı ----------
  const UDEF = { acik: false, esik: 10, saat: 4, cagri_esik: 5, kanal: 'sms', alicilar: [], tekrar_saat: 12, son: '' };
  const uCfg = () => ({ ...UDEF, ...getA('wauyari', {}) });
  const yerelIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 19).replace('T', ' ');
  function uDurum() {
    const w = db.prepare("SELECT COUNT(*) n, MIN(zaman) en_eski FROM wa_mesaj WHERE yon='gelen' AND okundu=0").get(), bugun = yerelIso(new Date()).slice(0, 10);
    const c = db.prepare("SELECT COUNT(*) n FROM cagri WHERE yon='gelen' AND sonuc='Cevapsız' AND date(zaman)=?").get(bugun).n;
    const saat = w.en_eski ? Math.max(0, Math.floor((Date.now() - new Date(w.en_eski.replace(' ', 'T')).getTime()) / 36e5)) : 0;
    return { wa: w.n, wa_saat: saat, cagri: c };
  }
  async function uyariGonder(zorla) {
    const u = uCfg(), d = uDurum(); if (!zorla) {
      if (!u.acik || !u.alicilar.length) return { gonderildi: 0 };
      const ws = d.wa > 0 && (d.wa >= u.esik || d.wa_saat >= u.saat), cs = u.cagri_esik > 0 && d.cagri >= u.cagri_esik; if (!ws && !cs) return { gonderildi: 0 };
      if (u.son && Date.now() - new Date(u.son.replace(' ', 'T')).getTime() < u.tekrar_saat * 36e5) return { gonderildi: 0 };
    }
    const parca = []; if (d.wa > 0) parca.push(`${d.wa} WhatsApp mesajı yanıt bekliyor (en eskisi ${d.wa_saat} saattir)`); if (d.cagri > 0) parca.push(`bugün ${d.cagri} cevapsız arama var`);
    if (!parca.length) return { gonderildi: 0, bos: true };
    const metin = 'bağışpanel uyarı: ' + parca.join('; ') + '. Lütfen panelden kontrol edin.', kanallar = u.kanal === 'ikisi' ? ['sms', 'mail'] : [u.kanal];
    const us = u.alicilar.map(id => db.prepare('SELECT ad,telefon,eposta FROM users WHERE id=? AND aktif=1').get(id)).filter(Boolean); let n = 0;
    for (const k of kanallar) for (const x of us) {
      const hedef = k === 'sms' ? x.telefon : x.eposta; if (!hedef) { logla(k, x.ad, metin, 'uyari', null, 'Hata', k === 'sms' ? 'Telefon yok' : 'E-posta yok'); continue; }
      const r = await gonder(k, hedef, { mesaj: metin, konu: 'bağışpanel: yanıt bekleyen mesajlar' }); n += r.ok ? 1 : 0;
      logla(k, hedef, metin, 'uyari', null, r.ok ? (r.deneme ? 'Deneme (gönderilmedi)' : 'Gönderildi') : 'Hata', r.hata);
    }
    if (!zorla) setA('wauyari', { ...u, son: yerelIso(new Date()) }); return { gonderildi: n, metin };
  }
  setInterval(() => { uyariGonder(false).catch(e => console.error('uyarı', e.message)); }, 5 * 60 * 1000).unref();
  R('GET', '/api/iletisim/uyari', 'iayar', 'g', async () => [200, { ayar: uCfg(), durum: uDurum(), kullanicilar: db.prepare("SELECT u.id,u.ad,u.telefon,u.eposta,b.ad birim FROM users u JOIN birimler b ON b.id=u.birim_id WHERE u.aktif=1 ORDER BY u.ad").all(), mod: cfg().mod }]);
  R('PUT', '/api/iletisim/uyari', 'iayar', 'e', async (c) => {
    const b = c.body || {}, n = (v, lo, hi, ad) => { const x = Math.round(+v); if (!isFinite(x) || x < lo || x > hi) throw new Err(400, `${ad} ${lo}–${hi} arasında olmalı.`); return x; };
    const kanal = ['sms', 'mail', 'ikisi'].includes(b.kanal) ? b.kanal : 'sms', al = [...new Set((Array.isArray(b.alicilar) ? b.alicilar : []).map(Number).filter(Number.isInteger))].filter(id => db.prepare('SELECT 1 FROM users WHERE id=?').get(id));
    if (b.acik && !al.length) throw new Err(400, 'Uyarıyı açmak için en az bir alıcı seçin.');
    setA('wauyari', { ...uCfg(), acik: !!b.acik, esik: n(b.esik, 1, 1000, 'Mesaj eşiği'), saat: n(b.saat, 1, 168, 'Bekleme süresi (saat)'), cagri_esik: n(b.cagri_esik, 0, 1000, 'Cevapsız arama eşiği'), tekrar_saat: n(b.tekrar_saat, 1, 168, 'Tekrar aralığı (saat)'), kanal, alicilar: al });
    A.audit(c.user, 'wa_uyari_ayar', b.acik ? 'açık' : 'kapalı', ip(c.req)); return [200, { ok: 1 }];
  });
  R('POST', '/api/iletisim/uyari/dene', 'iayar', 'e', async (c) => { if (!uCfg().alicilar.length) throw new Err(400, 'Önce alıcı seçip kaydedin.'); const r = await uyariGonder(true); if (r.bos) throw new Err(409, 'Şu an yanıt bekleyen mesaj ya da cevapsız arama yok; gönderilecek bir şey yok.'); return [200, r]; });

  // ---------- otomatik mesajlar (kabul, sertifika…) artık sağlayıcıdan geçer ----------
  ctx.sms = ((eski) => (k, v, kime, user, tel) => { const r = eski(k, v, kime, user, tel); if (!r) return; const mod = cfg().mod; if (mod !== 'canli' || !tel || digits(tel).length < 10) { db.prepare('UPDATE sms_log SET durum=? WHERE id=?').run(mod !== 'canli' ? 'Deneme (gönderilmedi)' : 'Telefon yok', r.id); return; } gonder('sms', tel, { mesaj: r.mesaj }).then(x => db.prepare('UPDATE sms_log SET durum=?, hata=? WHERE id=?').run(x.ok ? 'Gönderildi' : 'Hata', x.hata || null, r.id)); })(ctx.sms);

  // ---------- bağışçı iletişim izni ----------
  R('PUT', '/api/bagiscilar/([0-9]+)/izin', 'bagisci', 'e', async (c) => {
    const b = db.prepare('SELECT * FROM bagiscilar WHERE id=?').get(+c.m[1]); if (!b) throw new Err(404, 'Bağışçı yok.'); const cur = b.izin ? JSON.parse(b.izin) : {};
    ['sms', 'mail', 'wa', 'ara'].forEach(k => { const v = (c.body || {})[k]; if (v === undefined) return; if (v === null || v === '') delete cur[k]; else if (['izinli', 'ret'].includes(v)) cur[k] = v; });
    db.prepare('UPDATE bagiscilar SET izin=? WHERE id=?').run(JSON.stringify(cur), b.id); A.audit(c.user, 'bagisci_izin', b.ad, ip(c.req)); return [200, { izin: cur }];
  });

  // ---------- WhatsApp gelen kutusu ve webhook ----------
  R('GET', '/api/wa/konusmalar', 'twa', 'g', async () => {
    const L = db.prepare(`SELECT tel, MAX(id) son_id, SUM(CASE WHEN yon='gelen' AND okundu=0 THEN 1 ELSE 0 END) okunmamis, MAX(CASE WHEN yon='gelen' THEN zaman END) son_gelen FROM wa_mesaj GROUP BY tel ORDER BY son_id DESC LIMIT 200`).all();
    return [200, L.map(x => { const m = db.prepare('SELECT * FROM wa_mesaj WHERE id=?').get(x.son_id), ad = (db.prepare("SELECT ad FROM wa_mesaj WHERE tel=? AND ad IS NOT NULL AND ad<>'' ORDER BY id DESC LIMIT 1").get(x.tel) || {}).ad || ''; const sa = x.son_gelen ? (Date.now() - new Date(x.son_gelen.replace(' ', 'T')).getTime()) / 3600000 : 99; return { tel: x.tel, ad, son: m.govde, yon: m.yon, zaman: m.zaman, okunmamis: x.okunmamis, pencere: sa < 24, bekliyor: m.yon === 'gelen' }; })];
  });
  R('GET', '/api/wa/konusma', 'twa', 'g', async (c) => { const tel = digits(new URL(c.req.url, 'http://x').searchParams.get('tel')); db.prepare("UPDATE wa_mesaj SET okundu=1 WHERE tel=? AND yon='gelen'").run(tel); const bg = db.prepare('SELECT id,ad FROM bagiscilar').all().find(b => e164(b.tel) === tel); return [200, { tel, bagisci: bg || null, mesajlar: db.prepare('SELECT yon,tip,govde,zaman FROM wa_mesaj WHERE tel=? ORDER BY id DESC LIMIT 100').all(tel).reverse() }]; });
  R('POST', '/api/wa/yanit', 'twa', 'e', async (c) => {
    const tel = digits(c.body.tel), metin = String(c.body.metin || '').trim().slice(0, 1500); if (!tel || !metin) throw new Err(400, 'Mesajı yazın.');
    const son = db.prepare("SELECT zaman FROM wa_mesaj WHERE tel=? AND yon='gelen' ORDER BY id DESC LIMIT 1").get(tel); if (!son || Date.now() - new Date(son.zaman.replace(' ', 'T')).getTime() > 24 * 3600000) throw new Err(400, 'Son müşteri mesajından 24 saat geçti. Serbest yanıt yazılamaz; onaylı şablonla yeniden yazın.');
    const r = await gonder('wa', tel, { mesaj: metin }); if (!r.ok) throw new Err(502, r.hata);
    db.prepare("INSERT INTO wa_mesaj(wid,tel,yon,tip,govde,okundu) VALUES(?,?,?,?,?,1)").run(r.mid || null, tel, 'giden', 'text', metin); logla('wa', tel, metin, 'yanit', c.user.kadi, r.deneme ? 'Deneme (gönderilmedi)' : 'Gönderildi'); return [200, { ok: 1, deneme: !!r.deneme }];
  });
  R('GET', '/api/wa/webhook', null, null, async (c) => { const p = new URL(c.req.url, 'http://x').searchParams; if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') && p.get('hub.verify_token') === cfg().wa.verify) return [200, { text: p.get('hub.challenge') || '' }]; throw new Err(403, 'Doğrulama başarısız.'); });
  R('POST', '/api/wa/webhook', null, null, async (c) => {
    const w = cfg().wa; if (!w.app_secret) throw new Err(403, 'Uygulama gizli anahtarı (App Secret) tanımlı değil.');
    const imza = String(c.req.headers['x-hub-signature-256'] || ''), bek = 'sha256=' + crypto.createHmac('sha256', w.app_secret).update(c.req.rawBody || '').digest('hex');
    if (imza.length !== bek.length || !crypto.timingSafeEqual(Buffer.from(imza), Buffer.from(bek))) throw new Err(403, 'İmza geçersiz.');
    (c.body.entry || []).forEach(e => (e.changes || []).forEach(ch => { const v = ch.value || {}; const adlar = {}; (v.contacts || []).forEach(k => adlar[k.wa_id] = (k.profile || {}).name || '');
      (v.messages || []).forEach(m => { const t = m.type === 'text' ? (m.text || {}).body : '[' + m.type + ']'; const tel = digits(m.from), bg = db.prepare('SELECT id,tel FROM bagiscilar').all().find(b => e164(b.tel) === tel); db.prepare('INSERT OR IGNORE INTO wa_mesaj(wid,tel,ad,yon,tip,govde,bagisci_id) VALUES(?,?,?,?,?,?,?)').run(m.id, tel, adlar[m.from] || '', 'gelen', m.type, String(t || '').slice(0, 2000), bg ? bg.id : null); });
      (v.statuses || []).forEach(s => { const d = { delivered: 'Teslim edildi', read: 'Okundu', failed: 'Hata', sent: 'Gönderildi' }[s.status]; if (d && s.id) db.prepare("UPDATE toplu_alici SET durum=?, hata=? WHERE mid=? AND durum<>'Okundu'").run(d, d === 'Hata' ? str(((s.errors || [])[0] || {}).title || 'Teslim edilemedi', 200) : null, s.id); }); }));
    return [200, { ok: 1 }];
  });

  // ---------- Çağrı merkezi ----------
  db.exec("CREATE TABLE IF NOT EXISTS cagri(id INTEGER PRIMARY KEY, bagisci_id INTEGER, tel TEXT, ad TEXT, yon TEXT NOT NULL DEFAULT 'giden', sonuc TEXT, notu TEXT, sure INTEGER, dahili TEXT, kullanici TEXT, kaynak TEXT NOT NULL DEFAULT 'elle', kayit_url TEXT, zaman TEXT NOT NULL DEFAULT (datetime('now','localtime')))");
  db.exec('CREATE INDEX IF NOT EXISTS ix_cagri_b ON cagri(bagisci_id)');
  const CSON = ['Görüştük', 'Bağış sözü verdi', 'Ulaşılamadı / açmadı', 'Meşgul', 'Daha sonra ara', 'Yanlış numara', 'Aranmak istemiyor'];
  const cAyar = () => { let a = getA('cagri_ayar', null); if (!a || !a.anahtar) { a = { saglayici: (a || {}).saglayici || 'tel', anahtar: crypto.randomBytes(18).toString('hex') }; setA('cagri_ayar', a); } return a; };
  const bulBagisci = (tel) => { const d = e164(tel); if (d.length < 7) return null; return db.prepare('SELECT id,ad,tel FROM bagiscilar').all().find(b => { const x = e164(b.tel); return x === d || (x.length >= 10 && d.length >= 10 && x.slice(-10) === d.slice(-10)); }) || null; };
  R('GET', '/api/cagri/ayar', 'iayar', 'g', async () => { const a = cAyar(); return [200, { saglayici: a.saglayici, anahtar: a.anahtar, webhook: '/api/cagri/webhook' }]; });
  R('PUT', '/api/cagri/ayar', 'iayar', 'e', async (c) => { const a = cAyar(), b = c.body || {}; if (b.saglayici !== undefined) { if (!['tel', 'santral'].includes(b.saglayici)) throw new Err(400, 'Geçersiz seçim.'); a.saglayici = b.saglayici; } if (b.yenile) a.anahtar = crypto.randomBytes(18).toString('hex'); setA('cagri_ayar', a); A.audit(c.user, 'cagri_ayar', '', ip(c.req)); return [200, { saglayici: a.saglayici, anahtar: a.anahtar }]; });
  R('GET', '/api/cagri/ozet', 'cagri', 'g', async () => {
    const g = (sql, ...a) => (db.prepare(sql).get(...a) || {}).n || 0, bugun = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10), B = db.prepare('SELECT izin FROM bagiscilar WHERE izin IS NOT NULL').all();
    return [200, { sonuclar: CSON, saglayici: cAyar().saglayici, bugunGiden: g("SELECT COUNT(*) n FROM cagri WHERE yon='giden' AND date(zaman)=?", bugun), bugunGelen: g("SELECT COUNT(*) n FROM cagri WHERE yon='gelen' AND date(zaman)=?", bugun), bugunUlasilan: g("SELECT COUNT(*) n FROM cagri WHERE date(zaman)=? AND sonuc IN ('Görüştük','Bağış sözü verdi')", bugun), sozler: g("SELECT COUNT(*) n FROM cagri WHERE date(zaman)=? AND sonuc='Bağış sözü verdi'", bugun), cevapsiz: g("SELECT COUNT(*) n FROM cagri WHERE yon='gelen' AND sonuc='Cevapsız' AND date(zaman)=?", bugun), aranmaz: B.filter(x => { try { return JSON.parse(x.izin).ara === 'ret'; } catch (e) { return false; } }).length, toplam: g('SELECT COUNT(*) n FROM cagri') }];
  });
  R('GET', '/api/cagri/aranacak', 'cagri', 'g', async (c) => {
    const p = new URL(c.req.url, 'http://x').searchParams, q = str(p.get('q'), 60).toLowerCase(), pasif = p.get('gun') === '0' ? 0 : Math.max(1, Math.min(3650, +p.get('gun') || 90)), esik = pasif ? new Date(Date.now() - pasif * 86400000 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : '0000', son3 = new Date(Date.now() - 3 * 86400000 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10) + ' 00:00:00';
    const rows = db.prepare(`SELECT b.id, b.ad, b.tel, b.izin, MAX(g.tarih) son, COALESCE(SUM(g.tl),0) toplam, COUNT(g.id) adet, (SELECT sonuc FROM cagri x WHERE x.bagisci_id=b.id ORDER BY x.id DESC LIMIT 1) csonuc, (SELECT zaman FROM cagri x WHERE x.bagisci_id=b.id ORDER BY x.id DESC LIMIT 1) czaman FROM bagiscilar b LEFT JOIN bagislar g ON g.bagisci_id=b.id AND g.durum='Onaylı' GROUP BY b.id`).all();
    let hariç = 0; const L = [];
    rows.forEach(b => { if (digits(b.tel).length < 7) return; const iz = b.izin ? JSON.parse(b.izin) : {}; if (iz.ara === 'ret') { hariç++; return; } if (pasif && b.son && b.son >= esik) return; if (b.czaman && b.czaman >= son3) return; if (b.csonuc === 'Yanlış numara') return; if (q && !(String(b.ad).toLowerCase().includes(q) || String(b.tel).includes(q))) return; L.push({ id: b.id, ad: b.ad, tel: b.tel, son: b.son, toplam: b.toplam, adet: b.adet, csonuc: b.csonuc, czaman: b.czaman }); });
    L.sort((a, b) => (b.toplam - a.toplam)); return [200, { liste: L.slice(0, 300), adet: L.length, hariç, gun: pasif }];
  });
  R('GET', '/api/cagri/kayit', 'cagri', 'g', async (c) => { const p = new URL(c.req.url, 'http://x').searchParams, bid = +p.get('bagisci') || 0; return [200, db.prepare('SELECT * FROM cagri' + (bid ? ' WHERE bagisci_id=?' : '') + ' ORDER BY id DESC LIMIT 200').all(...(bid ? [bid] : []))]; });
  R('POST', '/api/cagri', 'cagri', 'e', async (c) => {
    const b = c.body || {}, sonuc = str(b.sonuc, 40); if (!CSON.includes(sonuc)) throw new Err(400, 'Görüşme sonucunu seçin.');
    let bg = b.bagisci_id ? db.prepare('SELECT id,ad,tel FROM bagiscilar WHERE id=?').get(+b.bagisci_id) : null; if (!bg) throw new Err(400, 'Bağışçı bulunamadı.');
    db.prepare("INSERT INTO cagri(bagisci_id,tel,ad,yon,sonuc,notu,kullanici) VALUES(?,?,?,?,?,?,?)").run(bg.id, bg.tel, bg.ad, 'giden', sonuc, str(b.notu, 500) || null, c.user.kadi);
    if (sonuc === 'Aranmak istemiyor') { const row = db.prepare('SELECT izin FROM bagiscilar WHERE id=?').get(bg.id), cur = row.izin ? JSON.parse(row.izin) : {}; cur.ara = 'ret'; db.prepare('UPDATE bagiscilar SET izin=? WHERE id=?').run(JSON.stringify(cur), bg.id); }
    return [200, { ok: 1 }];
  });
  // Santral (3CX, Asterisk, Yeastar, Netgsm santral vb.) arama bitince bu adrese HTTP isteği gönderir
  R('POST', '/api/cagri/webhook', null, null, async (c) => {
    const a = cAyar(), p = new URL(c.req.url, 'http://x').searchParams, anahtar = p.get('anahtar') || c.req.headers['x-webhook-key'] || '';
    if (!anahtar || anahtar.length !== a.anahtar.length || !crypto.timingSafeEqual(Buffer.from(anahtar), Buffer.from(a.anahtar))) throw new Err(403, 'Anahtar geçersiz.');
    const b = c.body || {}, numara = str(b.numara || b.tel || b.caller || b.from || '', 40), yon = /^(giden|out|outbound)/i.test(String(b.yon || b.direction || '')) ? 'giden' : 'gelen', durum = String(b.durum || b.status || '').toLowerCase();
    const sonuc = /(cevapsiz|cevapsız|missed|no.?answer|noanswer|busy|failed)/.test(durum) ? (yon === 'gelen' ? 'Cevapsız' : 'Ulaşılamadı / açmadı') : 'Görüştük', bg = bulBagisci(numara);
    db.prepare("INSERT INTO cagri(bagisci_id,tel,ad,yon,sonuc,sure,dahili,kullanici,kaynak,kayit_url) VALUES(?,?,?,?,?,?,?,?,?,?)").run(bg ? bg.id : null, numara, bg ? bg.ad : null, yon, sonuc, Math.max(0, Math.min(86400, +b.sure || +b.duration || 0)), str(b.dahili || b.extension || '', 20) || null, null, 'santral', /^https:\/\//.test(String(b.kayit_url || '')) ? str(b.kayit_url, 300) : null);
    return [200, { ok: 1, eslesti: !!bg }];
  });
};
