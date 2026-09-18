'use client';

import AdminShell from '@/components/AdminShell';
import {
  loadTeacherBoardingAttendanceToday,
  loadTeacherBoardingAttendanceHistory,
  recordTeacherBoardingAttendance,
  type TeacherBoardingAttendanceRow,
  type TeacherBoardingAttendanceHistoryRow,
} from '@/lib/attendance-store';
import { getCurrentProfile, loadTeacherDirectory } from '@/lib/live-store';
import { useEffect, useMemo, useState } from 'react';

const TZ = 'Africa/Lagos';
const todayLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

function fmtDate(value:string){
  return new Date(value + 'T00:00:00').toLocaleDateString('en-NG',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
}
function honorific(profile:any){ return String(profile?.gender||'').toLowerCase()==='female' ? 'Malama' : 'Malam'; }

export default function TeacherAttendancePage(){
  const [me,setMe]=useState<any>(null);
  const [students,setStudents]=useState<any[]>([]);
  const [rows,setRows]=useState<TeacherBoardingAttendanceRow[]>([]);
  const [history,setHistory]=useState<TeacherBoardingAttendanceHistoryRow[]>([]);
  const [selectedDate,setSelectedDate]=useState(todayLocal());
  const [fromDate,setFromDate]=useState(()=>{const d=new Date();d.setDate(d.getDate()-30);return d.toLocaleDateString('en-CA',{timeZone:TZ});});
  const [toDate,setToDate]=useState(todayLocal());
  const [tab,setTab]=useState<'mark'|'history'|'progress'>('mark');
  const [search,setSearch]=useState('');
  const [saving,setSaving]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [historyLoading,setHistoryLoading]=useState(false);
  const [message,setMessage]=useState('');

  const refreshDay=async(date=selectedDate)=>{
    setLoading(true);setMessage('');
    try{ setRows(await loadTeacherBoardingAttendanceToday(date)); }
    catch(e:any){ setMessage(e?.message||'Could not load boarding attendance.'); setRows([]); }
    finally{setLoading(false);}
  };
  const refreshHistory=async()=>{
    setHistoryLoading(true);
    try{setHistory(await loadTeacherBoardingAttendanceHistory(fromDate,toDate));}
    catch(e:any){setMessage(e?.message||'Could not load attendance history.');setHistory([]);}
    finally{setHistoryLoading(false);}
  };

  useEffect(()=>{ Promise.all([getCurrentProfile().then(setMe),loadTeacherDirectory().then(setStudents),refreshDay(),refreshHistory()]); },[]);
  useEffect(()=>{ if(tab==='mark') refreshDay(selectedDate); },[selectedDate]);
  useEffect(()=>{ if(tab!=='mark') refreshHistory(); },[fromDate,toDate,tab]);

  const today=todayLocal();
  const isFuture=selectedDate>today;
  const boardingStudents=useMemo(()=>students.filter(s=>s.section==='Boarding'),[students]);
  const filteredRows=useMemo(()=>rows.filter(r=>r.fullName.toLowerCase().includes(search.toLowerCase())||String(r.admissionNo||'').toLowerCase().includes(search.toLowerCase())||String(r.className||'').toLowerCase().includes(search.toLowerCase())),[rows,search]);
  const marked=rows.filter(r=>r.statusCode).length;
  const present=rows.filter(r=>r.statusCode==='present').length;
  const late=rows.filter(r=>r.statusCode==='late').length;
  const absent=rows.filter(r=>r.statusCode==='absent').length;
  const excused=rows.filter(r=>r.statusCode==='excused').length;
  const coverage=rows.length?Math.round((marked/rows.length)*100):0;

  const progress=useMemo(()=>{
    const map=new Map<string,{row:TeacherBoardingAttendanceHistoryRow;present:number;late:number;absent:number;excused:number;sick:number;recorded:number;possible:number}>();
    for(const s of boardingStudents){
      map.set(s.id,{row:{studentId:s.id,fullName:s.name,admissionNo:s.admissionNo,className:s.className,statusCode:null,statusLabel:null,statusColor:null,attendanceDate:toDate,reviewStatus:'',recordedAt:''},present:0,late:0,absent:0,excused:0,sick:0,recorded:0,possible:Math.max(0,Math.round((new Date(toDate+'T00:00:00').getTime()-new Date(fromDate+'T00:00:00').getTime())/86400000)+1)});
    }
    for(const h of history){
      const p=map.get(h.studentId); if(!p) continue;
      p.recorded++;
      if(h.statusCode==='present') p.present++;
      else if(h.statusCode==='late') p.late++;
      else if(h.statusCode==='absent') p.absent++;
      else if(h.statusCode==='excused') p.excused++;
      else if(h.statusCode==='sick') p.sick++;
    }
    return Array.from(map.values()).sort((a,b)=>a.row.fullName.localeCompare(b.row.fullName));
  },[boardingStudents,history,fromDate,toDate]);

  async function mark(studentId:string,status:string){
    if(isFuture){setMessage('Future attendance cannot be recorded. Choose today or an earlier date.');return;}
    setSaving(studentId);setMessage('');
    try{
      await recordTeacherBoardingAttendance(studentId,status,'morning',undefined,selectedDate);
      await refreshDay(selectedDate);
      setMessage('Attendance saved.');
    }catch(e:any){setMessage(e?.message||'Attendance could not be saved.');}
    finally{setSaving(null);}
  }

  return <AdminShell title="Teacher Attendance">
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-[#07533f] to-slate-900 p-5 text-white shadow-xl md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.24em] text-amber-300">Teacher attendance workspace</div>
            <h2 className="mt-2 text-3xl font-black md:text-4xl">{honorific(me)} {me?.full_name||'Teacher'}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">Mark attendance for boarding students assigned to you. Day students are handled at the gate.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Boarding',rows.length,'#ede9fe','#6d28d9'],
              ['Marked',marked,'#ecfdf5','#047857'],
              ['Present',present,'#ecfdf5','#047857'],
              ['Absent',absent,'#fff1f2','#be123c'],
            ].map(([label,value,bg,fg])=><div key={String(label)} className="rounded-2xl px-4 py-3 text-center" style={{background:bg as string,color:fg as string}}><div className="text-[10px] font-black uppercase tracking-wide opacity-70">{label}</div><div className="mt-0.5 text-2xl font-black">{value as number}</div></div>)}
          </div>
        </div>
      </section>

      {message&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-3 gap-2">
          {[
            ['mark','Mark attendance'],
            ['history','Attendance history'],
            ['progress','Progress'],
          ].map(([key,label])=><button key={key} onClick={()=>setTab(key as any)} className={`rounded-xl px-3 py-3 text-xs font-black uppercase tracking-wide transition ${tab===key?'bg-emerald-700 text-white shadow':'text-slate-500 hover:bg-slate-50'}`}>{label}</button>)}
        </div>
      </section>

      {tab==='mark'&&<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b bg-slate-50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-wide text-slate-500">Attendance date</div>
              <div className="mt-1 text-lg font-black text-slate-900">{fmtDate(selectedDate)}</div>
              <p className="mt-1 text-xs text-slate-500">{isFuture?'Future dates are view-only and cannot be marked.':'You can mark today or correct/complete a previous date. Tomorrow and later are blocked.'}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input type="date" value={selectedDate} max={today} onChange={e=>setSelectedDate(e.target.value)} className="input h-11" />
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search boarding student…" className="input h-11 w-56" />
              <button onClick={()=>refreshDay(selectedDate)} className="rounded-xl border px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">Refresh</button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide">
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">Present {present}</span>
            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">Late {late}</span>
            <span className="rounded-full bg-rose-50 px-3 py-1.5 text-rose-700">Absent {absent}</span>
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">Excused {excused}</span>
            <span className="rounded-full bg-violet-50 px-3 py-1.5 text-violet-700">Coverage {coverage}%</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-white text-[10px] uppercase tracking-[.12em] text-slate-400">
              <tr><th className="px-5 py-3">Student</th><th className="px-3 py-3">Class</th><th className="px-3 py-3">Current status</th><th className="px-4 py-3 text-right">Mark attendance</th></tr>
            </thead>
            <tbody>
              {loading?<tr><td colSpan={4} className="p-10 text-center text-sm text-slate-400">Loading boarding students…</td></tr>:
              filteredRows.length===0?<tr><td colSpan={4} className="p-10 text-center text-sm text-slate-400">No assigned boarding students match this view.</td></tr>:
              filteredRows.map(row=><tr key={row.studentId} className="border-t hover:bg-slate-50/70">
                <td className="px-5 py-3"><div className="font-black text-slate-900">{row.fullName}</div><div className="text-xs text-slate-400">{row.admissionNo||'—'}</div></td>
                <td className="px-3 py-3 text-xs font-semibold text-slate-500">{row.className||'—'}</td>
                <td className="px-3 py-3"><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${row.statusCode?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{row.statusLabel||'Not marked'}</span></td>
                <td className="px-4 py-3"><div className="flex justify-end gap-2">
                  <button disabled={saving!==null} onClick={()=>mark(row.studentId,'present')} className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-40">Present</button>
                  <button disabled={saving!==null} onClick={()=>mark(row.studentId,'late')} className="rounded-xl bg-amber-500 px-3 py-2 text-[11px] font-black text-white disabled:opacity-40">Late</button>
                  <button disabled={saving!==null} onClick={()=>mark(row.studentId,'absent')} className="rounded-xl bg-rose-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-40">Absent</button>
                  <button disabled={saving!==null} onClick={()=>mark(row.studentId,'excused')} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-black text-blue-700 disabled:opacity-40">Excused</button>
                </div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>}

      {(tab==='history'||tab==='progress')&&<section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b bg-slate-50 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="text-xs font-black uppercase tracking-wide text-slate-500">Date range</div><div className="mt-1 text-lg font-black text-slate-900">Boarding attendance record</div><p className="mt-1 text-xs text-slate-500">History is read-only. Teachers can never create a future attendance record.</p></div>
          <div className="flex flex-wrap gap-2"><label className="text-xs font-bold text-slate-500">From<input type="date" value={fromDate} max={today} onChange={e=>setFromDate(e.target.value)} className="input mt-1 h-10"/></label><label className="text-xs font-bold text-slate-500">To<input type="date" value={toDate} max={today} onChange={e=>setToDate(e.target.value)} className="input mt-1 h-10"/></label><button onClick={refreshHistory} className="self-end rounded-xl border px-4 py-2 text-sm font-black hover:bg-white">Refresh</button></div>
        </div>
        {tab==='history'?(<div className="overflow-x-auto">{historyLoading?<div className="p-10 text-center text-sm text-slate-400">Loading history…</div>:<table className="w-full min-w-[900px] text-left text-sm"><thead className="text-[10px] uppercase tracking-[.12em] text-slate-400"><tr><th className="px-5 py-3">Date</th><th>Student</th><th>Class</th><th>Status</th><th>Review</th><th>Recorded</th></tr></thead><tbody>{history.map(h=><tr key={`${h.studentId}-${h.attendanceDate}-${h.recordedAt}`} className="border-t"><td className="px-5 py-3 font-semibold text-slate-600">{fmtDate(h.attendanceDate)}</td><td className="font-black">{h.fullName}<div className="text-xs font-normal text-slate-400">{h.admissionNo||'—'}</div></td><td className="text-xs text-slate-500">{h.className||'—'}</td><td><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase">{h.statusLabel||h.statusCode}</span></td><td className="text-xs capitalize text-slate-500">{h.reviewStatus}</td><td className="text-xs text-slate-400">{new Date(h.recordedAt).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</td></tr>)}{!history.length&&<tr><td colSpan={6} className="p-10 text-center text-sm text-slate-400">No boarding attendance records in this range.</td></tr>}</tbody></table>}</div>):(<div className="overflow-x-auto">{historyLoading?<div className="p-10 text-center text-sm text-slate-400">Calculating progress…</div>:<table className="w-full min-w-[900px] text-left text-sm"><thead className="text-[10px] uppercase tracking-[.12em] text-slate-400"><tr><th className="px-5 py-3">Student</th><th>Recorded days</th><th>Present</th><th>Late</th><th>Absent</th><th>Excused</th><th>Coverage</th><th>Presence rate*</th></tr></thead><tbody>{progress.map(p=>{const rate=p.possible?Math.round(((p.present+p.late)/p.possible)*100):0;const cov=p.possible?Math.round((p.recorded/p.possible)*100):0;return <tr key={p.row.studentId} className="border-t"><td className="px-5 py-3 font-black">{p.row.fullName}<div className="text-xs font-normal text-slate-400">{p.row.className||'—'}</div></td><td>{p.recorded}/{p.possible}</td><td className="font-bold text-emerald-700">{p.present}</td><td className="font-bold text-amber-700">{p.late}</td><td className="font-bold text-rose-700">{p.absent}</td><td className="font-bold text-blue-700">{p.excused}</td><td>{cov}%</td><td className="font-black text-slate-700">{rate}%</td></tr>);})}</tbody></table>}
          <div className="border-t p-4 text-[11px] text-slate-400">* Presence rate counts Present + Late as attended and uses calendar days in the selected range as the denominator.</div></div>)}
      </section>}
    </div>
  </AdminShell>;
}
