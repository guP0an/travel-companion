import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  createSupabaseAdmin,
  createSupabaseWechatStore,
  resolveWechatUser,
  type Env,
  type WechatAccountStore,
} from './wechat-auth.js'

export type WechatOauthMode = 'h5' | 'web'
export type WechatOauthEnv = Record<string, string | undefined>
type FetchLike = typeof fetch

interface OauthState {
  mode: WechatOauthMode
  returnTo: string
  expiresAt: number
  nonce: string
}

interface WechatOauthTokenResponse {
  openid?: string
  unionid?: string
  errcode?: number
}

const STATE_TTL_MS = 10 * 60 * 1000

export class WechatOauthError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function sanitizeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

function requireStateSecret(secret: string) {
  if (secret.length < 16) throw new WechatOauthError(503, 'wechat OAuth state secret missing')
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export function createOauthState(
  mode: WechatOauthMode,
  returnTo: string,
  secret: string,
  now = Date.now(),
): string {
  requireStateSecret(secret)
  const payload: OauthState = {
    mode,
    returnTo: sanitizeReturnTo(returnTo),
    expiresAt: now + STATE_TTL_MS,
    nonce: randomBytes(16).toString('base64url'),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${sign(encoded, secret)}`
}

export function verifyOauthState(value: string, secret: string, now = Date.now()) {
  requireStateSecret(secret)
  const [encoded, signature, extra] = value.split('.')
  if (!encoded || !signature || extra) throw new WechatOauthError(401, 'invalid OAuth state')
  const expected = sign(encoded, secret)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (
    actualBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new WechatOauthError(401, 'invalid OAuth state')
  }

  let payload: OauthState
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OauthState
  } catch {
    throw new WechatOauthError(401, 'invalid OAuth state')
  }
  if (
    (payload.mode !== 'h5' && payload.mode !== 'web')
    || payload.expiresAt < now
    || payload.expiresAt > now + STATE_TTL_MS
  ) {
    throw new WechatOauthError(401, 'expired OAuth state')
  }
  return { mode: payload.mode, returnTo: sanitizeReturnTo(payload.returnTo) }
}

function providerConfig(mode: WechatOauthMode, env: WechatOauthEnv) {
  const appId = mode === 'h5' ? env.WECHAT_H5_APP_ID : env.WECHAT_WEB_APP_ID
  const appSecret = mode === 'h5' ? env.WECHAT_H5_APP_SECRET : env.WECHAT_WEB_APP_SECRET
  if (!appId || !appSecret) throw new WechatOauthError(503, 'wechat OAuth provider missing')
  return { appId, appSecret }
}

export function buildWechatAuthorizeUrl(
  mode: WechatOauthMode,
  state: string,
  callbackUrl: string,
  env: WechatOauthEnv,
): string {
  const { appId } = providerConfig(mode, env)
  const url = new URL(mode === 'h5'
    ? 'https://open.weixin.qq.com/connect/oauth2/authorize'
    : 'https://open.weixin.qq.com/connect/qrconnect')
  url.search = new URLSearchParams({
    appid: appId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: mode === 'h5' ? 'snsapi_base' : 'snsapi_login',
    state,
  }).toString()
  url.hash = 'wechat_redirect'
  return url.toString()
}

export async function exchangeWechatOauthCode(
  mode: WechatOauthMode,
  code: string,
  env: WechatOauthEnv,
  fetcher: FetchLike = fetch,
) {
  if (!/^[A-Za-z0-9_-]{6,256}$/.test(code)) throw new WechatOauthError(400, 'invalid OAuth code')
  const { appId, appSecret } = providerConfig(mode, env)
  const params = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    code,
    grant_type: 'authorization_code',
  })
  const response = await fetcher(`https://api.weixin.qq.com/sns/oauth2/access_token?${params}`, {
    signal: AbortSignal.timeout(5_000),
  })
  const data = await response.json() as WechatOauthTokenResponse
  if (!response.ok || data.errcode || !data.openid) {
    throw new WechatOauthError(401, 'wechat OAuth code exchange failed')
  }
  return { openid: data.openid, unionid: data.unionid }
}

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>
type MagicLinkFactory = (
  userId: string,
  returnTo: string,
  env: Env,
) => Promise<string>

function oauthOrigin(env: WechatOauthEnv) {
  const origin = new URL(env.WECHAT_OAUTH_ORIGIN || 'https://wanwantrip.online')
  if (origin.pathname !== '/' || origin.search || origin.hash) {
    throw new WechatOauthError(503, 'invalid OAuth origin')
  }
  return origin.origin
}

function resultUrl(origin: string, returnTo: string, result: 'success' | 'failed') {
  const url = new URL(sanitizeReturnTo(returnTo), origin)
  url.searchParams.set('wechat', result)
  return url.toString()
}

