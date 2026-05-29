-- Keep public taplist freshness tied to intentional menu changes, not POS stock deductions.

CREATE OR REPLACE FUNCTION public.taplist_touch_tenant_menu_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'drinks' THEN
    IF (to_jsonb(NEW) - 'stock') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'stock') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD.tenant_id;
  ELSE
    v_tenant_id := NEW.tenant_id;
  END IF;

  UPDATE public.tenants
  SET last_menu_updated_at = now()
  WHERE id = v_tenant_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
