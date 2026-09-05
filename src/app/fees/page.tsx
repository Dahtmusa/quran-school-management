'use client';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import { loadStudents, loadInvoices, loadCurrentAcademicTerm } from '@/lib/live-store';
import { createFeeStructure, updateFeeStructure, loadFeeStructures, loadFinanceSummary, recordPayment, syncStudentFeeAllocations } from '@/lib/admin-management-store';
import { createClient } from '@/lib/supabase/client';
import { Student } from '@/lib/data';
import { useEffect, useMemo, useState } from 'react';
import { loadCMSSettings, saveCMSSetting } from '@/lib/cms-live-store';

const termLabel = (t: any) => t?.term_number === 1 ? 'First Term' : t?.term_number === 2 ? 'Second Term' : t?.term_number === 3 ? 'Third Term' : t?.name || 'Term';

function printPaymentReceipt(student: any, payment: any, bank: any, currency: string, schoolName: string) {
  const w = window.open('', '_blank', 'width=520,height=750');
  if (!w) return;
  const date = new Date(payment.paid_on || Date.now()).toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' });
  const refNo = (payment.id || '').slice(-8).toUpperCase();
  w.document.write(`<!DOCTYPE html><html><head><title>Receipt · ${student.name}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;padding:32px;font-size:13px;color:#1a1a1a}
    .top{text-align:center;padding-bottom:20px;border-bottom:3px solid #062d2a;margin-bottom:20px}
    .school{font-size:15px;font-weight:800;color:#062d2a;letter-spacing:.04em}
    .sub{font-size:11px;color:#555;margin-top:3px}
    .badge{display:inline-block;background:#062d2a;color:#fff;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.06em;margin-top:10px}
    .amount-box{background:#f0fdf4;border:2px solid #86efac;border-radius:12px;text-align:center;padding:16px;margin:20px 0}
    .amount-label{font-size:11px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
    .amount-value{font-size:28px;font-weight:900;color:#062d2a;margin-top:4px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    td{padding:7px 4px;border-bottom:1px solid #f0f0f0;vertical-align:top}
    td:first-child{color:#666;width:45%}
    td:last-child{font-weight:600}
    .section-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#888;margin:16px 0 6px}
    .footer{margin-top:20px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:14px}
    @media print{body{padding:16px}}
  </style>
  </head><body>
  <div class="top">
    <div class="school">${schoolName || 'AMQM'}</div>
    <div class="sub">Aliyu and Maimuna Center for Qur'anic Memorization</div>
    <div class="badge">PAYMENT RECEIPT</div>
  </div>
  <div class="amount-box">
    <div class="amount-label">Amount Paid</div>
    <div class="amount-value">${currency} ${Number(payment.amount || 0).toLocaleString()}</div>
  </div>
  <div class="section-title">Receipt details</div>
  <table>
    <tr><td>Receipt No.</td><td>REC-${refNo}</td></tr>
    <tr><td>Date</td><td>${date}</td></tr>
    <tr><td>Payment method</td><td>${payment.method || 'Cash'}</td></tr>
    ${payment.reference ? `<tr><td>Reference</td><td>${payment.reference}</td></tr>` : ''}
    ${payment.notes ? `<tr><td>Notes</td><td>${payment.notes}</td></tr>` : ''}
  </table>
  <div class="section-title">Student</div>
  <table>
    <tr><td>Name</td><td>${student.name || student.full_name || '—'}</td></tr>
    <tr><td>Admission No.</td><td>${student.admissionNo || student.admission_no || '—'}</td></tr>
    <tr><td>Class</td><td>${student.className || '—'}</td></tr>
    <tr><td>Section</td><td>${student.section || '—'}</td></tr>
  </table>
  ${bank?.bank_name ? `<div class="section-title">School bank</div>
  <table>
    <tr><td>Bank</td><td>${bank.bank_name}</td></tr>
    <tr><td>Account name</td><td>${bank.account_name || '—'}</td></tr>
    <tr><td>Account number</td><td>${bank.account_number || '—'}</td></tr>
  </table>` : ''}
  <div class="footer">
    <div>This is an official AMQM payment receipt.</div>
    <div style="margin-top:4px">Printed on ${new Date().toLocaleDateString('en-NG')}</div>
  </div>
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  w.document.close();
}

export default function Fees() {
  const [currency, setCurrency] = useState('₦');
  const [schoolSettings, setSchoolSettings] = useState<any>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ fees: [], payments: [] });
  const [years, setYears] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [bank, setBank] = useState({ bank_name: '', account_name: '', account_number: '', reference_instruction: '' });

  // payment modal
  const [payModal, setPayModal] = useState<Student | null>(null);
  const [payForm, setPayForm] = useState({ amount: '', method: 'Cash', reference: '', notes: '' });
  const [paying, setPaying] = useState(false);

  // collapsible config sections
  const [showFeeConfig, setShowFeeConfig] = useState(false);
  const [showBankConfig, setShowBankConfig] = useState(false);
  const [showInvoices, setShowInvoices] = useState(false);

  const [fee, setFee] = useState({ id: '', academicYearId: '', termId: '', section: 'day' as 'day' | 'boarding', name: 'Term Fee', amount: '', dueDate: '' });

  async function loadYears() { const { data } = await createClient().from('academic_years').select('id,name,is_current').order('starts_on', { ascending: false }); return data || []; }
  async function loadTerms() { const { data } = await createClient().from('terms').select('id,name,term_number,academic_year_id,academic_years:academic_year_id(name,is_current)').order('starts_on', { ascending: false }).order('term_number'); return data || []; }
  async function loadCurrency() { const { data } = await createClient().from('site_settings').select('value').eq('key', 'currency').maybeSingle(); return data?.value?.symbol || data?.value?.code || '₦'; }

  async function refresh() {
    const [s, inv, fs, sm, y, t, c, st, cur] = await Promise.all([loadStudents(), loadInvoices(), loadFeeStructures(), loadFinanceSummary(), loadYears(), loadTerms(), loadCurrency(), loadCMSSettings(), loadCurrentAcademicTerm()]);
    setStudents(s); setInvoices(inv); setStructures(fs); setSummary(sm); setYears(y); setTerms(t); setCurrency(c); setSchoolSettings(st); setBank(st.school_payment || {});
    if (!selectedTermId && cur?.term_id) setSelectedTermId(cur.term_id);
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const client = createClient();
    const channel = client.channel('amqm-finance-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_fees' }, () => refresh())
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, []);
  useEffect(() => { if (selectedTermId) { syncStudentFeeAllocations(selectedTermId).then(() => refresh()).catch(() => {}); } }, [selectedTermId]);

  const term = terms.find(t => t.id === selectedTermId);
  const termFees = useMemo(() => summary.fees.filter((x: any) => x.fee_structures?.term_id === selectedTermId || (x.fee_structures?.term_id == null && x.fee_structures?.academic_year_id === term?.academic_year_id)), [summary, selectedTermId, term]);
  const byStudent = useMemo(() => {
    const map = new Map<string, { due: number; paid: number }>();
    for (const x of termFees) { const v = map.get(x.student_id) || { due: 0, paid: 0 }; v.due += Number(x.amount_due || 0); v.paid += Number(x.amount_paid || 0); map.set(x.student_id, v); }
    return map;
  }, [termFees]);

  const classNames = useMemo(() => [...new Set(students.map(s => s.className || 'Unassigned'))].sort(), [students]);
  const filtered = useMemo(() => classFilter ? students.filter(s => (s.className || 'Unassigned') === classFilter) : students, [students, classFilter]);

  const expected = useMemo(() => { let t = 0; for (const s of filtered) { t += byStudent.get(s.id)?.due || 0; } return t; }, [filtered, byStudent]);
  const collected = useMemo(() => { let t = 0; for (const s of filtered) { t += byStudent.get(s.id)?.paid || 0; } return t; }, [filtered, byStudent]);
  const outstanding = Math.max(0, expected - collected);
  const statuses = useMemo(() => {
    let full = 0, partial = 0, unpaid = 0;
    for (const s of filtered) { const v = byStudent.get(s.id); if (!v || v.due <= 0) continue; if (v.paid >= v.due) full++; else if (v.paid > 0) partial++; else unpaid++; }
    return { full, partial, unpaid };
  }, [filtered, byStudent]);

  function openPayModal(student: Student) {
    const v = byStudent.get(student.id) || { due: 0, paid: 0 };
    const balance = Math.max(0, v.due - v.paid);
    setPayForm({ amount: balance > 0 ? String(balance) : '', method: 'Cash', reference: '', notes: '' });
    setPayModal(student);
  }

  async function submitPayment() {
    if (!payModal || !payForm.amount) return;
    setPaying(true);
    try {
      const payment = await recordPayment({ studentId: payModal.id, amount: Number(payForm.amount), method: payForm.method, reference: payForm.reference, notes: payForm.notes });
      await refresh();
      setPayModal(null);
      printPaymentReceipt(payModal, payment, bank, currency, schoolSettings?.school_name?.value || 'AMQM');
    } catch (e: any) {
      setMessage(e?.message || 'Payment could not be recorded');
    } finally {
      setPaying(false);
    }
  }

  function printLastReceipt(student: Student) {
    const payment = summary.payments.find((p: any) => p.student_id === student.id);
    if (!payment) return;
    printPaymentReceipt(student, payment, bank, currency, schoolSettings?.school_name?.value || 'AMQM');
  }

  async function saveBank() { setBusy(true); try { await saveCMSSetting('school_payment', bank); setMessage('Bank account saved.'); } catch (e: any) { setMessage(e?.message || 'Failed'); } finally { setBusy(false); } }

  function startEdit(f: any) { setFee({ id: f.id, academicYearId: f.academic_year_id, termId: f.term_id || '', section: f.section, name: f.name, amount: String(f.amount), dueDate: f.due_date || '' }); setShowFeeConfig(true); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }
  async function saveFee() {
    setBusy(true); setMessage('');
    try {
      if (fee.id) { await updateFeeStructure(fee.id, { academicYearId: fee.academicYearId, termId: fee.termId || null, section: fee.section, name: fee.name, amount: Number(fee.amount), dueDate: fee.dueDate || null }); }
      else { await createFeeStructure({ academicYearId: fee.academicYearId, termId: fee.termId || null, section: fee.section, name: fee.name, amount: Number(fee.amount), dueDate: fee.dueDate || null }); }
      setFee({ id: '', academicYearId: fee.academicYearId, termId: fee.termId, section: fee.section, name: 'Term Fee', amount: '', dueDate: '' });
      setMessage(fee.id ? 'Fee structure updated.' : 'Fee structure saved.');
      await refresh();
    } catch (e: any) { setMessage(e?.message || 'Failed'); }
    finally { setBusy(false); }
  }

  return (
    <AdminShell title="Finance & Fees">
      <div className="space-y-5">
        {message && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div>}

        {/* Controls */}
        <section className="card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-1">
              <label className="flex-1 text-xs font-black uppercase tracking-wide text-slate-500">
                Term
                <select className="input mt-1" value={selectedTermId} onChange={e => setSelectedTermId(e.target.value)}>
                  <option value="">Select term</option>
                  {terms.map(t => <option key={t.id} value={t.id}>{t.academic_years?.name || 'Academic year'} · {termLabel(t)}</option>)}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                Class
                <select className="input mt-1 min-w-[180px]" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
                  <option value="">All classes</option>
                  {classNames.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            {term && <div className="text-sm font-semibold text-emerald-800">{term.academic_years?.name} · {termLabel(term)}</div>}
          </div>
        </section>

        {/* KPIs */}
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Expected" value={`${currency} ${expected.toLocaleString()}`} />
          <Kpi label="Collected" value={`${currency} ${collected.toLocaleString()}`} tone="green" />
          <Kpi label="Outstanding" value={`${currency} ${outstanding.toLocaleString()}`} tone="rose" />
          <Kpi label="Paid in full" value={statuses.full} tone="green" />
          <Kpi label="Partial" value={statuses.partial} tone="amber" />
          <Kpi label="Unpaid" value={statuses.unpaid} tone="rose" />
        </div>

        {/* Student payment table */}
        <section className="card overflow-hidden">
          <div className="border-b p-5">
            <h2 className="text-xl font-black">
              Student payments
              {classFilter && <span className="ml-2 text-base font-normal text-slate-400">· {classFilter}</span>}
            </h2>
            <p className="text-sm text-slate-500">{filtered.length} student{filtered.length !== 1 ? 's' : ''}{term ? ` · ${termLabel(term)}` : ''}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-4">Student</th>
                  <th>Class</th>
                  <th className="text-right pr-4">Due</th>
                  <th className="text-right pr-4">Paid</th>
                  <th className="text-right pr-4">Balance</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const v = byStudent.get(s.id) || { due: 0, paid: 0 };
                  const bal = Math.max(0, v.due - v.paid);
                  const state = v.due <= 0 ? 'No fee' : v.paid >= v.due ? 'Paid in full' : v.paid > 0 ? 'Partial' : 'Unpaid';
                  const cls = state === 'Paid in full' ? 'bg-emerald-50 text-emerald-700' : state === 'Partial' ? 'bg-amber-50 text-amber-800' : state === 'Unpaid' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500';
                  const hasPayment = summary.payments.some((p: any) => p.student_id === s.id);
                  return (
                    <tr key={s.id} className="border-t hover:bg-slate-50/50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 overflow-hidden rounded-xl bg-slate-100 shrink-0">
                            {s.photoUrl ? <img src={s.photoUrl} className="h-full w-full object-cover" alt="" /> : <div className="grid h-full place-items-center text-xs font-black text-slate-400">{s.name.charAt(0)}</div>}
                          </div>
                          <div>
                            <div className="font-semibold">{s.name}</div>
                            <div className="text-xs text-slate-400">{s.admissionNo}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="text-sm">{s.className || 'Unassigned'}</div>
                        <SectionBadge section={s.section} />
                      </td>
                      <td className="text-right pr-4 font-mono tabular-nums">{v.due > 0 ? `${currency} ${v.due.toLocaleString()}` : '—'}</td>
                      <td className="text-right pr-4 font-mono tabular-nums text-emerald-700">{v.paid > 0 ? `${currency} ${v.paid.toLocaleString()}` : '—'}</td>
                      <td className="text-right pr-4 font-mono tabular-nums text-rose-600">{bal > 0 ? `${currency} ${bal.toLocaleString()}` : '—'}</td>
                      <td><span className={`pill ${cls}`}>{state}</span></td>
                      <td className="pr-3">
                        <div className="flex justify-end gap-2">
                          {state !== 'Paid in full' && state !== 'No fee' && (
                            <button onClick={() => openPayModal(s)} className="btn btn-primary text-xs py-1.5 px-3">Record payment</button>
                          )}
                          {state === 'Paid in full' && (
                            <button onClick={() => openPayModal(s)} className="btn bg-slate-100 text-xs py-1.5 px-3">+ Add payment</button>
                          )}
                          {hasPayment && (
                            <button onClick={() => printLastReceipt(s)} className="btn bg-emerald-50 text-emerald-800 text-xs py-1.5 px-3">Print receipt</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-10 text-center text-slate-400">No students{classFilter ? ` in ${classFilter}` : ''} for this term.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Collapsible: Fee structures */}
        <section className="card overflow-hidden">
          <button className="flex w-full items-center justify-between p-5 text-left" onClick={() => setShowFeeConfig(x => !x)}>
            <div><div className="font-black">Fee structures</div><div className="text-xs text-slate-500">Day and Boarding fees per term</div></div>
            <span className="text-slate-400">{showFeeConfig ? '▲' : '▼'}</span>
          </button>
          {showFeeConfig && <div className="border-t p-5 space-y-5">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <select className="input" value={fee.academicYearId} onChange={e => setFee({ ...fee, academicYearId: e.target.value })}>
                <option value="">Academic year</option>
                {years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' · Current' : ''}</option>)}
              </select>
              <select className="input" value={fee.termId} onChange={e => setFee({ ...fee, termId: e.target.value })}>
                <option value="">All terms in this year</option>
                {terms.filter(t => !fee.academicYearId || t.academic_year_id === fee.academicYearId).map(t => <option key={t.id} value={t.id}>{termLabel(t)}</option>)}
              </select>
              <select className="input" value={fee.section} onChange={e => setFee({ ...fee, section: e.target.value as any })}>
                <option value="day">Day</option>
                <option value="boarding">Boarding</option>
              </select>
              <input className="input" placeholder="Fee name" value={fee.name} onChange={e => setFee({ ...fee, name: e.target.value })} />
              <input className="input" type="number" min="0" placeholder="Amount" value={fee.amount} onChange={e => setFee({ ...fee, amount: e.target.value })} />
              <input className="input" type="date" value={fee.dueDate} onChange={e => setFee({ ...fee, dueDate: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={busy || !fee.academicYearId || !fee.name || !fee.amount} onClick={saveFee}>{fee.id ? 'Update fee' : 'Save fee structure'}</button>
              {fee.id && <button className="btn bg-slate-100" onClick={() => setFee({ id: '', academicYearId: '', termId: '', section: 'day', name: 'Term Fee', amount: '', dueDate: '' })}>Cancel edit</button>}
            </div>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase"><tr><th className="p-3">Year</th><th>Term</th><th>Section</th><th>Name</th><th>Amount</th><th>Due</th><th /></tr></thead>
                <tbody>{structures.map((f: any) => (
                  <tr className="border-t" key={f.id}>
                    <td className="p-3">{f.academic_years?.name || '—'}</td>
                    <td>{f.terms?.term_number ? termLabel(f.terms) : 'All terms'}</td>
                    <td><SectionBadge section={f.section === 'boarding' ? 'Boarding' : 'Day'} /></td>
                    <td>{f.name}</td>
                    <td className="font-mono">{currency} {Number(f.amount).toLocaleString()}</td>
                    <td>{f.due_date || '—'}</td>
                    <td><button className="btn bg-slate-100 text-xs" onClick={() => startEdit(f)}>Edit</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>}
        </section>

        {/* Collapsible: Bank config */}
        <section className="card overflow-hidden">
          <button className="flex w-full items-center justify-between p-5 text-left" onClick={() => setShowBankConfig(x => !x)}>
            <div><div className="font-black">Bank & payment account</div><div className="text-xs text-slate-500">Used on receipts and invoices</div></div>
            <span className="text-slate-400">{showBankConfig ? '▲' : '▼'}</span>
          </button>
          {showBankConfig && <div className="border-t p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <input className="input" placeholder="Bank name" value={bank.bank_name || ''} onChange={e => setBank({ ...bank, bank_name: e.target.value })} />
              <input className="input" placeholder="Account name" value={bank.account_name || ''} onChange={e => setBank({ ...bank, account_name: e.target.value })} />
              <input className="input" placeholder="Account number" value={bank.account_number || ''} onChange={e => setBank({ ...bank, account_number: e.target.value })} />
              <input className="input" placeholder="Transfer reference instruction" value={bank.reference_instruction || ''} onChange={e => setBank({ ...bank, reference_instruction: e.target.value })} />
            </div>
            <button className="btn btn-primary mt-4" disabled={busy} onClick={saveBank}>Save bank configuration</button>
          </div>}
        </section>

        {/* Collapsible: Invoices */}
        <section className="card overflow-hidden">
          <button className="flex w-full items-center justify-between p-5 text-left" onClick={() => setShowInvoices(x => !x)}>
            <div><div className="font-black">Next-term invoices</div><div className="text-xs text-slate-500">Generated automatically when admin completes a term</div></div>
            <span className="text-slate-400">{showInvoices ? '▲' : '▼'}</span>
          </button>
          {showInvoices && <div className="border-t divide-y">
            {invoices.map((inv: any) => (
              <div key={inv.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-black">{inv.invoice_no}</div>
                  <div className="text-xs text-slate-500">{inv.students?.full_name || 'Student'} · {inv.terms?.name || 'Next term'} · Due {inv.due_date || '—'}</div>
                </div>
                <div className="text-right">
                  <div className="font-black">{currency} {Number(inv.amount_due || 0).toLocaleString()}</div>
                  <div className="text-xs text-slate-500">{inv.status}</div>
                </div>
              </div>
            ))}
            {!invoices.length && <div className="p-8 text-center text-sm text-slate-500">No invoices yet. They are generated when you complete a term.</div>}
          </div>}
        </section>
      </div>

      {/* Payment modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-5" onClick={() => !paying && setPayModal(null)}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 sm:rounded-3xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-5">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">Record payment</div>
              <div className="mt-1 text-xl font-black">{payModal.name}</div>
              <div className="text-sm text-slate-500">{payModal.admissionNo} · {payModal.className || 'Unassigned'} · {payModal.section}</div>
              {(() => { const v = byStudent.get(payModal.id) || { due: 0, paid: 0 }; const bal = Math.max(0, v.due - v.paid); return bal > 0 ? <div className="mt-2 text-sm font-semibold text-rose-600">Balance: {currency} {bal.toLocaleString()}</div> : null; })()}
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-bold">Amount ({currency})
                <input className="input mt-1 w-full" type="number" min="0" placeholder="0" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} autoFocus />
              </label>
              <label className="block text-xs font-bold">Payment method
                <select className="input mt-1 w-full" value={payForm.method} onChange={e => setPayForm({ ...payForm, method: e.target.value })}>
                  <option>Cash</option>
                  <option>Bank transfer</option>
                  <option>Mobile money</option>
                  <option>Card</option>
                  <option>Other</option>
                </select>
              </label>
              <label className="block text-xs font-bold">Reference (optional)
                <input className="input mt-1 w-full" placeholder="e.g. transaction ID" value={payForm.reference} onChange={e => setPayForm({ ...payForm, reference: e.target.value })} />
              </label>
              <label className="block text-xs font-bold">Notes (optional)
                <input className="input mt-1 w-full" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} />
              </label>
            </div>
            <div className="mt-5 flex gap-2">
              <button className="btn bg-slate-100 flex-1" onClick={() => setPayModal(null)} disabled={paying}>Cancel</button>
              <button className="btn btn-primary flex-1" disabled={paying || !payForm.amount} onClick={submitPayment}>
                {paying ? 'Recording…' : 'Record & print receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: 'green' | 'rose' | 'amber' }) {
  const cls = tone === 'green' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-700' : 'text-slate-950';
  return (
    <div className="card p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-black ${cls}`}>{value}</div>
    </div>
  );
}
