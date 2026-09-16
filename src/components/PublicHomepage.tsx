'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  loadCMSSections,
  loadCMSSettings,
  loadPublicAlumni,
  loadPublicNewsPosts,
  loadPublicHomepageMedia,
  loadPublicTeam,
  loadPublicTeachers,
  type CMSSection,
} from '@/lib/cms-live-store';
import { TeachingStaffSection } from '@/components/TeachingStaffSection';
import { LeadershipSection } from '@/components/LeadershipSection';
import { CampusVideoShowcase } from '@/components/CampusVideoShowcase';

function mapSections(items: CMSSection[]) {
  return Object.fromEntries(items.map((x) => [x.section_key, x])) as Record<string, CMSSection>;
}

function Icon({ name }: { name?: string }) {
  const glyphs: Record<string, string> = {
    book: '▱', people: '♧', teacher: '◇', star: '☆', chart: '▥', shield: '⬡', mosque: '⌂', heart: '♡',
  };
  return <span aria-hidden="true" className="homepage-icon">{glyphs[name || 'star'] || glyphs.star}</span>;
}

function SocialIcon({ name }: { name: 'facebook' | 'instagram' | 'youtube' | 'whatsapp' | 'tiktok' }) {
  if (name === 'facebook') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-8h2.8l.4-3h-3.2V8.1c0-.9.3-1.6 1.7-1.6h1.8V3.8c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1V10H8v3h2.6v8h2.9Z" /></svg>;
  if (name === 'instagram') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" fill="none" stroke="currentColor" strokeWidth="1.9"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.9"/><circle cx="17.3" cy="6.8" r="1.2" /></svg>;
  if (name === 'youtube') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.3 7.3a2.8 2.8 0 0 0-2-2C17.6 5 12 5 12 5s-5.6 0-7.3.3a2.8 2.8 0 0 0-2 2C2.4 9 2.4 12 2.4 12s0 3 .3 4.7a2.8 2.8 0 0 0 2 2C6.4 19 12 19 12 19s5.6 0 7.3-.3a2.8 2.8 0 0 0 2-2c.3-1.7.3-4.7.3-4.7s0-3-.3-4.7ZM10 15.2V8.8l5.7 3.2L10 15.2Z" /></svg>;
  if (name === 'whatsapp') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 3.6A11.2 11.2 0 0 0 12.5.8a11.2 11.2 0 0 0-9.7 16.8L2 23l5.6-1.8a11.2 11.2 0 0 0 15-10.4c0-2.7-1-5.2-2.2-7.2Zm-7.9 17.1c-1.8 0-3.6-.5-5.1-1.5l-.4-.3-3.3 1 1-3.2-.3-.4a9 9 0 1 1 8.1 4.4Zm5-6.7c-.3-.1-1.8-.9-2.1-1-.3-.1-.5-.1-.7.2l-.8 1c-.2.2-.4.2-.7.1-.3-.1-1.2-.4-2.3-1.3-.8-.7-1.3-1.5-1.4-1.7-.1-.3 0-.5.1-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.5-.1-.7-.1-.2-.7-1.7-.9-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.5 5.4 4.7.8.3 1.4.5 1.8.6.8.3 1.5.2 2 .1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.5-.3Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v10.1a4.1 4.1 0 1 1-2-3.5V6.8c2.6 2.3 4.8 1.7 6.4 1V5.2C16.2 5.6 14.7 4.7 14 3Z" /></svg>;
}

const defaultNav = [
  { label: 'Home', href: '/' },
  { label: 'About Us', href: '/#about' },
  { label: 'Programs', href: '/programs' },
  { label: 'Admissions', href: '/admissions' },
  { label: 'Campus Life', href: '/campus-life' },
  { label: 'News & Events', href: '/news' },
  { label: 'Contact Us', href: '/#contact' },
];

