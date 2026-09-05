'use client';

import Link from 'next/link';
import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

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
const CREAM  = '#F5F0E8';
const DARK   = '#062d2a';
const GOLD   = '#C9A84C';
const GOLD_L = '#E8C97A';
const GOLD_D = '#9A7020';

/* ── sizing constants ── */
const PH = 112; // portrait area cell height (line runs at PH/2 = 56)
const AW = 104; // ring+portrait wrapper size (active)
const AD = 82;  // active portrait diameter
const ID = 52;  // inactive portrait diameter

/* ────────────────────────────────────
   Islamic geometric SVG decoration
──────────────────────────────────── */
function GeometricDecor({ size = 180, opacity = 0.05 }: { size?: number; opacity?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden style={{ display: 'block', opacity }}>
      <defs>
        <pattern id="ls-geo" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
          <polygon
            points="15,2 28,9 28,21 15,28 2,21 2,9"
            fill="none" stroke={GOLD} strokeWidth="0.9"
          />
          <line x1="15" y1="2"  x2="15" y2="28" stroke={GOLD} strokeWidth="0.4" opacity="0.55" />
          <line x1="2"  y1="15" x2="28" y2="15" stroke={GOLD} strokeWidth="0.4" opacity="0.55" />
          <circle cx="15" cy="15" r="3.5" fill="none" stroke={GOLD} strokeWidth="0.7" />
        </pattern>
      </defs>
      <rect width="120" height="120" fill="url(#ls-geo)" />
    </svg>
  );
}

/* ────────────────────────────────────
   Timeline bubble (portrait + name)
──────────────────────────────────── */
const TimelineBubble = forwardRef<HTMLButtonElement, {
  leader: Leader;
  isActive: boolean;
  reduced: boolean;
  onClick: () => void;
  onFocus: () => void;
}>(function TimelineBubble({ leader, isActive, reduced, onClick, onFocus }, ref) {
  const d = isActive ? AD : ID;
  const initial = leader.full_name?.charAt(0) ?? '?';

  return (
    <button
      ref={ref}
      role="tab"
      aria-selected={isActive}
      aria-label={leader.full_name}
      onClick={onClick}
      onFocus={onFocus}
      className="ls-bubble"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '0 8px',
        flexShrink: 0,
        outline: 'none',
        transition: reduced ? 'none' : 'padding .3s ease',
        userSelect: 'none',
      }}
    >
      {/* Portrait area — fixed height keeps the timeline line aligned */}
      <div style={{ height: PH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: AW, height: AW, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Outer halo ring */}
          {isActive && (
            <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `1.5px solid ${GOLD}40`, pointerEvents: 'none' }} />
          )}
          {/* Inner gold ring */}
          {isActive && (
            <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', border: `3px solid ${GOLD}`, pointerEvents: 'none' }} />
          )}
          {/* Portrait circle */}
          <div style={{
            width: d, height: d,
            borderRadius: '50%',
            overflow: 'hidden',
            background: DARK,
            flexShrink: 0,
            filter: isActive ? 'none' : 'grayscale(45%) brightness(0.82)',
            opacity: isActive ? 1 : 0.58,
            boxShadow: isActive ? `0 6px 24px rgba(6,45,42,.28)` : 'none',
            transition: reduced
              ? 'none'
              : 'width .32s ease, height .32s ease, opacity .32s ease, filter .32s ease, box-shadow .32s ease',
          }}>
            {leader.photo_url
              ? <img
                  src={leader.photo_url}
                  alt={leader.full_name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%' }}
                />
              : <div style={{
                  height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Georgia,serif', fontSize: d * 0.36, color: GOLD, fontWeight: 900,
                }}>{initial}</div>
            }
          </div>
          {/* Active indicator dot */}
          {isActive && (
            <div style={{
              position: 'absolute', bottom: 5, right: 5,
              width: 14, height: 14, borderRadius: '50%',
              background: GOLD, border: `2.5px solid ${CREAM}`,
              zIndex: 2,
            }} />
          )}
        </div>
      </div>

      {/* Name */}
      <div style={{
        marginTop: 7,
        fontSize: isActive ? 11.5 : 10.5,
        fontWeight: isActive ? 900 : 600,
        color: isActive ? DARK : `${DARK}50`,
        textAlign: 'center',
        lineHeight: 1.3,
        maxWidth: 96,
        transition: reduced ? 'none' : 'font-size .3s ease, color .3s ease',
      }}>
        {leader.full_name}
      </div>

      {/* Role (active only) */}
      {isActive && leader.role_title && (
        <div style={{
          marginTop: 4,
          fontSize: 9.5, fontWeight: 800,
          color: GOLD_D, letterSpacing: '.09em',
          textTransform: 'uppercase',
          textAlign: 'center',
          maxWidth: 110, lineHeight: 1.25,
        }}>
          {leader.role_title}
        </div>
      )}
    </button>
  );
});

