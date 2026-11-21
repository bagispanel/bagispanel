// Bildirimler: yeni WhatsApp, gelen arama, mesaj ve görevler her sayfada görünür (sunucu yetkiye göre süzer).
const BNL={twa:['WhatsApp: okunmamış mesaj','twa'],cagri:['Bugün cevapsız gelen arama','cagri'],mesaj:['Okunmamış iç mesaj','mesaj'],gorevvade:['Zamanı gelen / geciken görev ve hatırlatma','gorev'],gorev:['Size atanmış açık görev','gorev'],bekleyen:['Onay bekleyen bağış','bekleyen'],bhar:['Eşleştirme bekleyen banka hareketi','bhar']};
let BN={son:null,t:null,acik:false};
const bnN=k=>((ST.bn&&ST.bn.sayac)||{})[k]||0;
const bnBadge=k=>bnN(k)>0?`<span class="bd" style="margin-left:auto" data-bk="${k}">${bnN(k)}</span>`:'';
function bnToplam(){const s=(ST.bn&&ST.bn.sayac)||{};return Object.keys(BNL).reduce((a,k)=>a+(s[k]||0),0)}
function bnKur(){let b=document.getElementById('bnb');if(!ME){if(b)b.remove();const p=document.getElementById('bnp');if(p)p.remove();document.title='bağışpanel';return}
 if(!b){b=document.createElement('button');b.id='bnb';b.className='bnb';b.setAttribute('data-a','bnac');b.setAttribute('aria-label','Bildirimler');document.body.appendChild(b)}
 const t=bnToplam();b.innerHTML=IC('bell',20)+(t>0?`<span class="bd">${t>99?'99+':t}</span>`:'');document.title=(t>0?'('+t+') ':'')+'bağışpanel';
 let p=document.getElementById('bnp');if(BN.acik){if(!p){p=document.createElement('div');p.id='bnp';p.className='bnp card';document.body.appendChild(p)}
  const L=Object.keys(BNL).filter(k=>bnN(k)>0);p.innerHTML=`<b>Bildirimler</b>`+(L.length?L.map(k=>`<button class="gar" data-a="bgit" data-v="${BNL[k][1]}"><span>${esc(BNL[k][0])}</span><span class="bd">${bnN(k)}</span></button>`).join(''):'<p class="note" style="margin:8px 0 0">Bekleyen bildirim yok.</p>')}else if(p)p.remove();
 document.querySelectorAll('.nav button[data-v]').forEach(x=>{const k=x.dataset.v;if(!(k in BNL))return;let s=x.querySelector('.bd');const n=bnN(k);if(n>0){if(!s){s=document.createElement('span');s.className='bd';s.style.marginLeft='auto';x.appendChild(s)}s.textContent=n}else if(s)s.remove()})}
function bnPop(o){let c=document.getElementById('bnt');if(!c){c=document.createElement('div');c.id='bnt';c.setAttribute('aria-live','polite');document.body.appendChild(c)}
 const e=document.createElement('button');e.className='bnt';while(c.children.length>=3)c.firstChild.remove();e.setAttribute('data-a','bgit');e.dataset.v=o.git;e.innerHTML=`<b>${esc(o.baslik)}</b>${o.ozet?`<span>${esc(o.ozet)}</span>`:''}`;c.appendChild(e);setTimeout(()=>e.remove(),9000)}
async function bnCek(){if(!ME||document.hidden)return;let j;try{j=await api('GET','/api/bildirim')}catch(e){return}if(!ME)return;
 const eski=BN.son;BN.son={};Object.entries(j.son||{}).forEach(([t,o])=>{BN.son[t]=o.id;if(eski&&o.id>(eski[t]||0)&&route!=o.git)bnPop(o)});
 ST.bn=j;bnKur()}
function bnBasla(){if(BN.t)return;BN.t=setInterval(bnCek,20000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)bnCek()})}
ACTS.bnac=()=>{BN.acik=!BN.acik;bnKur()};
ACTS.bgit=(v,el)=>{BN.acik=false;if(el&&el.classList.contains('bnt'))el.remove();bnKur();go(v)};
