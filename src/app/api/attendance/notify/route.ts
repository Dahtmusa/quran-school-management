import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Load all attendance_settings as a plain object
async function loadSettings(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.from('attendance_settings').select('key,value');
  const out: Record<string, unknown> = {};
  for (const r of data || []) out[r.key] = r.value;
  return out;
}

// Send via Termii
async function sendTermii(apiKey: string, senderId: string, channel: string, to: string, message: string) {
  const res = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, to, from: senderId, sms: message, type: 'plain', channel }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || 'Termii error');
  return json;
}

// Send via Africa's Talking
async function sendAfricasTalking(apiKey: string, username: string, senderId: string, to: string, message: string) {
  const body = new URLSearchParams({ username, to, message, from: senderId });
  const res = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.SMSMessageData?.Message || 'Africa\'s Talking error');
  return json;
}

// Send via SmartSMSSolutions
async function sendSmartSMS(apiKey: string, senderId: string, to: string, message: string) {
  const url = new URL('https://www.smartsmssolutions.com/api/json.php');
  url.searchParams.set('username', '');
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

// Send via Twilio
async function sendTwilio(accountSid: string, authToken: string, from: string, to: string, message: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({ To: to, From: from, Body: message });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || 'Twilio error');
  return json;
}

// POST /api/attendance/notify
// Body: { recordId } — sends SMS for a single approved attendance record
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!['admin', 'super_admin', 'principal'].includes(profile?.role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { recordId } = await req.json();
  if (!recordId) return NextResponse.json({ error: 'recordId required' }, { status: 400 });

  const admin = createAdminClient();
  const settings = await loadSettings(admin);

  if (!settings['sms_enabled']) {
    return NextResponse.json({ error: 'SMS is disabled in settings' }, { status: 400 });
  }

  // Load the attendance record
  const { data: record } = await admin
    .from('attendance_records')
    .select('id, person_id, person_type, scanned_at, status_code, review_status, notification_sent')
    .eq('id', recordId)
    .single();

  if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  if (record.review_status !== 'approved') {
    return NextResponse.json({ error: 'Record must be approved before sending SMS' }, { status: 400 });
  }
  if (record.notification_sent) {
    return NextResponse.json({ error: 'Notification already sent for this record' }, { status: 400 });
  }

  // Check this status should trigger SMS
  const sendOn: string[] = (settings['sms_send_on_status'] as string[]) || ['absent', 'late'];
  if (!sendOn.includes(record.status_code)) {
    return NextResponse.json({ error: `Status "${record.status_code}" does not trigger SMS` }, { status: 400 });
  }

  // Load student + parent phone
  let studentName = 'your child';
  let parentPhone: string | null = null;

  if (record.person_type === 'student') {
    const { data: student } = await admin
      .from('students')
      .select('full_name, parent_students(profiles(phone))')
      .eq('id', record.person_id)
      .single();

    if (student) {
      studentName = student.full_name;
      const parents = (student as any).parent_students || [];
      for (const ps of parents) {
        const phone = ps?.profiles?.phone;
        if (phone) { parentPhone = phone; break; }
      }
    }
  }

  if (!parentPhone) {
    return NextResponse.json({ error: 'No parent phone number on file for this student' }, { status: 400 });
  }

  // Load template
  const { data: tpl } = await admin
    .from('notification_templates')
    .select('template')
    .eq('code', record.status_code)
    .single();

  const scanDate = new Date(record.scanned_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const scanTime = new Date(record.scanned_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const message = (tpl?.template || `Dear parent, {student_name} was marked {status} on {date} at {scan_time}.`)
    .replace(/{student_name}/g, studentName)
    .replace(/{date}/g, scanDate)
    .replace(/{time}/g, scanTime)
    .replace(/{scan_time}/g, scanTime)
    .replace(/{status}/g, record.status_code.toUpperCase());

  // Create notification record
  const { data: notif } = await admin
    .from('attendance_notifications')
    .insert({ record_id: recordId, phone_number: parentPhone, message, status: 'pending' })
    .select('id')
    .single();

  // Send via configured provider
  const provider = String(settings['sms_provider'] || 'termii');
  const apiKey = String(settings['sms_api_key'] || '');
  const senderId = String(settings['sms_sender_id'] || 'AMQM');

  if (!apiKey) {
    await admin.from('attendance_notifications').update({ status: 'failed', error_message: 'No API key configured' }).eq('id', notif!.id);
    return NextResponse.json({ error: 'SMS API key not configured' }, { status: 400 });
  }

  try {
    if (provider === 'termii') {
      const channel = String(settings['sms_channel'] || 'generic');
      await sendTermii(apiKey, senderId, channel, parentPhone, message);
    } else if (provider === 'africas_talking') {
      const username = String(settings['sms_username'] || '');
      await sendAfricasTalking(apiKey, username, senderId, parentPhone, message);
    } else if (provider === 'smartsms') {
      await sendSmartSMS(apiKey, senderId, parentPhone, message);
    } else if (provider === 'twilio') {
      const accountSid = String(settings['sms_account_sid'] || '');
      const authToken = String(settings['sms_auth_token'] || '');
      await sendTwilio(accountSid, authToken, senderId, parentPhone, message);
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    // Mark as sent
    await admin.from('attendance_notifications').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', notif!.id);
    await admin.from('attendance_records').update({ notification_sent: true }).eq('id', recordId);

    return NextResponse.json({ success: true, sentTo: parentPhone });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    await admin.from('attendance_notifications').update({ status: 'failed', error_message: msg }).eq('id', notif!.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
