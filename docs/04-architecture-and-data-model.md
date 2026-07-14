# 04 · 技术架构 + 行程数据模型

> 本文保留早期架构决策与行程 JSON 设计。当前线上实现已经加入 Supabase、统一 `/api/ai`、Kimi、天气预警与地图事实层；工程现状以 [09 当前技术实现](09-technical-implementation.md) 为准。

> 状态：草稿 · 2026-06-13 · 作者：赛巴斯蒂安 + lord
> 本文是 Phase 1（① 行程规划）的工程地基：技术架构图、行程 JSON 数据模型、数据真实性策略、Key 安全。
> 被 [PRD-v0.1.md](PRD-v0.1.md)（§6 技术方案）与 [02-competitive-analysis.md](02-competitive-analysis.md)（§6 真实性）引用。

---

## 1. 技术架构图

核心约束：**LLM API Key 绝不能进前端**（F12 即可被盗刷）。所以前端永远不直连 DeepSeek，必须经一层 serverless 代理函数中转。

```
┌──────────────────────────────────────────────────────────────┐
│                         浏览器（用户）                          │
│  React + Vite + TS + Tailwind  —— 静态站点，部署在 CDN          │
│                                                                │
│  ┌────────────┐   ┌─────────────┐   ┌──────────────────────┐  │
│  │ 输入/对话页 │ → │  加载态     │ → │ 结果页（渲染行程JSON） │  │
│  │ (提问引导)  │   │ (温柔文案)  │   │  + 一键复制/保存       │  │
│  └────────────┘   └─────────────┘   └──────────┬───────────┘  │
│         │                                       │ 保存          │
│         │ POST /api/plan                        ▼              │
│         │ { destination, days, budget,   ┌─────────────┐       │
│         │   tags, note }                 │ Supabase云库 │       │
│         │                                │ Auth+数据库  │       │
│         ▼                                └─────────────┘       │
└─────────┼──────────────────────────────────────────────────────┘
          │  HTTPS（同源，无 Key）
          ▼
┌──────────────────────────────────────────────────────────────┐
│      Serverless 代理函数（Vercel Functions / CF Workers）      │
│                                                                │
│  · 唯一持有 DEEPSEEK_API_KEY（环境变量，服务端）              │
│  · 校验/限流/拼装 system+user prompt                          │
│  · 调 DeepSeek，response_format=json_object 强制 JSON          │
│  · 把模型返回的行程 JSON 透传给前端                            │
│  · 错误兜底 → 返回温柔文案给前端（不暴露技术错误/不泄 Key）    │
└─────────┼──────────────────────────────────────────────────────┘
          │  HTTPS + Authorization: Bearer（仅服务端可见）
          ▼
┌──────────────────────────────────────────────────────────────┐
│              DeepSeek API（OpenAI 兼容 /chat/completions）      │
│         model: deepseek-chat · 返回结构化行程 JSON             │
└──────────────────────────────────────────────────────────────┘
```

### 1.1 为什么是这套
| 决策 | 选择 | 理由 |
|------|------|------|
| 前端框架 | React + Vite + TS + Tailwind | PRD §11 已拍板；Vite 起手快，TS 给 JSON 模型加类型护栏 |
| 后端 | 极轻 serverless（无数据库） | MVP 只需「藏 Key + 代理」，不引入运维负担 |
| 部署 | Vercel / Cloudflare Pages | 前端静态 + serverless 函数同平台托管，免费、推链接即用 |
| 账号+存储 | Supabase（Auth + Postgres） | 记忆/跨设备/社交的地基；BaaS 零运维。前端 anon key + RLS 直连，详见 §7 |

### 1.2 LLM 供应商：DeepSeek（永久定，2026-06-13 lord 拍板）

**全程用 DeepSeek，不切换其他供应商。** 接口是 OpenAI 兼容的 `/chat/completions`。

- 代理函数里仍抽一个薄客户端 `llm.ts`（封装 endpoint/key/JSON 解析），把对 DeepSeek 的调用收口到一处，方便统一处理重试、校验、错误兜底——这是工程卫生，不是为了换供应商。
- Key 只在服务端代理读（`DEEPSEEK_API_KEY`），前端永不接触。
- ⚠️ 这把 key 曾在聊天明文出现，**正式上线前到 DeepSeek 后台重置一次**。

