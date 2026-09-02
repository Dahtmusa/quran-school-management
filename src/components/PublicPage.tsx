import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

const fallbackPages: Record<string, any> = {
  about: { title: 'About Us', intro: 'A Qur’anic learning environment built around memorization, Islamic knowledge, character and care.', sections: [
    { title: 'Our Mission', text: 'To provide a safe, disciplined and nurturing environment where students memorize the Qur’an, deepen their Islamic knowledge, develop excellent character and grow into responsible members of the Ummah.' },
    { title: 'Our Vision', text: 'To become a trusted centre for Qur’anic excellence, character formation and holistic student development, preparing young people to carry the Qur’an with knowledge, faith and purpose.' },
    { title: 'Our Approach', text: 'Students follow a structured memorization pathway with daily learning, revision, progress tracking and formal evaluations.' },
  ]},
  programs: { title: 'Qur’an Memorization Programmes', intro: 'A structured two-year pathway designed to help students memorize the Qur’an with consistency, discipline and understanding.', sections: [
    { title: 'Year 1', text: 'Foundation, consistent daily memorization, revision and structured assessments.' },
    { title: 'Year 2', text: 'Advanced memorization, intensive revision, final evaluations and graduation readiness.' },
    { title: 'Day & Boarding', text: 'Families can choose the learning arrangement that best supports the student’s needs and circumstances.' },
  ]},
  'campus-life': { title: 'Campus Life', intro: 'A safe, purposeful environment where students learn, worship, build friendships and grow in confidence.', sections: [
    { title: 'Classrooms', text: 'Focused learning spaces designed for Qur’an memorization, revision and Islamic studies.' },
    { title: 'Prayer & Worship', text: 'Worship and spiritual development are woven into the rhythm of school life.' },
    { title: 'Boarding & Student Care', text: 'Boarding students receive structured supervision and a supportive residential environment.' },
  ]},
  news: { title: 'News & Events', intro: 'Keep up with school announcements, activities, Qur’an events and community updates.', sections: [
    { title: 'What’s happening at AMQM', text: 'The school CMS allows administrators to publish and update news, events and announcements without editing website code.' },
  ]},
  contact: { title: 'Contact Us', intro: 'We would be pleased to hear from parents, guardians and families considering AMQM.', sections: [] },
};

async function getSettings() {
  const db = await createClient();
  const { data } = await db.from('site_settings').select('key,value').in('key', ['school_name','short_name','logo_url','contact','social_links','nav','admission_portal']);
  return Object.fromEntries((data || []).map((x: any) => [x.key, x.value]));
}

async function getPage(slug: string) {
  const db = await createClient();
  const { data } = await db.from('pages').select('title,content,published').eq('slug', slug).maybeSingle();
  return data?.published ? data : fallbackPages[slug];
}

export default async function PublicPage({ slug }: { slug: string }) {
  const [settings, page] = await Promise.all([getSettings(), getPage(slug)]);
  const school = settings.school_name?.value || 'ALIYU AND MAIMUNA CENTER FOR QUR’ANIC MEMORIZATION';
  const short = settings.short_name?.value || 'AMQM';
  const logo = settings.logo_url?.value || '';
  const contact = settings.contact || {};
  const nav = settings.nav?.links || [
    { label: 'Home', href: '/' }, { label: 'About Us', href: '/about' }, { label: 'Programs', href: '/programs' },
    { label: 'Admissions', href: '/admissions' }, { label: 'Campus Life', href: '/campus-life' }, { label: 'News & Events', href: '/news' }, { label: 'Contact Us', href: '/contact' },
  ];
  const c = page?.content || {};
  return <main className="min-h-screen bg-[#fbfcfa] text-slate-900">
    <div className="bg-[#06372f] py-2 text-center text-[11px] font-medium text-white">In the name of Allah, the Most Gracious, the Most Merciful</div>
    <header className="border-b bg-white">
      <div className="mx-auto flex min-h-[82px] max-w-7xl items-center justify-between gap-5 px-5 sm:px-6">
        <Link href="/" className="flex items-center gap-3"><div className="h-12 w-12 overflow-hidden rounded-full border border-emerald-100 bg-white">{logo ? <img src={logo} alt="School logo" className="h-full w-full object-contain"/> : <div className="flex h-full items-center justify-center font-serif font-black text-emerald-900">AM</div>}</div><div><div className="font-serif text-lg font-black text-emerald-950">{short}</div><div className="hidden max-w-[360px] text-[10px] font-bold uppercase tracking-[.12em] text-slate-500 sm:block">{school}</div></div></Link>
        <nav className="hidden items-center gap-6 lg:flex">{nav.filter((x:any)=>x.href!=='/').map((x:any)=><Link key={x.label} href={x.href} className="nav-link">{x.label}</Link>)}</nav>
        <div className="flex items-center gap-2"><Link href="/auth/login" className="btn bg-[#06372f] text-white">Login</Link><Link href="/admissions" className="btn hidden bg-[#d39a1d] text-slate-950 sm:inline-flex">Apply Now →</Link></div>
      </div>
    </header>
    <section className="bg-gradient-to-br from-[#06372f] via-[#0b5b4c] to-[#c99a2d] px-5 py-16 text-white sm:px-6 lg:py-20"><div className="mx-auto max-w-5xl"><div className="eyebrow">{short}</div><h1 className="mt-5 max-w-4xl font-serif text-4xl font-black leading-tight sm:text-6xl">{page?.title || slug}</h1>{c.intro&&<p className="mt-6 max-w-3xl text-base leading-8 text-emerald-50/85 sm:text-lg">{c.intro}</p>}</div></section>
    <section className="mx-auto max-w-5xl px-5 py-14 sm:px-6 lg:py-20">
      {slug==='contact' && <div className="mb-10 grid gap-4 sm:grid-cols-3"><div className="card p-5"><div className="text-xs font-bold uppercase text-emerald-700">Phone</div><div className="mt-2 font-black">{contact.phone||'—'}</div></div><div className="card p-5"><div className="text-xs font-bold uppercase text-emerald-700">Email</div><div className="mt-2 font-black break-all">{contact.email||'—'}</div></div><div className="card p-5"><div className="text-xs font-bold uppercase text-emerald-700">Address</div><div className="mt-2 font-black">{contact.address||'—'}</div></div></div>}
      <div className="space-y-5">{(c.sections || []).map((s:any,i:number)=><article className="card p-6 sm:p-8" key={i}><div className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">{String(i+1).padStart(2,'0')}</div><h2 className="mt-2 font-serif text-2xl font-black text-emerald-950 sm:text-3xl">{s.title}</h2><p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-600 sm:text-base">{s.text}</p></article>)}</div>
      <div className="mt-10 flex flex-wrap gap-3"><Link href="/" className="btn border border-emerald-900 text-emerald-900">← Home</Link>{slug!=='admissions'&&<Link href="/admissions" className="btn bg-amber-400 text-slate-950">Apply for Admission →</Link>}</div>
    </section>
    <footer className="bg-[#03251f] py-10 text-white"><div className="mx-auto max-w-7xl px-5 sm:px-6"><div className="font-serif text-xl font-black">{school}</div><div className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/60">{contact.address||''}</div><div className="mt-5 flex flex-wrap gap-4 text-xs text-emerald-50/60">{nav.map((x:any)=><Link key={x.label} href={x.href} className="hover:text-white">{x.label}</Link>)}</div></div></footer>
  </main>;
}
