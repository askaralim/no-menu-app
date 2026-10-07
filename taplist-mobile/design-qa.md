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

# Brewery detail page QA

**Source visual truth**

- Mini-program reference: `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-21ec658f-819a-4f18-82a1-47d83b5579c7.png`
- Pre-fix web capture: `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-723b428a-c359-41cf-b3ff-0922a5d23363.png`

**Implementation evidence**

- Implementation screenshot: unavailable because local browser access was declined.
- Intended state: dark brewery detail route, Shanghai selected, live brewery results loaded.
- Reference pixels: 358 × 756.
- Pre-fix pixels: 433 × 929.
- Intended CSS viewport: mobile portrait, approximately 358 × 756 CSS px.
- Density normalization: not applicable without a post-fix capture.

## Full-view comparison evidence

Blocked. The source and pre-fix captures establish the required hierarchy, but a post-fix browser-rendered screenshot could not be captured after local browser access was declined. No visual pass is inferred from source code alone.

## Focused region comparison evidence

Blocked for the same reason. The header, sort control, card geometry, missing-artwork frame, and venue pills still need one same-viewport rendered comparison.

## Findings

- [Resolved in code, awaiting visual confirmation] The Expo route header was visible above the dark page. The brewery route now explicitly hides the stack header.
- [Resolved in code, awaiting visual confirmation] Beer results rendered as loose rows. They now use fixed-height full-width image-and-copy cards with compact venue pills.
- [Resolved in code, awaiting visual confirmation] The brewery heading depended on an oversized page treatment. It is now a compact text-only header and does not require a brewery image.
- [Resolved in code, awaiting visual confirmation] Missing beer artwork could change the row's visual balance. The artwork frame now keeps its fixed width even when no source image exists.

## Required fidelity surfaces

- Fonts and typography: uses the existing PingFang-backed tokens with a 27-point brewery title and compact card hierarchy; rendered weight and wrapping are pending.
- Spacing and layout rhythm: 24-point outer padding, 90-point cards, 8-point list gaps, and a 78-point artwork column match the reference proportions; rendered verification is pending.
- Colors and visual tokens: existing No Menu dark, gold, tungsten, and panel gradient tokens are reused.
- Image quality and asset fidelity: real beer image URLs are used; no fake brewery or beer artwork is introduced.
- Copy and content: brewery name, real selected country/city, beer style, ABV, supplier count, and real supplier names are used; unavailable English brewery metadata is omitted rather than fabricated.

## Comparison history

- Initial evidence: the pre-fix capture showed a white route header, oversized title block, and uncontained beer rows.
- Code fix: hid the stack header, replaced the page hierarchy and result rows, added a functioning sort menu, and preserved missing-image geometry.
- Post-fix visual evidence: unavailable because local browser access was declined.

## Implementation checklist

- [x] TypeScript check passes.
- [x] Expo web static export passes.
- [x] Brewery route is included in static export.
- [ ] Capture the post-fix route at a mobile portrait viewport.
- [ ] Compare the rendered header, cards, image crops, and venue pills with the mini-program reference.
- [ ] Exercise the missing-brewery-image and missing-beer-image states on a device or browser.

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

---

# Tonight TAP recap and timeline QA

**Source visual truth**

- Tonight recap: `/Users/askar/.codex/generated_images/01a09f34-c422-7cf2-b4b5-c3c775db5c82/exec-163b2fdb-4ea5-407f-94c4-b680aa13864b.png`
- TAP timeline: `/Users/askar/.codex/generated_images/01a09f34-c422-7cf2-b4b5-c3c775db5c82/exec-346a54c3-d879-4838-a8eb-1c876bb1883e.png`
- Success-sheet target: `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-e6b1de3d-6aa7-4908-bc2d-0b3e44c1a08c.png`
- Success-sheet pre-fix implementation: `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-dd5e7994-b548-4ed1-a2f4-2d2839d293b4.png`
- Current-month archive target: `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-f6f24491-a06f-477b-a167-94f858292f2a.png`
- Current-month archive pre-fix implementation: `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-c2adf281-8463-4b64-800e-4dd8d4e5585b.png`

