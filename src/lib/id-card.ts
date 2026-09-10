import QRCode from 'qrcode';

function esc(v: unknown) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nameSizeMm(name: string) {
  const n = name.trim().length;
  if (n <= 18) return 4.0;
  if (n <= 24) return 3.6;
  if (n <= 30) return 3.25;
  if (n <= 36) return 2.95;
  if (n <= 44) return 2.7;
  return 2.5;
}

function fitTextSizeMm(text: string, maxMm: number, baseMm: number, minMm: number) {
  const n = Math.max(1, text.trim().length);
  return Math.max(minMm, Math.min(baseMm, maxMm / n));
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
  const isStudent = input.type === 'STUDENT';
  const shortName = input.shortName || 'AMQM';
  const schoolName = input.schoolName || "ALIYU AND MAIMUNA CENTER FOR QUR'ANIC MEMORIZATION";
  const directorName = input.directorName || 'SCHOOL DIRECTOR';
  const contactPhone1 = input.contactPhone1 || '08035443519';
  const contactPhone2 = input.contactPhone2 || '08038889690';
  const displayName = (input.name || 'UNNAMED').trim().toLocaleUpperCase();
  const qr = await QRCode.toDataURL(
    JSON.stringify({ institution: shortName, type: input.type, id: input.id }),
    { width: 300, margin: 1, errorCorrectionLevel: 'M' },
  );

  const logo = input.logoUrl
    ? `<img class="logo" src="${esc(input.logoUrl)}" alt="School logo" />`
    : `<div class="logo logo-fallback">${esc(shortName)}</div>`;
  const photo = input.photoUrl
    ? `<img class="photo" src="${esc(input.photoUrl)}" alt="${esc(displayName)}" />`
    : `<div class="photo photo-fallback">${esc(displayName.slice(0, 1))}</div>`;
  const signature = input.directorSignatureUrl
    ? `<img class="signature" src="${esc(input.directorSignatureUrl)}" alt="Director signature" />`
    : `<div class="signature signature-empty"></div>`;

  const nameSize = nameSizeMm(displayName);
  const schoolSize = fitTextSizeMm(schoolName, 82, 1.85, 1.45);
  const nameSizePx = (nameSize * 3.78).toFixed(2);
  const schoolSizePx = (schoolSize * 3.78).toFixed(2);
  const classOrPosition = isStudent ? (input.className || 'UNASSIGNED') : (input.jobTitle || 'QURAN TEACHER');
  const departmentOrSection = isStudent ? (input.section || '—') : (input.department || '—');
  const primaryLabel = isStudent ? 'ADMISSION NO.' : 'STAFF ID';
  const primaryValue = isStudent ? (input.admissionNo || '—') : input.id;
  const primarySize = fitTextSizeMm(primaryValue, 52, 2.0, 1.45);
  const classSize = fitTextSizeMm(classOrPosition, 45, 1.9, 1.35);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>${esc(shortName)} ${isStudent ? 'Student' : 'Staff'} ID</title>
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;background:#edf2ef;color:#0d4035}
.sheet{display:flex;gap:22px;justify-content:center;align-items:flex-start;padding:28px}.card{position:relative;width:540px;height:340px;border-radius:24px;overflow:hidden;page-break-inside:avoid;box-shadow:0 12px 38px rgba(12,59,48,.16)}
.front{background:#fffdf8;border:1px solid #d4aa4e}.front-head{height:102px;background:#075646;color:#fff;position:relative;overflow:hidden;padding:15px 18px;display:flex;align-items:flex-start;gap:12px}.front-head:before{content:"";position:absolute;right:-55px;bottom:-54px;width:300px;height:125px;background:#fffdf8;border-top:2px solid #d7b65c;border-radius:60% 0 0 0/100% 0 0 0;transform:rotate(-4deg)}.front-head:after{content:"";position:absolute;right:-65px;top:-100px;width:205px;height:205px;border:1px solid rgba(231,194,104,.45);border-radius:50%}
.logo{width:68px;height:68px;flex:0 0 68px;object-fit:contain;background:#fff;border:2px solid #e5bd61;border-radius:15px;padding:5px;position:relative;z-index:2}.logo-fallback{display:grid;place-items:center;color:#075646;font-weight:900;font-size:18px}.brand{min-width:0;position:relative;z-index:2;padding-top:2px}.brand-mark{font-family:Georgia,serif;font-size:31px;line-height:1;color:#f3cf78;font-weight:900;letter-spacing:1px}.school-name{margin-top:6px;font-weight:850;font-size:${schoolSizePx}px;line-height:1.18;max-width:390px;overflow:hidden}.arabic{margin-top:5px;color:#eac66c;font-family:serif;font-size:13px;line-height:1}
.badge{position:absolute;right:25px;top:66px;z-index:5;background:#08704f;color:#fff;border:1px solid rgba(255,255,255,.6);border-radius:14px;padding:8px 17px;font-size:10px;font-weight:900;letter-spacing:1px}
.front-body{position:relative;height:238px;padding:18px 22px;display:grid;grid-template-columns:150px minmax(0,1fr) 96px;gap:15px}.photo{width:150px;height:154px;border:3px solid #dcb65a;border-radius:16px;object-fit:cover;background:#e9efeb}.photo-fallback{display:grid;place-items:center;color:#286054;font-size:42px;font-weight:900}.label{font-size:10px;line-height:1.1;letter-spacing:2px;color:#6f817b;font-weight:900;margin:2px 0 7px}.name{font-size:${nameSizePx}px;line-height:1.05;color:#073f34;font-weight:900;letter-spacing:.1px;white-space:nowrap;overflow:visible}.type{display:inline-flex;margin-top:10px;background:#e8bd5c;color:#19392f;border-radius:999px;padding:7px 15px;font-size:9.5px;font-weight:900;letter-spacing:1px}.qr-col{text-align:center}.qr{width:90px;height:90px;padding:4px;border:1px solid #d2ded8;border-radius:12px;background:#fff;display:block;margin:0 auto}.scan{font-size:7px;line-height:1.35;font-weight:900;color:#60766e;margin-top:7px}
.info-row{position:absolute;left:22px;right:22px;bottom:45px;display:grid;grid-template-columns:1fr 1fr 1.65fr;gap:8px}.info{min-width:0;background:#eef4f0;border:1px solid #c9dcd4;border-radius:10px;padding:7px 9px}.info span{display:block;font-size:7px;letter-spacing:1px;color:#6d8179;font-weight:900}.info strong{display:block;margin-top:3px;color:#17493e;font-size:9.5px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:clip}.admission{position:absolute;left:22px;bottom:10px;width:54%;height:29px;border:1px solid #d1dfd9;border-radius:9px;background:#fff;padding:5px 9px}.admission span{display:block;font-size:6.5px;letter-spacing:1px;color:#72837d;font-weight:900}.admission strong{display:block;margin-top:2px;color:#0b463a;font-size:${primarySize}mm;line-height:1;white-space:nowrap;overflow:hidden}.school-id{position:absolute;right:22px;bottom:18px;font-size:9px;font-weight:900;color:#0b463a;white-space:nowrap}.school-id span{font-size:7px;color:#71827c;margin-right:4px}
.back{background:#fbfcfa;border:1px solid #d4aa4e;padding:26px;color:#123b32}.back:before{content:"";position:absolute;inset:10px;border:1px solid #c8d9d2;border-radius:17px;pointer-events:none}.back:after{content:"";position:absolute;left:-30px;right:-30px;bottom:-74px;height:112px;background:#075646;border-top:3px solid #d7b65c;border-radius:50% 50% 0 0/70% 70% 0 0;pointer-events:none}.back-content{position:relative;height:100%;z-index:2}.back-brand{font-family:Georgia,serif;font-size:29px;line-height:1;color:#06483b;font-weight:900}.tagline{font-size:17px;line-height:1.15;font-weight:850;color:#174d42;margin-top:6px;max-width:350px}.rule{width:205px;border-top:1px solid #c9d8d2;margin:13px 0 12px}.statement{font-size:10.5px;line-height:1.48;color:#31564c;max-width:330px;margin:0}.expiry{display:inline-flex;margin-top:13px;border:1px solid #d2aa51;border-radius:999px;padding:7px 11px;background:#fffdf5;color:#075646;font-size:9px;font-weight:900}.back-qr{position:absolute;right:10px;top:7px;width:94px;height:94px;padding:4px;background:#fff;border:1px solid #d3dfda;border-radius:11px}.back-scan{position:absolute;right:6px;top:105px;width:102px;text-align:center;font-size:7px;line-height:1.3;color:#60756d;font-weight:900}.lower{position:absolute;left:0;right:0;bottom:2px;display:grid;grid-template-columns:1fr 150px;gap:20px;align-items:end}.signature{display:block;width:150px;height:45px;object-fit:contain;object-position:left bottom;margin-bottom:2px}.signature-empty{border-bottom:1px solid #caa650}.director-name{font-size:10px;font-weight:900;color:#123b32}.director-label{font-size:7.5px;letter-spacing:1px;color:#5f766e;font-weight:900;margin-top:2px}.contact{margin-top:7px;font-size:8.5px;color:#31564c;font-weight:800}.contact b{color:#075646}.back-mark{font-size:8px;letter-spacing:1.5px;color:#0b5949;font-weight:900;position:absolute;left:0;top:0;transform:translateY(-1px)}
@media print{body{background:#fff}.sheet{padding:0;gap:7mm}.card{width:85.6mm;height:54mm;border-radius:3.2mm;box-shadow:none}.front-head{height:16.2mm;padding:2.5mm 3.3mm;gap:2.2mm}.logo{width:10.8mm;height:10.8mm;flex-basis:10.8mm;border-radius:2.5mm;padding:.7mm}.brand-mark{font-size:5mm}.school-name{font-size:${Math.max(1.45,schoolSize*0.264583)}mm;max-width:62mm;margin-top:1mm;line-height:1.15}.arabic{font-size:2mm;margin-top:.7mm}.badge{right:3.4mm;top:10.4mm;padding:1.25mm 2.7mm;font-size:1.55mm;border-radius:2mm}.front-body{height:37.8mm;padding:2.8mm 3.4mm;grid-template-columns:23.8mm minmax(0,1fr) 14.8mm;gap:2.4mm}.photo{width:23.8mm;height:24.5mm;border-radius:2.7mm}.photo-fallback{font-size:6.8mm}.label{font-size:1.45mm;letter-spacing:.4mm;margin:.35mm 0 1mm}.name{font-size:${nameSize}mm;line-height:1.05}.type{margin-top:1.8mm;padding:1.25mm 2.7mm;font-size:1.5mm}.qr{width:14mm;height:14mm;padding:.65mm;border-radius:2mm}.scan{font-size:1.15mm;margin-top:1mm}.info-row{left:3.4mm;right:3.4mm;bottom:7.1mm;grid-template-columns:1fr 1fr 1.65fr;gap:1.25mm}.info{padding:1.15mm 1.4mm;border-radius:1.7mm}.info span{font-size:1.05mm;letter-spacing:.16mm}.info strong{font-size:1.55mm;margin-top:.45mm}.admission{left:3.4mm;bottom:1.7mm;width:54%;height:6.1mm;padding:1mm 1.4mm;border-radius:1.7mm}.admission span{font-size:1.05mm;letter-spacing:.16mm}.admission strong{font-size:${Math.max(1.45,primarySize)}mm;margin-top:.35mm}.school-id{right:3.4mm;bottom:2.2mm;font-size:1.5mm}.school-id span{font-size:1.15mm;margin-right:.7mm}.back{padding:4.2mm}.back:before{inset:1.6mm;border-radius:2.7mm}.back:after{height:18mm;bottom:-12mm}.back-brand{font-size:4.6mm}.tagline{font-size:2.35mm;max-width:61mm;margin-top:1mm}.rule{width:32mm;margin:2.2mm 0 2mm}.statement{font-size:1.7mm;line-height:1.5;max-width:57mm}.expiry{margin-top:2mm;padding:1.2mm 1.7mm;font-size:1.45mm}.back-qr{right:1.7mm;top:1.2mm;width:14.5mm;height:14.5mm;padding:.65mm;border-radius:1.8mm}.back-scan{right:1.3mm;top:17.2mm;width:15.5mm;font-size:1.15mm}.lower{bottom:0;grid-template-columns:1fr 38mm;gap:4mm}.signature{width:26mm;height:8mm}.director-name{font-size:1.65mm}.director-label{font-size:1.2mm;letter-spacing:.18mm;margin-top:.35mm}.contact{margin-top:1.4mm;font-size:1.35mm}.back-mark{font-size:1.25mm;letter-spacing:.25mm}}
</style></head><body><div class="sheet">
<section class="card front">
<div class="front-head">${logo}<div class="brand"><div class="brand-mark">${esc(shortName)}</div><div class="school-name">${esc(schoolName)}</div><div class="arabic">مركز عليو ومايمونا لتحفيظ القرآن</div></div><div class="badge">${isStudent ? 'STUDENT ID' : 'STAFF ID'}</div></div>
<div class="front-body"><div>${photo}</div><div><div class="label">${isStudent ? 'STUDENT ID CARD' : 'STAFF ID CARD'}</div><div class="name">${esc(displayName)}</div><div class="type">${isStudent ? 'STUDENT' : 'STAFF'}</div></div><div class="qr-col"><img class="qr" src="${qr}" alt="Verification QR"/><div class="scan">SCAN TO VERIFY<br/>ID &amp; ATTENDANCE</div></div></div>
<div class="info-row"><div class="info"><span>${isStudent ? 'PROGRAM YEAR' : 'POSITION'}</span><strong>${esc(isStudent ? (input.year || '—') : (input.jobTitle || 'QURAN TEACHER'))}</strong></div><div class="info"><span>${isStudent ? 'SECTION' : 'DEPARTMENT'}</span><strong>${esc(departmentOrSection)}</strong></div><div class="info"><span>${isStudent ? 'CLASS' : 'PHONE'}</span><strong style="font-size:${(classSize*3.78).toFixed(2)}px">${esc(classOrPosition)}</strong></div></div>
<div class="admission"><span>${primaryLabel}</span><strong>${esc(primaryValue)}</strong></div><div class="school-id"><span>ID</span>${esc(input.id)}</div>
</section>
<section class="card back"><div class="back-content"><div class="back-mark">${esc(shortName)} · OFFICIAL IDENTIFICATION</div><div class="back-brand">${esc(shortName)}</div><div class="tagline">Trusted Islamic Education<br/>for a Brighter Ummah</div><div class="rule"></div><p class="statement">This card is issued by ${esc(schoolName)} for identification, attendance scanning, school access and approved academic services. If found, please return it to the school office.</p><div class="expiry">VALID UNTIL: ${esc(input.expiry || '—')}</div><img class="back-qr" src="${qr}" alt="Verification QR"/><div class="back-scan">SCAN TO VERIFY</div><div class="lower"><div>${signature}<div class="director-name">${esc(directorName.toLocaleUpperCase())}</div><div class="director-label">DIRECTOR AUTHORISATION</div><div class="contact"><b>CONTACT SCHOOL</b> · ${esc(contactPhone1)} &nbsp;|&nbsp; ${esc(contactPhone2)}</div></div><div></div></div></div></section>
</div><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;

  const w = window.open('', '_blank', 'width=1120,height=720');
  if (!w) throw new Error('Please allow pop-ups to print the ID card.');
  w.document.write(html); w.document.close();
}
