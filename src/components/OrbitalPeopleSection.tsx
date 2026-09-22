'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type OrbitPerson = {
  id: string;
  full_name: string;
  role?: string | null;
  photo_url?: string | null;
  href: string;
};

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  people: OrbitPerson[];
  shortName?: string;
};

const GOLD = '#C9A24D';
const GOLD_SOFT = '#E9D49A';
const GOLD_DARK = '#9B7528';
const TEAL = '#073B33';
const IVORY = '#F8F5ED';
const TAU = Math.PI * 2;
const TOP = -Math.PI / 2;

function normalize(angle: number) {
  return ((angle % TAU) + TAU) % TAU;
}

function shortestDelta(from: number, to: number) {
  let d = normalize(to - from);
  if (d > Math.PI) d -= TAU;
  return d;
}

function nearestIndex(count: number, angle: number) {
  if (count <= 1) return 0;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < count; i += 1) {
    const a = normalize((TAU * i) / count + angle);
    const distance = Math.abs(shortestDelta(a, TOP));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

function dimensions(width: number, count: number) {
  const compact = count >= 9;
  if (width < 390) return { height: compact ? 355 : 330, rx: Math.max(92, width * (compact ? 0.38 : 0.35)), ry: compact ? 105 : 92, active: 92, orbit: compact ? 42 : 48 };
  if (width < 560) return { height: compact ? 405 : 375, rx: Math.max(130, width * (compact ? 0.39 : 0.35)), ry: compact ? 125 : 108, active: 112, orbit: compact ? 50 : 55 };
  if (width < 820) return { height: compact ? 470 : 430, rx: Math.max(175, width * (compact ? 0.40 : 0.36)), ry: compact ? 145 : 125, active: 136, orbit: compact ? 62 : 66 };
  return { height: compact ? 545 : 500, rx: Math.min(380, width * (compact ? 0.42 : 0.37)), ry: compact ? 175 : 150, active: 170, orbit: compact ? 76 : 82 };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function OrbitalPeopleSection({ eyebrow, title, description, people, shortName = 'AMQM' }: Props) {
  const count = people.length;
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const angleRef = useRef(TOP);
  const targetRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const visibleRef = useRef(false);
  const reducedRef = useRef(false);
  const lastActiveRef = useRef(0);

  const [activeIndex, setActiveIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [entered, setEntered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(900);

  const dims = useMemo(() => dimensions(width, count), [width, count]);
  const active = people[activeIndex];

  const applyOrbit = useCallback((angle: number, activeIdx: number) => {
    const stage = stageRef.current;
    if (!stage || count === 0) return;
    const cx = stage.clientWidth / 2;
    const cy = dims.height / 2;

    for (let i = 0; i < count; i += 1) {
      const node = nodeRefs.current[i];
      if (!node) continue;
      if (i === activeIdx) {
        node.style.opacity = '0';
        node.style.pointerEvents = 'none';
        continue;
      }
      const a = normalize((TAU * i) / count + angle);
      const x = cx + dims.rx * Math.cos(a);
      const y = cy + dims.ry * Math.sin(a);
      const depth = (Math.sin(a) + 1) / 2;
      const scale = 0.72 + depth * 0.22;
      const opacity = 0.34 + depth * 0.56;
      node.style.opacity = String(opacity);
      node.style.pointerEvents = 'auto';
      node.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) translate(-50%,-50%) scale(' + scale + ')';
      node.style.zIndex = String(10 + Math.round(depth * 12));
    }
  }, [count, dims.height, dims.rx, dims.ry]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = mq.matches;
    setReduced(mq.matches);
    const onChange = (event: MediaQueryListEvent) => {
      reducedRef.current = event.matches;
      setReduced(event.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setWidth(stage.clientWidth || 900);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
      setVisible(entry.isIntersecting);
      if (entry.isIntersecting) setEntered(true);
    }, { threshold: 0.08 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (count === 0 || reduced || !visible) {
      applyOrbit(angleRef.current, nearestIndex(count, angleRef.current));
      return;
    }
    let lastTime = 0;
    const autoSpeed = 0.075;
    const snapSpeed = 2.5;

    const frame = (time: number) => {
      if (!lastTime) lastTime = time;
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      if (visibleRef.current && !reducedRef.current) {
        if (targetRef.current !== null) {
          const delta = shortestDelta(angleRef.current, targetRef.current);
          if (Math.abs(delta) < 0.003) {
            angleRef.current = targetRef.current;
            targetRef.current = null;
          } else {
            angleRef.current += Math.sign(delta) * Math.min(Math.abs(delta), snapSpeed * dt);
          }
        } else {
          angleRef.current += autoSpeed * dt;
        }
      }

      const nextActive = nearestIndex(count, angleRef.current);
      if (nextActive !== lastActiveRef.current) {
        lastActiveRef.current = nextActive;
        setActiveIndex(nextActive);
      }
      applyOrbit(angleRef.current, nextActive);
      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [applyOrbit, count, reduced, visible]);

  useEffect(() => {
    applyOrbit(angleRef.current, activeIndex);
  }, [activeIndex, applyOrbit, width]);

  const selectPerson = useCallback((index: number) => {
    if (count <= 1) return;
    const currentAngle = angleRef.current;
    const currentActive = nearestIndex(count, currentAngle);
    if (index === currentActive) return;
    const personAngle = normalize((TAU * index) / count + currentAngle);
    targetRef.current = currentAngle + shortestDelta(personAngle, TOP);
  }, [count]);

  const go = useCallback((offset: number) => {
    if (count <= 1) return;
    const next = (activeIndex + offset + count) % count;
    selectPerson(next);
  }, [activeIndex, count, selectPerson]);

  if (count === 0) return null;

  return (
    <section
      ref={sectionRef}
      id={eyebrow.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
      aria-label={eyebrow}
      className="relative overflow-hidden bg-[#F8F5ED] px-0 py-14 text-[#073B33] sm:py-20"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 70% 55% at 50% 4%, rgba(201,162,77,.13), transparent 68%)' }}
      />

      <div className="relative z-10 mx-auto w-[calc(100%-20px)] max-w-[1180px] sm:w-[calc(100%-32px)]">
        <header
          className="mx-auto mb-8 max-w-[760px] text-center sm:mb-12"
          style={{
            opacity: reduced || entered ? 1 : 0,
            transform: reduced || entered ? 'translateY(0)' : 'translateY(12px)',
            transition: reduced ? 'none' : 'opacity .5s ease, transform .5s ease',
          }}
        >
          <div className="inline-flex items-center gap-3 text-[10px] font-black uppercase tracking-[.3em] text-[#9B7528]">
            <span className="h-px w-8 bg-[#C9A24D]/70" />
            {eyebrow}
            <span className="h-px w-8 bg-[#C9A24D]/70" />
          </div>
          <h2
            className="mt-3 font-serif font-black leading-[.98] tracking-[-.035em] text-[#073B33]"
            style={{ fontSize: 'clamp(2rem, 5vw, 4.2rem)' }}
          >
            {title}
          </h2>
          <p className="mx-auto mt-4 max-w-[560px] text-[13px] leading-7 text-[#073B33]/60 sm:text-[15px]">
            {description}
          </p>
        </header>

        <div
          ref={stageRef}
          className="relative isolate w-full select-none"
          aria-live="polite"
          style={{
            height: dims.height,
            opacity: reduced || entered ? 1 : 0,
            transform: reduced || entered ? 'translateY(0)' : 'translateY(16px)',
            transition: reduced ? 'none' : 'opacity .6s .1s ease, transform .6s .1s ease',
          }}
        >
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 rounded-[50%] border border-[#C9A24D]/40"
            style={{
              width: dims.rx * 2,
              height: dims.ry * 2,
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 0 8px rgba(201,162,77,.035), inset 0 0 28px rgba(201,162,77,.04)',
            }}
          >
            <span className="absolute inset-[10px] rounded-[50%] border border-[#C9A24D]/15" />
            <span className="absolute -inset-[10px] rounded-[50%] border border-dashed border-[#C9A24D]/15" />
          </div>

          {people.map((person, index) => (
            <button
              key={person.id}
              ref={(node) => { nodeRefs.current[index] = node; }}
              type="button"
              onClick={() => selectPerson(index)}
              aria-label={'Make ' + person.full_name + ' the active profile'}
              className="absolute left-0 top-0 cursor-pointer border-0 bg-transparent p-0 text-center outline-none transition-[filter,opacity] duration-200 hover:!opacity-100 focus-visible:ring-2 focus-visible:ring-[#C9A24D]"
              style={{
                width: Math.max(74, dims.orbit + 28),
                transform: 'translate3d(-9999px,-9999px,0)',
                opacity: index === activeIndex ? 0 : undefined,
                willChange: 'transform, opacity',
              }}
            >
              <div
                className="mx-auto overflow-hidden rounded-full border-2 border-[#C9A24D]/60 bg-[#073B33] shadow-[0_8px_24px_rgba(7,59,51,.18)]"
                style={{ width: dims.orbit, height: dims.orbit }}
              >
                {person.photo_url ? (
                  <img src={person.photo_url} alt="" className="h-full w-full object-cover object-[center_15%]" />
                ) : (
                  <div className="grid h-full w-full place-items-center font-serif text-[25px] font-black text-[#E9D49A]">
                    {initials(person.full_name)}
                  </div>
                )}
              </div>
              <div className="mt-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-black leading-tight text-[#073B33] [text-shadow:0_1px_8px_#F8F5ED]">
                {person.full_name}
              </div>
              {person.role && (
                <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[7px] font-black uppercase tracking-[.08em] text-[#9B7528] [text-shadow:0_1px_7px_#F8F5ED]">
                  {person.role}
                </div>
              )}
            </button>
          ))}

          {active && (
            <div
              key={active.id}
              className="absolute left-1/2 top-1/2 z-40 w-[90%] max-w-[320px] -translate-x-1/2 -translate-y-1/2 text-center"
            >
              <div
                className="relative mx-auto grid place-items-center"
                style={{ width: dims.active + 34, height: dims.active + 34 }}
              >
                <div className="absolute inset-[-17px] rounded-full border border-[#C9A24D]/40 shadow-[0_0_0_8px_rgba(201,162,77,.045)]" />
                <div className="absolute inset-[-9px] rounded-full border-[3px] border-[#C9A24D] shadow-[0_0_32px_rgba(201,162,77,.22)]" />
                <Link
                  href={active.href}
                  aria-label={'Open profile for ' + active.full_name}
                  className="relative z-10 block overflow-hidden rounded-full border-[5px] border-[#F8F5ED] bg-[#073B33] shadow-[0_16px_42px_rgba(7,59,51,.24)] outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24D]"
                  style={{ width: dims.active, height: dims.active }}
                >
                  {active.photo_url ? (
                    <img src={active.photo_url} alt={active.full_name} className="h-full w-full object-cover object-[center_15%]" />
                  ) : (
                    <div className="grid h-full w-full place-items-center font-serif text-4xl font-black text-[#E9D49A]">
                      {initials(active.full_name)}
                    </div>
                  )}
                </Link>
                <span className="absolute bottom-2 right-[-4px] z-20 h-[15px] w-[15px] rounded-full border-[3px] border-[#F8F5ED] bg-[#C9A24D] shadow-sm" />
              </div>

              <div className="mt-5 font-serif text-[clamp(1rem,2vw,1.35rem)] font-black leading-tight text-[#073B33]">
                {active.full_name}
              </div>
              {active.role && (
                <div className="mt-1.5 text-[9px] font-black uppercase tracking-[.2em] text-[#9B7528]">
                  {active.role}
                </div>
              )}
              <Link
                href={active.href}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#073B33] px-4 py-2 text-[11px] font-black text-white shadow-[0_6px_18px_rgba(7,59,51,.15)] transition hover:-translate-y-0.5 hover:bg-[#0B5A4B]"
              >
                View Profile <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </div>

        {count > 1 && (
          <>
            <nav className="mt-4 flex items-center justify-center gap-3 sm:gap-5" aria-label={eyebrow + ' navigation'}>
              <button
                type="button"
                aria-label={'Previous ' + eyebrow.toLowerCase()}
                onClick={() => go(-1)}
                className="grid h-11 w-11 place-items-center rounded-full border border-[#C9A24D]/40 bg-white/70 text-2xl leading-none text-[#9B7528] shadow-sm transition hover:bg-[#C9A24D] hover:text-[#073B33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24D]"
              >‹</button>

              <div className="flex max-w-[52vw] items-center gap-1.5 overflow-hidden" role="tablist" aria-label={eyebrow + ' profiles'}>
                {people.map((person, index) => (
                  <button
                    key={person.id}
                    type="button"
                    role="tab"
                    aria-selected={index === activeIndex}
                    aria-label={person.full_name}
                    onClick={() => selectPerson(index)}
                    className="h-2 w-2 shrink-0 rounded-full border-0 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24D]"
                    style={{ background: index === activeIndex ? GOLD : 'rgba(7,59,51,.18)', boxShadow: index === activeIndex ? '0 0 0 3px rgba(201,162,77,.12)' : 'none' }}
                  />
                ))}
              </div>

              <button
                type="button"
                aria-label={'Next ' + eyebrow.toLowerCase()}
                onClick={() => go(1)}
                className="grid h-11 w-11 place-items-center rounded-full border border-[#C9A24D]/40 bg-white/70 text-2xl leading-none text-[#9B7528] shadow-sm transition hover:bg-[#C9A24D] hover:text-[#073B33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24D]"
              >›</button>
            </nav>
            <p className="mt-3 text-center text-[11px] text-[#073B33]/50 sm:text-xs">
              Tap a profile or use the arrows to explore {shortName}&apos;s {eyebrow.toLowerCase()}.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