/* ────────────────────────────────────
   Desktop profile card (2-column)
──────────────────────────────────── */
function ProfileCard({ leader, reduced }: { leader: Leader; reduced: boolean }) {
  const initial = leader.full_name?.charAt(0) ?? '?';
  const hasDetail = leader.qualifications || leader.experience || leader.subjects || leader.brief_bio;

  return (
    <div style={{
      display: 'flex',
      borderRadius: 24,
      background: '#fff',
      border: `1.5px solid ${GOLD}2e`,
      boxShadow: '0 24px 64px rgba(6,45,42,.09)',
      overflow: 'hidden',
      animation: reduced ? 'none' : 'ls-card-in .32s ease',
    }}>
      {/* Left: image column */}
      <div style={{ width: 300, flexShrink: 0, position: 'relative', background: DARK, overflow: 'hidden' }}>
        {/* Gold top rule */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, zIndex: 3,
          background: `linear-gradient(90deg,transparent,${GOLD} 30%,${GOLD_L} 50%,${GOLD} 70%,transparent)` }} />
        {/* Geometric decoration bottom-right */}
        <div style={{ position: 'absolute', bottom: -24, right: -24, zIndex: 0 }}>
          <GeometricDecor size={200} opacity={0.09} />
        </div>
        {/* Photo */}
        {leader.photo_url
          ? <img
              src={leader.photo_url}
              alt={leader.full_name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%', minHeight: 340, position: 'relative', zIndex: 1 }}
            />
          : <div style={{
              height: '100%', minHeight: 340, width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Georgia,serif', fontSize: 96, color: `${GOLD}25`, fontWeight: 900,
              position: 'relative', zIndex: 1,
            }}>{initial}</div>
        }
        {/* Bottom gradient */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 2,
          background: 'linear-gradient(to top, rgba(6,45,42,.6) 0%, transparent 48%)' }} />
      </div>

      {/* Right: info column */}
      <div style={{ flex: 1, padding: '36px 42px 36px', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative corner */}
        <div style={{ position: 'absolute', top: -28, right: -28, pointerEvents: 'none' }}>
          <GeometricDecor size={160} opacity={0.04} />
        </div>

        {/* Name */}
        <h3 style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 'clamp(1.3rem, 2.2vw, 1.9rem)',
          fontWeight: 900, color: DARK, margin: 0,
          lineHeight: 1.12, letterSpacing: '-.015em',
        }}>
          {leader.full_name}
        </h3>

        {/* Role badge */}
        {leader.role_title && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            marginTop: 14, padding: '5px 16px', borderRadius: 99,
            background: `${GOLD}18`, border: `1px solid ${GOLD}44`,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, fontWeight: 900, color: GOLD_D, letterSpacing: '.13em', textTransform: 'uppercase' }}>
              {leader.role_title}
            </span>
          </div>
        )}

        {/* Gold divider */}
        <div style={{ height: 1, background: `linear-gradient(90deg,${GOLD}44,transparent)`, margin: '22px 0' }} />

        {/* Detail rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {leader.qualifications && <ProfileRow label="Qualifications"   value={leader.qualifications} />}
          {leader.experience     && <ProfileRow label="Experience"       value={leader.experience}     />}
          {leader.subjects       && <ProfileRow label="Responsibilities" value={leader.subjects}       />}
          {leader.brief_bio && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD_D, opacity: .72, marginBottom: 6 }}>About</div>
              <p style={{
                fontSize: 14, lineHeight: 1.74, color: `${DARK}77`, margin: 0,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
              }}>{leader.brief_bio}</p>
            </div>
          )}
          {!hasDetail && (
            <p style={{ fontSize: 13.5, color: `${DARK}38`, fontStyle: 'italic', margin: 0 }}>Profile details coming soon.</p>
          )}
        </div>

        {/* CTA */}
        <Link
          href={`/leadership/${leader.id}`}
          className="ls-cta"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            marginTop: 28, padding: '12px 26px', borderRadius: 12,
            background: DARK, color: '#fff',
            fontSize: 13, fontWeight: 800, letterSpacing: '.04em',
            textDecoration: 'none', transition: 'background .2s ease',
          }}
        >
          View Full Profile →
        </Link>
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD_D, opacity: .72, marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.62, color: `${DARK}80` }}>{value}</div>
    </div>
  );
}

