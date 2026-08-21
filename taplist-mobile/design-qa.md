# My TAP monthly experience and sharing QA

- Source visual truth:
  - `/Users/askar/.codex/generated_images/01a010bb-e978-7bb0-b85e-f14317278775/exec-a31f24cc-a83b-48f0-9645-f8bebe19adc6.png`
  - `/Users/askar/.codex/generated_images/01a010bb-e978-7bb0-b85e-f14317278775/exec-a812e0d9-6ccb-414e-be7d-df5802e0377a.png`
  - `/Users/askar/.codex/generated_images/01a010bb-e978-7bb0-b85e-f14317278775/exec-97dc7a73-6bb9-4b65-b7ae-ea4da2575502.png`
- Implementation capture: unavailable for the authenticated states. The static web export opens the mandatory first-launch legal/age gate, which cannot be completed by browser automation.
- Intended viewport: iPhone portrait; share outputs remain fixed at `390 × 520`.

## Static comparison

- The implementation uses the existing No Menu palette, typography, spacing, icon set, real beer artwork components, and fixed share dimensions.
- The Mine page remains the personal hub. `我的 TAP` is a module below profile protection and followed bars, followed by the existing three-column history.
- The success sheet uses one primary action and one secondary sharing action, with separate copy for a new canonical beer and a new venue on an existing beer.
- Tonight and monthly share templates use deterministic data only, adapt from one through nine drinks, and reserve the footer inside the fixed canvas.

## Findings

- [P2] Authenticated post-change visual evidence is unavailable.
  - Impact: final text wrapping, modal transition timing, image loading before capture, and compact-device vertical fit still require native confirmation.
  - Required check: on an unlocked iPhone/TestFlight session, capture the populated Mine page, both success-sheet variants, Tonight share preview, and monthly TAP report.

## Verification completed

- `npm run preflight`: passed after implementation.
- `supabase db lint --local`: completed; only pre-existing warnings were reported.
- Static web export loaded without console errors but remained at the mandatory first-launch gate.

final result: blocked

---

# First-launch consent design QA

- Source: `/Users/askar/.codex/generated_images/019f79df-334d-7bd1-94a6-6ecc143593c8/exec-f40e75b7-4eea-4428-937e-4bfe38021c09.png`
- Implementation capture: `/tmp/no-menu-consent-implementation.png`
- Tested state: first launch, before consent
- Tested surface: Expo static web export at 1280 x 720; native layout uses the same React Native component and safe-area spacing

## Comparison

- Preserved the source hierarchy: brand, age/legal confirmation, policy links, optional analytics explanation, primary opt-in, secondary necessary-only path, and settings reminder.
- Preserved the dark editorial No Menu palette, warm metallic primary action, restrained olive optional badge, and low-contrast compliance copy.
- Adapted vertical spacing responsively so actions remain visible on shorter screens; the content area scrolls independently on compact devices.
- Policy links are explicit and keyboard/screen-reader discoverable.

## Interaction checks

- `仅使用必要功能` dismisses the gate and opens the app without enabling analytics.
- `同意匿名分析并继续` dismisses the gate and enables analytics.
- Both choices persist, so the gate is shown once for the v2 consent version.
- The analytics preference remains changeable from About.

## Iteration history

1. Initial capture exposed missing legal links when the local privacy-policy environment variable was absent.
2. Added the public production privacy URL as a safe fallback and rebuilt the static export.
3. Re-captured and verified both legal links and both consent paths.

final result: passed

---

# Xiaohongshu five-image collage cover tool design QA

## Evidence

- Source visual truth: `/Users/askar/.codex/generated_images/01a00f09-159d-76a0-a76c-80e5ed15191f/exec-527359c1-7c0a-463e-8731-a5e477b7720d.png` (1086 × 1448).
- Browser-rendered implementation capture: `/private/tmp/xiaohongshu-collage-cover-tool-preview.png` (512 × 683 crop of the 3:4 canvas preview).
- Side-by-side comparison: `/private/tmp/xiaohongshu-collage-cover-tool-comparison.png`.
- Browser viewport: default 1280 × 720 for interaction testing; temporary 2400 × 1700 viewport for the full comparison, reset afterward.
- Output canvas: 1080 × 1440 at device pixel ratio 2; default empty-image state.

## Full-view comparison evidence

