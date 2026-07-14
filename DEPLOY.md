# 部署到 Vercel（让别人也能用）

丸丸前端是纯静态（Vite 打包到 `dist`），DeepSeek 代理是 `api/` 下的 serverless 函数（key 只在服务端）。
Supabase 负责账号/数据。下面把它发布成一个永久 https 链接。

## 当前部署状态（2026-07-14）

- GitHub 仓库已存在：`guP0an/travel-companion`，发布分支为 `master`。
- 本地已关联 Vercel 项目 `travel-companion`（项目 ID 已保存在未提交的 `.vercel/project.json`）。
- Vercel 已连接 GitHub，`master` 推送会自动部署；最新生产部署已验证为 Ready。
- 正式访问地址：`https://travel-companion-two-murex.vercel.app`，页面渲染冒烟检查已通过。
- Vercel Production 已切换到 Supabase 项目 `travel-wanwan`；认证服务健康检查为 200，线上登录已从网络错误恢复为正常鉴权响应。
- Supabase 四张业务表、RLS、照片桶、正式 Site URL 和密码重置回跳均已配置并验证。
- 账本凭证需运行 `supabase/expense-receipts.sql`，增加 `receipt_paths` 并创建私有 `expense-receipts` 桶。
- `/api/ai` 已强制登录并有基础限流；模型返回、天气事实和可选高德事实层均有自动化测试。
- 手机验证码、手机密码和邮箱三种认证界面已完成；页面会读取 Supabase Auth Settings，Phone Provider 未启用时自动保持邮箱入口。
- Supabase Send SMS Hook 与腾讯云 SMS 签名调用已完成；正式开放手机号入口仍需企业短信资质、签名和模板审核。
- 当前官方灾害天气预警已接入生成链路；配置和风天气 API 后，台风、暴雨等生效预警会覆盖行程顶部并约束 AI 调整安排。

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
| `MOONSHOT_API_KEY` | （Kimi 开放平台服务端 Key） | 使用 `kimi-k2.6` 识别票务、机票和酒店截图 |
| `KIMI_BASE_URL` | `https://api.moonshot.cn/v1` | Kimi OpenAI 兼容接口 |
| `KIMI_VISION_MODEL` | `kimi-k2.6` | 多模态识图模型 |
| `AMAP_WEB_SERVICE_KEY` | （可选，高德 Web 服务 Key） | 服务端核验 POI 和同日相邻路线；未配置时自动跳过 |
| `QWEATHER_API_HOST` | （可选，和风天气控制台分配的专属 Host） | 查询目的地当前官方灾害预警 |
| `QWEATHER_API_KEY` | （可选，和风天气 API Key） | 仅服务端使用，不进前端 |
| `SUPABASE_SMS_HOOK_SECRET` | （短信开通时填写） | 校验 Supabase Send SMS Hook 签名 |
| `TENCENTCLOUD_SECRET_ID` | （短信开通时填写） | 腾讯云 SMS 服务端凭据 |
| `TENCENTCLOUD_SECRET_KEY` | （短信开通时填写） | 腾讯云 SMS 服务端凭据 |
| `TENCENT_SMS_SDK_APP_ID` | （短信开通时填写） | 腾讯云短信应用 ID |
| `TENCENT_SMS_SIGN_NAME` | （审核通过的签名） | 验证码短信签名 |
| `TENCENT_SMS_TEMPLATE_ID` | （审核通过的模板 ID） | 验证码模板，首个参数必须是验证码 |
| `VITE_SUPABASE_URL` | `https://pdlpiugjluwztvbpaukf.supabase.co` | 前端连 Supabase（publishable key 受 RLS 保护，可公开） |
| `VITE_SUPABASE_ANON_KEY` | （Supabase 项目的 anon key） | |

> `VITE_` 开头的会在打包时写进前端（公开，没关系）；其余只在 serverless 运行时读取。

### Kimi 识图说明

- 手机上传的图片会先在浏览器缩放到最长边 1800px，并转成压缩 JPEG，减少等待和 Token 消耗。
- 服务端只接收 JPEG/PNG/WebP Data URL，解码后上限约 2MB；丸丸不把图片写入数据库或 Storage。
- Kimi 只返回规划所需的票务/酒店结构，姓名、手机号、证件号、订单号等字段会再次在服务端移除。
- `MOONSHOT_API_KEY` 未配置或 Kimi 暂时失败时，前端自动回退到 Tesseract 本地 OCR + DeepSeek 结构化提取。

---

## 二、部署

当前采用 **GitHub + Vercel 自动部署**：

1. 把 `master` 推送到 `origin`。
2. 在 Vercel 项目 `travel-companion` 中确认 Git Repository 指向 `guP0an/travel-companion`，Production Branch 为 `master`。
3. Framework Preset 选择 Vite；Build Command 使用 `pnpm build`（或自动检测），Output Directory 为 `dist`。
4. 在 Settings → Environment Variables 配齐 DeepSeek 和 Supabase 的必需变量；需要直接识图时增加 Kimi 三项变量，按需增加高德、和风天气及短信变量。覆盖 Production；需要预览环境时再同步到 Preview。
5. 触发 Production Deployment，记录最终 `https://*.vercel.app` 域名。

本地 CLI 仅作为故障排查备用，不作为当前主流程。

---

## 三、上线后还要做
1. **轮换 DeepSeek Key**：旧 Key 作废后同步更新 Vercel Production。
2. **配置高德 Key（可选）**：申请 Web 服务 API Key，写入 `AMAP_WEB_SERVICE_KEY` 后重新部署。
3. **升级防刷**：当前已有登录校验和实例内基础限流；扩大内测前改成持久化限流。
4. **冒烟测试**：登录 → 生成 → 一句话修改 → 收藏 → 导出 PNG → 账本 → 打卡/照片。

### 开通手机号登录

1. 在腾讯云完成企业实名认证、短信应用、签名、验证码模板和运营商实名报备；当前国内验证码短信不支持个人资质直接上线。
2. 把审核通过的腾讯云参数及 `SUPABASE_SMS_HOOK_SECRET` 配到 Vercel Production，Hook 地址为 `https://travel-companion-two-murex.vercel.app/api/send-sms`。
3. Supabase → Authentication → Hooks → Send SMS，启用 HTTP Hook，填入上述地址并保存生成的 Hook Secret。
4. Supabase → Authentication → Providers → Phone 启用 Phone Provider；保持 OTP 最短发送间隔不低于 60 秒，并配置 CAPTCHA、单手机号/IP 频率限制和费用告警。
5. 无需修改前端：页面探测到 `external.phone=true` 后自动开放“手机验证码 / 手机密码”，并把手机验证码作为默认入口。
6. 用一个真实测试手机号验证：验证码登录、手机密码注册、手机密码登录、忘记密码、重复发送限制和账号数据隔离。

### 开通特殊天气预警

1. 在和风天气控制台创建项目和凭据，记录控制台分配的专属 API Host 与 API Key。
2. 在 Vercel Production 配置 `QWEATHER_API_HOST` 和 `QWEATHER_API_KEY` 后重新部署。
3. 系统只为出发前 7 天至出发后 1 天的行程查询当前生效预警；远期行程不会把今天的台风错误套用到未来。
4. 红色/橙色或 severe/extreme 预警会要求 AI 取消高风险户外安排、提供室内替代并把防御建议放到行程顶部；黄色/moderate 预警会增加交通缓冲和装备提醒。
5. 用接近出发日期且有生效预警的城市生成一次行程，检查顶部预警来源、有效期和安全调整。

完成后，`https://xxx.vercel.app` 这个链接发给任何人都能用。
