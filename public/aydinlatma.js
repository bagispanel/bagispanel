// Herkese açık aydınlatma metni (KVKK). Metin Kurum Yönetimi → KVKK ve Veri Talepleri'nden düzenlenir.
(async()=>{const R=document.getElementById('r'),e=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let j;try{const r=await fetch('/api/kvkk/aydinlatma');if(!r.ok)throw 0;j=await r.json()}catch(x){R.innerHTML='<div class="c"><p>Metin şu an gösterilemiyor.</p></div>';return}
 if(/^#[0-9a-f]{6}$/i.test(j.renk))document.documentElement.style.setProperty('--co',j.renk);document.title='Aydınlatma Metni'+(j.kurum?' — '+j.kurum:'');
 const bas=(j.logo||j.kurum)?`<div class="kh">${j.logo&&/^data:image\/(png|jpeg|webp);base64,/.test(j.logo)?`<span class="kc"><img src="${j.logo}" alt=""></span>`:''}<b>${e(j.kurum)}</b></div>`:'';
 const sat=String(j.metin||'').split('\n').map(s=>s.trim()),out=[];let first=true;for(const s of sat){if(!s)continue;if(first){out.push(`<h1>${e(s)}</h1>`);first=false}else if(/^\d+\.\s/.test(s)&&s.length<60)out.push(`<h2>${e(s)}</h2>`);else out.push(`<p>${e(s)}</p>`)}
 R.innerHTML=bas+`<div class="c">${out.join('')}<p class="mu" style="margin-top:20px">${j.tarih?'Son güncelleme: '+e(String(j.tarih).split('-').reverse().join('.'))+' · ':''}Sürüm ${e(j.surum||1)}</p></div>`})();
