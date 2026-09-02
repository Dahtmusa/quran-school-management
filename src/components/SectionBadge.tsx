export default function SectionBadge({section}:{section:'Day'|'Boarding'|string|null|undefined}){
  const isBoarding=String(section).toLowerCase()==='boarding';
  const label=isBoarding?'Boarding':'Day';
  return <span title={`Student section: ${label}`} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${isBoarding?'border-indigo-200 bg-indigo-50 text-indigo-700':'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{label}</span>;
}
