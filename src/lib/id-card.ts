import QRCode from 'qrcode';

function esc(v: unknown) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function upper(v: unknown) {
  return String(v ?? '').trim().toLocaleUpperCase();
}

function normaliseLogoUrl(value: unknown): string {
  if (typeof value === 'string') return value;
  const v: any = value;
  return v?.url || v?.value?.url || v?.value?.value || v?.value || '';
}

export async function printAcademicIdCard(input: {
  type: 'STUDENT' | 'STAFF';
  name: string;
  id: string;
  admissionNo?: string;
  photoUrl?: string | null;
  year?: string;
  section?: string;
  className?: string | null;
  jobTitle?: string;
  department?: string;
  phone?: string;
  expiry?: string | null;
  logoUrl?: string | null;
  directorName?: string;
  directorSignatureUrl?: string | null;
}) {
  const qr = await QRCode.toDataURL(JSON.stringify({ institution: 'AMQM', type: input.type, id: input.id }), {
    width: 320,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

  const logoUrl = normaliseLogoUrl(input.logoUrl);
  const name = upper(input.name);
  const schoolName = "ALIYU AND MAIMUNA CENTER FOR QUR'ANIC MEMORIZATION";
  const directorName = upper(input.directorName || 'MUSA') || 'MUSA';
  const expiry = input.expiry || '2027-10-30';

  const nameClass = name.length <= 20 ? 'name short' : name.length <= 28 ? 'name medium' : 'name long';

  const frontFacts = input.type === 'STUDENT'
    ? `
      <div class="fact"><span>PROGRAM YEAR</span><b>${esc(input.year || '—')}</b></div>
      <div class="fact"><span>SECTION</span><b>${esc(input.section || '—')}</b></div>
      <div class="fact fact-wide"><span>CLASS</span><b>${esc(input.className || 'Unassigned')}</b></div>`
    : `
      <div class="fact"><span>POSITION</span><b>${esc(input.jobTitle || 'QUR\'AN TEACHER')}</b></div>
      <div class="fact"><span>DEPARTMENT</span><b>${esc(input.department || 'QUR\'AN MEMORIZATION')}</b></div>
      <div class="fact fact-wide"><span>PHONE</span><b>${esc(input.phone || '—')}</b></div>`;

  const extra = input.type === 'STUDENT'
    ? `<div class="fieldLine"><span>ADMISSION NO.</span><b>${esc(input.admissionNo || '—')}</b></div>`
    : `<div class="fieldLine"><span>STAFF ID</span><b>${esc(input.id)}</b></div>`;

  const signature = input.directorSignatureUrl
    ? `<img class="signature" src="${esc(input.directorSignatureUrl)}" alt="Director signature"/>`
    : '<div class="signatureFallback">MUSA</div>';

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>AMQM ${input.type} ID - ${esc(name)}</title>
<style>
@page{size:auto;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#eef3f0;color:#12372f;font-family:Arial,Helvetica,sans-serif}
.sheet{display:flex;gap:22px;justify-content:center;align-items:flex-start;padding:24px}
.card{width:540px;height:340px;border-radius:25px;overflow:hidden;position:relative;page-break-inside:avoid;box-shadow:0 10px 30px rgba(9,57,48,.14);border:1px solid #caa043;background:#fffdf7}
.front{background:#fbfaf5}
.frontHeader{height:102px;background:#075246;position:relative;overflow:hidden;padding:17px 24px;display:flex;align-items:flex-start;gap:14px;color:white}
.frontHeader:after{content:"";position:absolute;right:-40px;bottom:-72px;width:260px;height:125px;background:#fbfaf5;border:2px solid #d9ad4c;border-right:0;border-bottom:0;border-radius:100% 0 0 0;transform:rotate(-2deg)}
.frontHeader:before{content:"";position:absolute;right:16px;top:-78px;width:210px;height:210px;border:1px solid rgba(223,184,91,.5);border-radius:50%}
.logo{width:61px;height:61px;object-fit:contain;border-radius:15px;background:#fff;border:2px solid #e1b85c;flex:none;position:relative;z-index:2}
.brand{position:relative;z-index:2;min-width:0;max-width:385px}
.brandTitle{font-family:Georgia,serif;font-weight:800;font-size:29px;line-height:1;color:#f2cb70;letter-spacing:.8px;margin-top:2px}
.schoolName{font-size:10.5px;line-height:1.15;font-weight:800;letter-spacing:.1px;margin-top:8px;white-space:normal;max-width:380px}
.arabic{font-family:Georgia,serif;color:#e8bd5b;font-size:13px;margin-top:4px}
.idBadge{position:absolute;right:24px;bottom:8px;z-index:3;background:#087258;color:#fff;border:1px solid #e0b24f;border-radius:16px;padding:8px 18px;font-size:11px;font-weight:900;letter-spacing:1px}
.frontBody{display:grid;grid-template-columns:150px minmax(0,1fr) 92px;gap:16px;padding:19px 26px 14px;position:relative}
.photo{width:150px;height:166px;object-fit:cover;border:3px solid #dfb653;border-radius:15px;background:#e8eee9;display:block}
.info{min-width:0}
.label{font-size:10px;letter-spacing:2px;color:#70817a;font-weight:900;line-height:1.15}
.name{font-weight:900;color:#063d34;line-height:.98;margin:9px 0 11px;white-space:normal;overflow-wrap:anywhere;max-width:100%;letter-spacing:.15px}
.name.short{font-size:25px}.name.medium{font-size:22px}.name.long{font-size:18px}
.type{display:inline-block;background:#e0b550;color:#172a25;border-radius:999px;padding:6px 15px;font-size:10px;font-weight:900;letter-spacing:1.1px}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:11px}
.fact{min-width:0;background:#edf3ef;border:1px solid #cfded8;border-radius:10px;padding:7px 9px;min-height:39px}
.fact-wide{grid-column:1 / -1}
.fact span,.fieldLine span{display:block;font-size:7.5px;letter-spacing:1.2px;color:#6c8178;font-weight:900;line-height:1.1}
.fact b,.fieldLine b{display:block;font-size:10px;line-height:1.2;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#143a32}
.fieldLine{position:absolute;left:192px;right:120px;bottom:11px;background:#fff;border:1px solid #cfddd7;border-radius:10px;padding:7px 10px;height:42px}
.qrWrap{text-align:center;min-width:0}
.qr{width:84px;height:84px;background:#fff;border:1px solid #d5dfda;border-radius:10px;padding:4px;display:block;margin:0 auto}
.scan{font-size:7.5px;font-weight:900;color:#63766f;line-height:1.2;margin-top:6px;text-transform:uppercase}
.idline{position:absolute;right:25px;bottom:13px;font-size:9.5px;font-weight:900;color:#083e35;white-space:nowrap}
.idline span{font-size:7.5px;color:#74857e;margin-right:4px}
.back{background:#fbfbf8;border-color:#d4aa50;color:#173c34;padding:24px}
.back:after{content:"";position:absolute;left:-20px;right:-20px;bottom:-35px;height:95px;background:#075246;border-top:3px solid #d9ae4d;border-radius:50% 50% 0 0 / 65% 65% 0 0;z-index:0}
.back:before{content:"";position:absolute;left:-10px;right:-10px;bottom:-47px;height:85px;border-top:2px solid #e5bd62;border-radius:50% 50% 0 0 / 60% 60% 0 0;z-index:1}
.backContent{position:relative;z-index:3;height:100%;display:flex;flex-direction:column}
.backTop{padding-right:132px}
.backBrand{font-family:Georgia,serif;font-size:25px;line-height:1;font-weight:800;color:#0b493e}
.backTag{font-size:15px;font-weight:800;margin-top:4px;color:#24574e}
.backRule{height:1px;background:#b8cbc4;margin:12px 0 10px}
.backText{font-size:10px;line-height:1.48;color:#34574f;margin:0;max-width:380px}
.backQr{position:absolute;right:0;top:4px;width:82px;height:82px;background:#fff;border:1px solid #d5dfda;border-radius:10px;padding:4px}
.backScan{position:absolute;right:0;top:91px;width:82px;text-align:center;font-size:7.5px;font-weight:900;color:#60756d;line-height:1.2}
.expiry{display:inline-block;margin-top:10px;background:#075246;color:#f1c768;border:1px solid #d9ad4c;border-radius:999px;padding:7px 12px;font-size:9px;font-weight:900;letter-spacing:.5px}
.backBottom{margin-top:auto;position:relative;z-index:4;display:flex;align-items:flex-end;justify-content:space-between;padding-right:120px;padding-bottom:1px}
.contact{font-size:9px;font-weight:900;color:#15463d;line-height:1.35;white-space:nowrap}
.contact strong{display:block;color:#075246;font-size:8px;letter-spacing:.8px;margin-bottom:2px}
.director{width:145px;text-align:left;margin-left:auto}
.signature{display:block;height:42px;width:125px;object-fit:contain;object-position:left bottom;margin-bottom:1px}
.signatureFallback{height:42px;font-family:cursive;font-size:30px;font-style:italic;color:#173e36;display:flex;align-items:flex-end}
.directorName{font-size:9px;font-weight:900;color:#123c34}.directorRole{font-size:7px;letter-spacing:.9px;color:#6d8179;font-weight:900;margin-top:2px}
@media print{
 html,body{background:#fff}.sheet{padding:0;gap:8mm;align-items:flex-start}.card{width:85.6mm;height:54mm;border-radius:3mm;box-shadow:none}
 .frontHeader{height:16.2mm;padding:2.7mm 3.9mm;gap:2.4mm}.logo{width:9.8mm;height:9.8mm;border-radius:2.2mm}.brandTitle{font-size:5.3mm}.schoolName{font-size:1.72mm;margin-top:1.4mm;max-width:65mm}.arabic{font-size:2.15mm;margin-top:.6mm}.idBadge{right:3.8mm;bottom:1.3mm;padding:1.5mm 3.4mm;font-size:1.8mm;border-radius:3.5mm}
 .frontBody{grid-template-columns:23.5mm minmax(0,1fr) 14mm;gap:2.6mm;padding:3.1mm 4.1mm 2.5mm}.photo{width:23.5mm;height:26mm;border-radius:2.4mm}.label{font-size:1.65mm;letter-spacing:.55mm}.name{margin:1.8mm 0 1.8mm}.name.short{font-size:4.3mm}.name.medium{font-size:3.75mm}.name.long{font-size:3.1mm}.type{padding:1.2mm 2.8mm;font-size:1.7mm}.facts{gap:1.3mm;margin-top:2mm}.fact{padding:1.2mm 1.5mm;min-height:6.4mm;border-radius:1.7mm}.fact span,.fieldLine span{font-size:1.25mm;letter-spacing:.2mm}.fact b,.fieldLine b{font-size:1.7mm;margin-top:.5mm}.fieldLine{left:30.5mm;right:19mm;bottom:1.8mm;height:7.1mm;padding:1.2mm 1.7mm;border-radius:1.7mm}.qr{width:13.2mm;height:13.2mm;border-radius:1.7mm;padding:.7mm}.scan{font-size:1.25mm;margin-top:1mm}.idline{right:4mm;bottom:2mm;font-size:1.65mm}.idline span{font-size:1.25mm}.back{padding:3.8mm}.backBrand{font-size:4.2mm}.backTag{font-size:2.45mm;margin-top:.7mm}.backRule{margin:2mm 0 1.8mm}.backText{font-size:1.65mm;line-height:1.45}.backQr{width:12.8mm;height:12.8mm;right:0;top:.7mm;padding:.7mm;border-radius:1.7mm}.backScan{top:14.1mm;width:12.8mm;font-size:1.2mm}.expiry{margin-top:1.8mm;padding:1.2mm 2.1mm;font-size:1.5mm}.backBottom{padding-right:19mm}.contact{font-size:1.5mm}.contact strong{font-size:1.25mm}.director{width:24mm}.signature{height:7mm;width:21mm}.signatureFallback{height:7mm;font-size:5mm}.directorName{font-size:1.5mm}.directorRole{font-size:1.2mm;margin-top:.4mm}
}
</style></head><body><div class="sheet">
<div class="card front">
  <div class="frontHeader">
    ${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="AMQM logo"/>` : '<div class="logo"></div>'}
    <div class="brand"><div class="brandTitle">AMQM</div><div class="schoolName">${schoolName}</div><div class="arabic">مركز عليو ومايمونا لتحفيظ القرآن</div></div>
    <div class="idBadge">${input.type === 'STUDENT' ? 'STUDENT ID' : 'STAFF ID'}</div>
  </div>
  <div class="frontBody">
    <div>${input.photoUrl ? `<img class="photo" src="${esc(input.photoUrl)}" alt="${esc(name)}"/>` : '<div class="photo"></div>'}</div>
    <div class="info"><div class="label">${input.type === 'STUDENT' ? 'STUDENT ID CARD' : 'STAFF ID CARD'}</div><div class="${nameClass}">${esc(name)}</div><div class="type">${input.type}</div><div class="facts">${frontFacts}</div></div>
    <div class="qrWrap"><img class="qr" src="${qr}" alt="Verification QR"/><div class="scan">SCAN TO VERIFY<br/>ID &amp; ATTENDANCE</div></div>
    ${extra}
    <div class="idline"><span>ID</span>${esc(input.id)}</div>
  </div>
</div>
<div class="card back">
  <div class="backContent">
    <div class="backTop"><div class="backBrand">AMQM</div><div class="backTag">Trusted Islamic Education for a Brighter Ummah</div><div class="backRule"></div><p class="backText">This card is issued by ${schoolName} for identification, attendance scanning, school access and approved academic services. If found, please return it to the school office.</p><div class="expiry">VALID UNTIL: ${esc(expiry)}</div></div>
    <img class="backQr" src="${qr}" alt="Verification QR"/><div class="backScan">SCAN TO VERIFY</div>
    <div class="backBottom"><div class="contact"><strong>CONTACT SCHOOL</strong>08035443519&nbsp;&nbsp;|&nbsp;&nbsp;08038889690</div><div class="director">${signature}<div class="directorName">${esc(directorName)}</div><div class="directorRole">DIRECTOR AUTHORISATION</div></div></div>
  </div>
</div>
</div><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;

  const w = window.open('', '_blank', 'width=1120,height=720');
  if (!w) throw new Error('Please allow pop-ups to print the ID card.');
  w.document.write(html);
  w.document.close();
}
