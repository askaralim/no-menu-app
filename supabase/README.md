# Supabase database (this project)

## PostgreSQL “schemas” (not the same as these `.sql` files)

On Supabase you always have several **PostgreSQL schemas** (namespaces). You do **not** merge them into one:

| Schema | Role |
|--------|------|
| **`public`** | This app’s tables, functions, and RLS policies (`categories`, `drinks`, `orders`, …). **This is what we version in Git.** |
| **`auth`** | Managed by Supabase Auth (users, sessions). **Do not drop or replace.** |
| **`storage`**, **`realtime`**, … | Supabase product features. **Leave as Supabase manages them.** |

Moving to another host (Neon, RDS, self-hosted Postgres) you still use **`public`** for app objects; Auth may be replaced by another auth system, which is a separate migration.

## What to run from this repo (keep it to two files + optional seeds)

1. **`install_all_in_one.sql`** — **Single canonical script** for a **brand-new empty** `public` schema (or new project). It already includes section markers that refer to old split filenames **only as comments**; those separate files are **not** required in the repo anymore.
2. **Optional:** `seed.sql` — demo data.
2b. **Tap List UI layout:** `seed_taplist_demo_bars.sql` — 4 public Shanghai bars × 5 beers each (`npm run db:seed-taplist-demo` against local Postgres :54322).
3. **Optional:** `seed_platform_super_admin.sql` — only after the platform admin Auth user exists.
3b. **Concierge real bars:** `migrations/20260524120000_admin_create_bar_concierge.sql` — `admin_create_bar` RPC + super_admin RLS on menu tables. Workflow: [REAL_BAR_ONBOARDING.md](./REAL_BAR_ONBOARDING.md).
4. **`taplist_mvp_patch.sql`** — Tap List columns, extension tables, `get_public_taplist_*` RPCs, `set_tenant_public_visibility`, and owner `UPDATE` on `tenants` for storefront fields. The same content is **merged into** `install_all_in_one.sql` for greenfield installs; use the standalone file when patching an older database. Design notes: [docs/taplist_mvp_schema_sql.md](../docs/taplist_mvp_schema_sql.md).
5. **Smoke test (anon RPCs):** with local Supabase running, `eval "$(supabase status -o env 2>/dev/null)" && SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" ./scripts/taplist_rpc_smoke.sh` from the repo root. Includes `search_public_taplist` (apply `migrations/20260516120000_search_public_taplist.sql` on existing DBs).
6. **Tap List images (Storage):** bucket **`taplist-media`** (public read). Apply **`supabase/migrations/20260515120000_taplist_media_bucket.sql`** in SQL Editor on existing DBs, or use content merged into `install_all_in_one.sql` / `taplist_mvp_patch.sql` for greenfield. Local CLI: `[storage.buckets.taplist-media]` in `config.toml` (restart `supabase stop && supabase start` after config change). Admin uploads from `/admin/taplist`; URLs land in `tenants.cover_image_url` and `drinks.image_url`.

**Do not** re-run `install_all_in_one.sql` on a production database that already has the objects: you will get “already exists” errors. For an existing DB, apply **targeted** `CREATE OR REPLACE FUNCTION …` / `ALTER TABLE …` snippets (from release notes or git history) in the SQL Editor.

## Why there used to be many `.sql` files

Earlier iterations split migrations into `schema.sql`, `orders_schema.sql`, etc. Everything is now **folded into** `install_all_in_one.sql` so there is **one** source of truth for new installs and less confusion about which function definition to apply.

## Local Supabase CLI (`npm run db:start`)

Root scripts call **`supabase`** on your **PATH** (not `npx`), so you avoid flaky `npx` cache renames (`ENOTEMPTY` on `~/.npm/_npx/.../node_modules/supabase`).

1. Install the CLI once (macOS): `brew install supabase/tap/supabase` — then from repo root: `npm run db:start` (requires **Docker Desktop** running).
2. **Schema:** local `supabase start` does **not** apply `install_all_in_one.sql` automatically (migrations folder may be empty). After the stack is up, open **Supabase Studio** (link printed in the terminal), use **SQL Editor**, and run `supabase/install_all_in_one.sql` on the **local** DB if you need the full No Menu schema. Then you can run `supabase/seed.sql` manually if you want demo categories.
3. **POS Expo app (`mobile/`):** copy [`mobile/.env.local.example`](../mobile/.env.local.example) to `mobile/.env` (or rely on dev defaults in [`mobile/lib/supabase.ts`](../mobile/lib/supabase.ts)); `app.config.js` allows cleartext / local HTTP to `127.0.0.1:54321`. Physical device: use your Mac LAN IP in `EXPO_PUBLIC_SUPABASE_URL`.
4. If you still prefer `npx supabase@latest` and hit **ENOTEMPTY**, clear the broken cache and retry, for example: `rm -rf ~/.npm/_npx` (or delete only the path shown in the npm error log).

## RPC / function updates (e.g. `get_or_create_open_business_day`)

Always align with the **last** definition of that function inside `install_all_in_one.sql` (the block that uses `public.get_auth_tenant_id()` and `SET search_path = public`). Copy that block only into SQL Editor when patching a live project.
