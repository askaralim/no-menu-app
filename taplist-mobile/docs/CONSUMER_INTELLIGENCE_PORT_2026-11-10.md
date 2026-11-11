# Taplist Consumer Intelligence 接入（2026-11-10）

状态：**已随生产 OTA 发布，用户使用验收通过**。最新发布资产和回退见 [OTA记录](OTA_CANDIDATE_2026-11-10.md)。以下分阶段实施记录保留；其中“未发布/待测试”仅描述当时状态，不代表当前状态。小程序1.5.0已于2026-11-11获用户确认审核通过并正式发布；此确认不补写未记录的逐项验收证据。

历史 OTA 准备记录（随后已发布）：见 [2026-11-10 发布候选记录](OTA_CANDIDATE_2026-11-10.md)。TypeScript、Web/iOS 导出和 7 项针对性测试已通过，runtime 与 build 48 一致；随后已发布，详见该记录顶部。当前工作区另含后续联合活动接入，因此下文“不迁移联合活动”描述的是最初 Feed 移植边界，不再代表整个待发布包的范围。

## 2026-11-11 首页 Feed 加载优化（本地，尚未 OTA）

- 首页原已独立于门店列表加载；本次将登录用户的 Latest 兜底请求与 For You 并行启动，减少冷启动/无匹配时的串行等待。有个性化结果仍优先展示；For You 尚未返回时不抢先闪出 Latest。
- 保留原有按城市、账号、身份 revision 隔离的缓存，以及返回页面时的缓存复用。代价是登录用户首页刷新时可能多一次 Latest 请求；匿名用户仍仅请求 Latest。
- 未展示的预加载结果不传给曝光 hook，不计 shown/impression；不改推荐算法、API、服务端和现有发布开关。
- 验证：3 项首页结果选择测试通过，`npm run preflight`（TypeScript + Web 导出）通过。尚未实测手机端耗时，不承诺具体减少几秒。

## 2026-11-10 本地访问与匿名采集修正

- `localhost:8081` 直连 Intelligence API 被生产 CORS 拒绝。新增 `metro.config.js` 开发代理，只接受 loopback 客户端及同源 Origin，固定上游 `https://nomenuapp.com`，限定 Intelligence 路径和 HTTP 方法，不转发 cookie/IP/Origin。`intelligenceHttp.ts` 仅在 localhost Web 开发环境使用代理；原生端不变，生产 CORS 未放宽。修改 Metro 配置后必须重启开发服务。
- 首页 Logo 居中放大，城市选择在左侧；酒吧数量与搜索框缩短间距。未新增联合活动。
- 小程序 `utils/intelligence-trial.js` 已在相邻仓库补齐匿名采集：匿名普通浏览与 Latest 的 shown/impression/opened 都使用 installation/session；登录、退出、换账号或闲置 30 分钟轮换 session。身份请求失败不阻塞原始事件；不能解析账号的事件保持匿名，不按后来的登录身份回填。
- 小程序仍保留开发版/体验版开关；`analyticsEnabled=false` 不采集。匿名标识代表安装与访问会话，不等于已确认自然人，不承诺跨设备合并。
- 验证：小程序采集针对性测试 21 项通过；Taplist TypeScript 检查通过；本地浏览器桌面和 390px 宽度已看到 Latest 卡片、居中 Logo 与缩短后的间距。未发布小程序/OTA，未部署后端。

## 2026-11-10 列表分组与吸顶 UI

- Taplist 保留固定导航和双 Tab；Latest 日期行使用 `stickyHeaderIndices`，滚到顶部后停在 Tab 下方，下一日期接替。For You 不做日期或门店聚合。
- 两端日期采用正文白色日期 + 细分隔线，门店采用短暖金标记、正文色名称、独立右箭头，保留至少 44px/pt 的点击区域。分组、排序、分页及 API 均不变。
- 小程序使用原生导航下的 sticky Tab（56px）和 sticky 日期（44px），保留页面原有滚动、下拉刷新与 Tab 位置缓存。
- 曝光计算扣除顶部遮挡区域；不将固定日期下被遮住的卡片算作可见。为避免误计，列表初始尚未吸顶时也保守扣除该区域。
- 本轮只检查源代码及差异格式，按用户安排未运行测试或进行设备验收。待检查跨日期滚动、分页、切 Tab 和详情返回位置。

