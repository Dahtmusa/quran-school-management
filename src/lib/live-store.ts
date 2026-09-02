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
      photoUrl:s.photo_url ?? null,
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
  const { error } = await supabase().from('students').update({section}).eq('id', studentId);
  if (error) throw error;
}

export async function updateStudentClass(studentId: string, classId: string | null) {
  const { error } = await supabase().from('students').update({ class_id: classId || null }).eq('id', studentId);
  if (error) throw error;
}

export async function createStudent(input: {
  admissionNo?: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  section: 'day'|'boarding';
  programYear: 'year_1'|'year_2';
  memorizationDirection: 'nas_to_baqarah'|'baqarah_to_nas';
  startSurah: number;
  startAyah: number;
  classId?: string | null;
  photoUrl?: string | null;
}) {
  const { data, error } = await supabase().from('students').insert({
    admission_no: input.admissionNo?.trim() || 'auto',
    full_name: input.fullName.trim(),
    date_of_birth: input.dateOfBirth || null,
    gender: input.gender || null,
    section: input.section,
    program_year: input.programYear,
    memorization_direction: input.memorizationDirection,
    start_surah: input.startSurah,
    start_ayah: input.startAyah,
    class_id: input.classId || null,
    status: 'active',
    photo_url: input.photoUrl || null,
  }).select('id,admission_no').single();
  if (error) throw error;
  return data as { id: string; admission_no: string };
}

export async function updateStudentBasic(studentId: string, input: Partial<{
  full_name: string;
  admission_no: string;
  date_of_birth: string | null;
  gender: string | null;
  status: string;
  photo_url?: string | null;
}>) {
  const { error } = await supabase().from('students').update(input).eq('id', studentId);
  if (error) throw error;
}

export async function loadStaffProfiles() {
  const { data, error } = await supabase().from('profiles').select('id,full_name,role,phone,avatar_url,staff_id,employment_status,job_title,department,joined_on,created_at').order('full_name');
  if (error || !data) return [];
  return data;
}