- The implementation preserves the reference hierarchy: NO MENU and city slug, oversized editorial headline, stacked tap/bar statistics, and a dense torn-paper collage occupying the lower-right field.
- The first four image slots follow the selected composition. The requested fifth slot is added at the lower-left and overlaps the other cards without displacing the statistics.
- Empty slots use muted paper colors only to communicate position before upload; exported user images replace those surfaces with centered cover crops.

## Focused comparison evidence

- Fonts and typography: PingFang/system Chinese and SF Mono fallbacks reproduce the condensed editorial hierarchy; editable long headlines shrink to fit rather than wrap unpredictably.
- Spacing and layout rhythm: header rule, title block, statistics, and collage start positions follow the reference proportions. The fifth card intentionally occupies the previously open lower-left area.
- Colors and visual tokens: black, aged ivory, muted gold, pale blue, rust red, and warm paper tones match the selected direction.
- Image quality and asset fidelity: uploads draw at the native 1080 × 1440 export resolution with centered cover cropping; no fake beer artwork is included.
- Copy and content: city, English city, headline, tap count, and bar count are editable. No date, update time, 24-hour wording, page number, footer, or CTA is introduced.

## Primary interactions tested

- One local image upload updated the image counter from `0 / 5` to `1 / 5`; all five slots share the same upload and drag/drop handler.
- Editing the city updated the preview metric immediately.
- Clearing images restored the `0 / 5` state.
- Canvas dimensions remained 1080 × 1440 and the browser console reported no errors.
- The PNG button executes the same canvas data-URL download pattern as the existing No Menu Xiaohongshu tools. The in-app browser did not expose its synthetic anchor download as a browser download event, so the saved-file dialog itself was not asserted.

## Findings and comparison history

- No actionable P0/P1/P2 mismatch remains. The reduced texture fidelity of empty placeholders is intentional; actual uploaded artwork supplies the final label texture.
- P3: future refinement could add per-image focal-point controls if real label crops regularly need manual adjustment.

final result: passed
---

# Beer detail redesign QA

- Source visual truth: `/Users/askar/.codex/generated_images/019f79a5-e27d-71c3-a5fb-c3c8a690b174/exec-a6e05f5b-fbb7-4772-a68a-62650edf2490.png`, plus the user's follow-up removing `SERVES` and grouping options by `serving_type`.
- Implementation capture: `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/com.openai.sky.CUAService/iPhone镜像 Screenshot 2026-07-21 at 6.26.19 PM.jpeg`
- Viewport: mirrored iPhone portrait, screenshot 312 x 700; source normalized by comparing the content surface rather than device chrome.
- State: Much Beer / 此即大海, unlit, two active `draft` serving options.

## Full-view comparison evidence

- The implementation preserves the selected editorial hierarchy: artwork, venue kicker, beer name, brewery, compact facts, title-aligned light action, compact serving rows, and venue footer.
- The implementation intentionally keeps the existing share and download controls, as confirmed after the source mock was generated.
- Actual artwork proportions vary by source image; no fake artwork or replacement crop was introduced.

## Focused comparison evidence

- Title and action: the light action remains isolated at the far right without colliding with the beer name or brewery.
- Facts: brewery is no longer duplicated; the facts strip contains style, ABV, IBU when available, and country.
- Pricing: the Much Beer drink grouped `330ml ¥58` and `400ml ¥68` into one `draft` row.
- Interaction: lighting completed and exposed its success/protection states; sharing opened the native system sheet; download invoked the existing image-save flow.

## Findings and comparison history

1. [P2] The real-device capture displayed the raw `draft` enum.
   - Fix: added `draft: 杯装` to the shared serving-label localization.
   - Post-fix evidence: TypeScript and static export pass, but the already-running device bundle did not hot-reload the final localization change.

## Required fidelity surfaces

- Fonts and typography: existing Bebas Neue/PingFang system retained; hierarchy and wrapping are consistent with the selected direction.
- Spacing and layout rhythm: compact facts and pricing substantially reduce the previous card-heavy vertical rhythm.
- Colors and visual tokens: existing No Menu background, ivory, muted and amber tokens retained.
- Image quality and asset fidelity: real database artwork is preserved without placeholder artwork.
- Copy and content: duplicate brewery/style/ABV copy removed; `SERVES` removed; final `draft` localization awaits a fresh device-bundle capture.

