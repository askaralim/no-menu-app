-- Deterministic drink-company country-code backfill checks.
-- Usage: psql "$DATABASE_URL" -f supabase/tests/drink_company_country_code_backfill.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.drink_companies company
    JOIN (
      VALUES
        ('中国', 'China', 'CN'),
        ('美国', 'United States', 'US'),
        ('澳大利亚', 'Australia', 'AU'),
        ('俄罗斯', 'Russia', 'RU'),
        ('斯洛文尼亚', 'Slovenia', 'SI'),
        ('比利时', 'Belgium', 'BE'),
        ('芬兰', 'Finland', 'FI'),
        ('英国', 'England', 'GB'),
        ('英国', '英国', 'GB')
    ) mapping(country, country_en, country_code)
      ON trim(company.country) = mapping.country
     AND trim(company.country_en) = mapping.country_en
    WHERE company.country_code IS DISTINCT FROM mapping.country_code
  ) THEN
    RAISE EXCEPTION 'A deterministic company country code was not backfilled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.drink_companies
    WHERE id = '741d9e24-799d-4542-a1da-26db4f87f9a5'::uuid
      AND country_code IS DISTINCT FROM 'CN'
  ) THEN
    RAISE EXCEPTION '行空酒造 was not backfilled as CN';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.drink_companies
    WHERE nullif(trim(country_code), '') IS NOT NULL
      AND upper(trim(country_code)) !~ '^[A-Z]{2}$'
  ) THEN
    RAISE EXCEPTION 'A company has an invalid ISO alpha-2 country code';
  END IF;
END
$$;

ROLLBACK;
