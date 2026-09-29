-- The profile-photo upload policy on the school-profile-media bucket
-- previously whitelisted only teacher / super_admin / admin / principal /
-- admissions. That left every other staff role (finance, security,
-- accountant, librarian, etc.) unable to change their own profile photo
-- from the Topbar's Edit Profile modal -- the upload silently failed at
-- the storage layer with an RLS denial.
--
-- Broaden the whitelist to any authenticated non-parent role. Parents
-- still can't upload here because there's no parent surface for it and we
-- don't want random parent avatars in the staff/students folders. Delete
-- policy stays admin-only so a non-admin can't wipe someone else's photo.

DROP POLICY IF EXISTS "profile media upload" ON storage.objects;
CREATE POLICY "profile media upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-profile-media'
    AND coalesce(public.my_role(), '') <> 'parent'
  );

NOTIFY pgrst, 'reload schema';
