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
    const origin = window.location.origin;
    // Clone the certificate sheet and rewrite relative image URLs to absolute
    // so they resolve inside the about:blank print window.
    const sheet = document.getElementById('cert-design-a');
    if (!sheet) return;
    const clone = sheet.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src.startsWith('/')) img.setAttribute('src', origin + src);
    });
    const html = clone.outerHTML;

    const style = `
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;0,900;1,700&family=Cormorant+Garamond:wght@500;700&family=Great+Vibes&display=swap');
      @page { size: A4 landscape; margin: 0; }
      html, body {
        margin: 0; padding: 0;
        font-family: 'Cormorant Garamond', 'Georgia', serif;
        background: #063b32;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      * {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .cert-sheet {
        page-break-after: avoid;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    `;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Certificate · ${a.full_name || ''}</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;0,900;1,700&family=Cormorant+Garamond:wght@500;700&family=Great+Vibes&display=swap" rel="stylesheet"><style>${style}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    // Wait for fonts + logo image to actually load before printing
    const trigger = () => setTimeout(() => w.print(), 400);
    const imgs = Array.from(w.document.images || []);
    if (imgs.length === 0) { setTimeout(trigger, 1200); return; }
    let remaining = imgs.length;
    const done = () => { remaining -= 1; if (remaining <= 0) trigger(); };
    imgs.forEach(img => {
      if (img.complete) done();
      else { img.addEventListener('load', done); img.addEventListener('error', done); }
    });
    // Safety net: print anyway after 4s
    setTimeout(() => w.print(), 4000);
  }

  const issuedDate = cert.issued_at
    ? new Date(cert.issued_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  const Sig = ({ person, role }: { person: any; role: string }) => (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div style={{ height: '13mm', width: '62mm', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {person?.signature_data
          ? <img src={person.signature_data} alt={`${person?.full_name || role} signature`} style={{ maxHeight: '12mm', maxWidth: '58mm', objectFit: 'contain' }} />
          : <div style={{ width: '58mm', borderBottom: '1px solid #174b3e' }} />}
      </div>
      <div style={{ width: '62mm', borderTop: '1px solid #b78325', marginTop: '1mm' }} />
      <div style={{ marginTop: '1mm', color: '#073d32', fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: '10px', lineHeight: 1.15 }}>{person?.full_name || '—'}</div>
      <div style={{ color: '#94691e', fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '11px', fontWeight: 700, lineHeight: 1.1 }}>{role}</div>
    </div>
  );

  const Lantern = ({ side }: { side: 'left' | 'right' }) => (
    <svg viewBox="0 0 56 116" width="42" height="88" aria-hidden="true" style={{ position: 'absolute', top: '4mm', [side]: '19mm', zIndex: 3 } as any}>
      <defs><linearGradient id={`amqm-lantern-${side}`} x1="0" x2="1"><stop offset="0" stopColor="#96631c"/><stop offset=".48" stopColor="#f4d27c"/><stop offset="1" stopColor="#a66e1e"/></linearGradient></defs>
      <path d="M28 0 V20" stroke="#a87927"/><circle cx="28" cy="21" r="2" fill="#d4a24a"/>
      <path d="M19 26 Q28 19 37 26 L34 31 H22Z" fill={`url(#amqm-lantern-${side})`} stroke="#9b6b1f"/>
      <path d="M18 31 H38 L35 76 Q28 84 21 76Z" fill="#174a3c" stroke="#c99a42" strokeWidth="1.2"/>
      <path d="M28 34 C18 44 21 62 28 73 C35 62 38 44 28 34Z" fill="#ffedb5" opacity=".9"/>
      <path d="M22 39 H34 M21 68 H35" stroke="#d5a34b"/>
      <path d="M21 76 Q28 84 35 76 L32 83 H24Z" fill={`url(#amqm-lantern-${side})`} stroke="#9b6b1f"/>
      <path d="M28 83 V94 L24 100 L28 106 L32 100 L28 94" fill="none" stroke="#b78325"/>
    </svg>
  );

  const Mosque = () => (
    <svg viewBox="0 0 240 150" width="190" height="119" aria-hidden="true" style={{ position: 'absolute', right: '2mm', bottom: '24mm', opacity: .13, zIndex: 1 }}>
      <g fill="#b78325">
        <path d="M14 150 V91 Q14 52 51 52 Q88 52 88 91 V150Z"/><path d="M97 150 V80 Q97 37 135 37 Q173 37 173 80 V150Z"/><path d="M183 150 V90 Q183 54 211 54 Q239 54 239 90 V150Z"/>
        <path d="M28 52 Q51 10 74 52Z"/><path d="M111 37 Q135 -4 159 37Z"/><path d="M194 54 Q211 20 228 54Z"/>
        <rect x="48" y="22" width="5" height="31"/><rect x="133" y="4" width="5" height="34"/><rect x="209" y="30" width="4" height="25"/>
      </g>
      <g fill="#fffbee"><path d="M43 150 V111 Q51 96 59 111 V150Z"/><path d="M123 150 V105 Q135 87 147 105 V150Z"/><path d="M202 150 V117 Q211 102 220 117 V150Z"/></g>
    </svg>
  );

  const QuranStand = () => (
    <svg viewBox="0 0 190 150" width="150" height="118" aria-hidden="true" style={{ position: 'absolute', left: '4mm', bottom: '20mm', zIndex: 2 }}>
      <defs><linearGradient id="amqm-book" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#0b6651"/><stop offset="1" stopColor="#063b32"/></linearGradient><linearGradient id="amqm-wood" x1="0" x2="1"><stop offset="0" stopColor="#5d3518"/><stop offset=".5" stopColor="#c18b43"/><stop offset="1" stopColor="#704019"/></linearGradient></defs>
      <path d="M95 140 L45 112 L50 104 L95 122 L140 104 L145 112Z" fill="url(#amqm-wood)" stroke="#6b421e"/><path d="M95 124 L56 86 L65 82 L95 109 L125 82 L134 86Z" fill="url(#amqm-wood)" stroke="#6b421e"/>
      <path d="M95 104 Q66 88 35 77 L40 37 Q69 39 95 57Z" fill="url(#amqm-book)" stroke="#d4a24a" strokeWidth="1.5"/><path d="M95 104 Q124 88 155 77 L150 37 Q121 39 95 57Z" fill="#0a5b49" stroke="#d4a24a" strokeWidth="1.5"/><path d="M95 57 V104" stroke="#edca70" strokeWidth="1.4"/>
      <path d="M47 48 Q70 52 87 65 M50 56 Q72 60 87 72 M143 48 Q120 52 103 65 M140 56 Q118 60 103 72" stroke="#e6c36a" strokeWidth=".8" fill="none"/><path d="M63 55 L70 49 L77 55 L70 61Z M113 55 L120 49 L127 55 L120 61Z" fill="none" stroke="#e6c36a"/><path d="M95 45 L101 51 L95 57 L89 51Z" fill="#e6c36a"/>
    </svg>
  );

  const Medallion = () => (
    <svg viewBox="0 0 112 112" width="76" height="76" aria-hidden="true">
      <defs><radialGradient id="amqm-medal" cx="35%" cy="28%"><stop offset="0" stopColor="#fff0bd"/><stop offset=".55" stopColor="#d7aa51"/><stop offset="1" stopColor="#95631b"/></radialGradient></defs>
      <g fill="#c08c31">{Array.from({ length: 24 }).map((_, i) => <path key={i} d="M56 4 L60 17 L52 17Z" transform={`rotate(${i * 15} 56 56)`}/>)}</g>
      <circle cx="56" cy="56" r="43" fill="url(#amqm-medal)" stroke="#8b5b17" strokeWidth="2"/><circle cx="56" cy="56" r="37" fill="#073d32" stroke="#f2d27d" strokeWidth="1.5"/>
      <g fill="none" stroke="#f1d07a" strokeWidth="1.5" strokeLinecap="round"><path d="M25 61 Q28 43 42 37 M87 61 Q84 43 70 37"/><path d="M29 52 Q21 46 23 39 Q32 40 34 48 M35 43 Q29 34 34 29 Q42 34 40 41 M78 43 Q83 34 78 29 Q70 34 72 41 M83 52 Q91 46 89 39 Q80 40 78 48"/></g>
      <path d="M56 48 Q45 40 35 46 V67 Q46 61 56 69Z" fill="#fff4d2" stroke="#d5a44c"/><path d="M56 48 Q67 40 77 46 V67 Q66 61 56 69Z" fill="#fff4d2" stroke="#d5a44c"/><path d="M56 48 V69" stroke="#8b5b17"/>
    </svg>
  );

  const Pattern = () => (
    <svg viewBox="0 0 297 210" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: .14, zIndex: 0 }}>
      <defs><pattern id="amqm-islamic-pattern" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M8 0 L11 5 L16 8 L11 11 L8 16 L5 11 L0 8 L5 5Z M8 4 L12 8 L8 12 L4 8Z" fill="none" stroke="#e3bd65" strokeWidth=".35"/></pattern></defs>
      <rect width="297" height="210" fill="url(#amqm-islamic-pattern)"/>
    </svg>
  );

  const infoItems = [
    { label: 'COHORT', value: a.cohort_name || '—' },
    { label: 'FINAL TERM', value: a.graduation_term || '—' },
    { label: 'CLASS', value: classAtGrad },
    { label: 'CERTIFICATE NO.', value: cert.certificate_number || '—' },
  ];

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-3 sm:p-5">
    <div className="mx-auto my-3 w-full max-w-[1200px] rounded-2xl bg-white p-3 shadow-2xl sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-black text-emerald-950">Certificate preview · {a.full_name}</h2><p className="text-xs text-slate-500">AMQM · Official Qur&apos;anic Graduation Certificate</p></div>
        <div className="flex gap-2"><button className="btn btn-primary" onClick={doPrint}>Print / Save as PDF</button><button className="btn bg-slate-100" onClick={close}>Close</button></div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-slate-100 p-2">
        <div id="cert-design-a" className="cert-sheet relative mx-auto overflow-hidden" style={{ width: '297mm', height: '210mm', minWidth: '297mm', background: '#063b32', color: '#14392f', fontFamily: "'Cormorant Garamond', Georgia, serif", isolation: 'isolate', printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' } as any}>
          <Pattern />
          <div style={{ position: 'absolute', inset: '4mm', border: '1.2mm solid #b78325', zIndex: 1 }}/><div style={{ position: 'absolute', inset: '6mm', border: '.35mm solid #f2d27d', zIndex: 1 }}/><div style={{ position: 'absolute', inset: '8mm', border: '.25mm solid rgba(243,207,116,.7)', zIndex: 1 }}/>
          <div style={{ position: 'absolute', inset: '12mm', background: 'linear-gradient(145deg, #fffdf4 0%, #fff8e6 54%, #fffdf4 100%)', border: '.7mm solid #d4a24a', outline: '.45mm solid rgba(255,239,190,.95)', outlineOffset: '-2mm', boxShadow: 'inset 0 0 18mm rgba(183,131,37,.12)', zIndex: 1, clipPath: 'polygon(0 7%, 5% 7%, 9% 2%, 15% 2%, 20% 0, 80% 0, 85% 2%, 91% 2%, 95% 7%, 100% 7%, 100% 100%, 0 100%)' }}/>
          <div style={{ position: 'absolute', left: '13mm', top: '13mm', width: '22mm', height: '22mm', borderTop: '.7mm solid #c3943c', borderLeft: '.7mm solid #c3943c', zIndex: 2 }}/><div style={{ position: 'absolute', right: '13mm', top: '13mm', width: '22mm', height: '22mm', borderTop: '.7mm solid #c3943c', borderRight: '.7mm solid #c3943c', zIndex: 2 }}/><div style={{ position: 'absolute', left: '13mm', bottom: '13mm', width: '22mm', height: '22mm', borderBottom: '.7mm solid #c3943c', borderLeft: '.7mm solid #c3943c', zIndex: 2 }}/><div style={{ position: 'absolute', right: '13mm', bottom: '13mm', width: '22mm', height: '22mm', borderBottom: '.7mm solid #c3943c', borderRight: '.7mm solid #c3943c', zIndex: 2 }}/>
          <Lantern side="left"/><Lantern side="right"/><Mosque/><QuranStand/>

          <div style={{ position: 'absolute', zIndex: 4, top: '13mm', left: '31mm', right: '31mm', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <img src="/images/branding/amqm-logo-watermark.webp" alt="Aliyu and Maimuna Center for Qur'anic Memorization logo" style={{ height: '17mm', maxWidth: '48mm', objectFit: 'contain', display: 'block' }}/>
            <div style={{ marginTop: '1.5mm', color: '#063b32', fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 800, fontSize: '10.5px', letterSpacing: '.22em', lineHeight: 1.25 }}>ALIYU AND MAIMUNA CENTER FOR QUR&apos;ANIC MEMORIZATION</div>
            <div style={{ marginTop: '2mm', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3mm', width: '100%' }}><span style={{ height: '1px', width: '25mm', background: 'linear-gradient(90deg, transparent, #b78325)' }}/><span style={{ width: '3mm', height: '3mm', border: '1px solid #b78325', transform: 'rotate(45deg)' }}/><span style={{ height: '1px', width: '25mm', background: 'linear-gradient(90deg, #b78325, transparent)' }}/></div>
            <div style={{ marginTop: '2.4mm', color: '#063b32', fontFamily: "'Playfair Display', Georgia, serif", fontSize: '29px', lineHeight: 1.08, letterSpacing: '.045em', fontWeight: 800 }}>QUR&apos;ANIC GRADUATION</div>
            <div style={{ color: '#a36e1b', fontFamily: "'Great Vibes', cursive", fontSize: '51px', lineHeight: 1.04, marginTop: '-1mm' }}>Certificate</div>
            <div style={{ marginTop: '2mm', padding: '1.5mm 12mm', background: 'linear-gradient(90deg, #95651b 0%, #e4bd65 50%, #95651b 100%)', color: '#fffdf3', fontFamily: "'Playfair Display', Georgia, serif", fontSize: '10px', fontWeight: 800, letterSpacing: '.16em', clipPath: 'polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%, 4% 50%)' }}>THIS CERTIFIES THAT</div>
            <div style={{ width: '100%', marginTop: '2.7mm', color: '#063b32', fontFamily: "'Playfair Display', Georgia, serif", fontSize: '35px', fontWeight: 800, lineHeight: 1.12, overflowWrap: 'anywhere' }}>{a.full_name || 'Graduate Name'}</div>
            <div style={{ width: '100%', marginTop: '1.5mm', height: '.35mm', background: 'linear-gradient(90deg, transparent 0%, #b78325 18%, #b78325 82%, transparent 100%)' }}/>
            <p style={{ maxWidth: '207mm', margin: '2mm 0 0', color: '#29352f', fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '14px', lineHeight: 1.32, fontWeight: 600 }}>is hereby recognised as a graduate of the <b style={{ color: '#063b32' }}>{a.cohort_name || '—'}</b> cohort, having successfully completed the Qur&apos;an Memorization Programme at Aliyu and Maimuna Center for Qur&apos;anic Memorization and is honoured as a <b style={{ color: '#063b32' }}>Hafiz / Huffaz of the Holy Qur&apos;an</b> by the school management.</p>
            <div style={{ marginTop: '3.2mm', width: '100%', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', borderTop: '.3mm solid #d5b36b', borderBottom: '.3mm solid #d5b36b', padding: '2.2mm 0' }}>
              {infoItems.map((item, index) => <div key={item.label} style={{ minWidth: 0, padding: '0 2mm', borderRight: index < infoItems.length - 1 ? '.25mm solid #d5b36b' : 'none' }}><div style={{ fontFamily: "'Playfair Display', Georgia, serif", color: '#9a6c21', fontSize: '8px', fontWeight: 800, letterSpacing: '.08em', lineHeight: 1.2 }}>{item.label}</div><div style={{ marginTop: '1mm', color: '#073d32', fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '12px', fontWeight: 700, lineHeight: 1.15, overflowWrap: 'anywhere' }}>{item.value}</div></div>)}
            </div>
            <div style={{ marginTop: '1.5mm' }}><Medallion/></div>
          </div>

          <div style={{ position: 'absolute', zIndex: 5, left: '19mm', right: '19mm', bottom: '12mm', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'end', gap: '8mm' }}>
            <Sig person={teacher} role={`Class Teacher${classAtGrad && classAtGrad !== '—' ? ' · ' + classAtGrad : ''}`}/><Sig person={principal} role={principal?.job_title || 'Principal'}/><Sig person={director} role={director?.job_title || 'Director'}/>
          </div>
          <div style={{ position: 'absolute', zIndex: 4, left: '48mm', right: '48mm', bottom: '5mm', textAlign: 'center', color: '#e9cb82', fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '9px', letterSpacing: '.1em' }}>{cert.certificate_number || "AMQM · QUR'ANIC GRADUATION"} · {issuedDate !== '—' ? issuedDate : 'OFFICIAL GRADUATION RECORD'}</div>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs">
        {!teacher?.signature_data && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Class teacher {teacher?.full_name || ''} has not uploaded a signature yet. Signature line shown instead.</div>}
        {!principal?.signature_data && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Principal {principal?.full_name || ''} has not uploaded a signature yet. Signature line shown instead.</div>}
        {!director?.signature_data && <div className="rounded bg-amber-50 p-2 text-amber-800">⚠ Director {director?.full_name || ''} has not uploaded a signature yet. Signature line shown instead.</div>}
      </div>
    </div>
  </div>;
}
