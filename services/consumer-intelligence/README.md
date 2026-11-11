# No Menu Consumer Intelligence

2026-11-10 联合活动采集补充（ECS 已部署验证）：新增 `campaign_interaction`，现有活动/酒款/导航事件支持可选活动上下文；当前契约共10类。小程序正式版活动采集独立开关已开启，1.5.0已于2026-11-11由用户确认审核通过并正式发布；正式码扫码及release事件对账仍需单独验收。范围、报表及发布顺序见 [联名活动数据追踪](CAMPAIGN_ANALYTICS.md)。

Product Pool 英文风格的数据库归属、ECS 请求/响应契约、小程序现状及 Taplist 对齐步骤见 [Consumer style localization runtime contract](../../docs/CONSUMER_STYLE_LOCALIZATION_RUNTIME.md)。

状态（2026-11-11，Asia/Shanghai）：**E1 与 Recommendation Reason V2 保持不变；Product Pool approved `style_en` 已贯通 Feed。Taplist 已生产 OTA 并获用户验收，小程序1.5.0已获用户确认审核通过并正式发布。**

文档整理日期：2026-11-10。当天已复核线上 Reader、Worker 和匿名 Latest 的 `style_en`；authenticated For You/Reason 的最近服务端验收仍为2026-11-08。以下“已完成”指已记录的实现与验收，不表示推荐转化效果或正式发布验收已经完成。

跨端交付要求：先完成小程序全部相关功能的测试与确认，再完整同步到Taplist。服务使用、请求/响应、身份与事件、异常状态和两端验收清单统一保留在 [客户端接入手册](CLIENT_INTEGRATION.md)，OpenAPI与可执行样例同步维护；不得仅移植UI或将文档完成标为客户端已验收。

2026-11-11发布确认： 2026-11-11（Asia/Shanghai），用户确认小程序1.5.0已通过微信审核并正式发布，取代1.4.0；精确发布时间以微信后台记录为准。Taplist生产OTA及用户验收状态保持不变。Feed与活动采集正式开关已开启；此前295/295预检及ECS接收、去重、入库证据保留原日期。本次仅同步发布状态，不将发布确认等同于新增逐项测试或正式版事件对账。

当前 Reader 为 `e1-style-i18n-e42ce93cf00d`，现有认证后的 For You 默认采用已验收的 Taxonomy V2 + Exact / 有向 Generic Bridge + λ=1.0 风格覆盖重排；Follow 1.15、同店 TAP 排除、canonical 去重及有效上枪资格保持不变。此次只增加可空展示字段 `style_en`，没有新增测试账号白名单或客户端入口。首页最多6款，完整个性化 Feed 最多20款；Latest 独立，rules-v1 保留供关闭 E1 后使用。

新 Snapshot 使用 `reason.version=e1-reason-v2`；旧 Snapshot / Instance 保留原解释。生产运行时为 Node 26.13.0（Linux x64），本次本地验收为 Node 26.0.0（macOS ARM64）。157项基础测试、46项隔离 PostgreSQL 测试通过，旧版9,120份 Golden 与新版224组合均无排名差异。

V1 API 契约最初冻结于2026-10-31；本次仅兼容增加 Reason 可选字段。城市目录、identity-operations、events/batch 与 Feed GET 已开放 HTTPS；Profile/health 保持内网。历史记录不等于当前发布状态；部署版本、真实验收边界和回退命令见 [服务端运行说明](RUNBOOK.md)，实现证据见 [Reason V2 验收报告](../../outputs/recommendation-reason-v2-20261108/recommendation-reason-v2-report.md)。

## 完成范围与剩余事项

