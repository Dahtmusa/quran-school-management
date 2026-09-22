import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role || '';
  if (!['security', 'admin', 'super_admin', 'principal'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 });

  // Try parsing as JSON QR payload: { institution, type, id }
  let jsonId: string | null = null;
  let jsonType: 'student' | 'staff' | null = null;
  try {
    const parsed = JSON.parse(q);
    if (parsed?.institution === 'AMQM' && parsed?.id) {
      jsonId = parsed.id;
      jsonType = ['STAFF','MANAGEMENT'].includes(String(parsed.type).toUpperCase()) ? 'staff' : 'student';
    }
  } catch { /* not JSON */ }

  if (jsonId) {
    if (jsonType === 'staff') {
      const { data } = await admin
        .from('profiles')
        .select('id,full_name,role,avatar_url,staff_id')
        .eq('id', jsonId)
        .single();
      if (data) return NextResponse.json({ type: 'staff', id: data.id, name: data.full_name, role: data.role, photoUrl: data.avatar_url });
    } else {
      const { data } = await admin
        .from('students')
        .select('id,full_name,admission_no,section,photo_url,classes:class_id(name)')
        .eq('id', jsonId)
        .single();
      if (data) return NextResponse.json({
        type: 'student', id: data.id, name: data.full_name,
        admissionNo: data.admission_no, section: data.section,
        photoUrl: data.photo_url,
        className: (data.classes as any)?.name || null,
      });
    }
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Raw text fallback: search by admission_no or staff_id.
  // Strip characters with special meaning in PostgREST filter syntax before
  // splicing user input into a raw .or() filter string.
  const safeQ = q.replace(/[,.()]/g, '');
  const [studentsRes, staffRes] = await Promise.all([
    admin
      .from('students')
      .select('id,full_name,admission_no,section,photo_url,classes:class_id(name)')
      .or(`admission_no.eq.${safeQ},student_id_number.eq.${safeQ}`)
      .limit(1)
      .maybeSingle(),
    admin
      .from('profiles')
      .select('id,full_name,role,avatar_url,staff_id')
      .or(`staff_id.eq.${safeQ}`)
      .limit(1)
      .maybeSingle(),
  ]);

  if (studentsRes.data) {
    const d = studentsRes.data;
    return NextResponse.json({
      type: 'student', id: d.id, name: d.full_name,
      admissionNo: d.admission_no, section: d.section,
      photoUrl: d.photo_url,
      className: (d.classes as any)?.name || null,
    });
  }

  if (staffRes.data) {
    const d = staffRes.data;
    return NextResponse.json({ type: 'staff', id: d.id, name: d.full_name, role: d.role, photoUrl: d.avatar_url });
  }

  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}
