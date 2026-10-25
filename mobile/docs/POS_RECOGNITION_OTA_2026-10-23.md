# POS 识图与上酒流程 OTA（2026-10-23）

## 发布状态

- App：No Menu Tonight（POS）
- App Store binary：`1.1.2` build 24
- EAS channel / branch：`production` / `production`
- Runtime：`1.1.2`
- 平台：iOS
- iOS Modal hotfix update group（留档）：`47428109-7e68-4755-a582-f8e02317a616`
- iOS Modal hotfix Update ID（留档）：`01a16852-f7e9-7469-9d98-9035600862ff`
- 首次 hotfix 发布时间：2026-10-23 18:33（Asia/Shanghai）
- 后续目标酒头 hotfix：已发布；本文件未记录其 update group，不用上面的旧 ID 判断当前设备版本
- 状态：两次 hotfix 均已上线，并由实际 POS 流程确认功能正常

本次是纯 JavaScript / asset OTA，没有新增原生依赖，不需要提交新的 App Store binary。

## 用户可见变更

### 新增酒款

- 空枪位和商品库新增统一为两个入口：
  - 上传图片识别（主入口）
  - 搜索或手动新增
- 识图显示独立的加载、结果确认、失败重试、换图和取消状态。
- 识别结果仅补全空白字段，用户确认后才进入编辑和保存。
- 本店唯一精确匹配时复用现有商品；否则继续匹配全局商品池。
- 手动输入酒名时，本店商品库和全局商品池并行展示；只按相同 `product_id` 去重，不因本店有部分匹配而隐藏全局结果。
- 识图预填名称后不会错误显示“没有找到对应酒款”；用户手动修改名称后恢复正常搜索提示。

### 图片规则

- 相册原图允许 JPEG、PNG、WebP，最大 5MB。
- 识图服务单张图片上限同为 5MB。
- 正式保存前在设备端缩放到最长边 1200px、JPEG 约 75%，持久化文件仍限制在 2MB 内。
- 选图和识图不会写入数据库；只有用户确认保存后才上传正式图片。

### 酒单状态

- 点击状态标签或更多按钮打开统一状态面板。
- 面板提供上新、在售、即将上新、售罄，以及公开/隐藏和状态记录。
- 点击枪号调整位置，点击酒款图片或资料进入编辑，避免在状态面板重复入口。

## 取消与并发语义

- 识别中点击取消会中止客户端等待、使当前请求序号失效，并忽略任何迟到结果。
- 如果请求已经到达 AI 服务或模型提供方，服务端计算不保证同时停止，仍可能产生一次模型调用费用。
- 在“换一张图片”或“重新上传图片”后取消系统相册，不发送新识图请求，并保留原识别结果或错误页。
- 关闭编辑器同样会使未完成的客户端识别结果失效。

## Production incidents 与修复

### 1. 选图后编辑器没有出现

首个 OTA 在 iOS 真机出现：选择识图图片后入口弹框消失，但识图编辑器未出现，页面看似卡住。

根因是同一帧关闭新增方式 `Modal` 并打开编辑器 `Modal`。Web 可以完成该切换，iOS 原生 presentation 在前一个弹框尚未完成 dismiss 时无法可靠呈现第二个弹框。

Hotfix 在共享 `CatalogPickSheet` 中排队创建请求：

- iOS 等待第一个 Modal 的 `onDismiss` 后再打开编辑器；
- Web / Android 在关闭渲染后的下一任务执行；
- 酒单空枪位和商品库新增共用同一修复。

Hotfix 发布后已由实际流程确认恢复正常。

### 2. 商品已创建，但没有加入目标酒头

后续线上流程发现：从空酒头进入识图，确认并在编辑页保存后，商品已经出现在商品库，却没有加入最初选择的酒头。仅刷新酒单无法恢复，因为缺失的是酒头关联，不是页面缓存。

根因是新增方式 Modal、识图编辑器和保存函数之间没有可靠冻结并传递目标酒头；商品 upsert 成功后，保存链路可能拿不到原来的 `#n`，因此没有正确执行酒单关联。

Follow-up hotfix 将目标酒头作为本次创建请求的一部分贯穿整个流程：

- `CatalogPickSheet` 在关闭入口 Modal 前冻结 `targetTapNumber`；
- 打开编辑器时传入 `suggestedTapNumber`，不依赖后来可能变化的页面选择状态；
- `saveDrinkWithIntent` 显式接收 `tapNumber`，商品保存后调用 `set_drink_taplist_listing` 上到该酒头；
- 成功后父页面先合并新酒款，再刷新草稿，返回酒单即可看到结果；
- 如果商品已保存但酒头关联失败，编辑器保持打开并提示“商品已保存，尚未上枪”，避免用户误以为整个保存失败而重复建商品。

该 hotfix 已通过“空酒头 → 识图 → 确认 → 编辑 → 保存并上到 #n”的线上流程验证。

## 服务与数据依赖

- 没有新增 Supabase migration。
- 没有修改 `search_drink_products` 或酒单保存 RPC 的签名。
- 保存并上酒仍是两步：先保存商品，再调用既有 `set_drink_taplist_listing`；客户端对第二步失败提供明确的部分成功状态。
- AI API：`POST /api/ai/images/beer-labels`。
- 新旧 AI 返回保持兼容：稳定字段 `name` 保留，并增量提供 `nameCn`、`nameEn`。
- AI 服务不可用时不会创建商品；用户可取消后使用手动新增。

## 发布前验证记录

- `npm run typecheck`：通过
- `npx expo export --platform ios`：通过
- `npx expo export --platform web`：通过
- AI service `npm test`：18/18 通过
- `git diff --check`：通过
- Production channel：active，映射到 production branch
- Runtime：线上与本地均为 `1.1.2`
- 空酒头识图保存后：商品加入商品库，并出现在原目标酒头
- 酒头关联失败：保留已保存商品、编辑页和目标酒头，显示“商品已保存，尚未上枪”

## 对外沟通

本轮功能已发布小红书内容，核心表达是“我们给精酿酒吧做了一个更快的上酒方式：AI 识图”。内容以商家端上传酒款图片、确认识别资料、保存到对应酒头为主，同时带出消费者端酒单“喝过”标记和更清楚的 TAP 记录。宣传素材不承诺识别结果自动发布；最终资料仍由酒吧确认。

## 相关文档

- [酒款上新与图片识别流程](./DRINK_ENTRY_AND_RECOGNITION_FLOW.md)
- [酒单状态操作流程](./TAPLIST_STATUS_ACTION_FLOW.md)
- [AI 服务说明](../../services/ai-service/README.md)
- [App Store 1.1.2 binary 记录](./APP_STORE_CONNECT_1.1.2.md)