## Remaining verification

- Reload or rebuild the device bundle, reopen Much Beer / 此即大海, and capture the row showing `杯装` before final visual sign-off.

final result: blocked

---

# DRINK LOG month accent QA

- Source visual truth: `/Users/askar/.codex/visualizations/2026/07/19/019f79a5-e27d-71c3-a5fb-c3c8a690b174/drink-log-reference-audit-2026-07-25/01-reference-mock.png`, limited to the approved month-label accent.
- Implementation screenshot: unavailable because iPhone Mirroring is locked.
- Viewport: intended mirrored iPhone portrait; implementation density normalization is pending.
- State: populated DRINK LOG grouped by month.

## Full-view comparison evidence

- The implementation preserves the existing page hierarchy and adds only a 2 pt amber left border to the month label.
- Native full-view evidence could not be captured from the locked mirror.

## Focused comparison evidence

- Static inspection confirms the accent uses the existing amber token, 2 pt width, 8 pt text inset, and existing month spacing.
- A focused rendered comparison is blocked until the mirror is unlocked.

## Required fidelity surfaces

- Fonts and typography: month typography is unchanged; only an explicit 14 pt line height was added to align the accent.
- Spacing and layout rhythm: existing grid, header, summary, and section gaps are unchanged.
- Colors and visual tokens: the accent reuses `palette.amber`.
- Image quality and asset fidelity: artwork handling is unchanged.
- Copy and content: unchanged.

## Findings

- [P2] Native post-change visual evidence is unavailable.
  - Fix: unlock iPhone Mirroring and capture the populated DRINK LOG.

## Comparison history

1. Approved delta: add a restrained amber month accent without adopting the reference dashboard.
   - Fix made: applied a 2 pt left border directly to the existing month label.
   - Post-fix evidence: blocked by locked iPhone Mirroring.

## Verification completed

- `npm run preflight`: passed.
- `git diff --check`: passed.

final result: blocked

---

# DRINK LOG release polish QA

- Source visual truth: user-provided screenshots `codex-clipboard-c97fc20b-890b-4ec7-9072-2f9e6fad2937.png`, `codex-clipboard-da57b166-8503-4107-985e-33cb753f93db.png`, `codex-clipboard-b0349786-0ce9-4159-865b-b39e14ce6472.png`, and `codex-clipboard-7ce688ad-43bf-4373-b760-dce4f4e791fb.png`, plus the approved release-polish plan.
- Implementation screenshot: unavailable; iPhone Mirroring is locked and requires the user's Mac login.
- Viewport: intended mirrored iPhone portrait; source screenshots are 946 x 2048 and 1138 x 1074 pixel captures. Density normalization is pending because the implementation could not be captured.
- State: five-record DRINK LOG, personal single-beer share, summary share, and drink-log detail.

## Full-view comparison evidence

- Source evidence confirms the summary footer is clipped, the personal share emphasizes the venue over the beer, and the detail danger action has excessive visual weight.
- The implementation was updated to reserve a compact footer inside the fixed 390 x 520 summary canvas, split public and personal single-beer templates by `litAt`, and reduce detail-page destructive actions.
- A rendered post-fix comparison could not be completed because iPhone Mirroring was locked.

## Focused comparison evidence

- Focused implementation evidence is blocked for the summary footer, personal-share header, venue-location row, and 44 pt delete target.
- Static inspection confirms the fixed canvas dimensions, six-item limit, missing-image behavior, source-route guard, accessibility roles, and 44 x 44 delete target.

## Findings

- [P2] Post-fix native visual capture is missing.
  - Location: summary share, personal beer share, and drink-log detail.
  - Evidence: source captures are available, but iPhone Mirroring currently shows its locked screen.
  - Impact: text wrapping and final vertical fit cannot be signed off from code alone.
  - Fix: unlock iPhone Mirroring, reload the current bundle, and capture the same three states.

## Required fidelity surfaces

- Fonts and typography: existing No Menu typography tokens are retained; final wrapping remains to be visually checked.
- Spacing and layout rhythm: summary content and grid were compacted; personal share now leads with the beer; final fit remains to be captured.
- Colors and visual tokens: existing palette tokens are unchanged.
- Image quality and asset fidelity: real artwork components remain in use; missing images still produce no fake artwork.
- Copy and content: personal share now uses `喝于` and `生成于`; full street address and public status are removed only from the personal template.

