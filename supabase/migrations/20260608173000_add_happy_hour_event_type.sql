-- Add Happy Hour as a first-class TONIGHT EVENTS type.

ALTER TABLE public.bar_events
  DROP CONSTRAINT IF EXISTS bar_events_event_type_check;

ALTER TABLE public.bar_events
  ADD CONSTRAINT bar_events_event_type_check
  CHECK (event_type IN (
    'new_tap',
    'tap_takeover',
    'guest_shift',
    'tasting',
    'dj',
    'live_music',
    'quiz',
    'party',
    'happy_hour',
    'other'
  ));

CREATE OR REPLACE FUNCTION public.taplist_event_type_label(p_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_type
    WHEN 'new_tap' THEN '新酒上架'
    WHEN 'tap_takeover' THEN 'Tap Takeover'
    WHEN 'guest_shift' THEN 'Guest Shift'
    WHEN 'tasting' THEN '品鉴'
    WHEN 'dj' THEN 'DJ / 音乐'
    WHEN 'live_music' THEN 'Live Music'
    WHEN 'quiz' THEN 'Quiz Night'
    WHEN 'party' THEN '派对'
    WHEN 'happy_hour' THEN 'Happy Hour / 欢乐时段'
    ELSE '其他活动'
  END;
$$;
