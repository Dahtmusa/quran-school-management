'use client';
import { loadCMSSettings } from '@/lib/cms-live-store';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import { getCurrentProfile, loadEvaluations, loadOperationalTerms, loadStudents, loadParentStudents, loadTermCompletions, completeTerm, loadCurrentAcademicTerm, loadSignaturesForReportCards, type ReportCardSignatures } from '@/lib/live-store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { label, absoluteProgress, remainingFrom, pageForPosition, juzForPosition, hizbForPosition } from '@/lib/quran';
import QRCode from 'qrcode';

function buildReportCardHTML(s: any, settings: any, termLabel: string, signatures: ReportCardSignatures, qrDataUrl = '') {
  const schoolName = settings.school_name?.value || 'AMQM';
  const shortName  = settings.short_name?.value  || 'AMQM';
  const address    = settings.contact?.address   || '';
  const logoUrl    = settings.logo_url?.value    || '';
  const approved   = s.es.filter((e: any) => e.status === 'Approved');
  const avg        = approved.length ? Math.round(approved.reduce((n: number, e: any) => n + e.score, 0) / approved.length) : null;
  const status     = avg === null ? '—' : avg >= 90 ? 'Excellent' : avg >= 75 ? 'Very Good' : avg >= 60 ? 'Satisfactory' : 'Needs Improvement';
  const absP       = absoluteProgress(s.current, s.direction);
  const rem        = remainingFrom(s.current, s.direction);
  const juz        = juzForPosition(s.current);
  const hizb       = hizbForPosition(s.current);
  const mushafPg   = pageForPosition(s.current);
  const evals      = [1, 2, 3].map(n => { const e = s.es.find((x: any) => x.number === n); return e && e.status === 'Approved' ? e : null; });
  const classSig   = s.classId ? signatures.teachers[s.classId] : null;
  const sigBoxes   = [
    { lbl: 'Class Teacher',   sig: classSig },
    { lbl: 'Supervisor',      sig: signatures.supervisor },
    { lbl: 'School Director', sig: signatures.director },
  ];
  const sBg   = avg !== null && avg >= 90 ? '#d1fae5' : avg !== null && avg >= 75 ? '#dbeafe' : avg !== null && avg >= 60 ? '#fef3c7' : '#ffe4e6';
  const sClr  = avg !== null && avg >= 90 ? '#065f46' : avg !== null && avg >= 75 ? '#1e40af' : avg !== null && avg >= 60 ? '#92400e' : '#be123c';
  const dir   = s.direction === 'baqarah_to_nas' ? 'Baqarah → Nās' : 'Nās → Baqarah';
  const pct   = Math.min(100, Math.max(0, absP.percent));
  const serial = `${(s.admissionNo || 'N/A').toUpperCase()}/${termLabel.replace(/[\s·]+/g, '-').toUpperCase()}`;
  const attHtml = s.attendance != null ? `<span class="chip chip-att">Attendance: ${s.attendance}%</span>` : '';

  const evalCards = evals.map((e, i) => e
    ? `<div class="ec">
        <div class="ec-num">Eval ${i + 1}</div>
        <div class="ec-score">${e.score}%</div>
        <div class="ec-grade">${e.grade || '—'}</div>
        <div class="ec-mem">${e.memorizedAyahs || 0} ayahs · ${Number(e.memorizedPages || 0).toFixed(1)} pg</div>
        <div class="ec-rub">
          <div class="ec-rub-cell"><span class="rl">Mem</span><span class="rv">${e.memorization}/5</span></div>
          <div class="ec-rub-cell"><span class="rl">Acc</span><span class="rv">${e.accuracy}/5</span></div>
          <div class="ec-rub-cell"><span class="rl">Flu</span><span class="rv">${e.fluency}/5</span></div>
          <div class="ec-rub-cell"><span class="rl">Taj</span><span class="rv">${e.tajweed}/5</span></div>
          <div class="ec-rub-cell"><span class="rl">Ret</span><span class="rv">${e.retention}/5</span></div>
        </div>
       </div>`
    : `<div class="ec ec-miss"><div class="ec-num">Eval ${i + 1}</div><div class="ec-none">Not recorded</div></div>`
  ).join('');

  const sigs = sigBoxes.map(({ lbl: sl, sig }) =>
    `<div class="sb">
      <div class="sa">${sig?.signature_data ? `<img src="${sig.signature_data}" class="si"/>` : ''}</div>
      <div class="sn">${sig?.signer_name || '&nbsp;'}</div>
      <div class="sl-role">${sl}</div>
      <div class="sd">Date: ________________</div>
    </div>`
  ).join('');

  const logoHtml  = logoUrl    ? `<img src="${logoUrl}" class="s1-logo" alt=""/>` : '';
  const photoHtml = s.photoUrl ? `<img src="${s.photoUrl}" class="s2-photo" alt=""/>` : `<div class="s2-photo-ph">${(s.name || '?').charAt(0)}</div>`;
  const qrHtml    = qrDataUrl  ? `<div class="s1-qr"><img src="${qrDataUrl}" alt="QR"/><div class="s1-qrl">Scan to verify</div></div>` : '';

  return `<div class="page">

  <!-- S1: School Header -->
  <div class="s1">
    ${logoHtml}
    <div class="s1-info">
      <div class="s1-sn">${shortName}</div>
      <div class="s1-name">${schoolName}</div>
      <div class="s1-addr">${address}</div>
    </div>
    <div class="s1-right">
      <div class="s1-badge">TERM REPORT CARD</div>
      ${qrHtml}
    </div>
  </div>

  <!-- S2: Student Profile -->
  <div class="s2">
    ${photoHtml}
    <div class="s2-info">
      <div class="s2-name">${s.name}</div>
      <div class="s2-row">Adm No: <b>${s.admissionNo?.toUpperCase() || '—'}</b>&nbsp;·&nbsp;Class: <b>${s.className || '—'}</b>&nbsp;·&nbsp;Section: <b>${s.section || '—'}</b>&nbsp;·&nbsp;Year: <b>${s.year || '—'}</b></div>
      <div class="s2-row">Term: <b>${termLabel}</b>&nbsp;·&nbsp;Teacher: <b>${s.teacher || '—'}</b></div>
      <div class="s2-chips">
        <span class="chip chip-dir">${dir}</span>
        ${attHtml}
        <span class="chip" style="background:${sBg};color:${sClr}">${status}</span>
      </div>
    </div>
  </div>

  <!-- S3: Academic Performance -->
  <div class="sec-lbl">Academic Performance</div>
  <div class="s3">
    <div class="s3-grid">
      ${evalCards}
      <div class="ec ec-avg">
        <div class="ec-num">Term Average</div>
        <div class="ec-score" style="color:#062d2a">${avg !== null ? avg + '%' : '—'}</div>
        <div class="ec-grade" style="color:#065f46">${status}</div>
        <div class="ec-mem">${approved.length} of 3 evaluations</div>
      </div>
    </div>
  </div>

  <!-- S4: Hifz Journey -->
  <div class="sec-lbl">Qur&#x101;n Memorization Journey</div>
  <div class="s4">
    <div class="s4-header">
      <div class="s4-ring-wrap">
        <svg class="s4-ring" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#fbbf24"/></linearGradient></defs>
          <circle cx="36" cy="36" r="29" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="6.5"/>
          <circle cx="36" cy="36" r="29" fill="none" stroke="url(#rg)" stroke-width="6.5"
            stroke-dasharray="${(2 * Math.PI * 29).toFixed(2)}"
            stroke-dashoffset="${(2 * Math.PI * 29 * (1 - pct / 100)).toFixed(2)}"
            stroke-linecap="round" transform="rotate(-90 36 36)"/>
        </svg>
        <div class="s4-ring-inner">
          <div class="s4-ring-pct">${pct.toFixed(1)}%</div>
          <div class="s4-ring-lbl">Qur&#x101;n<br/>Complete</div>
        </div>
      </div>
      <div class="s4-info">
        <div class="s4-eyebrow">Hifz Journey</div>
        <div class="s4-pos">${label(s.current)}</div>
        <div class="s4-sub">Started: ${label(s.start)}&nbsp;·&nbsp;${dir}&nbsp;·&nbsp;Teacher: ${s.teacher || '—'}</div>
        <div class="s4-bar-track"><div class="s4-bar-fill" style="width:${pct}%"></div></div>
        <div class="s4-bar-meta">
          <span>${pct.toFixed(1)}% of Qur&#x101;n&nbsp;·&nbsp;${absP.hizbs} / 60 Hizb</span>
          <span>${rem.ayahs.toLocaleString()} ayahs left</span>
        </div>
      </div>
    </div>
    <div class="s4-grid">
      <div class="s4-stat s4-stat-m"><div class="s4-sl s4-sl-m">Ayahs Memorized</div><div class="s4-sv s4-sv-m">${absP.ayahs.toLocaleString()}</div></div>
      <div class="s4-stat s4-stat-m"><div class="s4-sl s4-sl-m">Pages Memorized</div><div class="s4-sv s4-sv-m">${absP.pages}</div></div>
      <div class="s4-stat s4-stat-m"><div class="s4-sl s4-sl-m">Hizb Memorized</div><div class="s4-sv s4-sv-m">${absP.hizbs}<span class="s4-sv-sub">&thinsp;/ 60</span></div></div>
      <div class="s4-stat s4-stat-m"><div class="s4-sl s4-sl-m">Mushaf Page</div><div class="s4-sv s4-sv-m">${mushafPg}<span class="s4-sv-sub">&thinsp;/ 604</span></div></div>
      <div class="s4-stat s4-stat-r"><div class="s4-sl s4-sl-r">Ayahs Remaining</div><div class="s4-sv s4-sv-r">${rem.ayahs.toLocaleString()}</div></div>
      <div class="s4-stat s4-stat-r"><div class="s4-sl s4-sl-r">Pages Remaining</div><div class="s4-sv s4-sv-r">${rem.pages}</div></div>
      <div class="s4-stat s4-stat-r"><div class="s4-sl s4-sl-r">Hizbs Remaining</div><div class="s4-sv s4-sv-r">${rem.hizbs}<span class="s4-sv-sub">&thinsp;/ 60</span></div></div>
      <div class="s4-stat s4-stat-r"><div class="s4-sl s4-sl-r">Current Juz / Hizb</div><div class="s4-sv s4-sv-r">${juz} / ${hizb}</div></div>
    </div>
  </div>

  <!-- S5: Final Term Result -->
  <div class="sec-lbl">Final Term Result</div>
  <div class="s5">
    <div class="s5-left">
      <div class="s5-lbl-text">Academic Standing</div>
      <div class="s5-standing">${status}</div>
      <div class="s5-detail">${approved.length} approved evaluation${approved.length !== 1 ? 's' : ''}&nbsp;·&nbsp;${termLabel}&nbsp;·&nbsp;${s.year || '—'}</div>
    </div>
    <div class="s5-right">
      <div class="s5-avg">${avg !== null ? avg + '%' : '—'}</div>
      <div class="s5-avg-lbl">Term Average</div>
    </div>
  </div>

  <!-- S6: Official Approval -->
  <div class="sec-lbl">Official Approval</div>
  <div class="sigrow">${sigs}</div>

  <!-- S7: Verification Footer -->
  <div class="ft">Serial: ${serial}&nbsp;·&nbsp;Only approved evaluations constitute official academic records&nbsp;·&nbsp;Printed: ${new Date().toLocaleDateString('en-NG')}</div>

  </div>`;
}

