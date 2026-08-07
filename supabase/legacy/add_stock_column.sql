-- Add stock tracking column to drinks table
-- NULL means stock is not tracked for this drink
-- A numeric value tracks remaining quantity
ALTER TABLE public.drinks ADD COLUMN IF NOT EXISTS stock integer DEFAULT NULL;