## Comparison history

1. [P2] Source summary footer was visibly clipped and personal-share hierarchy was reversed.
   - Fix: reduced summary header/art/grid density, reserved footer space, and introduced the `litAt`-gated personal template.
   - Post-fix evidence: blocked by locked iPhone Mirroring.

## Verification completed

- `npm run preflight`: passed.
- Static accessibility inspection: share link uses link semantics; venue deletion uses a 44 x 44 button target; unlight remains a 44 pt text button with confirmation.

final result: blocked

---

# Beer Detail and DRINK LOG visual convergence QA

- Source visual truth: user-provided screenshots `codex-clipboard-b6b7c17e-de10-4e55-9e8d-5f54d8ac2ccb.png` and `codex-clipboard-2c016f5d-7649-41be-b6dd-72f23bce9f4e.png`, plus the approved implementation plan.
- Implementation screenshot: `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/com.openai.sky.CUAService/iPhone镜像 Screenshot 2026-07-21 at 8.06.58 PM.jpeg`
- Viewport: mirrored iPhone portrait, 312 x 700 capture.
- State: DRINK LOG with three records; pre-fix bundle still active on device.

## Full-view comparison evidence

- The compact sharing control is visible and no longer consumes a full-width primary-action block.
- The first grid implementation exposed a P1 width failure: the first linked item expanded to the full row.

## Focused comparison evidence

- Grid structure was revised after capture to explicit three-item rows with equal flex columns and transparent empty cells for incomplete rows.
- Each linked card now sits inside a width-owning wrapper so Expo Router `Link asChild` cannot determine the grid track width.
- Beer facts and serving prices now use top/bottom row rules and vertical column separators in code; the device bundle was not refreshed before mirroring paused.

## Comparison history

1. [P1] DRINK LOG first item expanded to full width.
   - Fix: replaced screen-width arithmetic with explicit three-item rows and width-owning wrapper views.
   - Post-fix capture: blocked because the device remained on the previous JS bundle and iPhone Mirroring entered connection-paused state.

## Required fidelity surfaces

- Fonts and typography: existing No Menu Bebas Neue and PingFang typography retained; card copy changed to left alignment.
- Spacing and layout rhythm: compact utility row, fixed row gaps, three equal tracks, and table separators implemented.
- Colors and visual tokens: existing background, hairline, tungsten, muted and amber tokens retained.
- Image quality and asset fidelity: real cached artwork remains `cover`; missing artwork remains visually empty.
- Copy and content: no product copy or share-template content changed.

## Verification completed

- `npm run preflight`: passed.
- `git diff --check`: passed.
- Fresh-bundle iPhone capture: blocked pending manual Reload and resumed mirroring.

final result: blocked

---

# NoMenuist profile header design QA

## Reference

- Selected design: `/Users/askar/.codex/generated_images/019fcb43-4027-7083-b85e-17a73014251e/exec-aa71eadc-a04c-433b-a183-d9db2be4f314.png`
- Local implementation capture: `/tmp/no-menu-consumer-profile-header.png`
- Local edit-screen capture: `/tmp/no-menu-consumer-profile-edit.png`

## Visual comparison

- Identity hierarchy matches the selected direction: fixed gold glass avatar, one-line username, private drinking summary, and a separate edit affordance.
- The Apple protection action is grouped inside the identity section on iOS. Its protected state removes the chevron and disables interaction.
- Existing follow and recent-history sections retain their established dark editorial hierarchy instead of becoming profile-dashboard cards.
- The fixed avatar uses an original No Menu glass silhouette and does not depend on initials, uploaded media, or `avatar_url`.

## Responsive and accessibility checks

- Username is constrained to one line and truncates before the 44 x 44 pt edit target.
- Edit and Apple protection actions have explicit accessibility roles and labels.
- The edit form exposes a labelled single-line input, character count, validation feedback, and disabled submission states.
- Browser validation covered the 390 x 844 viewport. Native dynamic type, VoiceOver, and the iOS-only Apple row still require the planned TestFlight pass.

## Intentional differences

- The browser capture has no drink records or iOS-only rows, so it validates the identity and empty-history states rather than duplicating the populated native reference.
- The production avatar is visually simpler than the concept image to remain legible at 64 pt and clearly distinct from third-party beer icons.

final result: passed
