'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import AdminShell from '@/components/AdminShell';
import { loadScanPoints, AttendanceScanPoint } from '@/lib/attendance-store';

/* ── Types ── */
type Person = {
  type: 'student' | 'staff';
  id: string;
  name: string;
  admissionNo?: string | null;
  section?: string;
  className?: string | null;
  photoUrl?: string | null;
  role?: string;
};

type ScanResult = {
  id: string;
  name: string;
  personType: 'student' | 'staff';
  statusCode: string;
  scannedAt: string;
  isOffline: boolean;
};

type OfflineScan = {
  personId: string;
  personType: 'student' | 'staff';
  personName: string;
  period: string;
  clientScannedAt: string;
};

const QUEUE_KEY = 'amqm_offline_scan_queue';

function loadQueue(): OfflineScan[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveQueue(q: OfflineScan[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
}

/* ── Status badge ── */
function StatusPill({ code }: { code: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    present: { label: 'Present', bg: '#dcfce7', fg: '#166534' },
    late:    { label: 'Late',    bg: '#fef3c7', fg: '#92400e' },
  };
  const s = map[code] || { label: code, bg: '#f3f4f6', fg: '#374151' };
  return (
    <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 800,
      background: s.bg, color: s.fg, letterSpacing: '.04em', textTransform: 'uppercase' }}>
      {s.label}
    </span>
  );
}

