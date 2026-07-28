# Ledger Receipt Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user photograph or upload one receipt, edit the AI-prefilled expense fields, and explicitly confirm it into the active trip ledger.

**Architecture:** Add a receipt-specific operation to the existing authenticated `/api/ai` endpoint and reuse its Kimi vision request. Reuse the current browser image compression, `Ledger` form state, `addExpense`, `spent_at`, and private `expense-receipts` storage; no schema or dependency changes.

**Tech Stack:** React 18, TypeScript, Vite, Vercel Node function, Kimi K2.6, Supabase, Node test runner.

## Global Constraints

- Process one image at a time.
- Recognition only prefills fields; it never writes an expense automatically.
- The user can edit category, amount, date, and note before confirmation.
- Save the expense and private receipt only after “确认记账”.
- Keep the selected image and manual form available when recognition fails.
- Save only to the selected `itinerary_id`.
- Accept JPEG, PNG, and WebP after browser compression; keep the existing 15 MB source and 2 MB data-URL limits.
- Do not add a database migration, OCR provider, currency conversion, batch mode, line-item extraction, or duplicate detection.

---

### Task 1: Receipt-Specific Kimi Vision Operation

**Files:**
- Modify: `api/ai.ts:468-487`
- Modify: `api/ai.ts:604-669`
- Modify: `api/ai.ts:707-743`
- Test: `tests/api-security.test.mjs:4-23`
- Test: `tests/api-security.test.mjs:84-196`

**Interfaces:**
- Consumes: the existing `validateVisionDataUrl(image)`, Kimi environment variables, access-token verification, and `/api/ai` dispatcher.
- Produces: `extractReceiptFromImage(image, env, fetcher): Promise<ReceiptScanResult>` where `ReceiptScanResult` is `{ amount: number | null; spentAt: string; category: '餐饮' | '交通' | '门票' | '住宿' | '购物' | '其他'; merchant: string; note: string; confidence: 'high' | 'medium' | 'low' }`.

- [ ] **Step 1: Write the failing API tests**

Add `extractReceiptFromImage` to the imports and extend request validation:

```js
assert.throws(() => validateApiBody({ op: 'receipt', image: 'https://example.com/receipt.png' }), ApiError)
assert.doesNotThrow(() => validateApiBody({
  op: 'receipt',
  image: `data:image/jpeg;base64,${Buffer.alloc(64, 1).toString('base64')}`,
}))
```

Add a Kimi receipt test that returns malicious and malformed fields:

```js
test('Kimi receipt scan returns only editable ledger fields', async () => {
  const image = `data:image/jpeg;base64,${Buffer.alloc(64, 1).toString('base64')}`
  let request
  const receipt = await extractReceiptFromImage(image, {
    MOONSHOT_API_KEY: 'moonshot-test-key',
    KIMI_VISION_MODEL: 'kimi-k2.6',
  }, async (url, init) => {
    request = { url, init }
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        amount: '1280.50',
        spentAt: '2026-08-02',
        category: '餐饮',
        merchant: '东京寿司店',
        note: '晚餐',
        confidence: 'medium',
        ignored: 'server must drop this',
      }) } }],
    }), { status: 200 })
  })

  assert.equal(request.url, 'https://api.moonshot.cn/v1/chat/completions')
  assert.deepEqual(receipt, {
    amount: 1280.5,
    spentAt: '2026-08-02',
    category: '餐饮',
    merchant: '东京寿司店',
    note: '晚餐',
    confidence: 'medium',
  })
})
```

Also assert invalid values normalize to safe defaults:

```js
assert.deepEqual(normalizeReceiptResult({
  amount: -3,
  spentAt: 'not-a-date',
  category: '娱乐',
  merchant: 123,
  note: 'x'.repeat(400),
  confidence: 'certain',
}), {
  amount: null,
  spentAt: '',
  category: '其他',
  merchant: '',
  note: 'x'.repeat(300),
  confidence: 'low',
})
```

- [ ] **Step 2: Run the API tests and verify they fail**

Run:

```bash
pnpm build
node --test tests/api-security.test.mjs
```

Expected: TypeScript or test import failure because `extractReceiptFromImage` and `normalizeReceiptResult` do not exist and `receipt` is not an allowed operation.

- [ ] **Step 3: Implement the minimal server operation**

In `api/ai.ts`, define the public result type, prompt, and normalizer:

