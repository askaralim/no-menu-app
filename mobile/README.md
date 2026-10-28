# No Menu Tonight

Home-screen / App Store display name: **No Menu Tonight** (`expo.name` in `app.json`).  
App Store subtitle (listed v1): **酒吧实时酒单管理**.  
**Status (2026-10-25): App Store `1.1.2` build 24 + production OTA live.** The current OTA adds beer-label recognition, unified drink entry, product-pool search parity and the status action sheet. Follow-up hotfixes for the iOS Modal transition and preserving the target tap through recognition/save are verified in production.

Current POS OTA: [`docs/POS_RECOGNITION_OTA_2026-10-23.md`](./docs/POS_RECOGNITION_OTA_2026-10-23.md) · flow: [`docs/DRINK_ENTRY_AND_RECOGNITION_FLOW.md`](./docs/DRINK_ENTRY_AND_RECOGNITION_FLOW.md) · status actions: [`docs/TAPLIST_STATUS_ACTION_FLOW.md`](./docs/TAPLIST_STATUS_ACTION_FLOW.md).

**Next OTA (pending, not live):** when the signed-in account belongs to multiple stores, the store name in the tap-list header is now a visible switch-store entry. It reuses the existing authenticated store-selection flow; single-store accounts are unchanged. This is a JavaScript-only UI change with no schema or native dependency update.

ASC docs: [`docs/APP_STORE_CONNECT_1.1.2.md`](./docs/APP_STORE_CONNECT_1.1.2.md) (current binary) · [`docs/APP_STORE_CONNECT_1.1.1.md`](./docs/APP_STORE_CONNECT_1.1.1.md) (previous) · [`docs/APP_STORE_CONNECT_1.1.0.md`](./docs/APP_STORE_CONNECT_1.1.0.md) (historical) · [`docs/APP_STORE_LISTED_V1.md`](./docs/APP_STORE_LISTED_V1.md) (`1.0.0` baseline) · agent notes: [`AGENTS.md`](./AGENTS.md) · index: [`../docs/INDEX.md`](../docs/INDEX.md).

## iOS release

**Required before `eas build`:** production Supabase URL and anon key must be in the EAS
`production` environment (not only in local `.env` — `.env` is not uploaded to EAS).

```bash
cd mobile
eas env:list --environment production
```

Production routes Supabase Auth, REST, Realtime, Functions, and Storage through the shared ECS
proxy. The current live binary may retain the hosted Supabase URL in EAS for OTA compatibility;
`lib/supabase.ts` maps that exact production URL to the proxy at runtime. Do not change the EAS URL
during an OTA-only release without checking runtime compatibility. Local development continues to
use the Supabase CLI URL from `.env.local.example`.

See [`../docs/ECS_SUPABASE_PROXY.md`](../docs/ECS_SUPABASE_PROXY.md) for the deployed routes,
verification record, OTA commands, and rollback procedure. Rollback requires reverting the runtime
URL mapper; changing the EAS URL alone does not bypass it. The fixed auth storage key preserves
existing POS sessions in either direction.

Then:

```bash
cd mobile
eas build --platform ios --profile production
```

**App Store Connect** (bundle `com.taklip.nomenuapp`): set **Name** to
`No Menu Tonight`. Install a new build for the home-screen label to change.

Brand source files and usage guidance live in [`assets/brand/`](assets/brand/).
Regenerate platform PNGs with `npm run brand:generate`.

If TestFlight opens to a Chinese “应用配置不完整” screen, the build is missing
those two EAS variables — fix env and rebuild (code alone cannot reach production DB).
