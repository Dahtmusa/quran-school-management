// Bulk-notify parents of every day student who is currently in a given
// status (late / absent / present) on the given date. Sends via the same
// BestBulkSMS adapter and writes one attendance_sms_log row per parent.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendBestBulkSms } from '@/lib/sms/bestbulksms';

const ADMIN_ROLES = ['admin','super_admin','principal'];

const TEMPLATE_KEY: Record<string, string> = {
  arrival: 'sms_arrival_template',
  late:    'sms_late_template',
  absent:  'sms_absent_template',
};
const STATUS_FOR_TEMPLATE: Record<string, string> = {
  arrival: 'present',
  late:    'late',
  absent:  'absent',
};

function unwrap(value: any): string {
  if (typeof value === 'string') return value.replace(/^"|"$/g, '');
  return String(value ?? '');
}
function todayLagos() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
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
  const template = String(body?.template || '');   // 'arrival' | 'late' | 'absent'
  const date     = String(body?.date || todayLagos());
  const markUnmarkedAbsent = Boolean(body?.markUnmarkedAbsent);

  if (!(template in TEMPLATE_KEY)) {
    return NextResponse.json({ error: 'template must be arrival, late or absent.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // If asked (and this is the Absent template), first mark every unmarked
  // day student as Absent so the population matches what we're notifying.
  if (template === 'absent' && markUnmarkedAbsent) {
    const { data: unmarked } = await admin
      .from('students')
      .select('id')
      .eq('status', 'active').eq('section', 'day');
    const { data: existing } = await admin
      .from('attendance_records')
      .select('person_id')
      .eq('attendance_date', date).eq('period', 'morning').eq('person_type','student');
    const alreadyIds = new Set((existing || []).map((r: any) => r.person_id));
    const toMark = (unmarked || []).filter((s: any) => !alreadyIds.has(s.id));
    if (toMark.length) {
      // supabase-js has no bulk-RPC helper; loop but in parallel.
      await Promise.allSettled(toMark.map(s =>
        supabase.rpc('admin_set_attendance_status', {
          p_person_id: s.id,
          p_person_type: 'student',
          p_date: date,
          p_status: 'absent',
          p_notes: null,
        })
      ));
    }
  }

  // Resolve target students: day students whose attendance for `date` has
  // the status corresponding to the template.
  const wantedStatus = STATUS_FOR_TEMPLATE[template];
  const { data: records } = await admin
    .from('attendance_records')
    .select('person_id,scanned_at,status_code')
    .eq('attendance_date', date).eq('period','morning').eq('person_type','student')
    .eq('status_code', wantedStatus);

  const ids = (records || []).map((r: any) => r.person_id);
  if (ids.length === 0) {
    return NextResponse.json({ requested: 0, sent: 0, failed: 0, skipped_no_phone: 0 });
  }
  const timeByStudent = new Map<string, string>((records || []).map((r: any) => [r.person_id, r.scanned_at]));

  const { data: students } = await admin
    .from('students')
    .select('id,full_name,section,parent_phone,guardian_phone')
    .in('id', ids).eq('section', 'day');   // second guard so we never SMS a boarding parent from this bulk

  const { data: settingsRows } = await admin
    .from('attendance_settings').select('key,value')
    .in('key', ['sms_enabled', TEMPLATE_KEY[template]]);
  const kv: Record<string, any> = {};
  for (const r of settingsRows || []) kv[r.key] = unwrap(r.value);
  if (kv.sms_enabled === 'false' || (settingsRows || []).find(x => x.key === 'sms_enabled')?.value === false) {
    return NextResponse.json({ error: 'SMS is disabled in Attendance Settings.' }, { status: 400 });
  }
  const rawTemplate = kv[TEMPLATE_KEY[template]] || '';
  if (!rawTemplate.trim()) {
    return NextResponse.json({ error: 'The template for this SMS is empty. Fill it in under Settings.' }, { status: 400 });
  }

  let sent = 0, failed = 0, skipped_no_phone = 0;
  const logRows: any[] = [];

  await Promise.all((students || []).map(async (s: any) => {
    const phone = s.parent_phone || s.guardian_phone;
    if (!phone) { skipped_no_phone++; return; }
    const scannedAtIso = timeByStudent.get(s.id);
    const time = scannedAtIso
      ? new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(scannedAtIso))
      : new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date());
    const message = render(rawTemplate, { student_name: s.full_name, time, date });
    const result = await sendBestBulkSms(phone, message);
    if (result.ok) sent++; else failed++;
    logRows.push({
      student_id: s.id,
      parent_phone: result.to,
      template_kind: template,
      message,
      status: result.ok ? 'sent' : 'failed',
      provider_response: 'bulk-' + template + ': ' + result.providerResponse,
      sent_by: user.id,
    });
  }));

  if (logRows.length) await admin.from('attendance_sms_log').insert(logRows);

  return NextResponse.json({
    requested: (students || []).length,
    sent, failed, skipped_no_phone,
  });
}
