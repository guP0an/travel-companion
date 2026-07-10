# 部署到 Vercel（让别人也能用）

丸丸前端是纯静态（Vite 打包到 `dist`），DeepSeek 代理是 `api/` 下的 serverless 函数（key 只在服务端）。
Supabase 负责账号/数据。下面把它发布成一个永久 https 链接。

## 当前部署状态（2026-07-10）

- GitHub 仓库已存在：`guP0an/travel-companion`，发布分支为 `master`。
- 本地已关联 Vercel 项目 `travel-companion`（项目 ID 已保存在未提交的 `.vercel/project.json`）。
- Vercel 已连接 GitHub，`master` 推送会自动部署；最新生产部署已验证为 Ready。
- 正式访问地址：`https://travel-companion-two-murex.vercel.app`，页面渲染冒烟检查已通过。
- Vercel Production 环境变量名称已配置；当前 Supabase 项目域名无法解析，登录、云端保存和完整业务链路仍需在更换有效项目后核验。

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

## 二、部署

当前采用 **GitHub + Vercel 自动部署**：

1. 把 `master` 推送到 `origin`。
2. 在 Vercel 项目 `travel-companion` 中确认 Git Repository 指向 `guP0an/travel-companion`，Production Branch 为 `master`。
3. Framework Preset 选择 Vite；Build Command 使用 `pnpm build`（或自动检测），Output Directory 为 `dist`。
4. 在 Settings → Environment Variables 配齐上面 5 个变量，覆盖 Production；需要预览环境时再同步到 Preview。
5. 触发 Production Deployment，记录最终 `https://*.vercel.app` 域名。

本地 CLI 仅作为故障排查备用，不作为当前主流程。

---

## 三、上线后还要做
1. **Supabase 放行线上域名**：Supabase 控制台 → Authentication → URL Configuration，把 `https://你的域名.vercel.app` 加进 Site URL / Redirect URLs，否则邮箱登录回跳会失败。
2. **建表/建桶**（若还没跑）：`supabase/schema.sql`、`supabase/storage.sql`。
3. **防刷（公开前必做）**：当前任何人都能调 `/api/ai` 烧 DeepSeek 额度。至少增加登录校验或简单频率限制。
4. **冒烟测试**：登录 → 生成 → 一句话修改 → 收藏 → 导出 PNG → 账本 → 打卡/照片。

完成后，`https://xxx.vercel.app` 这个链接发给任何人都能用。
