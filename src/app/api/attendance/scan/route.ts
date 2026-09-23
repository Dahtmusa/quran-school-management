import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const GATE_ROLES = ['security','admin','super_admin','principal'];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!GATE_ROLES.includes(viewer?.role || '')) {
    return NextResponse.json({ error: 'Gate scanner access required' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = String(body?.value ?? '').trim();
  if (!raw) return NextResponse.json({ error: 'Scan or enter an ID number.' }, { status: 400 });

  const { data: matches, error: resolveError } = await supabase.rpc('resolve_amqm_attendance_person', { p_input: raw });
  if (resolveError) {
    console.error('[attendance/gate] resolve', resolveError);
    return NextResponse.json({ error: 'Could not verify this ID.' }, { status: 500 });
  }

  const person = Array.isArray(matches) ? matches[0] : matches;
  if (!person) {
    return NextResponse.json({
      error: 'ID not found',
      message: 'This is not an active day-student or ordinary staff attendance ID.'
    }, { status: 404 });
  }

  if (person.person_type === 'student' && person.section !== 'day') {
    return NextResponse.json({ error: 'Boarding students are marked by their teacher.' }, { status: 409 });
  }

  const { data: gate } = await supabase
    .from('attendance_scan_points')
    .select('id')
    .ilike('name', 'Main Gate')
    .eq('is_active', true)
    .maybeSingle();

  const { data: result, error: recordError } = await supabase.rpc('record_amqm_gate_attendance', {
    p_person_id: person.person_id,
    p_person_type: person.person_type,
    p_scan_point_id: gate?.id ?? null,
  });

  if (recordError) {
    console.error('[attendance/gate] record', recordError);
    return NextResponse.json({ error: recordError.message || 'Attendance could not be recorded.' }, { status: 400 });
  }

  const row = Array.isArray(result) ? result[0] : result;
  return NextResponse.json({
    success: true,
    person: {
      id: person.person_id,
      type: person.person_type,
      name: person.display_name,
      identifier: person.identifier,
      photoUrl: person.photo_url ?? null,
    },
    statusCode: row?.status_code ?? 'present',
    scannedAt: row?.scanned_at ?? new Date().toISOString(),
    message: row?.message ?? 'Attendance recorded',
  });
}
