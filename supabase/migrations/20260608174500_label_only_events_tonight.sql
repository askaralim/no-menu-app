-- Recurring/label-only events, such as Happy Hour, should still surface in TONIGHT.
-- These events intentionally have no single start_at/end_at, but do have visible_until_at.

CREATE OR REPLACE FUNCTION public.taplist_event_display_state(
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_visible_until_at timestamptz
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_start_at IS NULL
      AND p_visible_until_at IS NOT NULL
      AND p_visible_until_at >= now()
      THEN 'TONIGHT'
    WHEN p_start_at IS NOT NULL
      AND p_start_at <= now()
      AND coalesce(p_end_at, p_visible_until_at, p_start_at + interval '18 hours') >= now()
      THEN 'ONGOING'
    WHEN p_start_at IS NOT NULL
      AND (p_start_at AT TIME ZONE 'Asia/Shanghai')::date = (now() AT TIME ZONE 'Asia/Shanghai')::date
      THEN 'TONIGHT'
    ELSE 'UPCOMING'
  END;
$$;