## 范围

- 对齐小程序当前英文风格、E1 Feed、Reason V2、Feed measurement 和普通浏览事件。沿用 [运行时契约](../../docs/CONSUMER_STYLE_LOCALIZATION_RUNTIME.md) 与 [服务接入文档](../../services/consumer-intelligence/CLIENT_INTEGRATION.md)。服务端负责候选、资格、排序、快照和归因，客户端不计算分数或重排。
- 最初Feed移植不含联合活动；随后OTA已包含联合活动前端，最终发布范围以OTA记录为准。
- 不修改后端、Supabase RPC、数据库或归因窗口。Observed Assisted Visit 仍由服务端以 venue experience `created_at` 为锚点处理，不等于确认到店。
- 未提交、推送、发布 OTA、修改版本号或部署生产服务。

## 实现

| 功能 | 代码与行为 |
| --- | --- |
| 接口 | `lib/api/beerFeed.ts`：城市目录与 Feed 经 `https://nomenuapp.com`；城市按 `source_city` 映射，不自行生成 code；复用 consumer access token |
| 首页 | `HomeBeerFeed.tsx`：最多 6 款横滑，有匹配显示 For You，否则 Latest；标题入口与末尾入口保留，无大底部按钮；新 Feed 启用时停止请求旧上新 RPC |
| 完整列表 | `app/new-beers.tsx`：独立双 Tab；For You 保留榜单顺序；Latest 日期内只聚合连续同店酒款，不移动分散酒款改变时间顺序；跨页保持此规则 |
| 缓存 | `useBeerFeed.ts`：按城市、账号、分析 session、surface、mode 隔离；切 Tab、详情返回保留已加载列表和滚动位置；首页超过 60 秒返回时后台刷新，已有卡片不先消失；完整列表非空时由下拉刷新更新 |
| 分页 | Latest cursor 沿用 instance 和所有权；完整页重新打开产生新 instance；过期提示刷新；临时加载更多失败保留已有列表 |
| 英文 | 非 Feed 页面继续 `_i18n` RPC；Feed 英文风格取 `style_en`，缺失回退原始 style；名称使用服务端英文；不新增关键词翻译 |
| Reason | 复用 `styleLocalization.ts`：中文服务端 text，英文 E1 Reason V2 使用已审核标签与真实 evidence，未知/旧 reason 回退原 text；切语言不重新排序 |
| 卡片 | `FeedBeerCard.tsx` 复用酒吧列表字体、布局基础及酒厂列表门店 pill；Latest 聚合后隐藏重复门店与逐卡时间；For You 显示 Reason 与相对时间 |

`EXPO_PUBLIC_INTELLIGENCE_ENABLED=false` 可在后续打包/OTA 配置中关闭接入，首页回到旧上新模块。默认开启；不是远程开关，本轮未发布配置。

## 数据采集

`lib/intelligenceAnalytics.ts` 复用现有分析开关，与 PostHog 并存。关闭分析后 Feed 仍可用，不产生或上传第一方行为、installation/session headers 或 identity operations，并清理本地第一方队列。Supabase 匿名 consumer 是有效账户，有足够历史即可匹配，不强制 Apple 登录。

