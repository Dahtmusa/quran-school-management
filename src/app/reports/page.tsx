'use client';
import { loadCMSSettings } from '@/lib/cms-live-store';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import { getCurrentProfile, loadEvaluations, loadOperationalTerms, loadStudents, loadParentStudents, loadTermCompletions, completeTerm, loadCurrentAcademicTerm, loadSignaturesForReportCards, type ReportCardSignatures } from '@/lib/live-store';
import { useEffect, useRef, useState } from 'react';
import { label, absoluteProgress, remainingFrom, pageForPosition, juzForPosition, hizbForPosition } from '@/lib/quran';
import QRCode from 'qrcode';

function buildReportCardHTML(s: any, settings: any, termLabel: string, signatures: ReportCardSignatures, qrDataUrl = '') {
  const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const schoolName = settings.school_name?.value || 'ALIYU AND MAIMUNA CENTER FOR QUR\'ANIC MEMORIZATION';
  const shortName = settings.short_name?.value || 'AMQM';
  const address = settings.contact?.address || '';
  const logoUrl = settings.logo_url?.value || '';
  const approved = s.es.filter((e: any) => e.status === 'Approved');
  const avg = approved.length ? Math.round(approved.reduce((n: number, e: any) => n + e.score, 0) / approved.length) : null;
  const status = avg === null ? 'Pending' : avg >= 90 ? 'Excellent' : avg >= 75 ? 'Very Good' : avg >= 60 ? 'Satisfactory' : 'Needs Improvement';
  const absP = absoluteProgress(s.current, s.direction);
  const rem = remainingFrom(s.current, s.direction);
  const juz = juzForPosition(s.current);
  const hizb = hizbForPosition(s.current);
  const mushafPg = pageForPosition(s.current);
  const evals = [1, 2, 3].map(n => {
    const e = s.es.find((x: any) => x.number === n);
    return e && e.status === 'Approved' ? e : null;
  });
  const classSig = s.classId ? signatures.teachers[s.classId] : null;
  const classTeacherName = classSig?.signer_name || s.teacher || null;
  const supervisor = signatures.supervisor;
  const director = signatures.director;
  const dir = s.direction === 'baqarah_to_nas' ? 'Baqarah → Nās' : 'Nās → Baqarah';
  const pct = Math.min(100, Math.max(0, Number(absP.percent) || 0));
  const serial = `${(s.admissionNo || 'N/A').toUpperCase()}/${termLabel.replace(/[\s·]+/g, '-').toUpperCase()}`;
  const printed = new Date().toLocaleDateString('en-NG');

  const gradeClass = avg !== null && avg >= 90 ? 'result-excellent' : avg !== null && avg >= 75 ? 'result-good' : avg !== null && avg >= 60 ? 'result-ok' : 'result-low';

  const evalRows = evals.map((e, i) => e ? `
    <tr>
      <td class="eval-name"><span>0${i + 1}</span> Evaluation ${i + 1}</td>
      <td>${Number(e.memorizedAyahs || 0).toLocaleString()} ayahs</td>
      <td>${Number(e.memorizedPages || 0).toFixed(1)}</td>
      <td>${e.memorization ?? '—'}/5</td>
      <td>${e.accuracy ?? '—'}/5</td>
      <td>${e.fluency ?? '—'}/5</td>
      <td>${e.tajweed ?? '—'}/5</td>
      <td>${e.retention ?? '—'}/5</td>
      <td class="score-cell">${e.score}%</td>
      <td class="grade-cell">${esc(e.grade || '—')}</td>
    </tr>` : `
    <tr class="missing-row">
      <td class="eval-name"><span>0${i + 1}</span> Evaluation ${i + 1}</td>
      <td colspan="7">Not recorded</td><td>—</td><td>—</td>
    </tr>`).join('');

  const signatureBox = (sig: any, fallback: string | null, role: string) => {
    const name = sig?.signer_name || fallback || '—';
    return `<div class="signature-box">
      <div class="signature-stage">${sig?.signature_data ? `<img src="${sig.signature_data}" class="signature-image" alt=""/>` : ''}</div>
      <div class="signature-line"></div>
      <div class="signature-name">${esc(name)}</div>
      <div class="signature-role">${esc(role)}</div>
      <div class="signature-date">Date: __________________</div>
    </div>`;
  };

  const logoHtml = logoUrl ? `<img src="${logoUrl}" class="school-logo" alt="${esc(shortName)}"/>` : `<div class="school-logo-placeholder">AM<br/><span>QM</span></div>`;
  const photoHtml = s.photoUrl
    ? `<img src="${s.photoUrl}" class="student-photo" alt=""/>`
    : `<div class="student-photo-placeholder">${esc((s.name || '?').charAt(0).toUpperCase())}</div>`;
  const qrHtml = qrDataUrl ? `<div class="qr-wrap"><img src="${qrDataUrl}" class="qr" alt="Verification QR"/><div>SCAN TO VERIFY</div></div>` : '';
  const ringCirc = 2 * Math.PI * 29;
  const ringOffset = ringCirc * (1 - pct / 100);

  return `<div class="page">
    <header class="report-header">
      <div class="header-rule"></div>
      <div class="header-main">
        ${logoHtml}
        <div class="school-heading">
          <div class="school-acronym">${esc(shortName)}</div>
          <div class="school-name">${esc(schoolName)}</div>
          <div class="school-address">${esc(address)}</div>
        </div>
        <div class="header-verification">
          <div class="report-badge">TERM REPORT CARD</div>
          ${qrHtml}
        </div>
      </div>
      <div class="header-meta"><span>${esc(termLabel)}</span><span class="meta-dot">•</span><span>OFFICIAL ACADEMIC RECORD</span></div>
    </header>

    <section class="student-card">
      <div class="student-identity">
        ${photoHtml}
        <div class="student-main">
          <div class="field-label">STUDENT NAME</div>
          <div class="student-name">${esc(s.name)}</div>
          <div class="identity-line"><span>Admission No.</span><b>${esc(s.admissionNo?.toUpperCase() || '—')}</b></div>
        </div>
      </div>
      <div class="student-fields">
        <div><span>CLASS</span><b>${esc(s.className || '—')}</b></div>
        <div><span>SECTION</span><b>${esc(s.section || '—')}</b></div>
        <div><span>YEAR</span><b>${esc(s.year || '—')}</b></div>
        <div><span>CLASS TEACHER</span><b>${esc(s.teacher || '—')}</b></div>
        <div><span>TERM</span><b>${esc(termLabel)}</b></div>
        <div><span>ATTENDANCE</span><b>${s.attendance != null ? `${esc(s.attendance)}%` : '—'}</b></div>
      </div>
    </section>

    <section class="section-block academic-block">
      <div class="section-head"><span class="section-icon">01</span><span>ACADEMIC PERFORMANCE</span><em>Evaluation trail</em></div>
      <div class="academic-body">
        <table class="evaluation-table">
          <thead><tr><th>ASSESSMENT</th><th>AYAHS</th><th>PAGES</th><th>MEM<br><small>/5</small></th><th>ACC<br><small>/5</small></th><th>FLU<br><small>/5</small></th><th>TAJ<br><small>/5</small></th><th>RET<br><small>/5</small></th><th>SCORE</th><th>GRADE</th></tr></thead>
          <tbody>${evalRows}</tbody>
        </table>
        <aside class="average-card">
          <div class="average-label">TERM AVERAGE</div>
          <div class="average-score">${avg !== null ? `${avg}%` : '—'}</div>
          <div class="average-status ${gradeClass}">${esc(status)}</div>
          <div class="average-count">${approved.length} of 3 evaluations</div>
        </aside>
      </div>
    </section>

    <section class="section-block hifz-block">
      <div class="section-head dark"><span class="section-icon">02</span><span>QUR'AN MEMORIZATION JOURNEY</span><em>${esc(dir)}</em></div>
      <div class="hifz-main">
        <div class="progress-ring">
          <svg viewBox="0 0 72 72" aria-hidden="true">
            <circle cx="36" cy="36" r="29" fill="none" stroke="#dce9e3" stroke-width="6"/>
            <circle cx="36" cy="36" r="29" fill="none" stroke="#16745f" stroke-width="6" stroke-linecap="round" stroke-dasharray="${ringCirc.toFixed(2)}" stroke-dashoffset="${ringOffset.toFixed(2)}" transform="rotate(-90 36 36)"/>
          </svg>
          <div class="ring-center"><strong>${pct.toFixed(1)}%</strong><span>QUR'AN<br/>COMPLETED</span></div>
        </div>
        <div class="journey-copy">
          <div class="journey-kicker">CURRENT POSITION</div>
          <div class="journey-position">${esc(label(s.current))}</div>
          <div class="journey-details">Started: <b>${esc(label(s.start))}</b> &nbsp;·&nbsp; Direction: <b>${esc(dir)}</b></div>
          <div class="journey-details">Teacher: <b>${esc(s.teacher || '—')}</b></div>
          <div class="progress-track"><span style="width:${pct}%"></span></div>
          <div class="progress-meta"><b>${absP.hizbs} / 60 Hizb</b><span>${rem.ayahs.toLocaleString()} ayahs remaining</span></div>
        </div>
        <div class="journey-highlight"><svg class="book-mark" viewBox="0 0 48 32" aria-hidden="true"><path d="M4 5c7-3 13-2 20 2v20c-7-4-13-5-20-2z"/><path d="M44 5c-7-3-13-2-20 2v20c7-4 13-5 20-2z"/><path d="M24 7v20"/></svg><div>HIFZ<br/>PROGRESS</div><strong>${absP.ayahs.toLocaleString()}</strong><span>ayahs memorized</span></div>
      </div>
      <div class="stats-grid">
        <div class="stat memorized"><span>AYAHS MEMORIZED</span><strong>${absP.ayahs.toLocaleString()}</strong></div>
        <div class="stat memorized"><span>PAGES MEMORIZED</span><strong>${absP.pages}</strong></div>
        <div class="stat memorized"><span>HIZB MEMORIZED</span><strong>${absP.hizbs}<small>/ 60</small></strong></div>
        <div class="stat memorized"><span>MUSHAF PAGE</span><strong>${mushafPg}<small>/ 604</small></strong></div>
        <div class="stat remaining"><span>AYAHS REMAINING</span><strong>${rem.ayahs.toLocaleString()}</strong></div>
        <div class="stat remaining"><span>PAGES REMAINING</span><strong>${rem.pages}</strong></div>
        <div class="stat remaining"><span>HIZBS REMAINING</span><strong>${rem.hizbs}<small>/ 60</small></strong></div>
        <div class="stat remaining"><span>CURRENT JUZ / HIZB</span><strong>${juz} / ${hizb}</strong></div>
      </div>
    </section>

    <section class="result-panel">
      <div><span class="result-kicker">FINAL TERM RESULT</span><strong class="result-title">${esc(status)}</strong><small>${approved.length} approved evaluations · ${esc(termLabel)} · ${esc(s.year || '—')}</small></div>
      <div class="result-score"><strong>${avg !== null ? `${avg}%` : '—'}</strong><span>TERM AVERAGE</span></div>
      <div class="result-attendance"><span>ATTENDANCE</span><strong>${s.attendance != null ? `${esc(s.attendance)}%` : '—'}</strong></div>
    </section>

    <section class="approval-block">
      <div class="section-head"><span class="section-icon">03</span><span>OFFICIAL APPROVAL</span><em>Authorized school officials</em></div>
      <div class="signature-grid">
        ${signatureBox(classSig, classTeacherName, 'CLASS TEACHER')}
        ${signatureBox(supervisor, null, 'SCHOOL SUPERVISOR')}
        ${signatureBox(director, null, 'SCHOOL DIRECTOR')}
      </div>
    </section>

    <footer class="report-footer">
      <div><b>Serial:</b> ${esc(serial)}</div>
      <div>Only approved evaluations constitute official academic records.</div>
      <div><b>Printed:</b> ${esc(printed)}</div>
    </footer>
  </div>`;
}