export async function createStaffAccount(input: {fullName:string;email:string;password:string;role:string;phone?:string;jobTitle?:string;department?:string;joinedOn?:string}) {
  const { data, error } = await supabase().functions.invoke('admin-create-user', { body: {
    full_name: input.fullName, email: input.email, password: input.password, role: input.role, phone: input.phone || null, job_title: input.jobTitle || null, department: input.department || null, joined_on: input.joinedOn || null,
  }});
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function updateStaffProfile(id:string,input:{full_name?:string;phone?:string|null;job_title?:string|null;department?:string|null;employment_status?:string;avatar_url?:string|null}) {
  const { error } = await supabase().from('profiles').update(input).eq('id',id);
  if (error) throw error;
}

export async function loadSurahs() {
  const { data, error } = await supabase().from('quran_surahs').select('id,name,ayah_count').order('id');
  return error || !data ? [] : data;
}

export async function loadTeacherDirectory() {
  const { data, error } = await supabase().rpc('get_teacher_student_directory');
  if (error || !data) return [];
  return data.map((r:any) => ({
    id:r.student_id, admissionNo:r.admission_no, name:r.full_name, dateOfBirth:r.date_of_birth, gender:r.gender,
    section:r.section === 'boarding' ? 'Boarding' : 'Day', year:r.program_year === 'year_2' ? 'Year 2' : 'Year 1',
    status:r.status, photoUrl:r.photo_url, start:{surah:r.start_surah,ayah:r.start_ayah},
    current:{surah:r.current_surah,ayah:r.current_ayah,page:r.current_page,hizb:r.current_hizb},
    className:r.class_name, classId:r.class_id,
    parent:{name:r.parent_name,phone:r.parent_phone,relationship:r.parent_relationship},
  }));
}

export async function loadTeacherEvaluations() {
  const { data, error } = await supabase().from('evaluations').select('*,students:student_id(full_name,admission_no,photo_url)').eq('teacher_visible',true).order('teacher_visible_at',{ascending:false});
  if (error || !data) return [];
  return data;
}

export async function recordTeacherAttendance(studentId:string,status:'present'|'absent'|'late'|'excused',note?:string) {
  const user = await getCurrentUser();
  if (!user) throw new Error('You are not signed in');
  const client=supabase(); const attendance_date=new Date().toISOString().slice(0,10);
  const {data:existing}=await client.from('attendance_records').select('id').eq('student_id',studentId).eq('attendance_date',attendance_date).maybeSingle();
  const {error}=existing ? await client.from('attendance_records').update({recorded_by:user.id,status,note:note||null}).eq('id',existing.id) : await client.from('attendance_records').insert({student_id:studentId,recorded_by:user.id,attendance_date,status,note:note||null});
  if(error) throw error;
}

export async function updateOwnProfile(input:{phone?:string|null;avatar_url?:string|null}) {
  const user = await getCurrentUser();
  if (!user) throw new Error('You are not signed in');
  const { error } = await supabase().from('profiles').update(input).eq('id',user.id);
  if (error) throw error;
}

export async function uploadProfileImage(file:File,folder:'staff'|'students') {
  const client=supabase(); const safe=file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-');
  const path=`${folder}/${new Date().getFullYear()}/${crypto.randomUUID()}-${safe}`;
  const {error}=await client.storage.from('school-profile-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});
  if(error) throw error;
  const {data}=client.storage.from('school-profile-media').getPublicUrl(path);
  return data.publicUrl;
}

export async function submitAdmissionApplication(input:any){
 const {data,error}=await supabase().rpc('submit_admission_application',{
  p_applicant_name:input.applicantName,p_date_of_birth:input.dateOfBirth||null,p_gender:input.gender||null,
  p_parent_name:input.parentName,p_parent_phone:input.parentPhone,p_guardian_name:input.guardianName||null,
  p_guardian_phone:input.guardianPhone||null,p_guardian_email:input.guardianEmail||null,p_guardian_relationship:input.guardianRelationship||null,
  p_address:input.address,p_state:input.state,p_lga:input.lga,p_requested_section:input.section,p_requested_program_year:input.programYear,
  p_previous_school:input.previousSchool||null,p_quran_level:input.quranLevel||null,p_starting_surah:input.startingSurah||null,p_starting_ayah:input.startingAyah||null,
 });
 if(error) throw error; return data;
}

export async function loadAdmissionApplications(){
 const {data,error}=await supabase().from('admissions').select('*').order('created_at',{ascending:false});
 if(error||!data)return []; return data;
}
export async function updateAdmissionApplication(id:string,input:any){const {error}=await supabase().from('admissions').update(input).eq('id',id);if(error)throw error;}
export async function enrollAdmissionApplication(id:string,classId:string|null,startSurah:number|null,startAyah:number|null,score:number|null,notes:string){const {data,error}=await supabase().rpc('enroll_admission_application',{p_application_id:id,p_class_id:classId||null,p_starting_surah:startSurah,p_starting_ayah:startAyah,p_screening_score:score,p_screening_notes:notes||null});if(error)throw error;return data;}
export async function loadSchoolCalendar(){const {data,error}=await supabase().from('school_calendar_events').select('*').order('starts_on');return error||!data?[]:data;}
export async function saveSchoolCalendarEvent(input:any){const user=await getCurrentUser();const {data,error}=await supabase().from('school_calendar_events').insert({...input,created_by:user?.id||null}).select().single();if(error)throw error;return data;}
export async function deleteSchoolCalendarEvent(id:string){const {error}=await supabase().from('school_calendar_events').delete().eq('id',id);if(error)throw error;}
export async function pushEvaluationToTeacher(id:string){const {error}=await supabase().rpc('push_evaluation_to_teacher',{p_evaluation_id:id});if(error)throw error;}
