import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['super_admin', 'admin', 'principal'].includes(profile.role)) return null;
  return { id: user.id, role: profile.role as string };
}

// PATCH /api/admin/users/[id] — update role, name, phone, or ban/unban
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { role, fullName, phone, banned } = body;

  const admin = createAdminClient();

  // Only a super_admin may modify a super_admin account (including their own
  // role/ban/password), or promote anyone to super_admin — otherwise a
  // compromised admin/principal account could take over the top-level tier.
  if (caller.role !== 'super_admin') {
    const { data: target } = await admin.from('profiles').select('role').eq('id', id).maybeSingle();
    if (target?.role === 'super_admin' || role === 'super_admin') {
      return NextResponse.json({ error: 'Only a super administrator can modify a super administrator account' }, { status: 403 });
    }
  }

  // Update profile fields (full_name is NOT NULL — skip update if blank)
  const profileUpdates: Record<string, unknown> = {};
  if (role !== undefined) profileUpdates.role = role;
  if (fullName !== undefined && fullName !== null && fullName !== '') profileUpdates.full_name = fullName;
  if (phone !== undefined) profileUpdates.phone = phone || null;

  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await admin.from('profiles').update(profileUpdates).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Ban or unban the auth user
  if (banned !== undefined) {
    const { error } = await admin.auth.admin.updateUserById(id, {
      ban_duration: banned ? '876600h' : 'none', // 876600h ≈ 100 years = effectively permanent ban
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reset password if provided
  if (body.newPassword) {
    const { error } = await admin.auth.admin.updateUserById(id, { password: body.newPassword });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/users/[id] — permanently delete
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await requireAdmin();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // Prevent self-deletion
  if (id === caller.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  const admin = createAdminClient();

  if (caller.role !== 'super_admin') {
    const { data: target } = await admin.from('profiles').select('role').eq('id', id).maybeSingle();
    if (target?.role === 'super_admin') {
      return NextResponse.json({ error: 'Only a super administrator can delete a super administrator account' }, { status: 403 });
    }
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
