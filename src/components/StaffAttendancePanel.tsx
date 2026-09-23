'use client';
import {useEffect,useMemo,useState} from 'react';

type Row={id:string;full_name:string;staff_id:string|null;status_code:string;status_label:string;scanned_at:string|null;note:string|null;fine_amount:number;fine_status:string|null;expected_fine:number;fine_reason:string|null};
type Summary={total:number;present:number;late:number;absent:number;excused:number;sick:number;pendingFines:number;pendingAmount:number};

const money=(n:number)=>'₦'+Number(n||0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2});
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Lagos'});
const statusClass=(s:string)=>s==='present'?'bg-emerald-50 text-emerald-700':s==='late'?'bg-amber-50 text-amber-800':s==='absent'?'bg-rose-50 text-rose-700':s==='excused'?'bg-blue-50 text-blue-700':'bg-violet-50 text-violet-700';

export default function StaffAttendancePanel(){
 const [date,setDate]=useState(today()); const [rows,setRows]=useState<Row[]>([]); const [summary,setSummary]=useState<Summary|null>(null);
 const [loading,setLoading]=useState(true); const [search,setSearch]=useState(''); const [message,setMessage]=useState('');
 const [account,setAccount]=useState<{name:string;number:string;bank:string}>({name:'AMQM School Account',number:'',bank:''});
 const [action,setAction]=useState<Row|null>(null); const [reason,setReason]=useState(''); const [saving,setSaving]=useState(false);

 const load=async()=>{
  setLoading(true);setMessage('');
  try{
   if(date===today()) await fetch('/api/attendance/finalize',{method:'POST'}).catch(()=>{});
   const r=await fetch('/api/attendance/staff?date='+encodeURIComponent(date)); const d=await r.json();
   if(!r.ok) throw new Error(d.error||'Could not load staff attendance');
   setRows(d.rows||[]);setSummary(d.summary||null);setAccount(d.paymentAccount||{name:'AMQM School Account',number:'',bank:''});
  }catch(e:any){setMessage(e?.message||'Could not load staff attendance.')}finally{setLoading(false)}
 };
 useEffect(()=>{load()},[date]);

 const filtered=useMemo(()=>rows.filter(r=>!search||r.full_name.toLowerCase().includes(search.toLowerCase())||String(r.staff_id||'').toLowerCase().includes(search.toLowerCase())),[rows,search]);

 async function resolve(row:Row,status:'excused'|'sick'){
  setSaving(true);
  try{
   const r=await fetch('/api/attendance/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recordId:row.id,action:'change_status',newStatusCode:status,newReviewStatus:'approved',note:reason||'Reason recorded by administration.'})});
   const d=await r.json(); if(!r.ok) throw new Error(d.error||'Could not update attendance');
   setAction(null);setReason('');await load();
  }catch(e:any){setMessage(e?.message||'Could not update attendance')}finally{setSaving(false)}
 }

 return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  <div className="border-b bg-[#062d2a] p-5 text-white">
   <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div><div className="text-[10px] font-black uppercase tracking-[.2em] text-[#C9A84C]">Staff attendance</div><h2 className="mt-1 text-xl font-black">Today’s staff attendance</h2><p className="mt-1 text-sm text-white/70">One simple roster: Present, Late, Absent and Excused. Fines are shown beside the person.</p></div>
    <div className="flex flex-wrap gap-2"><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-900"/><button onClick={load} className="rounded-lg bg-white/15 px-3 py-2 text-xs font-black">Refresh</button></div>
   </div>
  </div>
  <div className="grid gap-3 p-5 sm:grid-cols-5">
   {[['Present',summary?.present||0,'bg-emerald-50 text-emerald-800'],['Late',summary?.late||0,'bg-amber-50 text-amber-800'],['Absent',summary?.absent||0,'bg-rose-50 text-rose-800'],['Excused',summary?.excused||0,'bg-blue-50 text-blue-800'],['Pending fines',money(summary?.pendingAmount||0),'bg-violet-50 text-violet-800']].map(([l,v,c])=><div key={String(l)} className={'rounded-xl p-4 '+c}><div className="text-[10px] font-black uppercase tracking-wide opacity-70">{l}</div><div className="mt-1 text-2xl font-black">{v}</div></div>)}
  </div>
  {message&&<div className="mx-5 mb-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{message}</div>}
  <div className="flex flex-col gap-3 border-t bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
   <div><div className="font-black text-slate-900">Staff roster</div><div className="text-xs text-slate-500">Absent means no gate scan after the cutoff. Use Excused/Sick when a valid reason is approved.</div></div>
   <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or staff ID…" className="rounded-lg border bg-white px-3 py-2 text-sm sm:w-64"/>
  </div>
  <div className="overflow-x-auto">
   <table className="w-full min-w-[850px] text-left text-sm">
    <thead className="bg-white text-[10px] uppercase tracking-[.12em] text-slate-400"><tr><th className="px-5 py-3">Staff member</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Scan time</th><th className="px-3 py-3">Fine</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
    <tbody>
     {loading?<tr><td colSpan={5} className="p-10 text-center text-slate-400">Loading staff attendance…</td></tr>:
      filtered.map(r=><tr key={r.id} className="border-t hover:bg-slate-50/60">
       <td className="px-5 py-3"><div className="font-black text-slate-900">{r.full_name}</div><div className="text-xs text-slate-400">{r.staff_id||'—'}</div></td>
       <td className="px-3 py-3"><span className={'rounded-full px-3 py-1 text-[10px] font-black uppercase '+statusClass(r.status_code)}>{r.status_label}</span></td>
       <td className="px-3 py-3 text-xs text-slate-500">{r.scanned_at?new Date(r.scanned_at).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit',hour12:true}):'—'}</td>
       <td className="px-3 py-3">{r.fine_amount>0?<div><div className="font-black text-rose-700">{money(r.fine_amount)}</div><div className="text-[10px] uppercase font-bold text-slate-400">{r.fine_status||'expected'}</div></div>:r.expected_fine>0?<div><div className="font-black text-amber-700">{money(r.expected_fine)}</div><div className="text-[10px] text-slate-400">expected</div></div>:<span className="text-slate-300">—</span>}</td>
       <td className="px-4 py-3"><div className="flex justify-end gap-2">
        {(r.status_code==='absent'||r.status_code==='late')&&<button onClick={()=>{setAction(r);setReason('');}} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black text-blue-700">Has a reason?</button>}
       </div></td>
      </tr>)}
     {!loading&&!filtered.length&&<tr><td colSpan={5} className="p-10 text-center text-slate-400">No staff found.</td></tr>}
    </tbody>
   </table>
  </div>
  <div className="border-t bg-slate-50 p-5">
   <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div><div className="text-xs font-black uppercase tracking-wide text-slate-500">Fine payment</div><div className="mt-1 text-sm font-black text-slate-900">{account.bank||'School bank'} · {account.name}</div><div className="text-sm text-slate-700">{account.number||'Payment account has not been configured yet.'}</div></div>
    <div className="text-xs text-slate-500 md:max-w-md">Staff should use the school account shown here and provide payment evidence to the school. Admin can mark the fine Paid or Waived after verification.</div>
   </div>
  </div>
  {action&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"><div className="text-lg font-black">Record a reason</div><p className="mt-1 text-sm text-slate-500">{action.full_name} is currently <b>{action.status_label}</b>. If there is a valid reason, record it and mark the attendance as Excused.</p><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} placeholder="e.g. Approved medical leave, emergency, authorised absence…" className="mt-4 w-full rounded-xl border p-3 text-sm"/><div className="mt-4 flex justify-end gap-2"><button onClick={()=>setAction(null)} className="rounded-lg border px-4 py-2 text-sm font-bold">Cancel</button><button disabled={!reason.trim()||saving} onClick={()=>resolve(action,'excused')} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{saving?'Saving…':'Mark Excused'}</button></div></div></div>}
 </section>;
}