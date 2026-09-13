'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type NavLink = { label: string; href: string };

// Shared header for every generic public page (About, Programs, Admissions
// info, Campus Life, News, Contact). Mirrors the homepage's header/mobile-nav
// pattern (src/app/page.tsx) so the same navigation is reachable from every
// public page, not just the homepage. Previously this page type showed its
// nav links only at the lg breakpoint and above with no mobile fallback at
// all, leaving phone and tablet visitors with no way to navigate the site
// once they left the homepage.
export default function PublicHeader({ logo, short, school, nav }: { logo?: string; short: string; school: string; nav: NavLink[] }) {
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    if (!mobileNav) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNav(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileNav]);

  return (
    <>
      <header className="border-b bg-white">
        <div className="mx-auto flex min-h-[82px] max-w-7xl items-center justify-between gap-5 px-5 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full border border-emerald-100 bg-white">
              {logo ? <img src={logo} alt="School logo" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center font-serif font-black text-emerald-900">AM</div>}
            </div>
            <div>
              <div className="font-serif text-lg font-black text-emerald-950">{short}</div>
              <div className="hidden max-w-[360px] text-[10px] font-bold uppercase tracking-[.12em] text-slate-500 sm:block">{school}</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-6 xl:flex">
            {nav.filter((x) => x.href !== '/').map((x) => <Link key={x.label} href={x.href} className="nav-link">{x.label}</Link>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/auth/login" className="btn bg-[#06372f] text-white">Login</Link>
            <Link href="/admissions" className="btn hidden bg-[#d39a1d] text-slate-950 sm:inline-flex">Apply Now →</Link>
            <button aria-label="Open navigation" aria-expanded={mobileNav} className="mobile-menu-button xl:hidden" onClick={() => setMobileNav(true)}>☰</button>
          </div>
        </div>
      </header>

      {mobileNav && (
        <div className="fixed inset-0 z-[90] xl:hidden">
          <button aria-label="Close menu overlay" className="absolute inset-0 bg-slate-950/60" onClick={() => setMobileNav(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[88vw] max-w-sm flex-col bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl">
            <div className="flex items-center justify-between border-b pb-5">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 overflow-hidden rounded-full border border-emerald-100">
                  {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <span className="flex h-full items-center justify-center font-black text-emerald-900">AM</span>}
                </div>
                <div><div className="font-black text-emerald-950">{short}</div><div className="text-[10px] text-slate-500">School website</div></div>
              </div>
              <button aria-label="Close navigation" className="mobile-close" onClick={() => setMobileNav(false)}>×</button>
            </div>
            <nav className="mt-6 flex-1 space-y-2 overflow-y-auto overscroll-contain">
              {nav.map((x) => <Link key={x.label} href={x.href} onClick={() => setMobileNav(false)} className="mobile-nav-link"><span>{x.label}</span><span>→</span></Link>)}
            </nav>
            <Link href="/auth/login" onClick={() => setMobileNav(false)} className="mt-5 block rounded-2xl bg-[#06372f] px-4 py-3.5 text-center text-sm font-black text-white">Login</Link>
            <Link href="/admissions" onClick={() => setMobileNav(false)} className="mt-2 block rounded-2xl bg-[#d39a1d] px-4 py-3.5 text-center text-sm font-black text-slate-950">Apply Now</Link>
          </aside>
        </div>
      )}
    </>
  );
}
