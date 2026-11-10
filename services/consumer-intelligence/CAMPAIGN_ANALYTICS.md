# 联合活动数据追踪与案例复盘

2026-11-10（Asia/Shanghai）：ECS 活动采集已部署，公网接收、幂等去重及 RDS 入库验证通过，并已核对17条真实 trial 操作。小程序正式采集开关已开启，正式活动码已配置；1.5.0准备提审，尚未确认提交或正式发布。Taplist 的活动首页入口、内容与全部图片已 OTA，并由用户确认验证完成。新增一个 `campaign_interaction` 事件族，复用已有活动/酒款/导航事件。无 Supabase/RDS 表结构迁移，无新增公网报表接口，不更改普通活动、核销、订单或推荐策略。

## 数据路径及范围

小程序 → 现有 ECS `/api/analytics/v1/events/batch` → 私有 `ci.events` → 内部只读汇总。

每个事件仍使用原有安装标识、session、event_id、发生时间、发生时的活动/站点与入口。新增 `campaign` 对象：`campaign_id / stop_id? / visit_id / entry_source / environment`。活动 ID 不硬编码；门店与酒厂不从名称反推关联。上下文仅允许明确字段，不上传 GPS、手机号、昵称、图片 URL、购买链接、原始错误或客户端 user_id。

`visit_id` 只串联一次活动页面访问及内部跳转，包括该次登录步骤；它不是用户身份，也不用于回填匿名事件的账号归属。分享出去的路径不带 visit_id，接收者建立新的访问。页面返回/onShow/数据刷新不重复算详情打开，新的页面实例才产生打开事件。复访按 session 或跨自然日统计，不拿刷新次数当用户数。

| 行为 | 实际上报 | 含义 |
| --- | --- | --- |
| 首页活动轮播 | banner_impression / banner_clicked | 当前轮播项至少50%可见且连续750ms；滑出、切页、后台均取消未完成曝光；一次挂载中同活动去重 |
| 活动详情加载成功 | activity_opened | 只有成功加载的活动；不虚构某一门店归属 |
| 联名酒详情加载成功 | beer_opened + campaign | 明确站点、门店、联名酒；来源区分活动列表/地图 |
| 地图与详情内容 | map_opened / map_stop_selected / details_opened / detail_image_previewed / benefits_opened | 入口点击、选站、图片预览；不把地图下载或拖动当到店 |
| 门店及其他酒款 | bar_clicked / related_beer_clicked | 活动向普通门店/酒款的导流意向；目标酒款单独 target_drink_id |
| 导航 | map_navigation_clicked / navigation_result | 打开地图接口的请求及结果；不是导航完成或到店 |
| 打卡 | checkin_started / checkin_cancelled / login_required / login_authenticated / checkin_submitted / checkin_result / undo_result | 提交与结果共享 attempt_id；已完成重复提交单独 already_completed；登录返回未认证表现为缺少后续，不猜测为失败或新注册 |
| 海报 | poster_opened / poster_generation_started / poster_generation_result / poster_save_clicked / poster_save_result / poster_share_clicked | 成功、失败、耗时及酒标降级；保存结果来自相册接口，不从按钮点击推断 |
| 微信分享 | page_share_requested | 仅请求分享卡片/朋友圈配置，不声称发布成功 |
| 购票入口 | purchase_clicked / purchase_handoff_result / purchase_qr_viewed / purchase_qr_save_result | 快团团打开结果或二维码查看/保存；不含购买成功/订单金额 |

旧 `campaign_interactions` 二维码记录保留，不与 ECS 同类事件相加。打卡成功/撤销的权威事实仍是 `user_campaign_stop_completions`，ECS 成功回调只用于排障、操作漏斗，不能替代业务总量。

结果事件可以带 attempt_id、result、受限错误码、耗时、完成数；异步结果在账号切换后丢弃，避免归到另一个人。离线上报保留原始 event_id/时间/环境，服务端幂等，不能按最后上传的客户端环境改写历史。事件传输仍有现有200条/7天队列限制，记录不是零丢失审计日志。

## 来源与海报扫码

入口：`home_banner / event_list / beer_badge / share_card / share_timeline / poster_code / campaign_code / unknown`。内部页面保留入口，列表/地图来源另由 source 区分。

普通微信分享路径携带 entry，好友或朋友圈打开后可分渠道统计。实际是否发布分享没有可靠证据，不做“分享成功数”。

