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

/* ── Brand tokens ── */
const CREAM  = '#F5F0E8';
const DARK   = '#062d2a';
const GOLD   = '#C9A84C';
const GOLD_L = '#E8C97A';
const GOLD_D = '#9A7020';
const TAU    = Math.PI * 2;
/* FEAT = top of ellipse (12 o'clock). cos(FEAT)=0, sin(FEAT)=-1 */
const FEAT   = -Math.PI / 2;

/* ── Helpers ── */
function norm(a: number): number {
  return ((a % TAU) + TAU) % TAU;
}
function shortDelta(from: number, to: number): number {
  let d = norm(to - from);
  if (d > Math.PI) d -= TAU;
  return d;
}
function activeFromAngle(n: number, globalAngle: number): number {
  const featN = norm(FEAT);
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const a = norm((TAU * i / n) + globalAngle);
    const dist = Math.abs(shortDelta(a, featN));
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  return best;
}

/* ── Responsive orbit dimensions ── */
interface OrbDims {
  cw: number;  // container pixel width
  h:  number;  // stage height
  rx: number;  // ellipse semi-axis x
  ry: number;  // ellipse semi-axis y
  ap: number;  // active portrait diameter
  op: number;  // orbital portrait diameter
}
function computeDims(cw: number): OrbDims {
  if (cw < 400) return { cw, h: 320, rx: Math.max(78,  cw * 0.34), ry: 80,  ap: 86,  op: 42 };
  if (cw < 560) return { cw, h: 370, rx: Math.max(130, cw * 0.34), ry: 100, ap: 108, op: 52 };
  if (cw < 750) return { cw, h: 430, rx: Math.max(180, cw * 0.33), ry: 120, ap: 132, op: 62 };
  return           { cw, h: 500, rx: Math.min(295, cw * 0.33), ry: 145, ap: 158, op: 74 };
}

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
export function LeadershipSection({
  leaders,
  shortName = 'AMQM',
}: {
  leaders: Leader[];
  shortName?: string;
}) {
  const n = leaders.length;

  /* Place leader 0 at FEAT on mount */
  const initAngle = norm(FEAT);
  const [angle,   setAngle]   = useState(initAngle);
  const [reduced, setReduced] = useState(false);
  const [entered, setEntered] = useState(false);
  const [dims,    setDims]    = useState<OrbDims>(() => computeDims(820));

  const angleRef     = useRef(initAngle);
  const targetRef    = useRef<number | null>(null);
  const visibleRef   = useRef(false);
  const reducedRef   = useRef(false);
  const rafRef       = useRef<number>(0);
  const sectionRef   = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Derived values for render */
  const activeIdx = activeFromAngle(n, angle);
  const { cw, h, rx, ry, ap, op } = dims;
  const cx = cw / 2;
  const cy = h  / 2;

  function leaderAngle(i: number) {
    return norm((TAU * i / n) + angle);
  }

  /* ── prefers-reduced-motion ── */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    reducedRef.current = mq.matches;
    const h = (e: MediaQueryListEvent) => { setReduced(e.matches); reducedRef.current = e.matches; };
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  /* ── ResizeObserver ── */
  useEffect(() => {
    function measure() {
      const w = containerRef.current?.clientWidth ?? 820;
      setDims(computeDims(w));
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* ── IntersectionObserver ── */
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      visibleRef.current = e.isIntersecting;
      if (e.isIntersecting) setEntered(true);
    }, { threshold: 0.08 });
    if (sectionRef.current) obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, []);

  /* ── RAF orbit animation ── */
  useEffect(() => {
    const AUTO  = 0.09; // rad/s — slow continuous orbit
    const SNAP  = 2.6;  // rad/s — click snap
    let last = 0;

    function frame(ts: number) {
      if (!last) last = ts;
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;

      if (visibleRef.current && !reducedRef.current) {
        if (targetRef.current !== null) {
          const d = shortDelta(angleRef.current, targetRef.current);
          if (Math.abs(d) < 0.005) {
            angleRef.current  = targetRef.current;
            targetRef.current = null;
          } else {
            angleRef.current += Math.sign(d) * Math.min(SNAP * dt, Math.abs(d));
          }
        } else {
          angleRef.current += AUTO * dt;
        }
        setAngle(angleRef.current);
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  /* ── Navigation ── */
  const clickLeader = useCallback((i: number) => {
    const cur = activeFromAngle(n, angleRef.current);
    if (i === cur) return;
    const a     = norm((TAU * i / n) + angleRef.current);
    const featN = norm(FEAT);
    targetRef.current = angleRef.current + shortDelta(a, featN);
  }, [n]);

  const go = useCallback((offset: number) => {
    const cur  = activeFromAngle(n, angleRef.current);
    const next = ((cur + offset) % n + n) % n;
    if (next !== cur) clickLeader(next);
  }, [n, clickLeader]);

  /* ── Entrance fade ── */
  const fadeUp = (delay = 0): React.CSSProperties => ({
    opacity:   reduced ? 1 : entered ? 1 : 0,
    transform: reduced ? 'none' : entered ? 'translateY(0)' : 'translateY(14px)',
    transition: reduced ? 'none' : `opacity .52s ${delay}ms ease, transform .48s ${delay}ms ease`,
  });

  const leader = leaders[activeIdx];

  if (n === 0) return null;

  /* ── Featured position ── cos(FEAT)=0, sin(FEAT)=-1 ── */
  const featX = cx;          // cx + rx * 0
  const featY = cy - ry;     // cy + ry * (-1)

  return (
    <>
      <style>{`
        @keyframes ls-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(201,168,76,.42); }
          55%      { box-shadow: 0 0 0 22px rgba(201,168,76,.0); }
        }
        @keyframes ls-in {
          from { opacity:0; transform:translate(-50%,-50%) scale(.86); }
          to   { opacity:1; transform:translate(-50%,-50%) scale(1); }
        }
        @keyframes ls-orb-enter {
          from { opacity:0; } to { opacity:1; }
        }
        .ls-cta:hover  { background:#0d4a40 !important; }
        .ls-nav:focus-visible  { outline:2px solid ${GOLD}; outline-offset:3px; border-radius:50%; }
        .ls-dot:focus-visible  { outline:2px solid ${GOLD}; outline-offset:2px; border-radius:4px; }
        .ls-orb  { transition:opacity .22s ease; }
        .ls-orb:hover { opacity:1 !important; filter:none !important; }
        @media (prefers-reduced-motion:reduce) {
          .ls-orb, .ls-cta { transition:none !important; }
        }
      `}</style>

      <section
        ref={sectionRef}
        id="leadership"
        aria-label="Leadership & Management"
        style={{
          background: CREAM,
          position: 'relative',
          overflow: 'hidden',
          paddingTop: 72,
          paddingBottom: 88,
        }}
      >
        {/* Ambient gold top-wash */}
        <div aria-hidden style={{
          position:'absolute', inset:0, pointerEvents:'none',
          background:`radial-gradient(ellipse 90% 55% at 50% 0%, ${GOLD}12 0%, transparent 68%)`,
        }} />

        <div
          ref={containerRef}
          className="mx-auto max-w-[1200px] px-5 sm:px-8"
          style={{ position:'relative' }}
        >

          {/* ── Section header ── */}
          <div style={{ textAlign:'center', marginBottom:52 }}>
            <div style={{ ...fadeUp(0), display:'inline-flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <div style={{ width:28, height:1, background:GOLD, opacity:.65 }} />
              <span style={{
                fontSize:10, fontWeight:900, letterSpacing:'.3em',
                textTransform:'uppercase', color:GOLD_D,
              }}>
                Leadership &amp; Management
              </span>
              <div style={{ width:28, height:1, background:GOLD, opacity:.65 }} />
            </div>
            <h2 style={{
              ...fadeUp(80),
              fontFamily:"Georgia,'Times New Roman',serif",
              fontSize:'clamp(1.8rem,3vw,2.7rem)',
              fontWeight:900, color:DARK,
              lineHeight:1.08, margin:0, letterSpacing:'-.02em',
            }}>
              The people who lead {shortName}.
            </h2>
            <p style={{
              ...fadeUp(160),
              marginTop:14, fontSize:15, lineHeight:1.72,
              color:`${DARK}6e`, maxWidth:420,
              marginLeft:'auto', marginRight:'auto',
            }}>
              Experienced educators and visionary leaders dedicated to excellence
              in Qur&apos;anic education.
            </p>
          </div>

          {/* ── Orbital stage ── */}
          <div style={{
            ...fadeUp(240),
            position:'relative',
            width:'100%',
            height:h,
            userSelect:'none',
          }}>

            {/* Orbit ring (CSS ellipse border) */}
            <div aria-hidden style={{
              position:'absolute',
              left: cx - rx, top: cy - ry,
              width: rx * 2, height: ry * 2,
              borderRadius:'50%',
              border:`1.5px dashed ${GOLD}45`,
              boxShadow:`0 0 0 3px ${GOLD_L}12`,
              pointerEvents:'none',
              zIndex:0,
            }} />

            {/* Featured-spot gold dot (top of orbit, 12 o'clock) */}
            <div aria-hidden style={{
              position:'absolute',
              left: featX - 5, top: featY - 5,
              width:10, height:10, borderRadius:'50%',
              background:GOLD, opacity:.55,
              pointerEvents:'none', zIndex:1,
            }} />

            {/* ── Active leader – center ── */}
            {leader && (
              <div
                key={leader.id}
                style={{
                  position:'absolute',
                  left: cx, top: cy,
                  transform:'translate(-50%,-50%)',
                  display:'flex', flexDirection:'column', alignItems:'center',
                  zIndex:20,
                  animation: reduced ? 'none' : 'ls-in .32s ease',
                  width: ap + 72,
                }}
              >
                {/* Double-ring portrait */}
                <div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {/* Outer pulse ring */}
                  <div style={{
                    position:'absolute',
                    width: ap + 36, height: ap + 36,
                    borderRadius:'50%',
                    border:`1.5px solid ${GOLD}48`,
                    animation: reduced ? 'none' : 'ls-pulse 3s ease infinite',
                    pointerEvents:'none',
                  }} />
                  {/* Inner gold ring + glow */}
                  <div style={{
                    position:'absolute',
                    width: ap + 16, height: ap + 16,
                    borderRadius:'50%',
                    border:`2.5px solid ${GOLD}`,
                    boxShadow:`0 0 32px ${GOLD}42, inset 0 0 14px ${GOLD}18`,
                    pointerEvents:'none',
                  }} />
                  {/* Portrait */}
                  <div style={{
                    width:ap, height:ap, borderRadius:'50%',
                    overflow:'hidden', background:DARK, flexShrink:0,
                    boxShadow:`0 8px 40px rgba(6,45,42,.34), 0 0 0 4px ${CREAM}`,
                    position:'relative', zIndex:2,
                  }}>
                    {leader.photo_url
                      ? (
                        <img
                          src={leader.photo_url}
                          alt={leader.full_name}
                          style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center 15%' }}
                        />
                      ) : (
                        <div style={{
                          height:'100%', display:'flex', alignItems:'center', justifyContent:'center',
                          fontFamily:"Georgia,'Times New Roman',serif",
                          fontSize: ap * 0.38, color:GOLD, fontWeight:900,
                        }}>
                          {leader.full_name?.charAt(0) ?? '?'}
                        </div>
                      )
                    }
                  </div>
                </div>

                {/* Name / role / CTA */}
                <div style={{ textAlign:'center', marginTop:17 }}>
                  <div style={{
                    fontFamily:"Georgia,'Times New Roman',serif",
                    fontSize:'clamp(.82rem,1.45vw,1.05rem)',
                    fontWeight:900, color:DARK, lineHeight:1.18,
                  }}>
                    {leader.full_name}
                  </div>
                  {leader.role_title && (
                    <div style={{
                      marginTop:6, fontSize:8.5, fontWeight:900,
                      letterSpacing:'.22em', textTransform:'uppercase', color:GOLD_D,
                    }}>
                      {leader.role_title}
                    </div>
                  )}
                  <Link
                    href={`/leadership/${leader.id}`}
                    className="ls-cta"
                    style={{
                      display:'inline-flex', alignItems:'center', gap:6,
                      marginTop:12, padding:'8px 18px', borderRadius:10,
                      background:DARK, color:'#fff',
                      fontSize:11.5, fontWeight:800, letterSpacing:'.045em',
                      textDecoration:'none',
                      transition:'background .2s ease',
                    }}
                  >
                    View Profile →
                  </Link>
                </div>
              </div>
            )}

            {/* ── Orbital leaders ── */}
            {leaders.map((l, i) => {
              if (i === activeIdx) return null;
              const a     = leaderAngle(i);
              const lx    = cx + rx * Math.cos(a);
              const ly    = cy + ry * Math.sin(a);
              /* depth: 0 = top of ellipse, 1 = bottom — bottom leaders appear larger/brighter */
              const depth = (Math.sin(a) + 1) / 2;
              const sc    = 0.78 + depth * 0.24;
              const opc   = 0.48 + depth * 0.48;
              const od    = Math.round(op * sc);
              const zIdx  = Math.round(depth * 6) + 2;

              return (
                <button
                  key={l.id}
                  onClick={() => clickLeader(i)}
                  aria-label={`View ${l.full_name}`}
                  className="ls-orb"
                  style={{
                    position:'absolute',
                    left: lx, top: ly,
                    transform:'translate(-50%,-50%)',
                    background:'none', border:'none', padding:0,
                    cursor:'pointer', outline:'none',
                    display:'flex', flexDirection:'column', alignItems:'center',
                    zIndex:zIdx,
                    opacity:opc,
                  }}
                >
                  <div style={{
                    width:od, height:od, borderRadius:'50%',
                    overflow:'hidden', background:DARK, flexShrink:0,
                    border:`2px solid ${GOLD}55`,
                    boxShadow:`0 4px 18px rgba(6,45,42,.22)`,
                    filter:`grayscale(38%) brightness(.84)`,
                  }}>
                    {l.photo_url
                      ? (
                        <img
                          src={l.photo_url}
                          alt={l.full_name}
                          style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center 15%' }}
                        />
                      ) : (
                        <div style={{
                          height:'100%', display:'flex', alignItems:'center', justifyContent:'center',
                          fontFamily:"Georgia,'Times New Roman',serif",
                          fontSize:od * 0.36, color:GOLD, fontWeight:900,
                        }}>
                          {l.full_name?.charAt(0) ?? '?'}
                        </div>
                      )
                    }
                  </div>
                  <div style={{
                    marginTop:5, fontSize:8.5, fontWeight:700,
                    color:DARK, textAlign:'center',
                    lineHeight:1.22, maxWidth:84,
                    textShadow:`0 1px 6px ${CREAM}, 0 1px 6px ${CREAM}, 0 2px 8px ${CREAM}`,
                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                  }}>
                    {l.full_name.split(' ').slice(0, 2).join(' ')}
                  </div>
                  {l.role_title && (
                    <div style={{
                      fontSize:7.5, fontWeight:800,
                      color:GOLD_D, letterSpacing:'.07em',
                      textTransform:'uppercase', textAlign:'center',
                      maxWidth:84, lineHeight:1.15,
                      textShadow:`0 1px 5px ${CREAM}, 0 1px 5px ${CREAM}`,
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                    }}>
                      {l.role_title.split(' ').slice(0, 3).join(' ')}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Navigation bar ── */}
          <div style={{
            ...fadeUp(330),
            display:'flex', flexDirection:'column',
            alignItems:'center', gap:14, marginTop:32,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:18 }}>
              {/* Prev */}
              <button
                aria-label="Previous leader"
                onClick={() => go(-1)}
                className="ls-nav"
                style={{
                  width:46, height:46, borderRadius:'50%',
                  background:GOLD, color:DARK,
                  border:'none', cursor:'pointer',
                  fontSize:24, fontWeight:900, lineHeight:1,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  outline:'none',
                  boxShadow:`0 3px 14px ${GOLD}55`,
                  transition:'background .2s ease',
                }}
              >‹</button>

              {/* Progress dots */}
              {n > 1 && (
                <div aria-hidden style={{ display:'flex', gap:7, alignItems:'center' }}>
                  {leaders.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => i !== activeIdx ? clickLeader(i) : undefined}
                      className="ls-dot"
                      aria-label={`Go to ${leaders[i].full_name}`}
                      style={{
                        width: i === activeIdx ? 24 : 7, height:7,
                        borderRadius:4, border:'none', cursor:'pointer', padding:0,
                        background: i === activeIdx ? GOLD : `${DARK}22`,
                        transition: reduced ? 'none' : 'width .28s ease, background .28s ease',
                        outline:'none',
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Next */}
              <button
                aria-label="Next leader"
                onClick={() => go(1)}
                className="ls-nav"
                style={{
                  width:46, height:46, borderRadius:'50%',
                  background:GOLD, color:DARK,
                  border:'none', cursor:'pointer',
                  fontSize:24, fontWeight:900, lineHeight:1,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  outline:'none',
                  boxShadow:`0 3px 14px ${GOLD}55`,
                  transition:'background .2s ease',
                }}
              >›</button>
            </div>

            <p style={{
              fontSize:11, color:`${DARK}48`,
              letterSpacing:'.06em', margin:0, fontWeight:600,
            }}>
              Click any leader to bring them to the center
            </p>
          </div>

        </div>
      </section>
    </>
  );
}
