# No Menu 1.3.2 — App Store Connect 上线记录

> 提审准备日期：2026-09-02  
> 上线确认日期：2026-09-03  
> 版本：`1.3.2`（build `48`）  
> 当前状态：**Approved / live**（2026-09-03 已确认审核通过并可从 App Store 下载）。本文保留为 `1.3.2` 发布记录及后续排障参考。

## 1. Build 与固定信息

| 字段 | 内容 |
|---|---|
| App Store Connect App ID | `6771324382` |
| Bundle ID | `com.nomenuapp.taplist` |
| 版本 | `1.3.2` |
| 上线 Build | `48` |
| EAS Build ID | `db8d8147-6170-4910-8e90-1bdff2b1b670` |
| Runtime Version | `ee7f9707efde823e12a9ee09ecebacef7af96f79` |
| App 名称 | `No Menu` |
| 主语言 | 简体中文 |
| 主要类别 | Food & Drink / 美食佳饮 |
| 价格 | 免费 |
| App 内购买 | 无 |
| Sign-in required | 否 |
| 隐私政策 | `https://nomenuapp.com/privacy` |
| 营销 URL | `https://nomenuapp.com/` |
| 技术支持 | `https://nomenuapp.com/support` |

build `48` 已于 2026-09-02 在 EAS production 完成，并于 2026-09-03 通过 Apple 审核、在 App Store 上线。build `47` 已被使用，不应作为后续发布候选。

production build 使用 EAS Update `production` channel。发布与 build `48` 兼容的 OTA 时必须显式加载 production 环境：

```bash
eas update --channel production --platform ios --environment production --message "<bug fix>"
```

发布后在 Expo Dashboard 确认 update runtime 与上表一致且显示 `Builds: 1`。`Builds: None` 表示 OTA 没有命中已上线的 build。

## 2. iOS 版本页面文案（可直接粘贴）

### 副标题（30 字以内）

```text
城市精酿酒吧实时酒单
```

### 推广文本

```text
按距离发现附近精酿酒吧，查看今晚活动、最近上新与实时酒单，也能用“我的 TAP”留下私人饮酒记录。
```

### 描述

```text
No Menu 是一款城市精酿酒吧实时酒单 App。

你可以：
• 浏览合作酒吧公开的当晚酒单
• 主动授权当前位置，按直线距离浏览所选城市的附近酒吧
• 查看近期活动、活动详情和最近上新酒款
• 查看酒款、酒厂、风格、酒精度、杯型与价格
• 按酒款、酒厂、风格或酒吧搜索
• 点一下记录喝过的新 TAP
• 在“我的 TAP”按月份回看酒款与喝过的酒吧
• 查看月度 TAP 报告，并按风格筛选本月记录
• 下载或分享酒吧的完整当晚酒单图片
• 生成今晚、月度或单款 TAP 图片，保存或分享
• 关注喜欢的酒吧，并选择开启上新通知
• 使用 Apple 保护和恢复私人记录

“附近”只在用户主动选择时请求 iOS 前台位置权限。当前位置仅在设备内用于计算与公开酒吧的直线距离，不会上传或保存。距离不是步行、驾车或导航路线距离。

浏览公开酒单不需要登录。第一次记录 TAP、关注酒吧、编辑昵称或使用 Apple 保护时，App 会自动建立匿名身份；使用 Apple 保护完全可选。

昵称、关注关系、通知设置和 TAP 记录只有用户本人可见。No Menu 不提供公开点评、评分、聊天或其他用户生成内容。

No Menu 不提供酒类下单、支付、配送或预约服务。酒单、价格、库存和营业状态来自合作酒吧公开信息，请以门店现场实际供应为准。

请理性饮酒，未成年人禁止饮酒。
```

### 关键词

```text
精酿,酒吧,附近酒吧,生啤,酒单,啤酒,IPA,TAP,上新,活动,喝过,月度报告
```

### 此版本新增内容

```text
• 新增“附近”：用户主动授权后，可按直线距离浏览所选城市的公开酒吧。
• 首页活动升级为单张 Banner 轮播，并优化中文状态、日期、活动列表与活动详情。
• 活动海报支持点击查看完整原图，活动详情可直接进入对应酒吧。
• 优化首页最近上新、公开酒单排序和酒吧距离展示。
• 全新设计酒吧酒单分享图，紧凑展示枪号、酒款状态与完整公开价格。
• 优化月度 TAP 报告统计与分享体验。
• 底部导航精简为“今晚 / 搜索 / 我的”，并优化“关于 No Menu”的信息布局与返回体验。
• 修复通知注册与多处稳定性问题。
```

## 3. 截图

工具：[`../tools/app-store-screenshots.html`](../tools/app-store-screenshots.html)

建议 ASC 顺序：

