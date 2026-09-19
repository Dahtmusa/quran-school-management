import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { createClient } from '@/lib/supabase/client';

function esc(v:any){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
const ARABIC_SCHOOL_NAME='مركز علي وميمونة لتحفيظ القرآن الكريم';

function barcodeSvg(value:string){const el=document.createElementNS('http://www.w3.org/2000/svg','svg'); JsBarcode(el,value,{format:'CODE128',displayValue:false,height:34,width:1.15,margin:0}); return new XMLSerializer().serializeToString(el);}

export async function printAcademicIdCard(input:{type:'STUDENT'|'STAFF';name:string;id:string;admissionNo?:string;photoUrl?:string|null;year?:string;section?:string;className?:string|null;jobTitle?:string;department?:string;phone?:string;expiry?:string|null;logoUrl?:string|null;}){
 const displayId=(input.type==='STUDENT'?(input.admissionNo||input.id):input.id)||input.id;
 const qr=await QRCode.toDataURL(JSON.stringify({institution:'AMQM',type:input.type,id:input.id}),{width:140,margin:1,errorCorrectionLevel:'M'});
 const barcode=barcodeSvg(input.id);

 let directorSignature='';
 let directorName='School Director';
 try{
   const {data,error}=await createClient().rpc('load_signatures_for_report_cards');
   if(!error && data?.director?.signature_data){
     directorSignature=String(data.director.signature_data);
     directorName=String(data.director.signer_name||'School Director');
   }
 }catch{}
 const directorMarkup=directorSignature
   ? `<div class="directorSign"><img class="directorSignImage" src="${esc(directorSignature)}" alt="School Director signature"><span class="directorSignLabel">${esc(directorName)}</span><small>Director</small></div>`
   : `<div class="directorSign"><div class="signLine"></div><span class="directorSignLabel">School Director</span></div>`;
 const logoUrl=esc(input.logoUrl||'');
 const logoMarkup=logoUrl?`<img class="logo" src="${logoUrl}" alt="AMQM logo" onerror="this.style.visibility='hidden'"/>`:'';

 const factsRows=(()=>{
   if(input.type==='STUDENT')return [
     ['PROGRAM YEAR',esc(input.year),false],
     ['SECTION',esc(input.section),false],
     ['CLASS',esc(input.className||'Unassigned'),true],
     ['ADMISSION NO.',esc(displayId),true],
   ];
   return [
     ['POSITION',esc(input.jobTitle||'Qur\u2019an Teacher'),true],
     ['DEPARTMENT',esc(input.department||'Academics'),false],
     ['PHONE',esc(input.phone||'\u2014'),false],
     ['STAFF ID',esc(displayId),true],
   ];
 })();

 const documentHtml=`<!doctype html><html><head><title>AMQM ${input.type==='STUDENT'?'Student':'Staff'} ID \u2014 ${esc(input.name)}</title><style>
 *{box-sizing:border-box;margin:0;padding:0}
 body{background:#dde6e2;font-family:'Segoe UI',Arial,sans-serif;color:#10251f;-webkit-font-smoothing:antialiased}
 .sheet{display:flex;flex-direction:column;align-items:center;gap:14px;padding:22px 14px}
 .card{width:340px;border-radius:13px;overflow:hidden;position:relative;background:#fff;box-shadow:0 10px 28px rgba(16,37,31,.28);page-break-after:always}
 .card:last-child{page-break-after:auto}
 .band{height:46px;display:flex;align-items:center;gap:9px;padding:0 12px;background:linear-gradient(120deg,#07523f 0%,#062d2a 70%,#07241f 100%);color:#fff;border-bottom:2px solid #c9a84c;position:relative;z-index:1}
 .logo{width:34px;height:34px;border-radius:50%;background:#fff;object-fit:contain;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.25)}
 .brand-badge{min-width:0;flex:1}.brand-badge strong{display:block;font:900 16px Georgia,'Times New Roman',serif;letter-spacing:1px;line-height:1}.brand-badge small{display:block;font-size:5.6px;line-height:1.3;margin-top:2px;letter-spacing:.7px;color:#cfe6dd;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.arabic{color:#e6bb58;font-size:8px;margin-top:1px;font-weight:600}
 .band-tag{flex-shrink:0;text-align:center;font-size:6px;font-weight:900;letter-spacing:1.4px;line-height:1.4;color:#0a3a30;background:linear-gradient(135deg,#e8c97a,#c9a84c);border-radius:8px;padding:5px 8px;text-transform:uppercase}.band-qr{flex-shrink:0;width:32px;height:32px;background:#fff;border-radius:6px;padding:2px}.band-qr img{width:100%;height:100%;display:block}
 .frontName{padding:7px 13px 3px}.topLine{display:flex;align-items:center;justify-content:space-between;gap:8px}.eyebrow{font-size:6px;font-weight:900;letter-spacing:2px;color:#9a7020;text-transform:uppercase;white-space:nowrap}.tag{display:inline-block;background:#0a3a30;color:#e8c97a;border-radius:999px;padding:2px 9px;font-size:6.5px;font-weight:900;letter-spacing:1.4px;text-transform:uppercase;white-space:nowrap}.name{font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:900;color:#07382f;text-transform:uppercase;line-height:1.15;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .frontMain{display:grid;grid-template-columns:70px 1fr 56px;gap:8px;padding:6px 12px 8px;align-items:center}.photo{width:70px;height:80px;object-fit:cover;object-position:center top;border:2px solid #c9a54e;border-radius:9px;background:#eef2ef;display:block}.info{min-width:0;display:flex;flex-direction:column}.facts{display:grid;grid-template-columns:1fr 1fr;gap:4px}.facts .fact{background:#f2f6f3;border:1px solid #e6ece8;border-radius:7px;padding:4px 6px;min-width:0}.facts .fact.wide{grid-column:1/-1}.facts span{display:block;font-size:5.5px;letter-spacing:.9px;color:#6e8179;font-weight:800;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.facts b{display:block;font-size:7.5px;font-weight:800;color:#0a3a30;margin-top:1px;line-height:1.3;overflow:hidden;word-break:break-word;text-transform:uppercase}.qrBox{display:flex;flex-direction:column;align-items:center;justify-content:center;align-self:stretch;border-left:1px solid #eef1ef;padding-left:8px}.qr{width:52px;height:52px;background:#fff;border:1px solid #d6ddd9;border-radius:7px;padding:2px}.scan{text-align:center;font-size:5px;font-weight:900;color:#61746d;letter-spacing:.4px;margin-top:4px;line-height:1.35;text-transform:uppercase}.bottomBar{height:30px;border-top:1px solid #e4e9e6;background:#fbfcfb;display:flex;align-items:center;gap:8px;padding:0 12px}.barcode{flex:1;min-width:0;height:22px;display:flex;align-items:center;overflow:hidden}.barcode svg{width:100%;height:19px}.idChip{flex-shrink:0;background:#eef4f0;border:1px solid #dfe7e2;border-radius:7px;padding:2px 9px;text-align:right}.idChip span{display:block;font-size:5px;font-weight:900;letter-spacing:1.2px;color:#6e8179;text-transform:uppercase}.idChip b{display:block;font-size:8px;font-weight:900;color:#07382f;margin-top:1px;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}
 .back{background:#fbfaf4}.backBody{padding:9px 13px 9px}.backKicker{font-size:6px;font-weight:900;letter-spacing:2.2px;color:#9a7020;text-transform:uppercase}.backBody h2{font-family:Georgia,'Times New Roman',serif;font-size:13px;font-weight:900;color:#07382f;text-transform:uppercase;margin-top:3px;line-height:1.2}.backBody p{font-size:7px;line-height:1.5;color:#3c5149;margin-top:5px}.backGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}.backGrid div{background:#f2f6f3;border:1px solid #e6ece8;border-radius:8px;padding:5px 7px;min-width:0}.backGrid span{display:block;font-size:5.5px;font-weight:900;letter-spacing:1.4px;color:#6e8179;text-transform:uppercase}.backGrid b{display:block;font-size:8.5px;font-weight:900;color:#07382f;margin-top:2px;line-height:1.25;overflow:hidden;word-break:break-word;text-transform:uppercase}
 .signRow{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;align-items:end}.sign{display:flex;flex-direction:column;justify-content:flex-end;text-align:center;color:#5a6f66;font-size:6.5px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;min-width:0}.signLine{height:1px;background:#b9c4bf;margin-bottom:6px;position:relative}.signLine:after{content:'';position:absolute;left:50%;top:-2.5px;transform:translateX(-50%);width:5px;height:5px;background:#c9a84c;border-radius:50%}.directorSign{text-align:center;color:#5a6f66;min-width:0}.directorSignImage{display:block;width:105px;height:38px;object-fit:contain;object-position:center bottom;margin:0 auto 3px}.directorSignLabel{display:block;border-top:1px solid #b9c4bf;padding-top:4px;font-size:5.8px;font-weight:900;letter-spacing:.8px;line-height:1.15;text-transform:uppercase;color:#34524a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.directorSign small{display:block;font-size:5.2px;letter-spacing:1.2px;margin-top:1px;color:#72827c;text-transform:uppercase}.terms{background:#fdf8ec;border:1px solid #ecd9a8;border-radius:8px;padding:6px 8px}.terms b{display:block;font-size:5.5px;font-weight:900;letter-spacing:1.4px;color:#8a6a1f;text-transform:uppercase}.terms p{font-size:6.5px;line-height:1.45;color:#6d5b2a;margin-top:3px}.foot{background:#062d2a;color:#93ada3;font-size:6px;font-weight:700;letter-spacing:1.4px;text-align:center;padding:6px 10px;text-transform:uppercase}
 @media print{.sheet{padding:0}.card{box-shadow:none;border:1px solid #c9a84c}.directorSignImage{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{background:#fff}}
 @media screen and (min-width:720px){.sheet{zoom:1.3}} @media print{.sheet{zoom:1!important}}
 </style></head><body><div class="sheet">
 <div class="card front">
  <div class="band">${logoMarkup}<div class="brand-badge"><strong>AMQM</strong><small>Aliyu &amp; Maimuna Center for Qur\u2019anic Memorization</small><div class="arabic">${ARABIC_SCHOOL_NAME}</div></div><div class="band-tag">${input.type==='STUDENT'?'Student<br/>ID':'Staff<br/>ID'}</div></div>
  <div class="frontName"><div class="topLine"><div class="eyebrow">Official Identification</div><div class="tag">${input.type==='STUDENT'?'Student':'Staff'}</div></div><div class="name" id="fname">${esc(input.name)}</div></div>
  <div class="frontMain">${input.photoUrl?`<img class="photo" src="${esc(input.photoUrl)}" alt=""/>`:'<div class="photo"></div>'}<div class="info"><div class="facts">${factsRows.map(f=>`<div class="fact${f[2]?' wide':''}"><span>${f[0]}</span><b>${f[1]}</b></div>`).join('')}</div></div><div class="qrBox"><img class="qr" src="${qr}" alt=""/><div class="scan">Scan to<br/>verify</div></div></div>
  <div class="bottomBar"><div class="barcode">${barcode}</div><div class="idChip"><span>ID No.</span><b>${esc(displayId)}</b></div></div>
 </div>
 <div class="card back">
  <div class="band">${logoMarkup}<div class="brand-badge"><strong>AMQM</strong><small>Aliyu &amp; Maimuna Center for Qur\u2019anic Memorization</small><div class="arabic">${ARABIC_SCHOOL_NAME}</div></div><div class="band-qr"><img src="${qr}" alt=""/></div></div>
  <div class="backBody"><div class="backKicker">AMQM · Official Academic Identification</div><h2>This card belongs to ${esc(input.name)}</h2><p>This card is the property of AMQM and must be presented on request. It is issued for student/staff identity verification, attendance scanning, school access and approved academic services within the school premises. Any misuse or unauthorised duplication will attract disciplinary action.</p>
   <div class="backGrid"><div><span>Valid until</span><b>${esc(input.expiry||'—')}</b></div><div><span>Issued to</span><b>${esc(input.name)}</b></div></div>
   <div class="signRow">${directorMarkup}<div class="terms"><b>If found</b><p>Please return this card to the school office or drop it in the collection box at the main gate. Thanks for your honesty.</p></div></div>
  </div><div class="foot">Aliyu &amp; Maimuna Center for Qur\u2019anic Memorization · QR &amp; barcode encode your unique record</div>
 </div>
 </div><script>
 function fitName(){var n=document.getElementById('fname');if(!n)return;var s=15;n.style.fontSize=s+'px';var guard=0;while(n.scrollWidth>n.clientWidth+1&&s>8&&guard<20){s-=1;n.style.fontSize=s+'px';guard++;}n.style.textOverflow='clip';}
 function waitForImages(){var imgs=Array.from(document.images||[]);return Promise.all(imgs.map(function(img){return img.complete?Promise.resolve():new Promise(function(resolve){img.onload=img.onerror=resolve;});}));}
 window.addEventListener('load',function(){fitName();waitForImages().then(function(){setTimeout(function(){window.print();},250);});});
 </script></body></html>`;
 const w=window.open('','_blank','width=800,height=700'); if(!w) throw new Error('Please allow pop-ups to print the ID card.'); w.document.write(documentHtml); w.document.close();
}