# Mobile Layout and WeChat Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web planner task-first on phones and finish the reusable, tested WeChat mini-program login session flow.

**Architecture:** Keep the desktop two-column planner intact and use an explicit `has-itinerary` state class plus mobile-only CSS to remove the empty result panel and compress the planner. Keep WeChat authentication server-side as implemented; harden the mini-program client session boundary so only valid tokens are exposed and future API calls receive a standard bearer header.

**Tech Stack:** React 18, TypeScript, Vite, CSS media queries, WeChat Mini Program JavaScript, Vercel Functions, Supabase Auth, Node test runner.

## Global Constraints

- PC web QR login and WeChat H5 OAuth are out of scope.
- Desktop remains a two-column planner.
- AppSecret, Supabase secret key, and JWT private key remain server-only.
- The mini-program must use `wx.login`; it must never retain WeChat `session_key`.
- Production activation still requires a real AppID, AppSecret, legal request domain, and Supabase ES256 signing key.
- No new runtime dependency is introduced.

---

### Task 1: Mobile Task-First Planner

**Files:**
- Create: `tests/mobile-layout.test.mjs`
- Modify: `src/App.tsx`
- Modify: `src/components/PlanForm.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: React state `generated: boolean` in `App`.
- Produces: `planner-workspace has-itinerary` when a result exists; named mobile form rows; CSS that hides only the empty mobile result while preserving desktop behavior.

- [ ] **Step 1: Write the failing mobile layout contract test**

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('mobile planner hides the empty result panel and exposes compact form hooks', () => {
  assert.match(app, /planner-workspace.*has-itinerary/)
  assert.match(css, /planner-workspace:not\(\.has-itinerary\) \.itinerary-workspace/)
  assert.match(css, /@media \(max-width: 820px\)/)
  assert.match(css, /\.plan-options-row/)
  assert.match(css, /\.plan-upload-row/)
})

test('desktop empty itinerary remains available', () => {
  assert.match(app, /className="itinerary-empty"/)
  assert.doesNotMatch(css, /^\.planner-workspace:not\(\.has-itinerary\) \.itinerary-workspace/m)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/mobile-layout.test.mjs`  
Expected: FAIL because `has-itinerary`, `.plan-options-row`, and `.plan-upload-row` do not exist.

- [ ] **Step 3: Add explicit state and layout hooks**

In `src/App.tsx`, make the workspace class stateful and make the mobile heading a single readable phrase without changing desktop copy:

```tsx
<main className={`planner-workspace${generated ? ' has-itinerary' : ''}`} hidden={view !== 'plan'}>
  <h1 className="font-serif">
    把想去的地方<span className="planner-title-break"><br /></span>交给丸丸
  </h1>
</main>
```

In `src/components/PlanForm.tsx`, replace anonymous spacing utilities on the day, pace, and upload rows with stable hooks:

```tsx
<div className="plan-options-row flex items-center gap-2">...</div>
<div className="plan-pace-row flex gap-5">...</div>
<div className="plan-upload-row">...</div>
```

- [ ] **Step 4: Add the mobile layout rules**

Inside the existing `@media (max-width: 820px)` block in `src/index.css`:

```css
.planner-sidebar { padding: 24px 22px 28px; }
.planner-intro { margin-bottom: 20px; }
.planner-intro .section-eyebrow { display: none; }
.planner-intro h1 { margin: 0 0 10px; font-size: 27px; line-height: 1.3; }
.planner-title-break { display: none; }
.planner-intro p { font-size: 12.5px; line-height: 1.7; }
.plan-options-row, .plan-pace-row { margin-top: 12px; }
.plan-upload-row { margin-top: 18px; }
.plan-primary { margin-top: 22px; }
.planner-status { margin-top: 20px; padding-top: 14px; }
.planner-workspace:not(.has-itinerary) .itinerary-workspace { display: none; }
.planner-workspace.has-itinerary .planner-sidebar { padding-bottom: 30px; }
```

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/mobile-layout.test.mjs`  
Expected: PASS.

Run: `pnpm test`  
Expected: all TypeScript builds and all tests PASS.

- [ ] **Step 6: Commit the mobile layout**

```bash
git add tests/mobile-layout.test.mjs src/App.tsx src/components/PlanForm.tsx src/index.css
git commit -m "feat: streamline the mobile planner"
```

---

### Task 2: WeChat Mini-Program Session Boundary

**Files:**
- Create: `tests/wechat-client-auth.test.mjs`
- Modify: `miniprogram/services/auth.js`
- Modify: `miniprogram/pages/login/login.js`
- Modify: `miniprogram/pages/login/login.wxml`

**Interfaces:**
- Consumes: `/api/wechat-auth` response `{ accessToken: string, userId: string, expiresIn: number }`.
- Produces: `readSession(): Session | null`, `loginWithWechat(): Promise<Session>`, `ensureWechatSession(): Promise<Session>`, `getAuthorizationHeader(): Promise<{ Authorization: string }>`, and `clearWechatSession(): void`.

- [ ] **Step 1: Write failing client session tests**

Use `node:vm` to execute the WeChat CommonJS service with a deterministic `wx` mock. Cover these behaviors with separate tests:

```js
test('expired WeChat sessions are removed and never reported as logged in', () => {
  const { auth, storage } = loadAuth({
    stored: { accessToken: 'old', userId: 'u1', expiresAt: NOW - 1 },
  })
  assert.equal(auth.readSession(), null)
  assert.equal(storage.has('wanwan_wechat_session'), false)
})

