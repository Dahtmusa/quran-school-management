'use client';
import AdminShell from '@/components/AdminShell';
import Link from 'next/link';
import {
  assignTeacherToClass, createClass, deleteClass, loadAcademicYears,
  loadClasses, loadStaffProfiles, removeTeacherFromClass, updateClass,
  type LiveClass,
} from '@/lib/live-store';
import { useEffect, useState } from 'react';

type Teacher = {
  id: string; name: string; full_name?: string; staff_id?: string;
  avatar_url?: string | null; phone?: string | null; job_title?: string | null;
  department?: string | null; employment_status?: string; id_expires_on?: string | null;
};
type AcademicYear = { id: string; name: string; is_current: boolean };
type ClassForm = {
  name: string; code: string; academicYearId: string;
  programYear: string; capacity: string; active: boolean;
};

const EMPTY_FORM: ClassForm = {
  name: '', code: '', academicYearId: '', programYear: '', capacity: '', active: true,
};

export default function ClassesPage() {
  const [classes,  setClasses]  = useState<LiveClass[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [years,    setYears]    = useState<AcademicYear[]>([]);
  const [busy,     setBusy]     = useState(false);
  const [message,  setMessage]  = useState('');

  /* modal state */
  const [showCreate,  setShowCreate]  = useState(false);
  const [editTarget,  setEditTarget]  = useState<LiveClass | null>(null);
  const [deleteTarget,setDeleteTarget]= useState<LiveClass | null>(null);

  /* forms */
  const [createForm, setCreateForm] = useState<ClassForm>(EMPTY_FORM);
  const [editForm,   setEditForm]   = useState<ClassForm>(EMPTY_FORM);

  /* teacher assignment */
  const [selectedTeacher, setSelectedTeacher] = useState<Record<string, string>>({});

  const refresh = async () => {
    const [c, t, y] = await Promise.all([loadClasses(), loadStaffProfiles(), loadAcademicYears()]);
    setClasses(c);
    setTeachers(
      t.filter((x: any) => x.role === 'teacher').map((x: any) => ({ ...x, name: x.full_name }))
    );
    setYears(y);
  };

  useEffect(() => { refresh(); }, []);

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  }

  /* ── Create class ── */
  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createClass({
        name: createForm.name,
        code: createForm.code,
        academicYearId: createForm.academicYearId || null,
        programYear: (createForm.programYear || null) as any,
        capacity: createForm.capacity ? Number(createForm.capacity) : null,
      });
      setCreateForm(EMPTY_FORM);
      setShowCreate(false);
      await refresh();
      flash('Class created successfully.');
    } catch (err: any) {
      flash(err?.message ?? 'Unable to create class.');
    } finally {
      setBusy(false);
    }
  }

  /* ── Edit class ── */
  function openEdit(cls: LiveClass) {
    setEditForm({
      name: cls.name,
      code: cls.code,
      academicYearId: cls.academicYearId ?? '',
      programYear: cls.programYear === 'Year 1' ? 'year_1' : cls.programYear === 'Year 2' ? 'year_2' : '',
      capacity: cls.capacity ? String(cls.capacity) : '',
      active: cls.active,
    });
    setEditTarget(cls);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setBusy(true);
    try {
      await updateClass(editTarget.id, {
        name: editForm.name,
        code: editForm.code,
        academicYearId: editForm.academicYearId || null,
        programYear: (editForm.programYear || null) as any,
        capacity: editForm.capacity ? Number(editForm.capacity) : null,
        active: editForm.active,
      });
      setEditTarget(null);
      await refresh();
      flash('Class updated successfully.');
    } catch (err: any) {
      flash(err?.message ?? 'Unable to update class.');
    } finally {
      setBusy(false);
    }
  }

  /* ── Delete class ── */
  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteClass(deleteTarget.id);
      setDeleteTarget(null);
      await refresh();
      flash(`"${deleteTarget.name}" deleted.`);
    } catch (err: any) {
      flash(err?.message ?? 'Unable to delete class.');
    } finally {
      setBusy(false);
    }
  }

  /* ── Teacher assignment ── */
  async function addTeacher(classId: string) {
    const teacherId = selectedTeacher[classId];
    if (!teacherId) return;
    setBusy(true);
    try {
      await assignTeacherToClass(classId, teacherId, false);
      await refresh();
      setSelectedTeacher(v => ({ ...v, [classId]: '' }));
      flash('Teacher assigned.');
    } catch (err: any) {
      flash(err?.message ?? 'Unable to assign teacher.');
    } finally {
      setBusy(false);
    }
  }

  async function removeTeacher(classId: string, teacherId: string) {
    setBusy(true);
    try {
      await removeTeacherFromClass(classId, teacherId);
      await refresh();
      flash('Teacher removed.');
    } catch (err: any) {
      flash(err?.message ?? 'Unable to remove teacher.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Classes & Teachers">
      <div className="space-y-6">

        {/* Hero banner */}
        <section className="rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-[#a17821] p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">
                People &amp; classroom control
              </div>
              <h2 className="mt-2 text-3xl font-black">Build the right teaching team.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/80">
                Create teachers, give them professional profiles, assign them to classes and print
                school ID cards. Class assignments automatically determine their student work queues.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/staff" className="btn bg-white/10 text-white">Manage staff →</Link>
              <button className="btn bg-white text-emerald-950" onClick={() => setShowCreate(true)}>
                + Create class
              </button>
            </div>
          </div>
        </section>

        {/* Flash message */}
        {message && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
            {message}
          </div>
        )}

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Teachers"           value={teachers.length} />
          <Kpi label="Active classes"     value={classes.filter(c => c.active).length} />
          <Kpi label="Total students"     value={classes.reduce((s, c) => s + c.studentCount, 0)} />
          <Kpi label="Unassigned classes" value={classes.filter(c => c.teachers.length === 0).length} />
        </div>

        {/* Staff banner */}
        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div>
            <div className="text-sm font-bold text-emerald-900">
              Teachers — {teachers.length} on record
            </div>
            <div className="mt-0.5 text-xs text-emerald-700">
              Create, edit profiles, upload photos and manage website visibility from Staff.
            </div>
          </div>
          <Link href="/staff" className="btn bg-emerald-700 text-white text-sm">Open Staff →</Link>
        </div>

        {/* Classes grid */}
        <section>
          <div className="mb-3">
            <h2 className="text-xl font-black">Classes &amp; assignments</h2>
            <p className="text-sm text-slate-500">
              Assign one or more teachers. The primary teacher is used for the evaluation work queue
              when an evaluation is sent.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {classes.map(c => (
              <div className="card p-5" key={c.id}>
                {/* Card header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{c.code}</div>
                    <h2 className="text-xl font-black">{c.name}</h2>
                    <div className="mt-1 text-sm text-slate-500">
                      {c.academicYearName ?? 'No academic year'} · {c.programYear ?? 'Programme year not set'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`pill ${c.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                    {/* Edit button */}
                    <button
                      onClick={() => openEdit(c)}
                      title="Edit class"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H2v-3L11.5 2.5z"/>
                      </svg>
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={() => setDeleteTarget(c)}
                      title="Delete class"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-100 bg-white text-rose-400 hover:border-rose-300 hover:text-rose-600 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Teachers panel */}
                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-bold uppercase text-slate-400">Assigned teachers</div>
                  <div className="mt-2 space-y-2">
                    {c.teachers.length
                      ? c.teachers.map(t => (
                        <div className="flex items-center justify-between rounded-xl bg-white p-3" key={t.id}>
                          <span className="text-sm font-semibold">{t.name}{t.primary ? ' · Primary' : ''}</span>
                          <button
                            className="text-xs font-bold text-rose-600"
                            onClick={() => removeTeacher(c.id, t.id)}
                            disabled={busy}
                          >
                            Remove
                          </button>
                        </div>
                      ))
                      : <div className="text-sm text-slate-500">No teachers assigned yet.</div>
                    }
                  </div>
                  <div className="mt-3 flex gap-2">
                    <select
                      className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
                      value={selectedTeacher[c.id] ?? ''}
                      onChange={e => setSelectedTeacher(v => ({ ...v, [c.id]: e.target.value }))}
                    >
                      <option value="">Select teacher...</option>
                      {teachers.filter(t => !c.teachers.some(ct => ct.id === t.id)).map(t => (
                        <option value={t.id} key={t.id}>
                          {t.name}{t.staff_id ? ` · ${t.staff_id}` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn bg-slate-900 text-white"
                      onClick={() => addTeacher(c.id)}
                      disabled={busy || !selectedTeacher[c.id]}
                    >
                      Assign
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500">
                    Capacity: {c.capacity ?? 'Not set'}
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-slate-500" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="8" cy="5" r="3"/>
                      <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5"/>
                    </svg>
                    <span className="text-xs font-bold text-slate-700">
                      {c.studentCount} student{c.studentCount !== 1 ? 's' : ''}
                    </span>
                    {c.capacity && (
                      <span className="text-xs text-slate-400">/ {c.capacity}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!classes.length && (
            <div className="card p-8 text-center text-sm text-slate-500">
              No classes have been created yet.
            </div>
          )}
        </section>
      </div>

      {/* ══ Create modal ══ */}
      {showCreate && (
        <Modal title="Create class" sub="Classes are shared across Day and Boarding." onClose={() => setShowCreate(false)}>
          <ClassForm
            form={createForm}
            years={years}
            busy={busy}
            onChange={setCreateForm}
            onSubmit={submitCreate}
            onCancel={() => setShowCreate(false)}
            submitLabel="Create class"
            busyLabel="Creating…"
          />
        </Modal>
      )}

      {/* ══ Edit modal ══ */}
      {editTarget && (
        <Modal title="Edit class" sub={`Editing ${editTarget.name}`} onClose={() => setEditTarget(null)}>
          <ClassForm
            form={editForm}
            years={years}
            busy={busy}
            showActive
            onChange={setEditForm}
            onSubmit={submitEdit}
            onCancel={() => setEditTarget(null)}
            submitLabel="Save changes"
            busyLabel="Saving…"
          />
        </Modal>
      )}

      {/* ══ Delete confirmation ══ */}
      {deleteTarget && (
        <Modal title="Delete class?" sub="" onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Are you sure you want to permanently delete{' '}
              <strong className="text-slate-900">{deleteTarget.name}</strong>?
              Teacher assignments will also be removed. This cannot be undone.
            </p>
            {deleteTarget.teachers.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                This class has {deleteTarget.teachers.length} teacher
                {deleteTarget.teachers.length > 1 ? 's' : ''} assigned. Their assignments will be removed.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn bg-slate-100" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                className="btn bg-rose-600 text-white hover:bg-rose-700"
                onClick={confirmDelete}
                disabled={busy}
              >
                {busy ? 'Deleting…' : 'Delete class'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AdminShell>
  );
}

/* ── Shared modal shell ── */
function Modal({
  title, sub, onClose, children,
}: {
  title: string; sub: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
      <div className="mx-auto mt-8 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black">{title}</h2>
            {sub && <p className="text-sm text-slate-500">{sub}</p>}
          </div>
          <button className="btn bg-slate-100" onClick={onClose}>Close</button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

/* ── Shared class form ── */
function ClassForm({
  form, years, busy, showActive = false, onChange, onSubmit, onCancel, submitLabel, busyLabel,
}: {
  form: ClassForm;
  years: AcademicYear[];
  busy: boolean;
  showActive?: boolean;
  onChange: (f: ClassForm) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  busyLabel: string;
}) {
  const set = (patch: Partial<ClassForm>) => onChange({ ...form, ...patch });
  return (
    <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
      <input
        required className="input"
        placeholder="Class name e.g. Year 1 A"
        value={form.name}
        onChange={e => set({ name: e.target.value })}
      />
      <input
        required className="input uppercase"
        placeholder="Class code e.g. Y1-A"
        value={form.code}
        onChange={e => set({ code: e.target.value })}
      />
      <select className="input" value={form.academicYearId} onChange={e => set({ academicYearId: e.target.value })}>
        <option value="">No academic year</option>
        {years.map(y => (
          <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' · Current' : ''}</option>
        ))}
      </select>
      <select className="input" value={form.programYear} onChange={e => set({ programYear: e.target.value })}>
        <option value="">Programme year</option>
        <option value="year_1">Year 1</option>
        <option value="year_2">Year 2</option>
      </select>
      <input
        min="1" type="number" className="input"
        placeholder="Capacity (optional)"
        value={form.capacity}
        onChange={e => set({ capacity: e.target.value })}
      />
      {showActive && (
        <label className="input flex cursor-pointer items-center gap-3 select-none">
          <input
            type="checkbox"
            checked={form.active}
            onChange={e => set({ active: e.target.checked })}
            className="h-4 w-4 rounded accent-emerald-700"
          />
          <span className="text-sm font-semibold">Class is active</span>
        </label>
      )}
      <div className="flex justify-end gap-2 md:col-span-2">
        <button type="button" className="btn bg-slate-100" onClick={onCancel}>Cancel</button>
        <button disabled={busy} className="btn btn-primary">{busy ? busyLabel : submitLabel}</button>
      </div>
    </form>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-3xl font-black">{value}</div>
    </div>
  );
}
