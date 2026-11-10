# No Menu (consumer app)

No Menu is a Chinese-first Expo / React Native app for discovering live craft beer tap
lists in supported cities. It also includes a private personal history called **我的 TAP**:
users can record a drink without registering first, protect the record with Sign in with
Apple, and create share images.

Home-screen and App Store display name: **No Menu** (`expo.name` in `app.json`).
Bundle identifier: `com.nomenuapp.taplist`.

This app is a sibling of the No Menu POS app (**No Menu Tonight** under `mobile/`). They share a Supabase project, but the
consumer app must not depend on POS UI or mutate POS workflows.

Monorepo doc index: [`../docs/INDEX.md`](../docs/INDEX.md).  

**Status (2026-11-10):** App Store `1.3.2` (build48) + production OTA 已发布，用户确认实际使用正常，记录为用户验收通过。最新记录的 OTA group 为 `47314e59-5d47-4d4b-9990-f3f8814ffac5`；包含 E1 Feed、Reason V2、英文风格、活动展示及 UI 微调，详见 [OTA发布与回退记录](docs/OTA_CANDIDATE_2026-11-10.md)。微信小程序线上仍为1.4.0，1.5.0正式开关已开启、准备提交审核，尚不能视为已发布。
**OTA 后本地改动：** 最新 TAP 按钮尺寸与「记一杯 / Tap it」「已记录 / Tapped」「记录此店 / Tap here」文案已与小程序对齐，TypeScript 检查通过；尚未再次 OTA，不属于上方已验收的发布资产。

当前功能、客户端边界和发布状态以 [产品能力矩阵（2026-11-10）](docs/PRODUCT_SURFACES_2026-11-10.md) 为准；历史发布文档用于追溯，不应单独作为线上能力判断依据。

