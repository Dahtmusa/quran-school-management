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

  // Never trust the QR payload's personType. Verify that the ID belongs to the
  // requested entity before recording attendance.
  if (personType === 'staff') {
    const { data: staffRecord } = await supabase.from('profiles').select('id').eq('id', personId).in('role',['teacher','admin','super_admin','principal','finance','security','admissions','librarian','accountant']).maybeSingle();
    if (!staffRecord) return NextResponse.json({ error: 'Staff record not found' }, { status: 404 });
  } else {
    const { data: studentRecord } = await supabase.from('students').select('id,status').eq('id', personId).maybeSingle();
    if (!studentRecord || studentRecord.status !== 'active') return NextResponse.json({ error: 'Active student record not found' }, { status: 404 });
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

  const dupMinutes = Number(settings['duplicate_interval_minutes'] ?? 30);
  const cutoff = String(settings['morning_cutoff_time'] ?? '09:00');

  // Duplicate check: same person, same date, same period
  const { data: existing } = await supabase
    .from('attendance_records')
    .select('id, scanned_at')
    .eq('person_id', personId)
    .eq('attendance_date', attendanceDate)
    .eq('period', period)
    .maybeSingle();

  if (existing) {
    const firstScan = new Date(existing.scanned_at);
    const minsElapsed = (Date.now() - firstScan.getTime()) / 60000;
    if (minsElapsed < dupMinutes) {
      return NextResponse.json({
        success: false,
        error: 'duplicate',
        firstScanTime: existing.scanned_at,
      });
    }
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
      person_id: personId,
      person_type: personType,
      scanned_at: scannedAt,
      attendance_date: attendanceDate,
      status_code: statusCode,
      period,
      review_status: 'pending',
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

  // Staff late policy: count recent late gate scans, create an optional fine,
  // and send an automatic warning SMS on the configured threshold.
  let staffLateWarning: { sent: boolean; lateCount?: number; error?: string } | null = null;
  if (personType === 'staff' && statusCode === 'late') {
    try {
      const admin = createAdminClient();
      const { data: staff } = await admin.from('profiles').select('id,full_name,phone').eq('id', personId).single();
      const settingRows = (await admin.from('attendance_settings').select('key,value')).data || [];
      const policy: Record<string, unknown> = {};
      for (const row of settingRows) policy[row.key] = row.value;
      const windowDays = Math.max(1, Number(stripAttendanceSetting(policy.staff_late_count_window_days) || 30));
      const threshold = Math.max(1, Number(stripAttendanceSetting(policy.staff_late_warning_threshold) || 2));
      const repeat = Math.max(1, Number(stripAttendanceSetting(policy.staff_late_warning_repeat) || threshold));
      const windowStart = new Date(Date.now() - (windowDays - 1) * 86400000).toISOString().slice(0,10);
      const { count } = await admin.from('attendance_records')
        .select('id',{count:'exact',head:true})
        .eq('person_id',personId).eq('person_type','staff').eq('status_code','late')
        .gte('attendance_date',windowStart).lte('attendance_date',attendanceDate);
      const lateCount = Number(count || 0);
      const warningEnabled = stripAttendanceSetting(policy.staff_late_warning_enabled) !== 'false';
      const warningDue = warningEnabled && lateCount >= threshold && ((lateCount - threshold) % repeat === 0);
      const fineEnabled = stripAttendanceSetting(policy.staff_late_fine_enabled) === 'true';
      const fineThreshold = Math.max(1, Number(stripAttendanceSetting(policy.staff_late_fine_threshold) || threshold));
      const fineAmount = Number(stripAttendanceSetting(policy.staff_late_fine_amount) || 0);

      if (fineEnabled && fineAmount > 0 && lateCount >= fineThreshold) {
        await admin.from('staff_attendance_fines').upsert({
          staff_id: personId, attendance_record_id: record.id, amount: fineAmount,
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

  // Audit log
  await supabase.from('attendance_audit_logs').insert({
    record_id: record.id,
    user_id: user.id,
    user_role: role,
    action: isOfflineScan ? 'offline_scan_synced' : 'scanned',
    new_value: { personId, personType, statusCode, period, scannedAt },
  });

  return NextResponse.json({
    success: true,
    recordId: record.id,
    scannedAt: record.scanned_at,
    statusCode: record.status_code,
    staffLateWarning,
  });
}
