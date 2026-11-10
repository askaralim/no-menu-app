# Taplist iOS OTA publication and acceptance — 2026-11-10

Status: **published to production / iOS; user acceptance confirmed**. 用户已确认 OTA 后使用正常；这不等于下方每项分析对账均已重新执行。 This channel reaches compatible production installations, not just the operator's phone. The original preparation record below is retained; the latest publication is recorded here.

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

联名活动补充验收（2026-11-10，用户确认）：6×6 首页入口、点击后的活动内容及全部图片已随生产 OTA 展示并完成验证。Taplist 本轮只承担活动信息展示；不把小程序的线上护照、打卡、海报生成或 ECS 活动事件验收算作 Taplist 已实现功能。正式活动小程序码已配置，微信小程序 1.5.0 准备提审、尚未确认提交或发布；其扫码验收需在正式发布后单独完成。本次文档更新没有执行新的 OTA，也不改变下方其他本地增量的发布状态。

## Post-OTA local changes — not published

- Beer detail actions now distinguish `记一杯 / Tap it`, `已记录 / Tapped`, and `记录此店 / Tap here`; history uses `TAP 记录 / TAP history`. For You cold-start instructions use the same action label.
- The compact inline icon/text control uses a 30pt visual height with additional touch padding; the supply-status label remains visually separate.
- `npm run typecheck` passed for this change. No subsequent OTA or native-device acceptance is recorded for this increment. The accepted production group above remains the publication baseline.
- Mini-program 1.5.0 contains the corresponding local changes and is preparing submission; Taplist acceptance does not replace its final package checks.

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

Historical publication command (already executed; do not repeat merely to update this record): publish from `taplist-mobile` using the production environment and iOS platform. Recheck the candidate if source changes after preparation:

```sh
eas update --channel production --environment production --platform ios --message "上新 Feed、英文风格与第一方行为采集，优化首页和活动展示" --non-interactive
```

Record the resulting update group/runtime before declaring publication complete. For recovery, republish the previous verified iOS group above to production using EAS; do not change channel mapping or runtime to force compatibility.

## Device acceptance and ECS inspection

1. Restart the installed app with network access, allow the OTA download, then restart again. Confirm the new home/Feed UI before beginning.
2. Check 我的 → 关于 → 使用情况分析 is enabled for this voluntary test. Feed works without consent, but analytics intentionally do not upload then.
3. Note the test start time and account locally. Open several venues and venue-specific beers, search and open a result, change city, and open an ordinary single-venue activity. Test Apple Maps separately.
4. Browse both Feed modes, leave selected cards visible for more than one second, scroll, and open a card. Capture the fact that returning from details preserves the list.
5. Add one genuine new venue TAP experience, not an already-recorded beer/venue pair. Keep the app foregrounded briefly for event flushing, then allow the background projection worker to sync.
6. Inspect ECS aggregates for `application=taplist`, `platform=ios`: event counts, accepted fields, resolved identity, immutable Feed enrichment, and TAP `created_at` linkage. Check unresolved/rejected behavior separately; do not treat absence from accepted events as proof nothing was rejected.
7. Compare navigation/impressions as auxiliary signals and venue/beer opens as primary evidence. Test actions validate the pipeline, not causal or verified physical visits.

Known audit limits: non-retryable client rejections lack retained reason diagnostics; city directory initialization can leave city absent; source matching expires after 30 seconds. Raw event queue is bounded to 200 events/7 days. These limits are not resolved by passing the export.