| 范围 | 已完成 | 尚未完成 / 验证边界 |
| --- | --- | --- |
| 风格分类与匹配 | 已批准的 Taxonomy V2 修正、canonical 单品覆盖、Exact及有向Generic Bridge | 证据不足的风格仍为Unknown；不以100%覆盖率为目标 |
| 排序与列表 | λ=1.0、Follow1.15、同店TAP排除、canonical去重；首页6款为完整20款前缀 | 不保证凑足数量；真实点击、尝新与TAP转化改善尚未证实 |
| 推荐解释 | Reason V2真实聚合计数、包含Unknown的分母、历史解释固定；服务端真实Instance验收通过 | Taplist 用户使用验收已确认；小程序正式版登录后的端到端展示复验尚待记录 |
| 客户端发布 | Taplist 生产 OTA 已发布并获用户验收；小程序 1.5.0 正式 Feed/活动采集开关已开启 | 用户于2026-11-11确认小程序已发布；Taplist后续按钮增量不自动视为已有OTA内容 |
| 运行保障 | 多Bundle、持久刷新需求、断连恢复、可信部署及E1-aware回退 | 外部告警、自动保留期清理调度、完整数据恢复演练仍有待办；维护工具本身已实现 |
| 效果分析 | 浏览与Feed事件采集、浏览→TAP的Assisted Visit关联计算 | 完整商户报表、可更正/撤销的长期归因结果及真实转化效果验证未完成；关联不能等同于真实到店 |

正式负载与长期容量验收未完成；用户此前已决定不以额外ECS、正式压测或独立生产Shadow阶段阻塞内部测试，不重新将这些列为当前必须启动的工程阶段。

明确暂不实施：E2跨subtype探索、隐式同Family/跨Family回退、为凑满6/20款放宽匹配、门店配额及随机探索。已上线的同style_key软性覆盖重排保持不变；上述内容是产品边界，不是遗漏功能。

下一步优先在现有devtool/真机创建新Instance，检查Reason V2文案、长文本、滚动/切后台及首页/完整Feed的一致性。完整验收口径与运维待办见 [RUNBOOK](RUNBOOK.md) 文末；不新增架构或工程阶段。

## 入口与验证

- [OpenAPI 3.1.1](contracts/openapi.json)：7 个路径、8 个 HTTP operations；地址均为文档占位符。
- [共享 Schemas](contracts/schemas/)：27 个 JSON Schema 2020-12 文件。
- [有效 fixtures](contracts/fixtures/valid/cases.json)：37个样例，含Reason V2 Exact、多个Bridge witness及首页limit=6请求。
- [无效 fixtures](contracts/fixtures/invalid/cases.json)：28 个样例。
- [契约测试](contracts/test/)：初始冻结时108项，包括一项穷举120种可信身份操作排列的 property-style test；当前服务整体测试数量见上方最新状态。

在此目录运行：

```sh
npm ci --ignore-scripts
npm run check
```

单独运行：

```sh
npm run check:openapi
npm test
```

`npm run check` 实际通过后才更新为 Frozen；本次全部通过，无失败或跳过项。
Redocly 负责 OpenAPI 结构、路径和引用校验。其外部 JSON Schema `$id` 的样例校验存在解析限制，
因此媒体样例改由同一个 Ajv registry 严格校验；并非跳过样例验证。
组合 Schema 的 required 约束同样由 Ajv 编译与正反例验证，不采用仅检查局部 properties 的 lint 规则。

## 契约边界

| 接口 | 职责/鉴权 |
| --- | --- |
| `GET /api/feed/v1/new-beers` | For You 必须有有效 consumer token；Latest 可匿名；提供了无效 token 时不静默降为匿名 |
| `GET /api/consumer/v1/cities` | 业务城市目录；公开读取，不依赖 Intelligence 投影 |
| `GET /api/consumer/v1/profile` | 读取本人 Supabase 业务资料 |
| `PATCH /api/consumer/v1/profile` | 本人资料 Merge Patch；不通过分析数据库写入 |
| `POST /api/analytics/v1/identity-operations` | 认证主体提交不可变操作；异步解析身份区间 |
| `POST /api/analytics/v1/events/batch` | 可匿名；逐事件验证、持久化后确认 |
| `GET /healthz` | 进程存活 |
| `GET /readyz` | 本服务存储/schema 可用；不因 consumer 投影过期而使 Latest 整体不可用 |

