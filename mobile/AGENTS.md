# No Menu Tonight — agent notes

POS / owner app under `mobile/`.  
Doc index: [`../docs/INDEX.md`](../docs/INDEX.md).

## Release status

**App Store `1.0.0` (build ≥16) is approved / live.**

**`1.1.0` (fixed tap slots) is being prepared for submission** — most of it is still uncommitted on `codex/taplist-fixed-slots`. Two production migrations gate the build: `20260817120000_tenant_tap_slot_count.sql` and `20260817130000_link_drink_copy_product_image.sql`. The first one also rewrites `set_drink_taplist_listing`, which live `1.0.0` clients call, so verify no regression on a live device after applying it.

Sibling consumer **No Menu** `1.3.0` (follow + new-tap push) — see `taplist-mobile/docs/APP_STORE_CONNECT_1.3.0.md`. POS still needs no UI for push enqueue.

Canonical ASC:
- [`docs/APP_STORE_CONNECT_1.1.0.md`](./docs/APP_STORE_CONNECT_1.1.0.md) — current release
- [`docs/APP_STORE_LISTED_V1.md`](./docs/APP_STORE_LISTED_V1.md) — `1.0.0` baseline metadata
- [`APP_STORE_CONNECT_SUBMISSION.md`](./APP_STORE_CONNECT_SUBMISSION.md) — `1.0.0` fill-in checklist

## Product rules (short)

- Tabs: **酒单 | 商品库 | 门店** (and 开台/订单 only when `ordering_enabled`; `开台` was called `点单` before `1.1.0`).
- Ordering stays hidden from the App Store listing and from any `ordering_enabled = false` tenant. New ordering-adjacent copy must branch on `orderingEnabled` — see the audit table in [`docs/APP_STORE_CONNECT_1.1.0.md`](./docs/APP_STORE_CONNECT_1.1.0.md) §6.1.
- Landing after login: always `/(tabs)/taplist`.
- Reviewer / ASC tenants: `ordering_enabled = false`.
- Storefront save: RPC treats `p_cover_image_url = null` as preserve (`20260807170000_…`). Do not reintroduce hard-coded null clears.
- Schema changes: only via repo-root `supabase/migrations/`. Never re-run `install_all_in_one.sql` on production.

## Local / EAS

See [`README.md`](./README.md). Production Supabase URL/anon key must be in EAS `production` env before `eas build`.
