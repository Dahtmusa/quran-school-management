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
  const filtered = useMemo(() => statusFilter === 'all' ? byClass : byClass.filter(s => getStatus(s) === statusFilter), [byClass, statusFilter]);
  const ledgerStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter(s => `${s.name} ${s.admissionNo} ${s.className || ''}`.toLowerCase().includes(q));
  }, [filtered, searchTerm]);
  const selectedStudents = useMemo(() => ledgerStudents.filter(s => selectedIds.has(s.id)), [ledgerStudents, selectedIds]);
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

  function scrollToSection(id: string) {
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
  }

  return (
    <AdminShell title="Finance & Fees">
      <div className="-mx-4 -mt-4 min-h-[calc(100vh-64px)] bg-[#f7f8f5] pb-10 text-[#102a43] md:-mx-7">
        <div className="w-full">
          <header className="border-b border-[#dce8e2] bg-white">
            <div className="mx-auto w-full px-5 py-5 sm:px-7 lg:px-9">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#0f766e]">
                    <span>AMQM Finance</span><span className="text-[#c89b3c]">•</span><span>School Accounts</span>
                  </div>
                  <h1 className="mt-1 text-3xl font-black tracking-tight text-[#102a43] sm:text-4xl">Finance & Fees</h1>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">A clear view of collections, student balances, invoices and payment activity.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <select aria-label="Academic term" className="h-11 min-w-[190px] rounded-xl border border-[#cbded6] bg-white px-4 text-sm font-bold text-[#102a43] shadow-sm outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-[#0f766e]/10" value={selectedTermId} onChange={e => setSelectedTermId(e.target.value)}>
                    <option value="">Select term</option>
                    {terms.map(t => <option key={t.id} value={t.id}>{t.academic_years?.name} · {tLabel(t)}</option>)}
                  </select>
                  <select aria-label="Class" className="h-11 min-w-[160px] rounded-xl border border-[#cbded6] bg-white px-4 text-sm font-bold text-[#102a43] shadow-sm outline-none transition focus:border-[#0f766e] focus:ring-4 focus:ring-[#0f766e]/10" value={classFilter} onChange={e => { setClassFilter(e.target.value); setStatusFilter('all'); clearSelection(); }}>
                    <option value="">All classes</option>
                    {classNames.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button className="h-11 rounded-xl bg-[#007f5f] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[#006b50] focus:outline-none focus:ring-4 focus:ring-[#007f5f]/20" onClick={() => filtered[0] && openPay(filtered[0])}>＋ Record Payment</button>
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full space-y-5 px-5 pt-5 sm:px-7 lg:px-9">
            {message && <button type="button" className="flex w-full items-center justify-between rounded-xl border border-[#b8e1d3] bg-[#ecf8f3] px-4 py-3 text-sm font-semibold text-[#075c47] shadow-sm" onClick={() => setMessage('')}><span>✓ {message}</span><span aria-label="Dismiss">×</span></button>}

            <section aria-label="Finance summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {[
                ['Current Term Fees', expected, 'Term charges', 'text-[#102a43]', 'bg-[#eaf4ff] text-[#1769aa]'],
                ['Paid This Term', collected, expected > 0 ? `${Math.round((collected / expected) * 100)}% collected` : 'No expected fees', 'text-[#007f5f]', 'bg-[#e8f7f1] text-[#007f5f]'],
                ['Previous Balance', previousOutstanding, 'Brought forward', 'text-[#102a43]', 'bg-[#fff8e8] text-[#a46c00]'],
                ['Total Payable', totalPayable, 'Current + previous', 'text-[#102a43]', 'bg-[#eef2ff] text-[#3857a8]'],
                ['Total Outstanding', totalOutstanding, totalOutstanding > 0 ? 'Needs collection' : 'Fully collected', totalOutstanding > 0 ? 'text-[#c81e4a]' : 'text-[#007f5f]', totalOutstanding > 0 ? 'bg-[#fff0f3] text-[#c81e4a]' : 'bg-[#e8f7f1] text-[#007f5f]'],
              ].map(([label, value, note, valueCls, iconCls], i) => (
                <div key={label as string} className="finance-kpi rounded-2xl border border-[#dce8e2] bg-white p-4 shadow-[0_3px_14px_rgba(16,42,67,0.05)]">
                  <div className="flex items-start justify-between gap-3"><div className="text-[10px] font-black uppercase tracking-[0.13em] text-[#617489]">{label as string}</div><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${iconCls}`}>{i===0?'▣':i===1?'✓':i===2?'↺':i===3?'=':'!'}</span></div>
                  <div className={`mt-3 text-[clamp(1.35rem,2.1vw,1.75rem)] font-black tabular-nums ${valueCls}`}>{currency} {Number(value).toLocaleString()}</div>
                  <div className="mt-1 text-[10px] font-semibold text-slate-400">{note as string}</div>
                  {label === 'Paid This Term' && expected > 0 && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e9efec]"><div className="h-full rounded-full bg-[#00a676] transition-all" style={{ width: `${Math.min(100, Math.round((collected / expected) * 100))}%` }} /></div>}
                </div>
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr_0.9fr]">
              <div className="rounded-2xl border border-[#dce8e2] bg-white p-5 shadow-[0_3px_14px_rgba(16,42,67,0.05)]">
                <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-base font-black text-[#102a43]">Collection trend</h2><p className="mt-0.5 text-xs text-slate-500">Payments recorded in the selected term</p></div><span className="rounded-full border border-[#dce8e2] bg-[#f7faf8] px-2.5 py-1 text-[10px] font-bold text-slate-500">5-month view</span></div>
                <div className="flex h-44 items-end gap-3 border-b border-[#e6ece9] px-1 pb-2">
                  {monthlyCollection.map(m => <div key={m.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><div className="w-full max-w-12 rounded-t-md bg-[#00a676] transition-all" style={{ height: `${Math.max(4, (m.amount / maxMonthlyCollection) * 100)}%` }} title={`${currency} ${m.amount.toLocaleString()}`} /><span className="text-[10px] font-bold text-slate-400">{m.label}</span></div>)}
                </div>
                <div className="mt-3 flex flex-wrap justify-between gap-2 text-[10px] font-semibold text-slate-500"><span>Collected <b className="text-[#007f5f]">{currency} {collected.toLocaleString()}</b></span><span>Expected <b className="text-[#1769aa]">{currency} {expected.toLocaleString()}</b></span></div>
              </div>

              <div className="rounded-2xl border border-[#dce8e2] bg-white p-5 shadow-[0_3px_14px_rgba(16,42,67,0.05)]">
                <div className="mb-5"><h2 className="text-base font-black text-[#102a43]">Student payment status</h2><p className="mt-0.5 text-xs text-slate-500">{byClass.length} students in this view</p></div>
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="relative mx-auto flex h-36 w-36 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#00a676 0 ${(counts.full / Math.max(1, byClass.length)) * 360}deg, #f0a000 0 ${((counts.full + counts.partial) / Math.max(1, byClass.length)) * 360}deg, #ef476f 0 360deg)` }}><div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white shadow-inner"><b className="text-2xl text-[#102a43]">{byClass.length}</b><span className="text-[10px] text-slate-400">Students</span></div></div>
                  <div className="w-full space-y-3 text-xs">{[['Paid in Full',counts.full,'full','bg-[#00a676]','text-[#007f5f]'],['Partial Payments',counts.partial,'partial','bg-[#f0a000]','text-[#9a6500]'],['Not Paid',counts.unpaid,'unpaid','bg-[#ef476f]','text-[#c81e4a]']].map(([l,c,key,dot,cl]) => <button key={l as string} className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-[#f5f8f6] ${statusFilter === key ? 'bg-[#eef7f3]' : ''}`} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key as any)}><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${dot}`} /><span className="font-semibold text-slate-600">{l}</span></span><b className={cl as string}>{c as number}</b></button>)}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#dce8e2] bg-white p-5 shadow-[0_3px_14px_rgba(16,42,67,0.05)]">
                <div className="mb-4"><div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#0f766e]">Finance workspace</div><h2 className="mt-1 text-base font-black text-[#102a43]">Quick actions</h2><p className="mt-0.5 text-xs text-slate-500">Common tasks, one click away.</p></div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <button className="group flex items-center gap-3 rounded-xl border border-[#b9e8d8] bg-[#effbf6] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#79d6ba]" onClick={() => { if (filtered[0]) openPay(filtered[0]); scrollToSection('student-ledger'); }}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#007f5f] text-white">＋</span><span><b className="block text-xs font-black text-[#102a43]">Record payment</b><small className="block text-[10px] text-slate-500">Open a student's payment form</small></span></button>
                  <button className="group flex items-center gap-3 rounded-xl border border-[#f2d58a] bg-[#fffaf0] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#e7bd50]" onClick={() => { setShowFeeConfig(true); scrollToSection('fee-configuration'); }}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f0a000] text-white">▤</span><span><b className="block text-xs font-black text-[#102a43]">Fee structures</b><small className="block text-[10px] text-slate-500">Configure term and section fees</small></span></button>
                  <button className="group flex items-center gap-3 rounded-xl border border-[#d8e0ea] bg-[#f7f9fc] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#b7c4d4] disabled:cursor-not-allowed disabled:opacity-50" onClick={() => generateBulkInvoices(selectedStudents.length ? selectedStudents : byClass, false)} disabled={generatingInvoices || !nextTerm}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#102a43] text-white">↻</span><span><b className="block text-xs font-black text-[#102a43]">Sync / generate invoices</b><small className="block text-[10px] text-slate-500">Prepare next-term invoices</small></span></button>
                  <button className="group flex items-center gap-3 rounded-xl border border-[#b9d3ff] bg-[#f2f7ff] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#8bb6ff] disabled:cursor-not-allowed disabled:opacity-50" onClick={() => generateBulkInvoices(selectedStudents.length ? selectedStudents : byClass, true)} disabled={generatingInvoices || !nextTerm}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#2563eb] text-white">▣</span><span><b className="block text-xs font-black text-[#102a43]">Bulk invoices</b><small className="block text-[10px] text-slate-500">Generate and print selected invoices</small></span></button>
                  <button className="group flex items-center gap-3 rounded-xl border border-[#dce8e2] bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-[#a7c9bb] disabled:cursor-not-allowed disabled:opacity-50" onClick={() => bulkPrintInvoices(classFilter ? byClass : selectedStudents, currentTerm, terms, structures, bank, currency, schoolName, logoUrl, schoolAddress, summary.fees)} disabled={!nextTerm || (!classFilter && !selectedStudents.length)}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0f766e] text-white">▤</span><span><b className="block text-xs font-black text-[#102a43]">Print invoices</b><small className="block text-[10px] text-slate-500">Print the selected invoice set</small></span></button>
                  <button className="group flex items-center gap-3 rounded-xl border border-[#dce8e2] bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-[#a7c9bb] disabled:cursor-not-allowed disabled:opacity-50" onClick={() => bulkPrintReceipts(classFilter ? byClass.filter(hasPaid) : selectedPaidStudents, summary.payments, bank, currency, schoolName, logoUrl, schoolAddress)} disabled={!(classFilter ? byClass.some(hasPaid) : selectedPaidStudents.length)}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#c89b3c] text-white">▤</span><span><b className="block text-xs font-black text-[#102a43]">Bulk receipts</b><small className="block text-[10px] text-slate-500">Print receipts for paid students</small></span></button>
                </div>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[['all','All Students',byClass.length,'#eaf7f2','#007f5f'],['full','Paid in Full',counts.full,'#eaf7f2','#007f5f'],['partial','Partial Payments',counts.partial,'#fff8e8','#a46c00'],['unpaid','Not Paid',counts.unpaid,'#fff0f3','#c81e4a']].map(([key,label,count,bg,fg]) => <button key={key as string} onClick={() => { setStatusFilter(key as any); scrollToSection('student-ledger'); }} className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${statusFilter === key ? 'border-[#007f5f] ring-2 ring-[#007f5f]/10' : 'border-[#dce8e2]'}`} style={{ background: bg as string }}><div className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: fg as string }}>{label as string}</div><div className="mt-1 text-2xl font-black" style={{ color: fg as string }}>{count as number}</div></button>)}
            </section>

            <section id="student-ledger" className="scroll-mt-6 overflow-hidden rounded-2xl border border-[#dce8e2] bg-white shadow-[0_3px_14px_rgba(16,42,67,0.05)]">
              <div className="border-b border-[#e2ebe7] p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div><div className="flex items-center gap-2"><h2 className="text-lg font-black text-[#102a43]">Student accounts</h2><span className="rounded-full bg-[#edf4f1] px-2 py-0.5 text-[10px] font-black text-[#0f766e]">{ledgerStudents.length}</span></div><p className="mt-1 text-xs text-slate-500">{classFilter || 'All classes'} · {currentTerm ? tLabel(currentTerm) : 'Selected term'} · balances shown as a school ledger</p></div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex h-10 w-full items-center rounded-xl border border-[#d6e2dd] bg-[#fbfcfb] px-3 sm:w-72"><span className="text-slate-400">⌕</span><input aria-label="Search students" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search name or admission no..." className="w-full bg-transparent px-2 text-xs text-[#102a43] outline-none placeholder:text-slate-400" /></div>
                    <button className="h-10 rounded-xl border border-[#cbded6] bg-white px-3 text-xs font-bold text-[#31546a] hover:bg-[#f5f9f7]" onClick={toggleAllVisible}>{ledgerStudents.length && ledgerStudents.every(s => selectedIds.has(s.id)) ? 'Clear selection' : 'Select all'}</button>
                    {statusFilter !== 'all' && <button className="h-10 rounded-xl border border-[#cbded6] bg-white px-3 text-xs font-bold text-slate-500" onClick={() => setStatusFilter('all')}>Clear filter</button>}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="finance-table w-full min-w-[1180px] table-auto text-left text-sm">
                  <thead className="bg-[#f4f8f6] text-[10px] font-black uppercase tracking-[0.08em] text-[#647889]"><tr className="border-b border-[#dce8e2]"><th className="w-10 px-4 py-3"><input type="checkbox" checked={ledgerStudents.length > 0 && ledgerStudents.every(s => selectedIds.has(s.id))} onChange={toggleAllVisible} /></th><th className="min-w-[220px] px-3 py-3">Student</th><th className="min-w-[150px] px-3 py-3">Class / Section</th><th className="whitespace-nowrap px-3 py-3 text-right">Current fee</th><th className="whitespace-nowrap px-3 py-3 text-right">Brought forward</th><th className="whitespace-nowrap px-3 py-3 text-right">Paid this term</th><th className="whitespace-nowrap px-3 py-3 text-right">Total payable</th><th className="whitespace-nowrap px-3 py-3 text-right">Outstanding</th><th className="px-3 py-3">Status</th><th className="w-[310px] px-4 py-3 text-right">Actions</th></tr></thead>
                  <tbody>
                    {ledgerStudents.map(s => { const v=byStudentAccount.get(s.id)||{due:0,opening:0,payable:0,paidThisTerm:0,outstanding:0}; const bal=Math.max(0,v.outstanding); const st=getStatus(s); return <tr key={s.id} className="border-b border-[#e7eeeb] last:border-0 hover:bg-[#f8fbf9]">
                      <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleStudent(s.id)} /></td>
                      <td className="px-3 py-3"><div className="flex items-center gap-3"><div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-[#dce8e2] bg-[#eef4f1]">{s.photoUrl ? <img src={s.photoUrl} className="h-full w-full object-cover" alt="" /> : <span className="flex h-full w-full items-center justify-center text-sm font-black text-[#0f766e]">{s.name.charAt(0)}</span>}</div><div className="min-w-0"><div className="truncate font-bold text-[#102a43]">{s.name}</div><div className="text-[10px] text-slate-400">{s.admissionNo}</div></div></div></td>
                      <td className="px-3 py-3"><div className="text-xs font-semibold text-[#31546a]">{s.className || 'Unassigned'}</div><SectionBadge section={s.section} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs text-[#31546a]">{v.due > 0 ? `${currency} ${v.due.toLocaleString()}` : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs text-[#876b19]">{v.opening > 0 ? `${currency} ${v.opening.toLocaleString()}` : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs font-bold text-[#008566]">{v.paidThisTerm > 0 ? `${currency} ${v.paidThisTerm.toLocaleString()}` : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs font-bold text-[#315f9e]">{v.payable > 0 ? `${currency} ${v.payable.toLocaleString()}` : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs font-bold text-[#d22b52]">{bal > 0 ? `${currency} ${bal.toLocaleString()}` : '—'}</td>
                      <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${st==='full'?'bg-[#e7f7f0] text-[#007f5f]':st==='partial'?'bg-[#fff6df] text-[#9a6500]':st==='unpaid'?'bg-[#ffedf1] text-[#c81e4a]':'bg-[#f1f4f3] text-slate-400'}`}>{pillLabel(st)}</span></td>
                      <td className="px-4 py-3"><div className="flex min-w-[300px] justify-end gap-1.5"><button onClick={() => openPay(s)} className="finance-action rounded-lg bg-[#2478e8] px-3 py-2 text-[10px] font-black text-white hover:bg-[#1769d3]">Pay</button>{hasPaid(s)&&<button onClick={() => printReceipt(s, termPayments.find((p:any)=>p.student_id===s.id), bank, currency, schoolName, logoUrl, schoolAddress)} className="finance-action rounded-lg border border-[#a9dfcf] bg-[#eefaf6] px-3 py-2 text-[10px] font-black text-[#007f5f]">Receipt</button>}<button onClick={() => setHistoryTarget(s)} className="finance-action rounded-lg border border-[#d9e3e9] bg-[#f4f7f9] px-3 py-2 text-[10px] font-black text-[#496074]">History</button>{nextTerm&&<button title={`Print ${tLabel(nextTerm)} invoice with previous outstanding balances carried forward`} onClick={() => printInvoice(s,nextTerm,structures,bank,currency,schoolName,logoUrl,schoolAddress,summary.fees,terms)} className="finance-action rounded-lg bg-[#e5ad22] px-3 py-2 text-[10px] font-black text-[#102a43] hover:bg-[#d69d10]">Next Term Invoice</button>}</div></td>
                    </tr> })}
                    {!ledgerStudents.length&&<tr><td colSpan={10} className="p-10 text-center text-sm text-slate-400">No students match this selection.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-[#e2ebe7] bg-[#fbfcfb] p-4 lg:flex-row lg:items-center lg:justify-between"><div className="text-xs text-slate-500"><b className="text-[#102a43]">{selectedIds.size}</b> selected</div><div className="flex flex-wrap gap-2"><button onClick={() => generateBulkInvoices(selectedStudents, false)} disabled={!selectedStudents.length || generatingInvoices} className="rounded-lg border border-[#cbded6] bg-white px-3 py-2 text-[10px] font-black text-[#31546a] disabled:opacity-40">▣ Generate Invoices</button><button onClick={() => generateBulkInvoices(selectedStudents, true)} disabled={!selectedStudents.length || generatingInvoices} className="rounded-lg bg-[#e5ad22] px-3 py-2 text-[10px] font-black text-[#102a43] disabled:opacity-40">▤ Print Invoices</button><button onClick={() => bulkPrintReceipts(selectedPaidStudents, summary.payments, bank, currency, schoolName, logoUrl, schoolAddress)} disabled={!selectedPaidStudents.length} className="rounded-lg border border-[#a9dfcf] bg-[#eefaf6] px-3 py-2 text-[10px] font-black text-[#007f5f] disabled:opacity-40">▤ Bulk Receipts</button><button onClick={() => classFilter && bulkPrintInvoices(byClass, currentTerm, terms, structures, bank, currency, schoolName, logoUrl, schoolAddress, summary.fees)} disabled={!classFilter || !nextTerm} className="rounded-lg border border-[#b9d3ff] bg-[#f2f7ff] px-3 py-2 text-[10px] font-black text-[#2563eb] disabled:opacity-40">▤ Class Invoices</button><button onClick={() => classFilter && bulkPrintReceipts(byClass.filter(hasPaid), summary.payments, bank, currency, schoolName, logoUrl, schoolAddress)} disabled={!classFilter || !byClass.some(hasPaid)} className="rounded-lg border border-[#a9dfcf] bg-[#eefaf6] px-3 py-2 text-[10px] font-black text-[#007f5f] disabled:opacity-40">▤ Class Receipts</button><button onClick={clearSelection} disabled={!selectedIds.size} className="rounded-lg bg-[#e9efec] px-3 py-2 text-[10px] font-black text-slate-500 disabled:opacity-40">Clear</button></div></div>
            </section>

            <section id="fee-configuration" className="scroll-mt-6 overflow-hidden rounded-2xl border border-[#dce8e2] bg-white shadow-[0_3px_14px_rgba(16,42,67,0.05)]">
              <button className="flex w-full items-center justify-between p-5 text-left" onClick={() => setShowFeeConfig(x => !x)}><div><div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#0f766e]">Finance setup</div><div className="mt-1 text-lg font-black text-[#102a43]">Fee configuration</div><div className="mt-1 text-xs text-slate-500">Set day and boarding fees by academic year and term.</div></div><span className="text-slate-400">{showFeeConfig ? '▲' : '▼'}</span></button>
              {showFeeConfig && <div className="border-t border-[#e2ebe7] p-5">
                <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[1.15fr_1fr_1fr_1fr_1fr_auto]">
                  <select className="input" value={feeForm.academicYearId} onChange={e => setFeeForm(f=>({...f,academicYearId:e.target.value,termId:''}))}><option value="">Academic year</option>{years.map(y=><option key={y.id} value={y.id}>{y.name}{y.is_current?' (current)':''}</option>)}</select>
                  <select className="input" value={feeForm.termId} onChange={e=>setFeeForm(f=>({...f,termId:e.target.value}))}><option value="">All terms in year</option>{terms.filter(t=>!feeForm.academicYearId||t.academic_year_id===feeForm.academicYearId).map(t=><option key={t.id} value={t.id}>{tLabel(t)}</option>)}</select>
                  <input className="input" type="number" min="0" placeholder="Day fee" value={feeForm.dayAmount} onChange={e=>setFeeForm(f=>({...f,dayAmount:e.target.value}))}/><input className="input" type="number" min="0" placeholder="Boarding fee" value={feeForm.boardingAmount} onChange={e=>setFeeForm(f=>({...f,boardingAmount:e.target.value}))}/><input className="input" type="date" title="Due date" value={feeForm.dueDate} onChange={e=>setFeeForm(f=>({...f,dueDate:e.target.value}))}/><button className="rounded-xl bg-[#007f5f] px-5 py-3 text-xs font-black text-white hover:bg-[#006b50] disabled:opacity-40" disabled={busy||!feeForm.academicYearId||(!feeForm.dayAmount&&!feeForm.boardingAmount)} onClick={saveFees}>{busy?'Saving…':'Save fees'}</button>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-[#b9e8d8] bg-[#effbf6] p-4"><div className="text-xs font-black text-[#007f5f]">DAY STUDENTS</div><div className="mt-1 text-2xl font-black text-[#102a43]">{currency} {Number(feeGroups.find(g=>g.termId===selectedTermId)?.day?.amount||0).toLocaleString()}</div><div className="text-[10px] text-slate-500">Current selected term structure</div></div><div className="rounded-xl border border-[#b9d3ff] bg-[#f2f7ff] p-4"><div className="text-xs font-black text-[#2563eb]">BOARDING STUDENTS</div><div className="mt-1 text-2xl font-black text-[#102a43]">{currency} {Number(feeGroups.find(g=>g.termId===selectedTermId)?.boarding?.amount||0).toLocaleString()}</div><div className="text-[10px] text-slate-500">Current selected term structure</div></div></div>
                <div className="mt-5 overflow-x-auto rounded-xl border border-[#dce8e2]"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-[#f4f8f6] text-[10px] uppercase tracking-wider text-[#647889]"><tr><th className="p-3">Year</th><th>Term</th><th className="text-right">Day fee</th><th className="text-right">Boarding fee</th><th>Due date</th><th /></tr></thead><tbody>{feeGroups.map((g,i)=><tr key={i} className="border-t border-[#e7eeeb]"><td className="p-3 text-[#31546a]">{g.year?.name||'—'}</td><td className="text-[#31546a]">{g.termId?tLabel(g.term):'All terms'}</td><td className="text-right font-mono text-[#007f5f]">{g.day?`${currency} ${Number(g.day.amount).toLocaleString()}`:'—'}</td><td className="text-right font-mono text-[#2563eb]">{g.boarding?`${currency} ${Number(g.boarding.amount).toLocaleString()}`:'—'}</td><td className="text-slate-500">{g.dueDate||'—'}</td><td><div className="flex gap-1.5 p-2"><button className="rounded-lg bg-[#f1f5f3] px-2 py-1 text-[10px] font-bold text-[#31546a]" onClick={()=>startEditGroup(g)}>Edit</button><button className="rounded-lg bg-[#ffedf1] px-2 py-1 text-[10px] font-bold text-[#c81e4a]" onClick={()=>deleteFeeGroup(g)}>Delete</button></div></td></tr>)}{!feeGroups.length&&<tr><td colSpan={6} className="p-6 text-center text-slate-500">No fee structures configured yet.</td></tr>}</tbody></table></div>
              </div>}
            </section>

            <section id="bank-configuration" className="scroll-mt-6 overflow-hidden rounded-2xl border border-[#dce8e2] bg-white shadow-[0_3px_14px_rgba(16,42,67,0.05)]">
              <button className="flex w-full items-center justify-between p-5 text-left" onClick={() => setShowBankConfig(x=>!x)}><div><div className="text-[10px] font-black uppercase tracking-[0.15em] text-[#0f766e]">Payment setup</div><div className="mt-1 text-lg font-black text-[#102a43]">School bank account</div><div className="mt-1 text-xs text-slate-500">Shown on parent invoices and receipts.</div></div><span className="text-slate-400">{showBankConfig?'▲':'▼'}</span></button>
              {showBankConfig&&<div className="border-t border-[#e2ebe7] p-5"><div className="grid gap-3 md:grid-cols-2"><input className="input" placeholder="Bank name" value={bank.bank_name||''} onChange={e=>setBank({...bank,bank_name:e.target.value})}/><input className="input" placeholder="Account name" value={bank.account_name||''} onChange={e=>setBank({...bank,account_name:e.target.value})}/><input className="input font-mono" placeholder="Account number" value={bank.account_number||''} onChange={e=>setBank({...bank,account_number:e.target.value})}/><input className="input" placeholder="Payment reference instruction" value={bank.reference_instruction||''} onChange={e=>setBank({...bank,reference_instruction:e.target.value})}/></div><button className="mt-4 rounded-xl bg-[#007f5f] px-5 py-3 text-xs font-black text-white hover:bg-[#006b50]" disabled={busy} onClick={saveBank}>{busy?'Saving…':'Save bank details'}</button></div>}
            </section>
          </main>
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
