// Admin → one or more staff (typically teachers) → in-app notification.
// Shows up in each recipient's bell with the title, body and optional
// deep-link (link) they can click to jump to the relevant screen.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
  const recipientIds: string[] = Array.isArray(body?.recipientIds) ? body.recipientIds.filter((x: any) => typeof x === 'string') : [];
  const title = String(body?.title || '').trim();
  const text  = String(body?.body  || '').trim();
  const link  = String(body?.link  || '').trim();
  const kind  = String(body?.kind  || 'announcement').trim();

  if (recipientIds.length === 0) return NextResponse.json({ error: 'Pick at least one recipient.' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });

  const { data, error } = await supabase.rpc('admin_broadcast_notification', {
    p_recipient_ids: recipientIds,
    p_title: title,
    p_body:  text || null,
    p_link:  link || null,
    p_kind:  kind,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ created: Number(data || 0) });
}
