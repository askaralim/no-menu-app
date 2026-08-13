# AGENTS.md

## Project

This is the Expo / React Native consumer app **No Menu** (tap list; display name in `app.json`).

The product is a Chinese-first real-time craft beer discovery app for supported cities. It
combines public bar tap lists with a private personal drink history called **酒迹**.

Monorepo ops index: [`../docs/INDEX.md`](../docs/INDEX.md).  
Sibling POS (**No Menu Tonight**, `mobile/`) App Store `1.0.0` is Waiting for Review as of 2026-08 — do not confuse ASC docs with this consumer app.

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
- `app/(tabs)/mine.tsx` - Private drink history / 酒迹
- `app/(tabs)/about.tsx` - About / compliance
- `app/bar/[slug].tsx` - Bar detail and live tap list
- `app/bar/[slug]/beer/[drinkId].tsx` - Beer detail
- `app/drink-log/[lightId].tsx` - One drink's private venue history
- `components/taplist/` - Tap List-specific UI components
- `components/taplist/DrinkLightSection.tsx` - Drink-lighting state and action
- `components/taplist/ShareableDrinkLogImage.tsx` - Personal history share image
- `components/taplist/FirstLaunchLegalGate.tsx` - First-launch age and compliance gate
- `constants/design.ts` - Visual system
- `constants/compliance.ts` - Legal / compliance copy
- `lib/api/taplist.ts` - Supabase RPC API calls
- `lib/api/drinkLog.ts` - Authenticated drink-history RPC wrappers
- `lib/drinkLogAuth.ts` - Anonymous auth, Apple protection, and account deletion
- `lib/analytics.ts` - Consent-gated PostHog events
- `lib/formatTaplist.ts` - Display formatting helpers
- `tools/app-store-screenshots.html` - App Store screenshot composition helper

## Product Constraints

Current approved consumer surfaces include:

- Tonight bar feed
- Search
- About
- Bar detail
- Beer detail
- Public tap list
- Serving options
- Events and new-tap discovery
- Private 酒迹 history
- Anonymous identity created on first record
- Sign in with Apple protection and recovery on iOS
- Drink-history and single-drink share images
- Per-venue removal, unlight, and account deletion

Do not add:

- Map
- GPS / nearby sorting
- Ratings
- Collections
- Social feed
- Friends or followers
- Public profiles
- Public check-ins
- Badges, levels, or leaderboards
- User photos, reviews, or tasting notes
- Ordering
- Payments
- Delivery
- Reservations

Allowed private subscription exception:

- A user may privately follow a public bar and opt into iOS notifications for that bar's
  newly published public drinks.
- Never expose follower identities, follower counts, public follow activity, or a social graph.
- Following and push-device data must remain private, RLS-isolated, removable, and included in
  anonymous-to-Apple account merging and account deletion.

Do not treat 酒迹 as proof of purchase, sales data, or a public social check-in. It is a
private user-authored record that may reference the same canonical product across bars.

## Drink History / 酒迹

- The user-facing noun is `酒迹`. Actions may use natural copy such as `喝过` or `已喝过`.
- Do not reintroduce `DRINK LOG` in user-facing UI or share images.
- First record may create a Supabase anonymous session; public browsing must remain usable
  without authentication.
- A canonical product counts once, while distinct bar experiences may accumulate.
- Drinks without `product_id` use a provisional source drink identity and must remain
  reconcilable after product linking.
- Same drink at the same bar is idempotent; do not add repeat-drink counters in v1.
- Apple sign-in protects or restores the current history. Preserve the anonymous record
  during linking and merge before removing the temporary account.
- iOS may show Apple protection. Android and web must not show an unavailable Apple action.
- Personal reads and writes require an authenticated session and RLS isolation by
  `auth.uid() = user_id`.
- A delisted drink remains in history. Hide `查看并分享` unless its source bar, category,
  and drink are still public and enabled.
- The history grid remains three columns, grouped by month and ordered by recent activity.
- History summary images are fixed 3:4 and include at most the latest nine drinks.
- Do not display bar names in the main history grid. Venue history belongs on the detail.
- Missing beer images keep layout spacing where required but never render fake artwork.
- Account deletion must remove private history and revoke the Apple token when applicable.
- Personal feature failures must not break Tonight, Search, bar, or beer public screens.

### Post-MVP exception: Tonight's Beer Route

Beer Route is allowed when all of the following are true:

