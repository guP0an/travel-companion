# WeChat Unified Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WeChat Official Account OAuth and Open Platform QR login to the existing mini-program login so all three paths reuse the same Supabase user data.

**Architecture:** Keep `/api/wechat-auth` for `wx.login`. Add one `/api/wechat-oauth` GET endpoint for status, OAuth start, and callback; reuse `resolveWechatUser`, then hand the browser to a one-time Supabase Magic Link so the existing web client receives a normal refreshable session.

**Tech Stack:** React 18, TypeScript, Vite, Vercel Functions, Node crypto, Supabase Admin API, Node test runner.

## Global Constraints

- Add no dependencies.
- Never expose or log WeChat code, access token, openid, unionid, AppSecret, Supabase secret key, or JWT private key.
- Accept only same-site relative `returnTo` values.
- Keep existing email, phone, and mini-program login behavior.
- Hide unavailable web WeChat login modes instead of showing a false working entry.

---

### Task 1: OAuth Security and Provider Helpers

**Files:**
- Create: `api/wechat-oauth.ts`
- Test: `tests/wechat-oauth.test.mjs`

**Interfaces:**
- Produces: `sanitizeReturnTo(value: unknown): string`
- Produces: `createOauthState(mode: 'h5' | 'web', returnTo: string, secret: string, now?: number): string`
- Produces: `verifyOauthState(value: string, secret: string, now?: number): { mode: 'h5' | 'web'; returnTo: string }`
- Produces: `buildWechatAuthorizeUrl(mode, state, callbackUrl, env): string`
- Produces: `exchangeWechatOauthCode(mode, code, env, fetcher?): Promise<{ openid: string; unionid?: string }>`

- [ ] **Step 1: Write failing tests for return paths, state, URLs, and code exchange**

```js
test('OAuth return paths stay on wanwantrip.online', () => {
  assert.equal(sanitizeReturnTo('/?trip=1'), '/?trip=1')
  assert.equal(sanitizeReturnTo('https://evil.example'), '/')
  assert.equal(sanitizeReturnTo('//evil.example'), '/')
})

test('signed OAuth state rejects tampering and expiry', () => {
  const state = createOauthState('h5', '/ledger', stateSecret, now)
  assert.deepEqual(verifyOauthState(state, stateSecret, now), { mode: 'h5', returnTo: '/ledger' })
  assert.throws(() => verifyOauthState(`${state}x`, stateSecret, now), WechatOauthError)
  assert.throws(() => verifyOauthState(state, stateSecret, now + 601_000), WechatOauthError)
})

test('H5 and PC authorization URLs use their own app credentials', () => {
  const h5 = new URL(buildWechatAuthorizeUrl('h5', 'state', callbackUrl, env))
  const web = new URL(buildWechatAuthorizeUrl('web', 'state', callbackUrl, env))
  assert.equal(h5.pathname, '/connect/oauth2/authorize')
  assert.equal(h5.searchParams.get('scope'), 'snsapi_base')
  assert.equal(web.pathname, '/connect/qrconnect')
  assert.equal(web.searchParams.get('scope'), 'snsapi_login')
})
```

- [ ] **Step 2: Compile and run the test to verify RED**

Run: `pnpm exec tsc -b && node --test tests/wechat-oauth.test.mjs`  
Expected: FAIL because `api/wechat-oauth.ts` or its exports do not exist.

- [ ] **Step 3: Implement the minimum provider helpers**

Use `createHmac`, `randomBytes`, `timingSafeEqual`, `Buffer` and `URLSearchParams`. State payload is base64url JSON:

```ts
type OauthMode = 'h5' | 'web'
type OauthState = { mode: OauthMode; returnTo: string; expiresAt: number; nonce: string }

export function sanitizeReturnTo(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}
```

Sign the encoded payload with HMAC-SHA256. Reject missing secrets shorter than 16 characters, malformed payloads, signature mismatch, unsupported modes, and states older than ten minutes.

Use these provider settings:

```ts
const provider = mode === 'h5'
  ? { appId: env.WECHAT_H5_APP_ID, appSecret: env.WECHAT_H5_APP_SECRET }
  : { appId: env.WECHAT_WEB_APP_ID, appSecret: env.WECHAT_WEB_APP_SECRET }
```

Exchange callback code through `https://api.weixin.qq.com/sns/oauth2/access_token` with `grant_type=authorization_code`. Return only `openid` and optional `unionid`.

- [ ] **Step 4: Run targeted tests**

Run: `pnpm exec tsc -b && node --test tests/wechat-oauth.test.mjs`  
Expected: all Task 1 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/wechat-oauth.ts tests/wechat-oauth.test.mjs
git commit -m "feat: add secure WeChat OAuth helpers"
```

### Task 2: OAuth Callback and Supabase Session Handoff

**Files:**
- Modify: `api/wechat-auth.ts`
- Modify: `api/wechat-oauth.ts`
- Modify: `tests/wechat-oauth.test.mjs`
- Test: `tests/wechat-auth.test.mjs`

**Interfaces:**
- Consumes: `resolveWechatUser(identity, pepper, store)`
- Produces: `createWechatMagicLink(userId: string, returnTo: string, env: Env): Promise<string>`
- Produces: `handleWechatOauthRequest(req, res, env, fetcher?): Promise<void>`

- [ ] **Step 1: Write failing handler tests**

```js
test('status exposes availability without secrets', async () => {
  const response = await runHandler('/api/wechat-oauth?mode=status', configuredEnv)
  assert.deepEqual(response.json, { h5: true, web: true })
})

