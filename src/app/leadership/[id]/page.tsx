import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const DARK = '#062d2a';
const GOLD = '#C9A84C';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('public_team_profiles')
    .select('full_name,role_title')
    .eq('id', id)
    .single();
  return {
    title: data ? `${data.full_name} — Leadership Profile` : 'Leadership Profile',
  };
}

export default async function LeadershipProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: leader } = await supabase
    .from('public_team_profiles')
    .select('id,full_name,role_title,category,photo_url,brief_bio,full_profile,qualifications,experience,subjects')
    .eq('id', id)
    .single();

  if (!leader) notFound();

  const initial = leader.full_name?.charAt(0) ?? '?';
  const bio = leader.full_profile || leader.brief_bio;

  return (
    <main style={{ minHeight: '100vh', background: DARK }}>
      {/* Top bar */}
      <div style={{ background: '#051f1c', padding: '0 20px', borderBottom: `1px solid ${GOLD}18` }}>
        <div className="mx-auto max-w-[1320px]" style={{ display: 'flex', alignItems: 'center', minHeight: 52, gap: 16 }}>
          <Link href="/" style={{ color: GOLD, fontSize: 13, fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Home
          </Link>
          <span style={{ color: 'rgba(255,255,255,.18)', fontSize: 12 }}>/</span>
          <span style={{ color: 'rgba(255,255,255,.45)', fontSize: 12, fontWeight: 600 }}>Leadership</span>
          <span style={{ color: 'rgba(255,255,255,.18)', fontSize: 12 }}>/</span>
          <span style={{ color: 'rgba(255,255,255,.75)', fontSize: 12, fontWeight: 700 }}>{leader.full_name}</span>
        </div>
      </div>

      {/* Background texture */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.03) 1px,transparent 1px)', backgroundSize: '28px 28px', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse 70% 50% at 50% 20%,rgba(201,168,76,.06) 0%,transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      {/* Profile */}
      <div className="mx-auto max-w-[860px] px-5 sm:px-7" style={{ position: 'relative', zIndex: 1, paddingTop: 56, paddingBottom: 80 }}>
        <div style={{ borderRadius: 24, background: '#0a3830', border: `1px solid ${GOLD}22`, boxShadow: '0 24px 80px rgba(0,0,0,.6)', overflow: 'hidden' }}>
          {/* Gold top bar */}
          <div style={{ height: 4, background: `linear-gradient(90deg,transparent,${GOLD} 30%,#f6d46d 50%,${GOLD} 70%,transparent)` }} />

          {/* Hero photo */}
          <div style={{ position: 'relative', height: 'clamp(260px,35vw,380px)', overflow: 'hidden', background: '#051e1b' }}>
            {leader.photo_url
              ? <img src={leader.photo_url} alt={leader.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
              : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: 100, color: `${GOLD}25`, fontWeight: 900 }}>{initial}</div>
            }
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(10,56,48,.97) 0%,rgba(10,56,48,.5) 35%,transparent 70%)' }} />

            {/* Name overlay */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 'clamp(20px,4vw,36px)' }}>
              {leader.category && (
                <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.24em', textTransform: 'uppercase', color: GOLD, opacity: .7, marginBottom: 8 }}>{leader.category}</div>
              )}
              <h1 style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 'clamp(1.6rem,4vw,2.5rem)', fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.1, letterSpacing: '.01em' }}>
                {leader.full_name}
              </h1>
              {leader.role_title && (
                <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 22, height: 2.5, background: GOLD, borderRadius: 2 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: GOLD, letterSpacing: '.1em', textTransform: 'uppercase' }}>{leader.role_title}</span>
                </div>
              )}
            </div>
          </div>

          {/* Details */}
          <div style={{ padding: 'clamp(24px,5vw,44px)' }}>
            {/* Gold divider */}
            <div style={{ height: 1.5, background: `linear-gradient(90deg,transparent,${GOLD}60 30%,${GOLD}60 70%,transparent)`, marginBottom: 36 }} />

            <div style={{ display: 'grid', gap: 28 }}>
              {leader.qualifications && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.22em', textTransform: 'uppercase', color: GOLD, opacity: .8, marginBottom: 8 }}>Qualifications</div>
                  <div style={{ fontSize: 16, color: 'rgba(255,255,255,.7)', lineHeight: 1.6 }}>{leader.qualifications}</div>
                </div>
              )}

              {leader.experience && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.22em', textTransform: 'uppercase', color: GOLD, opacity: .8, marginBottom: 8 }}>Experience</div>
                  <div style={{ fontSize: 16, color: 'rgba(255,255,255,.7)', lineHeight: 1.6 }}>{leader.experience}</div>
                </div>
              )}

              {leader.subjects && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.22em', textTransform: 'uppercase', color: GOLD, opacity: .8, marginBottom: 8 }}>Subjects / Responsibilities</div>
                  <div style={{ fontSize: 16, color: 'rgba(255,255,255,.7)', lineHeight: 1.6 }}>{leader.subjects}</div>
                </div>
              )}

              {bio && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.22em', textTransform: 'uppercase', color: GOLD, opacity: .8, marginBottom: 10 }}>About</div>
                  <p style={{ fontSize: 16, lineHeight: 1.9, color: 'rgba(255,255,255,.55)', margin: 0 }}>{bio}</p>
                </div>
              )}

              {!bio && !leader.qualifications && !leader.experience && (
                <p style={{ fontSize: 15, color: 'rgba(255,255,255,.3)', fontStyle: 'italic', margin: 0 }}>Full profile information coming soon.</p>
              )}
            </div>

            {/* Back links */}
            <div style={{ marginTop: 44, paddingTop: 28, borderTop: `1px solid ${GOLD}22`, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/#leadership" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 24px', borderRadius: 12,
                background: GOLD, color: DARK,
                fontSize: 13, fontWeight: 900, textDecoration: 'none',
              }}>← Back to Leadership</Link>
              <Link href="/" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '12px 24px', borderRadius: 12,
                border: `1.5px solid ${GOLD}50`,
                color: GOLD, fontSize: 13, fontWeight: 900, textDecoration: 'none',
              }}>Home</Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
