'use client';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import MemorizationBadge from '@/components/MemorizationBadge';
import { loadTeacherDirectory, loadTeacherEvaluations, recordTeacherAttendance, updateOwnProfile, uploadProfileImage, getCurrentProfile, submitTeacherEvaluation } from '@/lib/live-store';
import { SURAHS, label, calculateEvaluation } from '@/lib/quran';
import { automatedComment } from '@/lib/data';
import { useEffect, useMemo, useState } from 'react';

type EvalForm = { toSurah: number; toAyah: number; mem: number; acc: number; flu: number; taj: number; ret: number; comment: string; };

function loadDraft(evalId: string): EvalForm | null {
  try { const x = localStorage.getItem(`eval_${evalId}`); return x ? JSON.parse(x) : null; } catch { return null; }
}
function saveDraft(evalId: string, form: EvalForm) {
  try { localStorage.setItem(`eval_${evalId}`, JSON.stringify(form)); } catch {}
}
function clearDraft(evalId: string) {
  try { localStorage.removeItem(`eval_${evalId}`); } catch {}
}

export default function TeacherDashboard() {
  const [students, setStudents] = useState<any[]>([]);
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [expandedEval, setExpandedEval] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, EvalForm>>({});

  const refresh = async () => {
    const [s, e] = await Promise.all([loadTeacherDirectory(), loadTeacherEvaluations()]);
    setStudents(s);
    setEvaluations(e);
  };

  useEffect(() => { refresh(); getCurrentProfile().then(setMe); }, []);

  useEffect(() => {
    const active = evaluations.filter(e => e.status === 'draft' || e.status === 'returned');
    setForms(prev => {
      const next = { ...prev };
      for (const ev of active) {
        if (next[ev.id]) continue;
        const saved = loadDraft(ev.id);
        next[ev.id] = saved ?? {
          toSurah: Number(ev.to_surah || ev.students?.current_surah || 2),
          toAyah: Number(ev.to_ayah || ev.students?.current_ayah || 1),
          mem: Number(ev.memorization_score || 4),
          acc: Number(ev.accuracy_score || 4),
          flu: Number(ev.fluency_score || 4),
          taj: Number(ev.tajweed_score || 4),
          ret: Number(ev.retention_score || 4),
          comment: ev.teacher_comment || '',
        };
      }
      return next;
    });
  }, [evaluations]);

  const activeEvals = useMemo(() => evaluations.filter(e => e.status === 'draft' || e.status === 'returned'), [evaluations]);

  const byCampaign = useMemo(() => {
    const map = new Map<string, { campaign: any; evals: any[] }>();
    for (const ev of activeEvals) {
      const cid = ev.campaign_id || 'none';
      if (!map.has(cid)) map.set(cid, { campaign: ev.evaluation_campaigns, evals: [] });
      map.get(cid)!.evals.push(ev);
    }
    return [...map.values()];
  }, [activeEvals]);

  function updateForm(evalId: string, updates: Partial<EvalForm>) {
    setForms(prev => {
      const next = { ...prev, [evalId]: { ...prev[evalId], ...updates } };
      saveDraft(evalId, next[evalId]);
      return next;
    });
  }

  function hasMoved(ev: any): boolean {
    const f = forms[ev.id]; if (!f) return false;
    const dir = ev.students?.memorization_direction;
    const fs = Number(ev.from_surah), fa = Number(ev.from_ayah);
    if (dir === 'baqarah_to_nas') return f.toSurah > fs || (f.toSurah === fs && f.toAyah > fa);
    return f.toSurah < fs || (f.toSurah === fs && f.toAyah < fa);
  }

  async function submitClass(campaignEvals: any[]) {
    if (!campaignEvals.every(ev => hasMoved(ev))) { setMessage('All students must have a valid stopping position before you can submit the class evaluation.'); return; }
    setBusy(true); setMessage('');
    try {
      for (const ev of campaignEvals) {
        const f = forms[ev.id];
        const score = Math.round(((f.mem + f.acc + f.flu + f.taj + f.ret) / 25) * 100);
        await submitTeacherEvaluation({ evaluationId: ev.id, toSurah: f.toSurah, toAyah: f.toAyah, memorization: f.mem, accuracy: f.acc, fluency: f.flu, tajweed: f.taj, retention: f.ret, score, comment: f.comment });
        clearDraft(ev.id);
      }
      setForms({});
      await refresh();
      setMessage('Class evaluation submitted to Admin for review. You will be notified if any are returned.');
    } catch (err: any) { setMessage(err?.message || 'Submission failed. Check that all windows are still open and try again.'); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(file: File | null) {
    if (!file) return; setBusy(true);
    try { const url = await uploadProfileImage(file, 'staff'); setMe((x: any) => ({ ...x, avatar_url: url })); await updateOwnProfile({ avatar_url: url }); setMessage('Profile photo updated.'); }
    catch (e: any) { setMessage(e?.message || 'Photo upload failed'); } finally { setBusy(false); }
  }
  async function mark(studentId: string, status: any) {
    setBusy(true);
    try { await recordTeacherAttendance(studentId, status); setMessage('Attendance recorded.'); }
    catch (e: any) { setMessage(e?.message || 'Attendance could not be recorded'); } finally { setBusy(false); }
  }

  const doneCount = activeEvals.filter(ev => hasMoved(ev)).length;

  return <AdminShell title="Teacher Workspace"><div className="space-y-5">
    <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-slate-950 p-5 text-white shadow-xl md:p-7"><div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between"><div><div className="text-[11px] font-bold uppercase tracking-[.24em] text-amber-300">Teacher workspace</div><h2 className="mt-2 text-3xl font-black md:text-4xl">Your students. Your impact.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">Evaluate all students in your class before submitting. Your progress saves automatically — you can continue where you left off.</p></div><button onClick={() => setProfileOpen(true)} className="flex items-center gap-3 rounded-2xl bg-white/10 p-2 pr-4 text-left backdrop-blur"><div className="h-12 w-12 overflow-hidden rounded-full bg-white/15">{me?.avatar_url ? <img src={me.avatar_url} className="h-full w-full object-cover" alt="Profile" /> : <div className="grid h-full place-items-center font-black">T</div>}</div><div><div className="text-sm font-bold">My profile</div><div className="text-xs text-emerald-100/70">Phone & photo</div></div></button></div></section>

    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Kpi label="Assigned students" value={students.length} /><Kpi label="Day" value={students.filter(s => s.section === 'Day').length} /><Kpi label="Boarding" value={students.filter(s => s.section === 'Boarding').length} /><Kpi label={`Evaluation progress`} value={activeEvals.length ? `${doneCount}/${activeEvals.length}` : '—'} /></div>

    {byCampaign.map(({ campaign, evals: campEvals }) => {
      const allDone = campEvals.every(ev => hasMoved(ev));
      const doneHere = campEvals.filter(ev => hasMoved(ev)).length;
      const hasReturned = campEvals.some(ev => ev.status === 'returned');
      return <section key={campaign?.id || 'none'} className="card overflow-hidden">
        <div className="border-b p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black">{campaign?.title || 'Evaluation'}</h2>
                {hasReturned && <span className="pill bg-rose-50 text-rose-700">Contains returned evaluations</span>}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Window: {campaign?.opens_at ? new Date(campaign.opens_at).toLocaleString() : '—'} → {campaign?.closes_at ? new Date(campaign.closes_at).toLocaleString() : '—'}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${campEvals.length ? (doneHere / campEvals.length) * 100 : 0}%` }} />
                </div>
                <span className="text-xs font-bold text-slate-500">{doneHere} of {campEvals.length} students done</span>
              </div>
            </div>
            <button className={`btn shrink-0 ${allDone ? 'btn-primary' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`} disabled={busy || !allDone} onClick={() => submitClass(campEvals)}>
              {busy ? 'Submitting…' : allDone ? 'Submit class evaluation' : `${campEvals.length - doneHere} student${campEvals.length - doneHere === 1 ? '' : 's'} remaining`}
            </button>
          </div>
        </div>
        <div className="divide-y">
          {campEvals.map(ev => {
            const f = forms[ev.id];
            const done = hasMoved(ev);
            const isOpen = expandedEval === ev.id;
            const dir = ev.students?.memorization_direction;
            const isBtoN = dir === 'baqarah_to_nas';
            const start = { surah: Number(ev.from_surah), ayah: Number(ev.from_ayah) };
            const stop = f ? { surah: f.toSurah, ayah: f.toAyah } : start;
            const calc = done ? calculateEvaluation(start, stop, isBtoN ? 'Baqarah-to-Nas' : 'Nas-to-Baqarah') : { memorizedAyahs: 0, memorizedPages: 0, memorizedHizbs: 0 };
            const score = f ? Math.round(((f.mem + f.acc + f.flu + f.taj + f.ret) / 25) * 100) : 0;
            const grade = score >= 90 ? 'Excellent' : score >= 80 ? 'Very Good' : score >= 70 ? 'Good' : score >= 60 ? 'Satisfactory' : 'Needs Improvement';
            const progress = Math.min(100, ((ev.students?.current_page || 1) / 604) * 100);
            const maxAyah = (SURAHS.find(x => x.id === (f?.toSurah || 2)) || SURAHS[0]).ayahs;

            return <div key={ev.id} className={`${isOpen ? 'bg-slate-50' : ''}`}>
              <button className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50" onClick={() => setExpandedEval(isOpen ? null : ev.id)}>
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                  {ev.students?.photo_url ? <img src={ev.students.photo_url} className="h-full w-full object-cover" alt="" /> : <div className="grid h-full place-items-center font-black text-slate-400">{ev.students?.full_name?.charAt(0)}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black">{ev.students?.full_name}</span>
                    <span className="text-xs text-slate-400">{ev.students?.admission_no}</span>
                    <MemorizationBadge direction={dir} />
                    <SectionBadge section={ev.students?.section === 'boarding' ? 'Boarding' : 'Day'} />
                    {ev.status === 'returned' && <span className="pill bg-rose-50 text-rose-700 text-[11px]">Returned</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-400">Page {ev.students?.current_page || '?'} / 604</span>
                  </div>
                </div>
                <div className="ml-2 shrink-0">{done ? <span className="text-emerald-600 text-lg">✓</span> : <span className="text-slate-300 text-lg">○</span>}</div>
              </button>

              {isOpen && f && <div className="border-t bg-white p-5">
                <div className="grid gap-3 sm:grid-cols-3 mb-4">
                  <div className="rounded-xl bg-emerald-50 p-3 text-xs"><div className="font-bold uppercase text-emerald-700">Starting from</div><div className="mt-1 font-black text-sm">{label(start)}</div></div>
                  <div className="rounded-xl bg-blue-50 p-3 text-xs"><div className="font-bold uppercase text-blue-700">Covered</div><div className="mt-1 font-black text-sm">{done ? `${calc.memorizedAyahs} ayahs · ${calc.memorizedPages} pages` : '—'}</div></div>
                  <div className="rounded-xl bg-amber-50 p-3 text-xs"><div className="font-bold uppercase text-amber-700">Score</div><div className="mt-1 font-black text-sm">{done ? `${score}% · ${grade}` : '—'}</div></div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 mb-4">
                  <label className="text-xs font-bold">Stopping Surah
                    <select className="input mt-1" value={f.toSurah} onChange={e => { updateForm(ev.id, { toSurah: Number(e.target.value), toAyah: 1 }); }}>
                      {SURAHS.map(x => <option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold">Stopping Ayah
                    <input className="input mt-1" type="number" min={1} max={maxAyah} value={f.toAyah} onChange={e => updateForm(ev.id, { toAyah: Math.min(maxAyah, Math.max(1, Number(e.target.value) || 1)) })} />
                  </label>
                </div>
                {!done && <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">The stopping position must move {isBtoN ? 'forward' : 'backward'} from {label(start)} in the student's memorization direction.</div>}

                <div className="grid gap-3 grid-cols-5 mb-4">
                  {([['Memorization', 'mem'], ['Accuracy', 'acc'], ['Fluency', 'flu'], ['Tajweed', 'taj'], ['Retention', 'ret']] as [string, keyof EvalForm][]).map(([name, key]) =>
                    <label key={key} className="text-xs font-bold">{name}
                      <select className="input mt-1" value={f[key] as number} onChange={e => updateForm(ev.id, { [key]: Number(e.target.value) })}>
                        {[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}
                      </select>
                    </label>
                  )}
                </div>

                <div className="rounded-xl border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Teacher comment</span>
                    <button className="btn bg-amber-50 text-amber-900 text-xs" type="button" onClick={() => updateForm(ev.id, { comment: automatedComment(f.mem as any, f.acc as any, f.flu as any, f.taj as any, f.ret as any) })}>Auto-generate</button>
                  </div>
                  <textarea className="input min-h-[72px] resize-none text-sm" value={f.comment} onChange={e => updateForm(ev.id, { comment: e.target.value })} placeholder="Write an observation or generate an automatic comment…" />
                </div>
                <div className="mt-3 text-right text-xs text-slate-400">Progress saves automatically — you can close and continue later.</div>
              </div>}
            </div>;
          })}
        </div>
      </section>;
    })}

    {activeEvals.length === 0 && <section className="card p-10 text-center text-sm text-slate-500">No evaluation windows are currently open for your classes.</section>}

    <section className="card overflow-hidden"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black">My students</h2><p className="text-xs text-slate-500">Only students assigned to your account are shown. Academic profiles are read-only.</p></div><div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Read-only records</div></div>
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{students.map(s => <article key={s.id} className="rounded-2xl border p-4 hover:shadow-md">
        <div className="flex items-start gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-slate-100">{s.photoUrl ? <img src={s.photoUrl} alt={s.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-lg font-black text-slate-400">{s.name?.charAt(0)}</div>}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-black">{s.name}</h3><SectionBadge section={s.section} /></div>
            <div className="mt-1 flex flex-wrap gap-1"><MemorizationBadge direction={s.direction} /></div>
            <div className="mt-1 text-xs text-slate-500">{s.admissionNo} · {s.year} · {s.className || 'No class'}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400" style={{ width: `${Math.min(100, ((s.current?.page || 1) / 604) * 100)}%` }} /></div>
          <span className="text-xs text-slate-400">Page {s.current?.page || '?'} / 604</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-400">Starting</span><br /><b>{s.start?.surah}:{s.start?.ayah}</b></div><div className="rounded-xl bg-emerald-50 p-3"><span className="text-emerald-600">Current</span><br /><b>{s.current?.surah}:{s.current?.ayah}</b></div></div>
        <div className="mt-3 flex gap-2">
          <button className="btn flex-1 bg-slate-100" onClick={() => setSelected(s)}>Profile</button>
          <select disabled={busy} onChange={e => { if (e.target.value) mark(s.id, e.target.value); }} defaultValue="" className="input flex-1">
            <option value="">Attendance</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option><option value="excused">Excused</option>
          </select>
        </div>
      </article>)}{!students.length && <div className="col-span-full p-10 text-center text-sm text-slate-500">No students are currently assigned to your account.</div>}</div>
    </section>

    {selected && <Modal title="Student profile" close={() => setSelected(null)}>
      <div className="flex flex-wrap gap-2 mb-4"><MemorizationBadge direction={selected.direction} /><SectionBadge section={selected.section} /></div>
      <div className="grid gap-3 sm:grid-cols-2"><Info k="Admission" v={selected.admissionNo} /><Info k="Class" v={selected.className || '—'} /><Info k="Year" v={selected.year} /><Info k="Date of birth" v={selected.dateOfBirth || '—'} /><Info k="Gender" v={selected.gender || '—'} /><Info k="Qur'an start" v={`${selected.start?.surah ?? '—'}:${selected.start?.ayah ?? '—'}`} /><Info k="Current position" v={`${selected.current?.surah ?? '—'}:${selected.current?.ayah ?? '—'}`} /><Info k="Current page" v={String(selected.current?.page || '—')} /></div>
      <div className="mt-4 rounded-2xl border p-4"><div className="text-xs uppercase tracking-wider text-slate-400">Parent / guardian</div><div className="mt-2 font-black">{selected.parent?.name || 'Not connected'}</div><div className="mt-1 text-sm text-slate-600">{selected.parent?.relationship || '—'} · {selected.parent?.phone || 'No phone'}</div></div>
    </Modal>}

    {profileOpen && <Modal title="My profile" close={() => setProfileOpen(false)}>
      <div className="flex items-center gap-4"><div className="h-20 w-20 overflow-hidden rounded-2xl bg-slate-100">{me?.avatar_url ? <img src={me.avatar_url} className="h-full w-full object-cover" alt="Profile" /> : <div className="grid h-full place-items-center font-black text-slate-400">T</div>}</div><label className="btn bg-slate-100">Change photo<input hidden type="file" accept="image/*" onChange={e => uploadPhoto(e.target.files?.[0] || null)} /></label></div>
      <label className="mt-5 block text-sm font-semibold">Phone<input className="input mt-1" value={me?.phone || ''} onChange={e => setMe((x: any) => ({ ...x, phone: e.target.value }))} /></label>
      <button disabled={busy} onClick={async () => { setBusy(true); try { await updateOwnProfile({ phone: me?.phone || null }); setMessage('Phone updated.'); setProfileOpen(false); } catch (e: any) { setMessage(e?.message || 'Unable to update phone'); } finally { setBusy(false); } }} className="btn btn-primary mt-4 w-full">Save</button>
    </Modal>}
  </div></AdminShell>;
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return <div className="card p-5"><div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-2 text-3xl font-black">{value}</div></div>;
}
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button className="btn bg-slate-100" onClick={close}>Close</button></div>{children}</div></div>;
}
function Info({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">{k}</div><div className="mt-1 text-sm font-semibold">{v}</div></div>;
}