验证后的 Supabase anonymous consumer token 仍然是有身份的 consumer；这与无 token 的匿名浏览不同。
身份主体不接受客户端 `user_id`，也不能从 user-editable metadata 授权。身份验证服务故障返回 503，不伪装成 401。
历史事件不能被上传请求当时的账号覆盖。

## Feed 与分析彼此独立

仅在允许 analytics 时同时发送 `X-Installation-ID` 和 `X-Analytics-Session-ID`；少一个返回 400。
不开启分析时两者都不传，Latest 和有 consumer token 的 For You 仍可正常使用。
不能为使用 Latest 强制生成/上传永久 installation identifier。

instance 保存 token 派生的 owner（若有）及分析 Header 对（若有）。没有分析绑定时，不能记录该 instance 的 Feed 事件。
事件里的 installation/session 必须与原绑定一致，item 必须属于 instance；归属冲突不能后写覆盖。
这些匿名标识只能校验声明的一致性，**不是身份凭证或防伪证明**，更不能授权访问私人资料。
允许跨域时显式放行这两个 Headers；Feed 响应 `Cache-Control: no-store`。

For You 首页与完整列表使用不同 instance，但可引用同一 snapshot；首页 instance 只保存首次返回的前缀。
同 instance 可重试更短前缀，不能扩展到未返回的 item；扩大列表、切换身份/城市/来源、刷新展示使用新 instance。
从 cold-start/building/empty 刷新到新结果同样创建新 instance，不回写旧成员列表。

## Recommendation Reason V2

`reason.code` 保留 `style_exact` / `style_bridge`，客户端可继续只渲染 `reason.text`。新增 `version` 和 `evidence`；旧解释允许不含这两个字段。契约见 [reason.schema.json](contracts/schemas/feed/reason.schema.json)。

- Exact 使用同一 `style_key` 的 canonical 去重 TAP 数；宽泛类别和具体风格由固定中文展示清单明确区分，不从 `.generic` 后缀推断。例如“你记录过15款拉格类酒”“你记录过4款科隆啤酒”。
- Bridge 仅累加已授权有向关系的实际 witnesses，逐风格提供 `unique_taps`，文案明确“关联风格”，不宣称已喜欢具体 subtype。超过60字时文字汇总，结构化 witnesses 仍完整保留。
- `evidence` 包含候选 key/中文标签/粒度、`matched_unique_taps`、`total_unique_taps`、`matched_percentage` 及聚合 witnesses。分母是同一 Snapshot 的去重 TAP 总数，包括 Unknown；百分比为 `100 × matched / total`，不代表喜欢概率，Follow 与 λ 不计入款数。只有1款证据时如实返回1款。
- Snapshot 生成时固定全部 Reason，并将 Reason 版本纳入签名。读取历史 Instance 不按当前 TAP 重算；历史比例不可改用当前 `personalization.unique_tap_count` 作分母。旧缓存尚未刷新时仍可返回旧 Reason。
- 不返回个人 TAP 逐条记录或内部 score/tier；匿名 Latest 不返回个人证据。展示标签语义变更需同步提升 Reason 版本，不修改 Taxonomy Bundle。

## 事件 registry

公共 envelope：`event_id / event_name / schema_version / occurred_at / session_id / session_started_at`。
普通事件还必须明确 `source` 和可空 `selected_city_code`；不知道城市时用 null，不猜。
Batch 的 installation 是事件原始安装上下文，不随上传账号改变。

