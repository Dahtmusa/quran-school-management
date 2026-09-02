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
  const { data, error } = await db.from('students').select('*,classes:class_id(name)').order('full_name');
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
      className:s.classes?.name ?? null,
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


export type LiveClass = {
  id: string;
  name: string;
  code: string;
  academicYearId: string | null;
  academicYearName: string | null;
  programYear: 'Year 1' | 'Year 2' | null;
  capacity: number | null;
  active: boolean;
  teachers: { id: string; name: string; primary: boolean }[];
};

export async function loadTeachers() {
  const { data, error } = await supabase()
    .from('profiles')
    .select('id,full_name,role')
    .eq('role', 'teacher')
    .order('full_name');
  if (error || !data) return [];
  return data.map((p: any) => ({ id: p.id, name: p.full_name }));
}

export async function loadAcademicYears() {
  const { data, error } = await supabase()
    .from('academic_years')
    .select('id,name,is_current')
    .order('starts_on', { ascending: false });
  if (error || !data) return [];
  return data;
}

export async function loadClasses(): Promise<LiveClass[]> {
  const db = supabase();
  const { data, error } = await db
    .from('classes')
    .select('id,name,code,academic_year_id,program_year,capacity,active,academic_years:academic_year_id(name),class_teachers(teacher_id,is_primary,profiles:teacher_id(full_name))')
    .order('name');
  if (error || !data) return [];
  return data.map((c: any) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    academicYearId: c.academic_year_id,
    academicYearName: c.academic_years?.name ?? null,
    programYear: c.program_year === 'year_2' ? 'Year 2' : c.program_year === 'year_1' ? 'Year 1' : null,
    capacity: c.capacity,
    active: c.active,
    teachers: (c.class_teachers ?? []).map((ct: any) => ({ id: ct.teacher_id, name: ct.profiles?.full_name ?? 'Teacher', primary: !!ct.is_primary }))
  }));
}

export async function createClass(input: {
  name: string;
  code: string;
  academicYearId?: string | null;
  programYear?: 'year_1' | 'year_2' | null;
  capacity?: number | null;
}) {
  const user = await getCurrentUser();
  const { data, error } = await supabase().from('classes').insert({
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
    academic_year_id: input.academicYearId || null,
    program_year: input.programYear || null,
    capacity: input.capacity || null,
    created_by: user?.id ?? null,
  }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function assignTeacherToClass(classId: string, teacherId: string, primary = false) {
  const { error } = await supabase().from('class_teachers').upsert({
    class_id: classId,
    teacher_id: teacherId,
    is_primary: primary,
  }, { onConflict: 'class_id,teacher_id' });
  if (error) throw error;
}

export async function removeTeacherFromClass(classId: string, teacherId: string) {
  const { error } = await supabase().from('class_teachers').delete().eq('class_id', classId).eq('teacher_id', teacherId);
  if (error) throw error;
}

export async function updateStudentSection(studentId: string, section: 'day' | 'boarding') {
  const { error } = await supabase().rpc('update_student_section', { p_student_id: studentId, p_section: section });
  if (error) throw error;
}

export async function updateStudentClass(studentId: string, classId: string | null) {
  const { error } = await supabase().from('students').update({ class_id: classId || null }).eq('id', studentId);
  if (error) throw error;
}
