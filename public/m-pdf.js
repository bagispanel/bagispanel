'use strict';
/* PDF tasarımları: bayraklı, saha videosuna uygun büyük yazılı; metin otomatik sığdırılır (taşma olmaz). */
const fk=s=>String(s||'').toLocaleLowerCase('tr-TR').replace(/ı/g,'i').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const star=(cx,cy,r,rot)=>{const p=[];for(let i=0;i<10;i++){const a=(rot+i*36)*Math.PI/180,rr=i%2?r*.382:r;p.push((cx+rr*Math.cos(a)).toFixed(1)+','+(cy+rr*Math.sin(a)).toFixed(1))}return `<polygon points="${p.join(' ')}"/>`};
const V3=(a,b,c)=>`<rect width="30" height="60" fill="${a}"/><rect x="30" width="30" height="60" fill="${b}"/><rect x="60" width="30" height="60" fill="${c}"/>`,H3=(a,b,c)=>`<rect width="90" height="20" fill="${a}"/><rect y="20" width="90" height="20" fill="${b}"/><rect y="40" width="90" height="20" fill="${c}"/>`;
const FLAGS={turkiye:'<rect width="90" height="60" fill="#e30a17"/><circle cx="30" cy="30" r="15" fill="#fff"/><circle cx="37.5" cy="30" r="12" fill="#e30a17"/><g fill="#fff">'+star(48.75,30,7.5,0)+'</g>',
cad:V3('#002664','#fecb00','#c60c30'),nijer:H3('#e05206','#fff','#0db02b')+'<circle cx="45" cy="30" r="8" fill="#e05206"/>',mali:V3('#14b53a','#fcd116','#ce1126'),
somali:'<rect width="90" height="60" fill="#4189dd"/><g fill="#fff">'+star(45,30,18,-90)+'</g>',
'burkina faso':'<rect width="90" height="30" fill="#ef2b2d"/><rect y="30" width="90" height="30" fill="#009e49"/><g fill="#fcd116">'+star(45,30,14,-90)+'</g>',
afganistan:V3('#000','#d32011','#007a36')+'<circle cx="45" cy="30" r="8" fill="#fff"/>',
pakistan:'<rect width="90" height="60" fill="#01411c"/><rect width="22.5" height="60" fill="#fff"/><circle cx="56" cy="30" r="15" fill="#fff"/><circle cx="62" cy="26" r="13" fill="#01411c"/><g fill="#fff">'+star(66,23,6,-72)+'</g>',
banglades:'<rect width="90" height="60" fill="#006a4e"/><circle cx="40" cy="30" r="18" fill="#f42a41"/>',
filistin:H3('#000','#fff','#007a3d')+'<polygon points="0,0 30,30 0,60" fill="#ce1126"/>',yemen:H3('#ce1126','#fff','#000'),
sudan:H3('#d21034','#fff','#000')+'<polygon points="0,0 30,30 0,60" fill="#007229"/>',
suriye:H3('#007a3d','#fff','#000')+'<g fill="#ce1126">'+star(30,30,5,-90)+star(45,30,5,-90)+star(60,30,5,-90)+'</g>',
etiyopya:H3('#078930','#fcdd09','#da121a')+'<circle cx="45" cy="30" r="9" fill="#0f47af"/><g fill="#fcdd09">'+star(45,30,6.5,-90)+'</g>',
gana:H3('#ce1126','#fcd116','#006b3f')+'<g fill="#000">'+star(45,30,8,-90)+'</g>',senegal:V3('#00853f','#fdef42','#e31b23')+'<g fill="#00853f">'+star(45,30,8,-90)+'</g>',nijerya:V3('#008751','#fff','#008751')};
let UF={};const flag=(ad,h)=>{const u=UF[fk(ad)];if(u)return `<img src="${u}" alt="" style="height:${h}mm;width:${h*1.5}mm;object-fit:cover;border:.3mm solid #0004;flex:none">`;const b=FLAGS[fk(ad)];return b?`<svg viewBox="0 0 90 60" style="height:${h}mm;width:${h*1.5}mm;border:.3mm solid #0004;flex:none"><g>${b}</g></svg>`:''};
const pEsc=esc,pToday=()=>new Date().toLocaleDateString('tr-TR');
const fit=(txt,max,min,st,ex)=>`<div class="fit" data-max="${max}" data-min="${min}" style="${st||''}"><span style="${ex||''}">${pEsc(txt)}</span></div>`;
const hd=(dn,ulke,sub,h,title)=>{h=h||11;const fh=h*1.35,lg=(typeof KRM!='undefined'&&KRM&&KRM.logo)||'',lh=h*1.9,tl=title?fit(title,h*1.15*3.78*.82,10,'height:'+h*1.15+'mm;justify-content:center;text-align:center;letter-spacing:.04em;margin-top:1.5mm','text-align:center'):'';
 return `<div class="hd h3"><div class="hc l">${flag('Türkiye',fh)}<small>TÜRKİYE</small></div><div class="hc m">${lg?`<img src="${lg}" alt="" style="height:${lh}mm;max-width:${lh*2.2}mm;object-fit:contain">`:''}<b style="font-size:${lg?h*.42:h*.62}mm">${pEsc(dn)}</b></div><div class="hc r">${ulke?`${flag(ulke,fh)}<small>${pEsc(String(ulke).toLocaleUpperCase('tr-TR'))}</small>`:''}</div></div>${tl}${sub?`<div class="hsub">${pEsc(sub)}</div>`:''}`};
