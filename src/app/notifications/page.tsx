'use client';

// Admin notifications hub. Four tabs:
//   1. Fee reminders  (SMS to parents with outstanding balance baked in)
//   2. SMS to parents (free compose, pick recipients)
//   3. SMS to teachers (free compose, pick recipients)
//   4. In-app to teachers (title + body + link; shows up in bell)

import AdminShell from '@/components/AdminShell';
import { createClient } from '@/lib/supabase/client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Tab = 'fee' | 'sms_parents' | 'sms_teachers' | 'inapp';

type Student = { id: string; full_name: string; admission_no: string; section: string; parent_name: string | null; parent_phone: string | null; guardian_phone: string | null };
type Outstanding = { student_id: string; full_name: string; admission_no: string; section: string; class_name: string | null; parent_name: string | null; parent_phone: string | null; outstanding_ngn: number };
type Teacher = { id: string; full_name: string; role: string; phone: string | null };

const NGN = (n: number) => '₦' + Number(n || 0).toLocaleString('en-NG');

export default function NotificationsHub() {
  const [tab, setTab] = useState<Tab>('fee');
  const [banner, setBanner] = useState('');
  const [error, setError]   = useState('');

  return <AdminShell title="Notifications">
    <div className="space-y-5">
      <section className="rounded-[2rem] bg-[#062d2a] p-6 text-white">
        <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#e3c36b]">AMQM</div>
        <h1 className="mt-2 text-3xl font-black">Notifications hub</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">
          Send fee reminders to parents with each child's outstanding balance baked in, compose custom SMS to parents or teachers, or push an in-app notification to teachers.
        </p>
      </section>

      <div className="grid gap-2 md:grid-cols-4">
        <TabButton active={tab==='fee'} onClick={() => setTab('fee')} label="Fee reminders" sub="SMS parents · balance baked in" />
        <TabButton active={tab==='sms_parents'} onClick={() => setTab('sms_parents')} label="SMS parents" sub="Custom message" />
        <TabButton active={tab==='sms_teachers'} onClick={() => setTab('sms_teachers')} label="SMS teachers" sub="Custom message" />
        <TabButton active={tab==='inapp'} onClick={() => setTab('inapp')} label="In-app → teachers" sub="Shows in their bell" />
      </div>

      {banner && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{banner}</div>}
      {error  && <div className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}

      {tab === 'fee'         && <FeeRemindersPanel  onBanner={setBanner} onError={setError} />}
      {tab === 'sms_parents' && <SmsParentsPanel    onBanner={setBanner} onError={setError} />}
      {tab === 'sms_teachers'&& <SmsTeachersPanel   onBanner={setBanner} onError={setError} />}
      {tab === 'inapp'       && <InAppTeachersPanel onBanner={setBanner} onError={setError} />}
    </div>
  </AdminShell>;
}

