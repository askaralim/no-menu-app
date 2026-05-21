# AGENTS.md

## Project

This is the Expo / React Native consumer app **No Menu** (tap list; display name in `app.json`).

The product is a minimal real-time craft beer bar list for Shanghai craft beer bars.

## Commands

Run from `taplist-mobile/`:

```bash
npm install
npx tsc --noEmit
npx expo export --platform web
npm run ios
npm run web
```

Note: `npm run web` may fail on some local Node / Expo CLI combinations with port detection issues. Use `npx expo export --platform web` for build verification.

## App Structure

- `app/(tabs)/index.tsx` - Tonight home feed
- `app/(tabs)/search.tsx` - Search
- `app/(tabs)/about.tsx` - About / compliance
- `app/bar/[slug].tsx` - Bar detail and live tap list
- `app/bar/[slug]/beer/[drinkId].tsx` - Beer detail
- `components/taplist/` - Tap List-specific UI components
- `constants/design.ts` - Visual system
- `constants/compliance.ts` - Legal / compliance copy
- `lib/api/taplist.ts` - Supabase RPC API calls
- `lib/formatTaplist.ts` - Display formatting helpers

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

## Data Rules

Use real Supabase data only. Do not add placeholder bars, placeholder drinks, fake tap counts, fake beer metadata, fake tasting notes, or demo collections.

If Supabase env vars are missing, an RPC fails, or a query returns no rows, show a natural empty/error state instead of fabricated data.

## Verification

Before finishing UI/code changes, run:

```bash
npx tsc --noEmit
npx expo export --platform web
```

## Supabase

Required env vars:

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Supabase reads should go through public RPCs in `lib/api/taplist.ts`.

The Supabase client must remain safe for static export / SSR. Do not remove the no-op storage fallback for server-side rendering.
