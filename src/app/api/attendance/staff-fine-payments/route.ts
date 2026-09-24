// Admin: GET drills into one staff member's fines + payments; POST records
// a new payment. Balance recomputes automatically on next fetch.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_ROLES = ['admin','super_admin','principal','finance'];

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!ADMIN_ROLES.includes(viewer?.role || '')) {
    return { error: NextResponse.json({ error: 'Administrator access required.' }, { status: 403 }) };
  }
  return { supabase };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if ('error' in gate) return gate.error;
  const staffId = req.nextUrl.searchParams.get('staffId') || '';
  if (!staffId) return NextResponse.json({ error: 'staffId required.' }, { status: 400 });

  const { data, error } = await gate.supabase.rpc('admin_staff_fines_detail', { p_staff_id: staffId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ('error' in gate) return gate.error;

  const body = await req.json().catch(() => ({}));
  const staffId = String(body?.staffId || '');
  const amount  = Number(body?.amount);
  const paidOn  = body?.paidOn ? String(body.paidOn) : null;
  const method  = body?.method ? String(body.method) : null;
  const note    = body?.note   ? String(body.note)   : null;

  if (!staffId) return NextResponse.json({ error: 'staffId required.' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be greater than zero.' }, { status: 400 });
  }

  const { data, error } = await gate.supabase.rpc('admin_record_staff_fine_payment', {
    p_staff_id: staffId,
    p_amount:   amount,
    p_paid_on:  paidOn,
    p_method:   method,
    p_note:     note,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data });
}
