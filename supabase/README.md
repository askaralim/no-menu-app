# Supabase database (this project)

Doc index: [`docs/INDEX.md`](../docs/INDEX.md).  
Greenfield (empty DB only): [`GREENFIELD.md`](./GREENFIELD.md).

## PostgreSQL schemas (not the same as these `.sql` files)

On Supabase you always have several **PostgreSQL schemas** (namespaces). You do **not** merge them into one:

| Schema | Role |
|--------|------|
| **`public`** | This app’s tables, functions, and RLS policies. **Versioned in Git.** |
| **`auth`** | Managed by Supabase Auth. **Do not drop or replace.** |
| **`storage`**, **`realtime`**, … | Supabase product features. Leave as managed. |

## What is the source of truth?

| Situation | Use |
|-----------|-----|
| **Existing / production DB** | Apply dated files in [`migrations/`](./migrations/) **in timestamp order**. This is the only forward path. |
| **Brand-new empty `public` schema** | Follow [`GREENFIELD.md`](./GREENFIELD.md): `install_all_in_one.sql` once, then remaining `migrations/`. |
| **Seeds** | Optional `seed*.sql` / per-tenant seed scripts after schema exists. |
| **Legacy splits / one-offs** | [`legacy/`](./legacy/) — reference only; do not apply on production. |

**Do not** re-run `install_all_in_one.sql` on a database that already has app objects.

## Ops docs (canonical)

| Topic | Doc |
|-------|-----|
| Concierge bar + owner bind | [REAL_BAR_ONBOARDING.md](./REAL_BAR_ONBOARDING.md) |
| Owner WeChat copy | [OWNER_WECHAT_GUIDE.md](./OWNER_WECHAT_GUIDE.md) |
| Venue QR | [TENANT_QR_LINKS.md](./TENANT_QR_LINKS.md) |
| Support requests | [SUPPORT_REQUESTS_DEPLOYMENT.md](./SUPPORT_REQUESTS_DEPLOYMENT.md) |
| Multi-city | [DEPLOY_MULTI_CITY_BACKEND.md](./DEPLOY_MULTI_CITY_BACKEND.md) |
| Greenfield checklist | [GREENFIELD.md](./GREENFIELD.md) |

## Local Supabase CLI (`npm run db:start`)

Root scripts call **`supabase`** on your **PATH** (not `npx`).

1. Install CLI (macOS): `brew install supabase/tap/supabase` — Docker Desktop required.
2. From repo root: `npm run db:start`. Local start can apply **`migrations/`** when the project is migration-tracked; for a dump-based bootstrap see [`GREENFIELD.md`](./GREENFIELD.md).
3. **POS (`mobile/`):** copy `mobile/.env.local.example` → `mobile/.env` (or use local defaults in `mobile/lib/supabase.ts`).
4. **Consumer (`taplist-mobile/`):** use that app’s `.env` / EAS secrets.

## Tonight 1.0.0 / ASC-related migrations (pointers only)

Confirm these are applied on production before relying on listed-build behavior (see [`mobile/docs/APP_STORE_LISTED_V1.md`](../mobile/docs/APP_STORE_LISTED_V1.md)):

- `20260806120000_support_requests.sql`
- `20260807160000_business_day_close_restore_hardening.sql`  
  (**not** `20260807150000_…` — that file is We Cheers QR data)

Do not paste or rewrite these from this README; open the migration files in `migrations/`.
