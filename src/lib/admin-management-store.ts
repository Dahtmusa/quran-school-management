import { createClient } from '@/lib/supabase/client';

const db = () => createClient();

export async function loadMediaLibrary() {
  const { data, error } = await db().from('media_library').select('*').order('created_at', { ascending: false });
  if (error || !data) return [];
  return data;
}

export async function uploadPublicMedia(file: File, meta: { altText?: string; caption?: string } = {}) {
  const client = db();
  const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}-${safe}`;
  const { error: uploadError } = await client.storage.from('school-public-media').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
  if (uploadError) throw uploadError;
  const { data: publicUrl } = client.storage.from('school-public-media').getPublicUrl(path);
  const { data: user } = await client.auth.getUser();
  const { data, error } = await client.from('media_library').insert({
    file_name: file.name,
    storage_path: path,
    alt_text: meta.altText || null,
    caption: meta.caption || null,
    uploaded_by: user.user?.id || null,
    is_public: true,
  }).select().single();
  if (error) {
    await client.storage.from('school-public-media').remove([path]);
    throw error;
  }
  return { ...data, public_url: publicUrl.publicUrl };
}

export async function deletePublicMedia(media: { id: string; storage_path: string }) {
  const client = db();
  const { error: storageError } = await client.storage.from('school-public-media').remove([media.storage_path]);
  if (storageError) throw storageError;
  const { error } = await client.from('media_library').delete().eq('id', media.id);
  if (error) throw error;
}

export async function loadFinanceSummary() {
  const client = db();
  const [{ data: structures }, { data: fees }, { data: payments }] = await Promise.all([
    client.from('fee_structures').select('*,academic_years:academic_year_id(name),terms:term_id(name,term_number)'),
    client.from('student_fees').select('id,student_id,fee_structure_id,amount_due,amount_paid,students:student_id(full_name,admission_no,section),fee_structures:fee_structure_id(id,term_id,academic_year_id,section,name,terms:term_id(name,term_number),academic_years:academic_year_id(name))'),
    client.from('payments').select('id,student_id,amount,paid_on,method,reference,notes,students:student_id(full_name,admission_no) ').order('paid_on', { ascending: false }),
  ]);
  return { structures: structures || [], fees: fees || [], payments: payments || [] };
}

export async function loadFeeStructures() {
  const { data, error } = await db().from('fee_structures').select('*,academic_years:academic_year_id(name),terms:term_id(name)').order('due_date', { ascending: true });
  if (error || !data) return [];
  return data;
}

export async function updateFeeStructure(id: string, input: { academicYearId: string; termId?: string | null; section: 'day' | 'boarding'; name: string; amount: number; dueDate?: string | null }) {
  const { data, error } = await db().from('fee_structures').update({
    academic_year_id: input.academicYearId,
    term_id: input.termId || null,
    section: input.section,
    name: input.name.trim(),
    amount: input.amount,
    due_date: input.dueDate || null,
  }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteFeeStructure(id: string) {
  const { error } = await db().from('fee_structures').delete().eq('id', id);
  if (error) throw error;
}

export async function syncStudentFeeAllocations(termId: string) {
  const { data, error } = await db().rpc('sync_student_fee_allocations', { p_term_id: termId });
  if (error) throw error;
  return Number(data || 0);
}

export async function createFeeStructure(input: { academicYearId: string; termId?: string | null; section: 'day' | 'boarding'; name: string; amount: number; dueDate?: string | null }) {
  const { data, error } = await db().from('fee_structures').insert({
    academic_year_id: input.academicYearId,
    term_id: input.termId || null,
    section: input.section,
    name: input.name.trim(),
    amount: input.amount,
    due_date: input.dueDate || null,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function recordPayment(input: { studentId: string; amount: number; method?: string; reference?: string; notes?: string }) {
  const client = db();
  const { data, error } = await client.from('payments').insert({
    student_id: input.studentId,
    amount: input.amount,
    method: input.method || null,
    reference: input.reference || null,
    notes: input.notes || null,
  }).select().single();
  if (error) throw error;
  const { data: feeRows } = await client.from('student_fees').select('id,amount_due,amount_paid').eq('student_id', input.studentId);
  let remaining = input.amount;
  for (const fee of feeRows || []) {
    if (remaining <= 0) break;
    const balance = Math.max(0, Number(fee.amount_due) - Number(fee.amount_paid));
    const applied = Math.min(balance, remaining);
    if (applied > 0) {
      await client.from('student_fees').update({ amount_paid: Number(fee.amount_paid) + applied }).eq('id', fee.id);
      remaining -= applied;
    }
  }
  return data;
}

export async function loadProgramSetup() {
  const client = db();
  const [{ data: programs }, { data: structures }, { data: years }, { data: terms }] = await Promise.all([
    client.from('programs').select('*').order('name'),
    client.from('program_structure_versions').select('*').order('effective_from', { ascending: false }),
    client.from('program_year_definitions').select('*').order('display_order'),
    client.from('program_term_definitions').select('*').order('display_order'),
  ]);
  return { programs: programs || [], structures: structures || [], years: years || [], terms: terms || [] };
}

export async function createProgram(input: { name: string; description?: string }) {
  const { data, error } = await db().from('programs').insert({ name: input.name.trim(), description: input.description?.trim() || null, active: true }).select().single();
  if (error) throw error;
  return data;
}

export async function updateProgram(id: string, input: { name?: string; description?: string; active?: boolean }) {
  const { error } = await db().from('programs').update(input).eq('id', id);
  if (error) throw error;
}

export async function createProgramStructure(input: { programId: string; versionName: string; effectiveFrom: string; graduationRequiresQuranCompletion?: boolean }) {
  const client = db();
  if (input.graduationRequiresQuranCompletion !== false) {
    await client.from('program_structure_versions').update({ is_current: false }).eq('program_id', input.programId);
  }
  const { data, error } = await client.from('program_structure_versions').insert({
    program_id: input.programId,
    version_name: input.versionName.trim(),
    effective_from: input.effectiveFrom,
    is_current: true,
    graduation_requires_quran_completion: input.graduationRequiresQuranCompletion !== false,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function createProgramYear(input: { structureId: string; yearNumber: number; name: string; displayOrder?: number }) {
  const { data, error } = await db().from('program_year_definitions').insert({ structure_id: input.structureId, year_number: input.yearNumber, name: input.name.trim(), display_order: input.displayOrder ?? input.yearNumber }).select().single();
  if (error) throw error;
  return data;
}

export async function createProgramTerm(input: { yearDefinitionId: string; termNumber: number; name: string; startsMonth?: number | null; endsMonth?: number | null; evaluationCount?: number }) {
  const { data, error } = await db().from('program_term_definitions').insert({ year_definition_id: input.yearDefinitionId, term_number: input.termNumber, name: input.name.trim(), display_order: input.termNumber, starts_month: input.startsMonth || null, ends_month: input.endsMonth || null, evaluation_count: input.evaluationCount ?? 3 }).select().single();
  if (error) throw error;
  return data;
}
