'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AdminShell from '@/components/AdminShell';

type Person={id:string;full_name:string;admission_no?:string;staff_id?:string;section?:string;job_title?:string;status:string|null;scanned_at:string|null;source:string};

export default function AttendanceDashboard(){
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Lagos'});
 const [date,setDate]=useState(today);
 const [data,setData]=useState<any>(null);
 const [tab,setTab]=useState<'day'|'boarding'|'staff'>('day');
 const [search,setSearch]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');

 async function load(){
  setLoading(true);setError('');
  try{const r=await fetch('/api/attendance/summary?date='+encodeURIComponent(date),{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load attendance');setData(d)}
  catch(e:any){setError(e?.message||'Could not load attendance')}finally{setLoading(false)}
 }
 useEffect(()=>{load()},[date]);

 const rows:Person[]=useMemo(()=>data?(tab==='day'?data.students.day:tab==='boarding'?data.students.boarding:data.staff):[],[data,tab]);
 const filtered=useMemo(()=>rows.filter(r=>{const q=search.toLowerCase().trim();return !q||[r.full_name,r.admission_no,r.staff_id,r.job_title,r.section].filter(Boolean).some(v=>String(v).toLowerCase().includes(q))}),[rows,search]);

 const k=(key:'day'|'boarding'|'staff')=>data?.counts?.[key]||{total:0,present:0,late:0,absent:0,not_marked:0};

 return <AdminShell title="Attendance">
  <div className="space-y-5">
   <section className="rounded-[2rem] bg-[#062d2a] p-6 text-white">
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
     <div><div className="text-[10px] font-black uppercase tracking-[.22em] text-[#e3c36b]">AMQM Attendance</div><h1 className="mt-2 text-3xl font-black">Simple, clear attendance</h1><p className="mt-2 text-sm text-emerald-50/80">Day students and ordinary staff scan at the main gate. Boarding students are marked by their assigned teachers.</p></div>
     <div className="flex gap-2"><input type="date" value={date} max={today} onChange={e=>setDate(e.target.value)} className="h-11 rounded-xl border-0 bg-white px-3 text-sm font-bold text-slate-900"/><Link href="/attendance/scan" className="rounded-xl bg-[#e3c36b] px-4 py-3 text-sm font-black text-[#062d2a]">Open Gate Scanner</Link></div>
    </div>
   </section>

   {error&&<div className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>}
   {loading&&!data?<div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400">Loading attendance…</div>:data&&<>
    <div className="grid gap-3 md:grid-cols-3">
     {([['day','Day students'],['boarding','Boarding students'],['staff','Staff']] as const).map(([key,label])=>{const c=k(key);return <button key={key} onClick={()=>setTab(key)} className={'rounded-2xl border p-5 text-left '+(tab===key?'border-emerald-700 bg-emerald-50':'border-slate-200 bg-white')}>
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-3xl font-black">{c.total}</div>
      <div className="mt-2 flex gap-3 text-xs font-bold"><span className="text-emerald-700">{c.present} present</span><span className="text-amber-700">{c.late} late</span><span className="text-rose-700">{c.absent} absent</span></div>
     </button>})}
    </div>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
     <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
      <div><div className="font-black">{tab==='day'?'Day Students':tab==='boarding'?'Boarding Students':'Staff'}</div><div className="text-xs text-slate-500">{date} · {rows.length} people</div></div>
      <div className="flex gap-2"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or ID…" className="h-10 rounded-lg border border-slate-200 px-3 text-sm"/><button onClick={load} className="rounded-lg border border-slate-200 px-4 text-xs font-black">Refresh</button></div>
     </div>
     <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
      <thead className="text-[10px] uppercase tracking-[.12em] text-slate-400"><tr><th className="px-5 py-3">Person</th><th>ID</th><th>Attendance</th><th>Recorded at</th><th>Source</th></tr></thead>
      <tbody>{filtered.length===0?<tr><td colSpan={5} className="p-10 text-center text-slate-400">No matching people.</td></tr>:filtered.map(r=><tr key={r.id} className="border-t">
       <td className="px-5 py-4"><div className="font-black">{r.full_name}</div><div className="text-xs text-slate-400">{r.job_title||r.section||''}</div></td>
       <td className="font-semibold text-slate-600">{r.admission_no||r.staff_id||'—'}</td>
       <td><span className={'rounded-full px-3 py-1 text-[10px] font-black uppercase '+(r.status==='present'?'bg-emerald-50 text-emerald-700':r.status==='late'?'bg-amber-50 text-amber-700':r.status==='absent'?'bg-rose-50 text-rose-700':'bg-slate-100 text-slate-500')}>{r.status||'Not marked'}</span></td>
       <td className="text-xs text-slate-500">{r.scanned_at?new Date(r.scanned_at).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit',hour12:true}):'—'}</td>
       <td className="text-xs font-semibold text-slate-500">{r.source==='record'?(tab==='boarding'?'Teacher':'Gate scanner'):tab==='boarding'?'Waiting for teacher':'Waiting for gate scan'}</td>
      </tr>)}</tbody>
     </table></div>
    </section>
   </>}
  </div>
 </AdminShell>
}
