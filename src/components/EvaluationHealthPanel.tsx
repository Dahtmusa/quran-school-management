'use client';
// One list of everything that would stop a teacher evaluating correctly or an
// admin trusting the result. Backed by admin_evaluation_health_check().
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Issue = { severity: 'error' | 'warning' | 'info'; area: string; subject: string; detail: string; how_to_fix: string };

const STYLE = {
  error:   { box: 'border-rose-300 bg-rose-50',    chip: 'bg-rose-600 text-white',    label: 'Must fix' },
  warning: { box: 'border-amber-300 bg-amber-50',  chip: 'bg-amber-500 text-white',   label: 'Check' },
  info:    { box: 'border-slate-200 bg-slate-50',  chip: 'bg-slate-500 text-white',   label: 'FYI' },
} as const;

export default function EvaluationHealthPanel() {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error } = await createClient().rpc('admin_evaluation_health_check');
    if (error) setError(error.message); else setIssues((data || []) as Issue[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const m = new Map<string, { severity: Issue['severity']; area: string; how_to_fix: string; items: Issue[] }>();
    for (const i of issues || []) {
      const k = i.severity + '|' + i.area;
      if (!m.has(k)) m.set(k, { severity: i.severity, area: i.area, how_to_fix: i.how_to_fix, items: [] });
      m.get(k)!.items.push(i);
    }
    return [...m.values()];
  }, [issues]);

  const errors = (issues || []).filter(i => i.severity === 'error').length;
  const warnings = (issues || []).filter(i => i.severity === 'warning').length;

  return <section className={`rounded-2xl border-2 p-4 ${errors ? 'border-rose-300 bg-white' : warnings ? 'border-amber-300 bg-white' : 'border-emerald-300 bg-emerald-50'}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-[11px] font-black uppercase tracking-[.18em] text-slate-500">Evaluation health check</div>
        <div className="mt-0.5 text-lg font-black text-slate-900">
          {issues === null ? 'Checking…'
            : errors === 0 && warnings === 0 ? '✓ Everything is in order'
            : `${errors} to fix · ${warnings} to check`}
        </div>
      </div>
      <button className="btn bg-slate-100 text-sm" disabled={loading} onClick={load}>{loading ? 'Checking…' : 'Re-check'}</button>
    </div>
    {error && <div className="mt-2 text-xs font-bold text-rose-700">{error}</div>}

    {groups.length > 0 && <div className="mt-3 space-y-2">
      {groups.map(g => {
        const key = g.severity + '|' + g.area;
        const s = STYLE[g.severity];
        return <div key={key} className={`rounded-xl border ${s.box}`}>
          <button type="button" className="flex w-full items-center justify-between gap-3 p-3 text-left" onClick={() => setOpen(open === key ? null : key)}>
            <span className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${s.chip}`}>{s.label}</span>
              <span className="text-sm font-black text-slate-900">{g.area}</span>
              <span className="text-xs font-bold text-slate-500">({g.items.length})</span>
            </span>
            <span className="text-xs font-bold text-slate-500">{open === key ? 'Hide' : 'Show'}</span>
          </button>
          {open === key && <div className="border-t border-black/5 px-3 pb-3">
            <div className="mt-2 text-xs font-bold text-slate-700">How to fix: {g.how_to_fix}</div>
            <ul className="mt-2 space-y-1.5">
              {g.items.map((i, n) => <li key={n} className="rounded-lg bg-white/80 p-2 text-xs">
                <b className="text-slate-900">{i.subject}</b>
                <div className="text-slate-600">{i.detail}</div>
              </li>)}
            </ul>
          </div>}
        </div>;
      })}
    </div>}
  </section>;
}
