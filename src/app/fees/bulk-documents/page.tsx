'use client';

import AdminShell from '@/components/AdminShell';
import { loadCurrentAcademicTerm, loadOperationalTerms, loadStudents } from '@/lib/live-store';
import { loadFeeStructures, loadFinanceSummary } from '@/lib/admin-management-store';
import { loadCMSSettings } from '@/lib/cms-live-store';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useMemo, useState } from 'react';

const tLabel = (t: any) => t?.term_number === 1 ? 'First Term' : t?.term_number === 2 ? 'Second Term' : t?.term_number === 3 ? 'Third Term' : t?.name || 'Term';

function findNextTerm(current: any, terms: any[]) {
  if (!current) return null;
  if ((current.term_number || 0) < 3) {
    return terms.find(t => t.academic_year_id === current.academic_year_id && t.term_number === (current.term_number || 0) + 1) || null;
  }
  return terms.filter(t => current.ends_on && t.starts_on > current.ends_on).sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)))[0] || null;
}

function getStudentFee(structs: any[], termId: string | null, yearId: string | null, section: string) {
  const sec = String(section).toLowerCase() === 'boarding' ? 'boarding' : 'day';
  return structs.find(f => f.term_id === termId && f.section === sec)
    || structs.find(f => !f.term_id && f.academic_year_id === yearId && f.section === sec)
    || null;
}

function outstandingItemsBeforeTerm(studentId: string, targetTerm: any, fees: any[], terms: any[]) {
  if (!targetTerm) return [];
  const targetStart = String(targetTerm.starts_on || '9999-12-31');
  return (fees || []).filter((row: any) => {
    if (row.student_id !== studentId || !row.fee_structures) return false;
    const fs = row.fee_structures;
    if (fs.term_id) {
      const sourceTerm = terms.find((t: any) => t.id === fs.term_id);
      if (!sourceTerm?.starts_on || String(sourceTerm.starts_on) >= targetStart) return false;
    } else {
      const ayStart = String(fs.academic_years?.starts_on || '9999-12-31');
      if (fs.academic_year_id === targetTerm.academic_year_id || ayStart >= targetStart) return false;
    }
    return Math.max(0, Number(row.amount_due || 0) - Number(row.amount_paid || 0)) > 0;
  }).map((row: any) => {
    const fs = row.fee_structures || {};
    const sourceTerm = fs.term_id ? terms.find((t: any) => t.id === fs.term_id) : null;
    return {
      name: row.name || fs.name || 'School fee',
      termLabel: sourceTerm ? `${tLabel(sourceTerm)}${sourceTerm.academic_years?.name ? ` · ${sourceTerm.academic_years.name}` : ''}` : (fs.academic_years?.name || 'Previous academic year'),
      amount: Math.max(0, Number(row.amount_due || 0) - Number(row.amount_paid || 0)),
    };
  }).sort((a: any, b: any) => String(a.termLabel).localeCompare(String(b.termLabel)));
}