function externalUrl(value?: string) {
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export default function PublicHomepage() {
  const [sections, setSections] = useState<CMSSection[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [team, setTeam] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [alumni, setAlumni] = useState<any[]>([]);
  const [media, setMedia] = useState<any[]>([]);
  const [newsPosts, setNewsPosts] = useState<any[]>([]);
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      loadCMSSections(), loadCMSSettings(), loadPublicTeam(), loadPublicAlumni(),
      loadPublicHomepageMedia(), loadPublicTeachers(), loadPublicNewsPosts(6),
    ]).then(([s, st, t, a, md, tc, np]) => {
      if (!mounted) return;
      setSections(s); setSettings(st); setTeam(t); setAlumni(a); setMedia(md); setTeachers(tc); setNewsPosts(np); setLoading(false);
    }).catch(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const m = useMemo(() => mapSections(sections), [sections]);
  const hero = m.hero?.content || {};
  const features = m.features?.content?.items || [];
  const about = m.about?.content || {};
  const mission = m.mission_vision?.content || {};
  const stats = m.stats?.content?.items || [];
  const programme = m.programme?.content || {};
  const campuses = m.campuses?.content?.items || [];
  const footer = m.footer?.content || {};
  const nav = settings.nav?.links?.length ? settings.nav.links : defaultNav;
  const contact = settings.contact || {};
  const social = settings.social_links || {};
  const portal = settings.admission_portal || {};
  const today = new Date().toISOString().slice(0, 10);
  const admissionOpen = portal.enabled === true && (!portal.opening_date || today >= portal.opening_date) && (!portal.closing_date || today <= portal.closing_date);
  const schoolName = settings.school_name?.value || "ALIYU AND MAIMUNA CENTER FOR QU'ANIC MEMORIZATION";
  const shortName = settings.short_name?.value || 'AMQM';
  const logo = settings.logo_url?.value || '';
  const videos = media.filter((x: any) => x.media_type === 'video');
  const photos = media.filter((x: any) => x.media_type !== 'video');
  const featuredVideo = videos.find((v: any) => v.featured === true) || videos[0] || null;
  const galleryPhotos = photos.slice(0, featuredVideo ? 4 : 6);
  const socialItems = ([['facebook','Facebook'],['instagram','Instagram'],['youtube','YouTube'],['whatsapp','WhatsApp'],['tiktok','TikTok']] as const).filter(([key]) => !!social[key]);

  if (loading) return <main className="min-h-screen bg-[#fbfcfa]"><div className="h-8 bg-[#06372f]"/><div className="h-[76px] border-b bg-white"/><div className="hero-skeleton"/><div className="mx-auto max-w-[1200px] px-5 py-10"><div className="grid gap-4 sm:grid-cols-3">{[1,2,3].map(i=><div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100"/>)}</div></div></main>;

  return <main className="min-h-screen overflow-x-hidden bg-white text-slate-900">
    <div className="bg-[#06372f] text-white"><div className="mx-auto flex min-h-8 max-w-[1200px] items-center justify-between px-5 text-[11px]"><span className="hidden sm:inline">In the name of Allah, the Most Gracious, the Most Merciful</span><span className="sm:hidden">Bismillah · {shortName}</span><div className="font-bold text-amber-200">{admissionOpen ? 'Admissions Open' : 'Admissions Closed'}</div></div></div>

    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl"><div className="mx-auto flex min-h-[74px] max-w-[1200px] items-center justify-between gap-5 px-5 sm:px-7"><Link href="/" className="flex min-w-0 items-center gap-3"><div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-emerald-100 bg-white shadow-sm sm:h-12 sm:w-12">{logo?<img src={logo} alt={`${shortName} logo`} className="h-full w-full object-contain"/>:<div className="grid h-full place-items-center font-serif font-black text-emerald-900">AM</div>}</div><div className="min-w-0"><div className="font-serif text-xl font-black leading-none text-emerald-950">{shortName}</div><div className="mt-1 hidden max-w-[420px] truncate text-[10px] font-bold uppercase tracking-[.09em] text-slate-500 sm:block">{schoolName}</div></div></Link><nav className="hidden items-center gap-6 xl:flex">{nav.map((x:any)=><Link key={x.label} href={x.href} className="nav-link">{x.label}</Link>)}</nav><div className="flex items-center gap-2"><Link href="/auth/login" className="btn rounded-xl bg-[#06372f] px-4 py-2.5 text-white">Login</Link>{admissionOpen&&<Link href="/admissions" className="btn hidden rounded-xl bg-[#d39a1d] px-4 py-2.5 text-slate-950 sm:inline-flex">Apply Now →</Link>}<button aria-label="Open navigation" className="mobile-menu-button xl:hidden" onClick={()=>setMobileNav(true)}>☰</button></div></div></header>

    {mobileNav&&<div className="fixed inset-0 z-[90] xl:hidden"><button aria-label="Close menu overlay" className="absolute inset-0 bg-slate-950/60" onClick={()=>setMobileNav(false)}/><aside className="absolute inset-y-0 left-0 flex w-[88vw] max-w-sm flex-col bg-white p-5 shadow-2xl"><div className="flex items-center justify-between border-b pb-5"><div className="font-black text-emerald-950">{shortName}</div><button aria-label="Close navigation" className="mobile-close" onClick={()=>setMobileNav(false)}>×</button></div><nav className="mt-6 flex-1 space-y-2 overflow-y-auto">{nav.map((x:any)=><Link key={x.label} href={x.href} onClick={()=>setMobileNav(false)} className="mobile-nav-link"><span>{x.label}</span><span>→</span></Link>)}</nav><Link href="/auth/login" onClick={()=>setMobileNav(false)} className="mt-5 block rounded-2xl bg-[#06372f] px-4 py-3.5 text-center text-sm font-black text-white">Login</Link>{admissionOpen&&<Link href="/admissions" onClick={()=>setMobileNav(false)} className="mt-2 block rounded-2xl bg-[#d9a11e] px-4 py-3.5 text-center text-sm font-black text-slate-950">Apply Now</Link>}</aside></div>}

    <section className="relative isolate overflow-hidden bg-[#073a32] text-white"><div className="absolute inset-0">{hero.hero_video?<video src={hero.hero_video} autoPlay muted loop playsInline poster={hero.hero_image||undefined} className="h-full w-full object-cover opacity-55"/>:hero.hero_image?<img src={hero.hero_image} alt="" className="h-full w-full object-cover"/>:<div className="hero-art h-full w-full"/>}</div><div className="absolute inset-0 bg-gradient-to-r from-[#052a25]/95 via-[#06372f]/75 to-[#06372f]/25"/><div className="relative mx-auto grid min-h-[540px] max-w-[1200px] items-center px-5 py-14 sm:px-7 lg:min-h-[590px] lg:grid-cols-[1.08fr_.92fr] lg:py-16"><div className="max-w-3xl"><div className="eyebrow">{hero.eyebrow||'A two-year journey with the Book of Allah'}</div><h1 className="mt-5 max-w-3xl whitespace-pre-line font-serif text-4xl font-black leading-[1.04] sm:text-5xl lg:text-6xl">{hero.title||'Memorizing the Book of Allah\nBuilding a Better Ummah'}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-white/82 sm:text-lg">{hero.subtitle||"A structured Qur'an memorization programme that nurtures hearts, strengthens faith and builds a strong foundation for life."}</p><div className="mt-7 flex flex-wrap gap-3">{admissionOpen&&<Link href={hero.primary_href||'/admissions'} className="btn rounded-xl bg-[#d9a11e] px-5 py-3 text-slate-950 shadow-lg">{hero.primary_cta||'Apply for Admission'} →</Link>}<Link href={hero.secondary_href||'/about'} className="btn rounded-xl border border-white/25 bg-white/10 px-5 py-3 text-white backdrop-blur">{hero.secondary_cta||'Learn More'} →</Link></div></div><div className="hidden lg:flex justify-end"><div className="max-w-[350px] rounded-[2rem] border border-white/15 bg-black/15 p-7 text-right backdrop-blur-md shadow-2xl"><div className="font-serif text-6xl text-[#f3bf43]">الله</div><p className="mt-4 font-serif text-lg font-bold leading-8">"{hero.quote||'Indeed, it is We who sent down the Qur\'an and indeed, We will be its guardian.'}"</p><div className="mt-3 text-sm font-semibold text-[#f3bf43]">— {hero.quote_source||'Al-Hijr (15:9)'}</div></div></div></div></section>

    {(mission.mission||mission.vision)&&<section className="bg-[#f6f7f2] py-14 sm:py-16"><div className="mx-auto max-w-[1100px] px-5 sm:px-7"><div className="max-w-2xl"><div className="eyebrow-light">Our purpose</div><h2 className="section-title">A school built around Qur'an, character and care.</h2><p className="section-copy">Our mission and vision guide how we teach, support and develop every student.</p></div><div className="mt-8 grid gap-4 md:grid-cols-2"><article className="rounded-[1.5rem] bg-[#06372f] p-7 text-white shadow-sm"><div className="text-xs font-black uppercase tracking-[.18em] text-amber-300">{mission.mission_title||'Our Mission'}</div><p className="mt-3 text-sm leading-7 text-emerald-50/80">{mission.mission}</p></article><article className="rounded-[1.5rem] border border-emerald-100 bg-white p-7 shadow-sm"><div className="text-xs font-black uppercase tracking-[.18em] text-emerald-700">{mission.vision_title||'Our Vision'}</div><p className="mt-3 text-sm leading-7 text-slate-600">{mission.vision}</p></article></div></div></section>}

    {(stats.length||features.length)&&<section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-7"><div className="grid gap-4 lg:grid-cols-[.95fr_1.75fr]"><div className="rounded-[1.5rem] bg-amber-400 p-6 sm:p-7"><div className="text-xs font-black uppercase tracking-[.2em] text-emerald-950/65">At a glance</div><div className="mt-5 grid grid-cols-2 gap-y-6">{stats.slice(0,4).map((x:any,i:number)=><div key={i}><div className="text-3xl font-black text-emerald-950">{x.value}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-emerald-900/65">{x.label}</div></div>)}</div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{features.slice(0,4).map((x:any,i:number)=><article key={i} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm"><Icon name={x.icon}/><h3 className="mt-3 text-sm font-black text-emerald-950">{x.title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{x.excerpt||x.text}</p></article>)}</div></div></section>}

    <section id="about" className="mx-auto max-w-[1200px] px-5 py-14 sm:px-7 lg:py-18"><div className="grid items-center gap-8 lg:grid-cols-[1fr_1.05fr]"><div><div className="eyebrow-light">About {shortName}</div><h2 className="section-title">{about.title||'Nurturing Huffaz. Building character.'}</h2><p className="section-copy">{about.text||"We combine Qur'an memorization, Islamic education, discipline and pastoral care in a safe, supportive environment."}</p><div className="mt-6 flex flex-wrap gap-2 text-xs font-bold text-emerald-900"><span className="rounded-full bg-emerald-50 px-4 py-2">2-Year Programme</span><span className="rounded-full bg-emerald-50 px-4 py-2">Qualified Teachers</span><span className="rounded-full bg-emerald-50 px-4 py-2">Day & Boarding</span></div><Link href={about.cta_href||'/about'} className="btn mt-7 inline-flex border border-emerald-900 text-emerald-900">{about.cta||'Discover the school'} →</Link></div><div className="relative min-h-[360px] overflow-hidden rounded-[2rem] bg-emerald-950 shadow-xl">{about.image?<img src={about.image} alt={about.image_alt||'AMQM learning environment'} className="h-full w-full object-cover"/>:<div className="hero-art h-full w-full"/>}<div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent"/><div className="absolute bottom-5 left-5 text-white"><div className="text-xs font-black uppercase tracking-[.18em] text-amber-200">{shortName}</div><div className="mt-1 font-serif text-xl font-black">Learn. Memorize. Grow.</div></div></div></div></section>

    <section className="bg-[#f4f6f1] py-14 sm:py-16"><div className="mx-auto max-w-[1200px] px-5 sm:px-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="eyebrow-light">Academic pathway</div><h2 className="section-title">{programme.title||"Qur'an Memorization Programme"}</h2><p className="section-copy">{programme.text||'A structured pathway with daily memorization, revision and regular evaluation.'}</p></div><Link href="/programs" className="shrink-0 text-sm font-black text-emerald-800">View programmes →</Link></div><div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{(programme.items?.length?programme.items:[{icon:'book',title:'Daily Memorization',text:'Structured memorization and revision.'},{icon:'teacher',title:'Qualified Teachers',text:'Guidance from experienced Qur’an teachers.'},{icon:'chart',title:'Regular Evaluation',text:'Clear progress checks throughout the term.'},{icon:'star',title:'Graduation Pathway',text:'A structured route toward completion.'}]).slice(0,4).map((x:any,i:number)=><article key={i} className="card p-6"><Icon name={x.icon}/><h3 className="mt-4 font-black text-emerald-950">{x.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{x.excerpt||x.text}</p></article>)}</div></div></section>

    {(team.length||teachers.length)>0&&<section><div className="mx-auto max-w-[1200px] px-5 pt-14 sm:px-7"><div className="eyebrow-light">Our people</div><h2 className="section-title">Meet the people who guide our students.</h2><p className="section-copy">Get to know our leadership and teaching team.</p></div>{team.length>0&&<LeadershipSection leaders={team} shortName={shortName}/>} {teachers.length>0&&<TeachingStaffSection teachers={teachers} values={m.features?.content?.items||[]}/>}</section>}

    {(featuredVideo||galleryPhotos.length>0)&&<section className="bg-[#06372f] py-14 sm:py-16"><div className="mx-auto max-w-[1200px] px-5 sm:px-7"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-[11px] font-black uppercase tracking-[.22em] text-amber-300">Campus life</div><h2 className="font-serif text-3xl font-black text-white sm:text-4xl">See life at {shortName}.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-emerald-100/70">A glimpse of the classrooms, campus and moments that shape school life.</p></div><Link href="/campus-life" className="text-sm font-black text-amber-300">Explore campus life →</Link></div>{media.filter((x:any)=>x.category==='Campus Life'||x.category==='School Compound').length>0&&<div className="mt-7"><CampusVideoShowcase media={media} shortName={shortName}/></div>}{galleryPhotos.length>0&&<div className="mt-7 grid auto-rows-[180px] gap-3 sm:grid-cols-2 lg:grid-cols-4">{galleryPhotos.map((item:any,i:number)=><div key={item.id} className={`overflow-hidden rounded-[1.3rem] bg-emerald-950 ${i===0?'lg:col-span-2 lg:row-span-2':''}`}><img src={item.public_url} alt={item.alt_text||item.title} className="h-full w-full object-cover transition duration-500 hover:scale-105"/></div>)}</div>}</div></section>}

    {newsPosts.length>0&&<section id="news" className="mx-auto max-w-[1200px] px-5 py-14 sm:px-7 lg:py-16"><div className="flex items-end justify-between gap-4"><div><div className="eyebrow-light">News & events</div><h2 className="section-title">Latest from {shortName}.</h2></div><Link href="/news" className="text-sm font-black text-emerald-800">View all →</Link></div><div className="mt-8 grid gap-5 md:grid-cols-3">{newsPosts.slice(0,3).map((x:any)=><article key={x.id} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm"><div className="h-52 overflow-hidden bg-slate-100">{x.image_url?<img src={x.image_url} alt={x.title} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-4xl text-amber-400">✦</div>}</div><div className="p-5"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{x.published_on}</div><h3 className="mt-2 font-black text-emerald-950">{x.title}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{x.excerpt}</p></div></article>)}</div></section>}

    <section className="bg-[#06372f] py-12 text-white"><div className="mx-auto flex max-w-[1100px] flex-col gap-5 px-5 text-center sm:px-7 md:flex-row md:items-center md:justify-between md:text-left"><div><div className="text-xs font-black uppercase tracking-[.2em] text-amber-300">Admissions</div><h2 className="mt-2 font-serif text-3xl font-black sm:text-4xl">Give your child a life with the Qur'an.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/70">Explore the programme, understand the admissions pathway and take the next step.</p></div><Link href={admissionOpen?'/admissions':'/programs'} className="btn shrink-0 rounded-xl bg-[#d9a11e] text-slate-950">{admissionOpen?'Apply Now →':'Explore Programmes →'}</Link></div></section>

    <footer id="contact" className="bg-[#03251f] text-white"><div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-12 sm:px-7 lg:grid-cols-[1.15fr_.8fr_.8fr]"><div><div className="font-serif text-2xl font-black">{schoolName}</div><p className="mt-3 max-w-md text-sm leading-6 text-emerald-50/60">{footer.tagline||settings.tagline?.value||"Qur'anic memorization, education, character and excellence."}</p><div className="mt-4 text-sm text-emerald-50/60">{contact.address}</div><div className="mt-6"><div className="text-xs font-black uppercase tracking-[.18em] text-amber-300">Follow us</div><div className="social-links mt-4">{socialItems.map(([key,label])=><a key={key} aria-label={label} title={label} href={externalUrl(social[key])} target="_blank" rel="noreferrer" className={`social-pill social-${key}`}><span className="social-pill-icon"><SocialIcon name={key}/></span><span className="social-pill-label">{label}</span></a>)}</div></div></div><div><div className="text-xs font-black uppercase tracking-[.18em] text-amber-300">Quick links</div><div className="mt-4 grid gap-2 text-sm text-emerald-50/60">{nav.map((x:any)=><Link key={x.label} href={x.href} className="hover:text-white">{x.label}</Link>)}</div></div><div><div className="text-xs font-black uppercase tracking-[.18em] text-amber-300">Contact</div><div className="mt-4 space-y-2 text-sm text-emerald-50/60"><div>{contact.phone}</div><div>{contact.email}</div><div>{contact.address}</div></div></div></div><div className="border-t border-white/10 py-5 text-center text-xs text-emerald-50/40">© {new Date().getFullYear()} {schoolName}. All rights reserved.</div></footer>
  </main>;
}
