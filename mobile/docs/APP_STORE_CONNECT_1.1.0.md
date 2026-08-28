# No Menu Tonight 1.1.0 — App Store Connect 发布资料

> Canonical POS ASC doc for `1.1.0`（对 App Store 已上架的 `1.0.0` 做版本更新）。
> 上一版：[`APP_STORE_LISTED_V1.md`](./APP_STORE_LISTED_V1.md) · [`../APP_STORE_CONNECT_SUBMISSION.md`](../APP_STORE_CONNECT_SUBMISSION.md) · 索引：[`../../docs/INDEX.md`](../../docs/INDEX.md)

## 状态

**Approved / live（2026-08）** — App Store `1.1.0`（build ≥20；以 App 内「门店 → 账号」显示为准）。  
本文保留为 `1.1.0` 提交备查；商店元数据与提交流程以下文为准。下一版 POS 二进制另开 ASC 文档。

---

## 1. 提交前 Go / No-Go

| # | 条件 | 状态 |
|---|------|------|
| 1 | `npm run typecheck` 通过 | 已验证（2026-08-19，退出码 0） |
| 2 | 1.1.0 代码全部提交到 git，构建来源可追溯 | **待办** — 目前 18 个文件未提交 |
| 3 | 生产库已执行 `20260817120000_tenant_tap_slot_count.sql` | **待办 / 待确认**（见第 9 节，必须先于 build 上传） |
| 4 | 生产库已执行 `20260817130000_link_drink_copy_product_image.sql` | **待办 / 待确认** |
| 5 | 审核租户 `ordering_enabled = false` | 待确认 |
| 5b | 点单 / 订单在关闭态下完全隐藏（含 1.1.0 新增路由与文案） | 代码侧已复核并修复 1 处（第 6.1 节）；真机回归待办 |
| 6 | 审核租户已设置 `tap_slot_count`，且留有空酒头 | **待办**（1.1.0 新增，直接影响审核首屏与截图） |
| 7 | EAS `production` 环境含生产 `EXPO_PUBLIC_SUPABASE_URL` / `ANON_KEY` | 待确认 |
| 8 | TestFlight 真机回归（第 10 节）通过 | 待办 |

**不要**在未执行迁移 3 的情况下上传 build：客户端虽有降级（RPC 失败时按现有酒款推导酒头数），但「酒头设置」保存会失败，审核人员可能撞到错误提示。

---

## 2. 构建与 App 信息

| 字段 | 填写内容 |
|---|---|
| App 名称 | `No Menu Tonight` |
| Bundle ID | `com.taklip.nomenuapp` |
| 版本 | `1.1.0` |
| Build | `18` 或更高 — **见下方注意** |
| 主语言 | 简体中文 |
| 主要类别 | `Business` / 商务 |
| 次要类别 | `Food & Drink` / 美食佳饮 |
| 价格 | 免费 |
| App 内购买 | 无 |
| Made for Kids | 否 |
| 发布方式 | 手动发布 |

**Build 号注意：** `eas.json` 的 `production` profile 设了 `autoIncrement: true` 且 `appVersionSource: local`，EAS 构建时会自动把 `app.json` 的 `buildNumber` 递增并写回。所以实际上传的可能是 `19`。**不要**凭本文假定 18，以 ASC / TestFlight 里的真实号码，以及 App 内「门店 → 账号」页显示的 `No Menu Tonight 1.1.0 (N)` 为准。

### 沿用 1.0.0、无需改动的字段

- 副标题：`酒吧实时酒单管理`
- 技术支持 URL：`https://nomenuapp.com/support`
- 营销 URL：`https://nomenuapp.com/tonight`
- 隐私政策 URL：`https://nomenuapp.com/privacy`
- 用户隐私选择 URL：`https://nomenuapp.com/support?topic=privacy`
- 版权：`2026 [Apple Developer 账户中的法定名称]`
- 推广文本：`实时管理今晚酒单、商品状态、公开网页和门店二维码，让顾客来之前就知道今天有什么。`

提交前用未登录浏览器复查这四个 URL 仍返回 200。

---

## 3. 此版本新增内容（必填）