const PRINT_CSS = `
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;padding:0;background:#fff;font-family:Arial,'Segoe UI',sans-serif;color:#18312c;line-height:1.25}
  @page{size:A4 portrait;margin:0}
  .page{width:210mm;height:297mm;padding:7.5mm 9mm 6.5mm;background:#fff;display:flex;flex-direction:column;gap:3.2mm;overflow:hidden;page-break-after:always;break-after:page;position:relative}
  .page:before{content:"";position:absolute;inset:3.5mm;border:0.35mm solid #d7bf78;pointer-events:none}
  .page:after{content:"";position:absolute;left:4mm;right:4mm;bottom:4mm;height:1.2mm;background:linear-gradient(90deg,#0b4b3e,#c59a3a,#0b4b3e);opacity:.95;pointer-events:none}
  .report-header{height:31mm;flex:0 0 31mm;position:relative;z-index:1;padding:0 2mm;display:flex;flex-direction:column;justify-content:center}
  .header-rule{height:1.2mm;background:linear-gradient(90deg,#0b4b3e 0 74%,#c59a3a 74%);margin-bottom:2.2mm}
  .header-main{display:grid;grid-template-columns:25mm 1fr 31mm;gap:4mm;align-items:center}
  .school-logo,.school-logo-placeholder{width:21mm;height:21mm;object-fit:contain;border-radius:50%;border:.5mm solid #d7bf78;background:#fff;display:flex;align-items:center;justify-content:center;text-align:center;color:#0b4b3e;font-weight:900;font-size:10px;line-height:.9}
  .school-logo-placeholder span{font-size:8px}
  .school-heading{min-width:0;text-align:center}
  .school-acronym{font-size:8px;font-weight:800;letter-spacing:.32em;color:#b0862c;margin-left:.32em}
  .school-name{font-family:Georgia,'Times New Roman',serif;font-size:14.5px;line-height:1.05;font-weight:700;color:#0a4036;text-transform:uppercase;margin-top:.8mm}
  .school-address{font-size:6.2px;color:#66736e;margin-top:1.1mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .header-verification{display:flex;flex-direction:column;align-items:center;gap:1.3mm}
  .report-badge{background:#0b4b3e;color:#fff;border:.45mm solid #c59a3a;padding:1.7mm 2.2mm;border-radius:2mm;font-family:Georgia,serif;font-size:6.8px;font-weight:700;letter-spacing:.08em;text-align:center;white-space:nowrap}
  .qr-wrap{text-align:center;color:#63716d;font-size:5px;font-weight:700;letter-spacing:.08em}
  .qr{width:17mm;height:17mm;display:block;margin:auto;border:.3mm solid #d7dfdc}
  .header-meta{border-top:.3mm solid #d7dfdc;margin-top:2mm;padding-top:1.2mm;display:flex;justify-content:center;gap:2mm;font-size:5.8px;font-weight:700;letter-spacing:.1em;color:#71807a;text-transform:uppercase}
  .meta-dot{color:#c59a3a}

  .student-card{height:27mm;flex:0 0 27mm;display:grid;grid-template-columns:67mm 1fr;border:.35mm solid #cbd9d3;border-radius:2.2mm;background:#fbfcfb;overflow:hidden;z-index:1}
  .student-identity{display:flex;align-items:center;gap:3mm;padding:3mm 4mm;border-right:.35mm solid #d7e1dd;background:#f6faf7}
  .student-photo,.student-photo-placeholder{width:18mm;height:18mm;border-radius:1.8mm;object-fit:cover;border:.35mm solid #b7c8c0;flex:0 0 18mm}
  .student-photo-placeholder{display:flex;align-items:center;justify-content:center;background:#e2ece7;color:#0b4b3e;font-size:17px;font-weight:900}
  .field-label{font-size:5.5px;letter-spacing:.12em;color:#7b8984;font-weight:800}
  .student-name{font-family:Georgia,'Times New Roman',serif;font-size:12px;font-weight:700;color:#0b3d35;line-height:1.05;margin-top:1mm}
  .identity-line{display:flex;gap:1.2mm;margin-top:1.5mm;font-size:5.8px;color:#78857f}.identity-line b{color:#233b35}
  .student-fields{display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:1fr}
  .student-fields>div{padding:2.1mm 3mm;border-bottom:.25mm solid #e0e7e4;border-left:.25mm solid #e0e7e4;display:flex;flex-direction:column;justify-content:center}
  .student-fields>div:nth-last-child(-n+3){border-bottom:0}
  .student-fields span{font-size:5px;letter-spacing:.11em;color:#7a8983;font-weight:800}.student-fields b{font-size:6.5px;color:#203a34;margin-top:.8mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  .section-block,.approval-block{z-index:1;min-height:0}
  .academic-block{height:47mm;flex:0 0 47mm}
  .section-head{height:8mm;display:flex;align-items:center;gap:2.2mm;background:#0b4b3e;color:#fff;border-radius:1.8mm 1.8mm 0 0;padding:0 3.2mm;font-family:Georgia,'Times New Roman',serif;font-size:9px;font-weight:700;letter-spacing:.05em}
  .section-head.dark{background:#0b4b3e}.section-head em{margin-left:auto;font-family:Arial,sans-serif;font-style:normal;font-size:5.8px;font-weight:600;letter-spacing:.06em;color:#dcefe7;text-transform:uppercase}
  .section-icon{display:inline-flex;width:5.2mm;height:5.2mm;border:.35mm solid #c59a3a;border-radius:50%;align-items:center;justify-content:center;color:#f0d58d;font-family:Arial,sans-serif;font-size:5px;letter-spacing:0}
  .academic-body{height:39mm;display:grid;grid-template-columns:1fr 28mm;gap:2.5mm;padding:2.2mm;border:.35mm solid #ccd9d4;border-top:0;border-radius:0 0 1.8mm 1.8mm;background:#fff}
  .evaluation-table{width:100%;height:34.5mm;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:5.6px;color:#344640;overflow:hidden;border:.25mm solid #d4dfdb;border-radius:1.2mm}
  .evaluation-table th{background:#eef4f1;color:#52645d;font-size:4.8px;line-height:1.05;letter-spacing:.05em;padding:1.3mm .5mm;border-right:.2mm solid #d6e0dc;border-bottom:.3mm solid #c7d5d0;text-align:center}
  .evaluation-table th:first-child{width:27mm;text-align:left;padding-left:1.7mm}.evaluation-table th:nth-child(2){width:14mm}.evaluation-table th:nth-child(3){width:10mm}.evaluation-table th:nth-child(n+4):nth-child(-n+8){width:8mm}.evaluation-table th:nth-child(9){width:12mm}.evaluation-table th:nth-child(10){width:11mm}
  .evaluation-table th small{font-size:4px;font-weight:400}.evaluation-table td{padding:1.25mm .45mm;border-right:.2mm solid #e0e7e4;border-bottom:.2mm solid #e0e7e4;text-align:center;vertical-align:middle}.evaluation-table tr:last-child td{border-bottom:0}.evaluation-table td:last-child,.evaluation-table th:last-child{border-right:0}
  .evaluation-table tbody tr:nth-child(even){background:#fbfdfc}.evaluation-table .eval-name{text-align:left;padding-left:1.5mm;font-weight:700;color:#183d34}.eval-name span{display:inline-flex;align-items:center;justify-content:center;width:5mm;height:4.5mm;background:#e3f0ea;color:#0b5a48;border-radius:1mm;font-size:4.5px;margin-right:1mm}
  .score-cell{font-weight:900;color:#0b5a48;font-size:6.4px}.grade-cell{font-weight:900;color:#8a6b24;font-size:6.4px}.missing-row{color:#9aa7a2}
  .average-card{height:34.5mm;border:.35mm solid #a8c8ba;border-radius:2mm;background:linear-gradient(180deg,#f0f8f3,#fbfdfb);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2mm}
  .average-label{font-size:5.2px;font-weight:800;letter-spacing:.12em;color:#65766e}.average-score{font-family:Georgia,serif;font-size:23px;line-height:1;color:#0b4b3e;font-weight:700;margin:2.5mm 0 1.5mm}.average-status{font-size:6.5px;font-weight:800;padding:1.3mm 2.5mm;border-radius:1.2mm;width:100%}.result-excellent{background:#d9f1e3;color:#0b5a48}.result-good{background:#e4effb;color:#1f557a}.result-ok{background:#fff2d3;color:#8a6418}.result-low{background:#fde5e5;color:#9b3333}.average-count{font-size:5.2px;color:#7a8983;margin-top:2mm}

  .hifz-block{height:70mm;flex:0 0 70mm}.hifz-main{height:40mm;display:grid;grid-template-columns:28mm 1fr 31mm;gap:3mm;align-items:center;padding:3mm 4mm;border:.35mm solid #b9cfc5;border-top:0;background:#f8fbf9}
  .progress-ring{position:relative;width:27mm;height:27mm;display:flex;align-items:center;justify-content:center}.progress-ring svg{position:absolute;inset:0;width:100%;height:100%}.ring-center{text-align:center;position:relative;z-index:1}.ring-center strong{display:block;font-family:Georgia,serif;font-size:13px;color:#0b4b3e;line-height:1}.ring-center span{display:block;font-size:4.5px;line-height:1.25;color:#71807a;font-weight:800;letter-spacing:.04em;margin-top:1mm}
  .journey-copy{min-width:0}.journey-kicker{font-size:5.3px;color:#9a762b;letter-spacing:.13em;font-weight:800}.journey-position{font-family:Georgia,serif;font-size:15px;color:#0a4036;font-weight:700;margin:.8mm 0 1.3mm}.journey-details{font-size:6.2px;color:#63736c;margin-top:.6mm}.journey-details b{color:#2b443d}.progress-track{height:2.5mm;background:#dfe9e4;border-radius:2mm;overflow:hidden;margin-top:2.2mm}.progress-track span{display:block;height:100%;background:linear-gradient(90deg,#0f7059,#c49a3b);border-radius:2mm}.progress-meta{display:flex;justify-content:space-between;margin-top:1.1mm;font-size:5.5px;color:#72807b}.progress-meta b{color:#0b5a48}.book-mark{width:10mm;height:7mm;margin-bottom:1mm;fill:none;stroke:#9a762b;stroke-width:1.5}.journey-highlight{height:25mm;border:.35mm solid #d7bf78;border-radius:1.8mm;background:#fffdf6;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#75602e}.journey-highlight div{font-size:5px;font-weight:800;letter-spacing:.13em;line-height:1.2}.journey-highlight strong{font-family:Georgia,serif;font-size:17px;color:#0b4b3e;line-height:1;margin:1mm 0}.journey-highlight span{font-size:5.2px;color:#7b8075}
  .stats-grid{height:30mm;display:grid;grid-template-columns:repeat(8,1fr);border:0;border-left:.35mm solid #ccd9d4;border-right:.35mm solid #ccd9d4;border-bottom:.35mm solid #ccd9d4;border-radius:0 0 1.8mm 1.8mm;overflow:hidden}.stat{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:1.3mm .7mm;border-right:.25mm solid #d7e0dc}.stat:last-child{border-right:0}.stat.memorized{background:#f2f8f5}.stat.remaining{background:#fffaf0}.stat span{font-size:4.7px;line-height:1.15;letter-spacing:.04em;font-weight:800;color:#708079}.stat.memorized span{color:#0d6b55}.stat.remaining span{color:#9a772b}.stat strong{font-family:Georgia,serif;font-size:13px;line-height:1;margin-top:1.6mm;color:#0b4b3e}.stat.remaining strong{color:#735b24}.stat small{font-family:Arial,sans-serif;font-size:5px;font-weight:700;color:#8c9993;margin-left:.6mm}

  .result-panel{height:28mm;flex:0 0 28mm;display:grid;grid-template-columns:1fr 38mm 34mm;align-items:stretch;border:.35mm solid #bca25d;border-radius:2mm;background:#fbf8ed;overflow:hidden;z-index:1}.result-panel>div{padding:3mm 4mm;display:flex;flex-direction:column;justify-content:center}.result-panel>div+div{border-left:.3mm solid #d8cda9;align-items:center;text-align:center}.result-kicker{font-size:5.2px;letter-spacing:.13em;color:#88703a;font-weight:800}.result-title{font-family:Georgia,serif;font-size:15px;color:#0b4b3e;margin-top:1mm}.result-panel small{font-size:5.4px;color:#75817c;margin-top:1mm}.result-score strong{font-family:Georgia,serif;font-size:22px;line-height:1;color:#0b4b3e}.result-score span,.result-attendance span{font-size:5px;font-weight:800;letter-spacing:.1em;color:#7a7668;margin-top:1mm}.result-attendance strong{font-family:Georgia,serif;font-size:17px;color:#0b4b3e;margin-top:1mm}

  .approval-block{height:39mm;flex:0 0 39mm}.signature-grid{height:31mm;display:grid;grid-template-columns:repeat(3,1fr);border:.35mm solid #ccd9d4;border-top:0;border-radius:0 0 1.8mm 1.8mm;overflow:hidden;background:#fff}.signature-box{padding:2.5mm 4mm;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;text-align:center}.signature-box+ .signature-box{border-left:.3mm solid #d5dfdb}.signature-stage{height:8.5mm;width:100%;display:flex;align-items:flex-end;justify-content:center}.signature-image{max-width:38mm;max-height:8mm;object-fit:contain}.signature-line{width:80%;border-bottom:.3mm solid #80918a;height:1mm}.signature-name{font-size:6.3px;font-weight:800;color:#153b32;margin-top:1.1mm;min-height:2.8mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}.signature-role{font-size:5.1px;letter-spacing:.1em;color:#527168;font-weight:800;margin-top:.5mm}.signature-date{font-size:5.1px;color:#8a9691;margin-top:1.3mm}
  .report-footer{height:7mm;flex:0 0 7mm;display:grid;grid-template-columns:1.1fr 1.8fr .7fr;align-items:center;border-top:.3mm solid #d1dcd7;padding:1.5mm 1mm 0;z-index:2;font-size:5px;color:#6d7b76}.report-footer div:nth-child(2){text-align:center}.report-footer div:last-child{text-align:right}.report-footer b{color:#38564d}
  @media print{body{background:#fff}.page{margin:0}.report-footer{break-inside:avoid}.section-block,.approval-block,.result-panel,.student-card{break-inside:avoid}}
`;

