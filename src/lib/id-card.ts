import QRCode from 'qrcode';

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nameClass(name: string) {
  const length = name.trim().length;
  if (length > 32) return 'name name-xs';
  if (length > 24) return 'name name-sm';
  if (length > 17) return 'name name-md';
  return 'name';
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
  contactPhone1?: string;
  contactPhone2?: string;
}) {
  const qr = await QRCode.toDataURL(
    JSON.stringify({ institution: 'AMQM', type: input.type, id: input.id }),
    { width: 260, margin: 1, errorCorrectionLevel: 'M' },
  );

  const schoolName = input.schoolName || "ALIYU AND MAIMUNA CENTER FOR QUR'ANIC MEMORIZATION";
  const shortName = input.shortName || 'AMQM';
  const contactPhone1 = input.contactPhone1 || '08035443519';
  const contactPhone2 = input.contactPhone2 || '08038889690';
  const directorName = input.directorName || 'School Director';
  const displayName = input.name.trim() || 'Unnamed';
  const isStudent = input.type === 'STUDENT';

  const facts = isStudent
    ? `
      <div class="fact"><span>PROGRAM YEAR</span><strong>${esc(input.year || '—')}</strong></div>
      <div class="fact"><span>SECTION</span><strong>${esc(input.section || '—')}</strong></div>
      <div class="fact wide"><span>CLASS</span><strong>${esc(input.className || 'Unassigned')}</strong></div>
    `
    : `
      <div class="fact wide"><span>POSITION</span><strong>${esc(input.jobTitle || 'Staff')}</strong></div>
      <div class="fact"><span>DEPARTMENT</span><strong>${esc(input.department || '—')}</strong></div>
      <div class="fact"><span>PHONE</span><strong>${esc(input.phone || '—')}</strong></div>
    `;

  const primaryNumber = isStudent ? input.admissionNo || '—' : input.id;
  const primaryLabel = isStudent ? 'ADMISSION NO.' : 'STAFF ID';
  const logo = input.logoUrl
    ? `<img class="logo" src="${esc(input.logoUrl)}" alt="School logo" />`
    : `<div class="logo logo-fallback">${esc(shortName.slice(0, 3))}</div>`;
  const photo = input.photoUrl
    ? `<img class="photo" src="${esc(input.photoUrl)}" alt="${esc(displayName)}" />`
    : `<div class="photo photo-fallback">${esc(displayName.charAt(0).toUpperCase())}</div>`;
  const signature = input.directorSignatureUrl
    ? `<img class="signature" src="${esc(input.directorSignatureUrl)}" alt="Director signature" />`
    : `<div class="signature signature-empty"></div>`;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(shortName)} ${isStudent ? 'Student' : 'Staff'} ID — ${esc(displayName)}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:Inter,Arial,Helvetica,sans-serif;background:#edf2ef;color:#11342d}
  .sheet{display:flex;gap:24px;justify-content:center;align-items:flex-start;padding:28px}
  .card{position:relative;width:560px;height:352px;border-radius:27px;overflow:hidden;page-break-inside:avoid;box-shadow:0 16px 50px rgba(16,52,45,.16)}
  .front{background:#fbfcf8;border:1px solid #d5b45e}
  .header{height:100px;background:linear-gradient(115deg,#063c34 0%,#0b5448 100%);color:white;display:flex;align-items:center;gap:15px;padding:17px 23px;position:relative}
  .header:after{content:"";position:absolute;width:190px;height:190px;border:1px solid rgba(230,192,100,.35);border-radius:50%;right:-55px;top:-88px}
  .logo{width:70px;height:70px;object-fit:contain;background:white;border:2px solid #edca73;border-radius:17px;padding:5px;flex:none}
  .logo-fallback{display:grid;place-items:center;color:#075044;font-weight:900;font-size:20px}
  .brand{min-width:0;position:relative;z-index:1}
  .brand-mark{font-family:Georgia,serif;font-size:30px;line-height:1;color:#f3d580;font-weight:900;letter-spacing:1.4px}
  .school-name{margin-top:7px;font-size:10px;line-height:1.3;font-weight:800;letter-spacing:.25px;max-width:405px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .arabic{margin-top:4px;font-family:serif;font-size:13px;color:#ebc96c}

  .front-main{display:grid;grid-template-columns:143px minmax(0,1fr) 88px;gap:17px;padding:17px 22px 0}
  .photo,.photo-fallback{width:143px;height:164px;border-radius:17px;border:3px solid #dcb75b;background:#eaf0ec;object-fit:cover;display:block}
  .photo-fallback{display:grid;place-items:center;color:#2d6357;font-size:42px;font-weight:900}
  .title{font-size:10px;letter-spacing:2.1px;color:#71837d;font-weight:900;margin:2px 0 4px}
  .name{font-size:28px;line-height:1.02;color:#063f34;font-weight:950;letter-spacing:-.3px;max-width:210px;overflow-wrap:anywhere}
  .name.name-md{font-size:25px}.name.name-sm{font-size:22px}.name.name-xs{font-size:19px}
  .status{display:inline-flex;margin-top:9px;padding:7px 15px;border-radius:999px;background:#e7be62;color:#18392f;font-size:10px;font-weight:950;letter-spacing:1.1px}
  .qr-wrap{text-align:center}
  .qr{width:82px;height:82px;border-radius:13px;padding:4px;background:white;border:1px solid #d5e0da;display:block;margin:0 auto}
  .scan{font-size:7px;line-height:1.32;font-weight:900;color:#647871;margin-top:7px;letter-spacing:.15px}

  .facts{position:absolute;left:22px;right:22px;bottom:53px;display:grid;grid-template-columns:1.05fr .95fr 1.85fr;gap:8px}
  .fact{min-width:0;padding:7px 9px;border:1px solid #cbdcd4;border-radius:11px;background:#eef4f0}
  .fact span{display:block;font-size:6.8px;letter-spacing:1px;color:#73847e;font-weight:900;white-space:nowrap}
  .fact strong{display:block;margin-top:3px;font-size:10px;line-height:1.08;color:#1b443b;white-space:normal;overflow-wrap:anywhere}
  .fact.wide strong{font-size:10px}

  .bottom-row{position:absolute;left:22px;right:22px;bottom:12px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:15px;align-items:center}
  .identifier{border:1px solid #d3e0da;border-radius:10px;background:#fff;padding:6px 9px;min-width:0}
  .identifier span{display:block;font-size:6.8px;letter-spacing:1px;color:#71827c;font-weight:900}
  .identifier strong{display:block;margin-top:2px;font-size:11px;color:#0b463a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .school-id{font-size:8.6px;font-weight:950;color:#0b463a;white-space:nowrap}
  .school-id span{color:#73847e;font-size:7px;margin-right:4px}

  .back{background:linear-gradient(135deg,#063d35,#0b5247 72%,#0a483f);border:1px solid #d5b45e;color:white;padding:25px}
  .back:before{content:"";position:absolute;inset:10px;border:1px solid rgba(235,196,103,.52);border-radius:21px;pointer-events:none}
  .back-content{position:relative;height:100%;display:flex;flex-direction:column;justify-content:space-between;z-index:1}
  .eyebrow{font-size:8px;letter-spacing:1.8px;color:#edc971;font-weight:950}
  .back-title{font-family:Georgia,serif;color:#f3d17b;font-size:28px;line-height:1.1;font-weight:900;margin:8px 0 10px}
  .statement{max-width:420px;font-size:10.5px;line-height:1.55;color:#e1eee9;margin:0}
  .expiry{display:inline-flex;margin-top:13px;border:1px solid rgba(236,198,104,.55);border-radius:999px;padding:7px 10px;color:#f0cd75;font-size:9px;font-weight:950;letter-spacing:.25px}
  .back-lower{display:grid;grid-template-columns:1fr 105px;gap:20px;align-items:end}
  .director-label{font-size:8px;letter-spacing:1.2px;color:#b9d0c7;font-weight:900;margin-top:1px}
  .signature{display:block;width:200px;height:54px;object-fit:contain;object-position:left center;filter:brightness(0) invert(1);margin-bottom:2px}
  .signature-empty{border-bottom:1px solid #e6be62;filter:none}
  .director-name{font-size:11px;font-weight:900;color:white}
  .contact{margin-top:8px;font-size:8.5px;color:#d8e8e1}
  .contact b{color:#f0cc73}
  .back-qr{width:94px;height:94px;background:#fff;border-radius:13px;padding:4px;display:block}
  .qr-note{font-size:7px;line-height:1.35;color:#bcd2c9;margin-top:6px;max-width:94px}

  @media print{
    body{background:white}
    .sheet{padding:0;gap:7mm}
    .card{width:86mm;height:54mm;border-radius:3.8mm;box-shadow:none}
    .header{height:15.2mm;padding:2.6mm 3.4mm;gap:2.5mm}
    .header:after{width:46mm;height:46mm;right:-14mm;top:-21mm}
    .logo{width:10.6mm;height:10.6mm;border-radius:2.7mm;padding:.7mm}
    .brand-mark{font-size:5.2mm}.school-name{font-size:1.75mm;margin-top:1.2mm;max-width:72mm}.arabic{font-size:2.2mm;margin-top:.7mm}
    .front-main{grid-template-columns:22mm minmax(0,1fr) 13.5mm;gap:2.6mm;padding:2.7mm 3.4mm 0}
    .photo,.photo-fallback{width:22mm;height:25.4mm;border-radius:2.8mm}
    .photo-fallback{font-size:7mm}.title{font-size:1.55mm;letter-spacing:.45mm;margin:.3mm 0 .7mm}
    .name{font-size:5.2mm;line-height:1.02;max-width:34mm}.name.name-md{font-size:4.7mm}.name.name-sm{font-size:4.2mm}.name.name-xs{font-size:3.7mm}
    .status{margin-top:1.5mm;padding:1.3mm 2.8mm;font-size:1.8mm;letter-spacing:.25mm}
    .qr{width:12.6mm;height:12.6mm;border-radius:2.1mm;padding:.7mm}.scan{font-size:1.35mm;margin-top:1.1mm}
    .facts{left:3.4mm;right:3.4mm;bottom:8.6mm;grid-template-columns:1.05fr .95fr 1.85fr;gap:1.4mm}
    .fact{padding:1.2mm 1.6mm;border-radius:1.8mm}.fact span{font-size:1.15mm;letter-spacing:.18mm}.fact strong{font-size:1.72mm;margin-top:.5mm;line-height:1.08}.fact.wide strong{font-size:1.72mm}
    .bottom-row{left:3.4mm;right:3.4mm;bottom:2mm;gap:2.5mm}.identifier{padding:1mm 1.5mm;border-radius:1.6mm}.identifier span{font-size:1.15mm;letter-spacing:.18mm}.identifier strong{font-size:1.9mm;margin-top:.3mm}.school-id{font-size:1.5mm}.school-id span{font-size:1.2mm}
    .back{padding:4.2mm}.back:before{inset:1.6mm;border-radius:3mm}.eyebrow{font-size:1.35mm;letter-spacing:.3mm}.back-title{font-size:5mm;margin:1.3mm 0 1.7mm}.statement{font-size:1.75mm;line-height:1.55;max-width:68mm}.expiry{margin-top:2mm;padding:1.2mm 1.7mm;font-size:1.45mm}.back-lower{grid-template-columns:1fr 16mm;gap:3.5mm}.signature{width:31mm;height:8.5mm}.director-label{font-size:1.35mm}.director-name{font-size:1.75mm}.contact{margin-top:1.3mm;font-size:1.4mm}.back-qr{width:14mm;height:14mm;border-radius:2.1mm;padding:.7mm}.qr-note{font-size:1.2mm;margin-top:1mm;max-width:14mm}
  }
</style>
</head>
<body>
<div class="sheet">
  <section class="card front">
    <div class="header">
      ${logo}
      <div class="brand">
        <div class="brand-mark">${esc(shortName)}</div>
        <div class="school-name">${esc(schoolName)}</div>
        <div class="arabic">مركز عليو ومايمونا لتحفيظ القرآن</div>
      </div>
    </div>

    <div class="front-main">
      <div>${photo}</div>
      <div>
        <div class="title">${isStudent ? 'STUDENT ID CARD' : 'STAFF ID CARD'}</div>
        <div class="${nameClass(displayName)}">${esc(displayName)}</div>
        <div class="status">${isStudent ? 'STUDENT' : 'STAFF'}</div>
      </div>
      <div class="qr-wrap">
        <img class="qr" src="${qr}" alt="Verification QR" />
        <div class="scan">SCAN TO VERIFY<br/>ID &amp; ATTENDANCE</div>
      </div>
    </div>

    <div class="facts">${facts}</div>

    <div class="bottom-row">
      <div class="identifier">
        <span>${primaryLabel}</span>
        <strong>${esc(primaryNumber)}</strong>
      </div>
      <div class="school-id"><span>ID</span>${esc(input.id)}</div>
    </div>
  </section>

  <section class="card back">
    <div class="back-content">
      <div>
        <div class="eyebrow">${esc(shortName)} · OFFICIAL IDENTIFICATION</div>
        <div class="back-title">Trusted School Identity</div>
        <p class="statement">This card is issued by ${esc(schoolName)} for identification, attendance, school access and approved school services. If found, please return it to the school office.</p>
        <div class="expiry">VALID UNTIL: ${esc(input.expiry || '—')}</div>
      </div>

      <div class="back-lower">
        <div>
          ${signature}
          <div class="director-name">${esc(directorName)}</div>
          <div class="director-label">DIRECTOR AUTHORISATION</div>
          <div class="contact"><b>CONTACT SCHOOL</b> · ${esc(contactPhone1)} &nbsp;|&nbsp; ${esc(contactPhone2)}</div>
        </div>
        <div>
          <img class="back-qr" src="${qr}" alt="Verification QR" />
          <div class="qr-note">Digital verification &amp; attendance. Present this card when requested by the school.</div>
        </div>
      </div>
    </div>
  </section>
</div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1180,height=760');
  if (!win) throw new Error('Please allow pop-ups to print the ID card.');
  win.document.open();
  win.document.write(html);
  win.document.close();
  window.setTimeout(() => win.print(), 350);
}
