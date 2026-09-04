'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useRef, useState } from 'react';

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
const DARK    = '#062d2a';
const CARD_BG = '#0c3d35';
const GOLD    = '#C9A84C';
const GOLD_LT = '#f0c84a';
const PANEL_BG= '#0a3830';

/* ─────────────────────────────────────────
   LEADER CARD
───────────────────────────────────────── */
function LeaderCard({
  leader, isActive, pageIdx, entered, reduced,
  onHover, onFocus, onClick,
}: {
  leader: Leader;
  isActive: boolean;
  pageIdx: number;
  entered: boolean;
  reduced: boolean;
  onHover: () => void;
  onFocus: () => void;
  onClick: () => void;
}) {
  const initial = leader.full_name?.charAt(0) ?? '?';
  const delay   = reduced ? 0 : pageIdx * 90;

  return (
    <article
      className="ls-card-art"
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`View profile: ${leader.full_name}`}
      onMouseEnter={onHover}
      onFocus={onFocus}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{
        flex: '1 1 0',
        minWidth: 0,
        borderRadius: 14,
        overflow: 'hidden',
        background: CARD_BG,
        border: `2px solid ${isActive ? GOLD : 'rgba(201,168,76,.12)'}`,
        boxShadow: isActive
          ? `0 18px 44px rgba(6,45,42,.38), 0 0 0 1px ${GOLD}30`
          : '0 4px 20px rgba(6,45,42,.18)',
        cursor: 'pointer',
        transform: reduced ? 'none' : entered ? (isActive ? 'translateY(-4px)' : 'none') : 'translateY(18px)',
        opacity: reduced ? 1 : entered ? 1 : 0,
        transition: reduced
          ? 'none'
          : `opacity .45s ${delay}ms ease, transform .35s ease, border-color .25s ease, box-shadow .25s ease`,
        outline: 'none',
      }}
    >
      {/* Gold accent rule */}
      <div style={{ height: 3, background: `linear-gradient(90deg,transparent,${GOLD} 20%,${GOLD_LT} 50%,${GOLD} 80%,transparent)` }} />

      {/* Photo */}
      <div style={{ position: 'relative', height: 220, overflow: 'hidden', background: '#051d1b' }}>
        {leader.photo_url
          ? <img
              src={leader.photo_url}
              alt={leader.full_name}
              style={{
                width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%',
                transform: isActive ? 'scale(1.03)' : 'scale(1)',
                transition: reduced ? 'none' : 'transform .5s ease',
              }}
            />
          : <div style={{
              height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Georgia,serif', fontSize: 56, color: `${GOLD}28`, fontWeight: 900,
            }}>{initial}</div>
        }
        {/* Bottom gradient */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(5,24,20,.92) 0%,rgba(5,24,20,.35) 45%,transparent 75%)' }} />
        {/* Name overlay */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px 15px' }}>
          <h3 style={{
            fontFamily: "Georgia,'Times New Roman',serif",
            fontSize: 13.5, fontWeight: 900, color: '#fff',
            margin: 0, lineHeight: 1.25, letterSpacing: '.01em',
          }}>{leader.full_name}</h3>
          {leader.role_title && (
            <div style={{ marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 10, height: 1.5, background: GOLD, borderRadius: 1 }} />
              <span style={{ fontSize: 9.5, fontWeight: 800, color: GOLD, letterSpacing: '.1em', textTransform: 'uppercase' }}>{leader.role_title}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card footer */}
      <div style={{ padding: '10px 16px 13px', borderTop: '1px solid rgba(201,168,76,.08)' }}>
        {leader.brief_bio && (
          <p style={{
            margin: '0 0 8px', fontSize: 11.5, lineHeight: 1.55, color: 'rgba(255,255,255,.36)',
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{leader.brief_bio}</p>
        )}
        <span style={{ fontSize: 10.5, fontWeight: 800, color: GOLD, letterSpacing: '.04em' }}>View Profile →</span>
      </div>
    </article>
  );
}

/* ─────────────────────────────────────────
   PROFILE PANEL (desktop right column)
───────────────────────────────────────── */
function ProfilePanel({ leader, reduced }: { leader: Leader; reduced: boolean }) {
  const initial = leader.full_name?.charAt(0) ?? '?';
  const hasDetails = leader.qualifications || leader.experience || leader.subjects || leader.brief_bio;

  return (
    <div style={{
      borderRadius: 18,
      background: PANEL_BG,
      border: `1.5px solid ${GOLD}22`,
      boxShadow: '0 16px 48px rgba(6,45,42,.28)',
      overflow: 'hidden',
    }}>
      {/* Gold top rule */}
      <div style={{ height: 3, background: `linear-gradient(90deg,transparent,${GOLD} 20%,${GOLD_LT} 50%,${GOLD} 80%,transparent)` }} />

      {/* Animated inner — key causes CSS re-animation on leader change */}
      <div key={leader.id} className="ls-panel-content">

        {/* Photo */}
        <div style={{ position: 'relative', height: 160, overflow: 'hidden', background: '#051d1b' }}>
          {leader.photo_url
            ? <img
                src={leader.photo_url}
                alt={leader.full_name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%' }}
              />
            : <div style={{
                height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Georgia,serif', fontSize: 48, color: `${GOLD}35`, fontWeight: 900,
              }}>{initial}</div>
          }
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(10,56,48,.88) 0%,transparent 60%)' }} />
        </div>

        <div style={{ padding: '16px 20px 22px' }}>
          {/* Name */}
          <h3 style={{
            fontFamily: "Georgia,'Times New Roman',serif",
            fontSize: 14.5, fontWeight: 900, color: '#fff',
            margin: 0, lineHeight: 1.22, letterSpacing: '.01em',
          }}>{leader.full_name}</h3>

          {/* Role badge */}
          {leader.role_title && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
              padding: '3px 10px', borderRadius: 99,
              background: `${GOLD}18`, border: `1px solid ${GOLD}2a`,
            }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: GOLD, letterSpacing: '.1em', textTransform: 'uppercase' }}>{leader.role_title}</span>
            </div>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: `${GOLD}18`, margin: '14px 0' }} />

          {/* Detail rows */}
          {leader.qualifications && <PanelRow label="Qualifications" value={leader.qualifications} />}
          {leader.experience     && <PanelRow label="Experience"     value={leader.experience}     />}
          {leader.subjects       && <PanelRow label="Responsibilities" value={leader.subjects}     />}
          {leader.brief_bio && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, opacity: .65, marginBottom: 4 }}>About</div>
              <p style={{
                fontSize: 12, lineHeight: 1.68, color: 'rgba(255,255,255,.45)',
                margin: 0, overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
              }}>{leader.brief_bio}</p>
            </div>
          )}

          {!hasDetails && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,.25)', fontStyle: 'italic', margin: '0 0 14px' }}>
              Profile information coming soon.
            </p>
          )}

          {/* CTA */}
          <Link
            href={`/leadership/${leader.id}`}
            className="ls-view-btn"
            style={{
              display: 'block', textAlign: 'center',
              padding: '10px 0', borderRadius: 10,
              background: GOLD, color: DARK,
              fontSize: 12, fontWeight: 900, letterSpacing: '.04em',
              textDecoration: 'none', transition: 'background .2s',
            }}
          >View Full Profile →</Link>
        </div>
      </div>
    </div>
  );
}

function PanelRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, opacity: .65, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: 'rgba(255,255,255,.6)' }}>{value}</div>
    </div>
  );
}

/* ─────────────────────────────────────────
   INLINE PROFILE (mobile / tablet)
───────────────────────────────────────── */
function InlineProfile({ leader, onClose }: { leader: Leader; onClose: () => void }) {
  const initial = leader.full_name?.charAt(0) ?? '?';
  return (
    <div style={{
      marginTop: 20, borderRadius: 16,
      background: PANEL_BG, border: `1.5px solid ${GOLD}22`,
      boxShadow: '0 8px 32px rgba(6,45,42,.22)',
      overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: `linear-gradient(90deg,transparent,${GOLD} 30%,${GOLD_LT} 50%,${GOLD} 70%,transparent)` }} />
      <div style={{ padding: '20px 20px 22px', position: 'relative' }}>
        <button
          aria-label="Close profile"
          onClick={onClose}
          style={{
            position: 'absolute', top: 12, right: 12,
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,.1)', border: 'none', cursor: 'pointer',
            color: '#fff', fontSize: 16, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>

        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Circle photo */}
          <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: DARK, boxShadow: `0 0 0 2px ${GOLD}` }}>
            {leader.photo_url
              ? <img src={leader.photo_url} alt={leader.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%' }} />
              : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: 26, color: GOLD, fontWeight: 900 }}>{initial}</div>
            }
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 14, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.25 }}>{leader.full_name}</h3>
            {leader.role_title && (
              <div style={{ marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 1.5, background: GOLD, borderRadius: 1 }} />
                <span style={{ fontSize: 9.5, fontWeight: 800, color: GOLD, letterSpacing: '.1em', textTransform: 'uppercase' }}>{leader.role_title}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ height: 1, background: `${GOLD}20`, margin: '14px 0' }} />

        {leader.qualifications && <InlineRow label="Qualifications"   value={leader.qualifications} />}
        {leader.experience     && <InlineRow label="Experience"       value={leader.experience}     />}
        {leader.subjects       && <InlineRow label="Responsibilities" value={leader.subjects}       />}
        {leader.brief_bio && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase', color: GOLD, opacity: .65, marginBottom: 4 }}>About</div>
            <p style={{ fontSize: 13, lineHeight: 1.68, color: 'rgba(255,255,255,.5)', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>{leader.brief_bio}</p>
          </div>
        )}

        <Link
          href={`/leadership/${leader.id}`}
          onClick={onClose}
          style={{ display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 12, background: GOLD, color: DARK, fontSize: 13, fontWeight: 900, textDecoration: 'none' }}
        >View Full Profile →</Link>
      </div>
    </div>
  );
}

function InlineRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: GOLD }}>{label}: </span>
      <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)' }}>{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN EXPORTED COMPONENT
═══════════════════════════════════════════ */
export function LeadershipSection({
  leaders,
  shortName = 'AMQM',
}: {
  leaders: Leader[];
  shortName?: string;
}) {
  const [entered, setEntered]         = useState(false);
  const [reduced, setReduced]         = useState(false);
  const [isDesktop, setIsDesktop]     = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [activeLeader, setActiveLeader] = useState<Leader | null>(null);
  const [mobileSelected, setMobileSelected] = useState<Leader | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  /* Initialise active leader to first */
  useEffect(() => {
    if (leaders.length > 0) setActiveLeader(leaders[0]);
  }, [leaders]);

  /* prefers-reduced-motion */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const h = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  /* Breakpoints */
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /* Entrance animation */
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setEntered(true); obs.disconnect(); }
    }, { threshold: 0.08 });
    if (sectionRef.current) obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, []);

  /* Pagination */
  const cardsPerPage = isDesktop ? 2 : 1;
  const totalPages   = Math.max(1, Math.ceil(leaders.length / cardsPerPage));
  const safePage     = Math.min(currentPage, totalPages - 1);
  const pageLeaders  = leaders.slice(safePage * cardsPerPage, (safePage + 1) * cardsPerPage);

  /* When page changes: update active leader to first on new page; close mobile profile */
  useEffect(() => {
    const first = leaders[safePage * cardsPerPage];
    if (first) setActiveLeader(first);
    setMobileSelected(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage, cardsPerPage]);

  const goTo   = (p: number) => setCurrentPage(Math.max(0, Math.min(totalPages - 1, p)));
  const hasPrev = safePage > 0;
  const hasNext = safePage < totalPages - 1;

  /* Hover */
  const onCardHover = useCallback((l: Leader) => {
    setActiveLeader(l);
  }, []);

  /* Click: desktop selects, mobile/tablet toggles inline profile */
  const onCardClick = useCallback((l: Leader) => {
    if (isDesktop) {
      setActiveLeader(l);
    } else {
      setMobileSelected(prev => prev?.id === l.id ? null : l);
    }
  }, [isDesktop]);

  const fadeUp = (delay = 0): React.CSSProperties => ({
    opacity:   reduced ? 1 : entered ? 1 : 0,
    transform: reduced ? 'none' : entered ? 'translateY(0)' : 'translateY(12px)',
    transition: reduced ? 'none' : `opacity .5s ${delay}ms ease, transform .45s ${delay}ms ease`,
  });

  const navBtn = (enabled: boolean): React.CSSProperties => ({
    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
    background: enabled ? GOLD : 'rgba(6,45,42,.1)',
    color:      enabled ? DARK : 'rgba(6,45,42,.28)',
    border: 'none', padding: 0,
    cursor: enabled ? 'pointer' : 'not-allowed',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 900,
    transition: 'background .2s, color .2s',
  });

  const displayLeader = activeLeader ?? leaders[0];

  if (leaders.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes ls-panel-in {
          from { opacity: 0; transform: translateY(7px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ls-panel-content {
          animation: ls-panel-in .28s ease;
        }
        .ls-card-art:focus-visible {
          outline: 2.5px solid ${GOLD};
          outline-offset: 2px;
          border-radius: 14px;
        }
        .ls-view-btn:hover { background: ${GOLD_LT} !important; }
        .ls-dot {
          border: none; cursor: pointer; padding: 0;
          height: 8px; border-radius: 4px;
          transition: width .25s ease, background .25s ease;
        }
        .ls-nav-btn { transition: background .2s, color .2s; }
        .ls-nav-btn:hover:not(:disabled) { filter: brightness(1.1); }
        .ls-nav-btn:focus-visible { outline: 2px solid ${GOLD}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .ls-panel-content { animation: none; }
          .ls-dot { transition: none; }
        }
      `}</style>

      <section
        ref={sectionRef}
        id="leadership"
        aria-label="Leadership & Management"
        style={{ background: '#F4F1EA', position: 'relative', overflow: 'hidden', paddingTop: 72, paddingBottom: 80 }}
      >
        {/* Gold radial wash */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 65% 38% at 50% 0%,rgba(201,168,76,.09) 0%,transparent 65%)', pointerEvents: 'none' }} />

        <div className="mx-auto max-w-[1320px] px-5 sm:px-7" style={{ position: 'relative' }}>

          {/* ── Section header ── */}
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ ...fadeUp(0), display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 28, height: 1, background: GOLD, opacity: .75 }} />
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.28em', textTransform: 'uppercase', color: '#7a5c18' }}>
                Leadership &amp; Management
              </span>
              <div style={{ width: 28, height: 1, background: GOLD, opacity: .75 }} />
            </div>
            <h2 style={{
              ...fadeUp(80),
              fontFamily: "Georgia,'Times New Roman',serif",
              fontSize: 'clamp(1.85rem,3vw,2.75rem)',
              fontWeight: 900, color: DARK, lineHeight: 1.1, margin: 0,
            }}>
              The people who lead {shortName}.
            </h2>
            <p style={{
              ...fadeUp(160),
              marginTop: 12, fontSize: 14.5, lineHeight: 1.75,
              color: 'rgba(6,45,42,.48)', maxWidth: 440,
              marginLeft: 'auto', marginRight: 'auto',
            }}>
              Experienced educators and visionary leaders dedicated to excellence in Qur'anic memorization.
            </p>
          </div>

          {/* ── Main layout ── */}
          <div style={{ ...fadeUp(240), display: 'flex', gap: 28, alignItems: 'flex-start' }}>

            {/* LEFT: carousel + dots */}
            <div style={{ flex: 1, minWidth: 0 }}>

              {/* Cards row with arrows */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  aria-label="Previous leaders"
                  onClick={() => goTo(safePage - 1)}
                  disabled={!hasPrev}
                  className="ls-nav-btn"
                  style={navBtn(hasPrev)}
                >←</button>

                {/* Page of cards */}
                <div
                  key={`page-${safePage}-${cardsPerPage}`}
                  style={{ flex: 1, display: 'flex', gap: 14, minWidth: 0 }}
                >
                  {pageLeaders.map((l, i) => (
                    <LeaderCard
                      key={l.id}
                      leader={l}
                      isActive={activeLeader?.id === l.id}
                      pageIdx={i}
                      entered={entered}
                      reduced={reduced}
                      onHover={() => isDesktop && onCardHover(l)}
                      onFocus={() => isDesktop && onCardHover(l)}
                      onClick={() => onCardClick(l)}
                    />
                  ))}
                  {/* Ghost spacer if last page has 1 card on desktop */}
                  {isDesktop && pageLeaders.length < cardsPerPage && (
                    <div style={{ flex: '1 1 0' }} aria-hidden />
                  )}
                </div>

                <button
                  aria-label="Next leaders"
                  onClick={() => goTo(safePage + 1)}
                  disabled={!hasNext}
                  className="ls-nav-btn"
                  style={navBtn(hasNext)}
                >→</button>
              </div>

              {/* Pagination dots */}
              {totalPages > 1 && (
                <div
                  role="tablist"
                  aria-label="Leadership pages"
                  style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 20 }}
                >
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      role="tab"
                      aria-selected={i === safePage}
                      aria-label={`Page ${i + 1}`}
                      onClick={() => goTo(i)}
                      className="ls-dot"
                      style={{
                        width: i === safePage ? 24 : 8,
                        background: i === safePage ? GOLD : 'rgba(6,45,42,.2)',
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Mobile / tablet: inline profile below cards */}
              {!isDesktop && mobileSelected && (
                <InlineProfile
                  leader={mobileSelected}
                  onClose={() => setMobileSelected(null)}
                />
              )}
            </div>

            {/* RIGHT: profile panel — desktop only */}
            {isDesktop && displayLeader && (
              <div style={{ width: 286, flexShrink: 0, alignSelf: 'flex-start' }}>
                <ProfilePanel leader={displayLeader} reduced={reduced} />
              </div>
            )}
          </div>

        </div>
      </section>
    </>
  );
}
