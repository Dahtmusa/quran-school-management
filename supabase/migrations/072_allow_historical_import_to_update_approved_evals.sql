-- Migration 072: Allow historical import to update approved evaluations.
--
-- The prevent_approved_evaluation_edit trigger blocks UPDATE on approved evals.
-- When bulk_import_historical_evals (SECURITY DEFINER) calls ON CONFLICT DO UPDATE,
-- the trigger fires but my_role() may resolve incorrectly in that context, causing
-- "Approved evaluations are locked and cannot be edited." even for admins.
--
-- Fix: add the same app.historical_import bypass used by validate_evaluation_position.

CREATE OR REPLACE FUNCTION public.prevent_approved_evaluation_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  -- Historical import is always allowed to overwrite approved evals.
  IF current_setting('app.historical_import', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF old.status = 'approved' AND new.status = 'approved'
     AND public.my_role() NOT IN ('super_admin', 'admin', 'principal')
  THEN
    RAISE EXCEPTION 'Approved evaluations are locked and cannot be edited.';
  END IF;

  RETURN NEW;
END;
$$;
