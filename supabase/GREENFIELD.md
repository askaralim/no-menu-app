# Greenfield database checklist

For a **brand-new empty** Supabase/`public` schema only.  
**Production already on migrations: skip this file.**

Canonical ops index: [`docs/INDEX.md`](../docs/INDEX.md).

## Why two steps?

[`install_all_in_one.sql`](./install_all_in_one.sql) is a consolidated dump for bootstrapping.
It is **not** guaranteed to include every file under [`migrations/`](./migrations/)
(especially 202607–202608 Tonight / ASC work).

## Steps

1. **Create** a new Supabase project (or empty local DB via `supabase start`).
2. **Do not** re-run install on a DB that already has app tables.
3. In SQL Editor, run **`install_all_in_one.sql`** once.
4. Apply **remaining migrations** in timestamp order — at minimum everything after
   what the dump was last synced to. Practical rule for 2026-08:

   ```text
   supabase/migrations/202607*.sql
   supabase/migrations/202608*.sql
   ```

   Or apply the full `migrations/` folder with the CLI (`supabase db push` / linked project)
   if the project is migration-tracked from empty.

5. Optional seeds (after schema exists):
   - `seed.sql` — demo categories
   - `seed_platform_super_admin.sql` — after platform Auth user exists
   - `seed_taplist_demo_bars.sql` — local demo bars only

6. Smoke:
   - Owner bind / login (see [`REAL_BAR_ONBOARDING.md`](./REAL_BAR_ONBOARDING.md))
   - Public RPCs / bar page if needed

## Do not use for greenfield

| Path | Why |
|------|-----|
| [`legacy/`](./legacy/) | Historical splits / one-offs |
| `snippets/` | Studio scratch (not in repo) |
| Random `seed_tenant_*.sql` | Per-bar ops history, not schema |

## Production reminder

Existing production: **only** forward `migrations/` (already applied through
`20260807160000_business_day_close_restore_hardening.sql` and peers).  
Never run `install_all_in_one.sql` against production.
