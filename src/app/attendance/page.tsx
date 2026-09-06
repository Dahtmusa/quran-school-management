'use client';
import { useEffect, useState, useCallback } from 'react';
import AdminShell from '@/components/AdminShell';
import {
  loadAttendanceSummary, loadTodayRecords, loadPendingRecords,
  AttendanceRecord, AttendanceSummary,
} from '@/lib/attendance-store';

/* ── Small helpers ── */
function Kpi({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, padding: '16px 20px' }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: color || '#062d2a', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function StatusChip({ code, label, color }: { code: string; label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 99,
      fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase',
      background: color + '22', color, border: `1px solid ${color}44`,
    }}>
      {label}
    </span>
  );
}

function ReviewBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    pending:  { label: 'Pending',  bg: '#fef3c7', fg: '#92400e' },
    approved: { label: 'Approved', bg: '#dcfce7', fg: '#166534' },
    rejected: { label: 'Rejected', bg: '#fee2e2', fg: '#991b1b' },
  };
  const s = map[status] || { label: status, bg: '#f3f4f6', fg: '#374151' };
  return (
    <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 10, fontWeight: 800, background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

/* ── Review modal ── */
function ReviewModal({
  record, onClose, onDone,
}: {
  record: AttendanceRecord;
  onClose: () => void;
  onDone: () => void;
}) {
  const [action, setAction] = useState('approve');
  const [newStatus, setNewStatus] = useState(record.statusCode);
  const [note, setNote] = useState(record.note || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const statusOptions = [
    { code: 'present', label: 'Present' },
    { code: 'late',    label: 'Late' },
    { code: 'excused', label: 'Excused' },
    { code: 'sick',    label: 'Sick / Ill' },
    { code: 'absent',  label: 'Absent' },
  ];

  const submit = async () => {
    setSaving(true); setErr('');
    const body: Record<string, unknown> = { recordId: record.id, action, note: note || undefined };
    if (action === 'change_status') {
      body.newStatusCode = newStatus;
      body.newReviewStatus = 'approved';
    }
    const res = await fetch('/api/attendance/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) { setErr(d.error || 'Failed'); return; }
    onDone();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 440, padding: '24px 28px' }}>
        <div style={{ fontWeight: 900, fontSize: 17, color: '#062d2a', marginBottom: 4 }}>Review Attendance</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
          {record.personName} · {record.attendanceDate} · {new Date(record.scannedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 6 }}>Action</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { v: 'approve',       l: 'Approve' },
              { v: 'reject',        l: 'Reject' },
              { v: 'change_status', l: 'Change Status' },
            ].map(o => (
              <button key={o.v} onClick={() => setAction(o.v)} style={{
                padding: '7px 16px', borderRadius: 10, border: '1.5px solid', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: action === o.v ? '#062d2a' : '#fff',
                color: action === o.v ? '#fff' : '#374151',
                borderColor: action === o.v ? '#062d2a' : '#e5e7eb',
              }}>{o.l}</button>
            ))}
          </div>
        </div>

        {action === 'change_status' && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 6 }}>New Status</label>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
              style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit' }}>
              {statusOptions.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 6 }}>Note (optional)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' }} />
        </div>

        {err && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving} style={{
            padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: '#062d2a', color: '#fff', fontSize: 13, fontWeight: 700,
            opacity: saving ? 0.6 : 1,
          }}>
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Record Row ── */
function RecordRow({ record, onReview }: { record: AttendanceRecord; onReview: (r: AttendanceRecord) => void }) {
  const scanTime = new Date(record.scannedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto auto auto',
      alignItems: 'center', gap: 12, padding: '11px 18px',
      borderBottom: '1px solid #f9fafb',
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>{record.personName}</div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
          {record.personAdmissionNo && `${record.personAdmissionNo} · `}{scanTime}
          {record.isOfflineScan && <span style={{ marginLeft: 5, color: '#d97706' }}>· offline sync</span>}
        </div>
      </div>
      <StatusChip code={record.statusCode} label={record.statusLabel} color={record.statusColor} />
      <ReviewBadge status={record.reviewStatus} />
      {record.reviewStatus === 'pending' && (
        <button onClick={() => onReview(record)} style={{
          padding: '5px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb',
          background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#374151',
          whiteSpace: 'nowrap',
        }}>
          Review
        </button>
      )}
      {record.reviewStatus !== 'pending' && <div />}
    </div>
  );
}

