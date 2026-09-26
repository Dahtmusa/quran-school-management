// Send an admissions-related SMS to a parent using a template configured
// under CMS admission_settings. Called from the admin manage page when
// releasing screening results or the admission letter.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendBestBulkSms } from '@/lib/sms/bestbulksms';

const ADMIN_ROLES = ['admin','super_admin','principal','admissions'];

type Kind = 'screening_success' | 'screening_fail' | 'admission_offered' | 'registered' | 'screening_scheduled';

const DEFAULT_TEMPLATES: Record<Kind, string> = {
  screening_success:   'Assalamu alaikum {parent_name}. This is AMQM. {applicant_name} (Ref {application_no}) has PASSED the admissions screening. Please log in to receive the admission letter.',
  screening_fail:      'Assalamu alaikum {parent_name}. This is AMQM. Following screening for {applicant_name} (Ref {application_no}), we are unable to offer admission this session. Please contact the office for details.',
  admission_offered:   'Assalamu alaikum {parent_name}. This is AMQM. An OFFICIAL ADMISSION LETTER has been issued for {applicant_name} (Ref {application_no}). Please collect it from the school or check your email.',
  registered:          'Assalamu alaikum {parent_name}. This is AMQM. Registration is complete for {applicant_name} (Admission No {admission_no}). Welcome to the AMQM family.',
  screening_scheduled: 'AMQM screening for {applicant_name} on {screening_date} {screening_time}. {join_line} Ref {application_no}.',
};

const KEY_BY_KIND: Record<Kind, string> = {
  screening_success:   'sms_screening_success',
  screening_fail:      'sms_screening_fail',
  admission_offered:   'sms_admission_offered',
  registered:          'sms_registered',
  screening_scheduled: 'sms_screening_scheduled',
};

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) => vars[key] ?? '{' + key + '}');
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: viewer } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!ADMIN_ROLES.includes(viewer?.role || '')) {
    return NextResponse.json({ error: 'Admissions or administrator access required.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const applicationId = String(body?.applicationId || '');
  const kind          = String(body?.kind || '') as Kind;
  if (!applicationId) return NextResponse.json({ error: 'applicationId required.' }, { status: 400 });
  if (!(kind in KEY_BY_KIND)) return NextResponse.json({ error: 'Unknown notification kind.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: app } = await admin
    .from('admissions')
    .select('id,application_no,applicant_name,parent_name,parent_phone,guardian_phone,screening_mode,screening_scheduled_at,screening_token,state')
    .eq('id', applicationId).maybeSingle();
  if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  const phone = app.parent_phone || app.guardian_phone;
  if (!phone) return NextResponse.json({ error: 'No parent phone number on file for this application.' }, { status: 400 });

  const { data: setting } = await admin.from('site_settings')
    .select('value').eq('key', 'admission_settings').maybeSingle();
  const cfg: any = (setting?.value as any) || {};
  const template = (typeof cfg?.[KEY_BY_KIND[kind]] === 'string' && cfg[KEY_BY_KIND[kind]].trim())
    ? cfg[KEY_BY_KIND[kind]]
    : DEFAULT_TEMPLATES[kind];

  // Enrolled students receive an admission_no different from application_no.
  const { data: enrolled } = await admin
    .from('students')
    .select('admission_no')
    .eq('admission_no', app.application_no).maybeSingle();

  // Build screening-scheduled specific fields. A "short" join link uses
  // the first 12 chars of the screening_token (24 bytes of entropy in the
  // full token so 48 bits in 12 hex chars still make guessing infeasible
  // for a short-lived screening slot). Route /j/[code] resolves this.
  let screeningDate = '';
  let screeningTime = '';
  let joinLine      = '';
  let joinLink      = '';
  const modeLabel   = app.screening_mode === 'virtual' ? 'Virtual video call' :
                      app.screening_mode === 'physical' ? 'Physical at school' :
                      (String(app.state || '').trim().toLowerCase() === 'adamawa' ? 'Physical at school' : 'Virtual video call');

  if (app.screening_scheduled_at) {
    const d = new Date(app.screening_scheduled_at);
    screeningDate = new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric' }).format(d);
    screeningTime = new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
  }
  if (app.screening_mode === 'virtual' && app.screening_token) {
    // Prefer an explicit site URL env var if the school configured one
    // so SMS links always use the friendly domain (aliyumaimuna.com.ng)
    // instead of whatever Vercel host the request landed on.
    const configured = String(process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
    const origin = (configured || req.nextUrl.origin || '').replace(/\/$/, '');
    joinLink = origin + '/j/' + String(app.screening_token).slice(0, 12);
    joinLine = 'Join: ' + joinLink;
  } else if (app.screening_mode === 'physical') {
    joinLine = 'Please arrive 15 minutes early at the AMQM campus.';
  }

  const message = render(template, {
    applicant_name: app.applicant_name || '',
    parent_name:    app.parent_name    || 'Parent',
    application_no: app.application_no || '',
    admission_no:   enrolled?.admission_no || app.application_no,
    screening_date: screeningDate,
    screening_time: screeningTime,
    mode:           modeLabel,
    join_link:      joinLink,
    join_line:      joinLine,
  });
  if (!message.trim()) return NextResponse.json({ error: 'The template for this notification is empty.' }, { status: 400 });

  const result = await sendBestBulkSms(phone, message);

  await admin.from('attendance_sms_log').insert({
    student_id: null,
    parent_phone: result.to,
    template_kind: 'custom',
    message,
    status: result.ok ? 'sent' : 'failed',
    provider_response: 'admissions-' + kind + ': ' + result.providerResponse,
    sent_by: user.id,
  });

  if (!result.ok) return NextResponse.json({ error: 'SMS gateway rejected the request.', detail: result.providerResponse }, { status: 502 });
  return NextResponse.json({ sent: true, to: result.to, message });
}