const sheet=(cls,inner,st)=>`<div class="sheet ${cls}" style="${st||''}">${inner}</div>`;
const tU=u=>String(u.tur||'').toLocaleUpperCase('tr-TR'),sub=u=>[u.kod&&((u.cap>1?'Grup No: ':'Kurban No: ')+u.kod),pToday()].filter(Boolean).join(' · ');

/* ---- Hisseli büyükbaş (7 isim) ---- */
function rowsHisse(u,max,min,gap){return `<div class="rows" style="gap:${gap||1.5}mm">`+u.paylar.map((s,i)=>`<div class="row"><div class="no">${i+1}</div>${fit(s.ad,max,min,'flex:1;height:100%')}</div>`).join('')+`</div>`}
const DZ={
hisse:{tek:(U,dn)=>U.map(u=>sheet('P',hd(dn,u.ulke,sub(u),14,tU(u))+rowsHisse(u,50,16,2))).join(''),
 iki:(U,dn)=>{let o='';for(let i=0;i<U.length;i+=2)o+=sheet('P',[U[i],U[i+1]].filter(Boolean).map(u=>`<div class="half">${hd(dn,u.ulke,sub(u),7,tU(u))}${rowsHisse(u,32,12,1)}</div>`).join(''));return o},
 yatay:(U,dn)=>U.map(u=>sheet('L',hd(dn,u.ulke,sub(u),11,tU(u))+rowsHisse(u,46,16,1.5)))},
kucuk:{tek:(U,dn)=>U.map(u=>{const s=u.paylar[0]||{};return sheet('L',hd(dn,u.ulke,sub(u),12,tU(u))+`<div style="flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0">${fit(s.ad,150,28,'height:110mm;justify-content:center;text-align:center','text-align:center')}<div class="meta" style="text-align:center;font-size:8mm">${pEsc(u.hayvan||'')}</div></div>`)}).join(''),
 dort:(U,dn)=>{let o='';for(let i=0;i<U.length;i+=4)o+=sheet('L',`<div class="grid4">`+U.slice(i,i+4).map(u=>{const s=u.paylar[0]||{};return `<div class="cell">${hd(dn,u.ulke,sub(u),8)}${fit(s.ad,64,18,'flex:1;justify-content:center;text-align:center','text-align:center')}<div class="meta" style="text-align:center">${pEsc(u.hayvan||'')}</div></div>`}).join('')+`</div>`,'padding:6mm');return o},
 liste:(U,dn)=>{let o='';for(let i=0;i<U.length;i+=10){const g=U.slice(i,i+10);o+=sheet('P',hd(dn,g[0].ulke,pToday(),11,'KÜÇÜKBAŞ KURBANLAR')+`<div class="rows" style="gap:1mm">`+g.map((u,k)=>{const s=u.paylar[0]||{};return `<div class="row"><div class="no">${i+k+1}</div>${fit(s.ad,36,14,'flex:1;height:100%')}<div class="sn">${pEsc([u.kod,u.hayvan].filter(Boolean).join(' · '))}</div></div>`}).join('')+`</div>`)}return o}},
diger:new Proxy({},{get:(_,k)=>(L,dn)=>dgPages(L,dn,+k)})};
const dgLay=per=>{let b=null;for(const [o,W,H] of [['P',192,238],['L',279,158]])for(let c=1;c<=6;c++){const r=Math.ceil(per/c),cw=W/c-3,ch=H/r,f=Math.min(ch*.72,(cw-4)/(22*.52));if(!b||f>b.f+.05)b={c,o,r,ch,f}}return b};
function dgPages(L,dn,per){const Y=dgLay(per),cols=Y.c,ori=Y.o,rows=Y.r,no=false,fs=[Math.min(Y.ch*.5,7),Math.min(Y.ch*.3,4),Math.min(Y.ch*3.78*.8,120)];let o='';L.forEach(x=>{const u0=x.liste[0]||{},n=x.liste.length,pg=Math.max(1,Math.ceil(n/per));for(let p=0;p<pg;p++){const ch=x.liste.slice(p*per,p*per+per);
 const head=hd(dn,u0.ulke,`${x.no} · ${u0.kat||''} · ${n} isim · sayfa ${p+1}/${pg} · ${pToday()}`,ori=='L'?8:10,tU(u0));
 const body=`<div class="lg" style="grid-template-columns:repeat(${cols},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr))">`+ch.map((u,i)=>{const s=u.paylar[0]||{};return `<div class="lc"><div class="li">${fit(s.ad,fs[2],4,'flex:1;height:100%')}${no?`<small style="font-size:${fs[1]}mm">${pEsc(s.no)}</small>`:''}</div></div>`}).join('')+`</div>`;
 o+=sheet(ori,head+body)}});return o}