/* ────────────────────────────────────
   Mobile compact card
──────────────────────────────────── */
function MobileCard({ leader }: { leader: Leader }) {
  const initial = leader.full_name?.charAt(0) ?? '?';
  return (
    <div style={{
      borderRadius: 20, background: '#fff',
      border: `1.5px solid ${GOLD}2e`,
      boxShadow: '0 8px 32px rgba(6,45,42,.1)',
      overflow: 'hidden',
      animation: 'ls-card-in .28s ease',
    }}>
      <div style={{ height: 3, background: `linear-gradient(90deg,transparent,${GOLD} 30%,${GOLD_L} 50%,${GOLD} 70%,transparent)` }} />
      <div style={{ padding: '20px 20px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{
            width: 66, height: 66, borderRadius: '50%', overflow: 'hidden',
            background: DARK, flexShrink: 0,
            boxShadow: `0 0 0 2.5px ${CREAM}, 0 0 0 5px ${GOLD}`,
          }}>
            {leader.photo_url
              ? <img src={leader.photo_url} alt={leader.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%' }} />
              : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: 24, color: GOLD, fontWeight: 900 }}>{initial}</div>
            }
          </div>
          <div>
            <h3 style={{ fontFamily: 'Georgia,serif', fontSize: 14.5, fontWeight: 900, color: DARK, margin: 0, lineHeight: 1.2 }}>
              {leader.full_name}
            </h3>
            {leader.role_title && (
              <div style={{ marginTop: 5, fontSize: 9.5, fontWeight: 800, color: GOLD_D, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                {leader.role_title}
              </div>
            )}
          </div>
        </div>

        <div style={{ height: 1, background: `${GOLD}22`, margin: '14px 0' }} />

        {leader.qualifications && <MobileRow label="Qualifications"   v={leader.qualifications} />}
        {leader.experience     && <MobileRow label="Experience"       v={leader.experience}     />}
        {leader.subjects       && <MobileRow label="Responsibilities" v={leader.subjects}       />}
        {leader.brief_bio && (
          <p style={{ fontSize: 13, lineHeight: 1.68, color: `${DARK}75`, margin: '0 0 14px' }}>{leader.brief_bio}</p>
        )}

        <Link
          href={`/leadership/${leader.id}`}
          style={{
            display: 'block', textAlign: 'center',
            padding: '12px', borderRadius: 12,
            background: DARK, color: '#fff',
            fontSize: 13, fontWeight: 800, textDecoration: 'none',
          }}
        >
          View Full Profile →
        </Link>
      </div>
    </div>
  );
}

function MobileRow({ label, v }: { label: string; v: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, color: GOLD_D }}>{label}: </span>
      <span style={{ fontSize: 13, color: `${DARK}75` }}>{v}</span>
    </div>
  );
}

