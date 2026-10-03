// Admin → compose a custom SMS and send it to a set of parents or
// teachers, picked by their profile/student ids. For parents the lookup
// uses the student table's parent_phone/guardian_phone; for teachers it
// uses the staff profile's phone.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendBestBulkSms } from '@/lib/sms/bestbulksms';

const ADMIN_ROLES = ['super_admin','admin','principal'];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!ADMIN_ROLES.includes(viewer?.role || '')) {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const group       = String(body?.group || '');            // 'parents' | 'teachers'
  const recipientIds: string[] = Array.isArray(body?.recipientIds) ? body.recipientIds.filter((x: any) => typeof x === 'string') : [];
  const message     = String(body?.message || '').trim();

  if (!['parents','teachers'].includes(group)) return NextResponse.json({ error: 'group must be parents or teachers.' }, { status: 400 });
  if (!recipientIds.length) return NextResponse.json({ error: 'Pick at least one recipient.' }, { status: 400 });
  if (!message)             return NextResponse.json({ error: 'Message is empty.' }, { status: 400 });

  const admin = createAdminClient();
  type Recipient = { id: string; name: string; phone: string | null };
  let recipients: Recipient[] = [];

  if (group === 'parents') {
    const { data } = await admin
      .from('students')
      .select('id,full_name,parent_name,parent_phone,guardian_phone')
      .in('id', recipientIds);
    recipients = (data || []).map((s: any) => ({
      id: s.id,
      name: s.parent_name || 'Parent of ' + s.full_name,
      phone: s.parent_phone || s.guardian_phone || null,
    }));
  } else {
    const { data } = await admin
      .from('profiles')
      .select('id,full_name,phone')
      .in('id', recipientIds);
    recipients = (data || []).map((p: any) => ({ id: p.id, name: p.full_name, phone: p.phone || null }));
  }

  let sent = 0, failed = 0, skippedNoPhone = 0;
  const logRows: any[] = [];
  await Promise.all(recipients.map(async r => {
    if (!r.phone) { skippedNoPhone++; return; }
    const result = await sendBestBulkSms(r.phone, message);
    if (result.ok) sent++; else failed++;
    logRows.push({
      student_id: group === 'parents' ? r.id : null,
      parent_phone: result.to,
      template_kind: 'custom',
      message,
      status: result.ok ? 'sent' : 'failed',
      provider_response: group + '-sms: ' + result.providerResponse,
      sent_by: user.id,
    });
  }));
  if (logRows.length) await admin.from('attendance_sms_log').insert(logRows);

  return NextResponse.json({
    requested: recipients.length,
    sent, failed, skipped_no_phone: skippedNoPhone,
  });
}
