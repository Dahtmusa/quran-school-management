'use client';
import AdminShell from '@/components/AdminShell';
import {
  deleteSchoolCalendarEvent, ensureAcademicTerm, loadOperationalTerms,
  loadSchoolCalendar, saveSchoolCalendarEvent, loadCurrentAcademicTerm,
  runCalendarAutomation, loadHistoricalBaselineReadiness, captureHistoricalBaseline,
  closeHistoricalFirstTermStartSecond, loadAcademicCycleSnapshot,
  prepareNextTerm, closeCurrentTerm, openAcademicTerm, closeAcademicSession,
  openAcademicSession
} from '@/lib/live-store';
import { useEffect, useState } from 'react';
import { loadCMSSettings, saveCMSSetting } from '@/lib/cms-live-store';

const TERM_LABELS = ['First Term', 'Second Term', 'Third Term'];

// Supabase relation fields can be returned as either a single object or a one-item array.
// Normalize both shapes so the Calendar page remains type-safe during Vercel builds.
function academicYearName(value: any): string {
  if (Array.isArray(value)) return value[0]?.name ?? '';
  return value?.name ?? '';
}

type TermDates = { start: string; end: string; evals: { open: string; close: string }[] };
type YearPlan = { yearName: string; yearStart: string; yearEnd: string; terms: TermDates[] };

const defaultEvals = () => [{ open: '', close: '' }, { open: '', close: '' }, { open: '', close: '' }];
const defaultPlan = (): YearPlan => ({
  yearName: new Date().getFullYear() + '/' + (new Date().getFullYear() + 1).toString().slice(2),
  yearStart: '', yearEnd: '',
  terms: [
    { start: '', end: '', evals: defaultEvals() },
    { start: '', end: '', evals: defaultEvals() },
    { start: '', end: '', evals: defaultEvals() },
  ],
});

