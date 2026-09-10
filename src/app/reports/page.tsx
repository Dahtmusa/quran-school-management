'use client';
import { loadCMSSettings } from '@/lib/cms-live-store';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import { getCurrentProfile, loadEvaluations, loadOperationalTerms, loadStudents, loadParentStudents, loadTermCompletions, completeTerm, loadCurrentAcademicTerm, loadSignaturesForReportCards, type ReportCardSignatures } from '@/lib/live-store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { label, absoluteProgress, remainingFrom, pageForPosition, juzForPosition, hizbForPosition } from '@/lib/quran';
import QRCode from 'qrcode';

function buildReportCardHTML(s: any, settings: any, termLabel: string, signatures: ReportCardSignatures, qrDataUrl = '') {
  const schoolName = settings.school_name?.value || 'ALIYU AND MAIMUNA CENTER FOR QUR\'ANIC MEMORIZATION';
  const shortName = settings.short_name?.value || 'AMQM';
  const address = settings.contact?.address || 'OPPOSITE NURUL ISLAM DEMSAWO, JIMETA-YOLA, ADAMAWA STATE, NIGERIA';
  const logoUrl = settings.logo_url?.value || '';
  const approved = s.es.filter((e: any) => e.status === 'Approved');
  const avg = approved.length ? Math.round(approved.reduce((n: number, e: any) => n + e.score, 0) / approved.length) : null;
  const status = avg === null ? '—' : avg >= 90 ? 'Excellent' : avg >= 75 ? 'Very Good' : avg >= 60 ? 'Satisfactory' : 'Needs Improvement';
  const absP = absoluteProgress(s.current, s.direction);
  const rem = remainingFrom(s.current, s.direction);
  const juz = juzForPosition(s.current);
  const hizb = hizbForPosition(s.current);
  const mushafPg = pageForPosition(s.current);
  const evals = [1, 2, 3].map(n => { const e = s.es.find((x: any) => x.number === n); return e && e.status === 'Approved' ? e : null; });
  const classSig = s.classId ? signatures.teachers[s.classId] : null;
  const classTeacherName = classSig?.signer_name || s.teacher || null;
  const supervisor = signatures.supervisor;
  const director = signatures.director;
  const dir = s.direction === 'baqarah_to_nas' ? 'Baqarah → Nās' : 'Nās → Baqarah';
  const pct = Math.min(100, Math.max(0, absP.percent));
  const serial = `${(s.admissionNo || 'N/A').toUpperCase()}/${termLabel.replace(/[\s·]+/g, '-').toUpperCase()}`;
  const printed = new Date().toLocaleDateString('en-NG');
  const academicYear = (termLabel.split(' · ')[0] || termLabel).trim();
  const grade = (e: any) => e?.grade || '—';
  const score = (e: any) => e ? `${e.score}%` : '—';
  const rubric = (e: any, k: string) => e ? `${e[k] ?? 0}/5` : '—';
  const logoHtml = logoUrl ? `<img src="${logoUrl}" class="rc-logo" alt="AMQM logo"/>` : `<div class="rc-logo-fallback">AMQM</div>`;
  const qrHtml = qrDataUrl ? `<div class="rc-qr-wrap"><img src="${qrDataUrl}" class="rc-qr" alt="QR"/><div class="rc-qr-label">SCAN TO VERIFY</div></div>` : '';

  const evalRows = evals.map((e, i) => `<tr>
    <td><span class="rc-eval-no">0${i + 1}</span><strong>Evaluation ${i + 1}</strong></td>
    <td>${e?.memorizedAyahs ? `${Number(e.memorizedAyahs).toLocaleString()} ayahs` : '—'}</td>
    <td>${e ? Number(e.memorizedPages || 0).toFixed(1) : '—'}</td>
    <td>${rubric(e, 'memorization')}</td><td>${rubric(e, 'accuracy')}</td><td>${rubric(e, 'fluency')}</td><td>${rubric(e, 'tajweed')}</td><td>${rubric(e, 'retention')}</td>
    <td class="rc-score">${score(e)}</td><td class="rc-grade">${grade(e)}</td>
  </tr>`).join('');

  const sigBox = (name: string | null, role: string, sig: any, extraClass = '') => `<div class="rc-sign ${extraClass}">
    <div class="rc-sign-name">${name || '&nbsp;'}</div>
    <div class="rc-sign-role">${role}</div>
    <div class="rc-sign-line">${sig?.signature_data ? `<img src="${sig.signature_data}" class="rc-sign-img" alt=""/>` : ''}</div>
    <div class="rc-sign-date">Date: __________________</div>
  </div>`;

  return `<div class="page">
    <header class="rc-header">
      <div class="rc-header-left">
        ${logoHtml}
        <div class="rc-brand-caption"><b>AMQM</b><br/><span>Knowledge · Character · A Brighter Ummah</span></div>
      </div>
      <div class="rc-header-center">
        <div class="rc-acronym">A M Q M</div>
        <div class="rc-school-name">${schoolName}</div>
        <div class="rc-address">${address}</div>
        <div class="rc-motto">Knowledge&nbsp;&nbsp;•&nbsp;&nbsp;Discipline&nbsp;&nbsp;•&nbsp;&nbsp;Qur’an for Life</div>
      </div>
      <div class="rc-header-right">
        <div class="rc-quote-ar">وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ<br/>فَهَلْ مِن مُّدَّكِرٍ</div>
        <div class="rc-quote-en">“And We have certainly made the Qur’an easy for remembrance, so is there anyone who will remember?”</div>
        <div class="rc-quote-ref">(Al-Qamar 54:17)</div>
      </div>
    </header>

    <div class="rc-ribbon">
      <div class="rc-ribbon-title">TERM REPORT CARD</div>
      <div class="rc-ribbon-term">→&nbsp;&nbsp;${academicYear} ACADEMIC YEAR&nbsp;&nbsp;←</div>
    </div>

    <div class="rc-top-grid">
      <section class="rc-student-card">
        <div class="rc-student-photo">
          ${s.photoUrl ? `<img src="${s.photoUrl}" class="rc-photo" alt="${s.name} photo"/>` : `<div class="rc-photo-fallback">${(s.name || 'S').charAt(0).toUpperCase()}</div>`}
        </div>
        <div class="rc-student-main">
          <div class="rc-label">Student Name</div>
          <div class="rc-student-name">${s.name}</div>
          <div class="rc-detail-grid">
            <div><span>Admission No.</span><b>${s.admissionNo?.toUpperCase() || '—'}</b></div>
            <div><span>Class</span><b>${s.className || '—'}</b></div>
            <div><span>Section</span><b>${s.section || '—'}</b></div>
            <div><span>Year</span><b>${s.year || '—'}</b></div>
            <div><span>Term</span><b>${termLabel}</b></div>
            <div><span>Class Teacher</span><b>${s.teacher || '—'}</b></div>
          </div>
        </div>
      </section>
      <section class="rc-attendance">
        <div class="rc-att-title">Attendance</div>
        <div class="rc-att-value">${s.attendance != null ? `${s.attendance}%` : '—'}</div>
        <div class="rc-status">${status}</div>
      </section>
      ${qrHtml}
    </div>

    <section class="rc-section rc-academic">
      <div class="rc-section-head"><span class="rc-section-icon">▣</span><span>ACADEMIC PERFORMANCE</span><em>Consistent Progress&nbsp;&nbsp;•&nbsp;&nbsp;Strong Foundations&nbsp;&nbsp;•&nbsp;&nbsp;Higher Goals</em></div>
      <div class="rc-academic-body">
        <table class="rc-table"><thead><tr>
          <th>ASSESSMENT</th><th>AYAHS<br/>COVERED</th><th>PAGES</th><th>MEMORIZATION<br/>(5)</th><th>ACCURACY<br/>(5)</th><th>FLUENCY<br/>(5)</th><th>TAJWEED<br/>(5)</th><th>RETENTION<br/>(5)</th><th>SCORE</th><th>GRADE</th>
        </tr></thead><tbody>${evalRows}</tbody></table>
        <div class="rc-average"><div class="rc-average-title">TERM AVERAGE</div><div class="rc-average-score">${avg !== null ? `${avg}%` : '—'}</div><div class="rc-average-status">${status}</div><div class="rc-average-sub">${approved.length} of 3 evaluations</div></div>
      </div>
    </section>

    <section class="rc-section rc-hifz">
      <div class="rc-section-head"><span class="rc-section-icon">▥</span><span>QUR’AN MEMORIZATION JOURNEY</span><em>Step by Step&nbsp;&nbsp;•&nbsp;&nbsp;Page by Page&nbsp;&nbsp;•&nbsp;&nbsp;Closer to Allah</em></div>
      <div class="rc-hifz-main">
        <div class="rc-ring-wrap"><svg class="rc-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="ring-bg"/><circle cx="50" cy="50" r="42" class="ring-fill" stroke-dasharray="${(2*Math.PI*42).toFixed(2)}" stroke-dashoffset="${(2*Math.PI*42*(1-pct/100)).toFixed(2)}"/></svg><div class="rc-ring-center"><b>${pct.toFixed(1)}%</b><span>of Qur’an<br/>Completed</span></div></div>
        <div class="rc-hifz-info"><div class="rc-small-cap">CURRENT POSITION</div><div class="rc-position">${label(s.current)}</div><div class="rc-hifz-sub">Started: ${label(s.start)}&nbsp;&nbsp;•&nbsp;&nbsp;${dir}</div><div class="rc-hifz-teacher">Teacher: <b>${s.teacher || '—'}</b></div><div class="rc-progress"><span style="width:${pct}%"></span></div><div class="rc-progress-meta"><b>${absP.hizbs} / 60 Hizb</b><span>${rem.ayahs.toLocaleString()} ayahs left</span></div></div>
        <div class="rc-hifz-art"><div class="rc-book">▱</div><div>A Journey<br/><b>of a Lifetime</b></div></div>
      </div>
      <div class="rc-stats">
        <div><span>AYahs<br/>Memorized</span><b>${absP.ayahs.toLocaleString()}</b></div>
        <div><span>Pages<br/>Memorized</span><b>${absP.pages}</b></div>
        <div><span>Hizb<br/>Memorized</span><b>${absP.hizbs}</b></div>
        <div><span>Mushaf Page</span><b>${mushafPg}</b><small>/ 604</small></div>
        <div class="remaining"><span>Ayahs<br/>Remaining</span><b>${rem.ayahs.toLocaleString()}</b></div>
        <div class="remaining"><span>Pages<br/>Remaining</span><b>${rem.pages}</b></div>
        <div class="remaining"><span>Hizbs<br/>Remaining</span><b>${rem.hizbs}</b></div>
        <div class="remaining"><span>Current<br/>Juz / Hizb</span><b>${juz} / ${hizb}</b></div>
      </div>
    </section>

    <section class="rc-section rc-final">
      <div class="rc-section-head rc-gold-head"><span class="rc-section-icon">♛</span><span>FINAL TERM RESULT</span><em>Discipline Today&nbsp;&nbsp;•&nbsp;&nbsp;Excellence Tomorrow</em></div>
      <div class="rc-final-body">
        <div class="rc-final-col"><div class="rc-final-label">Academic Standing</div><div class="rc-final-badge">${status}</div></div>
        <div class="rc-final-score"><b>${avg !== null ? `${avg}%` : '—'}</b><span>Term Average</span></div>
        <div class="rc-final-details"><div>☑&nbsp; ${approved.length} approved evaluations</div><div>▣&nbsp; ${termLabel}</div><div>◆&nbsp; ${s.year || '—'}</div><div>▥&nbsp; On track for continued progress</div></div><div class="rc-final-att"><span>ATTENDANCE</span><b>${s.attendance != null ? `${s.attendance}%` : '—'}</b></div>
      </div>
    </section>

    <section class="rc-section rc-approval">
      <div class="rc-section-head"><span class="rc-section-icon">♟</span><span>OFFICIAL APPROVAL</span><em>Verified&nbsp;&nbsp;•&nbsp;&nbsp;Approved&nbsp;&nbsp;•&nbsp;&nbsp;Official Record</em></div>
      <div class="rc-sign-grid">
        ${sigBox(classTeacherName, 'CLASS TEACHER', classSig)}
        ${sigBox(supervisor?.signer_name || null, 'SCHOOL SUPERVISOR', supervisor)}
        ${sigBox(director?.signer_name || null, 'SCHOOL DIRECTOR', director)}
      </div>
    </section>

    <div class="rc-footer-band"><span>Qur’an Today&nbsp;&nbsp;•&nbsp;&nbsp;Better Muslims Tomorrow</span><b>رَبِّ زِدْنِي عِلْمًا</b><span>My Lord, increase me in knowledge (Taha 20:114)</span></div>
    <footer class="rc-footer">Serial: ${serial}&nbsp;&nbsp;•&nbsp;&nbsp;Only approved evaluations constitute official academic records&nbsp;&nbsp;•&nbsp;&nbsp;Printed: ${printed}</footer>
  </div>`;
}


