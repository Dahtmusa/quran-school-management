'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  loadStudents, loadClasses, loadOperationalTerms,
  bulkImportHistoricalEvals, getCurrentProfile,
  type HistoricalEvalEntry, type LiveClass,
} from '@/lib/live-store';
import { SURAHS, progressBetween, juzForPosition, pageForPosition, positionOrdinal } from '@/lib/quran';
import type { Student } from '@/lib/data';

type EntryState = {
  startSurah: number; startAyah: number;
  eval1Surah: number; eval1Ayah: number;
  eval2Surah: number; eval2Ayah: number;
};

type ComputedMetrics = {
  ayahs: number; pages: number; hizbs: number;
  score: number; rubric: number; grade: string; valid: boolean;
};

function scoreToRubric(score: number): number {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 45) return 2;
  return 1;
}
function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

function computeEvalMetrics(
  from: { surah: number; ayah: number },
  to: { surah: number; ayah: number },
  direction: 'Baqarah-to-Nas' | 'Nas-to-Baqarah',
  targetAyahs: number
): ComputedMetrics {
  if (!from.surah || !from.ayah || !to.surah || !to.ayah) {
    return { ayahs: 0, pages: 0, hizbs: 0, score: 0, rubric: 1, grade: 'F', valid: false };
  }
  const fromOrd = positionOrdinal(from);
  const toOrd = positionOrdinal(to);
  const forward = direction === 'Baqarah-to-Nas' ? toOrd >= fromOrd : fromOrd >= toOrd;
  if (!forward || fromOrd === toOrd) {
    return { ayahs: 0, pages: 0, hizbs: 0, score: 0, rubric: 1, grade: 'F', valid: false };
  }
  const prog = progressBetween(from, to, direction);
  const score = Math.min(100, Math.round((prog.ayahs / Math.max(1, targetAyahs)) * 100));
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
      {SURAHS.map(s => (
        <option key={s.id} value={s.id}>{s.id}. {s.name}</option>
      ))}
    </select>
  );
}

