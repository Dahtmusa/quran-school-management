// Admin manual override — mark a person Present / Late / Absent / Excused
// for any past-or-current date. Backed by admin_set_attendance_status.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_ROLES = ['admin','super_admin','principal'];
const VALID = new Set(['present','late','absent','excused','sick']);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!ADMIN_ROLES.includes(viewer?.role || '')) {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const personId   = String(body?.personId || '');
  const personType = String(body?.personType || '');
  const date       = String(body?.date || '');
  const status     = String(body?.status || '');
  const note       = body?.note ? String(body.note) : null;

  if (!personId || !personType || !date || !status) {
    return NextResponse.json({ error: 'personId, personType, date, status are all required.' }, { status: 400 });
  }
  if (!['student','staff'].includes(personType)) {
    return NextResponse.json({ error: 'personType must be student or staff.' }, { status: 400 });
  }
  if (!VALID.has(status)) {
    return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('admin_set_attendance_status', {
    p_person_id: personId,
    p_person_type: personType,
    p_date: date,
    p_status: status,
    p_notes: note,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data });
}
