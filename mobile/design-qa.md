# POS full taplist image — design QA

**Source visual truth**

- `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-70d6211f-a2ca-4bed-a128-5bb13e9e8a7f.png`
- `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-6ea9fe9d-9e8f-4a57-92a8-7d75a7c838f8.png`
- `/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-a99052f5-adfd-49f5-810a-cf2c0bc34279.png`
- Mini-program layout constants and rendering behavior supplied in the task.

**Implementation evidence**

- Implementation screenshot: unavailable; the user opted to perform the native visual test.
- Intended viewport: POS native modal at the device viewport.
- Export density: single-column `840px`; double-column `1240px`; preview normalized to `390` logical pixels wide.
- State: black theme, double-column, unpaginated long image, with public menu data.

**Full-view comparison evidence**

- Blocked pending the user's native capture. The web production bundle completed successfully, but no browser-rendered screenshot was captured.

**Focused region comparison evidence**

- Blocked for the same reason. The required focus regions are the option panel, header/count line, multi-serving rows, single-column text hierarchy, and footer QR area.

**Findings**

- No visual finding can be closed without a rendered native screenshot.
- Code-level alignment completed for the specified dimensions, typography hierarchy, left-column-first ordering, adaptive row heights, balanced pagination, image cells, and per-serving rows.

**Comparison history**

- Initial implementation review found fixed-height pages, incorrect 8/16 page capacities, horizontal wrap ordering, missing artwork, combined metadata, and combined serving prices.
- Those issues were corrected in code. Post-fix visual evidence remains pending native testing.
- Native feedback found that a multi-serving beer only expanded its own column, causing paired rows and dividers to drift. Double-column paired rows now share the larger required height; post-fix visual evidence remains pending native testing.
- The POS now also exposes the mini-program landscape mode: fixed `1600 × 1200`, four-column row-major reading order, density tiers for 1–5 rows, and balanced automatic pagination that adds pages when serving rows exceed the 922px content area. Native landscape visual evidence remains pending.
- Native landscape feedback found uneven row heights when only one drink had multiple servings and unused space below a 12-drink page. Landscape rows now share the largest serving expansion across all four cells, and their common base height expands to fill the fixed 922px content area.

**Implementation checklist**

- Capture black/double/long and compare to the two-column reference.
- Capture black/single/long and verify name, style, brewery, ABV, and every serving are separate rows.
- Verify 13-item and 25-item paginated menus split `7+6` and `9+8+8` in double-column mode.
- Verify light theme and QR fallback.
- Verify landscape pages at 4, 12, 20, 21, and 25 drinks, including a page with several multi-serving drinks.

**Follow-up polish**

- Adjust only typography or spacing values identified by the native screenshots; retain the current layout and pagination rules.

final result: blocked
