'use client';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import { loadStudents, loadCurrentAcademicTerm } from '@/lib/live-store';
import { createFeeStructure, updateFeeStructure, loadFeeStructures, loadFinanceSummary, recordPayment, syncStudentFeeAllocations } from '@/lib/admin-management-store';
import { createClient } from '@/lib/supabase/client';
import { Student } from '@/lib/data';
import { useEffect, useMemo, useState } from 'react';
import { loadCMSSettings, saveCMSSetting } from '@/lib/cms-live-store';

const tLabel = (t: any) => t?.term_number === 1 ? 'First Term' : t?.term_number === 2 ? 'Second Term' : t?.term_number === 3 ? 'Third Term' : t?.name || 'Term';

function findNextTerm(current: any, terms: any[]): any | null {
  if (!current) return null;
  if ((current.term_number || 0) < 3) {
    return terms.find(t => t.academic_year_id === current.academic_year_id && t.term_number === (current.term_number || 0) + 1) || null;
  }
  return terms.filter(t => current.ends_on && t.starts_on > current.ends_on).sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] || null;
}

function getStudentFee(structs: any[], termId: string | null, yearId: string | null, section: string) {
  const sec = String(section).toLowerCase() === 'boarding' ? 'boarding' : 'day';
  return structs.find(f => f.term_id === termId && f.section === sec)
    || structs.find(f => !f.term_id && f.academic_year_id === yearId && f.section === sec)
    || null;
}

