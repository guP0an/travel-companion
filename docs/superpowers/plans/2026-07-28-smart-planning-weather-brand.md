# 丸玩智能规划、天气幕布与独立账本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让丸玩在信息不足时主动追问，生成带可靠日期与天气幕布的行程，并让每趟行程使用独立账本。

**Architecture:** 在现有 `/api/ai` 前增加一个 JSON `intake` 阶段，以确定性规则检查必填信息；准备完成后复用现有 `plan` 生成。天气继续使用 Open-Meteo，由一个纯映射函数和单个 React 幕布组件渲染。账本直接启用已有的 `expenses.itinerary_id`，以行程 ID 查询、写入和归档。

**Tech Stack:** React 18、TypeScript、Vite、原生 CSS/SVG、Supabase、DeepSeek Chat Completion、Open-Meteo、Node test runner。

## Global Constraints

- 不增加运行时或测试依赖。
- 用户可见品牌统一为“丸玩”。
- 保留 `wanwantrip.online`、`wanwan_*`、内部邮箱后缀、Supabase 项目名、仓库名和包名。
- 天气只能来自 Open-Meteo；超出预报范围时不渲染幕布或占位。
- 动画必须支持 `prefers-reduced-motion`。
- 新消费必须关联 `itinerary_id`；旧的空关联消费进入“历史未归档”。
- 每个任务先写一个会失败的最小检查，再写实现。

---

### Task 1: 需求理解与主动追问协议

**Files:**
- Create: `shared/planning.ts`
- Modify: `api/ai.ts`
- Modify: `src/lib/plan.ts`
- Test: `tests/api-security.test.mjs`

**Interfaces:**
- Produces: `resolveRelativeDepartureDate(text, today)`, `intakeQuestions(draft)`, `IntakeDraft`, `IntakeResult`, `intakePlan(input)`.
- Consumes: 现有 `aiRequest`, `chat`, `ApiError`, `PlanInput`.

- [ ] **Step 1: 写需求理解的失败测试**

在 `tests/api-security.test.mjs` 导入纯函数并加入：

```js
test('planning intake resolves this weekend and asks only blocking questions', () => {
  assert.equal(resolveRelativeDepartureDate('这周末去东京', '2026-07-28'), '2026-08-01')
  assert.deepEqual(intakeQuestions({
    request: '这周末去日本',
    destination: '日本',
    countryOnly: true,
    departureDate: '2026-08-01',
    days: 3,
    weekendMentioned: true,
    companions: '',
    departureCity: '',
  }), [
    '你从哪座城市出发？',
    '日本准备去哪座城市或地区？',
    '这周末是 8月1日至2日；你想玩2天，还是按当前设置玩3天？',
    '这次和谁一起去？',
  ])
})

test('API accepts intake requests and rejects malformed intake state', () => {
  assert.doesNotThrow(() => validateApiBody({
    op: 'intake',
    request: '这周末去日本',
    days: 3,
    pace: 'leisurely',
    today: '2026-07-28',
    timezone: 'Asia/Shanghai',
  }))
  assert.throws(() => validateApiBody({ op: 'intake', request: '', days: 3 }), ApiError)
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm test`

Expected: FAIL，提示 `resolveRelativeDepartureDate` 或 `intakeQuestions` 未导出，且 `intake` 被判为未知操作。

- [ ] **Step 3: 实现纯规则和 intake API**

在 `shared/planning.ts` 定义：

```ts
export interface IntakeDraft {
  request: string
  departureCity: string
  destination: string
  countryOnly: boolean
  departureDate: string
  days: number
  weekendMentioned: boolean
  companions: '' | 'solo' | 'couple' | 'friends' | 'family' | 'other'
  pace: 'packed' | 'balanced' | 'leisurely'
  budgetTier: 'budget' | 'moderate' | 'comfort' | 'custom'
  travelerNote: string
}

export interface NormalizedPlanInput {
  destination: string
  departureCity: string
  departureDate: string
  days: number
  pace: IntakeDraft['pace']
  companions: Exclude<IntakeDraft['companions'], ''>
  budgetTier: IntakeDraft['budgetTier']
  budgetNote?: string
  mustVisit?: string[]
  avoid?: string
  travelerTags?: string[]
  travelerNote: string
  ticketText?: string
}

export type IntakeResult =
  | { status: 'needs_input'; questions: string[]; draft: IntakeDraft }
  | { status: 'ready'; input: NormalizedPlanInput }

export function resolveRelativeDepartureDate(text: string, today: string): string
export function intakeQuestions(draft: IntakeDraft): string[]
```

