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

function printReceipt(student: any, payment: any, bank: any, currency: string, schoolName: string, logoUrl = '', schoolAddress = '', terms: any[] = []) {
  const w = window.open('', '_blank', 'width=520,height=780');
  if (!w) return;
  const date = new Date(payment.paid_on || Date.now()).toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' });
  const refNo = String(payment.id || '').slice(-8).toUpperCase();
  const paymentTerm = terms.find((t: any) => t.id === payment.term_id);
  const termLabel = paymentTerm ? `${tLabel(paymentTerm)} · ${paymentTerm.academic_years?.name || ''}`.trim() : '';
  const accent = '#062d2a';
  w.document.write(`<!DOCTYPE html><html><head><title>Receipt · ${student.name||student.full_name||''}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;padding:30px;font-size:13px;color:#1a1a1a}.top{text-align:center;padding-bottom:16px;border-bottom:3px solid ${accent};margin-bottom:16px}.school{font-size:16px;font-weight:800;letter-spacing:-.01em}.sub{font-size:11px;color:#555;margin-top:3px}.badge{display:inline-block;color:#fff;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.06em;margin-top:9px}.ab{background:#f0fdf4;border:2px solid #86efac;border-radius:12px;text-align:center;padding:14px;margin:16px 0}.al{font-size:11px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.av{font-size:28px;font-weight:900;color:${accent};margin-top:4px}table{width:100%;border-collapse:collapse;margin-bottom:12px}td{padding:6px 4px;border-bottom:1px solid #f0f0f0;vertical-align:top}td:first-child{color:#666;width:40%}td:last-child{font-weight:600}.st{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#888;margin:12px 0 5px}.footer{margin-top:16px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px}@media print{body{padding:16px}}</style>
  </head><body>
  ${schoolHeader(logoUrl, schoolName, schoolAddress, 'PAYMENT RECEIPT', accent)}
  <div class="ab"><div class="al">Amount Paid</div><div class="av">${currency} ${Number(payment.amount||0).toLocaleString()}</div></div>
  <div class="st">Receipt details</div>
  <table><tr><td>Receipt No.</td><td>REC-${refNo}</td></tr><tr><td>Date</td><td>${date}</td></tr>${termLabel?`<tr><td>Payment for</td><td><b>${termLabel}</b></td></tr>`:''}<tr><td>Method</td><td>${payment.method||'Cash'}</td></tr>${payment.reference?`<tr><td>Reference</td><td>${payment.reference}</td></tr>`:''}</table>
  <div class="st">Student</div>
  <table><tr><td>Name</td><td>${student.name||student.full_name||'—'}</td></tr><tr><td>Admission No.</td><td>${student.admissionNo||student.admission_no||'—'}</td></tr><tr><td>Class</td><td>${student.className||'—'}</td></tr><tr><td>Section</td><td>${student.section||'—'}</td></tr></table>
  ${bank?.bank_name?`<div class="st">School bank account</div><table><tr><td>Bank</td><td>${bank.bank_name}</td></tr><tr><td>Account name</td><td>${bank.account_name||'—'}</td></tr><tr><td>Account No.</td><td>${bank.account_number||'—'}</td></tr></table>`:''}
  <div style="margin-top:22px;border-top:1px solid #e5e7eb;padding-top:30px"><div style="font-size:10px;color:#64748b;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Cashier's signature</div><div style="margin-top:3px;border-bottom:1px dotted #94a3b8;height:18px"></div></div>
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

function bulkPrintReceipts(students: Student[], payments: any[], bank: any, currency: string, schoolName: string, logoUrl = '', schoolAddress = '', terms: any[] = []) {
  // 4-up receipts per A4 sheet, each in its own tile with a dashed border
  // and a ✂ scissors icon on the shared cut lines so admin can trim the
  // paper into 4 individual receipts after printing. Massively cuts paper
  // cost compared to one receipt per A4 page.
  const w = window.open('', '_blank');
  if (!w) return;
  const accent = '#062d2a';
  const logoTag = logoUrl
    ? `<img src="${logoUrl}" style="height:18mm;max-width:38mm;object-fit:contain;" alt="logo">`
    : '';

  // One receipt tile (fits in one quarter of A4).
  const tile = (s: Student, p: any) => {
    const date  = new Date(p.paid_on || Date.now()).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' });
    const refNo = String(p.id || '').slice(-8).toUpperCase();
    const paymentTerm = terms.find((t: any) => t.id === p.term_id);
    const termLabel = paymentTerm ? `${tLabel(paymentTerm)}${paymentTerm.academic_years?.name ? ' · ' + paymentTerm.academic_years.name : ''}` : '';
    return `<article class="tile">
      <header>
        ${logoTag}
        <div class="school">${schoolName || 'AMQM'}</div>
        ${schoolAddress ? `<div class="addr">${schoolAddress}</div>` : ''}
        <div class="badge">PAYMENT RECEIPT</div>
      </header>
      <section class="amount">
        <div class="al">Amount Paid</div>
        <div class="av">${currency} ${Number(p.amount || 0).toLocaleString()}</div>
      </section>
      <div class="grid">
        <div class="col">
          <div class="row"><span>Receipt</span><b>REC-${refNo}</b></div>
          <div class="row"><span>Date</span><b>${date}</b></div>
          ${termLabel ? `<div class="row"><span>For</span><b>${termLabel}</b></div>` : ''}
          <div class="row"><span>Method</span><b>${p.method || 'Cash'}</b></div>
          ${p.reference ? `<div class="row"><span>Ref</span><b>${p.reference}</b></div>` : ''}
        </div>
        <div class="col">
          <div class="row"><span>Student</span><b>${s.name}</b></div>
          <div class="row"><span>Admission</span><b>${s.admissionNo}</b></div>
          <div class="row"><span>Class</span><b>${s.className || '—'}</b></div>
          <div class="row"><span>Section</span><b>${s.section || '—'}</b></div>
        </div>
      </div>
      ${bank?.bank_name ? `<footer class="bank">${bank.bank_name} · ${bank.account_number || '—'}</footer>` : ''}
      <div class="sig">Cashier's signature: ______________________</div>
    </article>`;
  };

  // Build 4-up sheets. Each sheet gets up to 4 tiles in a 2x2 grid with
  // cut markers drawn across the shared borders.
  const items = students.map(s => ({ s, p: payments.find((x: any) => x.student_id === s.id) })).filter(x => !!x.p);
  if (!items.length) { w.close(); alert('No payment records found for this class.'); return; }
  const sheets: string[] = [];
  for (let i = 0; i < items.length; i += 4) {
    const chunk = items.slice(i, i + 4);
    const cells = chunk.map(x => tile(x.s, x.p));
    while (cells.length < 4) cells.push('<article class="tile tile--empty"></article>');
    sheets.push(`<div class="sheet">
      ${cells.join('')}
      <div class="cut cut--vertical">
        <span class="scissors scissors--top">✂</span>
        <span class="scissors scissors--mid">✂</span>
        <span class="scissors scissors--bot">✂</span>
      </div>
      <div class="cut cut--horizontal">
        <span class="scissors scissors--left">✂</span>
        <span class="scissors scissors--mid">✂</span>
        <span class="scissors scissors--right">✂</span>
      </div>
    </div>`);
  }

  w.document.write(`<!DOCTYPE html><html><head><title>Bulk Receipts (${items.length})</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{background:#eef1f0;font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a}
@page{size:A4;margin:0}

.sheet{
  position:relative;width:210mm;height:297mm;background:#fff;
  display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;
  page-break-after:always;
}
.sheet:last-child{page-break-after:auto}

/* Each receipt tile. Dashed border forms the cut edge visible to admin. */
.tile{
  position:relative;overflow:hidden;padding:8mm 8mm 10mm;
  border:1px dashed #94a3b8;
  display:flex;flex-direction:column;gap:3mm;
  break-inside:avoid;page-break-inside:avoid;
}
.tile--empty{background:repeating-linear-gradient(45deg,#f8fafc 0,#f8fafc 8px,#f1f5f9 8px,#f1f5f9 16px)}
/* Collapse shared borders so the dashed line reads as a single cut line. */
.tile:nth-child(1){border-right-style:none;border-bottom-style:none}
.tile:nth-child(2){border-bottom-style:none}
.tile:nth-child(3){border-right-style:none}

/* Header */
.tile header{text-align:center;padding-bottom:3mm;border-bottom:1.2mm solid ${accent}}
.tile .school{font-size:11.5pt;font-weight:800;color:${accent};margin-top:1.5mm;letter-spacing:-.01em}
.tile .addr{font-size:7pt;color:#64748b;margin-top:1mm}
.tile .badge{display:inline-block;background:${accent};color:#fff;padding:1.4mm 4mm;border-radius:12mm;font-size:7pt;font-weight:800;letter-spacing:.08em;margin-top:2.3mm}

/* Amount highlight */
.tile .amount{background:#f0fdf4;border:0.4mm solid #86efac;border-radius:2.5mm;text-align:center;padding:3mm}
.tile .al{font-size:7pt;color:#166534;font-weight:800;text-transform:uppercase;letter-spacing:.1em}
.tile .av{font-size:17pt;font-weight:900;color:${accent};margin-top:1mm;letter-spacing:-.01em}

/* Two-column fact grid */
.tile .grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm}
.tile .col{display:flex;flex-direction:column;gap:1.3mm}
.tile .row{display:flex;align-items:baseline;justify-content:space-between;gap:2mm;border-bottom:0.2mm solid #e2e8f0;padding-bottom:1mm;font-size:8.5pt}
.tile .row span{color:#64748b;font-size:7.5pt;flex-shrink:0}
.tile .row b{font-weight:700;color:#111827;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Footer */
.tile .bank{font-size:7pt;color:#64748b;border-top:0.2mm solid #e2e8f0;padding-top:1.5mm;text-align:center}
.tile .sig{margin-top:auto;padding-top:2mm;font-size:7pt;color:#94a3b8;text-align:center}

/* Cut lines overlay the shared borders with scissors icons. */
.cut{position:absolute;pointer-events:none}
.cut--vertical{top:0;bottom:0;left:50%;width:0}
.cut--horizontal{left:0;right:0;top:50%;height:0}
.scissors{
  position:absolute;background:#fff;color:#334155;font-size:11pt;line-height:1;
  padding:0 2mm;transform:translate(-50%,-50%);
  letter-spacing:0;font-weight:700;
}
.cut--vertical .scissors--top{top:20mm;left:0}
.cut--vertical .scissors--mid{top:50%;left:0}
.cut--vertical .scissors--bot{bottom:20mm;left:0;top:auto}
.cut--horizontal .scissors--left{left:20mm;top:0}
.cut--horizontal .scissors--mid{left:50%;top:0}
.cut--horizontal .scissors--right{right:20mm;top:0;left:auto}

/* Screen preview — show the sheet as a nice page on a grey background. */
@media screen{
  body{padding:20px 0}
  .sheet{margin:0 auto 30px;box-shadow:0 10px 40px rgba(16,37,31,.15);border-radius:3mm}
}
@media print{body{padding:0;background:#fff}.sheet{box-shadow:none;border-radius:0}}
</style></head><body>
${sheets.join('')}
<script>window.onload=()=>setTimeout(()=>window.print(),300);<\/script>
</body></html>`);
  w.document.close();
}

function bulkPrintInvoices(students: Student[], currentTerm: any, terms: any[], structs: any[], bank: any, currency: string, schoolName: string, logoUrl = '', schoolAddress = '', fees: any[] = []) {
  // 4-up invoices per A4 sheet — same cut-and-share layout as receipts
  // so admin can trim one sheet into four per-student invoices.
  const nextTerm = findNextTerm(currentTerm, terms);
  if (!nextTerm) { alert('Could not determine next term. Set up terms in school calendar first.'); return; }
  const nextTermName = `${tLabel(nextTerm)} ${nextTerm.academic_years?.name || ''}`.trim();
  const accent = '#062d2a';
  const logoTag = logoUrl ? `<img src="${logoUrl}" style="height:16mm;max-width:36mm;object-fit:contain;" alt="logo">` : '';
  const w = window.open('', '_blank');
  if (!w) return;

  const tile = (s: Student) => {
    const sec = String(s.section).toLowerCase() === 'boarding' ? 'boarding' : 'day';
    const feeRow = getStudentFee(structs, nextTerm.id, nextTerm.academic_year_id, sec);
    if (!feeRow) return null;
    const feeAmount = Number(feeRow.amount);
    const carry = outstandingItemsBeforeTerm(s.id, nextTerm, fees, terms);
    const opening = carry.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const totalPayable = feeAmount + opening;
    const invoiceNo = `INV-${String(s.admissionNo || '').toUpperCase()}-T${nextTerm.term_number || ''}`;
    return `<article class="tile">
      <header>
        ${logoTag}
        <div class="school">${schoolName || 'AMQM'}</div>
        ${schoolAddress ? `<div class="addr">${schoolAddress}</div>` : ''}
        <div class="badge">FEES INVOICE</div>
      </header>
      <div class="termline">${nextTermName}</div>
      <section class="amount">
        <div class="al">Total Payable</div>
        <div class="av">${currency} ${totalPayable.toLocaleString()}</div>
      </section>
      <div class="rows">
        ${carry.length ? carry.map((item: any) => `<div class="row"><span>Outstanding · ${item.termLabel}</span><b>${currency} ${Number(item.amount).toLocaleString()}</b></div>`).join('') : ''}
        <div class="row"><span>Current term fee</span><b>${currency} ${feeAmount.toLocaleString()}</b></div>
      </div>
      <div class="grid">
        <div class="col">
          <div class="row2"><span>Student</span><b>${s.name}</b></div>
          <div class="row2"><span>Admission</span><b>${s.admissionNo}</b></div>
          <div class="row2"><span>Class</span><b>${s.className || '—'}</b></div>
        </div>
        <div class="col">
          <div class="row2"><span>Invoice</span><b>${invoiceNo}</b></div>
          <div class="row2"><span>Section</span><b>${sec.charAt(0).toUpperCase() + sec.slice(1)}</b></div>
          <div class="row2"><span>Issued</span><b>${new Date().toLocaleDateString('en-NG')}</b></div>
        </div>
      </div>
      ${bank?.bank_name ? `<footer class="bank">Pay to ${bank.bank_name} · ${bank.account_number || '—'}</footer>` : ''}
      <div class="ref">Ref: <b>${s.admissionNo || 'Use admission number'}</b></div>
    </article>`;
  };

  const tiles = students.map(tile).filter(Boolean) as string[];
  if (!tiles.length) { w.close(); alert('No fee structures configured for the next term yet.'); return; }
  const sheets: string[] = [];
  for (let i = 0; i < tiles.length; i += 4) {
    const chunk = tiles.slice(i, i + 4);
    while (chunk.length < 4) chunk.push('<article class="tile tile--empty"></article>');
    sheets.push(`<div class="sheet">
      ${chunk.join('')}
      <div class="cut cut--vertical"><span class="scissors scissors--top">✂</span><span class="scissors scissors--mid">✂</span><span class="scissors scissors--bot">✂</span></div>
      <div class="cut cut--horizontal"><span class="scissors scissors--left">✂</span><span class="scissors scissors--mid">✂</span><span class="scissors scissors--right">✂</span></div>
    </div>`);
  }

  w.document.write(`<!DOCTYPE html><html><head><title>Bulk Invoices (${tiles.length})</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{background:#eef1f0;font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a}
@page{size:A4;margin:0}
.sheet{position:relative;width:210mm;height:297mm;background:#fff;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;page-break-after:always}
.sheet:last-child{page-break-after:auto}
.tile{position:relative;overflow:hidden;padding:7mm 7mm 9mm;border:1px dashed #94a3b8;display:flex;flex-direction:column;gap:2.3mm;break-inside:avoid;page-break-inside:avoid}
.tile--empty{background:repeating-linear-gradient(45deg,#f8fafc 0,#f8fafc 8px,#f1f5f9 8px,#f1f5f9 16px)}
.tile:nth-child(1){border-right-style:none;border-bottom-style:none}
.tile:nth-child(2){border-bottom-style:none}
.tile:nth-child(3){border-right-style:none}
.tile header{text-align:center;padding-bottom:2.5mm;border-bottom:1.2mm solid ${accent}}
.tile .school{font-size:11pt;font-weight:800;color:${accent};margin-top:1.2mm;letter-spacing:-.01em}
.tile .addr{font-size:7pt;color:#64748b;margin-top:.6mm}
.tile .badge{display:inline-block;background:${accent};color:#fff;padding:1.2mm 4mm;border-radius:12mm;font-size:7pt;font-weight:800;letter-spacing:.08em;margin-top:1.8mm}
.tile .termline{text-align:center;background:#f0fdf4;border:0.4mm solid #86efac;border-radius:2mm;padding:1.6mm 2mm;font-size:8pt;font-weight:800;color:${accent}}
.tile .amount{background:#f0fdf4;border:0.4mm solid #86efac;border-radius:2.5mm;text-align:center;padding:2.5mm}
.tile .al{font-size:7pt;color:#166534;font-weight:800;text-transform:uppercase;letter-spacing:.1em}
.tile .av{font-size:16pt;font-weight:900;color:${accent};margin-top:.8mm;letter-spacing:-.01em}
.tile .rows{display:flex;flex-direction:column;gap:.8mm}
.tile .row{display:flex;justify-content:space-between;gap:2mm;font-size:7.6pt;border-bottom:0.2mm dotted #e2e8f0;padding-bottom:.8mm}
.tile .row span{color:#64748b;flex-shrink:0}
.tile .row b{font-weight:700;color:#111827}
.tile .grid{display:grid;grid-template-columns:1fr 1fr;gap:2.5mm;margin-top:1mm}
.tile .col{display:flex;flex-direction:column;gap:1mm}
.tile .row2{display:flex;justify-content:space-between;gap:1mm;font-size:7.5pt;border-bottom:0.2mm solid #e2e8f0;padding-bottom:.8mm}
.tile .row2 span{color:#64748b}
.tile .row2 b{font-weight:700;color:#111827;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tile .bank{font-size:7pt;color:#64748b;border-top:0.2mm solid #e2e8f0;padding-top:1.3mm;text-align:center}
.tile .ref{margin-top:auto;font-size:7.5pt;color:#166534;background:#f0fdf4;border:0.3mm solid #86efac;border-radius:1.8mm;padding:1.4mm 2.5mm;text-align:center}
.cut{position:absolute;pointer-events:none}
.cut--vertical{top:0;bottom:0;left:50%;width:0}
.cut--horizontal{left:0;right:0;top:50%;height:0}
.scissors{position:absolute;background:#fff;color:#334155;font-size:11pt;line-height:1;padding:0 2mm;transform:translate(-50%,-50%);font-weight:700}
.cut--vertical .scissors--top{top:20mm;left:0}
.cut--vertical .scissors--mid{top:50%;left:0}
.cut--vertical .scissors--bot{bottom:20mm;left:0;top:auto}
.cut--horizontal .scissors--left{left:20mm;top:0}
.cut--horizontal .scissors--mid{left:50%;top:0}
.cut--horizontal .scissors--right{right:20mm;top:0;left:auto}
@media screen{body{padding:20px 0}.sheet{margin:0 auto 30px;box-shadow:0 10px 40px rgba(16,37,31,.15);border-radius:3mm}}
@media print{body{padding:0;background:#fff}.sheet{box-shadow:none;border-radius:0}}
</style></head><body>${sheets.join('')}
<script>window.onload=()=>setTimeout(()=>window.print(),300);<\/script>
</body></html>`);
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
  const [statusFilter, setStatusFilter] = useState<'all'|'full'|'partial'|'unpaid'|'exempted'>('all');
  const [feeExemptions, setFeeExemptions] = useState<Map<string, { reason: string; notes?: string | null }>>(new Map());
  const [exemptionBusy, setExemptionBusy] = useState<string | null>(null);
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

  async function refresh(overrideTermId?: string) {
    const requestId = ++refreshSeq.current;
    if (mountedRef.current) setRefreshing(true);
    try {
      // Ask the finance loader for THIS term specifically — the admin may
      // be viewing a term that isn't the currently-active one (e.g. sitting
      // in the gap between First and Second Term). Previously the loader
      // hardcoded is_current=true and returned empty, which made every
      // total on the page render as zero.
      const termIdForSummary = overrideTermId ?? selectedTermId ?? null;
      const [s, fs, sm, cms, cur, y, t, siteMeta] = await Promise.all([
        loadStudents(), loadFeeStructures(), loadFinanceSummary(termIdForSummary), loadCMSSettings(), loadCurrentAcademicTerm(),
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
      // Always establish a valid term selection. The finance page must never
      // render against an empty term id because that makes all term-scoped
      // figures appear as zero even though the database contains the data.
      // Preserve an existing user selection during background refreshes.
      // Otherwise fall back to (in order):
      //   1. the operational RPC's current term,
      //   2. the term whose date range contains today,
      //   3. the most recently ended term (so between-term periods still
      //      show the last term's figures),
      //   4. the next upcoming term,
      //   5. the first configured term.
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
      const allTerms = t || [];
      const containsToday = allTerms.find((term: any) =>
        term.starts_on && term.ends_on && String(term.starts_on) <= today && today <= String(term.ends_on));
      const mostRecentEnded = allTerms
        .filter((term: any) => term.ends_on && String(term.ends_on) < today)
        .sort((a: any, b: any) => String(b.ends_on).localeCompare(String(a.ends_on)))[0];
      const nextUpcoming = allTerms
        .filter((term: any) => term.starts_on && String(term.starts_on) > today)
        .sort((a: any, b: any) => String(a.starts_on).localeCompare(String(b.starts_on)))[0];
      const fallbackTermId =
        cur?.term_id
        || containsToday?.id
        || mostRecentEnded?.id
        || nextUpcoming?.id
        || allTerms.find((term: any) => term.term_number === 1)?.id
        || allTerms[0]?.id
        || '';
      // If the summary returned a resolved termId (because we passed no
      // override on cold-start), sync the selection to it so downstream
      // memos filter against the same term.
      const resolvedFromSummary = (sm as any)?.termId as string | undefined;
      setSelectedTermId(prev => {
        if (prev && allTerms.some((term: any) => term.id === prev)) return prev;
        return resolvedFromSummary || fallbackTermId;
      });
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
    if (!selectedTermId || loading) return;
    // First time we see this term in the session: sync allocations so every
    // active student has a student_fees row for the term's fee structures.
    if (!syncedTermsRef.current.has(selectedTermId)) {
      syncedTermsRef.current.add(selectedTermId);
      syncStudentFeeAllocations(selectedTermId)
        .then(() => refresh(selectedTermId))
        .catch((e: any) => {
          syncedTermsRef.current.delete(selectedTermId);
          setMessage(e?.message || 'Unable to synchronize student fee allocations.');
          // Still refresh so the page picks up whatever exists for the term.
          refresh(selectedTermId);
        });
    } else {
      // Term already synced this session — just refetch the summary for it.
      refresh(selectedTermId);
    }
  }, [selectedTermId, loading]);

  const currentTerm = useMemo(() => terms.find(t => t.id === selectedTermId) || null, [terms, selectedTermId]);
  const nextTerm = useMemo(() => findNextTerm(currentTerm, terms), [currentTerm, terms]);

  useEffect(() => {
    let cancelled = false;
    async function loadFeeExemptions() {
      if (!selectedTermId) { setFeeExemptions(new Map()); return; }
      const { data, error } = await createClient()
        .from('student_fee_exemptions')
        .select('student_id,reason,notes')
        .eq('term_id', selectedTermId)
        .eq('active', true);
      if (cancelled) return;
      if (error) { console.error('Fee exemption load failed:', error); setMessage(error.message || 'Unable to load fee exemptions.'); setFeeExemptions(new Map()); return; }
      setFeeExemptions(new Map((data || []).map((row: any) => [row.student_id, { reason: row.reason || 'Fee exemption', notes: row.notes || null }])));
    }
    loadFeeExemptions();
    return () => { cancelled = true; };
  }, [selectedTermId]);

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

  function getStatus(s: Student): 'full'|'partial'|'unpaid'|'exempted'|'none' {
    if (feeExemptions.has(s.id)) return 'exempted';
    const v = byStudentAccount.get(s.id) || { payable: 0, outstanding: 0, paidThisTerm: 0 };
    if (v.payable <= 0) return 'none';
    if (v.outstanding <= 0) return 'full';
    if (v.paidThisTerm > 0) return 'partial';
    return 'unpaid';
  }

  // Keep status filtering after the account map is initialized. Previously clicking
  // Paid in Full / Partial / Not Paid could evaluate getStatus() before
  // byStudentAccount existed, crashing the client page at runtime.
  const filtered = useMemo(() => statusFilter === 'all' ? byClass : byClass.filter(s => getStatus(s) === statusFilter), [byClass, statusFilter, byStudentAccount, feeExemptions]);
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
    let full = 0, partial = 0, unpaid = 0, exempted = 0;
    for (const s of byClass) { const st = getStatus(s); if (st === 'full') full++; else if (st === 'partial') partial++; else if (st === 'unpaid') unpaid++; else if (st === 'exempted') exempted++; }
    return { full, partial, unpaid, exempted };
  }, [byClass, byStudentAccount]);

  function openPay(s: Student) {
    if (feeExemptions.has(s.id)) { setMessage(s.name + ' is exempted from school fees for the selected term.'); return; }
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
      printReceipt(payTarget, payment, bank, currency, schoolName, logoUrl, schoolAddress, terms);
    } catch (e: any) { setMessage(e?.message || 'Payment failed'); }
    finally { setPaying(false); }
  }

  async function toggleFeeExemption(s: Student) {
    if (!selectedTermId) { setMessage('Choose a term before managing fee exemptions.'); return; }
    if (exemptionBusy) return;
    const existing = feeExemptions.get(s.id);
    setExemptionBusy(s.id);
    try {
      const client = createClient();
      if (existing) {
        const { error } = await client.from('student_fee_exemptions')
          .update({ active: false })
          .eq('student_id', s.id)
          .eq('term_id', selectedTermId);
        if (error) throw error;
        await syncStudentFeeAllocations(selectedTermId);
        setFeeExemptions(prev => { const next = new Map(prev); next.delete(s.id); return next; });
        setMessage(s.name + ' is no longer exempted for ' + (currentTerm ? tLabel(currentTerm) : 'this term') + '.');
        await refresh();
      } else {
        const reason = window.prompt(
          'Why is ' + s.name + ' exempted from school fees for ' + (currentTerm ? tLabel(currentTerm) : 'this term') + '?\n\nEnter a clear reason (for example: scholarship, sponsorship, hardship support).'
        );
        if (!reason || !reason.trim()) return;
        const notes = window.prompt('Additional exemption notes (optional):') || null;
        const { error } = await client.from('student_fee_exemptions').upsert(
          { student_id: s.id, term_id: selectedTermId, reason: reason.trim(), notes: notes && notes.trim() ? notes.trim() : null, active: true },
          { onConflict: 'student_id,term_id' }
        );
        if (error) throw error;
        await syncStudentFeeAllocations(selectedTermId);
        setFeeExemptions(prev => { const next = new Map(prev); next.set(s.id, { reason: reason.trim(), notes: notes && notes.trim() ? notes.trim() : null }); return next; });
        setMessage(s.name + ' is exempted for ' + (currentTerm ? tLabel(currentTerm) : 'this term') + '. No payment should be recorded.');
        await refresh();
      }
    } catch (e: any) {
      setMessage(e?.message || 'Unable to update fee exemption.');
    } finally {
      setExemptionBusy(null);
    }
  }
  async function markFullyPaid(s: Student) {
    const v = byStudentAccount.get(s.id) || { outstanding: 0 };
    const bal = Math.max(0, v.outstanding);
    if (bal <= 0 || !selectedTermId) return;
    if (!confirm(`Mark ${s.name} as fully paid?\nAmount: ${currency} ${bal.toLocaleString()}`)) return;
    try {
      const payment = await recordPayment({ studentId: s.id, termId: selectedTermId, amount: bal, method: 'Cash' });
      await refresh();
      printReceipt(s, payment, bank, currency, schoolName, logoUrl, schoolAddress, terms);
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
    st === 'full' ? 'Paid in full' : st === 'partial' ? 'Partial' : st === 'unpaid' ? 'Unpaid' : st === 'exempted' ? 'Exempted' : 'No fee set';

  const money = (n: number) => `${currency} ${Number(n || 0).toLocaleString()}`;
  const collectionPct = expected > 0 ? Math.min(100, Math.round((collected / expected) * 100)) : 0;

  return (
    <AdminShell title="Finance & Fees">
      <div className="space-y-5">
        {/* --- Hero: term / class pickers + headline numbers ---------- */}
        <section className="rounded-[2rem] bg-[#062d2a] p-6 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#e3c36b]">AMQM · Finance</div>
              <h1 className="mt-2 text-3xl font-black">Fees &amp; Payments</h1>
              <p className="mt-2 max-w-2xl text-sm text-emerald-50/80">
                Record payments, see who still owes, print receipts and invoices &mdash; all in one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="h-11 min-w-[180px] rounded-xl border-0 bg-white px-3 text-sm font-bold text-slate-900" value={selectedTermId} onChange={e => setSelectedTermId(e.target.value)}>
                <option value="">Choose a term</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.academic_years?.name} · {tLabel(t)}</option>)}
              </select>
              <select className="h-11 min-w-[160px] rounded-xl border-0 bg-white px-3 text-sm font-bold text-slate-900" value={classFilter} onChange={e => { setClassFilter(e.target.value); setStatusFilter('all'); clearSelection(); }}>
                <option value="">All classes</option>
                {classNames.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="rounded-xl bg-[#e3c36b] px-5 py-3 text-sm font-black text-[#062d2a] hover:bg-amber-300" onClick={() => filtered[0] && openPay(filtered[0])}>＋ Record Payment</button>
            </div>
          </div>
        </section>

        {message && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">✓ {message}</div>}

        {/* --- Three big numbers that actually matter ----------------- */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Total Payable</div>
            <div className="mt-2 text-3xl font-black text-slate-900 tabular-nums">{money(totalPayable)}</div>
            <div className="mt-1 text-xs text-slate-500">This term + previous outstanding</div>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Paid This Term</div>
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white">{collectionPct}%</span>
            </div>
            <div className="mt-2 text-3xl font-black text-emerald-800 tabular-nums">{money(collected)}</div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: collectionPct + '%' }} />
            </div>
          </div>
          <div className={'rounded-2xl border p-5 ' + (totalOutstanding > 0 ? 'border-rose-100 bg-rose-50' : 'border-slate-200 bg-white')}>
            <div className={'text-[10px] font-black uppercase tracking-wide ' + (totalOutstanding > 0 ? 'text-rose-700' : 'text-slate-500')}>Outstanding</div>
            <div className={'mt-2 text-3xl font-black tabular-nums ' + (totalOutstanding > 0 ? 'text-rose-800' : 'text-emerald-700')}>{money(totalOutstanding)}</div>
            <div className="mt-1 text-xs text-slate-500">{counts.unpaid} unpaid · {counts.partial} partial</div>
          </div>
        </div>

        {/* --- Secondary stats + optional analytics ------------------- */}
        <details className="group rounded-2xl border border-slate-200 bg-white">
          <summary className="flex cursor-pointer items-center justify-between p-4 text-sm font-black text-slate-700">
            <span>▸ Breakdown &amp; analytics ({currentTerm ? tLabel(currentTerm) : 'select a term'})</span>
            <span className="text-xs font-bold text-slate-400 group-open:hidden">Click to expand</span>
          </summary>
          <div className="grid gap-4 border-t border-slate-100 p-4 md:grid-cols-[1fr_1fr_1fr]">
            <div className="space-y-2">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500">By the numbers</div>
              <Stat label="This term's expected fees" value={money(expected)} />
              <Stat label="Previous balance carried in" value={money(previousOutstanding)} />
              <Stat label="Students in view" value={String(byClass.length)} />
            </div>
            <div>
              <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Payment status</div>
              <div className="flex items-center gap-4">
                <div className="relative grid h-28 w-28 place-items-center rounded-full"
                  style={{ background: `conic-gradient(#10b981 0 ${(counts.full / Math.max(1, byClass.length)) * 360}deg, #f59e0b 0 ${((counts.full + counts.partial) / Math.max(1, byClass.length)) * 360}deg, #f43f5e 0 360deg)` }}>
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-white">
                    <b className="text-xl text-slate-900">{byClass.length}</b>
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  {([['Paid in full', counts.full, 'emerald', 'full'], ['Partial', counts.partial, 'amber', 'partial'], ['Not paid', counts.unpaid, 'rose', 'unpaid']] as const).map(([l, c, col, key]) => (
                    <button key={l} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
                      className="flex items-center gap-2 hover:underline">
                      <span className={'h-2.5 w-2.5 rounded-full bg-' + col + '-500'} />
                      <span className="text-slate-700">{l}</span>
                      <b className={'text-' + col + '-700'}>{c}</b>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Monthly collection</div>
              <div className="flex h-28 items-end gap-2 border-b border-slate-200">
                {monthlyCollection.map(m => (
                  <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <div className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-emerald-700 to-emerald-400"
                      style={{ height: Math.max(5, (m.amount / maxMonthlyCollection) * 100) + '%' }}
                      title={money(m.amount)} />
                    <span className="text-[9px] font-bold text-slate-500">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </details>

        {/* --- Simple status filter row ------------------------------- */}
        <div className="flex flex-wrap gap-2">
          {([['all', 'All', byClass.length, 'slate'], ['full', 'Paid in full', counts.full, 'emerald'], ['partial', 'Partial', counts.partial, 'amber'], ['unpaid', 'Not paid', counts.unpaid, 'rose'], ['exempted', 'Exempted', counts.exempted, 'violet']] as const).map(([key, label, count, col]) => (
            <button key={key} onClick={() => setStatusFilter(key)}
              className={'rounded-full border px-4 py-2 text-xs font-black transition ' +
                (statusFilter === key
                  ? 'bg-' + col + '-600 text-white border-' + col + '-600'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50')}>
              {label} · {count}
            </button>
          ))}
        </div>

        {/* --- Student ledger ----------------------------------------- */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">Students</h2>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-700">{ledgerStudents.length}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{classFilter || 'All classes'} · {currentTerm ? tLabel(currentTerm) : 'Pick a term'}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search student or admission no…"
                className="h-10 w-full min-w-[200px] max-w-[280px] rounded-lg border border-slate-200 px-3 text-sm" />
              <button className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={toggleAllVisible}>
                {ledgerStudents.length && ledgerStudents.every(s => selectedIds.has(s.id)) ? 'Clear selection' : 'Select all'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="w-10 px-4 py-3"><input type="checkbox"
                    checked={ledgerStudents.length > 0 && ledgerStudents.every(s => selectedIds.has(s.id))}
                    onChange={toggleAllVisible} /></th>
                  <th className="px-3 py-3">Student</th>
                  <th>Class</th>
                  <th className="text-right">Payable</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Outstanding</th>
                  <th>Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ledgerStudents.map(s => {
                  const v = byStudentAccount.get(s.id) || { due: 0, opening: 0, payable: 0, paidThisTerm: 0, outstanding: 0 };
                  const bal = Math.max(0, v.outstanding);
                  const st = getStatus(s);
                  const stylePill: Record<string, string> = {
                    full: 'bg-emerald-50 text-emerald-700',
                    partial: 'bg-amber-50 text-amber-700',
                    unpaid: 'bg-rose-50 text-rose-700',
                    exempted: 'bg-violet-50 text-violet-700',
                    none: 'bg-slate-100 text-slate-500',
                  };
                  return (
                    <tr key={s.id} className="border-t border-slate-100 align-middle hover:bg-slate-50/50">
                      <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleStudent(s.id)} /></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-full bg-slate-100 text-sm font-black text-slate-500">
                            {s.photoUrl ? <img src={s.photoUrl} alt="" className="h-full w-full object-cover" /> : s.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-slate-900">{s.name}</div>
                            <div className="text-[10px] text-slate-400">{s.admissionNo}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-xs text-slate-600">
                        <div className="font-semibold">{s.className || 'Unassigned'}</div>
                        <SectionBadge section={s.section} />
                      </td>
                      <td className="text-right font-mono text-xs text-slate-700">{v.payable > 0 ? money(v.payable) : '—'}</td>
                      <td className="text-right font-mono text-xs font-bold text-emerald-700">{v.paidThisTerm > 0 ? money(v.paidThisTerm) : '—'}</td>
                      <td className="text-right font-mono text-xs font-bold text-rose-700">{bal > 0 ? money(bal) : '—'}</td>
                      <td><span className={'rounded-full px-2.5 py-1 text-[10px] font-black ' + (stylePill[st] || stylePill.none)}>{pillLabel(st)}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {st === 'exempted'
                            ? <span className="rounded-lg bg-violet-50 px-3 py-1.5 text-[11px] font-black text-violet-700" title={feeExemptions.get(s.id)?.reason || 'Exempted'}>Exempted</span>
                            : <button onClick={() => openPay(s)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-black text-white hover:bg-emerald-700">💰 Pay</button>}
                          <button onClick={() => setHistoryTarget(s)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50">History</button>
                          {nextTerm && !feeExemptions.has(s.id) &&
                            <button title={'Print ' + tLabel(nextTerm) + ' invoice'}
                              onClick={() => printInvoice(s, nextTerm, structures, bank, currency, schoolName, logoUrl, schoolAddress, summary.fees, terms)}
                              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-black text-amber-800 hover:bg-amber-100">Invoice</button>}
                          <button disabled={exemptionBusy === s.id} onClick={() => toggleFeeExemption(s)}
                            className={'rounded-lg border px-3 py-1.5 text-[11px] font-black disabled:opacity-40 ' +
                              (feeExemptions.has(s.id)
                                ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50')}>
                            {exemptionBusy === s.id ? '…' : feeExemptions.has(s.id) ? 'Unexempt' : 'Exempt'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!ledgerStudents.length && <tr><td colSpan={8} className="p-10 text-center text-sm text-slate-400">No students match this selection.</td></tr>}
              </tbody>
            </table>
          </div>

          {/* --- Bulk action bar (only when at least one is selected) - */}
          {selectedIds.size > 0 && <div className="flex flex-col gap-3 border-t border-slate-100 bg-emerald-50 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-xs font-bold text-emerald-800"><b>{selectedIds.size}</b> student{selectedIds.size === 1 ? '' : 's'} selected</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => generateBulkInvoices(selectedStudents, true)} disabled={generatingInvoices} className="rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-black text-white hover:bg-amber-600 disabled:opacity-40">▤ Print invoices (4 per sheet)</button>
              <button onClick={() => bulkPrintReceipts(selectedPaidStudents, summary.payments, bank, currency, schoolName, logoUrl, schoolAddress, terms)} disabled={!selectedPaidStudents.length} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-black text-white hover:bg-emerald-700 disabled:opacity-40">▤ Print receipts (4 per sheet)</button>
              <button onClick={clearSelection} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-500 hover:bg-slate-50">Clear</button>
            </div>
          </div>}
        </section>

        {/* --- Settings (collapsed by default) ------------------------ */}
        <details className="rounded-2xl border border-slate-200 bg-white">
          <summary className="flex cursor-pointer items-center justify-between p-5 text-sm font-black text-slate-700">
            <span>⚙️ Fee structures &amp; bank setup</span>
            <span className="text-xs font-bold text-slate-400 group-open:hidden">Click to open</span>
          </summary>

          {/* Fee structures */}
          <div className="border-t border-slate-100 p-5">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">Fee structures</div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_1fr_1fr_1fr_1fr_auto]">
              <select className="input" value={feeForm.academicYearId} onChange={e => setFeeForm(f => ({ ...f, academicYearId: e.target.value, termId: '' }))}>
                <option value="">Academic year</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
              </select>
              <select className="input" value={feeForm.termId} onChange={e => setFeeForm(f => ({ ...f, termId: e.target.value }))}>
                <option value="">All terms in year</option>{terms.filter(t => !feeForm.academicYearId || t.academic_year_id === feeForm.academicYearId).map(t => <option key={t.id} value={t.id}>{tLabel(t)}</option>)}
              </select>
              <input className="input" type="number" min="0" placeholder="Day fee" value={feeForm.dayAmount} onChange={e => setFeeForm(f => ({ ...f, dayAmount: e.target.value }))} />
              <input className="input" type="number" min="0" placeholder="Boarding fee" value={feeForm.boardingAmount} onChange={e => setFeeForm(f => ({ ...f, boardingAmount: e.target.value }))} />
              <input className="input" type="date" value={feeForm.dueDate} onChange={e => setFeeForm(f => ({ ...f, dueDate: e.target.value }))} />
              <button className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-40"
                disabled={busy || !feeForm.academicYearId || (!feeForm.dayAmount && !feeForm.boardingAmount)} onClick={saveFees}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr><th className="p-3">Year</th><th>Term</th><th className="text-right">Day</th><th className="text-right">Boarding</th><th>Due</th><th /></tr>
                </thead>
                <tbody>
                  {feeGroups.map((g, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="p-3 text-slate-700">{g.year?.name || '—'}</td>
                      <td className="text-slate-700">{g.termId ? tLabel(g.term) : 'All terms'}</td>
                      <td className="text-right font-mono text-emerald-700">{g.day ? money(Number(g.day.amount)) : '—'}</td>
                      <td className="text-right font-mono text-sky-700">{g.boarding ? money(Number(g.boarding.amount)) : '—'}</td>
                      <td className="text-slate-500">{g.dueDate || '—'}</td>
                      <td className="p-2">
                        <div className="flex gap-1.5">
                          <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700" onClick={() => startEditGroup(g)}>Edit</button>
                          <button className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700" onClick={() => deleteFeeGroup(g)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!feeGroups.length && <tr><td colSpan={6} className="p-6 text-center text-slate-400">No fee structures configured yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bank setup */}
          <div className="border-t border-slate-100 p-5">
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">Bank account</div>
            <p className="mt-1 text-xs text-slate-500">Shown on parent invoices and receipts.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <input className="input" placeholder="Bank name" value={bank.bank_name || ''} onChange={e => setBank({ ...bank, bank_name: e.target.value })} />
              <input className="input" placeholder="Account name" value={bank.account_name || ''} onChange={e => setBank({ ...bank, account_name: e.target.value })} />
              <input className="input font-mono" placeholder="Account number" value={bank.account_number || ''} onChange={e => setBank({ ...bank, account_number: e.target.value })} />
              <input className="input" placeholder="Payment reference instruction" value={bank.reference_instruction || ''} onChange={e => setBank({ ...bank, reference_instruction: e.target.value })} />
            </div>
            <button className="mt-4 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white hover:bg-emerald-700" disabled={busy} onClick={saveBank}>
              {busy ? 'Saving…' : 'Save bank details'}
            </button>
          </div>
        </details>
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
                              onClick={() => printReceipt(historyTarget, p, bank, currency, schoolName, logoUrl, schoolAddress, terms)}
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
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain" onClick={e => e.stopPropagation()}>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
      <span className="text-slate-600">{label}</span>
      <b className="font-black text-slate-900">{value}</b>
    </div>
  );
}
