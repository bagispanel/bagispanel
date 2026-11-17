// Bağımlılıksız minimal .xlsx okuma/yazma (ZIP: sıkıştırmasız yazar, deflate okur). Yalnızca düz tablo: metin, sayı, başlık biçimi.
const zlib = require('node:zlib');
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
const col = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };

function zipStore(files) { // files: [{name, data(Buffer)}]
  const parts = [], cen = []; let off = 0;
  for (const f of files) {
    const nm = Buffer.from(f.name), d = f.data, crc = crc32(d), h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(nm.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, nm, d);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    cen.push(c, nm); off += 30 + nm.length + d.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
function zipRead(buf) { // → Map(name → Buffer)
  let e = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Geçerli bir Excel (.xlsx) dosyası değil.');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = new Map(); let toplam = 0;
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Excel dosyası bozuk.');
    const yont = buf.readUInt16LE(p + 10), csz = buf.readUInt32LE(p + 20), usz = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString('utf8'); p += 46 + nl + el + cl;
    if (!/^xl\/(workbook\.xml|sharedStrings\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    if (usz > 30e6) throw new Error('Excel dosyası çok büyük.');
    const ds = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), raw = buf.slice(ds, ds + csz);
    const d = yont === 0 ? raw : yont === 8 ? zlib.inflateRawSync(raw, { maxOutputLength: 40e6 }) : null; if (!d) throw new Error('Desteklenmeyen Excel sıkıştırması.');
    toplam += d.length; if (toplam > 60e6) throw new Error('Excel dosyası çok büyük.'); out.set(name, d);
  }
  return out;
}
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
const textOf = (x) => { let t = ''; const re = /<t[^>]*>([\s\S]*?)<\/t>|<t\/>/g; let m; while ((m = re.exec(x))) t += unesc(m[1] || ''); return t; };

// sheets: [{ad, satirlar:[[...]], genislik:[..], ilkSatirBaslik:true, metinSutun:[idx...]}] → Buffer
function yaz(sheets) {
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const files = [
    { name: '[Content_Types].xml', data: X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
    { name: '_rels/.rels', data: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => `<sheet name="${esc(String(s.ad).slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: X + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E6377"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
  ].map(f => ({ name: f.name, data: Buffer.from(f.data) }));
  sheets.forEach((s, si) => {
    const rows = s.satirlar || [], met = new Set(s.metinSutun || []), baslik = s.ilkSatirBaslik !== false;
    let x = X + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + (baslik ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '') + (s.genislik ? '<cols>' + s.genislik.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '') + '<sheetData>';
    rows.forEach((r, ri) => {
      x += `<row r="${ri + 1}">`;
      r.forEach((v, ci) => {
        if (v == null || v === '') return; const ref = col(ci) + (ri + 1);
        if (baslik && ri === 0) x += `<c r="${ref}" s="1" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
        else if (typeof v === 'number' && !met.has(ci)) x += `<c r="${ref}" s="${s.paraSutun && s.paraSutun.includes(ci) ? 3 : 0}"><v>${v}</v></c>`;
        else x += `<c r="${ref}" s="${met.has(ci) ? 2 : 0}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      });
      x += '</row>';
    });
    x += '</sheetData></worksheet>'; files.push({ name: `xl/worksheets/sheet${si + 1}.xml`, data: Buffer.from(x) });
  });
  return zipStore(files);
}

// → { ad, satirlar:[[metin...]] } (ilk sayfa). Tarih seri sayıları ham sayı olarak gelir.
function oku(buf) {
  const z = zipRead(buf), wb = z.get('xl/workbook.xml'); if (!wb) throw new Error('Geçerli bir Excel (.xlsx) dosyası değil.');
  const rels = (z.get('xl/_rels/workbook.xml.rels') || Buffer.alloc(0)).toString('utf8'), wbx = wb.toString('utf8');
  const sh = /<sheet\b[^>]*>/.exec(wbx); if (!sh) throw new Error('Excel dosyasında sayfa yok.');
  const ad = unesc((/name="([^"]*)"/.exec(sh[0]) || [])[1] || ''), rid = (/r:id="([^"]*)"/.exec(sh[0]) || [])[1];
  let hedef = null; const rr = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`).exec(rels); if (rr) { const t = (/Target="([^"]*)"/.exec(rr[0]) || [])[1]; if (t) hedef = t.startsWith('/') ? t.slice(1) : 'xl/' + t; }
  let sx = hedef && z.get(hedef); if (!sx) { const k = [...z.keys()].find(n => n.startsWith('xl/worksheets/')); sx = k && z.get(k); } if (!sx) throw new Error('Excel sayfası okunamadı.');
  const ss = []; const sst = z.get('xl/sharedStrings.xml'); if (sst) { const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\/>/g; let m; while ((m = re.exec(sst.toString('utf8')))) ss.push(textOf(m[1] || '')); }
  const s = sx.toString('utf8'), satirlar = []; const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g; let rm;
  while ((rm = rowRe.exec(s))) {
    const r = [], cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let cm;
    while ((cm = cre.exec(rm[1] || ''))) {
      const at = cm[1], body = cm[2] || '', ref = (/\br="([A-Z]+)\d+"/.exec(at) || [])[1], t = (/\bt="([^"]*)"/.exec(at) || [])[1]; if (!ref) continue;
      let ci = 0; for (const ch of ref) ci = ci * 26 + ch.charCodeAt(0) - 64; ci--; if (ci > 200) continue;
      let v = ''; if (t === 'inlineStr') v = textOf(body); else { const vm = /<v>([\s\S]*?)<\/v>/.exec(body); v = vm ? unesc(vm[1]) : ''; if (t === 's') v = ss[+v] ?? ''; }
      r[ci] = v;
    }
    for (let i = 0; i < r.length; i++) if (r[i] == null) r[i] = '';
    satirlar.push(r); if (satirlar.length > 20001) throw new Error('En fazla 20.000 satır okunabilir.');
  }
  return { ad, satirlar };
}
module.exports = { yaz, oku };
