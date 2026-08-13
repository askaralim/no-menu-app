# No Menu 1.3.0 — App Store Connect 发布资料

> Canonical consumer ASC doc for `1.3.0`. Index: [`../../docs/INDEX.md`](../../docs/INDEX.md). Push ops: [`../../supabase/NEW_TAP_PUSH_DEPLOYMENT.md`](../../supabase/NEW_TAP_PUSH_DEPLOYMENT.md).

## Status (2026-08-13)

**Submitted — Waiting for App Store Connect review** (`1.3.0`, build ≥42).  
Do not upload a replacement binary unless Apple requests changes. Production migrations through `20260813120000_…` are applied (operator-confirmed). Backend / Edge Function hotfixes OK without a new build when the submitted client already calls them.

本文按 `1.3.0` 功能整理。方括号内容在提交时由账号持有人填写或确认；提交完成后保留作审核备查。

## 1. 构建与 App 信息

| 字段 | 填写内容 |
|---|---|
| App Store Connect App ID | `6771324382` |
| Bundle ID | `com.nomenuapp.taplist` |
| 版本 | `1.3.0` |
| Build | `42` 或更高（已提交的 Production Build） |
| 名称 | `No Menu` |
| 主语言 | 简体中文 |
| 主要类别 | 美食佳饮 / Food & Drink |
| 次要类别 | 不设置 |
| 价格 | 免费 |
| App 内购买 | 无 |
| Made for Kids | 否 |

### 名称

```text
No Menu
```

### 副标题

```text
城市精酿酒吧实时酒单
```

### 隐私政策 URL

```text
https://nomenuapp.com/privacy
```

提交前用未登录浏览器确认该 URL 可公开访问，并已覆盖昵称、关注酒吧、推送设备 token、Apple 登录、喝过记录、分析选择和账号删除。

### 用户隐私选择 URL

如同一页面可说明如何关闭匿名分析、通知和删除账号，可填写：

```text
https://nomenuapp.com/privacy
```

### 营销 URL

```text
https://nomenuapp.com/
```

### 技术支持 URL

```text
https://nomenuapp.com/support
```

如果 `/support` 尚未公开可访问，改用包含真实联系方式的公开页面，不要提交无效 URL。

### 内容版权

选择：

```text
是，此 App 会显示或访问第三方内容，并且我拥有或已取得所需权利
```

确保合作酒吧、酒厂、酒款名称及图片拥有公开展示授权。

### 版权

```text
2026 [Apple Developer 账户中的真实个人姓名或公司法定名称]
```

## 2. iOS 版本页面文案（简体中文）

### 推广文本

```text
关注喜欢的精酿酒吧，上新时及时知道；实时酒单、喝过记录和分享，都在 No Menu。
```

### 描述

```text
No Menu 是一款城市精酿酒吧实时酒单 App。

你可以：
• 浏览合作酒吧公开的当晚酒单
• 查看酒款名称、酒厂、风格、酒精度、杯型与价格
• 发现近期活动和新上酒款
• 按酒款、酒厂、风格或酒吧搜索
• 私人关注喜欢的酒吧，并选择开启上新通知
• 点一下记录喝过的酒，按时间回看自己的记录
• 查看同一款酒曾在哪些酒吧喝过
• 生成喝过记录或单款酒图片，保存到相册或分享
• 设置自己的 NoMenuist 昵称
• 使用 Apple 保护和恢复私人记录

浏览公开酒单不需要登录。第一次喝过、关注酒吧、编辑昵称或使用 Apple 保护时，App 会建立匿名身份。使用 Apple 保护完全可选。

关注关系、通知设置、昵称和喝过记录只有用户本人可见。用户可以随时关闭通知、取消关注、删除单条喝过经历、移除整款酒，或在“我的”页面删除账号和全部私人数据。

No Menu 不提供酒类下单、支付、配送、预约、评分或用户交易功能。酒单、价格、库存和营业状态来自合作酒吧公开信息，请以门店现场实际供应为准。

请理性饮酒，未成年人禁止饮酒。
```

### 关键词

```text
精酿,酒吧,生啤,酒单,啤酒,IPA,上海,上新,活动,喝过,实时菜单,通知
```

### 此版本新增内容

```text
• 新增关注酒吧，可在“我的”中统一管理。
• 支持关注酒吧的上新通知，通知可随时关闭。
• 全新“我的”页面，加入 NoMenuist 昵称和固定身份头像。
• 优化喝过记录的布局、统计和分享入口。
• 优化酒吧详情、关注状态同步和整体浏览体验。
```

## 3. 截图

使用：

```text
tools/app-store-screenshots.html
```

默认输出 6.9 英寸 `1320 × 2868` PNG。建议顺序：

1. 今晚首页
2. 搜索发现
3. 今晚上新
4. 酒吧实时酒单
5. 关注酒吧
6. 酒吧上新通知
7. 我的
8. 分享喝过
9. 酒款详情

