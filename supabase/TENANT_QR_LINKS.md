# Tenant QR links (permanent venue codes)

No Menu Tonight reads permanent venue QR codes from `public.tenant_qr_links`. Nginx short-link redirects still come from `taplist-web/config/qr-links.json`.

Until an export pipeline exists, **both must stay in sync**.

## Dual-source checklist (new code)

1. Generate a unique 8-char Base32 code (`A-Z2-7`). **Never reuse** a retired code.
2. Insert a row into `public.tenant_qr_links` (same fields as JSON; `tenant_slug` is a creation snapshot only).
3. Add the matching entry to `taplist-web/config/qr-links.json` (`storage_path` ↔ `image_path`).
4. Upload PNG to Supabase Storage `taplist-media` at `{tenant_id}/qr/no-menu-qr-{slug}-{code}.png`.
5. In taplist-web: `npm run generate:qr-redirects`, deploy the Nginx snippet, `nginx -t`, reload.
6. Run the sync check (must exit 0):

```bash
DATABASE_URL='postgresql://…' node supabase/tools/check-qr-links-sync.mjs
```

Optional: `QR_LINKS_JSON=/absolute/path/to/qr-links.json`

## Sync check auth

Ops only. Do **not** use the anon key. Do **not** commit `DATABASE_URL`, service role, or DB passwords. Do **not** add a public RPC for this check.

Use one of:

- Local/ops `DATABASE_URL` / `SUPABASE_DB_URL` (postgres role that can `SELECT` the table)
- CI secret with the same connection string
- Linked Supabase project + a one-off `psql` session with an admin connection

## POS behavior

- Staff/owners call `get_my_tenant_qr` only (no generate/rotate RPC).
- New merchant taplist share links use `/bar/{slug}?source=merchant_share&placement=tonight` (not the short QR URL).
- Existing links with `placement=pos` remain accepted for attribution compatibility.
