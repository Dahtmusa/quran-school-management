'use client';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import MemorizationBadge from '@/components/MemorizationBadge';
import QuranProgress from '@/components/QuranProgress';
import { loadTeacherDirectory, loadTeacherEvaluations, updateOwnProfile, uploadProfileImage, getCurrentProfile, submitTeacherEvaluation, saveMySignature, getMySignature, loadOperationalTerms, teacherSubmitHistoricalEval3, teacherUpdateStudentSection, teacherAssignStudentToClass, getUnassignedStudents } from '@/lib/live-store';
import SignaturePad, { type SignaturePadRef } from '@/components/SignaturePad';
import { SURAHS, label, calculateEvaluation, progressBetween, positionOrdinal } from '@/lib/quran';
import { automatedComment } from '@/lib/data';
import { useEffect, useMemo, useRef, useState } from 'react';

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
  const [selectedTab, setSelectedTab] = useState<'academic'|'personal'|'contacts'>('academic');
  const [profileOpen, setProfileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [expandedEval, setExpandedEval] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, EvalForm>>({});
  const [studentSearch, setStudentSearch] = useState('');
  const [mySig, setMySig] = useState<any|null>(null);
  const [sigBusy, setSigBusy] = useState(false);
  const [sigMsg, setSigMsg] = useState('');
  const sigPadRef = useRef<SignaturePadRef|null>(null);

  /* ── Historical records section ── */
  type HistEntry = { startSurah: number; startAyah: number; endSurah: number; endAyah: number; direction: string; };
  const [histOpen, setHistOpen] = useState(false);
  const [histTerms, setHistTerms] = useState<any[]>([]);
  const [histTermId, setHistTermId] = useState('');
  const [histTargetPages, setHistTargetPages] = useState(30);
  const [histEntries, setHistEntries] = useState<Record<string, HistEntry>>({});
  const [histSubmitting, setHistSubmitting] = useState<Set<string>>(new Set());
  const [histMsg, setHistMsg] = useState('');

  /* ── Section edit ── */
  const [editSectionTarget, setEditSectionTarget] = useState<any | null>(null);
  const [editSectionValue, setEditSectionValue] = useState<'day' | 'boarding'>('day');
  const [editSectionBusy, setEditSectionBusy] = useState(false);
  const [editSectionMsg, setEditSectionMsg] = useState('');

  /* ── Add missing student ── */
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [unassigned, setUnassigned] = useState<any[]>([]);
  const [addSearch, setAddSearch] = useState('');
  const [addBusy, setAddBusy] = useState<string | null>(null);
  const [addMsg, setAddMsg] = useState('');

  const refresh = async () => {
    const [s, e] = await Promise.all([loadTeacherDirectory(), loadTeacherEvaluations()]);
    setStudents(s); setEvaluations(e);
  };
  useEffect(() => { refresh(); getCurrentProfile().then(setMe); }, []);
  useEffect(() => {
    getMySignature().then(s => setMySig(s.signature_data ? s : null));
  }, []);

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
          mem: Number(ev.memorization_score || 4), acc: Number(ev.accuracy_score || 4),
          flu: Number(ev.fluency_score || 4), taj: Number(ev.tajweed_score || 4),
          ret: Number(ev.retention_score || 4), comment: ev.teacher_comment || '',
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
      setForms({}); await refresh();
      setMessage('Class evaluation submitted to Admin for review. You will be notified if any are returned.');
    } catch (err: any) { setMessage(err?.message || 'Submission failed.'); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(file: File | null) {
    if (!file) return; setBusy(true);
    try { const url = await uploadProfileImage(file, 'staff'); setMe((x: any) => ({ ...x, avatar_url: url })); await updateOwnProfile({ avatar_url: url }); setMessage('Profile photo updated.'); }
    catch (e: any) { setMessage(e?.message || 'Photo upload failed'); } finally { setBusy(false); }
  }

  function mark(_studentId: string, _status: string) {
    setMessage('Attendance is now handled by Security staff at the gate. Contact admin if a correction is needed.');
  }

  // Load terms when historical section is opened
  useEffect(() => {
    if (!histOpen || histTerms.length) return;
    loadOperationalTerms().then(t => {
      const sorted = [...t].sort((a: any, b: any) => (a.starts_on || '').localeCompare(b.starts_on || ''));
      setHistTerms(sorted);
      const current = sorted.find((x: any) => x.academic_years?.is_current && x.term_number === 1);
      if (current) setHistTermId(current.id);
    });
  }, [histOpen]);

  // Effect 1: fresh init when term or student list changes — resets to defaults
  // Does NOT depend on evaluations, so it never triggers on refresh
  useEffect(() => {
    if (!histTermId || !students.length) return;
    setHistEntries(() => {
      const next: Record<string, HistEntry> = {};
      for (const s of students) {
        next[s.id] = {
          startSurah: s.start?.surah || (s.direction === 'Baqarah-to-Nas' ? 2 : 114),
          startAyah:  s.start?.ayah  || 1,
          endSurah: s.current?.surah || 0,
          endAyah:  s.current?.ayah  || 0,
          direction: s.direction || 'Baqarah-to-Nas',
        };
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histTermId, students.length]);

  // Effect 2: merge DB records into form when evaluations refresh
  // ONLY overwrites a student's entry when a DB record exists for them.
  // Students with no DB record keep whatever the teacher already typed.
  useEffect(() => {
    if (!histTermId || !students.length) return;
    setHistEntries(prev => {
      let changed = false;
      const next = { ...prev };
      for (const s of students) {
        const ex = (evaluations as any[]).find(
          (e: any) => e.student_id === s.id && e.term_id === histTermId && e.evaluation_number === 3
        );
        if (ex) {
          const fromDB: HistEntry = {
            startSurah: Number(ex.from_surah),
            startAyah:  Number(ex.from_ayah),
            endSurah:   Number(ex.to_surah),
            endAyah:    Number(ex.to_ayah),
            direction:  prev[s.id]?.direction || s.direction || 'Baqarah-to-Nas',
          };
          // Only update if something actually changed
          const cur = prev[s.id];
          if (!cur || cur.startSurah !== fromDB.startSurah || cur.startAyah !== fromDB.startAyah || cur.endSurah !== fromDB.endSurah || cur.endAyah !== fromDB.endAyah) {
            next[s.id] = fromDB;
            changed = true;
          }
        }
        // No DB record → leave prev[s.id] untouched (preserves teacher's input)
      }
      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluations]);

  const surahMap = Object.fromEntries(SURAHS.map(s => [s.id, s]));

  function computeHistMetrics(e: HistEntry, targetPages: number) {
    if (!e.endSurah || !e.endAyah) return null;
    const from = { surah: e.startSurah, ayah: e.startAyah };
    const to   = { surah: e.endSurah,   ayah: e.endAyah };
    const dir  = e.direction as 'Baqarah-to-Nas' | 'Nas-to-Baqarah';
    const fromOrd = positionOrdinal(from), toOrd = positionOrdinal(to);
    if (fromOrd === toOrd) return null;
    const forward = dir === 'Baqarah-to-Nas' ? toOrd > fromOrd : fromOrd > toOrd;
    if (!forward) return null;
    const prog  = progressBetween(from, to, dir);
    const score = Math.min(100, Math.round((prog.pages / Math.max(1, targetPages)) * 100));
    const rubric = score >= 90 ? 5 : score >= 75 ? 4 : score >= 60 ? 3 : score >= 45 ? 2 : 1;
    const grade  = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F';
    return { ...prog, score, rubric, grade };
  }

  function getHistEval3(studentId: string) {
    return (evaluations as any[]).find(
      (e: any) => e.student_id === studentId && e.term_id === histTermId && e.evaluation_number === 3
    );
  }

  async function submitHistStudent(studentId: string, skipRefresh = false) {
    const e = histEntries[studentId];
    const m = computeHistMetrics(e, histTargetPages);
    if (!m || !histTermId) return;
    const termId = histTermId;
    setHistSubmitting(prev => new Set(prev).add(studentId));
    try {
      await teacherSubmitHistoricalEval3({
        studentId, termId,
        startSurah: e.startSurah, startAyah: e.startAyah,
        endSurah: e.endSurah, endAyah: e.endAyah,
        score: m.score, rubric: m.rubric, grade: m.grade,
        ayahs: m.ayahs, pages: m.pages, hizbs: m.hizbs,
      });
      // Optimistic update: add/update eval3 in local state immediately so
      // the status badge flips to Pending without waiting for the full refresh
      setEvaluations((prev: any[]) => {
        const idx = prev.findIndex(ev =>
          ev.student_id === studentId && ev.term_id === termId && ev.evaluation_number === 3
        );
        const optimistic = {
          student_id: studentId, term_id: termId, evaluation_number: 3,
          status: 'pending_approval',
          from_surah: e.startSurah, from_ayah: e.startAyah,
          to_surah: e.endSurah, to_ayah: e.endAyah,
          memorized_ayahs: m.ayahs, memorized_pages: m.pages, memorized_hizbs: m.hizbs,
          score: m.score, grade: m.grade,
        };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...prev[idx], ...optimistic };
          return next;
        }
        return [...prev, optimistic];
      });
      if (!skipRefresh) {
        await refresh();
        setHistMsg('Saved — Admin will review and approve.');
      }
    } catch (err: any) {
      setHistMsg(err?.message || 'Submission failed.');
    } finally {
      setHistSubmitting(prev => { const n = new Set(prev); n.delete(studentId); return n; });
    }
  }

  async function submitClassBatch() {
    const ready = students.filter(s => {
      const e = histEntries[s.id];
      return e && computeHistMetrics(e, histTargetPages) !== null;
    });
    if (!ready.length) {
      setHistMsg('⚠ No students are ready to submit. Fill in the Current Position (teal dropdowns) for each student first.');
      return;
    }
    setHistMsg('');
    const failed: string[] = [];
    for (let i = 0; i < ready.length; i += 5) {
      const chunk = ready.slice(i, i + 5);
      const results = await Promise.allSettled(chunk.map(async s => {
        const e = histEntries[s.id];
        const m = computeHistMetrics(e, histTargetPages);
        if (!m || !histTermId) throw new Error('Not ready');
        const termId = histTermId;
        setHistSubmitting(prev => new Set(prev).add(s.id));
        try {
          await teacherSubmitHistoricalEval3({
            studentId: s.id, termId,
            startSurah: e.startSurah, startAyah: e.startAyah,
            endSurah: e.endSurah, endAyah: e.endAyah,
            score: m.score, rubric: m.rubric, grade: m.grade,
            ayahs: m.ayahs, pages: m.pages, hizbs: m.hizbs,
          });
        } finally {
          setHistSubmitting(prev => { const n = new Set(prev); n.delete(s.id); return n; });
        }
        return s.id;
      }));
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'rejected') failed.push(chunk[j].name);
      }
    }
    await refresh();
    if (failed.length === 0) {
      setHistMsg(`✓ All ${ready.length} student${ready.length !== 1 ? 's' : ''} submitted — Admin will review and approve.`);
    } else {
      setHistMsg(`⚠ ${ready.length - failed.length} submitted successfully. Failed: ${failed.join(', ')}. Please try those again.`);
    }
  }

  const histReadyCount = students.filter(s => {
    const e = histEntries[s.id];
    return e && computeHistMetrics(e, histTargetPages) !== null;
  }).length;
  const histIncompleteCount = students.length - histReadyCount;
  const histAllReady = histTermId && students.length > 0 && histIncompleteCount === 0;

  const doneCount = activeEvals.filter(ev => hasMoved(ev)).length;
  const returnedCount = activeEvals.filter(ev => ev.status === 'returned').length;
  const dayCount = students.filter(s => s.section === 'Day').length;
  const boardingCount = students.filter(s => s.section === 'Boarding').length;
  const filteredStudents = useMemo(() => students.filter(s => s.name?.toLowerCase().includes(studentSearch.toLowerCase())), [students, studentSearch]);

  async function handleSaveSection() {
    if (!editSectionTarget) return;
    setEditSectionBusy(true); setEditSectionMsg('');
    try {
      await teacherUpdateStudentSection(editSectionTarget.id, editSectionValue);
      await refresh();
      setEditSectionTarget(null);
    } catch (e: any) {
      setEditSectionMsg(e?.message || 'Failed to update section');
    } finally { setEditSectionBusy(false); }
  }

  async function openAddStudent() {
    setAddMsg(''); setAddSearch('');
    const list = await getUnassignedStudents();
    setUnassigned(list);
    setAddStudentOpen(true);
  }

  async function handleAssign(studentId: string) {
    setAddBusy(studentId); setAddMsg('');
    try {
      await teacherAssignStudentToClass(studentId);
      await refresh();
      setUnassigned(prev => prev.filter(s => s.student_id !== studentId));
      setAddMsg('Student added to your class.');
    } catch (e: any) {
      setAddMsg(e?.message || 'Failed to assign student');
    } finally { setAddBusy(null); }
  }

  return <AdminShell title="Teacher Workspace"><div className="space-y-5">

    {/* Hero */}
    <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-slate-900 p-5 text-white shadow-xl md:p-7">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.24em] text-amber-300">Teacher workspace</div>
          {me?.full_name && <h2 className="mt-1 text-3xl font-black md:text-4xl">As-salāmu ʿalaykum, {me.full_name.split(' ')[0]}.</h2>}
          {!me?.full_name && <h2 className="mt-1 text-3xl font-black md:text-4xl">Your students. Your impact.</h2>}
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">Evaluate all students in your class before submitting. Progress saves automatically so you can continue where you left off.</p>
        </div>
        <button onClick={() => setProfileOpen(true)} className="flex items-center gap-3 rounded-2xl bg-white/10 p-2 pr-4 text-left backdrop-blur hover:bg-white/20 transition-colors">
          <div className="h-12 w-12 overflow-hidden rounded-full bg-white/15">{me?.avatar_url ? <img src={me.avatar_url} className="h-full w-full object-cover" alt="Profile" /> : <div className="grid h-full place-items-center text-lg font-black">{me?.full_name?.charAt(0)||'T'}</div>}</div>
          <div><div className="text-sm font-black">My profile</div><div className="text-xs text-emerald-200">{me?.phone||'Add phone'}</div></div>
        </button>
      </div>
    </section>

    {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</div>}

    {/* Stats */}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="My students" value={students.length} color="emerald"/>
      <StatCard label="Day students" value={dayCount} color="blue"/>
      <StatCard label="Boarding students" value={boardingCount} color="violet"/>
      <StatCard label={activeEvals.length ? `${doneCount}/${activeEvals.length} done` : 'No active eval'} value={returnedCount>0?`${returnedCount} returned`:(activeEvals.length?`${Math.round((doneCount/activeEvals.length)*100)}%`:'—')} color={returnedCount>0?'rose':'amber'} label2={returnedCount>0?'Returned evals':activeEvals.length?'Progress':'Evaluations'}/>
    </div>

    {/* ── Historical Records — pinned near the top so it's easy to find ── */}
    <section className="overflow-hidden rounded-2xl border-2 border-amber-300 bg-white shadow-sm">
      <button
        onClick={() => setHistOpen(o => !o)}
        className="flex w-full items-center justify-between bg-amber-50 p-5 text-left hover:bg-amber-100 transition-colors"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-black text-amber-900">📋 Historical Records — First Term Setup</span>
            <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-800">Temporary</span>
          </div>
          <p className="mt-1 text-xs text-amber-700/80">Enter each student's start and end position for the term. Admin reviews and approves before it becomes official.</p>
        </div>
        <span className="ml-4 shrink-0 text-amber-500 font-bold text-sm">{histOpen ? '▲ Hide' : '▼ Open'}</span>
      </button>

      {histOpen && <>
        {/* Controls */}
        <div className="border-t border-amber-100 bg-amber-50/50 px-5 py-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-xs font-semibold text-slate-600">Term
              <select value={histTermId} onChange={e => setHistTermId(e.target.value)}
                className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">Select term…</option>
                {histTerms.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}{t.academic_years?.is_current ? ' (current)' : ''}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Pages expected (= 100%)
              <input type="number" min={1} max={200} value={histTargetPages}
                onChange={e => setHistTargetPages(Math.max(1, Number(e.target.value)))}
                className="mt-1 block w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
            </label>
          </div>

          {/* Batch submit panel */}
          {histTermId && students.length > 0 && (
            <div className={`flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${histAllReady ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div>
                {histAllReady ? (
                  <div className="text-sm font-bold text-emerald-800">✓ All {students.length} students have positions filled in — ready to submit class</div>
                ) : (
                  <div className="text-sm font-bold text-amber-800">
                    {histReadyCount}/{students.length} students ready
                    {histIncompleteCount > 0 && <span className="ml-2 font-normal text-amber-700">— {histIncompleteCount} still need end position</span>}
                  </div>
                )}
                <div className="mt-0.5 text-xs text-slate-500">All students must be complete before you can submit. Admin will review and approve the entire class.</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={submitClassBatch} disabled={!histAllReady || histSubmitting.size > 0}
                  className={`rounded-lg px-5 py-2 text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${histAllReady ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-300 cursor-not-allowed'}`}>
                  {histSubmitting.size > 0 ? 'Submitting class…' : `Submit class (${students.length})`}
                </button>
              </div>
            </div>
          )}

          {histMsg && <div className="rounded-lg bg-white px-4 py-3 text-sm font-semibold text-amber-800 border border-amber-200">{histMsg} <button className="ml-2 text-amber-500" onClick={() => setHistMsg('')}>✕</button></div>}
        </div>

        {/* Student table */}
        {!histTermId && <div className="p-8 text-center text-sm text-slate-400">Select a term above to begin.</div>}
        {histTermId && students.length === 0 && <div className="p-8 text-center text-sm text-slate-400">No students are assigned to your account.</div>}
        {histTermId && students.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="border-t border-amber-100 bg-amber-50 text-xs uppercase text-amber-700">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-3 py-3 text-center">Direction</th>
                  <th className="px-3 py-3 text-center bg-emerald-50 text-emerald-700" colSpan={2}>Start of Term ✏️</th>
                  <th className="px-3 py-3 text-center bg-teal-50 text-teal-700" colSpan={2}>Current Position ✏️</th>
                  <th className="px-3 py-3 text-center">Score</th>
                  <th className="px-3 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => {
                  const e = histEntries[s.id];
                  if (!e) return null;
                  const m = computeHistMetrics(e, histTargetPages);
                  const existing = getHistEval3(s.id);
                  const isBusy = histSubmitting.has(s.id);
                  const maxEndAyah = surahMap[e.endSurah]?.ayahs ?? 286;
                  const maxStartAyah = surahMap[e.startSurah]?.ayahs ?? 286;

                  const rowIncomplete = !m;

                  return (
                    <tr key={s.id} className={`border-t border-slate-100 ${rowIncomplete && !existing ? 'bg-rose-50/30' : idx % 2 === 0 ? '' : 'bg-slate-50/40'} hover:bg-amber-50/20`}>
                      <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {s.photoUrl ? <img src={s.photoUrl} alt={s.name} className="h-8 w-8 rounded-full object-cover"/> : <div className="h-8 w-8 rounded-full bg-emerald-100 grid place-items-center text-xs font-black text-emerald-700">{s.name?.charAt(0)}</div>}
                          <div>
                            <div className="text-xs font-bold text-slate-900">{s.name}</div>
                            <div className="text-[10px] text-slate-400">{s.admissionNo}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <select value={e.direction} onChange={ev => setHistEntries(p => ({ ...p, [s.id]: { ...p[s.id], direction: ev.target.value } }))}
                          className="text-xs border border-slate-200 rounded-md bg-white px-1 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400">
                          <option value="Baqarah-to-Nas">↓ B→N</option>
                          <option value="Nas-to-Baqarah">↑ N→B</option>
                        </select>
                      </td>
                      <td className="px-1 py-2.5 bg-emerald-50/20">
                        <select value={e.startSurah} onChange={ev => setHistEntries(p => ({ ...p, [s.id]: { ...p[s.id], startSurah: Number(ev.target.value), startAyah: 1 } }))}
                          className="text-xs border border-emerald-200 rounded-md bg-white px-1 py-1 max-w-[130px] focus:outline-none focus:ring-1 focus:ring-emerald-400">
                          <option value={0}>— Surah —</option>
                          {SURAHS.map(sx => <option key={sx.id} value={sx.id}>{sx.id}. {sx.name}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-2.5 bg-emerald-50/20">
                        <select value={e.startAyah || ''}
                          onChange={ev => setHistEntries(p => ({ ...p, [s.id]: { ...p[s.id], startAyah: Number(ev.target.value) } }))}
                          className="text-xs border border-emerald-200 rounded-md bg-white px-1 py-1 max-w-[72px] focus:outline-none focus:ring-1 focus:ring-emerald-400">
                          <option value="">Ayah</option>
                          {Array.from({ length: maxStartAyah }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-2.5 bg-teal-50/20">
                        <select value={e.endSurah} onChange={ev => setHistEntries(p => ({ ...p, [s.id]: { ...p[s.id], endSurah: Number(ev.target.value), endAyah: 1 } }))}
                          className="text-xs border border-teal-200 rounded-md bg-white px-1 py-1 max-w-[130px] focus:outline-none focus:ring-1 focus:ring-teal-400">
                          <option value={0}>— Surah —</option>
                          {SURAHS.map(sx => <option key={sx.id} value={sx.id}>{sx.id}. {sx.name}</option>)}
                        </select>
                      </td>
                      <td className="px-1 py-2.5 bg-teal-50/20">
                        <select value={e.endAyah || ''}
                          onChange={ev => setHistEntries(p => ({ ...p, [s.id]: { ...p[s.id], endAyah: Number(ev.target.value) } }))}
                          className="text-xs border border-teal-200 rounded-md bg-white px-1 py-1 max-w-[72px] focus:outline-none focus:ring-1 focus:ring-teal-400">
                          <option value="">Ayah</option>
                          {Array.from({ length: maxEndAyah }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {m ? (
                          <div>
                            <div className="text-xs font-bold text-teal-700">{m.score}% · {m.grade}</div>
                            <div className="text-[10px] text-slate-400">{m.ayahs} ayahs · {m.pages}pp</div>
                          </div>
                        ) : <span className="text-[10px] text-rose-400 font-semibold">⚠ Incomplete</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {existing ? (
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${existing.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : existing.status === 'pending_approval' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                            {existing.status === 'approved' ? '✓ Approved' : existing.status === 'pending_approval' ? '⏳ Pending' : '↩ Returned'}
                          </span>
                        ) : (
                          <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-400">Not submitted</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </>}
    </section>

    {/* Campaign evaluation sections */}
    {byCampaign.map(({ campaign, evals: campEvals }) => {
      const allDone = campEvals.every(ev => hasMoved(ev));
      const doneHere = campEvals.filter(ev => hasMoved(ev)).length;
      const hasReturned = campEvals.some(ev => ev.status === 'returned');
      const pct = campEvals.length ? Math.round((doneHere / campEvals.length) * 100) : 0;

      return <section key={campaign?.id || 'none'} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`border-b p-5 ${hasReturned ? 'bg-rose-50' : 'bg-slate-50'}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black">{campaign?.title || 'Evaluation'}</h2>
                {hasReturned && <span className="pill bg-rose-100 text-rose-700 border border-rose-200">⚠ Contains returned evaluations</span>}
                {allDone && !hasReturned && <span className="pill bg-emerald-100 text-emerald-700">Ready to submit</span>}
              </div>
              <div className="mt-1 text-xs text-slate-500">Window: {campaign?.opens_at ? new Date(campaign.opens_at).toLocaleString() : '—'} → {campaign?.closes_at ? new Date(campaign.closes_at).toLocaleString() : '—'}</div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2.5 w-48 overflow-hidden rounded-full bg-slate-200">
                  <div className={`h-full rounded-full transition-all ${allDone ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm font-black text-slate-600">{doneHere}/{campEvals.length} students ready</span>
                <span className="text-xs text-slate-400">{pct}%</span>
              </div>
            </div>
            <button className={`btn shrink-0 px-5 ${allDone ? 'btn-primary' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`} disabled={busy || !allDone} onClick={() => submitClass(campEvals)}>
              {busy ? 'Submitting…' : allDone ? '✓ Submit class evaluation' : `${campEvals.length - doneHere} remaining`}
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
            const evCurrSurah = Number(ev.students?.current_surah || start.surah);
            const _tot = isBtoN ? Math.max(1, 114 - start.surah) : Math.max(1, start.surah - 2);
            const _done = isBtoN ? Math.max(0, evCurrSurah - start.surah) : Math.max(0, start.surah - evCurrSurah);
            const progress = Math.min(100, (_done / _tot) * 100);
            const maxAyah = (SURAHS.find(x => x.id === (f?.toSurah || 2)) || SURAHS[0]).ayahs;
            const isReturned = ev.status === 'returned';

            return <div key={ev.id} className={`${isOpen ? 'bg-slate-50' : isReturned ? 'bg-rose-50/40' : ''}`}>
              <button className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors" onClick={() => setExpandedEval(isOpen ? null : ev.id)}>
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-100 border border-slate-200">
                  {ev.students?.photo_url ? <img src={ev.students.photo_url} className="h-full w-full object-cover" alt="" /> : <div className="grid h-full place-items-center text-lg font-black text-slate-300">{ev.students?.full_name?.charAt(0)}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black">{ev.students?.full_name}</span>
                    <span className="text-xs text-slate-400">{ev.students?.admission_no}</span>
                    <MemorizationBadge direction={dir} />
                    <SectionBadge section={ev.students?.section === 'boarding' ? 'Boarding' : 'Day'} />
                    {isReturned && <span className="pill bg-rose-100 text-rose-700 border border-rose-200 text-[11px]">Returned — needs correction</span>}
                    {done && !isReturned && <span className="pill bg-emerald-50 text-emerald-700 text-[11px]">{score}% · {grade}</span>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 w-36 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-400">S.{ev.students?.current_surah||'?'} · {Math.round(progress)}% of journey</span>
                  </div>
                </div>
                <div className="ml-2 shrink-0 text-xl">{done ? <span className="text-emerald-500">✓</span> : <span className="text-slate-300">○</span>}</div>
                <div className="ml-1 text-xs text-slate-400">{isOpen ? '▲' : '▼'}</div>
              </button>

              {isOpen && f && <div className="border-t bg-white p-5 space-y-4">
                {isReturned && ev.admin_comment && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm"><span className="font-black text-rose-700">Admin returned: </span><span className="text-rose-600">{ev.admin_comment}</span></div>}

                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoCard color="emerald" label="Starting from" value={label(start)}/>
                  <InfoCard color="blue" label="Covered so far" value={done?`${calc.memorizedAyahs} ayahs · ${calc.memorizedPages} pages`:'Not entered yet'}/>
                  <InfoCard color={score>=75?'emerald':score>=60?'amber':'rose'} label="Current score" value={done?`${score}% · ${grade}`:'—'}/>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-black uppercase tracking-wide text-slate-500">Stopping Surah
                    <select className="input mt-1 w-full" value={f.toSurah} onChange={e => updateForm(ev.id, { toSurah: Number(e.target.value), toAyah: 1 })}>
                      {SURAHS.map(x => <option key={x.id} value={x.id}>{x.id}. {x.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-black uppercase tracking-wide text-slate-500">Stopping Ayah
                    <select className="input mt-1 w-full" value={f.toAyah} onChange={e => updateForm(ev.id, { toAyah: Number(e.target.value) })}>
                      {Array.from({ length: maxAyah }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {!done && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm font-semibold text-rose-800">The stopping position must move {isBtoN ? 'forward (higher surah/ayah)' : 'backward (lower surah/ayah)'} from {label(start)}.</div>}

                <div>
                  <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Rubric scores — 1 (weak) to 5 (excellent)</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {([['Memorization', 'mem'], ['Accuracy', 'acc'], ['Fluency', 'flu'], ['Tajweed', 'taj'], ['Retention', 'ret']] as [string, keyof EvalForm][]).map(([name, key]) =>
                      <div key={key} className="text-center">
                        <div className="text-[11px] font-bold text-slate-500 mb-1">{name}</div>
                        <select className="input w-full text-center font-black" value={f[key] as number} onChange={e => updateForm(ev.id, { [key]: Number(e.target.value) })}>
                          {[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Teacher comment</span>
                    <button className="btn bg-amber-50 text-amber-900 text-xs" type="button" onClick={() => updateForm(ev.id, { comment: automatedComment(f.mem as any, f.acc as any, f.flu as any, f.taj as any, f.ret as any) })}>Auto-generate</button>
                  </div>
                  <textarea className="input w-full min-h-[72px] resize-none text-sm bg-white" value={f.comment} onChange={e => updateForm(ev.id, { comment: e.target.value })} placeholder="Write an observation or click Auto-generate…" />
                </div>
                <div className="text-right text-xs text-slate-400">Progress saves automatically — you can close and continue later.</div>
              </div>}
            </div>;
          })}
        </div>
      </section>;
    })}

    {activeEvals.length === 0 && <section className="card p-12 text-center">
      <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center text-3xl">📋</div>
      <h3 className="text-lg font-black text-slate-700">No open evaluation windows</h3>
      <p className="mt-2 text-sm text-slate-400">When Admin opens an evaluation for your class, it will appear here.</p>
    </section>}

    {/* My students — proper table */}
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-black">My students</h2>
          <p className="text-xs text-slate-500">{students.length} student{students.length !== 1 ? 's' : ''} assigned to your account</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="Search student…" className="rounded-xl border px-3 py-2 text-sm w-44" />
          <button onClick={openAddStudent} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 transition-colors whitespace-nowrap">+ Add student</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Student</th>
              <th className="px-3 py-3">Section</th>
              <th className="px-3 py-3">Year</th>
              <th className="px-3 py-3">Direction</th>
              <th className="px-3 py-3">Started at</th>
              <th className="px-3 py-3">Current position</th>
              <th className="px-3 py-3">Progress</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
        {filteredStudents.map(s => {
          const sBtoN = s.direction === 'Baqarah-to-Nas';
          const startSurahId = s.start?.surah || (sBtoN ? 2 : 114);
          const currSurahId  = s.current?.surah || startSurahId;
          const startName = SURAHS.find(x => x.id === startSurahId)?.name ?? `Surah ${startSurahId}`;
          const currName  = SURAHS.find(x => x.id === currSurahId)?.name  ?? `Surah ${currSurahId}`;
          const sTot = sBtoN ? Math.max(1, 114 - startSurahId) : Math.max(1, startSurahId - 2);
          const sDone = sBtoN ? Math.max(0, currSurahId - startSurahId) : Math.max(0, startSurahId - currSurahId);
          const sPct = Math.min(100, Math.round((sDone / sTot) * 100));

          return (
            <tr key={s.id} className="border-t hover:bg-slate-50/60 transition-colors">
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-slate-100 flex items-center justify-center">
                    {s.photoUrl ? <img src={s.photoUrl} alt={s.name} className="h-full w-full object-cover" /> : <span className="text-xs font-black text-slate-400">{s.name?.charAt(0)}</span>}
                  </div>
                  <div>
                    <div className="font-semibold leading-tight">{s.name}</div>
                    <div className="text-xs text-slate-400">{s.admissionNo}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3">
                <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${s.section === 'Boarding' ? 'bg-violet-50 text-violet-700' : 'bg-blue-50 text-blue-700'}`}>{s.section}</span>
              </td>
              <td className="px-3 py-3 text-xs text-slate-500">{s.year || '—'}</td>
              <td className="px-3 py-3 text-xs font-semibold text-emerald-700">{sBtoN ? 'B → N' : 'N → B'}</td>
              <td className="px-3 py-3 text-xs text-slate-600">{startName} <span className="text-slate-400">:{s.start?.ayah || 1}</span></td>
              <td className="px-3 py-3 text-xs font-semibold text-emerald-700">{currName} <span className="text-emerald-500 font-normal">:{s.current?.ayah || 1}</span></td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400" style={{ width: `${sPct}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">{sPct}%</span>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button className="rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-black text-teal-700 hover:bg-teal-100 transition-colors" onClick={() => { setEditSectionTarget(s); setEditSectionValue(s.section === 'Boarding' ? 'boarding' : 'day'); setEditSectionMsg(''); }}>
                    Edit section
                  </button>
                  <button className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200 transition-colors" onClick={() => { setSelected(s); setSelectedTab('academic'); }}>
                    Profile
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
        {!filteredStudents.length && (
          <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">
            {studentSearch ? 'No students match your search.' : 'No students are assigned to your account.'}
          </td></tr>
        )}
          </tbody>
        </table>
      </div>
    </section>

    {/* Student profile modal — rich view matching admin students page */}
    {selected && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4" onClick={e => e.target === e.currentTarget && setSelected(null)}>
      <div className="mx-auto mt-6 w-full max-w-4xl rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-4 border-b p-6">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
            {selected.photoUrl ? <img src={selected.photoUrl} alt={selected.name} className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-2xl font-black text-slate-300">{selected.name?.charAt(0)}</div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black uppercase tracking-wider text-slate-400">{selected.admissionNo}</div>
            <h2 className="mt-0.5 text-2xl font-black">{selected.name}</h2>
            <div className="mt-1 flex flex-wrap gap-2"><SectionBadge section={selected.section}/><MemorizationBadge direction={selected.direction}/><span className="pill bg-slate-100 text-slate-600">{selected.year}</span></div>
            <div className="mt-1 text-xs text-slate-500">{selected.className || '—'}</div>
          </div>
          <button onClick={() => setSelected(null)} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">✕</button>
        </div>
        {/* Tabs */}
        <div className="flex border-b">
          {(['academic','personal','contacts'] as const).map(t => (
            <button key={t} onClick={() => setSelectedTab(t)}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-wider transition-colors ${selectedTab===t ? 'border-b-2 border-emerald-600 text-emerald-700' : 'text-slate-400 hover:text-slate-700'}`}>
              {t === 'academic' ? 'Academic' : t === 'personal' ? 'Personal & Medical' : 'Contacts'}
            </button>
          ))}
        </div>
        {/* Tab content */}
        <div className="p-6">
          {selectedTab === 'academic' && <>
            <QuranProgress student={selected} />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 text-sm">
              <div className="rounded-2xl border bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Start</div><div className="mt-1 text-base font-black text-slate-900">{label(selected.start)}</div></div>
              <div className="rounded-2xl border bg-emerald-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Current</div><div className="mt-1 text-base font-black text-emerald-900">{label(selected.current)}</div></div>
              <div className="rounded-2xl border bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Class</div><div className="mt-1 text-base font-black text-slate-900">{selected.className || '—'}</div></div>
            </div>
          </>}
          {selectedTab === 'personal' && <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Date of birth</div><div className="mt-1 font-black text-slate-900">{selected.dateOfBirth || '—'}</div></div>
            <div className="rounded-2xl border bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Gender</div><div className="mt-1 font-black text-slate-900">{selected.gender || '—'}</div></div>
            <div className="rounded-2xl border bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Admission no.</div><div className="mt-1 font-black text-slate-900">{selected.admissionNo}</div></div>
            <div className="rounded-2xl border bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Year</div><div className="mt-1 font-black text-slate-900">{selected.year}</div></div>
          </div>}
          {selectedTab === 'contacts' && <div className="space-y-4">
            <div className="rounded-2xl border p-4">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Parent / Guardian</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Name</div><div className="mt-1 font-black text-slate-900">{selected.parent?.name || '—'}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Phone</div><div className="mt-1 font-black text-slate-900">{selected.parent?.phone || '—'}</div></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Relationship</div><div className="mt-1 font-black text-slate-900">{selected.parent?.relationship || '—'}</div></div>
              </div>
            </div>
          </div>}
        </div>
        <div className="flex justify-end border-t p-4">
          <button onClick={() => setSelected(null)} className="btn bg-slate-100">Close</button>
        </div>
      </div>
    </div>}

    {/* Edit section modal */}
    {editSectionTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
          <h3 className="text-lg font-black">Edit section — {editSectionTarget.name}</h3>
          <p className="mt-1 text-xs text-slate-500">Change whether this student is a day or boarding student.</p>
          <div className="mt-4">
            <label className="text-xs font-semibold text-slate-700">Section
              <select value={editSectionValue} onChange={e => setEditSectionValue(e.target.value as 'day' | 'boarding')}
                className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="day">Day</option>
                <option value="boarding">Boarding</option>
              </select>
            </label>
          </div>
          {editSectionMsg && <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs font-semibold text-rose-700">{editSectionMsg}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setEditSectionTarget(null)} className="btn bg-slate-100">Cancel</button>
            <button onClick={handleSaveSection} disabled={editSectionBusy} className="btn btn-primary">{editSectionBusy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    )}

    {/* Add missing student modal */}
    {addStudentOpen && (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-4">
        <div className="mx-auto mt-10 w-full max-w-lg rounded-3xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b p-5">
            <div>
              <h3 className="text-lg font-black">Add missing student</h3>
              <p className="text-xs text-slate-500">These students have no class assigned. Add them to your class.</p>
            </div>
            <button onClick={() => setAddStudentOpen(false)} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200">✕</button>
          </div>
          <div className="p-5">
            <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Search by name or admission no…" className="w-full rounded-xl border px-3 py-2 text-sm" />
            {addMsg && <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs font-semibold text-emerald-700">{addMsg}</p>}
            <div className="mt-4 max-h-80 overflow-y-auto space-y-2">
              {unassigned.filter(s => !addSearch || s.full_name?.toLowerCase().includes(addSearch.toLowerCase()) || s.admission_no?.toLowerCase().includes(addSearch.toLowerCase())).map(s => (
                <div key={s.student_id} className="flex items-center justify-between rounded-xl border bg-slate-50 px-4 py-3">
                  <div>
                    <div className="font-semibold text-sm">{s.full_name}</div>
                    <div className="text-[11px] text-slate-400">{s.admission_no} · {s.section === 'boarding' ? 'Boarding' : 'Day'} · {s.program_year === 'year_2' ? 'Year 2' : 'Year 1'}</div>
                  </div>
                  <button onClick={() => handleAssign(s.student_id)} disabled={addBusy === s.student_id} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                    {addBusy === s.student_id ? 'Adding…' : 'Add'}
                  </button>
                </div>
              ))}
              {unassigned.filter(s => !addSearch || s.full_name?.toLowerCase().includes(addSearch.toLowerCase()) || s.admission_no?.toLowerCase().includes(addSearch.toLowerCase())).length === 0 && (
                <p className="text-center text-sm text-slate-400 py-8">{addSearch ? 'No unassigned students match your search.' : 'No unassigned students found.'}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end border-t p-4">
            <button onClick={() => setAddStudentOpen(false)} className="btn bg-slate-100">Close</button>
          </div>
        </div>
      </div>
    )}

    {/* Profile modal */}
    {profileOpen && <Modal title="My profile" close={() => setProfileOpen(false)}>
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 overflow-hidden rounded-2xl bg-slate-100 border">{me?.avatar_url ? <img src={me.avatar_url} className="h-full w-full object-cover" alt="Profile" /> : <div className="grid h-full place-items-center text-2xl font-black text-slate-300">{me?.full_name?.charAt(0)||'T'}</div>}</div>
        <label className="btn bg-slate-100">Change photo<input hidden type="file" accept="image/*" onChange={e => uploadPhoto(e.target.files?.[0] || null)} /></label>
      </div>
      <label className="mt-5 block text-sm font-semibold">Phone number<input className="input mt-1 w-full" placeholder="+234 xxx xxx xxxx" value={me?.phone || ''} onChange={e => setMe((x: any) => ({ ...x, phone: e.target.value }))} /></label>
      <button disabled={busy} onClick={async () => { setBusy(true); try { await updateOwnProfile({ phone: me?.phone || null }); setMessage('Phone updated.'); } catch (e: any) { setMessage(e?.message || 'Unable to update phone'); } finally { setBusy(false); } }} className="btn btn-primary mt-4 w-full">Save Profile</button>
      <div className="mt-6 border-t pt-5">
        <div className="text-sm font-black text-slate-700">Add Signature</div>
        <p className="mt-1 text-xs text-slate-400">Appears on the report cards of all students in your class.</p>
        {sigMsg && <div className="mt-2 rounded-lg bg-teal-50 p-2 text-xs font-semibold text-teal-800">{sigMsg}</div>}
        {mySig && <div className="mt-3"><div className="text-xs font-bold text-emerald-700 mb-1">✓ Signature on file</div><img src={(mySig as any).signature_data} alt="signature" className="h-14 w-full rounded-xl border border-slate-200 bg-white object-contain p-1"/><p className="mt-2 text-xs text-slate-400">Draw below to replace:</p></div>}
        {!mySig && <p className="mt-3 text-xs text-slate-400">No signature yet. Draw below to add one:</p>}
        <div className="mt-2"><SignaturePad ref={el => { sigPadRef.current = el; }} height={110}/></div>
        <button className="btn btn-primary mt-3 w-full" disabled={sigBusy} onClick={async () => {
          const pad = sigPadRef.current;
          if (!pad || pad.isEmpty()) { setSigMsg('Please draw your signature first.'); return; }
          const data = pad.getDataURL(); if (!data) return;
          setSigBusy(true);
          try {
            await saveMySignature(data);
            const s = await getMySignature();
            setMySig(s.signature_data ? s : null);
            pad.clear(); setSigMsg('Signature saved.');
          } catch (err: any) { setSigMsg(err?.message || 'Failed to save.'); }
          finally { setSigBusy(false); }
        }}>{sigBusy ? 'Saving…' : 'Save Signature'}</button>
      </div>
    </Modal>}
  </div></AdminShell>;
}

function StatCard({ label, label2, value, color }: { label: string; label2?: string; value: number | string; color: string }) {
  const colors: Record<string,string> = { emerald:'bg-emerald-50 text-emerald-900', blue:'bg-blue-50 text-blue-900', violet:'bg-violet-50 text-violet-900', amber:'bg-amber-50 text-amber-900', rose:'bg-rose-50 text-rose-900' };
  return <div className={`rounded-2xl p-5 ${colors[color]||colors.emerald}`}><div className="text-xs font-black uppercase tracking-wide opacity-60">{label2||label}</div><div className="mt-2 text-3xl font-black">{value}</div><div className="mt-1 text-xs opacity-50">{label2?label:''}</div></div>;
}
function InfoCard({ color, label, value }: { color: string; label: string; value: string }) {
  const bg = color === 'emerald' ? 'bg-emerald-50 text-emerald-800' : color === 'blue' ? 'bg-blue-50 text-blue-800' : color === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800';
  return <div className={`rounded-xl p-3 ${bg}`}><div className="text-xs font-black uppercase">{label}</div><div className="mt-1 text-sm font-black">{value}</div></div>;
}
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button className="btn bg-slate-100" onClick={close}>Close</button></div>{children}</div></div>;
}
function Info({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">{k}</div><div className="mt-1 text-sm font-semibold">{v}</div></div>;
}