- Anchored to the **viewed bar** only — no device GPS, no live location permission, no nearby sorting from phone position
- No embedded map panel and no map-first UI
- Editorial three-stop ordering from No Menu database data only (straight-line distance ranking; no AMap/Baidu server routing or route caching)
- Per-leg navigation via **iOS Apple Maps deep links** only (`打开 Apple Maps`); no Android/web navigation handoff in v1
- Optional module on bar detail and beer detail; silent omit while loading or on any failure
- Global kill switch defaults off until pilot sign-off, coordinate verification, privacy/legal review, and explicit enablement
- Consumer-facing copy may call the feature `精酿地图`, but implementation must remain a bar-anchored editorial route module, not a general map feature
- Public/marketing copy may describe the ranking at a high level: eligible public bars are filtered by route participation, verified coordinates, opening/menu availability, then ordered using No Menu's own position data. Do not claim fastest, nearest, optimal, GPS-based, or provider-calculated routes

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

`last_menu_updated_at` is consumer-facing freshness metadata. It must only represent intentional public tonight tap-list changes (add/remove/swap tap, public status, servings on a drink already on tonight, publish/unpublish). Do not refresh it for catalog/product metadata edits, product-pool corrections, storefront profile edits, public price-mode toggles, POS order activity, or stock-only inventory changes.

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
- 酒迹 summary and personal drink shares use fixed `390 × 520` output.
- 酒迹 summary shares show at most nine recent drinks and must keep the footer visible.
- A personal single-drink share is only generated after the drink-state query confirms the
  user has recorded it. Do not silently fall back to the public template on query failure.
- Personal share locations should prefer Chinese district/address labels and must not expose
  unnecessary full-location data.

## Analytics and Merchant Insights

- PostHog is opt-in only. Analytics failures must remain soft and never block the app.
- Keep GeoIP, session replay, surveys, remote config, and automatic error capture disabled
  unless privacy and product requirements are explicitly revisited.
- Drink-history events may describe actions and booleans, but must not include beer names,
  search text, Apple email, full history, exact address, or other personal content.
- Existing event names are part of the reporting contract; rename them only with an explicit
  analytics migration plan.
- Do not expose PostHog user-level data to bars.
- Future POS insights must come from tenant-scoped, privacy-safe Supabase aggregates such as
  distinct users who recorded a drink at that bar. Label these as No Menu user records, not
  sales or purchases, and use a minimum-count threshold before showing exact values.

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
- First drink record creates/restores an anonymous session and updates the 酒迹 screen.
- Same product at another bar adds a venue without increasing the unique drink count.
- Apple protection, reinstall/restore, and existing-account merge preserve records.
- 酒迹 summary and personal drink share/save flows work with one through nine drinks.
- Removing one venue, unlighting a drink, and deleting the account require confirmation and
  update history consistently.
- A delisted source drink remains in history but does not expose an invalid share link.

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
Private 酒迹 features should use authenticated RPCs in `lib/api/drinkLog.ts`.

- Add matching TypeScript DTOs in `lib/types.ts`.
- Add API helpers in `lib/api/taplist.ts`.
- Keep RPC failures soft when the feature is optional and the main screen can still function.
- Deploy required Supabase migrations before shipping App Store builds that depend on them.
- For public home sections, return only public-visible, enabled tenant/category/drink data.
- Keep anonymous users on the authenticated role and rely on RLS for private row isolation.
- Do not silently create a replacement anonymous account when refreshing an existing session
  fails; that can orphan the user's history.
- Production migrations and Edge Functions live in the repository-level `supabase/`
  directory and must be deployed before a dependent App Store build.

## App Store Release Workflow

Use semantic versioning for user-visible releases.

- Do not change `app.json` version or `ios.buildNumber` unless the user explicitly requests a release, App Store submission, or specific version/build-number update.
- Patch versions, such as `1.0.3`, are for fixes and polish only.
- Minor versions, such as `1.1.0`, are for user-visible features such as `NEW ON TAP`, new share templates, or new public RPC-backed surfaces.
- Increment `ios.buildNumber` for every App Store submission.
- Before submission, confirm `app.json` version/build number, run `npm run preflight`, deploy required Supabase migrations, and smoke-test an iOS production/TestFlight build.
- For releases containing Apple account protection, confirm Anonymous Sign-Ins, Manual
  Identity Linking, the Apple Auth provider, Apple App ID capability, Edge Function secrets,
  `merge-apple-account`, and `delete-my-account` in the target Supabase project.
- Do not include unrelated seed files, scratch scripts, or generated local artifacts in a release commit unless intentionally requested.

## App Store Screenshots

Use `tools/app-store-screenshots.html` to compose App Store screenshots.

- It should support 6.9-inch portrait output by default.
- It may prefill local `file://` screenshots for the current release.
- Clicking a phone frame should still allow replacing the screenshot manually.
- Use `contain` behavior for generated share images so tall or short exported images are not cropped.
- Screenshot copy should emphasize the current release's user-visible value, not internal implementation details.
- Avoid screenshots that show debug UI, camera UI, temporary seed-only data, or misleading unavailable features.