function printReceipt(student: any, payment: any, bank: any, currency: string, schoolName: string) {
  const w = window.open('', '_blank', 'width=520,height=750');
  if (!w) return;
  const date = new Date(payment.paid_on || Date.now()).toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' });
  const refNo = String(payment.id || '').slice(-8).toUpperCase();
  w.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;padding:30px;font-size:13px;color:#1a1a1a}.top{text-align:center;padding-bottom:16px;border-bottom:3px solid #062d2a;margin-bottom:16px}.school{font-size:15px;font-weight:800;color:#062d2a}.sub{font-size:11px;color:#555;margin-top:3px}.badge{display:inline-block;background:#062d2a;color:#fff;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.06em;margin-top:9px}.ab{background:#f0fdf4;border:2px solid #86efac;border-radius:12px;text-align:center;padding:14px;margin:16px 0}.al{font-size:11px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.av{font-size:28px;font-weight:900;color:#062d2a;margin-top:4px}table{width:100%;border-collapse:collapse;margin-bottom:12px}td{padding:6px 4px;border-bottom:1px solid #f0f0f0;vertical-align:top}td:first-child{color:#666;width:40%}td:last-child{font-weight:600}.st{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#888;margin:12px 0 5px}.footer{margin-top:16px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px}@media print{body{padding:16px}}</style>
  </head><body>
  <div class="top"><div class="school">${schoolName||'AMQM'}</div><div class="sub">Aliyu and Maimuna Center for Qur'anic Memorization</div><div class="badge">PAYMENT RECEIPT</div></div>
  <div class="ab"><div class="al">Amount Paid</div><div class="av">${currency} ${Number(payment.amount||0).toLocaleString()}</div></div>
  <div class="st">Receipt details</div>
  <table><tr><td>Receipt No.</td><td>REC-${refNo}</td></tr><tr><td>Date</td><td>${date}</td></tr><tr><td>Method</td><td>${payment.method||'Cash'}</td></tr>${payment.reference?`<tr><td>Reference</td><td>${payment.reference}</td></tr>`:''}</table>
  <div class="st">Student</div>
  <table><tr><td>Name</td><td>${student.name||student.full_name||'—'}</td></tr><tr><td>Admission No.</td><td>${student.admissionNo||student.admission_no||'—'}</td></tr><tr><td>Class</td><td>${student.className||'—'}</td></tr><tr><td>Section</td><td>${student.section||'—'}</td></tr></table>
  ${bank?.bank_name?`<div class="st">School bank</div><table><tr><td>Bank</td><td>${bank.bank_name}</td></tr><tr><td>Account name</td><td>${bank.account_name||'—'}</td></tr><tr><td>Account No.</td><td>${bank.account_number||'—'}</td></tr></table>`:''}
  <div class="footer"><div>Official AMQM payment receipt</div><div style="margin-top:4px">Printed ${new Date().toLocaleDateString('en-NG')}</div></div>
  <script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

function printInvoice(student: any, nextTerm: any, structs: any[], bank: any, currency: string, schoolName: string) {
  if (!nextTerm) { alert('Could not determine next term. Set up terms in the school calendar first.'); return; }
  const sec = String(student.section).toLowerCase() === 'boarding' ? 'boarding' : 'day';
  const feeRow = getStudentFee(structs, nextTerm.id, nextTerm.academic_year_id, sec);
  const feeAmount = Number(feeRow?.amount ?? 0);
  const dueDate = feeRow?.due_date ? new Date(feeRow.due_date).toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
  const nextTermName = `${tLabel(nextTerm)} ${nextTerm.academic_years?.name||''}`.trim();
  const invoiceNo = `INV-${String(student.admissionNo||student.admission_no||'').toUpperCase()}-T${nextTerm.term_number||''}`;
  const w = window.open('', '_blank', 'width=520,height=780');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Invoice · ${student.name||student.full_name}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;padding:30px;font-size:13px;color:#1a1a1a}.top{text-align:center;padding-bottom:16px;border-bottom:3px solid #7c3500;margin-bottom:16px}.school{font-size:15px;font-weight:800;color:#7c3500}.sub{font-size:11px;color:#555;margin-top:3px}.badge{display:inline-block;background:#7c3500;color:#fff;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.06em;margin-top:9px}.term-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:center;padding:10px;margin-bottom:14px;font-weight:700;font-size:13px}.ab{background:#fff7ed;border:2px solid #fdba74;border-radius:12px;text-align:center;padding:14px;margin:16px 0}.al{font-size:11px;color:#9a3412;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.av{font-size:28px;font-weight:900;color:#7c3500;margin-top:4px}table{width:100%;border-collapse:collapse;margin-bottom:12px}td{padding:6px 4px;border-bottom:1px solid #f0f0f0;vertical-align:top}td:first-child{color:#666;width:40%}td:last-child{font-weight:600}.st{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#888;margin:12px 0 5px}.ref-box{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px;font-size:12px;color:#92400e;margin-top:8px}.footer{margin-top:16px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px}@media print{body{padding:16px}}</style>
  </head><body>
  <div class="top"><div class="school">${schoolName||'AMQM'}</div><div class="sub">Aliyu and Maimuna Center for Qur'anic Memorization</div><div class="badge">NEXT TERM INVOICE</div></div>
  <div class="term-box">For: ${nextTermName}</div>
  <div class="ab"><div class="al">Total Fees Due</div><div class="av">${currency} ${feeAmount.toLocaleString()}</div></div>
  <div class="st">Student</div>
  <table><tr><td>Name</td><td>${student.name||student.full_name||'—'}</td></tr><tr><td>Admission No.</td><td>${student.admissionNo||student.admission_no||'—'}</td></tr><tr><td>Class</td><td>${student.className||'—'}</td></tr><tr><td>Section</td><td>${sec.charAt(0).toUpperCase()+sec.slice(1)}</td></tr></table>
  <div class="st">Invoice</div>
  <table><tr><td>Invoice No.</td><td>${invoiceNo}</td></tr><tr><td>Due date</td><td>${dueDate}</td></tr><tr><td>Issued</td><td>${new Date().toLocaleDateString('en-NG',{day:'2-digit',month:'long',year:'numeric'})}</td></tr></table>
  ${bank?.bank_name?`<div class="st">Pay to</div><table><tr><td>Bank</td><td>${bank.bank_name}</td></tr><tr><td>Account name</td><td>${bank.account_name||'—'}</td></tr><tr><td>Account No.</td><td>${bank.account_number||'—'}</td></tr></table>`:''}
  <div class="ref-box"><b>Payment reference:</b> ${bank?.reference_instruction||`Use admission number ${student.admissionNo||student.admission_no||''} as payment reference`}</div>
  <div class="footer">Official AMQM invoice · Keep this document for your records<br><span style="margin-top:4px;display:block">Printed ${new Date().toLocaleDateString('en-NG')}</span></div>
  <script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

function bulkPrintReceipts(students: Student[], payments: any[], bank: any, currency: string, schoolName: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const pages = students.map(s => {
    const p = payments.find((x: any) => x.student_id === s.id);
    if (!p) return '';
    const date = new Date(p.paid_on||Date.now()).toLocaleDateString('en-NG',{day:'2-digit',month:'long',year:'numeric'});
    const refNo = String(p.id||'').slice(-8).toUpperCase();
    return `<div class="page"><div class="top"><div class="school">${schoolName||'AMQM'}</div><div class="badge">PAYMENT RECEIPT</div></div><div class="ab"><div class="al">Amount Paid</div><div class="av">${currency} ${Number(p.amount||0).toLocaleString()}</div></div><table><tr><td>Receipt No.</td><td>REC-${refNo}</td></tr><tr><td>Date</td><td>${date}</td></tr><tr><td>Method</td><td>${p.method||'Cash'}</td></tr>${p.reference?`<tr><td>Ref</td><td>${p.reference}</td></tr>`:''}</table><table><tr><td>Name</td><td>${s.name}</td></tr><tr><td>Admission</td><td>${s.admissionNo}</td></tr><tr><td>Class</td><td>${s.className||'—'}</td></tr><tr><td>Section</td><td>${s.section||'—'}</td></tr></table>${bank?.bank_name?`<table><tr><td>Bank</td><td>${bank.bank_name}</td></tr><tr><td>Account</td><td>${bank.account_number||'—'}</td></tr></table>`:''}</div>`;
  }).filter(Boolean);
  if (!pages.length) { w.close(); alert('No payment records found for this class.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>Bulk Receipts</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a1a}.page{padding:28px;page-break-after:always}.top{text-align:center;padding-bottom:14px;border-bottom:3px solid #062d2a;margin-bottom:14px}.school{font-size:14px;font-weight:800;color:#062d2a}.badge{display:inline-block;background:#062d2a;color:#fff;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:700;margin-top:8px}.ab{background:#f0fdf4;border:2px solid #86efac;border-radius:10px;text-align:center;padding:12px;margin:14px 0}.al{font-size:10px;color:#166534;font-weight:700;text-transform:uppercase}.av{font-size:24px;font-weight:900;color:#062d2a;margin-top:3px}table{width:100%;border-collapse:collapse;margin-bottom:10px}td{padding:5px 4px;border-bottom:1px solid #f0f0f0}td:first-child{color:#666;width:38%}td:last-child{font-weight:600}</style></head><body>${pages.join('')}<script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

function bulkPrintInvoices(students: Student[], currentTerm: any, terms: any[], structs: any[], bank: any, currency: string, schoolName: string) {
  const nextTerm = findNextTerm(currentTerm, terms);
  if (!nextTerm) { alert('Could not determine next term. Set up terms in school calendar first.'); return; }
  const nextTermName = `${tLabel(nextTerm)} ${nextTerm.academic_years?.name||''}`.trim();
  const w = window.open('', '_blank');
  if (!w) return;
  const pages = students.map(s => {
    const sec = String(s.section).toLowerCase() === 'boarding' ? 'boarding' : 'day';
    const feeRow = getStudentFee(structs, nextTerm.id, nextTerm.academic_year_id, sec);
    const feeAmount = Number(feeRow?.amount??0);
    const invoiceNo = `INV-${String(s.admissionNo||'').toUpperCase()}-T${nextTerm.term_number||''}`;
    return `<div class="page"><div class="top"><div class="school">${schoolName||'AMQM'}</div><div class="badge">NEXT TERM INVOICE</div></div><div class="term-box">For: ${nextTermName}</div><div class="ab"><div class="al">Fees Due</div><div class="av">${currency} ${feeAmount.toLocaleString()}</div></div><table><tr><td>Name</td><td>${s.name}</td></tr><tr><td>Admission</td><td>${s.admissionNo}</td></tr><tr><td>Class</td><td>${s.className||'—'}</td></tr><tr><td>Section</td><td>${sec.charAt(0).toUpperCase()+sec.slice(1)}</td></tr></table><table><tr><td>Invoice No.</td><td>${invoiceNo}</td></tr><tr><td>Issued</td><td>${new Date().toLocaleDateString('en-NG')}</td></tr></table>${bank?.bank_name?`<table><tr><td>Bank</td><td>${bank.bank_name}</td></tr><tr><td>Account name</td><td>${bank.account_name||'—'}</td></tr><tr><td>Account No.</td><td>${bank.account_number||'—'}</td></tr></table>`:''}<div class="ref-box">Ref: ${s.admissionNo||'Use admission number'}</div></div>`;
  });
  w.document.write(`<!DOCTYPE html><html><head><title>Bulk Invoices</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a1a}.page{padding:28px;page-break-after:always}.top{text-align:center;padding-bottom:14px;border-bottom:3px solid #7c3500;margin-bottom:14px}.school{font-size:14px;font-weight:800;color:#7c3500}.badge{display:inline-block;background:#7c3500;color:#fff;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:700;margin-top:8px}.term-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;text-align:center;padding:8px;margin-bottom:12px;font-weight:700}.ab{background:#fff7ed;border:2px solid #fdba74;border-radius:10px;text-align:center;padding:12px;margin:14px 0}.al{font-size:10px;color:#9a3412;font-weight:700;text-transform:uppercase}.av{font-size:24px;font-weight:900;color:#7c3500;margin-top:3px}table{width:100%;border-collapse:collapse;margin-bottom:10px}td{padding:5px 4px;border-bottom:1px solid #f0f0f0}td:first-child{color:#666;width:38%}td:last-child{font-weight:600}.ref-box{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px;font-size:11px;color:#92400e;margin-top:8px}</style></head><body>${pages.join('')}<script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

export default function Fees() {
  const [currency, setCurrency] = useState('₦');
  const [schoolName, setSchoolName] = useState('AMQM');
  const [students, setStudents] = useState<Student[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ fees: [], payments: [] });
  const [years, setYears] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all'|'full'|'partial'|'unpaid'>('all');
  const [bank, setBank] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [payTarget, setPayTarget] = useState<Student | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payRef, setPayRef] = useState('');
  const [paying, setPaying] = useState(false);

  const [showFeeConfig, setShowFeeConfig] = useState(false);
  const [showBankConfig, setShowBankConfig] = useState(false);
  const [fee, setFee] = useState({ id: '', academicYearId: '', termId: '', section: 'day' as 'day'|'boarding', name: 'Term Fee', amount: '', dueDate: '' });

  async function refresh() {
    const [s, fs, sm, cms, cur, y, t, siteMeta] = await Promise.all([
      loadStudents(), loadFeeStructures(), loadFinanceSummary(), loadCMSSettings(), loadCurrentAcademicTerm(),
      createClient().from('academic_years').select('id,name,is_current').order('starts_on', { ascending: false }).then(r => r.data || []),
      createClient().from('terms').select('id,name,term_number,academic_year_id,starts_on,ends_on,academic_years:academic_year_id(name,is_current)').order('starts_on', { ascending: false }).then(r => r.data || []),
      createClient().from('site_settings').select('key,value').then(r => r.data || []),
    ]);
    setStudents(s); setStructures(fs || []); setSummary(sm);
    setBank(cms.school_payment || {});
    setYears(y); setTerms(t);
    const meta: any = {};
    for (const r of siteMeta) meta[r.key] = r.value;
    setCurrency(meta.currency?.symbol || meta.currency?.code || '₦');
    setSchoolName(meta.school_name?.value || cms.school_name?.value || 'AMQM');
    if (!selectedTermId && cur?.term_id) setSelectedTermId(cur.term_id);
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const ch = createClient().channel('amqm-fees-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_fees' }, () => refresh())
      .subscribe();
    return () => { createClient().removeChannel(ch); };
  }, []);
  useEffect(() => { if (selectedTermId) syncStudentFeeAllocations(selectedTermId).then(() => refresh()).catch(() => {}); }, [selectedTermId]);

  const currentTerm = useMemo(() => terms.find(t => t.id === selectedTermId) || null, [terms, selectedTermId]);
  const nextTerm = useMemo(() => findNextTerm(currentTerm, terms), [currentTerm, terms]);

  const termFees = useMemo(() => summary.fees.filter((x: any) =>
    x.fee_structures?.term_id === selectedTermId ||
    (!x.fee_structures?.term_id && x.fee_structures?.academic_year_id === currentTerm?.academic_year_id)
  ), [summary, selectedTermId, currentTerm]);

  const byStudent = useMemo(() => {
    const map = new Map<string, { due: number; paid: number }>();
    for (const x of termFees) {
      const v = map.get(x.student_id) || { due: 0, paid: 0 };
      v.due += Number(x.amount_due || 0); v.paid += Number(x.amount_paid || 0);
      map.set(x.student_id, v);
    }
    return map;
  }, [termFees]);

  function getStatus(s: Student): 'full'|'partial'|'unpaid'|'none' {
    const v = byStudent.get(s.id) || { due: 0, paid: 0 };
    if (v.due <= 0) return 'none';
    if (v.paid >= v.due) return 'full';
    if (v.paid > 0) return 'partial';
    return 'unpaid';
  }

  const classNames = useMemo(() => [...new Set(students.map(s => s.className || 'Unassigned'))].sort(), [students]);
  const byClass = useMemo(() => classFilter ? students.filter(s => (s.className || 'Unassigned') === classFilter) : students, [students, classFilter]);
  const filtered = useMemo(() => statusFilter === 'all' ? byClass : byClass.filter(s => getStatus(s) === statusFilter), [byClass, statusFilter, byStudent]);

  const expected = useMemo(() => byClass.reduce((t, s) => t + (byStudent.get(s.id)?.due || 0), 0), [byClass, byStudent]);
  const collected = useMemo(() => byClass.reduce((t, s) => t + (byStudent.get(s.id)?.paid || 0), 0), [byClass, byStudent]);
  const outstanding = Math.max(0, expected - collected);
  const counts = useMemo(() => {
    let full = 0, partial = 0, unpaid = 0;
    for (const s of byClass) { const st = getStatus(s); if (st === 'full') full++; else if (st === 'partial') partial++; else if (st === 'unpaid') unpaid++; }
    return { full, partial, unpaid };
  }, [byClass, byStudent]);

  function openPay(s: Student) {
    const v = byStudent.get(s.id) || { due: 0, paid: 0 };
    setPayAmount(String(Math.max(0, v.due - v.paid) || ''));
    setPayMethod('Cash'); setPayRef(''); setPayTarget(s);
  }

  async function submitPay() {
    if (!payTarget || !payAmount) return;
    setPaying(true);
    try {
      const payment = await recordPayment({ studentId: payTarget.id, amount: Number(payAmount), method: payMethod, reference: payRef || undefined });
      await refresh();
      setPayTarget(null);
      printReceipt(payTarget, payment, bank, currency, schoolName);
    } catch (e: any) { setMessage(e?.message || 'Payment failed'); }
    finally { setPaying(false); }
  }

  const hasPaid = (s: Student) => summary.payments.some((p: any) => p.student_id === s.id);

  async function saveBank() { setBusy(true); try { await saveCMSSetting('school_payment', bank); setMessage('Bank account saved.'); } catch (e: any) { setMessage(e?.message || 'Failed'); } finally { setBusy(false); } }

  function startEdit(f: any) { setFee({ id: f.id, academicYearId: f.academic_year_id, termId: f.term_id || '', section: f.section, name: f.name, amount: String(f.amount), dueDate: f.due_date || '' }); setShowFeeConfig(true); }
  async function saveFee() {
    setBusy(true); setMessage('');
    try {
      if (fee.id) await updateFeeStructure(fee.id, { academicYearId: fee.academicYearId, termId: fee.termId || null, section: fee.section, name: fee.name, amount: Number(fee.amount), dueDate: fee.dueDate || null });
      else await createFeeStructure({ academicYearId: fee.academicYearId, termId: fee.termId || null, section: fee.section, name: fee.name, amount: Number(fee.amount), dueDate: fee.dueDate || null });
      setFee({ id: '', academicYearId: fee.academicYearId, termId: fee.termId, section: fee.section, name: 'Term Fee', amount: '', dueDate: '' });
      setMessage(fee.id ? 'Updated.' : 'Saved.'); await refresh();
    } catch (e: any) { setMessage(e?.message || 'Failed'); } finally { setBusy(false); }
  }

  const pillCls = (st: ReturnType<typeof getStatus>) =>
    st === 'full' ? 'bg-emerald-50 text-emerald-700' : st === 'partial' ? 'bg-amber-50 text-amber-700' : st === 'unpaid' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-400';
  const pillLabel = (st: ReturnType<typeof getStatus>) =>
    st === 'full' ? 'Paid in full' : st === 'partial' ? 'Partial' : st === 'unpaid' ? 'Unpaid' : 'No fee set';

  return (
    <AdminShell title="Finance & Fees">
      <div className="space-y-5">
        {message && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 cursor-pointer" onClick={() => setMessage('')}>{message} ×</div>}

        {/* Controls */}
        <section className="card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-black uppercase tracking-wide text-slate-500">
              Term
              <select className="input mt-1" value={selectedTermId} onChange={e => setSelectedTermId(e.target.value)}>
                <option value="">Select term</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.academic_years?.name} · {tLabel(t)}</option>)}
              </select>
            </label>
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">
              Class
              <select className="input mt-1 min-w-[180px]" value={classFilter} onChange={e => { setClassFilter(e.target.value); setStatusFilter('all'); }}>
                <option value="">All classes</option>
                {classNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {nextTerm && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 self-end">Next term: {tLabel(nextTerm)}</div>}
          </div>
        </section>

        {/* Financial overview */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Expected{classFilter ? ` · ${classFilter}` : ''}</div>
            <div className="mt-1 text-3xl font-black">{currency} {expected.toLocaleString()}</div>
          </div>
          <div className="card p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Collected</div>
            <div className="mt-1 text-3xl font-black text-emerald-700">{currency} {collected.toLocaleString()}</div>
            {expected > 0 && <div className="mt-1 text-xs text-slate-400">{Math.round((collected / expected) * 100)}% of expected</div>}
          </div>
          <div className="card p-5">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Outstanding</div>
            <div className={`mt-1 text-3xl font-black ${outstanding > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{currency} {outstanding.toLocaleString()}</div>
          </div>
        </div>

        {/* Status breakdown — clickable filters */}
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            { key: 'full' as const, label: 'Paid in full', count: counts.full, base: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100', ring: 'ring-2 ring-emerald-500', txt: 'text-emerald-900', icon: '✓' },
            { key: 'partial' as const, label: 'Partial payments', count: counts.partial, base: 'border-amber-200 bg-amber-50 hover:bg-amber-100', ring: 'ring-2 ring-amber-500', txt: 'text-amber-900', icon: '⟳' },
            { key: 'unpaid' as const, label: 'Not paid', count: counts.unpaid, base: 'border-rose-200 bg-rose-50 hover:bg-rose-100', ring: 'ring-2 ring-rose-500', txt: 'text-rose-900', icon: '✗' },
          ] as const).map(c => (
            <button key={c.key} onClick={() => setStatusFilter(statusFilter === c.key ? 'all' : c.key)}
              className={`rounded-2xl border p-4 text-left transition-all ${c.base} ${statusFilter === c.key ? c.ring : ''}`}>
              <div className={`flex items-center justify-between ${c.txt}`}>
                <div className="text-xs font-bold uppercase tracking-wide opacity-70">{c.label}</div>
                <span>{c.icon}</span>
              </div>
              <div className={`mt-1 text-3xl font-black ${c.txt}`}>{c.count}</div>
              <div className={`mt-0.5 text-xs opacity-50 ${c.txt}`}>{statusFilter === c.key ? 'Showing filtered · click to clear' : 'Click to filter table'}</div>
            </button>
          ))}
        </div>

        {/* Bulk actions — visible when class is selected */}
        {classFilter && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <span className="text-xs font-bold text-slate-600 mr-2">{classFilter} — bulk print:</span>
            <button
              onClick={() => bulkPrintReceipts(byClass.filter(hasPaid), summary.payments, bank, currency, schoolName)}
              className="btn bg-white border border-emerald-200 text-emerald-800 text-sm py-2 px-4 hover:bg-emerald-50"
            >
              All receipts for class
            </button>
            <button
              onClick={() => bulkPrintInvoices(byClass, currentTerm, terms, structures, bank, currency, schoolName)}
              className="btn bg-white border border-amber-200 text-amber-800 text-sm py-2 px-4 hover:bg-amber-50"
            >
              All invoices for class
            </button>
          </div>
        )}

        {/* Student payment table */}
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <h2 className="text-xl font-black">
                Students
                {classFilter && <span className="ml-2 font-normal text-slate-400">· {classFilter}</span>}
                {statusFilter !== 'all' && <span className="ml-1 font-normal text-slate-400">· {pillLabel(statusFilter as any)}</span>}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">{filtered.length} student{filtered.length !== 1 ? 's' : ''}</p>
            </div>
            {statusFilter !== 'all' && <button className="btn bg-slate-100 text-xs" onClick={() => setStatusFilter('all')}>Clear filter ×</button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-4">Student</th>
                  <th>Class / Section</th>
                  <th className="text-right pr-3">Due</th>
                  <th className="text-right pr-3">Paid</th>
                  <th className="text-right pr-3">Balance</th>
                  <th>Status</th>
                  <th className="pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const v = byStudent.get(s.id) || { due: 0, paid: 0 };
                  const bal = Math.max(0, v.due - v.paid);
                  const st = getStatus(s);
                  return (
                    <tr key={s.id} className="border-t hover:bg-slate-50/60 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 overflow-hidden rounded-xl bg-slate-100 shrink-0 flex items-center justify-center">
                            {s.photoUrl ? <img src={s.photoUrl} className="h-full w-full object-cover" alt="" /> : <span className="text-xs font-black text-slate-400">{s.name.charAt(0)}</span>}
                          </div>
                          <div>
                            <div className="font-semibold leading-tight">{s.name}</div>
                            <div className="text-xs text-slate-400">{s.admissionNo}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="text-sm">{s.className || 'Unassigned'}</div>
                        <SectionBadge section={s.section} />
                      </td>
                      <td className="text-right pr-3 font-mono tabular-nums text-slate-600">{v.due > 0 ? `${currency} ${v.due.toLocaleString()}` : '—'}</td>
                      <td className="text-right pr-3 font-mono tabular-nums text-emerald-700">{v.paid > 0 ? `${currency} ${v.paid.toLocaleString()}` : '—'}</td>
                      <td className="text-right pr-3 font-mono tabular-nums font-bold text-rose-600">{bal > 0 ? `${currency} ${bal.toLocaleString()}` : '—'}</td>
                      <td><span className={`pill ${pillCls(st)}`}>{pillLabel(st)}</span></td>
                      <td className="pr-3">
                        <div className="flex justify-end gap-1.5 flex-wrap">
                          <button onClick={() => openPay(s)} className="btn btn-primary text-xs py-1.5 px-3">
                            {st === 'full' ? '+ Pay' : 'Pay'}
                          </button>
                          {hasPaid(s) && (
                            <button onClick={() => printReceipt(s, summary.payments.find((p: any) => p.student_id === s.id), bank, currency, schoolName)} className="btn bg-emerald-50 text-emerald-800 border border-emerald-100 text-xs py-1.5 px-3">
                              Receipt
                            </button>
                          )}
                          <button onClick={() => printInvoice(s, nextTerm, structures, bank, currency, schoolName)} className="btn bg-amber-50 text-amber-800 border border-amber-100 text-xs py-1.5 px-3">
                            Invoice
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-10 text-center text-slate-400">No students match this selection.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Fee structures config */}
        <section className="card overflow-hidden">
          <button className="flex w-full items-center justify-between p-5 text-left hover:bg-slate-50" onClick={() => setShowFeeConfig(x => !x)}>
            <div>
              <div className="font-black">Fee structures</div>
              <div className="text-xs text-slate-500">Day and boarding fees per term — used on invoices and report cards</div>
            </div>
            <span className="text-slate-400 text-sm">{showFeeConfig ? '▲' : '▼'}</span>
          </button>
          {showFeeConfig && (
            <div className="border-t p-5 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <select className="input" value={fee.academicYearId} onChange={e => setFee({ ...fee, academicYearId: e.target.value })}>
                  <option value="">Academic year</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
                </select>
                <select className="input" value={fee.termId} onChange={e => setFee({ ...fee, termId: e.target.value })}>
                  <option value="">All terms in year</option>
                  {terms.filter(t => !fee.academicYearId || t.academic_year_id === fee.academicYearId).map(t => <option key={t.id} value={t.id}>{tLabel(t)}</option>)}
                </select>
                <select className="input" value={fee.section} onChange={e => setFee({ ...fee, section: e.target.value as any })}>
                  <option value="day">Day student</option>
                  <option value="boarding">Boarding student</option>
                </select>
                <input className="input" placeholder="Fee name (e.g. Term Fee)" value={fee.name} onChange={e => setFee({ ...fee, name: e.target.value })} />
                <input className="input" type="number" min="0" placeholder="Amount" value={fee.amount} onChange={e => setFee({ ...fee, amount: e.target.value })} />
                <input className="input" type="date" title="Due date" value={fee.dueDate} onChange={e => setFee({ ...fee, dueDate: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary" disabled={busy || !fee.academicYearId || !fee.name || !fee.amount} onClick={saveFee}>{fee.id ? 'Update' : 'Save'}</button>
                {fee.id && <button className="btn bg-slate-100" onClick={() => setFee({ id: '', academicYearId: '', termId: '', section: 'day', name: 'Term Fee', amount: '', dueDate: '' })}>Cancel</button>}
              </div>
              <div className="overflow-x-auto rounded-xl border text-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-xs uppercase"><tr><th className="p-3">Year</th><th>Term</th><th>Section</th><th>Name</th><th>Amount</th><th>Due date</th><th /></tr></thead>
                  <tbody>
                    {structures.map(f => (
                      <tr className="border-t" key={f.id}>
                        <td className="p-3 text-slate-600">{f.academic_years?.name || '—'}</td>
                        <td>{f.terms?.term_number ? tLabel(f.terms) : 'All terms'}</td>
                        <td><SectionBadge section={f.section === 'boarding' ? 'Boarding' : 'Day'} /></td>
                        <td>{f.name}</td>
                        <td className="font-mono font-semibold">{currency} {Number(f.amount).toLocaleString()}</td>
                        <td className="text-slate-400">{f.due_date || '—'}</td>
                        <td><button className="btn bg-slate-100 text-xs py-1" onClick={() => startEdit(f)}>Edit</button></td>
                      </tr>
                    ))}
                    {!structures.length && <tr><td colSpan={7} className="p-6 text-center text-slate-400 text-xs">No fee structures yet. Add one above.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Bank config */}
        <section className="card overflow-hidden">
          <button className="flex w-full items-center justify-between p-5 text-left hover:bg-slate-50" onClick={() => setShowBankConfig(x => !x)}>
            <div>
              <div className="font-black">Bank & payment account</div>
              <div className="text-xs text-slate-500">Printed on receipts and invoices</div>
            </div>
            <span className="text-slate-400 text-sm">{showBankConfig ? '▲' : '▼'}</span>
          </button>
          {showBankConfig && (
            <div className="border-t p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <input className="input" placeholder="Bank name" value={bank.bank_name || ''} onChange={e => setBank({ ...bank, bank_name: e.target.value })} />
                <input className="input" placeholder="Account name" value={bank.account_name || ''} onChange={e => setBank({ ...bank, account_name: e.target.value })} />
                <input className="input" placeholder="Account number" value={bank.account_number || ''} onChange={e => setBank({ ...bank, account_number: e.target.value })} />
                <input className="input" placeholder="Payment reference instruction (printed on invoice)" value={bank.reference_instruction || ''} onChange={e => setBank({ ...bank, reference_instruction: e.target.value })} />
              </div>
              <button className="btn btn-primary mt-4" disabled={busy} onClick={saveBank}>Save bank details</button>
            </div>
          )}
        </section>
      </div>

      {/* Payment modal */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-5" onClick={() => !paying && setPayTarget(null)}>
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 sm:rounded-3xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Record payment</div>
              <div className="mt-1 text-xl font-black">{payTarget.name}</div>
              <div className="text-xs text-slate-500">{payTarget.admissionNo} · {payTarget.className} · {payTarget.section}</div>
              {(() => { const v = byStudent.get(payTarget.id) || { due: 0, paid: 0 }; const b = Math.max(0, v.due - v.paid); return b > 0 ? <div className="mt-1.5 inline-block rounded-lg bg-rose-50 px-2 py-1 text-sm font-bold text-rose-700">Balance: {currency} {b.toLocaleString()}</div> : null; })()}
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-bold">
                Amount ({currency})
                <input className="input mt-1 w-full text-xl font-bold py-3" type="number" min="0" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus placeholder="0" />
              </label>
              <label className="block text-xs font-bold">
                Payment method
                <select className="input mt-1 w-full" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  <option>Cash</option>
                  <option>Bank transfer</option>
                  <option>Mobile money</option>
                  <option>Card</option>
                  <option>Cheque</option>
                  <option>Other</option>
                </select>
              </label>
              <label className="block text-xs font-bold">
                Reference / transaction ID <span className="font-normal text-slate-400">(optional)</span>
                <input className="input mt-1 w-full" value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="e.g. TRX12345678" />
              </label>
            </div>
            <div className="mt-6 flex gap-2">
              <button className="btn bg-slate-100 flex-1 py-3" onClick={() => setPayTarget(null)} disabled={paying}>Cancel</button>
              <button className="btn btn-primary flex-1 py-3 font-black text-base" disabled={paying || !payAmount} onClick={submitPay}>
                {paying ? 'Saving…' : 'Save & Print Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
