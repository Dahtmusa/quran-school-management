'use client';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import { loadStudents, loadCurrentAcademicTerm } from '@/lib/live-store';
import { createFeeStructure, updateFeeStructure, deleteFeeStructure, loadFeeStructures, loadFinanceSummary, recordPayment, voidPayment, syncStudentFeeAllocations } from '@/lib/admin-management-store';
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

function schoolHeader(logoUrl: string, schoolName: string, schoolAddress: string, badgeLabel: string, accentColor: string) {
  return `<div class="top">
    ${logoUrl ? `<img src="${logoUrl}" style="height:64px;max-width:180px;object-fit:contain;margin-bottom:8px;" alt="logo">` : ''}
    <div class="school" style="color:${accentColor}">${schoolName || 'AMQM'}</div>
    ${schoolAddress ? `<div class="sub">${schoolAddress}</div>` : ''}
    <div class="badge" style="background:${accentColor}">${badgeLabel}</div>
  </div>`;
}

function printReceipt(student: any, payment: any, bank: any, currency: string, schoolName: string, logoUrl = '', schoolAddress = '') {
  const w = window.open('', '_blank', 'width=520,height=780');
  if (!w) return;
  const date = new Date(payment.paid_on || Date.now()).toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' });
  const refNo = String(payment.id || '').slice(-8).toUpperCase();
  const accent = '#062d2a';
  w.document.write(`<!DOCTYPE html><html><head><title>Receipt · ${student.name||student.full_name||''}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;padding:30px;font-size:13px;color:#1a1a1a}.top{text-align:center;padding-bottom:16px;border-bottom:3px solid ${accent};margin-bottom:16px}.school{font-size:16px;font-weight:800;letter-spacing:-.01em}.sub{font-size:11px;color:#555;margin-top:3px}.badge{display:inline-block;color:#fff;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.06em;margin-top:9px}.ab{background:#f0fdf4;border:2px solid #86efac;border-radius:12px;text-align:center;padding:14px;margin:16px 0}.al{font-size:11px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.av{font-size:28px;font-weight:900;color:${accent};margin-top:4px}table{width:100%;border-collapse:collapse;margin-bottom:12px}td{padding:6px 4px;border-bottom:1px solid #f0f0f0;vertical-align:top}td:first-child{color:#666;width:40%}td:last-child{font-weight:600}.st{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#888;margin:12px 0 5px}.footer{margin-top:16px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px}@media print{body{padding:16px}}</style>
  </head><body>
  ${schoolHeader(logoUrl, schoolName, schoolAddress, 'PAYMENT RECEIPT', accent)}
  <div class="ab"><div class="al">Amount Paid</div><div class="av">${currency} ${Number(payment.amount||0).toLocaleString()}</div></div>
  <div class="st">Receipt details</div>
  <table><tr><td>Receipt No.</td><td>REC-${refNo}</td></tr><tr><td>Date</td><td>${date}</td></tr><tr><td>Method</td><td>${payment.method||'Cash'}</td></tr>${payment.reference?`<tr><td>Reference</td><td>${payment.reference}</td></tr>`:''}</table>
  <div class="st">Student</div>
  <table><tr><td>Name</td><td>${student.name||student.full_name||'—'}</td></tr><tr><td>Admission No.</td><td>${student.admissionNo||student.admission_no||'—'}</td></tr><tr><td>Class</td><td>${student.className||'—'}</td></tr><tr><td>Section</td><td>${student.section||'—'}</td></tr></table>
  ${bank?.bank_name?`<div class="st">School bank account</div><table><tr><td>Bank</td><td>${bank.bank_name}</td></tr><tr><td>Account name</td><td>${bank.account_name||'—'}</td></tr><tr><td>Account No.</td><td>${bank.account_number||'—'}</td></tr></table>`:''}
  <div class="footer"><div>Official ${schoolName||'AMQM'} payment receipt · Keep for your records</div><div style="margin-top:4px">Printed ${new Date().toLocaleDateString('en-NG')}</div></div>
  <script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

function printInvoice(student: any, nextTerm: any, structs: any[], bank: any, currency: string, schoolName: string, logoUrl = '', schoolAddress = '') {
  if (!nextTerm) { alert('Could not determine next term. Set up terms in the school calendar first.'); return; }
  const sec = String(student.section).toLowerCase() === 'boarding' ? 'boarding' : 'day';
  const feeRow = getStudentFee(structs, nextTerm.id, nextTerm.academic_year_id, sec);
  if (!feeRow) { alert(`No fee structure found for ${sec} students in ${tLabel(nextTerm)}. Please configure fee structures first.`); return; }
  const feeAmount = Number(feeRow.amount);
  const dueDate = feeRow.due_date ? new Date(feeRow.due_date).toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
  const nextTermName = `${tLabel(nextTerm)} ${nextTerm.academic_years?.name||''}`.trim();
  const invoiceNo = `INV-${String(student.admissionNo||student.admission_no||'').toUpperCase()}-T${nextTerm.term_number||''}`;
  const accent = '#062d2a';
  const w = window.open('', '_blank', 'width=520,height=820');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>Invoice · ${student.name||student.full_name}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;padding:30px;font-size:13px;color:#1a1a1a}.top{text-align:center;padding-bottom:16px;border-bottom:3px solid ${accent};margin-bottom:16px}.school{font-size:16px;font-weight:800;letter-spacing:-.01em}.sub{font-size:11px;color:#555;margin-top:3px}.badge{display:inline-block;color:#fff;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.06em;margin-top:9px}.term-box{background:#f0fdf4;border:2px solid #86efac;border-radius:8px;text-align:center;padding:10px;margin-bottom:14px;font-weight:700;font-size:13px;color:${accent}}.ab{background:#f0fdf4;border:2px solid #86efac;border-radius:12px;text-align:center;padding:14px;margin:16px 0}.al{font-size:11px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.av{font-size:28px;font-weight:900;color:${accent};margin-top:4px}table{width:100%;border-collapse:collapse;margin-bottom:12px}td{padding:6px 4px;border-bottom:1px solid #f0f0f0;vertical-align:top}td:first-child{color:#666;width:40%}td:last-child{font-weight:600}.st{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#888;margin:12px 0 5px}.ref-box{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px;font-size:12px;color:#166534;margin-top:8px}.footer{margin-top:16px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px}@media print{body{padding:16px}}</style>
  </head><body>
  ${schoolHeader(logoUrl, schoolName, schoolAddress, 'SCHOOL FEES INVOICE', accent)}
  <div class="term-box">For: ${nextTermName}</div>
  <div class="ab"><div class="al">Total Fees Due</div><div class="av">${currency} ${feeAmount.toLocaleString()}</div></div>
  <div class="st">Student</div>
  <table><tr><td>Name</td><td>${student.name||student.full_name||'—'}</td></tr><tr><td>Admission No.</td><td>${student.admissionNo||student.admission_no||'—'}</td></tr><tr><td>Class</td><td>${student.className||'—'}</td></tr><tr><td>Section</td><td>${sec.charAt(0).toUpperCase()+sec.slice(1)}</td></tr></table>
  <div class="st">Invoice</div>
  <table><tr><td>Invoice No.</td><td>${invoiceNo}</td></tr><tr><td>Due date</td><td>${dueDate}</td></tr><tr><td>Issued</td><td>${new Date().toLocaleDateString('en-NG',{day:'2-digit',month:'long',year:'numeric'})}</td></tr></table>
  ${bank?.bank_name?`<div class="st">Pay to</div><table><tr><td>Bank</td><td>${bank.bank_name}</td></tr><tr><td>Account name</td><td>${bank.account_name||'—'}</td></tr><tr><td>Account No.</td><td><b>${bank.account_number||'—'}</b></td></tr></table>`:''}
  <div class="ref-box"><b>Payment reference:</b> ${bank?.reference_instruction||`Use admission number ${student.admissionNo||student.admission_no||''} as payment reference`}</div>
  <div class="footer">Official ${schoolName||'AMQM'} fee invoice · Keep this document for your records<br><span style="margin-top:4px;display:block">Printed ${new Date().toLocaleDateString('en-NG')}</span></div>
  <script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

function bulkPrintReceipts(students: Student[], payments: any[], bank: any, currency: string, schoolName: string, logoUrl = '', schoolAddress = '') {
  const w = window.open('', '_blank');
  if (!w) return;
  const accent = '#062d2a';
  const logoTag = logoUrl ? `<img src="${logoUrl}" style="height:48px;max-width:160px;object-fit:contain;margin-bottom:6px;" alt="logo">` : '';
  const pages = students.map(s => {
    const p = payments.find((x: any) => x.student_id === s.id);
    if (!p) return '';
    const date = new Date(p.paid_on||Date.now()).toLocaleDateString('en-NG',{day:'2-digit',month:'long',year:'numeric'});
    const refNo = String(p.id||'').slice(-8).toUpperCase();
    return `<div class="page"><div class="top">${logoTag}<div class="school">${schoolName||'AMQM'}</div>${schoolAddress?`<div class="addr">${schoolAddress}</div>`:''}<div class="badge">PAYMENT RECEIPT</div></div><div class="ab"><div class="al">Amount Paid</div><div class="av">${currency} ${Number(p.amount||0).toLocaleString()}</div></div><table><tr><td>Receipt No.</td><td>REC-${refNo}</td></tr><tr><td>Date</td><td>${date}</td></tr><tr><td>Method</td><td>${p.method||'Cash'}</td></tr>${p.reference?`<tr><td>Ref</td><td>${p.reference}</td></tr>`:''}</table><table><tr><td>Name</td><td>${s.name}</td></tr><tr><td>Admission</td><td>${s.admissionNo}</td></tr><tr><td>Class</td><td>${s.className||'—'}</td></tr><tr><td>Section</td><td>${s.section||'—'}</td></tr></table>${bank?.bank_name?`<table><tr><td>Bank</td><td>${bank.bank_name}</td></tr><tr><td>Account</td><td>${bank.account_number||'—'}</td></tr></table>`:''}</div>`;
  }).filter(Boolean);
  if (!pages.length) { w.close(); alert('No payment records found for this class.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>Bulk Receipts</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a1a}.page{padding:28px;page-break-after:always}.top{text-align:center;padding-bottom:14px;border-bottom:3px solid ${accent};margin-bottom:14px}.school{font-size:14px;font-weight:800;color:${accent}}.addr{font-size:10px;color:#555;margin-top:2px}.badge{display:inline-block;background:${accent};color:#fff;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:700;margin-top:8px}.ab{background:#f0fdf4;border:2px solid #86efac;border-radius:10px;text-align:center;padding:12px;margin:14px 0}.al{font-size:10px;color:#166534;font-weight:700;text-transform:uppercase}.av{font-size:24px;font-weight:900;color:${accent};margin-top:3px}table{width:100%;border-collapse:collapse;margin-bottom:10px}td{padding:5px 4px;border-bottom:1px solid #f0f0f0}td:first-child{color:#666;width:38%}td:last-child{font-weight:600}</style></head><body>${pages.join('')}<script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

function bulkPrintInvoices(students: Student[], currentTerm: any, terms: any[], structs: any[], bank: any, currency: string, schoolName: string, logoUrl = '', schoolAddress = '') {
  const nextTerm = findNextTerm(currentTerm, terms);
  if (!nextTerm) { alert('Could not determine next term. Set up terms in school calendar first.'); return; }
  const nextTermName = `${tLabel(nextTerm)} ${nextTerm.academic_years?.name||''}`.trim();
  const accent = '#062d2a';
  const logoTag = logoUrl ? `<img src="${logoUrl}" style="height:48px;max-width:160px;object-fit:contain;margin-bottom:6px;" alt="logo">` : '';
  const w = window.open('', '_blank');
  if (!w) return;
  const pages = students.map(s => {
    const sec = String(s.section).toLowerCase() === 'boarding' ? 'boarding' : 'day';
    const feeRow = getStudentFee(structs, nextTerm.id, nextTerm.academic_year_id, sec);
    if (!feeRow) return '';
    const feeAmount = Number(feeRow.amount);
    const invoiceNo = `INV-${String(s.admissionNo||'').toUpperCase()}-T${nextTerm.term_number||''}`;
    return `<div class="page"><div class="top">${logoTag}<div class="school">${schoolName||'AMQM'}</div>${schoolAddress?`<div class="addr">${schoolAddress}</div>`:''}<div class="badge">SCHOOL FEES INVOICE</div></div><div class="term-box">For: ${nextTermName}</div><div class="ab"><div class="al">Fees Due</div><div class="av">${currency} ${feeAmount.toLocaleString()}</div></div><table><tr><td>Name</td><td>${s.name}</td></tr><tr><td>Admission</td><td>${s.admissionNo}</td></tr><tr><td>Class</td><td>${s.className||'—'}</td></tr><tr><td>Section</td><td>${sec.charAt(0).toUpperCase()+sec.slice(1)}</td></tr></table><table><tr><td>Invoice No.</td><td>${invoiceNo}</td></tr><tr><td>Issued</td><td>${new Date().toLocaleDateString('en-NG')}</td></tr></table>${bank?.bank_name?`<table><tr><td>Bank</td><td>${bank.bank_name}</td></tr><tr><td>Account name</td><td>${bank.account_name||'—'}</td></tr><tr><td>Account No.</td><td><b>${bank.account_number||'—'}</b></td></tr></table>`:''}<div class="ref-box">Ref: ${s.admissionNo||'Use admission number'}</div></div>`;
  }).filter(Boolean);
  if (!pages.length) { w.close(); alert('No fee structures configured for the next term yet.'); return; }
  w.document.write(`<!DOCTYPE html><html><head><title>Bulk Invoices</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a1a}.page{padding:28px;page-break-after:always}.top{text-align:center;padding-bottom:14px;border-bottom:3px solid ${accent};margin-bottom:14px}.school{font-size:14px;font-weight:800;color:${accent}}.addr{font-size:10px;color:#555;margin-top:2px}.badge{display:inline-block;background:${accent};color:#fff;padding:3px 12px;border-radius:20px;font-size:10px;font-weight:700;margin-top:8px}.term-box{background:#f0fdf4;border:2px solid #86efac;border-radius:6px;text-align:center;padding:8px;margin-bottom:12px;font-weight:700;color:${accent}}.ab{background:#f0fdf4;border:2px solid #86efac;border-radius:10px;text-align:center;padding:12px;margin:14px 0}.al{font-size:10px;color:#166534;font-weight:700;text-transform:uppercase}.av{font-size:24px;font-weight:900;color:${accent};margin-top:3px}table{width:100%;border-collapse:collapse;margin-bottom:10px}td{padding:5px 4px;border-bottom:1px solid #f0f0f0}td:first-child{color:#666;width:38%}td:last-child{font-weight:600}.ref-box{background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:8px;font-size:11px;color:#166534;margin-top:8px}</style></head><body>${pages.join('')}<script>window.onload=()=>window.print();<\/script></body></html>`);
  w.document.close();
}

export default function Fees() {
  const [currency, setCurrency] = useState('₦');
  const [schoolName, setSchoolName] = useState('AMQM');
  const [schoolAddress, setSchoolAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
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

  const [historyTarget, setHistoryTarget] = useState<Student | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);

  const [showFeeConfig, setShowFeeConfig] = useState(true);
  const [showBankConfig, setShowBankConfig] = useState(true);
  // Simplified combined fee form: one row = both day + boarding amounts
  const [feeForm, setFeeForm] = useState({ academicYearId: '', termId: '', dayAmount: '', boardingAmount: '', dueDate: '' });

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
    setLogoUrl(meta.logo_url?.value || '');
    setSchoolAddress(meta.contact?.address || '');
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
  const previousOutstanding = useMemo(() => {
    const currentStart = currentTerm?.starts_on ? String(currentTerm.starts_on) : '';
    const allowed = new Set(byClass.map(s => s.id));
    return (summary.fees || []).reduce((total: number, row: any) => {
      if (!allowed.has(row.student_id)) return total;
      const fs = row.fee_structures;
      const termId = fs?.term_id;
      if (!termId || termId === selectedTermId) return total;
      const priorTerm = terms.find((t: any) => t.id === termId);
      if (!priorTerm?.starts_on || !currentStart || String(priorTerm.starts_on) >= currentStart) return total;
      return total + Math.max(0, Number(row.amount_due || 0) - Number(row.amount_paid || 0));
    }, 0);
  }, [summary.fees, byClass, selectedTermId, currentTerm, terms]);
  const totalPayable = expected + previousOutstanding;
  const totalOutstanding = Math.max(0, totalPayable - collected);
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
    if (!payTarget || !payAmount || !selectedTermId) return;
    setPaying(true);
    try {
      const payment = await recordPayment({ studentId: payTarget.id, termId: selectedTermId, amount: Number(payAmount), method: payMethod, reference: payRef || undefined });
      await refresh();
      setPayTarget(null);
      printReceipt(payTarget, payment, bank, currency, schoolName, logoUrl, schoolAddress);
    } catch (e: any) { setMessage(e?.message || 'Payment failed'); }
    finally { setPaying(false); }
  }

  async function markFullyPaid(s: Student) {
    const v = byStudent.get(s.id) || { due: 0, paid: 0 };
    const bal = Math.max(0, v.due - v.paid);
    if (bal <= 0 || !selectedTermId) return;
    if (!confirm(`Mark ${s.name} as fully paid?\nAmount: ${currency} ${bal.toLocaleString()}`)) return;
    try {
      const payment = await recordPayment({ studentId: s.id, termId: selectedTermId, amount: bal, method: 'Cash' });
      await refresh();
      printReceipt(s, payment, bank, currency, schoolName, logoUrl, schoolAddress);
    } catch (e: any) { setMessage(e?.message || 'Failed to record payment'); }
  }

  const termPayments = useMemo(() =>
    summary.payments.filter((p: any) => p.term_id === selectedTermId),
    [summary.payments, selectedTermId]
  );
  const hasPaid = (s: Student) => termPayments.some((p: any) => p.student_id === s.id);
  const allPaymentsForStudent = (s: Student) => summary.payments.filter((p: any) => p.student_id === s.id);

  async function handleVoid(paymentId: string) {
    if (!confirm('Void this payment? The student\'s balance will be recalculated from remaining payments.')) return;
    setVoiding(paymentId);
    try {
      await voidPayment(paymentId);
      await refresh();
    } catch (e: any) { setMessage(e?.message || 'Failed to void payment'); }
    finally { setVoiding(null); }
  }

  async function saveBank() { setBusy(true); try { await saveCMSSetting('school_payment', bank); setMessage('Bank account saved.'); } catch (e: any) { setMessage(e?.message || 'Failed'); } finally { setBusy(false); } }

  // Group structures: one entry per (year, term) showing both day + boarding
  const feeGroups = useMemo(() => {
    const map = new Map<string, any>();
    for (const f of structures) {
      const key = `${f.academic_year_id}|${f.term_id || 'all'}`;
      if (!map.has(key)) map.set(key, { yearId: f.academic_year_id, termId: f.term_id || null, year: f.academic_years, term: f.terms, dueDate: f.due_date, day: null, boarding: null });
      const g = map.get(key);
      if (f.section === 'day') { g.day = f; if (f.due_date) g.dueDate = f.due_date; }
      if (f.section === 'boarding') g.boarding = f;
    }
    return [...map.values()].sort((a, b) => (b.year?.name || '').localeCompare(a.year?.name || '') || (a.term?.term_number || 0) - (b.term?.term_number || 0));
  }, [structures]);

  function startEditGroup(g: any) {
    setFeeForm({ academicYearId: g.yearId, termId: g.termId || '', dayAmount: String(g.day?.amount ?? ''), boardingAmount: String(g.boarding?.amount ?? ''), dueDate: g.dueDate || '' });
    setShowFeeConfig(true);
  }

  async function saveFees() {
    if (!feeForm.academicYearId) return;
    setBusy(true); setMessage('');
    try {
      const base = { academicYearId: feeForm.academicYearId, termId: feeForm.termId || null, name: 'Term Fee', dueDate: feeForm.dueDate || null };
      const existing = structures.filter(f => f.academic_year_id === feeForm.academicYearId && (f.term_id || null) === (feeForm.termId || null));
      const existDay = existing.find(f => f.section === 'day');
      const existBoard = existing.find(f => f.section === 'boarding');
      if (feeForm.dayAmount) {
        if (existDay) await updateFeeStructure(existDay.id, { ...base, section: 'day', amount: Number(feeForm.dayAmount) });
        else await createFeeStructure({ ...base, section: 'day', amount: Number(feeForm.dayAmount) });
      }
      if (feeForm.boardingAmount) {
        if (existBoard) await updateFeeStructure(existBoard.id, { ...base, section: 'boarding', amount: Number(feeForm.boardingAmount) });
        else await createFeeStructure({ ...base, section: 'boarding', amount: Number(feeForm.boardingAmount) });
      }
      setFeeForm(f => ({ ...f, dayAmount: '', boardingAmount: '', dueDate: '' }));
      setMessage('Fee structure saved.'); await refresh();
    } catch (e: any) { setMessage(e?.message || 'Failed'); } finally { setBusy(false); }
  }

  async function deleteFeeGroup(g: any) {
    if (!confirm(`Delete fee structure for ${g.year?.name || ''} · ${g.termId ? tLabel(g.term) : 'All terms'}? Student fee records for this structure will also be removed.`)) return;
    try {
      if (g.day) await deleteFeeStructure(g.day.id);
      if (g.boarding) await deleteFeeStructure(g.boarding.id);
      setMessage('Deleted.'); await refresh();
    } catch (e: any) { setMessage(e?.message || 'Delete failed: ' + e?.message); }
  }

  const pillCls = (st: ReturnType<typeof getStatus>) =>
    st === 'full' ? 'bg-emerald-50 text-emerald-700' : st === 'partial' ? 'bg-amber-50 text-amber-700' : st === 'unpaid' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-400';
  const pillLabel = (st: ReturnType<typeof getStatus>) =>
    st === 'full' ? 'Paid in full' : st === 'partial' ? 'Partial' : st === 'unpaid' ? 'Unpaid' : 'No fee set';

  return (
    <AdminShell title="Finance & Fees">
      <div className="space-y-6 pb-8">
        {/* Page heading */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">AMQM · Finance</div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Finance & Fees</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Monitor fee collection, student balances, payments and term fee structures from one place.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
              {currentTerm ? `${currentTerm.academic_years?.name || ''} · ${tLabel(currentTerm)}` : 'No active term'}
            </div>
            {nextTerm && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Next: {tLabel(nextTerm)}
              </div>
            )}
          </div>
        </div>

        {message && (
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-800 shadow-sm"
            onClick={() => setMessage('')}
          >
            <span>✓ {message}</span><span className="text-lg leading-none">×</span>
          </button>
        )}

        {/* Filters */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">View controls</div>
              <div className="mt-0.5 text-xs text-slate-400">Choose a term and class to update the finance dashboard.</div>
            </div>
            <span className="hidden rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:inline">
              Live data
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_260px_auto] md:items-end">
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">
              Term
              <select className="input mt-1.5 h-11 w-full rounded-xl" value={selectedTermId} onChange={e => setSelectedTermId(e.target.value)}>
                <option value="">Select term</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.academic_years?.name} · {tLabel(t)}</option>)}
              </select>
            </label>
            <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">
              Class
              <select className="input mt-1.5 h-11 w-full rounded-xl" value={classFilter} onChange={e => { setClassFilter(e.target.value); setStatusFilter('all'); }}>
                <option value="">All classes</option>
                {classNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
              <span className="font-bold text-slate-800">Selected:</span> {classFilter || 'All students'}
            </div>
          </div>
        </section>

        {selectedTermId && termFees.length === 0 && structures.length > 0 && (
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            <span className="mt-0.5 text-base">⚠</span>
            <div><b>No fees configured for this term.</b> Existing fee structures do not match the selected term. Review and configure fees below.</div>
          </div>
        )}
        {selectedTermId && structures.length === 0 && (
          <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 shadow-sm">
            <span className="mt-0.5">ⓘ</span>
            <div>No fee structures have been set up yet. Configure day and boarding fees in <b>Fee structures</b> below.</div>
          </div>
        )}

        {/* Financial overview */}
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900">Term financial overview</h2>
              <p className="mt-0.5 text-xs text-slate-400">{classFilter || 'All classes'} · {currentTerm ? tLabel(currentTerm) : 'Selected term'}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Current term fees', value: expected, cls: 'text-slate-950', icon: '₦', bg: 'bg-slate-100 text-slate-700' },
              { label: 'Paid this term', value: collected, cls: 'text-emerald-700', icon: '✓', bg: 'bg-emerald-100 text-emerald-700', sub: expected > 0 ? `${Math.round((collected / expected) * 100)}% of expected` : '' },
              { label: 'Previous balance', value: previousOutstanding, cls: 'text-rose-600', icon: '↗', bg: 'bg-rose-100 text-rose-700' },
              { label: 'Total payable', value: totalPayable, cls: 'text-slate-950', icon: '≡', bg: 'bg-slate-100 text-slate-700' },
              { label: 'Total outstanding', value: totalOutstanding, cls: totalOutstanding > 0 ? 'text-rose-600' : 'text-emerald-700', icon: '!', bg: totalOutstanding > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700' },
            ].map((m: any) => (
              <div key={m.label} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{m.label}</div>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-black ${m.bg}`}>{m.icon}</span>
                </div>
                <div className={`mt-3 text-2xl font-black tracking-tight ${m.cls}`}>{currency} {Number(m.value || 0).toLocaleString()}</div>
                {m.sub && <div className="mt-1 text-[11px] font-semibold text-slate-400">{m.sub}</div>}
              </div>
            ))}
          </div>
        </section>

        {/* Collection status */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900">Collection status</h2>
              <p className="text-xs text-slate-400">Click a status to filter the student ledger.</p>
            </div>
            {statusFilter !== 'all' && (
              <button className="text-xs font-bold text-emerald-700 hover:text-emerald-900" onClick={() => setStatusFilter('all')}>Clear status filter ×</button>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {([
              { key: 'full' as const, label: 'Paid in full', count: counts.full, note: 'Fully settled', icon: '✓', cls: 'border-emerald-200 bg-emerald-50/70 text-emerald-900', iconCls: 'bg-emerald-600 text-white' },
              { key: 'partial' as const, label: 'Partial payments', count: counts.partial, note: 'Balance remaining', icon: '◔', cls: 'border-amber-200 bg-amber-50/70 text-amber-900', iconCls: 'bg-amber-500 text-white' },
              { key: 'unpaid' as const, label: 'Not paid', count: counts.unpaid, note: 'Action required', icon: '!', cls: 'border-rose-200 bg-rose-50/70 text-rose-900', iconCls: 'bg-rose-600 text-white' },
            ] as const).map(c => (
              <button key={c.key} onClick={() => setStatusFilter(statusFilter === c.key ? 'all' : c.key)}
                className={`rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${c.cls} ${statusFilter === c.key ? 'ring-2 ring-offset-1 ring-slate-900/20' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.12em] opacity-60">{c.label}</div>
                    <div className="mt-1 text-3xl font-black">{c.count}</div>
                    <div className="mt-0.5 text-[11px] font-medium opacity-60">{c.note}</div>
                  </div>
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-black shadow-sm ${c.iconCls}`}>{c.icon}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Bulk actions */}
        {classFilter && (
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-black text-slate-900">{classFilter}</div>
              <div className="text-xs text-slate-400">Bulk documents for this class</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => bulkPrintReceipts(byClass.filter(hasPaid), summary.payments, bank, currency, schoolName, logoUrl, schoolAddress)}
                className="btn border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-800 hover:bg-emerald-100">
                Print receipts
              </button>
              <button onClick={() => bulkPrintInvoices(byClass, currentTerm, terms, structures, bank, currency, schoolName, logoUrl, schoolAddress)}
                className="btn border border-amber-200 bg-amber-50 text-sm font-bold text-amber-800 hover:bg-amber-100">
                Print invoices
              </button>
            </div>
          </div>
        )}

        {/* Student ledger */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight text-slate-950">Student ledger</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">{filtered.length}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                {classFilter || 'All classes'}{statusFilter !== 'all' ? ` · ${pillLabel(statusFilter as any)}` : ''} · Current term
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <span className="font-bold text-slate-700">Outstanding:</span> {currency} {outstanding.toLocaleString()}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50/90 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Student</th>
                  <th className="px-3 py-3.5">Class / Section</th>
                  <th className="px-3 py-3.5 text-right">Due</th>
                  <th className="px-3 py-3.5 text-right">Paid</th>
                  <th className="px-3 py-3.5 text-right">Balance</th>
                  <th className="px-3 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const v = byStudent.get(s.id) || { due: 0, paid: 0 };
                  const bal = Math.max(0, v.due - v.paid);
                  const st = getStatus(s);
                  return (
                    <tr key={s.id} className="border-t border-slate-100 transition-colors hover:bg-emerald-50/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
                            {s.photoUrl ? <img src={s.photoUrl} className="h-full w-full object-cover" alt="" /> : <span className="flex h-full w-full items-center justify-center text-sm font-black text-slate-400">{s.name.charAt(0)}</span>}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-bold text-slate-900">{s.name}</div>
                            <div className="mt-0.5 text-[10px] font-medium text-slate-400">{s.admissionNo}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="max-w-[180px] text-xs font-semibold text-slate-700">{s.className || 'Unassigned'}</div>
                        <SectionBadge section={s.section} />
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-xs tabular-nums text-slate-600">{v.due > 0 ? `${currency} ${v.due.toLocaleString()}` : '—'}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-bold tabular-nums text-emerald-700">{v.paid > 0 ? `${currency} ${v.paid.toLocaleString()}` : '—'}</td>
                      <td className="px-3 py-3 text-right font-mono text-xs font-bold tabular-nums text-rose-600">{bal > 0 ? `${currency} ${bal.toLocaleString()}` : '—'}</td>
                      <td className="px-3 py-3"><span className={`pill ${pillCls(st)}`}>{pillLabel(st)}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {st !== 'full' && bal > 0 && (
                            <button onClick={() => markFullyPaid(s)} className="btn bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700">✓ Mark Paid</button>
                          )}
                          <button onClick={() => openPay(s)} className="btn btn-primary px-3 py-1.5 text-xs font-bold">
                            {st === 'full' ? '+ Pay' : 'Pay'}
                          </button>
                          {hasPaid(s) && (
                            <button onClick={() => printReceipt(s, termPayments.find((p: any) => p.student_id === s.id), bank, currency, schoolName, logoUrl, schoolAddress)} className="btn border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
                              Receipt
                            </button>
                          )}
                          {allPaymentsForStudent(s).length > 0 && (
                            <button onClick={() => setHistoryTarget(s)} className="btn bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
                              History
                            </button>
                          )}
                          {nextTerm && <button onClick={() => printInvoice(s, nextTerm, structures, bank, currency, schoolName, logoUrl, schoolAddress)} className="btn border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100">
                            Invoice
                          </button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-12 text-center text-sm text-slate-400">No students match this selection.</td></tr>
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
              <div className="text-xs text-slate-500">Set day and boarding fees together — used on invoices</div>
            </div>
            <span className="text-slate-400 text-sm">{showFeeConfig ? '▲' : '▼'}</span>
          </button>
          {showFeeConfig && (
            <div className="border-t p-5 space-y-4">
              {/* One row: year, term, day fee, boarding fee, due date */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <select className="input" value={feeForm.academicYearId} onChange={e => setFeeForm(f => ({ ...f, academicYearId: e.target.value, termId: '' }))}>
                  <option value="">Academic year</option>
                  {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
                </select>
                <select className="input" value={feeForm.termId} onChange={e => setFeeForm(f => ({ ...f, termId: e.target.value }))}>
                  <option value="">All terms in year</option>
                  {terms.filter(t => !feeForm.academicYearId || t.academic_year_id === feeForm.academicYearId).map(t => <option key={t.id} value={t.id}>{tLabel(t)}</option>)}
                </select>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Day</span>
                  <input className="input pl-10" type="number" min="0" placeholder="Day fee" value={feeForm.dayAmount} onChange={e => setFeeForm(f => ({ ...f, dayAmount: e.target.value }))} />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-400">Board</span>
                  <input className="input pl-12" type="number" min="0" placeholder="Boarding fee" value={feeForm.boardingAmount} onChange={e => setFeeForm(f => ({ ...f, boardingAmount: e.target.value }))} />
                </div>
                <input className="input" type="date" title="Due date (optional)" value={feeForm.dueDate} onChange={e => setFeeForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <button className="btn btn-primary" disabled={busy || !feeForm.academicYearId || (!feeForm.dayAmount && !feeForm.boardingAmount)} onClick={saveFees}>Save fee structure</button>

              {/* Grouped table: one row per year/term */}
              <div className="overflow-x-auto rounded-xl border text-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-xs uppercase">
                    <tr>
                      <th className="p-3">Year</th>
                      <th>Term</th>
                      <th className="text-right pr-4">Day fee</th>
                      <th className="text-right pr-4">Boarding fee</th>
                      <th>Due date</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {feeGroups.map((g, i) => (
                      <tr className="border-t" key={i}>
                        <td className="p-3 text-slate-600">{g.year?.name || '—'}</td>
                        <td>{g.termId ? tLabel(g.term) : 'All terms'}</td>
                        <td className="text-right pr-4 font-mono font-semibold">{g.day ? `${currency} ${Number(g.day.amount).toLocaleString()}` : '—'}</td>
                        <td className="text-right pr-4 font-mono font-semibold text-indigo-700">{g.boarding ? `${currency} ${Number(g.boarding.amount).toLocaleString()}` : '—'}</td>
                        <td className="text-slate-400">{g.dueDate || '—'}</td>
                        <td>
                          <div className="flex gap-1.5 pr-2">
                            <button className="btn bg-slate-100 text-xs py-1" onClick={() => startEditGroup(g)}>Edit</button>
                            <button className="btn bg-rose-50 text-rose-700 border border-rose-100 text-xs py-1" onClick={() => deleteFeeGroup(g)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!feeGroups.length && <tr><td colSpan={6} className="p-6 text-center text-slate-400 text-xs">No fee structures yet. Add one above.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Bank & payment account — always visible */}
        <section className="overflow-hidden rounded-2xl border-2 border-emerald-200 bg-white shadow-sm">
          <button className="flex w-full items-center justify-between bg-emerald-50 p-5 text-left" onClick={() => setShowBankConfig(x => !x)}>
            <div>
              <div className="font-black text-emerald-900">School Bank Account Details</div>
              <div className="text-xs text-emerald-700 mt-0.5">These appear on all receipts and invoices given to parents</div>
            </div>
            <span className="text-emerald-600 text-sm font-bold">{showBankConfig ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {showBankConfig && (
            <div className="p-5">
              {!bank.bank_name && (
                <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-semibold">
                  Bank details not yet configured. Fill in the fields below and click Save — parents will see this on invoices and receipts.
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs font-bold text-slate-600">
                  Bank name
                  <input className="input mt-1 w-full" placeholder="e.g. First Bank of Nigeria" value={bank.bank_name || ''} onChange={e => setBank({ ...bank, bank_name: e.target.value })} />
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Account name
                  <input className="input mt-1 w-full" placeholder="e.g. AMQM School Fees Account" value={bank.account_name || ''} onChange={e => setBank({ ...bank, account_name: e.target.value })} />
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Account number
                  <input className="input mt-1 w-full font-mono" placeholder="e.g. 0123456789" value={bank.account_number || ''} onChange={e => setBank({ ...bank, account_number: e.target.value })} />
                </label>
                <label className="block text-xs font-bold text-slate-600">
                  Payment reference instruction <span className="font-normal text-slate-400">(optional)</span>
                  <input className="input mt-1 w-full" placeholder="e.g. Use student admission number as reference" value={bank.reference_instruction || ''} onChange={e => setBank({ ...bank, reference_instruction: e.target.value })} />
                </label>
              </div>
              <button className="btn btn-primary mt-4" disabled={busy} onClick={saveBank}>
                {bank.bank_name ? 'Update bank details' : 'Save bank details'}
              </button>
              {bank.bank_name && (
                <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs text-emerald-800">
                  Saved: <b>{bank.bank_name}</b> · {bank.account_name} · Acc: {bank.account_number}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Payment history modal */}
      {historyTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-5" onClick={() => !voiding && setHistoryTarget(null)}>
          <div className="w-full max-w-lg rounded-t-3xl bg-white p-6 sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Payment history</div>
                <div className="mt-0.5 text-xl font-black">{historyTarget.name}</div>
                <div className="text-xs text-slate-500">{historyTarget.admissionNo} · {historyTarget.className}</div>
              </div>
              <button className="text-slate-400 hover:text-slate-700 text-2xl leading-none" onClick={() => setHistoryTarget(null)}>×</button>
            </div>
            <div className="overflow-y-auto flex-1 -mx-6 px-6">
              {allPaymentsForStudent(historyTarget).length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No payments recorded.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-wide text-slate-400 border-b">
                    <tr>
                      <th className="pb-2 text-left font-bold">Date</th>
                      <th className="pb-2 text-left font-bold">Method</th>
                      <th className="pb-2 text-left font-bold">Reference</th>
                      <th className="pb-2 text-right font-bold">Amount</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {allPaymentsForStudent(historyTarget).map((p: any) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-3 text-slate-600">{new Date(p.paid_on).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="py-3">{p.method || 'Cash'}</td>
                        <td className="py-3 text-slate-400 font-mono text-xs">{p.reference || '—'}</td>
                        <td className="py-3 text-right font-mono font-bold tabular-nums">{currency} {Number(p.amount).toLocaleString()}</td>
                        <td className="py-3 pl-2">
                          <div className="flex gap-1.5 justify-end">
                            <button
                              onClick={() => printReceipt(historyTarget, p, bank, currency, schoolName, logoUrl, schoolAddress)}
                              className="btn bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs py-1 px-2"
                            >
                              Receipt
                            </button>
                            <button
                              onClick={() => handleVoid(p.id)}
                              disabled={voiding === p.id}
                              className="btn bg-rose-50 text-rose-700 border border-rose-100 text-xs py-1 px-2 disabled:opacity-50"
                            >
                              {voiding === p.id ? '…' : 'Void'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="mt-4 pt-4 border-t">
              <button className="btn bg-slate-100 w-full" onClick={() => setHistoryTarget(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

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
