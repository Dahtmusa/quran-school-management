'use client';
// Admin Alumni management: Potential queue + Confirmed list + full dossier
// + certificate printing + publication toggle.
import AdminShell from '@/components/AdminShell';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadPotentialAlumni, loadAlumniList, loadAlumniFull,
  promoteToAlumni, toggleAlumniPublication,
  adminSendEvaluationBack, adminCorrectQuranRecord,
} from '@/lib/live-store';
import CertificateModal from './CertificateModal';
import { SURAHS } from '@/lib/quran';

type FixForm = {
  direction: 'nas_to_baqarah' | 'baqarah_to_nas';
  startSurah: number; startAyah: number;
  currentSurah: number; currentAyah: number;
  fixEval: boolean;
  evalFromSurah: number; evalFromAyah: number; evalToSurah: number; evalToAyah: number;
  reason: string;
};

function PositionInput({ label, surah, ayah, onChange }: { label: string; surah: number; ayah: number; onChange: (s: number, a: number) => void }) {
  const max = SURAHS.find(s => s.id === surah)?.ayahs ?? 286;
  return (
    <label className="block text-xs font-bold text-slate-700">{label}
      <div className="mt-1 grid grid-cols-[1fr_90px] gap-2">
        <select className="input w-full" value={surah} onChange={e => onChange(Number(e.target.value), 1)}>
          {SURAHS.map(s => <option key={s.id} value={s.id}>{s.id}. {s.name}</option>)}
        </select>
        <input type="number" min={1} max={max} className="input w-full" value={ayah}
          onChange={e => onChange(surah, Math.min(max, Math.max(1, Number(e.target.value) || 1)))} />
      </div>
    </label>
  );
}

type Potential = {
  student_id: string; full_name: string; admission_no: string; photo_url: string | null;
  class_name: string | null; teacher_name: string | null; memorization_direction: string;
  current_surah: number; current_ayah: number; progress_percent: number; status: string;
  outstanding_fees: number; evaluations_count: number; already_promoted: boolean;
  last_evaluation: string | null; issues: string[] | null; ready: boolean;
  start_surah: number; start_ayah: number;
  last_evaluation_id: string | null; last_from_surah: number | null; last_from_ayah: number | null;
  last_to_surah: number | null; last_to_ayah: number | null;
};
type Confirmed = {
  alumni_id: string; student_id: string; full_name: string; graduation_year: number;
  cohort_name: string; graduation_term: string; final_quran_position: string | null;
  profile_photo_url: string | null; published: boolean; published_on_homepage: boolean;
  outstanding_fees: number; certificate_number: string | null;
  class_at_graduation: string | null; teacher_at_graduation: string | null;
};
const naira = (n: number) => '₦' + Number(n || 0).toLocaleString('en-NG');

