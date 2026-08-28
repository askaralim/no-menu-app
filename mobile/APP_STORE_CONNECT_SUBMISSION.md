# No Menu Tonight — App Store Connect v1.0.0

Prepared: 2026-08-06 · **Status: Approved / live, superseded by `1.1.0`**

> **Current live release:** [`docs/APP_STORE_CONNECT_1.1.0.md`](./docs/APP_STORE_CONNECT_1.1.0.md).  
> **`1.0.0` baseline:** [`docs/APP_STORE_LISTED_V1.md`](./docs/APP_STORE_LISTED_V1.md) (preflight + privacy).  
> This file is the historical App Store Connect fill-in checklist for `1.0.0`. See also [`docs/INDEX.md`](../docs/INDEX.md).

## Go / no-go

- Do not submit build 14: this is the build used for the POS regression test.
- Do not submit existing EAS build 15: it predates the current business-day and order-refresh fixes.
- Apply `supabase/migrations/20260807160000_business_day_close_restore_hardening.sql` to production.
  - Note: `20260807150000_add_we_cheers_qr.sql` is a venue QR data migration, not business-day harden.
- Build and upload build 16 or later from the current verified source.
- Submit only after the Account screen shows `No Menu Tonight 1.0.0 (16)` or later and the reviewer tenant has `ordering_enabled = false`.

## Store listing

- Name: `No Menu Tonight`
- Subtitle: `酒吧实时酒单管理`
- Primary category: `Business`
- Secondary category: `Food & Drink`
- Support URL: `https://nomenuapp.com/support`
- Marketing URL: `https://nomenuapp.com/tonight`
- Privacy Policy URL: `https://nomenuapp.com/privacy`
- Optional Privacy Choices URL: `https://nomenuapp.com/support?topic=privacy`
- Copyright: `2026 No Menu` (replace with the exact legal owner if required)
- Release: Manual release

### Promotional text

实时管理今晚酒单、商品状态、公开网页和门店二维码，让顾客来之前就知道今天有什么。

### Description

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

### Keywords

`酒单管理,酒吧管理,实时酒单,精酿啤酒,上新,二维码菜单,门店运营,Tap List`

This is 96 UTF-8 bytes; Apple allows 100 bytes.

## Screenshots

Upload one consistent 6.9-inch portrait set (`1290 × 2796` is accepted), PNG/JPEG with no alpha. Use only the reviewer tenant with ordering disabled.

1. `今晚酒单，随时更新`
2. `一次发布，多渠道同步`
3. `上新、在售、售罄，状态清晰`
4. `统一管理商品、规格与价格`
5. `门店资料与活动，一处维护`
6. `邀请团队共同管理`

Do not use the old POS-oriented images under `assets/audits/rebuild-plan-2026-07-21/`. Remove or mask all real phone numbers and private account data from screenshots.

## Review information

- Sign-in required: Yes
- Username: permanent reviewer phone number
- Password: permanent reviewer password
- No OTP, invitation, password reset or forced password change
- Complete reviewer contact name, monitored email and phone with country code

### Review Notes

```text
No Menu Tonight is a standalone native menu-management and publishing app for partner bars.

It does not require the consumer No Menu app. Bars can manage a structured beverage catalog, publish and update a live public web menu, and generate or share a venue QR code and public HTTPS URL. The public menu can be viewed in any browser without installing another app.

Additional functions include product visibility and lifecycle management, serving sizes and prices, venue profile and events, team access, and menu-performance data.

The app does not process payments, sell alcohol, or provide alcohol delivery.

The reviewer account is pre-populated and does not require OTP, invitation, registration, or a password change.

To verify standalone publishing:
1. Open 酒单 to review and update the current public menu.
2. Open 门店.
3. Open 二维码与公开链接.
4. Open the public HTTPS menu in Safari.

Accounts are provisioned for partner businesses. The app does not offer public self-service account registration. New venues can submit an onboarding request at https://nomenuapp.com/support.
```

## Reviewer tenant

- `ordering_enabled = false`
- `is_public_visible = true`
- At least 12 realistic products across multiple categories
- Public, hidden, new, available, sold-out and coming-soon examples
- Complete venue profile, cover image, address and one event
- Permanent HTTPS public menu and working QR code
- No real customer/order/private staff data
- No POS, 点单, 订单, 结账, 收银 or 营收 text in the reviewer flow

## App Privacy

Answer: **Yes, data is collected**. Cover the full binary, including optional pilot-tenant features.

| Data type | Linked | Tracking | Purpose |
| --- | --- | --- | --- |
| Name | Yes | No | App Functionality, Account Management |
| Phone Number | Yes | No | App Functionality, Account Management |
| Email Address | Yes | No | App Functionality, Account Management |
| User ID | Yes | No | App Functionality, Account Management |
| Photos or Videos | Yes | No | App Functionality |
| Other User Content | Yes | No | App Functionality |
| Purchase History | Yes | No | App Functionality, Analytics |

Purchase History conservatively covers optional customer labels, order items and totals. The app does not collect payment-card or bank information and does not track users for advertising.

## Age rating and compliance

- Made for Kids: No
- Alcohol/Tobacco/Drug Use or References: Frequent
- All gambling, contests, violence, sexual, profanity and medical descriptors: None
- Unrestricted Web Access: No
- Messaging, Social Media, Advertising: No
- User-Generated Content: No for v1; access is limited to manually provisioned partner businesses, with no public posting or social feed
- Override: Not Applicable; accept Apple's calculated regional rating
- Export compliance: exempt/system encryption; `ITSAppUsesNonExemptEncryption = false`
- In-App Purchases: None
- Payments: None
- Ads/Tracking: None
- Content rights: confirm rights for all venue/product/event images used by the reviewer tenant

## Availability

- Do not enable China mainland unless a valid ICP filing number matching the App Store metadata is available.
- Complete the EU Digital Services Act trader/non-trader declaration before enabling EU territories.

## Final sequence

1. Apply the production migration.
2. Build/upload build 16 or later with EAS production environment.
3. Test the exact uploaded build with the reviewer tenant.
4. Enter Simplified Chinese metadata and upload screenshots.
5. Set Support, Marketing, Privacy and Privacy Choices URLs.
6. Complete and publish App Privacy answers.
7. Complete Age Rating, Content Rights, DSA and availability.
8. Select the final build and resolve export compliance.
9. Enter reviewer contact, credentials and Review Notes.
10. Select manual release.
11. Add for Review and inspect the draft.
12. After a final human check, click Submit for Review.
