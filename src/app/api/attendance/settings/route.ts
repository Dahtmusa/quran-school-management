// Read/write the singleton attendance settings. Whitelisted keys only so the
// admin UI cannot inject arbitrary rows.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ADMIN_ROLES = ['admin','super_admin','principal'];

const KEYS = [
  'morning_cutoff_time',
  'staff_late_fine_ngn',
  'staff_absent_fine_ngn',
  'sms_enabled',
  'sms_arrival_template',
  'sms_late_template',
  'sms_absent_template',
  'school_payment_account',
] as const;
type Key = typeof KEYS[number];

function unwrap(value: any): any {
  // Values are stored as JSONB; strings arrive quoted. Numbers/booleans arrive raw.
  if (typeof value === 'string') return value.replace(/^"|"$/g, '');
  return value;
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!ADMIN_ROLES.includes(viewer?.role || '')) {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('attendance_settings')
    .select('key,value')
    .in('key', KEYS as unknown as string[]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out: Record<string, any> = {
    morning_cutoff_time: '08:30',
    staff_late_fine_ngn: 500,
    staff_absent_fine_ngn: 2000,
    sms_enabled: true,
    sms_arrival_template: '',
    sms_late_template: '',
    sms_absent_template: '',
    school_payment_account: '',
  };
  for (const row of data || []) out[row.key] = unwrap(row.value);
  return NextResponse.json(out);
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!ADMIN_ROLES.includes(viewer?.role || '')) {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();
  const rows: { key: string; value: any }[] = [];
  for (const key of KEYS) {
    if (!(key in body)) continue;
    const raw = body[key as Key];
    let value: any = raw;
    if (key === 'staff_late_fine_ngn' || key === 'staff_absent_fine_ngn') value = Number(raw) || 0;
    else if (key === 'sms_enabled') value = Boolean(raw);
    else value = String(raw ?? '');
    rows.push({ key, value });
  }
  if (rows.length === 0) return NextResponse.json({ error: 'No recognised settings to update.' }, { status: 400 });

  const { error } = await admin.from('attendance_settings').upsert(
    rows.map(r => ({ key: r.key, value: r.value, updated_at: new Date().toISOString() })),
    { onConflict: 'key' },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return the fresh row set so the client can update its form state.
  const { data: fresh } = await admin
    .from('attendance_settings')
    .select('key,value')
    .in('key', KEYS as unknown as string[]);
  const out: Record<string, any> = {};
  for (const row of fresh || []) out[row.key] = unwrap(row.value);
  return NextResponse.json(out);
}
