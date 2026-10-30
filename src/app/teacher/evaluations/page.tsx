'use client';
// Dedicated evaluations workspace for teachers. Three big tiles for
// Eval 1 / 2 / 3 with live countdown, and a clean entry grid where
// every row CLEARLY shows the student's name, admission number,
// their starting position (locked), and their memorization direction.
import AdminShell from '@/components/AdminShell';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { loadTeacherEvalEntries, loadTeacherEvalWindows, submitTeacherEvaluation, type TeacherEvalEntry, type TeacherEvalWindow } from '@/lib/live-store';
import { SURAHS, calculateEvaluation } from '@/lib/quran';

type EvalForm = { toSurah: number; toAyah: number; mem: number; acc: number; flu: number; taj: number; ret: number; comment: string };

export default function TeacherEvaluationsPage() {
  const [entries, setEntries] = useState<TeacherEvalEntry[]>([]);
  const [windows, setWindows] = useState<TeacherEvalWindow[]>([]);
  const [forms, setForms] = useState<Record<string, EvalForm>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  async function refresh() {
    const [e, w] = await Promise.all([loadTeacherEvalEntries(), loadTeacherEvalWindows()]);
    setEntries(e);
    setWindows(w);
  }
  useEffect(() => { refresh(); }, []);

  // Seed each form with the stored stopping position (if any) OR the
  // student's starting position (= from_surah/from_ayah) as a draft
  // placeholder. Rubric defaults start at 4. Previously-saved teacher
  // scores take precedence.
  useEffect(() => {
    setForms(prev => {
      const next = { ...prev };
      for (const r of entries) {
        if (next[r.evaluation_id]) continue;
        next[r.evaluation_id] = {
          toSurah: Number(r.to_surah ?? r.from_surah),
          toAyah:  Number(r.to_ayah  ?? r.from_ayah),
          mem: Number(r.memorization_score ?? 4),
          acc: Number(r.accuracy_score     ?? 4),
          flu: Number(r.fluency_score      ?? 4),
          taj: Number(r.tajweed_score      ?? 4),
          ret: Number(r.retention_score    ?? 4),
          comment: r.teacher_comment ?? '',
        };
      }
      return next;
    });
  }, [entries]);

  const openByNumber: Record<number, TeacherEvalWindow | undefined> = {
    1: windows.find(w => w.evaluation_number === 1),
    2: windows.find(w => w.evaluation_number === 2),
    3: windows.find(w => w.evaluation_number === 3),
  };

  const [picked, setPicked] = useState<1 | 2 | 3 | null>(null);
  useEffect(() => {
    if (picked !== null) return;
    const first = windows[0]?.evaluation_number;
    if (first === 1 || first === 2 || first === 3) setPicked(first);
  }, [windows, picked]);

  const pickedWindow = picked ? openByNumber[picked] : null;
  const pickedEntries = useMemo(() => {
    if (!picked) return [];
    return entries.filter(e => Number(e.evaluation_number) === picked);
  }, [entries, picked]);

  // "Moved" means teacher really advanced the student from the stored
  // starting position in the correct direction. Nas-to-Baqarah must
  // move backward (lower global ayah); Baqarah-to-Nas must move forward.
  function hasMoved(r: TeacherEvalEntry): boolean {
    const f = forms[r.evaluation_id]; if (!f) return false;
    const dir = r.memorization_direction;
    if (dir === 'baqarah_to_nas') return f.toSurah > r.from_surah || (f.toSurah === r.from_surah && f.toAyah > r.from_ayah);
    return f.toSurah < r.from_surah || (f.toSurah === r.from_surah && f.toAyah < r.from_ayah);
  }

  async function submitAll() {
    if (!pickedEntries.every(hasMoved)) {
      setMessage('Every student needs a valid stopping position — it must move from their starting position in the correct memorization direction.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      for (const r of pickedEntries) {
        const f = forms[r.evaluation_id];
        const score = Math.round(((f.mem + f.acc + f.flu + f.taj + f.ret) / 25) * 100);
        await submitTeacherEvaluation({ evaluationId: r.evaluation_id, toSurah: f.toSurah, toAyah: f.toAyah, memorization: f.mem, accuracy: f.acc, fluency: f.flu, tajweed: f.taj, retention: f.ret, score, comment: f.comment });
      }
      await refresh();
      setMessage(`Evaluation ${picked} submitted to Admin for review.`);
    } catch (e: any) { setMessage(e?.message || 'Submission failed.'); }
    finally { setBusy(false); }
  }

  function fmtCountdown(ms: number) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  return <AdminShell title="Evaluations">
    <div className="space-y-6">
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{message}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map(n => {
          const w = openByNumber[n];
          const isOpen = !!w;
          const isPicked = picked === n;
          return <button key={n} type="button" disabled={!isOpen}
            onClick={() => setPicked(n as 1 | 2 | 3)}
            className={`rounded-2xl p-5 text-left transition-colors ${isOpen ? (isPicked ? 'bg-emerald-700 text-white shadow-xl ring-2 ring-emerald-300' : 'bg-white hover:bg-emerald-50 ring-1 ring-emerald-200') : 'bg-slate-100 text-slate-400'}`}>
            <div className="flex items-center justify-between">
              <div className="text-lg font-black">Evaluation {n}</div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${isOpen ? (isPicked ? 'bg-white text-emerald-700' : 'bg-emerald-100 text-emerald-700') : 'bg-slate-200 text-slate-500'}`}>
                {isOpen ? 'OPEN' : 'CLOSED'}
              </span>
            </div>
            {isOpen && w && <div className="mt-3 space-y-1">
              <div className={`font-mono text-2xl font-black tabular-nums ${isPicked ? 'text-white' : 'text-emerald-700'}`}>
                {fmtCountdown(Math.max(0, new Date(w.closes_at).getTime() - now))}
              </div>
              <div className={`text-[11px] ${isPicked ? 'text-emerald-100' : 'text-slate-500'}`}>Closes {new Date(w.closes_at).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}</div>
              <div className={`text-xs font-bold ${isPicked ? 'text-emerald-100' : 'text-slate-600'}`}>{w.my_eval_count} student{w.my_eval_count === 1 ? '' : 's'} to evaluate</div>
            </div>}
            {!isOpen && <div className="mt-3 text-xs">Admin will open this when ready.</div>}
          </button>;
        })}
      </div>

      {!picked && <section className="card p-10 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-3xl">☾</div>
        <h3 className="mt-3 text-lg font-black text-slate-700">No evaluation is currently open</h3>
        <p className="mt-1 text-sm text-slate-500">When Admin opens Evaluation 1, 2, or 3, it will appear above with a countdown.</p>
      </section>}

      {picked && pickedWindow && pickedEntries.length === 0 && <section className="card border-2 border-amber-200 bg-amber-50 p-6">
        <h3 className="text-lg font-black text-amber-900">Evaluation {picked} is open — but no students are assigned to you yet</h3>
        <p className="mt-2 text-sm text-amber-900/80">Please contact Admin.</p>
      </section>}

      {picked && pickedWindow && pickedEntries.length > 0 && <section className="card overflow-hidden">
        <div className="flex flex-col gap-2 border-b bg-slate-50 p-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-black">Evaluation {picked} — enter scores</h2>
            <p className="mt-1 text-sm text-slate-500">Each student starts from the position they ended at last time. Enter where they stopped today and score the 5 rubrics (1 to 5).</p>
          </div>
          <button className="btn btn-primary" disabled={busy || pickedEntries.length === 0} onClick={submitAll}>
            {busy ? 'Submitting…' : `Submit all (${pickedEntries.length})`}
          </button>
        </div>

        <div className="divide-y">
          {pickedEntries.map((r, idx) => {
            const f = forms[r.evaluation_id];
            if (!f) return null;
            const start = { surah: Number(r.from_surah), ayah: Number(r.from_ayah) };
            const stop  = { surah: f.toSurah, ayah: f.toAyah };
            const dir   = r.memorization_direction === 'baqarah_to_nas' ? 'Baqarah-to-Nas' : 'Nas-to-Baqarah';
            const moved = hasMoved(r);
            const calc  = moved ? calculateEvaluation(start, stop, dir as any) : { memorizedAyahs: 0, memorizedPages: 0, memorizedHizbs: 0 };
            const score = Math.round(((f.mem + f.acc + f.flu + f.taj + f.ret) / 25) * 100);
            const startName = SURAHS.find(s => s.id === r.from_surah)?.name ?? '?';
            return <div key={r.evaluation_id} className="p-4">
              {/* Row header: who is being evaluated, their direction, and their locked starting position. */}
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-slate-200 text-xs font-black text-slate-500">#{idx + 1}</div>
                {r.photo_url
                  ? <img src={r.photo_url} alt="" className="h-10 w-10 rounded-xl object-cover" />
                  : <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-sm font-black text-emerald-800">{r.full_name?.charAt(0) ?? '?'}</div>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-slate-900">{r.full_name}</div>
                  <div className="truncate text-[11px] text-slate-500">{r.admission_no}{r.class_name ? ` · ${r.class_name}` : ''}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-1.5 text-right">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Starting position</div>
                  <div className="text-xs font-black text-slate-800">{startName} : {r.from_ayah}</div>
                  <div className="text-[10px] text-slate-500">{dir}</div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-[11px] font-bold uppercase text-slate-500">Stopping surah
                      <select className="input mt-1 w-full" value={f.toSurah} onChange={e => setForms(p => ({ ...p, [r.evaluation_id]: { ...f, toSurah: Number(e.target.value), toAyah: 1 } }))}>
                        {SURAHS.map(s => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
                      </select>
                    </label>
                    <label className="text-[11px] font-bold uppercase text-slate-500">Stopping ayah
                      <input type="number" min={1} max={SURAHS.find(s => s.id === f.toSurah)?.ayahs ?? 286} className="input mt-1 w-full" value={f.toAyah} onChange={e => setForms(p => ({ ...p, [r.evaluation_id]: { ...f, toAyah: Math.max(1, Number(e.target.value)) } }))} />
                    </label>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {([['mem', 'Mem'], ['acc', 'Acc'], ['flu', 'Flu'], ['taj', 'Taj'], ['ret', 'Ret']] as const).map(([k, lbl]) => (
                      <label key={k} className="text-center">
                        <div className="text-[10px] font-bold uppercase text-slate-500">{lbl}</div>
                        <select className="input mt-1 w-full text-sm" value={f[k]} onChange={e => setForms(p => ({ ...p, [r.evaluation_id]: { ...f, [k]: Number(e.target.value) } }))}>
                          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  <input type="text" placeholder="Comment (optional)" className="input w-full text-sm" value={f.comment} onChange={e => setForms(p => ({ ...p, [r.evaluation_id]: { ...f, comment: e.target.value } }))} />
                </div>
                <div className="lg:w-28 lg:shrink-0 text-right lg:text-center">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Score</div>
                  <div className={`mt-1 text-2xl font-black ${moved ? 'text-emerald-700' : 'text-slate-300'}`}>{moved ? `${score}%` : '—'}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{calc.memorizedAyahs} ayahs · {calc.memorizedPages} pages</div>
                  {!moved && <div className="mt-1 text-[10px] font-bold text-rose-600">Position not moved</div>}
                </div>
              </div>
            </div>;
          })}
        </div>

        <div className="flex justify-end border-t bg-slate-50 p-4">
          <button className="btn btn-primary" disabled={busy || pickedEntries.length === 0} onClick={submitAll}>
            {busy ? 'Submitting…' : `Submit all (${pickedEntries.length})`}
          </button>
        </div>
      </section>}

      <div className="text-center">
        <Link href="/teacher" className="text-xs font-bold text-slate-500 hover:text-slate-700">← Back to dashboard</Link>
      </div>
    </div>
  </AdminShell>;
}
