# 内部行为与 Feed 看板

2026-11-12：完成本地实现与验证。2026-11-13：用户批准提交并推送本轮看板代码；Admin 托管发布结果待确认，ECS / Nginx / 数据库迁移尚未部署。现有客户端无需更新。

## 入口与目的

Web Admin → 平台超级管理员菜单 → 行为与 Feed 看板
路由 `/admin/platform/intelligence/`。

1. 发现与门店：日趋势、门店/酒款 Top 50、入口来源、渠道事件、浏览城市。
2. Feed 与 TAP：分渠道/模式/surface/ranking_version 的卡片曝光与点击；同人同酒同店点击后 TAP；全渠道 Observed Assisted Visit。
3. 数据质量：上传延迟、迟到、客户端时钟倒置、身份解析分布、业务投影新鲜度、刷新队列、尚未覆盖的监控指标。

## 接口与权限

`GET /api/internal/v1/intelligence-report?days=7&application=all`

- days 仅 1/7/30；application 仅 all/ios/taplist/miniprogram/unknown；拒绝未知参数和重复参数。
- Bearer 为当前管理员 Supabase access token，使用现有 authorize 验证；再以同一个 token 调用已有 `is_super_admin()`。只有严格布尔 true 放行。
- 每次请求均授权后才读缓存；不相信浏览器角色、user_metadata 或客户端传入账号。
- 私有 RDS 连接仅在服务端；不返回用户、installation、session、原始事件或 token。允许返回公开业务酒款/门店 ID。
- 响应顶层：api_version/requestId/server_time/generated_at/scope/summary/daily/events/sources/cities/beers/venues/identity/feed/feed_taps/business/health。
- HTTP 401 登录缺失/过期；403 非超级管理员；400 参数错误；503 REPORT_BUSY 或依赖失败。前端展示错误，不用示例数据代替。
- 60 秒缓存；整个进程同时最多一个报告生成任务；SQL 只读 REPEATABLE READ，每条最多 5 秒。需要上线后观察查询时间，数据增长后再考虑预聚合。

## 指标口径

- 范围是滚动 24h/7d/30d，半开区间 [from,until)，按 occurred_at；日分组 Asia/Shanghai，首尾日可能不满一天。
- 事件来自已入库去重 ci.events。不是请求数/发送数，不证明无丢失。
- 渠道取第一次接受上传时的 enrichment.client.application；未知单列。离线事件的上传版本不证明发生时版本。
- 设备去重 installation；会话去重 installation+session；账号仅 resolved_user_key。三者不互相替代，不跨渠道相加为人数。
- 渠道/城市/入口为客户端上下文，非可信物理位置。历史 home city 不回填。
- 门店及酒款 Top 按详情与 Feed 点击事件总量排，分别显示；这两个事件可来自同一次点击，不称作独立访客。
- 展示名称取当前 candidate catalog；下架/缺少名称有明确 fallback，不伪造历史名称。
- Feed 曝光统计同设备+instance+item；CTR 的分子是窗口内先曝光后点击的卡片数，分母是窗口内曝光卡片数。不是点击事件总数除曝光。
- Feed→TAP：仅 resolved 点击；同用户同门店，双方 canonical product 都存在时匹配 product，否则 source_drink；created_at 严格在点击之后且 <=72h、早于报告截止。重复点击可关联同一 TAP，点击和 TAP 各自去重，不跨模式相加。展示满72h点击数，不宣称成熟队列转化率。
- TAP总数及AV独立于渠道筛选，页面明确标为全渠道。TAP来自consumer投影，以created_at选窗。AV直接读取现有算法结果，以first_tap_created_at选窗，不另建归因算法。24/48/72h为嵌套窗口。
- AV 不是验证到店或因果提升；现有全量重算及90天原始数据保留限制仍存在。不可作为长期核实商户报表。
- 延迟=received_at-occurred_at，包含离线/队列/网络。负值单独计数且不纳入P50/P95。所有延迟指标按发生时间窗口选取。
- 身份解析分布不称为关联成功率，匿名不是故障。
- 无AV投影显示未知，无consumer投影TAP及Feed关联TAP计数显示未知；真正有投影但没有记录才显示0。
- HTTP错误率、批次拒绝和重复上传计数未接入；health字段为null，UI显示未接入，不显示0或全绿。看板不是主动告警系统。
- 当前包括测试账号及未显式隔离的开发行为；页面明确提示仅内部，禁止直接发布经营数字。

## 部署步骤（尚未执行）

1. 沿用现有E1 reader发布流程，将新 `src/admin-report.js` 与 server.js 一同进入release，更新相应文件校验清单，不能仅复制server.js。
2. 先以 Intelligence DB owner 执行迁移 `006_admin_report`，再应用 `db/runtime-grants.sql`。新增 occurred_at 索引与不含身份、证据的 `ci.admin_assisted_visit_summary` 只读视图；API 仅获得该视图 SELECT，仍不能读原始 assisted_visit_projection。已有 is_super_admin RPC 使用管理员 token 执行。迁移包含普通 CREATE INDEX，部署前按实际事件量选择低峰窗口。
3. Nginx HTTPS server include `services/consumer-intelligence/deploy/nginx-admin-report.conf`，先 nginx -t；只新增精确内部路由，不改Feed/采集路由。
4. CORS_ORIGINS补入实际Admin origin；不要使用通配符。前端默认https://nomenuapp.com，可用NEXT_PUBLIC_INTELLIGENCE_ORIGIN设置同样受控的服务地址（不是密钥）。
5. 发布Web Admin静态构建。实际浏览器以管理员登录验证；匿名401、普通用户403；切换时间/渠道检查scope和数字。
6. 验证不返回身份标识；观察报告耗时及Feed/采集请求耗时；不得为方便测试关闭鉴权。

## 本地验证

- `npx tsc --noEmit`
- `cd services/consumer-intelligence && npm run test:admin-report`
- 独立本机PostgreSQL：设置CI_TEST_DATABASE_URL，运行npm run test:admin-report:integration。
- 测试仅允许127.0.0.1:55432/55433、入口库nomenu_ci_test；每轮新建独立库保留，不清理业务数据。
- 已有测试容器可用 `node test/run-admin-report-local.cjs` 读取测试容器连接配置，不输出凭据。

验证结果：TypeScript 检查及 Web Admin 静态生产构建通过（23 个页面，含新看板）；6 项 HTTP/错误日志测试通过；真实 PostgreSQL 集成测试通过（含运行账号权限、关联去重、曝光顺序及 24/48/72h 口径）。尚未进行生产部署和管理员真实浏览器验收。

构建沿用项目已有的字体/img lint 警告；受网络限制 Google Fonts 样式下载未成功，Next 跳过字体优化，构建仍成功。未改动这些已有问题。
