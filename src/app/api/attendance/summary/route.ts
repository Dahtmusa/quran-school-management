// Admin dashboard summary for a single date. Builds three buckets:
//   Day students, Boarding students, Eligible staff.
// A person shows as Absent (inferred) once the morning cutoff has passed for
// scan-only groups (day students, staff) without a record; boarding students
// stay "Not marked" until their teacher marks them.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ADMIN_ROLES = ['admin','super_admin','principal'];

function todayLagos() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}
function lagosHHmm() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!ADMIN_ROLES.includes(viewer?.role || '')) {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const date = req.nextUrl.searchParams.get('date') || todayLagos();
  const today = todayLagos();

  const { data: cutoffRow } = await admin
    .from('attendance_settings')
    .select('value')
    .eq('key', 'morning_cutoff_time')
    .maybeSingle();
  const cutoff = String(cutoffRow?.value ?? '08:30').replace(/"/g, '');
  const cutoffReached = lagosHHmm() >= cutoff;
  const inferAbsent = date < today || (date === today && cutoffReached);

  const [studentsRes, staffRes, recordsRes, classesRes] = await Promise.all([
    admin.from('students')
      .select('id,full_name,admission_no,section,class_id,parent_phone,guardian_phone')
      .eq('status', 'active').order('full_name'),
    admin.from('profiles')
      .select('id,full_name,staff_id,role,job_title,department')
      .eq('employment_status', 'active')
      .not('role', 'in', '(admin,super_admin,principal,finance,admissions,parent)')
      .order('full_name'),
    admin.from('attendance_records')
      .select('person_id,person_type,status_code,scanned_at,recorded_by,note')
      .eq('attendance_date', date).eq('period', 'morning'),
    admin.from('classes').select('id,name'),
  ]);

  const err = studentsRes.error || staffRes.error || recordsRes.error || classesRes.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const classNameById = new Map<string, string>(
    (classesRes.data || []).map((c: any) => [c.id, c.name])
  );
  const records = new Map(
    (recordsRes.data || []).map((r: any) => [r.person_type + ':' + r.person_id, r])
  );

  const build = (people: any[], type: 'student' | 'staff') => people.map((p: any) => {
    const r = records.get(type + ':' + p.id);
    const rawSection = type === 'student' ? String(p.section || '').toLowerCase() : 'staff';
    const section: 'day' | 'boarding' | 'staff' =
      rawSection === 'boarding' ? 'boarding' : rawSection === 'day' ? 'day' : 'staff';
    const isScanGroup = section !== 'boarding';
    const status = r?.status_code
      || (isScanGroup && inferAbsent ? 'absent' : null);
    const source = r
      ? (section === 'boarding' ? 'teacher' : 'gate_scan')
      : (section === 'boarding' ? 'awaiting_teacher' : 'awaiting_gate');
    return {
      id: p.id,
      person_type: type,
      full_name: p.full_name,
      identifier: type === 'student' ? p.admission_no : p.staff_id,
      section,
      class_name: type === 'student' ? (classNameById.get(p.class_id) || null) : null,
      job_title: type === 'staff' ? (p.job_title || null) : null,
      parent_phone: type === 'student' ? (p.parent_phone || p.guardian_phone || null) : null,
      status,
      scanned_at: r?.scanned_at || null,
      source,
      note: r?.note || null,
    };
  });

  const students = build(studentsRes.data || [], 'student');
  const staff    = build(staffRes.data    || [], 'staff');

  const day      = students.filter(r => r.section === 'day');
  const boarding = students.filter(r => r.section === 'boarding');

  const count = (rows: any[]) => ({
    total: rows.length,
    present: rows.filter(r => r.status === 'present').length,
    late:    rows.filter(r => r.status === 'late').length,
    absent:  rows.filter(r => r.status === 'absent').length,
    excused: rows.filter(r => r.status === 'excused').length,
    not_marked: rows.filter(r => !r.status).length,
  });

  return NextResponse.json({
    date,
    cutoff,
    people: { day, boarding, staff },
    counts: { day: count(day), boarding: count(boarding), staff: count(staff) },
  });
}
