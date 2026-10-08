# No Menu consumer analytics baseline

Baseline date: 2026-10-08 (Asia/Shanghai)

This document records the P0 measurement baseline before cross-client analytics work. It is not a
live dashboard. PostHog counts cover only devices that enabled optional analytics; Supabase counts
are the business source of truth for retained private records.

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

## P0 gaps and decisions

- Taplist previously defined `identifyUser()` but did not call it. Anonymous PostHog IDs therefore
  could not be linked to Supabase anonymous or Apple-protected accounts.
- The mini-program has business usage but no No Menu product analytics. Its first implementation
  should reuse the Taplist event names rather than introduce synonyms.
- The first QR event should mean that a valid QR entry was opened. Do not infer a store visit.
- Do not upload analytics opt-out choices merely to calculate an opt-in rate.
- PostHog remains analysis infrastructure; Supabase remains the business source of truth.

## P1-A acceptance criteria

- An existing Supabase session is identified after consented analytics initializes.
- New anonymous sessions and Apple identity updates synchronize without delaying auth or RPCs.
- Signing out resets the PostHog identity.
- Enabling analytics later from About synchronizes the current session.
- Analytics, auth, and identity failures remain soft and do not affect public browsing or private
  product features.
- The implementation changes JavaScript/TypeScript only and remains compatible with EAS Update.

## P1-B acceptance criteria

- The WeChat mini-program persists a random visitor ID and rotates a session after 30 minutes of
  inactivity without requiring WeChat login.
- It reuses the Taplist event names for app open, screens, bars, beers, events, search, and TAPs.
- `qr_entry_opened` is emitted only after a permanent venue QR resolves successfully and never
  implies a store visit.
- Search text, precise location, addresses, contact details, WeChat codes, and Supabase tokens are
  excluded from analytics events.
- A WeChat consumer session identifies with the existing Supabase user ID; sign-out resets the
  analytics identity without affecting authentication or business RPCs.
- Analytics transport failures stay soft. The mini-program requires a reviewed experience build
  and a normal WeChat release; it cannot use OTA delivery.
