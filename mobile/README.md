# No Menu Tonight

Home-screen / App Store display name: **No Menu Tonight** (`expo.name` in `app.json`).
Suggested App Store subtitle: **酒吧今晚运营** / **Tonight’s bar operations**.

## iOS release

```bash
cd mobile
eas build --platform ios --profile production
```

**App Store Connect** (bundle `com.taklip.nomenuapp`): set **Name** to
`No Menu Tonight`. Install a new build for the home-screen label to change.

Brand source files and usage guidance live in [`assets/brand/`](assets/brand/).
Regenerate platform PNGs with `npm run brand:generate`.