### 1.3 DeepSeek 调用参数
| 项 | 取值 | 说明 |
|----|------|------|
| 接口 | `POST https://api.deepseek.com/chat/completions` | OpenAI 兼容；鉴权 `Authorization: Bearer $DEEPSEEK_API_KEY` |
| 主模型 | `deepseek-chat` | 通用对话/生成，性价比高，行程生成够用 |
| 推理备选 | `deepseek-reasoner` | 复杂多日跨城路线若要更强推理可切；自带思考、更慢更贵 |
| 强制 JSON | `response_format: {type: "json_object"}` | **必须在 prompt 里显式描述 `Itinerary` 字段结构**——DeepSeek 不按 schema 校验 |
| 温度 | `temperature: 1.0` 左右 | DeepSeek 支持温度调节；生成行程偏创意，1.0 附近即可，过低会刻板 |
| max_tokens | 设足够大（如 8192） | 多日行程 JSON 较长，给够余量免截断 |
| 流式 | 可选 | 结果页若要逐字呈现可开 `stream:true`；否则一次性返回更简单 |

> 注意：DeepSeek 走 OpenAI 兼容那套参数，**没有**模型专属的 schema 强制/思考预算等参数。强制 JSON 靠 `json_object` 模式 + prompt 描述 + 代理侧二次校验三件套。

### 1.4 上下文缓存（DeepSeek 自带，省钱）
DeepSeek 对**重复的前缀**自动做上下文缓存（cache hit 部分计费大幅降低），无需手动声明。
- 想吃到这个红利：把**不变的内容（管家 system prompt）放在每次请求的最前面、保持逐字一致**；动态内容（用户的目的地/脾气）放到后面的 user 消息。
- 铁律：system prompt 里**绝不能插入**当前时间/随机 ID/用户名等每次都变的内容，否则前缀不一致、缓存命中不了。

---

## 2. 接口契约（前端 ↔ 代理）

### 2.1 请求 `POST /api/plan`
```jsonc
{
  "destination": "京都",          // 必填
  "days": 4,                      // 必填 1–15
  "departureDate": "2026-07-10",  // 选填，"" 表示未提供
  "pace": "leisurely",            // 选填: packed | balanced | leisurely（节奏）
  "companions": "couple",         // 选填: solo | couple | friends | family | other
  "mustVisit": ["清水寺"],         // 选填，必去清单，可为 []
  "avoid": "不爱人挤人的网红点",     // 选填，避雷，"" 表示无
  "budgetTier": "moderate",       // 选填: budget | moderate | comfort | custom
  "budgetNote": "大概一万以内",    // 选填，自由文本
  "travelerTags": ["懒觉党", "爱吃", "怕排队"],  // 选填，软性标签（作息/兴趣/交通…）
  "travelerNote": "住祇园附近"     // 选填，自由文本兜底
}
```

### 2.2 响应
- 成功：`200` + 行程 JSON（§3 的 `Itinerary`）。
- 失败：`200` + `{ "ok": false, "friendlyMessage": "管家口吻的温柔报错" }`（前端只展示 friendlyMessage，绝不暴露堆栈/Key）。

> 异常流对齐 [03-user-stories-and-flow.md](03-user-stories-and-flow.md) §4：AI 失败/超时 → 温柔文案 + 「再试一次」；输入不全 → 友好提示。

---

## 3. 行程 JSON 数据模型

这是**前端渲染、模型输出、本地存储三者共用的契约**。下面给 TypeScript 类型（前端用）+ JSON 结构约束要点（写进 prompt 让 DeepSeek 照着产出）+ 一个真实样例。

### 3.1 TypeScript 类型
```ts
// 与结果页渲染、localStorage 历史一一对应
export interface Itinerary {
  meta: ItineraryMeta;
  greeting: string;        // 管家开场白（带性格），对应 PRD §4.2 顶部
  days: DayPlan[];         // 长度 = meta.days
  closing: string;         // 结语
  disclaimer: string;      // 真实性免责提示（固定提示，见 §4）
}

export interface ItineraryMeta {
  destination: string;
  days: number;            // 1–15
  departureDate: string;   // ISO 日期 或 ""
  pace: "packed" | "balanced" | "leisurely";  // 节奏：紧凑/适中/溜达
  companions: "solo" | "couple" | "friends" | "family" | "other";  // 同行人
  mustVisit: string[];     // 必去清单（强约束），可为 []
  avoid: string;           // 避雷（负约束），"" 表示无
  budgetTier: "budget" | "moderate" | "comfort" | "custom";
  budgetNote: string;      // "" 表示未提供
  travelerTags: string[];  // 软性标签：作息/兴趣/怕排队/交通偏好…（见 06 提问库）
  travelerNote: string;    // 自由文本兜底（住处位置等）
  season: string;          // 管家据出发日期推断的季节提示，可为 ""
}

export interface DayPlan {
  dayIndex: number;        // 从 1 开始
  date: string;            // "" 表示未排具体日期
  theme: string;           // 当天主题，如「古都漫步」
  segments: Segment[];     // 固定 3 段：上午/下午/晚上
}

export interface Segment {
  period: "morning" | "afternoon" | "evening";
  items: Item[];           // 该时段的若干安排
}

export interface Item {
  type: "sight" | "food" | "transport" | "rest" | "activity";
  name: string;            // 地点/店名/活动名
  area: string;            // 所在区域，如「东山区」
  why: string;             // 一句为什么推荐（管家视角）
  butlerTip: string;       // "" 或贴心提醒，对应 PRD「管家提醒」
  timeHint: string;        // "" 或时间提示，如「11:00 前到」
  durationHint: string;    // "" 或「约 2 小时」
  costHint: string;        // "" 或「人均 80 元」
  imageQuery: string;      // 取真实配图用的检索词，如「京都 清水寺」；图片由前端/后端按它取，模型不编 URL（防编造）
  confidence: "high" | "medium" | "low";  // 模型对该条真实性的自评，见 §4
}
```