旧活动码没有物料位置标记，因此普通 scene 入口只记 campaign_code；不能假定它来自海报。解析器兼容 `p_<活动8位qr_code>` scene，解析后用原短码读取活动，记 poster_code。正式活动已生成 `pages/campaign/campaign` + `scene=p_8b60ed3b` 的 release 码并写入 mini_program_code_url。生成时显式使用 `check_path=false`，允许页面发布前预生成；这不会把码变成体验版，也不会使尚未发布的页面提前可访问。正式发布后需第二台手机扫码验证。不要把带 p_ 的 scene 写回 campaign_events.qr_code。旧码继续可用、保持来源未知物料位置。如果新码也用于其他物料，就不能再把这个渠道解释为独立海报渠道。

目前没有逐用户分享 token，不能统计某人的邀请人数。渠道码也只是归因线索，不是身份或防伪凭证。

## 正式活动码与后台维护（2026-11-10）

| 项目 | 已配置值 |
| --- | --- |
| 正式活动 | `9b8edb9d-7d56-4a98-a49e-46e063f49c0f` / `shanghai-6x6-2026` |
| 固定短码 | `8b60ed3b`（保留原值） |
| 微信入口 | `pages/campaign/campaign`，scene `p_8b60ed3b`，env_version `release` |
| 图片字段 | `campaign_events.mini_program_code_url` |
| 正式图片 | [下载官方小程序码](https://img.nomenuapp.com/prod/campaigns/9b8edb9d-7d56-4a98-a49e-46e063f49c0f/mini-code/no-menu-release-p-8b60ed3b-v1.jpg) |
| 核验 | JPEG、79,475 bytes；本地/OSS/CDN SHA-256一致；数据库写回、公开RPC按短码及slug读取均通过 |
| 留档 | [生成/上传报告与核验记录](../../output/campaign-official-code-20261110/verification.json)；7项生成器/门店码测试、21项活动页面/埋点/海报测试通过 |

后续在 WebAdmin 或数据库编辑同一活动：标题、副标题、介绍、日期、主图、最多3张详情图、快团团入口、门店/酒厂/酒款关联及二维码图片地址无需小程序发版。保留活动 ID、qr_code 和页面路由，不删除重建活动、不将短码重新分配给其他活动。更改站点关联前还需考虑已有打卡记录，不能将内容可编辑理解为可随意改变历史记录含义。已导出的海报画面不会更新，但二维码打开的是当前活动资料。内置 Logo、海报布局和交互逻辑仍在客户端，修改仍需发版。

本次仅配置正式活动；测试活动 `bf7fcdea-8db7-44cd-a42f-bf7e8ab448a1` 保持独立。正式酒款活动前未上架属于预期，不为了验收提前开放打卡或修改正式活动时间。活动时间为2026-11-13至26日。

剩余验收：小程序审核通过并**发布**后，第二台手机扫描正式码，核对正式活动及图片、海报内二维码、release环境下的poster_code事件；活动开始且酒款供应条件满足后，验证真实新增打卡及海报保存结果。审核通过但未发布不算扫码可用，trial数据不作为正式用户采集证据。

## 开关与发布顺序

小程序配置：`campaignAnalyticsEnabled=true` 开启开发/体验版活动采集；`campaignAnalyticsReleaseEnabled=true` 已在 ECS 部署验证后开启，新正式客户端发布后生效。`analyticsEnabled=false` 时不创建活动访问标识、不采集或上传。Feed 开关独立维护，本次未修改。

1. 先部署 ECS Collector 与完整 contracts/schemas 目录；运行现有 readiness/普通事件回归。
2. 上传小程序体验版，验证匿名打开 → 列表/地图 → 酒款 → 登录 → 打卡 → 海报 → 保存 → 分享接收 → 快团团入口；测试活动独立 ID，环境必须 trial。
3. 确认 ECS accepted/duplicates/rejected 及报表数据，不只检查客户端 toast。重复重发应只存一次；无网络恢复上传时间和环境不变；撤销后业务报表扣除；拒绝分析不影响所有业务功能。
4. 验证生产采集既有隐私告知、授权开关、删除和保留期安排；随后设 `campaignAnalyticsReleaseEnabled=true`，上传并发布正式小程序。不是仅部署 WebAdmin 就生效。
5. 正式海报渠道码已配置；发布后单独扫码并核对 poster_code 事件，不能把旧 campaign_code 记录重分类为海报码来源，也不能把测试扫码算作自然新增。
6. 回退只需关闭 campaignAnalyticsReleaseEnabled 并发布客户端；普通活动/护照业务不依赖埋点。服务端先兼容新事件，避免旧服务端永久拒绝后客户端丢弃新事件。

部署前曾保留开关为 false，避免旧后端拒绝事件。2026-11-10 已完成后端部署并开启开关；采集部署通过独立合成事件及只读对账验证，没有执行数据库结构迁移。后续正式码配置是单独的已授权操作，仅写入正式活动 mini_program_code_url，没有调整酒款供应、活动日期或用户进度。

真实体验版核验：15:37—15:40（上海时间）测试活动收到17条 trial 事件、17条receipt；平均入库延迟0.461秒、最大1.572秒，无重复事件或缺失receipt。覆盖活动/酒款浏览、权益及详情展开、导航、海报生成与分享点击、快团团跳转；该轮没有新增打卡及保存到相册事件，也没有正式版用户事件。入口为旧 campaign_code，不是新正式海报码的扫码验收。

## 内部汇总

ECS 在服务目录、既有内部只读配置环境运行（不要输出环境变量或凭据）：

```sh
npm run report:campaign -- <正式活动UUID> 2026-11-13T00:00:00+08:00 2026-11-27T00:00:00+08:00 release
```

输出 JSON：时间范围、数据更新时间、匿名安装实例/session/已解析账号数、各事件及结果、来源、各店/酒款、日趋势、复访及跨日访问、保留期内首次观测的安装实例、同次访问中的操作重叠。显式活动 ID + 发生时 environment 双重过滤。旅程表表示动作重叠，不是严格按时间发生的转化率；不同分母不要混算。“首次观测”只表示当前保留的ECS历史中在统计开始前没有该安装实例的事件；不等于新注册，更不能证明由活动新增。未知身份事件不回填，匿名设备数与登录账号数不能相加称“人数”。

在 Supabase 业务库内部执行 `campaign-business-report.sql`（参数依次为活动 UUID、开始、结束），得到有效完成记录、参与账号数、两家及以上记录人数、完赛人数、1～N家分布、门店/酒厂/酒款对应关系、每日数据。仅 SELECT，不创建RPC或开放数据权限。SQL使用现有表，不把后续商品上下架当作历史打卡删除。

官方复盘应在活动结束后再等待7天迟到上传窗口并重新导出，保存数据范围和导出时间；90天原始事件保留期、用户删除和拒绝分析都可能改变覆盖。中期日报注明“截至时间，数据可能补入”。

## 给合作店铺的案例口径

可展示：活动被关注的规模和来源、各店与联名酒关注量、导航意向、线上记录参与、跨店记录、完赛分布、海报生成/保存、分享渠道带来的访问、购票入口点击。

不能据此展示：真实到店人数、支付订单/GMV、线下兑奖、发布到朋友圈数量、自然人新增、确定因果增量。活动会创建普通“喝过”，因此 ECS Assisted Visit 代理不能当作独立交易证据；不将活动自动写入记录包装为额外消费转化。

分享给店铺的是聚合案例，不是原始日志或逐人路线。先核对测试排除、数据覆盖与小样本，店铺细分小于5时合并/隐藏，避免个人行为识别；全活动累计与每日去重数不能简单相加。酒厂与店铺作为同一联名组合并列署名，不能把一方的贡献单独从数据里推断出来。

## 初次本地验证记录（2026-11-10，部署前历史）

- 小程序 preflight：289项测试通过，JS/JSON/风格资源检查通过。
- ECS OpenAPI lint及契约/单元回归：165项通过；包含小程序实际生产函数产生的合成批次跨端Schema验证。
- 隔离PostgreSQL完整集成：48项通过；活动入库、去重、错误事件部分拒绝、环境/活动范围过滤、报表无用户标识。
- 业务汇总fixture验证：6站、2位有效参与者、跨店记录、1位完赛；撤销后完赛归零、有效记录减一，零记录门店仍展示。
- 此批本地验证时尚未部署生产服务或配置正式码。后续部署、17条trial操作及正式码写回以上方最新记录为准；尚未发布小程序或验证正式码的release真机访问。
