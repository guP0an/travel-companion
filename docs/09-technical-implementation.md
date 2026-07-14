# 09 · 当前技术实现说明

> 状态：当前有效  
> 最近更新：2026-07-14  
> 用途：描述线上代码实际如何工作。`04-architecture-and-data-model.md` 保留早期架构决策与行程模型，本文件是当前工程真源。

## 1. 系统结构

```text
手机/桌面浏览器
  ├─ React + Vite + TypeScript 前端
  ├─ Supabase Auth：邮箱；手机号流程待供应商开放
  ├─ Supabase Postgres：行程、账本、打卡
  └─ Supabase Storage：打卡照片
          │
          └─ POST /api/ai + Supabase Access Token
                    │
                    ├─ DeepSeek：生成、修改、OCR 文本结构化
                    ├─ Kimi K2.6：票务/酒店截图视觉识别
                    ├─ Open-Meteo：天气预报
                    ├─ 和风天气：当前官方灾害预警（配置后）
                    └─ 高德 Web 服务：POI/路线核验（配置后）

部署：GitHub master → Vercel Production
```

## 2. 技术栈

| 层 | 实现 |
|---|---|
| 前端 | React 19、Vite 6、TypeScript |
| 样式 | 项目 CSS 变量与响应式布局 |
| AI 服务端 | Vercel Function `api/ai.ts` |
| 认证与数据库 | Supabase Auth + Postgres + RLS |
| 图片存储 | Supabase Storage `checkin-photos` |
| 行程模型 | DeepSeek `deepseek-chat` |
| 视觉模型 | Kimi `kimi-k2.6` |
| 部署 | Vercel，GitHub `master` 自动部署 |
| 测试 | TypeScript build + Node test runner |

## 3. 代码地图

| 路径 | 责任 |
|---|---|
| `src/App.tsx` | 产品主工作台、页面切换、保存和 PNG 导出 |
| `src/components/PlanForm.tsx` | 规划输入、图片压缩、Kimi/OCR 识别入口 |
| `src/components/ResultView.tsx` | 行程、天气预警、打卡和编辑展示 |
| `src/components/AuthBar.tsx` | 邮箱、手机验证码/密码、找回密码流程 |
| `src/lib/plan.ts` | 前端 `/api/ai` 客户端与登录令牌 |
| `src/lib/db.ts` | 行程、账本、打卡和照片的 Supabase 操作 |
| `src/types/itinerary.ts` | 前端、模型输出和云端存储共用的行程契约 |
| `api/ai.ts` | AI 鉴权、限流、请求校验、事实查询、模型调用和降级 |
| `api/send-sms.ts` | Supabase Send SMS Hook 与腾讯云短信调用 |
| `supabase/schema.sql` | 当前四张业务表、触发器和 RLS |
| `tests/api-security.test.mjs` | 服务端安全、模型边界和事实工具测试 |

## 4. `/api/ai` 接口

所有操作使用同一入口：

```http
POST /api/ai
Authorization: Bearer <Supabase access token>
Content-Type: application/json
```

未登录返回 401；实例内超过基础频率限制返回 429；请求体超过约 3MB 返回 413。

| `body.op` | 主要输入 | 处理 |
|---|---|---|
| `plan` | destination、days、pace、偏好、日期、票据事实 | 查询天气/预警 → DeepSeek 生成 → 可选高德核验与局部修复 |
| `revise` | plan、instruction | DeepSeek 只修改相关内容，返回完整行程 |
| `vision` | JPEG/PNG/WebP Data URL | Kimi K2.6 识图并返回脱敏 booking |
| `extract` | OCR text | 文本脱敏后由 DeepSeek 结构化 booking |

模型输出在服务端执行运行时校验，不符合 `Itinerary` 基本结构时不会直接进入前端。

## 5. 关键数据流

### 5.1 生成行程