### 3.2 让 DeepSeek 稳定产出此结构的要点
DeepSeek 的 `json_object` 模式只保证「输出是合法 JSON」，**不按 schema 校验字段**。所以结构靠三件套保证：

1. **prompt 里把上面的字段结构、枚举值、每天三段写清楚**（见 [05 §4.1](05-butler-prompt-design.md)），并给一个示例输出。
2. **约定写死**：选填字段用空串 `""` / 空数组 `[]`，不用 `null`；枚举值固定（`budgetTier`/`period`/`type`/`confidence`），简化前端渲染。
3. **代理侧二次校验**（必做）：用 TS 类型 / zod 校验 days 段数、dayIndex 连续、period 三段齐、枚举合法；不合法重试一次或降级温柔提示。

> 校验 schema 落到 `src/schema/itinerary.ts`（TS 类型 + 运行时校验同源，单一事实来源），前端渲染、代理校验都引它。

### 3.3 样例（节选，2 天）
```jsonc
{
  "meta": {
    "destination": "京都", "days": 2, "departureDate": "2026-07-10",
    "pace": "leisurely", "companions": "couple",
    "mustVisit": ["清水寺"], "avoid": "不爱人挤人的网红点",
    "budgetTier": "moderate", "budgetNote": "大概一万以内",
    "travelerTags": ["懒觉党", "爱吃", "怕排队"],
    "travelerNote": "住祇园附近", "season": "盛夏，午后闷热多雷阵雨"
  },
  "greeting": "京都这季节正好，我给您排得松快些，早上不催您起床。午后最热，咱们躲进店里慢慢吃。",
  "days": [
    {
      "dayIndex": 1, "date": "2026-07-10", "theme": "东山慢走",
      "segments": [
        { "period": "morning", "items": [
          { "type": "rest", "name": "睡到自然醒，酒店早餐", "area": "市中心",
            "why": "您不爱早起，第一天不赶", "butlerTip": "", "timeHint": "10:00 前出门即可",
            "durationHint": "", "costHint": "", "confidence": "high" }
        ]},
        { "period": "afternoon", "items": [
          { "type": "sight", "name": "清水寺", "area": "东山区",
            "why": "京都门面，坡道老街顺路逛", "butlerTip": "怕排队的话别赶黄昏，午后人相对少",
            "timeHint": "", "durationHint": "约 2 小时", "costHint": "门票 400 日元",
            "confidence": "high" }
        ]},
        { "period": "evening", "items": [
          { "type": "food", "name": "祇园一带的怀石小店", "area": "祇园",
            "why": "您爱吃，晚上避开正午暑气慢慢吃", "butlerTip": "热门店建议提前订位",
            "timeHint": "", "durationHint": "", "costHint": "人均约 8000 日元",
            "confidence": "medium" }
        ]}
      ]
    }
  ],
  "closing": "两天排得不紧，剩下的力气留给您随心逛。要我换口味或加一天，随时说。",
  "disclaimer": "行程由 AI 生成，景点营业时间/价格请出行前再核实一次。"
  // 注：为简洁，上面 item 省略了 imageQuery；实际每条都应带，值如「京都 清水寺」，供取真实配图
}
```

---

## 4. 数据真实性策略（对齐竞品分析 §6 风险）

AI 行程的通病是**编造景点/瞎报价格**。当前对策分四层：

