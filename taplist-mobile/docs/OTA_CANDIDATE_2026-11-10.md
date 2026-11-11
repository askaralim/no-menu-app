# Taplist iOS OTA publication and acceptance — 2026-11-10

Status: **published to production / iOS; user acceptance confirmed**. 用户已确认 OTA 后使用正常；这不等于下方每项分析对账均已重新执行。 This channel reaches compatible production installations, not just the operator's phone. The original preparation record below is retained; the latest publication is recorded here.

## Latest publication — 2026-11-11 (user-provided EAS output)

- Production branch, iOS update group: `756d0c78-7371-4829-87af-e1ef29e3fba5`.
- iOS update ID: `01a1ca8e-5a84-749f-a141-b8c42c475764`.
- Runtime: `ee7f9707efde823e12a9ee09ecebacef7af96f79`, matches the documented production baseline.
- Message: 优化事件上传与队列重试，统一TAP交互和酒款信息展示.
- EAS reported commit: `48b7da4677150ad29bfea0176946c436e673aece*`; the asterisk indicates a dirty working tree, so the commit alone is not a complete release snapshot.
- Publication is confirmed by the user's CLI output, not an independent dashboard query. Device receipt, post-update ECS upload timing, and production brewery migration status remain unverified in this record.
- This publication supersedes the “local / not published” status of the Taplist increments recorded below, including the analytics upload changes. Those sections describe preparation history, not the current release status.
- Previous documented production group / rollback candidate: `47314e59-5d47-4d4b-9990-f3f8814ffac5`.
- Historical identity503 remains undiagnosed; publishing the client queue improvements does not establish that the server error is fixed.
- Dashboard: https://expo.dev/accounts/askar.alim/projects/no-menu-app/updates/756d0c78-7371-4829-87af-e1ef29e3fba5

## UI polish publication — 2026-11-10

- User authorized five small UI changes and direct OTA publication on the existing production channel.
- Previous production group, verified before publication: `834647cb-f11c-4245-8cd6-80bdc4281f3a` (the initial Feed release, now the immediate rollback target).
- Published group: `47314e59-5d47-4d4b-9990-f3f8814ffac5`.
- iOS update: `01a1c248-4cd9-7c1f-b52d-8532682797ab`.
- Runtime unchanged: `ee7f9707efde823e12a9ee09ecebacef7af96f79`; version/build remain 1.3.2 / 48.
- Home: city-to-content gap reduced by 8pt; bar name 26/31 → 30/36; top safe-area padding moved outside the ScrollView, with automatic content inset adjustment disabled to avoid double spacing.
- Latest: date header 44 → 40pt; venue vertical padding 10 → 6pt with minimum 44pt touch height preserved; beer-row bottom gap 8 → 4pt. For You row spacing unchanged.
- English Reason V2 display templates shortened using the same validated evidence. Chinese server text, unknown-reason fallback, ranking and analytics unchanged.
- Checks passed: `npm run preflight`, 7 style/campaign tests, production fingerprint comparison, and production iOS export/publication (1,817 modules).
- Subsequent user confirmation: OTA received and normal use accepted. No new agent-run native-device or analytics verification is claimed.
- Working tree remains uncommitted/unpushed; EAS published the working tree.
- Dashboard: https://expo.dev/accounts/askar.alim/projects/no-menu-app/updates/47314e59-5d47-4d4b-9990-f3f8814ffac5

## Joint campaign acceptance — 2026-11-10

联名活动补充验收（2026-11-10，用户确认）：6×6 首页入口、点击后的活动内容及全部图片已随生产 OTA 展示并完成验证。Taplist 本轮只承担活动信息展示；不把小程序的线上护照、打卡、海报生成或 ECS 活动事件验收算作 Taplist 已实现功能。正式活动小程序码已配置；2026-11-11用户确认微信小程序1.5.0审核通过并正式发布，正式码扫码仍需单独验收。本次文档更新没有执行新的 OTA，也不改变下方其他本地增量的发布状态。

## Post-OTA local changes — not published

