import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

function esc(v:any){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function barcodeSvg(value:string){const el=document.createElementNS('http://www.w3.org/2000/svg','svg'); JsBarcode(el,value,{format:'CODE128',displayValue:false,height:42,width:1.35,margin:0}); return new XMLSerializer().serializeToString(el);}

export async function printAcademicIdCard(input:{type:'STUDENT'|'STAFF';name:string;id:string;admissionNo?:string;photoUrl?:string|null;year?:string;section?:string;className?:string|null;jobTitle?:string;department?:string;phone?:string;expiry?:string|null;logoUrl?:string|null;}){
 const displayId=(input.type==='STUDENT'?(input.admissionNo||input.id):input.id)||input.id;
 const qr=await QRCode.toDataURL(JSON.stringify({institution:'AMQM',type:input.type,id:input.id}),{width:200,margin:1,errorCorrectionLevel:'M'});
 const barcode=barcodeSvg(input.id);

 const factsRows=(()=>{
   if(input.type==='STUDENT')return [
     ['PROGRAM YEAR',esc(input.year)],
     ['SECTION',esc(input.section)],
     ['CLASS',esc(input.className||'Unassigned')],
     ['ADMISSION NO.',esc(displayId)],
   ];
   return [
     ['POSITION',esc(input.jobTitle||'Qur\u2019an Teacher')],
     ['DEPARTMENT',esc(input.department||'Academics')],
     ['PHONE',esc(input.phone||'\u2014')],
     ['STAFF ID',esc(displayId)],
   ];
 })();

 const documentHtml=`<!doctype html><html><head><title>AMQM ${input.type==='STUDENT'?'Student':'Staff'} ID \u2014 ${esc(input.name)}</title><style>
 *{box-sizing:border-box;margin:0;padding:0}
 body{background:#dde6e2;font-family:'Segoe UI',Arial,sans-serif;color:#10251f;-webkit-font-smoothing:antialiased}
 .sheet{display:flex;flex-direction:column;align-items:center;gap:16px;padding:30px 18px}
 .card{width:520px;border-radius:20px;overflow:hidden;position:relative;background:#fff;box-shadow:0 18px 50px rgba(16,37,31,.30);page-break-after:always}
 .card:last-child{page-break-after:auto}

 /* ── shared band ── */
 .band{height:86px;display:flex;align-items:center;gap:14px;padding:0 20px;background:linear-gradient(120deg,#07523f 0%,#062d2a 70%,#07241f 100%);color:#fff;border-bottom:3px solid #c9a84c;position:relative;z-index:1}
 .logo{width:60px;height:60px;border-radius:50%;background:#fff;object-fit:contain;flex-shrink:0;box-shadow:0 2px 10px rgba(0,0,0,.25)}
 .brand-badge{min-width:0;flex:1}
 .brand-badge strong{display:block;font:900 26px Georgia,'Times New Roman',serif;letter-spacing:1px;line-height:1}
 .brand-badge small{display:block;font-size:8.5px;line-height:1.4;margin-top:4px;letter-spacing:1px;color:#cfe6dd;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .arabic{color:#e6bb58;font-size:12px;margin-top:3px;font-weight:600}
 .band-tag{flex-shrink:0;text-align:center;font-size:8.5px;font-weight:900;letter-spacing:2px;line-height:1.5;color:#0a3a30;background:linear-gradient(135deg,#e8c97a,#c9a84c);border-radius:12px;padding:8px 12px;text-transform:uppercase}

 /* ── FRONT ── */
 .frontMain{display:grid;grid-template-columns:118px 1fr 90px;gap:14px;padding:14px 18px 12px;align-items:center;height:206px}
 .photo{width:118px;height:150px;object-fit:cover;object-position:center top;border:3px solid #caa54e;border-radius:14px;background:#eef2ef;display:block}
 .info{min-width:0;height:180px;display:flex;flex-direction:column}
 .eyebrow{font-size:7.5px;font-weight:900;letter-spacing:2.6px;color:#9a7020;text-transform:uppercase}
 .name{font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:900;color:#07382f;text-transform:uppercase;line-height:1.08;margin-top:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:0}
 .tag{display:inline-block;align-self:flex-start;background:#0a3a30;color:#e8c97a;border-radius:999px;padding:4px 12px;font-size:8.5px;font-weight:900;letter-spacing:1.6px;text-transform:uppercase;margin-top:7px}
 .facts{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px}
 .facts div{background:#f2f6f3;border:1px solid #e6ece8;border-radius:9px;padding:6px 8px;min-width:0}
 .facts span{display:block;font-size:6.5px;letter-spacing:1.1px;color:#6e8179;font-weight:800;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .facts b{display:block;font-size:9.5px;font-weight:800;color:#0a3a30;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}
 .qrBox{display:flex;flex-direction:column;align-items:center;justify-content:center;align-self:stretch;border-left:1px solid #eef1ef;padding-left:14px}
 .qr{width:84px;height:84px;background:#fff;border:1px solid #d6ddd9;border-radius:10px;padding:4px}
 .scan{text-align:center;font-size:6.5px;font-weight:900;color:#61746d;letter-spacing:.6px;margin-top:6px;line-height:1.4;text-transform:uppercase}
 .bottomBar{height:60px;border-top:1px solid #e4e9e6;background:#fbfcfb;display:flex;align-items:center;gap:16px;padding:0 20px}
 .barcode{flex:1;min-width:0;height:40px;display:flex;align-items:center;overflow:hidden}
 .barcode svg{width:100%;height:32px}
 .idChip{flex-shrink:0;background:#eef4f0;border:1px solid #dfe7e2;border-radius:10px;padding:4px 12px;text-align:right}
 .idChip span{display:block;font-size:6.5px;font-weight:900;letter-spacing:1.4px;color:#6e8179;text-transform:uppercase}
 .idChip b{display:block;font-size:11px;font-weight:900;color:#07382f;margin-top:2px;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}

 /* ── BACK ── */
 .back{background:#fbfaf4}
 .backBand{height:120px;background:linear-gradient(135deg,#07523f,#062d2a);color:#fff;padding:18px 24px;border-bottom:3px solid #c9a84c;display:flex;align-items:center;gap:16px;position:relative}
 .backBody{padding:20px 24px 16px}
 .backKicker{font-size:9px;font-weight:900;letter-spacing:3px;color:#9a7020;text-transform:uppercase}
 .backBody h2{font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:900;color:#07382f;margin-top:6px;line-height:1.15}
 .backBody p{font-size:11.5px;line-height:1.7;color:#3c5149;margin-top:10px;max-width:430px}
 .backGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
 .backGrid div{background:#f2f6f3;border:1px solid #e6ece8;border-radius:11px;padding:10px 12px;min-width:0}
 .backGrid span{display:block;font-size:7px;font-weight:900;letter-spacing:1.6px;color:#6e8179;text-transform:uppercase}
 .backGrid b{display:block;font-size:12px;font-weight:900;color:#07382f;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}
 .signRow{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;align-items:end}
 .sign{text-align:center;color:#5a6f66;font-size:8.5px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase}
 .signLine{height:1px;background:#b9c4bf;margin-bottom:8px;position:relative}
 .signLine:after{content:'';position:absolute;left:50%;top:-3px;transform:translateX(-50%);width:6px;height:6px;background:#c9a84c;border-radius:50%}
 .terms{background:#fdf8ec;border:1px solid #ecd9a8;border-radius:11px;padding:10px 12px}
 .terms b{display:block;font-size:7px;font-weight:900;letter-spacing:1.6px;color:#8a6a1f;text-transform:uppercase}
 .terms p{font-size:9.5px;line-height:1.55;color:#6d5b2a;margin-top:4px;max-width:none}
 .foot{background:#062d2a;color:#93ada3;font-size:8px;font-weight:700;letter-spacing:1.6px;text-align:center;padding:9px 16px;text-transform:uppercase}
 .watermark{position:absolute;right:18px;bottom:86px;width:118px;height:118px;opacity:.10;pointer-events:none}

 @media print{
   .sheet{padding:0}
   .card{box-shadow:none;border:1px solid #c9a84c}
   body{background:#fff}
 }
 @media screen and (max-width:660px){ .sheet{zoom:.62} }
 @media print and (max-width:660px){ .sheet{zoom:1!important} }
</style></head><body><div class="sheet">
 <div class="card front">
   <div class="band">
     <img class="logo" src="${esc(input.logoUrl||'')}" onerror="this.style.visibility='hidden'"/>
     <div class="brand-badge"><strong>AMQM</strong><small>Aliyu &amp; Maimuna Center for Qur\u2019anic Memorization</small><div class="arabic">مركز عليو ومايمونا لتحفيظ القرآن</div></div>
     <div class="band-tag">${input.type==='STUDENT'?'Student<br/>ID Card':'Staff<br/>ID Card'}</div>
   </div>
   <div class="frontMain">
     ${input.photoUrl?`<img class="photo" src="${esc(input.photoUrl)}" alt=""/>`:'<img class="photo" alt=""/>'}
     <div class="info">
       <div class="eyebrow">Official Identification</div>
       <div class="name">${esc(input.name)}</div>
       <div class="tag">${input.type==='STUDENT'?'Student':'Staff'}</div>
       <div class="facts">${factsRows.map(f=>`<div><span>${f[0]}</span><b>${f[1]}</b></div>`).join('')}</div>
     </div>
     <div class="qrBox"><img class="qr" src="${qr}"/><div class="scan">Scan to<br/>verify / attendance</div></div>
   </div>
   <div class="bottomBar">
     <div class="barcode">${barcode}</div>
     <div class="idChip"><span>ID No.</span><b>${esc(displayId)}</b></div>
   </div>
 </div>

 <div class="card back">
   <div class="backBand">
     <img class="logo" src="${esc(input.logoUrl||'')}" onerror="this.style.visibility='hidden'"/>
     <div class="brand-badge"><strong>AMQM</strong><small>Aliyu &amp; Maimuna Center for Qur\u2019anic Memorization</small><div class="arabic">مركز عليو ومايمونا لتحفيظ القرآن</div></div>
     <img class="watermark" src="${qr}"/>
   </div>
   <div class="backBody">
     <div class="backKicker">AMQM \u00b7 Official Academic Identification</div>
     <h2>This card belongs to ${esc(input.name)}</h2>
     <p>This card is the property of AMQM and must be presented on request. It is issued for student/staff identity verification, attendance scanning, school access and approved academic services within the school premises. Any misuse or unauthorised duplication will attract disciplinary action.</p>
     <div class="backGrid">
       <div><span>Valid until</span><b>${esc(input.expiry||'\u2014')}</b></div>
       <div><span>Issued to</span><b>${esc(input.name)}</b></div>
     </div>
     <div class="signRow">
       <div class="sign"><div class="signLine"></div>Director&rsquo;s Signature</div>
       <div class="terms"><b>If found</b><p>Please return this card to the school office or drop it in the collection box at the main gate. Thanks for your honesty.</p></div>
     </div>
   </div>
   <div class="foot">Aliyu &amp; Maimuna Center for Qur\u2019anic Memorization \u00b7 QR &amp; barcode encode your unique record</div>
 </div>
</div><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
 const w=window.open('','_blank','width=1100,height=760'); if(!w) throw new Error('Please allow pop-ups to print the ID card.'); w.document.write(documentHtml); w.document.close();
}