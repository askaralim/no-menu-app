# No Menu Tonight 1.1.2 — App Store Connect 发布资料

> Prepared: 2026-09-01 · Status: **Approved / live（2026-09-03）**
>
> 当前线上版本：App Store `1.1.2`（build 24）
>
> 上一版资料：[`APP_STORE_CONNECT_1.1.1.md`](./APP_STORE_CONNECT_1.1.1.md)

## 状态

`1.1.2` build 24 已完成 production build、TestFlight 验收、production OTA 发布/恢复验证和 App Review，Apple 于 2026-09-03 审核通过并发布。ASC 当前状态为「可分发」，App Store 已可下载 `1.1.2`。本文件作为该版本的 canonical ASC 发布记录。

## 1. 版本与构建

| 字段 | 内容 |
|---|---|
| App 名称 | `No Menu Tonight` |
| Bundle ID | `com.taklip.nomenuapp` |
| App Store 版本 | `1.1.2` |
| 审核通过 Build | `24` |
| 主语言 | 简体中文 |
| 发布方式 | 手动发布 |
| Production OTA channel | `production` |
| Runtime version policy | `appVersion` |

`eas.json` 的 production profile 启用了 `autoIncrement`；本次 App Store Connect 实际审核并发布的构建号已确认为 build 24。

## 2. 此版本新增内容

ASC「此版本新增内容」建议直接粘贴：

```text
新增酒款图片原图预览，可查看图片尺寸并支持双指缩放和拖动；优化酒单中的酒款编辑入口与枪号展示，让日常酒单维护更直观。

同时修复活动录入问题，并提升应用更新体验与稳定性。
```

更短备用版：

```text
新增酒款图片原图预览与缩放，优化酒单编辑入口和枪号展示；修复活动录入问题，并提升应用更新体验。
```

## 3. 商店元数据与截图

以下内容沿用 `1.1.1`，无需修改：

- App 名称、副标题、推广文本、完整描述和关键词
- 主分类、次分类、支持 URL、营销 URL及隐私政策 URL
- 年龄分级、价格、销售地区、版权和发布方式
- App Privacy 数据收集申报
- iPhone 商店截图

### 截图决定

**本版本不更换 screenshots。** 本次是图片管理、编辑入口、活动录入和更新机制的小版本优化，现有截图仍准确展示 App 的核心功能和当前 UI，不需要为了提审重新制作截图。

本次提审沿用原有截图，ASC 新版本页面正常继承并显示了现有截图。

## 4. App Review 审核备注

Review Notes 建议直接粘贴以下英文：

```text
No Menu Tonight is a standalone menu-management and publishing app for partner bars. It does not process payments, sell alcohol, or provide alcohol delivery.

Version 1.1.2 improves product-image review and day-to-day tap-list editing, and fixes an issue that could prevent a new venue event from being created on some devices.

To verify the image and editing improvements:
1. Sign in with the reviewer account and open 酒单.
2. Tap a drink image to open the drink editor directly.
3. In the 图片 section, tap 查看原图.
4. The complete uploaded image and its pixel dimensions are shown. The reviewer can pinch to zoom, drag while zoomed, and double-tap to reset.
5. Close the preview using the X button or by tapping the dark area outside the image.

To verify event creation:
1. Open 门店.
2. Open 活动 and create a new event.
3. Enter the required event information and save. Adding a poster image is optional unless the event is made public.

The reviewer account is pre-populated and does not require OTP, invitation, registration, or a password change. Accounts are provisioned for partner businesses. New venues can submit an onboarding request at https://nomenuapp.com/support.

This version adds no advertising, tracking, payment, alcohol-sales, delivery, or public social-posting functionality.
```

### 审核账号与联系人

- Sign-in required：`Yes`
- 用户名：`[审核专用固定手机号]`
- 密码：`[审核专用固定密码]`
- 审核账号不得要求 OTP、邀请码、首次密码重置或强制改密
- 审核租户保持 `ordering_enabled = false`
- 审核联系人姓名：`[填写可联系负责人]`
- 审核联系人邮箱：`[填写持续监控的邮箱]`
- 审核联系人电话：`[使用国际格式，例如 +86…]`

## 5. App Privacy、权限与合规

### App Privacy

沿用 `1.1.1` 的 App Privacy 申报，无需新增数据类型：

- 酒款和活动图片仍属于已申报的 `Photos or Videos`，用于 App Functionality；
- 原图预览只读取当前用户已选择或已上传的图片，不引入跟踪或广告用途；
- 图片像素尺寸在设备端读取，不作为新的用户数据上传；
- OTA 不改变账号、分析、支付或跟踪数据的收集范围。

