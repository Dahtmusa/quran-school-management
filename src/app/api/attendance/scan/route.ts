import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchAttendanceSms, stripAttendanceSetting } from '@/lib/attendance-sms';

export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const { personId, personType, period = 'morning', scanPointId, isOfflineScan = false, clientScannedAt } = body;

  if (!personId || !personType || !['student','staff'].includes(personType)) {
    return NextResponse.json({ error: 'personId and a valid personType (student or staff) are required' }, { status: 400 });
  }

  // Resolve the scanned value to the canonical UUID before writing attendance.
  // Printed cards use human-readable STAFF IDs/admission numbers, while QR
  // payloads may contain either those IDs or the database UUID.
  const adminLookup = createAdminClient();
  let canonicalPersonId = String(personId).trim();

  if (personType === 'staff') {
    const { data: byUuid } = await adminLookup
      .from('profiles')
      .select('id,staff_id')
      .eq('id', canonicalPersonId)
      .eq('employment_status','active')
      .maybeSingle();
    const { data: byStaffId } = byUuid ? { data: null } : await adminLookup
      .from('profiles')
      .select('id,staff_id')
      .eq('staff_id', canonicalPersonId)
      .eq('employment_status','active')
      .maybeSingle();
    const staffRecord = byUuid || byStaffId;
    if (!staffRecord) return NextResponse.json({ error: 'Staff ID not found' }, { status: 404 });
    canonicalPersonId = staffRecord.id;
  } else {
    const { data: byUuid } = await adminLookup
      .from('students')
      .select('id,status,section,admission_no,student_id_number')
      .eq('id', canonicalPersonId)
      .maybeSingle();
    const { data: byPrintedId } = byUuid ? { data: null } : await adminLookup
      .from('students')
      .select('id,status,section,admission_no,student_id_number')
      .or(`admission_no.eq.${canonicalPersonId},student_id_number.eq.${canonicalPersonId}`)
      .limit(1)
      .maybeSingle();
    const studentRecord = byUuid || byPrintedId;
    if (!studentRecord || studentRecord.status !== 'active') return NextResponse.json({ error: 'Active student ID not found' }, { status: 404 });
    if (studentRecord.section !== 'day') return NextResponse.json({ error: 'Boarding students are not required to use the main-gate morning scanner' }, { status: 403 });
    canonicalPersonId = studentRecord.id;
  }

  // Server-side timestamp — client cannot manipulate this
  const scannedAt = new Date().toISOString();
  // Use Nigerian date (WAT = UTC+1) so late-night scans don't roll to next day
  const nigeriaMs = new Date().getTime() + 60 * 60 * 1000;
  const attendanceDate = new Date(nigeriaMs).toISOString().slice(0, 10);

  // Load settings
  const { data: settingsRows } = await supabase
    .from('attendance_settings')
    .select('key,value');
  const settings: Record<string, unknown> = {};
  for (const r of settingsRows || []) settings[r.key] = r.value;

  const cutoff = String(settings['morning_cutoff_time'] ?? '09:00');

  // Duplicate check: same person, same date, same period
  const { data: existing } = await supabase
    .from('attendance_records')
    .select('id, scanned_at, status_code, note')
    .eq('person_id', canonicalPersonId)
    .eq('attendance_date', attendanceDate)
    .eq('period', period)
    .maybeSingle();

  const replacingAutomaticAbsence = existing?.status_code === 'absent'
    && String(existing.note || '').toLowerCase().includes('automatically marked absent');

  if (existing && !replacingAutomaticAbsence) {
    // A person has one official arrival scan per attendance period/day.
    // Do not overwrite the original arrival time if the card is scanned again.
    return NextResponse.json({
      success: false,
      error: 'duplicate',
      firstScanTime: existing.scanned_at,
    });
  }

  // Auto-determine status: present or late (compare in Nigeria time WAT = UTC+1)
  let statusCode = 'present';
  if (period === 'morning' && cutoff) {
    const nigeriaOffset = 60; // WAT = UTC+1 in minutes
    const scanMs = new Date(scannedAt).getTime() + nigeriaOffset * 60 * 1000;
    const scanNigeria = new Date(scanMs);
    const scanHour = scanNigeria.getUTCHours();
    const scanMin = scanNigeria.getUTCMinutes();
    // Strip any surrounding quotes from stored value e.g. "09:00" -> 09:00
    const cleanCutoff = String(cutoff).replace(/^"|"$/g, '');
    const [ch, cm] = cleanCutoff.split(':').map(Number);
    if (!isNaN(ch) && (scanHour > ch || (scanHour === ch && scanMin >= cm))) {
      statusCode = 'late';
    }
  }

  // Insert record with server timestamp
  const { data: record, error } = await supabase
    .from('attendance_records')
    .upsert({
      person_id: canonicalPersonId,
      person_type: personType,
      scanned_at: scannedAt,
      attendance_date: attendanceDate,
      status_code: statusCode,
      period,
      review_status: 'pending',
      note: existing?.status_code === 'absent' && String(existing?.note || '').toLowerCase().includes('automatically marked absent')
        ? 'Automatic absence placeholder replaced by gate scan.' : undefined,
      recorded_by: user.id,
      scan_point_id: scanPointId || null,
      is_offline_scan: isOfflineScan,
      client_scanned_at: isOfflineScan ? clientScannedAt : null,
      synced_at: isOfflineScan ? scannedAt : null,
    }, { onConflict: 'person_id,attendance_date,period', ignoreDuplicates: false })
    .select('id, scanned_at, status_code')
    .single();

  if (error) {
    console.error('[scan]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Staff late policy applies only to ordinary teaching/staff accounts.
  // Management and leadership may scan and have attendance records, but must
  // never receive late fines or disciplinary SMS warnings.
  let staffLateWarning: { sent: boolean; lateCount?: number; error?: string } | null = null;
  if (personType === 'staff' && statusCode === 'late') {
    const managementRoles = ['admin','super_admin','principal','finance','admissions','security','accountant'];
    const { data: scannedProfile } = await createAdminClient()
      .from('profiles')
      .select('id,role,full_name')
      .eq('id', canonicalPersonId)
      .maybeSingle();
    const { data: leadershipProfile } = await createAdminClient()
      .from('public_team_profiles')
      .select('id,full_name,role_title,category')
      .eq('published', true)
      .ilike('category', 'leadership');
    const isLeadership = !!leadershipProfile?.some((p: any) =>
      String(p.full_name || '').trim().toLowerCase() === String(scannedProfile?.full_name || '').trim().toLowerCase()
    );
    const isManagement = managementRoles.includes(String(scannedProfile?.role || '').toLowerCase()) || isLeadership;

    if (isManagement) {
      // Attendance is still recorded above; deliberately skip all fines,
      // late-count warnings and SMS for management/leadership.
      staffLateWarning = { sent: false, lateCount: 0 };
    } else {
    try {
      const admin = createAdminClient();
      const { data: staff } = await admin.from('profiles').select('id,full_name,phone').eq('id', canonicalPersonId).single();
      const settingRows = (await admin.from('attendance_settings').select('key,value')).data || [];
      const policy: Record<string, unknown> = {};
      for (const row of settingRows) policy[row.key] = row.value;
      const windowDays = Math.max(1, Number(stripAttendanceSetting(policy.staff_late_count_window_days) || 30));
      const threshold = Math.max(1, Number(stripAttendanceSetting(policy.staff_late_warning_threshold) || 2));
      const repeat = Math.max(1, Number(stripAttendanceSetting(policy.staff_late_warning_repeat) || threshold));
      const windowStart = new Date(Date.now() - (windowDays - 1) * 86400000).toISOString().slice(0,10);
      const { count } = await admin.from('attendance_records')
        .select('id',{count:'exact',head:true})
        .eq('person_id',canonicalPersonId).eq('person_type','staff').eq('status_code','late')
        .gte('attendance_date',windowStart).lte('attendance_date',attendanceDate);
      const lateCount = Number(count || 0);
      const warningEnabled = stripAttendanceSetting(policy.staff_late_warning_enabled) !== 'false';
      const warningDue = warningEnabled && lateCount >= threshold && ((lateCount - threshold) % repeat === 0);
      const fineEnabled = stripAttendanceSetting(policy.staff_late_fine_enabled) === 'true';
      const fineThreshold = Math.max(1, Number(stripAttendanceSetting(policy.staff_late_fine_threshold) || threshold));
      const fineAmount = Number(stripAttendanceSetting(policy.staff_late_fine_amount) || 0);

      if (fineEnabled && fineAmount > 0 && lateCount >= fineThreshold) {
        await admin.from('staff_attendance_fines').upsert({
          staff_id: canonicalPersonId, attendance_record_id: record.id, amount: fineAmount,
          reason: `Late gate arrival #${lateCount} within ${windowDays} days`
        }, { onConflict: 'attendance_record_id', ignoreDuplicates: true });
      }

      if (warningDue && staff?.phone && stripAttendanceSetting(policy.sms_enabled) !== 'false') {
        const template = stripAttendanceSetting(policy.staff_late_warning_template) ||
          'Dear {staff_name}, you have been recorded late {late_count} times in the last {window_days} days. Please report on time. - AMQM';
        const message = template
          .replace(/{staff_name}/g, staff.full_name || 'Staff member')
          .replace(/{late_count}/g, String(lateCount))
          .replace(/{window_days}/g, String(windowDays))
          .replace(/{date}/g, attendanceDate);
        try {
          const to = await dispatchAttendanceSms(policy, staff.phone, message);
          await admin.from('attendance_notifications').insert({
            record_id: record.id, recipient_type: 'staff', phone_number: to,
            message, status: 'sent', sent_at: new Date().toISOString()
          });
          staffLateWarning = { sent: true, lateCount };
        } catch (smsError: unknown) {
          const errorMessage = smsError instanceof Error ? smsError.message : 'SMS failed';
          await admin.from('attendance_notifications').insert({
            record_id: record.id, recipient_type: 'staff', phone_number: staff.phone,
            message, status: 'failed', error_message: errorMessage
          });
          staffLateWarning = { sent: false, lateCount, error: errorMessage };
        }
      } else {
        staffLateWarning = { sent: false, lateCount };
      }
    } catch (policyError: unknown) {
      staffLateWarning = { sent: false, error: policyError instanceof Error ? policyError.message : 'Staff late policy failed' };
    }
    }
  }

  // Audit log
  await supabase.from('attendance_audit_logs').insert({
    record_id: record.id,
    user_id: user.id,
    user_role: role,
    action: isOfflineScan ? 'offline_scan_synced' : 'scanned',
    new_value: { personId: canonicalPersonId, scannedId: personId, personType, statusCode, period, scannedAt },
  });

  return NextResponse.json({
    success: true,
    recordId: record.id,
    scannedAt: record.scanned_at,
    statusCode: record.status_code,
    staffLateWarning,
  });
}
