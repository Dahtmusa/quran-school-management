'use client';
import { createClient } from '@/lib/supabase/client';

function supabase() { return createClient(); }

export type AttendanceStatus = {
  code: string;
  label: string;
  color: string;
  countsAsPresent: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type AttendanceScanPoint = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export type AttendanceRecord = {
  id: string;
  personId: string;
  personType: 'student' | 'staff';
  personName: string;
  personAdmissionNo: string | null;
  scannedAt: string;
  attendanceDate: string;
  statusCode: string;
  statusLabel: string;
  statusColor: string;
  period: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  note: string | null;
  isOfflineScan: boolean;
  scanPointName: string | null;
  recordedByName: string | null;
};

export type AttendanceSummary = {
  date: string;
  period: string;
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  sick: number;
  pending: number;
};

export async function loadAttendanceStatuses(): Promise<AttendanceStatus[]> {
  const { data } = await supabase()
    .from('attendance_statuses')
    .select('code,label,color,counts_as_present,is_active,sort_order')
    .eq('is_active', true)
    .order('sort_order');
  return (data || []).map(r => ({
    code: r.code,
    label: r.label,
    color: r.color,
    countsAsPresent: r.counts_as_present,
    isActive: r.is_active,
    sortOrder: r.sort_order,
  }));
}

export async function loadScanPoints(): Promise<AttendanceScanPoint[]> {
  const { data } = await supabase()
    .from('attendance_scan_points')
    .select('id,name,description,is_active')
    .eq('is_active', true)
    .order('name');
  return (data || []).map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isActive: r.is_active,
  }));
}

export async function loadTodayRecords(date?: string): Promise<AttendanceRecord[]> {
  const d = date || new Date().toISOString().slice(0, 10);
  const { data } = await supabase()
    .from('attendance_records')
    .select('id,person_id,person_type,scanned_at,attendance_date,status_code,period,review_status,note,is_offline_scan,scan_point_id,recorded_by')
    .eq('attendance_date', d)
    .order('scanned_at', { ascending: false });

  if (!data || data.length === 0) return [];

  const studentIds = data.filter(r => r.person_type === 'student').map(r => r.person_id);
  const staffIds   = data.filter(r => r.person_type === 'staff').map(r => r.person_id);

  const [studentsRes, staffRes, statusesRes] = await Promise.all([
    studentIds.length ? supabase().from('students').select('id,full_name,admission_no').in('id', studentIds) : Promise.resolve({ data: [] }),
    staffIds.length   ? supabase().from('profiles').select('id,full_name').in('id', staffIds)               : Promise.resolve({ data: [] }),
    supabase().from('attendance_statuses').select('code,label,color'),
  ]);

  const studentMap = Object.fromEntries((studentsRes.data || []).map(s => [s.id, s]));
  const staffMap   = Object.fromEntries((staffRes.data   || []).map(s => [s.id, s]));
  const statusMap  = Object.fromEntries((statusesRes.data || []).map(s => [s.code, s]));

  return data.map(r => {
    const person = r.person_type === 'student' ? studentMap[r.person_id] : staffMap[r.person_id];
    const st = statusMap[r.status_code];
    return {
      id: r.id,
      personId: r.person_id,
      personType: r.person_type as 'student' | 'staff',
      personName: person?.full_name || 'Unknown',
      personAdmissionNo: (person as any)?.admission_no || null,
      scannedAt: r.scanned_at,
      attendanceDate: r.attendance_date,
      statusCode: r.status_code,
      statusLabel: st?.label || r.status_code,
      statusColor: st?.color || '#6b7280',
      period: r.period,
      reviewStatus: r.review_status as 'pending' | 'approved' | 'rejected',
      note: r.note,
      isOfflineScan: r.is_offline_scan,
      scanPointName: null,
      recordedByName: null,
    };
  });
}

