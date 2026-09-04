'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Leader = {
  id: string;
  full_name: string;
  role_title?: string | null;
  category?: string | null;
  photo_url?: string | null;
  brief_bio?: string | null;
  full_profile?: string | null;
  qualifications?: string | null;
  experience?: string | null;
  subjects?: string | null;
};

/* ── brand tokens ── */
const DARK = '#062d2a';
const CARD_BG = '#0a3830';
const GOLD = '#C9A84C';
const GOLD_LIGHT = '#f6d46d';
const PANEL_BG = '#0e4038';

/* ── leadership card in the carousel ── */
function LeaderCard({
  t, isActive, idx, entered, reduced,
  onMouseEnter, onFocus, onClick,
}: {
  t: Leader;
  isActive: boolean;
  idx: number;
  entered: boolean;
  reduced: boolean;
  onMouseEnter: () => void;
  onFocus: () => void;
  onClick: () => void;
}) {
  const stagger = reduced ? 0 : idx * 80;
  const initial = t.full_name?.charAt(0) ?? '?';

  return (
    <article
      className="ls-card"
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`View profile: ${t.full_name}`}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        background: CARD_BG,
        border: `1.5px solid ${isActive ? GOLD : 'rgba(201,168,76,.15)'}`,
        boxShadow: isActive
          ? `0 20px 48px rgba(0,0,0,.6), 0 0 0 1px ${GOLD}44`
          : '0 8px 32px rgba(0,0,0,.4)',
        cursor: 'pointer',
        transform: reduced
          ? 'none'
          : entered
            ? isActive ? 'translateY(-6px) scale(1.01)' : 'translateY(0)'
            : 'translateY(14px)',
        opacity: reduced ? 1 : entered ? 1 : 0,
        transition: reduced
          ? 'none'
          : `opacity .45s ${stagger}ms ease, transform .4s ${stagger}ms ease, border-color .22s ease, box-shadow .22s ease`,
        outline: 'none',
        flexShrink: 0,
      }}
    >
      {/* Gold top rule */}
      <div style={{ height: 3, background: `linear-gradient(90deg,transparent,${GOLD} 30%,${GOLD_LIGHT} 50%,${GOLD} 70%,transparent)` }} />

      {/* Photo area */}
      <div style={{ position: 'relative', height: 260, overflow: 'hidden', background: '#051e1b' }}>
        {t.photo_url
          ? <img
              src={t.photo_url}
              alt={t.full_name}
              style={{
                width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%',
                transition: reduced ? 'none' : 'transform .6s ease',
                transform: isActive ? 'scale(1.05)' : 'scale(1)',
              }}
            />
          : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: 72, color: `${GOLD}30`, fontWeight: 900 }}>{initial}</div>
        }
        {/* Gradient overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(5,24,20,.95) 0%,rgba(5,24,20,.4) 50%,transparent 80%)' }} />

        {/* Name block */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 18px 18px' }}>
          <h3 style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 15, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.2, letterSpacing: '.01em' }}>
            {t.full_name}
          </h3>
          <div style={{ marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 14, height: 2, background: GOLD, borderRadius: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, fontWeight: 800, color: GOLD, letterSpacing: '.1em', textTransform: 'uppercase' }}>
              {t.role_title || 'Staff'}
            </span>
          </div>
        </div>
      </div>

      {/* Brief bio snippet */}
      {t.brief_bio && (
        <div style={{ padding: '12px 18px 14px', borderTop: `1px solid ${GOLD}1a` }}>
          <p style={{
            margin: 0, fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,.42)',
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{t.brief_bio}</p>
        </div>
      )}

      {/* View profile label */}
      <div style={{ padding: '0 18px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: '.04em' }}>View Profile →</span>
      </div>
    </article>
  );
}

/* ── helper: info row ── */
function InfoRow({ label, value, light = false }: { label: string; value: string; light?: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, opacity: .75, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: light ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.55)', lineHeight: 1.55 }}>{value}</div>
    </div>
  );
}