**Implementation evidence**

- Local static export: `http://127.0.0.1:8081/tonight-recap`
- Local Mine route: `http://127.0.0.1:8081/mine`
- Browser capture: Codex in-app browser, 1280 × 720 viewport, device scale factor unavailable.
- Persisted implementation screenshot path: unavailable from the browser surface used for this run.
- State inspected: unauthenticated Mine empty state and fewer-than-two-drinks recap empty state.

**Full-view comparison evidence**

- The built routes render with the intended dark palette, typography, completion action, and safe empty states.
- The selected source visuals require authenticated history plus at least two real drinks in the current business day. That state was not available in the isolated browser session, so the timeline preview row and stacked-card recap could not be compared at matching content and viewport.
- The user-supplied pre-fix success sheet visibly lacked the target's overlapping beer artwork, archive metadata row, and compact vertical hierarchy. Those are P1 fidelity mismatches.
- The user-supplied Mine capture confirmed that the large current-month archive cover was absent: a generic list card appeared above the timeline instead of the selected editorial month card. This was a P1 fidelity mismatch.

**Focused region comparison evidence**

- Empty-state copy and completion affordance were visually inspected.
- The history-month preview row, success-sheet recap CTA, stacked cards, dot navigation, and share CTA require a real authenticated record state and remain pending a device smoke test.

**Findings**

- [Blocked] Matching data state unavailable
  Location: Mine timeline, drink-record success sheet, Tonight TAP recap.
  Evidence: the local browser has no authenticated drink-history session and the product prohibits fabricated drink data.
  Impact: the target populated state cannot be visually compared against the selected mockups without changing real user data.
  Fix: on a local iOS session with existing history, record a second drink in the current business day and inspect the success-sheet CTA, recap stack, Mine fallback entry, and a historical month preview row.

**Required fidelity surfaces**

- Fonts and typography: app tokens and existing PingFang/Bebas families are reused; populated-state wrapping remains pending device verification.
- Spacing and layout rhythm: empty states render without clipping; populated timeline and recap require device verification at the iPhone viewport.
- Colors and visual tokens: existing No Menu palette is reused; the timeline uses reduced-opacity tungsten and amber.
- Image quality and asset fidelity: real `image_url` assets are used and missing artwork is omitted; populated crops remain pending device verification.
- Copy and content: recap trigger, empty state, completion, archive status, and share copy match the approved interaction model.

**Implementation Checklist**

- [x] TypeScript check passes.
- [x] Expo web static export passes.
- [x] Empty states and routes render locally.
- [ ] Verify the populated current-month timeline on a local iOS session.
- [ ] Verify historical `展开全部` opens the selected month.
- [ ] Verify the second-drink success sheet opens Tonight TAP recap.
- [ ] Verify card switching and Tonight TAP share preview.

**Comparison history**

- Initial pass: blocked because the local browser session has no authenticated TAP history. No fake data was introduced to bypass the product data constraint.
- User device pre-fix capture: confirmed the success sheet still used the old handle-first layout and did not match the selected target.
- Code fix: removed the handle, added the real current beer artwork across the sheet edge, added `已归入 YYYY.MM · 我的 TAP`, strengthened the scrim, and recalibrated title/button spacing. The agreed `回顾今晚 N 款` action remains in place.
- Current-month code fix: replaced the populated generic `我的 TAP` row with a dynamic archive cover using the real month, drink count, venue count, and up to three real drink images. The card opens the existing report/share flow; the empty fallback, Tonight recap entry, and timeline behavior are unchanged.
- Post-fix populated capture: pending the user's authenticated device retest.

final result: blocked

---

# Product venue links and brewery discovery QA