- Beer detail actions now distinguish `记一杯 / Tap it`, `已记录 / Tapped`, and `记录此店 / Tap here`; history uses `TAP 记录 / TAP history`. For You cold-start instructions use the same action label.
- The compact inline icon/text control uses a 30pt visual height with additional touch padding; the supply-status label remains visually separate.
- Brewery identity is separated from display text: new clients prefer `brewery_ref.id` for navigation and retain legacy-name routes as fallback. Venue-scoped `display_name/display_name_en` may contain `旗标 + 空格 + 酒厂` when the tenant switch is enabled; old RPCs and legacy brewery fields remain unchanged.
- Bar-detail beer rows now match the mini-program compact-origin rule: display `origin_city` first and fall back to `country`, ordered as `产地 · 酒厂 · 风格`. The bar beer-detail title is reduced from `40/47` to `36/43`.
- Repository migrations add the default-off tenant flag, additive V2 RPCs and a deterministic country-code backfill. Based on the 2026-11-11 production read-only snapshot, the backfill covers 133 companies and leaves only the unverified active company “巴伐利亚武僧” unresolved. These migrations are prepared, not recorded here as deployed.
- Verification: Taplist `npm run preflight` passed after the origin/brewery changes; the subsequent title-size adjustment passed `npm run typecheck` and `git diff --check`. Mini-program preflight remains 297/297 from the brewery-ID compatibility work. SQL migrations and regression tests passed in isolated PostgreSQL fixtures.
- No subsequent OTA, production migration, or native-device acceptance is recorded for this increment. The accepted production group above remains the publication baseline.
- Mini-program 1.5.0 was confirmed approved and published by the user on 2026-11-11. This does not publish the separate Taplist increment or mark individual mini-program checks complete.

## Candidate and compatibility

- Project: `470f9d09-531f-4478-a32c-6a2217b79a87`, bundle `com.nomenuapp.taplist`.
- App Store baseline: `1.3.2`, build `48`; version/build unchanged.
- Local branch: `main`; existing working tree changes remain uncommitted and unpushed.
- EAS production channel currently points to production branch.
- Previous iOS update group: `8e9f8fae-9cc7-4589-931e-626ebc94a44d`.
- Verified production fingerprint: `ee7f9707efde823e12a9ee09ecebacef7af96f79`, identical to the previous iOS update and documented build 48 baseline.
- Initial fingerprint differed only in `packageJson:scripts`: the newly added `test:style-localization` alias. Removed that alias, retained its test file, and regenerated the matching fingerprint. No runtime override or native dependency change.

## Actual release scope

- Personalized/Latest Feed, history-aware fallback, list caching, date/venue grouping and sticky headers.
- Server English style fields and E1 Reason V2 display.
- First-party ECS events/identity integration alongside the retained, consent-gated PostHog integration.
- Home header, activity and beer rails, compact typography/spacing. Bar artwork remains 4:3 and its gold rule is restored.
- **The current working tree also contains joint campaign list/banner/detail integration.** Earlier Consumer Intelligence port documentation excluded campaigns; this candidate includes the subsequent campaign work visible on the current homepage. This is not a Feed-only bundle.

## Executed checks

- `npm run preflight`: TypeScript and Web static export passed.
- `node --test tools/style-localization.test.cjs tools/campaign-display.test.cjs`: 7 passed.
- Production-environment iOS export passed: 1,817 modules, Hermes bundle `entry-83483865bdb518081576aaa2184d40c2.hbc`.
- Export directory: `/tmp/nomenu-taplist-ota-ios-20261110` (local preparation artifact, not an OTA publication).
- EAS fingerprint generated with production environment and matched the deployed baseline.
- Production environment presence check passed: Supabase and PostHog configured, PostHog debug false, Intelligence enabled. Existing hosted Supabase configuration remains unchanged for fingerprint compatibility; the existing runtime mapper routes requests through ECS.
- ECS read-only check at `2026-11-09T21:15:51Z`: API ready, API/worker timer active, catalog age 52s, consumer age 50s, no pending refresh requests.
- The first ops-check invocation using the worker role returned unavailable; the API-role invocation used by the health service succeeded. No server configuration was changed.

The user subsequently accepted actual OTA use. Detailed iOS analytics reconciliation is not established by that confirmation; Web receipt is not proof of iOS event receipt.

## Publish and recovery

The command below is the prepared command for the current combined local increment. It has **not** been executed. Deploy the brewery migrations first, rerun preflight if source changes, then publish from `taplist-mobile`:

