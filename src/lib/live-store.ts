import { createClient } from '@/lib/supabase/client';
import type { Evaluation, EvaluationStatus, Student, Direction } from '@/lib/data';
import type { Position } from '@/lib/quran';

const supabase = () => createClient();

function mapDirection(value: string): Direction {
  return value === 'nas_to_baqarah' ? 'Nas-to-Baqarah' : 'Baqarah-to-Nas';
}
function mapYear(value: string): 'Year 1'|'Year 2' { return value === 'year_2' ? 'Year 2' : 'Year 1'; }
function mapStatus(value: string): EvaluationStatus {
  return value === 'approved' ? 'Approved' : value === 'pending_approval' ? 'Pending Approval' : value === 'returned' ? 'Returned' : 'Draft';
}

export async function getCurrentUser() {
  const { data } = await supabase().auth.getUser();
  return data.user ?? null;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase().from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data;
}

export async function loadStudents(): Promise<Student[]> {
  const db = supabase();
  const { data, error } = await db.from('students').select('*').order('full_name');
  if (error || !data) return [];
  const ids = data.map(s => s.id);
  const [{ data: teachers }, { data: fees }, { data: attendance }] = await Promise.all([
    ids.length ? db.from('teacher_students').select('student_id,teacher_id,profiles:teacher_id(full_name)').in('student_id', ids) : Promise.resolve({data: [] as any[]}),
    ids.length ? db.from('student_fees').select('student_id,amount_due,amount_paid').in('student_id', ids) : Promise.resolve({data: [] as any[]}),
    ids.length ? db.from('attendance_records').select('student_id,status').in('student_id', ids) : Promise.resolve({data: [] as any[]}),
  ]);
  return data.map((s: any) => {
    const ts = (teachers ?? []).find((x:any)=>x.student_id===s.id);
    const sf = (fees ?? []).filter((x:any)=>x.student_id===s.id);
    const ar = (attendance ?? []).filter((x:any)=>x.student_id===s.id);
    const attended = ar.filter((x:any)=>x.status==='present'||x.status==='late').length;
    const attendancePct = ar.length ? Math.round(attended/ar.length*100) : 0;
    const due = sf.reduce((n:any,x:any)=>n+Number(x.amount_due||0)-Number(x.amount_paid||0),0);
    return {
      id:s.id, admissionNo:s.admission_no, name:s.full_name,
      section:s.section === 'boarding' ? 'Boarding' : 'Day', year:mapYear(s.program_year),
      attendance:attendancePct, fees:due, teacher:ts?.profiles?.full_name ?? 'Unassigned',
      start:{surah:s.start_surah ?? 114, ayah:s.start_ayah ?? 1},
      current:{surah:s.current_surah ?? s.start_surah ?? 114, ayah:s.current_ayah ?? s.start_ayah ?? 1},
      direction:mapDirection(s.memorization_direction),
    } satisfies Student;
  });
}

export async function loadEvaluations(): Promise<Evaluation[]> {
  const db = supabase();
  const { data, error } = await db.from('evaluations').select('*, students:student_id(full_name)').order('submitted_at',{ascending:false});
  if (error || !data) return [];
  return data.map((e:any) => ({
    id:e.id, studentId:e.student_id, student:e.students?.full_name ?? 'Student',
    term:e.term_definition_id ? `Term ${e.evaluation_number}` : 'Term', number:e.evaluation_number,
    status:mapStatus(e.status), from:{surah:e.from_surah,ayah:e.from_ayah} as Position,
    to:{surah:e.to_surah,ayah:e.to_ayah} as Position, memorizedAyahs:e.memorized_ayahs,
    memorizedPages:e.memorized_pages, memorizedHizbs:e.memorized_hizbs,
    memorization:Math.max(1,Math.min(5,Math.round(Number(e.accuracy_score??3)))) as 1|2|3|4|5,
    fluency:Math.max(1,Math.min(5,Math.round(Number(e.fluency_score??3)))) as 1|2|3|4|5,
    tajweed:Math.max(1,Math.min(5,Math.round(Number(e.tajweed_score??3)))) as 1|2|3|4|5,
    score:Number(e.score??0), comment:e.teacher_comment??''
  }));
}

export async function loadAdmissions() {
  const { data, error } = await supabase().from('admissions').select('*').order('created_at',{ascending:false});
  if (error || !data) return [];
  return data.map((a:any)=>({id:a.application_no,name:a.applicant_name,parent:a.parent_name,section:a.requested_section==='boarding'?'Boarding':'Day',year:mapYear(a.requested_program_year),status:a.status}));
}

export async function loadPayments() {
  const { data, error } = await supabase().from('payments').select('*').order('paid_on',{ascending:false});
  if (error || !data) return [];
  return data;
}
