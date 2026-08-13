# No Menu 1.2.4 — App Store Connect 发布资料

本文档按 `1.2.4` 当前功能和 App Store Connect 字段整理。方括号内容需要在提交前替换或确认。

## 1. 构建与 App 信息

| 字段 | 填写内容 |
|---|---|
| App Store Connect App ID | `6771324382` |
| Bundle ID | `com.nomenuapp.taplist` |
| 版本 | `1.2.4` |
| Build | 选择包含最终截图间距调整的最新 Production Build；当前本地 `app.json` 为 `35` |
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
城市精酿酒吧公开酒单
```

### 隐私政策 URL

```text
https://nomenuapp.com/privacy
```

### 用户隐私选择 URL

如果隐私政策页面已经明确说明如何关闭匿名分析和删除账号，可以填写：

```text
https://nomenuapp.com/privacy
```

该字段可选。

### 内容版权

选择：

```text
是，此 App 会显示或访问第三方内容，并且我拥有或已取得所需权利
```

No Menu 会展示合作酒吧、酒厂、酒款名称及图片，需要确保具有公开展示授权。

## 2. iOS 版本页面文案（简体中文）

### 推广文本

```text
查看城市精酿酒吧公开酒单，点一下记录喝过的酒，再把最近酒迹生成图片分享。
```

### 描述

```text
No Menu 是一款简洁的城市精酿酒吧公开酒单 App。

你可以：
• 浏览合作酒吧公开的当晚酒单
• 查看酒款名称、酒厂、风格、酒精度、杯型与价格
• 发现近期活动和新上酒款
• 按酒款、酒厂、风格或酒吧进行搜索
• 点亮喝过的酒，按时间回看自己的酒迹
• 记录同一款酒曾在哪些酒吧喝过
• 生成酒迹或单款酒图片，保存到相册或分享
• 使用 Apple 保护记录，换机或重新安装后恢复

浏览公开酒单不需要登录。第一次记录喝过的酒时，App 会自动建立匿名身份；使用 Apple 保护记录完全可选。用户可以删除单条酒吧记录、熄灭酒款，或在“我的”页面删除账号和全部记录。

No Menu 不提供酒类下单、支付、配送、预约、评分或用户交易功能。酒单、价格、库存与营业状态来自合作酒吧公开信息，请以门店现场实际供应为准。

请理性饮酒，未成年人禁止饮酒。
```

### 关键词

```text
精酿,酒吧,生啤,酒单,啤酒,IPA,上海,活动,上新,酒迹,喝过,实时菜单
```

### 此版本新增内容

```text
• 新增“喝过”：点一下记录喝过的酒，并保留喝过的酒吧。
• 新增“我的”页面，按时间回看个人酒迹。
• 支持生成酒迹总结图和单款酒图片，保存或分享。
• 可选使用 Apple 保护记录，方便换机或重新安装后恢复。
• 支持删除单条酒吧记录、熄灭酒款和删除账号。
• 优化酒款详情、杯型价格和整体浏览体验。
```

### URL

| 字段 | 建议 |
|---|---|
| 营销 URL | `https://nomenuapp.com/` |
| 技术支持 URL | `https://nomenuapp.com/support` |

技术支持 URL 必须真实可访问，并显示可以联系到开发者的邮箱、电话或其他支持方式。如果 `/support` 尚未上线，先不要填写这个不存在的路径；可以使用包含真实联系方式的官网页面。

### 版权

```text
2026 [Apple Developer 账户中的真实个人姓名或公司法定名称]
```

## 3. 截图

使用：

```text
tools/app-store-screenshots.html
```

默认生成 6.9 英寸 `1320 × 2868` PNG。推荐上传顺序：

1. 今晚首页
2. 搜索发现
3. 今晚上新
4. 酒吧实时酒单
5. 我的酒迹（喝过）
6. 分享酒迹
7. 酒款详情
8. 近期活动
9. 城市切换（可选）

上传前检查：

- 所有内容都来自真实公开数据；
- 不出现测试账号、调试菜单、相机界面或内部标识；
- 酒吧营业状态、价格和地址在截图当日仍然准确；
- 酒迹截图不包含不希望公开的个人测试记录；
- 生成分享图使用 `contain`，没有裁切；
- PNG 不含 Alpha 透明通道。

## 4. App Review 信息

### Sign-in required

选择：

```text
否
```

公开酒单无需登录。Drink Log 使用自动匿名身份，Apple 登录只是可选的数据保护方式，因此不需要提供审核账号。

### 审核备注（英文，可直接粘贴）

```text
No Menu is a read-only directory of public craft beer tap lists for bars in supported cities. It does not sell alcohol, accept payments, facilitate delivery, or require sign-in to browse public content.

Version 1.2.4 adds a private “Drank” record. To test it:
1. Open any beer detail page.
2. Tap the lightbulb button labeled “喝过”.
3. Open the “我的” tab to view the saved drink history and generate a share image.

The first saved drink creates an anonymous Supabase account automatically. “Sign in with Apple” is optional and is used only to protect and restore the private drink history across reinstallations or devices.

Account deletion is available under the “我的” tab at the bottom of the page. It deletes the authentication account and all private drink records. For Apple-protected accounts, the app asks the user to authenticate with Apple again and revokes the Apple authorization before deletion.

Users can also remove an individual venue record or remove an entire beer from their history. Drink history is private and isolated by the authenticated user ID.

On first launch, the app asks the user to confirm legal drinking age and review the Terms of Service and Privacy Policy. Optional anonymous product analytics can be declined and later changed from the About tab.

Alcohol-related content is informational. Menu availability, prices, and inventory are supplied by participating bars and should be confirmed at the venue.
```