export default function CalendarAdmin() {
  const [plan, setPlan] = useState<YearPlan>(defaultPlan());
  const [terms, setTerms] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [expandedTerm, setExpandedTerm] = useState<number>(0);
  const [historicalVerified, setHistoricalVerified] = useState(false);
  const [baseline, setBaseline] = useState<any>(null);
  const [cycle, setCycle] = useState<any>(null);

  const refresh = async () => {
    const [cal, t, cur, cycleSnapshot] = await Promise.all([
      loadSchoolCalendar(),
      loadOperationalTerms(),
      loadCurrentAcademicTerm(),
      loadAcademicCycleSnapshot(),
    ]);
    setEvents(cal);
    setTerms(t);
    setCurrent(cur);
    setCycle(cycleSnapshot);
    const settings = await loadCMSSettings();
    setHistoricalVerified(Boolean(settings.amqm_historical_import_verified));
    try { setBaseline(await loadHistoricalBaselineReadiness()); } catch { setBaseline(null); }
  };
  useEffect(() => { refresh(); }, []);

  function setTermField(i: number, field: keyof Omit<TermDates, 'evals'>, value: string) {
    setPlan(p => { const terms = [...p.terms]; terms[i] = { ...terms[i], [field]: value }; return { ...p, terms }; });
  }
  function setEvalField(ti: number, ei: number, field: 'open' | 'close', value: string) {
    setPlan(p => {
      const terms = [...p.terms];
      const evals = [...terms[ti].evals];
      evals[ei] = { ...evals[ei], [field]: value };
      terms[ti] = { ...terms[ti], evals };
      return { ...p, terms };
    });
  }

  async function saveYearPlan() {
    if (!plan.yearName || !plan.yearStart || !plan.yearEnd) { setMessage('Please fill in the academic year name and start/end dates.'); return; }
    const missingTerm = plan.terms.findIndex(t => t.start && !t.end || !t.start && t.end);
    if (missingTerm >= 0) { setMessage(`Term ${missingTerm + 1}: please fill both start and end dates (or leave both blank).`); return; }
    setBusy(true); setMessage('');
    try {
      let saved = 0;
      // Create operational terms
      const termIds: string[] = [];
      for (let i = 0; i < plan.terms.length; i++) {
        const t = plan.terms[i];
        if (!t.start || !t.end) { termIds[i] = ''; continue; }
        termIds[i] = await ensureAcademicTerm({ yearName: plan.yearName, yearStart: plan.yearStart, yearEnd: plan.yearEnd, termNumber: i + 1, termStart: t.start, termEnd: t.end });
        saved++;
      }
      // Save session opening/closing events
      if (plan.yearStart) await saveCalEvent('school_opening', `Session Opening – ${plan.yearName}`, plan.yearStart, plan.yearStart, '');
      if (plan.yearEnd) await saveCalEvent('school_closing', `Session Closing – ${plan.yearName}`, plan.yearEnd, plan.yearEnd, '');
      // Save evaluation windows as calendar markers
      for (let ti = 0; ti < plan.terms.length; ti++) {
        const t = plan.terms[ti];
        if (!t.start) continue;
        for (let ei = 0; ei < t.evals.length; ei++) {
          const ev = t.evals[ei];
          if (!ev.open || !ev.close) continue;
          await saveSchoolCalendarEvent({
            event_type: `evaluation_${ei + 1}`,
            title: `${TERM_LABELS[ti]} · Evaluation ${ei + 1}`,
            notes: `Evaluation ${ei + 1} window for ${plan.yearName} ${TERM_LABELS[ti]}`,
            starts_on: ev.open.slice(0, 10), ends_on: ev.close.slice(0, 10),
            starts_at: new Date(ev.open).toISOString(), ends_at: new Date(ev.close).toISOString(),
            term_id: termIds[ti] || null, academic_year_id: null, evaluation_number: ei + 1,
          });
        }
      }
      await runCalendarAutomation();
      setMessage(`Academic year ${plan.yearName} set up successfully. ${saved} term${saved !== 1 ? 's' : ''} created/updated. Evaluation windows are now linked to the calendar and will open automatically when due.`);
      await refresh();
    } catch (e: any) { setMessage(e?.message || 'Setup failed. Check all dates are valid.'); }
    finally { setBusy(false); }
  }

  async function saveCalEvent(type: string, title: string, startsOn: string, endsOn: string, notes: string) {
    await saveSchoolCalendarEvent({
      event_type: type, title, notes: notes || null,
      starts_on: startsOn ? startsOn.slice(0, 10) : null,
      ends_on: endsOn ? endsOn.slice(0, 10) : null,
      starts_at: startsOn ? new Date(startsOn).toISOString() : null,
      ends_at: endsOn ? new Date(endsOn).toISOString() : null,
      term_id: null, evaluation_number: null,
    });
  }

  async function runLifecycle(action: 'closeTerm'|'prepareNext'|'openNext'|'closeSession'|'openSession') {
    setBusy(true);
    setMessage('');
    try {
      let result:any = null;
      if (action === 'closeTerm') {
        if (!cycle?.current_term?.id) throw new Error('There is no current digital term to close.');
        result = await closeCurrentTerm(cycle.current_term.id);
      } else if (action === 'prepareNext') {
        if (!cycle?.current_term?.id) throw new Error('The current term is already closed.');
        result = await prepareNextTerm(cycle.current_term.id);
      } else if (action === 'openNext') {
        if (!cycle?.next_term?.id) throw new Error('There is no next configured term.');
        result = await openAcademicTerm(cycle.next_term.id);
      } else if (action === 'closeSession') {
        if (!cycle?.session?.id) throw new Error('No current academic session found.');
        result = await closeAcademicSession(cycle.session.id);
      } else {
        if (!cycle?.next_session?.id) throw new Error('No scheduled next academic session found.');
        result = await openAcademicSession(cycle.next_session.id);
      }
      setMessage(result?.message || 'Academic lifecycle action completed.');
      await refresh();
    } catch (e:any) {
      setMessage(e?.message || 'Academic lifecycle action failed.');
    } finally {
      setBusy(false);
    }
  }

  // Group events by type for the timeline
  const sessionEvents = events.filter(e => e.event_type === 'school_opening' || e.event_type === 'school_closing');
  const evalEvents = events.filter(e => ['evaluation_1','evaluation_2','evaluation_3'].includes(e.event_type));
  const otherEvents = events.filter(e => e.event_type !== 'school_opening' && e.event_type !== 'school_closing' && !['evaluation_1','evaluation_2','evaluation_3'].includes(e.event_type));

  return <AdminShell title="School Calendar"><div className="space-y-6">

    {/* Hero */}
    <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-emerald-950 to-[#1a2a1a] p-6 text-white shadow-xl md:p-8">
      <div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">Academic calendar & automation</div>
      <h2 className="mt-2 text-3xl font-black md:text-4xl">Set up your academic year in one go.</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/75">Fill in all term dates and evaluation windows below, then click Save. The system creates all operational terms automatically. Go to Evaluations to assign classes once dates are set.</p>
    </section>

    {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{message}</div>}

    {/* Active term banner */}
    {current?.term && <div className="rounded-2xl bg-emerald-950 p-4 text-white flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div><span className="text-xs font-black uppercase tracking-wider text-emerald-300">Currently active</span><div className="mt-1 text-lg font-black">{current.academic_year?.name} · {current.term.name} <span className="text-emerald-300 text-sm font-normal">({current.term.starts_on} → {current.term.ends_on})</span></div></div>
      <span className="pill bg-emerald-700 text-emerald-100">Active term</span>
    </div>}

    {/* ── YEAR PLANNER ── */}
    <div className="rounded-3xl border-2 border-emerald-200 overflow-hidden">
      <div className="bg-emerald-50 border-b border-emerald-200 p-5">
        <h2 className="text-xl font-black text-emerald-950">Academic Year Planner</h2>
        <p className="mt-1 text-sm text-slate-600">Fill in all dates once and save. Each term and evaluation window is created automatically.</p>
      </div>

      {/* Year header */}
      <div className="border-b bg-white p-5">
        <div className="text-xs font-black uppercase tracking-wide text-slate-500 mb-3">Academic session</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-bold text-slate-600">Year name (e.g. 2026/27)
            <input className="input mt-1 w-full font-black" value={plan.yearName} onChange={e => setPlan(p => ({ ...p, yearName: e.target.value }))} placeholder="2026/27" />
          </label>
          <label className="text-xs font-bold text-slate-600">Session opens
            <input className="input mt-1 w-full" type="date" value={plan.yearStart} onChange={e => setPlan(p => ({ ...p, yearStart: e.target.value }))} />
          </label>
          <label className="text-xs font-bold text-slate-600">Session closes
            <input className="input mt-1 w-full" type="date" value={plan.yearEnd} onChange={e => setPlan(p => ({ ...p, yearEnd: e.target.value }))} />
          </label>
        </div>
      </div>

      {/* Term accordion blocks */}
      {plan.terms.map((term, ti) => {
        const isOpen = expandedTerm === ti;
        const configured = term.start && term.end;
        const evalCount = term.evals.filter(e => e.open && e.close).length;
        return <div key={ti} className={`border-b ${isOpen ? 'bg-white' : 'bg-slate-50'}`}>
          <button className="flex w-full items-center justify-between p-5 text-left hover:bg-slate-100 transition-colors" onClick={() => setExpandedTerm(isOpen ? -1 : ti)}>
            <div className="flex items-center gap-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl font-black text-lg ${configured ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'}`}>T{ti + 1}</div>
              <div>
                <div className="font-black">{TERM_LABELS[ti]}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {configured ? `${term.start} → ${term.end}` : 'Dates not set'}
                  {evalCount > 0 && <span className="ml-3 font-bold text-emerald-700">{evalCount}/3 eval windows set</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {configured && <span className="pill bg-emerald-50 text-emerald-700">Configured</span>}
              <span className="text-slate-400">{isOpen ? '▲' : '▼'}</span>
            </div>
          </button>

          {isOpen && <div className="border-t p-5 space-y-5">
            {/* Term dates */}
            <div>
              <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Term dates</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-bold">Term starts<input className="input mt-1 w-full" type="date" value={term.start} onChange={e => setTermField(ti, 'start', e.target.value)} /></label>
                <label className="text-xs font-bold">Term ends<input className="input mt-1 w-full" type="date" value={term.end} onChange={e => setTermField(ti, 'end', e.target.value)} /></label>
              </div>
            </div>

            {/* Evaluation windows */}
            <div>
              <div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Evaluation windows — set open & close dates for each</div>
              <div className="space-y-3">
                {term.evals.map((ev, ei) => {
                  const done = ev.open && ev.close;
                  return <div key={ei} className={`rounded-2xl border p-4 ${done ? 'border-emerald-200 bg-emerald-50' : 'bg-slate-50'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-xl text-xs font-black ${done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{ei + 1}</div>
                        <span className="text-sm font-black">Evaluation {ei + 1}</span>
                        {done && <span className="text-xs font-bold text-emerald-700">✓ Set</span>}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold text-slate-600">Window opens
                        <input className="input mt-1 w-full" type="datetime-local" value={ev.open} onChange={e => setEvalField(ti, ei, 'open', e.target.value)} />
                      </label>
                      <label className="text-xs font-bold text-slate-600">Window closes
                        <input className="input mt-1 w-full" type="datetime-local" value={ev.close} min={ev.open || undefined} onChange={e => setEvalField(ti, ei, 'close', e.target.value)} />
                      </label>
                    </div>
                  </div>;
                })}
              </div>
            </div>
          </div>}
        </div>;
      })}

      {/* Save button */}
      <div className="flex flex-col gap-3 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">Saving creates all operational terms and saves evaluation window dates for reference. Classes are assigned on the Evaluations page.</p>
        <button className="btn btn-primary shrink-0 px-8 py-3 text-base" disabled={busy || !plan.yearName} onClick={saveYearPlan}>{busy ? 'Saving…' : '💾 Save year setup'}</button>
      </div>
    </div>

    {/* ── LIFECYCLE CONTROL CENTER ── */}
    {terms.length > 0 && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-slate-950 p-5 text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">Academic lifecycle</div>
            <h2 className="mt-1 text-xl font-black">Controlled term & session progression</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-white/65">The system now advances in order: prepare → close term → prepare successor → open on its start date. At the end of Third Term, close the session, then open the next academic session.</p>
          </div>
          {cycle?.session && <span className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-emerald-200">{cycle.session.name} · {cycle.session.status}</span>}
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border bg-slate-50 p-4">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Current stage</div>
          {cycle?.current_term ? (
            <>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <div className="text-lg font-black text-slate-900">{cycle.session?.name} · {cycle.current_term.name}</div>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">{cycle.current_term.status}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{cycle.current_term.starts_on} → {cycle.current_term.ends_on}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {cycle.current_term.status === 'historical_baseline' && (
                  <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">Protected historical baseline — use the verification/start control below.</span>
                )}
                {cycle.can_close_current_term && (
                  <button className="btn bg-amber-600 text-white hover:bg-amber-700" disabled={busy} onClick={() => {
                    if (confirm(`Close ${cycle.current_term.name}? This finalizes the term record and report-card snapshots. The next term will not open automatically.`)) runLifecycle('closeTerm');
                  }}>{busy ? 'Processing…' : 'Close Current Term'}</button>
                )}
                {!cycle.can_close_current_term && cycle.current_term.status === 'digital_active' && (
                  <span className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600 border">Not ready to close · {cycle.missing_current_evaluations || 0} students missing approved evaluations</span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="mt-1 text-lg font-black text-slate-900">No term currently open</div>
              <div className="mt-1 text-xs text-slate-500">The session is between terms or awaiting a new session opening.</div>
            </>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Next controlled action</div>
          {cycle?.next_term ? (
            <>
              <div className="mt-1 text-lg font-black text-slate-900">{cycle.next_term.name}</div>
              <div className="mt-1 text-xs text-slate-500">{cycle.next_term.starts_on} → {cycle.next_term.ends_on} · {cycle.next_term.status}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {cycle.current_term?.status === 'digital_closed' || cycle.current_term?.status === 'historical_closed' ? (
                  <button className="btn bg-slate-900 text-white" disabled={busy} onClick={() => runLifecycle('prepareNext')}>Prepare Next Term</button>
                ) : null}
                {cycle.can_open_next_term && (
                  <button className="btn bg-emerald-700 text-white hover:bg-emerald-800" disabled={busy} onClick={() => {
                    if (confirm(`Open ${cycle.next_term.name}? Student placement and teacher assignment checks will run before activation.`)) runLifecycle('openNext');
                  }}>{busy ? 'Processing…' : 'Open Next Term'}</button>
                )}
                {cycle.next_term.status === 'prepared' && !cycle.can_open_next_term && (
                  <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 border">Prepared · opens on {cycle.next_term.starts_on}</span>
                )}
              </div>
            </>
          ) : cycle?.next_session ? (
            <>
              <div className="mt-1 text-lg font-black text-slate-900">Next session · {cycle.next_session.name}</div>
              <div className="mt-1 text-xs text-slate-500">{cycle.next_session.starts_on} → {cycle.next_session.ends_on} · {cycle.next_session.status}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {cycle.can_open_next_session && (
                  <button className="btn bg-emerald-700 text-white hover:bg-emerald-800" disabled={busy} onClick={() => {
                    if (confirm(`Open academic session ${cycle.next_session.name}? Returning Year 1 students will advance to Year 2 and new-session placements will be prepared.`)) runLifecycle('openSession');
                  }}>{busy ? 'Processing…' : 'Open New Session'}</button>
                )}
                {!cycle.can_open_next_session && <span className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 border">Scheduled · opens on {cycle.next_session.starts_on}</span>}
              </div>
            </>
          ) : (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No successor is configured yet. Use the Academic Year Planner above to create the next session and its three terms.</div>
          )}
        </div>
      </div>

      {cycle?.session?.id && cycle.can_close_session && (
        <div className="border-t bg-amber-50 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-black text-amber-950">Session closure is ready</div>
              <p className="mt-1 text-xs leading-5 text-amber-900/75">All configured terms in {cycle.session.name} are closed and there is no active term. Closing the session freezes its lifecycle and clears the current-cycle pointer.</p>
            </div>
            <button className="btn bg-amber-700 text-white hover:bg-amber-800" disabled={busy} onClick={() => {
              if (confirm(`Close academic session ${cycle.session.name}? This is the final administrative close for the session.`)) runLifecycle('closeSession');
            }}>{busy ? 'Processing…' : 'Close Academic Session'}</button>
          </div>
        </div>
      )}

      <div className="border-t p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-black text-slate-900">Placement checkpoint</div>
            <p className="mt-1 text-xs text-slate-500">A new term/session will not become active until every active student has an enrollment, a class in the correct academic session, and a teacher assigned to that class.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase text-slate-600">Next-term placement pending: {cycle?.next_term_placement_pending ?? '—'}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase text-slate-600">Next-session placement pending: {cycle?.next_session_placement_pending ?? '—'}</span>
            {cycle?.current_term && !cycle.can_close_current_term && cycle.current_term.status === 'digital_active' && <span className="rounded-full bg-amber-100 px-3 py-1.5 text-[10px] font-black uppercase text-amber-800">Evaluation completion required before close</span>}
          </div>
        </div>
      </div>
    </section>}

    {/* Historical import / digital-start controls */}
    {terms.length > 0 && current?.term?.term_number === 1 && current?.term?.lifecycle_status === 'historical_baseline' && <section className="card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black">First-Term historical baseline</h2>
          <p className="mt-1 text-sm text-slate-500">The imported First Term remains protected. Verify the baseline, then start Second Term through the controlled digital launch.</p>
          <div className="mt-2 text-xs font-bold text-slate-600">Baseline: {baseline?.baseline_rows ?? 0}/{baseline?.active_students ?? 0} students · {baseline?.missing_baseline ?? '—'} missing · {baseline?.missing_quran_position ?? '—'} missing Qur’an positions</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!historicalVerified && <button className="btn bg-slate-900 text-white" disabled={busy} onClick={async()=>{setBusy(true);try{await captureHistoricalBaseline();await saveCMSSetting('amqm_historical_import_verified',true);setHistoricalVerified(true);setBaseline(await loadHistoricalBaselineReadiness());setMessage('Historical baseline captured and verified. No historical records were deleted.');await refresh()}catch(e:any){setMessage(e?.message||'Baseline verification failed')}finally{setBusy(false)}}}>Verify & Capture Baseline</button>}
          {historicalVerified && baseline?.ready && <button className="btn bg-emerald-700 text-white" disabled={busy} onClick={async()=>{if(!confirm('This will archive First Term and make Second Term the first fully digital operational term. No historical evaluations will be deleted. Continue?'))return;setBusy(true);try{const r=await closeHistoricalFirstTermStartSecond('Historical First Term imported baseline closed; Second Term digital operations started.');setMessage(r?.message||'Second Term digital operations started.');await refresh()}catch(e:any){setMessage(e?.message||'Digital school transition failed')}finally{setBusy(false)}}}>Start Digital Second Term</button>}
          {historicalVerified && <span className="pill bg-emerald-100 text-emerald-800">✓ Historical baseline verified</span>}
        </div>
      </div>
    </section>}

    <!-- intentionally no manual term selector; lifecycle actions are sequential -->

    {/* Timeline */}
    {(terms.length > 0 || events.length > 0) && <section className="card overflow-hidden">
      <div className="border-b p-5"><h2 className="text-lg font-black">Configured calendar</h2></div>
      <div className="divide-y">

        {/* Operational terms */}
        {terms.length > 0 && <div className="p-5">
          <div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Operational terms</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...terms].sort((a,b)=>(a.starts_on||'').localeCompare(b.starts_on||'')).map(t => <div key={t.id} className={`rounded-2xl p-4 border ${current?.term_id === t.id ? 'border-emerald-500 bg-emerald-50' : 'bg-slate-50'}`}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500">{academicYearName(t.academic_years)}</div>
                {current?.term_id === t.id && <span className="pill bg-emerald-600 text-white text-[10px]">Active</span>}
              </div>
              <div className="mt-1 font-black">{t.name}</div>
              <div className="mt-1 text-xs text-slate-500">{t.starts_on} → {t.ends_on}</div>
            </div>)}
          </div>
        </div>}

        {/* Session events */}
        {sessionEvents.length > 0 && <div className="p-5">
          <div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Session events</div>
          <div className="space-y-2">
            {sessionEvents.map(e => <EventRow key={e.id} event={e} onDelete={async () => { await deleteSchoolCalendarEvent(e.id); await refresh(); }} />)}
          </div>
        </div>}

        {/* Evaluation windows */}
        {evalEvents.length > 0 && <div className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <div className="text-xs font-black uppercase tracking-wide text-slate-400">Evaluation windows</div>
            <span className="pill bg-emerald-50 text-emerald-700 text-[10px]">Calendar controlled</span>
          </div>
          <div className="space-y-2">
            {evalEvents.map(e => <EventRow key={e.id} event={e} onDelete={async () => { await deleteSchoolCalendarEvent(e.id); await refresh(); }} />)}
          </div>
        </div>}

        {/* Other events */}
        {otherEvents.length > 0 && <div className="p-5">
          <div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">Other events</div>
          <div className="space-y-2">
            {otherEvents.map(e => <EventRow key={e.id} event={e} onDelete={async () => { await deleteSchoolCalendarEvent(e.id); await refresh(); }} />)}
          </div>
        </div>}

        {terms.length === 0 && events.length === 0 && <div className="p-10 text-center text-sm text-slate-400">No academic year has been configured yet. Fill in the planner above and click Save.</div>}
      </div>
    </section>}

  </div></AdminShell>;
}

function EventRow({ event, onDelete }: { event: any; onDelete: () => void }) {
  const typeColors: Record<string, string> = {
    school_opening: 'bg-emerald-50 text-emerald-700', school_closing: 'bg-rose-50 text-rose-700',
    evaluation_1: 'bg-amber-50 text-amber-700', evaluation_2: 'bg-amber-50 text-amber-700', evaluation_3: 'bg-amber-50 text-amber-700', holiday: 'bg-blue-50 text-blue-700',
  };
  const cls = typeColors[event.event_type] || 'bg-slate-50 text-slate-600';
  const start = event.starts_at ? new Date(event.starts_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : event.starts_on;
  const end = event.ends_at ? new Date(event.ends_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : event.ends_on;
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className={`pill ${cls}`}>{event.event_type.replaceAll('_', ' ')}</span>
      <span className="font-semibold text-sm">{event.title}</span>
      <span className="text-xs text-slate-400">{start}{end && end !== start ? ` → ${end}` : ''}</span>
    </div>
    <button className="shrink-0 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100" onClick={onDelete}>Delete</button>
  </div>;
}
