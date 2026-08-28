# No Menu Tonight — App Store Listed v1

> `1.0.0` baseline ASC / listed-v1 doc for Tonight. **Current live release is `1.1.0`** — see [`APP_STORE_CONNECT_1.1.0.md`](./APP_STORE_CONNECT_1.1.0.md). Connect fill-in checklist: [`../APP_STORE_CONNECT_SUBMISSION.md`](../APP_STORE_CONNECT_SUBMISSION.md). Index: [`../../docs/INDEX.md`](../../docs/INDEX.md).

## Status (2026-08-21)

**Approved / live, superseded by `1.1.0`.** Historical `1.0.0` (build ≥16) metadata retained below.  
Cover-null preserve: `20260807170000_storefront_preserve_null_cover.sql` (applied).

## Release candidate decision (2026-08-06)

- Submit version: `1.0.0`.
- Do **not** submit TestFlight build `14`: it contains the POS regression findings from the 2026-08-05 test.
- Do **not** submit existing EAS build `15`: it was built before the current business-day close/restore and cross-tab refresh fixes.
- Final candidate: build `16` or later, produced from the current verified source after production migration `20260807160000_business_day_close_restore_hardening.sql` is applied.
  - Do not confuse with `20260807150000_add_we_cheers_qr.sql` (venue QR data only).
- Reviewer tenant must have `ordering_enabled = false`; pilot tenants may remain enabled.
- Before selecting the build in App Store Connect, confirm the Account screen shows `No Menu Tonight 1.0.0 (16)` or later.

## Product metadata

- App name: `No Menu Tonight`
- Subtitle: `酒吧实时酒单管理`
- Primary category: `Business`
- Secondary category: `Food & Drink`
- Support URL: `https://nomenuapp.com/support`
- Marketing URL: `https://nomenuapp.com/tonight`
- Privacy Policy URL: `https://nomenuapp.com/privacy`

## Promotional text

实时管理今晚酒单、商品状态、公开网页和门店二维码，让顾客来之前就知道今天有什么。

## Description

No Menu Tonight 是面向酒吧店主和员工的实时酒单管理与发布工具。

你可以维护门店商品库，安排今晚酒单，更新上新、在售、售罄和即将上枪状态，并通过独立网页链接与门店二维码实时发布。顾客无需安装 App，也能直接查看公开酒单。

主要功能：

- 管理门店商品、酒款资料、规格和价格
- 编排今晚酒单与酒头顺序
- 更新公开、隐藏和供应状态
- 发布独立网页酒单与门店二维码
- 同步展示到 No Menu
- 维护门店资料与活动
- 邀请店主和员工协作管理
- 查看酒单上新与售罄数据

No Menu Tonight 不处理支付，不提供酒类线上交易或配送。门店账号由 No Menu 或门店负责人提供；如需开通，请访问支持页面提交申请。

## Keywords

酒单管理,酒吧管理,实时酒单,精酿啤酒,上新,二维码菜单,门店运营,Tap List

Current length: 96 UTF-8 bytes (Apple limit: 100 bytes).

## Screenshot order

Use one consistent 6.9-inch portrait set, preferably `1290 × 2796` or another currently accepted 6.9-inch size. PNG/JPEG only, no alpha channel. Capture with the reviewer tenant and `ordering_enabled = false` so no ordering or orders tab appears.

1. `今晚酒单，随时更新` — 酒单首页，展示完整商品与状态。
2. `一次发布，多渠道同步` — 门店公开酒单区，展示网页、二维码与 No Menu 的统一发布说明。
3. `上新、在售、售罄，状态清晰` — 酒单状态筛选或状态编辑。
4. `统一管理商品、规格与价格` — 商品编辑页，规格区展开；不要出现点单条件文案。
5. `门店资料与活动，一处维护` — 门店主页或活动列表。
6. `邀请团队共同管理` — 员工页，使用虚构手机号/账号并遮挡任何真实联系方式。

Do not use the old files under `assets/audits/rebuild-plan-2026-07-21/`; they show the earlier POS-oriented product and are not App Store assets.

## Review notes

```text
No Menu Tonight is a standalone native menu-management and publishing app for partner bars.

It does not require the consumer No Menu app. Bars can manage a structured beverage catalog, publish and update a live public web menu, and generate or share a venue QR code and public HTTPS URL. The public menu can be viewed in any browser without installing another app.

Additional functions include product visibility and lifecycle management, serving sizes and prices, venue profile and events, team access, and menu-performance data.

The app does not process payments, sell alcohol, or provide alcohol delivery.

Reviewer account:
Phone: [REVIEW PHONE]
Password: [REVIEW PASSWORD]

No OTP, invitation, or password reset is required. The demo venue is pre-populated with catalog, menu, event, public web page, and QR-code data.

To verify standalone publishing:
1. Open 酒单 to review and update the current public menu.
2. Open 门店.
3. Open 二维码与公开链接.
4. Open the public HTTPS menu in Safari.

Accounts are provisioned for partner businesses. The app does not offer public self-service account registration. New venues can submit an onboarding request at https://nomenuapp.com/support.
```

## App Review contact

Complete these fields with a person who can answer during review:

- First name / last name: `[REVIEW CONTACT]`
- Email: `[MONITORED EMAIL]`
- Phone: `[PHONE WITH COUNTRY CODE]`
- Sign-in required: `Yes`
- Username field: reviewer phone number
- Password field: permanent reviewer password

The reviewer password must not expire, require OTP, require an invitation, or force a password change.

