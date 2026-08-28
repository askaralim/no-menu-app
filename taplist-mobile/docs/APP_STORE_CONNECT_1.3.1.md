# No Menu 1.3.1 — App Store Connect 提审资料

> 适用于当前 consumer app `1.3.1`、iOS build `43`。`1.3.0` 已上线资料保留在 [`APP_STORE_CONNECT_1.3.0.md`](./APP_STORE_CONNECT_1.3.0.md)，不要覆盖其发布记录。

## 状态（2026-08-28）

**待 TestFlight 最终回归与 ASC 提交。**

本版本的主要用户变化是：记录新 TAP、重构“我的”入口、月度 TAP 报告，以及今晚/月度/单款分享图片。关注酒吧与上新通知继续保留。

## 1. Build 与固定信息

| 字段 | 内容 |
|---|---|
| App Store Connect App ID | `6771324382` |
| Bundle ID | `com.nomenuapp.taplist` |
| 版本 | `1.3.1` |
| Build | `43` |
| App 名称 | `No Menu` |
| 主语言 | 简体中文 |
| 主要类别 | Food & Drink / 美食佳饮 |
| 价格 | 免费 |
| App 内购买 | 无 |
| Sign-in required | 否 |
| 隐私政策 | `https://nomenuapp.com/privacy` |
| 营销 URL | `https://nomenuapp.com/` |
| 技术支持 | `https://nomenuapp.com/support` |

提交前用未登录浏览器确认三个 URL 均可公开访问。

## 2. iOS 版本页面文案（可直接粘贴）

### 副标题

```text
城市精酿酒吧实时酒单
```

### 推广文本

```text
发现城市精酿酒吧实时酒单，点亮今晚的新 TAP，按月回看喝过的酒，并生成干净的分享图片。
```

### 描述

```text
No Menu 是一款城市精酿酒吧实时酒单 App。

你可以：
• 浏览合作酒吧公开的当晚酒单
• 查看酒款、酒厂、风格、酒精度、杯型与价格
• 发现近期活动和新上酒款
• 按酒款、酒厂、风格或酒吧搜索
• 点一下记录喝过的新 TAP
• 在“我的 TAP”按时间回看酒款与喝过的酒吧
• 查看月度 TAP 报告，并按风格筛选本月记录
• 生成今晚、月度或单款 TAP 图片，保存或分享
• 关注喜欢的酒吧，并选择开启上新通知
• 使用 Apple 保护和恢复私人记录

浏览公开酒单不需要登录。第一次记录 TAP、关注酒吧、编辑昵称或使用 Apple 保护时，App 会自动建立匿名身份；使用 Apple 保护完全可选。

昵称、关注关系、通知设置和 TAP 记录只有用户本人可见。No Menu 不提供公开点评、评分、聊天或其他用户生成内容。

No Menu 不提供酒类下单、支付、配送或预约服务。酒单、价格、库存和营业状态来自合作酒吧公开信息，请以门店现场实际供应为准。

请理性饮酒，未成年人禁止饮酒。
```

### 关键词

```text
精酿,酒吧,生啤,酒单,啤酒,IPA,TAP,上新,喝过,月度报告,实时菜单,通知
```

### 此版本新增内容

```text
• 全新“我的 TAP”，更清楚地回看喝过的酒款与酒吧。
• 新增月度 TAP 报告，可按风格筛选本月记录。
• 新增今晚 TAP、月度 TAP 与单款酒分享图片。
• 优化记录成功反馈、无图片酒款展示和分享图片预览。
• 优化关注酒吧管理页及多处视觉与交互细节。
```

## 3. 截图

工具：[`../tools/app-store-screenshots.html`](../tools/app-store-screenshots.html)

默认导出 6.9 英寸 `1320 × 2868` PNG，同时支持 6.9 英寸 `1290 × 2796` 与 6.5 英寸 `1242 × 2688`。建议 ASC 顺序：

1. 今晚首页
2. 搜索发现
3. 酒吧实时酒单
4. 记录新 TAP
5. 我的 TAP
6. 月度 TAP 报告
7. 今晚 TAP 分享
8. 月度 TAP 分享
9. 关注酒吧
10. 单款 TAP 分享

截图要求：

- 必须来自最终 build 43 或之后的候选 build；
- 使用真实公开酒吧和酒款，不出现临时 seed、调试 UI 或测试文案；
- “我的”页面使用适合公开展示的测试昵称和记录；
- 分享图片在工具中使用 `contain`，不得裁切底部品牌或最后一行酒款；
- 通知、昵称、TAP 记录和关注关系不得包含不希望公开的私人信息；
- PNG 不含 Alpha 通道；
- 上传前检查地址、价格、酒款在售状态与截图当日一致。

## 4. App Review Notes（英文，可直接粘贴）

