// Admin attendance analytics endpoint. Returns daily aggregated counts
// across a date range + per-person breakdown + the configured terms
// (so the UI can compute term-vs-term comparisons without a second
// round trip).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_ROLES = ['super_admin','admin','principal','finance','admissions'];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!ADMIN_ROLES.includes(viewer?.role || '')) {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  const personType = (req.nextUrl.searchParams.get('personType') || 'student') as 'student' | 'staff';
  const from       = req.nextUrl.searchParams.get('from') || '';
  const to         = req.nextUrl.searchParams.get('to')   || '';
  const section    = req.nextUrl.searchParams.get('section');

  if (!from || !to) return NextResponse.json({ error: 'from and to are required (YYYY-MM-DD).' }, { status: 400 });

  const [dailyRes, peopleRes, termsRes] = await Promise.all([
    supabase.rpc('admin_attendance_daily',               { p_person_type: personType, p_from: from, p_to: to }),
    supabase.rpc('admin_attendance_person_breakdown',    { p_person_type: personType, p_from: from, p_to: to, p_section: section || null }),
    supabase.from('terms').select('id,name,term_number,starts_on,ends_on,is_current,academic_years:academic_year_id(name)').order('starts_on', { ascending: false }).limit(8),
  ]);

  const err = dailyRes.error || peopleRes.error || termsRes.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  return NextResponse.json({
    daily:  dailyRes.data  || [],
    people: peopleRes.data || [],
    terms:  termsRes.data  || [],
  });
}
