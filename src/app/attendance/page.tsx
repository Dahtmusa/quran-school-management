'use client';
import AdminShell from '@/components/AdminShell';import SectionBadge from '@/components/SectionBadge';
import { loadStudents, getCurrentProfile } from '@/lib/live-store';
import { createClient } from '@/lib/supabase/client';
import { Student } from '@/lib/data';
import { useEffect, useMemo, useRef, useState } from 'react';

type Item={studentId:string;status:string;scannedAt:string;note:string};
type AttRecord={id:string;student_id:string;attendance_date:string;status:string;note:string|null;recorded_at:string;students:{full_name:string;admission_no:string;section:string}[]|null};

export default function Attendance(){
 const [code,setCode]=useState(''); const [students,setStudents]=useState<Student[]>([]); const [items,setItems]=useState<Item[]>([]); const [camera,setCamera]=useState(false); const video=useRef<HTMLVideoElement>(null); const stream=useRef<MediaStream|null>(null);
 const [role,setRole]=useState(''); const [todayRecords,setTodayRecords]=useState<AttRecord[]>([]);

 const refresh=async()=>{
   loadStudents().then(setStudents);
 };
 useEffect(()=>{
   refresh();
   getCurrentProfile().then((p:any)=>{
     const r=p?.role||''; setRole(r);
     if(r==='admin'||r==='super_admin'){
       const today=new Date().toISOString().slice(0,10);
       createClient().from('attendance_records').select('id,student_id,attendance_date,status,note,recorded_at,students:student_id(full_name,admission_no,section)').eq('attendance_date',today).order('recorded_at',{ascending:false}).then(({data})=>setTodayRecords((data||[]) as AttRecord[]));
     }
   });
 },[]);

 const addScan=(incoming?:string)=>{let value=(incoming??code).trim();try{const parsed=JSON.parse(value);if(parsed?.id)value=String(parsed.id)}catch{}const s=students.find(x=>x.id===value || x.admissionNo===value);if(!s){alert('ID not found. Use the student ID/admission number assigned by the school.');return;}setItems(prev=>prev.some(x=>x.studentId===s.id)?prev:[...prev,{studentId:s.id,status:'present',scannedAt:new Date().toLocaleTimeString(),note:''}]);setCode('')};
 const counts=useMemo(()=>({present:items.filter(x=>x.status==='present').length,absent:items.filter(x=>x.status==='absent').length,late:items.filter(x=>x.status==='late').length,excused:items.filter(x=>x.status==='excused').length}),[items]);
 const todayCounts=useMemo(()=>({present:todayRecords.filter(x=>x.status==='present').length,absent:todayRecords.filter(x=>x.status==='absent').length,late:todayRecords.filter(x=>x.status==='late').length,excused:todayRecords.filter(x=>x.status==='excused').length}),[todayRecords]);
 const lowAttendance=useMemo(()=>students.filter(s=>s.attendance>0).sort((a,b)=>a.attendance-b.attendance).slice(0,8),[students]);

 const startCamera=async()=>{try{const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});stream.current=media;setCamera(true);setTimeout(()=>{if(video.current)video.current.srcObject=media},50)}catch{alert('Camera access was not available. You can still enter the ID manually.')}};
 const stopCamera=()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setCamera(false)};
 useEffect(()=>()=>stopCamera(),[]);
 useEffect(()=>{if(!camera||!video.current)return;const v=video.current;let timer:number|undefined;const Detector=(window as unknown as {BarcodeDetector?:new (o?:unknown)=>{detect:(el:HTMLVideoElement)=>Promise<Array<{rawValue?:string}>>}}).BarcodeDetector;if(!Detector)return;const detector=new Detector({formats:['qr_code','code_128','ean_13']});const scan=async()=>{if(v.readyState>=2){try{const found=await detector.detect(v);const value=found[0]?.rawValue;if(value){addScan(value)}}catch{}}timer=window.setTimeout(scan,500)};scan();return()=>{if(timer)window.clearTimeout(timer)}},[camera]);
 const submit=()=>{if(!items.length)return;alert('Attendance submission sent to Admin for review. Parent SMS is not sent until Admin approves.');};

 const isAdmin=role==='admin'||role==='super_admin';

 return <AdminShell title={isAdmin?'Attendance Overview':'Security Attendance Dashboard'}>
   <div className="space-y-5">

   {/* Admin overview */}
   {isAdmin&&<>
     <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-slate-900 p-5 text-white shadow-xl md:p-7">
       <div className="text-[11px] font-bold uppercase tracking-[.24em] text-amber-300">Today — {new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</div>
       <h2 className="mt-1 text-2xl font-black md:text-3xl">Attendance Dashboard</h2>
       <p className="mt-1 text-sm text-emerald-100/70">Records are submitted by security staff and teachers, then kept here for admin oversight.</p>
     </section>

     <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
       {[['Present',todayCounts.present,'bg-emerald-50 text-emerald-900'],['Absent',todayCounts.absent,'bg-rose-50 text-rose-900'],['Late',todayCounts.late,'bg-amber-50 text-amber-900'],['Excused',todayCounts.excused,'bg-slate-50 text-slate-700']].map(([l,v,c])=>(
         <div key={l as string} className={`rounded-2xl p-5 ${c as string}`}>
           <div className="text-xs font-black uppercase tracking-wide opacity-60">{l as string}</div>
           <div className="mt-2 text-4xl font-black">{v as number}</div>
           <div className="mt-1 text-xs opacity-50">students today</div>
         </div>
       ))}
     </div>

     {todayRecords.length>0&&<section className="card overflow-hidden">
       <div className="border-b p-5"><h3 className="font-bold">Today's records</h3><p className="text-xs text-slate-500 mt-0.5">{todayRecords.length} record{todayRecords.length!==1?'s':''} submitted</p></div>
       <div className="divide-y max-h-96 overflow-y-auto">
         {todayRecords.map(r=><div key={r.id} className="flex items-center gap-3 px-5 py-3">
           <div className={`h-2 w-2 rounded-full shrink-0 ${r.status==='present'?'bg-emerald-400':r.status==='absent'?'bg-rose-400':r.status==='late'?'bg-amber-400':'bg-slate-300'}`}/>
           <div className="flex-1 min-w-0">
             <div className="font-semibold text-sm truncate">{r.students?.[0]?.full_name||'—'}</div>
             <div className="text-xs text-slate-400">{r.students?.[0]?.admission_no} · {new Date(r.recorded_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
           </div>
           <span className={`pill shrink-0 ${r.status==='present'?'bg-emerald-50 text-emerald-700':r.status==='absent'?'bg-rose-50 text-rose-700':r.status==='late'?'bg-amber-50 text-amber-700':'bg-slate-50 text-slate-500'}`}>{r.status}</span>
           {r.note&&<span className="max-w-[120px] truncate text-xs text-slate-400" title={r.note}>{r.note}</span>}
         </div>)}
       </div>
     </section>}

     {todayRecords.length===0&&<div className="card p-8 text-center text-slate-400 text-sm">No attendance records submitted today yet.</div>}

     {lowAttendance.length>0&&<section className="card overflow-hidden">
       <div className="border-b p-5"><h3 className="font-bold">Attendance overview — all students</h3><p className="text-xs text-slate-500 mt-0.5">Sorted by attendance percentage, lowest first.</p></div>
       <div className="divide-y">
         {lowAttendance.map(s=><div key={s.id} className="flex items-center gap-3 px-5 py-3">
           <div className="min-w-0 flex-1">
             <div className="flex items-center gap-2"><span className="font-semibold text-sm">{s.name}</span><SectionBadge section={s.section}/></div>
             <div className="text-xs text-slate-400">{s.admissionNo}</div>
           </div>
           <div className="flex items-center gap-2 shrink-0">
             <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
               <div className={`h-full rounded-full ${s.attendance>=80?'bg-emerald-400':s.attendance>=60?'bg-amber-400':'bg-rose-400'}`} style={{width:`${s.attendance}%`}}/>
             </div>
             <span className={`text-sm font-black w-10 text-right ${s.attendance>=80?'text-emerald-700':s.attendance>=60?'text-amber-700':'text-rose-700'}`}>{s.attendance}%</span>
           </div>
         </div>)}
       </div>
     </section>}
     <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-xs text-slate-500 leading-5">The security scanner and submission queue below are for the security staff at the gate. Daily records are compiled automatically from teacher and security submissions.</div>
   </>}

   {/* Scanner section */}
   <div className="grid gap-5 lg:grid-cols-3">
     <div className="card p-5 lg:col-span-2"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-bold">Student ID scanning</h2><p className="mt-1 text-xs text-slate-500">Designed for a phone. Scan the school ID QR/barcode or enter the ID manually. A scan is only a proposed attendance event until Admin reviews it.</p></div><span className="pill bg-amber-50 text-amber-700">Admin review required</span></div><div className="mt-5 flex flex-col gap-2 sm:flex-row"><input value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addScan()} placeholder="Scan / enter student ID" className="input flex-1"/><button onClick={()=>addScan()} className="btn btn-primary">Add ID</button><button onClick={camera?stopCamera:startCamera} className="btn bg-emerald-50 text-emerald-800">{camera?'Stop camera':'Use camera'}</button></div>{camera&&<div className="mt-4 overflow-hidden rounded-2xl bg-black"><video ref={video} autoPlay playsInline muted className="aspect-video w-full object-cover"/><div className="p-3 text-center text-xs text-white">Point the camera at the student's QR/barcode ID.</div></div>}<div className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm text-slate-500">On browsers without BarcodeDetector support (including some iOS configurations), the secure manual ID entry remains available.</div></div>
     <div className="card p-5"><h2 className="font-bold">Today's scan batch</h2><div className="mt-4 grid grid-cols-2 gap-3">{[['present','Present'],['absent','Absent'],['late','Late'],['excused','Excused']].map(([k,l])=><div className="rounded-xl bg-slate-50 p-4" key={k}><div className="text-2xl font-black">{counts[k as keyof typeof counts]}</div><div className="text-xs">{l}</div></div>)}</div><button disabled={!items.length} onClick={submit} className="btn btn-green mt-4 w-full disabled:opacity-40">Submit batch to Admin</button></div>
   </div>
   <div className="card overflow-hidden"><div className="border-b p-5"><h2 className="font-bold">Admin review queue</h2><p className="text-xs text-slate-500">Admin can correct status, record an excuse/sickness reason, then approve official attendance and parent notifications.</p></div>{items.length===0?<div className="p-8 text-center text-sm text-slate-500">No scans yet.</div>:items.map(item=>{const s=students.find(x=>x.id===item.studentId)!;return <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center" key={item.studentId}><div className="flex-1"><div className="flex items-center gap-2"><b>{s.name}</b><SectionBadge section={s.section}/></div><div className="text-xs text-slate-500">{s.admissionNo} · scanned {item.scannedAt}</div></div><select value={item.status} onChange={e=>setItems(x=>x.map(i=>i.studentId===item.studentId?{...i,status:e.target.value}:i))} className="input md:w-40"><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select><input value={item.note} onChange={e=>setItems(x=>x.map(i=>i.studentId===item.studentId?{...i,note:e.target.value}:i))} placeholder="Reason / note" className="input md:w-64"/></div>})}</div>
   <div className="card p-5"><h2 className="font-bold">Notification rule</h2><p className="mt-2 text-sm leading-6 text-slate-600">Only Admin-approved attendance creates SMS jobs for parents. Excused/sick/approved-reason records can be excluded. The notification outbox is provider-neutral so the school can connect its chosen SMS gateway later.</p></div>

   </div>
 </AdminShell>;
}
