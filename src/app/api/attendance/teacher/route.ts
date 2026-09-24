// Teacher boarding roster + mark endpoint. Uses SECURITY DEFINER RPCs so a
// teacher can only see / affect boarding students actually assigned to them.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function todayLagos() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}

async function requireTeacher(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'teacher') {
    return { error: NextResponse.json({ error: 'Teacher access required.' }, { status: 403 }) };
  }
  return { supabase };
}

export async function GET(req: NextRequest) {
  const gate = await requireTeacher(req);
  if ('error' in gate) return gate.error;
  const date = req.nextUrl.searchParams.get('date') || todayLagos();
  const { data, error } = await gate.supabase.rpc('teacher_amqm_boarding_roster', { p_date: date });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data || []).map((r: any) => ({
    student_id: r.student_id,
    full_name: r.full_name,
    admission_no: r.admission_no,
    class_name: r.class_name,
    status_code: r.status_code,
    scanned_at: r.recorded_at,
  }));
  return NextResponse.json({ date, rows });
}

export async function POST(req: NextRequest) {
  const gate = await requireTeacher(req);
  if ('error' in gate) return gate.error;
  const body = await req.json().catch(() => ({}));
  const studentId = String(body?.studentId || '');
  const status    = String(body?.status || '');
  const date      = String(body?.date || todayLagos());
  if (!studentId || !status) {
    return NextResponse.json({ error: 'Student and status are required.' }, { status: 400 });
  }
  if (date > todayLagos()) {
    return NextResponse.json({ error: 'Future attendance is not allowed.' }, { status: 400 });
  }
  const { data, error } = await gate.supabase.rpc('teacher_amqm_record_boarding_attendance', {
    p_student_id: studentId, p_status: status, p_date: date,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data });
}
