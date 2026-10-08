# ECS Supabase proxy rollout

Last verified: 2026-10-08.

## Purpose

No Menu clients use the `nomenuapp.com` ECS as a same-origin / stable-domain proxy for
Supabase. This avoids client connectivity failures seen on some VPN, Wi-Fi, and mobile carrier
networks while keeping the Supabase project, anon key, JWTs, RLS, and application RPCs unchanged.

Production base URL:

```text
https://nomenuapp.com/api/supabase
```

## Production status

| Surface | Status | Production behavior |
|---------|--------|---------------------|
| WeChat mini-program | Live | Uses the legacy proxy paths without `/v1` |
| No Menu Tonight iOS (POS `1.1.2`, build 24) | Live and OTA-verified | Supabase JS requests use the SDK-compatible proxy paths |
| No Menu iOS (consumer `1.3.2`, build 48) | Live and OTA-verified | Supabase JS requests use the SDK-compatible proxy paths; existing Apple/Supabase session is preserved |
| Public Taplist Web at `nomenuapp.com` | Live and verified | SDK and Edge Function base URL is the ECS proxy; existing `/api/taplist/*` public facade remains unchanged |
| Android | Intentionally excluded | No Android app is currently released; no Android OTA/build was published |

The admin/platform web is outside this mobile/public-client connectivity rollout.

## ECS routes

The deployed Nginx include is:

```text
/etc/nginx/snippets/nomenu-miniprogram-supabase.conf
```

Its versioned source is in the sibling mini-program project:

```text
../no-menu-miniprogram/deploy/nginx/nomenu-miniprogram-supabase.conf
```

SDK-compatible routes:

| Client path | Upstream |
|-------------|----------|
| `/api/supabase/auth/v1/*` | Supabase Auth `/auth/v1/*` |
| `/api/supabase/rest/v1/*` | Supabase REST/RPC `/rest/v1/*` |
| `/api/supabase/functions/v1/*` | Supabase Edge Functions `/functions/v1/*` |
| `/api/supabase/storage/v1/*` | Supabase Storage `/storage/v1/*` |
| `/api/supabase/realtime/v1/*` | Supabase Realtime `/realtime/v1/*`, including WebSocket upgrade |

The mini-program's existing `/api/supabase/auth/*`, `/rest/*`, and `/functions/*` routes are
retained for compatibility. Never place a Supabase `service_role` or secret key in a public
client or in an `EXPO_PUBLIC_*` / `VITE_*` variable.

## Mobile OTA compatibility

The currently installed iOS binaries were built with the hosted Supabase project URL. Changing
that EAS variable alone changes the generated runtime fingerprint for the consumer app and can
make an OTA ineligible for the installed build. Therefore both mobile clients currently use this
compatibility behavior in `lib/supabase.ts`:

1. Read the existing configured URL.
2. If it exactly matches the production Supabase project URL, replace it at runtime with
   `https://nomenuapp.com/api/supabase`.
3. Leave local Supabase and already-proxied URLs unchanged.

Do not change the EAS production URL during an OTA-only release unless runtime compatibility has
been checked deliberately. A future native App Store build may use the proxy URL directly.

Both apps pin the production auth storage key to:

```text
sb-agtujigvxxdppngirqtu-auth-token
```

This prevents the domain change from creating a new empty session slot. The consumer app's Apple
identity remains linked in the same Supabase project; the OTA does not clear iOS SecureStore.

Production iOS OTA commands:

```bash
cd mobile
eas update --channel production --environment production --platform ios --message "POS update"

cd ../taplist-mobile
eas update --channel production --environment production --platform ios --message "Taplist update"
```

## Verification record

The rollout was verified against native-device traffic in the ECS Nginx access log:

- POS native requests reached `/api/supabase/rest/v1/*` with successful `200` / `204` responses.
- POS Realtime reached `/api/supabase/realtime/v1/websocket` and upgraded with `101`.
- Taplist native public and authenticated RPCs returned `200` through the proxy.
- Taplist `/api/supabase/auth/v1/user` returned `200`; private history/profile calls continued to
  work, confirming the pre-OTA session remained usable.
- Taplist Web's active production bundle contains the ECS base URL and no Supabase API host; a
  public cities RPC through the full proxy path returned `200` and 11 cities.
- A final 2026-10-08 recheck returned `200` for consumer REST, Auth, Functions, and Storage proxy
  paths; recent native access-log aggregates showed successful public/private RPCs and token
  refresh, and the Taplist preflight passed.

Useful live checks:

```bash
ssh root@47.116.222.78 "nginx -t"
ssh root@47.116.222.78 "tail -200 /var/log/nginx/access.log"
```

Use the native user agent to distinguish installed apps from browser tests: `NoMenuTonight/*` for
POS and `NoMenu/*` for the consumer app.

## Rollback

Mobile rollback is a code rollback: remove/revert `resolveSupabaseClientUrl` and publish another
iOS OTA to the same production channel and compatible runtime. Merely restoring the hosted URL in
EAS does not bypass the current mapper. Keep the fixed auth storage key during rollback so users
retain their sessions.

For Taplist Web, restore the previous production URL, rebuild, and redeploy, or restore the ECS
snapshot created before this rollout:

```text
/root/taplist-before-ecs-proxy-20261007-2235.tar.gz
```

After any Nginx change, run `nginx -t` before reload and repeat REST, Auth, Function, Storage, and
Realtime checks appropriate to the changed surface.
