'use client';
import {useEffect,useMemo,useState} from 'react';
type StaffRow={id:string;full_name:string;phone:string|null;role:string|null;employment_status:string|null;staff_number:string|null};
type RecordRow={id:string;person_id:string;scanned_at:string;attendance_date:string;status_code:string;period:string;review_status:string};
type Fine={id:string;staff_id:string;attendance_record_id:string;amount:number;reason:string;status:string;created_at:string;paid_at:string|null;notes:string|null};
const fmt=(v:string)=>new Date(v).toLocaleString('en-NG',{dateStyle:'medium',timeStyle:'short'});
const money=(n:number)=>'₦'+Number(n||0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2});

export default function StaffAttendancePanel(){
 const [staff,setStaff]=useState<StaffRow[]>([]); const [records,setRecords]=useState<RecordRow[]>([]); const [fines,setFines]=useState<Fine[]>([]);
 const [from,setFrom]=useState(()=>new Date(Date.now()-30*86400000).toISOString().slice(0,10)); const [to,setTo]=useState(()=>new Date().toISOString().slice(0,10));
 const [loading,setLoading]=useState(true); const [flash,setFlash]=useState(''); const [search,setSearch]=useState('');
 const load=async()=>{setLoading(true);try{const r=await fetch('/api/attendance/staff?from='+from+'&to='+to);const d=await r.json();if(!r.ok)throw new Error(d.error);setStaff(d.staff||[]);setRecords(d.records||[]);setFines(d.fines||[]);}catch(e:any){setFlash(e?.message||'Could not load staff attendance.')}finally{setLoading(false)}};
 useEffect(()=>{load()},[from,to]);
 const names=useMemo(()=>Object.fromEntries(staff.map(s=>[s.id,s.full_name])),[staff]);
 const filtered=useMemo(()=>records.filter(r=>!search||String(names[r.person_id]||'').toLowerCase().includes(search.toLowerCase())),[records,names,search]);
 const late=records.filter(r=>r.status_code==='late').length; const pendingFines=fines.filter(f=>f.status==='pending'); const totalPending=pendingFines.reduce((a,f)=>a+Number(f.amount||0),0);
 const updateFine=async(id:string,status:string)=>{const r=await fetch('/api/attendance/staff',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'fine_status',id,status})});const d=await r.json();if(!r.ok)throw new Error(d.error);await load()};
 return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
  <div className="border-b bg-[#062d2a] p-5 text-white"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
   <div><div className="text-[10px] font-black uppercase tracking-[.2em] text-[#C9A84C]">Staff gate attendance</div><h2 className="mt-1 text-xl font-black">Staff scans, lateness & fines</h2><p className="mt-1 text-sm text-white/70">Every staff QR scan is recorded with the server time. Late warnings and fines are applied automatically from Attendance Settings.</p></div>
   <div className="flex gap-2"><input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="rounded-lg bg-white/10 px-2 py-2 text-xs text-white"/><input type="date" value={to} onChange={e=>setTo(e.target.value)} className="rounded-lg bg-white/10 px-2 py-2 text-xs text-white"/><button onClick={load} className="rounded-lg bg-white/15 px-3 py-2 text-xs font-black">Refresh</button></div>
  </div></div>
  <div className="grid gap-3 p-5 sm:grid-cols-4">
   <div className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-400">Staff on list</div><div className="mt-1 text-2xl font-black text-slate-900">{staff.length}</div></div>
   <div className="rounded-xl bg-emerald-50 p-4"><div className="text-[10px] font-black uppercase text-emerald-600">Staff scans</div><div className="mt-1 text-2xl font-black text-emerald-900">{records.length}</div></div>
   <div className="rounded-xl bg-amber-50 p-4"><div className="text-[10px] font-black uppercase text-amber-600">Late scans</div><div className="mt-1 text-2xl font-black text-amber-900">{late}</div></div>
   <div className="rounded-xl bg-rose-50 p-4"><div className="text-[10px] font-black uppercase text-rose-600">Pending fines</div><div className="mt-1 text-2xl font-black text-rose-900">{money(totalPending)}</div></div>
  </div>
  {flash&&<div className="mx-5 mb-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{flash}</div>}
  <div className="grid gap-6 border-t p-5 lg:grid-cols-[1.4fr_1fr]">
   <div><div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-black text-slate-900">Attendance history</h3><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search staff…" className="rounded-lg border px-3 py-2 text-xs"/></div>
    {loading?<div className="py-8 text-center text-sm text-slate-400">Loading…</div>:<div className="max-h-[460px] overflow-auto rounded-xl border">{filtered.map(r=><div key={r.id} className="flex items-center justify-between gap-3 border-b p-3 last:border-0"><div className="min-w-0"><div className="truncate text-sm font-black">{names[r.person_id]||'Unknown staff'}</div><div className="text-[11px] text-slate-400">{r.attendance_date} · {fmt(r.scanned_at)} · {r.period}</div></div><div className={'rounded-full px-2 py-1 text-[10px] font-black uppercase '+(r.status_code==='late'?'bg-amber-100 text-amber-700':r.status_code==='absent'?'bg-rose-100 text-rose-700':'bg-emerald-100 text-emerald-700')}>{r.status_code}</div></div>)}{!filtered.length&&<div className="p-8 text-center text-sm text-slate-400">No staff scans in this period.</div>}</div>}
   </div>
   <div><div className="mb-3 flex items-center justify-between"><h3 className="font-black text-slate-900">Fines</h3><span className="text-xs text-slate-400">{fines.length} records</span></div><div className="max-h-[460px] space-y-2 overflow-auto">
    {fines.map(f=><div key={f.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black">{names[f.staff_id]||'Unknown staff'}</div><div className="text-[11px] text-slate-500">{f.reason}</div></div><div className="font-black text-slate-900">{money(f.amount)}</div></div><div className="mt-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase text-slate-400">{f.status} · {new Date(f.created_at).toLocaleDateString('en-GB')}</span><div className="flex gap-1">{f.status==='pending'&&<><button onClick={()=>updateFine(f.id,'paid')} className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">Mark paid</button><button onClick={()=>updateFine(f.id,'waived')} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">Waive</button></>}</div></div></div>)}
    {!fines.length&&<div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-400">No fines recorded.</div>}
   </div></div>
  </div>
 </section>
}