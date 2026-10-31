// Shared "do this now" tile used across admin, teacher, finance,
// admissions landing pages. One source of truth for the aesthetic
// the admin liked on the Digital Launch Readiness screen.
import Link from 'next/link';

export type PriorityStatus = 'ok' | 'warn' | 'alert' | 'neutral';

export function PriorityTile({ title, value, status, cta, href, note, onClick }:
  { title: string; value: string; status: PriorityStatus; cta: string; href?: string; note?: string; onClick?: () => void }) {
  const tone =
    status === 'ok'    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
  : status === 'warn'  ? 'border-amber-200   bg-amber-50   text-amber-900'
  : status === 'alert' ? 'border-rose-200    bg-rose-50    text-rose-900'
  :                      'border-slate-200   bg-white      text-slate-900';
  const btn =
    status === 'ok'    ? 'bg-emerald-700 text-white hover:bg-emerald-800'
  : status === 'warn'  ? 'bg-amber-600   text-white hover:bg-amber-700'
  : status === 'alert' ? 'bg-rose-600    text-white hover:bg-rose-700'
  :                      'bg-slate-900   text-white hover:bg-slate-800';
  // Auto-shrink the value font if the string is long so exact numbers
  // like "₦11,620,000" fit the tile without overflow or truncation.
  const vLen = value.length;
  const valueSize =
      vLen <= 8  ? 'text-3xl'
    : vLen <= 11 ? 'text-2xl'
    : vLen <= 14 ? 'text-xl'
    :              'text-lg';
  const inner = <>
    <div className="text-[10px] font-black uppercase tracking-wider opacity-70 truncate">{title}</div>
    <div className={`mt-1 ${valueSize} font-black tabular-nums tracking-tight break-words`}>{value}</div>
    {note && <div className="mt-1 line-clamp-2 text-[11px] opacity-80">{note}</div>}
    <span className={`mt-4 inline-flex items-center justify-center rounded-xl px-3 py-2 text-xs font-black transition ${btn}`}>
      {cta} →
    </span>
  </>;
  const cls = `flex flex-col rounded-2xl border-2 p-5 ${tone}`;
  if (href)   return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls + ' text-left'}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function PriorityTileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}