```text
• 全新固定酒头视图：酒单按门店实际酒头数量展示全部枪位，空枪一眼可见。
• 新增「酒头设置」：店主可设置本店固定酒头总数（1–99）。
• 空枪位可直接上酒，已占用的枪位支持换酒和清空。
• 新增「空位」筛选，快速找到还没上酒的酒头。
• 商品库改版：列表直接显示酒厂、风格、规格与价格，新增和编辑入口更清晰。
• 新建酒款时自动匹配本店已有商品，减少重复录入。
• 酒款图片上传前自动压缩，上传更快更省流量。
• 酒单状态配色优化，上新、在售、售罄更容易分辨。
```

**已确认：本次提交继续隐藏点单 / 开台 / 订单。** 本版确实改了这些界面（`点单` 标签改名为 `开台`、点单表单独立成页、订单详情新增「继续加点」），但它们只对 `ordering_enabled = true` 的试点门店可见，1.0.0 的商店文案也从未提及。在公开文案里出现点单/收银字样，会把这个 App 重新定位成 POS，增加审核问询风险。所有商店文案、截图和审核备注都不得出现这些词。实现层面的核查见第 6.1 节。

---

## 4. 描述与关键词

### 描述（建议小改一行）

1.0.0 的描述整体仍准确。唯一值得更新的是功能列表第二条，让它体现固定酒头：

```text
No Menu Tonight 是面向酒吧店主和员工的实时酒单管理与发布工具。

你可以维护门店商品库，安排今晚酒单，更新上新、在售、售罄和即将上枪状态，并通过独立网页链接与门店二维码实时发布。顾客无需安装 App，也能直接查看公开酒单。

主要功能：

- 管理门店商品、酒款资料、规格和价格
- 按门店固定酒头数量编排今晚酒单，空枪位一目了然
- 更新公开、隐藏和供应状态
- 发布独立网页酒单与门店二维码
- 同步展示到 No Menu
- 维护门店资料与活动
- 邀请店主和员工协作管理
- 查看酒单上新与售罄数据

No Menu Tonight 不处理支付，不提供酒类线上交易或配送。门店账号由 No Menu 或门店负责人提供；如需开通，请访问支持页面提交申请。
```

### 关键词

沿用 1.0.0 即可（96 字节，上限 100）：

```text
酒单管理,酒吧管理,实时酒单,精酿啤酒,上新,二维码菜单,门店运营,Tap List
```

可选替换：把 `门店运营` 换成 `酒头管理`，字节数仍是 96。

```text
酒单管理,酒吧管理,实时酒单,精酿啤酒,上新,酒头管理,二维码菜单,Tap List
```

「酒头」是店主真实搜索词，但 `门店运营` 覆盖面更广。二选一，不要两个都加——会超 100 字节。

---

## 5. 截图

**必须重拍。** 1.0.0 的第 1、3、4 张截图已经和 1.1.0 界面不一致（酒单变成固定酒头墙，商品库列表改版），继续沿用属于误导性截图。

用审核租户拍摄，`ordering_enabled = false`，确保画面里没有点单 / 订单标签。6.9 英寸竖屏，`1290 × 2796`，PNG/JPEG 无 Alpha。

| # | 画面 | 文案 |
|---|------|------|
| 1 | 酒单首页，固定酒头墙，含至少 2 个空酒头 | `今晚酒单，按酒头管理` |
| 2 | 「酒头设置」面板 或 空酒头「上酒」流程 | `空枪一眼可见，随时补上` |
| 3 | 酒单状态筛选 / 状态编辑 | `上新、在售、售罄，状态清晰` |
| 4 | 商品库列表（新版行样式，含酒厂 · 风格 · 规格） | `统一管理商品、规格与价格` |
| 5 | 门店二维码与公开链接 | `一次发布，多渠道同步` |
| 6 | 门店资料 / 活动 或 员工页 | `门店资料与团队，一处维护` |

拍摄检查：

- 使用最终候选 build 的真实界面，不要用旧版重绘；
- 遮挡或替换所有真实手机号与私人账号信息；
- 不要使用 `assets/audits/rebuild-plan-2026-07-21/` 下的旧 POS 图；
- 不出现调试 UI、临时 seed 数据或点单相关文案。

辅助工具：`mobile/tools/app-store-screenshots.html`（其中第 401 行的旧副标题「调整酒头顺序、供应状态与公开内容」若要用，记得同步改成上表文案）。

---

## 6. App Review 信息

### Sign-in required

```text
是
```

- 用户名：审核专用固定手机号
- 密码：审核专用固定密码
- 不得有 OTP、邀请码、密码重置或强制改密

### 审核备注（英文，可直接粘贴）

