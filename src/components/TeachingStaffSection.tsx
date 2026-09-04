'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Teacher = {
  id: string;
  full_name: string;
  job_title?: string | null;
  department?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  qualifications?: string | null;
  experience?: string | null;
  subjects?: string | null;
};

export type ValuesItem = string | { label: string };

/* ── brand tokens ── */
const GREEN = '#062d2a';
const TEAL = '#0f766e';
const GOLD = '#C9A84C';
const CREAM = '#F4F1EA';

/* ── circular portrait ── */
function Portrait({ t, size = 108, gold = true }: { t: Teacher; size?: number; gold?: boolean }) {
  const shadow = gold
    ? `0 0 0 2.5px #fff, 0 0 0 5px ${GOLD}, 0 6px 20px rgba(6,45,40,.2)`
    : `0 0 0 2.5px #fff, 0 0 0 4px ${TEAL}, 0 6px 20px rgba(6,45,40,.15)`;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', background: GREEN, flexShrink: 0, boxShadow: shadow }}>
      {t.avatar_url
        ? <img src={t.avatar_url} alt={t.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
        : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: size * 0.34, color: GOLD, fontWeight: 900 }}>{t.full_name?.charAt(0) ?? '?'}</div>
      }
    </div>
  );
}

/* ── role badge ── */
function RoleBadge({ text, size = 'sm' }: { text: string; size?: 'sm' | 'md' }) {
  return (
    <span style={{
      fontSize: size === 'md' ? 11 : 10.5,
      fontWeight: 800,
      color: '#fff',
      background: '#0c5e50',
      borderRadius: 99,
      padding: size === 'md' ? '5px 16px' : '3px 11px',
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      display: 'inline-block',
    }}>
      {text}
    </span>
  );
}

/* ── individual card in the carousel ── */
function TeacherCard({
  t, isActive, idx, entered, reduced,
  onMouseEnter, onFocus, onClick,
}: {
  t: Teacher;
  isActive: boolean;
  idx: number;
  entered: boolean;
  reduced: boolean;
  onMouseEnter: () => void;
  onFocus: () => void;
  onClick: () => void;
}) {
  const stagger = reduced ? 0 : idx * 75;
  return (
    <article
      className="ts-card"
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`View profile: ${t.full_name}`}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        cursor: 'pointer',
        borderRadius: 18,
        padding: '18px 12px 16px',
        background: isActive ? '#fff' : 'transparent',
        border: `1.5px solid ${isActive ? GOLD : 'transparent'}`,
        boxShadow: isActive ? `0 8px 28px rgba(6,45,40,.13)` : 'none',
        transform: reduced
          ? 'none'
          : entered
            ? isActive ? 'translateY(-3px) scale(1.01)' : 'translateY(0) scale(1)'
            : 'translateY(12px) scale(1)',
        opacity: reduced ? 1 : entered ? 1 : 0,
        transition: reduced
          ? 'none'
          : `opacity .45s ${stagger}ms ease, transform .4s ${stagger}ms ease, background .22s ease, box-shadow .22s ease, border-color .22s ease`,
        outline: 'none',
      }}
    >
      {/* Portrait */}
      <div style={{
        transition: reduced ? 'none' : 'transform .22s ease',
        transform: !reduced && isActive ? 'scale(1.05)' : 'scale(1)',
        position: 'relative',
      }}>
        <Portrait t={t} size={108} gold={!isActive} />
        {/* Gold indicator dot */}
        {isActive && (
          <div style={{
            position: 'absolute', bottom: 0, right: 2,
            width: 18, height: 18, borderRadius: '50%',
            background: GOLD, border: '2px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, color: '#fff', fontWeight: 900,
          }}>→</div>
        )}
      </div>
      {/* Name */}
      <h3 style={{
        marginTop: 13, fontSize: 12.5, fontWeight: 900, color: GREEN,
        lineHeight: 1.3, margin: '13px 0 0', textAlign: 'center',
        textTransform: 'uppercase', letterSpacing: '.03em',
      }}>{t.full_name}</h3>
      {/* Role */}
      <div style={{ marginTop: 7 }}>
        <RoleBadge text={t.job_title || "Qur'an Teacher"} />
      </div>
      {/* View Profile */}
      <div style={{
        marginTop: 10, fontSize: 11, fontWeight: 800, color: TEAL,
        letterSpacing: '.04em', transition: 'color .2s',
      }}>
        View Profile →
      </div>
    </article>
  );
}