function TabButton({ active, onClick, label, sub }: { active: boolean; onClick: () => void; label: string; sub: string }) {
  return <button onClick={onClick}
    className={'rounded-2xl border p-4 text-left ' + (active ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50')}>
    <div className="text-sm font-black">{label}</div>
    <div className="mt-1 text-xs text-slate-500">{sub}</div>
  </button>;
}

// -- Fee reminders -----------------------------------------------------
function FeeRemindersPanel({ onBanner, onError }: { onBanner: (m: string) => void; onError: (m: string) => void }) {
  const [rows, setRows] = useState<Outstanding[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState<'all'|'day'|'boarding'>('all');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await createClient().rpc('admin_students_with_outstanding_fees');
      if (error) throw error;
      setRows((data as any[]) || []);
    } catch (e: any) { onError(e?.message || 'Could not load outstanding fees.'); }
    finally { setLoading(false); }
  }, [onError]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter(r => {
    if (sectionFilter !== 'all' && r.section !== sectionFilter) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return [r.full_name, r.admission_no, r.parent_name, r.class_name].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
  }), [rows, search, sectionFilter]);

  const selectedIds = Array.from(selected);
  const selectedTotal = filtered.reduce((n, r) => selected.has(r.student_id) ? n + Number(r.outstanding_ngn || 0) : n, 0);

  const sendNow = async () => {
    if (selectedIds.length === 0) { onError('Pick at least one student.'); return; }
    if (!confirm(`Send fee-reminder SMS to ${selectedIds.length} parent${selectedIds.length === 1 ? '' : 's'}?`)) return;
    setBusy(true); onError('');
    try {
      const res = await fetch('/api/notifications/fee-reminders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: selectedIds }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Fee reminder failed.');
      onBanner(`Fee reminders — sent ${body.sent}, failed ${body.failed}, skipped ${body.skipped_no_phone + body.skipped_no_balance}.`);
      setSelected(new Set());
    } catch (e: any) { onError(e?.message || 'Could not send fee reminders.'); }
    finally { setBusy(false); }
  };

  return <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-xs font-black uppercase tracking-wide text-slate-500">Students with outstanding fees</div>
        <div className="mt-1 text-lg font-black">{rows.length} student{rows.length === 1 ? '' : 's'} · {NGN(rows.reduce((n, r) => n + Number(r.outstanding_ngn || 0), 0))} total</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value as any)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm">
          <option value="all">All sections</option><option value="day">Day</option><option value="boarding">Boarding</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, class, parent..." className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-5 py-3 w-10"><input type="checkbox" aria-label="Select all"
              checked={filtered.length > 0 && filtered.every(r => selected.has(r.student_id))}
              onChange={e => { const next = new Set(selected); if (e.target.checked) filtered.forEach(r => next.add(r.student_id)); else filtered.forEach(r => next.delete(r.student_id)); setSelected(next); }} /></th>
            <th>Student</th><th>Section</th><th>Class</th><th>Parent · phone</th><th className="px-5 py-3 text-right">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={6} className="p-10 text-center text-slate-400">Loading outstanding fees…</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-slate-400">Everyone is settled up.</td></tr>
            : filtered.map(r => <tr key={r.student_id} className="border-t">
              <td className="px-5 py-3"><input type="checkbox" checked={selected.has(r.student_id)} onChange={e => { const next = new Set(selected); if (e.target.checked) next.add(r.student_id); else next.delete(r.student_id); setSelected(next); }} /></td>
              <td className="px-0 py-3"><div className="font-black">{r.full_name}</div><div className="text-[10px] text-slate-400">{r.admission_no}</div></td>
              <td className="text-slate-500">{r.section}</td>
              <td className="text-slate-500">{r.class_name || '—'}</td>
              <td className="text-xs text-slate-500">{r.parent_name || '—'}<br/><b className={r.parent_phone ? '' : 'text-rose-700'}>{r.parent_phone || 'No phone'}</b></td>
              <td className="px-5 py-3 text-right font-black">{NGN(Number(r.outstanding_ngn))}</td>
            </tr>)}
        </tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-slate-50 p-4">
      <div className="text-sm text-slate-600">{selected.size} selected · <b>{NGN(selectedTotal)}</b></div>
      <button disabled={busy || selected.size === 0} onClick={sendNow} className="btn btn-primary">
        {busy ? 'Sending…' : `📩 Send fee reminder (${selected.size})`}
      </button>
    </div>
    <div className="border-t p-4 text-[11px] text-slate-500">
      Default template includes the parent name, child name and outstanding balance. SMS cost is charged per message by BestBulkSMS.
    </div>
  </section>;
}