### 联系人

- 名：`[真实姓名]`
- 姓：`[真实姓名]`
- 电话：`[包含国家/地区代码，例如 +86]`
- 邮箱：`[能够及时收到审核邮件的地址]`

### 附件

通常无需附件。如果审核人员难以发现“喝过”，可以附一张标注“酒款详情 → 喝过 → 我的”的操作截图。

## 5. App Privacy

选择：

```text
是，我们会从此 App 收集数据
```

以下采用相对保守的申报方式，覆盖 Supabase Auth、私人酒迹和用户同意后启用的 PostHog。

### Identifiers → User ID

| 问题 | 选择 |
|---|---|
| 用途 | App Functionality |
| 与用户身份关联 | 是 |
| 用于跟踪 | 否 |

原因：Supabase 为匿名或 Apple 保护账号生成用户 ID，并使用该 ID 隔离酒迹。

### Contact Info → Email Address

| 问题 | 选择 |
|---|---|
| 用途 | App Functionality |
| 与用户身份关联 | 是 |
| 用于跟踪 | 否 |

原因：用户选择 Sign in with Apple 时，Apple/Supabase 可能处理 Apple 私密转发邮箱。App 不要求、显示或依赖真实邮箱，但保守申报更安全。

### User Content → Other User Content

| 问题 | 选择 |
|---|---|
| 用途 | App Functionality |
| 与用户身份关联 | 是 |
| 用于跟踪 | 否 |

原因：用户主动创建的“喝过”酒款和酒吧经历属于私人用户记录。

### Identifiers → Device ID

| 问题 | 选择 |
|---|---|
| 用途 | Analytics |
| 与用户身份关联 | 否 |
| 用于跟踪 | 否 |

原因：只有用户同意匿名分析后，PostHog 才使用随机持久标识进行产品分析；不使用 IDFA。

### Usage Data → Product Interaction

| 问题 | 选择 |
|---|---|
| 用途 | Analytics |
| 与用户身份关联 | 否 |
| 用于跟踪 | 否 |

原因：同意分析后会记录页面和功能事件。不会发送酒名、完整个人酒迹、Apple 邮箱或原始搜索词。

### 不选择

- Precise Location / Coarse Location
- Photos or Videos
- Purchases / Financial Info
- Contacts
- Health & Fitness
- Browsing History / Search History
- Advertising Data
- Diagnostics（当前错误与性能自动采集均关闭）

保存图片到用户相册不等于从相册收集照片。App 不上传用户相册内容。

### Tracking

选择：

```text
否
```

当前没有广告用途、IDFA 或跨 App / 网站跟踪，因此不需要 ATT。

填写后点击 App Privacy 页面右上角的 `Publish`，否则修改不会正式生效。

## 6. 年龄分级

建议填写：

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

最终年龄等级由 App Store Connect 自动计算。酒类信息是核心内容，不要选择 `Infrequent`。

## 7. 加密出口合规

`app.json` 已设置：

```text
ITSAppUsesNonExemptEncryption = false
```

App 只使用系统 HTTPS/TLS，没有自研或非豁免加密。若仍被询问，选择仅使用豁免加密，不需要上传额外文件。

## 8. 价格、销售范围与合规

- 价格：免费；
- App 内购买：无；
- Version Release：建议手动发布；
- Phased Release：本次可关闭；
- Reset Rating：不要重置；
- macOS Apple Silicon：未测试时关闭；
- Apple Vision Pro：未测试时关闭；
- 中国大陆：确认 ICP 备案号、备案主体、App 中文名称、Bundle ID 和开发者主体一致；
- 欧盟：确认 Digital Services Act trader 状态和联系信息已完成；
- 韩国、越南或其他地区出现额外合规字段时，按实际销售范围完成，不要留未解决警告。

## 9. 提交前真机检查

- [ ] 首次启动年龄、条款和匿名分析选择正常
- [ ] “仅必要功能”和“同意匿名分析”两条路径都可进入 App
- [ ] 今晚、搜索、酒吧、酒款和活动使用生产数据
- [ ] 第一次点击“喝过”能建立匿名身份并保存记录
- [ ] 同款同酒吧不会重复；同款不同酒吧能增加经历
- [ ] “我的”页面时间顺序、统计和最多9款分享图正确
- [ ] 单酒分享与酒迹分享均可打开系统分享面板
- [ ] 保存到相册成功并有明确反馈
- [ ] Apple 保护记录成功
- [ ] 删除并重装后使用 Apple 恢复记录成功
- [ ] Apple 已有账号与匿名记录合并不丢失
- [ ] 删除单条酒吧经历和熄灭整款酒正常
- [ ] 匿名账号删除成功
- [ ] Apple 保护账号删除成功，Apple token 得到撤销
- [ ] 酒款或酒吧下架后酒迹仍保留，无效分享入口隐藏
- [ ] 飞行模式或 RPC 失败不会影响公共酒单浏览
- [ ] 隐私政策、条款和支持 URL 均可公开访问

## 10. 最终提交顺序

1. 在 App Store Connect 打开 iOS `1.2.4`。
2. 上传简体中文截图和版本文案。
3. 选择包含最终代码的 Production Build。
4. 填写审核联系人和审核备注。
5. 确认 App Privacy 已保存并 `Publish`。
6. 确认年龄分级、内容版权、价格、销售范围、ICP 与 DSA 没有警告。
7. 选择手动发布。
8. 点击 `Add for Review`。
9. 在 Draft Submission 中检查项目。
10. 点击 `Submit for Review`。
