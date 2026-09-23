'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '@/components/AdminShell';

type Row={student_id:string;full_name:string;admission_no:string|null;class_name:string|null;status_code:string|null;recorded_at:string|null};

const statuses=[['present','Present'],['late','Late'],['absent','Absent'],['excused','Excused']];

export default function TeacherAttendancePage(){
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Lagos'});
 const [date,setDate]=useState(today);
 const [rows,setRows]=useState<Row[]>([]);
 const [search,setSearch]=useState('');
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState('');
 const [message,setMessage]=useState('');

 async function load(){
  setLoading(true);setMessage('');
  try{
   const r=await fetch('/api/attendance/teacher?date='+encodeURIComponent(date),{cache:'no-store'});
   const d=await r.json(); if(!r.ok)throw new Error(d.error||'Could not load boarding attendance');
   setRows(d.rows||[]);
  }catch(e:any){setMessage(e?.message||'Could not load boarding attendance');setRows([])}
  finally{setLoading(false)}
 }
 useEffect(()=>{load()},[date]);

 async function mark(studentId:string,status:string){
  setSaving(studentId);setMessage('');
  try{
   const r=await fetch('/api/attendance/teacher',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId,status,date})});
   const d=await r.json(); if(!r.ok)throw new Error(d.error||'Could not save attendance');
   await load(); setMessage('Attendance saved.');
  }catch(e:any){setMessage(e?.message||'Could not save attendance')}
  finally{setSaving('')}
 }

 const filtered=useMemo(()=>rows.filter(r=>{
  const q=search.toLowerCase().trim(); if(!q)return true;
  return [r.full_name,r.admission_no,r.class_name].filter(Boolean).some(v=>String(v).toLowerCase().includes(q));
 }),[rows,search]);

 const counts={present:rows.filter(r=>r.status_code==='present').length,late:rows.filter(r=>r.status_code==='late').length,absent:rows.filter(r=>r.status_code==='absent').length,unmarked:rows.filter(r=>!r.status_code).length};

 return <AdminShell title="Boarding Attendance">
  <div className="space-y-5">
   <section className="rounded-[2rem] bg-[#062d2a] p-6 text-white">
    <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#e3c36b]">Teacher attendance</div>
    <h1 className="mt-2 text-3xl font-black">Boarding Students</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">Only boarding students assigned to you appear here. Day students are recorded at the main gate.</p>
   </section>
   {message&&<div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</div>}
   <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
     <div><div className="text-xs font-black uppercase tracking-wide text-slate-500">Attendance date</div><div className="mt-1 text-lg font-black">{date}</div></div>
     <div className="flex gap-2"><input type="date" value={date} max={today} onChange={e=>setDate(e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3"/>
     <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search student or class…" className="h-11 rounded-xl border border-slate-200 px-3"/></div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
     <div className="rounded-xl bg-emerald-50 p-3"><b>{counts.present}</b><div className="text-xs text-emerald-700">Present</div></div>
     <div className="rounded-xl bg-amber-50 p-3"><b>{counts.late}</b><div className="text-xs text-amber-700">Late</div></div>
     <div className="rounded-xl bg-rose-50 p-3"><b>{counts.absent}</b><div className="text-xs text-rose-700">Absent</div></div>
     <div className="rounded-xl bg-slate-50 p-3"><b>{counts.unmarked}</b><div className="text-xs text-slate-600">Not marked</div></div>
    </div>
   </section>
   <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    {loading?<div className="p-10 text-center text-sm text-slate-400">Loading assigned boarding students…</div>:
     filtered.length===0?<div className="p-10 text-center text-sm text-slate-400">No assigned boarding students found.</div>:
     <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
      <thead className="bg-slate-50 text-[10px] uppercase tracking-[.12em] text-slate-400"><tr><th className="px-5 py-3">Student</th><th>Class</th><th>Status</th><th className="px-5 py-3 text-right">Mark</th></tr></thead>
      <tbody>{filtered.map(r=><tr key={r.student_id} className="border-t">
       <td className="px-5 py-4"><div className="font-black">{r.full_name}</div><div className="text-xs text-slate-400">{r.admission_no||'—'}</div></td>
       <td className="text-slate-500">{r.class_name||'—'}</td>
       <td><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase">{r.status_code||'Not marked'}</span></td>
       <td className="px-5 py-3"><div className="flex justify-end gap-2">{statuses.map(s=><button key={s[0]} disabled={!!saving} onClick={()=>mark(r.student_id,s[0])} className="rounded-lg bg-[#062d2a] px-3 py-2 text-[11px] font-black text-white disabled:opacity-40">{s[1]}</button>)}</div></td>
      </tr>)}</tbody>
     </table></div>}
   </section>
  </div>
 </AdminShell>
}
