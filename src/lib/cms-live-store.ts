import { createClient } from '@/lib/supabase/client';

export type CMSSection = {
  id: string;
  section_key: string;
  title: string | null;
  content: Record<string, any>;
  sort_order: number;
  visible: boolean;
};

export type CMSSettings = Record<string, any>;

const db = () => createClient();

export async function loadCMSSections(includeHidden = false): Promise<CMSSection[]> {
  let query = db().from('homepage_sections').select('id,section_key,title,content,sort_order,visible').order('sort_order');
  if (!includeHidden) query = query.eq('visible', true);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as CMSSection[];
}

export async function loadCMSSettings(): Promise<CMSSettings> {
  const { data, error } = await db().from('site_settings').select('key,value');
  if (error || !data) return {};
  return Object.fromEntries(data.map((r: any) => [r.key, r.value]));
}

export async function saveCMSSection(section: Pick<CMSSection, 'id'|'section_key'|'title'|'content'|'sort_order'|'visible'>) {
  const { error } = await db().from('homepage_sections').upsert({
    id: section.id,
    section_key: section.section_key,
    title: section.title,
    content: section.content,
    sort_order: section.sort_order,
    visible: section.visible,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'section_key' });
  if (error) throw error;
}

export async function saveCMSSetting(key: string, value: any) {
  const { error } = await db().from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export async function loadPublicTeam() {
  const { data, error } = await db().from('public_team_profiles').select('id,full_name,role_title,category,photo_url,brief_bio,full_profile,display_on_homepage,published,sort_order,qualifications,experience,subjects').eq('published', true).eq('display_on_homepage', true).order('sort_order');
  return error || !data ? [] : data;
}

export async function loadPublicAlumni() {
  const { data, error } = await db().from('alumni_profiles').select('*').eq('published', true).order('display_order');
  return error || !data ? [] : data;
}

export async function loadAdminTeam() {
  const { data, error } = await db().from('public_team_profiles').select('*').order('sort_order').order('full_name');
  return error || !data ? [] : data;
}

export async function loadAdminAlumni() {
  const { data, error } = await db().from('alumni_profiles').select('*').order('display_order').order('full_name');
  return error || !data ? [] : data;
}

export async function saveTeamProfile(profile: any) {
  const { data, error } = await db().from('public_team_profiles').upsert(profile).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTeamProfile(id: string) {
  const { error } = await db().from('public_team_profiles').delete().eq('id', id);
  if (error) throw error;
}

export async function saveAlumniProfile(profile: any) {
  const { data, error } = await db().from('alumni_profiles').upsert(profile).select().single();
  if (error) throw error;
  return data;
}

export async function deleteAlumniProfile(id: string) {
  const { error } = await db().from('alumni_profiles').delete().eq('id', id);
  if (error) throw error;
}

export async function loadPublicTeachers() {
  const { data, error } = await db().from('profiles')
    .select('id,full_name,job_title,department,avatar_url,bio,qualifications,experience,subjects')
    .eq('role', 'teacher')
    .eq('employment_status', 'active')
    .order('full_name');
  return error || !data ? [] : data;
}

export async function loadPublicHomepageMedia() {
  const { data, error } = await db().from('homepage_media').select('*').eq('visible', true).order('sort_order').order('created_at', { ascending: false });
  return error || !data ? [] : data;
}

export async function loadAdminHomepageMedia() {
  const { data, error } = await db().from('homepage_media').select('*').order('sort_order').order('created_at', { ascending: false });
  return error || !data ? [] : data;
}

export async function saveHomepageMedia(item: any) {
  const { data, error } = await db().from('homepage_media').upsert({
    id: item.id || undefined,
    title: item.title,
    description: item.description || null,
    category: item.category || 'Student Activities',
    media_type: item.media_type,
    public_url: item.public_url,
    storage_path: item.storage_path || null,
    alt_text: item.alt_text || null,
    visible: item.visible !== false,
    sort_order: Number(item.sort_order || 0),
    updated_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteHomepageMedia(id: string) {
  const { error } = await db().from('homepage_media').delete().eq('id', id);
  if (error) throw error;
}
