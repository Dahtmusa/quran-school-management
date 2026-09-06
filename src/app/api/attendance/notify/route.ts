import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type AdminClient = ReturnType<typeof createAdminClient>;

async function loadSettings(admin: AdminClient) {
  const { data } = await admin.from('attendance_settings').select('key,value');
  const out: Record<string, unknown> = {};
  for (const r of data || []) out[r.key] = r.value;
  return out;
}

const stripQ = (v: unknown) => String(v || '').replace(/^"|"$/g, '');

// Normalize Nigerian phone to international format (2348012345678)
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return '234' + digits.slice(1);
  if (digits.length === 10) return '234' + digits; // e.g. 8012345678
  return digits;
}

async function sendTermii(apiKey: string, senderId: string, channel: string, to: string, message: string) {
  // If no custom sender ID, use Termii's default (omit 'from' field)
  const payload: Record<string, unknown> = { api_key: apiKey, to, sms: message, type: 'plain', channel };
  if (senderId && senderId !== 'default' && senderId !== '') payload.from = senderId;
  const res = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || 'Termii error');
  return json;
}

async function sendAfricasTalking(apiKey: string, username: string, senderId: string, to: string, message: string) {
  const params: Record<string, string> = { username, to, message };
  if (senderId) params.from = senderId;
  const body = new URLSearchParams(params);
  const res = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { throw new Error(text.slice(0, 120)); }
  if (!res.ok) throw new Error(String((json?.SMSMessageData as any)?.Message || json?.message || text.slice(0, 120)));
  const recipients: any[] = (json?.SMSMessageData as any)?.Recipients || [];
  const failed = recipients.filter(r => r.status !== 'Success');
  if (failed.length > 0) throw new Error(failed.map(r => r.status).join(', '));
  return json;
}

async function sendSmartSMS(apiKey: string, senderId: string, to: string, message: string) {
  const res = await fetch('https://www.smartsmssolutions.com/api/json.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: apiKey, sender: senderId, to, message, type: 0, routing: 3 }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { throw new Error(`SmartSMS error: ${text}`); }
  if (json.code !== '1000') throw new Error(String(json.description || json.message || 'SmartSMS error'));
  return json;
}

async function sendTwilio(accountSid: string, authToken: string, from: string, to: string, message: string, apiKeySid?: string, apiKeySecret?: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({ To: to, From: from, Body: message });
  // Use API Key auth if provided, otherwise fall back to Account SID + Auth Token
  const username = apiKeySid || accountSid;
  const password = apiKeySecret || authToken;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || json?.code || 'Twilio error');
  return json;
}

async function dispatchSms(settings: Record<string, unknown>, to: string, message: string) {
  to = normalizePhone(to);
  const provider = stripQ(settings['sms_provider']) || 'termii';
  const apiKey = stripQ(settings['sms_api_key']);
  const senderId = stripQ(settings['sms_sender_id']) || 'AMQM';
  if (!apiKey) throw new Error('SMS API key not configured');

  if (provider === 'termii') {
    const channel = stripQ(settings['sms_channel']) || 'generic';
    await sendTermii(apiKey, senderId, channel, to, message);
  } else if (provider === 'africas_talking') {
    const username = stripQ(settings['sms_username']);
    await sendAfricasTalking(apiKey, username, senderId, to, message);
  } else if (provider === 'smartsms') {
    await sendSmartSMS(apiKey, senderId, to, message);
  } else if (provider === 'twilio') {
    const accountSid = stripQ(settings['sms_account_sid']);
    const authToken = stripQ(settings['sms_auth_token']);
    const apiKeySid = stripQ(settings['sms_api_key_sid']);
    const apiKeySecret = stripQ(settings['sms_api_key_secret']);
    await sendTwilio(accountSid, authToken, senderId, to, message, apiKeySid || undefined, apiKeySecret || undefined);
  } else {
    throw new Error(`Unknown provider: ${provider}`);
  }
}

