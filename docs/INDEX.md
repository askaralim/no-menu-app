# Documentation index (source of truth)

Last updated: 2026-08-09.

Use this file to find the **canonical** doc for a topic. Prefer current ops docs over design-era `docs/` archives.

**Do not edit production SQL from this index.** Schema changes go through `supabase/migrations/` only.

---

## Release status (2026-08-09)

| Surface | Version | Status |
|---------|---------|--------|
| **No Menu Tonight** (POS) | App Store `1.0.0` (build ≥16) | **Submitted to ASC / in review** — POS 1.0.0 round closed |
| **No Menu** (consumer) | App Store listed separately (`com.nomenuapp.taplist`) | See `taplist-mobile/` docs |
| Production DB | Migrations through `20260807180000_…` (incl. cover preserve + bar follows) | Applied |

**Active engineering focus:** consumer bar follows + new-tap push (`20260807180000_…`) — in test; delivery gated off until activated.

**POS stance while that runs:** no competing feature sprint. Keep ASC review quiet; queue post-1.0.0 POS work below.

While Tonight is in review: do **not** upload a replacement binary unless Apple requests a resubmit. Backend hotfixes (RPC migrations) are OK without a new build.

---

## POS next (after 1.0.0 round)

Constraint: consumer push owns active eng bandwidth. POS work below is **queued**, not parallel sprint.

### Phase 0 — ASC quiet period (now)

| Do | Don't |
|----|--------|
| Answer Apple / resubmit **only if asked** | Upload a replacement binary “just in case” |
| Backend-only hotfix if a submitted client path breaks | Ship new POS product UI that needs a new build |
| Keep opening bars on TestFlight / existing ops docs | Start 店休 or large POS redesign |

POS does **not** need new UI for new-tap push: enqueue is DB-triggered when a drink is public + `public_status = 'new'`. Owners keep setting 上新 as today.

### Phase 1 — App Store live ops (on approval)

1. Flip owner WeChat copy to 已上架 templates (`OWNER_WECHAT_GUIDE.md`).
2. Confirm App Store search install path; retire “审核中 / TestFlight-only” wording for new owners.
3. Shorten onboarding loop: provision → App Store install → 改密 → 今晚酒单；point at 上手 bullets, not a full manual yet.
4. Optional: one-time cover restore ops if any bar still missing images from pre-`07170000` clears.

### Phase 2 — Next POS binary (1.0.1 / 1.1 candidate)

Ship only after Phase 1 is calm and push test is not blocked. Suggested order:

| Priority | Item | Notes |
|----------|------|--------|
| P1 | Create-drink **same-name soft warning** | Soft prompt only; do not block create. Agreed 1.0.0 deferral. |
| P2 | POS owner **user manual** (or expanded WeChat 上手) | Full manual was deferred; keep thin until 2–3 live owners stress the gaps. |
| P3 | **店休徽章** | Spec in `PRODUCT_BACKLOG.md`; unpark only when owners ask / empty rest-day visits show up. Needs POS toggle + consumer/web badge — not POS-only. |

### Phase 3 — Later POS evolution (parked)

Not scheduled. Revisit when pilot bars hit real pain:

- Schema-level drink archive (`archived_at`) once 已下架 lists get noisy
- Ordering enablement playbook per bar (still opt-in; ASC review tenants stay off)
- Any push-adjacent POS surfaces (e.g. “followers / notify” analytics) — only after consumer delivery is proven

### Explicit non-goals for the next POS cut

- Competing with consumer follow/push delivery
- Daily 营业/打烊/店休 three-state ritual
- Reworking Tonight Control publish model unless a production bug forces it

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

POS 1.0.0 round deliberately deferred these; do not treat as review blockers.

| Item | Status |
|------|--------|
| Full POS owner user manual | Not written; use `OWNER_WECHAT_GUIDE.md` short 上手 |
| Create-drink same-name soft warning | Agreed product follow-up; not shipped |
| Closed-day / 店休 badge on storefront | Agreed product follow-up; not shipped |
| Restore wiped `cover_image_url` rows | One-time ops if any bars lost covers before `07170000`; Storage files usually remain |
| Consumer follow + new-tap push delivery | Migration applied; delivery gated off until activated — **active next phase** |

---

## Product surfaces (quick map)

| Surface | Path | Bundle / notes |
|---------|------|----------------|
| Tonight (POS / owner) | `mobile/` | `com.taklip.nomenuapp` — **1.0.0 in ASC review** |
| No Menu (consumer) | `taplist-mobile/` | `com.nomenuapp.taplist` |
| Admin / platform web | `app/` | Next static export |
| Public web menu | `taplist-web/` (if present) | `/bar/{slug}`, `/tonight`, `/support` |
