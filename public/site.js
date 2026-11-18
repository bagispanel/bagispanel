'use strict';
/* Herkese açık site: hızlı bağış formu davranışı (satır içi betik yok, CSP uyumlu). */
(function () {
  var f = document.querySelector('form[data-bf]'); if (!f) return;
  var $ = function (s) { return f.querySelector(s); }, tur = f.elements.tur_id, tl = function (n) { return Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 0 }); };
  function opt() { return tur.options[tur.selectedIndex]; }
  function guncelle() {
    var o = opt(), fiyat = +o.dataset.fiyat || 0, fon = o.dataset.fon === '1', sabit = fiyat > 0 && !fon;
    $('[data-g=adet]').hidden = !sabit; $('[data-g=tutar]').hidden = sabit;
    var v = $('[data-g=vekalet]'); if (v) v.hidden = o.dataset.org !== 'Kurban';
    if (sabit) { var n = Math.max(1, Math.min(100, +f.elements.adet.value || 1)); $('[data-top]').textContent = 'Toplam: ' + tl(n * fiyat) + ' ₺'; }
  }
  tur.addEventListener('change', guncelle); f.elements.adet && f.elements.adet.addEventListener('input', guncelle);
  f.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-t]'); if (!b) return;
    f.elements.tutar.value = b.dataset.t; f.querySelectorAll('button[data-t]').forEach(function (x) { x.classList.toggle('on', x === b); });
  });
  f.elements.tutar && f.elements.tutar.addEventListener('input', function () { f.querySelectorAll('button[data-t]').forEach(function (x) { x.classList.toggle('on', x.dataset.t === f.elements.tutar.value); }); });
  f.addEventListener('change', function (e) { if (e.target.name === 'periyot') f.querySelectorAll('.sg label').forEach(function (l) { l.classList.toggle('on', l.querySelector('input').checked); }); });
  document.addEventListener('click', function (e) {
    var k = e.target.closest('a[data-kat]'); if (!k) return;
    for (var i = 0; i < tur.options.length; i++) { if (tur.options[i].parentNode.label === k.dataset.kat) { tur.selectedIndex = i; guncelle(); break; } }
  });
  function el(t, txt, st) { var x = document.createElement(t); if (txt != null) x.textContent = txt; if (st) x.style.cssText = st; return x; }
  f.addEventListener('submit', function (e) {
    e.preventDefault(); var er = $('[data-er]'), btn = f.querySelector('button.bt:not([type=button])'); er.textContent = '';
    var o = opt(), body = { tur_id: +tur.value, ad: f.elements.ad.value, tel: f.elements.tel.value, eposta: f.elements.eposta.value, adet: +(f.elements.adet.value || 1), tutar: +(f.elements.tutar.value || 0), web2: f.elements.web2.value, kvkk: f.elements.kvkk.checked };
    var p = f.querySelector('input[name=periyot]:checked'); if (p) body.periyot = p.value; if (f.elements.vekalet) body.vekalet = f.elements.vekalet.checked && o.dataset.org === 'Kurban'; if (f.elements.banka_id) body.banka_id = +f.elements.banka_id.value;
    btn.disabled = true;
    fetch('/api/site/bagis', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-BP': '1' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        btn.disabled = false; if (!r.ok) { er.textContent = r.j.hata || r.j.error || r.j.mesaj || 'Bağış kaydedilemedi, lütfen tekrar deneyin.'; return; }
        var s = $('[data-sonuc]'); s.hidden = false; s.textContent = ''; s.className = 'ok'; s.style.marginTop = '14px';
        s.appendChild(el('b', 'Teşekkür ederiz! Bağışınız kaydedildi.')); s.appendChild(el('p', 'Bağış no: ' + r.j.no + ' · ' + r.j.tur + ' · ' + tl(r.j.tutar) + ' ₺' + (r.j.aylik ? ' (her ay)' : ''), 'margin:6px 0'));
        s.appendChild(el('p', 'Ödemeyi aşağıdaki hesaba yapın, açıklamaya bağış numaranızı yazın:', 'margin:6px 0'));
        (r.j.hesaplar || []).forEach(function (h) { var d = el('div', null, 'margin:6px 0;word-break:break-all'); d.appendChild(el('b', h.banka + ' · ' + h.hesap + ' (' + h.para + ')')); d.appendChild(document.createElement('br')); d.appendChild(document.createTextNode(h.iban)); s.appendChild(d); });
        f.querySelectorAll('input[name=ad],input[name=tel],input[name=eposta]').forEach(function (i) { i.value = ''; }); f.elements.kvkk.checked = false; s.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }).catch(function () { btn.disabled = false; er.textContent = 'Bağlantı hatası, lütfen tekrar deneyin.'; });
  });
  guncelle();
})();
