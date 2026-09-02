'use client';
import AdminShell from '@/components/AdminShell';
import { assignTeacherToClass, createClass, loadAcademicYears, loadClasses, loadTeachers, removeTeacherFromClass, type LiveClass } from '@/lib/live-store';
import { useEffect, useState } from 'react';

type Teacher = { id: string; name: string };
type AcademicYear = { id: string; name: string; is_current: boolean };

export default function ClassesPage() {
  const [classes, setClasses] = useState<LiveClass[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', code: '', academicYearId: '', section: '', programYear: '', capacity: '' });
  const [selectedTeacher, setSelectedTeacher] = useState<Record<string, string>>({});

  async function refresh() {
    const [c, t, y] = await Promise.all([loadClasses(), loadTeachers(), loadAcademicYears()]);
    setClasses(c); setTeachers(t); setYears(y);
  }
  useEffect(() => { refresh(); }, []);

  async function submitClass(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('');
    try {
      await createClass({
        name: form.name,
        code: form.code,
        academicYearId: form.academicYearId || null,
        section: (form.section || null) as 'day' | 'boarding' | null,
        programYear: (form.programYear || null) as 'year_1' | 'year_2' | null,
        capacity: form.capacity ? Number(form.capacity) : null,
      });
      setForm({ name: '', code: '', academicYearId: '', section: '', programYear: '', capacity: '' });
      setShowCreate(false); await refresh(); setMessage('Class created successfully.');
    } catch (err: any) { setMessage(err?.message ?? 'Unable to create class.'); }
    finally { setBusy(false); }
  }

  async function addTeacher(classId: string) {
    const teacherId = selectedTeacher[classId]; if (!teacherId) return;
    setBusy(true); setMessage('');
    try { await assignTeacherToClass(classId, teacherId, false); await refresh(); setSelectedTeacher(v => ({ ...v, [classId]: '' })); setMessage('Teacher assigned.'); }
    catch (err: any) { setMessage(err?.message ?? 'Unable to assign teacher.'); }
    finally { setBusy(false); }
  }

  async function removeTeacher(classId: string, teacherId: string) {
    setBusy(true); setMessage('');
    try { await removeTeacherFromClass(classId, teacherId); await refresh(); setMessage('Teacher assignment removed.'); }
    catch (err: any) { setMessage(err?.message ?? 'Unable to remove assignment.'); }
    finally { setBusy(false); }
  }

  return <AdminShell title="Classes & Teachers">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div><h1 className="text-2xl font-black">Classes</h1><p className="text-sm text-slate-500">Create classes for each programme cohort and assign teachers to them.</p></div>
      <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Create Class</button>
    </div>
    {message && <div className="mt-4 rounded-xl border bg-white p-3 text-sm font-semibold">{message}</div>}

    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      {classes.map(c => <div className="card p-5" key={c.id}>
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-xs font-bold uppercase tracking-wide text-slate-400">{c.code}</div><h2 className="text-xl font-black">{c.name}</h2><div className="mt-1 text-sm text-slate-500">{c.academicYearName ?? 'No academic year'} · {c.programYear ?? 'Programme year not set'} · {c.section ?? 'Section not set'}</div></div>
          <span className={`pill ${c.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100'}`}>{c.active ? 'Active' : 'Inactive'}</span>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase text-slate-400">Assigned teachers</div>
          <div className="mt-2 space-y-2">{c.teachers.length ? c.teachers.map(t => <div className="flex items-center justify-between rounded-lg bg-white p-2" key={t.id}><span className="text-sm font-semibold">{t.name}{t.primary ? ' · Primary' : ''}</span><button className="text-xs font-bold text-rose-600" onClick={() => removeTeacher(c.id, t.id)} disabled={busy}>Remove</button></div>) : <div className="text-sm text-slate-500">No teachers assigned yet.</div>}</div>
          <div className="mt-3 flex gap-2"><select className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" value={selectedTeacher[c.id] ?? ''} onChange={e => setSelectedTeacher(v => ({ ...v, [c.id]: e.target.value }))}><option value="">Select teacher...</option>{teachers.filter(t => !c.teachers.some(ct => ct.id === t.id)).map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select><button className="btn bg-slate-900 text-white" onClick={() => addTeacher(c.id)} disabled={busy || !selectedTeacher[c.id]}>Assign</button></div>
        </div>
        <div className="mt-3 text-xs text-slate-500">Capacity: {c.capacity ?? 'Not set'}</div>
      </div>)}
    </div>
    {!classes.length && <div className="card mt-5 p-8 text-center text-sm text-slate-500">No classes have been created yet.</div>}

    {showCreate && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4"><div className="mx-auto mt-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Create class</h2><p className="text-sm text-slate-500">Admin controls the class structure.</p></div><button onClick={() => setShowCreate(false)}>✕</button></div>
      <form onSubmit={submitClass} className="mt-5 grid gap-3 md:grid-cols-2">
        <input required className="rounded-lg border px-3 py-2" placeholder="Class name e.g. Year 1 A" value={form.name} onChange={e => setForm({...form,name:e.target.value})}/>
        <input required className="rounded-lg border px-3 py-2 uppercase" placeholder="Class code e.g. Y1-A" value={form.code} onChange={e => setForm({...form,code:e.target.value})}/>
        <select className="rounded-lg border px-3 py-2" value={form.academicYearId} onChange={e => setForm({...form,academicYearId:e.target.value})}><option value="">No academic year</option>{years.map(y => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' · Current' : ''}</option>)}</select>
        <select className="rounded-lg border px-3 py-2" value={form.programYear} onChange={e => setForm({...form,programYear:e.target.value})}><option value="">Programme year</option><option value="year_1">Year 1</option><option value="year_2">Year 2</option></select>
        <select className="rounded-lg border px-3 py-2" value={form.section} onChange={e => setForm({...form,section:e.target.value})}><option value="">Section</option><option value="day">Day</option><option value="boarding">Boarding</option></select>
        <input min="1" type="number" className="rounded-lg border px-3 py-2" placeholder="Capacity (optional)" value={form.capacity} onChange={e => setForm({...form,capacity:e.target.value})}/>
        <div className="md:col-span-2 flex justify-end gap-2 pt-2"><button type="button" className="btn bg-slate-100" onClick={() => setShowCreate(false)}>Cancel</button><button disabled={busy} className="btn btn-primary" type="submit">{busy ? 'Saving...' : 'Create class'}</button></div>
      </form>
    </div></div>}
  </AdminShell>;
}