- `beer_opened / bar_opened / activity_opened` 在详情实际加载后发出；`search_result_opened` 覆盖酒款搜索结果点击；`city_changed` 覆盖城市选择；`map_navigation_clicked` 衔接已有 Apple Maps 操作。缺少可信 UUID 不编造标识；目录尚未取得时普通事件城市为空。
- `feed_shown / feed_item_impression / feed_item_opened` 只发送 instance/item 和展示位置；算法与酒款上下文由服务端 enrich。
- 曝光按二维可视面积 ≥50%、持续 ≥750ms，200ms 采样。离焦、后台、说明浮层与首页城市浮层暂停。滚动时保守重置连续时长，可能少计缓慢滚动中持续可见的卡片；待真机验收。
- UUID 固定重试，批次最多 20 条，本地最多 200 条、7 天；202 逐项确认，临时失败退避并遵循 Retry-After。超期限/容量舍弃最旧记录，不是无限离线档案。
- 身份操作绑定创建时账号、session、时间；旧 operation 不用新账号 token 重试，不按上传时账号改写历史。无法可靠关联的事件保持 unresolved。
- token 只从现有会话读取，不写埋点队列或日志；不采集搜索词、姓名、邮箱、电话或逐条 TAP 历史。
- 本地/体验测试在同意分析后会产生真实第一方测试事件，只用于链路验收，不作为商业到店效果证据。

## 用户手工验收清单（尚未执行）

1. 无 consumer 会话：首页 Latest、完整 Latest 可浏览分页；For You 可切 Latest，不强制 Apple 登录；普通酒单正常。
2. 0 / 2 / ≥5 unique TAP：核对冷启动数量、building、无匹配、有匹配；满 5 款不保证候选。TAP 后等待服务端同步，再返回首页或下拉刷新。
3. 同一服务端 snapshot 下首页与完整 For You 前 6 款一致，两处 instance 不同；英文风格、exact/bridge 理由、缺失英文和长名称可读。
4. 双 Tab 往返、酒款详情返回：不闪空、不重置滚动；Latest 跨页日期/门店边界无重复、漏项或重排；下拉获取新 instance。
5. 切城市、换账号、匿名账号绑定 Apple：不显示旧账号/城市列表；关闭分析仍可用 Feed 且不再采集。
6. 断网/恢复、过期 cursor、429、投影过期：核心酒单与 TAP 不被阻塞，临时分页失败有重试入口；明确撤销/业务事实过期的 Feed 不继续作为有效缓存展示。
7. 同意分析后停留/滑过卡片、切后台、开浮层、点 Feed/搜索/店/酒/单店活动/地图；核对 collector 202、rejected 原因、identity link、impression 去重及服务端归因。勿在聊天或截图展示 token。
8. 确认未新增联合活动 UI，原有单店活动可打开。

上述局部验证不能替代两端完整功能一致性与真机采集验收。


## 2026-11-11 上传触发与队列消化（本地，下一次 OTA）

只修改 Taplist `lib/intelligenceAnalytics.ts`，不改小程序、PostHog、事件字段或身份归属。独立ECS身份错误日志已部署，历史503根因仍待复现，见服务端RUNBOOK当日记录。

- 事件入队后3秒合批，不因持续点击不断推迟；满20条立即尝试上传。15秒定时器仅作兜底。
- 冷启动恢复积压、回前台立即尝试；离开前台先持久化并尽力上传。iOS立即挂起或断网时仍依赖本地队列和下次恢复，不能保证后台送达。
- 同时只允许一个事件批次在途，每批20条，最多连续处理10批后让出；每批确认后保存进度，不再每批等待15秒。
- 身份操作与原始事件使用独立锁/退避；身份请求缓慢或503不再阻挡原始事件上传。事件可能先以未解析身份保存，后台按原有可信时间边界归属，绝不把上传时账号当作发生时身份。
- 网络/429/503继续原event_id重试并遵守Retry-After；部分可重试拒绝至少等3秒，永久拒绝按现有语义出队。保留7天、最多200条的原有边界。
- 关闭分析授权清空队列并取消排程；旧请求完成不得恢复旧数据。切账号不把旧身份操作发送在新账号token下。
- 验证：`node --test tools/intelligence-upload.test.cjs` 8/8通过，覆盖合批截止、冷启动积压、后台失败保留、身份与上传独立、部分拒绝/退避、授权撤回、账号切换、在途批次互斥。`npm run preflight`通过；末次冷启动触发补充后专项测试及类型检查复核。
- 预期降低的是正常前台客户端等待时间（约0—3秒加网络/服务端时间），不是承诺所有事件3秒内到达。真机离线/后台与ECS延迟分位数需下一次OTA后复核。本次未执行OTA、commit或push。
