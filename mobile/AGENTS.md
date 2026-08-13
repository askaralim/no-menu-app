# No Menu Tonight — agent notes

POS / owner app under `mobile/`.  
Doc index: [`../docs/INDEX.md`](../docs/INDEX.md).

## Release status

**App Store `1.0.0` (build ≥16) is Waiting for Review** (submitted 2026-08).  
Do not replace the binary unless Apple asks for a new build. Prefer production RPC migrations for hotfixes that the submitted client already calls.

Sibling consumer **No Menu** `1.3.0` (follow + new-tap push) is also Waiting for Review — see `taplist-mobile/docs/APP_STORE_CONNECT_1.3.0.md`. POS still needs no UI for push enqueue.

Post-1.0.0 POS queue (same-name soft warn → manual → 店休): **POS next** in [`../docs/INDEX.md`](../docs/INDEX.md). Do not start that sprint during ASC quiet period.

Canonical ASC:
- [`docs/APP_STORE_LISTED_V1.md`](./docs/APP_STORE_LISTED_V1.md)
- [`APP_STORE_CONNECT_SUBMISSION.md`](./APP_STORE_CONNECT_SUBMISSION.md)

## Product rules (short)

- Tabs: **酒单 | 商品库 | 门店** (and 点单/订单 only when `ordering_enabled`).
- Landing after login: always `/(tabs)/taplist`.
- Reviewer / ASC tenants: `ordering_enabled = false`.
- Storefront save: RPC treats `p_cover_image_url = null` as preserve (`20260807170000_…`). Do not reintroduce hard-coded null clears.
- Schema changes: only via repo-root `supabase/migrations/`. Never re-run `install_all_in_one.sql` on production.

## Local / EAS

See [`README.md`](./README.md). Production Supabase URL/anon key must be in EAS `production` env before `eas build`.
