'use client';

// Teacher / staff dashboard: my attendance fines.
// - Every late/absent occurrence with its date, time, and NGN amount.
// - Running totals (fines, payments, balance).
// - The school payment account so the teacher knows where to send money.

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { attendanceApi, type FinesPayload } from '@/lib/attendance/api';

const naira = (n: number) => '₦' + Number(n || 0).toLocaleString('en-NG');
const fmtDate = (iso: string) => new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
}).format(new Date(iso));
const fmtTime = (iso: string | null | undefined) => iso
  ? new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso))
  : '—';

export default function MyFinesPage() {
  const [payload, setPayload] = useState<FinesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setPayload(await attendanceApi.myFines()); }
    catch (e: any) { setError(e?.message || 'Could not load your fines.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return <AdminShell title="My Attendance Fines">
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-[#062d2a] p-6 text-white">
        <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#e3c36b]">AMQM · My Attendance</div>
        <h1 className="mt-2 text-3xl font-black">My Fines &amp; Payments</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">
          Every late arrival and absence is recorded here with the applicable penalty. Fines keep adding up until they are paid; the balance below is what you currently owe.
        </p>
      </section>

      {error && <div className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>}
      {loading && !payload ? (
        <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400">Loading your fines…</div>
      ) : payload && 'error' in (payload as any) ? (
        <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Your profile could not be found.</div>
      ) : payload ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi tone="rose"    label="Fines this year"       value={naira(payload.totals.fines_ngn)} />
            <Kpi tone="emerald" label="Payments received"      value={naira(payload.totals.payments_ngn)} />
            <Kpi tone="slate"   label="Late fine (per late)"   value={naira(payload.totals.late_ngn)} />
            <Kpi tone="dark"    label="Balance remaining"      value={naira(payload.totals.balance_ngn)} />
          </div>

          <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b bg-slate-50 p-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">Late &amp; absent occurrences</div>
                <div className="mt-1 text-lg font-black">{payload.fines.length} record{payload.fines.length === 1 ? '' : 's'}</div>
              </div>
              {payload.fines.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">No fines on record. Keep it up.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead className="text-[10px] uppercase tracking-[.12em] text-slate-400"><tr>
                      <th className="px-5 py-3">Date</th><th>Time</th><th>Type</th><th className="px-5 py-3 text-right">Amount</th>
                    </tr></thead>
                    <tbody>
                      {payload.fines.map(f => (
                        <tr key={f.id} className="border-t">
                          <td className="px-5 py-3">{fmtDate(f.attendance_date)}</td>
                          <td className="text-xs text-slate-500">{fmtTime(f.scanned_at)}</td>
                          <td>
                            <span className={'inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase ' + (f.status_code === 'late' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700')}>
                              {f.status_code}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-black">{naira(f.amount_ngn)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-800">Pay to</div>
                <pre className="mt-2 whitespace-pre-wrap text-sm font-bold text-emerald-950">{payload.account || 'The school has not set the payment account yet. Please ask the administrator.'}</pre>
                <div className="mt-3 text-[11px] font-bold text-emerald-800/70">After paying, share the transfer receipt with the finance office. The balance updates once your payment is recorded.</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b bg-slate-50 p-4">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500">Payments received</div>
                  <div className="mt-1 text-lg font-black">{payload.payments.length} record{payload.payments.length === 1 ? '' : 's'}</div>
                </div>
                {payload.payments.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-400">No payments recorded yet.</div>
                ) : (
                  <ul className="divide-y">
                    {payload.payments.map(p => (
                      <li key={p.id} className="flex items-start justify-between gap-3 p-4">
                        <div>
                          <div className="font-black">{naira(p.amount_ngn)}</div>
                          <div className="text-xs text-slate-500">
                            {fmtDate(p.paid_on)}
                            {p.method && <> · {p.method}</>}
                          </div>
                          {p.note && <div className="mt-1 text-xs text-slate-500">{p.note}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  </AdminShell>;
}

function Kpi({ tone, label, value }: { tone: 'emerald'|'amber'|'rose'|'sky'|'slate'|'dark'; label: string; value: string }) {
  const styles = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    amber:   'bg-amber-50 text-amber-800 border-amber-100',
    rose:    'bg-rose-50 text-rose-800 border-rose-100',
    sky:     'bg-sky-50 text-sky-800 border-sky-100',
    slate:   'bg-slate-50 text-slate-700 border-slate-200',
    dark:    'bg-[#062d2a] text-white border-[#062d2a]',
  }[tone];
  return <div className={'rounded-2xl border p-4 ' + styles}>
    <div className="text-[11px] font-black uppercase tracking-wide opacity-80">{label}</div>
    <div className="mt-1 text-2xl font-black">{value}</div>
  </div>;
}
