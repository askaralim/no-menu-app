# AGENTS.md

## Project

This is the Expo / React Native consumer app **No Menu** (tap list; display name in `app.json`).

The product is a minimal real-time craft beer bar list for Shanghai craft beer bars.

## Commands

Run from `taplist-mobile/`:

```bash
npm install
npm run typecheck
npm run export:web
npm run preflight
npm run ios
npm run web
```

Note: `npm run web` may fail on some local Node / Expo CLI combinations with port detection issues. Use `npm run export:web` or `npm run preflight` for build verification.

## App Structure

- `app/(tabs)/index.tsx` - Tonight home feed
- `app/(tabs)/search.tsx` - Search (drinks + bars where supported)
- `app/(tabs)/about.tsx` - About / compliance
- `app/bar/[slug].tsx` - Bar detail and live tap list
- `app/bar/[slug]/beer/[drinkId].tsx` - Beer detail
- `components/taplist/` - Tap List-specific UI components
- `components/taplist/FirstLaunchLegalGate.tsx` - First-launch age and compliance gate
- `constants/design.ts` - Visual system
- `constants/compliance.ts` - Legal / compliance copy
- `lib/api/taplist.ts` - Supabase RPC API calls
- `lib/formatTaplist.ts` - Display formatting helpers
- `tools/app-store-screenshots.html` - App Store screenshot composition helper

## Product Constraints

MVP should only include:

- Tonight bar feed
- Search
- About
- Bar detail
- Beer detail
- Public tap list
- Serving options

Do not add:

- Map
- GPS / nearby sorting
- Ratings
- Check-ins
- User profile
- Collections
- Social feed
- Ordering
- Payments
- Delivery
- Reservations
- Multi-bar beer identity

### Post-MVP exception: Tonight's Beer Route

Beer Route is allowed when all of the following are true:

- Anchored to the **viewed bar** coordinates only — no device GPS, no live location permission, no nearby sorting from phone position
- No embedded map panel in the app UI
- Walking distance/time from server-side AMap Web Service; per-leg navigation via AMap HTTPS URI handoff only
- Optional module on bar detail and beer detail; silent omit while loading or on any failure
- Kill switch defaults off until AMap authorization, privacy, telemetry, and pilot coverage gates pass

Do not add a general map feature, user-location-based discovery, or route personalization in Beer Route v1.

## Visual Direction

The app should feel like:

- late-night craft beer magazine
- editorial bar menu
- music / vinyl track list
- premium dark mode
- calm, atmospheric, minimal

Avoid:

- SaaS dashboard
- POS table
- beer database UI
- bright neon cyberpunk
- generic restaurant listing app

## Typography

The UI is Chinese-first.

Prefer iOS Chinese system typography such as `PingFang SC`.
Avoid overly heavy Chinese display text.
Large Chinese headings should stay controlled and breathable.

## Home Feed

The home screen is the primary consumer entry point.

- Keep `TONIGHT` as the main first-viewport identity.
- Public city metadata belongs under the city header.
- `NEW ON TAP` is a lightweight discovery section for drinks with public status `new`.
- `NEW ON TAP` should stay visually secondary to the large bar cards.
- Use compact horizontal cards for discovery modules; avoid dashboard-like section headers or dense tables.
- New-tap cards should link directly to `/bar/{tenant_slug}/beer/{drink_id}`.
- If the new-tap query fails while the bar feed succeeds, keep the bar feed visible and omit the section.

## Discovery Rails

Home discovery modules such as `EVENTS` and `NEW ON TAP` should stay secondary to the main bar feed.

- Keep rail-card sizing and shared rail visuals controlled by `components/taplist/railCardStyle.ts`.
- Do not randomly tune card dimensions per screen; change shared tokens deliberately and verify the home and bar-detail impact.
- `EVENTS` should feel lightweight: compact cards, minimal text, tight title-to-card spacing, and enough breathing room before the next module.
- `NEW ON TAP` may be slightly taller than `EVENTS` because it carries beer metadata.
- Card borders should remain transparent unless explicitly requested; badge borders may stay subtle for legibility.
- On bar detail, reduce the gap between event rails and the first beer row by adjusting the actual spacing source, not unrelated card styles.