`resolveRelativeDepartureDate` 只确定性处理 `这周末/本周末`：以 `today` 为本地日期，计算最近的周六；其他无法唯一确定的表达返回空串。`intakeQuestions` 按测试固定顺序返回问题；预算和兴趣不阻塞。

在 `api/ai.ts`：

- 将合法操作扩展为 `plan|intake|extract|vision|revise`；
- 新增 `INTAKE_PROMPT`，要求只输出 `IntakeDraft` JSON；
- 新增 `intake(input, env, fetcher)`：调用 DeepSeek 解析已有信息，用纯函数覆盖周末日期并生成问题；
- 用户补充时把 `draft` 与 `answer` 一起发给模型更新；
- `buildUser` 明确写入已确认的 `departureCity`，不再默认只有“中国大陆”这一粒度；
- `handleApiRequest` 对 `intake` 返回 `IntakeResult`；
- `chat` 默认模型从 `deepseek-chat` 改为 `deepseek-v4-flash`。

在 `src/lib/plan.ts` 新增：

```ts
export interface IntakeInput {
  request: string
  days: number
  pace: NonNullable<PlanInput['pace']>
  today: string
  timezone: string
  draft?: IntakeDraft
  answer?: string
}

export async function intakePlan(input: IntakeInput): Promise<IntakeResult> {
  return aiRequest({ op: 'intake', ...input })
}
```

并让 `PlanInput` 扩展 `NormalizedPlanInput`，shared 层不得反向导入 `src`。

- [ ] **Step 4: 运行测试并确认通过**

Run: `pnpm test`

Expected: PASS，原有 plan/extract/revise 测试仍通过。

- [ ] **Step 5: 提交**

```bash
git add shared/planning.ts api/ai.ts src/lib/plan.ts tests/api-security.test.mjs
git commit -m "feat: add planning intake and clarification rules"
```

### Task 2: 表单中的多轮追问

**Files:**
- Modify: `src/components/PlanForm.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `intakePlan`, `IntakeDraft`, `IntakeResult`, `generatePlan`.
- Produces: `PlanForm` 内部的 `intake` 状态与追问卡片；`PendingExpense`；`onResult(itinerary, pendingExpenses?)`.

- [ ] **Step 1: 实现最小多轮流程**

在 `PlanForm.tsx`：

- 增加 `intakeDraft`、`questions` 状态；
- 新行程点击按钮时先调用 `intakePlan`，传入本地 `today` 与 `Intl.DateTimeFormat().resolvedOptions().timeZone`；
- `needs_input` 时保存草稿并显示问题，不调用 `generatePlan`；
- 用户下一次提交时把输入作为 `answer`，最多三轮；
- `ready` 时清空追问状态并调用 `generatePlan(result.input)`；
- 已有行程的修改分支继续直接调用 `revisePlan`；
- 重置行程时一并清空草稿与问题。

追问卡片使用：

```tsx
{questions.length > 0 && (
  <section className="intake-questions" aria-live="polite">
    <div className="font-serif">丸玩还需要确认</div>
    {questions.map((question) => <p key={question}>{question}</p>)}
  </section>
)}
```

CSS 只增加一块浅青纸张背景、细边框与移动端间距，不新增布局系统。

在 `src/lib/plan.ts` 定义票据延迟记账契约：

```ts
export interface PendingExpense {
  category: string
  amount: number
  note: string
  receiptFile?: File
}
```

- [ ] **Step 2: 运行已有 intake 行为测试与构建**

Run: `pnpm test && pnpm build`

Expected: PASS；Task 1 的真实 intake 合约覆盖分支逻辑，UI 交互留到浏览器验收。

- [ ] **Step 3: 提交**

```bash
git add src/components/PlanForm.tsx src/index.css
git commit -m "feat: ask for missing trip details before planning"
```

### Task 3: 确定性日期与天气视觉分类

**Files:**
- Modify: `api/ai.ts`
- Create: `shared/weather.ts`
- Modify: `src/lib/weather.ts`
- Create: `tests/weather.test.mjs`
- Test: `tests/api-security.test.mjs`

**Interfaces:**
- Produces: `applyItineraryDates(plan, departureDate)`, `forecastableDates(dates, today)`, `weatherVisual(code, windMax)`.
- Consumes: `Itinerary`, `DayWeather`, WMO 日天气代码。

- [ ] **Step 1: 写日期和天气分类失败测试**

创建 `tests/weather.test.mjs`：

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { forecastableDates, weatherVisual } from '../node_modules/.tmp-tsnode/shared/weather.js'

test('weather visual distinguishes rain and snow intensity', () => {
  assert.deepEqual(weatherVisual(61, 8), { kind: 'rain', intensity: 'light', windy: false })
  assert.deepEqual(weatherVisual(65, 12), { kind: 'rain', intensity: 'heavy', windy: false })
  assert.deepEqual(weatherVisual(75, 42), { kind: 'snow', intensity: 'heavy', windy: true })
})

test('forecast dates keep only the next sixteen days', () => {
  assert.deepEqual(
    forecastableDates(['2026-07-28', '2026-08-12', '2026-08-13'], '2026-07-28'),
    ['2026-07-28', '2026-08-12'],
  )
})
```