/* ── desktop profile panel ── */
function ProfilePanel({
  teacher, visible, reduced,
}: {
  teacher: Teacher | null;
  visible: boolean;
  reduced: boolean;
}) {
  return (
    <aside
      aria-live="polite"
      aria-label={teacher ? `Profile: ${teacher.full_name}` : 'Teacher profile'}
      style={{
        width: 300,
        flexShrink: 0,
        borderRadius: 20,
        background: '#fff',
        border: `1.5px solid ${GOLD}33`,
        boxShadow: '0 12px 40px rgba(6,45,40,.13)',
        padding: '24px 22px',
        transition: reduced ? 'none' : 'opacity .3s ease, transform .3s ease',
        opacity: visible && teacher ? 1 : 0,
        transform: reduced ? 'none' : visible && teacher ? 'translateX(0) scale(1)' : 'translateX(14px) scale(.97)',
        pointerEvents: visible && teacher ? 'auto' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        minHeight: 200,
      }}
    >
      {teacher && (
        <>
          {/* Gold top rule */}
          <div style={{ height: 3, background: `linear-gradient(90deg,transparent,${GOLD} 30%,#f6d46d 50%,${GOLD} 70%,transparent)`, borderRadius: 99, marginBottom: 20 }} />

          {/* Photo */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Portrait t={teacher} size={90} />
          </div>

          {/* Name */}
          <h3 style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 15, fontWeight: 900, color: GREEN, margin: 0, textAlign: 'center', lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: '.03em' }}>
            {teacher.full_name}
          </h3>

          {/* Role */}
          {(teacher.job_title || teacher.department) && (
            <div style={{ textAlign: 'center', marginTop: 9 }}>
              <RoleBadge text={teacher.job_title || teacher.department || ''} />
            </div>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: `${GOLD}30`, margin: '16px 0' }} />

          {/* Department (only if different from job_title) */}
          {teacher.department && teacher.department !== teacher.job_title && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: TEAL, marginBottom: 3 }}>Department</div>
              <div style={{ fontSize: 13, color: '#3d5c4e' }}>{teacher.department}</div>
            </div>
          )}

          {/* Qualifications */}
          {teacher.qualifications && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: TEAL, marginBottom: 3 }}>Qualifications</div>
              <div style={{ fontSize: 12.5, color: '#3d5c4e' }}>{teacher.qualifications}</div>
            </div>
          )}

          {/* Experience */}
          {teacher.experience && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: TEAL, marginBottom: 3 }}>Experience</div>
              <div style={{ fontSize: 12.5, color: '#3d5c4e' }}>{teacher.experience}</div>
            </div>
          )}

          {/* Subjects */}
          {teacher.subjects && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: TEAL, marginBottom: 3 }}>Subjects</div>
              <div style={{ fontSize: 12.5, color: '#3d5c4e' }}>{teacher.subjects}</div>
            </div>
          )}

          {/* Bio */}
          {teacher.bio && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: TEAL, marginBottom: 5 }}>About</div>
              <p style={{
                fontSize: 12.5, lineHeight: 1.72, color: '#4a6258', margin: 0,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
              }}>{teacher.bio}</p>
            </div>
          )}

          {/* CTA */}
          <Link
            href={`/teachers/${teacher.id}`}
            style={{
              display: 'block', textAlign: 'center', marginTop: 'auto',
              padding: '10px 0', borderRadius: 12,
              background: GREEN, color: '#fff',
              fontSize: 12, fontWeight: 800, letterSpacing: '.06em',
              textDecoration: 'none',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = TEAL; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = GREEN; }}
          >
            View Full Profile →
          </Link>
        </>
      )}
    </aside>
  );
}

