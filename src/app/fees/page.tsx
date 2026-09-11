'use client';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import { loadStudents, loadCurrentAcademicTerm } from '@/lib/live-store';
import { createFeeStructure, updateFeeStructure, deleteFeeStructure, loadFeeStructures, loadFinanceSummary, recordPayment, voidPayment, syncStudentFeeAllocations } from '@/lib/admin-management-store';
import { createClient } from '@/lib/supabase/client';
import { Student } from '@/lib/data';
import { useEffect, useMemo, useRef, useState } from 'react';
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

function feeBelongsToTargetTerm(row: any, targetTerm: any) {
  const fs = row?.fee_structures;
  if (!fs || !targetTerm) return false;
  return fs.term_id === targetTerm.id || (!fs.term_id && fs.academic_year_id === targetTerm.academic_year_id);
}

function outstandingItemsBeforeTerm(studentId: string, targetTerm: any, fees: any[], terms: any[]) {
  if (!targetTerm) return [];
  const targetStart = String(targetTerm.starts_on || '9999-12-31');

  return (fees || [])
    .filter((row: any) => {
      if (row.student_id !== studentId) return false;
      const fs = row.fee_structures;
      if (!fs) return false;

      if (fs.term_id) {
        const sourceTerm = terms.find((t: any) => t.id === fs.term_id);
        if (!sourceTerm?.starts_on || String(sourceTerm.starts_on) >= targetStart) return false;
      } else {
        const ayStart = String(fs.academic_years?.starts_on || '9999-12-31');
        if (fs.academic_year_id === targetTerm.academic_year_id || ayStart >= targetStart) return false;
      }

      const balance = Math.max(
        0,
        Number(row.amount_due || 0) - Number(row.amount_paid || 0)
      );
      return balance > 0;
    })
    .map((row: any) => {
      const fs = row.fee_structures || {};
      const sourceTerm = fs.term_id
        ? terms.find((t: any) => t.id === fs.term_id)
        : null;

      return {
        feeId: row.id,
        termId: fs.term_id || null,
        termLabel: sourceTerm
          ? `${tLabel(sourceTerm)}${sourceTerm.academic_years?.name ? ` · ${sourceTerm.academic_years.name}` : ''}`
          : (fs.academic_years?.name || 'Previous academic year'),
        name: row.name || fs.name || 'School fee',
        section: fs.section || '',
        amount: Math.max(
          0,
          Number(row.amount_due || 0) - Number(row.amount_paid || 0)
        ),
      };
    })
    .sort((a: any, b: any) => String(a.termLabel).localeCompare(String(b.termLabel)));
}

