-- Compatibility for installed POS builds that use `draft-${Date.now()}` as a
-- bar event ID when crypto.randomUUID is unavailable in React Native.
-- Corrected clients and database-generated rows continue to use UUID strings.

DROP FUNCTION IF EXISTS public.get_public_taplist_event(uuid);

ALTER TABLE public.bar_events
  ALTER COLUMN id DROP DEFAULT;

ALTER TABLE public.bar_events
  ALTER COLUMN id TYPE text USING id::text;

ALTER TABLE public.bar_events
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE public.bar_events
  DROP CONSTRAINT IF EXISTS bar_events_id_format_check;

ALTER TABLE public.bar_events
  ADD CONSTRAINT bar_events_id_format_check
  CHECK (
    id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR id ~ '^draft-[0-9]{13}$'
  );

CREATE OR REPLACE FUNCTION public.get_public_taplist_event(p_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.bar_events;
  t public.tenants;
BEGIN
  SELECT * INTO e
  FROM public.bar_events
  WHERE id = p_event_id;

  IF e.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  SELECT * INTO t
  FROM public.tenants
  WHERE id = e.tenant_id;

  IF t.id IS NULL OR t.status <> 'active' OR NOT t.is_public_visible OR NOT e.is_public_visible THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_public');
  END IF;

  IF e.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'cancelled');
  END IF;

  IF NOT public.taplist_event_is_not_expired(e.start_at, e.end_at, e.visible_until_at) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'event', public.taplist_public_event_row(e, t)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_taplist_event(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_event(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