/* ── desktop profile panel (dark themed) ── */
function ProfilePanel({
  leader, visible, reduced,
}: {
  leader: Leader | null;
  visible: boolean;
  reduced: boolean;
}) {
  const initial = leader?.full_name?.charAt(0) ?? '?';

  return (
    <aside
      aria-live="polite"
      aria-label={leader ? `Profile: ${leader.full_name}` : 'Leader profile'}
      style={{
        width: 300,
        flexShrink: 0,
        borderRadius: 20,
        background: PANEL_BG,
        border: `1.5px solid ${GOLD}2a`,
        boxShadow: '0 16px 48px rgba(0,0,0,.5)',
        padding: '0 0 24px',
        overflow: 'hidden',
        transition: reduced ? 'none' : 'opacity .3s ease, transform .3s ease',
        opacity: visible && leader ? 1 : 0,
        transform: reduced ? 'none' : visible && leader ? 'translateX(0) scale(1)' : 'translateX(14px) scale(.97)',
        pointerEvents: visible && leader ? 'auto' : 'none',
        minHeight: 200,
      }}
    >
      {leader && (
        <>
          {/* Gold top rule */}
          <div style={{ height: 3, background: `linear-gradient(90deg,transparent,${GOLD} 30%,${GOLD_LIGHT} 50%,${GOLD} 70%,transparent)` }} />

          {/* Photo */}
          <div style={{ height: 180, overflow: 'hidden', background: '#051e1b', position: 'relative' }}>
            {leader.photo_url
              ? <img src={leader.photo_url} alt={leader.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
              : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: 52, color: `${GOLD}40`, fontWeight: 900 }}>{initial}</div>
            }
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(14,64,56,.9) 0%,transparent 60%)' }} />
          </div>

          {/* Name + role */}
          <div style={{ padding: '16px 20px 0' }}>
            <h3 style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 15, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: '.02em' }}>
              {leader.full_name}
            </h3>
            {leader.role_title && (
              <div style={{ marginTop: 7, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 14, height: 2, background: GOLD, borderRadius: 1 }} />
                <span style={{ fontSize: 10.5, fontWeight: 800, color: GOLD, letterSpacing: '.1em', textTransform: 'uppercase' }}>{leader.role_title}</span>
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: `${GOLD}20`, margin: '14px 0' }} />

            {/* Fields */}
            {leader.qualifications && <InfoRow label="Qualifications" value={leader.qualifications} />}
            {leader.experience && <InfoRow label="Experience" value={leader.experience} />}
            {leader.subjects && <InfoRow label="Subjects / Responsibilities" value={leader.subjects} />}
            {leader.brief_bio && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, opacity: .75, marginBottom: 5 }}>About</div>
                <p style={{
                  fontSize: 12.5, lineHeight: 1.65, color: 'rgba(255,255,255,.5)', margin: 0,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                }}>{leader.brief_bio}</p>
              </div>
            )}
          </div>

          {/* CTA */}
          <div style={{ padding: '4px 20px 0' }}>
            <Link
              href={`/leadership/${leader.id}`}
              style={{
                display: 'block', textAlign: 'center',
                padding: '10px 0', borderRadius: 12,
                background: GOLD, color: DARK,
                fontSize: 12, fontWeight: 900, letterSpacing: '.06em',
                textDecoration: 'none',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = GOLD_LIGHT; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = GOLD; }}
            >View Full Profile →</Link>
          </div>
        </>
      )}
    </aside>
  );
}