1. **prompt 层**：在 system prompt 明确「只推真实、知名度高、可被查证的地点；不确定就说不确定，不要编造精确地址/电话/具体价格」。详见 [05-butler-prompt-design.md](05-butler-prompt-design.md) 的防编造段。
2. **服务端事实层**：票务/酒店截图由 Kimi K2.6 直接识图，服务端移除个人字段后作为 `confirmed` 事实，失败时回退本地 OCR + DeepSeek；有出发日期时先查 Open-Meteo；配置和风天气后查询当前生效的官方灾害预警；配置 `AMAP_WEB_SERVICE_KEY` 后核验生成出的 POI、营业时间字段和同日相邻步行路线。优先级为「当前官方预警/用户确认票据 > 工具事实 > 模型推断」。
3. **条件式修复层**：若高德未核验到地点，降低 `confidence` 且不写精确信息；若同日相邻安排步行超过 3.5km 或 60 分钟，要求 DeepSeek只修复交通方式或顺序，不重写无关内容。
4. **模型自评与固定免责**：每个 `Item` 带 `confidence`（high/medium/low），`disclaimer` 固定提示出行前再核实营业时间和价格。

> 当前天气与地图事实主要进入生成与质检上下文，尚未逐条持久化到每个 `Item`。灾害预警例外：服务端会把 `weatherAlerts[]`（预警类型、级别、发布方、发布时间、有效期和防御建议）直接写入行程 JSON，前端展示来源和有效期，避免模型丢失或弱化。下一步可给普通 `Item` 增加 `sources[]`、`verifiedAt`。

---

## 5. 落地顺序（M0 → M1，对齐 PRD 路线图）
1. 先用 **mock 行程 JSON**（就用 §3.3 样例扩充）跑通前端三页 + 渲染 + 复制/保存。**界面先做精致**。
2. 再写 `/api/plan` 代理函数，接 DeepSeek API，本地 `.env.local` 放 Key。
3. 用 lord 真实出行需求当第一份请求验证（PRD §11 待确认项）。
4. 部署 Vercel，发链接。

---

## 6. 导出与配图（Phase 1 差异化，对齐 [08](08-travel-lifecycle-and-moat.md)）

**导出（Phase 1 就做）**——把结果页变成一张能晒的成品，也是增长钩子：
- **图片**：`html-to-image` / `html2canvas` 把结果页 DOM 渲成 PNG，做一张**竖版分享卡**（适合发朋友圈/小红书 → 反向引流）。
- **PDF**：`jsPDF` / `html2pdf.js`，或 PNG 塞进 PDF。
- 纯前端库，CDN 可加载，不碰后端，MVP 可行。

**配图来源**（重要：不编、不爬）：
- ❌ 不用 AI 生成图（会画出不存在的景）；❌ 不爬小红书（无开放 API + 合规 + 脆弱）。
- ✅ MVP 先用**风格化卡片**（暖色块 + icon + 排版），导出已够好看。
- ✅ 接后端后，按 `Item.imageQuery` 从**地图 POI 图库 / 正版图库**取真实照片（可商用授权）。
- 反向利用：把分享卡做得适合发小红书，借它流量引流，而不是爬它数据。

---

## 7. 账号与数据持久化（Supabase · 2026-06-13 lord 拍板）

记忆/跨设备/越用越懂你/社交都靠云端账号，**从 Phase 1 就铺好地基**（不再用 localStorage 兜底）。用 **Supabase**（BaaS）几乎零运维。

### 7.1 用什么
- **Supabase Auth**：登录（先邮箱/OAuth；将来上小程序换微信登录）。
- **Supabase Postgres**：行程、偏好、（未来）足迹/打卡云端存储，跨设备。
- 前端用 **anon key**（可公开）+ **行级安全 RLS** 直连 Supabase——RLS 保证「每个用户只能读写自己的数据」，所以 anon key 进前端是安全的。
- ⚠️ 区分清楚：**anon key 可进前端**（受 RLS 保护）；**service_role key 与 DEEPSEEK_API_KEY 绝不进前端**，只在 serverless。

### 7.2 初步表结构（够 Phase 1 + 为记忆预留）
| 表 | 关键字段 | 用途 |
|----|----------|------|
| `profiles` | id(=auth.uid), nickname, voice_ready | 用户资料、偏好沉淀（越用越懂你） |
| `itineraries` | id, user_id, meta(jsonb), plan(jsonb=Itinerary), created_at | 保存生成的行程（替代 localStorage） |
| （Phase2）`trips` / `checkins` | user_id, city, photos, note, lat/lng | 行后足迹/打卡 → 记忆地图 |

- 每张表开 RLS：`user_id = auth.uid()` 才可读写。
- `plan` 直接存 §3 的 `Itinerary` JSON（jsonb），前端读出即渲染。

### 7.3 数据流变化
- 生成：前端 → serverless 代理 → DeepSeek → 行程 JSON → **写入 `itineraries`（Supabase）**。
- 历史：从 Supabase 拉该用户的 `itineraries`，跨设备可见（替代原 localStorage）。
- 离线兜底：可仍用 localStorage 做缓存，但**真源是 Supabase**。