function buildFullPageHTML(title: string, bodyHTML: string, autoPrint = false): string {
  const printScript = autoPrint
    ? `<script>window.onload=function(){window.focus();setTimeout(function(){window.print();},700);};<\/script>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${PRINT_CSS}</style></head><body>${bodyHTML}${printScript}</body></html>`;
}

function openPrintWindow(title: string, bodyHTML: string) {
  const html = buildFullPageHTML(title, bodyHTML, true);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) { alert('Allow pop-ups for this site to print report cards.'); URL.revokeObjectURL(url); return; }
  w.addEventListener('afterprint', () => URL.revokeObjectURL(url));
}

async function bulkPrintReportCards(students: any[], term: any, terms: any[], settings: any, signatures: ReportCardSignatures = { teachers: {}, supervisor: null, director: null }) {
  const readyStudents = students.filter(s => s.ready);
  if (!readyStudents.length) { alert('No students have all 3 evaluations approved yet.'); return; }
  const termLabel = `${term?.academic_years?.name || ''} · ${term?.name || ''}`;
  const qrUrls = await Promise.all(readyStudents.map(s => {
    const approved = s.es.filter((e: any) => e.status === 'Approved');
    const avg = approved.length ? Math.round(approved.reduce((n: number, e: any) => n + e.score, 0) / approved.length) : null;
    const statusText = avg !== null ? `Term Average: ${avg}%` : 'Evaluations incomplete';
    return QRCode.toDataURL(
      `AMQM STUDENT RECORD\nADMISSION NO: ${s.admissionNo}\nNAME: ${s.name}\nTERM: ${termLabel}\n${statusText}`,
      { width: 132, margin: 1, color: { dark: '#062d2a', light: '#ffffff' } }
    ).catch(() => '');
  }));
  const pages = readyStudents.map((s, i) => buildReportCardHTML(s, settings, termLabel, signatures, qrUrls[i]));
  openPrintWindow(`Bulk Report Cards · ${termLabel}`, pages.join(''));
}

