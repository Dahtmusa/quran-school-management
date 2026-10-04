'use client';

// AMQM Attendance v3 — admin dashboard.
// Tabs: Day students, Boarding students, Staff, Fines, Settings.
// Live: subscribes to attendance_records changes for the selected date so
// scans and teacher marks show up without polling.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import {
  attendanceApi, subscribeToAttendance,
  type AttendanceSummary, type AttendanceStatus, type SummaryPerson,
  type StaffFineRow, type AttendanceSettings, type FinesPayload,
} from '@/lib/attendance/api';

type Tab = 'day' | 'boarding' | 'staff' | 'fines' | 'analytics' | 'settings';
const STATUS_STYLES: Record<string, string> = {
  present: 'bg-emerald-50 text-emerald-700',
  late:    'bg-amber-50 text-amber-700',
  absent:  'bg-rose-50 text-rose-700',
  excused: 'bg-sky-50 text-sky-700',
  sick:    'bg-violet-50 text-violet-700',
};

const fmtTime = (iso: string | null) => iso
  ? new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(iso))
  : '—';
const naira = (n: number) => '₦' + Number(n || 0).toLocaleString('en-NG');

export default function AttendanceDashboard() {
  const todayLagos = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const [date, setDate] = useState(todayLagos);
  const [tab, setTab] = useState<Tab>('day');
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  // Only show the full-page loading skeleton on the first fetch. Realtime
  // refreshes after that update the data in-place without blanking the UI.
  const isFirstLoad = useRef(true);
  const load = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    setError('');
    try {
      const next = await attendanceApi.summary(date);
      setSummary(next);
    } catch (e: any) {
      setError(e?.message || 'Could not load attendance.');
    } finally {
      isFirstLoad.current = false;
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { isFirstLoad.current = true; load(); }, [load]);
  useEffect(() => subscribeToAttendance(date, () => load()), [date, load]);

  // Optimistic single-row patch: paints the change instantly so the admin
  // doesn't watch the table blink while the API responds. Realtime will
  // eventually reconcile counts + totals in the background.
  const patchRow = useCallback((personId: string, patch: Partial<SummaryPerson>) => {
    setSummary(prev => {
      if (!prev) return prev;
      const apply = (rows: SummaryPerson[]) =>
        rows.map(r => r.id === personId ? { ...r, ...patch } : r);
      return {
        ...prev,
        people: {
          day: apply(prev.people.day),
          boarding: apply(prev.people.boarding),
          staff: apply(prev.people.staff),
        },
      };
    });
  }, []);

  return <AdminShell title="Attendance">
    <div className="space-y-5">
      <Hero date={date} todayMax={todayLagos} onDate={setDate} live={!loading && !error} />
      {banner && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{banner}</div>}
      {error && <div className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">{error}</div>}

      <TabBar tab={tab} onTab={setTab} summary={summary} />

      {tab === 'analytics' ? (
        <AnalyticsPanel onError={setError} />
      ) : tab === 'settings' ? (
        <SettingsPanel onSaved={() => setBanner('Settings saved.')} />
      ) : tab === 'fines' ? (
        <FinesPanel />
      ) : loading && !summary ? (
        <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400">Loading attendance…</div>
      ) : summary && tab === 'boarding' ? (
        <BoardingByClass
          date={date}
          rows={summary.people.boarding}
          search={search} onSearch={setSearch}
          onPatch={patchRow}
          onBanner={setBanner}
          onError={setError}
        />
      ) : summary ? (
        <PeopleTable
          tab={tab}
          date={date}
          rows={summary.people[tab]}
          search={search} onSearch={setSearch}
          onPatch={patchRow}
          onBanner={setBanner}
          onError={setError}
        />
      ) : null}
    </div>
  </AdminShell>;
}

function Hero({ date, todayMax, onDate, live }: { date: string; todayMax: string; onDate: (v: string) => void; live: boolean }) {
  return <section className="rounded-[2rem] bg-[#062d2a] p-6 text-white">
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#e3c36b]">AMQM Attendance</div>
        <h1 className="mt-2 text-3xl font-black">One clear view of who is here</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/80">
          Day students &amp; ordinary staff scan at the main gate. Boarding students are marked by their assigned teachers.
          {live && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-100">● Live</span>}
        </p>
      </div>
      <div className="flex gap-2">
        <input type="date" value={date} max={todayMax} onChange={e => onDate(e.target.value)}
          className="h-11 rounded-xl border-0 bg-white px-3 text-sm font-bold text-slate-900" />
        <Link href="/attendance/scan" className="rounded-xl bg-[#e3c36b] px-4 py-3 text-sm font-black text-[#062d2a]">
          Open Gate Scanner
        </Link>
      </div>
    </div>
  </section>;
}

function TabBar({ tab, onTab, summary }: { tab: Tab; onTab: (t: Tab) => void; summary: AttendanceSummary | null }) {
  const k = (key: 'day' | 'boarding' | 'staff') =>
    summary?.counts?.[key] || { total: 0, present: 0, late: 0, absent: 0, excused: 0, not_marked: 0 };
  const groups: [Tab, string][] = [['day','Day students'], ['boarding','Boarding students'], ['staff','Staff']];
  const extraMeta: Record<string, [string, string, string]> = {
    fines:     ['Staff Fines', '₦', 'Late & absent penalties'],
    analytics: ['Analytics',   '📊', 'Trends · forecast · compare'],
    settings:  ['Settings',    '⚙',  'Cutoff · fines · SMS'],
  };
  return <div className="grid gap-3 md:grid-cols-6">
    {groups.map(([key, label]) => {
      const c = k(key as any);
      const active = tab === key;
      return <button key={key} onClick={() => onTab(key)} className={'rounded-2xl border p-4 text-left ' + (active ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white')}>
        <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1 text-2xl font-black">{c.total}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold">
          <span className="text-emerald-700">{c.present} present</span>
          <span className="text-amber-700">{c.late} late</span>
          <span className="text-rose-700">{c.absent} absent</span>
        </div>
      </button>;
    })}
    {(['fines','analytics','settings'] as Tab[]).map(t => {
      const [label, icon, sub] = extraMeta[t];
      return <button key={t} onClick={() => onTab(t)}
        className={'rounded-2xl border p-4 text-left ' + (tab === t ? 'border-emerald-700 bg-emerald-50' : 'border-slate-200 bg-white')}>
        <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1 text-2xl font-black">{icon}</div>
        <div className="mt-2 text-[11px] font-bold text-slate-500">{sub}</div>
      </button>;
    })}
  </div>;
}

function PeopleTable(props: {
  tab: Exclude<Tab, 'fines' | 'settings'>;
  date: string;
  rows: SummaryPerson[];
  search: string; onSearch: (v: string) => void;
  onPatch: (personId: string, patch: Partial<SummaryPerson>) => void;
  onBanner: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { tab, date, rows, search, onSearch, onPatch, onBanner, onError } = props;
  const [busy, setBusy] = useState('');

  const filtered = useMemo(() => rows.filter(r => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return [r.full_name, r.identifier, r.class_name, r.job_title].filter(Boolean)
      .some(v => String(v).toLowerCase().includes(q));
  }), [rows, search]);

  // Optimistic status change: patch the row locally BEFORE the API returns
  // so the pill flips instantly. Revert to the previous status on failure.
  const setStatus = async (row: SummaryPerson, status: AttendanceStatus) => {
    if (busy) return;
    const prevStatus = row.status;
    const prevSource = row.source;
    setBusy(row.id + ':' + status);
    onPatch(row.id, { status, source: 'admin', scanned_at: new Date().toISOString() });
    try {
      await attendanceApi.setStatus(row.id, row.person_type, date, status);
      onBanner(`${row.full_name} marked ${status}.`);
    } catch (e: any) {
      onPatch(row.id, { status: prevStatus, source: prevSource });
      onError(e?.message || 'Could not update status.');
    } finally { setBusy(''); }
  };

  const sendSms = async (row: SummaryPerson, template: 'arrival' | 'late' | 'absent') => {
    if (busy || !row.parent_phone) return;
    setBusy(row.id + ':sms:' + template);
    try {
      const r = await attendanceApi.sendSms(row.id, template);
      onBanner(`SMS sent to ${r.to}.`);
    } catch (e: any) { onError(e?.message || 'SMS could not be sent.'); }
    finally { setBusy(''); }
  };

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="font-black">
          {tab === 'day' ? 'Day Students' : tab === 'boarding' ? 'Boarding Students' : 'Staff'}
        </div>
        <div className="text-xs text-slate-500">
          {date} · {rows.length} people
          {tab === 'day' && <> · <span className="text-emerald-700 font-bold">Late scans auto-SMS parents</span></>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search name, ID, class…"
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
        {tab === 'day' && <BulkSmsMenu date={date} onBanner={onBanner} onError={onError} />}
      </div>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="text-[10px] uppercase tracking-[.12em] text-slate-400">
          <tr>
            <th className="px-5 py-3">Person</th>
            <th>{tab === 'staff' ? 'Role' : 'Class'}</th>
            <th>Status</th>
            <th>Time</th>
            {tab === 'day' && <th className="px-5 py-3 text-right">SMS</th>}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={tab === 'day' ? 5 : 4} className="p-10 text-center text-slate-400">No matching people.</td></tr>
          ) : filtered.map(r => (
            <tr key={r.id} className="border-t align-middle hover:bg-slate-50/60">
              <td className="px-5 py-3">
                <div className="font-black">{r.full_name}</div>
                <div className="text-[11px] text-slate-400">
                  {r.identifier || '—'}
                  {tab === 'day' && r.parent_phone && <> · Parent {r.parent_phone}</>}
                </div>
              </td>
              <td className="text-slate-500">{r.class_name || r.job_title || '—'}</td>
              <td>
                <StatusPicker row={r} busy={busy} onPick={setStatus} />
              </td>
              <td className="text-xs text-slate-500">
                {fmtTime(r.scanned_at)}
                {r.source && r.source !== 'awaiting_gate' && r.source !== 'awaiting_teacher' && (
                  <div className="text-[10px] text-slate-400">
                    {r.source === 'gate_scan' ? 'Gate' : r.source === 'teacher' ? 'Teacher' : 'Admin'}
                  </div>
                )}
              </td>
              {tab === 'day' && (
                <td className="px-5 py-3 text-right">
                  <SmsMenu row={r} busy={busy} onSend={sendSms} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>;
}

// Boarding view: two levels. First a grid of class cards (name, headcount,
// present/late/absent counts). Clicking a card drills into just that class
// as a normal per-row table. Admin can go back to the class grid at any time.
function BoardingByClass(props: {
  date: string;
  rows: SummaryPerson[];
  search: string; onSearch: (v: string) => void;
  onPatch: (personId: string, patch: Partial<SummaryPerson>) => void;
  onBanner: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { date, rows, search, onSearch, onPatch, onBanner, onError } = props;
  const [selected, setSelected] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, SummaryPerson[]>();
    for (const r of rows) {
      const key = r.class_name || 'Unassigned';
      const list = map.get(key) || [];
      list.push(r);
      map.set(key, list);
    }
    return Array.from(map.entries())
      .map(([name, list]) => {
        const c = {
          name, total: list.length,
          present: list.filter(r => r.status === 'present').length,
          late:    list.filter(r => r.status === 'late').length,
          absent:  list.filter(r => r.status === 'absent').length,
          excused: list.filter(r => r.status === 'excused').length,
          notMarked: list.filter(r => !r.status).length,
        };
        return c;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  if (selected) {
    const classRows = rows.filter(r => (r.class_name || 'Unassigned') === selected);
    return <>
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => setSelected(null)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50">
          ← All boarding classes
        </button>
        <div className="text-xs font-bold text-slate-500">
          Boarding · <span className="font-black text-slate-900">{selected}</span> · {classRows.length} student{classRows.length === 1 ? '' : 's'}
        </div>
      </div>
      <PeopleTable
        tab="boarding"
        date={date}
        rows={classRows}
        search={search} onSearch={onSearch}
        onPatch={onPatch} onBanner={onBanner} onError={onError}
      />
    </>;
  }

  const filteredGroups = search.trim()
    ? groups.filter(g => g.name.toLowerCase().includes(search.toLowerCase().trim()))
    : groups;

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-xs font-black uppercase tracking-wide text-slate-500">Boarding by class</div>
        <div className="mt-1 text-lg font-black">{groups.length} class{groups.length === 1 ? '' : 'es'} · {rows.length} boarding students</div>
        <div className="text-xs text-slate-500">Click a class to see and mark that class's attendance.</div>
      </div>
      <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search class…"
        className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
    </div>

    {filteredGroups.length === 0 ? (
      <div className="p-10 text-center text-sm text-slate-400">No matching classes.</div>
    ) : (
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredGroups.map(g => {
          const done = g.total - g.notMarked;
          const pct = g.total > 0 ? Math.round((done / g.total) * 100) : 0;
          return (
            <button key={g.name} onClick={() => setSelected(g.name)}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase tracking-wide text-emerald-700">Class</div>
                  <div className="truncate text-base font-black">{g.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black leading-none">{g.total}</div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">students</div>
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: pct + '%' }} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-slate-500">
                <span>{done}/{g.total} marked</span>
                <span className="text-emerald-700">{pct}%</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-black uppercase">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{g.present} present</span>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">{g.late} late</span>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">{g.absent} absent</span>
                {g.excused > 0 && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">{g.excused} excused</span>}
                {g.notMarked > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{g.notMarked} not marked</span>}
              </div>

              <div className="mt-3 text-right text-[11px] font-black uppercase text-emerald-700 group-hover:underline">Open →</div>
            </button>
          );
        })}
      </div>
    )}
  </section>;
}

// Bulk parent notification. Three templates: Arrival to all present,
// Late to all late, Absent to all currently-absent (plus an option to
// mark every still-unmarked day student as Absent first so the SMS
// covers everyone who never showed up).
function BulkSmsMenu({ date, onBanner, onError }: {
  date: string;
  onBanner: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState('');
  const run = async (
    template: 'arrival' | 'late' | 'absent',
    opts: { markUnmarkedAbsent?: boolean; label: string; confirm?: string } ,
  ) => {
    if (opts.confirm && !confirm(opts.confirm)) return;
    setBusy(template);
    try {
      const r = await attendanceApi.bulkSms(template, date, { markUnmarkedAbsent: opts.markUnmarkedAbsent });
      onBanner(
        `${opts.label}: sent ${r.sent} · failed ${r.failed}` +
        (r.skipped_no_phone ? ` · ${r.skipped_no_phone} without phone skipped` : ''),
      );
    } catch (e: any) { onError(e?.message || 'Bulk SMS failed.'); }
    finally { setBusy(''); }
  };
  return (
    <details className="group relative inline-block text-left">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg bg-[#062d2a] px-3 py-2 text-xs font-black uppercase text-white shadow-sm hover:bg-[#0a4b40]">
        📣 SMS all…
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-64 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-black/10">
        <button disabled={!!busy}
          onClick={e => { e.preventDefault(); run('arrival', { label: 'Arrival SMS' }); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}
          className="block w-full px-4 py-3 text-left text-xs font-bold hover:bg-emerald-50 disabled:opacity-40">
          <div className="text-emerald-800">Arrival to all present</div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500">Sends the Arrival template to every day-student parent whose child is currently marked Present.</div>
        </button>
        <button disabled={!!busy}
          onClick={e => { e.preventDefault(); run('late', { label: 'Late SMS' }); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}
          className="block w-full px-4 py-3 text-left text-xs font-bold hover:bg-amber-50 disabled:opacity-40">
          <div className="text-amber-800">Late to all late arrivals</div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500">Late scans are auto-notified; use this to re-send.</div>
        </button>
        <button disabled={!!busy}
          onClick={e => { e.preventDefault(); run('absent', {
            label: 'Absent SMS',
            markUnmarkedAbsent: true,
            confirm: 'This will mark every still-unmarked day student for today as Absent and SMS their parents. Continue?',
          }); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}
          className="block w-full px-4 py-3 text-left text-xs font-bold hover:bg-rose-50 disabled:opacity-40">
          <div className="text-rose-800">Mark unmarked absent + SMS parents</div>
          <div className="mt-0.5 text-[10px] font-medium text-slate-500">Everyone who never scanned gets set to Absent and their parent notified.</div>
        </button>
      </div>
    </details>
  );
}

// Native <select> styled as a pill. One dropdown replaces the four status
// buttons; the current status is what's shown, changing it fires the API.
function StatusPicker({ row, busy, onPick }: {
  row: SummaryPerson; busy: string; onPick: (row: SummaryPerson, s: AttendanceStatus) => void;
}) {
  const current = row.status || '';
  const cls = STATUS_STYLES[current] || 'bg-slate-100 text-slate-500';
  return (
    <div className={'relative inline-flex items-center rounded-full pl-3 pr-7 py-1 text-[11px] font-black uppercase ' + cls}>
      <span>{current || 'Not marked'}</span>
      <select
        aria-label="Change status"
        disabled={!!busy}
        value={current}
        onChange={e => onPick(row, e.target.value as AttendanceStatus)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="" disabled>Change to…</option>
        <option value="present">Present</option>
        <option value="late">Late</option>
        <option value="absent">Absent</option>
        <option value="excused">Excused</option>
      </select>
      <svg className="pointer-events-none absolute right-2 h-3 w-3 opacity-70" viewBox="0 0 20 20" fill="currentColor"><path d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.24 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"/></svg>
    </div>
  );
}

// Single "Notify parent" button; a native <details> reveals the three
// template choices only when the admin actually needs them.
function SmsMenu({ row, busy, onSend }: {
  row: SummaryPerson; busy: string;
  onSend: (row: SummaryPerson, template: 'arrival' | 'late' | 'absent') => void;
}) {
  if (!row.parent_phone) {
    return <span className="text-[10px] font-bold uppercase text-slate-300">no phone</span>;
  }
  return (
    <details className="group relative inline-block text-left">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-black uppercase text-white shadow-sm hover:bg-emerald-700">
        📱 Notify
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10">
        <button disabled={!!busy} onClick={e => { e.preventDefault(); onSend(row, 'arrival'); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}
          className="block w-full px-3 py-2 text-left text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40">Arrival</button>
        <button disabled={!!busy} onClick={e => { e.preventDefault(); onSend(row, 'late'); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}
          className="block w-full px-3 py-2 text-left text-xs font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-40">Late</button>
        <button disabled={!!busy} onClick={e => { e.preventDefault(); onSend(row, 'absent'); (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; }}
          className="block w-full px-3 py-2 text-left text-xs font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-40">Absent</button>
      </div>
    </details>
  );
}

function FinesPanel() {
  const todayLagos = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const monthStart = new Date(); monthStart.setDate(1);
  const from0 = monthStart.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const [from, setFrom] = useState(from0);
  const [to, setTo] = useState(todayLagos);
  const [rows, setRows] = useState<StaffFineRow[]>([]);
  const [totals, setTotals] = useState({ late: 0, absent: 0, grand: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await attendanceApi.staffFines(from, to);
      setRows(r.rows); setTotals(r.totals);
    } catch (e: any) { setErr(e?.message || 'Could not load fines.'); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-xs font-black uppercase tracking-wide text-slate-500">Staff Attendance Fines</div>
        <div className="mt-1 text-lg font-black">Late &amp; Absent penalties</div>
        <div className="text-xs text-slate-500">Amounts come from Attendance Settings (flat per occurrence).</div>
      </div>
      <div className="flex gap-2">
        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3" />
        <span className="self-center text-xs font-bold text-slate-400">to</span>
        <input type="date" value={to} min={from} max={todayLagos} onChange={e => setTo(e.target.value)} className="h-11 rounded-xl border border-slate-200 px-3" />
      </div>
    </div>
    {err && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{err}</div>}
    <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
      <div className="rounded-xl bg-amber-50 p-3"><div className="text-[10px] font-black uppercase text-amber-700">Late fines</div><div className="text-lg font-black">{naira(totals.late)}</div></div>
      <div className="rounded-xl bg-rose-50 p-3"><div className="text-[10px] font-black uppercase text-rose-700">Absent fines</div><div className="text-lg font-black">{naira(totals.absent)}</div></div>
      <div className="rounded-xl bg-slate-900 p-3 text-white"><div className="text-[10px] font-black uppercase text-slate-300">Grand total</div><div className="text-lg font-black">{naira(totals.grand)}</div></div>
    </div>
    <div className="mt-4 overflow-x-auto">
      {loading ? <div className="p-8 text-center text-sm text-slate-400">Loading fines…</div> :
       rows.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">No fines in this range.</div> :
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="text-[10px] uppercase tracking-[.12em] text-slate-400">
          <tr><th className="px-5 py-3">Staff</th><th>Role</th><th>Late</th><th>Absent</th><th>Late ₦</th><th>Absent ₦</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Action</th></tr>
        </thead>
        <tbody>
          {rows.map(r => <tr key={r.staff_id} className="border-t align-top">
            <td className="px-5 py-3"><div className="font-black">{r.full_name}</div><div className="text-xs text-slate-400">{r.staff_no || '—'}</div></td>
            <td className="text-slate-500">{r.job_title || '—'}</td>
            <td className="text-amber-700 font-bold">{r.late_count}</td>
            <td className="text-rose-700 font-bold">{r.absent_count}</td>
            <td>{naira(r.late_fine_ngn)}</td>
            <td>{naira(r.absent_fine_ngn)}</td>
            <td className="px-5 py-3 text-right font-black">{naira(r.total_ngn)}</td>
            <td className="px-5 py-3 text-right">
              <StaffFineDrilldown staffId={r.staff_id} staffName={r.full_name} onSaved={load} />
            </td>
          </tr>)}
        </tbody>
      </table>}
    </div>
  </section>;
}

// Admin drill-down for a single staff row: shows the same "my fines"
// payload as the teacher sees, plus a Record Payment form.
function StaffFineDrilldown({ staffId, staffName, onSaved }: { staffId: string; staffName: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<FinesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('transfer');
  const [note,   setNote]   = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try { setPayload(await attendanceApi.staffFinesDetail(staffId)); }
    catch (e: any) { setErr(e?.message || 'Could not load.'); }
    finally { setLoading(false); }
  }, [staffId]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const record = async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setErr('Enter an amount greater than zero.'); return; }
    setSaving(true); setErr('');
    try {
      await attendanceApi.recordStaffPayment(staffId, n, { method, note: note || undefined });
      setAmount(''); setNote('');
      await load();
      onSaved();
    } catch (e: any) { setErr(e?.message || 'Payment could not be recorded.'); }
    finally { setSaving(false); }
  };

  return <>
    <button onClick={() => setOpen(true)} className="rounded-lg bg-[#062d2a] px-3 py-1.5 text-[11px] font-black uppercase text-white">Details</button>
    {open && (
      <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-16" onClick={() => setOpen(false)}>
        <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b bg-slate-50 p-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Staff fines</div>
              <div className="text-lg font-black">{staffName}</div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold">Close</button>
          </div>

          {err && <div className="m-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{err}</div>}

          {loading && !payload ? <div className="p-10 text-center text-sm text-slate-400">Loading…</div>
          : payload ? <div className="max-h-[70vh] overflow-y-auto p-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-rose-50 p-3"><div className="text-[10px] font-black uppercase text-rose-700">Fines</div><div className="text-lg font-black">{naira(payload.totals.fines_ngn)}</div></div>
              <div className="rounded-xl bg-emerald-50 p-3"><div className="text-[10px] font-black uppercase text-emerald-700">Paid</div><div className="text-lg font-black">{naira(payload.totals.payments_ngn)}</div></div>
              <div className="rounded-xl bg-slate-900 p-3 text-white"><div className="text-[10px] font-black uppercase text-slate-300">Balance</div><div className="text-lg font-black">{naira(payload.totals.balance_ngn)}</div></div>
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-[10px] font-black uppercase text-emerald-800">Record a payment</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount ₦"
                  className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm min-w-[140px]" />
                <select value={method} onChange={e => setMethod(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm">
                  <option value="transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="pos">POS</option>
                  <option value="salary_deduction">Salary deduction</option>
                </select>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
                  className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm min-w-[160px]" />
                <button disabled={saving} onClick={record}
                  className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-black text-white disabled:opacity-40">
                  {saving ? 'Saving…' : 'Record'}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200">
                <div className="border-b bg-slate-50 p-3 text-[10px] font-black uppercase text-slate-500">Fines ({payload.fines.length})</div>
                {payload.fines.length === 0 ? <div className="p-4 text-xs text-slate-400">No fines.</div>
                : <ul className="divide-y">
                    {payload.fines.map(f => <li key={f.id} className="flex items-center justify-between p-3 text-xs">
                      <div>
                        <div className="font-bold">{f.attendance_date}</div>
                        <div className="text-[10px] uppercase text-slate-500">{f.status_code}</div>
                      </div>
                      <div className="font-black">{naira(f.amount_ngn)}</div>
                    </li>)}
                  </ul>}
              </div>
              <div className="rounded-xl border border-slate-200">
                <div className="border-b bg-slate-50 p-3 text-[10px] font-black uppercase text-slate-500">Payments ({payload.payments.length})</div>
                {payload.payments.length === 0 ? <div className="p-4 text-xs text-slate-400">No payments.</div>
                : <ul className="divide-y">
                    {payload.payments.map(p => <li key={p.id} className="p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="font-black">{naira(p.amount_ngn)}</div>
                        <div className="text-[10px] text-slate-500">{p.paid_on}</div>
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{p.method || '—'}{p.note && <> · {p.note}</>}</div>
                    </li>)}
                  </ul>}
              </div>
            </div>
          </div> : null}
        </div>
      </div>
    )}
  </>;
}

function SettingsPanel({ onSaved }: { onSaved: () => void }) {
  const [s, setS] = useState<AttendanceSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { attendanceApi.settings().then(setS).catch(e => setErr(e?.message || 'Load failed.')); }, []);

  const save = async () => {
    if (!s) return;
    setSaving(true); setErr('');
    try {
      const next = await attendanceApi.saveSettings(s);
      setS(next); onSaved();
    } catch (e: any) { setErr(e?.message || 'Save failed.'); }
    finally { setSaving(false); }
  };
  if (!s) return <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400">Loading settings…</div>;

  const set = <K extends keyof AttendanceSettings>(k: K, v: AttendanceSettings[K]) => setS({ ...s, [k]: v });
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="text-xs font-black uppercase tracking-wide text-slate-500">Attendance Settings</div>
    <div className="mt-1 text-lg font-black">Cutoff, staff fines, SMS templates</div>
    {err && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{err}</div>}
    <div className="mt-5 grid gap-5 md:grid-cols-2">
      <Field label="Morning cutoff (HH:MM, Africa/Lagos)"><input value={s.morning_cutoff_time} onChange={e => set('morning_cutoff_time', e.target.value)} className={INPUT} /></Field>
      <Field label="SMS enabled"><label className="flex items-center gap-2 pt-2"><input type="checkbox" checked={s.sms_enabled} onChange={e => set('sms_enabled', e.target.checked)} /> Send SMS to parents</label></Field>
      <Field label="Staff LATE fine (₦, flat)"><input type="number" min={0} value={s.staff_late_fine_ngn} onChange={e => set('staff_late_fine_ngn', Number(e.target.value) || 0)} className={INPUT} /></Field>
      <Field label="Staff ABSENT fine (₦, flat)"><input type="number" min={0} value={s.staff_absent_fine_ngn} onChange={e => set('staff_absent_fine_ngn', Number(e.target.value) || 0)} className={INPUT} /></Field>
      <Field label="SMS · arrival template" full><textarea rows={3} value={s.sms_arrival_template} onChange={e => set('sms_arrival_template', e.target.value)} className={TEXTAREA} /></Field>
      <Field label="SMS · late template" full><textarea rows={3} value={s.sms_late_template} onChange={e => set('sms_late_template', e.target.value)} className={TEXTAREA} /></Field>
      <Field label="SMS · absent template" full><textarea rows={3} value={s.sms_absent_template} onChange={e => set('sms_absent_template', e.target.value)} className={TEXTAREA} /></Field>
      <Field label="School payment account (shown to staff on their fines dashboard)" full>
        <textarea rows={5} value={s.school_payment_account} onChange={e => set('school_payment_account', e.target.value)} className={TEXTAREA}
          placeholder={'Bank: <bank name>\nAccount Number: <account number>\nAccount Name: <account name>\nRef: use your Staff ID as narration'} />
      </Field>
    </div>
    <div className="mt-3 text-xs text-slate-500">Placeholders (SMS templates only): <code>{'{student_name}'}</code>, <code>{'{time}'}</code>, <code>{'{date}'}</code>.</div>
    <div className="mt-5"><button onClick={save} disabled={saving} className="rounded-xl bg-[#062d2a] px-5 py-3 text-sm font-black text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save settings'}</button></div>
  </section>;
}

const INPUT    = 'w-full h-11 rounded-xl border border-slate-200 px-3 text-sm';
const TEXTAREA = 'w-full min-h-[5rem] rounded-xl border border-slate-200 px-3 py-2 text-sm leading-snug';

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return <div className={full ? 'md:col-span-2' : ''}>
    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1">{children}</div>
  </div>;
}

// ---------- Analytics tab -------------------------------------------
// Everything about trends, comparisons and forecasts for admins. Pulls
// a daily-aggregated series + per-person breakdown from the API, then
// does all the slicing (week / month / term / forecast) in the browser.
function AnalyticsPanel({ onError }: { onError: (m: string) => void }) {
  const todayLagos = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const [personType, setPersonType] = useState<'student' | 'staff'>('student');
  const [section, setSection] = useState<'all' | 'day' | 'boarding'>('all');
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 90);
    return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  });
  const [to, setTo] = useState(todayLagos);
  const [data, setData] = useState<Awaited<ReturnType<typeof attendanceApi.analytics>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [personFilter, setPersonFilter] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'pct_asc' | 'pct_desc' | 'absent'>('pct_asc');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sec = personType === 'student' && section !== 'all' ? section : undefined;
      setData(await attendanceApi.analytics(personType, from, to, sec));
    } catch (e: any) { onError(e?.message || 'Could not load analytics.'); }
    finally { setLoading(false); }
  }, [personType, section, from, to, onError]);
  useEffect(() => { load(); }, [load]);

  const metrics = useMemo(() => data ? computeMetrics(data.daily, data.terms) : null, [data]);
  const people = useMemo(() => {
    if (!data) return [];
    const q = personFilter.toLowerCase().trim();
    const filtered = q
      ? data.people.filter(p => [p.full_name, p.identifier, p.class_name, p.job_title].filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
      : data.people;
    const sorted = [...filtered];
    if (sortBy === 'name')     sorted.sort((a, b) => a.full_name.localeCompare(b.full_name));
    if (sortBy === 'pct_asc')  sorted.sort((a, b) => Number(a.attendance_pct) - Number(b.attendance_pct));
    if (sortBy === 'pct_desc') sorted.sort((a, b) => Number(b.attendance_pct) - Number(a.attendance_pct));
    if (sortBy === 'absent')   sorted.sort((a, b) => b.absent - a.absent);
    return sorted;
  }, [data, personFilter, sortBy]);

  return <section className="space-y-4">
    {/* Toolbar */}
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex overflow-hidden rounded-xl border border-slate-200">
          {(['student','staff'] as const).map(t => (
            <button key={t} onClick={() => setPersonType(t)}
              className={'px-4 py-2 text-sm font-black ' + (personType === t ? 'bg-[#062d2a] text-white' : 'bg-white text-slate-700 hover:bg-slate-50')}>
              {t === 'student' ? 'Students' : 'Staff'}
            </button>
          ))}
        </div>
        {personType === 'student' && (
          <select value={section} onChange={e => setSection(e.target.value as any)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm">
            <option value="all">All sections</option><option value="day">Day</option><option value="boarding">Boarding</option>
          </select>
        )}
        <label className="flex items-center gap-2 text-xs font-black text-slate-500">From
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-xs font-black text-slate-500">To
          <input type="date" value={to} min={from} max={todayLagos} onChange={e => setTo(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
        </label>
        <div className="ml-auto flex gap-1 text-xs font-black">
          {([['7d', 7], ['30d', 30], ['90d', 90], ['6mo', 183], ['1y', 365]] as const).map(([label, days]) => (
            <button key={label} onClick={() => {
              const d = new Date(); d.setDate(d.getDate() - days);
              setFrom(d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }));
              setTo(todayLagos);
            }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50">{label}</button>
          ))}
        </div>
      </div>
    </div>

    {loading && !data ? (
      <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400">Loading analytics…</div>
    ) : !metrics ? (
      <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400">No attendance data in this range yet.</div>
    ) : <>
      {/* Comparison cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <TrendCard label="This week"  current={metrics.thisWeek}  previous={metrics.lastWeek}  />
        <TrendCard label="This month" current={metrics.thisMonth} previous={metrics.lastMonth} />
        <TrendCard label="This term"  current={metrics.thisTerm}  previous={metrics.lastTerm}  termName={metrics.currentTermLabel} />
        <ForecastCard metrics={metrics} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Weekly attendance rate" subtitle={`Last ${metrics.weekly.length} weeks`}>
          <BarChart data={metrics.weekly.map(w => ({ label: w.label, value: w.pct, hint: `${w.present + w.late + w.excused}/${w.total_marked} · ${w.pct}%` }))} />
        </ChartCard>
        <ChartCard title="Monthly attendance rate" subtitle={`Last ${metrics.monthly.length} months`}>
          <BarChart data={metrics.monthly.map(m => ({ label: m.label, value: m.pct, hint: `${m.present + m.late + m.excused}/${m.total_marked} · ${m.pct}%` }))} />
        </ChartCard>
      </div>

      {/* Per-person table */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-black text-slate-800">Per-{personType === 'student' ? 'student' : 'staff'} attendance</div>
            <div className="text-xs text-slate-500">{people.length} {personType === 'student' ? 'students' : 'staff'} · {from} → {to}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={personFilter} onChange={e => setPersonFilter(e.target.value)} placeholder="Search name, ID, class…"
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm" />
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm">
              <option value="pct_asc">Lowest attendance %</option>
              <option value="pct_desc">Highest attendance %</option>
              <option value="absent">Most absent days</option>
              <option value="name">Name A→Z</option>
            </select>
          </div>
        </div>
        <div className="max-h-[500px] overflow-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Person</th>
                <th>{personType === 'student' ? 'Class' : 'Role'}</th>
                <th className="text-right">Present</th>
                <th className="text-right">Late</th>
                <th className="text-right">Absent</th>
                <th className="text-right">Excused</th>
                <th className="text-right">Marked</th>
                <th className="text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-slate-400">No matching people.</td></tr>
              : people.map(p => (
                <tr key={p.person_id} className="border-t">
                  <td className="px-5 py-3">
                    <div className="font-black">{p.full_name}</div>
                    <div className="text-[10px] text-slate-400">{p.identifier || '—'}</div>
                  </td>
                  <td className="text-xs text-slate-500">{p.class_name || p.job_title || '—'}</td>
                  <td className="text-right font-bold text-emerald-700">{p.present}</td>
                  <td className="text-right font-bold text-amber-700">{p.late}</td>
                  <td className="text-right font-bold text-rose-700">{p.absent}</td>
                  <td className="text-right font-bold text-sky-700">{p.excused}</td>
                  <td className="text-right text-slate-700">{p.total_marked}</td>
                  <td className="px-5 py-3 text-right">
                    <PctPill pct={Number(p.attendance_pct)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>}
  </section>;
}

// --- Analytics helpers --------------------------------------------
type DailyRow = { attendance_date: string; present: number; late: number; absent: number; excused: number; total_marked: number };

function computeMetrics(daily: DailyRow[], terms: any[]) {
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

  const sumRange = (fromStr: string, toStr: string) => {
    const rows = daily.filter(d => d.attendance_date >= fromStr && d.attendance_date <= toStr);
    const totals = rows.reduce((a, r) => ({
      present: a.present + r.present, late: a.late + r.late,
      absent: a.absent + r.absent,   excused: a.excused + r.excused,
      total_marked: a.total_marked + r.total_marked,
    }), { present: 0, late: 0, absent: 0, excused: 0, total_marked: 0 });
    const effective = totals.present + totals.late + totals.excused;
    const pct = totals.total_marked > 0 ? Math.round((effective / totals.total_marked) * 1000) / 10 : 0;
    return { ...totals, pct, days: rows.length };
  };

  const shift = (base: Date, days: number) => {
    const d = new Date(base); d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  };

  // Weekly series (last 12 weeks)
  const weekly: { label: string; present: number; late: number; absent: number; excused: number; total_marked: number; pct: number }[] = [];
  const dayOfWeek = today.getDay() || 7; // Mon=1 … Sun=7
  const thisMonday = new Date(today); thisMonday.setDate(today.getDate() - (dayOfWeek - 1));
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(thisMonday); weekStart.setDate(thisMonday.getDate() - i * 7);
    const weekEnd   = new Date(weekStart);  weekEnd.setDate(weekStart.getDate() + 6);
    const r = sumRange(
      weekStart.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }),
      weekEnd.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }),
    );
    weekly.push({
      label: new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short' }).format(weekStart),
      ...r,
    });
  }

  // Monthly series (last 6 months)
  const monthly: { label: string; present: number; late: number; absent: number; excused: number; total_marked: number; pct: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthEnd   = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    const r = sumRange(
      monthStart.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }),
      monthEnd.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }),
    );
    monthly.push({
      label: new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', month: 'short' }).format(monthStart),
      ...r,
    });
  }

  // This week vs last week
  const thisWeekStart = shift(thisMonday, 0);
  const thisWeek = sumRange(thisWeekStart, todayStr);
  const lastWeekEnd   = shift(thisMonday, -1);
  const lastWeekStart = shift(thisMonday, -7);
  const lastWeek = sumRange(lastWeekStart, lastWeekEnd);

  // This month vs last month
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const thisMonth = sumRange(thisMonthStart, todayStr);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const lastMonthEnd   = new Date(today.getFullYear(), today.getMonth(), 0).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const lastMonth = sumRange(lastMonthStart, lastMonthEnd);

  // Current + previous term from the terms table
  const sortedTerms = [...(terms || [])].sort((a: any, b: any) =>
    String(a.starts_on || '').localeCompare(String(b.starts_on || '')),
  );
  const currentTerm = sortedTerms.find((t: any) => t.is_current)
    || sortedTerms.find((t: any) => todayStr >= String(t.starts_on || '') && todayStr <= String(t.ends_on || ''))
    || sortedTerms[sortedTerms.length - 1];
  const prevTerm = currentTerm ? sortedTerms[sortedTerms.indexOf(currentTerm) - 1] : null;
  const thisTerm = currentTerm
    ? sumRange(String(currentTerm.starts_on), String(currentTerm.ends_on || todayStr))
    : { present: 0, late: 0, absent: 0, excused: 0, total_marked: 0, pct: 0, days: 0 };
  const lastTerm = prevTerm
    ? sumRange(String(prevTerm.starts_on), String(prevTerm.ends_on))
    : { present: 0, late: 0, absent: 0, excused: 0, total_marked: 0, pct: 0, days: 0 };

  const currentTermLabel = currentTerm
    ? `${currentTerm.name || 'Term'}${currentTerm.academic_years?.name ? ' · ' + currentTerm.academic_years.name : ''}`
    : '—';

  // Forecast: use the average attendance rate across the last 4 full weeks
  // (ignoring the current partial week), applied to the number of calendar
  // days in the next period.
  const recent4 = weekly.slice(-5, -1);
  const avgRate = recent4.length ? recent4.reduce((n, w) => n + w.pct, 0) / recent4.length : thisMonth.pct;
  const avgDaily = recent4.length ? recent4.reduce((n, w) => n + w.total_marked, 0) / recent4.length / 7 : 0;

  const nextWeekDays = 7;
  const daysInNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();

  const forecastWeek = {
    pct: Math.round(avgRate * 10) / 10,
    expectedMarked: Math.round(avgDaily * nextWeekDays),
    expectedPresent: Math.round(avgDaily * nextWeekDays * avgRate / 100),
  };
  const forecastMonth = {
    pct: Math.round(avgRate * 10) / 10,
    expectedMarked: Math.round(avgDaily * daysInNextMonth),
    expectedPresent: Math.round(avgDaily * daysInNextMonth * avgRate / 100),
  };

  return {
    thisWeek, lastWeek, thisMonth, lastMonth,
    thisTerm, lastTerm, currentTermLabel,
    weekly, monthly,
    forecastWeek, forecastMonth,
  };
}

function TrendCard({ label, current, previous, termName }: {
  label: string;
  current: { pct: number; present: number; late: number; absent: number; total_marked: number };
  previous: { pct: number; total_marked: number };
  termName?: string;
}) {
  const delta = Math.round((current.pct - previous.pct) * 10) / 10;
  const up = delta > 0;
  return <div className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</div>
    {termName && <div className="mt-0.5 truncate text-[11px] font-bold text-emerald-700">{termName}</div>}
    <div className="mt-2 text-3xl font-black text-slate-900">{current.pct}%</div>
    <div className="mt-1 text-xs text-slate-500">{current.total_marked} marked</div>
    <div className={'mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black ' +
      (delta === 0 ? 'bg-slate-100 text-slate-500'
       : up ? 'bg-emerald-50 text-emerald-700'
            : 'bg-rose-50 text-rose-700')}>
      {delta === 0 ? '—' : up ? '↑' : '↓'} {Math.abs(delta)}%
      <span className="font-normal opacity-70">vs previous</span>
    </div>
  </div>;
}

function ForecastCard({ metrics }: { metrics: ReturnType<typeof computeMetrics> }) {
  return <div className="rounded-2xl border border-sky-100 bg-sky-50 p-5">
    <div className="text-[10px] font-black uppercase tracking-wide text-sky-700">Forecast</div>
    <div className="mt-0.5 text-[11px] font-bold text-sky-800">Based on last 4 weeks</div>
    <div className="mt-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-slate-600">Next 7 days:</span>
        <b className="text-sky-900">~{metrics.forecastWeek.expectedPresent} present / {metrics.forecastWeek.expectedMarked}</b>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-slate-600">Next 30 days:</span>
        <b className="text-sky-900">~{metrics.forecastMonth.expectedPresent} present / {metrics.forecastMonth.expectedMarked}</b>
      </div>
      <div className="flex items-center justify-between pt-1 text-xs">
        <span className="text-slate-500">Expected rate:</span>
        <b className="text-sky-800">{metrics.forecastWeek.pct}%</b>
      </div>
    </div>
  </div>;
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-3">
      <div className="font-black text-slate-800">{title}</div>
      <div className="text-xs text-slate-500">{subtitle}</div>
    </div>
    {children}
  </section>;
}

function BarChart({ data }: { data: { label: string; value: number; hint: string }[] }) {
  const max = Math.max(100, ...data.map(d => d.value));
  return <div className="flex h-48 items-end gap-2 border-b border-slate-100">
    {data.map((d, i) => (
      <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={d.hint}>
        <div className={'w-full rounded-t-md ' + (d.value >= 90 ? 'bg-emerald-500' : d.value >= 75 ? 'bg-emerald-400' : d.value >= 50 ? 'bg-amber-400' : 'bg-rose-400')}
          style={{ height: Math.max(2, (d.value / max) * 100) + '%' }} />
        <div className="text-[9px] font-bold text-slate-500">{d.label}</div>
        <div className="text-[9px] font-black text-slate-700">{d.value}%</div>
      </div>
    ))}
  </div>;
}

function PctPill({ pct }: { pct: number }) {
  const cls = pct >= 90 ? 'bg-emerald-100 text-emerald-800'
    : pct >= 75 ? 'bg-emerald-50 text-emerald-700'
    : pct >= 50 ? 'bg-amber-50 text-amber-700'
    : 'bg-rose-50 text-rose-700';
  return <span className={'inline-block rounded-full px-3 py-1 text-[11px] font-black ' + cls}>{pct}%</span>;
}

