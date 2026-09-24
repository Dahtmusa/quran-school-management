// Admin manual override — mark a person Present / Late / Absent / Excused
// for any past-or-current date. Backed by admin_set_attendance_status.
// Side effect: for day students, when the admin sets Absent or Late we
// auto-send the matching SMS template to the parent (fire-and-forget so
// the UI stays snappy).
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendBestBulkSms } from '@/lib/sms/bestbulksms';

const ADMIN_ROLES = ['admin','super_admin','principal'];
const VALID = new Set(['present','late','absent','excused','sick']);

function unwrap(value: any): string {
  if (typeof value === 'string') return value.replace(/^"|"$/g, '');
  return String(value ?? '');
}
function todayLagos() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}
function nowLagosTime() {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date());
}
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '{' + key + '}');
}

async function autoNotifyParent(
  personId: string,
  status: 'late' | 'absent',
  date: string,
  actorId: string,
) {
  try {
    const admin = createAdminClient();
    const [{ data: student }, { data: settings }] = await Promise.all([
      admin.from('students')
        .select('id,full_name,section,parent_phone,guardian_phone')
        .eq('id', personId).maybeSingle(),
      admin.from('attendance_settings').select('key,value')
        .in('key', ['sms_enabled','sms_late_template','sms_absent_template']),
    ]);
    if (!student || String(student.section || '').toLowerCase() !== 'day') return;
    const phone = student.parent_phone || student.guardian_phone;
    if (!phone) return;

    const kv: Record<string, string> = {};
    for (const s of settings || []) kv[s.key] = unwrap(s.value);
    if (kv.sms_enabled === 'false' || (settings || []).find(x => x.key === 'sms_enabled')?.value === false) return;

    const templateKey = status === 'late' ? 'sms_late_template' : 'sms_absent_template';
    const message = render(kv[templateKey] || '', {
      student_name: student.full_name,
      time: nowLagosTime(),
      date,
    });
    if (!message.trim()) return;

    const result = await sendBestBulkSms(phone, message);
    await admin.from('attendance_sms_log').insert({
      student_id: personId,
      parent_phone: result.to,
      template_kind: status,
      message,
      status: result.ok ? 'sent' : 'failed',
      provider_response: 'auto-' + status + ': ' + result.providerResponse,
      sent_by: actorId,
    });
  } catch (err) {
    console.error('[attendance/set-status] autoNotifyParent failed', err);
  }
}

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
  const notify     = body?.notify !== false;   // opt-in default; UI passes { notify: false } to skip

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

  // Fire-and-forget SMS to the day-student's parent when the admin sets
  // Late or Absent. We don't wait on the SMS gateway — the click should
  // feel instant.
  if (notify && personType === 'student' && (status === 'late' || status === 'absent')) {
    autoNotifyParent(personId, status as 'late' | 'absent', date, user.id);
  }

  return NextResponse.json({ id: data });
}
