# No Menu Tonight 1.1.1 — App Store Connect 发布资料

> Prepared: 2026-08-25 · Status: **Approved / superseded by `1.1.2`（2026-09-03）**
>
> 历史线上版本：App Store `1.1.1`（build 23）
>
> 上一版：[`APP_STORE_CONNECT_1.1.0.md`](./APP_STORE_CONNECT_1.1.0.md)（已被 `1.1.1` 取代）

## 状态

**发布完成。**「分享上新」、分享图下载、默认酒款图与酒单顶部筛选优化均已通过 TestFlight 真机验证和 App Review，并已上线。本文件保留为 `1.1.1` 的 canonical ASC 发布记录；后续 POS 二进制请另开版本文档。

## 1. 版本与构建

| 字段 | 内容 |
|---|---|
| App 名称 | `No Menu Tonight` |
| Bundle ID | `com.taklip.nomenuapp` |
| App Store 版本 | `1.1.1` |
| 线上 Build | `23` |
| 主语言 | 简体中文 |
| 发布方式 | 手动发布 |

当前 `app.json` 与线上版本均为 `1.1.1 (23)`。

## 2. 此版本新增内容

ASC「此版本新增内容」可直接粘贴：

```text
新增「分享上新」：可从当前酒单中选择最多 5 款酒，自动生成适合微信群分享的高清上新图片，并同时复制排版好的酒款介绍。酒厂、酒名、风格、酒精度、介绍以及门店公开的规格价格会自动排版，分享新酒更快捷。

同时优化了酒单顶部布局与状态筛选，让酒头数量和当前状态更清晰。
```

短版备用：

```text
新增「分享上新」，可将最多 5 款新酒生成高清分享图片，并自动复制排版好的群消息。同步优化酒单筛选与酒头数量展示。
```

## 3. 商店元数据

以下内容沿用 `1.1.0`，无需修改：

- 名称、副标题、推广文本和完整描述
- 关键词与分类
- 支持、营销、隐私政策及隐私选择 URL
- 年龄分级、价格、地区、版权和发布方式
- App Privacy 数据收集申报

本版本不新增账号注册、支付、广告、跟踪、相机、通知或定位能力。分享图只在设备本地生成，并通过 iOS 系统分享面板交给用户选择的目标 App；功能不会自动发布内容。

## 4. App Review 审核备注

英文内容可直接粘贴到 Review Notes：

```text
No Menu Tonight is a standalone menu-management and publishing app for partner bars. It does not process payments, sell alcohol, or provide alcohol delivery.

Version 1.1.1 adds a new Share New Arrivals feature. It lets a venue select up to five drinks from its current tap list and generate one high-resolution portrait image suitable for sharing in a group chat. The app also copies a formatted text summary to the clipboard. The image contains information already maintained by the venue, including brewery, drink name, style, ABV, optional description, and serving-size prices when the venue has enabled public prices.

To verify:
1. Sign in with the reviewer account and open 酒单.
2. Tap 分享上新 in the top-right area.
3. Select one to five drinks. Drinks marked 上新 are selected by default.
4. Tap 预览分享图.
5. Tap 分享图片 to open the native iOS share sheet. The matching text summary is copied to the clipboard. The reviewer may cancel the share sheet without sending anything.

The feature does not post automatically, does not integrate with or require WeChat, and does not collect the generated image or clipboard content. It adds no new device permissions. The reviewer account is pre-populated and does not require OTP, invitation, registration, or a password change.

Accounts are provisioned for partner businesses. New venues can submit an onboarding request at https://nomenuapp.com/support.
```

### 审核账号

- Sign-in required：`Yes`
- 用户名：`[审核专用固定手机号]`
- 密码：`[审核专用固定密码]`
- 不得要求 OTP、邀请码、密码重置或首次强制改密
- 审核租户保持 `ordering_enabled = false`

## 5. 截图建议

这是小版本，现有商店截图仍准确，**不要求更换整套截图**。如果希望突出新功能，只替换或新增一张即可：

| 画面 | 建议文案 |
|---|---|
| 「分享上新」预览页，展示 3–5 款酒 | `一张图，分享今晚上新` |

截图中不要出现系统分享面板、真实手机号、私人群聊、调试 UI 或点单相关内容。

## 6. App Privacy 与权限

ASC App Privacy 沿用 `1.1.0`，无需新增数据类型：

- 生成图片发生在设备本地；
- 图片通过系统分享面板分享，不上传至 No Menu；
- 配套文案仅写入系统剪贴板，App 不读取剪贴板；
- 不接入微信 SDK，不自动发送或发布；
- 不新增相册、相机、麦克风、定位、通知或 ATT 权限。

本版本新增 `react-native-view-shot`，用于将 React Native 视图生成临时 PNG。由于包含原生依赖，必须提交新的 iOS binary，不能仅通过 OTA 发布。

## 7. TestFlight 验收

以下项目已在最终 build 23 上完成验证：

- [x] App 内「门店 → 账号」显示 `No Menu Tonight 1.1.1 (23)`
- [x] 审核账号无需 OTP，可直接登录
- [x] `ordering_enabled = false` 时不出现开台、订单、结账或营收入口
- [x] 1、2、3、4、5 款分别可正常生成图片
- [x] 每个酒款区块等高，图片与酒厂、酒名顶端对齐
- [x] 无介绍、无价格、无图片时排版仍正常
- [x] 单规格和多规格价格保持单行且可读
- [x] 长酒厂名、长酒名和长风格不会溢出画布
- [x] 门店关闭公开价格时，图片与文案都不显示价格
- [x] 下载图片可保存到系统相册
- [x] 点击「分享图片」后系统分享面板正常出现
- [x] 取消分享不会报错，重新分享仍正常
- [x] 配套群消息已复制，内容与所选酒款一致
- [x] 图片日期使用上海时区当天日期
- [x] Release build 无崩溃、空白图或字体缺失

## 8. 提交前 Go / No-Go

| 项目 | 当前状态 |
|---|---|
| `app.json` 为 `1.1.1 (23)` | 完成 |
| `npm run typecheck` | 通过 |
| 功能相关代码已合入并可追溯 | 完成 |
| Production EAS build 成功并上传 ASC | 完成（build 23） |
| TestFlight 验收清单全部通过 | 完成 |
| 审核账号、联系人和支持 URL 有效 | 完成 |
| ASC `1.1.1` 元数据 | 完成 |
| App Review | Approved / live |

发布时的依赖与 production build 已通过实际构建、TestFlight 和 App Review 验证。

## 9. 已完成的提交顺序

1. `1.1.1` 功能和发布资料相关改动独立提交。
2. 完成依赖检查和类型检查。
3. 生成并上传 production iOS build 23。
4. 使用审核账号完成 TestFlight 真机验收。
5. 完成 ASC 元数据、App Privacy、年龄分级、出口合规与审核信息。
6. 提交 App Review，审核通过并上线。
