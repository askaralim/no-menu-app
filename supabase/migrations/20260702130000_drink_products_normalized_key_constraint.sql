-- Fix: partial unique index on normalized_key does not satisfy
-- ON CONFLICT (normalized_key) in seed SQL (PostgreSQL 42P10).
-- Replace with a table UNIQUE constraint (multiple NULLs still allowed).

DROP INDEX IF EXISTS public.drink_products_normalized_key_uidx;

ALTER TABLE public.drink_products
  DROP CONSTRAINT IF EXISTS drink_products_normalized_key_key;

ALTER TABLE public.drink_products
  ADD CONSTRAINT drink_products_normalized_key_key UNIQUE (normalized_key);
