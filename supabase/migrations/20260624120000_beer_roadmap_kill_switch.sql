-- Global Beer Route kill switch (not tenant public.settings).

CREATE TABLE IF NOT EXISTS public.beer_roadmap_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  feature_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.beer_roadmap_settings (feature_enabled)
VALUES (false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.beer_roadmap_settings ENABLE ROW LEVEL SECURITY;

-- No policies: anon/authenticated cannot read or write. Service role bypasses RLS.

CREATE OR REPLACE FUNCTION public.get_beer_roadmap_feature_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT feature_enabled FROM public.beer_roadmap_settings WHERE id = true),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.get_beer_roadmap_feature_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_beer_roadmap_feature_enabled() TO service_role;
