'use client';

import AdminShell from '@/components/AdminShell';
import {
  loadSchoolCalendarConfig,
  loadCurrentAcademicTerm,
  saveSimpleAcademicCalendar,
  syncAcademicCalendarState,
  runCalendarAutomation,
  createNextSchoolYear,
} from '@/lib/live-store';
import { useEffect, useMemo, useState } from 'react';

type EvalWindow = { open: string; close: string };
type TermPlan = { number: 1|2|3; name: string; start: string; end: string; evals: EvalWindow[] };
type YearPlan = { yearName: string; yearStart: string; yearEnd: string; terms: TermPlan[] };

const TERM_NAMES = ['First Term','Second Term','Third Term'] as const;

function blankPlan(): YearPlan {
  const year = new Date().getFullYear();
  return {
    yearName: `${year}/${String(year + 1).slice(-2)}`,
    yearStart: '',
    yearEnd: '',
    terms: [1,2,3].map(number => ({
      number: number as 1|2|3,
      name: TERM_NAMES[number-1],
      start: '',
      end: '',
      evals: [1,2,3].map(() => ({open:'',close:''})),
    })),
  };
}

function toLocalInput(value?: string|null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Africa/Lagos',
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false,
  }).formatToParts(d);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
}

function displayDate(value?: string|null) {
  if (!value) return '—';
  const d = new Date(value + (value.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-NG',{day:'2-digit',month:'short',year:'numeric'});
}

function nextAcademicYearName(value: string) {
  const match = value.trim().match(/^(\d{4})[\/-](\d{2,4})$/);
  if (!match) return '';
  const start = Number(match[1]);
  const end = Number(match[2]);
  const endYear = end < 100 ? Math.floor(start / 100) * 100 + end : end;
  return `${start + 1}/${String(endYear + 1).slice(-2)}`;
}

export default function CalendarAdmin() {
  const [plan,setPlan]=useState<YearPlan>(blankPlan());
  const [current,setCurrent]=useState<any>(null);
  const [savedYears,setSavedYears]=useState<any[]>([]);
  const [savedTerms,setSavedTerms]=useState<any[]>([]);
  const [events,setEvents]=useState<any[]>([]);
  const [selectedYearId,setSelectedYearId]=useState<string>('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  // Turn the raw rows for a specific year into the editor's YearPlan shape.
  const buildPlanForYear=(year:any, allTerms:any[], allEvents:any[]):YearPlan=>{
    const yearTerms=(allTerms||[]).filter((t:any)=>t.academic_year_id===year?.id);
    const yearEvents=(allEvents||[]).filter((e:any)=>e.academic_year_id===year?.id);
    return {
      yearName:year?.name || '',
      yearStart:year?.starts_on || '',
      yearEnd:year?.ends_on || '',
      terms:[1,2,3].map(number=>{
        const t=yearTerms.find((x:any)=>Number(x.term_number)===number);
        return {
          number:number as 1|2|3,
          name:TERM_NAMES[number-1],
          start:t?.starts_on || '',
          end:t?.ends_on || '',
          evals:[1,2,3].map(n=>{
            const e=yearEvents.find((x:any)=>x.term_id===t?.id && Number(x.evaluation_number)===n);
            return {open:toLocalInput(e?.starts_at),close:toLocalInput(e?.ends_at)};
          }),
        };
      }),
    };
  };

  const refresh=async(preferredYearId?:string)=>{
    setError('');
    const [cfg,cur]=await Promise.all([loadSchoolCalendarConfig(),loadCurrentAcademicTerm()]);
    setCurrent(cur);
    setSavedYears(cfg.years);
    setSavedTerms(cfg.terms);
    setEvents(cfg.events);
    // Prefer whatever year the admin last picked, else the current session,
    // else the newest one. Falls back to a blank plan when nothing is saved
    // so the form is still editable on a fresh install.
    const pick =
      (preferredYearId && cfg.years.find((y:any)=>y.id===preferredYearId)) ||
      cfg.years.find((y:any)=>y.is_current) ||
      cfg.years[0];
    if(pick){
      setSelectedYearId(pick.id);
      setPlan(buildPlanForYear(pick, cfg.terms, cfg.events));
    } else {
      setSelectedYearId('');
      setPlan(blankPlan());
    }
  };

  useEffect(()=>{refresh().catch(e=>setError(e?.message||'Unable to load the school calendar.'));},[]);

  // Switch the editor to a different saved year without a full round-trip.
  const loadYearIntoEditor=(yearId:string)=>{
    const y = savedYears.find((x:any)=>x.id===yearId);
    if(!y) return;
    setSelectedYearId(yearId);
    setPlan(buildPlanForYear(y, savedTerms, events));
    setMessage(`Loaded ${y.name} into the editor.`);
    setError('');
  };

  const nextTerm=useMemo(()=>{
    const future=plan.terms.filter(t=>t.start && t.start>new Date().toISOString().slice(0,10));
    return future[0] || null;
  },[plan.terms]);

  const suggestedNextYear=nextAcademicYearName(plan.yearName);

  const updateTerm=(i:number,field:'start'|'end',value:string)=>{
    setPlan(p=>{const terms=[...p.terms];terms[i]={...terms[i],[field]:value};return {...p,terms};});
  };

  const updateEval=(ti:number,ei:number,field:'open'|'close',value:string)=>{
    setPlan(p=>{
      const terms=[...p.terms];
      const evals=[...terms[ti].evals];
      evals[ei]={...evals[ei],[field]:value};
      terms[ti]={...terms[ti],evals};
      return {...p,terms};
    });
  };

  function validate():string|null {
    if(!plan.yearName.trim()) return 'Enter the school year.';
    if(!plan.yearStart || !plan.yearEnd) return 'Enter the school opening and closing dates.';
    if(plan.yearEnd<=plan.yearStart) return 'The school closing date must be after the opening date.';

    let previousEnd='';
    for(const term of plan.terms){
      if(!term.start && !term.end) continue;
      if(!term.start || !term.end) return `${term.name}: enter both dates or leave both blank.`;
      if(term.end<term.start) return `${term.name}: the end date must be after the start date.`;
      if(term.start<plan.yearStart || term.end>plan.yearEnd) return `${term.name}: dates must stay inside the school year.`;
      if(previousEnd && term.start<=previousEnd) return `${term.name}: terms must not overlap.`;
      previousEnd=term.end;

      for(let i=0;i<term.evals.length;i++){
        const ev=term.evals[i];
        if(!ev.open&&!ev.close) continue;
        if(!ev.open||!ev.close) return `${term.name}, Evaluation ${i+1}: enter both open and close times.`;
        if(new Date(ev.close)<=new Date(ev.open)) return `${term.name}, Evaluation ${i+1}: close time must be after open time.`;
        const openDay=new Date(ev.open).toISOString().slice(0,10);
        const closeDay=new Date(ev.close).toISOString().slice(0,10);
        if(openDay<term.start||closeDay>term.end) return `${term.name}, Evaluation ${i+1}: the window must stay inside the term.`;
      }
    }
    return null;
  }

  async function save(){
    // Cheap breadcrumb so if the save silently disappears in production the
    // browser console still tells us what happened.
    // eslint-disable-next-line no-console
    console.log('[calendar] save clicked', { yearName: plan.yearName, yearStart: plan.yearStart, yearEnd: plan.yearEnd });

    const v=validate();
    if(v){setError(v);setMessage('');return;}
    setBusy(true);setError('');setMessage('Saving school calendar…');
    try{
      const payload=plan.terms.map(t=>({
        term_number:t.number,start:t.start,end:t.end,
        evaluations:t.evals.map((e,i)=>({
          number:i+1,
          open:e.open?new Date(e.open).toISOString():'',
          close:e.close?new Date(e.close).toISOString():'',
        })),
      }));
      const result=await saveSimpleAcademicCalendar({
        yearName:plan.yearName,
        yearStart:plan.yearStart,
        yearEnd:plan.yearEnd,
        terms:payload,
      });
      // eslint-disable-next-line no-console
      console.log('[calendar] save RPC returned', result);
      try {
        await refresh(result?.academic_year_id || selectedYearId);
      } catch (refreshErr: any) {
        // Save actually persisted; only the reload after failed. Tell the
        // user the save worked so they don't retry (which would just fail
        // the reload again).
        // eslint-disable-next-line no-console
        console.error('[calendar] refresh after save failed', refreshErr);
      }
      setMessage(`Saved. ${result?.terms_saved||0} term(s) and ${result?.evaluation_windows_saved||0} evaluation window(s) are now connected to the school.`);
    }catch(e:any){
      // eslint-disable-next-line no-console
      console.error('[calendar] save failed', e);
      const detail = e?.message || e?.hint || e?.details || (typeof e === 'string' ? e : JSON.stringify(e || {}));
      setError('The calendar could not be saved. ' + (detail || 'Unknown error — check the browser console.'));
      setMessage('');
    }
    finally{setBusy(false);}
  }

  async function createNextYear(){
    if(!suggestedNextYear){setError('Set the current school year first.');return;}
    const nextStart = plan.yearEnd
      ? new Date(new Date(plan.yearEnd+'T00:00:00').getTime()+86400000).toISOString().slice(0,10)
      : '';
    if(!nextStart){setError('The current school year needs a closing date before the next year can be created.');return;}
    if(!window.confirm(`Create ${suggestedNextYear}? Existing student Quran progress stays untouched. You will enter the new year's dates afterwards.`)) return;

    setBusy(true);setError('');setMessage('');
    try{
      const result=await createNextSchoolYear({
        currentYearId: current?.academic_year?.id || current?.academic_year_id,
        yearName:suggestedNextYear,
        yearStart:nextStart,
        yearEnd:new Date(new Date(nextStart+'T00:00:00').getTime()+364*86400000).toISOString().slice(0,10),
      });
      await refresh();
      setMessage(result?.message || `${suggestedNextYear} created. Existing students were not changed.`);
    }catch(e:any){setError(e?.message||'The next school year could not be created.');}
    finally{setBusy(false);}
  }

  async function repair(){
    setBusy(true);setError('');setMessage('');
    try{
      await syncAcademicCalendarState();
      await runCalendarAutomation();
      await refresh();
      setMessage('Calendar synchronised.');
    }catch(e:any){setError(e?.message||'Calendar synchronisation failed.');}
    finally{setBusy(false);}
  }

  return (
    <AdminShell title="School Calendar">
      <div className="space-y-6">
        <section className="rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-950 to-slate-900 p-6 text-white shadow-xl md:p-8">
          <div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">Academic setup</div>
          <h2 className="mt-2 text-3xl font-black md:text-4xl">Set the school dates once.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/80">The school calendar continues year after year: 2025/26 → 2026/27 → 2027/28 → … Each school year has three terms and three evaluations per term. A student's Quran journey continues independently.</p>
        </section>

        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{message}</div>}

        <section className="grid gap-3 md:grid-cols-4">
          {[
            ['School year',plan.yearName||'Not set',`${displayDate(plan.yearStart)} → ${displayDate(plan.yearEnd)}`],
            ['Current term',current?.term?.name||'Not active',`${current?.term?.starts_on||'—'} → ${current?.term?.ends_on||'—'}`],
            ['Quran journey','Continuous','Three terms · three evaluations per term'],
            ['Next term',nextTerm?.name||'—',nextTerm?.start?displayDate(nextTerm.start):'No future date set'],
          ].map(([title,value,sub])=>(
            <div key={title} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">{title}</div>
              <div className="mt-1 text-xl font-black">{value}</div>
              <div className="mt-1 text-xs text-slate-500">{sub}</div>
            </div>
          ))}
        </section>

        {savedYears.length > 1 && (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700">Editing</div>
                <div className="text-base font-black text-slate-900">Pick a school year to view or edit</div>
                <div className="text-xs text-slate-500">All {savedYears.length} configured session{savedYears.length === 1 ? '' : 's'} are listed below the editor.</div>
              </div>
              <select
                className="input h-11 min-w-[220px]"
                value={selectedYearId}
                onChange={e => loadYearIntoEditor(e.target.value)}
              >
                {savedYears.map((y:any) => (
                  <option key={y.id} value={y.id}>
                    {y.name}{y.is_current ? ' · current' : ''} ({displayDate(y.starts_on)} → {displayDate(y.ends_on)})
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700">One place for dates</div>
              <h2 className="mt-1 text-xl font-black text-slate-900">School year calendar</h2>
              <p className="mt-1 text-sm text-slate-500">
                Editing <b>{plan.yearName || 'a new session'}</b>. Change any field and press Save.
              </p>
            </div>
            <button type="button" className="btn btn-primary px-5 py-3" disabled={busy} onClick={save}>{busy?'Saving…':'Save dates'}</button>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <label className="text-xs font-black text-slate-600">School year
              <input className="input mt-1 w-full" value={plan.yearName} onChange={e=>setPlan(p=>({...p,yearName:e.target.value}))} placeholder="2026/27" />
            </label>
            <label className="text-xs font-black text-slate-600">School opens
              <input className="input mt-1 w-full" type="date" value={plan.yearStart} onChange={e=>setPlan(p=>({...p,yearStart:e.target.value}))} />
            </label>
            <label className="text-xs font-black text-slate-600">School closes
              <input className="input mt-1 w-full" type="date" value={plan.yearEnd} onChange={e=>setPlan(p=>({...p,yearEnd:e.target.value}))} />
            </label>
          </div>
        </section>

        <div className="space-y-4">
          {plan.terms.map((term,ti)=>(
            <section key={term.number} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b bg-slate-50 p-5">
                <div className="flex items-center gap-3">
                  <div className={`grid h-11 w-11 place-items-center rounded-2xl font-black ${term.start&&term.end?'bg-emerald-100 text-emerald-800':'bg-slate-200 text-slate-500'}`}>T{term.number}</div>
                  <div>
                    <h2 className="font-black text-slate-900">{term.name}</h2>
                    <div className="mt-0.5 text-xs text-slate-500">{term.start&&term.end?`${displayDate(term.start)} → ${displayDate(term.end)}`:'Dates not configured yet'}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-5 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-black text-slate-600">Term starts<input className="input mt-1 w-full" type="date" value={term.start} onChange={e=>updateTerm(ti,'start',e.target.value)} /></label>
                  <label className="text-xs font-black text-slate-600">Term ends<input className="input mt-1 w-full" type="date" value={term.end} onChange={e=>updateTerm(ti,'end',e.target.value)} /></label>
                </div>
                <div>
                  <div className="mb-3">
                    <div className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Evaluation dates</div>
                    <div className="mt-1 text-xs text-slate-400">Choose the dates. Teachers receive the evaluation work automatically.</div>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-3">
                    {term.evals.map((ev,ei)=>(
                      <div key={ei} className="rounded-2xl border bg-slate-50 p-4">
                        <div className="mb-3 flex items-center justify-between"><span className="text-sm font-black text-slate-800">Evaluation {ei+1}</span>{ev.open&&ev.close&&<span className="text-[10px] font-black text-emerald-700">Set</span>}</div>
                        <label className="block text-[11px] font-bold text-slate-500">Opens<input className="input mt-1 w-full" type="datetime-local" value={ev.open} onChange={e=>updateEval(ti,ei,'open',e.target.value)} /></label>
                        <label className="mt-3 block text-[11px] font-bold text-slate-500">Closes<input className="input mt-1 w-full" type="datetime-local" value={ev.close} min={ev.open||undefined} onChange={e=>updateEval(ti,ei,'close',e.target.value)} /></label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <ConfiguredSessions
          years={savedYears}
          terms={savedTerms}
          events={events}
          selectedYearId={selectedYearId}
          onEdit={loadYearIntoEditor}
        />

        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700">Next school year</div>
          <h2 className="mt-1 text-xl font-black text-emerald-950">Create the next year without moving existing students.</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-emerald-900/75">The new school year is only a calendar. Existing students keep their class, Quran position, evaluations, attendance and payments until they complete their Hifz journey.</p>
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="text-xs font-black uppercase tracking-wide text-slate-500">Suggested next year</div><div className="mt-1 text-xl font-black">{suggestedNextYear||'—'}</div></div>
            <button type="button" className="btn bg-emerald-800 px-5 py-3 font-black text-white" disabled={busy || !suggestedNextYear || !current?.academic_year_id} onClick={createNextYear}>+ Create next school year</button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="font-black text-slate-900">What the system handles automatically</div>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Student Quran journey','Continues from the latest approved evaluation.'],
              ['Terms','Always three terms per school year.'],
              ['Evaluations','Always three per term, in sequence.'],
              ['Completion','100% completion preserves the full record and starts the certificate/alumni workflow.'],
            ].map(([title,text])=><div key={title} className="rounded-2xl bg-slate-50 p-4"><div className="font-black text-emerald-950">{title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{text}</div></div>)}
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-400">Existing database records loaded: {savedTerms.length} terms · {events.length} calendar events.</div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn bg-slate-100 text-slate-800" disabled={busy} onClick={()=>refresh().catch(e=>setError(e?.message||'Refresh failed.'))}>↻ Reload</button>
            <button type="button" className="btn bg-amber-100 text-amber-900" disabled={busy} onClick={repair}>Repair &amp; sync</button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

// Read-only summary of every school session already saved in the database.
// Each session card lists its three terms and the three evaluation windows
// under each term, so the admin can see at a glance what dates are already
// configured for the current year, the next year, and any past years —
// without touching the editor above and risking accidental changes.
function ConfiguredSessions({
  years, terms, events, selectedYearId, onEdit,
}: {
  years: any[]; terms: any[]; events: any[];
  selectedYearId: string;
  onEdit: (yearId: string) => void;
}) {
  if (!years || years.length === 0) return null;

  const displayDay = (v?: string | null) =>
    v ? new Date(v + (v.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric' }) : '—';
  const displayDayTime = (v?: string | null) =>
    v ? new Date(v).toLocaleString('en-NG', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true }) : '—';

  const sorted = [...years].sort((a: any, b: any) =>
    String(b.starts_on || '').localeCompare(String(a.starts_on || '')),
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-slate-50 p-5">
        <div className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700">Already configured</div>
        <h2 className="mt-1 text-xl font-black text-slate-900">All school sessions on record</h2>
        <p className="mt-1 text-sm text-slate-500">{years.length} session{years.length === 1 ? '' : 's'} · click any session to load its dates into the editor above.</p>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        {sorted.map((y: any) => {
          const yTerms = terms.filter((t: any) => t.academic_year_id === y.id).sort((a: any, b: any) => (a.term_number || 0) - (b.term_number || 0));
          const yEvals = events.filter((e: any) => e.academic_year_id === y.id && String(e.event_type || '').startsWith('evaluation_'));
          const isSelected = y.id === selectedYearId;

          return (
            <article key={y.id} className={'rounded-2xl border p-4 ' + (isSelected ? 'border-emerald-500 bg-emerald-50/60' : 'border-slate-200 bg-white')}>
              <header className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-base font-black">{y.name}</div>
                    {y.is_current && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-800">Current</span>}
                    {y.lifecycle_status && !y.is_current && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600">{y.lifecycle_status}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{displayDay(y.starts_on)} → {displayDay(y.ends_on)}</div>
                </div>
                <button type="button" onClick={() => onEdit(y.id)} disabled={isSelected}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-slate-700 hover:border-emerald-400 hover:text-emerald-800 disabled:opacity-40">
                  {isSelected ? 'In editor' : 'Load in editor'}
                </button>
              </header>

              {yTerms.length === 0 ? (
                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">No terms saved for this session yet.</div>
              ) : (
                <ul className="mt-3 space-y-3">
                  {yTerms.map((t: any) => {
                    const tEvals = yEvals
                      .filter((e: any) => e.term_id === t.id)
                      .sort((a: any, b: any) => (a.evaluation_number || 0) - (b.evaluation_number || 0));
                    return (
                      <li key={t.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-black text-slate-800">T{t.term_number} · {t.name}</div>
                          <div className="text-[11px] font-bold text-slate-500">{displayDay(t.starts_on)} → {displayDay(t.ends_on)}</div>
                        </div>
                        <div className="mt-2 grid gap-1 sm:grid-cols-3">
                          {[1,2,3].map(n => {
                            const ev = tEvals.find((e: any) => e.evaluation_number === n);
                            return (
                              <div key={n} className={'rounded-lg border px-2 py-1.5 text-[10px] ' + (ev ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white text-slate-400')}>
                                <div className="font-black uppercase tracking-wide">Eval {n}</div>
                                {ev ? (
                                  <>
                                    <div className="mt-0.5 text-slate-600">Opens: {displayDayTime(ev.starts_at)}</div>
                                    <div className="text-slate-600">Closes: {displayDayTime(ev.ends_at)}</div>
                                  </>
                                ) : (
                                  <div className="mt-0.5">Not set</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
