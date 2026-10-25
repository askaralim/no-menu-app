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

**Status (2026-10-25):** App Store `1.3.2` (build 48) + production OTA is **Approved / live**. In addition to brewery discovery, the current experience marks previously tasted drinks in bar tap lists, clarifies beer-detail state and improves TAP record layout and deletion wording. The matching WeChat mini-program has passed review and is live with the same private “喝过” semantics and updated analytics. See [`docs/CONSUMER_TAP_HISTORY_ROLLOUT_2026-10-25.md`](docs/CONSUMER_TAP_HISTORY_ROLLOUT_2026-10-25.md) and [`docs/BREWERY_DISCOVERY_2026-10-09.md`](docs/BREWERY_DISCOVERY_2026-10-09.md). ASC: [`docs/APP_STORE_CONNECT_1.3.2.md`](docs/APP_STORE_CONNECT_1.3.2.md).
Tonight POS `1.1.2` is also **Approved / live** — see `mobile/docs/APP_STORE_CONNECT_1.1.2.md`.

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

- `今晚`: city feed, public bars, events, and new taps
- `搜索`: public beer, brewery, and bar discovery
- `我的`: private 我的 TAP, followed bars entry, Apple protection, sharing, and account deletion
- `关于`: product, privacy, compliance, and analytics controls, opened from the fixed top action in `我的`
- Bar detail: live public tap list + compact private follow control
- Beer detail: beer information, serving prices, sharing, and `喝过`
- Followed bars: private list + per-bar iOS new-tap notification toggles

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
- App and screen opens, bar/beer opens and TAP actions are covered. Push opens are not yet tracked;
  `apple_maps_opened` covers iOS map intent only; list/card impressions are not implemented.
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
