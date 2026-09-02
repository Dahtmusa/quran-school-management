-- Consolidate overlapping RLS policies without changing intended access semantics.

-- academic_years
DROP POLICY IF EXISTS "admins manage academic years" ON public.academic_years;
CREATE POLICY "admins insert academic years" ON public.academic_years FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins update academic years" ON public.academic_years FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins delete academic years" ON public.academic_years FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));

-- admissions: one insert policy for public submission + privileged management
DROP POLICY IF EXISTS "admissions staff manage admissions" ON public.admissions;
DROP POLICY IF EXISTS "public submit admissions" ON public.admissions;
CREATE POLICY "admissions insert" ON public.admissions FOR INSERT TO anon, authenticated WITH CHECK ((status = 'submitted') OR (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role])));
CREATE POLICY "admissions staff update" ON public.admissions FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role]));
CREATE POLICY "admissions staff delete" ON public.admissions FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role]));

-- alumni
DROP POLICY IF EXISTS "admins manage alumni" ON public.alumni_profiles;
CREATE POLICY "admins insert alumni" ON public.alumni_profiles FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins update alumni" ON public.alumni_profiles FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins delete alumni" ON public.alumni_profiles FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));

-- attendance submission items
DROP POLICY IF EXISTS "admins manage attendance submission items" ON public.attendance_submission_items;
DROP POLICY IF EXISTS "security can create attendance submission items" ON public.attendance_submission_items;
CREATE POLICY "attendance submission items insert" ON public.attendance_submission_items FOR INSERT TO authenticated WITH CHECK ((EXISTS (SELECT 1 FROM public.attendance_submissions s WHERE s.id = attendance_submission_items.submission_id AND s.submitted_by = (SELECT auth.uid()))) OR (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])));
CREATE POLICY "admins update attendance submission items" ON public.attendance_submission_items FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins delete attendance submission items" ON public.attendance_submission_items FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));

-- attendance submissions
DROP POLICY IF EXISTS "admins manage attendance submissions" ON public.attendance_submissions;
DROP POLICY IF EXISTS "security can create attendance submissions" ON public.attendance_submissions;
CREATE POLICY "attendance submissions insert" ON public.attendance_submissions FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['security'::user_role,'super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins update attendance submissions" ON public.attendance_submissions FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins delete attendance submissions" ON public.attendance_submissions FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));

-- evaluations: combine teacher draft edits and admin approvals
DROP POLICY IF EXISTS "admins approve evaluations" ON public.evaluations;
DROP POLICY IF EXISTS "teachers update drafts" ON public.evaluations;
CREATE POLICY "authorized evaluation updates" ON public.evaluations FOR UPDATE TO authenticated USING ((my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) OR ((teacher_id = (SELECT auth.uid())) AND (status = ANY (ARRAY['draft'::evaluation_status,'returned'::evaluation_status])))) WITH CHECK ((my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) OR (teacher_id = (SELECT auth.uid())));

-- fee structures
DROP POLICY IF EXISTS "finance admins manage fee structures" ON public.fee_structures;
CREATE POLICY "finance admins insert fee structures" ON public.fee_structures FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'finance'::user_role]));
CREATE POLICY "finance admins update fee structures" ON public.fee_structures FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'finance'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'finance'::user_role]));
CREATE POLICY "finance admins delete fee structures" ON public.fee_structures FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'finance'::user_role]));

-- certificates
DROP POLICY IF EXISTS "admins manage certificates" ON public.graduation_certificates;
CREATE POLICY "admins insert certificates" ON public.graduation_certificates FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins update certificates" ON public.graduation_certificates FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins delete certificates" ON public.graduation_certificates FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));

-- homepage sections
DROP POLICY IF EXISTS "admins manage homepage" ON public.homepage_sections;
CREATE POLICY "admins insert homepage" ON public.homepage_sections FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins update homepage" ON public.homepage_sections FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins delete homepage" ON public.homepage_sections FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));

-- media library
DROP POLICY IF EXISTS "admins manage media" ON public.media_library;
CREATE POLICY "admins insert media" ON public.media_library FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins update media" ON public.media_library FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins delete media" ON public.media_library FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));

-- pages
DROP POLICY IF EXISTS "admins manage pages" ON public.pages;
CREATE POLICY "admins insert pages" ON public.pages FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins update pages" ON public.pages FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins delete pages" ON public.pages FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));

-- parent links
DROP POLICY IF EXISTS "admins manage parent links" ON public.parent_students;
CREATE POLICY "admins insert parent links" ON public.parent_students FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role]));
CREATE POLICY "admins update parent links" ON public.parent_students FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role]));
CREATE POLICY "admins delete parent links" ON public.parent_students FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role]));

