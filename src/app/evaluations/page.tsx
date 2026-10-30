'use client';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import MemorizationBadge from '@/components/MemorizationBadge';
import { loadClasses, loadEvaluations, loadOperationalTerms, reviewEvaluation, loadCurrentAcademicTerm, loadAdminEvalRoundState, adminToggleEvaluation, type AdminEvalRoundState } from '@/lib/live-store';
import { useEffect, useMemo, useState } from 'react';

export default function EvaluationsAdmin() {
  const [evals, setEvals] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [termId, setTermId] = useState('');
  const [currentTerm, setCurrentTerm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [roundState, setRoundState] = useState<AdminEvalRoundState[]>([]);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [detailEvalId, setDetailEvalId] = useState<string | null>(null);

  const refresh = async () => {
    const [e, t, _cl, cur] = await Promise.all([loadEvaluations(), loadOperationalTerms(), loadClasses(), loadCurrentAcademicTerm()]);
    setEvals(e);
    setTerms(t);
    setCurrentTerm(cur);
    if (cur?.term_id && !termId) setTermId(cur.term_id);
    const target = cur?.term_id || termId;
    if (target) {
      const rs = await loadAdminEvalRoundState(target);
      setRoundState(rs);
    }
  };
  useEffect(() => { refresh(); }, []);

  async function toggleRound(n: 1 | 2 | 3, action: 'open' | 'close') {
    if (!termId) { setMessage('Pick a term first.'); return; }
    setBusy(true); setMessage('');
    try {
      const r = await adminToggleEvaluation(termId, n, action);
      if (action === 'open') setMessage(`Evaluation ${n} opened. ${r?.students_affected || 0} student rows across ${r?.classes_affected || 0} classes. Closes ${new Date(r?.closes_at || '').toLocaleString('en-NG')} (from School Calendar).`);
      else setMessage(`Evaluation ${n} closed.`);
      await refresh();
    } catch (e: any) { setMessage(e?.message || 'Toggle failed.'); }
    finally { setBusy(false); }
  }

  async function approve(id: string) {
    setBusy(true);
    try { await reviewEvaluation(id, 'approve', ''); await refresh(); setMessage('Evaluation approved.'); }
    catch (e: any) { setMessage(e?.message || 'Review failed'); }
    finally { setBusy(false); }
  }
  async function submitReturn() {
    if (!returnId) return;
    setBusy(true);
    try { await reviewEvaluation(returnId, 'return', returnReason.trim() || 'Please review and resubmit.'); await refresh(); setReturnId(null); setReturnReason(''); setMessage('Evaluation returned to the teacher.'); }
    catch (e: any) { setMessage(e?.message || 'Review failed'); }
    finally { setBusy(false); }
  }

  // Only show pending reviews belonging to a round that is currently
  // open (or the most recently closed round for this term). Historical
  // pending rows from reverted/old campaigns stay out of view.
  const activeRoundNumbers = useMemo(() => {
    const open = roundState.filter(r => r.status === 'open').map(r => r.evaluation_number);
    if (open.length) return new Set(open);
    const closed = roundState.filter(r => r.status === 'closed').sort((a, b) => (new Date(b.closes_at || 0).getTime()) - (new Date(a.closes_at || 0).getTime()))[0];
    return closed ? new Set([closed.evaluation_number]) : new Set<number>();
  }, [roundState]);

  const termName = terms.find(t => t.id === termId)?.name;
  const evalsByClass = useMemo(() => {
    const actionable = evals.filter((ev: any) => (ev.status === 'Pending Approval' || ev.status === 'Returned') && (!termName || ev.term === termName) && activeRoundNumbers.has(Number(ev.number)));
    const map = new Map<string, { className: string; evals: any[] }>();
    for (const ev of actionable) {
      const key = ev.classId || 'unassigned';
      const name = ev.className || 'Unassigned';
      if (!map.has(key)) map.set(key, { className: name, evals: [] });
      map.get(key)!.evals.push(ev);
    }
    return [...map.entries()].map(([classId, v]) => ({ classId, ...v, evals: v.evals.sort((a, b) => (b.score || 0) - (a.score || 0)) }));
  }, [evals, termName, activeRoundNumbers]);

  return <AdminShell title="Evaluations">
    <div className="space-y-6">
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{message}</div>}

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-emerald-700">Current academic term</div>
            <div className="mt-1 text-lg font-black text-emerald-950">{currentTerm?.academic_year?.name || 'Not configured'} · {currentTerm?.term?.name || 'Select a term'}</div>
          </div>
          <select className="input max-w-xs" value={termId} onChange={e => { setTermId(e.target.value); setTimeout(refresh, 0); }}>
            {terms.map(t => <option key={t.id} value={t.id}>{t.academic_years?.name || 'Year'} · {t.name}</option>)}
          </select>
        </div>
      </section>

      {/* Toggle panel. Dates come from the School Calendar; admin
          only decides when to open / close. Any calendar edit syncs
          to this card instantly via a DB trigger. */}
      <section className="card overflow-hidden">
        <div className="border-b bg-slate-50 p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Open / close an evaluation</h2>
              <p className="mt-1 text-sm text-slate-500">Dates come from the <a href="/calendar" className="font-black text-emerald-700 underline">School Calendar</a>. Change them there and this page follows automatically.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {[1, 2, 3].map(n => {
            const rs = roundState.find(r => r.evaluation_number === n);
            const isOpen = rs?.status === 'open';
            const isClosed = rs?.status === 'closed';
            const calClose = rs?.calendar_closes_at ? new Date(rs.calendar_closes_at) : null;
            const calClosePast = calClose ? calClose.getTime() <= Date.now() : false;
            const canOpen = !!rs?.calendar_closes_at && !calClosePast;
            const toneBg = isOpen ? 'border-emerald-300 bg-emerald-50' : isClosed ? 'border-slate-300 bg-slate-50' : 'border-slate-200 bg-white';
            return <div key={n} className={`rounded-2xl border-2 p-4 ${toneBg}`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-black">Evaluation {n}</div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${isOpen ? 'bg-emerald-700 text-white' : isClosed ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>{isOpen ? 'OPEN' : isClosed ? 'CLOSED' : 'NOT OPENED'}</span>
              </div>

              {/* Calendar dates (source of truth). */}
              {calClose ? <div className="mt-2 rounded-lg bg-white px-2 py-1.5 text-[11px] ring-1 ring-slate-200">
                <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">Calendar close</div>
                <div className={`font-black ${calClosePast ? 'text-rose-600' : 'text-slate-800'}`}>
                  {calClose.toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                </div>
                {calClosePast && <div className="text-[10px] font-bold text-rose-600">Past — set a new date in Calendar</div>}
              </div> : <div className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">
                Not configured. Set this round's dates on the <a href="/calendar" className="underline">Calendar</a>.
              </div>}

              {rs?.students_affected != null && rs.students_affected > 0 && <div className="mt-1 text-[11px] text-slate-500">{rs.students_affected} student row{rs.students_affected === 1 ? '' : 's'}</div>}

              <div className="mt-3 flex flex-wrap gap-2">
                {!isOpen && <button className="btn btn-primary flex-1" disabled={busy || !termId || !canOpen} onClick={() => toggleRound(n as 1 | 2 | 3, 'open')}>{isClosed ? 'Re-open' : 'Open'}</button>}
                {isOpen && <button className="btn bg-rose-50 text-rose-700 flex-1" disabled={busy} onClick={() => toggleRound(n as 1 | 2 | 3, 'close')}>Close now</button>}
              </div>
            </div>;
          })}
        </div>
      </section>

      {/* Pending review -- scoped to the active round only. Shows up
          only when there is something to approve, otherwise hidden. */}
      {evalsByClass.length > 0 && <section className="card overflow-hidden">
        <div className="border-b p-5">
          <h2 className="text-xl font-black">Pending teacher submissions</h2>
          <p className="mt-1 text-sm text-slate-500">Review and approve what teachers have submitted for the open round.</p>
        </div>
        <div className="divide-y">
          {evalsByClass.map(({ classId, className, evals: classEvals }) => {
            const open = expandedClass === classId;
            const pendingCount = classEvals.filter((e: any) => e.status === 'Pending Approval').length;
            const returnedCount = classEvals.filter((e: any) => e.status === 'Returned').length;
            return <div key={classId}>
              <button className="flex w-full items-center justify-between p-5 text-left hover:bg-slate-50" onClick={() => setExpandedClass(open ? null : classId)}>
                <div>
                  <div className="font-black">{className}</div>
                  <div className="mt-1 flex gap-3 text-xs">
                    <span className="text-amber-700">{pendingCount} pending</span>
                    {returnedCount > 0 && <span className="text-rose-700">{returnedCount} returned</span>}
                  </div>
                </div>
                <span className="text-slate-400">{open ? '▲' : '▼'}</span>
              </button>
              {open && <div className="divide-y border-t bg-slate-50">
                {classEvals.map((ev: any, idx: number) => <div key={ev.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-slate-200 text-xs font-black text-slate-500">#{idx + 1}</div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <b>{ev.student}</b>
                          {ev.score > 0 && <span className="font-black text-emerald-700">{ev.score}%</span>}
                          <StatusBadge status={ev.status} />
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">{ev.admissionNo} · Eval {ev.number}</div>
                        <div className="mt-1 flex flex-wrap gap-1"><MemorizationBadge direction={ev.memorizationDirection} /><SectionBadge section={ev.studentSection} /></div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button className="btn bg-slate-100 text-xs" onClick={() => setDetailEvalId(detailEvalId === ev.id ? null : ev.id)}>{detailEvalId === ev.id ? 'Hide details' : 'View details'}</button>
                      {ev.status === 'Pending Approval' && returnId !== ev.id && <div className="flex gap-2">
                        <button className="btn btn-green" disabled={busy} onClick={() => approve(ev.id)}>Approve</button>
                        <button className="btn bg-rose-50 text-rose-700" disabled={busy} onClick={() => { setReturnId(ev.id); setReturnReason(''); }}>Return</button>
                      </div>}
                      {returnId === ev.id && <div className="flex flex-col gap-2">
                        <textarea className="input min-h-[72px] resize-none text-sm" placeholder="Reason (shown to teacher)" value={returnReason} onChange={e => setReturnReason(e.target.value)} />
                        <div className="flex gap-2">
                          <button className="btn btn-primary text-sm" disabled={busy} onClick={submitReturn}>Return</button>
                          <button className="btn bg-white text-sm" onClick={() => setReturnId(null)}>Cancel</button>
                        </div>
                      </div>}
                      {ev.status === 'Returned' && <span className="text-xs font-bold text-rose-700">Awaiting teacher correction</span>}
                    </div>
                  </div>
                  {detailEvalId === ev.id && <div className="mt-3 rounded-2xl border bg-white p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <InfoCell k="Memorized ayahs" v={String(ev.memorizedAyahs || 0)} />
                      <InfoCell k="Pages covered" v={String(ev.memorizedPages || 0)} />
                      <InfoCell k="Hizb covered" v={String(ev.memorizedHizbs || 0)} />
                      <InfoCell k="Final score" v={ev.score > 0 ? `${ev.score}%` : '—'} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {[['Memorization', ev.memorization], ['Accuracy', ev.accuracy], ['Fluency', ev.fluency], ['Tajweed', ev.tajweed], ['Retention', ev.retention]].map(([lbl, val]) => <div key={String(lbl)} className="rounded-xl bg-slate-50 p-2 text-center">
                        <div className="text-[11px] font-bold uppercase text-slate-400">{lbl}</div>
                        <div className="mt-1 text-lg font-black text-emerald-800">{val || '—'}/5</div>
                      </div>)}
                    </div>
                    {ev.comment && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><span className="font-bold">Teacher comment: </span>{ev.comment}</div>}
                  </div>}
                </div>)}
              </div>}
            </div>;
          })}
        </div>
      </section>}
    </div>
  </AdminShell>;
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : status === 'Pending Approval' ? 'bg-amber-50 text-amber-700' : status === 'Returned' ? 'bg-rose-50 text-rose-700' : status === 'Draft' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500';
  return <span className={`pill ${cls}`}>{status}</span>;
}
function InfoCell({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl bg-slate-50 p-2"><div className="text-[11px] font-bold uppercase text-slate-400">{k}</div><div className="mt-0.5 text-sm font-black">{v}</div></div>;
}
