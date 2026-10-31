'use client';
// Read-only roster for teachers. Teachers can no longer edit student
// records from here. The only legitimate path to move a student's
// Qur'an position is through the evaluation flow: teacher submits ->
// admin approves -> system advances the official profile.
import AdminShell from '@/components/AdminShell';
import { loadTeacherDirectory } from '@/lib/live-store';
import { useEffect, useMemo, useState } from 'react';

function directionLabel(v: string) {
  return v === 'nas_to_baqarah' ? 'Nas → Baqarah' : 'Baqarah → Nas';
}

export default function TeacherStudents() {
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      try { setStudents(await loadTeacherDirectory()); }
      catch (e: any) { setMessage(e?.message || 'Unable to load your students.'); }
    })();
  }, []);

  const filtered = useMemo(
    () => students.filter(s => !search || `${s.name} ${s.admissionNo}`.toLowerCase().includes(search.toLowerCase())),
    [students, search],
  );

  return <AdminShell title="My Students"><div className="space-y-5">

    <section className="rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-slate-900 p-6 text-white shadow-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">Teacher view</div>
          <h1 className="mt-2 text-3xl font-black">My Students</h1>
          <p className="mt-2 max-w-2xl text-sm text-emerald-50/80">
            View your assigned students, their current Qur'an position and overall progress. Positions move through the evaluation flow only.
          </p>
        </div>
        <div className="rounded-2xl bg-white/10 px-4 py-3 text-center">
          <div className="text-2xl font-black">{students.length}</div>
          <div className="text-[10px] uppercase tracking-wider text-white/60">Assigned</div>
        </div>
      </div>
    </section>

    {message && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">{message}</div>}

    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black">Student roster</h2>
          <p className="text-xs text-slate-500">Read only. Changes to a student's position are recorded through the Evaluations page.</p>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name or admission no..."
          className="rounded-xl border px-3 py-2 text-sm sm:w-64" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Direction</th>
              <th className="px-3 py-3">Started at</th>
              <th className="px-3 py-3">Current position</th>
              <th className="px-3 py-3">Progress</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => {
              const progress = Math.min(100, Math.max(0, Math.round(Number(s.progressPercent ?? 0))));
              const dirCode = s.direction === 'Nas-to-Baqarah' ? 'nas_to_baqarah' : 'baqarah_to_nas';
              return <tr key={s.id} className="border-t hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="font-black">{s.name}</div>
                  <div className="text-[11px] text-slate-400">{s.admissionNo} · {s.className || 'No class'}</div>
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                    s.status === 'active'    ? 'bg-emerald-50 text-emerald-700'
                  : s.status === 'suspended' ? 'bg-amber-50 text-amber-700'
                  :                            'bg-rose-50 text-rose-700'
                  }`}>
                    {s.status === 'suspended' ? 'Frozen' : s.status === 'withdrawn' ? 'Inactive' : 'Active'}
                  </span>
                </td>
                <td className="px-3 py-3 font-semibold">{directionLabel(dirCode)}</td>
                <td className="px-3 py-3 text-xs text-slate-600">S.{s.start?.surah} : {s.start?.ayah}</td>
                <td className="px-3 py-3 text-xs font-semibold text-emerald-700">S.{s.current?.surah} : {s.current?.ayah}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[10px] font-black">{progress}%</span>
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
        {!filtered.length && <div className="p-10 text-center text-sm text-slate-400">No students match your search.</div>}
      </div>
    </section>

    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
      To record this term's evaluation scores or update a student's position, go to <b>Evaluations</b> in the sidebar. Admin reviews and approves every submission.
    </div>
  </div></AdminShell>;
}
