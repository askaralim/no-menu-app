-- Drink companies foundation for Product Pool brand/brewery canonical data.
--
-- Admin-only in v1. No consumer RPC changes. No product linking yet.

CREATE TABLE IF NOT EXISTS public.drink_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_key text NOT NULL,
  canonical_name text NOT NULL,
  canonical_name_en text,
  display_name text NOT NULL,
  entity_type text NOT NULL,
  country text,
  country_code text,
  origin_region text,
  raw_country_values text[] NOT NULL DEFAULT '{}',
  confidence text NOT NULL DEFAULT 'medium',
  review_status text NOT NULL DEFAULT 'reviewed',
  source text,
  source_note text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drink_companies_entity_type_check CHECK (
    entity_type IN (
      'brewery', 'brand', 'brewery_brand', 'cidery', 'meadery', 'distillery', 'importer', 'other'
    )
  ),
  CONSTRAINT drink_companies_confidence_check CHECK (
    confidence IN ('high', 'medium', 'low')
  ),
  CONSTRAINT drink_companies_review_status_check CHECK (
    review_status IN ('pending', 'reviewed', 'rejected')
  ),
  CONSTRAINT drink_companies_status_check CHECK (
    status IN ('active', 'archived')
  )
);

CREATE TABLE IF NOT EXISTS public.drink_company_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.drink_companies(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_normalized text GENERATED ALWAYS AS (lower(trim(alias))) STORED,
  alias_language text,
  alias_type text NOT NULL DEFAULT 'name',
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drink_company_aliases_alias_language_check CHECK (
    alias_language IS NULL OR alias_language IN ('zh', 'en', 'mixed', 'unknown')
  ),
  CONSTRAINT drink_company_aliases_alias_type_check CHECK (
    alias_type IN (
      'name', 'legal_name', 'old_name', 'spelling', 'translation', 'collaboration_text', 'source_value'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS drink_companies_normalized_key_uidx
  ON public.drink_companies (normalized_key);

CREATE INDEX IF NOT EXISTS drink_companies_entity_type_idx
  ON public.drink_companies (entity_type);

CREATE INDEX IF NOT EXISTS drink_companies_country_code_idx
  ON public.drink_companies (country_code);

CREATE INDEX IF NOT EXISTS drink_companies_raw_country_values_idx
  ON public.drink_companies USING gin (raw_country_values);

CREATE UNIQUE INDEX IF NOT EXISTS drink_company_aliases_company_alias_norm_uidx
  ON public.drink_company_aliases (company_id, alias_normalized);

CREATE INDEX IF NOT EXISTS drink_company_aliases_alias_norm_idx
  ON public.drink_company_aliases (alias_normalized);

CREATE OR REPLACE FUNCTION public.drink_companies_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drink_companies_set_updated_at ON public.drink_companies;
CREATE TRIGGER trg_drink_companies_set_updated_at
BEFORE UPDATE ON public.drink_companies
FOR EACH ROW
EXECUTE FUNCTION public.drink_companies_set_updated_at();

ALTER TABLE public.drink_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drink_company_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drink_companies_super_admin ON public.drink_companies;
CREATE POLICY drink_companies_super_admin ON public.drink_companies
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS drink_company_aliases_super_admin ON public.drink_company_aliases;
CREATE POLICY drink_company_aliases_super_admin ON public.drink_company_aliases
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