// -- SMS to parents (custom) ------------------------------------------
function SmsParentsPanel({ onBanner, onError }: { onBanner: (m: string) => void; onError: (m: string) => void }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await createClient()
          .from('students')
          .select('id,full_name,admission_no,section,parent_name,parent_phone,guardian_phone')
          .eq('status', 'active').order('full_name');
        setStudents((data as any) || []);
      } catch (e: any) { onError(e?.message || 'Could not load students.'); }
    })();
  }, [onError]);

  const filtered = useMemo(() => students.filter(s => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return [s.full_name, s.admission_no, s.parent_name].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
  }), [students, search]);

  const send = async () => {
    if (selected.size === 0) { onError('Pick at least one parent.'); return; }
    if (!message.trim()) { onError('Message is empty.'); return; }
    setBusy(true); onError('');
    try {
      const res = await fetch('/api/notifications/compose-sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'parents', recipientIds: Array.from(selected), message }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'SMS failed.');
      onBanner(`Sent ${body.sent} · failed ${body.failed} · ${body.skipped_no_phone} without phone skipped.`);
      setMessage(''); setSelected(new Set());
    } catch (e: any) { onError(e?.message || 'Could not send.'); }
    finally { setBusy(false); }
  };

  return <ComposeShell
    title="Compose SMS to selected parents"
    message={message} setMessage={setMessage}
    busy={busy} onSend={send} sendLabel={`📩 Send to ${selected.size} parent${selected.size === 1 ? '' : 's'}`}
    disabled={selected.size === 0 || !message.trim()}
    picker={<>
      <div className="flex gap-2 border-b bg-slate-50 p-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search student or parent..." className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
        <button className="btn bg-slate-100 text-slate-700" onClick={() => setSelected(new Set())}>Clear</button>
        <button className="btn bg-slate-100 text-slate-700" onClick={() => { const next = new Set(selected); filtered.forEach(s => next.add(s.id)); setSelected(next); }}>Select filtered</button>
      </div>
      <div className="max-h-[380px] overflow-y-auto divide-y">
        {filtered.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No matching students.</div>
          : filtered.map(s => {
            const phone = s.parent_phone || s.guardian_phone;
            return <label key={s.id} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
              <input type="checkbox" checked={selected.has(s.id)} onChange={e => { const next = new Set(selected); if (e.target.checked) next.add(s.id); else next.delete(s.id); setSelected(next); }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black">{s.full_name}</div>
                <div className="truncate text-[10px] text-slate-500">{s.admission_no} · {s.parent_name || '—'} · <span className={phone ? 'font-bold' : 'text-rose-700 font-bold'}>{phone || 'No phone'}</span></div>
              </div>
            </label>;
          })}
      </div>
    </>}
  />;
}

// -- SMS to teachers (custom) -----------------------------------------
function SmsTeachersPanel({ onBanner, onError }: { onBanner: (m: string) => void; onError: (m: string) => void }) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await createClient()
          .from('profiles')
          .select('id,full_name,role,phone')
          .eq('role', 'teacher').eq('employment_status','active').order('full_name');
        setTeachers((data as any) || []);
      } catch (e: any) { onError(e?.message || 'Could not load teachers.'); }
    })();
  }, [onError]);

  const filtered = useMemo(() => teachers.filter(t => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return String(t.full_name).toLowerCase().includes(q);
  }), [teachers, search]);

  const send = async () => {
    if (selected.size === 0) { onError('Pick at least one teacher.'); return; }
    if (!message.trim()) { onError('Message is empty.'); return; }
    setBusy(true); onError('');
    try {
      const res = await fetch('/api/notifications/compose-sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: 'teachers', recipientIds: Array.from(selected), message }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'SMS failed.');
      onBanner(`Sent ${body.sent} · failed ${body.failed} · ${body.skipped_no_phone} without phone skipped.`);
      setMessage(''); setSelected(new Set());
    } catch (e: any) { onError(e?.message || 'Could not send.'); }
    finally { setBusy(false); }
  };

  return <ComposeShell
    title="Compose SMS to selected teachers"
    message={message} setMessage={setMessage}
    busy={busy} onSend={send} sendLabel={`📩 Send to ${selected.size} teacher${selected.size === 1 ? '' : 's'}`}
    disabled={selected.size === 0 || !message.trim()}
    picker={<RecipientList
      items={filtered} selected={selected} setSelected={setSelected}
      search={search} setSearch={setSearch}
      itemLabel={(t: Teacher) => <>
        <div className="truncate text-sm font-black">{t.full_name}</div>
        <div className="truncate text-[10px] text-slate-500">{t.role} · <span className={t.phone ? 'font-bold' : 'text-rose-700 font-bold'}>{t.phone || 'No phone'}</span></div>
      </>}
    />}
  />;
}

