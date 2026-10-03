// Bulk SMS fee reminder to the selected students' parents. Each SMS is
// personalised with the child's name and the current outstanding balance
// summed across every fee structure.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendBestBulkSms } from '@/lib/sms/bestbulksms';

const ADMIN_ROLES = ['super_admin','admin','principal','finance'];

const DEFAULT_TEMPLATE =
  'Assalamu alaikum {parent_name}. This is AMQM. Our records show an outstanding fee balance of ₦{outstanding} for {student_name}. Please settle at your earliest convenience. Thank you.';

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? '{' + k + '}');
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
  const studentIds: string[] = Array.isArray(body?.studentIds) ? body.studentIds.filter((x: any) => typeof x === 'string') : [];
  const template = String(body?.template || DEFAULT_TEMPLATE);
  if (!studentIds.length) return NextResponse.json({ error: 'Pick at least one student.' }, { status: 400 });

  const admin = createAdminClient();

  // Fetch outstanding totals + student / parent info in one go.
  const [{ data: students }, { data: fees }] = await Promise.all([
    admin.from('students')
      .select('id,full_name,parent_name,parent_phone,guardian_phone')
      .in('id', studentIds),
    admin.from('student_fees')
      .select('student_id,amount_due,amount_paid')
      .in('student_id', studentIds),
  ]);

  const outstandingByStudent = new Map<string, number>();
  for (const f of fees || []) {
    const bal = Math.max(0, Number((f as any).amount_due || 0) - Number((f as any).amount_paid || 0));
    outstandingByStudent.set((f as any).student_id, (outstandingByStudent.get((f as any).student_id) || 0) + bal);
  }

  let sent = 0, failed = 0, skippedNoPhone = 0, skippedNoBalance = 0;
  const logRows: any[] = [];
  const perStudentResult: any[] = [];

  await Promise.all((students || []).map(async (s: any) => {
    const phone = s.parent_phone || s.guardian_phone;
    const outstanding = outstandingByStudent.get(s.id) || 0;
    if (outstanding <= 0) { skippedNoBalance++; perStudentResult.push({ student_id: s.id, status: 'skipped_no_balance' }); return; }
    if (!phone) { skippedNoPhone++; perStudentResult.push({ student_id: s.id, status: 'skipped_no_phone' }); return; }

    const message = render(template, {
      student_name: s.full_name,
      parent_name:  s.parent_name || 'Parent',
      outstanding:  outstanding.toLocaleString('en-NG'),
    });
    const result = await sendBestBulkSms(phone, message);
    if (result.ok) sent++; else failed++;
    perStudentResult.push({ student_id: s.id, status: result.ok ? 'sent' : 'failed' });
    logRows.push({
      student_id: s.id,
      parent_phone: result.to,
      template_kind: 'custom',
      message,
      status: result.ok ? 'sent' : 'failed',
      provider_response: 'fee-reminder: ' + result.providerResponse,
      sent_by: user.id,
    });
  }));

  if (logRows.length) await admin.from('attendance_sms_log').insert(logRows);

  return NextResponse.json({
    requested: (students || []).length,
    sent, failed,
    skipped_no_phone: skippedNoPhone,
    skipped_no_balance: skippedNoBalance,
    details: perStudentResult,
  });
}