/* ---- örnek veri (taşma/sığma denemesi için uzun isimler dahil) ---- */
const LONG=['Muhammed Abdurrahman Hamza Bin Abdullah Yılmaz Çelebioğlu','Ayşe Yılmaz','Mehmet Ali Kaya','Fatma Zehra Demir','Ali','Zeynep Nur Şahin Arslanoğlu','Hasan Hüseyin Aydın'];
function ornek(kind,S,dz){const mk=(i,ad)=>({no:'KS-2027-'+String(1000+i).padStart(4,'0'),ad,bno:'BG-2027-0'+(1200+i)});
 if(kind=='hisse')return[0,1].map(g=>({kod:'K27-B-000'+(g+1),tur:'Vacip · hisseli büyükbaş',cap:7,ulke:g?'Mali':'Çad',partner:'Demo Yardım Derneği',paylar:LONG.map((a,i)=>mk(i+g*7,a))}));
 if(kind=='kucuk')return LONG.concat(LONG).slice(0,10).map((a,i)=>({kod:'K27-K-00'+(10+i),tur:'Adak · küçükbaş',cap:1,hayvan:i%2?'Koç':'Koyun',ulke:'Nijer',partner:'Demo Yardım Derneği',paylar:[mk(i,a)]}));
 if(kind=='diger')return[{no:'VL-2027-0001',dernek:'',liste:Array.from({length:+dz||40},(_,i)=>({kod:'VB-2027-'+(i+1),tur:'Kuranı Kerim',kat:'Eğitim',ulke:'Bangladeş',partner:'Demo Yardım Derneği',paylar:[mk(i,LONG[i%7])]}))}];
 return LONG.slice(0,2).concat(['Anne Fatma Kuyusu']).map((a,i)=>({kod:'KY-2027-000'+(i+1),kno:String(21+i),ad:a,ni:'Tulumba',ulke:['Nijer','Çad','Bangladeş'][i],ks:'Genel',dt:{3:'2027-06-01'},paylar:[mk(i,a)]}))}
const KIND={hisse:'Hisseli büyükbaş (7’li grup)',kucuk:'Küçükbaş',diger:'Videolu bağış listesi'};
const DNAME={hisse:{tek:'1 grup / sayfa (dikey)',iki:'2 grup / sayfa (dikey)',yatay:'1 grup / sayfa (yatay)'},kucuk:{tek:'1 isim / sayfa (yatay, dev yazı)',dort:'4 isim / sayfa (yatay, 2×2)',liste:'10 isim / sayfa (dikey liste)'},diger:{'20':'20 isim / sayfa (dikey, 1 sütun)','40':'40 isim / sayfa (dikey, 2 sütun)','60':'60 isim / sayfa (yatay, 3 sütun)','80':'80 isim / sayfa (yatay, 4 sütun)','100':'100 isim / sayfa (yatay, 5 sütun)'}};
const DDESC={hisse:{tek:'İsimler en büyük; saha videosu için en okunaklısı.',iki:'Kâğıt tasarrufu; isimler orta boy.',yatay:'Yatay çekilen videoda tam kadraj.'},kucuk:{tek:'Her hayvan tek tek çekilecekse; yazı dev.',dort:'Okunaklı ve kâğıt dostu (önerilen).',liste:'Kontrol ve arşiv için; videoda küçük kalabilir.'},diger:{'20':'Videoda en okunaklısı; isimler çok büyük.','40':'Okunaklı ve dengeli (önerilen).','60':'Yatay sayfa; orta boy isimler.','80':'Yatay sayfa; isimler küçülür, sahip no yazılmaz.','100':'Yatay sayfa; en kompakt, daha çok kontrol/arşiv içindir.'}};

