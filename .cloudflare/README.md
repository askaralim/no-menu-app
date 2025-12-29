# Cloudflare Pages 部署说明

## 配置要求

### 1. Build Settings
- **Build command**: `npm run build`
- **Build output directory**: `out`
- **Root directory**: `/` (留空或 `/`)

### 2. Environment Variables
确保在 Cloudflare Pages 设置中添加：
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3. Node.js Version
- 使用 Node.js 18 或更高版本

## 注意事项

由于 Next.js 14 App Router 使用了客户端组件和实时功能，静态导出可能不完全支持所有功能。

如果遇到问题，考虑：
1. 使用 Vercel 部署（Next.js 原生支持）
2. 或使用 `@cloudflare/next-on-pages` 适配器（需要修改配置）

