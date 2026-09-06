import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['super_admin', 'admin', 'principal'].includes(profile.role)) return null;
  return user;
}

// GET /api/admin/users — list all users with their profiles
export async function GET() {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const admin = createAdminClient();

  // List auth users (paginated, up to 1000)
  const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get all profiles for extra fields
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, role, phone, staff_number');

  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));

  const result = users.map(u => ({
    id: u.id,
    email: u.email,
    fullName: profileMap[u.id]?.full_name || null,
    role: profileMap[u.id]?.role || null,
    phone: profileMap[u.id]?.phone || null,
    staffNumber: profileMap[u.id]?.staff_number || null,
    banned: u.banned_until ? new Date(u.banned_until) > new Date() : false,
    createdAt: u.created_at,
    lastSignIn: u.last_sign_in_at,
  }));

  return NextResponse.json({ users: result });
}

// POST /api/admin/users — create a new user
export async function POST(req: NextRequest) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email, password, fullName, role, phone } = await req.json();
  if (!email || !password || !role) {
    return NextResponse.json({ error: 'email, password and role are required' }, { status: 400 });
  }

  const validRoles = ['super_admin', 'admin', 'principal', 'teacher', 'security', 'finance', 'admissions', 'parent'];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Create auth user
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email verification
    user_metadata: { full_name: fullName },
  });

  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 400 });

  // Upsert profile row (trigger may have created it already)
  await admin.from('profiles').upsert({
    id: created.user.id,
    full_name: fullName || null,
    role,
    phone: phone || null,
  }, { onConflict: 'id' });

  return NextResponse.json({ success: true, userId: created.user.id });
}