/* ── tablet inline panel (below carousel) ── */
function TabletPanel({ teacher, onClose }: { teacher: Teacher | null; onClose: () => void }) {
  if (!teacher) return null;
  return (
    <div style={{
      marginTop: 22,
      borderRadius: 20,
      background: '#fff',
      border: `1.5px solid ${GOLD}33`,
      boxShadow: '0 8px 30px rgba(6,45,40,.1)',
      padding: '22px 20px',
      display: 'flex',
      gap: 20,
      alignItems: 'flex-start',
      position: 'relative',
    }}>
      {/* Close */}
      <button
        aria-label="Close profile"
        onClick={onClose}
        style={{
          position: 'absolute', top: 14, right: 14,
          width: 32, height: 32, borderRadius: '50%',
          background: '#f1f5f3', border: 'none', cursor: 'pointer',
          fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: GREEN, fontWeight: 900,
        }}
      >×</button>

      <Portrait t={teacher} size={80} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 15, fontWeight: 900, color: GREEN, margin: 0, textTransform: 'uppercase', letterSpacing: '.02em' }}>
          {teacher.full_name}
        </h3>
        {(teacher.job_title || teacher.department) && (
          <div style={{ marginTop: 7 }}>
            <RoleBadge text={teacher.job_title || teacher.department || ''} />
          </div>
        )}
        {teacher.department && teacher.department !== teacher.job_title && (
          <div style={{ marginTop: 9, fontSize: 12.5, color: '#4a6258' }}>
            <span style={{ fontWeight: 700, color: TEAL }}>Dept: </span>{teacher.department}
          </div>
        )}
        {teacher.qualifications && (
          <div style={{ marginTop: 8, fontSize: 12.5, color: '#4a6258' }}>
            <span style={{ fontWeight: 700, color: TEAL }}>Qualifications: </span>{teacher.qualifications}
          </div>
        )}
        {teacher.experience && (
          <div style={{ marginTop: 6, fontSize: 12.5, color: '#4a6258' }}>
            <span style={{ fontWeight: 700, color: TEAL }}>Experience: </span>{teacher.experience}
          </div>
        )}
        {teacher.subjects && (
          <div style={{ marginTop: 6, fontSize: 12.5, color: '#4a6258' }}>
            <span style={{ fontWeight: 700, color: TEAL }}>Subjects: </span>{teacher.subjects}
          </div>
        )}
        {teacher.bio && (
          <p style={{
            fontSize: 13, lineHeight: 1.7, color: '#4a6258', margin: '10px 0 0',
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
          }}>{teacher.bio}</p>
        )}
        <Link
          href={`/teachers/${teacher.id}`}
          style={{
            display: 'inline-block', marginTop: 12,
            padding: '9px 18px', borderRadius: 10,
            background: GREEN, color: '#fff',
            fontSize: 12, fontWeight: 800, textDecoration: 'none',
          }}
        >View Full Profile →</Link>
      </div>
    </div>
  );
}

