'use client';

// Applicant self-service tracker. Enter application number + phone; get
// back a timeline showing application received -> payment status ->
// screening scheduled (with join button for virtual) -> outcome ->
// admission letter (printable, mirrors what the admin prints).

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { loadCMSSettings, type CMSSettings } from '@/lib/cms-live-store';
import { trackAdmissionApplication } from '@/lib/live-store';
import { printAdmissionLetter } from '@/lib/admission-letter';

export default function TrackApplication() {
  const [ref, setRef]     = useState('');
  const [phone, setPhone] = useState('');
  const [payload, setPayload] = useState<any>(null);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<CMSSettings>({});

  useEffect(() => { loadCMSSettings().then(setSettings); }, []);

  // Prefill from query string or last successful submission.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const q = url.searchParams.get('ref');
      if (q) setRef(q);
      else {
        const saved = localStorage.getItem('amqm.lastApplicationNo');
        if (saved) setRef(saved);
      }
    } catch {}
  }, []);

  const admissionSettings = (settings.admission_settings as any) || {};

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ref.trim() || !phone.trim()) { setError('Enter your application number and phone.'); return; }
    setBusy(true); setError(''); setPayload(null);
    try {
      const data = await trackAdmissionApplication(ref.trim(), phone.trim());
      if (data && data.error) { setError(data.error); return; }
      setPayload(data);
      try { localStorage.setItem('amqm.lastApplicationNo', String(data.application_no || '')); } catch {}
    } catch (e: any) {
      setError(e?.message || 'We could not look up that application.');
    } finally {
      setBusy(false);
    }
  }

  const canPrintLetter = payload?.screening_outcome === 'successful';

  function printLetter() {
    if (!payload) return;
    printAdmissionLetter({
      applicant_name: payload.applicant_name,
      application_no: payload.application_no,
      class_name:     null,
      section:        payload.requested_section || null,
      parent_name:    payload.parent_name,
      starting_surah: payload.starting_surah,
      starting_ayah:  payload.starting_ayah,
      screening_score: null,
    }, admissionSettings, settings);
  }

  return <main className="min-h-screen bg-gradient-to-br from-[#f7f5ef] via-white to-emerald-50">
    <header className="border-b bg-white/90">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
        <Link href="/" className="font-serif text-xl font-black text-emerald-950">{settings.school_name?.value || 'AMQM'}</Link>
        <div className="flex gap-2">
          <Link href="/admissions" className="btn bg-slate-100">New application</Link>
          <Link href="/" className="btn bg-slate-100">Home</Link>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-4xl px-5 py-10">
      <div className="text-xs font-bold uppercase tracking-[.22em] text-emerald-700">Applicant portal</div>
      <h1 className="mt-2 text-3xl font-black">Track your application</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">Enter the application number you received after submitting the form, and the parent phone number you registered with.</p>

      <form onSubmit={lookup} className="card mt-6 grid gap-3 p-5 sm:grid-cols-[1.4fr_1fr_auto]">
        <input required className="input" placeholder="Application number (e.g. AMQM/APP/2026/0007)" value={ref} onChange={e => setRef(e.target.value)} />
        <input required className="input" type="tel" placeholder="Parent phone (as registered)" value={phone} onChange={e => setPhone(e.target.value)} />
        <button disabled={busy} className="btn btn-primary">{busy ? 'Checking…' : 'Track'}</button>
      </form>

      {error && <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}

      {payload && !payload.error && <div className="mt-6 space-y-4">
        <Header payload={payload} />
        <Timeline payload={payload} />
        {canPrintLetter && <div className="card p-5">
          <div className="text-xs font-bold uppercase tracking-widest text-emerald-700">Admission letter</div>
          <h2 className="mt-1 text-lg font-black">You have been offered admission</h2>
          <p className="mt-1 text-sm text-slate-500">Print your admission letter and bring it on the day of registration with the required documents.</p>
          <button className="btn btn-primary mt-3" onClick={printLetter}>▤ Print admission letter</button>
        </div>}
      </div>}
    </div>
  </main>;
}

