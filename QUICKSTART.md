# 快速启动指南

## 1. 安装依赖

```bash
npm install
```

## 2. 设置 Supabase

### 2.1 创建 Supabase 项目

1. 访问 [https://supabase.com](https://supabase.com)
2. 创建新项目
3. 等待项目初始化完成

### 2.2 执行 SQL 脚本

1. 在 Supabase Dashboard 中，进入 **SQL Editor**
2. 打开 `supabase/schema.sql` 文件
3. 复制所有 SQL 代码
4. 在 SQL Editor 中粘贴并执行

### 2.3 启用 Realtime

1. 在 Supabase Dashboard 中，进入 **Database** > **Replication**
2. 为以下表启用 Realtime：
   - `categories`
   - `drinks`
   - `settings`

## 3. 配置环境变量

1. 在 Supabase Dashboard 中，进入 **Settings** > **API**
2. 复制以下信息：
   - Project URL
   - anon/public key

3. 在项目根目录创建 `.env.local` 文件：

```env
NEXT_PUBLIC_SUPABASE_URL=你的项目URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon key
```

## 4. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

## 5. 测试应用

### 5.1 访问管理后台

访问 [http://localhost:3000/admin](http://localhost:3000/admin)

### 5.2 添加测试数据

1. 进入「分类管理」，添加几个分类（如：威士忌、鸡尾酒、啤酒）
2. 进入「酒品管理」，为每个分类添加一些酒品
3. 进入「设置」，可以更改主题和刷新间隔

### 5.3 查看展示页

访问 [http://localhost:3000/display](http://localhost:3000/display)

你应该能看到：
- 按分类分组的酒单
- 应用了当前主题的样式
- 实时更新（在管理后台修改数据后，展示页会自动更新）

## 6. 常见问题

### Q: 展示页没有实时更新？
A: 确保在 Supabase Dashboard 中已为相关表启用 Realtime。

### Q: 样式没有应用？
A: 确保在设置中选择了主题，并且浏览器支持 CSS 变量。

### Q: 无法连接 Supabase？
A: 检查 `.env.local` 文件中的环境变量是否正确。

## 7. 部署

### Cloudflare Pages

1. 将代码推送到 Git 仓库
2. 在 Cloudflare Pages 中连接仓库
3. 配置构建设置：
   - 构建命令：`npm run build`
   - 输出目录：`out`（重要：不是 `.next`）
   - Node.js 版本：18 或更高
4. 添加环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. 部署

**重要提示**：
- 输出目录必须是 `out`，不是 `.next`
- 项目已配置为静态导出模式
- 所有功能（包括 Realtime）都通过客户端实现，完全支持静态部署

