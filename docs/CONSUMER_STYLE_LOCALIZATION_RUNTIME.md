# Consumer style localization runtime contract

Last verified: 2026-11-10 (Asia/Shanghai)

This is the source of truth for Product Pool English beer styles across Supabase, Consumer Intelligence (ECS), the WeChat mini-program, and consumer iOS/Taplist. It documents runtime delivery only. The frozen Style Localization V1.2 research artifacts remain unchanged.

## Product decision

- English style is owned by the canonical Product Pool row (`public.drink_products`), not by a venue's temporary `public.drinks` row.
- Matching is performed once when a Product Pool product is created or its style is managed in Web Admin. Consumer clients never infer a style from keywords.
- A venue drink linked through `drinks.product_id` inherits the Product Pool English style.
- An unlinked venue drink keeps the existing Chinese/raw style. It intentionally has no generated English style.
- Consumer APIs return an English style only when the stored value is approved. Clients fall back to the raw style when English is absent.

## Stored fields and publication gate

`public.drink_products` stores:

| Column | Meaning |
| --- | --- |
| `beer_style` | Canonical Product Pool raw/Chinese style |
| `beer_style_en` | Materialized consumer English display style |
| `beer_style_en_source` | `dictionary`, `style_key_fallback`, or `manual` |
| `beer_style_en_status` | `approved` or `needs_review` |
| `beer_style_en_version` | Frozen dictionary version, or `manual` |

`beer_style_en_status` is an editorial publication gate, not a language setting and not an E1 classification result. A non-empty value can still be unsafe or awaiting review. Consumer RPCs use the status internally:

```sql
CASE WHEN dp.beer_style_en_status = 'approved'
  THEN dp.beer_style_en
END
```

The status does not need to be exposed to consumer clients. All approved Product Pool values are returned consistently; `needs_review`, unlinked products, and missing values produce `null`, after which the client preserves the raw style. Removing the gate would allow provisional or rejected editorial text to leak into every client.

Production read-only snapshot on 2026-11-10: 2,201 Product Pool rows, 2,158 active, 2,016 with a non-empty raw style, and 1,964 with approved English. Approved sources are 1,937 dictionary, 26 safe style-key fallback, and 1 manual override. There are 237 `needs_review` rows. Thus approved English covers 97.4% of products that currently have a raw style; this is display coverage, not an external-standard match rate.

## Write path

1. Web Admin creates or updates a row in `drink_products`.
2. The database performs an exact `trim(beer_style)` lookup in `nomenu_i18n.style_localization_v12`.
3. `localized_display` and `style_key_safe_fallback` rows are materialized as approved English.
4. `hold_for_manual_review` and unmatched rows remain `needs_review` with no publishable English.
5. A super admin may save a manual English style. Manual values are marked `source=manual`, `status=approved`, `version=manual` and are not overwritten by normal automatic refresh.
6. Web Admin's “恢复词典” action calls `admin_set_drink_product_style_localization(..., 'restore_dictionary', ...)`. It discards a product-level manual override and reruns the exact V1.2 lookup; it does not restore a deleted database column.

The migration also performed a one-time exact-match backfill for existing Product Pool rows. Runtime clients do not run that backfill.

## Read and synchronization paths

### Supabase consumer RPCs

The `_i18n` RPCs join a linked venue drink to its active Product Pool product and return `beer_style_en` only when approved. Relevant endpoints include:

- `get_public_taplist_new_drinks_i18n`
- `search_mini_products_i18n`
- `get_mini_product_i18n`
- public bar/drink and consumer TAP-history `_i18n` variants defined by the localization migration

These remain the source for non-Feed pages such as bars, search, product detail, and TAP history.

### Consumer Intelligence export and ECS worker

The worker calls the service-role-only RPC:

```text
POST /rest/v1/rpc/intelligence_export_snapshot_v1
body: { "p_scope": "catalog" }
```

For every eligible active tap cycle, the catalog export includes:

```json
{
  "style": "浑浊IPA",
  "style_en": "Hazy IPA"
}
```

`style_en` is present only when the drink is linked to a Product Pool product whose English style is approved. The ECS worker copies that value into its catalog projection. No ECS keyword translation or local V1.2 lookup runs during reads.

ECS data is refreshed on the existing worker schedule, so a Product Pool edit becomes visible after the next successful catalog refresh and creation of/read-through into the relevant Feed instance. Existing recommendation ranking and evidence are not recomputed merely because display English changes; `style_en` is excluded from ranking signatures.

## Feed HTTP contract

Base URL:

```text
https://nomenuapp.com
```

Latest example:

```http
GET /api/feed/v1/new-beers?city_code=shanghai&mode=latest&surface=feed_page&feed_instance_id=<uuid>&limit=20
```

For You example:

```http
GET /api/feed/v1/new-beers?city_code=shanghai&mode=for_you&surface=home&feed_instance_id=<uuid>&limit=6
Authorization: Bearer <Supabase consumer access token>
```

Important request rules:

- `mode=latest` can be anonymous.
- `mode=for_you` requires a valid consumer access token; an invalid token is not downgraded to anonymous.
- Generate a new UUID `feed_instance_id` for a new list context. Reuse it only for pagination/re-reading that same instance.
- Home requests at most 6 items; the full Feed requests at most 20. For You home and full Feed for the same Snapshot must keep prefix order.
- If analytics consent is enabled, send both `X-Installation-ID` and `X-Analytics-Session-ID`; send neither when disabled.

Relevant response shape:

