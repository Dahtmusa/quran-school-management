import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const GREEN = '#062d2a';
const TEAL = '#0f766e';
const GOLD = '#C9A84C';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('full_name,job_title')
    .eq('id', id)
    .eq('role', 'teacher')
    .single();
  return {
    title: data ? `${data.full_name} — Teacher Profile` : 'Teacher Profile',
  };
}

export default async function TeacherProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: teacher } = await supabase
    .from('profiles')
    .select('id,full_name,job_title,department,avatar_url,bio,qualifications,experience,subjects')
    .eq('id', id)
    .eq('role', 'teacher')
    .single();

  if (!teacher) notFound();

  const initial = teacher.full_name?.charAt(0) ?? '?';

  return (
    <main style={{ minHeight: '100vh', background: '#F4F1EA' }}>
      {/* Top bar */}
      <div style={{ background: GREEN, padding: '0 20px' }}>
        <div className="mx-auto max-w-[1320px]" style={{ display: 'flex', alignItems: 'center', minHeight: 52, gap: 16 }}>
          <Link href="/" style={{ color: GOLD, fontSize: 13, fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Home
          </Link>
          <span style={{ color: 'rgba(255,255,255,.25)', fontSize: 12 }}>/</span>
          <span style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, fontWeight: 600 }}>Teaching Staff</span>
          <span style={{ color: 'rgba(255,255,255,.25)', fontSize: 12 }}>/</span>
          <span style={{ color: 'rgba(255,255,255,.8)', fontSize: 12, fontWeight: 700 }}>{teacher.full_name}</span>
        </div>
      </div>

      {/* Profile */}
      <div className="mx-auto max-w-[820px] px-5 sm:px-7" style={{ paddingTop: 56, paddingBottom: 80 }}>
        <div style={{ background: '#fff', borderRadius: 24, boxShadow: '0 12px 48px rgba(6,45,40,.12)', overflow: 'hidden' }}>
          {/* Gold top bar */}
          <div style={{ height: 5, background: `linear-gradient(90deg,transparent,${GOLD} 30%,#f6d46d 50%,${GOLD} 70%,transparent)` }} />

          <div style={{ padding: 'clamp(28px,5vw,48px)' }}>
            {/* Photo + name */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center', marginBottom: 36 }}>
              {/* Portrait */}
              <div style={{
                width: 128, height: 128, borderRadius: '50%', overflow: 'hidden',
                background: GREEN, flexShrink: 0,
                boxShadow: `0 0 0 3px #fff, 0 0 0 6.5px ${GOLD}, 0 8px 28px rgba(6,45,40,.25)`,
              }}>
                {teacher.avatar_url
                  ? <img src={teacher.avatar_url} alt={teacher.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%' }} />
                  : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: 44, color: GOLD, fontWeight: 900 }}>{initial}</div>
                }
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.22em', textTransform: 'uppercase', color: TEAL, marginBottom: 8 }}>Teacher Profile</div>
                <h1 style={{ fontFamily: "Georgia,'Times New Roman',serif", fontSize: 'clamp(1.5rem,4vw,2.2rem)', fontWeight: 900, color: GREEN, margin: 0, lineHeight: 1.15 }}>
                  {teacher.full_name}
                </h1>
                {(teacher.job_title || teacher.department) && (
                  <div style={{ marginTop: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#0c5e50', borderRadius: 99, padding: '6px 18px', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                      {teacher.job_title || teacher.department}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Gold divider */}
            <div style={{ height: 1.5, background: `linear-gradient(90deg,transparent,${GOLD} 30%,${GOLD} 70%,transparent)`, marginBottom: 32 }} />

            {/* Details grid */}
            <div style={{ display: 'grid', gap: 24 }}>
              {teacher.department && teacher.department !== teacher.job_title && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.22em', textTransform: 'uppercase', color: TEAL, marginBottom: 7 }}>Department</div>
                  <div style={{ fontSize: 16, color: '#3d5c4e', fontWeight: 600 }}>{teacher.department}</div>
                </div>
              )}

              {(teacher as any).qualifications && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.22em', textTransform: 'uppercase', color: TEAL, marginBottom: 7 }}>Qualifications</div>
                  <div style={{ fontSize: 15, color: '#3d5c4e' }}>{(teacher as any).qualifications}</div>
                </div>
              )}

              {(teacher as any).experience && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.22em', textTransform: 'uppercase', color: TEAL, marginBottom: 7 }}>Experience</div>
                  <div style={{ fontSize: 15, color: '#3d5c4e' }}>{(teacher as any).experience}</div>
                </div>
              )}

              {(teacher as any).subjects && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.22em', textTransform: 'uppercase', color: TEAL, marginBottom: 7 }}>Subjects</div>
                  <div style={{ fontSize: 15, color: '#3d5c4e' }}>{(teacher as any).subjects}</div>
                </div>
              )}

              {teacher.bio && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.22em', textTransform: 'uppercase', color: TEAL, marginBottom: 9 }}>About</div>
                  <p style={{ fontSize: 16, lineHeight: 1.88, color: '#4a6258', margin: 0 }}>{teacher.bio}</p>
                </div>
              )}

              {!teacher.bio && !(teacher as any).qualifications && !(teacher as any).experience && (
                <p style={{ fontSize: 15, color: '#7a9288', fontStyle: 'italic', margin: 0 }}>Full profile information coming soon.</p>
              )}
            </div>

            {/* Back to home */}
            <div style={{ marginTop: 40, paddingTop: 28, borderTop: `1px solid ${GOLD}33`, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/#teaching-staff" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 22px', borderRadius: 12,
                background: GREEN, color: '#fff',
                fontSize: 13, fontWeight: 800, textDecoration: 'none',
              }}>
                ← Back to Staff
              </Link>
              <Link href="/" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 22px', borderRadius: 12,
                border: `1.5px solid ${GREEN}`,
                color: GREEN, fontSize: 13, fontWeight: 800, textDecoration: 'none',
              }}>
                Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
