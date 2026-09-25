'use client';

// Public admissions page. Auto-opens/closes based on admission_settings
// dates (no more manual toggle). Applicant fills the form, uploads a
// passport photo, sees the school's payment instructions plus a
// prominent "track your application" link with their application
// number.

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCMSSettings, type CMSSettings } from '@/lib/cms-live-store';
import { submitAdmissionApplication } from '@/lib/live-store';

const initialForm = {
  applicantName: '', dateOfBirth: '', gender: '',
  bloodGroup: '', genotype: '',
  parentName: '', parentPhone: '',
  guardianName: '', guardianPhone: '', guardianEmail: '', guardianRelationship: '',
  address: '', stateOfOrigin: '', state: 'Adamawa', lga: '',
  section: 'day', programYear: 'year_1',
  previousSchool: '', quranLevel: '',
  startingSurah: '', startingAyah: '',
};

const NGN = (n: number) => '₦' + Number(n || 0).toLocaleString('en-NG');

// Downscale + JPEG-encode a chosen image so it fits comfortably inside a
// database text column (target ~120 KB). Runs entirely in the browser so
// no storage bucket / RLS setup is required for anonymous applicants.
async function fileToCompressedDataUrl(file: File, maxDim = 700, quality = 0.78): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Could not read the selected image.'));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Selected file is not a supported image.'));
    i.src = dataUrl;
  });
  const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * ratio));
  const h = Math.max(1, Math.round(img.height * ratio));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('Cannot process image in this browser.');
  ctx.drawImage(img, 0, 0, w, h);
  return cv.toDataURL('image/jpeg', quality);
}

