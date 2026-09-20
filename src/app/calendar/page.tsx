'use client';

import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import {
  loadSchoolCalendarConfig,
  loadCurrentAcademicTerm,
  saveSimpleAcademicCalendar,
  syncAcademicCalendarState,
  runCalendarAutomation,
  loadDigitalLaunchReadiness,
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
  const match = value.trim().match(/^(\d{4})(?:[/-])(\d{2,4})$/);
  if (!match) return '';
  const start = Number(match[1]);
  const end = Number(match[2]);
  const endYear = end < 100 ? Math.floor(start / 100) * 100 + end : end;
  const nextStart = start + 1;
  const nextEnd = endYear + 1;
  const suffix = String(nextEnd).slice(-2);
  return `${nextStart}/${suffix}`;
}

export default function CalendarAdmin() {
  const [plan,setPlan]=useState<YearPlan>(blankPlan());
  const [current,setCurrent]=useState<any>(null);
  const [savedTerms,setSavedTerms]=useState<any[]>([]);
  const [events,setEvents]=useState<any[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [readiness,setReadiness]=useState<any>(null);

  const refresh=async()=>{
    setError('');
    const [cfg,cur,launchReadiness]=await Promise.all([
      loadSchoolCalendarConfig(),
      loadCurrentAcademicTerm(),
      loadDigitalLaunchReadiness().catch(()=>null),
    ]);
    setCurrent(cur);
    setReadiness(launchReadiness);
    setSavedTerms(cfg.terms);
    setEvents(cfg.events);
    const year=cfg.years.find((y:any)=>y.is_current) || cfg.years[0];
    const yearTerms=(cfg.terms||[]).filter((t:any)=>t.academic_year_id===year?.id);
    const yearEvents=(cfg.events||[]).filter((e:any)=>e.academic_year_id===year?.id);
    if(year){
      setPlan({
        yearName:year.name || '',
        yearStart:year.starts_on || '',
        yearEnd:year.ends_on || '',
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
      });
    }
  };

  useEffect(()=>{refresh().catch(e=>setError(e?.message||'Unable to load the school calendar.'));},[]);

  const nextTerm=useMemo(()=>{
    const today=new Date().toISOString().slice(0,10);
    return plan.terms.find(t=>t.start && t.start>today) || null;
  },[plan.terms]);

  const activeYear = (plan.yearName || current?.academic_year?.name || '').trim();
  const suggestedNextYear = nextAcademicYearName(activeYear);

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
    if(!plan.yearName.trim()) return 'Enter the academic session name.';
    if(!plan.yearStart || !plan.yearEnd) return 'Enter the session opening and closing dates.';
    if(plan.yearEnd<=plan.yearStart) return 'The session closing date must be after the opening date.';
    let previousEnd='';
    for(const term of plan.terms){
      if(!term.start && !term.end) continue;
      if(!term.start || !term.end) return `${term.name}: enter both start and end dates, or leave both blank.`;
      if(term.end<term.start) return `${term.name}: the end date must be after the start date.`;
      if(term.start<plan.yearStart || term.end>plan.yearEnd) return `${term.name}: dates must stay inside the academic session.`;
      if(previousEnd && term.start<=previousEnd) return `${term.name}: terms must not overlap.`;
      previousEnd=term.end;
      for(let i=0;i<term.evals.length;i++){
        const ev=term.evals[i];
        if(!ev.open && !ev.close) continue;
        if(!ev.open || !ev.close) return `${term.name}, Evaluation ${i+1}: enter both open and close times.`;
        if(new Date(ev.close)<=new Date(ev.open)) return `${term.name}, Evaluation ${i+1}: close time must be after open time.`;
        const openDay=new Date(ev.open).toISOString().slice(0,10);
        const closeDay=new Date(ev.close).toISOString().slice(0,10);
        if(openDay<term.start || closeDay>term.end) return `${term.name}, Evaluation ${i+1}: the evaluation window must fall inside the term dates.`;
      }
    }
    return null;
  }

  async function saveCurrentYear(){
    const validation=validate();
    if(validation){setError(validation);setMessage('');return;}
    setBusy(true);setError('');setMessage('');
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
      await refresh();
      setMessage(`Academic calendar saved. ${result?.terms_saved||0} term(s) and ${result?.evaluation_windows_saved||0} evaluation window(s) are now driving the school.`);
    }catch(e:any){setError(e?.message||'Calendar could not be saved.');}
    finally{setBusy(false);}
  }

  async function repair(){
    setBusy(true);setError('');setMessage('');
    try{
      await syncAcademicCalendarState();
      await runCalendarAutomation();
      await refresh();
      setMessage('Calendar synchronised. The school schedule and due evaluation windows have been refreshed.');
    }catch(e:any){setError(e?.message||'Calendar synchronisation failed.');}
    finally{setBusy(false);}
  }

  async function prepareNextYear(){
    if(!suggestedNextYear){setError('Set the current academic year in the calendar first.');return;}
    if(!window.confirm(`Create ${suggestedNextYear} as the next school year? Existing students and their Quran progress stay untouched.`)) return;
    setBusy(true);setError('');setMessage('');
    try{
      const currentEnd = plan.yearEnd;
      const nextStart = currentEnd ? new Date(new Date(currentEnd+'T00:00:00').getTime()+24*60*60*1000).toISOString().slice(0,10) : '';
      const result = await saveSimpleAcademicCalendar({
        yearName:suggestedNextYear,
        yearStart:nextStart,
        yearEnd:'',
        terms:[
          {term_number:1,start:'',end:'',evaluations:[{number:1,open:'',close:''},{number:2,open:'',close:''},{number:3,open:'',close:''}]},
          {term_number:2,start:'',end:'',evaluations:[{number:1,open:'',close:''},{number:2,open:'',close:''},{number:3,open:'',close:''}]},
          {term_number:3,start:'',end:'',evaluations:[{number:1,open:'',close:''},{number:2,open:'',close:''},{number:3,open:'',close:''}]},
        ],
      });
      await refresh();
      setMessage(`${suggestedNextYear} was created as the next school year. Existing students continue on their own Quran journey; nothing was moved or reset. ${result?.terms_saved||0} term(s) were prepared.`);
    }catch(e:any){setError(e?.message||'The next academic year could not be created.');}
    finally{setBusy(false);}
  }

  return (
    <AdminShell title="School Calendar">
      <div className="space-y-6">
        <section className="rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-950 to-slate-900 p-6 text-white shadow-xl md:p-8">
          <div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">Academic setup</div>
          <h2 className="mt-2 text-3xl font-black md:text-4xl">Set the school dates once.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/80">
            The school already knows the Hifz programme is two years with three terms and three evaluations per term. Here you only maintain the dates. Student Quran progress continues independently until completion.
          </p>
        </section>

        {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">{error}</div>}
        {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{message}</div>}

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border bg-white p-4 shadow-sm md:col-span-1">
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">School year</div>
            <div className="mt-1 text-xl font-black">{plan.yearName || 'Not set'}</div>
            <div className="mt-1 text-xs text-slate-500">{displayDate(plan.yearStart)} → {displayDate(plan.yearEnd)}</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Current term</div>
            <div className="mt-1 text-xl font-black">{current?.term?.name || 'Not active'}</div>
            <div className="mt-1 text-xs text-slate-500">{current?.term?.starts_on || '—'} → {current?.term?.ends_on || '—'}</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Hifz programme</div>
            <div className="mt-1 text-xl font-black">2 years</div>
            <div className="mt-1 text-xs text-slate-500">3 terms · 3 evaluations per term</div>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Next term</div>
            <div className="mt-1 text-xl font-black">{nextTerm?.name || '—'}</div>
            <div className="mt-1 text-xs text-slate-500">{nextTerm?.start ? displayDate(nextTerm.start) : 'No future date set'}</div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700">One place for dates</div>
              <h2 className="mt-1 text-xl font-black text-slate-900">School year</h2>
              <p className="mt-1 text-sm text-slate-500">Do not create or edit programme structures here. The Hifz structure is already built in.</p>
            </div>
            <button className="btn btn-primary px-5 py-3" disabled={busy} onClick={saveCurrentYear}>{busy?'Saving…':'Save dates'}</button>
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
          {plan.terms.map((term,ti)=>{
            const configured=Boolean(term.start&&term.end);
            return (
              <section key={term.number} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b bg-slate-50 p-5">
                  <div className="flex items-center gap-3">
                    <div className={`grid h-11 w-11 place-items-center rounded-2xl font-black ${configured?'bg-emerald-100 text-emerald-800':'bg-slate-200 text-slate-500'}`}>T{term.number}</div>
                    <div>
                      <h2 className="font-black text-slate-900">{term.name}</h2>
                      <div className="mt-0.5 text-xs text-slate-500">{configured?`${displayDate(term.start)} → ${displayDate(term.end)}`:'Dates not configured yet'}</div>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${configured?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{configured?'Configured':'Not set'}</span>
                </div>

                <div className="space-y-5 p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-black text-slate-600">Term starts
                      <input className="input mt-1 w-full" type="date" value={term.start} onChange={e=>updateTerm(ti,'start',e.target.value)} />
                    </label>
                    <label className="text-xs font-black text-slate-600">Term ends
                      <input className="input mt-1 w-full" type="date" value={term.end} onChange={e=>updateTerm(ti,'end',e.target.value)} />
                    </label>
                  </div>

                  <div>
                    <div className="mb-3">
                      <div className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Evaluation dates</div>
                      <div className="mt-1 text-xs text-slate-400">The admin only chooses the dates. Teachers receive the work automatically when a window opens.</div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-3">
                      {term.evals.map((ev,ei)=>(
                        <div key={ei} className="rounded-2xl border bg-slate-50 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-sm font-black text-slate-800">Evaluation {ei+1}</span>
                            {ev.open&&ev.close && <span className="text-[10px] font-black text-emerald-700">Set</span>}
                          </div>
                          <label className="block text-[11px] font-bold text-slate-500">Opens
                            <input className="input mt-1 w-full" type="datetime-local" value={ev.open} onChange={e=>updateEval(ti,ei,'open',e.target.value)} />
                          </label>
                          <label className="mt-3 block text-[11px] font-bold text-slate-500">Closes
                            <input className="input mt-1 w-full" type="datetime-local" value={ev.close} min={ev.open||undefined} onChange={e=>updateEval(ti,ei,'close',e.target.value)} />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-700">New school year</div>
          <h2 className="mt-1 text-xl font-black text-emerald-950">Start the next year without touching existing students.</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-emerald-900/75">
            When this school year ends, create the next school year here. Existing students keep their current Quran progress and continue until they finish; new admissions join the new year.
          </p>
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-slate-500">Suggested next school year</div>
              <div className="mt-1 text-xl font-black text-slate-900">{suggestedNextYear || 'Set the current school year first'}</div>
            </div>
            <button className="btn bg-emerald-800 px-5 py-3 font-black text-white" disabled={busy || !suggestedNextYear} onClick={prepareNextYear}>+ Create next school year</button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="font-black text-slate-900">What the system handles automatically</div>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Student Quran journey','Continues from the latest approved evaluation.'],
              ['Terms','Always 3 terms per school year.'],
              ['Evaluations','Always 3 per term, in sequence.'],
              ['Completion','100% Quran completion triggers the completion workflow and preserves the full history.'],
            ].map(([title,text])=>(
              <div key={title} className="rounded-2xl bg-slate-50 p-4">
                <div className="font-black text-emerald-950">{title}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{text}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-400">Existing database records loaded: {savedTerms.length} terms · {events.length} calendar events.</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn bg-slate-100 text-slate-800" disabled={busy} onClick={()=>refresh().catch(e=>setError(e?.message||'Refresh failed.'))}>↻ Reload</button>
            <button className="btn bg-amber-100 text-amber-900" disabled={busy} onClick={repair}>Repair &amp; sync</button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