| 事件 | 专属 required | optional |
| --- | --- | --- |
| `beer_opened` | 至少一个 `product_id / source_drink_id` | 明确的 `tenant_id` 上下文；不能把酒款来源店自动当成浏览店 |
| `bar_opened` | `tenant_id` | 无 |
| `search_result_opened` | `result.type` 对应的酒/店/活动标识、`display_position` | `search_id`、酒款结果明确的门店上下文 |
| `activity_opened` | `activity_id` | `tenant_id` |
| `city_changed` | 可空 `from_city_code`、`to_city_code` | 无 |
| `map_navigation_clicked` | `tenant_id / provider` | 无 |
| `feed_shown` | `feed.feed_instance_id` | 无 |
| `feed_item_impression` | instance/item/display_position、`properties.visible_duration_ms / visibility_threshold` | 无 |
| `feed_item_opened` | instance/item/display_position | 无 |

每个事件分支固定 `event_name` 和 `schema_version=1`，用 `oneOf` 汇总，不使用虚构的双字段 discriminator。
业务活动 ID 使用 `activity_id`；现有 We 分析的 `event_opened` 命名由后续 adapter 保持，不在本次修改。
`source` 为开放字符串（1–64 字符），未知合法值可保存并标记未识别；没有全站 impression 扩展。
Feed 曝光要求卡片至少 50% 可见、连续至少 750ms，同 installation/instance/item 只计一次。
`feed_shown` 按 installation/instance 去重；普通重复点击使用不同 event ID 保留。

禁止附带 user_id、token、原始搜索词、身份 link ID 或由客户端指定 Feed 模型/排名等字段。
`display_position` 只放在 `feed` 对象；`original_rank`、实体、模型、城市等由历史 instance/items enrich。
未知事件名称/版本逐事件拒绝；不是让整批失败。

## 时间、分页与历史城市

- `server_time`：生成 HTTP 响应的时间。
- `snapshot.generated_at`：实际完成榜单计算的时间。
- `data_as_of`：生成返回榜单/列表的确切业务 generations 中最老的 source timestamp；旧 snapshot 不借用新同步时间。
- 无榜单的 cold-start/building 响应，使用该次资格判断所依赖投影的时间下界。
- catalog 超过 10 分钟未同步：两种 Feed 均 503；consumer 超过 10 分钟：仅 For You 503。
- 投影正常而 snapshot 落后：可返回 stale，并按当前业务资格过滤；请求期间不重新排名。
- `pagination_expires_at = created_at + 30 minutes`；过期返回 410。
- `record_retention_until = created_at + 30 days`；不能因为分页过期就删除。
- Latest 固定初始 manifest；新增酒等下次刷新，途中失效酒跳过，原 rank 可有空洞。
- summary 仅第一页返回，以创建时列表和城市时区统计；不因下枪改写，14×24h 可跨 15 个日期。

instance 内部快照：`home_city_code_at_creation / away_city_at_creation / home_city_source_as_of`。
它们只描述 Feed 创建时服务器可知的可信资料，不声称无同步延迟，不返回给客户端，不参与排名。
无认证主体、无可信可用资料或 home city 未设置时，away-city 为 null，不能当成本地 false。
Profile 修改、重新登录、重新解析身份、延迟上传均不得回写这些字段。
普通历史事件没有同期可信上下文时 `away_city=null`；不使用上传时 Profile 推测，不建设 Profile history。

## Profile 与城市

城市目录提供 `city_code / source_city / display_name / timezone`，不能客户端自行 lowercase，也不创建第二套 Intelligence 城市定义。
PATCH 媒体类型为 `application/merge-patch+json`：省略不改，`home_city_code:null` 清除，{} 不产生写入。
用户名使用生产已有的 `consumer_username`（2–24 字符，既有字符/保留名/唯一性约束），不另设 display_name。
用户名不能 null；未知/只读字段拒绝；组合修改原子成功或失败。旧用户名 RPC 必须保留 home city。
设置常驻城市不切换浏览城市；常驻城市为空不影响 >=5 unique TAP 的资格。

## Batch 确认语义

外壳最多 20 个事件、64 KiB；单事件最多 8 KiB，均按 UTF-8 字节数。最多延迟 7 天上传，未来时钟容差 5 分钟。
OpenAPI 的 Batch 外壳有意允许尚未通过验证的 event objects：逐条使用共享 registry 校验才能实现 partial success。
没有合法 event_id 的拒绝记录通过 `event_index` 定位，`event_id=null`。