const PRINT_CSS = `
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0;background:#fff;font-family:Georgia,'Times New Roman',serif;color:#102a26;line-height:1.25}
@page{size:A4 portrait;margin:0}
.page{width:210mm;height:297mm;padding:6mm 6.5mm 0;display:flex;flex-direction:column;gap:2.4mm;page-break-after:always;break-after:page;overflow:hidden;background:#fffdf8;position:relative}
.page:before{content:"";position:absolute;inset:0;border:1px solid #c8b77a;pointer-events:none;z-index:20}
.page:after{content:"";position:absolute;left:0;right:0;top:0;height:35mm;opacity:.055;background-image:radial-gradient(#0b5b49 1px,transparent 1px);background-size:7px 7px;pointer-events:none}
.rc-header{display:grid;grid-template-columns:48mm 1fr 43mm;align-items:center;gap:3mm;min-height:29mm;position:relative;z-index:2}
.rc-header-left{text-align:center}.rc-logo{width:31mm;height:25mm;object-fit:contain;display:block;margin:0 auto 1mm}.rc-logo-fallback{width:31mm;height:25mm;display:grid;place-items:center;font-size:10px;font-weight:900;color:#0b5b49;margin:auto}.rc-brand-caption{font-size:5.4px;line-height:1.2;color:#0b5b49;letter-spacing:.06em}.rc-brand-caption span{font-size:4.4px;color:#5e6d67;letter-spacing:.02em}
.rc-header-center{text-align:center}.rc-acronym{font-size:27px;line-height:.9;letter-spacing:.28em;font-weight:700;color:#083f34}.rc-school-name{font-size:13.2px;line-height:1.02;font-weight:700;text-transform:uppercase;color:#0a4136;margin-top:1.4mm}.rc-address{font-size:5.8px;color:#52635d;margin-top:1.2mm;text-transform:uppercase}.rc-motto{font-size:7px;margin-top:1.4mm;color:#173f37;letter-spacing:.03em}
.rc-header-right{text-align:center}.rc-quote-ar{font-size:9px;line-height:1.35;font-weight:700;color:#0b5b49}.rc-quote-en{font-family:Georgia,serif;font-size:5.9px;line-height:1.25;margin-top:1mm;color:#243d38}.rc-quote-ref{font-size:5.3px;margin-top:.7mm;color:#80651e}
.rc-ribbon{width:132mm;min-height:18mm;align-self:center;background:#064a3c;color:white;border:1.4mm solid #d2a52e;outline:1px solid #5c4612;border-radius:4mm;text-align:center;padding:2.4mm 7mm 1.7mm;position:relative;z-index:3;box-shadow:0 1mm 0 rgba(0,0,0,.08)}.rc-ribbon:before,.rc-ribbon:after{content:"◆";position:absolute;top:4.6mm;color:#d2a52e;font-size:8px}.rc-ribbon:before{left:4mm}.rc-ribbon:after{right:4mm}.rc-ribbon-title{font-size:19px;line-height:1;font-weight:700;letter-spacing:.05em}.rc-ribbon-term{font-size:7px;letter-spacing:.09em;margin-top:1.2mm;color:#f5e7b6}
.rc-top-grid{display:grid;grid-template-columns:1fr 34mm 25mm;gap:1.5mm;min-height:30mm;align-items:stretch}.rc-student-card,.rc-attendance{border:1px solid #d1c493;border-radius:2.8mm;background:#fffefa}.rc-student-card{display:flex;overflow:hidden}.rc-student-photo{width:28mm;min-width:28mm;padding:2.5mm 0 2.5mm 2.5mm;display:flex;align-items:center;justify-content:center;background:#f7f9f6}.rc-photo{width:24mm;height:27mm;object-fit:cover;object-position:center;border:1px solid #d1c493;border-radius:2mm;display:block}.rc-photo-fallback{width:24mm;height:27mm;display:flex;align-items:center;justify-content:center;border:1px solid #d1c493;border-radius:2mm;background:#eef4ef;color:#0b5b49;font-size:18px;font-weight:700}.rc-student-main{flex:1;padding:2.5mm 4mm 1.8mm}.rc-label,.rc-detail-grid span,.rc-final-label{display:block;font-size:5.8px;color:#60716b}.rc-student-name{font-size:14.5px;font-weight:700;color:#092f29;line-height:1.05;margin:.8mm 0 2.1mm}.rc-detail-grid{display:grid;grid-template-columns:1.2fr 1.1fr .7fr .65fr;gap:0;border-top:1px solid #ded8c4}.rc-detail-grid div{padding:1.5mm 2mm 1mm 0;border-right:1px solid #ded8c4}.rc-detail-grid div:nth-child(4n){border-right:0}.rc-detail-grid div:nth-child(n+5){border-top:1px solid #ded8c4}.rc-detail-grid b{display:block;font-size:6.7px;line-height:1.15;margin-top:.4mm;color:#183b35}.rc-attendance{padding:3mm;text-align:center;display:flex;flex-direction:column;justify-content:center}.rc-att-title{font-size:7px;font-weight:700}.rc-att-value{font-size:19px;font-weight:700;color:#0a4c3d;margin:1mm 0}.rc-status{background:#168447;color:white;border-radius:2mm;padding:1.4mm 2mm;font-size:7.5px;font-weight:700}.rc-qr-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center}.rc-qr{width:21mm;height:21mm;image-rendering:auto}.rc-qr-label{font-family:Arial,sans-serif;font-size:5.4px;margin-top:1mm;color:#31423e;letter-spacing:.06em}
.rc-section{border:1px solid #cdbf8c;border-radius:2.6mm;overflow:hidden;background:#fffefa;flex-shrink:0}.rc-section-head{height:10mm;background:#07513f;color:white;display:flex;align-items:center;padding:0 4mm;font-size:12.5px;font-weight:700;letter-spacing:.035em}.rc-section-head em{margin-left:auto;font-size:6.7px;font-weight:400;font-style:italic;letter-spacing:.01em;color:#f3ecd5}.rc-section-icon{font-family:Arial,sans-serif;font-size:15px;margin-right:2.5mm;color:#f4e6ad}.rc-academic-body{display:grid;grid-template-columns:1fr 44mm;gap:2.5mm;padding:2mm 2.5mm 2.2mm}.rc-table{width:100%;border-collapse:collapse;font-family:Georgia,'Times New Roman',serif;font-size:6.6px}.rc-table th{background:#edf3ef;color:#163c35;font-size:5.6px;line-height:1.05;padding:1.8mm .8mm;border:1px solid #cbd5d0;text-align:center}.rc-table td{padding:2mm .8mm;border:1px solid #d2d9d5;text-align:center;height:8.3mm}.rc-table td:first-child{text-align:left;padding-left:1.5mm;white-space:nowrap}.rc-eval-no{display:inline-grid;place-items:center;width:4mm;height:4mm;border-radius:50%;background:#0b6b54;color:#fff;font-family:Arial,sans-serif;font-size:4.8px;margin-right:1.2mm}.rc-score,.rc-grade{font-weight:700;color:#064b3c}.rc-average{border:1px solid #b9c5bd;border-radius:2.2mm;background:linear-gradient(180deg,#f4f8f3,#fffefa);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2mm}.rc-average-title{font-family:Arial,sans-serif;font-size:6.8px;font-weight:700;letter-spacing:.08em;color:#345149}.rc-average-score{font-size:24px;line-height:1;font-weight:700;color:#075a47;margin:2mm 0 1mm}.rc-average-status{background:#198c4a;color:#fff;border-radius:2mm;padding:1.4mm 5mm;font-size:8px;font-weight:700}.rc-average-sub{font-size:6.2px;color:#4f625c;margin-top:1.4mm}
.rc-hifz{background:#fbfaf2}.rc-hifz .rc-section-head{height:10.5mm}.rc-hifz-main{display:grid;grid-template-columns:31mm 1fr 45mm;gap:3mm;align-items:center;padding:3mm 4mm 2.5mm;background:linear-gradient(90deg,#fbfcf8 0%,#fbfcf8 60%,#f2e7cc 100%)}.rc-ring-wrap{width:28mm;height:28mm;position:relative;margin:auto}.rc-ring{width:28mm;height:28mm;transform:rotate(0deg)}.ring-bg{fill:none;stroke:#d8e2dd;stroke-width:8}.ring-fill{fill:none;stroke:#13905c;stroke-width:8;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%}.rc-ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.rc-ring-center b{font-size:13px;color:#083f34}.rc-ring-center span{font-size:5.3px;line-height:1.25;color:#33534b;text-transform:uppercase}.rc-small-cap{font-family:Arial,sans-serif;font-size:5.8px;letter-spacing:.12em;color:#987324;font-weight:700}.rc-position{font-size:15px;font-weight:700;color:#0a4438;margin:.7mm 0}.rc-hifz-sub,.rc-hifz-teacher{font-size:6.8px;color:#264a42}.rc-hifz-teacher{margin-top:.8mm}.rc-progress{height:3.8mm;background:#dce1df;border-radius:3mm;overflow:hidden;margin-top:2.4mm}.rc-progress span{display:block;height:100%;background:linear-gradient(90deg,#0d8051,#d0a12d);border-radius:3mm}.rc-progress-meta{display:flex;justify-content:space-between;font-size:5.8px;color:#596a64;margin-top:1mm}.rc-hifz-art{height:27mm;border-left:1px solid #d7c89f;display:flex;align-items:center;justify-content:center;gap:2mm;color:#7b6324;font-size:8px;font-style:italic;text-align:center}.rc-book{font-size:36px;color:#a57b1c;line-height:1}.rc-stats{display:grid;grid-template-columns:repeat(8,1fr);border-top:1px solid #cfc9b1;background:#fffefa}.rc-stats>div{min-height:17mm;padding:2mm 1mm;text-align:center;border-right:1px solid #d5d5c9;display:flex;flex-direction:column;justify-content:center;align-items:center}.rc-stats>div:last-child{border-right:0}.rc-stats span{font-family:Arial,sans-serif;font-size:5.2px;line-height:1.2;color:#35524a;text-transform:uppercase}.rc-stats b{font-size:15px;line-height:1;color:#0a6b50;margin-top:1.5mm}.rc-stats small{font-size:5.8px;color:#68736e}.rc-stats .remaining{background:#fffaf0}.rc-stats .remaining b{color:#1b3e57}.rc-stats .remaining:nth-child(5) b{color:#9a3737}.rc-stats .remaining:nth-child(7) b{color:#8d6b17}
.rc-final .rc-section-head{background:#f5ead0;color:#43552d;border-bottom:1px solid #d2b96e}.rc-final .rc-section-icon{color:#a27b1d}.rc-final-body{display:grid;grid-template-columns:1fr .75fr 1.25fr .55fr;align-items:center;min-height:22mm}.rc-final-col,.rc-final-score,.rc-final-details{padding:2mm 4mm}.rc-final-col{text-align:center;border-right:1px solid #d6d0bd}.rc-final-label{font-weight:700;color:#345047;font-size:6.7px;margin-bottom:1.5mm}.rc-final-badge{background:#137b3d;color:white;border-radius:2.5mm;padding:2mm 6mm;font-size:12px;font-weight:700}.rc-final-score{text-align:center;border-right:1px solid #d6d0bd}.rc-final-score b{display:block;font-size:26px;line-height:1;color:#0b5544}.rc-final-score span{font-size:7px;font-weight:700}.rc-final-details{font-family:Arial,sans-serif;font-size:6.2px;line-height:1.7;color:#203f38}.rc-final-att{text-align:center;border-left:1px solid #d6d0bd;padding:2mm 3mm}.rc-final-att span{display:block;font-family:Arial,sans-serif;font-size:5.7px;font-weight:700;color:#66736f;letter-spacing:.06em}.rc-final-att b{display:block;font-size:17px;color:#0b5544;margin-top:1.2mm}
.rc-approval .rc-section-head{height:9mm}.rc-sign-grid{display:grid;grid-template-columns:repeat(3,1fr)}.rc-sign{min-height:24mm;padding:2.2mm 5mm 1.5mm;text-align:center;border-right:1px solid #d5d1c2;position:relative}.rc-sign:last-child{border-right:0}.rc-sign-name{font-size:8px;font-weight:700;color:#102f29;min-height:4mm}.rc-sign-role{font-family:Arial,sans-serif;font-size:6px;font-weight:700;letter-spacing:.06em;color:#35584f;margin-top:.4mm}.rc-sign-line{height:10mm;border-bottom:1px dotted #6f7a75;display:flex;align-items:flex-end;justify-content:center;margin-top:1mm}.rc-sign-img{max-width:42mm;max-height:10mm;object-fit:contain}.rc-sign-date{font-family:Arial,sans-serif;font-size:5.8px;color:#65716d;margin-top:1mm}
.rc-footer-band{margin-top:auto;height:9mm;background:#07513f;color:white;border-top:1.2mm solid #c99c2a;display:flex;align-items:center;justify-content:space-between;padding:0 10mm;font-size:6.3px;font-style:italic;position:relative;z-index:2}.rc-footer-band b{font-size:12px;font-style:normal;color:#f3e4a9}.rc-footer{height:5.5mm;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;font-size:5.5px;color:#3f4d49;white-space:nowrap}
@media print{.page{margin:0}.rc-footer-band{break-inside:avoid}.rc-section{break-inside:avoid}}
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
