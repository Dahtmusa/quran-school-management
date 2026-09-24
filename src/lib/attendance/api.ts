// AMQM Attendance v3 — client-side helpers.
// One place for typed fetch wrappers + a realtime subscription so the admin
// dashboard, gate scanner, and teacher page all use the same contract.

import { createClient } from '@/lib/supabase/client';

export type PersonType = 'student' | 'staff';
export type PersonSection = 'day' | 'boarding' | 'staff';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused' | 'sick';

export type SummaryPerson = {
  id: string;
  person_type: PersonType;
  full_name: string;
  identifier: string | null;
  section: PersonSection;
  class_name: string | null;
  job_title: string | null;
  parent_phone: string | null;
  status: AttendanceStatus | null;
  scanned_at: string | null;
  source: 'gate_scan' | 'teacher' | 'admin' | 'awaiting_gate' | 'awaiting_teacher' | null;
  note: string | null;
};

export type SummaryBucket = {
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  not_marked: number;
};

export type AttendanceSummary = {
  date: string;
  cutoff: string;
  people: {
    day: SummaryPerson[];
    boarding: SummaryPerson[];
    staff: SummaryPerson[];
  };
  counts: {
    day: SummaryBucket;
    boarding: SummaryBucket;
    staff: SummaryBucket;
  };
};

export type StaffFineRow = {
  staff_id: string;
  full_name: string;
  staff_no: string | null;
  job_title: string | null;
  late_count: number;
  absent_count: number;
  late_fine_ngn: number;
  absent_fine_ngn: number;
  total_ngn: number;
};

export type AttendanceSettings = {
  morning_cutoff_time: string;
  staff_late_fine_ngn: number;
  staff_absent_fine_ngn: number;
  sms_enabled: boolean;
  sms_arrival_template: string;
  sms_late_template: string;
  sms_absent_template: string;
};

export type RecentScanRow = {
  id: string;
  person_id: string;
  person_type: PersonType;
  full_name: string;
  identifier: string | null;
  section: 'day' | 'boarding' | 'staff' | string;
  role_or_class: string | null;
  status_code: AttendanceStatus;
  scanned_at: string;
};

export type TeacherBoardingRow = {
  student_id: string;
  full_name: string;
  admission_no: string | null;
  class_name: string | null;
  status_code: AttendanceStatus | null;
  scanned_at: string | null;
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Prefer the specific detail the server included (e.g. the SMS gateway's
    // own rejection message) over the generic "Request failed" fallback so
    // the UI can show something actionable.
    const detail = body?.detail ? ` — ${typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)}` : '';
    throw new Error((body?.error || 'Request failed') + detail);
  }
  return body as T;
}

export const attendanceApi = {
  summary: (date: string) =>
    fetch('/api/attendance/summary?date=' + encodeURIComponent(date), { cache: 'no-store' })
      .then(json<AttendanceSummary>),
  setStatus: (personId: string, personType: PersonType, date: string, status: AttendanceStatus, note?: string) =>
    fetch('/api/attendance/set-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, personType, date, status, note }),
    }).then(json<{ id: string }>),
  sendSms: (studentId: string, template: 'arrival' | 'late' | 'absent' | 'custom', overrideMessage?: string) =>
    fetch('/api/attendance/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, template, overrideMessage }),
    }).then(json<{ sent: boolean; to: string; message: string }>),
  bulkSms: (template: 'arrival' | 'late' | 'absent', date: string, opts: { markUnmarkedAbsent?: boolean } = {}) =>
    fetch('/api/attendance/bulk-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, date, ...opts }),
    }).then(json<{ requested: number; sent: number; failed: number; skipped_no_phone: number }>),
  settings: () =>
    fetch('/api/attendance/settings', { cache: 'no-store' })
      .then(json<AttendanceSettings>),
  saveSettings: (patch: Partial<AttendanceSettings>) =>
    fetch('/api/attendance/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(json<AttendanceSettings>),
  staffFines: (from: string, to: string) =>
    fetch(`/api/attendance/staff-fines?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { cache: 'no-store' })
      .then(json<{ from: string; to: string; rows: StaffFineRow[]; totals: { late: number; absent: number; grand: number } }>),
  teacherRoster: (date: string) =>
    fetch('/api/attendance/teacher?date=' + encodeURIComponent(date), { cache: 'no-store' })
      .then(json<{ date: string; rows: TeacherBoardingRow[] }>),
  teacherMark: (studentId: string, status: AttendanceStatus, date: string) =>
    fetch('/api/attendance/teacher', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, status, date }),
    }).then(json<{ id: string }>),
  recentScans: (limit = 10) =>
    fetch('/api/attendance/recent-scans?limit=' + limit, { cache: 'no-store' })
      .then(json<{ date: string; rows: RecentScanRow[] }>),
  gateScan: (value: string) =>
    fetch('/api/attendance/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }).then(json<{
      success: boolean; statusCode: AttendanceStatus; scannedAt: string;
      person: { id: string; type: PersonType; name: string; identifier: string | null; photoUrl: string | null };
      message: string;
    }>),
};

/**
 * Subscribe to attendance_records inserts/updates for the given local date.
 * Returns an unsubscribe function. The dashboard uses this to reflect gate
 * scans and teacher marks without polling.
 */
export function subscribeToAttendance(date: string, onChange: () => void): () => void {
  const supabase = createClient();
  const channel = supabase
    .channel('attendance-live-' + date)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'attendance_records', filter: `attendance_date=eq.${date}` },
      () => onChange(),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
