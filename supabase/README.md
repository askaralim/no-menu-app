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
3. **Optional:** `seed_platform_super_admin.sql` — only after the platform admin Auth user exists.

**Do not** re-run `install_all_in_one.sql` on a production database that already has the objects: you will get “already exists” errors. For an existing DB, apply **targeted** `CREATE OR REPLACE FUNCTION …` / `ALTER TABLE …` snippets (from release notes or git history) in the SQL Editor.

## Why there used to be many `.sql` files

Earlier iterations split migrations into `schema.sql`, `orders_schema.sql`, etc. Everything is now **folded into** `install_all_in_one.sql` so there is **one** source of truth for new installs and less confusion about which function definition to apply.

## RPC / function updates (e.g. `get_or_create_open_business_day`)

Always align with the **last** definition of that function inside `install_all_in_one.sql` (the block that uses `public.get_auth_tenant_id()` and `SET search_path = public`). Copy that block only into SQL Editor when patching a live project.
