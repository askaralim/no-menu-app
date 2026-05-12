# 酒吧实时酒单系统

一个基于 Next.js 和 Supabase 的实时酒单展示和管理系统。

## 技术栈

- **前端**: Next.js 14 (App Router)
- **后端**: Supabase (PostgreSQL + Realtime)
- **部署**: Cloudflare Pages

## 功能特性

### 展示页面 (`/display`)
- 📱 只读酒单展示
- 🎨 3 套主题切换（深色夜店风 / 简约黑白 / 高端酒吧）
- 🔄 实时同步更新（Supabase Realtime）
- ⏰ 可配置自动刷新

### 管理后台 (`/admin`)
- 📂 分类管理（CRUD）
- 🍷 酒品管理（CRUD）
- ✅ 启用/禁用功能（卖完但不删除）
- 📊 数据统计概览
- ⚙️ 系统设置

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Supabase

1. 在 [Supabase](https://supabase.com) 创建新项目
2. 在 Supabase SQL Editor 中执行 `supabase/install_all_in_one.sql`（**仅新空库**；已部署的生产库不要整文件重跑）。数据库目录说明见 [`supabase/README.md`](supabase/README.md)。
3. 在 Supabase Dashboard 中启用 Realtime：
   - 进入 Database > Replication
   - 按需为 `categories`, `drinks`, `settings`, `orders` 等表启用 Realtime

### 3. 配置环境变量

复制 `.env.local.example` 为 `.env.local` 并填入你的 Supabase 凭证：

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. 运行开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用。

## 项目结构

```
bar-menu-system/
├── app/
│   ├── layout.tsx              # 全局布局
│   ├── globals.css             # 全局样式
│   ├── page.tsx                # 首页（重定向到 /display）
│   │
│   ├── display/
│   │   └── page.tsx            # 酒单展示页
│   │
│   └── admin/
│       ├── layout.tsx          # 后台布局
│       ├── page.tsx            # Dashboard
│       ├── categories/
│       │   └── page.tsx        # 分类管理
│       ├── drinks/
│       │   └── page.tsx        # 酒品管理
│       └── settings/
│           └── page.tsx        # 系统设置
│
├── components/
│   └── menu/
│       ├── CategorySection.tsx  # 分类区块组件
│       └── DrinkItem.tsx       # 酒品项组件
│
├── lib/
│   ├── supabaseClient.ts       # Supabase 客户端
│   └── types.ts                # TypeScript 类型定义
│
├── supabase/
│   ├── README.md               # 说明：public 与 install 脚本职责
│   ├── install_all_in_one.sql  # 新库一键安装（多租户 + RLS + RPC）
│   ├── seed.sql                # 可选示例数据
│   └── seed_platform_super_admin.sql  # 可选平台超管（需先创建 Auth 用户）
│
├── .env.local.example          # 环境变量示例
├── package.json
├── next.config.js
└── README.md
```

## 数据库表结构

### categories（分类表）
- `id`: UUID 主键
- `name`: 分类名称
- `sort_order`: 排序顺序
- `enabled`: 是否启用
- `created_at`: 创建时间

### drinks（酒品表）
- `id`: UUID 主键
- `category_id`: 分类 ID（外键）
- `brand_name`: 品牌（可空）
- `name`: 酒品名称
- `volume_ml`: 标称容量 ml（可空）
- `price`: 价格
- `stock`: 库存（ml，`NULL` 表示不追踪）
- `ml_per_cup`: 每杯扣减 ml（可空）
- `ml_per_bottle`: 每瓶扣减 ml（可空）
- `sort_order`: 排序顺序
- `enabled`: 是否启用（false = 卖完）
- `created_at`: 创建时间

### settings（设置表）
- `id`: UUID 主键
- `theme`: 主题（dark / minimal / luxury）
- `auto_refresh`: 是否自动刷新
- `refresh_interval`: 刷新间隔（秒）
- `updated_at`: 更新时间

## 部署到 Cloudflare Pages

1. 构建项目：
```bash
npm run build
```

2. 在 Cloudflare Pages 中：
   - 连接你的 Git 仓库
   - 构建命令：`npm run build`
   - 输出目录：`out`（重要：不是 `.next`）
   - 环境变量：添加 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Node.js 版本：18 或更高

**注意**：项目已配置为静态导出模式，适用于 Cloudflare Pages。所有页面都使用客户端组件，支持 Supabase Realtime 功能。

## 使用说明

### 管理后台操作

1. **添加分类**
   - 进入「分类管理」
   - 填写分类名称和排序
   - 点击「添加」

2. **添加酒品**
   - 进入「酒品管理」
   - 选择分类、填写名称、价格和排序
   - 点击「添加」

3. **标记卖完**
   - 在酒品列表中，切换「状态」开关
   - 卖完的酒品会在展示页显示为灰色并带删除线

4. **更改主题**
   - 进入「设置」
   - 选择主题并保存
   - 展示页会自动应用新主题

## 注意事项

- 确保 Supabase Realtime 已正确启用
- `enabled = false` 表示酒品卖完但不删除数据
- `sort_order` 用于控制显示顺序（数字越小越靠前）
- 展示页会自动过滤 `enabled = false` 的分类和酒品

### 库存扣减 v1 手工验证

1. 创建“只按杯销售”酒品：设置 `stock` 和 `ml_per_cup`，下单后确认库存按 `杯数 * ml_per_cup` 扣减。
2. 创建“只按瓶销售”酒品：设置 `stock` 和 `ml_per_bottle`，下单后确认库存按 `瓶数 * ml_per_bottle` 扣减。
3. 编辑订单项数量：确认库存按增量差值变化（增加扣减、减少回补）。
4. 删除订单项或整单重建：确认库存回补。
5. `stock = NULL` 的酒品：下单不触发库存扣减。

## 许可证

MIT

