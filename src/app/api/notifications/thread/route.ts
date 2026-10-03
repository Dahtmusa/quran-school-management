// Return the full thread (root + every reply) for a given notification id.
// The RPC handles RLS: only participants (or admins) can read a thread.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 });

  const { data: rows, error } = await supabase.rpc('notification_thread', { p_root_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const items = (rows as any[]) || [];
  const senderIds = Array.from(new Set(items.map(r => r.created_by).filter(Boolean))) as string[];
  let names = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles').select('id,full_name').in('id', senderIds);
    names = new Map((profiles || []).map((p: any) => [p.id, p.full_name as string]));
  }
  const withSenders = items.map(r => ({ ...r, sender_name: r.created_by ? (names.get(r.created_by) || 'Admin') : null }));
  return NextResponse.json({ items: withSenders });
}
