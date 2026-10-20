# 酒厂发现与完整酒厂列表 — 2026-10-09 上线记录

> 状态：Taplist production OTA 已发布并验证；微信小程序 `1.2.2` 已审核通过并正式发布；两个 Migration 已完成生产验证。
>
> iOS 基线：App Store `1.3.2`（build `48`），无需新二进制。
> 本文记录本次客户端、RPC、上线顺序和已知数据问题，作为后续排障与回归依据。

## 1. 用户可见变化

- 搜索页酒厂区域展示当前城市供应酒款最多的 8 家酒厂。
- 第 9 个位置为“全部酒厂”入口，不再占用热门酒厂名额。
- 完整酒厂页支持城市切换、城市选择持久化、名称搜索和滚动分页。
- 每页最多加载 20 家；继续加载使用服务端返回的 `next_offset`。
- 列表展示 Logo、中文展示名、英文名和“本城在售 N 款”。
- 点击列表项时使用 RPC 返回的原始 `brewery` 字段打开酒厂详情，不能用 `display_name` 替代查询参数。
- 城市变化时清空旧列表并从 offset `0` 重新加载；请求按城市隔离，旧请求不会覆盖新城市结果。
- 搜索会继续加载后续分页后再过滤，避免只能搜到当前已加载的一页。
- 搜索页、完整列表和酒厂详情页的 Logo 均使用 `contain`，避免宽 Logo 被裁掉；详情页不再额外增加图片内边距。

## 2. RPC 与数据规则

### 热门酒厂

```sql
public.get_mini_breweries(p_city text)
```

生产环境当前返回最多 8 家，排序规则为：

1. 本城公开在售酒款数量降序；
2. 供应门店数量降序；
3. 酒厂唯一键稳定兜底。

只有 `new`、`available`、`low` 三种公开状态计入供应。

### 完整酒厂列表

```sql
public.list_mini_breweries(
  p_city text,
  p_offset integer
)
```

- 每次最多返回 20 家。
- 有下一页时返回下一次请求使用的 `next_offset`；没有下一页时为 `null`。
- 展示名优先使用标准酒厂资料，没有标准资料时回退到酒款中的酒厂名。
- 服务端使用 PostgreSQL ICU `zh-u-co-pinyin` 对中英文混合名称进行全局排序，再分页。
- 同名时使用酒厂唯一键保证分页顺序稳定。

## 3. 发布记录

### Taplist

- 发布方式：EAS Update `production` channel，仅 OTA。
- OTA Group ID：`017a615f-8930-4f98-97b4-b7cdf3bedffe`。
- 更新说明：`Add brewery directory, search, pagination, and logo display fixes`。
- 平台：iOS。
- Runtime Version：`ee7f9707efde823e12a9ee09ecebacef7af96f79`，与 App Store build `48` 一致。
- 不需要修改 `app.json` 版本或 `ios.buildNumber`。

### 微信小程序

- `1.2.2` 已审核通过并正式发布。
- “8 家热门酒厂 + 全部酒厂入口”、完整列表和详情跳转已验证。

### Supabase

相关迁移源文件位于小程序仓库：

- [`20261009040306_limit_mini_brewery_shortcuts_to_eight.sql`](../../../no-menu-miniprogram/supabase/migrations/20261009040306_limit_mini_brewery_shortcuts_to_eight.sql)
- [`20261009040316_add_paginated_mini_brewery_list.sql`](../../../no-menu-miniprogram/supabase/migrations/20261009040316_add_paginated_mini_brewery_list.sql)

实际生产状态（已验证）：

- `20261009040306_limit_mini_brewery_shortcuts_to_eight.sql` 已生效，`get_mini_breweries` 最多返回 8 家。
- `20261009040316_add_paginated_mini_brewery_list.sql` 已生效，`list_mini_breweries` 的分页返回符合预期。
- 2026-10-13 只读复核：上海热门酒厂数量为 `8`；分页 RPC 存在；首批结果的 `next_offset` 为 `20`。

两个 Migration 的生产行为均已确认，本次酒厂功能不再有待执行的数据库步骤。若未来需要整理 Supabase migration history，应以生产函数定义为准，避免重复执行已生效的 SQL。

## 4. 已完成验证

- [x] Taplist 搜索页显示 8 家热门酒厂和 1 个“全部酒厂”入口
- [x] 完整列表按当前城市加载真实供应酒厂
- [x] 城市切换清空旧分页并重新加载
- [x] 滚动分页使用 `next_offset`
- [x] 搜索可覆盖后续分页中的酒厂
- [x] 列表展示 Logo、中英文名称和“本城在售 N 款”
- [x] 使用原始 `brewery` 字段进入现有酒厂详情页
- [x] 宽 Logo 和透明 Logo 的显示策略符合当前设计决定
- [x] Taplist production OTA 在 build `48` 上生效
- [x] 微信小程序 `1.2.2` 审核通过、正式发布并完成对应功能验证
- [x] 生产 RPC 返回值符合预期
- [x] 两个 Migration 的生产行为均已验证

## 5. 已知数据问题

完整列表中可能出现两个展示名称相同的“半颠精酿”。已确认原因不是客户端分页重复：原始酒款数据分别使用 `半颠` 和 `半颠精酿` 两个 brewery key，它们在标准资料映射后都指向同一家公司并显示为“半颠精酿 / So Mad Brewery”。当前 RPC 先按原始 brewery key 聚合，再补标准展示资料，因此会保留两行。

不要在客户端按展示名称去重，否则可能错误合并其他同名酒厂并导致数量、分页和详情参数不一致。后续修复应优先统一源数据中的 brewery key，或在服务端按标准 company ID 重新聚合。

## 6. 回归重点

- 新城市启用酒厂目录时，确认该城市的公开状态和名称排序。
- 修改标准酒厂资料或别名后，复查是否产生相同展示名的多行结果。
- 修改分页 RPC 时，始终先全局排序再 `offset` / `limit`。
- OTA 发布后确认 runtime 与 build `48` 一致，并在冷启动后检查更新生效。