```text
No Menu Tonight is a standalone native menu-management and publishing app for partner bars.

It does not require the consumer No Menu app. Bars can manage a structured beverage catalog, publish and update a live public web menu, and generate or share a venue QR code and public HTTPS URL. The public menu can be viewed in any browser without installing another app.

Additional functions include product visibility and lifecycle management, serving sizes and prices, venue profile and events, team access, and menu-performance data.

The app does not process payments, sell alcohol, or provide alcohol delivery.

Version 1.1.0 is an update focused on the tap list. The venue's menu is now organised as a fixed wall of numbered taps, so empty taps stay visible and can be filled, swapped, or cleared directly. To verify:
1. Open 酒单. The header shows the total number of taps, how many are pouring, and how many are empty.
2. Tap 酒头设置 to set the venue's physical tap count (1-99).
3. Tap 上酒 on an empty tap to assign a product from the venue catalog.
4. Use 换酒 or 清空 on an occupied tap.
5. Open 商品库 to manage products, serving sizes, and prices.
6. Open 门店, then 二维码与公开链接, and open the public HTTPS menu in Safari to confirm the published result.

The reviewer account is pre-populated and does not require OTP, invitation, registration, or a password change.

This version adds no new device permissions, no notifications, no payments, and no account-registration flow. Product images are chosen from the photo library only; the app never opens the camera. Images are resized on device before upload.

Accounts are provisioned for partner businesses. The app does not offer public self-service account registration. New venues can submit an onboarding request at https://nomenuapp.com/support.
```

### 审核联系人

- 名 / 姓：`[真实姓名]`
- 电话：`[含国家/地区代码，例如 +86]`
- 邮箱：`[审核期间能及时查收的邮箱]`

### 审核附件

通常不需要。如担心审核人员找不到新功能，可附一张标注路径的截图：

```text
酒单 → 酒头设置 → 空酒头「上酒」
```

## 6.1 点单 / 订单隐藏核查（1.1.0 已复核）

决策：**本次提交继续隐藏点单能力**。审核租户 `ordering_enabled = false` 时，全流程不得出现点单 / 开台 / 订单 / 结账 / 收银 / 营收 字样。

1.1.0 新增了 `index/` 路由组和「继续加点」入口，属于新的泄漏面，已逐条复核：

| 位置 | 隐藏方式 | 状态 |
|---|---|---|
| 开台标签 | `href: orderingEnabled ? '/(tabs)/' : null` — `app/(tabs)/_layout.tsx:59` | 通过 |
| 订单标签 | `href: orderingEnabled ? '/(tabs)/orders' : null` — `_layout.tsx:70` | 通过 |
| 开台列表 | `if (!orderingEnabled) return <Redirect href="/(tabs)/taplist" />` — `index/index.tsx:338` | 通过 |
| 点单表单（1.1.0 新增路由） | 同上 — `index/form.tsx:494` | 通过 |
| 订单列表 | 同上 — `orders/index.tsx:332` | 通过 |
| 订单详情（含「继续加点」） | 同上 — `orders/[id].tsx:180` | 通过 |
| 经营数据的今日订单 / 营收 / 近 7 天营收 | `sections` 切片 + `activeSection` 强制回 dashboard — `house/more.tsx:307,310,349` | 通过 |
| 酒款编辑「规格」提示文案 | 按 `orderingEnabled` 切换措辞 — `DrinkEditSheet.tsx:869,875` | 通过 |
| **商品库选择弹层的「不可点单」标签** | **1.1.0 修复**：改为按 `orderingEnabled` 切换，关闭时显示「未设价格」— `CatalogPickSheet.tsx:124` | 已修复 |

`CatalogPickSheet` 那处原本无条件渲染「· 不可点单」，而它正好在审核备注引导的路径上（酒单 → 空酒头 → 上酒 → 从商品库选择），是本次唯一发现的实际泄漏。

已知但不触发的一处：`lib/taplistOwnerApi.ts:770` 的错误文案「该规格已有点单记录，无法直接删除」。它只在删除**已被订单引用**的规格时出现，而审核租户按第 10 节要求不含任何订单数据，因此不会触发。若将来给审核租户灌过订单数据，需要一并处理。

`lib/constants.ts` 的 `orderStatusLabel`（已结账等）和 `lib/membershipApi.ts:15` 的注释均不会在关闭点单时渲染。

回归时请用 `ordering_enabled = false` 的租户走完整流程再确认一遍（第 11 节最后一组）。

---

