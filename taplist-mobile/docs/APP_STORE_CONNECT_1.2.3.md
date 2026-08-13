# No Menu 1.2.3 (Build 25) — App Store Connect 发布资料

本文档按当前 `app.json`、本次实际功能和 2026-07-21 的 App Store Connect 字段准备，可直接复制填写。

## 1. 构建信息

| 字段 | 值 |
|---|---|
| App Store Connect App ID | `6771324382` |
| Bundle ID | `com.nomenuapp.taplist` |
| 版本 / Build | `1.2.3 (25)` |
| App 名称 | `No Menu` |
| 主语言 | 简体中文 |
| 主类别 | 美食佳饮 / Food & Drink |
| 次要类别 | 不设置 |
| 价格 / App 内购买 | 免费 / 无 |

## 2. App 信息

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

用户隐私选择 URL 可暂时留空。用户已经可以在 App 的“关于 → 匿名使用分析”中撤回同意。

### 类别与内容版权

- 主要类别：`Food & Drink / 美食佳饮`
- 次要类别：不设置
- 展示或访问第三方内容：选择“是，我拥有或已取得所需权利”

App 会展示合作酒吧提供的名称、酒单、活动和图片，因此应确认已经取得展示权利。

## 3. 版本页面文案（简体中文）

### 推广文本

```text
查看城市精酿酒吧公开酒单、近期活动与新上酒款，快速找到今晚想喝的生啤。
```

### 描述

```text
No Menu 是一款简洁的城市精酿酒吧实时酒单 App。

你可以：
• 浏览合作酒吧公开的当晚生啤酒单
• 查看酒款名称、风格、酒精度、杯型与价格
• 发现近期活动和新上酒款
• 按酒款、酒厂、风格或酒吧进行搜索
• 保存酒款和酒单图片，方便分享与收藏

No Menu 不提供酒类下单、支付、配送、预约、评分或用户交易功能。酒单、价格、库存与营业状态来自合作酒吧公开信息，请以门店现场实际供应为准。

请理性饮酒，未成年人禁止饮酒。
```

### 关键词

```text
精酿,酒吧,生啤,酒单,啤酒,IPA,上海,活动,上新,实时菜单
```

不要重复 `No Menu`，也不要加入竞品名称。

### 此版本新增内容

```text
• 优化酒款与活动图片缓存，浏览更快、更稳定。
• 新增一次性的年龄、条款与可选匿名分析确认。
• 可在“关于”页面随时开启或关闭匿名使用分析。
• 优化“关于”页面的信息层级、法律链接与联系方式。
• 修复细节问题并提升整体稳定性。
```

### URL 与版权

- 营销 URL：`https://nomenuapp.com/`
- 技术支持 URL：建议新增 `https://nomenuapp.com/support`
- 版权：`2026 [Apple Developer 账户持有人或公司法定名称]`

技术支持页面必须真实存在并显示联系电话、微信号或支持邮箱。正式上线前不要填写不存在的 `/support` 地址；版权主体必须换成开发者账户中的真实个人或公司名称。

## 4. App Review 信息

### 是否需要登录

```text
否
```

当前消费者 App 不需要账号，不要填写演示账号。

### 审核备注（英文）

```text
No Menu is a read-only directory of public craft beer tap lists for bars in supported cities.

The app does not sell alcohol, accept payments, facilitate delivery, or require an account. Users can browse public bar menus, beer details, events, and serving prices.

On first launch, the app asks the user to confirm legal drinking age and review the Terms of Service and Privacy Policy. Anonymous product analytics is optional. The reviewer may choose “仅使用必要功能” (Use necessary features only) to continue without analytics. This choice can later be changed under About > Anonymous Usage Analytics.

The app does not collect raw search terms, names, phone numbers, email addresses, precise location, contacts, photos, or advertising identifiers for analytics. Session replay, touch autocapture, advertising tracking, and error tracking are disabled.

Alcohol-related content is informational. Menu availability, prices, and inventory are supplied by participating bars and should be confirmed at the venue.
```

### 审核联系人

- 姓名：`[真实姓名]`
- 电话：`[含国家/地区代码]`
- 邮箱：`[常用邮箱]`

填写一位能够及时接听电话和回复邮件的真实联系人。

## 5. App Privacy 建议填写

选择“是，我们会从此 App 收集数据”。当前 PostHog 只有用户主动同意后才启动，建议采用以下保守口径。

