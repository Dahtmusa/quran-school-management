'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  loadStudents, loadClasses, loadOperationalTerms,
  bulkImportHistoricalEvals, getCurrentProfile,
  type HistoricalEvalEntry, type LiveClass,
} from '@/lib/live-store';
import { SURAHS, progressBetween, positionOrdinal } from '@/lib/quran';
import type { Student } from '@/lib/data';

type ImportMode = 'eval1_eval2' | 'eval3';

type EntryState = {
  eval1StartSurah: number; eval1StartAyah: number; // locked from student.current at init
  eval1Surah: number; eval1Ayah: number;
  eval2Surah: number; eval2Ayah: number;
  eval3Surah: number; eval3Ayah: number;
  direction: string; // memorization direction — editable in eval3 mode, saved to student profile on import
};

type ComputedMetrics = {
  ayahs: number; pages: number; hizbs: number;
  score: number; rubric: number; grade: string; valid: boolean;
  error?: string;
};

function scoreToRubric(s: number) { return s >= 90 ? 5 : s >= 75 ? 4 : s >= 60 ? 3 : s >= 45 ? 2 : 1; }
function scoreToGrade(s: number) { return s >= 90 ? 'A' : s >= 75 ? 'B' : s >= 60 ? 'C' : s >= 45 ? 'D' : 'F'; }

function computeEvalMetrics(
  from: { surah: number; ayah: number },
  to: { surah: number; ayah: number },
  direction: 'Baqarah-to-Nas' | 'Nas-to-Baqarah',
  targetPages: number
): ComputedMetrics {
  const blank = { ayahs: 0, pages: 0, hizbs: 0, score: 0, rubric: 1, grade: 'F', valid: false };
  if (!from.surah || !from.ayah || !to.surah || !to.ayah) return blank;
  const fromOrd = positionOrdinal(from);
  const toOrd = positionOrdinal(to);
  if (fromOrd === toOrd) return { ...blank, error: 'End position is the same as the start — select a different position.' };
  const forward = direction === 'Baqarah-to-Nas' ? toOrd > fromOrd : fromOrd > toOrd;
  if (!forward) {
    const expected = direction === 'Baqarah-to-Nas' ? 'a later surah (Al-Baqarah → An-Nas)' : 'an earlier surah (An-Nas → Al-Baqarah)';
    return { ...blank, error: `Position goes in the wrong direction — select ${expected}.` };
  }
  const prog = progressBetween(from, to, direction);
  const score = Math.min(100, Math.round((prog.pages / Math.max(1, targetPages)) * 100));
  const rubric = scoreToRubric(score);
  return { ayahs: prog.ayahs, pages: prog.pages, hizbs: prog.hizbs, score, rubric, grade: scoreToGrade(score), valid: true };
}

function SurahSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="text-xs border border-neutral-200 rounded-md bg-white px-1 py-1 pr-5 focus:outline-none focus:ring-1 focus:ring-amber-400"
    >
      <option value={0}>-- Surah --</option>
      {SURAHS.map(s => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
    </select>
  );
}

function AyahInput({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number" min={1} max={max || 286} value={value || ''}
      onChange={e => onChange(Math.max(1, Math.min(max || 286, Number(e.target.value))))}
      placeholder="Ayah"
      className="w-14 text-xs border border-neutral-200 rounded-md bg-white px-1 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400 text-center"
    />
  );
}

function PosChip({ surahId, ayah, surahMap, muted }: { surahId: number; ayah: number; surahMap: Record<number, { name: string }>; muted?: boolean }) {
  if (!surahId || !ayah) return <span className="text-[10px] text-neutral-300 italic">not set</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono whitespace-nowrap ${muted ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>
      {surahMap[surahId]?.name ?? `S${surahId}`}:{ayah}
    </span>
  );
}

