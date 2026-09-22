import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { createClient } from '@/lib/supabase/client';

function esc(v:any){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
const ENGLISH_SCHOOL_NAME='Aliyu & Maimuna Center for Qur’anic Memorization';
const ARABIC_SCHOOL_NAME='مركز علي وميمونة لتحفيظ القرآن الكريم';

function barcodeSvg(value:string){const el=document.createElementNS('http://www.w3.org/2000/svg','svg'); JsBarcode(el,value,{format:'CODE128',displayValue:false,height:42,width:1.65,margin:0}); return new XMLSerializer().serializeToString(el);}

function addOneMonth(dateText:string|null|undefined){
 const d=dateText?new Date(dateText+'T12:00:00'):null;
 if(!d||Number.isNaN(d.getTime()))return null;
 d.setMonth(d.getMonth()+1);
 return d.toISOString().slice(0,10);
}

function formatDate(dateText:string|null|undefined){
 if(!dateText)return '—';
 const d=new Date(dateText+'T12:00:00');
 if(Number.isNaN(d.getTime()))return String(dateText);
 return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(d);
}

async function loadProgramEndDate(programYear:string|undefined){
 try{
  const {data,error}=await createClient().from('academic_years').select('starts_on,ends_on,is_current').eq('is_current',true).maybeSingle();
  if(error||!data?.ends_on)return null;
  const d=new Date(String(data.ends_on)+'T12:00:00');
  if(Number.isNaN(d.getTime()))return null;
  if(programYear?.toLowerCase().includes('year 1')||programYear?.toLowerCase().includes('year_1'))d.setFullYear(d.getFullYear()+1);
  return d.toISOString().slice(0,10);
 }catch{return null;}
}

export async function printAcademicIdCard(input:{type:'STUDENT'|'STAFF'|'MANAGEMENT';name:string;id:string;admissionNo?:string;photoUrl?:string|null;year?:string;section?:string;className?:string|null;jobTitle?:string;department?:string;phone?:string;expiry?:string|null;programEndDate?:string|null;logoUrl?:string|null;}){
 const displayId=(input.type==='STUDENT'?(input.admissionNo||input.id):input.id)||input.id;
 const qr=await QRCode.toDataURL(JSON.stringify({institution:'AMQM',type:input.type,id:input.id}),{width:180,margin:2,errorCorrectionLevel:'H'});
 const barcode=barcodeSvg(input.id);
 const calculatedProgramEnd=input.type==='STUDENT'?await loadProgramEndDate(input.year):null;

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
   ? `<div class="directorSign"><img class="directorSignImage" src="${esc(directorSignature)}" alt="School Director signature"><span class="directorSignLabel">${esc(directorName)}</span><small>School Director</small></div>`
   : `<div class="directorSign"><div class="signLine"></div><span class="directorSignLabel">${esc(directorName)}</span><small>School Director</small></div>`;
 const logoUrl=esc(input.logoUrl||'https://ziyeasotnfijggecbqwf.supabase.co/storage/v1/object/public/school-public-media/2026/f29b5b2e-eadd-4202-894c-547722ee7c13-87.jpg');
 const logoMarkup=`<img class="logo" src="${logoUrl}" alt="School logo" onerror="this.src='https://ziyeasotnfijggecbqwf.supabase.co/storage/v1/object/public/school-public-media/2026/f29b5b2e-eadd-4202-894c-547722ee7c13-87.jpg'"/>`;
 const watermarkMarkup=`<img class="watermark" src="${logoUrl}" alt="" aria-hidden="true"/>`;

 const studentDisplayExpiry=input.type==='STUDENT'?addOneMonth(input.programEndDate||input.expiry||calculatedProgramEnd):(input.expiry||null);
 const typeLabel=input.type==='STUDENT'?'Student':input.type==='MANAGEMENT'?'Management':'Staff';

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

 const documentHtml=`<!doctype html><html><head><title>${esc(ENGLISH_SCHOOL_NAME)} — ${typeLabel} ID — ${esc(input.name)}</title><style>
 *{box-sizing:border-box;margin:0;padding:0}
 body{background:#dde6e2;font-family:'Segoe UI',Arial,sans-serif;color:#10251f;-webkit-font-smoothing:antialiased}
 .sheet{display:flex;flex-direction:column;align-items:center;gap:14px;padding:22px 14px}
 .card{width:420px;border-radius:13px;overflow:hidden;position:relative;background:#fff;box-shadow:0 10px 28px rgba(16,37,31,.28);page-break-after:always}
 .card:last-child{page-break-after:auto}
 .watermark{position:absolute;left:50%;top:52%;width:48mm;height:48mm;transform:translate(-50%,-50%);object-fit:contain;opacity:.24;filter:grayscale(1);z-index:3;pointer-events:none}.band,.frontName,.frontMain,.bottomBar,.backBody,.foot{position:relative;z-index:4}
 .band{min-height:76px;display:grid;grid-template-columns:52px minmax(0,1fr) auto;align-items:center;gap:11px;padding:8px 14px;background:linear-gradient(120deg,#07523f 0%,#062d2a 70%,#07241f 100%);color:#fff;border-bottom:2px solid #c9a84c;position:relative;z-index:1}
 .logo{width:52px;height:52px;border-radius:50%;background:#fff;object-fit:contain;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.25)}
 .brand{text-align:center;min-width:0;padding:0 2px}.brand strong{display:block;font-family:Georgia,'Times New Roman',serif;font-size:12.5px;line-height:1.15;font-weight:900;letter-spacing:.25px;color:#fff}.brand small{display:block;margin-top:4px;font-size:7.4px;line-height:1.25;font-weight:800;letter-spacing:.45px;color:#e4f0eb;text-transform:uppercase;white-space:normal}.arabic{direction:rtl;unicode-bidi:isolate;color:#f0c65d;font-size:10px;line-height:1.25;margin-top:1px;font-weight:700;font-family:Arial,'Noto Naskh Arabic','Amiri',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .band-tag{min-width:56px;text-align:center;font-size:7.2px;font-weight:900;letter-spacing:1.4px;line-height:1.4;color:#0a3a30;background:linear-gradient(135deg,#e8c97a,#c9a84c);border-radius:8px;padding:5px 8px;text-transform:uppercase}.band-qr{flex-shrink:0;width:36px;height:36px;background:#fff;border-radius:6px;padding:2px}.band-qr img{width:100%;height:100%;display:block}
 .frontName{padding:10px 15px 4px}.topLine{display:flex;align-items:center;justify-content:space-between;gap:8px}.eyebrow{font-size:7px;font-weight:900;letter-spacing:2px;color:#9a7020;text-transform:uppercase;white-space:nowrap}.tag{display:inline-block;background:#0a3a30;color:#e8c97a;border-radius:999px;padding:3px 10px;font-size:7.2px;font-weight:900;letter-spacing:1.4px;text-transform:uppercase;white-space:nowrap}.name{font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:900;color:#07382f;text-transform:uppercase;line-height:1.15;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .frontMain{display:grid;grid-template-columns:88px 1fr 82px;gap:10px;padding:7px 15px 10px;align-items:center}.photo{width:88px;height:100px;object-fit:cover;object-position:center top;border:2px solid #c9a54e;border-radius:9px;background:#eef2ef;display:block}.info{min-width:0;display:flex;flex-direction:column}.facts{display:grid;grid-template-columns:1fr 1fr;gap:5px}.facts .fact{background:#f2f6f3;border:1px solid #e0e9e4;border-radius:8px;padding:5px 7px;min-width:0}.facts .fact.wide{grid-column:1/-1}.facts span{display:block;font-size:6.2px;letter-spacing:.9px;color:#6e8179;font-weight:800;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.facts b{display:block;font-size:9px;font-weight:800;color:#0a3a30;margin-top:1px;line-height:1.3;overflow:hidden;word-break:break-word;text-transform:uppercase}.qrBox{display:flex;flex-direction:column;align-items:center;justify-content:center;align-self:stretch;border-left:1px solid #eef1ef;padding-left:8px}.qr{width:78px;height:78px;background:#fff;border:1px solid #d6ddd9;border-radius:7px;padding:2px}.scan{text-align:center;font-size:6.2px;font-weight:900;color:#61746d;letter-spacing:.4px;margin-top:4px;line-height:1.35;text-transform:uppercase}.bottomBar{min-height:42px;border-top:1px solid #e4e9e6;background:#fbfcfb;display:flex;align-items:center;gap:8px;padding:0 12px}.barcode{flex:1;min-width:0;height:31px;display:flex;align-items:center;overflow:hidden}.barcode svg{width:100%;height:29px}.idChip{flex-shrink:0;background:#eef4f0;border:1px solid #dfe7e2;border-radius:7px;padding:2px 9px;text-align:right}.idChip span{display:block;font-size:5px;font-weight:900;letter-spacing:1.2px;color:#6e8179;text-transform:uppercase}.idChip b{display:block;font-size:10.5px;font-weight:900;color:#07382f;margin-top:1px;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}
 .back{background:#fbfaf4}.backBody{padding:12px 15px 11px}.backKicker{font-size:7px;font-weight:900;letter-spacing:2.2px;color:#9a7020;text-transform:uppercase}.backBody h2{font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:900;color:#07382f;text-transform:uppercase;margin-top:3px;line-height:1.2}.backBody p{font-size:8.3px;line-height:1.5;color:#3c5149;margin-top:5px}.backGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px}.backGrid div{background:#f2f6f3;border:1px solid #dfe8e3;border-radius:9px;padding:7px 8px;min-width:0}.backGrid span{display:block;font-size:6px;font-weight:900;letter-spacing:1.4px;color:#6e8179;text-transform:uppercase}.backGrid b{display:block;font-size:10px;font-weight:900;color:#07382f;margin-top:2px;line-height:1.25;overflow:hidden;word-break:break-word;text-transform:uppercase}
 .police{margin-top:4px;font-size:6.7px!important;font-weight:800;color:#4d5d57!important}
 .signRow{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;align-items:end}.sign{display:flex;flex-direction:column;justify-content:flex-end;text-align:center;color:#5a6f66;font-size:6.5px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;min-width:0}.signLine{height:1px;background:#b9c4bf;margin-bottom:6px;position:relative}.signLine:after{content:'';position:absolute;left:50%;top:-2.5px;transform:translateX(-50%);width:5px;height:5px;background:#c9a84c;border-radius:50%}.directorSign{text-align:center;color:#5a6f66;min-width:0}.directorSignImage{display:block;width:105px;height:38px;object-fit:contain;object-position:center bottom;margin:0 auto 3px}.directorSignLabel{display:block;border-top:1px solid #b9c4bf;padding-top:4px;font-size:5.8px;font-weight:900;letter-spacing:.8px;line-height:1.15;text-transform:uppercase;color:#34524a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.directorSign small{display:block;font-size:5.2px;letter-spacing:1.2px;margin-top:1px;color:#72827c;text-transform:uppercase}.terms{background:#fdf8ec;border:1px solid #ecd9a8;border-radius:8px;padding:6px 8px}.terms b{display:block;font-size:5.5px;font-weight:900;letter-spacing:1.4px;color:#8a6a1f;text-transform:uppercase}.terms p{font-size:6.5px;line-height:1.45;color:#6d5b2a;margin-top:3px}.foot{background:#062d2a;color:#c2d4cd;font-size:6.8px;font-weight:700;letter-spacing:1.4px;text-align:center;padding:6px 10px;text-transform:uppercase}
 @media print{.sheet{padding:0}.card{box-shadow:none;border:1px solid #c9a84c}.directorSignImage{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{background:#fff}}
 @media screen and (min-width:720px){.sheet{zoom:1.3}} @media print{.sheet{zoom:1!important}}

 /* ISO/IEC 7810 ID-1 / bank-card dimensions: 85.60 × 53.98 mm */
 .card{width:85.6mm;height:53.98mm;min-height:53.98mm;border-radius:3.2mm;box-shadow:0 2mm 6mm rgba(16,37,31,.20);overflow:hidden}
 .sheet{gap:5mm;padding:6mm 4mm}
 .band{min-height:13mm;height:13mm;grid-template-columns:10.5mm minmax(0,1fr) auto;gap:2mm;padding:1.4mm 2.8mm;border-bottom:0.45mm solid #c9a84c}
 .logo{width:10.5mm;height:10.5mm}.brand{padding:0}.brand strong{font-size:3.2mm;line-height:1.05;letter-spacing:.05mm}.brand small{font-size:1.55mm;line-height:1.15;margin-top:.7mm;letter-spacing:.18mm}.arabic{font-size:2.2mm;line-height:1.1;margin-top:.45mm}
 .band-tag{min-width:11mm;font-size:1.7mm;letter-spacing:.25mm;line-height:1.2;border-radius:1.8mm;padding:1.2mm 1.6mm}.band-qr{width:9mm;height:9mm;border-radius:1.3mm;padding:.45mm}
 .frontName{padding:2.1mm 3.5mm .7mm}.topLine{gap:2mm}.eyebrow{font-size:1.55mm;letter-spacing:.42mm}.tag{padding:.7mm 2.2mm;font-size:1.55mm;letter-spacing:.3mm}.name{font-size:4.4mm;line-height:1.05;margin-top:.7mm}
 .frontMain{grid-template-columns:18mm 1fr 18mm;gap:2.5mm;padding:1.3mm 3.5mm 2mm}.photo{width:18mm;height:21mm;border-width:.45mm;border-radius:1.8mm}.facts{gap:1.2mm}.facts .fact{border-radius:1.5mm;padding:1.25mm 1.5mm}.facts span{font-size:1.15mm;letter-spacing:.18mm}.facts b{font-size:1.9mm;margin-top:.35mm;line-height:1.15}.qrBox{padding-left:2mm}.qr{width:16mm;height:16mm;border-radius:1.4mm;padding:.5mm}.scan{font-size:1.25mm;letter-spacing:.08mm;margin-top:.7mm}
 .bottomBar{min-height:7mm;height:7mm;gap:1.5mm;padding:0 3mm}.barcode{height:5.2mm}.barcode svg{height:5mm}.idChip{border-radius:1.2mm;padding:.5mm 1.7mm}.idChip span{font-size:.95mm;letter-spacing:.2mm}.idChip b{font-size:2.1mm;max-width:29mm}
 .backBody{padding:2.7mm 3.5mm 2.4mm}.backKicker{font-size:1.45mm;letter-spacing:.4mm}.backBody h2{font-size:3.7mm;margin-top:.6mm;line-height:1.05}.backBody p{font-size:1.7mm;line-height:1.3;margin-top:1.1mm}.backGrid{gap:1.5mm;margin-top:1.6mm}.backGrid div{border-radius:1.5mm;padding:1.4mm 1.6mm}.backGrid span{font-size:1.1mm;letter-spacing:.25mm}.backGrid b{font-size:2mm;margin-top:.35mm;line-height:1.1}
 .signRow{gap:2.5mm;margin-top:1.2mm;grid-template-columns:1fr 1fr}.directorSign{min-height:15mm;display:flex;flex-direction:column;justify-content:flex-end}.directorSignImage{width:36mm;height:14mm;margin:0 auto .35mm;object-fit:contain;object-position:center bottom;display:block}.directorSignLabel{padding-top:.55mm;font-size:1.45mm;letter-spacing:.16mm}.directorSign small{font-size:1.15mm;letter-spacing:.1mm;margin-top:.25mm;font-weight:800}.signLine{margin-bottom:1.2mm}.terms{border-radius:1.5mm;padding:1.25mm 1.5mm;min-height:15mm;display:flex;flex-direction:column;justify-content:center}.terms b{font-size:1.25mm;letter-spacing:.25mm}.terms p{font-size:1.55mm;line-height:1.3;margin-top:.6mm}.police{margin-top:.65mm;font-size:1.8mm!important;font-weight:900!important}.terms .police strong{font-weight:900;color:#07382f;letter-spacing:.05mm;font-size:1.9mm}
 
 .foot{font-size:1.25mm;letter-spacing:.2mm;padding:1.8mm 3mm;line-height:1.15;min-height:5.5mm}.watermark{width:48mm;height:48mm;top:52%;opacity:.24}
 @media screen and (min-width:720px){.sheet{zoom:1!important}}


 /* Front side: strict ID-1 height budget to prevent clipping */
 .card.front{display:flex;flex-direction:column}
 .card.front .band{flex:0 0 13mm;height:13mm;min-height:13mm}
 .card.front .frontName{flex:0 0 9.1mm;height:9.1mm;padding:1.25mm 3.5mm .35mm;overflow:hidden}
 .card.front .name{font-size:3.65mm;line-height:1.08;margin-top:.45mm;max-height:4.1mm;overflow:hidden}
 .card.front .frontMain{flex:0 0 24.3mm;height:24.3mm;min-height:24.3mm;grid-template-columns:17mm 1fr 16.5mm;gap:2mm;padding:.8mm 3.5mm 1.2mm;overflow:hidden}
 .card.front .photo{width:17mm;height:19mm}
 .card.front .facts{gap:1mm}
 .card.front .facts .fact{padding:1mm 1.2mm;border-radius:1.2mm}
 .card.front .facts span{font-size:1mm;letter-spacing:.15mm}
 .card.front .facts b{font-size:1.7mm;line-height:1.05;margin-top:.2mm}
 .card.front .qrBox{padding-left:1.5mm}
 .card.front .qr{width:15mm;height:15mm}
 .card.front .scan{font-size:1.1mm;margin-top:.5mm;line-height:1.15}
 .card.front .bottomBar{flex:0 0 7.2mm;height:7.2mm;min-height:7.2mm;padding:0 3mm;gap:1.2mm}
 .card.front .barcode{height:5.2mm}.card.front .barcode svg{height:5mm}
 .card.front .idChip{padding:.45mm 1.4mm}.card.front .idChip span{font-size:.85mm}.card.front .idChip b{font-size:1.9mm;max-width:27mm}
 /* Back side: strict ID-1 height budget — 13mm header + 35.5mm body + 5.5mm footer */
 .card.back{display:flex;flex-direction:column}
 .card.back .band{flex:0 0 13mm}
 .card.back .backBody{flex:0 0 35.48mm;height:35.48mm;min-height:35.48mm;padding:1.8mm 3.5mm 1.2mm;overflow:hidden}
 .card.back .backKicker{font-size:1.25mm;letter-spacing:.32mm}
 .card.back .backBody h2{font-size:3.35mm;margin-top:.45mm;line-height:1.02}
 .card.back .backBody>p{font-size:1.45mm;line-height:1.18;margin-top:.7mm}
 .card.back .backGrid{gap:1.2mm;margin-top:1.1mm}
 .card.back .backGrid div{padding:1mm 1.3mm;border-radius:1.2mm}
 .card.back .backGrid span{font-size:.95mm;letter-spacing:.18mm}
 .card.back .backGrid b{font-size:1.75mm;margin-top:.2mm;line-height:1.05}
 .card.back .signRow{height:12.2mm;min-height:12.2mm;gap:2mm;margin-top:1mm}
 .card.back .directorSign{min-height:12.2mm;height:12.2mm}
 .card.back .directorSignImage{width:29mm;height:7.2mm;margin:0 auto .2mm}
 .card.back .directorSignLabel{padding-top:.4mm;font-size:1.15mm;letter-spacing:.1mm}
 .card.back .directorSign small{font-size:.9mm;letter-spacing:.06mm;margin-top:.15mm}
 .card.back .terms{min-height:12.2mm;height:12.2mm;padding:1mm 1.3mm;border-radius:1.2mm;overflow:hidden}
 .card.back .terms b{font-size:1.1mm;letter-spacing:.18mm}
 .card.back .terms p{font-size:1.25mm;line-height:1.18;margin-top:.4mm}
 .card.back .terms .police{font-size:1.45mm!important;line-height:1.12;margin-top:.45mm}
 .card.back .foot{flex:0 0 5.5mm;height:5.5mm;min-height:5.5mm;font-size:1.05mm;padding:1.3mm 2.5mm;line-height:1.05}
 .card.back .watermark{width:44mm;height:44mm;top:52%;opacity:.24}
 @media print{.sheet{padding:0;gap:0}.card{box-shadow:none}.card.front{margin-bottom:4mm}.card.back{margin-bottom:0}.sheet{align-items:center}}
 </style></head><body><div class="sheet">
 <div class="card front">
  ${watermarkMarkup}
  <div class="band">${logoMarkup}<div class="brand"><strong>${esc(ENGLISH_SCHOOL_NAME)}</strong><div class="arabic">${ARABIC_SCHOOL_NAME}</div></div><div class="band-tag">${typeLabel}<br/>ID</div></div>
  <div class="frontName"><div class="topLine"><div class="eyebrow">Official Identification</div><div class="tag">${input.type==='STUDENT'?'Student':input.type==='MANAGEMENT'?'Management':'Staff'}</div></div><div class="name" id="fname">${esc(input.name)}</div></div>
  <div class="frontMain">${input.photoUrl?`<img class="photo" src="${esc(input.photoUrl)}" alt="${esc(typeLabel)} photo"/>`:'<div class="photo"></div>'}<div class="info"><div class="facts">${factsRows.map(f=>`<div class="fact${f[2]?' wide':''}"><span>${f[0]}</span><b>${f[1]}</b></div>`).join('')}</div></div><div class="qrBox"><img class="qr" src="${qr}" alt="QR verification code"/><div class="scan">Scan to<br/>verify</div></div></div>
  <div class="bottomBar"><div class="barcode">${barcode}</div><div class="idChip"><span>ID No.</span><b>${esc(displayId)}</b></div></div>
 </div>
 <div class="card back">
  ${watermarkMarkup}
  <div class="band">${logoMarkup}<div class="brand"><strong>${esc(ENGLISH_SCHOOL_NAME)}</strong><div class="arabic">${ARABIC_SCHOOL_NAME}</div></div><div class="band-qr"><img src="${qr}" alt="QR verification code"/></div></div>
  <div class="backBody"><div class="backKicker">Official School Identification Card</div><h2>This card belongs to ${esc(input.name)}</h2><p>This card is the property of Aliyu &amp; Maimuna Center for Qur’anic Memorization. It must be presented on request for school identity verification, attendance scanning, school access and approved academic services. It is not transferable.</p>
   <div class="backGrid">${input.type==='STUDENT'
     ? `<div><span>Valid until</span><b>${formatDate(studentDisplayExpiry)}</b></div><div><span>Issued to</span><b>${esc(input.name)}</b></div>`
     : `<div style="grid-column:1/-1"><span>ID holder</span><b>${esc(input.name)}</b></div>`
   }</div>
   
   <div class="signRow"><div>${directorMarkup}</div><div class="terms"><b>If found</b><p>Please return this card to the school office or drop it in the collection box at the main gate.</p><p class="police">If found, please contact the school: <strong>08036042021</strong></p></div></div>
  </div><div class="foot">${esc(ENGLISH_SCHOOL_NAME)} · QR &amp; barcode encode the unique record for verification and attendance</div>
 </div>
 </div><script>
 function fitName(){var n=document.getElementById('fname');if(!n)return;var s=15;n.style.fontSize=s+'px';n.style.lineHeight='1.08';n.style.whiteSpace='nowrap';var guard=0;while(n.scrollWidth>n.clientWidth+1&&s>8&&guard<20){s-=0.5;n.style.fontSize=s+'px';guard++;}n.style.textOverflow='clip';}
 function waitForImages(){var imgs=Array.from(document.images||[]);return Promise.all(imgs.map(function(img){return img.complete?Promise.resolve():new Promise(function(resolve){img.onload=img.onerror=resolve;});}));}
 window.addEventListener('load',function(){fitName();waitForImages().then(function(){setTimeout(function(){window.print();},250);});});
 </script></body></html>`;
 const w=window.open('','_blank','width=800,height=700'); if(!w) throw new Error('Please allow pop-ups to print the ID card.'); w.document.write(documentHtml); w.document.close();
}