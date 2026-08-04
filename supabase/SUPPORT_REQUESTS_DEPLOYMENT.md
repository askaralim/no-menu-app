# Support requests deployment

The files are prepared but are not deployed automatically.

1. Apply `migrations/20260806120000_support_requests.sql` to the linked Supabase project.
2. Create a long random `SUPPORT_RATE_LIMIT_SALT` Edge Function secret.
3. Deploy `submit-support-request` with normal JWT verification enabled; the public website sends the project anon JWT.
4. Verify `https://nomenuapp.com/support` can submit and returns an `NM-XXXXXXXX` request number.
5. Sign in as a platform super admin and verify `/admin/platform/support` can update request status.
6. Sign in to No Menu Tonight and verify Account → 申请删除账号 creates one traceable request and duplicate submissions reuse it.

Required secret:

```text
SUPPORT_RATE_LIMIT_SALT=<long-random-secret>
```

The Edge Function stores only a salted SHA-256 IP hash for one-hour rate limiting. It does not store the raw IP address.