上传前检查：

- 使用最终候选 build 的真实界面；
- 所有酒吧和酒款均来自真实公开数据；
- 通知截图不得显示不希望公开的私人内容；
- 昵称使用适合公开展示的测试昵称；
- 营业时间、价格、地址和在售状态在截图当日准确；
- 分享图使用 `contain`，无裁切；
- PNG 不含 Alpha 透明通道；
- 不出现调试 UI、相机 UI、临时 seed 数据或误导性功能。

## 4. App Review 信息

### Sign-in required

选择：

```text
否
```

公开内容无需登录。私人功能会自动创建匿名身份，Apple 登录仅用于可选的数据保护与恢复。

### 审核备注（英文，可直接粘贴）

```text
No Menu is a read-only directory of public craft beer tap lists for participating bars. It does not sell alcohol, accept payments, facilitate delivery, or require sign-in to browse public content.

Version 1.3.0 adds private bar following and optional iOS notifications for newly published drinks. To test:
1. Open a bar detail page.
2. Tap “关注” to follow the bar.
3. Choose “开启上新通知” when prompted.
4. Open the “我的” tab, then “关注酒吧”, to manage followed bars and notification settings.

Notifications are sent only when a participating bar officially publishes a public drink as new. A single-drink notification opens the beer detail page; a multi-drink notification opens the bar detail page. Reviewers do not need to wait for a live notification to inspect or use the rest of the app.

Private drink history can be tested by opening a beer detail page and tapping the lightbulb action labeled “喝过”. The saved drink then appears under “我的”. The user may generate a private history share image.

The first private action creates an anonymous Supabase account automatically. Sign in with Apple is optional and is used only to protect and restore private records across reinstalls or devices. The user may also edit a private NoMenuist nickname. The nickname, followed bars, notification settings, and drink history are not public and are not searchable by other users.

Account deletion is available at the bottom of the “我的” tab. It deletes the authentication account, private profile, followed bars, push-device registration, notification settings, and drink records. For Apple-protected accounts, the app asks the user to authenticate with Apple again and revokes the Apple authorization before deletion.

On first launch, the app asks the user to confirm legal drinking age and review the Terms of Service and Privacy Policy. Optional product analytics can be declined and later changed from the About tab.

Alcohol-related content is informational. Menu availability, prices, and inventory are supplied by participating bars and should be confirmed at the venue.
```

### 审核联系人

- 名：`[真实姓名]`
- 姓：`[真实姓名]`
- 电话：`[包含国家/地区代码，例如 +86]`
- 邮箱：`[能够及时收到审核邮件的地址]`

### 审核附件

通常无需附件。如审核人员难以发现流程，可附一张标注以下路径的截图：

```text
酒吧详情 → 关注 → 开启上新通知 → 我的 → 关注酒吧
```

## 5. App Privacy

选择：

```text
是，我们会从此 App 收集数据
```

以下是按当前实现的保守申报建议。最终应与公开隐私政策逐项一致。

### Identifiers → User ID

| 问题 | 选择 |
|---|---|
| 用途 | App Functionality |
| 与用户身份关联 | 是 |
| 用于跟踪 | 否 |

Supabase 为匿名或 Apple 保护账号生成用户 ID，用于隔离昵称、喝过记录、关注关系和设备注册。

### Identifiers → Device ID

| 问题 | 选择 |
|---|---|
| 用途 | App Functionality；Analytics |
| 与用户身份关联 | 是 |
| 用于跟踪 | 否 |

上新通知需要把 Expo Push Token 关联到私人账号。用户同意匿名分析后，PostHog 还会使用随机持久标识。不要申报为 IDFA 或广告跟踪。

### Contact Info → Email Address

| 问题 | 选择 |
|---|---|
| 用途 | App Functionality |
| 与用户身份关联 | 是 |
| 用于跟踪 | 否 |

用户选择 Sign in with Apple 时，Apple/Supabase 可能处理 Apple 私密转发邮箱。App 不要求用户提供真实邮箱。

### User Content → Other User Content

| 问题 | 选择 |
|---|---|
| 用途 | App Functionality |
| 与用户身份关联 | 是 |
| 用于跟踪 | 否 |

包括用户设置的 NoMenuist 昵称、喝过记录和私人关注/通知设置。

### Usage Data → Product Interaction

| 问题 | 选择 |
|---|---|
| 用途 | Analytics |
| 与用户身份关联 | 否 |
| 用于跟踪 | 否 |

仅在用户同意分析后记录页面和功能事件。不发送昵称、酒名、完整喝过记录、Apple 邮箱、完整地址或原始搜索词。

### 不选择

