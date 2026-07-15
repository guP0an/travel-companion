import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { SignJWT, importJWK, type JWK } from 'jose'

type Env = Record<string, string | undefined>
type FetchLike = typeof fetch

interface WechatCodeSession {
  openid?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

export interface WechatAccountStore {
  findUserId(openidHash: string, unionidHash?: string): Promise<string | null>
  createUser(): Promise<string>
  bindIdentity(userId: string, openidHash: string, unionidHash?: string): Promise<boolean>
  touchIdentity(userId: string): Promise<void>
  deleteUser(userId: string): Promise<void>
}

const MAX_BODY_BYTES = 4 * 1024
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

export class WechatAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function validateWechatCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{6,256}$/.test(value)) {
    throw new WechatAuthError(400, 'invalid wechat login code')
  }
  return value
}

export function hashWechatIdentifier(value: string, pepper: string): string {
  if (pepper.length < 16) throw new WechatAuthError(503, 'wechat identity pepper missing')
  return createHmac('sha256', pepper).update(value).digest('hex')
}

export async function exchangeWechatCode(code: string, env: Env, fetcher: FetchLike = fetch) {
  const appId = env.WECHAT_APP_ID
  const appSecret = env.WECHAT_APP_SECRET
  if (!appId || !appSecret) throw new WechatAuthError(503, 'wechat app config missing')

  const params = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    js_code: validateWechatCode(code),
    grant_type: 'authorization_code',
  })
  const response = await fetcher(`https://api.weixin.qq.com/sns/jscode2session?${params}`, {
    signal: AbortSignal.timeout(5_000),
  })
  const data = await response.json() as WechatCodeSession
  if (!response.ok || data.errcode || !data.openid) {
    throw new WechatAuthError(401, `wechat code exchange failed: ${data.errcode || response.status}`)
  }
  return { openid: data.openid, unionid: data.unionid }
}

export async function resolveWechatUser(
  identity: { openid: string; unionid?: string },
  pepper: string,
  store: WechatAccountStore,
) {
  const openidHash = hashWechatIdentifier(identity.openid, pepper)
  const unionidHash = identity.unionid ? hashWechatIdentifier(identity.unionid, pepper) : undefined
  const existingUserId = await store.findUserId(openidHash, unionidHash)
  if (existingUserId) {
    await store.touchIdentity(existingUserId)
    return existingUserId
  }

  const createdUserId = await store.createUser()
  const inserted = await store.bindIdentity(createdUserId, openidHash, unionidHash)
  if (inserted) return createdUserId

  const winnerUserId = await store.findUserId(openidHash, unionidHash)
  await store.deleteUser(createdUserId)
  if (!winnerUserId) throw new WechatAuthError(502, 'wechat account binding failed')
  await store.touchIdentity(winnerUserId)
  return winnerUserId
}

