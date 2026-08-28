# Documentation index (source of truth)

Last updated: 2026-08-24 (Tonight `1.1.0` + consumer `1.3.0` App Store approved / live).

Use this file to find the **canonical** doc for a topic. Prefer current ops docs over design-era `docs/` archives.

**Do not edit production SQL from this index.** Schema changes go through `supabase/migrations/` only.

---

## Release status (2026-08-24)

| Surface | Version | Status |
|---------|---------|--------|
| **No Menu Tonight** (POS) | App Store `1.1.0` (build ≥20) | **Approved / live** — fixed tap slots; use App Store install path for new owners |
| **No Menu Tonight** (POS) | `1.0.0` (build ≥16) | Superseded by `1.1.0` — baseline metadata in [`mobile/docs/APP_STORE_LISTED_V1.md`](../mobile/docs/APP_STORE_LISTED_V1.md) |
| **No Menu** (consumer) | App Store `1.3.0` (build ≥42) | **Approved / live** — private bar follow + optional new-tap iOS push |
| Production DB | Migrations through `20260817130000_…` (incl. tap slots, follow/push, usernames, freshness, QR seeds) | **Applied** (operator-confirmed) |

**Tonight live ops:** new owners → App Store 搜「No Menu Tonight」；微信用 [`OWNER_WECHAT_GUIDE.md`](../supabase/OWNER_WECHAT_GUIDE.md) 已上架模板；完整说明 [`OWNER_USER_GUIDE.md`](../supabase/OWNER_USER_GUIDE.md). Do not send TestFlight / 审核中 copy.

**Consumer live ops:** App Store 搜「No Menu」；follow / new-tap push ops: [`supabase/NEW_TAP_PUSH_DEPLOYMENT.md`](../supabase/NEW_TAP_PUSH_DEPLOYMENT.md). Canonical ASC: [`taplist-mobile/docs/APP_STORE_CONNECT_1.3.0.md`](../taplist-mobile/docs/APP_STORE_CONNECT_1.3.0.md).

**Admin web (concierge only, does not change POS/iOS binaries):** `/admin/taplist` 公开状态中文化 + 上新提示、封面空串误清保护；产品池关联门店酒文案；品牌别名合酿提示。Do **not** add follower analytics or push toggles to admin.

POS does **not** need new UI for new-tap push: enqueue is DB-triggered when a drink is public + `public_status = 'new'`. Owners keep setting 上新 as today.

---

## POS next (after 1.1.0 live)

### Phase 1 — App Store live ops (now)

1. ~~Flip owner WeChat copy to 已上架 templates~~ — done (`OWNER_WECHAT_GUIDE.md`).
2. ~~App Store search install path~~ — current for new owners.
3. Onboarding loop: provision → App Store install → 改密 → 今晚酒单；point at [`OWNER_USER_GUIDE.md`](../supabase/OWNER_USER_GUIDE.md).
4. Optional: one-time cover restore ops if any bar still missing images from pre-`07170000` clears.
5. ~~Ship Tonight `1.1.0` (fixed tap slots)~~ — **Approved / live**.
6. ~~Consumer `1.3.0` ASC~~ — **Approved / live**.

### Phase 2 — Next POS binary (post-1.1.0)

Ship when Phase 1 is calm and pilot owners report real gaps. Suggested order:

| Priority | Item | Notes |
|----------|------|--------|
| P1 | Create-drink **same-name soft warning** | **Shipped in `1.1.0`** — local catalog matches surface first, plus a 「已有同名酒款，仍要创建？」 confirm that does not block create. |
| P2 | POS owner **user manual** | Done for live ops: [`OWNER_USER_GUIDE.md`](../supabase/OWNER_USER_GUIDE.md); revise after 2–3 live owners stress gaps. |
| P3 | **店休徽章** | Spec in `PRODUCT_BACKLOG.md`; unpark only when owners ask / empty rest-day visits show up. Needs POS toggle + consumer/web badge — not POS-only. |

### Phase 3 — Later POS evolution (parked)

Not scheduled. Revisit when pilot bars hit real pain:

- Schema-level drink archive (`archived_at`) once 已下架 lists get noisy
- Ordering enablement playbook per bar (still opt-in; ASC review tenants stay off)
- Any push-adjacent POS surfaces (e.g. “followers / notify” analytics) — only after consumer follow/push usage is proven in production
- Public-price legacy repair flow: keep the hard block for unpriced drinks; add 「补充价格」 + preserve/resume tap assignment only after a real bar reports that the current 商品库 round trip materially slows service

### Explicit non-goals for the next POS cut

- Daily 营业/打烊/店休 three-state ritual
- Reworking Tonight Control publish model unless a production bug forces it

Canonical Tonight ASC docs:
- [`mobile/docs/APP_STORE_CONNECT_1.1.0.md`](../mobile/docs/APP_STORE_CONNECT_1.1.0.md) — current live release
- [`mobile/docs/APP_STORE_LISTED_V1.md`](../mobile/docs/APP_STORE_LISTED_V1.md) — `1.0.0` baseline metadata
- [`mobile/APP_STORE_CONNECT_SUBMISSION.md`](../mobile/APP_STORE_CONNECT_SUBMISSION.md) — `1.0.0` fill-in checklist

---

## Current ops (use these)

