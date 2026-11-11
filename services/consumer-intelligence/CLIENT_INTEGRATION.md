# 小程序 → Taplist：Consumer Intelligence 接入与交付

2026-11-10 联合活动采集补充（ECS 已部署）：新增 `campaign_interaction`，现有活动/酒款/导航事件支持可选活动上下文；当前契约共10类。小程序正式采集独立开关已开启；已验证公网接收、去重及入库，手机各操作的覆盖以验收记录为准。范围、报表及发布顺序见 [联名活动数据追踪](CAMPAIGN_ANALYTICS.md)。

文档更新：2026-11-10。本文覆盖推荐、城市/Profile、身份关联与事件采集契约；没有将其他产品模块视为已同步。Taplist 的 Feed、Reason、英文风格与第一方事件已做本地接入，**待用户测试，未发布**；联合活动前台不迁移，Profile 公网路由不新增。范围与待执行验收见 [Taplist 接入记录](../../taplist-mobile/docs/CONSUMER_INTELLIGENCE_PORT_2026-11-10.md)。后续服务端英文风格部署记录见 [运行时文档](../../docs/CONSUMER_STYLE_LOCALIZATION_RUNTIME.md)，不将服务端或小程序验收等同于 Taplist 验收。

## 1. 保留的实现依据

- [OpenAPI](contracts/openapi.json)：所有方法、路径、请求媒体类型、鉴权、HTTP状态、响应字段与完整JSON示例。servers仍为占位地址，实际开放范围以下表为准。
- [共享JSON Schema](contracts/schemas/)：字段类型、必填、可空、枚举、长度及额外字段规则的权威定义；不靠客户端从样例猜类型。
- [有效样例](contracts/fixtures/valid/cases.json)、[无效样例](contracts/fixtures/invalid/cases.json)：可执行契约。保留V1、E1 Reason V2 Exact/多witness Bridge、单款、cold start、building、stale、空列表、未知未来值等用例。UUID、日期和模型摘要是示例，不能硬编码到真实请求。
- [服务README](README.md)：推荐规则、Reason和隐私边界；[RUNBOOK](RUNBOOK.md)：部署摘要、备份、回退及验收日志。
- [跨端酒款列表约定](../../docs/CONSUMER_BEER_LIST_UI.md)：复用各客户端酒款行。早期两款纵向首页为历史方案，当前产品规则为横向最多6款。
- [11月8日处理器输出](../../outputs/recommendation-reason-v2-deployment-20261108/real-api-output.json)：真实home/feed证据，只有处理器业务响应，HTTP公共envelope由server补充。它不能替代小程序公网登录端到端验收，也不能作为其他用户的测试画像。

每次小程序验收后的行为调整，必须同步本文、相关OpenAPI/Schema/样例和验收记录，再交付Taplist。历史部署与原始验收证据保留，不覆盖成“最新版本通过”。不要在文档存token、密码、service-role key或个人逐条TAP历史。

## 2. 服务、地址与权限

当前HTTPS基址：`https://nomenuapp.com`。公网客户端只通过已有HTTPS入口访问，不直连ECS端口、CI数据库、Worker或Bundle文件。以下开放范围依据现有部署记录，本次未重新探测生产。

| 方法与路径 | 公网状态 / 身份 | 用途与请求/响应定义 |
| --- | --- | --- |
| GET `/api/feed/v1/new-beers` | 已开放；for_you需consumer Bearer token，latest可无token | [request](contracts/schemas/feed/request.schema.json)、[response](contracts/schemas/feed/response.schema.json) |
| GET `/api/consumer/v1/cities` | 已开放，可匿名 | 无body；[cities](contracts/schemas/consumer/cities.schema.json) |
| GET `/api/consumer/v1/profile` | 服务已实现，当前未开放公网；需认证 | 无body；[profile](contracts/schemas/consumer/profile.schema.json) |
| PATCH `/api/consumer/v1/profile` | 同上；`application/merge-patch+json` | [patch](contracts/schemas/consumer/profile-patch.schema.json) → 同profile响应 |
| POST `/api/analytics/v1/identity-operations` | 已开放；需认证 | `application/json`；[operation](contracts/schemas/identity/operation.schema.json) → [accepted](contracts/schemas/identity/accepted.schema.json)，202 |
| POST `/api/analytics/v1/events/batch` | 已开放，可匿名；采集需遵循用户同意 | `application/json`；[batch](contracts/schemas/events/batch.schema.json) → [batch-response](contracts/schemas/events/batch-response.schema.json)，202 |
| GET `/healthz`、`/readyz` | 内网运维，不作为客户端依赖 | 不用于判断用户是否有推荐 |

