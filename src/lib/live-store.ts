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
  const profile = await getCurrentProfile();
  if (profile?.role === 'parent') return loadParentStudents();
  const { data, error } = await supabase().rpc('admin_get_student_directory');
  if (error || !data) { console.error('Student directory load failed:', error); return []; }
  return data.map((s:any) => ({
    id:s.id, admissionNo:s.admission_no, name:s.full_name, studentIdNumber:s.student_id_number ?? null, idExpiresOn:s.id_expires_on ?? null,
    section:s.section === 'boarding' ? 'Boarding' : 'Day', year:mapYear(s.program_year),
    attendance:Number(s.attendance_percent ?? 0), fees:Number(s.fees_due ?? 0), teacher:s.teacher_name ?? 'Unassigned',
    start:{surah:s.start_surah ?? 114, ayah:s.start_ayah ?? 1},
    current:{surah:s.current_surah ?? s.start_surah ?? 114, ayah:s.current_ayah ?? s.start_ayah ?? 1},
    direction:mapDirection(s.memorization_direction), className:s.class_name ?? null, classId:s.class_id ?? null, photoUrl:s.photo_url ?? null,
    gender:s.gender ?? null,
  } satisfies Student));
}

export async function loadParentStudents(): Promise<Student[]> {
  const { data, error } = await supabase().from('parent_students').select('student_id,relationship,students:student_id(*,classes:class_id(name))');
  if(error||!data) return [];
  return (data as any[]).map((r:any)=>{const st=r.students;return {id:st.id,admissionNo:st.admission_no,name:st.full_name,studentIdNumber:st.student_id_number??null,idExpiresOn:st.id_expires_on??null,section:st.section==='boarding'?'Boarding':'Day',year:mapYear(st.program_year),attendance:0,fees:0,teacher:'',start:{surah:st.start_surah??114,ayah:st.start_ayah??1},current:{surah:st.current_surah??st.start_surah??114,ayah:st.current_ayah??st.start_ayah??1},direction:mapDirection(st.memorization_direction),className:st.classes?.name??null,photoUrl:st.photo_url??null} satisfies Student});
}

const evaluationSelect = '*, students:student_id(full_name,admission_no,photo_url,class_id,section,memorization_direction,current_page,classes:class_id(name)), terms:term_id(name,term_number), evaluation_campaigns:campaign_id(title,opens_at,closes_at,status)';

function mapEvaluations(data: any[]): Evaluation[] {
  return data.map((e:any) => ({
    id:e.id, studentId:e.student_id, student:e.students?.full_name ?? 'Student',
    admissionNo:e.students?.admission_no ?? '', photoUrl:e.students?.photo_url ?? null,
    classId:e.students?.class_id ?? null, className:e.students?.classes?.name ?? null,
    memorizationDirection:e.students?.memorization_direction ?? null,
    studentSection:e.students?.section === 'boarding' ? 'Boarding' : 'Day',
    currentPage:e.students?.current_page ?? null,
    term:e.terms?.name ?? 'Term', number:e.evaluation_number, campaignId:e.campaign_id ?? null, campaign:e.evaluation_campaigns ?? null,
    status:mapStatus(e.status), from:{surah:e.from_surah,ayah:e.from_ayah} as Position,
    to:{surah:e.to_surah,ayah:e.to_ayah} as Position, memorizedAyahs:e.memorized_ayahs,
    memorizedPages:e.memorized_pages, memorizedHizbs:e.memorized_hizbs,
    memorization:Math.max(1,Math.min(5,Math.round(Number(e.memorization_score??e.accuracy_score??3)))) as 1|2|3|4|5,
    accuracy:Math.max(1,Math.min(5,Math.round(Number(e.accuracy_score??3)))) as 1|2|3|4|5, fluency:Math.max(1,Math.min(5,Math.round(Number(e.fluency_score??3)))) as 1|2|3|4|5,
    tajweed:Math.max(1,Math.min(5,Math.round(Number(e.tajweed_score??3)))) as 1|2|3|4|5, retention:Math.max(1,Math.min(5,Math.round(Number(e.retention_score??3)))) as 1|2|3|4|5,
    score:Number(e.score??0), grade:e.grade??null, comment:e.teacher_comment??''
  }));
}

