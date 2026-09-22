'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LeadershipSection } from '@/components/LeadershipSection';
import { TeachingStaffSection } from '@/components/TeachingStaffSection';
import {
  loadCMSSections,
  loadCMSSettings,
  loadPublicHomepageMedia,
  loadPublicNewsPosts,
  loadPublicTeam,
  loadPublicTeachers,
  type CMSSection,
} from '@/lib/cms-live-store';

const fallbackNav = [
  { label: 'Home', href: '/' },
  { label: 'About Us', href: '/about' },
  { label: 'Programs', href: '/programs' },
  { label: 'Admissions', href: '/admissions' },
  { label: 'Campus Life', href: '/campus-life' },
  { label: 'News & Events', href: '/news' },
  { label: 'Contact Us', href: '#contact' },
];

const iconMap: Record<string, string> = {
  book: '◈',
  people: '♧',
  teacher: '◇',
  star: '✦',
  chart: '▥',
  shield: '⬡',
  mosque: '⌂',
  heart: '♡',
};

function sectionMap(items: CMSSection[]) {
  return Object.fromEntries(items.map((item) => [item.section_key, item])) as Record<string, CMSSection>;
}

function normalizeUrl(value?: string) {
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function SocialBrandIcon({brand}:{brand:'tiktok'|'youtube'|'facebook'|'whatsapp'}){
  const common={viewBox:'0 0 48 48',fill:'none',xmlns:'http://www.w3.org/2000/svg'};
  if(brand==='youtube') return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#ff0033] shadow-sm"><svg {...common} className="h-6 w-6"><path d="M41.6 14.1a5 5 0 0 0-3.5-3.5C35 9.8 24 9.8 24 9.8s-11 0-14.1.8a5 5 0 0 0-3.5 3.5C5.6 17.2 5.6 24 5.6 24s0 6.8.8 9.9a5 5 0 0 0 3.5 3.5c3.1.8 14.1.8 14.1.8s11 0 14.1-.8a5 5 0 0 0 3.5-3.5c.8-3.1.8-9.9.8-9.9s0-6.8-.8-9.9Z" fill="white"/><path d="m20.2 30.3 9.6-6.3-9.6-6.3v12.6Z" fill="#ff0033"/></svg></span>;
  if(brand==='facebook') return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#1877F2] shadow-sm"><svg {...common} className="h-8 w-8"><path d="M27 42V26h5.4l.8-6H27v-3.8c0-1.7.5-2.9 3-2.9h3.3V8a45 45 0 0 0-4.8-.3c-4.8 0-8.1 2.9-8.1 8.2V20h-5.5v6h5.5v16h6.6Z" fill="white"/></svg></span>;
  if(brand==='whatsapp') return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#25D366] shadow-sm"><svg {...common} className="h-7 w-7"><path d="M24 7.5a16.5 16.5 0 0 0-14.1 25l-2.1 7.6 7.8-2A16.5 16.5 0 1 0 24 7.5Z" stroke="white" strokeWidth="3"/><path d="M18.5 16.8c.4-.8.8-.8 1.4-.8.3 0 .6 0 .9.7l1.1 2.6c.2.5.1.8-.2 1.2l-.8.9c1 1.9 2.5 3.3 4.5 4.2l.8-.9c.4-.5.8-.6 1.3-.3l2.5 1.2c.6.3.8.6.7 1.1-.2 1.5-1.5 2.8-3 3-2.1.3-5.3-1.1-8-3.4-2.7-2.3-4.4-5.3-4.5-7.4-.1-1.4.6-2.7 1.7-3.1l1.6-.1Z" fill="white"/></svg></span>;
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-black shadow-sm"><svg {...common} className="h-7 w-7"><path d="M29.5 10.2c1.2 1.6 2.8 2.6 4.8 2.7v4.1c-1.9-.1-3.5-.6-5-1.5v9.8c0 5.8-4.1 9.4-9 9.4-4.5 0-7.9-3.3-7.9-7.6 0-4.8 4.2-8.2 9.1-7.5v4.2c-2.2-.7-4.6.6-4.6 3 0 1.8 1.5 3.5 3.5 3.5 2.2 0 3.9-1.4 3.9-4.2V10.2h5.2Z" fill="white"/></svg></span>;
}

export default function PublicHomepageSchool() {
  const [sections, setSections] = useState<CMSSection[]>([]);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [team, setTeam] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [media, setMedia] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [menu, setMenu] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadCMSSections(),
      loadCMSSettings(),
      loadPublicTeam(),
      loadPublicTeachers(),
      loadPublicHomepageMedia(),
      loadPublicNewsPosts(6),
    ])
      .then(([cmsSections, cmsSettings, publicTeam, publicTeachers, publicMedia, publicNews]) => {
        if (!active) return;
        setSections(cmsSections);
        setSettings(cmsSettings);
        setTeam(publicTeam);
        setTeachers(publicTeachers);
        setMedia(publicMedia);
        setNews(publicNews);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const content = useMemo(() => sectionMap(sections), [sections]);
  const hero = content.hero?.content || {};
  const about = content.about?.content || {};
  const mission = content.mission_vision?.content || {};
  const programme = content.programme?.content || {};
  const stats = content.stats?.content?.items || [];
  const features = content.features?.content?.items || [];
  const testimonials = content.testimonials?.content?.items || [];
  const campuses = content.campuses?.content?.items || [];

  const schoolName = settings.school_name?.value || "Aliyu & Maimuna Center for Qur'anic Memorization";
  const shortName = settings.short_name?.value || 'AMQM';
  const logo = settings.logo_url?.value || '';
  const tagline = settings.tagline?.value || "Qur'an memorization, knowledge, character and excellence.";
  const contact = settings.contact || {};
  const social = settings.social_links || {};
  const portal = settings.admission_portal || {};
  const nav = settings.nav?.links?.length ? settings.nav.links : fallbackNav;

  const today = new Date().toISOString().slice(0, 10);
  const admissionOpen =
    portal.enabled === true &&
    (!portal.opening_date || today >= portal.opening_date) &&
    (!portal.closing_date || today <= portal.closing_date);

  const imageMedia = media.filter((item) => item.media_type === 'image' && item.public_url);
  const heroImage = hero.hero_image || imageMedia[0]?.public_url;
  const aboutImage = imageMedia.find((item) => item.public_url !== heroImage)?.public_url || imageMedia[1]?.public_url;

  const leadership = team.filter((person) => {
    const category = String(person.category || '').toLowerCase();
    const role = String(person.role_title || '').toLowerCase();
    return category.includes('lead') || /director|supervisor|principal|head|management/.test(role);
  });
  const otherTeam = team.filter((person) => !leadership.includes(person));
  const teacherList = [...otherTeam, ...teachers.filter((teacher) => !otherTeam.some((person) => person.full_name === teacher.full_name))];

  const fallbackTestimonials = [
    {
      quote: 'AMQM has given my daughter a solid foundation in Qur’anic knowledge and good character.',
      name: 'Hajiya Amina Bello',
      role: 'Parent',
      image_url: '/images/testimonials/parents-composite.jpg',
      sprite: true,
    },
    {
      quote: 'The discipline and values my son has learned at AMQM have made a real difference in his life.',
      name: 'Alh. Ibrahim Usman',
      role: 'Parent',
      image_url: '/images/testimonials/parents-composite.jpg',
      sprite: true,
    },
    {
      quote: 'The teachers are caring and attentive. We are happy to see our child grow in both knowledge and character.',
      name: 'Hajiya Zainab Abdullahi',
      role: 'Parent',
      image_url: '/images/testimonials/parents-composite.jpg',
      sprite: true,
    },
    {
      quote: 'AMQM has created a safe and nurturing environment. We are grateful for the positive change we see in our child.',
      name: 'Alh. Abdulrahman Sani',
      role: 'Parent',
      image_url: '/images/testimonials/parents-composite.jpg',
      sprite: true,
    },
  ];

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f7f5ef]">
        <div className="h-1 bg-[#caa24a]" />
        <div className="h-20 border-b border-[#e7e2d8] bg-[#fbfaf6]" />
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
          <div className="h-[560px] animate-pulse rounded-[2rem] bg-[#dfe8e3]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f8f6f0] text-[#143d35]">
      <div className="h-1 bg-[#c9a34b]" />

      <div className="hidden border-b border-[#0e4239] bg-[#062d28] text-[11px] text-white/80 md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-2">
          <span>{contact.address || 'Yola, Adamawa State, Nigeria'}</span>
          <div className="flex items-center gap-5">
            {contact.phone && <span>{contact.phone}</span>}
            {admissionOpen && <span className="font-bold text-[#f2cf78]">Admissions Open</span>}
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-[#e7e2d8]/90 bg-[#fbfaf6]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[78px] max-w-7xl items-center justify-between gap-6 px-5 sm:px-8 lg:px-10">
          <Link href="/" className="flex min-w-0 items-center gap-3.5">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-[#d9cfb9] bg-white shadow-sm">
              {logo ? (
                <img src={logo} alt={`${shortName} logo`} className="h-full w-full object-contain" />
              ) : (
                <span className="font-serif text-lg font-black text-[#075848]">AM</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-serif text-xl font-black tracking-tight text-[#073b32]">{shortName}</div>
              <div className="hidden max-w-[340px] truncate text-[9px] font-bold uppercase tracking-[.13em] text-slate-500 sm:block">
                {schoolName}
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 lg:flex">
            {nav.slice(0, 7).map((item: any) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-[13px] font-bold text-slate-600 transition-colors hover:text-[#075848]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/auth/login"
              className="hidden rounded-full px-3 py-2 text-[13px] font-bold text-slate-600 hover:text-[#075848] sm:inline-flex"
            >
              Portal
            </Link>
            {admissionOpen && (
              <Link
                href="/admissions"
                className="rounded-full bg-[#075848] px-5 py-2.5 text-[13px] font-black text-white shadow-sm transition hover:bg-[#06473b] hover:shadow-md"
              >
                Apply Now
              </Link>
            )}
            <button
              type="button"
              onClick={() => setMenu(true)}
              className="grid h-10 w-10 place-items-center rounded-full bg-[#edf2ee] text-[#075848] lg:hidden"
              aria-label="Open navigation"
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {menu && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
            className="absolute inset-0 bg-[#062d28]/60"
          />
          <aside className="absolute right-0 top-0 flex h-full w-[88vw] max-w-sm flex-col bg-[#fbfaf6] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e5dfd3] pb-5">
              <span className="font-serif text-xl font-black text-[#073b32]">{shortName}</span>
              <button
                type="button"
                onClick={() => setMenu(false)}
                className="grid h-10 w-10 place-items-center rounded-full bg-[#edf2ee] text-2xl text-[#075848]"
                aria-label="Close navigation"
              >
                ×
              </button>
            </div>
            <nav className="mt-6 grid gap-2">
              {nav.map((item: any) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMenu(false)}
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-[#173f38] shadow-sm ring-1 ring-[#e8e2d8]"
                >
                  <span>{item.label}</span>
                  <span>→</span>
                </Link>
              ))}
            </nav>
            <Link
              href="/auth/login"
              onClick={() => setMenu(false)}
              className="mt-auto rounded-2xl bg-[#075848] px-4 py-3.5 text-center text-sm font-black text-white"
            >
              Student & Parent Portal
            </Link>
          </aside>
        </div>
      )}

      <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        <div className="relative isolate min-h-[610px] overflow-hidden rounded-[2rem] bg-[#06342d] shadow-[0_24px_70px_rgba(7,58,50,.14)] sm:min-h-[650px]">
          {heroImage ? (
            <img
              src={heroImage}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(202,163,75,.34),transparent_23%),linear-gradient(125deg,#052a24,#086250)]" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,35,30,.97)_0%,rgba(4,54,46,.88)_48%,rgba(4,54,46,.32)_100%)]" />
          <div className="absolute inset-y-0 right-0 hidden w-[42%] bg-[radial-gradient(circle_at_55%_48%,rgba(202,163,75,.16),transparent_48%)] lg:block" />

          <div className="relative flex min-h-[610px] items-end sm:min-h-[650px]">
            <div className="max-w-3xl px-7 pb-12 pt-24 sm:px-12 sm:pb-16 lg:px-16 lg:pb-20">
              <div className="inline-flex rounded-full border border-[#e6c978]/30 bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-[.22em] text-[#f1d47e]">
                {hero.eyebrow || schoolName}
              </div>
              <h1 className="mt-7 max-w-3xl whitespace-pre-line font-serif text-5xl font-black leading-[.98] tracking-[-.035em] text-white sm:text-6xl lg:text-[76px]">
                {hero.title || "Memorising the Qur’an.\nBuilding character.\nServing the Ummah."}
              </h1>
              <p className="mt-7 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
                {hero.subtitle || tagline}
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                {admissionOpen && (
                  <Link
                    href={hero.primary_href || '/admissions'}
                    className="rounded-full bg-[#d3ad55] px-6 py-3.5 text-sm font-black text-[#082f29] shadow-lg transition hover:-translate-y-0.5 hover:bg-[#e1be68]"
                  >
                    {hero.primary_cta || 'Begin an application'} →
                  </Link>
                )}
                <Link
                  href={hero.secondary_href || '/about'}
                  className="rounded-full border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-black text-white backdrop-blur transition hover:bg-white/15"
                >
                  {hero.secondary_cta || 'Discover AMQM'}
                </Link>
              </div>
            </div>

            <div className="absolute bottom-7 right-7 hidden max-w-[250px] rounded-3xl border border-white/15 bg-[#052d27]/70 p-5 text-white backdrop-blur-md lg:block">
              <div className="text-[10px] font-black uppercase tracking-[.2em] text-[#e9c86f]">Our promise</div>
              <p className="mt-3 font-serif text-xl font-bold leading-7">
                {hero.card_title || 'A caring environment for Qur’an, knowledge and character.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {stats.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 py-5 sm:px-8 lg:px-10">
          <div className="grid overflow-hidden rounded-2xl border border-[#dfd7c6] bg-[#fffdf8] shadow-sm sm:grid-cols-4">
            {stats.slice(0, 4).map((stat: any, index: number) => (
              <div
                key={index}
                className="border-b border-[#e9e2d5] px-5 py-5 text-center last:border-0 sm:border-b-0 sm:border-r"
              >
                <div className="font-serif text-2xl font-black text-[#075848]">{stat.value}</div>
                <div className="mt-1 text-[10px] font-black uppercase tracking-[.15em] text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="about" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[.88fr_1.12fr] lg:gap-20">
          <div className="relative">
            <div className="absolute -left-3 -top-3 h-24 w-24 rounded-full border border-[#d8bd70]/50" />
            <div className="relative overflow-hidden rounded-[2rem] bg-[#e5ece7] shadow-[0_24px_60px_rgba(7,58,50,.12)]">
              {aboutImage ? (
                <img
                  src={aboutImage}
                  alt={about.title || 'AMQM students'}
                  className="aspect-[4/5] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center bg-[#0a5949] font-serif text-7xl font-black text-[#e7c86e]">AM</div>
              )}
              <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/20 bg-[#06342d]/90 p-5 text-white backdrop-blur">
                <div className="text-[10px] font-black uppercase tracking-[.18em] text-[#edcd72]">At the heart of AMQM</div>
                <div className="mt-2 font-serif text-2xl font-black">Faith that shapes a life.</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#0a755f]">About AMQM</div>
            <h2 className="mt-4 max-w-3xl font-serif text-4xl font-black leading-[1.08] tracking-tight text-[#073b32] sm:text-5xl">
              {about.title || 'Nurturing hearts with the Qur’an, building lives with knowledge.'}
            </h2>
            <p className="mt-6 max-w-2xl text-[15px] leading-8 text-slate-600">
              {about.text ||
                "AMQM combines Qur’an memorisation, Islamic education, discipline and pastoral care in a safe, supportive environment where students can grow in knowledge, confidence and character."}
            </p>
            <section className="amqm-geometry-showcase" aria-label="AMQM programmes and features">
              <div className="amqm-geometry-titlebar">
                <div className="amqm-geometry-title-number">4</div>
                <div>
                  <h3>Islamic Geometry</h3>
                  <p>Traditional touch with modern design</p>
                </div>
              </div>

              <div className="amqm-geometry-features">
                {features.slice(0, 4).map((feature: any, index: number) => {
                  const featureImage = feature.image_url || feature.image || feature.photo_url || imageMedia[index + 1]?.public_url || imageMedia[index]?.public_url || aboutImage || heroImage;
                  return (
                    <article key={index} className="amqm-geometry-feature">
                      <div className="amqm-geometry-feature-art">
                        {featureImage ? (
                          <img
                            src={featureImage}
                            alt={feature.title || 'AMQM programme'}
                            className="amqm-geometry-feature-image"
                            loading="lazy"
                          />
                        ) : (
                          <div className="amqm-geometry-feature-image amqm-geometry-image-fallback">
                            <span>{String(feature.title || 'AMQM').slice(0, 1)}</span>
                          </div>
                        )}
                      </div>
                      <div className="amqm-geometry-feature-title">{feature.title}</div>
                      <p>{feature.excerpt || feature.text}</p>
                      <div className="amqm-geometry-feature-bottom">
                        <span>0{index + 1}</span>
                        <span className="amqm-geometry-arrow">↗</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <style jsx>{`
              .amqm-geometry-showcase{
                position:relative;
                overflow:hidden;
                margin-top:2rem;
                padding:1rem 1rem 1.05rem;
                color:#fff;
                border:1px solid rgba(225,199,104,.72);
                border-radius:2px;
                background:
                  radial-gradient(circle at 50% 12%,rgba(52,137,111,.20),transparent 30%),
                  linear-gradient(135deg,#073f35 0%,#062f2a 48%,#063a31 100%);
                box-shadow:0 16px 38px rgba(4,43,36,.18);
                isolation:isolate;
              }
              .amqm-geometry-showcase:before{
                content:"";
                position:absolute;
                inset:0;
                z-index:-1;
                opacity:.34;
                background-image:
                  linear-gradient(30deg,rgba(221,194,98,.30) 12%,transparent 12.5%,transparent 87%,rgba(221,194,98,.30) 87.5%),
                  linear-gradient(150deg,rgba(221,194,98,.30) 12%,transparent 12.5%,transparent 87%,rgba(221,194,98,.30) 87.5%),
                  linear-gradient(30deg,rgba(221,194,98,.12) 12%,transparent 12.5%,transparent 87%,rgba(221,194,98,.12) 87.5%),
                  linear-gradient(150deg,rgba(221,194,98,.12) 12%,transparent 12.5%,transparent 87%,rgba(221,194,98,.12) 87.5%);
                background-position:0 0,0 0,17px 30px,17px 30px;
                background-size:34px 60px;
                mask-image:linear-gradient(to bottom,black 0%,black 62%,transparent 100%);
                animation:amqmGeometryPattern 20s linear infinite;
              }
              .amqm-geometry-showcase:after{
                content:"";
                position:absolute;
                left:-15%;
                right:-15%;
                bottom:-60%;
                height:95%;
                z-index:-1;
                border-radius:50%;
                border:1px solid rgba(222,195,102,.18);
                box-shadow:0 0 0 28px rgba(222,195,102,.04),0 0 0 56px rgba(222,195,102,.025);
              }
              .amqm-geometry-titlebar{
                display:flex;
                align-items:center;
                gap:.7rem;
                padding:.1rem .2rem .8rem;
              }
              .amqm-geometry-title-number{
                display:grid;
                place-items:center;
                width:2.35rem;
                height:2.35rem;
                flex:none;
                border:1px solid #dfc56c;
                border-radius:999px;
                color:#062f2a;
                background:linear-gradient(145deg,#f1d77d,#cda84b);
                font:900 1.25rem/1 Georgia,serif;
                box-shadow:0 4px 12px rgba(0,0,0,.22);
              }
              .amqm-geometry-titlebar h3{
                margin:0;
                color:#fff;
                font:900 1.08rem/1.1 Georgia,serif;
              }
              .amqm-geometry-titlebar p{
                margin:.15rem 0 0;
                color:rgba(242,249,246,.78);
                font:500 .68rem/1.25 Inter,system-ui,sans-serif;
              }
              .amqm-geometry-features{
                display:grid;
                grid-template-columns:repeat(4,minmax(0,1fr));
                gap:.55rem;
              }
              .amqm-geometry-feature{
                position:relative;
                min-width:0;
                min-height:13.4rem;
                padding:.7rem .62rem .55rem;
                overflow:hidden;
                border:1px solid rgba(231,201,103,.92);
                border-radius:1.35rem 1.35rem .75rem .75rem;
                background:linear-gradient(180deg,rgba(6,59,50,.72),rgba(3,48,42,.86));
                box-shadow:inset 0 0 0 1px rgba(255,255,255,.035),0 8px 18px rgba(0,0,0,.13);
                transition:transform .55s cubic-bezier(.2,.8,.2,1),box-shadow .55s,border-color .55s;
                animation:amqmGeometryCardIn .75s cubic-bezier(.2,.8,.2,1) both;
              }
              .amqm-geometry-feature:nth-child(1){animation-delay:.06s}
              .amqm-geometry-feature:nth-child(2){animation-delay:.16s}
              .amqm-geometry-feature:nth-child(3){animation-delay:.26s}
              .amqm-geometry-feature:nth-child(4){animation-delay:.36s}
              .amqm-geometry-feature:before{
                content:"";
                position:absolute;
                inset:0;
                background:linear-gradient(140deg,rgba(255,255,255,.10),transparent 30%,transparent 70%,rgba(216,188,93,.06));
                pointer-events:none;
              }
              .amqm-geometry-feature:hover{
                transform:translateY(-7px);
                border-color:#f1d675;
                box-shadow:0 18px 30px rgba(0,0,0,.24),0 0 0 1px rgba(241,214,117,.14);
              }
              .amqm-geometry-feature-art{
                display:grid;
                place-items:center;
                height:5.1rem;
              }
              .amqm-geometry-icon{
                display:grid;
                place-items:center;
                width:4.1rem;
                height:4.1rem;
                font-size:2.65rem;
                line-height:1;
                filter:drop-shadow(0 8px 7px rgba(0,0,0,.22));
                transform:translateY(0);
                animation:amqmGeometryIcon 3.6s ease-in-out infinite;
              }
              .amqm-geometry-feature:nth-child(2) .amqm-geometry-icon{animation-delay:-.8s}
              .amqm-geometry-feature:nth-child(3) .amqm-geometry-icon{animation-delay:-1.6s}
              .amqm-geometry-feature:nth-child(4) .amqm-geometry-icon{animation-delay:-2.4s}
              .amqm-geometry-feature-title{
                position:relative;
                min-height:2.25rem;
                margin-top:.05rem;
                color:#fff;
                font:900 .82rem/1.08 Georgia,serif;
                text-shadow:0 1px 1px rgba(0,0,0,.22);
              }
              .amqm-geometry-feature p{
                position:relative;
                min-height:3.7rem;
                margin:.35rem 0 0;
                color:rgba(241,249,246,.78);
                font:500 .61rem/1.45 Inter,system-ui,sans-serif;
              }
              .amqm-geometry-feature-bottom{
                position:absolute;
                left:.62rem;
                right:.62rem;
                bottom:.55rem;
                display:flex;
                align-items:center;
                justify-content:space-between;
                color:#e4c65f;
                font:900 .72rem/1 Inter,system-ui,sans-serif;
              }
              .amqm-geometry-arrow{
                display:grid;
                place-items:center;
                width:1.65rem;
                height:1.65rem;
                border-radius:999px;
                color:#073b32;
                background:#efd372;
                font-size:1rem;
                box-shadow:0 3px 9px rgba(0,0,0,.22);
                transition:transform .45s ease;
              }
              .amqm-geometry-feature:hover .amqm-geometry-arrow{transform:rotate(45deg) scale(1.08)}
              @keyframes amqmGeometryCardIn{
                from{opacity:0;transform:translateY(18px) scale(.97)}
                to{opacity:1;transform:translateY(0) scale(1)}
              }
              @keyframes amqmGeometryIcon{
                0%,100%{transform:translateY(0) rotate(0)}
                50%{transform:translateY(-5px) rotate(-2deg)}
              }
              @keyframes amqmGeometryPattern{to{background-position:34px 60px,34px 60px,51px 90px,51px 90px}}
              @media(max-width:820px){
                .amqm-geometry-features{
                  grid-template-columns:repeat(2,minmax(0,1fr));
                }
              }
              @media(max-width:520px){
                .amqm-geometry-showcase{padding:.8rem .7rem .8rem}
                .amqm-geometry-features{
                  display:flex;
                  overflow-x:auto;
                  scroll-snap-type:x mandatory;
                  padding-bottom:.25rem;
                }
                .amqm-geometry-feature{
                  flex:0 0 72%;
                  scroll-snap-align:start;
                }
                .amqm-geometry-titlebar h3{font-size:.98rem}
              }
              @media(prefers-reduced-motion:reduce){
                .amqm-geometry-showcase:before,
                .amqm-geometry-feature,
                .amqm-geometry-icon{animation:none!important}
                .amqm-geometry-feature,.amqm-geometry-arrow{transition:none!important}
              }
            `}</style>

            <Link
              href="/about"
              className="mt-8 inline-flex rounded-full bg-[#075848] px-5 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-[#06483c]"
            >
              Learn more about AMQM →
            </Link>
          </div>
        </div>
      </section>

      {(mission.mission || mission.vision) && (
        <section className="border-y border-[#e5dfd2] bg-[#f0f3ed]">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
            <div className="max-w-2xl">
              <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#0a755f]">Our direction</div>
              <h2 className="mt-3 font-serif text-4xl font-black text-[#073b32] sm:text-5xl">Purpose with a clear path.</h2>
            </div>
            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              <article className="rounded-[1.75rem] bg-[#06342d] p-8 text-white shadow-xl lg:p-10">
                <div className="text-sm font-black text-[#e8c76c]">01</div>
                <h3 className="mt-6 font-serif text-3xl font-black">{mission.mission_title || 'Our Mission'}</h3>
                <p className="mt-4 text-sm leading-7 text-emerald-50/75">{mission.mission}</p>
              </article>
              <article className="rounded-[1.75rem] border border-[#dfd6c5] bg-white p-8 shadow-sm lg:p-10">
                <div className="text-sm font-black text-[#b3882b]">02</div>
                <h3 className="mt-6 font-serif text-3xl font-black text-[#073b32]">{mission.vision_title || 'Our Vision'}</h3>
                <p className="mt-4 text-sm leading-7 text-slate-600">{mission.vision}</p>
              </article>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#0a755f]">The Qur’anic journey</div>
            <h2 className="mt-3 font-serif text-4xl font-black text-[#073b32] sm:text-5xl">
              {programme.title || 'A structured journey, one step at a time.'}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
              {programme.text ||
                'Students begin from an assigned starting point and continue through memorisation, revision and regular assessment. Their journey continues across school years until completion.'}
            </p>
          </div>
          <Link href="/programs" className="shrink-0 text-sm font-black text-[#075848]">
            Explore the programme →
          </Link>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(programme.items?.length
            ? programme.items
            : [
                { title: 'Begin', text: 'Each student receives an official starting point.' },
                { title: 'Memorise', text: 'Daily learning and revision build lasting retention.' },
                { title: 'Evaluate', text: 'Progress is reviewed through regular assessments.' },
                { title: 'Complete', text: 'The full journey is recognised and preserved.' },
              ]
          )
            .slice(0, 4)
            .map((item: any, index: number) => (
              <article key={index} className="rounded-[1.5rem] border border-[#e1dcd1] bg-white p-6 shadow-sm">
                <div className="font-serif text-4xl font-black text-[#c39b3e]">0{index + 1}</div>
                <h3 className="mt-5 text-base font-black text-[#073b32]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.excerpt || item.text}</p>
              </article>
            ))}
        </div>
      </section>

      {leadership.length > 0 && (
        <LeadershipSection leaders={leadership} shortName={shortName} />
      )}

      {teacherList.length > 0 && (
        <TeachingStaffSection teachers={teacherList} />
      )}

      {campuses.length > 0 && (
        <section className="border-y border-[#e5dfd2] bg-[#f0f3ed]">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
            <div className="flex items-end justify-between gap-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#0a755f]">Campus life</div>
                <h2 className="mt-3 font-serif text-4xl font-black text-[#073b32] sm:text-5xl">A place to learn and grow.</h2>
              </div>
              <Link href="/campus-life" className="hidden text-sm font-black text-[#075848] sm:block">Explore campus life →</Link>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {campuses.slice(0, 3).map((campus: any, index: number) => (
                <article key={index} className="group overflow-hidden rounded-[1.5rem] bg-white shadow-sm ring-1 ring-[#e2ddd3]">
                  <div className="aspect-[16/10] overflow-hidden bg-[#0a4a3e]">
                    {campus.image_url ? (
                      <img src={campus.image_url} alt={campus.image_url_alt || campus.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="h-full bg-[radial-gradient(circle_at_50%_25%,rgba(202,163,75,.3),transparent_25%),linear-gradient(135deg,#06342d,#0a6553)]" />
                    )}
                  </div>
                  <div className="p-6">
                    <h3 className="font-serif text-xl font-black text-[#073b32]">{campus.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{campus.excerpt || campus.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="rounded-[2rem] bg-white px-4 py-8 sm:px-8 lg:px-10 lg:py-12">
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-7">
            {(testimonials.length ? testimonials : fallbackTestimonials).slice(0, 4).map((item: any, index: number) => {
              const name = item.name || ['Hajiya Amina Bello', 'Alh. Ibrahim Usman', 'Hajiya Zainab Abdullahi', 'Alh. Abdulrahman Sani'][index];
              const spritePosition = ['0%', '33.3333%', '66.6667%', '100%'][index] || '0%';
              const image = item.image_url || item.image;
              const isSprite = item.sprite === true && image && /parents-composite(?:\.|$)/i.test(String(image));
              const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase();
              return (
                <article key={index} className="min-w-0 text-center">
                  <div
                    className="mx-auto aspect-square w-full max-w-[285px] overflow-hidden rounded-full border-[5px] border-[#f1dfb3] bg-[#e9e3d7] shadow-[0_12px_30px_rgba(6,52,45,.10)]"
                    style={isSprite ? {
                      backgroundImage: `url(${image})`,
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: '400% 100%',
                      backgroundPosition: `${spritePosition} 0%`,
                    } : undefined}
                  >
                    {!isSprite && image ? (
                      <img src={image} alt={name} className="h-full w-full object-cover" />
                    ) : !isSprite ? (
                      <div className="grid h-full w-full place-items-center bg-[#0b4d42] font-serif text-4xl font-black text-white">
                        {initials}
                      </div>
                    ) : null}
                  </div>

                  <h3 className="mt-5 font-serif text-[clamp(1.35rem,2.1vw,2rem)] font-black leading-tight tracking-[-.025em] text-[#0a4a40]">
                    {name}
                  </h3>

                  <div className="mx-auto mt-3 inline-flex rounded-full border-2 border-[#e8c875] px-6 py-1.5 text-[11px] font-black uppercase tracking-[.16em] text-[#c49a3b]">
                    {item.role || item.relation || 'Parent'}
                  </div>

                  <p className="mx-auto mt-4 max-w-[330px] text-[15px] leading-6 text-[#314b47]">
                    “{item.quote || item.text || item.excerpt}”
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {news.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:px-10 lg:pb-28">
          <div className="flex items-end justify-between gap-5">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#0a755f]">From the school</div>
              <h2 className="mt-3 font-serif text-4xl font-black text-[#073b32] sm:text-5xl">Latest news & events.</h2>
            </div>
            <Link href="/news" className="text-sm font-black text-[#075848]">View all news →</Link>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {news.slice(0, 3).map((item: any) => (
              <Link
                href="/news"
                key={item.id}
                className="group overflow-hidden rounded-[1.5rem] border border-[#e1dcd1] bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="aspect-[16/9] overflow-hidden bg-[#e4ebe6]">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="grid h-full place-items-center font-serif text-4xl font-black text-[#0a6a57]">AMQM</div>
                  )}
                </div>
                <div className="p-6">
                  <div className="text-[10px] font-black uppercase tracking-[.13em] text-slate-400">{item.category || 'School News'} · {item.published_on}</div>
                  <h3 className="mt-3 font-serif text-xl font-black text-[#073b32]">{item.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{item.excerpt}</p>
                  <div className="mt-5 text-sm font-black text-[#075848]">Read story →</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-5 pb-8 sm:px-8 lg:px-10">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#d3ad55] px-7 py-12 sm:px-10 lg:px-14 lg:py-14">
          <div className="relative z-10 max-w-3xl">
            <div className="text-[10px] font-black uppercase tracking-[.22em] text-[#173f38]">Admissions</div>
            <h2 className="mt-3 font-serif text-4xl font-black leading-tight text-[#073b32] sm:text-5xl">
              Begin a meaningful Qur’anic journey.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#173f38]/75">
              Learn about AMQM, explore the programme and discover how to begin the admissions process.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {admissionOpen && (
                <Link href="/admissions" className="rounded-full bg-[#06342d] px-6 py-3.5 text-sm font-black text-white">
                  Apply for admission →
                </Link>
              )}
              <Link href="/contact" className="rounded-full bg-white px-6 py-3.5 text-sm font-black text-[#073b32]">
                Contact the school
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer id="contact" className="mt-12 bg-[#03251f] text-white">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10">
          <div className="grid gap-10 md:grid-cols-[1.35fr_.65fr_.8fr]">
            <div>
              <div className="font-serif text-2xl font-black">{schoolName}</div>
              <p className="mt-3 max-w-lg text-sm leading-7 text-emerald-50/60">{tagline}</p>
              {contact.address && <p className="mt-5 text-sm text-emerald-50/60">{contact.address}</p>}
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-[#e7c66c]">Explore</div>
              <div className="mt-4 grid gap-2.5 text-sm text-emerald-50/60">
                {nav.slice(0, 6).map((item: any) => (
                  <Link key={item.label} href={item.href} className="hover:text-white">{item.label}</Link>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-[#e7c66c]">Contact</div>
              <div className="mt-4 grid gap-2 text-sm text-emerald-50/60">
                {contact.phone && <span>{contact.phone}</span>}
                {contact.email && <span>{contact.email}</span>}
              </div>
              <div className="mt-6 space-y-3">
                {(['tiktok','youtube','facebook','whatsapp'] as const).map((key) => {
                  const value = social[key];
                  if (!value) return null;
                  const labels: Record<string,string> = {tiktok:'TikTok',youtube:'YouTube',facebook:'Facebook',whatsapp:'WhatsApp'};
                  return (
                    <a key={key} href={normalizeUrl(String(value))} target="_blank" rel="noreferrer"
                      className="group flex items-center gap-3 text-sm font-medium text-emerald-50/75 transition hover:text-white">
                      <SocialBrandIcon brand={key} />
                      <span>{labels[key]}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-10 border-t border-white/10 pt-5 text-center text-xs text-emerald-50/35">
            © {new Date().getFullYear()} {schoolName}. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
}
