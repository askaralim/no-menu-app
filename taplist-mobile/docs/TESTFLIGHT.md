# Tap List — TestFlight (mirror `mobile/` workflow)

Consumer app in `taplist-mobile/`. POS staff app is `mobile/` — **separate** bundle, App Store Connect app, and EAS Expo project.

## Your App Store / Expo identifiers

| Item | Value |
|------|--------|
| **iOS bundle ID** | `com.nomenuapp.taplist` |
| **App Store Connect app ID** (`ascAppId`) | `6771324382` |
| **ASC SKU** | `nomenuapp-ios-v1` |
| **Privacy policy** | https://nomenuapp.com/privacy |
| **Expo slug** | `no-menu-app` (`@askar.alim/no-menu-app`) |
| **EAS project ID** | `470f9d09-531f-4478-a32c-6a2217b79a87` |

## POS vs Tap List

| | POS `mobile/` | Tap List `taplist-mobile/` |
|--|----------------|----------------------------|
| Bundle ID | `com.taklip.nomenuapp` | `com.nomenuapp.taplist` |
| EAS project | `25370b31-037e-42a1-b6ce-16bf661e1ccc` | `470f9d09-531f-4478-a32c-6a2217b79a87` |
| Auth | Staff login | Anon public RPCs only |
| Expo slug | `nomenu` | `no-menu-app` |

---

## Done in repo (agent)

- [x] `eas.json` aligned with `mobile/` (`appVersionSource: local`, secrets via dashboard, `ascAppId` in submit)
- [x] `app.config.ts` — `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` bridge, encryption plist, `extra` for Supabase + privacy URL
- [x] `app.json` — bundle `com.nomenuapp.taplist`, `buildNumber: 1`, EAS `projectId`
- [x] `npm run preflight` — typecheck + web export
- [x] This doc + updated [APP_STORE_SUBMISSION.md](./APP_STORE_SUBMISSION.md)

---

## You — before first `eas build`

### 1. App Store Connect

Already created with bundle `com.nomenuapp.taplist` and app id `6771324382`. No action unless the listing is missing.

### 2. EAS production secrets (required)

Expo dashboard → project **no-menu-app** → **Secrets** → environment **production**:

| Secret | Example |
|--------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | `https://nomenuapp.com/privacy` |

Optional: same values as `NEXT_PUBLIC_*` if your CI only sets those (supported in `app.config.ts`).

Do **not** put secrets in `eas.json` (git).

### 3. `eas init` (slug)

Project is linked via `extra.eas.projectId` in `app.json`. Slug must stay **`no-menu-app`** to match Expo. With `app.config.ts`, EAS cannot auto-edit config — change slug only in `app.json`.

### 4. Preflight

```bash
cd taplist-mobile
npm install
npm run preflight
```

### 5. Production iOS build

```bash
cd taplist-mobile
eas build --platform ios --profile production
```

First build: Apple credentials / distribution cert (same flow as POS `mobile/`).

### 6. TestFlight

1. App Store Connect → Tap List app → **TestFlight**
2. Add **internal** testers
3. Manual smoke: [APP_STORE_SUBMISSION.md §9](./APP_STORE_SUBMISSION.md#9-pre-submission-manual-smoke-5-min)

---

## Later — App Store review

1. ASC metadata: screenshots, subtitle, **Food & Drink**, age **17+**, review notes ([APP_STORE_SUBMISSION.md](./APP_STORE_SUBMISSION.md))
2. `eas submit --platform ios --profile production`  
   - `ascAppId` is in `eas.json`  
   - Add `appleId` (Apple ID email) and `appleTeamId` when prompted or in `eas.json`

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `eas init` cannot write `app.config.ts` | Set `slug` in `app.json` manually (`no-menu-app`) |
| Slug mismatch | Match `app.json` slug to Expo project slug |
| About has no privacy link | Set `EXPO_PUBLIC_PRIVACY_POLICY_URL` in EAS secrets and rebuild |
| Empty Tonight on device | Production secrets must point at hosted Supabase with demo/real data |
