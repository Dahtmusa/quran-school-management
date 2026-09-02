import { createClient } from '@/lib/supabase/client';

const db = () => createClient();

export type GlobalSearchResult = { type: string; title: string; subtitle?: string; href: string };

export async function globalSearch(term: string): Promise<GlobalSearchResult[]> {
  const q = term.trim().replace(/[,%()]/g, ' ');
  if (q.length < 2) return [];
  const client = db();
  const like = `%${q}%`;
  const [students, staff, classes, admissions, media, pages] = await Promise.all([
    client.from('students').select('id,full_name,admission_no,section').or(`full_name.ilike.${like},admission_no.ilike.${like}`).limit(8),
    client.from('profiles').select('id,full_name,staff_id,role').or(`full_name.ilike.${like},staff_id.ilike.${like}`).limit(8),
    client.from('classes').select('id,name,code').or(`name.ilike.${like},code.ilike.${like}`).limit(6),
    client.from('admissions').select('id,application_no,applicant_name,status').or(`applicant_name.ilike.${like},application_no.ilike.${like}`).limit(8),
    client.from('homepage_media').select('id,title,category').or(`title.ilike.${like},category.ilike.${like}`).limit(6),
    client.from('pages').select('id,title,slug').or(`title.ilike.${like},slug.ilike.${like}`).limit(6),
  ]);
  return [
    ...(students.data || []).map((x: any) => ({ type: 'Student', title: x.full_name, subtitle: `${x.admission_no} · ${x.section}`, href: '/students' })),
    ...(staff.data || []).map((x: any) => ({ type: 'Staff', title: x.full_name, subtitle: `${x.staff_id || 'No staff ID'} · ${x.role}`, href: '/cms' })),
    ...(classes.data || []).map((x: any) => ({ type: 'Class', title: x.name, subtitle: x.code, href: '/classes' })),
    ...(admissions.data || []).map((x: any) => ({ type: 'Admission', title: x.applicant_name, subtitle: `${x.application_no} · ${x.status}`, href: '/admissions/manage' })),
    ...(media.data || []).map((x: any) => ({ type: 'Website media', title: x.title, subtitle: x.category, href: '/cms?tab=media' })),
    ...(pages.data || []).map((x: any) => ({ type: 'Website page', title: x.title, subtitle: `/${x.slug}`, href: '/cms' })),
  ].slice(0, 30);
}