/* ════════════════════════════════════════
   MAIN EXPORTED COMPONENT
════════════════════════════════════════ */
export function LeadershipSection({
  leaders,
  shortName = 'AMQM',
}: {
  leaders: Leader[];
  shortName?: string;
}) {
  const [idx, setIdx]         = useState(0);
  const [entered, setEntered] = useState(false);
  const [reduced, setReduced] = useState(false);

  const sectionRef  = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const bubbleRefs  = useRef<(HTMLButtonElement | null)[]>([]);

  /* prefers-reduced-motion */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const h = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  /* Scroll-reveal entrance */
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setEntered(true); obs.disconnect(); } },
      { threshold: 0.08 }
    );
    if (sectionRef.current) obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, []);

  /* Scroll active bubble into view */
  useEffect(() => {
    const b = bubbleRefs.current[idx];
    if (b && timelineRef.current) {
      b.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [idx, reduced]);

  const go = useCallback((n: number) => {
    setIdx(Math.max(0, Math.min(leaders.length - 1, n)));
  }, [leaders.length]);

  /* Arrow-key navigation on the timeline row */
  const onTimelineKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); go(idx - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
    if (e.key === 'Home')       { e.preventDefault(); go(0); }
    if (e.key === 'End')        { e.preventDefault(); go(leaders.length - 1); }
  }, [idx, go, leaders.length]);

  const fadeUp = (delay = 0): React.CSSProperties => ({
    opacity:   reduced ? 1 : entered ? 1 : 0,
    transform: reduced ? 'none' : entered ? 'translateY(0)' : 'translateY(14px)',
    transition: reduced ? 'none' : `opacity .5s ${delay}ms ease, transform .46s ${delay}ms ease`,
  });

  const navBtn = (enabled: boolean): React.CSSProperties => ({
    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
    background: enabled ? GOLD : `${DARK}10`,
    color:      enabled ? DARK : `${DARK}28`,
    border: 'none', cursor: enabled ? 'pointer' : 'not-allowed',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 22, fontWeight: 900,
    transition: 'background .2s ease, color .2s ease',
    outline: 'none',
  });

  const leader = leaders[idx] ?? leaders[0];

  if (leaders.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes ls-card-in {
          from { opacity: 0; transform: translateY(9px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ls-cta:hover { background: #0d4a40 !important; }
        .ls-bubble:focus-visible {
          outline: 2.5px solid ${GOLD};
          outline-offset: 4px;
          border-radius: 50%;
        }
        .ls-nav:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 2px; border-radius: 50%; }
        .ls-nav:hover:not(:disabled) { filter: brightness(1.1); }
        .ls-tl { display:flex; overflow-x:auto; scrollbar-width:none; -ms-overflow-style:none; scroll-snap-type:x proximity; }
        .ls-tl::-webkit-scrollbar { display:none; }
        .ls-desk { display:none; }
        .ls-mob  { display:block; }
        @media (min-width:600px) { .ls-desk { display:block; } .ls-mob { display:none; } }
        @media (prefers-reduced-motion:reduce) {
          .ls-desk>div, .ls-mob>div { animation:none !important; }
        }
      `}</style>

      <section
        ref={sectionRef}
        id="leadership"
        aria-label="Leadership & Management"
        style={{ background: CREAM, position: 'relative', overflow: 'hidden', paddingTop: 80, paddingBottom: 92 }}
      >
        {/* Gold radial wash */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 70% 42% at 50% 0%, ${GOLD}0e 0%, transparent 60%)` }} />

        <div className="mx-auto max-w-[1200px] px-5 sm:px-8" style={{ position: 'relative' }}>

          {/* ── Section header ── */}
          <div style={{ textAlign: 'center', marginBottom: 58 }}>
            <div style={{ ...fadeUp(0), display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 32, height: 1, background: GOLD, opacity: .6 }} />
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.3em', textTransform: 'uppercase', color: GOLD_D }}>
                Leadership &amp; Management
              </span>
              <div style={{ width: 32, height: 1, background: GOLD, opacity: .6 }} />
            </div>
            <h2 style={{
              ...fadeUp(90),
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 'clamp(1.85rem, 3.2vw, 2.8rem)',
              fontWeight: 900, color: DARK, lineHeight: 1.08, margin: 0, letterSpacing: '-.02em',
            }}>
              The people who lead {shortName}.
            </h2>
            <p style={{
              ...fadeUp(170),
              marginTop: 14, fontSize: 15, lineHeight: 1.72,
              color: `${DARK}6e`, maxWidth: 420,
              marginLeft: 'auto', marginRight: 'auto',
            }}>
              Experienced educators and visionary leaders dedicated to excellence in Qur&apos;anic education.
            </p>
          </div>

          {/* ── Timeline strip + nav ── */}
          <div style={fadeUp(250)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Prev */}
              <button
                aria-label="Previous leader"
                onClick={() => go(idx - 1)}
                disabled={idx === 0}
                className="ls-nav"
                style={navBtn(idx > 0)}
              >‹</button>

              {/* Timeline */}
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                {/* Connecting line — centred at PH/2 from top */}
                <div aria-hidden style={{
                  position: 'absolute',
                  top: PH / 2 - 1,
                  left: 16, right: 16,
                  height: 2,
                  background: `linear-gradient(90deg, transparent, ${GOLD}50 12%, ${GOLD}50 88%, transparent)`,
                  pointerEvents: 'none', zIndex: 0,
                }} />

                {/* Scroll row */}
                <div
                  ref={timelineRef}
                  className="ls-tl"
                  role="tablist"
                  aria-label="Leadership team"
                  onKeyDown={onTimelineKey}
                  style={{ position: 'relative', zIndex: 1, paddingBottom: 8, alignItems: 'flex-start' }}
                >
                  {leaders.map((l, i) => (
                    <TimelineBubble
                      key={l.id}
                      ref={(el: HTMLButtonElement | null) => { bubbleRefs.current[i] = el; }}
                      leader={l}
                      isActive={i === idx}
                      reduced={reduced}
                      onClick={() => go(i)}
                      onFocus={() => go(i)}
                    />
                  ))}
                </div>
              </div>

              {/* Next */}
              <button
                aria-label="Next leader"
                onClick={() => go(idx + 1)}
                disabled={idx === leaders.length - 1}
                className="ls-nav"
                style={navBtn(idx < leaders.length - 1)}
              >›</button>
            </div>

            {/* Progress dots */}
            {leaders.length > 1 && (
              <div aria-hidden style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
                {leaders.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => go(i)}
                    style={{
                      width: i === idx ? 24 : 7, height: 7,
                      borderRadius: 4, border: 'none', cursor: 'pointer', padding: 0,
                      background: i === idx ? GOLD : `${DARK}20`,
                      transition: reduced ? 'none' : 'width .26s ease, background .26s ease',
                      outline: 'none',
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── Profile panel ── */}
          {leader && (
            <div style={{ ...fadeUp(310), marginTop: 44 }}>
              <div className="ls-desk">
                <ProfileCard key={leader.id} leader={leader} reduced={reduced} />
              </div>
              <div className="ls-mob">
                <MobileCard key={leader.id} leader={leader} />
              </div>
            </div>
          )}

        </div>
      </section>
    </>
  );
}
