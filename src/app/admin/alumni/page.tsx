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
  const [logoFailed, setLogoFailed] = useState(false);

  const issuedDate = cert.issued_at
    ? new Date(cert.issued_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  function doPrint() {
    const sheet = document.getElementById('cert-design-a');
    if (!sheet) return;
    const printNode = sheet.cloneNode(true) as HTMLElement;
    printNode.querySelectorAll('img').forEach((image) => {
      const src = image.getAttribute('src');
      if (src?.startsWith('/')) image.setAttribute('src', `${window.location.origin}${src}`);
    });
    const html = printNode.outerHTML;
    const fonts = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;0,900;1,700&family=Cormorant+Garamond:wght@500;600;700&family=Great+Vibes&display=swap';
    const style = `
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      html, body { width: 297mm; height: 210mm; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: #fdf8ec; }
      .cert-sheet { width: 297mm !important; height: 210mm !important; min-width: 297mm !important; margin: 0 !important; overflow: hidden !important; page-break-after: avoid !important; }
      img, svg { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    `;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>AMQM Graduation Certificate - ${a.full_name || 'Graduate'}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${fonts}" rel="stylesheet"><style>${style}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    const waitForAssets = async () => {
      if (w.document.fonts?.ready) await w.document.fonts.ready.catch(() => undefined);
      await Promise.all(Array.from(w.document.images).map((image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          image.onload = () => resolve();
          image.onerror = () => resolve();
        });
      }));
      window.setTimeout(() => { w.focus(); w.print(); }, 1200);
    };
    void waitForAssets();
  }

  const Signature = ({ person, designation }: { person: any; designation: string }) => (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ height: '7mm', width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0 2mm' }}>
        {typeof person?.signature_data === 'string' && person.signature_data.length > 0
          ? <img src={person.signature_data} alt={`${person?.full_name || designation} signature`}
              style={{ display: 'block', maxHeight: '6.5mm', maxWidth: '100%', objectFit: 'contain' }} />
          : <div style={{ width: '65%', borderBottom: '0.25mm solid #173f35', marginBottom: '1mm' }} />}
      </div>
      <div style={{ width: '65%', borderTop: '0.25mm solid #b78325' }} />
      <div style={{ marginTop: '0.8mm', color: '#123d32', fontFamily: "'Playfair Display', Georgia, serif", fontSize: '7.5px', fontWeight: 700, lineHeight: 1.15, overflowWrap: 'anywhere' }}>
        {person?.full_name || '—'}
      </div>
      <div style={{ marginTop: '0.3mm', color: '#8a611f', fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '6.5px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', lineHeight: 1.15 }}>
        {designation}
      </div>
    </div>
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
        <div>
          <h2 className="text-lg font-black text-emerald-950">Certificate preview · {a.full_name}</h2>
          <p className="text-xs text-slate-500">AMQM · Official Qur&apos;anic Graduation Certificate</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={doPrint}>Print / Save as PDF</button>
          <button className="btn bg-slate-100" onClick={close}>Close</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-slate-100 p-2">
        <div
          id="cert-design-a"
          className="cert-sheet relative mx-auto overflow-hidden"
          style={{
            width: '297mm', height: '210mm', minWidth: '297mm',
            backgroundImage: "url('/images/certificates/certificate-background.webp')",
            backgroundSize: '100% 100%',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundColor: '#fdf8ec',
            color: '#123d32',
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            isolation: 'isolate',
            printColorAdjust: 'exact',
            WebkitPrintColorAdjust: 'exact',
          } as any}
        >
          {/* Header: real school logo + institution name, pushed up into the
              very top of the open dome area, with larger bolder type */}
          <div style={{ position: 'absolute', left: '20mm', right: '20mm', top: '4mm', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ height: '17mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {!logoFailed ? (
                <img
                  src="/images/branding/amqm-logo-watermark.webp"
                  alt="Aliyu and Maimuna Center for Qur'anic Memorization official logo"
                  onError={() => setLogoFailed(true)}
                  style={{ display: 'block', height: '17mm', maxWidth: '48mm', objectFit: 'contain' }}
                />
              ) : (
                <div style={{
                  color: '#0d4537', fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 900,
                  fontSize: '36px', letterSpacing: '.16em', border: '.45mm solid #b78325', padding: '2mm 7mm',
                }}>AMQM</div>
              )}
            </div>
            <div style={{ marginTop: '2mm', color: '#0d4537', fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 900, fontSize: '15px', letterSpacing: '.14em', lineHeight: 1.3 }}>
              ALIYU AND MAIMUNA CENTER FOR QUR&apos;ANIC MEMORIZATION
            </div>
          </div>

          {/* Main heading */}
          <div style={{ position: 'absolute', left: '20mm', right: '20mm', top: '35mm', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ color: '#0d4537', fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 800, fontSize: '26px', lineHeight: 1.1, letterSpacing: '.03em' }}>
              QUR&apos;ANIC GRADUATION
            </div>
            <div style={{ marginTop: '0', color: '#a3701f', fontFamily: "'Great Vibes', cursive", fontSize: '50px', lineHeight: 1 }}>
              Certificate
            </div>

            <div style={{
              marginTop: '4mm', padding: '2mm 11mm',
              background: 'linear-gradient(90deg, #8f601a 0%, #e4bd65 50%, #8f601a 100%)',
              color: '#fffdf3', fontFamily: "'Playfair Display', Georgia, serif", fontSize: '10px', fontWeight: 800, letterSpacing: '.18em',
              clipPath: 'polygon(0 0, 100% 0, 96% 50%, 100% 100%, 0 100%, 4% 50%)',
            }}>
              THIS CERTIFIES THAT
            </div>

            <div style={{
              width: '100%', marginTop: '4.5mm', color: '#0d4537',
              fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 800, fontStyle: 'italic',
              fontSize: (a.full_name || '').length > 28 ? '32px' : '40px',
              lineHeight: 1.15, overflowWrap: 'anywhere',
            }}>
              {a.full_name || 'Graduate Name'}
            </div>
            <div style={{ width: '62%', height: '.4mm', marginTop: '2mm', background: 'linear-gradient(90deg, transparent, #b78325 20%, #b78325 80%, transparent)' }} />

            <p style={{
              maxWidth: '200mm', margin: '4.5mm 0 0', color: '#2a352f',
              fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '13px', lineHeight: 1.6, fontWeight: 600,
            }}>
              is hereby recognised as a graduate of the <b style={{ color: '#0d4537' }}>{a.cohort_name || '—'}</b> cohort, having successfully
              completed the Qur&apos;an Memorization Programme at Aliyu and Maimuna Center for Qur&apos;anic Memorization and is
              honoured as a <b style={{ color: '#0d4537' }}>Hafiz / Huffaz of the Holy Qur&apos;an</b> by the school management.
            </p>

            <div style={{
              marginTop: '6mm', width: '82%', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              borderTop: '.35mm solid #c69a4a', borderBottom: '.35mm solid #c69a4a', padding: '2.8mm 0',
            }}>
              {infoItems.map((item, index) => (
                <div key={item.label} style={{ minWidth: 0, padding: '0 2mm', borderRight: index < infoItems.length - 1 ? '.2mm solid #d9c18e' : 'none' }}>
                  <div style={{ color: '#8a611f', fontFamily: "'Playfair Display', Georgia, serif", fontSize: '7.5px', fontWeight: 800, letterSpacing: '.1em', lineHeight: 1.3 }}>{item.label}</div>
                  <div style={{ marginTop: '1.3mm', color: '#123d32', fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '10.5px', fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Signature plaque — moved down into the bottom gold-ribbon footer
              band so the medallion above it stays fully visible. Compact
              sizing + the certificate number/date folded into the same card
              so everything "official" lives together at the foot of the
              page, matching the reference layout. */}
          <div style={{
            position: 'absolute', zIndex: 4, left: '26mm', right: '26mm', bottom: '6mm',
            background: '#fdf8ec',
            boxShadow: '0 1mm 4mm rgba(13, 69, 55, .25)',
            borderTop: '.3mm solid #c6983f', borderBottom: '.3mm solid #c6983f',
            padding: '2mm 5mm 1.6mm',
            borderRadius: '1.6mm',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '5mm' }}>
              <Signature person={teacher} designation={teacher?.job_title || 'Class Teacher'} />
              <Signature person={principal} designation={principal?.job_title || 'Principal'} />
              <Signature person={director} designation={director?.job_title || 'Director'} />
            </div>
            <div style={{
              marginTop: '1.4mm', paddingTop: '1.2mm', borderTop: '.2mm solid #e3cf9c', textAlign: 'center',
              color: '#8a611f', fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '6.5px', fontWeight: 700, letterSpacing: '.1em',
            }}>
              {cert.certificate_number || "AMQM · QUR'ANIC GRADUATION"}{issuedDate !== '—' ? `  •  ${issuedDate}` : ''}
            </div>
          </div>
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
