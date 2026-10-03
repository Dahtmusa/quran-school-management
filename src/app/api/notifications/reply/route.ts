// Post a reply to a notification. The RPC resolves the recipient of the
// reply (the other party in the thread) and creates a notification row
// addressed to them, so the thread naturally shows up in their bell.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parentId = String(body?.parentId || '');
  const text     = String(body?.body     || '').trim();
  if (!parentId) return NextResponse.json({ error: 'parentId required.' }, { status: 400 });
  if (!text)     return NextResponse.json({ error: 'Reply body is empty.' }, { status: 400 });

  const { data, error } = await supabase.rpc('reply_to_notification', { p_parent_id: parentId, p_body: text });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data });
}
