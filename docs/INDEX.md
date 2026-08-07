# Documentation index (source of truth)

Last updated: 2026-08-07.

Use this file to find the **canonical** doc for a topic. Prefer current ops docs over design-era `docs/` archives.

**Do not edit production SQL from this index.** Schema changes go through `supabase/migrations/` only.

---

## Release status (2026-08-07)

| Surface | Version | Status |
|---------|---------|--------|
| **No Menu Tonight** (POS) | App Store `1.0.0` (build ≥16) | **Waiting for App Store Connect review** |
| **No Menu** (consumer) | App Store listed separately (`com.nomenuapp.taplist`) | See `taplist-mobile/` docs |
| Production DB | Migrations through `20260807180000_…` (incl. cover preserve + bar follows) | Applied |

While Tonight is in review: do **not** upload a replacement binary unless Apple requests a resubmit. Backend hotfixes (RPC migrations) are OK without a new build.

Canonical Tonight ASC docs:
- [`mobile/docs/APP_STORE_LISTED_V1.md`](../mobile/docs/APP_STORE_LISTED_V1.md)
- [`mobile/APP_STORE_CONNECT_SUBMISSION.md`](../mobile/APP_STORE_CONNECT_SUBMISSION.md)

---

## Current ops (use these)

| Topic | Canonical doc |
|-------|----------------|
| Concierge bar + owner bind | [`supabase/REAL_BAR_ONBOARDING.md`](../supabase/REAL_BAR_ONBOARDING.md) |
| Owner WeChat copy | [`supabase/OWNER_WECHAT_GUIDE.md`](../supabase/OWNER_WECHAT_GUIDE.md) |
| Venue QR (DB + nginx JSON) | [`supabase/TENANT_QR_LINKS.md`](../supabase/TENANT_QR_LINKS.md) |
| Support requests / account deletion deploy | [`supabase/SUPPORT_REQUESTS_DEPLOYMENT.md`](../supabase/SUPPORT_REQUESTS_DEPLOYMENT.md) |
| Multi-city backend deploy | [`supabase/DEPLOY_MULTI_CITY_BACKEND.md`](../supabase/DEPLOY_MULTI_CITY_BACKEND.md) |
| Supabase: greenfield vs existing DB | [`supabase/README.md`](../supabase/README.md) · [`supabase/GREENFIELD.md`](../supabase/GREENFIELD.md) |
| Tonight ASC listed v1 (canonical) | [`mobile/docs/APP_STORE_LISTED_V1.md`](../mobile/docs/APP_STORE_LISTED_V1.md) |
| Tonight ASC Connect fill-in checklist | [`mobile/APP_STORE_CONNECT_SUBMISSION.md`](../mobile/APP_STORE_CONNECT_SUBMISSION.md) |
| Tonight agent / release notes | [`mobile/AGENTS.md`](../mobile/AGENTS.md) · [`mobile/README.md`](../mobile/README.md) |
| Consumer No Menu app | [`taplist-mobile/README.md`](../taplist-mobile/README.md) |
| Consumer agent rules | [`taplist-mobile/AGENTS.md`](../taplist-mobile/AGENTS.md) |
| Parked product ideas | [`PRODUCT_BACKLOG.md`](./PRODUCT_BACKLOG.md) |

### Related SQL (read-only pointers — apply via migrations)

| Concern | Migration / artifact |
|---------|----------------------|
| Business-day close/restore harden (Tonight 1.0.0) | `supabase/migrations/20260807160000_business_day_close_restore_hardening.sql` |
| Support requests table/RPCs | `supabase/migrations/20260806120000_support_requests.sql` (+ `20260806140000_…`) |
| Serving soft-archive when in orders | `supabase/migrations/20260807130000_serving_archive_when_in_orders.sql` |
| Public collab breweries | `supabase/migrations/20260807140000_public_collab_breweries.sql` |
| Default cup sizes | `supabase/migrations/20260807120000_tenant_default_cup_sizes.sql` |
| Storefront: null cover/brewing preserve | `supabase/migrations/20260807170000_storefront_preserve_null_cover.sql` |
| Consumer bar follows + new-tap push outbox | `supabase/migrations/20260807180000_consumer_bar_follows_and_new_tap_push.sql` |
| Owner bind / provision | `20260720120000_admin_bind_owner.sql`, `20260720130000_admin_provision_owner.sql` |
| Greenfield empty DB | See [`supabase/GREENFIELD.md`](../supabase/GREENFIELD.md) |
| Legacy SQL (do not apply) | [`supabase/legacy/`](../supabase/legacy/) |

---

## Stale / archive (do not treat as ops SoT)

Marked with a banner at the top of each file. Keep for history; verify against `migrations/` before acting.

| Doc | Why stale |
|-----|-----------|
| [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) | Pre–Tonight listed framing; dual-app model outdated |
| [`taplist_phase_summary.md`](./taplist_phase_summary.md) | Phase notes; snippet / RPC pointers may be wrong |
| [`taplist_mvp_schema_sql.md`](./taplist_mvp_schema_sql.md) | Design-era schema; superseded by `migrations/` |
| [`nomenu_taplist_unified_architecture_prd.md`](./nomenu_taplist_unified_architecture_prd.md) | Architecture PRD (May 2026) |
| [`no_menu_taplist_adr.md`](./no_menu_taplist_adr.md) | ADR companion to PRD |
| [`nomenu_taplist_ui_spec_aligned_with_schema.md`](./nomenu_taplist_ui_spec_aligned_with_schema.md) | Consumer UI spec (design era) |
| [`no_menu_taplist_ui_design_requirements.md`](./no_menu_taplist_ui_design_requirements.md) | UI requirements overlap |
| [`no_menu_taplist_mvp_ui_redesign.md`](./no_menu_taplist_mvp_ui_redesign.md) | Narrow UI redesign note |
| [`ORDERING_SYSTEM_DESIGN.md`](./ORDERING_SYSTEM_DESIGN.md) | Early ordering design; predates `ordering_enabled` |
| [`ORDERING_SYSTEM_GUIDE.md`](./ORDERING_SYSTEM_GUIDE.md) | Points at archived `supabase/legacy/orders_schema.sql` |
| [`DEBUG_BUSINESS_DAY.md`](./DEBUG_BUSINESS_DAY.md) | Still useful for symptoms; verify against `20260807160000_…` |
| Root [`README.md`](../README.md) body below the status header | Legacy feature list; use this INDEX for ops |

---

## Missing (intentional / follow-up)

| Item | Status |
|------|--------|
| Full POS owner user manual | Not written; use `OWNER_WECHAT_GUIDE.md` short 上手 |
| Create-drink same-name soft warning | Agreed product follow-up; not shipped |
| Restore wiped `cover_image_url` rows | One-time ops if any bars lost covers before `07170000`; Storage files usually remain |

---

## Product surfaces (quick map)

| Surface | Path | Bundle / notes |
|---------|------|----------------|
| Tonight (POS / owner) | `mobile/` | `com.taklip.nomenuapp` — **1.0.0 in ASC review** |
| No Menu (consumer) | `taplist-mobile/` | `com.nomenuapp.taplist` |
| Admin / platform web | `app/` | Next static export |
| Public web menu | `taplist-web/` (if present) | `/bar/{slug}`, `/tonight`, `/support` |
