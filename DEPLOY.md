# 部署到 Vercel（让别人也能用）

丸丸前端是纯静态（Vite 打包到 `dist`），DeepSeek 代理是 `api/` 下的 serverless 函数（key 只在服务端）。
Supabase 负责账号/数据。下面把它发布成一个永久 https 链接。

## ⚠️ 上线前必做：轮换 DeepSeek key
现用 key 曾在聊天里明文出现，**上线前去 DeepSeek 控制台重置一个新 key**，用新 key 配到 Vercel。
旧 key 作废，避免被盗刷。

---

## 一、需要在 Vercel 配的环境变量
| 变量名 | 值 | 作用 |
|---|---|---|
| `DEEPSEEK_API_KEY` | （新轮换的 key） | 服务端调用 DeepSeek，**不带 VITE_ 前缀，不进前端** |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | |
| `DEEPSEEK_MODEL` | `deepseek-chat` | |
| `VITE_SUPABASE_URL` | `https://eeyivxbmrxoxrlbvulxd.supabase.co` | 前端连 Supabase（anon key 受 RLS 保护，可公开） |
| `VITE_SUPABASE_ANON_KEY` | （Supabase 项目的 anon key） | |

> `VITE_` 开头的会在打包时写进前端（公开，没关系）；其余只在 serverless 运行时读取。

---

## 二、部署（二选一）

### 方式 A：Vercel CLI（最快，不用 GitHub）
需要 Node ≥ 18（本机默认是 v14，先切到 v20）：
```bash
nvm use 20
npm i -g vercel
cd travel-companion
vercel login          # 浏览器登录
vercel                # 首次部署，生成预览链接
# 在 vercel.com 该项目 → Settings → Environment Variables 填上面 5 个变量
vercel --prod         # 正式发布，拿到 xxx.vercel.app 永久链接
```

### 方式 B：GitHub + Vercel 控制台
1. 在 github.com 建一个空仓库（不勾 README）。
2. 把代码推上去：
   ```bash
   git remote add origin <你的仓库地址>
   git push -u origin main
   ```
3. vercel.com → Add New Project → Import 该仓库 → 填上面 5 个环境变量 → Deploy。

---

## 三、上线后还要做
1. **Supabase 放行线上域名**：Supabase 控制台 → Authentication → URL Configuration，把 `https://你的域名.vercel.app` 加进 Site URL / Redirect URLs，否则邮箱登录回跳会失败。
2. **建表/建桶**（若还没跑）：`supabase/schema.sql`、`supabase/storage.sql`。
3. **防刷（建议）**：公开后任何人都能调 `/api/plan` 烧 DeepSeek 额度。后续可加：登录后才可生成、或加简单频率限制。

完成后，`https://xxx.vercel.app` 这个链接发给任何人都能用。
