-- Threaded replies on notifications. A reply IS itself a notifications
-- row; it just points at its parent via parent_id. The reply's
-- recipient_id is set to the original notification's sender, so the
-- admin who sent the original gets a bell for the response.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notifications_parent_idx
  ON public.notifications(parent_id, created_at);

-- A thread lookup: given a notification id and the signed-in user, this
-- returns the whole chain (root + every reply, in order). The RPC trusts
-- RLS: the user can see only threads they are part of, because every row
-- in the chain already enforces recipient_id = auth.uid() OR admin role.
CREATE OR REPLACE FUNCTION public.notification_thread(p_root_id uuid)
RETURNS SETOF public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        uuid := auth.uid();
  v_role      text := public.my_role();
  v_root      public.notifications;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  -- Resolve root even if the caller handed in a reply's id.
  SELECT * INTO v_root FROM public.notifications WHERE id = p_root_id;
  IF v_root.id IS NULL THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;
  IF v_root.parent_id IS NOT NULL THEN
    SELECT * INTO v_root FROM public.notifications WHERE id = v_root.parent_id;
  END IF;

  -- Permission: either admin, or the caller participated in this thread.
  IF v_role NOT IN ('super_admin','admin','principal')
     AND v_root.recipient_id <> v_me
     AND v_root.created_by  <> v_me
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications r
       WHERE r.parent_id = v_root.id
         AND (r.recipient_id = v_me OR r.created_by = v_me)
     )
  THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  RETURN QUERY
    SELECT * FROM public.notifications WHERE id = v_root.id
    UNION ALL
    SELECT * FROM public.notifications WHERE parent_id = v_root.id
    ORDER BY created_at;
END;
$$;
GRANT EXECUTE ON FUNCTION public.notification_thread(uuid) TO authenticated;

-- Post a reply. The caller must be the recipient (or created_by) of the
-- root notification or of any earlier reply in the same thread; the new
-- row's recipient_id is the ORIGINAL sender -- so admin -> teacher ->
-- admin -> teacher ping-pong works without extra config. kind defaults
-- to 'reply' so UI can style replies differently if we want to later.
CREATE OR REPLACE FUNCTION public.reply_to_notification(
  p_parent_id uuid,
  p_body      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me        uuid := auth.uid();
  v_parent    public.notifications;
  v_root_id   uuid;
  v_root      public.notifications;
  v_prev      public.notifications;
  v_recipient uuid;
  v_title     text;
  v_new_id    uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF trim(coalesce(p_body,'')) = '' THEN
    RAISE EXCEPTION 'Reply body is empty';
  END IF;

  SELECT * INTO v_parent FROM public.notifications WHERE id = p_parent_id;
  IF v_parent.id IS NULL THEN
    RAISE EXCEPTION 'Original notification not found';
  END IF;

  v_root_id := coalesce(v_parent.parent_id, v_parent.id);
  SELECT * INTO v_root FROM public.notifications WHERE id = v_root_id;

  -- The caller must have been involved somewhere in the thread.
  IF v_root.recipient_id <> v_me
     AND v_root.created_by  <> v_me
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications r
       WHERE r.parent_id = v_root.id
         AND (r.recipient_id = v_me OR r.created_by = v_me)
     )
  THEN
    RAISE EXCEPTION 'Not permitted to reply to this thread';
  END IF;

  -- Where does the reply go? To whoever posted the LAST message that was
  -- not from the caller. Falls back to the root sender.
  SELECT * INTO v_prev
  FROM public.notifications
  WHERE (id = v_root.id OR parent_id = v_root.id)
    AND created_by IS NOT NULL
    AND created_by <> v_me
  ORDER BY created_at DESC
  LIMIT 1;

  v_recipient := coalesce(v_prev.created_by, v_root.created_by, v_root.recipient_id);
  IF v_recipient = v_me OR v_recipient IS NULL THEN
    RAISE EXCEPTION 'Cannot determine where to send this reply';
  END IF;

  v_title := 'Re: ' || left(coalesce(v_root.title,'(no subject)'), 60);

  INSERT INTO public.notifications(recipient_id, kind, title, body, link, created_by, parent_id)
  VALUES (v_recipient, 'reply', v_title, p_body, v_root.link, v_me, v_root.id)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.reply_to_notification(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