/* ---- görünüm ---- */
async function pdfOpen(job){try{const ul=await api('GET','/api/ulkeler');UF={};ul.forEach(u=>{if(u.bayrak)UF[fk(u.ad)]=u.bayrak})}catch(e){}if(!ST.pdfs||!ST.pdfsec){const r=await api('GET','/api/pdf');ST.pdfs=r.ayar;ST.pdfsec=r.secenek}ST.pdfp=job;draw();document.querySelector('.main').scrollTop=0}
const pdfKind=j=>j.t=='ornek'?j.kind:j.t=='diger'?'diger':(j.m=='k'?'kucuk':'hisse');
function pdfView(){const j=ST.pdfp,S=ST.pdfs,kind=pdfKind(j),dz=(j.design||{})[kind]||S.tasarim[kind];let body='',dn=(j.r&&j.r.dernek)||(j.L&&j.L[0]&&j.L[0].dernek)||'[Dernek adı]';
 if(j.t=='ornek'){dn=(typeof KRM!='undefined'&&KRM.ad)||'[Dernek adı]';const d=ornek(j.kind,S,dz);body=j.kind=='diger'?DZ.diger[dz](d,dn):DZ[j.kind][dz](d,dn)}
 else if(j.t=='diger')body=DZ.diger[dz](j.L.map(x=>({...x,dernek:x.dernek})),dn);
 else{const U=j.m=='k'?j.r.liste.filter(u=>u.cap==1):j.r.liste.filter(u=>u.cap>1&&u.paylar.length==u.cap);body=U.length?DZ[kind][dz](U,dn):'<div class="card">Bu türde yazdırılacak kayıt yok.</div>'}
 const land=(kind=='hisse'&&dz=='yatay')||(kind=='kucuk'&&(dz=='tek'||dz=='dort'))||(kind=='diger'&&dgLay(+dz).o=='L'),sizes=`@page{size:${land?'297mm 210mm':'210mm 297mm'};margin:0}`;
 const alt=(kind=='diger'&&!DNAME.diger[dz]?[...Object.keys(DNAME.diger),dz]:Object.keys(DNAME[kind])).map(k=>`<button class="btn${k==dz?'':' l'}" data-a="pdfd" data-v="${k}">${DNAME[kind][k]||k+' isim / sayfa'}</button>`).join(' ');
 const tg=j.t=='kurban'?`<button class="btn${j.m=='b'?'':' l'}" data-a="pdfm" data-v="b">Hisseli büyükbaş</button> <button class="btn${j.m=='k'?'':' l'}" data-a="pdfm" data-v="k">Küçükbaş</button> `:'';
 return `<style>${sizes}</style><div class="noprint">${ttl(j.t=='ornek'?'Örnek: '+KIND[kind]:'PDF: '+KIND[kind],'Yazdırma penceresinde hedefi “PDF olarak kaydet”, “Kenar boşlukları: Yok” ve “Arka plan grafikleri: açık” seçin. İsimler kutuya otomatik sığdırılır, taşmaz.')}<p>${tg}<button class="btn" data-a="kpr">Yazdır / PDF olarak kaydet</button> <button class="btn l" data-a="pdfback">Geri dön</button></p><p class="note" style="margin:0 0 6px">Tasarım (yalnızca bu baskı için; kalıcı seçim PDF ayarlarında):</p><p>${alt}</p></div><div class="sheets">${body}</div>`}
ACTS.pdfd=v=>{const j=ST.pdfp;j.design=j.design||{};j.design[pdfKind(j)]=v;draw()};ACTS.pdfm=v=>{ST.pdfp.m=v;draw()};ACTS.pdfback=()=>{ST.pdfp=null;draw()};
function fitAll(){document.querySelectorAll('.sheet .fit').forEach(b=>{const sp=b.firstElementChild;let sz=+b.dataset.max;const mn=+b.dataset.min;b.style.fontSize=sz+'px';let g=0;while(g++<200&&sz>mn&&(sp.offsetHeight>b.clientHeight+1||sp.scrollWidth>b.clientWidth+1)){sz=Math.max(mn,sz-Math.max(1,Math.round(sz*.06)));b.style.fontSize=sz+'px'}})}
AFT.push(()=>{if(ST.pdfp)fitAll()});
