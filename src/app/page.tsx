'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  loadCMSSections,
  loadCMSSettings,
  loadPublicAlumni,
  loadPublicHomepageMedia,
  loadPublicTeam,
  loadPublicTeachers,
  type CMSSection,
} from '@/lib/cms-live-store';
import { TeachingStaffSection } from '@/components/TeachingStaffSection';

function mapSections(items: CMSSection[]) {
  return Object.fromEntries(items.map((x) => [x.section_key, x])) as Record<string, CMSSection>;
}

function Icon({ name }: { name?: string }) {
  const glyphs: Record<string, string> = {
    book: '▱', people: '♧', teacher: '◇', star: '☆', chart: '▥', shield: '⬡', calendar: '▦', mosque: '⌂', meal: '♢', bed: '▱', heart: '♡',
  };
  return <span aria-hidden="true" className="homepage-icon">{glyphs[name || 'star'] || glyphs.star}</span>;
}

const defaultNav = [
  { label: 'Home', href: '/' },
  { label: 'About Us', href: '/about' },
  { label: 'Programs', href: '/programs' },
  { label: 'Admissions', href: '/admissions' },
  { label: 'Campus Life', href: '/campus-life' },
  { label: 'News & Events', href: '/news' },
  { label: 'Contact Us', href: '/contact' },
];

