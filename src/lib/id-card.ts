import QRCode from 'qrcode';

function esc(v: any) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  directorSignatureUrl?: string | null;
  directorName?: string;
  schoolName?: string;
  shortName?: string;
  contact1?: string;
  contact2?: string;
}) {
  const qr = await QRCode.toDataURL(
    JSON.stringify({ institution: 'AMQM', type: input.type, id: input.id }),
    { width: 220, margin: 1, errorCorrectionLevel: 'M' }
  );

  const schoolName = input.schoolName || "ALIYU AND MAIMUNA CENTER FOR QUR'ANIC MEMORIZATION";
  const shortName = input.shortName || 'AMQM';
  const directorName = input.directorName || 'School Director';
  const contact1 = input.contact1 || '08035443519';
  const contact2 = input.contact2 || '08038889690';

  const logo = input.logoUrl
    ? `<img class="logo" src="${esc(input.logoUrl)}" alt="School logo"/>`
    : `<div class="logoFallback">${esc(shortName.slice(0, 3))}</div>`;

  const directorSig = input.directorSignatureUrl
    ? `<img class="directorSig" src="${esc(input.directorSignatureUrl)}" alt="Director signature"/>`
    : `<div class="signatureLine"></div>`;

  const photo = input.photoUrl
    ? `<img class="photo" src="${esc(input.photoUrl)}" alt=""/>`
    : `<div class="photoPh">${esc((input.name || '?').charAt(0).toUpperCase())}</div>`;

  const frontFields = input.type === 'STUDENT'
    ? `
      <div class="fieldRow">
        <div class="field"><span>Program Year:</span><b>${esc(input.year || '—')}</b></div>
        <div class="field"><span>Section:</span><b>${esc(input.section || '—')}</b></div>
      </div>
      <div class="fieldRow">
        <div class="field wide"><span>Class:</span><b>${esc(input.className || 'Unassigned')}</b></div>
      </div>
      <div class="admission"><span>Admission No:</span><b>${esc(input.admissionNo || '—')}</b></div>
    `
    : `
      <div class="fieldRow">
        <div class="field"><span>Position:</span><b>${esc(input.jobTitle || 'Staff')}</b></div>
        <div class="field"><span>Department:</span><b>${esc(input.department || '—')}</b></div>
      </div>
      <div class="fieldRow">
        <div class="field wide"><span>Phone:</span><b>${esc(input.phone || '—')}</b></div>
      </div>
      <div class="admission"><span>Staff ID:</span><b>${esc(input.id)}</b></div>
    `;

  const html = `<!doctype html>
<html><head><title>${esc(shortName)} ${input.type} ID — ${esc(input.name)}</title>
<style>
*{box-sizing:border-box}
@page{size:auto;margin:8mm}
body{margin:0;background:#edf2ef;font-family:Arial,Helvetica,sans-serif;color:#12342c}
.sheet{display:flex;gap:18px;justify-content:center;align-items:flex-start;padding:24px}
.card{width:540px;height:340px;border-radius:22px;overflow:hidden;position:relative;box-shadow:0 12px 35px rgba(18,52,44,.16);page-break-inside:avoid}
.front{background:#fff;border:1px solid #d9b65d}
.band{height:104px;background:linear-gradient(110deg,#075546 0%,#08604f 68%,#075546 100%);color:#fff;padding:14px 20px;display:flex;gap:13px;align-items:flex-start;position:relative;overflow:hidden}
.band:after{content:'';position:absolute;right:-75px;top:-72px;width:260px;height:170px;border-radius:50%;border:2px solid rgba(227,190,91,.72);background:#fff;transform:rotate(-8deg)}
.band:before{content:'';position:absolute;right:-82px;top:38px;width:270px;height:150px;border-radius:50%;border-top:2px solid #d9b65d;transform:rotate(-10deg)}
.logo,.logoFallback{width:64px;height:64px;border-radius:15px;background:#fff;object-fit:contain;flex:0 0 auto;border:2px solid #e2bd62;padding:4px;position:relative;z-index:2}
.logoFallback{display:grid;place-items:center;color:#075546;font-weight:900;font-size:18px}
.brand{min-width:0;position:relative;z-index:2;padding-top:2px}
.brand strong{display:block;font:900 34px/1 Georgia,serif;letter-spacing:.8px;color:#f4d67d}
.brand small{display:block;font-size:11px;line-height:1.25;margin-top:7px;font-weight:800;letter-spacing:.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:360px}
.arabic{color:#e7c46c;font-size:12px;margin-top:4px}
.idBadge{position:absolute;right:24px;bottom:12px;z-index:4;background:#087055;color:#fff;border-radius:11px;padding:8px 17px;font-size:10px;font-weight:900;letter-spacing:1.1px;border:1px solid rgba(255,255,255,.2)}
.frontBody{display:grid;grid-template-columns:102px 1fr 72px;gap:14px;padding:20px 20px 10px;height:236px;position:relative}
.photo,.photoPh{width:102px;height:126px;object-fit:cover;border:3px solid #ddb75b;border-radius:15px;background:#edf3ef}
.photoPh{display:grid;place-items:center;color:#2c5c52;font-weight:900;font-size:30px}
.identity{min-width:0}
.label{font-size:10px;line-height:1.05;letter-spacing:2px;color:#61766e;font-weight:900;margin-top:1px;text-transform:uppercase;max-width:110px}
.name{font-size:24px;line-height:1.02;font-weight:900;margin:9px 0 7px;color:#073d33;overflow-wrap:anywhere;word-break:break-word}
.type{display:inline-block;background:#e7bf63;color:#173028;border-radius:999px;padding:6px 13px;font-size:9px;font-weight:900;letter-spacing:1.1px;margin-bottom:7px}
.fieldRow{display:flex;gap:8px;margin-top:5px;min-width:0}
.field{min-width:0;flex:1;border-bottom:1px solid #d6e0db;padding:3px 0 4px;display:flex;gap:4px;align-items:baseline;overflow:hidden}
.field.wide{flex-basis:100%}
.field span,.admission span{font-size:7px;color:#73857e;font-weight:800;white-space:nowrap}
.field b{font-size:9px;color:#173c33;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.admission{position:absolute;left:122px;bottom:10px;width:230px;padding:6px 8px;border:1px solid #d5e0db;border-radius:9px;background:#fff;display:flex;gap:5px;align-items:baseline;overflow:hidden}
.admission b{font-size:9px;color:#173c33;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qrWrap{text-align:center;position:relative;z-index:5}
.qr{width:72px;height:72px;background:#fff;border-radius:10px;padding:3px;border:1px solid #d2ddd7}
.scan{font-size:7px;line-height:1.25;font-weight:900;color:#65766f;margin-top:6px}
.idline{position:absolute;right:20px;bottom:11px;font-size:9px;font-weight:900;color:#073d33;z-index:5;white-space:nowrap}
.idline span{font-size:7px;color:#71827c;margin-right:4px}
.back{background:#fdfefc;border:1px solid #d4b15b;padding:24px 25px;color:#173b33}
.back:after{content:'';position:absolute;left:-20px;right:-20px;bottom:-48px;height:100px;border-radius:50% 50% 0 0;border-top:5px solid #d9b65d;background:#075546;transform:rotate(-1deg)}
.back:before{content:'';position:absolute;left:-20px;right:-20px;bottom:-57px;height:82px;border-radius:50% 50% 0 0;border-top:2px solid #e5c46d;z-index:1}
.backContent{position:relative;height:100%;z-index:3}
.back h1{font:900 24px/1 Georgia,serif;margin:0;color:#0a4d41}
.back h2{font:900 17px/1.15 Arial,Helvetica,sans-serif;margin:4px 0 14px;color:#123d35}
.back p{font-size:10px;line-height:1.55;color:#284f47;max-width:355px;margin:0}
.backQr{position:absolute;right:22px;top:23px;width:76px;height:76px;background:#fff;padding:4px;border-radius:10px;border:1px solid #d4dfd9;z-index:4}
.backScan{position:absolute;right:22px;top:104px;width:76px;text-align:center;font-size:7px;line-height:1.25;font-weight:900;color:#5e726a}
.expiry{display:inline-block;margin-top:14px;padding:6px 10px;border:1px solid #0b654f;border-radius:999px;background:#0b654f;color:#f2ce78;font-size:9px;font-weight:900;letter-spacing:.5px}
.signBlock{position:absolute;right:120px;bottom:18px;width:160px;z-index:4}
.directorSig{display:block;width:125px;height:45px;object-fit:contain;object-position:left bottom;margin-bottom:1px}
.signatureLine{width:125px;height:45px;border-bottom:1px solid #0a5a49}
.director{font-size:10px;color:#173b33;font-weight:900}
.valid{font-size:7px;letter-spacing:.6px;color:#647870;margin-top:2px;font-weight:800}
.contact{position:absolute;left:0;bottom:14px;font-size:8px;font-weight:900;color:#174239;z-index:5}
.contact b{color:#0b5c4b}
@media print{
body{background:#fff}.sheet{padding:0;gap:5mm;flex-direction:row}.card{width:85.6mm;height:54mm;border-radius:3.5mm;box-shadow:none}.band{height:26.4mm;padding:2.9mm 3.8mm;gap:2.5mm}.band:after{right:-12mm;top:-18mm;width:42mm;height:29mm}.band:before{right:-13mm;top:10mm;width:44mm;height:25mm}.logo,.logoFallback{width:16.8mm;height:16.8mm;border-radius:4mm;padding:1.1mm}.brand strong{font-size:9mm}.brand small{font-size:2.2mm;margin-top:1.7mm;max-width:62mm}.arabic{font-size:2.4mm;margin-top:.9mm}.idBadge{right:4mm;bottom:2.5mm;padding:2mm 4mm;font-size:2.1mm;border-radius:3mm}.frontBody{grid-template-columns:16.2mm 1fr 11.5mm;gap:2.2mm;padding:5mm 3.8mm 1.5mm;height:27.6mm}.photo,.photoPh{width:16.2mm;height:20mm;border-radius:3.6mm;border-width:.55mm}.label{font-size:1.7mm;letter-spacing:.6mm}.name{font-size:6.1mm;margin:1.6mm 0 1.2mm}.type{font-size:1.7mm;padding:1.1mm 2.4mm;margin-bottom:1mm}.fieldRow{gap:1.5mm;margin-top:.8mm}.field{padding:.6mm 0 .7mm}.field span,.admission span{font-size:1.35mm}.field b{font-size:1.75mm}.admission{left:22.5mm;bottom:1.8mm;width:38mm;padding:1mm 1.3mm;border-radius:2mm}.admission b{font-size:1.75mm}.qr{width:11.4mm;height:11.4mm;border-radius:2mm;padding:.5mm}.scan{font-size:1.25mm;margin-top:1mm}.idline{right:3.8mm;bottom:1.9mm;font-size:1.7mm}.idline span{font-size:1.35mm}.back{padding:3.8mm 4.2mm}.back h1{font-size:6.1mm}.back h2{font-size:4.3mm;margin:.9mm 0 3mm}.back p{font-size:1.8mm;line-height:1.55;max-width:56mm}.backQr{right:4mm;top:4mm;width:12.3mm;height:12.3mm;padding:.6mm;border-radius:2mm}.backScan{right:4mm;top:17mm;width:12.3mm;font-size:1.25mm}.expiry{margin-top:3mm;padding:1.2mm 2mm;font-size:1.65mm}.signBlock{right:20mm;bottom:3.2mm;width:29mm}.directorSig,.signatureLine{width:24mm;height:8.5mm}.director{font-size:1.8mm}.valid{font-size:1.3mm}.contact{left:4.2mm;bottom:2.5mm;font-size:1.65mm}
}
</style></head><body><div class="sheet">
<div class="card front">
  <div class="band">${logo}<div class="brand"><strong>${esc(shortName)}</strong><small>${esc(schoolName)}</small><div class="arabic">مركز عليو ومايمونا لتحفيظ القرآن</div></div><div class="idBadge">${input.type==='STUDENT'?'STUDENT ID':'STAFF ID'}</div></div>
  <div class="frontBody">
    <div>${photo}</div>
    <div class="identity"><div class="label">${input.type==='STUDENT'?'STUDENT ID CARD':'STAFF ID CARD'}</div><div class="name">${esc(input.name)}</div><div class="type">${input.type==='STUDENT'?'STUDENT':'STAFF'}</div>${frontFields}</div>
    <div class="qrWrap"><img class="qr" src="${qr}" alt="QR"/><div class="scan">SCAN TO VERIFY<br/>ID &amp; ATTENDANCE</div></div>
  </div>
  <div class="idline"><span>ID</span>${esc(input.id)}</div>
</div>
<div class="card back">
  <div class="backContent">
    <h1>${esc(shortName)}</h1><h2>Trusted Islamic Education<br/>for a Brighter Ummah</h2>
    <p>This card is issued by ${esc(schoolName)} for identification, attendance scanning, school access and approved academic services. If found, please return it to the school office.</p>
    <div class="expiry">VALID UNTIL: ${esc(input.expiry || '—')}</div>
    <img class="backQr" src="${qr}" alt="QR"/><div class="backScan">SCAN TO VERIFY</div>
    <div class="signBlock">${directorSig}<div class="director">${esc(directorName)}</div><div class="valid">DIRECTOR AUTHORISATION</div></div>
    <div class="contact">CONTACT SCHOOL: <b>${esc(contact1)} &nbsp;|&nbsp; ${esc(contact2)}</b></div>
  </div>
</div>
</div></body></html>`;

  const w = window.open('', '_blank', 'width=1160,height=720');
  if (!w) throw new Error('Please allow pop-ups to print the ID card.');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 300);
}
