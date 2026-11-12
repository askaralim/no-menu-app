# Documentation index (source of truth)

Last updated: 2026-11-11（小程序1.5.0审核通过并已正式发布；Taplist生产OTA已获用户验收）。

**2026-11-12 本地新增：** Web Admin「行为与 Feed 看板」包含发现与门店、Feed 与 TAP、数据质量三个视图。2026-11-13用户批准提交推送；Admin 托管发布结果待确认，ECS接口及数据库迁移尚未部署。权限、指标口径和部署步骤见 [内部看板](../services/consumer-intelligence/ADMIN_DASHBOARD.md)。

Use this file to find the **canonical** doc for a topic. Prefer current ops docs over design-era `docs/` archives.

Consumer beer-list UI: [统一视觉与复用约定](CONSUMER_BEER_LIST_UI.md). New Feed / brewery / bar lists must reuse the client’s shared beer-row styles.

Taplist Feed / Reason V2 / 英文风格 / 第一方事件迁移：[2026-11-10 本地实现与手工验收](../taplist-mobile/docs/CONSUMER_INTELLIGENCE_PORT_2026-11-10.md)。已随生产 OTA 发布并获用户验收；最终范围以 [OTA 发布记录](../taplist-mobile/docs/OTA_CANDIDATE_2026-11-10.md) 为准，包含后续联合活动前台。

Consumer Product Pool 英文风格从数据库写入、Supabase RPC、ECS Feed 到小程序/Taplist 的运行契约：[Consumer style localization runtime contract](CONSUMER_STYLE_LOCALIZATION_RUNTIME.md)。