在 `tests/api-security.test.mjs` 加入：

```js
test('confirmed departure date deterministically fills every itinerary day', () => {
  const dated = applyItineraryDates(structuredClone({ ...itinerary, meta: { ...itinerary.meta, days: 3 }, days: [
    itinerary.days[0],
    { ...itinerary.days[0], dayIndex: 2 },
    { ...itinerary.days[0], dayIndex: 3 },
  ] }), '2026-08-01')
  assert.deepEqual(dated.days.map((day) => day.date), ['2026-08-01', '2026-08-02', '2026-08-03'])
})
```

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm test`

Expected: FAIL，三个纯函数尚不存在。

- [ ] **Step 3: 实现日期与天气纯函数**

在 `api/ai.ts` 导出 `applyItineraryDates`，在 `generate` 的模型结果通过结构校验后立刻用已确认 `departureDate` 覆盖每日日期。

在 `shared/weather.ts`：

```ts
export type WeatherKind = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'storm'
export type WeatherIntensity = 'light' | 'medium' | 'heavy'

export function weatherVisual(code: number, windMax = 0): {
  kind: WeatherKind
  intensity: WeatherIntensity
  windy: boolean
}

export function forecastableDates(dates: string[], today: string): string[]
```

雨雪强度按 WMO 代码映射；`windMax >= 38` 为大风。在 `src/lib/weather.ts` 导入这些纯函数；`fetchWeather` 只请求 `forecastableDates`，并从 Open-Meteo 读取 `wind_speed_10m_max`。

- [ ] **Step 4: 运行测试**

Run: `pnpm test`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add api/ai.ts shared/weather.ts src/lib/weather.ts tests/weather.test.mjs tests/api-security.test.mjs
git commit -m "feat: guarantee trip dates and classify weather scenes"
```

### Task 4: 横向天气幕布