export async function mintSupabaseAccessToken(userId: string, env: Env, now = new Date()) {
  const supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const privateJwkText = env.SUPABASE_JWT_PRIVATE_JWK
  if (!supabaseUrl || !privateJwkText) throw new WechatAuthError(503, 'Supabase JWT config missing')

  let privateJwk: JWK
  try {
    privateJwk = JSON.parse(privateJwkText) as JWK
  } catch {
    throw new WechatAuthError(503, 'invalid Supabase JWT key')
  }
  if (privateJwk.kty !== 'EC' || privateJwk.crv !== 'P-256' || !privateJwk.d || !privateJwk.kid) {
    throw new WechatAuthError(503, 'Supabase JWT key must be an imported ES256 private JWK')
  }

  const ttl = Math.min(Math.max(Number(env.WECHAT_TOKEN_TTL_SECONDS) || DEFAULT_TOKEN_TTL_SECONDS, 300), 86_400)
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const key = await importJWK(privateJwk, 'ES256')
  return new SignJWT({ role: 'authenticated', app_metadata: { provider: 'wechat' } })
    .setProtectedHeader({ alg: 'ES256', kid: privateJwk.kid, typ: 'JWT' })
    .setIssuer(`${supabaseUrl}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(userId)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ttl)
    .sign(key)
}

export function createSupabaseWechatStore(env: Env): WechatAccountStore {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const secretKey = env.SUPABASE_SECRET_KEY
  if (!url || !secretKey) throw new WechatAuthError(503, 'Supabase admin config missing')
  const client = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })

  return {
    async findUserId(openidHash, unionidHash) {
      const find = async (column: 'openid_hash' | 'unionid_hash', value: string) => {
        const { data, error } = await client
          .from('wechat_identities')
          .select('user_id')
          .eq(column, value)
          .maybeSingle()
        if (error) throw error
        return data?.user_id as string | undefined
      }
      return await find('openid_hash', openidHash)
        || (unionidHash ? await find('unionid_hash', unionidHash) : null)
        || null
    },
    async createUser() {
      const { data, error } = await client.auth.admin.createUser({
        app_metadata: { provider: 'wechat', providers: ['wechat'] },
        user_metadata: { source: 'wechat-mini-program' },
      })
      if (error || !data.user) throw error || new Error('Supabase user creation failed')
      return data.user.id
    },
    async bindIdentity(userId, openidHash, unionidHash) {
      const { error } = await client.from('wechat_identities').insert({
        user_id: userId,
        openid_hash: openidHash,
        unionid_hash: unionidHash || null,
      })
      if (!error) return true
      if (error.code === '23505') return false
      throw error
    },
    async touchIdentity(userId) {
      const { error } = await client
        .from('wechat_identities')
        .update({ last_login_at: new Date().toISOString() })
        .eq('user_id', userId)
      if (error) throw error
    },
    async deleteUser(userId) {
      const { error } = await client.auth.admin.deleteUser(userId)
      if (error) throw error
    },
  }
}

export async function authenticateWechatCode(
  code: string,
  env: Env,
  fetcher: FetchLike = fetch,
  store: WechatAccountStore = createSupabaseWechatStore(env),
) {
  const identity = await exchangeWechatCode(code, env, fetcher)
  const userId = await resolveWechatUser(identity, env.WECHAT_IDENTITY_PEPPER || '', store)
  const accessToken = await mintSupabaseAccessToken(userId, env)
  const expiresIn = Math.min(
    Math.max(Number(env.WECHAT_TOKEN_TTL_SECONDS) || DEFAULT_TOKEN_TTL_SECONDS, 300),
    86_400,
  )
  return { accessToken, expiresIn, userId }
}

function allowLogin(ip: string, now = Date.now()) {
  const current = loginAttempts.get(ip)
  if (!current || current.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  current.count += 1
  return current.count <= 10
}

export async function handleWechatAuthRequest(req: any, res: any, env: Env, fetcher: FetchLike = fetch) {
  res.setHeader('content-type', 'application/json')
  if (req.method !== 'POST') {
    res.statusCode = 405
    return res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }))
  }
  try {
    const contentLength = Number(req.headers?.['content-length'] || 0)
    if (contentLength > MAX_BODY_BYTES) throw new WechatAuthError(413, 'request too large')
    const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
    if (!allowLogin(ip)) throw new WechatAuthError(429, 'rate limit exceeded')
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const result = await authenticateWechatCode(validateWechatCode(body.code), env, fetcher)
    return res.end(JSON.stringify(result))
  } catch (error) {
    const status = error instanceof WechatAuthError ? error.status : 502
    res.statusCode = status
    console.error('[api/wechat-auth]', { status, error: (error as Error).message })
    return res.end(JSON.stringify({
      ok: false,
      friendlyMessage: status === 429 ? '登录有点频繁，请稍后再试' : '微信登录暂时没有成功，请稍后重试',
    }))
  }
}

export const config = { maxDuration: 10 }

export default async function handler(req: any, res: any) {
  return handleWechatAuthRequest(req, res, process.env)
}
