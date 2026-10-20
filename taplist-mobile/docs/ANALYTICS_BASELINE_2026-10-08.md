# No Menu consumer analytics baseline

Baseline date: 2026-10-08 (Asia/Shanghai)

This document records the P0 measurement baseline before cross-client analytics work. It is not a
live dashboard. P1-A and P1-B implementation status was updated on 2026-10-09; the current
cross-client contract is [`CONSUMER_ANALYTICS.md`](CONSUMER_ANALYTICS.md).
PostHog counts cover only devices that enabled optional analytics; Supabase counts are the business
source of truth for retained private records.

## Measurement boundaries

- App Store Connect measures App Store acquisition and platform-provided usage aggregates.
- WeChat's dashboard measures platform-level mini-program traffic.
- PostHog measures consented product behavior. Call these users **observable users**, not all users.
- Supabase measures retained business facts such as TAP records, venue records, follows, and users.
- No Menu does not currently measure store visits. QR and navigation actions are intent or entry
  signals, not proof of arrival.
- The optional analytics choice is stored on-device under `@taplist/analytics_enabled_v1`. It is not
  stored in Supabase, so enabled and disabled populations cannot be counted exactly.

## 30-day baseline

PostHog `Last 30 days`, unique users, captured on 2026-10-08:

| Event | Observable users | Share of 196 app openers |
| --- | ---: | ---: |
| Application Opened | 196 | 100% |
| `screen_viewed` | 197 | Not a funnel step |
| `bar_opened` | 169 | 86% |
| `beer_opened` | 122 | 62% |
| `search_completed` | 67 | 34% |
| `drink_log_opened` | 88 | 45% |
| `drink_light_succeeded` | 25 | 13% |

PostHog recorded 204 total `drink_light_succeeded` events in the same UI window. A success event
means the RPC returned successfully; inspect `created_drink` and `created_venue` before treating it
as a newly created business record.

Production Supabase, queried at 2026-10-08 19:01 China Standard Time for the preceding 30 days:

| Current identity class | Retained new TAP records | Users |
| --- | ---: | ---: |
| Taplist anonymous account | 107 | 18 |
| Apple-protected account | 112 | 5 |
| WeChat mini-program account | 75 | 12 |
| Total | 294 | 35 |

The 204 PostHog successes and 219 retained non-WeChat TAP records are directionally close. They are
not expected to reconcile exactly because users can remove records or accounts, event and database
windows differ slightly, analytics is optional, and a successful RPC is not always a new canonical
drink record.

## Existing Taplist event contract

Do not rename existing events without an explicit migration plan. Core behavioral events are:

- `screen_viewed`
- `bar_opened`
- `beer_opened`
- `event_opened`
- `search_completed`
- `apple_maps_opened`
- `drink_log_opened`
- `drink_light_started`, `drink_light_succeeded`, `drink_light_failed`
- `drink_venue_added`, `drink_unlit`
- image/share generation and Apple account-protection events defined in `lib/analytics.ts`

Every Taplist event includes `analytics_schema_version`, `consent_version`, `surface`, `platform`,
`app_version`, `build_number`, `city`, and `is_internal` when available. Events must not contain
search text, Apple contact data, precise location, exact addresses, or private TAP history.

## P0 decisions

- Before P1-A, Taplist defined `identifyUser()` but did not call it. The production OTA now
  synchronizes consented analytics with Supabase anonymous and Apple-protected user IDs.
- Before P1-B, the mini-program had business usage but no No Menu product analytics. Version
  `1.2.2` now reuses the Taplist event names and is awaiting WeChat review/release after experience
  build verification.
- The first QR event should mean that a valid QR entry was opened. Do not infer a store visit.
- Do not upload analytics opt-out choices merely to calculate an opt-in rate.
- PostHog remains analysis infrastructure; Supabase remains the business source of truth.

## P1-A completion — Taplist iOS

- **Status:** completed, published to the production EAS channel on 2026-10-08 and verified on a
  production-compatible iOS build.
- Existing sessions, new anonymous sessions and Apple identity updates synchronize after consent.
- Signing out resets the PostHog identity; enabling analytics later synchronizes the current session.
- Analytics and identity failures remain soft and do not affect public browsing, auth or private RPCs.
- The change is JavaScript/TypeScript-only and was delivered by EAS Update. Runtime:
  `ee7f9707efde823e12a9ee09ecebacef7af96f79`; update group:
  `d75f688a-bb90-422a-a6ba-0455a0e1c24c`.

## P1-B completion — WeChat mini-program

- **Status:** code complete and experience build verified on 2026-10-09; not production-live until
  `1.2.2` passes WeChat review and is manually published.
- A random visitor ID persists locally and a session rotates after 30 minutes of inactivity.
- The app reuses Taplist event names for app open, screens, bars, beers, events, search and TAPs.
- A trial venue code for `FR73UGDP` successfully produced
  `Application Opened → qr_entry_opened → bar_opened(source=qr)` with one distinct ID/session and
  opened `zj-jx-didi`.
- `qr_entry_opened` is emitted only after a permanent venue QR resolves successfully and never
  implies a store visit.
- Search text, precise location, addresses, contact details, WeChat codes and Supabase tokens are
  excluded. Anonymous events do not process Person profiles.
- A WeChat consumer session identifies with the existing Supabase user ID; sign-out resets the
  analytics identity without affecting authentication or business RPCs.
- Transport failures stay soft. The mini-program cannot use OTA delivery.

## Known remaining gaps

- iOS notification routing works, but there is no `push_opened` event and `fromPush=1` is not yet
  included in analytics properties.
- iOS records `apple_maps_opened`; the mini-program `wx.openLocation` path is not instrumented, so
  navigation is not a complete cross-client event.
- `screen_viewed` is a page impression only. Bar-card and beer-card impressions are not collected.
- TAP actions are instrumented on both clients, but Supabase remains the business source of truth.
