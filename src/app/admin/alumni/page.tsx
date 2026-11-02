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
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;0,900;1,700&family=Cormorant+Garamond:wght@500;700&family=Great+Vibes&display=swap');
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; padding: 0; font-family: 'Cormorant Garamond', 'Georgia', serif; }
      .cert-sheet { page-break-after: avoid; }
    `;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Certificate · ${a.full_name || ''}</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;0,900;1,700&family=Cormorant+Garamond:wght@500;700&family=Great+Vibes&display=swap" rel="stylesheet"><style>${style}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 1500);
  }

  const Sig = ({ person, role }: { person: any; role: string }) => (
    <div className="flex flex-col items-center text-center">
      <div className="relative flex h-[14mm] w-[62mm] items-end justify-center">
        {person?.signature_data
          ? <img src={person.signature_data} alt="signature" className="max-h-full max-w-full object-contain" />
          : <div className="h-[1px] w-full" style={{background:'#063b32'}} />}
      </div>
      <div className="mt-1 h-[1px] w-[62mm]" style={{background:'linear-gradient(90deg,transparent 0%,#063b32 20%,#063b32 80%,transparent 100%)'}} />
      <div className="mt-1 text-[11px] font-black" style={{color:'#063b32', letterSpacing:'.5px', fontFamily:"'Playfair Display', serif"}}>{person?.full_name || '—'}</div>
      <div className="text-[10px]" style={{color:'#8f6a1a', fontStyle:'italic'}}>{role}</div>
    </div>
  );

  // Inline SVG decorations
  const Lantern = ({ side }: { side: 'left' | 'right' }) => (
    <svg viewBox="0 0 60 120" width="60" height="120" style={{position:'absolute', top: 0, [side]: '10mm'} as any}>
      <defs>
        <linearGradient id={'lg-' + side} x1="0" x2="1">
          <stop offset="0%" stopColor="#f3cf74" />
          <stop offset="50%" stopColor="#d4a24a" />
          <stop offset="100%" stopColor="#8c5a0a" />
        </linearGradient>
      </defs>
      <line x1="30" y1="0" x2="30" y2="38" stroke="#8c5a0a" strokeWidth="0.8" />
      <circle cx="30" cy="38" r="2.4" fill="url(#lg-' + side + ')" />
      <path d="M20 42 Q30 36 40 42 L40 46 L20 46 Z" fill={`url(#lg-${side})`} />
      <path d="M18 46 L42 46 L39 86 L21 86 Z" fill="#1a4237" stroke="#d4a24a" strokeWidth="1" />
      <ellipse cx="30" cy="66" rx="7" ry="12" fill="#fde8a3" opacity="0.85" />
      <ellipse cx="30" cy="66" rx="3.5" ry="7" fill="#fff5c9" />
      <path d="M24 56 L36 56 M24 76 L36 76" stroke="#d4a24a" strokeWidth="0.8" />
      <path d="M21 86 L39 86 Q41 90 36 94 L24 94 Q19 90 21 86 Z" fill={`url(#lg-${side})`} />
      <circle cx="30" cy="96" r="2.5" fill="#d4a24a" />
      <path d="M30 98 L30 108" stroke="#d4a24a" strokeWidth="1" />
      <circle cx="30" cy="110" r="2.5" fill="#d4a24a" />
    </svg>
  );

  const Mosque = () => (
    <svg viewBox="0 0 240 180" width="240" height="180" style={{position:'absolute', right:'8mm', bottom:'35mm', opacity:0.18}}>
      <defs>
        <linearGradient id="mosqG" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f3cf74" />
          <stop offset="100%" stopColor="#8c5a0a" />
        </linearGradient>
      </defs>
      <path d="M40 60 Q40 20 70 20 Q100 20 100 60 L100 170 L40 170 Z" fill="url(#mosqG)" />
      <path d="M60 170 L60 110 Q70 100 80 110 L80 170 Z" fill="#063b32" opacity="0.6" />
      <path d="M105 90 Q105 40 130 40 Q155 40 155 90 L155 170 L105 170 Z" fill="url(#mosqG)" />
      <path d="M120 50 Q130 30 140 50" fill="none" stroke="url(#mosqG)" strokeWidth="2" />
      <circle cx="130" cy="30" r="4" fill="url(#mosqG)" />
      <path d="M165 70 Q165 30 190 30 Q215 30 215 70 L215 170 L165 170 Z" fill="url(#mosqG)" opacity="0.9" />
      <path d="M180 170 L180 115 Q195 105 205 115 L205 170 Z" fill="#063b32" opacity="0.6" />
    </svg>
  );

  const QuranStand = () => (
    <svg viewBox="0 0 200 180" width="200" height="180" style={{position:'absolute', left:'6mm', bottom:'34mm', opacity:0.95}}>
      <defs>
        <linearGradient id="qbook" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0b5a4a" />
          <stop offset="100%" stopColor="#063b32" />
        </linearGradient>
        <linearGradient id="qgold" x1="0" x2="1">
          <stop offset="0%" stopColor="#f3cf74" />
          <stop offset="100%" stopColor="#b78325" />
        </linearGradient>
      </defs>
      <path d="M100 160 L50 140 L50 125 L95 112 L100 108 L105 112 L150 125 L150 140 Z" fill="#8c5a0a" />
      <rect x="60" y="118" width="80" height="4" fill="#6b4a10" />
      <path d="M100 112 L50 95 Q100 80 150 95 Z" fill="url(#qbook)" />
      <path d="M100 112 L55 100 Q80 90 100 95 Z" fill="#f3e5be" />
      <path d="M100 112 L145 100 Q120 90 100 95 Z" fill="#f3e5be" />
      <path d="M100 95 L100 112" stroke="#8c5a0a" strokeWidth="0.6" />
      <path d="M65 100 L95 97 M65 103 L95 100 M105 97 L135 100 M105 100 L135 103" stroke="#8c5a0a" strokeWidth="0.4" />
      <path d="M50 95 Q100 80 150 95 L150 92 Q100 76 50 92 Z" fill="url(#qgold)" />
      <circle cx="100" cy="88" r="4" fill="url(#qgold)" />
    </svg>
  );

  const Laurel = ({ flip }: { flip?: boolean }) => (
    <svg viewBox="0 0 80 40" width="80" height="40" style={{transform: flip ? 'scaleX(-1)' : undefined}}>
      <path d="M5 20 Q25 10 55 15 Q65 17 72 20" fill="none" stroke="#b78325" strokeWidth="1.4" strokeLinecap="round" />
      <g fill="#b78325">
        <ellipse cx="18" cy="13" rx="4" ry="2" transform="rotate(-25 18 13)" />
        <ellipse cx="28" cy="10" rx="4" ry="2" transform="rotate(-18 28 10)" />
        <ellipse cx="40" cy="10" rx="4" ry="2" transform="rotate(-10 40 10)" />
        <ellipse cx="52" cy="11" rx="4" ry="2" transform="rotate(0 52 11)" />
        <ellipse cx="20" cy="26" rx="4" ry="2" transform="rotate(25 20 26)" />
        <ellipse cx="32" cy="24" rx="4" ry="2" transform="rotate(18 32 24)" />
        <ellipse cx="46" cy="22" rx="4" ry="2" transform="rotate(10 46 22)" />
        <ellipse cx="60" cy="20" rx="4" ry="2" transform="rotate(0 60 20)" />
      </g>
    </svg>
  );

  const Medallion = () => (
    <svg viewBox="0 0 120 120" width="120" height="120">
      <defs>
        <radialGradient id="medGold" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#f8e2a0" />
          <stop offset="50%" stopColor="#d4a24a" />
          <stop offset="100%" stopColor="#6b4a10" />
        </radialGradient>
      </defs>
      {/* starburst ridges */}
      <g>
        {Array.from({ length: 24 }).map((_, i) => (
          <path key={i} d="M60 60 L60 14 L62 18 L58 18 Z" fill="#d4a24a" opacity="0.9" transform={`rotate(${i * 15} 60 60)`} />
        ))}
      </g>
      <circle cx="60" cy="60" r="38" fill="url(#medGold)" stroke="#063b32" strokeWidth="2.5" />
      <circle cx="60" cy="60" r="34" fill="none" stroke="#8c5a0a" strokeWidth="0.6" />
      {/* open qur'an inside */}
      <g transform="translate(60 60)">
        <path d="M-16 -4 Q-10 -10 -2 -8 L-2 10 Q-10 8 -16 12 Z" fill="#fff8e4" stroke="#063b32" strokeWidth="0.8" />
        <path d="M16 -4 Q10 -10 2 -8 L2 10 Q10 8 16 12 Z" fill="#fff8e4" stroke="#063b32" strokeWidth="0.8" />
        <path d="M-2 -8 L-2 10 M2 -8 L2 10" stroke="#063b32" strokeWidth="0.6" />
        <path d="M-13 -2 L-5 -2 M-13 1 L-5 1 M-13 4 L-5 4 M-13 7 L-5 7" stroke="#063b32" strokeWidth="0.3" />
        <path d="M13 -2 L5 -2 M13 1 L5 1 M13 4 L5 4 M13 7 L5 7" stroke="#063b32" strokeWidth="0.3" />
      </g>
      <text x="60" y="105" textAnchor="middle" fontSize="7" fontWeight="900" fill="#063b32" fontFamily="Playfair Display, serif">AMQM · HAFIZ</text>
    </svg>
  );

  // SVG pattern tile (eight-point Islamic star)
  const IslamicPattern = () => (
    <svg width="100%" height="100%" style={{position:'absolute', inset:0, opacity:0.14}}>
      <defs>
        <pattern id="islPat" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <g stroke="#d4a24a" strokeWidth="0.6" fill="none">
            <path d="M20 2 L26 14 L38 20 L26 26 L20 38 L14 26 L2 20 L14 14 Z" />
            <circle cx="20" cy="20" r="4" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#islPat)" />
    </svg>
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

      <div id="cert-design-a" className="cert-sheet relative mx-auto overflow-hidden"
           style={{ width: '297mm', height: '210mm', fontFamily: "'Cormorant Garamond', Georgia, serif", background: '#063b32' }}>
        {/* Deep green with Islamic pattern */}
        <IslamicPattern />

        {/* Outer gold frame */}
        <div className="absolute" style={{inset:'7mm', border:'1.5px solid #d4a24a'}} />
        <div className="absolute" style={{inset:'9mm', border:'0.6px solid #d4a24a'}} />

        {/* Ivory inner panel with scalloped top */}
        <div className="absolute" style={{
          inset: '14mm',
          background: 'linear-gradient(180deg, #fffbee 0%, #fff6dc 100%)',
          borderRadius: '0 0 2mm 2mm',
          clipPath: 'polygon(0 15mm, 10% 15mm, 15% 5mm, 25% 15mm, 35% 5mm, 45% 15mm, 50% 2mm, 55% 15mm, 65% 5mm, 75% 15mm, 85% 5mm, 90% 15mm, 100% 15mm, 100% 100%, 0 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(212,162,74,.5)'
        }} />

        {/* Lanterns */}
        <Lantern side="left" />
        <Lantern side="right" />

        {/* Mosque silhouette & Quran on stand */}
        <Mosque />
        <QuranStand />

        {/* Content area */}
        <div className="absolute flex flex-col items-center text-center" style={{
          left: '14mm', right: '14mm', top: '22mm', bottom: '20mm',
          padding: '0 20mm',
        }}>
          {/* Logo */}
          <img src="/images/branding/amqm-logo-watermark.webp" alt="AMQM" style={{height:'18mm', objectFit:'contain'}} />

          <div style={{marginTop:'2mm', fontSize:'11px', fontWeight:900, letterSpacing:'.28em', color:'#063b32', fontFamily:"'Playfair Display', serif"}}>
            ALIYU AND MAIMUNA CENTER FOR QUR&apos;ANIC MEMORIZATION
          </div>

          {/* Decorative divider */}
          <div className="flex items-center gap-2" style={{marginTop:'2mm'}}>
            <div style={{width:'20mm', height:'1px', background:'linear-gradient(90deg,transparent,#d4a24a)'}} />
            <div style={{width:'4px', height:'4px', background:'#d4a24a', transform:'rotate(45deg)'}} />
            <div style={{width:'20mm', height:'1px', background:'linear-gradient(90deg,#d4a24a,transparent)'}} />
          </div>

          {/* Main heading */}
          <div style={{marginTop:'3mm', fontFamily:"'Playfair Display', serif", fontSize:'34px', fontWeight:900, color:'#063b32', letterSpacing:'1px'}}>
            QUR&apos;ANIC GRADUATION
          </div>
          <div style={{fontFamily:"'Great Vibes', cursive", fontSize:'58px', color:'#b78325', lineHeight:1, textShadow:'0 1px 0 rgba(140,90,10,.25)'}}>
            Certificate
          </div>

          {/* Ribbon */}
          <div style={{marginTop:'3mm', position:'relative'}}>
            <div style={{padding:'6px 26px', color:'#fff', fontSize:'11px', fontWeight:900, letterSpacing:'.25em',
              background:'linear-gradient(90deg,#8c5a0a 0%,#d4a24a 50%,#8c5a0a 100%)',
              boxShadow:'0 1px 0 rgba(0,0,0,.15)'}}>
              THIS CERTIFIES THAT
            </div>
          </div>

          {/* Name */}
          <div style={{marginTop:'3mm', fontFamily:"'Playfair Display', serif", fontSize:'44px', fontStyle:'italic', fontWeight:700, color:'#063b32', letterSpacing:'1px'}}>
            {a.full_name}
          </div>

          {/* Laurel + line */}
          <div style={{marginTop:'1mm', display:'flex', alignItems:'center', gap:'8mm'}}>
            <Laurel />
            <div style={{width:'80mm', height:'1px', background:'linear-gradient(90deg,transparent,#b78325 50%,transparent)'}} />
            <Laurel flip />
          </div>

          {/* Body statement */}
          <p style={{marginTop:'2mm', maxWidth:'200mm', textAlign:'center', fontSize:'12.5px', lineHeight:1.6, color:'#1f2937'}}>
            is hereby recognised as a graduate of the <b style={{color:'#063b32'}}>{a.cohort_name}</b> cohort, having successfully
            completed the Qur&apos;an Memorization Programme and fulfilled all graduation requirements of the institution,
            and is honoured as a <b style={{color:'#063b32'}}>Hafiz / Huffaz of the Holy Qur&apos;an</b> by the school management.
          </p>

          {/* Info row with icons */}
          <div style={{marginTop:'4mm', display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'6mm', width:'220mm'}}>
            {[
              ['COHORT', a.cohort_name],
              ['FINAL TERM', a.graduation_term],
              ['CLASS', classAtGrad],
              ['CERTIFICATE NO.', cert.certificate_number || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{textAlign:'center'}}>
                <div style={{fontSize:'9px', fontWeight:900, letterSpacing:'.22em', color:'#b78325'}}>{label}</div>
                <div style={{marginTop:'1mm', fontSize:'12px', fontWeight:700, color:'#063b32', fontFamily:"'Playfair Display', serif"}}>{value}</div>
              </div>
            ))}
          </div>

          {/* Medallion */}
          <div style={{marginTop:'3mm'}}>
            <Medallion />
          </div>
        </div>

        {/* Signatures */}
        <div className="absolute" style={{left:'14mm', right:'14mm', bottom:'15mm'}}>
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8mm', padding:'0 15mm'}}>
            <Sig person={teacher} role={`Class Teacher${classAtGrad && classAtGrad !== '—' ? ' · ' + classAtGrad : ''}`} />
            <Sig person={principal} role={principal?.job_title || 'Principal'} />
            <Sig person={director} role={director?.job_title || 'Director'} />
          </div>
        </div>

        {/* Footer */}
        <div className="absolute text-center" style={{left:0, right:0, bottom:'7mm', fontSize:'9px', color:'#063b32', opacity:.7, letterSpacing:'.1em'}}>
          Issued on {cert.issued_at || new Date().toLocaleDateString('en-GB', {day:'2-digit', month:'long', year:'numeric'})} · {cert.certificate_number || 'Draft'} · aliyumaimuna.com.ng
        </div>
      </div>

      {/* Preview warnings */}
      <div className="mt-3 space-y-1 text-xs">
        {!teacher?.signature_data && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Class teacher {teacher?.full_name || ''} has not uploaded a signature yet. Signature line shown instead.</div>}
        {!principal?.signature_data && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Principal {principal?.full_name || ''} has not uploaded a signature yet. Signature line shown instead.</div>}
        {!director?.signature_data && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Director {director?.full_name || ''} has not uploaded a signature yet. Signature line shown instead.</div>}
      </div>
    </div>
  </div>;
}
