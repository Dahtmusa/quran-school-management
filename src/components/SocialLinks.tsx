'use client';

type SocialLinksProps = {
  links: Record<string, string | undefined>;
};

type SocialKey = 'facebook' | 'instagram' | 'youtube' | 'whatsapp' | 'tiktok';

const items: Array<{
  key: SocialKey;
  label: string;
  helper: string;
  card: string;
  icon: string;
}> = [
  { key: 'facebook', label: 'Facebook', helper: 'Like our page', card: 'from-[#1877f2] to-[#2456c4]', icon: 'facebook' },
  { key: 'instagram', label: 'Instagram', helper: 'Follow our journey', card: 'from-[#ffb347] via-[#ed1c74] to-[#7b2be2]', icon: 'instagram' },
  { key: 'youtube', label: 'YouTube', helper: 'Watch our videos', card: 'from-[#ff2738] to-[#d90012]', icon: 'youtube' },
  { key: 'whatsapp', label: 'WhatsApp', helper: 'Join our community', card: 'from-[#20d66b] to-[#00a94f]', icon: 'whatsapp' },
  { key: 'tiktok', label: 'TikTok', helper: 'Follow for short videos', card: 'tiktok', icon: 'tiktok' },
];

function normalizeUrl(value?: string) {
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function TikTokIcon() {
  const path = 'M12.525.02c1.31 0 2.61-.01 3.91-.02.07 1.53.58 3.09 1.63 4.17 1.04 1.11 2.52 1.62 4.01 1.79v3.96c-1.39-.05-2.78-.36-4.1-.96-.57-.25-1.1-.56-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.96-1.31 1.92-3.62 3.18-5.95 3.22-1.47.08-2.95-.32-4.18-1.09-2.04-1.25-3.39-3.49-3.5-5.88-.02-.5-.03-1.1.01-1.59.18-1.9 1.12-3.79 2.76-5.02 1.17-.89 2.6-1.49 4.07-1.56v3.99c-.99-.33-2.16-.24-3.04.35-.63.41-1.11 1.04-1.36 1.75-.21.51-.19 1.08-.18 1.61.24 1.66 1.82 3.07 3.49 3.15 1.11.08 2.24-.25 3.07-.99.89-.8 1.33-1.91 1.34-3.1.01-5.56-.02-11.1.03-16.65z';
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
      <path d={path} transform="translate(-1 1)" fill="#25F4EE" />
      <path d={path} transform="translate(1 -1)" fill="#FE2C55" />
      <path d={path} fill="#fff" />
    </svg>
  );
}

function SocialIcon({ name }: { name: SocialKey }) {
  if (name === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 fill-current">
        <path d="M13.5 21v-8h2.8l.4-3h-3.2V8.1c0-.9.3-1.6 1.7-1.6H17V3.8c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1V10H8v3h2.6v8h2.9Z" />
      </svg>
    );
  }

  if (name === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
        <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.5" cy="6.7" r="1.2" fill="currentColor" />
      </svg>
    );
  }

  if (name === 'youtube') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8">
        <path fill="currentColor" d="M21.35 7.08a3 3 0 0 0-2.11-2.12C17.38 4.45 12 4.45 12 4.45s-5.38 0-7.24.51A3 3 0 0 0 2.65 7.08 31 31 0 0 0 2.14 12a31 31 0 0 0 .51 4.92 3 3 0 0 0 2.11 2.12c1.86.51 7.24.51 7.24.51s5.38 0 7.24-.51a3 3 0 0 0 2.11-2.12A31 31 0 0 0 21.86 12a31 31 0 0 0-.51-4.92Z" />
        <path fill="#d90012" d="m10.3 15.4 5.5-3.4-5.5-3.4v6.8Z" />
      </svg>
    );
  }

  if (name === 'whatsapp') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 fill-current">
        <path d="M20.52 3.48A11.93 11.93 0 0 0 12.03.01a11.95 11.95 0 0 0-10.29 18.1L.5 23.5l5.5-1.2a11.96 11.96 0 0 0 17.99-10.32c0-3.2-1.24-6.2-3.47-8.5Zm-8.49 18.3a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.26.72.7-3.18-.24-.38a9.9 9.9 0 1 1 8.21 4.43Zm5.43-7.42c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.76.97-.93 1.17-.17.2-.34.22-.64.07-.3-.15-1.25-.46-2.39-1.47-.88-.78-1.48-1.74-1.65-2.04-.17-.3-.02-.46.13-.61.14-.14.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.21 5.08 4.5.71.31 1.26.5 1.69.64.71.23 1.35.2 1.86.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.18-1.42-.08-.12-.28-.19-.58-.34Z" />
      </svg>
    );
  }

  return <TikTokIcon />;
}

