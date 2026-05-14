# No Menu Tap List (consumer)

Expo app in this monorepo, **sibling to** `mobile/` (POS / staff). Same Supabase project; reads public data via **`get_public_taplist_*`** RPCs using the **anon** key.

## Setup

```bash
cd taplist-mobile
cp .env.example .env
# fill EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run ios   # or android / start
```

Apply database objects from [docs/taplist_mvp_schema_sql.md](../docs/taplist_mvp_schema_sql.md) before expecting RPC calls to succeed.

## Layout

| Path | Role |
|------|------|
| `app/(tabs)/index.tsx` | Discover — sample `useQuery` + `fetchPublicBars` |
| `app/(tabs)/settings.tsx` | Settings / compliance placeholder |
| `lib/supabase.ts` | Anon Supabase client |
| `lib/api/taplist.ts` | Thin RPC wrappers |
| `lib/types.ts` | DTO types aligned with RPC JSON |
| `constants/taplist.ts` | e.g. default city for home |

## Bundle IDs

- iOS: `com.taklip.nomenutaplist`
- Android: `com.taklip.nomenutaplist`

Change in `app.json` if you use a different signing identity.
