# 📝 Todo List Web 应用

基于 **Next.js + Supabase + Vercel** 的待办清单。

---

## 功能

- ✅ 添加任务
- ✅ 标记完成（复选框）
- ✅ 删除任务
- ✅ 数据持久化（Supabase 数据库，刷新不丢失）
- ✅ 实时同步（多个设备同时打开自动同步）

---

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量模板，填入你的 Supabase 信息
cp .env.local.example .env.local

# 3. 启动开发服务器
npm run dev
# 打开 http://localhost:3000
```

---

## 🚀 部署步骤（三步搞定）

### Step 1：创建 Supabase 项目

1. 访问 https://supabase.com → Sign Up/Login
2. 点击 **New project**
3. 填写项目名称，选地区（Asia 选 Singapore），点 **Create new project**
4. 等待项目创建（约 2 分钟）

**建表：**

项目创建后进入 **Table Editor** → **Create a new table**

表名：`todos`

勾选 **Enable Row Level Security (RLS)**，然后添加列：

| 列名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | int8 | 自动生成 | 主键 |
| `created_at` | timestamptz | `now()` | 创建时间 |
| `title` | text | — | 任务标题 |
| `completed` | bool | `false` | 是否完成 |

建完表后，进入 **Authentication → Policies**，给 `todos` 表添加一个 policy：
- 点击 **New policy**
- 选 **For full access**（开发阶段允许匿名读写）
- 或者选 **For select using (true)** 等自定义

**获取密钥：**

进入 **Project Settings → API**，复制：
- `URL` → 填到 `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → 填到 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

### Step 2：创建 GitHub 仓库并上传代码

```bash
cd todo-app
git init
git add .
git commit -m "init: todo app"
git branch -M main

# 在 GitHub 新建仓库（不要勾选 README/License）
# 替换下面的 your-username 和 your-repo
git remote add origin https://github.com/your-username/your-repo.git
git push -u origin main
```

---

### Step 3：部署到 Vercel

1. 访问 https://vercel.com → Sign Up/Login（用 GitHub 账号登录最快）
2. 点击 **Add New... → Project**
3. 从列表里找到你的 `todo-app` 仓库，点击 **Import**
4. 在 **Environment Variables** 区域添加两个变量：
   - `NEXT_PUBLIC_SUPABASE_URL` = 你的 Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = 你的 anon key
5. 点击 **Deploy**

等 1-2 分钟，Vercel 会给你生成一个链接（如 `https://todo-app-xxxxx.vercel.app`），打开就能用了！

---

## 技术栈

- [Next.js](https://nextjs.org/) — React 框架
- [Supabase](https://supabase.com/) — 开源 Firebase 替代（PostgreSQL + 实时订阅）
- [Vercel](https://vercel.com/) — 前端托管平台

---

## 项目结构

```
todo-app/
├── pages/
│   ├── _app.tsx          # 全局样式
│   └── index.tsx         # Todo 主页面
├── lib/
│   └── supabase.ts       # Supabase 客户端
├── styles/
│   └── globals.css       # 全局 CSS
├── .env.local.example    # 环境变量模板
├── next.config.js        # Next.js 配置
├── tsconfig.json         # TypeScript 配置
└── package.json
```
