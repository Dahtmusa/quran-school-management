// Mark one or many of the signed-in user's notifications as read.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string') : [];

  const { data, error } = await supabase.rpc('mark_my_notifications_read', { p_ids: ids.length ? ids : null });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ marked: Number(data || 0) });
}
