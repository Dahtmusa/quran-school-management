'use client';
import { loadCMSSettings } from '@/lib/cms-live-store';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import MemorizationBadge from '@/components/MemorizationBadge';
import { getCurrentProfile, loadEvaluations, loadOperationalTerms, loadStudents, loadParentStudents, loadTermCompletions, completeTerm, loadCurrentAcademicTerm } from '@/lib/live-store';
import { useEffect, useMemo, useState } from 'react';
import { label, absoluteProgress, remainingFrom, pageForPosition, juzForPosition, hizbForPosition } from '@/lib/quran';
import QRCode from 'qrcode';

export default function Reports(){
 const [settings,setSettings]=useState<any>({});
 const [students,setStudents]=useState<any[]>([]);
 const [evals,setEvals]=useState<any[]>([]);
 const [terms,setTerms]=useState<any[]>([]);
 const [completed,setCompleted]=useState<any[]>([]);
 const [termId,setTermId]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [selected,setSelected]=useState<any|null>(null);
 const [role,setRole]=useState('');

 const refresh=async()=>{
   const p=await getCurrentProfile();
   const [s,e,t,c,st,cur]=await Promise.all([p?.role==='parent'?loadParentStudents():loadStudents(),loadEvaluations(),loadOperationalTerms(),loadTermCompletions(),loadCMSSettings(),loadCurrentAcademicTerm()]);
   setRole(p?.role||'');setStudents(s);setEvals(e);setTerms(t);setCompleted(c);setSettings(st);
   if(!termId)setTermId(cur?.term_id||t[0]?.id||'');
 };
 useEffect(()=>{refresh()},[]);

 const term=terms.find(t=>t.id===termId);
 const termName=term?.name||'Term';
 const rows=students.map(s=>{
   const es=evals.filter(e=>e.studentId===s.id&&e.term===termName);
   return {...s,es,approved:es.filter(e=>e.status==='Approved').length,ready:es.filter(e=>e.status==='Approved').length===3};
 });
 const ready=rows.filter(s=>s.ready);
 const isComplete=completed.some(c=>c.term_id===termId);

 async function markComplete(){
   if(!termId)return;
   if(!confirm(`Complete ${termName}? All active students must have 3 approved evaluations.`))return;
   setBusy(true);
   try{const r:any=await completeTerm(termId);setMessage(`Term completed. ${r?.report_cards_generated||0} report cards finalized and ${r?.next_term_invoices_generated||0} next-term invoices generated.`);await refresh()}
   catch(e:any){setMessage(e?.message||'Term cannot be completed yet.')}
   finally{setBusy(false)}
 }

 return <AdminShell title="Report Cards"><div className="space-y-6">
  <section className="rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-[#9d7621] p-6 text-white shadow-xl md:p-8">
    <div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">Official academic records</div>
    <h2 className="mt-2 text-3xl font-black md:text-4xl">Beautiful reports, generated from approved evidence.</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/80">Evaluation 1, 2 and 3 remain visible as a complete term trail. Once Admin completes the term, each student receives a finalized report card.</p>
  </section>
  {message&&<div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{message}</div>}
  <section className="card p-5"><div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <label className="block flex-1 text-xs font-black uppercase tracking-wide text-slate-500">Operational term<select className="input mt-1" value={termId} onChange={e=>setTermId(e.target.value)}><option value="">Select term</option>{terms.map(t=><option key={t.id} value={t.id}>{t.academic_years?.name||'Academic year'} · {t.name} · {t.starts_on} → {t.ends_on}</option>)}</select></label>
    <div className="flex gap-2"><span className={`pill ${isComplete?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-800'}`}>{isComplete?'Term completed':'Term in progress'}</span>{role!=='parent'&&<button className="btn btn-primary" disabled={!termId||busy||isComplete} onClick={markComplete}>{isComplete?'Completed':'Mark term complete'}</button>}</div>
  </div></section>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Students" value={rows.length}/><Kpi label="Ready for report" value={ready.length}/><Kpi label="Blocked" value={Math.max(0,rows.length-ready.length)}/><Kpi label="Approved evaluations" value={rows.reduce((n,s)=>n+s.approved,0)}/></div>
  <section className="card overflow-hidden">
    <div className="border-b p-5"><h2 className="text-xl font-black">Term progress at a glance</h2><p className="text-sm text-slate-500">Pending or returned evaluations never become official report-card data.</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm">
      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="p-4">Student</th><th>Class</th><th>Qur'an position</th><th>Eval 1</th><th>Eval 2</th><th>Eval 3</th><th>Report</th><th/></tr></thead>
      <tbody>{rows.map(s=><tr key={s.id} className="border-t">
        <td className="p-4"><div className="flex items-center gap-3">
          <div className="h-10 w-10 overflow-hidden rounded-xl bg-slate-100">{s.photoUrl?<img src={s.photoUrl} className="h-full w-full object-cover" alt=""/>:<div className="grid h-full place-items-center font-black text-slate-400">{s.name.charAt(0)}</div>}</div>
          <div><b>{s.name}</b><div className="text-xs text-slate-500">{s.admissionNo}</div></div>
        </div></td>
        <td><div>{s.className||'Unassigned'}</div><SectionBadge section={s.section}/></td>
        <td><b className="text-emerald-800">{label(s.current)}</b><div className="text-xs text-slate-500">{s.year}</div></td>
        {[1,2,3].map(n=>{const e=s.es.find((x:any)=>x.number===n);return <td key={n}>{e?<Status status={e.status} score={e.score}/>:<Status status="Not created"/>}</td>})}
        <td><span className={`pill ${s.ready?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{s.ready?'Finalized':'Blocked'}</span></td>
        <td><button className="btn bg-slate-100" onClick={()=>setSelected(s)}>View report</button></td>
      </tr>)}</tbody>
    </table></div>
  </section>
  {selected&&<ReportPreview student={selected} term={term} terms={terms} settings={settings} close={()=>setSelected(null)}/>}
 </div></AdminShell>
}

function Kpi({label,value}:{label:string,value:number}){return <div className="card p-5"><div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-2 text-3xl font-black">{value}</div></div>}
function Status({status,score}:{status:string;score?:number}){const cls=status==='Approved'?'bg-emerald-50 text-emerald-700':status==='Pending Approval'?'bg-amber-50 text-amber-700':status==='Returned'?'bg-rose-50 text-rose-700':'bg-slate-100 text-slate-500';return <span className={`pill ${cls}`}>{status}{score!=null?` · ${score}%`:''}</span>}

function ReportPreview({student,term,terms,settings,close}:{student:any;term:any;terms:any[];settings:any;close:()=>void}){
  const approved=student.es.filter((e:any)=>e.status==='Approved');
  const avgScore=approved.length>0?Math.round(approved.reduce((s:number,e:any)=>s+e.score,0)/approved.length):null;
  const finalStatus=avgScore===null?null:avgScore>=90?'Excellent':avgScore>=75?'Very Good':avgScore>=60?'Satisfactory':'Needs Improvement';
  const termLabel=`${term?.academic_years?.name||''} · ${term?.name||''}`;
  const absProgress=absoluteProgress(student.current,student.direction);
  const remaining=remainingFrom(student.current,student.direction);
  const mushafPage=pageForPosition(student.current);
  const currentJuz=juzForPosition(student.current);
  const currentHizb=hizbForPosition(student.current);

  // Auto-detect next term: earliest term whose starts_on is after current term's ends_on
  const nextTerm=term?.ends_on
    ? [...terms].sort((a,b)=>a.starts_on.localeCompare(b.starts_on)).find(t=>t.starts_on>term.ends_on)
    : null;
  const autoNextDate=nextTerm?.starts_on||'';

  const feeKey=`amqm-report-fees-${term?.id||''}`;

  const [qrUrl,setQrUrl]=useState('');
  const [nextTermDate,setNextTermDate]=useState('');
  const [dayFee,setDayFee]=useState('');
  const [boardingFee,setBoardingFee]=useState('');

  // Load persisted fees on mount; set next-term date from DB or localStorage override
  useEffect(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem(feeKey)||'{}');
      if(saved.dayFee!==undefined)setDayFee(saved.dayFee);
      if(saved.boardingFee!==undefined)setBoardingFee(saved.boardingFee);
      setNextTermDate(saved.nextTermDate??autoNextDate);
    }catch{
      setNextTermDate(autoNextDate);
    }
  },[feeKey,autoNextDate]);

  // Persist fee fields and date override whenever they change
  useEffect(()=>{
    try{localStorage.setItem(feeKey,JSON.stringify({dayFee,boardingFee,nextTermDate}));}catch{}
  },[feeKey,dayFee,boardingFee,nextTermDate]);

  useEffect(()=>{
    const statusText=approved.length===3&&finalStatus?`Final status: ${finalStatus}`:'Evaluations incomplete';
    QRCode.toDataURL(
      `AMQM STUDENT RECORD\nADMISSION NO: ${student.admissionNo}\nNAME: ${student.name}\nTERM: ${termLabel}\n${statusText}`,
      {width:140,margin:1,color:{dark:'#062d2a',light:'#ffffff'}}
    ).then(setQrUrl).catch(()=>{});
  },[student,term,finalStatus]);

  const isBoarder=student.section==='Boarding';
  const applicableFee=isBoarder?boardingFee:dayFee;

  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/60 p-4">
    <div className="mx-auto my-5 w-full max-w-4xl rounded-3xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b p-5">
        <div><div className="text-xs font-black uppercase tracking-wider text-emerald-700">Official report card</div><h2 className="text-xl font-black">{student.name}</h2></div>
        <div className="flex gap-2">
          <button className="btn bg-slate-100" onClick={close}>Close</button>
          <button className="btn btn-primary" onClick={()=>window.print()}>Print report</button>
        </div>
      </div>

      {/* Next term fields — saved per term in localStorage */}
      <div className="border-b bg-amber-50 px-6 py-3">
        <div className="text-xs font-black uppercase tracking-wide text-amber-800 mb-2">Fill before printing — saved for this term</div>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs font-bold text-amber-900">Next term starts<input className="input mt-1 w-44" type="date" value={nextTermDate} onChange={e=>setNextTermDate(e.target.value)}/></label>
          <label className="text-xs font-bold text-amber-900">Day fee (₦)<input className="input mt-1 w-32" type="number" value={dayFee} onChange={e=>setDayFee(e.target.value)} placeholder="0"/></label>
          <label className="text-xs font-bold text-amber-900">Boarding fee (₦)<input className="input mt-1 w-32" type="number" value={boardingFee} onChange={e=>setBoardingFee(e.target.value)} placeholder="0"/></label>
        </div>
      </div>

      <div id="report-print" className="p-6 md:p-10">
        {/* Header */}
        <div className="flex items-center gap-5 border-b-2 border-emerald-900 pb-5">
          {settings.logo_url?.value&&<img src={settings.logo_url.value} className="h-16 w-16 rounded-2xl object-cover" alt=""/>}
          <div className="flex-1">
            <div className="text-xs font-black uppercase tracking-[.18em] text-amber-700">{settings.short_name?.value||'AMQM'}</div>
            <div className="text-2xl font-black text-emerald-950">{settings.school_name?.value}</div>
            <div className="text-xs text-slate-500">{settings.contact?.address||''}</div>
          </div>
          {qrUrl&&<div className="text-center"><img src={qrUrl} alt="QR code" className="h-24 w-24 rounded-xl"/><div className="mt-1 text-[10px] text-slate-400">Scan to verify</div></div>}
        </div>

        {/* Student header */}
        <div className="mt-6 flex items-start gap-5">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-emerald-200 bg-slate-100">
            {student.photoUrl?<img src={student.photoUrl} className="h-full w-full object-cover" alt=""/>:<div className="grid h-full place-items-center text-3xl font-black text-slate-300">{student.name.charAt(0)}</div>}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black">{student.name}</h3>
              <SectionBadge section={student.section}/>
              <MemorizationBadge direction={student.direction}/>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-2"><div className="text-[10px] text-slate-400 uppercase tracking-wide">ADMISSION NO.</div><div className="mt-0.5 text-sm font-black">{student.admissionNo?.toUpperCase()}</div></div>
              <div className="rounded-xl bg-slate-50 p-2"><div className="text-[10px] text-slate-400 uppercase tracking-wide">CLASS</div><div className="mt-0.5 text-sm font-black">{student.className||'Unassigned'}</div></div>
              <div className="rounded-xl bg-slate-50 p-2"><div className="text-[10px] text-slate-400 uppercase tracking-wide">TERM</div><div className="mt-0.5 text-sm font-black">{termLabel}</div></div>
            </div>
          </div>
        </div>

        {/* Hifz Journey */}
        <div className="mt-6 rounded-2xl bg-emerald-950 p-5 text-white">
          <div className="text-[10px] font-bold uppercase tracking-[.22em] text-amber-300">Hifz Journey</div>
          <div className="mt-2 text-2xl font-black">{label(student.current)}</div>
          <div className="mt-1 text-sm text-emerald-200/70">Started at {label(student.start)} · {student.direction}</div>
          <div className="mt-4">
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-amber-300" style={{width:`${absProgress.percent.toFixed(1)}%`}}/>
            </div>
            <div className="mt-2 flex justify-between text-xs text-emerald-100/70">
              <span>{absProgress.percent.toFixed(1)}% of the Qur'an · {absProgress.hizbs} / 60 Hizb</span>
              <span>{remaining.ayahs.toLocaleString()} ayahs left</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([['AYAHS MEMORIZED',absProgress.ayahs.toLocaleString()],['PAGES MEMORIZED',String(absProgress.pages)],['HIZB MEMORIZED',`${absProgress.hizbs} / 60`],['MUSHAF PAGE',`${mushafPage} / 604`]] as [string,string][]).map(([k,v])=>(
              <div key={k} className="rounded-xl bg-white/8 p-3">
                <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-300/70">{k}</div>
                <div className="mt-1 text-base font-black">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([['AYAHS REMAINING',remaining.ayahs.toLocaleString()],['PAGES REMAINING',String(remaining.pages)],['HIZB REMAINING',String(remaining.hizbs)],['CURRENT JUZ / HIZB',`${currentJuz} / ${currentHizb}`]] as [string,string][]).map(([k,v])=>(
              <div key={k} className="rounded-xl bg-amber-400/10 p-3">
                <div className="text-[9px] font-bold uppercase tracking-wider text-amber-300/70">{k}</div>
                <div className="mt-1 text-base font-black text-amber-200">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-emerald-200/50">{student.year} · Teacher: {student.teacher||'Unassigned'}</div>
        </div>

        {/* Evaluations */}
        <div className="mt-6">
          <h3 className="text-lg font-black">Term evaluations</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {[1,2,3].map(n=>{const e=student.es.find((x:any)=>x.number===n);return <div className="rounded-2xl border p-4" key={n}><div className="flex justify-between"><b>Evaluation {n}</b><Status status={e?.status||'Not created'} score={e?.score}/></div>
            {e&&<div className="mt-3 space-y-2 text-sm text-slate-600">
              <div>Memorized: <b>{e.memorizedAyahs||0} ayahs · {e.memorizedPages||0} pages</b></div>
              <div className="grid grid-cols-5 gap-1 text-center text-[11px]">
                {[['Mem',e.memorization],['Acc',e.accuracy],['Flu',e.fluency],['Taj',e.tajweed],['Ret',e.retention]].map(([lbl,val])=><div key={String(lbl)} className="rounded-lg bg-slate-50 p-1"><div className="text-slate-400">{lbl}</div><div className="font-black text-emerald-800">{val}/5</div></div>)}
              </div>
              {e.grade&&<div className="text-xs font-black text-emerald-700">{e.grade}</div>}
            </div>}
          </div>;})}
          </div>
        </div>

        {/* Final status */}
        {approved.length===3&&finalStatus&&<div className={`mt-5 flex items-center justify-between rounded-2xl p-4 ${finalStatus==='Excellent'?'bg-emerald-50':finalStatus==='Very Good'?'bg-blue-50':finalStatus==='Satisfactory'?'bg-amber-50':'bg-rose-50'}`}>
          <div><div className="text-xs font-black uppercase tracking-wide text-slate-500">Final term status</div><div className={`mt-1 text-2xl font-black ${finalStatus==='Excellent'?'text-emerald-800':finalStatus==='Very Good'?'text-blue-800':finalStatus==='Satisfactory'?'text-amber-800':'text-rose-800'}`}>{finalStatus}</div><div className="text-sm text-slate-500">Average score: {avgScore}%</div></div>
          <div className="text-4xl">{finalStatus==='Excellent'?'🏆':finalStatus==='Very Good'?'⭐':finalStatus==='Satisfactory'?'👍':'📚'}</div>
        </div>}

        {/* Attendance */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">Attendance</div><div className="mt-1 text-sm font-semibold">{student.attendance}%</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">Class</div><div className="mt-1 text-sm font-semibold">{student.className||'Unassigned'}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">Section</div><div className="mt-1"><SectionBadge section={student.section}/></div></div>
        </div>

        {/* Next term */}
        {(nextTermDate||applicableFee)&&<div className="mt-5 rounded-2xl border-2 border-dashed border-emerald-300 p-4">
          <div className="text-xs font-black uppercase tracking-wide text-emerald-700 mb-2">Next term information</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {nextTermDate&&<div className="rounded-xl bg-emerald-50 p-3"><div className="text-xs text-slate-400">Resumption date</div><div className="mt-1 text-sm font-black">{new Date(nextTermDate).toLocaleDateString('en-NG',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div></div>}
            {applicableFee&&<div className="rounded-xl bg-amber-50 p-3"><div className="text-xs text-slate-400">Next term fee ({student.section})</div><div className="mt-1 text-sm font-black">₦{Number(applicableFee).toLocaleString()}</div></div>}
          </div>
        </div>}

        <div className="mt-8 border-t pt-5 text-xs text-slate-400">Only approved evaluations are official. This report preserves the complete term trail. Printed on {new Date().toLocaleDateString('en-NG')}.</div>
      </div>
    </div>
  </div>
}

function Info({k,v}:{k:string,v:string}){return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">{k}</div><div className="mt-1 text-sm font-semibold text-slate-900">{v}</div></div>}
