// Small feed of today's gate + teacher scans for the scanner page's
// "Recent scans" panel. Gate scanners see it too so they can double-check
// they scanned the correct person a minute ago.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ALLOWED = ['security','admin','super_admin','principal'];

function todayLagos() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!ALLOWED.includes(viewer?.role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 10));
  const admin = createAdminClient();
  const date  = todayLagos();

  const { data: records, error } = await admin
    .from('attendance_records')
    .select('id,person_id,person_type,status_code,scanned_at')
    .eq('attendance_date', date)
    .order('scanned_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const studentIds = (records || []).filter(r => r.person_type === 'student').map(r => r.person_id);
  const staffIds   = (records || []).filter(r => r.person_type === 'staff').map(r => r.person_id);
  const [studentsRes, staffRes] = await Promise.all([
    studentIds.length
      ? admin.from('students').select('id,full_name,admission_no,section').in('id', studentIds)
      : Promise.resolve({ data: [] as any[] }),
    staffIds.length
      ? admin.from('profiles').select('id,full_name,staff_id,job_title').in('id', staffIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const students = new Map((studentsRes.data || []).map((s: any) => [s.id, s]));
  const staff    = new Map((staffRes.data    || []).map((s: any) => [s.id, s]));

  const rows = (records || []).map((r: any) => {
    const s = r.person_type === 'student' ? students.get(r.person_id) : staff.get(r.person_id);
    return {
      id: r.id,
      person_id: r.person_id,
      person_type: r.person_type,
      full_name: s?.full_name || 'Unknown',
      identifier: r.person_type === 'student' ? (s?.admission_no || null) : (s?.staff_id || null),
      section: r.person_type === 'student' ? String(s?.section || '').toLowerCase() : 'staff',
      role_or_class: r.person_type === 'staff' ? (s?.job_title || null) : null,
      status_code: r.status_code,
      scanned_at: r.scanned_at,
    };
  });
  return NextResponse.json({ date, rows });
}