Profile接口存在于契约不等于已经可公网调用。Taplist后续必须核对小程序实际使用的既有业务接口；需要开放新路由时单独明确，不能自行接到内网地址。本轮没有改变路由。

Feed/城市/Profile/analytics成功响应包含 `api_version="1"`、`requestId`、`server_time`；错误同样带envelope及 `code/message/retryable`。`X-Request-ID`用于问题追踪，不是事件去重ID；当前server生成自己的requestId，不依赖传入值回显。响应 `Cache-Control: no-store`，不将用户推荐跨账号共享缓存。

认证沿用Taplist现有consumer会话：`Authorization: Bearer <access_token>`。不得使用service-role key或自己传user_id/model_version/白名单。过期token通过已有登录模块刷新；换号/退出清理旧展示上下文。无token的Latest与有效Supabase匿名consumer会话是不同身份；提供无效token会401，不静默降为匿名。

允许analytics时，Feed同时发送两个UUID Header：`X-Installation-ID`、`X-Analytics-Session-ID`；拒绝采集时两者都不发送，Feed仍可使用。只发送一个为400。这些标识不是认证凭据；没有创建时绑定的Instance不得补采Feed事件。Web存在Origin时须符合既有CORS配置，不自行扩大允许来源。

## 3. Feed请求与Instance生命周期

首页：

```http
GET /api/feed/v1/new-beers?city_code=shanghai&mode=for_you&surface=home&feed_instance_id=<new-uuid>&limit=6
Authorization: Bearer <consumer-access-token>
```

完整个性化列表使用**另一个新UUID**：

```http
GET /api/feed/v1/new-beers?city_code=shanghai&mode=for_you&surface=feed_page&feed_instance_id=<another-new-uuid>&limit=20
Authorization: Bearer <consumer-access-token>
```

| 参数 | 规则 |
| --- | --- |
| city_code | 必填，取城市目录的稳定code，不从展示城市名自行lowercase |
| mode | 必填：for_you / latest |
| surface | 必填：首页home，完整页feed_page；重试不能更换 |
| feed_instance_id | 必填，由客户端生成UUID；同一次请求重试保留，新的展示/刷新生成新的 |
| limit | for_you默认20、范围1–20，首页明确传6；latest默认20、上限50，产品首屏使用20 |
| cursor | 仅Latest后续页传服务端next_cursor；视为不透明值，不解码或改写 |

同Instance绑定owner、city、mode、surface及analytics Header对；身份/城市/Tab/分析上下文变化时新建Instance。首次for_you limit=6后不能拿同一Instance扩大到20（409）；可重试更短前缀。刷新cold-start/building/empty到新结果也要新Instance。

首页与完整页可引用同一Snapshot；服务端已有同Snapshot前缀一致性保证。**请求没有snapshot_id参数**：两次请求之间Worker更新时可能得到不同Snapshot，应记录返回ID，不伪称它们仍是同一快照，也不擅自添加锁定快照参数。验收前缀一致性时先核对Snapshot ID。

Latest首屏示例：

```http
GET /api/feed/v1/new-beers?city_code=shanghai&mode=latest&surface=feed_page&feed_instance_id=<new-uuid>&limit=20
```

后续页保持Instance、身份、城市、surface及analytics上下文，追加 `cursor=<URL-encoded-next_cursor>`。仅在 `page.has_more=true` 时继续；分页有效期30分钟，410后创建新Instance。列表固定初始manifest，只移除失效项，不插入新上枪酒；新酒通过用户刷新获得。历史Instance留存30天用于事件归属，不能将分页过期误认为历史记录已经删除。

网络重试保留原Instance ID；用户主动刷新才新建。快速切城/Tab/账号时丢弃旧请求的迟到响应，不能覆盖新页面。用item_id作为本次列表身份，不用酒名或product_id跨Instance合并列表。

## 4. 响应、状态与展示

完整字段见response及[item Schema](contracts/schemas/feed/item.schema.json)，完整JSON见OpenAPI的200 examples。新增可选字段必须容忍；未知ranking_version、style_family、reason code和empty_reason不能使页面崩溃。

| 字段组 | 客户端使用方式 |
| --- | --- |
| city_code/mode/surface/feed_instance_id | 校验当前请求上下文及事件绑定 |
| ranking_version | 保存诊断上下文，不能据字符串重排或决定显示资格 |
| data_as_of | 该返回列表所用数据的时间下界，不是当前请求时间 |
| personalization | for_you含status、unique_tap_count、required_tap_count；Latest为null |
| snapshot | for_you eligible含state、snapshot_id、model_version、generated_at；cold_start及Latest为null |
| items/total_items | 渲染实际items，不凑满6/20；total_items不等于当前可见数组长度，历史撤下时不可据此补位 |
| summary | Latest第一页的初始manifest统计，后续cursor页为null；for_you为null |
| page | Latest含as_of/has_more/next_cursor/expires_at；for_you为null，不做cursor无限加载 |