test('a successful wx.login exchange is stored without session_key', async () => {
  const { auth, storedValues } = loadAuth({ code: 'wx-code', accessToken: 'token', userId: 'u1', expiresIn: 3600 })
  const session = await auth.loginWithWechat()
  assert.equal(session.accessToken, 'token')
  assert.equal('sessionKey' in session, false)
  assert.equal(storedValues.length, 1)
})

test('authenticated API headers use a valid cached bearer token', async () => {
  const { auth } = loadAuth({ stored: { accessToken: 'token', userId: 'u1', expiresAt: NOW + 3600_000 } })
  assert.deepEqual(await auth.getAuthorizationHeader(), { Authorization: 'Bearer token' })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/wechat-client-auth.test.mjs`  
Expected: FAIL because expired sessions are returned and `getAuthorizationHeader` is missing.

- [ ] **Step 3: Implement valid-session reading and bearer headers**

Update `miniprogram/services/auth.js`:

```js
const isSessionValid = (session, marginMs = 0) => Boolean(
  session?.accessToken
  && session?.userId
  && Number.isFinite(session?.expiresAt)
  && session.expiresAt > Date.now() + marginMs
)

const readSession = () => {
  const session = wx.getStorageSync(SESSION_KEY) || null
  if (isSessionValid(session)) return session
  if (session) wx.removeStorageSync(SESSION_KEY)
  return null
}

const getAuthorizationHeader = async () => {
  const session = await ensureWechatSession()
  return { Authorization: `Bearer ${session.accessToken}` }
}
```

Export `isSessionValid` and `getAuthorizationHeader` for reuse and tests. Keep the existing five-minute refresh margin in `ensureWechatSession`.

- [ ] **Step 4: Make login UI state derive from a valid session**

In `miniprogram/pages/login/login.js`, keep `onLoad` based on the hardened `readSession`. In `login.wxml`, keep one primary action and use user-facing copy:

```xml
<button wx:if="{{!loggedIn}}" class="login-button" loading="{{busy}}" disabled="{{busy}}" bindtap="handleLogin">
  微信一键登录
</button>
<view wx:else class="success-line">微信已登录，行程和账本会同步保存</view>
```

- [ ] **Step 5: Run focused and full tests**

Run: `node --test tests/wechat-client-auth.test.mjs tests/wechat-auth.test.mjs`  
Expected: all WeChat client and server tests PASS.

Run: `pnpm test`  
Expected: all tests PASS.

- [ ] **Step 6: Commit the WeChat client boundary**

```bash
git add tests/wechat-client-auth.test.mjs miniprogram/services/auth.js miniprogram/pages/login/login.js miniprogram/pages/login/login.wxml
git commit -m "feat: complete mini program WeChat session flow"
```

---

### Task 3: Documentation, Visual QA, and Production Readiness

**Files:**
- Modify: `docs/12-wechat-mini-program.md`
- Modify: `docs/13-mobile-wechat-login-design.md`
- Modify: `docs/00-README.md`

**Interfaces:**
- Consumes: the mobile CSS hooks and WeChat client interfaces from Tasks 1 and 2.
- Produces: current setup instructions, verification evidence, and an explicit list of external production blockers.

- [ ] **Step 1: Update documentation with implemented behavior**

Record:

```markdown
- Mobile web: empty itinerary is hidden before generation at widths <= 820px.
- Mini-program: cached sessions are accepted only before expiry and authenticated requests use `Authorization: Bearer <token>`.
- Production still needs the real AppID/AppSecret, `wanwantrip.online` request-domain approval, and Supabase ES256 signing configuration.
- PC QR login and H5 OAuth remain separate future work.
```

- [ ] **Step 2: Run all automated verification**

Run: `pnpm test && pnpm build`  
Expected: both commands exit 0.

- [ ] **Step 3: Start the local preview and inspect phone layouts**

Run: `pnpm dev --host 127.0.0.1`  
Expected: Vite prints a local URL.

Inspect at `375x812`, `390x844`, `430x932`, and desktop `1440x900`:

- no horizontal overflow;
- title, input, day/pace controls, upload action, and primary CTA are visible without the former empty-result page;
- after generating a result, the itinerary is reachable and the bottom action bar does not cover content;
- desktop remains two columns.

- [ ] **Step 4: Inspect mini-program login in WeChat DevTools**

Expected before production credentials: the code compiles and the UI has one clear login action.  
Expected after credentials: login succeeds, returning the same `userId` on repeated login and exposing a valid bearer token.

- [ ] **Step 5: Commit docs and verification notes**

```bash
git add docs/00-README.md docs/12-wechat-mini-program.md docs/13-mobile-wechat-login-design.md
git commit -m "docs: record mobile and WeChat login readiness"
```

- [ ] **Step 6: Push the branch**

Run: `git push origin codex/expense-receipts`  
Expected: remote branch advances to the final verified commit.