```text
PlanForm
  → 获取 Supabase Session
  → POST /api/ai { op: "plan", ... }
  → 验证 token、限流和参数
  → 地理编码 + 天气 + 可选灾害预警
  → DeepSeek 生成结构化 Itinerary
  → 可选高德 POI/步行路线核验
  → 发现问题时仅局部修复
  → 前端 ResultView 渲染
```

### 5.2 识别截图

```text
用户选择图片
  → 浏览器最长边缩放到 1800px 并转 JPEG
  → POST /api/ai { op: "vision", image }
  → 服务端限格式、限大小
  → Kimi K2.6 返回 booking JSON
  → 服务端再次移除姓名/手机号/证件/订单等字段
  → 失败则前端执行 Tesseract OCR
  → OCR 文本脱敏后交给 DeepSeek 结构化
```

丸丸不把票据原图写入数据库或 Storage。图片会发送给 Kimi 完成识别；这项数据使用说明放入隐私政策或上传说明，不在主操作区展示模型、OCR 等内部实现细节。

### 5.3 保存和读取

- 行程：`itineraries.meta` + `itineraries.plan` JSONB。
- 账本：`expenses`，可关联行程。
- 打卡：`checkins`，以用户和景点唯一。
- 照片：上传到 `checkin-photos/<user-id>/...`。
- 所有业务表启用 RLS，只允许当前用户访问自己的记录。

## 6. 数据表

| 表 | 当前用途 |
|---|---|
| `profiles` | 用户资料；偏好字段尚未扩展 |
| `itineraries` | 收藏的完整行程 |
| `expenses` | 消费账本 |
| `checkins` | 景点评分、点评、打卡和照片 URL |

RAG 第一版计划增加 `profiles.preferences`、`item_feedback` 和 `user_memories`，详见 [10-memory-and-rag.md](10-memory-and-rag.md)。

## 7. 环境变量

必需：

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

按功能启用：

- Kimi：`MOONSHOT_API_KEY`、`KIMI_BASE_URL`、`KIMI_VISION_MODEL`
- 高德：`AMAP_WEB_SERVICE_KEY`
- 和风天气：`QWEATHER_API_HOST`、`QWEATHER_API_KEY`
- 腾讯云短信：见根目录 `DEPLOY.md`

任何模型、短信或 service role 密钥都不得进入 `VITE_` 变量或前端代码。

## 8. 安全边界

- `/api/ai` 强制 Supabase 登录令牌。
- 服务端限制请求体、天数、文本长度、图片格式和图片大小。
- 模型 Key 仅存在于 Vercel 服务端环境变量。
- 票据文本和结构化结果移除不需要的个人信息。
- 数据库通过 RLS 做用户隔离。
- 当前限流仅在单个 serverless 实例内，扩大内测前需要持久化限流。
- 打卡照片当前使用公开 URL，扩大内测前需要复核隐私和访问策略。

## 9. 测试与发布

本地验证：

```bash
pnpm test
pnpm build
```

当前自动化测试覆盖 14 项，包括：鉴权、限流、参数边界、行程结构、Kimi 多模态请求、票据脱敏、天气、预警、高德、手机号规范化和短信 Hook。

发布流程：

1. 运行测试和生产构建。
2. 提交并推送 GitHub `master`。
3. Vercel 自动生成 Production Deployment。
4. 检查 GitHub commit status 为 success。
5. 线上执行登录、生成、识图、收藏、账本和打卡冒烟。

## 10. 当前已知缺口

- Kimi Key 已配置并重新部署，仍需登录后上传真实票务截图完成最终冒烟。
- 高德和和风天气代码已接入，线上凭据尚未全部配置。
- 手机认证等待短信企业资质、签名、模板和 Supabase Phone Provider。
- 用户偏好尚未结构化沉淀并反哺生成。
- 通用模型格式错误尚未自动重试。
- 限流尚未持久化。

部署操作细节以根目录 [DEPLOY.md](../DEPLOY.md) 为准。