export async function loadAttendanceSummary(date?: string): Promise<AttendanceSummary> {
  const d = date || new Date().toISOString().slice(0, 10);
  const { data } = await supabase()
    .from('attendance_records')
    .select('status_code, review_status')
    .eq('attendance_date', d)
    .eq('period', 'morning');

  const rows = data || [];
  return {
    date: d,
    period: 'morning',
    total: rows.length,
    present: rows.filter(r => r.status_code === 'present').length,
    absent: rows.filter(r => r.status_code === 'absent').length,
    late: rows.filter(r => r.status_code === 'late').length,
    excused: rows.filter(r => r.status_code === 'excused').length,
    sick: rows.filter(r => r.status_code === 'sick').length,
    pending: rows.filter(r => r.review_status === 'pending').length,
  };
}

export async function loadPendingRecords(): Promise<AttendanceRecord[]> {
  // Simple query — no complex joins that can fail silently due to RLS
  const { data } = await supabase()
    .from('attendance_records')
    .select('id,person_id,person_type,scanned_at,attendance_date,status_code,period,review_status,note,is_offline_scan,scan_point_id,recorded_by')
    .eq('review_status', 'pending')
    .order('scanned_at', { ascending: false })
    .limit(200);

  if (!data || data.length === 0) return [];

  const studentIds = data.filter(r => r.person_type === 'student').map(r => r.person_id);

  const [studentsRes, statusesRes] = await Promise.all([
    studentIds.length
      ? supabase().from('students').select('id,full_name,admission_no').in('id', studentIds)
      : Promise.resolve({ data: [] }),
    supabase().from('attendance_statuses').select('code,label,color'),
  ]);

  const studentMap = Object.fromEntries((studentsRes.data || []).map(s => [s.id, s]));
  const statusMap = Object.fromEntries((statusesRes.data || []).map(s => [s.code, s]));

  return data.map(r => {
    const person = r.person_type === 'student' ? studentMap[r.person_id] : null;
    const st = statusMap[r.status_code];
    return {
      id: r.id,
      personId: r.person_id,
      personType: r.person_type as 'student' | 'staff',
      personName: person?.full_name || 'Unknown',
      personAdmissionNo: person?.admission_no || null,
      scannedAt: r.scanned_at,
      attendanceDate: r.attendance_date,
      statusCode: r.status_code,
      statusLabel: st?.label || r.status_code,
      statusColor: st?.color || '#6b7280',
      period: r.period,
      reviewStatus: r.review_status as 'pending' | 'approved' | 'rejected',
      note: r.note,
      isOfflineScan: r.is_offline_scan,
      scanPointName: null,
      recordedByName: null,
    };
  });
}

export async function loadAttendanceSettings(): Promise<Record<string, unknown>> {
  const { data } = await supabase().from('attendance_settings').select('key,value');
  const out: Record<string, unknown> = {};
  for (const row of data || []) out[row.key] = row.value;
  return out;
}

export async function loadChildAttendance(studentId: string, limit = 60): Promise<AttendanceRecord[]> {
  const { data } = await supabase()
    .from('attendance_records')
    .select('id,person_id,person_type,scanned_at,attendance_date,status_code,period,review_status,note,is_offline_scan,attendance_statuses!status_code(label,color)')
    .eq('person_id', studentId)
    .eq('review_status', 'approved')
    .order('attendance_date', { ascending: false })
    .limit(limit);

  return (data || []).map(r => {
    const st = r.attendance_statuses as any;
    return {
      id: r.id, personId: r.person_id, personType: 'student',
      personName: '', personAdmissionNo: null,
      scannedAt: r.scanned_at, attendanceDate: r.attendance_date,
      statusCode: r.status_code, statusLabel: st?.label || r.status_code,
      statusColor: st?.color || '#6b7280',
      period: r.period, reviewStatus: r.review_status as 'pending' | 'approved' | 'rejected',
      note: r.note, isOfflineScan: r.is_offline_scan,
      scanPointName: null, recordedByName: null,
    };
  });
}


export async function recordTeacherBoardingAttendance(studentId:string,statusCode:string='present',period:string='morning',note?:string){
  const {data,error}=await supabase().rpc('teacher_record_boarding_attendance',{p_student_id:studentId,p_status_code:statusCode,p_period:period,p_note:note||null});
  if(error) throw error; return data as string;
}
