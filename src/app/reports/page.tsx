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
  const sBg  = avg && avg >= 90 ? '#d1fae5' : avg && avg >= 75 ? '#dbeafe' : avg && avg >= 60 ? '#fef3c7' : '#ffe4e6';
  const sClr = avg && avg >= 90 ? '#065f46' : avg && avg >= 75 ? '#1e40af' : avg && avg >= 60 ? '#92400e' : '#be123c';
  const dir  = s.direction === 'baqarah_to_nas' ? 'Baqarah → Nās' : 'Nās → Baqarah';
  const pct  = Math.min(100, Math.max(0, absP.percent));
  const serial = `${(s.admissionNo || 'N/A').toUpperCase()}/${termLabel.replace(/[\s·]+/g, '-').toUpperCase()}`;
  const attHtml = s.attendance != null ? `<span class="s2-chip s2-chip-att">Attendance: ${s.attendance}%</span>` : '';

  const evalCards = evals.map((e, i) => e
    ? `<div class="ec">
        <div class="en">Evaluation ${i + 1}</div>
        <div class="es2">${e.score}%</div>
        <div class="eg">${e.grade || '—'}</div>
        <div class="er">${e.memorizedAyahs || 0} ayahs · ${Number(e.memorizedPages || 0).toFixed(1)} pg</div>
        <div class="rub">
          <div><span class="rl">Mem</span><span class="rv">${e.memorization}/5</span></div>
          <div><span class="rl">Acc</span><span class="rv">${e.accuracy}/5</span></div>
          <div><span class="rl">Flu</span><span class="rv">${e.fluency}/5</span></div>
          <div><span class="rl">Taj</span><span class="rv">${e.tajweed}/5</span></div>
          <div><span class="rl">Ret</span><span class="rv">${e.retention}/5</span></div>
        </div>
       </div>`
    : `<div class="ec ec-miss"><div class="en">Evaluation ${i + 1}</div><div class="emiss">Not recorded</div></div>`
  ).join('');

  const sigs = sigBoxes.map(({ lbl: sl, sig }) =>
    `<div class="sb">
      <div class="sa">${sig?.signature_data ? `<img src="${sig.signature_data}" class="si"/>` : ''}</div>
      <div class="sn">${sig?.signer_name || '&nbsp;'}</div>
      <div class="sl">${sl}</div>
      <div class="sd">Date: ________________</div>
    </div>`
  ).join('');

  const logoHtml  = logoUrl    ? `<img src="${logoUrl}" class="s1-logo" alt=""/>` : '';
  const photoHtml = s.photoUrl ? `<img src="${s.photoUrl}" class="s2-photo" alt=""/>` : `<div class="s2-photo-ph">${(s.name || '?').charAt(0)}</div>`;
  const qrHtml    = qrDataUrl  ? `<div class="s1-qr"><img src="${qrDataUrl}" alt="QR"/><span class="s1-qrl">Scan to verify</span></div>` : '';

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

  <!-- S2: Student Identity -->
  <div class="s2">
    ${photoHtml}
    <div class="s2-info">
      <div class="s2-name">${s.name}</div>
      <div class="s2-meta">Adm No: <b>${s.admissionNo?.toUpperCase() || '—'}</b> &nbsp;·&nbsp; Class: <b>${s.className || '—'}</b> &nbsp;·&nbsp; Section: <b>${s.section || '—'}</b></div>
      <div class="s2-meta">Year: <b>${s.year || '—'}</b> &nbsp;·&nbsp; Term: <b>${termLabel}</b> &nbsp;·&nbsp; Teacher: <b>${s.teacher || '—'}</b></div>
      <div class="s2-chips">
        <span class="s2-chip s2-chip-dir">${dir}</span>
        ${attHtml}
      </div>
    </div>
    <div class="s2-status">
      <div class="s2-stchip" style="background:${sBg};color:${sClr}">${status}</div>
    </div>
  </div>

  <!-- S3: Hifz Journey (grows to fill space) -->
  <div class="sec-lbl">Qur&#x101;n Memorization Journey</div>
  <div class="s3">
    <div class="s3-top">
      <div>
        <div class="s3-pos">${label(s.current)}</div>
        <div class="s3-sub">Started at ${label(s.start)} &nbsp;·&nbsp; ${dir} &nbsp;·&nbsp; Teacher: ${s.teacher || '—'}</div>
      </div>
      <div class="s3-pct">${pct.toFixed(1)}%<br/><span style="font-size:8px;font-weight:600;color:#a7f3d0">of Qur&#x101;n memorized</span></div>
    </div>
    <div>
      <div class="s3-bar-wrap"><div class="s3-bar" style="width:${pct}%"></div></div>
      <div class="s3-bar-lbl"><span>Beginning</span><span>Juz ${juz} &nbsp;·&nbsp; Hizb ${hizb} &nbsp;·&nbsp; ${pct.toFixed(1)}% complete</span><span>Completion</span></div>
    </div>
    <div class="s3-grid">
      <div class="s3s"><span class="s3sl">Ayahs Memorized</span><span class="s3sv">${absP.ayahs.toLocaleString()}</span></div>
      <div class="s3s"><span class="s3sl">Pages Memorized</span><span class="s3sv">${absP.pages}</span></div>
      <div class="s3s"><span class="s3sl">Hizb Memorized</span><span class="s3sv">${absP.hizbs}<span class="s3sv-sub"> / 60</span></span></div>
      <div class="s3s"><span class="s3sl">Mushaf Page</span><span class="s3sv">${mushafPg}<span class="s3sv-sub"> / 604</span></span></div>
    </div>
    <div class="s3-grid">
      <div class="s3s2"><span class="s3sl2">Ayahs Remaining</span><span class="s3sv2">${rem.ayahs.toLocaleString()}</span></div>
      <div class="s3s2"><span class="s3sl2">Pages Remaining</span><span class="s3sv2">${rem.pages}</span></div>
      <div class="s3s2"><span class="s3sl2">Hizbs Remaining</span><span class="s3sv2">${rem.hizbs}<span class="s3sv2-sub"> / 60</span></span></div>
      <div class="s3s2"><span class="s3sl2">Current Juz / Hizb</span><span class="s3sv2">${juz} / ${hizb}</span></div>
    </div>
  </div>

  <!-- S4: Term Evaluations (grows to fill space) -->
  <div class="sec-lbl">Term Evaluations</div>
  <div class="s4-wrap">
    <div class="s4-grid">
      ${evalCards}
      <div class="ec ec-avg">
        <div class="en">Term Average</div>
        <div class="es2" style="color:#062d2a">${avg !== null ? avg + '%' : '—'}</div>
        <div class="eg" style="color:#065f46">${status}</div>
        <div class="er">${approved.length} of 3 evaluations approved</div>
      </div>
    </div>
  </div>

  <!-- S5: Final Status -->
  <div class="sec-lbl">Final Term Status</div>
  <div class="s5">
    <div class="s5-left">
      <div class="s5-label">Academic Standing</div>
      <div class="s5-status">${status}</div>
      <div class="s5-detail">${approved.length} approved evaluation${approved.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ${termLabel} &nbsp;·&nbsp; ${s.year || '—'}</div>
    </div>
    <div class="s5-right">
      <div class="s5-avg">${avg !== null ? avg + '%' : '—'}</div>
      <div class="s5-grade">Term Average</div>
    </div>
  </div>

  <!-- S6: Official Signatures -->
  <div class="sec-lbl">Official Signatures</div>
  <div class="sigrow">${sigs}</div>

  <!-- S7: Footer -->
  <div class="ft">Serial: ${serial} &nbsp;·&nbsp; Only approved evaluations constitute official academic records &nbsp;·&nbsp; Printed: ${new Date().toLocaleDateString('en-NG')}</div>
  </div>`;
}

const PRINT_CSS = `
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;line-height:1.35}
  html,body{margin:0;padding:0;background:#fff;font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1a1a1a}
  @page{size:A4 portrait;margin:0}
  /* The .page is the A4 canvas — flex column so sections that flex:1 fill available height */
  .page{width:210mm;height:297mm;padding:9mm 11mm;display:flex;flex-direction:column;gap:5px;page-break-after:always;break-after:page;overflow:hidden}

  /* ── S1: School Header (fixed height, ~14% of page) ── */
  .s1{display:flex;align-items:center;gap:12px;padding-bottom:10px;border-bottom:2.5px solid #062d2a;flex-shrink:0;min-height:72px}
  .s1-logo{width:62px;height:62px;border-radius:10px;object-fit:cover;flex-shrink:0;border:1.5px solid #e2e8f0}
  .s1-info{flex:1;min-width:0}
  .s1-sn{font-size:8px;font-weight:800;letter-spacing:.22em;color:#b45309;text-transform:uppercase;margin-bottom:2px}
  .s1-name{font-size:19px;font-weight:900;color:#062d2a;line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .s1-addr{font-size:8.5px;color:#6b7280;margin-top:3px}
  .s1-right{display:flex;flex-direction:column;align-items:flex-end;gap:7px;flex-shrink:0}
  .s1-badge{background:#062d2a;color:#fff;padding:4px 11px;border-radius:20px;font-size:7.5px;font-weight:700;letter-spacing:.07em;white-space:nowrap}
  .s1-qr img{width:62px;height:62px;border-radius:6px;display:block}
  .s1-qrl{font-size:6px;color:#9ca3af;text-align:center;display:block;margin-top:2px}

  /* ── S2: Student Identity (fixed height, ~12% of page) ── */
  .s2{display:flex;align-items:center;gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 13px;flex-shrink:0;min-height:74px}
  .s2-photo{width:62px;height:62px;border-radius:9px;object-fit:cover;border:2px solid #e2e8f0;flex-shrink:0}
  .s2-photo-ph{width:62px;height:62px;border-radius:9px;background:#cbd5e1;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:#94a3b8}
  .s2-info{flex:1;min-width:0}
  .s2-name{font-size:17px;font-weight:900;color:#062d2a;line-height:1.1}
  .s2-meta{font-size:8.5px;color:#6b7280;margin-top:3px;line-height:1.5}
  .s2-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
  .s2-chip{font-size:7.5px;font-weight:700;padding:2px 9px;border-radius:12px;white-space:nowrap}
  .s2-chip-dir{background:#d1fae5;color:#065f46}
  .s2-chip-att{background:#e0f2fe;color:#0369a1}
  .s2-status{display:flex;flex-direction:column;align-items:flex-end;justify-content:center;flex-shrink:0}
  .s2-stchip{padding:4px 13px;border-radius:20px;font-size:9px;font-weight:800;white-space:nowrap}

  /* ── Section labels ── */
  .sec-lbl{font-size:7.5px;font-weight:800;text-transform:uppercase;letter-spacing:.2em;color:#9ca3af;flex-shrink:0}

  /* ── S3: Hifz Journey (flex:3 — takes ~37% of available space) ── */
  .s3{background:#062d2a;color:#fff;border-radius:12px;padding:13px 15px;flex:3 1 0;display:flex;flex-direction:column;justify-content:space-between;min-height:0}
  .s3-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
  .s3-pos{font-size:19px;font-weight:900;line-height:1.1}
  .s3-sub{font-size:8px;color:#a7f3d0;margin-top:3px}
  .s3-pct{font-size:13px;font-weight:900;color:#6ee7b7;white-space:nowrap;text-align:right}
  .s3-bar-wrap{height:8px;background:rgba(255,255,255,.14);border-radius:4px;overflow:hidden}
  .s3-bar{height:100%;border-radius:4px;background:linear-gradient(90deg,#34d399,#fbbf24)}
  .s3-bar-lbl{display:flex;justify-content:space-between;margin-top:3px;font-size:6.5px;color:rgba(255,255,255,.4)}
  .s3-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
  .s3s{background:rgba(255,255,255,.09);border-radius:7px;padding:8px 4px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .s3s2{background:rgba(251,191,36,.13);border-radius:7px;padding:8px 4px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .s3sl{font-size:6.5px;color:#6ee7b7;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:3px}
  .s3sl2{font-size:6.5px;color:#fcd34d;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:3px}
  .s3sv{font-size:17px;font-weight:900;color:#fff;line-height:1}
  .s3sv-sub{font-size:9px;font-weight:400;color:#a7f3d0}
  .s3sv2{font-size:17px;font-weight:900;color:#fde68a;line-height:1}
  .s3sv2-sub{font-size:9px;font-weight:400;color:#fde68a;opacity:.7}

  /* ── S4: Evaluations (flex:2 — takes ~25% of available space) ── */
  .s4-wrap{flex:2 1 0;display:flex;flex-direction:column;min-height:0}
  .s4-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;flex:1;min-height:0}
  .ec{background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;padding:10px 8px;text-align:center;display:flex;flex-direction:column;justify-content:space-around}
  .ec-miss{opacity:.45;justify-content:center;gap:8px}
  .ec-avg{background:#ecfdf5;border-color:#34d399;border-width:1.5px}
  .en{font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#9ca3af}
  .es2{font-size:26px;font-weight:900;color:#062d2a;line-height:1}
  .eg{font-size:11px;font-weight:700;color:#475569}
  .er{font-size:7px;color:#94a3b8}
  .rub{display:grid;grid-template-columns:repeat(5,1fr);gap:2px}
  .rub div{background:#f0fdf4;border-radius:3px;text-align:center;padding:2px 1px}
  .rl{display:block;font-size:5.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.04em}
  .rv{display:block;font-size:8.5px;font-weight:700;color:#065f46}
  .emiss{font-size:9px;color:#9ca3af}

  /* ── S5: Final Status (fixed, ~9% of page) ── */
  .s5{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#f0fdf4;border:1.5px solid #34d399;border-radius:11px;padding:11px 15px;flex-shrink:0}
  .s5-label{font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.15em;color:#065f46}
  .s5-status{font-size:17px;font-weight:900;color:#062d2a;line-height:1.2;margin-top:2px}
  .s5-detail{font-size:8px;color:#6b7280;margin-top:3px}
  .s5-right{text-align:right;flex-shrink:0}
  .s5-avg{font-size:30px;font-weight:900;color:#065f46;line-height:1}
  .s5-grade{font-size:8px;color:#065f46;font-weight:700;margin-top:2px}

  /* ── S6: Signatures (fixed, ~12% of page) ── */
  .sigrow{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;flex-shrink:0}
  .sb{text-align:center;border:1px solid #e2e8f0;border-radius:9px;padding:8px 10px}
  .sa{height:52px;display:flex;align-items:flex-end;justify-content:center;border-bottom:1.5px solid #94a3b8;margin-bottom:5px;padding-bottom:3px}
  .si{max-height:48px;max-width:100%;object-fit:contain}
  .sn{font-size:9px;font-weight:700;color:#062d2a}
  .sl{font-size:7px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-top:2px}
  .sd{font-size:7px;color:#94a3b8;margin-top:4px}

  /* ── S7: Footer (fixed, ~3% of page) ── */
  .ft{font-size:7px;color:#cbd5e1;text-align:center;border-top:1px solid #f1f5f9;padding-top:5px;flex-shrink:0}
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