export default function AdminAlumniPage() {
  const [tab, setTab] = useState<'potential' | 'confirmed'>('potential');
  const [potential, setPotential] = useState<Potential[]>([]);
  const [confirmed, setConfirmed] = useState<Confirmed[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [promote, setPromote] = useState<Potential | null>(null);
  const [promoteYear, setPromoteYear] = useState(new Date().getFullYear());
  const [promoteCohort, setPromoteCohort] = useState('');
  const [promoteTerm, setPromoteTerm] = useState('Term 3');
  const [promoteIssueCert, setPromoteIssueCert] = useState(true);
  const [dossier, setDossier] = useState<any>(null);
  const [sendBack, setSendBack] = useState<Potential | null>(null);
  const [sendBackNote, setSendBackNote] = useState('');
  const [fixing, setFixing] = useState<Potential | null>(null);
  const [fix, setFix] = useState<FixForm | null>(null);

  function openFix(p: Potential) {
    setFixing(p);
    setFix({
      direction: p.memorization_direction === 'baqarah_to_nas' ? 'baqarah_to_nas' : 'nas_to_baqarah',
      startSurah: p.start_surah, startAyah: p.start_ayah,
      currentSurah: p.last_to_surah ?? p.current_surah, currentAyah: p.last_to_ayah ?? p.current_ayah,
      fixEval: !!p.last_evaluation_id,
      evalFromSurah: p.last_from_surah ?? p.current_surah, evalFromAyah: p.last_from_ayah ?? p.current_ayah,
      evalToSurah: p.last_to_surah ?? p.current_surah, evalToAyah: p.last_to_ayah ?? p.current_ayah,
      reason: '',
    });
  }

  async function doSendBack() {
    if (!sendBack?.last_evaluation_id) return;
    setBusy(true); setMessage('');
    try {
      const r = await adminSendEvaluationBack(sendBack.last_evaluation_id, sendBackNote);
      setMessage(`${sendBack.full_name}'s evaluation was sent back to ${r.teacher_name}. Their position is back at ${r.student_position} until the teacher resubmits and you approve it.`);
      setSendBack(null);
      await refresh();
    } catch (e: any) { setMessage(e?.message || 'Could not send it back.'); }
    finally { setBusy(false); }
  }

  async function doFix() {
    if (!fixing || !fix) return;
    setBusy(true); setMessage('');
    try {
      const r = await adminCorrectQuranRecord({
        studentId: fixing.student_id, direction: fix.direction,
        startSurah: fix.startSurah, startAyah: fix.startAyah,
        currentSurah: fix.currentSurah, currentAyah: fix.currentAyah,
        reason: fix.reason,
        evaluationId: fix.fixEval ? fixing.last_evaluation_id : null,
        evalFromSurah: fix.evalFromSurah, evalFromAyah: fix.evalFromAyah,
        evalToSurah: fix.evalToSurah, evalToAyah: fix.evalToAyah,
      });
      setMessage(`${fixing.full_name}'s record was corrected. Current position is now ${r.current}.`);
      setFixing(null); setFix(null);
      await refresh();
    } catch (e: any) { setMessage(e?.message || 'Correction failed.'); }
    finally { setBusy(false); }
  }
  const [certPrint, setCertPrint] = useState<any>(null); // full dossier object

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([loadPotentialAlumni(), loadAlumniList()]);
      setPotential(p as Potential[]);
      setConfirmed(c as Confirmed[]);
    } catch (e: any) {
      setMessage(e?.message || 'Failed to load alumni data');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const filteredPotential = useMemo(() => {
    const q = search.trim().toLowerCase();
    return potential.filter(p => !q || `${p.full_name} ${p.admission_no}`.toLowerCase().includes(q));
  }, [potential, search]);
  const filteredConfirmed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return confirmed.filter(c => !q || `${c.full_name} ${c.cohort_name} ${c.certificate_number ?? ''}`.toLowerCase().includes(q));
  }, [confirmed, search]);

  async function doPromote() {
    if (!promote) return;
    if (!promoteCohort.trim()) { setMessage('Please enter the cohort name.'); return; }
    setBusy(true); setMessage('');
    try {
      await promoteToAlumni({
        studentId: promote.student_id,
        graduationYear: promoteYear,
        cohortName: promoteCohort.trim(),
        graduationTerm: promoteTerm.trim(),
        issueCertificate: promoteIssueCert,
      });
      setPromote(null);
      setPromoteCohort('');
      setMessage('Student promoted to alumni.');
      await refresh();
      setTab('confirmed');
    } catch (e: any) {
      setMessage(e?.message || 'Promotion failed.');
    } finally { setBusy(false); }
  }

  async function togglePub(a: Confirmed, field: 'published' | 'homepage', value: boolean) {
    setBusy(true);
    try {
      await toggleAlumniPublication(
        a.alumni_id,
        field === 'published' ? value : a.published,
        field === 'homepage' ? value : a.published_on_homepage,
      );
      await refresh();
    } catch (e: any) { setMessage(e?.message || 'Toggle failed'); }
    finally { setBusy(false); }
  }

  async function openDossier(a: Confirmed) {
    setBusy(true);
    try {
      const data = await loadAlumniFull(a.alumni_id);
      setDossier(data);
    } catch (e: any) { setMessage(e?.message || 'Could not load dossier'); }
    finally { setBusy(false); }
  }

  return <AdminShell title="Alumni Management"><div className="space-y-5">
    <section className="rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-amber-700 p-6 text-white">
      <div className="text-[11px] font-black uppercase tracking-[.22em] text-amber-300">AMQM · Graduates & Certificates</div>
      <h1 className="mt-2 text-3xl font-black">Alumni Management</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">
        Review students who have completed memorization, promote them to alumni with cohort details, issue their certificate, and publish selected profiles to the public website.
      </p>
    </section>

    {message && <div className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div>}

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2">
        <button onClick={() => setTab('potential')}
          className={`rounded-full px-4 py-2 text-sm font-black ${tab === 'potential' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
          Potential alumni ({potential.length})
        </button>
        <button onClick={() => setTab('confirmed')}
          className={`rounded-full px-4 py-2 text-sm font-black ${tab === 'confirmed' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
          Confirmed ({confirmed.length})
        </button>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search name, admission no or cert number..."
        className="rounded-xl border px-3 py-2 text-sm sm:w-72" />
    </div>

    {loading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400">Loading…</div>}

    {!loading && tab === 'potential' && <section className="card overflow-hidden">
      <div className="border-b bg-slate-50 p-5">
        <h3 className="text-lg font-black">Students ready to graduate</h3>
        <p className="text-xs text-slate-500 mt-1">A student is <b>ready</b> only when their latest approved evaluation ends on the final verse for their direction and their records agree. Rows marked <b>Needs review</b> show what doesn&apos;t add up: correct the evaluation or position first.</p>
      </div>
      {filteredPotential.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-400">No potential alumni right now. When a teacher's evaluation closes a student's memorization journey, they will appear here.</div>
      ) : (
        <div className="divide-y">
          {filteredPotential.map(p => (
            <div key={p.student_id} className={`flex flex-wrap items-center gap-4 p-5 ${p.ready ? '' : 'bg-rose-50/40'}`}>
              <div className="h-14 w-14 overflow-hidden rounded-2xl bg-slate-100">
                {p.photo_url ? <img src={p.photo_url} alt={p.full_name} className="h-full w-full object-cover" />
                : <div className="grid h-full place-items-center text-xl font-black text-slate-300">{p.full_name.charAt(0)}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-black">{p.full_name}</div>
                <div className="text-xs text-slate-500">{p.admission_no} · {p.class_name || 'No class'} · Teacher: {p.teacher_name || '—'}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 font-black ${p.ready ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>{p.ready ? '✓ Ready' : 'Needs review'}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">Position {p.current_surah}:{p.current_ayah}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">Last approved eval: {p.last_evaluation || 'none'}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">{p.evaluations_count} evals</span>
                  {p.outstanding_fees > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-700">{naira(p.outstanding_fees)} fees due</span>}
                  <span className={`rounded-full px-2 py-0.5 font-bold ${p.status === 'alumni' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-700'}`}>{p.status}</span>
                </div>
                {!p.ready && (p.issues?.length ?? 0) > 0 && (
                  <ul className="mt-2 space-y-0.5 text-[11.5px] font-semibold text-rose-800">
                    {p.issues!.map(issue => <li key={issue}>• {issue}</li>)}
                  </ul>
                )}
              </div>
              {p.ready ? (
                <button className="btn btn-primary" disabled={busy} onClick={() => { setPromote(p); setPromoteCohort(''); setPromoteYear(new Date().getFullYear()); }}>
                  Promote to alumni
                </button>
              ) : (
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex flex-wrap justify-end gap-2">
                    {p.last_evaluation_id && (
                      <button className="btn bg-amber-100 text-amber-900 text-sm py-1.5" disabled={busy}
                        onClick={() => { setSendBack(p); setSendBackNote(`Please check this evaluation and enter the correct stopping position.\n\nWhat looks wrong:\n${(p.issues || []).map(i => '• ' + i).join('\n')}`); }}>
                        Send back to teacher
                      </button>
                    )}
                    <button className="btn bg-emerald-900 text-white text-sm py-1.5" disabled={busy} onClick={() => openFix(p)}>
                      Fix directly
                    </button>
                  </div>
                  <button className="text-[11px] font-bold text-rose-700 underline" disabled={busy}
                    onClick={() => { if (!window.confirm(`${p.full_name}'s records don't confirm they finished:\n\n${(p.issues || []).join('\n')}\n\nPromote anyway? This creates a certificate.`)) return; setPromote(p); setPromoteCohort(''); setPromoteYear(new Date().getFullYear()); }}>
                    I&apos;ve verified it, promote anyway
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>}

    {!loading && tab === 'confirmed' && <section className="card overflow-hidden">
      <div className="border-b bg-slate-50 p-5">
        <h3 className="text-lg font-black">Confirmed alumni</h3>
        <p className="text-xs text-slate-500 mt-1">Full academic record preserved. Toggle publication to show them on the public /alumni page or the homepage card strip.</p>
      </div>
      {filteredConfirmed.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-400">No alumni yet.</div>
      ) : (
        <div className="divide-y">
          {filteredConfirmed.map(a => (
            <div key={a.alumni_id} className="flex flex-wrap items-center gap-4 p-5">
              <div className="h-14 w-14 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 to-amber-500">
                {a.profile_photo_url ? <img src={a.profile_photo_url} alt={a.full_name} className="h-full w-full object-cover" />
                : <div className="grid h-full place-items-center text-xl font-black text-white">{a.full_name.charAt(0)}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-black">{a.full_name}</div>
                <div className="text-xs text-slate-500">{a.cohort_name} · {a.graduation_term} · Year {a.graduation_year}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                  {a.certificate_number && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-bold text-amber-800">{a.certificate_number}</span>}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">{a.class_at_graduation || '—'}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">Teacher: {a.teacher_at_graduation || '—'}</span>
                  {a.outstanding_fees > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-700">{naira(a.outstanding_fees)} unpaid</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700"><input type="checkbox" checked={a.published} onChange={e => togglePub(a, 'published', e.target.checked)} /> Public</label>
                <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700"><input type="checkbox" checked={a.published_on_homepage} disabled={!a.published} onChange={e => togglePub(a, 'homepage', e.target.checked)} /> Homepage</label>
                <button className="btn bg-slate-100 text-sm py-1.5" onClick={() => openDossier(a)}>Full dossier</button>
                <button className="btn bg-amber-100 text-amber-900 text-sm py-1.5" onClick={async () => { setBusy(true); try { const d = await loadAlumniFull(a.alumni_id); setCertPrint(d); } catch(e:any){setMessage(e?.message||'Could not open');} finally { setBusy(false); } }}>Certificate</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>}

    {/* Send back to teacher */}
    {sendBack && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4"><div className="mx-auto mt-12 w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
      <h2 className="text-xl font-black text-amber-900">Send back to teacher</h2>
      <p className="mt-1 text-sm text-slate-600">{sendBack.full_name} · {sendBack.admission_no} · Teacher: {sendBack.teacher_name || '—'}</p>
      <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">
        The evaluation <b>{sendBack.last_evaluation}</b> goes back to the teacher&apos;s Evaluations page as <b>Returned</b>, with your note.
        Until they resubmit and you approve it, {sendBack.full_name}&apos;s position goes back to <b>{sendBack.last_from_surah}:{sendBack.last_from_ayah}</b>, where it was before this evaluation.
        The teacher can change the stopping position. If the <b>starting</b> position or the <b>direction</b> is wrong, use Fix directly instead.
      </div>
      <label className="mt-4 block text-xs font-bold text-slate-700">Note to the teacher
        <textarea className="input mt-1 w-full text-sm" rows={6} value={sendBackNote} onChange={e => setSendBackNote(e.target.value)} />
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn bg-slate-100" onClick={() => setSendBack(null)}>Cancel</button>
        <button className="btn bg-amber-600 text-white font-black" disabled={busy || !sendBackNote.trim()} onClick={doSendBack}>{busy ? 'Sending…' : 'Send back'}</button>
      </div>
    </div></div>}

    {/* Fix directly */}
    {fixing && fix && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4"><div className="mx-auto mt-8 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
      <h2 className="text-xl font-black text-emerald-900">Fix Qur&apos;an record</h2>
      <p className="mt-1 text-sm text-slate-600">{fixing.full_name} · {fixing.admission_no} · Teacher: {fixing.teacher_name || '—'}</p>
      {(fixing.issues?.length ?? 0) > 0 && (
        <ul className="mt-3 space-y-0.5 rounded-2xl bg-rose-50 p-3 text-[12px] font-semibold text-rose-800">
          {fixing.issues!.map(i => <li key={i}>• {i}</li>)}
        </ul>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-xs font-bold text-slate-700">Memorization direction
          <select className="input mt-1 w-full" value={fix.direction} onChange={e => setFix({ ...fix, direction: e.target.value as FixForm['direction'] })}>
            <option value="nas_to_baqarah">Nas → Baqarah (starts at An-Nās, ends at 1:1)</option>
            <option value="baqarah_to_nas">Baqarah → Nas (starts at Al-Baqarah, ends at 114:6)</option>
          </select>
        </label>
        <PositionInput label="Started memorizing at" surah={fix.startSurah} ayah={fix.startAyah} onChange={(s, a) => setFix({ ...fix, startSurah: s, startAyah: a })} />
      </div>

      {fixing.last_evaluation_id && (
        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
          <label className="flex items-center gap-2 text-sm font-black text-slate-800">
            <input type="checkbox" checked={fix.fixEval} onChange={e => setFix({ ...fix, fixEval: e.target.checked })} />
            Also correct the last approved evaluation ({fixing.last_evaluation})
          </label>
          {fix.fixEval && <div className="mt-3 grid gap-4 md:grid-cols-2">
            <PositionInput label="Evaluation started at" surah={fix.evalFromSurah} ayah={fix.evalFromAyah} onChange={(s, a) => setFix({ ...fix, evalFromSurah: s, evalFromAyah: a })} />
            <PositionInput label="Evaluation stopped at" surah={fix.evalToSurah} ayah={fix.evalToAyah}
              onChange={(s, a) => setFix({ ...fix, evalToSurah: s, evalToAyah: a, currentSurah: s, currentAyah: a })} />
          </div>}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <PositionInput label="Current position (where the student is now)" surah={fix.currentSurah} ayah={fix.currentAyah} onChange={(s, a) => setFix({ ...fix, currentSurah: s, currentAyah: a })} />
        <label className="block text-xs font-bold text-slate-700">Reason (kept in the audit log)
          <input className="input mt-1 w-full" value={fix.reason} placeholder="e.g. Confirmed with teacher; stop was mistyped" onChange={e => setFix({ ...fix, reason: e.target.value })} />
        </label>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">The current position usually equals where the last evaluation stopped. The score and grade of a corrected evaluation are recalculated, and any open draft evaluation moves to start from the new current position.</p>

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn bg-slate-100" onClick={() => { setFixing(null); setFix(null); }}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !fix.reason.trim()} onClick={doFix}>{busy ? 'Saving…' : 'Save correction'}</button>
      </div>
    </div></div>}

    {/* Promote modal */}
    {promote && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4"><div className="mx-auto mt-12 w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
      <div className="mb-3">
        <h2 className="text-xl font-black text-emerald-900">Promote to alumni</h2>
        <p className="mt-1 text-sm text-slate-600">{promote.full_name} · {promote.admission_no}</p>
      </div>
      <div className="rounded-2xl bg-emerald-50 p-4 text-xs leading-5 text-emerald-900">
        <b>This locks in a graduate record.</b> The student becomes an alumni, their academic data is preserved, and (if issued) a certificate is created with a unique number. You can publish them to the public site after review.
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-xs font-bold">Graduation year
          <input type="number" min="2020" max="2100" className="input mt-1 w-full" value={promoteYear} onChange={e => setPromoteYear(Number(e.target.value))} />
        </label>
        <label className="text-xs font-bold">Final term
          <input className="input mt-1 w-full" value={promoteTerm} onChange={e => setPromoteTerm(e.target.value)} placeholder="e.g. Term 3" />
        </label>
        <label className="col-span-2 text-xs font-bold">Cohort name <span className="text-rose-600">*</span>
          <input className="input mt-1 w-full" value={promoteCohort} onChange={e => setPromoteCohort(e.target.value)} placeholder="e.g. Cohort 2025 or Al-Aqsa Cohort" />
        </label>
        <label className="col-span-2 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs font-bold">
          <input type="checkbox" checked={promoteIssueCert} onChange={e => setPromoteIssueCert(e.target.checked)} />
          Issue graduation certificate immediately (recommended)
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn bg-slate-100" onClick={() => setPromote(null)}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !promoteCohort.trim()} onClick={doPromote}>
          {busy ? 'Promoting…' : 'Confirm promotion'}
        </button>
      </div>
    </div></div>}

    {/* Dossier modal */}
    {dossier && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4"><div className="mx-auto mt-8 w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-black">{dossier.alumni?.full_name}</h2>
          <p className="text-sm text-slate-500">Graduation record and preserved history</p>
        </div>
        <button className="btn bg-slate-100" onClick={() => setDossier(null)}>Close</button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-emerald-50 p-4">
          <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Cohort / term</div>
          <div className="mt-1 text-lg font-black text-emerald-950">{dossier.alumni?.cohort_name} · {dossier.alumni?.graduation_term}</div>
          <div className="mt-1 text-xs text-emerald-900">Year {dossier.alumni?.graduation_year}</div>
          <div className="mt-3 text-[10px] font-black uppercase tracking-wide text-emerald-700">Final position</div>
          <div className="mt-1 text-sm font-bold text-emerald-950">{dossier.alumni?.final_quran_position}</div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Class at graduation</div>
          <div className="mt-1 text-sm font-black">{dossier.class?.name || '—'}</div>
          <div className="mt-3 text-[10px] font-black uppercase tracking-wide text-slate-500">Teacher</div>
          <div className="mt-1 text-sm font-bold">{dossier.teacher?.full_name || '—'}</div>
          {dossier.teacher?.phone && <div className="text-xs text-slate-500">{dossier.teacher.phone}</div>}
        </div>
        <div className={`rounded-2xl p-4 ${dossier.fees?.outstanding > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
          <div className="text-[10px] font-black uppercase tracking-wide">Fees</div>
          <div className="mt-1 text-sm">Due: <b>{naira(dossier.fees?.total_due || 0)}</b></div>
          <div className="text-sm">Paid: <b>{naira(dossier.fees?.total_paid || 0)}</b></div>
          <div className="mt-1 text-base font-black">Outstanding: {naira(dossier.fees?.outstanding || 0)}</div>
        </div>
      </div>

      {Array.isArray(dossier.certificates) && dossier.certificates.length > 0 && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="text-xs font-black uppercase tracking-wide text-amber-900">Certificates issued</div>
        {dossier.certificates.map((c: any) => (
          <div key={c.id} className="mt-2 flex items-center justify-between rounded-xl bg-white p-3">
            <div>
              <div className="font-black">{c.certificate_number}</div>
              <div className="text-xs text-slate-500">{c.programme_name} · issued {c.issued_at}</div>
            </div>
            <span className={`pill ${c.status === 'issued' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>{c.status}</span>
          </div>
        ))}
      </div>}

      {Array.isArray(dossier.evaluations) && dossier.evaluations.length > 0 && <div className="mt-5">
        <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Evaluation history ({dossier.evaluations.length})</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr><th className="p-2">Term</th><th className="p-2">Eval</th><th className="p-2">From</th><th className="p-2">To</th><th className="p-2">Status</th><th className="p-2">Approved</th></tr>
            </thead>
            <tbody>
              {dossier.evaluations.map((e: any) => (
                <tr key={e.id} className="border-t">
                  <td className="p-2">{e.term}</td>
                  <td className="p-2">#{e.evaluation_number}</td>
                  <td className="p-2">S.{e.from_surah}:{e.from_ayah}</td>
                  <td className="p-2">{e.to_surah ? `S.${e.to_surah}:${e.to_ayah}` : '—'}</td>
                  <td className="p-2"><span className={`pill text-[9px] ${e.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{e.status}</span></td>
                  <td className="p-2">{e.approved_at ? new Date(e.approved_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}
    </div></div>}

    {/* Certificate print modal - Design A emerald + gold */}
    {certPrint && <CertificateModal data={certPrint} close={() => setCertPrint(null)} />}

  </div></AdminShell>;
}