Item包含 `item_id/rank`、`tenant_id/tenant_slug/tenant_name`、`source_drink_id/product_id`、`beer_name/brewery/style/style_family/image_url`、`current_cycle_started_at/reason/deep_link`。product_id、brewery、style、style_family、image_url、reason允许null；可选英文展示字段见Schema，不假定必有。缺图/英文缺失要有既有客户端fallback，不能猜风格。

保留服务端顺序，rank为原排名，失效项移除后可能有空洞。`deep_link`当前格式为 `nomenu://bars/{tenant_slug}/drinks/{source_drink_id}`，映射到Taplist已有安全导航；校验scheme/路径，不执行任意内容。详情需要的店铺与酒款标识来自Item，不用酒名模糊匹配。

| 状态 | 响应与行为 |
| --- | --- |
| 未登录for_you | 401，使用现有登录引导；Latest仍可匿名访问 |
| cold_start | 200、snapshot=null、items=[]、empty_reason=null；维持≥5 unique TAP资格，不把没匹配到风格等同未登录 |
| building | 200、snapshot.state=building、refresh_pending；无结果，不用占位酒款填充；之后刷新用新Instance |
| fresh / stale | 都可有可展示items；stale不在客户端重排，也不冒充实时榜单 |
| 0/1款 | 正常成功响应；1款直接显示，不为凑6新增推荐；空状态使用empty_reason |
| 已知空原因 | no_recent_candidates、no_matching_style、insufficient_style_history、refresh_pending；未知值用通用空状态 |

错误处理：400修正参数，不原样死循环；401使用现有会话刷新/登录；403不得绕过拒绝；409 INSTANCE_CONTEXT_CONFLICT以正确上下文新建Instance；410检查code，过期可刷新，E1_BUNDLE_REVOKED不能靠重试旧Instance恢复；429遵循Retry-After；503受控展示暂不可用并有界重试，不能在客户端静默重算V1/E1。catalog过期影响两种Feed，consumer过期仅影响for_you，Latest可能继续可用。具体错误包见 [error Schema](contracts/schemas/common/error.schema.json)。

## 5. Reason V2

中文继续渲染服务端 `reason.text` 为纯文本；不解析HTML/Markdown或自动链接。reason=null隐藏解释。英文复用运行时文档中已审核的 Reason V2 evidence/标签呈现规则，不自行发明翻译或推断口味。旧Reason只有code/text也必须工作；未知、证据不完整或标签未审核时回退原 text，不能强制旧Instance具备新字段。

```json
{
  "code": "style_exact",
  "version": "e1-reason-v2",
  "text": "你记录过15款拉格类酒",
  "evidence": {
    "candidate_style_key": "lager.generic",
    "candidate_style_label": "拉格类酒",
    "candidate_granularity": "broad",
    "matched_unique_taps": 15,
    "total_unique_taps": 126,
    "matched_percentage": 11.904761904761903,
    "witnesses": [{"style_key":"lager.generic","style_label":"拉格类酒","granularity":"broad","unique_taps":15}]
  }
}
```

Exact具体风格计相同key，宽泛风格明确称“类酒”；granularity由服务端固定标签给出，不推断`.generic`。Bridge code为style_bridge，可能有多个witness；例如3款西海岸IPA+2款浑浊IPA，只表达关联，不称用户已喜欢候选subtype。完整多witness样例已保存在OpenAPI与可执行fixtures。

数量来自同Snapshot的canonical去重画像；total包含Unknown。百分比为0–100范围的 `100*matched/total`，不是0–1概率。客户端可为显示舍入，但不能用当前personalization数量重新计算历史比例，不能把Follow1.15或λ=1.0计入款数。只1款也如实显示。文字超60字时服务端汇总，结构化witnesses仍完整。不要把证据再次发进analytics，或请求导出个人逐条TAP来“校验”文案。

## 6. 城市与Profile

城市响应为envelope + `cities[]`，每项 `city_code/source_city/display_name/timezone`。浏览城市与home_city_code分离，设置常驻城市不能强行切换当前浏览城市。

Profile响应为envelope + `consumer_username/is_default/home_city_code`，常驻城市可null。PATCH省略字段保持原值，`{"home_city_code":null}`清除，`{}`不写；用户名不可null，未知字段400，重名409，错误媒体类型415，组合更新原子化。服务端Profile公网未开放；同步时保留既有可用业务路径并明确映射，不因本文新增未经授权请求。

## 7. 身份、事件与重试

只有用户允许analytics时才采集、排队及上传；未同意不影响Feed。身份变化/退出时轮换analytics session；旧事件保留发生时的installation/session，不能用当前账号重标。旧identity operation不能在另一个账号下重试。身份归属由服务端可信观察决定，不能将登录前匿名历史自动补归。

