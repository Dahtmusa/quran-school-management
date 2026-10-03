// The signed-in user's recent notifications + unread count. Powers the
// bell badge and dropdown in the Topbar.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 15));
  const [rowsRes, countRes] = await Promise.all([
    supabase
      .from('notifications')
      .select('id,kind,title,body,link,read_at,created_at')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.rpc('my_unread_notifications_count'),
  ]);

  const err = rowsRes.error || countRes.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  return NextResponse.json({
    unread: Number(countRes.data || 0),
    items:  rowsRes.data || [],
  });
}
