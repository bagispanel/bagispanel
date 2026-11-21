// Bağışçıya giden video izleme sayfası: kurum logosu + video. Bağlantı tahmin edilemez; giriş gerekmez.
(async()=>{const t=new URLSearchParams(location.search).get('t')||'',R=document.getElementById('r'),e=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let j;try{const r=await fetch('/api/izle/'+encodeURIComponent(t));if(!r.ok)throw 0;j=await r.json()}catch(x){R.innerHTML='<div class="c"><h1>Bağlantı geçersiz</h1><p class="mu">Bu video bağlantısı bulunamadı. Lütfen derneğimizle iletişime geçin.</p></div>';return}
 if(/^#[0-9a-f]{6}$/i.test(j.renk))document.documentElement.style.setProperty('--co',j.renk);document.title=(j.dernek||'Video')+' — Videonuz';
 const bas=(j.logo||j.dernek)?`<div class="kh">${j.logo&&/^data:image\/(png|jpeg|webp);base64,/.test(j.logo)?`<span class="kc"><img src="${j.logo}" alt=""></span>`:''}<b>${e(j.dernek)}</b></div>`:'';
 const alt=[j.tur,j.ulke,j.kuyu].filter(Boolean).map(e).join(' · ');
 R.innerHTML=bas+`<div class="c"><h1>Sayın ${e(j.ad)}</h1><p class="mu">${alt?alt+' · ':''}Bağışınızla ilgili video aşağıdadır. Allah kabul etsin.</p><video controls playsinline preload="metadata" src="${e(j.src)}"></video><a class="dl" href="${e(j.src)}" download>Videoyu indir</a></div>`})();
