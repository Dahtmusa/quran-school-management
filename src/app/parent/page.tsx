'use client';
import AdminShell from '@/components/AdminShell';
import SectionBadge from '@/components/SectionBadge';
import MemorizationBadge from '@/components/MemorizationBadge';
import QuranProgress from '@/components/QuranProgress';
import { loadStudents, loadEvaluations, getCurrentProfile } from '@/lib/live-store';
import { Student } from '@/lib/data';
import { useEffect, useMemo, useState } from 'react';

export default function ParentPortal() {
  const [students, setStudents] = useState<Student[]>([]);
  const [evals, setEvals] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [expandedEval, setExpandedEval] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadStudents(), loadEvaluations(), getCurrentProfile()]).then(([s, e, profile]) => {
      setStudents(s); setEvals(e); setMe(profile);
      if (s.length > 0) setSelectedChild(s[0].id);
    });
  }, []);

  const child = useMemo(() => students.find(s => s.id === selectedChild) || students[0], [students, selectedChild]);
  const childEvals = useMemo(() => evals.filter(e => e.studentId === child?.id), [evals, child]);
  const approvedEvals = useMemo(() => childEvals.filter(e => e.status === 'Approved'), [childEvals]);
  const evalsByNumber = useMemo(() => {
    const map: Record<number, any> = {};
    for (const e of childEvals) {
      const n = Number(e.number) || 1;
      if (!map[n] || e.status === 'Approved') map[n] = e;
    }
    return map;
  }, [childEvals]);

  if (!child) return <AdminShell title="Parent Portal"><div className="card p-12 text-center text-slate-400">Loading your child's profile…</div></AdminShell>;

  const firstName = me?.full_name?.split(' ')[0] || 'Parent';

  const avg = approvedEvals.length ? approvedEvals.reduce((s, e) => s + e.score, 0) / approvedEvals.length : null;
  const finalStatus = avg == null ? null : avg >= 90 ? 'Excellent' : avg >= 75 ? 'Very Good' : avg >= 60 ? 'Satisfactory' : 'Needs Improvement';
  const statusColor = !avg ? '' : avg >= 90 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : avg >= 75 ? 'bg-blue-50 border-blue-200 text-blue-800' : avg >= 60 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-rose-50 border-rose-200 text-rose-800';

  return <AdminShell title="Parent Portal"><div className="space-y-5">

    {/* Welcome hero */}
    <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#062d2a] via-emerald-900 to-slate-900 p-5 text-white shadow-xl md:p-7">
      <div className="text-[11px] font-bold uppercase tracking-[.24em] text-amber-300">Parent Portal</div>
      <h2 className="mt-1 text-2xl font-black md:text-3xl">As-salāmu ʿalaykum, {firstName}.</h2>
      <p className="mt-1 text-sm text-emerald-100/70">Track your {students.length === 1 ? "child's" : "children's"} academic progress and Qur'an evaluations.</p>
    </section>

    {/* Child selector */}
    {students.length > 1 && <div className="flex flex-wrap gap-2">
      {students.map(s => <button key={s.id} onClick={() => setSelectedChild(s.id)} className={`rounded-2xl px-4 py-2.5 font-bold text-sm transition-colors ${selectedChild === s.id ? 'bg-[#062d2a] text-white shadow' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{s.name}</button>)}
    </div>}

    {/* Profile card */}
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-4 border-b bg-slate-50 p-5 sm:flex-row sm:items-start">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 border-white shadow bg-slate-200">
          {child.photoUrl ? <img src={child.photoUrl} className="h-full w-full object-cover" alt={child.name} /> : <div className="grid h-full place-items-center text-2xl font-black text-slate-400">{child.name.charAt(0)}</div>}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-black">{child.name}</h2>
          <div className="mt-1 flex flex-wrap gap-1.5"><SectionBadge section={child.section} /><MemorizationBadge direction={child.direction} /></div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
            <span><b className="text-slate-700">Admission:</b> {child.admissionNo?.toUpperCase()}</span>
            <span><b className="text-slate-700">Class:</b> {child.className || 'Unassigned'}</span>
            <span><b className="text-slate-700">Year:</b> {child.year}</span>
          </div>
        </div>
        <span className="pill bg-emerald-50 text-emerald-700 self-start shrink-0">Active</span>
      </div>
      <div className="p-5">
        <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">Qur'an Journey</div>
        <QuranProgress student={child} />
      </div>
    </div>

    {/* Evaluations this term */}
    <section className="card overflow-hidden">
      <div className="border-b p-5">
        <h2 className="text-lg font-black">This Term's Evaluations</h2>
        <p className="mt-0.5 text-xs text-slate-500">Evaluations are conducted by teachers and approved by school administration before they appear here.</p>
      </div>
      <div className="divide-y">
        {[1, 2, 3].map(num => {
          const ev = evalsByNumber[num];
          const status = ev?.status || 'Not started';
          const statusPill = status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : status === 'Pending Approval' ? 'bg-amber-50 text-amber-700' : status === 'Returned' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-400';
          const isOpen = expandedEval === `eval-${num}`;

          return <div key={num}>
            <button onClick={() => ev?.status === 'Approved' ? setExpandedEval(isOpen ? null : `eval-${num}`) : undefined} className={`flex w-full items-center gap-4 p-5 text-left transition-colors ${ev?.status === 'Approved' ? 'hover:bg-slate-50' : ''}`}>
              <div className={`h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center text-sm font-black ${status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : status === 'Pending Approval' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>{num}</div>
              <div className="flex-1">
                <div className="font-bold">Evaluation {num}</div>
                {ev && <div className="mt-0.5 text-xs text-slate-400">{ev.term}</div>}
              </div>
              <span className={`pill ${statusPill}`}>{status}</span>
              {ev?.status === 'Approved' && <span className="text-xs text-slate-400">{isOpen ? '▲' : '▼'}</span>}
            </button>

            {isOpen && ev?.status === 'Approved' && <div className="border-t bg-slate-50 p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatBox label="Score" value={`${ev.score}%`} color="emerald" />
                <StatBox label="Grade" value={ev.grade || '—'} color="blue" />
                <StatBox label="Ayahs" value={String(ev.memorizedAyahs || '—')} color="slate" />
                <StatBox label="Pages" value={String(ev.memorizedPages || '—')} color="slate" />
              </div>
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                {([['Mem', ev.memorization], ['Acc', ev.accuracy], ['Flu', ev.fluency], ['Taj', ev.tajweed], ['Ret', ev.retention]] as [string, number][]).map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-white border p-2">
                    <div className="text-slate-400 font-bold">{l}</div>
                    <div className="mt-1 text-lg font-black">{v}/5</div>
                  </div>
                ))}
              </div>
              {ev.comment && <div className="rounded-xl bg-white border p-4"><div className="mb-1 text-xs font-black uppercase text-slate-400">Teacher comment</div><p className="text-sm text-slate-600 leading-6">{ev.comment}</p></div>}
            </div>}
          </div>;
        })}
      </div>
    </section>

    {/* Final standing */}
    {finalStatus && avg != null && <div className={`rounded-2xl border p-5 ${statusColor}`}>
      <div className="mb-1 text-xs font-black uppercase tracking-wider">Current standing — {approvedEvals.length} of 3 evaluations</div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-3xl font-black">{finalStatus}</div>
        <div className="text-sm opacity-70">Average: {avg.toFixed(1)}%</div>
      </div>
    </div>}

    {/* View report card link */}
    <div className="card flex items-center justify-between gap-4 p-5">
      <div>
        <div className="font-bold">Report Card</div>
        <div className="text-xs text-slate-500 mt-0.5">Full term report with Qur'an progress, scores, and school remarks.</div>
      </div>
      <a href="/reports" className="btn btn-primary shrink-0 text-sm">View report →</a>
    </div>

    {/* Contact note */}
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500 leading-6">
      <b className="text-slate-700">For fees, attendance records, and other queries</b> — please contact the school administration directly. Sensitive records are managed by the school office.
    </div>
  </div></AdminShell>;
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  const bg = color === 'emerald' ? 'bg-emerald-50 border-emerald-100' : color === 'blue' ? 'bg-blue-50 border-blue-100' : 'bg-white border-slate-200';
  const text = color === 'emerald' ? 'text-emerald-800' : color === 'blue' ? 'text-blue-800' : 'text-slate-700';
  return <div className={`rounded-xl border p-3 ${bg}`}><div className="text-xs text-slate-400">{label}</div><div className={`mt-1 text-xl font-black ${text}`}>{value}</div></div>;
}