**Files:**
- Create: `src/components/WeatherScene.tsx`
- Modify: `src/components/ResultView.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `DayWeather`, `weatherVisual`.
- Produces: `<WeatherScene weather={weather} />`.

- [ ] **Step 1: 实现幕布**

`WeatherScene.tsx` 只生成确定性粒子：

```tsx
export default function WeatherScene({ weather }: { weather: DayWeather }) {
  const visual = weatherVisual(weather.code, weather.windMax)
  const count = visual.intensity === 'heavy' ? 34 : visual.intensity === 'medium' ? 24 : 16
  return (
    <div className={`weather-scene weather-${visual.kind} weather-${visual.intensity}${visual.windy ? ' weather-windy' : ''}`} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <i key={index} style={{
          '--weather-x': `${(index * 37) % 101}%`,
          '--weather-delay': `${-((index * 29) % 17) / 10}s`,
          '--weather-duration': `${0.65 + ((index * 13) % 9) / 10}s`,
        } as React.CSSProperties} />
      ))}
    </div>
  )
}
```

在 `ResultView` 的每日标题行仅当 `weather[day.date]` 存在时渲染幕布和温度。CSS 使用绝对定位铺满整行；雨是细斜线且起点/时长错开，雪是浅色细小圆点，云层和日光用伪元素，大风加弧形横线。文字层 `z-index: 1`，背景不降低可读性。

- [ ] **Step 2: 运行天气纯函数测试与构建**

Run: `pnpm test && pnpm build`

Expected: 全部通过。

- [ ] **Step 3: 提交**

```bash
git add src/components/WeatherScene.tsx src/components/ResultView.tsx src/index.css
git commit -m "feat: render animated daily weather scenes"
```

### Task 5: 行程 ID 贯穿账本数据层

**Files:**
- Create: `shared/ledger.ts`
- Modify: `src/lib/db.ts`
- Modify: `supabase/schema.sql`
- Create: `supabase/ledger-itineraries.sql`
- Create: `tests/ledger.test.mjs`
- Modify: `tests/supabase-migration.test.mjs`

**Interfaces:**
- Produces: `groupLedgerDirectory(trips, expenses)`, `listExpenses(itineraryId?)`, `addExpense(expense, files)`, `expenseExists(itineraryId, expense)`, `assignExpenseToItinerary(expenseId, itineraryId)`.
- Consumes: `SavedItinerary`, Supabase `expenses.itinerary_id`.

- [ ] **Step 1: 写账本分组失败测试**

创建 `tests/ledger.test.mjs`：

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { groupLedgerDirectory } from '../node_modules/.tmp-tsnode/shared/ledger.js'

test('ledger directory separates trips from unassigned history', () => {
  const groups = groupLedgerDirectory(
    [
      { id: 'hk', meta: { destination: '香港', days: 2 }, plan: {}, created_at: '2026-07-01' },
      { id: 'jp', meta: { destination: '日本', days: 3 }, plan: {}, created_at: '2026-07-28' },
    ],
    [
      { id: '1', itinerary_id: 'hk', amount: 600 },
      { id: '2', itinerary_id: null, amount: 614 },
    ],
  )
  assert.equal(groups.find((group) => group.id === 'hk').total, 600)
  assert.equal(groups.find((group) => group.id === 'jp').total, 0)
  assert.equal(groups.find((group) => group.id === null).total, 614)
})
```

在迁移测试断言复合索引：

```js
assert.match(schema, /expenses_user_itinerary_idx.*user_id, itinerary_id/)
```

- [ ] **Step 2: 运行并确认失败**

Run: `pnpm test`

Expected: FAIL，`groupLedgerDirectory` 或索引不存在。

- [ ] **Step 3: 实现数据关联**

在 `shared/ledger.ts` 实现纯分组函数，返回每趟行程和一个 `{ id: null, destination: '历史未归档' }` 分组。

在 `src/lib/db.ts`：

- `Expense` 增加 `itinerary_id: string | null`；
- 所有消费查询 select `itinerary_id`；
- `listExpenses(undefined)` 返回全部，传字符串时 `.eq('itinerary_id', id)`，传 `null` 时 `.is('itinerary_id', null)`；
- `addExpense` 的输入要求 `itinerary_id: string` 并写入；
- `expenseExists` 第一个参数为行程 ID，并加入 `.eq('itinerary_id', id)`；
- 新增 `assignExpenseToItinerary(id, itineraryId)`。

在 `supabase/schema.sql` 增加：

```sql
create index if not exists expenses_user_itinerary_idx
  on public.expenses (user_id, itinerary_id, created_at desc);
```

创建可重复执行的线上增量脚本 `supabase/ledger-itineraries.sql`：

```sql
alter table public.expenses
  add column if not exists itinerary_id uuid references public.itineraries (id) on delete set null;

create index if not exists expenses_user_itinerary_idx
  on public.expenses (user_id, itinerary_id, created_at desc);
```

迁移测试同时检查干净建库和增量脚本都包含关联列与索引。

- [ ] **Step 4: 运行测试**