/* ── tablet inline panel ── */
function TabletPanel({ leader, onClose }: { leader: Leader | null; onClose: () => void }) {
  if (!leader) return null;
  const initial = leader.full_name?.charAt(0) ?? '?';
  return (
    <div style={{
      marginTop: 20,
      borderRadius: 18,
      background: PANEL_BG,
      border: `1.5px solid ${GOLD}2a`,
      boxShadow: '0 8px 32px rgba(0,0,0,.4)',
      padding: '20px 20px 20px',
      display: 'flex',
      gap: 18,
      alignItems: 'flex-start',
      position: 'relative',
    }}>
      <button
        aria-label="Close profile"
        onClick={onClose}
        style={{
          position: 'absolute', top: 12, right: 12,
          width: 30, height: 30, borderRadius: '50%',
          background: 'rgba(255,255,255,.1)', border: 'none', cursor: 'pointer',
          fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 900,
        }}
      >×</button>

      {/* Portrait */}
      <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', background: DARK, flexShrink: 0, boxShadow: `0 0 0 2px ${GOLD}` }}>
        {leader.photo_url
          ? <img src={leader.photo_url} alt={leader.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
          : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: 28, color: GOLD, fontWeight: 900 }}>{initial}</div>
        }
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 15, fontWeight: 900, color: '#fff', margin: 0, textTransform: 'uppercase', letterSpacing: '.02em' }}>{leader.full_name}</h3>
        {leader.role_title && (
          <div style={{ marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 2, background: GOLD, borderRadius: 1 }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: GOLD, letterSpacing: '.08em', textTransform: 'uppercase' }}>{leader.role_title}</span>
          </div>
        )}
        {leader.qualifications && <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,.6)' }}><span style={{ color: GOLD, fontWeight: 700 }}>Qualifications: </span>{leader.qualifications}</div>}
        {leader.experience && <div style={{ marginTop: 5, fontSize: 12, color: 'rgba(255,255,255,.6)' }}><span style={{ color: GOLD, fontWeight: 700 }}>Experience: </span>{leader.experience}</div>}
        {leader.subjects && <div style={{ marginTop: 5, fontSize: 12, color: 'rgba(255,255,255,.6)' }}><span style={{ color: GOLD, fontWeight: 700 }}>Subjects: </span>{leader.subjects}</div>}
        {leader.brief_bio && <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'rgba(255,255,255,.45)', margin: '8px 0 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{leader.brief_bio}</p>}
        <Link href={`/leadership/${leader.id}`} style={{ display: 'inline-block', marginTop: 12, padding: '8px 16px', borderRadius: 10, background: GOLD, color: DARK, fontSize: 12, fontWeight: 900, textDecoration: 'none' }}>View Full Profile →</Link>
      </div>
    </div>
  );
}

/* ── mobile bottom sheet ── */
function MobileSheet({ leader, onClose }: { leader: Leader; onClose: () => void }) {
  const initial = leader.full_name?.charAt(0) ?? '?';

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <button aria-label="Close profile" onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(6,45,42,.75)', border: 'none', cursor: 'pointer' }} />
      <div style={{ position: 'relative', background: PANEL_BG, borderRadius: '24px 24px 0 0', maxHeight: '90vh', overflowY: 'auto', padding: '20px 20px 36px' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: `${GOLD}55`, margin: '0 auto 16px' }} />
        <button aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,.1)', border: 'none', cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900 }}>×</button>

        {/* Portrait */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 100, height: 100, borderRadius: '50%', overflow: 'hidden', background: DARK, boxShadow: `0 0 0 3px ${GOLD}` }}>
            {leader.photo_url
              ? <img src={leader.photo_url} alt={leader.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
              : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: 36, color: GOLD, fontWeight: 900 }}>{initial}</div>
            }
          </div>
        </div>

        <h2 style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 18, fontWeight: 900, color: '#fff', margin: 0, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.03em', lineHeight: 1.2 }}>{leader.full_name}</h2>

        {leader.role_title && (
          <div style={{ textAlign: 'center', marginTop: 10, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 18, height: 2, background: GOLD }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: '.1em', textTransform: 'uppercase' }}>{leader.role_title}</span>
            <div style={{ width: 18, height: 2, background: GOLD }} />
          </div>
        )}

        <div style={{ height: 1, background: `${GOLD}30`, margin: '18px 0' }} />

        {leader.qualifications && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, opacity: .8, marginBottom: 5 }}>Qualifications</div>
            <div style={{ fontSize: 14.5, color: 'rgba(255,255,255,.7)' }}>{leader.qualifications}</div>
          </div>
        )}

        {leader.experience && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, opacity: .8, marginBottom: 5 }}>Experience</div>
            <div style={{ fontSize: 14.5, color: 'rgba(255,255,255,.7)' }}>{leader.experience}</div>
          </div>
        )}

        {leader.subjects && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, opacity: .8, marginBottom: 5 }}>Subjects / Responsibilities</div>
            <div style={{ fontSize: 14.5, color: 'rgba(255,255,255,.7)' }}>{leader.subjects}</div>
          </div>
        )}

        {leader.brief_bio && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, opacity: .8, marginBottom: 6 }}>About</div>
            <p style={{ fontSize: 14.5, lineHeight: 1.78, color: 'rgba(255,255,255,.6)', margin: 0 }}>{leader.brief_bio}</p>
          </div>
        )}

        <Link href={`/leadership/${leader.id}`} onClick={onClose} style={{ display: 'block', textAlign: 'center', padding: '15px 0', borderRadius: 14, background: GOLD, color: DARK, fontSize: 15, fontWeight: 900, textDecoration: 'none' }}>View Full Profile →</Link>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN EXPORTED COMPONENT
