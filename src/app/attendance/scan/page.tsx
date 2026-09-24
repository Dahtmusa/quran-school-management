'use client';

// Main-gate scanner. Camera-based QR/barcode detection when the browser
// supports BarcodeDetector; otherwise the USB scanner types into the input
// (they behave as keyboards).

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { attendanceApi, subscribeToAttendance, type RecentScanRow } from '@/lib/attendance/api';

type ScanResult = Awaited<ReturnType<typeof attendanceApi.gateScan>> & { time?: string };

const STATUS_PILL: Record<string, string> = {
  present: 'bg-emerald-100 text-emerald-800',
  late:    'bg-amber-100 text-amber-800',
  absent:  'bg-rose-100 text-rose-800',
  excused: 'bg-sky-100 text-sky-800',
  sick:    'bg-violet-100 text-violet-800',
};
const fmtClock = (iso: string) => new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: true,
}).format(new Date(iso));

export default function GateScannerPage() {
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const busyRef   = useRef(false);
  const lastRef   = useRef('');
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState('');
  const [message, setMessage] = useState('Ready — scan an AMQM Student or Staff ID.');
  const [result,  setResult]  = useState<ScanResult | null>(null);
  const [recent,  setRecent]  = useState<RecentScanRow[]>([]);

  const todayLagos = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const loadRecent = useCallback(async () => {
    try { setRecent((await attendanceApi.recentScans(10)).rows); } catch {}
  }, []);
  useEffect(() => { loadRecent(); }, [loadRecent]);
  useEffect(() => subscribeToAttendance(todayLagos, loadRecent), [todayLagos, loadRecent]);

  const stopCamera = () => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamera(false);
  };
  useEffect(() => () => stopCamera(), []);

  const record = async (value: string) => {
    const raw = value.trim();
    if (!raw || busyRef.current || raw === lastRef.current) return;
    lastRef.current = raw; busyRef.current = true;
    setResult(null); setMessage('Verifying ID…');
    try {
      const data = await attendanceApi.gateScan(raw);
      const time = new Intl.DateTimeFormat('en-NG', {
        timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
      }).format(new Date(data.scannedAt));
      setResult({ ...data, time });
      setMessage((data.statusCode === 'late' ? 'LATE ARRIVAL' : 'ATTENDANCE RECORDED') + ' · ' + time);
    } catch (e: any) {
      setMessage(e?.message || 'ID could not be verified.');
    } finally {
      busyRef.current = false;
      setTimeout(() => { lastRef.current = ''; }, 1500);
    }
  };

  const startCamera = async () => {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
      setMessage('Camera scanning is unavailable in this browser. Use the USB scanner or type the ID.');
      return;
    }
    try {
      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13'] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      scanningRef.current = true;
      setCamera(true);
      setMessage('Point the camera at the QR code or barcode.');
      const loop = async () => {
        if (!scanningRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes?.[0]?.rawValue;
          if (value) await record(value);
        } catch {}
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch {
      setMessage('Camera access denied. Use the USB scanner instead.');
    }
  };

  return <main className="min-h-screen bg-[#eef3f0] text-[#062d2a]">
    <header className="bg-[#062d2a] px-5 py-4 text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#e3c36b]">AMQM · Main Gate</div>
          <div className="text-xl font-black">Attendance Scanner</div>
        </div>
        <Link href="/attendance" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold">Dashboard</Link>
      </div>
    </header>
    <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 lg:grid-cols-[1fr_360px]">
      <section className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-black/5">
        <div className="bg-[#0a4b40] p-6 text-white">
          <div className="text-xs font-black uppercase tracking-[.18em] text-[#e3c36b]">One gate · two groups</div>
          <h1 className="mt-2 text-3xl font-black">Scan Day Students &amp; Staff</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">
            The scanner reads the AMQM QR/barcode. The system verifies the person, applies the morning cutoff, and records the exact server time. Records reach the admin dashboard live.
          </p>
        </div>
        <div className="p-5">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">
            {camera
              ? <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
              : <div className="grid h-full place-items-center p-8 text-center text-slate-400">
                  <div><div className="text-5xl">▣</div><div className="mt-3 text-sm font-bold">Gate scanner ready</div></div>
                </div>}
            <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-2 border-[#e3c36b]" />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={camera ? stopCamera : startCamera} className="rounded-xl bg-[#062d2a] px-5 py-3 text-sm font-black text-white">
              {camera ? 'Stop camera' : 'Camera scanner'}
            </button>
            <button onClick={() => { setResult(null); setMessage('Ready — scan an AMQM Student or Staff ID.'); }}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold">Clear</button>
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold">{message}</div>
          {result?.success && (
            <div className="mt-4 flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              {result.person?.photoUrl
                ? <img src={result.person.photoUrl} className="h-14 w-14 rounded-full object-cover" alt="" />
                : <div className="grid h-14 w-14 place-items-center rounded-full bg-[#0a4b40] font-black text-white">{result.person?.name?.slice(0,1)}</div>}
              <div>
                <div className="font-black text-emerald-950">{result.person?.name}</div>
                <div className="text-xs font-bold text-emerald-700">
                  {result.person?.identifier || 'ID'} · {result.statusCode?.toUpperCase()} · {result.time}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
      <aside className="space-y-4">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <div className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">USB scanner / manual</div>
          <h2 className="mt-1 text-lg font-black">Scan or type the ID</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">USB barcode scanners behave like keyboards. They type the printed Admission No or Staff ID here and press Enter.</p>
          <input autoFocus value={manual} onChange={e => setManual(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { record(manual); setManual(''); } }}
            placeholder="e.g. AMQM/STF/2026/005"
            className="mt-4 h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-600" />
          <button onClick={() => { record(manual); setManual(''); }} disabled={!manual.trim()}
            className="mt-3 w-full rounded-xl bg-[#062d2a] px-4 py-3 text-sm font-black text-white disabled:opacity-40">
            Record attendance
          </button>
        </section>
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">Recent scans today</div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">● Live</span>
          </div>
          {recent.length === 0 ? (
            <div className="mt-3 text-xs text-slate-400">No scans yet today.</div>
          ) : (
            <ul className="mt-3 space-y-2">
              {recent.map(r => (
                <li key={r.id} className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black">{r.full_name}</div>
                    <div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {r.identifier || '—'} · {r.person_type === 'staff' ? (r.role_or_class || 'Staff') : (r.section === 'boarding' ? 'Boarding' : 'Day')}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={'rounded-full px-2 py-0.5 text-[9px] font-black uppercase ' + (STATUS_PILL[r.status_code] || 'bg-slate-100 text-slate-600')}>{r.status_code}</span>
                    <span className="text-[10px] font-bold text-slate-500">{fmtClock(r.scanned_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl bg-[#fffaf0] p-5 ring-1 ring-amber-100">
          <div className="text-xs font-black uppercase tracking-[.18em] text-amber-700">Gate rules</div>
          <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-700">
            <li><b>Day students</b> and <b>ordinary staff</b> scan here.</li>
            <li><b>Boarding students</b> are marked by their assigned teacher.</li>
            <li><b>Management / leadership</b> are excluded from attendance scanning.</li>
            <li><b>Late</b> is determined by the morning cutoff (Settings).</li>
            <li>A second scan the same morning does not create a duplicate record.</li>
          </ul>
        </section>
      </aside>
    </div>
  </main>;
}
