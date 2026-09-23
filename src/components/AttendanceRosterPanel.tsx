'use client';
import {useEffect,useMemo,useState} from 'react';

type PersonType='student'|'staff';
type Row={
 id:string;name:string;identifier:string|null;section:string|null;role:string|null;department:string|null;
 status:string;statusLabel:string;statusColor:string;scannedAt:string|null;reviewStatus:string|null;attendanceRecordId:string|null;
};
type Props={type:PersonType;date:string};

const statuses=[
 {key:'present',label:'Present',color:'#16a34a'},
 {key:'late',label:'Late',color:'#d97706'},
 {key:'absent',label:'Absent',color:'#dc2626'},
 {key:'excused',label:'Excused',color:'#2563eb'},
 {key:'sick',label:'Sick',color:'#7c3aed'},
];

export default function AttendanceRosterPanel({type,date}:Props){
 const [rows,setRows]=useState<Row[]>([]);
 const [counts,setCounts]=useState<Record<string,number>>({});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [search,setSearch]=useState('');
 const [selected,setSelected]=useState('all');

 async function load(){
  setLoading(true);setError('');
  try{
   const res=await fetch('/api/attendance/roster?type='+type+'&date='+encodeURIComponent(date),{cache:'no-store'});
   const d=await res.json();
   if(!res.ok)throw new Error(d.error||'Could not load attendance roster');
   setRows(d.rows||[]);setCounts(d.counts||{});
  }catch(e:any){setError(e?.message||'Could not load attendance roster')}finally{setLoading(false)}
 }
 useEffect(()=>{load()},[type,date]);

 const filtered=useMemo(()=>rows.filter(r=>{
  if(selected!=='all'&&r.status!==selected)return false;
  const q=search.trim().toLowerCase();
  if(!q)return true;
  return [r.name,r.identifier,r.role,r.department,r.section].filter(Boolean).some(v=>String(v).toLowerCase().includes(q));
 }),[rows,search,selected]);

 return <section className="space-y-4">
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
    <div>
     <div className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">{type==='student'?'Student attendance':'Staff attendance'}</div>
     <h2 className="mt-1 text-xl font-black text-slate-900">{type==='student'?'All Students':'All Staff'}</h2>
     <p className="mt-1 text-sm text-slate-500">{counts.total||0} active {type==='student'?'students':'staff members'} · {date}</p>
    </div>
    <button onClick={load} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-black text-slate-700">Refresh</button>
   </div>
  </div>

  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
   <button onClick={()=>setSelected('all')} className={'rounded-xl border p-4 text-left '+(selected==='all'?'border-slate-900 bg-slate-50':'border-slate-200 bg-white')}>
    <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Total</div><div className="mt-1 text-2xl font-black text-slate-900">{counts.total||0}</div>
   </button>
   {[...statuses,{key:'not_recorded',label:'Not recorded',color:'#64748b'}].map(s=><button key={s.key} onClick={()=>setSelected(s.key)} className={'rounded-xl border p-4 text-left '+(selected===s.key?'border-slate-900 bg-slate-50':'border-slate-200 bg-white')}>
    <div className="text-[10px] font-black uppercase tracking-wide" style={{color:s.color}}>{s.label}</div><div className="mt-1 text-2xl font-black" style={{color:s.color}}>{counts[s.key]||0}</div>
   </button>)}
  </div>

  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
   <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
    <div className="text-sm font-black text-slate-900">{selected==='all'?'Everyone':statuses.find(s=>s.key===selected)?.label+' staff/students'} <span className="ml-1 text-slate-400">({filtered.length})</span></div>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or ID…" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:w-72"/>
   </div>
   {error?<div className="p-8 text-center font-bold text-rose-600">{error}</div>:
    loading?<div className="p-10 text-center text-sm text-slate-400">Loading {type==='student'?'students':'staff'}…</div>:
    filtered.length===0?<div className="p-10 text-center text-sm text-slate-400">No people match this status or search.</div>:
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
     <thead className="bg-white text-[10px] uppercase tracking-[.12em] text-slate-400"><tr><th className="px-5 py-3">Name</th><th className="px-3 py-3">{type==='student'?'Admission No.':'Staff ID'}</th><th className="px-3 py-3">{type==='student'?'Section':'Position'}</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Scan / record time</th><th className="px-5 py-3">Review</th></tr></thead>
     <tbody>{filtered.map(r=><tr key={r.id} className="border-t hover:bg-slate-50">
      <td className="px-5 py-3"><div className="font-black text-slate-900">{r.name}</div>{r.department&&<div className="text-xs text-slate-400">{r.department}</div>}</td>
      <td className="px-3 py-3 font-semibold text-slate-600">{r.identifier||'—'}</td>
      <td className="px-3 py-3 text-slate-500">{type==='student'?(r.section||'—'):(r.role||'—')}</td>
      <td className="px-3 py-3"><span className="rounded-full px-3 py-1 text-[10px] font-black uppercase" style={{background:r.statusColor+'18',color:r.statusColor}}>{r.statusLabel}</span></td>
      <td className="px-3 py-3 text-xs text-slate-500">{r.scannedAt?new Date(r.scannedAt).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit',hour12:true}):'—'}</td>
      <td className="px-5 py-3 text-xs text-slate-400">{r.reviewStatus||'—'}</td>
     </tr>)}</tbody>
    </table></div>}
  </div>
 </section>;
}