function Header({ payload }: { payload: any }) {
  const status = payload.screening_outcome || payload.status || 'submitted';
  const map: Record<string, string> = {
    submitted:              'bg-slate-100 text-slate-700',
    payment_verified:       'bg-emerald-50 text-emerald-800',
    screening_scheduled:    'bg-sky-50 text-sky-800',
    successful:             'bg-emerald-100 text-emerald-900',
    accepted:               'bg-emerald-100 text-emerald-900',
    unsuccessful:           'bg-rose-100 text-rose-800',
    further_assessment:     'bg-amber-100 text-amber-900',
  };
  return <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
    {payload.photo_url
      ? <img src={payload.photo_url} alt={payload.applicant_name} className="h-20 w-20 rounded-2xl border object-cover" />
      : <div className="grid h-20 w-20 place-items-center rounded-2xl bg-emerald-50 text-2xl font-black text-emerald-800">{String(payload.applicant_name || '?').slice(0, 1)}</div>}
    <div className="flex-1 min-w-0">
      <div className="text-xs font-bold uppercase tracking-widest text-emerald-700">{payload.application_no}</div>
      <h2 className="mt-1 truncate text-2xl font-black">{payload.applicant_name}</h2>
      <div className="mt-1 text-xs text-slate-500">
        Parent: {payload.parent_name || '—'}
        {payload.state ? ` · ${payload.state}` : ''}
        {payload.lga   ? `, ${payload.lga}`         : ''}
      </div>
    </div>
    <span className={'inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wide ' + (map[status] || 'bg-slate-100 text-slate-700')}>
      {String(status).replaceAll('_', ' ')}
    </span>
  </section>;
}

function Timeline({ payload }: { payload: any }) {
  const submittedAt = payload.created_at ? new Date(payload.created_at).toLocaleString() : null;
  const paymentVerified = payload.payment_status === 'verified';
  const screeningAt     = payload.screening_scheduled_at ? new Date(payload.screening_scheduled_at) : null;
  const outcome         = payload.screening_outcome as string | null;

  const steps = useMemo(() => {
    return [
      {
        title: 'Application received',
        state: 'done' as const,
        detail: submittedAt ? `Submitted ${submittedAt}` : 'Received.',
      },
      {
        title: 'Payment',
        state: (paymentVerified ? 'done' : 'wait') as 'done'|'wait',
        detail: paymentVerified
          ? `Verified ${payload.payment_reference ? '· Ref ' + payload.payment_reference : ''}`
          : `Transfer ₦${Number(payload.application_fee || 0).toLocaleString('en-NG')} using ${payload.application_no} as the payment reference. Admin verifies within office hours.`,
      },
      {
        title: 'Screening',
        state: (screeningAt ? 'done' : paymentVerified ? 'active' : 'wait') as 'done'|'active'|'wait',
        detail: (() => {
          const predictedMode = payload.screening_mode
            || (String(payload.state || '').trim().toLowerCase() === 'adamawa' ? 'physical' : 'virtual');
          const modeLabel = predictedMode === 'virtual' ? 'Virtual video call' : 'Physical at school';
          if (screeningAt) return `${modeLabel} · ${screeningAt.toLocaleString()}`;
          if (paymentVerified) return `Screening will be scheduled once admin has assigned a date. Expected mode: ${modeLabel}.`;
          return `Screening is scheduled after your payment is verified. Expected mode: ${modeLabel}.`;
        })(),
        _skip: (function(){/* dead code kept as reference, harmless
          ? `${payload.screening_mode === 'virtual' ? 'Virtual video call' : 'Physical at school'} · ${screeningAt.toLocaleString()}`
          : paymentVerified
            ? 'Screening will be scheduled once admin has assigned a date.'
            : 'Screening is scheduled after your payment is verified.',*/})(),
        extra: screeningAt && payload.screening_mode === 'virtual' && payload.screening_token
          ? { href: '/admissions/screening/' + payload.screening_token, label: 'Join video call' }
          : null,
      },
      {
        title: 'Screening result',
        state: outcome ? 'done' : 'wait',
        detail: outcome
          ? outcome === 'successful'   ? 'Congratulations — you have been offered admission.'
          : outcome === 'unsuccessful' ? 'The school will not be able to offer admission this session.'
          : outcome === 'further_assessment' ? 'A further assessment has been requested.'
          : outcome
          : 'Awaiting screening result.',
      },
      {
        title: 'Admission letter',
        state: outcome === 'successful' ? 'done' : 'wait',
        detail: outcome === 'successful'
          ? 'Your admission letter is ready — print it below and bring it on the day of registration.'
          : 'Available only for successful applicants.',
      },
    ];
  }, [payload, submittedAt, paymentVerified, screeningAt, outcome]);

  return <ol className="card divide-y p-0">
    {steps.map((s, i) => (
      <li key={i} className="flex items-start gap-4 p-5">
        <div className={
          'mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-full text-sm font-black ' +
          (s.state === 'done'    ? 'bg-emerald-600 text-white' :
           s.state === 'active'  ? 'bg-amber-500 text-white'   :
                                   'bg-slate-100 text-slate-500')
        }>{s.state === 'done' ? '✓' : i + 1}</div>
        <div className="min-w-0 flex-1">
          <div className="font-black">{s.title}</div>
          <div className="mt-0.5 text-sm text-slate-600">{s.detail}</div>
          {s.extra && <Link href={s.extra.href} className="btn btn-primary mt-3 inline-block" target="_blank">{s.extra.label}</Link>}
        </div>
      </li>
    ))}
  </ol>;
}