1. 附近酒吧
2. 今晚活动 Banner（单卡轮播）
3. 最近上新
4. 酒吧实时酒单
5. 活动详情
6. 搜索发现
7. 我的 TAP
8. 月度 TAP 报告
9. 关注酒吧
10. 酒吧酒单分享

截图要求：

- 使用已上线 build `48` 的真实页面；
- 第一张应选中“附近”，至少显示两家酒吧及其距离；
- 不要把 Apple 位置授权弹窗作为主截图；
- 活动和酒款必须是真实公开数据，不出现过期测试活动、调试 UI 或 seed 文案；
- 不出现通知、Apple ID、测试昵称或不希望公开的私人 TAP 记录；
- 分享图片使用工具中的 `contain`，不得裁掉底部品牌、价格或最后一款酒；
- 优先提交 6.9 英寸 `1320 × 2868` PNG；工具也支持 `1290 × 2796`、`1260 × 2736` 和 6.5 英寸 `1242 × 2688`；
- PNG 不含 Alpha 通道。

Apple 当前允许每种设备尺寸上传 1–10 张截图；若 UI 跨尺寸一致，提交最高分辨率的 6.9 英寸截图后可由 ASC 向下缩放。

## 4. App Review Notes（英文，可直接粘贴）

```text
No Menu is a read-only directory of public craft beer tap lists for participating bars. It does not sell alcohol, accept payments, facilitate delivery, or require sign-in to browse public content.

Version 1.3.2 adds an optional Nearby sort for public bars and improves public event discovery.

To test Nearby:
1. Open the Tonight tab.
2. Scroll past the event banner and “最近上新” to the public bar list.
3. Tap “附近”.
4. The app first explains why foreground location is needed. Tap “使用当前位置”, then allow location in the iOS system prompt.
5. Bars in the currently selected city are sorted by straight-line distance and display an approximate distance value on each bar card.

Location access is foreground-only and user initiated. The current coordinates are used in memory on the device to calculate straight-line distances from participating bars. No device coordinates are uploaded to No Menu, included in analytics, or persisted. The feature does not provide a map, route, travel time, or navigation distance. If location is denied or unavailable, the app keeps the normal latest-menu ordering and all public browsing remains available.

The homepage event banner is independent from the bar sort. It shows one complete banner at a time; reviewers can swipe between current/upcoming events and use the page dots as a position indicator. Each banner shows a Chinese status label, event date, title, and participating bar.

To test event details, tap a homepage event banner. The detail page separates the event date and display time, and shows the participating bar once as a prominent link below the title. Tap the bar name to open its public tap list. Tap the cover image to view the complete uncropped poster; tap the full-screen image again or use the close button to dismiss it.

To test the bar tap-list image, open a participating bar and tap the download action in the top-right corner. The app generates the image locally and opens a preview before saving or sharing. The export uses a compact two-column layout and includes tap numbers, public status, beer style, brewery, ABV, and all serving prices made public by that bar. Bars that do not publish prices show no price row. No menu image or photo is uploaded by No Menu.

To test a private TAP record:
1. Open a participating bar and select any beer on its public tap list.
2. Tap the action labeled “喝过”.
3. Open the “我的” tab to view the private TAP history and monthly report.

The first private action creates an anonymous Supabase account automatically. Sign in with Apple is optional and is used only to protect and restore private records. Usernames, followed bars, notification settings, and TAP history are private and are not searchable by other users.

Account deletion is available at the bottom of the “我的” tab and deletes the authentication account and associated private data. For Apple-protected accounts, the app requests Apple authentication again and revokes the Apple authorization before deletion.

On first launch, the app asks the user to confirm legal drinking age and review the Terms of Service and Privacy Policy. Optional product analytics can be declined and later changed by opening About from the fixed info button at the top of the Mine tab.

Alcohol-related content is informational. Menu availability, prices, inventory, event details, and opening information are supplied by participating bars and should be confirmed at the venue.
```

### 审核账号

```text
Not required
```

公开浏览和“附近”无需登录。私人功能会自动创建匿名账号。

### 审核联系人

- 名：`[真实姓名]`
- 姓：`[真实姓名]`
- 电话：`[含国家/地区代码]`
- 邮箱：`[能够及时收到审核邮件]`

## 5. App Privacy 与定位

### 定位数据建议

本版本会读取 iOS 当前坐标，但实现中坐标只保存在运行内存，用于本机 Haversine 直线距离计算：

- 不上传 No Menu / Supabase；
- 不写入本地持久化存储；
- 不加入 PostHog analytics；
- 不请求后台定位；
- 冷启动默认回到“最新”，不会自动定位。

按 Apple 对 “collect” 的定义，数据需被传离设备并以可读形式保留超过完成请求所需时间才构成 App Privacy 的收集。基于当前实现，**不新增 Precise Location 或 Coarse Location 数据类型**。但提交前必须确认生产埋点、日志和崩溃服务同样没有携带坐标。