## 7. App Privacy（相对 1.0.0 无变化）

保持 1.0.0 已发布的申报，**不需要改动**：

| Apple 数据类型 | 收集 | 关联身份 | 跟踪 | 用途 |
|---|---|---|---|---|
| Contact Info — Name | 是 | 是 | 否 | App Functionality, Account Management |
| Contact Info — Phone Number | 是 | 是 | 否 | App Functionality, Account Management |
| Contact Info — Email Address | 是 | 是 | 否 | App Functionality, Account Management |
| Identifiers — User ID | 是 | 是 | 否 | App Functionality, Account Management |
| User Content — Photos or Videos | 是 | 是 | 否 | App Functionality |
| User Content — Other User Content | 是 | 是 | 否 | App Functionality |
| Purchases — Purchase History | 是 | 是 | 否 | App Functionality, Analytics |

1.1.0 唯一的新原生依赖是 `expo-image-manipulator`，仅在设备本地压缩/缩放待上传的酒款图片（上限 1200px 宽、JPEG 约 75%、2MB）。它不读取相册元数据、不新增权限、不新增收集项。`app.json` 的两条相册权限文案与 1.0.0 完全一致，`cameraPermission` 与 `microphonePermission` 仍为 `false`。

Tracking：`否`。App 内无广告 SDK、无 ATT、无 PostHog。

---

## 8. 年龄分级、合规、地区（相对 1.0.0 无变化）

- Made for Kids：`否`
- Alcohol, Tobacco, or Drug Use or References：`Frequent`
- 赌博、暴力、色情、医疗等：`None`
- Unrestricted Web Access：`否`
- Messaging / Social Media / Advertising：`否`
- User-Generated Content：`否`（内容仅来自人工开通的合作商户，无公开发帖或社交流）
- 年龄分级覆盖：`Not Applicable`
- 出口合规：`ITSAppUsesNonExemptEncryption = false`，仅使用系统 HTTPS/TLS
- In-App Purchases / Payments / Ads：无
- 内容版权：确认审核租户展示的酒款名称、图片、活动图有授权
- 中国大陆：无有效 ICP 备案号前不要开启
- 欧盟：DSA trader 声明须已完成

---

## 9. 发布依赖（生产库）

上传 build 之前必须已执行：

| 迁移 | 作用 | 为什么阻塞发布 |
|---|---|---|
| `supabase/migrations/20260817120000_tenant_tap_slot_count.sql` | 新增 `tenants.tap_slot_count`（1–99）+ `get_tenant_tap_slot_count` / `set_tenant_tap_slot_count` RPC + 酒头上限触发器；同时重写 `set_drink_taplist_listing`（把「上到已占用酒头」从双向交换改为替换，被顶下来的酒保留在商品库） | 「酒头设置」和固定酒头墙的持久化全靠它 |
| `supabase/migrations/20260817130000_link_drink_copy_product_image.sql` | 关联产品池时复制产品图片 | 关联后酒款图片才与产品池一致 |

**对已上架 1.0.0 的兼容性：** 该迁移会改到线上 1.0.0 客户端也在调用的 `set_drink_taplist_listing`。改动是向后兼容的——未确认酒头数的老门店 `tap_slot_count` 为 `NULL`，上限退化成 `coalesce(v_limit, 99)`，与 1.0.0 的 1–99 范围一致。仍建议在非营业高峰执行，并立刻用一台装着线上 1.0.0 的设备验证「加入酒单 / 改枪号」。

以下迁移与 POS 二进制无关，不阻塞本次提交，仅列出以免混淆：`20260813120000`（酒单新鲜度收窄）、`20260814120000`（合酿仅在酒吧酒单展示）、`20260816120000` / `20260816130000` / `20260816140000`（店内展示页 payload）、以及各 QR 数据迁移（`20260814130000`、`20260815120000`、`20260819120000`）。

---

## 10. 审核租户验收

在 1.0.0 清单基础上，1.1.0 新增前两条：

- **`tap_slot_count` 已显式设置**（建议 8–12），不要留 `NULL` 走推导值
- **至少留 2 个空酒头**，让固定酒头墙、「空位」筛选和「上酒」流程在审核首屏就能看到
- `ordering_enabled = false`
- `is_public_visible = true`
- 店主账号永久有效，无 OTP / 邀请 / 强制改密
- 至少 12 个跨分类商品，覆盖公开、隐藏、上新、在售、售罄、即将上新
- 完整门店资料、封面图、地址和至少一个活动
- 永久门店二维码和可匿名访问的 HTTPS `/bar/{slug}`
- 无真实顾客、订单或员工私人数据
- 审核流程中不出现 POS / 点单 / 开台 / 订单 / 结账 / 收银 / 营收 字样