export function SocialLinks({ links }: SocialLinksProps) {
  const visible = items.filter((item) => !!links[item.key]);

  if (!visible.length) return null;

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_50%_20%,rgba(28,121,99,.3),transparent_45%),linear-gradient(135deg,#021d18,#062b23_58%,#03140f)] px-4 py-10 shadow-[0_24px_70px_rgba(0,0,0,.25)] sm:px-7 sm:py-12">
      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center gap-4 text-[#f3bf43]">
            <span className="hidden h-px w-16 bg-gradient-to-r from-transparent to-[#f3bf43]/80 sm:block" />
            <svg viewBox="0 0 64 64" aria-hidden="true" className="h-10 w-10 fill-current drop-shadow-[0_0_12px_rgba(243,191,67,.35)]">
              <path d="M10 54V28h8v-8h8v8h6V12h8v16h8v-8h8v34H10Zm8-6h6V34h-6v14Zm14 0h6V24h-6v24Zm14 0h6V34h-6v14ZM14 22h6v-4h-6v4Zm30 0h6v-4h-6v4Z" />
            </svg>
            <span className="hidden h-px w-16 bg-gradient-to-l from-transparent to-[#f3bf43]/80 sm:block" />
          </div>
          <h2 className="mt-3 font-serif text-4xl font-black tracking-tight text-white sm:text-5xl">Follow <span className="text-[#f3bf43]">Us</span></h2>
          <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-emerald-50/70 sm:text-base">Stay connected with AMQM for the latest news, updates and inspiring content.</p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 sm:gap-4">
          {visible.map((item) => {
            const isTikTok = item.key === 'tiktok';
            const href = normalizeUrl(links[item.key]);
            const card = isTikTok ? 'border-cyan-300/80 bg-[#070b0b]' : `bg-gradient-to-r ${item.card}`;
            const base = 'group relative flex min-h-[78px] w-full items-center gap-4 overflow-hidden rounded-[1.35rem] border px-4 py-3 text-left shadow-[0_14px_35px_rgba(0,0,0,.24)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(0,0,0,.3)] active:scale-[.985] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#f3bf43]/60 sm:min-h-[86px] sm:px-5';
            return (
              <a
                key={item.key}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={`${item.label}: ${item.helper}`}
                className={`${base} ${card} ${isTikTok ? 'sm:col-span-2' : ''}`}
                style={isTikTok ? { borderImage: 'linear-gradient(90deg,#25f4ee,#111 38%,#111 62%,#fe2c55) 1' } : undefined}
              >
                <span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,.22),0_7px_16px_rgba(0,0,0,.22)] backdrop-blur-sm sm:h-16 sm:w-16">
                  <span className="relative z-10 text-white"><SocialIcon name={item.key} /></span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-xl font-black tracking-tight ${isTikTok ? 'text-white' : 'text-white'} sm:text-2xl`}>{item.label}</span>
                  <span className="mt-0.5 block text-xs font-medium text-white/75 sm:text-sm">{item.helper}</span>
                </span>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-3xl text-white transition duration-200 group-hover:translate-x-1 group-hover:bg-white/15">›</span>
              </a>
            );
          })}
        </div>

        <div className="mt-9 flex items-center justify-center gap-3 text-center">
          <span className="hidden h-px w-24 bg-gradient-to-r from-transparent to-[#f3bf43]/70 sm:block" />
          <span className="text-2xl text-[#f3bf43]">♥</span>
          <span className="hidden h-px w-24 bg-gradient-to-l from-transparent to-[#f3bf43]/70 sm:block" />
        </div>
        <p className="mt-2 text-center text-sm font-medium tracking-wide text-emerald-50/70">Together for a brighter Ummah</p>
      </div>
    </section>
  );
}