Run: `pnpm test`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add shared/ledger.ts src/lib/db.ts supabase/schema.sql supabase/ledger-itineraries.sql tests/ledger.test.mjs tests/supabase-migration.test.mjs
git commit -m "feat: scope expenses to saved itineraries"
```

### Task 6: 账本目录、当前行程与历史归档

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/SavedTrips.tsx`
- Modify: `src/components/Ledger.tsx`
- Modify: `src/components/PlanForm.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `SavedItinerary.id`, `groupLedgerDirectory`, trip-scoped expense functions.
- Produces: `activeTripId`, 当前行程账本、账本目录和旧账归档入口。

- [ ] **Step 1: 实现行程与账本状态**

在 `App.tsx`：

- 增加 `activeTripId` 和 `pendingExpenses`；
- `SavedTrips.onOpen` 接收整条记录并设置 `data` 与 `activeTripId`；
- 新生成行程把 `activeTripId` 重置为 `null`；
- 抽出 `ensureCurrentTripSaved()`：已有 ID 直接返回；没有则调用一次 `saveItinerary(data)`；
- `onSave` 与打开账本都复用该函数，避免重复插入；
- 打开账本时把 `activeTripId` 传给 `Ledger`。

在 `PlanForm.tsx` 停止上传票据时立即写入全局账本，把带金额的识别结果通过 `onResult` 的第二个参数交给 `App`；行程保存后由 `App` 用行程 ID 写入本次账本。

在 `Ledger.tsx`：

- 初始显示当前行程账目；
- “账本目录”列出分组、目的地、日期和总额；
- “历史未归档”显示旧的空关联消费；
- 旧账每行使用原生 `<select>` 选择用户自己的已保存行程，再调用 `assignExpenseToItinerary`；
- 返回当前行程后重新加载，香港旧账不会出现在日本账本。

- [ ] **Step 2: 运行账本纯函数测试与构建**

Run: `pnpm test && pnpm build`

Expected: 全部通过。

- [ ] **Step 3: 提交**

```bash
git add src/App.tsx src/components/SavedTrips.tsx src/components/Ledger.tsx src/components/PlanForm.tsx src/index.css
git commit -m "feat: add per-trip ledger directory"
```

### Task 7: 品牌统一与发布验证

**Files:**
- Modify: `index.html`
- Modify: `src/**`
- Modify: `api/**`
- Modify: `miniprogram/**`
- Modify: `public/mascot.svg`
- Modify: `supabase/**`
- Modify: `docs/*.md`
- Modify: `DEPLOY.md`
- Modify: `travel-companion-notion.md`

**Interfaces:**
- Produces: 所有用户可见品牌文案为“丸玩”。
- Preserves: 所有 `wanwan` 技术标识。

- [ ] **Step 1: 运行品牌扫描并确认旧名称仍存在**

Run:

```bash
git grep -n '丸丸' -- index.html src api miniprogram public supabase DEPLOY.md travel-companion-notion.md 'docs/*.md'
```

Expected: 命令成功并列出旧品牌位置。

- [ ] **Step 2: 执行机械替换并保护内部标识**

对测试覆盖的文件把中文 `丸丸` 机械替换为 `丸玩`。不要替换小写 `wanwan`、域名、Cookie、邮箱后缀、包名或仓库名。设计与实施计划保留历史上下文，不参与机械替换测试。

再次检查：

```bash
git grep -n '丸丸' -- index.html src api miniprogram public supabase DEPLOY.md travel-companion-notion.md 'docs/*.md'
git grep -n 'wanwantrip.online\\|wanwan_wechat\\|wechat.wanwan.invalid'
```

第一条应无输出；第二条必须仍有输出。

- [ ] **Step 3: 完整验证**

Run:

```bash
pnpm test
pnpm build
git diff --check
```

Expected: 测试和构建全部通过，无空白错误。

- [ ] **Step 4: 浏览器验收**

本地运行 `pnpm dev`，在 375、390、430px 和桌面宽度依次检查：

- “这周末去日本”先追问出发城市、具体目的城市、天数冲突和同行人；
- 补齐后每天有连续日期；
- 预报范围内每天显示温度和整行天气幕布；
- 一个月后的日期不显示天气；
- 日本行程账本为空或只含日本账，香港旧账只在“历史未归档”；
- 所有用户可见品牌为“丸玩”。

- [ ] **Step 5: 提交**

```bash
git add index.html src api miniprogram public supabase docs DEPLOY.md travel-companion-notion.md
git commit -m "feat: rename product to 丸玩"
```

- [ ] **Step 6: 推送并验证部署**

```bash
git push -u origin codex/smart-weather-brand
```

确认远端分支包含最新提交；检查 Vercel 对应部署成功后，在部署 URL 重跑浏览器验收。只有部署与线上验收都通过，才报告完成。
