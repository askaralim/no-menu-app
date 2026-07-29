# Deploy multi-city backend (App Store 1.2.x safe)

Use this when applying Supabase migrations **before** the multi-city consumer app (1.3.0+) ships.
Production users on **App Store 1.2.x** keep working unchanged.

## What App Store 1.2.x uses

| Surface | RPC / function | City behavior |
|---------|----------------|---------------|
| Home bars / events / new taps | `get_public_taplist_*` with `p_city: 'Shanghai'` | Unchanged |
| Search | `search_public_taplist` with `p_city: 'Shanghai'` | Unchanged |
| Bar / beer / event detail | slug / id lookups | No city param |
| Beer Route | Edge `public-beer-roadmap` → `get_beer_roadmap_eligible_tenants` | Shanghai-only eligible set |

1.2.x does **not** call `get_public_taplist_cities()`.

## Migrations (apply in order)

1. `20260630120000_taplist_public_cities.sql` — city catalog + `get_public_taplist_cities()` + Beer Route `p_city` param (defaults to Shanghai)
2. `20260630130000_admin_taplist_cities.sql` — admin-only city management RPCs
3. `20260630140000_taplist_public_cities_normalized_key.sql` — canonical city keys + unique normalized index

### Why this is safe for 1.2.x

- **Additive RPC** `get_public_taplist_cities()` — ignored by old clients
- **No changes** to existing public list/search/event RPC signatures or payloads
- **`get_beer_roadmap_eligible_tenants(p_city DEFAULT NULL)`** — no-arg calls still work; null/empty `p_city` → Shanghai (same as old hardcoded filter)
- **Admin RPCs** — super_admin only; no consumer impact

## Deploy order (production)

```text
1. supabase db push   (or apply both migrations in SQL Editor)
2. Optional: supabase functions deploy public-beer-roadmap
3. Verify with scripts below
4. Ship App Store 1.3.0+ only after smoke passes
```

**Migrations before Edge Function** is required if you deploy the updated edge function that passes `p_city`. The edge function includes a **legacy fallback** (no-arg RPC) if `p_city` is not yet available, so Beer Route on 1.2.x stays up even if function deploys first.

**Do not** bump `taplist-mobile/app.json` version until submitting 1.3.0 to App Store.

## Verify after deploy

```bash
# Legacy 1.2.x consumer paths (must pass)
SUPABASE_URL=... SUPABASE_ANON_KEY=... ./scripts/taplist_rpc_smoke.sh

# Beer Route schema + legacy eligible RPC (service role optional)
node scripts/verify-beer-roadmap-schema.mjs

# Edge function (optional)
node scripts/verify-beer-roadmap-edge.mjs
```

`taplist_rpc_smoke.sh` runs **legacy null-city checks first**, then optional multi-city catalog checks.

## Suggested git split

| Commit | Contents | Safe for prod 1.2.x users |
|--------|----------|---------------------------|
| Backend | `supabase/migrations/20260630*.sql`, `scripts/*`, optional edge function | Yes |
| Admin UI | `app/admin/platform/cities/*`, `lib/types.ts` | Yes (admin only) |
| Mobile 1.3.0 | `taplist-mobile/*` multi-city UI | No — wait for App Store release |

## Rollback

- Disable a city: admin **城市管理** → 停用 (or `is_enabled = false` in SQL)
- Beer Route: revert edge function to previous deploy; migration RPC keeps no-arg Shanghai behavior
