import { createClient } from '@/lib/supabase/client';

export type AttendanceRecord = {
  id:string;
  attendanceDate:string;
  scannedAt:string;
  period:string;
  statusCode:string;
  statusLabel:string;
};

export type AttendanceScanPoint = {
  id:string;
  name:string;
  description?:string|null;
  isActive?:boolean;
};

export type TeacherBoardingAttendanceRow = {
  studentId:string;
  fullName:string;
  studentName?:string;
  statusCode:string|null;
  statusLabel?:string|null;
  attendanceDate:string;
};

export async function loadChildAttendance(studentId:string, days=30):Promise<AttendanceRecord[]> {
  const supabase=createClient();
  const from=new Date();
  from.setDate(from.getDate()-Math.max(1,days));
  const {data,error}=await supabase
    .from('attendance_records')
    .select('id,attendance_date,scanned_at,period,status_code,attendance_statuses:status_code(label)')
    .eq('person_id',studentId)
    .eq('person_type','student')
    .gte('attendance_date',from.toISOString().slice(0,10))
    .order('attendance_date',{ascending:false})
    .order('scanned_at',{ascending:false})
    .limit(days);
  if(error){console.error('[AMQM] loadChildAttendance:',error);return [];}
  return (data||[]).map((r:any)=>({
    id:r.id,
    attendanceDate:r.attendance_date,
    scannedAt:r.scanned_at,
    period:r.period,
    statusCode:r.status_code,
    statusLabel:r.attendance_statuses?.label||r.status_code
  }));
}

export async function loadScanPoints():Promise<AttendanceScanPoint[]> {
  const supabase=createClient();
  const {data,error}=await supabase
    .from('attendance_scan_points')
    .select('id,name,description,is_active')
    .eq('is_active',true)
    .order('name');
  if(error){console.error('[AMQM] loadScanPoints:',error);return [];}
  return (data||[]).map((r:any)=>({
    id:r.id,name:r.name,description:r.description,isActive:r.is_active
  }));
}

export async function loadTeacherBoardingAttendanceToday():Promise<TeacherBoardingAttendanceRow[]> {
  const res=await fetch('/api/attendance/teacher',{cache:'no-store'});
  if(!res.ok) throw new Error((await res.json().catch(()=>({}))).error||'Could not load boarding attendance.');
  const body=await res.json();
  return (body.rows||[]).map((row:any)=>({
    ...row,
    studentId: row.studentId ?? row.student_id,
    fullName: row.fullName ?? row.full_name ?? row.studentName ?? row.student_name ?? '',
    studentName: row.studentName ?? row.student_name ?? row.fullName ?? row.full_name ?? '',
    statusCode: row.statusCode ?? row.status_code ?? null,
    statusLabel: row.statusLabel ?? row.status_label ?? null,
    attendanceDate: row.attendanceDate ?? row.attendance_date ?? body.date,
  })) as TeacherBoardingAttendanceRow[];
}

export async function recordTeacherBoardingAttendance(studentId:string,status:string):Promise<string> {
  const res=await fetch('/api/attendance/teacher',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({studentId,status})
  });
  const body=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(body.error||'Could not record attendance.');
  return String(body.recordId||'');
}
