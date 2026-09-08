# No Menu media upload service

Small Node.js service for issuing short-lived OSS PUT URLs. It verifies the caller's Supabase access token, calls `get_my_tenants` with that user's auth context, and uses the ECS instance RAM role to sign uploads. It does not store a permanent Alibaba Cloud AccessKey.

## API

`POST /api/media/upload-url`

Headers:

- `Authorization: Bearer <Supabase access token>`
- `Content-Type: application/json`

Body:

```json
{
  "tenantId": "tenant UUID",
  "objectPath": "tenant UUID/drinks/drink UUID/image.jpg",
  "contentType": "image/jpeg",
  "contentLength": 123456
}
```

The service accepts JPEG, PNG, and WebP paths under `cover`, `drinks/{uuid}`, or `events/{uuid}`, up to 2MB as declared by the client. The returned PUT request must include the exact `Content-Type` header.

## ECS configuration

Copy `.env.example` to `/etc/nomenu-media-upload.env`, set production values, and restrict it to root (`chmod 600`). Set `CORS_ORIGINS` to every Web Admin origin, comma-separated. The service binds only to `127.0.0.1`; expose it through the checked-in Nginx location.

The RAM role is loaded through ECS IMDSv2 by `@alicloud/credentials`. No `OSS_ACCESS_KEY_ID` or `OSS_ACCESS_KEY_SECRET` is used.

## Verification

```sh
npm ci
npm test
curl http://127.0.0.1:8787/healthz
```

The 2MB check protects normal Web/POS clients and rejects incorrect declarations at the signing endpoint. OSS PUT presigned URLs do not support a `content-length-range` policy, so a hostile custom client could lie about the size. Use a proxy upload or POST policy if a hard OSS-side byte limit becomes mandatory.