/* ── mobile bottom sheet ── */
function MobileSheet({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <button
        aria-label="Close teacher profile"
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(6,45,42,.65)', border: 'none', cursor: 'pointer' }}
      />
      {/* Sheet */}
      <div style={{
        position: 'relative',
        background: '#fff',
        borderRadius: '24px 24px 0 0',
        maxHeight: '88vh',
        overflowY: 'auto',
        padding: '20px 20px 36px',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#d0d5d3', margin: '0 auto 18px' }} />
        {/* Close */}
        <button
          aria-label="Close profile"
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 14,
            width: 40, height: 40, borderRadius: '50%',
            background: '#f1f5f3', border: 'none', cursor: 'pointer',
            fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: GREEN, fontWeight: 900,
          }}
        >×</button>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <Portrait t={teacher} size={100} />
        </div>

        <h2 style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 18, fontWeight: 900, color: GREEN, margin: 0, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.03em', lineHeight: 1.2 }}>
          {teacher.full_name}
        </h2>

        {(teacher.job_title || teacher.department) && (
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <RoleBadge text={teacher.job_title || teacher.department || ''} size="md" />
          </div>
        )}

        <div style={{ height: 1, background: `${GOLD}44`, margin: '18px 0' }} />

        {teacher.department && teacher.department !== teacher.job_title && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: TEAL, marginBottom: 5 }}>Department</div>
            <div style={{ fontSize: 14.5, color: '#3d5c4e' }}>{teacher.department}</div>
          </div>
        )}

        {teacher.qualifications && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: TEAL, marginBottom: 5 }}>Qualifications</div>
            <div style={{ fontSize: 14, color: '#3d5c4e' }}>{teacher.qualifications}</div>
          </div>
        )}

        {teacher.experience && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: TEAL, marginBottom: 5 }}>Experience</div>
            <div style={{ fontSize: 14, color: '#3d5c4e' }}>{teacher.experience}</div>
          </div>
        )}

        {teacher.subjects && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: TEAL, marginBottom: 5 }}>Subjects</div>
            <div style={{ fontSize: 14, color: '#3d5c4e' }}>{teacher.subjects}</div>
          </div>
        )}

        {teacher.bio && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: TEAL, marginBottom: 6 }}>About</div>
            <p style={{ fontSize: 14.5, lineHeight: 1.78, color: '#4a6258', margin: 0 }}>{teacher.bio}</p>
          </div>
        )}

        <Link
          href={`/teachers/${teacher.id}`}
          onClick={onClose}
          style={{
            display: 'block', textAlign: 'center',
            padding: '15px 0', borderRadius: 14,
            background: GREEN, color: '#fff',
            fontSize: 15, fontWeight: 800, textDecoration: 'none',
          }}
        >View Full Profile →</Link>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────
   MAIN EXPORTED COMPONENT
