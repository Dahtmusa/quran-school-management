// Staff fines summary between two dates, using the flat per-status amounts
// configured under Attendance Settings.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADMIN_ROLES = ['admin','super_admin','principal','finance'];

function todayLagos() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}
function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!ADMIN_ROLES.includes(viewer?.role || '')) {
    return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });
  }

  const from = req.nextUrl.searchParams.get('from') || monthStart();
  const to   = req.nextUrl.searchParams.get('to')   || todayLagos();
  if (from > to) return NextResponse.json({ error: 'from must be on or before to.' }, { status: 400 });

  const { data, error } = await supabase.rpc('admin_staff_fines_summary', { p_from: from, p_to: to });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    staff_id: string; full_name: string; staff_no: string | null; job_title: string | null;
    late_count: number; absent_count: number;
    late_fine_ngn: number; absent_fine_ngn: number; total_ngn: number;
  };
  const rows: Row[] = ((data as any[]) || []).map((r: any) => ({
    staff_id: r.staff_id,
    full_name: r.full_name,
    staff_no: r.staff_no,
    job_title: r.job_title,
    late_count: Number(r.late_count) || 0,
    absent_count: Number(r.absent_count) || 0,
    late_fine_ngn: Number(r.late_fine_ngn) || 0,
    absent_fine_ngn: Number(r.absent_fine_ngn) || 0,
    total_ngn: Number(r.total_ngn) || 0,
  }));
  const totals = rows.reduce(
    (acc: { late: number; absent: number; grand: number }, r: Row) => ({
      late: acc.late + r.late_fine_ngn,
      absent: acc.absent + r.absent_fine_ngn,
      grand: acc.grand + r.total_ngn,
    }),
    { late: 0, absent: 0, grand: 0 },
  );
  return NextResponse.json({ from, to, rows, totals });
}