-- structure versions
DROP POLICY IF EXISTS "admins manage structures" ON public.program_structure_versions;
CREATE POLICY "admins insert structures" ON public.program_structure_versions FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins update structures" ON public.program_structure_versions FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins delete structures" ON public.program_structure_versions FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));

-- term definitions
DROP POLICY IF EXISTS "admins manage structure terms" ON public.program_term_definitions;
CREATE POLICY "admins insert structure terms" ON public.program_term_definitions FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins update structure terms" ON public.program_term_definitions FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins delete structure terms" ON public.program_term_definitions FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));

-- year definitions
DROP POLICY IF EXISTS "admins manage structure years" ON public.program_year_definitions;
CREATE POLICY "admins insert structure years" ON public.program_year_definitions FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins update structure years" ON public.program_year_definitions FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins delete structure years" ON public.program_year_definitions FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));

-- programs
DROP POLICY IF EXISTS "admins manage programs" ON public.programs;
CREATE POLICY "admins insert programs" ON public.programs FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins update programs" ON public.programs FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins delete programs" ON public.programs FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));

-- team profiles
DROP POLICY IF EXISTS "admins manage team profiles" ON public.public_team_profiles;
CREATE POLICY "admins insert team profiles" ON public.public_team_profiles FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins update team profiles" ON public.public_team_profiles FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins delete team profiles" ON public.public_team_profiles FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));

-- report cards
DROP POLICY IF EXISTS "admins manage report cards" ON public.report_cards;
CREATE POLICY "admins insert report cards" ON public.report_cards FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins update report cards" ON public.report_cards FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins delete report cards" ON public.report_cards FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));

-- site settings
DROP POLICY IF EXISTS "admins manage settings" ON public.site_settings;
CREATE POLICY "admins insert settings" ON public.site_settings FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins update settings" ON public.site_settings FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));
CREATE POLICY "admins delete settings" ON public.site_settings FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role]));

-- monthly Quran progress
DROP POLICY IF EXISTS "admins manage monthly quran progress" ON public.student_monthly_quran_progress;
CREATE POLICY "admins insert monthly quran progress" ON public.student_monthly_quran_progress FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins update monthly quran progress" ON public.student_monthly_quran_progress FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins delete monthly quran progress" ON public.student_monthly_quran_progress FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));

-- enrollments
DROP POLICY IF EXISTS "admins manage enrollments" ON public.student_program_enrollments;
CREATE POLICY "admins insert enrollments" ON public.student_program_enrollments FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role]));
CREATE POLICY "admins update enrollments" ON public.student_program_enrollments FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role]));
CREATE POLICY "admins delete enrollments" ON public.student_program_enrollments FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role]));

-- students: merge three SELECT policies into one
DROP POLICY IF EXISTS "admins manage students" ON public.students;
DROP POLICY IF EXISTS "parents see own students" ON public.students;
DROP POLICY IF EXISTS "teachers read assigned students" ON public.students;
CREATE POLICY "authorized users read students" ON public.students FOR SELECT TO authenticated USING ((my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'finance'::user_role,'admissions'::user_role])) OR (EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.student_id = students.id AND ps.parent_id = (SELECT auth.uid()))) OR (EXISTS (SELECT 1 FROM public.teacher_students ts WHERE ts.student_id = students.id AND ts.teacher_id = (SELECT auth.uid()))));
CREATE POLICY "admins insert students" ON public.students FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role]));
CREATE POLICY "admins update students" ON public.students FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role]));
CREATE POLICY "admins delete students" ON public.students FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role,'admissions'::user_role]));

-- teacher links
DROP POLICY IF EXISTS "admins manage teacher links" ON public.teacher_students;
DROP POLICY IF EXISTS "authorized users read teacher links" ON public.teacher_students;
CREATE POLICY "authorized users read teacher links" ON public.teacher_students FOR SELECT TO authenticated USING ((teacher_id = (SELECT auth.uid())) OR (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])));
CREATE POLICY "admins insert teacher links" ON public.teacher_students FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins update teacher links" ON public.teacher_students FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins delete teacher links" ON public.teacher_students FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));

-- terms
DROP POLICY IF EXISTS "admins manage terms" ON public.terms;
CREATE POLICY "admins insert terms" ON public.terms FOR INSERT TO authenticated WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins update terms" ON public.terms FOR UPDATE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role])) WITH CHECK (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
CREATE POLICY "admins delete terms" ON public.terms FOR DELETE TO authenticated USING (my_role() = ANY (ARRAY['super_admin'::user_role,'admin'::user_role,'principal'::user_role]));