## App Privacy answers

Choose **Yes, data is collected**. The declaration must cover the complete binary, including optional features enabled only for pilot tenants—not only the reviewer tenant.

Recommended conservative declaration:

| Apple data type | Collected | Linked to identity | Tracking | Purpose |
| --- | --- | --- | --- | --- |
| Contact Info — Name | Yes | Yes | No | App Functionality, Account Management |
| Contact Info — Phone Number | Yes | Yes | No | App Functionality, Account Management |
| Contact Info — Email Address | Yes | Yes | No | App Functionality, Account Management |
| Identifiers — User ID | Yes | Yes | No | App Functionality, Account Management |
| User Content — Photos or Videos | Yes | Yes | No | App Functionality |
| User Content — Other User Content | Yes | Yes | No | App Functionality |
| Purchases — Purchase History | Yes | Yes | No | App Functionality, Analytics |

Notes:

- “Purchase History” conservatively covers optional tenant operational records such as customer labels, order items and totals. No payment-card or bank data is collected.
- Do not declare device location, contacts, health, financial payment information, advertising data or tracking unless the production binary later adds those capabilities.
- Tracking: `No`; the current mobile package has no advertising/ATT/PostHog SDK.
- Privacy Policy URL: `https://nomenuapp.com/privacy`.
- Optional User Privacy Choices URL: `https://nomenuapp.com/support?topic=privacy`.

## Age rating questionnaire

- Made for Kids: `No`.
- Alcohol, Tobacco, or Drug Use or References: `Frequent` because alcoholic beverage names, ABV and images are core content.
- Gambling, contests, loot boxes, violence, sexual content, profanity, medical content: `None`.
- Unrestricted Web Access: `No`; the app opens specific public/support URLs in the system browser and is not a general web browser.
- Messaging/Chat, Social Media, Advertising: `No`.
- User-Generated Content: use `No` for this first version because content is produced only by manually provisioned partner businesses and there is no public posting/social feed. If Apple asks, explain that platform administrators can remove partner content.
- Age Category Override: `Not Applicable`; accept Apple's calculated regional ratings.

## Compliance and commercial answers

- Export compliance: the bundle declares `ITSAppUsesNonExemptEncryption = false`; answer that the app uses only exempt/system encryption when prompted.
- In-App Purchases: none.
- Payments: none.
- Ads: none.
- Sign in with Apple: not required because this is a business app using an existing company-managed account system.
- Content Rights: confirm that partner venues/platform have rights to the product names, logos, photos and event images shown in the reviewer tenant.
- Primary category: `Business`; secondary: `Food & Drink`.
- Copyright: `2026 No Menu` or the exact legal entity/name owned by the developer account.
- Release: prefer manual release for v1 so approval does not immediately publish before the production smoke test.

## Availability decision

- China mainland is a submission blocker until a valid ICP filing number matching the App Store metadata is available. The current public homepage does not visibly expose an ICP number.
- If ICP is not ready, exclude China mainland from v1 availability rather than entering an invented or unrelated number.
- Complete the EU Digital Services Act trader/non-trader declaration before selecting EU territories.

## Reviewer tenant acceptance checklist

- `ordering_enabled = false`.
- Owner account is permanent and requires no OTP, invite, or password change.
- At least 12 products across multiple categories.
- Public, hidden, new, available, sold-out, and coming-soon examples.
- Valid public storefront, address, cover image, and event.
- `is_public_visible = true` and an HTTPS `/bar/{slug}` page that opens without authentication.
- Permanent venue QR code is present and resolves correctly.
- No real customer or private production data is included.

## Submission preflight

- Apply `20260806120000_support_requests.sql` to production.
- Apply `20260807160000_business_day_close_restore_hardening.sql` to production before build 16 is tested or distributed to POS pilot tenants.
- Deploy `submit-support-request` with `SUPPORT_RATE_LIMIT_SALT` configured.
- Deploy taplist-web and smoke-test `/tonight`, `/support`, `/privacy`, and `/terms`.
- Production URL check on 2026-08-06: `/tonight`, `/support`, `/privacy`, and `/terms` all returned HTTP 200.
- Confirm EAS `production` has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`; never submit a local build that resolves to a LAN Supabase URL.
- Build and upload build 16 or later from the source containing the current order/business-day fixes.
- On build 16, log in with the reviewer account and verify there is no 点单/订单 tab, deep links redirect to 酒单, and 经营数据 contains menu-only metrics.
- Confirm App icon is 1024×1024 and has no alpha channel (current `assets/icon.png` passes).
- Verify the App Privacy answers cover account identifiers, business content, support requests, and the legally disclosed optional operational records.
- Complete the age-rating questionnaire with alcohol references declared accurately.
- Confirm selected territories and China-mainland compliance before submission.
- Run a final TestFlight regression with both a disabled and enabled tenant.

## App Store Connect final sequence

1. Create/select iOS version `1.0.0`.
2. Add Simplified Chinese metadata from this document.
3. Upload the six final 6.9-inch screenshots.
4. Set Support, Marketing and Privacy URLs.
5. Complete App Privacy and publish the privacy answers.
6. Complete Age Rating, Content Rights, DSA and availability declarations.
7. Select build `16` or later; resolve export-compliance questions.
8. Enter reviewer contact, permanent reviewer credentials and Review Notes.
9. Choose manual release.
10. Use “Add for Review”, inspect the draft submission, then only after a final human check click “Submit for Review”.