══════════════════════════════════════════════ */
export function LeadershipSection({
  leaders,
  shortName = 'AMQM',
}: {
  leaders: Leader[];
  shortName?: string;
}) {
  const [entered, setEntered] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollL, setCanScrollL] = useState(false);
  const [canScrollR, setCanScrollR] = useState(true);
  const [activeLeader, setActiveLeader] = useState<Leader | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tabletLeader, setTabletLeader] = useState<Leader | null>(null);
  const [mobileLeader, setMobileLeader] = useState<Leader | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* effects */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const h = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  useEffect(() => {
    const check = () => { const w = window.innerWidth; setIsDesktop(w >= 1024); setIsMobile(w < 768); };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setEntered(true); obs.disconnect(); } }, { threshold: 0.08 });
    if (sectionRef.current) obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, []);

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollL(el.scrollLeft > 4);
    setCanScrollR(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll);
    updateScroll();
    return () => { el.removeEventListener('scroll', updateScroll); window.removeEventListener('resize', updateScroll); };
  }, [updateScroll]);

  const clearLeave = () => { if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; } };

  const onCardEnter = useCallback((l: Leader) => {
    clearLeave();
    setActiveLeader(l);
    setPanelOpen(true);
  }, []);

  const onAreaLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setPanelOpen(false), 200);
  }, []);

  const onCardClick = useCallback((l: Leader) => {
    if (isMobile) { setMobileLeader(l); }
    else if (!isDesktop) { setTabletLeader(prev => (prev?.id === l.id ? null : l)); }
  }, [isMobile, isDesktop]);

  const scrollLeft = () => { const el = scrollRef.current; if (el) el.scrollBy({ left: -(el.clientWidth * 0.75), behavior: reduced ? 'instant' as ScrollBehavior : 'smooth' }); };
  const scrollRight = () => { const el = scrollRef.current; if (el) el.scrollBy({ left: el.clientWidth * 0.75, behavior: reduced ? 'instant' as ScrollBehavior : 'smooth' }); };

  const arrowBtn = (enabled: boolean): React.CSSProperties => ({
    width: 38, height: 38, borderRadius: '50%',
    background: enabled ? GOLD : 'rgba(255,255,255,.08)',
    color: enabled ? DARK : 'rgba(255,255,255,.25)',
    border: 'none', cursor: enabled ? 'pointer' : 'default',
    flexShrink: 0, fontSize: 15, fontWeight: 900,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background .2s, color .2s', outline: 'none',
  });

  const fadeUp = (delay = 0): React.CSSProperties => ({
    opacity: reduced ? 1 : entered ? 1 : 0,
    transform: reduced ? 'none' : entered ? 'translateY(0)' : 'translateY(12px)',
    transition: reduced ? 'none' : `opacity .48s ${delay}ms ease, transform .44s ${delay}ms ease`,
  });

  if (leaders.length === 0) return null;

  return (
    <>
      <style>{`
        .ls-scroll {
          display: flex;
          gap: 18px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding: 8px 2px 20px;
        }
        .ls-scroll::-webkit-scrollbar { display: none; }
        .ls-card {
          flex: 0 0 auto;
          scroll-snap-align: start;
          width: 218px;
        }
        @media (max-width: 767px) {
          .ls-card { width: calc(75% - 8px); min-width: 200px; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .ls-card { width: 218px; }
        }
        .ls-panel-col { display: none; }
        @media (min-width: 1024px) { .ls-panel-col { display: block; } }
        .ls-tablet { display: block; }
        @media (min-width: 1024px) { .ls-tablet { display: none; } }
        @media (max-width: 767px) { .ls-tablet { display: none; } }
        .ls-card:focus-visible { outline: 2.5px solid ${GOLD}; outline-offset: 3px; border-radius: 18px; }
        @media (prefers-reduced-motion: reduce) {
          .ls-card { transition: none !important; }
        }
      `}</style>

      <div ref={sectionRef} id="leadership" style={{ background: DARK, position: 'relative', overflow: 'hidden' }}>
        {/* Subtle radial glow */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 40%,rgba(201,168,76,.07) 0%,transparent 70%)', pointerEvents: 'none' }} />
        {/* Dot texture */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.04) 1px,transparent 1px)', backgroundSize: '28px 28px', pointerEvents: 'none' }} />

        <div className="mx-auto max-w-[1320px] px-5 sm:px-7" style={{ position: 'relative', paddingTop: 72, paddingBottom: 80 }}>
          {/* Section header */}
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ ...fadeUp(0), display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 32, height: 1, background: GOLD, opacity: .6 }} />
              <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.26em', textTransform: 'uppercase', color: GOLD }}>Leadership &amp; Management</span>
              <div style={{ width: 32, height: 1, background: GOLD, opacity: .6 }} />
            </div>
            <h2 style={{ ...fadeUp(80), fontFamily: "Georgia,'Times New Roman',serif", fontSize: 'clamp(2rem,3.5vw,2.9rem)', fontWeight: 900, color: '#fff', lineHeight: 1.08, margin: 0 }}>
              The people who lead {shortName}.
            </h2>
            <p style={{ ...fadeUp(160), marginTop: 12, fontSize: 14.5, lineHeight: 1.75, color: 'rgba(255,255,255,.45)', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
              Experienced educators and visionary leaders dedicated to excellence in Qur'anic memorization.
            </p>
          </div>

          {/* Carousel + panel */}
          <div
            style={{ ...fadeUp(240), display: 'flex', gap: 24, alignItems: 'flex-start' }}
            onMouseLeave={isDesktop ? onAreaLeave : undefined}
          >
            {/* Carousel wrapper */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button aria-label="Scroll left" onClick={scrollLeft} disabled={!canScrollL} style={arrowBtn(canScrollL)}>←</button>

                <div ref={scrollRef} className="ls-scroll" style={{ flex: 1 }}>
                  {leaders.map((l, idx) => (
                    <LeaderCard
                      key={l.id}
                      t={l}
                      isActive={
                        (isDesktop && panelOpen && activeLeader?.id === l.id) ||
                        (!isDesktop && !isMobile && tabletLeader?.id === l.id)
                      }
                      idx={idx}
                      entered={entered}
                      reduced={reduced}
                      onMouseEnter={() => isDesktop && onCardEnter(l)}
                      onFocus={() => isDesktop && onCardEnter(l)}
                      onClick={() => onCardClick(l)}
                    />
                  ))}
                </div>

                <button aria-label="Scroll right" onClick={scrollRight} disabled={!canScrollR} style={arrowBtn(canScrollR)}>→</button>
              </div>

              {/* Tablet panel */}
              <div className="ls-tablet">
                <TabletPanel leader={tabletLeader} onClose={() => setTabletLeader(null)} />
              </div>
            </div>

            {/* Desktop panel */}
            <div className="ls-panel-col" style={{ width: 300, flexShrink: 0, alignSelf: 'flex-start' }}>
              <ProfilePanel leader={activeLeader} visible={panelOpen} reduced={reduced} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sheet */}
      {mobileLeader && <MobileSheet leader={mobileLeader} onClose={() => setMobileLeader(null)} />}
    </>
  );
}