export default function PublicAdmissions() {
  const [settings, setSettings] = useState<CMSSettings>({});
  const [form, setForm] = useState(initialForm);
  const [photo, setPhoto] = useState<{ dataUrl: string; name: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { loadCMSSettings().then(setSettings); }, []);

  const adm         = (settings.admission_settings as any) || {};
  const admissionFee = Number(adm.admission_fee_ngn || 5000);
  const feeDisplay   = NGN(admissionFee);
  const requirements: string[] = Array.isArray(adm.requirements) ? adm.requirements : [];
  const openDate  = String(adm.opening_date || '');
  const closeDate = String(adm.closing_date || '');
  const today = new Date().toISOString().slice(0, 10);

  const portalState = useMemo(() => {
    if (!openDate) return { open: false, reason: 'Applications are not yet scheduled.' };
    if (today < openDate) return { open: false, reason: `Applications open on ${openDate}.` };
    if (closeDate && today > closeDate) return { open: false, reason: `Applications closed on ${closeDate}.` };
    return { open: true, reason: closeDate ? `Applications close on ${closeDate}.` : 'Applications are open.' };
  }, [openDate, closeDate, today]);

  const set = (k: string, v: string) => setForm(x => ({ ...x, [k]: v }));

  async function onPickPhoto(f: File | null) {
    setError('');
    if (!f) { setPhoto(null); return; }
    if (!/^image\//.test(f.type)) { setError('Please upload a JPG or PNG image.'); return; }
    if (f.size > 8 * 1024 * 1024) { setError('Image too large. Please upload a photo under 8 MB.'); return; }
    setPhotoBusy(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(f);
      setPhoto({ dataUrl, name: f.name });
    } catch (e: any) {
      setError(e?.message || 'Could not process the photo.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) { setError('Please confirm you have read the payment terms.'); return; }
    if (!photo) { setError('Please upload a recent passport photograph of the applicant.'); return; }
    setBusy(true); setError('');
    try {
      const r = await submitAdmissionApplication({
        ...form,
        startingSurah: form.startingSurah ? Number(form.startingSurah) : null,
        startingAyah:  form.startingAyah  ? Number(form.startingAyah)  : null,
        photoDataUrl:  photo.dataUrl,
        stateOfOrigin: form.stateOfOrigin,
      });
      setResult(r);
      try { localStorage.setItem('amqm.lastApplicationNo', r.application_no); } catch {}
    } catch (e: any) {
      setError(e?.message || 'Unable to submit application.');
    } finally {
      setBusy(false);
    }
  }

  // --- Success screen -----------------------------------------------------
  if (result) {
    return <main className="min-h-screen bg-[#f7f5ef] p-5">
      <div className="mx-auto max-w-2xl pt-10">
        <div className="card p-7 sm:p-10">
          <div className="text-xs font-bold uppercase tracking-[.22em] text-emerald-700">Application received</div>
          <h1 className="mt-2 text-3xl font-black">Save your application reference</h1>

          <div className="mt-6 rounded-2xl bg-emerald-950 p-6 text-white">
            <div className="text-xs text-emerald-200">Application reference (use this as your payment description)</div>
            <div className="mt-1 text-3xl font-black tracking-wide">{result.application_no}</div>
            <div className="mt-4 text-sm">Non-refundable admission fee: <b>{NGN(Number(result.application_fee))}</b></div>
          </div>

          <div className="mt-5 rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
            <h2 className="font-black text-amber-900">Payment instructions</h2>
            <p className="mt-1 text-sm text-amber-900/80">Transfer the exact amount above to the school account. <b>Use your application number as the transfer description / reference</b> so the admin can match your payment to your application.</p>
            <div className="mt-4 grid gap-2 text-sm">
              {Object.entries(result.payment || {}).map(([k, v]: any) => (
                <div key={k} className="flex justify-between gap-4 border-b border-amber-200 py-2">
                  <span className="capitalize text-amber-800">{k.replaceAll('_', ' ')}</span>
                  <b>{String(v)}</b>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href={`/admissions/track?ref=${encodeURIComponent(result.application_no)}`}
              className="btn btn-primary flex-1 py-3 text-center">
              Track my application status →
            </Link>
            <Link href="/" className="btn bg-slate-100 py-3 text-center">Return to website</Link>
          </div>

          <div className="mt-4 text-xs text-slate-500">
            Bookmark this tracker link. You will need your application number ({result.application_no}) and the parent phone number to check status.
          </div>
        </div>
      </div>
    </main>;
  }

  // --- Closed portal ------------------------------------------------------
  if (!portalState.open) {
    return <main className="min-h-screen bg-[#f7f5ef] p-5">
      <div className="mx-auto max-w-md pt-12">
        <div className="card p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-2xl">🔒</div>
          <h1 className="mt-4 text-2xl font-black">Admissions portal is closed</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">{portalState.reason}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Link href="/admissions/track" className="btn bg-emerald-50 text-emerald-900">Track an existing application</Link>
            <Link href="/" className="btn btn-primary">Back to website</Link>
          </div>
        </div>
      </div>
    </main>;
  }

  // --- Application form ---------------------------------------------------
  const isAdamawa = form.state.trim().toLowerCase() === 'adamawa';

  return <main className="min-h-screen bg-gradient-to-br from-[#f7f5ef] via-white to-emerald-50">
    <header className="border-b bg-white/90">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Link href="/" className="font-serif text-xl font-black text-emerald-950">{settings.school_name?.value || 'AMQM'}</Link>
        <div className="flex gap-2">
          <Link href="/admissions/track" className="btn bg-slate-100">Track application</Link>
          <Link href="/auth/login" className="btn bg-slate-100">Login</Link>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-3xl bg-emerald-950 p-6 text-white shadow-xl">
            <div className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">Admissions</div>
            <h1 className="mt-3 text-3xl font-black">Start your AMQM application</h1>
            <p className="mt-3 text-sm leading-6 text-emerald-100">Complete the form carefully. After submission, you will receive an application reference and payment instructions.</p>

            <div className="mt-6 rounded-2xl bg-white/10 p-4">
              <div className="text-xs text-emerald-200">Admission fee</div>
              <div className="mt-1 text-3xl font-black">{feeDisplay}</div>
              <div className="mt-1 text-xs text-amber-200">One-time, non-refundable</div>
            </div>

            {requirements.length > 0 && <div className="mt-4 rounded-2xl bg-white/10 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-200">Registration requirements</div>
              <ul className="mt-2 space-y-1 text-xs leading-6 text-emerald-50">
                {requirements.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
              <div className="mt-2 text-[10px] text-emerald-200/70">Bring the above on registration day if you are offered admission.</div>
            </div>}

            <div className="mt-4 text-xs text-emerald-100">{portalState.reason}</div>
          </div>
        </aside>

        <section className="card p-5 sm:p-7">
          <form onSubmit={submit} className="space-y-6">
            <div>
              <h2 className="text-xl font-black">Applicant photograph</h2>
              <p className="mt-1 text-xs text-slate-500">A recent passport-style photo of the child. JPG or PNG, under 8 MB.</p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                {photo?.dataUrl
                  ? <img src={photo.dataUrl} alt="preview" className="h-24 w-24 rounded-xl border object-cover" />
                  : <div className="grid h-24 w-24 place-items-center rounded-xl border-2 border-dashed border-slate-300 text-2xl text-slate-400">📷</div>}
                <div>
                  <button type="button" onClick={() => photoInputRef.current?.click()}
                    className="btn bg-emerald-50 text-emerald-900">{photoBusy ? 'Processing…' : (photo ? 'Change photo' : 'Choose photo')}</button>
                  {photo && <button type="button" onClick={() => setPhoto(null)} className="btn ml-2 bg-slate-100">Remove</button>}
                  {photo && <div className="mt-1 text-xs text-slate-500">{photo.name}</div>}
                </div>
                <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={e => onPickPhoto(e.target.files?.[0] || null)} />
              </div>
            </div>

            <div>
              <h2 className="text-xl font-black">Applicant biodata</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input required className="input" placeholder="Applicant full name" value={form.applicantName} onChange={e => set('applicantName', e.target.value)} />
                <input required className="input" type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} />
                <select required className="input" value={form.gender} onChange={e => set('gender', e.target.value)}>
                  <option value="">Gender</option><option>Male</option><option>Female</option>
                </select>
                <input className="input" placeholder="Previous school" value={form.previousSchool} onChange={e => set('previousSchool', e.target.value)} />
                <select className="input" value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
                  <option value="">Blood group</option>{['A+','A−','B+','B−','AB+','AB−','O+','O−'].map(g => <option key={g}>{g}</option>)}
                </select>
                <select className="input" value={form.genotype} onChange={e => set('genotype', e.target.value)}>
                  <option value="">Genotype</option>{['AA','AS','AC','SS','SC','CC'].map(g => <option key={g}>{g}</option>)}
                </select>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-black">Parent / guardian</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input required className="input" placeholder="Parent / guardian name" value={form.parentName} onChange={e => set('parentName', e.target.value)} />
                <input required className="input" type="tel" placeholder="Parent phone (used for tracking)" value={form.parentPhone} onChange={e => set('parentPhone', e.target.value)} />
                <input className="input" placeholder="Guardian name (if different)" value={form.guardianName} onChange={e => set('guardianName', e.target.value)} />
                <input className="input" type="tel" placeholder="Guardian phone" value={form.guardianPhone} onChange={e => set('guardianPhone', e.target.value)} />
                <input className="input" type="email" placeholder="Guardian email" value={form.guardianEmail} onChange={e => set('guardianEmail', e.target.value)} />
                <input className="input" placeholder="Relationship" value={form.guardianRelationship} onChange={e => set('guardianRelationship', e.target.value)} />
              </div>
            </div>

            <div>
              <h2 className="text-xl font-black">Address &amp; screening</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <textarea required className="input sm:col-span-2" placeholder="Residential address" value={form.address} onChange={e => set('address', e.target.value)} />
                <input required className="input" placeholder="State of origin" value={form.stateOfOrigin} onChange={e => set('stateOfOrigin', e.target.value)} />
                <input required className="input" placeholder="State of residence" value={form.state} onChange={e => set('state', e.target.value)} />
                <input required className="input" placeholder="LGA of residence" value={form.lga} onChange={e => set('lga', e.target.value)} />
                <div className={'rounded-xl border p-3 text-sm sm:col-span-2 ' + (isAdamawa ? 'border-emerald-100 bg-emerald-50 text-emerald-900' : 'border-sky-100 bg-sky-50 text-sky-900')}>
                  {isAdamawa
                    ? <><b>Screening:</b> Physical screening at AMQM in Adamawa State.</>
                    : <><b>Screening:</b> Virtual screening through a secure video room. A unique link will be issued after payment verification.</>}
                </div>
                <select className="input" value={form.section} onChange={e => set('section', e.target.value)}>
                  <option value="day">Day</option><option value="boarding">Boarding</option>
                </select>
                <input className="input" placeholder="Current Qur'an level" value={form.quranLevel} onChange={e => set('quranLevel', e.target.value)} />
                <input className="input" type="number" min={1} max={114} placeholder="Starting Surah (if known)" value={form.startingSurah} onChange={e => set('startingSurah', e.target.value)} />
                <input className="input" type="number" min={1} placeholder="Starting Ayah (if known)" value={form.startingAyah} onChange={e => set('startingAyah', e.target.value)} />
              </div>
            </div>

            {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

            <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">
              <input type="checkbox" className="mt-1" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
              <span>I understand that the {feeDisplay} admission fee is non-refundable, that submitting this application does not guarantee admission, and that I must use my application number as the payment reference.</span>
            </label>

            <button disabled={busy || photoBusy} className="btn btn-primary w-full py-3">
              {busy ? 'Submitting…' : 'Submit application → get payment instructions'}
            </button>
          </form>
        </section>
      </div>
    </div>
  </main>;
}
