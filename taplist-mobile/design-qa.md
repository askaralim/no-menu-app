# Nearby home design QA

- Source visual truth: `/Users/askar/.codex/generated_images/01a05263-4884-7f60-9701-d7e213619bdd/exec-3c2af2ac-13cd-4b6a-a577-ef69cb1defe4.png`
- Implementation screenshot: unavailable
- Intended viewport/state: iOS portrait, Shanghai selected, `附近` active, foreground location granted
- Source dimensions: 853 × 1844 px
- Implementation dimensions / CSS size / density normalization: unavailable

## Full-view comparison evidence

Blocked. The current machine has no usable Xcode `simctl`, and the nearby control requires both an iOS runtime and the new coordinate-bearing public RPC. The database migration has intentionally not been deployed, so a truthful rendered nearby state cannot be captured from real data yet.

## Focused region comparison evidence

Blocked for the same reason. No visual conclusion was inferred from code alone.

## Findings

- No code-derived visual findings are being presented as screenshot evidence.
- Fonts and typography, spacing and layout rhythm, colors and tokens, image crop/quality, and final copy still require a same-state iOS screenshot comparison.

## Comparison history

- No valid visual comparison iteration was possible in this environment.

## Implementation checklist

1. Deploy `20260831091851_public_taplist_bar_coordinates.sql` to a non-production test project first.
2. Install an iOS development/TestFlight build on a simulator or device and set a known test location.
3. Capture the Tonight screen with Shanghai selected and `附近` active.
4. Compare that capture with the source at a normalized portrait size, including a focused crop of the sort controls and first bar-card footer.
5. Verify permission explanation, denied/settings, city mismatch, coordinate-missing, and latest-mode states.

final result: blocked

---

# Activity and recent-tap typography QA

- Source visual truth: `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-5965043e-5643-48ef-9177-1090567e368b.png`, `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-83b13d6a-42dd-4389-a544-e4dd3aee31a9.png`, and competitor card reference `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-caf506f8-e1b7-4b06-9721-e7c91af91510.png`
- Implementation screenshots: `/Users/askar/.codex/visualizations/2026/08/31/01a057ac-0a80-73b2-b521-90953f2890e2/activity-home-implementation.png` and `/Users/askar/.codex/visualizations/2026/08/31/01a057ac-0a80-73b2-b521-90953f2890e2/activity-list-implementation.png`
- Combined comparison evidence: `/Users/askar/.codex/visualizations/2026/08/31/01a057ac-0a80-73b2-b521-90953f2890e2/activity-home-comparison.png` and `/Users/askar/.codex/visualizations/2026/08/31/01a057ac-0a80-73b2-b521-90953f2890e2/activity-list-comparison.png`
- Viewport: 393 × 852 CSS px, device scale factor 1
- Source dimensions: 1170 × 2532 px, normalized to 393 × 852 for comparison
- Implementation dimensions: 393 × 852 px
- State: Shanghai home with one ongoing event; activity list with one ongoing event

## Full-view comparison evidence

- Home: the activity banner keeps the requested dominant event name, compact status badge, and icon-led venue line without copying unrelated competitor metadata. `最近上新` now uses the app's PingFang-backed Chinese title style at 22/30 rather than the Latin display face.
- Activity list: the group heading is reduced from 32/38 to 22/30 and uses the same PingFang-backed Chinese title style. The hierarchy remains clear without overpowering the event card.

## Focused region comparison evidence

Focused inspection was performed on the activity banner, `最近上新` heading, and activity-list group heading in the combined images. The icon, label spacing, Chinese glyph weight, title wrapping, and state contrast are legible at the mobile viewport.

## Findings

- Fonts and typography: passed; Chinese headings use the existing Chinese system font token with controlled weight, size, line height, and zero display-style tracking.
- Spacing and layout rhythm: passed; banner status, title, and venue remain separated and do not collide with the carousel counter.
- Colors and visual tokens: passed; existing amber, text, muted, border, and scrim tokens are preserved.
- Image quality and asset fidelity: passed; real event imagery behavior is unchanged and the existing FontAwesome location icon is used.
- Copy and content: passed; states are `进行中` and `即将开始`, and the banner exposes only state, event name, and venue name.
- Console: no new application errors. One pre-existing Supabase warning about multiple GoTrue clients appeared in the static web preview.

## Comparison history

- Initial code used the Latin display face and oversized 32/38 Chinese activity-list heading; the home banner omitted state and location icon.
- Updated both Chinese headings to the PingFang-backed title token at 22/30, restored a compact localized state badge, and added the existing map-marker icon to the venue row.
- Post-fix browser screenshots show no remaining P0/P1/P2 visual issues for the requested surfaces.

## Primary interactions tested

- Opened the home screen after the first-launch legal choice.
- Opened the activity list through `更多 ›`.
- Confirmed the activity card remained navigable and both screens rendered without layout overflow.

final result: passed

---

# City picker hierarchy QA

- Source visual truth: `/Users/askar/.codex/generated_images/01a0a3cd-8872-73a2-8b24-96d2d81e4426/exec-c8a35d4b-d982-4de8-8b5a-28ae441241ed.png`
- Implementation screenshot: unavailable
- Intended viewport/state: iOS portrait, city picker open, Shanghai selected
- Source dimensions: 853 × 1844 px
- Implementation dimensions / CSS size / density normalization: unavailable

## Full-view comparison evidence

Blocked. The exported web app builds successfully, but the configured Supabase endpoint is not reachable from the local browser preview. The city catalog therefore falls back to Shanghai only, which intentionally disables the city-picker trigger; a truthful rendered picker screenshot cannot be captured from the real catalog in this environment.

## Focused region comparison evidence

Blocked for the same reason. No visual conclusion was inferred from code alone.

## Findings

- The source establishes the requested hierarchy: municipalities and province headings share the top level; province cities are slightly indented; no alphabet index is displayed.
- The implementation uses a fixed 560-point panel with a 72% small-screen cap, a non-scrolling header, and an independently scrolling list body.
- Counts share the city row and align to the right; selection is represented with the existing amber text/check treatment.
- Pinyin collation was checked separately for the current catalog order, but fonts, exact spacing, divider contrast, and scroll feel still require a same-state iOS screenshot comparison.

## Comparison history

- The prior city-only list was replaced with province grouping and municipality top-level rows.
- The first implementation used a viewport-relative panel height; it was tightened to a fixed 560-point height with a small-screen cap after code review.
- No valid rendered comparison iteration was possible because the real city catalog could not load locally.

## Implementation checklist

1. Open a production-data iOS development or TestFlight build.
2. Confirm the visible order is 北京 → 吉林/长春 → 辽宁/沈阳 → 山东/滨州/青岛 → 上海 → 天津 for the current catalog.
3. Confirm the title and close action stay fixed while only the list body scrolls.
4. Confirm Shanghai remains selected by default for a fresh install, and an existing persisted city remains respected.
5. Capture the modal and compare it with the source at a normalized portrait size.

final result: blocked