**Source visual truth**

- Current multi-venue detail: `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-feb6d05c-96ab-4b9e-89a9-acdfb9539bbd.png`
- Venue-link direction reference: `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-f0a1221b-d4e1-4df4-9df3-2dd5f715d2a9.png`
- Search brewery mismatch capture: `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-0e6528d7-44ac-42a3-a93e-f44351b0170a.png`

**Implementation evidence**

- Implementation screenshot: unavailable because local in-app browser access remains declined.
- Source pixels: 424 × 922, 354 × 755, and 474 × 907.
- Intended viewport/state: mobile portrait, product-linked beer with two supplying bars; search discovery with brewery logos.
- CSS size and density normalization: unavailable without a post-fix browser capture.

## Full-view comparison evidence

Blocked. The user captures establish the over-detailed venue list and desired compact link treatment, but a post-fix rendered capture is unavailable. No visual pass is inferred from code or export success.

## Focused region comparison evidence

Blocked. The supplier-card name/chevron treatment and the three-column brewery-logo grid require rendered inspection.

## Findings

- [Resolved in code, awaiting visual confirmation] Supplier rows exposed source-store, status, address, and serving details. Rows now contain only the real bar name and a navigation chevron.
- [Resolved in code, awaiting visual confirmation] Brewery discovery used short image-above-copy cards that did not align with the square NEW ON TAP grid. It now reuses the same tile width, height, radius, scrim, and text hierarchy.
- [Resolved in code, data verified] Taplist called `get_public_taplist_breweries`, whose deployed definition has no `logo_url`. It now calls the deployed mini-program RPC `get_mini_breweries`, normalizing `brewery`, `product_count`, and `logo_url` into the Taplist model.
- [Resolved in code, awaiting interaction confirmation] Search used a cast dynamic-route object. Brewery links now navigate through an encoded concrete route URL.
- [Resolved in code, awaiting visual confirmation] Brewery product cards used a custom compact layout. They now reuse the bar taplist card shell, image dimensions, panel gradient, typography, status treatment, gaps, and missing-artwork behavior.

## Required fidelity surfaces

- Fonts and typography: existing No Menu title/body tokens are retained; supplier links use compact 15-point body text.
- Spacing and layout rhythm: supplier links are 52-point rows with 10-point radii; brewery discovery now uses the same square three-column geometry as NEW ON TAP; brewery product cards reuse the bar taplist capsule metrics.
- Colors and visual tokens: existing dark panel, tungsten border, text, and faint-chevron tokens are reused; missing logo surfaces are pure black.
- Image quality and asset fidelity: only real `drink_companies.logo_url` assets are displayed; no generated or placeholder logo is introduced.
- Copy and content: supplier rows show only bar names; source-store labels, status, address, serving price, and “查看” copy are removed.

## Primary interactions tested

- TypeScript route and link types compile.
- Expo Web export includes `/brewery/[name]`.
- The deployed `get_mini_breweries('Shanghai')` RPC was executed read-only; it returned nine rows, eight real logo URLs, and one null-logo row.
- Browser click-through and console inspection remain blocked by the declined local-browser permission.

## Comparison history

- Initial capture: supplier rows were visually uncontained and presented “当前门店”, addresses, statuses, and extra action copy.
- Code fix: replaced each supplier block with a single outlined name/chevron link and changed brewery navigation to a concrete encoded URL.
- User search capture: confirmed all brewery logo slots were black and the cards did not align with NEW ON TAP.
- Root-cause verification: inspected deployed RPC definitions and confirmed `get_public_taplist_breweries` has no logo while `get_mini_breweries` already supplies it.
- Data/client fix: switched Taplist discovery to the deployed mini-program RPC and removed the redundant pending public-RPC logo override.
- Card fix: replaced the brewery-detail custom card shell with the shared bar taplist capsule card styles.
- Post-fix visual evidence: pending a device or browser capture.

final result: blocked
