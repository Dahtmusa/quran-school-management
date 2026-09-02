'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { loadCMSSections, loadCMSSettings, loadPublicAlumni, loadPublicTeam, type CMSSection } from '@/lib/cms-live-store';

function mapSections(items: CMSSection[]) {
  return Object.fromEntries(items.map((x) => [x.section_key, x])) as Record<string, CMSSection>;
}

function Icon({ name }: { name?: string }) {
  const glyphs: Record<string, string> = { book: '▤', people: '♧', teacher: '✦', star: '☆', chart: '▥', shield: '◇', calendar: '▦', mosque: '⌂', heart: '♡', meal: '♢', bed: '▱' };
  return <span aria-hidden="true" className="text-2xl text-emerald-700">{glyphs[name || 'star'] || glyphs.star}</span>;
}

export default function Home() {
  const [sections, setSections] = useState<CMSSection[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [team, setTeam] = useState<any[]>([]);
  const [alumni, setAlumni] = useState<any[]>([]);
  const [mobileNav, setMobileNav] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([loadCMSSections(), loadCMSSettings(), loadPublicTeam(), loadPublicAlumni()]).then(([s, st, t, a]) => {
      if (!mounted) return;
      setSections(s);
      setSettings(st);
      setTeam(t);
      setAlumni(a);
      setLoading(false);
    }).catch(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const m = useMemo(() => mapSections(sections), [sections]);
  const hero = m.hero?.content || {};
  const features = m.features?.content?.items || [];
  const about = m.about?.content || {};
  const stats = m.stats?.content?.items || [];
  const programme = m.programme?.content || {};
  const values = m.values?.content?.items || [];
  const campuses = m.campuses?.content?.items || [];
  const news = m.news?.content?.items || [];
  const footer = m.footer?.content || {};
  const nav = settings.nav?.links || [];
  const contact = settings.contact || {};
  const portal = settings.admission_portal || {};
  const today = new Date().toISOString().slice(0, 10);
  const admissionOpen = portal.enabled === true && (!portal.opening_date || today >= portal.opening_date) && (!portal.closing_date || today <= portal.closing_date);
  const schoolName = settings.school_name?.value || 'Aliyu and Maimuna Center for Qur\'anic Memorization';
  const shortName = settings.short_name?.value || 'AMQM';
  const logo = settings.logo_url?.value || '';

  if (loading) {
    return <main className="min-h-screen bg-[#fbfcfa]"><div className="h-8 bg-emerald-950"/><div className="h-20 border-b bg-white"/><div className="hero-skeleton"/><div className="mx-auto max-w-7xl space-y-5 px-5 py-10"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1,2,3,4].map((x) => <div key={x} className="h-36 animate-pulse rounded-3xl bg-slate-100"/>)}</div></div></main>;
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fbfcfa] text-slate-900">
      <div className="bg-[#06372f] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-[11px] sm:px-6">
          <div className="flex min-w-0 items-center gap-4 truncate opacity-90"><span>{contact.phone || ''}</span><span className="hidden sm:inline">{contact.email || ''}</span></div>
          <div className="hidden shrink-0 items-center gap-4 sm:flex"><span>{admissionOpen ? 'Admissions Open' : 'Admissions Currently Closed'}</span><span className="h-3 w-px bg-white/20"/><span>{shortName}</span></div>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex min-h-[74px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">{logo ? <img src={logo} alt={`${shortName} logo`} className="h-full w-full object-cover"/> : <div className="flex h-full items-center justify-center font-serif text-lg font-black text-emerald-900">AM</div>}</div>
            <div className="min-w-0"><div className="truncate font-serif text-base font-black tracking-tight text-emerald-950 sm:text-lg">{shortName}</div><div className="hidden max-w-[310px] truncate text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500 sm:block">{schoolName}</div></div>
          </Link>
          <nav className="hidden items-center gap-6 lg:flex">{nav.map((x: any) => <Link key={x.label} href={x.href} className="nav-link">{x.label}</Link>)}</nav>
          <div className="flex items-center gap-2">
            <Link href="/auth/login" className="btn bg-[#06372f] px-4 py-2.5 text-white shadow-sm">Login</Link>
            {admissionOpen && <Link href="/admissions" className="btn hidden bg-[#d9a11e] px-4 py-2.5 text-slate-950 shadow-sm sm:inline-flex">Apply Now <span>→</span></Link>}
            <button aria-label="Open menu" className="mobile-menu-button lg:hidden" onClick={() => setMobileNav(true)}>☰</button>
          </div>
        </div>
      </header>

      {mobileNav && <div className="fixed inset-0 z-[80] lg:hidden"><div className="absolute inset-0 bg-slate-950/50" onClick={() => setMobileNav(false)}/><aside className="absolute inset-y-0 left-0 w-[88vw] max-w-sm overflow-y-auto bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div className="font-serif text-xl font-black text-emerald-950">{shortName}</div><button className="mobile-close" onClick={() => setMobileNav(false)}>×</button></div><nav className="mt-8 space-y-2">{nav.map((x: any) => <Link key={x.label} href={x.href} onClick={() => setMobileNav(false)} className="mobile-nav-link">{x.label}<span>→</span></Link>)}</nav><Link href="/auth/login" onClick={() => setMobileNav(false)} className="mt-6 block rounded-2xl bg-emerald-950 px-4 py-3.5 text-center text-sm font-black text-white">Login</Link>{admissionOpen && <Link href="/admissions" onClick={() => setMobileNav(false)} className="mt-2 block rounded-2xl bg-amber-400 px-4 py-3.5 text-center text-sm font-black text-slate-950">Apply Now</Link>}</aside></div>}

      <section className="relative isolate min-h-[590px] overflow-hidden bg-[#06372f] text-white lg:min-h-[650px]">
        {hero.hero_video ? <video src={hero.hero_video} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover opacity-45"/> : hero.hero_image ? <img src={hero.hero_image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50"/> : <div className="absolute inset-0 hero-art"/>}
        <div className="absolute inset-0 bg-gradient-to-r from-[#042a25] via-[#06372f]/85 to-[#06372f]/20"/>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_22%,rgba(236,183,57,.30),transparent_24%)]"/>
        <div className="relative mx-auto grid min-h-[590px] max-w-7xl items-center gap-10 px-5 py-16 sm:px-6 lg:min-h-[650px] lg:grid-cols-[1.15fr_.85fr]">
          <div className="max-w-3xl">
            <div className="eyebrow">{hero.eyebrow || shortName}</div>
            <h1 className="mt-5 whitespace-pre-line font-serif text-4xl font-black leading-[1.02] sm:text-5xl lg:text-7xl">{hero.title || 'Memorizing the Qur\'an. Building character. Serving the Ummah.'}</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-emerald-50/85 sm:text-lg">{hero.subtitle || 'A structured Qur\'anic memorization environment where students grow in knowledge, discipline, faith and character.'}</p>
            <div className="mt-8 flex flex-wrap gap-3">{admissionOpen && <Link href={hero.primary_href || '/admissions'} className="btn bg-amber-400 px-5 py-3.5 text-slate-950 shadow-lg">{hero.primary_cta || 'Apply for Admission'} <span>→</span></Link>}<Link href={hero.secondary_href || '/about'} className="btn border border-white/25 bg-white/10 px-5 py-3.5 text-white backdrop-blur">{hero.secondary_cta || 'Discover Our School'} <span>→</span></Link></div>
            <div className="mt-9 flex flex-wrap gap-6 text-xs text-emerald-50/75"><span>✓ Qur'an Memorization</span><span>✓ Day & Boarding</span><span>✓ Three Evaluations Per Term</span></div>
          </div>
          <div className="hidden lg:block"><div className="rounded-[2rem] border border-white/15 bg-white/10 p-7 shadow-2xl backdrop-blur-xl"><div className="text-xs font-bold uppercase tracking-[.22em] text-amber-200">{hero.quote_source || 'Our guiding principle'}</div><p className="mt-4 font-serif text-3xl font-bold leading-10">{hero.quote || 'The best among you are those who learn the Qur\'an and teach it.'}</p><div className="mt-6 h-px bg-white/15"/><div className="mt-4 text-sm text-emerald-50/70">{contact.address || 'Yola North LGA, Adamawa State, Nigeria'}</div></div></div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#fbfcfa] to-transparent"/>
      </section>

      {m.features?.visible !== false && <section className="relative z-10 mx-auto -mt-8 max-w-7xl px-4 sm:px-6"><div className="grid overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-2 shadow-2xl sm:grid-cols-2 lg:grid-cols-6">{features.slice(0,6).map((x: any, i: number) => <div key={i} className="group border-b border-slate-100 p-5 last:border-0 hover:bg-emerald-50/70 sm:nth-[2n]:border-l lg:border-b-0 lg:border-l lg:first:border-l-0"><Icon name={x.icon}/><h3 className="mt-3 text-sm font-black text-emerald-950">{x.title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{x.text}</p></div>)}</div></section>}

      {m.about?.visible !== false && <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:py-24"><div className="grid items-center gap-10 lg:grid-cols-[.9fr_1.1fr]"><div><div className="eyebrow-light">{shortName}</div><h2 className="section-title">{about.title || 'A place to memorize, learn and become.'}</h2><p className="section-copy">{about.text || 'Our school brings Qur\'anic memorization together with Islamic education, character development and a supportive learning environment.'}</p><div className="mt-7 flex flex-wrap gap-3"><Link href={about.cta_href || '/about'} className="btn border border-emerald-800 text-emerald-900">{about.cta || 'More About Us'} →</Link>{about.video ? <a href={about.video} target="_blank" rel="noreferrer" className="btn bg-emerald-950 text-white">Watch Our Story ▶</a> : null}</div><div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">{['Focused memorization','Islamic studies','Character building','Student care'].map((x) => <div key={x} className="rounded-2xl bg-emerald-50 p-3 text-xs font-bold text-emerald-900">✓ {x}</div>)}</div></div><div className="relative min-h-[360px] overflow-hidden rounded-[2rem] bg-emerald-950 shadow-2xl">{about.image ? <img src={about.image} alt={about.image_alt || 'AMQM learning environment'} className="h-full w-full object-cover"/> : <div className="absolute inset-0 hero-art"/>}<div className="absolute inset-0 bg-gradient-to-t from-emerald-950/70 via-transparent to-transparent"/><div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/15 bg-white/10 p-4 text-white backdrop-blur"><div className="text-xs font-bold uppercase tracking-[.2em] text-amber-200">{shortName}</div><div className="mt-1 text-lg font-black">Qur'an memorization with purpose.</div></div></div></div></section>}

      {m.stats?.visible !== false && <section className="bg-emerald-950 py-8 text-white"><div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-white/10 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-5 lg:divide-y-0">{stats.map((x: any, i: number) => <div key={i} className="p-5 text-center"><div className="text-3xl font-black text-amber-300 sm:text-4xl">{x.value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-100/70">{x.label}</div></div>)}</div></section>}

      {m.programme?.visible !== false && <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6"><div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="eyebrow-light">Academic pathway</div><h2 className="section-title">{programme.title || 'Our Qur\'anic Memorization Programme'}</h2><p className="section-copy max-w-2xl">{programme.text || 'A clear two-year pathway with structured memorization, regular evaluation and continuous progress tracking.'}</p></div>{admissionOpen && <Link href="/admissions" className="btn shrink-0 bg-emerald-950 text-white">Begin an application →</Link>}</div><div className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-4">{(programme.items || []).slice(0,8).map((x: any, i: number) => <article key={i} className="card p-6 transition hover:-translate-y-1 hover:shadow-lg"><Icon name={x.icon}/><h3 className="mt-4 font-black text-emerald-950">{x.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{x.text}</p></article>)}</div></section>}

      {m.values?.visible !== false && <section className="border-y border-emerald-900/10 bg-[#f1f4ed] py-8"><div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-3 px-5 sm:gap-8">{values.map((x: any) => <span key={typeof x === 'string' ? x : x.label} className="rounded-full bg-white px-5 py-3 text-sm font-bold text-emerald-950 shadow-sm">✦ {typeof x === 'string' ? x : x.label}</span>)}</div></section>}

      {m.campuses?.visible !== false && <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6"><div className="flex items-end justify-between gap-4"><div><div className="eyebrow-light">Campus life</div><h2 className="section-title">A safe place to learn and grow.</h2></div><Link href="/campus-life" className="hidden text-sm font-bold text-emerald-800 sm:block">Explore campus life →</Link></div><div className="mt-9 grid gap-5 lg:grid-cols-2">{campuses.slice(0,4).map((x: any, i: number) => <article key={i} className="group overflow-hidden rounded-[2rem] border bg-white shadow-sm"><div className="relative h-64 bg-emerald-950">{x.image ? <img src={x.image} alt={x.image_alt || x.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105"/> : <div className="absolute inset-0 hero-art"/>}<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 pt-16 text-white"><h3 className="text-xl font-black">{x.title}</h3></div></div><div className="p-6"><p className="text-sm leading-6 text-slate-600">{x.text}</p><Link href={x.href || '/campus-life'} className="mt-4 inline-block text-sm font-black text-emerald-800">Learn more →</Link></div></article>)}</div></section>}

      {m.news?.visible !== false && <section className="bg-[#f6f7f3] py-20"><div className="mx-auto max-w-7xl px-5 sm:px-6"><div className="flex items-end justify-between gap-4"><div><div className="eyebrow-light">News & events</div><h2 className="section-title">{m.news?.title || 'Latest from AMQM'}</h2></div><Link href="/news" className="hidden text-sm font-bold text-emerald-800 sm:block">View all →</Link></div><div className="mt-9 grid gap-5 md:grid-cols-3">{news.slice(0,6).map((x: any, i: number) => <article key={i} className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="h-48 bg-emerald-950">{x.image ? <img src={x.image} alt={x.title} className="h-full w-full object-cover"/> : <div className="flex h-full items-center justify-center hero-art text-4xl text-amber-300">✦</div>}</div><div className="p-6"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{x.date}</div><h3 className="mt-2 font-black text-emerald-950">{x.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{x.text}</p></div></article>)}</div></div></section>}

      {team.length > 0 && <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6"><div className="eyebrow-light">Leadership & staff</div><h2 className="section-title">People who guide our students.</h2><div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{team.slice(0,6).map((t: any) => <article key={t.id} className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="h-64 bg-emerald-950">{t.photo_url ? <img src={t.photo_url} alt={t.full_name} className="h-full w-full object-cover"/> : <div className="flex h-full items-center justify-center text-6xl font-serif text-amber-300">{t.full_name?.charAt(0)}</div>}</div><div className="p-6"><div className="text-xs font-bold uppercase tracking-wide text-slate-400">{t.category}</div><h3 className="mt-1 text-lg font-black text-emerald-950">{t.full_name}</h3><div className="text-sm font-semibold text-emerald-800">{t.role_title}</div><p className="mt-3 text-sm leading-6 text-slate-600">{t.brief_bio}</p></div></article>)}</div></section>}

      {alumni.length > 0 && <section className="bg-emerald-950 py-16 text-white"><div className="mx-auto max-w-7xl px-5 sm:px-6"><div className="eyebrow text-amber-200">Our alumni</div><h2 className="mt-3 font-serif text-4xl font-black">A legacy that continues beyond the classroom.</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{alumni.slice(0,3).map((a: any) => <div key={a.id} className="rounded-3xl border border-white/10 bg-white/5 p-6"><div className="text-lg font-black">{a.full_name}</div><div className="mt-1 text-xs text-emerald-200/60">{a.cohort_name} · {a.graduation_year}</div><p className="mt-3 text-sm leading-6 text-emerald-50/70">{a.brief_bio}</p></div>)}</div></div></section>}

      <footer className="bg-[#03251f] text-white"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-6 lg:grid-cols-[1.2fr_.8fr_.8fr]">
        <div><div className="font-serif text-2xl font-black">{shortName}</div><p className="mt-3 max-w-md text-sm leading-6 text-emerald-50/60">{footer.tagline || settings.tagline?.value || 'Qur\'anic memorization, education, character and excellence.'}</p><div className="mt-6 text-sm text-emerald-50/70">{contact.address}</div></div>
        <div><div className="text-sm font-black uppercase tracking-wide text-amber-300">Quick links</div><div className="mt-4 grid gap-2 text-sm text-emerald-50/70">{nav.map((x: any) => <Link key={x.label} href={x.href} className="hover:text-white">{x.label}</Link>)}</div></div>
        <div><div className="text-sm font-black uppercase tracking-wide text-amber-300">Contact</div><div className="mt-4 space-y-2 text-sm text-emerald-50/70"><div>{contact.phone}</div><div>{contact.email}</div><div>{contact.address}</div></div></div>
      </div><div className="border-t border-white/10 py-5 text-center text-xs text-emerald-50/40">© {new Date().getFullYear()} {schoolName}. All rights reserved.</div></footer>
    </main>
  );
}