Identity body为 `operation_id/action(link|unlink)/installation_id/session_id/session_started_at/occurred_at`，不带user_id。完整请求与202响应在OpenAPI；同operation_id、相同内容及主体为duplicate，改内容/主体409，503可能已经提交，重试保留原ID。

Batch body为 `batch_id/installation_id/client/events[]`；client填写真实 application/platform/app_version，不复制小程序wechat标记。使用当前Schema允许值并记录Taplist实际版本。上限20事件、整个UTF-8 body 64KiB、每事件8KiB；最多延迟7天，未来容差5分钟。通用事件含event_id、event_name、schema_version=1、occurred_at、session_id、session_started_at；普通事件另含source/selected_city_code，专属字段见 [事件Schema](contracts/schemas/events/event.schema.json)。

必须同步已有九类事件：beer_opened、bar_opened、search_result_opened、activity_opened、city_changed、map_navigation_clicked、feed_shown、feed_item_impression、feed_item_opened。各事件独立required/optional字段与完整合法样例已在OpenAPI和fixtures保留，不能只迁移Feed点击而遗漏其他已验收事件。

Feed事件用 `feed.feed_instance_id`；曝光/打开还需 `item_id/display_position`，不要重复塞入普通事件source或由客户端指定模型、score、rank。display_position为用户看到的实际位置，原rank由服务端历史Instance确定。feed_shown按installation+instance去重；曝光按installation+instance+item去重，至少50%可见且连续750ms，properties记录visible_duration_ms/visibility_threshold。后台、切Tab、进详情时暂停计时；重复合法点击生成不同event_id。历史Instance无analytics绑定时不补采。

Batch 202返回 `accepted[]/duplicates[]/rejected[]`，rejected含event_index、可空event_id、code、retryable及可选field。只清除已确认accepted/duplicates；区分永久拒绝与可重试项，不能把202理解为整批全成功。传输失败/503或提交结果不确定时重试原event_id与原内容，不生成新ID；batch_id不是去重键。失效的分页不妨碍仍在保留期内的历史事件归属。不得把客户端上传token当作旧事件发生时身份。

## 8. 小程序验收 → Taplist移植清单

以下保留为跨端验收清单。Taplist OTA已获用户使用验收；小程序最终提审包仍须独立验证，未补做的边界不能据此自动标记通过。每一项需分别保留“小程序结果/构建版本/证据”和“Taplist结果/构建版本/证据”；测试账号用匿名标记，保留脱敏requestId、Instance/Snapshot ID、时间、预期/实际、失败原因，不存token。

| 功能/场景 | 两端必须一致的验收内容 |
| --- | --- |
| 会话与城市 | 登录/退出/换号/过期刷新；城市目录、浏览城市与常驻城市分离；串号和迟到响应隔离 |
| 首页与完整Feed | limit6/20、新旧Instance规则、同Snapshot前缀；0/1/不足20款、真实排序保持 |
| Reason | Exact宽类/具体、Bridge多witness、单款证据、旧版本/null兼容、长文本；历史Reason不漂移 |
| Latest | 匿名、分页游标、30分钟过期、下枪过滤、刷新看到新候选；无个人证据 |
| 状态与异常 | cold_start/building/stale/空结果、401/403/409/410/429/503、断网及有界重试 |
| 详情与视觉 | 店铺/酒款导航、缺图、中英文长名称、横滑、切后台，不错误归属到其他venue |
| analytics | 同意/拒绝、身份轮换、九类事件、50%/750ms、去重、部分成功、离线重试和历史归属 |
| 服务边界 | 沿用服务端排序/Taxonomy/Bridge，不复制到客户端；Profile公网可达性单独确认 |

小程序全部确认后，以已验收版本为移植基线，将对应能力完整同步到Taplist既有组件、认证、请求层和导航中；不是只复制UI。差异必须逐项记录，未实现/未验收不能标为完成。Taplist完成同一清单后再讨论发布；内部测试授权不自动成为消费者正式发布授权。

更新文档与fixtures后在本服务目录运行 `npm run check`。此次仅文档/契约示例检查不替代真机测试；没有新增数据库Schema、服务或推荐逻辑，也不要求新增工程阶段。

2026-11-11小程序发布确认： 2026-11-11（Asia/Shanghai），用户确认小程序1.5.0已通过微信审核并正式发布，取代1.4.0；精确发布时间以微信后台记录为准。Taplist生产OTA及用户验收状态保持不变。Feed与活动采集正式开关已开启；此前295/295预检及ECS接收、去重、入库证据保留原日期。本次仅同步发布状态，不将发布确认等同于新增逐项测试或正式版事件对账。