function money(currency: string, value: number) {
  return `${currency} ${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateText(value: any) {
  return value ? new Date(value).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function escapeHTML(value: any) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' } as any)[c]);
}

export default function BulkFinanceDocumentsPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [structs, setStructs] = useState<any[]>([]);
  const [feeRows, setFeeRows] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [allStudentFees, setAllStudentFees] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [classFilter, setClassFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const [s, cur, ts, fs, summary, cms] = await Promise.all([
          loadStudents(),
          loadCurrentAcademicTerm(),
          loadOperationalTerms(),
          loadFeeStructures(),
          loadFinanceSummary(),
          loadCMSSettings(),
        ]);
        if (!active) return;
        setStudents(s || []);
        setCurrent(cur || null);
        setTerms(ts || []);
        setStructs(fs || []);
        setFeeRows(summary?.fees || []);
        setPayments(summary?.payments || []);
        setSettings(cms || {});

        const db = createClient();
        const { data: historicalFees } = await db.from('student_fees').select('id,student_id,amount_due,amount_paid,fee_structure_id,fee_structures:fee_structure_id(id,term_id,academic_year_id,section,name,academic_years:academic_year_id(name,starts_on))');
        if (active) setAllStudentFees(historicalFees || []);
      } catch (e: any) {
        if (active) setError(e?.message || 'Could not load finance records.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const currentTerm = current?.term_id ? terms.find(t => t.id === current.term_id) : terms.find(t => t.is_current);
  const nextTerm = useMemo(() => findNextTerm(currentTerm, terms), [currentTerm, terms]);
  const schoolName = settings.school_name?.value || 'ALIYU AND MAIMUNA CENTER FOR QUR\'ANIC MEMORIZATION';
  const shortName = settings.short_name?.value || 'AMQM';
  const logoUrl = settings.logo_url?.value || '';
  const schoolAddress = settings.contact?.address || '';
  const currency = settings.currency?.value || '₦';

  const paymentByStudent = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const p of payments) {
      if (!map[p.student_id]) map[p.student_id] = [];
      map[p.student_id].push(p);
    }
    return map;
  }, [payments]);

  const currentFeeByStudent = useMemo(() => {
    const map: Record<string, any> = {};
    for (const f of feeRows) map[f.student_id] = f;
    return map;
  }, [feeRows]);

  const classes = useMemo(() => [...new Set(students.map(s => s.className || 'Unassigned'))].sort(), [students]);
  const visibleStudents = useMemo(() => classFilter ? students.filter(s => (s.className || 'Unassigned') === classFilter) : students, [students, classFilter]);

  const documentData = useMemo(() => visibleStudents.map(student => {
    const sec = String(student.section).toLowerCase() === 'boarding' ? 'boarding' : 'day';
    const nextFee = getStudentFee(structs, nextTerm?.id || null, nextTerm?.academic_year_id || null, sec);
    const carry = outstandingItemsBeforeTerm(student.id, nextTerm, allStudentFees, terms);
    const carryAmount = carry.reduce((n: number, x: any) => n + x.amount, 0);
    const nextFeeAmount = Number(nextFee?.amount || 0);
    const totalPayable = nextFee ? nextFeeAmount + carryAmount : carryAmount;
    const currentAllocation = currentFeeByStudent[student.id];
    const currentBalance = currentAllocation ? Math.max(0, Number(currentAllocation.amount_due || 0) - Number(currentAllocation.amount_paid || 0)) : null;
    return { student, payments: paymentByStudent[student.id] || [], nextFee, carry, carryAmount, nextFeeAmount, totalPayable, currentBalance };
  }), [visibleStudents, nextTerm, structs, allStudentFees, terms, currentFeeByStudent, paymentByStudent]);

  function buildSheetHTML(row: any) {
    const { student, payments: ps, nextFee, carry, carryAmount, nextFeeAmount, totalPayable, currentBalance } = row;
    const nextTermName = nextTerm ? `${tLabel(nextTerm)} ${nextTerm.academic_years?.name || ''}`.trim() : 'Next term not configured';
    const invoiceNo = `INV-${String(student.admissionNo || 'STUDENT').toUpperCase()}-${nextTerm?.term_number || 'NEXT'}`;
    const receiptTotal = ps.reduce((n: number, p: any) => n + Number(p.amount || 0), 0);
    return `<article class="sheet">
      <section class="half invoice">
        <div class="doc-header"><div class="brand"><div class="brand-name">${escapeHTML(schoolName)}</div><div class="brand-address">${escapeHTML(schoolAddress)}</div></div><div class="doc-title">SCHOOL FEES<br>INVOICE</div></div>
        <div class="line"><b>Student:</b> ${escapeHTML(student.name)} <span><b>Admission:</b> ${escapeHTML(student.admissionNo || '—')}</span></div>
        <div class="line"><b>Class:</b> ${escapeHTML(student.className || 'Unassigned')} <span><b>Section:</b> ${escapeHTML(student.section || 'Day')}</span></div>
        <div class="term-banner">${escapeHTML(nextTermName)}</div>
        <table><thead><tr><th>Description</th><th>Amount</th></tr></thead><tbody>
          ${carry.length ? carry.map((item: any) => `<tr><td>Outstanding · ${escapeHTML(item.termLabel)}<small>${escapeHTML(item.name)}</small></td><td>${money(currency, item.amount)}</td></tr>`).join('') : `<tr><td>No previous-term outstanding balance</td><td>${money(currency, 0)}</td></tr>`}
          ${nextFee ? `<tr><td>${escapeHTML(nextFee.name || 'Term Fee')}<small>${escapeHTML(nextTermName)}</small></td><td>${money(currency, nextFeeAmount)}</td></tr>` : `<tr><td>Next-term fee structure not configured</td><td>—</td></tr>`}
          <tr class="total"><td>TOTAL PAYABLE</td><td>${nextFee ? money(currency, totalPayable) : money(currency, carryAmount)}</td></tr>
        </tbody></table>
        <div class="meta"><div><b>Invoice No.</b><br>${escapeHTML(invoiceNo)}</div><div><b>Due Date</b><br>${dateText(nextFee?.due_date)}</div><div><b>Issued</b><br>${dateText(new Date())}</div></div>
        <div class="invoice-foot">${nextFee ? 'Please quote the invoice number when making payment.' : 'Finance setup is incomplete for this student/section; review the fee structure before issuing.'}</div>
      </section>
      <div class="cut"><span>✂ CUT / FOLD HERE</span></div>
      <section class="half receipt">
        <div class="doc-header"><div class="brand"><div class="brand-name">${escapeHTML(schoolName)}</div><div class="brand-address">${escapeHTML(schoolAddress)}</div></div><div class="doc-title">PAYMENT<br>RECEIPTS</div></div>
        <div class="line"><b>Student:</b> ${escapeHTML(student.name)} <span><b>Admission:</b> ${escapeHTML(student.admissionNo || '—')}</span></div>
        <div class="line"><b>Current term:</b> ${escapeHTML(currentTerm ? `${tLabel(currentTerm)} ${currentTerm.academic_years?.name || ''}` : '—')} <span><b>Section:</b> ${escapeHTML(student.section || 'Day')}</span></div>
        ${ps.length ? `<div class="receipt-list">${ps.map((p: any) => `<div class="receipt-row"><div><b>REC-${escapeHTML(String(p.id || '').slice(-8).toUpperCase())}</b><small>${dateText(p.paid_on)} · ${escapeHTML(p.method || 'Cash')}${p.reference ? ` · ${escapeHTML(p.reference)}` : ''}</small></div><strong>${money(currency, Number(p.amount || 0))}</strong></div>`).join('')}</div>` : `<div class="no-receipts">No payment receipts recorded for the current term.</div>`}
        <div class="receipt-total"><div><span>Total received this term</span><b>${money(currency, receiptTotal)}</b></div><div><span>Current term balance</span><b>${currentBalance == null ? '—' : money(currency, currentBalance)}</b></div></div>
        <div class="ack">Received with thanks. This document lists payments currently recorded in AMQM Finance.</div>
        <div class="signature"><span>Finance Officer</span><span>Date: __________________</span></div>
      </section>
      <footer class="sheet-footer"><span>${shortName} · Finance Document</span><span>One student · invoice + current-term receipts</span><span>Printed ${dateText(new Date())}</span></footer>
    </article>`;
  }

  async function printBulk() {
    if (!documentData.length) return;
    setPrinting(true);
    const w = window.open('', '_blank');
    if (!w) { setPrinting(false); alert('Please allow pop-ups for bulk printing.'); return; }
    const title = `AMQM Finance Documents · ${currentTerm ? tLabel(currentTerm) : 'Current Term'}`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(title)}</title><style>${PRINT_CSS}</style></head><body>${documentData.map(buildSheetHTML).join('')}<script>window.onload=function(){window.focus();setTimeout(function(){window.print()},500)};<\/script></body></html>`);
    w.document.close();
    setTimeout(() => setPrinting(false), 1200);
  }

  if (loading) return <AdminShell title="Invoices & Receipts"><div className="card p-8 text-sm text-slate-500">Loading current finance records…</div></AdminShell>;

  return <AdminShell title="Invoices & Receipts">
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-[#9d7621] p-6 text-white shadow-xl md:p-8">
        <div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">Finance documents</div>
        <h2 className="mt-2 text-3xl font-black md:text-4xl">One A4 page per student.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/85">The top half is the next-term invoice. The bottom half contains every current-term payment receipt recorded for that student.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-emerald-950 shadow-sm disabled:opacity-50" onClick={printBulk} disabled={printing || !documentData.length}>{printing ? 'Preparing…' : `Print all ${documentData.length} students`}</button>
          <span className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold">Current: {currentTerm ? `${currentTerm.academic_years?.name || ''} · ${tLabel(currentTerm)}` : 'Not configured'}</span>
          <span className="rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold">Next: {nextTerm ? `${nextTerm.academic_years?.name || ''} · ${tLabel(nextTerm)}` : 'Not configured'}</span>
        </div>
      </section>

      {error && <div className="rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}

      <section className="card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div><h3 className="text-xl font-black">Bulk print setup</h3><p className="mt-1 text-sm text-slate-500">No finance records are changed. Printing reads the live student fees and current-term payments.</p></div>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">Class<select className="input mt-1 min-w-52" value={classFilter} onChange={e => setClassFilter(e.target.value)}><option value="">All classes</option>{classes.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="border-b p-5"><h3 className="text-xl font-black">Students included</h3><p className="text-sm text-slate-500">Each student becomes exactly one A4 page when you print.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="p-4">Student</th><th>Class</th><th>Current receipts</th><th>Current balance</th><th>Next-term invoice</th></tr></thead><tbody>{documentData.map((r: any) => <tr key={r.student.id} className="border-t"><td className="p-4"><b>{r.student.name}</b><div className="text-xs text-slate-500">{r.student.admissionNo || '—'}</div></td><td>{r.student.className || 'Unassigned'}<div className="text-xs text-slate-500">{r.student.section || 'Day'}</div></td><td>{r.payments.length}<div className="text-xs text-slate-500">{money(currency, r.payments.reduce((n: number,p: any)=>n+Number(p.amount||0),0))}</div></td><td>{r.currentBalance == null ? '—' : money(currency, r.currentBalance)}</td><td>{r.nextFee ? money(currency, r.totalPayable) : <span className="text-amber-700">Not configured</span>}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  </AdminShell>;
}

const PRINT_CSS = `
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#16332e;font-family:'Segoe UI',Arial,sans-serif}
.sheet{width:210mm;height:297mm;padding:7mm 8mm 4mm;display:flex;flex-direction:column;page-break-after:always;break-after:page;background:#fffefa;position:relative;overflow:hidden}
.half{height:132mm;min-height:132mm;border:1px solid #c7b87f;border-radius:4mm;padding:5mm 6mm;overflow:hidden;position:relative}
.invoice{background:linear-gradient(135deg,#fffefa 0%,#f7fbf7 100%)}
.receipt{background:linear-gradient(135deg,#fbfcf8 0%,#fffdfa 100%)}
.doc-header{display:flex;align-items:flex-start;justify-content:space-between;gap:6mm;border-bottom:1.2mm solid #0b5d4b;padding-bottom:3mm}
.brand{min-width:0}.brand-name{font-size:12px;font-weight:900;text-transform:uppercase;line-height:1.15;color:#083f34}.brand-address{font-size:6.4px;line-height:1.35;color:#61726d;margin-top:1mm;text-transform:uppercase}
.doc-title{font-size:15px;line-height:1.05;text-align:right;font-weight:900;color:#075844;letter-spacing:.06em;white-space:nowrap}
.line{display:flex;justify-content:space-between;gap:5mm;font-size:8px;margin-top:2.5mm;color:#243f38}.line span{white-space:nowrap}
.term-banner{margin:3mm 0;padding:2.5mm;border:1px solid #9dc3b3;background:#edf8f1;border-radius:2mm;color:#075844;text-align:center;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
table{width:100%;border-collapse:collapse;margin-top:3mm;font-size:7.6px}th{background:#e9f2ee;color:#17483e;text-transform:uppercase;font-size:6.1px;letter-spacing:.05em;padding:2mm 1.8mm;text-align:left;border:1px solid #cbd5d0}th:last-child,td:last-child{text-align:right}td{padding:2mm 1.8mm;border:1px solid #d4ddd9;vertical-align:top}td small{display:block;font-size:6.2px;color:#73817d;margin-top:.5mm}.total td{font-weight:900;font-size:8.6px;background:#fff3d8;color:#6e5315;border-top:1.2px solid #c6a65d}
.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm;margin-top:3mm}.meta>div{border:1px solid #d5ddd8;border-radius:2mm;padding:2mm;font-size:6.6px;background:#fff}.meta b{font-size:5.5px;text-transform:uppercase;color:#70807b;letter-spacing:.06em}.invoice-foot{margin-top:2.5mm;padding-top:2.2mm;border-top:1px dashed #bfcac5;font-size:6.6px;color:#61706b}
.receipt-list{margin-top:3mm;display:flex;flex-direction:column;gap:1.4mm;max-height:51mm;overflow:hidden}.receipt-row{display:flex;justify-content:space-between;gap:4mm;padding:2mm 2.2mm;border:1px solid #d3ddd8;border-radius:2mm;background:#fff}.receipt-row b{font-size:7.4px;color:#0b604e}.receipt-row small{display:block;margin-top:.5mm;font-size:6.2px;color:#6d7b76}.receipt-row strong{font-size:8px;color:#0b604e;white-space:nowrap}.no-receipts{margin-top:4mm;border:1px dashed #c4cfca;border-radius:2mm;padding:7mm;text-align:center;font-size:7px;color:#75827e;background:#fff}
.receipt-total{display:grid;grid-template-columns:1fr 1fr;gap:2mm;margin-top:3mm}.receipt-total>div{border-radius:2.5mm;border:1px solid #cbd7d1;background:#eff7f2;padding:2.8mm;text-align:center}.receipt-total span{display:block;font-size:6px;text-transform:uppercase;letter-spacing:.05em;color:#668078}.receipt-total b{display:block;margin-top:1mm;font-size:11px;color:#075844}.ack{margin-top:2.5mm;padding:2.5mm;border-radius:2mm;background:#fff8e8;border-left:3px solid #caa44c;font-size:6.6px;color:#65582d}.signature{display:flex;justify-content:space-between;gap:10mm;margin-top:3mm;font-size:6.2px;color:#5e6d68}.signature span{border-top:1px solid #899690;padding-top:1.5mm;min-width:45mm;text-align:center}
.cut{height:7mm;flex:0 0 7mm;display:flex;align-items:center;justify-content:center;color:#887021;font-size:6px;font-weight:800;letter-spacing:.18em;border-top:1px dashed #b6a56d;border-bottom:1px dashed #b6a56d;margin:1mm 0}.cut span{background:#fffefa;padding:0 3mm}
.sheet-footer{margin-top:auto;height:4.5mm;display:flex;align-items:flex-end;justify-content:space-between;font-size:5.6px;color:#71807b;white-space:nowrap}.sheet-footer span:nth-child(2){font-weight:700;color:#49665d}
@media print{body{background:#fff}.sheet{margin:0}.half{break-inside:avoid}.cut{break-inside:avoid}}
`;