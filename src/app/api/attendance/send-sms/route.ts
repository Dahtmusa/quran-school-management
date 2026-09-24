// Send an SMS to a day-student parent about today's attendance status.
// Renders the template configured in Attendance Settings, sends via
// BestBulkSMS, and writes an audit row to attendance_sms_log.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendBestBulkSms } from '@/lib/sms/bestbulksms';

const ADMIN_ROLES = ['admin','super_admin','principal'];
const TEMPLATE_KEYS = {
  arrival: 'sms_arrival_template',
  late:    'sms_late_template',
  absent:  'sms_absent_template',
} as const;
type TemplateKind = keyof typeof TEMPLATE_KEYS | 'custom';

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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!ADMIN_ROLES.includes(viewer?.role || '')) {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const studentId = String(body?.studentId || '');
  const template  = String(body?.template || '') as TemplateKind;
  const override  = body?.overrideMessage ? String(body.overrideMessage) : '';

  if (!studentId) return NextResponse.json({ error: 'studentId required.' }, { status: 400 });
  if (!['arrival','late','absent','custom'].includes(template)) {
    return NextResponse.json({ error: 'Unknown SMS template.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: student }, { data: settingsRows }] = await Promise.all([
    admin.from('students')
      .select('id,full_name,section,parent_phone,guardian_phone')
      .eq('id', studentId).maybeSingle(),
    admin.from('attendance_settings').select('key,value')
      .in('key', ['sms_enabled','sms_arrival_template','sms_late_template','sms_absent_template']),
  ]);
  if (!student) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
  const phone = student.parent_phone || student.guardian_phone;
  if (!phone) return NextResponse.json({ error: 'No parent phone number on file for this student.' }, { status: 400 });

  const settings: Record<string, any> = {};
  for (const row of settingsRows || []) settings[row.key] = unwrap(row.value);
  if (settings.sms_enabled === 'false' || settings.sms_enabled === false) {
    return NextResponse.json({ error: 'SMS is disabled in Attendance Settings.' }, { status: 400 });
  }

  const [scanned] = await Promise.all([
    admin.from('attendance_records')
      .select('scanned_at,status_code')
      .eq('person_id', studentId).eq('attendance_date', todayLagos()).eq('period','morning')
      .maybeSingle().then(r => r.data),
  ]);

  const time = scanned?.scanned_at
    ? new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(scanned.scanned_at))
    : nowLagosTime();
  const rendered = template === 'custom'
    ? override
    : render(settings[TEMPLATE_KEYS[template]] || '', {
        student_name: student.full_name,
        time,
        date: todayLagos(),
      });
  if (!rendered.trim()) {
    return NextResponse.json({ error: 'Message is empty. Configure the template under Settings or supply overrideMessage.' }, { status: 400 });
  }

  const result = await sendBestBulkSms(phone, rendered);

  await admin.from('attendance_sms_log').insert({
    student_id: studentId,
    parent_phone: result.to,
    template_kind: template,
    message: rendered,
    status: result.ok ? 'sent' : 'failed',
    provider_response: result.providerResponse,
    sent_by: user.id,
  });

  if (!result.ok) return NextResponse.json({ error: 'SMS gateway rejected the request.', detail: result.providerResponse }, { status: 502 });
  return NextResponse.json({ sent: true, to: result.to, message: rendered });
}