export async function createWechatMagicLink(
  userId: string,
  returnTo: string,
  env: Env,
  admin: SupabaseAdmin = createSupabaseAdmin(env),
) {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  if (!supabaseUrl) throw new WechatOauthError(503, 'Supabase URL missing')
  const { data: current, error: getError } = await admin.auth.admin.getUserById(userId)
  if (getError || !current.user) throw new WechatOauthError(502, 'Supabase user lookup failed')

  const email = current.user.email || `${userId}@wechat.wanwan.invalid`
  if (!current.user.email) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    })
    if (error) throw new WechatOauthError(502, 'Supabase user update failed')
  }

  const redirectTo = resultUrl(oauthOrigin(env), returnTo, 'success')
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  })
  const actionLink = data.properties?.action_link
  if (error || !actionLink) throw new WechatOauthError(502, 'Supabase login link failed')

  const actionUrl = new URL(actionLink)
  if (
    actionUrl.origin !== new URL(supabaseUrl).origin
    || actionUrl.pathname !== '/auth/v1/verify'
  ) {
    throw new WechatOauthError(502, 'invalid Supabase login link')
  }
  return actionUrl.toString()
}

function queryValue(req: any, name: string) {
  const value = req.query?.[name]
  return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : ''
}

function readCookie(req: any, name: string) {
  const prefix = `${name}=`
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const value = part.trim()
    if (!value.startsWith(prefix)) continue
    try {
      return decodeURIComponent(value.slice(prefix.length))
    } catch {
      return ''
    }
  }
  return ''
}

function stateCookie(value: string, maxAge = 600) {
  return `wanwan_wechat_oauth_state=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Path=/api/wechat-oauth`
}

function redirect(res: any, location: string) {
  res.statusCode = 302
  res.setHeader('location', location)
  return res.end()
}

function isMode(value: string): value is WechatOauthMode {
  return value === 'h5' || value === 'web'
}

function providerAvailable(mode: WechatOauthMode, env: WechatOauthEnv) {
  return mode === 'h5'
    ? Boolean(env.WECHAT_H5_APP_ID && env.WECHAT_H5_APP_SECRET)
    : Boolean(env.WECHAT_WEB_APP_ID && env.WECHAT_WEB_APP_SECRET)
}

export async function handleWechatOauthRequest(
  req: any,
  res: any,
  env: Env,
  fetcher: FetchLike = fetch,
  store?: WechatAccountStore,
  magicLinkFactory: MagicLinkFactory = createWechatMagicLink,
  now = Date.now(),
) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }))
  }

  const requestedMode = queryValue(req, 'mode')
  if (requestedMode === 'status') {
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({
      h5: providerAvailable('h5', env),
      web: providerAvailable('web', env),
    }))
  }

  let returnTo = sanitizeReturnTo(queryValue(req, 'returnTo'))
  try {
    if (!isMode(requestedMode)) throw new WechatOauthError(400, 'invalid OAuth mode')
    const origin = oauthOrigin(env)
    const code = queryValue(req, 'code')
    const state = queryValue(req, 'state')

    if (!code) {
      const createdState = createOauthState(
        requestedMode,
        returnTo,
        env.WECHAT_OAUTH_STATE_SECRET || '',
        now,
      )
      const callback = new URL('/api/wechat-oauth', origin)
      callback.searchParams.set('mode', requestedMode)
      res.setHeader('set-cookie', stateCookie(createdState))
      return redirect(res, buildWechatAuthorizeUrl(requestedMode, createdState, callback.toString(), env))
    }

    const cookieState = readCookie(req, 'wanwan_wechat_oauth_state')
    if (!state || !cookieState || state !== cookieState) {
      throw new WechatOauthError(401, 'OAuth state cookie mismatch')
    }
    const verified = verifyOauthState(state, env.WECHAT_OAUTH_STATE_SECRET || '', now)
    if (verified.mode !== requestedMode) throw new WechatOauthError(401, 'OAuth mode mismatch')
    returnTo = verified.returnTo

    const identity = await exchangeWechatOauthCode(requestedMode, code, env, fetcher)
    const userId = await resolveWechatUser(
      identity,
      env.WECHAT_IDENTITY_PEPPER || '',
      store || createSupabaseWechatStore(env),
    )
    const actionLink = await magicLinkFactory(userId, returnTo, env)
    res.setHeader('set-cookie', stateCookie('', 0))
    return redirect(res, actionLink)
  } catch (error) {
    const status = error instanceof WechatOauthError ? error.status : 502
    console.error('[api/wechat-oauth]', { status })
    res.setHeader('set-cookie', stateCookie('', 0))
    return redirect(res, resultUrl(oauthOrigin(env), returnTo, 'failed'))
  }
}

export const config = { maxDuration: 10 }

export default async function handler(req: any, res: any) {
  return handleWechatOauthRequest(req, res, process.env)
}
