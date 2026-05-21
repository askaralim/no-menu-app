# No Menu Tap List (consumer)

Expo app in this monorepo, **sibling to** `mobile/` (POS / staff). Same Supabase project; reads public data via **`get_public_taplist_*`** RPCs using the **anon** key.

## Setup

```bash
cd taplist-mobile
cp .env.example .env
# EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_PRIVACY_POLICY_URL
npm install
npm run ios   # or android / start
```

Apply database objects from repo `supabase/` migrations before expecting RPC calls to succeed. Demo UI data: `npm run db:seed-taplist-demo` from repo root.

## Release

```bash
npm run typecheck
npm run export:web
```

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
