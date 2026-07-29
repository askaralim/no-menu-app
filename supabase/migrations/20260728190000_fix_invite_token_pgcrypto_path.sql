-- Fix invite token helpers: gen_random_bytes / digest live in extensions
-- (pgcrypto). create_tenant_invite sets search_path = public only, so unqualified
-- calls fail with: function gen_random_bytes(integer) does not exist.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public._hash_invite_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(digest(p_token, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public._new_invite_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  -- 10 hex chars, suitable for paste codes.
  SELECT upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
$$;