// -- In-app notifications to teachers ---------------------------------
function InAppTeachersPanel({ onBanner, onError }: { onBanner: (m: string) => void; onError: (m: string) => void }) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody]   = useState('');
  const [link, setLink]   = useState('');
  const [busy, setBusy]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await createClient()
          .from('profiles')
          .select('id,full_name,role,phone')
          .eq('role','teacher').eq('employment_status','active').order('full_name');
        setTeachers((data as any) || []);
      } catch (e: any) { onError(e?.message || 'Could not load teachers.'); }
    })();
  }, [onError]);

  const filtered = useMemo(() => teachers.filter(t => {
    const q = search.toLowerCase().trim();
    return !q || String(t.full_name).toLowerCase().includes(q);
  }), [teachers, search]);

  const send = async () => {
    if (selected.size === 0) { onError('Pick at least one teacher.'); return; }
    if (!title.trim()) { onError('Title is required.'); return; }
    setBusy(true); onError('');
    try {
      const res = await fetch('/api/notifications/compose-inapp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientIds: Array.from(selected), title, body, link, kind: 'announcement' }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Notification failed.');
      onBanner(`Delivered ${payload.created} in-app notification${payload.created === 1 ? '' : 's'}.`);
      setTitle(''); setBody(''); setLink(''); setSelected(new Set());
    } catch (e: any) { onError(e?.message || 'Could not send.'); }
    finally { setBusy(false); }
  };

  return <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-slate-50 p-4 text-xs font-black uppercase tracking-wide text-slate-500">Pick teachers</div>
      <RecipientList
        items={filtered} selected={selected} setSelected={setSelected}
        search={search} setSearch={setSearch}
        itemLabel={(t: Teacher) => <>
          <div className="truncate text-sm font-black">{t.full_name}</div>
          <div className="truncate text-[10px] text-slate-500">{t.role}</div>
        </>}
      />
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-slate-50 p-4 text-xs font-black uppercase tracking-wide text-slate-500">Compose in-app notification</div>
      <div className="space-y-3 p-4">
        <label className="block text-xs font-black text-slate-600">Title
          <input className="input mt-1 w-full" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. New boarding student added to your class" />
        </label>
        <label className="block text-xs font-black text-slate-600">Message
          <textarea rows={5} className="input mt-1 w-full" value={body} onChange={e => setBody(e.target.value)} placeholder="Short details the teacher will see when they tap the bell." />
        </label>
        <label className="block text-xs font-black text-slate-600">Deep link (optional) — opens when they click the notification
          <input className="input mt-1 w-full" value={link} onChange={e => setLink(e.target.value)} placeholder="/teacher/students" />
        </label>
        <button disabled={busy || selected.size === 0 || !title.trim()} onClick={send} className="btn btn-primary w-full">
          {busy ? 'Sending…' : `🔔 Push to ${selected.size} teacher${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </section>
  </div>;
}

// -- Shared compose shell for the two SMS tabs ------------------------
function ComposeShell(props: {
  title: string; message: string; setMessage: (v: string) => void;
  busy: boolean; onSend: () => void; sendLabel: string; disabled: boolean;
  picker: React.ReactNode;
}) {
  const { title, message, setMessage, busy, onSend, sendLabel, disabled, picker } = props;
  return <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-slate-50 p-4 text-xs font-black uppercase tracking-wide text-slate-500">Pick recipients</div>
      {picker}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b bg-slate-50 p-4 text-xs font-black uppercase tracking-wide text-slate-500">{title}</div>
      <div className="space-y-3 p-4">
        <label className="block text-xs font-black text-slate-600">Message
          <textarea rows={8} className="input mt-1 w-full" value={message} onChange={e => setMessage(e.target.value)} placeholder="Keep SMS under 160 characters for a single credit." />
        </label>
        <div className="text-[11px] text-slate-500">{message.length} characters · ~{Math.ceil(message.length / 160) || 0} SMS credit{Math.ceil(message.length / 160) === 1 ? '' : 's'} per recipient.</div>
        <button disabled={busy || disabled} onClick={onSend} className="btn btn-primary w-full">
          {busy ? 'Sending…' : sendLabel}
        </button>
      </div>
    </section>
  </div>;
}

function RecipientList<T extends { id: string }>({
  items, selected, setSelected, search, setSearch, itemLabel,
}: {
  items: T[]; selected: Set<string>; setSelected: (s: Set<string>) => void;
  search: string; setSearch: (s: string) => void;
  itemLabel: (item: T) => React.ReactNode;
}) {
  return <>
    <div className="flex gap-2 border-b bg-slate-50 p-3">
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
      <button className="btn bg-slate-100 text-slate-700" onClick={() => setSelected(new Set())}>Clear</button>
      <button className="btn bg-slate-100 text-slate-700" onClick={() => { const next = new Set(selected); items.forEach(i => next.add(i.id)); setSelected(next); }}>Select filtered</button>
    </div>
    <div className="max-h-[380px] overflow-y-auto divide-y">
      {items.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No matches.</div>
        : items.map(i => (
          <label key={i.id} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
            <input type="checkbox" checked={selected.has(i.id)} onChange={e => { const next = new Set(selected); if (e.target.checked) next.add(i.id); else next.delete(i.id); setSelected(next); }} />
            <div className="min-w-0 flex-1">{itemLabel(i)}</div>
          </label>
        ))}
    </div>
  </>;
}
