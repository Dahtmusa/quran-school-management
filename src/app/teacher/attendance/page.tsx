'use client';

// Teacher's boarding attendance page. Shows only boarding students assigned
// to the signed-in teacher via teacher_students; marks flow into
// attendance_records and appear on the admin dashboard live.

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { attendanceApi, type AttendanceStatus, type TeacherBoardingRow } from '@/lib/attendance/api';

const STATUSES: [AttendanceStatus, string][] = [
  ['present', 'Present'],
  ['late',    'Late'],
  ['absent',  'Absent'],
  ['excused', 'Excused'],
];
const PILL: Record<string, string> = {
  present: 'bg-emerald-50 text-emerald-700',
  late:    'bg-amber-50 text-amber-700',
  absent:  'bg-rose-50 text-rose-700',
  excused: 'bg-sky-50 text-sky-700',
};

export default function TeacherAttendancePage() {
  const todayLagos = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const [date, setDate] = useState(todayLagos);
  const [rows, setRows] = useState<TeacherBoardingRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setMessage('');
    try {
      const r = await attendanceApi.teacherRoster(date);
      setRows(r.rows);
    } catch (e: any) { setMessage(e?.message || 'Could not load boarding roster.'); setRows([]); }
    finally { setLoading(false); }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  // Optimistic per-row mark: paint the new status immediately, hit the API
  // in the background, and revert only if the server rejects. No full-page
  // reload, so the teacher sees no flicker.
  const mark = async (studentId: string, status: AttendanceStatus) => {
    const before = rows;
    setSaving(studentId); setMessage('');
    setRows(prev => prev.map(r =>
      r.student_id === studentId
        ? { ...r, status_code: status, scanned_at: new Date().toISOString() }
        : r,
    ));
    try {
      await attendanceApi.teacherMark(studentId, status, date);
    } catch (e: any) {
      setRows(before);
      setMessage(e?.message || 'Could not save attendance.');
    } finally { setSaving(''); }
  };

  // Bulk: mark every unmarked boarding student as Present. Runs the API
  // calls in parallel, optimistic first so the roster looks right at once.
  const markAllPresent = async () => {
    const unmarked = rows.filter(r => !r.status_code);
    if (unmarked.length === 0) { setMessage('Everyone is already marked.'); return; }
    if (!confirm(`Mark all ${unmarked.length} unmarked boarding students as Present?`)) return;
    const before = rows;
    setSaving('bulk'); setMessage('');
    setRows(prev => prev.map(r =>
      r.status_code ? r : { ...r, status_code: 'present', scanned_at: new Date().toISOString() },
    ));
    try {
      const results = await Promise.allSettled(
        unmarked.map(r => attendanceApi.teacherMark(r.student_id, 'present', date)),
      );
      const failed = results.filter(x => x.status === 'rejected').length;
      if (failed) {
        setMessage(`${unmarked.length - failed} saved · ${failed} failed. Refreshing…`);
        await load();
      } else {
        setMessage(`Marked ${unmarked.length} boarding students as present.`);
      }
    } catch (e: any) {
      setRows(before);
      setMessage(e?.message || 'Bulk mark failed.');
    } finally { setSaving(''); }
  };

  const filtered = useMemo(() => rows.filter(r => {
    const q = search.toLowerCase().trim(); if (!q) return true;
    return [r.full_name, r.admission_no, r.class_name].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
  }), [rows, search]);

  const counts = {
    present: rows.filter(r => r.status_code === 'present').length,
    late:    rows.filter(r => r.status_code === 'late').length,
    absent:  rows.filter(r => r.status_code === 'absent').length,
    excused: rows.filter(r => r.status_code === 'excused').length,
    unmarked: rows.filter(r => !r.status_code).length,
  };

  return <AdminShell title="Boarding Attendance">
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-[#062d2a] p-6 text-white">
        <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#e3c36b]">Teacher attendance</div>
        <h1 className="mt-2 text-3xl font-black">Boarding Students</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">Only boarding students assigned to you appear here. Day students are recorded at the main gate.</p>
      </section>

      {message && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-slate-500">Attendance date</div>
            <div className="mt-1 text-lg font-black">{date}</div>
            <div className="mt-1 text-xs text-slate-500">
              {counts.unmarked > 0
                ? `${counts.unmarked} still unmarked · ${rows.length} total`
                : `All ${rows.length} students marked`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input type="date" value={date} max={todayLagos} onChange={e => setDate(e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="h-11 rounded-xl border border-slate-200 px-3" />
            <button
              onClick={markAllPresent}
              disabled={saving === 'bulk' || counts.unmarked === 0}
              className="h-11 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white shadow disabled:bg-slate-200 disabled:text-slate-400"
              title={counts.unmarked === 0 ? 'Everyone is already marked' : `Mark ${counts.unmarked} unmarked as Present`}
            >
              {saving === 'bulk' ? 'Marking…' : `✓ Mark all Present${counts.unmarked ? ` (${counts.unmarked})` : ''}`}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Kpi tone="emerald" label="Present" value={counts.present} />
          <Kpi tone="amber"   label="Late"    value={counts.late} />
          <Kpi tone="rose"    label="Absent"  value={counts.absent} />
          <Kpi tone="sky"     label="Excused" value={counts.excused} />
          <Kpi tone="slate"   label="Not marked" value={counts.unmarked} />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="p-10 text-center text-sm text-slate-400">Loading assigned boarding students…</div>
        : filtered.length === 0 ? <div className="p-10 text-center text-sm text-slate-400">No assigned boarding students found.</div>
        : <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-[.12em] text-slate-400">
              <tr><th className="px-5 py-3">Student</th><th>Class</th><th>Status</th><th className="px-5 py-3 text-right">Mark</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => <tr key={r.student_id} className="border-t">
                <td className="px-5 py-4"><div className="font-black">{r.full_name}</div><div className="text-xs text-slate-400">{r.admission_no || '—'}</div></td>
                <td className="text-slate-500">{r.class_name || '—'}</td>
                <td>
                  <span className={'inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase ' + (PILL[r.status_code || ''] || 'bg-slate-100 text-slate-500')}>
                    {r.status_code || 'Not marked'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    {STATUSES.map(([code, label]) => (
                      <button key={code} disabled={!!saving} onClick={() => mark(r.student_id, code)}
                        className="rounded-lg bg-[#062d2a] px-3 py-2 text-[11px] font-black text-white disabled:opacity-40">
                        {label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </section>
    </div>
  </AdminShell>;
}

function Kpi({ tone, label, value }: { tone: 'emerald'|'amber'|'rose'|'sky'|'slate'; label: string; value: number }) {
  const styles = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber:   'bg-amber-50 text-amber-700',
    rose:    'bg-rose-50 text-rose-700',
    sky:     'bg-sky-50 text-sky-700',
    slate:   'bg-slate-50 text-slate-600',
  }[tone];
  return <div className={'rounded-xl p-3 ' + styles}>
    <div className="text-lg font-black">{value}</div>
    <div className="text-[11px] font-bold uppercase tracking-wide">{label}</div>
  </div>;
}
