-- Migration 073: Term signatures for report cards.
--
-- Stores class teacher, supervisor, and director signatures per term.
-- Class teacher signature is per-class; supervisor/director are per-term (class_id NULL).

CREATE TABLE IF NOT EXISTS public.term_signatures (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id     uuid        NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('class_teacher', 'supervisor', 'director')),
  class_id    uuid        REFERENCES public.classes(id) ON DELETE SET NULL,
  signer_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  signer_name text        NOT NULL,
  signature_data text     NOT NULL,  -- base64 PNG data URL
  signed_at   timestamptz NOT NULL DEFAULT now()
);

-- One signature per role per class per term (NULL class_id handled by COALESCE)
CREATE UNIQUE INDEX term_signatures_unique_idx
  ON public.term_signatures (
    term_id, role,
    COALESCE(class_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

ALTER TABLE public.term_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read term_signatures"
  ON public.term_signatures FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated write term_signatures"
  ON public.term_signatures FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RPC: save (upsert) a signature — uses delete+insert to handle NULL class_id uniqueness
CREATE OR REPLACE FUNCTION public.save_term_signature(
  p_term_id       uuid,
  p_role          text,
  p_class_id      uuid,
  p_signer_name   text,
  p_signature_data text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.term_signatures
  WHERE term_id = p_term_id
    AND role    = p_role
    AND (
      (class_id IS NULL     AND p_class_id IS NULL) OR
      (class_id = p_class_id)
    );

  INSERT INTO public.term_signatures (term_id, role, class_id, signer_id, signer_name, signature_data)
  VALUES (p_term_id, p_role, p_class_id, auth.uid(), p_signer_name, p_signature_data);
END;
$$;

-- RPC: load all signatures for a term
CREATE OR REPLACE FUNCTION public.load_term_signatures(p_term_id uuid)
RETURNS TABLE(
  id            uuid,
  role          text,
  class_id      uuid,
  signer_name   text,
  signature_data text,
  signed_at     timestamptz
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, role, class_id, signer_name, signature_data, signed_at
  FROM public.term_signatures
  WHERE term_id = p_term_id;
$$;
