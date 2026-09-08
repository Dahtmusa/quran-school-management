-- Migration 074: Replace term-based signatures with profile-based signatures.
--
-- Signatures are now permanent profile data (like a phone number or photo),
-- not tied to any term. One signature per role per class (class_id NULL for
-- supervisor/director). Report card printing reads from this table directly.

DROP TABLE IF EXISTS public.term_signatures CASCADE;
DROP FUNCTION IF EXISTS public.save_term_signature(uuid, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.load_term_signatures(uuid);

CREATE TABLE IF NOT EXISTS public.report_card_signatures (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  role          text        NOT NULL CHECK (role IN ('class_teacher', 'supervisor', 'director')),
  class_id      uuid        REFERENCES public.classes(id) ON DELETE CASCADE,
  signer_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  signer_name   text        NOT NULL,
  signature_data text       NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX report_card_signatures_unique_idx
  ON public.report_card_signatures (
    role,
    COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

ALTER TABLE public.report_card_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read report_card_signatures"
  ON public.report_card_signatures FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated write report_card_signatures"
  ON public.report_card_signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Save a signature (no term — works like updating a profile field)
CREATE OR REPLACE FUNCTION public.save_report_card_signature(
  p_role          text,
  p_class_id      uuid,
  p_signer_name   text,
  p_signature_data text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.report_card_signatures
  WHERE role = p_role
    AND ((class_id IS NULL AND p_class_id IS NULL) OR class_id = p_class_id);

  INSERT INTO public.report_card_signatures (role, class_id, signer_id, signer_name, signature_data)
  VALUES (p_role, p_class_id, auth.uid(), p_signer_name, p_signature_data);
END;
$$;

-- Load all signatures (no term filter needed)
CREATE OR REPLACE FUNCTION public.load_report_card_signatures()
RETURNS TABLE(
  id            uuid,
  role          text,
  class_id      uuid,
  signer_name   text,
  signature_data text,
  updated_at    timestamptz
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, role, class_id, signer_name, signature_data, updated_at
  FROM public.report_card_signatures;
$$;