────────────────────────────────────────────────── */
export function TeachingStaffSection({
  teachers,
  values,
}: {
  teachers: Teacher[];
  values: ValuesItem[];
}) {
  /* animation state */
  const [entered, setEntered] = useState(false);
  const [valuesEntered, setValuesEntered] = useState(false);
  const [reduced, setReduced] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const valuesRef = useRef<HTMLDivElement>(null);

  /* responsive */
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  /* carousel */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollL, setCanScrollL] = useState(false);
  const [canScrollR, setCanScrollR] = useState(true);

  /* hover profile panel */
  const [activeTeacher, setActiveTeacher] = useState<Teacher | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* tablet inline panel */
  const [tabletTeacher, setTabletTeacher] = useState<Teacher | null>(null);

  /* mobile sheet */
  const [mobileTeacher, setMobileTeacher] = useState<Teacher | null>(null);

  /* ── effects ── */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const h = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setIsDesktop(w >= 1024);
      setIsMobile(w < 768);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setEntered(true); obs.disconnect(); } },
      { threshold: 0.08 }
    );
    if (sectionRef.current) obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setValuesEntered(true); obs.disconnect(); } },
      { threshold: 0.2 }
    );
    if (valuesRef.current) obs.observe(valuesRef.current);
    return () => obs.disconnect();
  }, []);

  /* scroll tracking */
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
    // also fire on resize so arrows stay accurate
    window.addEventListener('resize', updateScroll);
    updateScroll();
    return () => {
      el.removeEventListener('scroll', updateScroll);
      window.removeEventListener('resize', updateScroll);
    };
  }, [updateScroll]);

  /* ── hover handlers ── */
  const clearLeave = () => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
  };

  const onCardEnter = useCallback((t: Teacher) => {
    clearLeave();
    setActiveTeacher(t);
    setPanelOpen(true);
  }, []);

  const onAreaLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setPanelOpen(false), 200);
  }, []);

  /* ── click / tap handler ── */
  const onCardClick = useCallback((t: Teacher) => {
    if (isMobile) {
      setMobileTeacher(t);
    } else if (!isDesktop) {
      // tablet
      setTabletTeacher(prev => (prev?.id === t.id ? null : t));
    }
    // desktop: hover already handles profile panel; clicking still navigable via keyboard
  }, [isMobile, isDesktop]);

  /* ── carousel navigation ── */
  const scrollLeft = () => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: -(el.clientWidth * 0.75), behavior: reduced ? 'instant' as ScrollBehavior : 'smooth' });
  };
  const scrollRight = () => {
    const el = scrollRef.current;
    if (el) el.scrollBy({ left: el.clientWidth * 0.75, behavior: reduced ? 'instant' as ScrollBehavior : 'smooth' });
  };

  /* ── style helpers ── */
  const arrowBtn = (enabled: boolean): React.CSSProperties => ({
    width: 38, height: 38, borderRadius: '50%',
    background: enabled ? GREEN : '#e0e8e5',
    color: enabled ? '#fff' : '#9cb4af',
    border: 'none', cursor: enabled ? 'pointer' : 'default',
    flexShrink: 0, fontSize: 15, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, transition: 'background .2s, color .2s',
    outline: 'none',
  });

  const fadeUp = (delay = 0, ready = entered): React.CSSProperties => ({
    opacity: reduced ? 1 : ready ? 1 : 0,
    transform: reduced ? 'none' : ready ? 'translateY(0)' : 'translateY(12px)',
    transition: reduced ? 'none' : `opacity .48s ${delay}ms ease, transform .44s ${delay}ms ease`,
  });

  if (teachers.length === 0) return null;

  return (
    <>
      {/* ── scoped styles ── */}
      <style>{`
        .ts-scroll {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding: 8px 2px 20px;
        }
        .ts-scroll::-webkit-scrollbar { display: none; }

        /* card width: responsive */
        .ts-card {
          flex: 0 0 auto;
          scroll-snap-align: start;
          width: 155px;
        }
        @media (max-width: 767px) {
          .ts-card { width: calc(50% - 8px); min-width: 138px; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .ts-card { width: 155px; }
        }

        /* desktop profile panel column */
        .ts-panel-col { display: none; }
        @media (min-width: 1024px) { .ts-panel-col { display: block; } }

        /* tablet panel hidden on desktop + mobile */
        .ts-tablet { display: block; }
        @media (min-width: 1024px) { .ts-tablet { display: none; } }
        @media (max-width: 767px) { .ts-tablet { display: none; } }

        /* card focus ring */
        .ts-card:focus-visible {
          outline: 2.5px solid ${GOLD};
          outline-offset: 3px;
          border-radius: 18px;
        }

        /* value pills */
        .ts-pill {
          border-radius: 12px;
          background: #fff;
          padding: 10px 18px;
          font-size: 13px;
          font-weight: 800;
          color: ${GREEN};
          box-shadow: 0 2px 8px rgba(6,45,40,.08);
          cursor: default;
          border: 1.5px solid transparent;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
        }
        .ts-pill:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(6,45,40,.12);
          border-color: ${GOLD}55;
        }
        @media (prefers-reduced-motion: reduce) {
          .ts-pill { transition: none; }
          .ts-pill:hover { transform: none; }
          .ts-card { transition: none !important; }
        }
      `}</style>

      {/* ═══ TEACHING STAFF SECTION ═══ */}
      <div ref={sectionRef} id="teaching-staff" style={{ background: CREAM, position: 'relative' }}>
        {/* Top border accent */}
        <div style={{ height: 4, background: 'linear-gradient(90deg,#062d2a,#0f766e 50%,#062d2a)' }} />

        <div className="mx-auto max-w-[1320px] px-5 sm:px-7" style={{ paddingTop: 72, paddingBottom: 64 }}>

          {/* Section header */}
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ ...fadeUp(0), display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 32, height: 1, background: TEAL, opacity: .5 }} />
              <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.26em', textTransform: 'uppercase', color: TEAL }}>Teaching Staff</span>
              <div style={{ width: 32, height: 1, background: TEAL, opacity: .5 }} />
            </div>
            <h2 style={{ ...fadeUp(80), fontFamily: "Georgia,'Times New Roman',serif", fontSize: 'clamp(1.8rem,3vw,2.5rem)', fontWeight: 900, color: GREEN, lineHeight: 1.1, margin: 0 }}>
              Shaping the next generation of ḥuffāẓ.
            </h2>
            <p style={{ ...fadeUp(160), marginTop: 12, fontSize: 14.5, lineHeight: 1.75, color: '#6b7c76', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
              Our qualified teachers bring dedication, knowledge and care to every lesson.
            </p>
          </div>

          {/* Carousel + panel container */}
          <div
            style={{ ...fadeUp(240), display: 'flex', gap: 24, alignItems: 'flex-start' }}
            onMouseLeave={isDesktop ? onAreaLeave : undefined}
          >
            {/* Carousel wrapper */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Left arrow */}
                <button
                  aria-label="Scroll teachers left"
                  onClick={scrollLeft}
                  disabled={!canScrollL}
                  style={arrowBtn(canScrollL)}
                >←</button>

                {/* Scroll area */}
                <div ref={scrollRef} className="ts-scroll" style={{ flex: 1 }}>
                  {teachers.map((t, idx) => (
                    <TeacherCard
                      key={t.id}
                      t={t}
                      isActive={
                        (isDesktop && panelOpen && activeTeacher?.id === t.id) ||
                        (!isDesktop && !isMobile && tabletTeacher?.id === t.id)
                      }
                      idx={idx}
                      entered={entered}
                      reduced={reduced}
                      onMouseEnter={() => isDesktop && onCardEnter(t)}
                      onFocus={() => isDesktop && onCardEnter(t)}
                      onClick={() => onCardClick(t)}
                    />
                  ))}
                </div>

                {/* Right arrow */}
                <button
                  aria-label="Scroll teachers right"
                  onClick={scrollRight}
                  disabled={!canScrollR}
                  style={arrowBtn(canScrollR)}
                >→</button>
              </div>

              {/* Tablet profile panel (inline below carousel) */}
              <div className="ts-tablet">
                <TabletPanel teacher={tabletTeacher} onClose={() => setTabletTeacher(null)} />
              </div>
            </div>

            {/* Desktop profile panel */}
            <div className="ts-panel-col" style={{ width: 300, flexShrink: 0, alignSelf: 'flex-start' }}>
              <ProfilePanel teacher={activeTeacher} visible={panelOpen} reduced={reduced} />
            </div>
          </div>
        </div>
      </div>

      {/* ═══ VALUES STRIP ═══ */}
      {values.length > 0 && (
        <div
          ref={valuesRef}
          style={{ borderTop: '1px solid rgba(6,45,40,.1)', borderBottom: '1px solid rgba(6,45,40,.1)', background: '#f4f6f1', padding: '24px 20px' }}
        >
          <div
            className="mx-auto max-w-[1320px]"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            {values.map((x, i) => {
              const label = typeof x === 'string' ? x : x.label;
              return (
                <span
                  key={i}
                  className="ts-pill"
                  style={{
                    opacity: reduced ? 1 : valuesEntered ? 1 : 0,
                    transform: reduced ? 'none' : valuesEntered ? 'translateY(0)' : 'translateY(8px)',
                    transition: reduced ? 'none' : `opacity .44s ${i * 60}ms ease, transform .4s ${i * 60}ms ease`,
                  }}
                >
                  <span style={{ color: GOLD, fontSize: 10 }}>✦</span> {label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile bottom sheet */}
      {mobileTeacher && (
        <MobileSheet teacher={mobileTeacher} onClose={() => setMobileTeacher(null)} />
      )}
    </>
  );
}
