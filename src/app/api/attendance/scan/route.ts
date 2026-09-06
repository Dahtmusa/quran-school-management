import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

  if (!personId || !personType) {
    return NextResponse.json({ error: 'personId and personType required' }, { status: 400 });
  }

  // Server-side timestamp — client cannot manipulate this
  const scannedAt = new Date().toISOString();
  const attendanceDate = scannedAt.slice(0, 10);

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

  // Auto-determine status: present or late
  let statusCode = 'present';
  if (period === 'morning') {
    const [ch, cm] = cutoff.split(':').map(Number);
    const scanHour = new Date(scannedAt).getHours();
    const scanMin = new Date(scannedAt).getMinutes();
    if (scanHour > ch || (scanHour === ch && scanMin > cm)) {
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
  });
}