---

## 11. TestFlight 真机回归

固定酒头（本版重点）：

- [ ] 酒单头部「N 个酒头 · X 在枪 · Y 空位」数字正确
- [ ] 空酒头显示为「空酒头」行并有「上酒」入口
- [ ] 「酒头设置」可改数量；小于当前最高枪号时报「当前最高使用到 #N，请先调整酒头再减少数量」
- [ ] 非店主账号改酒头数量被拒并给出中文提示
- [ ] 「空位」筛选只显示空酒头；无结果时显示「此筛选下暂无酒头」
- [ ] 空枪「上酒」→ 选商品 → 直接上枪成功
- [ ] 已占用枪「换酒」为替换语义：被顶下的酒回到商品库、不再公开
- [ ] 「清空」有二次确认，且酒款保留在商品库
- [ ] 已下架酒款加入今晚时自动恢复
- [ ] 首次进入的「点击枪号可调整或交换」提示只出现一次

商品库与酒款：

- [ ] 列表显示缩略图、酒厂 · 酒名、风格、规格价格，长名称截断不遮挡右侧操作
- [ ] 新增商品 / 新增分类入口在头部可用（底部悬浮按钮已移除）
- [ ] 「⋯」菜单在首行、中间行、末行位置都正常
- [ ] 输入酒名时优先提示本店已有商品（含已下架），选中后进入编辑而非新建
- [ ] 与已启用同名酒款冲突时出现「已有同名酒款，仍要创建？」确认
- [ ] 已关联产品池时隐藏产品池搜索，「取消关联」可解绑
- [ ] 选相册图片上传成功，大图被压缩，超 2MB 有提示；全程不弹相机

发布链路与回归：

- [ ] 二维码与公开链接页正常，Safari 打开公开酒单与 App 内一致
- [ ] 门店资料、活动、员工、常用杯型无回归
用 `ordering_enabled = false` 的审核租户（对应第 6.1 节）：

- [ ] 无开台 / 订单标签；深链 `/(tabs)/`、`/(tabs)/index/form`、`/(tabs)/orders` 全部跳回酒单
- [ ] 经营数据只有酒单指标，无今日订单 / 今日营收 / 近 7 天营收
- [ ] 空酒头「上酒」→ 商品库选择弹层：无价格的酒款显示「未设价格」，**不是**「不可点单」
- [ ] 酒款编辑的规格提示不含「点单」字样
- [ ] 通读酒单、商品库、门店三个标签，确认无点单 / 开台 / 订单 / 结账 / 收银 / 营收 字样

用 `ordering_enabled = true` 的试点租户：

- [ ] 开台列表、独立点单表单、按顾客名搜索、订单详情「继续加点」、再次点标签回到列表根，全部正常
- [ ] 商品库选择弹层恢复显示「不可点单」
- [ ] 账号页显示 `No Menu Tonight 1.1.0 (最终 build 号)`

---

## 12. 最终提交顺序

1. 提交 1.1.0 代码到 git（当前仍在 `codex/taplist-fixed-slots` 未提交）。
2. 生产库执行第 9 节两条迁移，并用线上 1.0.0 设备验证无回归。
3. 配置审核租户：`ordering_enabled = false`、`tap_slot_count` 已设、留出空酒头。
4. 确认 EAS `production` 环境变量指向生产 Supabase，`eas build --platform ios --profile production`。
5. 记录 EAS 实际生成的 build 号（autoIncrement 可能已变成 19）。
6. TestFlight 完成第 11 节回归，同时测禁用和启用点单的两种租户。
7. 用最终 build 重拍第 5 节六张 6.9 英寸截图。
8. ASC 新建 iOS 版本 `1.1.0`，填「此版本新增内容」，按需更新描述，上传截图。
9. App Privacy 无需改动，确认已是 published 状态。
10. 确认年龄分级、内容版权、价格、销售地区、ICP、DSA 均无警告。
11. 选择最终 build，处理 Export Compliance（仅豁免加密）。
12. 填写审核联系人、审核账号密码和英文审核备注。
13. 选择手动发布，`Add for Review`，人工复查草稿后再 `Submit for Review`。
