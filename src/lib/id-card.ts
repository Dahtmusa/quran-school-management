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
  if (length > 34) return 'name name-xs';
  if (length > 27) return 'name name-sm';
  if (length > 21) return 'name name-md';
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
    { width: 280, margin: 1, errorCorrectionLevel: 'M' },
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
      <div class="fact fact-wide"><span>CLASS</span><strong>${esc(input.className || 'Unassigned')}</strong></div>
    `
    : `
      <div class="fact fact-wide"><span>POSITION</span><strong>${esc(input.jobTitle || 'Staff')}</strong></div>
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
  body{font-family:Inter,Arial,Helvetica,sans-serif;background:#edf2ef;color:#12372f}
  .sheet{display:flex;gap:24px;justify-content:center;align-items:flex-start;padding:28px}
  .card{position:relative;width:560px;height:352px;border-radius:28px;overflow:hidden;page-break-inside:avoid;box-shadow:0 16px 48px rgba(16,52,45,.16)}

  /* OPTION 3 — FRONT */
  .front{background:#fff;border:1px solid #d6b35b}
  .front-header{height:108px;background:linear-gradient(112deg,#06483b 0%,#08705a 72%,#075746 100%);color:#fff;display:flex;align-items:flex-start;gap:15px;padding:18px 22px;position:relative;overflow:hidden}
  .front-header:before{content:'';position:absolute;width:280px;height:160px;border-radius:50%;right:-100px;bottom:-82px;background:#fff;border-top:2px solid #d9b65c;transform:rotate(-9deg)}
  .front-header:after{content:'';position:absolute;width:180px;height:180px;border-radius:50%;right:-48px;top:-104px;border:1px solid rgba(231,194,104,.42)}
  .logo{width:72px;height:72px;object-fit:contain;background:#fff;border:2px solid #e7c36d;border-radius:17px;padding:5px;flex:none;position:relative;z-index:2}
  .logo-fallback{display:grid;place-items:center;color:#075144;font-weight:900;font-size:20px}
  .brand{min-width:0;position:relative;z-index:2;padding-top:1px}
  .brand-mark{font-family:Georgia,serif;font-size:31px;line-height:1;color:#f5d47e;font-weight:900;letter-spacing:1.4px}
  .school-name{margin-top:6px;font-size:10.5px;line-height:1.25;font-weight:850;max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .arabic{margin-top:4px;font-family:serif;font-size:13px;color:#ebc96c}
  .card-badge{position:absolute;right:24px;top:72px;z-index:4;background:#08704f;color:#fff;border:1px solid rgba(255,255,255,.55);border-radius:10px;padding:8px 15px;font-size:9px;font-weight:950;letter-spacing:1px}

  .front-content{display:grid;grid-template-columns:154px minmax(0,1fr) 96px;gap:16px;padding:18px 22px 0;position:relative;z-index:3}
  .photo,.photo-fallback{width:154px;height:158px;border-radius:17px;border:3px solid #dcb75b;background:#eaf0ec;object-fit:cover;display:block}
  .photo-fallback{display:grid;place-items:center;color:#2d6357;font-size:42px;font-weight:900}
  .title{font-size:10px;letter-spacing:2px;color:#6f817b;font-weight:900;margin:4px 0 7px}
  .name{font-size:25px;line-height:1.06;color:#073f34;font-weight:900;letter-spacing:-.15px;max-width:240px;overflow-wrap:break-word;word-break:normal}
  .name.name-md{font-size:22px}.name.name-sm{font-size:19px}.name.name-xs{font-size:16px}
  .status{display:inline-flex;margin-top:10px;padding:7px 16px;border-radius:999px;background:#e8bd5d;color:#17372f;font-size:9.5px;font-weight:950;letter-spacing:1px}
  .qr-wrap{text-align:center;padding-top:2px}
  .qr{width:88px;height:88px;border-radius:12px;padding:4px;background:#fff;border:1px solid #d2ded8;display:block;margin:0 auto}
  .scan{font-size:7px;line-height:1.35;font-weight:900;color:#5f746c;margin-top:7px;letter-spacing:.1px}

  .facts{position:absolute;left:22px;right:22px;bottom:52px;display:grid;grid-template-columns:1fr 1fr 1.65fr;gap:9px;z-index:5}
  .fact{min-width:0;padding:8px 10px;border:1px solid #c8dbd3;border-radius:11px;background:#eef4f0}
  .fact span{display:block;font-size:6.8px;letter-spacing:1px;color:#71847c;font-weight:900;white-space:nowrap}
  .fact strong{display:block;margin-top:3px;font-size:10px;line-height:1.12;color:#17483d;white-space:normal;overflow-wrap:anywhere}
  .fact-wide strong{font-size:10px}

  .bottom-row{position:absolute;left:22px;right:22px;bottom:11px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:15px;align-items:center;z-index:6}
  .identifier{border:1px solid #d2e0da;border-radius:10px;background:#fff;padding:6px 9px;min-width:0}
  .identifier span{display:block;font-size:6.8px;letter-spacing:1px;color:#71827c;font-weight:900}
  .identifier strong{display:block;margin-top:2px;font-size:10.5px;color:#0b463a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .school-id{font-size:8.6px;font-weight:950;color:#0b463a;white-space:nowrap}
  .school-id span{color:#73847e;font-size:7px;margin-right:4px}

  /* OPTION 2 — BACK */
  .back{background:linear-gradient(145deg,#fff 0%,#fbfcf9 72%,#f2f7f4 100%);border:1px solid #d5e0da;padding:27px;color:#12372f}
  .back:before{content:'';position:absolute;inset:10px;border:1px solid #cbdcd5;border-radius:20px;pointer-events:none}
  .back:after{content:'';position:absolute;left:-40px;right:-40px;bottom:-68px;height:105px;background:#075746;border-top:3px solid #d7b55d;border-radius:50% 50% 0 0/55% 55% 0 0;transform:rotate(-2deg);pointer-events:none}
  .back-content{position:relative;height:100%;display:flex;flex-direction:column;justify-content:space-between;z-index:2}
  .eyebrow{font-size:8px;letter-spacing:1.8px;color:#075746;font-weight:950}
  .back-title{font-family:Georgia,serif;color:#06483b;font-size:29px;line-height:1.1;font-weight:900;margin:8px 0 11px}
  .tagline{font-size:13px;font-weight:800;color:#1a4d42;margin:-6px 0 14px}
  .statement{max-width:420px;font-size:10.2px;line-height:1.55;color:#284d44;margin:0}
  .expiry{display:inline-flex;margin-top:13px;border:1px solid #d1ab51;border-radius:999px;padding:7px 11px;color:#075746;background:#fffdf6;font-size:9px;font-weight:950;letter-spacing:.25px}
  .back-lower{display:grid;grid-template-columns:1fr 108px;gap:18px;align-items:end;position:relative;z-index:3}
  .director-block{padding-bottom:7px}
  .signature{display:block;width:205px;height:56px;object-fit:contain;object-position:left center;filter:none;margin-bottom:2px}
  .signature-empty{border-bottom:1px solid #d3ad55;filter:none}
  .director-name{font-size:11px;font-weight:900;color:#12372f}
  .director-label{font-size:8px;letter-spacing:1.2px;color:#59746c;font-weight:900;margin-top:2px}
  .contact{margin-top:9px;font-size:8.5px;color:#31554c}
  .contact b{color:#075746}
  .back-qr{width:96px;height:96px;background:#fff;border-radius:12px;padding:4px;display:block;border:1px solid #d6e1dc}
  .qr-note{font-size:7px;line-height:1.35;color:#5d756d;margin-top:6px;max-width:98px}

  @media print{
    body{background:white}
    .sheet{padding:0;gap:7mm}
    .card{width:86mm;height:54mm;border-radius:3.8mm;box-shadow:none}
    .front-header{height:16.2mm;padding:2.8mm 3.5mm;gap:2.5mm}
    .front-header:before{width:45mm;height:25mm;right:-16mm;bottom:-13mm}
    .front-header:after{width:46mm;height:46mm;right:-13mm;top:-26mm}
    .logo{width:11mm;height:11mm;border-radius:2.7mm;padding:.7mm}
    .logo-fallback{font-size:3mm}
    .brand-mark{font-size:5.2mm}.school-name{font-size:1.72mm;margin-top:1.1mm;max-width:68mm}.arabic{font-size:2.15mm;margin-top:.65mm}
    .card-badge{right:3.5mm;top:11mm;padding:1.3mm 2.5mm;border-radius:1.7mm;font-size:1.55mm;letter-spacing:.2mm}
    .front-content{grid-template-columns:23.5mm minmax(0,1fr) 14.2mm;gap:2.5mm;padding:2.9mm 3.5mm 0}
    .photo,.photo-fallback{width:23.5mm;height:24.1mm;border-radius:2.8mm}.photo-fallback{font-size:7mm}
    .title{font-size:1.5mm;letter-spacing:.42mm;margin:.5mm 0 .9mm}
    .name{font-size:4.35mm;line-height:1.06;max-width:37mm}.name.name-md{font-size:3.85mm}.name.name-sm{font-size:3.35mm}.name.name-xs{font-size:2.9mm}
    .status{margin-top:1.7mm;padding:1.25mm 2.7mm;font-size:1.55mm;letter-spacing:.2mm}
    .qr-wrap{padding-top:.2mm}.qr{width:13.5mm;height:13.5mm;border-radius:2mm;padding:.65mm}.scan{font-size:1.2mm;margin-top:1mm}
    .facts{left:3.5mm;right:3.5mm;bottom:7.9mm;grid-template-columns:1fr 1fr 1.65fr;gap:1.35mm}
    .fact{padding:1.2mm 1.5mm;border-radius:1.8mm}.fact span{font-size:1.08mm;letter-spacing:.16mm}.fact strong{font-size:1.6mm;margin-top:.45mm;line-height:1.12}.fact-wide strong{font-size:1.6mm}
    .bottom-row{left:3.5mm;right:3.5mm;bottom:1.8mm;gap:2.5mm}.identifier{padding:1mm 1.45mm;border-radius:1.6mm}.identifier span{font-size:1.08mm;letter-spacing:.16mm}.identifier strong{font-size:1.7mm}.school-id{font-size:1.42mm}.school-id span{font-size:1.15mm}
    .back{padding:4.2mm}.back:before{inset:1.6mm;border-radius:3mm}.back:after{height:17mm;bottom:-11mm;left:-10mm;right:-10mm}
    .eyebrow{font-size:1.32mm;letter-spacing:.3mm}.back-title{font-size:4.7mm;margin:1.3mm 0 1.7mm}.tagline{font-size:2.05mm;margin:-.9mm 0 2.3mm}.statement{font-size:1.68mm;line-height:1.55;max-width:66mm}.expiry{margin-top:2mm;padding:1.2mm 1.7mm;font-size:1.45mm}
    .back-lower{grid-template-columns:1fr 16mm;gap:3mm}.director-block{padding-bottom:1.2mm}.signature{width:31mm;height:8.5mm}.director-name{font-size:1.72mm}.director-label{font-size:1.25mm;letter-spacing:.2mm}.contact{margin-top:1.3mm;font-size:1.38mm}.back-qr{width:14mm;height:14mm;border-radius:2mm;padding:.65mm}.qr-note{font-size:1.18mm;margin-top:1mm;max-width:14mm}
  }
</style>
</head>
<body>
<div class="sheet">
  <section class="card front">
    <div class="front-header">
      ${logo}
      <div class="brand">
        <div class="brand-mark">${esc(shortName)}</div>
        <div class="school-name">${esc(schoolName)}</div>
        <div class="arabic">مركز عليو ومايمونا لتحفيظ القرآن</div>
      </div>
      <div class="card-badge">${isStudent ? 'STUDENT ID' : 'STAFF ID'}</div>
    </div>

    <div class="front-content">
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
        <div class="tagline">Trusted Islamic Education for a Brighter Ummah</div>
        <p class="statement">This card is issued by ${esc(schoolName)} for identification, attendance scanning, school access and approved academic services. If found, please return it to the school office.</p>
        <div class="expiry">VALID UNTIL: ${esc(input.expiry || '—')}</div>
      </div>

      <div class="back-lower">
        <div class="director-block">
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