type Tab = 'overview' | 'pending' | 'today' | 'reports' | 'settings';

/* ── SMS Settings panel ── */
function SmsSettings() {
  const PROVIDERS = [
    { value: 'termii',          label: 'Termii (recommended for Nigeria)' },
    { value: 'africas_talking', label: "Africa's Talking" },
    { value: 'twilio',          label: 'Twilio' },
  ];
  const STATUS_OPTIONS = ['present','late','excused','sick','absent'];

  const [settings, setSettings] = useState<Record<string, string>>({
    sms_enabled: 'false', sms_provider: 'termii', sms_api_key: '',
    sms_sender_id: 'AMQM', sms_channel: 'generic',
    sms_account_sid: '', sms_auth_token: '', sms_username: '',
  });
  const [sendOn, setSendOn] = useState<string[]>(['absent','late']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    fetch('/api/attendance/settings').then(r => r.json()).then(d => {
      if (d.settings) {
        setSettings(prev => ({ ...prev, ...d.settings }));
        try { setSendOn(JSON.parse(d.settings.sms_send_on_status || '["absent","late"]')); } catch {}
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = { ...settings, sms_send_on_status: JSON.stringify(sendOn) };
    const res = await fetch('/api/attendance/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: payload }),
    });
    const d = await res.json();
    setSaving(false);
    setFlash(d.success ? 'Settings saved' : (d.error || 'Failed'));
    if (d.success) setTimeout(() => setFlash(''), 3000);
  };

  const set = (key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value }));
  const IS = { width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' as const };
  const LS = { display: 'block' as const, fontSize: 10, fontWeight: 800 as const, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: '#9ca3af', marginBottom: 5 };

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Loading…</div>;

  const provider = settings.sms_provider;

  return (
    <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, padding: '24px 28px' }} className="space-y-5">
      <div style={{ fontWeight: 900, fontSize: 15, color: '#062d2a' }}>SMS Notification Settings</div>

      {flash && <div style={{ padding: '9px 14px', borderRadius: 10, background: flash === 'Settings saved' ? '#dcfce7' : '#fee2e2', color: flash === 'Settings saved' ? '#166534' : '#991b1b', fontWeight: 700, fontSize: 13 }}>{flash}</div>}

      {/* Enable toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => set('sms_enabled', settings.sms_enabled === 'true' ? 'false' : 'true')} style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative',
          background: settings.sms_enabled === 'true' ? '#16a34a' : '#d1d5db', transition: 'background .2s',
        }}>
          <div style={{ position: 'absolute', top: 3, left: settings.sms_enabled === 'true' ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
          SMS notifications are {settings.sms_enabled === 'true' ? 'enabled' : 'disabled'}
        </span>
      </div>

      {/* Provider */}
      <div><label style={LS}>SMS Provider</label>
        <select value={provider} onChange={e => set('sms_provider', e.target.value)} style={IS}>
          {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {/* Sender ID */}
      <div><label style={LS}>Sender ID</label>
        <input value={settings.sms_sender_id} onChange={e => set('sms_sender_id', e.target.value)} style={IS} placeholder="e.g. AMQM" />
      </div>

      {/* Provider-specific fields */}
      {provider === 'termii' && <>
        <div><label style={LS}>Termii API Key</label><input value={settings.sms_api_key} onChange={e => set('sms_api_key', e.target.value)} style={IS} type="password" autoComplete="off" /></div>
        <div><label style={LS}>Channel</label>
          <select value={settings.sms_channel} onChange={e => set('sms_channel', e.target.value)} style={IS}>
            <option value="generic">Generic</option>
            <option value="dnd">DND (bypasses do-not-disturb)</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
      </>}

      {provider === 'africas_talking' && <>
        <div><label style={LS}>API Key</label><input value={settings.sms_api_key} onChange={e => set('sms_api_key', e.target.value)} style={IS} type="password" autoComplete="off" /></div>
        <div><label style={LS}>Username</label><input value={settings.sms_username} onChange={e => set('sms_username', e.target.value)} style={IS} /></div>
      </>}

      {provider === 'twilio' && <>
        <div><label style={LS}>Account SID</label><input value={settings.sms_account_sid} onChange={e => set('sms_account_sid', e.target.value)} style={IS} /></div>
        <div><label style={LS}>Auth Token</label><input value={settings.sms_auth_token} onChange={e => set('sms_auth_token', e.target.value)} style={IS} type="password" autoComplete="off" /></div>
      </>}

      {/* Which statuses trigger SMS */}
      <div>
        <label style={LS}>Send SMS when status is</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map(s => {
            const on = sendOn.includes(s);
            return (
              <button key={s} onClick={() => setSendOn(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                style={{ padding: '6px 14px', borderRadius: 99, border: '1.5px solid', cursor: 'pointer', fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
                  background: on ? '#062d2a' : '#fff', color: on ? '#fff' : '#6b7280', borderColor: on ? '#062d2a' : '#e5e7eb' }}>
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ paddingTop: 4 }}>
        <button onClick={save} disabled={saving} style={{ padding: '10px 24px', borderRadius: 11, border: 'none', background: '#062d2a', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

export default function AttendanceDashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [pendingRecords, setPendingRecords] = useState<AttendanceRecord[]>([]);
  const [reviewTarget, setReviewTarget] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterSection, setFilterSection] = useState('all');
  const [searchQ, setSearchQ] = useState('');
  const [flash, setFlash] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const [sum, today, pending] = await Promise.all([
      loadAttendanceSummary(filterDate),
      loadTodayRecords(filterDate),
      loadPendingRecords(),
    ]);
    setSummary(sum);
    setTodayRecords(today);
    setPendingRecords(pending);
    setLoading(false);
  }, [filterDate]);

  useEffect(() => { refresh(); }, [refresh]);

  const showFlash = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(''), 3500); };

  const onReviewDone = () => {
    setReviewTarget(null);
    showFlash('Record updated');
    refresh();
  };

  const filteredToday = todayRecords.filter(r => {
    if (filterSection !== 'all' && r.personType !== filterSection && r.personType !== 'student') return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      if (!r.personName.toLowerCase().includes(q) && !(r.personAdmissionNo || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const todayStr = new Date(filterDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview',  label: 'Overview' },
    { key: 'pending',   label: 'Pending Review', badge: pendingRecords.length },
    { key: 'today',     label: 'All Records' },
    { key: 'reports',   label: 'Reports' },
    { key: 'settings',  label: 'SMS Settings' },
  ];

  return (
    <AdminShell title="Attendance">
      <div className="space-y-5">

        {/* Review modal */}
        {reviewTarget && (
          <ReviewModal record={reviewTarget} onClose={() => setReviewTarget(null)} onDone={onReviewDone} />
        )}

        {/* Flash */}
        {flash && (
          <div style={{ padding: '10px 18px', borderRadius: 12, background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: 14 }}>
            {flash}
          </div>
        )}

        {/* Hero */}
        <div style={{
          background: 'linear-gradient(135deg, #062d2a 0%, #0f4a45 100%)',
          borderRadius: 20, padding: '22px 28px', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.2em', textTransform: 'uppercase', color: '#C9A84C', marginBottom: 4 }}>
              Admin — Attendance
            </div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{todayStr}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              style={{ border: 'none', borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,.15)', color: '#fff' }}
            />
            <button onClick={refresh} style={{
              padding: '7px 16px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.18)',
              color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              Refresh
            </button>
          </div>
        </div>

        {/* KPI row */}
        {summary && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 12 }}>
            <Kpi label="Total Scanned" value={summary.total} />
            <Kpi label="Present"  value={summary.present}  color="#16a34a" />
            <Kpi label="Late"     value={summary.late}     color="#d97706" />
            <Kpi label="Excused"  value={summary.excused}  color="#2563eb" />
            <Kpi label="Sick"     value={summary.sick}     color="#7c3aed" />
            <Kpi label="Absent"   value={summary.absent}   color="#dc2626" />
            <Kpi label="Pending Review" value={summary.pending} color={summary.pending > 0 ? '#d97706' : '#9ca3af'} />
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #f3f4f6', flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              color: tab === t.key ? '#062d2a' : '#9ca3af',
              borderBottom: tab === t.key ? '2px solid #062d2a' : '2px solid transparent',
              marginBottom: -2, display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span style={{ background: '#dc2626', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 900, padding: '1px 6px' }}>{t.badge}</span>
              )}
            </button>
          ))}
        </div>

        {loading && <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>}

        {/* Overview tab */}
        {!loading && tab === 'overview' && (
          <div className="space-y-4">
            {pendingRecords.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 16, padding: '14px 18px' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#92400e', marginBottom: 4 }}>
                  {pendingRecords.length} record{pendingRecords.length !== 1 ? 's' : ''} awaiting review
                </div>
                <div style={{ fontSize: 12, color: '#b45309' }}>
                  Review and approve or reject attendance records scanned by security.
                </div>
                <button onClick={() => setTab('pending')} style={{
                  marginTop: 10, padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: '#92400e', color: '#fff', fontSize: 12, fontWeight: 700,
                }}>
                  Review now →
                </button>
              </div>
            )}

            {summary && summary.total === 0 && (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                No scans recorded for {filterDate}.
              </div>
            )}

            {summary && summary.total > 0 && (
              <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', fontWeight: 800, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280' }}>
                  Today's breakdown
                </div>
                {[
                  { label: 'Present',  value: summary.present,  color: '#16a34a' },
                  { label: 'Late',     value: summary.late,     color: '#d97706' },
                  { label: 'Excused',  value: summary.excused,  color: '#2563eb' },
                  { label: 'Sick',     value: summary.sick,     color: '#7c3aed' },
                  { label: 'Absent',   value: summary.absent,   color: '#dc2626' },
                ].map(row => (
                  <div key={row.label} style={{ padding: '10px 18px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#374151' }}>{row.label}</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: row.value > 0 ? row.color : '#d1d5db' }}>{row.value}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', width: 36, textAlign: 'right' }}>
                      {summary.total > 0 ? Math.round((row.value / summary.total) * 100) : 0}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pending tab */}
        {!loading && tab === 'pending' && (
          <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
            {pendingRecords.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                No records pending review.
              </div>
            ) : (
              <>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', fontWeight: 800, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280' }}>
                  {pendingRecords.length} pending
                </div>
                {pendingRecords.map(r => (
                  <RecordRow key={r.id} record={r} onReview={setReviewTarget} />
                ))}
              </>
            )}
          </div>
        )}

        {/* All records tab */}
        {!loading && tab === 'today' && (
          <div className="space-y-3">
            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search by name or ID…"
                style={{ flex: 1, minWidth: 180, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit' }}
              />
              <select value={filterSection} onChange={e => setFilterSection(e.target.value)}
                style={{ border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit' }}>
                <option value="all">All types</option>
                <option value="student">Students only</option>
                <option value="staff">Staff only</option>
              </select>
            </div>

            <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
              {filteredToday.length === 0 ? (
                <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                  No records match the current filters.
                </div>
              ) : (
                <>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', fontWeight: 800, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280' }}>
                    {filteredToday.length} record{filteredToday.length !== 1 ? 's' : ''}
                  </div>
                  <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                    {filteredToday.map(r => (
                      <RecordRow key={r.id} record={r} onReview={setReviewTarget} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Reports tab */}
        {!loading && tab === 'reports' && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
            <div style={{ fontWeight: 700, color: '#374151', marginBottom: 6 }}>Reports — coming soon</div>
            <div style={{ fontSize: 13 }}>Daily, weekly, monthly, and term summaries will appear here once enough data has been collected.</div>
          </div>
        )}

        {tab === 'settings' && <SmsSettings />}
      </div>
    </AdminShell>
  );
}