- Precise Location / Coarse Location
- Photos or Videos
- Purchases / Financial Info
- Contacts
- Health & Fitness
- Browsing History / Search History
- Advertising Data
- Diagnostics（当前自动错误和性能采集关闭）

保存生成图片到相册不等于收集用户照片；App 不读取或上传用户相册内容。

### Tracking

选择：

```text
否
```

当前没有广告用途、IDFA 或跨 App/网站跟踪，不需要 ATT。

更新后必须在 App Privacy 页面点击 `Publish`。

## 6. 年龄分级

| 问题 | 选择 |
|---|---|
| Alcohol, Tobacco, or Drug Use or References | Frequent |
| Age Assurance | Yes |
| Gambling / Loot Boxes | No |
| Unrestricted Web Access | No |
| User-generated Content | No |
| Messaging / Chat | No |
| Social Media | No |
| Made for Kids | No |
| 暴力、色情、医疗等其他内容 | None |

昵称仅本人可见，不构成公开 UGC、社交或聊天功能。

## 7. 加密出口合规

`app.json` 已设置：

```text
ITSAppUsesNonExemptEncryption = false
```

App 仅使用系统 HTTPS/TLS，没有自研或非豁免加密。若 ASC 仍询问，选择仅使用豁免加密，不需要上传额外文件。

## 8. 价格、发布与地区合规

- 价格：免费；
- App 内购买：无；
- Version Release：建议手动发布；
- Phased Release：首发可关闭；
- Reset Rating：不要重置；
- macOS Apple Silicon：未验证时关闭；
- Apple Vision Pro：未验证时关闭；
- 中国大陆：确认 ICP 备案号、备案主体、App 中文名称、Bundle ID 和开发者主体一致；
- 欧盟：确认 Digital Services Act trader 状态及联系信息已完成；
- 其他销售地区出现额外合规字段时，按实际范围填写，不要遗留警告。

## 9. 发布依赖

生产环境（提交前已确认；migrations 已全部执行）：

- `20260807180000_consumer_bar_follows_and_new_tap_push.sql` 已执行；
- `20260811120000_consumer_usernames.sql` 已执行；
- `20260813120000_narrow_last_menu_updated_at.sql` 已执行；
- `dispatch-new-tap-notifications` 为最终版本；
- `merge-apple-account` 为支持 consumer profile 合并的最终版本；
- `NEW_TAP_PUSH_ENABLED=true`；
- `new_tap_push_settings.enabled=true` 且 `activated_at` 非空；
- Cron 每分钟调用 dispatcher 且最近响应不是 `disabled:true`；
- Expo/APNs credentials 有效；
- 关注账号存在有效、enabled 的 iOS push device。

审核期间：勿随意关掉双 kill-switch，除非要紧急停推；停推不会影响浏览/关注。详见 `NEW_TAP_PUSH_DEPLOYMENT.md`。

## 10. 最终真机回归

- [ ] 首次启动年龄、条款和分析选择正常
- [ ] 今晚、搜索、酒吧、酒款和活动使用生产数据
- [ ] 无登录状态可浏览所有公开内容
- [ ] 第一次喝过能建立匿名身份并保存记录
- [ ] 同款同酒吧不重复；同款不同酒吧增加经历但不增加唯一酒款数
- [ ] “我的”昵称、款数、酒吧数和第一杯日期符合最终文案
- [ ] 无喝过数据时隐藏统计和第一杯日期
- [ ] 昵称编辑、校验、冲突提示与回显正常
- [ ] 关注、取消关注以及关注列表实时刷新正常
- [ ] 通知开关、系统拒绝状态与前往设置正常
- [ ] 单款通知标题/正文及酒款详情跳转正常
- [ ] 两款、三款以上通知合并文案及酒吧详情跳转正常
- [ ] Apple 保护、重装恢复和已有账号合并不丢数据
- [ ] 分享图和保存相册正常
- [ ] 删除单条经历、移除整款酒和账号删除均有确认
- [ ] 删除账号同步清理 profile、关注和推送设备
- [ ] 飞行模式或私人 RPC 失败不影响公开酒单
- [ ] 隐私政策、条款、支持和营销 URL 可公开访问

## 11. 最终提交顺序

1. 确认生产迁移、Edge Functions、推送双开关和 Cron。
2. 构建并上传包含最终代码的 `1.3.0` Production Build。
3. 在 TestFlight 完成第 10 节真机回归。
4. 使用最终 build 重拍并生成 6.9 英寸截图。
5. 在 ASC 打开 iOS `1.3.0`，填写版本文案并上传截图。
6. 更新并发布 App Privacy。
7. 确认年龄分级、内容版权、价格、销售范围、ICP 和 DSA 无警告。
8. 选择最终 build，处理 Export Compliance。
9. 填写审核联系人和英文审核备注。
10. 选择手动发布并点击 `Add for Review`。
11. 在 Draft Submission 最后检查后点击 `Submit for Review`。
