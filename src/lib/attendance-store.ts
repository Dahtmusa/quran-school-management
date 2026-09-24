// Backwards-compat shim for pages that pre-date the v3 attendance module.
// The v3 UI (admin dashboard, gate scanner, teacher boarding page) uses
// `@/lib/attendance/api` instead; this file exists so the parent, security
// and teacher home pages keep compiling and working unchanged.
import { createClient } from '@/lib/supabase/client';
import { attendanceApi, type TeacherBoardingRow } from '@/lib/attendance/api';

export type AttendanceRecord = {
  id: string;
  attendanceDate: string;
  scannedAt: string;
  period: string;
  statusCode: string;
  statusLabel: string;
};

export type AttendanceScanPoint = {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
};

export type TeacherBoardingAttendanceRow = {
  studentId: string;
  fullName: string;
  studentName?: string;
  statusCode: string | null;
  statusLabel?: string | null;
  attendanceDate: string;
};

export async function loadChildAttendance(studentId: string, days = 30): Promise<AttendanceRecord[]> {
  const supabase = createClient();
  const from = new Date();
  from.setDate(from.getDate() - Math.max(1, days));
  const { data, error } = await supabase
    .from('attendance_records')
    .select('id,attendance_date,scanned_at,period,status_code,attendance_statuses:status_code(label)')
    .eq('person_id', studentId)
    .eq('person_type', 'student')
    .gte('attendance_date', from.toISOString().slice(0, 10))
    .order('attendance_date', { ascending: false })
    .order('scanned_at', { ascending: false })
    .limit(days);
  if (error) { console.error('[AMQM] loadChildAttendance:', error); return []; }
  return (data || []).map((r: any) => ({
    id: r.id,
    attendanceDate: r.attendance_date,
    scannedAt: r.scanned_at,
    period: r.period,
    statusCode: r.status_code,
    statusLabel: r.attendance_statuses?.label || r.status_code,
  }));
}

export async function loadScanPoints(): Promise<AttendanceScanPoint[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('attendance_scan_points')
    .select('id,name,description,is_active')
    .eq('is_active', true)
    .order('name');
  if (error) { console.error('[AMQM] loadScanPoints:', error); return []; }
  return (data || []).map((r: any) => ({
    id: r.id, name: r.name, description: r.description, isActive: r.is_active,
  }));
}

function toRow(row: TeacherBoardingRow, date: string): TeacherBoardingAttendanceRow {
  return {
    studentId: row.student_id,
    fullName:  row.full_name,
    studentName: row.full_name,
    statusCode: row.status_code,
    statusLabel: row.status_code,
    attendanceDate: date,
  };
}

export async function loadTeacherBoardingAttendanceToday(): Promise<TeacherBoardingAttendanceRow[]> {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const r = await attendanceApi.teacherRoster(date);
  return r.rows.map(row => toRow(row, r.date));
}

export async function recordTeacherBoardingAttendance(studentId: string, status: string): Promise<string> {
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const r = await attendanceApi.teacherMark(studentId, status as any, date);
  return String(r.id || '');
}
