// Print an admission letter for one successful applicant. Uses the same
// browser Print → Save-as-PDF pattern the report card and receipts already
// use (no new dependencies). The letter body itself comes from a CMS
// template so the admin can rewrite it without touching code.

export type AdmissionLetterInputs = {
  applicant_name: string;
  application_no: string;
  class_name?: string | null;
  section?: string | null;
  parent_name?: string | null;
  starting_surah?: number | null;
  starting_ayah?: number | null;
  screening_score?: number | null;
};

function esc(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] as string));
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) => vars[key] ?? '{' + key + '}');
}

function today(): string {
  return new Date().toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function printAdmissionLetter(
  input: AdmissionLetterInputs,
  admissionSettings: Record<string, any>,
  cmsSettings: Record<string, any>,
) {
  const schoolName = cmsSettings.school_name?.value || 'ALIYU AND MAIMUNA CENTER FOR QUR’ANIC MEMORIZATION';
  const shortName  = cmsSettings.short_name?.value  || 'AMQM';
  const address    = cmsSettings.contact?.address   || '';
  const logoUrl    = cmsSettings.logo_url?.value    || cmsSettings.logo_url             || '';
  const contactPhone = cmsSettings.contact?.phone   || '';
  const contactEmail = cmsSettings.contact?.email   || '';

  const registrationFee = Number(admissionSettings?.registration_fee_ngn || 0);
  const requirements: string[] = Array.isArray(admissionSettings?.requirements)
    ? admissionSettings.requirements.filter((r: any) => typeof r === 'string' && r.trim())
    : [];
  const bodyTemplate: string =
    typeof admissionSettings?.letter_body_template === 'string' && admissionSettings.letter_body_template.trim()
      ? admissionSettings.letter_body_template
      : DEFAULT_BODY;

  const startPos = input.starting_surah
    ? `Surah ${input.starting_surah} : Ayah ${input.starting_ayah || 1}`
    : 'To be confirmed at registration';

  const body = render(bodyTemplate, {
    applicant_name: input.applicant_name,
    parent_name:    input.parent_name || 'Parent / Guardian',
    application_no: input.application_no,
    class_name:     input.class_name || 'To be assigned',
    section:        input.section === 'boarding' ? 'Boarding' : 'Day',
    starting_position: startPos,
    registration_fee: '₦' + registrationFee.toLocaleString('en-NG'),
    school_name:    schoolName,
    short_name:     shortName,
    date:           today(),
    screening_score: input.screening_score != null ? String(input.screening_score) + '%' : '—',
  });

  const refNo = 'ADM/' + input.application_no + '/' + new Date().getFullYear();
  const requirementsHtml = requirements.length ? `
    <div class="req">
      <h3>Registration requirements</h3>
      <ol>${requirements.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
    </div>` : '';

  const w = window.open('', '_blank', 'width=840,height=1180');
  if (!w) { alert('Could not open the print window. Allow pop-ups for this site.'); return; }

  w.document.write(`<!DOCTYPE html><html><head><title>Admission Letter — ${esc(input.applicant_name)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,'Times New Roman',serif;padding:32px 40px;color:#101a17;background:#fff;line-height:1.55;font-size:14px}
    .head{display:flex;align-items:center;gap:18px;border-bottom:3px solid #062d2a;padding-bottom:14px;margin-bottom:20px}
    .head img{height:72px;max-width:200px;object-fit:contain}
    .head .name{font-size:20px;font-weight:800;letter-spacing:-.01em;color:#062d2a}
    .head .sub{font-size:12px;margin-top:2px;color:#4a5a54}
    .head .contact{font-size:11px;color:#5a6a63;margin-top:4px}
    .meta{display:flex;justify-content:space-between;font-size:12px;color:#4a5a54;margin-bottom:20px}
    .badge{display:inline-block;background:#062d2a;color:#fff;padding:4px 12px;border-radius:14px;font-size:11px;font-weight:700;letter-spacing:.14em;font-family:Arial,sans-serif}
    h1{font-size:22px;color:#083f34;margin:22px 0 10px;letter-spacing:.02em}
    p{margin:10px 0}
    .body{white-space:pre-wrap}
    .req{margin-top:22px;padding:14px 18px;border-left:4px solid #b78325;background:#fffbee}
    .req h3{font-size:14px;color:#664e08;margin-bottom:6px}
    .req ol{padding-left:22px;font-size:13px;color:#3a4a44}
    .req li{margin:4px 0}
    .sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px}
    .sign>div{text-align:center;border-top:1px dotted #6a7570;padding-top:6px;font-size:12px;color:#3a4a44}
    .foot{margin-top:32px;padding-top:8px;border-top:1px solid #ddd;font-size:11px;color:#7a8a84;text-align:center}
    @media print{body{padding:16mm 18mm}}
    .noprint button{margin-top:24px;padding:10px 26px;font-weight:800;background:#062d2a;color:#fff;border:0;border-radius:8px;cursor:pointer;font-family:inherit}
    @media print{.noprint{display:none}}
  </style></head><body>
    <div class="head">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="logo">` : ''}
      <div>
        <div class="name">${esc(schoolName)}</div>
        ${address ? `<div class="sub">${esc(address)}</div>` : ''}
        <div class="contact">${contactPhone ? `Tel: ${esc(contactPhone)}` : ''}${contactPhone && contactEmail ? ' · ' : ''}${contactEmail ? `Email: ${esc(contactEmail)}` : ''}</div>
        <div class="badge" style="margin-top:6px">OFFICIAL ADMISSION LETTER</div>
      </div>
    </div>

    <div class="meta">
      <div>Ref: <b>${esc(refNo)}</b></div>
      <div>Date: <b>${esc(today())}</b></div>
    </div>

    <h1>Letter of Admission</h1>
    <div class="body">${esc(body)}</div>

    ${requirementsHtml}

    <div class="sign">
      <div>Principal</div>
      <div>Registrar</div>
    </div>

    <div class="foot">This letter was generated by the ${esc(shortName)} admissions system. Present it on the day of registration.</div>

    <div class="noprint" style="text-align:center">
      <button onclick="window.print()">🖨️ Print / Save as PDF</button>
    </div>
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));</script>
  </body></html>`);
  w.document.close();
}

const DEFAULT_BODY = `Dear {parent_name},

We are pleased to inform you that {applicant_name} (Application No. {application_no}) has been offered admission to {school_name} into the {section} section for the current school session.

Screening score: {screening_score}
Assigned class: {class_name}
Recommended Qur'an starting position: {starting_position}

To secure this offer, please complete registration on or before the date stipulated by the school. The registration fee is {registration_fee}, payable to the school account. Please bring the required documents listed below on the day of registration.

We look forward to welcoming your child to our community of Qur'an memorizers.

Warm regards,
The Admissions Office
{school_name}`;
