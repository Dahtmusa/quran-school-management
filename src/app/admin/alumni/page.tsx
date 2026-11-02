'use client';
// Admin Alumni management: Potential queue + Confirmed list + full dossier
// + certificate printing + publication toggle.
import AdminShell from '@/components/AdminShell';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  loadPotentialAlumni, loadAlumniList, loadAlumniFull,
  promoteToAlumni, toggleAlumniPublication,
} from '@/lib/live-store';

type Potential = {
  student_id: string; full_name: string; admission_no: string; photo_url: string | null;
  class_name: string | null; teacher_name: string | null; memorization_direction: string;
  current_surah: number; current_ayah: number; progress_percent: number; status: string;
  outstanding_fees: number; evaluations_count: number; already_promoted: boolean;
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
        <p className="text-xs text-slate-500 mt-1">Each row either reached 100% memorization or was already marked alumni but has no formal profile yet. Review, enter cohort details, and promote.</p>
      </div>
      {filteredPotential.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-400">No potential alumni right now. When a teacher's evaluation closes a student's memorization journey, they will appear here.</div>
      ) : (
        <div className="divide-y">
          {filteredPotential.map(p => (
            <div key={p.student_id} className="flex flex-wrap items-center gap-4 p-5">
              <div className="h-14 w-14 overflow-hidden rounded-2xl bg-slate-100">
                {p.photo_url ? <img src={p.photo_url} alt={p.full_name} className="h-full w-full object-cover" />
                : <div className="grid h-full place-items-center text-xl font-black text-slate-300">{p.full_name.charAt(0)}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-black">{p.full_name}</div>
                <div className="text-xs text-slate-500">{p.admission_no} · {p.class_name || 'No class'} · Teacher: {p.teacher_name || '—'}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700">{Math.round(p.progress_percent)}% memorized</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">S.{p.current_surah}:{p.current_ayah}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">{p.evaluations_count} evals</span>
                  {p.outstanding_fees > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-bold text-rose-700">{naira(p.outstanding_fees)} fees due</span>}
                  <span className={`rounded-full px-2 py-0.5 font-bold ${p.status === 'alumni' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-700'}`}>{p.status}</span>
                </div>
              </div>
              <button className="btn btn-primary" disabled={busy} onClick={() => { setPromote(p); setPromoteCohort(''); setPromoteYear(new Date().getFullYear()); }}>
                Promote to alumni
              </button>
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

function CertificateModal({ data, close }: { data: any; close: () => void }) {
  const a = data.alumni || {};
  const cert = (data.certificates || [])[0] || {};
  const teacher = data.teacher || {};
  const principal = data.principal || {};
  const director = data.director || {};
  const classAtGrad = data.class?.name || '—';

  function doPrint() {
    const html = document.getElementById('cert-design-a')?.outerHTML || '';
    const style = `
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 0; font-family: 'Georgia', 'Times New Roman', serif; }
      .cert-sheet { page-break-after: avoid; }
    `;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Certificate · ${a.full_name || ''}</title><style>${style}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  const Sig = ({ person, role }: { person: any; role: string }) => (
    <div className="flex flex-col items-center text-center">
      <div className="relative flex h-16 w-56 items-end justify-center">
        {person?.signature_data ? (
          <img src={person.signature_data} alt="signature" className="max-h-full max-w-full object-contain" style={{filter:'drop-shadow(0 1px 0 rgba(0,0,0,.08))'}} />
        ) : (
          <div className="h-[1px] w-full bg-emerald-950/50" />
        )}
      </div>
      <div className="mt-1 h-[1px] w-56 bg-emerald-950/60" />
      <div className="mt-1 text-[11px] font-black tracking-wide text-emerald-950">{person?.full_name || '—'}</div>
      <div className="text-[10px] font-bold text-emerald-900/80">{role}</div>
    </div>
  );

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-4">
    <div className="mx-auto mt-4 w-full max-w-6xl rounded-3xl bg-white p-5 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-black text-emerald-900">Certificate preview · {a.full_name}</h2>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={doPrint}>Print / Save as PDF</button>
          <button className="btn bg-slate-100" onClick={close}>Close</button>
        </div>
      </div>

      {/* The sheet — fills A4 landscape when printed */}
      <div id="cert-design-a" className="cert-sheet relative mx-auto overflow-hidden"
           style={{ width: '297mm', height: '210mm', background: '#fdf9ef' }}>
        {/* Outer emerald frame with gold inner trim */}
        <div className="absolute inset-0" style={{
          padding: '10mm',
          background: 'linear-gradient(135deg,#063b32 0%,#0b5a4a 40%,#0a5a4a 60%,#063b32 100%)',
        }}>
          <div className="h-full w-full relative" style={{
            border: '2px solid #d4a24a',
            background: 'repeating-linear-gradient(45deg, rgba(212,162,74,.07) 0 2px, transparent 2px 10px), linear-gradient(180deg,#fdf9ef 0,#fff8e4 100%)',
            padding: '12mm 18mm',
          }}>
            {/* Decorative gold corners */}
            <div className="pointer-events-none absolute left-2 top-2 h-10 w-10 border-l-2 border-t-2" style={{borderColor:'#d4a24a'}} />
            <div className="pointer-events-none absolute right-2 top-2 h-10 w-10 border-r-2 border-t-2" style={{borderColor:'#d4a24a'}} />
            <div className="pointer-events-none absolute left-2 bottom-2 h-10 w-10 border-l-2 border-b-2" style={{borderColor:'#d4a24a'}} />
            <div className="pointer-events-none absolute right-2 bottom-2 h-10 w-10 border-r-2 border-b-2" style={{borderColor:'#d4a24a'}} />

            {/* Header */}
            <div className="text-center">
              <div className="mx-auto mb-2 h-[6mm] w-[6mm] rounded-full" style={{background:'radial-gradient(circle at 30% 30%,#f5d989 0%,#b78325 70%,#8c5a0a 100%)'}} />
              <div style={{letterSpacing:'.3em'}} className="text-[11px] font-black text-emerald-900">
                ALIYU AND MAIMUNA CENTER FOR QUR&apos;ANIC MEMORIZATION
              </div>
              <div className="mt-[3mm] font-serif text-[32px] font-black" style={{color:'#063b32'}}>
                Qur&apos;anic Graduation
              </div>
              <div className="font-serif italic text-[46px] font-black" style={{color:'#b78325', lineHeight:1}}>
                Certificate
              </div>
            </div>

            {/* Ribbon */}
            <div className="mt-[6mm] flex justify-center">
              <div className="relative px-6 py-2 text-center text-[11px] font-black tracking-wide text-white"
                   style={{background:'linear-gradient(90deg,#b78325 0%,#d4a24a 50%,#b78325 100%)'}}>
                This certifies that
              </div>
            </div>

            {/* Name */}
            <div className="mt-[4mm] text-center font-serif text-[42px] font-black" style={{color:'#063b32', letterSpacing:'.5px'}}>
              {a.full_name}
            </div>
            <div className="mx-auto mt-[2mm] h-[1px] w-[70%]" style={{background:'linear-gradient(90deg,transparent 0%,#b78325 50%,transparent 100%)'}} />

            {/* Body */}
            <p className="mx-auto mt-[4mm] max-w-[200mm] text-center text-[12px] leading-6" style={{color:'#1f2937'}}>
              has successfully completed the Qur&apos;an Memorization Journey at AMQM and is honoured as a graduate of the <b>{a.cohort_name}</b> cohort,
              verified and approved as a <b>Hafiz / Huffaz of the Qur&apos;an</b> by the school management.
            </p>

            {/* Info row */}
            <div className="mx-auto mt-[6mm] grid max-w-[220mm] grid-cols-4 gap-3 text-center text-[11px]">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest" style={{color:'#b78325'}}>Cohort</div>
                <div className="mt-0.5 font-black text-emerald-950">{a.cohort_name}</div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest" style={{color:'#b78325'}}>Final Term</div>
                <div className="mt-0.5 font-black text-emerald-950">{a.graduation_term}</div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest" style={{color:'#b78325'}}>Class</div>
                <div className="mt-0.5 font-black text-emerald-950">{classAtGrad}</div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest" style={{color:'#b78325'}}>Certificate No.</div>
                <div className="mt-0.5 font-black text-emerald-950">{cert.certificate_number || '—'}</div>
              </div>
            </div>

            {/* Medallion */}
            <div className="mt-[6mm] flex justify-center">
              <div className="flex h-[18mm] w-[18mm] items-center justify-center rounded-full"
                   style={{background:'radial-gradient(circle at 30% 30%,#f3cf74 0%,#b78325 70%,#6b4a10 100%)', boxShadow:'0 0 0 3px #063b32'}}>
                <div className="text-center text-[9px] font-black text-emerald-950" style={{textShadow:'0 1px 0 rgba(255,255,255,.4)'}}>
                  AMQM<br/>HAFIZ
                </div>
              </div>
            </div>

            {/* Signatures - three */}
            <div className="absolute left-0 right-0" style={{bottom: '15mm'}}>
              <div className="mx-auto grid max-w-[240mm] grid-cols-3 gap-6 px-[18mm]">
                <Sig person={teacher} role={`Class Teacher${teacher?.full_name ? ' · ' + (classAtGrad) : ''}`} />
                <Sig person={principal} role="Principal" />
                <Sig person={director} role="Director" />
              </div>
            </div>

            <div className="absolute bottom-[6mm] left-0 right-0 text-center text-[9px] font-bold" style={{color:'#063b32', opacity:.7}}>
              Issued on {cert.issued_at || new Date().toLocaleDateString()} · {cert.certificate_number || 'Draft'}
            </div>
          </div>
        </div>
      </div>

      {/* Warnings for missing signatures */}
      <div className="mt-3 space-y-1 text-xs">
        {!teacher?.signature_data && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Class teacher {teacher?.full_name || ''} has not uploaded a signature yet. Signature line shown instead.</div>}
        {!principal?.signature_data && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Principal {principal?.full_name || ''} has not uploaded a signature yet. Signature line shown instead.</div>}
        {!director?.signature_data && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Director {director?.full_name || ''} has not uploaded a signature yet. Signature line shown instead.</div>}
      </div>
    </div>
  </div>;
}