test('OAuth start sets HttpOnly state and redirects to WeChat', async () => {
  const response = await runHandler('/api/wechat-oauth?mode=h5&returnTo=%2Fledger', configuredEnv)
  assert.equal(response.statusCode, 302)
  assert.match(response.headers['set-cookie'], /HttpOnly/)
  assert.match(response.headers.location, /^https:\/\/open\.weixin\.qq\.com\//)
})

test('callback rejects a state that does not match its cookie', async () => {
  const response = await runHandler('/api/wechat-oauth?mode=h5&code=validcode&state=signed', configuredEnv)
  assert.equal(response.statusCode, 302)
  assert.match(response.headers.location, /wechat=failed/)
})

test('callback resolves the WeChat user and redirects through Supabase verify', async () => {
  const response = await runCompleteCallback({ mode: 'web', returnTo: '/ledger' })
  assert.equal(response.statusCode, 302)
  assert.match(response.headers.location, /\/auth\/v1\/verify/)
  assert.match(response.headers.location, /redirect_to=/)
})
```

- [ ] **Step 2: Run targeted tests to verify RED**

Run: `pnpm exec tsc -b && node --test tests/wechat-oauth.test.mjs tests/wechat-auth.test.mjs`  
Expected: FAIL because the handler and Magic Link handoff are missing.

- [ ] **Step 3: Reuse the existing Supabase store**

Export the environment type and a `createSupabaseAdmin(env)` helper from `api/wechat-auth.ts`; have `createSupabaseWechatStore` call it. New WeChat users receive a confirmed unique server-only email ending in `@wechat.wanwan.invalid`.

For existing users without an email, `createWechatMagicLink` must:

```ts
const { data } = await admin.auth.admin.getUserById(userId)
const email = data.user?.email || `${userId}@wechat.wanwan.invalid`
if (!data.user?.email) {
  await admin.auth.admin.updateUserById(userId, { email, email_confirm: true })
}
const { data: link } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo: `${origin}${safeReturnTo}` },
})
return link.properties.action_link
```

Check every Supabase error and throw `WechatOauthError(502, ...)`; never return a generated email to the UI.

- [ ] **Step 4: Implement GET status, start, and callback**

- `mode=status`: return `{ h5: Boolean(H5 credentials), web: Boolean(web credentials) }`.
- OAuth start: create state, set `wanwan_wechat_oauth_state` with `HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/api/wechat-oauth`, then redirect.
- OAuth callback: require query state to equal cookie state, verify signature, exchange code, resolve user, create Magic Link, clear cookie, redirect.
- Failure: clear cookie and redirect to `${origin}/?wechat=failed`; do not include provider error text.
- Only trust `WECHAT_OAUTH_ORIGIN`, defaulting to `https://wanwantrip.online`.

- [ ] **Step 5: Run targeted and existing WeChat tests**

Run: `pnpm exec tsc -b && node --test tests/wechat-oauth.test.mjs tests/wechat-auth.test.mjs tests/wechat-client-auth.test.mjs`  
Expected: all WeChat tests PASS.

- [ ] **Step 6: Commit**

```bash
git add api/wechat-auth.ts api/wechat-oauth.ts tests/wechat-auth.test.mjs tests/wechat-oauth.test.mjs
git commit -m "feat: connect WeChat OAuth to Supabase sessions"
```

### Task 3: Web WeChat Login Entry

**Files:**
- Modify: `shared/auth.ts`
- Modify: `src/components/AuthBar.tsx`
- Modify: `src/index.css`
- Modify: `tests/api-security.test.mjs`
- Create: `tests/wechat-web-ui.test.mjs`

**Interfaces:**
- Produces: `getWechatLoginMode(userAgent: string, availability: { h5: boolean; web: boolean }): 'h5' | 'web' | null`
- Consumes: `GET /api/wechat-oauth?mode=status`

- [ ] **Step 1: Write failing mode and UI tests**

```js
test('WeChat browsers prefer Official Account OAuth', () => {
  assert.equal(getWechatLoginMode('MicroMessenger/8.0', { h5: true, web: true }), 'h5')
})

test('desktop browsers use QR login and unavailable modes stay hidden', () => {
  assert.equal(getWechatLoginMode('Chrome', { h5: true, web: true }), 'web')
  assert.equal(getWechatLoginMode('Chrome', { h5: true, web: false }), null)
})

test('the account panel includes one environment-aware WeChat action', () => {
  assert.match(authBarSource, /微信扫码登录/)
  assert.match(authBarSource, /微信登录/)
  assert.match(authBarSource, /api\/wechat-oauth\?mode=status/)
})
```

Also assert `maskAccount(null, '<uuid>@wechat.wanwan.invalid') === '微信用户'`.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm exec tsc -b && node --test tests/api-security.test.mjs tests/wechat-web-ui.test.mjs`  
Expected: FAIL because the helper and UI are missing.

- [ ] **Step 3: Add the minimum UI behavior**

- Fetch OAuth availability when the account panel mounts.
- Choose H5 or web mode from `navigator.userAgent`.
- Render one full-width button above the existing auth tabs.
- On click assign `window.location.href` to `/api/wechat-oauth?mode=${mode}&returnTo=${encodeURIComponent(path + search)}`.
- Read `wechat=failed` once and show “微信登录暂时没有成功，请稍后重试”.
- Label H5 as “微信登录” and desktop as “微信扫码登录”.
- Add only the divider/button CSS needed to match the existing popover.