```text
No Menu is a read-only directory of public craft beer tap lists for participating bars. It does not sell alcohol, accept payments, facilitate delivery, or require sign-in to browse public content.

Version 1.3.1 improves the private TAP history experience and adds monthly reports and image sharing.

To test a new TAP record:
1. Open a participating bar.
2. Open any beer on that bar's tap list.
3. Tap the lightbulb action labeled “喝过”.
4. The success sheet confirms the record and can open the “今晚 TAP” share image.
5. Open the “我的” tab, then “我的 TAP”, to view the monthly report and the saved beer history.

Each beer is counted once in the user's private beer collection. If the same beer is recorded at another participating bar, that bar is added to the beer's private venue history. The app does not ask for public ratings or reviews.

The monthly TAP report lists beers first recorded during the current month and supports style filters. Share actions generate local PNG images for tonight's TAPs, the monthly report, or a single beer. The user may open the iOS share sheet or save the image to Photos. No photo is uploaded by No Menu.

To test bar following, open a bar detail page and tap “关注”. Followed bars and optional new-tap notification settings are managed from “我的” → “关注酒吧”.

The first private action creates an anonymous Supabase account automatically. Sign in with Apple is optional and is used only to protect and restore private records. The username, followed bars, notification settings, and TAP history are private and are not searchable by other users.

Account deletion is available at the bottom of the “我的” tab and deletes the authentication account and associated private data. For Apple-protected accounts, the app requests Apple authentication again and revokes the Apple authorization before deletion.

On first launch, the app asks the user to confirm legal drinking age and review the Terms of Service and Privacy Policy. Optional product analytics can be declined and later changed from the About tab.

Alcohol-related content is informational. Menu availability, prices, and inventory are supplied by participating bars and should be confirmed at the venue.
```

### 审核账号

```text
Not required
```

公开内容无需登录，私人功能会自动创建匿名账号。

### 审核联系人

- 名：`[真实姓名]`
- 姓：`[真实姓名]`
- 电话：`[含国家/地区代码]`
- 邮箱：`[能够及时收到审核邮件]`

## 5. App Privacy 与年龄分级

本版本没有新增公开 UGC、广告跟踪、支付、定位或照片上传。继续沿用 `1.3.0` 的保守申报：

- User ID — App Functionality，linked，not tracking；
- Device ID — App Functionality / Analytics，linked，not tracking；
- Email Address — 仅可选 Sign in with Apple，App Functionality；
- Other User Content — 私人昵称、关注设置与 TAP 记录，App Functionality；
- Product Interaction — 仅在同意分析后，Analytics，not linked，not tracking；
- Photos or Videos — 不选择。App 仅把本地生成图片写入相册，不读取或上传用户照片；
- Tracking — No；
- User-generated Content — No；
- Alcohol references — Frequent；
- Age Assurance — Yes；
- Made for Kids — No。

若 ASC 的 App Privacy 页面自 `1.3.0` 后没有变化，无需因为本地图片生成功能新增 Photos 数据类型。

## 6. 最终提审检查

### 自动检查

```bash
npm run preflight
```

### 真机回归

- [ ] 首次启动年龄、条款、隐私与分析选择正常
- [ ] 未登录状态可浏览今晚、搜索、酒吧、酒款和活动
- [ ] 酒吧酒单中的酒款可以记录“喝过”
- [ ] 首次记录新增唯一酒款；同款在另一酒吧只新增酒吧经历
- [ ] 成功弹框的完成与分享今晚 TAP 正常
- [ ] “我的”可进入关注酒吧、我的 TAP 与 TAP 记录
- [ ] 月度 TAP 报告数量、酒吧数和风格筛选正确
- [ ] 今晚、月度、酒吧入口单款与个人单款分享图均无裁切
- [ ] 无酒标图片时统一显示 fallback 图片
- [ ] 分享图片和保存图片按钮文案及行为正确
- [ ] 相册权限拒绝、允许和再次保存流程正常
- [ ] 关注、取消关注及通知开关正常
- [ ] Apple 保护、恢复和账号删除正常
- [ ] 隐私政策、支持与营销 URL 可公开访问
- [ ] 飞行模式和私人 RPC 失败不影响公开酒单浏览

### ASC 提交前

- [ ] build 43 已完成 TestFlight 真机验证
- [ ] 版本号、Build、截图和 What’s New 均为 1.3.1
- [ ] 优先上传最高分辨率的 6.9 英寸截图；界面一致时由 ASC 自动缩放，需要自定义构图时再补充其他尺寸
- [ ] App Privacy 已复核并 Publish
- [ ] 年龄分级仍正确显示 18+（新系统）/ 17+（旧系统）
- [ ] Content Rights、出口合规、价格与销售地区无待处理警告
- [ ] 选择手动发布，除非本次明确需要审核通过后自动发布

## 7. 不变的合规声明

- `ITSAppUsesNonExemptEncryption = false`；
- 无 App 内购买；
- 无下单、支付、配送或预约；
- 无公开评分、点评、聊天或社交关系；
- 无 IDFA、广告或跨 App/网站跟踪；
- 中国大陆、欧盟 DSA 与开发者联系信息继续按现有账号实际情况填写。