有效事件及去重键先原子提交，再 202 accepted；坏事件独立 rejected。全无效可 202，但 accepted 为空且不写入。
提交失败/结果不确定返回 503、不确认成功；不代表肯定没写入。客户端用原 event IDs 重试，已提交内容变成 duplicates。
已确认的重复事件无需因后来超出上传窗口而再次拒绝。同 ID 不同内容拒绝，不覆盖历史。
instance 查询等存储依赖故障返回可重试失败，不误判为永久无效引用。

## 兼容性与未完成事项

客户端只渲染服务器顺序和 `reason.text`，不依赖具体 score、模型、reason code 或 style 值。
未知 optional response field 忽略；未知 empty reason 使用通用空状态。reason 是不含标记/URL的一行纯文本，最多 60 个 Unicode code points。
排名实现保持已批准口径：最近 14 天 exact active 生命周期，`new/available/low`、公开在枪；不考虑换桶业务。
V1 保持 style count/max × follow 1.15；E1 在授权证据评分之上维持 Exact 优先于 Bridge，并对完整合格池按同 style_key 的 λ=1.0 软性覆盖重排。同 beer/venue 已 TAP 排除，跨店保留候选，最终 canonical 去重，最多20条。
Latest 保留全部合格候选，包括无法归类的 style；API 不运行排名计算。

`contracts/test/reference/` 是可执行契约 oracle，不是生产代码：

- Identity oracle 输入已经过认证/可信时间验证。实际实现额外要求服务端认证观察边界；早于此边界的匿名事件不补归。真实客户端登录/离线适配仍未联调。
- `test/integration.test.js` 另行验证真实 PostgreSQL 并发、事务回滚及 COMMIT 返回前后故障注入；不等于云数据库断电/主备切换演练。
- 参考客户端兼容测试不替代真实 iOS/小程序 adapter 测试。
- Profile/城市及导出 RPC 已于 2026-11-04 应用到 Supabase，另以修正迁移撤销 Profile RPC 的默认匿名执行权；隔离 fixture 覆盖默认授权场景。没有重放完整生产迁移历史。
- Assisted Visit 后台已实现并经过本地测试：以 TAP `created_at` 回溯 24/48/72 小时，按同用户/门店/06:00 营业日合并；延迟事件补算、身份冲突撤回，不代表已验证到店。完整口径及限制见 `RUNBOOK.md`。
- RDS 初始化、ECS Node 26 内部 API、真实业务同步和 Feed 验证已完成；API 开机启动、Worker 定时同步已启用，仅监听本机。真实用户鉴权/Profile/For You 已联调通过；公网 Feed 路由已开放；服务健康外部通知及完整数据恢复演练不因本次 Reason 更新视为完成。事件 90 天/instance 30 天维护命令已部署并完成生产只预览检查，未执行删除或启用自动调度。实际部署状态见 `RUNBOOK.md`。

所有 HTTP handler 复用共享 schemas；不能把 contract frozen 或本地测试通过理解为 production ready。

数据维护：`src/maintenance.js retention|erase-user [--apply]` 默认仅预览，执行条件、身份抑制、备份恢复限制和保留语义见 [运行说明](RUNBOOK.md)。没有新增公共 API 或更改 rules-v1。

## 可移植测试与私有回放

`npm run check` 的契约、单元与风格映射测试使用仓库内 fixtures；`test/e1/fixtures/` 仅包含已审核的风格映射及必要的商品覆盖规则，不含用户行为历史。

两项 224 榜单生产回放检查另需本地 `outputs/recommendation-v2-replay-20261105/source-snapshot.json` 和 `outputs/e1-taxonomy-lambda-joint-20261107/ranking-diff.json`。缺少输入时明确标记 skipped，其余测试照常执行；不得将这些私有导出提交 Git。
