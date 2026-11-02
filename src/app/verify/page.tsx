'use client';
// Public certificate verification. The QR code on every graduation
// certificate opens /verify?ref=<certificate id>; anyone can also type the
// printed certificate number here.
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Result = {
  found: boolean;
  status?: 'issued' | 'revoked' | 'draft';
  certificate_number?: string;
  recipient_name?: string;
  programme_name?: string;
  cohort_name?: string;
  final_term?: string;
  issued_at?: string;
  graduation_year?: number;
  class_name?: string | null;
  teacher_name?: string | null;
  photo_url?: string | null;
};

export default function VerifyPage() {
  return <Suspense fallback={null}><VerifyInner /></Suspense>;
}

function VerifyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const ref = params.get('ref')?.trim() || '';
  const [input, setInput] = useState(ref);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setInput(ref);
    if (!ref) { setResult(null); return; }
    let alive = true;
    setLoading(true); setError('');
    createClient().rpc('amqm_verify_certificate', { p_ref: ref }).then(({ data, error }) => {
      if (!alive) return;
      if (error) setError('Verification is temporarily unavailable. Please try again shortly.');
      else setResult(data as Result);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [ref]);

  const issued = result?.issued_at
    ? new Date(result.issued_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  const valid = result?.found && result.status === 'issued';

  return <main className="min-h-screen bg-[#f7f1e3] px-4 py-10">
    <div className="mx-auto max-w-xl">
      <div className="text-center">
        <img src="/images/branding/amqm-logo-watermark.webp" alt="AMQM logo" className="mx-auto h-20 w-20" />
        <div className="mt-3 text-[11px] font-black uppercase tracking-[.2em] text-emerald-900">Aliyu and Maimuna Center for Qur&apos;anic Memorization</div>
        <h1 className="mt-1 text-2xl font-black text-emerald-950">Certificate Verification</h1>
      </div>

      <form className="mt-6 flex gap-2" onSubmit={e => { e.preventDefault(); const v = input.trim(); router.push(v ? `/verify?ref=${encodeURIComponent(v)}` : '/verify'); }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Certificate number, e.g. AMQM/GRAD/2026/0001"
          className="min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-700" />
        <button className="rounded-xl bg-emerald-900 px-5 py-3 text-sm font-black text-white">Verify</button>
      </form>

      {loading && <div className="mt-6 rounded-2xl bg-white p-8 text-center text-sm text-slate-500">Checking certificate…</div>}
      {error && <div className="mt-6 rounded-2xl bg-rose-50 p-5 text-sm font-bold text-rose-800">{error}</div>}

      {!loading && result && !result.found && (
        <div className="mt-6 rounded-2xl border-2 border-rose-200 bg-white p-6 text-center">
          <div className="text-3xl">✕</div>
          <h2 className="mt-2 text-lg font-black text-rose-800">No certificate found</h2>
          <p className="mt-1 text-sm text-slate-600">This reference does not match any certificate issued by AMQM. Check the number and try again, or contact the school.</p>
        </div>
      )}

      {!loading && result?.found && (
        <div className={`mt-6 overflow-hidden rounded-2xl border-2 bg-white ${valid ? 'border-emerald-300' : 'border-rose-300'}`}>
          <div className={`px-6 py-4 text-center ${valid ? 'bg-emerald-900 text-white' : 'bg-rose-700 text-white'}`}>
            <div className="text-[11px] font-black uppercase tracking-[.2em] opacity-80">{valid ? 'Authentic certificate' : 'Not valid'}</div>
            <div className="mt-1 text-lg font-black">{valid ? '✓ Verified by AMQM' : result.status === 'revoked' ? 'This certificate has been revoked' : 'This certificate has not been issued'}</div>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-4">
              {result.photo_url && <img src={result.photo_url} alt={result.recipient_name} className="h-20 w-20 rounded-full object-cover ring-2 ring-amber-400" />}
              <div>
                <div className="text-xl font-black text-emerald-950">{result.recipient_name}</div>
                <div className="text-sm font-semibold text-amber-800">Hafiz / Huffaz of the Holy Qur&apos;an</div>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              {[
                ['Certificate no.', result.certificate_number],
                ['Date of award', issued],
                ['Cohort', result.cohort_name],
                ['Final term', result.final_term],
                ['Class', result.class_name],
                ['Teacher', result.teacher_name],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-[#faf6ec] p-3">
                  <dt className="text-[10px] font-black uppercase tracking-wide text-amber-800">{k}</dt>
                  <dd className="mt-0.5 font-bold text-emerald-950">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-xs leading-5 text-slate-500">
              Compare these details with the printed certificate. If anything differs, the certificate may have been altered. Contact the school to confirm.
            </p>
          </div>
        </div>
      )}
    </div>
  </main>;
}
