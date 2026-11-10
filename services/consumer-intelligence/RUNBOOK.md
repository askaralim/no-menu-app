# Consumer Intelligence 服务端运行说明

当前独立后端在上海 ECS / RDS 运行。最新状态为2026-11-08的 **E1 内部测试 + Reason V2**：For You 沿用现有认证，无新增 Cohort；首页最多6款、完整个性化 Feed 最多20款，Latest 独立。Feed GET 已开放 HTTPS，Profile/health 保持内网。本次不新增客户端入口，不代表消费者正式发布。下文按时间保留实施记录，早期环境、两款首页及“尚未部署”描述仅代表当时状态；当前发布详情与回退命令见文末。

## 2026-11-10 联名活动采集部署

- API 当前目录：`/opt/no-menu/releases/campaign-analytics-20261110-v2`。基于 `e1-style-i18n-e42ce93cf00d` 复制，只修改10个活动采集、契约、报表和测试文件。Worker 仍使用原目录，无数据库结构、Feed 或推荐逻辑变更。
- 可信制品摘要：`004185251f2805bc910c7e57a086c1294c5367959ecdb76a2d774bcf9e85db49`；旧制品和摘要仍保留。
- 回滚：将 `/root/nomenu-campaign-analytics-20261110-v2/api-dropin.conf` 恢复到 `/etc/systemd/system/consumer-intelligence.service.d/99-e1-reader-floor.conf`，执行 `systemctl daemon-reload`、重启 API，并核对 `/readyz`。
- 候选契约113项通过，包含小程序生成的合成事件跨端验证；E1预检验证2个保留引用；readiness正常，公网Latest返回200。小程序开启开关后的preflight全部295项通过。
- 公网采集验证：活动详情、活动交互和旧门店事件共3条被接受；同批重发3条均判重；非法 `purchase_success` 被拒绝。RDS确认3条事件、3条receipt，无重复。
- 合成验证使用独立随机活动和安装ID，`environment=develop`、`app_version=campaign-deploy-smoke-20261110`，不纳入正式活动报表。上海时间14:09:36发生、14:09:38入库，延迟2.406秒。
- `campaignAnalyticsReleaseEnabled=true`，有效客户端版本1.5.0；当前准备提审，尚未确认提交或正式发布。用户体验版操作已收到，不能据此声称正式版用户事件已验收。
- 用户操作后检查：`/tmp/check-campaign-events.mjs`，以nomenu-ci及现有API EnvironmentFile运行，只读聚合正式/测试活动最近2小时的动作、环境、版本、发生和入库时间，不输出个人标识。14:13基线收到正式活动2条develop环境banner_impression；后续15:37—15:40核对测试活动17条trial事件及17条receipt，平均延迟0.461秒、最大1.572秒，无重复或缺失receipt。已覆盖浏览、导航、海报生成/分享点击和购票跳转；该轮未收到新增打卡/相册保存事件。
- 正式活动码已生成并写入活动数据：短码 `8b60ed3b`，scene `p_8b60ed3b`，release码；图片与公开RPC核验通过。Taplist活动展示已OTA并获用户验收，小程序发布后再核对正式扫码及release来源；固定入口与后台维护规则见 [活动码记录](CAMPAIGN_ANALYTICS.md#正式活动码与后台维护2026-11-10)。本次状态更新未重新部署服务。
- 第一份候选因macOS隐藏元数据影响契约解析而未激活；后续激活检查遇Python3.6参数不兼容，自动恢复旧版本。改用干净tar和兼容脚本后部署成功。未删除候选或旧版目录。

## 已实现的服务边界

### 2026-11-10 17:20 小程序 ECS 再验收

用户体验版操作后，按上海时间15:20:23—17:20:23的 `received_at` 窗口只读核验，未注入测试事件或修改业务数据：

- 小程序共229条事件/229个event_id，40条活动、189条非活动；228条身份已解析、1条早期匿名未解析，缺失receipt=0，明显未来时钟事件=0。平均入库延迟0.700秒、最大2.711秒，最近事件17:19:29发生并入库。
- 两个安装实例：与显式trial活动事件关联的实例183条（35条trial活动、148条普通事件）；与develop活动事件关联的实例46条（5条develop活动、41条普通事件）。普通事件只有 `1.5.0-ci-trial` 版本、没有独立environment字段，因此不能把全部229条称为手机体验版事件，也不能将安装实例关联当作逐事件环境证明。
- 普通门店浏览25、普通酒款浏览8；Feed展示34、曝光121、点击1。Feed均为Latest，覆盖home和feed_page，item事件的门店/来源酒款/原始排序字段无缺失；此窗口没有For You真实操作证据。
- 最近30分钟112条：门店8、联名酒款3、活动打开2、活动交互12、Feed曝光69/展示16、活动导航2。正式活动的trial浏览、导航、快团团跳转和分享请求已出现，但尚无正式release扫码事件；本轮无活动新增打卡或相册保存结果。
- consumer投影包含上述已解析账号的一条新TAP，created_at为16:01:02；catalog/consumer投影分别更新至17:20:18/19。TAP来自业务同步，投影不标记创建客户端，不能仅凭此认定由本次手机操作创建或已经完成Feed→TAP归因。
- 同窗口API日志（所有客户端）180次batch均HTTP202、13次identity均202、95次Feed均200；readiness正常、API NRestarts=0。202可包含部分事件拒绝，当前日志不保存逐事件拒绝详情，不能据此宣称拒绝数为0。
- 读取小程序config（含config.local覆盖）：`analyticsEnabled`、`intelligenceTrialEnabled`、`intelligenceReleaseEnabled`、`campaignAnalyticsEnabled`、`campaignAnalyticsReleaseEnabled`均为true；有效版本1.5.0、生产源站 `https://nomenuapp.com`。release环境函数检查通过；采集、Feed曝光与活动的38项定向测试通过。未修改开关、未重新部署或发布客户端；正式用户需发布该候选包后生效。
- 覆盖边界：搜索完成、普通单店活动打开、普通TAP操作成败等走微信We分析，无法在ECS验证其到账；普通切城及普通导航没有完整ECS事件接入。当前ECS已接入并观察到的链路正常，不代表全小程序每项交互均已ECS化或已实测。

只读查询留档脚本：ECS `/tmp/audit-mini-events-20261110.mjs`、`/tmp/audit-mini-detail-20261110.mjs`；请求状态仅聚合、不输出个人标识。下次核验需重新指定时间窗口，勿把本批测试流量当自然获客。

| 组件 | 当前行为 |
| --- | --- |
| API | 原生 Node HTTP，复用冻结 JSON Schema，校验 request/response，生成 requestId |
| Feed | 读取预计算 snapshot；Latest 固定 manifest + 签名 cursor；读取时再次过滤不再合格的酒款 |
| Worker | 单次执行，适合 Cron/systemd timer；独立同步 catalog/consumer，后台生成 eligible 用户 × 城市的榜单 |
| Assisted Visit | Worker 后台按逐 TAP 证据重算，再按用户/门店/06:00 换日聚合；只保存可观测代理，不确认真实到店 |
| Collector | 九种事件，逐事件校验；PostgreSQL 原子提交后返回 202；重复 ID、语义重复、未知提交结果分别处理 |
| Identity | Supabase Auth 远程验证 token；不可变操作记录、服务端认证时间边界、冲突 session 隔离；不信任上传账号 |
| Profile | 直接转发新 Supabase RPC，Merge Patch；不把分析库作为业务事实源 |
| 数据库 | 私有 `ci` schema，独立连接池；业务投影整代替换、事件/instance/snapshot 单独持久化 |

投影使用每个 scope 一行 JSONB 保存一致的全量数据，符合当前小规模 V1；Feed instance 的 immutable manifest/items 也保存在同一 JSONB 记录中。逻辑关系不变，暂不做逐字段投影表或消息队列。规模扩大后可以替换存储实现，不改 public API。

后台报表和自动清理调度尚未实现。2026-11-04 已确定原始事件按 received_at 保留 90 天，Feed instance 保留 30 天；操作员预览/清理及用户擦除命令已部署；已运行生产清理预览，未执行生产删除或配置自动清理。详情见下方“数据维护”。不要把 TAP 或这套事件数据直接称作已验证到店。

## 本地启动

在 `services/consumer-intelligence` 目录执行：

```sh
npm ci --ignore-scripts
docker compose -f compose.local.yaml up -d --wait
```

复制 `.env.example` 为仅本机保存的 `.env`，填入测试 Supabase 项目的 URL/anon key、两个不同的随机密钥；不要填生产 service-role key。`.env` 和证书私钥已忽略。

```sh
npm run migrate
npm start
```

`/healthz` 只检查进程，`/readyz` 检查数据库和迁移版本。空库时 Feed 返回 `503 PROJECTION_STALE` 是正确行为，不会伪造推荐。Profile/城市路由直连 Supabase，故不依赖 RDS 投影新鲜度。

Worker 必须在新 Supabase RPC 已存在的测试环境运行，并单独配置 service-role key：

```sh
npm run worker
```

默认监听 `127.0.0.1:8791`。API 环境不要配置 `SUPABASE_SERVICE_ROLE_KEY`；只有 Worker 需要它。`CI_DB_POOL_MAX` 至少 2，默认每进程 5。Worker 占用一个连接保持分布式互斥锁；重叠执行会跳过。

## 实际验证

```sh
npm run check
CI_TEST_DATABASE_URL=postgres://ci_local:ci_local_only@127.0.0.1:55432/nomenu_ci_test npm run test:integration
```

集成测试只接受回环地址、55432/55433 端口和 `nomenu_ci_test` 入口库。每次创建一个新的 `nomenu_ci_test_<uuid>` 数据库，不清空已有数据库；测试库保留供排查。测试账号须有 CREATEDB 权限，不能使用生产账号。

2026-11-03的历史验证环境为 Node 24.5.0、隔离 PostgreSQL 17.6。标准 `postgres:16-alpine` 下载受阻，改用已缓存的 PostgreSQL 17 镜像运行空库。该镜像附带的 Supabase session 扩展曾在角色权限测试中崩溃；在测试容器关闭附加扩展后通过。没有调整现有 Supabase 容器。当时目标 RDS 版本和 Node 26 尚未完成验证；后续 Node26 与部署验收见最新记录，不在生产执行故障注入测试。

2026-11-03 验证结果：OpenAPI lint 通过；132 项契约/单元测试、16 项数据库集成测试（含父测试）全部通过，无跳过。包含 15 城市映射回归、Supabase 适配层失败场景和 Assisted Visit 聚合。临时测试服务关闭后数据保留，不自动删除。

数据库测试覆盖真实 SQL 并发、迁移重复执行、部分成功、幂等、回滚、提交后确认丢失、历史城市、分页、投影新鲜度、HTTP 状态以及新业务 RPC 权限。提交丢失为故障注入，不是云端故障恢复演练；Supabase Auth 网络行为使用测试替身，不是生产登录联调。

## Assisted Visit 后台计算

用户已确认以 `venue_experience.created_at` 为 24/48/72 小时回溯锚点。`first_drank_at` 保留用于审计，但不影响归因窗口或分组日期；补录的饮用时间不能当作可验证的到店时间。

- 只使用 `identity_state=resolved` 的同用户事件和明确的同 `tenant_id`。全局酒款打开缺少门店时，不从当前酒单猜测门店。
- 主证据包括带门店的 beer/bar/search-result/activity 打开和 Feed item 打开。Feed 身份及酒款/门店信息来自已保存的事件 enrichment，不重新查询当前 catalog。
- `feed_item_impression`、`map_navigation_clicked` 只保存为辅助信号；单独存在不计 Assisted Visit。`feed_shown`、城市切换不作为门店发现证据。未接入的 Push 不参与。
- 匹配窗口为 `[created_at - N hours, created_at)`，保留 24/48/72 三组标记。相同时刻及 TAP 之后的点击不算前置行为。
- `consumption_day` 在 V1 明确指 **TAP 创建记录的营业日代理**：`Asia/Shanghai` 06:00 至次日 05:59:59.999，不是用 `first_drank_at` 认定的实际饮用日。当前中国业务城市统一使用该时区；跨时区业务需先调整服务端规则，不能使用设备或 Profile 城市猜时区。
- 同用户、同门店、同营业日聚合一次；3 个 TAP 只产生 1 个 Visit 代理。该组中未命中证据的 TAP 也计入 `tap_count`。
- Visit 主证据必须早于该组第一条 TAP，窗口也以第一条 TAP 为准。第一条 TAP 之后的点击可以出现在后续 TAP 的候选证据中，但不能制造一次新的 Assisted Visit。
- `beer_at_venue` 表示同酒同店，`venue` 表示明确同店的发现。`strongest_evidence` 优先同酒同店，其后按较近事件及稳定 ID 排序；没有概率、因果归因或已验证到店的含义。

实现位于 `src/assisted-visits.js`。`db/002_assisted_visits.sql` 只新增独立 Intelligence DB 的私有分析投影，不修改 Supabase 业务表。逐 TAP 的 `candidates` 和去重后的 `visits` 作为一份 JSONB 整代原子发布到 `ci.assisted_visit_projection`，与当前小规模全量投影方式保持一致。记录计算时间、consumer generation/source timestamp 和规则版本；API 角色无访问权限，不增加 public API。

每次 Worker 重新读取一致的 consumer/event 视图并重算：延迟上传可补入；身份冲突或业务 TAP 被删除时，下一次成功计算撤回相应派生结果，不改原始事件。consumer 投影过期、计算或提交失败时保留上一代结果，Worker 非零退出并记录失败；成功的 Feed 同步和排名不会被回滚。旧结果必须结合 `computed_at/consumer_source_as_of` 使用，不能当作实时事实。

目前是低数据量下的全量重算，尚未进行生产规模压测。`ops:check` 仍只检查 Feed 投影可用性；Assisted Visit 运行情况通过 Worker 的 `assisted_visits_refreshed/assisted_visit_refresh_failed` 日志和退出码观察。原始事件保留、用户擦除和完整告警接入仍是生产开放采集的前置事项。

## 只读运行检查

```sh
npm run ops:check
```

使用 API 环境配置即可，不需要 service-role key；所有数据库查询在只读事务中执行，不暴露用户标识、事件正文或连接凭据。此命令不是 public API，也不替换 `/readyz`。

- 退出码 `0`：catalog/consumer 两份投影均在 10 分钟内。
- 退出码 `1`：所需投影缺失、过期或时间在未来；JSON 分别说明 Latest 与 For You 的数据依赖是否可用。
- 退出码 `2`：数据库、schema 或配置无法检查。

输出另含刷新队列数量、最老请求等待秒数和超过 30 天的 Feed instance 数量。队列等待超过 10 分钟标记 `attention_required`，但不单独改变退出码；数据新鲜度不等于每个用户已有榜单。instance 数量仅用于确认清理需求，不执行 DELETE。不会用 snapshot 的生成时间判断 Worker 是否故障，因为候选和偏好不变时复用旧榜单是正常行为。

2026-11-04 已安装并启用 `consumer-intelligence-health.timer`，开机 90 秒后开始检查，上次完成后约 60 秒再次执行，附加 0–5 秒抖动。对应 oneshot service 使用 API 环境和 `nomenu-ci` 用户，限制 128 MiB / 25% CPU / 30 秒；不修改数据。systemd unit 校验及真实定时执行通过，投影新鲜、刷新队列为 0。

失败会记录非零退出码和 journal，目前尚未接通外部通知。用户已选择阿里云云监控现有联系人，实际告警投递仍待验证。该检查不覆盖 HTTP 进程存活或 Assisted Visit 结果新鲜度。公开采集前仍需确认原始事件保留期和删除流程；不能为了磁盘空间自行清理历史证据。

### 云监控健康指标（已暂停接入）

2026-11-04 用户决定 V1 暂不接入 Prometheus/企业云监控指标仓库。保留既有四条 RDS 报警和本机定时检查；不安装 CloudMonitor drop-in、不启用持续上报。以下脚本仅为未启用的验证原型，不属于生产告警链路。旧 `PutCustomMetric` 返回成功不等于新控制台告警已接通；旧基础自定义监控与企业云监控的入口、计费和 API 不能混用。服务健康主动通知仍是未完成项。

2026-11-04 用户确认 RDS 存储、CPU、内存、连接数告警已创建，接收人为本人；通知送达未实测。独立脚本 `deploy/report-health.py` 已上传 ECS，并在真实专用账号及 systemd 隔离环境单次执行通过，云监控返回 `Code=200`。本地和 ECS Python 3.6 的 9 项监控单元测试均通过。

脚本检查投影、超过 10 分钟的刷新请求、回环 `/readyz`、Worker timer 及上次 Worker Result；全部通过上报 `nomenu_ci_health=1`，否则上报 `0`。只发送固定 `service=consumer-intelligence,environment=production` 维度，不发送业务数据、用户标识或凭据。原来的 `ops-check.js` 行为保持不变；Assisted Visit 单独结果新鲜度仍不在此检查范围，Worker 执行失败会令综合检查失败。

使用 ECS 已有 `nomenu-media-ecs` 角色，无新增 AccessKey 或权限。该角色上报成功，但 `DescribeCustomMetricList` 返回 NoPermission，不应因此添加云监控管理权限。CLI 初始读取默认 profile，即使指定 `--config-path` 也会尝试主目录；drop-in 用 `ProtectHome=tmpfs` 和单文件只读绑定提供无密钥配置，真实 home 不可见，不修改系统账号主目录。

**持续上报尚未启用，当前不再推进**：CLI/API 对 `Type=1` 返回 `400 cannot upload pre-agg value from cli,only support original value`；`Type=0` 实测接受，但[官方说明](https://help.aliyun.com/zh/cms/cloudmonitor-1-0/user-guide/overview-15)将原始值上报列为付费功能。单次成功不代表免费额度或告警链路已确认。`deploy/consumer-intelligence-health-cloudmonitor.conf` 不应安装。

以后若恢复接入，应先重新验证当时受支持的上报和告警路径，覆盖连续异常和无数据两种情况，并绑定用户现有联系人组。必须覆盖 ECS/上报程序停止或上报权限失效，不能只监控值为 0。不要通过停止生产 Worker 制造测试故障；实际通知送达需另行受控测试。

检查但不上报：在已加载 API 环境的专用账号/systemd 中执行 `python3 deploy/report-health.py --check-only`。上报模式退出码：0=健康且上传接受，1=异常且上传接受，2=上传失败或配置缺失。`Code=206` 也视为失败。API/Worker 不调用此脚本，云监控不可用不会阻塞业务服务。

## Supabase 迁移的上线前检查

已应用文件：`supabase/migrations/20261103175104_consumer_intelligence_backend_v1.sql`、`supabase/migrations/20261103175309_consumer_intelligence_profile_grants.sql`。本地文件版本已对齐 MCP 生成的生产迁移历史，避免后续重复执行。

它只新增城市 `city_code/timezone`、可空 `user_profiles.home_city_code` 和四个独立 RPC；不替换任何现有客户端 RPC。`ci_patch_profile_v1` 使用现有用户名函数并保留其唯一性约束。

在测试项目执行前检查实际 schema 与仓库一致，尤其 tenant/category/drink visibility、canonical product 状态和生命周期 view。显式城市映射目前覆盖迁移内列出的城市；未映射的 enabled 城市会使 catalog export 失败，必须人工补齐业务映射，不能通过 lower(display_name) 猜 ID。

2026-10-31 已只读核对生产所需表/view 字段和用户名 RPC 签名；`city_code/timezone/home_city_code` 及四个新 RPC 尚不存在，未发现同名冲突。生产 15 个 enabled 城市中，旧迁移漏了 Binzhou、Changchun、Guiyang、Jiaxing、Shenyang、Linxi，现已在仓库补齐，并用全部 15 个城市做迁移回归测试。生产既有 `city=Linxi / label=临沂` 原样保留，显式 code 为 `linxi`；没有顺带修改生产城市名。这只是字段与目录对照，不等于迁移已在生产执行或完整业务语义已验收。

`intelligence_export_snapshot_v1` 仅 service_role 可调用。catalog/consumer 独立返回 `source_as_of/complete/counts`，不含姓名、邮箱、设备 token。Worker 在写入独立 DB 前把 Supabase UUID 转成 HMAC user_key；密钥必须稳定保存，不能当成普通可随意轮换的部署密码。

未知/倒退/不完整的导出不覆盖旧投影。consumer 同步失败不会拖累 Latest 的 catalog 读取；所需投影超过 10 分钟才返回 `PROJECTION_STALE`。新鲜投影下的旧 snapshot 可以返回 `stale`，但返回的 `data_as_of` 仍是该榜单真实使用的数据时间。

## 身份与历史城市的保守语义

Auth token 只证明服务端验证时的主体，不能证明一个历史客户端时间戳。当首次收到认证 Feed 请求或 Identity operation 时，记录该 installation/session 的服务端认证观察时间；关联事件不能早于这个时间。离线事件早于可信边界时保持 unresolved，不把当前账号反推给过去。

同一 session 出现不同账号或相互冲突的起止操作会被隔离；客户端未来接入时，账号切换必须换 analytics session。原始 operation/event 不改写，可重新计算身份归属；匿名 Feed instance 不因登录补写 home city。

实例创建时从同一用户、10 分钟内的 Profile projection 快照 `home_city_code_at_creation/away_city_at_creation/home_city_source_as_of`。只表示创建时已知的上下文，不宣称点击当刻的真实 Profile。没有可信快照的普通事件 `away_city=null`。重新解析身份只更新身份列，不改这些历史字段。

## 阿里云 PostgreSQL 配置顺序

先确认现有 ECS 的地域、VPC、交换机和私网 IP，不能仅根据用户主要在上海就购买上海地域。RDS 与 ECS 同地域同 VPC，使用内网端点，白名单仅允许所需 ECS 私网地址；不要开放 `0.0.0.0/0`，也不为本地开发开生产公网连接。[阿里云连接说明](https://www.alibabacloud.com/help/en/rds/apsaradb-rds-for-postgresql/how-do-i-connect-to-an-apsaradb-rds-instance)

1. 创建独立 RDS PostgreSQL，起步可评估 2 核 4 GB、40 GB 存储；这是容量起点，不是经过 ECS/RDS 压测的结论。目标主版本建议 17，并确认控制台所在地域可售规格。先按量进行预发布验证，费用以实际订单为准。
2. 生产第一方事件建议高可用版。基础版没有热备；官方备份文档还说明基础版不支持日志备份。若为了成本选基础版，需明确接受更长恢复时间和对应的数据恢复限制，不能把备份当作 HA。[版本差异](https://www.alibabacloud.com/help/en/rds/product-overview/high-availability-and-disaster-recovery) · [备份限制](https://www.alibabacloud.com/help/en/rds/apsaradb-rds-for-postgresql/back-up-an-apsaradb-rds-for-postgresql-instance)
3. 为内网 endpoint 开启 SSL，下载 CA，应用端验证 CA 和主机名。配置 `CI_DATABASE_TLS=verify-full`、`CI_DATABASE_CA_FILE`，URL 使用证书对应的域名，不带 `sslmode` 等会覆盖 node-postgres SSL 对象的参数。[阿里云 SSL 配置](https://www.alibabacloud.com/help/en/rds/apsaradb-rds-for-postgresql/configure-ssl-encryption-for-an-apsaradb-rds-for-postgresql-instance)
4. 创建专用数据库 `nomenu_intelligence`，不要使用系统 postgres 库。分别配置 schema owner、`ci_api`、`ci_worker` 账号。owner 执行 `npm run migrate`，再审核执行 `db/runtime-grants.sql`。运行服务不能使用高权限 owner。
5. 开启自动备份、删除保护和容量/连接数告警，验证一次恢复。另行验证错误 CA/主机名确实无法连接；不能为“先跑起来”关闭证书检查。

API/Worker 各自保留最小权限的数据库 URL。密码、service-role key、HMAC secret 不发聊天、不写入 Git，也不打印在日志中。

## ECS 运行与隔离

2026-10-31 20:46–20:49（Asia/Shanghai）通过只读 SSH/实例元数据取得：

| 项目 | 实测结果 |
| --- | --- |
| ECS | `i-uf6bds0macscfmiloq3g`，`ecs.e-c1m2.large` |
| 地域 / 可用区 | `cn-shanghai` / `cn-shanghai-b` |
| VPC | `vpc-uf6q0r6swh7yizwl439du` |
| 交换机 | `vsw-uf6aaxrst7v0f5l22b7bj` |
| 私网地址 | `192.168.0.166` |
| CPU | 2 个逻辑核；采样时 idle 98–99%，load average 0.06 / 0.02 / 0.00 |
| 内存 | 可见总量 3563 MiB；available 2943 MiB；无 swap |
| 根磁盘 | 40 GiB；已用 6.3 GiB；剩余 31 GiB |
| 运行时 | Alibaba Cloud Linux 3，systemd 239，Node `v24.20.0` |
| 现有业务端口 | media `127.0.0.1:8787`；ai `127.0.0.1:8790` |
| 新服务端口 | `8791` 未被监听 |

现有两个业务服务的 systemd `NRestarts=0`；近 7 天可访问内核日志未命中 OOM/Killed process。`sar` 未保留今天/昨天的采样文件，无法据此判断历史峰值。当前余量支持先做有资源上限的隔离预发布，暂无立即升级 ECS 的依据；这不是生产峰值压测结论。

Nginx 现有 `/api/taplist/*`、`/api/supabase/*`、`/api/consumer/auth/wechat`、media 和 ai 路由均保持不变；新模板限定的 `/api/(feed|consumer|analytics)/v1/` 未出现在当前路由摘要中。模板尚未加载或执行 Nginx reload。

2026-11-04 已创建 `/opt/no-menu/consumer-intelligence`、系统用户 `nomenu-ci`，并安装独立 systemd API/Worker/timer。首次同步及 Feed 验证后，已启用 API 开机启动及 Worker timer（完成后约 60 秒再次运行，附加 0–5 秒抖动）。Nginx location 模板未安装，新路由没有对公网开放。

模板分别限制 API/Worker 384 MiB 内存和半核 CPU；这些是保护现有业务的上限，不是吞吐承诺。已从 Node 官方下载 v26.13.0 linux-x64，按 SHA-256 `d28a96af6c38596f6d9d97c0ee531c13d238d757742387d1928de822d959e997` 验证后安装到 `/opt/node26`。以 `nomenu-ci` 在该运行时执行 132 项契约/单元测试全部通过。原 `/usr/local/bin/node` 仍为 v24.20.0，未替换 ai/media 运行时。不在 ECS 上跑本地测试 PostgreSQL。

API 只绑定回环地址，经现有 HTTPS Nginx 暴露独立 `/api/feed/v1/`、`/api/consumer/v1/`、`/api/analytics/v1/`。上线前检查现有 location 优先级；不覆盖 `/api/taplist`、`/api/supabase` 或静态页面。API 不将日志写到用户业务表，日志只包含 requestId/route/status/duration，不记录 token、完整 URL 或事件正文。

Worker timer 约每分钟运行；没有客户端请求触发实时推荐计算。先启动后台同步并核验 source counts 和真实用户榜单，再启动 API 进行内部测试。检查 `projection_failed`、`snapshot_refresh_failed`、5xx、投影超过 10 分钟、内存和磁盘告警。部署前必须接上实际告警接收渠道。

## 当前下一步

2026-11-04，用户已购买 `nomenu-cn-pg-01`：PostgreSQL 17 基础版，2 核 / 2 GB，20 GB ESSD PL0，上海 B 区，与 ECS 同 VPC。此为 V1 成本选择，不代表已完成容量验证或具备高可用。实际登录确认数据库 `nomenu_intelligence`、PostgreSQL 17.11、时区 `Asia/Shanghai`、Collate `C`、Ctype `en_US.utf8`。

已从 ECS 验证：内网域名 `pgm-uf60104m3p56czfz.pg.rds.aliyuncs.com` 解析到 `192.168.0.168`，5432 的 PostgreSQL SSL 握手成功，CA 与主机名校验通过，协议 TLS 1.3；错误主机名与无可信 CA 两个负向检查均被拒绝。此检查未认证数据库用户，不代表数据库、权限或迁移已经验证。

CA 已安装到 ECS `/etc/nomenu-ci/rds-ca.pem`，SHA-256 为 `2dc6de20eab8451cc779001466f42b5ed05e554bbf479de6f194c35a1bfbc436`。服务器证书当前有效期至 2027-11-03 12:37:55 UTC。未修改或重启现有服务。

同日首次登录返回 `28P01`，用户修正 root 专用凭据后重试成功。已通过隔离目录 `/root/nomenu-ci-db-bootstrap-20261104` 的现有迁移程序执行 `001_initial`、`002_assisted_visits`，创建 10 张 `ci` 表；重复执行迁移后版本和应用时间保持不变。

已创建 `ci_api`、`ci_worker` 独立 LOGIN 账号（各限制 10 个连接，无 superuser/createdb/createrole/replication/bypassrls），应用 `db/runtime-grants.sql`；撤销当前数据库 PUBLIC 权限及 public schema 的 PUBLIC CREATE 权限，再显式授予运行账号 CONNECT。随机密码仅保存于 ECS `/etc/nomenu-ci/ci_api-password`、`/etc/nomenu-ci/ci_worker-password`，root 所有、权限 `0600`，不输出密码或完整连接串。

两个运行账号的真实 TLS 登录、读取迁移版本、授权写入并回滚均通过。8 项负向检查通过：API 不得写投影、读取 Assisted Visit 私有投影、删除事件、在 ci/public 建表；Worker 不得改原始事件、删除 Feed instance、在 ci 建表。验证结束后 event_receipts/projections 均为空，未留下测试数据。此次使用现有 Node 24.20.0 运行一次性初始化，未启动常驻服务、未替换现有 Node，目标 Node 26 的部署验证仍待完成。

Supabase 增量迁移与授权修正已部署。SQL 导出检查返回 catalog：15 cities / 346 active_cycles；consumer：719 user_beers / 729 venue_experiences / 276 follows / 275 consumer_profiles（当次检查值，active_cycles 尚非 14 天推荐过滤后的数量）。授权与 HTTP 检查确认匿名不能调用导出或 Profile RPC；service_role 仅获本次导出所需执行授权，Profile 只授权 authenticated。函数内部 auth.uid() 检查保留。Advisors 返回既有项目告警，观测时间早于此次迁移，不能据此宣称本次安全扫描全绿；本次权限由实际 SQL/HTTP 另行验证。

ECS API 的 `/healthz`、`/readyz` 和城市接口返回 200，城市数量 15；未登录 Profile 返回 401；没有投影时 Latest 返回 `503 PROJECTION_STALE`。仅监听 `127.0.0.1:8791`，采样内存约 66 MiB。API 和原 ai/media 服务均 active、NRestarts=0。API/Worker 配置分别位于 `/etc/no-menu/consumer-intelligence-api.env`、`/etc/no-menu/consumer-intelligence-worker.env`（root:root，0600），包含稳定的 HMAC/cursor secret；API 不含 service_role key。

用户已通过 `python3 /opt/no-menu/consumer-intelligence/deploy/configure-worker-key.py` 隐藏输入对应项目的 legacy service_role JWT。脚本仅原子更新 Worker 配置，不打印密钥、不启动服务；已验证错误角色不修改原文件、正确输入保留其余配置且权限为 0600。该 key 未加入 API 配置。

首次真实 Worker 同步于 2026-11-04 01:57（Asia/Shanghai）完成：76 位 TAP 用户，32 位符合个性化资格；15 城市共生成 480 份快照，其中 224 份非空。当前 346 条周期均通过 14 天候选过滤；上海 Latest 221 款。内部 HTTP 以 20 条/页读取 12 页，221 个唯一 item、无重复；未发送 analytics event，仅保留一条无 analytics owner 的分页测试 instance。个性化真实数据样本返回 20 条且 snapshot fresh；冷启动返回 cold_start。以未来时间验证过期投影被拒绝，测试 instance 写入均回滚。后续相同数据同步生成 0 个新 snapshot，`ops:check` 显示两种 mode 可用、刷新队列为 0。

Assisted Visit Worker 处理 729 条 TAP、301 个门店记录日分组，24/48/72h 归因均为 0；新采集系统尚无客户端行为事件，这不表示没有真实到店。新增 Supabase 默认角色授权的回归测试在隔离 PostgreSQL 上通过，16 项集成测试全部通过，测试容器已停止并保留数据。

2026-11-04 控制台核验自动快照为每日 01:00–02:00、保留 7 天。用户明确授权 DBS 服务关联角色及一次手动备份后，新增快照 `3223997650` 显示完成：02:12:01 开始、02:21:39 结束、恢复点 02:12:02（Asia/Shanghai），覆盖首次同步后的数据。页面当时显示备份使用量 6.47 GB、免费额度 40 GB；列表的 20 GB 是快照显示大小，不等于实际计费增量。未创建付费恢复实例、未执行恢复演练。

控制台日志备份开关显示开启，但基础版官方文档说明不支持日志备份，时间点恢复能力仍未验证。任务中心返回 `ServiceNotSupported / Could not find target Api`，备份成功依据为实际备份列表中的新记录，而非任务中心或提交按钮。

剩余：实际恢复演练、服务健康通知和事件保留/删除流程。真实用户 token 的鉴权/Profile/For You HTTP 联调已通过（见下文）。当前不能标记为完整生产验收。生产开流量和客户端接入另行验收，不在这一阶段改客户端。

### 2026-11-04 后端复验与用户会话验收

03:26 左右（Asia/Shanghai）只读复核 ECS：API active、NRestarts=0；Worker 和 health timer 均 active，上次执行 success；health service 仍执行 `src/ops-check.js`，无 drop-in。Worker 最近同步保持 15 城市、346 active cycles、719 user beers、729 venue experiences、276 follows、275 profiles；Assisted Visit 为 301 个记录日分组，24/48/72h 均 0（无客户端事件）。

真实回环 HTTP 七项通过：health/ready/cities 返回 200（15 城市）；未认证 Profile、For You、Identity 返回 401；空对象事件 envelope 返回 400 INVALID_BATCH。没有写入测试事件或修改 Profile。

同轮 OpenAPI lint、132 项契约/单元测试、16 项真实 PostgreSQL 集成测试全部通过。首次尝试误用了 compose 示例账号，测试库认证失败；改用已有隔离测试容器的账号后通过，未更改数据库密码。测试容器 `nomenu-ci-backend-pg17-clean`（127.0.0.1:55433）已停止，保留测试数据，未操作业务 Supabase 容器。

手动真实用户验收脚本（在上海 ECS 交互终端执行）：

```sh
python3 /opt/no-menu/consumer-intelligence/deploy/verify-consumer-session.py
```

隐藏输入当前已登录 consumer 的短期 access token；不要输入 service_role、anon key 或 refresh token，不要把 token 发到聊天、写入命令参数或文件。脚本不保存 token，拒绝非交互输入、HTTP redirect 和代理；最终由运行中的 API 向 Supabase Auth 验证身份。只调用 GET Profile → PATCH 空对象 → GET Profile → For You（默认上海，最多两款）。比较三个 Profile 业务字段保持不变；不修改城市或用户名，不上传 analytics event 或建立 analytics identity link。For You 会保存一条无 analytics context 的验收 Feed instance，不是完全只读。输出只含检查结论、个性化资格、快照状态和 item 数量。

脚本成功表示这次真实登录请求链路通过，不代表验证了所有用户资格或推荐质量；`building`/空榜单需要单独解释，不能当作非空推荐已验收。六项脚本测试覆盖凭据类型/过期拒绝、空 PATCH、Profile 变化中止、禁止重定向、非交互拒绝及错误输出不泄露；本地与 ECS Python 3.6 均通过。脚本已上传上述路径。

真实小程序消费者会话首次联调：GET Profile → PATCH {} → GET Profile 均返回 200，脚本资料一致性检查通过，随后 For You 返回 400。原因是验收脚本误传 `surface=backend_acceptance`，不属于冻结契约允许的 `home/feed_page`；已修为 `home`，没有修改 API 契约。回归测试改为使用服务端真实共享 JSON Schema 校验脚本发出的请求，旧参数下复现失败，修复后六项测试在本地和 ECS Node 26/Python 3.6 均通过。

修复后用户在上海 ECS 执行并提供结果：`profile_read=passed`、`empty_patch_preserved_profile=passed`、`authenticated_feed=passed`、`personalization=eligible`、`snapshot_state=fresh`、`item_count=2`。确认本次真实消费者鉴权、资料读取/空更新及上海 For You 非空榜单链路通过。token 来自微信开发者工具模拟器的消费者会话；这不是手机体验版页面端到端验收，未接入或发布客户端 Feed。`limit=2` 是本次请求限制，不代表完整榜单仅两款。未保存 token、未上传 analytics event，验收只新增 Feed instance；真实 identity/event/Assisted Visit 生产端到端链路仍未验证。


## 数据维护（2026-11-04，已部署，默认预览）

用户已明确同意：原始行为事件以服务端 `received_at` 为准保留 90 天，边界为 `received_at <= now - 90 days`；不是 `occurred_at`，迟到上传不会提前过期。event receipts 同样保留 90 天。Feed instance 按 `retention_until`（创建后 30 天）删除，30 分钟分页过期不触发删除。

`src/maintenance.js` 是操作员命令，不是公共 API。默认只预览，只有显式 `--apply` 才提交删除；不会请求 Supabase、修改 TAP、关注或业务 Profile。API/Worker 没有新增 DELETE 权限，只能读取最小防重入标记。当前没有 timer/cron 自动调用，`ops:check.retention.cleanup_enabled=false` 仍准确；不能把代码完成当作生产保留期已自动生效。

安装步骤必须按顺序：

1. 暂停独立 CI Worker timer，并等待现有 Worker 退出；暂停 CI API/health timer。不要停现有业务服务。
2. 使用 schema owner 执行迁移，增加 `003_data_maintenance`；应用更新后的 `db/runtime-grants.sql`。新增版本依赖这些表，不能先启动新代码。
3. 部署该版本所有 CI 代码后恢复 CI 服务。新 `/readyz` 和 `ops:check` 要求迁移 003；先核对权限、投影和内部 HTTP。
4. 用操作员环境执行默认预览，检查范围；确认后才显式 apply。本轮已按上述顺序部署并完成预览；未执行删除，也没有配置自动任务。

在 service 目录，使用专用操作员配置（schema owner 的 CI_DATABASE_URL，原有 TLS CA 和**同一个** CI_USER_KEY_SECRET；文件 root-only，不进入仓库），Node 26 示例：

```sh
/opt/node26/bin/node --env-file=/path/to/operator.env src/maintenance.js retention
/opt/node26/bin/node --env-file=/path/to/operator.env src/maintenance.js retention --apply
```

用户擦除通过操作员环境变量 `CI_ERASE_USER_ID` 指定 Supabase consumer UUID（不通过 CLI 参数写进 shell history）；程序转换为既有 HMAC user_key，输出仅包含数量：

```sh
/opt/node26/bin/node --env-file=/path/to/operator.env src/maintenance.js erase-user
/opt/node26/bin/node --env-file=/path/to/operator.env src/maintenance.js erase-user --apply
```

这里的擦除仅针对 Intelligence 副本：consumer projection 中的用户酒款、venue experience、关注和 profile；该用户 snapshot、refresh request、Feed instance；以及可可靠关联到他的 session、identity operations、事件和 receipts。同设备其他 session 不受影响。若同一 session 混入多个账号或存在 integrity_error，整项操作返回 `ERASURE_AMBIGUOUS_SESSION`，不做部分删除，需人工核对。不能关联到该用户的匿名历史不猜测归属，按保留策略处理。

擦除保留两类最小防重入记录：HMAC user_key、installation/session pair 及擦除时间；无原始 consumer UUID、Profile 或行为正文。后续同步过滤该用户，旧 session 上传拒绝；该 user_key 的 For You/Identity 返回 `403 SUBJECT_ERASED`，已擦除 session 返回 `SESSION_ERASED`（事件为单项不可重试 rejection）。没有自动恢复个性化或解除标记的功能。用户仍可不带身份/分析上下文访问公共 Latest。标记不按 90 天自动删除；否则下一次业务同步会重新导入用户。这不是 Supabase 账号注销，也不是对所有存储介质的即时物理清除。

迁移会为可关联到现有 event 的旧 receipt 回填 session。迁移前语义重复但没有对应 event 的 receipt 只有 ID/hash，无法可靠补归，不批量猜测删除，最多保留至其 90 天边界。上线新 collector 后所有 receipt（含语义重复）均保存 session，可被精准擦除。

删除原始证据或擦除用户时，同事务使整份私有 Assisted Visit 投影失效；下一次 Worker 从剩余事件重建。在重建前应视为暂无结果，不能把旧结果继续当作有效归因。长期报表不能把当前保留窗口结果解释为 lifetime 归因；本版没有另外永久保存证据摘要。

并发边界：所有 CI 事务在 BEGIN 前取得共享 advisory lock，维护取得同一锁的独占模式；正常事务可并行，维护期间只短暂阻塞本独立服务的事务。先取得锁再 BEGIN 防止 REPEATABLE READ 使用擦除前的快照重新写入。默认数据库 statement timeout 10 秒，超时回滚；数据规模超出当前小批量时需再设计分批，不能擅自延长在线阻塞。必须先更新所有 CI writer 后再执行维护；旧版本 writer 不遵守该锁。

提交失败或确认丢失返回失败，不打印原始 SQL/凭据；按相同操作重试，删除和防重入标记幂等。删除不触及 RDS 既有备份；备份按已配置 7 天生命周期到期。恢复旧备份后、恢复同步与流量前，必须重新应用备份之后已执行的擦除清单/防重入标记，避免恢复旧数据。该清单应由操作员受限保存，本命令不向日志输出用户身份。

本地验证：OpenAPI lint、132 项契约/单元检查及 25 项隔离 PostgreSQL 集成检查通过。新增覆盖旧版本表升级/就绪检查、按接收时间的 90 天边界、30 天实例保留、默认预览、语义重复 receipt 擦除、跨账号保留、同步/重传防恢复、冲突 session 拒绝、事务回滚/提交确认丢失、并发快照边界和运行角色权限。迁移 003 已在下述部署中应用，未执行生产删除。


### 2026-11-04 13:00 数据维护部署验收（Asia/Shanghai）

仓库 main 上的维护版本已部署至上海 ECS `/opt/no-menu/consumer-intelligence`。运行 Node 26 的 132 项契约/单元测试先在 `.releases/20261104-data-maintenance` 暂存目录通过；本地 OpenAPI 校验及 25 项隔离 PostgreSQL 集成检查沿用本版已通过结果。没有在生产运行带写入/擦除断言的集成测试。

仅暂停 CI API、Worker timer 和 health timer；等待原 Worker 结束，执行 `003_data_maintenance` 与 runtime grants，再替换 CI 源码并恢复服务。备份位于 `.releases/20261104-data-maintenance/before.tar.gz`（0600，代码备份，不含 env/密码）；本次未新增 RDS 数据备份。首次代码备份尝试发现旧部署缺少 README/RUNBOOK/redocly 文件，在停服务前退出；缩小为实际运行文件后重新部署成功。

确认迁移版本 001/002/003；API、Worker 仅有 suppression SELECT 权限，没有 events/instances DELETE 或 suppression INSERT/DELETE 权限。部署前 events=0、receipts=0、instances=2、snapshots=510；部署后 HTTP Latest 验收新增一条匿名且无 analytics context 的 instance，故 instances=3。没有上传事件、建立 identity link、修改 Profile 或删除数据。

内部 HTTP 检查：health/ready/cities 200（15 城市），未认证 Profile/For You/identity-operations 401，空 batch 400 INVALID_BATCH；上海 Latest 返回 20 条、total_items=221、has_more=true、ranking_version=latest-v1。Identity 首次验收脚本误写 /identity 收到 404，改用冻结契约 /identity-operations 后确认 401；未改服务路由。已有真实消费者验收仍见上节，本次没有再次索取/使用用户 token。

部署后主动运行 Worker 成功：catalog 15 城市/346 cycles；consumer 721 user_beers、731 venue_experiences、276 follows、275 profiles；生成 0 个新 snapshot，Assisted Visit 303 个记录日分组、各窗口归因 0。健康检查 status=ok，两种 Feed 投影 fresh、刷新队列 0；API active/NRestarts=0，Worker/health 上次 Result=success，两个 timer active。

生产维护命令以 schema owner 只运行默认预览，报告 applied=false，待删 events/receipts/instances 全为 0。90 天是代码策略，**自动调度尚未启用**，没有执行 retention --apply 或 erase-user。仍需完成：服务健康外部通知、恢复演练、生产身份/事件/归因完整联调，以及开放采集前启用受控保留期调度。新公网路由和客户端接入仍未进行。


### 2026-11-04 小程序体验版采集联调

小程序独立仓库 `no-menu-miniprogram` 的 main 仅保留本地修改，不提交/推送。`intelligenceTrialEnabled` 与微信 develop/trial 环境双重开关；release 强制关闭。只采集已确认登录身份后的 bar_opened / beer_opened，原有 We 分析继续工作。无匿名历史回填，无 Feed UI，未上传或发布正式版。

部署 `deploy/nginx-trial-analytics.conf` 到 `/etc/nginx/snippets/nomenu-ci-trial-analytics.conf`，仅在 nomenuapp.com HTTPS server 引用。开放城市目录、identity-operations、events/batch；Feed/Profile/health 继续内网。原配置备份 `/etc/nginx/conf.d/nomenuapp.conf.before-ci-trial-20261104`。nginx -t、平滑 reload 成功。公开 cities 返回 200/15 城市；无认证 identity 返回 401；空 batch 返回 400。原 /api/taplist/cities 未带业务凭据返回 401，页面实际酒单加载成功；未修改其路由或鉴权。

开发者工具实测 Spark Lab → 五彩鎏光，首轮 bar/beer 各一条入库并 resolved；酒款含 tenant_id/product_id。首轮城市目录遇到该路径之前缓存的 HTML fallback，故 city 为 null，历史不回填。加入 GET Cache-Control: no-cache 后实测目录返回 15 城市、city_directory_ready=true。新增对应测试；小程序 preflight 224 个测试全部通过。测试只浏览，没有代用户新增 TAP。

仍需手机体验版浏览→新 TAP→worker 归因联调。体验版使用真实生产数据，测试记录不自动排除。事件保留策略90天已实现，但定时清理尚未启用；当前仅受控体验测试，正式扩量前完成清理调度、外部健康告警及恢复演练。

缓存修复后二次真实浏览验证：新增 bar_opened=1、beer_opened=1，二者 selected_city_code=shanghai、identity_state=resolved，酒款含 tenant/product。两轮共4条事件全部归属同一个 user_key；首轮2条 city=null 原样保留。没有新增测试 TAP。


### 2026-11-04 渠道/版本持久化修复

Collector 原先校验 batch.client 却未保存，现将 application/platform/app_version 写入每条新事件的 `ci.events.enrichment.client`，普通事件和 Feed 事件均适用。使用已有 JSONB，不改 HTTP/JSON Schema，也不需要迁移或客户端发版。

该字段表示**首次成功接收时客户端自报的上传环境**，不是身份凭证，也不能保证是离线事件发生时的版本。重复 event_id/语义重复不覆盖首次上下文；旧事件保持缺失，不依据当前登录或后续重试回填。身份重算不改该字段。当前 mini producer 的 `1.4.0-ci-trial` 标识开发/体验采集，不能进一步区分 develop 与 trial。

已验证 OpenAPI、132 项契约/单元测试、26 项隔离 PostgreSQL 集成测试；覆盖三渠道持久化、重复上传变更版本不覆盖、旧记录不回填、Feed 历史 enrichment、身份重算和 uncertain commit。仅部署 src/collector.js；备份 `/opt/no-menu/consumer-intelligence/src/collector.js.before-client-context-20261104`，重启独立 API，readyz=200。没有改 Supabase、业务 Nginx 或小程序发布版本；代码不提交/推送。

同时纠正风格完整性判断：venue_experiences.style 在导出 RPC 中是预留 null；推荐从 user_beers.style 构建去重风格画像。本轮“东南星”在 user_beers 的 style 为“早餐帝国世涛”，“摸金校尉”为“西海岸IPA”，两者均已有可用风格，不需要修复业务数据或为 venue experience 冗余补写 style。

生产复核：2026-11-04 14:42:36（Asia/Shanghai）一条新 beer_opened 已 resolved，enrichment.client 实存 application=miniprogram、platform=wechat、app_version=1.3.0-ci-trial。按上传值保留，未从当前仓库版本推断。


### 2026-11-04：Feed 体验版路由与客户端本地接入

rules-v1/coarse-v1 未修改。此阶段用户选择先做独立上新页（For You / Latest），当时不新增首页两张推荐卡；后续首页范围见文末 UI 进展。小程序只本地修改，不提交/推送或发布。Taplist/iOS 未因本轮改动。

新增 Nginx 精确 GET 路由 `/api/feed/v1/new-beers`，沿用应用认证、限流、no-store；没有开放 Profile/health。原配置备份：`/etc/nginx/snippets/nomenu-ci-trial-analytics.conf.before-feed-20261104`。nginx -t 通过后平滑 reload。此 URL 在公网可访问，体验版限制在客户端，不是服务端环境鉴权。

公开 HTTP 验收：Latest 第一、第二页各 20 条，同一 instance、无跨页重复，通过冻结 response schema；无 token 的 For You=401；cities=200。仅生成一份匿名验收 instance，没有写 analytics event 或 TAP。

小程序新增 feed_shown/feed_item_impression/feed_item_opened：同一观察实现用于两种 mode，50% 连续 750ms；后台/切换停止计时，按 instance/item 去重；保留创建时的分析会话，不能套用后来登录的账户。无测量上下文时 Feed 仍可展示。客户端真实出站三类事件已经通过服务端共享 JSON Schema 验证。小程序本地预检 237 项测试通过，包含请求乱序、会话切换、正式版隔离、分页和曝光边界。

解锁后已完成开发者工具编译/视觉与真实曝光验证（见下）。手机体验版未上传；真实 Feed → TAP 漏斗尚无验收结论。之前两条 Assisted Visit 仅为浏览/TAP 关联验证，不是推荐促成到店证据。

后续数据工作：小范围人工审计粗风格映射；只观察门店/风格集中度，不添加多样性限制。Assisted Visit 面向商户前，需要持久化可更正/可撤销的归因结果，使原始事件按期过期不静默抹掉历史，同时继续处理 TAP 删除、身份纠正和用户擦除；本轮未实施该项。


### 2026-11-04 17:40–17:55 开发者工具 Feed measurement 验收

小程序业务请求补上已有 consumer session 刷新，解决过期 token 被误当作未登录；不在 analytics 内刷新，不创建账户。修复后 JS/JSON + 239 项测试通过，Git diff 无空白错误。For You/Latest 真实卡片、详情导航与 Latest 20→40 条分页正常。

QA 窗口（UTC >= 2026-11-04T09:40Z，截至 09:55Z）共30条新事件、1个 resolved user、0条 unresolved：feed_shown=3、feed_item_impression=23、feed_item_opened=2、beer_opened=2。23条曝光对应23个不同 instance/item，无重复，最小持续751ms。只浏览，没有新增 TAP/关注或修改 profile。These are engineering QA events, not organic conversion evidence.

- For You `0c4589f2-1941-4322-9bf6-3dbba5496d2d`：首屏位置1–5曝光，点击位置1；返回新 instance `24bbe8e6-54a3-4ff9-ba73-0799bd575f4d`：位置1–5曝光。
- Latest `bb98957f-ab3e-4048-abf7-63746ab0bb43`：位置1–6和15–21曝光；快速滚动跳过7–14未计；点击15。40个不同item，同instance分页。
- 两个点击的 enrich mode/ranking/original_rank/tenant/product 正确，随后 beer_opened 的 tenant/product/source_drink 一致。普通 beer source 仍是 bar_taplist；Feed来源依独立feed事件分析，不扩建旧source。
- 页面进入详情后不再累计原列表曝光；真机切后台仍需手机体验验收。没有上传新的体验版或正式发布，没有Git提交/推送。

### 2026-11-04：首页 UI 定稿与最新客户端状态

小程序本地首页已增加独立异步 `for_you / surface=home / limit=2` 预览。最新定稿为「上新推荐」紧凑纵向两行、左图右文、右侧「查看全部」，无解释性副标题或首页推荐理由；完整 Feed 保留理由。启用 develop/trial Feed 开关时，旧「最近上新」横栏及其请求一并停用；release 未启用 Feed 时仍保留原首页。Taplist 未修改。跨端复用规则见 [消费者酒款列表 UI](../../docs/CONSUMER_BEER_LIST_UI.md)。

首页请求失败、无候选或构建中隐藏模块，不阻塞核心酒吧列表；未登录与 cold start 保留相应引导。首页与完整列表使用不同 instance，继续共用 50% 可见连续 750ms 的曝光标准。规则、风格映射、服务端契约与排序均未因 UI 修改调整，本轮没有部署新的服务端代码。

验证记录：此前首页接入完成 JS/JSON 与 242 项 preflight 测试；最后紧凑 UI 及旧横栏请求隔离改动后，首页/曝光/上新页定向 15 项测试及 diff 检查通过，未重跑完整 preflight。19:17–19:18（Asia/Shanghai）开发者工具确认最终首页与「查看全部」导航，完整列表理由保留。这些操作属于工程 QA，不是自然转化数据。

最新代码仅本地保留，未提交/推送、未上传新的手机体验版或正式发布。下一步为手机体验版的长中英文、缺图、滚动/切后台和真实 Feed → TAP 验收；此记录不表示上文自动清理调度、外部健康告警、恢复演练或历史归因持久化待办已完成。

### E1 Phase 2.6：仅隔离发布路径

本节为 Phase 2.6 历史记录：当时 E1 仅本地验收，生产尚无获批包、reader 清单或新路由；已被后续内部测试发布状态取代。兼容下限仍为 **005 + 可按完整 SHA 读取历史包、执行 004 撤下规则的已审核 reader**。不要将下述离线测试配置复制到线上。

隔离发布/回滚前，先用独立安装的 `deploy/e1-reader-launcher.py <候选绝对目录> <独立审核的摘要清单> check` 预检，保持当前版本运行直到检查成功。API 和 Worker 的 systemd 基础 unit 及宿主保留的 `99-reader-floor.conf` 均通过同一 launcher 启动。launcher、清单、Node 可执行文件和持久 drop-in 必须独立于候选发布目录，由宿主管理员持有，服务账户无写权限。发布目录及依赖保持只读；不得自动登记候选自身的摘要、随回滚替换 drop-in 或直接启动旧二进制。缺资产的回滚目标也不能切换。

测试 Registry 使用 `CI_E1_LOCAL_REGISTRY/<64位 SHA>.json`，新路由由 owner 使用 `publishPolicy(pool, policy, expectedEpoch)` 明确选定。仅改进程环境不会发布策略。新 epoch 在 Worker 同代完成前不接受新 E1 Instance。撤销由 owner 的 `revokeBundle` 事务持久化，关 Flag 不撤销历史读权。Registry 不提供删除操作；预检检查 `ci.e1_required_assets` 的每个版本，包括已撤销但仍被引用的资产。线上仍禁止使用本地 fixture。


## 2026-11-08：Reason V2 内部测试部署

截至13:54（Asia/Shanghai），Recommendation Reason V2 已部署并完成服务端验收，仅用于未公开 Feed 的内部测试。For You 沿用现有 consumer 认证及默认 E1 路由，不新增身份机制、Cohort、服务或客户端入口。首页横向预览上限6款，完整个性化 Feed 上限20款；此前“首页两款”和“E1尚未部署”均为历史阶段记录。

| 资产 / 配置 | 当前值 |
| --- | --- |
| Reader 发布目录 | `/opt/no-menu/releases/e1-reason-2f3a8e1dc960` |
| Reader SHA-256 | `2f3a8e1dc96077aa09b75879b752c05711f46da6b4f9f1237bbf17257a98558d` |
| 发布包 SHA-256 | `5391562fca5e511ee15506c66078f7a66185b3cef3f3c3cb062f629739e831b3` |
| model_version（未变） | `rules-v2-e1:2f8ac785a4825063c94c4cd2bb52c7a6cc65290c4b21e7cb139ee89d04965750` |
| reason.version | `e1-reason-v2` |
| CI 迁移 | 001–005，Reason 本轮无数据库迁移 |
| 运行时 | Node26.13.0 Linux x64 / Python3.6.8 / 现有 systemd 门禁 |
| 路由验收状态 | serve，Policy epoch=8，Worker 同 epoch 就绪；非按用户灰度 |
| 备份目录 | `/root/nomenu-reason-v2-20261108`（CI dump、原服务配置、原 Reader 包及校验清单，仅存宿主受限目录） |
| 保留的前版 Reader | `/opt/no-menu/releases/e1-5b74ada88908` |

发布包相对前版仅变化4个运行文件：`src/e1/integration.js`、`src/e1/reason.js`、`src/e1/reason-labels.js`、`contracts/schemas/feed/reason.schema.json`。Supabase 业务数据、TAP 原始记录、数据库 Schema、依赖、Taxonomy Bundle、36条保守 Bridge、λ=1.0、Follow1.15、Exact优先及候选过滤全部不变；E2 Exploration 仍关闭。源码由固定发布包保留，本轮未提交或推送 Git。

新 Reason 在 Snapshot 生成时依据同一去重画像固定；版本加入 Snapshot 签名，使未变输入也可生成新版解释。旧 Snapshot / Instance 不回写。原 `reason.code/text` 保持兼容，新增聚合证据及版本；具体字段、宽类/具体标签和百分比口径见 [README](README.md#recommendation-reason-v2)。分母包含 Unknown，不能用读取时当前 TAP 总数替换历史分母。Latest 不含个人证据。

本地验收：Node26.0.0 macOS ARM64，157/157基础测试、46/46隔离PostgreSQL测试；9,120份历史Golden零差异，新版224个用户×城市组合排名不变。日志及复现入口见 [本地验收报告](../../outputs/recommendation-reason-v2-20261108/recommendation-reason-v2-report.md)。未在生产运行数据库故障注入或压力测试。

真实部署验收：核对 Askar 可靠账号绑定后，调用已部署的 `getFeed` API处理器创建并落库真实 home/feed Instance；没有铸造 token、绕过 HTTP 认证或新增曝光事件。Snapshot 为 `40121b3c-2072-4911-b4ff-e668de49e323`，去重TAP=126。首页6款与完整20款前缀一致，与更新前相比酒款、rank及全部内部排名证据零差异；两份旧Instance的解释及manifest摘要完全不变。前三条如下：

| 酒款 | reason.text | matched_unique_taps / total_unique_taps |
| --- | --- | --- |
| 即兴之城 | 你记录过15款拉格类酒 | 15 / 126 |
| 参天大树 | 你记录过13款西海岸IPA | 13 / 126 |
| 放空日 | 你记录过12款浑浊IPA | 12 / 126 |

公网匿名 Latest=200、20款且无个人证据；无认证 For You=401。V1真实Instance与既有其他服务正常。**本次 Askar 是服务端处理器验收，未代登录进行公网客户端端到端测试。** 结构化结果见 [验收结果](../../outputs/recommendation-reason-v2-deployment-20261108/acceptance.json)、[实际处理器输出](../../outputs/recommendation-reason-v2-deployment-20261108/real-api-output.json)、[发布清单](../../outputs/recommendation-reason-v2-deployment-20261108/release.json)。

最后一次正常Worker周期成功，V1/E1无变化输入各新增0份Snapshot，刷新父需求与E1子需求均为0；API、Worker timer、Nginx、AI及媒体上传服务均active。Worker仍为CPUQuota50%、MemoryMax384MiB、180秒预算，数据库超时不变。该健康状态是本次验收时点记录，不代表持续容量或正式发布验收；见 [健康日志](../../outputs/recommendation-reason-v2-deployment-20261108/health.log)。

发布中首次独立复算断言误将JSONB对象键顺序视为排名，触发自动回退至旧Reader并关闭E1新准入。随后仅修正验收脚本，改为按Feed item顺序逐项比较证据；发布源码包未变，重新通过全部部署断言。没有删减或放宽排名断言，也未绕过信任门禁。

关闭新E1准入，恢复V1新推荐；历史E1 Instance仍按原固定版本读取：

```sh
ssh root@47.116.222.78 /usr/local/sbin/nomenu-e1-mode off
```

需要同时回退Reader时，使用本次保留的E1-aware版本，脚本先检查信任与历史资产，再关闭E1、切换持久drop-in并恢复timer；结束时保持off：

```sh
ssh root@47.116.222.78 /root/nomenu-reason-v2-20261108/rollback.sh
```

禁止回退至V1-only二进制、删除仍有Instance/Snapshot引用的Bundle，或直接覆盖只读发布目录。备份不能无条件还原覆盖发布后的业务历史；本次常规关闭/Reader回退均不还原数据库。未完成的客户端端到端复验、外部告警、数据恢复/保留期运营事项不因本次内部测试更新视为已完成。

## 2026-11-10：完成范围与剩余事项

本节只整理已确认状态，没有访问生产环境、执行部署或补做测试。最近一次线上验收仍为2026-11-08；上节版本、策略epoch和队列数量是该时点证据，不是11月10日实时健康检查。

核心推荐链路已完成内部测试部署：已批准的Taxonomy V2修正及单品覆盖、Exact优先/有向Generic Bridge、λ=1.0、Follow1.15、原候选资格与去重、首页6款/完整20款、Reason V2及独立Latest。多Bundle历史读取、刷新持久性、断连恢复、可信摘要及回退也已实现。无需为继续使用内部测试功能再新增工程阶段。

| 剩余事项 | 现状与完成判据 |
| --- | --- |
| 最新Reason客户端复验 | 此次服务端已验证Askar126款TAP、15/13/12匹配计数及榜单不变；尚无本次版本的公网登录客户端端到端验收记录。用现有devtool/真机创建新Instance，核对`e1-reason-v2`、实际文字、长文本/缺图、滚动/切后台，以及同Snapshot首页6款与完整Feed前缀。旧Instance保留旧解释不算故障。 |
| 消费者正式发布 | 当前只获内部测试授权，正式客户端尚未开放Feed入口；后续发布需要明确产品授权，本次不执行。 |
| 推荐效果验证 | 工程QA和离线反事实排序不能证明点击、尝新或TAP转化改善；真实使用后再评价，不能把测试曝光当成自然转化。 |
| 商户归因与报表 | 已有Assisted Visit关联计算；完整商户报表及可更正/撤销的长期归因结果尚未完成，需处理原始事件过期、TAP删除与用户擦除。当前关联不代表真实到店或推荐因果效果。 |
| 保留期运营 | retention/erase工具已实现；自动清理调度仍未完成。事件90天、Instance30天策略不能等同于定时清理已运行；启用执行前须核对预览、备份及擦除一致性。 |
| 告警与数据恢复 | 服务健康检查和代码回退已验证；外部健康告警、完整数据备份恢复演练尚待完成。Reader回退不等于数据恢复验收。 |
| 容量 | 正式负载和长期容量验收未完成。此前用户已取消将额外ECS、正式压测或单独生产Shadow作为内部测试前置要求；此处仅记录证据边界，不自动恢复这些任务。 |

暂不实施且不作为当前缺陷：E2探索、隐式同Family/跨Family补足、无证据凑数、门店配额或随机探索。Unknown在证据不足时继续保留，不为提高覆盖率猜测风格。当前优先事项是现有客户端的真实体验复验，不修改推荐模型、资源限制或部署架构。

## 2026-11-10：Product Pool `style_en` ECS 内部测试部署

本次将 Supabase `intelligence_export_snapshot_v1('catalog')` 已提供的、仅限 Product Pool approved 值的 `style_en` 贯通到 ECS Feed。完整数据库归属、请求/响应和跨端接入契约见 [Consumer style localization runtime contract](../../docs/CONSUMER_STYLE_LOCALIZATION_RUNTIME.md)。

| 资产 / 配置 | 当前值 |
| --- | --- |
| Reader 发布目录 | `/opt/no-menu/releases/e1-style-i18n-e42ce93cf00d` |
| Reader SHA-256 | `e42ce93cf00da4a0a951d46c02e34373b6056dc808f7349258516eade90e4482` |
| 前一 Reader | `/opt/no-menu/releases/e1-reason-i18n-a421075018a5` |
| 变更文件 | `src/model.js`、`src/feed.js`、`src/e1/integration.js`、`contracts/schemas/feed/item.schema.json` |
| 数据库变更 | 无 |

`style_en` 只作为可空展示字段进入公共 item，并从 ranking/E1 signature 中排除；读取旧 Snapshot 创建新 Instance 时会覆盖为当前 catalog 的展示值。因此更新英文不会改变候选资格、排名、E1、Taxonomy、Bridge、λ=1.0 或 Reason evidence。

部署前 `npm run check` 通过157项测试和 OpenAPI 校验。部署后 API active、Worker timer active、手动 Worker Result=success、`/readyz` 返回 ready。真实 Latest 返回了 `DDH浑浊IPA / DDH Hazy IPA`、`浑浊IPA / Hazy IPA`、`西海岸IPA / West Coast IPA` 等数据库值。

小程序开发工具连接生产 ECS 后，英文首页及完整 Latest 均显示服务端 `style_en`；定向测试44项全部通过。开发工具当前没有真实登录会话，所以 authenticated For You、Reason V2、首页6款/完整20款同 Snapshot 前缀仍须由产品负责人在手机体验版登录验收。本次没有上传体验版或正式发布。

API 与 Worker drop-in 备份分别为：

- `/etc/systemd/system/consumer-intelligence.service.d/99-e1-reader-floor.conf.before-style-en-20261110`
- `/etc/systemd/system/consumer-intelligence-worker.service.d/99-e1-reader-floor.conf.before-style-en-20261110`

回退时将两份备份恢复为各自当前的 `99-e1-reader-floor.conf`，执行 `systemctl daemon-reload`，重启 API，并手动启动一次 Worker。可信摘要清单中保留新 Reader 条目不会影响回退；本次没有数据库、E1 Bundle 或 Reason 数据需要回滚。

### 小程序验收后的Taplist完整同步要求

2026-11-10用户明确：所有相关功能先在小程序测试并确认，再完整同步更新到Taplist。同步范围包括现有服务调用、认证/会话、城市/Profile、首页与完整Feed、Latest、Reason、详情导航及已验收事件采集，不仅是视觉组件。Profile服务契约与公网开放范围必须分开确认。

实现交接使用 [CLIENT_INTEGRATION.md](CLIENT_INTEGRATION.md)、[OpenAPI](contracts/openapi.json)、共享Schema及有效/无效fixtures。每次小程序行为变更与验收结论都要同步文档和样例，保留构建版本、脱敏请求/响应及两端逐项结果；未完成Taplist实现或真机验证的项明确待办，不把旧测试、处理器验收或文档检查当作新客户端验收。

本次文档修正了OpenAPI过时的首页2款说明为6款，补充Reason V2与跨请求Snapshot边界，并新增Exact/多witness Bridge完整响应及首页6款请求样例。没有修改生产服务或开启客户端入口。具体实施顺序为：小程序全项确认 → 按同一清单完整移植Taplist → Taplist逐项复验 → 再决定发布。

文档交付验证：Node26.0.0下`npm run check`通过，OpenAPI校验及160/160测试通过（较11月8日增加3个契约样例测试），无失败或跳过；文档链接与空白检查通过。此次未重跑PostgreSQL集成测试，既有46项结果仍属于11月8日验收；未访问生产、提交或推送。


### 2026-11-10：Taplist用户验收与小程序提审准备

Taplist 已发布生产 OTA，用户确认使用正常，记为用户验收通过。小程序 1.5.0 正准备提交审核，线上仍为 1.4.0；Feed 与活动采集正式开关均已开启，release 事件版本为 1.5.0，最近本地 preflight 为295/295通过。ECS 活动采集已部署并验证接收、去重和入库。最终候选包验收、微信后台合法域名及隐私指引仍需按清单收口；准备提审不等于已提交或已发布。

Taplist 已记录的生产 OTA group 为 `47314e59-5d47-4d4b-9990-f3f8814ffac5`，App Store 基线仍为1.3.2/build48；发布资产见 [OTA记录](../../taplist-mobile/docs/OTA_CANDIDATE_2026-11-10.md)。用户验收不能替代小程序最终包验证，也不代表所有历史分析事件已逐项对账。

首次检查发现的release入口关闭、有效版本1.3.0、活动后端未部署均已收口；早期日志保留历史证据，不再作为当前阻断。小程序当前候选与逐项清单见 [1.5.0提审记录](../../../no-menu-miniprogram/docs/releases/2026-11-10-consumer-localization-feed-candidate.md)。常驻城市设置与普通搜索/切城ECS事件未完整接入，需明确发布范围，不能将其标记已完成；这不改变现有Feed资格或排序。

本次仅同步文档，没有上传、提交审核、部署、提交或推送。最近自动预检记录为295 PASS、0 FAIL、0 SKIP；最终官方包与手机验证以候选记录为准。
