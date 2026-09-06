import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!['admin', 'super_admin', 'principal'].includes(profile?.role || '')) return null;
  return supabase;
}

// GET /api/attendance/templates
export async function GET() {
  const supabase = await requireAdmin();
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('notification_templates')
    .select('code, name, template, channel, is_active')
    .order('code');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data || [] });
}

// POST /api/attendance/templates — upsert templates
export async function POST(req: NextRequest) {
  const supabase = await requireAdmin();
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { templates } = await req.json() as {
    templates: { code: string; name: string; template: string; channel: string }[]
  };

  if (!Array.isArray(templates) || templates.length === 0) {
    return NextResponse.json({ error: 'templates array required' }, { status: 400 });
  }

  const rows = templates.map(t => ({
    code: t.code,
    name: t.name,
    template: t.template,
    channel: t.channel || 'sms',
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('notification_templates')
    .upsert(rows, { onConflict: 'code' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
