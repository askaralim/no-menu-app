# No Menu AI service

Independent Node.js service for authenticated AI capabilities. The first endpoint extracts structured beer-label data from one or more images with Alibaba Cloud Model Studio. It validates a Supabase access token and checks that the user belongs to at least one manageable venue, but does not write to Supabase.

## API

`POST /api/ai/images/beer-labels`

Headers:

- `Authorization: Bearer <Supabase access token>`
- `Content-Type: image/jpeg`, `image/png`, `image/webp`, or `application/json`

For a single image, send the image bytes as the request body. For multiple images, send up to five Base64 images:

```json
{
  "images": [
    { "mediaType": "image/jpeg", "dataBase64": "..." },
    { "mediaType": "image/png", "dataBase64": "..." }
  ]
}
```

The endpoint returns a draft only. It does not persist the source image or recognition result and does not update a tap list.
Responses without a usable Chinese or English beer name are rejected with `invalid_model_result`; an all-null model object is never returned as a successful draft.

Response fields are intentionally limited to the first product flow:

```json
{
  "requestId": "...",
  "results": [
    {
      "imageOrder": 1,
      "name": "漫长的季节",
      "nameCn": "漫长的季节",
      "nameEn": "One Year Later",
      "beerStyle": "过桶野菌柏林酸小麦",
      "abv": 3.6,
      "brewery": "彼岸酿造",
      "collabBreweries": ["寒武纪", "班利山谷蒸馏所"]
    }
  ]
}
```

## Authentication boundary

On the first request for an access token, the service verifies the current Supabase user and calls `get_my_tenants` once. At least one owner, staff, or super-admin venue membership is required. A successful authorization is cached in memory for up to five minutes, capped by the JWT expiry, so consecutive recognition requests normally make no Supabase calls. Removing a user's venue permission can therefore take at most five minutes to affect this service.

Recognition does not require a tenant ID because it neither reads nor writes tenant data. A future endpoint that accesses a specific tenant must authorize that tenant independently.

Do not make model-backed endpoints anonymous: the API key is billable. The service also applies a small per-user in-memory request limit; use a shared rate-limit store if it is later deployed on more than one instance.

## Image handling

Clients should conditionally resize only large inputs. Recommended mobile policy:

- keep JPEG/WebP images already at or below 5 MB and 2400 px on the long edge;
- otherwise resize the long edge to 2400 px and encode JPEG around 85% quality;
- preserve the original orientation during the conversion;
- upload no more than five images or 15 MB decoded data per request.

Images are held in process memory only long enough to call Model Studio. Application logs must never contain image bytes, Base64 data, prompts, access tokens, or complete model output.

The POS accepts a source image up to 5 MB for recognition. When the same image is later saved as a drink image, the client separately resizes it to a 1200 px long edge and enforces a 2 MB persisted-upload limit. Do not conflate the AI input limit with the media-storage limit.

Client cancellation aborts the client's fetch and causes the UI to ignore a late response. It does not currently propagate cancellation through this service to an Alibaba Cloud request that has already started, so such a request can still complete and be billable.

## Local setup

```sh
cp .env.example .env
set -a
source .env
set +a
npm test
npm start
```

The service binds to `127.0.0.1:8790` by default. Use the checked-in Nginx configuration to expose it.

Single-image smoke request:

```sh
curl -X POST http://127.0.0.1:8790/api/ai/images/beer-labels \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: image/jpeg" \
  --data-binary @beer-label.jpg
```

## Alibaba Cloud Model Studio

Create a China (Beijing) workspace and a custom-permission API key limited to `qwen3.8-flash` and the ECS public egress IP. Set the workspace-specific OpenAI-compatible base URL in `DASHSCOPE_BASE_URL`.

The request explicitly disables thinking and asks for JSON Object output. Multimodal JSON still receives server-side validation before it is returned to a client.

## ECS deployment

The first release can share the existing ECS instance with the media upload service. It is still a separate Unix user, process, environment file, and Nginx route.

Create the runtime user and directory once:

```sh
sudo useradd --system --home /opt/nomenu-ai-service --shell /usr/sbin/nologin nomenu-ai
sudo install -d -o nomenu-ai -g nomenu-ai /opt/nomenu-ai-service
```

Copy only this service's release files into `/opt/nomenu-ai-service`, then install and test them:

```sh
cd /opt/nomenu-ai-service
npm ci --omit=dev
npm test
sudo chown -R nomenu-ai:nomenu-ai /opt/nomenu-ai-service
```

Create `/etc/nomenu-ai-service.env` from `.env.example`, fill the production values without committing them, and protect the file:

```sh
sudo chown root:root /etc/nomenu-ai-service.env
sudo chmod 600 /etc/nomenu-ai-service.env
```

Install `deploy/ai-service/nomenu-ai-service.service` as `/etc/systemd/system/nomenu-ai-service.service`. Add `deploy/ai-service/nginx-location.conf` inside the existing HTTPS server block, then activate the release:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now nomenu-ai-service
sudo nginx -t
sudo systemctl reload nginx
```

Verification:

```sh
curl http://127.0.0.1:8790/healthz
npm test
```

Inspect service status without printing its environment:

```sh
sudo systemctl status nomenu-ai-service
sudo journalctl -u nomenu-ai-service -n 100 --no-pager
```

Correlate a client `requestId` with the structured service log:

```sh
sudo journalctl -u nomenu-ai-service --since today --no-pager | rg '<requestId>'
```

The log records the outcome code, safe validation reason, provider request ID, duration and token usage. It deliberately omits image bytes, access tokens, prompts and model output.

Do not open port `8790` in the ECS security group. Only Nginx should reach it over the loopback interface.
