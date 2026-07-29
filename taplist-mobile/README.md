# No Menu (consumer tap list)

Home-screen / App Store display name: **No Menu** (`expo.name` in `app.json`). Subtitle in App Store Connect: e.g. **城市精酿酒吧公开酒单**.

Expo app in this monorepo, **sibling to** `mobile/` (**No Menu POS** / staff). Same Supabase project; reads public data via **`get_public_taplist_*`** RPCs using the **anon** key.

## Setup

```bash
cd taplist-mobile
cp .env.example .env
# EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_PRIVACY_POLICY_URL
# EXPO_PUBLIC_POSTHOG_API_KEY, EXPO_PUBLIC_POSTHOG_HOST
npm install
npm run ios   # or android / start
```

Apply database objects from repo `supabase/` migrations before expecting RPC calls to succeed. Demo UI data: `npm run db:seed-taplist-demo` from repo root.

## Release

```bash
npm run typecheck
npm run export:web
eas build --platform ios --profile production
```

**App Store Connect** (app id `6771324382`): **Name** = `No Menu`, **Subtitle** = `城市精酿酒吧公开酒单` (or your locale copy). Icon label updates only after a new build is installed.

See **[docs/TESTFLIGHT.md](docs/TESTFLIGHT.md)** (TestFlight) and **[docs/APP_STORE_SUBMISSION.md](docs/APP_STORE_SUBMISSION.md)** (App Store review).

## Layout

| Path | Role |
|------|------|
| `app/(tabs)/index.tsx` | Tonight feed |
| `app/(tabs)/search.tsx` | Search (drinks + bars) |
| `app/(tabs)/about.tsx` | About / compliance |
| `components/taplist/FirstLaunchLegalGate.tsx` | First-launch age notice |
| `lib/api/taplist.ts` | RPC wrappers |
| `lib/types.ts` | DTO types |

## Bundle IDs

- iOS / Android: `com.nomenuapp.taplist`
- App Store Connect app ID (`ascAppId`): `6771324382`
- Privacy policy: `https://nomenuapp.com/privacy`

Production env vars: set in **Expo dashboard → Secrets → production** (same names as `.env.example`), not in `eas.json`.

## DRINK LOG release prerequisites

Before shipping the consumer drink log:

1. Apply `supabase/migrations/20260721120000_consumer_drink_log_v1.sql`.
2. Enable Anonymous Sign-Ins and Manual Identity Linking in Supabase Auth.
3. Configure the Apple provider for `com.nomenuapp.taplist` and enable Sign in with Apple for the App ID.
4. Deploy `merge-apple-account` and `delete-my-account` Edge Functions.
5. Update the public privacy policy for anonymous account IDs, private drink history, Apple account protection, deletion, and analytics processing.
6. Verify point-lighting, Apple recovery, account deletion, sharing, and photo-library save on a TestFlight build.
