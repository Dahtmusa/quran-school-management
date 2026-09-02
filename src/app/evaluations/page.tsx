'use client';
import AdminShell from '@/components/AdminShell';
import QuranProgress from '@/components/QuranProgress';
import {automatedComment,calculateEvaluation,Evaluation,Rubric,Student} from '@/lib/data';
import {loadEvaluations,loadStudents} from '@/lib/live-store';import {createClient} from '@/lib/supabase/client';
import {SURAHS,Position,label,pageForPosition,hizbForPosition} from '@/lib/quran';
import {useEffect,useMemo,useState} from 'react';

const rubrics=[1,2,3,4,5] as Rubric[];
const rubricText=(n:number)=>['Needs significant support','Developing','Satisfactory','Strong','Excellent'][n-1];

type Term='Term 1'|'Term 2'|'Term 3';

export default function Evaluations(){
 const [items,setItems]=useState<Evaluation[]>([]);
 const [studentList,setStudentList]=useState<Student[]>([]);
 const [studentId,setStudentId]=useState('');
 const [term,setTerm]=useState<Term>('Term 1');
 const [number,setNumber]=useState<1|2|3>(1);
 const [selectedId,setSelectedId]=useState('');
 const [to,setTo]=useState<Position>({surah:2,ayah:1});
 const [memorization,setMem]=useState<Rubric>(4),[fluency,setFlu]=useState<Rubric>(4),[tajweed,setTaj]=useState<Rubric>(4);
 useEffect(()=>{loadEvaluations().then(setItems);loadStudents().then(s=>{setStudentList(s);if(s[0])setStudentId(s[0].id)})},[]);
 const student=studentList.find(s=>s.id===studentId);
 const selected=items.find(e=>e.id===selectedId);
 const current=student?.current ?? {surah:2,ayah:1};
 const locked=!!selected && selected.status==='Approved';
 const submitted=!!selected && selected.status==='Pending Approval';
 useEffect(()=>{
   if(selected){
     setStudentId(selected.studentId); setTerm(selected.term as Term); setNumber(selected.number as 1|2|3); setTo(selected.to); setMem(selected.memorization); setFlu(selected.fluency); setTaj(selected.tajweed);
   } else if(student){ setTo(student.current); setMem(4); setFlu(4); setTaj(4); }
 },[selectedId,student?.id]);
 const from=selected?.from ?? current;
 const calc=useMemo(()=>calculateEvaluation(from,to,student?.direction||'Baqarah-to-Nas'),[from,to,student?.direction]);
 const comment=automatedComment(memorization,fluency,tajweed);
 const score=Math.round(((memorization+fluency+tajweed)/15)*100);
 const direction=student?.direction || 'Baqarah-to-Nas';
 const ordinal=(p:Position)=>SURAHS.slice(0,p.surah-1).reduce((n,s)=>n+s.ayahs,0)+p.ayah;
 const validStop=direction==='Baqarah-to-Nas'?ordinal(to)>ordinal(from):ordinal(to)<ordinal(from);

 const chooseEvaluation=(id:string)=>{setSelectedId(id);};
 const clearBuilder=()=>{setSelectedId('');if(student){setTo(student.current);setMem(4);setFlu(4);setTaj(4)}};
 const updateStatus=async (id:string,status:Evaluation['status'])=>{
   const db=createClient(); const nextDbStatus=status==='Approved'?'approved':status==='Returned'?'returned':'pending_approval';
   const user=(await db.auth.getUser()).data.user; if(!user){alert('Please sign in again.');return;}
   const patch:any={status:nextDbStatus}; if(status==='Approved'){patch.approved_by=user.id;patch.approved_at=new Date().toISOString();}
   const {error}=await db.from('evaluations').update(patch).eq('id',id); if(error){alert(error.message);return;}
   const next=await loadEvaluations(); setItems(next); const nextStudents=await loadStudents(); setStudentList(nextStudents);
 };
 const submit=async()=>{
   if(!student)return;
   if(!validStop){alert(`The stopping position must move ${direction==='Baqarah-to-Nas'?'forward':'backward'} from the student's current official position.`);return;}
   const existing=items.find(e=>e.studentId===student.id&&e.term===term&&e.number===number);
   if(existing && !['Draft','Returned'].includes(existing.status)){alert(`Evaluation ${number} for ${student.name} already has status: ${existing.status}. It cannot be overwritten.`);return;}
   const base:Evaluation={
     id:existing?.id || 'EV-'+Date.now(),studentId:student.id,student:student.name,term,number,status:'Pending Approval',from,to,
     ...calculateEvaluation(from,to,direction),memorization,fluency,tajweed,score,comment
   };
   const db=createClient(); const user=(await db.auth.getUser()).data.user; if(!user){alert('Please sign in again.');return;}
   const {data:defs}=await db.from('program_term_definitions').select('id,term_number').eq('term_number',Number(term.split(' ')[1])).limit(1);
   const termDefinitionId=defs?.[0]?.id; if(!termDefinitionId){alert('The selected programme term definition is not available in the database yet.');return;}
   const payload:any={student_id:student.id,teacher_id:user.id,term_definition_id:termDefinitionId,evaluation_number:number,status:'pending_approval',score,tajweed_score:tajweed,fluency_score:fluency,accuracy_score:memorization,teacher_comment:comment,submitted_at:new Date().toISOString(),from_surah:from.surah,from_ayah:from.ayah,to_surah:to.surah,to_ayah:to.ayah,memorized_ayahs:calc.memorizedAyahs,memorized_pages:calc.memorizedPages,memorized_hizbs:calc.memorizedHizbs};
   if(existing){const {error}=await db.from('evaluations').update(payload).eq('id',existing.id);if(error){alert(error.message);return;}setSelectedId(existing.id);}else{const {data,error}=await db.from('evaluations').insert(payload).select('id').single();if(error){alert(error.message);return;}setSelectedId(data.id);}
   setItems(await loadEvaluations()); alert('Submitted to Admin. Official Quran progress and report-card eligibility remain unchanged until Admin approval.');
 };
 return <AdminShell title="Quran Evaluations">
  <div className="grid gap-4 md:grid-cols-4">
   <Stat label="Formal evaluations / term" value="3" sub="Evaluation 1 · 2 · 3"/>
   <Stat label="Pending approval" value={String(items.filter(e=>e.status==='Pending Approval').length)} sub="Excluded from reports"/>
   <Stat label="Approved" value={String(items.filter(e=>e.status==='Approved').length)} sub="Official progress records"/>
   <Stat label="Returned" value={String(items.filter(e=>e.status==='Returned').length)} sub="Teacher correction required"/>
  </div>

  <div className="card mt-6 p-5">
   <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">Approval queue</h2><p className="text-xs text-slate-500">Only approved evaluations can update the student's official stage or appear on a report card.</p></div><button className="btn btn-green" onClick={clearBuilder}>+ New evaluation</button></div>
   <div className="mt-4 space-y-3">{items.map(e=><div className="flex flex-col gap-3 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between" key={e.id}><div><div className="font-semibold">{e.student}</div><div className="text-xs text-slate-500">{e.term} · Evaluation {e.number} · {label(e.from)} → {label(e.to)} · {e.score}%</div><div className="mt-1 text-xs text-slate-500">Memorized: {e.memorizedAyahs} ayahs · {e.memorizedPages} pages · {e.memorizedHizbs} Hizb</div></div><div className="flex flex-wrap items-center gap-2"><span className="pill bg-slate-100">{e.status}</span><button onClick={()=>chooseEvaluation(e.id)} className="btn bg-slate-100">Review</button>{e.status==='Pending Approval'&&<><button onClick={()=>updateStatus(e.id,'Approved')} className="btn btn-green">Approve</button><button onClick={()=>updateStatus(e.id,'Returned')} className="btn bg-rose-50 text-rose-700">Return</button></>}</div></div>)}</div>
  </div>

  <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
   {student&&<QuranProgress student={student}/>} 
   <div className="card p-5">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-bold">Evaluation builder</h2><p className="text-xs text-slate-500">The starting position is automatically taken from the student's current official stage.</p></div>{locked?<span className="pill bg-emerald-50 text-emerald-700">Approved & locked</span>:submitted?<span className="pill bg-amber-50 text-amber-700">Awaiting Admin</span>:<span className="pill bg-blue-50 text-blue-700">Teacher entry</span>}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <label className="text-xs font-bold">Student<select className="input mt-1" value={studentId} disabled={locked||submitted} onChange={e=>{setStudentId(e.target.value);setSelectedId('')}}>{studentList.map(s=><option key={s.id} value={s.id}>{s.name} · {s.id}</option>)}</select></label>
      <label className="text-xs font-bold">Term<select className="input mt-1" value={term} disabled={locked||submitted} onChange={e=>{setTerm(e.target.value as Term);setSelectedId('')}}><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></label>
      <label className="text-xs font-bold">Evaluation<select className="input mt-1" value={number} disabled={locked||submitted} onChange={e=>{setNumber(Number(e.target.value) as 1|2|3);setSelectedId('')}}><option value={1}>Evaluation 1</option><option value={2}>Evaluation 2</option><option value={3}>Evaluation 3</option></select></label>
    </div>
    {student&&<div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Current official memorization position</div><div className="mt-1 text-xl font-black text-slate-900">{label(current)}</div><div className="mt-1 text-xs text-slate-500">Direction: {student.direction} · Page {pageForPosition(student.current)} · Hizb {hizbForPosition(student.current)}</div></div>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><PositionField title="Starting position (locked to current stage)" value={from} onChange={()=>{}} disabled/><PositionField title="New stopping position" value={to} onChange={setTo} disabled={locked||submitted}/></div>
    <div className="mt-4 grid grid-cols-3 gap-2 text-center"><Metric value={calc.memorizedAyahs} label="Ayahs memorized"/><Metric value={calc.memorizedPages} label="Pages covered"/><Metric value={calc.memorizedHizbs} label="Hizbs covered"/></div>
    {!validStop&&<div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">Invalid stopping position for this student's memorization direction.</div>}
    <RubricField title="Memorization" value={memorization} setValue={setMem} disabled={locked||submitted}/><RubricField title="Fluency" value={fluency} setValue={setFlu} disabled={locked||submitted}/><RubricField title="Tajweed" value={tajweed} setValue={setTaj} disabled={locked||submitted}/>
    <div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="text-xs font-bold text-slate-500">AUTOMATED COMMENT</div><p className="mt-1 text-sm">{comment}</p><div className="mt-2 text-xs font-bold">Overall rubric score: {score}%</div></div>
    {!locked&&!submitted&&<button disabled={!student||!validStop} onClick={submit} className="btn btn-primary mt-4 w-full disabled:opacity-40">Submit to Admin for Approval</button>}
    {submitted&&<div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">This evaluation is pending Admin approval. It does not change the official student stage and cannot enter the report card yet.</div>}
    {locked&&<div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">Approved. The student's official memorization stage has advanced to {label(to)}. This evaluation is now locked.</div>}
   </div>
  </div>
 </AdminShell>
}
function Stat({label,value,sub}:{label:string,value:string,sub:string}){return <div className="card p-5"><div className="text-sm text-slate-500">{label}</div><div className="mt-2 text-3xl font-black">{value}</div><div className="mt-1 text-xs text-slate-500">{sub}</div></div>}
function Metric({value,label}:{value:number;label:string}){return <div className="rounded-xl bg-slate-50 p-3"><b className="block text-xl">{value.toLocaleString()}</b><span className="text-xs">{label}</span></div>}
function PositionField({title,value,onChange,disabled=false}:{title:string,value:Position,onChange:(p:Position)=>void,disabled?:boolean}){const s=SURAHS.find(x=>x.id===value.surah)!;return <div><label className="text-xs font-bold">{title}</label><select disabled={disabled} value={value.surah} onChange={e=>onChange({surah:Number(e.target.value),ayah:1})} className="input mt-1 disabled:bg-slate-50">{SURAHS.map(x=><option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}</select><input disabled={disabled} type="number" min={1} max={s.ayahs} value={value.ayah} onChange={e=>onChange({surah:value.surah,ayah:Math.min(s.ayahs,Math.max(1,Number(e.target.value)||1))})} className="input mt-2 disabled:bg-slate-50"/><div className="mt-1 text-[11px] text-slate-500">Selected: {label(value)} · max {s.ayahs} ayahs</div></div>}
function RubricField({title,value,setValue,disabled}:{title:string,value:Rubric,setValue:(v:Rubric)=>void,disabled:boolean}){return <div className="mt-4"><div className="text-xs font-bold">{title}</div><div className="mt-2 grid grid-cols-5 gap-1">{rubrics.map(n=><button disabled={disabled} key={n} onClick={()=>setValue(n)} className={`rounded-lg border p-2 text-xs font-bold disabled:opacity-50 ${value===n?'bg-[#102a43] text-white':'bg-white'}`}><span className="block text-base">{n}</span>{rubricText(n)}</button>)}</div></div>}
