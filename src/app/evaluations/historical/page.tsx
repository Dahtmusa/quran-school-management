'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  loadStudents, loadClasses, loadOperationalTerms,
  bulkImportHistoricalEvals, adminApproveClassHistoricalEvals,
  getCurrentProfile, loadEvaluations,
  type HistoricalEvalEntry, type LiveClass,
} from '@/lib/live-store';
import { SURAHS, progressBetween, positionOrdinal } from '@/lib/quran';
import type { Student } from '@/lib/data';

type EntryState = {
  eval1StartSurah: number; eval1StartAyah: number;
  eval3Surah: number; eval3Ayah: number;
  direction: string;
};

type ComputedMetrics = {
  ayahs: number; pages: number; hizbs: number;
  score: number; rubric: number; grade: string; valid: boolean;
  error?: string;
};

function scoreToRubric(s: number) { return s >= 90 ? 5 : s >= 75 ? 4 : s >= 60 ? 3 : s >= 45 ? 2 : 1; }
function scoreToGrade(s: number) { return s >= 90 ? 'A' : s >= 75 ? 'B' : s >= 60 ? 'C' : s >= 45 ? 'D' : 'F'; }

function autoDetectDirection(
  from: { surah: number; ayah: number },
  to: { surah: number; ayah: number }
): 'Baqarah-to-Nas' | 'Nas-to-Baqarah' {
  return positionOrdinal(to) >= positionOrdinal(from) ? 'Baqarah-to-Nas' : 'Nas-to-Baqarah';
}

function canonicalStart(direction: 'Baqarah-to-Nas' | 'Nas-to-Baqarah'): { surah: number; ayah: number } {
  return direction === 'Baqarah-to-Nas' ? { surah: 2, ayah: 1 } : { surah: 114, ayah: 1 };
}

function computeEval3(
  from: { surah: number; ayah: number },
  to: { surah: number; ayah: number },
  _direction: 'Baqarah-to-Nas' | 'Nas-to-Baqarah',
  targetPages: number
): ComputedMetrics {
  const blank = { ayahs: 0, pages: 0, hizbs: 0, score: 0, rubric: 1, grade: 'F', valid: false };
  if (!from.surah || !from.ayah || !to.surah || !to.ayah) return blank;
  const fromOrd = positionOrdinal(from);
  const toOrd = positionOrdinal(to);
  if (fromOrd === toOrd) return { ...blank, error: 'End is same as start.' };
  // Auto-detect direction from ordinals — ignore the user-entered direction
  const detectedDir = autoDetectDirection(from, to);
  const prog = progressBetween(from, to, detectedDir);
  const score = Math.min(100, Math.round((prog.pages / Math.max(1, targetPages)) * 100));
  return { ayahs: prog.ayahs, pages: prog.pages, hizbs: prog.hizbs, score, rubric: scoreToRubric(score), grade: scoreToGrade(score), valid: true };
}

function SurahSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))}
      className="text-xs border border-neutral-200 rounded-md bg-white px-1 py-1 pr-5 focus:outline-none focus:ring-1 focus:ring-teal-400 max-w-[140px]">
      <option value={0}>— Surah —</option>
      {SURAHS.map(s => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
    </select>
  );
}