```ts
const RECEIPT_CATEGORIES = ['餐饮', '交通', '门票', '住宿', '购物', '其他'] as const
type ReceiptCategory = typeof RECEIPT_CATEGORIES[number]

export interface ReceiptScanResult {
  amount: number | null
  spentAt: string
  category: ReceiptCategory
  merchant: string
  note: string
  confidence: 'high' | 'medium' | 'low'
}

export const RECEIPT_PROMPT = `你负责识别旅行消费小票。只输出 JSON：
{"amount":number|null,"spentAt":"YYYY-MM-DD或空串","category":"餐饮|交通|门票|住宿|购物|其他","merchant":"","note":"","confidence":"high|medium|low"}。
amount 只取最终实付总额，不要把订单号、税号、时间或单价当金额；看不清就给 null。
merchant 写商家名，note 写简短消费摘要。不要输出姓名、手机号、卡号、订单号、税号或地址。`

export function normalizeReceiptResult(value: any): ReceiptScanResult {
  const amount = Number(value?.amount)
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    spentAt: isString(value?.spentAt) && /^\d{4}-\d{2}-\d{2}$/.test(value.spentAt) ? value.spentAt : '',
    category: RECEIPT_CATEGORIES.includes(value?.category) ? value.category : '其他',
    merchant: cleanAlertText(value?.merchant, 120),
    note: cleanAlertText(value?.note, 300),
    confidence: ['high', 'medium', 'low'].includes(value?.confidence) ? value.confidence : 'low',
  }
}
```

Extract the duplicated Kimi request body from `extractBookingsFromImage` into one local `kimiVision(image, prompt, instruction, env, fetcher)` helper. Keep its current URL, model, headers, JSON mode, image validation, timeout, HTTP check, and empty-content check unchanged. Then implement:

```ts
export async function extractReceiptFromImage(image: string, env: Env, fetcher: FetchLike = fetch) {
  return normalizeReceiptResult(await kimiVision(
    image,
    RECEIPT_PROMPT,
    '识别这张消费小票，只输出规定的 JSON。',
    env,
    fetcher,
  ))
}
```

Allow and dispatch `op: 'receipt'`:

```ts
if (!['intake', 'plan', 'extract', 'vision', 'receipt', 'revise'].includes(body.op)) {
  throw new ApiError(400, 'unknown op')
}
if (body.op === 'vision' || body.op === 'receipt') validateVisionDataUrl(body.image)
```

```ts
if (op === 'receipt') {
  return res.end(JSON.stringify({
    receipt: await extractReceiptFromImage(body.image, env, fetcher),
    provider: 'kimi-k2.6',
  }))
}
```

Include `receipt` in the existing friendly image-recognition failure branch.

- [ ] **Step 4: Run the targeted API tests**

Run:

```bash
pnpm build
node --test tests/api-security.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the API operation**

```bash
git add api/ai.ts tests/api-security.test.mjs
git commit -m "feat: recognize receipt fields with Kimi"
```

---

### Task 2: Editable Receipt Confirmation in the Ledger

**Files:**
- Modify: `src/lib/plan.ts:32-59`
- Modify: `src/lib/plan.ts:103-112`
- Modify: `src/components/PlanForm.tsx:3`
- Modify: `src/components/PlanForm.tsx:62-97`
- Modify: `src/components/Ledger.tsx:1-75`
- Modify: `src/components/Ledger.tsx:138-183`
- Modify: `src/index.css:399-454`
- Modify: `src/index.css:940-941`
- Create: `tests/receipt-scan.test.mjs`

**Interfaces:**
- Consumes: `POST /api/ai` with `{ op: 'receipt', image }`, `compressForVision(file)`, and `addExpense(expense, receiptFiles)`.
- Produces: `scanReceipt(image): Promise<ReceiptScanResult>` and an editable ledger flow that passes `{ itinerary_id, category, amount, note, spent_at }` plus `[file]` only after user confirmation.

- [ ] **Step 1: Write the failing UI wiring test**

Create `tests/receipt-scan.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ledger = readFileSync(new URL('../src/components/Ledger.tsx', import.meta.url), 'utf8')
const plan = readFileSync(new URL('../src/lib/plan.ts', import.meta.url), 'utf8')

test('ledger offers one-shot camera and upload receipt scanning', () => {
  assert.match(ledger, /capture="environment"/)
  assert.match(ledger, />拍小票</)
  assert.match(ledger, />上传图片</)
  assert.match(ledger, /setReceipts\(\[file\]\)/)
  assert.match(plan, /op: 'receipt'/)
})

test('receipt scan only prefills editable fields before explicit confirmation', () => {
  assert.match(ledger, /type="date"/)
  assert.match(ledger, /spent_at: spentAt/)
  assert.match(ledger, /确认记账/)
  assert.match(ledger, /scanReceipt/)
  assert.match(ledger, /addExpense\([^)]*, receipts\)/s)
})
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
node --test tests/receipt-scan.test.mjs
```

Expected: FAIL because the camera action, receipt operation, date field, and confirmation copy do not exist.

- [ ] **Step 3: Reuse the existing image compressor and add the client request**

Move the existing `compressForVision(file)` implementation from `PlanForm.tsx` to an exported function in `src/lib/plan.ts`; update `PlanForm` to import it. Do not change its 15 MB source limit, 1800 px maximum side, white JPEG background, or `0.82` quality.

Add:

```ts
export interface ReceiptScanResult {
  amount: number | null
  spentAt: string
  category: '餐饮' | '交通' | '门票' | '住宿' | '购物' | '其他'
  merchant: string
  note: string
  confidence: 'high' | 'medium' | 'low'
}

