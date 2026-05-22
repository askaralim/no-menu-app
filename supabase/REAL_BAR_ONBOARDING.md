# Real bar onboarding (concierge / engineering)

Ops checklist (permissions, bar list, hiding demos) is owned by the team separately. This doc covers **admin + Supabase** steps only.

## Prerequisites

- Log in as **`super_admin`** (see `supabase/seed_platform_super_admin.sql`).
- Production DB has migration **`20260524120000_admin_create_bar_concierge.sql`** applied (or greenfield `install_all_in_one.sql` including that section).

## Per bar (repeat)

1. **平台管理** → **创建酒吧** (name + slug). New bars default to **not** consumer-visible.
2. Click **编辑 Tap List** (or open `/admin/taplist?tenant=<uuid>`).
3. Confirm header: **当前编辑门店** matches the bar.
4. **POS menu** (same tenant): add categories and drinks in **分类管理** / **酒品管理**; enable drinks (`enabled=true`). Tap List admin only lists enabled drinks.
5. On Tap List: storefront → category **[公开]** → per-drink **[公开]** → **编辑 Tap List** (image, status, beer profile, serving options).
6. Preview: consumer app `/bar/<slug>` or `npm run taplist:smoke` (with env pointing at prod/local).
7. When accurate: toggle **门店公开可见** on Tap List admin.

## Roles

| Role | Create bar | Edit Tap List |
|------|------------|---------------|
| `super_admin` | Yes (platform form) | Any bar via picker / `?tenant=` |
| `owner` | No | Own bar(s) only; foreign `?tenant=` ignored |
| `staff` | No | Tap List tab not available |

## Optional owner handoff later

SQL: insert `user_roles` with `role=owner` for the bar’s `tenant_id` (see midnightswim seed pattern). Owner can then use Tap List for their bar only.