function CoverageCell({ m, color }: { m: ComputedMetrics; color: 'violet' | 'amber' | 'teal' }) {
  if (!m.valid) {
    if (m.error) return (
      <div className="flex items-start gap-1 text-[10px] text-red-600 font-medium max-w-[160px]">
        <span className="mt-px shrink-0">⚠</span><span>{m.error}</span>
      </div>
    );
    return <span className="text-[10px] text-neutral-300">—</span>;
  }
  const bar = color === 'violet' ? 'bg-violet-400' : color === 'amber' ? 'bg-amber-400' : 'bg-teal-400';
  const text = color === 'violet' ? 'text-violet-700' : color === 'amber' ? 'text-amber-700' : 'text-teal-700';
  return (
    <div>
      <div className={`text-xs font-semibold ${text}`}>{m.ayahs} ayahs</div>
      <div className="text-[10px] text-neutral-500">{m.pages} pg · {m.score}% · {m.grade}</div>
      <div className="mt-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
        <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${m.score}%` }} />
      </div>
    </div>
  );
}

export default function HistoricalEvalPage() {
  const router = useRouter();

  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<LiveClass[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedTermId, setSelectedTermId] = useState('');
  const [targetPages, setTargetPages] = useState(30);
  const [importMode, setImportMode] = useState<ImportMode>('eval1_eval2');

  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const [importing, setImporting] = useState(false);
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
      ]).then(([s, c, t]) => {
        setAllStudents(s); setClasses(c);
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

  const lsKey = `amqm-hist-${importMode}-${selectedClassId}-${selectedTermId}`;

  // Persist entries to localStorage whenever they change
  useEffect(() => {
    if (!selectedClassId || !selectedTermId || !Object.keys(entries).length) return;
    try { localStorage.setItem(lsKey, JSON.stringify(entries)); } catch {}
  }, [entries, lsKey]);

  // Load / init entries when class, term, or mode changes
  useEffect(() => {
    if (!selectedClassId || !selectedTermId) return;
    let stored: Record<string, EntryState> = {};
    try { const raw = localStorage.getItem(lsKey); if (raw) stored = JSON.parse(raw); } catch {}
    const init: Record<string, EntryState> = {};
    for (const s of classStudents) {
      init[s.id] = stored[s.id] ?? {
        eval1StartSurah: s.current.surah, eval1StartAyah: s.current.ayah,
        eval1Surah: 0, eval1Ayah: 0, eval2Surah: 0, eval2Ayah: 0,
        eval3Surah: 0, eval3Ayah: 0,
        direction: s.direction,
      };
    }
    setEntries(init);
    setMessage(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, selectedTermId, importMode, classStudents.length]);

  function update(studentId: string, patch: Partial<EntryState>) {
    setEntries(prev => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  }

  function getComputed(student: Student, e: EntryState) {
    const dir = ((e.direction || student.direction) as 'Baqarah-to-Nas' | 'Nas-to-Baqarah');
    const start = { surah: e.eval1StartSurah || student.current.surah, ayah: e.eval1StartAyah || student.current.ayah };
    const e1 = computeEvalMetrics(start, { surah: e.eval1Surah, ayah: e.eval1Ayah }, dir, targetPages);
    const e2 = computeEvalMetrics({ surah: e.eval1Surah, ayah: e.eval1Ayah }, { surah: e.eval2Surah, ayah: e.eval2Ayah }, dir, targetPages);
    const e3 = computeEvalMetrics(start, { surah: e.eval3Surah, ayah: e.eval3Ayah }, dir, targetPages);
    return { e1, e2, e3 };
  }

  const readyCount = useMemo(() => classStudents.filter(s => {
    const e = entries[s.id];
    if (!e) return false;
    const { e1, e2, e3 } = getComputed(s, e);
    return importMode === 'eval3' ? e3.valid : (e1.valid && e2.valid);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }).length, [classStudents, entries, targetPages, importMode]);

  async function handleImport() {
    if (!selectedTermId) { setMessage({ type: 'error', text: 'Please select a term.' }); return; }
    if (!selectedClassId) { setMessage({ type: 'error', text: 'Please select a class.' }); return; }

    const batch: HistoricalEvalEntry[] = [];

    for (const student of classStudents) {
      const e = entries[student.id];
      if (!e) continue;
      const { e1, e2, e3 } = getComputed(student, e);
      const start = { surah: e.eval1StartSurah || student.current.surah, ayah: e.eval1StartAyah || student.current.ayah };

      if (importMode === 'eval3') {
        if (!e3.valid) continue;
        batch.push({
          studentId: student.id,
          startSurah: start.surah, startAyah: start.ayah,
          eval3Surah: e.eval3Surah, eval3Ayah: e.eval3Ayah,
          eval3: e3,
          direction: e.direction || student.direction,
        });
      } else {
        if (!e1.valid || !e2.valid) continue;
        batch.push({
          studentId: student.id,
          startSurah: start.surah, startAyah: start.ayah,
          eval1Surah: e.eval1Surah, eval1Ayah: e.eval1Ayah,
          eval2Surah: e.eval2Surah, eval2Ayah: e.eval2Ayah,
          eval1: e1, eval2: e2,
        });
      }
    }

    if (!batch.length) {
      setMessage({ type: 'error', text: importMode === 'eval3'
        ? 'No complete entries. Fill in Eval 3 end positions for each student.'
        : 'No complete entries. Fill in Eval 1 and Eval 2 end positions for each student.' });
      return;
    }

    setImporting(true); setMessage(null);
    try {
      const result = await bulkImportHistoricalEvals(batch, selectedTermId, importMode);
      setMessage({ type: 'success', text: importMode === 'eval3'
        ? `Imported Eval 3 for ${result.imported} student${result.imported !== 1 ? 's' : ''}. Each student's current position is now set to their Eval 3 end — the term is ready to be marked complete.`
        : `Imported Eval 1 & 2 for ${result.imported} student${result.imported !== 1 ? 's' : ''}. Each student's current position is now set to their Eval 2 end. Your entries are saved — you can correct any values and re-import; it will update existing records.`,
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Import failed. Check console for details.' });
    } finally {
      setImporting(false);
    }
  }

  if (authorized === null || loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!authorized) {
    return <div className="flex flex-col items-center justify-center min-h-screen gap-2"><p className="text-red-600 font-medium">Access denied. Admin only.</p><button onClick={() => router.push('/')} className="text-sm text-amber-600 hover:underline">Go home</button></div>;
  }

  const surahMap = Object.fromEntries(SURAHS.map(s => [s.id, s]));

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <div className="bg-white border-b border-neutral-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-neutral-900">Historical Evaluation Import</h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              {importMode === 'eval3'
                ? 'Import Eval 3 — enter the end position for each student. Eval 3\'s end becomes their current position so the term can be completed and report cards generated.'
                : 'Enter Eval 1 and Eval 2 end positions. The system links the chain — Eval 2\'s end becomes each student\'s current so teachers can submit Eval 3 live.'}
            </p>
          </div>
          <button onClick={() => router.push('/evaluations')} className="text-sm text-neutral-500 hover:text-neutral-800 transition-colors">
            ← Back to Evaluations
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-5">

        {/* Controls */}
        <div className="bg-white rounded-xl border border-neutral-100 p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Term</label>
              <select value={selectedTermId} onChange={e => setSelectedTermId(e.target.value)}
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">Select term…</option>
                {terms.map((t: any) => <option key={t.id} value={t.id}>{t.name} {t.academic_years?.is_current ? '(current)' : ''}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Class</label>
              <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="">Select class…</option>
                {classes.map(c => {
                  const count = allStudents.filter(s => s.classId === c.id).length;
                  return <option key={c.id} value={c.id}>{c.name} ({count} students)</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">What to import</label>
              <select value={importMode} onChange={e => setImportMode(e.target.value as ImportMode)}
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="eval1_eval2">Eval 1 &amp; 2 (historical — both missing)</option>
                <option value="eval3">Eval 3 only (complete the term)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Pages expected per eval (for scoring)</label>
              <input type="number" min={1} max={200} value={targetPages} onChange={e => setTargetPages(Math.max(1, Number(e.target.value)))}
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <p className="text-xs text-neutral-400 mt-0.5">Memorizing {targetPages} pages = 100%</p>
            </div>

            {selectedClassId && (
              <div className="flex flex-col justify-end">
                <div className="text-xs text-neutral-500 mb-1">{readyCount} / {classStudents.length} students ready</div>
                <button onClick={handleImport} disabled={importing || readyCount === 0}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg px-4 py-2 transition-colors">
                  {importing ? 'Importing…' : `Import ${readyCount} Students`}
                </button>
              </div>
            )}
          </div>

          {message && (
            <div className={`mt-3 rounded-lg px-4 py-3 text-sm font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
              {message.text}
            </div>
          )}
        </div>

        {/* Flow indicator */}
        {selectedClassId && classStudents.length > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-800 flex flex-wrap gap-2 items-center">
            <strong>Flow:</strong>
            {importMode === 'eval3' ? (<>
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">Eval 1 &amp; 2 (approved)</span>
              <span className="text-neutral-400">→</span>
              <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-mono">Current (Eval 3 begins here)</span>
              <span className="text-neutral-400">→</span>
              <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded font-mono">Eval 3 End ✏️</span>
              <span className="text-neutral-400">→ new current → term complete → report cards + invoices →</span>
              <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded font-mono">Term 2 Eval 1 starts here</span>
            </>) : (<>
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">Start (profile)</span>
              <span className="text-neutral-400">…</span>
              <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-mono">Current (Eval 1 begins here)</span>
              <span className="text-neutral-400">→</span>
              <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded font-mono">Eval 1 End ✏️</span>
              <span className="text-neutral-400">→ Eval 2 begins →</span>
              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-mono">Eval 2 End ✏️</span>
              <span className="text-neutral-400">→ new current →</span>
              <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded font-mono">Eval 3 (live)</span>
            </>)}
          </div>
        )}

        {/* Student Table */}
        {selectedClassId && classStudents.length === 0 && (
          <div className="text-center text-neutral-400 py-16 text-sm">No students enrolled in this class yet.</div>
        )}

        {selectedClassId && classStudents.length > 0 && (
          <div className="bg-white rounded-xl border border-neutral-100 shadow-sm overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 whitespace-nowrap">Student</th>
                  {importMode === 'eval3' ? (<>
                    <th className="text-center px-2 py-3 text-xs font-semibold text-indigo-600 bg-indigo-50 whitespace-nowrap">Direction ✏️</th>
                    <th className="text-center px-2 py-3 text-xs font-semibold text-emerald-600 bg-emerald-50 whitespace-nowrap" colSpan={2}>Eval 3 Begins ✏️</th>
                    <th className="text-center px-2 py-3 text-xs font-semibold text-teal-600 bg-teal-50 whitespace-nowrap" colSpan={2}>Eval 3 End ✏️</th>
                    <th className="text-center px-2 py-3 text-xs font-semibold text-teal-500 whitespace-nowrap">Eval 3</th>
                  </>) : (<>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 bg-slate-50 whitespace-nowrap">Start</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-violet-500 bg-violet-50 whitespace-nowrap">Eval 1 Begins</th>
                    <th className="text-center px-2 py-3 text-xs font-semibold text-violet-600 bg-violet-50 whitespace-nowrap" colSpan={2}>Eval 1 End ✏️</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-amber-500 bg-amber-50 whitespace-nowrap">Eval 2 Begins</th>
                    <th className="text-center px-2 py-3 text-xs font-semibold text-amber-600 bg-amber-50 whitespace-nowrap" colSpan={2}>Eval 2 End ✏️</th>
                    <th className="text-center px-2 py-3 text-xs font-semibold text-violet-500 whitespace-nowrap">Eval 1</th>
                    <th className="text-center px-2 py-3 text-xs font-semibold text-amber-500 whitespace-nowrap">Eval 2</th>
                  </>)}
                </tr>
              </thead>
              <tbody>
                {classStudents.map((student, idx) => {
                  const e = entries[student.id] ?? { eval1StartSurah: 0, eval1StartAyah: 0, eval1Surah: 0, eval1Ayah: 0, eval2Surah: 0, eval2Ayah: 0, eval3Surah: 0, eval3Ayah: 0 };
                  const { e1, e2, e3 } = getComputed(student, e);
                  const rowBg = idx % 2 === 0 ? '' : 'bg-neutral-50/50';

                  return (
                    <tr key={student.id} className={`border-b border-neutral-50 ${rowBg} hover:bg-amber-50/30 transition-colors`}>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="font-medium text-neutral-900 text-xs">{student.name}</div>
                        <div className="text-neutral-400 text-[10px]">{student.admissionNo} · {student.direction === 'Baqarah-to-Nas' ? '→' : '←'}</div>
                      </td>

                      {importMode === 'eval3' ? (<>
                        {/* Direction — editable, saved to student profile on import */}
                        <td className="px-2 py-2 bg-indigo-50/30">
                          <select value={e.direction || student.direction}
                            onChange={ev => update(student.id, { direction: ev.target.value })}
                            className="text-xs border border-indigo-200 rounded-md bg-white px-1 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 whitespace-nowrap">
                            <option value="Baqarah-to-Nas">↓ Baqarah → Nas</option>
                            <option value="Nas-to-Baqarah">↑ Nas → Baqarah</option>
                          </select>
                        </td>
                        {/* Eval 3 begins — editable */}
                        <td className="px-1 py-2 bg-emerald-50/40">
                          <SurahSelect value={e.eval1StartSurah || student.current.surah} onChange={v => update(student.id, { eval1StartSurah: v, eval1StartAyah: 1 })} />
                        </td>
                        <td className="px-1 py-2 bg-emerald-50/40">
                          <AyahInput value={e.eval1StartAyah || student.current.ayah} max={surahMap[e.eval1StartSurah || student.current.surah]?.ayahs ?? 286} onChange={v => update(student.id, { eval1StartAyah: v })} />
                        </td>
                        {/* Eval 3 End — admin input */}
                        <td className="px-1 py-2 bg-teal-50/30">
                          <SurahSelect value={e.eval3Surah} onChange={v => update(student.id, { eval3Surah: v, eval3Ayah: 1 })} />
                        </td>
                        <td className="px-1 py-2 bg-teal-50/30">
                          <AyahInput value={e.eval3Ayah} max={surahMap[e.eval3Surah]?.ayahs ?? 286} onChange={v => update(student.id, { eval3Ayah: v })} />
                        </td>
                        <td className="px-3 py-2 text-center"><CoverageCell m={e3} color="teal" /></td>
                      </>) : (<>
                        {/* Start */}
                        <td className="px-3 py-2 text-center bg-slate-50/40">
                          <PosChip surahId={student.start.surah} ayah={student.start.ayah} surahMap={surahMap} muted />
                        </td>
                        {/* Eval 1 begins */}
                        <td className="px-3 py-2 text-center bg-violet-50/40">
                          <PosChip surahId={e.eval1StartSurah || student.current.surah} ayah={e.eval1StartAyah || student.current.ayah} surahMap={surahMap} />
                        </td>
                        {/* Eval 1 End */}
                        <td className="px-1 py-2 bg-violet-50/30">
                          <SurahSelect value={e.eval1Surah} onChange={v => update(student.id, { eval1Surah: v, eval1Ayah: 1 })} />
                        </td>
                        <td className="px-1 py-2 bg-violet-50/30">
                          <AyahInput value={e.eval1Ayah} max={surahMap[e.eval1Surah]?.ayahs ?? 286} onChange={v => update(student.id, { eval1Ayah: v })} />
                        </td>
                        {/* Eval 2 begins */}
                        <td className="px-3 py-2 text-center bg-amber-50/40">
                          <PosChip surahId={e.eval1Surah} ayah={e.eval1Ayah} surahMap={surahMap} />
                        </td>
                        {/* Eval 2 End */}
                        <td className="px-1 py-2 bg-amber-50/30">
                          <SurahSelect value={e.eval2Surah} onChange={v => update(student.id, { eval2Surah: v, eval2Ayah: 1 })} />
                        </td>
                        <td className="px-1 py-2 bg-amber-50/30">
                          <AyahInput value={e.eval2Ayah} max={surahMap[e.eval2Surah]?.ayahs ?? 286} onChange={v => update(student.id, { eval2Ayah: v })} />
                        </td>
                        {/* Coverage */}
                        <td className="px-3 py-2 text-center"><CoverageCell m={e1} color="violet" /></td>
                        <td className="px-3 py-2 text-center"><CoverageCell m={e2} color="amber" /></td>
                      </>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Bottom import bar */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 bg-neutral-50">
              <span className="text-xs text-neutral-500">
                {readyCount} of {classStudents.length} students have {importMode === 'eval3' ? 'Eval 3 position' : 'both eval positions'} filled
              </span>
              <button onClick={handleImport} disabled={importing || readyCount === 0}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg px-6 py-2 transition-colors">
                {importing ? 'Importing…' : `Import ${readyCount} Students`}
              </button>
            </div>
          </div>
        )}

        {/* Instructions (no class selected) */}
        {!selectedClassId && (
          <div className="bg-white rounded-xl border border-neutral-100 p-8 text-center shadow-sm">
            <div className="text-4xl mb-3">📖</div>
            <h2 className="text-base font-semibold text-neutral-800 mb-1">Select a term and class to begin</h2>
            <p className="text-sm text-neutral-500 max-w-lg mx-auto mb-6">
              Choose <strong>Eval 1 &amp; 2</strong> if both are missing from the database, or <strong>Eval 3 only</strong> if Eval 1 and 2 are already approved and you just need to import the final evaluation to complete the term and generate report cards.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-xl mx-auto text-xs">
              <div className="rounded-lg p-3 bg-violet-50 border border-violet-100">
                <div className="font-semibold text-violet-700 mb-1">Eval 1 &amp; 2 mode</div>
                <div className="text-neutral-600">Import Eval 1 and Eval 2 together. Eval 2's end becomes the student's current position so teachers submit Eval 3 live.</div>
              </div>
              <div className="rounded-lg p-3 bg-teal-50 border border-teal-100">
                <div className="font-semibold text-teal-700 mb-1">Eval 3 only mode</div>
                <div className="text-neutral-600">Eval 1 &amp; 2 already approved. Import Eval 3 to close the term — each student's Eval 3 end becomes their new current for Second Term Eval 1.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