export default function Reports(){
 const [settings,setSettings]=useState<any>({});
 const [students,setStudents]=useState<any[]>([]);
 const [evals,setEvals]=useState<any[]>([]);
 const [terms,setTerms]=useState<any[]>([]);
 const [completed,setCompleted]=useState<any[]>([]);
 const [termId,setTermId]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [selected,setSelected]=useState<any|null>(null);
 const [role,setRole]=useState('');
 const [classFilter,setClassFilter]=useState('');
 const [signatures,setSignatures]=useState<ReportCardSignatures>({teachers:{},supervisor:null,director:null});

 const refresh=async()=>{
   const p=await getCurrentProfile();
   const [s,e,t,c,st,cur]=await Promise.all([p?.role==='parent'?loadParentStudents():loadStudents(),loadEvaluations(),loadOperationalTerms(),loadTermCompletions(),loadCMSSettings(),loadCurrentAcademicTerm()]);
   setRole(p?.role||'');setStudents(s);setEvals(e);setTerms(t);setCompleted(c);setSettings(st);
   if(!termId)setTermId(cur?.term_id||t[0]?.id||'');
 };
 useEffect(()=>{refresh()},[]);
 useEffect(()=>{loadSignaturesForReportCards().then(setSignatures);},[]);

 const term=terms.find(t=>t.id===termId);
 const termName=term?.name||'Term';
 const rows=students.map(s=>{
   const es=evals.filter(e=>e.studentId===s.id&&e.term===termName);
   return {...s,es,approved:es.filter(e=>e.status==='Approved').length,ready:es.filter(e=>e.status==='Approved').length===3};
 });
 const classNames=[...new Set(rows.map(r=>r.className||'Unassigned'))].sort();
 const filtered=classFilter?rows.filter(r=>(r.className||'Unassigned')===classFilter):rows;
 const ready=filtered.filter(s=>s.ready);
 const isComplete=completed.some(c=>c.term_id===termId);

 async function markComplete(){
   if(!termId)return;
   if(!confirm(`Complete ${termName}? All active students must have 3 approved evaluations.`))return;
   setBusy(true);
   try{const r:any=await completeTerm(termId);setMessage(`Term completed. ${r?.report_cards_generated||0} report cards finalized and ${r?.next_term_invoices_generated||0} next-term invoices generated.`);await refresh()}
   catch(e:any){setMessage(e?.message||'Term cannot be completed yet.')}
   finally{setBusy(false)}
 }

 return <AdminShell title="Report Cards"><div className="space-y-6">
  <section className="rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-[#9d7621] p-6 text-white shadow-xl md:p-8">
    <div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">Official academic records</div>
    <h2 className="mt-2 text-3xl font-black md:text-4xl">Beautiful reports, generated from approved evidence.</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/80">Evaluation 1, 2 and 3 remain visible as a complete term trail. Once Admin completes the term, each student receives a finalized report card.</p>
  </section>
  {message&&<div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{message}</div>}
  <section className="card p-5"><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div className="flex flex-1 flex-col gap-3 sm:flex-row">
      <label className="block flex-1 text-xs font-black uppercase tracking-wide text-slate-500">Operational term<select className="input mt-1" value={termId} onChange={e=>setTermId(e.target.value)}><option value="">Select term</option>{terms.map(t=><option key={t.id} value={t.id}>{t.academic_years?.name||'Academic year'} · {t.name} · {t.starts_on} → {t.ends_on}</option>)}</select></label>
      <label className="block text-xs font-black uppercase tracking-wide text-slate-500">Class<select className="input mt-1" value={classFilter} onChange={e=>setClassFilter(e.target.value)}><option value="">All classes</option>{classNames.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
    </div>
    <div className="flex flex-wrap gap-2 items-center">
      <span className={`pill ${isComplete?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-800'}`}>{isComplete?'Term completed':'Term in progress'}</span>
      {role!=='parent'&&<button className="btn btn-primary" disabled={!termId||busy||isComplete} onClick={markComplete}>{isComplete?'Completed':'Mark term complete'}</button>}
      {ready.length>0&&<button className="btn bg-slate-100 border border-slate-200" onClick={()=>bulkPrintReportCards(filtered,term,terms,settings,signatures)}>Print all reports ({ready.length})</button>}
    </div>
  </div></section>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Students" value={filtered.length}/><Kpi label="Ready for report" value={ready.length}/><Kpi label="Blocked" value={Math.max(0,filtered.length-ready.length)}/><Kpi label="Approved evaluations" value={filtered.reduce((n,s)=>n+s.approved,0)}/></div>
  <section className="card overflow-hidden">
    <div className="border-b p-5"><h2 className="text-xl font-black">Term progress at a glance{classFilter&&<span className="ml-2 text-base font-normal text-slate-400">· {classFilter}</span>}</h2><p className="text-sm text-slate-500">Pending or returned evaluations never become official report-card data.</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm">
      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="p-4">Student</th><th>Class</th><th>Qur'an position</th><th>Eval 1</th><th>Eval 2</th><th>Eval 3</th><th>Report</th><th/></tr></thead>
      <tbody>{filtered.map(s=><tr key={s.id} className="border-t">
        <td className="p-4"><div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-xl bg-slate-100">{s.photoUrl?<img src={s.photoUrl} className="h-full w-full object-cover" alt=""/>:<div className="grid h-full place-items-center font-black text-slate-400">{s.name.charAt(0)}</div>}</div>
          <div><b>{s.name}</b><div className="text-xs text-slate-500">{s.admissionNo}</div></div>
        </div></td>
        <td><div>{s.className||'Unassigned'}</div><SectionBadge section={s.section}/></td>
        <td><b className="text-emerald-800">{label(s.current)}</b><div className="text-xs text-slate-500">{s.year}</div></td>
        {[1,2,3].map(n=>{const e=s.es.find((x:any)=>x.number===n);return <td key={n}>{e?<Status status={e.status} score={e.score}/>:<Status status="Not created"/>}</td>})}
        <td><span className={`pill ${s.ready?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{s.ready?'Finalized':'Blocked'}</span></td>
        <td><button className="btn bg-slate-100" onClick={()=>setSelected(s)}>View report</button></td>
      </tr>)}</tbody>
    </table></div>
  </section>
  {selected&&<ReportPreview student={selected} term={term} settings={settings} close={()=>setSelected(null)} signatures={signatures}/>}
 </div></AdminShell>
}

function Kpi({label,value}:{label:string,value:number}){return <div className="card p-5"><div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-2 text-3xl font-black">{value}</div></div>}
function Status({status,score}:{status:string;score?:number}){const cls=status==='Approved'?'bg-emerald-50 text-emerald-700':status==='Pending Approval'?'bg-amber-50 text-amber-700':status==='Returned'?'bg-rose-50 text-rose-700':'bg-slate-100 text-slate-500';return <span className={`pill ${cls}`}>{status}{score!=null?` · ${score}%`:''}</span>}

function ReportPreview({student,term,settings,close,signatures}:{student:any;term:any;settings:any;close:()=>void;signatures:ReportCardSignatures}){
  const termLabel=`${term?.academic_years?.name||''} · ${term?.name||''}`;
  const iframeRef=useRef<HTMLIFrameElement>(null);
  const [blobUrl,setBlobUrl]=useState('');
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    setLoading(true);
    let url='';
    const approved=student.es.filter((e:any)=>e.status==='Approved');
    const avg=approved.length?Math.round(approved.reduce((s:number,e:any)=>s+e.score,0)/approved.length):null;
    const statusText=avg!==null?`Term Average: ${avg}%`:'Evaluations incomplete';
    QRCode.toDataURL(
      `AMQM STUDENT RECORD\nADMISSION NO: ${student.admissionNo}\nNAME: ${student.name}\nTERM: ${termLabel}\n${statusText}`,
      {width:160,margin:1,color:{dark:'#062d2a',light:'#ffffff'}}
    ).catch(()=>'').then(qr=>{
      const body=buildReportCardHTML(student,settings,termLabel,signatures,qr);
      const html=buildFullPageHTML(`Report Card · ${student.name}`,body);
      const blob=new Blob([html],{type:'text/html;charset=utf-8'});
      url=URL.createObjectURL(blob);
      setBlobUrl(url);
      setLoading(false);
    });
    return ()=>{ if(url) URL.revokeObjectURL(url); };
  },[student.id,term?.id,signatures,settings]);

  const handlePrint=()=>{
    const cw=iframeRef.current?.contentWindow;
    if(!cw){return;}
    cw.focus();
    setTimeout(()=>cw.print(),200);
  };

  return <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 pt-6">
    <div className="w-full max-w-[900px] rounded-3xl bg-white shadow-2xl overflow-hidden mb-6">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-emerald-700">Official Report Card</div>
          <h2 className="text-xl font-black text-slate-900">{student.name}</h2>
        </div>
        <div className="flex gap-2">
          <button className="btn bg-slate-100" onClick={close}>Close</button>
          <button className="btn btn-primary" onClick={handlePrint} disabled={loading}>{loading?'Loading…':'Print report'}</button>
        </div>
      </div>
      <div className="bg-slate-300" style={{overflowY:'auto',maxHeight:'calc(100vh - 120px)',padding:'16px',display:'flex',justifyContent:'center'}}>
        {loading&&<div style={{width:'210mm',height:'297mm',background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8',fontSize:'14px',borderRadius:'4px'}}>Generating report card…</div>}
        {blobUrl&&<iframe
          ref={iframeRef}
          src={blobUrl}
          title={`Report Card · ${student.name}`}
          style={{width:'210mm',height:'297mm',border:'none',display:loading?'none':'block',boxShadow:'0 8px 40px rgba(0,0,0,0.22)',background:'white'}}
          onLoad={()=>setLoading(false)}
        />}
      </div>
    </div>
  </div>;
}
