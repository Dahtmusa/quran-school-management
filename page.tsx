'use client';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import MemorizationBadge from '@/components/MemorizationBadge';
import QuranProgress from '@/components/QuranProgress';
import { loadStudents, loadEvaluations, getCurrentProfile, loadCurrentAcademicTerm } from '@/lib/live-store';
import { loadParentFeeSummary } from '@/lib/admin-management-store';
import { loadChildAttendance, AttendanceRecord } from '@/lib/attendance-store';
import { createClient } from '@/lib/supabase/client';
import { Student } from '@/lib/data';
import { useEffect, useMemo, useState } from 'react';

export default function ParentPortal() {
  const [students, setStudents] = useState<Student[]>([]);
  const [evals, setEvals] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [expandedEval, setExpandedEval] = useState<string | null>(null);
  const [feeSummary, setFeeSummary] = useState<any>(null);
  const [currentTermId, setCurrentTermId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadStudents(), loadEvaluations(), getCurrentProfile(), loadCurrentAcademicTerm()]).then(([s, e, profile, term]) => {
      setStudents(s); setEvals(e); setMe(profile);
      if (term?.term_id) setCurrentTermId(term.term_id);
      if (s.length > 0) setSelectedChild(s[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedChild) return;
    loadChildAttendance(selectedChild, 30).then(setAttendanceRecords);
    loadParentFeeSummary(selectedChild).then(setFeeSummary).catch(() => {});
  }, [selectedChild]);

  // Real-time: refresh fee summary when payments or student_fees change
  useEffect(() => {
    if (!selectedChild) return;
    const ch = createClient().channel('parent-fees-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        loadParentFeeSummary(selectedChild).then(setFeeSummary).catch(() => {});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_fees' }, () => {
        loadParentFeeSummary(selectedChild).then(setFeeSummary).catch(() => {});
      })
      .subscribe();
    return () => { createClient().removeChannel(ch); };
  }, [selectedChild]);

  const child = useMemo(() => students.find(s => s.id === selectedChild) || students[0], [students, selectedChild]);
  const childEvals = useMemo(() => evals.filter(e => e.studentId === child?.id), [evals, child]);
  const approvedEvals = useMemo(() => childEvals.filter(e => e.status === 'Approved'), [childEvals]);
  const evalsByNumber = useMemo(() => {
    const map: Record<number, any> = {};
    for (const e of childEvals) {
      const n = Number(e.number) || 1;
      if (!map[n] || e.status === 'Approved') map[n] = e;
    }
    return map;
  }, [childEvals]);

  function printReceipt(payment: any, student: Student | undefined) {
    if (!student) return;
    const bank = feeSummary?.bank || {};
    const currency = feeSummary?.currency || '₦';
    const schoolName = feeSummary?.school_name || 'AMQM';
    const schoolAddress = feeSummary?.school_address || '';
    const w = window.open('', '_blank', 'width=520,height=700');
    if (!w) return;
    const date = new Date(payment.paid_on || Date.now()).toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' });
    const refNo = (payment.id || '').slice(-8).toUpperCase();
    w.document.write(`<!DOCTYPE html><html><head><title>Receipt</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;padding:32px;font-size:13px;color:#1a1a1a}.top{text-align:center;padding-bottom:20px;border-bottom:3px solid #062d2a;margin-bottom:20px}.school{font-size:15px;font-weight:800;color:#062d2a}.sub{font-size:11px;color:#555;margin-top:3px}.badge{display:inline-block;background:#062d2a;color:#fff;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.06em;margin-top:10px}.amount-box{background:#f0fdf4;border:2px solid #86efac;border-radius:12px;text-align:center;padding:16px;margin:20px 0}.amount-label{font-size:11px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.amount-value{font-size:28px;font-weight:900;color:#062d2a;margin-top:4px}table{width:100%;border-collapse:collapse;margin-bottom:16px}td{padding:7px 4px;border-bottom:1px solid #f0f0f0;vertical-align:top}td:first-child{color:#666;width:45%}td:last-child{font-weight:600}.section-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#888;margin:16px 0 6px}.footer{margin-top:20px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:14px}</style>
    </head><body>
    <div class="top"><div class="school">${schoolName}</div>${schoolAddress ? `<div class="sub">${schoolAddress}</div>` : ''}<div class="badge">PAYMENT RECEIPT</div></div>
    <div class="amount-box"><div class="amount-label">Amount Paid</div><div class="amount-value">${currency} ${Number(payment.amount || 0).toLocaleString()}</div></div>
    <div class="section-title">Receipt details</div>
    <table><tr><td>Receipt No.</td><td>REC-${refNo}</td></tr><tr><td>Date</td><td>${date}</td></tr><tr><td>Method</td><td>${payment.method || 'Cash'}</td></tr>${payment.reference ? `<tr><td>Reference</td><td>${payment.reference}</td></tr>` : ''}</table>
    <div class="section-title">Student</div>
    <table><tr><td>Name</td><td>${student.name}</td></tr><tr><td>Admission No.</td><td>${student.admissionNo || '—'}</td></tr><tr><td>Class</td><td>${student.className || '—'}</td></tr></table>
    ${bank.bank_name ? `<div class="section-title">School bank account</div><table><tr><td>Bank</td><td>${bank.bank_name}</td></tr><tr><td>Account name</td><td>${bank.account_name || '—'}</td></tr><tr><td>Account No.</td><td>${bank.account_number || '—'}</td></tr></table>` : ''}
    <div class="footer"><div>Official ${schoolName} payment receipt</div><div style="margin-top:4px">Printed on ${new Date().toLocaleDateString('en-NG')}</div></div>
    <script>window.onload=()=>window.print();<\/script></body></html>`);
    w.document.close();
  }

  if (!child) return <AdminShell title="Parent Portal"><div className="card p-12 text-center text-slate-400">Loading your child's profile…</div></AdminShell>;

  const firstName = me?.full_name?.split(' ')[0] || 'Parent';

  const avg = approvedEvals.length ? approvedEvals.reduce((s, e) => s + e.score, 0) / approvedEvals.length : null;
  const finalStatus = avg == null ? null : avg >= 90 ? 'Excellent' : avg >= 75 ? 'Very Good' : avg >= 60 ? 'Satisfactory' : 'Needs Improvement';
  const statusColor = !avg ? '' : avg >= 90 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : avg >= 75 ? 'bg-blue-50 border-blue-200 text-blue-800' : avg >= 60 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-rose-50 border-rose-200 text-rose-800';

  return <AdminShell title="Parent Portal"><div className="space-y-5">

    {/* Welcome hero */}
    <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-slate-900 p-5 text-white shadow-xl md:p-7">
      <div className="text-[11px] font-bold uppercase tracking-[.24em] text-amber-300">Parent Portal</div>
      <h2 className="mt-1 text-2xl font-black md:text-3xl">As-salāmu ʿalaykum, {firstName}.</h2>
      <p className="mt-1 text-sm text-emerald-100/70">Track your {students.length === 1 ? "child's" : "children's"} academic progress and Qur'an evaluations.</p>
    </section>

    {/* Child selector */}
    {students.length > 1 && <div className="flex flex-wrap gap-2">
      {students.map(s => <button key={s.id} onClick={() => setSelectedChild(s.id)} className={`rounded-2xl px-4 py-2.5 font-bold text-sm transition-colors ${selectedChild === s.id ? 'bg-[#062d2a] text-white shadow' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{s.name}</button>)}
    </div>}

    {/* Profile card */}
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b bg-slate-50 p-5 sm:flex-row sm:items-start">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-white shadow bg-slate-200">
          {child.photoUrl ? <img src={child.photoUrl} className="h-full w-full object-cover" alt={child.name} /> : <div className="grid h-full place-items-center text-2xl font-black text-slate-400">{child.name.charAt(0)}</div>}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-black">{child.name}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5"><SectionBadge section={child.section} /><MemorizationBadge direction={child.direction} /></div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
            <span><b className="text-slate-700">Admission:</b> {child.admissionNo?.toUpperCase()}</span>
            <span><b className="text-slate-700">Class:</b> {child.className || 'Unassigned'}</span>
            <span><b className="text-slate-700">Year:</b> {child.year}</span>
          </div>
        </div>
        <span className="pill bg-emerald-50 text-emerald-700 self-start shrink-0">Active</span>
      </div>
      <div className="p-5">
        <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">Qur'an Journey</div>
        <QuranProgress student={child} />
      </div>
    </div>

    {/* Evaluations this term */}
    <section className="card overflow-hidden">
      <div className="border-b p-5">
        <h2 className="text-lg font-black">This Term's Evaluations</h2>
        <p className="mt-0.5 text-xs text-slate-500">Evaluations are conducted by teachers and approved by school administration before they appear here.</p>
      </div>
      <div className="divide-y">
        {[1, 2, 3].map(num => {
          const ev = evalsByNumber[num];
          const status = ev?.status || 'Not started';
          const statusPill = status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : status === 'Pending Approval' ? 'bg-amber-50 text-amber-700' : status === 'Returned' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-400';
          const isOpen = expandedEval === `eval-${num}`;

          return <div key={num}>
            <button onClick={() => ev?.status === 'Approved' ? setExpandedEval(isOpen ? null : `eval-${num}`) : undefined} className={`flex w-full items-center gap-4 p-5 text-left transition-colors ${ev?.status === 'Approved' ? 'hover:bg-slate-50' : ''}`}>
              <div className={`h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center text-sm font-black ${status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : status === 'Pending Approval' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>{num}</div>
              <div className="flex-1">
                <div className="font-bold">Evaluation {num}</div>
                {ev && <div className="mt-0.5 text-xs text-slate-400">{ev.term}</div>}
              </div>
              <span className={`pill ${statusPill}`}>{status}</span>
              {ev?.status === 'Approved' && <span className="text-xs text-slate-400">{isOpen ? '▲' : '▼'}</span>}
            </button>

            {isOpen && ev?.status === 'Approved' && <div className="border-t bg-slate-50 p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatBox label="Score" value={`${ev.score}%`} color="emerald" />
                <StatBox label="Grade" value={ev.grade || '—'} color="blue" />
                <StatBox label="Ayahs" value={String(ev.memorizedAyahs || '—')} color="slate" />
                <StatBox label="Pages" value={String(ev.memorizedPages || '—')} color="slate" />
              </div>
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                {([['Mem', ev.memorization], ['Acc', ev.accuracy], ['Flu', ev.fluency], ['Taj', ev.tajweed], ['Ret', ev.retention]] as [string, number][]).map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-white border p-2">
                    <div className="text-slate-400 font-bold">{l}</div>
                    <div className="mt-1 text-lg font-black">{v}/5</div>
                  </div>
                ))}
              </div>
              {ev.comment && <div className="rounded-xl bg-white border p-4"><div className="mb-1 text-xs font-black uppercase text-slate-400">Teacher comment</div><p className="text-sm text-slate-600 leading-6">{ev.comment}</p></div>}
            </div>}
          </div>;
        })}
      </div>
    </section>

    {/* Final standing */}
    {finalStatus && avg != null && <div className={`rounded-2xl border p-5 ${statusColor}`}>
      <div className="mb-1 text-xs font-black uppercase tracking-wider">Current standing — {approvedEvals.length} of 3 evaluations</div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-3xl font-black">{finalStatus}</div>
        <div className="text-sm opacity-70">Average: {avg.toFixed(1)}%</div>
      </div>
    </div>}

    {/* View report card link */}
    <div className="card flex items-center justify-between gap-4 p-5">
      <div>
        <div className="font-bold">Report Card</div>
        <div className="text-xs text-slate-500 mt-0.5">Full term report with Qur'an progress, scores, and school remarks.</div>
      </div>
      <a href="/reports" className="btn btn-primary shrink-0 text-sm">View report →</a>
    </div>

    {/* Fees & Payments */}
    {feeSummary && (() => {
      const currency = feeSummary.currency || '₦';
      const bank = feeSummary.bank || {};
      const schoolName = feeSummary.school_name || 'AMQM';
      const schoolAddress = feeSummary.school_address || '';

      const termFees: any[] = (feeSummary.fees || []).filter((f: any) =>
        f.term_id === (feeSummary.current_term_id || currentTermId) || (!f.term_id && f.year_is_current)
      );
      const currentDue = Number(feeSummary.current_term_fee ?? termFees.reduce((s: number, f: any) => s + Number(f.amount_due || 0), 0));
      const currentPaid = Number(feeSummary.current_term_paid ?? termFees.reduce((s: number, f: any) => s + Number(f.amount_paid || 0), 0));
      const currentBalance = Math.max(0, currentDue - currentPaid);
      const prevBalance = Number(feeSummary.previous_balance ?? 0);
      const totalPayable = Number(feeSummary.total_payable ?? (currentDue + prevBalance));
      const totalOutstanding = Number(feeSummary.total_outstanding ?? (currentBalance + prevBalance));

      const currentTermNum = termFees[0]?.term_number || null;
      const feeStructures: any[] = feeSummary.fee_structures || [];
      const nextTermFee = currentTermNum
        ? feeStructures.find((fs: any) => fs.year_is_current && fs.term_number === currentTermNum + 1)
          || feeStructures.find((fs: any) => !fs.year_is_current && fs.term_number === 1)
        : null;

      const childPayments: any[] = feeSummary.payments || [];

      const tLabel = (num: number) => num === 1 ? 'First Term' : num === 2 ? 'Second Term' : num === 3 ? 'Third Term' : `Term ${num}`;

      return (
        <>
          {/* Current term fee overview */}
          <section className="card overflow-hidden">
            <div className="border-b p-5">
              <h2 className="text-lg font-black">School Fees</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {termFees.length > 0
                  ? `${tLabel(currentTermNum)} · ${termFees[0]?.year_name || ''}`
                  : 'Current term fees'}
              </p>
            </div>
            {currentDue > 0 ? (
              <div className="grid grid-cols-2 divide-x border-b sm:grid-cols-5">
                <div className="p-4 text-center"><div className="text-[10px] font-bold uppercase text-slate-400">Current term</div><div className="mt-1 text-xl font-black">{currency} {currentDue.toLocaleString()}</div></div>
                <div className="p-4 text-center"><div className="text-[10px] font-bold uppercase text-slate-400">Paid this term</div><div className="mt-1 text-xl font-black text-emerald-700">{currency} {currentPaid.toLocaleString()}</div></div>
                <div className="p-4 text-center"><div className="text-[10px] font-bold uppercase text-slate-400">Previous balance</div><div className="mt-1 text-xl font-black text-rose-600">{prevBalance > 0 ? `${currency} ${prevBalance.toLocaleString()}` : 'None'}</div></div>
                <div className="p-4 text-center"><div className="text-[10px] font-bold uppercase text-slate-400">Total payable</div><div className="mt-1 text-xl font-black">{currency} {totalPayable.toLocaleString()}</div></div>
                <div className="p-4 text-center col-span-2 sm:col-span-1"><div className="text-[10px] font-bold uppercase text-slate-400">Total outstanding</div><div className={`mt-1 text-xl font-black ${totalOutstanding > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{totalOutstanding > 0 ? `${currency} ${totalOutstanding.toLocaleString()}` : 'Cleared'}</div></div>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-slate-400">No fee allocation for the current term yet.</div>
            )}

            {/* Outstanding from previous terms */}
            {prevBalance > 0 && (
              <div className="border-b bg-rose-50 px-5 py-3 flex items-center justify-between gap-3">
                <div><div className="text-sm font-semibold text-rose-800">Previous balance carried forward</div><div className="text-xs text-rose-600 mt-0.5">Earlier-term fees remain separate and are settled first when a payment is recorded.</div></div>
                <div className="font-black text-rose-700">{currency} {prevBalance.toLocaleString()}</div>
              </div>
            )}

            {/* Bank details for payment */}
            {bank.bank_name && (
              <div className="border-b bg-slate-50 p-5">
                <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Pay to this account</div>
                <div className="space-y-1 text-sm">
                  <div className="flex gap-3"><span className="w-28 text-slate-400">Bank</span><span className="font-semibold">{bank.bank_name}</span></div>
                  {bank.account_name && <div className="flex gap-3"><span className="w-28 text-slate-400">Account name</span><span className="font-semibold">{bank.account_name}</span></div>}
                  {bank.account_number && <div className="flex gap-3"><span className="w-28 text-slate-400">Account No.</span><span className="font-black font-mono text-[#062d2a]">{bank.account_number}</span></div>}
                  {bank.reference_instruction && <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{bank.reference_instruction}</div>}
                </div>
              </div>
            )}

            {/* Next term fees — previous outstanding is shown separately and remains payable */}
            {nextTermFee && (
              <div className="border-b bg-amber-50 px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">Next Term Fee</div>
                    <div className="text-sm font-semibold text-amber-900">{tLabel(nextTermFee.term_number)} {nextTermFee.year_name}</div>
                    {nextTermFee.due_date && <div className="text-xs text-amber-700 mt-0.5">Due: {new Date(nextTermFee.due_date).toLocaleDateString('en-NG', { day: '2-digit', month: 'long', year: 'numeric' })}</div>}
                  </div>
                  <div className="text-xl font-black text-amber-800">{currency} {Number(nextTermFee.amount).toLocaleString()}</div>
                </div>
                {prevBalance > 0 && (
                  <div className="mt-3 rounded-xl border border-rose-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
                    <div><div className="text-[10px] font-black uppercase tracking-wider text-rose-600">Previous balance carried forward</div><div className="text-xs text-slate-500 mt-0.5">This outstanding amount is added to the next term payable.</div></div>
                    <div className="text-lg font-black text-rose-700">{currency} {prevBalance.toLocaleString()}</div>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between border-t border-amber-200 pt-3"><span className="text-xs font-black uppercase tracking-wider text-amber-800">Next term total payable</span><span className="text-xl font-black text-amber-900">{currency} {(Number(nextTermFee.amount) + prevBalance).toLocaleString()}</span></div>
              </div>
            )}

            {/* Payment history */}
            <div className="border-t">
              <div className="px-5 pt-4 pb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Payment history</div>
              {childPayments.length === 0 && (
                <div className="p-6 text-center text-sm text-slate-400">No payment records on file yet.</div>
              )}
              <div className="divide-y">
                {childPayments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div>
                      <div className="font-semibold">{currency} {Number(p.amount).toLocaleString()}</div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {new Date(p.paid_on).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' · '}{p.method || 'Cash'}
                        {p.reference ? ` · ${p.reference}` : ''}
                      </div>
                    </div>
                    <button onClick={() => printReceipt(p, child)} className="btn bg-emerald-50 text-emerald-800 text-xs py-1.5 px-3 shrink-0 border border-emerald-100">
                      Print receipt
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      );
    })()}
    {/* Attendance section */}
    {attendanceRecords.length > 0 && (
      <section className="overflow-hidden rounded-[2rem] bg-white shadow-sm border border-slate-200">
        <div className="p-5 border-b border-slate-100 flex items-center gap-3">
          <span className="text-lg">📋</span>
          <div>
            <h3 className="font-black text-[#062d2a]">Attendance History</h3>
            <p className="text-xs text-slate-400 mt-0.5">Last {attendanceRecords.length} approved records</p>
          </div>
        </div>
        <div className="divide-y max-h-72 overflow-y-auto">
          {attendanceRecords.map(r => {
            const statusColors: Record<string, string> = { present: '#16a34a', late: '#d97706', excused: '#2563eb', sick: '#7c3aed', absent: '#dc2626' };
            const color = statusColors[r.statusCode] || '#6b7280';
            return (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-700">
                    {new Date(r.attendanceDate).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </div>
                  <div className="text-xs text-slate-400">
                    {new Date(r.scannedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {r.period}
                  </div>
                </div>
                <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 10, fontWeight: 800, background: color + '20', color }}>{r.statusLabel}</span>
              </div>
            );
          })}
        </div>
      </section>
    )}

  </div></AdminShell>;
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  const bg = color === 'emerald' ? 'bg-emerald-50 border-emerald-100' : color === 'blue' ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-200';
  const text = color === 'emerald' ? 'text-emerald-800' : color === 'blue' ? 'text-blue-800' : 'text-slate-700';
  return <div className={`rounded-xl border p-3 ${bg}`}><div className="text-xs text-slate-400">{label}</div><div className={`mt-1 text-xl font-black ${text}`}>{value}</div></div>;
}
