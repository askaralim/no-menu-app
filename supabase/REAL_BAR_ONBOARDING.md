# Real bar onboarding (concierge)

For ~30 bars: **you create the owner account, bind it to the bar, send login via WeChat.**
No SMS OTP. No invite codes for owners.

## Prerequisites

- Log in to web admin as **`super_admin`** (`supabase/seed_platform_super_admin.sql`).
- Apply migrations **`20260720120000_admin_bind_owner.sql`** and **`20260720130000_admin_provision_owner.sql`**.
- Admin web is static-export friendly: owner create/bind runs via Supabase RPC (no Next API routes).

## Per bar

1. Ask owner for **mobile number**.
2. **平台管理** → create bar (or open existing) → **绑定店主** with mobile (+ optional temp password).
3. Copy the WeChat blurb (手机号 + 临时密码) and send to owner.
   See **`OWNER_WECHAT_GUIDE.md`** for the Chinese template store owners actually receive.
4. Owner opens POS (**No Menu Tonight**) → **手机号 + 密码** → first login **改密码** → lands on **今晚酒单**.

Temp passwords are letters+digits only (no `!`), so WeChat copy/paste is less error-prone.

Re-binding the same or a new mobile resets the temp password and replaces the previous owner role on that bar.

## How login works (no SMS)

POS shows “手机号”, but Auth uses a synthetic email:

`13800138000` → `13800138000@owners.nomenu.app`

Password is normal Supabase email/password. SMS is not required.

## Roles

| Role | Create bar / bind owner | Publish storefront | Tonight list |
|------|-------------------------|--------------------|--------------|
| `super_admin` | Yes | Yes (any bar) | Yes |
| `owner` | No | Own bar | Yes |
| `staff` | No | No | Yes |

Staff invites remain available later; owner onboarding does not use them.

## Venue QR (optional, after bar exists)

Permanent venue QR codes are documented in **`TENANT_QR_LINKS.md`**. New codes must be written to
both `tenant_qr_links` and `taplist-web/config/qr-links.json`, then verified with
`supabase/tools/check-qr-links-sync.mjs`.
