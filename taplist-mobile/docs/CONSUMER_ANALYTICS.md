# No Menu 消费者行为分析

最后更新：2026-10-09（Asia/Shanghai）

本文是 Taplist iOS、微信小程序和 Taplist Web 产品分析的当前事实来源。历史基线见
[`ANALYTICS_BASELINE_2026-10-08.md`](ANALYTICS_BASELINE_2026-10-08.md)。

## 当前状态

| Surface | 状态 | 数据边界 |
|---|---|---|
| Taplist iOS | P0 与 P1-A 已通过 production OTA 发布并验证 | 只有用户打开「匿名产品分析」后才向 PostHog 发送事件 |
| 微信小程序 | P1-B 代码与体验版二维码链路已验证；`1.2.2` 尚待微信审核和正式发布 | 匿名事件使用本地随机 visitor；登录后关联现有 Supabase user ID |
| Taplist Web | 生产二维码落地页事件已验证 | PostHog cookieless；不会与 iOS 或小程序匿名 ID 自动合并 |
| Supabase | TAP、关注、账号和门店等业务事实来源 | 不用 PostHog 事件替代业务记录或计算精确用户总数 |

iOS production OTA：runtime `ee7f9707efde823e12a9ee09ecebacef7af96f79`，update group
`d75f688a-bb90-422a-a6ba-0455a0e1c24c`。该 OTA 只包含 JavaScript/TypeScript 兼容修改。

## 已完成的事件管道

| 能力 | iOS | 微信小程序 | Web | 结论 |
|---|---|---|---|---|
| App / 页面打开 | `Application Opened`, `screen_viewed` | `Application Opened`, `screen_viewed` | 页面专用 view 事件 | 已完成 |
| 酒吧打开 | `bar_opened` | `bar_opened` | `web_bar_viewed` | 已完成；名称按 surface 保留 |
| 酒款打开 | `beer_opened` | `beer_opened` | 不适用 | 已实现 |
| 搜索 | `search_completed` | `search_completed` | 不适用 | 已实现；不上传搜索词 |
| 活动打开 | `event_opened` | `event_opened` | 不适用 | 已实现 |
| 门店二维码入口 | 不适用 | `qr_entry_opened` | `web_bar_viewed` | 已真机验证 |
| TAP | `drink_light_started/succeeded/failed` | 同名事件 | 不适用 | 已实现；Supabase 才是业务事实来源 |
| 地图导航意图 | `apple_maps_opened` | 尚未埋点 | 不适用 | 部分完成 |
| Push 打开 | 尚未埋点 | 不适用 | 不适用 | 未完成 |
| 列表/card impression | 尚未埋点 | 尚未埋点 | 尚未埋点 | 未完成；`screen_viewed` 只表示页面曝光 |

“核心事件管道完成”只指匿名身份、页面浏览、酒吧/酒款打开、二维码入口和 TAP 行为可以发送到
PostHog。不要把它表述为 impression、navigation、push open 全部完成。

## 匿名身份与会话

### Taplist iOS

- 分析开关保存在设备的 `@taplist/analytics_enabled_v1`，不写入 Supabase。
- 未打开分析的用户不发送 PostHog 行为，因此 PostHog 用户必须称为“可观测用户”，不能代表全部用户。
- 打开分析后，现有、新建匿名 Supabase session 以及 Apple 身份更新会以同一 Supabase user ID
  执行 identify；退出登录时重置 PostHog 身份。
- 无法准确统计有多少安装打开或关闭了分析开关；这是刻意的数据最小化边界。

### 微信小程序

- 每个安装生成并持久保存随机 `mini_` visitor ID。
- 30 分钟无活动后轮换 session，并发送同一个 `$session_id` / `session_id`。
- 未登录事件设置 `$process_person_profile=false`；微信消费者登录后才关联现有 Supabase user ID。
- 退出或 session 失效时重置身份并轮换匿名 visitor。

### Taplist Web

- 使用 PostHog cookieless 模式；`Distinct ID=$posthog_cookieless`，设备值仅用于该 cookieless 会话。
- Web、iOS、小程序属于不同 surface，匿名 ID 不能跨端拼接成同一个人。
- 应按入口、门店、二维码和时间窗口分析跨端转化，不声称实现确定的个人级跨端归因。

## 二维码事件语义

永久门店码 `FR73UGDP` 的体验版验证链路如下：

```text
Application Opened
  entry_path=pages/bar/bar
  wechat_scene=1047
    ↓
qr_entry_opened
  bar_slug=zj-jx-didi
  placement=venue
    ↓
bar_opened
  bar_id=ca8e0e81-409a-44e1-a5df-99bb3e0748e5
  bar_slug=zj-jx-didi
  source=qr
```

三条事件在真机测试中具有相同 distinct ID 和 session ID。`qr_entry_opened` 只有在永久二维码通过
服务端成功解析后才发送；它表示“有效二维码入口已打开”，不表示到店。

Web 事件的含义不同：

- `web_bar_viewed`：带有效二维码归因的 Web 酒吧页已加载。
- `wechat_miniprogram_code_viewed`：网页已经展示小程序码，不表示用户扫码或小程序成功打开。
- `follow_cta_viewed` / `follow_cta_clicked`：关注引导已展示 / 被点击。
- `app_open_clicked`：网页上的 App 打开操作被点击，不表示安装或 App Store 转化完成。

Web 与小程序可以通过 `tenant_slug`、二维码编号和时间窗口做汇总分析，但不能把两个 cookieless / anonymous
distinct ID 当作同一用户。

## 公共属性与隐私边界

客户端事件在可用时包含：

- `analytics_schema_version`
- `surface`、`platform`
- `app_version`、`build_number` 或小程序环境
- `city`
- `session_id` / `$session_id`
- `is_internal`

不得发送：搜索原文、精确经纬度、完整地址、手机号、邮箱、微信登录 code、access token、refresh token、
Apple contact data 或完整私人 TAP 历史。GeoIP、session replay、surveys、remote config 和自动错误采集保持关闭，
除非隐私与产品要求被明确重新评审。

## 尚未完成

1. `push_opened`：iOS 通知当前能导航到酒款或酒吧，但没有独立打开事件，`fromPush=1` 也尚未进入分析属性。
2. 跨端 navigation：iOS 有 `apple_maps_opened`，小程序 `wx.openLocation` 尚未埋点；未统一事件名。
3. Item impression：目前只有页面级 `screen_viewed`，没有酒吧卡片、酒款卡片的曝光事件。数据量和分析目的明确前不默认增加。
4. 到店：未收集，不从分享、二维码、地图打开或定位推断到店。
5. 小程序正式发布：`1.2.2` 体验版 QR 链路已通过，仍需微信审核和手动发布。

## 查询与解释规则

- PostHog 用于可观测行为和漏斗；Supabase 用于 retained TAP、账号、关注和门店等事实。
- 生产分析默认排除 `is_internal=true`、`environment=trial/develop`。
- `drink_light_succeeded` 表示 RPC 成功；必须结合 `created_drink`、`created_venue` 判断是否新建记录。
- QR、地图、分享、App 打开按钮都是意图或入口信号，不是到店、安装或消费证明。
- 不使用小红书作为可确定归因来源；无法携带可验证参数的搜索转化只能观察总量变化。