function AyahInput({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  const count = max || 286;
  return (
    <select value={value || ''} onChange={e => onChange(Number(e.target.value))}
      className="text-xs border border-neutral-200 rounded-md bg-white px-1 py-1 focus:outline-none focus:ring-1 focus:ring-teal-400 max-w-[72px]">
      <option value="">Ayah</option>
      {Array.from({ length: count }, (_, i) => i + 1).map(n => (
        <option key={n} value={n}>{n}</option>
      ))}
    </select>
  );
}

export default function Eval3ImportPage() {
  const router = useRouter();
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<LiveClass[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [existingEvals, setExistingEvals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedTermId, setSelectedTermId] = useState('');
  const [targetPages, setTargetPages] = useState(30);

  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const [importing, setImporting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getCurrentProfile().then(p => {
      const ok = ['super_admin', 'admin', 'principal'].includes(p?.role ?? '');
      setAuthorized(ok);
      if (!ok) { setLoading(false); return; }
      Promise.all([
        loadStudents().catch(() => [] as any[]),
        loadClasses().catch(() => [] as any[]),
        loadOperationalTerms().catch(() => [] as any[]),
        loadEvaluations().catch(() => [] as any[]),
      ]).then(([s, c, t, ev]) => {
        setAllStudents(s); setClasses(c); setExistingEvals(ev);
        const sorted = [...t].sort((a: any, b: any) => (a.starts_on || '').localeCompare(b.starts_on || ''));
        setTerms(sorted);
        const current = sorted.find((x: any) => x.academic_years?.is_current && x.term_number === 1);
        if (current) setSelectedTermId(current.id);
        setLoading(false);
      }).catch(() => setLoading(false));
    }).catch(() => { setAuthorized(false); setLoading(false); });
  }, []);

  const classStudents = useMemo(
    () => allStudents.filter(s => s.classId === selectedClassId).sort((a, b) => a.name.localeCompare(b.name)),
    [allStudents, selectedClassId]
  );

  const selectedTerm = terms.find(t => t.id === selectedTermId);
  const termName = selectedTerm?.name || '';

  // Build existing eval3 map for this class+term
  const existingEval3Map = useMemo(() => {
    const map: Record<string, any> = {};
    for (const ev of existingEvals) {
      if (ev.number === 3 && ev.term === termName) {
        map[ev.studentId] = ev;
      }
    }
    return map;
  }, [existingEvals, termName]);

  // Init entries when class/term/students change
  useEffect(() => {
    if (!selectedClassId || !selectedTermId) return;
    const init: Record<string, EntryState> = {};
    for (const s of classStudents) {
      const ex = existingEval3Map[s.id];
      init[s.id] = {
        eval1StartSurah: ex ? ex.from?.surah : (s.current.surah || 0),
        eval1StartAyah:  ex ? ex.from?.ayah  : (s.current.ayah  || 0),
        eval3Surah:      ex ? ex.to?.surah   : 0,
        eval3Ayah:       ex ? ex.to?.ayah    : 0,
        direction:       s.direction || 'Baqarah-to-Nas',
      };
    }
    setEntries(init);
    setMessage(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedTermId, classStudents.length, existingEval3Map]);

  function update(studentId: string, patch: Partial<EntryState>) {
    setEntries(prev => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  }

  const surahMap = Object.fromEntries(SURAHS.map(s => [s.id, s]));

  function getMetrics(student: Student, e: EntryState): ComputedMetrics {
    const dir = (e.direction || student.direction) as 'Baqarah-to-Nas' | 'Nas-to-Baqarah';
    const from = { surah: e.eval1StartSurah || student.current.surah, ayah: e.eval1StartAyah || student.current.ayah };
    return computeEval3(from, { surah: e.eval3Surah, ayah: e.eval3Ayah }, dir, targetPages);
  }

  const readyCount = useMemo(() => classStudents.filter(s => {
    const e = entries[s.id];
    return e ? getMetrics(s, e).valid : false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }).length, [classStudents, entries, targetPages]);

  const pendingCount = useMemo(
    () => classStudents.filter(s => existingEval3Map[s.id]?.status === 'Pending Approval').length,
    [classStudents, existingEval3Map]
  );

  async function handleApproveClass() {
    if (!selectedTermId || !selectedClassId) return;
    setApproving(true); setMessage(null);
    try {
      const count = await adminApproveClassHistoricalEvals(selectedTermId, selectedClassId);
      loadEvaluations().then(ev => setExistingEvals(ev)).catch(() => {});
      setMessage({ type: 'success', text: `Approved ${count} evaluation${count !== 1 ? 's' : ''} for this class. Report cards and student profiles are now updated.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Approval failed. Try again.' });
    } finally {
      setApproving(false);
    }
  }

  async function handleImport() {
    if (!selectedTermId) { setMessage({ type: 'error', text: 'Please select a term.' }); return; }
    if (!selectedClassId) { setMessage({ type: 'error', text: 'Please select a class.' }); return; }

    const batch: HistoricalEvalEntry[] = [];
    for (const student of classStudents) {
      const e = entries[student.id];
      if (!e) continue;
      const m = getMetrics(student, e);
      if (!m.valid) continue;
      // Auto-detect direction from ordinals; use canonical Quran start (Baqarah 1 or Nas 1)
      const detectedDir = autoDetectDirection(
        { surah: e.eval1StartSurah || student.current.surah, ayah: e.eval1StartAyah || student.current.ayah },
        { surah: e.eval3Surah, ayah: e.eval3Ayah }
      );
      const canonical = canonicalStart(detectedDir);

      batch.push({
        studentId: student.id,
        startSurah: canonical.surah, startAyah: canonical.ayah,
        eval3Surah: e.eval3Surah, eval3Ayah: e.eval3Ayah,
        eval3: { ayahs: m.ayahs, pages: m.pages, hizbs: m.hizbs, score: m.score, rubric: m.rubric, grade: m.grade },
        direction: detectedDir,
      });
    }

    if (!batch.length) {
      setMessage({ type: 'error', text: 'No complete entries. Fill in the Eval 3 end position (surah + ayah) for each student.' });
      return;
    }

    setImporting(true); setMessage(null);
    try {
      const result = await bulkImportHistoricalEvals(batch, selectedTermId, 'capture_term');
      // Refresh existing evals so edit indicators update
      loadEvaluations().then(ev => setExistingEvals(ev)).catch(() => {});
      setMessage({ type: 'success', text: `Saved all 3 evaluations for ${result.imported} student${result.imported !== 1 ? 's' : ''}. Their profiles are updated and report cards are ready.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Import failed. Try again.' });
    } finally {
      setImporting(false);
    }
  }

  if (authorized === null || loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!authorized) {
    return <div className="flex flex-col items-center justify-center min-h-screen gap-2"><p className="text-red-600 font-medium">Access denied. Admin only.</p><button onClick={() => router.push('/')} className="text-sm text-teal-600 hover:underline">Go home</button></div>;
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <div className="bg-white border-b border-neutral-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-neutral-900">Historical Records — Student Positions</h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              Review teacher submissions and approve them, or enter positions directly. Approved records update student profiles, report cards, and the parents portal.
            </p>
          </div>
          <button onClick={() => router.push('/evaluations')} className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg px-4 py-2 transition-colors">
            ← Back to Evaluations
          </button>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-5">

        {/* Controls */}
        <div className="bg-white rounded-xl border border-neutral-100 p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Term</label>
              <select value={selectedTermId} onChange={e => setSelectedTermId(e.target.value)}
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="">Select term…</option>
                {terms.map((t: any) => <option key={t.id} value={t.id}>{t.name} {t.academic_years?.is_current ? '(current)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Class</label>
              <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="">Select class…</option>
                {classes.map(c => {
                  const count = allStudents.filter(s => s.classId === c.id).length;
                  return <option key={c.id} value={c.id}>{c.name} ({count} students)</option>;
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Pages expected (100% = this many pages)</label>
              <input type="number" min={1} max={200} value={targetPages}
                onChange={e => setTargetPages(Math.max(1, Number(e.target.value)))}
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400" />
            </div>
            {selectedClassId && (
              <div className="flex flex-col justify-end gap-2">
                <div className="text-xs text-neutral-500">
                  {readyCount} / {classStudents.length} students ready to save
                  {pendingCount > 0 && (
                    <span className="ml-2 font-semibold text-amber-600">· {pendingCount} pending approval</span>
                  )}
                </div>
                {pendingCount > 0 && (
                  <button onClick={handleApproveClass} disabled={approving}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black rounded-xl px-5 py-3 shadow-md shadow-emerald-200 transition-all">
                    {approving ? (
                      <><span className="animate-spin">⏳</span> Approving…</>
                    ) : (
                      <><span className="text-base">✅</span> Approve all for this class <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">{pendingCount}</span></>
                    )}
                  </button>
                )}
                <button onClick={handleImport} disabled={importing || readyCount === 0}
                  className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-colors">
                  {importing ? 'Saving…' : `Save ${readyCount} Student${readyCount !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>

          {message && (
            <div className={`mt-3 rounded-lg px-4 py-3 text-sm font-medium ${message.type === 'success' ? 'bg-teal-50 text-teal-800 border border-teal-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
              {message.text}
              {message.type === 'success' && (
                <button onClick={() => router.push('/reports')}
                  className="ml-3 underline font-bold hover:no-underline">
                  Open Reports →
                </button>
              )}
            </div>
          )}
        </div>

        {/* No class selected */}
        {!selectedClassId && (
          <div className="bg-white rounded-xl border border-neutral-100 p-10 text-center shadow-sm">
            <div className="text-4xl mb-3">📖</div>
            <h2 className="text-base font-semibold text-neutral-800 mb-1">Select a term and class to begin</h2>
            <p className="text-sm text-neutral-500 max-w-lg mx-auto">
              Choose a term and class above. For each student enter where they started this term and where they are now. Already-saved students are pre-filled — correct and save again to update.
            </p>
          </div>
        )}

        {/* No students */}
        {selectedClassId && classStudents.length === 0 && (
          <div className="text-center text-neutral-400 py-16 text-sm">No students enrolled in this class yet.</div>
        )}

        {/* Student table */}
        {selectedClassId && classStudents.length > 0 && (
          <div className="bg-white rounded-xl border border-neutral-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-500">#</th>
                  <th className="px-4 py-3 text-xs font-semibold text-neutral-500">Student</th>
                  <th className="px-3 py-3 text-xs font-semibold text-indigo-600 bg-indigo-50 text-center">Direction</th>
                  <th className="px-3 py-3 text-xs font-semibold text-emerald-600 bg-emerald-50 text-center" colSpan={2}>Start of Term ✏️</th>
                  <th className="px-3 py-3 text-xs font-semibold text-teal-600 bg-teal-50 text-center" colSpan={2}>Current Position ✏️</th>
                  <th className="px-3 py-3 text-xs font-semibold text-teal-500 text-center">Score</th>
                  <th className="px-3 py-3 text-xs font-semibold text-neutral-400 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {classStudents.map((student, idx) => {
                  const e = entries[student.id] ?? { eval1StartSurah: 0, eval1StartAyah: 0, eval3Surah: 0, eval3Ayah: 0, direction: student.direction };
                  const m = getMetrics(student, e);
                  const existing = existingEval3Map[student.id];
                  const alreadySaved = !!existing;
                  const isPending = existing?.status === 'Pending Approval';
                  const isApproved = existing?.status === 'Approved';
                  const rowBg = isPending ? 'bg-amber-50/40' : isApproved ? 'bg-teal-50/20' : idx % 2 === 0 ? '' : 'bg-neutral-50/40';

                  return (
                    <tr key={student.id} className={`border-b border-neutral-50 ${rowBg} hover:bg-teal-50/30 transition-colors`}>
                      <td className="px-4 py-2 text-xs text-neutral-400 font-mono">{idx + 1}</td>
                      <td className="px-4 py-2">
                        <div className="font-medium text-neutral-900 text-xs">{student.name}</div>
                        <div className="text-neutral-400 text-[10px]">{student.admissionNo}</div>
                      </td>

                      {/* Direction */}
                      <td className="px-2 py-2 bg-indigo-50/20 text-center">
                        <select value={e.direction || student.direction}
                          onChange={ev => update(student.id, { direction: ev.target.value })}
                          className="text-xs border border-indigo-200 rounded-md bg-white px-1 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400">
                          <option value="Baqarah-to-Nas">↓ Baqarah→Nas</option>
                          <option value="Nas-to-Baqarah">↑ Nas→Baqarah</option>
                        </select>
                      </td>

                      {/* Eval 3 starts (editable starting point) */}
                      <td className="px-1 py-2 bg-emerald-50/20">
                        <SurahSelect value={e.eval1StartSurah || student.current.surah}
                          onChange={v => update(student.id, { eval1StartSurah: v, eval1StartAyah: 1 })} />
                      </td>
                      <td className="px-1 py-2 bg-emerald-50/20">
                        <AyahInput value={e.eval1StartAyah || student.current.ayah}
                          max={surahMap[e.eval1StartSurah || student.current.surah]?.ayahs ?? 286}
                          onChange={v => update(student.id, { eval1StartAyah: v })} />
                      </td>

                      {/* Eval 3 end */}
                      <td className="px-1 py-2 bg-teal-50/20">
                        <SurahSelect value={e.eval3Surah}
                          onChange={v => update(student.id, { eval3Surah: v, eval3Ayah: 1 })} />
                      </td>
                      <td className="px-1 py-2 bg-teal-50/20">
                        <AyahInput value={e.eval3Ayah}
                          max={surahMap[e.eval3Surah]?.ayahs ?? 286}
                          onChange={v => update(student.id, { eval3Ayah: v })} />
                      </td>

                      {/* Result */}
                      <td className="px-3 py-2 text-center">
                        {m.valid ? (
                          <div>
                            <div className="text-xs font-bold text-teal-700">{m.score}% · {m.grade}</div>
                            <div className="text-[10px] text-neutral-500">{m.ayahs} ayahs · {m.pages}pp</div>
                            <div className="mt-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden w-20 mx-auto">
                              <div className="h-full bg-teal-400 rounded-full" style={{ width: `${m.score}%` }} />
                            </div>
                          </div>
                        ) : m.error ? (
                          <span className="text-[10px] text-red-500 font-medium">{m.error}</span>
                        ) : (
                          <span className="text-[10px] text-neutral-300">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2 text-center min-w-[120px]">
                        {isApproved ? (
                          <div>
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-100">✓ Approved</span>
                            {existing.from?.surah ? (
                              <div className="mt-1 text-[9px] text-teal-600 leading-tight">
                                <div>From S{existing.from.surah}:A{existing.from.ayah}</div>
                                <div>To S{existing.to.surah}:A{existing.to.ayah}</div>
                              </div>
                            ) : null}
                          </div>
                        ) : isPending ? (
                          <div>
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">⏳ Pending Review</span>
                            {existing.from?.surah ? (
                              <div className="mt-1 text-[9px] text-amber-700 leading-tight font-medium">
                                <div>From S{existing.from.surah}:A{existing.from.ayah}</div>
                                <div>To S{existing.to.surah}:A{existing.to.ayah}</div>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-400">Not saved</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Bottom action bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-neutral-100 bg-neutral-50">
              <span className="text-xs text-neutral-500">
                {readyCount} of {classStudents.length} ready to save
                {pendingCount > 0 && <span className="ml-2 font-semibold text-amber-600">· {pendingCount} pending approval</span>}
              </span>
              <div className="flex items-center gap-2">
                {pendingCount > 0 && (
                  <button onClick={handleApproveClass} disabled={approving}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-black rounded-xl px-5 py-2.5 shadow-md shadow-emerald-200 transition-all">
                    {approving ? (
                      <><span className="animate-spin inline-block">⏳</span> Approving…</>
                    ) : (
                      <><span>✅</span> Approve all <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">{pendingCount}</span></>
                    )}
                  </button>
                )}
                <button onClick={handleImport} disabled={importing || readyCount === 0}
                  className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl px-6 py-2.5 transition-colors">
                  {importing ? 'Saving…' : `Save ${readyCount} Student${readyCount !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
