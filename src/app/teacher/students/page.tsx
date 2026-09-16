'use client';
import AdminShell from '@/components/AdminShell';
import { SURAHS } from '@/lib/quran';
import { loadTeacherDirectory, teacherUpdateStudentQuranProfile, teacherSetStudentStatus } from '@/lib/live-store';
import { useEffect, useMemo, useState } from 'react';

function directionLabel(v: string) { return v === 'nas_to_baqarah' ? 'Nas → Baqarah' : 'Baqarah → Nas'; }
export default function TeacherStudents() {
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<any|null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    try { setStudents(await loadTeacherDirectory()); }
    catch (error: any) { setMessage(error?.message || 'Unable to load your students.'); }
  }
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => students.filter(s => !search || `${s.name} ${s.admissionNo}`.toLowerCase().includes(search.toLowerCase())), [students, search]);

  async function saveEdit() {
    if (!edit) return;
    setBusy(true); setMessage('');
    try {
      await teacherUpdateStudentQuranProfile(edit.id, { direction: edit.direction, startSurah: Number(edit.start_surah), startAyah: Number(edit.start_ayah), currentSurah: Number(edit.current_surah), currentAyah: Number(edit.current_ayah) });
      setEdit(null); setMessage(`${edit.name} Quran profile updated in the official student record.`); await load();
    } catch (error: any) { setMessage(error?.message || 'Unable to save Quran profile.'); }
    finally { setBusy(false); }
  }

  async function setStatus(student: any, status: 'active'|'suspended'|'withdrawn') {
    if (status === 'withdrawn' && !window.confirm(`Make ${student.name} inactive? All academic and historical records will be preserved.`)) return;
    setBusy(true); setMessage('');
    try {
      await teacherSetStudentStatus(student.id, status);
      setMessage(status === 'suspended' ? `${student.name} has been frozen.` : status === 'withdrawn' ? `${student.name} is now inactive.` : `${student.name} is active again.`);
      await load();
    } catch (error: any) { setMessage(error?.message || 'Unable to update student status.'); }
    finally { setBusy(false); }
  }

  return <AdminShell title="My Students"><div className="space-y-5">
    <section className="rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-slate-900 p-6 text-white shadow-xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">Teacher student management</div><h1 className="mt-2 text-3xl font-black">My Students</h1><p className="mt-2 max-w-2xl text-sm text-emerald-50/80">Maintain the official Quran direction and current memorization position. Freeze or mark a student inactive without deleting their records.</p></div><div className="rounded-2xl bg-white/10 px-4 py-3 text-center"><div className="text-2xl font-black">{students.length}</div><div className="text-[10px] uppercase tracking-wider text-white/60">Assigned</div></div></div></section>
    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div>}
    <section className="card overflow-hidden"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black">Student Quran profiles</h2><p className="text-xs text-slate-500">This table reads the same teacher/student directory source used by the teacher workspace.</p></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or admission no…" className="rounded-xl border px-3 py-2 text-sm sm:w-64"/></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Direction</th><th className="px-3 py-3">Start</th><th className="px-3 py-3">Current</th><th className="px-3 py-3">Progress</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody>{filtered.map(s=>{const progress=Math.min(100,Math.max(0,Math.round(Number(s.progressPercent ?? 0))));return <tr key={s.id} className="border-t hover:bg-slate-50/60"><td className="px-4 py-3"><div className="font-black">{s.name}</div><div className="text-[11px] text-slate-400">{s.admissionNo} · {s.className || 'No class'}</div></td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${s.status==='active'?'bg-emerald-50 text-emerald-700':s.status==='suspended'?'bg-amber-50 text-amber-700':'bg-rose-50 text-rose-700'}`}>{s.status==='suspended'?'Frozen':s.status==='withdrawn'?'Inactive':'Active'}</span></td><td className="px-3 py-3 font-semibold">{directionLabel(s.direction === 'Nas-to-Baqarah' ? 'nas_to_baqarah' : 'baqarah_to_nas')}</td><td className="px-3 py-3 text-xs">S.{s.start?.surah} : {s.start?.ayah}</td><td className="px-3 py-3 text-xs font-semibold text-emerald-700">S.{s.current?.surah} : {s.current?.ayah}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500" style={{width:`${progress}%`}}/></div><span className="text-[10px] font-black">{progress}%</span></div></td><td className="px-3 py-3"><div className="flex justify-end gap-2"><button className="rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-black text-teal-700" onClick={()=>setEdit({...s,direction:s.direction==='Baqarah-to-Nas'?'baqarah_to_nas':'nas_to_baqarah',start_surah:Number(s.start?.surah||114),start_ayah:Number(s.start?.ayah||1),current_surah:Number(s.current?.surah||s.start?.surah||114),current_ayah:Number(s.current?.ayah||1),name:s.name,admissionNo:s.admissionNo})}>Edit Quran</button>{s.status==='active'?<><button disabled={busy} className="rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700" onClick={()=>setStatus(s,'suspended')}>Freeze</button><button disabled={busy} className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700" onClick={()=>setStatus(s,'withdrawn')}>Inactive</button></>:<button disabled={busy} className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700" onClick={()=>setStatus(s,'active')}>Reactivate</button>}</div></td></tr>})}</tbody></table>{!filtered.length&&<div className="p-10 text-center text-sm text-slate-400">No students match your search.</div>}</div>
    </section>

    {edit && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Edit official Quran profile</h2><p className="text-xs text-slate-500">{edit.name} · {edit.admissionNo}</p></div><button className="btn bg-slate-100" onClick={()=>setEdit(null)}>Close</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="text-xs font-black uppercase tracking-wide text-slate-500">Direction<select className="input mt-1 w-full" value={edit.direction} onChange={e=>setEdit({...edit,direction:e.target.value})}><option value="baqarah_to_nas">Baqarah → Nas</option><option value="nas_to_baqarah">Nas → Baqarah</option></select></label><label className="text-xs font-black uppercase tracking-wide text-slate-500">Starting Surah<select className="input mt-1 w-full" value={edit.start_surah} onChange={e=>setEdit({...edit,start_surah:Number(e.target.value),start_ayah:1})}>{SURAHS.map(x=><option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}</select></label><label className="text-xs font-black uppercase tracking-wide text-slate-500">Starting Ayah<select className="input mt-1 w-full" value={edit.start_ayah} onChange={e=>setEdit({...edit,start_ayah:Number(e.target.value)})}>{Array.from({length:SURAHS.find(x=>x.id===Number(edit.start_surah))?.ayahs||286},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label><label className="text-xs font-black uppercase tracking-wide text-slate-500">Current Surah<select className="input mt-1 w-full" value={edit.current_surah} onChange={e=>setEdit({...edit,current_surah:Number(e.target.value),current_ayah:1})}>{SURAHS.map(x=><option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}</select></label><label className="text-xs font-black uppercase tracking-wide text-slate-500">Current Ayah<select className="input mt-1 w-full" value={edit.current_ayah} onChange={e=>setEdit({...edit,current_ayah:Number(e.target.value)})}>{Array.from({length:SURAHS.find(x=>x.id===Number(edit.current_surah))?.ayahs||286},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label></div><p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Saving changes the central students record. Direction, current position, page, Hizb and progress will therefore be consistent wherever the student is displayed. Historical evaluations remain historical snapshots.</p><div className="mt-5 flex justify-end gap-2"><button className="btn bg-slate-100" onClick={()=>setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={saveEdit}>{busy?'Saving…':'Save official record'}</button></div></div></div>}
  </div></AdminShell>;
}