```json
{
  "api_version": "1",
  "city_code": "shanghai",
  "mode": "latest",
  "surface": "feed_page",
  "feed_instance_id": "<uuid>",
  "ranking_version": "latest-v1",
  "data_as_of": "<ISO-8601 timestamp>",
  "items": [
    {
      "item_id": "<id>",
      "rank": 1,
      "beer_name": "黄河之水",
      "beer_name_en": null,
      "style": "浑浊IPA",
      "style_en": "Hazy IPA",
      "reason": null
    }
  ],
  "page": {
    "has_more": true,
    "next_cursor": "<opaque cursor>",
    "expires_at": "<ISO-8601 timestamp>"
  },
  "personalization": null,
  "snapshot": null,
  "empty_reason": null
}
```

`style_en` is optional/nullable and display-only. It does not affect eligibility, ranking, Snapshot identity, E1 Taxonomy, λ, or Reason evidence.

## Client display rule

All consumer clients must use the same rule:

```text
Chinese: trim(style)
English: trim(style_en) || trim(style)
```

Clients must not:

- ship or consult the 1,312-row raw-style dictionary at runtime;
- derive English from substrings, modifiers, `style_family`, or E1 `style_key`;
- hide an unlinked drink because English is missing;
- interpret English display availability as external-standard or E1-classification confidence.

This rule means a linked and approved Product Pool item displays English without a client release when its database value changes. An unlinked item safely displays its raw Chinese/original style in English mode, as explicitly accepted by product.

## Recommendation Reason V2

English Reason is separate from product write-time localization. The server freezes structured evidence into the Snapshot; the client renders language from evidence and approved style-key labels. It must not machine-translate frozen Chinese `reason.text`.

- `matched_unique_taps` is the count shown to the user.
- Exact/Broad Exact may describe the recorded style at the evidence's actual granularity.
- Bridge must say “related style” and must not claim the same style.
- A TAP count is not a preference probability.
- Switching language never creates a recommendation or changes ranking.
- Old Reasons without safe structured evidence remain compatible and must not invent personalization.

## Current client state and Taplist parity

Client release status updated 2026-11-11; runtime verification dates remain unchanged:

- WeChat mini-program 1.5.0 was confirmed approved and released by the product owner on 2026-11-11. Develop/trial/release Feed uses the ECS endpoint above when its environment flags are enabled. Home and full Latest render the server `style_en`; the client helper returns `serverStyleEn || rawStyle`. Post-release real-account Reason and campaign-code checks remain pending.
- Mini-program bar, detail, search, TAP, and other non-Feed pages use Supabase `_i18n` RPC values with the same fallback rule.
- Consumer iOS/Taplist already accepts `beer_style_en` on its Supabase RPC DTOs and applies the same fallback for existing screens.
- Consumer iOS/Taplist now has a local ECS Feed adapter, home/full Feed, Reason V2 rendering and first-party instrumentation. It has shipped in the production OTA and received user acceptance; see [implementation and manual acceptance](../taplist-mobile/docs/CONSUMER_INTELLIGENCE_PORT_2026-11-10.md). No joint-activity frontend was ported.

Taplist ECS parity implementation and acceptance must follow this contract:

1. Add a Feed API adapter for `GET /api/feed/v1/new-beers`.
2. Reuse the authenticated Supabase consumer access token for `mode=for_you`.
3. Generate/manage `feed_instance_id` by list context and preserve it for pagination.
4. Decode top-level `feed_instance_id`, `mode`, `ranking_version`, `data_as_of`, nullable `personalization`, `snapshot`, and `empty_reason`; decode `page.has_more/next_cursor/expires_at`; and decode each item's nullable `style_en`, `beer_name_en`, `brewery_en`, `tenant_name_en`, and structured `reason`.
5. Use `style_en || style` in English and `style` in Chinese.
6. Keep existing Supabase `_i18n` RPCs for non-Feed screens unless a separate migration is explicitly approved.
7. Verify home/full prefix, language switching without reranking, anonymous Latest, authenticated For You, old instances, Reason V2, long text, and missing English.

## Deployment and rollback record

The 2026-11-10 ECS internal-test release is:

| Item | Value |
| --- | --- |
| Release | `/opt/no-menu/releases/e1-style-i18n-e42ce93cf00d` |
| Reader SHA-256 | `e42ce93cf00da4a0a951d46c02e34373b6056dc808f7349258516eade90e4482` |
| Previous release | `/opt/no-menu/releases/e1-reason-i18n-a421075018a5` |
| Database migration in this deployment | None |
| Changed runtime files | `src/model.js`, `src/feed.js`, `src/e1/integration.js`, `contracts/schemas/feed/item.schema.json` |

The release only carries approved `style_en` through the existing catalog projection and Feed response, including display refresh when a new instance reads an older Snapshot. It does not modify E1, Taxonomy, Bridge, λ=1.0, candidate eligibility, ranking, Reason evidence, database schema, or production API paths.

Rollback restores the API and worker systemd drop-ins saved with suffix `.before-style-en-20261110`, runs `systemctl daemon-reload`, restarts the API, and starts the worker once. No database rollback is required.

## Change checklist

When changing style localization later:

1. Edit Product Pool localization through Web Admin/database migration, not client dictionaries.
2. Preserve manual overrides unless the operator explicitly chooses “恢复词典”.
3. Ensure consumer RPCs and `intelligence_export_snapshot_v1('catalog')` publish only approved values.
4. Keep display fields out of ranking and Snapshot evidence signatures.
5. Update this document, service OpenAPI/schema fixtures, mini-program tests, and Taplist tests together when the HTTP response contract changes.
6. Do not treat English coverage as external-standard match rate.