### Identifiers → Device ID

| 问题 | 选择 |
|---|---|
| 用途 | Analytics |
| 与用户身份关联 | 否 |
| 用于跟踪 | 否 |

App 会生成并持久保存一个随机匿名标识符，用于统计匿名用户的活跃与留存；不使用 IDFA。

### Usage Data → Product Interaction

| 问题 | 选择 |
|---|---|
| 用途 | Analytics |
| 与用户身份关联 | 否 |
| 用于跟踪 | 否 |

包括页面访问、功能使用、搜索结果数量、保存成功/失败等事件；不上传原始搜索词。

### 不选择的项目

- Contact Info
- Precise Location / Coarse Location
- Search History
- User Content / Photos or Videos
- Purchases / Financial Info
- Advertising Data
- Crash Data / Performance Data / Other Diagnostics

当前版本未采集这些数据；PostHog GeoIP、Session Replay、触摸自动采集和错误追踪均关闭。用户选择的城市只是内容筛选条件，不是设备定位。

### Tracking

选择“否”。PostHog 仅用于本 App 内部产品分析，不用于广告，不与第三方数据合并进行跨 App 或跨网站跟踪，因此不需要 ATT 弹窗。

发布前在 PostHog Live Events 再确认一次：没有邮箱、手机号、姓名、原始搜索词、精确位置或广告标识符。

## 6. 年龄分级

在新版年龄分级问卷中建议填写：

- Alcohol, Tobacco, or Drug Use or References：`Frequent`
- Age Assurance：`Yes`
- Gambling / Loot Boxes：`No`
- Unrestricted Web Access：`No`
- User-generated Content / Messaging / Social Media：`No`
- 其他暴力、色情、医疗等内容：`None`
- Made for Kids：`No`

酒款、酒吧酒单和酒精度是核心内容，应按 `Frequent` 而不是 `Infrequent` 填写。由 App Store Connect 自动计算最终分级；新系统通常显示 `18+`，较早系统对应 `17+`。

## 7. 加密出口合规

`app.json` 已设置 `ITSAppUsesNonExemptEncryption = false`。当前 App 只使用系统 HTTPS/TLS，没有自研或非豁免加密。若 App Store Connect 仍询问，选择仅使用豁免加密、不需要上传额外文件。

## 8. 截图

本版本主要变化是性能、隐私和合规，不建议把首次法律确认页作为商店主截图。若现有截图仍与 Build 25 的真实界面一致，可以继续使用。

推荐顺序：

1. 今晚首页与城市酒吧
2. 搜索酒款与酒吧
3. NEW ON TAP 新上酒款
4. 酒吧实时酒单
5. 酒款详情与杯型价格
6. 近期活动

不要上传带有调试数据、不存在功能、相机界面或内部测试标识的截图。

## 9. 发布设置

- Version Release：建议 `Manually release this version`
- Phased Release：首个公开版本或用户量较小时关闭
- Reset Rating：不要重置
- iPhone/iPad on Apple Silicon Mac：未专门测试 macOS 时关闭
- Apple Vision Pro：未测试时关闭

## 10. 中国大陆供应状态

如果计划在中国大陆 App Store 上架：

- 在 App Information 中检查 ICP 备案字段和当前状态。
- 确保备案主体、App 中文名称、Bundle ID 和开发者主体信息一致。
- 若显示 `ICP Filing Number Missing` 或 `Invalid`，该版本即使通过审核也不会在中国大陆可用。

## 11. 提交前最后检查

- [ ] App Store Connect 新建版本 `1.2.3`
- [ ] 选择 Build `25`
- [ ] EAS production 中 PostHog、Supabase、隐私政策变量正确
- [ ] Privacy Policy 与 Terms 页面可公开访问
- [ ] 技术支持 URL 页面真实存在并显示联系方式
- [ ] App Privacy 已更新为 Device ID + Product Interaction
- [ ] 年龄分级问卷按酒类内容 `Frequent` 填写
- [ ] TestFlight 真机验证首次确认的两个选择路径
- [ ] 关闭匿名分析后 PostHog 不再收到新事件
- [ ] 图片、酒单和活动在蜂窝网络及 Wi-Fi 下正常加载
- [ ] 保存酒款图片和酒单图片成功
- [ ] Airplane mode 下没有崩溃
- [ ] 审核联系人、版权主体和中国大陆 ICP 状态已确认