function AyahInput({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      min={1}
      max={max || 286}
      value={value || ''}
      onChange={e => onChange(Math.max(1, Math.min(max || 286, Number(e.target.value))))}
      placeholder="Ayah"
      className="w-14 text-xs border border-neutral-200 rounded-md bg-white px-1 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400 text-center"
    />
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
  const [targetAyahs, setTargetAyahs] = useState(150);

  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    getCurrentProfile()
      .then(p => {
        const ok = ['super_admin', 'admin', 'principal'].includes(p?.role ?? '');
        setAuthorized(ok);
        if (!ok) { setLoading(false); return; }
        Promise.all([
          loadStudents().catch(e => { console.error('[AMQM] loadStudents failed:', e); return [] as any[]; }),
          loadClasses().catch(e => { console.error('[AMQM] loadClasses failed:', e); return [] as any[]; }),
          loadOperationalTerms().catch(e => { console.error('[AMQM] loadOperationalTerms failed:', e); return [] as any[]; }),
        ])
          .then(([s, c, t]) => {
            setAllStudents(s);
            setClasses(c);
            const sorted = [...t].sort((a: any, b: any) => (a.starts_on || '').localeCompare(b.starts_on || ''));
            setTerms(sorted);
            const current = sorted.find((x: any) => x.academic_years?.is_current && x.term_number === 1);
            if (current) setSelectedTermId(current.id);
            setLoading(false);
          })
          .catch(err => {
            console.error('[AMQM] Historical eval data load failed:', err);
            setLoading(false);
          });
      })
      .catch(err => {
        console.error('[AMQM] getCurrentProfile failed:', err);
        setAuthorized(false);
        setLoading(false);
      });
  }, []);

  const classStudents = useMemo(
    () => allStudents.filter(s => s.classId === selectedClassId).sort((a, b) => a.name.localeCompare(b.name)),
    [allStudents, selectedClassId]
  );

  // Pre-fill entries when class changes
  useEffect(() => {
    if (!selectedClassId) return;
    const init: Record<string, EntryState> = {};
    for (const s of classStudents) {
      init[s.id] = entries[s.id] ?? {
        startSurah: s.start.surah || 0,
        startAyah: s.start.ayah || 0,
        eval1Surah: 0, eval1Ayah: 0,
        eval2Surah: s.current.surah || 0,
        eval2Ayah: s.current.ayah || 0,
      };
    }
    setEntries(init);
    setMessage(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, classStudents.length]);

  function update(studentId: string, patch: Partial<EntryState>) {
    setEntries(prev => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  }

  function getComputed(student: Student, e: EntryState): { e1: ComputedMetrics; e2: ComputedMetrics } {
    const dir = student.direction;
    const e1 = computeEvalMetrics(
      { surah: e.startSurah, ayah: e.startAyah },
      { surah: e.eval1Surah, ayah: e.eval1Ayah },
      dir, targetAyahs
    );
    const e2 = computeEvalMetrics(
      { surah: e.eval1Surah, ayah: e.eval1Ayah },
      { surah: e.eval2Surah, ayah: e.eval2Ayah },
      dir, targetAyahs
    );
    return { e1, e2 };
  }

  async function handleImport() {
    if (!selectedTermId) { setMessage({ type: 'error', text: 'Please select a term.' }); return; }
    if (!selectedClassId) { setMessage({ type: 'error', text: 'Please select a class.' }); return; }

    const batch: HistoricalEvalEntry[] = [];
    for (const student of classStudents) {
      const e = entries[student.id];
      if (!e) continue;
      const { e1, e2 } = getComputed(student, e);
      if (!e1.valid || !e2.valid) continue;
      batch.push({
        studentId: student.id,
        startSurah: e.startSurah, startAyah: e.startAyah,
        eval1Surah: e.eval1Surah, eval1Ayah: e.eval1Ayah,
        eval2Surah: e.eval2Surah, eval2Ayah: e.eval2Ayah,
        eval1: e1, eval2: e2,
      });
    }

    if (!batch.length) {
      setMessage({ type: 'error', text: 'No complete entries to import. Fill in all three positions per student.' });
      return;
    }

    setImporting(true);
    setMessage(null);
    try {
      const result = await bulkImportHistoricalEvals(batch, selectedTermId);
      setMessage({ type: 'success', text: `Successfully imported Eval 1 & 2 for ${result.imported} student${result.imported !== 1 ? 's' : ''} in this class. Progress bars and dashboards are now updated.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message ?? 'Import failed. Check console for details.' });
    } finally {
      setImporting(false);
    }
  }

  const readyCount = useMemo(() => {
    return classStudents.filter(s => {
      const e = entries[s.id];
      if (!e) return false;
      const { e1, e2 } = getComputed(s, e);
      return e1.valid && e2.valid;
    }).length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classStudents, entries, targetAyahs]);

  if (authorized === null || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-2">
        <p className="text-red-600 font-medium">Access denied. Admin only.</p>
        <button onClick={() => router.push('/')} className="text-sm text-amber-600 hover:underline">Go home</button>
      </div>
    );
  }

  const surahMap = Object.fromEntries(SURAHS.map(s => [s.id, s]));

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <div className="bg-white border-b border-neutral-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-neutral-900">Historical Evaluation Import</h1>
            <p className="text-xs text-neutral-500 mt-0.5">Enter Eval 1 & 2 positions class by class. System computes coverage &amp; scores automatically.</p>
          </div>
          <button onClick={() => router.push('/evaluations')} className="text-sm text-neutral-500 hover:text-neutral-800 transition-colors">
            ← Back to Evaluations
          </button>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-5">

        {/* Controls */}
        <div className="bg-white rounded-xl border border-neutral-100 p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Term</label>
              <select
                value={selectedTermId}
                onChange={e => setSelectedTermId(e.target.value)}
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">Select term…</option>
                {terms.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.academic_years?.is_current ? '(current)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Class</label>
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">Select class…</option>
                {classes.map(c => {
                  const count = allStudents.filter(s => s.classId === c.id).length;
                  return <option key={c.id} value={c.id}>{c.name} ({count} students)</option>;
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Target Ayahs / Eval (for scoring)</label>
              <input
                type="number"
                min={50}
                max={500}
                value={targetAyahs}
                onChange={e => setTargetAyahs(Math.max(50, Number(e.target.value)))}
                className="w-full text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-xs text-neutral-400 mt-0.5">Score = min(100, ayahs ÷ target × 100)</p>
            </div>

            {selectedClassId && (
              <div className="flex flex-col justify-end">
                <div className="text-xs text-neutral-500 mb-1">{readyCount} / {classStudents.length} students ready</div>
                <button
                  onClick={handleImport}
                  disabled={importing || readyCount === 0}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg px-4 py-2 transition-colors"
                >
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

        {/* Legend */}
        {selectedClassId && classStudents.length > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-xs text-amber-800">
            <strong>How to fill in:</strong> &nbsp;
            <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono">Start</span> = where the student began the term &nbsp;|&nbsp;
            <span className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-mono">Eval 1 End</span> = where they stopped at mid-term &nbsp;|&nbsp;
            <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-mono">Eval 2 / Current</span> = current position (end of term so far)
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
                  <th className="text-center px-2 py-3 text-xs font-semibold text-blue-600 bg-blue-50 whitespace-nowrap" colSpan={2}>Start Position</th>
                  <th className="text-center px-2 py-3 text-xs font-semibold text-violet-600 bg-violet-50 whitespace-nowrap" colSpan={2}>Eval 1 End</th>
                  <th className="text-center px-2 py-3 text-xs font-semibold text-emerald-600 bg-emerald-50 whitespace-nowrap" colSpan={2}>Eval 2 / Current</th>
                  <th className="text-center px-2 py-3 text-xs font-semibold text-violet-500 whitespace-nowrap">Eval 1 Coverage</th>
                  <th className="text-center px-2 py-3 text-xs font-semibold text-emerald-500 whitespace-nowrap">Eval 2 Coverage</th>
                </tr>
              </thead>
              <tbody>
                {classStudents.map((student, idx) => {
                  const e = entries[student.id] ?? { startSurah: 0, startAyah: 0, eval1Surah: 0, eval1Ayah: 0, eval2Surah: 0, eval2Ayah: 0 };
                  const { e1, e2 } = getComputed(student, e);
                  const startSurah = surahMap[e.startSurah];
                  const eval1Surah = surahMap[e.eval1Surah];
                  const eval2Surah = surahMap[e.eval2Surah];

                  return (
                    <tr key={student.id} className={`border-b border-neutral-50 ${idx % 2 === 0 ? '' : 'bg-neutral-50/50'} hover:bg-amber-50/30 transition-colors`}>
                      {/* Student info */}
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="font-medium text-neutral-900 text-xs">{student.name}</div>
                        <div className="text-neutral-400 text-[10px]">{student.admissionNo} · {student.direction === 'Baqarah-to-Nas' ? '→ Baqarah' : '← Nas'}</div>
                      </td>

                      {/* Start Position */}
                      <td className="px-1 py-2 bg-blue-50/30">
                        <SurahSelect value={e.startSurah} onChange={v => update(student.id, { startSurah: v, startAyah: 1 })} />
                      </td>
                      <td className="px-1 py-2 bg-blue-50/30">
                        <AyahInput value={e.startAyah} max={startSurah?.ayahs ?? 286} onChange={v => update(student.id, { startAyah: v })} />
                      </td>

                      {/* Eval 1 End */}
                      <td className="px-1 py-2 bg-violet-50/30">
                        <SurahSelect value={e.eval1Surah} onChange={v => update(student.id, { eval1Surah: v, eval1Ayah: 1 })} />
                      </td>
                      <td className="px-1 py-2 bg-violet-50/30">
                        <AyahInput value={e.eval1Ayah} max={eval1Surah?.ayahs ?? 286} onChange={v => update(student.id, { eval1Ayah: v })} />
                      </td>

                      {/* Eval 2 / Current */}
                      <td className="px-1 py-2 bg-emerald-50/30">
                        <SurahSelect value={e.eval2Surah} onChange={v => update(student.id, { eval2Surah: v, eval2Ayah: 1 })} />
                      </td>
                      <td className="px-1 py-2 bg-emerald-50/30">
                        <AyahInput value={e.eval2Ayah} max={eval2Surah?.ayahs ?? 286} onChange={v => update(student.id, { eval2Ayah: v })} />
                      </td>

                      {/* Eval 1 Coverage */}
                      <td className="px-3 py-2 text-center">
                        {e1.valid ? (
                          <div>
                            <div className="text-xs font-semibold text-violet-700">{e1.ayahs} ayahs</div>
                            <div className="text-[10px] text-neutral-500">{e1.pages} pg · {e1.score}% · {e1.grade}</div>
                            <div className="mt-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                              <div className="h-full bg-violet-400 rounded-full transition-all" style={{ width: `${e1.score}%` }} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-neutral-300">—</span>
                        )}
                      </td>

                      {/* Eval 2 Coverage */}
                      <td className="px-3 py-2 text-center">
                        {e2.valid ? (
                          <div>
                            <div className="text-xs font-semibold text-emerald-700">{e2.ayahs} ayahs</div>
                            <div className="text-[10px] text-neutral-500">{e2.pages} pg · {e2.score}% · {e2.grade}</div>
                            <div className="mt-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                              <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${e2.score}%` }} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-neutral-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Bottom import bar */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 bg-neutral-50">
              <span className="text-xs text-neutral-500">
                {readyCount} of {classStudents.length} students have all positions filled
              </span>
              <button
                onClick={handleImport}
                disabled={importing || readyCount === 0}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg px-6 py-2 transition-colors"
              >
                {importing ? 'Importing…' : `Import ${readyCount} Students`}
              </button>
            </div>
          </div>
        )}

        {/* Instructions panel (no class selected) */}
        {!selectedClassId && (
          <div className="bg-white rounded-xl border border-neutral-100 p-8 text-center shadow-sm">
            <div className="text-4xl mb-3">📖</div>
            <h2 className="text-base font-semibold text-neutral-800 mb-1">Select a class to begin</h2>
            <p className="text-sm text-neutral-500 max-w-md mx-auto">
              Choose a term and class above. You&apos;ll see all students in that class with pre-filled
              starting positions. Enter each student&apos;s Eval 1 and Eval 2 end positions, then click Import.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left max-w-xl mx-auto">
              {[
                { color: 'blue', label: 'Start Position', desc: 'Where the student began memorizing at the start of this term.' },
                { color: 'violet', label: 'Eval 1 End', desc: 'Surah & ayah where the student stopped at mid-term evaluation.' },
                { color: 'emerald', label: 'Eval 2 / Current', desc: 'Current position — becomes the student\'s live progress bar.' },
              ].map(item => (
                <div key={item.label} className={`rounded-lg p-3 bg-${item.color}-50 border border-${item.color}-100`}>
                  <div className={`text-xs font-semibold text-${item.color}-700 mb-1`}>{item.label}</div>
                  <div className="text-xs text-neutral-600">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