const PRINT_CSS = `
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;padding:0;background:#fff;font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1a1a1a;line-height:1.35}
  @page{size:A4 portrait;margin:0}

  /* ── A4 canvas: flex column, all sections fill exact 297mm ── */
  .page{width:210mm;height:297mm;padding:7mm 10mm;display:flex;flex-direction:column;gap:3px;page-break-after:always;break-after:page;overflow:hidden}

  /* ── S1: School Header ── */
  .s1{display:flex;align-items:center;gap:10px;padding-bottom:7px;border-bottom:2.5px solid #062d2a;flex-shrink:0}
  .s1-logo{width:56px;height:56px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1.5px solid #e2e8f0}
  .s1-info{flex:1;min-width:0}
  .s1-sn{font-size:7px;font-weight:800;letter-spacing:.22em;color:#b45309;text-transform:uppercase;margin-bottom:1px}
  .s1-name{font-size:17px;font-weight:900;color:#062d2a;line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .s1-addr{font-size:7.5px;color:#6b7280;margin-top:2px}
  .s1-right{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0}
  .s1-badge{background:#062d2a;color:#fff;padding:3px 10px;border-radius:18px;font-size:6.5px;font-weight:700;letter-spacing:.07em;white-space:nowrap}
  .s1-qr{text-align:center}
  .s1-qr img{width:52px;height:52px;border-radius:5px;display:block}
  .s1-qrl{font-size:5.5px;color:#9ca3af;text-align:center;display:block;margin-top:1px}

  /* ── S2: Student Profile ── */
  .s2{display:flex;align-items:center;gap:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:7px 11px;flex-shrink:0}
  .s2-photo{width:54px;height:54px;border-radius:8px;object-fit:cover;border:1.5px solid #e2e8f0;flex-shrink:0}
  .s2-photo-ph{width:54px;height:54px;border-radius:8px;background:#cbd5e1;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#94a3b8}
  .s2-info{flex:1;min-width:0}
  .s2-name{font-size:15px;font-weight:900;color:#062d2a;line-height:1.1}
  .s2-row{font-size:7.5px;color:#6b7280;margin-top:2px;line-height:1.5}
  .s2-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}

  /* ── Chips (shared) ── */
  .chip{font-size:6.5px;font-weight:700;padding:2px 7px;border-radius:11px;white-space:nowrap}
  .chip-dir{background:#d1fae5;color:#065f46}
  .chip-att{background:#e0f2fe;color:#0369a1}

  /* ── Section labels ── */
  .sec-lbl{font-size:6.5px;font-weight:800;text-transform:uppercase;letter-spacing:.2em;color:#94a3b8;flex-shrink:0;margin-top:1px}

  /* ── S3: Academic Performance (flex:4, ~30% of available) ── */
  .s3{flex:4 1 0;display:flex;flex-direction:column;min-height:0}
  .s3-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;flex:1;min-height:0}
  .ec{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:7px 5px;text-align:center;display:flex;flex-direction:column;justify-content:space-around;min-height:0;overflow:hidden}
  .ec-miss{opacity:.4;justify-content:center;gap:4px}
  .ec-avg{background:#ecfdf5;border-color:#34d399;border-width:1.5px}
  .ec-num{font-size:6.5px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#94a3b8}
  .ec-score{font-size:23px;font-weight:900;color:#062d2a;line-height:1}
  .ec-grade{font-size:10px;font-weight:700;color:#475569}
  .ec-mem{font-size:6.5px;color:#94a3b8;margin-top:1px}
  .ec-rub{display:grid;grid-template-columns:repeat(5,1fr);gap:2px;margin-top:3px}
  .ec-rub-cell{background:#f0fdf4;border-radius:3px;text-align:center;padding:2px 1px}
  .rl{display:block;font-size:5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.03em}
  .rv{display:block;font-size:7.5px;font-weight:700;color:#065f46}
  .ec-none{font-size:8px;color:#9ca3af}

  /* ── S4: Hifz Journey (flex:6, ~45% of available) ── */
  .s4{background:#062d2a;color:#fff;border-radius:11px;padding:10px 13px;flex:6 1 0;display:flex;flex-direction:column;gap:6px;min-height:0}
  /* Ring + info row */
  .s4-header{display:flex;align-items:center;gap:12px;flex-shrink:0}
  .s4-ring-wrap{position:relative;width:72px;height:72px;flex-shrink:0;display:flex;align-items:center;justify-content:center}
  .s4-ring{position:absolute;top:0;left:0;width:72px;height:72px}
  .s4-ring-inner{position:relative;z-index:1;text-align:center}
  .s4-ring-pct{font-size:12px;font-weight:900;color:#6ee7b7;line-height:1}
  .s4-ring-lbl{font-size:4.5px;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.06em;margin-top:2px;line-height:1.4}
  .s4-info{flex:1;display:flex;flex-direction:column;gap:3px;min-width:0}
  .s4-eyebrow{font-size:7px;font-weight:800;letter-spacing:.18em;color:#b45309;text-transform:uppercase}
  .s4-pos{font-size:16px;font-weight:900;line-height:1.1;color:#fff}
  .s4-sub{font-size:6.5px;color:#a7f3d0}
  .s4-bar-track{height:7px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden;margin-top:2px}
  .s4-bar-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#34d399,#fbbf24)}
  .s4-bar-meta{display:flex;justify-content:space-between;font-size:5.5px;color:rgba(255,255,255,.5);margin-top:2px}
  /* 8-stat grid */
  .s4-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;flex:1;min-height:0}
  .s4-stat{border-radius:8px;padding:4px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:0}
  .s4-stat-m{background:rgba(255,255,255,.08)}
  .s4-stat-r{background:rgba(251,191,36,.12)}
  .s4-sl{font-size:5.5px;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:3px;font-weight:600}
  .s4-sl-m{color:#6ee7b7}
  .s4-sl-r{color:#fcd34d}
  .s4-sv{font-size:15px;font-weight:900;line-height:1}
  .s4-sv-m{color:#fff}
  .s4-sv-r{color:#fde68a}
  .s4-sv-sub{font-size:8px;font-weight:400;opacity:.65}

  /* ── S5: Final Term Result ── */
  .s5{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#f0fdf4;border:1.5px solid #34d399;border-radius:10px;padding:9px 13px;flex-shrink:0}
  .s5-lbl-text{font-size:6.5px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;color:#065f46}
  .s5-standing{font-size:15px;font-weight:900;color:#062d2a;line-height:1.2;margin-top:1px}
  .s5-detail{font-size:7px;color:#6b7280;margin-top:2px}
  .s5-right{text-align:right;flex-shrink:0}
  .s5-avg{font-size:26px;font-weight:900;color:#065f46;line-height:1}
  .s5-avg-lbl{font-size:7px;color:#065f46;font-weight:700;margin-top:1px}

  /* ── S6: Official Approval (3 signatures, always visible) ── */
  .sigrow{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;flex-shrink:0}
  .sb{text-align:center;border:1px solid #e2e8f0;border-radius:8px;padding:6px 8px}
  .sa{height:44px;display:flex;align-items:flex-end;justify-content:center;border-bottom:1.5px solid #94a3b8;margin-bottom:4px;padding-bottom:3px}
  .si{max-height:40px;max-width:100%;object-fit:contain}
  .sn{font-size:8px;font-weight:700;color:#062d2a}
  .sl-role{font-size:6.5px;color:#6b7280;text-transform:uppercase;letter-spacing:.09em;margin-top:2px}
  .sd{font-size:6.5px;color:#94a3b8;margin-top:3px}

  /* ── S7: Verification Footer ── */
  .ft{font-size:6px;color:#cbd5e1;text-align:center;border-top:1px solid #f1f5f9;padding-top:4px;flex-shrink:0}
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
  },[student.id,term?.id]);

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
