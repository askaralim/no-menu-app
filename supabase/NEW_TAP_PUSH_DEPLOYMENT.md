# New-tap iOS push deployment

**Status (2026-08-24):** Consumer App Store `1.3.0` (follow + new-tap push) is **Approved / live** and publicly downloadable. Production migrations for the feature are applied. This doc remains the ops checklist for monitoring, emergency disable, and recovery — not a “feature WIP” tracker.

The feature is fail-closed in two places. The Edge Function requires
`NEW_TAP_PUSH_ENABLED=true`, and the database singleton remains disabled until
`set_new_tap_push_enabled(true)` is called with the service role.

## Deploy while disabled

1. Apply `20260807180000_consumer_bar_follows_and_new_tap_push.sql`.
2. Deploy `dispatch-new-tap-notifications`.
3. Configure Edge Function secrets:

   - `EXPO_ACCESS_TOKEN`: Expo Push Service enhanced-security access token.
   - `NEW_TAP_PUSH_DISPATCH_SECRET`: a new random secret used only by the scheduler.
   - `NEW_TAP_PUSH_ENABLED=false` initially.

4. Schedule a POST every minute to the deployed function URL. Send the exact
   `NEW_TAP_PUSH_DISPATCH_SECRET` value in the `x-dispatch-secret` header.

Do not put either secret in migrations, app config, `EXPO_PUBLIC_*`, Git, or
PostHog.

## Pilot activation

1. Install a new TestFlight build containing `expo-notifications`.
2. Follow one pilot bar and confirm an enabled row exists in
   `user_push_devices` for the test user.
3. Set the Edge Function secret `NEW_TAP_PUSH_ENABLED=true`.
4. Call `set_new_tap_push_enabled(true)` with the service role. This timestamp
   becomes the no-backfill boundary.
5. Publish one real pilot drink as `new`; do not edit historical rows for the
   test.
6. Confirm one event, one batch after ten minutes, one delivery ticket, and an
   Expo receipt. Confirm the notification opens the public beer or bar route.

To stop new events and dispatch immediately, set `NEW_TAP_PUSH_ENABLED=false`
and call `set_new_tap_push_enabled(false)` with the service role. Existing app
browsing and bar follows continue to work.

## Receipt operations

The scheduler invocation also checks ticketed deliveries older than 15 minutes.
`DeviceNotRegistered` disables the matching device. Temporary send failures use
bounded exponential retry; permanent receipt errors remain recorded without an
unbounded retry loop.