```sh
eas update --channel production --environment production --platform ios --message "酒厂旗标与ID跳转、酒单产地展示、TAP与页面体验优化" --non-interactive
```

Record the resulting update group/runtime and confirm `Builds: 1` before declaring publication complete. For recovery, republish the previous verified iOS group above to production using EAS; do not change channel mapping or runtime to force compatibility.

## Device acceptance and ECS inspection

1. Restart the installed app with network access, allow the OTA download, then restart again. Confirm the new home/Feed UI before beginning.
2. Check 我的 → 关于 → 使用情况分析 is enabled for this voluntary test. Feed works without consent, but analytics intentionally do not upload then.
3. Note the test start time and account locally. Open several venues and venue-specific beers, search and open a result, change city, and open an ordinary single-venue activity. Test Apple Maps separately.
4. Browse both Feed modes, leave selected cards visible for more than one second, scroll, and open a card. Capture the fact that returning from details preserves the list.
5. Add one genuine new venue TAP experience, not an already-recorded beer/venue pair. Keep the app foregrounded briefly for event flushing, then allow the background projection worker to sync.
6. Inspect ECS aggregates for `application=taplist`, `platform=ios`: event counts, accepted fields, resolved identity, immutable Feed enrichment, and TAP `created_at` linkage. Check unresolved/rejected behavior separately; do not treat absence from accepted events as proof nothing was rejected.
7. Compare navigation/impressions as auxiliary signals and venue/beer opens as primary evidence. Test actions validate the pipeline, not causal or verified physical visits.

Known audit limits: non-retryable client rejections lack retained reason diagnostics; city directory initialization can leave city absent; source matching expires after 30 seconds. Raw event queue is bounded to 200 events/7 days. These limits are not resolved by passing the export.


## 2026-11-11 analytics upload increment — local, next OTA

Taplist first-party outbox now schedules a 3s batch deadline, flushes at 20 events, resumes on cold start/foreground, attempts background delivery, and drains up to 10 sequential batches per pass. Identity calls have independent locking/backoff so they cannot hold raw-event uploads. Consent, event IDs, retry/retention and account isolation remain intact; PostHog and mini-program unchanged. See [implementation and checks](CONSUMER_INTELLIGENCE_PORT_2026-11-10.md#2026-11-11-上传触发与队列消化本地下一次-ota).

8 targeted tests passed; typecheck/Web export passed. No native dependencies or Taplist package scripts changed. This increment has **not been OTA-published**; verify the production fingerprint and combined candidate before the next OTA. ECS safe identity-error logging was independently deployed; historical identity503 remains undiagnosed pending fresh failure evidence, not fixed by this client increment.

## 2026-11-11 post-OTA receipt check (20:38 Shanghai)

User reported completing device operations. A read-only ECS check found one iOS Taplist installation/session with 27 events occurring 20:30:58–20:31:50, received 20:31:02–20:31:54. Mean delay 2.36s, median 2.69s, p95 3.47s, maximum 3.88s; all 27 resolved. Counts: bar_opened 2, beer_opened 3, feed_shown 3, feed_item_impression 18, feed_item_opened 1. Required venue/beer/source/city fields in those opens and server-enriched Feed ranking/item context were present. No newly created venue TAP experience appeared in the recent 15-minute projection window. This is receipt validation, not proof of zero client-side loss or an OTA ID attestation from telemetry.

The broader service log window also contained two identity503s (20:24:04 and 20:31:56), both at identity_body, before validation/database writes, with no SQLSTATE. This narrows the failure to request-body processing; exact stream error/abort cause is still not recorded. Do not label PERSISTENCE_UNAVAILABLE as demonstrated database failure. Two Feed503s at20:27:55 were authorize/AUTH_UNAVAILABLE/transport at ~8s, consistent with the upstream auth timeout boundary; exact transport cause remains unverified. Logs are shared-service observations, not client-attributed requests. Event batch requests in the final rolling15-minute log sample:116×202, average37.22ms. Projection ages12s(catalog)/10s(consumer).

Evidence: repository outputs/ota-upload-acceptance-20261111/{data,recent,logs}.json. No production writes or code changes in this verification. Client upload timing improved in this small sample; server503 remains open.
