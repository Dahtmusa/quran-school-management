'use client';
import AdminShell from '@/components/AdminShell';
import { createClient } from '@/lib/supabase/client';
import { SURAHS, positionOrdinal } from '@/lib/quran';
import { useEffect, useMemo, useState } from 'react';

function directionLabel(v: string) { return v === 'nas_to_baqarah' ? 'Nas → Baqarah' : 'Baqarah → Nas'; }
function pct(s: any) {
  const b = s.memorization_direction !== 'nas_to_baqarah';
  const start = positionOrdinal({ surah: Number(s.start_surah || (b ? 2 : 114)), ayah: Number(s.start_ayah || 1) });
  const cur = positionOrdinal({ surah: Number(s.current_surah || s.start_surah || (b ? 2 : 114)), ayah: Number(s.current_ayah || 1) });
  const end = positionOrdinal({ surah: b ? 114 : 2, ayah: 1 });
  const total = Math.abs(end - start);
  const moved = b ? Math.max(0, cur - start) : Math.max(0, start - cur);
  return total ? Math.min(100, Math.round(moved / total * 100)) : 0;
}

export default function TeacherStudents() {
  const db = createClient();
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<any|null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    const { data, error } = await db.rpc('get_teacher_student_directory');
    if (error) { setMessage(error.message); return; }
    setStudents(data || []);
  }
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => students.filter(s => !search || `${s.full_name} ${s.admission_no}`.toLowerCase().includes(search.toLowerCase())), [students, search]);

  async function saveEdit() {
    if (!edit) return;
    setBusy(true); setMessage('');
    const { error } = await db.rpc('teacher_update_student_quran_profile', { p_student_id: edit.student_id, p_direction: edit.direction, p_current_surah: Number(edit.current_surah), p_current_ayah: Number(edit.current_ayah) });
    if (error) setMessage(error.message);
    else { setEdit(null); setMessage(`${edit.full_name} Quran profile updated.`); await load(); }
    setBusy(false);
  }

  async function setStatus(student: any, status: 'active'|'suspended'|'withdrawn') {
    if (status === 'withdrawn' && !window.confirm(`Make ${student.full_name} inactive? All academic and historical records will be preserved.`)) return;
    setBusy(true); setMessage('');
    const { error } = await db.rpc('teacher_set_student_status', { p_student_id: student.student_id, p_status: status });
    if (error) setMessage(error.message);
    else { setMessage(status === 'suspended' ? `${student.full_name} has been frozen.` : status === 'withdrawn' ? `${student.full_name} is now inactive.` : `${student.full_name} is active again.`); await load(); }
    setBusy(false);
  }

  return <AdminShell title="My Students"><div className="space-y-5">
    <section className="rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-slate-900 p-6 text-white shadow-xl"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">Teacher student management</div><h1 className="mt-2 text-3xl font-black">My Students</h1><p className="mt-2 max-w-2xl text-sm text-emerald-50/80">Maintain Quran direction and current memorization position. Freeze or mark a student inactive without deleting their records.</p></div><div className="rounded-2xl bg-white/10 px-4 py-3 text-center"><div className="text-2xl font-black">{students.length}</div><div className="text-[10px] uppercase tracking-wider text-white/60">Assigned</div></div></div></section>
    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div>}
    <section className="card overflow-hidden"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black">Student Quran profiles</h2><p className="text-xs text-slate-500">Only students assigned to your teacher account are shown.</p></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or admission no…" className="rounded-xl border px-3 py-2 text-sm sm:w-64"/></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Direction</th><th className="px-3 py-3">Start</th><th className="px-3 py-3">Current</th><th className="px-3 py-3">Progress</th><th className="px-3 py-3 text-right">Actions</th></tr></thead><tbody>{filtered.map(s=>{const progress=pct(s);return <tr key={s.student_id} className="border-t hover:bg-slate-50/60"><td className="px-4 py-3"><div className="font-black">{s.full_name}</div><div className="text-[11px] text-slate-400">{s.admission_no} · {s.class_name || 'No class'}</div></td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${s.status==='active'?'bg-emerald-50 text-emerald-700':s.status==='suspended'?'bg-amber-50 text-amber-700':'bg-rose-50 text-rose-700'}`}>{s.status==='suspended'?'Frozen':s.status==='withdrawn'?'Inactive':'Active'}</span></td><td className="px-3 py-3 font-semibold">{directionLabel(s.memorization_direction)}</td><td className="px-3 py-3 text-xs">S.{s.start_surah} : {s.start_ayah}</td><td className="px-3 py-3 text-xs font-semibold text-emerald-700">S.{s.current_surah} : {s.current_ayah}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500" style={{width:`${progress}%`}}/></div><span className="text-[10px] font-black">{progress}%</span></div></td><td className="px-3 py-3"><div className="flex justify-end gap-2"><button className="rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-black text-teal-700" onClick={()=>setEdit({...s,direction:s.memorization_direction,current_surah:Number(s.current_surah||s.start_surah||2),current_ayah:Number(s.current_ayah||1)})}>Edit Quran</button>{s.status==='active'?<><button disabled={busy} className="rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700" onClick={()=>setStatus(s,'suspended')}>Freeze</button><button disabled={busy} className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700" onClick={()=>setStatus(s,'withdrawn')}>Inactive</button></>:<button disabled={busy} className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700" onClick={()=>setStatus(s,'active')}>Reactivate</button>}</div></td></tr>})}</tbody></table>{!filtered.length&&<div className="p-10 text-center text-sm text-slate-400">No students match your search.</div>}</div>
    </section>

    {edit && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Edit Quran profile</h2><p className="text-xs text-slate-500">{edit.full_name} · {edit.admission_no}</p></div><button className="btn bg-slate-100" onClick={()=>setEdit(null)}>Close</button></div><div className="mt-5 grid gap-4 sm:grid-cols-3"><label className="text-xs font-black uppercase tracking-wide text-slate-500">Direction<select className="input mt-1 w-full" value={edit.direction} onChange={e=>setEdit({...edit,direction:e.target.value})}><option value="baqarah_to_nas">Baqarah → Nas</option><option value="nas_to_baqarah">Nas → Baqarah</option></select></label><label className="text-xs font-black uppercase tracking-wide text-slate-500">Current Surah<select className="input mt-1 w-full" value={edit.current_surah} onChange={e=>setEdit({...edit,current_surah:Number(e.target.value),current_ayah:1})}>{SURAHS.map(x=><option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}</select></label><label className="text-xs font-black uppercase tracking-wide text-slate-500">Current Ayah<select className="input mt-1 w-full" value={edit.current_ayah} onChange={e=>setEdit({...edit,current_ayah:Number(e.target.value)})}>{Array.from({length:SURAHS.find(x=>x.id===Number(edit.current_surah))?.ayahs||286},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label></div><p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">This changes the student's live Quran profile and is recorded in the audit log. Historical evaluations remain historical snapshots.</p><div className="mt-5 flex justify-end gap-2"><button className="btn bg-slate-100" onClick={()=>setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={saveEdit}>{busy?'Saving…':'Save changes'}</button></div></div></div>}
  </div></AdminShell>;
}
