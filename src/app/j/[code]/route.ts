// Short-link resolver for screening video-call invites sent via SMS.
// Parents get an SMS like "Join: https://aliyumaimuna.com.ng/j/abcdef123456".
// We look up the admission whose screening_token starts with that code and
// redirect the browser to /admissions/screening/<full-token>. Uses the
// admin client to bypass RLS on admissions (the code itself is the secret).

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const origin = req.nextUrl.origin.replace(/\/$/, '');
  if (!code || code.length < 6) {
    return NextResponse.redirect(origin + '/admissions/track');
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from('admissions')
    .select('screening_token')
    .not('screening_token', 'is', null)
    .like('screening_token', code + '%')
    .limit(1)
    .maybeSingle();

  if (!data?.screening_token) {
    return NextResponse.redirect(origin + '/admissions/track');
  }
  return NextResponse.redirect(origin + '/admissions/screening/' + data.screening_token);
}