| Topic | Canonical doc |
|-------|----------------|
| Concierge bar + owner bind | [`supabase/REAL_BAR_ONBOARDING.md`](../supabase/REAL_BAR_ONBOARDING.md) |
| Owner WeChat copy | [`supabase/OWNER_WECHAT_GUIDE.md`](../supabase/OWNER_WECHAT_GUIDE.md) |
| Owner user guide (Tonight) | [`supabase/OWNER_USER_GUIDE.md`](../supabase/OWNER_USER_GUIDE.md) |
| Venue QR (DB + nginx JSON) | [`supabase/TENANT_QR_LINKS.md`](../supabase/TENANT_QR_LINKS.md) |
| Support requests / account deletion deploy | [`supabase/SUPPORT_REQUESTS_DEPLOYMENT.md`](../supabase/SUPPORT_REQUESTS_DEPLOYMENT.md) |
| Multi-city backend deploy | [`supabase/DEPLOY_MULTI_CITY_BACKEND.md`](../supabase/DEPLOY_MULTI_CITY_BACKEND.md) |
| Supabase: greenfield vs existing DB | [`supabase/README.md`](../supabase/README.md) · [`supabase/GREENFIELD.md`](../supabase/GREENFIELD.md) |
| Tonight ASC `1.1.0` (current live) | [`mobile/docs/APP_STORE_CONNECT_1.1.0.md`](../mobile/docs/APP_STORE_CONNECT_1.1.0.md) |
| Tonight ASC listed v1 (`1.0.0` baseline) | [`mobile/docs/APP_STORE_LISTED_V1.md`](../mobile/docs/APP_STORE_LISTED_V1.md) |
| Tonight ASC Connect fill-in checklist | [`mobile/APP_STORE_CONNECT_SUBMISSION.md`](../mobile/APP_STORE_CONNECT_SUBMISSION.md) |
| Tonight agent / release notes | [`mobile/AGENTS.md`](../mobile/AGENTS.md) · [`mobile/README.md`](../mobile/README.md) |
| Consumer No Menu app | [`taplist-mobile/README.md`](../taplist-mobile/README.md) |
| Consumer agent rules | [`taplist-mobile/AGENTS.md`](../taplist-mobile/AGENTS.md) |
| Consumer ASC 1.3.0 (follow / 我的) | [`taplist-mobile/docs/APP_STORE_CONNECT_1.3.0.md`](../taplist-mobile/docs/APP_STORE_CONNECT_1.3.0.md) |
| New-tap push deploy | [`supabase/NEW_TAP_PUSH_DEPLOYMENT.md`](../supabase/NEW_TAP_PUSH_DEPLOYMENT.md) |
| Parked product ideas | [`PRODUCT_BACKLOG.md`](./PRODUCT_BACKLOG.md) |

### Related SQL (read-only pointers — apply via migrations)

| Concern | Migration / artifact |
|---------|----------------------|
| Business-day close/restore harden (Tonight 1.0.0) | `supabase/migrations/20260807160000_business_day_close_restore_hardening.sql` |
| Support requests table/RPCs | `supabase/migrations/20260806120000_support_requests.sql` (+ `20260806140000_…`) |
| Serving soft-archive when in orders | `supabase/migrations/20260807130000_serving_archive_when_in_orders.sql` |
| Public collab breweries (bar taplist only; not search/NEW ON TAP) | `supabase/migrations/20260814120000_public_collab_bar_taplist_only.sql` (supersedes display scope of `20260807140000_…`) |
| Default cup sizes | `supabase/migrations/20260807120000_tenant_default_cup_sizes.sql` |
| Tonight fixed tap slots (also rewrites `set_drink_taplist_listing`) | `supabase/migrations/20260817120000_tenant_tap_slot_count.sql` |
| Copy product image on pool link | `supabase/migrations/20260817130000_link_drink_copy_product_image.sql` |
| Storefront: null cover/brewing preserve | `supabase/migrations/20260807170000_storefront_preserve_null_cover.sql` |
| Consumer bar follows + new-tap push outbox | `supabase/migrations/20260807180000_consumer_bar_follows_and_new_tap_push.sql` |
| Consumer usernames (NoMenuist) | `supabase/migrations/20260811120000_consumer_usernames.sql` |
| Doubar venue QR | `supabase/migrations/20260812120000_add_doubar_qr.sql` |
| Narrow `last_menu_updated_at` freshness | `supabase/migrations/20260813120000_narrow_last_menu_updated_at.sql` |
| New-tap push Edge Function deploy | [`supabase/NEW_TAP_PUSH_DEPLOYMENT.md`](../supabase/NEW_TAP_PUSH_DEPLOYMENT.md) |
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

POS 1.0.0 round deliberately deferred these; do not treat as review blockers.

| Item | Status |
|------|--------|
| Full POS owner user manual | Written: [`OWNER_USER_GUIDE.md`](../supabase/OWNER_USER_GUIDE.md); WeChat short copy in `OWNER_WECHAT_GUIDE.md` |
| Create-drink same-name soft warning | **Shipped in live `1.1.0`** |
| Closed-day / 店休 badge on storefront | Agreed product follow-up; not shipped |
| Restore wiped `cover_image_url` rows | One-time ops if any bars lost covers before `07170000`; Storage files usually remain |
| Consumer follow + new-tap push | **Live in `1.3.0`**; dual kill-switch ops remain in `NEW_TAP_PUSH_DEPLOYMENT.md` |
| Admin: edit collab breweries on Tap List drink form | Deferred; companies aliases support `collaboration_text` only — do not block release |
| Admin: follower / notify analytics for bars | Parked (privacy + product); never expose follower identities |

---

## Product surfaces (quick map)

| Surface | Path | Bundle / notes |
|---------|------|----------------|
| Tonight (POS / owner) | `mobile/` | `com.taklip.nomenuapp` — **1.1.0 App Store live** |
| No Menu (consumer) | `taplist-mobile/` | `com.nomenuapp.taplist` — **1.3.0 App Store live** |
| Admin / platform web | `app/` | Next static export |
| Public web menu | `taplist-web/` (if present) | `/bar/{slug}`, `/tonight`, `/support` |