function outstandingBeforeTerm(studentId: string, targetTerm: any, fees: any[], terms: any[]) {
  if (!targetTerm) return 0;
  const targetStart = String(targetTerm.starts_on || '9999-12-31');
  return (fees || []).reduce((total: number, row: any) => {
    if (row.student_id !== studentId) return total;
    const fs = row.fee_structures;
    if (!fs) return total;
    // A term-specific fee is prior only when its term starts before the target term.
    if (fs.term_id) {
      const term = terms.find((t: any) => t.id === fs.term_id);
      if (!term?.starts_on || String(term.starts_on) >= targetStart) return total;
    } else {
      // A term-less structure belongs to its academic year. Do not count the target
      // academic year's structure as a carried balance; it is a current-term charge.
      const ayStart = String(fs.academic_years?.starts_on || '9999-12-31');
      if (fs.academic_year_id === targetTerm.academic_year_id || ayStart >= targetStart) return total;
    }
    return total + Math.max(0, Number(row.amount_due || 0) - Number(row.amount_paid || 0));
  }, 0);
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

function printInvoice(student: any, nextTerm: any, structs: any[], bank: any, currency: string, schoolName: string, logoUrl = '', schoolAddress = '', fees: any[] = [], terms: any[] = []) {
  if (!nextTerm) { alert('Could not determine next term. Set up terms in the school calendar first.'); return; }
  const sec = String(student.section).toLowerCase() === 'boarding' ? 'boarding' : 'day';
  const feeRow = getStudentFee(structs, nextTerm.id, nextTerm.academic_year_id, sec);
  if (!feeRow) { alert(`No fee structure found for ${sec} students in ${tLabel(nextTerm)}. Please configure fee structures first.`); return; }
  const feeAmount = Number(feeRow.amount);
  const carryForwardItems = outstandingItemsBeforeTerm(student.id, nextTerm, fees, terms);
  const openingBalance = carryForwardItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
  const totalPayable = feeAmount + openingBalance;
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
  <div class="ab"><div class="al">Total Payable</div><div class="av">${currency} ${totalPayable.toLocaleString()}</div></div>
  <div class="st">Next-term invoice breakdown</div>
  <table>
    ${carryForwardItems.length
      ? `<tr><td colspan="2" style="background:#fff7ed;color:#9a3412;font-weight:800;text-transform:uppercase;letter-spacing:.04em">Outstanding balance carried forward</td></tr>
         ${carryForwardItems.map((item: any) => `<tr><td>Outstanding · ${item.termLabel}<br><span style="font-size:11px;color:#888">${item.name}</span></td><td>${currency} ${Number(item.amount).toLocaleString()}</td></tr>`).join('')}`
      : `<tr><td colspan="2" style="background:#f0fdf4;color:#166534;font-weight:700">No previous-term outstanding balance</td></tr>`}
    <tr><td>Current term · ${nextTermName}<br><span style="font-size:11px;color:#888">${feeRow.name || 'Term Fee'}</span></td><td>${currency} ${feeAmount.toLocaleString()}</td></tr>
    <tr><td><b>TOTAL PAYABLE</b></td><td><b>${currency} ${totalPayable.toLocaleString()}</b></td></tr>
  </table>
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

function bulkPrintInvoices(students: Student[], currentTerm: any, terms: any[], structs: any[], bank: any, currency: string, schoolName: string, logoUrl = '', schoolAddress = '', fees: any[] = []) {
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
    const carryForwardItems = outstandingItemsBeforeTerm(s.id, nextTerm, fees, terms);
    const openingBalance = carryForwardItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const totalPayable = feeAmount + openingBalance;
    const invoiceNo = `INV-${String(s.admissionNo||'').toUpperCase()}-T${nextTerm.term_number||''}`;
    return `<div class="page"><div class="top">${logoTag}<div class="school">${schoolName||'AMQM'}</div>${schoolAddress?`<div class="addr">${schoolAddress}</div>`:''}<div class="badge">SCHOOL FEES INVOICE</div></div><div class="term-box">For: ${nextTermName}</div><div class="ab"><div class="al">Total Payable</div><div class="av">${currency} ${totalPayable.toLocaleString()}</div></div><div class="st">Fee details</div><table>${carryForwardItems.map((item: any) => `<tr><td>Outstanding · ${item.termLabel}<br><span style="font-size:10px;color:#888">${item.name}</span></td><td>${currency} ${Number(item.amount).toLocaleString()}</td></tr>`).join('')}<tr><td>Current term · ${nextTermName}<br><span style="font-size:10px;color:#888">${feeRow.name || 'Term Fee'}</span></td><td>${currency} ${feeAmount.toLocaleString()}</td></tr><tr><td><b>Total payable</b></td><td><b>${currency} ${totalPayable.toLocaleString()}</b></td></tr></table><table><tr><td>Name</td><td>${s.name}</td></tr><tr><td>Admission</td><td>${s.admissionNo}</td></tr><tr><td>Class</td><td>${s.className||'—'}</td></tr><tr><td>Section</td><td>${sec.charAt(0).toUpperCase()+sec.slice(1)}</td></tr></table><table><tr><td>Invoice No.</td><td>${invoiceNo}</td></tr><tr><td>Issued</td><td>${new Date().toLocaleDateString('en-NG')}</td></tr></table>${bank?.bank_name?`<table><tr><td>Bank</td><td>${bank.bank_name}</td></tr><tr><td>Account name</td><td>${bank.account_name||'—'}</td></tr><tr><td>Account No.</td><td><b>${bank.account_number||'—'}</b></td></tr></table>`:''}<div class="ref-box">Ref: ${s.admissionNo||'Use admission number'}</div></div>`;
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const refreshSeq = useRef(0);
  const mountedRef = useRef(true);
  const syncedTermsRef = useRef<Set<string>>(new Set());
  const realtimeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generatingInvoices, setGeneratingInvoices] = useState(false);

  async function refresh() {
    const requestId = ++refreshSeq.current;
    if (mountedRef.current) setRefreshing(true);
    try {
      const [s, fs, sm, cms, cur, y, t, siteMeta] = await Promise.all([
        loadStudents(), loadFeeStructures(), loadFinanceSummary(), loadCMSSettings(), loadCurrentAcademicTerm(),
        createClient().from('academic_years').select('id,name,is_current').order('starts_on', { ascending: false }).then(r => { if (r.error) throw r.error; return r.data || []; }),
        createClient().from('terms').select('id,name,term_number,academic_year_id,starts_on,ends_on,academic_years:academic_year_id(name,is_current)').order('starts_on', { ascending: false }).then(r => { if (r.error) throw r.error; return r.data || []; }),
        createClient().from('site_settings').select('key,value').then(r => { if (r.error) throw r.error; return r.data || []; }),
      ]);

      // Ignore late results from an older refresh. This prevents an earlier request
      // from overwriting newer finance data with a transient/empty response.
      if (!mountedRef.current || requestId !== refreshSeq.current) return;

      setStudents(s || []);
      setStructures(fs || []);
      setSummary(sm || { fees: [], payments: [] });
      setBank(cms.school_payment || {});
      setYears(y || []);
      setTerms(t || []);
      const meta: any = {};
      for (const r of siteMeta || []) meta[r.key] = r.value;
      setCurrency('₦');
      setSchoolName(meta.school_name?.value || cms.school_name?.value || 'AMQM');
      setLogoUrl(meta.logo_url?.value || '');
      setSchoolAddress(meta.contact?.address || '');
      // Preserve a user-selected term during background refreshes; only use the
      // current academic term as the initial default.
      setSelectedTermId(prev => prev || cur?.term_id || '');
    } catch (e: any) {
      if (mountedRef.current) setMessage(e?.message || 'Unable to refresh finance data. Existing data was kept.');
    } finally {
      if (mountedRef.current && requestId === refreshSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
    };
  }, []);

  useEffect(() => {
    // Payments are safe to refresh from realtime, but student_fees must NOT be
    // subscribed here: syncing allocations writes many rows and previously
    // caused a refresh storm (and visible zero/real-value blinking).
    const scheduleRealtimeRefresh = () => {
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = setTimeout(() => { refresh(); }, 350);
    };
    const ch = createClient().channel('amqm-fees-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, scheduleRealtimeRefresh)
      .subscribe();
    return () => {
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
      createClient().removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    if (!selectedTermId || loading || syncedTermsRef.current.has(selectedTermId)) return;
    syncedTermsRef.current.add(selectedTermId);
    syncStudentFeeAllocations(selectedTermId)
      .then(() => refresh())
      .catch((e: any) => {
        syncedTermsRef.current.delete(selectedTermId);
        setMessage(e?.message || 'Unable to synchronize student fee allocations.');
      });
  }, [selectedTermId, loading]);

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

  const classNames = useMemo(() => [...new Set(students.map(s => s.className || 'Unassigned'))].sort(), [students]);
  const byClass = useMemo(() => classFilter ? students.filter(s => (s.className || 'Unassigned') === classFilter) : students, [students, classFilter]);
  const previousOutstandingByStudent = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of byClass) map.set(s.id, outstandingBeforeTerm(s.id, currentTerm, summary.fees || [], terms));
    return map;
  }, [byClass, currentTerm, summary.fees, terms]);

  const byStudentAccount = useMemo(() => {
    const map = new Map<string, { due: number; paid: number; opening: number; payable: number; outstanding: number; paidThisTerm: number }>();
    const paymentByStudent = new Map<string, number>();
    for (const p of summary.payments || []) {
      if (p.term_id === selectedTermId) paymentByStudent.set(p.student_id, (paymentByStudent.get(p.student_id) || 0) + Number(p.amount || 0));
    }
    for (const s of byClass) {
      const current = byStudent.get(s.id) || { due: 0, paid: 0 };
      const opening = previousOutstandingByStudent.get(s.id) || 0;
      const payable = opening + current.due;
      const outstanding = opening + Math.max(0, current.due - current.paid);
      map.set(s.id, { due: current.due, paid: current.paid, opening, payable, outstanding, paidThisTerm: paymentByStudent.get(s.id) || 0 });
    }
    return map;
  }, [byClass, byStudent, previousOutstandingByStudent, summary.payments, selectedTermId]);

  function getStatus(s: Student): 'full'|'partial'|'unpaid'|'none' {
    const v = byStudentAccount.get(s.id) || { payable: 0, outstanding: 0, paidThisTerm: 0 };
    if (v.payable <= 0) return 'none';
    if (v.outstanding <= 0) return 'full';
    if (v.paidThisTerm > 0) return 'partial';
    return 'unpaid';
  }

  // Keep status filtering after the account map is initialized. Previously clicking
  // Paid in Full / Partial / Not Paid could evaluate getStatus() before
  // byStudentAccount existed, crashing the client page at runtime.
  const filtered = useMemo(() => statusFilter === 'all' ? byClass : byClass.filter(s => getStatus(s) === statusFilter), [byClass, statusFilter, byStudentAccount]);
  const ledgerStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(s => `${s.name} ${s.admissionNo} ${s.className || ''}`.toLowerCase().includes(q));
  }, [filtered, searchTerm]);
  const selectedStudents = useMemo(() => ledgerStudents.filter(s => selectedIds.has(s.id)), [ledgerStudents, selectedIds]);

  const expected = useMemo(() => byClass.reduce((t, s) => t + (byStudentAccount.get(s.id)?.payable || 0), 0), [byClass, byStudentAccount]);
  const collected = useMemo(() => byClass.reduce((t, s) => t + (byStudentAccount.get(s.id)?.paidThisTerm || 0), 0), [byClass, byStudentAccount]);
  const outstanding = useMemo(() => byClass.reduce((t, s) => t + (byStudentAccount.get(s.id)?.outstanding || 0), 0), [byClass, byStudentAccount]);
  const previousOutstanding = useMemo(() => byClass.reduce((t, s) => t + (byStudentAccount.get(s.id)?.opening || 0), 0), [byClass, byStudentAccount]);
  const totalPayable = expected;
  const totalOutstanding = outstanding;
  const counts = useMemo(() => {
    let full = 0, partial = 0, unpaid = 0;
    for (const s of byClass) { const st = getStatus(s); if (st === 'full') full++; else if (st === 'partial') partial++; else if (st === 'unpaid') unpaid++; }
    return { full, partial, unpaid };
  }, [byClass, byStudentAccount]);

  function openPay(s: Student) {
    const v = byStudentAccount.get(s.id) || { outstanding: 0 };
    setPayAmount(String(Math.max(0, v.outstanding) || ''));
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
    const v = byStudentAccount.get(s.id) || { outstanding: 0 };
    const bal = Math.max(0, v.outstanding);
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
  const monthlyCollection = useMemo(() => {
    const months: { key: string; label: string; amount: number }[] = [];
    const now = new Date();
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const amount = termPayments.reduce((sum: number, p: any) => {
        const pd = new Date(p.paid_on);
        return `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}` === key ? sum + Number(p.amount || 0) : sum;
      }, 0);
      months.push({ key, label: d.toLocaleDateString('en-NG', { month: 'short' }), amount });
    }
    return months;
  }, [termPayments]);
  const maxMonthlyCollection = Math.max(1, ...monthlyCollection.map(m => m.amount));
  const hasPaid = (s: Student) => termPayments.some((p: any) => p.student_id === s.id);
  const allPaymentsForStudent = (s: Student) => summary.payments.filter((p: any) => p.student_id === s.id);

  const selectedPaidStudents = useMemo(() => selectedStudents.filter(hasPaid), [selectedStudents, summary.payments, selectedTermId]);

  function toggleStudent(id: string) {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleAllVisible() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = ledgerStudents.length > 0 && ledgerStudents.every(s => next.has(s.id));
      ledgerStudents.forEach(s => allSelected ? next.delete(s.id) : next.add(s.id));
      return next;
    });
  }
  function clearSelection() { setSelectedIds(new Set()); }

  async function generateBulkInvoices(studentsToGenerate: Student[], thenPrint = false) {
    const targetTerm = nextTerm;
    if (!targetTerm) { alert('Could not determine the next term. Set up the school calendar first.'); return; }
    if (!studentsToGenerate.length) { alert('Select at least one student first.'); return; }
    setGeneratingInvoices(true);
    try {
      const client = createClient();
      const { data: authData } = await client.auth.getUser();
      const rows = studentsToGenerate.map(s => {
        const sec = String(s.section).toLowerCase() === 'boarding' ? 'boarding' : 'day';
        const feeRow = getStudentFee(structures, targetTerm.id, targetTerm.academic_year_id, sec);
        if (!feeRow) return null;
        const invoiceNo = `INV-${String(s.admissionNo || '').toUpperCase()}-T${targetTerm.term_number || ''}`;
        const currentFee = Number(feeRow.amount || 0);
        const carryForwardItems = outstandingItemsBeforeTerm(s.id, targetTerm, summary.fees || [], terms);
        const openingBalance = carryForwardItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
        return {
          invoice_no: invoiceNo, student_id: s.id, term_id: targetTerm.id,
          amount_due: currentFee + openingBalance, amount_paid: 0, due_date: feeRow.due_date || null,
          status: 'issued', line_items: [
            ...carryForwardItems.map((item: any) => ({ name: `Outstanding · ${item.termLabel} · ${item.name}`, section: 'previous terms', amount: Number(item.amount || 0) })),
            { name: feeRow.name || 'Term Fee', section: sec, amount: currentFee },
          ],
          generated_by: authData.user?.id || null, generated_at: new Date().toISOString(),
        };
      }).filter(Boolean) as any[];
      if (!rows.length) throw new Error(`No fee structure is configured for ${tLabel(targetTerm)}.`);
      const { error } = await client.from('invoices').upsert(rows, { onConflict: 'student_id,term_id', ignoreDuplicates: false });
      if (error) throw error;
      setMessage(`${rows.length} invoice${rows.length === 1 ? '' : 's'} generated for ${tLabel(targetTerm)}.`);
      if (thenPrint) bulkPrintInvoices(studentsToGenerate, currentTerm, terms, structures, bank, currency, schoolName, logoUrl, schoolAddress, summary.fees);
    } catch (e: any) { setMessage(e?.message || 'Unable to generate invoices.'); }
    finally { setGeneratingInvoices(false); }
  }

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
      <div className="min-h-full bg-[#061b27] text-slate-100 -m-4 p-4 sm:-m-6 sm:p-6">
        <div className="mx-auto max-w-[1600px] space-y-5">
          {/* Header */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-300">AMQM · ALIYU AND MAIMUNA CENTER FOR QUR'ANIC MEMORIZATION</div>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl">Finance & Fees</h1>
              <p className="mt-1 text-sm text-slate-400">Complete overview of school fee collection, payments and student balances.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="h-11 rounded-xl border border-slate-700 bg-[#092638] px-4 text-sm font-bold text-white outline-none" value={selectedTermId} onChange={e => setSelectedTermId(e.target.value)}>
                <option value="">Select term</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.academic_years?.name} · {tLabel(t)}</option>)}
              </select>
              <select className="h-11 rounded-xl border border-slate-700 bg-[#092638] px-4 text-sm font-bold text-white outline-none" value={classFilter} onChange={e => { setClassFilter(e.target.value); setStatusFilter('all'); clearSelection(); }}>
                <option value="">All classes</option>
                {classNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="h-11 rounded-xl bg-emerald-500 px-5 text-sm font-black text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-400" onClick={() => filtered[0] && openPay(filtered[0])}>＋ Record Payment</button>
            </div>
          </div>

          {message && <button type="button" className="flex w-full items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200" onClick={() => setMessage('')}><span>✓ {message}</span><span>×</span></button>}

          {/* KPI cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ['Current Term Fees', expected, '▣', 'text-white', 'bg-blue-500/20 text-blue-300'],
              ['Paid This Term', collected, '✓', 'text-emerald-300', 'bg-emerald-500/20 text-emerald-300'],
              ['Previous Balance', previousOutstanding, '◔', 'text-white', 'bg-violet-500/20 text-violet-300'],
              ['Total Payable', totalPayable, '▤', 'text-white', 'bg-blue-500/20 text-blue-300'],
              ['Total Outstanding', totalOutstanding, '!', totalOutstanding > 0 ? 'text-rose-400' : 'text-emerald-300', totalOutstanding > 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'],
            ].map(([label, value, icon, valueCls, iconCls]) => (
              <div key={label as string} className="rounded-2xl border border-slate-800 bg-[#092638] p-4 shadow-xl shadow-black/10">
                <div className="flex items-start justify-between"><div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">{label as string}</div><span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-black ${iconCls}`}>{icon as string}</span></div>
                <div className={`mt-3 text-2xl font-black tabular-nums ${valueCls}`}>{currency} {Number(value).toLocaleString()}</div>
                {label === 'Paid This Term' && expected > 0 && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Math.round((collected / expected) * 100))}%` }} /></div>}
                {label === 'Paid This Term' && <div className="mt-1 text-[10px] text-slate-500">{expected > 0 ? `${Math.round((collected / expected) * 100)}% of expected` : 'No expected fees'}</div>}
              </div>
            ))}
          </div>

          {/* Analytics */}
          <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr_0.9fr]">
            <section className="rounded-2xl border border-slate-800 bg-[#092638] p-5">
              <div className="mb-4 flex items-center justify-between"><div><h2 className="font-black text-white">Collection Trend</h2><p className="text-xs text-slate-500">Payments recorded in the selected term</p></div><span className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-400">Last 5 months</span></div>
              <div className="flex h-44 items-end gap-3 border-b border-slate-800 px-2 pb-2">
                {monthlyCollection.map(m => <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div className="w-full max-w-12 rounded-t-lg bg-gradient-to-t from-blue-600 to-cyan-400" style={{ height: `${Math.max(5, (m.amount / maxMonthlyCollection) * 100)}%` }} title={`${currency} ${m.amount.toLocaleString()}`} /><span className="text-[10px] font-bold text-slate-500">{m.label}</span></div>)}
              </div>
              <div className="mt-3 flex justify-between text-[10px] text-slate-500"><span>Collected: <b className="text-emerald-300">{currency} {collected.toLocaleString()}</b></span><span>Expected: <b className="text-blue-300">{currency} {expected.toLocaleString()}</b></span></div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-[#092638] p-5">
              <div className="mb-4"><h2 className="font-black text-white">Student Payment Status</h2><p className="text-xs text-slate-500">{byClass.length} students in this view</p></div>
              <div className="flex items-center gap-6">
                <div className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#10b981 0 ${(counts.full / Math.max(1, byClass.length)) * 360}deg, #f59e0b 0 ${((counts.full + counts.partial) / Math.max(1, byClass.length)) * 360}deg, #f43f5e 0 360deg)` }}><div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-[#092638]"><b className="text-2xl text-white">{byClass.length}</b><span className="text-[10px] text-slate-500">Students</span></div></div>
                <div className="space-y-3 text-xs">{[['Paid in Full',counts.full,'text-emerald-300'],['Partial Payments',counts.partial,'text-amber-300'],['Not Paid',counts.unpaid,'text-rose-400']].map(([l,c,cl]) => <button key={l as string} className="flex items-center gap-2 text-left" onClick={() => setStatusFilter(statusFilter === (l === 'Paid in Full' ? 'full' : l === 'Partial Payments' ? 'partial' : 'unpaid') ? 'all' : (l === 'Paid in Full' ? 'full' : l === 'Partial Payments' ? 'partial' : 'unpaid'))}><span className={`h-2.5 w-2.5 rounded-full ${cl === 'text-emerald-300' ? 'bg-emerald-400' : cl === 'text-amber-300' ? 'bg-amber-400' : 'bg-rose-400'}`} /><span className="text-slate-300">{l}</span><b className={cl as string}>{c as number}</b></button>)}</div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-[#092638] p-5">
              <h2 className="font-black text-white">Quick Actions</h2><p className="mb-4 text-xs text-slate-500">Common finance operations</p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button className="quick" onClick={() => filtered[0] && openPay(filtered[0])}>＋ Record Payment</button>
                <button className="quick" onClick={() => setShowFeeConfig(true)}>▤ Fee Structures</button>
                <button className="quick" onClick={() => generateBulkInvoices(selectedStudents.length ? selectedStudents : byClass, false)} disabled={generatingInvoices || !nextTerm}>↻ Sync / Generate Invoices</button>
                <button className="quick" onClick={() => generateBulkInvoices(selectedStudents.length ? selectedStudents : byClass, true)} disabled={generatingInvoices || !nextTerm}>▣ Bulk Invoices</button>
                <button className="quick" onClick={() => bulkPrintInvoices(classFilter ? byClass : selectedStudents, currentTerm, terms, structures, bank, currency, schoolName, logoUrl, schoolAddress, summary.fees)} disabled={!nextTerm || (!classFilter && !selectedStudents.length)}>▤ Print Invoices (Bulk)</button>
                <button className="quick" onClick={() => bulkPrintReceipts(classFilter ? byClass.filter(hasPaid) : selectedPaidStudents, summary.payments, bank, currency, schoolName, logoUrl, schoolAddress)} disabled={!(classFilter ? byClass.some(hasPaid) : selectedPaidStudents.length)}>▤ Bulk Receipts</button>
              </div>
            </section>
          </div>

          {/* Status filter strip */}
          <div className="grid gap-3 md:grid-cols-4">
            {[['all','All Students',byClass.length,'bg-emerald-500/10 text-emerald-300'],['full','Paid in Full',counts.full,'bg-emerald-500/10 text-emerald-300'],['partial','Partial Payments',counts.partial,'bg-amber-500/10 text-amber-300'],['unpaid','Not Paid',counts.unpaid,'bg-rose-500/10 text-rose-300']].map(([key,label,count,cls]) => <button key={key as string} onClick={() => setStatusFilter(key as any)} className={`rounded-2xl border border-slate-800 p-4 text-left transition hover:border-slate-700 ${statusFilter === key ? 'ring-2 ring-emerald-400/40' : ''} ${cls}`}><div className="text-[10px] font-black uppercase tracking-[0.12em] opacity-70">{label as string}</div><div className="mt-1 text-2xl font-black">{count as number}</div></button>)}
          </div>

          {/* Student ledger */}
          <section className="rounded-2xl border border-slate-800 bg-[#092638] shadow-xl">
            <div className="flex flex-col gap-4 border-b border-slate-800 p-5 xl:flex-row xl:items-center xl:justify-between">
              <div><div className="flex items-center gap-2"><h2 className="text-lg font-black text-white">Students</h2><span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-black text-slate-400">{ledgerStudents.length}</span></div><p className="mt-1 text-xs text-slate-500">{classFilter || 'All classes'} · {currentTerm ? tLabel(currentTerm) : 'Selected term'}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-10 w-64 items-center rounded-xl border border-slate-700 bg-[#061b27] px-3"><span className="text-slate-500">⌕</span><input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search students by name or admission no..." className="w-full bg-transparent px-2 text-xs text-white outline-none placeholder:text-slate-600" /></div>
                <button className="h-10 rounded-xl border border-slate-700 px-3 text-xs font-bold text-slate-300 hover:bg-slate-800" onClick={toggleAllVisible}>{ledgerStudents.length && ledgerStudents.every(s => selectedIds.has(s.id)) ? 'Clear selection' : 'Select all'}</button>
                {statusFilter !== 'all' && <button className="h-10 rounded-xl border border-slate-700 px-3 text-xs font-bold text-slate-400" onClick={() => setStatusFilter('all')}>Clear filter</button>}
              </div>
            </div>
            <div className="w-full overflow-x-auto overscroll-x-contain">
              <table className="w-full min-w-[1320px] table-auto text-left text-sm">
                <thead className="bg-[#061b27] text-[10px] font-black uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-4 py-3"><input type="checkbox" checked={ledgerStudents.length > 0 && ledgerStudents.every(s => selectedIds.has(s.id))} onChange={toggleAllVisible} /></th><th className="px-3 py-3">Student</th><th>Class / Section</th><th className="text-right">Current Fee</th><th className="text-right">Brought Forward</th><th className="text-right">Paid This Term</th><th className="text-right">Total Payable</th><th className="text-right">Outstanding</th><th>Status</th><th className="w-[330px] px-4 text-right whitespace-nowrap">Actions</th></tr></thead>
                <tbody>
                  {ledgerStudents.map(s => { const v=byStudentAccount.get(s.id)||{due:0,opening:0,payable:0,paidThisTerm:0,outstanding:0}; const bal=Math.max(0,v.outstanding); const st=getStatus(s); return <tr key={s.id} className="border-t border-slate-800 hover:bg-cyan-500/[0.03]">
                    <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleStudent(s.id)} /></td>
                    <td className="px-3 py-3"><div className="flex items-center gap-3"><div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">{s.photoUrl ? <img src={s.photoUrl} className="h-full w-full object-cover" alt="" /> : <span className="flex h-full w-full items-center justify-center text-sm font-black text-slate-500">{s.name.charAt(0)}</span>}</div><div><div className="font-bold text-white">{s.name}</div><div className="text-[10px] text-slate-500">{s.admissionNo}</div></div></div></td>
                    <td className="px-3 py-3"><div className="text-xs font-semibold text-slate-300">{s.className || 'Unassigned'}</div><SectionBadge section={s.section} /></td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-slate-300">{v.due > 0 ? `${currency} ${v.due.toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-violet-300">{v.opening > 0 ? `${currency} ${v.opening.toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-bold text-emerald-300">{v.paidThisTerm > 0 ? `${currency} ${v.paidThisTerm.toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-bold text-blue-300">{v.payable > 0 ? `${currency} ${v.payable.toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-bold text-rose-400">{bal > 0 ? `${currency} ${bal.toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${st==='full'?'bg-emerald-500/15 text-emerald-300':st==='partial'?'bg-amber-500/15 text-amber-300':st==='unpaid'?'bg-rose-500/15 text-rose-300':'bg-slate-800 text-slate-500'}`}>{pillLabel(st)}</span></td>
                    <td className="w-[330px] whitespace-nowrap px-4 py-3"><div className="flex min-w-max justify-end gap-1.5"><button onClick={() => openPay(s)} className="rounded-lg bg-blue-500 px-3 py-2 text-[10px] font-black text-white hover:bg-blue-400">Pay</button>{hasPaid(s)&&<button onClick={() => printReceipt(s, termPayments.find((p:any)=>p.student_id===s.id), bank, currency, schoolName, logoUrl, schoolAddress)} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-300">Receipt</button>}<button onClick={() => setHistoryTarget(s)} className="rounded-lg bg-slate-800 px-3 py-2 text-[10px] font-black text-slate-300">History</button>{nextTerm&&<button title={`Print ${tLabel(nextTerm)} invoice with previous outstanding balances carried forward`} onClick={() => printInvoice(s,nextTerm,structures,bank,currency,schoolName,logoUrl,schoolAddress,summary.fees,terms)} className="shrink-0 whitespace-nowrap rounded-lg bg-amber-400 px-3 py-2 text-[10px] font-black text-slate-950">Next Term Invoice</button>}</div></td>
                  </tr> })}
                  {!ledgerStudents.length && <tr><td colSpan={10} className="p-12 text-center text-sm text-slate-500">No students match this selection.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-800 bg-[#061b27] p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-xs text-slate-500"><b className="text-white">{selectedIds.size}</b> selected</div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => generateBulkInvoices(selectedStudents, false)} disabled={!selectedStudents.length || generatingInvoices} className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-black text-slate-200 disabled:opacity-40">▣ Generate Invoices (Bulk)</button>
                <button onClick={() => generateBulkInvoices(selectedStudents, true)} disabled={!selectedStudents.length || generatingInvoices} className="rounded-lg bg-amber-400 px-3 py-2 text-[10px] font-black text-slate-950 disabled:opacity-40">▤ Print Invoices (Bulk)</button>
                <button onClick={() => bulkPrintReceipts(selectedPaidStudents, summary.payments, bank, currency, schoolName, logoUrl, schoolAddress)} disabled={!selectedPaidStudents.length} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-300 disabled:opacity-40">▤ Bulk Receipts</button>
                <button onClick={() => classFilter && bulkPrintInvoices(byClass, currentTerm, terms, structures, bank, currency, schoolName, logoUrl, schoolAddress, summary.fees)} disabled={!classFilter || !nextTerm} className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[10px] font-black text-blue-300 disabled:opacity-40">▤ Bulk Class Invoices</button>
                <button onClick={() => classFilter && bulkPrintReceipts(byClass.filter(hasPaid), summary.payments, bank, currency, schoolName, logoUrl, schoolAddress)} disabled={!classFilter || !byClass.some(hasPaid)} className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-300 disabled:opacity-40">▤ Bulk Class Receipts</button>
                <button onClick={clearSelection} disabled={!selectedIds.size} className="rounded-lg bg-slate-800 px-3 py-2 text-[10px] font-black text-slate-400 disabled:opacity-40">Clear</button>
              </div>
            </div>
          </section>

          {/* Fee configuration */}
          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#092638] shadow-xl">
            <button className="flex w-full items-center justify-between p-5 text-left" onClick={() => setShowFeeConfig(x => !x)}><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">Finance setup</div><div className="mt-1 text-lg font-black text-white">Fee Configuration</div><div className="mt-1 text-xs text-slate-500">Configure day and boarding fees by academic year and term, with clear due dates.</div></div><span className="text-slate-400">{showFeeConfig ? '▲' : '▼'}</span></button>
            {showFeeConfig && <div className="border-t border-slate-800 p-5">
              <div className="grid gap-3 lg:grid-cols-[1.1fr_1fr_1fr_1fr_1fr_auto]">
                <select className="input bg-[#061b27] text-white" value={feeForm.academicYearId} onChange={e => setFeeForm(f=>({...f,academicYearId:e.target.value,termId:''}))}><option value="">Academic year</option>{years.map(y=><option key={y.id} value={y.id}>{y.name}{y.is_current?' (current)':''}</option>)}</select>
                <select className="input bg-[#061b27] text-white" value={feeForm.termId} onChange={e=>setFeeForm(f=>({...f,termId:e.target.value}))}><option value="">All terms in year</option>{terms.filter(t=>!feeForm.academicYearId||t.academic_year_id===feeForm.academicYearId).map(t=><option key={t.id} value={t.id}>{tLabel(t)}</option>)}</select>
                <input className="input bg-[#061b27] text-white" type="number" min="0" placeholder="Day fee" value={feeForm.dayAmount} onChange={e=>setFeeForm(f=>({...f,dayAmount:e.target.value}))}/>
                <input className="input bg-[#061b27] text-white" type="number" min="0" placeholder="Boarding fee" value={feeForm.boardingAmount} onChange={e=>setFeeForm(f=>({...f,boardingAmount:e.target.value}))}/>
                <input className="input bg-[#061b27] text-white" type="date" title="Due date" value={feeForm.dueDate} onChange={e=>setFeeForm(f=>({...f,dueDate:e.target.value}))}/>
                <button className="rounded-xl bg-emerald-500 px-5 py-3 text-xs font-black text-white hover:bg-emerald-400 disabled:opacity-40" disabled={busy||!feeForm.academicYearId||(!feeForm.dayAmount&&!feeForm.boardingAmount)} onClick={saveFees}>{busy?'Saving…':'Save fees'}</button>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><div className="text-xs font-black text-emerald-300">DAY STUDENTS</div><div className="mt-1 text-2xl font-black text-white">{currency} {Number(feeGroups.find(g=>g.termId===selectedTermId)?.day?.amount||0).toLocaleString()}</div><div className="text-[10px] text-slate-500">Current selected term structure</div></div><div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4"><div className="text-xs font-black text-blue-300">BOARDING STUDENTS</div><div className="mt-1 text-2xl font-black text-white">{currency} {Number(feeGroups.find(g=>g.termId===selectedTermId)?.boarding?.amount||0).toLocaleString()}</div><div className="text-[10px] text-slate-500">Current selected term structure</div></div></div>
              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-800"><table className="w-full text-left text-xs"><thead className="bg-[#061b27] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="p-3">Year</th><th>Term</th><th className="text-right">Day fee</th><th className="text-right">Boarding fee</th><th>Due date</th><th /></tr></thead><tbody>{feeGroups.map((g,i)=><tr key={i} className="border-t border-slate-800"><td className="p-3 text-slate-300">{g.year?.name||'—'}</td><td className="text-slate-300">{g.termId?tLabel(g.term):'All terms'}</td><td className="text-right font-mono text-emerald-300">{g.day?`${currency} ${Number(g.day.amount).toLocaleString()}`:'—'}</td><td className="text-right font-mono text-blue-300">{g.boarding?`${currency} ${Number(g.boarding.amount).toLocaleString()}`:'—'}</td><td className="text-slate-500">{g.dueDate||'—'}</td><td><div className="flex gap-1.5 p-2"><button className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300" onClick={()=>startEditGroup(g)}>Edit</button><button className="rounded-lg bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-300" onClick={()=>deleteFeeGroup(g)}>Delete</button></div></td></tr>)}{!feeGroups.length&&<tr><td colSpan={6} className="p-6 text-center text-slate-500">No fee structures configured yet.</td></tr>}</tbody></table></div>
            </div>}
          </section>

          {/* Bank configuration */}
          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#092638]">
            <button className="flex w-full items-center justify-between p-5 text-left" onClick={() => setShowBankConfig(x=>!x)}><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300">Payment setup</div><div className="mt-1 font-black text-white">School Bank Account</div><div className="mt-1 text-xs text-slate-500">Shown on parent invoices and receipts.</div></div><span className="text-slate-500">{showBankConfig?'▲':'▼'}</span></button>
            {showBankConfig&&<div className="border-t border-slate-800 p-5"><div className="grid gap-3 md:grid-cols-2"><input className="input bg-[#061b27] text-white" placeholder="Bank name" value={bank.bank_name||''} onChange={e=>setBank({...bank,bank_name:e.target.value})}/><input className="input bg-[#061b27] text-white" placeholder="Account name" value={bank.account_name||''} onChange={e=>setBank({...bank,account_name:e.target.value})}/><input className="input bg-[#061b27] font-mono text-white" placeholder="Account number" value={bank.account_number||''} onChange={e=>setBank({...bank,account_number:e.target.value})}/><input className="input bg-[#061b27] text-white" placeholder="Payment reference instruction" value={bank.reference_instruction||''} onChange={e=>setBank({...bank,reference_instruction:e.target.value})}/></div><button className="mt-4 rounded-xl bg-emerald-500 px-5 py-3 text-xs font-black text-white" disabled={busy} onClick={saveBank}>{busy?'Saving…':'Save bank details'}</button></div>}
          </section>
        </div>
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
              {(() => { const v = byStudentAccount.get(payTarget.id) || { outstanding: 0 }; const b = Math.max(0, v.outstanding); return b > 0 ? <div className="mt-1.5 inline-block rounded-lg bg-rose-50 px-2 py-1 text-sm font-bold text-rose-700">Balance: {currency} {b.toLocaleString()}</div> : null; })()}
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