**Consumer Feed 服务端阶段记录（2026-11-08）：** 现有 ECS 已部署 E1 Taxonomy V2 + λ=1.0 及 Recommendation Reason V2。首页横滑最多6款、完整个性化 Feed 最多20款；新 Snapshot 返回真实去重 TAP 聚合证据，历史 Instance 保留原解释。本次未新增客户端入口，不代表消费者正式发布。部署摘要、真实验收边界与回退命令见 [Consumer Intelligence RUNBOOK](../services/consumer-intelligence/RUNBOOK.md)，解释契约见 [服务 README](../services/consumer-intelligence/README.md#recommendation-reason-v2)。此进展不改变下方已发布客户端版本状态。

**2026-11-10待办整理：** Taplist Feed 已随 OTA 开放并获用户验收；该阶段的小程序1.5.0提审事项已于2026-11-11由用户确认发布完成。转化效果验证及商户报表/长期归因仍未完成；运行维护事项以服务端 RUNBOOK 的分项记录为准。E2探索、隐式Family回退和凑数策略暂不实施；不重新要求额外ECS或新增Shadow阶段。完成范围见 [服务README](../services/consumer-intelligence/README.md)，具体边界见 [RUNBOOK文末](../services/consumer-intelligence/RUNBOOK.md)。

**跨端交付约定：** 小程序全部相关功能测试确认后，完整同步到Taplist，再逐项复验。服务地址/开放范围、request/response、认证、Feed/Reason、事件与异常处理统一见 [客户端接入手册](../services/consumer-intelligence/CLIENT_INTEGRATION.md)；手册与OpenAPI、Schema、可执行样例必须随实现同步保留。

**最新确认（2026-11-11）：** 2026-11-11（Asia/Shanghai），用户确认小程序1.5.0已通过微信审核并正式发布，取代1.4.0；精确发布时间以微信后台记录为准。Taplist生产OTA及用户验收状态保持不变。Feed与活动采集正式开关已开启；此前295/295预检及ECS接收、去重、入库证据保留原日期。本次仅同步发布状态，不将发布确认等同于新增逐项测试或正式版事件对账。

**6×6 联名活动收口（2026-11-10）：** Taplist 首页入口、活动内容及全部图片展示已 OTA，并由用户确认验证完成；线上护照、打卡及活动海报仍以小程序为主。正式活动码已生成、上传并写入数据库，固定短码 `8b60ed3b`，海报码 scene 为 `p_8b60ed3b`；不再列为待创建。ECS 已核对17条真实 trial 操作入库；小程序已于2026-11-11确认发布，正式码真机扫码和 release 来源验收仍待完成。后台维护边界及证据见 [活动采集与正式码记录](../services/consumer-intelligence/CAMPAIGN_ANALYTICS.md#正式活动码与后台维护2026-11-10)，小程序状态见 [1.5.0 发布记录](../../no-menu-miniprogram/docs/releases/2026-11-10-consumer-localization-feed-candidate.md)。

**OTA 后本地增量（待发布）：** Taplist TAP 文案与紧凑按钮已和小程序统一；酒厂关联改为 company ID 优先、旧名称回退，tenant 可通过默认关闭的开关让 V2 RPC 返回“旗标 + 酒厂”的展示名；酒吧酒款列表补齐城市优先/国家回退的产地信息，酒款详情标题缩小为 `36/43`。功能 migration 与 133 家酒厂国家代码回填 migration 已准备但尚未部署，Taplist production OTA 也尚未执行。发布顺序、命令和验证边界以 [OTA 发布记录](../taplist-mobile/docs/OTA_CANDIDATE_2026-11-10.md#post-ota-local-changes--not-published) 为准。

Current POS binary: [`mobile/docs/APP_STORE_CONNECT_1.1.2.md`](../mobile/docs/APP_STORE_CONNECT_1.1.2.md). Recognition OTA record: [`mobile/docs/POS_RECOGNITION_OTA_2026-10-23.md`](../mobile/docs/POS_RECOGNITION_OTA_2026-10-23.md). Unified mini-program/POS drink-entry contract: [`mobile/docs/DRINK_ENTRY_AND_RECOGNITION_FLOW.md`](../mobile/docs/DRINK_ENTRY_AND_RECOGNITION_FLOW.md). Status and lifecycle actions: [`mobile/docs/TAPLIST_STATUS_ACTION_FLOW.md`](../mobile/docs/TAPLIST_STATUS_ACTION_FLOW.md).

**Next POS OTA queue (not live):** hide「记录换桶」for「即将上新」drinks. The operation is already rejected by the client handler and server; this pending OTA only removes the misleading entry and has no schema or native dependency change.

**Do not edit production SQL from this index.** Schema changes go through `supabase/migrations/` only.

---

## Release status (2026-11-11)

| Surface | Version | Status |
|---------|---------|--------|
| **No Menu Tonight** (POS) | App Store `1.1.2` (build 24) + production OTA | **Live / verified** — beer-label recognition, multi-store switching, tap lifecycle/keg records, paginated operations, brewery labels and merchant update reminder; the coming-soon keg-entry UI fix is queued for the next OTA |
| **No Menu Tonight** (POS) | App Store `1.1.1` (build 23) | Superseded by `1.1.2` — 分享上新、高清图片下载、群文案和酒单筛选优化 |
| **No Menu Tonight** (POS) | `1.1.0` (build ≥20) | Superseded by `1.1.1` — fixed tap slots release |
| **No Menu Tonight** (POS) | `1.0.0` (build ≥16) | Superseded — baseline metadata in [`mobile/docs/APP_STORE_LISTED_V1.md`](../mobile/docs/APP_STORE_LISTED_V1.md) |
| **No Menu** (consumer) | App Store `1.3.2` (build 48) + production OTA | **Live / user accepted** — E1 Feed、Reason V2、英文风格、活动展示及UI微调；OTA group `47314e59-5d47-4d4b-9990-f3f8814ffac5`，见 [发布记录](../taplist-mobile/docs/OTA_CANDIDATE_2026-11-10.md) |
| **No Menu** (微信小程序) | `1.5.0` | **Approved / live** — 用户于2026-11-11确认审核通过并正式发布；Feed、Reason V2、英文风格及联合活动；既有测试证据见发布记录 |
| **No Menu** (微信小程序) | `1.4.0` | **Superseded by 1.5.0** — 中英文消费者端、酒头数据与在枪周期、换桶、分页、商户提示、多门店切换、活动分享与页面加载优化；`2026-11-03` 由产品负责人确认正式发布并完成实机功能测试 |
| **No Menu** (微信小程序) | `1.3.0` | Superseded by `1.4.0` — AI 酒标识别上酒、酒单状态操作、“喝过”与 TAP 记录、员工邀请和微信 We 分析基础版本 |
| Taplist Web | Production | Cookieless QR landing, follow CTA and mini-program-code display events verified 2026-10-09 |
| ECS Supabase proxy | `nomenuapp.com/api/supabase` | **Live / verified 2026-10-08** — mini-program, POS iOS, consumer iOS, and public Taplist Web; Android intentionally excluded |
| Production DB | 酒头生命周期 migrations through `20261102120625` | **Applied / history aligned / verified** — 分页、售罄/即将上新规则与酒厂字段已上线；不要重复执行 SQL 或 repair |

**Tonight live ops:** new owners → App Store 搜「No Menu Tonight」；微信用 [`OWNER_WECHAT_GUIDE.md`](../supabase/OWNER_WECHAT_GUIDE.md) 已上架模板；完整说明 [`OWNER_USER_GUIDE.md`](../supabase/OWNER_USER_GUIDE.md). Do not send TestFlight / 审核中 copy.

**Consumer live ops:** App Store 搜「No Menu」；follow / new-tap push ops: [`supabase/NEW_TAP_PUSH_DEPLOYMENT.md`](../supabase/NEW_TAP_PUSH_DEPLOYMENT.md). Current live ASC record: [`taplist-mobile/docs/APP_STORE_CONNECT_1.3.2.md`](../taplist-mobile/docs/APP_STORE_CONNECT_1.3.2.md). TAP-history rollout: [`taplist-mobile/docs/CONSUMER_TAP_HISTORY_ROLLOUT_2026-10-25.md`](../taplist-mobile/docs/CONSUMER_TAP_HISTORY_ROLLOUT_2026-10-25.md). Brewery discovery OTA / RPC record: [`taplist-mobile/docs/BREWERY_DISCOVERY_2026-10-09.md`](../taplist-mobile/docs/BREWERY_DISCOVERY_2026-10-09.md).

**Admin web (concierge only, does not change POS/iOS binaries):** `/admin/taplist` 公开状态中文化 + 上新提示、封面空串误清保护；产品池关联门店酒文案；品牌别名合酿提示。Do **not** add follower analytics or push toggles to admin.

POS does **not** need new UI for new-tap push: enqueue is DB-triggered when a drink is public + `public_status = 'new'`. Owners keep setting 上新 as today.

---

## POS next (after 1.1.2 approval)

### Phase 1 — App Store live ops (now)

1. ~~Flip owner WeChat copy to 已上架 templates~~ — done (`OWNER_WECHAT_GUIDE.md`).
2. ~~App Store search install path~~ — current for new owners.
3. Onboarding loop: provision → App Store install → 改密 → 今晚酒单；point at [`OWNER_USER_GUIDE.md`](../supabase/OWNER_USER_GUIDE.md).
4. Optional: one-time cover restore ops if any bar still missing images from pre-`07170000` clears.
5. ~~Ship Tonight `1.1.0` (fixed tap slots)~~ — **Approved / superseded**.
6. ~~Ship Tonight `1.1.1` (分享上新)~~ — **Approved / superseded by 1.1.2**.
7. ~~Ship Tonight `1.1.2` (image preview + OTA)~~ — **Approved / live**.
8. ~~Consumer `1.3.0` ASC~~ — **Approved / superseded by 1.3.1**.
9. ~~Expose the existing multi-store selector from the tap-list header~~ — **live in production OTA / user-tested**.
10. Next POS OTA: hide「记录换桶」for「即将上新」— **implemented / typechecked / focused tests passed; not yet published**.

### Phase 2 — Next POS binary (post-1.1.2)

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
- [`mobile/docs/APP_STORE_CONNECT_1.1.2.md`](../mobile/docs/APP_STORE_CONNECT_1.1.2.md) — current live release
- [`mobile/docs/APP_STORE_CONNECT_1.1.1.md`](../mobile/docs/APP_STORE_CONNECT_1.1.1.md) — previous release
- [`mobile/docs/APP_STORE_CONNECT_1.1.0.md`](../mobile/docs/APP_STORE_CONNECT_1.1.0.md) — previous release
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
| ECS Supabase proxy rollout / rollback | [`docs/ECS_SUPABASE_PROXY.md`](./ECS_SUPABASE_PROXY.md) |
| Supabase: greenfield vs existing DB | [`supabase/README.md`](../supabase/README.md) · [`supabase/GREENFIELD.md`](../supabase/GREENFIELD.md) |
| Tonight ASC `1.1.2` (current live) | [`mobile/docs/APP_STORE_CONNECT_1.1.2.md`](../mobile/docs/APP_STORE_CONNECT_1.1.2.md) |
| POS recognition/status OTA 2026-10-23 | [`mobile/docs/POS_RECOGNITION_OTA_2026-10-23.md`](../mobile/docs/POS_RECOGNITION_OTA_2026-10-23.md) |
| Unified drink entry and recognition flow | [`mobile/docs/DRINK_ENTRY_AND_RECOGNITION_FLOW.md`](../mobile/docs/DRINK_ENTRY_AND_RECOGNITION_FLOW.md) |
| POS / mini-program status action flow | [`mobile/docs/TAPLIST_STATUS_ACTION_FLOW.md`](../mobile/docs/TAPLIST_STATUS_ACTION_FLOW.md) |
| Mini-program `1.4.0` live release / tap lifecycle record | [`no-menu-miniprogram/docs/releases/2026-10-29-next-release.md`](../../no-menu-miniprogram/docs/releases/2026-10-29-next-release.md) |
| Tonight ASC `1.1.1` (previous) | [`mobile/docs/APP_STORE_CONNECT_1.1.1.md`](../mobile/docs/APP_STORE_CONNECT_1.1.1.md) |
| Tonight ASC `1.1.0` (previous) | [`mobile/docs/APP_STORE_CONNECT_1.1.0.md`](../mobile/docs/APP_STORE_CONNECT_1.1.0.md) |
| Tonight ASC listed v1 (`1.0.0` baseline) | [`mobile/docs/APP_STORE_LISTED_V1.md`](../mobile/docs/APP_STORE_LISTED_V1.md) |
| Tonight ASC Connect fill-in checklist | [`mobile/APP_STORE_CONNECT_SUBMISSION.md`](../mobile/APP_STORE_CONNECT_SUBMISSION.md) |
| Tonight agent / release notes | [`mobile/AGENTS.md`](../mobile/AGENTS.md) · [`mobile/README.md`](../mobile/README.md) |
| Consumer No Menu app | [`taplist-mobile/README.md`](../taplist-mobile/README.md) |
| Consumer WeChat mini-program | [`no-menu-miniprogram/README.md`](../../no-menu-miniprogram/README.md) |
| Public Taplist Web | [`taplist-web/README.md`](../../taplist-web/README.md) |
| Consumer analytics contract / rollout | [`taplist-mobile/docs/CONSUMER_ANALYTICS.md`](../taplist-mobile/docs/CONSUMER_ANALYTICS.md) |
| Consumer “喝过” / TAP-history rollout | [`taplist-mobile/docs/CONSUMER_TAP_HISTORY_ROLLOUT_2026-10-25.md`](../taplist-mobile/docs/CONSUMER_TAP_HISTORY_ROLLOUT_2026-10-25.md) |
| Consumer analytics 2026-10-08 baseline | [`taplist-mobile/docs/ANALYTICS_BASELINE_2026-10-08.md`](../taplist-mobile/docs/ANALYTICS_BASELINE_2026-10-08.md) |
| Consumer brewery discovery OTA / RPC rollout | [`taplist-mobile/docs/BREWERY_DISCOVERY_2026-10-09.md`](../taplist-mobile/docs/BREWERY_DISCOVERY_2026-10-09.md) |
| Consumer i18n OTA 2026-11-04 | [`taplist-mobile/docs/I18N_OTA_2026-11-04.md`](../taplist-mobile/docs/I18N_OTA_2026-11-04.md) |
| Consumer agent rules | [`taplist-mobile/AGENTS.md`](../taplist-mobile/AGENTS.md) |
| Consumer ASC 1.3.2 (current live) | [`taplist-mobile/docs/APP_STORE_CONNECT_1.3.2.md`](../taplist-mobile/docs/APP_STORE_CONNECT_1.3.2.md) |
| Consumer ASC 1.3.1 (previous live release) | [`taplist-mobile/docs/APP_STORE_CONNECT_1.3.1.md`](../taplist-mobile/docs/APP_STORE_CONNECT_1.3.1.md) |
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
| Tap lifecycle, keg changes, pending/sold-out rules, pagination and brewery labels | `20261025105300` → `20261026053527` → `20261026124858` → `20261028192300` → `20261029110918` → `20261029145403` → `20261030164547` → `20261102120625` |
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
| Tonight (POS / owner) | `mobile/` | `com.taklip.nomenuapp` — **1.1.2 (build 24) + production OTA through 2026-11-03 live; next OTA has one coming-soon UI consistency fix queued** |
| No Menu (consumer) | `taplist-mobile/` | `com.nomenuapp.taplist` — **1.3.2 (build 48) App Store live** |
| No Menu (微信小程序) | `../no-menu-miniprogram/` | `1.4.0` live；正式发布与实机功能测试于 `2026-11-03` 由产品负责人确认 |
| Admin / platform web | `app/` | Next static export；Web 酒单新增与商品池创建不再录入产品级产地，编辑旧酒款时保留既有 `profile.country` |
| Public web menu | `../taplist-web/` | `/bar/{slug}`, `/tonight`, `/support`; cookieless QR analytics live |