function externalUrl(value?: string) {
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export default function Home() {
  const [sections, setSections] = useState<CMSSection[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [team, setTeam] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [alumni, setAlumni] = useState<any[]>([]);
  const [media, setMedia] = useState<any[]>([]);
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      loadCMSSections(),
      loadCMSSettings(),
      loadPublicTeam(),
      loadPublicAlumni(),
      loadPublicHomepageMedia(),
      loadPublicTeachers(),
    ])
      .then(([s, st, t, a, md, tc]) => {
        if (!mounted) return;
        setSections(s); setSettings(st); setTeam(t); setAlumni(a); setMedia(md); setTeachers(tc);
        setLoading(false);
      })
      .catch(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const m = useMemo(() => mapSections(sections), [sections]);
  const hero = m.hero?.content || {};
  const features = m.features?.content?.items || [];
  const about = m.about?.content || {};
  const mission = m.mission_vision?.content || {};
  const stats = m.stats?.content?.items || [];
  const programme = m.programme?.content || {};
  const values = m.values?.content?.items || [];
  const campuses = m.campuses?.content?.items || [];
  const news = m.news?.content?.items || [];
  const footer = m.footer?.content || {};
  const nav = settings.nav?.links?.length ? settings.nav.links : defaultNav;
  const contact = settings.contact || {};
  const social = settings.social_links || {};
  const portal = settings.admission_portal || {};
  const today = new Date().toISOString().slice(0, 10);
  const admissionOpen = portal.enabled === true && (!portal.opening_date || today >= portal.opening_date) && (!portal.closing_date || today <= portal.closing_date);
  const schoolName = settings.school_name?.value || "ALIYU AND MAIMUNA CENTER FOR QUR'ANIC MEMORIZATION";
  const shortName = settings.short_name?.value || 'AMQM';
  const logo = settings.logo_url?.value || '';

  // Split media into videos and photos for gallery
  const videos = media.filter((x: any) => x.media_type === 'video');
  const photos = media.filter((x: any) => x.media_type !== 'video');
  const featuredVideo = videos[0] || null;
  const galleryPhotos = photos.slice(0, featuredVideo ? 6 : 8);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fbfcfa]">
        <div className="h-8 bg-[#06372f]" />
        <div className="h-[78px] border-b bg-white" />
        <div className="hero-skeleton" />
        <div className="mx-auto max-w-[1320px] px-5 py-10 sm:px-7">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-slate-900">

      {/* ── Top bar ── */}
      <div className="bg-[#06372f] text-white">
        <div className="mx-auto flex min-h-8 max-w-[1320px] items-center justify-between gap-4 px-5 text-[11px] sm:px-7">
          <span className="hidden sm:inline">In the name of Allah, the Most Gracious, the Most Merciful</span>
          <span className="sm:hidden">Bismillah · {shortName}</span>
          <div className="flex items-center gap-4">
            <span className="font-bold text-amber-200">{admissionOpen ? 'Admissions Open' : 'Admissions Closed'}</span>
            <div className="hidden items-center gap-3 sm:flex">
              {social.facebook && <a aria-label="Facebook" href={externalUrl(social.facebook)} target="_blank" rel="noreferrer" className="top-social">f</a>}
              {social.instagram && <a aria-label="Instagram" href={externalUrl(social.instagram)} target="_blank" rel="noreferrer" className="top-social">◎</a>}
              {social.youtube && <a aria-label="YouTube" href={externalUrl(social.youtube)} target="_blank" rel="noreferrer" className="top-social">▶</a>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Header / Nav ── */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[78px] max-w-[1320px] items-center justify-between gap-5 px-5 sm:px-7">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-emerald-100 bg-white shadow-sm sm:h-14 sm:w-14">
              {logo ? <img src={logo} alt={`${shortName} logo`} className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center font-serif text-xl font-black text-emerald-900">AM</div>}
            </div>
            <div className="min-w-0">
              <div className="font-serif text-xl font-black leading-none text-emerald-950 sm:text-2xl">{shortName}</div>
              <div className="mt-1 hidden max-w-[420px] truncate text-[10px] font-bold uppercase tracking-[.09em] text-slate-500 sm:block">{schoolName}</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 xl:flex">
            {nav.map((x: any) => (
              <Link key={x.label} href={x.href} className={`nav-link ${x.href === '/' ? 'text-emerald-800' : ''}`}>{x.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/auth/login" className="btn rounded-xl bg-[#06372f] px-4 py-2.5 text-white">Login</Link>
            {admissionOpen && <Link href="/admissions" className="btn hidden rounded-xl bg-[#d39a1d] px-4 py-2.5 text-slate-950 sm:inline-flex">Apply Now <span>→</span></Link>}
            <button aria-label="Open navigation" className="mobile-menu-button xl:hidden" onClick={() => setMobileNav(true)}>☰</button>
          </div>
        </div>
      </header>

      {mobileNav && (
        <div className="fixed inset-0 z-[90] xl:hidden">
          <button aria-label="Close menu overlay" className="absolute inset-0 bg-slate-950/60" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[88vw] max-w-sm flex-col bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-5">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 overflow-hidden rounded-full border border-emerald-100">
                  {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <span className="flex h-full items-center justify-center font-black text-emerald-900">AM</span>}
                </div>
                <div><div className="font-black text-emerald-950">{shortName}</div><div className="text-[10px] text-slate-500">School website</div></div>
              </div>
              <button aria-label="Close navigation" className="mobile-close" onClick={() => setMobileNav(false)}>×</button>
            </div>
            <nav className="mt-6 flex-1 space-y-2 overflow-y-auto">
              {nav.map((x: any) => <Link key={x.label} href={x.href} onClick={() => setMobileNav(false)} className="mobile-nav-link"><span>{x.label}</span><span>→</span></Link>)}
            </nav>
            <Link href="/auth/login" onClick={() => setMobileNav(false)} className="mt-5 block rounded-2xl bg-[#06372f] px-4 py-3.5 text-center text-sm font-black text-white">Login</Link>
            {admissionOpen && <Link href="/admissions" onClick={() => setMobileNav(false)} className="mt-2 block rounded-2xl bg-[#d39a1d] px-4 py-3.5 text-center text-sm font-black text-slate-950">Apply Now</Link>}
          </aside>
        </div>
      )}

      {/* ── 1. HERO ── */}
      <section className="relative isolate min-h-[540px] overflow-hidden bg-[#073a32] text-white lg:min-h-[600px]">
        {hero.hero_video ? (
          <video src={hero.hero_video} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover opacity-60" />
        ) : hero.hero_image ? (
          <img src={hero.hero_image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : <div className="absolute inset-0 hero-art" />}
        <div className="absolute inset-0 bg-gradient-to-r from-[#052a25]/95 via-[#06372f]/70 to-[#06372f]/15" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_25%,rgba(243,191,67,.34),transparent_23%)]" />
        <div className="relative mx-auto grid min-h-[540px] max-w-[1320px] items-center px-5 py-14 sm:px-7 lg:min-h-[600px] lg:grid-cols-[1.12fr_.88fr] lg:py-20">
          <div className="max-w-3xl">
            <div className="eyebrow hero-fade-up" style={{animationDelay:'0ms'}}>{hero.eyebrow || 'A two-year journey with the Book of Allah'}</div>
            <h1 className="mt-5 max-w-4xl whitespace-pre-line font-serif text-4xl font-black leading-[1.02] sm:text-6xl lg:text-[66px] hero-fade-up" style={{animationDelay:'140ms'}}>{hero.title || 'Memorizing the Book of Allah\nBuilding a Better Ummah'}</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/85 sm:text-lg hero-fade-up" style={{animationDelay:'280ms'}}>{hero.subtitle || "A structured 2-year Qur'an memorization programme that nurtures hearts, strengthens faith and builds a strong foundation for a life with the Qur'an."}</p>
            <div className="mt-8 flex flex-wrap gap-3 hero-fade-up" style={{animationDelay:'400ms'}}>
              {admissionOpen && <Link href={hero.primary_href || '/admissions'} className="btn rounded-xl bg-[#d9a11e] px-6 py-3.5 text-slate-950 shadow-lg transition-transform hover:scale-105 active:scale-95">{hero.primary_cta || 'Apply for Admission'} <span>→</span></Link>}
              <Link href={hero.secondary_href || '/about'} className="btn rounded-xl border border-white/30 bg-white/95 px-6 py-3.5 text-emerald-950 transition-transform hover:scale-105 active:scale-95">{hero.secondary_cta || 'Learn More'} <span>▶</span></Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-white/80 hero-fade-up" style={{animationDelay:'520ms'}}><span>✓ Qur'an Memorization</span><span>✓ Day & Boarding</span><span>✓ 3 Evaluations Per Term</span></div>
          </div>
          <div className="hidden justify-end lg:flex hero-fade-up" style={{animationDelay:'200ms'}}>
            <div className="hero-float max-w-[370px] rounded-[2rem] border border-white/20 bg-black/15 p-7 text-right backdrop-blur-md shadow-2xl">
              <div className="hero-glow font-serif text-6xl text-[#f3bf43]">الله</div>
              <p className="mt-5 font-serif text-xl font-bold leading-8">"{hero.quote || 'Indeed, it is We who sent down the Qur\'an and indeed, We will be its guardian.'}"</p>
              <div className="mt-4 text-sm font-semibold text-[#f3bf43]">— {hero.quote_source || 'Al-Hijr (15:9)'}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. MISSION & VISION (second on page — before everything else) ── */}
      {(mission.mission || mission.vision) && (
        <section className="relative overflow-hidden bg-[#06372f] py-16 text-white lg:py-20">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-amber-400/8" />
          <div className="absolute -bottom-16 left-0 h-48 w-48 rounded-full bg-emerald-400/10" />
          <div className="relative mx-auto max-w-[1180px] px-5 sm:px-7">
            <div className="text-center">
              <div className="font-serif text-5xl text-amber-300 mb-4">✦</div>
              <div className="text-[11px] font-black uppercase tracking-[.28em] text-amber-300">Purpose, character & excellence</div>
              <h2 className="mt-3 font-serif text-3xl font-black text-white sm:text-4xl">Our Mission & Vision</h2>
              <p className="mt-3 mx-auto max-w-xl text-sm leading-6 text-emerald-100/70">The purpose behind the way we teach, guide and care for every student at {shortName}.</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <article className="rounded-[1.8rem] border border-white/10 bg-white/8 p-7 backdrop-blur-sm lg:p-9">
                <div className="text-3xl text-amber-300">◈</div>
                <h3 className="mt-4 font-serif text-2xl font-black text-white">{mission.mission_title || 'Our Mission'}</h3>
                <p className="mt-3 text-sm leading-7 text-emerald-100/80">{mission.mission}</p>
              </article>
              <article className="rounded-[1.8rem] bg-amber-400/10 border border-amber-400/20 p-7 lg:p-9">
                <div className="text-3xl text-amber-300">✦</div>
                <h3 className="mt-4 font-serif text-2xl font-black text-white">{mission.vision_title || 'Our Vision'}</h3>
                <p className="mt-3 text-sm leading-7 text-emerald-100/80">{mission.vision}</p>
              </article>
            </div>
          </div>
        </section>
      )}

      {/* ── 3. STATS BAR ── */}
      {stats.length > 0 && (
        <section className="bg-amber-400 py-6">
          <div className="mx-auto grid max-w-[1320px] grid-cols-2 divide-x divide-amber-500/30 px-5 sm:grid-cols-3 sm:px-7 lg:grid-cols-6 lg:divide-y-0">
            {stats.slice(0, 6).map((x: any, i: number) => (
              <div key={i} className="p-4 text-center">
                <div className="text-3xl font-black text-emerald-950">{x.value}</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-900/70">{x.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 4. FEATURES STRIP ── */}
      {features.length > 0 && (
        <section className="mx-auto max-w-[1320px] px-4 py-10 sm:px-7">
          <div className="grid overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,.08)] sm:grid-cols-2 lg:grid-cols-6">
            {features.slice(0, 6).map((x: any, i: number) => (
              <div key={i} className="border-b border-slate-100 p-5 text-center transition hover:-translate-y-1 hover:bg-emerald-50/50 lg:border-b-0 lg:border-l lg:first:border-l-0">
                <Icon name={x.icon} /><h3 className="mt-3 text-sm font-black text-emerald-950">{x.title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{x.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 5. ABOUT + ADMISSIONS ── */}
      <section className="mx-auto max-w-[1320px] px-5 pb-16 sm:px-7 lg:pb-20">
        <div className="grid gap-4 lg:grid-cols-[1.05fr_1.2fr_.62fr]">
          <div className="card p-7 lg:p-8">
            <div className="eyebrow-light">About {shortName}</div>
            <h2 className="mt-2 font-serif text-3xl font-black text-emerald-950">{about.title || 'Nurturing Huffaz. Building character.'}</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">{about.text || "We combine Qur'an memorization, Islamic education, discipline and pastoral care in a safe, supportive environment."}</p>
            <div className="mt-7 grid grid-cols-2 gap-3 text-xs font-bold text-emerald-900">
              <span className="rounded-xl bg-emerald-50 p-3">▦ 2-Year Programme</span>
              <span className="rounded-xl bg-emerald-50 p-3">♧ Qualified Staff</span>
              <span className="rounded-xl bg-emerald-50 p-3">⌂ Islamic Environment</span>
              <span className="rounded-xl bg-emerald-50 p-3">◇ Student Care</span>
            </div>
            <Link href={about.cta_href || '/about'} className="btn mt-7 inline-flex border border-emerald-900 text-emerald-900">{about.cta || 'More About Us'} →</Link>
          </div>
          <div className="relative min-h-[330px] overflow-hidden rounded-[1.7rem] bg-emerald-950 shadow-xl">
            {about.image ? <img src={about.image} alt={about.image_alt || 'AMQM students learning'} className="h-full w-full object-cover" /> : <div className="absolute inset-0 hero-art" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
            {about.video && <a href={about.video} target="_blank" rel="noreferrer" aria-label="Watch school video" className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-emerald-950 shadow-xl transition hover:scale-105">▶</a>}
            <div className="absolute bottom-5 left-5 text-white"><div className="text-xs font-bold uppercase tracking-[.18em] text-amber-200">{shortName}</div><div className="mt-1 font-serif text-xl font-black">See our learning environment</div></div>
          </div>
          <div className="rounded-[1.7rem] bg-[#06372f] p-7 text-white shadow-xl">
            <div className="text-2xl font-black">{admissionOpen ? 'Admissions Open' : 'Admissions Currently Closed'}</div>
            <p className="mt-3 text-sm leading-6 text-emerald-50/75">{admissionOpen ? 'Give your child the best gift — the Qur\'an. Limited places available.' : 'Our admissions portal will reopen according to the school calendar.'}</p>
            {admissionOpen && <Link href="/admissions" className="btn mt-6 inline-flex bg-[#d9a11e] text-slate-950">Apply Now →</Link>}
            <div className="mt-7 border-t border-white/10 pt-5 text-xs leading-5 text-emerald-50/60">{contact.address || 'Yola North LGA, Adamawa State, Nigeria'}</div>
          </div>
        </div>
      </section>

      {/* ── 6. PROGRAMME ── */}
      {programme.items?.length > 0 && (
        <section className="bg-[#f4f6f1] py-16 lg:py-20">
          <div className="mx-auto max-w-[1320px] px-5 sm:px-7">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div><div className="eyebrow-light">Academic pathway</div><h2 className="section-title">{programme.title || "Qur'an Memorization Programme"}</h2><p className="section-copy max-w-2xl">{programme.text || 'A structured pathway with daily memorization, revision and regular evaluation.'}</p></div>
              <Link href="/programs" className="text-sm font-black text-emerald-800 shrink-0">View programmes →</Link>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {programme.items.slice(0, 4).map((x: any, i: number) => (
                <article className="card p-6 transition hover:-translate-y-1 hover:shadow-lg" key={i}><Icon name={x.icon}/><h3 className="mt-4 font-black text-emerald-950">{x.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{x.text}</p></article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 7. STAFF & TEACHERS ── */}
      {(team.length > 0 || teachers.length > 0) && (
        <section>

          {/* ══ LEADERSHIP — full-bleed dark editorial ══ */}
          {team.length > 0 && (
            <div style={{background:'#062d2a',position:'relative',overflow:'hidden'}}>
              {/* Subtle radial glow behind cards */}
              <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse 80% 60% at 50% 40%,rgba(201,168,76,.07) 0%,transparent 70%)',pointerEvents:'none'}}/>
              {/* Fine dot texture */}
              <div style={{position:'absolute',inset:0,backgroundImage:'radial-gradient(rgba(255,255,255,.04) 1px,transparent 1px)',backgroundSize:'28px 28px',pointerEvents:'none'}}/>

              <div className="mx-auto max-w-[1320px] px-5 sm:px-7" style={{position:'relative',paddingTop:72,paddingBottom:80}}>
                {/* Section label + heading */}
                <div style={{textAlign:'center',marginBottom:52}}>
                  <div style={{display:'inline-flex',alignItems:'center',gap:10,marginBottom:14}}>
                    <div style={{width:32,height:1,background:'#C9A84C',opacity:.6}}/>
                    <span style={{fontSize:10.5,fontWeight:900,letterSpacing:'.26em',textTransform:'uppercase',color:'#C9A84C'}}>Leadership &amp; Management</span>
                    <div style={{width:32,height:1,background:'#C9A84C',opacity:.6}}/>
                  </div>
                  <h2 style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:'clamp(2rem,3.5vw,2.9rem)',fontWeight:900,color:'#fff',lineHeight:1.08,margin:0,textWrap:'balance'}}>The people who lead {shortName}.</h2>
                  <p style={{marginTop:12,fontSize:14.5,lineHeight:1.75,color:'rgba(255,255,255,.45)',maxWidth:480,marginLeft:'auto',marginRight:'auto'}}>Experienced educators and visionary leaders dedicated to excellence in Qur'anic memorization.</p>
                </div>

                {/* Leadership cards — auto-fit fills width regardless of count */}
                <div style={{display:'grid',gap:20,gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,320px),1fr))'}}>
                  {team.map((t: any) => (
                    <article key={t.id} className="group" style={{borderRadius:18,overflow:'hidden',background:'#0a3830',border:'1px solid rgba(201,168,76,.15)',boxShadow:'0 8px 32px rgba(0,0,0,.4)',transition:'transform .3s ease,box-shadow .3s ease'}}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.transform='translateY(-8px)';(e.currentTarget as HTMLElement).style.boxShadow='0 24px 56px rgba(0,0,0,.55)'}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.transform='none';(e.currentTarget as HTMLElement).style.boxShadow='0 8px 32px rgba(0,0,0,.4)'}}>
                      {/* Gold top rule */}
                      <div style={{height:3,background:'linear-gradient(90deg,transparent,#C9A84C 30%,#f6d46d 50%,#C9A84C 70%,transparent)'}}/>
                      {/* Photo area */}
                      <div style={{position:'relative',height:340,overflow:'hidden',background:'#051e1b'}}>
                        {t.photo_url
                          ? <img src={t.photo_url} alt={t.full_name} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 20%',transition:'transform .7s ease'}} className="group-hover:scale-105"/>
                          : <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"Georgia,serif",fontSize:90,color:'rgba(201,168,76,.25)',fontWeight:900,letterSpacing:'-2px'}}>{t.full_name?.charAt(0)}</div>}
                        {/* Gradient overlay */}
                        <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,rgba(5,24,20,.95) 0%,rgba(5,24,20,.55) 40%,transparent 70%)'}}/>
                        {/* Name block */}
                        <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'0 22px 22px'}}>
                          <h3 style={{fontFamily:"Georgia,'Times New Roman',serif",fontSize:18,fontWeight:900,color:'#fff',margin:0,lineHeight:1.2,letterSpacing:'.01em'}}>{t.full_name}</h3>
                          <div style={{marginTop:6,display:'inline-flex',alignItems:'center',gap:7}}>
                            <div style={{width:18,height:2,background:'#C9A84C',borderRadius:1,flexShrink:0}}/>
                            <span style={{fontSize:11.5,fontWeight:800,color:'#C9A84C',letterSpacing:'.1em',textTransform:'uppercase'}}>{t.role_title}</span>
                          </div>
                        </div>
                      </div>
                      {/* Bio */}
                      {t.brief_bio && (
                        <div style={{padding:'16px 22px 20px',borderTop:'1px solid rgba(201,168,76,.1)'}}>
                          <p style={{margin:0,fontSize:13,lineHeight:1.7,color:'rgba(255,255,255,.45)',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical'}}>{t.brief_bio}</p>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ TEACHING STAFF — interactive carousel ══ */}
          {teachers.length > 0 && (
            <TeachingStaffSection teachers={teachers} values={values} />
          )}
        </section>
      )}

      {/* ── 9. CAMPUS LIFE ── */}
      {campuses.length > 0 && (
        <section className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:py-20">
          <div className="flex items-end justify-between gap-4">
            <div><div className="eyebrow-light">Campus life</div><h2 className="section-title">A safe place to learn, worship and grow.</h2></div>
            <Link href="/campus-life" className="hidden text-sm font-black text-emerald-800 sm:block">Explore campus life →</Link>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {campuses.slice(0, 4).map((x: any, i: number) => (
              <article key={i} className="group overflow-hidden rounded-[1.5rem] border bg-white shadow-sm">
                <div className="relative h-52 bg-emerald-950">
                  {x.image ? <img src={x.image} alt={x.image_alt || x.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105"/> : <div className="absolute inset-0 hero-art"/>}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 pt-12 text-white"><h3 className="font-black">{x.title}</h3></div>
                </div>
                <div className="p-5"><p className="text-sm leading-6 text-slate-600">{x.text}</p></div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── 10. GALLERY (photos + featured video) ── */}
      {(featuredVideo || galleryPhotos.length > 0) && (
        <section className="bg-[#06372f] py-16 lg:py-20">
          <div className="mx-auto max-w-[1320px] px-5 sm:px-7">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-8">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[.24em] text-amber-300">Life at {shortName}</div>
                <h2 className="mt-2 font-serif text-3xl font-black text-white sm:text-4xl">Come inside the {shortName} experience.</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-100/70">See the people, places and moments that make our school a place where Qur'an, character and community come together.</p>
              </div>
            </div>

            {/* Featured video + photo grid side by side */}
            {featuredVideo ? (
              <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                {/* Featured video */}
                <div className="relative overflow-hidden rounded-[1.5rem] bg-emerald-950 shadow-xl" style={{minHeight:'340px'}}>
                  <video
                    src={featuredVideo.public_url}
                    controls
                    preload="metadata"
                    className="h-full w-full object-cover"
                    style={{minHeight:'340px'}}
                  />
                  <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
                    <div className="text-[10px] font-black uppercase tracking-[.16em] text-amber-300">{featuredVideo.category}</div>
                    <h3 className="mt-1 font-black text-white">{featuredVideo.title}</h3>
                  </div>
                </div>
                {/* Photo grid */}
                <div className="grid grid-cols-2 gap-4">
                  {galleryPhotos.slice(0, 6).map((item: any) => (
                    <article key={item.id} className="group relative overflow-hidden rounded-[1.2rem] bg-emerald-950 shadow" style={{minHeight:'160px'}}>
                      <img src={item.public_url} alt={item.alt_text || item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" style={{minHeight:'160px'}}/>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <h3 className="text-xs font-black text-white">{item.title}</h3>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              /* No video — full photo masonry */
              <div className="grid auto-rows-[200px] gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {galleryPhotos.map((item: any, i: number) => (
                  <article key={item.id} className={`group relative overflow-hidden rounded-[1.5rem] bg-emerald-950 shadow-sm ${i === 0 ? 'lg:col-span-2 lg:row-span-2' : ''}`}>
                    <img src={item.public_url} alt={item.alt_text || item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105"/>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent p-5 pt-12 text-white">
                      <div className="text-[10px] font-black uppercase tracking-[.16em] text-amber-200">{item.category}</div>
                      <h3 className="mt-1 font-black">{item.title}</h3>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* Additional videos below if more than one */}
            {videos.length > 1 && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {videos.slice(1, 4).map((item: any) => (
                  <div key={item.id} className="overflow-hidden rounded-[1.2rem] bg-emerald-950">
                    <video src={item.public_url} controls preload="metadata" className="w-full aspect-video object-cover"/>
                    <div className="p-3"><div className="text-[10px] font-black uppercase tracking-wide text-amber-300">{item.category}</div><div className="mt-1 text-sm font-black text-white">{item.title}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 11. NEWS & EVENTS ── */}
      {news.length > 0 && (
        <section className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7">
          <div className="flex items-end justify-between">
            <div><div className="eyebrow-light">News & events</div><h2 className="section-title">{m.news?.title || 'Latest from AMQM'}</h2></div>
            <Link href="/news" className="text-sm font-black text-emerald-800">View all →</Link>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {news.slice(0, 3).map((x: any, i: number) => (
              <article key={i} className="group overflow-hidden rounded-[1.5rem] border bg-white shadow-sm">
                <div className="h-48 overflow-hidden bg-emerald-950">
                  {x.image ? <img src={x.image} alt={x.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105"/> : <div className="flex h-full items-center justify-center text-4xl text-amber-300">✦</div>}
                </div>
                <div className="p-6"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{x.date}</div><h3 className="mt-2 font-black text-emerald-950">{x.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{x.text}</p></div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── 12. ALUMNI ── */}
      {alumni.length > 0 && (
        <section className="mx-auto max-w-[1320px] px-5 py-14 sm:px-7">
          <div className="rounded-[2rem] border border-emerald-900/10 bg-white p-7 shadow-sm lg:p-9">
            <div className="eyebrow-light">Our alumni</div>
            <h2 className="section-title">A growing community beyond the classroom.</h2>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {alumni.slice(0, 3).map((a: any) => (
                <div key={a.id} className="rounded-2xl bg-[#f6f7f3] p-5">
                  <div className="font-black text-emerald-950">{a.full_name}</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-wide text-emerald-700">{a.graduation_year || a.program || 'AMQM Alumni'}</div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{a.bio || a.current_role || ''}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 13. CTA ── */}
      <section className="bg-[#06372f] py-14 text-white">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-5 text-center sm:px-7 md:flex-row md:items-center md:justify-between md:text-left">
          <div>
            <div className="text-xs font-black uppercase tracking-[.22em] text-amber-300">Start the journey</div>
            <h2 className="mt-2 font-serif text-3xl font-black sm:text-4xl">Give your child a life with the Qur'an.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/70">Discover our programmes, campus, student life and admissions pathway — then take the next step with confidence.</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-center gap-3 md:justify-end">
            <Link href="/programs" className="btn border border-white/20 bg-white/10 text-white">Explore Programmes</Link>
            {admissionOpen && <Link href="/admissions" className="btn bg-[#d9a11e] text-slate-950">Apply Now →</Link>}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-[#03251f] text-white">
        <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-12 sm:px-7 lg:grid-cols-[1.2fr_.8fr_.8fr]">
          <div>
            <div className="font-serif text-2xl font-black">{schoolName}</div>
            <p className="mt-3 max-w-md text-sm leading-6 text-emerald-50/60">{footer.tagline || settings.tagline?.value || "Qur'anic memorization, education, character and excellence."}</p>
            <div className="mt-5 text-sm text-emerald-50/60">{contact.address}</div>
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[.18em] text-amber-300">Quick links</div>
            <div className="mt-4 grid gap-2 text-sm text-emerald-50/60">
              {nav.map((x: any) => <Link key={x.label} href={x.href} className="hover:text-white">{x.label}</Link>)}
            </div>
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[.18em] text-amber-300">Contact</div>
            <div className="mt-4 space-y-2 text-sm text-emerald-50/60">
              <div>{contact.phone}</div><div>{contact.email}</div><div>{contact.address}</div>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 py-5 text-center text-xs text-emerald-50/40">© {new Date().getFullYear()} {schoolName}. All rights reserved.</div>
      </footer>
    </main>
  );
}