export async function scanReceipt(image: string): Promise<ReceiptScanResult> {
  const data = await aiRequest({ op: 'receipt', image })
  return data.receipt as ReceiptScanResult
}
```

- [ ] **Step 4: Implement the editable one-image ledger flow**

In `Ledger`, add `spentAt`, `scanning`, and `scanMessage` state. Replace the multi-image chooser with:

```ts
const chooseReceipt = async (file?: File) => {
  if (!file) return
  setReceipts([file])
  setScanning(true)
  setErr('')
  setScanMessage('正在识别小票…')
  try {
    const result = await scanReceipt(await compressForVision(file))
    setAmount(result.amount ? String(result.amount) : '')
    setSpentAt(result.spentAt)
    setCat(result.category)
    setNote([result.merchant, result.note].filter(Boolean).join(' · '))
    setScanMessage(result.confidence === 'low' ? '请重点核对金额和日期' : '已识别，请核对后确认')
  } catch {
    setScanMessage('没认清，可以手动填写')
  } finally {
    setScanning(false)
  }
}
```

Pass the editable date only on confirmation and keep state on save failure:

```ts
await addExpense({
  itinerary_id: selectedId,
  category: cat,
  amount: value,
  note: note.trim(),
  spent_at: spentAt,
}, receipts)
```

After a successful save, also clear `spentAt` and `scanMessage`.

Render two accessible file inputs:

```tsx
<label>
  拍小票
  <input
    type="file"
    accept="image/*"
    capture="environment"
    onChange={(event) => {
      void chooseReceipt(event.target.files?.[0])
      event.target.value = ''
    }}
  />
</label>
<label>
  上传图片
  <input
    type="file"
    accept="image/*"
    onChange={(event) => {
      void chooseReceipt(event.target.files?.[0])
      event.target.value = ''
    }}
  />
</label>
```

Keep one removable preview. Removing it calls `setReceipts([])` but does not clear the editable fields. Disable recognition actions and confirmation while `scanning` or saving. Change the primary action label and accessible name to “确认记账”.

Use the native date input:

```tsx
<input type="date" value={spentAt} onChange={(event) => setSpentAt(event.target.value)} aria-label="消费日期" />
```

Add the minimum CSS needed for the date/amount/note/confirmation row to wrap at 820 px and for the two receipt actions plus status to remain readable. Reuse the existing paper, ink, line, qing, and seal variables.

```css
.ledger-entry-fields {
  display: grid;
  grid-template-columns: 130px 90px minmax(120px, 1fr) auto;
  align-items: end;
  gap: 12px;
}
.ledger-receipt-picker { flex-wrap: wrap; }
.ledger-scan-status { flex-basis: 100%; }

@media (max-width: 820px) {
  .ledger-entry-fields { grid-template-columns: 1fr 1fr auto; }
  .ledger-entry-fields .ledger-note { grid-column: 1 / 3; }
}
```

- [ ] **Step 5: Run targeted tests and build**

Run:

```bash
node --test tests/receipt-scan.test.mjs
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Run the full release gate**

Run:

```bash
pnpm test
pnpm build
git diff --check
```

Expected: all tests pass, production build completes, and `git diff --check` prints nothing.

- [ ] **Step 7: Commit the ledger flow**

```bash
git add src/lib/plan.ts src/components/PlanForm.tsx src/components/Ledger.tsx src/index.css tests/receipt-scan.test.mjs
git commit -m "feat: confirm editable receipt scans in ledger"
```

---

### Task 3: Live Verification and Delivery

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: the completed local feature and current `codex/smart-weather-brand` branch.
- Produces: browser verification evidence and a pushed branch ready for deployment.

- [ ] **Step 1: Verify the local ledger manually**

Open `http://127.0.0.1:5173/`, sign in, open the current trip ledger, and verify:

1. “拍小票” and “上传图片” are both visible.
2. Selecting one image shows exactly one preview and “正在识别小票…”.
3. A successful result prefills editable amount, date, category, and note.
4. No new ledger row appears before “确认记账”.
5. Editing a field and confirming creates exactly one row in the active trip.
6. The saved private receipt thumbnail opens.
7. A failed recognition keeps the image and permits manual entry.

- [ ] **Step 2: Push the verified branch**

```bash
git push origin codex/smart-weather-brand
```

Expected: remote branch advances to both feature commits.