## Data Rules

Use real Supabase data only. Do not add placeholder bars, placeholder drinks, fake tap counts, fake beer metadata, fake tasting notes, or demo collections.

If Supabase env vars are missing, an RPC fails, or a query returns no rows, show a natural empty/error state instead of fabricated data.

`last_menu_updated_at` is consumer-facing freshness metadata. It must only represent intentional public tap list / menu changes, not POS order activity or stock-only inventory changes. Stock-only updates from order deductions should not refresh bar ordering or home-feed freshness labels.

## Missing Images

Do not render fake beer artwork for missing `image_url`.

- For beer detail pages, omit the image area entirely when a beer has no image.
- For share beer images, omit the large artwork block when a beer has no image.
- For bar detail lists and share taplist rows, do not show initial-letter placeholder art. If alignment is needed for mixed image/no-image lists, use spacing only, not a visible placeholder.
- Preserve real beer images exactly when `image_url` exists.

## Share Images

Share/download images are product-facing assets and should feel like premium editorial menus.

- Keep generated images legible, compact, and suitable for forwarding to customers or friends.
- Do not use fake images or decorative placeholders in share exports.
- Default share exports should follow the app's dark premium style.
- Tenant-specific bespoke exports are allowed only for concrete partner needs.
- Tenant-specific export logic should be narrowly gated by tenant id and should not affect the default template.
- The bespoke paper menu export for tenant `4d1da7d9-8b21-4706-b535-355b9ff79388` should keep its paper-menu style unless explicitly asked to revise it.

## Verification

Before finishing UI/code changes, run:

```bash
npm run preflight
```

For App Store release readiness, also run a real-device or TestFlight smoke test when practical:

- Home feed loads and `NEW ON TAP` appears when real `new` drinks exist.
- Bar detail opens and live tap list rows render with and without beer images.
- Beer detail opens from home, search, and bar detail links.
- Save/share beer image works for beers with and without images.
- Save/share bar taplist image works for mixed image/no-image lists.

## Supabase

Required env vars:

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_PRIVACY_POLICY_URL=
```

Supabase reads should go through public RPCs in `lib/api/taplist.ts`.

The Supabase client must remain safe for static export / SSR. Do not remove the no-op storage fallback for server-side rendering.

Public consumer features should use public RPCs rather than direct table reads from screens.

- Add matching TypeScript DTOs in `lib/types.ts`.
- Add API helpers in `lib/api/taplist.ts`.
- Keep RPC failures soft when the feature is optional and the main screen can still function.
- Deploy required Supabase migrations before shipping App Store builds that depend on them.
- For public home sections, return only public-visible, enabled tenant/category/drink data.

## App Store Release Workflow

Use semantic versioning for user-visible releases.

- Patch versions, such as `1.0.3`, are for fixes and polish only.
- Minor versions, such as `1.1.0`, are for user-visible features such as `NEW ON TAP`, new share templates, or new public RPC-backed surfaces.
- Increment `ios.buildNumber` for every App Store submission.
- Before submission, confirm `app.json` version/build number, run `npm run preflight`, deploy required Supabase migrations, and smoke-test an iOS production/TestFlight build.
- Do not include unrelated seed files, scratch scripts, or generated local artifacts in a release commit unless intentionally requested.

## App Store Screenshots

Use `tools/app-store-screenshots.html` to compose App Store screenshots.

- It should support 6.9-inch portrait output by default.
- It may prefill local `file://` screenshots for the current release.
- Clicking a phone frame should still allow replacing the screenshot manually.
- Use `contain` behavior for generated share images so tall or short exported images are not cropped.
- Screenshot copy should emphasize the current release's user-visible value, not internal implementation details.
- Avoid screenshots that show debug UI, camera UI, temporary seed-only data, or misleading unavailable features.
