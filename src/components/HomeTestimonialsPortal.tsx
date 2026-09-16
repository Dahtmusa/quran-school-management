'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Testimonial = {
  quote?: string;
  name?: string;
  role?: string;
  relation?: string;
  avatar?: 'man1' | 'man2' | 'woman';
  sample?: boolean;
};

const GREEN = '#062d2a';
const TEAL = '#0f766e';
const GOLD = '#c9a84c';

function Avatar({ type }: { type: Testimonial['avatar'] }) {
  return (
    <div className="ht-avatar" aria-hidden="true">
      <svg viewBox="0 0 100 100" role="presentation">
        <circle cx="50" cy="50" r="48" fill="#edf6f1" />
        {type === 'woman' ? (
          <>
            <path d="M20 86c3-18 13-29 30-29s27 11 30 29" fill="#0b5c4e" />
            <path d="M28 46c0-18 9-29 22-29 15 0 24 11 24 29v13c-4 8-14 13-24 13-10 0-19-5-22-13Z" fill="#173f39" />
            <path d="M31 46c3-16 10-23 19-23 11 0 18 8 20 23-5-4-11-6-20-6-8 0-14 2-19 6Z" fill="#c9a84c" />
            <ellipse cx="50" cy="50" rx="13" ry="15" fill="#7a4f3b" />
            <circle cx="45" cy="49" r="1.6" fill="#172d29" /><circle cx="55" cy="49" r="1.6" fill="#172d29" />
            <path d="M45 57c3 2 7 2 10 0" fill="none" stroke="#5a372b" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M27 45c1-15 8-28 23-31 15 3 22 15 23 31-7-7-15-10-23-10-9 0-16 3-23 10Z" fill="#244e47" />
          </>
        ) : (
          <>
            <path d="M22 86c4-18 13-29 28-29s24 11 28 29" fill={type === 'man1' ? '#0f766e' : '#173f39'} />
            <ellipse cx="50" cy="50" rx="15" ry="17" fill={type === 'man1' ? '#81523e' : '#6b4538'} />
            <path d="M35 47c1-15 8-23 15-23s14 8 15 23c-5-5-10-7-15-7s-10 2-15 7Z" fill="#1e2f2c" />
            <path d="M35 35c4-8 9-12 15-12s11 4 15 12c-9-4-21-4-30 0Z" fill="#f4f1ea" />
            <circle cx="44" cy="50" r="1.7" fill="#172d29" /><circle cx="56" cy="50" r="1.7" fill="#172d29" />
            <path d="M45 58c3 2 7 2 10 0" fill="none" stroke="#58362b" strokeWidth="1.7" strokeLinecap="round" />
          </>
        )}
      </svg>
    </div>
  );
}

function QuotesIcon() {
  return <span className="ht-quote-mark" aria-hidden="true">“</span>;
}

export default function HomeTestimonialsPortal() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const db = createClient();
    let mounted = true;
    db.from('homepage_sections')
      .select('content,visible')
      .eq('section_key', 'testimonials')
      .eq('visible', true)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted || !data?.content?.items?.length) return;
        setItems(data.content.items as Testimonial[]);
      });

    const locate = () => document.querySelector<HTMLElement>('#news');
    const found = locate();
    if (found) setTarget(found);
    else {
      const observer = new MutationObserver(() => {
        const el = locate();
        if (el) { setTarget(el); observer.disconnect(); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return () => { mounted = false; observer.disconnect(); };
    }
    return () => { mounted = false; };
  }, []);

  if (!target || !items.length) return null;

  const section = (
    <div className="ht-section">
      <div className="ht-inner">
        <div className="ht-heading">
          <div className="ht-eyebrow">What parents say</div>
          <h2>Trusted by families who choose <span>AMQM.</span></h2>
          <p>Short reflections from parents and families in our school community.</p>
        </div>

        <div className="ht-grid">
          {items.slice(0, 3).map((item, index) => (
            <article className="ht-card" key={`${item.name || 'testimonial'}-${index}`}>
              {item.sample && <span className="ht-sample">Sample copy</span>}
              <QuotesIcon />
              <p className="ht-quote">{item.quote}</p>
              <div className="ht-person">
                <Avatar type={item.avatar || (index === 2 ? 'woman' : index === 0 ? 'man1' : 'man2')} />
                <div>
                  <div className="ht-name">{item.name || 'Parent'}</div>
                  <div className="ht-role">{item.role || item.relation || 'Parent of an AMQM student'}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(section, target);
}