export default function SecurityScanner() {
  const [scanPoints, setScanPoints] = useState<AttendanceScanPoint[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<string>('');
  const [period, setPeriod] = useState('morning');
  const [cameraOn, setCameraOn] = useState(false);
  const [manualId, setManualId] = useState('');
  const [preview, setPreview] = useState<Person | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineQueue, setOfflineQueue] = useState<OfflineScan[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [personLoading, setPersonLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanned = useRef<string>('');
  const scanCooldown = useRef(false);

  useEffect(() => {
    loadScanPoints().then(pts => {
      setScanPoints(pts);
      if (pts.length > 0) setSelectedPoint(pts[0].id);
    });
    setOfflineQueue(loadQueue());
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  // Auto-sync queue when coming online
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) syncQueue();
  }, [isOnline]);

  function showFlash(msg: string, ok = true) {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 4000);
  }

  const lookupPerson = useCallback(async (raw: string): Promise<Person | null> => {
    const q = raw.trim();
    if (!q) return null;
    const res = await fetch(`/api/attendance/lookup?q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    return res.json();
  }, []);

  const submitScan = useCallback(async (person: Person) => {
    if (scanCooldown.current) return;
    scanCooldown.current = true;
    setTimeout(() => { scanCooldown.current = false; }, 2500);

    const clientScannedAt = new Date().toISOString();

    if (!isOnline) {
      // Queue for later
      const scan: OfflineScan = {
        personId: person.id,
        personType: person.type,
        personName: person.name,
        period,
        clientScannedAt,
      };
      const q = [...loadQueue(), scan];
      saveQueue(q);
      setOfflineQueue(q);
      setScans(prev => [{
        id: clientScannedAt, name: person.name, personType: person.type,
        statusCode: 'present', scannedAt: clientScannedAt, isOffline: true,
      }, ...prev]);
      setPreview(null);
      setManualId('');
      showFlash(`Queued offline: ${person.name}`, true);
      return;
    }

    const res = await fetch('/api/attendance/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personId: person.id,
        personType: person.type,
        period,
        scanPointId: selectedPoint || null,
        isOfflineScan: false,
      }),
    });
    const data = await res.json();

    if (data.error === 'duplicate') {
      const t = new Date(data.firstScanTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      showFlash(`Already scanned at ${t}`, false);
      setPreview(null);
      setManualId('');
      return;
    }

    if (!data.success) {
      showFlash(data.error || 'Scan failed', false);
      return;
    }

    setScans(prev => [{
      id: data.recordId, name: person.name, personType: person.type,
      statusCode: data.statusCode, scannedAt: data.scannedAt, isOffline: false,
    }, ...prev.slice(0, 49)]);
    setPreview(null);
    setManualId('');
    showFlash(`✓ ${person.name} — ${data.statusCode}`, true);
  }, [isOnline, period, selectedPoint]);

  const handleQr = useCallback(async (raw: string) => {
    if (raw === lastScanned.current || scanCooldown.current) return;
    lastScanned.current = raw;
    setPersonLoading(true);
    const person = await lookupPerson(raw);
    setPersonLoading(false);
    if (!person) { showFlash('ID not recognised', false); return; }
    await submitScan(person);
  }, [lookupPerson, submitScan]);

  // Camera
  const startCamera = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      streamRef.current = media;
      setCameraOn(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = media; }, 50);
    } catch {
      showFlash('Camera access denied — use manual entry', false);
    }
  };
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    lastScanned.current = '';
  };
  useEffect(() => () => stopCamera(), []);

  useEffect(() => {
    if (!cameraOn || !videoRef.current) return;
    const v = videoRef.current;
    const BD = (window as any).BarcodeDetector as (new (o?: any) => { detect(el: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> }) | undefined;
    if (!BD) return;
    const detector = new BD({ formats: ['qr_code', 'code_128', 'ean_13'] });
    let timer: number;
    const scan = async () => {
      if (v.readyState >= 2) {
        try {
          const found = await detector.detect(v);
          const val = found[0]?.rawValue;
          if (val) await handleQr(val);
        } catch {}
      }
      timer = window.setTimeout(scan, 600);
    };
    scan();
    return () => clearTimeout(timer);
  }, [cameraOn, handleQr]);

  const handleManualLookup = async () => {
    if (!manualId.trim()) return;
    setPreviewLoading(true);
    const person = await lookupPerson(manualId);
    setPreviewLoading(false);
    if (!person) { showFlash('ID not found', false); return; }
    setPreview(person);
  };

  const syncQueue = async () => {
    const q = loadQueue();
    if (!q.length || syncing) return;
    setSyncing(true);
    let succeeded = 0;
    const remaining: OfflineScan[] = [];
    for (const scan of q) {
      const res = await fetch('/api/attendance/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personId: scan.personId,
          personType: scan.personType,
          period: scan.period,
          isOfflineScan: true,
          clientScannedAt: scan.clientScannedAt,
        }),
      });
      const d = await res.json();
      if (d.success || d.error === 'duplicate') {
        succeeded++;
      } else {
        remaining.push(scan);
      }
    }
    saveQueue(remaining);
    setOfflineQueue(remaining);
    setSyncing(false);
    showFlash(`Synced ${succeeded} offline scan${succeeded !== 1 ? 's' : ''}`, true);
  };

  const todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <AdminShell title="Security — Attendance Scanner">
      <div style={{ maxWidth: 640, margin: '0 auto' }} className="space-y-4">

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #062d2a 0%, #0f4a45 100%)',
          borderRadius: 20, padding: '20px 24px', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.2em', textTransform: 'uppercase', color: '#C9A84C', marginBottom: 4 }}>
              Security — Scanner
            </div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{todayStr}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 800,
              background: isOnline ? '#dcfce7' : '#fee2e2',
              color: isOnline ? '#166534' : '#991b1b',
            }}>
              {isOnline ? '● Online' : '○ Offline'}
            </span>
            {offlineQueue.length > 0 && (
              <button
                onClick={syncQueue}
                disabled={!isOnline || syncing}
                style={{
                  padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 800,
                  background: '#fef3c7', color: '#92400e', border: 'none', cursor: 'pointer',
                }}
              >
                {syncing ? 'Syncing…' : `Sync ${offlineQueue.length}`}
              </button>
            )}
          </div>
        </div>

        {/* Flash */}
        {flash && (
          <div style={{
            padding: '10px 18px', borderRadius: 12, fontWeight: 700, fontSize: 14,
            background: flash.ok ? '#dcfce7' : '#fee2e2',
            color: flash.ok ? '#166534' : '#991b1b',
            border: `1px solid ${flash.ok ? '#86efac' : '#fca5a5'}`,
          }}>
            {flash.msg}
          </div>
        )}

        {/* Config row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 5 }}>
              Scan Point
            </label>
            <select
              value={selectedPoint}
              onChange={e => setSelectedPoint(e.target.value)}
              style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600, background: '#fff' }}
            >
              {scanPoints.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              {!scanPoints.length && <option value="">Main Gate</option>}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 5 }}>
              Period
            </label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontWeight: 600, background: '#fff' }}
            >
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
          </div>
        </div>

        {/* Camera */}
        <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 20, overflow: 'hidden' }}>
          {cameraOn ? (
            <div style={{ position: 'relative' }}>
              <video ref={videoRef} autoPlay playsInline muted
                style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block', background: '#000' }} />
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{ width: 180, height: 180, border: '2px solid #C9A84C', borderRadius: 16, opacity: .8 }} />
              </div>
              {personLoading && (
                <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center' }}>
                  <span style={{ background: 'rgba(0,0,0,.7)', color: '#fff', padding: '4px 14px', borderRadius: 99, fontSize: 12 }}>Looking up…</span>
                </div>
              )}
              <button onClick={stopCamera} style={{
                position: 'absolute', top: 10, right: 10,
                background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none',
                borderRadius: 99, padding: '5px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              }}>
                Stop
              </button>
            </div>
          ) : (
            <button onClick={startCamera} style={{
              width: '100%', padding: '28px 0', border: 'none', background: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#062d2a" strokeWidth="1.6" width={36} height={36}>
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#062d2a' }}>Tap to start camera / QR scan</span>
            </button>
          )}
        </div>

        {/* Manual entry */}
        <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 10 }}>
            Manual Entry
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={manualId}
              onChange={e => { setManualId(e.target.value); setPreview(null); }}
              onKeyDown={e => e.key === 'Enter' && handleManualLookup()}
              placeholder="Admission no. or student ID"
              style={{ flex: 1, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 13px', fontSize: 13, fontFamily: 'inherit' }}
            />
            <button
              onClick={handleManualLookup}
              disabled={previewLoading || !manualId.trim()}
              style={{
                padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: '#062d2a', color: '#fff', fontSize: 13, fontWeight: 700,
                opacity: (!manualId.trim() || previewLoading) ? 0.5 : 1,
              }}
            >
              {previewLoading ? '…' : 'Look up'}
            </button>
          </div>

          {/* Person preview */}
          {preview && (
            <div style={{
              marginTop: 12, padding: '14px 16px', borderRadius: 12,
              background: '#f0fdf4', border: '1.5px solid #86efac',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              {preview.photoUrl
                ? <img src={preview.photoUrl} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#062d2a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A84C', fontWeight: 900, fontSize: 18, flexShrink: 0 }}>{preview.name.charAt(0)}</div>
              }
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#062d2a' }}>{preview.name}</div>
                <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>
                  {preview.type === 'student'
                    ? `${preview.admissionNo || ''} · ${preview.className || preview.section || ''}`
                    : preview.role || 'Staff'
                  }
                </div>
              </div>
              <button
                onClick={() => submitScan(preview)}
                style={{
                  padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 800,
                }}
              >
                Confirm Scan
              </button>
            </div>
          )}
        </div>

        {/* Today's scans */}
        {scans.length > 0 && (
          <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280' }}>
                This Session — {scans.length} scanned
              </span>
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {scans.map(s => (
                <div key={s.id} style={{ padding: '10px 18px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: '#f3f4f6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, color: '#062d2a', flexShrink: 0,
                  }}>
                    {s.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      {new Date(s.scannedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      {s.isOffline && <span style={{ marginLeft: 6, color: '#d97706' }}>· offline</span>}
                    </div>
                  </div>
                  <StatusPill code={s.statusCode} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
