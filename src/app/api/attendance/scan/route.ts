// Gate scanner endpoint. The client sends the raw barcode / QR string; we
// resolve it to a Day-Student or ordinary Staff record, then insert an
// attendance_records row via the SECURITY DEFINER v2 RPC.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendBestBulkSms } from '@/lib/sms/bestbulksms';

const GATE_ROLES = ['security','admin','super_admin','principal'];

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

/** Fire-and-forget "late arrival" SMS to the day-student's parent. Runs
 * only when the fresh gate scan produced a `late` status. Never blocks
 * the response to the gate scanner — a failure here is logged and moves
 * on so the gate keeps flowing. */
async function autoSendLateSms(studentId: string, scannedAtIso: string, actorId: string) {
  try {
    const admin = createAdminClient();
    const [{ data: student }, { data: settings }] = await Promise.all([
      admin.from('students')
        .select('id,full_name,section,parent_phone,guardian_phone')
        .eq('id', studentId).maybeSingle(),
      admin.from('attendance_settings').select('key,value')
        .in('key', ['sms_enabled','sms_late_template']),
    ]);
    if (!student || String(student.section || '').toLowerCase() !== 'day') return;
    const phone = student.parent_phone || student.guardian_phone;
    if (!phone) return;

    const kv: Record<string, string> = {};
    for (const s of settings || []) kv[s.key] = unwrap(s.value);
    if (kv.sms_enabled === 'false' || (settings || []).find(x => x.key === 'sms_enabled')?.value === false) return;

    const message = render(kv.sms_late_template || '', {
      student_name: student.full_name,
      time: new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(scannedAtIso)),
      date: todayLagos(),
    });
    if (!message.trim()) return;

    const result = await sendBestBulkSms(phone, message);
    await admin.from('attendance_sms_log').insert({
      student_id: studentId,
      parent_phone: result.to,
      template_kind: 'late',
      message,
      status: result.ok ? 'sent' : 'failed',
      provider_response: 'auto-late: ' + result.providerResponse,
      sent_by: actorId,
    });
  } catch (err) {
    console.error('[attendance/scan] autoSendLateSms failed', err);
  }
}

function normaliseScan(raw: string): string {
  const trimmed = raw.trim();
  try {
    const p = JSON.parse(trimmed);
    if (p?.institution === 'AMQM' && p?.id) return JSON.stringify(p);
  } catch {}
  return trimmed;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!GATE_ROLES.includes(viewer?.role || '')) {
    return NextResponse.json({ error: 'Gate scanner access required.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = String(body?.value ?? '').trim();
  if (!raw) return NextResponse.json({ error: 'Scan or enter an ID.' }, { status: 400 });

  const { data: matches, error: resolveError } = await supabase.rpc(
    'resolve_amqm_attendance_person',
    { p_input: normaliseScan(raw) },
  );
  if (resolveError) {
    console.error('[attendance/scan] resolve', resolveError);
    return NextResponse.json({ error: 'Could not verify this ID.' }, { status: 500 });
  }
  const person = Array.isArray(matches) ? matches[0] : matches;
  if (!person) {
    return NextResponse.json({
      error: 'ID not found.',
      message: 'This ID is not registered for gate attendance (day student or ordinary staff).',
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
    console.error('[attendance/scan] record', recordError);
    return NextResponse.json({ error: recordError.message || 'Attendance could not be recorded.' }, { status: 400 });
  }
  const row = Array.isArray(result) ? result[0] : result;

  // Auto-notify parents for a fresh Late arrival on a day student. Fire the
  // work but don't await it — the gateman shouldn't wait on the SMS gateway.
  // A row that was already recorded earlier this morning also carries a
  // "late" status_code, so skip when the RPC signaled a duplicate.
  const alreadyRecorded = /already/i.test(row?.message || '');
  if (!alreadyRecorded
      && row?.status_code === 'late'
      && person.person_type === 'student'
      && person.section === 'day') {
    autoSendLateSms(person.person_id, row?.scanned_at ?? new Date().toISOString(), user.id);
  }

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
    message: row?.message ?? 'Attendance recorded.',
  });
}
