export default function MemorizationBadge({ direction }: { direction?: string | null }) {
  if (!direction) return null;
  const isBtoN = direction === 'baqarah_to_nas' || direction === 'Baqarah-to-Nas';
  return (
    <span className={`pill text-[11px] font-black ${isBtoN ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700'}`}>
      {isBtoN ? 'Baqarah → Nās' : 'Nās → Baqarah'}
    </span>
  );
}