**6×6 活动展示：** 首页入口、活动详情内容与全部图片已 OTA，用户于2026-11-10确认验证完成。线上护照、打卡与海报生成仍由小程序承接；小程序1.5.0准备提审。正式活动小程序码已配置，发布后扫码验收及后台维护规则见 [活动上线记录](../services/consumer-intelligence/CAMPAIGN_ANALYTICS.md#正式活动码与后台维护2026-11-10)。

Tonight POS `1.1.2` is also **Approved / live** — see `mobile/docs/APP_STORE_CONNECT_1.1.2.md`.

English beer styles are database-owned Product Pool fields. Current iOS screens consume `beer_style_en` from Supabase `_i18n` RPCs and fall back to the raw style. ECS Feed, Reason V2 and first-party analytics are included in the published OTA; user acceptance is confirmed, while detailed analytics reconciliation remains a separate check. See [integration and manual acceptance](docs/CONSUMER_INTELLIGENCE_PORT_2026-11-10.md) and the [shared runtime contract](../docs/CONSUMER_STYLE_LOCALIZATION_RUNTIME.md). The published OTA also includes joint-campaign frontend integration, as recorded in the OTA release scope. Do not restore client-side V1.2 matching or infer styles from keywords.

## Setup

```bash
cd taplist-mobile
cp .env.example .env
npm install
npm run ios
```

Required public environment variables:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://nomenuapp.com/api/supabase
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_PRIVACY_POLICY_URL=
EXPO_PUBLIC_POSTHOG_API_KEY=
EXPO_PUBLIC_POSTHOG_HOST=
```

Production routes Supabase Auth, REST, Functions, and Storage through the ECS proxy above.
The current live binary may retain the hosted Supabase URL in EAS for fingerprint-compatible OTA;
`lib/supabase.ts` maps that exact URL to the proxy at runtime. Do not change the EAS production URL
during an OTA-only release without checking its runtime fingerprint. Local development continues
to use the Supabase CLI URL from `.env.local.example`.

See [`../docs/ECS_SUPABASE_PROXY.md`](../docs/ECS_SUPABASE_PROXY.md) for deployed routes,
production verification, OTA commands, and rollback. Rollback requires reverting the runtime URL
mapper; changing the EAS URL alone does not bypass it. The fixed auth storage key preserves
existing sessions in either direction.

PostHog is optional at runtime and only activates after analytics consent. P1-A identity sync was
published by production OTA on 2026-10-08 and links consented PostHog activity to the current
Supabase user ID without delaying auth or product RPCs. Cross-client status, event semantics and
known gaps are documented in [`docs/CONSUMER_ANALYTICS.md`](docs/CONSUMER_ANALYTICS.md).
Apply the repository-level `supabase/migrations/` before expecting corresponding RPCs to work.

## Product surfaces

- `今晚`: city feed, campaign entry, public bars and events, plus `适合你 / For You` and `全部上新 / Latest` feeds
- `搜索`: public beer, brewery, and bar discovery
- `我的`: private 我的 TAP, followed bars, monthly review/share images, Apple protection, language/settings, and account deletion
- `关于`: product, privacy, compliance, analytics controls, and Chinese / English / system-language selection
- Bar detail: live public tap list + compact private follow control
- Beer detail: beer information, serving prices, sharing, and private TAP recording
- Followed bars: private list + per-bar iOS new-tap notification toggles
- Nearby ordering: user-triggered foreground location, computed on device without uploading precise location

我的 TAP is private history, not a purchase receipt, rating, public check-in, or social feed.
One canonical beer counts once; distinct bar experiences can accumulate.

## Release

```bash
npm run preflight
eas build --platform ios --profile production
```

Before an iOS release:

1. Confirm `expo.version` and `expo.ios.buildNumber` in `app.json`.
2. Deploy required production migrations before the App Store build.
3. Confirm Anonymous Sign-Ins and Manual Identity Linking in Supabase Auth.
4. Confirm the Apple provider and the `com.nomenuapp.taplist` Sign in with Apple capability.
5. Confirm production secrets used for Apple token handling.
6. Deploy `merge-apple-account` and `delete-my-account`.
7. Test anonymous recording, Apple protection/restore, sharing, photo saving, unlight, and
   account deletion in TestFlight.

App Store Connect app ID: `6771324382`.
Privacy policy: `https://nomenuapp.com/privacy`.

See **[docs/TESTFLIGHT.md](docs/TESTFLIGHT.md)** (TestFlight) and **[docs/APP_STORE_SUBMISSION.md](docs/APP_STORE_SUBMISSION.md)** (App Store review).

## Layout

| Path | Role |
|------|------|
| `app/(tabs)/index.tsx` | Tonight feed |
| `app/(tabs)/search.tsx` | Search (drinks + breweries + bars) |
| `app/breweries.tsx` | City-aware brewery directory with search and pagination |
| `app/brewery/[name].tsx` | Brewery detail and currently supplied drinks |
| `app/(tabs)/mine.tsx` | Private 我的 TAP |
| `app/about.tsx` | About / compliance (Stack screen opened from Mine) |
| `app/events.tsx` | City activity list |
| `app/bar/[slug].tsx` | Bar detail and live tap list |
| `app/bar/[slug]/event/[eventId].tsx` | Activity detail and full-poster viewer |
| `app/bar/[slug]/beer/[drinkId].tsx` | Beer detail and record action |
| `app/drink-log/[lightId].tsx` | One drink's venue history |
| `components/taplist/ShareableDrinkLogImage.tsx` | 我的 TAP monthly summary export |
| `components/taplist/FirstLaunchLegalGate.tsx` | First-launch age notice |
| `lib/api/taplist.ts` | Public RPC wrappers |
| `lib/api/drinkLog.ts` | Authenticated history RPC wrappers |
| `lib/drinkLogAuth.ts` | Anonymous auth, Apple protection, deletion |
| `lib/analytics.ts` | Consent-gated PostHog client and event contract |
| `lib/analyticsIdentity.ts` | Soft Supabase-to-PostHog identity synchronization |
| `lib/types.ts` | DTO types |
| `tools/app-store-screenshots.html` | App Store screenshot compositor |

## Data and privacy

- Public screens use public RPCs with the Supabase anon key.
- Personal history uses authenticated RPCs and RLS isolation by `auth.uid()`.
- The first record can create an anonymous Supabase identity.
- Sign in with Apple links or merges that identity so records can be restored.
- Personal data and raw drink history must not be sent to PostHog.
- PostHog tracks consented behavioral events such as record success, history opens, share
  generation, and Apple-link outcomes.
- The analytics preference remains device-local, so enabled and disabled populations cannot be
  counted exactly. PostHog users are “observable users”, not all installs or all registered users.
- App and screen opens, bar/beer opens, TAP actions, and consented Feed shown/impression/open events are covered in the published OTA. Push opens are not yet tracked;
  `apple_maps_opened` covers iOS map intent only. General list/card impressions remain unimplemented.
- QR, map, share and push interactions must not be interpreted as a store visit.
- The current cross-client contract and rollout status are in
  [`docs/CONSUMER_ANALYTICS.md`](docs/CONSUMER_ANALYTICS.md).
- The dated measurement baseline and event-contract decisions are in
  [`docs/ANALYTICS_BASELINE_2026-10-08.md`](docs/ANALYTICS_BASELINE_2026-10-08.md).
- Missing images never receive fake artwork.
- Delisted drinks remain in private history; invalid public detail/share links are hidden.
- Editing a venue's TAP date is available in the mini program first; the iOS client keeps this
  action deferred until a later binary release.

Production client env vars belong in the EAS `production` environment. Apple private-key
material belongs in Supabase Edge Function secrets, never in `EXPO_PUBLIC_*` variables.

Detailed coding and product constraints are in **[AGENTS.md](AGENTS.md)**.
