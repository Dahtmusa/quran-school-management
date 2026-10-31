-- Teachers should no longer be able to change student records. The
-- only legitimate way a teacher now moves a student's Qur'an
-- position is through the evaluation flow (submit, admin approves,
-- trigger advances the student profile). This migration revokes
-- execute on the four legacy teacher mutation RPCs so even a
-- direct API call fails with "permission denied".
--
-- UI side strips the Edit Qur'an / Freeze / Inactive / Add student
-- buttons from the teacher views in a separate client change.

revoke execute on function public.teacher_update_student_quran_profile(
  uuid, public.memorization_direction, smallint, smallint
) from authenticated;

revoke execute on function public.teacher_set_student_status(
  uuid, text
) from authenticated;

revoke execute on function public.teacher_update_student_section(
  uuid, public.section_type
) from authenticated;

revoke execute on function public.teacher_assign_student_to_class(
  uuid
) from authenticated;

notify pgrst, 'reload schema';
