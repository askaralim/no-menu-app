# No Menu Tonight

Home-screen / App Store display name: **No Menu Tonight** (`expo.name` in `app.json`).
Suggested App Store subtitle: **酒吧今晚运营** / **Tonight’s bar operations**.

## iOS release

**Required before `eas build`:** production Supabase must be in EAS env
(not only in local `.env` — `.env` is not uploaded to EAS).

```bash
cd mobile
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_PROJECT.supabase.co --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_ANON_KEY --environment production --visibility sensitive
# or set the same names in Expo dashboard → Project → Environment variables → production
eas env:list --environment production
```

Then:

```bash
cd mobile
eas build --platform ios --profile production
```

**App Store Connect** (bundle `com.taklip.nomenuapp`): set **Name** to
`No Menu Tonight`. Install a new build for the home-screen label to change.

Brand source files and usage guidance live in [`assets/brand/`](assets/brand/).
Regenerate platform PNGs with `npm run brand:generate`.

If TestFlight opens to a Chinese “应用配置不完整” screen, the build is missing
those two EAS variables — fix env and rebuild (code alone cannot reach production DB).
