import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const CREAM  = '#F5F0E8';
const DARK   = '#062d2a';
const GOLD   = '#C9A84C';
const GOLD_L = '#E8C97A';
const GOLD_D = '#9A7020';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('public_team_profiles')
    .select('full_name,role_title')
    .eq('id', id)
    .single();
  return {
    title: data ? `${data.full_name} — AMQM Leadership` : 'Leadership Profile',
  };
}

/* ── geometric SVG pattern ── */
function GeoDecor({ size = 180, opacity = 0.06 }: { size?: number; opacity?: number }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden
      style={{ display: 'block', opacity }}
    >
      <defs>
        <pattern id="gp" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
          <polygon points="15,2 28,9 28,21 15,28 2,21 2,9" fill="none" stroke={GOLD} strokeWidth="0.9" />
          <line x1="15" y1="2" x2="15" y2="28" stroke={GOLD} strokeWidth="0.4" opacity="0.55" />
          <line x1="2" y1="15" x2="28" y2="15" stroke={GOLD} strokeWidth="0.4" opacity="0.55" />
          <circle cx="15" cy="15" r="3.5" fill="none" stroke={GOLD} strokeWidth="0.7" />
        </pattern>
      </defs>
      <rect width="120" height="120" fill="url(#gp)" />
    </svg>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 900, letterSpacing: '.22em',
        textTransform: 'uppercase', color: GOLD_D, opacity: .75,
        marginBottom: 7,
      }}>{label}</div>
      <div style={{ fontSize: 15.5, lineHeight: 1.72, color: `${DARK}85` }}>{value}</div>
    </div>
  );
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
  const hasDetails = leader.qualifications || leader.experience || leader.subjects || bio;

  return (
    <main style={{ minHeight: '100vh', background: CREAM }}>

      {/* ── Top nav bar ── */}
      <div style={{
        background: CREAM,
        borderBottom: `1px solid rgba(6,45,42,.1)`,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        {/* Gold rule at very top */}
        <div style={{ height: 3, background: `linear-gradient(90deg,transparent,${GOLD} 30%,${GOLD_L} 50%,${GOLD} 70%,transparent)` }} />
        <div className="mx-auto max-w-[1100px]" style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 50, gap: 8 }}>
            <Link
              href="/#leadership"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12.5, fontWeight: 800, color: DARK,
                textDecoration: 'none', opacity: .7,
                transition: 'opacity .15s',
              }}
            >
              ← Leadership
            </Link>
            <span style={{ color: `${DARK}30`, fontSize: 12 }}>/</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: DARK }}>{leader.full_name}</span>
          </div>
        </div>
      </div>

      {/* ── Page content ── */}
      <div className="mx-auto max-w-[1100px] px-5 sm:px-8" style={{ paddingTop: 52, paddingBottom: 96 }}>

        {/* ── Two-column hero ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,340px) 1fr',
          gap: 48,
          alignItems: 'flex-start',
        }}
          className="lp-grid"
        >

          {/* Left: portrait */}
          <div style={{ position: 'relative' }}>
            {/* Outer ring decoration */}
            <div style={{
              position: 'absolute', inset: -8,
              borderRadius: 28,
              border: `1px solid ${GOLD}30`,
              pointerEvents: 'none',
            }} />

            <div style={{
              borderRadius: 22,
              overflow: 'hidden',
              background: DARK,
              boxShadow: '0 24px 72px rgba(6,45,42,.18)',
              position: 'relative',
            }}>
              {/* Gold top rule */}
              <div style={{ height: 4, background: `linear-gradient(90deg,transparent,${GOLD} 30%,${GOLD_L} 50%,${GOLD} 70%,transparent)` }} />

              {leader.photo_url
                ? (
                  <img
                    src={leader.photo_url}
                    alt={leader.full_name}
                    style={{
                      width: '100%',
                      height: 'clamp(300px, 40vw, 460px)',
                      objectFit: 'cover',
                      objectPosition: 'center 20%',
                      display: 'block',
                    }}
                  />
                )
                : (
                  <div style={{
                    height: 'clamp(300px, 40vw, 460px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontSize: 110, color: `${GOLD}22`, fontWeight: 900,
                    position: 'relative',
                  }}>
                    {/* Geo decor behind initial */}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: .07 }}>
                      <GeoDecor size={260} opacity={1} />
                    </div>
                    <span style={{ position: 'relative' }}>{initial}</span>
                  </div>
                )
              }

              {/* Bottom gradient + name overlay */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to top, rgba(6,45,42,.88) 0%, rgba(6,45,42,.2) 45%, transparent 70%)',
              }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 24px 24px' }}>
                {leader.category && (
                  <div style={{
                    fontSize: 9.5, fontWeight: 900, letterSpacing: '.24em',
                    textTransform: 'uppercase', color: GOLD, opacity: .8, marginBottom: 7,
                  }}>
                    {leader.category}
                  </div>
                )}
                <h1 style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: 'clamp(1.3rem, 2.8vw, 1.85rem)',
                  fontWeight: 900, color: '#fff',
                  margin: 0, lineHeight: 1.1, letterSpacing: '.005em',
                }}>
                  {leader.full_name}
                </h1>
                {leader.role_title && (
                  <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 20, height: 2.5, background: GOLD, borderRadius: 2 }} />
                    <span style={{
                      fontSize: 10.5, fontWeight: 800, color: GOLD,
                      letterSpacing: '.1em', textTransform: 'uppercase',
                    }}>
                      {leader.role_title}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: details panel */}
          <div>
            {/* Desktop-only name/role header */}
            <div className="lp-info-header" style={{ marginBottom: 28 }}>
              <h2 style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: 'clamp(1.6rem, 2.8vw, 2.4rem)',
                fontWeight: 900, color: DARK,
                margin: 0, lineHeight: 1.1, letterSpacing: '-.02em',
              }}>
                {leader.full_name}
              </h2>
              {leader.role_title && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  marginTop: 14, padding: '5px 16px', borderRadius: 99,
                  background: `${GOLD}18`, border: `1px solid ${GOLD}44`,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, flexShrink: 0 }} />
                  <span style={{ fontSize: 10.5, fontWeight: 900, color: GOLD_D, letterSpacing: '.12em', textTransform: 'uppercase' }}>
                    {leader.role_title}
                  </span>
                </div>
              )}
            </div>

            {/* White info card */}
            <div style={{
              background: '#fff',
              borderRadius: 20,
              border: `1.5px solid rgba(201,168,76,.22)`,
              boxShadow: '0 8px 40px rgba(6,45,42,.07)',
              padding: '32px 36px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Geometric corner */}
              <div style={{ position: 'absolute', top: -24, right: -24, pointerEvents: 'none' }}>
                <GeoDecor size={140} opacity={0.045} />
              </div>

              {hasDetails
                ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24, position: 'relative' }}>
                    {leader.qualifications && <DetailBlock label="Qualifications" value={leader.qualifications} />}

                    {leader.experience && (
                      <>
                        <div style={{ height: 1, background: `${GOLD}20` }} />
                        <DetailBlock label="Experience" value={leader.experience} />
                      </>
                    )}

                    {leader.subjects && (
                      <>
                        <div style={{ height: 1, background: `${GOLD}20` }} />
                        <DetailBlock label="Responsibilities" value={leader.subjects} />
                      </>
                    )}

                    {bio && (
                      <>
                        <div style={{ height: 1, background: `${GOLD}20` }} />
                        <div>
                          <div style={{
                            fontSize: 10, fontWeight: 900, letterSpacing: '.22em',
                            textTransform: 'uppercase', color: GOLD_D, opacity: .75,
                            marginBottom: 10,
                          }}>About</div>
                          <p style={{
                            fontSize: 15.5, lineHeight: 1.84,
                            color: `${DARK}80`, margin: 0,
                            whiteSpace: 'pre-line',
                          }}>{bio}</p>
                        </div>
                      </>
                    )}
                  </div>
                )
                : (
                  <p style={{ fontSize: 15, color: `${DARK}40`, fontStyle: 'italic', margin: 0 }}>
                    Full profile information coming soon.
                  </p>
                )
              }
            </div>

            {/* Back button */}
            <div style={{ marginTop: 28, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link
                href="/#leadership"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '12px 26px', borderRadius: 12,
                  background: DARK, color: '#fff',
                  fontSize: 13, fontWeight: 800, letterSpacing: '.04em',
                  textDecoration: 'none',
                }}
              >
                ← Back to Leadership
              </Link>
              <Link
                href="/"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '12px 24px', borderRadius: 12,
                  border: `1.5px solid rgba(6,45,42,.22)`,
                  color: `${DARK}90`, fontSize: 13, fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Home
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Responsive grid styles ── */}
      <style>{`
        .lp-grid {
          grid-template-columns: minmax(0, 320px) 1fr;
        }
        @media (max-width: 700px) {
          .lp-grid {
            grid-template-columns: 1fr !important;
            gap: 28px !important;
          }
          .lp-info-header { display: none !important; }
        }
        @media (min-width: 701px) {
          .lp-info-header { display: block; }
        }
      `}</style>
    </main>
  );
}