### 权限

无需新增权限。继续使用现有相册读取和保存用途说明：

- 读取相册：选择酒款图片或活动海报；
- 写入相册：保存分享图片和门店二维码；
- 不使用相机、麦克风、定位或 ATT。

### 其他合规字段

- Export Compliance：继续使用 `ITSAppUsesNonExemptEncryption = false`
- In-App Purchases：无
- Payments：无
- Ads / Tracking：无
- Content Rights：确认审核租户使用的酒款和活动图片拥有展示权
- Age Rating：沿用当前已批准版本
- `ordering_enabled = false` 的审核租户不得出现开台、订单、结账、收银或营收入口

## 6. OTA 审核与发布说明

本版本新增 `expo-updates` 原生依赖，因此 `1.1.2` 必须先通过新的 iOS binary 提审，不能把 `1.1.1` 直接 OTA 成本版本。

当前配置：

- Update URL：EAS project `25370b31-037e-42a1-b6ce-16bf661e1ccc`
- Production channel：`production`
- Runtime policy：`appVersion`
- `1.1.2` 更新只面向 `1.1.2` runtime，不跨版本投递到 `1.1.1`

production build 24 已确认使用 production channel。已通过临时版本标记完成 OTA 下载与冷启动生效验证，随后发布恢复 OTA 移除测试标记。

## 7. TestFlight 验收记录

以下为 build 24 的发布验收记录；主要图片、编辑、活动录入和 OTA 流程已完成真机验证，未单独留存结果的边界项保留为历史检查项：

- [x] 「门店 → 账号」显示 `No Menu Tonight 1.1.2 (24)`
- [ ] 审核账号无需 OTP，可直接登录
- [ ] `ordering_enabled = false` 时无开台、订单、结账或营收入口
- [ ] 酒单页点击酒款图片可直接进入编辑页
- [ ] 图片右下角铅笔入口清晰，枪号显示为 `#数字`
- [ ] 点击枪号仍可正常调整或交换枪号
- [ ] 已上传图片可打开「查看原图」
- [ ] 原图使用完整比例显示，不被正方形裁切
- [ ] 图片像素尺寸显示正确
- [ ] 双指缩放、放大后拖动、双击复位正常
- [ ] 点击黑色空白区、右上角 X 和系统返回均可关闭预览
- [ ] 上传宽度小于或等于 1200px 的图片不会被放大
- [ ] 上传宽度大于 1200px 的图片会等比例缩小到 1200px
- [ ] 更换、移除图片以及保存酒款正常
- [ ] 新建活动可成功保存，不出现无效 ID / 保存失败
- [ ] 活动海报上传与公开活动必填校验正常
- [x] App 完全退出后冷启动正常，production OTA 可下载并在下次冷启动生效
- [ ] 弱网或离线冷启动不会阻止进入已安装版本
- [ ] Release build 无崩溃，酒单、商品库和门店基础流程正常

## 8. 已完成的 ASC 提交流程

1. 在 ASC 创建 iOS 新版本 `1.1.2`。
2. 沿用现有 screenshots，不上传新截图。
3. 填写第 2 节「此版本新增内容」，其他商店元数据保持不变。
4. 上传并选择 production iOS build 24。
5. 使用同一 build 完成 TestFlight 与 OTA 验收。
6. 完成出口合规、审核账号、联系人及 Review Notes。
7. 以手动发布方式提交 App Review。
8. Apple 于 2026-09-03 审核通过，版本已发布并可下载。

## 9. Go / No-Go

| 项目 | 当前状态 |
|---|---|
| `app.json` 为 `1.1.2 (24)` | 完成 |
| production OTA URL / channel / runtime | 已配置 |
| `npm run typecheck` | 通过（2026-09-01） |
| 功能真机测试 | 完成（TestFlight build 24） |
| Production EAS build 成功 | 完成（build 24） |
| ASC build 处理完成并可选择 | 完成 |
| 最终 build TestFlight / OTA 验收 | 完成 |
| 审核账号和联系信息 | 已通过 App Review |
| ASC `1.1.2` 版本与更新说明 | 完成 |
| App Privacy / 年龄分级 / 出口合规复核 | 完成，无变化 |
| App Review | **Approved（2026-09-03）** |
| App Store 发布 / 可分发 | **完成（2026-09-03）** |

**当前结论：`1.1.2` build 24 已通过 App Review 并正式上线，是当前 App Store 版本。**
