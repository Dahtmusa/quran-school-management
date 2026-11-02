// Printable finance documents shared by Finance and the Alumni records page,
// so a receipt looks the same wherever it is printed from.
import { createClient } from '@/lib/supabase/client';
import { loadCMSSettings } from '@/lib/cms-live-store';

export const tLabel = (t: any) => t?.term_number === 1 ? 'First Term' : t?.term_number === 2 ? 'Second Term' : t?.term_number === 3 ? 'Third Term' : t?.name || 'Term';

export function schoolHeader(logoUrl: string, schoolName: string, schoolAddress: string, badgeLabel: string, accentColor: string) {
  return `<div class="top">
    ${logoUrl ? `<img src="${logoUrl}" style="height:64px;max-width:180px;object-fit:contain;margin-bottom:8px;" alt="logo">` : ''}
    <div class="school" style="color:${accentColor}">${schoolName || 'AMQM'}</div>
    ${schoolAddress ? `<div class="sub">${schoolAddress}</div>` : ''}
    <div class="badge" style="background:${accentColor}">${badgeLabel}</div>
  </div>`;
}

export function printReceipt(student: any, payment: any, bank: any, currency: string, schoolName: string, logoUrl = '', schoolAddress = '', terms: any[] = []) {
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

// Everything a receipt needs that comes from settings, loaded the same way the
// Finance page does.
export type ReceiptContext = { bank: any; currency: string; schoolName: string; logoUrl: string; schoolAddress: string; terms: any[] };

export async function loadReceiptContext(): Promise<ReceiptContext> {
  const client = createClient();
  const [cms, termsRes, siteRes] = await Promise.all([
    loadCMSSettings() as Promise<any>,
    client.from('terms').select('id,name,term_number,academic_year_id,starts_on,ends_on,academic_years:academic_year_id(name,is_current)').order('starts_on', { ascending: false }),
    client.from('site_settings').select('key,value'),
  ]);
  const meta: any = {};
  for (const r of siteRes.data || []) meta[(r as any).key] = (r as any).value;
  return {
    bank: cms?.school_payment || {},
    currency: '₦',
    schoolName: meta.school_name?.value || cms?.school_name?.value || 'AMQM',
    logoUrl: meta.logo_url?.value || '',
    schoolAddress: meta.contact?.address || '',
    terms: termsRes.data || [],
  };
}