保留 1.3.1 已申报的数据类型：

- User ID — App Functionality，linked，not tracking；
- Device ID — App Functionality / Analytics，linked，not tracking；
- Email Address — 仅可选 Sign in with Apple，App Functionality；
- Other User Content — 私人昵称、关注设置与 TAP 记录，App Functionality；
- Product Interaction — 仅在用户同意后用于 Analytics，not linked，not tracking；
- Photos or Videos — 不选择；App 只把本地生成图片写入相册，不读取或上传用户照片；
- Tracking — No。

### 提交前必须完成

- [ ] 隐私政策明确写明“附近”的前台定位用途、仅本机计算、不上传、不保存；
- [ ] iOS 权限说明显示：`No Menu 使用你当前的位置，为所选城市的酒吧按距离排序。你的位置不会被保存。`；
- [ ] App Privacy 已核对且没有误选 Precise Location / Coarse Location；
- [ ] PostHog Live Events 中没有经纬度、精确地址或定位城市；
- [ ] Android 构建不申请定位权限。

Apple Review Guideline 5.1.5 要求定位与功能直接相关，并在使用前说明目的、通知用户并取得同意。当前的自定义说明页 + iOS 前台权限弹窗满足该交互方向，但必须与隐私政策保持一致。

## 6. 年龄分级与合规

- Alcohol references — Frequent；
- Made for Kids — No；
- Age Assurance — Yes；
- User-generated Content — No；
- Ads — No；
- Gambling / Contests — No（除非真实活动内容另有此类元素）；
- App 内购买 — No；
- Export compliance：`ITSAppUsesNonExemptEncryption = false`。

## 7. 发布验证记录

### 自动检查

```bash
cd /Users/askar/Documents/code/demo/no-menu-app/taplist-mobile
npm run preflight
```

### build 48 真机回归

- [x] 冷启动默认“最新”，不自动请求定位
- [x] 首次点击“附近”先显示用途说明，再显示 iOS 系统权限
- [x] 允许后酒吧按直线距离排序并显示距离
- [x] 拒绝、前往设置、关闭精确位置和定位失败均软降级
- [x] 切回“最新”后距离消失并恢复更新时间排序
- [x] 活动 Banner / 最近上新不受“最新 / 附近”切换影响
- [x] 所选城市与定位城市不一致时仅提示，不自动切换
- [x] 杀掉 App 后重新打开默认回到“最新”
- [x] 活动 Banner 单卡滑动、分页点、中文状态、紧凑日期与“更多”入口正常
- [x] 城市活动列表的动态 Header、“进行中 / 即将开始”分组与卡片导航正常
- [x] 活动详情的完整日期、时间、唯一酒吧入口和活动介绍层级正常
- [x] 活动详情首图顶部裁切正常；点击可查看完整原图，再次点击或关闭按钮可退出
- [x] 酒吧、酒款、搜索、我的 TAP、月报、关注与分享正常
- [x] 酒吧酒单下载图已用 8、13、21 款真机样本验证；双栏、枪号、状态、长酒名与页脚均正常
- [x] 公开价格完整显示全部规格并允许卡片增高；未公开价格的酒吧不显示价格，且没有省略号或截断
- [x] 底部仅显示“今晚 / 搜索 / 我的”；从“我的”顶部打开“关于 No Menu”后，右滑和返回按钮均回到“我的”
- [x] 账号删除、Apple 保护和恢复正常
- [x] 隐私政策、支持与营销 URL 在未登录浏览器中可访问
- [x] production channel OTA 更新可被 build 48 正常下载、应用并在重启后生效；清理更新后功能正常

### ASC 提交操作记录

以下步骤均已完成：build `48` TestFlight 冒烟、创建 `1.3.2` 版本页、填写版本文案与 Review Notes、上传截图、核对 App Privacy 与年龄分级、选择 build、提交审核，并确认 App Store 可下载。

### 当前发布状态（2026-09-03）

- [x] `1.3.2` / build `48` 的版本与构建信息已统一
- [x] ASC 文案、Review Notes、截图顺序和隐私说明已整理
- [x] 本地 `npm run preflight` 已通过
- [x] TestFlight 最终真机冒烟已完成
- [x] production channel OTA 发布、应用与清理更新验证已完成
- [x] 截图、隐私政策和 App Privacy 已按最终版本完成提审
- [x] 已提交 ASC 审核
- [x] Apple 审核通过
- [x] 已确认 App Store 公开可下载

## 8. 官方依据

- Apple App Review Guidelines 5.1.5 — Location Services：<https://developer.apple.com/app-store/review/guidelines/>
- Apple App Privacy Details：<https://developer.apple.com/app-store/app-privacy-details/>
- Apple Manage App Privacy：<https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/>
- Apple Screenshot Specifications：<https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/>
- Apple Upload App Previews and Screenshots：<https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots/>
