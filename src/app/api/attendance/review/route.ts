import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  const role = profile?.role || '';
  if (!['admin', 'super_admin', 'principal'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  const body = await req.json();
  const { recordId, action, newStatusCode, newReviewStatus, note } = body;

  if (!recordId || !action) {
    return NextResponse.json({ error: 'recordId and action required' }, { status: 400 });
  }

  const validActions = ['approve', 'reject', 'change_status', 'add_note'];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  // Fetch current record
  const { data: current } = await supabase
    .from('attendance_records')
    .select('id, status_code, review_status, person_id, person_type, scanned_at')
    .eq('id', recordId)
    .single();

  if (!current) return NextResponse.json({ error: 'Record not found' }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (action === 'approve') updates.review_status = 'approved';
  if (action === 'reject') updates.review_status = 'rejected';
  if (action === 'change_status') {
    if (!newStatusCode) return NextResponse.json({ error: 'newStatusCode required' }, { status: 400 });
    updates.status_code = newStatusCode;
    if (newReviewStatus) updates.review_status = newReviewStatus;
  }
  if (note !== undefined) updates.note = note;

  const { error } = await supabase
    .from('attendance_records')
    .update(updates)
    .eq('id', recordId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Record the review action
  await supabase.from('attendance_reviews').insert({
    record_id: recordId,
    previous_status: current.status_code,
    new_status: (updates.status_code as string) || current.status_code,
    previous_review: current.review_status,
    new_review: (updates.review_status as string) || current.review_status,
    action,
    performed_by: user.id,
    note: note || null,
  });

  // Audit log
  await supabase.from('attendance_audit_logs').insert({
    record_id: recordId,
    user_id: user.id,
    user_role: role,
    action,
    previous_value: { statusCode: current.status_code, reviewStatus: current.review_status },
    new_value: updates,
  });

  return NextResponse.json({ success: true });
}