function buildMessage(template: string, studentName: string, statusCode: string, scannedAt: string) {
  const scanDate = new Date(scannedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const scanTime = new Date(scannedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return template
    .replace(/{student_name}/g, studentName)
    .replace(/{date}/g, scanDate)
    .replace(/{time}/g, scanTime)
    .replace(/{scan_time}/g, scanTime)
    .replace(/{status}/g, statusCode.toUpperCase());
}

// POST /api/attendance/notify
// Single: { recordId, manual? }
// Bulk:   { bulk: true, date?, period? } — sends to all approved unsent records for the day
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!['admin', 'super_admin', 'principal'].includes(profile?.role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const admin = createAdminClient();
  const settings = await loadSettings(admin);

  if (!settings['sms_enabled']) {
    return NextResponse.json({ error: 'SMS is disabled in settings' }, { status: 400 });
  }

  // ── BULK MODE ──────────────────────────────────────────────────────────────
  if (body.bulk) {
    const nigeriaMs = Date.now() + 60 * 60 * 1000;
    const date = body.date || new Date(nigeriaMs).toISOString().slice(0, 10);
    const period = body.period || 'morning';

    // All approved, unsent student records for the day
    const { data: records } = await admin
      .from('attendance_records')
      .select('id, person_id, status_code, scanned_at, notification_sent')
      .eq('attendance_date', date)
      .eq('period', period)
      .eq('person_type', 'student')
      .eq('review_status', 'approved');

    if (!records || records.length === 0) {
      return NextResponse.json({ success: true, sent: 0, skipped: 0, failed: 0, message: 'No approved records found for this date' });
    }

    // Load all templates at once
    const { data: templates } = await admin.from('notification_templates').select('code,template');
    const tplMap: Record<string, string> = {};
    for (const t of templates || []) tplMap[t.code] = t.template;

    // Load all student info + parent phones for these records
    const studentIds = records.map(r => r.person_id);
    const { data: students } = await admin
      .from('students')
      .select('id, full_name, parent_phone, guardian_phone, parent_students(profiles(phone))')
      .in('id', studentIds);
    const studentMap: Record<string, { name: string; phone: string | null }> = {};
    for (const s of students || []) {
      // 1. Linked parent user account phone
      const parents = (s as any).parent_students || [];
      let phone: string | null = null;
      for (const ps of parents) {
        if (ps?.profiles?.phone) { phone = ps.profiles.phone; break; }
      }
      // 2. Fall back to parent_phone / guardian_phone on student record
      if (!phone) phone = (s as any).parent_phone || (s as any).guardian_phone || null;
      studentMap[s.id] = { name: s.full_name, phone };
    }

    let sent = 0, failed = 0, skipped = 0;
    const errors: string[] = [];

    for (const rec of records) {
      if (rec.notification_sent) { skipped++; continue; }
      const info = studentMap[rec.person_id];
      if (!info?.phone) { skipped++; continue; }

      const defaultTpl = `Dear parent, {student_name} was marked {status} on {date} at {scan_time}. - AMQM`;
      const tpl = tplMap[rec.status_code] || defaultTpl;
      const message = buildMessage(tpl, info.name, rec.status_code, rec.scanned_at);

      const { data: notif } = await admin
        .from('attendance_notifications')
        .insert({ record_id: rec.id, phone_number: info.phone, message, status: 'pending' })
        .select('id').single();

      try {
        await dispatchSms(settings, info.phone, message);
        await admin.from('attendance_notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', notif!.id);
        await admin.from('attendance_records').update({ notification_sent: true }).eq('id', rec.id);
        sent++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        await admin.from('attendance_notifications').update({ status: 'failed', error_message: msg }).eq('id', notif!.id);
        errors.push(`${info.name}: ${msg}`);
        failed++;
      }
    }

    return NextResponse.json({ success: true, sent, skipped, failed, errors: errors.slice(0, 5) });
  }

  // ── SINGLE MODE ────────────────────────────────────────────────────────────
  const { recordId, manual = false } = body;
  if (!recordId) return NextResponse.json({ error: 'recordId required' }, { status: 400 });

  const { data: record } = await admin
    .from('attendance_records')
    .select('id, person_id, person_type, scanned_at, status_code, review_status, notification_sent')
    .eq('id', recordId)
    .single();

  if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  if (record.review_status !== 'approved') return NextResponse.json({ error: 'Record must be approved before sending SMS' }, { status: 400 });
  if (record.notification_sent) return NextResponse.json({ error: 'Notification already sent for this record' }, { status: 400 });

  if (!manual) {
    const sendOn: string[] = (settings['sms_send_on_status'] as string[]) || ['absent', 'late'];
    if (!sendOn.includes(record.status_code)) {
      return NextResponse.json({ error: `Status "${record.status_code}" does not trigger SMS` }, { status: 400 });
    }
  }

  let studentName = 'your child';
  let parentPhone: string | null = null;

  if (record.person_type === 'student') {
    const { data: student } = await admin
      .from('students')
      .select('full_name, parent_phone, guardian_phone, parent_students(profiles(phone))')
      .eq('id', record.person_id)
      .single();
    if (student) {
      studentName = student.full_name;
      // 1. Check linked parent user accounts
      const parents = (student as any).parent_students || [];
      for (const ps of parents) {
        const phone = ps?.profiles?.phone;
        if (phone) { parentPhone = phone; break; }
      }
      // 2. Fall back to parent_phone / guardian_phone stored on student record
      if (!parentPhone) parentPhone = (student as any).parent_phone || (student as any).guardian_phone || null;
    }
  }

  if (!parentPhone) return NextResponse.json({ error: 'No parent phone number on file for this student' }, { status: 400 });

  const { data: tpl } = await admin.from('notification_templates').select('template').eq('code', record.status_code).single();
  const defaultTpl = `Dear parent, {student_name} was marked {status} on {date} at {scan_time}. - AMQM`;
  const message = buildMessage(tpl?.template || defaultTpl, studentName, record.status_code, record.scanned_at);

  const { data: notif } = await admin
    .from('attendance_notifications')
    .insert({ record_id: recordId, phone_number: parentPhone, message, status: 'pending' })
    .select('id').single();

  try {
    await dispatchSms(settings, parentPhone, message);
    await admin.from('attendance_notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', notif!.id);
    await admin.from('attendance_records').update({ notification_sent: true }).eq('id', recordId);
    return NextResponse.json({ success: true, sentTo: parentPhone });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await admin.from('attendance_notifications').update({ status: 'failed', error_message: msg }).eq('id', notif!.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