export async function loadEvaluations(): Promise<Evaluation[]> {
  const db = supabase();
  const profile = await getCurrentProfile();
  let query = db.from('evaluations').select(evaluationSelect).order('submitted_at',{ascending:false});

  // Parents must never download the entire evaluation table. Scope the query to
  // their linked children first; this also keeps /reports and /parent fast.
  if (profile?.role === 'parent') {
    const { data: links, error: linksError } = await db.from('parent_students').select('student_id');
    if (linksError) {
      console.error('Parent student links load failed:', linksError);
      return [];
    }
    const studentIds = (links ?? []).map((row:any) => row.student_id).filter(Boolean);
    if (!studentIds.length) return [];
    query = query.in('student_id', studentIds);
  } else {
    query = query.limit(10000);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return mapEvaluations(data as any[]);
}

export async function loadAdmissions() {
  const { data, error } = await supabase().from('admissions').select('*').order('created_at',{ascending:false});
  if (error || !data) return [];
  return data.map((a:any)=>({id:a.application_no,name:a.applicant_name,parent:a.parent_name,section:a.requested_section==='boarding'?'Boarding':'Day',year:mapYear(a.requested_program_year),status:a.status}));
}

export async function loadInvoices(){
  const {data,error}=await supabase().from('invoices').select('*,students:student_id(full_name,admission_no,photo_url),terms:term_id(name,term_number,academic_years:academic_year_id(name))').order('generated_at',{ascending:false});
  if(error||!data)return []; return data;
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
  studentCount: number;
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
    .select('id,name,code,academic_year_id,program_year,capacity,active,academic_years:academic_year_id(name),class_teachers(teacher_id,is_primary,profiles:teacher_id(full_name)),students(count)')
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
    studentCount: c.students?.[0]?.count ?? 0,
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

export async function updateClass(id: string, input: {
  name: string;
  code: string;
  academicYearId?: string | null;
  programYear?: 'year_1' | 'year_2' | null;
  capacity?: number | null;
  active?: boolean;
}) {
  const { error } = await supabase().from('classes').update({
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
    academic_year_id: input.academicYearId || null,
    program_year: input.programYear || null,
    capacity: input.capacity || null,
    active: input.active ?? true,
  }).eq('id', id);
  if (error) throw error;
}

export async function deleteClass(id: string) {
  const { error } = await supabase().from('classes').delete().eq('id', id);
  if (error) throw error;
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

export async function updateStudentMemorization(studentId: string, input: {
  memorization_direction: 'nas_to_baqarah'|'baqarah_to_nas';
  start_surah: number;
  start_ayah: number;
  current_surah: number;
  current_ayah: number;
  program_year: 'year_1'|'year_2';
}) {
  const { error } = await supabase().from('students').update(input).eq('id', studentId);
  if (error) throw error;
}

export async function loadStaffProfiles() {
  const { data, error } = await supabase().from('profiles').select('id,full_name,role,email,phone,avatar_url,staff_id,employment_status,job_title,department,joined_on,created_at,id_expires_on,bio,show_on_website,username,qualifications,experience,subjects,preferred_email').order('full_name');
  if (error) { console.error('[AMQM] loadStaffProfiles error:', error); return []; }
  if (!data) return [];
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

export async function updateStaffProfile(id:string,input:{full_name?:string;email?:string|null;phone?:string|null;job_title?:string|null;department?:string|null;employment_status?:string;avatar_url?:string|null;bio?:string|null;show_on_website?:boolean;username?:string|null;role?:string;qualifications?:string|null;experience?:string|null;subjects?:string|null;preferred_email?:string|null}) {
  const { error } = await supabase().from('profiles').update(input).eq('id',id);
  if (error) throw error;
}

export async function resetStaffPassword(userId:string,newPassword:string){
  const{data,error}=await supabase().functions.invoke('reset-user-password',{body:{user_id:userId,new_password:newPassword}});
  if(error)throw error;
  if(data?.error)throw new Error(data.error);
}

export async function updateStaffCredentials(userId:string,{email,password}:{email?:string;password?:string}){
  if(!email&&!password)return;
  const{data,error}=await supabase().functions.invoke('reset-user-password',{body:{user_id:userId,new_email:email||undefined,new_password:password||undefined}});
  if(error)throw error;
  if(data?.error)throw new Error(data.error);
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
    direction:r.memorization_direction === 'nas_to_baqarah' ? 'Nas-to-Baqarah' : 'Baqarah-to-Nas',
    className:r.class_name, classId:r.class_id,
    parent:{name:r.parent_name,phone:r.parent_phone,relationship:r.parent_relationship},
  }));
}

export async function teacherUpdateStudentSection(studentId: string, section: 'day' | 'boarding') {
  const { error } = await supabase().rpc('teacher_update_student_section', {
    p_student_id: studentId,
    p_section: section,
  });
  if (error) throw error;
}

export async function teacherAssignStudentToClass(studentId: string) {
  const { error } = await supabase().rpc('teacher_assign_student_to_class', {
    p_student_id: studentId,
  });
  if (error) throw error;
}

export async function getUnassignedStudents() {
  const { data, error } = await supabase().rpc('get_unassigned_students');
  if (error || !data) return [];
  return data as { student_id: string; full_name: string; admission_no: string; section: string; program_year: string }[];
}

export async function loadTeacherEvaluations() {
  const { data, error } = await supabase().from('evaluations').select('*,students:student_id(full_name,admission_no,photo_url,section,program_year,current_surah,current_ayah,current_page,current_hizb,memorization_direction),terms:term_id(name,term_number),evaluation_campaigns:campaign_id(title,opens_at,closes_at,status)').order('teacher_visible_at',{ascending:false}).limit(10000);
  if (error || !data) return [];
  return data;
}

export async function submitTeacherEvaluation(input:{evaluationId:string;toSurah:number;toAyah:number;memorization:number;accuracy:number;fluency:number;tajweed:number;retention:number;score:number;comment:string}) {
  const { error } = await supabase().rpc('submit_teacher_evaluation',{
    p_evaluation_id:input.evaluationId,p_to_surah:input.toSurah,p_to_ayah:input.toAyah,p_memorization:input.memorization,p_accuracy:input.accuracy,
    p_fluency:input.fluency,p_tajweed:input.tajweed,p_retention:input.retention,p_score:input.score,p_comment:input.comment||null,
  });
  if(error) throw error;
}

export async function reviewEvaluation(id:string,action:'approve'|'return',adminComment?:string) {
  const { error } = await supabase().rpc('review_evaluation',{p_evaluation_id:id,p_action:action,p_admin_comment:adminComment||null});
  if(error) throw error;
}

export async function loadEvaluationCampaigns() {
  const { data, error } = await supabase().from('evaluation_campaigns').select('*,terms:term_id(name,term_number),evaluation_campaign_classes(class_id,classes:class_id(name))').order('created_at',{ascending:false});
  if(error){console.error('[AMQM] loadEvaluationCampaigns error:',error);return [];}
  if(!data) return []; return data;
}

export async function createEvaluationCampaign(input:{termId:string;evaluationNumber:1|2|3;title:string;opensAt:string;closesAt:string;classIds:string[]}) {
  const { data,error } = await supabase().rpc('create_evaluation_campaign_window',{p_term_id:input.termId,p_title:input.title,p_evaluation_number:input.evaluationNumber,p_opens_at:new Date(input.opensAt).toISOString(),p_closes_at:new Date(input.closesAt).toISOString(),p_class_ids:input.classIds});
  if(error) throw error; return data as string;
}

export async function loadOperationalTerms() {
  const { data,error } = await supabase().from('terms').select('id,name,term_number,starts_on,ends_on,academic_year_id,academic_years:academic_year_id(name,is_current)').order('starts_on',{ascending:false}).order('term_number');
  if(error||!data) return []; return data;
}

export async function ensureAcademicTerm(input:{yearName:string;yearStart:string;yearEnd:string;termNumber:number;termStart:string;termEnd:string}) {
  const { data,error } = await supabase().rpc('ensure_academic_term',{p_year_name:input.yearName,p_year_start:input.yearStart,p_year_end:input.yearEnd,p_term_number:input.termNumber,p_term_start:input.termStart,p_term_end:input.termEnd});
  if(error) throw error; return data as string;
}

export async function completeTerm(termId:string,notes?:string) {
  const { data,error } = await supabase().rpc('complete_term',{p_term_id:termId,p_notes:notes||null});
  if(error) throw error; return data;
}

export async function loadTermCompletions() {
  const { data,error } = await supabase().from('term_completions').select('*').order('completed_at',{ascending:false});
  if(error||!data) return []; return data;
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
 if(error) throw error;
 if(data?.application_no&&(input.bloodGroup||input.genotype)){
   await supabase().from('admissions').update({blood_group:input.bloodGroup||null,genotype:input.genotype||null}).eq('application_no',data.application_no);
 }
 return data;
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

export async function loadCurrentAcademicTerm(){
  const {data,error}=await supabase().rpc('get_current_academic_term');
  if(error) return null;
  return data && data.term_id ? data : null;
}
export async function setCurrentAcademicTerm(termId:string){
  const {data,error}=await supabase().rpc('set_current_academic_term',{p_term_id:termId});
  if(error) throw error; return data;
}

export async function loadStudentExtended(studentId:string){
  const {data,error}=await supabase().from('students').select('blood_group,genotype,home_address,nationality,state_of_origin,local_government,parent_name,parent_phone,parent_email,guardian_name,guardian_phone,guardian_email,guardian_relationship,emergency_contact_name,emergency_contact_phone,date_of_birth,gender').eq('id',studentId).maybeSingle();
  if(error||!data) return null; return data;
}

export async function updateStudentExtended(studentId:string,input:{blood_group?:string|null;genotype?:string|null;home_address?:string|null;nationality?:string|null;state_of_origin?:string|null;local_government?:string|null;parent_name?:string|null;parent_phone?:string|null;parent_email?:string|null;guardian_name?:string|null;guardian_phone?:string|null;guardian_email?:string|null;guardian_relationship?:string|null;emergency_contact_name?:string|null;emergency_contact_phone?:string|null}){
  const {error}=await supabase().from('students').update(input).eq('id',studentId);
  if(error) throw error;
}

type EvalMetrics = { ayahs: number; pages: number; hizbs: number; score: number; rubric: number; grade: string };

export type HistoricalEvalEntry = {
  studentId: string;
  startSurah: number; startAyah: number;
  eval1Surah?: number; eval1Ayah?: number;
  eval2Surah?: number; eval2Ayah?: number;
  eval1?: EvalMetrics;
  eval2?: EvalMetrics;
  eval3Surah?: number; eval3Ayah?: number;
  eval3?: EvalMetrics;
  direction?: string;
};

export async function bulkImportHistoricalEvals(
  entries: HistoricalEvalEntry[],
  termId: string,
  mode: 'eval1_eval2' | 'eval3' | 'capture_term' = 'eval1_eval2'
): Promise<{ imported: number }> {
  if (!entries.length) throw new Error('No valid entries to import');
  const { data, error } = await supabase().rpc('bulk_import_historical_evals', {
    p_term_id: termId,
    p_entries: entries as any,
    p_mode: mode,
  });
  if (error) throw error;
  return { imported: (data as any)?.imported ?? 0 };
}

// ── Centralized staff signature system ────────────────────────────────────────

export async function saveMySignature(signatureData: string): Promise<void> {
  const { error } = await supabase().rpc('save_my_signature', { p_signature_data: signatureData });
  if (error) throw error;
}

export async function getMySignature(): Promise<{ signature_data: string | null; signature_updated_at: string | null }> {
  const { data, error } = await supabase().rpc('get_my_signature');
  if (error || !data || !(data as any[]).length) return { signature_data: null, signature_updated_at: null };
  return (data as any[])[0];
}

export type StaffSignatureRow = {
  staff_id: string; full_name: string; role: string;
  job_title: string | null; department: string | null; staff_id_no: string | null;
  has_signature: boolean; signature_data: string | null; signature_updated_at: string | null;
};

export async function loadStaffSignaturesAdmin(): Promise<StaffSignatureRow[]> {
  const { data, error } = await supabase().rpc('load_staff_signatures_admin');
  if (error || !data) return [];
  return data as StaffSignatureRow[];
}

export async function adminClearStaffSignature(staffId: string): Promise<void> {
  const { error } = await supabase().rpc('admin_clear_staff_signature', { p_staff_id: staffId });
  if (error) throw error;
}

export type ReportCardSig = { signer_name: string; signature_data: string | null };
export type ReportCardSignatures = {
  teachers: Record<string, ReportCardSig>;
  supervisor: ReportCardSig | null;
  director: ReportCardSig | null;
};

export async function loadSignaturesForReportCards(): Promise<ReportCardSignatures> {
  const { data, error } = await supabase().rpc('load_signatures_for_report_cards');
  if (error || !data) return { teachers: {}, supervisor: null, director: null };
  return data as ReportCardSignatures;
}

// ── Student removal system ─────────────────────────────────────────────────

export type RemovedStudent = {
  id: string; admission_no: string; full_name: string; photo_url: string | null;
  gender: string | null; section: string; program_year: string;
  class_name: string | null; status: string;
  removal_reason: string | null; removal_notes: string | null;
  removed_at: string | null; removed_by_name: string | null;
};

export async function loadRemovedStudents(): Promise<RemovedStudent[]> {
  const { data, error } = await supabase().rpc('admin_get_removed_students');
  if (error || !data) return [];
  return data as RemovedStudent[];
}

export async function removeStudent(
  studentId: string, status: 'suspended' | 'expelled' | 'withdrawn',
  reason: string, notes?: string
): Promise<void> {
  const { error } = await supabase().rpc('admin_remove_student', {
    p_student_id: studentId, p_status: status, p_reason: reason, p_notes: notes ?? null,
  });
  if (error) throw error;
}

export async function reinstateStudent(studentId: string): Promise<void> {
  const { error } = await supabase().rpc('admin_reinstate_student', { p_student_id: studentId });
  if (error) throw error;
}

export async function teacherSubmitHistoricalEval3(p: {
  studentId: string; termId: string;
  startSurah: number; startAyah: number;
  endSurah: number; endAyah: number;
  score: number; rubric: number; grade: string;
  ayahs: number; pages: number; hizbs: number;
}): Promise<void> {
  const { error } = await supabase().rpc('teacher_submit_historical_eval3', {
    p_student_id:  p.studentId,
    p_term_id:     p.termId,
    p_start_surah: p.startSurah,
    p_start_ayah: p.startAyah,
    p_end_surah:   p.endSurah,
    p_end_ayah:   p.endAyah,
    p_score:       p.score,
    p_rubric:      p.rubric,
    p_grade:       p.grade,
    p_ayahs:       p.ayahs,
    p_pages:       p.pages,
    p_hizbs:       p.hizbs,
  });
  if (error) throw error;
}

export async function adminApproveClassHistoricalEvals(termId: string, classId: string): Promise<number> {
  const { data, error } = await supabase().rpc('admin_approve_class_historical_evals', {
    p_term_id:  termId,
    p_class_id: classId,
  });
  if (error) throw error;
  return data as number;
}
