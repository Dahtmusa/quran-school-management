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

// GET /api/attendance/settings — read all settings as flat key/value
export async function GET() {
  const supabase = await requireAdmin();
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data } = await supabase.from('attendance_settings').select('key,value');
  const settings: Record<string, string> = {};
  for (const r of data || []) {
    // value is JSONB — unwrap strings/booleans to plain string for the UI
    const v = r.value;
    settings[r.key] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return NextResponse.json({ settings });
}

// POST /api/attendance/settings — upsert a batch of settings
export async function POST(req: NextRequest) {
  const supabase = await requireAdmin();
  if (!supabase) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { settings } = await req.json() as { settings: Record<string, string> };
  if (!settings || typeof settings !== 'object') {
    return NextResponse.json({ error: 'settings object required' }, { status: 400 });
  }

  const rows = Object.entries(settings).map(([key, value]) => ({
    key,
    // Store as JSONB — wrap plain strings in quotes so they're valid JSON
    value: (() => { try { JSON.parse(value); return value; } catch { return JSON.stringify(value); } })(),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('attendance_settings')
    .upsert(rows, { onConflict: 'key' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
