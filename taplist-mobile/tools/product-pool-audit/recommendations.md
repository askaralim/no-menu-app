# Product Pool Production Audit

Generated: 2026-06-30T12:18:12.501Z
Project: agtujigvxxdppngirqtu.supabase.co

## Scope

Read-only production export using the app anon key. Direct table reads are available for `drinks`, `categories`, and `drink_products`. Beer metadata and serving options are enriched only for public bars through `get_public_taplist_bars` + `get_public_taplist_drinks`.

## Counts

- Direct `drinks` rows: 773
- Existing `drink_products` rows: 0
- Already linked drinks: 0
- Public bars through RPC: 25
- Public drinks through RPC: 299
- Conservative candidate products: 692
- Exact-key duplicate candidates needing review: 69
- Same-name manual review groups: 79
- Distinct brand/brewery values: 288

## Candidate Strategy

The conservative list merges only exact normalized `brand_name + drink name` matches. It intentionally does not merge different names that might refer to the same product. Those are left for manual review.

Use `candidate-drink-products-conservative.csv` as the first working list. Use `same-name-different-brand-review.csv` and `duplicate-review-exact-key.csv` before importing anything.

## Top Exact-Key Duplicate Candidates

| Product name | Brand/brewery | Drink rows | Tenants |
| --- | --- | ---: | ---: |
| 泡泡浴 | Alus | 5 | 4 |
| 饼干 | Alus | 3 | 3 |
| 狄俄尼索斯的眼泪 | 退界 | 3 | 3 |
| 黑武士 | 玄水屋 | 3 | 3 |
| 酒花大盗 | Deadman | 3 | 2 |
| 喵醺 | Alus | 3 | 2 |
| 南方 | Alus | 3 | 2 |
| 想象中的雨 | Fever | 3 | 3 |
| 晓夫 | 退界 | 3 | 3 |
| 依帕 | 赤屿谷盗 | 3 | 3 |
| 阿罗哈POG西打 | 佳卡哈 | 2 | 2 |
| 白拉格2026 | Fever | 2 | 2 |
| 白日梦 | 辉光 | 2 | 2 |
| 白天使 | 玄水屋 | 2 | 2 |
| 北地显影 | 蔓延 | 2 | 2 |
| 潮汐热吻 | 以及 | 2 | 1 |
| 从我的吧台滚出去 | Liquid's Tag | 2 | 2 |
| 大师的疯狂 | 蔓延 | 2 | 2 |
| 风暴中心 金桔芒果酸 | 云朴精酿 | 2 | 2 |
| 浮柚 | 云泥 | 2 | 2 |

## Top Brand/Brewery Values

| Brand/brewery | Drink rows | Candidate products | Public visible rows |
| --- | ---: | ---: | ---: |
| 蔓延 | 20 | 14 | 8 |
| Alus | 17 | 7 | 6 |
| 艾尔复兴 | 14 | 14 | 8 |
| Fever | 14 | 10 | 3 |
| 邪恶双子 | 13 | 12 | 11 |
| 明日酿造 | 12 | 11 | 5 |
| 退界 | 11 | 6 | 4 |
| 赤屿谷盗 | 10 | 6 | 6 |
| 彼岸酿造 | 9 | 7 | 1 |
| 勿幕 | 9 | 9 | 5 |
| 玄水屋 | 9 | 5 | 4 |
| 哈德逊河谷 | 8 | 8 | 2 |
| TAPSTAR | 8 | 7 | 3 |
| 凯西 | 7 | 5 | 5 |
| 洛莱 | 7 | 7 | 2 |
| 山雀 | 7 | 7 | 7 |
| 疯熊 | 6 | 5 | 1 |
| 狐朋酿造 | 6 | 6 | 0 |
| 辉光 | 6 | 5 | 2 |
| 回头客 | 6 | 5 | 2 |

## Recommendation

Do not normalize brands/breweries into a separate table before the first Product Pool backfill. The data has many sparse or inconsistent brand strings and the first operational need is reliable product identity + links. Add a lightweight `drink_companies`/`drink_brands` table after the first curation pass, when there is enough verified canonical company data to justify aliases, country, logo, and brewery-vs-brand relationships.

Keep `brand_name` and `brewery` text fields on `drink_products` for now. Add operational fields for curation quality before bulk import: `review_status`, `review_notes`, `canonical_key`, and possibly `external_refs jsonb`.

## Import Priority Lists

- First pass public candidates: 307. Use this list first because these rows affect consumer Product Pool behavior and have the best RPC-enriched metadata.
- Second pass enabled/private candidates: 271. Review after public rows; these may be back-office inventory or not yet published.
- Hold disabled/test/private candidates: 114. Do not bulk import until you confirm they are real catalog history rather than tests, stale inventory, or deleted items.

Files: `candidate-drink-products-first-pass-public.csv`, `candidate-drink-products-second-pass-enabled-private.csv`, and `candidate-drink-products-hold-disabled-or-test.csv`.
