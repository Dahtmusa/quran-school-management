'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Result = {
  success?: boolean; error?: string; message?: string; statusCode?: string; scannedAt?: string;
  person?: { name: string; identifier?: string | null; type: string; photoUrl?: string | null };
};

function qrPayload(raw: string) {
  try {
    const p = JSON.parse(raw);
    if (p?.institution === 'AMQM' && p?.id) return JSON.stringify(p);
  } catch {}
  return null;
}

export default function AttendanceGatePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const busyRef = useRef(false);
  const lastRef = useRef('');
  const [camera, setCamera] = useState(false);
  const [manual, setManual] = useState('');
  const [message, setMessage] = useState('Ready — scan a Student or Staff ID');
  const [result, setResult] = useState<Result | null>(null);

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
    lastRef.current = raw;
    busyRef.current = true;
    setResult(null);
    setMessage('Verifying ID…');
    try {
      const res = await fetch('/api/attendance/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: qrPayload(raw) || raw })
      });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        const time = new Date(data.scannedAt).toLocaleTimeString('en-NG', {
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });
        setMessage((data.statusCode === 'late' ? 'LATE ARRIVAL' : 'ATTENDANCE RECORDED') + ' · ' + time);
      } else setMessage(data.message || data.error || 'ID could not be verified.');
    } catch {
      setMessage('Attendance server unavailable. Check the gate internet connection.');
    } finally {
      busyRef.current = false;
      setTimeout(() => { lastRef.current = ''; }, 1500);
    }
  };

  const startCamera = async () => {
    if (!('BarcodeDetector' in window)) {
      setMessage('Camera scanning is unavailable here. Use the USB scanner or enter the ID number.');
      return;
    }
    try {
      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector({ formats: ['qr_code', 'code_128'] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      scanningRef.current = true;
      setCamera(true);
      setMessage('Point the camera at the QR code or barcode');
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
      setMessage('Camera access failed. Use the USB scanner instead.');
    }
  };

  return (
    <main className="min-h-screen bg-[#eef3f0] text-[#062d2a]">
      <header className="bg-[#062d2a] px-5 py-4 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#e3c36b]">AMQM · Main Gate</div>
            <div className="text-xl font-black">Attendance Scanner</div>
          </div>
          <Link href="/attendance" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold">Attendance Dashboard</Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 lg:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-black/5">
          <div className="bg-[#0a4b40] p-6 text-white">
            <div className="text-xs font-black uppercase tracking-[.18em] text-[#e3c36b]">One gate · two groups</div>
            <h1 className="mt-2 text-3xl font-black">Scan Day Students & Staff</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">Scan the AMQM QR/barcode. The system finds the person by the card number, verifies the correct attendance group, and records the server time.</p>
          </div>
          <div className="p-5">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950">
              {camera ? <video ref={videoRef} className="h-full w-full object-cover" playsInline muted /> :
                <div className="grid h-full place-items-center p-8 text-center text-slate-400"><div><div className="text-5xl">▣</div><div className="mt-3 text-sm font-bold">Gate scanner ready</div></div></div>}
              <div className="pointer-events-none absolute inset-[18%] rounded-3xl border-2 border-[#e3c36b]" />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={camera ? stopCamera : startCamera} className="rounded-xl bg-[#062d2a] px-5 py-3 text-sm font-black text-white">{camera ? 'Stop camera' : 'Camera scanner'}</button>
              <button onClick={() => { setResult(null); setMessage('Ready — scan a Student or Staff ID'); }} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold">Clear</button>
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold">{message}</div>
            {result?.success && <div className="mt-4 flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              {result.person?.photoUrl ? <img src={result.person.photoUrl} className="h-14 w-14 rounded-full object-cover" alt="" /> :
                <div className="grid h-14 w-14 place-items-center rounded-full bg-[#0a4b40] font-black text-white">{result.person?.name?.slice(0, 1)}</div>}
              <div><div className="font-black text-emerald-950">{result.person?.name}</div><div className="text-xs font-bold text-emerald-700">{result.person?.identifier || 'ID'} · {result.statusCode === 'late' ? 'LATE' : 'PRESENT'}</div></div>
            </div>}
          </div>
        </section>
        <aside className="space-y-4">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <div className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">USB scanner / manual</div>
            <h2 className="mt-1 text-lg font-black">Enter or scan the ID number</h2>
            <p className="mt-2 text-xs leading-5 text-slate-500">USB barcode scanners behave like a keyboard. They can type the printed Student Admission No. or Staff ID here and press Enter.</p>
            <input autoFocus value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { record(manual); setManual(''); } }} placeholder="e.g. AMQM/STF/2026/005" className="mt-4 h-12 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-emerald-600" />
            <button onClick={() => { record(manual); setManual(''); }} disabled={!manual.trim()} className="mt-3 w-full rounded-xl bg-[#062d2a] px-4 py-3 text-sm font-black text-white disabled:opacity-40">Record attendance</button>
          </section>
          <section className="rounded-2xl bg-[#fffaf0] p-5 ring-1 ring-amber-100">
            <div className="text-xs font-black uppercase tracking-[.18em] text-amber-700">Attendance rules</div>
            <ul className="mt-3 space-y-3 text-xs leading-5 text-slate-700">
              <li><b>Day students:</b> main-gate scanner.</li>
              <li><b>Boarding students:</b> their assigned teacher's dashboard.</li>
              <li><b>Ordinary staff:</b> main-gate scanner.</li>
              <li><b>Management & Leadership:</b> not included in attendance scanning.</li>
              <li><b>Late:</b> automatically determined from the school morning cutoff.</li>
              <li><b>Duplicate:</b> a second scan on the same morning does not create another attendance record.</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
